First stable release of EducationPerfected.

## What it does

EducationPerfected is a packaged command-line app that opens Education Perfect in a dedicated browser window. You sign in yourself (optionally saving the login in your OS credential store), then start automatic answering with `start`. Two modes: `mode auto` answers and submits automatically; `mode semi` fills answers but waits for your per-question approval before any submission. Assessments are always refused. The `update` command upgrades the app from this repository's GitHub releases, verifying the download against this release's SHA256SUMS file. The `uninstall` command asks per item - saved login, app data, downloaded browsers; each prompt defaults to keeping the item - and removes only what you confirm.

## Install and first run

1. Install for your platform. Windows: run `educationperfected-setup-windows-x64.exe` (per-user, no admin: Start menu entry, optional PATH, and an uninstaller that can also remove the saved login and app data, each defaulting to keep), download the raw `educationperfected-windows-x64.exe`, or run `install.ps1`. macOS: download the raw `educationperfected-macos-*` binary or `educationperfected-macos-*.pkg` (unsigned; right-click it and choose Open), or run `install.sh`. Linux: download the raw `educationperfected-linux-*` binary, the `.deb` or `.rpm` for your architecture, or run `install.sh`. Or skip all of these with npm: `npm install -g educationperfected`. `install.sh`, `install.ps1` and the npm package verify your download against `SHA256SUMS` automatically; verify manual downloads against it below. `THIRD-PARTY-NOTICES-<target>.zip` carries the licenses for each build. The updater keeps working for installed copies; the new packages are never update targets.
2. On macOS/Linux, make the downloaded file executable: `chmod +x educationperfected-*` (the download loses the executable bit). Builds are unsigned. On Windows, SmartScreen shows "Windows protected your PC": choose "More info", then "Run anyway". On macOS, the downloaded app is quarantined: right-click it and choose Open once, or run `xattr -d com.apple.quarantine educationperfected-macos-*`.
3. Run `educationperfected setup` in a terminal. Every installer above (setup exe, install.ps1, install.sh, .pkg, .deb, .rpm, npm) installs that command; a raw download keeps its file name, so run that instead (for example `.\educationperfected-windows-x64.exe setup` or `./educationperfected-macos-arm64 setup`). It asks consent for a one-time Chrome for Testing download (about 200 MB from Google, stored in `~/.educationperfected`), then offers to save a login in your OS credential store. Both are optional; a saved login can be removed with `forget-credentials`.
4. Run `educationperfected` to open the login browser and the interactive CLI. `help` lists every command.

## Known limits

- Builds are unsigned. SHA256SUMS verification detects download corruption, not a compromised publisher; there is no independent signing trust anchor.
- Clean-machine evidence (a machine without Node or development tools) and Windows physical-console evidence were not gathered; validation ran on hosted runners and one owner-run Windows artifact test.
- On macOS, reading back a saved login from the packaged build is unproved.
- The updater only sees normal (non-draft, non-prerelease) releases whose tag is a plain three-part version such as `v2026.11.14`, and needs the five platform assets plus `SHA256SUMS` attached to the release.

Built from commit a7fc6499fe969b999ccfff2f720b59081a9faff0 (all six validation lanes green: https://github.com/404-Page-Found/EducationPerfected/actions/runs/43555380722).
