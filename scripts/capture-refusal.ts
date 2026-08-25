import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Page } from "@playwright/test";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { encodeWebp } from "./capture-core";
import { pixelSha256 } from "./capture-evidence";
import { checkGeometry } from "./capture-geometry";
import { detectRenderFaults } from "./capture-render-fault";

/** A refusal attributed to one or more marked fault branches in the subtree. */
export class RenderFaultError extends Error {
  readonly reasons: string[];

  constructor(entryKey: string, theme: string, reasons: string[]) {
    super(`${entryKey} (${theme}) rendered a marked fault: ${reasons.join(", ")}`);
    this.name = "RenderFaultError";
    this.reasons = reasons;
  }
}

async function screenshotPng(page: Page, entry: { captureSelector?: string }): Promise<Buffer> {
  if (entry.captureSelector !== undefined) {
    return await page.locator(entry.captureSelector).first().screenshot({ type: "png" });
  }
  return await page.screenshot({ type: "png", fullPage: true });
}

/**
 * Screenshot the entry, or refuse without writing anything.
 *
 * The detector runs BETWEEN quiescence and the screenshot. Ordering is the
 * whole point: a check placed after `encodeWebp`/`writeFile` still overwrites
 * the committed baseline before it fails, and the capture overwrites in place,
 * so the damage is invisible to any "was a new file created" check.
 *
 * `data-degraded` is deliberately not consulted — it is a live product state,
 * and refusing on it would fail a healthy capture on every run.
 */
export type CapturedEntry = {
  key: string;
  theme: string;
  capturedAtUtc: string;
  /**
   * The manifest entry's frozen clock, recorded per entry because spec section 5
   * requires it per entry and because it is what PROVES the frozen clock applied
   * to this capture. Without it the record cannot distinguish a capture taken
   * under the frozen clock from one taken under a live one, which is precisely
   * the class of drift this instrument exists to reason about.
   */
  frozenClockInstant: string;
  pixelWidth: number | null;
  pixelHeight: number | null;
  pixelSha256: string | null;
  webpBytes: number | null;
  webpSha256: string | null;
  faultHits: string[];
  refusedReason: string | null;
  /** Present only on a `selector-absent` refusal: the selector that never resolved (spec section 4.2.1). */
  absentSelector?: string;
  /** Present only on a geometry refusal: the observed dimensions (spec section 6). */
  geometry?: {
    baselineWidth: number;
    baselineHeight: number;
    capturedWidth: number;
    capturedHeight: number;
  };
  geometrySkippedReason?: string;
};

export async function captureOrRefuse(
  page: Page,
  entry: { key: string; captureSelector?: string; frozenClockInstant: string },
  theme: string,
  outDir: string,
  baselinePath?: string,
): Promise<CapturedEntry> {
  const capturedAtUtc = new Date().toISOString();
  const reasons = await detectRenderFaults(page, entry.captureSelector);
  if (reasons.length > 0) {
    throw new RenderFaultError(entry.key, theme, reasons);
  }

  const pngBuffer = await screenshotPng(page, entry);

  // Layer 2 runs before the encode, for the same reason layer 1 runs before the
  // screenshot: a refusal must cost no bytes.
  const geometry =
    baselinePath === undefined ? { checked: false } : await checkGeometry(pngBuffer, baselinePath);

  const webpBuffer = await encodeWebp(pngBuffer);
  const outPath = join(outDir, `${entry.key}-${theme}.webp`);
  mkdirSync(dirname(outPath), { recursive: true });
  await writeFile(outPath, webpBuffer);

  const meta = await sharp(pngBuffer).metadata();
  return {
    key: entry.key,
    theme,
    capturedAtUtc,
    frozenClockInstant: entry.frozenClockInstant,
    pixelWidth: meta.width ?? null,
    pixelHeight: meta.height ?? null,
    pixelSha256: await pixelSha256(pngBuffer),
    webpBytes: webpBuffer.byteLength,
    webpSha256: createHash("sha256").update(webpBuffer).digest("hex"),
    faultHits: [],
    refusedReason: null,
    ...(geometry.skippedReason !== undefined
      ? { geometrySkippedReason: geometry.skippedReason }
      : {}),
  };
}
