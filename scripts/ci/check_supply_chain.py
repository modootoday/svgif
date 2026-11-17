#!/usr/bin/env python3
"""Offline supply-chain checks for workflows, lockfiles, and the theme pin.

A third-party action must be a full commit SHA with a version comment.
Top-level workflow permissions are empty, and each job sets its own.
pull_request_target is rejected. Project installs use npm ci.

Caches are restored anywhere and saved only from main. A pull request can read a
cache but never write one. The release and Pages workflows use no Actions cache.
setup-node's own package cache stays off, because it saves from every event.
Build outputs, installed packages, and browser downloads are never tracked.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

SHA = re.compile(r"^[0-9a-f]{40}$")
USES = re.compile(r"uses:\s*(\S+)")
JOB = re.compile(r"^  [A-Za-z0-9_-]+:\s*$")
PERM = re.compile(r"^    permissions:\s*")
THEME = re.compile(r"^remote_theme:\s*(\S+)\s*$", re.M)
ECOSYSTEMS = ("npm", "github-actions", "bundler")
STEP = re.compile(r"^(\s*)- ")
NO_CACHE_WORKFLOWS = ("release.yml", "pages.yml")
# Paths that a build, an install, or a browser download writes. None of them is tracked.
OUTPUT_PATH = re.compile(
    r"(^|/)(node_modules|dist|\.bun|coverage|ms-playwright|_site|\.jekyll-cache|\.sass-cache)(/|$)|\.tsbuildinfo$"
)
# A tracked file larger than this is a build output or a fixture that belongs elsewhere.
MAX_TRACKED_BYTES = 1024 * 1024


def steps_of(lines: list[str]) -> list[tuple[int, list[str]]]:
    """Each step's first line number and its lines, by the indent of its dash."""
    steps: list[tuple[int, list[str]]] = []
    current: list[str] = []
    start = 0
    indent = -1
    for index, line in enumerate(lines, 1):
        match = STEP.match(line)
        if match and (indent < 0 or len(match.group(1)) == indent):
            if current:
                steps.append((start, current))
            current = [line]
            start = index
            indent = len(match.group(1))
            continue
        if current:
            if line.strip() and not line.startswith(" " * (indent + 1)) and not STEP.match(line):
                steps.append((start, current))
                current = []
                indent = -1
                continue
            current.append(line)
    if current:
        steps.append((start, current))
    return steps


def cache_errors(text: str, name: str) -> list[str]:
    errors: list[str] = []
    for start, block in steps_of(text.splitlines()):
        body = "\n".join(block)
        uses = USES.search(body)
        action = uses.group(1) if uses else ""
        if action.startswith("actions/cache"):
            if Path(name).name in NO_CACHE_WORKFLOWS:
                errors.append(f"{name}:{start}: this workflow publishes, so it uses no Actions cache")
            elif action.startswith("actions/cache@"):
                errors.append(f"{name}:{start}: use actions/cache/restore, and actions/cache/save from main only")
            elif action.startswith("actions/cache/save@"):
                guard = re.search(r"^\s*if:\s*(.+)$", body, re.M)
                if not guard or "refs/heads/main" not in guard.group(1):
                    errors.append(f"{name}:{start}: a cache is saved only when github.ref is refs/heads/main")
        if action.startswith("actions/setup-node@") and not re.search(r"package-manager-cache:\s*false", body):
            errors.append(f"{name}:{start}: setup-node needs package-manager-cache: false")
    return errors


def tracked_output_errors(sizes: dict[str, int]) -> list[str]:
    errors: list[str] = []
    for path, size in sorted(sizes.items()):
        if OUTPUT_PATH.search(path):
            errors.append(f"{path}: build outputs, installed packages, and browser downloads are not tracked")
        elif size > MAX_TRACKED_BYTES:
            errors.append(f"{path}: {size} bytes is over the {MAX_TRACKED_BYTES} byte limit for one tracked file")
    return errors


def workflow_errors(text: str, name: str) -> list[str]:
    errors: list[str] = []
    if "pull_request_target" in text:
        errors.append(f"{name}: pull_request_target is forbidden")
    head = text.split("\njobs:", 1)[0]
    if not re.search(r"(?m)^permissions:\s*\{\}\s*$", head):
        errors.append(f"{name}: top-level permissions must be {{}}")
    lines = text.splitlines()
    try:
        start = next(i for i, line in enumerate(lines) if line.startswith("jobs:"))
    except StopIteration:
        errors.append(f"{name}: missing jobs")
        start = len(lines)
    job_at: int | None = None
    saw_permissions = False

    def flush() -> None:
        nonlocal job_at, saw_permissions
        if job_at is not None and not saw_permissions:
            errors.append(f"{name}:{job_at + 1}: job is missing permissions")
        saw_permissions = False

    for index in range(start + 1, len(lines)):
        line = lines[index]
        if JOB.match(line):
            flush()
            job_at = index
        elif job_at is not None and PERM.match(line):
            saw_permissions = True
    flush()
    for index, line in enumerate(lines, 1):
        if "npm install" in line and "npm install --global npm@" not in line:
            errors.append(f"{name}:{index}: project dependencies must use npm ci")
        match = USES.search(line)
        if not match:
            continue
        ref = match.group(1).strip("'\"")
        if ref.startswith("./"):
            continue
        if "@" not in ref:
            errors.append(f"{name}:{index}: action has no ref")
            continue
        repo, pin = ref.rsplit("@", 1)
        if not SHA.fullmatch(pin):
            errors.append(f"{name}:{index}: {repo} is not pinned to a full commit SHA")
            continue
        if not re.search(r"#\s*v\d", line):
            errors.append(f"{name}:{index}: pinned action is missing a version comment")
    return errors


def theme_errors(config: str, pin: str) -> list[str]:
    errors: list[str] = []
    fields: dict[str, str] = {}
    for line in pin.splitlines():
        if ":" not in line or line.startswith("#"):
            continue
        key, value = line.split(":", 1)
        fields[key.strip()] = value.strip()
    repo = fields.get("repo", "")
    tag = fields.get("tag", "")
    commit = fields.get("commit", "")
    if not repo or not re.fullmatch(r"v\d+\.\d+\.\d+", tag) or not SHA.fullmatch(commit):
        errors.append("theme pin file must record repo, a vX.Y.Z tag, and a commit SHA")
        return errors
    match = THEME.search(config)
    if not match:
        errors.append("docs/_config.yml is missing remote_theme")
        return errors
    expected = f"{repo}@{tag}"
    if match.group(1) != expected:
        errors.append(f"remote_theme must be {expected}")
    return errors


def wasm_errors(names: list[str], notice: str) -> list[str]:
    errors: list[str] = []
    for name in names:
        base = Path(name).name
        if base not in notice:
            errors.append(f"vendored {name} is missing from THIRD_PARTY_NOTICES.md")
    return errors


def repo_errors(root: Path) -> list[str]:
    errors: list[str] = []
    workflows = sorted((root / ".github" / "workflows").glob("*.yml"))
    if not workflows:
        errors.append("no workflows")
    for path in workflows:
        errors.extend(workflow_errors(path.read_text(), path.name))
    lock = root / "package-lock.json"
    gem_lock = root / "docs" / "Gemfile.lock"
    if not lock.is_file():
        errors.append("package-lock.json is missing")
    if not gem_lock.is_file():
        errors.append("docs/Gemfile.lock is missing")
    dependabot = root / ".github" / "dependabot.yml"
    if not dependabot.is_file():
        errors.append(".github/dependabot.yml is missing")
    else:
        text = dependabot.read_text()
        for ecosystem in ECOSYSTEMS:
            if f"package-ecosystem: {ecosystem}" not in text:
                errors.append(f"dependabot is missing the {ecosystem} ecosystem")
        if "groups:" not in text:
            errors.append("dependabot updates are not grouped")
    security = root / "SECURITY.md"
    if not security.is_file():
        errors.append("SECURITY.md is missing")
    else:
        body = security.read_text()
        for needle in ("private vulnerability reporting", "Critical", "High"):
            if needle not in body:
                errors.append(f"SECURITY.md is missing {needle}")
    pin_path = root / ".github" / "supply-chain" / "theme-ref.txt"
    config_path = root / "docs" / "_config.yml"
    if not pin_path.is_file() or not config_path.is_file():
        errors.append("theme pin or docs config is missing")
    else:
        errors.extend(theme_errors(config_path.read_text(), pin_path.read_text()))
    tracked = subprocess.check_output(["git", "ls-files", "*.wasm"], cwd=root, text=True)
    names = [line for line in tracked.splitlines() if line.endswith(".wasm")]
    notice_path = root / "THIRD_PARTY_NOTICES.md"
    notice = notice_path.read_text() if notice_path.is_file() else ""
    errors.extend(wasm_errors(names, notice))
    for path in workflows:
        errors.extend(cache_errors(path.read_text(), str(path.relative_to(root))))
    listed = subprocess.check_output(["git", "ls-files", "-z"], cwd=root).decode().split("\0")
    sizes = {name: (root / name).stat().st_size for name in listed if name and (root / name).is_file()}
    errors.extend(tracked_output_errors(sizes))
    return errors


def size_report(root: Path) -> str:
    """Totals for the preset registry, which grows by design. Each file has its own budget in check-presets."""
    listed = subprocess.check_output(["git", "ls-files", "-z", "presets"], cwd=root).decode().split("\0")
    goldens = [name for name in listed if name.endswith(".golden.svg")]
    documents = [name for name in listed if name.endswith(".json")]
    total = lambda names: sum((root / name).stat().st_size for name in names if (root / name).is_file())
    return (
        f"presets: {len(documents)} documents {total(documents) // 1024} KiB, "
        f"{len(goldens)} goldens {total(goldens) // 1024} KiB"
    )


def self_test() -> None:
    good = """name: example
on: pull_request
permissions: {}
jobs:
  sample:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567 # v6.1.0
      - run: npm ci --ignore-scripts
"""
    errors = workflow_errors(good, "good.yml")
    if errors:
        raise SystemExit("good workflow was rejected: " + "; ".join(errors))
    bad_cases = [
        good.replace("permissions: {}", "permissions:\n  contents: read"),
        good.replace("0123456789abcdef0123456789abcdef01234567", "v6"),
        good.replace("on: pull_request", "on: pull_request_target"),
        good.replace("# v6.1.0", ""),
        good.replace("npm ci --ignore-scripts", "npm install"),
        good.replace("    permissions:\n      contents: read\n", ""),
    ]
    for case in bad_cases:
        if not workflow_errors(case, "bad.yml"):
            raise SystemExit("a bad workflow was accepted")
    pin = "repo: example/theme\ntag: v1.6.0\ncommit: 0123456789abcdef0123456789abcdef01234567\n"
    if theme_errors("remote_theme: example/theme@v1.6.0\n", pin):
        raise SystemExit("pinned theme was rejected")
    if not theme_errors("remote_theme: example/theme@main\n", pin):
        raise SystemExit("floating theme was accepted")
    if wasm_errors([], ""):
        raise SystemExit("no wasm files should pass")
    if not wasm_errors(["vendor/enc.wasm"], "nothing"):
        raise SystemExit("unnamed wasm was accepted")
    if wasm_errors(["vendor/enc.wasm"], "enc.wasm Apache-2.0"):
        raise SystemExit("named wasm was rejected")
    sha = "0123456789abcdef0123456789abcdef01234567"
    cached = f"""jobs:
  sample:
    steps:
      - name: Restore
        id: cache
        uses: actions/cache/restore@{sha} # v6.1.0
        with:
          path: ~/.npm
          key: npm-1
      - uses: actions/setup-node@{sha} # v7.1.0
        with:
          package-manager-cache: false
      - name: Save from main
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        uses: actions/cache/save@{sha} # v6.1.0
        with:
          path: ~/.npm
          key: npm-1
"""
    if cache_errors(cached, "ci.yml"):
        raise SystemExit("main-only cache save was rejected: " + "; ".join(cache_errors(cached, "ci.yml")))
    bad_caches = [
        (cached.replace("        if: github.event_name == 'push' && github.ref == 'refs/heads/main'\n", ""), "ci.yml"),
        (cached.replace("actions/cache/restore@", "actions/cache@"), "ci.yml"),
        (cached.replace("          package-manager-cache: false\n", ""), "ci.yml"),
        (cached, "release.yml"),
    ]
    for case, name in bad_caches:
        if not cache_errors(case, name):
            raise SystemExit(f"a bad cache step was accepted in {name}")
    if tracked_output_errors({"apps/studio/src/main.ts": 10, "presets/a/b.golden.svg": 100}):
        raise SystemExit("source files were rejected")
    for path in ("node_modules/x/index.js", "apps/studio/dist/studio.js", "tsconfig.tsbuildinfo", "docs/_site/index.html"):
        if not tracked_output_errors({path: 10}):
            raise SystemExit(f"tracked output {path} was accepted")
    if not tracked_output_errors({"fixtures/huge.bin": MAX_TRACKED_BYTES + 1}):
        raise SystemExit("an oversized file was accepted")
    print("supply-chain self-test ok")


def main() -> int:
    if "--self-test" in sys.argv[1:]:
        self_test()
        return 0
    root = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
    errors = repo_errors(root)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(size_report(root))
    print("supply-chain offline checks ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
