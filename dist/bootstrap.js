#!/usr/bin/env node
import { bootstrapSession, saveSession } from "./services/browserSession.js";
import { config } from "./config.js";
async function main() {
    try {
        console.log("🔐 DB Schenker Session Bootstrap");
        console.log("=".repeat(60));
        console.log("This will launch a browser to help you create a session file.");
        console.log("You will need to manually solve the CAPTCHA in the browser.");
        console.log(`Session will be saved to: ${config.sessionFile}\n`);
        const sessionData = await bootstrapSession();
        saveSession(sessionData);
        console.log("\n✅ Bootstrap complete! Session data has been saved.");
        console.log(`   Session file: ${config.sessionFile}`);
        console.log("   You can now use this session for API requests.\n");
    }
    catch (error) {
        console.error("\n❌ Bootstrap failed:", error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
main();
//# sourceMappingURL=bootstrap.js.map