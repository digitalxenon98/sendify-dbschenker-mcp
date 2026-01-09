/**
 * CAPTCHA Solver Service
 *
 * Based on the algorithm extracted from main.*.js bundle.
 * The algorithm uses:
 * - SHA-256 hashing (double hash)
 * - BigInt arithmetic for target calculation
 * - Proof-of-work style computation
 * - Web Worker for execution (we'll replicate in Node.js)
 */
/**
 * Solve a CAPTCHA puzzle and generate the solution header
 *
 * @param puzzleHeader The Captcha-Puzzle header value from the server
 * @returns The Captcha-Solution header value (base64-encoded JSON array)
 */
export declare function solveCaptcha(puzzleHeader: string): Promise<string>;
/**
 * Validate that a solution matches the expected format
 */
export declare function validateSolutionFormat(solution: string): boolean;
/**
 * Extract JWTs from a puzzle for analysis
 */
export declare function extractJWTsFromPuzzle(puzzleHeader: string): string[];
//# sourceMappingURL=captchaSolver.d.ts.map