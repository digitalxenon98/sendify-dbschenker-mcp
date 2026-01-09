/**
 * Test script to verify CAPTCHA solving flow
 * 
 * This script simulates what happens when the MCP server receives a CAPTCHA challenge:
 * 1. Makes an API request (will likely get 429 with Captcha-Puzzle)
 * 2. Automatically solves the puzzle
 * 3. Retries with the solution
 * 4. Shows the results
 * 
 * Usage:
 *   npm run test-captcha-flow
 * 
 * Note: Debug output is automatically enabled - you don't need to set DEBUG_CAPTCHA=1
 */

import { DbSchenkerAdapter } from "./carriers/DbSchenkerAdapter.js";

const TEST_REFERENCE = "1806203236";

async function testCaptchaFlow() {
  console.log("Testing CAPTCHA solving flow...\n");
  console.log(`Testing with reference: ${TEST_REFERENCE}\n`);
  console.log("─".repeat(80));
  
  // Enable debug logging
  process.env.DEBUG_CAPTCHA = "1";
  
  const adapter = new DbSchenkerAdapter();
  
  try {
    console.log("\n Calling track() - this will trigger CAPTCHA solving if needed...");
    const startTime = Date.now();
    
    const result = await adapter.track(TEST_REFERENCE);
    
    const elapsed = Date.now() - startTime;
    
    console.log("\n✅ Request succeeded!");
    console.log(`  Total time: ${elapsed}ms`);
    console.log("\n Response data:");
    console.log(JSON.stringify(result, null, 2));
    
    // Check if it's a success response
    if (result && typeof result === "object" && "ok" in result) {
      if ((result as { ok: boolean }).ok) {
        console.log("\n✅ CAPTCHA solving flow verified! The request succeeded.");
      } else {
        console.log("\n⚠️  Request completed but returned an error response.");
      }
    }
    
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("\n Request failed:");
      console.error(`   Error: ${error.name}`);
      console.error(`   Message: ${error.message}`);
      
      // Check if it's a CAPTCHA-related error
      if ("hasCaptchaPuzzleHeader" in error) {
        console.error("\n CAPTCHA was detected but not automatically solved.");
        console.error("   This might indicate:");
        console.error("   - The solver didn't activate");
        console.error("   - The puzzle format changed");
        console.error("   - There's a bug in the solver");
      } else if ("status" in error && (error as { status: number }).status === 422) {
        console.error("\n  CAPTCHA solution was rejected (422).");
        console.error("   This might indicate:");
        console.error("   - The puzzle expired");
        console.error("   - The solution format is incorrect");
        console.error("   - There's a bug in the solver");
      }
    } else {
      console.error("\n Unknown error:", error);
    }
    
    process.exit(1);
  }
}

// Run the test
testCaptchaFlow().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

