# DB Schenker Shipment Tracker MCP Server

An MCP (Model Context Protocol) server that tracks DB Schenker shipments by reference number, providing structured shipment information including sender/receiver details, package information, and complete tracking history.

## CAPTCHA Notice

The DB Schenker tracking endpoint is protected by browser-level CAPTCHA. Server-side requests are intentionally treated as operating against a hard system boundary rather than a generic public API. When CAPTCHA blocking is detected, the system fails fast with a structured error response rather than attempting retries or workarounds.

For detailed information about CAPTCHA mechanics, ethical boundaries, retry semantics, and production considerations, see [System Boundaries & Technical Considerations](docs/system-boundaries.md).

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

2. **Build the TypeScript project** (optional, for production)
   ```bash
   npm run build
   ```

   This compiles TypeScript to JavaScript in the `dist/` directory.

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

```json
{
  "mcpServers": {
    "db-schenker-tracker": {
      "command": "node",
      "args": ["/path/to/sendify-dbschenker-mcp/dist/server.js"]
    }
  }
}
```

For development, you can use `tsx` instead:

```json
{
  "mcpServers": {
    "db-schenker-tracker": {
      "command": "tsx",
      "args": ["/path/to/sendify-dbschenker-mcp/src/server.ts"]
    }
  }
}
```

## How to Test the Tool

### Using an MCP Client

1. **Start your MCP client** (e.g., Claude Desktop) with the server configured
2. **Call the tool** with a reference number:
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

**Error Response (CAPTCHA Blocked):**
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

### Manual Testing (Node.js)

You can also test the server manually by sending MCP protocol messages via stdio, though this requires understanding the MCP protocol format.
