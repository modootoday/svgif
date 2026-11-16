/**
 * The `groups` list of a revision 1 project: Studio's layer groups, kept so that a saved file opens
 * with the same grouping. Compilers ignore it; a group changes no pixel. [[sot:svgif/html-project]]
 */

export interface HtmlGroup {
  id: string;
  childIds: string[];
}

const GROUP_KEYS = ["id", "childIds"];

/**
 * Check a groups list against the composition's node ids. Each group has an id, two or more
 * children that are node ids of this composition, and no child in two groups.
 */
export function assertGroups(value: unknown, nodeIds: readonly string[]): HtmlGroup[] {
  const label = "project.groups";
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const known = new Set(nodeIds);
  const groupIds = new Set<string>();
  const grouped = new Set<string>();
  return value.map((item, index) => {
    const at = `${label}[${index}]`;
    if (item === null || typeof item !== "object" || Array.isArray(item)) throw new TypeError(`${at} must be an object`);
    const group = item as Record<string, unknown>;
    for (const key of Object.keys(group)) {
      if (!GROUP_KEYS.includes(key)) throw new TypeError(`${at}.${key} is not allowed`);
    }
    if (typeof group.id !== "string" || group.id.length < 1 || group.id.length > 64) {
      throw new TypeError(`${at}.id must be a string of 1 to 64 characters`);
    }
    if (groupIds.has(group.id) || known.has(group.id)) throw new TypeError(`${at}.id must differ from every node and group id`);
    groupIds.add(group.id);
    if (!Array.isArray(group.childIds) || group.childIds.length < 2) throw new TypeError(`${at}.childIds must list two or more nodes`);
    const childIds = group.childIds.map((child) => {
      if (typeof child !== "string" || !known.has(child)) throw new TypeError(`${at}.childIds must name nodes of the composition`);
      if (grouped.has(child)) throw new TypeError(`${at}.childIds names a node that is already in a group`);
      grouped.add(child);
      return child;
    });
    return { id: group.id, childIds };
  });
}
