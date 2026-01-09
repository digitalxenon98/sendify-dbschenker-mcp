/**
 * DB Schenker Browser Adapter
 *
 * Alternative adapter that uses a browser worker to execute requests
 * in a real browser context, allowing CAPTCHA challenge-response to work naturally.
 *
 * This adapter implements the same CarrierAdapter interface as DbSchenkerAdapter,
 * but uses browser automation instead of direct HTTP requests.
 */
import type { CarrierAdapter, TrackingResult } from "./CarrierAdapter.js";
export declare class DbSchenkerBrowserAdapter implements CarrierAdapter {
    readonly carrier = "db-schenker-browser";
    private worker;
    constructor();
    track(reference: string): Promise<TrackingResult>;
    /**
     * Cleanup browser resources
     */
    shutdown(): Promise<void>;
}
//# sourceMappingURL=DbSchenkerBrowserAdapter.d.ts.map