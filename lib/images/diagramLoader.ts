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

export function diagramAssetUrl(showId: string, rev: string, key: string): string {
  return `/api/asset/diagram/${showId}/${rev}/${key}`;
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
    if (typeof key !== "string" || key.length === 0) continue;
    rows.push({ width, key });
  }
  return rows.sort((a, b) => a.width - b.width);
}

export function makeDiagramLoader(
  args: MakeDiagramLoaderArgs,
): (props: ImageLoaderProps) => string {
  const originalUrl = diagramAssetUrl(args.showId, args.rev, args.key);
  // The active lightbox slide ignores width entirely: zoom needs full resolution.
  if (args.pinOriginal) return () => originalUrl;

  const rows = validVariants(args.variants);
  if (rows.length === 0) return () => originalUrl;

  return ({ width }) => {
    // Smallest tier that covers the request; above the ladder, the largest tier —
    // never the original. `quality` is ignored: encoding is fixed at ingest.
    const chosen = rows.find((row) => row.width >= width) ?? rows[rows.length - 1]!;
    return diagramAssetUrl(args.showId, args.rev, chosen.key);
  };
}
