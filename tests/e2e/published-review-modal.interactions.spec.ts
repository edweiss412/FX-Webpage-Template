/**
 * tests/e2e/published-review-modal.interactions.spec.ts (admin-show-modal
 * Task 12 — spec §3, §5, §6.5, §8)
 *
 * LIVE real-browser interaction gate for the `/admin?show=<slug>` published
 * review modal, run against the REAL app (dev server on :3000 + Supabase +
 * ADMIN_FIXTURE auth) — unlike the step3 modal (a wizard-owned client state),
 * every open/close here is a URL transition through `useShowModalNav`, so the
 * URL contract can only be exercised end-to-end.
 *
 * Covered:
 *   - focus contract (§5 shell): initial focus lands on the close button; the
 *     Tab trap keeps focus inside [data-review-modal-panel] (wrap both ways).
 *   - close affordances (§3): Esc / scrim tap / X close the modal AND strip
 *     `show`+`alert_id` from the URL while preserving every other param
 *     (`bucket` asserted); browser Back closes (route change).
 *   - sheet drag (§10 via shell): a past-threshold (>110px) drag dismisses and
 *     strips the URL; a mid-slop (60px) drag springs back (stays open, inline
 *     styles cleared); a ≤6px-slop tap falls through to the grab's click and
 *     closes.
 *   - §6.5 transition inventory: closed→open entrance animation attrs present
 *     (sheet-rise <sm / pop-in ≥sm, scrim fade); reduced motion collapses the
 *     entrance to `animation: none`; open→closed is an instant unmount;
 *     compound — drag started, then the viewport crosses `sm` mid-pointer →
 *     the matchMedia cleanup releases the drag (no stranded inline styles).
 *
 * Spec-literal interaction constants (§10) are deliberately NOT imported from
 * ReviewModalShell.tsx — the SPEC is the source of truth, so a component that
 * drifts from these values fails here, correctly.
 *
 * Runs in the default playwright.config.ts (desktop-chromium project);
 * viewports are set per test so sheet (<sm) and popup (≥sm) modes are both
 * deterministic regardless of the project default.
 */
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { seedShowWithCrew, deleteSeededShow, type SeededShow } from "./helpers/seedShowWithCrew";
import { settleDashboardAdminState } from "./helpers/dashboardState";

const TOL = 0.5;

// Spec §10 literals (see header): threshold 110, slop 6.
const DRAG_DISMISS_PX = 140; // > DRAG_DISMISS_THRESHOLD_PX (110)
const DRAG_SPRINGBACK_PX = 60; // between DRAG_SLOP_PX (6) and the 110 threshold
const DRAG_TAP_PX = 4; // ≤ DRAG_SLOP_PX (6) — a tap, so the click falls through

const BASE = "published-show-review";
/** ANY review-modal frame — the Suspense SKELETON shares the shell testIdBase,
 *  and during the streaming swap both frames transiently coexist in the DOM.
 *  Use for ABSENCE assertions (neither skeleton nor loaded modal remains). */
const MODAL_ANY = `[data-testid="${BASE}-modal"]`;
/** The LOADED modal only (the skeleton renders no title node) — use for
 *  visibility waits and scoped queries so the transient skeleton twin can
 *  never trip Playwright strict mode. */
const MODAL = `${MODAL_ANY}:has([data-testid="${BASE}-title"])`;
const PANEL = "[data-review-modal-panel]";
const SCRIM = "[data-review-modal-scrim]";
const GRAB = `[data-testid="${BASE}-grab"]`;
const CLOSE = `[data-testid="${BASE}-close"]`;
const BACKDROP = `[data-testid="${BASE}-backdrop"]`;

const SHEET = { width: 390, height: 844 };
const POPUP = { width: 1280, height: 800 };

let show: SeededShow;
let restoreDashboardState: (() => Promise<void>) | null = null;

test.describe("published review modal — interactions (spec §3/§5/§6.5)", () => {
  test.beforeAll(async () => {
    // The modal mounts only on the SETTLED dashboard branch (wizard-mode
    // ignores `?show`, spec §3) — settle app_settings for the run.
    restoreDashboardState = await settleDashboardAdminState();
    show = await seedShowWithCrew({
      title: "Modal Interactions E2E Show",
      crew: [{ name: "Alice Cooper", role: "A1", email: "alice@fxav.test" }],
    });
  });

  test.afterAll(async () => {
    if (show) await deleteSeededShow(show.driveFileId);
    if (restoreDashboardState) await restoreDashboardState();
  });

  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  async function openModal(
    page: Page,
    viewport: { width: number; height: number },
    opts: { url?: string; reducedMotion?: "reduce" | "no-preference" } = {},
  ) {
    // Reduced motion by default: the entrance animation collapses to none so
    // geometry/interaction state is final as soon as the modal streams in.
    await page.emulateMedia({ reducedMotion: opts.reducedMotion ?? "reduce" });
    await page.setViewportSize(viewport);
    await page.goto(opts.url ?? `/admin?show=${show.slug}`);
    // Suspense-streamed server loader — allow a dev-server compile on first hit.
    await expect(page.locator(MODAL)).toBeVisible({ timeout: 30_000 });
    // The skeleton twin is gone once the swap commits — from here every
    // shell-testid locator (grab/close/backdrop) resolves uniquely.
    await expect(page.locator(MODAL_ANY)).toHaveCount(1);
    // Synthetic gestures must not race the swap's passive-effect flush: the
    // commit makes the loaded frame visible BEFORE its effects (initial focus,
    // the shell's document Esc listener, the grab's drag listeners) have run,
    // and a keypress/pointerdown in that gap is silently lost. Initial focus
    // landing on the close button proves the flush completed (the listener
    // effects are declared in the same component and flush together). Real
    // users can't beat this window; a synthetic gesture can.
    await expect
      .poll(
        () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.testid),
        { message: "loaded modal's effect flush completed (initial focus applied)" },
      )
      .toBe(`${BASE}-close`);
  }

  function urlParts(page: Page) {
    const u = new URL(page.url());
    return { pathname: u.pathname, params: u.searchParams, hash: u.hash };
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

  // ── Focus contract (§5 shell) ──────────────────────────────────────────────

  test("initial focus lands on the close button; Tab trap keeps focus in the panel (wrap both ways)", async ({
    page,
  }) => {
    await openModal(page, POPUP);

    // Initial focus → the consumer's close button (useDialogFocus contract).
    await expect
      .poll(
        () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.testid),
        { message: "initial focus lands on the close button" },
      )
      .toBe(`${BASE}-close`);

    const describeActive = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        return {
          testid: el.getAttribute("data-testid"),
          inPanel: el.closest("[data-review-modal-panel]") !== null,
          visible: el.getClientRects().length > 0,
        };
      });

    // Shift+Tab from the FIRST focusable wraps to the panel's LAST focusable —
    // still inside the panel, and not the close button itself.
    await page.keyboard.press("Shift+Tab");
    const wrappedBack = await describeActive();
    expect(wrappedBack, "Shift+Tab keeps an element focused").not.toBeNull();
    expect(wrappedBack!.inPanel, "Shift+Tab wraps INSIDE the panel").toBe(true);
    expect(wrappedBack!.visible, "wrap target is visible").toBe(true);
    expect(wrappedBack!.testid, "wrap target is not the close button").not.toBe(`${BASE}-close`);

    // Tab from the last focusable wraps forward to the close button again.
    await page.keyboard.press("Tab");
    const wrappedForward = await describeActive();
    expect(wrappedForward?.testid, "Tab from the last focusable wraps to the close button").toBe(
      `${BASE}-close`,
    );

    // A forward sweep never escapes the panel (trap holds across the surface's
    // real focusable population — links, buttons, toggles).
    for (let press = 1; press <= 25; press++) {
      await page.keyboard.press("Tab");
      const cur = await describeActive();
      expect(cur, `press ${press}: an element is focused`).not.toBeNull();
      expect(cur!.inPanel, `press ${press}: focus stays inside the panel`).toBe(true);
      expect(cur!.visible, `press ${press}: focused element is visible`).toBe(true);
    }
  });

  test("focus continuity: Esc-close restores focus to the still-mounted dashboard trigger (real inert)", async ({
    page,
  }) => {
    // Task 14 audit P2 (memory #437 class): the shell's inert effect must own
    // the outer save/restore and be declared BEFORE useDialogFocus — React runs
    // effect cleanups in DECLARATION order, so a later-declared inert cleanup
    // leaves the dashboard inert while useDialogFocus restores, and `.focus()`
    // on an inert-subtree element no-ops → focus drops to <body>. jsdom does
    // NOT enforce inert focus-blocking, so this MUST run in a real browser.
    // Unlike step3 (trigger unmounts with the wizard card), the dashboard row
    // trigger persists across the URL-driven close — the restore must land.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(POPUP);
    await page.goto("/admin");
    const trigger = page.locator(`[data-testid="shows-table-row-${show.slug}"]`);
    await expect(trigger).toBeVisible({ timeout: 30_000 });
    // Let hydration + first-paint effects settle: a post-focus hydration
    // re-render would swap the DOM node and silently drop focus to <body>,
    // making Enter a no-op on the wrong element.
    await page.waitForLoadState("networkidle");

    await trigger.focus();
    await expect
      .poll(
        () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.testid),
        { message: "trigger row link holds focus before open" },
      )
      .toBe(`shows-table-row-${show.slug}`);

    // Open via the trigger itself (Enter on the focused Link → client nav).
    await page.keyboard.press("Enter");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("show"), {
        message: "Enter on the trigger navigates to ?show=<slug>",
        timeout: 10_000,
      })
      .toBe(show.slug);
    await expect(page.locator(MODAL)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(MODAL_ANY)).toHaveCount(1);

    // Close via Esc (URL-driven unmount) — focus must return to the trigger,
    // which requires the background to be UN-inerted before the restore fires.
    await page.keyboard.press("Escape");
    await expect(page.locator(MODAL_ANY)).toHaveCount(0, { timeout: 15_000 });
    await expect
      .poll(
        () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.testid),
        { message: "focus restored to the dashboard trigger after close" },
      )
      .toBe(`shows-table-row-${show.slug}`);
  });

  // ── Close affordances → URL contract (§3) ──────────────────────────────────

  test("Esc closes and strips show+alert_id while preserving bucket", async ({ page }) => {
    await openModal(page, POPUP, {
      url: `/admin?bucket=archived&show=${show.slug}&alert_id=${randomUUID()}`,
    });

    await page.keyboard.press("Escape");
    // §6.5 + perceived-latency tier 1: open→closed is an INSTANT client-side
    // unmount (local closing state) — it does NOT wait for the close
    // navigation. The URL catches up when the router.push RSC roundtrip
    // commits, so the unmount bound is tight and the URL assertions POLL with
    // a nav-sized budget (first archived-bucket compile here).
    await expect(page.locator(MODAL_ANY)).toHaveCount(0, { timeout: 2_000 });

    await expect
      .poll(() => new URL(page.url()).searchParams.has("show"), {
        message: "close strips the show param",
        timeout: 15_000,
      })
      .toBe(false);
    const { pathname, params } = urlParts(page);
    expect(pathname).toBe("/admin");
    expect(params.get("bucket"), "bucket param preserved across close").toBe("archived");
    expect(params.has("alert_id"), "alert_id stripped with show").toBe(false);
  });

  test("scrim tap closes and strips the show param", async ({ page }) => {
    await openModal(page, POPUP);
    // The centered ≥sm panel leaves the viewport corner to the scrim.
    await page.locator(BACKDROP).click({ position: { x: 10, y: 10 } });
    // Instant client-side unmount; the URL catches up on the close nav commit
    // (see the Esc test note).
    await expect(page.locator(MODAL_ANY)).toHaveCount(0, { timeout: 2_000 });
    await expect
      .poll(() => new URL(page.url()).searchParams.has("show"), {
        message: "close strips the show param",
        timeout: 15_000,
      })
      .toBe(false);
    expect(urlParts(page).pathname).toBe("/admin");
  });

  test("X button closes and strips the show param", async ({ page }) => {
    await openModal(page, POPUP);
    await page.locator(CLOSE).click();
    // Instant client-side unmount; the URL catches up on the close nav commit
    // (see the Esc test note).
    await expect(page.locator(MODAL_ANY)).toHaveCount(0, { timeout: 2_000 });
    await expect
      .poll(() => new URL(page.url()).searchParams.has("show"), {
        message: "close strips the show param",
        timeout: 15_000,
      })
      .toBe(false);
    expect(urlParts(page).pathname).toBe("/admin");
  });

  test("row-click open leaves NO stranded optimistic skeleton after the close commit (critique P0)", async ({
    page,
  }) => {
    // The optimistic client skeleton is keyed off ShowsTable's pendingSlug; a
    // stale pendingSlug would re-satisfy `committedShow !== pendingSlug` the
    // moment close strips ?show and remount a permanent "loading" overlay
    // OVER the dashboard. Deterministic pin: assert emptiness AFTER the close
    // navigation commits (the racy window is exactly when the bug fires).
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(POPUP);
    await page.goto("/admin");
    const trigger = page.locator(`[data-testid="shows-table-row-${show.slug}"]`);
    await expect(trigger).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");

    await trigger.click();
    await expect(page.locator(MODAL)).toBeVisible({ timeout: 30_000 });
    // Client copy handed off — exactly one frame once the loaded modal is up.
    await expect(page.locator(MODAL_ANY)).toHaveCount(1);

    await page.locator(CLOSE).click();
    await expect(page.locator(MODAL_ANY)).toHaveCount(0, { timeout: 2_000 });
    // Audit P2 (WCAG 2.4.3): the optimistic path stacks a THIRD transient
    // shell mount (client skeleton → server skeleton → loaded modal), each
    // owning an inert save/restore pair — after close, focus must still land
    // back on the row trigger, not <body> (real-browser-only; jsdom doesn't
    // enforce inert).
    await expect
      .poll(
        () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.testid),
        { message: "focus restored to the dashboard row after the optimistic-path close" },
      )
      .toBe(`shows-table-row-${show.slug}`);
    await expect
      .poll(() => new URL(page.url()).searchParams.has("show"), {
        message: "close strips the show param",
        timeout: 15_000,
      })
      .toBe(false);
    // Post-commit: still zero frames — no skeleton resurrection.
    await expect(page.locator(MODAL_ANY)).toHaveCount(0);
  });

  test("browser Back closes the modal (route change unmount)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(POPUP);
    await page.goto("/admin");
    await expect(page.locator(MODAL_ANY)).toHaveCount(0);

    await page.goto(`/admin?show=${show.slug}`);
    await expect(page.locator(MODAL)).toBeVisible({ timeout: 30_000 });

    await page.goBack();
    await expect(page.locator(MODAL_ANY)).toHaveCount(0, { timeout: 10_000 });
    const { pathname, params } = urlParts(page);
    expect(pathname).toBe("/admin");
    expect(params.has("show")).toBe(false);
  });

  // ── Sheet drag (§10 via shell; §6.5 drag-dismiss transition) ───────────────

  test("140px grab drag past the threshold dismisses the sheet and strips the URL", async ({
    page,
  }) => {
    await openModal(page, SHEET);
    const { x, y } = await grabCenter(page);

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + DRAG_DISMISS_PX, { steps: 8 });
    // Sanity mid-drag: the inline transform tracks the pointer — otherwise the
    // dismissal below could pass via the tap path instead of the drag path.
    expect((await panelInlineStyles(page)).transform).toBe(`translateY(${DRAG_DISMISS_PX}px)`);
    await page.mouse.up();

    // Under reduced motion the 0ms transition fires no transitionend — the
    // 220ms fallback timer is the close path; give it margin.
    await expect(page.locator(MODAL_ANY), "past-threshold release closes the modal").toHaveCount(
      0,
      {
        timeout: 5000,
      },
    );
    await expect
      .poll(() => new URL(page.url()).searchParams.has("show"), {
        message: "drag-dismiss strips the show param",
      })
      .toBe(false);
  });

  test("60px grab drag springs back — modal stays open, inline styles cleared, URL keeps show", async ({
    page,
  }) => {
    await openModal(page, SHEET);
    const { x, y } = await grabCenter(page);

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + DRAG_SPRINGBACK_PX, { steps: 6 });
    expect((await panelInlineStyles(page)).transform).toBe(`translateY(${DRAG_SPRINGBACK_PX}px)`);
    await page.mouse.up();

    // The settle (120ms fallback under reduced motion) returns the panel to
    // stylesheet control: ALL inline drag props cleared.
    await expect
      .poll(async () => (await panelInlineStyles(page)).transform, {
        message: "spring-back settle clears the inline transform",
      })
      .toBe("");
    const styles = await panelInlineStyles(page);
    expect(styles.transition, "inline transition cleared after settle").toBe("");
    expect(styles.animation, "inline animation cleared after settle").toBe("");

    // The synthesized click after pointerup belongs to the DRAG — the slop
    // discrimination must swallow it. Give it a beat, then pin nothing closed.
    await page.waitForTimeout(300);
    await expect(page.locator(MODAL), "below-threshold drag never closes").toHaveCount(1);
    expect(new URL(page.url()).searchParams.get("show"), "URL keeps the show param").toBe(
      show.slug,
    );
  });

  test("≤6px slop: the tap's click falls through to the grab and closes", async ({ page }) => {
    await openModal(page, SHEET);
    const { x, y } = await grabCenter(page);

    // Travel under the 6px slop → this is a TAP: the synthesized click is NOT
    // suppressed, the grab's onClick runs, and the modal closes via the URL.
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + DRAG_TAP_PX, { steps: 2 });
    await page.mouse.up();

    await expect(page.locator(MODAL_ANY), "sub-slop tap clicks through to close").toHaveCount(0, {
      timeout: 5000,
    });
    await expect
      .poll(() => new URL(page.url()).searchParams.has("show"), {
        message: "tap-close strips the show param",
      })
      .toBe(false);
  });

  // ── §6.5 transition inventory ──────────────────────────────────────────────

  test("§6.5 closed→open entrance: sheet-rise + scrim fade at <sm, pop-in at ≥sm (motion on)", async ({
    page,
  }) => {
    await openModal(page, SHEET, { reducedMotion: "no-preference" });
    const sheetAnim = await page
      .locator(PANEL)
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(sheetAnim, "sheet entrance is the rise keyframe").toBe("step3-details-sheet-rise");
    const scrimAnim = await page
      .locator(SCRIM)
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(scrimAnim, "scrim entrance is the fade keyframe").toBe("step3-details-scrim-in");

    await openModal(page, POPUP, { reducedMotion: "no-preference" });
    const popupAnim = await page
      .locator(PANEL)
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(popupAnim, "≥sm entrance is the pop-in keyframe").toBe("step3-details-pop-in");
  });

  test("§6.5 reduced motion collapses the entrance to animation: none", async ({ page }) => {
    await openModal(page, SHEET, { reducedMotion: "reduce" });
    for (const sel of [PANEL, SCRIM]) {
      const anim = await page.locator(sel).evaluate((el) => getComputedStyle(el).animationName);
      expect(anim, `${sel} entrance collapsed under reduced motion`).toBe("none");
    }
  });

  test("§6.5 compound: viewport crosses sm mid-drag → drag released, no stranded styles, close still works", async ({
    page,
  }) => {
    await openModal(page, SHEET);
    const { x, y } = await grabCenter(page);

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 80, { steps: 4 });
    expect((await panelInlineStyles(page)).transform).toBe("translateY(80px)");

    // Cross the sm (640px) boundary MID-DRAG: the matchMedia cleanup must
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
    expect(new URL(page.url()).searchParams.get("show"), "URL still open on the show").toBe(
      show.slug,
    );

    // "Remains fully interactive": the close button still closes.
    await page.locator(CLOSE).click();
    await expect(page.locator(MODAL_ANY), "close button works after the mode switch").toHaveCount(
      0,
      {
        timeout: 2000,
      },
    );
  });

  // ── Re-sync overlay (modal-header-reconciliation §6.7 / §10, Task 7) ───────
  //
  // These live HERE, not in published-review-modal.layout.spec.ts, because that
  // spec's harness is `renderToStaticMarkup` — inert markup with no React state,
  // so a pending trigger, an open overlay, and a focus-managed confirm cannot
  // exist in it at all. Everything below needs the live component; the static
  // spec keeps the assertions that are true of the idle tree (T-NO-ORANGE,
  // T-CONTRAST, T-TAP on the trigger).
  //
  // /api/admin/sync is intercepted rather than exercised: the three result
  // branches (shrink-hold, error, success) are server states this seed cannot
  // reach on demand, and the subject under test is the OVERLAY, not the route.

  const RESYNC = '[data-testid="admin-resync-button"]';
  const SUBHEADER = `[data-testid="${BASE}-subheader"]`;
  /** Deliberately long so the shrink panel genuinely overflows its cap — a
   *  short payload makes "internal scroll" vacuous. Sized generously on
   *  purpose: the panel spans the FULL BAND WIDTH (~1200px at the popup
   *  viewport), so a few hundred characters wrap into only two or three lines
   *  and fit inside the cap. 40 rows measured 279px against a 320px cap. */
  const LONG_DETAIL = Array.from(
    { length: 300 },
    (_, i) => `crew row ${i + 1} would be dropped from the roster`,
  ).join("; ");

  type SyncBody = { ok: boolean; error?: string; result?: unknown };

  async function stubSync(page: Page, body: SyncBody, opts: { delayMs?: number } = {}) {
    await page.route("**/api/admin/sync/**", async (route) => {
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
  }

  const SHRINK_BODY: SyncBody = {
    ok: true,
    result: { outcome: "shrink_held", detail: LONG_DETAIL, heldModifiedTime: "T1" },
  };

  /** Rect of every element the overlay must not disturb (§6.7: the panels
   *  reserve NO layout space, which is the entire point of the relocation). */
  async function bandAndBodyRects(page: Page) {
    return page.evaluate((subSel) => {
      const band = document.querySelector(subSel)!;
      const body = band.nextElementSibling!;
      const r = (el: Element) => {
        const b = el.getBoundingClientRect();
        return { top: b.top, height: b.height };
      };
      return { band: r(band), body: r(body) };
    }, SUBHEADER);
  }

  test("T-OVERLAY: the shrink confirm anchors to the BAND and its focused control is genuinely topmost", async ({
    page,
  }) => {
    await stubSync(page, SHRINK_BODY);
    await openModal(page, POPUP);
    await page.locator(RESYNC).click();

    const confirm = page.locator('[data-testid="admin-resync-shrink-confirm"]');
    await expect(confirm).toBeVisible();
    const keep = page.locator('[data-testid="admin-resync-keep-current"]');
    await expect(keep).toBeFocused();

    // Geometry, NOT offsetParent (§6.7): offsetParent is sensitive to
    // transforms and hidden states, so it false-reds on correct placement and
    // couples the assertion to layout internals. Edges are what the user sees.
    const geom = await page.evaluate((subSel) => {
      const band = document.querySelector(subSel)!.getBoundingClientRect();
      const panel = document
        .querySelector('[data-testid="admin-resync-shrink-confirm"]')!
        .getBoundingClientRect();
      return { band, panel: { left: panel.left, right: panel.right, top: panel.top } };
    }, SUBHEADER);
    expect(
      Math.abs(geom.panel.left - geom.band.left),
      "panel left edge == band left",
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(geom.panel.right - geom.band.right),
      "panel right edge == band right",
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(geom.panel.top - geom.band.bottom),
      "panel top sits at the band's bottom (top-full)",
    ).toBeLessThanOrEqual(1);

    // TOPMOST, not merely focused. A test asserting only toHaveFocus() passes
    // while the control is completely covered — which is exactly the WCAG 2.4.3
    // failure the focus management exists to prevent.
    const topmost = async () =>
      keep.evaluate((el) => {
        const b = el.getBoundingClientRect();
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return hit !== null && (hit === el || el.contains(hit));
      });
    expect(await topmost(), "focused safe control is the topmost element at its center").toBe(true);

    // The publish popover (z-40, PublishedToggle.tsx) is ERROR-ONLY and a
    // healthy seeded show cannot open it on demand — so a DECOY carrying the
    // popover's exact anchoring + z-index stands in for it. This pins the
    // stacking RULE (§6.7: the Re-sync overlay renders ABOVE the popover),
    // which is what an unspecified `z-*` would silently break.
    await page.evaluate((subSel) => {
      const decoy = document.createElement("div");
      decoy.id = "popover-decoy";
      decoy.className = "absolute inset-x-0 top-full z-40";
      decoy.style.height = "400px";
      decoy.style.background = "red";
      document.querySelector(subSel)!.appendChild(decoy);
    }, SUBHEADER);
    await expect(keep, "focus is unchanged by the decoy").toBeFocused();
    expect(
      await topmost(),
      "the confirm still wins over a z-40 band-anchored overlay (the publish popover's layer)",
    ).toBe(true);
  });

  for (const branch of ["shrink", "error", "success"] as const) {
    test(`T-OVERLAY-BOUNDS [${branch}]: the panel caps its height and scrolls internally; the band and body never reflow`, async ({
      page,
    }) => {
      const bodies: Record<typeof branch, SyncBody> = {
        shrink: SHRINK_BODY,
        // The ERROR branch is likeliest to overflow — it renders ErrorExplainer
        // PLUS HelpAffordance.
        error: { ok: false, error: "SYNC_INFRA_ERROR" },
        success: { ok: true, result: { outcome: "stage" } },
      };
      const testids: Record<typeof branch, string> = {
        shrink: "admin-resync-shrink-confirm",
        error: "admin-resync-error",
        success: "admin-resync-success",
      };
      await stubSync(page, bodies[branch]);
      await openModal(page, POPUP);

      const before = await bandAndBodyRects(page);
      await page.locator(RESYNC).click();
      const panel = page.locator(`[data-testid="${testids[branch]}"]`);
      await expect(panel).toBeVisible();

      const box = await panel.evaluate((el) => ({
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        overflowY: getComputedStyle(el).overflowY,
        position: getComputedStyle(el).position,
      }));
      const cap = Math.min(page.viewportSize()!.height * 0.5, 320);
      expect(box.position, "panel is out of flow").toBe("absolute");
      expect(box.overflowY, "long copy scrolls inside the panel, not over the rail").toBe("auto");
      expect(
        box.clientHeight,
        `panel height ${box.clientHeight} <= cap ${cap}`,
      ).toBeLessThanOrEqual(cap + TOL);

      const after = await bandAndBodyRects(page);
      expect(after.band, "band does not reflow when the overlay opens").toEqual(before.band);
      expect(after.body, "body does not reflow when the overlay opens").toEqual(before.body);

      if (branch === "shrink") {
        // Non-vacuity for the cap: the 40-row detail genuinely exceeds it, so
        // "capped + scrollable" is measured rather than assumed.
        expect(
          box.scrollHeight,
          "the long-detail fixture genuinely overflows the cap",
        ).toBeGreaterThan(box.clientHeight);
      }
    });
  }

  test("T-RESYNC-WIDTH: the trigger's box is identical idle and pending (the label swap cannot reflow the strip)", async ({
    page,
  }) => {
    // Failure mode: "Re-sync" → "Syncing…" widens the trigger mid-action and
    // slides the ml-auto Copy button under the user's cursor.
    await stubSync(page, { ok: true, result: { outcome: "skipped" } }, { delayMs: 3000 });
    await openModal(page, POPUP);

    const trigger = page.locator(RESYNC);
    const idle = await trigger.evaluate((el) => el.getBoundingClientRect().width);
    await trigger.click();
    await expect(trigger).toBeDisabled();
    const pending = await trigger.evaluate((el) => el.getBoundingClientRect().width);

    // Non-vacuity: if the labels never swapped, the widths would match for the
    // wrong reason.
    await expect(trigger).toHaveAccessibleName("Syncing…");
    expect(Math.abs(pending - idle), `idle ${idle} === pending ${pending}`).toBeLessThanOrEqual(
      TOL,
    );
  });

  test("T-RESYNC-FOCUS-ORDER (closed): toggle → Re-sync → copy, in DOM order", async ({ page }) => {
    await openModal(page, POPUP);
    // Copy is right-flushed by `ml-auto`, so a Copy-then-Re-sync DOM order
    // still LOOKS correct while producing toggle → Copy → Re-sync. §10 makes
    // DOM order the contract precisely because tab order follows it.
    const order = await page.evaluate((subSel) => {
      const band = document.querySelector(subSel)!;
      const focusables = Array.from(
        band.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
      );
      return focusables.map((el) => el.getAttribute("data-testid"));
    }, SUBHEADER);
    const resync = order.indexOf("admin-resync-button");
    const copy = order.indexOf("admin-current-share-link-copy-button");
    const toggle = order.findIndex((t) => t !== null && t.startsWith("published-toggle"));
    expect(resync, "Re-sync is focusable in the band").toBeGreaterThanOrEqual(0);
    expect(copy, "copy is focusable in the band").toBeGreaterThan(resync);
    expect(toggle, "the publish toggle precedes Re-sync").toBeGreaterThanOrEqual(0);
    expect(resync).toBeGreaterThan(toggle);
  });

  for (const branch of ["shrink", "error", "success"] as const) {
    test(`T-RESYNC-FOCUS-ORDER (open, ${branch}): the overlay's controls sit BETWEEN Re-sync and Copy`, async ({
      page,
    }) => {
      // A dismiss button reachable by query but sitting AFTER Copy satisfies a
      // click-based test while breaking the confirm-proximity contract (§10).
      // Never satisfy the closed-state order by hoisting the overlay past Copy.
      const bodies: Record<typeof branch, SyncBody> = {
        shrink: SHRINK_BODY,
        error: { ok: false, error: "SYNC_INFRA_ERROR" },
        success: { ok: true, result: { outcome: "stage" } },
      };
      const expected: Record<typeof branch, string[]> = {
        shrink: ["admin-resync-keep-current", "admin-resync-accept"],
        error: ["admin-resync-error-dismiss"],
        success: ["admin-resync-success-dismiss"],
      };
      await stubSync(page, bodies[branch]);
      await openModal(page, POPUP);
      await page.locator(RESYNC).click();
      await expect(page.locator(`[data-testid="${expected[branch][0]}"]`)).toBeVisible();

      const order = await page.evaluate((subSel) => {
        const band = document.querySelector(subSel)!;
        return Array.from(band.querySelectorAll<HTMLElement>("a[href], button"))
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => el.getAttribute("data-testid"));
      }, SUBHEADER);

      const resync = order.indexOf("admin-resync-button");
      const copy = order.indexOf("admin-current-share-link-copy-button");
      expect(resync, "Re-sync present").toBeGreaterThanOrEqual(0);
      expect(copy, "Copy present").toBeGreaterThanOrEqual(0);
      for (const id of expected[branch]) {
        const idx = order.indexOf(id);
        expect(idx, `${id} present in the band`).toBeGreaterThanOrEqual(0);
        expect(idx, `${id} follows Re-sync`).toBeGreaterThan(resync);
        expect(idx, `${id} precedes Copy`).toBeLessThan(copy);
      }
    });
  }

  for (const branch of ["error", "success"] as const) {
    test(`T-TAP (${branch} dismiss): the dismiss control's own box clears 44px`, async ({
      page,
    }) => {
      // Unlike the alert pill, these are real boxes — no ::before hit-area
      // idiom — so a rect measurement is the correct probe.
      await stubSync(
        page,
        branch === "error"
          ? { ok: false, error: "SYNC_INFRA_ERROR" }
          : { ok: true, result: { outcome: "stage" } },
      );
      await openModal(page, POPUP);
      await page.locator(RESYNC).click();
      const dismiss = page.locator(`[data-testid="admin-resync-${branch}-dismiss"]`);
      await expect(dismiss).toBeVisible();
      const box = await dismiss.evaluate((el) => el.getBoundingClientRect());
      expect(box.height, `${branch} dismiss height`).toBeGreaterThanOrEqual(44 - TOL);
      expect(box.width, `${branch} dismiss width`).toBeGreaterThanOrEqual(44 - TOL);
    });
  }

  // TOL is referenced by the panel-geometry sanity below; keep the constant
  // local to this file's measurement idiom.
  test("sheet mode sanity: full-bleed sheet panel at 390 (drag surface is real)", async ({
    page,
  }) => {
    await openModal(page, SHEET);
    const panelWidth = await page.locator(PANEL).evaluate((el) => el.getBoundingClientRect().width);
    expect(Math.abs(panelWidth - SHEET.width), "sheet spans the viewport").toBeLessThanOrEqual(TOL);
    const grabH = await page.locator(GRAB).evaluate((el) => el.getBoundingClientRect().height);
    expect(grabH, "grab strip tap-sized").toBeGreaterThanOrEqual(44 - TOL);
  });
});
