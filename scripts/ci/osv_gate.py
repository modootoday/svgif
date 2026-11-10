#!/usr/bin/env python3
"""Fail closed when an osv-scanner JSON report has a high or critical advisory."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def high_ids(document: dict) -> list[str]:
    found: list[str] = []
    for result in document.get("results") or []:
        for package in result.get("packages") or []:
            for vuln in package.get("vulnerabilities") or []:
                specific = vuln.get("database_specific") or {}
                severity = str(specific.get("severity") or "").upper()
                if severity in ("HIGH", "CRITICAL"):
                    found.append(f"{severity} {vuln.get('id', 'unknown')}")
    return found


def self_test() -> None:
    clean = {"results": [{"packages": [{"vulnerabilities": [{"id": "GHSA-low", "database_specific": {"severity": "LOW"}}]}]}]}
    if high_ids(clean):
        raise SystemExit("low severity must not fail the gate")
    dirty = {"results": [{"packages": [{"vulnerabilities": [{"id": "GHSA-high", "database_specific": {"severity": "HIGH"}}]}]}]}
    if high_ids(dirty) != ["HIGH GHSA-high"]:
        raise SystemExit("high severity was not reported")
    print("osv gate self-test ok")


def main() -> int:
    if "--self-test" in sys.argv[1:]:
        self_test()
        return 0
    if len(sys.argv) != 2:
        print("usage: osv_gate.py <report.json>", file=sys.stderr)
        return 1
    document = json.loads(Path(sys.argv[1]).read_text())
    found = high_ids(document)
    if found:
        print("open high or critical advisories in lockfiles:", file=sys.stderr)
        print("\n".join(found), file=sys.stderr)
        return 1
    print("osv gate ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
