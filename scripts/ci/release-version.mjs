#!/usr/bin/env node
// Version calculation for the release workflow.
// docs, chore, ci, test, refactor, and style never bump.
// A range with no feat/fix/perf/breaking commit returns none and must not be tagged.
import { pathToFileURL } from "node:url";

const NON_RELEASING = new Set(["docs", "chore", "ci", "test", "refactor", "style"]);

export function classifySubject(subject) {
  const match = /^(?<type>[a-z]+)(?:\([^)]*\))?(?<breaking>!)?: /.exec(subject.trim());
  if (!match) return { releasing: false, breaking: false, type: null };
  const type = match.groups.type;
  const breaking = Boolean(match.groups.breaking) || subject.includes("BREAKING CHANGE");
  if (NON_RELEASING.has(type)) return { releasing: false, breaking: false, type };
  if (type === "feat" || type === "fix" || type === "perf" || breaking) {
    return { releasing: true, breaking, type };
  }
  return { releasing: false, breaking: false, type };
}

export function planVersion(subjects, { hasPriorRelease, current = "0.1.0" } = {}) {
  let breaking = false;
  let feat = false;
  let fix = false;
  for (const subject of subjects) {
    const row = classifySubject(subject);
    if (!row.releasing) continue;
    if (row.breaking) breaking = true;
    else if (row.type === "feat") feat = true;
    else fix = true;
  }
  if (!hasPriorRelease) {
    if (!(breaking || feat || fix)) return { tag: null, reason: "no-releasable-commits" };
    return { tag: "v0.1.0", reason: "first-product-release" };
  }
  if (breaking || feat || fix) {
    const [major, minor, patch] = current.replace(/^v/, "").split(".").map(Number);
    if (breaking) return { tag: `v${major + 1}.0.0`, reason: "breaking" };
    if (feat) return { tag: `v${major}.${minor + 1}.0`, reason: "feat" };
    return { tag: `v${major}.${minor}.${patch + 1}`, reason: "fix" };
  }
  return { tag: null, reason: "trivial-commits-only" };
}

function selfTest() {
  const trivial = ["docs: rewrite the guide", "chore: tidy", "ci: add a job", "test: add a case", "refactor: rename", "style: format"];
  const none = planVersion(trivial, { hasPriorRelease: true, current: "0.1.0" });
  if (none.tag !== null) throw new Error("trivial range produced a tag");
  const first = planVersion(["feat: freeze schema"], { hasPriorRelease: false });
  if (first.tag !== "v0.1.0") throw new Error(`first tag ${first.tag}`);
  const feat = planVersion(["feat: add a camera", "docs: mention it"], { hasPriorRelease: true, current: "0.1.0" });
  if (feat.tag !== "v0.2.0") throw new Error(`feat tag ${feat.tag}`);
  const fix = planVersion(["fix: clamp the frame"], { hasPriorRelease: true, current: "0.2.0" });
  if (fix.tag !== "v0.2.1") throw new Error(`fix tag ${fix.tag}`);
  const styleOnly = planVersion(["style: whitespace"], { hasPriorRelease: false });
  if (styleOnly.tag !== null) throw new Error("style cut a first release");
  console.log("release-version self-test ok");
}

function readFlag(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) {
    selfTest();
  } else if (args.includes("--subjects")) {
    const { readFileSync } = await import("node:fs");
    const subjects = readFileSync(readFlag(args, "--subjects"), "utf8").split("\n").filter(Boolean);
    const planned = planVersion(subjects, {
      hasPriorRelease: readFlag(args, "--has-prior") === "1",
      current: readFlag(args, "--current") || "0.1.0",
    });
    if (!planned.tag) {
      console.error(planned.reason);
      process.exit(1);
    }
    console.log(planned.tag);
  } else {
    console.error("usage: release-version.mjs --self-test | --subjects <file> --has-prior 0|1 [--current x.y.z]");
    process.exit(2);
  }
}
