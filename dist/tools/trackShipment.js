import { z } from "zod";
import { DbSchenkerAdapter } from "../carriers/DbSchenkerAdapter.js";
/* ✅ MUST be a Zod object */
const inputSchema = z.object({
    reference: z
        .string()
        .min(3)
        .describe("DB Schenker tracking reference number (e.g. 1806203236)"),
});
const adapter = new DbSchenkerAdapter();
export function registerTrackShipmentTool(server) {
    server.registerTool("track_shipment", {
        title: "Track shipment",
        description: "Track a DB Schenker shipment by reference number and return structured shipment details and tracking history.",
        inputSchema,
    }, async ({ reference }) => {
        const result = await adapter.track(reference);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    });
}
//# sourceMappingURL=trackShipment.js.map
//# sourceMappingURL=trackShipment.js.map