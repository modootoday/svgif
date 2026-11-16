// The one JSON Schema validator for the registry files.
// It reads the draft 2020-12 keywords the registry uses and no others.
// The registry gate, the CLI, and the MCP server all call this function.

export function deepEqual(left, right) {
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

export function validate(schema, value, baseDocument, byId, path, depth = 0) {
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
