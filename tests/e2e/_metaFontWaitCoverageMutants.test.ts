// Mutation corpus for the font-wait guard. The guard's only other input is the
// spec corpus it guards, which is (correctly) clean — so without these, a guard
// that returned `[]` unconditionally would look exactly as green as this one.
//
// Every mutant below is a placement a contributor could plausibly write. Each
// must be REPORTED; the baseline must be SILENT. M2 and M5 are the two the
// previous per-function form let through, and they are why this file exists.
import { describe, expect, test } from "vitest";

import { analyzeSource } from "./_fontWaitCoverage";

const wrap = (body: string): string =>
  `import { test } from "@playwright/test";\ntest("t", async ({ page }) => {\n${body}\n});\n`;

/** Correct: navigate, settle, then measure. */
const BASELINE = wrap(`
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
`);

const MUTANTS: ReadonlyArray<{ id: string; why: string; source: string }> = [
  {
    id: "M1",
    why: "no wait anywhere",
    source: wrap(`
      await page.goto(url);
      const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
    `),
  },
  {
    id: "M2",
    why: "SECOND navigation unguarded — the live statusStripToggleLayout shape",
    source: wrap(`
      await page.goto(first);
      await page.evaluate(() => document.fonts.ready);
      const a = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
      await page.goto(second);
      const b = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
    `),
  },
  {
    id: "M3",
    why: "wait hoisted above the navigation, settling against the outgoing document",
    source: wrap(`
      await page.evaluate(() => document.fonts.ready);
      await page.goto(url);
      const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
    `),
  },
  {
    id: "M4",
    why: "wait placed after the measurement",
    source: wrap(`
      await page.goto(url);
      const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
      await page.evaluate(() => document.fonts.ready);
    `),
  },
  {
    id: "M5",
    why: "evaluate-wrapped read — invisible to attribution by enclosing function",
    source: wrap(`
      await page.goto(url);
      const h = await page.locator("#x").evaluate((n) => n.getBoundingClientRect().height);
      await page.evaluate(() => document.fonts.ready);
    `),
  },
  {
    id: "M6",
    why: "Node-side property read, the other geometry spelling",
    source: wrap(`
      await page.goto(url);
      const box = await page.getByTestId("x").boundingBox();
    `),
  },
  {
    id: "M7",
    why: "setContent is a navigation too",
    source: wrap(`
      await page.setContent(html);
      const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().width);
    `),
  },
  {
    id: "M8",
    why: "reload replaces the document and re-races the face",
    source: wrap(`
      await page.goto(url);
      await page.evaluate(() => document.fonts.ready);
      await page.reload();
      const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
    `),
  },

  // M9-M11: the text of the promise is not the awaiting of it. R2 finding 1.
  {
    id: "M9",
    why: "wait never awaited — the promise is created and dropped",
    source: wrap(`
      await page.goto(url);
      page.evaluate(() => document.fonts.ready);
      const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
    `),
  },
  {
    id: "M10",
    why: "callback has a block body and never returns the promise",
    source: wrap(`
      await page.goto(url);
      await page.evaluate(() => {
        document.fonts.ready;
      });
      const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
    `),
  },
  {
    id: "M11",
    why: "wait races the navigation instead of following it",
    source: wrap(`
      await Promise.all([page.goto(url), page.evaluate(() => document.fonts.ready)]);
      const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
    `),
  },

  // M12-M15: heights and rect lists are geometry. R2 finding 2 — these were the
  // majority spelling in the corpus and carried no requirement at all.
  {
    id: "M12",
    why: "offsetHeight is font-sensitive geometry",
    source: wrap(`
      await page.goto(url);
      const h = await page.locator("#x").evaluate((n) => n.offsetHeight);
    `),
  },
  {
    id: "M13",
    why: "clientHeight is font-sensitive geometry",
    source: wrap(`
      await page.goto(url);
      const h = await page.locator("#x").evaluate((n) => n.clientHeight);
    `),
  },
  {
    id: "M14",
    why: "scrollHeight is font-sensitive geometry — 47 occurrences in this corpus",
    source: wrap(`
      await page.goto(url);
      const h = await page.locator("#x").evaluate((n) => n.scrollHeight);
    `),
  },
  {
    id: "M15",
    why: "getClientRects is the wrapped-line spelling of the same read",
    source: wrap(`
      await page.goto(url);
      const rects = await page.locator("#x").evaluate((n) => n.getClientRects().length);
    `),
  },
];

describe("font-wait guard is falsifiable", () => {
  test("the correct placement is silent", () => {
    expect(analyzeSource("baseline.spec.ts", BASELINE)).toEqual([]);
  });

  test.each(MUTANTS)("$id is reported — $why", ({ source }) => {
    expect(analyzeSource("mutant.spec.ts", source).length).toBeGreaterThan(0);
  });

  test("a navigation with no geometry after it is NOT reported", () => {
    // Deliberate demote, documented in analyzeSource: nothing here depends on
    // the resolved face, and flagging it would teach waits that protect nothing.
    const source = wrap(`
      await page.goto(url);
      const d = await page.locator("#x").evaluate((el) => getComputedStyle(el).transitionDuration);
    `);
    expect(analyzeSource("demote.spec.ts", source)).toEqual([]);
  });
});
