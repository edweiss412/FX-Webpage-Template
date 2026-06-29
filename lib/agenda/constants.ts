/** Single source of truth for agenda-extraction magic numbers (spec §4.4). */
export const AGENDA_CONFIDENCE = {
  minSessions: 5,
  minTimeAnchorParsePct: 0.95,
  minTitlePct: 0.8,
  minRoomPct: 0.75,
} as const;
/** §4.3.2 end-repair plausibility cap (minutes). Longest real session ~80min. */
export const AGENDA_MAX_SESSION_MIN = 240;
/**
 * Bumped on ANY extraction/inference/repair/gate logic change; part of the §4.5.2 cache key.
 *
 * v1 → v2 (2026-06-29): invalidate every cached v1 extraction so the serverless pdfjs-worker
 * fix (#184), the `a.m./p.m.` meridiem parse (#185), and the bare-morning AM→PM ambiguous-first
 * relaxation (#186) re-extract on the next cron sync / admin dialog-open. The crew/admin RENDER
 * path is version-agnostic (`normalizeAgendaExtraction` accepts any numeric `extractorVersion`),
 * so already-published shows keep rendering their stored extraction until re-extraction replaces
 * it — no interim regression; a v1 show simply improves on its next sync.
 */
export const EXTRACTOR_VERSION = 2;

export const AGENDA_PDF_MAX_BYTES = 25 * 1024 * 1024;
export const AGENDA_MAX_PAGES = 80;
export const AGENDA_MAX_PDFS_PER_SHEET = 6;
export const AGENDA_ADMIN_SESSIONS_CAP = 8;
export const AGENDA_ADMIN_TRACKS_PER_SESSION_CAP = 6;
export const AGENDA_CLIENT_CONCURRENCY = 3;
export const AGENDA_CLIENT_POLL_BUDGET_MS = 330_000; // one extraction window + margin
export const AGENDA_CLIENT_QUEUE_BUDGET_MS = 900_000; // queue wait behind the global cap
export const AGENDA_MAX_CONCURRENT_EXTRACTIONS = 4; // per warm instance
export const AGENDA_GLOBAL_MAX_CONCURRENT_EXTRACTIONS = 8; // deployment-wide (live-lease count)
export const AGENDA_EXTRACT_LEASE_TTL_MS = 330_000;
export const AGENDA_PDF_DEADLINE_MS = 120_000;
export const AGENDA_EXTRACT_DEADLINE_MS = 250_000; // < maxDuration (300s)
