import { z } from "zod";
import { CaptchaBlockedError, fetchShipmentDetailsLandSE, fetchTripLandSE, searchShipment, type ShipmentDetails, type TripResponse, } from "../services/dbSchenkerClient.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// In-memory cache for CAPTCHA-blocked results, keyed by tracking reference.
// This prevents us from repeatedly calling the upstream endpoint when we already
// know that the request will be rejected by browser-level CAPTCHA.
const blockedCaptchaCache = new Map();
const BLOCKED_TTL_MS = 60 * 1000; // 60 seconds
/* ✅ MUST be a Zod object */
const inputSchema = z.object({
    reference: z
        .string()
        .min(3)
        .describe("DB Schenker tracking reference number (e.g. 1806203236)"),
});
function normalizeSenderReceiver(details: ShipmentDetails) {
    const loc = details?.location ?? {};
    // Public API often exposes location but not personal names/addresses.
    const sender = loc.collectFrom ?? loc.shipperPlace ?? null;
    const receiver = loc.deliverTo ?? loc.consigneePlace ?? null;
    return { sender, receiver };
}
function normalizePackages(details: ShipmentDetails) {
    const goods = details?.goods ?? {};
    const packages = Array.isArray(details?.packages) ? details.packages : [];
    return {
        goods: {
            pieces: goods?.pieces ?? null,
            weight: goods?.weight ?? null,
            volume: goods?.volume ?? null,
            dimensions: goods?.dimensions ?? [],
            loadingMeters: goods?.loadingMeters ?? null,
        },
        packages: packages.map((p: { id?: string; events?: Array<{ code?: string; date?: string; location?: string; countryCode?: string }> }) => ({
            id: p?.id ?? null,
            events: Array.isArray(p?.events)
                ? p.events.map((e: { code?: string; date?: string; location?: string; countryCode?: string }) => ({
                    code: e?.code ?? null,
                    date: e?.date ?? null,
                    location: e?.location ?? null,
                    countryCode: e?.countryCode ?? null,
                }))
                : [],
        })),
    };
}
function normalizeTrackingHistory(details: ShipmentDetails, trip: TripResponse) {
    const events = Array.isArray(details?.events) ? details.events : [];
    const history = events.map((e: { code?: string; date?: string; comment?: string | null; location?: { name?: string; code?: string; countryCode?: string } | null; reasons?: Array<{ code?: string; description?: string | null }> | null }) => ({
        code: e?.code ?? null,
        timestamp: e?.date ?? null,
        description: e?.comment ?? null,
        location: e?.location?.name ?? null,
        locationCode: e?.location?.code ?? null,
        countryCode: e?.location?.countryCode ?? null,
        reasons: Array.isArray(e?.reasons)
            ? e.reasons.map((r: { code?: string; description?: string | null }) => ({
                code: r?.code ?? null,
                description: r?.description ?? null,
            }))
            : [],
    }));
    const tripPoints = Array.isArray(trip?.trip)
        ? trip.trip.map((t: { lastEventCode?: string; lastEventDate?: string; latitude?: number; longitude?: number }) => ({
            code: t?.lastEventCode ?? null,
            timestamp: t?.lastEventDate ?? null,
            latitude: t?.latitude ?? null,
            longitude: t?.longitude ?? null,
        }))
        : [];
    return { history, tripPoints };
}
export function registerTrackShipmentTool(server: McpServer) {
    server.registerTool("track_shipment", {
        title: "Track shipment",
        description: "Track a DB Schenker shipment by reference number and return structured shipment details and tracking history.",
        inputSchema,
    }, async ({ reference }: { reference: string }) => {
        // Fast-path: if we already know this reference is blocked by CAPTCHA and the
        // information is still fresh, return the cached structured response without
        // calling the upstream service again.
        const cachedBlocked = blockedCaptchaCache.get(reference);
        if (cachedBlocked && Date.now() - cachedBlocked.ts < BLOCKED_TTL_MS) {
            return cachedBlocked.response;
        }
        try {
            // 1) Search -> get STT
            const search = await searchShipment(reference);
            if (!search?.result?.length) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                ok: false,
                                error: "NOT_FOUND",
                                message: "No shipment found for that reference number.",
                                reference,
                            }, null, 2),
                        },
                    ],
                };
            }
            const top = search.result[0];
            const stt = top?.stt;
            if (!stt) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                ok: false,
                                error: "INVALID_RESPONSE",
                                message: "Shipment found but missing STT identifier.",
                                reference,
                                searchResult: top,
                            }, null, 2),
                        },
                    ],
                };
            }
            // 2) Details + Trip in parallel
            const [details, trip] = await Promise.all([
                fetchShipmentDetailsLandSE(stt),
                fetchTripLandSE(stt),
            ]);
            const { sender, receiver } = normalizeSenderReceiver(details);
            const pkg = normalizePackages(details);
            const tracking = normalizeTrackingHistory(details, trip);
            const response = {
                ok: true,
                reference,
                shipment: {
                    id: top.id ?? null,
                    stt: top.stt ?? null,
                    transportMode: top.transportMode ?? null,
                    progressPercent: top.percentageProgress ?? null,
                    lastEventCode: top.lastEventCode ?? null,
                    route: {
                        fromLocation: top.fromLocation ?? null,
                        toLocation: top.toLocation ?? null,
                    },
                    startDate: top.startDate ?? null,
                    endDate: top.endDate ?? null,
                },
                sender,
                receiver,
                packageDetails: pkg.goods,
                packages: pkg.packages, // bonus: per-package events
                trackingHistory: tracking.history,
                trip: {
                    start: trip?.start ?? null,
                    end: trip?.end ?? null,
                    points: tracking.tripPoints,
                },
                rawHints: {
                    product: details?.product ?? null,
                    activeStep: details?.progressBar?.activeStep ?? null,
                    deliveryDate: details?.deliveryDate ?? null,
                    references: details?.references ?? null,
                },
            };
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            // Explicitly surface upstream CAPTCHA blocking with a structured, non-retryable
            // response so that downstream consumers can treat this as a hard system boundary.
            if (error instanceof CaptchaBlockedError) {
                const blockedPayload = {
                    status: "blocked",
                    retryable: false,
                    reason: error.message,
                    details: "Upstream DB Schenker tracking endpoint requires a browser CAPTCHA and cannot be accessed server-side. This is not a transient failure or rate limit.",
                    upstream: {
                        url: error.url,
                        status: error.status,
                        hasCaptchaPuzzleHeader: error.hasCaptchaPuzzleHeader,
                    },
                };
                const blockedResponse = {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(blockedPayload, null, 2),
                        },
                    ],
                };
                // Cache the blocked result to avoid repeated upstream calls for the same reference.
                blockedCaptchaCache.set(reference, {
                    ts: Date.now(),
                    response: blockedResponse,
                });
                return blockedResponse;
            }
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            // Check if error is due to HTTP 429 rate limiting. Note that for this
            // endpoint, HTTP 429 with Captcha-Puzzle headers is treated separately as
            // a non-retryable CAPTCHA boundary (see CaptchaBlockedError above). Any
            // remaining 429s here are treated as generic rate limiting.
            const isRateLimited = errorMessage.includes("HTTP 429") || errorMessage.includes("429");
            const errorResponse = {
                ok: false,
                error: "API_ERROR",
                message: "Failed to fetch shipment data from DB Schenker API.",
                reference,
                details: errorMessage,
                ...(errorStack && { stack: errorStack }),
                ...(isRateLimited && { hint: "DB Schenker API rate-limited the request. Please retry later." }),
            };
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(errorResponse, null, 2),
                    },
                ],
            };
        }
    });
}
//# sourceMappingURL=trackShipment.js.map