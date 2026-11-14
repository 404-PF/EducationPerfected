# Changelog

## 2026.11.14 (2026-11-14)

First stable release.

### What it does

EducationPerfected is a packaged command-line app that opens Education Perfect in a dedicated browser window. You sign in yourself (optionally saving the login in your OS credential store), then start automatic answering with `start`. Two modes: `mode auto` answers and submits automatically; `mode semi` fills answers but waits for your per-question approval before any submission. Assessments are always refused. The `update` command upgrades the app from this repository's GitHub releases, verifying the download against the release's SHA256SUMS file. The `uninstall` command asks per item - saved login, app data, downloaded browsers; each prompt defaults to keeping the item - and removes only what you confirm.

### Install and first run

1. Download the asset for your platform from the v2026.11.14 release: `educationperfected-windows-x64.exe`, `educationperfected-macos-arm64`, `educationperfected-macos-x64`, `educationperfected-linux-x64`, or `educationperfected-linux-arm64`. Verify it against `SHA256SUMS` in the same release. On Windows, `educationperfected-setup-windows-x64.exe` is an optional per-user installer (no administrator rights needed): it places the app in `%LOCALAPPDATA%\Programs\EducationPerfected`, adds a Start menu entry, can add the app to your PATH, and registers an uninstaller that can also remove the saved login and app data (each defaults to keeping them). The raw executables are unchanged and the updater still applies to installed copies.
2. Builds are unsigned. On Windows, SmartScreen shows "Windows protected your PC": choose "More info", then "Run anyway". On macOS, the downloaded app is quarantined: right-click it and choose Open once, or run `xattr -d com.apple.quarantine educationperfected-macos-*`.
3. Run `educationperfected setup` in a terminal. It asks consent for a one-time Chrome for Testing download (about 200 MB from Google, stored in `~/.educationperfected`), then offers to save a login in your OS credential store. Both are optional; a saved login can be removed with `forget-credentials`.
4. Run `educationperfected` to open the login browser and the interactive CLI. `help` lists every command.

### Known limits

- Builds are unsigned. SHA256SUMS verification detects download corruption, not a compromised publisher; there is no independent signing trust anchor.
- Clean-machine evidence (a machine without Node or development tools) and Windows physical-console evidence were not gathered; validation ran on hosted runners and one owner-run Windows artifact test.
- On macOS, reading back a saved login from the packaged build is unproved.
- The updater only sees normal (non-draft, non-prerelease) releases whose tag is a plain three-part version such as `v2026.11.14`, and needs the five platform assets plus `SHA256SUMS` attached to the release.
