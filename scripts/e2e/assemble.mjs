#!/usr/bin/env node
// Assemble the row files into the release-readiness manifest.
// The manifest is written only when every required pair passed on the first
// attempt, every browser row ran against the deployed site, and the gates
// named on the command line are `passed`. Otherwise only the report is
// written and the exit status is 1. This script never edits a row.
//
// With `--phase stage` it writes `stage-readiness.json` instead. That file lets
// the CDN pairs be blocked, because only `mode=stage` uploads the version they
// read. Every other rule holds. [[adr:svgif/20261119231420]]
//
//   node scripts/e2e/assemble.mjs --rows evidence --sha <commit> --run-id <id> --attempt 1 \
//     --spec-check passed --ci passed --sensitive passed --milestone0 passed [--phase stage]
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { checkReleaseReadiness, checkStageReadiness, loadCatalog, stageDeferrablePairs } from "../ci/check-release-readiness.mjs";
import { parseArgs, selfTest as libSelfTest } from "./lib.mjs";

const GATES = { specCheck: "spec-check", ciConclusion: "ci", sensitiveGate: "sensitive", milestone0: "milestone0" };

export function assemble(rowsDir, options) {
  const bundle = loadCatalog();
  const stage = options.phase === "stage";
  const deferrable = new Set(stage ? stageDeferrablePairs(bundle) : []);
  const problems = [];
  const results = [];
  const deferred = [];
  const rows = [];
  for (const pair of bundle.pairs) {
    const [id, lane] = pair.split("@");
    const path = join(rowsDir, lane, `${id}.json`);
    if (!existsSync(path)) {
      problems.push(`${pair}: no row file`);
      rows.push({ id, browser: lane, status: "missing" });
      continue;
    }
    const row = JSON.parse(readFileSync(path, "utf8"));
    rows.push({ id, browser: lane, status: row.status, ...(row.reason ? { reason: row.reason } : {}) });
    if (row.id !== id || row.browser !== lane) problems.push(`${pair}: the row file names ${row.id}@${row.browser}`);
    else if (deferrable.has(pair) && row.status === "blocked") deferred.push({ id, browser: lane, status: "blocked", ...(row.reason ? { reason: row.reason } : {}) });
    else if (row.status !== "passed") problems.push(`${pair}: ${row.status}${row.reason ? ` (${row.reason})` : ""}`);
    else if (row.attempts !== 1) problems.push(`${pair}: attempts ${row.attempts}`);
    else if (lane !== "agent" && row.target !== "site") problems.push(`${pair}: passed on target ${row.target}. Only a run against the deployed site is evidence.`);
    else if (lane !== "agent" && row.siteBuild !== "match") problems.push(`${pair}: the deployed Studio is not this commit's build (${row.siteBuild})`);
    else if (lane === "agent" && row.commit !== options.sha) problems.push(`${pair}: the row is for commit ${row.commit}`);
    else results.push({ id, browser: lane, status: "passed", attempts: 1, evidence: row.evidence });
  }
  if (!/^[0-9a-f]{40}$/.test(options.sha ?? "")) problems.push("--sha is not a 40-character commit");
  if (typeof options.runId !== "string" || options.runId.length === 0) problems.push("--run-id is missing");
  if (options.attempt !== 1) problems.push(`the run attempt is ${options.attempt}. A rerun is not evidence.`);
  for (const [field, flag] of Object.entries(GATES)) {
    if (options[field] !== "passed") problems.push(`--${flag} is ${options[field] ?? "not set"}`);
  }
  const count = (status) => rows.filter((row) => row.status === status).length;
  const report = {
    schemaVersion: 1,
    ...(stage ? { phase: "stage", deferred: deferred.length } : {}),
    commit: options.sha,
    required: bundle.pairs.length,
    passed: count("passed"),
    failed: count("failed"),
    blocked: count("blocked"),
    missing: count("missing"),
    complete: problems.length === 0,
    problems,
    rows,
  };
  if (problems.length > 0) return { report, manifest: undefined };
  const manifest = {
    schemaVersion: 1,
    commit: options.sha,
    specCheck: "passed",
    ciConclusion: "passed",
    sensitiveGate: "passed",
    milestone0: "passed",
    e2eRunId: options.runId,
    e2eHeadSha: options.sha,
    retryCount: 0,
    results,
    ...(stage ? { phase: "stage", deferred } : {}),
  };
  const errors = (stage ? checkStageReadiness : checkReleaseReadiness)(manifest, options.sha, bundle);
  if (errors.length > 0) {
    report.complete = false;
    report.problems.push(...errors.map((error) => `checker: ${error}`));
    return { report, manifest: undefined };
  }
  return { report, manifest };
}

function selfTest() {
  const fail = (message) => {
    throw new Error(`assemble self-test: ${message}`);
  };
  const bundle = loadCatalog();
  const sha = "a".repeat(40);
  const gates = { specCheck: "passed", ciConclusion: "passed", sensitiveGate: "passed", milestone0: "passed" };
  const options = { sha, runId: "1", attempt: 1, ...gates };
  const build = (edit = () => {}) => {
    const dir = mkdtempSync(join(tmpdir(), "svgif-assemble-"));
    for (const pair of bundle.pairs) {
      const [id, lane] = pair.split("@");
      const row = { id, browser: lane, status: "passed", attempts: 1, evidence: `${lane}/${id}.json`, target: lane === "agent" ? "repository" : "site", siteBuild: "match", commit: sha };
      edit(row);
      if (row.drop) continue;
      mkdirSync(join(dir, lane), { recursive: true });
      writeFileSync(join(dir, lane, `${id}.json`), JSON.stringify(row));
    }
    return dir;
  };
  const expectRefused = (label, edit, override = {}) => {
    const dir = build(edit);
    try {
      const { manifest, report } = assemble(dir, { ...options, ...override });
      if (manifest !== undefined || report.complete) fail(`${label} produced a manifest`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const dir = build();
  try {
    const { manifest, report } = assemble(dir, options);
    if (!manifest || !report.complete || manifest.results.length !== bundle.pairs.length) fail("a complete set produced no manifest");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const first = (row) => row.id === "export-html" && row.browser === "chromium";
  expectRefused("a blocked row", (row) => first(row) && Object.assign(row, { status: "blocked", reason: "x" }));
  expectRefused("a failed row", (row) => first(row) && Object.assign(row, { status: "failed" }));
  expectRefused("a missing row", (row) => first(row) && Object.assign(row, { drop: true }));
  expectRefused("a second attempt", (row) => first(row) && Object.assign(row, { attempts: 2 }));
  expectRefused("a rehearsal row", (row) => first(row) && Object.assign(row, { target: "local" }));
  expectRefused("a row from a site that serves another build", (row) => first(row) && Object.assign(row, { siteBuild: "differs" }));
  expectRefused("an agent row for another commit", (row) => row.browser === "agent" && Object.assign(row, { commit: "b".repeat(40) }));
  expectRefused("a rerun", () => {}, { attempt: 2 });
  expectRefused("a failed CI gate", () => {}, { ciConclusion: "failed" });
  expectRefused("a gate that is not set", () => {}, { sensitiveGate: undefined });
  expectRefused("a short commit", () => {}, { sha: "abc" });
  // The stage phase: the CDN pairs may be blocked, and nothing else may be.
  const cdn = (row) => ["embed-cdn", "cdn-exact-version", "cdn-alias"].includes(row.id) && row.browser !== "agent";
  const blockCdn = (row) => cdn(row) && Object.assign(row, { status: "blocked", reason: "no CDN object" });
  const staged = build(blockCdn);
  try {
    const { manifest, report } = assemble(staged, { ...options, phase: "stage" });
    if (!manifest || manifest.phase !== "stage" || manifest.deferred.length !== 9 || report.deferred !== 9) fail("a stage set with the CDN pairs blocked produced no stage manifest");
    const { manifest: release } = assemble(staged, options);
    if (release !== undefined) fail("blocked CDN pairs produced a release manifest");
  } finally {
    rmSync(staged, { recursive: true, force: true });
  }
  const stageOptions = { ...options, phase: "stage" };
  expectRefused("a stage set with a blocked pair that is not a CDN pair", (row) => blockCdn(row) || (first(row) && Object.assign(row, { status: "blocked" })), stageOptions);
  expectRefused("a stage set with a failed CDN pair", (row) => cdn(row) && Object.assign(row, { status: "failed" }), stageOptions);
  expectRefused("a stage set with a missing CDN pair", (row) => cdn(row) && Object.assign(row, { drop: true }), stageOptions);
  expectRefused("a stage set from a rerun", blockCdn, { ...stageOptions, attempt: 2 });
  expectRefused("a stage set from a site that serves another build", (row) => blockCdn(row) || (first(row) && Object.assign(row, { siteBuild: "differs" })), stageOptions);
  libSelfTest();
  console.log("assemble self-test ok");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args["self-test"]) return selfTest();
  if (args.phase !== undefined && args.phase !== "stage") {
    console.error("--phase must be stage, or left out for the release manifest");
    process.exit(2);
  }
  const rowsDir = String(args.rows ?? "evidence");
  const { report, manifest } = assemble(rowsDir, {
    sha: args.sha,
    runId: typeof args["run-id"] === "string" ? args["run-id"] : undefined,
    attempt: Number(args.attempt),
    specCheck: args["spec-check"],
    ciConclusion: args.ci,
    sensitiveGate: args.sensitive,
    milestone0: args.milestone0,
    phase: args.phase === undefined ? undefined : String(args.phase),
  });
  const file = args.phase === "stage" ? "stage-readiness.json" : "release-readiness.json";
  mkdirSync(rowsDir, { recursive: true });
  writeFileSync(join(rowsDir, "e2e-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`required ${report.required}: ${report.passed} passed, ${report.failed} failed, ${report.blocked} blocked, ${report.missing} missing`);
  if (!manifest) {
    for (const problem of report.problems) console.log(`  ${problem}`);
    console.log(`${file} was not written`);
    process.exit(1);
  }
  writeFileSync(join(rowsDir, file), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${file} written${report.deferred ? `, with ${report.deferred} CDN pairs deferred to mode=stage` : ""}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
