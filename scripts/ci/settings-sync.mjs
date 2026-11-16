#!/usr/bin/env node
// Repository settings as files. [[sot:svgif/automation-rules]]
//
//   --drift            Compare the live rulesets and labels with the files. Changes no setting.
//                      Opens or updates the `Settings drift` issue, or closes it when nothing differs.
//                      Runs in Actions with GITHUB_TOKEN. Exits 0 on drift and non-zero on an error.
//   --apply            Print what applying the files would change. Add --write to apply it.
//                      Needs an admin `gh` login, so it runs on the owner's computer only.
//   --self-test        Check the comparison without the network.
//   --repo owner/name  Defaults to GITHUB_REPOSITORY, then to the checkout's `gh repo view`.
//
// Applying never deletes a ruleset or a label that has no file, and never reads or writes a secret.
// Only the keys present in a file are compared or written.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "../..");
const ISSUE_TITLE = "Settings drift";

export function loadFiles(base = root) {
  const dir = join(base, ".github/rulesets");
  const rulesets = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({ file: `.github/rulesets/${name}`, body: JSON.parse(readFileSync(join(dir, name), "utf8")) }));
  for (const { file, body } of rulesets) {
    if (typeof body.name !== "string" || body.name.length === 0) throw new Error(`${file} has no name`);
  }
  const labels = JSON.parse(readFileSync(join(base, ".github/labels.json"), "utf8"));
  for (const label of labels) {
    if (typeof label.name !== "string" || !/^[0-9a-f]{6}$/i.test(label.color ?? "")) {
      throw new Error(".github/labels.json needs a name and a six-digit hex color on every label");
    }
  }
  const repository = JSON.parse(readFileSync(join(base, ".github/settings/repository.json"), "utf8"));
  return { rulesets, labels, repository };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function keyOf(item) {
  if (!isObject(item)) return null;
  for (const key of ["type", "context", "name"]) {
    if (typeof item[key] === "string") return `${key}=${item[key]}`;
  }
  return null;
}

/**
 * Differences where `live` does not hold what `expected` states. Keys the file leaves out are not compared.
 * A keyed list (rules by `type`, checks by `context`) is replaced as a whole when a file is applied,
 * so an entry that only the live list has is reported too: applying would remove it.
 */
export function subsetDiff(expected, live, path = "") {
  if (Array.isArray(expected)) {
    if (!Array.isArray(live)) return [`${path} is not a list`];
    const keyed = expected.every((item) => keyOf(item) !== null);
    if (!keyed) {
      const want = expected.map((item) => JSON.stringify(item)).sort();
      const have = live.map((item) => JSON.stringify(item)).sort();
      return JSON.stringify(want) === JSON.stringify(have) ? [] : [`${path} is ${JSON.stringify(live)}, the file says ${JSON.stringify(expected)}`];
    }
    const out = [];
    for (const item of expected) {
      const key = keyOf(item);
      const match = live.find((candidate) => keyOf(candidate) === key);
      if (!match) out.push(`${path} has no entry ${key}`);
      else out.push(...subsetDiff(item, match, `${path}[${key}]`));
    }
    const stated = new Set(expected.map(keyOf));
    for (const candidate of live) {
      const key = keyOf(candidate);
      if (key !== null && !stated.has(key)) out.push(`${path} has entry ${key} that the file does not; applying would remove it`);
    }
    return out;
  }
  if (isObject(expected)) {
    if (!isObject(live)) return [`${path || "value"} is missing`];
    const out = [];
    for (const [key, value] of Object.entries(expected)) {
      const next = path ? `${path}.${key}` : key;
      if (!(key in live)) out.push(`${next} is missing`);
      else out.push(...subsetDiff(value, live[key], next));
    }
    return out;
  }
  const same = typeof expected === "string" && typeof live === "string" && /color$/.test(path)
    ? expected.toLowerCase() === live.toLowerCase()
    : expected === live;
  return same ? [] : [`${path} is ${JSON.stringify(live)}, the file says ${JSON.stringify(expected)}`];
}

/** Live state through an injected reader, so the self-test needs no network. */
export function compare(files, live) {
  const findings = [];
  for (const { file, body } of files.rulesets) {
    const current = live.rulesets.find((item) => item.name === body.name);
    if (!current) {
      findings.push({ kind: "ruleset", file, name: body.name, change: "create", diff: [`ruleset ${body.name} does not exist`] });
      continue;
    }
    const diff = subsetDiff(body, live.ruleset(current.id));
    if (diff.length > 0) findings.push({ kind: "ruleset", file, name: body.name, id: current.id, change: "update", diff });
  }
  for (const label of files.labels) {
    const current = live.labels.find((item) => item.name.toLowerCase() === label.name.toLowerCase());
    if (!current) {
      findings.push({ kind: "label", name: label.name, change: "create", diff: [`label ${label.name} does not exist`] });
      continue;
    }
    const diff = subsetDiff(label, current, `label ${label.name}`);
    if (diff.length > 0) findings.push({ kind: "label", name: label.name, change: "update", diff });
  }
  return findings;
}

function gh(args, input) {
  return execFileSync("gh", args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "inherit"] });
}

function ghJson(args) {
  return JSON.parse(gh(["api", "-H", "Accept: application/vnd.github+json", ...args]));
}

function repoName(argv) {
  const index = argv.indexOf("--repo");
  if (index >= 0 && argv[index + 1]) return argv[index + 1];
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  return gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]).trim();
}

function liveState(repo) {
  const rulesets = ghJson([`repos/${repo}/rulesets?per_page=100&includes_parents=false`]);
  const labels = ghJson([`repos/${repo}/labels?per_page=100`]);
  const cache = new Map();
  return {
    rulesets,
    labels,
    ruleset(id) {
      if (!cache.has(id)) cache.set(id, ghJson([`repos/${repo}/rulesets/${id}`]));
      return cache.get(id);
    },
  };
}

function report(findings) {
  if (findings.length === 0) return "The live rulesets and labels match the files.";
  const lines = [];
  for (const finding of findings) {
    lines.push(`- ${finding.kind} \`${finding.name}\` (${finding.change})`);
    for (const line of finding.diff) lines.push(`  - ${line}`);
  }
  return lines.join("\n");
}

function drift(repo) {
  const findings = compare(loadFiles(), liveState(repo));
  const text = report(findings);
  console.log(text);
  const open = JSON.parse(
    gh(["issue", "list", "--repo", repo, "--state", "open", "--search", `in:title "${ISSUE_TITLE}"`, "--json", "number,title"]),
  ).filter((issue) => issue.title === ISSUE_TITLE);
  const run = process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : "a local run";
  if (findings.length === 0) {
    for (const issue of open) {
      gh(["issue", "close", String(issue.number), "--repo", repo, "--comment", `The live settings match the files again. Checked by ${run}.`]);
    }
    return;
  }
  const body = [
    "The live repository settings differ from the files under `.github/`. Nothing was changed.",
    "",
    "An owner applies the files from a computer where `gh` is signed in as an admin:",
    "",
    "```bash",
    "node scripts/ci/settings-sync.mjs --apply --write",
    "```",
    "",
    text,
    "",
    `Checked by ${run}. This issue closes itself when a later check finds no difference.`,
  ].join("\n");
  if (open.length > 0) {
    gh(["issue", "edit", String(open[0].number), "--repo", repo, "--body-file", "-"], body);
    return;
  }
  try {
    gh(["issue", "create", "--repo", repo, "--title", ISSUE_TITLE, "--label", "needs-owner", "--body-file", "-"], body);
  } catch {
    // The label may not exist yet; the label list is one of the files this issue asks to apply.
    gh(["issue", "create", "--repo", repo, "--title", ISSUE_TITLE, "--body-file", "-"], body);
  }
}

function apply(repo, write) {
  const files = loadFiles();
  const findings = compare(files, liveState(repo));
  console.log(report(findings));
  console.log(`- repository settings: ${JSON.stringify(files.repository)} (applied as written; not compared)`);
  if (!write) {
    console.log("Preview only. Rerun with --write to apply.");
    return;
  }
  for (const finding of findings) {
    if (finding.kind === "ruleset") {
      const { body } = files.rulesets.find((item) => item.file === finding.file);
      const path = finding.change === "create" ? `repos/${repo}/rulesets` : `repos/${repo}/rulesets/${finding.id}`;
      gh(["api", "-X", finding.change === "create" ? "POST" : "PUT", path, "--input", "-"], JSON.stringify(body));
    } else {
      const label = files.labels.find((item) => item.name === finding.name);
      const path = finding.change === "create" ? `repos/${repo}/labels` : `repos/${repo}/labels/${encodeURIComponent(label.name)}`;
      gh(["api", "-X", finding.change === "create" ? "POST" : "PATCH", path, "--input", "-"], JSON.stringify(label));
    }
    console.log(`applied ${finding.kind} ${finding.name}`);
  }
  gh(["api", "-X", "PATCH", `repos/${repo}`, "--input", "-"], JSON.stringify(files.repository));
  console.log("applied repository settings");
}

function selfTest() {
  const files = loadFiles();
  if (!files.rulesets.some(({ body }) => body.name === "main-protected")) throw new Error("no main-protected ruleset file");
  if (!files.rulesets.some(({ body }) => body.target === "tag")) throw new Error("no tag ruleset file");
  for (const name of ["bug", "needs-owner", "needs-human", "dependencies"]) {
    if (!files.labels.some((label) => label.name === name)) throw new Error(`label ${name} is not in .github/labels.json`);
  }
  const main = files.rulesets.find(({ body }) => body.name === "main-protected").body;
  const liveMain = structuredClone(main);
  liveMain.id = 7;
  liveMain.bypass_actors = [];
  for (const rule of liveMain.rules) {
    if (rule.type === "required_status_checks") {
      rule.parameters.required_status_checks = rule.parameters.required_status_checks
        .map((check) => ({ ...check, integration_id: 15368 }))
        .reverse();
    }
  }
  const labels = files.labels.map((label) => ({ ...label, color: label.color.toUpperCase(), id: 1, default: false }));
  const tags = files.rulesets.find(({ body }) => body.target === "tag").body;
  const live = (main, extra = {}) => ({
    rulesets: [{ id: 7, name: "main-protected" }, { id: 8, name: tags.name }, { id: 9, name: "not-in-a-file" }],
    labels: [...labels, { name: "wontfix", color: "ffffff" }],
    ruleset: (id) => (id === 7 ? main : { ...tags, id }),
    ...extra,
  });
  const clean = compare(files, live(liveMain));
  if (clean.length !== 0) throw new Error(`a matching live state reported drift: ${JSON.stringify(clean)}`);
  const renamed = structuredClone(liveMain);
  for (const rule of renamed.rules) {
    if (rule.type === "required_status_checks") {
      rule.parameters.required_status_checks = rule.parameters.required_status_checks.map((check) =>
        check.context === "Secret scan" ? { ...check, context: "Gitleaks" } : check,
      );
    }
  }
  const stale = compare(files, live(renamed));
  if (stale.length !== 1 || !stale[0].diff.some((line) => line.includes("context=Secret scan"))) {
    throw new Error("an unapplied check rename was not reported");
  }
  const loose = structuredClone(liveMain);
  loose.enforcement = "evaluate";
  if (compare(files, live(loose)).length !== 1) throw new Error("an evaluate-only ruleset was not reported");
  const merge = structuredClone(liveMain);
  for (const rule of merge.rules) {
    if (rule.type === "pull_request") rule.parameters.allowed_merge_methods = ["merge", "squash"];
  }
  if (compare(files, live(merge)).length !== 1) throw new Error("an extra merge method was not reported");
  const extra = structuredClone(liveMain);
  for (const rule of extra.rules) {
    if (rule.type === "required_status_checks") rule.parameters.required_status_checks.push({ context: "Live only", integration_id: 1 });
  }
  const removal = compare(files, live(extra));
  if (removal.length !== 1 || !removal[0].diff.some((line) => line.includes("context=Live only") && line.includes("would remove"))) {
    throw new Error("a required check that applying would remove was not reported");
  }
  const extraRule = structuredClone(liveMain);
  extraRule.rules.push({ type: "required_signatures" });
  if (!compare(files, live(extraRule)).some((item) => item.diff.some((line) => line.includes("type=required_signatures")))) {
    throw new Error("a live rule that applying would remove was not reported");
  }
  const missing = compare(files, live(liveMain, { rulesets: [{ id: 8, name: tags.name }], labels: labels.slice(1) }));
  if (!missing.some((item) => item.kind === "ruleset" && item.change === "create")) throw new Error("a missing ruleset was not reported");
  if (!missing.some((item) => item.kind === "label" && item.change === "create")) throw new Error("a missing label was not reported");
  const recolored = compare(files, live(liveMain, { labels: labels.map((label, index) => (index === 0 ? { ...label, color: "000000" } : label)) }));
  if (recolored.length !== 1 || recolored[0].change !== "update") throw new Error("a recolored label was not reported");
  if (subsetDiff({ a: [1, 2] }, { a: [2, 1] }).length !== 0) throw new Error("plain lists compare in order");
  if (subsetDiff({ a: { b: 1 } }, { a: {} }).length !== 1) throw new Error("a missing key was not reported");
  console.log("settings-sync self-test ok");
}

const argv = process.argv.slice(2);
if (argv.includes("--self-test")) selfTest();
else if (argv.includes("--drift")) drift(repoName(argv));
else if (argv.includes("--apply")) apply(repoName(argv), argv.includes("--write"));
else {
  console.error("usage: settings-sync.mjs --drift | --apply [--write] | --self-test [--repo owner/name]");
  process.exit(2);
}
