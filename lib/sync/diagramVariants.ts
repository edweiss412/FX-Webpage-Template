// lib/sync/diagramVariants.ts
//
// Ingest-stage variant generation for diagram assets (spec §3,
// docs/superpowers/specs/crew/2026-08-09-private-image-pipeline-design.md).
//
// Telemetry ownership: this module NEVER logs. It has no showId and its input
// contract stays byte-local; failures travel as DATA via the `failure`
// discriminator, which callers surface POST-COMMIT (spec §3, invariant 10).

import sharp from "sharp";

/** The variant ladder. A width is emitted only when STRICTLY less than the original's. */
export const DIAGRAM_VARIANT_WIDTHS = [256, 512, 1024] as const;

/**
 * Belt on top of the 16×16 blur bound: an encoded data URL longer than this is
 * dropped and signaled as `blur_oversize` (spec §3).
 */
export const MAX_BLUR_DATA_URL_LENGTH = 2048;

export type DiagramVariant = {
  width: number;
  key: string;
  bytes: Uint8Array;
  mimeType: "image/webp";
};

export type DiagramVariantFailureReason = "sharp_error" | "blur_oversize";

export type DiagramVariantResult = {
  variants: DiagramVariant[];
  blurDataURL: string | null;
  intrinsicWidth: number | null;
  intrinsicHeight: number | null;
  failure: { reason: DiagramVariantFailureReason; message: string } | null;
};

export type GenerateDiagramVariantsInput = {
  bytes: Uint8Array;
  mimeType: string;
  assetKey: string;
};

export type GenerateDiagramVariantsOptions = {
  /** Test seam for the `blur_oversize` belt; defaults to MAX_BLUR_DATA_URL_LENGTH. */
  maxBlurDataUrlLength?: number;
};

const BLUR_MAX_EDGE = 16;
const BLUR_DATA_URL_PREFIX = "data:image/webp;base64,";

export async function generateDiagramVariants(
  input: GenerateDiagramVariantsInput,
  options: GenerateDiagramVariantsOptions = {},
): Promise<DiagramVariantResult> {
  const maxBlurDataUrlLength = options.maxBlurDataUrlLength ?? MAX_BLUR_DATA_URL_LENGTH;

  try {
    // Materialize the EXIF-rotated image ONCE and derive everything from it.
    // sharp's metadata().width/height are orientation-UNAWARE even with .rotate()
    // chained (spec §3 R2 F5 probe), so recorded dims must come from a
    // materialized rotated output — never from raw input metadata. Reusing the
    // buffer also spares each downstream resize a fresh decode of the original.
    const rotated = await sharp(Buffer.from(input.bytes))
      .rotate()
      .toBuffer({ resolveWithObject: true });
    const intrinsicWidth = rotated.info.width;
    const intrinsicHeight = rotated.info.height;

    const variants: DiagramVariant[] = [];
    // GIF short-circuits the variant loop only: a resize re-encode would drop the
    // animation. Blur and dims are still recorded (spec §3).
    if (input.mimeType !== "image/gif") {
      for (const width of DIAGRAM_VARIANT_WIDTHS) {
        if (width >= intrinsicWidth) continue; // never upscale
        const bytes = await sharp(rotated.data).resize({ width }).webp({ quality: 75 }).toBuffer();
        variants.push({
          width,
          key: `${input.assetKey}@${width}.webp`,
          bytes,
          mimeType: "image/webp",
        });
      }
    }

    // BOTH edges bounded regardless of aspect ratio — a width-only resize of a
    // 1×1000 source produced a 16×16000 webp (spec §3 R1 F9).
    const blurBytes = await sharp(rotated.data)
      .resize({ width: BLUR_MAX_EDGE, height: BLUR_MAX_EDGE, fit: "inside" })
      .webp({ quality: 40 })
      .toBuffer();
    const blurDataURL = `${BLUR_DATA_URL_PREFIX}${blurBytes.toString("base64")}`;

    if (blurDataURL.length > maxBlurDataUrlLength) {
      return {
        variants,
        blurDataURL: null,
        intrinsicWidth,
        intrinsicHeight,
        failure: {
          reason: "blur_oversize",
          message: `blur data URL is ${blurDataURL.length} characters, over the ${maxBlurDataUrlLength} limit`,
        },
      };
    }

    return { variants, blurDataURL, intrinsicWidth, intrinsicHeight, failure: null };
  } catch (error) {
    // Per-asset catch: the snapshot never fails or degrades status because of
    // this stage. Signaled, never silently wrong (spec §3 consequence bound).
    return {
      variants: [],
      blurDataURL: null,
      intrinsicWidth: null,
      intrinsicHeight: null,
      failure: {
        reason: "sharp_error",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
