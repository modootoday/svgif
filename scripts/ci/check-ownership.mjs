#!/usr/bin/env node
// Check assignment paths against the org-chart role table and path rows.
// Longest matching prefix wins. Open assignments must not overlap.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const chartPath = join(root, ".spec/sot/org-chart.sot.md");
const assignmentsDir = join(root, ".agents/handoff/assignments");

const OPEN = new Set(["assigned", "in-progress"]);

function norm(value) {
  return String(value)
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");
}

function unquote(value) {
  const text = value.trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1).trim();
  }
  return text;
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparator(line) {
  return /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line);
}

function plain(cell) {
  return cell.replaceAll("`", "").trim();
}

function pathsInCell(cell) {
  const found = [...cell.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  if (found.length > 0) return found;
  const text = plain(cell);
  return text ? [text] : [];
}

function parseTables(markdown) {
  const lines = markdown.split(/\r?\n/);
  const tables = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].trim().startsWith("|")) continue;
    if (!isSeparator(lines[index + 1] ?? "")) continue;
    const header = splitRow(lines[index]);
    const rows = [];
    index += 2;
    while (index < lines.length && lines[index].trim().startsWith("|")) {
      rows.push(splitRow(lines[index]));
      index += 1;
    }
    index -= 1;
    tables.push({ header, rows });
  }
  return tables;
}

function headerIndex(header, name) {
  return header.findIndex((cell) => plain(cell).toLowerCase() === name);
}

function loadChart(markdown) {
  const roles = [];
  const rows = [];
  const errors = [];
  for (const table of parseTables(markdown)) {
    const roleCol = headerIndex(table.header, "role id");
    const pathCol = headerIndex(table.header, "path");
    const ownerCol = headerIndex(table.header, "owner");
    if (roleCol >= 0) {
      for (const row of table.rows) {
        const id = plain(row[roleCol] ?? "");
        if (id) roles.push(id);
      }
    }
    if (pathCol >= 0 && ownerCol >= 0) {
      for (const row of table.rows) {
        const owner = plain(row[ownerCol] ?? "");
        for (const path of pathsInCell(row[pathCol] ?? "")) {
          rows.push({ path, owner });
        }
      }
    }
  }
  const roleSet = new Set(roles);
  if (roleSet.size !== roles.length) {
    errors.push("org chart role table lists a role id more than once");
  }
  for (const row of rows) {
    if (row.path.includes("<role>")) {
      if (row.owner !== "that role") {
        errors.push(`org chart placeholder ${row.path} must be owned by "that role"`);
      }
      continue;
    }
    if (!roleSet.has(row.owner)) {
      errors.push(`org chart path ${row.path} has unknown owner ${row.owner || "(empty)"}`);
    }
  }
  return { roles: [...roleSet], rows, errors };
}

function expandRow(row, roles) {
  if (!row.path.includes("<role>")) return [row];
  return roles.map((role) => ({
    path: row.path.replaceAll("<role>", role),
    owner: role,
  }));
}

function rowMatches(rowPath, candidate) {
  const row = norm(rowPath);
  const path = norm(candidate);
  if (!row || !path) return false;
  return row === path || path.startsWith(`${row}/`);
}

function overlaps(left, right) {
  const a = norm(left);
  const b = norm(right);
  if (!a || !b) return false;
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function parseAssignment(text, file) {
  const errors = [];
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!front) {
    errors.push(`${file}: missing front matter`);
    return { file, id: file, to: "", status: "", paths: null, errors };
  }
  let id = file;
  let to = "";
  let toSeen = false;
  let status = "";
  let paths = null;
  let inPaths = false;
  for (const line of front[1].split(/\r?\n/)) {
    const inline = line.match(/^paths:\s*\[(.*)\]\s*$/);
    if (inline) {
      inPaths = false;
      const inner = inline[1].trim();
      paths = inner
        ? inner.split(",").map((item) => unquote(item)).filter(Boolean)
        : [];
      continue;
    }
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      paths = [];
      continue;
    }
    if (inPaths) {
      const item = line.match(/^\s+-\s+(.*)$/);
      if (item) {
        const value = unquote(item[1]);
        if (!value) errors.push(`${file}: paths contains an empty entry`);
        else paths.push(value);
        continue;
      }
      if (line.trim() === "") continue;
      inPaths = false;
    }
    const field = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!field) continue;
    const value = unquote(field[2]);
    if (field[1] === "id" && value) id = value;
    if (field[1] === "to") {
      toSeen = true;
      to = value === "~" || value === "null" ? "" : value;
    }
    if (field[1] === "status") status = value;
  }
  if (!toSeen || !to) errors.push(`${id}: to is missing`);
  return { file, id, to, status, paths, errors };
}

function check(chartMarkdown, assignments) {
  const chart = loadChart(chartMarkdown);
  const errors = [...chart.errors];
  const parsed = assignments.map((entry) => parseAssignment(entry.text, entry.file));
  for (const assignment of parsed) errors.push(...assignment.errors);

  const roleSet = new Set(chart.roles);
  for (const assignment of parsed) {
    if (!assignment.to) continue;
    if (!roleSet.has(assignment.to)) {
      errors.push(`${assignment.id}: to ${assignment.to} is not a role id`);
    }
  }

  const open = parsed.filter((assignment) => OPEN.has(assignment.status));
  for (const assignment of open) {
    if (!assignment.paths || assignment.paths.length === 0) {
      errors.push(`${assignment.id}: paths is missing or empty`);
    }
  }

  for (let left = 0; left < open.length; left += 1) {
    for (let right = left + 1; right < open.length; right += 1) {
      const a = open[left];
      const b = open[right];
      for (const pathA of a.paths ?? []) {
        for (const pathB of b.paths ?? []) {
          if (overlaps(pathA, pathB)) {
            errors.push(
              `${a.id} path ${pathA} overlaps ${b.id} path ${pathB}`,
            );
          }
        }
      }
    }
  }

  for (const assignment of parsed) {
    if (!assignment.to || !assignment.paths) continue;
    for (const path of assignment.paths) {
      const matches = [];
      for (const row of chart.rows) {
        for (const expanded of expandRow(row, chart.roles)) {
          if (rowMatches(expanded.path, path)) matches.push(expanded);
        }
      }
      if (matches.length === 0) {
        errors.push(`${assignment.id}: ${path} has no owning row`);
        continue;
      }
      let bestLength = -1;
      let best = [];
      for (const match of matches) {
        const length = norm(match.path).length;
        if (length > bestLength) {
          best = [match];
          bestLength = length;
        } else if (length === bestLength) {
          best.push(match);
        }
      }
      const owners = new Set(best.map((match) => match.owner));
      if (owners.size !== 1) {
        errors.push(`${assignment.id}: ${path} has more than one longest owner`);
        continue;
      }
      const owner = [...owners][0];
      if (owner !== assignment.to) {
        errors.push(
          `${assignment.id}: ${path} longest owner is ${owner}, not ${assignment.to}`,
        );
      }
    }
  }

  return errors;
}

function main() {
  const chart = readFileSync(chartPath, "utf8");
  const assignments = readdirSync(assignmentsDir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => ({
      file: name,
      text: readFileSync(join(assignmentsDir, name), "utf8"),
    }));
  const errors = check(chart, assignments);
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { check, loadChart, parseAssignment };
