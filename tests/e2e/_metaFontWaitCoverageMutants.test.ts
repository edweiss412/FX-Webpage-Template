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
  // M16-M19: R3's escapes. A mention is not a settle; a combinator can make the
  // wait optional or concurrent with the navigation it should follow.
  {
    id: "M16",
    why: "the return is COMMENTED OUT — text matching credits it, the AST does not",
    source: wrap(`
      await page.goto(url);
      await page.evaluate(() => {
        // return document.fonts.ready;
      });
      const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
    `),
  },
  {
    id: "M17",
    why: "return void discards the promise it names",
    source: wrap(`
      await page.goto(url);
      await page.evaluate(() => {
        return void document.fonts.ready;
      });
      const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
    `),
  },
  {
    id: "M18",
    why: "Promise.race can settle on the timeout, never on the font promise",
    source: wrap(`
      await page.goto(url);
      await Promise.race([page.evaluate(() => document.fonts.ready), timeout(500)]);
      const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
    `),
  },
  {
    id: "M19",
    why: "navigation reached the combinator through a binding, so text alone misses it",
    source: wrap(`
      const nav = page.goto(url);
      await Promise.all([nav, page.evaluate(() => document.fonts.ready)]);
      const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
    `),
  },

  // M20: CSSOM resolved geometry. An intrinsically sized element's computed
  // width is as font-dependent as its rect.
  {
    id: "M20",
    why: "getComputedStyle width is resolved geometry",
    source: wrap(`
      await page.goto(url);
      const w = await page.locator("#x").evaluate((el) => getComputedStyle(el).width);
    `),
  },

  // M21-M23: R4's confirmed escapes. Two are in the helper credit added by R3's
  // own repair -- a repair that introduced its own hole.
  {
    id: "M21",
    why: "helper call never awaited — the wait starts and is dropped",
    source: `import { test } from "@playwright/test";
async function settleFonts(page) { await page.evaluate(() => document.fonts.ready); }
test("t", async ({ page }) => {
  await page.goto(url);
  settleFonts(page);
  const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
});
`,
  },
  {
    id: "M22",
    why: "helper call raced against the navigation it should follow",
    source: `import { test } from "@playwright/test";
async function settleFonts(page) { await page.evaluate(() => document.fonts.ready); }
test("t", async ({ page }) => {
  await Promise.all([page.goto(url), settleFonts(page)]);
  const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
});
`,
  },
  {
    id: "M23",
    why: "a one-letter alias satisfied by awaiting an unrelated promise",
    source: wrap(`
      await page.goto(url);
      const p = page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1);
      const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
    `),
  },

  {
    id: "M24",
    why: "aliased wait raced with a timeout — the combinator can settle without it",
    source: wrap(`
      await page.goto(url);
      const fontsReady = page.evaluate(() => document.fonts.ready);
      await Promise.race([fontsReady, timeout(500)]);
      const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
    `),
  },
  {
    id: "M25",
    why: "aliased wait started alongside the navigation it should follow",
    source: wrap(`
      const nav = page.goto(url);
      const fontsReady = page.evaluate(() => document.fonts.ready);
      await Promise.all([nav, fontsReady]);
      const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
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

  test.each([
    [
      "async callback awaiting fonts then a frame — the live stackedBandLayout idiom",
      `
      await page.goto(url);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      });
      const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
    `,
    ],
    [
      "promise bound to a name, awaited after",
      `
      await page.goto(url);
      const ready = page.evaluate(() => document.fonts.ready);
      await ready;
      const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
    `,
    ],
    [
      "Promise.all INSIDE the browser callback — attribution must reach the test fn",
      `
      await page.goto(url);
      await page.evaluate(async () => {
        await Promise.all([document.fonts.ready, new Promise((r) => requestAnimationFrame(r))]);
      });
      const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
    `,
    ],
    [
      "alias settled through Promise.all — R5's regression",
      `
      await page.goto(url);
      const fontsReady = page.evaluate(() => document.fonts.ready);
      await Promise.all([fontsReady]);
      const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
    `,
    ],
    [
      "Promise.all with no navigating sibling",
      `
      await page.goto(url);
      await Promise.all([page.evaluate(() => document.fonts.ready), page.waitForTimeout(1)]);
      const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
    `,
    ],
  ])("CORRECT: %s is not reported", (_label, body) => {
    // A guard that fails valid code teaches contributors to work around it.
    // These three all settle the promise before the read; each was REJECTED by
    // an over-eager repair, which is the failure mode this block pins.
    expect(analyzeSource("valid.spec.ts", wrap(body))).toEqual([]);
  });

  test("CORRECT: a COMMENTED-OUT measurement is not a measurement", () => {
    // Symmetric to M16 on the wait side. A call's source range includes the
    // comments inside it, so text matching read this as a live measurement and
    // failed correct code.
    const source = wrap(`
      await page.goto(url);
      // const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
      await expect(page.locator("#x")).toBeVisible();
    `);
    expect(analyzeSource("commented.spec.ts", source)).toEqual([]);
  });

  test("a helper that waits counts for its callers", () => {
    const source = `import { test } from "@playwright/test";
async function settleFonts(page) {
  await page.evaluate(() => document.fonts.ready);
}
test("t", async ({ page }) => {
  await page.goto(url);
  await settleFonts(page);
  const box = await page.getByTestId("x").evaluate((n) => n.getBoundingClientRect().height);
});
`;
    expect(analyzeSource("helper.spec.ts", source)).toEqual([]);
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
