import { existsSync } from "node:fs";
import sharp from "sharp";

/** Layer 2's refusal: the capture's dimensions moved against the baseline. */
export class GeometryMismatchError extends Error {
  /**
   * The dimensions as FIELDS, not only interpolated into the message.
   *
   * Spec section 6 has the record carry the observed dimensions for a refused
   * entry, because they are the narrowing evidence an operator gets in exchange
   * for the honest ceiling that unique attribution is impossible. Leaving them
   * in the message alone means the durable record loses them: `refusedEntry`
   * writes null pixel fields for every refusal, so the artifact carried the
   * refusal without the one measurement that makes it actionable.
   */
  readonly baselineWidth: number;
  readonly baselineHeight: number;
  readonly capturedWidth: number;
  readonly capturedHeight: number;

  constructor(
    baselinePath: string,
    baseline: { width: number; height: number },
    captured: { width: number; height: number },
  ) {
    super(
      `geometry moved against ${baselinePath}: baseline ${baseline.width}x${baseline.height}, ` +
        `captured ${captured.width}x${captured.height}`,
    );
    this.name = "GeometryMismatchError";
    this.baselineWidth = baseline.width;
    this.baselineHeight = baseline.height;
    this.capturedWidth = captured.width;
    this.capturedHeight = captured.height;
  }
}

export type GeometryResult = { checked: boolean; skippedReason?: string };

/**
 * Compare the capture's dimensions against the committed baseline's.
 *
 * This is layer 2, and what it is worth is exactly bounded. Layer 1 reaches
 * only branches that return marked JSX, which leaves flag-shaped faults free to
 * move layout silently — occurrence A is that shape, and it changed a captured
 * strip from 320x164 to 320x291 with nothing marked anywhere.
 *
 * What it deliberately does NOT do is fire when the dimensions match and the
 * bytes differ. That is occurrence B, sub-pixel rasterization variance, a
 * different mechanism with a different repair. A layer that fires on
 * everything discriminates nothing.
 *
 * A missing baseline is a recorded SKIP rather than a pass: reporting a pass
 * would claim a comparison that never happened, and every new manifest entry
 * would certify itself on its first run.
 */
export async function checkGeometry(
  pngBuffer: Buffer,
  baselinePath: string,
): Promise<GeometryResult> {
  if (!existsSync(baselinePath)) {
    return { checked: false, skippedReason: "no-committed-baseline" };
  }

  const [captured, baseline] = await Promise.all([
    sharp(pngBuffer).metadata(),
    sharp(baselinePath).metadata(),
  ]);

  if (captured.width !== baseline.width || captured.height !== baseline.height) {
    throw new GeometryMismatchError(
      baselinePath,
      { width: baseline.width ?? 0, height: baseline.height ?? 0 },
      { width: captured.width ?? 0, height: captured.height ?? 0 },
    );
  }

  return { checked: true };
}
