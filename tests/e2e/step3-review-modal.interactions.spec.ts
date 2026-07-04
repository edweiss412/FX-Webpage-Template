/**
 * tests/e2e/step3-review-modal.interactions.spec.ts (Task 11 — spec §6.3a,
 * §9.4, §10, §11 C6, §15, §16)
 *
 * LIVE real-browser interaction gate for <Step3ReviewModal>: drag-to-dismiss,
 * scroll-spy, and the Tab/nav-visibility audit all need a REAL React tree with
 * running JS — Task 10's static-markup harness cannot exercise any of them.
 *
 * HARNESS (standalone, no app boot):
 *   1. bundles tests/e2e/_step3ReviewModalLiveEntry.tsx (createRoot + the
 *      shared Task-10 fixture/modalElement) with a version-pinned
 *      `pnpm dlx esbuild@0.28.0 --bundle --format=iife --jsx=automatic`.
 *      The entry is NEVER imported here: Playwright's test transform rewrites
 *      JSX in every spec-imported .tsx into component-testing payloads, so the
 *      browser bundle is built OUT of process (same reason Task 10 shells out
 *      to `tsx`).
 *   2. compiles the real token CSS exactly like Task 10 (tailwind CLI over
 *      app/globals.css with @source pointing at a STATIC render of the same
 *      fixture — the live tree uses the identical class strings, including the
 *      active-nav classes, because the first section renders active in the
 *      static markup too).
 *   3. serves live.html (#root + bundle.js) over node:http.
 *
 * Reduced-motion choice (documented per the task brief): all tests emulate
 * `prefers-reduced-motion: reduce`. app/globals.css collapses the panel/scrim
 * entrance animation AND zeroes --duration-fast/normal, and gates the content
 * pane's scroll-smooth behind motion-safe. Consequences, all deterministic:
 *   - geometry is final on load (no entrance-animation waits);
 *   - nav-click / scrollTo glides are INSTANT (no smooth-scroll waits);
 *   - the T5 dismiss transition runs at 0ms so `transitionend` never fires —
 *     close arrives via the component's DURATION_NORMAL_FALLBACK_MS (220ms)
 *     timeout (Task 7 report §5), and the T4 spring-back settle likewise
 *     clears inline styles via its 120ms fallback. Assertions poll/await
 *     rather than assuming instant close, so the fallback path is what this
 *     suite actually exercises — a regression that drops the timeout fallback
 *     would hang the dismiss test.
 *
 * Concrete failure modes:
 *   - dismiss test: pointer handlers not wired / synthesized-click suppression
 *     inverted / fallback timer dropped (modal never closes).
 *   - spring-back test: slop discrimination broken (a 60px drag closes via the
 *     synthesized click) or settle never clears inline styles (stylesheet no
 *     longer governs the panel).
 *   - C6 test: matchMedia cleanup missing — the popup panel keeps a stranded
 *     inline translateY after a resize mid-drag.
 *   - scroll-spy tests: wrong scroll container, offsetTop-vs-container
 *     coordinate bug (the nonzero p-tile-pad content padding shifts every
 *     offsetTop-derived position), stale tops, or aria-current rendered on the
 *     wrong item.
 *   - Tab audit: focus escaping the panel, landing on a display:none nav twin,
 *     or the trap failing to wrap last → first.
 *
 * Runs standalone via tests/e2e/standalone.config.ts:
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts \
 *     tests/e2e/step3-review-modal.interactions.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

// CommonJS package — Playwright's CJS loader provides __dirname (mirrors
// step3-review-modal.layout.spec.ts; do NOT use import.meta.url here).
const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;

// NOT imported from the harness/component (see header): duplicated here and
// cross-checked against the harness JSON so the two can never drift silently.
const HARNESS_DFID = "drive-abc-123";

// Spec-literal interaction constants (§6.3a / §10). Deliberately NOT imported
// from Step3ReviewModal.tsx (spec-importing the component .tsx is the exact
// transform trap the harness exists to avoid) — the SPEC is the source of
// truth, so a component that drifts from these values FAILS here, correctly.
const SCROLL_SPY_OFFSET_PX = 90;
const DRAG_DISMISS_PX = 140; // > DRAG_DISMISS_THRESHOLD_PX (110)
const DRAG_SPRINGBACK_PX = 60; // between DRAG_SLOP_PX (6) and the 110 threshold
const NAV_CLICK_OFFSET_PX = 8; // §6.3a click override scrolls to sectionTop − 8

function tid(name: string): string {
  return `wizard-step3-card-${HARNESS_DFID}-review-${name}`;
}

const PANEL = "[data-step3-review-panel]";
const MODAL = `[data-testid="${tid("modal")}"]`;
const GRAB = `[data-testid="${tid("grab")}"]`;
const CLOSE = `[data-testid="${tid("close")}"]`;
const CONTENT = `[data-testid="${tid("content")}"]`;
const RAIL = `[data-testid="${tid("rail")}"]`;

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "step3-review-modal-live-"));

  // 1. Static render of the SAME fixture (tsx subprocess, Task-10 mechanism)
  //    — used only as the tailwind @source so every class the live tree
  //    renders is generated, plus the dfid drift cross-check.
  const pagesJson = join(workDir, "pages.json");
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalHarness.tsx"), pagesJson],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );
  const pages = JSON.parse(readFileSync(pagesJson, "utf8")) as { dfid: string; normal: string };
  expect(pages.dfid, "spec-local dfid matches the harness fixture").toBe(HARNESS_DFID);
  writeFileSync(
    join(workDir, "harness.html"),
    `<!doctype html><html data-theme="light"><head><meta charset="utf-8"></head><body class="bg-bg">${pages.normal}</body></html>`,
  );

  // 2. The LIVE page: empty #root + the esbuild bundle.
  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  // 3. Bundle the live entry (version-pinned dlx, like the tailwind CLI).
  //    --external:node:fs keeps the harness's never-executed main-guard
  //    `require("node:fs")` out of the browser resolve pass; the banner shims
  //    `process` for Next client-runtime env reads beyond NODE_ENV.
  execFileSync(
    "pnpm",
    [
      "dlx",
      "esbuild@0.28.0",
      join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalLiveEntry.tsx"),
      "--bundle",
      "--format=iife",
      "--jsx=automatic",
      "--loader:.tsx=tsx",
      '--define:process.env.NODE_ENV="production"',
      "--external:node:fs",
      `--tsconfig=${join(REPO_ROOT, "tsconfig.json")}`,
      '--banner:js=window.process=window.process||{env:{NODE_ENV:"production"}};',
      `--outfile=${join(workDir, "bundle.js")}`,
    ],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );

  // 4. Compile the real token CSS (Task-10 mechanics).
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

async function openLive(page: Page, viewport: { width: number; height: number }) {
  await page.emulateMedia({ reducedMotion: "reduce" }); // see header note
  await page.setViewportSize(viewport);
  await page.goto(baseUrl + "live.html");
  await expect(page.locator(PANEL)).toBeVisible();
}

/** The panel's INLINE style props (the drag machinery writes inline only). */
async function panelInlineStyles(page: Page) {
  return page.locator(PANEL).evaluate((el) => ({
    transform: (el as HTMLElement).style.transform,
    transition: (el as HTMLElement).style.transition,
    animation: (el as HTMLElement).style.animation,
  }));
}

async function grabCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator(GRAB).boundingBox();
  if (!box) throw new Error("grab strip has no box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** §6.3a reference rule, restated FROM THE SPEC (not the component export —
 *  see the constants note above): active = LAST section whose container-
 *  relative top ≤ scrollTop + offset; bottom clamp → last section. Used to
 *  derive EXPECTED actives from live-measured geometry, so a component whose
 *  wiring diverges (wrong container, offsetTop, stale tops) fails against it. */
function specActiveSection(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  tops: ReadonlyArray<{ id: string; top: number }>,
): string {
  const first = tops[0];
  if (!first) throw new Error("no sections measured");
  const last = tops[tops.length - 1] ?? first;
  if (scrollTop + clientHeight >= scrollHeight - 1) return last.id;
  let current = first.id;
  for (const s of tops) {
    if (s.top <= scrollTop + SCROLL_SPY_OFFSET_PX) current = s.id;
    else break;
  }
  return current;
}

/** Live-measured scroller metrics + container-relative section tops (§6.3a
 *  coordinate contract: rect-vs-rect + scrollTop, NEVER offsetTop). */
async function contentMetrics(page: Page) {
  return page.locator(CONTENT).evaluate((scroller, sectionPrefix) => {
    const sRect = scroller.getBoundingClientRect();
    const tops = Array.from(
      scroller.querySelectorAll<HTMLElement>(`[data-testid^="${sectionPrefix}"]`),
    ).map((el) => ({
      id: (el.getAttribute("data-testid") ?? "").slice(sectionPrefix.length),
      top: el.getBoundingClientRect().top - sRect.top + scroller.scrollTop,
    }));
    return {
      clientHeight: scroller.clientHeight,
      scrollHeight: scroller.scrollHeight,
      tops,
    };
  }, tid("section-"));
}

/** The VISIBLE rail's active item id (aria-current scoped to the rail, §9.4). */
async function railActiveId(page: Page): Promise<string | null> {
  return page.locator(RAIL).evaluate((rail, itemPrefix) => {
    const current = Array.from(rail.querySelectorAll('[aria-current="true"]')).filter(
      (el) => el.getClientRects().length > 0,
    );
    if (current.length !== 1) return null;
    return (current[0]?.getAttribute("data-testid") ?? "").slice(itemPrefix.length);
  }, tid("rail-item-"));
}

// ── §10 drag-to-dismiss (sheet 390) — real pointer events via the mouse ─────

test("§10: 140px grab drag past the threshold dismisses the sheet", async ({ page }) => {
  await openLive(page, { width: 390, height: 844 });
  const { x, y } = await grabCenter(page);

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + DRAG_DISMISS_PX, { steps: 8 });
  // Sanity mid-drag: pointermove derived from the mouse and the transform
  // tracks it (T3) — otherwise the dismissal below could pass via the tap
  // path instead of the drag path.
  expect((await panelInlineStyles(page)).transform).toBe(`translateY(${DRAG_DISMISS_PX}px)`);
  await page.mouse.up();

  // Under reduced motion the 0ms transition fires no transitionend — the
  // 220ms DURATION_NORMAL_FALLBACK_MS timeout is the close path (header note).
  await expect(page.locator(MODAL), "past-threshold release closes the modal").toHaveCount(0);
  expect(await page.evaluate(() => window.__modalClosed)).toBe(true);
});

test("§10: 60px grab drag springs back — stays open, styles cleared, synthesized click suppressed", async ({
  page,
}) => {
  await openLive(page, { width: 390, height: 844 });
  const { x, y } = await grabCenter(page);

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + DRAG_SPRINGBACK_PX, { steps: 6 });
  expect((await panelInlineStyles(page)).transform).toBe(`translateY(${DRAG_SPRINGBACK_PX}px)`);
  await page.mouse.up();

  // T4 settle (120ms fallback under reduced motion) returns the panel to
  // stylesheet control: ALL inline drag props end up cleared.
  await expect
    .poll(async () => (await panelInlineStyles(page)).transform, {
      message: "spring-back settle clears the inline transform",
    })
    .toBe("");
  const styles = await panelInlineStyles(page);
  expect(styles.transition, "inline transition cleared after settle").toBe("");
  expect(styles.animation, "inline animation cleared after settle").toBe("");

  // The click browsers synthesize after pointerup belongs to the DRAG — the
  // slop discrimination must swallow it (§10). Give the click + the one-shot
  // reset a beat, then pin that nothing closed.
  await page.waitForTimeout(300);
  await expect(page.locator(MODAL), "below-threshold drag never closes").toHaveCount(1);
  expect(await page.evaluate(() => window.__modalClosed)).toBeFalsy();
});

test("§11 C6: resize across sm mid-drag clears inline styles; close button still works", async ({
  page,
}) => {
  await openLive(page, { width: 390, height: 844 });
  const { x, y } = await grabCenter(page);

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 80, { steps: 4 });
  expect((await panelInlineStyles(page)).transform).toBe("translateY(80px)");

  // Cross the sm (640px) boundary MID-DRAG: the §10 matchMedia cleanup must
  // release the drag and clear every inline style the drag wrote — CSS mode
  // classes cannot clear inline styles, so a missing cleanup strands the
  // popup panel translated 80px down.
  await page.setViewportSize({ width: 800, height: 900 });
  await expect
    .poll(async () => (await panelInlineStyles(page)).transform, {
      message: "matchMedia cleanup clears the inline transform on entering ≥sm",
    })
    .toBe("");
  await page.mouse.up();
  await page.waitForTimeout(100); // any synthesized click has fired by now

  const styles = await panelInlineStyles(page);
  expect(styles.transform, "no stranded inline transform").toBe("");
  expect(styles.transition, "no stranded inline transition").toBe("");
  expect(styles.animation, "no stranded inline animation").toBe("");
  await expect(page.locator(MODAL), "modal survives the mode switch").toHaveCount(1);
  expect(await page.evaluate(() => window.__modalClosed)).toBeFalsy();

  // "Remains fully interactive": the close button still closes (T2 instant).
  await page.locator(CLOSE).click();
  await expect(page.locator(MODAL), "close button works after the mode switch").toHaveCount(0);
  expect(await page.evaluate(() => window.__modalClosed)).toBe(true);
});

// ── §6.3a scroll-spy (two-pane 1280) ─────────────────────────────────────────

test("§6.3a: scrolling to each section's top activates the rule's rail item (incl. bottom clamp)", async ({
  page,
}) => {
  await openLive(page, { width: 1280, height: 800 });
  const m = await contentMetrics(page);
  expect(m.tops.length, "all registry sections render").toBeGreaterThanOrEqual(11);
  expect(
    m.scrollHeight,
    "content pane actually scrolls (otherwise every position is the bottom clamp)",
  ).toBeGreaterThan(m.clientHeight + SCROLL_SPY_OFFSET_PX);

  const expectedSeen = new Set<string>();
  for (const s of m.tops) {
    // Instant scroll under reduced motion; the browser clamps to maxScroll,
    // so derive the EXPECTED active from the ACTUAL scrollTop it lands on —
    // late-section positions become the §6.3a bottom-clamp case naturally.
    const actualTop = await page.locator(CONTENT).evaluate((el, top) => {
      el.scrollTo({ top });
      return el.scrollTop;
    }, s.top);
    const expected = specActiveSection(actualTop, m.clientHeight, m.scrollHeight, m.tops);
    expectedSeen.add(expected);
    await expect
      .poll(() => railActiveId(page), {
        message: `rail aria-current after scrollTo(${s.id} top ${s.top}) → expected ${expected}`,
      })
      .toBe(expected);
  }

  // Explicit bottom clamp: hard-scroll to the very end → LAST section active
  // even though it may be too short to ever cross the 90px offset line.
  const lastId = m.tops[m.tops.length - 1]?.id ?? "";
  await page.locator(CONTENT).evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await expect
    .poll(() => railActiveId(page), { message: "bottom clamp activates the last section" })
    .toBe(lastId);

  // Non-vacuity: the sweep exercised multiple distinct actives including the
  // first and last sections (a scroll-spy stuck on one item cannot pass).
  expect(expectedSeen.size, "sweep covers several distinct actives").toBeGreaterThanOrEqual(4);
  expect(expectedSeen.has(m.tops[0]?.id ?? ""), "first section exercised").toBe(true);
  expect(expectedSeen.has(lastId), "last section exercised (clamp)").toBe(true);
});

test("§6.3a coordinate proof: far rail click lands the section within 90px of the scroller top", async ({
  page,
}) => {
  await openLive(page, { width: 1280, height: 800 });
  const m = await contentMetrics(page);
  const maxScroll = m.scrollHeight - m.clientHeight;

  // Pick the FARTHEST section whose top is actually reachable within the
  // offset (the last sections may sit above maxScroll only by less than the
  // pane height — e.g. the short warnings empty state — where the §6.3a
  // landing guarantee is geometrically impossible). Require it to be in the
  // back half of the registry so this is a real long-distance glide across
  // the content pane's nonzero p-tile-pad padding (the coordinate proof).
  let candidate: { id: string; top: number; index: number } | null = null;
  for (let i = 0; i < m.tops.length; i++) {
    const s = m.tops[i];
    if (!s) continue;
    const clickTop = Math.min(Math.max(s.top - NAV_CLICK_OFFSET_PX, 0), maxScroll);
    if (s.top - clickTop > SCROLL_SPY_OFFSET_PX) continue; // unreachable landing
    if (specActiveSection(clickTop, m.clientHeight, m.scrollHeight, m.tops) !== s.id) continue;
    candidate = { id: s.id, top: s.top, index: i };
  }
  expect(candidate, "a reachable far section exists").not.toBeNull();
  if (!candidate) return;
  expect(
    candidate.index,
    `candidate ${candidate.id} is in the back half of the registry`,
  ).toBeGreaterThanOrEqual(Math.floor(m.tops.length / 2));

  await page.locator(`[data-testid="${tid(`rail-item-${candidate.id}`)}"]`).click();

  // Instant glide under reduced motion; the rAF pass may lag a frame — poll.
  await expect
    .poll(() => railActiveId(page), { message: "clicked rail item becomes/stays active" })
    .toBe(candidate.id);
  const landing = await page.locator(CONTENT).evaluate(
    (scroller, sectionSel) => {
      const target = scroller.querySelector(sectionSel);
      if (!target) return null;
      return {
        distance: target.getBoundingClientRect().top - scroller.getBoundingClientRect().top,
        scrollTop: scroller.scrollTop,
      };
    },
    `[data-testid="${tid(`section-${candidate.id}`)}"]`,
  );
  expect(landing, "target section still rendered").not.toBeNull();
  if (!landing) return;
  expect(landing.scrollTop, "the click actually scrolled the pane").toBeGreaterThan(0);
  // §6.3a: the section's top lands within SCROLL_SPY_OFFSET_PX of the scroller
  // top. An offsetTop-based implementation misses by the content pane's
  // p-tile-pad padding (nonzero by construction) + the panel nesting offsets.
  expect(landing.distance, "section top at/below the scroller top").toBeGreaterThanOrEqual(-TOL);
  expect(
    landing.distance,
    `section top within ${SCROLL_SPY_OFFSET_PX}px of the scroller top`,
  ).toBeLessThanOrEqual(SCROLL_SPY_OFFSET_PX + TOL);
});

// ── §9.4/§15/§16 Tab audit — sheet (390) and two-pane (1280) ─────────────────

const TAB_MODES = [
  { mode: "sheet", width: 390, height: 844, hiddenNav: "rail" },
  { mode: "two-pane", width: 1280, height: 800, hiddenNav: "chiprail" },
] as const;

for (const { mode, width, height, hiddenNav } of TAB_MODES) {
  test(`§16 Tab audit @ ${mode} ${width}px: every stop visible, hidden nav unreachable, cycle wraps`, async ({
    page,
  }) => {
    await openLive(page, { width, height });

    // Initial focus contract (§15): the close button.
    await expect
      .poll(
        () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.testid),
        { message: "initial focus lands on the close button" },
      )
      .toBe(tid("close"));

    // Identify the panel's FIRST visible focusable (the trap's wrap target)
    // by stamping it with an audit key. Visibility check is getClientRects —
    // stricter than the hook's offsetParent heuristic, so a display:none twin
    // can never be selected here.
    const firstKey = await page.evaluate(() => {
      const w = window as unknown as { __tabAuditSeq?: number };
      const stamp = (el: HTMLElement) => {
        if (!el.dataset.tabAuditKey) {
          w.__tabAuditSeq = (w.__tabAuditSeq ?? 0) + 1;
          el.dataset.tabAuditKey = String(w.__tabAuditSeq);
        }
        return el.dataset.tabAuditKey;
      };
      const panel = document.querySelector<HTMLElement>("[data-step3-review-panel]");
      if (!panel) return null;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.getClientRects().length > 0);
      const first = focusables[0];
      return first ? stamp(first) : null;
    });
    expect(firstKey, "panel has a first visible focusable").not.toBeNull();

    const describeActive = () =>
      page.evaluate(
        ([railSel, chipSel]) => {
          const w = window as unknown as { __tabAuditSeq?: number };
          const el = document.activeElement as HTMLElement | null;
          if (!el) return null;
          if (!el.dataset.tabAuditKey) {
            w.__tabAuditSeq = (w.__tabAuditSeq ?? 0) + 1;
            el.dataset.tabAuditKey = String(w.__tabAuditSeq);
          }
          return {
            key: el.dataset.tabAuditKey as string,
            testid: el.getAttribute("data-testid"),
            tag: el.tagName,
            visible: el.getClientRects().length > 0,
            inPanel: el.closest("[data-step3-review-panel]") !== null,
            inRail: el.closest(railSel as string) !== null,
            inChipRail: el.closest(chipSel as string) !== null,
          };
        },
        [`[data-testid="${tid("rail")}"]`, `[data-testid="${tid("chiprail")}"]`],
      );

    const start = await describeActive();
    expect(start, "close button is describable").not.toBeNull();
    if (!start || firstKey === null) return;

    // Walk the whole cycle: from the close button, Tab until we return to it.
    // Every stop must be a VISIBLE element inside the panel and never inside
    // the mode's hidden nav twin; after the last focusable the trap must wrap
    // to the first (the real-browser confirmation of the jsdom wrap test).
    const visited = new Set<string>([start.key]);
    const sequence: string[] = [start.key];
    let sawFirst = false;
    let wrapped = false;
    for (let press = 1; press <= 300; press++) {
      await page.keyboard.press("Tab");
      const cur = await describeActive();
      expect(cur, `press ${press}: an element is focused`).not.toBeNull();
      if (!cur) return;
      const label = `press ${press} @ ${mode} (${cur.tag} ${cur.testid ?? "(no testid)"})`;
      expect(cur.visible, `${label}: focused element is visible`).toBe(true);
      expect(cur.inPanel, `${label}: focus stays inside the panel`).toBe(true);
      if (hiddenNav === "rail") {
        expect(cur.inRail, `${label}: hidden side rail never focused @ sheet`).toBe(false);
      } else {
        expect(cur.inChipRail, `${label}: hidden chip rail never focused @ two-pane`).toBe(false);
      }
      if (cur.key === firstKey) sawFirst = true;
      if (visited.has(cur.key)) {
        // First revisit MUST be the cycle closing back at the start (a repeat
        // anywhere else means focus got stuck or skipped ahead).
        expect(cur.key, `${label}: first revisit closes the cycle at the start`).toBe(start.key);
        wrapped = true;
        break;
      }
      visited.add(cur.key);
      sequence.push(cur.key);
    }
    expect(wrapped, `cycle returns to the start within 300 presses @ ${mode}`).toBe(true);
    expect(sawFirst, `cycle passes through the panel's first focusable @ ${mode}`).toBe(true);
    // The wrap seam itself: the stop right after the LAST unique stop is the
    // first focusable ONLY IF the cycle's last element wraps there. Because we
    // started mid-cycle (close button), the element after the trap's last
    // focusable is exactly `firstKey` — assert it appears immediately after
    // the publish button (the panel's last focusable in DOM order).
    const publishTestid = tid("publish");
    const publishKey = await page.evaluate((sel) => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${sel}"]`);
      return el?.dataset.tabAuditKey ?? null;
    }, publishTestid);
    expect(publishKey, "publish button was visited (it has an audit key)").not.toBeNull();
    const publishIdx = sequence.indexOf(publishKey ?? "");
    expect(publishIdx, "publish button appears in the traversal").toBeGreaterThanOrEqual(0);
    // (`sequence` holds unique stops; if publish was the final unique stop the
    // very next press was the cycle-closing revisit, i.e. `start.key`.)
    const afterPublish = publishIdx === sequence.length - 1 ? start.key : sequence[publishIdx + 1];
    expect(
      afterPublish,
      `Tab from the last focusable (publish) wraps to the first focusable @ ${mode}`,
    ).toBe(firstKey);

    // Non-vacuity: the traversal covered the real control population (11 nav
    // items + header/footer controls at minimum), not a truncated cycle.
    expect(visited.size, `traversal visits the full control set @ ${mode}`).toBeGreaterThanOrEqual(
      15,
    );
  });
}
