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
 *   DEBUG_CAPTCHA=1 npm run test-captcha-flow
 */
export {};
//# sourceMappingURL=test-captcha-flow.d.ts.map