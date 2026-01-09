#!/usr/bin/env node
/**
 * Manual bootstrap helper - allows user to manually provide Captcha-Solution header
 * when Playwright browser is being detected and blocked
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, isAbsolute } from "path";
import { config } from "./config.js";
function getSessionFilePath() {
    const sessionFile = config.sessionFile;
    return isAbsolute(sessionFile) ? sessionFile : join(process.cwd(), sessionFile);
}
async function main() {
    console.log("🔧 Manual Session Bootstrap Helper");
    console.log("=".repeat(60));
    console.log("Use this if Playwright browser is being detected by DB Schenker.");
    console.log("You'll manually extract the Captcha-Solution header from a real browser.\n");
    // Load existing session if it exists
    let session = null;
    const sessionPath = getSessionFilePath();
    if (existsSync(sessionPath)) {
        try {
            const content = readFileSync(sessionPath, "utf-8");
            session = JSON.parse(content);
            console.log("✅ Found existing session file");
            console.log(`   Timestamp: ${session.timestamp}`);
            console.log(`   Cookies: ${session.cookies.length}`);
            if (session.captchaSolution) {
                console.log(`   Captcha-Solution: ${session.captchaSolution.substring(0, 50)}...`);
            }
            else {
                console.log("   Captcha-Solution: Missing");
            }
            console.log("");
        }
        catch (error) {
            console.log("⚠️  Could not load existing session, will create new one\n");
        }
    }
    console.log("📋 Instructions:");
    console.log("1. Open a REAL browser (Chrome/Firefox) - NOT Playwright");
    console.log("2. Go to: https://www.dbschenker.com/app/tracking-public/");
    console.log("3. Solve any CAPTCHA that appears");
    console.log("4. Search for a tracking number (e.g., 1806203236)");
    console.log("5. Open Developer Tools (F12) → Network tab");
    console.log("6. Find the successful request to:");
    console.log("   /nges-portal/api/public/tracking-public/shipments?query=...");
    console.log("7. Click on it → Headers tab → Request Headers");
    console.log("8. Copy the value of 'Captcha-Solution' header\n");
    // Get Captcha-Solution from user
    const readline = await import("readline");
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const question = (prompt) => {
        return new Promise((resolve) => {
            rl.question(prompt, resolve);
        });
    };
    const captchaSolution = await question("Paste the Captcha-Solution header value (or press Enter to skip): ");
    if (!captchaSolution.trim()) {
        console.log("\n⚠️  No Captcha-Solution provided. Session will be saved without it.");
        if (session) {
            // Remove captchaSolution if it exists
            delete session.captchaSolution;
        }
    }
    else {
        console.log(`\n✅ Captcha-Solution received (${captchaSolution.substring(0, 50)}...)`);
        if (!session) {
            // Create a minimal session with just the Captcha-Solution
            console.log("\n⚠️  No existing session found. Creating minimal session with Captcha-Solution only.");
            console.log("   You may need to run the full bootstrap to get cookies.");
            session = {
                cookies: [],
                headers: {
                    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "application/json, text/plain, */*",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Referer": "https://www.dbschenker.com/app/tracking-public/",
                    "Origin": "https://www.dbschenker.com",
                },
                userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                timestamp: new Date().toISOString(),
                captchaSolution: captchaSolution.trim(),
            };
        }
        else {
            // Update existing session with new Captcha-Solution
            session.captchaSolution = captchaSolution.trim();
            session.timestamp = new Date().toISOString();
        }
    }
    // Save session
    if (!session) {
        console.log("\n❌ No session data available. Cannot save.");
        process.exit(1);
    }
    try {
        writeFileSync(sessionPath, JSON.stringify(session, null, 2), "utf-8");
        console.log(`\n✅ Session saved to ${sessionPath}`);
        if (session.captchaSolution) {
            console.log("   Captcha-Solution header has been added to the session.");
        }
    }
    catch (error) {
        console.error(`\n❌ Failed to save session: ${error}`);
        process.exit(1);
    }
    rl.close();
}
main().catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
});
//# sourceMappingURL=manualBootstrap.js.map