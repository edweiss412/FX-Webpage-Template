/**
 * components/crew/agendaScheduleRows.ts — the structured-agenda render gate and
 * line text, shared by `AgendaScheduleBlock` and the Agenda search builder
 * (spec §2.4: the component and the builder call the same derivation), and the
 * file gate the Agenda section's membership and empty state read.
 *
 * React-free and client-safe on purpose: `AgendaScheduleBlock` is bundled into
 * the admin Step 3 `"use client"` card too (tests/agenda/agendaPurityBoundary.test.ts),
 * so this module imports nothing server-only.
 */
import { normalizeAgendaExtraction } from "@/lib/agenda/normalizeAgendaExtraction";
import type { AgendaExtraction, AgendaSession } from "@/lib/agenda/types";

type AgendaLinkLike = { readonly fileId?: string | null };

/**
 * Whether the Agenda section has anything to show: a link carrying a Drive file
 * id, which is what `AgendaEmbed` draws a "View agenda" button for and what an
 * extraction is read from. A url-only link renders nothing. The one content rule
 * crew membership adds to entitlement (crew page redesign spec line 240, PR B
 * plan decision 1), and the Agenda section's empty-state test, so the list and
 * the section can never disagree about it. A partial projection with no array
 * reads as no agenda.
 */
export function hasAgendaFile(links: readonly AgendaLinkLike[] | null | undefined): boolean {
  return Array.isArray(links) && links.some((link) => Boolean(link.fileId));
}

/**
 * The §4.7 gate: the structured schedule renders ONLY for a high-confidence
 * extraction that actually has days. Everything else is embed-only (null).
 */
export function structuredAgenda(extraction: unknown): AgendaExtraction | null {
  const data = normalizeAgendaExtraction(extraction);
  if (!data || data.confidence !== "high" || data.days.length === 0) return null;
  return data;
}

/**
 * A session's title and room as the block renders them in one paragraph:
 * `title · room`, either part alone, or "" when both are null (no paragraph).
 */
export function agendaSessionLine(session: Pick<AgendaSession, "title" | "room">): string {
  if (session.title !== null && session.room !== null) return `${session.title} · ${session.room}`;
  return session.title ?? session.room ?? "";
}

/** A breakout track's line as the block renders it: `label · title · room`, absent parts dropped. */
export function agendaTrackLine(track: AgendaSession["tracks"][number]): string {
  return [track.label, track.title, track.room].filter((p): p is string => p !== null).join(" · ");
}

/**
 * Search target ids for one block, in the block's own order (lib/search/entryId.ts):
 * the document label, then per day its summary and each session. A missing id
 * renders no target. Absent as a whole (the admin preview) renders no search markers.
 */
export type AgendaBlockSearch = {
  docLabel?: string;
  days: readonly { summary?: string; sessions: readonly (string | undefined)[] }[];
};
