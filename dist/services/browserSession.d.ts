export type SessionData = {
    cookies: Array<{
        name: string;
        value: string;
        domain: string;
        path: string;
        expires?: number;
        httpOnly?: boolean;
        secure?: boolean;
        sameSite?: "Strict" | "Lax" | "None";
    }>;
    headers: Record<string, string>;
    userAgent: string;
    timestamp: string;
    captchaSolution?: string;
};
/**
 * Load session data from the local JSON file
 *
 * Note: This function does not output to console to avoid breaking MCP protocol
 * (which requires only JSON-RPC messages on stdio). Errors are silently handled
 * by returning null.
 */
export declare function loadSession(): SessionData | null;
/**
 * Save session data to the local JSON file
 */
export declare function saveSession(sessionData: SessionData): void;
//# sourceMappingURL=browserSession.d.ts.map