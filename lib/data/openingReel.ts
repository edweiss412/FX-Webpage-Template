/**
 * lib/data/openingReel.ts — projection helper for the inline-`<video>` gate
 * on the crew page (M7 Task 7.9, AC-7.3 + AC-7.25).
 *
 * AC-7.25 is the four-case URL-strip render contract. The crew page emits
 * `<video src="/api/asset/reel/<show>">` ONLY when ALL FOUR
 * `shows.opening_reel_*` pin columns are non-NULL AND the persisted MIME
 * is video. Any partial-pin or non-video MIME means the page knows not to
 * hit the route at all — drift falls back to text-only at the page layer,
 * not at the route layer. This matches AC-7.24's "page should not call the
 * route when columns are NULL" requirement.
 */
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
      row.opening_reel_mime_type?.startsWith("video/"),
  );
}
