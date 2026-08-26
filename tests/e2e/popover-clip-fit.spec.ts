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
import { test, expect } from "./helpers/fontFidelityFixture";
import type { Page } from "@playwright/test";
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
const TOGGLE_ENTRY = join(REPO_ROOT, "tests", "e2e", "_publishedToggleClipLiveEntry.tsx");

function html(bundle: string): string {
  return `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="${bundle}"></script></body></html>`;
}

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "popover-clip-fit-"));
  writeFileSync(join(workDir, "live.html"), html("bundle.js"));
  writeFileSync(join(workDir, "toggle.html"), html("toggle.js"));

  // The modal's import graph reaches "use server" actions + node builtins that
  // Next elides from client bundles; the pinned esbuild JS-API helper
  // replicates that elision (see _step3ReviewModalBundle.mjs rationale).
  for (const [entry, out] of [
    [PILL_ENTRY, join(workDir, "bundle.js")],
    [TOGGLE_ENTRY, join(workDir, "toggle.js")],
  ] as const) {
    execFileSync(
      process.execPath,
      [
        join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalBundle.mjs"),
        entry,
        out,
        join(REPO_ROOT, "tsconfig.json"),
      ],
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
      `@source "${TOGGLE_ENTRY}";`,
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
const HUB_PRIMARY = '[data-testid="share-hub-primary"]';
const HUB_KEBAB = '[data-testid="share-hub-kebab"]';
const HUB_POPOVER = '[data-testid="share-hub-popover"]';
const TOGGLE_BANNER = '[data-testid="published-toggle-popover"]';
const TOGGLE_CLIP = '[data-testid="toggle-clip-panel"]';
/** The scroller inside the menu panel — the node this cluster gives a role. */
const SCROLLER = 'div[role="group"][aria-label="Attention items"]';

/** The fit gutter, mirroring DEFAULT_CLIP_GUTTER (lib/layout/fitWithinClip.ts). */
const GUTTER = 8;
/** The scroller's declared CSS cap (`max-h-96`). */
const CSS_CAP = 384;
/** Mirrors MIN_FITTED_HEIGHT (lib/layout/fitWithinClip.ts) — the collapse floor. */
const FLOOR = 48;
/** The refusal banner's offset below the strip it anchors to (`mt-1`). Reference only. */
const _BANNER_OFFSET = 4;
/** The strip is the banner's positioned ancestor (`sticky` ⇒ positioned). */
const STRIP = '[data-testid="show-status-strip"]';

type SetItems = (a: number, n: number, s: number, degraded: boolean) => void;

async function setItems(page: Page, a: number, n: number, s: number) {
  await page.evaluate(
    ([aa, nn, ss]) =>
      (window as unknown as { __setItems: SetItems }).__setItems(aa!, nn!, ss!, false),
    [a, n, s],
  );
}

/** Boots the modal page and leaves the attention menu OPEN. */
async function openMenu(page: Page, a: number, n: number, s: number) {
  await page.goto(baseUrl);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () => (window as unknown as { __hydrated?: boolean }).__hydrated === true,
  );
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

/**
 * The fitted geometry, re-read from scratch on every call.
 *
 * §9's obligations describe the SETTLED state, and the re-measure is driven by a
 * ResizeObserver / transitionend, both asynchronous: a single sample taken right
 * after a structural change can land on the frame BEFORE the re-apply and fail
 * on a correct implementation (observed twice across repeated runs of the two
 * O2 -> O1 flip cases). Callers poll this until it converges.
 */
/**
 * Two samples that agree on the NUMBERS, not merely on two verdicts.
 *
 * `expect.poll` resolves on the first satisfying sample, so a correct
 * intermediate fit that a later observer callback broke would satisfy the
 * assertion and return before the regression appeared. Comparing the measured
 * height and available room across samples — rather than the booleans derived
 * from them — makes a moving box fail instead of passing twice on the way past.
 *
 * The callers pair this with reduced-motion emulation, which is what actually
 * removes the mid-transition window: sampling alone cannot prove a transition
 * has finished, it can only notice that two samples disagree. The ANIMATED
 * settle has its own dedicated case, which awaits `transitionend` explicitly.
 */
async function settledGeometry(page: Page) {
  const first = await fittedGeometry(page);
  await page.waitForTimeout(80);
  const second = await fittedGeometry(page);
  if (first === null || second === null) return null;
  const stable = first.height === second.height && first.available === second.available;
  return {
    contained: stable && first.contained && second.contained,
    fitted: stable && first.fitted && second.fitted,
  };
}

async function fittedGeometry(page: Page) {
  return page.evaluate(
    ([panelSel, menuSel, scrollerSel, gutter]) => {
      const panel = document.querySelector(panelSel as string);
      const menu = document.querySelector(menuSel as string);
      const scroller = document.querySelector(scrollerSel as string);
      if (!panel || !menu || !scroller) return null;
      const p = panel.getBoundingClientRect();
      const m = menu.getBoundingClientRect();
      const sc = scroller.getBoundingClientRect();
      const available = Math.floor(p.bottom - sc.top - (gutter as number));
      return {
        contained: m.bottom <= p.bottom + 0.5,
        fitted: Math.abs(sc.height - available) <= 0.5,
        height: sc.height,
        available,
      };
    },
    [PANEL, MENU, SCROLLER, GUTTER] as const,
  );
}

/** Boots the toggle page and drives the refusal so the banner renders. */
async function openToggleBanner(page: Page) {
  await page.goto(`${baseUrl}toggle.html`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () => (window as unknown as { __hydrated?: boolean }).__hydrated === true,
  );
  // Wait for a rendered toggle BEFORE driving it: a boot throw is an entry
  // defect, not a RED.
  await expect(page.locator('[data-testid="published-toggle-inline"]')).toBeVisible();
  await page
    .locator(
      '[data-testid="published-toggle-inline"] button, [data-testid="published-toggle-inline"] input',
    )
    .first()
    .click();
  await expect(page.locator(TOGGLE_BANNER)).toBeVisible();
}

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
        expect(
          Math.abs(m.height - m.available),
          `height ${m.height} vs available ${m.available}`,
        ).toBeLessThanOrEqual(0.5);
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
    expect(
      m.menuBottom,
      `menu.bottom ${m.menuBottom} > panel.bottom ${m.panelBottom}`,
    ).toBeLessThanOrEqual(m.panelBottom + 0.5);
  });

  test("every interactive row is reachable, and the monitoring tail is readable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 560 });
    await openMenu(page, 10, 10, 10);

    // The 10/10/10 fixture renders the ten monitoring rows LAST, so at MAX
    // scroll the last INTERACTIVE row sits above the visible window — scroll it
    // into view first, then assert it is genuinely hittable.
    const interactive = await page.evaluate(
      ([scrollerSel]) => {
        const scroller = document.querySelector(scrollerSel as string)!;
        const rows = scroller.querySelectorAll<HTMLElement>(
          'button[data-testid^="attention-menu-row-"]',
        );
        const last = rows[rows.length - 1]!;
        last.scrollIntoView({ block: "nearest" });
        const r = last.getBoundingClientRect();
        const sc = scroller.getBoundingClientRect();
        const visibleTop = Math.max(r.top, sc.top);
        const visibleBottom = Math.min(r.bottom, sc.bottom);
        const hit = document.elementFromPoint(
          (r.left + r.right) / 2,
          (visibleTop + visibleBottom) / 2,
        );
        return {
          count: rows.length,
          visibleHeight: visibleBottom - visibleTop,
          hitInsideRow: hit !== null && last.contains(hit),
        };
      },
      [SCROLLER] as const,
    );
    expect(interactive.count).toBe(20); // 10 actionable + 10 needs-look
    expect(
      interactive.visibleHeight,
      "last interactive row is not a full tap target",
    ).toBeGreaterThanOrEqual(44);
    expect(interactive.hitInsideRow, "last interactive row is not hittable at its centre").toBe(
      true,
    );

    const monitoring = await page.evaluate(
      ([scrollerSel]) => {
        const scroller = document.querySelector(scrollerSel as string)!;
        scroller.scrollTop = scroller.scrollHeight;
        const rows = scroller.querySelectorAll<HTMLElement>(
          '[data-testid^="attention-monitoring-row-"]',
        );
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
    // Reduced motion collapses the entrance to instant, so a settled assertion
    // cannot land mid-transition. The animated path is covered by its own case.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 560 });
    await openMenu(page, 0, 0, 10); // monitoring only (O2)
    await setItems(page, 10, 10, 10); // needs-you heading mounts (O1)
    await expect(page.locator('[data-testid="attention-needsyou-heading"]')).toBeVisible();

    await expect
      .poll(() => settledGeometry(page), {
        message: "menu never settled contained + fitted after the O2 -> O1 flip",
      })
      .toMatchObject({ contained: true, fitted: true });

    const reachable = await page.evaluate(
      ([scrollerSel]) => {
        const scroller = document.querySelector(scrollerSel as string)!;
        const rows = scroller.querySelectorAll<HTMLElement>(
          'button[data-testid^="attention-menu-row-"]',
        );
        const lastRow = rows[rows.length - 1]!;
        lastRow.scrollIntoView({ block: "nearest" });
        const r = lastRow.getBoundingClientRect();
        const sc = scroller.getBoundingClientRect();
        const visibleTop = Math.max(r.top, sc.top);
        const visibleBottom = Math.min(r.bottom, sc.bottom);
        const hit = document.elementFromPoint(
          (r.left + r.right) / 2,
          (visibleTop + visibleBottom) / 2,
        );
        return hit !== null && lastRow.contains(hit);
      },
      [SCROLLER] as const,
    );
    expect(reachable, "last interactive row unreachable after the flip").toBe(true);
  });

  test("compound: the O2 -> O1 flip lands MID-ENTRANCE and still settles fitted", async ({
    page,
  }) => {
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
    expect(
      await page.evaluate(() =>
        (window as unknown as { __heldFrameCount: () => number }).__heldFrameCount(),
      ),
    ).toBeGreaterThan(0);
    await page.evaluate(() =>
      (window as unknown as { __releaseFrames: () => void }).__releaseFrames(),
    );

    await expect
      .poll(() => settledGeometry(page), {
        message: "menu never settled contained + fitted after a mid-entrance flip",
      })
      .toMatchObject({ contained: true, fitted: true });
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
    expect(
      scrollerAt,
      `Tab from the pill never reached the scroller (saw ${seen.join(" -> ")})`,
    ).toBeGreaterThanOrEqual(0);
    if (firstRowAt >= 0) {
      expect(
        scrollerAt,
        `a row took focus before the scrollable region (${seen.join(" -> ")})`,
      ).toBeLessThan(firstRowAt);
    }

    const before = await page.evaluate(
      ([sel]) => document.querySelector(sel as string)!.scrollTop,
      [SCROLLER] as const,
    );
    await page.keyboard.press("ArrowDown");
    // Chromium animates keyboard scrolling, so the value immediately after the
    // keypress is still the pre-animation one — poll for the settled position.
    await expect
      .poll(
        () =>
          page.evaluate(([sel]) => document.querySelector(sel as string)!.scrollTop, [
            SCROLLER,
          ] as const),
        { message: `scrollTop never advanced from ${before}` },
      )
      .toBeGreaterThan(before);
  });
});

// ---------------------------------------------------------------------------
// T4 — PublishedToggle error banner: containment, overflow, keyboard, a11y
// ---------------------------------------------------------------------------

test.describe("§9 obligation 3 — PublishedToggle refusal banner fits its clip panel", () => {
  test("the scroll region is named by the error copy it wraps, and the alert is bare", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 560 });
    await openToggleBanner(page);

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    const copy = ((await alert.textContent()) ?? "").trim();
    expect(copy.length, "the alert must carry the catalog copy").toBeGreaterThan(0);

    // The region takes its name FROM that copy, so an operator can never hear a
    // generic label in place of the reason the publish was refused.
    const region = page.getByTestId("published-toggle-popover");
    await expect(region).toHaveAttribute("role", "group");
    const name = await region.evaluate((el) => {
      const id = el.getAttribute("aria-labelledby") ?? "";
      return (el.ownerDocument.getElementById(id)?.textContent ?? "").trim();
    });
    expect(name).toBe(copy);
    expect(name).not.toBe("Publish error details");
  });

  test("containment: banner.bottom never crosses the clip edge", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 560 });
    await openToggleBanner(page);
    const m = await page.evaluate(
      ([clipSel, bannerSel]) => {
        const clip = document.querySelector(clipSel as string)!.getBoundingClientRect();
        const banner = document.querySelector(bannerSel as string)!.getBoundingClientRect();
        return { clipBottom: clip.bottom, bannerBottom: banner.bottom };
      },
      [TOGGLE_CLIP, TOGGLE_BANNER] as const,
    );
    expect(
      m.bannerBottom,
      `banner.bottom ${m.bannerBottom} > clip.bottom ${m.clipBottom}`,
    ).toBeLessThanOrEqual(m.clipBottom + 0.5);
  });

  test("the banner height matches the room actually available", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 560 });
    await openToggleBanner(page);

    // Containment and overflow alone do NOT pin the fit: cross-model review
    // showed a private ref writing `max-height: 1px` satisfies both while being
    // useless. Compare the measured height against the room the clip leaves.
    const m = await page.evaluate(
      ([clipSel, bannerSel, gutter]) => {
        const clip = document.querySelector(clipSel as string)!.getBoundingClientRect();
        const banner = document.querySelector(bannerSel as string)!.getBoundingClientRect();
        return {
          height: banner.height,
          available: Math.floor(clip.bottom - banner.top - (gutter as number)),
        };
      },
      [TOGGLE_CLIP, TOGGLE_BANNER, GUTTER] as const,
    );
    expect(
      Math.abs(m.height - m.available),
      `banner height ${m.height} does not match the available room ${m.available}`,
    ).toBeLessThanOrEqual(0.5);
  });

  test("the banner is never PAINTED crossing the clip edge, from the very first frame", async ({
    page,
  }) => {
    // The containment case above measures AFTER settle. This one measures from
    // the FIRST painted frame, which is the property the synchronous mount
    // measure provides and the only one deferring it to a frame breaks.
    //
    // It lives on the BANNER, not the AttentionMenu. The first draft sampled the
    // menu and did NOT discriminate: planting the deferred-measure mutant killed
    // 18 unit cases and two e2e cases and left that draft green, because the
    // menu's natural height at this viewport fits inside the panel anyway, so an
    // uncapped frame crosses nothing. A fixture that cannot express the
    // difference reports no difference. The banner genuinely overflows, and the
    // premise below asserts that rather than assuming it.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 560 });

    // ARMED BEFORE THE APPEARANCE, via an init script: `openToggleBanner`
    // navigates, so a sampler installed after it returns misses the frames under
    // test. Records a row on EVERY frame INCLUDING absent ones — those are what
    // prove the recorder preceded the appearance.
    await page.addInitScript(
      ([clipSel, bannerSel]) => {
        const w = window as unknown as {
          __clipFrames?: {
            present: boolean;
            overlayBottom?: number;
            clipBottom?: number;
            scrollH?: number;
            clientH?: number;
          }[];
        };
        w.__clipFrames = [];
        const tick = () => {
          const clip = document.querySelector(clipSel as string);
          const banner = document.querySelector(bannerSel as string);
          if (clip === null || banner === null) {
            w.__clipFrames!.push({ present: false });
          } else {
            w.__clipFrames!.push({
              present: true,
              overlayBottom: banner.getBoundingClientRect().bottom,
              clipBottom: clip.getBoundingClientRect().bottom,
              scrollH: banner.scrollHeight,
              clientH: banner.clientHeight,
            });
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      [TOGGLE_CLIP, TOGGLE_BANNER] as const,
    );

    await openToggleBanner(page);

    // An empty sample is AMBIGUOUS on its own: `?? []` reads identically whether
    // the init script never ran and `__clipFrames` is absent, or it ran and no
    // frame elapsed. Running the whole standalone config surfaced exactly that
    // (`no frame was sampled at all`, firstPresent -1) where the spec passes
    // alone, and the message could not say which. So wait for the first row
    // explicitly, and report installed-ness separately from the rows.
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __clipFrames?: unknown[] };
        return Array.isArray(w.__clipFrames) && w.__clipFrames.length > 0;
      },
      undefined,
      { timeout: 15_000 },
    );

    const sampler = await page.evaluate(() => {
      const w = window as unknown as {
        __clipFrames?: {
          present: boolean;
          overlayBottom?: number;
          clipBottom?: number;
          scrollH?: number;
          clientH?: number;
        }[];
      };
      return { installed: Array.isArray(w.__clipFrames), frames: w.__clipFrames ?? [] };
    });
    expect(
      sampler.installed,
      "the init script never ran: window.__clipFrames is absent, so no sampling happened at all",
    ).toBe(true);
    const frames = sampler.frames;

    const firstPresent = frames.findIndex((f) => f.present);
    // (1) ARMING: an absent row must precede the first present one, or sampling
    // may have begun after the overlay already corrected itself.
    expect(firstPresent, "no frame was sampled at all").toBeGreaterThanOrEqual(0);
    expect(
      firstPresent,
      "the sampler was not armed before the banner appeared: no absent frame precedes it",
    ).toBeGreaterThan(0);

    const present = frames.filter((f) => f.present);
    // (2) NON-VACUITY.
    expect(present.length, "no frame with the banner present was sampled").toBeGreaterThan(0);

    // (3) PREMISE: the banner must actually overflow, or an uncapped frame would
    // cross nothing and this case could not discriminate a deferred measure.
    const last = present[present.length - 1];
    expect(
      (last?.scrollH ?? 0) > (last?.clientH ?? 0),
      "premise not met: the banner does not overflow, so containment is vacuous here",
    ).toBe(true);

    // (4) CONTAINMENT on every frame, the first included.
    const crossed = present.filter((f) => (f.overlayBottom ?? 0) > (f.clipBottom ?? 0) + 0.5);
    expect(
      crossed.map((f) => `${f.overlayBottom} > ${f.clipBottom}`),
      "the banner crossed the clip edge on at least one painted frame",
    ).toEqual([]);
  });

  test("the capped banner scrolls rather than stranding its tail", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 560 });
    await openToggleBanner(page);
    const m = await page.evaluate(
      ([bannerSel]) => {
        const el = document.querySelector(bannerSel as string)! as HTMLElement;
        return {
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          overflowY: getComputedStyle(el).overflowY,
        };
      },
      [TOGGLE_BANNER] as const,
    );
    expect(m.overflowY, "banner is not a scroll container").toMatch(/auto|scroll/);
    expect(m.scrollHeight, "fixture geometry must overflow the capped banner").toBeGreaterThan(
      m.clientHeight,
    );
  });

  test("keyboard: the banner is tabbable and ArrowDown scrolls it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 560 });
    await openToggleBanner(page);

    let onBanner = false;
    for (let i = 0; i < 20 && !onBanner; i++) {
      await page.keyboard.press("Tab");
      onBanner = await page.evaluate(
        ([sel]) => document.activeElement === document.querySelector(sel as string),
        [TOGGLE_BANNER] as const,
      );
    }
    expect(onBanner, "Tab never reached the banner").toBe(true);

    const before = await page.evaluate(
      ([sel]) => document.querySelector(sel as string)!.scrollTop,
      [TOGGLE_BANNER] as const,
    );
    await page.keyboard.press("ArrowDown");
    // Chromium animates keyboard scrolling — poll for the settled position.
    await expect
      .poll(
        () =>
          page.evaluate(([sel]) => document.querySelector(sel as string)!.scrollTop, [
            TOGGLE_BANNER,
          ] as const),
        { message: `scrollTop never advanced from ${before}` },
      )
      .toBeGreaterThan(before);
  });
});

// ---------------------------------------------------------------------------
// T7 — idle mutual exclusion, keyboard-inclusive (spec §3.4)
// ---------------------------------------------------------------------------

test.describe("§3.4 — opening one overlay dismisses the other, by keyboard too", () => {
  test("hub open, then Enter on the pill: menu opens and the hub closes", async ({ page }) => {
    // 390x1200, NOT the 844 the geometry cases use. This block asserts MUTUAL
    // EXCLUSION, which is layout-independent — but in the standalone harness the
    // hub strip lands near the panel's bottom edge (measured: trigger at
    // y 765-809 inside an 844 viewport, ~35px of headroom), and CI's Linux text
    // metrics render the modal a little taller than macOS does. That pushed the
    // trigger out of the viewport on the runner, where Playwright reported
    // "element is outside of the viewport" through a 120s click timeout while
    // every geometry case passed. Headroom removes the marginality without
    // weakening what this case proves.
    await page.setViewportSize({ width: 390, height: 1200 });
    await openMenu(page, 10, 10, 10);
    // Neutralise the auto-open so this walk starts from a closed menu.
    await page.locator(PILL).click();
    await expect(page.locator(MENU)).toHaveCount(0);

    await page.locator(HUB_PRIMARY).click();
    await expect(page.locator(HUB_POPOVER)).toBeVisible();

    await page.locator(PILL).focus();
    await page.keyboard.press("Enter");

    await expect(page.locator(MENU)).toBeVisible();
    await expect(page.locator(HUB_POPOVER), "the hub survived the menu opening").toHaveCount(0);
  });

  test("menu open, then Enter on a hub trigger: hub opens and the menu closes", async ({
    page,
  }) => {
    // Same headroom rationale as the case above.
    await page.setViewportSize({ width: 390, height: 1200 });
    await openMenu(page, 10, 10, 10);

    await page.locator(HUB_KEBAB).focus();
    await page.keyboard.press("Enter");

    await expect(page.locator(HUB_POPOVER)).toBeVisible();
    await expect(page.locator(MENU), "the menu survived the hub opening").toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Anchor-room census — closes the reachability gap in the MIN_FITTED_HEIGHT
// docblock (lib/layout/fitWithinClip.ts).
//
// That docblock used to generalize ONE measurement, taken at the Re-sync band
// (209.75px at 375x667), to a hook now serving three anchors. The two anchors
// this cluster added had never been measured at all, so "the floor is
// unreachable" was a claim about one anchor doing duty for three.
//
// These cases measure the OTHER two on the real surface, at the tightest
// viewport the app supports. The floor winning is not a cosmetic outcome: when
// it does, the overlay overhangs its clip edge — the exact defect the hook
// exists to prevent — so the margin is worth pinning rather than asserting once
// in prose.
// ---------------------------------------------------------------------------

test.describe("anchor-room census — what the MIN_FITTED_HEIGHT docblock may claim", () => {
  test("the AttentionMenu scroller clears the floor at every supported height", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 375, height: 844 });
    await openMenu(page, 10, 10, 10);

    // Swept rather than sampled once, because the question the docblock got
    // wrong was not "what is the room here" but "can the floor ever bind".
    // Measured room at 375xH, from the same quantities computeFittedMaxHeight
    // sees: 844->563, 667->412, 560->322, 400->186, 300->101. Linear in
    // viewport height, and still 2x the floor at a height no phone has.
    const measured: Array<{ height: number; available: number }> = [];
    for (const height of [844, 667, 560, 400]) {
      await page.setViewportSize({ width: 375, height });
      // The cap re-applies on a coalesced frame after the resize.
      await page.waitForTimeout(80);
      const geo = await fittedGeometry(page);
      expect(geo, `the menu anchor did not render at 375x${height}`).not.toBeNull();
      measured.push({ height, available: geo!.available });
    }

    for (const { height, available } of measured) {
      expect(
        available,
        `room ${available}px at 375x${height} is at or under the ${FLOOR}px floor`,
      ).toBeGreaterThan(FLOOR);
    }
    // Not merely clear — clear by a margin ordinary variation cannot cross.
    const tightest = Math.min(...measured.map((m) => m.available));
    expect(tightest, `tightest measured room was ${tightest}px`).toBeGreaterThan(FLOOR * 2);
  });

  test("the banner's clip ancestor really is the review-modal panel", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 375, height: 667 });
    await openMenu(page, 10, 10, 10);

    // ROOM at this anchor is deliberately NOT asserted. The banner mounts only
    // on a refusal, which the real modal harness cannot drive, and its anchor
    // (the strip) renders BELOW the clip window in this fixture at 375x667 --
    // measured: strip 713.03..911.03 against a panel bottom of 667. A room
    // figure taken there would describe a clipped-away anchor, not one an
    // operator sees, so it would be a number without a meaning. Recorded in
    // BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED rather than faked here.
    //
    // What IS checkable is the STRUCTURAL premise the fit depends on: that
    // walking up from this anchor lands on the modal panel, the same node the
    // hook's own findClippingAncestor would resolve. If the strip ever stops
    // living inside the clipping panel, the hook silently stops capping this
    // overlay and nothing else would notice.
    const verdict = await page.evaluate(
      ([stripSel, panelSel]) => {
        const strip = document.querySelector(stripSel as string);
        const panel = document.querySelector(panelSel as string);
        if (!strip || !panel) return null;
        for (let el = (strip as HTMLElement).parentElement; el !== null; el = el.parentElement) {
          const { overflowX, overflowY } = getComputedStyle(el);
          if (overflowX !== "visible" || overflowY !== "visible") return { isPanel: el === panel };
        }
        return { isPanel: false };
      },
      [STRIP, PANEL] as const,
    );

    expect(verdict, "the strip or clip panel did not render").not.toBeNull();
    expect(
      verdict!.isPanel,
      "the first clipping ancestor above the banner anchor is not the modal panel",
    ).toBe(true);
  });
});
