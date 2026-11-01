# Native validation protocol (not release evidence)

Do not mark a check passed from this document. Record the exact source commit, OS version and architecture, Node builder version, browser version, artifact/native payload hashes, reviewer and retrievable logs for each run. Synthetic accounts and local mock lessons only; this protocol does not authorize live Education Perfect answers or distribution.

## Build and payload

Build on the target architecture with a supported native binding and the pinned browser. Development builder source exists for native glibc Linux x64/ARM64, Windows x64 and macOS ARM64/x64. macOS source and synthetic archive/layout checks are not native build proof. Preserve notices beside the executable. Verify the launched browser's actual executable path points into the artifact-owned extraction, not an installed browser or host cache. Test a damaged payload, failed startup and interrupted extraction; each must fail safely and remove owned temporary files without touching unrelated files.

The Linux development builder now puts the browser archive inside a SEA asset, not an appended EOF payload. Full-size generation and packaged integrity/CLI tests passed on a standard 16 GB Ubuntu 22.04 runner; constrained local full-size injection was killed. Build minimum RAM remains unproved. At runtime the full browser asset is mapped by SEA; the read-only raw view avoids a whole-asset Blob copy, but does not establish total process-tree peak or minimum RAM. See the bounded measurements below. This is not a signing-compatible format claim for other operating systems. Node's macOS SEA sequence removes the original signature, injects with a Mach-O segment option, then signs. Signing changes the executable. For native ports, retain browser data in a SEA asset or platform resource before final signing; verify the final signed executable still exposes and validates the embedded asset.

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

### Reproducible development CI references (not release attestations)

The architecture-aware builder/fixtures were tested on experimental source commit `6e2b50975b2e803a7bafc8a726c014e4a524d6a6`, using `.github/workflows/phase3-sea-asset-experiment.yml` on that branch, not the production PR branch. Both lanes used Node 22.23.4 and Chrome for Testing 156.0.8078.47. The production builder/CLI fixture have comment-only differences; the package test entrypoint and integrity fixture match that tested source. The bootstrap and checksum VM test were later changed and validated as recorded below.

| Native architecture | Host | Run and job logs |
| --- | --- | --- |
| ARM64 | Ubuntu 22.04 ARM64 | [Run 41164618655](https://github.com/404-PF/EducationPerfected/actions/runs/41164618655), [ARM64 job](https://github.com/404-PF/EducationPerfected/actions/runs/41164618655/job/124429410316) |
| x64 | Ubuntu 22.04 x64 | [Run 41164618655](https://github.com/404-PF/EducationPerfected/actions/runs/41164618655), [x64 job](https://github.com/404-PF/EducationPerfected/actions/runs/41164618655/job/124429410443) |

These lanes cover full SEA generation, sandboxed browser launch, packaged mock CLI with extracted-browser CDP path checks, corruption rejection and startup/hash-or-extraction signal cleanup. They do not record a complete native release gate as passed. No downloadable binary artifact was published by the workflow.

### Raw-asset memory experiment (not capacity certification)

Experimental source `cbf8a3dbe2b5dd146978b88993edd964f68bd694` uses a read-only `getRawAsset` view, 64 KiB stream chunks and event-loop yields during checksum verification. Node 22.23.4 [implements getAssetAsBlob by constructing a Blob](https://raw.githubusercontent.com/nodejs/node/v22.23.4/lib/sea.js); the raw view avoids that whole-asset copy. The production bootstrap and checksum fixture match this experimental source. The same Node/browser versions and Ubuntu 22.04 native runner labels were used as above.

[Run 41168696427](https://github.com/404-PF/EducationPerfected/actions/runs/41168696427) passed both native lanes, including packaged mock browser/controls, corruption rejection, startup SIGINT/SIGTERM/SIGHUP cleanup and packaged synthetic credential setup/delete in a private Secret Service. Setup/delete interoperability is not normal answer-path credential-read proof. The source adapter also verified the synthetic record and separate CRUD; no real account was used.

| Architecture and job | Build command max RSS (KiB) / elapsed | Packaged CLI command max RSS (KiB) / elapsed | Executable bytes |
| --- | --- | --- | --- |
| [x64](https://github.com/404-PF/EducationPerfected/actions/runs/41168696427/job/124441765991) | 3,578,768 / 23.73 s | 282,240 / 5.57 s | 317,656,256 |
| [ARM64](https://github.com/404-PF/EducationPerfected/actions/runs/41168696427/job/124441766185) | 3,583,900 / 17.01 s | 283,380 / 3.65 s | 318,442,624 |

GNU `time -v` wraps the build command and, separately, `xvfb-run` plus the Node packaged CLI fixture controller. These are observed workflow-command high-water values, not executable-only measurements, additive process-tree peaks or minimum supported RAM. One short synthetic run per revision is not a benchmark suite or long-workload capacity test. The otherwise identical Blob baseline `de4cb09415374c54330041d5b99ac5598584798f` recorded 835,868 KiB (x64) and 842,492 KiB (ARM64) for that CLI command in [run 41167812357](https://github.com/404-PF/EducationPerfected/actions/runs/41167812357). Elapsed time did not improve consistently. No no-Node-machine, signing, distribution-rights or Ubuntu 24.04 claim follows from either run.

### Windows x64 development experiment (not release evidence)

Experimental source `4860d4360383baffe3de14cfba7c6e3e3869b746` passed the pinned Windows 2025 workflow with Node 22.23.4. [Run 41179642204](https://github.com/404-PF/EducationPerfected/actions/runs/41179642204), [native job](https://github.com/404-PF/EducationPerfected/actions/runs/41179642204/job/124474222640). The production Windows builder, binding adapter, bootstrap and packaged fixtures match that tested source; the experimental workflow is not included in the production branch.

Observed: full PE SEA generation, actual packaged browser launch from owned extraction, local synthetic sign-in, semi-auto without answer submission, stop/quit and strict extraction cleanup. Actual browser-asset corruption was rejected at `EP_BROWSER_CHECKSUM` before browser launch and the temporary extraction was removed. Windows POSIX signal fixtures are explicitly not run; they cannot certify Windows console events. The host still has Node and shared libraries, so this is not clean-machine proof.

The earlier bootstrap eagerly loaded the native DLL in the main thread, and its Windows fixture failed strict extraction cleanup with native/browser files remaining. The exact filesystem failure was not captured, so that run alone does not prove which file lock caused it. The experimental bootstrap now installs a lazy Windows adapter. Credential operations use fixed-source workers and the fixed application record; success is returned only after worker exit. A source-host test loaded the real keyring DLL in a worker, confirmed deletion failed while loaded, then confirmed exit and successful DLL deletion without constructing an entry or calling a credential API. This is native lifetime evidence, not packaged credential CRUD. The packaged mock boot deliberately skips credential reads. Actual fresh-profile Windows save/read/delete and packaged-worker integration remain not run.

If a native worker times out, the caller fails, termination is requested and ownership remains live until exit is confirmed. A wedged native call can prevent exit. In that case cleanup retains the owned extraction and reports failure; later cleanup is not guaranteed. The failure exit code can replace a signal-specific code while a worker remains live. This is not a crash-residue or console-shutdown certification.

Recovered upstream notice files are checked out without text conversion so their exact provenance checksums survive Windows Git settings. No checksum check was weakened. The PE development build is not finally signed; injection can invalidate the inherited Node signature. These tests do not select an unsigned distribution policy, clear signing/rights requirements or authorize artifact publication. No binary artifact was uploaded by the workflow.


## macOS local CLI fixture entry point (not yet native-validated)

On each native Mac architecture separately, install the pinned dependencies/browser and run `npm run build:macos-dev`, then `npm run test:packaged:cli`. The latter selects only `build/macos-<native arch>/educationperfected`; it offers no executable override or cross-architecture fallback. It uses the local mock server and does not submit to live Education Perfect. A successful run would cover the copied artifact, embedded browser path, local sign-in, semi-auto without submission, stop/quit and extraction cleanup on that host. Merely selecting the path or passing synthetic tests proves none of these native behaviors.

Do not use `npm run test:packaged` as the Mac command: its native integrity fixture still supports Linux/Windows only. Damaging a signed Mach-O can cause the OS signature gate to reject it before the bootstrap checksum gate. Mac corruption/signature/quarantine tests need their own native protocol and are still pending. CLI-fixture results also do not prove credential-store operations, real terminal events, downloaded/quarantined launch, notarization or clean-machine/no-Node support. No native Mac run is recorded by this source change.


## Current-source native checkpoint: 1 November 2026

Commit `fc4ef1bd7ed979c3d33206220af4a22588c9967d` passed the [Mac ARM64/Intel matrix](https://github.com/404-PF/EducationPerfected/actions/runs/41295402724), [Windows source worker/SEA-delete lane](https://github.com/404-PF/EducationPerfected/actions/runs/41295402619), and [Linux x64/ARM64 matrix](https://github.com/404-PF/EducationPerfected/actions/runs/41295402703). Earlier sections above are historical checkpoints, not the latest coverage.

- Linux: native synthetic private Secret Service CRUD, packaged setup/delete with independent source verification, packaged browser/local controls/checksum/signals/cleanup.
- Windows: real source-worker synthetic CRUD, worker exit and DLL unlink; production SEA deletion of a source-prepared record, independent source null read and extraction cleanup. Not packaged setup/read, browser reliability, real console events or no-Node proof.
- Mac: full source controls, SEA build, development ad-hoc verification, local-mock packaged browser, source exact synthetic CRUD, SEA setup/fresh-process health-read/delete with independent source absence and extraction cleanup. Hosted-only owned temporary keychain selection and restoration were verified. Inherited HOME, not clean-profile/no-Node/Gatekeeper certification. Health read validates record shape, not exact saved bytes or normal answer-path use. The earlier source Node read of a SEA-created record timed out on both architectures; no ACL workaround was applied and its cause remains unproved.

No merge, release, binary upload, certificate identity or distribution clearance follows from these passes. Ubuntu24 support, Windows startup reliability, real console/clean-machine checks, Mac exact saved value/normal sign-in read, quarantine/Gatekeeper and rights/signing gates remain open.

### Ubuntu24 baseline investigation

The narrowly path-triggered/manual probe records current hosted Ubuntu24 AppArmor policy and tries the pinned installed browser once on `about:blank` with its sandbox enabled. It refuses unrestricted/unknown policy as compatibility evidence and does not alter AppArmor, sysctls, SUID helpers or use `--no-sandbox`. On commit `99a6b9ad1f1d79fd640ffdf7dc79335aa1c29449`, both [x64](https://github.com/404-PF/EducationPerfected/actions/runs/41297283488/job/124820669398) and [ARM64](https://github.com/404-PF/EducationPerfected/actions/runs/41297283488/job/124820669564) passed the guards with AppArmor enabled (`Y`), restricted user namespaces (`1`) and restricted unconfined (`0`), then failed the installed pinned browser launch with fixed class `sandbox-denied`. No child handle was returned, so the owned profile was retained for disposable VM teardown. This is observed restricted hosted-baseline incompatibility, not a SEA test, stock desktop certification or repaired Ubuntu24 support. No security-policy changes or sandbox bypass were attempted.

Sources: [Puppeteer troubleshooting](https://pptr.dev/troubleshooting), [Chromium user-namespace restrictions](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md), [Ubuntu AppArmor](https://documentation.ubuntu.com/security/security-features/privilege-restriction/apparmor/). Broad allowlisting of user-writable extraction trees or global namespace-policy disabling is not an approved packaged workaround.


Ubuntu24 remains an unresolved portable-package prerequisite. The current diagnostic reports known sandbox/namespace denial with fixed guidance and does not print native paths or recommend disabling the sandbox. A future fixed root-owned installation and administrator-reviewed per-app policy would be a different installation architecture, not a silent fix for user-writable random extraction. Broad user-writable path allowlists, global namespace-policy disabling and unreviewed SUID helpers are not adopted here.
