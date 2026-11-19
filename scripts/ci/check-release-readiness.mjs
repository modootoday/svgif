#!/usr/bin/env node
// Fail closed unless a release-readiness manifest covers every required
// scenario for one commit, on the first attempt, with CI and spec check green.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const root = new URL("../../", import.meta.url);
const catalogUrl = new URL("schema/release-readiness/scenarios.v1.json", root);
const schemaUrl = new URL("schema/release-readiness/v1.schema.json", root);

export function loadCatalog(json = readFileSync(catalogUrl, "utf8")) {
  const catalog = JSON.parse(json);
  if (catalog.schemaVersion !== 1) throw new Error("catalog schemaVersion");
  if (!Array.isArray(catalog.browsers) || catalog.browsers.length === 0) {
    throw new Error("catalog browsers");
  }
  if (!Array.isArray(catalog.scenarios) || catalog.scenarios.length === 0) {
    throw new Error("catalog scenarios");
  }
  const pairs = [];
  for (const id of catalog.scenarios) {
    for (const browser of catalog.browsers) pairs.push(`${id}@${browser}`);
  }
  const agentScenarios = catalog.agentScenarios ?? [];
  if (!Array.isArray(agentScenarios)) throw new Error("catalog agentScenarios");
  for (const id of agentScenarios) pairs.push(`${id}@agent`);
  if (new Set(pairs).size !== pairs.length) throw new Error("duplicate catalog pair");
  return { catalog, pairs };
}

function fail(errors, message) {
  errors.push(message);
}

/**
 * The scenarios that read the library CDN. Before `mode=stage` uploads a version they cannot pass,
 * so `stage-readiness.json` may list their pairs as blocked. [[adr:svgif/20261119231420]]
 */
export const STAGE_DEFERRABLE_SCENARIOS = Object.freeze(["embed-cdn", "cdn-exact-version", "cdn-alias"]);

export function stageDeferrablePairs(catalogBundle) {
  return catalogBundle.pairs.filter((pair) => STAGE_DEFERRABLE_SCENARIOS.includes(pair.split("@")[0]) && !pair.endsWith("@agent"));
}

/** The gates and run fields both manifests share. */
function checkCommon(errors, manifest, sha) {
  if (manifest.schemaVersion !== 1) fail(errors, "schemaVersion");
  if (manifest.commit !== sha) fail(errors, `stale commit: manifest ${manifest.commit} != ${sha}`);
  if (manifest.e2eHeadSha !== sha) fail(errors, "stale e2eHeadSha");
  if (manifest.specCheck !== "passed") fail(errors, "spec check is not passed");
  if (manifest.ciConclusion !== "passed") fail(errors, "CI is not passed");
  if (manifest.sensitiveGate !== "passed") fail(errors, "sensitive-content gate is not passed");
  if (manifest.milestone0 !== "passed") fail(errors, "milestone 0 is not passed");
  if (manifest.retryCount !== 0) fail(errors, "e2e run was retried");
  if (typeof manifest.e2eRunId !== "string" || manifest.e2eRunId.length === 0) {
    fail(errors, "missing e2eRunId");
  }
}

/**
 * Fail closed unless a stage manifest covers every pair once: each passed on the first attempt,
 * except a CDN pair, which may be blocked until `mode=stage` uploads the version.
 */
export function checkStageReadiness(manifest, sha, catalogBundle) {
  const errors = [];
  if (!manifest || typeof manifest !== "object") return ["manifest is not an object"];
  checkCommon(errors, manifest, sha);
  if (manifest.phase !== "stage") fail(errors, "phase is not stage");
  const deferrable = new Set(stageDeferrablePairs(catalogBundle));
  const seen = new Set();
  const note = (key) => {
    if (seen.has(key)) fail(errors, `duplicate ${key}`);
    seen.add(key);
    if (!catalogBundle.pairs.includes(key)) fail(errors, `unknown ${key}`);
  };
  if (!Array.isArray(manifest.results)) fail(errors, "results is not an array");
  for (const row of Array.isArray(manifest.results) ? manifest.results : []) {
    const key = `${row?.id}@${row?.browser}`;
    note(key);
    if (row?.status !== "passed") fail(errors, `${key} status ${row?.status ?? "missing"}`);
    if (row?.attempts !== 1) fail(errors, `${key} attempts ${row?.attempts ?? "missing"}`);
    if (typeof row?.evidence !== "string" || row.evidence.length === 0) fail(errors, `${key} missing evidence`);
  }
  if (!Array.isArray(manifest.deferred)) fail(errors, "deferred is not an array");
  for (const row of Array.isArray(manifest.deferred) ? manifest.deferred : []) {
    const key = `${row?.id}@${row?.browser}`;
    note(key);
    if (!deferrable.has(key)) fail(errors, `${key} cannot wait for the stage upload`);
    if (row?.status !== "blocked") fail(errors, `${key} deferred with status ${row?.status ?? "missing"}`);
  }
  for (const key of catalogBundle.pairs) {
    if (!seen.has(key)) fail(errors, `missing ${key}`);
  }
  return errors;
}

export function checkReleaseReadiness(manifest, sha, catalogBundle) {
  const errors = [];
  const { pairs } = catalogBundle;
  if (!manifest || typeof manifest !== "object") {
    return ["manifest is not an object"];
  }
  checkCommon(errors, manifest, sha);
  // A stage manifest is never a release manifest, even when nothing was deferred.
  if ("phase" in manifest || "deferred" in manifest) fail(errors, "a stage manifest is not release evidence");
  const results = Array.isArray(manifest.results) ? manifest.results : [];
  if (!Array.isArray(manifest.results)) fail(errors, "results is not an array");
  const seen = new Map();
  for (const row of results) {
    const key = `${row?.id}@${row?.browser}`;
    if (seen.has(key)) fail(errors, `duplicate ${key}`);
    seen.set(key, row);
    if (row?.status !== "passed") fail(errors, `${key} status ${row?.status ?? "missing"}`);
    if (row?.attempts !== 1) fail(errors, `${key} attempts ${row?.attempts ?? "missing"}`);
    if (typeof row?.evidence !== "string" || row.evidence.length === 0) {
      fail(errors, `${key} missing evidence`);
    }
  }
  for (const key of pairs) {
    if (!seen.has(key)) fail(errors, `missing ${key}`);
  }
  for (const key of seen.keys()) {
    if (!pairs.includes(key)) fail(errors, `unknown ${key}`);
  }
  if (seen.size !== pairs.length) fail(errors, `coverage ${seen.size}/${pairs.length}`);
  return errors;
}

function completeManifest(sha, bundle) {
  return {
    schemaVersion: 1,
    commit: sha,
    specCheck: "passed",
    ciConclusion: "passed",
    sensitiveGate: "passed",
    milestone0: "passed",
    e2eRunId: "run-self-test",
    e2eHeadSha: sha,
    retryCount: 0,
    results: bundle.pairs.map((key) => {
      const [id, browser] = key.split("@");
      return { id, browser, status: "passed", attempts: 1, evidence: `artifacts/${key}/report.json` };
    }),
  };
}

/** A stage manifest: every CDN pair blocked, every other pair passed. */
function stageManifest(sha, bundle) {
  const deferrable = new Set(stageDeferrablePairs(bundle));
  const base = completeManifest(sha, bundle);
  return {
    ...base,
    phase: "stage",
    results: base.results.filter((row) => !deferrable.has(`${row.id}@${row.browser}`)),
    deferred: [...deferrable].map((key) => {
      const [id, browser] = key.split("@");
      return { id, browser, status: "blocked", reason: "the CDN has no object for this version" };
    }),
  };
}

function stageSelfTest(sha, bundle, good) {
  const deferrable = stageDeferrablePairs(bundle);
  if (deferrable.length !== 9) throw new Error(`stage self-test: ${deferrable.length} deferrable pairs, expected 9`);
  const stage = stageManifest(sha, bundle);
  const accepted = checkStageReadiness(stage, sha, bundle);
  if (accepted.length) {
    console.error(accepted.join("\n"));
    throw new Error("stage self-test: a stage manifest with the CDN pairs blocked was rejected");
  }
  // A CDN pair that already passed may sit in results.
  const early = structuredClone(stage);
  const moved = early.deferred.pop();
  early.results.push({ id: moved.id, browser: moved.browser, status: "passed", attempts: 1, evidence: "x.json" });
  if (checkStageReadiness(early, sha, bundle).length) throw new Error("stage self-test: a CDN pair that passed early was rejected");
  const refused = [
    ["a deferred pair that is not a CDN pair", (copy) => {
      const row = copy.results.shift();
      copy.deferred.push({ id: row.id, browser: row.browser, status: "blocked" });
    }],
    ["a CDN pair that failed", (copy) => {
      copy.deferred[0].status = "failed";
    }],
    ["a missing CDN pair", (copy) => {
      copy.deferred.pop();
    }],
    ["a missing pair", (copy) => {
      copy.results.pop();
    }],
    ["a pair listed twice", (copy) => {
      copy.results.push(structuredClone(copy.results[0]));
    }],
    ["a second attempt", (copy) => {
      copy.results[0].attempts = 2;
    }],
    ["a stale commit", (copy) => {
      copy.commit = "a".repeat(40);
    }],
    ["a rerun", (copy) => {
      copy.retryCount = 1;
    }],
    ["no phase", (copy) => {
      delete copy.phase;
    }],
  ];
  for (const [name, edit] of refused) {
    const copy = structuredClone(stage);
    edit(copy);
    if (checkStageReadiness(copy, sha, bundle).length === 0) throw new Error(`stage self-test: ${name} was accepted`);
  }
  if (checkReleaseReadiness(stage, sha, bundle).length === 0) throw new Error("stage self-test: a stage manifest passed as release evidence");
  const tagged = { ...structuredClone(good), phase: "stage", deferred: [] };
  if (checkReleaseReadiness(tagged, sha, bundle).length === 0) throw new Error("stage self-test: a complete stage manifest passed as release evidence");
}

function selfTest() {
  const bundle = loadCatalog();
  const sha = "0123456789abcdef0123456789abcdef01234567";
  const good = completeManifest(sha, bundle);
  const goodErrors = checkReleaseReadiness(good, sha, bundle);
  if (goodErrors.length) {
    console.error(goodErrors.join("\n"));
    throw new Error("complete manifest was rejected");
  }
  const cases = [
    ["missing", () => {
      const copy = structuredClone(good);
      copy.results.pop();
      return copy;
    }],
    ["skipped", () => {
      const copy = structuredClone(good);
      copy.results[0].status = "skipped";
      return copy;
    }],
    ["flaky", () => {
      const copy = structuredClone(good);
      copy.results[0].attempts = 2;
      return copy;
    }],
    ["retried-run", () => {
      const copy = structuredClone(good);
      copy.retryCount = 1;
      return copy;
    }],
    ["stale", () => {
      const copy = structuredClone(good);
      copy.commit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      return copy;
    }],
    ["spec", () => {
      const copy = structuredClone(good);
      copy.specCheck = "failed";
      return copy;
    }],
  ];
  for (const [name, build] of cases) {
    const errors = checkReleaseReadiness(build(), sha, bundle);
    if (errors.length === 0) throw new Error(`self-test ${name} was accepted`);
  }
  stageSelfTest(sha, bundle, good);
  const rawSchema = JSON.parse(readFileSync(schemaUrl, "utf8"));
  if (rawSchema.$id !== "https://thumly.io/schema/svgif/release-readiness/v1.schema.json") {
    throw new Error("release-readiness $id");
  }
  console.log(`release-readiness self-test ok (${bundle.pairs.length} scenarios)`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) {
    selfTest();
    return;
  }
  const shaFlag = args.indexOf("--sha");
  const fileFlag = args.indexOf("--manifest");
  if (shaFlag < 0 || fileFlag < 0) {
    console.error("usage: check-release-readiness.mjs --self-test | --sha <sha> --manifest <file> [--phase release|stage]");
    process.exit(2);
  }
  const sha = args[shaFlag + 1];
  const manifest = JSON.parse(readFileSync(args[fileFlag + 1], "utf8"));
  const phaseFlag = args.indexOf("--phase");
  const phase = phaseFlag < 0 ? "release" : args[phaseFlag + 1];
  if (phase !== "release" && phase !== "stage") {
    console.error("--phase must be release or stage");
    process.exit(2);
  }
  const check = phase === "stage" ? checkStageReadiness : checkReleaseReadiness;
  const errors = check(manifest, sha, loadCatalog());
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log(`${phase === "stage" ? "stage" : "release"}-readiness ok for ${sha}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
