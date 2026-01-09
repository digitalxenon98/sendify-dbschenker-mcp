/**
 * CAPTCHA Solver Service
 * 
 * Based on the algorithm extracted from main.6774dda48fc0a866.js bundle.
 * The algorithm uses:
 * - SHA-256 hashing (double hash)
 * - BigInt arithmetic for target calculation
 * - Proof-of-work style computation
 * - Web Worker for execution (we'll replicate in Node.js)
 */

import { createHash } from "crypto";

interface CaptchaSolution {
  jwt: string;
  solution: string;
}

interface PuzzleData {
  jwt: string;
  puzzle: Int8Array;
}

/**
 * Parse a Captcha-Puzzle header into puzzle data
 */
function parsePuzzle(puzzleHeader: string): PuzzleData[] {
  // Based on the JavaScript code: atob(ne).split(",")
  // The puzzle header is base64-encoded, decode it first
  const decoded = Buffer.from(puzzleHeader, "base64").toString("utf-8");
  const jwts = decoded.split(",").filter(jwt => jwt.trim().length > 0);
  
  return jwts.map(jwt => {
    // Parse JWT to get payload
    const parts = jwt.trim().split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid JWT format");
    }
    
    const payloadPart = parts[1];
    if (!payloadPart) {
      throw new Error("Missing JWT payload");
    }
    
    const payload = JSON.parse(Buffer.from(payloadPart, "base64").toString("utf-8"));
    
    // Decode the puzzle field (it's base64-encoded in the payload)
    const puzzleBase64 = payload.puzzle;
    if (!puzzleBase64 || typeof puzzleBase64 !== "string") {
      throw new Error("Missing or invalid puzzle field in JWT payload");
    }
    
    const puzzleBytes = Buffer.from(puzzleBase64, "base64");
    
    return {
      jwt: jwt.trim(),
      puzzle: new Int8Array(puzzleBytes),
    };
  });
}

/**
 * Convert a number to Int8Array (8 bytes, little-endian)
 */
function numberToInt8Array(n: number): Int8Array {
  const result = new Int8Array(8);
  let value = n;
  for (let i = 0; i < result.length; i++) {
    const byte = 255 & value;
    result[i] = byte;
    value = Math.floor((value - byte) / 256);
  }
  return result;
}

/**
 * Calculate target value from puzzle data
 * target = puzzle[13] * 2^(8 * (puzzle[14] - 3))
 */
function calculateTarget(puzzle: Int8Array): bigint {
  if (puzzle.length < 15) {
    throw new Error("Puzzle data too short - need at least 15 bytes");
  }
  
  const byte13 = puzzle[13];
  const byte14 = puzzle[14];
  
  if (byte13 === undefined || byte14 === undefined) {
    throw new Error("Puzzle data missing required bytes at indices 13 and 14");
  }
  
  const exponent = BigInt(8 * (byte13 - 3));
  const base = BigInt(2);
  let power = base;
  
  for (let i = 1; i < exponent; i++) {
    power *= base;
  }
  
  return BigInt(byte14) * power;
}

/**
 * Double SHA-256 hash
 */
async function doubleSha256(data: Int8Array): Promise<bigint> {
  // First hash
  const hash1 = createHash("sha256").update(Buffer.from(data)).digest();
  
  // Second hash
  const hash2 = createHash("sha256").update(hash1).digest();
  
  // Convert to BigInt (little-endian)
  let result = BigInt(0);
  for (let i = hash2.length - 1; i >= 0; i--) {
    const byte = hash2[i];
    if (byte === undefined) {
      throw new Error(`Hash byte at index ${i} is undefined`);
    }
    result = result * BigInt(256) + BigInt(byte);
  }
  
  return result;
}

/**
 * Compute hash of nonce + puzzle
 */
async function computeHash(nonce: Int8Array, puzzle: Int8Array): Promise<bigint> {
  if (puzzle.length < 32) {
    throw new Error("Puzzle data too short - need at least 32 bytes");
  }
  
  // Combine nonce (8 bytes) + puzzle (32 bytes) = 40 bytes
  const combined = new Int8Array(40);
  for (let i = 0; i < 32; i++) {
    const byte = puzzle[i];
    if (byte === undefined) {
      throw new Error(`Puzzle byte at index ${i} is undefined`);
    }
    combined[i] = byte;
  }
  for (let i = 32; i < 40; i++) {
    const byte = nonce[i - 32];
    if (byte === undefined) {
      throw new Error(`Nonce byte at index ${i - 32} is undefined`);
    }
    combined[i] = byte;
  }
  
  return await doubleSha256(combined);
}

/**
 * Solve a single puzzle using proof-of-work
 * 
 * Algorithm:
 * 1. Calculate target from puzzle[13] and puzzle[14]
 * 2. Try nonces starting from 0
 * 3. For each nonce, compute hash(nonce + puzzle)
 * 4. If hash < target, we found a solution
 * 5. Encode solution as base64
 */
async function solvePuzzle(puzzle: Int8Array): Promise<string> {
  const target = calculateTarget(puzzle);
  
  let nonce = 0;
  let solution: Int8Array | null = null;
  
  // Try nonces until we find one that produces hash < target
  do {
    const nonceBytes = numberToInt8Array(nonce);
    const hash = await computeHash(nonceBytes, puzzle);
    
    if (hash < target) {
      solution = nonceBytes;
      break;
    }
    
    nonce++;
    
    // Safety limit (shouldn't be needed in practice)
    if (nonce > Number.MAX_SAFE_INTEGER) {
      throw new Error("Could not find solution within safe integer range");
    }
  } while (true);
  
  if (!solution) {
    throw new Error("Failed to find solution");
  }
  
  // Convert solution to base64
  return Buffer.from(solution).toString("base64");
}

/**
 * Solve a CAPTCHA puzzle and generate the solution header
 * 
 * @param puzzleHeader The Captcha-Puzzle header value from the server
 * @returns The Captcha-Solution header value (base64-encoded JSON array)
 */
export async function solveCaptcha(puzzleHeader: string): Promise<string> {
  try {
    // Parse the puzzle
    const puzzles = parsePuzzle(puzzleHeader);
    
    if (puzzles.length === 0) {
      throw new Error("Empty puzzle");
    }
    
    // Solve each puzzle
    const solutions: CaptchaSolution[] = await Promise.all(
      puzzles.map(async ({ jwt, puzzle }) => ({
        jwt,
        solution: await solvePuzzle(puzzle),
      }))
    );
    
    // Encode as base64 JSON array
    const jsonString = JSON.stringify(solutions);
    const base64Solution = Buffer.from(jsonString, "utf-8").toString("base64");
    
    return base64Solution;
  } catch (error) {
    throw new Error(`Failed to solve CAPTCHA: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validate that a solution matches the expected format
 */
export function validateSolutionFormat(solution: string): boolean {
  try {
    const decoded = Buffer.from(solution, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded) as CaptchaSolution[];
    
    if (!Array.isArray(parsed)) {
      return false;
    }
    
    return parsed.every(item => 
      typeof item === "object" &&
      typeof item.jwt === "string" &&
      typeof item.solution === "string"
    );
  } catch {
    return false;
  }
}

/**
 * Extract JWTs from a puzzle for analysis
 */
export function extractJWTsFromPuzzle(puzzleHeader: string): string[] {
  const decoded = Buffer.from(puzzleHeader, "base64").toString("utf-8");
  return decoded.split(",").filter(jwt => jwt.trim().length > 0);
}
