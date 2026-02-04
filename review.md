In `@PRD.md`:
- Around line 1-2: The file currently starts with a second-level heading ("##
2026-01-30 10:27 - US-026: Mesoscopic: Spec-driven test generation") which
triggers MD041; add a top-level H1 heading above that line (for example "# PRD"
or a concise project/title H1) so the document begins with an H1 before the
existing "## 2026-01-30 10:27 - US-026: Mesoscopic: Spec-driven test generation"
heading to satisfy MD041.

In `@src/adapters/typescript/index.ts`:
- Around line 681-701: The re-export block duplicates DEFAULT_TIMEOUT from
temporal-test-generator.js and negative-test-generator.js and repeats
generateSpecDrivenTests; fix by aliasing the two timeouts (e.g., export
DEFAULT_TIMEOUT as TEMPORAL_DEFAULT_TIMEOUT from generateTemporalTests group and
export DEFAULT_TIMEOUT as NEGATIVE_DEFAULT_TIMEOUT from generateNegativeTests
group) and remove the duplicated generateSpecDrivenTests entry so the mesoscopic
export only lists generateSpecDrivenTests once along with SpecDrivenTestOptions
and SpecDrivenTestError.

In `@src/adapters/typescript/invariant-test-generator.ts`:
- Around line 172-186: In generateInvariantTest: when witnesses.length === 0 you
are duplicating the fc.assert closure—generateTestProperty already appends the
"{ numRuns: ... }" and closing ");". Remove the extra lines in
generateInvariantTest that push the "{ numRuns: " + String(numRuns) + " }" and
the final "    );" so that generateTestProperty remains responsible for closing
fc.assert; do the same cleanup for the analogous block around the other
occurrence (near the second instance referenced, lines 308-312). Ensure you keep
the invariant body/comments but stop appending the numRuns/closing tokens in
generateInvariantTest.

In `@src/adapters/typescript/negative-test-generator.test.ts`:
- Around line 20-41: The test expectations in negative-test-generator.test.ts do
not match the actual strings produced by generateNegativeTest: update the
assertions to exactly match the generator output from
generateNegativeTest(claim, { includeJsDoc: false })—fix the mismatched
describe/it titles (remove the extra bracket in the it title and use the real
describe string), correct the expectedFailure/assertion messages to the exact
phrases emitted (e.g., the actual "Forbidden outcome: ..." text and any
differening assertion lines), and apply the same corrections to the other
failing block around lines 95-123 so all expected strings align with
generateNegativeTest’s current output.

In `@src/adapters/typescript/negative-test-generator.ts`:
- Around line 88-112: In extractForbiddenOutcome, one pattern
(/never\s+(produces?|results?\s+in)\s+(\w+)/i) uses two capture groups so
returning match[1] can yield the verb instead of the outcome; update the
function to return the actual outcome by either making the intermediate group
non-capturing (?:produces?|results?\s+in) in the patterns array or by selecting
the last defined capture (e.g., prefer match[2] when present) before returning;
reference function extractForbiddenOutcome and the patterns array to locate and
apply this change.

In `@src/adapters/typescript/temporal-test-generator.test.ts`:
- Around line 25-50: Update the assertions in temporal-test-generator.test.ts so
they exactly match the generator output produced into testCode: adjust quote
styles (use double quotes where the generator emits double quotes), match exact
phrases (e.g., the describe header "Temporal: [temp_001] session is valid for 30
minutes", the it block signature "it('[temp_001] session is valid for 30
minutes', () => {", the final '},' and '});' tokens), and align variable/log
strings (e.g., the console.log messages and the two separate validateSession
calls must use the exact text the generator emits, as well as the timeout object
'{ timeout: 30000 }' and "Time constraints detected: minute"); update any
duplicated expectation texts (like re-used 'const isValid' lines) to the exact
emitted lines so assertions reflect the actual generated code (search for
testCode and the string literals asserted in this test to update them).

In `@src/adapters/typescript/temporal-test-generator.ts`:
- Line 321: The TODO string uses single quotes so `${func}` won't interpolate;
update the lines.push call that builds the test comment (lines.push('    //
TODO: Test ${func} specifically for temporal property')) to use a template
literal with backticks so the func variable is interpolated (or alternatively
concatenate with '+'), e.g., change the string in the lines.push call
referencing func to a backtick-wrapped template literal.
- Around line 137-163: The generated session test block in
temporal-test-generator.ts references isValid in console.log but the actual
validation calls are commented out, causing a ReferenceError; update the
generator to emit distinct placeholder variables (e.g., midIsValid and
afterIsValid) with initial boolean values before the commented validation lines
and use those names in the corresponding console.log/assert lines inside the
code that builds the lines array (the branches that check desc.includes('valid')
and desc.includes('expires'/'invalid')); ensure each placeholder is declared
(const midIsValid = false; const afterIsValid = false;) so generated tests run
without runtime errors and keep the commented TODOs for real validation calls.
- Around line 304-307: The generated `it()` closing is malformed: remove the
standalone closing brace emitted after generateTestBody and replace the two-line
close with a single consolidated close that uses the options-object syntax (as
used in the second `it()` block) so the call to it(...) ends with a single "}, {
timeout: <value> })" style closure; update the code that builds the lines
(around the use of escapedTestName, generateTestBody(claim) and timeout in
temporal-test-generator.ts) to emit one closing line instead of the separate '}'
and '}, ${String(timeout)});' fragments.

In `@src/mesoscopic/cluster-definer.test.ts`:
- Around line 38-42: The tests use index-based assertions on result.modules
(e.g., expecting modules[0].name === 'Account' and modules[1].name ===
'Transaction') which is order-sensitive and flaky; update both occurrences (test
assertions around result.modules, including the block asserting
Account/Transaction and the one at the other location) to locate modules by
name/id using Array.prototype.find (or equivalent lookup) on result.modules and
then assert on that module's properties (name and dataModels) instead of relying
on fixed indexes.

In `@src/mesoscopic/cluster-definer.ts`:
- Around line 262-277: The forEach callbacks currently use expression bodies
that implicitly return the result of Set.add (e.g., allClaims.forEach((c) =>
assignedClaims.add(c)), allModules.forEach((m) => assignedModules.add(m)), and
unassignedModuleClaims.forEach((c) => assignedClaims.add(c))); change those
arrow callbacks to use block bodies with explicit statements (for example:
allClaims.forEach((c) => { assignedClaims.add(c); });) so they no longer return
a value and satisfy the Biome lint rule; update each occurrence referencing
assignedClaims.add, assignedModules.add, and unassignedModuleClaims.forEach
accordingly.
- Around line 406-424: The current validateClusterResult builds allModules from
clusters so the check `!allModules.has(moduleId)` never detects invalid module
IDs; change validation to compare cluster.module IDs against the canonical list
in result.modules instead: build a Set of validModuleIds from result.modules
(e.g., using m.id) and replace the `allModules` usage and declaration with a
check that each moduleId exists in validModuleIds (and/or
result.modules.some(...) if preferred), removing the faulty allModules reference
so invalid module IDs in clusters are properly rejected by
validateClusterResult.

In `@src/mesoscopic/cluster-executor.test.ts`:
- Around line 32-74: The mocked runTests result is inconsistent: mockRunTests
resolves with totalTests: 3 but only provides two test objects, causing
assertions around executeClusters (function executeClusters, variable
mockClusters, and cluster.claimResults) to be misleading; update the mocked
response in the test to make totals match the tests array (either add the
missing third test entry to the tests array with appropriate
name/file/status/duration or change totalTests to match tests.length and adjust
passed/failed counts) so that executeClusters' expectations (totalClaims,
passedClaims, failedClaims, and cluster.claimResults length) align with the
fixture data.

In `@src/mesoscopic/cluster-executor.ts`:
- Around line 194-220: The current detection using hasNotFoundError is brittle;
update the logic in cluster-executor.ts where hasNotFoundError is computed to
prefer checking structured error properties first (e.g., if error is an Error
and error.code === 'ENOENT' or error.name === 'TestRunnerNotFoundError' or error
instanceof TestRunnerNotFoundError) and only fall back to a case-insensitive
message match as a last resort; keep the rest of the flow that builds
infrastructureFailure and throws ClusterExecutionError (referencing cluster.id,
errorMessage, stack) unchanged so callers still receive the same error shape.
- Around line 317-400: Replace the direct console logging in cluster-executor.ts
with the project's structured logger: import the logger (e.g., import { logger }
from '../utils/logger.js') and change console.log/console.error calls inside the
ClusterExecutor loop and after computing totals to logger.info/warn/error as
appropriate (for example, replace the cluster completion log that references
result.success with logger.info and pass structured metadata like { clusterId:
cluster.id, clusterName: cluster.name, durationMs: result.durationMs, success:
result.success }; replace the per-claim logs inside the for loop to logger.debug
or logger.info with { claimId: claimResult.claimId, status: claimResult.status,
testCount: claimResult.testCount }; and replace the error catch console.error to
logger.error including the error object rather than just the message). Remove
the corresponding eslint-disable-next-line no-console comments and ensure all
stats logs at the end use logger.info with structured fields (totalClaims,
passedClaims, failedClaims, skippedClaims, errorClaims, totalDurationMs).
- Around line 109-113: The current test-to-claim mapping in the claimIds loop
uses testRunResult.tests.filter with test.fullName.includes(claimId), which
causes false positives (e.g., "inv-1" matching "inv-10"); update the filter in
the claimIds loop (the code that sets testsForClaim) to perform a word-boundary
or explicit-marker match instead of includes: construct a case-insensitive regex
using escaped claimId with \b boundaries (or detect a CLAIM_REF marker pattern
if you have one) and test against test.fullName, and add/inline a small
escapeRegExp helper to safely escape claimId before building the RegExp to avoid
regex injection.
- Around line 371-383: The current code does five separate flatMap+filter passes
over clusterResults to compute totalClaims, passedClaims, failedClaims,
skippedClaims, and errorClaims; replace these with a single pass by either first
collecting all claims once (e.g., const allClaims = clusterResults.flatMap(r =>
r.claimResults)) and then using a single reduce over allClaims to accumulate
counts, or by reducing directly over clusterResults and inner claimResults to
increment counters; update the variables totalClaims, passedClaims,
failedClaims, skippedClaims, and errorClaims to be derived from that single
reduce to avoid repeated iteration.
- Line 268: The retry uses a linear delay (await new Promise((resolve) =>
setTimeout(resolve, 1000 * attempt))) which should be replaced with an
exponential backoff + jitter strategy: compute a baseDelay (e.g., 1000ms), a
capped exponential delay like Math.min(maxDelayMs, baseDelayMs * 2 ** attempt),
add a small random jitter (+/- a fraction or uniform 0..baseDelayMs) and await
that computed delay; update the retry loop where the await new Promise(...)
appears (referencing the same await/new Promise and attempt variable) and ensure
there is a sensible maxDelayMs cap to avoid unbounded waits.

In `@src/mesoscopic/index.ts`:
- Around line 12-18: The review points out that ClusterDefinitionError is a
runtime class but was exported only as a type; change the exports in this module
so ClusterDefinitionError is exported as a runtime value (not type-only).
Specifically, keep the type-only exports for Module, ClusterDefinition,
ClusterDefinitionResult, ClusterDefinitionOptions but add an explicit value
export for ClusterDefinitionError (e.g., add "export { ClusterDefinitionError }
from './types.js';" or split the current export into type and value exports) so
consumers can use instanceof and catch the actual Error class.

In `@src/mesoscopic/spec-driven-test-generator.test.ts`:
- Around line 8-15: Tests currently leak temp directories and a replaced
console.warn; add lifecycle cleanup: in the test suite use beforeEach to save
the original console.warn (e.g., const _origWarn = console.warn) and any temp
path state, and add an afterEach that restores console.warn and deletes any temp
dirs created by the tests via fs.rm(path, { recursive: true, force: true })
(apply to the sections around the tests that exercise generateSpecDrivenTests /
SpecDrivenTestOptions). Ensure afterEach runs regardless of test failures so
global state and filesystem artifacts are always cleaned up.

In `@src/mesoscopic/spec-driven-test-generator.ts`:
- Around line 428-500: The baseline loaded into the variable baseline in
generateSpecDrivenTests is never used; either wire it into the
test-generation/performance-evaluation flow or remove the baseline option. Fix
by passing baseline (if defined) into the downstream step that evaluates
performance—e.g. change the call to generateTestsForCluster or add a call to a
new evaluateRegressions/generateRegressionFlags function that accepts
generatedTests and baseline (types: Map<string, PerformanceBaseline>, Test
outputs) and marks/filters tests accordingly; ensure options.baselinePath and
loadBaseline remain consistent with the new parameter so regressions are
actually detected and reported.
- Around line 121-135: The linkage is inverted: linkClaimsToFunctions currently
looks up functions by claimId in functionClaimRefs even though functionClaimRefs
maps functionId → claimIds; fix by first building an inverse map from claimId →
string[] by iterating functionClaimRefs (for each functionId and its claimIds
push functionId into each claimId bucket), then iterate claims (in function
linkClaimsToFunctions) and set each claim.functions to the collected array (or
[] if none) so TestableClaim.functions is correctly populated; update references
to claims, functionClaimRefs, and linkClaimsToFunctions accordingly.

In `@src/mesoscopic/verdict-handler.test.ts`:
- Around line 358-364: Tests are failing due to an extra closing brace/paren
sequence that unbalances the file; remove the stray "});" that immediately
precedes the describe('recordViolatedClaimsInLedger'...) block so the previous
test block (the one containing expect(logger).toHaveBeenCalledWith(...)) is
properly closed once and the new describe starts cleanly; locate the stray
closing tokens near the expect stringContaining('No CLAIM_REF links found -
triggering fallback') and delete the extra "});" (or alternatively wrap the
previous block in a describe if intended) to restore balanced braces for the
test file.

In `@src/mesoscopic/verdict-handler.ts`:
- Around line 269-270: The current logic assigns recordedClaims =
fallbackTriggered ? options.cluster.claimIds : violatedClaims which records all
cluster.claimIds when a fallback occurs; change it so recordedClaims always
equals violatedClaims (i.e., remove the fallbackTriggered branch) so only
actually violated claims are recorded; update any surrounding comments or
variable uses in verdict-handler.ts (look for recordedClaims, fallbackTriggered,
options.cluster.claimIds, violatedClaims) to reflect that fallbacks do not mark
passed claims as violations.
- Around line 90-173: buildFunctionClaimMapping currently keys only by
functionName, losing file context and causing getFunctionFilePath to guess
paths; change the mapping so each entry stores the actual source file path
(e.g., mapping value becomes objects like { filePath, claimRefs } or use a
composite key functionName|filePath) when you call parseContracts in
buildFunctionClaimMapping; then update identifyFunctionsToReinject to iterate
those stored filePath values (use the stored filePath instead of calling
getFunctionFilePath) and emit FunctionToReinject entries with the real filePath;
finally remove or stop using the brittle getFunctionFilePath behavior and ensure
parseContracts/Contract exposes the source file path used to populate the
mapping.

In `@US-026-CURRENT-STATUS.md`:
- Around line 3-20: The markdown violates MD022/MD031/MD060: add a single blank
line above and below each top-level and subsection heading (e.g., "## 🟢
Implementation Status: Substantially Complete (80%)" and "### ✅ Completed
Components"), ensure fenced code blocks have a blank line after the opening
backticks and before the closing backticks (see the "bash" example under "###
Successful Test Execution"), and normalize tables by padding pipe separators
with spaces (e.g., convert "|a|b|" to "| a | b |"). Apply these fixes
consistently across the document (including the sections around the spec-driven
generator examples and the ranges referenced in the review) so headings, fenced
blocks, and tables conform to markdownlint rules.

In `@US-026-FINAL-STATUS.md`:
- Around line 64-78: Normalize the markdown lists and heading spacing: fix the
unordered and ordered list indentation under the sections that show the
checklist (the lines listing test generator behaviors and items 11–12) to use
consistent two-space indentation for nested list items and ensure ordered-list
numbers increment correctly (no repeated "1." entries), and add a single blank
line before each top-level heading to satisfy MD022; update the list bullets so
sub-items are consistently prefixed (use "-" or "*" uniformly) and ensure code
blocks or inline code spans like `specClaim.testable`, `it.skip()`, and
`console.warn()` remain correctly fenced/escaped while adjusting surrounding
whitespace to resolve MD007/MD029.

In `@US-026-implementation-summary.md`:
- Around line 11-23: The markdown has inconsistent heading spacing and list
indentation causing MD022/MD007/MD029 warnings in the "Spec-Driven Test
Generator Orchestration" section; normalize by ensuring a single blank line
before each heading and using consistent list markers/indentation (e.g., one
space after "-" and two-space indentation for nested bullets) across the block
describing functions like extractClaimsFromSpec(), linkClaimsToFunctions(),
generateTestsForCluster(), and generateSpecDrivenTests() so all headings and
lists conform to the repo's markdown lint rules; apply the same spacing rules to
other similar sections noted in the file.

In `@US-028-FINAL-REPORT.md`:
- Around line 1-40: The markdown has MD022/MD031 spacing violations: ensure
there's a blank line both before and after each heading (e.g., "# US-028:
Mesoscopic: Cluster Verdict Handling - Final Report", "## Status", "##
Implementation Summary", "### Files Created/Modified", etc.) and also add a
blank line before and after each fenced code block (e.g., the block that starts
with "```typescript" showing the ClusterVerdict type and any other ``` blocks).
Fix by inserting the required empty lines around those headings and fenced
blocks or run your markdown formatter to apply these whitespace corrections.

In `@US-028-implementation-summary.md`:
- Around line 96-100: Fix the heading formatting for "###CLAIM_REF Linkage" by
inserting a space after the heading marker so it becomes "### CLAIM_REF Linkage"
and ensure there is a blank line before and after this heading to satisfy
markdownlint MD018; update the heading text in the
US-028-implementation-summary.md file where the "CLAIM_REF Linkage" section is
defined.
