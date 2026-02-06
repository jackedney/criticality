# Code Review

In `@src/adapters/typescript/negative-test-generator.ts`:
- Around line 30-38: Extract the duplicated escapeString implementation into a
shared utility and update callers to import it: create a new utility (e.g.,
export function escapeString in a shared utils module) containing the current
logic, replace the local escapeString definitions in negative-test-generator.ts
and temporal-test-generator.ts with imports from that module, and run
tests/linters to ensure no behavior change; make sure the exported function name
remains escapeString so callers (negative-test-generator and
temporal-test-generator) require minimal changes.
- Around line 373-377: The main test generation block uses a multi-line closing
for the it() call while per-function tests use a single-line closing; update the
code that pushes the closing lines (the lines.push calls around escapedTestName
/ generateTestBody and timeout) to use the same single-line style as the
per-function tests by replacing the three lines that currently push '    },',
the timeout object, and '  );' with one lines.push that formats "  }, { timeout:
${String(timeout)} });" so generateTestBody, escapedTestName and timeout remain
unchanged but the closing style is consistent.

In `@src/adapters/typescript/temporal-test-generator.test.ts`:
- Around line 1-143: Add property-based tests using fast-check to supplement the
example-based tests: import fast-check and write fc.assert(fc.property(...))
cases that generate arbitrary claim objects (varying id, description with
special chars, type including 'temporal' and others, and functions arrays) and
assert that generateTemporalTest(claim, {includeJsDoc:false}) always includes
the claim.id, safely-escaped description, and appropriate markers (e.g.,
"Temporal:" header, timeout block) and that generateTemporalTests([...claims])
only includes entries for claims with type === 'temporal' and preserves ids;
focus on exercising generateTemporalTest and generateTemporalTests to catch
string-escaping and filtering edge cases.

In `@src/injection/escalation.test.ts.bak`:
- Around line 147-157: The test uses dot notation on attempts.attemptsByTier but
earlier tests treat attemptsByTier as a Map; update the assertions to access Map
entries via attempts.attemptsByTier.get('worker') and
attempts.attemptsByTier.get('fallback') (or coalesce to 0 if you expect missing
keys) so the test matches the Map API used by createFunctionAttempts and
recordAttempt.
- Around line 1-6: The file escalation.test.ts.bak is a backup and should not be
committed as-is; either rename it to follow the test naming convention (e.g.,
escalation.test.ts or escalation.spec.ts) if it contains active tests, or remove
it from the repo and add the .bak pattern (or the specific filename) to
.gitignore if it must remain locally; ensure CI/test runner only sees valid
.test.ts/.spec.ts files and update any references if you rename the file.
- Around line 122-129: The test mistakenly references the original variable
`attempts` instead of the updated result `updated` and mixes Map and property
access for `attemptsByTier`; change assertions to reference `updated` and access
`attemptsByTier` consistently as a Map (use `attemptsByTier.get('worker')` and
`attemptsByTier.get('fallback')`) so the test checks the updated state returned
by `recordAttempt(initial, 'worker')` and verifies fallback is 0 via the Map
get.

In `@src/mesoscopic/cluster-definer.ts`:
- Around line 68-71: The current extraction into allTypeNames uses match[1]
which TypeScript treats as string | undefined under noUncheckedIndexedAccess;
update the flatMap result to explicitly narrow the type before returning — e.g.,
derive the captured value into a variable (from the regex in the callback for
allTypeNames), then filter out undefined with a type guard like (v): v is string
=> v !== undefined (or use Boolean as a type-predicate) so the final array
contains only string; apply this change to the callback used with params and
returnType so allTypeNames is strongly typed as string[].

In `@src/mesoscopic/cluster-executor.test.ts`:
- Around line 224-260: The test currently waits up to 60s for retries; make it
deterministic and faster by mocking timers around the retry behavior: in the
'should retry on retryable infrastructure failures' test, call
vi.useFakeTimers() before invoking executeClusters (or before the code path that
triggers setTimeout delays), replace any real delay waits by advancing timers
(e.g., vi.advanceTimersByTime or vi.runAllTimers/vi.advanceTimersToNextTimer) to
simulate backoff between runTests attempts, then call vi.useRealTimers() (or
vi.clearAllTimers/vi.restoreAllMocks as appropriate) after the test; ensure you
still assert runTests call counts and result.success as before.
- Around line 263-285: The current test only checks a manually created
ClusterExecutionSummary object and provides little value; replace it with a real
runtime test that calls executeClusters (or remove the test) — specifically,
write a test that invokes executeClusters with a small set of mocked
clusters/tasks and asserts the returned object (type ClusterExecutionSummary)
contains the expected properties and values (clusters, success, totalClaims,
passedClaims, failedClaims, skippedClaims, errorClaims, totalDurationMs), or
simply delete the redundant structure-only spec if TypeScript compilation
already guarantees interface shape.

In `@src/mesoscopic/index.ts`:
- Around line 27-38: The current export groups DEFAULT_TIMEOUT and
DEFAULT_MAX_RETRIES under a type-only export which removes them at runtime;
update the exports so those two constants are exported as values instead of
types: keep the type-only export for the listed type symbols
(ClusterExecutionOptions, ClusterExecutionResult, etc.) and add a separate value
export for DEFAULT_TIMEOUT and DEFAULT_MAX_RETRIES from './cluster-executor.js'
(i.e., remove them from the export type list and add "export { DEFAULT_TIMEOUT,
DEFAULT_MAX_RETRIES } from './cluster-executor.js';" so consumers can access the
runtime constants).

In `@src/mesoscopic/spec-driven-test-generator.test.ts`:
- Around line 16-69: The mockRouter's method return type annotations (prompt,
complete, and the stream generator yield) use overly specific literal types
(e.g., content: 'generated test code') which should be replaced with the actual
router response types or generics from the ModelRouter API; update the
signatures for prompt and complete to return the declared response interface (or
reuse ModelRouter's method return types via ReturnType or the shared
Response/Metadata types) and adjust the stream generator's yielded value type to
the appropriate stream response type so the mock matches the real type shapes
(including generic usage/metadata fields) instead of literal string/value types.

In `@src/mesoscopic/spec-driven-test-generator.ts`:
- Around line 209-227: The skippedClaims array is computed inside
generateTestsForCluster but never used; remove the dead computation or wire it
up: either delete the skippedClaims declaration and the loop in
generateTestsForCluster to avoid duplicate logic, or modify
generateTestsForCluster to return the skippedClaims (and update callers) so
generateSpecDrivenTests can consume that result; locate the skippedClaims
variable and the loop in generateTestsForCluster and apply the chosen fix to
eliminate the redundant computation duplicated later in generateSpecDrivenTests.
- Around line 359-361: The docstring claims "Detects performance regression if
baseline is available" but no implementation exists; add a baseline option and
comparison logic: extend SpecDrivenTestOptions to include baselinePath (or
baselineData) and update the main generator function (generateSpecDrivenTests /
SpecDrivenTestGenerator class) to load the baseline (e.g., read and parse the
baseline file), compute the same metrics used for current runs, and compare them
producing a regression warning/failure when current metrics exceed baseline
thresholds; ensure logging and tests are updated to exercise the new baseline
loading and comparison paths and update the docstring if you choose to remove
rather than implement the feature.
- Around line 452-457: The import statement for the promises API is currently
below function definitions; move "import * as fs from 'node:fs/promises'" up
with the other imports at the top of the file, so the module imports are
consolidated, and ensure the readFile function continues to use fs; remove the
now-duplicate import from its current location (leave the readFile(path: string,
encoding = 'utf-8') function unchanged except for the relocated import).

In `@src/mesoscopic/verdict-handler.test.ts`:
- Around line 352-411: There is a duplicate test case named "should identify
functions linked to violated claims when CLAIM_REF exists" — remove one of the
duplicate it(...) blocks (either the one at lines ~149-215 or the one at lines
~352-411) so the behavior is tested only once; ensure you keep the test that
correctly exercises handleClusterVerdict with the constructed ClaimResult array,
ClusterDefinition, tempDir/src/accounting/withdraw.ts source and assertions on
result.verdict and result.recordedClaims, and run tests to confirm no other
references to the removed block remain.
- Around line 258-302: Remove the duplicate unit test that repeats "should
return pass verdict when all claims passed" by deleting one of the two identical
test blocks that call handleClusterVerdict (the test constructing claimResults,
cluster, logger and asserting result.verdict and result.recordedClaims); keep a
single canonical test for this behavior to avoid redundancy and maintainability
issues.
- Around line 413-452: Remove the duplicate test case named "should trigger
fallback when no CLAIM_REF links exist for violated claim" and keep a single
canonical test that asserts handleClusterVerdict returns pass=false,
violatedClaims=['balance_002'], functionsToReinject=[], fallbackTriggered=true,
recordedClaims=['balance_002'] and that the logger was called with 'No CLAIM_REF
links found - triggering fallback'; locate the redundant it(...) block (the test
using handleClusterVerdict, claimResults with claimId 'balance_002', cluster
with claimIds ['balance_001','balance_002'], and the logger vi.fn()) and delete
it so only one identical test remains.

In `@src/mesoscopic/verdict-handler.ts`:
- Around line 341-344: The function signature for processClusterVerdict uses an
inline import type import('../ledger/ledger.js').Ledger which is unconventional;
replace that inline type with the already-imported Ledger type from the top of
the file (use Ledger as the parameter type in processClusterVerdict) so the
signature reads use VerdictOptions and Ledger directly, ensuring any existing
import for Ledger at the top remains and removing the inline import reference.
- Around line 232-234: The Project instantiation with new Project({
tsConfigFilePath: path.join(options.projectPath, 'tsconfig.json') }) can throw
if tsconfig.json is missing; add explicit error handling by either checking
fs.existsSync(path.join(options.projectPath, 'tsconfig.json')) before calling
new Project or wrap the new Project(...) call in a try-catch, and on failure
throw or log a clear, contextual error referencing options.projectPath and the
tsConfigFilePath so callers know the file is missing or unreadable.

In `@src/utils/logger.ts`:
- Around line 9-24: Add TSDoc comments to all exported API symbols in this file:
LogLevel, LogEntry, LoggerOptions, and the Logger class. For each exported
type/interface/class add a concise /** ... */ TSDoc block describing its
purpose, the meaning of fields (e.g., timestamp, level, component, event, data)
and any optional flags (e.g., debugMode), and annotate public methods or
constructor on Logger with param/returns descriptions so the API docs can be
generated.
- Around line 52-65: The log method currently uses JSON.stringify directly and
can throw on circular refs or BigInt; wrap the JSON.stringify call in a
try/catch inside the log (method name: log) and, on error, build a safe fallback
LogEntry that includes timestamp, level, component, event and a data or meta
field describing the serialization error (e.g. serializationError: err.message
and originalData: "[unserializable]" or omitted), then write that fallback JSON
to process.stderr.write; ensure the original entry variable (entry: LogEntry)
and the final write call (process.stderr.write) are used so callers still get a
single JSON line even when serialization fails.
