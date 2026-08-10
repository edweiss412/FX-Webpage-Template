// tests/sync/diagramVariants.test.ts
//
// Behavior suite for the ingest variant stage (spec §3). Every fixture is
// generated IN-TEST with sharp, and every expected dimension is derived from the
// fixture rather than hardcoded, so a fixture edit cannot silently make a row
// vacuous. Each row states its discriminating condition with premise/premiseHolds.
//
// Failure modes these rows catch: silent upscaling, wrong-tier emission,
// unkeyed variants, sideways (EXIF-blind) variants, unbounded blur payloads,
// throw-through on corrupt bytes, and in-stage logging.

import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  DIAGRAM_VARIANT_WIDTHS,
  generateDiagramVariants,
  type DiagramVariantResult,
} from "@/lib/sync/diagramVariants";
import { resetLogSink, setLogSink } from "@/lib/log/logger";
import type { LogRecord } from "@/lib/log/types";
import { premise, premiseHolds } from "@/tests/_shared/premise";

const ASSET_KEY = "embedded-abc123.png";
const SMALLEST_TIER = Math.min(...DIAGRAM_VARIANT_WIDTHS);
const LARGEST_TIER = Math.max(...DIAGRAM_VARIANT_WIDTHS);

let logged: LogRecord[] = [];

beforeEach(() => {
  logged = [];
  setLogSink((record) => {
    logged.push(record);
  });
});

afterEach(() => {
  resetLogSink();
});

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 12, g: 90, b: 200 } },
  })
    .png()
    .toBuffer();
}

async function gif(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } },
  })
    .gif()
    .toBuffer();
}

/** A JPEG whose STORED pixels are `width`×`height` and whose EXIF says orientation 6. */
async function orientation6Jpeg(width: number, height: number): Promise<Buffer> {
  const base = await sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 160, b: 90 } },
  })
    .jpeg()
    .toBuffer();
  return sharp(base).withMetadata({ orientation: 6 }).jpeg().toBuffer();
}

/** Decode produced bytes — never trust the declared value the code under test emitted. */
async function decoded(
  bytes: Uint8Array,
): Promise<{ format: string; width: number; height: number }> {
  const meta = await sharp(Buffer.from(bytes)).metadata();
  return { format: meta.format ?? "", width: meta.width ?? 0, height: meta.height ?? 0 };
}

function blurPayload(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.slice("data:image/webp;base64,".length), "base64");
}

async function run(
  bytes: Buffer,
  mimeType: string,
  options?: { maxBlurDataUrlLength?: number },
): Promise<DiagramVariantResult> {
  return generateDiagramVariants({ bytes, mimeType, assetKey: ASSET_KEY }, options ?? {});
}

describe("generateDiagramVariants — ladder", () => {
  test("a wide original emits exactly the tiers below its intrinsic width, keyed and webp-encoded", async () => {
    const width = 2000;
    const height = 1500;
    premise("fixture width exceeds the largest ladder tier", width, LARGEST_TIER);

    const result = await run(await png(width, height), "image/png");

    const expectedWidths = DIAGRAM_VARIANT_WIDTHS.filter((w) => w < width);
    premise("the ladder emits at least one tier for this fixture", expectedWidths.length, 0);

    expect(result.failure).toBeNull();
    expect(result.variants.map((v) => v.width)).toEqual([...expectedWidths]);
    expect(result.intrinsicWidth).toBe(width);
    expect(result.intrinsicHeight).toBe(height);

    for (const variant of result.variants) {
      expect(variant.mimeType).toBe("image/webp");
      expect(variant.key).toBe(`${ASSET_KEY}@${variant.width}.webp`);
      const out = await decoded(variant.bytes);
      expect(out.format).toBe("webp");
      // Decoded, not declared: a wrong-tier resize cannot hide behind the label.
      expect(out.width).toBe(variant.width);
    }
    expect(logged).toEqual([]);
  });

  test("an original between tiers emits only the tiers strictly below it", async () => {
    const width = 400;
    premise("fixture width exceeds the smallest ladder tier", width, SMALLEST_TIER);
    premiseHolds(
      "fixture width is below the next tier up, so exactly one tier may be emitted",
      width < 512,
    );

    const result = await run(await png(width, 300), "image/png");

    expect(result.variants.map((v) => v.width)).toEqual([SMALLEST_TIER]);
    expect((await decoded(result.variants[0]!.bytes)).width).toBe(SMALLEST_TIER);
  });

  test("an original narrower than the smallest tier is never upscaled", async () => {
    const width = 200;
    premiseHolds(
      "fixture width is below the smallest ladder tier, so any variant would be an upscale",
      width < SMALLEST_TIER,
    );

    const result = await run(await png(width, 150), "image/png");

    expect(result.variants).toEqual([]);
    expect(result.failure).toBeNull();
    // Dims and blur are still recorded — only the variant loop is skipped.
    expect(result.intrinsicWidth).toBe(width);
    expect(result.blurDataURL).not.toBeNull();
  });

  test("a GIF wide enough to earn tiers still emits none, but keeps blur and dims", async () => {
    const width = 400;
    const height = 300;
    // Without this premise "no variants" would be vacuous — a 200px GIF earns
    // none for the no-upscale reason, proving nothing about the GIF rule.
    premise("gif fixture width exceeds the smallest ladder tier", width, SMALLEST_TIER);

    const result = await run(await gif(width, height), "image/gif");

    expect(result.variants).toEqual([]);
    expect(result.failure).toBeNull();
    expect(result.blurDataURL).not.toBeNull();
    expect(result.intrinsicWidth).toBe(width);
    expect(result.intrinsicHeight).toBe(height);
  });
});

describe("generateDiagramVariants — EXIF orientation", () => {
  test("recorded dims and every variant's decoded output are post-rotation", async () => {
    const storedWidth = 1200;
    const storedHeight = 600;
    // Orientation 6 = rotate 90°: the browser renders 600×1200.
    const rotatedWidth = storedHeight;
    const rotatedHeight = storedWidth;

    const bytes = await orientation6Jpeg(storedWidth, storedHeight);
    const rawMeta = await sharp(bytes).metadata();
    premiseHolds(
      "the fixture actually carries EXIF orientation 6 and reports the unrotated dims",
      rawMeta.orientation === 6 && rawMeta.width === storedWidth && rawMeta.height === storedHeight,
    );
    premise(
      "post-rotation width exceeds the smallest tier, so at least one variant is emitted",
      rotatedWidth,
      SMALLEST_TIER,
    );

    const result = await run(bytes, "image/jpeg");

    premise("the ladder emitted at least one variant to inspect", result.variants.length, 0);

    expect(result.intrinsicWidth).toBe(rotatedWidth);
    expect(result.intrinsicHeight).toBe(rotatedHeight);
    expect(result.variants.map((v) => v.width)).toEqual(
      DIAGRAM_VARIANT_WIDTHS.filter((w) => w < rotatedWidth),
    );

    for (const variant of result.variants) {
      const out = await decoded(variant.bytes);
      expect(out.width).toBe(variant.width);
      // A sideways (rotate-less) variant would be landscape here.
      expect(out.height).toBeGreaterThan(out.width);
      expect(out.height).toBe(Math.round((variant.width * rotatedHeight) / rotatedWidth));
    }
  });
});

describe("generateDiagramVariants — blur", () => {
  test("the blur is a decodable webp data URL bounded at 16px", async () => {
    const result = await run(await png(800, 600), "image/png");

    expect(result.blurDataURL).not.toBeNull();
    expect(result.blurDataURL!.startsWith("data:image/webp;base64,")).toBe(true);
    // The prefix is a claim; decoding is the proof.
    const out = await decoded(blurPayload(result.blurDataURL!));
    expect(out.format).toBe("webp");
    expect(out.width).toBeLessThanOrEqual(16);
    expect(out.height).toBeLessThanOrEqual(16);
    expect(logged).toEqual([]);
  });

  test("an extreme aspect ratio bounds BOTH blur dimensions, not just width", async () => {
    const width = 1;
    const height = 1000;
    premise(
      "fixture aspect ratio is extreme enough that a width-only resize would overflow",
      height,
      16 * width,
    );

    const result = await run(await png(width, height), "image/png");

    const out = await decoded(blurPayload(result.blurDataURL!));
    expect(out.width).toBeLessThanOrEqual(16);
    expect(out.height).toBeLessThanOrEqual(16);
  });

  test("a blur payload past the length belt is dropped in-memory and signaled as blur_oversize", async () => {
    // Threshold lowered so the belt is reachable without an adversarial fixture.
    const result = await run(await png(800, 600), "image/png", { maxBlurDataUrlLength: 1 });

    // In-memory NULL is this function's contract; field OMISSION is the Task 2
    // serialization rule, not this seam's.
    expect(result.blurDataURL).toBeNull();
    expect(result.failure).toEqual({ reason: "blur_oversize", message: expect.any(String) });
    // The belt drops the blur only — the ladder is unaffected.
    premise(
      "the fixture earns variants, so 'variants survive' is not vacuous",
      result.variants.length,
      0,
    );
    expect(result.intrinsicWidth).toBe(800);
    expect(logged).toEqual([]);
  });
});

describe("generateDiagramVariants — failure posture", () => {
  test("corrupt bytes resolve to a sharp_error result without throwing or logging", async () => {
    const corrupt = Buffer.from("this is definitively not an image");
    let sharpRejects = false;
    try {
      await sharp(corrupt).metadata();
    } catch {
      sharpRejects = true;
    }
    premiseHolds("the corrupt fixture actually fails sharp", sharpRejects);

    const result = await run(corrupt, "image/png");

    expect(result.variants).toEqual([]);
    expect(result.blurDataURL).toBeNull();
    expect(result.intrinsicWidth).toBeNull();
    expect(result.intrinsicHeight).toBeNull();
    expect(result.failure?.reason).toBe("sharp_error");
    expect(result.failure?.message.length).toBeGreaterThan(0);
    // Telemetry ownership: the stage signals as DATA, the caller emits post-commit.
    expect(logged).toEqual([]);
  });
});
