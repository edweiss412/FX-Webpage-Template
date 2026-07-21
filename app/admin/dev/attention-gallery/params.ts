/**
 * app/admin/dev/attention-gallery/params.ts
 * (spec 2026-07-20-attention-scenario-gallery §4.5)
 *
 * Query-parameter parsing for the gallery, kept out of `page.tsx` because Next
 * 16 allows only recognized route exports from a page module — a named export
 * there is a build error, not a lint nit.
 *
 * `w` reaches an inline `style`, so it is digits-only and range-clamped here.
 * Everything else — signs, decimals, exponents, "12px", full-width digits —
 * falls back to absence rather than producing "NaNpx" in the DOM.
 */
export type GalleryParams = {
  tier: 1 | 2 | 3 | null;
  scenarioId: string | null;
  maxWidthPx: number | null;
};

/** The rendered block's clamp range: narrow phone through desktop modal width. */
export const MIN_WIDTH_PX = 320;
export const MAX_WIDTH_PX = 1280;

function first(v: string | string[] | undefined): string | null {
  if (v === undefined) return null;
  if (Array.isArray(v)) return v.length === 0 ? null : (v[0] ?? null);
  return v;
}

export function parseGalleryParams(
  sp: Record<string, string | string[] | undefined>,
): GalleryParams {
  const rawTier = first(sp.tier)?.trim() ?? "";
  const tier = rawTier === "1" ? 1 : rawTier === "2" ? 2 : rawTier === "3" ? 3 : null;

  const rawScenario = first(sp.scenario)?.trim() ?? "";
  const scenarioId = rawScenario.length > 0 ? rawScenario : null;

  const rawW = first(sp.w)?.trim() ?? "";
  let maxWidthPx: number | null = null;
  // ASCII digits only: \d in a non-unicode regex already excludes full-width
  // digits, which Number.parseInt would otherwise happily accept.
  if (/^\d+$/.test(rawW)) {
    const n = Number.parseInt(rawW, 10);
    // A value past MAX_SAFE_INTEGER is absent rather than clamped: showing a
    // plausible 1280 for input nobody meant hides the mistake.
    maxWidthPx = Number.isSafeInteger(n) ? Math.min(MAX_WIDTH_PX, Math.max(MIN_WIDTH_PX, n)) : null;
  }

  return { tier, scenarioId, maxWidthPx };
}
