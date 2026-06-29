/**
 * lib/agenda/agendaAdminPreview.ts — pure render-shape builder for the admin
 * Step-3 agenda card (spec §5.4).
 *
 * PURITY CONSTRAINT: no `server-only`, `next/headers`, `fs`, `googleapis`, or
 * any `lib/drive/*` import. This module is safe to bundle into a `"use client"`
 * card.
 *
 * A link renders a `block` iff:
 *   (1) its ordinal (array index) is in `opts.freshByLinkKey`, AND
 *   (2) `normalizeAgendaExtraction(link.extracted)` returns a high-confidence,
 *       non-empty-days payload.
 *
 * The builder NEVER reads `extractorVersion` or `sourceRevision` to gate a
 * block — freshness is entirely the caller's responsibility via the Set.
 */
import type { AgendaExtraction, AgendaDay, AgendaSession } from "@/lib/agenda/types";
import { agendaDisplayLabel } from "@/lib/agenda/agendaLabel";
import { normalizeAgendaExtraction } from "@/lib/agenda/normalizeAgendaExtraction";
import {
  AGENDA_MAX_PDFS_PER_SHEET,
  AGENDA_ADMIN_SESSIONS_CAP,
  AGENDA_ADMIN_TRACKS_PER_SESSION_CAP,
} from "@/lib/agenda/constants";

type AgendaLink = {
  label: string;
  fileId?: string;
  url?: string;
  /** Raw jsonb from the DB — narrowed by normalizeAgendaExtraction at render time. */
  extracted?: unknown;
};

export type AdminAgendaItem = {
  label: string;
  badge: string | null;
  href: string | null;
  block: {
    extraction: AgendaExtraction;
    droppedSessions: number;
    droppedDays: number;
    droppedTracks: number;
  } | null;
};

/**
 * Returns the canonical public Drive href for a link, or null when no valid
 * URL is available.
 *
 * Priority:
 *   1. Non-empty `fileId` → `https://drive.google.com/file/d/<fileId>/view`
 *   2. `url` with an http(s) scheme → `url` as-is
 *   3. Otherwise → null
 */
export function agendaPdfHref(link: { fileId?: string; url?: string }): string | null {
  if (link.fileId && link.fileId.length > 0) {
    return `https://drive.google.com/file/d/${link.fileId}/view`;
  }
  if (link.url && /^https?:\/\//i.test(link.url)) {
    return link.url;
  }
  return null;
}

type CapResult = {
  extraction: AgendaExtraction;
  droppedSessions: number;
  droppedDays: number;
  droppedTracks: number;
};

/**
 * Enforce admin display caps on a normalized high-confidence extraction.
 *
 * - Total sessions across all days capped at `AGENDA_ADMIN_SESSIONS_CAP` (8).
 * - Tracks per session capped at `AGENDA_ADMIN_TRACKS_PER_SESSION_CAP` (6).
 *
 * Returns the capped extraction alongside drop counts so the UI can render
 * "… and N more sessions" overflow notes.
 */
export function capExtractionForAdmin(ext: AgendaExtraction): CapResult {
  let droppedSessions = 0;
  let droppedDays = 0;
  let droppedTracks = 0;
  let remaining = AGENDA_ADMIN_SESSIONS_CAP;
  const cappedDays: AgendaDay[] = [];

  for (const day of ext.days) {
    if (remaining <= 0) {
      // Budget exhausted — drop the entire day.
      droppedSessions += day.sessions.length;
      droppedDays++;
      continue;
    }

    const keptSessions: AgendaSession[] = [];
    for (const session of day.sessions) {
      if (remaining <= 0) {
        droppedSessions++;
        continue;
      }
      const excessTracks = Math.max(0, session.tracks.length - AGENDA_ADMIN_TRACKS_PER_SESSION_CAP);
      droppedTracks += excessTracks;
      keptSessions.push({
        ...session,
        tracks: session.tracks.slice(0, AGENDA_ADMIN_TRACKS_PER_SESSION_CAP),
      });
      remaining--;
    }

    if (keptSessions.length === 0) {
      // All sessions in this day consumed the budget or were skipped.
      droppedDays++;
    } else {
      cappedDays.push({ ...day, sessions: keptSessions });
    }
  }

  return {
    extraction: { ...ext, days: cappedDays },
    droppedSessions,
    droppedDays,
    droppedTracks,
  };
}

/**
 * Build the admin Step-3 card render shape from raw agenda links.
 *
 * @param links   Raw `show.agenda_links` from the DB/parser (0-based ordinals).
 * @param opts    freshByLinkKey — Set of ordinals whose PDF Drive revision was
 *                verified fresh by the caller (sync step). Only ordinals present
 *                in this Set may produce a `block`. Absent → all note-only.
 *                validatedHrefs — when true, `href` is populated via
 *                `agendaPdfHref`; otherwise `href` is null for every item.
 */
export function buildAdminAgendaPreview(
  links: AgendaLink[],
  opts?: { freshByLinkKey?: Set<number>; validatedHrefs?: boolean },
): AdminAgendaItem[] {
  const visible = links.slice(0, AGENDA_MAX_PDFS_PER_SHEET);
  const showBadge = visible.length > 1;

  return visible.map((link, i) => {
    const badge = showBadge ? agendaDisplayLabel(link.label) : null;
    const href = opts?.validatedHrefs ? agendaPdfHref(link) : null;

    let block: AdminAgendaItem["block"] = null;
    if (opts?.freshByLinkKey?.has(i)) {
      const normalized = normalizeAgendaExtraction(link.extracted);
      if (normalized !== null && normalized.confidence === "high" && normalized.days.length > 0) {
        block = capExtractionForAdmin(normalized);
      }
    }

    return { label: link.label, badge, href, block };
  });
}
