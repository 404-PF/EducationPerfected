# Publishing v2026.11.14 (owner steps)

CI never tags, releases or publishes. After the internal test build passes on your machine:

1. Download the staged bundle artifact (`release-bundle-v2026.11.14-<sha>`) from the release-bundle-staging run and unzip it. Verify: `sha256sum -c SHA256SUMS`.
2. Tag and release on GitHub: tag `v2026.11.14` on the bundle's commit, publish a normal (non-draft, non-prerelease) release named v2026.11.14, paste `release-notes.md` as the body, and attach every bundle file (5 raw executables, `educationperfected-setup-windows-x64.exe`, 2 `.pkg`, 2 `.deb`, 2 `.rpm`, `educationperfected-2026.11.14.tgz`, `install.sh`, `install.ps1`, the 5 notices zips, `SHA256SUMS`).
3. npm: `npm login` with your own account, then `npm publish educationperfected-2026.11.14.tgz --access public`. The tarball is already packed and byte-verified; its postinstall downloads the platform binary from the release in step 2 and verifies it against `SHA256SUMS`, so publish the npm package only AFTER the GitHub release is live.
4. The updater sees the release as soon as it is non-draft/non-prerelease with the five `educationperfected-<target>` assets plus `SHA256SUMS`; the extra assets are ignored by it.
