/**
 * tests/lib/time/raisedAt.test.ts — relative-time helper for the
 * AlertBanner raised_at row (M9 C4 / M5-D3) per shape brief
 * 2026-05-14-alert-banner.md §5.2 + §8 content table.
 *
 * Format buckets (verbatim from brief):
 *   <1 min          → "just now"
 *   1-59 min        → "N minutes ago"  (singular "1 minute ago")
 *   1-23 hours      → "N hours ago"    (singular "1 hour ago")
 *   1-7 days        → "N days ago"     (singular "1 day ago")
 *   >7 days         → "on <Mon D>"     (e.g., "on Apr 14")
 *
 * The component wraps "Raised " around the returned suffix —
 * this helper returns the relative chunk only so the caller can
 * compose "Raised " + suffix consistently (eyebrow / aria-label).
 *
 * All math runs in UTC for deterministic test stability.
 */
import { describe, expect, it } from "vitest";

import { raisedAtSuffix } from "@/lib/time/raisedAt";

const now = new Date(Date.UTC(2026, 4, 15, 12, 0, 0)); // May 15 2026 12:00 UTC

function isoMinutesAgo(min: number): string {
  return new Date(now.getTime() - min * 60_000).toISOString();
}
function isoHoursAgo(hours: number): string {
  return new Date(now.getTime() - hours * 60 * 60_000).toISOString();
}
function isoDaysAgo(days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60_000).toISOString();
}

describe("raisedAtSuffix", () => {
  it("'just now' for <60 seconds ago", () => {
    expect(raisedAtSuffix(new Date(now.getTime() - 30_000).toISOString(), now)).toBe("just now");
    expect(raisedAtSuffix(new Date(now.getTime() - 59_000).toISOString(), now)).toBe("just now");
  });

  it("singular '1 minute ago' for exactly 60-119 seconds", () => {
    expect(raisedAtSuffix(isoMinutesAgo(1), now)).toBe("1 minute ago");
  });

  it("plural 'N minutes ago' for 2-59 minutes", () => {
    expect(raisedAtSuffix(isoMinutesAgo(14), now)).toBe("14 minutes ago");
    expect(raisedAtSuffix(isoMinutesAgo(59), now)).toBe("59 minutes ago");
  });

  it("singular '1 hour ago' for 1 hour", () => {
    expect(raisedAtSuffix(isoHoursAgo(1), now)).toBe("1 hour ago");
  });

  it("plural 'N hours ago' for 2-23 hours", () => {
    expect(raisedAtSuffix(isoHoursAgo(2), now)).toBe("2 hours ago");
    expect(raisedAtSuffix(isoHoursAgo(23), now)).toBe("23 hours ago");
  });

  it("singular '1 day ago' for 1 day", () => {
    expect(raisedAtSuffix(isoDaysAgo(1), now)).toBe("1 day ago");
  });

  it("plural 'N days ago' for 2-7 days", () => {
    expect(raisedAtSuffix(isoDaysAgo(2), now)).toBe("2 days ago");
    expect(raisedAtSuffix(isoDaysAgo(7), now)).toBe("7 days ago");
  });

  it("'on <Mon D>' for >7 days ago", () => {
    expect(raisedAtSuffix(isoDaysAgo(8), now)).toBe("on May 7");
    expect(raisedAtSuffix(isoDaysAgo(31), now)).toBe("on Apr 14");
  });

  it("C4 R2: 7-day boundary — exactly 7d renders relative, 7d+1s renders absolute", () => {
    // Brief §8: >7 days → "on <Mon D>". Exactly 7d is the last bucket
    // boundary for the relative form; 7d + 1 second must already be
    // absolute. Pre-fix code (`days <= 7` after Math.floor) kept the
    // relative bucket for almost a full extra day.
    expect(raisedAtSuffix(isoDaysAgo(7), now)).toBe("7 days ago");
    const sevenDaysOneSec = new Date(now.getTime() - (7 * 24 * 60 * 60 + 1) * 1000).toISOString();
    expect(raisedAtSuffix(sevenDaysOneSec, now)).toMatch(/^on /);
  });

  it("'on <Mon D>' uses UTC for stable cross-server output", () => {
    // Same-day-different-zone: a US/Pacific noon ISO would be Apr 15
    // 19:00 UTC. From now=May 15 12:00 UTC, that's 30 days ago.
    expect(raisedAtSuffix("2026-04-15T19:00:00Z", now)).toBe("on Apr 15");
  });

  it("clamps future timestamps to 'just now' (defensive against clock skew)", () => {
    const future = new Date(now.getTime() + 60_000).toISOString();
    expect(raisedAtSuffix(future, now)).toBe("just now");
  });
});
