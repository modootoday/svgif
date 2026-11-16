#!/usr/bin/env bash
# Shared helpers for engine-gate.sh, visual-gate.sh, and export-gate.sh.
# Source this file. It does not run anything by itself.

# Print the test files of a package, one per line. Empty when there are none.
gate_test_files() {
  local pkg="$1"
  if [[ -d "$pkg/test" ]]; then
    find "$pkg/test" -maxdepth 1 -type f -name '*.test.ts' | sort
  fi
}

# Exit 1 when a package has source and no test file. A package without
# source is reported and skipped, because there is nothing to test yet.
gate_require_tests() {
  local pkg="$1"
  if [[ ! -d "$pkg/src" ]]; then
    echo "$pkg has no src; skipped"
    return 2
  fi
  if [[ -z "$(gate_test_files "$pkg")" ]]; then
    echo "$pkg has src and no test/*.test.ts" >&2
    return 1
  fi
  return 0
}

gate_require_tool() {
  local tool="$1"
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "missing $tool" >&2
    return 1
  fi
}

# Self-test shared by the three gates: a package with source and no test
# must be refused, and a package without source must be skipped.
gate_self_test() {
  local name="$1"
  local dir
  dir="$(mktemp -d)"
  mkdir -p "$dir/has-src/src" "$dir/no-src" "$dir/ok/src" "$dir/ok/test"
  : > "$dir/has-src/src/index.ts"
  : > "$dir/ok/src/index.ts"
  : > "$dir/ok/test/a.test.ts"
  local rc=0
  gate_require_tests "$dir/has-src" >/dev/null 2>&1 || rc=$?
  if [[ "$rc" -ne 1 ]]; then
    rm -rf "$dir"
    echo "$name self-test: source without tests was not refused" >&2
    return 1
  fi
  rc=0
  gate_require_tests "$dir/no-src" >/dev/null 2>&1 || rc=$?
  if [[ "$rc" -ne 2 ]]; then
    rm -rf "$dir"
    echo "$name self-test: a package without source was not skipped" >&2
    return 1
  fi
  rc=0
  gate_require_tests "$dir/ok" >/dev/null 2>&1 || rc=$?
  rm -rf "$dir"
  if [[ "$rc" -ne 0 ]]; then
    echo "$name self-test: a package with tests was refused" >&2
    return 1
  fi
  echo "$name self-test ok"
}
