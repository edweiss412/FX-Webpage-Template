/**
 * tests/e2e/step3-finalize-progress.layout.spec.ts
 *
 * The three questions this arc cannot answer in jsdom:
 *
 *  1. What colour does the finalize <progress> paint? (FINALIZE-PROGRESSBAR-UNTHEMED-1)
 *  2. Does the prefers-reduced-motion override survive Chromium's selector parser?
 *     A selector list mixing ::-webkit-progress-bar with ::-moz-progress-bar is
 *     invalid AS A WHOLE in any engine that knows only one of them, so the rule
 *     is dropped. Firefox aliases the webkit form and keeps it; Chromium and
 *     WebKit do not. Measured on all three bundled engines before this suite was
 *     written.
 *  3. How tall is the sticky footer at 375px, and does a noun after the count
 *     change that? (FINALIZE-COMPACT-COUNT-NOUN-1)
 *
 * jsdom computes no layout and paints no pseudo-element, so none of the three is
 * reachable there. The existing structural guard says so itself
 * (tests/styles/progressShimmerPseudoElements.test.ts: "Full visual confirmation
 * still needs a real browser").
 */
import { test, expect } from "./helpers/fontFidelityFixture";
import type { Page } from "@playwright/test";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { bundleLiveEntry, compileEntryCss } from "./helpers/liveEntryToolchain";

const REPO_ROOT = resolve(__dirname, "..", "..");

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "step3-finalize-progress-"));

  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  // A second page with NO bundle: two bare <progress> elements carrying the two
  // testids. It exists so the CSS can be measured without the React tree, which
  // keeps the colour and reduced-motion cases independent of whether the wizard
  // reaches its running state. The components' own emission of these testids is
  // pinned separately in jsdom (tests/components/admin/FinalizeButton.test.tsx),
  // so the pair of suites closes what neither closes alone.
  writeFileSync(
    join(workDir, "bars.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg">
<!-- Every element carries a UNIQUE id and is selected by it. Selecting by testid
     here would be ambiguous: each testid appears twice on this page, once
     determinate and once indeterminate, which is the point of the page.

     Size comes from a style attribute, not Tailwind utilities. The compiled
     stylesheet only generates classes the @source files mention, and this page
     is not one of them — it would work today only because the two components
     happen to use the same utilities, which is a dependency this page should
     not have. The CSS under test is the progress[data-testid=...] selector set,
     and nothing here should be able to affect it. -->
<progress id="step2-det" data-testid="wizard-step2-progressbar" style="height:8px;width:100%" max="4" value="2"></progress>
<progress id="finalize-det" data-testid="wizard-finalize-progressbar" style="height:8px;width:100%" max="4" value="2"></progress>
<progress id="step2-ind" data-testid="wizard-step2-progressbar" style="height:8px;width:100%"></progress>
<progress id="finalize-ind" data-testid="wizard-finalize-progressbar" style="height:8px;width:100%"></progress>
</body></html>`,
  );

  bundleLiveEntry({
    entry: join(REPO_ROOT, "tests", "e2e", "_step3FinalizeProgressLiveEntry.tsx"),
    outFile: join(workDir, "bundle.js"),
    aliases: {
      "next/navigation": join(REPO_ROOT, "tests", "e2e", "_nextNavigationStub.ts"),
      "node:crypto": join(REPO_ROOT, "tests", "e2e", "_nodeCryptoStub.ts"),
    },
    metafilePath: join(workDir, "meta.json"),
  });

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    [
      `@source "${join(REPO_ROOT, "components", "admin", "FinalizeButton.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "wizard", "Step3ReviewWithFinalize.tsx")}";`,
      `@source "${join(REPO_ROOT, "tests", "e2e", "_step3FinalizeProgressLiveEntry.tsx")}";`,
      globals,
    ].join("\n"),
  );
  compileEntryCss({ entryCss, outFile: join(workDir, "out.css") });

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "live.html" : url.replace(/^\//, "");
    try {
      const body = readFileSync(join(workDir, file));
      res.setHeader(
        "content-type",
        file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : "text/html",
      );
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}/`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
}

/**
 * Sample the ACTUAL PAINTED PIXELS of a progress bar.
 *
 * Computed style cannot answer this. Probed on Chromium: with the element red, its
 * ::-webkit-progress-bar green and its ::-webkit-progress-value blue,
 * `getComputedStyle(el, pseudo).backgroundColor` returns RED for all three — the
 * engine reports the ELEMENT's style and never the pseudo's. That is not specific to
 * `animation-name`; it holds for every property, so no computed-style read can
 * distinguish a themed bar from an unthemed one. WebKit exposes even less.
 *
 * Pixels are the only oracle for "does it paint the accent". Screenshot the element,
 * decode it inside the browser via a canvas, and read the two regions: the bar is
 * value/max = 1/2 filled, so a sample at 25% of the width is inside the FILL and one
 * at 85% is inside the TRACK.
 */
async function samplePaint(page: Page, id: string) {
  const shot = await page.locator(`#${id}`).screenshot();
  const dataUrl = `data:image/png;base64,${shot.toString("base64")}`;
  return page.evaluate(async (url) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const at = (fx: number) => {
      const d = ctx.getImageData(
        Math.floor(img.naturalWidth * fx),
        Math.floor(img.naturalHeight / 2),
        1,
        1,
      ).data;
      return `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
    };
    return { fill: at(0.25), track: at(0.85), width: img.naturalWidth };
  }, dataUrl);
}

/** The resolved value of a token on the live page, so nothing is hardcoded. */
const token = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

/** #ff8c1a and friends are authored as hex; compare in the rgb() form pixels come back as. */
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "").trim();
  const n = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h,
    16,
  );
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

test("the finalize bar paints the FXAV accent, and its track follows the theme", async ({
  page,
}) => {
  await page.goto(baseUrl + "bars.html");

  await setTheme(page, "light");
  const lightAccent = hexToRgb(await token(page, "--color-accent"));
  const lightRaised = hexToRgb(await token(page, "--color-surface-raised"));
  const lightFinalize = await samplePaint(page, "finalize-det");
  const lightStep2 = await samplePaint(page, "step2-det");

  await setTheme(page, "dark");
  const darkAccent = hexToRgb(await token(page, "--color-accent"));
  const darkRaised = hexToRgb(await token(page, "--color-surface-raised"));
  const darkFinalize = await samplePaint(page, "finalize-det");
  const darkStep2 = await samplePaint(page, "step2-det");

  // PREMISE. Two unstyled <progress> elements agree with each other too, so sibling
  // equality proves nothing on its own. These pin the sampled values to the tokens
  // before any equality is asserted, which is what makes the comparison mean "themed"
  // rather than merely "identical".
  expect(lightFinalize.width, "premise: the element rendered with real width").toBeGreaterThan(20);
  expect(lightRaised, "premise: the light track token resolves").toMatch(/^rgb\(\d+, \d+, \d+\)$/);
  expect(darkRaised, "premise: the dark track token differs from the light one").not.toBe(
    lightRaised,
  );

  // AC-1: the FILL paints the accent, in both themes, as actually rendered.
  expect(lightFinalize.fill, "the finalize fill paints the accent in light").toBe(lightAccent);
  expect(darkFinalize.fill, "the finalize fill paints the accent in dark").toBe(darkAccent);

  // The accent is theme-invariant by design (one signature accent), so the fill does
  // not move across themes...
  expect(lightAccent, "one signature accent, both themes").toBe(darkAccent);

  // ...while the TRACK does. This is what makes the theme dimension discriminate: a UA
  // bar responds to neither theme, which is exactly the row's complaint.
  expect(lightFinalize.track, "the light track paints the raised surface").toBe(lightRaised);
  expect(darkFinalize.track, "the dark track paints the raised surface").toBe(darkRaised);
  expect(lightFinalize.track, "the track follows the theme").not.toBe(darkFinalize.track);

  // AC-2: the two wizard bars are siblings, in each theme.
  expect(lightFinalize.fill).toBe(lightStep2.fill);
  expect(lightFinalize.track).toBe(lightStep2.track);
  expect(darkFinalize.fill).toBe(darkStep2.fill);
  expect(darkFinalize.track).toBe(darkStep2.track);
});

/**
 * AC-3, asserted through the CSSOM rather than computed style.
 *
 * Probe 3: Chromium reports `animation-name: none` on ::-webkit-progress-bar
 * even while the shimmer is applied, and WebKit exposes neither vendor pseudo.
 * So a computed-style read is vacuous in exactly the two engines this repair is
 * for — it returns "none" whether the override worked, the rule was dropped, or
 * the shimmer never applied. Firefox is the only engine that answers, and it is
 * the one engine where the grouped rule already worked.
 *
 * A rule absent from document.styleSheets cannot apply, and presence is exactly
 * what a mixed-vendor selector list decides. That is the oracle.
 *
 * AN EARLIER DRAFT OF THIS FILE ASSERTED THE COMPUTED animation-name INSTEAD, and it
 * was deleted rather than kept alongside: Chromium reports "none" on
 * ::-webkit-progress-bar even while the shimmer IS applied, and WebKit exposes neither
 * vendor pseudo, so that assertion reads "none" whether the override worked, the rule
 * was dropped, or the shimmer never applied. It is vacuous three ways in exactly the two
 * engines this repair is for. Firefox is the only engine that answers, and Firefox is
 * the one engine where the grouped rule already worked. Do not re-add it.
 *
 * Titled `engine:` because the WebKit project greps on that prefix: this is the one
 * assertion here whose answer is per-engine. The accent paint and the footer geometry
 * are engine-general and stay chromium-only, where layout noise is least.
 */
test("engine: the reduced-motion override survives this engine's selector parser", async ({
  page,
}) => {
  await page.goto(baseUrl + "bars.html");

  const parsed = await page.evaluate(() => {
    const found: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRule[];
      try {
        rules = Array.from(sheet.cssRules);
      } catch {
        continue; // cross-origin sheet; ours is same-origin
      }
      const walk = (list: CSSRule[]) => {
        for (const rule of list) {
          if (rule instanceof CSSMediaRule) {
            if (/prefers-reduced-motion/.test(rule.conditionText)) walk(Array.from(rule.cssRules));
          } else if (rule instanceof CSSStyleRule) {
            found.push(rule.selectorText);
          }
        }
      };
      walk(rules);
    }
    return found;
  });

  // PREMISE: the page must have parsed the project stylesheet at all. Without
  // this an empty `parsed` — a 404 on out.css, a compile that produced nothing —
  // satisfies every "not present" check below and would satisfy a naive
  // "present" check by failing for the wrong reason.
  expect(
    parsed.length,
    "premise: the compiled stylesheet must be parsed and contain reduced-motion rules",
  ).toBeGreaterThan(0);

  const webkitTrack = parsed.filter(
    (s) => s.includes("::-webkit-progress-bar") && s.includes("wizard-finalize-progressbar"),
  );
  expect(
    webkitTrack.length,
    "this engine must parse a reduced-motion rule covering the finalize bar's webkit track — " +
      "a selector list mixing the two vendor pseudo-elements is invalid as a whole and is dropped here",
  ).toBeGreaterThan(0);

  // …and that rule must not carry the Mozilla pseudo, which is what would
  // invalidate it. Asserted on the parsed text, so it measures what the engine
  // accepted rather than what the source file says.
  for (const s of webkitTrack) {
    expect(s, "the parsed rule must be single-vendor").not.toContain("-moz-progress-bar");
  }
});

const FOOTER_CENTER = '[data-testid="wizard-step3-footer-center"]';
const TRACKING = '[data-testid="wizard-step3-tracking"]';
const HEADING = '[data-testid="wizard-step3-tracking-heading"]';

/**
 * Drive the compact renderer into the running batch phase and wait for it, per the
 * harness readiness gate: the window hook first, then the renderer's own testid, then
 * the element each push mutates.
 */
async function runningCompact(page: Page, done: number, total: number) {
  await page.goto(baseUrl + "live.html?r=compact");
  await page.waitForFunction(() => typeof window.__setCounts === "function");
  await page.getByTestId("wizard-finalize-button").click();
  await page.evaluate(([d, t]) => window.__setCounts?.(d as number, t as number), [done, total]);
  await page.locator(HEADING).waitFor();
  // Wait for the element the PUSH creates, not just the one the phase change does.
  // The heading renders in the running state whether or not any row event has landed,
  // so awaiting it alone returns before `state.total > 0` and the count element does
  // not exist yet — which surfaced as "no count element beside the heading", and only
  // in the full-file run, where the timing differed from running this test alone.
  await page.locator(`${TRACKING} .shrink-0`).waitFor();
}

test("the compact tracking reaches its running state", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await runningCompact(page, 1, 2);
  await expect(page.locator(TRACKING)).toBeVisible();
  await expect(page.locator(FOOTER_CENTER)).toBeVisible();
  expect(await page.locator(HEADING).textContent()).toContain("Setting up your shows");
});

/**
 * One evaluate per sample. Two Locator reads would let actionability scroll between
 * them, and a scrolled read is a different rect.
 *
 * `oneLineHeight` is measured on THIS page from a probe span carrying the heading's own
 * computed font, so the single-line test compares against a measured baseline rather
 * than a hardcoded pixel value.
 *
 * NOT getClientRects().length. Measured while designing this: a wrapped heading in this
 * flex row reports ONE rect while standing 34px tall, because the span is a flex item
 * and its rect is the border box, not a line box. A rect-count assertion reads 1 for a
 * two-line heading and passes exactly where it must fail.
 */
async function sampleFooter(page: Page, countText: string | null) {
  return page.evaluate((text) => {
    const footer = document.querySelector('[data-testid="wizard-step3-footer-center"]');
    const tracking = document.querySelector('[data-testid="wizard-step3-tracking"]');
    const heading = document.querySelector('[data-testid="wizard-step3-tracking-heading"]');
    if (!footer || !tracking || !heading) throw new Error("compact tracking is not mounted");

    if (text !== null) {
      // The count is the heading row's only shrink-0 node; the shipped element carries
      // no testid of its own. Selected within the heading's own row, so a shrink-0
      // elsewhere in the footer cannot be picked up by mistake.
      const count = heading.parentElement?.querySelector(".shrink-0");
      if (!count) throw new Error("no count element beside the heading");
      count.textContent = text;
    }

    const cs = getComputedStyle(heading);
    const probe = document.createElement("span");
    probe.textContent = "Mg";
    probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${cs.font}`;
    document.body.appendChild(probe);
    const oneLineHeight = probe.getBoundingClientRect().height;
    probe.remove();

    const h = (el: Element) => el.getBoundingClientRect().height;
    return {
      footerHeight: h(footer),
      trackingHeight: h(tracking),
      headingHeight: h(heading),
      oneLineHeight,
      countText: (heading.parentElement?.querySelector(".shrink-0")?.textContent ?? "").trim(),
    };
  }, countText);
}

const LADDER = [
  { done: 1, total: 2 },
  { done: 9, total: 12 },
  { done: 12, total: 12 },
  { done: 99, total: 120 },
  { done: 120, total: 120 },
  // Deliberately past any plausible folder: state.total is unbounded (it accumulates
  // across batches), so the ladder must probe beyond the realistic range to say
  // anything about the guarantee rather than about the counts that happened to be
  // sampled.
  // MEASURED 2026-08-31, at 375px against the real footer: every rung above holds one
  // line WITHOUT the truncate fix, and so does 999/9999/99999. The heading only wraps at
  // six digits. So the noun fits at every count anyone will ever see, and this last rung
  // is the only one that can be red — it exists because `state.total` is unbounded
  // (it accumulates across batches from the Drive folder's file count), and a ladder of
  // reachable values authorizes nothing about the value above it. The fix converts a
  // measured property into a structural one; this rung is what proves it did.
  { done: 999999, total: 999999 },
] as const;

test("the compact heading holds one line at 375px at any count", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await runningCompact(page, 1, 2);

  const rows: string[] = [];
  for (const { done, total } of LADDER) {
    const bare = `${done} of ${total}`;
    const withNoun = `${bare} show${total === 1 ? "" : "s"}`;

    const b = await sampleFooter(page, bare);
    // PREMISE, on this rung's OWN inputs: the bare form must render one line before the
    // noun is added, or the comparison below is between two already-broken states.
    expect(b.headingHeight, `premise: ${bare} renders a one-line heading`).toBeLessThanOrEqual(
      b.oneLineHeight + 0.5,
    );
    expect(b.countText, `premise: the bare count actually rendered`).toBe(bare);

    const n = await sampleFooter(page, withNoun);
    // PREMISE: the two samples must differ in text. Without this a harness bug that
    // rendered the bare count twice reports equal heights and passes.
    expect(n.countText, `premise: the noun-bearing count differs from the bare one`).toBe(withNoun);

    rows.push(
      `| ${withNoun} | ${b.footerHeight.toFixed(1)} | ${n.footerHeight.toFixed(1)} | ` +
        `${b.headingHeight.toFixed(1)} | ${n.headingHeight.toFixed(1)} | ${n.oneLineHeight.toFixed(1)} |`,
    );

    expect(
      n.headingHeight,
      `the heading must hold ONE line with the noun at ${withNoun}`,
    ).toBeLessThanOrEqual(n.oneLineHeight + 0.5);
    expect(n.footerHeight, `the footer height must not move at ${withNoun}`).toBe(b.footerHeight);
  }

  console.log(
    [
      "| count | footer bare | footer + noun | heading bare | heading + noun | one line |",
      "| --- | --- | --- | --- | --- | --- |",
      ...rows,
    ].join("\n"),
  );
});

test("the CAS column spends no gap on an empty phase label", async ({ page }) => {
  // THE ORACLE IS THE PARENT'S GEOMETRY, not the child's.
  //
  // Asserting the phase element "contributes no extent" would not be red: an empty
  // block already has zero height. The defect is that a zero-height IN-FLOW item still
  // charges its parent's `gap`, so the column is one gap taller than its content and
  // the surface shows a seam nothing accounts for. The discriminating comparison is the
  // column's height with the empty element present against its height with that element
  // removed from the DOM entirely — they differ by exactly one gap before the fix and
  // must be equal after.
  //
  // Measured by removing the element rather than against a hardcoded gap value, so a
  // later spacing-token change cannot silently make this pass.
  await page.setViewportSize({ width: 375, height: 720 });
  await runningCompact(page, 2, 2);
  await page.evaluate(() => window.__enterCas?.());
  await page
    .locator('[data-testid="wizard-step3-tracking-cas-phase"]')
    .waitFor({ state: "attached" });

  const { withEmpty, without, labelText, gap } = await page.evaluate(() => {
    const col = document.querySelector('[data-testid="wizard-step3-tracking"]')!;
    const label = document.querySelector('[data-testid="wizard-step3-tracking-cas-phase"]')!;
    const gapPx = parseFloat(getComputedStyle(col).rowGap || "0");
    const before = col.getBoundingClientRect().height;
    const parent = label.parentElement!;
    const next = label.nextSibling;
    label.remove();
    const after = col.getBoundingClientRect().height;
    parent.insertBefore(label, next);
    return {
      withEmpty: before,
      without: after,
      labelText: (label.textContent ?? "").trim(),
      gap: gapPx,
    };
  });

  // PREMISE: the label really is EMPTY on this run. casPhaseLabel returns "" before the
  // first phase event, and if a phase HAD arrived the element would carry text and the
  // comparison below would be measuring something else entirely.
  expect(labelText, "premise: the phase label is empty at CAS entry").toBe("");
  // PREMISE: the column actually spends a gap, or there is nothing to charge.
  expect(gap, "premise: the CAS column has a non-zero row gap").toBeGreaterThan(0);

  expect(
    withEmpty,
    "an empty in-flow child must not charge the column's gap once empty:hidden takes it out of flow",
  ).toBe(without);
});
