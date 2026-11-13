# Downloadable stable-release candidate policy

This prepares stable version `2026.0.0` without a prerelease suffix. It is not release approval or a statement that native checks pass.

## Distribution boundary

The downloadable candidate is a Node SEA executable plus its dependency/runtime
notices. It contains no Chrome/Chromium archive or executable. Build with
`npm run build:downloadable-candidate -- 2026.11.12-validation.1 linux-x64`
(replace the candidate date/number and native target as appropriate) on the matching native host with Node
22.23.4. Existing `*-dev` builders still embed a browser and are NOT this
publication path. Do not upload their artifacts by mistake.

On first ordinary launch the candidate asks in an interactive terminal before
fetching Chrome for Testing 156.0.8078.47 directly from Google's fixed HTTPS
source. It shows Google's terms links. Declining stops before browser launch.
The five platform archive SHA-256 pins were independently measured from the
exact Google downloads listed by the official version manifest; these are our
observations, not Google-published checksums. The installer verifies that hash
before extraction. It does not run npm, install Node, or install system packages.
No browser binary is mirrored or included in our release. Browser terms and
notices remain Google's, accessible in the downloaded payload and chrome://credits.
The CfT dashboard repository's Apache license is not a license for Chrome binaries.

The browser is retained under `~/.educationperfected/browsers` for later launches.
An incomplete installation or install lock stops rather than using arbitrary
host browsers. The exclusive lock is acquired before prompting, so concurrent
first runs do not both ask. If a crash/power loss leaves a lock, the error names
its exact path and the cache directory. Close all EducationPerfected processes
before removing that lock and orphaned `.download-*` staging directories there,
then retry. Never delete a live installation's lock/staging. Successful normal
cleanup removes owned staging; SIGKILL/power loss cannot guarantee cleanup.
This explicit recovery avoids guessing whether another process still owns a lock. No automatic installed-browser fallback is provided. First run
needs internet, about 200 MB download space plus extraction space, and the OS
libraries/tools required by Chrome and its ZIP extractor. The archive hash is verified at download time; on cache reuse the executable
is rehashed against its locally recorded post-extraction hash to detect corruption.
That receipt is not a signature or protection against an attacker controlling the
user account. Other browser resources retain normal user-directory permissions.
An unchanged cached executable is reused; this is not yet an offline-support claim.
Browser launch and sandbox requirements are not waived. No sandbox-disabling
flag is added by the downloader. Linux distribution/library compatibility is
limited to the hosts actually validated.

## Unsigned release

Use an explicit unsigned release policy: no paid code-signing identity, Windows
publisher certificate, Apple Developer ID or notarization is promised. macOS
SEA construction still needs its existing ad-hoc integrity signature; that is
not publisher authentication. Final macOS bytes must pass their ad-hoc signature
check. Windows/Linux files are unsigned. Publish SHA-256 hashes for the exact
files and keep platform warnings explicit. Do not promise that Gatekeeper,
SmartScreen, antivirus or organization policies will permit them. Do not advise
users to disable OS-wide protections. Native downloaded-file launch behavior
must be tested before supplying any platform-specific exception instructions.

## Contributor risk decision, not legal clearance

Page elected to proceed despite unresolved other-contributor rights on
12 November 2026 after reviewing the limits of akioweh's permission. Record the
owner decision, not a claim that akioweh can authorize others' contributions.
LICENSE and its public rights limits remain unchanged. Schema2 calls this
`project-rights-owner-risk-decision`, explicitly distinct from legal clearance.
A reviewer must establish that the decision covers the proposed release scope;
its presence does not supply tag/release/upload approval.

## Evidence required

Schema2 keeps four global records and six records for each of five targets.
`browser-acquisition-policy` replaces bundled-browser redistribution review:
verify no Chrome bytes are shipped and document direct Google acquisition terms.
`browser-acquisition-launch` replaces the embedded-browser check: prove a fresh
first-run consent/download/hash path, correct native browser launch, cache reuse,
cancellation/failure behavior and cleanup for the exact executable. The other
native/store/shutdown/no-Node checks remain. No old fixture is relabeled passed.
Evidence states `distributionMode: direct-google-download` and
`browserBundled: false`; the field alone is not binary inspection. Candidate construction checks the
builder manifest and exact SEA asset keys before claiming no browser. Independent
artifact-integrity review must verify the shipped executable matches that candidate,
not trust self-reported evidence fields.

No release/evidence.json is populated by this policy. Final-commit build,
artifact/notices review, native credential save/read/delete, real console
shutdown, and clean-machine no-Node evidence remain required on all five targets.
Build success is not no-Node launch proof. Target narrowing needs a new decision.
A future reviewed publication workflow must run release:check before upload.
Self-owned repository changes follow the autonomous-work grant with independent exact-head review and passing checks. Every tag, release and publication still needs Page's explicit approval.

## Source references

- https://googlechromelabs.github.io/chrome-for-testing/156.0.8078.47.json
- https://developer.chrome.com/docs/automation-and-testing/chrome-for-testing
- https://www.google.com/chrome/terms/
- https://policies.google.com/terms

## Optional internal Windows startup test artifact

The manual preparation workflow can stage the exact inventoried Windows no-browser
executable, notices, candidate inventory, checksums and TESTING.txt in a 7-day Actions
artifact only when upload_windows_test is explicitly true. The default is false.
This public repository's artifacts are readable by signed-in GitHub users with
repository read access, not collaborator-only or private. Owner approval of that
audience is required before enabling the input. No tag, release, Pages or release
certification follows from this internal test package. Native probe failures remain
failures; test download availability is not evidence that Windows first-run works.
