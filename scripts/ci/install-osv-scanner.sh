#!/usr/bin/env bash
# Install one pinned osv-scanner binary and verify its checksum.
set -euo pipefail
version="v2.7.1"
checksum="fb7dab19a8bd9bbe5c3189f09d4b7ee1820c9553a23bac202648a56efd2f6ee8"
dest="${1:-/usr/local/bin/osv-scanner}"
tmp="$(mktemp)"
curl -fsSL -o "$tmp" "https://github.com/google/osv-scanner/releases/download/${version}/osv-scanner_linux_amd64"
echo "${checksum}  ${tmp}" | sha256sum -c
chmod +x "$tmp"
mv "$tmp" "$dest"
