# CAPTCHA Solver Analysis

Based on captured data from the browser extension, here's what we know about the CAPTCHA solving process.

## Solution Format

The `Captcha-Solution` header is a **base64-encoded JSON array**:

```json
[
  { "jwt": "...", "solution": "..." },
  { "jwt": "...", "solution": "..." },
  { "jwt": "...", "solution": "..." }
]
```

## Puzzle Format

The `Captcha-Puzzle` header is a **comma-separated list of base64-encoded JWTs**:

```
<base64-jwt-1>,<base64-jwt-2>,<base64-jwt-3>
```

## JWT Structure

Each JWT in the puzzle has this structure:

```
eyJhbGciOiJIUzI1NiJ9.<payload>.<signature>
```

### Payload Structure

```json
{
  "puzzle": "<base64-encoded-puzzle-data>",
  "iat": 1767964951,  // Issued at timestamp
  "exp": 1767965011   // Expiration timestamp
}
```

### Puzzle Data

The `puzzle` field in the payload is itself base64-encoded. When decoded, it appears to contain binary or encoded data that needs to be processed.

## Solution Generation

Based on captured examples:

- **Solution 1**: `"2jMAAAAAAAA="`
- **Solution 2**: `"6QIAAAAAAA=="`
- **Solution 3**: `"bBgAAAAAAA=="`

Solutions are:
- Short base64 strings (8-12 characters when decoded)
- Always end with `==` (base64 padding)
- Generated from the JWT's puzzle data

## What We Need

To fully implement the solver, we need:

1. **The actual solving algorithm** from `main.*.js`:
   - How it processes the puzzle data
   - What computation it performs
   - How it generates the solution string

2. **Dependencies**:
   - Does it use crypto APIs?
   - Does it use Web APIs?
   - Does it require DOM access?

3. **Inputs**:
   - Is it just the puzzle data?
   - Does it use timestamps?
   - Does it use session/cookie data?
   - Does it use browser fingerprinting?

## Next Steps

1. **Extract the algorithm** from the JavaScript bundle:
   - Use the debug script to download `main.*.js`
   - Search for CAPTCHA-related functions
   - Identify the solving logic

2. **Reverse engineer the algorithm**:
   - Understand the computation
   - Identify dependencies
   - Replicate in Node.js

3. **Test the implementation**:
   - Use captured puzzles
   - Verify solutions match captured solutions
   - Test with live requests

## Current Implementation

The `captchaSolver.ts` file provides:
- ✅ Puzzle parsing (extracts JWTs)
- ✅ JWT payload extraction
- ✅ Solution format encoding
- ❌ Actual solving algorithm (placeholder)

## How to Find the Algorithm

1. Run `npm run debug-captcha` to download the JavaScript bundle
2. Search for functions containing:
   - "captcha"
   - "puzzle"
   - "solution"
   - "jwt"
3. Look for:
   - Function definitions
   - Variable assignments
   - Crypto operations
   - Base64 encoding/decoding
4. Trace the flow:
   - Where puzzle is received
   - How it's processed
   - How solution is generated

## Example Analysis

From the captured data, we can see:

```javascript
// JWT payload example
{
  "puzzle": "AAAAAAAA47WbXTBBNGCEKAAAAAAAAAAAAAAAAAAAAAAACYZo+XAySDkB79r6EXkjI4Sx7HFkZ2vWbgImJ/EPIPxQ==",
  "iat": 1767964951,
  "exp": 1767965011
}

// Corresponding solution
"2jMAAAAAAAA="
```

The algorithm must transform the puzzle data into this short solution string.

