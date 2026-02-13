
import { performance } from 'perf_hooks';

// The current implementation from src/composition-audit/detector.ts
function extractJSON_Original(content: string): string | null {
  // Strategy 1: Try to extract JSON by matching braces from first opening brace
  const firstBraceIndex = content.indexOf('{');
  if (firstBraceIndex !== -1) {
    let braceCount = 0;
    for (let i = firstBraceIndex; i < content.length; i++) {
      if (content.charAt(i) === '{') {
        braceCount++;
      } else if (content.charAt(i) === '}') {
        braceCount--;
        if (braceCount === 0) {
          const jsonCandidate = content.slice(firstBraceIndex, i + 1);
          try {
            JSON.parse(jsonCandidate);
            return jsonCandidate;
          } catch {
            // Continue to next strategy
            break;
          }
        }
      }
    }
  }

  // Strategy 2: Find the last closing brace and work backwards to matching opening brace
  const lastBraceIndex = content.lastIndexOf('}');
  if (lastBraceIndex !== -1) {
    let braceCount = 0;
    for (let i = lastBraceIndex; i >= 0; i--) {
      if (content.charAt(i) === '}') {
        braceCount++;
      } else if (content.charAt(i) === '{') {
        braceCount--;
        if (braceCount === 0) {
          const jsonCandidate = content.slice(i, lastBraceIndex + 1);
          try {
            JSON.parse(jsonCandidate);
            return jsonCandidate;
          } catch {
            break;
          }
        }
      }
    }
  }

  // Strategy 3: Iteratively try substrings until JSON.parse succeeds
  if (firstBraceIndex !== -1 && lastBraceIndex !== -1) {
    let length = lastBraceIndex - firstBraceIndex + 1;
    while (length > 0) {
      const substring = content.slice(firstBraceIndex, firstBraceIndex + length);
      try {
        JSON.parse(substring);
        return substring;
      } catch {
        length--;
      }
    }
  }

  return null;
}

// Proposed optimized implementation
function extractJSON_Optimized(content: string): string | null {
  let startIndex = content.indexOf('{');
  if (startIndex === -1) return null;

  // Try to parse the largest valid block starting from the first {
  // We can scan forward, keeping track of balance.
  // Every time balance hits 0, we have a candidate block.
  // We want the *largest* valid block? Or the first valid one?
  // Strategy 1 implies first valid block from start.

  // However, Strategy 3 implies "largest substring that parses".

  // Let's implement a single pass that finds balanced blocks.

  let braceDepth = 0;
  let quote = null; // null, '"', or "'"
  let escaped = false;

  // Only search from first {
  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '{') {
      braceDepth++;
    } else if (char === '}') {
      braceDepth--;
      if (braceDepth === 0) {
        // Balanced block found.
        const candidate = content.slice(startIndex, i + 1);
        try {
           JSON.parse(candidate);
           return candidate;
        } catch (e) {
           // If it balances but fails to parse, it might be due to
           // garbage inside strings (handled by quote logic) or malformed content.
           // But wait, if we tracked braces correctly, it SHOULD be a candidate.
           // However, if we missed something, or if there is content *after* this block
           // that implies this block is just a part of something larger?

           // If we are looking for the *first* valid JSON object:
           // We continue searching? No, braceDepth is 0, so we closed the object.
           // If it failed parse, then the first { wasn't the start of a valid object
           // OR the object is invalid.

           // If we want to be robust against "text before first {", we should retry from next {
           // But current Strategy 1 only looks from firstBraceIndex.

           // To replicate Strategy 3's "brute force" but efficiently:
           // Strategy 3 tries *all* substrings from start.
           // We can't easily replicate O(N^2) behavior with O(N) unless we know what we are looking for.
           // But Strategy 3 is a fallback for when brace counting fails (e.g. malformed braces inside strings).
        }

        // If we want to continue searching for a better candidate?
        // Strategy 1 stops after first balance check.
      }
    }
  }

  // Fallback: Use a smarter approach than Strategy 3.
  // Strategy 3 tries to parse the longest possible substring first (length starts at max).

  // Optimized fallback:
  // Find the last }
  const lastIndex = content.lastIndexOf('}');
  if (lastIndex === -1 || lastIndex <= startIndex) return null;

  // Check the substring from start to last }
  const fullSpan = content.slice(startIndex, lastIndex + 1);
  try {
    JSON.parse(fullSpan);
    return fullSpan;
  } catch {}

  // If that fails, it's likely we have extra text or unbalanced braces.
  // The O(N^2) fallback is only useful if there is a valid JSON object starting at first {
  // but ending somewhere before the last }.

  // Let's implement a robust search:
  // Find all closing braces } after start.
  // Try to parse slice(start, end+1).
  // Iterate from LAST } to FIRST }.
  // This is still potentially O(N^2) but typically much faster than Strategy 3 which iterates by char.

  // Find all } indices
  const endIndices: number[] = [];
  for (let i = content.length - 1; i > startIndex; i--) {
    if (content[i] === '}') endIndices.push(i);
  }

  for (const end of endIndices) {
      const candidate = content.slice(startIndex, end + 1);
       try {
        JSON.parse(candidate);
        return candidate;
      } catch {}
  }

  return null;
}


// Test Case Generation
// Generate a large string with valid JSON in the middle/start but LOTS of noise
// to trigger the fallback or stress the loop.

const validJSON = JSON.stringify({
  test: "data",
  nested: { foo: "bar", array: [1,2,3] },
  long: "a".repeat(1000)
});

// Construct a "worst case" for Strategy 3:
// Many braces that don't balance well, or just a long string where valid JSON is small
// but we force it to try parsing many substrings.

// Case 1: Valid JSON followed by garbage.
// Strategy 1 works if balanced.
// Strategy 3 runs if Strategy 1 fails (e.g. due to braces inside strings not being counted correctly by simple logic).

// Let's make Strategy 1 fail by putting braces in strings without quote logic (which original doesn't have).
const trickyJSON = `{ "key": "value with { brace } inside" }`;
// Original Strategy 1:
// { -> count 1.
// { inside string -> count 2.
// } inside string -> count 1.
// } at end -> count 0. Matches!
// Parse succeeds.

// Wait, original Strategy 1 is actually clever enough?
// It balances braces.
// { (1) ... { (2) ... } (1) ... } (0).
// Yes, it works for this case.

// What makes Strategy 1 fail? Unbalanced braces inside strings?
// `{ "key": "value with { brace " }` -> valid JSON.
// { (1). { (2). } (1).
// Result: `value with { brace " }`
// wait, end of string is }
// It returns `{ "key": "value with { brace " }` which parses fine.

// When does Strategy 1 fail?
// ` { "key": " unbalanced { " } `
// { (1). { (2). } (1).
// End of string. Loop finishes. braceCount != 0.
// Strategy 1 fails.
// Strategy 2 (from back):
// } (1). { (0). -> slice from { to }.
// slice: `{ " }` -> parse error.
// Loop continues.
// Strategy 2 fails.
// Strategy 3 runs. O(N^2).

const badInput = ` { "key": " unbalanced { " } ` + " garbage ".repeat(100);

// Let's test performance on a larger input that triggers Strategy 3.
const N = 5000;
const hugeGarbage = "x".repeat(N);
// Input that starts with { and ends with } but isn't valid JSON, and has many intermediate substrings that aren't valid.
const worstCaseInput = `{ "a": 1, "b": "unbalanced { " }` + hugeGarbage + "}";

console.log("Benchmarking...");
const startOrig = performance.now();
extractJSON_Original(worstCaseInput);
const endOrig = performance.now();
console.log(`Original: ${(endOrig - startOrig).toFixed(3)}ms`);

const startOpt = performance.now();
extractJSON_Optimized(worstCaseInput);
const endOpt = performance.now();
console.log(`Optimized: ${(endOpt - startOpt).toFixed(3)}ms`);

// Verify correctness on tricky input
const tricky = `{ "a": "value with { brace" }`;
const resOrig = extractJSON_Original(tricky);
const resOpt = extractJSON_Optimized(tricky);

console.log("Tricky Original:", resOrig);
console.log("Tricky Optimized:", resOpt);
