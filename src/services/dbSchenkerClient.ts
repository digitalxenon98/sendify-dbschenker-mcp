type FetchJsonOptions = {
    retries?: number;
    retryDelayMs?: number;
  };
  
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
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Referer": "https://www.dbschenker.com/global/en/tracking/",
          },
        });
  
        // Check for rate limit / transient errors: retry with exponential backoff
        if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
          let errorText = "";
          try {
            errorText = await res.text();
          } catch {
            // Ignore text parsing errors
          }
          
          // Calculate backoff delay
          const delay = retryDelayMs * Math.pow(2, attempt);
          const attemptNumber = attempt + 1; // 1-indexed for user display
          
          // Build detailed error message for 429 (rate limiting)
          let errorMsg: string;
          if (res.status === 429) {
            errorMsg = `HTTP 429 Too Many Requests (Rate Limited) | URL: ${url} | Attempt: ${attemptNumber}/${retries + 1} | Backoff delay: ${delay}ms${errorText ? ` | Response: ${errorText.substring(0, 200)}` : ""}`;
          } else {
            // Server errors (5xx) - simpler message
            errorMsg = `HTTP ${res.status} ${res.statusText} for ${url}${errorText ? ` :: ${errorText.substring(0, 200)}` : ""}`;
          }
          
          lastErr = new Error(errorMsg);
          
          // If we've exhausted retries, throw the error
          if (attempt >= retries) {
            throw lastErr;
          }
          
          // Retry with exponential backoff
          await sleep(delay);
          continue;
        }
  
        // Handle other non-OK responses
        if (!res.ok) {
          let errorText = "";
          try {
            errorText = await res.text();
          } catch {
            // Ignore text parsing errors
          }
          const errorMsg = `HTTP ${res.status} ${res.statusText} for ${url}${errorText ? ` :: ${errorText.substring(0, 200)}` : ""}`;
          lastErr = new Error(errorMsg);
          
          // Don't retry on client errors (4xx), only on server errors (5xx)
          if (res.status >= 400 && res.status < 500) {
            throw lastErr;
          }
          
          // If this was the last attempt, throw
          if (attempt >= retries) {
            throw lastErr;
          }
          
          const delay = retryDelayMs * Math.pow(2, attempt);
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
        
        const delay = retryDelayMs * Math.pow(2, attempt);
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
  