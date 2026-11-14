# Windows startup diagnostic candidate (not a fix)

Status update, 2 November 2026: Phase 3 remains WIP and PR49 is unmerged.
The historical proposals below are design history, not current execution authority.
A separate workflow-only PR50 put a manual workflow on main, pinned to
5e36f51abf5b69510c30adffbe832654df79d28b. Its one approved invocation
[41348821347](https://github.com/404-Page-Found/EducationPerfected/actions/runs/41348821347)
stopped with source uncertainty before SEA. Source browser start and failure cause
remain unestablished. Its authorization window has expired; no repeat, new pin or
new diagnostic invocation is authorized by this document. Later branch changes,
including the zero-browser transport probe, have not been manually run natively.
Existing standard platform CI is separate evidence. Historical Windows startup
cause is still unknown.

## Instrumentation and observer boundary

The owner keeps the original goto await and options. No additional await, CDP
call, delay, retry or launch change precedes owner readiness. TEST_BOOT alone
captures a timestamp and lazily loads the fixed failure recorder in the catch.
The same error object is rethrown before owner startup cleanup. The recorder
cannot throw over the primary. The marker is a single fixed stdout line after a
nonnull reachLoginForm result, not wsEndpoint or browser-launch availability.

Only fixed failure fields are emitted: allowlisted category, elapsed milliseconds
clamped to 0..120000 (null if unavailable), controllerConnected=null (not observed),
markerEmitted=false and browserExitCodeClass=unobserved. The last field deliberately
does not invent an exit observed before owner cleanup. Controller connection is deliberately unobserved by the owner recorder. The
revised fixture separately proves its own observer is marker-gated; other
endpoint-only harnesses or external clients are not covered by that guarantee.
Original process/browser logs are not made privacy-safe by this record.

The observer waits boundedly for both endpoint and owner marker. It sends no
browser connection/target/Page/CDP calls before that boundary. The endpoint must
be local loopback WebSocket. After readiness, exact mock login URL, page target,
open Page and initialized main frame are required; no positional pages fallback.
Its borrowed browser connection is disconnected, never used to close the owner's
browser. Disconnect failure runs through existing independent cleanup precedence.
Marker timeout or child exit is uncertainty, not startup success. Cleanup and
residue proof remain separate from readiness. This is not OS-console or no-Node
proof. No real account, credential store, EP submissions or settings are involved.

## Pre-registered eventual native panel (still held)

Maximum ONE fresh source cold start, then ONE fresh SEA cold start. Stop at FIRST
failure or uncertainty, including cleanup uncertainty. No warm leg, retry,
continued comparison after source failure or rerun-on-green is allowed.

Before either leg can run, the exact future runner must independently prove:

- Same pinned browser build and archive in both legs, using in-run archive
  checksum validation and fixed version fields. Source must launch an extraction
  of that verified same archive, not an unrelated installed/cache browser.
- Equality of source archive and SEA-embedded archive, verified in-run through
  trusted asset/extraction evidence. The existing SEA bootstrap checks embedded
  length and checksum; browser executable canonical containment must separately
  prove the owned extraction and prohibit fallback. Filename equality is not proof.
- Fresh owned HOME/TMP/cache per leg, original launch options/timeout unchanged,
  local mock only and independent closure/residue checks, retaining uncertainty.

Browser identity/comparison orchestration is NOT implemented by these helpers.
It remains a blocking separate reviewed preparation step before any native run.
The previous packaged fixture now uses the safe observer but is NOT itself the
source+SEA comparison runner and must not be dispatched as that panel.

Source failure stops the panel, so no both-fail or source-only comparison can be
obtained. SEA-only failure after source success narrows a packaging/extraction
boundary as a lead, not a cause or fix. Both green means one instrumented sample
failed to reproduce the intermittent failure, with no causal/reliability claim.
ANY instrumented pass is not evidence about the uninstrumented path. No claims
about Defender, SmartScreen or concurrency, and no security-policy changes.
Normal saved-login, unavailable/locked store, historical startup reliability,
physical console, clean-machine and distribution gates stay open.

## Inert controls

`node scripts/test-navigation-cause-test.js` executes the actual source navigation
block against fake goto errors, checks reference identity, category/privacy,
normal-boot lazy-import exclusion, bounded timing and marker source placement.
Ordering is goto -> report -> test rejection observation, not an executed owner
cleanup catch. Owner cleanup order is source-reviewed separately.
`node scripts/packaged-fixture-page-test.js` checks connection ordering, marker
expiry/child exit without connection, fixed endpoint/local target constraints,
initialized Page and disconnect-only ownership. These are deterministic controls,
not actual browser, Windows or cleanup-host proof. Reviewer mutations are required
before native release of the candidate.


## Same-archive contract preparation (source-only, not a runnable panel)

The development manifest now includes the pinned public Puppeteer Chrome revision.
A dual TEST_BOOT + EP_TEST_BROWSER_IDENTITY diagnostic gate lazily emits public
archive hash/length/version and fixed evidence booleans after the existing hash
verification and unpack, before the unchanged CLI handoff. It adds no await.
Normal boot neither loads the receipt module nor emits the receipt. A receipt
alone does not prove launched browser identity: the runner must compare it with
independent source archive hash and the actual post-owner-marker browser version
and canonical owned-extraction path on BOTH legs. Missing/duplicate/mismatched
receipt, missing/tampered archive, version/path mismatch, readiness failure or
cleanup uncertainty is an explicit uncertainty outcome, never silent skip or
cache fallback. Identity equality is decided by the runner, not asserted by a
leg. Build manifest changes are metadata, not public release authorization.

`startup-browser-identity.js` supplies only hash/receipt/path/equality/staging
contracts and does not spawn, unpack or connect. Its injected leg callbacks are
inert tests, not actual native runs. The native runner/extraction/process-closure
implementation is present but UNEXECUTED, NOT AUTHORIZED and separately review-gated.
A future runner must configure BOTH legs as TEST_BOOT shell-mode over the FULL
pinned Chrome archive, not compare default source shell with embedded full Chrome.
It must source-first stop on ANY primary or identity/readiness/cleanup uncertainty
before SEA, maximum two cold starts, no warm legs, retries or green fishing.
The outcome matrix and instrumented-vs-uninstrumented limits above still apply.

## Proposed disposable-host runner, still native-held

The unexecuted runner is manual-only and not wired to push CI. A fixed Python
wrapper runs each Node diagnostic driver under the existing ConPTY job. Its
receipt certifies only the supervisor's directly observed driver exit, job active
accounting, drained EOF/writer and handle checks. It does NOT prove global Chrome
tree closure; nested browser jobs are not independently demonstrated. Kill-on-close
and disposable hosted-VM teardown are containment backstops, not proof.
The earlier proposed deliberately orphaning canary is withdrawn, not a third start.

Per-leg fresh-root/nonces and strict single LF closure receipt bind result DATA;
stale/missing/conflicting records stop. Parent independently compares source hash,
SEA receipt, actual post-marker Chrome version and owned extraction relationship.
Root rename probe failure is uncertainty/retain/stop; success is merely a negative
lock indicator, NOT proof no process survives. No production credential read, real
login, remote page or answer command is performed. One browser owner per leg.
Source first and SEA only after all required observations, at most two cold starts.

The manifest browserVersion is the expected pinned Chrome version, not an observed
cached binary version. Actual post-ready browser version must match it.
Both owners use pipe stdio inside a ConPTY-supervised driver. Thus this is a
ConPTY-mediated job configuration, different from the prior standalone pipe fixture,
and TEST_BOOT shell-mode over full pinned Chrome, not production fidelity. Ordinary
Linux/Mac regression passes do not substitute for this Windows comparison.

Outer driver: 120s = 30s hash/unpack allowance + 45s owner-marker bound
+ 20s mock CLI-ready + 10s quit + 9s existing stop fallback + 6s bookkeeping.
30s hash/unpack is an ALLOWANCE, not a pinned phase deadline; slow preparation can
still preempt. 45s marker intentionally preempts the owner's internal 60s selector
ceiling: timeout is uncertainty, not navigation cause. Browser launch 30s unchanged.
Existing credential supervisor callers keep default 30s; diagnostic selects 120s.
Additional supervisor closure bound 27s (5 process + 5 job + 5 reader + 12 writer), parent 155s
with 8s margin. Parent timeout always uncertainty/retain. No retries or warm legs.

This design remains blocked on exact runner/wrapper/privacy/inert mutation review
and an explicit bounded native execution gate. Successful supervised observations
will never be described as independent all-descendant process-exit certification.


Corrective evidence boundary: source archive extraction consumes the exact in-memory
snapshot that was hashed, never a reopened pathname. The source fixed receipt is
emitted in-process after independent snapshot verification and parsed strictly.
Its provenance differs from the SEA receipt observed on child stdout; neither
substitutes for the post-ready actual browser/path check. Missing, duplicate or
tampered records stop. Wrapper fake assertions are
outside the helper's broad exception handler. Final panel root removal must finish
before the single outcome line; removal failure is cleanup uncertainty with
seaAttempted=true, never a green line followed by preparation failure. Driver CLI
roots are restricted to fresh canonical OS-temp ep-startup-panel-*/source or /sea
directories with no symlink parent/root or traversal. These checks do not turn vm
or a privileged host into a security sandbox.

### Early evidence on a failed leg

The helper returns a nonce/mode-bound fixed failure stage, the last strictly ordered
and bound driver stage observed on drained output, an allowlisted transport status,
and its observed-closure flag. The panel prints only these validated fields. Missing,
duplicate, malformed, stale, extra or out-of-order evidence stays unknown. A stage
means that marker was observed, not that the operation following it succeeded.
`spawn-entered` and `spawn-returned` refer to the CLI owner spawn call, not proof of
browser creation. No raw child output, paths, exception text or credentials are
printed. This adds observation only: budgets, cleanup decisions and source-first
stop-on-uncertainty behavior are unchanged. Callback delivery does not certify
closure. Inert/static tests are not native driver execution or a cause finding.

## Diagnostic path security boundary assessment

The 14 S8707 annotations share the diagnostic leg's CLI root input; they are not
14 independent input sources and are not the normal product CLI's argument path.
On main the separate manual workflow invokes the old pinned panel; absence of a
workflow file on a particular PR branch is not absence of deployed history.
The panel creates the root and selects the fixed helper/driver. Host flags are
usage guards, not authentication against a local caller able to set environment.

The leg checks the intended Windows x64 hosted environment before CLI root
metadata access, then retains the canonical direct-temp/layout/symlink checks and
its separate empty-directory assertion. SEA copy refuses an existing destination
rather than overwriting it. These are bounded fail-closed controls, not a sandbox.

Path canonicalization does not freeze later descendants. A controlled POSIX
synthetic test can validate a leg root, replace its tmp descendant with a symlink,
and cause later pathname operations to resolve outside that leg. The origin
helper canonicalizes the supplied root too, so it cannot independently authenticate
the original creator after such a swap. A correctly named fresh empty root can
also be supplied by another local caller. These are explicit ownership/stability
assumptions, not observed intrusion, remote exploit, Windows junction evidence or
acceptance of the findings. POSIX 0700/current-uid evidence does not establish
Windows ACLs. Repeated realpath checks would not provide race-free operations.

No same-user hostile-writer resistance, OS isolation policy or handle-bound
redesign is claimed here. The existing disposable-host/manual diagnostic contract
must be reviewed against these limits. Findings are not suppressed or classified
as false positives by this document, and it grants no native run or release.


## Fixed utility-service hash observation

The local hosted navigation comparison reads three additional fixed bounded
Browser.getHistogram names after the launch/page-operation block and before
browser closure. Page-selection, navigation or readiness may already have failed;
the separately reported stage records what was reached:
ChildProcess.LaunchFailed.UtilityProcessHash, ChildProcess.Crashed.UtilityProcessHash
and ChildProcess.Launched.UtilityProcessHash. Only integer bucket bounds/counts
are logged, never arbitrary histogram names, URLs, profile paths or child output.
The existing 2-second per-operation limit, 16-bucket maximum, unknown-not-zero
handling and session cleanup remain unchanged. These are aggregate histograms:
matching one service hash cannot pair every error/last-error bucket to that service.

Validation7 recorded aggregate utility launch error44 in all four probes, including
a probe that reached local readiness. Pinned Chromium156 defines44 as inability
to create an AppContainer profile, not45 (executable-access failure). The cause of
ERR_ABORTED remains unproved. The new service hashes help distinguish which
utility services launched or failed without disabling sandboxing or changing
product behavior. Missing/colliding/ambiguous hashes remain inconclusive. No
Windows result or successful launch is claimed by this source-only addition.

Pinned source references:
- https://chromium.googlesource.com/chromium/src/+/156.0.8078.47/components/metrics/stability_metrics_helper.cc
- https://chromium.googlesource.com/chromium/src/+/156.0.8078.47/content/browser/service_host/service_process_host_impl.cc
- https://chromium.googlesource.com/chromium/src/+/156.0.8078.47/sandbox/win/src/sandbox_types.h
