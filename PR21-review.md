In `@package.json`:
- Line 71: The package.json dependency for "@opentui/core" uses an unavailable
version "^0.1.77"; update the version specifier for the "@opentui/core"
dependency to a published version (e.g., "^0.1.75" or the latest patch on npm)
so installs resolve correctly, then run npm/yarn install to verify; locate the
dependency entry named "@opentui/core" in package.json and replace "^0.1.77"
with the chosen valid version.

In `@src/cli/app.test.ts`:
- Around line 5-22: The tests currently reuse mocked node:fs functions
(existsSync/readFileSync) and risk cross-test state leakage; update the test
file around the createCliApp suite to reset these mocks between tests by adding
a per-test cleanup (e.g., an afterEach or beforeEach) that calls
mockExistsSync.mockReset() and mockReadFileSync.mockReset() or uses
vi.clearAllMocks()/vi.resetAllMocks(), ensuring the vi.mock of 'node:fs' and the
mocked helpers mockExistsSync and mockReadFileSync are cleared before each test
run.

In `@src/cli/app.ts`:
- Around line 54-60: The guard logic in runCliApp and stopCliApp is inverted:
they currently throw when renderer has keys but the message says "not
initialized"; update both functions (runCliApp, stopCliApp) to throw only when
the renderer is uninitialized (e.g., Object.keys(renderer).length === 0 or
!Object.keys(renderer).length) or adjust the error message to reflect the actual
condition, ensuring the check uses the renderer object to detect missing
initialization and the thrown text accurately describes the problem (TUI not
implemented or renderer not initialized).

In `@src/cli/commands/resolve.ts`:
- Around line 325-385: The function readMultiLineInput currently creates two
readline interfaces (the const readline created via
readlineModule.createInterface and the const lineReader created later) but only
lineReader is used; remove the redundant readline creation and references and
use a single readline interface (e.g., keep lineReader) for all event handlers
and cleanup. Ensure you stop calling readline.close() and instead call
lineReader.close() where appropriate, attach 'line', 'SIGINT', and 'close'
handlers to the single interface, and keep the initial prompt/line numbering
behavior intact.
- Around line 449-481: The confirmReader is being closed explicitly inside the
'y'/'yes' branch before returning and then closed again in the finally block;
remove the explicit confirmReader.close() calls inside the branches (both the
confirmation-success branch and any other branch that currently calls close
before returning) and rely on the finally block to close the reader so
confirmReader is only closed once; update the code around
confirmReader.readLine, the block that checks confirmationLower, and the
branches that call promptForClarification/isClarificationOption, numericInput,
clearLines(renderedLineCount) to omit the in-branch confirmReader.close() calls.
- Around line 662-715: The loop uses the original pendingQueries and snapshot,
causing stale-state resolutions; after each successful
updateStateAfterResolution call you must update the in-loop snapshot reference
and derive the next query list from it (e.g., replace iteration over the
original pendingQueries with a loop that re-reads snapshot.blockingQueries or
update the snapshot variable to updatedSnapshot), and when calling
resolveBlocking use the current snapshot.state (not the original
snapshot.state). Ensure you call saveCliState(updatedSnapshot, statePath) as you
do, then assign snapshot = updatedSnapshot (or recompute pendingQueries from
snapshot) before continuing the loop so resolveBlocking and subsequent logic
always operate on the latest state.

In `@src/cli/commands/resume.ts`:
- Around line 34-54: Multiple display helper functions (formatRelativeTime,
formatConfidence, getBorderChars, wrapInBox) are duplicated across resume.ts,
resolve.ts and status.ts; extract them into a shared module (e.g., displayUtils)
and replace the local implementations with imports. Create exported functions
formatRelativeTime, formatConfidence, getBorderChars, wrapInBox in the new
module, move any tests or comments, update resume.ts/resolve.ts/status.ts to
import these helpers and remove the duplicated definitions, and ensure
TypeScript exports/imports and any types used by those functions are updated
accordingly.
- Line 180: The ledger path derivation is fragile because replacing the literal
substring on statePath can silently fail; update resume.ts to compute ledgerPath
robustly by using the directory of statePath (e.g., path.dirname(statePath)) and
joining '.criticality' and 'ledger' (instead of string.replace), or better yet
call a new exported helper getDefaultLedgerPath(statePath) in the state module;
implement getDefaultLedgerPath to accept a statePath, compute and return
path.join(path.dirname(statePath), '.criticality', 'ledger') and then replace
the current ledgerPath assignment in resume.ts with a call to that helper for
consistent, safe behavior.

In `@src/cli/commands/status.ts`:
- Around line 349-359: The code uses a hardcoded phase array and totalPhases
constant which can become outdated; replace the literal phase list and
totalPhases with the canonical phase definitions (e.g., import PHASES or
PHASE_ENUM from the central source) and compute phaseIndex =
PHASES.indexOf(snapshot.state.phase) and totalPhases = PHASES.length, then
explicitly handle the unknown-phase case (if phaseIndex === -1) by showing a
clear "Unknown phase" message or displaying the raw snapshot.state.phase instead
of silently computing progress, ensuring progress only uses (phaseIndex + 1)
when phaseIndex >= 0.
- Around line 526-543: The SIGINT and beforeExit listeners registered around
updateStatus are never removed, causing listener leaks when watch mode stops or
handleStatusCommand is invoked multiple times; fix by capturing the listener
functions (use the existing gracefulShutdown for SIGINT and create a named
beforeExit handler) and remove both listeners and the interval when watch mode
stops (i.e., when running becomes false or on cleanup) by calling
process.off('SIGINT', gracefulShutdown) and process.off('beforeExit',
beforeExitHandler) and clearing intervalId inside the same stop/cleanup path so
that updateStatus(), intervalId, gracefulShutdown and the new beforeExitHandler
are all deregistered when watch mode ends.

In `@src/cli/index.ts`:
- Around line 52-63: The four context wrapper functions
(handleVersionCommandWithContext, handleStatusCommandWithContext,
handleResolveCommandWithContext, handleResumeCommandWithContext) duplicate
identical try/catch/process.exit logic; extract that into a shared helper (e.g.,
withErrorHandling) that accepts the wrapped function (sync or async) and
performs the try -> await fn() -> process.exit(result.exitCode) and catch ->
console.error when Error -> process.exit(1); then replace each of the four
wrappers to simply call return withErrorHandling(() => handleXCommand()) to
remove duplicated error handling.
- Around line 242-247: The top-level catch is swallowing the error; change the
bare catch to capture the exception (e.g., catch (err) or catch (error)) and log
the error details before exiting so you retain context from main(); update the
block around the main() invocation in src/cli/index.ts to call console.error
with the error message and/or stack (and retain process.exit(1)) so unexpected
errors are visible for debugging.
- Line 86: The destructured variable command (from const [command,
...commandArgs] = args) can be undefined under noUncheckedIndexedAccess; add an
explicit type-narrowing guard before the switch that reads command (or replace
destructuring with const command = args[0] ?? ''), and handle the
undefined/missing-case (e.g., show help/exit or set a safe default) so the
switch never receives undefined; update references to command and commandArgs
accordingly and remove reliance on String(command) later in the function.

In `@src/cli/state.ts`:
- Around line 262-346: The two functions loadCliStateWithRecovery and
loadStateWithRecovery duplicate recovery logic; extract that shared behavior
into a generic helper (e.g., withRecovery<T>(loadFn: () => Promise<T>, resetFn:
() => Promise<T>, filePath: string, options?: RecoveryOptions): Promise<T>) that
encapsulates error classification (StatePersistenceError ->
parse/schema/validation/corruption), display/prompt handling
(promptUser/displayMessage/displayError), file stat/last-modified reporting,
backup via renameSync with timestamp, and throwing a StatePersistenceError when
user declines; then rewrite loadCliStateWithRecovery to call withRecovery(() =>
loadCliState(filePath), () => { const s = createInitialCliState(); await
saveCliState(s, filePath); return s; }, filePath, options) (and similarly adapt
loadStateWithRecovery), preserving original errorType, error.cause/details
propagation and ensuring proper generic return typing.
- Around line 240-249: The upgradeToCliState function unconditionally replaces
createdAt and lastActivity with the current time; change it to preserve existing
values when present by using the snapshot's createdAt and lastActivity if they
exist (e.g., use snapshot.createdAt ?? now and snapshot.lastActivity ?? now) and
similarly only initialize resolvedQueries to an empty array if
snapshot.resolvedQueries is missing, so upgradeToCliState returns existing
timestamps and queries when upgrading a partially-upgraded
ProtocolStateSnapshot.
- Around line 131-149: The dynamic import of 'node:fs/promises' inside
saveCliState causes repeated module loads; hoist this to a module-level static
import (e.g., import fs from 'node:fs/promises' or import { writeFile, rename,
unlink } as fsPromises) and update the saveCliState implementation to use the
hoisted fs functions when writing tempPath, renaming to filePath, and unlinking
on error, preserving the existing StatePersistenceError construction and cleanup
logic.

In `@src/cli/types.ts`:
- Around line 40-78: Change the CliContext to require a concrete runtime config
and ensure createCliApp returns/populates that concrete config: make
CliContext.config a non-optional CliConfig (no union with undefined), update any
types/usages that assume config may be missing, and adjust createCliApp (and its
return type) to always construct and assign a CliConfig instance so downstream
code can remove undefined checks; refer to the CliContext and CliConfig
interfaces and the createCliApp function when applying the changes.

In `@src/config/parser.ts`:
- Around line 315-333: The watch_interval parsed in parseCliSettings currently
uses validateNumber(raw.watch_interval, 'cli.watch_interval') but doesn't
enforce positivity or finiteness; update parseCliSettings so that after
obtaining the number (from validateNumber or a new helper) you verify it's a
finite number greater than 0 and otherwise throw a validation error or fall back
to DEFAULT_CLI_CONFIG.watch_interval; reference the parseCliSettings function
and the validateNumber call (cli.watch_interval) when adding the check and error
message.
