export type FetchJsonOptions = {
    retries?: number;
    retryDelayMs?: number;
};
export declare class CaptchaBlockedError extends Error {
    readonly status = 429;
    readonly retryable = false;
    readonly hasCaptchaPuzzleHeader: boolean;
    readonly url: string;
    constructor(params: {
        url: string;
        message?: string;
        hasCaptchaPuzzleHeader: boolean;
    });
}
export type ShipmentSearchResult = {
    result: Array<{
        id: string;
        stt: string;
        transportMode: "LAND" | string;
        percentageProgress?: number;
        lastEventCode?: string;
        fromLocation?: string;
        toLocation?: string;
        startDate?: string | null;
        endDate?: string | null;
    }>;
    warnings?: unknown[];
};
export type ShipmentDetails = {
    sttNumber: string;
    references?: {
        shipper?: string[];
        consignee?: string[];
        waybillAndConsignementNumbers?: string[];
        additionalReferences?: string[];
        originalStt?: string | null;
    };
    goods?: {
        pieces?: number;
        volume?: {
            value: number;
            unit: string;
        } | null;
        weight?: {
            value: number;
            unit: string;
        } | null;
        dimensions?: Array<unknown>;
        loadingMeters?: {
            value: number;
            unit: string;
        } | null;
    };
    events?: Array<{
        code: string;
        date: string;
        createdAt?: string;
        comment?: string | null;
        location?: {
            name?: string;
            code?: string;
            countryCode?: string;
        } | null;
        reasons?: Array<{
            code: string;
            description?: string | null;
        }> | null;
    }>;
    packages?: Array<{
        id: string;
        events?: Array<{
            code: string;
            countryCode?: string;
            location?: string;
            date: string;
        }>;
    }>;
    product?: string | null;
    transportMode?: string | null;
    progressBar?: {
        steps?: string[];
        activeStep?: string;
    } | null;
    deliveryDate?: {
        estimated?: string | null;
        agreed?: string | null;
    } | null;
    location?: {
        collectFrom?: {
            countryCode?: string;
            country?: string;
            city?: string;
            postCode?: string;
        };
        deliverTo?: {
            countryCode?: string;
            country?: string;
            city?: string;
            postCode?: string;
        };
        shipperPlace?: {
            countryCode?: string;
            country?: string;
            city?: string;
            postCode?: string;
        };
        consigneePlace?: {
            countryCode?: string;
            country?: string;
            city?: string;
            postCode?: string;
        };
        dispatchingOffice?: {
            countryCode?: string;
            country?: string;
            city?: string;
        };
        receivingOffice?: {
            countryCode?: string;
            country?: string;
            city?: string;
        };
    } | null;
};
export type TripResponse = {
    start: string | null;
    end: string | null;
    trip: Array<{
        lastEventCode: string;
        lastEventDate: string;
        latitude: number;
        longitude: number;
    }>;
};
export declare function searchShipment(reference: string): Promise<ShipmentSearchResult>;
export declare function fetchShipmentDetailsLandSE(stt: string): Promise<ShipmentDetails>;
export declare function fetchTripLandSE(stt: string): Promise<TripResponse>;
//# sourceMappingURL=dbSchenkerClient.d.ts.map