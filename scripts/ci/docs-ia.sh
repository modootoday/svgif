#!/usr/bin/env bash
# Landing CTA and top-nav follow P0 home, P1 Studio, P2 guide, P3 developers.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
nav="$root/docs/_data/nav/main.yml"
index="$root/docs/index.md"
python3 - "$nav" "$index" <<'PY'
import sys
from pathlib import Path
nav = Path(sys.argv[1]).read_text().splitlines()
urls = [line.split("url:", 1)[1].strip() for line in nav if "url:" in line]
expect = ["/studio/", "/guide/", "/developers/"]
if urls[:3] != expect:
    raise SystemExit(f"nav order {urls[:3]} != {expect}")
text = Path(sys.argv[2]).read_text()
link = text.split("](", 1)[1].split(")", 1)[0]
if not link.startswith("studio"):
    raise SystemExit(f"primary CTA {link} is not Studio")
print("docs ia ok")
PY
