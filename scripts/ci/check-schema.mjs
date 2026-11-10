#!/usr/bin/env node
// Milestone 0 registry gate. Valid fixtures pass, invalid fixtures fail,
// v1 migrates to itself, and a newer schemaVersion is schema-too-new.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("../../", import.meta.url);
const rootPath = fileURLToPath(root);

const CONTRACTS = [
  ["project", "schema/project/v1.schema.json", "https://thumly.io/svgif/schema/project/v1.schema.json"],
  ["ir", "schema/ir/v1.schema.json", "https://thumly.io/svgif/schema/ir/v1.schema.json"],
  ["exporter-job", "schema/exporter-job/v1.schema.json", "https://thumly.io/svgif/schema/exporter-job/v1.schema.json"],
  ["backend-result", "schema/backend-result/v1.schema.json", "https://thumly.io/svgif/schema/backend-result/v1.schema.json"],
];

const DRAFT = "https://json-schema.org/draft/2020-12/schema";

function fileURLToPath(url) {
  return decodeURIComponent(url.pathname);
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, root), "utf8"));
}

function readBytes(relativePath) {
  return readFileSync(new URL(relativePath, root));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function deepEqual(left, right) {
  if (left === right) return true;
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) {
    return false;
  }
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) {
    return left.length === right.length && left.every((item, index) => deepEqual(item, right[index]));
  }
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => Object.hasOwn(right, key) && deepEqual(left[key], right[key]));
}

function jsonType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function typeMatches(expected, value) {
  const actual = jsonType(value);
  if (expected === "number") return actual === "number" || actual === "integer";
  if (expected === "integer") return actual === "integer";
  return actual === expected;
}

function pointer(rootDocument, ref) {
  const body = ref.startsWith("#") ? ref.slice(1) : ref;
  if (body === "" || body === "/") return rootDocument;
  const parts = body.split("/").filter((part, index) => !(index === 0 && part === ""));
  let node = rootDocument;
  for (const part of parts) {
    const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
    if (node === null || typeof node !== "object" || !Object.hasOwn(node, key)) {
      throw new Error(`unresolved schema pointer ${ref}`);
    }
    node = node[key];
  }
  return node;
}

function resolveRef(ref, baseDocument, byId) {
  if (ref.startsWith("#")) return { schema: pointer(baseDocument, ref), base: baseDocument };
  const hash = ref.indexOf("#");
  const id = hash === -1 ? ref : ref.slice(0, hash);
  const target = byId.get(id);
  if (!target) throw new Error(`unresolved schema $id ${id}`);
  if (hash === -1) return { schema: target, base: target };
  return { schema: pointer(target, ref.slice(hash)), base: target };
}

function validate(schema, value, baseDocument, byId, path, depth = 0) {
  if (depth > 32) return [`${path} schema nested too deeply`];
  if (!schema || typeof schema !== "object") return [`${path} schema is not an object`];
  const errors = [];
  let current = schema;
  let currentBase = baseDocument;
  if (typeof schema.$ref === "string") {
    const resolved = resolveRef(schema.$ref, baseDocument, byId);
    current = resolved.schema;
    currentBase = resolved.base;
    errors.push(...validate(current, value, currentBase, byId, path, depth + 1));
    return errors;
  }
  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) errors.push(...validate(sub, value, currentBase, byId, path, depth + 1));
  }
  if (Array.isArray(schema.anyOf)) {
    const matched = schema.anyOf.some((sub) => validate(sub, value, currentBase, byId, path, depth + 1).length === 0);
    if (!matched) errors.push(`${path} did not match any allowed shape`);
  }
  if (schema.not) {
    if (validate(schema.not, value, currentBase, byId, path, depth + 1).length === 0) {
      errors.push(`${path} is not allowed`);
    }
  }
  if (schema.if) {
    const condition = validate(schema.if, value, currentBase, byId, path, depth + 1).length === 0;
    if (condition && schema.then) errors.push(...validate(schema.then, value, currentBase, byId, path, depth + 1));
    if (!condition && schema.else) errors.push(...validate(schema.else, value, currentBase, byId, path, depth + 1));
  }
  if (Object.hasOwn(schema, "const") && !deepEqual(value, schema.const)) errors.push(`${path} must be ${JSON.stringify(schema.const)}`);
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => deepEqual(value, item))) {
    errors.push(`${path} is not an allowed value`);
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeMatches(type, value))) errors.push(`${path} has the wrong type`);
  }
  const objectLike = value !== null && typeof value === "object" && !Array.isArray(value);
  if (objectLike && Array.isArray(schema.required)) {
    for (const key of schema.required) {
      if (!Object.hasOwn(value, key)) errors.push(`${path}.${key} is required`);
    }
  }
  if (objectLike && schema.properties) {
    for (const [key, sub] of Object.entries(schema.properties)) {
      if (Object.hasOwn(value, key)) errors.push(...validate(sub, value[key], currentBase, byId, `${path}.${key}`, depth + 1));
    }
  }
  if (objectLike && schema.additionalProperties === false) {
    const known = new Set(Object.keys(schema.properties ?? {}));
    for (const key of Object.keys(value)) {
      if (!known.has(key)) errors.push(`${path}.${key} is not allowed`);
    }
  }
  if (typeof value === "number" && Object.hasOwn(schema, "minimum") && value < schema.minimum) {
    errors.push(`${path} is below the minimum`);
  }
  if (typeof value === "string" && Object.hasOwn(schema, "minLength") && value.length < schema.minLength) {
    errors.push(`${path} is too short`);
  }
  if (typeof value === "string" && typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
    errors.push(`${path} does not match the required pattern`);
  }
  if (Array.isArray(value) && Object.hasOwn(schema, "minItems") && value.length < schema.minItems) {
    errors.push(`${path} has too few items`);
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => {
      errors.push(...validate(schema.items, item, currentBase, byId, `${path}[${index}]`, depth + 1));
    });
  }
  return errors;
}

function assertClosedObjects(schema, path, errors) {
  if (!schema || typeof schema !== "object") return;
  if (Array.isArray(schema)) {
    schema.forEach((item, index) => assertClosedObjects(item, `${path}/${index}`, errors));
    return;
  }
  const skipped = path.split("/").some((part) => part === "if" || part === "then" || part === "else" || part === "not");
  if (!skipped && (schema.type === "object" || schema.properties) && schema.additionalProperties !== false) {
    errors.push(`${path} must set additionalProperties to false`);
  }
  for (const [key, value] of Object.entries(schema)) {
    if (key === "additionalProperties" || typeof value !== "object" || value === null) continue;
    assertClosedObjects(value, `${path}/${key}`, errors);
  }
}

function hashErrors(files, recorded) {
  const errors = [];
  const expected = files.map((file) => file.path);
  if (!recorded || typeof recorded !== "object" || Array.isArray(recorded)) {
    return ["schema/fixtures/v1.hashes.json is not an object"];
  }
  for (const key of Object.keys(recorded)) {
    if (!expected.includes(key)) errors.push(`schema/fixtures/v1.hashes.json has an unexpected entry ${key}`);
  }
  for (const file of files) {
    if (recorded[file.path] !== sha256(file.bytes)) {
      errors.push(`v1 schema changed without a fixture change: ${file.path}`);
    }
  }
  return errors;
}

function gitLines(args) {
  try {
    return execFileSync("git", args, { cwd: rootPath, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function driftIn(files, schemaPaths) {
  const schemaChanged = files.filter((file) => schemaPaths.includes(file));
  const fixtureChanged = files.some((file) => file.startsWith("schema/fixtures/"));
  if (schemaChanged.length === 0 || fixtureChanged) return [];
  return schemaChanged.map((file) => `v1 schema changed without a fixture change: ${file}`);
}

function fixtureDriftErrors(schemaPaths) {
  const errors = [];
  const status = gitLines(["status", "--porcelain", "-uall"]);
  if (status) {
    const files = status.split("\n").filter(Boolean).map((line) => {
      const file = line.slice(3).trim();
      return file.includes(" -> ") ? file.split(" -> ").pop() : file;
    });
    errors.push(...driftIn(files, schemaPaths));
  }
  const base = gitLines(["merge-base", "HEAD", "origin/main"]);
  if (!base) return errors;
  const log = gitLines(["log", "--name-only", "--pretty=format:%x1e", `${base}..HEAD`]);
  if (!log) return errors;
  for (const block of log.split("\u001e")) {
    const files = block.split("\n").map((line) => line.trim()).filter(Boolean);
    errors.push(...driftIn(files, schemaPaths));
  }
  return errors;
}

function listSchemaFiles(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) listSchemaFiles(full, found);
    else if (entry.name.endsWith(".schema.json")) found.push(full.slice(rootPath.endsWith("/") ? rootPath.length : rootPath.length + 1));
  }
  return found;
}

function metaMismatch(meta, project) {
  const reasons = [];
  if (!meta || typeof meta !== "object") return ["meta"];
  if (meta["svgif:schema"] !== String(project.schemaVersion)) reasons.push("svgif:schema");
  if (meta["svgif:revision"] !== String(project.schemaRevision)) reasons.push("svgif:revision");
  if (meta["svgif:generator"] !== project.generator) reasons.push("svgif:generator");
  return reasons;
}

function isValidName(name) {
  return name.includes("valid") && !name.includes("invalid");
}

export function checkSchema() {
  const errors = [];
  const files = CONTRACTS.map(([, relativePath]) => ({ path: relativePath, bytes: readBytes(relativePath) }));
  const schemas = new Map();
  const byId = new Map();
  for (const [name, relativePath, id] of CONTRACTS) {
    const schema = readJson(relativePath);
    schemas.set(name, schema);
    if (schema.$schema !== DRAFT) errors.push(`${relativePath} $schema is not draft 2020-12`);
    if (schema.$id !== id) errors.push(`${relativePath} $id is ${schema.$id ?? "missing"}`);
    if (typeof schema.$id === "string") byId.set(schema.$id, schema);
    assertClosedObjects(schema, relativePath, errors);
  }
  const project = schemas.get("project");
  const job = schemas.get("exporter-job");
  const result = schemas.get("backend-result");
  if (project?.properties?.schemaVersion?.const !== 1 || project?.properties?.schemaRevision?.const !== 0) {
    errors.push("project v1 must pin schemaVersion 1 and schemaRevision 0");
  }
  if (job?.properties?.schemaVersion?.const !== 1 || result?.properties?.schemaVersion?.const !== 1) {
    errors.push("exporter-job and backend-result must pin schemaVersion 1");
  }
  if (schemas.get("ir")?.properties?.schemaVersion) errors.push("IR v1 must stay the timeline document");

  const recorded = readJson("schema/fixtures/v1.hashes.json");
  errors.push(...hashErrors(files, recorded));
  const mutated = Buffer.concat([files[0].bytes, Buffer.from("\n ")]);
  const drift = hashErrors([{ path: files[0].path, bytes: mutated }], { [files[0].path]: recorded[files[0].path] });
  if (!drift.some((line) => line.includes("without a fixture change"))) {
    errors.push("a v1 schema change without a fixture change was accepted");
  }
  errors.push(...fixtureDriftErrors(files.map((file) => file.path)));

  for (const [name] of CONTRACTS) {
    const directory = new URL(`schema/fixtures/${name}/`, root);
    const entries = readdirSync(directory).filter((entry) => entry.endsWith(".json"));
    const valid = entries.filter((entry) => isValidName(entry));
    const invalid = entries.filter((entry) => !isValidName(entry));
    if (valid.length < 1 || invalid.length < 1) errors.push(`${name} needs one valid fixture and one invalid fixture`);
    for (const entry of entries) {
      const relativePath = `schema/fixtures/${name}/${entry}`;
      const document = readJson(relativePath);
      if (entry === "v1-script-mismatch.json") {
        const scriptErrors = validate(schemas.get(name), document.script, schemas.get(name), byId, relativePath);
        const reasons = metaMismatch(document.meta, document.script ?? {});
        if (scriptErrors.length > 0) errors.push(`${relativePath} script is not a valid project: ${scriptErrors.join("; ")}`);
        if (reasons.length === 0) errors.push(`${relativePath} meta matches the script`);
        continue;
      }
      const found = validate(schemas.get(name), document, schemas.get(name), byId, relativePath);
      if (isValidName(entry) && found.length > 0) errors.push(`${relativePath} should pass: ${found.join("; ")}`);
      if (!isValidName(entry) && found.length === 0) errors.push(`${relativePath} should be rejected`);
    }
  }

  const migrateUrl = new URL("schema/migrate.mjs", root);
  return import(migrateUrl.href).then((migrator) => {
    if (migrator.CURRENT_SCHEMA_VERSION !== 1) errors.push("newest migrator target is not 1");
    const identity = (migrator.steps ?? []).find((step) => step.from === 1 && step.to === 1);
    if (!identity) errors.push("v1 identity step is missing");
    for (const step of migrator.steps ?? []) {
      if (step.from === step.to) continue;
      const pair = `schema/fixtures/migrations/${step.from}-to-${step.to}`;
      if (!existsSync(new URL(`${pair}/before.json`, root)) || !existsSync(new URL(`${pair}/after.json`, root))) {
        errors.push(`missing ${step.from}-to-${step.to} fixture pair`);
      }
    }
    const v2 = listSchemaFiles(fileURLToPath(new URL("schema/", root))).filter((file) => /(?:^|\/)v2\./.test(file));
    if (v2.length > 0) {
      const pair = "schema/fixtures/migrations/1-to-2";
      if (!existsSync(new URL(`${pair}/before.json`, root)) || !existsSync(new URL(`${pair}/after.json`, root))) {
        errors.push("v2 document has no 1-to-2 fixture pair");
      }
    }
    const before = readJson("schema/fixtures/migrations/1-to-1/before.json");
    const after = readJson("schema/fixtures/migrations/1-to-1/after.json");
    const snapshot = structuredClone(before);
    let migrated;
    try {
      migrated = migrator.migrate(before);
    } catch (error) {
      errors.push(`v1 identity step threw ${error.code ?? error.message}`);
    }
    if (!deepEqual(before, snapshot)) errors.push("v1 identity step mutated its input");
    if (!deepEqual(before, after) || !deepEqual(migrated, after)) errors.push("v1 does not migrate to itself");
    const smil = {
      schemaVersion: 1,
      schemaRevision: 0,
      id: "smil",
      schema: "svgif.backend/1",
      svg: "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>",
    };
    const smilErrors = validate(result, smil, result, byId, "smil");
    if (smilErrors.length > 0) errors.push(`smil result should pass: ${smilErrors.join("; ")}`);
    if (validate(result, { ...smil, css: "a{}" }, result, byId, "smil-css").length === 0) {
      errors.push("smil result must not carry css");
    }
    const tooNew = readJson("schema/fixtures/migrations/schema-too-new.json");
    try {
      const guessed = migrator.migrate(tooNew);
      errors.push(`schema-too-new was guessed as ${JSON.stringify(guessed)}`);
    } catch (error) {
      if (error.code !== "schema-too-new") errors.push(`schema-too-new returned ${error.code ?? error.message}`);
    }
    return errors;
  });
}

const launched = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (launched) {
  checkSchema().then((errors) => {
    if (errors.length > 0) {
      for (const error of errors) console.error(error);
      process.exit(1);
    }
    console.log("schema ok");
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
