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
import { Builder, By, until } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
/**
 * Configure Chrome options for stealth mode
 */
function getChromeOptions() {
    const options = new chrome.Options();
    // Stealth options to avoid detection
    options.addArguments("--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage", "--no-sandbox", "--disable-setuid-sandbox", "--window-size=1920,1080");
    // Remove automation indicators
    options.excludeSwitches("enable-automation");
    options.addArguments("--disable-blink-features=AutomationControlled");
    // Set user agent
    options.addArguments("--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    return options;
}
export class BrowserWorker {
    driver = null;
    cdpConnection = null;
    queue = [];
    processing = false;
    cache = new Map();
    cacheTTL = 60 * 1000; // 60 seconds
    browserTimeout = 30000; // 30 seconds
    initialized = false;
    /**
     * Initialize the browser worker
     */
    async initialize() {
        if (this.driver) {
            return; // Already initialized
        }
        const options = getChromeOptions();
        this.driver = await new Builder()
            .forBrowser("chrome")
            .setChromeOptions(options)
            .build();
        // Set up Chrome DevTools Protocol for network interception
        try {
            this.cdpConnection = await this.driver.createCDPConnection("page");
            await this.cdpConnection.execute("Network.enable", {});
        }
        catch (error) {
            console.warn("Could not set up CDP connection for network interception:", error);
        }
        // Navigate to tracking page
        await this.driver.get("https://www.dbschenker.com/app/tracking-public/");
        await this.driver.wait(until.elementLocated(By.tagName("body")), this.browserTimeout);
        // Wait for JavaScript to load
        await new Promise(resolve => setTimeout(resolve, 2000));
        this.initialized = true;
    }
    /**
     * Shutdown the browser worker
     */
    async shutdown() {
        if (this.driver) {
            await this.driver.quit();
            this.driver = null;
            this.cdpConnection = null;
            this.initialized = false;
        }
    }
    /**
     * Track a shipment using the browser
     */
    async track(reference) {
        // Check cache first
        const cached = this.cache.get(reference);
        if (cached) {
            const age = Date.now() - cached.timestamp;
            if (age < this.cacheTTL) {
                return cached.data;
            }
            this.cache.delete(reference);
        }
        // Ensure browser is initialized
        if (!this.driver || !this.initialized) {
            await this.initialize();
        }
        // Queue the request
        return new Promise((resolve, reject) => {
            this.queue.push({ reference, resolve, reject });
            this.processQueue();
        });
    }
    /**
     * Process the request queue
     */
    async processQueue() {
        if (this.processing || this.queue.length === 0) {
            return;
        }
        this.processing = true;
        while (this.queue.length > 0) {
            const job = this.queue.shift();
            if (!job)
                break;
            try {
                const result = await this.executeTracking(job.reference);
                this.cache.set(job.reference, {
                    data: result,
                    timestamp: Date.now(),
                });
                job.resolve(result);
            }
            catch (error) {
                job.reject(error instanceof Error ? error : new Error(String(error)));
            }
        }
        this.processing = false;
    }
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
    async executeTracking(reference) {
        if (!this.driver) {
            throw new Error("Browser driver not initialized");
        }
        // Set up network interception to capture API response
        let apiResponse = null;
        let responseCaptured = false;
        const responsePromise = new Promise((resolve) => {
            if (!this.cdpConnection) {
                resolve();
                return;
            }
            const responseHandler = (params) => {
                const url = params.response?.url || "";
                if (url.includes("/nges-portal/api/public/tracking-public/shipments?query=")) {
                    const status = params.response?.status || 0;
                    if (status === 200) {
                        // Get response body
                        this.cdpConnection.execute("Network.getResponseBody", { requestId: params.requestId })
                            .then((bodyResult) => {
                            try {
                                const body = bodyResult.body;
                                const base64 = bodyResult.base64Encoded;
                                apiResponse = JSON.parse(base64 ? Buffer.from(body, "base64").toString() : body);
                                responseCaptured = true;
                                resolve();
                            }
                            catch (error) {
                                // Ignore parse errors
                                resolve();
                            }
                        })
                            .catch(() => resolve());
                    }
                    else if (status === 422) {
                        throw new Error("HTTP 422: Invalid solution - CAPTCHA solving algorithm may need to regenerate solution");
                    }
                    else if (status === 429) {
                        // Check if it's a CAPTCHA challenge
                        const headers = params.response?.headers || {};
                        const puzzleHeader = headers["captcha-puzzle"] || headers["Captcha-Puzzle"];
                        if (puzzleHeader) {
                            // The JavaScript should automatically solve this and retry
                            // Wait a bit for the retry
                            setTimeout(() => resolve(), 2000);
                        }
                        else {
                            resolve();
                        }
                    }
                    else {
                        resolve();
                    }
                }
            };
            this.cdpConnection.on("Network.responseReceived", responseHandler);
            // Timeout after 30 seconds
            setTimeout(() => {
                if (!responseCaptured) {
                    resolve();
                }
            }, 30000);
        });
        try {
            // Navigate to tracking page if not already there
            const currentUrl = await this.driver.getCurrentUrl();
            if (!currentUrl.includes("tracking-public")) {
                await this.driver.get("https://www.dbschenker.com/app/tracking-public/");
                await this.driver.wait(until.elementLocated(By.tagName("body")), this.browserTimeout);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            // Wait for the main.js bundle to load and initialize
            // The CAPTCHA solving algorithm is in this bundle
            await this.driver.wait(async () => {
                return await this.driver.executeScript(() => {
                    return (globalThis.document?.readyState === "complete" &&
                        globalThis.fetch !== undefined);
                });
            }, 10000).catch(() => {
                // Continue even if check fails
            });
            // Wait a bit more for JavaScript initialization
            await new Promise(resolve => setTimeout(resolve, 2000));
            // Use the page's JavaScript to make the API request
            // The JavaScript will automatically handle CAPTCHA solving
            const apiUrl = `https://www.dbschenker.com/nges-portal/api/public/tracking-public/shipments?query=${encodeURIComponent(reference)}`;
            // Execute fetch in page context - the JavaScript will intercept and add Captcha-Solution
            const result = await this.driver.executeScript(async (url) => {
                const response = await fetch(url, {
                    method: "GET",
                    headers: {
                        "Accept": "application/json",
                        "Referer": "https://www.dbschenker.com/app/tracking-public/",
                    },
                });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return await response.json();
            }, apiUrl);
            // Wait for network interception to capture response
            await responsePromise;
            // If we got a result from executeScript, use it
            if (result) {
                apiResponse = result;
                responseCaptured = true;
            }
            if (!responseCaptured || !apiResponse) {
                throw new Error("Failed to capture API response");
            }
            return apiResponse;
        }
        catch (error) {
            // If the page's JavaScript failed, try a fallback approach
            if (error instanceof Error && error.message.includes("422")) {
                throw new Error("CAPTCHA solution was rejected. The JavaScript algorithm may need to regenerate it.");
            }
            throw error;
        }
    }
    /**
     * Clear the result cache
     */
    clearCache() {
        this.cache.clear();
    }
}
//# sourceMappingURL=browserWorker.js.map