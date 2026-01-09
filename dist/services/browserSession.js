import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, isAbsolute } from "path";
import { config } from "../config.js";
/**
 * Get the path to the session file
 */
function getSessionFilePath() {
    const sessionFile = config.sessionFile;
    // If it's an absolute path, use it as-is; otherwise resolve relative to cwd
    return isAbsolute(sessionFile) ? sessionFile : join(process.cwd(), sessionFile);
}
/**
 * Load session data from the local JSON file
 *
 * Note: This function does not output to console to avoid breaking MCP protocol
 * (which requires only JSON-RPC messages on stdio). Errors are silently handled
 * by returning null.
 */
export function loadSession() {
    const filePath = getSessionFilePath();
    if (!existsSync(filePath)) {
        return null;
    }
    try {
        const content = readFileSync(filePath, "utf-8");
        return JSON.parse(content);
    }
    catch (error) {
        // Silently fail - don't output to console as this breaks MCP protocol
        // The calling code will handle the null return appropriately
        return null;
    }
}
/**
 * Save session data to the local JSON file
 */
export function saveSession(sessionData) {
    const filePath = getSessionFilePath();
    try {
        writeFileSync(filePath, JSON.stringify(sessionData, null, 2), "utf-8");
        console.log(`\n✅ Session saved to ${filePath}`);
    }
    catch (error) {
        console.error(`Failed to save session to ${filePath}:`, error);
        throw error;
    }
}
//# sourceMappingURL=browserSession.js.map