#!/usr/bin/env node
// Report v1 catalogue coverage. A missing preset is a gap and exits 0.
// A missing catalogue, a changed count, or a preset that fails its schema exits non-zero.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED_COUNTS = { total: 536, v1: 476, later: 56, out: 4, categories: 19 };
const PARAM_SCHEMA = "https://thumly.io/schema/svgif/preset/v1.schema.json";
const PRESET_SCHEMA = "schema/preset/v1.schema.json";
const CATALOGUE = "schema/catalogue/components.v1.json";
const TIERS = new Set(["v1", "later", "out"]);

const ANNOTATIONS = new Set([
  "$schema",
  "$id",
  "$anchor",
  "$comment",
  "$defs",
  "definitions",
  "title",
  "description",
  "examples",
  "default",
  "deprecated",
  "readOnly",
  "writeOnly",
  "contentMediaType",
  "contentEncoding",
  "markdownDescription",
]);

const KEYWORDS = new Set([
  "type",
  "enum",
  "const",
  "required",
  "properties",
  "additionalProperties",
  "patternProperties",
  "minLength",
  "maxLength",
  "pattern",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "uniqueItems",
  "items",
  "prefixItems",
  "minProperties",
  "maxProperties",
  "dependentRequired",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
  "$ref",
]);

function fileURLToPath(url) {
  return decodeURIComponent(url.pathname);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function deepEqual(left, right) {
  if (left === right) return true;
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false;
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

function unknownKeyword(schema) {
  for (const key of Object.keys(schema)) {
    if (key.startsWith("x-")) continue;
    if (!ANNOTATIONS.has(key) && !KEYWORDS.has(key)) return key;
  }
  return null;
}

function isMultiple(value, divisor) {
  if (divisor === 0) return false;
  const quotient = value / divisor;
  return Math.abs(quotient - Math.round(quotient)) < 1e-8;
}

function validate(schema, value, baseDocument, byId, path, depth = 0) {
  if (depth > 40) return [`${path} schema nested too deeply`];
  if (schema === true) return [];
  if (schema === false) return [`${path} is not allowed`];
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return [`${path} schema is not an object`];
  if (typeof schema.$ref === "string") {
    try {
      const resolved = resolveRef(schema.$ref, baseDocument, byId);
      return validate(resolved.schema, value, resolved.base, byId, path, depth + 1);
    } catch (error) {
      return [`${path} ${error.message}`];
    }
  }
  const unknown = unknownKeyword(schema);
  if (unknown) return [`${path} schema uses unchecked keyword ${unknown}`];

  const errors = [];
  let currentBase = baseDocument;
  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) errors.push(...validate(sub, value, currentBase, byId, path, depth + 1));
  }
  if (Array.isArray(schema.anyOf)) {
    const matched = schema.anyOf.some((sub) => validate(sub, value, currentBase, byId, path, depth + 1).length === 0);
    if (!matched) errors.push(`${path} did not match any allowed shape`);
  }
  if (Array.isArray(schema.oneOf)) {
    const matched = schema.oneOf.filter((sub) => validate(sub, value, currentBase, byId, path, depth + 1).length === 0);
    if (matched.length !== 1) errors.push(`${path} must match exactly one allowed shape`);
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
  if (Object.hasOwn(schema, "const") && !deepEqual(value, schema.const)) {
    errors.push(`${path} must be ${JSON.stringify(schema.const)}`);
  }
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
  if (objectLike && schema.dependentRequired && typeof schema.dependentRequired === "object") {
    for (const [key, required] of Object.entries(schema.dependentRequired)) {
      if (!Object.hasOwn(value, key) || !Array.isArray(required)) continue;
      for (const dependent of required) {
        if (!Object.hasOwn(value, dependent)) errors.push(`${path}.${dependent} is required`);
      }
    }
  }
  if (objectLike && schema.properties) {
    for (const [key, sub] of Object.entries(schema.properties)) {
      if (Object.hasOwn(value, key)) errors.push(...validate(sub, value[key], currentBase, byId, `${path}.${key}`, depth + 1));
    }
  }
  if (objectLike && schema.patternProperties) {
    for (const [pattern, sub] of Object.entries(schema.patternProperties)) {
      const expression = new RegExp(pattern);
      for (const key of Object.keys(value)) {
        if (expression.test(key)) errors.push(...validate(sub, value[key], currentBase, byId, `${path}.${key}`, depth + 1));
      }
    }
  }
  if (objectLike && Object.hasOwn(schema, "additionalProperties")) {
    const known = new Set(Object.keys(schema.properties ?? {}));
    const patterns = Object.keys(schema.patternProperties ?? {}).map((pattern) => new RegExp(pattern));
    for (const key of Object.keys(value)) {
      if (known.has(key) || patterns.some((pattern) => pattern.test(key))) continue;
      if (schema.additionalProperties === false) errors.push(`${path}.${key} is not allowed`);
      else if (schema.additionalProperties !== true) {
        errors.push(...validate(schema.additionalProperties, value[key], currentBase, byId, `${path}.${key}`, depth + 1));
      }
    }
  }
  if (objectLike && Object.hasOwn(schema, "minProperties") && Object.keys(value).length < schema.minProperties) {
    errors.push(`${path} has too few properties`);
  }
  if (objectLike && Object.hasOwn(schema, "maxProperties") && Object.keys(value).length > schema.maxProperties) {
    errors.push(`${path} has too many properties`);
  }
  if (typeof value === "number" && Object.hasOwn(schema, "minimum") && value < schema.minimum) {
    errors.push(`${path} is below the minimum`);
  }
  if (typeof value === "number" && Object.hasOwn(schema, "maximum") && value > schema.maximum) {
    errors.push(`${path} is above the maximum`);
  }
  if (typeof value === "number" && Object.hasOwn(schema, "exclusiveMinimum") && value <= schema.exclusiveMinimum) {
    errors.push(`${path} is below the exclusive minimum`);
  }
  if (typeof value === "number" && Object.hasOwn(schema, "exclusiveMaximum") && value >= schema.exclusiveMaximum) {
    errors.push(`${path} is above the exclusive maximum`);
  }
  if (typeof value === "number" && Object.hasOwn(schema, "multipleOf") && !isMultiple(value, schema.multipleOf)) {
    errors.push(`${path} is not a multiple of the required step`);
  }
  if (typeof value === "string" && Object.hasOwn(schema, "minLength") && value.length < schema.minLength) {
    errors.push(`${path} is too short`);
  }
  if (typeof value === "string" && Object.hasOwn(schema, "maxLength") && value.length > schema.maxLength) {
    errors.push(`${path} is too long`);
  }
  if (typeof value === "string" && typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
    errors.push(`${path} does not match the required pattern`);
  }
  if (Array.isArray(value) && Object.hasOwn(schema, "minItems") && value.length < schema.minItems) {
    errors.push(`${path} has too few items`);
  }
  if (Array.isArray(value) && Object.hasOwn(schema, "maxItems") && value.length > schema.maxItems) {
    errors.push(`${path} has too many items`);
  }
  if (Array.isArray(value) && schema.uniqueItems === true) {
    for (let left = 0; left < value.length; left += 1) {
      for (let right = left + 1; right < value.length; right += 1) {
        if (deepEqual(value[left], value[right])) errors.push(`${path} has a repeated item`);
      }
    }
  }
  if (Array.isArray(value) && (schema.prefixItems || schema.items)) {
    const prefix = Array.isArray(schema.prefixItems) ? schema.prefixItems : [];
    value.forEach((item, index) => {
      if (index < prefix.length) {
        errors.push(...validate(prefix[index], item, currentBase, byId, `${path}[${index}]`, depth + 1));
        return;
      }
      if (schema.items === undefined) return;
      errors.push(...validate(schema.items, item, currentBase, byId, `${path}[${index}]`, depth + 1));
    });
    if (schema.items === false && value.length > prefix.length) errors.push(`${path} has too many items`);
  }
  return errors;
}

function listSchemaFiles(directory, found = []) {
  if (!existsSync(directory)) return found;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) listSchemaFiles(full, found);
    else if (entry.name.endsWith(".schema.json")) found.push(full);
  }
  return found;
}

function loadSchemas(root) {
  const byId = new Map();
  const errors = [];
  for (const file of listSchemaFiles(join(root, "schema"))) {
    let schema;
    try {
      schema = readJson(file);
    } catch {
      errors.push(`${file.slice(root.length + 1)} is not JSON`);
      continue;
    }
    if (schema && typeof schema.$id === "string") {
      if (byId.has(schema.$id)) errors.push(`${schema.$id} is declared by more than one schema file`);
      byId.set(schema.$id, schema);
    }
  }
  return { byId, errors };
}

function catalogueErrors(catalogue, expected) {
  const errors = [];
  if (!catalogue || typeof catalogue !== "object" || Array.isArray(catalogue)) {
    return ["catalogue is not an object"];
  }
  if (catalogue.paramSchema !== PARAM_SCHEMA) errors.push("catalogue parameter schema changed");
  const counts = catalogue.counts;
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
    errors.push("catalogue counts are missing");
    return errors;
  }
  for (const key of Object.keys(expected)) {
    if (counts[key] !== expected[key]) errors.push(`catalogue count changed: ${key}`);
  }
  for (const key of Object.keys(counts)) {
    if (!Object.hasOwn(expected, key)) errors.push(`catalogue count changed: ${key}`);
  }
  if (!Array.isArray(catalogue.categories) || !Array.isArray(catalogue.types)) {
    errors.push("catalogue categories or types are missing");
    return errors;
  }
  if (catalogue.categories.length !== expected.categories) errors.push("catalogue count changed: categories");
  const categoryIds = new Set();
  for (const category of catalogue.categories) {
    if (!category || typeof category.id !== "string" || category.id.length === 0) {
      errors.push("catalogue category id is missing");
      continue;
    }
    if (categoryIds.has(category.id)) errors.push(`catalogue category id is duplicated: ${category.id}`);
    categoryIds.add(category.id);
  }
  if (catalogue.types.length !== expected.total) errors.push("catalogue count changed: total");
  const seen = new Set();
  const tiers = { v1: 0, later: 0, out: 0 };
  for (const type of catalogue.types) {
    if (!type || typeof type.id !== "string" || typeof type.category !== "string" || typeof type.tier !== "string") {
      errors.push("catalogue type is missing id, category, or tier");
      continue;
    }
    if (seen.has(type.id)) errors.push(`catalogue type id is duplicated: ${type.id}`);
    seen.add(type.id);
    if (!categoryIds.has(type.category)) errors.push(`catalogue type ${type.id} has an unknown category`);
    if (!TIERS.has(type.tier)) errors.push(`catalogue type ${type.id} has an unknown tier`);
    else tiers[type.tier] += 1;
  }
  for (const tier of TIERS) {
    if (tiers[tier] !== expected[tier]) errors.push(`catalogue count changed: ${tier}`);
  }
  return errors;
}

function discoverPresets(root) {
  const directory = join(root, "presets");
  const presets = [];
  const errors = [];
  if (!existsSync(directory)) return { presets, errors };
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isFile()) {
      if (entry.name === "index.json" || !entry.name.endsWith(".json")) continue;
      errors.push(`presets/${entry.name} is not a preset document`);
      continue;
    }
    if (!entry.isDirectory()) continue;
    for (const child of readdirSync(full, { withFileTypes: true })) {
      const childPath = join(full, child.name);
      if (child.isDirectory()) {
        errors.push(`presets/${entry.name}/${child.name} is nested too deeply`);
        continue;
      }
      if (!child.isFile() || !child.name.endsWith(".json")) continue;
      const id = child.name.slice(0, -".json".length);
      presets.push({
        category: entry.name,
        id,
        jsonPath: childPath,
        goldenPath: join(full, `${id}.golden.svg`),
        display: `presets/${entry.name}/${child.name}`,
      });
    }
  }
  return { presets, errors };
}

function checkRoot(root, expected = EXPECTED_COUNTS) {
  const errors = [];
  const cataloguePath = join(root, CATALOGUE);
  if (!existsSync(cataloguePath)) {
    return { errors: ["catalogue is missing"], report: [], covered: 0, v1: 0, presets: 0 };
  }
  let catalogue;
  try {
    catalogue = readJson(cataloguePath);
  } catch {
    return { errors: ["catalogue is not JSON"], report: [], covered: 0, v1: 0, presets: 0 };
  }
  errors.push(...catalogueErrors(catalogue, expected));
  if (errors.length > 0) return { errors, report: [], covered: 0, v1: expected.v1, presets: 0 };

  const v1Ids = new Set(catalogue.types.filter((type) => type.tier === "v1").map((type) => type.id));
  const blockedIds = new Set(catalogue.types.filter((type) => type.tier !== "v1").map((type) => type.id));
  const discovered = discoverPresets(root);
  errors.push(...discovered.errors);
  const schemaPath = join(root, PRESET_SCHEMA);
  const schemaReady = existsSync(schemaPath);
  if (discovered.presets.length > 0 && !schemaReady) errors.push("preset schema is missing");

  let byId = new Map();
  let presetSchema = null;
  if (schemaReady) {
    const loaded = loadSchemas(root);
    errors.push(...loaded.errors);
    byId = loaded.byId;
    presetSchema = byId.get(PARAM_SCHEMA) ?? null;
    if (!presetSchema) errors.push("preset schema $id is not the catalogue parameter schema");
  }

  const covered = new Set();
  if (presetSchema) {
    for (const preset of discovered.presets) {
      if (blockedIds.has(preset.category)) {
        errors.push(`${preset.display} is not a v1 preset category`);
        continue;
      }
      if (!v1Ids.has(preset.category)) {
        errors.push(`${preset.display} is not a v1 preset category`);
        continue;
      }
      let document;
      try {
        document = readJson(preset.jsonPath);
      } catch {
        errors.push(`${preset.display} is not JSON`);
        continue;
      }
      const found = validate(presetSchema, document, presetSchema, byId, preset.display);
      if (document && typeof document === "object" && !Array.isArray(document)) {
        if (Object.hasOwn(document, "category") && document.category !== preset.category) {
          found.push(`${preset.display} category does not match its directory`);
        }
        if (Object.hasOwn(document, "id") && document.id !== preset.id) {
          found.push(`${preset.display} id does not match its file name`);
        }
      }
      if (found.length > 0) {
        errors.push(`${preset.display} fails the schema: ${found.join("; ")}`);
        continue;
      }
      if (existsSync(preset.goldenPath) && statSync(preset.goldenPath).isFile()) covered.add(preset.category);
    }
  }

  const report = [
    `catalogue: ${expected.total} types (v1 ${expected.v1}, later ${expected.later}, out ${expected.out}) in ${expected.categories} categories`,
    `v1 coverage: ${covered.size}/${v1Ids.size}`,
    `gap: ${v1Ids.size - covered.size}`,
    `presets: ${discovered.presets.length}`,
  ];
  return { errors, report, covered: covered.size, v1: v1Ids.size, presets: discovered.presets.length };
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sampleCatalogue(root) {
  const expected = { total: 3, v1: 1, later: 1, out: 1, categories: 1 };
  const catalogue = {
    paramSchema: PARAM_SCHEMA,
    counts: { ...expected },
    categories: [{ id: "primitives" }],
    types: [
      { id: "shape.rect", category: "primitives", tier: "v1" },
      { id: "shape.later", category: "primitives", tier: "later" },
      { id: "shape.out", category: "primitives", tier: "out" },
    ],
  };
  writeJson(join(root, CATALOGUE), catalogue);
  return { expected, catalogue };
}

function sampleSchema(root) {
  writeJson(join(root, "schema/component/v1.schema.json"), {
    $id: "https://thumly.io/schema/svgif/component/v1.schema.json",
    type: "object",
    additionalProperties: false,
    required: ["id"],
    properties: { id: { type: "string", minLength: 1 } },
  });
  writeJson(join(root, PRESET_SCHEMA), {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: PARAM_SCHEMA,
    type: "object",
    additionalProperties: false,
    required: ["id", "category", "component"],
    properties: {
      id: { type: "string", minLength: 1 },
      category: { type: "string", minLength: 1 },
      component: { $ref: "https://thumly.io/schema/svgif/component/v1.schema.json" },
    },
  });
}

function selfTest() {
  const root = mkdtempSync(join(tmpdir(), "svgif-preset-coverage-"));
  const failures = [];
  const expect = (name, condition) => {
    if (!condition) failures.push(name);
  };
  try {
    expect("missing catalogue fails", checkRoot(root).errors.some((error) => error.includes("missing")));

    const tree = join(root, "fixture");
    for (const directory of ["schema/catalogue", "schema/preset", "schema/component", "presets"]) {
      mkdirSafe(join(tree, directory));
    }
    const { expected } = sampleCatalogue(tree);
    sampleSchema(tree);
    const open = checkRoot(tree, expected);
    expect("empty registry is a gap", open.errors.length === 0 && open.covered === 0 && open.v1 === 1);

    const changed = structuredClone(readJson(join(tree, CATALOGUE)));
    changed.counts.total = 4;
    writeJson(join(tree, CATALOGUE), changed);
    expect("changed count fails", checkRoot(tree, expected).errors.some((error) => error.includes("count changed")));
    sampleCatalogue(tree);

    const dropped = structuredClone(readJson(join(tree, CATALOGUE)));
    dropped.types.pop();
    writeJson(join(tree, CATALOGUE), dropped);
    expect("dropped type fails", checkRoot(tree, expected).errors.some((error) => error.includes("count changed")));
    sampleCatalogue(tree);

    mkdirSafe(join(tree, "presets/shape.rect"));
    writeJson(join(tree, "presets/shape.rect/basic.json"), {
      id: "basic",
      category: "shape.rect",
      component: { id: "shape.rect" },
    });
    rmSync(join(tree, PRESET_SCHEMA));
    expect("preset without a schema fails", checkRoot(tree, expected).errors.some((error) => error.includes("preset schema is missing")));
    sampleSchema(tree);

    const gap = checkRoot(tree, expected);
    expect("valid preset without a golden stays a gap", gap.errors.length === 0 && gap.covered === 0 && gap.presets === 1);
    writeFileSync(join(tree, "presets/shape.rect/basic.golden.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>\n");
    const covered = checkRoot(tree, expected);
    expect("valid preset with a golden is covered", covered.errors.length === 0 && covered.covered === 1);

    writeJson(join(tree, "presets/shape.rect/basic.json"), {
      id: "basic",
      category: "shape.rect",
      component: { id: "shape.rect" },
      extra: true,
    });
    expect("invalid preset fails", checkRoot(tree, expected).errors.some((error) => error.includes("fails the schema")));
    writeJson(join(tree, "presets/shape.rect/basic.json"), {
      id: "other",
      category: "shape.rect",
      component: { id: "shape.rect" },
    });
    expect("mismatched preset id fails", checkRoot(tree, expected).errors.some((error) => error.includes("does not match")));

    mkdirSafe(join(tree, "presets/shape.later"));
    writeJson(join(tree, "presets/shape.later/later.json"), {
      id: "later",
      category: "shape.later",
      component: { id: "shape.later" },
    });
    expect("later tier is not a category", checkRoot(tree, expected).errors.some((error) => error.includes("not a v1 preset category")));

    writeJson(join(tree, "presets/index.json"), { presets: [] });
    rmSync(join(tree, "presets/shape.later"), { recursive: true });
    writeJson(join(tree, "presets/shape.rect/basic.json"), {
      id: "basic",
      category: "shape.rect",
      component: { id: "shape.rect" },
    });
    const indexed = checkRoot(tree, expected);
    expect("generated index is not a preset", indexed.errors.length === 0 && indexed.presets === 1 && indexed.covered === 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  if (failures.length > 0) {
    for (const failure of failures) console.error(`self-test failed: ${failure}`);
    process.exit(1);
  }
  console.log("self-test: ok");
}

function mkdirSafe(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
}

function repoRoot() {
  return fileURLToPath(new URL("../../", import.meta.url));
}

function main() {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }
  const result = checkRoot(repoRoot());
  for (const line of result.report) console.log(line);
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(error);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { checkRoot, EXPECTED_COUNTS, PARAM_SCHEMA };
