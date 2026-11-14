// The only migration entry. v1 is an identity step. There is no v2 document.
// schemaRevision 0 and schemaRevision 1 share schemaVersion 1.
// Revision 1 may carry optional node strings label and text. Compilers ignore them.
// Revision 0 rejects those names and any other unknown node field.

export const CURRENT_SCHEMA_VERSION = 1;

export class SchemaError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "SchemaError";
    this.code = code;
  }
}

const NODE_KEYS = {
  0: new Set(["id", "tracks"]),
  1: new Set(["id", "label", "text", "tracks"]),
};

function assertAuthoringNodes(document) {
  const allowed = NODE_KEYS[document.schemaRevision];
  if (!allowed) return;
  const nodes = document.composition?.nodes;
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (node === null || typeof node !== "object" || Array.isArray(node)) {
      throw new SchemaError("schema-invalid", "node is not an object");
    }
    for (const key of Object.keys(node)) {
      if (!allowed.has(key)) {
        throw new SchemaError("schema-invalid", "unknown node field");
      }
    }
    if (document.schemaRevision === 1) {
      if (Object.hasOwn(node, "label") && typeof node.label !== "string") {
        throw new SchemaError("schema-invalid", "label is not a string");
      }
      if (Object.hasOwn(node, "text") && typeof node.text !== "string") {
        throw new SchemaError("schema-invalid", "text is not a string");
      }
    }
  }
}

function identity(document) {
  assertAuthoringNodes(document);
  return structuredClone(document);
}

export const steps = [{ from: 1, to: 1, apply: identity }];

function assertDocument(document) {
  if (document === null || typeof document !== "object" || Array.isArray(document)) {
    throw new SchemaError("schema-invalid", "document is not an object");
  }
  if (typeof document.schemaVersion !== "number" || !Number.isInteger(document.schemaVersion)) {
    throw new SchemaError("schema-invalid", "schemaVersion is not an integer");
  }
}

export function migrate(document) {
  assertDocument(document);
  if (document.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new SchemaError(
      "schema-too-new",
      `schema-too-new: schemaVersion ${document.schemaVersion} is newer than ${CURRENT_SCHEMA_VERSION}`,
    );
  }
  if (!steps.some((step) => step.from === document.schemaVersion)) {
    throw new SchemaError("schema-invalid", `no migrator for schemaVersion ${document.schemaVersion}`);
  }
  let current = document;
  for (const step of steps) {
    if (current.schemaVersion !== step.from) continue;
    current = step.apply(current);
  }
  return current;
}

function authoringRejected(document) {
  try {
    migrate(document);
  } catch (error) {
    return error instanceof SchemaError && error.code === "schema-invalid";
  }
  return false;
}

function proveAuthoringRules() {
  const revision0 = {
    schemaVersion: 1,
    schemaRevision: 0,
    composition: { nodes: [{ id: "s-n0", tracks: [] }] },
  };
  const opened = migrate(structuredClone(revision0));
  if (opened.schemaVersion !== 1 || opened.schemaRevision !== 0) {
    throw new SchemaError("schema-invalid", "revision 0 did not open");
  }
  const withText = structuredClone(revision0);
  withText.composition.nodes[0].text = "Sale 50%";
  const withLabel = structuredClone(revision0);
  withLabel.composition.nodes[0].label = "Sale";
  const withNote = structuredClone(revision0);
  withNote.composition.nodes[0].note = "extra";
  if (!authoringRejected(withText) || !authoringRejected(withLabel) || !authoringRejected(withNote)) {
    throw new SchemaError("schema-invalid", "revision 0 accepted an unknown field");
  }
  const absent = {
    schemaVersion: 1,
    schemaRevision: 1,
    composition: { nodes: [{ id: "s-sale", tracks: [] }] },
  };
  const openedAbsent = migrate(structuredClone(absent));
  if (Object.hasOwn(openedAbsent.composition.nodes[0], "label") || Object.hasOwn(openedAbsent.composition.nodes[0], "text")) {
    throw new SchemaError("schema-invalid", "absent authoring fields were invented");
  }
  const numeric = structuredClone(absent);
  numeric.composition.nodes[0].text = 50;
  if (!authoringRejected(numeric)) {
    throw new SchemaError("schema-invalid", "revision 1 accepted a non-string text");
  }
  const saved = structuredClone(absent);
  saved.composition.nodes[0].label = "Sale";
  saved.composition.nodes[0].text = "Sale 50%";
  const snapshot = structuredClone(saved);
  const loaded = migrate(saved);
  if (loaded.composition.nodes[0].text !== "Sale 50%") {
    throw new SchemaError("schema-invalid", "authoring text was dropped");
  }
  if (JSON.stringify(saved) !== JSON.stringify(snapshot)) {
    throw new SchemaError("schema-invalid", "save mutated the document");
  }
}

function assertAuthoringSchemas(readFileSync) {
  const root = new URL("./", import.meta.url);
  const ir11 = JSON.parse(readFileSync(new URL("ir/v1.1.schema.json", root), "utf8"));
  const project11 = JSON.parse(readFileSync(new URL("project/v1.1.schema.json", root), "utf8"));
  const ir1 = JSON.parse(readFileSync(new URL("ir/v1.schema.json", root), "utf8"));
  const node11 = ir11?.$defs?.node;
  const node1 = ir1?.$defs?.node;
  if (node11?.additionalProperties !== false || node1?.additionalProperties !== false) {
    throw new SchemaError("schema-invalid", "a scene node must stay closed");
  }
  if (node11?.properties?.label?.type !== "string" || node11?.properties?.text?.type !== "string") {
    throw new SchemaError("schema-invalid", "revision 1 label and text must be strings");
  }
  if (node11.required?.includes("label") || node11.required?.includes("text")) {
    throw new SchemaError("schema-invalid", "label and text must stay optional");
  }
  if (node1?.properties?.label || node1?.properties?.text) {
    throw new SchemaError("schema-invalid", "revision 0 must not name label or text");
  }
  if (project11?.properties?.schemaVersion?.const !== 1 || project11?.properties?.schemaRevision?.const !== 1) {
    throw new SchemaError("schema-invalid", "revision 1 must pin schemaVersion 1 and schemaRevision 1");
  }
  if (project11?.properties?.composition?.$ref !== ir11.$id) {
    throw new SchemaError("schema-invalid", "revision 1 project must use the revision 1 timeline");
  }
}

async function proveAuthoringFixture() {
  if (typeof process === "undefined" || process.versions?.node == null) return;
  const { readFileSync } = await import("node:fs");
  assertAuthoringSchemas(readFileSync);
  const directory = new URL("./fixtures/migrations/authoring-roundtrip/", import.meta.url);
  const before = JSON.parse(readFileSync(new URL("before.json", directory), "utf8"));
  const after = JSON.parse(readFileSync(new URL("after.json", directory), "utf8"));
  const snapshot = structuredClone(before);
  const loaded = migrate(before);
  if (loaded?.composition?.nodes?.[0]?.text !== "Sale 50%") {
    throw new SchemaError("schema-invalid", "authoring text was dropped");
  }
  if (JSON.stringify(before) !== JSON.stringify(snapshot) || JSON.stringify(loaded) !== JSON.stringify(after)) {
    throw new SchemaError("schema-invalid", "authoring round-trip changed the document");
  }
}

proveAuthoringRules();
await proveAuthoringFixture();
