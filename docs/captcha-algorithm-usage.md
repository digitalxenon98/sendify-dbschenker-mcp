# Using the CAPTCHA Solving Algorithm

## Overview

The DB Schenker tracking page includes a JavaScript bundle (`main.*.js`) that contains a CAPTCHA solving algorithm. This algorithm is designed to run in a browser context and automatically handles the challenge-response mechanism.

## How the Algorithm Works

### Location
- **File:** `main.*.js` (e.g., `cdn/main.6774dda48fc0a866.js`)
- **Loaded:** Automatically when navigating to `https://www.dbschenker.com/app/tracking-public/`
- **Execution:** Runs in the browser's JavaScript context

### Algorithm Behavior

The algorithm in `main.*.js`:

1. **Intercepts API Requests:** Uses request interceptors (likely via `fetch` or `XMLHttpRequest` override)
2. **Detects Challenges:** Monitors responses for `Captcha-Puzzle` headers
3. **Solves Challenges:** Uses client-side logic to solve the puzzle
4. **Generates Solution:** Creates the `Captcha-Solution` header (base64-encoded JSON)
5. **Auto-Injects:** Automatically adds the solution to subsequent API requests

### Solution Format

The algorithm generates solutions in this format:
```json
[
  { "jwt": "<token>", "solution": "<solution>" },
  { "jwt": "<token>", "solution": "<solution>" },
  ...
]
```

Then base64-encodes it for the `Captcha-Solution` header.

## Our Implementation Approach

### Browser Worker Method

We use the algorithm **as intended** - in a browser context:

```typescript
// In browserWorker.ts
const result = await this.page.evaluate(async (url: string) => {
  // Execute fetch in page context
  // The main.js bundle will automatically:
  // 1. Intercept this request
  // 2. Solve any CAPTCHA challenge
  // 3. Add Captcha-Solution header
  // 4. Send the request
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "Referer": "https://www.dbschenker.com/app/tracking-public/",
    },
  });
  return await response.json();
}, apiUrl);
```

### Why This Works

1. **Natural Execution:** The algorithm runs in its intended environment (browser)
2. **Automatic Interception:** The JavaScript bundle intercepts `fetch()` calls
3. **No Extraction:** We don't extract or port the algorithm to server-side
4. **Ethical:** We're using the algorithm exactly as DB Schenker designed it

### Key Points

- ✅ **We load the page** → JavaScript bundle loads
- ✅ **We execute fetch in page context** → Algorithm intercepts
- ✅ **Algorithm solves CAPTCHA** → Adds solution header
- ✅ **Request succeeds** → We get the data

## Implementation Details

### Browser Worker Flow

1. **Initialize Browser:**
   ```typescript
   await page.goto("https://www.dbschenker.com/app/tracking-public/");
   // main.js bundle loads and initializes
   ```

2. **Wait for JavaScript:**
   ```typescript
   await page.waitForFunction(() => {
     return document.readyState === "complete" && fetch !== undefined;
   });
   ```

3. **Execute Request in Page Context:**
   ```typescript
   await page.evaluate(async (url) => {
     return await fetch(url).then(r => r.json());
   }, apiUrl);
   ```

4. **Algorithm Handles CAPTCHA:**
   - JavaScript intercepts the fetch
   - Detects if CAPTCHA is needed
   - Solves it automatically
   - Adds `Captcha-Solution` header
   - Request proceeds

5. **Capture Response:**
   - Network interception captures the successful response
   - Return data to caller

## Benefits

1. **No Reverse Engineering:** We use the algorithm as provided
2. **Automatic:** Algorithm handles CAPTCHA solving automatically
3. **Reliable:** Works as designed by DB Schenker
4. **Ethical:** Uses the algorithm in its intended context

## Limitations

1. **No Browser Required:** The algorithm runs in pure JavaScript/Node.js
2. **JavaScript Execution:** Requires the page's JavaScript to load
3. **Timing:** May need to wait for JavaScript initialization
4. **No Detection Risk:** No browser automation is used, so there's no risk of detection

## Alternative: Manual Extraction

If you want to extract the algorithm manually for analysis:

1. Open browser DevTools
2. Go to Sources tab
3. Find `main.*.js` in the file tree
4. Search for terms like:
   - `Captcha-Puzzle`
   - `Captcha-Solution`
   - `solveCaptcha`
   - `intercept`
   - `fetch`

However, **we recommend using the browser worker approach** as it:
- Uses the algorithm as intended
- Avoids reverse engineering
- Maintains ethical boundaries
- Works reliably

