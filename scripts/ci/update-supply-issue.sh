#!/usr/bin/env bash
# Open or update one tracking issue for a scheduled supply-chain scan.
set -euo pipefail
title="Supply-chain findings"
body_file="$(mktemp)"
{
  echo "Scheduled supply-chain scan."
  echo
  echo "Run: ${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
  echo
  echo "Jobs: dependencies=${DEP_RESULT:-unknown} actions=${ACT_RESULT:-unknown} codeql=${QL_RESULT:-unknown} scorecard=${SC_RESULT:-unknown}"
  if [[ -n "${SCORECARD_SCORE:-}" ]]; then
    echo "OpenSSF Scorecard score: ${SCORECARD_SCORE}"
  fi
  echo
  if [[ -n "${ADVISORY_TEXT:-}" ]]; then
    echo "Dependabot alerts:"
    printf '%s\n' "$ADVISORY_TEXT"
  else
    echo "Dependabot alerts: see the job result. This issue does not copy secret values."
  fi
} >"$body_file"

number="$(gh issue list --repo "$GITHUB_REPOSITORY" --state open --search "in:title ${title}" --json number --jq '.[0].number')"
if [[ -z "$number" || "$number" == "null" ]]; then
  gh issue create --repo "$GITHUB_REPOSITORY" --title "$title" --body-file "$body_file"
else
  gh issue edit "$number" --repo "$GITHUB_REPOSITORY" --body-file "$body_file"
fi
