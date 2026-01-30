In @.claude/skills/commit/references/commit_examples.md:
- Around line 255-292: The markdown headings "Single Issue", "Multiple Issues +
Co-author", "With ! Notation", and "Config Breaking Change" in the "Commits with
Trailers" and "Breaking Changes" sections need a blank line before the following
fenced code blocks; update the document around the headings (look for the
headings "Single Issue", "Multiple Issues + Co-author", "With ! Notation",
"Config Breaking Change" and the adjacent triple-backtick code fences) to insert
a single blank line after each heading so stricter Markdown parsers render the
code blocks correctly and keep spacing consistent.

In @.claude/skills/commit/SKILL.md:
- Around line 140-166: The section heading "Merge Commits (PR Closure)" is
misleading because the body shows a PR creation example; rename the heading to
accurately reflect the content (e.g., "Pull Request Description Format" or
"Creating Pull Requests") so readers understand this documents how to create PRs
rather than merge commits; update the heading text where "Merge Commits (PR
Closure)" appears in SKILL.md to the chosen clearer title.
- Line 126: The SKILL documentation contains broken links to the missing file
'references/commit_examples.md'; either add that referenced file with the
expected commit examples or remove/update every reference to
'references/commit_examples.md' in the SKILL document (search for that exact
string) so links no longer point to a non-existent resource; if you add the
file, ensure it contains the examples used by the SKILL text and that links are
relative-correct, otherwise remove the references and replace them with existing
documentation or inline examples.

In @.claude/skills/dev-browser/package.json:
- Around line 18-23: The package.json currently lists "@types/express" at major
version 5 which is incompatible with the installed "express" 4.21.0; update the
devDependency entry for "@types/express" to a 4.x release (e.g., change the
version string from "^5.0.0" to a 4.x range like "^4.17.0") so the TypeScript
types match Express 4; ensure the change is made in the devDependencies block
where "@types/express" is declared to avoid type errors.

In @.claude/skills/dev-browser/references/scraping.md:
- Around line 59-68: The response-capture handler (page.on("response", async
(response) => { ... })) writes API responses to tmp/api-response.json without
any privacy guidance; update the handler and surrounding docs to include a clear
data-privacy notice that the captured JSON may contain PII or private content,
instruct reviewers to validate and remove or redact sensitive fields before
committing, recommend storing files only in a secure temporary location with
restricted permissions and deleting them immediately after analysis, and
optionally suggest masking/encrypting sensitive fields if long-term storage is
required.
- Around line 80-138: Add brief error handling guidance and a minimal try/catch
example around the network and file I/O operations: wrap the page.evaluate fetch
call and the JSON parsing/file reads/writes (fs.readFileSync, fs.writeFileSync)
in try/catch blocks, ensure client.disconnect() runs in a finally block, and log
or rethrow useful errors; alternatively include a short comment above the
snippet stating production code should handle API/network timeouts, malformed
JSON, file I/O errors, and closed pages (mention connect, client.page,
page.evaluate, fs.readFileSync, fs.writeFileSync by name) so readers know where
to add error handling without making the example verbose.
- Around line 150-155: Add a short legal/ethical guidance bullet under the "##
Tips" section (near the existing bullets like the "**Extension mode**:
`page.context().cookies()`" line) that instructs developers to review and
respect the target site's Terms of Service, check robots.txt for allowed
endpoints, honor service-imposed rate limits (not just polite delays), and
ensure compliance with data usage/privacy regulations before scraping or reusing
data; keep the tip concise (one or two bullets) and phrase it as an actionable
reminder to validate legal constraints and privacy obligations.
- Around line 101-107: The fetch inside page.evaluate (the anonymous async
function returning res.json) lacks a timeout and can hang; modify that function
to use an AbortController (or a Promise.race timeout) so fetch is aborted after
a configurable timeout (e.g., 10s): create an AbortController, pass
controller.signal to fetch, schedule a setTimeout to call controller.abort()
after the timeout, clear the timeout on success, and handle aborted/timeout
errors (return a sensible error or throw) so the pagination loop can continue;
update callers to accept/configure the timeout value and reference the
page.evaluate invocation and the response variable when making the change.
- Around line 26-53: The example stores capturedRequest (via fs.writeFileSync to
"tmp/request-details.json") including sensitive headers (Authorization, Cookie)
in plaintext; update the docs/snippet to add a clear security warning next to
the capture logic: instruct users to never commit tmp/ files to version control,
to explicitly delete or securely purge capturedRequest files after use, to
review and redact/sanitize headers before writing (omit or mask
Authorization/Cookie/session tokens), and suggest alternatives such as building
headers programmatically or logging only non-sensitive metadata instead of
persisting full headers.

In @.claude/skills/dev-browser/scripts/start-relay.ts:
- Around line 9-10: The parsed PORT constant using parseInt(process.env.PORT ||
"9222", 10) can be NaN if the env var is non-numeric; update the code around
PORT to validate the parsed value (e.g., const parsed =
Number.parseInt(process.env.PORT || "9222", 10); if (!Number.isFinite(parsed) ||
Number.isNaN(parsed) || parsed <= 0) { throw new Error(`Invalid PORT value:
${process.env.PORT}`); } const PORT = parsed;) so the service fails fast with a
clear message or falls back to a safe default; reference the parseInt usage and
the PORT constant in start-relay.ts when making the change.

In @.claude/skills/dev-browser/scripts/start-server.ts:
- Around line 70-73: The catch block that logs "Failed to install Playwright
browsers:" in start-server.ts currently swallows the error and allows the script
to continue; update that catch to either rethrow the error or exit the process
(e.g., process.exit(1)) after logging so the server doesn't proceed without
browsers; locate the catch handling the Playwright install (the
console.error/console.log lines) and ensure it either throws the caught error or
terminates the process with a non-zero exit code.
- Around line 38-53: The isChromiumInstalled function assumes a Unix cache path;
update it to detect platform and use the Windows Playwright path when running on
win32: if process.platform === "win32" build playwrightCacheDir from
process.env.LOCALAPPDATA (fallback to USERPROFILE) plus "ms-playwright",
otherwise keep join(home, ".cache", "ms-playwright"); keep the existing
existsSync/readdirSync try/catch and the entries.some check for entries starting
with "chromium" so the function still returns true when chromium directories
(e.g., chromium-1148) exist.
- Around line 89-99: The crash-recovery cleanup currently uses Unix-only
commands (execSync("lsof -ti:9223") and execSync(`kill -9 ${pid}`)) which won't
work on Windows; update the cleanup in start-server.ts to branch on the OS (use
os.platform() or platform()) and run platform-appropriate commands: keep the
existing lsof/kill flow for non-win32, and for win32 use task-listing and
termination via taskkill (e.g., discover PID for port 9223 and call taskkill
/PID <pid> /F or use netstat + findstr to locate the PID) so the try/catch still
handles no-process cases; modify the code locations that call execSync("lsof
-ti:9223", ...) and execSync(`kill -9 ${pid}`) to implement this
platform-specific logic.

In @.claude/skills/dev-browser/server.sh:
- Around line 4-7: The script currently does an unguarded cd using SCRIPT_DIR
which can fail silently; update the cd call to fail fast: run cd using the same
expansion (cd "$SCRIPT_DIR") and check its exit status (e.g., if cd fails, log
an error mentioning SCRIPT_DIR and exit non‑zero). Refer to the SCRIPT_DIR
variable and the cd "$SCRIPT_DIR" invocation and ensure any subsequent code only
runs after a successful cd by exiting on failure.

In @.claude/skills/dev-browser/SKILL.md:
- Line 51: Replace the bare URL in the sentence "Download link:
https://github.com/SawyerHood/dev-browser/releases" with Markdown link syntax
(e.g. "Download link: [dev-browser
releases](https://github.com/SawyerHood/dev-browser/releases)") so the link
renders consistently across Markdown parsers; update the line containing that
sentence in SKILL.md accordingly.

In @.claude/skills/dev-browser/src/client.ts:
- Around line 408-420: The current injection uses eval inside page.evaluate;
instead use Puppeteer's script injection API: call page.addScriptTag({ content:
snapshotScript }) (where snapshotScript is produced by getSnapshotScript()) and
then use page.evaluate to call the exposed function __devBrowser_getAISnapshot;
before adding the script check (in Node context) if the function is already
present via page.evaluate(() => !!(globalThis as
any).__devBrowser_getAISnapshot) to avoid duplicate injection, and finally call
page.evaluate(() => (globalThis as any).__devBrowser_getAISnapshot()) to obtain
the snapshot (replace the eval usage in the block around snapshotScript,
getSnapshotScript, and the page.evaluate that referenced eval).

In @.claude/skills/dev-browser/src/index.ts:
- Around line 266-276: The forEach callbacks currently use expression bodies
that implicitly return the result of process.on/off; update the callbacks that
iterate over signals (the initial registration and inside removeHandlers) to use
block-style arrow functions with explicit statements so they do not return
values (e.g., change signals.forEach((sig) => process.on(sig, signalHandler)) to
signals.forEach((sig) => { process.on(sig, signalHandler); }); and similarly for
process.off in removeHandlers), leaving signalHandler, errorHandler, syncCleanup
and removeHandlers otherwise unchanged.
- Around line 153-167: The current page creation uses
withTimeout(context.newPage(), ...) so if the timeout throws the background
newPage() may still resolve and leak pages; modify the logic around
context.newPage()/withTimeout in the block that assigns entry so you race the
actual newPage promise and a timeout promise (Promise.race) and, if the timeout
wins, attach a continuation to the original newPage promise to close the
resolved Page (page.close()) to prevent orphaned pages; ensure getTargetId(page)
and registry.set(name, entry) only run after a successfully obtained Page, and
reference the existing symbols context.newPage, withTimeout (or replace with
inlined timeout), getTargetId, page, entry and registry when implementing this
cleanup behavior.

In @.claude/skills/dev-browser/src/relay.ts:
- Around line 630-640: When handling "Target.detachedFromTarget" in the
Target.detachedFromTarget branch, after removing the session from
connectedTargets and namedPages also iterate all connected client entries and
remove the detached session/target id from each client's dedup state (their
knownTargets) so the same target can re-attach later; e.g., for each client in
connectedTargets call client.knownTargets?.delete(detachParams.sessionId) (or
the appropriate property/method if knownTargets is a Map/Set) to clear the
targetId from every client's state.
- Around line 351-422: Wrap the c.req.json() call in a try/catch in the POST
/pages handler so malformed JSON returns c.json({ error: "invalid JSON" }, 400)
instead of throwing; then replace the fixed await new Promise(...) sleep used
after sendToExtension(Target.createTarget) with a bounded polling loop that
checks connectedTargets for an entry whose target.targetId matches
result.targetId (poll e.g. every 50–200ms up to a configurable timeout like
3–5s) and proceeds when found, otherwise remove the namedPages entry and return
a 500 (or throw) after the timeout; keep using namedPages, connectedTargets,
sendToExtension, and result.targetId to locate the created target.
- Around line 707-729: The stop() implementation returns immediately and calls
server.close() without awaiting its completion; change stop() (the exported stop
async function in the RelayServer return object) to await the server shutdown
before returning by wrapping server.close() in a Promise or using its
Promise-based API so stop() truly resolves only after the server has closed;
keep the existing logic that closes each Playwright client socket
(playwrightClients.values()) and extensionWs before awaiting server.close(),
then await the server close promise and only afterwards clear playwrightClients
and return.

In @.claude/skills/dev-browser/src/snapshot/__tests__/snapshot.test.ts:
- Around line 32-42: Replace the inline eval injection in getSnapshot by
injecting the script via Playwright's page.addScriptTag to avoid global eval:
call getSnapshotScript() to get the script, await page.addScriptTag({ content:
script }) to inject it into the page, then use page.evaluate to call and return
the global function __devBrowser_getAISnapshot; update the getSnapshot function
(and references to getSnapshotScript) to await addScriptTag before invoking
page.evaluate so the injected function is present without using eval.

In @.claude/skills/dev-browser/tsconfig.json:
- Line 6: The tsconfig.json sets "module": "Preserve" which requires TypeScript
>=5.4, but package.json currently allows ^5.0.0; update the TypeScript
dependency in .claude/skills/dev-browser/package.json to ^5.4.0 (or later) so
the compiler supports the "Preserve" module option and re-run install/build to
confirm compatibility.

In @.claude/skills/prd/SKILL.md:
- Around line 162-164: Update the illustrative examples in SKILL.md so the
example phrase is capitalised for consistency: change the example slugs shown
(`prd-workout-tracker.json`, `prd-usage-billing.json`) to a capitalised form
(e.g., `prd-Workout-Tracker.json`, `prd-Usage-Billing.json`) and ensure the
surrounding text still reads the same; locate the Examples line that references
these filenames and replace the lowercase slugs with the capitalised variants.
- Around line 147-149: Replace the incorrect verb form "setup" with "set up"
wherever it's used as a verb in the bullets: change "**New projects**: include
initial setup stories (scaffold, env/config, local dev, deploy basics, **package
installs**)" to use "set up" (e.g., "include initial set up stories") and change
the phrasing in the Ordering bullet that reads "**first story must be setup**
(scaffold + installs + scripts + env/config)" to "**first story must be set
up**" so the verb form is correct; leave "setup" as a noun where appropriate.

In `@src/interview/cli.test.ts`:
- Around line 629-631: Remove the dead testDir usage: delete the assignment to
testDir inside the beforeEach block and remove or update the class-level
declaration of testDir so it is no longer declared/unused; leave projectId
initialization in beforeEach as-is and ensure tests continue to use
getInterviewDir(projectId) for directory creation.

In `@src/interview/cli.ts`:
- Around line 1287-1309: The factory createReadlineReader uses synchronous
require instead of the promised dynamic import; change createReadlineReader to
be async (returning Promise<InputReader>), replace the require call with await
import('node:readline') to load readline dynamically, keep the rl creation and
returned object logic the same, and update all callers of createReadlineReader
to await the factory (and adjust types to Promise<InputReader> where needed).
- Around line 1095-1127: The transcriptEntryCount is only incremented once in
handleQuestion and not at all in handleApproval, causing it to fall out of sync
with actual appended entries; update both handlers to use
appendTranscriptEntryAndUpdateState (from persistence.ts) for every append or,
if not using that helper, call appendTranscriptEntry and then increment
this.state.transcriptEntryCount and saveInterviewState() for each
createTranscriptEntry/appendTranscriptEntry call (reference
createTranscriptEntry, appendTranscriptEntry,
appendTranscriptEntryAndUpdateState, saveInterviewState,
this.state.transcriptEntryCount, handleQuestion, handleApproval).

In `@src/interview/engine.ts`:
- Around line 921-941: When handling response.decision === 'Continue' (in the
block that creates a transcript via createTranscriptEntry and updates state with
appendTranscriptEntryAndUpdateState), replace the delegable question in
this.currentQuestion with an open-text question for the same phase before
returning; set this.currentQuestion to a new question object whose type is the
open-text variant used by the engine (so consumers reading
this.currentQuestion.type will get an open entry point rather than the
delegation options), then return the updated state/nextQuestion as before—this
ensures callers prompt for free text instead of re-displaying the delegation
choices.

In `@src/interview/persistence.ts`:
- Around line 85-93: getInterviewDir currently constructs a filesystem path
using the raw projectId which allows absolute paths or “../” traversal to escape
the Criticality data dir; update getInterviewDir to validate/sanitise projectId
before joining (e.g., reject empty, path.isAbsolute(projectId) and any segments
containing '..' or path separators, or normalise/slugify to a safe token), and
if invalid throw an error or replace with a validated slug; reference the
getInterviewDir function and ensure any callers handle the thrown error or the
returned safe slug.

In `@src/interview/types.test.ts`:
- Around line 455-464: The test in the describe('InterviewState with features')
block manually calls vi.useFakeTimers()/vi.setSystemTime()/vi.useRealTimers()
inside the it('should include features array in initial state') test; refactor
to use beforeEach and afterEach hooks for timer setup/teardown (use
vi.useFakeTimers() and vi.setSystemTime(...) in beforeEach and
vi.useRealTimers() in afterEach) so the test using
createInitialInterviewState('test-project') remains unchanged but the timer
mocking is consistent with the rest of the file and applied around the it block.

In `@src/interview/types.ts`:
- Around line 165-187: The example for InterviewState incorrectly includes a
transcript array; update the example to match the InterviewState shape by
removing the transcript field and adding transcriptEntryCount: number (e.g.,
transcriptEntryCount: 0 or a relevant integer). Locate the example block
referencing InterviewState and replace the transcript property with
transcriptEntryCount so the example matches the InterviewState type.
