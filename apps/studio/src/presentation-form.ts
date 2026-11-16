/**
 * The sharing card fields in the Export panel, and the `presentation` object they write.
 * All four fields empty means no card: the file stays at schema revision 0.
 * Fields the panel does not show (the card video, the poster frame, the author) are kept from the
 * opened file. The export package's own check decides what is valid. [[sot:svgif/external-embed]]
 */

import { assertPresentation } from "../../../packages/svgif-export/src/presentation.ts";
import type { Presentation } from "./import-html.ts";

export interface CardFields {
  workId: string;
  title: string;
  description: string;
  canonicalBase: string;
}

export type CardResult = { ok: true; presentation: Presentation | undefined } | { ok: false; message: string };

export const EMPTY_CARD: CardFields = { workId: "", title: "", description: "", canonicalBase: "" };

/** The panel text for an opened file. A file without a card shows empty fields. */
export function fieldsFromPresentation(presentation: Presentation | undefined): CardFields {
  if (!presentation) return { ...EMPTY_CARD };
  return {
    workId: presentation.workId,
    title: presentation.title,
    description: presentation.description,
    canonicalBase: presentation.canonicalBase ?? "",
  };
}

/** The card the next save writes, or the reason it cannot be written. */
export function presentationFromFields(fields: CardFields, previous: Presentation | undefined): CardResult {
  const workId = fields.workId.trim();
  const title = fields.title.trim();
  const description = fields.description.trim();
  const canonicalBase = fields.canonicalBase.trim().replace(/\/+$/, "");
  if (!workId && !title && !description && !canonicalBase) return { ok: true, presentation: undefined };
  if (!workId || !title || !description) {
    return { ok: false, message: "A sharing card needs a work id, a title, and a description." };
  }
  const next: Record<string, unknown> = { ...(previous ?? {}), workId, title, description };
  if (canonicalBase) next.canonicalBase = canonicalBase;
  else delete next.canonicalBase;
  try {
    return { ok: true, presentation: assertPresentation(next) };
  } catch (error) {
    const raw = error instanceof Error ? error.message.replace(/^project\.presentation\./, "") : "the card is not valid";
    const reason = raw.replace(/^workId\b/, "Work id").replace(/^canonicalBase\b/, "Site address").replace(/^title\b/, "Title").replace(/^description\b/, "Description");
    return { ok: false, message: `Sharing card: ${reason}.` };
  }
}
