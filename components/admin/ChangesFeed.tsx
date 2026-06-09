// Phase 6 T6.6 — ChangesFeed (list + cap/truncation disclosure).
//
// A labelled <section> with an <h2>Changes</h2> and a <ul> mapping the already
// ordered + capped `entries` (readShowChangeFeed / Phase 5 owns order + the cap)
// to <ChangeFeedEntry>. This component does NOT re-sort — it preserves array
// order. It forwards the three thin server actions + `now` to each row.
//
// Cap = 50 (00-overview resolution #8); readShowChangeFeed sets `truncated`. The
// truncation copy names the cap. Both the truncation note and the empty state are
// hard-coded English — they are absence-of-overflow / absence-of-failure states,
// not catalog failure codes (mirrors ParsePanel's empty-state rationale).
"use client";

import { ChangeFeedEntry } from "@/components/admin/ChangeFeedEntry";
import type { Mi11GateActionResult } from "@/components/admin/Mi11GateActions";
import type { FeedEntry } from "@/lib/sync/holds/types";

type GateServerAction = (
  prev: Mi11GateActionResult | null,
  formData: FormData,
) => Mi11GateActionResult | Promise<Mi11GateActionResult>;

export function ChangesFeed({
  entries,
  truncated,
  now,
  undoAction,
  approveAction,
  rejectAction,
}: {
  entries: FeedEntry[];
  truncated: boolean;
  now: Date;
  undoAction: (formData: FormData) => unknown | Promise<unknown>;
  approveAction: GateServerAction;
  rejectAction: GateServerAction;
}) {
  return (
    <section aria-labelledby="admin-changes-feed-heading" className="flex flex-col gap-3">
      <h2 id="admin-changes-feed-heading" className="text-lg font-semibold text-text-strong">
        Changes
      </h2>
      {entries.length === 0 ? (
        <p
          data-testid="change-feed-empty"
          className="rounded-md border border-border bg-surface-sunken p-tile-pad text-sm text-text-subtle"
        >
          No changes yet. Routine sheet edits will appear here as they sync.
        </p>
      ) : (
        <ul aria-labelledby="admin-changes-feed-heading" className="flex flex-col gap-2">
          {entries.map((entry) => (
            <ChangeFeedEntry
              key={entry.id}
              entry={entry}
              now={now}
              undoAction={undoAction}
              approveAction={approveAction}
              rejectAction={rejectAction}
            />
          ))}
        </ul>
      )}
      {truncated ? (
        <p data-testid="change-feed-truncation" className="text-xs text-text-subtle">
          Showing the 50 most recent changes. Older changes not shown.
        </p>
      ) : null}
    </section>
  );
}
