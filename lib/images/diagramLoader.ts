// lib/images/diagramLoader.ts
//
// The shared next/image loader for private diagram assets (spec §6).
//
// Variant clamping is the ONLY width-responsive behavior. There is deliberately
// no "above the ladder → serve the original" rule: with the thumbnail and
// lightbox `sizes` strings, Next's device-width candidates reach 3840w, so such
// a rule would ship ORIGINAL bytes to large or high-DPR viewports — the exact
// waste this pipeline exists to remove.

import type { ImageLoaderProps } from "next/image";
import { isSafeDiagramKey } from "@/lib/images/diagramKey";

export type DiagramVariantRef = { width: number; key: string };

export type MakeDiagramLoaderArgs = {
  showId: string;
  rev: string;
  /** The ORIGINAL asset key (last path segment of snapshotPath). */
  key: string;
  /** Manifest data, trusted only after the §4 guards below. */
  variants?: unknown;
  /** The active lightbox slide: full resolution for zoom, `width` ignored. */
  pinOriginal?: boolean;
};

/**
 * The key is manifest DATA and becomes one URL path segment, so it is encoded
 * rather than interpolated raw. Unencoded, a key containing `/`, `?`, `#`, `%`,
 * or a control character is reinterpreted by URL parsing and route matching —
 * and the dangerous case is not the 404: `v?x.webp` truncates to `v`, which can
 * SILENTLY select and sign a DIFFERENT listed object. The route decodes its
 * params before comparing, so an encoded segment still matches the manifest key
 * exactly.
 */
function encodeKeySegment(key: string): string {
  // `@` is legal in a path segment and every real variant key contains one
  // (`<assetKey>@<width>.webp`), so it is decoded back rather than left as %40 —
  // keeping the URL shape the route, the e2e network gate, and any operator
  // reading logs already expect.
  // `@` and `:` are legal in a path segment and both occur in real keys (the
  // `@<width>.webp` suffix; Slides object ids permit `:`), so they are decoded
  // back — leaving them percent-encoded would churn every URL and the e2e
  // network gate for no safety gain.
  const encoded = encodeURIComponent(key).replace(/%40/g, "@").replace(/%3A/g, ":");
  // A segment of exactly "." or ".." is a relative-path component, not a name;
  // encodeURIComponent leaves both untouched.
  if (encoded === "." || encoded === "..") return encoded.replace(/\./g, "%2E");
  return encoded;
}

export function diagramAssetUrl(showId: string, rev: string, key: string): string {
  return `/api/asset/diagram/${showId}/${rev}/${encodeKeySegment(key)}`;
}

/**
 * The §4 guard conditions. A malformed row is skipped as if absent; a wholly
 * malformed field degrades to originals-only. Never throws on manifest data.
 */
function validVariants(raw: unknown): DiagramVariantRef[] {
  if (!Array.isArray(raw)) return [];
  const rows: DiagramVariantRef[] = [];
  for (const row of raw) {
    if (typeof row !== "object" || row === null) continue;
    const { width, key } = row as { width?: unknown; key?: unknown };
    if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) continue;
    // The SAME predicate the route's accept-set uses. Accepting a wider set here
    // meant a malformed row could be SELECTED over a usable sibling and then 410.
    if (!isSafeDiagramKey(key)) continue;
    rows.push({ width, key });
  }
  return rows.sort((a, b) => a.width - b.width);
}

/**
 * The rows the clamped loader may actually select: valid, and NOT the original.
 *
 * A row can be perfectly well-formed and still name the original itself
 * (`{ width: 256, key: <the original> }`). It survives every §4 guard, so it
 * would land in the ladder and become selectable at whatever widths clamp to
 * it — and then the loader serves the very original the zoom gate withholds.
 * Dropping it here is what makes the "never the original" rule below hold at
 * EVERY width, rather than only above the ladder.
 */
function servingVariants(raw: unknown, originalKey: string): DiagramVariantRef[] {
  return validVariants(raw).filter((row) => row.key !== originalKey);
}

/**
 * Whether this manifest data yields a tier the clamped loader can serve INSTEAD
 * OF the original.
 *
 * Exported so callers never re-derive it: `pinOriginal` says the caller ASKED
 * for the original, not that something smaller exists to fall back to. For an
 * originals-only entry — old manifests, GIFs, generation failures, a ladder
 * whose every row the §4 guards reject — both loader states resolve to the same
 * URL, and a caller that treats the pin as proof of a fallback will offer one
 * that cannot happen.
 *
 * `originalKey` is REQUIRED, and it is the whole difference between this
 * predicate and "are there any usable rows?". It reads the SAME
 * `servingVariants` the loader selects from, so the two cannot drift. An earlier
 * version asked whether SOME valid row differed from the original, which a mixed
 * ladder — 256 naming a variant, 1024 naming the original — satisfied while
 * every request of 512px or more still selected the original. It is true exactly
 * when a selectable non-original row exists, which is the claim callers rely on.
 */
export function hasVariantTier(variants: unknown, originalKey: string): boolean {
  return servingVariants(variants, originalKey).length > 0;
}

export function makeDiagramLoader(
  args: MakeDiagramLoaderArgs,
): (props: ImageLoaderProps) => string {
  const originalUrl = diagramAssetUrl(args.showId, args.rev, args.key);
  // The active lightbox slide ignores width entirely: zoom needs full resolution.
  if (args.pinOriginal) return () => originalUrl;

  const rows = servingVariants(args.variants, args.key);
  if (rows.length === 0) return () => originalUrl;

  return ({ width }) => {
    // Smallest tier that covers the request; above the ladder, the largest tier —
    // never the original, which is why the ladder excludes any row naming it.
    // `quality` is ignored: encoding is fixed at ingest.
    const chosen = rows.find((row) => row.width >= width) ?? rows[rows.length - 1]!;
    return diagramAssetUrl(args.showId, args.rev, chosen.key);
  };
}
