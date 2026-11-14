#!/bin/sh
# EducationPerfected installer for macOS and Linux.
# Downloads the raw binary for this machine plus SHA256SUMS from a release,
# verifies the checksum, then installs to ~/.local/bin (no sudo).
# Usage: sh install.sh [version]   (default: latest release)
set -eu
version=${1:-latest}
if [ "$version" = latest ]; then
  base="${EP_INSTALL_BASE_URL:-https://github.com/404-PF/EducationPerfected/releases/latest/download}"
else
  base="${EP_INSTALL_BASE_URL:-https://github.com/404-PF/EducationPerfected/releases/download/v$version}"
fi
case "$(uname -s)" in
  Darwin) os=macos;;
  Linux) os=linux;;
  *) echo "Unsupported OS: $(uname -s)" >&2; exit 1;;
esac
case "$(uname -m)" in
  arm64|aarch64) arch=arm64;;
  x86_64|amd64) arch=x64;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1;;
esac
asset="educationperfected-$os-$arch"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
echo "Downloading $asset"
curl -fsSL "$base/$asset" -o "$tmp/$asset"
curl -fsSL "$base/SHA256SUMS" -o "$tmp/SHA256SUMS"
expected=$(awk -v f="$asset" '{n=$2; sub(/^\*/, "", n); if (n == f) {print $1; exit}}' "$tmp/SHA256SUMS")
[ -n "$expected" ] || { echo "SHA256SUMS has no line for $asset" >&2; exit 1; }
actual=$(sha256sum "$tmp/$asset" 2>/dev/null || shasum -a 256 "$tmp/$asset")
actual=${actual%% *}
[ "$actual" = "$expected" ] || { echo "Checksum mismatch for $asset; download discarded." >&2; exit 1; }
dest="$HOME/.local/bin"
mkdir -p "$dest"
install -m 755 "$tmp/$asset" "$dest/educationperfected"
echo "Verified and installed to $dest/educationperfected"
case ":$PATH:" in *":$dest:"*) ;; *) echo "Add $dest to your PATH to run it from anywhere.";; esac
echo "Next: educationperfected setup"
