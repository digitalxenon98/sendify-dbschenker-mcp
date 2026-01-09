/**
 * DB Schenker Browser Adapter
 *
 * Alternative adapter that uses a browser worker to execute requests
 * in a real browser context, allowing CAPTCHA challenge-response to work naturally.
 *
 * This adapter implements the same CarrierAdapter interface as DbSchenkerAdapter,
 * but uses browser automation instead of direct HTTP requests.
 */
import { BrowserWorker } from "../services/browserWorker.js";
// Reuse normalization functions from HTTP adapter
function normalizeSenderReceiver(details) {
    const loc = details?.location ?? {};
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
export class DbSchenkerBrowserAdapter {
    carrier = "db-schenker-browser";
    worker;
    constructor() {
        this.worker = new BrowserWorker();
    }
    async track(reference) {
        try {
            // Use browser worker to fetch search results
            const searchResult = await this.worker.track(reference);
            if (!searchResult?.result?.length) {
                return {
                    ok: false,
                    error: "NOT_FOUND",
                    message: "No shipment found for that reference number.",
                    reference,
                };
            }
            const top = searchResult.result[0];
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
            // For browser adapter, we may need to make additional requests
            // For now, we'll use the search result data
            // In a full implementation, we'd fetch details and trip data via browser as well
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
                sender: null,
                receiver: null,
                packageDetails: null,
                packages: [],
                trackingHistory: [],
                trip: {
                    start: null,
                    end: null,
                    points: [],
                },
                rawHints: {},
            };
            return response;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                ok: false,
                error: "BROWSER_ERROR",
                message: "Failed to fetch shipment data using browser worker.",
                reference,
                details: errorMessage,
            };
        }
    }
    /**
     * Cleanup browser resources
     */
    async shutdown() {
        await this.worker.shutdown();
    }
}
//# sourceMappingURL=DbSchenkerBrowserAdapter.js.map