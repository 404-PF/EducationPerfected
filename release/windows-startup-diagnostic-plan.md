# Windows startup diagnostic candidate (not a fix)

Status: source-only preparation, unpublished. No native comparison runner or run
is authorized by this candidate. Exact review, independent mutations and a later
explicit native gate are required. Historical Windows startup cause is unknown.

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
implementation remains NOT PREPARED, NOT AUTHORIZED and separately review-gated.
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

Both owners use pipe stdio inside a ConPTY-supervised driver. Thus this is a
ConPTY-mediated job configuration, different from the prior standalone pipe fixture,
and TEST_BOOT shell-mode over full pinned Chrome, not production fidelity. Ordinary
Linux/Mac regression passes do not substitute for this Windows comparison.

Outer driver120s allowance =30s hash/unpack allowance +45s owner-marker bound
+20s mock CLI-ready +10s quit +9s existing stop fallback +6s bookkeeping.
30s hash/unpack is an ALLOWANCE, not a pinned phase deadline; slow preparation can
still preempt.45s marker intentionally preempts the owner's internal60s selector
ceiling: timeout is uncertainty, not navigation cause. Browser launch30s unchanged.
Existing credential supervisor callers keep default30s; diagnostic selects120s.
Additional supervisor closure bound27s (5process+5job+5reader+12writer), parent155s
with8s margin. Parent timeout always uncertainty/retain. No retries or warm legs.

This design remains blocked on exact runner/wrapper/privacy/inert mutation review
and an explicit bounded native execution gate. Successful supervised observations
will never be described as independent all-descendant process-exit certification.
