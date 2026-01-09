# Browser-Worker Implementation Plan

## Overview

This document outlines the implementation of a browser-worker adapter that uses Playwright to execute requests in a real browser context, allowing the CAPTCHA challenge-response mechanism to work naturally.

## Architecture

### Current Architecture
```
MCP Server → DbSchenkerAdapter → dbSchenkerClient (HTTP fetch) → DB Schenker API
```

### Proposed Architecture
```
MCP Server → CarrierAdapter (interface)
    ├── DbSchenkerAdapter (HTTP - current)
    └── DbSchenkerBrowserAdapter (Browser Worker - new)
        └── BrowserWorker → Playwright → DB Schenker Web App → Extract JSON
```

## File Structure

```
src/
├── carriers/
│   ├── CarrierAdapter.ts          # Interface (existing)
│   ├── DbSchenkerAdapter.ts       # HTTP adapter (existing)
│   └── DbSchenkerBrowserAdapter.ts # Browser adapter (new)
├── services/
│   ├── dbSchenkerClient.ts        # HTTP client (existing)
│   └── browserWorker.ts           # Browser worker service (new)
└── tools/
    └── trackShipment.ts           # Update to support adapter selection
```

## Implementation Details

### 1. Browser Worker Service (`src/services/browserWorker.ts`)

**Responsibilities:**
- Manage browser lifecycle (launch, context, pages)
- Queue tracking requests
- Execute requests in browser context
- Extract shipment data from page/network
- Cache results
- Handle browser errors and timeouts

**Key Features:**
- Single browser instance (reused across requests)
- Request queue to serialize browser operations
- Result caching (by reference number)
- Automatic CAPTCHA handling (user solves in browser)
- Network interception to capture API responses

### 2. Browser Adapter (`src/carriers/DbSchenkerBrowserAdapter.ts`)

**Responsibilities:**
- Implement `CarrierAdapter` interface
- Use `browserWorker` to fetch data
- Normalize browser-extracted data to `TrackingResult` format
- Handle browser-specific errors

**Key Features:**
- Same interface as HTTP adapter
- Transparent to MCP server
- Can be selected via configuration

### 3. Adapter Selection

**Configuration:**
- Environment variable: `DBSCHENKER_ADAPTER=http|browser` (default: `http`)
- Or automatic fallback: HTTP → Browser on CAPTCHA errors

**Implementation:**
- Factory pattern to create appropriate adapter
- Update `trackShipment.ts` to use selected adapter

## Error Handling Improvements

### Current Issues:
1. HTTP 422 "Invalid solution" not properly classified
2. No distinction between expired solution and missing solution
3. Retry logic doesn't account for solution expiration

### Improvements:
1. **New Error Type:** `CaptchaSolutionInvalidError` (422)
   - Non-retryable
   - Clear message about expiration
   - Hint to re-bootstrap

2. **Error Classification:**
   - `429 + Captcha-Puzzle` → `CaptchaBlockedError` (missing solution)
   - `422 + "Invalid solution"` → `CaptchaSolutionInvalidError` (expired/invalid)
   - `429` without puzzle → Rate limiting (retryable)

3. **Retry Behavior:**
   - Don't retry on 422 (solution won't become valid)
   - Don't retry on 429 with puzzle (need new solution)
   - Retry on 429 without puzzle (rate limiting)

## Browser Worker Design

### Lifecycle Management

```typescript
class BrowserWorker {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private queue: Queue<TrackingJob>;
  private cache: Map<string, CachedResult>;
  
  async initialize(): Promise<void>
  async shutdown(): Promise<void>
  async track(reference: string): Promise<TrackingResult>
}
```

### Request Flow

1. **Queue Request:** Add to queue if browser is busy
2. **Navigate to Tracking Page:** `https://www.dbschenker.com/app/tracking-public/`
3. **Wait for CAPTCHA:** User solves if needed (manual)
4. **Enter Reference:** Fill search form
5. **Intercept Network:** Capture API response
6. **Extract Data:** Parse JSON from response
7. **Return Result:** Normalize to `TrackingResult`

### Caching Strategy

- **Cache Key:** Reference number
- **Cache TTL:** 60 seconds (same as HTTP client)
- **Invalidation:** On browser restart or explicit clear

## Testing Strategy

### Mock Responses

Create test fixtures for:
- `200 OK` with valid shipment data
- `422 Unprocessable Entity` with "Invalid solution"
- `429 Too Many Requests` with `Captcha-Puzzle` header
- `429 Too Many Requests` without puzzle (rate limiting)
- `500 Internal Server Error` (retryable)

### Test Files

```
src/
├── services/
│   └── __tests__/
│       ├── dbSchenkerClient.test.ts
│       └── browserWorker.test.ts
└── carriers/
    └── __tests__/
        ├── DbSchenkerAdapter.test.ts
        └── DbSchenkerBrowserAdapter.test.ts
```

## Migration Path

1. **Phase 1:** Add error handling for 422 (current)
2. **Phase 2:** Implement browser worker service
3. **Phase 3:** Implement browser adapter
4. **Phase 4:** Add adapter selection/factory
5. **Phase 5:** Update MCP server to use factory
6. **Phase 6:** Add tests and documentation

## Configuration

### Environment Variables

```bash
# Adapter selection
DBSCHENKER_ADAPTER=http|browser  # Default: http

# Browser worker settings
BROWSER_HEADLESS=true|false       # Default: false (for CAPTCHA solving)
BROWSER_TIMEOUT=30000            # Default: 30000ms
BROWSER_CACHE_TTL=60000          # Default: 60000ms
```

## Benefits

1. **Reliable Access:** Browser execution allows CAPTCHA to work naturally
2. **No Reverse Engineering:** Uses browser's built-in CAPTCHA solving
3. **Transparent:** Same interface as HTTP adapter
4. **Fallback:** Can use HTTP adapter when browser unavailable
5. **Caching:** Reduces browser operations for repeated requests

## Limitations

1. **Resource Intensive:** Browser requires more memory/CPU
2. **Slower:** Browser operations are slower than HTTP
3. **Manual CAPTCHA:** Still requires human to solve CAPTCHA
4. **Single Browser:** Queue serializes requests (can be parallelized later)

