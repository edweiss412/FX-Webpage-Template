import type { Page } from "@playwright/test";

/** What a walk of one section root's visible text found. */
export type TextSizeReport = {
  /** Visible text nodes walked. */
  nodes: number;
  /** Text nodes under the 12px floor, each as "<size>px <text>". */
  offenders: string[];
  /** Nodes inside a `.uppercase` label, so the walk reached the label rule. */
  labels: number;
  /** Nodes inside a `.text-sm` value, so the walk reached the variable override. */
  values: number;
};

/**
 * Walks every visible text node under `rootSelector` and reads its computed size. It
 * reads the rendered page, not the CSS file, so it fails on a rule a build dropped and
 * on a size set some way the rule set does not reach (spec §3).
 */
export function readSectionTextSizes(page: Page, rootSelector: string): Promise<TextSizeReport> {
  return page.evaluate((selector) => {
    const FLOOR_PX = 12;
    const report = { nodes: 0, offenders: [] as string[], labels: 0, values: 0 };
    for (const root of document.querySelectorAll(selector)) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent?.trim() ?? "";
        const el = node.parentElement;
        if (text === "" || el === null || el.getClientRects().length === 0) continue;
        report.nodes += 1;
        if (el.closest(".uppercase")) report.labels += 1;
        if (el.closest(".text-sm")) report.values += 1;
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (px < FLOOR_PX) report.offenders.push(`${px}px ${text.slice(0, 40)}`);
      }
    }
    return report;
  }, rootSelector);
}
