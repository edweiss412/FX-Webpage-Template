/**
 * tests/e2e/wifi-password-row.layout.spec.ts
 * (spec 2026-08-10-wifi-password-legibility §"Dimensional Invariants", §6 (b))
 *
 * Real-browser geometry for the Wi-Fi password copy control. jsdom computes no
 * layout, so every claim below needs a real engine.
 *
 * WHAT LIVES HERE AND WHAT DOES NOT. The production crew route renders the
 * password row exactly ONCE, so the oracles that need the SAME row rendered
 * twice — with a copy control versus with an icon — and the two list positions
 * (mid-list versus the `last:pb-0` last row) are unreachable there. They live
 * here. The live-route oracles (the seeded value, the page's other interactive
 * elements, card containment on the real page) live in
 * tests/e2e/crew-page.spec.ts and are deliberately not duplicated.
 *
 * LIVE ENTRY, NOT TRANSCRIBED MARKUP (spec §6 (b), the rule at
 * tests/e2e/tap-target-floor.layout.spec.ts:8). This spec's subject is whether
 * particular class strings sit on particular elements, so a harness holding its
 * own copy of those strings would pass with the corrected copy while production
 * stayed unrepaired. tests/e2e/_wifiPasswordRowLiveEntry.tsx imports the REAL
 * components; this file bundles it out of process through the UNMODIFIED
 * tests/e2e/_step3ReviewModalBundle.mjs (this graph reaches no `"use server"`
 * module, so no sibling bundler is needed).
 *
 * `test` is bound from ./helpers/fontFidelityFixture, never @playwright/test:
 * tests/e2e/_metaFontFidelityWiring.test.ts walks every spec containing
 * `compileEntryCss` and fails-by-default on the wrong binding. This file's stem
 * is enrolled in the CALLERS registry at tests/e2e/_metaFontWaitCoverage.test.ts.
 *
 * Run:
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts \
 *     wifi-password-row
 */
import { test, expect } from "./helpers/fontFidelityFixture";
import type { Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { compileEntryCss } from "./helpers/liveEntryToolchain";
import { premise, premiseHolds } from "../_shared/premise";

const REPO_ROOT = resolve(__dirname, "..", "..");

/** `--spacing-tap-min: 44px` (app/globals.css). */
const TAP_MIN = 44;
/** The painted tile inside the target — `size-7`. */
const VISUAL_TILE = 28;
/** `focus-visible:ring-2` + `focus-visible:ring-offset-2` reach beyond the
 *  border box. Only the FALLBACK figure — DI-5 prefers the outline reach it
 *  measures, and uses this only when the box-shadow is the sole indicator. */
const RING_PAINT = 4;
/** Sub-pixel tolerance for every comparison in this file. */
const EPS = 0.5;
/** The mobile-first width every case is measured at. */
const WIDTH = 390;

type Box = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

let workDir = "";
let server: Server;
let baseUrl = "";

test.beforeAll(async ({ browser }) => {
  workDir = mkdtempSync(join(tmpdir(), "wifi-password-row-"));

  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  execFileSync(
    process.execPath,
    [
      join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalBundle.mjs"),
      join(REPO_ROOT, "tests", "e2e", "_wifiPasswordRowLiveEntry.tsx"),
      join(workDir, "bundle.js"),
      join(REPO_ROOT, "tsconfig.json"),
    ],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );

  // EVERY directory the entry's import graph paints from needs an @source line.
  // A missing one silently drops the utilities under test from the stylesheet,
  // and every invariant then fails with a misleading rect rather than a missing
  // class. `components/admin` is not decorative: the copy island renders the
  // shared AnnounceLogRegion from there.
  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    [
      `@source "${join(REPO_ROOT, "components", "crew")}";`,
      `@source "${join(REPO_ROOT, "components", "admin")}";`,
      `@source "${join(REPO_ROOT, "tests", "e2e", "_wifiPasswordRowLiveEntry.tsx")}";`,
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
  baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/`;

  // Prove the harness mounts ONCE, here, rather than in every case. A page that
  // throws would otherwise make each case spend its own readiness timeout
  // rediscovering the same fact, and print "Test timeout exceeded" — which names
  // the symptom and hides every cause.
  const probe = await browser.newPage();
  try {
    await boot(probe);
  } finally {
    await probe.close();
  }
});

test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

/**
 * Navigate, wait for the React commit AND for island hydration, then settle
 * fonts before the first measurement. Never networkidle: the harness serves
 * three static files, so networkidle says nothing about whether React ran.
 */
async function boot(page: Page): Promise<void> {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  const requestFailures: string[] = [];
  page.on("requestfailed", (r) => requestFailures.push(`${r.url()} ${r.failure()?.errorText}`));

  await page.setViewportSize({ width: WIDTH, height: 900 });
  await page.goto(baseUrl);
  try {
    await page.waitForSelector('body[data-harness-ready="true"]', { timeout: 15_000 });
  } catch {
    const diag = await page
      .evaluate(() => ({
        rootChildren: document.getElementById("root")?.childElementCount ?? -1,
        readyAttr: document.body.getAttribute("data-harness-ready"),
        bodyHtmlHead: document.body.innerHTML.slice(0, 400),
      }))
      .catch((e: unknown) => ({ evaluateFailed: String(e) }));
    throw new Error(
      `harness never reached data-harness-ready.\n` +
        `pageerrors: ${JSON.stringify(pageErrors)}\n` +
        `console errors: ${JSON.stringify(consoleErrors)}\n` +
        `failed requests: ${JSON.stringify(requestFailures)}\n` +
        `dom: ${JSON.stringify(diag)}`,
    );
  }

  // HYDRATION, not merely commit. An island that never hydrated is still laid
  // out, so every geometry assertion below would pass against a dead control.
  // This gate is distinct from document.fonts.ready and from the ready flag.
  await expect(
    page.locator('[data-testid="mid-password"] button[aria-label="Copy the Wi-Fi password"]'),
  ).toBeEnabled({ timeout: 15_000 });

  // Bounded in-page: a never-settling font promise would otherwise be
  // indistinguishable from a slow one and would burn the whole timeout.
  const fontsSettled = await page.evaluate(async () => {
    const settled = await Promise.race([
      document.fonts.ready.then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 15_000)),
    ]);
    return settled;
  });
  premiseHolds(
    `document.fonts.ready settled before measurement ` +
      `(failed requests: ${JSON.stringify(requestFailures)})`,
    fontsSettled,
  );
}

/**
 * One layout snapshot for a whole mount. Every rect the case compares is read
 * inside a SINGLE evaluate: two Locator reads are two snapshots taken at
 * different moments, and Playwright's actionability checks scroll between them,
 * which manufactures overlaps that were never on screen together.
 *
 * Every element is re-queried INSIDE the browser call, so no handle is ever
 * held across a render.
 */
async function readMount(page: Page, mount: string, passwordTestId: string) {
  return page.evaluate(
    ({ mount, passwordTestId }) => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        return {
          top: r.top,
          left: r.left,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        };
      };
      const scope = document.querySelector(`[data-mount="${mount}"]`);
      if (scope === null) return null;
      const row = scope.querySelector(`[data-testid="${passwordTestId}"]`);
      if (row === null) return null;
      const card = scope.querySelector('[data-testid="section-card"]');
      const button = row.querySelector("button");
      const tile = button?.querySelector("span") ?? null;
      // First span inside the dd in document order is the value span; the
      // announce region is a later sibling of the wrapper.
      const valueSpan = row.querySelector("dd span");
      return {
        rowRect: box(row),
        cardRect: card === null ? null : box(card),
        buttonRect: button === null ? null : box(button),
        tileRect: tile === null ? null : box(tile),
        valueRect: valueSpan === null ? null : box(valueSpan),
        // One rect per line box of the TEXT, so the length IS the rendered line
        // count. A Range and not `valueSpan.getClientRects()`: on an opted-in
        // row the value span is a flex ITEM of the control wrapper, so it is
        // blockified and reports exactly ONE rect however many lines it renders
        // — which read as "never wrapped" on a value that had already wrapped
        // into three lines. The Range walks the text, which stays inline.
        valueLineCount: (() => {
          if (valueSpan === null) return 0;
          const range = document.createRange();
          range.selectNodeContents(valueSpan);
          return range.getClientRects().length;
        })(),
        valueText: valueSpan?.textContent ?? "",
        rows: Array.from(scope.querySelectorAll('[data-testid="fact-rows"] > div')).map((el) => {
          const cs = getComputedStyle(el);
          return {
            testId: el.getAttribute("data-testid") ?? "",
            hasIcon: el.querySelector('[data-slot="fact-row-icon"]') !== null,
            hasControl: el.querySelector("button") !== null,
            rect: box(el),
            // `first:pt-0` / `last:pb-0` mean a row's BORDER-BOX height encodes
            // its list position as well as its content. A cross-row height
            // comparison is only about content when the padding matches, so the
            // padding travels with the rect and DI-1 asserts it.
            padTop: parseFloat(cs.paddingTop),
            padBottom: parseFloat(cs.paddingBottom),
          };
        }),
      };
    },
    { mount, passwordTestId },
  );
}

const overlaps = (a: Box, b: Box): boolean =>
  a.left < b.right - EPS &&
  b.left < a.right - EPS &&
  a.top < b.bottom - EPS &&
  b.top < a.bottom - EPS;

// ---------------------------------------------------------------------------
// Counterfactual heights — the oracle that cannot exist on the production route
// ---------------------------------------------------------------------------

test("DI-1: the control row is exactly as tall as the same row carrying an icon", async ({
  page,
}) => {
  await boot(page);
  const m = await readMount(page, "counterfactual", "cf-with-control");
  expect(m, "the counterfactual mount must render").not.toBeNull();

  const byId = new Map(m!.rows.map((r) => [r.testId, r]));
  const withControl = byId.get("cf-with-control");
  const withIcon = byId.get("cf-with-icon");
  premiseHolds(
    "all three counterfactual rows rendered (same value, three treatments)",
    withControl !== undefined && withIcon !== undefined && byId.has("cf-bare"),
  );
  premiseHolds("the control row really carries a control", withControl!.hasControl);
  premiseHolds("the icon row really carries an icon", withIcon!.hasIcon);
  // Without this the comparison silently measures `first:pt-0` / `last:pb-0`
  // instead of the control: the three rows sat at positions 1..3 of a 3-row
  // list before the entry grew its sandwich rows, and their heights differed by
  // 12px with identical CONTENT. The sandwich is what makes the regime shared;
  // this asserts it rather than trusting the entry to keep it that way.
  const bare = byId.get("cf-bare")!;
  premiseHolds(
    `the three compared rows share a padding regime ` +
      `(got ${[withControl!, withIcon!, bare].map((r) => `${r.padTop}/${r.padBottom}`).join(", ")})`,
    [withIcon!, bare].every(
      (r) =>
        Math.abs(r.padTop - withControl!.padTop) <= EPS &&
        Math.abs(r.padBottom - withControl!.padBottom) <= EPS,
    ),
  );

  // The control's 28px margin box lands the row on the SAME content height every
  // icon-bearing row already has. The oracle is measured equality with such a
  // row — never a hardcoded delta, which would encode today's line-height.
  expect(Math.abs(withControl!.rect.height - withIcon!.rect.height)).toBeLessThanOrEqual(EPS);
});

test("DI-1b: a bare-text row is STRICTLY shorter than the control row", async ({ page }) => {
  await boot(page);
  const m = await readMount(page, "counterfactual", "cf-with-control");
  const byId = new Map(m!.rows.map((r) => [r.testId, r]));
  const withControl = byId.get("cf-with-control")!;
  const bare = byId.get("cf-bare")!;
  premiseHolds("the bare row carries neither icon nor control", !bare.hasIcon && !bare.hasControl);

  // Equality with the icon row alone would still pass if the control changed
  // nothing at all and both rows were bare. This inequality is what proves the
  // control raised the height.
  expect(bare.rect.height).toBeLessThan(withControl!.rect.height - EPS);
});

// ---------------------------------------------------------------------------
// Both topologies — mid-list and the `last:pb-0` last row
// ---------------------------------------------------------------------------

for (const [mount, testId] of [
  ["mid-list", "mid-password"],
  ["last-row", "last-password"],
] as const) {
  test(`DI-2 (${mount}): the target is 44x44 with its right edge pinned to the row edge`, async ({
    page,
  }) => {
    await boot(page);
    const m = await readMount(page, mount, testId);
    expect(m?.buttonRect, `the ${mount} copy control must render`).not.toBeNull();
    const button = m!.buttonRect!;

    expect(Math.abs(button.width - TAP_MIN)).toBeLessThanOrEqual(EPS);
    expect(Math.abs(button.height - TAP_MIN)).toBeLessThanOrEqual(EPS);
    // The painted tile stays 28px — the target grew, the visual did not.
    expect(Math.abs(m!.tileRect!.width - VISUAL_TILE)).toBeLessThanOrEqual(EPS);
    expect(Math.abs(m!.tileRect!.height - VISUAL_TILE)).toBeLessThanOrEqual(EPS);

    // Margin-right is 0 by construction, so this is EXACT: a verbatim `-m-2`
    // would protrude 8px past the row edge.
    expect(Math.abs(button.right - m!.rowRect.right)).toBeLessThanOrEqual(EPS);
  });

  test(`DI-3 (${mount}): the target sits inside the SectionCard border box`, async ({ page }) => {
    await boot(page);
    const m = await readMount(page, mount, testId);
    const button = m!.buttonRect!;
    const card = m!.cardRect!;
    expect(card, `the ${mount} mount must render a SectionCard`).not.toBeNull();

    // Containment is CARD-scoped, never row-scoped. `last:pb-0` makes the last
    // row's box shorter than the target, so the target legitimately reaches into
    // the card's own padding — the card's BORDER box is the true boundary,
    // because its CSS content box excludes exactly that padding.
    expect(button.top).toBeGreaterThanOrEqual(card.top - EPS);
    expect(button.bottom).toBeLessThanOrEqual(card.bottom + EPS);
    expect(button.left).toBeGreaterThanOrEqual(card.left - EPS);
    expect(button.right).toBeLessThanOrEqual(card.right + EPS);
  });

  test(`DI-4 (${mount}): the target is disjoint from every other row's box`, async ({ page }) => {
    await boot(page);
    const m = await readMount(page, mount, testId);
    const button = m!.buttonRect!;
    const others = m!.rows.filter((r) => r.testId !== testId);
    premise(`the ${mount} mount renders sibling rows`, others.length, 0);

    for (const other of others) {
      expect(overlaps(button, other.rect), `target overlaps row ${other.testId}`).toBe(false);
    }
  });
}

test("DI-3b: the last-row topology really is the shortened one, or DI-3 proves nothing", async ({
  page,
}) => {
  await boot(page);
  const last = await readMount(page, "last-row", "last-password");
  const mid = await readMount(page, "mid-list", "mid-password");

  // The whole reason containment is card-scoped: `last:pb-0` drops 12px, so the
  // last row's box is SHORTER than the 44px target it holds. If this stopped
  // being true, DI-3's card-scoped claim would be measuring nothing that a
  // row-scoped claim could not.
  premise(
    "the last row's box is shorter than the mid-list row's",
    mid!.rowRect.height,
    last!.rowRect.height,
  );
  expect(last!.rowRect.height).toBeLessThan(TAP_MIN - EPS);
  expect(last!.buttonRect!.bottom).toBeGreaterThan(last!.rowRect.bottom + EPS);
});

// ---------------------------------------------------------------------------
// Focus ring
// ---------------------------------------------------------------------------

test("DI-5: the FOCUSED indicator paints and its measured reach clears the value text", async ({
  page,
}) => {
  await boot(page);

  // KEYBOARD focus, never `element.focus()`. `:focus-visible` is a modality
  // question — a programmatic focus does not match it, so every
  // `focus-visible:` declaration stays inert and the engine paints its own
  // default outline instead. This harness runs under chromium, where Tab does
  // reach a <button>; the production-route spec runs under WebKit, which
  // follows the macOS "Press Tab to highlight each item" setting and never
  // lands Tab on a button at all. That engine split is exactly why the ring's
  // PAINT is measured here and only its DECLARATIONS are checked there.
  const TAB_BUDGET = 40;
  let reached = false;
  for (let i = 0; i < TAB_BUDGET && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(() => {
      const button = document.querySelector('[data-testid="mid-password"] button');
      return button !== null && document.activeElement === button;
    });
  }
  premiseHolds(`the copy control is reachable by Tab within ${TAB_BUDGET} presses`, reached);

  const focused = await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('[data-testid="mid-password"] button');
    if (button === null) return null;
    const style = getComputedStyle(button);
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return {
        top: r.top,
        left: r.left,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    return {
      isFocused: document.activeElement === button,
      matchesFocusVisible: button.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      outlineWidth: parseFloat(style.outlineWidth),
      outlineOffset: parseFloat(style.outlineOffset),
      boxShadow: style.boxShadow,
      buttonRect: box(button),
      valueRect: box(button.closest("dd")!.querySelector("span")!),
    };
  });
  expect(focused, "the copy control must be focusable").not.toBeNull();

  // The ring being measured is proven to EXIST first. Without this, an omitted
  // ring would satisfy the disjointness assertion trivially and forever.
  premiseHolds("the control took focus", focused!.isFocused);
  premiseHolds("the control matches :focus-visible", focused!.matchesFocusVisible);

  // WHAT PAINTS IS MEASURED, NOT ASSUMED — and it is not what the component's
  // class string alone would suggest. `focus-visible:outline-none` is a
  // Tailwind utility and therefore sits in `@layer utilities`, while
  // app/globals.css:788 declares `:focus-visible { outline: 3px solid
  // var(--color-focus-ring); outline-offset: 2px }` UNLAYERED — and an
  // unlayered declaration wins over any layered one regardless of specificity.
  // So the indicator this control actually paints is the project's global
  // 3px/2px outline, with the `ring-2`/`ring-offset-2` box-shadow underneath
  // it in the same focus-ring color. That is true of all ~256 call sites
  // carrying the same `focus-visible:outline-none` + ring idiom, so it is the
  // project's focus treatment rather than a defect in this control; this spec
  // measures the reach that RESULTS and asserts the value text survives it.
  const outlineReach =
    focused!.outlineStyle === "none"
      ? 0
      : focused!.outlineWidth + Math.max(focused!.outlineOffset, 0);
  premiseHolds(
    `focus-visible paints an indicator ` +
      `(outline ${focused!.outlineStyle} ${focused!.outlineWidth}px @ ${focused!.outlineOffset}px, ` +
      `box-shadow ${focused!.boxShadow})`,
    outlineReach > 0 || focused!.boxShadow !== "none",
  );
  // The larger of the two paints is what has to clear the text. The ring figure
  // is the fallback for the case where the box-shadow is the only indicator.
  const reach = Math.max(outlineReach, focused!.boxShadow === "none" ? 0 : RING_PAINT);

  const inflated = {
    ...focused!.buttonRect,
    left: focused!.buttonRect.left - reach,
    top: focused!.buttonRect.top - reach,
    bottom: focused!.buttonRect.bottom + reach,
  };
  // `gap-3.5` is 14px and the button reaches 8px leftward, leaving 6px of clear
  // space — which the measured paint has to fit inside.
  expect(
    overlaps(inflated, focused!.valueRect),
    `the focused indicator (${reach}px reach) paints over the value`,
  ).toBe(false);
});

// ---------------------------------------------------------------------------
// Wrap containment
// ---------------------------------------------------------------------------

test("DI-6: a 40-character value WRAPS and the control stays in the row", async ({ page }) => {
  await boot(page);
  const m = await readMount(page, "wrap", "wrap-password");
  expect(m!.valueText.length, "the wrap fixture must really be 40 chars").toBe(40);

  // The line-count oracle is proven to DISCRIMINATE before it is trusted: the
  // short value in the mid-list mount must report exactly one line under the
  // same measurement. Without this, an oracle that answered "many" for
  // everything would satisfy the wrap assertion below forever.
  const short = await readMount(page, "mid-list", "mid-password");
  premiseHolds(
    `the line-count oracle reports 1 for a short value (got ${short!.valueLineCount})`,
    short!.valueLineCount === 1,
  );

  // The wrap is PROVEN before anything is concluded from it: one rect per line
  // box means a single rect is a value that never wrapped, and every assertion
  // below would then be about the ordinary case.
  expect(
    m!.valueLineCount,
    `a 40-char value must wrap at ${WIDTH}px, got ${m!.valueLineCount} line(s)`,
  ).toBeGreaterThanOrEqual(2);

  const button = m!.buttonRect!;
  const card = m!.cardRect!;
  expect(Math.abs(button.right - m!.rowRect.right)).toBeLessThanOrEqual(EPS);
  expect(button.right).toBeLessThanOrEqual(card.right + EPS);
  expect(button.left).toBeGreaterThanOrEqual(card.left - EPS);
  // Wrapping is the point: the value takes more LINES rather than pushing the
  // control out of the row or under the text.
  expect(overlaps(button, m!.valueRect!), "the control overlaps the wrapped value").toBe(false);
});
