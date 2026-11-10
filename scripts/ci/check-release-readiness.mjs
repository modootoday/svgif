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

export function checkReleaseReadiness(manifest, sha, catalogBundle) {
  const errors = [];
  const { pairs } = catalogBundle;
  if (!manifest || typeof manifest !== "object") {
    return ["manifest is not an object"];
  }
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
  const rawSchema = JSON.parse(readFileSync(schemaUrl, "utf8"));
  if (rawSchema.$id !== "https://modootoday.github.io/svgif/schema/release-readiness/v1.schema.json") {
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
    console.error("usage: check-release-readiness.mjs --self-test | --sha <sha> --manifest <file>");
    process.exit(2);
  }
  const sha = args[shaFlag + 1];
  const manifest = JSON.parse(readFileSync(args[fileFlag + 1], "utf8"));
  const errors = checkReleaseReadiness(manifest, sha, loadCatalog());
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log(`release-readiness ok for ${sha}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
