# Native validation protocol (not release evidence)

Do not mark a check passed from this document. Record the exact source commit, OS version and architecture, Node builder version, browser version, artifact/native payload hashes, reviewer and retrievable logs for each run. Synthetic accounts and local mock lessons only; this protocol does not authorize live Education Perfect answers or distribution.

## Build and payload

Build on the target architecture with a supported native binding and the pinned browser. Development builder source exists for native glibc Linux x64/ARM64, Windows x64 and macOS ARM64/x64. macOS source and synthetic archive/layout checks are not native build proof. Preserve notices beside the executable. Verify the launched browser's actual executable path points into the artifact-owned extraction, not an installed browser or host cache. Test a damaged payload, failed startup and interrupted extraction; each must fail safely and remove owned temporary files without touching unrelated files.

The Linux development builder now puts the browser archive inside a SEA asset, not an appended EOF payload. Full-size generation and packaged integrity/CLI tests passed on a standard 16 GB Ubuntu 22.04 runner; constrained local full-size injection was killed. Build minimum RAM remains unproved. At runtime the full browser asset is mapped by SEA; the read-only raw view avoids a whole-asset Blob copy, but does not establish total process-tree peak or minimum RAM. See the bounded measurements below. This is not a signing-compatible format claim for other operating systems. Node's macOS SEA sequence removes the original signature, injects with a Mach-O segment option, then signs. Signing changes the executable. For native ports, retain browser data in a SEA asset or platform resource before final signing; verify the final signed executable still exposes and validates the embedded asset.

## Host-isolation surrogate versus clean-machine proof

The CLI fixture within `npm run test:packaged` copies the executable outside the source directory and launches it with a new HOME, config/data/cache/runtime directories, an empty PATH and a working directory without project files. Its controller still runs on the build host with Node and shared system libraries installed. This is useful isolation evidence, not a separate clean-machine or five-platform certification. The separate integrity fixture in that command still inherits HOME, PATH and the working directory; it isolates TMPDIR only. Neither fixture certifies a clean end-user machine.

For actual clean-machine proof, use a fresh VM or physical machine with no Node installation, no project source/node_modules and no Puppeteer browser cache. Transfer only the executable and notices through an authorized route. Record installed OS dependencies. Check help, launch, embedded browser path and clean shutdown. For mock login and controls, independently provision a disposable mock endpoint on a separate test host reachable from the clean machine, with its exact fixture revision recorded and no real account data. The packaged executable does not bundle or serve the mock site. Keep the no-Node machine free of the mock server and its source; configuring the local-fixture login URL/host must point only to that controlled endpoint. Until such an endpoint and routing are verified, record these clean-machine checks as not run, not passed. Do not install Node to repair a failed test and then claim no-Node success. A hosted runner with Node already installed does not itself meet this check.

## Disposable native credentials and console

Use a disposable OS user/profile and native credential store. Test setup with input visible while typing, save/read/delete as one record, cancellation without mutation, and unavailable/locked-store failure without secret output. On Linux use a fresh HOME and private D-Bus/Secret Service; keep its daemon PID and kill/wait before deleting the session. Headless runner credential-store availability is a check to perform, not an assumption.

Test real console Ctrl+C, terminal close and supported termination events both idle and during active work. First interruption must drain safely; explicit repeated interruption must behave as documented. POSIX child.kill fixtures and Windows SKIP results are not Windows console-event proof. On macOS, separately test downloaded/quarantined launch and the chosen signing policy. On Windows, separately verify the chosen signed or explicitly unsigned policy and actual console behavior. Do not purchase a certificate or choose distribution policy through this protocol.

## Recording and release gates

Use `release/criteria.json` without silently dropping selected targets. Any narrower release scope needs an explicit scope decision. Record failures and skips honestly. Native validation does not clear project rights, browser redistribution or notice obligations. Run the release checker on the same clean source commit used for the final artifact, review the evidence itself and obtain publication authority separately. The checker cannot prove authenticity or prevent later source edits.

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


### Source resolver native-store bridge (validation pending)

The Mac owned-keychain source fixture and Linux private Secret Service fixture now call the exact current credential-resolution block extracted from `index.js`, without loading browser startup. They require one actual versioned native-store read, the expected synthetic pair and its OS-store source. Environment/test-boot credentials are absent in the isolated evaluation context; warnings, legacy-store dependencies and prompt fallback fail closed. Boundary drift and duplicate reads have inert rejection controls. This is a bounded source native-store resolver check, not production SEA exact-value retrieval, the whole browser/authentication path or live EP authentication. Native results must be recorded separately before claiming this check passed. No production credential, test-boot or login-URL guard is changed.


### Source resolver checkpoint and next Windows read check

Exact commit `cf4dee0421e5da92f7173920504fcf08be98a69b` passed [Mac ARM64/Intel](https://github.com/404-PF/EducationPerfected/actions/runs/41301714604), [Linux x64/ARM64](https://github.com/404-PF/EducationPerfected/actions/runs/41301714574), and [Windows worker/SEA-delete](https://github.com/404-PF/EducationPerfected/actions/runs/41301714612). Mac and Linux logs now verify the exact current production credential-resolution block reads the expected synthetic native record once and selects its OS-store source. Mac metadata restoration/owned keychain removal and Linux direct owned keyring/bus exit before root removal passed. This is source native-store selection proof, not SEA exact-value retrieval or the whole browser authentication path.

On earlier `5518eb50ddbc04e268dfa6a875031f3c1ca82406`, the Windows SEA deletion and extraction checks passed but outer fixture-file cleanup failed. Its native error code/path was not captured. The later complete pass does not establish a fix or cause. Fixed, sanitized cleanup classification is now available if that failure recurs; no retry or browser change was added.

The Windows fixture adds a fresh-process read using the same copied production executable's `--check-credentials`, before deletion. This check passed on `c8abcd4c6acf25503e755f5a5753d52ea1370810`, as recorded below. It requires fixed status text, each child close, idle source workers, empty extraction and an independently unchanged synthetic record. That pass establishes SEA native read/valid record shape only, not exact SEA-returned values, packaged setup, browser reliability, real console events or no-Node support. No record is printed or live service contacted.


### Windows zero-credential ConPTY capability stage (host-bounded native proof)

The next bounded stage uses the hosted runner's verified Node executable and a fixed test-only TTY checker. It does not load the product, call a credential API, submit answers or prove no-Node support. An owned unnamed job contains the suspended child before resume; the transport requires exact process exit, zero active owned-job processes and output EOF. Creation-side pipe handles are closed after child creation. Public inert input is sent only after the raw-mode marker, and absence of echo is checked from drained output. A native pass is required before using this transport for any production SEA setup fixture. Inert emulation and ABI sizes are not native capability evidence or physical-console certification.

The Windows SEA health-read subset passed on `c8abcd4c6acf25503e755f5a5753d52ea1370810`: [native job](https://github.com/404-PF/EducationPerfected/actions/runs/41303346154/job/124838658313). The same copied executable completed fresh-process shape read and deletion, with independent source record checks and full cleanup. SEA exact-value retrieval, interactive packaged setup and real-console events remain open.

Transport references: [Microsoft ConPTY creation](https://learn.microsoft.com/en-us/windows/console/creating-a-pseudoconsole-session), [ConPTY close lifetime](https://learn.microsoft.com/en-us/windows/console/closepseudoconsole), [job objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects), [job accounting structure](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_accounting_information). No new product dependency or alternate credential-input route is introduced.


The first owned ConPTY capability runs did not pass. On `179e2ef1143de152ee2b81b204b1c6873b8db688`, the fixed child actually emitted `stdinTTY=0 stdoutTTY=0 rawMode=0` directly into the runner log and exited nonzero, while the transport's drained readiness fields were unknown. [Actual Windows job](https://github.com/404-PF/EducationPerfected/actions/runs/41309336345/job/124856244391). This proves the checker ran and its TTY guard failed; it does not prove an OS bug or a specific attachment/root cause. No credential mutation step ran.

The next zero-credential attempt uses one diagnostic ladder: the OS-resolved System32 command interpreter writes a fixed marker and exits 7; the verified Node executable writes a fixed flushed marker and exits 8; the same TTY checker tests raw input with distinct guard/input/timeout exits 1/2/3. Expected 7/8 exits apply only to those controls and still require drained markers and full ownership cleanup. The transport prints only fixed fields and its bounded DWORD exit code after ownership certainty, never arbitrary drained text. Any ownership uncertainty stops the ladder and retains the root. This stage has bounded native ladder proof on hosted Windows at `5322755f5e6a78b515451f7a8f61274b415f2dd8`; no production setup is enabled.


Source comparison identified a specific transport fix candidate: use `STARTF_USESTDHANDLES` with all three standard handles NULL while keeping `bInheritHandles=FALSE`. Maintained [node-pty source](https://raw.githubusercontent.com/microsoft/node-pty/main/src/win/conpty.cc), its [merged handle-isolation change](https://github.com/microsoft/node-pty/pull/334), and [Microsoft's redirected-parent ConPTY discussion](https://github.com/microsoft/terminal/discussions/15814) describe why redirected parent defaults can otherwise be duplicated into the child. On `5322755f5e6a78b515451f7a8f61274b415f2dd8`, the unchanged zero-credential ladder passed in the [actual Windows job](https://github.com/404-PF/EducationPerfected/actions/runs/41314321312/job/124871048781): the System32 control drained its required marker and exited 7; the Node control drained its required marker and exited 8; the TTY/raw/no-echo/input contract exited 0. Process/job/EOF/worker and owned-root cleanup passed. No child capability marker was relayed directly into the runner log; drained readiness metadata remained unknown because of terminal presentation, so this is not a logged literal `1/1/1` claim. The source-backed fix is established for this hosted redirected-parent case, not a general Windows or physical-console claim. SEA interactive setup subsequently passed the bounded synthetic save/source-exact-pair/health/delete/cleanup chain at `3b1268ca62e21c5220605c1d93b8293ae53360f1`, as recorded below. Exact `S_OK` plus non-NULL HPCON is also required before child creation. No TTY/no-echo guard, job containment or credential scope is relaxed.

### Hosted Windows SEA interactive setup protocol and bounded proof

The synthetic setup fixture is restricted to a disposable GitHub-hosted Windows x64 runner. It refuses any existing fixed-slot record and treats an unreadable record as unverified, not absent. A fresh independent null check and idle source worker precede the per-slot write-attempt flag and helper launch. The public synthetic pair is fixed in the helper, never supplied in argv or environment. The same copied production SEA runs `--setup` through the owned ConPTY transport; input follows the actual `EP email` and `EP password` labels. The current production prompt arms raw mode and its data listener before writing each label. The proof is drained-output echo of the public synthetic answers plus acknowledgement and an independent exact source-store pair, not an independent OS echo-mode measurement.

The helper never relays child output. Its once-only terminal receipt certifies inner process/job-zero/EOF/writer/handle closure. The outer controller requires helper close, the exact complete receipt/code pair and no timeout, parent termination, stderr, duplicate or trailing output. A bare exit code, missing receipt, unexpected crash code or missing input echo is ownership uncertainty. It retains the owned root and possibly written record without native deletion or starting a health job. Job kill-on-close is a safety backstop, not proof after a dead helper. Missing typed-input echo in drained bytes takes fixed-primary precedence even over other command errors.

After certified setup success, an independent exact pair check precedes a fresh same-SEA health read, another unchanged exact source pair, SEA deletion, fresh independent null, idle workers and extraction/root cleanup. Pair mismatch and ordinary closed health failure retain their primary and allow owned cleanup; a transport timeout or other uncertainty does not. Cleanup failure cannot replace the original primary, is separately reported, and never counts as confirmed absence. A reused runner with a leftover record refuses writes and deletes. Runner teardown is the final boundary for uncertainty; no automatic recovery or later cleanup is claimed. On `3b1268ca62e21c5220605c1d93b8293ae53360f1`, the [actual Windows job](https://github.com/404-PF/EducationPerfected/actions/runs/41318936462/job/124884847345) passed this chain with exact LF success receipt, exit0, closed=true and no timeout/parent kill/stderr. This proves synthetic SEA setup with independently source-verified exact bytes, fresh SEA valid-shape read, unchanged source pair, deletion and cleanup on the hosted runner. It does not prove SEA-returned exact values, normal browser authentication, physical-console events or clean-machine/no-Node behavior. Prior `6a19d55` failed with ownership uncertainty; its helper outcome remains unknown. The reproduced Python Windows CRLF emitter defect was sufficient to cause receipt rejection, not established as that run's sole cause.


Hosted cancellation checkpoint: before the successful save chain, the same production SEA is driven with empty email, then with public synthetic email and empty password. Each case requires fresh independent absence and idle source workers before launch, exact cancellation acknowledgement and no save acknowledgement in drained output, full helper closure, then fresh independent absence, idle workers and empty extraction. Expected cancellation uses no credential delete. Any cancellation failure, unexpected record, unreadable verification or uncertain closure retains the attempt/root without deletion or a new job. Empty Enter needs no echo; a nonempty answer that fails to echo is ownership uncertainty. Both cancellation cases passed at `224abf68f144ec83df30afe8dfe6d0949150d9e8` in the [actual Windows job](https://github.com/404-PF/EducationPerfected/actions/runs/41321206326/job/124891625816), followed by the unchanged successful setup/read/delete/cleanup chain.


Hosted raw-input interruption checkpoint: `interrupt-email` and `interrupt-password` send exactly byte3 only after the corresponding production armed prompt label. Only these modes expect child130; save/cancel still require child0, and helper success remains its separate exit0/strict closed receipt. Both cancellation and save acknowledgements are forbidden; email interruption additionally forbids a password label. A standalone ETX control byte needs no echo, but every other nonempty answer must echo in the drained output. Each interruption requires fresh independent null/idle before and null/idle/empty extraction after, with no native credential delete. Failure or uncertainty retains the owned attempt/root and prevents the next job. This tests production raw-input byte3 handling, not GenerateConsoleCtrlEvent delivery, physical terminal close, OS signals, browser drain or terminal-mode restoration measured independently. At `b8c046c11da7358eed24f9cdc1eacaea1b3d2a67`, the [actual Windows job](https://github.com/404-PF/EducationPerfected/actions/runs/41323101028/job/124897295099) passed both raw-input interruption contracts, both cancellations and the unchanged successful setup/health/delete/cleanup chain. Each helper had strict success-LF receipt, exit0, confirmed close and no timeout/parent kill/stderr; child130 remained interruption-mode-specific. This is hosted raw-input proof only. Locked/unavailable native-store behavior and clean-machine/normal-auth gates remain unproved.


## Isolated modified-build normal saved-login observations (November 3, 2026)

These observations are on the separate public test branch, not PR49's production
source commit. They close a bounded validation question for a build-time-modified
fixture only. They do not mark a release gate passed on PR49, prove a byte-identical
production executable, authorize distribution, or contact live Education Perfect.

The modified build substitutes only the login-endpoint module with a fixed
`http://127.0.0.1:43187/app/login` endpoint. Same-job production/fixture JS bundle
attribution checks require identical bytes outside that module and the same input
module graph apart from that module's byte counts. The native executable is built
and tested on the same Ubuntu22 runner, never uploaded. Native artifact hashes
below identify different architecture-specific artifacts, not interchangeable
executables.

| Observation | Exact test source | Run and job | Modified executable SHA256 |
| --- | --- | --- | --- |
| Linux x64 normal saved-login | `39962429e28d741ac4e0002f2f7ac5db77f2e002` | [Run41525790754](https://github.com/404-PF/EducationPerfected/actions/runs/41525790754), [job125553056290](https://github.com/404-PF/EducationPerfected/actions/runs/41525790754/job/125553056290) | `076031014433bf463a7020d94d056434cf43d35c2f495842279d1c199630fd39` |
| Linux ARM64 normal saved-login | `273461526b075c25b7f1b15c89af663e746ec08c` | [Run41527347024](https://github.com/404-PF/EducationPerfected/actions/runs/41527347024), [job125558391345](https://github.com/404-PF/EducationPerfected/actions/runs/41527347024/job/125558391345) | `3ca64bc5078d8a2ed9bfe652629ebe011c9e40ab8a5a987bfd749cbeb341ed9f` |

Both runs completed the full reviewed acceptance path: private user/net/PID/mount
chain, owned resolver files, capability drop/no_new_privs, no inherited sockets,
loopback topology, empty routes, reserved-address egress and reserved-name lookup
checks, sealed outer-net baseline comparison, artifact-hash validation, owned
Secret Service/keyring/display, synthetic native record save/read, and exactly one
matching fixture POST after normal saved-store auto-login. The product received
only `quit` as input. Pass also required normal output markers, exit0/no signal,
absent product process group, native record removal/read-absence, empty owned tmp,
and owned-process cleanup. Fixed stage names identify attempted operations; those
names alone are not success proof. The final pass depends on the reviewed checks
and process/result agreement. Workflow cleanup passed and artifacts count was0.

Both JS main bundles had SHA256
`c5191b8efb0c80b7578de19f9fa985a47350ecd90582d460370e332dc8ef76e3`.
The normalized source-input-set digest was
`476e6cf883096667a64d93c001e91c4abebe3b1ef4ddbe7640ae0ddaeb17350b`.
That digest matches normalized source inputs, not runtime/toolchain/native artifact
identity. Local dependency layout produced a different full JS bundle hash; no
cross-environment byte-equivalence claim follows.

Failure history stays qualified. [Run41426552932](https://github.com/404-PF/EducationPerfected/actions/runs/41426552932)
failed without stage detail and remains unlocated.
[Run41522518508](https://github.com/404-PF/EducationPerfected/actions/runs/41522518508)
failed at the namespace-reference check; readlink failure versus equality was not
retained. The next reviewed change replaced an unproven `/proc/1` outer-net
reference with a bounded sealed bootstrap baseline, not a removed admission gate.
[Run41524705279](https://github.com/404-PF/EducationPerfected/actions/runs/41524705279)
failed at display readiness with unknown subcause. The following success added
only diagnostic substages; it is not evidence a functional display fix occurred.

### Mac capability observation is separate

At test commit `6dad81788e820d593310faeb5bbbab8cf3fd3172`,
[run41528559699](https://github.com/404-PF/EducationPerfected/actions/runs/41528559699)
passed network-capability-only checks on
[Apple Silicon](https://github.com/404-PF/EducationPerfected/actions/runs/41528559699/job/125562525506)
and [Intel](https://github.com/404-PF/EducationPerfected/actions/runs/41528559699/job/125562525951).
The fixed parent and inherited child observed policy errno denial for reserved
IPv4/IPv6 TCP/UDP and a different loopback port, plus an owned loopback exchange
and process-group cleanup. No keychain, browser, product or build ran. This is not
DNS/Mach-broker attestation, filesystem/keychain confinement, normal Chromium
sandbox compatibility, or product admission. A viable complete Mac boundary for
normal saved-login testing remains unresolved; do not widen services or disable
the browser sandbox to turn this limited result into a product pass.

Unmodified-artifact normal saved-login, Mac and Windows normal saved-login,
Windows browser reliability/console events, clean-machine/no-Node hosts,
Ubuntu24 compatibility, project/browser rights and signing remain open. No
`release/evidence.json` is created from these fixture-only observations.


### Source regression fixture refresh

On unchanged main e88c7ad, cli-test.js expected supported multi-select semi-auto
to stop automatically. It now verifies the exact selected set and zero Submit
before and after an explicit stop. The legacy drain fixture used a selection
question, where interrupted selection intentionally preserves dialogs and skips
modal deletion; the preload never reached its delayed $$eval. The fixture now
uses the local audio route to reach legacy modal cleanup. Production code is
unchanged. Both prior failures were stale test assumptions, not evidence of an
environment-only failure or a product regression. Updated full test:phase3
passed locally, including normal and forced signal drains, CLI and restart.

source-regression.yml runs test:phase3 on ordinary pull requests and main pushes,
with pinned Node/actions, no persisted Git credential, dependency lifecycle
hooks disabled and the pinned headless-shell installed. It only uses local
synthetic pages. Hosted workflow success remains to be observed; this is not
a native package/no-Node/browser-certification pass, and branch protection
requirements are not changed by adding the workflow.

### Current subcommand migration

Historical rows above retain the exact flags used by their original binaries.
Current source and future candidate binaries use `setup`, `check-credentials`
and `forget-credentials`. Removed --forms fail before native/runtime/download
work. The migrated fixture source is not itself another native pass. Windows
and Linux credential fixtures seed an inert cached-browser receipt inside their
owned disposable HOME to isolate credential setup; that file is never launched.
macOS retains runner HOME for verified owned keychain selection, so its fixture
uses actual consented browser acquisition/cache reuse. Both avoid opening EP.
Run `npm run test:packaged-harness`, `npm run test:browser-download`,
`npm run test:store` and `npm run test:store:pty` for inert/local contracts.
`cli-command-test.js` covers bootstrap dispatch, including update before runtime
initialization and uninstall's cleanup callback. `uninstall-test.js` uses only
synthetic files/stores and checks maintenance-lock contention, cancel/no-delete,
safe removal, uncertain runs, locks, unknown data, symlink target retention,
store failures and cleanup failures. These do not certify native uninstallation
or Windows executable replacement.
macOS fixture PATH now contains only an owned symlink to /usr/bin/unzip,
not Node or Chrome. Its wrapper deadline accommodates the browser install
timeout; the previous 90-second deadline did not. No new native run is claimed.

Safety follow-up: uninstall retains all browser caches pending manual inspection,
including unknown nested data; no recursive browser deletion is attempted.
Maintenance-lock conflicts and release failures name the exact retained lock
with close-all-processes/manual-inspection recovery, never stale-PID stealing.

Hosted source-regression pass for tested commit172ea0705ebc27923e5e48c48a69d458b5f938f4:
https://github.com/404-PF/EducationPerfected/actions/runs/43361167760 .
The main-integration head below needs its own checks; this cited pass is not
claimed as native certification or coverage of later source changes.


### Bounded Windows initial-login recovery

Validation11 source31600846f87dd0ca1a9d0c8e9d3965593ad59a49 built all5
targets, passed4POSIX jobs and Windows credential setup/health/delete, but
Windows initial navigation failed. Plain failed-job rerun did not clear all
Windows checks: https://github.com/404-PF/EducationPerfected/actions/runs/43365224412 .

Dormant helper experiment at7866aecc394ad4bd4685062f8288c066ab8b42fc:
https://github.com/404-PF/EducationPerfected/actions/runs/43366580232 .
Baseline3/4 independent launches failed ERR_ABORTED. All6 guarded-recovery
launches reached the local synthetic login,4 after retry. Error44/NetworkService
restart markers persisted, so lower-level AppContainer creation is not fixed.
The product policy now tries one750ms-delayed retry only for initial untouched
Windows about:blank ERR_ABORTED. It refuses retry after any mainframe response,
redirect/nonGET request, navigation, page close or other failure. No answer,
authentication response or submission is retried. Sandbox settings unchanged.
The source experiment is not packaged SEA proof; that requires another native
validation. Upstream restart mechanism:
https://github.com/chromium/chromium/commit/66b7f8a3ea8cc19a726665c83dabd717aaaa129d .


### Windows first-run fixture scope correction

Validation12 atce81e3ea9b8a65d024db4f09ac448fcfa70b5585 passed all5
builds/4POSIX lanes, Windows cached exact SEA mock login/semi-auto0Submit/quit
and native credentials. First-run ConPTY reached downloaded/checksummed browser
and owner login-ready, then failed later without ERR_ABORTED.
https://github.com/404-PF/EducationPerfected/actions/runs/43367914433 .

The first-run driver had sent ETX at login-ready under EP_TEST_BOOT, which
intentionally bypasses credential prompts and has no raw-input ETX listener
at that checkpoint. It did not establish a working Windows console interrupt.
The driver now tests the explicit `setup` subcommand: decline, then consented
acquisition/checksum and optional credential-setup skip. No secret is supplied
or saved. Cached SEA local login/quit is a separate proof; this fixture no
longer claims a unified first-run browser/raw-ETX shutdown proof. Native run
of this changed fixture remains awaited. No product change for this correction.
