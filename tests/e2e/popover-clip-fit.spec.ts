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
// GAP and VIEWPORT_INSET are IMPORTED, never mirrored: the branch cases below
// compute the same spaceAbove/spaceBelow the module computes, and a mirrored
// copy is a second definition that can drift from the one under test.
import { GAP, VIEWPORT_INSET } from "@/lib/popover/position";

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

/** A header title long enough that it MUST wrap past two lines at 375px, so the
 *  clamp case has something to clamp. Same string the shared harness ships as
 *  its `saturatedTitle` fixture (`_publishedReviewModalHarness.tsx`); duplicated
 *  as a literal rather than imported because that module is a browser entry the
 *  Playwright transform rewrites. Diff round 4 (P1): the clamp case previously
 *  measured the default title, which fits in two lines unclamped. */
const SATURATED_TITLE =
  "II - Northeast Regional Partner Kickoff and Extended Production Rehearsal Marathon Week Whole-Campus Load-In";
const TOGGLE_CLIP = '[data-testid="toggle-clip-panel"]';
/** The scroller inside the menu panel — the node this cluster gives a role. */
const SCROLLER = 'div[role="group"][aria-label="Attention items"]';

/** The fit gutter, mirroring DEFAULT_CLIP_GUTTER (lib/layout/fitWithinClip.ts). */
const GUTTER = 8;
/** The scroller's declared CSS cap (`max-h-96`). */
const CSS_CAP = 384;
/** Mirrors MIN_FITTED_HEIGHT (lib/layout/fitWithinClip.ts) — the collapse floor. */
const FLOOR = 48;
/** The strip is the banner's placement ANCHOR — the rect the module measures
 *  against, handed down by StatusStrip. It is no longer a positioned ancestor:
 *  the banner is portaled into the panel, so the strip is not in its containing
 *  chain at all.
 *
 *  MERGE NOTE: origin/main renamed `BANNER_OFFSET` to `_BANNER_OFFSET` to
 *  silence its unused warning; this branch DELETED it instead. Deletion wins,
 *  and not merely because it is this branch's change — the constant described
 *  the banner's `mt-1` offset, and `mt-1` is gone: the placement module writes
 *  the gap now. An underscore-prefixed constant describing a class the
 *  component no longer carries is a fact with no referent. Verified unused on
 *  both sides before dropping it. */
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

/**
 * Close the attention menu by pressing its PILL, before interacting with
 * anything the open panel covers.
 *
 * WHY THIS EXISTS (BL-ATTENTION-PANEL-LEFT-OVERFLOW-NARROW). The menu is
 * right-anchored inside the review-modal clip. It used to overflow that clip's
 * LEFT edge by 36px at 375, and the 36px it lost off-screen is the only reason
 * its right edge stopped at 307 — exactly where the published toggle begins. Now
 * that the panel is CONTAINED it spans 8..367 and covers the toggle, which is
 * ordinary dismissible-overlay behaviour and not a defect: containment and
 * sitting beside the toggle are not simultaneously satisfiable at that width,
 * since even the old 343px width clamps to 8..351.
 *
 * The cases below are about the refusal banner and the docked anchor's room.
 * Clicking THROUGH an open menu was never their subject — it was incidental
 * clearance they got for free from a bug. The pill, not Escape: Escape is
 * claimed by the menu only once the user has engaged with it, so it is the
 * conditional path, while the pill always toggles.
 */
async function dismissMenu(page: Page) {
  if ((await page.locator(MENU).count()) === 0) return;
  await page.locator(PILL).click();
  await expect(page.locator(MENU)).toHaveCount(0);
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
      // The menu panel's own bottom border sits BETWEEN the scroller and the
      // clip edge, so the room the scroller can occupy is one border short of
      // the raw gap. Before the placement migration the fitted cap was written
      // straight onto the scroller and the border was outside the arithmetic;
      // now the cap lands on the bordered panel and the scroller fills its
      // CONTENT box. Derived from the live computed style, never assumed to be
      // 1px, and it is a completion of the arithmetic rather than a loosened
      // tolerance — the 0.5px bound below is unchanged.
      const menuBorderBottom = parseFloat(getComputedStyle(menu).borderBottomWidth) || 0;
      const available = Math.floor(p.bottom - sc.top - (gutter as number) - menuBorderBottom);
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
        ([panelSel, menuSel, scrollerSel, gutter, cap]) => {
          const panel = document.querySelector(panelSel as string)!;
          const menu = document.querySelector(menuSel as string)!;
          const scroller = document.querySelector(scrollerSel as string)!;
          const p = panel.getBoundingClientRect();
          const s = scroller.getBoundingClientRect();
          // See fittedGeometry: the menu panel's bottom border is between the
          // scroller and the clip edge now that the fitted cap lands on the
          // panel. Same completion, same 0.5px bound.
          const menuBorderBottom = parseFloat(getComputedStyle(menu).borderBottomWidth) || 0;
          const available = Math.floor(p.bottom - s.top - (gutter as number) - menuBorderBottom);
          return {
            height: s.height,
            available,
            capped: available >= (cap as number),
            scrollHeight: scroller.scrollHeight,
            clientHeight: scroller.clientHeight,
          };
        },
        [PANEL, MENU, SCROLLER, GUTTER, CSS_CAP] as const,
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
      ([panelSel, menuSel, scrollerSel, gutter]) => {
        const menu = document.querySelector(menuSel as string)!;
        const p = document.querySelector(panelSel as string)!.getBoundingClientRect();
        const s = document.querySelector(scrollerSel as string)!.getBoundingClientRect();
        // Third site of the same arithmetic, kept in step with fittedGeometry and
        // the per-height loop: the menu panel's bottom border sits between the
        // scroller and the clip edge now that the fitted cap lands on the panel.
        const menuBorderBottom = parseFloat(getComputedStyle(menu).borderBottomWidth) || 0;
        return {
          height: s.height,
          available: Math.floor(p.bottom - s.top - (gutter as number) - menuBorderBottom),
        };
      },
      [PANEL, MENU, SCROLLER, GUTTER] as const,
    );
    expect(Math.abs(m.height - m.available)).toBeLessThanOrEqual(0.5);
  });

  // Containment on BOTH horizontal edges and the bottom, at every viewport in the
  // declared probe domain (spec 2026-08-28-attention-menu-clip-placement §10).
  //
  // This case used to read `panelBottom` and `menuBottom` and nothing else,
  // under the name "the menu never crosses the panel's clip edge". The name
  // promised containment; the body asserted one dimension of it, and a 36px LEFT
  // overhang lived on this shipped surface underneath it
  // (BL-ATTENTION-PANEL-LEFT-OVERFLOW-NARROW). The horizontal edges are the
  // repair.
  for (const [vw, vh] of [
    [390, 560],
    [375, 667],
    [375, 844],
    [1280, 800],
  ] as const) {
    test(`containment at ${vw}x${vh}: the menu never crosses the panel's clip edge`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vw, height: vh });
      await openMenu(page, 10, 10, 10);
      // Settle on `scale`, NOT on `transform`. Tailwind v4 compiles `scale-*` to
      // the individual `scale` property, so `transform` reads "none" for the
      // whole entrance and a wait on it measures a 0.95x box.
      await page.waitForFunction(
        (sel) => {
          const el = document.querySelector(sel);
          if (el === null) return false;
          const settled = getComputedStyle(el).scale;
          return settled === "1" || settled === "none";
        },
        MENU,
        { timeout: 5_000 },
      );
      const m = await page.evaluate(
        ([panelSel, menuSel, pillSel]) => {
          const p = document.querySelector(panelSel as string)!.getBoundingClientRect();
          const menu = document.querySelector(menuSel as string)!.getBoundingClientRect();
          const pill = document.querySelector(pillSel as string)!.getBoundingClientRect();
          return {
            panel: { left: p.left, right: p.right, bottom: p.bottom },
            menu: { left: menu.left, right: menu.right, bottom: menu.bottom, width: menu.width },
            pill: { right: pill.right },
          };
        },
        [PANEL, MENU, PILL] as const,
      );
      const TOL = 0.5;
      // First: a menu that failed to open reports a zero rect, which satisfies
      // every containment comparison below without rendering anything.
      expect(m.menu.width).toBeGreaterThan(0);
      expect(
        m.menu.left,
        `menu.left ${m.menu.left} < panel.left ${m.panel.left}`,
      ).toBeGreaterThanOrEqual(m.panel.left - TOL);
      expect(
        m.menu.right,
        `menu.right ${m.menu.right} > panel.right ${m.panel.right}`,
      ).toBeLessThanOrEqual(m.panel.right + TOL);
      expect(
        m.menu.bottom,
        `menu.bottom ${m.menu.bottom} > panel.bottom ${m.panel.bottom}`,
      ).toBeLessThanOrEqual(m.panel.bottom + TOL);
      // The width is the DECLARED 400px natural, capped by the clip's inset
      // bounds and by nothing else. Derived from the measured clip and the core's
      // own VIEWPORT_INSET, never a pixel constant. The declined alternative
      // narrows the panel to buy flushness and fails here.
      expect(m.menu.width).toBeCloseTo(Math.min(400, (m.panel.right - m.panel.left) - 2 * VIEWPORT_INSET), 0);
      // Where the clip does not bind, the panel stays flush with its trigger, so
      // the clamp is proved to fire only when it must.
      if (m.pill.right - m.menu.width >= m.panel.left) {
        expect(m.menu.right).toBeCloseTo(m.pill.right, 0);
      }

      // AC-5 pins the MEASURED desktop geometry rather than a self-consistent
      // relation: `menu.right === pill.right` above is satisfied by ANY anchor
      // position, so a layout shift moving the wrapper keeps it green while the
      // panel is no longer where it was before this arc.
      //
      // The WIDTH is pinned here; the LEFT is not, and the asymmetry is
      // deliberate. The wizard surface's pre-fix desktop left was measured (684)
      // and is pinned in its own suite. THIS surface's pre-fix left was never
      // measured, so a literal here would be a number invented to look rigorous.
      // Its left is held by the flush-to-pill relation above, which at 1280 IS
      // the pre-fix behaviour because no clamp fires. DOCUMENTED LIMIT: a desktop
      // layout shift moving this surface's pill and panel together satisfies
      // both, and closing it needs a pre-fix measurement that no longer exists
      // to take.
      if (vw === 1280) {
        expect(m.menu.width).toBeCloseTo(400, 0);
      }

      // NO ANCHOR-REFLOW CASE here, and the absence is deliberate and probed.
      // Placement is computed against the panel's offset parent, so observing
      // that anchor is right in principle. A case for it was written and REMOVED
      // because its premise could not be satisfied on this surface: changing the
      // attention load from (2,2,2) to (30,30,30) does not move the wrapper's
      // RIGHT edge — the only edge `align: "right"` placement reads — because the
      // wrapper is right-pinned inside the modal header. The anchor subscription
      // therefore ships as DEFENSIVE, with no reachable failing case on either
      // review modal today. Recorded so the next author reads the missing case as
      // a probed absence rather than an oversight, and does not delete the
      // subscription as unused.
    });
  }

  // -------------------------------------------------------------------------
  // BL-ATTENTION-PANEL-LEFT-OVERFLOW-NARROW: the placement migration's own pins.
  // -------------------------------------------------------------------------

  test("the panel is a DESCENDANT of the clip host, and keyboard order reaches it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openMenu(page, 10, 10, 10);
    // Descendancy is what the shell's focus trap, aria-modal subtree and inert
    // handling all rest on, so it is the property worth pinning — not that the
    // context is merely non-null.
    //
    // This panel is a descendant because it renders IN PLACE, not because it is
    // portaled. Portaling it into the host was tried during this migration and
    // reverted: it preserves the trap but appends the panel late in the modal,
    // which breaks sequential focus ORDER — Tab from the pill reached the modal's
    // close button instead of the menu. The trap and the order within it are
    // different properties, and the suite pins both.
    const contained = await page.evaluate(
      ([panelSel, menuSel]) => {
        const host = document.querySelector(panelSel as string);
        const menu = document.querySelector(menuSel as string);
        if (host === null || menu === null) return null;
        return { inside: host.contains(menu), sameNode: host === menu };
      },
      [PANEL, MENU] as const,
    );
    expect(contained).not.toBeNull();
    expect(contained!.sameNode).toBe(false);
    expect(contained!.inside).toBe(true);
  });

  test("dimensional invariants: the scroller shrinks inside the panel's fitted cap", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 560 });
    // A LOAD large enough that the cap BINDS. These assertions discriminate only
    // when the content is taller than the fitted height — with a short list the
    // scroller is smaller than the cap and every comparison below passes
    // vacuously. The premise is asserted on this case's own inputs, below.
    await openMenu(page, 30, 30, 30);
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        if (el === null) return false;
        const settled = getComputedStyle(el).scale;
        return settled === "1" || settled === "none";
      },
      MENU,
      { timeout: 5_000 },
    );
    const d = await page.evaluate(
      ([menuSel, scrollerSel]) => {
        const panel = document.querySelector(menuSel as string)!;
        const scroller = document.querySelector(scrollerSel as string)!;
        const pr = panel.getBoundingClientRect();
        const sr = scroller.getBoundingClientRect();
        return {
          panelRect: pr.height,
          panelClient: (panel as HTMLElement).clientHeight,
          scrollerRect: sr.height,
          scrollerBottom: sr.bottom,
          panelBottom: pr.bottom,
          scrollHeight: scroller.scrollHeight,
          childSum: [...panel.children].reduce(
            (n, c) => n + c.getBoundingClientRect().height,
            0,
          ),
        };
      },
      [MENU, SCROLLER] as const,
    );
    const TOL = 0.5;
    // PREMISE: the cap binds. Without this the case is vacuous, and a vacuous
    // pass is indistinguishable from a real one.
    expect(
      d.scrollHeight,
      "premise: the content must overflow the fitted cap, or these assertions are vacuous",
    ).toBeGreaterThan(d.scrollerRect + 1);
    // The children fill the panel's CONTENT box. Compared against clientHeight,
    // never the border-box rect: the panel carries `border` and no padding, so a
    // border-box comparison is off by exactly the 2px of border and can never
    // pass.
    expect(d.childSum).toBeCloseTo(d.panelClient, 0);
    // The one that catches a dropped `min-h-0`: without it the scroller keeps its
    // content height and paints straight through the capped panel.
    expect(d.scrollerBottom).toBeLessThanOrEqual(d.panelBottom + TOL);
  });

  for (const motion of ["reduce", "no-preference"] as const) {
    test(`placement is RE-COMPUTED once the entrance settles (${motion})`, async ({ page }) => {
      // BOTH settings are set explicitly. Neither case relies on the harness
      // default, which is itself contested: this harness was probed reporting
      // `reduce`, while the pinned playwright-core resolves an unset value to
      // `no-preference`. Depending on the default at all is the defect.
      await page.emulateMedia({ reducedMotion: motion });
      // 1280x800 is the ONLY viewport where this discriminates. At 375 a frozen
      // and a re-measured placement both clamp x to the clip's left edge and are
      // indistinguishable; here the clamp does not fire, so x tracks
      // `trigger.right - width` and moves by the full 5% the entrance scale
      // distorts. Asserting the settled WIDTH would prove nothing either: the
      // rect reaches its natural width when the scale reaches 1 whether or not
      // any code re-ran.
      await page.setViewportSize({ width: 1280, height: 800 });
      await openMenu(page, 10, 10, 10);
      await page.waitForFunction(
        (sel) => {
          const el = document.querySelector(sel);
          if (el === null) return false;
          const settled = getComputedStyle(el).scale;
          return settled === "1" || settled === "none";
        },
        MENU,
        { timeout: 5_000 },
      );
      const g = await page.evaluate(
        ([menuSel, pillSel]) => {
          const menu = document.querySelector(menuSel as string)!.getBoundingClientRect();
          const pill = document.querySelector(pillSel as string)!.getBoundingClientRect();
          return { left: menu.left, width: menu.width, pillRight: pill.right };
        },
        [MENU, PILL] as const,
      );
      // A placement frozen at the scale-95 measurement sits 5% of the panel's
      // width to the RIGHT of the settled answer. Derived, not hardcoded.
      expect(g.left).toBeCloseTo(g.pillRight - g.width, 0);
      expect(g.width).toBeCloseTo(400, 0);
    });
  }

  test("every menu row clears the 44px floor at 375x667", async ({ page }) => {
    // The wizard suite has carried this since its own arc; the published surface
    // had no twin, so a narrowed or shifted panel could reflow rows under the
    // floor here and nothing would say so.
    await page.setViewportSize({ width: 375, height: 667 });
    await openMenu(page, 3, 3, 3);
    const heights = await page.evaluate(
      (menuSel) =>
        [...document.querySelectorAll(`${menuSel} button`)].map(
          (r) => r.getBoundingClientRect().height,
        ),
      MENU,
    );
    // A zero-row menu would otherwise satisfy `every` by vacuity.
    expect(heights.length).toBeGreaterThan(0);
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
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

  test("the banner height matches the room on the side the module CHOSE", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 560 });
    await openToggleBanner(page);

    // Containment and overflow alone do NOT pin the fit: cross-model review
    // showed a private ref writing `max-height: 1px` satisfies both while being
    // useless. That escape is still what this case exists to close, but the
    // quantity it compares against CHANGED WITH THE MIGRATION and the old one
    // is now wrong rather than merely stale.
    //
    // Under `useFitWithinClip` the banner always sat below its anchor, so "the
    // room available" was unambiguously the distance down to the clip edge. The
    // placement module picks a SIDE, and at this fixture's geometry it picks
    // `top` — so measuring down to the clip bottom now reports the room on the
    // side the banner is not on (204px against a 97px box) and the old
    // assertion failed for a banner that was placed correctly.
    //
    // The pin is therefore against the space on the CHOSEN side, computed the
    // way the module computes it. A `max-height: 1px` ref still cannot pass:
    // the height has to equal a value derived from the live geometry.
    const m = await page.evaluate(
      ([clipSel, stripSel, bannerSel, gap, inset]) => {
        const panel = document.querySelector(clipSel as string)!.getBoundingClientRect();
        const trigger = document.querySelector(stripSel as string)!.getBoundingClientRect();
        const el = document.querySelector(bannerSel as string) as HTMLElement;
        const banner = el.getBoundingClientRect();
        const side = el.dataset["popoverSide"] ?? null;
        const spaceAbove = Math.max(
          0,
          trigger.top - (panel.top + (inset as number)) - (gap as number),
        );
        const spaceBelow = Math.max(
          0,
          panel.bottom - (inset as number) - trigger.bottom - (gap as number),
        );
        return {
          height: banner.height,
          side,
          chosen: side === "top" ? spaceAbove : spaceBelow,
          scrollHeight: el.scrollHeight,
        };
      },
      [TOGGLE_CLIP, STRIP, TOGGLE_BANNER, GAP, VIEWPORT_INSET] as const,
    );

    expect(m.side, "PREMISE: the module must have placed the banner").not.toBeNull();
    // PREMISE: this fixture must actually be in the CAPPED regime, or the
    // equality below is asserting nothing about capping at all.
    expect(
      m.scrollHeight,
      "PREMISE: the fixture must overflow, or nothing is capped",
    ).toBeGreaterThan(m.chosen);
    expect(
      Math.abs(m.height - m.chosen),
      `banner height ${m.height} does not match the ${m.side} room ${m.chosen}`,
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
    // Waits for a PRESENT row, not merely a row. Diff review round 1 finding 2
    // probed the earlier `length > 0` predicate and showed it is already true
    // during hydration, when every row is `present: false`:
    //   {"waitCondition":true,"firstPresent":-1,"presentCount":0}
    // So that version widened the race instead of closing it, and a green run
    // showed the race had not occurred once, not that it could not occur. This
    // predicate cannot be satisfied by absent rows, so `firstPresent >= 0`
    // below is guaranteed rather than hoped for. Arming is still asserted
    // separately: an absent row must PRECEDE the first present one.
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __clipFrames?: { present: boolean }[] };
        return Array.isArray(w.__clipFrames) && w.__clipFrames.some((f) => f.present);
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
// T2 — the banner is PLACED by the module, on the side the geometry selects
// (spec 2026-08-25-review-modal-strip-dock §3.6, AC-8/AC-9/AC-11/AC-20)
// ---------------------------------------------------------------------------

/**
 * Drives the replica at an explicit panel/spacer geometry and returns the
 * placement INPUTS alongside the OUTCOME, measured in one pass so the two can
 * never describe different frames.
 *
 * The inputs are recomputed here from the live rects rather than trusted from
 * the URL, because that is what lets every case below assert its own PREMISE.
 * A branch fixture whose geometry silently lands on a neighbouring branch would
 * otherwise pass its outcome assertion for the wrong reason -- which is the
 * exact failure the first draft of this arc's T1 fixtures had, where a sweep
 * meant to reach a 48px floor never produced a cap under 366.
 */
async function placeReplica(page: Page, geo: { panel: number; spacer: number }) {
  await page.goto(`${baseUrl}toggle.html?panel=${geo.panel}&spacer=${geo.spacer}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () => (window as unknown as { __hydrated?: boolean }).__hydrated === true,
  );
  await expect(page.locator('[data-testid="published-toggle-inline"]')).toBeVisible();
  await page
    .locator(
      '[data-testid="published-toggle-inline"] button, [data-testid="published-toggle-inline"] input',
    )
    .first()
    .click();
  await expect(page.locator(TOGGLE_BANNER)).toBeVisible();

  return page.evaluate(
    ([panelSel, stripSel, bannerSel, gap, inset]) => {
      const panel = document.querySelector(panelSel as string)!.getBoundingClientRect();
      const trigger = document.querySelector(stripSel as string)!.getBoundingClientRect();
      const el = document.querySelector(bannerSel as string) as HTMLElement;
      const banner = el.getBoundingClientRect();
      const boundsTop = panel.top + (inset as number);
      const boundsBottom = panel.bottom - (inset as number);
      return {
        spaceAbove: Math.max(0, trigger.top - boundsTop - (gap as number)),
        spaceBelow: Math.max(0, boundsBottom - trigger.bottom - (gap as number)),
        boundsTop,
        boundsBottom,
        triggerTop: trigger.top,
        triggerBottom: trigger.bottom,
        bannerTop: banner.top,
        bannerBottom: banner.bottom,
        bannerHeight: banner.height,
        bannerLeft: banner.left,
        bannerRight: banner.right,
        boundsLeft: panel.left + (inset as number),
        boundsRight: panel.right - (inset as number),
        side: el.dataset["popoverSide"] ?? null,
        inlineMaxHeight: el.style.maxHeight,
        visibility: getComputedStyle(el).visibility,
        portaledIntoPanel:
          el.parentElement !== null &&
          document.querySelector(panelSel as string)!.contains(el) &&
          !document.querySelector(stripSel as string)!.contains(el),
      };
    },
    [TOGGLE_CLIP, STRIP, TOGGLE_BANNER, GAP, VIEWPORT_INSET] as const,
  );
}

/**
 * The banner's natural height, measured with room to spare on the preferred
 * side so nothing caps it. Every geometry below is DERIVED from this number
 * rather than chosen, so a copy change moves the fixtures instead of silently
 * retargeting which branch each case exercises.
 */
async function naturalBannerHeight(page: Page) {
  const m = await placeReplica(page, { panel: 1400, spacer: 20 });
  expect(m.side, "the probe geometry must place BELOW, uncapped").toBe("bottom");
  expect(m.inlineMaxHeight, "the probe geometry must not cap").toBe("");
  return { h: m.bannerHeight, stripH: m.triggerBottom - m.triggerTop };
}

test.describe("§3.6 — the module selects the side, and the component writes it", () => {
  test("bottom fits: side=bottom, uncapped, GAP below the trigger", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1400 });
    const { h, stripH } = await naturalBannerHeight(page);
    // spaceBelow = panel - spacer - stripH - (INSET + GAP); spaceAbove = spacer - (INSET + GAP).
    const spacer = 20;
    const m = await placeReplica(page, {
      panel: Math.ceil(spacer + stripH + 14 + h + 40),
      spacer,
    });

    expect(m.spaceBelow, "PREMISE: below must fit the natural height").toBeGreaterThanOrEqual(h);
    expect(m.spaceAbove, "PREMISE: above must NOT fit, or the side is not forced").toBeLessThan(h);

    expect(m.side).toBe("bottom");
    expect(m.inlineMaxHeight, "a fitting side must not be capped").toBe("");
    expect(Math.abs(m.bannerTop - (m.triggerBottom + GAP))).toBeLessThanOrEqual(0.5);
    expect(m.portaledIntoPanel, "the banner portals into the host, not the strip").toBe(true);
    // AC-19 full width. Round 2 (TEST_2): every case here recorded VERTICAL
    // geometry only, so a 100px-wide banner positioned correctly inside the
    // panel passed all of them. Spanning the bounds is the contract; sitting
    // inside them is not.
    expect(
      Math.abs(m.bannerLeft - m.boundsLeft),
      `banner left ${m.bannerLeft} spans to bounds ${m.boundsLeft}`,
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(m.bannerRight - m.boundsRight),
      `banner right ${m.bannerRight} spans to bounds ${m.boundsRight}`,
    ).toBeLessThanOrEqual(1);
  });

  test("bottom does not fit but above does: the side FLIPS, still uncapped", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1400 });
    const { h, stripH } = await naturalBannerHeight(page);
    const spacer = Math.ceil(h + 44);
    const m = await placeReplica(page, { panel: Math.ceil(spacer + stripH + 24), spacer });

    expect(m.spaceBelow, "PREMISE: below must NOT fit").toBeLessThan(h);
    expect(m.spaceAbove, "PREMISE: above must fit").toBeGreaterThanOrEqual(h);

    expect(m.side).toBe("top");
    expect(m.inlineMaxHeight, "a fitting side must not be capped").toBe("");
    // Placed GAP ABOVE the trigger, which is the whole content of "flipped".
    expect(Math.abs(m.bannerBottom - (m.triggerTop - GAP))).toBeLessThanOrEqual(0.5);
  });

  test("neither side fits: caps to the LARGER side, above the floor", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1400 });
    const { h, stripH } = await naturalBannerHeight(page);
    const spaceAbove = Math.floor(h - 10);
    const spaceBelow = Math.floor(h - 30);
    const spacer = spaceAbove + 14;
    const m = await placeReplica(page, {
      panel: Math.ceil(spacer + stripH + 14 + spaceBelow),
      spacer,
    });

    expect(m.spaceAbove, "PREMISE: above must not fit").toBeLessThan(h);
    expect(m.spaceBelow, "PREMISE: below must not fit").toBeLessThan(h);
    expect(m.spaceAbove, "PREMISE: above must be the LARGER side").toBeGreaterThan(m.spaceBelow);
    expect(m.spaceAbove, "PREMISE: the cap must land ABOVE the floor").toBeGreaterThanOrEqual(
      FLOOR,
    );

    expect(m.side).toBe("top");
    expect(m.inlineMaxHeight, "a non-fitting side must be capped").not.toBe("");
    expect(Number.parseFloat(m.inlineMaxHeight)).toBeCloseTo(m.spaceAbove, 0);
    // Capped, not hidden, and still inside the panel.
    expect(m.visibility).not.toBe("hidden");
    expect(m.bannerTop).toBeGreaterThanOrEqual(m.boundsTop - 0.5);
    expect(m.bannerBottom).toBeLessThanOrEqual(m.boundsBottom + 0.5);
  });

  test("neither side fits and the larger is UNDER the floor: still placed, still visible", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 1400 });
    const { h, stripH } = await naturalBannerHeight(page);
    const spaceAbove = 30;
    const spaceBelow = 20;
    const spacer = spaceAbove + 14;
    const m = await placeReplica(page, {
      panel: spacer + Math.ceil(stripH) + 14 + spaceBelow,
      spacer,
    });

    expect(m.spaceAbove, "PREMISE: above must not fit").toBeLessThan(h);
    expect(m.spaceBelow, "PREMISE: below must not fit").toBeLessThan(h);
    expect(m.spaceAbove, "PREMISE: the larger side must be UNDER the floor").toBeLessThan(FLOOR);
    expect(m.spaceAbove, "PREMISE: and it must still be the larger side").toBeGreaterThan(
      m.spaceBelow,
    );

    // AC-11: a sub-floor cap is a DIAGNOSTIC condition, not a hiding one. The
    // module places, the component writes, and the dev warning fires (pinned in
    // tests/lib/popover/placeWarning.test.ts) -- it is never made invisible,
    // which would take the refusal out of the a11y tree exactly when an
    // operator most needs to read it.
    expect(m.side).toBe("top");
    expect(m.visibility).not.toBe("hidden");
    expect(Number.parseFloat(m.inlineMaxHeight)).toBeCloseTo(m.spaceAbove, 0);
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

    // The STRUCTURAL premise, kept verbatim in substance: walking up from this
    // anchor lands on the modal panel. If the strip ever stops living inside
    // the clipping panel, the overlay silently stops being bounded by it and
    // nothing else would notice. The measurement below does not replace this —
    // §7 is explicit that the arc adds the number without trading the premise
    // away for it.
    //
    // What this comment USED to say, and why it no longer does: "ROOM at this
    // anchor is deliberately NOT asserted... the banner mounts only on a
    // refusal, which the real modal harness cannot drive, and its anchor
    // renders BELOW the clip window at 375x667 — strip 713.03..911.03 against a
    // panel bottom of 667." Both obstacles are gone. T3 made the refusal
    // drivable; T4 and the dock put the anchor back inside the window. The
    // room figure is measured in the case that follows.
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

// ---------------------------------------------------------------------------
// T4 — the header bound (spec §3.0, AC-14..AC-18)
// ---------------------------------------------------------------------------

/** Boots the modal at a given load WITHOUT opening the attention menu. Load 0
 *  has no actionable items and no menu to open, so `openMenu` cannot express
 *  it, and the sweep needs all three loads measured the same way. */
async function bootModal(page: Page, a: number, n: number, s: number) {
  await page.goto(baseUrl);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () => (window as unknown as { __hydrated?: boolean }).__hydrated === true,
  );
  await setItems(page, a, n, s);
}

/** The header's rendered attention state, as text. Diff round 4 (P1): the
 *  12-cell sweep asserted the header did not GROW with load without ever
 *  proving which load rendered, so a production mutant that always renders a
 *  small composite satisfied every cell. This is the executable premise. */
async function renderedAttentionSignature(page: Page): Promise<string | null> {
  return page.evaluate(
    ([panelSel]) => {
      const pill = document
        .querySelector(panelSel as string)
        ?.querySelector<HTMLElement>('[data-testid$="-alert-pill"]');
      return pill === null || pill === undefined ? null : (pill.textContent ?? "").trim();
    },
    [PANEL] as const,
  );
}

/** Header, strip, switch and panel rects in one pass. */
async function headerGeometry(page: Page) {
  return page.evaluate(
    ([panelSel, stripSel]) => {
      const panel = document.querySelector(panelSel as string) as HTMLElement | null;
      const header = panel?.querySelector("header") ?? null;
      const strip = document.querySelector(stripSel as string);
      const sw = document.querySelector('[data-testid="published-toggle"]');
      const r = (el: Element | null) => (el === null ? null : el.getBoundingClientRect());
      const p = r(panel);
      const h = r(header);
      const st = r(strip);
      const w = r(sw);
      const foot = panel?.querySelector("footer") ?? null;
      const f = r(foot);
      // The BODY is the TALLEST panel child that is not header, footer or grab.
      // Found by height rather than by position or name: the panel also carries
      // a 1px sr-only announce node, and the first draft of this picked THAT,
      // reporting a body height of 1 and failing the column equation for a
      // reason that had nothing to do with the column.
      const bodyEl =
        Array.from(panel?.children ?? [])
          .filter(
            (c) =>
              c !== header && c !== foot && !/-grab$/.test(c.getAttribute("data-testid") ?? ""),
          )
          .sort((a, z) => z.getBoundingClientRect().height - a.getBoundingClientRect().height)[0] ??
        null;
      const b = r(bodyEl);
      return {
        panel:
          p === null
            ? null
            : { top: p.top, bottom: p.bottom, clientHeight: (panel as HTMLElement).clientHeight },
        headerHeight: h === null ? null : h.height,
        footerHeight: f === null ? null : f.height,
        bodyHeight: b === null ? null : b.height,
        strip: st === null ? null : { top: st.top, bottom: st.bottom },
        switchRect: w === null ? null : { top: w.top, bottom: w.bottom },
      };
    },
    [PANEL, STRIP] as const,
  );
}

const LOADS = [
  { label: "0", a: 0, n: 0, s: 0 },
  { label: "2", a: 1, n: 1, s: 0 },
  { label: "30", a: 10, n: 10, s: 10 },
] as const;

const HEADER_VIEWPORTS = [
  { w: 375, h: 667 },
  { w: 375, h: 844 },
  { w: 390, h: 560 },
  { w: 390, h: 844 },
] as const;

test.describe("§3.0 — the header is bounded, so the dock can hold", () => {
  for (const vp of HEADER_VIEWPORTS) {
    test(`the header does not grow with attention load at ${vp.w}x${vp.h}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });

      // The baseline is PER VIEWPORT because header height is width-dependent;
      // a single cross-viewport constant would be wrong at three of the four
      // cells and would hide exactly the regression this case exists to catch.
      await bootModal(page, 0, 0, 0);
      const base = await headerGeometry(page);
      expect(base.headerHeight, "PREMISE: the header must render at load 0").not.toBeNull();

      const signatures: (string | null)[] = [];
      for (const load of LOADS) {
        await bootModal(page, load.a, load.n, load.s);
        const m = await headerGeometry(page);
        expect(m.headerHeight, `header missing at load ${load.label}`).not.toBeNull();

        // PREMISE (diff round 4, P1): prove WHICH load rendered. Without this
        // the whole sweep is satisfied by a header that never varies because
        // the attention state never varies, which is the opposite of the thing
        // under test.
        const signature = await renderedAttentionSignature(page);
        signatures.push(signature);
        if (load.label === "30") {
          const numbers = (signature ?? "").match(/\d+/g)?.map(Number) ?? [];
          expect(
            Math.max(0, ...numbers),
            `PREMISE: load 30 must render a saturated attention state; pill reads ${JSON.stringify(signature)}`,
          ).toBeGreaterThanOrEqual(10);
        }
        expect(
          Math.abs(m.headerHeight! - base.headerHeight!),
          `header grew at load ${load.label}: ${m.headerHeight} vs the ${vp.w}px baseline ${base.headerHeight}`,
        ).toBeLessThanOrEqual(0.5);

        // The consequence the bound exists FOR: the strip and the switch stay
        // inside the panel. Asserting only the header height would pass against
        // a header that stopped growing for some unrelated reason while the
        // strip still fell out the bottom.
        expect(m.strip, `strip missing at load ${load.label}`).not.toBeNull();
        expect(m.switchRect, `switch missing at load ${load.label}`).not.toBeNull();
        expect(
          m.strip!.bottom,
          `strip bottom ${m.strip!.bottom} falls below the panel at load ${load.label}`,
        ).toBeLessThanOrEqual(m.panel!.bottom + 0.5);
        expect(
          m.switchRect!.bottom,
          `switch bottom ${m.switchRect!.bottom} falls below the panel at load ${load.label}`,
        ).toBeLessThanOrEqual(m.panel!.bottom + 0.5);

        // TOP edges too, and the column itself. Round 2 (TEST_3): checking only
        // the two BOTTOM edges left the top edges, the column equation and a
        // nonzero body unchecked in every one of the twelve cells, so a
        // load-specific body collapse to zero passed the whole sweep. The
        // separate equation case runs at only two viewports, so it cannot cover
        // this matrix.
        expect(
          m.strip!.top,
          `strip top ${m.strip!.top} rides above the panel at load ${load.label}`,
        ).toBeGreaterThanOrEqual(m.panel!.top - 0.5);
        expect(
          m.switchRect!.top,
          `switch top ${m.switchRect!.top} rides above the panel at load ${load.label}`,
        ).toBeGreaterThanOrEqual(m.panel!.top - 0.5);
        expect(
          m.bodyHeight,
          `body collapsed to ${m.bodyHeight} at load ${load.label} — the column is degenerate`,
        ).toBeGreaterThan(0);
        expect(m.footerHeight, `footer missing at load ${load.label}`).not.toBeNull();
        expect(m.footerHeight, `footer collapsed at load ${load.label}`).toBeGreaterThan(0);
        // The full column EQUATION is deliberately not re-asserted here. It is
        // owned by T-LAYOUT in published-review-modal.layout.spec.ts, which
        // measures grab/header/main/footer against `panel.clientHeight` with
        // the non-vacuity checks that make it meaningful. Restating it against
        // a heuristically-identified body would be a weaker copy of a stronger
        // assertion, and the round-2 finding this closes was specifically that
        // a body COLLAPSE passes the sweep — which the nonzero checks above
        // catch in all twelve cells, at viewports T-LAYOUT does not visit.
      }

      // The loads must be DISTINGUISHABLE from one another, or "the header did
      // not grow" is a statement about one state measured three times.
      expect(
        new Set(signatures.map((x) => x ?? "<none>")).size,
        `PREMISE: the three loads rendered indistinguishable states: ${JSON.stringify(signatures)}`,
      ).toBeGreaterThan(1);
    });
  }

  test("at load 30 the capped cluster contains its pill and clears the title block", async ({
    page,
  }) => {
    // THE CAP'S REASON FOR EXISTING, which round 2 (TEST_4) found absent from
    // this matrix: the AC-14..AC-18 block measured header height and switch
    // reachability, and never once looked at the pill the cap is FOR. All four
    // load-30 cells could pass without the composite pill ever being exercised.
    await page.setViewportSize({ width: 375, height: 667 });
    await bootModal(page, 10, 10, 10);

    const m = await page.evaluate(
      ([panelSel]) => {
        const panel = document.querySelector(panelSel as string)!;
        const header = panel.querySelector("header")!;
        const cluster = header.querySelector<HTMLElement>(".shrink-0.items-center");
        const pill = header.querySelector<HTMLElement>('[data-testid$="-alert-pill"]');
        const title = header.querySelector<HTMLElement>("h2");
        if (cluster === null || pill === null || title === null) return null;
        const r = (el: Element) => el.getBoundingClientRect();
        const c = r(cluster);
        const pl = r(pill);
        const t = r(title);
        return {
          pillText: (pill.textContent ?? "").trim(),
          cluster: { left: c.left, right: c.right, width: c.width },
          pill: { left: pl.left, right: pl.right },
          title: { right: t.right },
          // The dialog's accessible name must survive the two-line clamp: the
          // clamp hides overflow visually, it must not truncate the a11y tree.
          accessibleTitle: (title.textContent ?? "").trim(),
        };
      },
      [PANEL] as const,
    );
    expect(m, "PREMISE: header, cluster, pill and title must all render").not.toBeNull();

    // The composite pill is genuinely in its two-segment state at this load —
    // otherwise the containment below is measuring the easy case.
    expect(m!.pillText, `pill reads "${m!.pillText}", expected two segments`).toMatch(
      /\d+.*·.*\d+/,
    );
    // ...and the segments must carry the SATURATED numbers. Diff round 4 (P1):
    // the shape check above accepts "1 issue · 1 monitoring", so a mutant that
    // always renders a small composite passed while the containment below
    // measured the easy case this test was written to avoid.
    {
      const numbers = m!.pillText.match(/\d+/g)?.map(Number) ?? [];
      expect(
        Math.max(0, ...numbers),
        `PREMISE: this case needs the saturated pill; it reads ${JSON.stringify(m!.pillText)}`,
      ).toBeGreaterThanOrEqual(10);
    }

    // CONTAINMENT CHAIN: pill inside the cluster, cluster inside the cap.
    expect(m!.pill.left, "pill starts inside the cluster").toBeGreaterThanOrEqual(
      m!.cluster.left - 0.5,
    );
    expect(m!.pill.right, "pill ends inside the cluster").toBeLessThanOrEqual(
      m!.cluster.right + 0.5,
    );
    expect(m!.cluster.width, "the cluster honours its 160px cap below sm").toBeLessThanOrEqual(
      160.5,
    );

    // And the cap's PURPOSE: the cluster must not eat into the title block.
    expect(
      m!.title.right,
      `title block right ${m!.title.right} overlaps the cluster at ${m!.cluster.left}`,
    ).toBeLessThanOrEqual(m!.cluster.left + 0.5);

    // The clamp is visual only; the FULL title stays in the accessibility tree.
    // Round 3: asserting non-empty accepted any one-character string, so
    // truncation passed for the exact reason this assertion claims to exclude.
    // Compared against the harness fixture's own title now
    // (`MODAL_TITLE`, tests/e2e/_publishedReviewModalHarness.tsx:95). Inlined
    // rather than imported: that module is bundled out-of-process and its
    // header forbids importing it from a spec, since the Playwright transform
    // rewrites its JSX.
    expect(m!.accessibleTitle, "the clamped title is not truncated for AT").toBe(
      "Published Modal Layout Fixture",
    );
  });

  // BOTH static branches, not just the degraded one. Diff round 4 (P2): round
  // 3 repaired `shrink-0` on both static pills and this case only ever measured
  // one of them, so the other shipped with no geometric containment at all
  // while the comment above claimed both were covered.
  const STATIC_BRANCHES = [
    { label: "DEGRADED", degraded: true, match: /unavailable/i },
    { label: "In sync", degraded: false, match: /in sync/i },
  ] as const;

  for (const branch of STATIC_BRANCHES) {
    test(`the ${branch.label} static pill also stays inside the cap`, async ({ page }) => {
      // Round 3 (P1): round 2 gave both static pills `min-w-0` and left them
      // `shrink-0`, which cannot work — `min-w-0` lowers the automatic minimum
      // while `flex-shrink: 0` refuses to contract at all, so the cap was
      // unenforceable on exactly the branches nothing measured. The reviewer got
      // there by arithmetic (~104px of label, plus padding, the 8px gap and the
      // 44px close target, against a 160px cap); this is the measurement that
      // would have caught it, at the load and state that reach it.
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(baseUrl);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(
        () => (window as unknown as { __hydrated?: boolean }).__hydrated === true,
      );
      await page.evaluate((degraded) => {
        (
          window as unknown as {
            __setItems: (a: number, n: number, s: number, d: boolean) => void;
          }
        ).__setItems(0, 0, 0, degraded);
      }, branch.degraded);

      const m = await page.evaluate(
        ([panelSel]) => {
          const header = document.querySelector(panelSel as string)!.querySelector("header")!;
          const cluster = header.querySelector<HTMLElement>(".shrink-0.items-center");
          const pill = header.querySelector<HTMLElement>('[data-testid$="-alert-pill"]');
          const close = header.querySelector<HTMLElement>('[data-testid$="-close"]');
          if (cluster === null || pill === null || close === null) return null;
          const c = cluster.getBoundingClientRect();
          const pl = pill.getBoundingClientRect();
          const cl = close.getBoundingClientRect();
          return {
            text: (pill.textContent ?? "").trim(),
            clusterWidth: c.width,
            clusterLeft: c.left,
            clusterRight: c.right,
            pillLeft: pl.left,
            pillRight: pl.right,
            closeRight: cl.right,
            closeWidth: cl.width,
            headerRight: header.getBoundingClientRect().right,
          };
        },
        [PANEL] as const,
      );
      expect(m, `PREMISE: the ${branch.label} pill and close control must render`).not.toBeNull();
      // PREMISE: this is genuinely the static branch under test, not the
      // composite pill wearing a different label.
      expect(m!.text, `pill reads "${m!.text}", expected the ${branch.label} branch`).toMatch(
        branch.match,
      );

      expect(m!.clusterWidth, "the cluster honours its 160px cap below sm").toBeLessThanOrEqual(
        160.5,
      );
      // The close control is the thing an overflowing pill pushes out, so its
      // containment is the consequence worth asserting, not just the cluster's.
      // The PILL is what must stay inside the cluster — it is the growing element
      // and the one the cap exists to contain.
      expect(
        m!.pillRight,
        `pill right ${m!.pillRight} vs cluster right ${m!.clusterRight}`,
      ).toBeLessThanOrEqual(m!.clusterRight + 0.5);
      // BOTH edges. Diff round 4 (P2): asserting only the right edge leaves a
      // pill that escapes to the LEFT green, and a capped flex cluster is exactly
      // the place an over-wide child escapes leftward.
      expect(
        m!.pillLeft,
        `pill left ${m!.pillLeft} escapes the cluster at ${m!.clusterLeft}`,
      ).toBeGreaterThanOrEqual(m!.clusterLeft - 0.5);

      // The CLOSE control is measured against the HEADER, not the cluster, and
      // that is deliberate: `ModalCloseButton` carries `-mr-1`, a 4px optical
      // outdent, so its border box legitimately sits 4px past the cluster's
      // content edge. The first draft of this case asserted containment in the
      // cluster and failed by exactly that 4px — the assertion was wrong, not the
      // layout. What actually matters is that an overflowing pill cannot push the
      // close control out of the header or shrink its tap target.
      expect(
        m!.closeRight,
        `close right ${m!.closeRight} escapes the header at ${m!.headerRight}`,
      ).toBeLessThanOrEqual(m!.headerRight + 0.5);
      expect(m!.closeWidth, "the close control keeps its 44px tap width").toBeGreaterThanOrEqual(
        43.5,
      );
    });
  }

  test("the title clamps to two lines below sm — asserted on the EMITTED style", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await bootModal(page, 10, 10, 10);
    // `line-clamp-2` has NO other usage in this repo, so the class string
    // proves nothing about whether Tailwind emitted a rule for it. An
    // un-emitted utility is a silent no-op — the exact failure class this arc
    // exists to remove — so the computed value is what gets asserted.
    //
    // THE CASE CARRIES ITS OWN CONTEST, and did not before. Diff round 4 (P1)
    // found this measured the harness's DEFAULT title, which renders inside two
    // lines with the clamp fully disabled: `renderedLines <= 2` held for a
    // reason that had nothing to do with clamping, so a production override to
    // horizontal box orientation left every assertion green. The title is now
    // saturated past two lines, and the unclamped count is measured on a CLONE
    // with the clamp stripped. That clone is the negative control — if it does
    // not exceed two lines the fixture cannot discriminate, and the premise
    // fails loudly instead of the case passing quietly.
    const clamp = await page.evaluate(
      ([panelSel, longTitle]) => {
        const span = document
          .querySelector(panelSel as string)
          ?.querySelector("h2 span") as HTMLElement | null;
        if (span === null || span === undefined) return null;
        span.textContent = longTitle as string;
        const width = span.getBoundingClientRect().width;
        const cs = getComputedStyle(span);
        const lineHeight = parseFloat(cs.lineHeight || "1") || 1;
        const lines = (el: HTMLElement) =>
          Math.round(el.getBoundingClientRect().height / lineHeight);
        // NEGATIVE CONTROL: same text, same width, same typography, clamp off.
        // Appended to the span's own parent so it inherits the font stack it is
        // being compared against.
        const clone = span.cloneNode(true) as HTMLElement;
        clone.style.webkitLineClamp = "unset";
        clone.style.display = "block";
        clone.style.overflow = "visible";
        clone.style.position = "absolute";
        clone.style.visibility = "hidden";
        clone.style.width = `${width}px`;
        span.parentElement?.appendChild(clone);
        const unclampedLines = lines(clone);
        clone.remove();
        return {
          lineClamp: cs.webkitLineClamp,
          display: cs.display,
          overflow: cs.overflow,
          // Rendered line count from the box's own metrics. This is the thing a
          // clamp is FOR, and it is what a display or orientation override
          // silently breaks while the property still reads 2.
          renderedLines: lines(span),
          unclampedLines,
        };
      },
      [PANEL, SATURATED_TITLE] as const,
    );
    expect(clamp, "PREMISE: the h2 inner span must render").not.toBeNull();
    // THE PREMISE diff round 4 (P1) demanded. Without it every assertion below
    // is satisfiable by a title that simply fits.
    expect(
      clamp!.unclampedLines,
      `PREMISE: unclamped, the title renders ${clamp!.unclampedLines} lines — a fixture that fits in 2 cannot test a 2-line clamp`,
    ).toBeGreaterThan(2);
    expect(clamp!.lineClamp, "the clamp must be EMITTED, not merely classed").toBe("2");
    expect(clamp!.overflow, "an unclipped box shows every line regardless").toBe("hidden");
    // THE FUNCTIONAL ASSERTION. With the contest above it now discriminates:
    // any override that disables clamping — display, box orientation, an
    // un-emitted utility — renders this saturated title past two lines and
    // fails here. `-webkit-box-orient` was previously COLLECTED and never
    // asserted, which diff round 4 (P1) correctly called out; it is not
    // asserted now either, and this is why. Orientation is one of several
    // mechanisms that can disable the clamp, and the line count catches all of
    // them, including the ones nobody enumerated. Pinning one mechanism while
    // the behaviour is already pinned adds a way to fail on a legitimate
    // mechanism change without adding a way to catch a regression.
    expect(
      clamp!.renderedLines,
      `title renders ${clamp!.renderedLines} lines, cap is 2`,
    ).toBeLessThanOrEqual(2);

    // NOT asserted, and deliberately so: computed `display` reads `flow-root`
    // here, not the `-webkit-box` that Tailwind's line-clamp utility is
    // documented to emit, yet the clamp measurably WORKS (the contested line
    // count above holds). I could not explain that discrepancy from the class
    // list — no custom `@utility` overrides display, and nothing in the span's
    // classes should. Asserting a mechanism I cannot account for would pin a
    // belief rather than a behaviour. Recorded as an open question in the
    // closeout instead: if the clamp ever regresses, `display` is the first
    // thing to inspect.
  });
});

// ---------------------------------------------------------------------------
// T3 — the refusal is drivable through the REAL modal (spec §7 obstacle 1)
// ---------------------------------------------------------------------------

test.describe("the row's obligation — real-surface anchor room (spec §7)", () => {
  test("the banner is placed on the side the DOCKED anchor actually leaves room for", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openMenu(page, 10, 10, 10);

    // Load 30 ON PURPOSE, unlike T3's driver cases. This is the load at which
    // spec §0 measured the failure the row was filed for, so measuring anywhere
    // else would report room at an anchor nobody was worried about.
    await page.evaluate(() => {
      (window as unknown as { __setRefusal: (c: string | null) => void }).__setRefusal(
        "FINALIZE_OWNED_SHOW",
      );
    });
    await dismissMenu(page);
    await page.locator('[data-testid="published-toggle"]').click();
    await expect(page.locator(TOGGLE_BANNER)).toBeVisible();

    const m = await page.evaluate(
      ([panelSel, stripSel, bannerSel, gap, inset]) => {
        const panel = document.querySelector(panelSel as string)!.getBoundingClientRect();
        const trigger = document.querySelector(stripSel as string)!.getBoundingClientRect();
        const el = document.querySelector(bannerSel as string) as HTMLElement;
        const banner = el.getBoundingClientRect();
        const boundsTop = panel.top + (inset as number);
        const boundsBottom = panel.bottom - (inset as number);
        return {
          // The module's OWN quantities, so the test and the implementation
          // cannot disagree about what "room" means.
          spaceAbove: Math.max(0, trigger.top - boundsTop - (gap as number)),
          spaceBelow: Math.max(0, boundsBottom - trigger.bottom - (gap as number)),
          naturalHeight: el.scrollHeight,
          boundsTop,
          boundsBottom,
          triggerTop: trigger.top,
          bannerTop: banner.top,
          bannerBottom: banner.bottom,
          side: el.dataset["popoverSide"] ?? null,
          inlineMaxHeight: el.style.maxHeight,
        };
      },
      [PANEL, STRIP, TOGGLE_BANNER, GAP, VIEWPORT_INSET] as const,
    );

    // The two numbers this row was filed to obtain. Recorded in the docblock of
    // lib/layout/fitWithinClip.ts and in the archive entry.
    console.log(
      `[§7] 375x667 load-30 docked: spaceAbove=${m.spaceAbove} spaceBelow=${m.spaceBelow} ` +
        `natural=${m.naturalHeight} side=${m.side} cap=${m.inlineMaxHeight || "(none)"}`,
    );

    // WHY the chosen side is chosen, not merely which side it is. Asserting
    // `side === "top"` alone would pass against a component that hardcoded it.
    expect(
      m.spaceBelow,
      "PREMISE: below the docked strip there is less room than the banner needs",
    ).toBeLessThan(m.naturalHeight);
    expect(
      m.spaceAbove,
      "PREMISE: above it there is more, which is what makes TOP the correct answer",
    ).toBeGreaterThan(m.spaceBelow);

    // Diff round 4 (P1): "more room above than below" makes top the BETTER
    // side, not a FITTING one. Both sides can be short at a taller banner, and
    // the module still chooses top and caps — at which point this case is
    // silently measuring a both-sides-clipped surface it does not describe,
    // with every assertion green. The module's contract closes it exactly: an
    // UNCAPPED banner means top genuinely fit, and a capped one must be capped
    // to the room actually available above.
    if (m.inlineMaxHeight === "") {
      expect(
        m.spaceAbove,
        `nothing capped the banner, so top must fit its natural ${m.naturalHeight}px`,
      ).toBeGreaterThanOrEqual(m.naturalHeight);
    } else {
      expect(
        Number.parseFloat(m.inlineMaxHeight),
        `capped to ${m.inlineMaxHeight} but only ${m.spaceAbove}px is available above`,
      ).toBeLessThanOrEqual(m.spaceAbove + 0.5);
    }

    expect(m.side, "the module placed it above the strip").toBe("top");
    // Placed GAP above the trigger, which pins the geometry rather than just
    // the attribute — the attribute alone is satisfied by a component that
    // writes it and no coordinates.
    expect(Math.abs(m.bannerBottom - (m.triggerTop - GAP))).toBeLessThanOrEqual(0.5);
    // Inside the panel on both edges. Containment alone is satisfied by a
    // private ref writing `max-height: 1px`, which is why it is asserted
    // ALONGSIDE the two premises rather than instead of them.
    expect(m.bannerTop).toBeGreaterThanOrEqual(m.boundsTop - 0.5);
    expect(m.bannerBottom).toBeLessThanOrEqual(m.boundsBottom + 0.5);
  });
});

test.describe("the shared harness can drive a refusal", () => {
  test("a driven refusal renders the CATALOG copy, not the generic retry string", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    // LOAD 1, not 10/10/10, and the reason is this arc's own subject. At 30
    // attention items the header grows until the strip renders BELOW the clip
    // window (measured in spec §0: strip 713.03..911.03 against a panel bottom
    // of 667), so the switch cannot be clicked at all — the first draft of this
    // case timed out on exactly that, which is the row's original symptom
    // showing up in a test written to check something else. This case is about
    // the DRIVER; reachability is T5's measurement and is asserted there.
    await openMenu(page, 1, 1, 1);

    // The obstacle this removes: `modalElement` hardcoded `setPublished: NOOP_OK`,
    // so every click on the real modal's switch resolved `ok`, refreshed, and
    // mounted no banner at all. Half of why this arc's row had no measured
    // anchor room was simply that the banner could not be made to appear.
    await page.evaluate(() => {
      (window as unknown as { __setRefusal: (c: string | null) => void }).__setRefusal(
        "FINALIZE_OWNED_SHOW",
      );
    });
    await dismissMenu(page);
    await page.locator('[data-testid="published-toggle"]').click();
    const banner = page.locator(TOGGLE_BANNER);
    await expect(banner).toBeVisible();

    // A DISTINCTIVE substring of FINALIZE_OWNED_SHOW's catalog copy
    // (lib/messages/catalog.ts:2280), and each of the two obvious alternatives
    // is weaker in a way that matters. Asserting the text is non-empty passes
    // against a stub that renders anything. Asserting equality breaks on any
    // catalog edit, which would make a copy change read as a placement
    // regression — the exact confusion §12.4's three-way lockstep exists to
    // avoid. A phrase no other refusal code shares discriminates the code
    // WITHOUT pinning the sentence.
    await expect(banner).toContainText("busy with a setup-wizard publish");

    // And it is the catalog path, not the generic fallback: the retry string is
    // what renders for an UNKNOWN code, so its absence is what proves the code
    // was recognised rather than swallowed.
    await expect(banner).not.toContainText("That didn’t go through");
  });

  test("the default tree is unchanged: no refusal, no banner (AC-10)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openMenu(page, 1, 1, 1);
    // __setRefusal is NOT called. The override is spread in only when a code is
    // set, so this is the same tree attention-pill-focus.spec.ts and
    // sheetIconLinkContainment.test.ts see — asserted here rather than assumed,
    // because "byte-identical when omitted" is the whole contract that lets the
    // field exist without re-baselining the other two consumers.
    await dismissMenu(page);
    await page.locator('[data-testid="published-toggle"]').click();
    await expect(page.locator(TOGGLE_BANNER)).toHaveCount(0);
  });
});
