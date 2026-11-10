#!/usr/bin/env bash
# Docs and the README must not tell readers to install the unscoped name.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
cd "$root"
fail=0
while IFS= read -r file; do
  [ -f "$file" ] || continue
  if grep -nE 'npm (install|i|add)( [^@][^ ]*)* svgif($| )' "$file"; then
    echo "unscoped install in $file" >&2
    fail=1
  fi
done < <(git ls-files 'README.md' 'docs/**/*.md')
exit "$fail"
