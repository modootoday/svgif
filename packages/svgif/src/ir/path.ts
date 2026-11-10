/** SVG path command list. Matching lists may interpolate. A mismatch stays on hold. */

export interface PathCommand {
  op: string;
  args: number[];
}

const ARITY: Record<string, number> = {
  M: 2,
  L: 2,
  T: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  A: 7,
  Z: 0,
};

function isLetter(char: string): boolean {
  return (char >= "A" && char <= "Z") || (char >= "a" && char <= "z");
}

function isSep(char: string): boolean {
  return char === "," || char === " " || char === "\n" || char === "\t" || char === "\r";
}

export function parsePath(d: string): PathCommand[] | null {
  const commands: PathCommand[] = [];
  const source = d.trim();
  const length = source.length;
  let index = 0;
  let command = "";

  const skipSep = (): void => {
    while (index < length && isSep(source[index] ?? "")) index += 1;
  };

  const readNumber = (): number | null => {
    skipSep();
    if (index >= length) return null;
    const start = index;
    const sign = source[index];
    if (sign === "+" || sign === "-") index += 1;
    let sawDigit = false;
    while (index < length) {
      const char = source[index] ?? "";
      if (char < "0" || char > "9") break;
      sawDigit = true;
      index += 1;
    }
    if (source[index] === ".") {
      index += 1;
      while (index < length) {
        const char = source[index] ?? "";
        if (char < "0" || char > "9") break;
        sawDigit = true;
        index += 1;
      }
    }
    if (!sawDigit) {
      index = start;
      return null;
    }
    const exponent = source[index];
    if (exponent === "e" || exponent === "E") {
      const mark = index;
      index += 1;
      const expSign = source[index];
      if (expSign === "+" || expSign === "-") index += 1;
      let sawExp = false;
      while (index < length) {
        const char = source[index] ?? "";
        if (char < "0" || char > "9") break;
        sawExp = true;
        index += 1;
      }
      if (!sawExp) index = mark;
    }
    const value = Number(source.slice(start, index));
    if (!Number.isFinite(value)) return null;
    return value;
  };

  while (index < length) {
    skipSep();
    if (index >= length) break;
    const char = source[index] ?? "";
    if (isLetter(char)) {
      command = char;
      index += 1;
    } else if (command === "") {
      return null;
    }
    const arity = ARITY[command.toUpperCase()];
    if (arity === undefined) return null;
    if (arity === 0) {
      commands.push({ op: command, args: [] });
      continue;
    }
    const first: number[] = [];
    for (let arg = 0; arg < arity; arg += 1) {
      const value = readNumber();
      if (value === null) return null;
      first.push(value);
    }
    commands.push({ op: command, args: first });
    while (true) {
      const mark = index;
      skipSep();
      if (index >= length || isLetter(source[index] ?? "")) {
        index = mark;
        break;
      }
      index = mark;
      const saved = index;
      const more: number[] = [];
      let ok = true;
      for (let arg = 0; arg < arity; arg += 1) {
        const value = readNumber();
        if (value === null) {
          ok = false;
          break;
        }
        more.push(value);
      }
      if (!ok) {
        index = saved;
        break;
      }
      const repeat = command === "M" ? "L" : command === "m" ? "l" : command;
      commands.push({ op: repeat, args: more });
    }
  }
  return commands.length > 0 ? commands : null;
}

export function sameCommandList(left: PathCommand[], right: PathCommand[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (!a || !b) return false;
    if (a.op !== b.op || a.args.length !== b.args.length) return false;
  }
  return true;
}

export function writePath(
  commands: PathCommand[],
  values: number[][],
  format: (n: number) => string,
): string {
  const parts: string[] = [];
  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    const args = values[index] ?? [];
    if (!command) continue;
    if (args.length === 0) parts.push(command.op);
    else parts.push(`${command.op} ${args.map((value) => format(value)).join(" ")}`);
  }
  return parts.join(" ");
}
