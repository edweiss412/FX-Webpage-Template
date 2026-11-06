/**
 * components/crew/sections/sectionLines.ts — one search entry per rendered line of
 * a section's card, shared by the sections' rows files (`eventRows.ts`,
 * `packListRows.ts`, `roomsRows.ts`), so they spell a line one way (spec §2.4, INV-1).
 *
 * No `"use client"`: the builders run on the server.
 */
import type { SectionId } from "@/lib/crew/resolveActiveSection";
import { entryId } from "@/lib/search/entryId";
import { normalize } from "@/lib/search/normalize";
import type { SearchEntry } from "@/lib/search/types";

/** The per-index counter `entryId` keeps, one per rows derivation. */
export type Seen = Map<string, number>;

const tokens = (s: string) =>
  normalize(s)
    .map((t) => t.text)
    .join(" ");

/**
 * One search entry for one rendered line of a card, or null when the line's value
 * is blank (the page renders no target for it). A label that equals its group is
 * stored as null (spec §3) and kept as context, so the rendered label text is
 * still carried by the entry (INV-1 clause 3).
 */
export function searchLine(
  section: SectionId,
  region: string,
  group: string,
  label: string | null,
  value: string,
  context: readonly (string | null | undefined)[],
  seen: Seen,
): SearchEntry | null {
  if (value.trim().length === 0) return null;
  const ctx = context.filter((c): c is string => typeof c === "string" && c.trim().length > 0);
  let lab = label !== null && label.trim().length > 0 ? label : null;
  if (lab !== null && tokens(lab) === tokens(group)) {
    ctx.unshift(lab);
    lab = null;
  }
  return {
    id: entryId(section, region, group, lab, value, seen),
    section,
    group,
    label: lab,
    value,
    context: ctx,
    copy: null,
  };
}
