export type FetchJsonOptions = {
  retries?: number;
  retryDelayMs?: number;
};

export class CaptchaBlockedError extends Error {
  public readonly status = 429;
  public readonly retryable = false;
  public readonly hasCaptchaPuzzleHeader: boolean;
  public readonly url: string;

  constructor(params: { url: string; message?: string; hasCaptchaPuzzleHeader: boolean }) {
    super(
      params.message ??
        "DB Schenker tracking endpoint is protected by a browser CAPTCHA. The upstream service returned HTTP 429 because the required Captcha-Solution header is missing."
    );
    this.name = "CaptchaBlockedError";
    this.url = params.url;
    this.hasCaptchaPuzzleHeader = params.hasCaptchaPuzzleHeader;
  }
}

const BASE =
  "https://www.dbschenker.com/nges-portal/api/public/tracking-public";

// In-memory cache: Map<url, { data: unknown; ts: number }>
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson<T>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
    // Check cache before fetching
    const cached = cache.get(url);
    if (cached) {
      const age = Date.now() - cached.ts;
      if (age < CACHE_TTL_MS) {
        return cached.data as T;
      }
      // Cache expired, remove it
      cache.delete(url);
    }
  
    const retries = opts.retries ?? 3;
    const retryDelayMs = opts.retryDelayMs ?? 1000; // Increased default delay for rate limits
  
    let lastErr: Error | null = null;
  
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

        const hasCaptchaPuzzleHeader =
          res.headers.has("Captcha-Puzzle") ||
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
          } catch {
            // Ignore text parsing errors – the presence of the header plus 429 is enough.
          }

          throw new CaptchaBlockedError({
            url,
            hasCaptchaPuzzleHeader,
            message: `DB Schenker tracking endpoint is protected by a browser CAPTCHA and responded with HTTP 429 due to a missing Captcha-Solution header. URL: ${url}${
              errorText ? ` | Response: ${errorText.substring(0, 200)}` : ""
            }`,
          });
        }

        // HTTP 429 without CAPTCHA headers: treat as retryable rate limiting.
        // This distinguishes true rate limiting from CAPTCHA-enforced blocking.
        if (res.status === 429 && !hasCaptchaPuzzleHeader) {
          let errorText = "";
          try {
            errorText = await res.text();
          } catch {
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
          } catch {
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
          } catch {
            // Ignore text parsing errors
          }
          const errorMsg = `HTTP ${res.status} ${res.statusText} for ${url}${
            errorText ? ` :: ${errorText.substring(0, 200)}` : ""
          }`;
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
  
        let jsonData: T;
        try {
          jsonData = (await res.json()) as T;
        } catch (jsonError) {
          const errorMsg = `Failed to parse JSON response from ${url}: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`;
          lastErr = new Error(errorMsg);
          throw lastErr;
        }
        
        // Cache successful JSON response
        cache.set(url, { data: jsonData, ts: Date.now() });
        
        return jsonData;
      } catch (e) {
        if (e instanceof Error) {
          lastErr = e;
          // If it's a network error or JSON parse error, don't retry
          if (e.message.includes("parse JSON") || e.message.includes("fetch")) {
            throw e;
          }
        } else {
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
  
  export type ShipmentSearchResult = {
    result: Array<{
      id: string; // e.g. "LandStt:SENYB550963155"
      stt: string; // e.g. "SENYB550963155"
      transportMode: "LAND" | string;
      percentageProgress?: number;
      lastEventCode?: string;
      fromLocation?: string;
      toLocation?: string;
      startDate?: string | null;
      endDate?: string | null;
    }>;
    warnings?: unknown[];
  };
  
  export type ShipmentDetails = {
    sttNumber: string;
    references?: {
      shipper?: string[];
      consignee?: string[];
      waybillAndConsignementNumbers?: string[];
      additionalReferences?: string[];
      originalStt?: string | null;
    };
    goods?: {
      pieces?: number;
      volume?: { value: number; unit: string } | null;
      weight?: { value: number; unit: string } | null;
      dimensions?: Array<unknown>;
      loadingMeters?: { value: number; unit: string } | null;
    };
    events?: Array<{
      code: string;
      date: string;
      createdAt?: string;
      comment?: string | null;
      location?: { name?: string; code?: string; countryCode?: string } | null;
      reasons?: Array<{ code: string; description?: string | null }> | null;
    }>;
    packages?: Array<{
      id: string;
      events?: Array<{ code: string; countryCode?: string; location?: string; date: string }>;
    }>;
    product?: string | null;
    transportMode?: string | null;
    progressBar?: { steps?: string[]; activeStep?: string } | null;
    deliveryDate?: { estimated?: string | null; agreed?: string | null } | null;
    location?: {
      collectFrom?: { countryCode?: string; country?: string; city?: string; postCode?: string };
      deliverTo?: { countryCode?: string; country?: string; city?: string; postCode?: string };
      shipperPlace?: { countryCode?: string; country?: string; city?: string; postCode?: string };
      consigneePlace?: { countryCode?: string; country?: string; city?: string; postCode?: string };
      dispatchingOffice?: { countryCode?: string; country?: string; city?: string };
      receivingOffice?: { countryCode?: string; country?: string; city?: string };
    } | null;
  };
  
  export type TripResponse = {
    start: string | null;
    end: string | null;
    trip: Array<{
      lastEventCode: string;
      lastEventDate: string;
      latitude: number;
      longitude: number;
    }>;
  };
  
  export async function searchShipment(reference: string): Promise<ShipmentSearchResult> {
    const url = `${BASE}/shipments?query=${encodeURIComponent(reference)}`;
    return fetchJson<ShipmentSearchResult>(url);
  }
  
  export async function fetchShipmentDetailsLandSE(stt: string): Promise<ShipmentDetails> {
    // Matches what you observed: /shipments/land/LandStt:SE:<STT>
    const url = `${BASE}/shipments/land/${encodeURIComponent(`LandStt:SE:${stt}`)}`;
    return fetchJson<ShipmentDetails>(url);
  }
  
  export async function fetchTripLandSE(stt: string): Promise<TripResponse> {
    const url = `${BASE}/shipments/land/${encodeURIComponent(`LandStt:SE:${stt}`)}/trip`;
    return fetchJson<TripResponse>(url);
  }
  