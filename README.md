# DB Schenker Shipment Tracker MCP Server

An MCP (Model Context Protocol) server that tracks DB Schenker shipments by reference number, providing structured shipment information including sender/receiver details, package information, and complete tracking history.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

3. **Test with MCP Inspector:**
   ```bash
   npx @modelcontextprotocol/inspector
   ```
   Then configure:
   - **Command**: `node`
   - **Args**: `/absolute/path/to/this/project/dist/server.js`
   - **Transport**: `stdio`

4. **Use the tool:**
   - In MCP Inspector, go to "Tools" tab
   - Call `track_shipment` with a reference number (e.g., `1806203236`)

The server automatically solves CAPTCHA challenges - no manual setup required!

## CAPTCHA Notice

The DB Schenker tracking endpoint is protected by a **browser-bound challenge-response mechanism** rather than a traditional API key flow. This means:

- The endpoint requires a `Captcha-Solution` header that is generated from puzzle data
- Solutions are **session and timing dependent** - each request needs a fresh solution
- Solutions expire quickly (seconds to minutes) and cannot be reused
- The MCP server automatically solves CAPTCHA puzzles when encountered, so no manual intervention is required

### Error Responses

The system distinguishes between different CAPTCHA-related errors:

- **HTTP 429 + `Captcha-Puzzle` header**: Missing or expired `Captcha-Solution` header
- **HTTP 422 "Invalid solution"**: The `Captcha-Solution` header was rejected (expired/invalid)
- **HTTP 429 without puzzle**: Rate limiting (retryable)

For detailed information about CAPTCHA mechanics, ethical boundaries, retry semantics, and production considerations, see:
- [System Boundaries & Technical Considerations](docs/system-boundaries.md)
- [CAPTCHA Architecture](docs/captcha-architecture.md)

## Setup Instructions

### Prerequisites

- **Node.js**: Version 18 or higher
- **npm**: Comes bundled with Node.js

### Environment Setup

1. **Clone or download this repository**
   ```bash
   git clone https://github.com/digitalxenon98/sendify-dbschenker-mcp
   cd sendify-dbschenker-mcp
   ```

2. **Verify Node.js installation**
   ```bash
   node --version  # Should be v18 or higher
   npm --version
   ```

## Build/Install Dependencies

1. **Install all dependencies**
   ```bash
   npm install
   ```

   This will install:
   - Runtime dependencies: `@modelcontextprotocol/sdk`, `zod`
   - Development dependencies: `typescript`, `tsx`, `@types/node`

   **Note:** The server uses a pure JavaScript CAPTCHA solving algorithm - no browser automation is required.

## Build the TypeScript Project
   ```bash
   npm run build
   ```

   This compiles TypeScript to JavaScript in the `dist/` directory.

## CAPTCHA Solving

The MCP server **automatically solves CAPTCHA puzzles** when encountered. When the API returns a CAPTCHA challenge, the server:

1. Extracts the puzzle from the `Captcha-Puzzle` header
2. Automatically solves it using a proof-of-work algorithm
3. Retries the request with the `Captcha-Solution` header
4. Returns the tracking data on success

This process is **completely transparent** - you don't need to do anything manually. The server handles CAPTCHA solving automatically for all requests.

## How to Run the MCP Server

### Development Mode

Run the server directly with TypeScript (no build required):

```bash
npm run dev
```

The server will start and communicate via stdio (standard input/output), which is the standard way MCP servers operate.

### Production Mode

1. First, build the project:
   ```bash
   npm run build
   ```

2. Then run the compiled JavaScript:
   ```bash
   npm start
   ```

### MCP Client Configuration

To use this MCP server with an MCP client (like Claude Desktop), add it to your MCP configuration:

**Production (after building):**
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

**Development (using TypeScript directly):**
```json
{
  "mcpServers": {
    "db-schenker-tracker": {
      "command": "npx",
      "args": ["-y", "tsx", "/absolute/path/to/sendify-dbschenker-mcp/src/server.ts"]
    }
  }
}
```

**Important:** Use absolute paths in the configuration. Replace `/absolute/path/to/sendify-dbschenker-mcp` with the actual path to your project directory.

## How to Test the Tool

### Using MCP Inspector (Recommended for Testing)

MCP Inspector is a web-based tool for testing MCP servers. It's the easiest way to test the server before integrating it with other clients.

1. **Build the project** (if not already built):
   ```bash
   npm run build
   ```

2. **Start MCP Inspector**:
   ```bash
   npx @modelcontextprotocol/inspector
   ```

3. **Configure the server in MCP Inspector**:
   - Open the MCP Inspector in your browser (usually opens automatically)
   - In the connection settings:
     - **Command**: `node`
     - **Args**: `/absolute/path/to/sendify-dbschenker-mcp/dist/server.js`
     - **Transport**: `stdio` (default)
   - Click "Connect"

4. **Test the tool**:
   - Navigate to the "Tools" tab
   - Find `track_shipment` in the list
   - Enter a reference number (e.g., `1806203236`)
   - Click "Call Tool"
   - View the response

**Note:** Replace `/absolute/path/to/sendify-dbschenker-mcp` with the actual absolute path to your project directory. You can get the absolute path by running `pwd` in your project directory.

### Using an MCP Client (Claude Desktop, etc.)

1. **Configure your MCP client** with the server (see [MCP Client Configuration](#mcp-client-configuration) above)
2. **Start your MCP client** (e.g., Claude Desktop)
3. **Call the tool** with a reference number:
   ```
   track_shipment(reference: "1806203236")
   ```

### Example Reference Numbers

You can test with these reference numbers:

- `1806203236`
- `1806290829`
- `1806273700`
- `1806272330`
- `1806271886`

### Expected Response Format

**Success Response:**
```json
{
  "ok": true,
  "reference": "1806203236",
  "shipment": {
    "id": "...",
    "stt": "...",
    "transportMode": "LAND",
    ...
  },
  "sender": {...},
  "receiver": {...},
  "packageDetails": {...},
  "trackingHistory": [...],
  ...
}
```

**Error Response (Not Found):**
```json
{
  "ok": false,
  "error": "NOT_FOUND",
  "message": "No shipment found for that reference number.",
  "reference": "1806203236"
}
```

**Error Response (API Error):**
```json
{
  "ok": false,
  "error": "API_ERROR",
  "message": "Failed to fetch shipment data from DB Schenker API.",
  "reference": "1806203236",
  "details": "HTTP 429 Too Many Requests...",
  "hint": "The upstream service rejected the request. Retry behavior depends on the failure type."
}
```

**Error Response (CAPTCHA Solution Invalid - 422):**
```json
{
  "ok": false,
  "error": "CAPTCHA_SOLUTION_INVALID",
  "message": "The Captcha-Solution header was rejected by the server. The solution may have expired.",
  "reference": "1806203236",
  "details": "HTTP 422 Unprocessable Entity :: Invalid solution",
  "hint": "The Captcha-Solution header is time-sensitive and expires quickly. The server will automatically retry with a fresh solution.",
  "retryable": true
}
```

**Error Response (CAPTCHA Blocked - 429):**
```json
{
  "status": "blocked",
  "retryable": false,
  "reason": "Upstream service requires browser CAPTCHA",
  "details": "This endpoint is protected by anti-bot measures and cannot be accessed server-side.",
  "upstream": {
    "url": "...",
    "status": 429,
    "hasCaptchaPuzzleHeader": true
  }
}
```

### Testing CAPTCHA Solving

To verify that CAPTCHA solving works correctly, you can use the test script:

```bash
npm run test-captcha-flow
```

This will:
1. Make a real API request to DB Schenker
2. Automatically solve any CAPTCHA challenge encountered
3. Display debug information about the solving process (automatically enabled)
4. Show whether the request succeeded

**Expected output:**
- `[CAPTCHA] Puzzle solved in Xms` - Shows CAPTCHA was solved successfully
- `✅ Request succeeded!` - Shows the solution worked and data was retrieved

**Note:** Debug output is automatically enabled by the test script. You don't need to set `DEBUG_CAPTCHA=1` manually.

### Manual Testing (Advanced)

You can also test the server manually by sending MCP protocol messages via stdio, though this requires understanding the MCP protocol format. For most users, MCP Inspector (above) is the recommended testing method.
