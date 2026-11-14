/** A small HTML tree used when the host has no DOMParser. It does not run scripts. */

export class HtmlNode {
  readonly tagName: string;
  readonly id: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: HtmlNode[];
  readonly textContent: string;

  constructor(tag: string, attributes: Map<string, string>, children: HtmlNode[], text: string) {
    this.tagName = tag === "#document" ? "#document" : tag.toUpperCase();
    this.attributes = attributes;
    this.id = attributes.get("id") ?? "";
    this.children = children;
    this.textContent = text + children.map((child) => child.textContent).join("");
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name.toLowerCase()) ?? null;
  }

  querySelector(selector: string): HtmlNode | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): HtmlNode[] {
    const found: HtmlNode[] = [];
    const visit = (node: HtmlNode) => {
      for (const child of node.children) {
        if (matches(child, selector)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
}

function matches(node: HtmlNode, selector: string): boolean {
  const id = selector.match(/#([A-Za-z0-9_:-]+)/);
  if (id && node.id !== id[1]) return false;
  const attr = selector.match(/\[([A-Za-z0-9_:-]+)="([^"]*)"\]/);
  if (attr && node.getAttribute(attr[1] ?? "") !== attr[2]) return false;
  const tag = selector.match(/^([A-Za-z0-9]+)/);
  if (tag && node.tagName.toLowerCase() !== tag[1]) return false;
  if (!tag && !id && !attr) return false;
  return true;
}

function decode(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function parseAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const pattern = /([^\s=\/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  for (const match of source.matchAll(pattern)) {
    const name = match[1]?.toLowerCase();
    if (!name || name.endsWith("/")) continue;
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attributes.set(name, decode(value));
  }
  return attributes;
}

export function parseHtmlTree(markup: string): HtmlNode {
  const root = { tag: "#document", attributes: new Map<string, string>(), children: [] as Raw[], text: "" };
  const stack: Raw[] = [root];
  const voidTags = new Set(["meta", "link", "img", "br", "hr", "input", "source", "wbr"]);
  let index = 0;
  while (index < markup.length) {
    const lt = markup.indexOf("<", index);
    const parent = stack[stack.length - 1] ?? root;
    if (lt < 0) {
      parent.text += markup.slice(index);
      break;
    }
    if (lt > index) parent.text += markup.slice(index, lt);
    if (markup.startsWith("<!--", lt)) {
      const end = markup.indexOf("-->", lt + 4);
      index = end < 0 ? markup.length : end + 3;
      continue;
    }
    if (markup.startsWith("<!", lt) || markup.startsWith("<?", lt)) {
      const end = markup.indexOf(">", lt + 2);
      index = end < 0 ? markup.length : end + 1;
      continue;
    }
    const close = markup.startsWith("</", lt);
    const end = markup.indexOf(">", lt + 1);
    if (end < 0) break;
    const body = markup.slice(lt + (close ? 2 : 1), end).trim();
    const tag = (body.match(/^[A-Za-z0-9:-]+/)?.[0] ?? "").toLowerCase();
    index = end + 1;
    if (!tag) continue;
    if (close) {
      for (let depth = stack.length - 1; depth > 0; depth -= 1) {
        if (stack[depth]?.tag === tag) {
          stack.length = depth;
          break;
        }
      }
      continue;
    }
    const node: Raw = { tag, attributes: parseAttributes(body), children: [], text: "" };
    parent.children.push(node);
    if (tag === "script" || tag === "style") {
      const closer = new RegExp(`</${tag}\\s*>`, "i");
      const rest = markup.slice(index);
      const found = closer.exec(rest);
      node.text = found ? rest.slice(0, found.index) : rest;
      index += found ? found.index + found[0].length : rest.length;
      continue;
    }
    if (!body.endsWith("/") && !voidTags.has(tag)) stack.push(node);
  }
  return seal(root);
}

interface Raw {
  tag: string;
  attributes: Map<string, string>;
  children: Raw[];
  text: string;
}

function seal(raw: Raw): HtmlNode {
  return new HtmlNode(raw.tag, raw.attributes, raw.children.map(seal), raw.text);
}
