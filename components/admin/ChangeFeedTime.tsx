// Phase 6 T6.2 — ChangeFeedTime.
//
// Renders a feed entry's occurredAt as a relative label inside a <time> element
// with the machine-readable ISO preserved in `dateTime`. Reuses the existing
// formatRelative helper (lib/admin/showDisplay.ts) so the relative
// vocabulary ("just now" / "N min ago" / "Nh ago" / "Nd ago") stays consistent
// across the admin surface. Server-rendered with the page's `now` (relative
// output needs no client timezone), but suppressHydrationWarning guards the
// boundary minute that could tick between server render and client hydration.

import { formatRelative } from "@/lib/admin/showDisplay";

export function ChangeFeedTime({ occurredAt, now }: { occurredAt: string; now: Date }) {
  return (
    <time dateTime={occurredAt} suppressHydrationWarning className="text-xs text-text-subtle">
      {formatRelative(occurredAt, now)}
    </time>
  );
}
