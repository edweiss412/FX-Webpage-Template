import { existsSync } from "node:fs";
import sharp from "sharp";

/** Layer 2's refusal: the capture's dimensions moved against the baseline. */
export class GeometryMismatchError extends Error {
  constructor(baselinePath: string, expected: string, actual: string) {
    super(`geometry moved against ${baselinePath}: baseline ${expected}, captured ${actual}`);
    this.name = "GeometryMismatchError";
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
      `${baseline.width}x${baseline.height}`,
      `${captured.width}x${captured.height}`,
    );
  }

  return { checked: true };
}
