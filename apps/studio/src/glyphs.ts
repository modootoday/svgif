/** Block glyphs for printable ASCII. Each row is five bits, left bit first. */

const FONT: Record<string, number[]> = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b10010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  "0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "2": [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  "3": [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  "5": [0b11111, 0b10000, 0b10000, 0b11110, 0b00001, 0b00001, 0b11110],
  "6": [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  ".": [0, 0, 0, 0, 0, 0b01100, 0b01100],
  ",": [0, 0, 0, 0, 0b00110, 0b00100, 0b01000],
  "-": [0, 0, 0, 0b01110, 0, 0, 0],
  _: [0, 0, 0, 0, 0, 0, 0b11111],
  ":": [0, 0b01100, 0b01100, 0, 0b01100, 0b01100, 0],
  "!": [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
  "?": [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0, 0b00100],
  "+": [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
  "/": [0b00001, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b10000],
  "(": [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ")": [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
};

function glyphRows(char: string): number[] {
  if (char === " ") return [0, 0, 0, 0, 0, 0, 0];
  const direct = FONT[char] ?? FONT[char.toUpperCase()];
  if (direct) return direct;
  const code = char.charCodeAt(0);
  const bit = 1 << (code % 5);
  return [0b11111, bit, bit, bit, bit, bit, 0b11111];
}

const CELL = 6;
const ROW_GAP = 1;
const ADVANCE = 5 * CELL + 6;

/** Vector path for printable text. Coordinates stay in user units. */
export function textPath(text: string, originX = 0, originY = 0): string {
  const parts: string[] = [];
  let cursor = originX;
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code < 32 || code > 126) continue;
    const rows = glyphRows(char);
    rows.forEach((bits, row) => {
      let column = 0;
      while (column < 5) {
        if (((bits >> (4 - column)) & 1) === 0) {
          column += 1;
          continue;
        }
        let end = column;
        while (end < 5 && ((bits >> (4 - end)) & 1) === 1) end += 1;
        const x0 = cursor + column * CELL;
        const y0 = originY + row * (CELL + ROW_GAP);
        const x1 = cursor + end * CELL - ROW_GAP;
        const y1 = y0 + CELL;
        parts.push(`M ${x0} ${y0} H ${x1} V ${y1} H ${x0} Z`);
        column = end;
      }
    });
    cursor += ADVANCE;
  }
  if (parts.length === 0) {
    return `M ${originX} ${originY} H ${originX + 4} V ${originY + 4} H ${originX} Z`;
  }
  return parts.join(" ");
}

export function pathOrigin(d: string): { x: number; y: number } {
  const match = /M\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/.exec(d);
  if (!match) return { x: 48, y: 48 };
  return { x: Number(match[1]), y: Number(match[2]) };
}

/** Offset of the first filled cell from the text origin. That cell is the first M. */
export function firstInkOffset(text: string): { x: number; y: number } | null {
  let cursor = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code < 32 || code > 126) continue;
    const rows = glyphRows(char);
    for (let row = 0; row < rows.length; row += 1) {
      const bits = rows[row] ?? 0;
      for (let column = 0; column < 5; column += 1) {
        if (((bits >> (4 - column)) & 1) === 0) continue;
        return { x: cursor + column * CELL, y: row * (CELL + ROW_GAP) };
      }
    }
    cursor += ADVANCE;
  }
  return null;
}

/** Recover the origin that textPath used, including glyphs whose first cell is empty. */
export function textOrigin(text: string, d: string): { x: number; y: number } {
  const mark = pathOrigin(d);
  const ink = firstInkOffset(text);
  if (!ink) return mark;
  return { x: mark.x - ink.x, y: mark.y - ink.y };
}
