#!/usr/bin/env bash
# Pre-deploy half of the M8 Studio check on the Pages artifact.
# When apps/studio is absent, M8 is not active and this script exits 0.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
if [[ ! -d "$root/apps/studio" ]]; then
  echo "M8 is not active: apps/studio is absent"
  exit 0
fi

site="${1:-$root/docs/_site}"
case "$site" in
  /*) ;;
  *) site="$PWD/$site" ;;
esac
studio="$site/svgif/studio"
if [[ ! -d "$studio" ]]; then
  echo "apps/studio exists but $studio is missing" >&2
  exit 1
fi
if ! grep -R -F -q -- 'data-svgif-studio="app"' "$studio"; then
  echo "missing data-svgif-studio=\"app\" under $studio" >&2
  exit 1
fi
echo "studio pages marker present under $studio"
