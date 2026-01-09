# Quick Start: Testing the MCP Server with CAPTCHA Solving

## 🚀 Quick Test

### Step 1: Build the Project
```bash
cd /path/to/sendify-dbschenker-mcp
npm run build
```

Replace `/path/to/sendify-dbschenker-mcp` with the actual path to your project directory.

### Step 2: Test CAPTCHA Flow (Recommended First)
```bash
# This will make a real API request and show you if CAPTCHA solving works
DEBUG_CAPTCHA=1 npm run test-captcha-flow
```

**What to look for:**
- `[CAPTCHA] Puzzle solved in Xms` - Shows CAPTCHA was solved
- `✅ Request succeeded!` - Shows the solution worked
- If you see errors, check the troubleshooting section below

### Step 3: Test with MCP Inspector

1. **Start MCP Inspector:**
   ```bash
   npx @modelcontextprotocol/inspector
   ```

2. **Configure Server:**
   - Open MCP Inspector in your browser
   - **Command**: `node`
   - **Args**: `/absolute/path/to/sendify-dbschenker-mcp/dist/server.js`
   - **Transport**: `stdio`
   - Click "Connect"
   
   Replace `/absolute/path/to/sendify-dbschenker-mcp` with the actual absolute path to your project directory.

3. **Test the Tool:**
   - Go to "Tools" tab
   - Find `track_shipment`
   - Enter reference: `1806203236`
   - Click "Call Tool"
   - Check the response

## 📋 MCP Server Arguments

The server runs with **no arguments** - it communicates via stdio (standard input/output).

**Correct usage:**
```bash
node /absolute/path/to/sendify-dbschenker-mcp/dist/server.js
```

**For MCP Inspector:**
- **Command**: `node`
- **Args**: `/absolute/path/to/sendify-dbschenker-mcp/dist/server.js`
- **No additional arguments needed**

Replace `/absolute/path/to/sendify-dbschenker-mcp` with the actual absolute path to your project directory.

## 🔍 How CAPTCHA Solving Works

When you call `track_shipment`:

1. **Initial Request** → API returns `429` with `Captcha-Puzzle` header
2. **Automatic Solving** → Server extracts puzzle, solves it (proof-of-work)
3. **Retry with Solution** → Server retries request with `Captcha-Solution` header
4. **Success** → API returns `200` with tracking data

**You don't see this process** - it happens automatically and transparently!

## ✅ Verification Checklist

To ensure CAPTCHA solving is working:

- [ ] Run `npm run test-captcha-flow` - should succeed
- [ ] Check for `[CAPTCHA] Puzzle solved` message (if DEBUG_CAPTCHA=1)
- [ ] MCP Inspector can call `track_shipment` successfully
- [ ] No "Invalid solution" (422) errors
- [ ] No persistent 429 errors after solving

## 🐛 Troubleshooting

### Issue: Still getting 429 errors
- The server will automatically solve CAPTCHA puzzles when encountered
- If errors persist, check that the CAPTCHA solver is working correctly

### Issue: "Invalid solution" (422)
- Rare - usually means puzzle expired
- The server will try again on next request
- If persistent, check solver implementation

### Issue: Want to see CAPTCHA solving in action
```bash
# Enable debug logging
DEBUG_CAPTCHA=1 npm run test-captcha-flow
```

## 📝 Example Test Cases

### Test 1: Valid Reference
```
Tool: track_shipment
Input: { "reference": "1806203236" }
Expected: Success with tracking data
```

### Test 2: Invalid Reference
```
Tool: track_shipment
Input: { "reference": "0000000000" }
Expected: Error with "NOT_FOUND"
```

## 🎯 What Happens Behind the Scenes

```
User calls track_shipment("1806203236")
    ↓
MCP Server → DbSchenkerAdapter.track()
    ↓
dbSchenkerClient.fetchJson() → API Request
    ↓
API Response: HTTP 429 + Captcha-Puzzle header
    ↓
captchaSolver.solveCaptcha() → Solves puzzle (proof-of-work)
    ↓
Retry Request with Captcha-Solution header
    ↓
API Response: HTTP 200 + Tracking Data
    ↓
Return to user
```

## 📚 More Information

- **Full Testing Guide**: See `TESTING.md`
- **CAPTCHA Algorithm**: See `src/services/captchaSolver.ts`
- **API Client**: See `src/services/dbSchenkerClient.ts`

