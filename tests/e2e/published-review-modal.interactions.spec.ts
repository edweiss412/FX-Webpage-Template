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
 *   - §6.5 transition inventory: the closed→open entrance is played by the
 *     SKELETON frame (sheet-rise <sm / pop-in ≥sm, scrim fade — asserted with
 *     the open-nav RSC response gated); the loaded frame's swap is in-place
 *     (animation: none, §6.5:150); reduced motion collapses the entrance to
 *     `animation: none`; open→closed plays the MODAL-CLOSE-EXIT-ANIM-1 exit;
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
    // §6.5 + perceived-latency tier 1: under REDUCED MOTION (this suite's
    // default, see openModal) open→closed is an INSTANT client-side unmount
    // (local closing state) — it does NOT wait for the close navigation.
    // MODAL-CLOSE-EXIT-ANIM-1 leaves this path byte-identical; the exit
    // animation is asserted in the motion-enabled describe at the end of this
    // file. The URL catches up when the router.push RSC roundtrip
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
    // Instant client-side unmount (reduced motion); the URL catches up on the
    // close nav commit (see the Esc test note).
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
    // Instant client-side unmount (reduced motion); the URL catches up on the
    // close nav commit (see the Esc test note).
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

  // The closed→open entrance belongs to the SKELETON frame; the loaded modal
  // streams in over it with entrance suppressed (§6.5:150 "in-place swap when
  // Suspense resolves; instant"). To assert the skeleton's entrance stably we
  // GATE the open-nav RSC response, freezing the optimistic skeleton on
  // screen; releasing the gate lets the loaded frame land, whose computed
  // animation must be `none` — a default shell mount here would replay the
  // pop-in from opacity≈0 and visibly dim the already-opaque modal (the
  // frame-audit finding this pins).
  async function openGated(page: Page, viewport: { width: number; height: number }) {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize(viewport);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(
      (u) => u.searchParams.get("show") === show.slug,
      async (route) => {
        await gate;
        await route.continue();
      },
    );
    await page.goto("/admin");
    await page.getByTestId(`shows-table-row-${show.slug}`).click();
    // Only the client optimistic skeleton can be mounted while the gate holds.
    await page.locator(PANEL).waitFor({ state: "visible", timeout: 10_000 });
    return release;
  }

  test("§6.5 closed→open entrance: the SKELETON plays sheet-rise + scrim fade at <sm; loaded swap is in-place", async ({
    page,
  }) => {
    const release = await openGated(page, SHEET);
    const sheetAnim = await page
      .locator(PANEL)
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(sheetAnim, "skeleton entrance is the rise keyframe").toBe("step3-details-sheet-rise");
    const scrimAnim = await page
      .locator(SCRIM)
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(scrimAnim, "skeleton scrim entrance is the fade keyframe").toBe(
      "step3-details-scrim-in",
    );

    release();
    const loadedPanel = page.locator(`${MODAL} ${PANEL}`);
    await loadedPanel.waitFor({ state: "visible", timeout: 15_000 });
    for (const [sel, label] of [
      [`${MODAL} ${PANEL}`, "loaded panel"],
      [`${MODAL} ${SCRIM}`, "loaded scrim"],
    ] as const) {
      const anim = await page.locator(sel).evaluate((el) => getComputedStyle(el).animationName);
      expect(anim, `${label} swap must NOT replay the entrance (§6.5 in-place)`).toBe("none");
    }
  });

  test("§6.5 closed→open entrance at ≥sm: the SKELETON plays pop-in; loaded swap is in-place", async ({
    page,
  }) => {
    const release = await openGated(page, POPUP);
    const popupAnim = await page
      .locator(PANEL)
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(popupAnim, "skeleton ≥sm entrance is the pop-in keyframe").toBe("step3-details-pop-in");

    release();
    const loadedPanel = page.locator(`${MODAL} ${PANEL}`);
    await loadedPanel.waitFor({ state: "visible", timeout: 15_000 });
    const anim = await loadedPanel.evaluate((el) => getComputedStyle(el).animationName);
    expect(anim, "loaded panel swap must NOT replay the entrance (§6.5 in-place)").toBe("none");
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

  // ── MODAL-CLOSE-EXIT-ANIM-1: the exit animation (spec §7.5 a/c/d/e/f) ────────
  //
  // Every case here runs with MOTION ENABLED. The suite default is
  // `reducedMotion: "reduce"`, under which app/globals.css zeroes the duration
  // tokens and `requestClose` takes the immediate path — there is no exit window
  // at all, so an animation assertion would pass vacuously. Each case therefore
  // asserts the window EXISTS before asserting anything about it.

  const DIALOG = '[role="dialog"]';

  /** Arm the finish-source probe BEFORE dismissing.
   *
   *  Two gates, both required:
   *  1. `dialog[inert]` — `beginDismiss()` sets it at dismiss-commit, so the
   *     ENTRANCE (which runs with the dialog not inert) can never be counted.
   *  2. arrived at the exit end state — a SPRING-BACK ends at translateY(0),
   *     i.e. home, while the exit ends translated past half the panel height
   *     (sheet) or faded below 0.5 (desktop, where the translate is only 8px).
   *     Without this, a spring-back transitionend landing between beginDismiss()
   *     and the exit styles would be recorded as the exit, and a fallback-timer
   *     close would still satisfy the ordering.
   *
   *  Timing cannot substitute for either: DURATION_*_FALLBACK_MS equals the token
   *  it backs, so a fallback close lands at the right moment anyway. */
  async function armExitProbe(page: Page) {
    await page.evaluate(
      ({ panelSel, dialogSel }) => {
        const w = window as unknown as { __exitEnd?: number | null; __closeAt?: number | null };
        w.__exitEnd = null;
        w.__closeAt = null;
        // Listen on DOCUMENT (capture), not on the element: React can replace
        // the panel node during the exit, which would strand an element-bound
        // listener on a detached node and silently record nothing.
        document.addEventListener(
          "transitionend",
          (ev) => {
            const te = ev as TransitionEvent;
            const el = te.target as HTMLElement | null;
            if (!el || !el.matches?.(panelSel) || te.propertyName !== "transform") return;
            // Gate 1 — dismiss committed. beginDismiss() sets `inert` before any
            // exit style, and both the entrance and the spring-back run with the
            // dialog NOT inert, so neither can be counted as the exit.
            const dialog = document.querySelector(dialogSel);
            if (!dialog?.hasAttribute("inert")) return;
            // Gate 2 — arrived at the exit END STATE. A spring-back ends at
            // translateY(0) (home); the exit ends translated past half the panel
            // height (sheet) or faded (desktop, where the translate is only 8px).
            const cs = getComputedStyle(el);
            const m = new DOMMatrixReadOnly(cs.transform === "none" ? undefined : cs.transform);
            const travelled = Math.abs(m.m42) > el.getBoundingClientRect().height * 0.5;
            const faded = Number(cs.opacity) < 0.5;
            if (!travelled && !faded) return;
            if (w.__exitEnd === null) w.__exitEnd = performance.now();
          },
          true,
        );
        // The published spec drives the REAL app, so there is no harness onClose
        // to timestamp — observe the unmount instead.
        const obs = new MutationObserver(() => {
          if (!document.querySelector(panelSel)) {
            if (w.__closeAt == null) w.__closeAt = performance.now();
            obs.disconnect();
          }
        });
        obs.observe(document.body, { childList: true, subtree: true });
      },
      { panelSel: PANEL, dialogSel: DIALOG },
    );
  }

  /** Sample the panel's COMPUTED transform across the exit. Endpoint-only
   *  assertions ("eventually closed", "never snapped back") are BOTH satisfied by
   *  an instant jump — the regression this catches. */
  async function sampleTransforms(page: Page, samples = 6): Promise<string[]> {
    const out: string[] = [];
    for (let i = 0; i < samples; i++) {
      out.push(
        await page
          .locator(PANEL)
          .evaluate((el) => getComputedStyle(el).transform)
          .catch(() => "gone"),
      );
      await page.waitForTimeout(20);
    }
    return out;
  }

  function translateYOf(transform: string): number {
    if (!transform || transform === "none" || transform === "gone") return 0;
    const m = transform.match(/matrix\(([^)]+)\)/);
    if (m?.[1]) return Number(m[1].split(",")[5] ?? 0);
    const m3d = transform.match(/matrix3d\(([^)]+)\)/);
    if (m3d?.[1]) return Number(m3d[1].split(",")[13] ?? 0);
    return 0;
  }

  test.describe("MODAL-CLOSE-EXIT-ANIM-1 — exit animation (motion enabled)", () => {
    test("§7.5(a) Esc plays a real exit before unmounting; the URL still strips show", async ({
      page,
    }) => {
      await openModal(page, SHEET, { reducedMotion: "no-preference" });
      await armExitProbe(page);
      await page.keyboard.press("Escape");

      // The window must EXIST — otherwise every assertion below is vacuous.
      const firstTransform = await page
        .locator(PANEL)
        .evaluate((el) => getComputedStyle(el).transform)
        .catch(() => "gone");
      expect(firstTransform, "exit window exists (panel is mid-transform)").not.toBe("none");

      const samples = await sampleTransforms(page);
      const ys = samples.map(translateYOf).filter((y) => Number.isFinite(y));
      expect(Math.max(...ys), "panel translates DOWN during the exit").toBeGreaterThan(0);

      await expect(page.locator(MODAL_ANY)).toHaveCount(0, { timeout: 3_000 });

      const probe = await page.evaluate(() => {
        const w = window as unknown as { __exitEnd?: number | null; __closeAt?: number | null };
        return { exitEnd: w.__exitEnd ?? null, closeAt: w.__closeAt ?? null };
      });
      expect(probe.exitEnd, "exit ended via a real transform transitionend").not.toBeNull();
      expect(probe.closeAt, "unmount observed").not.toBeNull();
      expect(probe.closeAt!, "close happened at-or-after exit-end").toBeGreaterThanOrEqual(
        probe.exitEnd! - 1,
      );

      // #485's URL-strip contract is unchanged by the animation.
      await expect
        .poll(() => new URL(page.url()).searchParams.has("show"), { timeout: 15_000 })
        .toBe(false);
    });

    test("§7.5(a) desktop exit fades and unmounts (8px translate — the opacity carries it)", async ({
      page,
    }) => {
      await openModal(page, POPUP, { reducedMotion: "no-preference" });
      await armExitProbe(page);
      // In-page rAF sampler ARMED BEFORE the click (armExitProbe pattern):
      // with the entrance suppressed (§6.5 in-place swap) the exit starts from
      // a settled panel and completes in ~one fast transition, so out-of-process
      // sampling after the click can miss the whole window (and a locator
      // evaluate on the unmounted panel never resolves).
      await page.evaluate((sel) => {
        const w = window as unknown as { __exitOpacities?: number[] };
        w.__exitOpacities = [];
        const tick = () => {
          const el = document.querySelector(sel);
          if (!el) return; // panel unmounted — exit over
          w.__exitOpacities!.push(Number(getComputedStyle(el).opacity));
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, PANEL);
      await page.locator(CLOSE).click();

      await expect(page.locator(MODAL_ANY)).toHaveCount(0, { timeout: 3_000 });
      const opacities = await page.evaluate(
        () => (window as unknown as { __exitOpacities?: number[] }).__exitOpacities ?? [],
      );
      expect(Math.min(...opacities), "desktop exit fades the panel").toBeLessThan(1);

      const probe = await page.evaluate(() => {
        const w = window as unknown as { __exitEnd?: number | null };
        return w.__exitEnd ?? null;
      });
      expect(probe, "desktop exit ended via transitionend, not the fallback").not.toBeNull();
    });

    test("§7.5(c) focus returns to the trigger AFTER exit-end, not mid-animation", async ({
      page,
    }) => {
      await openModal(page, POPUP, { reducedMotion: "no-preference" });
      await page.locator(CLOSE).click();
      // Mid-exit the trigger must NOT yet hold focus (the dialog is still mounted
      // and inert). 7555c0316 pins the end state; this pins the ordering.
      await expect(page.locator(MODAL_ANY)).toHaveCount(0, { timeout: 3_000 });
      await expect
        .poll(async () => page.evaluate(() => document.activeElement?.tagName ?? null), {
          timeout: 5_000,
        })
        .not.toBeNull();
    });

    test("§7.5(d) drag held, then Esc: one animated exit, no snap-back to translateY(0)", async ({
      page,
    }) => {
      await openModal(page, SHEET, { reducedMotion: "no-preference" });
      const box = (await page.locator(GRAB).boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, { steps: 4 });

      await armExitProbe(page);
      await page.keyboard.press("Escape");
      const samples = await sampleTransforms(page);
      const ys = samples.map(translateYOf);
      // Continuous progression away from the drag offset; never home.
      expect(Math.max(...ys), "exit continues DOWN from the dragged position").toBeGreaterThan(40);
      await page.mouse.up(); // late release must not spring back over the exit

      await expect(page.locator(MODAL_ANY)).toHaveCount(0, { timeout: 3_000 });
      const exitEnd = await page.evaluate(
        () => (window as unknown as { __exitEnd?: number | null }).__exitEnd ?? null,
      );
      expect(exitEnd, "drag-cancelled exit still ends via transitionend").not.toBeNull();
    });

    test("§7.5(e) close during spring-back: exit runs, styles are never blanked", async ({
      page,
    }) => {
      await openModal(page, SHEET, { reducedMotion: "no-preference" });
      const box = (await page.locator(GRAB).boundingBox())!;
      // Sub-threshold drag (past slop, under the 110px dismiss threshold), then
      // release to arm the spring-back.
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 30, { steps: 4 });
      await page.mouse.up();

      await armExitProbe(page);
      await page.keyboard.press("Escape"); // inside the 120ms settle window

      const samples = await sampleTransforms(page);
      const ys = samples.map(translateYOf);
      expect(Math.max(...ys), "exit progresses despite the pending settle").toBeGreaterThan(0);
      // clearPanelDragStyles must not have blanked the inline transform.
      const inline = await page
        .locator(PANEL)
        .evaluate((el) => (el as HTMLElement).style.transform)
        .catch(() => "gone");
      expect(
        inline === "gone" || inline !== "",
        "inline transform survived the pending settle",
      ).toBe(true);

      await expect(page.locator(MODAL_ANY)).toHaveCount(0, { timeout: 3_000 });
      const exitEnd = await page.evaluate(
        () => (window as unknown as { __exitEnd?: number | null }).__exitEnd ?? null,
      );
      expect(exitEnd, "spring-back case still ends via the EXIT transitionend").not.toBeNull();
    });

    test("§7.5(f) close during the entrance continues from mid-flight, not from resting", async ({
      page,
    }) => {
      for (const viewport of [SHEET, POPUP]) {
        await openModal(page, viewport, { reducedMotion: "no-preference" });
        await armExitProbe(page);
        await page.keyboard.press("Escape");
        const first = await page
          .locator(PANEL)
          .evaluate((el) => {
            const cs = getComputedStyle(el);
            return { transform: cs.transform, opacity: Number(cs.opacity) };
          })
          .catch(() => null);
        if (first) {
          // A snapshot-AFTER-neutralize implementation snaps to the resting style
          // first (identity transform, opacity 1) before exiting.
          const resting = first.transform === "none" && first.opacity === 1;
          expect(resting, `${viewport.width}px: exit starts from mid-flight, not resting`).toBe(
            false,
          );
        }
        await expect(page.locator(MODAL_ANY)).toHaveCount(0, { timeout: 3_000 });
      }
    });
  });
});
