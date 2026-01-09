# CAPTCHA Algorithm: Background and Implementation

## Context

The DB Schenker tracking endpoint (`/nges-portal/api/public/tracking-public/`) implements a challenge-response mechanism that requires clients to solve proof-of-work puzzles. This document describes the algorithm's behavior in the browser context and how it is reimplemented in the Node.js server.

## Browser Behavior (Upstream)

When users access the DB Schenker tracking page in a browser, a JavaScript bundle (`main.*.js`) is loaded that handles CAPTCHA solving automatically. The bundle:

1. Intercepts API requests (via `fetch` or `XMLHttpRequest` overrides)
2. Detects `Captcha-Puzzle` headers in HTTP 429 responses
3. Solves the puzzle using a proof-of-work algorithm
4. Generates a `Captcha-Solution` header
5. Retries the request with the solution header

This process is transparent to the user and occurs automatically in the browser's JavaScript execution context.

## CAPTCHA Puzzle Format

### Challenge Header

The server responds with HTTP 429 and a `Captcha-Puzzle` header containing a base64-encoded string:

```
Captcha-Puzzle: <base64-encoded-jwt-list>
```

The decoded value is a comma-separated list of JWT tokens. Each JWT contains:
- Header: Standard JWT header
- Payload: Contains a `puzzle` field (base64-encoded binary data)
- Signature: JWT signature

### Puzzle Data Structure

The `puzzle` field in the JWT payload is base64-encoded binary data (minimum 32 bytes). Key bytes:
- Bytes 0-31: Puzzle data used for hashing
- Byte 13: Used in target calculation
- Byte 14: Used in target calculation

The target threshold is calculated as:
```
target = puzzle[14] * 2^(8 * (puzzle[13] - 3))
```

### Solution Format

The solution is a base64-encoded JSON array:

```json
[
  { "jwt": "<original-jwt-token>", "solution": "<base64-nonce>" },
  { "jwt": "<original-jwt-token>", "solution": "<base64-nonce>" },
  ...
]
```

Each solution entry pairs the original JWT token with a base64-encoded nonce (8 bytes, little-endian) that satisfies the proof-of-work requirement.

## Proof-of-Work Algorithm

The algorithm implements a proof-of-work system:

1. **Extract puzzle data**: Parse JWT tokens from `Captcha-Puzzle` header, decode the `puzzle` field from each JWT payload
2. **Calculate target**: Compute the target threshold from puzzle bytes 13 and 14
3. **Search for nonce**: Iterate through nonce values starting from 0
4. **Compute hash**: For each nonce, compute `double SHA-256(nonce || puzzle[0:32])`
5. **Check threshold**: If the hash value (as BigInt) is less than the target, the nonce is valid
6. **Encode solution**: Convert the nonce to 8-byte little-endian format, base64-encode it
7. **Format response**: Create JSON array with JWT-solution pairs, base64-encode the entire array

The hash computation uses:
- Input: 40 bytes total (32 bytes of puzzle data + 8 bytes of nonce)
- Algorithm: Double SHA-256 (SHA-256 applied twice)
- Comparison: Hash value (interpreted as little-endian BigInt) must be less than target

## Node.js Implementation

The server-side implementation (`src/services/captchaSolver.ts`) reimplements the same proof-of-work algorithm:

### Algorithm Analysis

The algorithm was analyzed from the browser JavaScript bundle (`main.*.js`) and reimplemented for Node.js compatibility. The implementation:

- Parses `Captcha-Puzzle` headers identically to the browser version
- Extracts puzzle data from JWT payloads
- Calculates target thresholds using the same formula
- Performs nonce search with the same hash computation
- Generates solutions in the same format

### Implementation Details

**Parsing** (`parsePuzzle`):
- Base64-decodes the puzzle header
- Splits comma-separated JWT tokens
- Extracts puzzle data from each JWT payload

**Target Calculation** (`calculateTarget`):
- Reads bytes 13 and 14 from puzzle data
- Computes: `target = puzzle[14] * 2^(8 * (puzzle[13] - 3))`
- Returns BigInt for precise arithmetic

**Hash Computation** (`doubleSha256`, `computeHash`):
- Concatenates puzzle[0:32] with 8-byte nonce
- Applies SHA-256 twice
- Converts result to BigInt (little-endian)

**Nonce Search** (`solvePuzzle`):
- Iterates nonce values starting from 0
- For each nonce, computes hash and compares to target
- Returns first nonce where `hash < target`
- Encodes solution as base64

**Solution Formatting** (`solveCaptcha`):
- Solves each puzzle in the header
- Creates JSON array with JWT-solution pairs
- Base64-encodes the entire array for `Captcha-Solution` header

### Integration

The solver is integrated into the HTTP client (`src/services/dbSchenkerClient.ts`):

1. Client makes initial request without `Captcha-Solution` header
2. Server responds with HTTP 429 and `Captcha-Puzzle` header
3. Client calls `solveCaptcha(puzzleHeader)` to generate solution
4. Client retries request with `Captcha-Solution` header
5. Server validates solution and returns data (HTTP 200) or rejects (HTTP 422)

## Limitations and Assumptions

### Technical Limitations

- **Puzzle format**: Assumes puzzle data is at least 32 bytes. Puzzles shorter than 15 bytes will fail target calculation.
- **Nonce range**: Nonce search starts at 0 and increments. Very high target values may require large nonces, though typical puzzles solve quickly (< 100ms).
- **Solution expiration**: Solutions are time-sensitive. If too much time elapses between puzzle generation and solution submission, the server may reject with HTTP 422.
- **JWT parsing**: Assumes standard JWT format (header.payload.signature). Malformed JWTs will cause parsing errors.

### Algorithm Assumptions

- **Hash function**: Assumes double SHA-256 matches browser implementation exactly.
- **Target calculation**: Assumes the formula `puzzle[14] * 2^(8 * (puzzle[13] - 3))` is correct and matches browser behavior.
- **Byte ordering**: Assumes little-endian encoding for nonces and hash interpretation.
- **Puzzle structure**: Assumes puzzle bytes 0-31 are used for hashing, bytes 13-14 for target calculation.

### Compatibility Considerations

- The implementation assumes the browser algorithm's behavior remains stable. Changes to the browser bundle's algorithm may require updates to the Node.js implementation.
- Puzzle difficulty (target values) may vary. The implementation handles variable difficulty through the target calculation formula.
- Multiple JWTs in a single puzzle header are solved in parallel, matching browser behavior.
