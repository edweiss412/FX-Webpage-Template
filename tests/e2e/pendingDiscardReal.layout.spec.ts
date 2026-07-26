/**
 * tests/e2e/pendingDiscardReal.layout.spec.ts
 * Real-TREE layout proof for the pending-discard button pair
 * (spec 2026-07-25-destruct-thumb-order-drift-guard §6.3.a).
 *
 * The sibling `pendingDiscardReflow.layout.spec.ts` transcribes classes into local
 * constants, and a transcription can satisfy every assertion while the SHIPPED
 * component differs — adversarial rounds 2 and 3 both landed on that. Every positive
 * claim therefore lives here, measured against markup the real component rendered.
 *
 * So every POSITIVE claim about the shipped component lives here, measured
 * against markup rendered by the real component tree
 * (`tests/e2e/_pendingDiscardHarness.tsx` renders the real NeedsAttentionInbox,
 * hence the real PendingPanelDiscardButtons inside real card padding, the real
 * action row and the real `Retry now` sibling). The transcribed spec keeps only
 * negative controls — markup the product no longer contains.
 *
 * SCOPE: `renderToStaticMarkup` emits markup, not behaviour. Classes and layout are
 * provable here; client effects (useEffect, timers) stay in the jsdom suite.
 *
 * Runs standalone via tests/e2e/standalone.config.ts (no webServer / Supabase).
 */
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;
const TAP_MIN = 44;
const INGESTION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

/** Live geometries. 320 = dashboard rail (`min-[1240px]:w-80`); 358 = the mobile
 *  Needs-attention page (a 390px viewport minus 16px of page padding per side — R8 F1
 *  caught an earlier 390 here as 32px too wide); 440 = the R9 F1 regression band;
 *  900 = a full-width card. Single source for the widths so a threshold change cannot
 *  leave a panel testing the old boundary. */
/** Rails mirroring live geometry. Content width is the rail minus the card's 42px
 *  (1px borders + 20px p-tile-pad, both sides): 278 / 316 / 398 / 858px. */
/** Rail → button content width (rail minus the card's 42px: 1px borders + 20px
 *  p-tile-pad, both sides). `page358` is a 390px viewport minus the admin layout's
 *  16px `px-page-pad-mobile` per side — R8 F1 caught the earlier 390 as 32px too wide. */
const RAILS = { rail320: 278, page358: 316, band440: 398, wide900: 858 } as const;
type RailName = keyof typeof RAILS;
/** The pair needs 315.95px in BOTH states — Ignore reserves its widest label variant
 *  (IgnoreLabelStack), so idle and armed are dimensionally identical and a knife-edge
 *  width lands the same way in both. Only rail320 definitely wraps.
 *
 *  Historical note, kept because it is why D4 needs a width mechanism at all: the armed
 *  label "Confirm ignore" is SHORTER
 *  than idle "Permanently ignore" — so arming makes the row NARROWER, not wider.
 *  At the real mobile page the idle pair clears its 316px by 0.06px, which is a coin
 *  flip on font metrics, so no rail predicts one-line-vs-stacked any more. The tests
 *  assert the safety property whichever way it lands, plus a definite one-line
 *  expectation only where there is real slack. */
/** R9 F2: this was declared and never used, so nothing required the wide card to stay
 *  on one line — `w-full` on both buttons would have passed D1/D3/D7. It is asserted
 *  explicitly below instead. */
/* Rails with REAL slack, where stacking would mean something regressed rather than the
 * pair honestly not fitting. The pair needs 315.95px, so band440 (398px) clears it by
 * 82px and wide900 (858px) by 542px. R13 F1: only wide900 was required to stay on one
 * line, so a `shrink-0 w-[200px]`-shaped regression could stack the 398px rail while
 * D2/D4/D7 and the wide test all passed. rail320 (278px) genuinely cannot fit and
 * page358 (316px) is a 0.05px coin flip — neither belongs here. */
const SLACK_RAILS: RailName[] = ["band440", "wide900"];

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "pending-discard-real-"));
  const jsonPath = join(workDir, "states.json");

  // The harness's JSX + the real component tree break react-dom/server under
  // Playwright's transform, so it runs OUT of process (same as the modal-header
  // family harnesses).
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_pendingDiscardHarness.tsx"), jsonPath],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );
  const states = JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, string>;

  const body = Object.entries(states)
    .map(([name, html]) => `<section data-state="${name}">${html}</section>`)
    .join("\n");
  const harnessHtml = `<!doctype html><html data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="out.css"></head>
<body class="bg-bg" style="margin:0;padding:16px;">${body}</body></html>`;
  writeFileSync(join(workDir, "harness.html"), harnessHtml);

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(entryCss, `@source "${join(workDir, "harness.html")}";\n${globals}`);
  execFileSync(
    "pnpm",
    ["dlx", "@tailwindcss/cli@4.2.4", "-i", entryCss, "-o", join(workDir, "out.css")],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "harness.html" : url.replace(/^\//, "");
    try {
      const payload = readFileSync(join(workDir, file));
      res.setHeader("content-type", file.endsWith(".css") ? "text/css" : "text/html");
      res.end(payload);
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

type Box = { x: number; y: number; w: number; h: number; bottom: number; right: number };
type Probe = { found: boolean; defer: Box; ignore: Box; contentW: number };

async function probe(page: import("@playwright/test").Page, state: string): Promise<Probe> {
  return page.evaluate(
    ({ state, id }) => {
      const root = document.querySelector(`[data-state="${state}"]`)!;
      const defer = root.querySelector(`[data-testid="admin-pending-defer-${id}"]`);
      const ignore = root.querySelector(`[data-testid="admin-pending-ignore-${id}"]`);
      const ZERO = { x: 0, y: 0, w: 0, h: 0, bottom: 0, right: 0 };
      // PANEL-RELATIVE. The idle and armed panels are separate sections stacked down
      // the page, so comparing absolute coordinates across them measures where the
      // panel sits, not where the button sits — which is a bug in the oracle, not the
      // component. Everything below is relative to this panel's own origin.
      const o = root.getBoundingClientRect();
      const b = (el: Element | null) => {
        if (!el) return ZERO;
        const r = el.getBoundingClientRect();
        return {
          x: r.left - o.left,
          y: r.top - o.top,
          w: r.width,
          h: r.height,
          bottom: r.bottom - o.top,
          right: r.right - o.left,
        };
      };
      /* AVAILABLE content width = the card's content box. Not the flex row's rect: that
       * row is a shrink-to-fit flex item, so above ~360px it stops growing and measures
       * its CONTENT (315.95px) rather than the space it has. And not the card's
       * bounding rect either, which includes padding and borders. clientWidth excludes
       * the border; subtracting the resolved padding leaves the real budget. */
      const card = ignore?.closest('[class*="p-tile-pad"]') ?? null;
      let contentW = 0;
      if (card) {
        const cs = getComputedStyle(card);
        contentW =
          (card as HTMLElement).clientWidth -
          parseFloat(cs.paddingLeft || "0") -
          parseFloat(cs.paddingRight || "0");
      }
      return {
        found: defer !== null && ignore !== null,
        defer: b(defer),
        ignore: b(ignore),
        contentW,
      };
    },
    { state, id: INGESTION_ID },
  );
}

for (const rail of Object.keys(RAILS) as RailName[]) {
  for (const variant of ["", "armed"] as const) {
    const state = `${rail}${variant}`;

    test(`${state}: D2 — both buttons clear ${TAP_MIN}px`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(baseUrl);
      const p = await probe(page, state);
      expect(p.found, `${state}: buttons not found`).toBe(true);
      /* RAILS' numeric values were declared and never read — only its keys were, via
       * Object.keys. That is the same defect R9 F2 found in the wide-slack rail: geometry that
       * documents a contract while asserting nothing, and it is worse here because the
       * harness hardcodes its rail widths separately, so the two could silently
       * disagree. Binding them means a gutter or card-padding change fails HERE, naming
       * the real cause, instead of surfacing as a mystery wrap somewhere downstream —
       * which is exactly how R8 F1's 390-vs-358 error stayed hidden. */
      expect(p.contentW, `${state}: available content width is not the declared rail`).toBeCloseTo(
        RAILS[rail],
        0,
      );
      expect(p.defer.h, "D2: Defer below tap minimum").toBeGreaterThanOrEqual(TAP_MIN - TOL);
      expect(p.ignore.h, "D2: Ignore below tap minimum").toBeGreaterThanOrEqual(TAP_MIN - TOL);
    });

    test(`${state}: D1/D3 — whichever way it lands, the safe action is not on top`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(baseUrl);
      const p = await probe(page, state);
      const oneLine = Math.abs(p.ignore.y - p.defer.y) <= TOL;
      if (oneLine) {
        // D3 — sharing a line: Ignore on the left.
        expect(p.ignore.x, `D3 ${state}: Ignore should be left of Defer`).toBeLessThan(p.defer.x);
      } else {
        // D1 — stacked: Ignore ABOVE, so the safe control is the lower one.
        expect(p.ignore.bottom, `D1 ${state}: Ignore must sit above Defer`).toBeLessThanOrEqual(
          p.defer.y + TOL,
        );
      }
      // The invariant that must hold at EVERY width, however it lays out: Defer is
      // never the upper control. R8 F1: at the real mobile page the idle pair clears
      // its 316px by 0.06px, so predicting one-line-vs-stacked there is a coin flip on
      // font metrics. Asserting the safety property instead of the layout makes this
      // robust without weakening what actually matters.
      expect(p.defer.y >= p.ignore.y - TOL, `${state}: Defer must never be the upper control`).toBe(
        true,
      );
    });
  }

  test(`${rail}: D4 — arming never moves Ignore's box origin`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(baseUrl);
    const idle = await probe(page, rail);
    const armed = await probe(page, `${rail}armed`);
    // Structural, two mechanisms: Ignore is the first flex item, fixing its origin
    // within the row; and it reserves its widest label variant, so the island's width
    // is invariant and no wrap transition can occur on arm. DESTRUCT-1's guarantee
    // without basis-full.
    expect(
      Math.abs(armed.ignore.x - idle.ignore.x),
      `D4 ${rail}: Ignore left edge moved`,
    ).toBeLessThanOrEqual(TOL);
    expect(
      Math.abs(armed.ignore.y - idle.ignore.y),
      `D4 ${rail}: Ignore top edge moved`,
    ).toBeLessThanOrEqual(TOL);
    /* R11 F2: D4 promises origin AND width, but this loop asserted only the origin —
     * width was pinned at band440/bigtext440 only, so a width-only regression at
     * rail320, page358 or wide900 passed. Width is the mechanism that keeps the origin
     * fixed (it is what stops the island re-wrapping), so it belongs at every rail. */
    expect(
      Math.abs(armed.ignore.w - idle.ignore.w),
      `D4 ${rail}: Ignore width changed on arm`,
    ).toBeLessThanOrEqual(TOL);
    /* Deliberately NOT asserting Defer's width here. R12 F2: armedHtml only rewrites
     * markup INSIDE the Ignore button, so Defer's markup is byte-identical between the
     * two panels and any Defer-dimension comparison passes by construction. Asserting it
     * would look like coverage while being incapable of failing. Ignore's width above IS
     * meaningful — its class and label stack genuinely differ between the panels. */
  });
}

test("D4 under enlarged text: arming still cannot change Ignore's width", async ({ page }) => {
  /* The executable form of whole-diff R10 F1. Ignore's width must be invariant across
   * arming because of what it RENDERS, not because a numeric floor happens to exceed
   * both labels. Firefox text-only zoom and a minimum-font-size setting enlarge text
   * without touching rem lengths; at 28px both labels clear the retired 10rem floor, so
   * a floor-based reservation goes non-binding and the longer idle label makes idle
   * WIDER than armed — the exact asymmetry R9 F1 showed carries the confirm target
   * across a wrap boundary. Asserted at the 440px rail where that actually happened. */
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(baseUrl);
  const idle = await probe(page, "bigtext440");
  const armed = await probe(page, "bigtext440armed");
  expect(
    idle.ignore.w,
    "the enlarged label must actually exceed the retired 160px floor, or this rail proves nothing",
  ).toBeGreaterThan(160);
  expect(
    Math.abs(armed.ignore.w - idle.ignore.w),
    "big text: arming changed Ignore's width",
  ).toBeLessThanOrEqual(TOL);
  expect(
    Math.abs(armed.ignore.x - idle.ignore.x),
    "big text: Ignore left edge moved on arm",
  ).toBeLessThanOrEqual(TOL);
  expect(
    Math.abs(armed.ignore.y - idle.ignore.y),
    "big text: Ignore top edge moved on arm",
  ).toBeLessThanOrEqual(TOL);
  expect(armed.ignore.y, "big text: Defer must not become the upper control").toBeLessThanOrEqual(
    armed.defer.y + TOL,
  );
});

test("exactly one Ignore label variant is painted, in every panel", async ({ page }) => {
  /* R11 F1: the reservation works by keeping all three variants mounted, so nothing in
   * the geometry tests would notice if two variants were painted at once, or none.
   * Layout would be identical either way and every D-assertion would stay green.
   *
   * WHAT THIS PROVES, precisely: that `invisible` really resolves to
   * `visibility: hidden` in a real engine and leaves exactly one variant painted. Only
   * a browser can test that — jsdom applies no CSS, so there `invisible` is an inert
   * class name and every variant is equally "visible".
   *
   * WHAT IT DOES NOT PROVE: that the BUTTON selects the right variant for its state.
   * The armed panels here are built by substituting a stack rendered directly with
   * `variant="armed"` (see armedHtml), which bypasses the button's own selection. A
   * mutant pinning the button to `variant="idle"` passes this test and fails four
   * assertions in tests/components/admin/pendingIngestionActions.test.tsx, which is
   * where selection is covered. Verified by running that mutant, not assumed. */
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(baseUrl);
  const result = await page.evaluate((id) => {
    const rows: { panel: string; painted: string[]; text: string[]; innerText: string }[] = [];
    for (const sec of Array.from(document.querySelectorAll("[data-state]"))) {
      const btn = sec.querySelector(`[data-testid="admin-pending-ignore-${id}"]`);
      if (!btn) continue;
      const spans = Array.from(btn.querySelectorAll("[data-ignore-label]"));
      /* R12 F1: `visibility !== "hidden"` alone is not paintability — a span hidden with
       * `display:none` passes it, leaving the button with no visible text and an empty
       * accessible name while the oracle stays green. Require a real painted box too,
       * and cross-check against innerText, which (unlike textContent) honours BOTH
       * visibility and display, so it independently catches "nothing shown" and "two
       * variants shown at once". */
      const painted = spans.filter((s) => {
        const r = s.getBoundingClientRect();
        return getComputedStyle(s).visibility !== "hidden" && r.width > 0 && r.height > 0;
      });
      rows.push({
        panel: sec.getAttribute("data-state") ?? "?",
        painted: painted.map((s) => s.getAttribute("data-ignore-label") ?? "?"),
        text: painted.map((s) => (s.textContent ?? "").trim()),
        innerText: ((btn as HTMLElement).innerText ?? "").trim(),
      });
    }
    return rows;
  }, INGESTION_ID);
  expect(result.length, "no panels were inspected").toBeGreaterThan(0);
  for (const row of result) {
    expect(row.painted, `${row.panel}: exactly one variant must be painted`).toHaveLength(1);
    const expected = row.panel.endsWith("armed") ? "armed" : "idle";
    expect(row.painted[0], `${row.panel}: wrong variant painted`).toBe(expected);
    const word = expected === "armed" ? "Confirm ignore" : "Permanently ignore";
    expect(row.text[0], `${row.panel}: painted variant has the wrong words`).toBe(word);
    expect(row.innerText, `${row.panel}: the button must READ as exactly one label`).toBe(word);
  }

  /* R13 F2: innerText is what a SIGHTED user reads; it is not the accessible name.
   * An `aria-label` on the button would rename it for screen readers while every
   * assertion above stayed green — the hidden variants make that failure mode
   * specific to this design, since the name is computed from a subtree that
   * deliberately contains three labels. Asserted through Playwright, which computes
   * the real accname rather than approximating it from the DOM. */
  for (const row of result) {
    const word = row.panel.endsWith("armed") ? "Confirm ignore" : "Permanently ignore";
    await expect(
      page.locator(
        `[data-state="${row.panel}"] [data-testid="admin-pending-ignore-${INGESTION_ID}"]`,
      ),
      `${row.panel}: accessible name must be exactly the shown label`,
    ).toHaveAccessibleName(word);
  }
});

test("D7: shipped markup contains no basis-full or sm:basis-auto", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(baseUrl);
  const markup = await page.evaluate(() => document.body.innerHTML);
  expect(markup.includes("basis-full"), "D7: basis-full still in shipped markup").toBe(false);
  expect(markup.includes("sm:basis-auto"), "D7: sm:basis-auto still in shipped markup").toBe(false);
});

test("cards with real slack must NOT stack", async ({ page }) => {
  // The safety assertions accept stacking whichever way a width lands, which is right
  // at knife-edge widths and wrong here: at 858px of content the pair uses 315.95px,
  // so stacking would mean something regressed (both buttons full-width, a stray
  // basis, a wrap forced by a container change). R9 F2.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(baseUrl);
  for (const state of SLACK_RAILS.flatMap((r) => [r, `${r}armed`])) {
    const p = await probe(page, state);
    expect(Math.abs(p.ignore.y - p.defer.y), `${state} must share one line`).toBeLessThanOrEqual(
      TOL,
    );
    expect(p.ignore.x, `${state}: Ignore left of Defer`).toBeLessThan(p.defer.x);
  }
});

test("D4 regression: arming never moves Ignore, at the width where it once did", async ({
  page,
}) => {
  // Pinning the concrete defect R9 F1 found rather than only the general property:
  // at a 440px rail the island used to un-wrap on arm and carry the confirm target
  // 107px right and 52px up, between tap 1 and tap 2.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(baseUrl);
  const idle = await probe(page, "band440");
  const armed = await probe(page, "band440armed");
  expect(
    Math.abs(armed.ignore.x - idle.ignore.x),
    "band440: Ignore left edge moved on arm",
  ).toBeLessThanOrEqual(TOL);
  expect(
    Math.abs(armed.ignore.y - idle.ignore.y),
    "band440: Ignore top edge moved on arm",
  ).toBeLessThanOrEqual(TOL);
  // The mechanism: a constant-width Ignore keeps the island's width invariant.
  expect(
    Math.abs(armed.ignore.w - idle.ignore.w),
    "Ignore width must not change on arm",
  ).toBeLessThanOrEqual(TOL);
});
