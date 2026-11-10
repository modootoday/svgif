#!/usr/bin/env python3
"""Public-surface scan. Do not print matched secrets, deny terms, or addresses."""
from __future__ import annotations

import os
import re
import subprocess
import sys

EMAIL = re.compile(r"(?i)(?<![\w.+-])[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}(?![\w.+-])")
NOREPLY = re.compile(r"(?i)@(users\.)?noreply\.github\.com\Z")
ALLOWED_EMAIL_DOMAINS = ("example.com", "example.invalid", "localhost")
COAUTHOR = re.compile(r"(?im)^co-authored-by:.*$")
SKIP_PREFIXES = (
    "scripts/ci/deny-patterns.txt",
    "scripts/ci/public_surface.py",
    "scripts/ci/public-surface.sh",
)


def git_files() -> list[str]:
    out = subprocess.check_output(["git", "ls-files", "-z"])
    return [p.decode() for p in out.split(b"\0") if p]


def load_patterns() -> list[re.Pattern[str]]:
    patterns: list[re.Pattern[str]] = []
    with open("scripts/ci/deny-patterns.txt", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            patterns.append(re.compile(line))
    extra = os.environ.get("SVGIF_DENY_TERMS", "")
    for line in extra.splitlines():
        term = line.strip()
        if term:
            patterns.append(re.compile(re.escape(term)))
    return patterns


def require_secret() -> list[str]:
    if os.environ.get("SVGIF_REQUIRE_DENY_TERMS") != "true":
        return []
    if not os.environ.get("SVGIF_DENY_TERMS", "").strip():
        return ["SVGIF_DENY_TERMS is not set"]
    return []


def scan_text(label: str, text: str, patterns: list[re.Pattern[str]], *, emails: bool) -> list[str]:
    errors: list[str] = []
    for pattern in patterns:
        if pattern.search(text):
            errors.append(f"{label} matched a denied pattern")
            break
    if not emails:
        return errors
    for line in COAUTHOR.findall(text):
        found = EMAIL.findall(line)
        if not found or any(not NOREPLY.search(addr) for addr in found):
            errors.append(f"{label} has a Co-authored-by trailer without a noreply address")
            break
    for addr in EMAIL.findall(text):
        domain = addr.rsplit("@", 1)[-1].lower()
        if NOREPLY.search(addr) or domain in ALLOWED_EMAIL_DOMAINS:
            continue
        errors.append(f"{label} contains a non-noreply email address")
        break
    return errors


def scan_files(patterns: list[re.Pattern[str]]) -> list[str]:
    errors: list[str] = []
    for path in git_files():
        if path in SKIP_PREFIXES or path.startswith(tuple(p + "/" for p in SKIP_PREFIXES)):
            continue
        base = os.path.basename(path)
        if base == ".env" or (base.startswith(".env.") and base != ".env.example"):
            errors.append(f"tracked env file: {path}")
            continue
        try:
            with open(path, encoding="utf-8") as handle:
                text = handle.read()
        except (UnicodeDecodeError, IsADirectoryError):
            continue
        errors.extend(scan_text(path, text, patterns, emails=False))
    return errors


def landing_mode() -> str:
    """push: every commit in the range landed. squash: only the PR title and body land."""
    mode = os.environ.get("SVGIF_LANDING", "push").strip() or "push"
    if mode in ("push", "squash"):
        return mode
    return "unknown"


def actions_mask_line(term: str) -> str:
    escaped = term.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    return f"::add-mask::{escaped}"


def scan_commits(patterns: list[re.Pattern[str]]) -> list[str]:
    mode = landing_mode()
    if mode == "squash":
        return []
    if mode == "unknown":
        return ["SVGIF_LANDING is not push or squash"]
    base = os.environ.get("SVGIF_COMMIT_RANGE", "").strip()
    if not base:
        return []
    if set(base) <= {"0"}:
        revision = ["HEAD"]
    else:
        revision = [f"{base}..HEAD"]
    log = subprocess.check_output(["git", "log", "--format=%H%x1e%B%x1e", *revision], text=True, errors="replace")
    errors: list[str] = []
    parts = log.split("\x1e")
    index = 0
    while index + 1 < len(parts):
        sha = parts[index].strip()
        message = parts[index + 1]
        index += 2
        if len(sha) != 40:
            errors.append("commit log could not be parsed")
            continue
        errors.extend(scan_text(f"commit {sha[:12]}", message, patterns, emails=True))
    return errors


def landed_pull_request_body(text: str) -> str:
    """The squash message is the description, not the generated link footer after it."""
    end = "<!-- CURSOR_AGENT_PR_BODY_END -->"
    if end in text:
        text = text.split(end, 1)[0]
    begin = "<!-- CURSOR_AGENT_PR_BODY_BEGIN -->"
    if begin in text:
        text = text.split(begin, 1)[1]
    return text


def scan_pr(patterns: list[re.Pattern[str]]) -> list[str]:
    errors: list[str] = []
    title = os.environ.get("SVGIF_PR_TITLE")
    body = os.environ.get("SVGIF_PR_BODY")
    if landing_mode() == "squash" and (title is None or body is None):
        return ["squash landing has no pull request title and body to scan"]
    if title is not None:
        errors.extend(scan_text("pull request title", title, patterns, emails=True))
    if body is not None:
        errors.extend(scan_text("pull request body", landed_pull_request_body(body), patterns, emails=True))
    return errors


def self_test() -> None:
    patterns = [re.compile(r"AKIA[0-9A-Z]{16}")]
    bad = "Co-authored-by: Example <person@invalid.test>\n"
    if not scan_text("sample", bad, patterns, emails=True):
        raise SystemExit("self-test accepted a non-noreply trailer")
    good = "Co-authored-by: Actions <41898282+bot@users.noreply.github.com>\nSee user@example.com\n"
    if scan_text("sample", good, patterns, emails=True):
        raise SystemExit("self-test rejected a noreply trailer")
    if not scan_text("sample", "reach me at person@invalid.test", patterns, emails=True):
        raise SystemExit("self-test accepted a personal email")
    if not scan_text("sample", "key AKIAIOSFODNN7EXAMPLE", patterns, emails=False):
        raise SystemExit("self-test missed AKIA")
    if actions_mask_line("a%b") != "::add-mask::a%25b":
        raise SystemExit("self-test mask escape")
    previous = os.environ.get("SVGIF_LANDING")
    os.environ["SVGIF_LANDING"] = "squash"
    os.environ["SVGIF_COMMIT_RANGE"] = "deadbeef"
    try:
        if scan_commits(patterns):
            raise SystemExit("self-test scanned commits that a squash will not land")
        os.environ.pop("SVGIF_PR_TITLE", None)
        os.environ.pop("SVGIF_PR_BODY", None)
        if not scan_pr(patterns):
            raise SystemExit("self-test accepted a squash with no pull request text")
        os.environ["SVGIF_PR_TITLE"] = bad
        os.environ["SVGIF_PR_BODY"] = ""
        if not scan_pr(patterns):
            raise SystemExit("self-test accepted a bad squash message")
        os.environ["SVGIF_PR_TITLE"] = "Clean title"
        os.environ["SVGIF_PR_BODY"] = (
            "<!-- CURSOR_AGENT_PR_BODY_BEGIN -->\nClean description.\n"
            "<!-- CURSOR_AGENT_PR_BODY_END -->\n"
            "Co-authored-by: Example <person@invalid.test>\n"
        )
        if scan_pr(patterns):
            raise SystemExit("self-test scanned the generated footer as the squash message")
        os.environ["SVGIF_LANDING"] = "merge"
        if not scan_commits(patterns):
            raise SystemExit("self-test accepted an unknown landing mode")
    finally:
        if previous is None:
            os.environ.pop("SVGIF_LANDING", None)
        else:
            os.environ["SVGIF_LANDING"] = previous
        os.environ.pop("SVGIF_COMMIT_RANGE", None)
        os.environ.pop("SVGIF_PR_TITLE", None)
        os.environ.pop("SVGIF_PR_BODY", None)


def main() -> int:
    if "--mask" in sys.argv:
        for line in os.environ.get("SVGIF_DENY_TERMS", "").splitlines():
            term = line.strip()
            if term:
                print(actions_mask_line(term), flush=True)
        return 0
    if "--self-test" in sys.argv:
        self_test()
        print("public-surface self-test ok")
        return 0
    errors = require_secret()
    patterns = load_patterns()
    errors.extend(scan_files(patterns))
    errors.extend(scan_commits(patterns))
    errors.extend(scan_pr(patterns))
    if not os.environ.get("SVGIF_DENY_TERMS", "").strip() and os.environ.get("SVGIF_REQUIRE_DENY_TERMS") != "true":
        print("SVGIF_DENY_TERMS is not set; extra terms were not scanned", file=sys.stderr)
    if errors:
        print("\n".join(dict.fromkeys(errors)), file=sys.stderr)
        return 1
    print("public surface ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
