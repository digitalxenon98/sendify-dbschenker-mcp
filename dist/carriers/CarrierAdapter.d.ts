export type TrackingResult = {
    ok: boolean;
    reference: string;
    [key: string]: unknown;
} | {
    status: "blocked";
    retryable: false;
    reason: string;
    details: string;
    upstream: {
        url: string;
        status: number;
        hasCaptchaPuzzleHeader: boolean;
    };
};
export interface CarrierAdapter {
    readonly carrier: string;
    track(reference: string): Promise<TrackingResult>;
}
//# sourceMappingURL=CarrierAdapter.d.ts.map