# Native validation protocol (not release evidence)

Do not mark a check passed from this document. Record the exact source commit, OS version and architecture, Node builder version, browser version, artifact/native payload hashes, reviewer and retrievable logs for each run. Synthetic accounts and local mock lessons only; this protocol does not authorize live Education Perfect answers or distribution.

## Build and payload

Build on the target architecture with a supported native binding and the pinned browser. The current builder supports native glibc Linux x64 and ARM64. A Windows x64 development builder is recorded below; macOS targets still need builders before their checks can run. Preserve notices beside the executable. Verify the launched browser's actual executable path points into the artifact-owned extraction, not an installed browser or host cache. Test a damaged payload, failed startup and interrupted extraction; each must fail safely and remove owned temporary files without touching unrelated files.

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
