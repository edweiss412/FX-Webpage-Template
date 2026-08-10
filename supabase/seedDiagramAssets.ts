// supabase/seedDiagramAssets.ts — seed-time diagram bytes + manifest entries
// for the private image pipeline (spec docs/superpowers/specs/crew/
// 2026-08-09-private-image-pipeline-design.md §3/§4/§5).
//
// WHY THIS EXISTS. The e2e gallery gate (tests/e2e/crew-layout-dimensions.spec.ts)
// measures `next/image` `fill` geometry and asserts the browser fetched
// VARIANT URLs. Neither is observable unless the seeded show carries a manifest
// with real `variants`/`blurDataURL`/intrinsic dims AND the local Storage bucket
// actually holds the objects those URLs address — otherwise the route 410s, the
// images never decode, and the geometry assertions read a zero box and pass
// tautologically. So the fixture comes FIRST: the e2e REDs must fail on a
// missing FEATURE, never on a missing fixture.
//
// NO COMMITTED BINARIES. Every byte here is generated at seed time by sharp
// (already a dependency of the ingest stage) from a deterministic pixel formula,
// and the variants/blur/dims come from `generateDiagramVariants` — the SAME
// production function the sync pipeline runs — so the seeded manifest is shaped
// by the implementation under test rather than by a hand-written literal.
//
// The `snapshotPath` values carry SEED_SHOW_ID_PLACEHOLDER because
// `public.shows.id` is DB-generated: supabase/seed.ts substitutes the real id
// inside the same locked transaction that inserts the row (invariant 2), and
// then uploads these bytes under the resolved id.
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { generateDiagramVariants } from "../lib/sync/diagramVariants";
import type { PersistedEmbeddedImage } from "../lib/parser/types";

/** Storage bucket the diagram asset route reads (route.ts `DIAGRAM_BUCKET`). */
export const SEED_DIAGRAM_BUCKET = "diagram-snapshots";

/**
 * Substituted for the DB-generated `public.shows.id` inside the seed
 * transaction. Deliberately not a UUID: a stray un-substituted token must fail
 * the route's `UUID_RE` loudly rather than 410 quietly.
 */
export const SEED_SHOW_ID_PLACEHOLDER = "__SEED_SHOW_ID__";

type SeedDiagramSpec = {
  /** Last path segment of `snapshotPath` — the `<key>` URL segment. */
  assetKey: string;
  width: number;
  height: number;
  alt: string;
  /**
   * `false` → `intrinsicWidth`/`intrinsicHeight` are OMITTED from the manifest
   * entry (§4 serialization rule: omission, never null), which is what drives
   * the lightbox down its `fill` + `object-contain` fallback branch. BOTH
   * branches must be reachable from one seed, so the two specs differ here.
   */
  recordDims: boolean;
  /** `false` → `blurDataURL` omitted (the no-placeholder guard row of §4). */
  recordBlur: boolean;
};

/**
 * TWO available entries, deliberately asymmetric:
 *
 *  - `alpha` is 1200px wide → the full [256, 512, 1024] ladder, WITH intrinsic
 *    dims and blur → the lightbox `width`/`height` branch.
 *  - `bravo` is 900px wide → [256, 512] only (no upscale), WITHOUT dims and
 *    WITHOUT blur → the lightbox `fill` fallback branch, which is the branch the
 *    §6 Dimensional Invariants table pins in a real browser.
 *
 * The differing ladders are load-bearing: a test that hardcoded one expected
 * variant set would pass on the wrong entry. Every expected value in the e2e
 * suite is derived from the manifest the seed actually wrote.
 */
const SEED_DIAGRAM_SPECS: readonly SeedDiagramSpec[] = [
  {
    assetKey: "seed-diagram-alpha.png",
    width: 1200,
    height: 800,
    alt: "Seeded stage plot with intrinsic dimensions",
    recordDims: true,
    recordBlur: true,
  },
  {
    assetKey: "seed-diagram-bravo.png",
    width: 900,
    height: 1200,
    alt: "Seeded rigging plot without intrinsic dimensions",
    recordDims: false,
    recordBlur: false,
  },
] as const;

export type SeedDiagramAsset = {
  assetKey: string;
  /** Object bytes keyed by their LAST PATH SEGMENT (original + every variant). */
  objects: Array<{ key: string; bytes: Uint8Array; contentType: string }>;
  entry: PersistedEmbeddedImage & { sourceFolder: "embedded" };
};

/**
 * A deterministic, genuinely non-uniform raster: a flat fill would encode to a
 * handful of bytes and would not exercise a real decode path in the browser.
 */
async function deterministicPng(width: number, height: number, salt: number): Promise<Buffer> {
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      raw[i] = Math.floor((x * 255) / width);
      raw[i + 1] = Math.floor((y * 255) / height);
      // Smooth (not xor-noise): high-entropy pixels defeat PNG compression and
      // pushed the seeded originals past 2MB apiece, which the lightbox's
      // pinOriginal tier then downloads on every e2e run.
      raw[i + 2] = ((x + y + salt) >> 2) & 0xff;
    }
  }
  return sharp(raw, { raw: { width, height, channels } }).png().toBuffer();
}

/**
 * Generate the bytes + manifest entries for one show's seeded diagrams.
 *
 * `revisionId` is the manifest's `snapshot_revision_id` — the `<rev>` URL
 * segment and the storage sub-prefix, so originals and variants land in the same
 * revision directory the route reconstructs `dirname(snapshotPath) + "/" + key`
 * against (spec §5).
 */
export async function buildSeedDiagramAssets(
  revisionId: string,
  stableHash: (input: string) => string,
): Promise<SeedDiagramAsset[]> {
  const assets: SeedDiagramAsset[] = [];

  for (const [index, spec] of SEED_DIAGRAM_SPECS.entries()) {
    const originalBytes = await deterministicPng(spec.width, spec.height, index * 37 + 11);
    const result = await generateDiagramVariants({
      bytes: originalBytes,
      mimeType: "image/png",
      assetKey: spec.assetKey,
    });
    if (result.failure) {
      throw new Error(
        `seedDiagramAssets: variant generation failed for ${spec.assetKey}: ` +
          `${result.failure.reason} — ${result.failure.message}`,
      );
    }
    // Fail LOUD rather than seeding a variant-less fixture: an e2e gate that
    // asserts "thumbnails fetch variant URLs" would otherwise fail on the
    // fixture and read as a feature regression.
    if (result.variants.length === 0) {
      throw new Error(
        `seedDiagramAssets: ${spec.assetKey} produced no variants (width ${spec.width}) — ` +
          `the e2e variant-URL gate has nothing to observe.`,
      );
    }
    if (spec.recordDims && (result.intrinsicWidth === null || result.intrinsicHeight === null)) {
      throw new Error(`seedDiagramAssets: ${spec.assetKey} recorded no intrinsic dimensions`);
    }
    if (spec.recordBlur && result.blurDataURL === null) {
      throw new Error(`seedDiagramAssets: ${spec.assetKey} produced no blurDataURL`);
    }

    const snapshotPath = `${SEED_DIAGRAM_BUCKET}/shows/${SEED_SHOW_ID_PLACEHOLDER}/${revisionId}/${spec.assetKey}`;

    assets.push({
      assetKey: spec.assetKey,
      objects: [
        { key: spec.assetKey, bytes: originalBytes, contentType: "image/png" },
        ...result.variants.map((variant) => ({
          key: variant.key,
          bytes: variant.bytes,
          contentType: variant.mimeType,
        })),
      ],
      entry: {
        objectId: `seed-embedded-${stableHash(`${revisionId}:${spec.assetKey}`).slice(0, 12)}`,
        sheetTab: "DIAGRAMS",
        mimeType: "image/png",
        alt: spec.alt,
        sheetsRevisionId: stableHash(`${revisionId}:sheets`).slice(0, 16),
        embeddedFingerprint: stableHash(`${revisionId}:${spec.assetKey}:bytes`).slice(0, 43),
        recovery_disposition: "normal",
        snapshotPath,
        sourceFolder: "embedded",
        // §4 fields. `variants[].key` is the LAST PATH SEGMENT, never a full path.
        variants: result.variants.map((variant) => ({ width: variant.width, key: variant.key })),
        ...(spec.recordBlur && result.blurDataURL !== null
          ? { blurDataURL: result.blurDataURL }
          : {}),
        ...(spec.recordDims && result.intrinsicWidth !== null && result.intrinsicHeight !== null
          ? { intrinsicWidth: result.intrinsicWidth, intrinsicHeight: result.intrinsicHeight }
          : {}),
      },
    });
  }

  return assets;
}

/**
 * Upload every generated object under the RESOLVED show id.
 *
 * Defaults mirror tests/e2e/helpers/supabaseAdmin.ts so `pnpm db:seed` works
 * against a bare `supabase start` with no env, and picks up the CI job env when
 * it is present. Every failure throws: a silently-skipped upload would leave the
 * manifest advertising objects the route cannot serve, which is exactly the
 * "RED fails on the fixture" state this module exists to prevent.
 */
export async function uploadSeedDiagramAssets(
  showId: string,
  revisionId: string,
  assets: readonly SeedDiagramAsset[],
): Promise<string[]> {
  const url = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    // Default service role key shipped with `supabase start`.
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

  const storage = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).storage.from(SEED_DIAGRAM_BUCKET);

  const uploaded: string[] = [];
  for (const asset of assets) {
    for (const object of asset.objects) {
      const objectPath = `shows/${showId}/${revisionId}/${object.key}`;
      // `upsert` because a re-seed reuses the revision id; a previous run's show
      // id leaves its objects behind, which is inert (nothing addresses them).
      const { error } = await storage.upload(objectPath, Buffer.from(object.bytes), {
        contentType: object.contentType,
        upsert: true,
      });
      if (error) {
        throw new Error(
          `seedDiagramAssets: upload of ${SEED_DIAGRAM_BUCKET}/${objectPath} failed: ${error.message}`,
        );
      }
      uploaded.push(objectPath);
    }
  }
  return uploaded;
}
