// The only migration entry. v1 is an identity step. There is no v2 document.

export const CURRENT_SCHEMA_VERSION = 1;

export class SchemaError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "SchemaError";
    this.code = code;
  }
}

function identity(document) {
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
