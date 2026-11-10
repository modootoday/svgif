#!/usr/bin/env bash
# The remote theme tag must still point at the commit recorded in the pin file.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
pin="$root/.github/supply-chain/theme-ref.txt"
repo="$(awk -F': ' '/^repo:/{print $2}' "$pin")"
tag="$(awk -F': ' '/^tag:/{print $2}' "$pin")"
want="$(awk -F': ' '/^commit:/{print $2}' "$pin")"
token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [[ -z "$token" ]]; then
  echo "theme ref check needs GH_TOKEN" >&2
  exit 1
fi
export GH_TOKEN="$token"
json="$(gh api "repos/${repo}/git/ref/tags/${tag}")"
read -r kind sha < <(python3 -c 'import json,sys; o=json.loads(sys.argv[1])["object"]; print(o["type"], o["sha"])' "$json")
if [[ "$kind" == "tag" ]]; then
  sha="$(gh api "repos/${repo}/git/tags/${sha}" --jq .object.sha)"
fi
if [[ "$sha" != "$want" ]]; then
  echo "remote theme ${repo}@${tag} is ${sha}; pin file says ${want}" >&2
  exit 1
fi
echo "remote theme ${tag} is ${sha}"
