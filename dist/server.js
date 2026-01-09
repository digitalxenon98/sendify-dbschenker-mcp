#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTrackShipmentTool } from "./tools/trackShipment.js";
// MCP servers must only communicate via JSON-RPC messages on stdio.
// Any console output will break the protocol. Ensure all errors are
// handled and returned as proper MCP error responses.
const server = new McpServer({
    name: "db-schenker-tracker",
    version: "1.0.0",
}, {
    instructions: "Track DB Schenker shipments by reference number",
});
registerTrackShipmentTool(server);
// Handle unhandled errors gracefully without outputting to console
process.on("unhandledRejection", (reason) => {
    // Errors should be handled by the MCP server framework
    // Don't output to console as it breaks the protocol
});
process.on("uncaughtException", (error) => {
    // Errors should be handled by the MCP server framework
    // Don't output to console as it breaks the protocol
    process.exit(1);
});
const transport = new StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=server.js.map