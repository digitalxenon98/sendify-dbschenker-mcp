# Quick Reference: Implementation Locations

**⚠️ Note:** This document contains references to a browser-worker implementation that is not currently used. The current implementation uses pure JavaScript CAPTCHA solving (see `src/services/captchaSolver.ts`) without browser automation.

## Error Handling (✅ Completed)

### HTTP 422 "Invalid solution" Detection

**File:** `src/services/dbSchenkerClient.ts`
- **Lines 42-52:** `CaptchaSolutionInvalidError` class definition
- **Lines 264-280:** 422 detection and error throwing
- **Behavior:** Non-retryable, clear error message

**File:** `src/carriers/DbSchenkerAdapter.ts`
- **Lines 162-172:** Error handling for `CaptchaSolutionInvalidError`
- **Response:** Structured error with hint to re-bootstrap

### Error Classification Flow

```
fetchJson() → HTTP Response
  ├─ 429 + Captcha-Puzzle → CaptchaBlockedError
  ├─ 422 + "Invalid solution" → CaptchaSolutionInvalidError ✅ NEW
  ├─ 429 (no puzzle) → Retryable rate limit
  └─ 5xx → Retryable server error
```

## Browser-Worker Implementation (📍 Ready for Enhancement)

### Core Files

~~**`src/services/browserWorker.ts`**~~ (REMOVED - no longer needed)
- **Purpose:** Browser lifecycle and request execution
- **Key Methods:**
  - `initialize()` - Launch browser
  - `track(reference)` - Execute tracking request
  - `shutdown()` - Cleanup
  - `executeTracking()` - Browser automation logic

~~**`src/carriers/DbSchenkerBrowserAdapter.ts`**~~ (REMOVED - no longer needed)
- **Purpose:** Browser-based adapter
- **Implements:** `CarrierAdapter` interface
- **Uses:** `BrowserWorker` for execution

### Integration Points

**`src/tools/trackShipment.ts`** (NEEDS UPDATE)
- **Current:** Uses `DbSchenkerAdapter` directly
- **Future:** Use adapter factory to select HTTP or Browser

**`src/config.ts`** (NEEDS UPDATE)
- **Add:** `adapter: "http" | "browser"` configuration
- **Add:** Browser worker settings

## Testing Locations

### Mock Responses

**Create:** `src/services/__tests__/fixtures/`
- `200-ok-response.json` - Valid shipment data
- `422-invalid-solution.json` - Error response
- `429-captcha-puzzle.json` - Challenge response

### Test Files

**`src/services/__tests__/dbSchenkerClient.test.ts`**
```typescript
describe("fetchJson", () => {
  it("should throw CaptchaSolutionInvalidError on 422", () => {
    // Mock 422 response
    // Assert error type
  });
  
  it("should not retry on 422", () => {
    // Verify no retries
  });
});
```

**`src/services/__tests__/browserWorker.test.ts`**
```typescript
describe("BrowserWorker", () => {
  it("should initialize browser", async () => {
    // Test initialization
  });
  
  it("should queue requests", async () => {
    // Test queue behavior
  });
});
```

## Adapter Factory (📍 To Implement)

**File:** `src/carriers/adapterFactory.ts` (NEW)

```typescript
export function createAdapter(type?: string): CarrierAdapter {
  const adapterType = type || process.env.DBSCHENKER_ADAPTER || "http";
  
  switch (adapterType) {
    case "browser":
      return new DbSchenkerBrowserAdapter();
    case "http":
    default:
      return new DbSchenkerAdapter();
  }
}
```

**Update:** `src/tools/trackShipment.ts`
```typescript
// Replace:
const adapter = new DbSchenkerAdapter();

// With:
const adapter = createAdapter();
```

## Error Response Examples

### HTTP 422 Response
```json
{
  "ok": false,
  "error": "CAPTCHA_SOLUTION_INVALID",
  "message": "The Captcha-Solution header was rejected...",
  "reference": "1806203236",
  "hint": "The Captcha-Solution header is time-sensitive and expires quickly. The server will automatically retry with a fresh solution."
}
```

### HTTP 429 with Puzzle
```json
{
  "status": "blocked",
  "retryable": false,
  "reason": "DB Schenker tracking endpoint is protected...",
  "upstream": {
    "url": "...",
    "status": 429,
    "hasCaptchaPuzzleHeader": true
  }
}
```

## Configuration

### Environment Variables

```bash
# Required
DBSCHENKER_SESSION_FILE=.schenker-session.json

# Optional (future)
DBSCHENKER_ADAPTER=http|browser
BROWSER_HEADLESS=false
BROWSER_TIMEOUT=30000
```

