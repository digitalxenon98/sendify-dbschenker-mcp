#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTrackShipmentTool } from "./tools/trackShipment.js";
const server = new McpServer({
    name: "db-schenker-tracker",
    version: "1.0.0",
}, {
    instructions: "Track DB Schenker shipments by reference number",
});
registerTrackShipmentTool(server);
const transport = new StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=server.js.map