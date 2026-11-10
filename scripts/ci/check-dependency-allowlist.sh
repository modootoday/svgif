#!/usr/bin/env bash
# Fail when a package.json dependencies name is absent from the allowlist.
# devDependencies are ignored. The script does not scan file contents for names.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

check_tree() {
  local tree="$1"
  local list="$2"
  python3 - "$tree" "$list" <<'PY'
import json
import os
import sys
from pathlib import Path

tree = Path(sys.argv[1])
list_path = Path(sys.argv[2])
if not list_path.is_file():
    print("allowlist file is missing", file=sys.stderr)
    sys.exit(1)

allowed = set()
for raw in list_path.read_text(encoding="utf-8").splitlines():
    text = raw.split("#", 1)[0].strip()
    if text:
        allowed.add(text)

skip = {"node_modules", ".git"}
missing = []
found = False
for dirpath, dirnames, filenames in os.walk(tree):
    dirnames[:] = [name for name in dirnames if name not in skip]
    if "package.json" not in filenames:
        continue
    found = True
    path = Path(dirpath) / "package.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        print(f"package.json is not valid JSON: {path}", file=sys.stderr)
        sys.exit(1)
    if not isinstance(data, dict):
        print(f"package.json is not an object: {path}", file=sys.stderr)
        sys.exit(1)
    deps = data.get("dependencies", {})
    if deps is None:
        deps = {}
    if not isinstance(deps, dict):
        print(f"dependencies is not an object: {path}", file=sys.stderr)
        sys.exit(1)
    for name in deps:
        if name not in allowed:
            missing.append(f"{path}: {name}")

if not found:
    print("no package.json in the tree", file=sys.stderr)
    sys.exit(1)
if missing:
    print("runtime dependency is not on the allowlist:", file=sys.stderr)
    print("\n".join(missing), file=sys.stderr)
    sys.exit(1)
print("dependency allowlist ok")
PY
}

if [[ "${1:-}" == "--self-test" ]]; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  list="$tmp/allowlist.txt"
  printf '%s\n' '# comment' '' 'listed-name' >"$list"
  empty_list="$tmp/empty-allowlist.txt"
  printf '%s\n' '# none' '' >"$empty_list"

  mkdir -p "$tmp/empty" "$tmp/listed" "$tmp/missing"
  printf '%s\n' '{"dependencies":{},"devDependencies":{"other-name":"1.0.0"}}' >"$tmp/empty/package.json"
  printf '%s\n' '{"dependencies":{"listed-name":"1.0.0"},"devDependencies":{"other-name":"1.0.0"}}' >"$tmp/listed/package.json"
  printf '%s\n' '{"dependencies":{"other-name":"1.0.0"}}' >"$tmp/missing/package.json"

  check_tree "$tmp/empty" "$empty_list" >/dev/null
  check_tree "$tmp/listed" "$list" >/dev/null
  if check_tree "$tmp/missing" "$list" >/dev/null 2>&1; then
    echo "unlisted runtime dependency was accepted" >&2
    exit 1
  fi
  if check_tree "$tmp/missing" "$empty_list" >/dev/null 2>&1; then
    echo "empty allowlist accepted a runtime dependency" >&2
    exit 1
  fi
  echo "dependency allowlist self-test ok"
  exit 0
fi

check_tree "$root" "$root/scripts/ci/dependency-allowlist.txt"
