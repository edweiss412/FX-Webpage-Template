/**
 * components/tiles/OpeningReelVideo.tsx — M7 Task 7.9 (R25 P1 close-out).
 *
 * Renders the inline `<video src="/api/asset/reel/<show>">` element with
 * an `onError` handler that swaps to the AC-7.21 placeholder when the
 * route returns 410 (runtime drift) or any other media-loading error.
 *
 * Why a client component:
 *   AC-7.21 specifies "drift detected → 410 + placeholder." The page's
 *   `hasVideo` projection is derived from persisted pin columns at
 *   server-render time; it cannot reflect drift that happens AFTER
 *   the page is rendered but BEFORE the video loads (operator edits
 *   the Drive file between Apply and crew load). Without an onError
 *   fallback, the `<video>` element renders against a 410 response
 *   and shows the browser's native broken-media chrome — not the
 *   placeholder AC-7.21 promises.
 *
 * The server component (`OpeningReelTile`) still gates on `hasVideo`
 * so the whole tile is suppressed when pin columns are NULL. This
 * client component only handles the post-render drift case.
 */
"use client";

import { useState } from "react";

type OpeningReelVideoProps = {
  showId: string;
};

export function OpeningReelVideo({ showId }: OpeningReelVideoProps) {
  const [hasMediaError, setHasMediaError] = useState(false);

  if (hasMediaError) {
    return (
      <div
        data-testid="opening-reel-placeholder"
        className="flex aspect-video w-full items-center justify-center rounded-sm bg-surface-sunken px-4 text-center text-sm text-text-faint"
      >
        Opening reel can&apos;t be played right now.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-sm bg-surface-sunken">
      <video
        data-testid="opening-reel-video"
        className="block aspect-video w-full"
        controls
        preload="metadata"
        playsInline
        src={`/api/asset/reel/${showId}`}
        onError={() => setHasMediaError(true)}
      >
        Your browser can&apos;t play this video. Try opening the page in Safari or Chrome.
      </video>
    </div>
  );
}
