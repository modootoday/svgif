/** Studio and player text already present in an opened HTML file. */

export interface EmbeddedStudioFiles {
  studioSource: string;
  studioCss: string;
  playerSource: string;
}

export interface IdLookup {
  getElementById(id: string): { textContent: string | null } | null;
}

function blockText(host: IdLookup, id: string): string {
  return host.getElementById(id)?.textContent?.trim() ?? "";
}

/** Read the plain studio blocks and the inline player. Empty when the page has none. */
export function readEmbeddedStudio(host: IdLookup): EmbeddedStudioFiles {
  return {
    studioSource: blockText(host, "svgif-studio-source"),
    studioCss: blockText(host, "svgif-studio-css"),
    playerSource: blockText(host, "svgif-player"),
  };
}

/** Document blocks win. Fetch results fill only the fields the document left empty. */
export function chooseStudioFiles(embedded: EmbeddedStudioFiles, fetched: EmbeddedStudioFiles): EmbeddedStudioFiles {
  return {
    studioSource: embedded.studioSource || fetched.studioSource,
    studioCss: embedded.studioCss || fetched.studioCss,
    playerSource: embedded.playerSource || fetched.playerSource,
  };
}
