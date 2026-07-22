import type { NeedsLookCode } from "@/lib/adminAlerts/audience";

/**
 * One-line fix hints for the "needs a look" attention-menu rows
 * (spec 2026-07-21-attention-needs-attention-split §5).
 *
 * Typed-total over NeedsLookCode: a missing or mis-keyed entry is a COMPILE
 * error, not a blank second line at runtime. Content emptiness is guarded by
 * tests/admin/needsLookHints.test.ts. Human copy only — no raw codes, no
 * em-dashes (project copy rule), no untrusted interpolation.
 */
export const NEEDS_LOOK_HINTS: Record<NeedsLookCode, string> = {
  SHEET_UNAVAILABLE: "Re-share the sheet with the service account.",
  OPENING_REEL_NOT_VIDEO: "Replace the reel link with a video URL.",
  OPENING_REEL_PERMISSION_DENIED: "Re-share the video, or replace the link.",
  REEL_DRIFTED: "Re-save the sheet to re-stage it.",
  EMBEDDED_ASSET_DRIFTED: "Re-save the sheet to re-stage it.",
  EMBEDDED_RECOVERY_REQUIRES_RESTAGE: "Re-save the sheet to recover the diagram.",
  PARSE_ERROR_LAST_GOOD: "Fix the sheet, crew keep the last good version.",
  RESYNC_QUALITY_REGRESSED: "Fix the sheet to restore data quality.",
  RESYNC_SHRINK_HELD: "Review, then re-sync or fix the sheet.",
  SHOW_UNPUBLISHED: "Turn Published back on when ready.",
  USE_RAW_DECISION_STALE: "Re-choose raw text if you still want it.",
  ASSET_RECOVERY_BYTES_EXCEEDED: "Trim the gallery under 60 images / 50MB / 3GB.",
};
