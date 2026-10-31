# Native validation protocol (not release evidence)

Do not mark a check passed from this document. Record the exact source commit, OS version and architecture, Node builder version, browser version, artifact/native payload hashes, reviewer and retrievable logs for each run. Synthetic accounts and local mock lessons only; this protocol does not authorize live Education Perfect answers or distribution.

## Build and payload

Build on the target architecture with a supported native binding and the pinned browser. The current builder supports native glibc Linux x64 and ARM64. Windows and macOS targets still need builders before their checks can run. Preserve notices beside the executable. Verify the launched browser's actual executable path points into the artifact-owned extraction, not an installed browser or host cache. Test a damaged payload, failed startup and interrupted extraction; each must fail safely and remove owned temporary files without touching unrelated files.

The Linux development builder now puts the browser archive inside a SEA asset, not an appended EOF payload. Full-size generation and packaged integrity/CLI tests passed on a standard 16 GB Ubuntu 22.04 runner; constrained local full-size injection was killed. Build memory requirements are not yet characterized. At runtime the full browser asset is mapped by SEA; streaming the Blob does not establish the earlier file-stream memory profile, and runtime peak/minimum RAM remain unmeasured. This is not a signing-compatible format claim for other operating systems. Node's macOS SEA sequence removes the original signature, injects with a Mach-O segment option, then signs. Signing changes the executable. For native ports, retain browser data in a SEA asset or platform resource before final signing; verify the final signed executable still exposes and validates the embedded asset.

## Host-isolation surrogate versus clean-machine proof

The CLI fixture within `npm run test:packaged` copies the executable outside the source directory and launches it with a new HOME, config/data/cache/runtime directories, an empty PATH and a working directory without project files. Its controller still runs on the build host with Node and shared system libraries installed. This is useful isolation evidence, not a separate clean-machine or five-platform certification. The separate integrity fixture in that command still inherits HOME, PATH and the working directory; it isolates TMPDIR only. Neither fixture certifies a clean end-user machine.

For actual clean-machine proof, use a fresh VM or physical machine with no Node installation, no project source/node_modules and no Puppeteer browser cache. Transfer only the executable and notices through an authorized route. Record installed OS dependencies. Check help, launch, embedded browser path and clean shutdown. For mock login and controls, independently provision a disposable mock endpoint on a separate test host reachable from the clean machine, with its exact fixture revision recorded and no real account data. The packaged executable does not bundle or serve the mock site. Keep the no-Node machine free of the mock server and its source; configuring the local-fixture login URL/host must point only to that controlled endpoint. Until such an endpoint and routing are verified, record these clean-machine checks as not run, not passed. Do not install Node to repair a failed test and then claim no-Node success. A hosted runner with Node already installed does not itself meet this check.

## Disposable native credentials and console

Use a disposable OS user/profile and native credential store. Test setup with hidden input, save/read/delete as one record, cancellation without mutation, and unavailable/locked-store failure without secret output. On Linux use a fresh HOME and private D-Bus/Secret Service; keep its daemon PID and kill/wait before deleting the session. Headless runner credential-store availability is a check to perform, not an assumption.

Test real console Ctrl+C, terminal close and supported termination events both idle and during active work. First interruption must drain safely; explicit repeated interruption must behave as documented. POSIX child.kill fixtures and Windows SKIP results are not Windows console-event proof. On macOS, separately test downloaded/quarantined launch and the chosen signing policy. On Windows, separately verify the chosen signed or explicitly unsigned policy and actual console behavior. Do not purchase a certificate or choose distribution policy through this protocol.

## Recording and release gates

Use `release/criteria.json` without silently dropping selected targets. Any narrower beta scope needs an explicit scope decision. Record failures and skips honestly. Native validation does not clear project rights, browser redistribution or notice obligations. Run the release checker on the same clean source commit used for the final artifact, review the evidence itself and obtain publication authority separately. The checker cannot prove authenticity or prevent later source edits.

## Official references checked October 31, 2026

- Node 22 SEA: https://nodejs.org/docs/latest-v22.x/api/single-executable-applications.html
- Puppeteer platform requirements: https://pptr.dev/guides/system-requirements
- Chrome for Testing downloads: https://developer.chrome.com/docs/automation-and-testing/download-test-binaries
- Apple signing: https://developer.apple.com/library/archive/technotes/tn2206/_index.html
- Windows PE signatures: https://learn.microsoft.com/en-us/windows/win32/secbp/understanding-pe-signatures
- Standard hosted runner labels: https://docs.github.com/en/actions/reference/runners/github-hosted-runners

Standard public GitHub-hosted runners offer candidate native architectures (`windows-2025`, `macos-15`, `macos-15-intel`, `ubuntu-24.04`, `ubuntu-24.04-arm`). Their presence does not prove this program's credential store, console or clean-machine checks pass. No workflow or artifact upload is set up by this document.

## Linux sandbox compatibility caveat

Ubuntu 24.04 runner tests built the full SEA successfully but the separately installed Chrome for Testing also failed before packaging with "No usable sandbox". Ubuntu 22.04 tests passed without `--no-sandbox` or disabling host security settings. The Ubuntu 22 result does not establish Ubuntu 24 compatibility. Treat sandbox prerequisites as a release support-matrix check; do not silently disable the browser sandbox or global AppArmor restrictions. See https://pptr.dev/troubleshooting and https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md .

Native Ubuntu 22.04 x64 and ARM64 CI passed full builds and packaged mock CLI/checksum/startup-interruption checks. The runners still have Node and shared host libraries, and native credential CRUD was not exercised by that matrix. Neither lane is complete release evidence. Ubuntu 22.04 is an interim test baseline, not a substitute for resolving Ubuntu 24.04 sandbox compatibility or selecting a supported longer-term baseline.
