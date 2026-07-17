"use client";

/**
 * components/admin/showpage/ChangesSection.tsx (consolidated-admin-show-page spec §5.4)
 *
 * The LAST rail section of the consolidated admin show page. `ChangesFeed` relocated, NOT
 * redesigned (spec §5.4). Presentation-only: the feed arrives as a prop — the server page
 * calls `readShowChangeFeed` ONCE (Task 13) and passes the result down; this component fetches
 * nothing and defines no server actions (it only forwards the ones it is handed).
 *
 * RSC boundary: rendered inside the CLIENT `ShowReviewSurface` via an extra-section `render()`
 * closure, so it is a client component; `ChangesFeed`'s server actions arrive as props.
 *
 * Guard / mode boundary (invariant 9, mirroring the current page's SyncInfraError degrade):
 *   - `feed === null` (the page's `feedInfraError || feed === null` branch) → a calm infra-error
 *     notice, NEVER a raw §12.4 code (invariant 5) and never a silent empty panel.
 *   - `feed.entries` empty → `ChangesFeed`'s own affirmative empty state.
 *
 * The `#changes` wrapper anchor is the spec §10 hash deep-link target.
 */

import { ChangesFeed } from "@/components/admin/ChangesFeed";
import type { FeedEntry } from "@/lib/sync/holds/types";

// Forward the feed's server-action prop types verbatim (undo, accept, and gate results differ
// — accept carries a `count`), so a change to any ChangesFeed action signature surfaces here.
type ChangesFeedProps = Parameters<typeof ChangesFeed>[0];

export type ChangesSectionProps = {
  /** The server-fetched feed, or `null` when the read faulted (SyncInfraError degrade). */
  feed: { entries: FeedEntry[]; truncated: boolean } | null;
  /** Server "now" for deterministic relative time formatting. */
  now: Date;
  /** `shows.id` — passed through to the feed's undo/accept hidden fields. */
  showId: string;
  undoAction: ChangesFeedProps["undoAction"];
  acceptAction: ChangesFeedProps["acceptAction"];
  acceptAllAction: ChangesFeedProps["acceptAllAction"];
  approveAction: ChangesFeedProps["approveAction"];
  rejectAction: ChangesFeedProps["rejectAction"];
};

export function ChangesSection({
  feed,
  now,
  showId,
  undoAction,
  acceptAction,
  acceptAllAction,
  approveAction,
  rejectAction,
}: ChangesSectionProps) {
  return (
    <section
      id="changes"
      data-testid="changes-section"
      aria-label="Changes"
      className="flex scroll-mt-4 flex-col gap-3"
    >
      {feed === null ? (
        <>
          <h2 className="text-lg font-semibold text-text-strong">Changes</h2>
          <p
            data-testid="change-feed-infra-error"
            className="rounded-md border border-border bg-surface-sunken p-tile-pad text-sm text-text-subtle"
          >
            We couldn&rsquo;t load this show&rsquo;s changes right now. Refresh to try again.
          </p>
        </>
      ) : (
        <ChangesFeed
          entries={feed.entries}
          truncated={feed.truncated}
          now={now}
          showId={showId}
          undoAction={undoAction}
          acceptAction={acceptAction}
          acceptAllAction={acceptAllAction}
          approveAction={approveAction}
          rejectAction={rejectAction}
        />
      )}
    </section>
  );
}
