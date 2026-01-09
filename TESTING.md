# Testing Guide for DB Schenker MCP Server

## Overview

The MCP server automatically solves CAPTCHA puzzles when they are encountered. This guide explains how to test the server and verify CAPTCHA solving works correctly.

## How CAPTCHA Solving Works

1. **Initial Request**: When you call `track_shipment`, the server makes an API request to DB Schenker
2. **CAPTCHA Challenge**: If the server returns HTTP 429 with a `Captcha-Puzzle` header, the solver activates
3. **Automatic Solving**: The solver:
   - Parses the puzzle header
   - Extracts puzzle data from JWTs
   - Calculates target values
   - Finds valid nonces (proof-of-work)
   - Generates the `Captcha-Solution` header
4. **Retry with Solution**: The server automatically retries the request with the `Captcha-Solution` header
5. **Success**: If the solution is valid, you get the tracking data

## Testing Methods

### Method 1: Using MCP Inspector (Recommended)

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Start MCP Inspector**:
   ```bash
   npx @modelcontextprotocol/inspector
   ```

3. **Configure the server**:
   - In MCP Inspector, use these settings:
     - **Command**: `node`
     - **Args**: `/absolute/path/to/sendify-dbschenker-mcp/dist/server.js`
     - **Transport**: `stdio`
   
   Replace `/absolute/path/to/sendify-dbschenker-mcp` with the actual absolute path to your project directory.

4. **Test the tool**:
   - Open the "Tools" tab
   - Find `track_shipment`
   - Enter a reference number (e.g., `1806203236`)
   - Click "Call Tool"
   - Check the response

### Method 2: Using Claude Desktop

1. **Configure Claude Desktop**:
   Edit your MCP settings file (location varies by OS):
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. **Add the server**:
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
   
   Replace `/absolute/path/to/sendify-dbschenker-mcp` with the actual absolute path to your project directory.

3. **Restart Claude Desktop** and use the tool

### Method 3: Direct Node.js Test Script

Use the provided test script (see below) to verify CAPTCHA solving works.

## Verifying CAPTCHA Solving

### What to Look For

1. **First Request (429)**: The initial request should return HTTP 429 with `Captcha-Puzzle` header
2. **Automatic Retry**: The server should automatically retry with `Captcha-Solution` header
3. **Success (200)**: The retry should succeed with HTTP 200 and return tracking data

### Expected Behavior

- **No manual intervention needed**: CAPTCHA solving happens automatically
- **Fast solving**: Most puzzles solve in < 100ms
- **Transparent to user**: The tool just works - you don't see the CAPTCHA solving process

### Error Cases

- **422 Invalid Solution**: If the solution is rejected, you'll get an error. This is rare but can happen if:
  - The puzzle expired (solutions are time-limited)
  - There's a bug in the solver
- **429 Still Blocked**: If you still get 429 after solving, the session may be invalid

## Test Script

Run the test script to verify CAPTCHA solving:

```bash
npm run test-captcha-flow
```

This script:
1. Makes a test API request
2. Captures any CAPTCHA puzzle
3. Solves it automatically
4. Retries with the solution
5. Shows the results

## Debugging

### Enable Debug Logging

To see what's happening internally, you can temporarily add logging to `dbSchenkerClient.ts`:

```typescript
// In fetchJson, after detecting CAPTCHA:
console.error(`[DEBUG] CAPTCHA detected, solving puzzle...`);
console.error(`[DEBUG] Puzzle header: ${puzzleHeader.substring(0, 100)}...`);
console.error(`[DEBUG] Solution: ${solution.substring(0, 100)}...`);
```

**Note**: Only use `console.error` for debugging - `console.log` breaks the MCP protocol!


## Common Issues

### Issue: "Invalid solution" (422)

**Possible causes**:
- Puzzle expired (solutions are time-limited)
- Bug in solver algorithm

**Solution**: The server will automatically try again on the next request. If it persists, check the solver implementation.

### Issue: Still getting 429 after solving

**Possible causes**:
- Server-side rate limiting (not CAPTCHA)
- CAPTCHA solver needs to regenerate solution

**Solution**: The server will automatically retry with a fresh CAPTCHA solution. If issues persist, check the CAPTCHA solver implementation.

## Testing Checklist

- [ ] Server builds without errors (`npm run build`)
- [ ] MCP Inspector can connect to the server
- [ ] `track_shipment` tool is available
- [ ] Tool accepts a reference number
- [ ] Tool automatically solves CAPTCHAs (check network logs if possible)
- [ ] Tool returns tracking data on success
- [ ] Tool handles errors gracefully

## Example Test Cases

### Test Case 1: Valid Reference Number
```
Input: reference = "1806203236"
Expected: Success with tracking data
```

### Test Case 2: Invalid Reference Number
```
Input: reference = "0000000000"
Expected: Error response with "NOT_FOUND"
```

### Test Case 3: CAPTCHA Challenge
```
Input: reference = "1806203236" (when CAPTCHA is required)
Expected: Automatic solving and success
```

## Performance Notes

- **CAPTCHA solving time**: Typically 10-100ms per puzzle
- **Multiple JWTs**: If puzzle contains multiple JWTs, all are solved in parallel
- **No rate limiting**: The solver doesn't add artificial delays

