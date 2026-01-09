import { CaptchaBlockedError, CaptchaSolutionInvalidError, fetchShipmentDetailsLandSE, fetchTripLandSE, searchShipment, } from "../services/dbSchenkerClient.js";
// In-memory cache for CAPTCHA-blocked results, keyed by tracking reference.
// This prevents us from repeatedly calling the upstream endpoint when we already
// know that the request will be rejected by browser-level CAPTCHA.
const blockedCaptchaCache = new Map();
const BLOCKED_TTL_MS = 60 * 1000; // 60 seconds
function normalizeSenderReceiver(details) {
    const loc = details?.location ?? {};
    // Public API often exposes location but not personal names/addresses.
    const sender = loc.collectFrom ?? loc.shipperPlace ?? null;
    const receiver = loc.deliverTo ?? loc.consigneePlace ?? null;
    return { sender, receiver };
}
function normalizePackages(details) {
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
        packages: packages.map((p) => ({
            id: p?.id ?? null,
            events: Array.isArray(p?.events)
                ? p.events.map((e) => ({
                    code: e?.code ?? null,
                    date: e?.date ?? null,
                    location: e?.location ?? null,
                    countryCode: e?.countryCode ?? null,
                }))
                : [],
        })),
    };
}
function normalizeTrackingHistory(details, trip) {
    const events = Array.isArray(details?.events) ? details.events : [];
    const history = events.map((e) => ({
        code: e?.code ?? null,
        timestamp: e?.date ?? null,
        description: e?.comment ?? null,
        location: e?.location?.name ?? null,
        locationCode: e?.location?.code ?? null,
        countryCode: e?.location?.countryCode ?? null,
        reasons: Array.isArray(e?.reasons)
            ? e.reasons.map((r) => ({
                code: r?.code ?? null,
                description: r?.description ?? null,
            }))
            : [],
    }));
    const tripPoints = Array.isArray(trip?.trip)
        ? trip.trip.map((t) => ({
            code: t?.lastEventCode ?? null,
            timestamp: t?.lastEventDate ?? null,
            latitude: t?.latitude ?? null,
            longitude: t?.longitude ?? null,
        }))
        : [];
    return { history, tripPoints };
}
export class DbSchenkerAdapter {
    carrier = "db-schenker";
    async track(reference) {
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
                    ok: false,
                    error: "NOT_FOUND",
                    message: "No shipment found for that reference number.",
                    reference,
                };
            }
            const top = search.result[0];
            const stt = top?.stt;
            if (!stt) {
                return {
                    ok: false,
                    error: "INVALID_RESPONSE",
                    message: "Shipment found but missing STT identifier.",
                    reference,
                    searchResult: top,
                };
            }
            // 2) Details + Trip in parallel (optional - may fail with 404)
            // If these fail, we'll still return the search result data
            let details = null;
            let trip = null;
            try {
                [details, trip] = await Promise.all([
                    fetchShipmentDetailsLandSE(stt),
                    fetchTripLandSE(stt),
                ]);
            }
            catch (error) {
                // If details/trip fail (e.g., 404), we'll still return search result
                // Log the error but don't fail the entire request
                const errorMsg = error instanceof Error ? error.message : String(error);
                if (errorMsg.includes("404") || errorMsg.includes("Not Found")) {
                    // Details/trip endpoints not available for this shipment - that's OK
                    // We'll return what we have from the search result
                }
                else {
                    // Re-throw other errors (CAPTCHA, network, etc.)
                    throw error;
                }
            }
            const { sender, receiver } = details ? normalizeSenderReceiver(details) : { sender: null, receiver: null };
            const pkg = details ? normalizePackages(details) : { goods: null, packages: [] };
            const tracking = details && trip ? normalizeTrackingHistory(details, trip) : { history: [], tripPoints: [] };
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
                // Add metadata about what data was available
                _metadata: {
                    hasDetails: details !== null,
                    hasTrip: trip !== null,
                },
            };
            return response;
        }
        catch (error) {
            // Handle invalid Captcha-Solution (422) - solution expired or invalid
            if (error instanceof CaptchaSolutionInvalidError) {
                const invalidSolutionPayload = {
                    ok: false,
                    error: "CAPTCHA_SOLUTION_INVALID",
                    message: "The Captcha-Solution header was rejected by the server. The solution may have expired.",
                    reference,
                    details: error.message,
                    hint: "The Captcha-Solution header is time-sensitive and expires quickly. The server will automatically retry with a fresh solution.",
                    retryable: true,
                };
                return invalidSolutionPayload;
            }
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
                // Cache the blocked result to avoid repeated upstream calls for the same reference.
                blockedCaptchaCache.set(reference, {
                    ts: Date.now(),
                    response: blockedPayload,
                });
                return blockedPayload;
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
            return errorResponse;
        }
    }
}
//# sourceMappingURL=DbSchenkerAdapter.js.map