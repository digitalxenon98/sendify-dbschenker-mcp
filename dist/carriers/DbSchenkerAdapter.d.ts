import type { CarrierAdapter, TrackingResult } from "./CarrierAdapter.js";
export declare class DbSchenkerAdapter implements CarrierAdapter {
    readonly carrier = "db-schenker";
    track(reference: string): Promise<TrackingResult>;
}
//# sourceMappingURL=DbSchenkerAdapter.d.ts.map