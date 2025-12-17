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
const BASE = "https://www.dbschenker.com/nges-portal/api/public/tracking-public";
// In-memory cache: Map<url, { data: unknown; ts: number }>
const cache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
async function fetchJson(url, opts = {}) {
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
            const res = await fetch(url, {
                headers: {
                    accept: "application/json",
                    "accept-language": "en-US,en;q=0.8",
                    // Explicit, honest identifier for this server-side MCP integration.
                    // This is *not* used to bypass browser protections or CAPTCHA.
                    "User-Agent": "Sendify-MCP/1.0 (educational challenge; no browser execution)",
                    Referer: "https://www.dbschenker.com/global/en/tracking/",
                },
            });
            const hasCaptchaPuzzleHeader = res.headers.has("Captcha-Puzzle") ||
                res.headers.has("captcha-puzzle") ||
                res.headers.has("X-Captcha-Puzzle");
            // CAPTCHA detection for this endpoint:
            // - HTTP 429 status
            // - Presence of a Captcha-Puzzle-style response header
            //
            // We intentionally treat this as a hard, non-retryable system boundary caused by
            // a missing Captcha-Solution header in the browser, not rate limiting.
            if (res.status === 429 && hasCaptchaPuzzleHeader) {
                let errorText = "";
                try {
                    errorText = await res.text();
                }
                catch {
                    // Ignore text parsing errors – the presence of the header plus 429 is enough.
                }
                throw new CaptchaBlockedError({
                    url,
                    hasCaptchaPuzzleHeader,
                    message: `DB Schenker tracking endpoint is protected by a browser CAPTCHA and responded with HTTP 429 due to a missing Captcha-Solution header. URL: ${url}${errorText ? ` | Response: ${errorText.substring(0, 200)}` : ""}`,
                });
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
            // Handle other non-OK responses (should not reach here for 429 or 5xx,
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
                // HTTP 429 is already handled above (CAPTCHA-blocked or retryable rate limiting).
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