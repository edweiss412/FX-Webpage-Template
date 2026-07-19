/**
 * tests/e2e/statusStripToggleLayout.spec.ts (CASP-2 — spec §8.10)
 *
 * Real-browser geometry for the compact inline PublishedToggle in the
 * StatusStrip at a 390px phone. jsdom computes NO layout, so the strip-height +
 * popover-containment invariants MUST be measured end-to-end. STANDALONE static
 * harness (no app boot / Supabase), modelled on published-review-modal.layout.spec.ts:
 *   1. `tsx` runs _statusStripToggleHarness.tsx OUT of process → JSON of the
 *      rendered states. HASH_FOR_LOG_PEPPER is set for the subprocess only to
 *      satisfy a module-load guard reached via a transitively-imported helper.
 *   2. compile the token CSS from app/globals.css via the Tailwind CLI with
 *      @source globbing every state's html so all classes generate.
 *   3. serve over node:http; measure getBoundingClientRect() at 390px.
 *
 * Invariants (spec §8.10):
 *   (a) in-flow containment (CASP2-4 item 1): the finalize CHIP's box is fully within
 *       the strip's box at 390px (chip.top ≥ strip.top, chip.bottom ≤ strip.bottom) — it
 *       never overhangs, so it can never overlay the rail content below the sticky strip.
 *       AND at ≥sm the chip fits the switch row, so strip height(finalize) === height(idle)
 *       ±0.5px (bounds finalize-state growth; baseline from the idle render, not hardcoded).
 *   (b) compaction: inline idle strip height < card-variant strip height by
 *       > 20px (one text-line) — proves real compaction, baseline from the card
 *       render in the same harness (never a hardcoded pixel). REWRITTEN for
 *       modal-header-reconciliation §6.5 (Task 2): the `chrome` prop is deleted, so
 *       the strip carries no container padding and no title. The card baseline is
 *       re-derived from a sibling render that mirrors the CURRENT strip container
 *       exactly, keeping the comparison apples-to-apples — the delta is still the
 *       toggle's own weight, and the threshold is unchanged. MEASURED AT >=sm
 *       (800px) since §4.5's single-line status (Task 8) makes the real strip
 *       wrap at 390px while the hand-rolled card row cannot — see the test body.
 *   (c) compact chip: the finalize chip is an in-viewport pill (left ≥ 0, right ≤ 390, no
 *       document h-scroll) sitting right of the switch, width < 200px — NOT a full-strip
 *       banner. The overlay residual (BL-CASP2-STRIP-POLISH) is gone: an in-flow chip
 *       cannot float over content the way the pre-change absolute banner did.
 *   (d) error-content banner: the REAL ErrorExplainer+HelpAffordance content in the
 *       full-width break-words banner stays in-viewport with no h-scroll — the long
 *       error copy (the error skin keeps the absolute full-width banner) grows only vertically.
 *
 * Runs via tests/e2e/standalone.config.ts (no webServer / Supabase).
 */
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

const REPO_ROOT = resolve(__dirname, "..", "..");
const MOBILE = { width: 390, height: 800 };

// Duplicated here + cross-checked against the harness JSON so the two never drift.
const SLUG = "casp2-toggle-show";

type HarnessJson = {
  slug: string;
  idleShort: string;
  finalizeShort: string;
  cardShort: string;
  errorProbe: string;
  liveShort: string;
};

function pageHtml(cssHref: string, body: string): string {
  return `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${cssHref}"></head>
<body class="bg-bg">${body}</body></html>`;
}

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "casp2-toggle-layout-"));

  const jsonPath = join(workDir, "states.json");
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_statusStripToggleHarness.tsx"), jsonPath],
    {
      cwd: REPO_ROOT,
      stdio: "pipe",
      timeout: 120_000,
      env: { ...process.env, HASH_FOR_LOG_PEPPER: "test-harness-pepper-000000000000000000" },
    },
  );
  const states = JSON.parse(readFileSync(jsonPath, "utf8")) as HarnessJson;
  expect(states.slug, "spec-local slug matches the harness fixture").toBe(SLUG);

  // Each state → its own served html (all reference out.css — identical class
  // strings, only markup differs).
  const keys: (keyof HarnessJson)[] = [
    "idleShort",
    "finalizeShort",
    "cardShort",
    "errorProbe",
    "liveShort",
  ];
  for (const k of keys) writeFileSync(join(workDir, `${k}.html`), pageHtml("out.css", states[k]));

  // Compile the token CSS once, globbing every state html so all classes generate.
  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(entryCss, `@source "${join(workDir, "*.html")}";\n${globals}`);
  execFileSync(
    "pnpm",
    ["dlx", "@tailwindcss/cli@4.2.4", "-i", entryCss, "-o", join(workDir, "out.css")],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "idleShort.html" : url.replace(/^\//, "");
    try {
      const bodyBuf = readFileSync(join(workDir, file));
      res.setHeader("content-type", file.endsWith(".css") ? "text/css" : "text/html");
      res.end(bodyBuf);
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

async function rectOf(
  page: import("@playwright/test").Page,
  stateKey: string,
  testid: string,
): Promise<{ left: number; right: number; width: number; height: number }> {
  await page.setViewportSize(MOBILE);
  await page.goto(`${baseUrl}${stateKey}.html`);
  const el = page.getByTestId(testid);
  await expect(el).toBeVisible();
  return el.evaluate((n) => {
    const r = n.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width, height: r.height };
  });
}

async function noHorizontalOverflow(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
}

test.describe("CASP-2 inline toggle strip — 390px geometry (spec §8.10)", () => {
  test("(a) the in-flow finalize chip is contained in the strip (no overlay) and does not grow the strip at ≥sm", async ({
    page,
  }) => {
    // CI-1 (390px): the chip's box is fully WITHIN the strip's box — proves in-flow, no overhang
    // over the rail content below the sticky strip (the pre-change absolute banner had bottom > strip.bottom).
    await page.setViewportSize(MOBILE);
    await page.goto(`${baseUrl}finalizeShort.html`);
    const stripBox = await page.getByTestId("show-status-strip").evaluate((n) => {
      const r = n.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
    const chipBox = await page.getByTestId("published-toggle-popover").evaluate((n) => {
      const r = n.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
    expect(chipBox.top, "chip top within strip").toBeGreaterThanOrEqual(stripBox.top - 0.5);
    expect(chipBox.bottom, "chip bottom within strip (no overhang)").toBeLessThanOrEqual(
      stripBox.bottom + 0.5,
    );

    // CI-1b (≥sm, 800px): the chip fits the switch's row, so the strip height is unchanged vs idle
    // (baseline derived from the idle render, never hardcoded) — bounds finalize-state strip growth.
    const DESKTOP = { width: 800, height: 900 };
    await page.setViewportSize(DESKTOP);
    await page.goto(`${baseUrl}idleShort.html`);
    const idleH = await page
      .getByTestId("show-status-strip")
      .evaluate((n) => n.getBoundingClientRect().height);
    await page.goto(`${baseUrl}finalizeShort.html`);
    const finalizeH = await page
      .getByTestId("show-status-strip")
      .evaluate((n) => n.getBoundingClientRect().height);
    expect(Math.abs(idleH - finalizeH), "chip does not grow the strip at ≥sm").toBeLessThanOrEqual(
      0.5,
    );
  });

  test("(b) the inline strip is materially shorter than the pre-CASP-2 card strip", async ({
    page,
  }) => {
    // MEASURED AT >=sm, NOT 390px (modal-header-reconciliation §4.5, Task 8).
    //
    // This invariant's claim is about the TOGGLE's own weight — card box vs
    // inline row — and `cardShort` is a hand-rolled row holding ONLY the card
    // toggle, with no status line, Re-sync or copy button. That comparison is
    // apples-to-apples only while the real strip is a SINGLE row, which is
    // exactly what `sm:flex-nowrap` guarantees at >=sm and deliberately does
    // NOT guarantee at 390px.
    //
    // §4.5 collapsed the status stack to one line, which is TALLER-per-row but
    // WIDER, and at 390px that extra width pushes the strip onto a second
    // wrapped row: the idle strip measures 44px -> 80px while `cardShort`
    // (which has nothing to wrap) stays at 91px. The old 390px delta therefore
    // fell to ~11px — not because compaction regressed, but because the
    // measurement had become a wrap-count comparison rather than a toggle-weight
    // one. Widening the threshold would have preserved a green test that no
    // longer measured its own invariant.
    //
    // Precedent for measuring >=sm inside this 390px describe: invariant (a)'s
    // CI-1b clause already does it, for the same reason.
    const DESKTOP = { width: 800, height: 900 };
    const heightAt = async (stateKey: string): Promise<number> => {
      await page.setViewportSize(DESKTOP);
      await page.goto(`${baseUrl}${stateKey}.html`);
      const el = page.getByTestId("show-status-strip");
      await expect(el).toBeVisible();
      return el.evaluate((n) => n.getBoundingClientRect().height);
    };
    const inlineH = await heightAt("idleShort");
    const cardH = await heightAt("cardShort");
    // Baseline derived from the card render — not a hardcoded pixel count.
    expect(cardH - inlineH, `card ${cardH} vs inline ${inlineH}`).toBeGreaterThan(20);
  });

  test("(c) the finalize chip is a compact in-viewport pill right of the switch (not a full-strip banner)", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto(`${baseUrl}finalizeShort.html`);
    const chip = await page.getByTestId("published-toggle-popover").evaluate((n) => {
      const r = n.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width };
    });
    const sw = await page.getByTestId("published-toggle").evaluate((n) => {
      const r = n.getBoundingClientRect();
      return { right: r.right };
    });
    // CI-2: in-viewport, no page h-scroll.
    expect(chip.left, "chip left in viewport").toBeGreaterThanOrEqual(0);
    expect(chip.right, "chip right in viewport").toBeLessThanOrEqual(390);
    expect(await noHorizontalOverflow(page), "no document h-scroll").toBe(true);
    // CI-3: sits after the switch in flow, and is a compact pill (NOT the >300px full-strip
    // banner the old finalize skin was).
    expect(chip.left, "chip sits right of the switch").toBeGreaterThanOrEqual(sw.right - 0.5);
    expect(chip.width, "chip is a compact pill, not a full-strip banner").toBeLessThan(200);
  });

  test("(d) the real error-popover content stays in the viewport as a full-width banner", async ({
    page,
  }) => {
    const probe = await rectOf(page, "errorProbe", "error-content-probe-box");
    expect(probe.left).toBeGreaterThanOrEqual(0);
    expect(probe.right).toBeLessThanOrEqual(390);
    expect(await noHorizontalOverflow(page)).toBe(true);
  });

  test("(e) CASP2-4 control divider separates toggle from signals at ≥sm, absent at 390px", async ({
    page,
  }) => {
    await page.goto(`${baseUrl}liveShort.html`);

    // ≥sm: `hidden sm:block` → the divider renders with real width, sitting between the
    // toggle cluster's right edge and the live badge's left edge.
    await page.setViewportSize({ width: 800, height: 900 });
    const box = (n: Element) => {
      const r = n.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width };
    };
    const dividerAt800 = await page.getByTestId("strip-control-divider").evaluate(box);
    const toggle = await page.getByTestId("strip-publish-toggle").evaluate(box);
    const live = await page.getByTestId("strip-live-badge").evaluate(box);
    expect(dividerAt800.width, "divider has real width at ≥sm").toBeGreaterThan(0);
    expect(toggle.right, "toggle sits left of the divider").toBeLessThanOrEqual(
      dividerAt800.left + 0.5,
    );
    expect(dividerAt800.right, "divider sits left of the live badge").toBeLessThanOrEqual(
      live.left + 0.5,
    );

    // 390px: `hidden` (no sm) → display:none → no layout box (boundingBox() is null),
    // so the CASP-2 §8.10 mobile geometry is unchanged — no new element on the wrapped row.
    await page.setViewportSize(MOBILE);
    const dividerAt390 = await page.getByTestId("strip-control-divider").boundingBox();
    expect(dividerAt390, "divider is display:none at 390px").toBeNull();
  });
});
