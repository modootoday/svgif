/** Studio shell mode. The URL and the remembered choice are the only inputs. */

export type StudioShell = "simple" | "advanced";

export const SHELL_MODE_KEY = "svgif-studio-shell";

export function explicitShell(search: string): StudioShell | null {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const value = new URLSearchParams(query).get("mode");
  if (value === "simple" || value === "advanced") return value;
  return null;
}

export function rememberedShell(stored: string | null): StudioShell | null {
  if (stored === "simple" || stored === "advanced") return stored;
  return null;
}

/** The URL wins. A visit with no URL mode uses the remembered choice. A first visit is simple. */
export function resolveShell(search: string, stored: string | null): StudioShell {
  return explicitShell(search) ?? rememberedShell(stored) ?? "simple";
}

export function toggledShell(current: StudioShell): StudioShell {
  return current === "simple" ? "advanced" : "simple";
}
