/**
 * tests/e2e/step3-review-modal.layout.spec.ts (Task 10 — spec §5.1, §9.1, §15, §16)
 *
 * REAL-BROWSER layout invariants for <Step3ReviewModal>. jsdom computes NO
 * layout and this project's Tailwind v4 does NOT default `.flex` to
 * `align-items: stretch` (DESIGN.md §7) — every §5.1 parent→child dimension
 * relationship must be measured in a real browser.
 *
 * HARNESS (standalone, no app boot — template: step3-card-dimensions.spec.ts):
 *   1. renders the REAL component to static markup via
 *      tests/e2e/_step3ReviewModalHarness.tsx (renderToStaticMarkup +
 *      AppRouterContext stub — precedent tests/e2e/no-raw-codes.spec.ts);
 *   2. compiles the real token CSS from app/globals.css with the Tailwind CLI
 *      (`@source` prepended for the harness pages so every class generates);
 *   3. serves over node:http and measures getBoundingClientRect().
 *
 * §5.1 invariants asserted VERBATIM (±0.5px), at 390 (sheet) / 800 (popup) /
 * 1280 (two-pane):
 *   1. header.height + main.height + footer.height (+ grab.height in sheet
 *      mode) === panel.height; panel.height ≤ 0.85 × viewport.height (0.80 in
 *      popup/two-pane).
 *   2. two-pane: rail.height === main.height; content.height === main.height;
 *      rail.width === 240; rail.width + content.width === main.width.
 *   3. sheet/popup: chipRail.scrollHeight === chipRail.clientHeight (no
 *      vertical growth) and chipRail.width === main.width.
 *   4. sheet: panel.width === viewport.width (full-bleed sheet).
 *   5. every `…-review-section-<id>`: width === content.clientWidth −
 *      computed paddingLeft − paddingRight (getComputedStyle — NO token
 *      literals in the test).
 * Follow-ups Task 14 (spec 2026-07-03 §I/§K15): the harness fixture ships
 * cap+3 null-contentUrl diagram stubs + a linked folder + 5 crew-kind warn
 * warnings. Diagrams are consolidated INTO the rooms section (below the
 * rooms), so the per-section sweep covers `section-rooms`/`section-report` and
 * a dedicated test pins the diagrams grid inside it (no horizontal scroll in
 * the content pane; on-screen tiles === the spec cap; fixture-derived "+N
 * more" note). Tap-target audit adds the report disclosure toggle (the form
 * behind it is collapsed by default per follow-ups-b2 §D — the submit button
 * is measured in the LIVE interactions spec after an expand step), a crew
 * callout "View details" button, and the diagrams folder link.
 *
 * Plus (§15/§16): tap-target audit (grab strip, every visible chip, every
 * visible rail item, footer buttons ≥44px tall; a crew tel anchor ≥44×44);
 * nav exclusivity (exactly one of rail/chip rail visible per mode; exactly
 * one VISIBLE [aria-current]); §9.1 long-content header case at 390 (close +
 * chip fully in-viewport, panel.scrollWidth === panel.clientWidth); §9.1
 * sheet-footer safe-area (computed paddingBottom ≥ base padding AND the
 * compiled stylesheet contains `safe-area-inset-bottom` — in the pinned test
 * browser `env()` resolves to 0, so the static check pins the mechanism).
 *
 * Concrete failure modes: invariant 1 catches a non-shrink-0 header/footer or
 * a body without min-h-0/flex-1 (panel overflow); invariant 2 catches the
 * Tailwind v4 items-stretch collapse (rail height ≠ main height); invariant 5
 * catches a section that fails to span the content pane (missing stretch /
 * stray width).
 *
 * Static markup = no JS interactivity: drag/scroll-spy/Tab traversal are
 * Task 11. The modal renders open by construction (it has no internal open
 * state — it IS the open dialog). Measurements run under
 * `prefers-reduced-motion: reduce` emulation: app/globals.css collapses the
 * [data-step3-review-panel] entrance animation to none under reduced motion,
 * so geometry is stable on load (documented flake-avoidance choice).
 *
 * Runs standalone via tests/e2e/standalone.config.ts (no webServer/Supabase):
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts \
 *     tests/e2e/step3-review-modal.layout.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

// CommonJS package — Playwright's CJS loader provides __dirname (mirrors the
// step3-card-dimensions.spec.ts template; do NOT use import.meta.url here).
const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;
const TAP_MIN = 44;

// NOT imported from ./_step3ReviewModalHarness: Playwright's test transform
// rewrites JSX in every .tsx it loads into component-testing payloads that
// react-dom/server cannot render, so the harness runs via `tsx` in beforeAll
// (see below). The dfid is duplicated here and cross-checked against the
// harness's JSON output so the two can never drift silently.
const HARNESS_DFID = "drive-abc-123";

function tid(name: string): string {
  return `wizard-step3-card-${HARNESS_DFID}-review-${name}`;
}

/** §5 named width modes (single source of truth for the loop below). */
const MODES = [
  { mode: "sheet", width: 390, height: 844, maxRatio: 0.85 },
  { mode: "popup", width: 800, height: 900, maxRatio: 0.8 },
  { mode: "two-pane", width: 1280, height: 800, maxRatio: 0.8 },
] as const;

// §B3 tile cap, duplicated as a SPEC literal (same deliberately-NOT-imported
// rationale as HARNESS_DFID above): the harness renders cap+3 placeholder
// stubs, so a component whose cap drifts from 12 shows a wrong on-screen tile
// count and fails §K15 here, correctly.
const DIAGRAM_TILE_CAP = 12;

let server: Server;
let baseUrl: string;
let workDir: string;
let compiledCss: string;
let diagramStubCount: number;

function pageHtml(cssHref: string, modalMarkup: string): string {
  return `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${cssHref}"></head>
<body class="bg-bg">${modalMarkup}</body></html>`;
}

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "step3-review-modal-layout-"));

  // Render the REAL component tree to static markup OUTSIDE Playwright's
  // loader (its JSX transform breaks react-dom/server — see header note):
  // `tsx` runs the harness's main-guard, which writes { dfid, normal, long }.
  const pagesJson = join(workDir, "pages.json");
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalHarness.tsx"), pagesJson],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );
  const pages = JSON.parse(readFileSync(pagesJson, "utf8")) as {
    dfid: string;
    diagramStubCount: number;
    normal: string;
    long: string;
    resolution: string;
  };
  expect(pages.dfid, "spec-local dfid matches the harness fixture").toBe(HARNESS_DFID);
  // §K15 anti-tautology: expected tile/overflow numbers derive from the
  // FIXTURE's stub count (harness JSON), never from the rendered page.
  diagramStubCount = pages.diagramStubCount;
  expect(
    diagramStubCount,
    "fixture exceeds the tile cap (otherwise the cap assertion is vacuous)",
  ).toBeGreaterThan(DIAGRAM_TILE_CAP);

  // Two harness pages: the default fixture, and the §9.1 long-content header
  // case (long unbroken title + long client + maximal dates summary).
  writeFileSync(join(workDir, "harness.html"), pageHtml("out.css", pages.normal));
  writeFileSync(join(workDir, "harness-long.html"), pageHtml("out.css", pages.long));
  // Step-3 consolidation (spec §9): the folded RESOLUTION footer variant.
  writeFileSync(join(workDir, "harness-resolution.html"), pageHtml("out.css", pages.resolution));

  // Compile the real token CSS (template mechanics: prepend @source lines for
  // the harness pages to a copy of app/globals.css so Tailwind v4 generates
  // every utility the rendered markup uses).
  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    `@source "${join(workDir, "harness.html")}";\n@source "${join(workDir, "harness-long.html")}";\n@source "${join(workDir, "harness-resolution.html")}";\n${globals}`,
  );
  execFileSync(
    "pnpm",
    ["dlx", "@tailwindcss/cli@4.2.4", "-i", entryCss, "-o", join(workDir, "out.css")],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );
  compiledCss = readFileSync(join(workDir, "out.css"), "utf8");

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "harness.html" : url.replace(/^\//, "");
    try {
      const body = readFileSync(join(workDir, file));
      res.setHeader("content-type", file.endsWith(".css") ? "text/css" : "text/html");
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

async function openHarness(
  page: Page,
  viewport: { width: number; height: number },
  path = "harness.html",
) {
  // Reduced-motion emulation collapses the panel/scrim entrance animation
  // (app/globals.css `@media (prefers-reduced-motion: reduce)`) so geometry
  // is final on load — no animation-end waits, no flake.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(viewport);
  await page.goto(baseUrl + path);
}

async function rect(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    };
  });
}

const PANEL = "[data-step3-review-panel]";

for (const { mode, width, height, maxRatio } of MODES) {
  test(`§5.1.1/§5.1.4: panel = header + main + footer${
    mode === "sheet" ? " + grab" : ""
  } and height cap @ ${mode} ${width}px`, async ({ page }) => {
    await openHarness(page, { width, height });

    const panel = await rect(page, PANEL);
    const header = await rect(page, `[data-testid="${tid("header")}"]`);
    const main = await rect(page, `[data-testid="${tid("main")}"]`);
    const footer = await rect(page, `[data-testid="${tid("footer")}"]`);
    const grab = await rect(page, `[data-testid="${tid("grab")}"]`);

    // §5.1.1 — a header/footer without shrink-0 or a body without min-h-0
    // flex-1 breaks this sum (children overflow or leave slack in the panel).
    const sum = header.height + main.height + footer.height + (mode === "sheet" ? grab.height : 0);
    expect(
      Math.abs(sum - panel.height),
      `header ${header.height} + main ${main.height} + footer ${footer.height}` +
        (mode === "sheet" ? ` + grab ${grab.height}` : "") +
        ` === panel ${panel.height} @ ${mode}`,
    ).toBeLessThanOrEqual(TOL);

    expect(
      panel.height,
      `panel.height ≤ ${maxRatio} × viewport.height @ ${mode}`,
    ).toBeLessThanOrEqual(maxRatio * height + TOL);

    if (mode === "sheet") {
      // §5.1.4 — full-bleed bottom sheet.
      expect(
        Math.abs(panel.width - width),
        `panel.width ${panel.width} === viewport.width ${width} @ sheet`,
      ).toBeLessThanOrEqual(TOL);
      // Grab strip only exists (visibly) in sheet mode; its height feeds the
      // sum above, so pin that it is real, not a display:none 0×0 rect.
      expect(grab.height, "grab strip is rendered and tap-sized").toBeGreaterThanOrEqual(
        TAP_MIN - TOL,
      );
    } else {
      expect(grab.height, `grab strip hidden (display:none) @ ${mode}`).toBe(0);
    }
  });

  test(`§5.1.2/§5.1.3: body-region geometry @ ${mode} ${width}px`, async ({ page }) => {
    await openHarness(page, { width, height });
    const main = await rect(page, `[data-testid="${tid("main")}"]`);

    if (mode === "two-pane") {
      // §5.1.2 — rail/content fill the body region's height. This is the
      // Tailwind v4 items-stretch collapse catcher: without `items-stretch`
      // on the row wrapper, rail.height shrinks to its content.
      const rail = await rect(page, `[data-testid="${tid("rail")}"]`);
      const content = await rect(page, `[data-testid="${tid("content")}"]`);
      expect(
        Math.abs(rail.height - main.height),
        `rail.height ${rail.height} === main.height ${main.height}`,
      ).toBeLessThanOrEqual(TOL);
      expect(
        Math.abs(content.height - main.height),
        `content.height ${content.height} === main.height ${main.height}`,
      ).toBeLessThanOrEqual(TOL);
      expect(Math.abs(rail.width - 240), `rail.width ${rail.width} === 240`).toBeLessThanOrEqual(
        TOL,
      );
      expect(
        Math.abs(rail.width + content.width - main.width),
        `rail.width ${rail.width} + content.width ${content.width} === main.width ${main.width}`,
      ).toBeLessThanOrEqual(TOL);
    } else {
      // §5.1.3 — chip rail is a single horizontal row: it never grows
      // vertically (scrollHeight === clientHeight catches chip wrap) and it
      // spans the body region's width (items-stretch on the column wrapper).
      const chipRail = page.locator(`[data-testid="${tid("chiprail")}"]`);
      const scroll = await chipRail.evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));
      expect(
        Math.abs(scroll.scrollHeight - scroll.clientHeight),
        `chipRail.scrollHeight ${scroll.scrollHeight} === chipRail.clientHeight ${scroll.clientHeight} @ ${mode}`,
      ).toBeLessThanOrEqual(TOL);
      const chipRect = await rect(page, `[data-testid="${tid("chiprail")}"]`);
      expect(
        Math.abs(chipRect.width - main.width),
        `chipRail.width ${chipRect.width} === main.width ${main.width} @ ${mode}`,
      ).toBeLessThanOrEqual(TOL);
    }
  });

  test(`§5.1.5: every section spans the content pane's inner width @ ${mode} ${width}px`, async ({
    page,
  }) => {
    await openHarness(page, { width, height });

    // Measurement contract (no token literals): content.clientWidth includes
    // padding and excludes border/scrollbar; subtracting BOTH computed
    // paddings yields the content-box width every block-level section fills.
    const inner = await page.locator(`[data-testid="${tid("content")}"]`).evaluate((el) => {
      const cs = getComputedStyle(el);
      return el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    });

    const sections = page.locator(`[data-testid^="${tid("section-")}"]`);
    const count = await sections.count();
    // agendaBaseline is empty in the fixture → 11 always-rendered sections
    // (registry contract, §6.1). Pin ≥ 11 so the loop can't pass vacuously.
    expect(count, "all registry sections render").toBeGreaterThanOrEqual(11);
    const sweptIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const s = sections.nth(i);
      const id = await s.getAttribute("data-testid");
      if (id) sweptIds.push(id);
      const w = await s.evaluate((el) => el.getBoundingClientRect().width);
      expect(
        Math.abs(w - inner),
        `${id} width ${w} === content inner width ${inner} @ ${mode}`,
      ).toBeLessThanOrEqual(TOL);
    }
    // Non-vacuity: the sweep really covers the report section (unconditional,
    // last). Diagrams are no longer a top-level section — they fold into the
    // `rooms` section (grid geometry asserted separately in §K15 below).
    expect(sweptIds, `sweep covers the rooms section @ ${mode}`).toContain(tid("section-rooms"));
    expect(sweptIds, `sweep covers the report section @ ${mode}`).toContain(tid("section-report"));
  });

  test(`§K15 diagrams grid: no horizontal overflow, cap + fixture-derived overflow note @ ${mode} ${width}px`, async ({
    page,
  }) => {
    await openHarness(page, { width, height });

    // §I: tiles never overflow the detail pane — the content scroller gains
    // NO horizontal scroll from the > cap grid.
    const scroll = await page.locator(`[data-testid="${tid("content")}"]`).evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(
      scroll.scrollWidth,
      `content scrollWidth ${scroll.scrollWidth} ≤ clientWidth ${scroll.clientWidth} @ ${mode}`,
    ).toBeLessThanOrEqual(scroll.clientWidth);

    // Every visible tile fits the content pane's width.
    const tiles = page.locator(`[data-testid^="wizard-step3-card-${HARNESS_DFID}-diagram-tile-"]`);
    const tileCount = await tiles.count();
    for (let i = 0; i < tileCount; i++) {
      const r = await tiles.nth(i).evaluate((el) => el.getBoundingClientRect().width);
      expect(r, `diagram tile ${i} width ${r} > 0 @ ${mode}`).toBeGreaterThan(0);
      expect(
        r,
        `diagram tile ${i} width ${r} ≤ content width ${scroll.clientWidth} @ ${mode}`,
      ).toBeLessThanOrEqual(scroll.clientWidth + TOL);
    }

    // Cap + overflow note, DERIVED from the fixture (harness JSON): the
    // fixture holds cap+3 valid stubs → exactly DIAGRAM_TILE_CAP tiles render
    // and the note reads "+3 more". A component cap that drifts from the spec
    // value renders a different count and fails here.
    expect(tileCount, `on-screen tile count === spec cap @ ${mode}`).toBe(DIAGRAM_TILE_CAP);
    const expectedExtra = diagramStubCount - DIAGRAM_TILE_CAP;
    // Diagrams now render as a sub-block inside the rooms section; target the
    // DiagramsBreakdown's own section testid (`-section-diagrams`, distinct
    // from the retired modal `-review-section-diagrams` wrapper).
    const sectionText = await page
      .locator(`[data-testid="wizard-step3-card-${HARNESS_DFID}-section-diagrams"]`)
      .innerText();
    expect(
      sectionText,
      `diagrams section carries the "+${expectedExtra} more" overflow note @ ${mode}`,
    ).toContain(`+${expectedExtra} more`);
  });

  test(`§15 tap-target audit @ ${mode} ${width}px`, async ({ page }) => {
    await openHarness(page, { width, height });

    // Footer buttons (all modes): Re-scan + primary publish.
    for (const sel of [
      `[data-testid="rescan-sheet-button-${HARNESS_DFID}"]`,
      `[data-testid="${tid("publish")}"]`,
      `[data-testid="${tid("close")}"]`,
    ]) {
      const r = await rect(page, sel);
      expect(r.height, `${sel} height ≥ 44 @ ${mode}`).toBeGreaterThanOrEqual(TAP_MIN - TOL);
    }

    if (mode === "sheet") {
      const grab = await rect(page, `[data-testid="${tid("grab")}"]`);
      expect(grab.height, "grab strip height ≥ 44").toBeGreaterThanOrEqual(TAP_MIN - TOL);
    }

    // Follow-ups Task 14 additions: the report disclosure toggle, a crew-callout
    // "View details" jump button (§E3), and the diagrams folder link (§B3) are
    // all new interactive targets — each ≥44px tall (parent-spec §15 rule).
    // Follow-ups-b2 §D: the report form is collapsed by default, so this STATIC
    // harness (react-dom/server — no interactivity) measures the always-present
    // toggle; the submit-button ≥44px measurement lives in the LIVE interactions
    // spec behind an expand step.
    for (const [label, sel] of [
      ["report toggle", `[data-testid="wizard-step3-card-${HARNESS_DFID}-report-toggle"]`],
      [
        "callout View details",
        `[data-testid="wizard-step3-card-${HARNESS_DFID}-section-crew-flag-callout"] button`,
      ],
      [
        "diagrams folder link",
        `[data-testid="wizard-step3-card-${HARNESS_DFID}-diagram-folder-link"]`,
      ],
    ] as const) {
      const h = await page
        .locator(sel)
        .first()
        .evaluate((el) => el.getBoundingClientRect().height);
      expect(h, `${label} height ≥ 44 @ ${mode}`).toBeGreaterThanOrEqual(TAP_MIN - TOL);
    }

    // The VISIBLE nav's items (chips below lg, rail items at lg).
    const itemPrefix = mode === "two-pane" ? tid("rail-item-") : tid("chip-item-");
    const items = page.locator(`[data-testid^="${itemPrefix}"]`);
    const n = await items.count();
    expect(n, `nav items render @ ${mode}`).toBeGreaterThanOrEqual(11);
    for (let i = 0; i < n; i++) {
      const idAttr = await items.nth(i).getAttribute("data-testid");
      const h = await items.nth(i).evaluate((el) => el.getBoundingClientRect().height);
      expect(h, `${idAttr} height ≥ 44 @ ${mode}`).toBeGreaterThanOrEqual(TAP_MIN - TOL);
    }

    // One crew tel anchor: BOTH dimensions ≥ 44 (§8 anchor pattern — the
    // interactive <a> is the 44×44 border box; the 32px square is a nested
    // visual). The fixture guarantees crew member 1 has a phone.
    const tel = page.locator(`${PANEL} a[href^="tel:"]`).first();
    const telRect = await tel.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    });
    expect(telRect.width, `tel anchor width ≥ 44 @ ${mode}`).toBeGreaterThanOrEqual(TAP_MIN - TOL);
    expect(telRect.height, `tel anchor height ≥ 44 @ ${mode}`).toBeGreaterThanOrEqual(
      TAP_MIN - TOL,
    );
  });

  test(`§9.4 nav exclusivity: one visible nav, one visible [aria-current] @ ${mode} ${width}px`, async ({
    page,
  }) => {
    await openHarness(page, { width, height });

    const visibility = await page.evaluate(
      ([railSel, chipSel]) => {
        const visible = (el: Element | null) => el !== null && el.getClientRects().length > 0;
        return {
          rail: visible(document.querySelector(railSel as string)),
          chip: visible(document.querySelector(chipSel as string)),
        };
      },
      [`[data-testid="${tid("rail")}"]`, `[data-testid="${tid("chiprail")}"]`],
    );
    const expected =
      mode === "two-pane" ? { rail: true, chip: false } : { rail: false, chip: true };
    expect(visibility, `exactly one nav visible @ ${mode}`).toEqual(expected);

    // Both navs render aria-current from shared state; display:none keeps the
    // hidden twin's copy out of the visible set — exactly ONE remains.
    const visibleCurrent = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("[aria-current]")).filter(
        (el) => el.getClientRects().length > 0,
      ).length;
    });
    expect(visibleCurrent, `exactly one VISIBLE [aria-current] @ ${mode}`).toBe(1);
  });
}

test("§9.1 long-content header @ 390: close + chip in-viewport, no horizontal overflow", async ({
  page,
}) => {
  await openHarness(page, { width: 390, height: 844 }, "harness-long.html");

  // The long unbroken title must WRAP (min-w-0 + wrap-break-word) — the
  // shrink-0 actions cluster (chip + close) stays fully on-screen.
  for (const [label, sel] of [
    ["close button", `[data-testid="${tid("close")}"]`],
    ["status chip", `[data-testid="${tid("chip")}"]`],
  ] as const) {
    const r = await rect(page, sel);
    expect(r.left, `${label} left edge in viewport`).toBeGreaterThanOrEqual(-TOL);
    expect(r.right, `${label} right edge in viewport`).toBeLessThanOrEqual(390 + TOL);
    expect(r.top, `${label} top edge in viewport`).toBeGreaterThanOrEqual(-TOL);
    expect(r.bottom, `${label} bottom edge in viewport`).toBeLessThanOrEqual(844 + TOL);
    expect(r.width, `${label} has real size`).toBeGreaterThan(0);
  }

  const overflow = await page.locator(PANEL).evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(
    overflow.scrollWidth,
    `panel.scrollWidth ${overflow.scrollWidth} === panel.clientWidth ${overflow.clientWidth}`,
  ).toBe(overflow.clientWidth);
});

test("§9.1 sheet footer safe-area @ 390: paddingBottom ≥ base padding + stylesheet mechanism", async ({
  page,
}) => {
  await openHarness(page, { width: 390, height: 844 });

  // In the pinned test browser env(safe-area-inset-bottom) resolves to 0, so
  // the computed check pins "base padding survives the calc" (compare against
  // the footer's OWN paddingTop — the same base token, no literal): a broken
  // calc collapses paddingBottom to 0.
  const pad = await page.locator(`[data-testid="${tid("footer")}"]`).evaluate((el) => {
    const cs = getComputedStyle(el);
    return { top: parseFloat(cs.paddingTop), bottom: parseFloat(cs.paddingBottom) };
  });
  expect(pad.top, "footer base padding is non-zero").toBeGreaterThan(0);
  expect(
    pad.bottom,
    `footer paddingBottom ${pad.bottom} ≥ base padding ${pad.top}`,
  ).toBeGreaterThanOrEqual(pad.top - TOL);

  // The safe-area mechanism itself is a static stylesheet fact (§9.1: the
  // simulator inset is not reproducible in CI).
  expect(compiledCss, "compiled CSS contains the safe-area calc").toContain(
    "safe-area-inset-bottom",
  );
});

// ── Step-3 consolidation: folded RESOLUTION footer (spec §9) ────────────────
// The re-apply resolution surface (tier radios + Approve & apply / Re-scan /
// Ignore) is NEW to the modal. jsdom can't measure it; assert real layout at
// mobile + desktop: no horizontal overflow, footer + primary/secondary actions
// present, and tap targets ≥44px. Served from harness-resolution.html.
for (const { mode, width, height } of [
  { mode: "sheet", width: 390, height: 844 },
  { mode: "two-pane", width: 1280, height: 800 },
] as const) {
  test(`§9 resolution footer: no horizontal overflow + actions present @ ${mode} ${width}px`, async ({
    page,
  }) => {
    await openHarness(page, { width, height }, "harness-resolution.html");

    // No horizontal overflow of the document (the widest resolution footer —
    // Approve & apply + Re-scan + Ignore — must fit; a regression that forced a
    // nowrap row past the viewport would fail here).
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(
      overflow.scrollWidth,
      `doc scrollWidth ${overflow.scrollWidth} ≤ clientWidth ${overflow.clientWidth} @ ${mode}`,
    ).toBeLessThanOrEqual(overflow.clientWidth + TOL);

    // The resolution footer + its primary (Approve & apply) and secondary
    // (Ignore) actions render — proves the folded resolution variant mounted.
    await expect(page.locator(`[data-testid="${tid("footer")}"]`)).toBeVisible();
    const approve = page.locator(`[data-testid="${tid("resolution-approve")}"]`);
    const ignore = page.locator(`[data-testid="${tid("resolution-ignore")}"]`);
    await expect(approve).toBeVisible();
    await expect(ignore).toBeVisible();

    // §15 tap-target: both action buttons are ≥44px tall (min-h-tap-min).
    for (const [name, loc] of [
      ["approve", approve],
      ["ignore", ignore],
    ] as const) {
      const h = await loc.evaluate((el) => el.getBoundingClientRect().height);
      expect(h, `${name} button height ${h} ≥ 44 @ ${mode}`).toBeGreaterThanOrEqual(44 - TOL);
    }
  });
}
