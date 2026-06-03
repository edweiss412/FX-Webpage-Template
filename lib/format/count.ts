/**
 * lib/format/count.ts — bounded count display helper (M12.2 RECON-1, spec §3.1).
 *
 * Visual cap so the banner's count badge and "+N more" link have a bounded
 * glyph width (keeps the §3.3 fit-content(55%)/non-overlap contract at 390px
 * regardless of queue size). EXACT counts are still exposed to assistive tech
 * via aria-label / sr-only (spec §8 F14/F16) — this is a VISUAL cap only.
 *
 * Server-safe pure function. Defensive: clamps non-finite/negative to 0.
 */
export function formatBoundedCount(n: number): string {
  if (!Number.isFinite(n)) return n === Number.POSITIVE_INFINITY ? "99+" : "0";
  const v = Math.max(0, Math.floor(n));
  return v < 100 ? String(v) : "99+";
}
