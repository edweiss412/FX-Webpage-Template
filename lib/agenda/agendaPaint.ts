/**
 * lib/agenda/agendaPaint.ts — the pure derivations the agenda UI paints.
 *
 * Both functions here were module-private inside the components that render
 * them. They moved out for one reason: the published-review freshness detector
 * (`components/admin/review/sectionFreshness.ts`) must hash what the renderer
 * PAINTS, and a detector that re-types a derivation is a second source of truth
 * that drifts. It cannot import a `.tsx` either, so the shared derivation lives
 * in a React-free module both sides import — the same shape as
 * `components/admin/review/attentionBannerPaint.ts`.
 *
 * Nothing here touches React, the DOM, or the network; it is display-string
 * arithmetic over an already-validated model.
 */
import type { AdminAgendaItem } from "@/lib/agenda/agendaAdminPreview";

/**
 * The one-line "Adjusted from …" note under a drifted session.
 *
 * Only the `source:` capture survives into the DOM, so two different raw drift
 * strings naming the same source paint the SAME sentence. Moved verbatim from
 * `components/crew/AgendaScheduleBlock.tsx`.
 */
export function driftNote(drift: string): string {
  const src = drift.match(/source:\s*([^)]+)\)/)?.[1]?.trim();
  return src ? `Adjusted from ${src}` : "Adjusted from the sheet";
}

/**
 * The "…and N more" lines under a capped admin agenda item. Derived purely from
 * the three drop counts, so those counts reach the screen ONLY through these
 * strings. Moved verbatim from `components/admin/wizard/step3ReviewSections.tsx`.
 */
export function agendaOverflowNotes(block: NonNullable<AdminAgendaItem["block"]>): string[] {
  const notes: string[] = [];
  if (block.droppedSessions > 0) notes.push(`…and ${block.droppedSessions} more sessions`);
  if (block.droppedDays > 0) notes.push(`…and ${block.droppedDays} more days`);
  if (block.droppedTracks > 0) notes.push(`…and ${block.droppedTracks} more tracks`);
  return notes;
}
