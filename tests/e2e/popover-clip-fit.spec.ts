/**
 * tests/e2e/popover-clip-fit.spec.ts
 * (spec 2026-08-01-admin-popover-overlay-cluster §4.2, §4.3, §8, §9, §3.4)
 *
 * REAL-BROWSER clip-fit probe. jsdom computes no layout, so every obligation
 * here — the AttentionMenu scroller's fitted height, the menu's containment
 * inside the clipping modal panel, the PublishedToggle banner's containment and
 * scrollability, and the keyboard-inclusive mutual exclusion between the two
 * overlays — exists only in a real engine.
 *
 * Two live entries, two pages, one server:
 *   - live.html   → _pillFocusLiveEntry.tsx (the REAL PublishedReviewModal:
 *                   attention pill + menu, StatusStrip, ShareHub)
 *   - toggle.html → _publishedToggleClipLiveEntry.tsx (the REAL PublishedToggle
 *                   inline arm inside a replica overflow-clip panel)
 *
 * Boot mirrors attention-pill-focus.spec.ts: bundle each entry out-of-process
 * with pinned esbuild, compile real Tailwind CSS, serve from a tmp dir.
 * Hydration gate: `window.__hydrated` (never networkidle). Driving:
 * `window.__setItems` (React state — detach-safe). Every measurement re-queries
 * its elements INSIDE the evaluate callback, so no handle outlives a re-render.
 *
 * Expectations are derived in-page from measured rects. The literal fitted
 * pixel value appears nowhere in this file.
 *
 * Run:
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts \
 *     tests/e2e/popover-clip-fit.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { compileEntryCss } from "./helpers/liveEntryToolchain";

const REPO_ROOT = resolve(__dirname, "..", "..");

let server: Server;
let baseUrl: string;
let workDir: string;

const PILL_ENTRY = join(REPO_ROOT, "tests", "e2e", "_pillFocusLiveEntry.tsx");

function html(bundle: string): string {
  return `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="${bundle}"></script></body></html>`;
}

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "popover-clip-fit-"));
  writeFileSync(join(workDir, "live.html"), html("bundle.js"));

  // The modal's import graph reaches "use server" actions + node builtins that
  // Next elides from client bundles; the pinned esbuild JS-API helper
  // replicates that elision (see _step3ReviewModalBundle.mjs rationale).
  // T4 adds the PublishedToggle entry to this list together with its case block.
  for (const [entry, out] of [[PILL_ENTRY, join(workDir, "bundle.js")]] as const) {
    execFileSync(
      process.execPath,
      [join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalBundle.mjs"), entry, out, join(REPO_ROOT, "tsconfig.json")],
      { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
    );
  }

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    [
      `@source "${join(REPO_ROOT, "components", "admin")}";`,
      `@source "${PILL_ENTRY}";`,
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
});

test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

const PILL = '[data-testid="published-show-review-alert-pill"]';
const MENU = '[data-testid="published-show-review-attention-menu"]';
const PANEL = "[data-review-modal-panel]";
/** The scroller inside the menu panel — the node this cluster gives a role. */
const SCROLLER = 'div[role="group"][aria-label="Show issues"]';

/** The fit gutter, mirroring DEFAULT_CLIP_GUTTER (lib/layout/fitWithinClip.ts). */
const GUTTER = 8;
/** The scroller's declared CSS cap (`max-h-96`). */
const CSS_CAP = 384;

type SetItems = (a: number, n: number, s: number, degraded: boolean) => void;

async function setItems(page: Page, a: number, n: number, s: number) {
  await page.evaluate(
    ([aa, nn, ss]) => (window as unknown as { __setItems: SetItems }).__setItems(aa!, nn!, ss!, false),
    [a, n, s],
  );
}

/** Boots the modal page and leaves the attention menu OPEN. */
async function openMenu(page: Page, a: number, n: number, s: number) {
  await page.goto(baseUrl);
  await page.waitForFunction(() => (window as unknown as { __hydrated?: boolean }).__hydrated === true);
  await setItems(page, a, n, s);
  // §5.2 auto-open fires once per mount when actionable items exist.
  if ((await page.locator(MENU).count()) === 0) await page.locator(PILL).click();
  await expect(page.locator(MENU)).toBeVisible();
}

// ---------------------------------------------------------------------------
// Case blocks land with their OWNING tasks (plan T2b split): T3 restores the
// AttentionMenu block, T4 the PublishedToggle block, T7 the mutual-exclusion
// block — each together with the implementation that turns it green. The full
// authored spec, whose REDs were all observed against pre-change production, is
// held at .claude/t2b-handoff/popover-clip-fit.full.spec.txt.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// T3 — AttentionMenu: fitted scroller, containment, reachability, keyboard
// ---------------------------------------------------------------------------

test.describe("§9 obligation 1+2 — AttentionMenu scroller fits inside the clipping panel", () => {
  for (const height of [844, 667, 560]) {
    test(`settled fit at 390x${height} (reduced motion)`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width: 390, height });
      await openMenu(page, 10, 10, 10);

      const m = await page.evaluate(
        ([panelSel, scrollerSel, gutter, cap]) => {
          const panel = document.querySelector(panelSel as string)!;
          const scroller = document.querySelector(scrollerSel as string)!;
          const p = panel.getBoundingClientRect();
          const s = scroller.getBoundingClientRect();
          const available = Math.floor(p.bottom - s.top - (gutter as number));
          return {
            height: s.height,
            available,
            capped: available >= (cap as number),
            scrollHeight: scroller.scrollHeight,
            clientHeight: scroller.clientHeight,
          };
        },
        [PANEL, SCROLLER, GUTTER, CSS_CAP] as const,
      );

      expect(m.scrollHeight, "fixture must overflow the scroller").toBeGreaterThan(m.clientHeight);
      if (m.capped) {
        expect(m.height).toBeLessThanOrEqual(CSS_CAP + 0.5);
      } else {
        expect(Math.abs(m.height - m.available), `height ${m.height} vs available ${m.available}`).toBeLessThanOrEqual(0.5);
      }
    });
  }

  test("settled fit at 390x560 on the ANIMATED path (awaits transitionend)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 560 });
    await openMenu(page, 10, 10, 10);
    await page.locator(MENU).evaluate(
      (el) =>
        new Promise<void>((r) => {
          const done = () => r();
          el.addEventListener("transitionend", done, { once: true });
          // The entrance may already have settled by the time we attach.
          if (getComputedStyle(el).opacity === "1") r();
        }),
    );

    const m = await page.evaluate(
      ([panelSel, scrollerSel, gutter]) => {
        const p = document.querySelector(panelSel as string)!.getBoundingClientRect();
        const s = document.querySelector(scrollerSel as string)!.getBoundingClientRect();
        return { height: s.height, available: Math.floor(p.bottom - s.top - (gutter as number)) };
      },
      [PANEL, SCROLLER, GUTTER] as const,
    );
    expect(Math.abs(m.height - m.available)).toBeLessThanOrEqual(0.5);
  });

  test("containment at 390x560: the menu never crosses the panel's clip edge", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 560 });
    await openMenu(page, 10, 10, 10);
    const m = await page.evaluate(
      ([panelSel, menuSel]) => {
        const p = document.querySelector(panelSel as string)!.getBoundingClientRect();
        const menu = document.querySelector(menuSel as string)!.getBoundingClientRect();
        return { panelBottom: p.bottom, menuBottom: menu.bottom };
      },
      [PANEL, MENU] as const,
    );
    expect(m.menuBottom, `menu.bottom ${m.menuBottom} > panel.bottom ${m.panelBottom}`).toBeLessThanOrEqual(m.panelBottom + 0.5);
  });

  test("every interactive row is reachable, and the monitoring tail is readable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 560 });
    await openMenu(page, 10, 10, 10);

    // The 10/10/10 fixture renders the ten monitoring rows LAST, so at MAX
    // scroll the last INTERACTIVE row sits above the visible window — scroll it
    // into view first, then assert it is genuinely hittable.
    const interactive = await page.evaluate(
      ([scrollerSel]) => {
        const scroller = document.querySelector(scrollerSel as string)!;
        const rows = scroller.querySelectorAll<HTMLElement>('button[data-testid^="attention-menu-row-"]');
        const last = rows[rows.length - 1]!;
        last.scrollIntoView({ block: "nearest" });
        const r = last.getBoundingClientRect();
        const sc = scroller.getBoundingClientRect();
        const visibleTop = Math.max(r.top, sc.top);
        const visibleBottom = Math.min(r.bottom, sc.bottom);
        const hit = document.elementFromPoint((r.left + r.right) / 2, (visibleTop + visibleBottom) / 2);
        return {
          count: rows.length,
          visibleHeight: visibleBottom - visibleTop,
          hitInsideRow: hit !== null && last.contains(hit),
        };
      },
      [SCROLLER] as const,
    );
    expect(interactive.count).toBe(20); // 10 actionable + 10 needs-look
    expect(interactive.visibleHeight, "last interactive row is not a full tap target").toBeGreaterThanOrEqual(44);
    expect(interactive.hitInsideRow, "last interactive row is not hittable at its centre").toBe(true);

    const monitoring = await page.evaluate(
      ([scrollerSel]) => {
        const scroller = document.querySelector(scrollerSel as string)!;
        scroller.scrollTop = scroller.scrollHeight;
        const rows = scroller.querySelectorAll<HTMLElement>('[data-testid^="attention-monitoring-row-"]');
        const last = rows[rows.length - 1]!;
        const r = last.getBoundingClientRect();
        const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
        return { count: rows.length, hitInsideRow: hit !== null && last.contains(hit) };
      },
      [SCROLLER] as const,
    );
    expect(monitoring.count).toBe(10);
    expect(monitoring.hitInsideRow, "monitoring tail is stranded below the clip edge").toBe(true);
  });

  test("held-open O2 -> O1 flip re-fits and stays contained", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 560 });
    await openMenu(page, 0, 0, 10); // monitoring only (O2)
    await setItems(page, 10, 10, 10); // needs-you heading mounts (O1)
    await expect(page.locator('[data-testid="attention-needsyou-heading"]')).toBeVisible();

    const m = await page.evaluate(
      ([panelSel, menuSel, scrollerSel, gutter]) => {
        const p = document.querySelector(panelSel as string)!.getBoundingClientRect();
        const menu = document.querySelector(menuSel as string)!.getBoundingClientRect();
        const scroller = document.querySelector(scrollerSel as string)!;
        const s = scroller.getBoundingClientRect();
        const last = scroller.querySelectorAll<HTMLElement>('button[data-testid^="attention-menu-row-"]');
        const lastRow = last[last.length - 1]!;
        lastRow.scrollIntoView({ block: "nearest" });
        const r = lastRow.getBoundingClientRect();
        const visibleTop = Math.max(r.top, s.top);
        const visibleBottom = Math.min(r.bottom, s.bottom);
        const hit = document.elementFromPoint((r.left + r.right) / 2, (visibleTop + visibleBottom) / 2);
        return {
          panelBottom: p.bottom,
          menuBottom: menu.bottom,
          height: s.height,
          available: Math.floor(p.bottom - s.top - (gutter as number)),
          hitInsideRow: hit !== null && lastRow.contains(hit),
        };
      },
      [PANEL, MENU, SCROLLER, GUTTER] as const,
    );
    expect(m.menuBottom).toBeLessThanOrEqual(m.panelBottom + 0.5);
    expect(Math.abs(m.height - m.available)).toBeLessThanOrEqual(0.5);
    expect(m.hitInsideRow).toBe(true);
  });

  test("compound: the O2 -> O1 flip lands MID-ENTRANCE and still settles fitted", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 560 });
    // Frame-hold precedent: attention-pill-focus.spec.ts. Holding frames keeps
    // the entrance pre-flip while the structural change happens, which is the
    // compound the transition inventory names.
    await page.addInitScript(() => {
      const queue = new Map<number, FrameRequestCallback>();
      let nextId = 1 << 20;
      const realRaf = window.requestAnimationFrame.bind(window);
      const realCancel = window.cancelAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb: FrameRequestCallback) => {
        const id = nextId++;
        queue.set(id, cb);
        return id;
      };
      window.cancelAnimationFrame = (id: number) => {
        if (queue.delete(id)) return;
        realCancel(id);
      };
      (window as unknown as { __releaseFrames: () => void }).__releaseFrames = () => {
        window.requestAnimationFrame = realRaf;
        window.cancelAnimationFrame = realCancel;
        const pending = [...queue.values()];
        queue.clear();
        for (const cb of pending) cb(performance.now());
      };
      (window as unknown as { __heldFrameCount: () => number }).__heldFrameCount = () => queue.size;
    });

    await openMenu(page, 0, 0, 10);
    await setItems(page, 10, 10, 10);
    expect(await page.evaluate(() => (window as unknown as { __heldFrameCount: () => number }).__heldFrameCount())).toBeGreaterThan(0);
    await page.evaluate(() => (window as unknown as { __releaseFrames: () => void }).__releaseFrames());

    const m = await page.evaluate(
      ([panelSel, menuSel, scrollerSel, gutter]) => {
        const p = document.querySelector(panelSel as string)!.getBoundingClientRect();
        const menu = document.querySelector(menuSel as string)!.getBoundingClientRect();
        const s = document.querySelector(scrollerSel as string)!.getBoundingClientRect();
        return {
          panelBottom: p.bottom,
          menuBottom: menu.bottom,
          height: s.height,
          available: Math.floor(p.bottom - s.top - (gutter as number)),
        };
      },
      [PANEL, MENU, SCROLLER, GUTTER] as const,
    );
    expect(m.menuBottom).toBeLessThanOrEqual(m.panelBottom + 0.5);
    expect(Math.abs(m.height - m.available)).toBeLessThanOrEqual(0.5);
  });

  test("keyboard: the scroller is in focus order ahead of its rows, and ArrowDown scrolls it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 560 });
    await openMenu(page, 10, 10, 10);

    // Start from the PILL — the control that owns the menu — rather than
    // tabbing from wherever the dialog happened to leave focus, which lands
    // past the menu entirely and would only ever prove "eventually wraps".
    // The contract (spec §4.2) is that the scrollable region is reachable
    // BEFORE its own rows: without tabIndex the engine skips the container and
    // Tab goes straight to the first row button, stranding a monitoring-only
    // list (all read-only rows, zero focusables) behind no reachable scroller.
    await page.locator(PILL).focus();
    const seen: string[] = [];
    // Stops AT the scroller: ArrowDown below must be delivered while the
    // scrollable region itself holds focus, not a row three tabs later.
    for (let i = 0; i < 3 && !seen.includes("SCROLLER"); i++) {
      await page.keyboard.press("Tab");
      seen.push(
        await page.evaluate(
          ([sel]) => {
            const active = document.activeElement;
            if (!active) return "none";
            if (active === document.querySelector(sel as string)) return "SCROLLER";
            return active.getAttribute("data-testid") ?? active.tagName;
          },
          [SCROLLER] as const,
        ),
      );
    }
    const scrollerAt = seen.indexOf("SCROLLER");
    const firstRowAt = seen.findIndex((s) => s.startsWith("attention-menu-row-"));
    expect(scrollerAt, `Tab from the pill never reached the scroller (saw ${seen.join(" -> ")})`).toBeGreaterThanOrEqual(0);
    if (firstRowAt >= 0) {
      expect(scrollerAt, `a row took focus before the scrollable region (${seen.join(" -> ")})`).toBeLessThan(firstRowAt);
    }

    const before = await page.evaluate(([sel]) => document.querySelector(sel as string)!.scrollTop, [SCROLLER] as const);
    await page.keyboard.press("ArrowDown");
    // Chromium animates keyboard scrolling, so the value immediately after the
    // keypress is still the pre-animation one — poll for the settled position.
    await expect
      .poll(
        () => page.evaluate(([sel]) => document.querySelector(sel as string)!.scrollTop, [SCROLLER] as const),
        { message: `scrollTop never advanced from ${before}` },
      )
      .toBeGreaterThan(before);
  });
});
