/** Single source of truth for agenda-extraction magic numbers (spec §4.4). */
export const AGENDA_CONFIDENCE = {
  minSessions: 5,
  minTimeAnchorParsePct: 0.95,
  minTitlePct: 0.8,
  minRoomPct: 0.75,
} as const;
/** §4.3.2 end-repair plausibility cap (minutes). Longest real session ~80min. */
export const AGENDA_MAX_SESSION_MIN = 240;
/** Bumped on ANY extraction/inference/repair/gate logic change; part of the §4.5.2 cache key. */
export const EXTRACTOR_VERSION = 1;
