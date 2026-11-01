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
