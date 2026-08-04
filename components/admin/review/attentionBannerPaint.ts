/**
 * components/admin/review/attentionBannerPaint.ts
 *
 * The paint decisions `AttentionBanner` makes, in a module with NO React.
 *
 * WHY THEY LIVE HERE. The freshness detector must reach the SAME decisions the
 * banner reaches — the same key cap, the same dropped keys, the same
 * paint-or-fallback call — or it cues cards that did not change. Round 4 got
 * that single-source-of-truth right by exporting them FROM the component, and
 * in doing so quietly made the detector import React, `next/navigation` and
 * four more components, contradicting its own "pure, no React" header.
 *
 * Extracting them keeps both properties at once: one definition, and one fewer
 * component edge on the detector. The component re-imports them, so its
 * behaviour is unchanged by construction.
 *
 * It does not make the detector dependency-free — it still imports render caps
 * from `step3ReviewSections.tsx` — and the header there says so. This removes
 * the edge that was cheap to remove.
 */

/** Keys with real content, in order; `null` when none survive. */
export function usableFailedKeys(keys: string[] | null | undefined): string[] | null {
  if (!Array.isArray(keys)) return null;
  const kept = keys.map((k) => k.trim()).filter((k) => k.length > 0);
  return kept.length > 0 ? kept : null;
}

/** The banner paints at most this many failed keys, then a `+N more` tail. */
export const FAILED_KEYS_CAP = 6;

/** Whether a template still shows text once its emphasis markers are stripped. */
export function hasVisibleText(template: string): boolean {
  return template.replace(/[*_`\s]/g, "").length > 0;
}
