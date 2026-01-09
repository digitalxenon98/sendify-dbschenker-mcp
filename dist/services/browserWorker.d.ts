/**
 * Browser Worker Service
 *
 * Manages a Selenium WebDriver instance to execute tracking requests
 * in a real browser context, allowing CAPTCHA challenge-response to work naturally.
 *
 * This service:
 * - Maintains a single browser instance (reused across requests)
 * - Queues requests to serialize browser operations
 * - Intercepts network requests to capture API responses
 * - Caches results to reduce browser operations
 * - Handles browser lifecycle (launch, shutdown)
 */
export type TrackingJob = {
    reference: string;
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
};
export declare class BrowserWorker {
    private driver;
    private cdpConnection;
    private queue;
    private processing;
    private cache;
    private readonly cacheTTL;
    private readonly browserTimeout;
    private initialized;
    /**
     * Initialize the browser worker
     */
    initialize(): Promise<void>;
    /**
     * Shutdown the browser worker
     */
    shutdown(): Promise<void>;
    /**
     * Track a shipment using the browser
     */
    track(reference: string): Promise<unknown>;
    /**
     * Process the request queue
     */
    private processQueue;
    /**
     * Execute a tracking request in the browser
     *
     * The page's JavaScript (main.*.js) contains the CAPTCHA solving algorithm.
     * When we make an API request, the JavaScript automatically:
     * 1. Intercepts the request
     * 2. Solves the CAPTCHA challenge (if needed)
     * 3. Adds the Captcha-Solution header
     * 4. Sends the request
     *
     * We just need to trigger the request and let the JavaScript handle it.
     */
    private executeTracking;
    /**
     * Clear the result cache
     */
    clearCache(): void;
}
//# sourceMappingURL=browserWorker.d.ts.map