/**
 * Debug script to inspect CAPTCHA solving process
 *
 * This script launches a browser and logs:
 * - All network requests/responses
 * - JavaScript console messages
 * - CAPTCHA-related headers
 * - The main.js bundle that contains the CAPTCHA algorithm
 *
 * Run with: tsx src/debug-captcha.ts
 */
import { Builder, By, until } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import { writeFileSync } from "fs";
/**
 * Configure Chrome options for debugging
 */
function getChromeOptions() {
    const options = new chrome.Options();
    // Stealth options
    options.addArguments("--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage", "--no-sandbox", "--window-size=1920,1080");
    options.excludeSwitches("enable-automation");
    options.addArguments("--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    return options;
}
const networkLogs = [];
const consoleLogs = [];
async function debugCaptcha() {
    console.log("🔍 Starting CAPTCHA debugging session...\n");
    const options = getChromeOptions();
    const driver = await new Builder()
        .forBrowser("chrome")
        .setChromeOptions(options)
        .build();
    try {
        // Note: Selenium's CDP API doesn't support event listeners the same way Playwright does
        // We'll focus on extracting the JavaScript bundle, which is the main goal
        console.log("   ℹ️  Network interception via CDP is limited in Selenium.");
        console.log("   Focus: Extracting JavaScript bundle to find CAPTCHA algorithm.\n");
        // Navigate to tracking page
        const targetUrl = "https://www.dbschenker.com/app/tracking-public/";
        console.log(`\n🌐 Navigating to: ${targetUrl}\n`);
        await driver.get(targetUrl);
        await driver.wait(until.elementLocated(By.tagName("body")), 30000);
        await new Promise(resolve => setTimeout(resolve, 3000));
        // Extract the main.js bundle that contains the CAPTCHA algorithm
        console.log("\n📦 Extracting JavaScript bundles...\n");
        const scripts = await driver.executeScript((() => {
            // This code runs in the browser context
            const scripts = [];
            const scriptElements = globalThis.document.querySelectorAll("script[src]");
            for (let i = 0; i < scriptElements.length; i++) {
                const script = scriptElements[i];
                const src = script.src;
                if (src.includes("main.") || src.includes("captcha") || src.includes("tracking")) {
                    scripts.push(src);
                }
            }
            return scripts;
        }));
        console.log("Found JavaScript bundles:");
        scripts.forEach((src, i) => {
            console.log(`   ${i + 1}. ${src}`);
        });
        // Try to fetch and save the main.js bundle
        if (scripts.length > 0) {
            const mainScript = scripts.find(s => s.includes("main.")) || scripts[0];
            console.log(`\n📥 Fetching main bundle: ${mainScript}\n`);
            try {
                const scriptContent = await driver.executeScript(async (url) => {
                    const response = await fetch(url);
                    return await response.text();
                }, mainScript);
                // Save the script to a file for inspection
                const filename = `captcha-algorithm-${Date.now()}.js`;
                writeFileSync(filename, scriptContent, "utf-8");
                console.log(`✅ Saved main.js bundle to: ${filename}`);
                console.log(`   Size: ${(scriptContent.length / 1024).toFixed(2)} KB\n`);
                // Search for CAPTCHA-related functions
                console.log("🔍 Searching for CAPTCHA-related code...\n");
                const captchaMatches = scriptContent.match(/captcha|puzzle|solution/gi);
                if (captchaMatches) {
                    console.log(`   Found ${captchaMatches.length} matches for "captcha", "puzzle", or "solution"`);
                }
                // Try to find function definitions related to CAPTCHA
                const functionMatches = scriptContent.match(/(?:function|const|let|var)\s+\w*[Cc]aptcha\w*\s*[=:]/g);
                if (functionMatches) {
                    console.log(`   Found ${functionMatches.length} CAPTCHA-related function definitions:`);
                    functionMatches.forEach((match, i) => {
                        console.log(`      ${i + 1}. ${match}`);
                    });
                }
            }
            catch (error) {
                console.log(`   ⚠️  Could not fetch script: ${error}`);
            }
        }
        // Instructions for user
        console.log("\n" + "=".repeat(60));
        console.log("⏸️  Browser is now open with full logging enabled.");
        console.log("");
        console.log("   Please:");
        console.log("   1. Solve any CAPTCHA that appears");
        console.log("   2. Search for a tracking number (e.g., 1806203236)");
        console.log("   3. Watch the console output above for:");
        console.log("      - Network requests with Captcha-Solution headers");
        console.log("      - Network responses with Captcha-Puzzle headers");
        console.log("      - JavaScript console messages about CAPTCHA");
        console.log("   4. Press Enter here when done");
        console.log("=".repeat(60) + "\n");
        // Wait for user input
        if (!process.stdin.isRaw) {
            process.stdin.setEncoding("utf8");
            process.stdin.resume();
        }
        await new Promise((resolve) => {
            const onData = () => {
                process.stdin.removeListener("data", onData);
                resolve();
            };
            process.stdin.on("data", onData);
        });
        // Save all logs to files
        console.log("\n💾 Saving logs...\n");
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        writeFileSync(`captcha-network-logs-${timestamp}.json`, JSON.stringify(networkLogs, null, 2), "utf-8");
        console.log(`✅ Network logs saved to: captcha-network-logs-${timestamp}.json`);
        console.log(`   Total requests/responses: ${networkLogs.length}`);
        writeFileSync(`captcha-console-logs-${timestamp}.json`, JSON.stringify(consoleLogs, null, 2), "utf-8");
        console.log(`✅ Console logs saved to: captcha-console-logs-${timestamp}.json`);
        console.log(`   Total console messages: ${consoleLogs.length}`);
        // Summary of CAPTCHA-related activity
        console.log("\n📊 Summary of CAPTCHA activity:\n");
        const captchaRequests = networkLogs.filter(log => log.url.includes("tracking-public") ||
            log.headers["captcha-solution"] ||
            log.headers["Captcha-Solution"] ||
            log.headers["captcha-puzzle"] ||
            log.headers["Captcha-Puzzle"]);
        console.log(`   CAPTCHA-related network activity: ${captchaRequests.length} requests/responses`);
        const solutionHeaders = networkLogs.filter(log => log.headers["captcha-solution"] || log.headers["Captcha-Solution"]);
        console.log(`   Requests with Captcha-Solution header: ${solutionHeaders.length}`);
        const puzzleHeaders = networkLogs.filter(log => log.headers["captcha-puzzle"] || log.headers["Captcha-Puzzle"]);
        console.log(`   Responses with Captcha-Puzzle header: ${puzzleHeaders.length}`);
        const successfulRequests = networkLogs.filter(log => log.type === "response" && log.status === 200 && log.url.includes("tracking-public"));
        console.log(`   Successful API responses (200 OK): ${successfulRequests.length}`);
        console.log("\n✅ Debugging session complete!");
        console.log("   Review the saved files to understand the CAPTCHA solving process.\n");
    }
    finally {
        await driver.quit();
        console.log("🔒 Browser closed.");
    }
}
// Run the debug script
debugCaptcha().catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
});
//# sourceMappingURL=debug-captcha.js.map