/**
 * lib/data/openingReel.ts — projection helper + shared MIME allowlist
 * for the inline-`<video>` gate on the crew page (M7 Task 7.9,
 * AC-7.3 + AC-7.25; Codex R10 P2 — unified MIME allowlist).
 *
 * AC-7.25 is the four-case URL-strip render contract. The crew page emits
 * `<video src="/api/asset/reel/<show>">` ONLY when ALL FOUR
 * `shows.opening_reel_*` pin columns are non-NULL AND the persisted MIME
 * is on the explicit allowlist of inert browser-supported video types.
 * Any partial-pin or non-allowlisted MIME means the page knows not to
 * hit the route at all — drift falls back to text-only at the page
 * layer, not at the route layer.
 *
 * The allowlist is exported AND consumed by `app/api/asset/reel/[show]/
 * route.ts` so the page projection and the route can never drift on
 * which MIMEs are renderable. Without the unification, a persisted
 * `video/x-flv` pin would make the page emit a `<video>` element while
 * the route returns 410 → broken player with no admin warning.
 */

/**
 * Inert browser-supported video MIME types. The page projection AND the
 * reel asset route MUST use this set for eligibility checks. New types
 * are added here ONCE; both consumers update on the next build.
 */
export const ALLOWED_REEL_MIMES: ReadonlySet<string> = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/ogg",
]);

export function isAllowedReelMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  return ALLOWED_REEL_MIMES.has(mime.toLowerCase());
}

export type OpeningReelPinRow = {
  opening_reel_drive_file_id: string | null;
  opening_reel_drive_modified_time: string | null;
  opening_reel_head_revision_id: string | null;
  opening_reel_mime_type: string | null;
};

export function projectOpeningReelHasVideo(row: OpeningReelPinRow): boolean {
  return Boolean(
    row.opening_reel_drive_file_id &&
      row.opening_reel_drive_modified_time &&
      row.opening_reel_head_revision_id &&
      isAllowedReelMime(row.opening_reel_mime_type),
  );
}
