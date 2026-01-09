import { solveCaptcha } from "./captchaSolver.js";
export class CaptchaBlockedError extends Error {
    status = 429;
    retryable = false;
    hasCaptchaPuzzleHeader;
    url;
    constructor(params) {
        super(params.message ??
            "DB Schenker tracking endpoint is protected by a browser CAPTCHA. The upstream service returned HTTP 429 because the required Captcha-Solution header is missing.");
        this.name = "CaptchaBlockedError";
        this.url = params.url;
        this.hasCaptchaPuzzleHeader = params.hasCaptchaPuzzleHeader;
    }
}
export class CaptchaSolutionInvalidError extends Error {
    status = 422;
    retryable = false;
    url;
    constructor(params) {
        super(params.message ??
            "DB Schenker tracking endpoint rejected the Captcha-Solution header. The solution may be expired, invalid, or malformed.");
        this.name = "CaptchaSolutionInvalidError";
        this.url = params.url;
    }
}
const BASE = "https://www.dbschenker.com/nges-portal/api/public/tracking-public";
// In-memory cache: Map<url, { data: unknown; ts: number }>
const cache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
export async function fetchJson(url, opts = {}) {
    // Check cache before fetching
    const cached = cache.get(url);
    if (cached) {
        const age = Date.now() - cached.ts;
        if (age < CACHE_TTL_MS) {
            return cached.data;
        }
        // Cache expired, remove it
        cache.delete(url);
    }
    const retries = opts.retries ?? 3;
    const retryDelayMs = opts.retryDelayMs ?? 1000; // Increased default delay for rate limits
    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            // Build headers
            const headers = {
                accept: "application/json",
                "accept-language": "en-US,en;q=0.8",
                Referer: "https://www.dbschenker.com/global/en/tracking/",
                "User-Agent": "Sendify-MCP/1.0",
            };
            const res = await fetch(url, {
                headers,
            });
            const hasCaptchaPuzzleHeader = res.headers.has("Captcha-Puzzle") ||
                res.headers.has("captcha-puzzle") ||
                res.headers.has("X-Captcha-Puzzle");
            // CAPTCHA detection for this endpoint:
            // - HTTP 429 status
            // - Presence of a Captcha-Puzzle-style response header
            //
            // When we receive a CAPTCHA puzzle, we'll try to solve it automatically
            if (res.status === 429 && hasCaptchaPuzzleHeader) {
                // Extract the puzzle header
                const puzzleHeader = res.headers.get("Captcha-Puzzle") ||
                    res.headers.get("captcha-puzzle") ||
                    res.headers.get("X-Captcha-Puzzle");
                if (!puzzleHeader) {
                    // Shouldn't happen if hasCaptchaPuzzleHeader is true, but handle it
                    throw new CaptchaBlockedError({
                        url,
                        hasCaptchaPuzzleHeader: false,
                        message: `Received HTTP 429 but could not extract Captcha-Puzzle header. URL: ${url}`,
                    });
                }
                try {
                    // Solve the CAPTCHA puzzle
                    const solveStartTime = Date.now();
                    const solution = await solveCaptcha(puzzleHeader);
                    const solveTime = Date.now() - solveStartTime;
                    // Debug logging (only if DEBUG_CAPTCHA env var is set)
                    if (process.env.DEBUG_CAPTCHA === "1") {
                        // Use console.error for debugging (console.log breaks MCP protocol)
                        console.error(`[CAPTCHA] Puzzle solved in ${solveTime}ms`);
                        console.error(`[CAPTCHA] Solution length: ${solution.length} chars`);
                    }
                    // Retry the request with the solution header
                    const retryHeaders = { ...headers };
                    retryHeaders["Captcha-Solution"] = solution;
                    const retryRes = await fetch(url, {
                        headers: retryHeaders,
                    });
                    // If retry succeeds, continue with the response
                    if (retryRes.ok) {
                        return await retryRes.json();
                    }
                    // If retry returns 422, the solution was invalid
                    if (retryRes.status === 422) {
                        let errorText = "";
                        try {
                            errorText = await retryRes.text();
                        }
                        catch {
                            // Ignore text parsing errors
                        }
                        throw new CaptchaSolutionInvalidError({
                            url,
                            message: `HTTP 422 Unprocessable Entity :: Invalid solution${errorText ? ` :: ${errorText.substring(0, 200)}` : ""}`,
                        });
                    }
                    // If retry still returns 429, something else is wrong
                    if (retryRes.status === 429) {
                        throw new CaptchaBlockedError({
                            url,
                            hasCaptchaPuzzleHeader: true,
                            message: `CAPTCHA solution was generated but request still returned HTTP 429. The solution may be invalid or expired. URL: ${url}`,
                        });
                    }
                    // 404 is a valid response (resource not found) - not a CAPTCHA failure
                    // The CAPTCHA was solved successfully, but the endpoint doesn't exist
                    if (retryRes.status === 404) {
                        let errorText = "";
                        try {
                            errorText = await retryRes.text();
                        }
                        catch {
                            // Ignore text parsing errors
                        }
                        // Throw a regular error (not CAPTCHA-related) - this will be handled by the caller
                        throw new Error(`HTTP 404 Not Found${errorText ? ` :: ${errorText.substring(0, 200)}` : ""}`);
                    }
                    // Other error status - throw generic error
                    let errorText = "";
                    try {
                        errorText = await retryRes.text();
                    }
                    catch {
                        // Ignore text parsing errors
                    }
                    throw new Error(`HTTP ${retryRes.status} ${retryRes.statusText} after CAPTCHA solution${errorText ? ` :: ${errorText.substring(0, 200)}` : ""}`);
                }
                catch (error) {
                    // If solving fails, check if it's already a known error type
                    if (error instanceof CaptchaSolutionInvalidError || error instanceof CaptchaBlockedError) {
                        throw error;
                    }
                    // If solving fails for other reasons, provide helpful error
                    throw new Error(`Failed to solve CAPTCHA puzzle: ${error instanceof Error ? error.message : String(error)}. URL: ${url}`);
                }
            }
            // HTTP 429 without CAPTCHA headers: treat as retryable rate limiting.
            // This distinguishes true rate limiting from CAPTCHA-enforced blocking.
            if (res.status === 429 && !hasCaptchaPuzzleHeader) {
                let errorText = "";
                try {
                    errorText = await res.text();
                }
                catch {
                    // Ignore text parsing errors
                }
                const baseDelay = retryDelayMs * Math.pow(2, attempt);
                const jitter = Math.random() * baseDelay * 0.3;
                const delay = baseDelay + jitter;
                const attemptNumber = attempt + 1; // 1-indexed for user display
                const errorMsg = `HTTP 429 Too Many Requests (Rate Limited) | URL: ${url} | Attempt: ${attemptNumber}/${retries + 1} | Backoff delay: ${Math.round(delay)}ms${errorText ? ` | Response: ${errorText.substring(0, 200)}` : ""}`;
                lastErr = new Error(errorMsg);
                // If we've exhausted retries, throw the error
                if (attempt >= retries) {
                    throw lastErr;
                }
                // Retry with exponential backoff and jitter
                await sleep(delay);
                continue;
            }
            // Check for transient server-side errors (5xx) – these remain retryable
            // and use exponential backoff with jitter.
            if (res.status >= 500 && res.status <= 599) {
                let errorText = "";
                try {
                    errorText = await res.text();
                }
                catch {
                    // Ignore text parsing errors
                }
                const baseDelay = retryDelayMs * Math.pow(2, attempt);
                const jitter = Math.random() * baseDelay * 0.3;
                const delay = baseDelay + jitter;
                const errorMsg = `HTTP ${res.status} ${res.statusText} for ${url}${errorText ? ` :: ${errorText.substring(0, 200)}` : ""}`;
                lastErr = new Error(errorMsg);
                // If we've exhausted retries, throw the error
                if (attempt >= retries) {
                    throw lastErr;
                }
                // Retry with exponential backoff and jitter
                await sleep(delay);
                continue;
            }
            // Handle HTTP 422 - Invalid Captcha-Solution
            // This indicates the solution was expired, invalid, or malformed
            if (res.status === 422) {
                let errorText = "";
                try {
                    errorText = await res.text();
                }
                catch {
                    // Ignore text parsing errors
                }
                // Check if error message indicates invalid solution
                const isInvalidSolution = errorText.toLowerCase().includes("invalid solution") ||
                    errorText.toLowerCase().includes("invalid") ||
                    errorText.toLowerCase().includes("solution");
                if (isInvalidSolution) {
                    throw new CaptchaSolutionInvalidError({
                        url,
                        message: `DB Schenker rejected the Captcha-Solution header with HTTP 422. The solution may be expired or invalid. URL: ${url}${errorText ? ` | Response: ${errorText.substring(0, 200)}` : ""}`,
                    });
                }
            }
            // Handle other non-OK responses (should not reach here for 429, 422, or 5xx,
            // as those are handled above).
            if (!res.ok) {
                let errorText = "";
                try {
                    errorText = await res.text();
                }
                catch {
                    // Ignore text parsing errors
                }
                const errorMsg = `HTTP ${res.status} ${res.statusText} for ${url}${errorText ? ` :: ${errorText.substring(0, 200)}` : ""}`;
                lastErr = new Error(errorMsg);
                // Don't retry on client errors (4xx), only on server errors (5xx).
                // HTTP 429 and 422 are already handled above.
                if (res.status >= 400 && res.status < 500) {
                    throw lastErr;
                }
                // If this was the last attempt, throw
                if (attempt >= retries) {
                    throw lastErr;
                }
                const baseDelay = retryDelayMs * Math.pow(2, attempt);
                const jitter = Math.random() * baseDelay * 0.3;
                const delay = baseDelay + jitter;
                await sleep(delay);
                continue;
            }
            let jsonData;
            try {
                jsonData = (await res.json());
            }
            catch (jsonError) {
                const errorMsg = `Failed to parse JSON response from ${url}: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`;
                lastErr = new Error(errorMsg);
                throw lastErr;
            }
            // Cache successful JSON response
            cache.set(url, { data: jsonData, ts: Date.now() });
            return jsonData;
        }
        catch (e) {
            if (e instanceof Error) {
                lastErr = e;
                // If it's a network error or JSON parse error, don't retry
                if (e.message.includes("parse JSON") || e.message.includes("fetch")) {
                    throw e;
                }
            }
            else {
                lastErr = new Error(`Unknown error: ${String(e)}`);
            }
            // If this was the last attempt, throw
            if (attempt >= retries) {
                throw lastErr;
            }
            const baseDelay = retryDelayMs * Math.pow(2, attempt);
            const jitter = Math.random() * baseDelay * 0.3;
            const delay = baseDelay + jitter;
            await sleep(delay);
        }
    }
    // Fallback (shouldn't reach here, but just in case)
    throw lastErr || new Error(`Failed to fetch ${url} after ${retries} retries`);
}
export async function searchShipment(reference) {
    const url = `${BASE}/shipments?query=${encodeURIComponent(reference)}`;
    return fetchJson(url);
}
export async function fetchShipmentDetailsLandSE(stt) {
    // Matches what you observed: /shipments/land/LandStt:SE:<STT>
    const url = `${BASE}/shipments/land/${encodeURIComponent(`LandStt:SE:${stt}`)}`;
    return fetchJson(url);
}
export async function fetchTripLandSE(stt) {
    const url = `${BASE}/shipments/land/${encodeURIComponent(`LandStt:SE:${stt}`)}/trip`;
    return fetchJson(url);
}
//# sourceMappingURL=dbSchenkerClient.js.map