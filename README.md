# DB Schenker Shipment Tracker MCP Server

An MCP (Model Context Protocol) server that tracks DB Schenker shipments by reference number, providing structured shipment information including sender/receiver details, package information, and complete tracking history.
The DB Schenker public API is rate-limited. This implementation handles rate limits reliably and returns structured error messages when limits are encountered.

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

**Error Response (Rate Limited):**
```json
{
  "ok": false,
  "error": "API_ERROR",
  "message": "Failed to fetch shipment data from DB Schenker API.",
  "reference": "1806203236",
  "details": "HTTP 429 Too Many Requests...",
  "hint": "DB Schenker API rate-limited the request. Please retry later."
}
```

### Manual Testing (Node.js)

You can also test the server manually by sending MCP protocol messages via stdio, though this requires understanding the MCP protocol format.

## Rate Limiting & Reliability

The DB Schenker public API enforces rate limits to ensure fair usage and system stability. This implementation includes several mechanisms to handle rate limiting gracefully:

- **Automatic Retries**: Failed requests due to rate limiting (HTTP 429) are automatically retried with exponential backoff, providing up to 3 retry attempts with increasing delays.

- **Exponential Backoff**: Each retry waits progressively longer before attempting again, reducing the likelihood of hitting rate limits on subsequent attempts.

- **Response Caching**: Successful API responses are cached in memory for 60 seconds, significantly reducing the number of API calls for repeated queries within the cache window.

- **Graceful Error Handling**: When rate limits are encountered, the tool returns clear error messages with helpful hints, allowing users to understand the situation and retry when appropriate.

All HTTP 429 responses are handled transparently, and users will receive informative error messages if rate limits persist after all retry attempts are exhausted.
