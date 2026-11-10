#!/usr/bin/env bash
# Fail if any indexed text file contains CRLF or mixed line endings.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
cd "$root"

bad=$(git ls-files --eol | awk '$1 == "i/crlf" || $1 == "i/mixed" { print }' || true)

if [[ -n "$bad" ]]; then
  printf '%s\n' "CRLF or mixed line endings in the git index:" "$bad" >&2
  printf '%s\n' "Store text as LF. .gitattributes sets eol=lf. See .editorconfig." >&2
  exit 1
fi

printf '%s\n' "Line endings: indexed text files are LF."
