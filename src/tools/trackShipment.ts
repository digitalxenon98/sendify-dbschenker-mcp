import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  fetchShipmentDetailsLandSE,
  fetchTripLandSE,
  searchShipment,
} from "../services/dbSchenkerClient.js";

/* ✅ MUST be a Zod object */
const inputSchema = z.object({
  reference: z
    .string()
    .min(3)
    .describe("DB Schenker tracking reference number (e.g. 1806203236)"),
});

function normalizeSenderReceiver(details: any) {
  const loc = details?.location ?? {};

  // Public API often exposes location but not personal names/addresses.
  const sender = loc.collectFrom ?? loc.shipperPlace ?? null;
  const receiver = loc.deliverTo ?? loc.consigneePlace ?? null;

  return { sender, receiver };
}

function normalizePackages(details: any) {
  const goods = details?.goods ?? {};
  const packages = Array.isArray(details?.packages) ? details.packages : [];

  return {
    goods: {
      pieces: goods?.pieces ?? null,
      weight: goods?.weight ?? null,
      volume: goods?.volume ?? null,
      dimensions: goods?.dimensions ?? [],
      loadingMeters: goods?.loadingMeters ?? null,
    },
    packages: packages.map((p: any) => ({
      id: p?.id ?? null,
      events: Array.isArray(p?.events)
        ? p.events.map((e: any) => ({
            code: e?.code ?? null,
            date: e?.date ?? null,
            location: e?.location ?? null,
            countryCode: e?.countryCode ?? null,
          }))
        : [],
    })),
  };
}

function normalizeTrackingHistory(details: any, trip: any) {
  const events = Array.isArray(details?.events) ? details.events : [];

  const history = events.map((e: any) => ({
    code: e?.code ?? null,
    timestamp: e?.date ?? null,
    description: e?.comment ?? null,
    location: e?.location?.name ?? null,
    locationCode: e?.location?.code ?? null,
    countryCode: e?.location?.countryCode ?? null,
    reasons: Array.isArray(e?.reasons)
      ? e.reasons.map((r: any) => ({
          code: r?.code ?? null,
          description: r?.description ?? null,
        }))
      : [],
  }));

  const tripPoints = Array.isArray(trip?.trip)
    ? trip.trip.map((t: any) => ({
        code: t?.lastEventCode ?? null,
        timestamp: t?.lastEventDate ?? null,
        latitude: t?.latitude ?? null,
        longitude: t?.longitude ?? null,
      }))
    : [];

  return { history, tripPoints };
}

export function registerTrackShipmentTool(server: McpServer) {
  server.registerTool(
    "track_shipment",
    {
      title: "Track shipment",
      description:
        "Track a DB Schenker shipment by reference number and return structured shipment details and tracking history.",
      inputSchema,
    },
    async ({ reference }) => {
      try {
        // 1) Search -> get STT
        const search = await searchShipment(reference);

        if (!search?.result?.length) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    ok: false,
                    error: "NOT_FOUND",
                    message: "No shipment found for that reference number.",
                    reference,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const top = search.result[0];
        const stt = top?.stt;

        if (!stt) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    ok: false,
                    error: "INVALID_RESPONSE",
                    message: "Shipment found but missing STT identifier.",
                    reference,
                    searchResult: top,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // 2) Details + Trip in parallel
        const [details, trip] = await Promise.all([
          fetchShipmentDetailsLandSE(stt),
          fetchTripLandSE(stt),
        ]);

        const { sender, receiver } = normalizeSenderReceiver(details);
        const pkg = normalizePackages(details);
        const tracking = normalizeTrackingHistory(details, trip);

        const response = {
          ok: true,
          reference,
          shipment: {
            id: top.id ?? null,
            stt: top.stt ?? null,
            transportMode: top.transportMode ?? null,
            progressPercent: top.percentageProgress ?? null,
            lastEventCode: top.lastEventCode ?? null,
            route: {
              fromLocation: top.fromLocation ?? null,
              toLocation: top.toLocation ?? null,
            },
            startDate: top.startDate ?? null,
            endDate: top.endDate ?? null,
          },
          sender,
          receiver,
          packageDetails: pkg.goods,
          packages: pkg.packages, // bonus: per-package events
          trackingHistory: tracking.history,
          trip: {
            start: trip?.start ?? null,
            end: trip?.end ?? null,
            points: tracking.tripPoints,
          },
          rawHints: {
            product: details?.product ?? null,
            activeStep: details?.progressBar?.activeStep ?? null,
            deliveryDate: details?.deliveryDate ?? null,
            references: details?.references ?? null,
          },
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        // Check if error is due to HTTP 429 rate limiting
        const isRateLimited = errorMessage.includes("HTTP 429") || errorMessage.includes("429");

        const errorResponse: {
          ok: false;
          error: string;
          message: string;
          reference: string;
          details: string;
          stack?: string;
          hint?: string;
        } = {
          ok: false,
          error: "API_ERROR",
          message: "Failed to fetch shipment data from DB Schenker API.",
          reference,
          details: errorMessage,
          ...(errorStack && { stack: errorStack }),
          ...(isRateLimited && { hint: "DB Schenker API rate-limited the request. Please retry later." }),
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(errorResponse, null, 2),
            },
          ],
        };
      }
    }
  );
}
