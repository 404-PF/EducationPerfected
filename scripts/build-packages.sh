#!/usr/bin/env bash
# Build the per-platform packages (pkg/deb/rpm) around an already-validated
# candidate binary, then prove each package carries that exact binary by
# expanding/extracting it and comparing bytes. Fails closed on any mismatch.
set -euo pipefail
target=$1; version=$2; src=$3; out=$4
[[ -f $src ]]
case "$version" in (*[!0-9.]*|'') echo "version must be numeric parts"; exit 1;; esac
identical() { cmp -s "$1" "$2" || { echo "package payload is not byte-identical to the validated candidate: $1"; exit 1; }; }
mkdir -p "$out"
case "$target" in
  macos-*)
    command -v pkgbuild >/dev/null || { echo "pkgbuild not found on this runner"; exit 1; }
    payload=$(mktemp -d)
    mkdir -p "$payload/usr/local/bin"
    install -m 755 "$src" "$payload/usr/local/bin/educationperfected"
    pkg="$out/educationperfected-$target.pkg"
    pkgbuild --root "$payload" --identifier com.404pf.educationperfected --version "$version" --install-location / "$pkg" >/dev/null
    check=$(mktemp -d)
    pkgutil --expand-full "$pkg" "$check" >/dev/null
    identical "$check/Payload/usr/local/bin/educationperfected" "$src"
    ;;
  linux-x64|linux-arm64)
    mkdir -p "$out"
case "$target" in
      linux-x64) debarch=amd64; rpmarch=x86_64;;
      linux-arm64) debarch=arm64; rpmarch=aarch64;;
    esac
    command -v dpkg-deb >/dev/null || { echo "dpkg-deb not found on this runner"; exit 1; }
    work=$(mktemp -d)
    # .deb
    mkdir -p "$work/deb/DEBIAN" "$work/deb/usr/bin"
    install -m 755 "$src" "$work/deb/usr/bin/educationperfected"
    printf 'Package: educationperfected\nVersion: %s\nArchitecture: %s\nMaintainer: 404-Page-Found\nDescription: Education Perfect helper CLI (packaged binary)\n' "$version" "$debarch" > "$work/deb/DEBIAN/control"
    dpkg-deb --build --root-owner-group "$work/deb" "$out/educationperfected_${version}_${debarch}.deb" >/dev/null
    ex=$(mktemp -d)
    dpkg-deb --extract "$out/educationperfected_${version}_${debarch}.deb" "$ex"
    identical "$ex/usr/bin/educationperfected" "$src"
    # .rpm
    command -v rpmbuild >/dev/null || { echo "rpmbuild not found on this runner (apt-get install rpm)"; exit 1; }
    mkdir -p "$work/rpm/BUILD" "$work/rpm/RPMS" "$work/rpm/SOURCES" "$work/rpm/SPECS" "$work/rpm/SRPMS"
    cp "$src" "$work/rpm/SOURCES/educationperfected"
    cat > "$work/rpm/SPECS/educationperfected.spec" <<SPEC
Name: educationperfected
Source0: educationperfected
Version: $version
Release: 1
Summary: Education Perfect helper CLI (packaged binary)
License: MIT
BuildArch: $rpmarch
%description
Packaged command-line app that opens Education Perfect in a dedicated browser window.
%install
mkdir -p %{buildroot}/usr/bin
install -m 755 %{SOURCE0} %{buildroot}/usr/bin/educationperfected
%files
/usr/bin/educationperfected
SPEC
    rpmbuild -bb --define "_topdir $work/rpm" "$work/rpm/SPECS/educationperfected.spec" >/dev/null
    rpm_file=$(find "$work/rpm/RPMS" -name '*.rpm' | head -1)
    [[ -n $rpm_file ]]
    mv "$rpm_file" "$out/educationperfected-${version}-1.${rpmarch}.rpm"
    exr=$(mktemp -d)
    (cd "$exr" && rpm2cpio "$out/educationperfected-${version}-1.${rpmarch}.rpm" | cpio -idm --quiet)
    identical "$exr/usr/bin/educationperfected" "$src"
    ;;
  *)
    echo "no packages for target $target";;
esac
