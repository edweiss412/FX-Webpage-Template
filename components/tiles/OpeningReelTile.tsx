/**
 * components/tiles/OpeningReelTile.tsx — M7 Task 7.9 (AC-7.3, AC-7.25).
 *
 * Dedicated tile for the show's opening reel. Carved out of ShowStatusTile
 * (M4 baseline) so:
 *   - the reel has its own visual frame: 16:9 video alongside the
 *     URL-stripped text status, not crammed into a column of reference
 *     rows next to COI / dress code / power / internet,
 *   - the AC-7.25 `[data-testid=opening-reel-tile]` scope guards a single
 *     `<video>` rendering surface, distinct from any future media tile,
 *   - ShowStatusTile keeps its job of surfacing reference fields only.
 *
 * Renders:
 *   - The §10 URL-stripped text status (e.g., "YES", "MAYBE", "LOOP VIDEO").
 *     The strip is mandatory on every render of the cell value — even on
 *     drift (when the 4 pin columns are NULL but the cell still carries a
 *     URL substring), the stripped text is what crew sees. Crew DOM MUST
 *     NOT contain `https://` or `drive.google.com` for this cell ever.
 *   - The inline `<video src="/api/asset/reel/<show>">` element when AND
 *     ONLY WHEN `hasVideo` is true. The boolean is derived in
 *     `lib/data/openingReel.ts:projectOpeningReelHasVideo` from all four
 *     persisted pin columns; the four raw pin columns stay server-internal
 *     so the crew DOM never carries the Drive file id.
 *
 * Whole-tile-missing per §8.3: when there is no stripped text AND no video
 * to show, the component returns `null` and the tile-grid reflows around
 * the empty cell.
 *
 * Server Component (no `'use client'`).
 */
import { Section } from "@/components/atoms/Section";
import { shouldHideOpeningReel } from "@/lib/visibility/emptyState";
import { stripOpeningReelText } from "@/lib/visibility/openingReelText";

type OpeningReelTileProps = {
  /** Show id used to build `/api/asset/reel/<show>`. Bare UUID. */
  showId: string;
  /**
   * `shows.event_details` map. Carries `opening_reel` when populated.
   * Same projection shape the rest of the crew page receives.
   */
  eventDetails: Record<string, string> | null | undefined;
  /**
   * Live gate for the inline `<video>` element. True iff all 4
   * `shows.opening_reel_*` pin columns are non-NULL AND mime is video.
   * `lib/data/openingReel.ts:projectOpeningReelHasVideo` is the only
   * derivation site; crew DOM never sees the four columns.
   */
  hasVideo: boolean;
};

export function OpeningReelTile({ showId, eventDetails, hasVideo }: OpeningReelTileProps) {
  const raw = eventDetails?.["opening_reel"] ?? null;
  const hidden = shouldHideOpeningReel(raw);
  const stripped = hidden ? "" : stripOpeningReelText(raw);
  const hasText = stripped.length > 0;

  // Whole-tile-missing (§8.3): no text AND no video to play → render
  // nothing, let the grid reflow.
  if (!hasText && !hasVideo) return null;

  return (
    <Section
      testId="opening-reel-tile"
      heading="Opening reel"
      headingTone="eyebrow"
      variant="primary"
      ariaLabel="Opening reel"
      bodyAs="div"
    >
      {hasVideo ? (
        // 16:9 media frame. The native `controls` chrome carries play /
        // pause / scrub / fullscreen — "earned familiarity" per product
        // register; custom video chrome would just reinvent worse.
        // `preload="metadata"` keeps initial bandwidth small on mobile.
        // `playsInline` lets iOS play inline rather than commandeering
        // fullscreen. No autoplay — crew opts in by tapping play.
        <div className="overflow-hidden rounded-sm bg-surface-sunken">
          <video
            className="block aspect-video w-full"
            controls
            preload="metadata"
            playsInline
            src={`/api/asset/reel/${showId}`}
          >
            {/* Fallback text inside <video> renders only if the browser
                cannot play the element at all; the route returns 410 +
                no body when the pin tuple is invalid, and the tile gates
                on `hasVideo` so this fallback is a defensive belt. */}
            Your browser can&apos;t play this video. Try opening the page in
            Safari or Chrome.
          </video>
        </div>
      ) : null}
      {hasText ? (
        // Inner `opening-reel` testid preserves M4 AC-4.5 e2e scoping
        // (`tests/e2e/empty-state.spec.ts`). The outer `opening-reel-tile`
        // scope is the AC-7.25 contract.
        <div data-testid="opening-reel" className="flex flex-col gap-1">
          <dt className="text-xs font-medium uppercase tracking-[0.12em] text-text-faint">
            Status
          </dt>
          <dd className="text-sm/snug font-medium text-text">{stripped}</dd>
        </div>
      ) : null}
    </Section>
  );
}
