# CAPTCHA Verification & Testing Guide  
DB Schenker MCP Server

## Purpose

This document describes how the MCP server is verified to correctly handle
DB Schenker’s proof-of-work CAPTCHA mechanism and how the behavior can be tested
locally.

The CAPTCHA solving is fully automatic and transparent to the caller.
No manual intervention or browser interaction is required.

---

## High-Level Behavior

When calling the `track_shipment` tool:

1. The server sends a request to the DB Schenker public tracking endpoint.
2. If the upstream service responds with HTTP 429 and a `Captcha-Puzzle` header:
   - The server detects that the response represents a CAPTCHA challenge,
     not a rate limit.
3. The server automatically:
   - Parses the puzzle data
   - Solves the required proof-of-work challenge
   - Generates a valid `Captcha-Solution` header
4. The request is retried automatically with the solution attached.
5. If accepted, the server returns tracking data to the caller.

This entire flow happens internally and synchronously.

---

## What This Confirms

- CAPTCHA challenges are treated as a hard boundary, not a transient failure
- CAPTCHA challenges are distinguished from rate limiting
- CAPTCHA solving is deterministic and automatic
- The MCP tool interface remains clean and stable

---

## Testing Methods

### Method 1: MCP Inspector (Recommended)

1. Build the project:
   ```bash
   npm run build
   ```

2. Start MCP Inspector:
   ```bash
   npx @modelcontextprotocol/inspector
   ```

3. Configure the server:
   - Command: `node`
   - Args: `/absolute/path/to/sendify-dbschenker-mcp/dist/server.js`
   - Transport: `stdio`

4. Open the Tools tab and call:
   - Tool: `track_shipment`
   - Input: a shipment reference (e.g. `1806203236`)

---

### Method 2: Claude Desktop

1. Edit your MCP configuration file:

   - Linux: `~/.config/Claude/claude_desktop_config.json`
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add the server:
   ```json
   {
     "mcpServers": {
       "db-schenker-tracker": {
         "command": "node",
         "args": ["/absolute/path/to/sendify-dbschenker-mcp/dist/server.js"]
       }
     }
   }
   ```

3. Restart Claude Desktop and use the tool normally.

---

### Method 3: Direct Test Script

Run the provided test script:

```bash
npm run test-captcha-flow
```

---

## Expected Behavior

### CAPTCHA Challenge Present
- Initial request returns HTTP 429 with `Captcha-Puzzle`
- Server automatically retries with `Captcha-Solution`
- Final response returns HTTP 200 with tracking data

### Invalid Reference Number
- CAPTCHA may still be required
- Final response returns a structured NOT_FOUND error

### No CAPTCHA Required
- Request succeeds immediately

---

## Error Handling

### HTTP 422 – Invalid Solution
Possible causes:
- CAPTCHA puzzle expired
- Upstream verification rejected the solution

### HTTP 429 After Solving
Possible causes:
- Upstream rate limiting (not CAPTCHA)
- Session invalidation

---

## Debugging Notes

Temporary debug logging can be added during development:

```ts
console.error("[DEBUG] CAPTCHA detected");
```

IMPORTANT:  
Only use `console.error`.  
Using `console.log` will break the MCP stdio protocol.

---

## Verification Checklist

- [ ] Project builds successfully
- [ ] MCP Inspector connects without errors
- [ ] `track_shipment` tool is available
- [ ] CAPTCHA challenges are solved automatically
- [ ] Tracking data is returned on success
- [ ] Errors are explicit and non-retryable when appropriate

---

## Summary

The MCP server correctly handles DB Schenker’s CAPTCHA-protected endpoint by
detecting challenges, solving proof-of-work puzzles server-side, and retrying
requests automatically.

From the caller’s perspective, the tool behaves as a standard tracking API
without exposing CAPTCHA complexity.