// lib/admin/warningsPanelStatus.ts
//
// The published Parse-warnings panel's live-region sentence: a pure function
// of the full count tuple so EVERY ignore/un-ignore transition changes the
// text (spec 2026-07-22-warning-panel-polish §3.2 — a routed warn row's
// ignore never changes the listed count, so listed alone is not enough).
export function warningsPanelStatusSentence(
  listed: number,
  here: number,
  elsewhere: number,
): string {
  // Input contract: counts are lengths, so nonnegative finite integers.
  // Defensive normalization: anything else (NaN, negative, Infinity, float)
  // collapses to the floor of a nonnegative finite value, else 0 — the
  // sentence must never render "NaN warnings".
  const norm = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  listed = norm(listed);
  here = norm(here);
  elsewhere = norm(elsewhere);
  const parts: string[] = [];
  if (listed > 0) parts.push(listed === 1 ? "1 warning listed." : `${listed} warnings listed.`);
  if (here > 0) {
    parts.push(here === 1 ? "1 warning needs a look below." : `${here} warnings need a look below.`);
  }
  if (elsewhere > 0) {
    parts.push(
      elsewhere === 1
        ? "1 warning needs a look in its own section."
        : `${elsewhere} warnings need a look in their own sections.`,
    );
  }
  return parts.length > 0 ? parts.join(" ") : "Nothing needs a look on this sheet.";
}
