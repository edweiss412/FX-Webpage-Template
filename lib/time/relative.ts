export function formatRelative(timestamp: Date | string, now: Date = new Date()): string {
  const t = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  const diffMs = now.getTime() - t.getTime();
  if (diffMs < 60_000) return "just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return `${hours} hr`;
  const days = Math.floor(diffMs / 86_400_000);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Relative-day chip label for the /me page "Next up" anchor (M9 C3 / M5-D1)
 * per shape brief 2026-05-14-auth-flow-polish.md §5.1.
 *
 * Returns the literal chip label only — the caller wraps with chip-tone
 * styling (accent for Today/Tomorrow, info for In N days, text-subtle for
 * Ended). Inputs are ISO YYYY-MM-DD date strings; the caller is
 * responsible for resolving the show's display date in its venue
 * timezone before calling. Day math is computed in UTC (both inputs
 * normalized to UTC midnight) so identical ISO inputs produce identical
 * chips regardless of the wall-clock execution time.
 */
export function relativeDayChip(iso: string, now: Date = new Date()): string {
  const target = new Date(`${iso}T00:00:00Z`);
  const todayIso = now.toISOString().slice(0, 10);
  const todayUtc = new Date(`${todayIso}T00:00:00Z`);
  const deltaDays = Math.round((target.getTime() - todayUtc.getTime()) / 86_400_000);

  if (deltaDays === 0) return "Today";
  if (deltaDays === 1) return "Tomorrow";
  if (deltaDays >= 2 && deltaDays <= 13) return `In ${deltaDays} days`;
  if (deltaDays >= 14) return `In ${Math.round(deltaDays / 7)} weeks`;
  // Past branch: deltaDays < 0.
  const absDays = Math.abs(deltaDays);
  if (absDays === 1) return "Ended";
  if (absDays >= 2 && absDays <= 13) return `Ended ${absDays} days ago`;
  return `Ended ${Math.round(absDays / 7)} weeks ago`;
}
