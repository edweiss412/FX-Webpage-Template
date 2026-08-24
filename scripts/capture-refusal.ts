import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Page } from "@playwright/test";
import { encodeWebp } from "./capture-core";
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
export async function captureOrRefuse(
  page: Page,
  entry: { key: string; captureSelector?: string },
  theme: string,
  outDir: string,
): Promise<void> {
  const reasons = await detectRenderFaults(page, entry.captureSelector);
  if (reasons.length > 0) {
    throw new RenderFaultError(entry.key, theme, reasons);
  }

  const pngBuffer = await screenshotPng(page, entry);
  const webpBuffer = await encodeWebp(pngBuffer);
  const outPath = join(outDir, `${entry.key}-${theme}.webp`);
  mkdirSync(dirname(outPath), { recursive: true });
  await writeFile(outPath, webpBuffer);
}
