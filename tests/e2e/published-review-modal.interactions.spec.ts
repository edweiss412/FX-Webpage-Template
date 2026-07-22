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
import { admin } from "./helpers/supabaseAdmin";
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

  /** Deterministic hydration gate for the dashboard row Link. The old
   *  `waitForLoadState("networkidle")` proxy hangs the full test timeout on
   *  the CI prod-build server (background polling keeps the network busy —
   *  networkidle never fires) and proves nothing about hydration anyway.
   *  A gesture on a pre-hydration Link is a FULL document navigation: no
   *  optimistic skeleton, and the shell never captures the trigger for
   *  focus restore. React attaches component props onto the DOM node under
   *  a `__reactProps$…` key once (and only once) the tree has hydrated —
   *  poll for the row's onClick being present there. */
  async function waitForRowHydration(page: Page, slug: string): Promise<void> {
    await expect
      .poll(
        () =>
          page.evaluate((tid) => {
            const el = document.querySelector(`[data-testid="${tid}"]`) as
              | (Element & Record<string, { onClick?: unknown }>)
              | null;
            if (!el) return false;
            return Object.keys(el).some(
              (k) => k.startsWith("__reactProps$") && typeof el[k]?.onClick === "function",
            );
          }, `shows-table-row-${slug}`),
        { message: "row link hydrated (React onClick attached)", timeout: 30_000 },
      )
      .toBe(true);
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
    // Hydration gate: Enter on a pre-hydration Link is a full document
    // navigation — the shell never captures the trigger, so the focus
    // restore this test pins could never happen. (networkidle replaced —
    // see waitForRowHydration.)
    await waitForRowHydration(page, show.slug);

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
    // Hydration gate: a pre-hydration click is a full navigation — no
    // optimistic skeleton, so the stranded-overlay pin would be vacuous.
    await waitForRowHydration(page, show.slug);

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

  // T-HUB-POPOVER (share-hub T4). Geometry for a surface that only exists after
  // a real click, so it belongs in this hydrated spec rather than the static
  // layout harness. Failure modes: a popover that covers the very triggers that
  // opened it (top-full lost), one that is not the specified 308px, one whose
  // right edge drifts off the band's content edge, and one that overflows a
  // 390px phone.
  for (const width of [390, 1280]) {
    test(`T-HUB-POPOVER @ ${width}: 308px, below the triggers, right-aligned, inside the modal`, async ({
      page,
    }) => {
      await openModal(page, { width, height: 900 });
      await page.getByTestId("share-hub-primary").click();
      await expect(page.getByTestId("share-hub-popover")).toBeVisible();

      const geo = await page.locator(SUBHEADER).evaluate((band) => {
        const pop = document.querySelector('[data-testid="share-hub-popover"]');
        const group = band.querySelector('[data-testid="share-hub-group"]');
        const primary = band.querySelector('[data-testid="share-hub-primary"]');
        const kebab = band.querySelector('[data-testid="share-hub-kebab"]');
        if (pop === null || group === null || primary === null || kebab === null) return null;
        const bandRect = band.getBoundingClientRect();
        const padRight = parseFloat(getComputedStyle(band).paddingRight);
        const p = pop.getBoundingClientRect();
        const k = kebab.getBoundingClientRect();
        return {
          popWidth: p.width,
          popTop: p.top,
          popRight: p.right,
          popLeft: p.left,
          groupBottom: group.getBoundingClientRect().bottom,
          contentRight: bandRect.right - padRight,
          primaryHeight: primary.getBoundingClientRect().height,
          kebabW: k.width,
          kebabH: k.height,
          docScrollWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
        };
      });
      expect(geo, "hub popover + group present").not.toBeNull();

      // min(308, viewport - 2rem) at EVERY width — one expression exercised on
      // both bands, so deleting the clamp cannot pass on the wide band alone.
      const expectedWidth = Math.min(308, geo!.viewportWidth - 32);
      expect(geo!.popWidth, `width is min(308, viewport-2rem) @ ${width}`).toBeCloseTo(
        expectedWidth,
        0,
      );
      expect(
        geo!.popTop,
        `popover top ${geo!.popTop} is at/below the trigger group bottom ${geo!.groupBottom}`,
      ).toBeGreaterThanOrEqual(geo!.groupBottom - 1);
      expect(
        Math.abs(geo!.popRight - geo!.contentRight),
        `popover right ${geo!.popRight} === band content-box right ${geo!.contentRight}`,
      ).toBeLessThanOrEqual(1);
      expect(geo!.popLeft, `popover left edge on-screen @ ${width}`).toBeGreaterThanOrEqual(-1);
      expect(geo!.docScrollWidth, `no horizontal overflow @ ${width}`).toBeLessThanOrEqual(
        geo!.viewportWidth + 1,
      );
      expect(geo!.primaryHeight, `primary trigger tap-min @ ${width}`).toBeGreaterThanOrEqual(43);
      expect(geo!.kebabH, `kebab tap-min @ ${width}`).toBeGreaterThanOrEqual(43);
      expect(Math.abs(geo!.kebabW - geo!.kebabH), `kebab is square @ ${width}`).toBeLessThanOrEqual(
        1,
      );
    });
  }

  test("T-HUB-ZORDER: an open attention menu is not overpainted by the closed share hub", async ({
    page,
  }) => {
    // The shipped defect (share-hub-fidelity-fixes §1.2): ShareHub's root carried
    // `relative z-30` unconditionally, establishing a stacking context that
    // painted its two NON-POSITIONED trigger buttons above the attention menu's
    // z-20 panel and stole its clicks.
    //
    // elementFromPoint, NOT a computed-style or class read: a class assertion
    // passes against a wrapper that is elevated but still loses in paint order,
    // which is precisely the bug.
    // Seeded HERE, not in beforeAll: an actionable alert makes the attention
    // menu auto-open on arrival, and an always-open menu claims the first Esc
    // (the ratified capture-phase contract) and shifts header geometry — which
    // perturbs the focus-continuity, exit-animation, and popover-geometry tests
    // in this file. Scope it to the one test that needs it and clean up in a
    // finally, so a failure here cannot leak the alert into the rest of the run.
    //
    // Unknown codes are actionable by classification (neither inbox-routed nor
    // auto-resolving) — the same seed code the deeplink suite uses.
    const { data, error } = await admin
      .from("admin_alerts")
      .insert({
        show_id: show.showId,
        code: "SYNC_DELAYED_SEVERE",
        context: {},
        raised_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`T-HUB-ZORDER alert seed failed: ${error?.message}`);
    const alertId = data.id as string;

    try {
      await openModal(page, POPUP);
      const menu = page.locator(`${MODAL} [data-testid="${BASE}-attention-menu"]`);
      const pill = page.locator(`${MODAL} [data-testid="${BASE}-alert-pill"]`);
      if (!(await menu.isVisible())) await pill.click();
      await expect(menu).toBeVisible();

      const menuBox = await menu.boundingBox();
      const hubBox = await page.locator(`${MODAL} [data-testid="share-hub-primary"]`).boundingBox();
      if (!menuBox || !hubBox) throw new Error("menu and share-hub must both be laid out");

      // PRECONDITION, failing loud rather than skipping: if these stop
      // overlapping the test no longer exercises the defect and must say so
      // instead of silently going green.
      const ix = Math.max(menuBox.x, hubBox.x);
      const iy = Math.max(menuBox.y, hubBox.y);
      const ir = Math.min(menuBox.x + menuBox.width, hubBox.x + hubBox.width);
      const ib = Math.min(menuBox.y + menuBox.height, hubBox.y + hubBox.height);
      expect(
        ir > ix && ib > iy,
        "the attention menu and the share-hub button must overlap for this test to mean anything",
      ).toBe(true);

      const hit = await page.evaluate(
        ([x, y]: [number, number]) => {
          const el = document.elementFromPoint(x, y);
          return {
            inMenu: !!el?.closest('[data-testid="published-show-review-attention-menu"]'),
            inHub: !!el?.closest('[data-testid="share-hub-primary"]'),
          };
        },
        [(ix + ir) / 2, (iy + ib) / 2] as [number, number],
      );
      expect(hit.inMenu).toBe(true);
      expect(hit.inHub).toBe(false);
    } finally {
      // Surface a failed cleanup instead of swallowing it: a leaked actionable
      // alert would auto-open the attention menu for every later test in this
      // file and quietly corrupt them. Better to fail this test loudly here.
      const { error: cleanupError } = await admin.from("admin_alerts").delete().eq("id", alertId);
      if (cleanupError) {
        throw new Error(`T-HUB-ZORDER alert cleanup failed (would leak): ${cleanupError.message}`);
      }
    }
  });

  test("T-HUB-ROWS: the Careful rows fill the panel, clear the tap floor, and pad a wrapped description", async ({
    page,
  }) => {
    // §4.6's width chain is panel → component wrapper → button, three links.
    // Measuring the button against the PANEL proves all of them end to end: a
    // missing `w-full` on either link resolves short and fails here. jsdom
    // computes no layout, so this cannot be asserted in the unit suite.
    await openModal(page, POPUP);
    await page.locator('[data-testid="share-hub-primary"]').click();
    const panel = page.locator('[data-testid="share-hub-popover"]');
    await expect(panel).toBeVisible();

    const geo = await panel.evaluate((el) => {
      const cs = getComputedStyle(el);
      const contentWidth =
        el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const row = (id: string) => {
        const b = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
        const label = b.querySelector<HTMLElement>("span > span")!;
        return {
          width: b.getBoundingClientRect().width,
          height: b.getBoundingClientRect().height,
          labelTopGap: label.getBoundingClientRect().top - b.getBoundingClientRect().top,
          icon: (() => {
            const r = b.querySelector("svg")!.getBoundingClientRect();
            return { w: r.width, h: r.height };
          })(),
        };
      };
      return {
        contentWidth,
        overflowsX: el.scrollWidth > el.clientWidth,
        rotate: row("admin-rotate-share-token-button"),
        reset: row("picker-reset-all-button"),
      };
    });

    for (const [name, row] of [
      ["rotate", geo.rotate],
      ["reset", geo.reset],
    ] as const) {
      expect(Math.abs(row.width - geo.contentWidth), `${name} row fills the panel`).toBeLessThan(
        0.5,
      );
      expect(row.height, `${name} row clears the 44px tap floor`).toBeGreaterThanOrEqual(44);
      // p-2 is 8px on every side, and it must hold once the row grows past the
      // tap floor - min-h alone supplies no padding at content height.
      expect(row.labelTopGap, `${name} row keeps its top padding`).toBeGreaterThanOrEqual(7.5);
      expect(row.icon.w, `${name} icon is 16px wide`).toBeCloseTo(16, 0);
      expect(row.icon.h, `${name} icon is 16px tall`).toBeCloseTo(16, 0);
    }
    expect(geo.overflowsX, "the panel never scrolls horizontally").toBe(false);
  });

  test("T-HUB-CARET: the caret centres on the trigger that opened it, straddles the panel edge, and is unclipped", async ({
    page,
  }) => {
    await openModal(page, POPUP);
    await page.locator('[data-testid="share-hub-primary"]').click();
    await expect(page.locator('[data-testid="share-hub-popover"]')).toBeVisible();

    const caret = await page.locator('[data-testid="share-hub-caret"]').boundingBox();
    const primary = await page.locator('[data-testid="share-hub-primary"]').boundingBox();
    const kebab = await page.locator('[data-testid="share-hub-kebab"]').boundingBox();
    const panel = await page.locator('[data-testid="share-hub-popover"]').boundingBox();
    if (!caret || !primary || !kebab || !panel)
      throw new Error("caret, primary, kebab and panel must all be laid out");

    // Opened from the PRIMARY button: the caret anchors under it, not the kebab
    // (impeccable critique — the caret must point at the trigger the operator
    // actually used). Derived from the MEASURED trigger, never hardcoded.
    expect(
      Math.abs(caret.x + caret.width / 2 - (primary.x + primary.width / 2)),
      "the caret centres on the primary trigger that opened it",
    ).toBeLessThan(0.5);
    // ...and specifically NOT on the kebab, ~8px to its right.
    expect(
      Math.abs(caret.x + caret.width / 2 - (kebab.x + kebab.width / 2)),
      "the caret does not centre on the (unused) kebab",
    ).toBeGreaterThan(2);

    // The rotated 10px square: bounding box ~14.1px on the diagonal.
    expect(caret.width, "caret is a 10px square (rotated)").toBeCloseTo(caret.height, 1);
    expect(caret.width).toBeGreaterThan(9);
    expect(caret.width).toBeLessThan(15);

    // Straddles the panel's top edge - that overlap is what reads as a notch
    // rather than a detached diamond.
    expect(caret.y, "caret starts above the panel edge").toBeLessThan(panel.y);
    expect(caret.y + caret.height, "caret crosses into the panel").toBeGreaterThan(panel.y);

    // NOT clipped away: proven STRUCTURALLY, not by elementFromPoint. The caret
    // is a SIBLING of the panel (unit test: popover does not contain it), so the
    // panel's overflow-y-auto cannot clip it; the rect assertions above prove it
    // has a real box that extends above the panel edge. A hit-test cannot add to
    // that: the caret is pointer-events-none, so elementFromPoint over it ALWAYS
    // returns the element behind it whether the caret is visible, clipped, or
    // absent — so `!!el` there would prove nothing.
    //
    // What the hit-test DOES prove, and the only thing asserted here: the caret
    // is inert to pointer events. Sampled where the caret overlaps the panel, so
    // a caret that (wrongly) intercepted clicks would be the hit target.
    const overCaret = await page.evaluate(
      ([x, y]: [number, number]) =>
        document.elementFromPoint(x, y)?.getAttribute("data-testid") === "share-hub-caret",
      [caret.x + caret.width / 2, caret.y + caret.height - 1] as [number, number],
    );
    expect(overCaret, "the caret is inert to pointer events").toBe(false);
  });

  test("T-HUB-CARET-KEBAB: opening from the kebab centres the caret on the kebab", async ({
    page,
  }) => {
    await openModal(page, POPUP);
    await page.locator('[data-testid="share-hub-kebab"]').click();
    await expect(page.locator('[data-testid="share-hub-popover"]')).toBeVisible();

    const caret = await page.locator('[data-testid="share-hub-caret"]').boundingBox();
    const kebab = await page.locator('[data-testid="share-hub-kebab"]').boundingBox();
    if (!caret || !kebab) throw new Error("caret and kebab must be laid out");

    // Kebab is the group's rightmost element, so its anchor equals the
    // `right-[17px]` fallback — but this asserts the MEASURED path lands there
    // too, so the two openers are proven distinct (primary case above).
    expect(
      Math.abs(caret.x + caret.width / 2 - (kebab.x + kebab.width / 2)),
      "the caret centres on the kebab that opened it",
    ).toBeLessThan(0.5);
  });

  test("T-RESYNC-FOCUS-ORDER (closed): toggle → Re-sync → share hub, in DOM order", async ({
    page,
  }) => {
    await openModal(page, POPUP);
    // share-hub T4: the band's right-flushed control is now the hub trigger
    // group, not the retired standalone copy button (Copy moved inside the
    // popover). The hub group is right-flushed by `ml-auto`, so a hub-then-
    // Re-sync DOM order still LOOKS correct while producing toggle → hub →
    // Re-sync. §10 makes DOM order the contract because tab order follows it.
    const order = await page.evaluate((subSel) => {
      const band = document.querySelector(subSel)!;
      const focusables = Array.from(
        band.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
      );
      return focusables.map((el) => el.getAttribute("data-testid"));
    }, SUBHEADER);
    const resync = order.indexOf("admin-resync-button");
    const copy = order.indexOf("share-hub-primary");
    const toggle = order.findIndex((t) => t !== null && t.startsWith("published-toggle"));
    expect(resync, "Re-sync is focusable in the band").toBeGreaterThanOrEqual(0);
    expect(copy, "the share-hub trigger is focusable in the band").toBeGreaterThan(resync);
    // The kebab follows its primary; both live in the same right-flushed group.
    expect(order.indexOf("share-hub-kebab"), "kebab follows the primary trigger").toBeGreaterThan(
      copy,
    );
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
      // share-hub T4: the trailing band control is the hub trigger, not Copy.
      const copy = order.indexOf("share-hub-primary");
      expect(resync, "Re-sync present").toBeGreaterThanOrEqual(0);
      expect(copy, "share-hub trigger present").toBeGreaterThanOrEqual(0);
      for (const id of expected[branch]) {
        const idx = order.indexOf(id);
        expect(idx, `${id} present in the band`).toBeGreaterThanOrEqual(0);
        expect(idx, `${id} follows Re-sync`).toBeGreaterThan(resync);
        expect(idx, `${id} precedes the share-hub trigger`).toBeLessThan(copy);
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
   *  an instant jump — the regression this catches.
   *
   *  page.evaluate + querySelector, NEVER locator(PANEL).evaluate: a locator
   *  evaluate AUTO-WAITS (timeout 0 = forever) for the element to be attached,
   *  so once the panel unmounts mid-exit the call hangs the whole test — the
   *  .catch was unreachable (rejection never happens; it waits). Under CI load
   *  the ~20ms iterations stretch past exit-end and the panel detaches between
   *  samples (surfaced by the prefetch PR's first real-CI run; the pre-armed
   *  in-page-probe lesson from #492 applies to every post-gesture sampler). */
  async function sampleTransforms(page: Page, samples = 6): Promise<string[]> {
    const out: string[] = [];
    for (let i = 0; i < samples; i++) {
      out.push(
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          return el ? getComputedStyle(el).transform : "gone";
        }, PANEL),
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
      // (page.evaluate, not locator.evaluate — see sampleTransforms.)
      const firstTransform = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).transform : "gone";
      }, PANEL);
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
      // (page.evaluate, not locator.evaluate — see sampleTransforms.)
      const inline = await page.evaluate((sel) => {
        const el = document.querySelector<HTMLElement>(sel);
        return el ? el.style.transform : "gone";
      }, PANEL);
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
        // (page.evaluate, not locator.evaluate — see sampleTransforms.)
        const first = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const cs = getComputedStyle(el);
          return { transform: cs.transform, opacity: Number(cs.opacity) };
        }, PANEL);
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

  test.describe("hoverhelp panel host (spec 2026-07-22-hoverhelp-smart-position §6 T4/T7/T8)", () => {
    /** ONE unresolved show-scoped alert whose catalog row carries
     * helpfulContext + helpHref (SYNC_DELAYED_SEVERE — the same code the
     * deeplink suite uses), so the attention card renders a HoverHelp
     * trigger with a Learn-more link. Seeded ONCE for the whole describe:
     * per-test seed/delete flaked — the previous test's DELETE fires an
     * admin realtime refresh that re-renders the NEXT test's freshly-opened
     * modal mid-assertion (a hover popover legitimately closes on that
     * re-render). All four tests want the alert present, and this describe
     * is the last block in the file, so the T-HUB-ZORDER perturbation
     * concern (an actionable alert auto-opens the attention menu for OTHER
     * tests) does not apply; afterAll removes it. */
    let seededAlertId = "";
    test.beforeAll(async () => {
      const { data, error } = await admin
        .from("admin_alerts")
        .insert({
          show_id: show.showId,
          code: "SYNC_DELAYED_SEVERE",
          context: {},
          raised_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(`hoverhelp alert seed failed: ${error?.message}`);
      seededAlertId = data.id as string;
    });
    test.afterAll(async () => {
      if (!seededAlertId) return;
      const { error } = await admin.from("admin_alerts").delete().eq("id", seededAlertId);
      if (error) throw new Error(`hoverhelp alert cleanup failed (would leak): ${error.message}`);
    });
    /** Compatibility shim over the old per-test wrapper shape. */
    async function withSeededAlert(fn: (alertId: string) => Promise<void>) {
      await fn(seededAlertId);
    }

    /** HoverHelp's mouse-only pointerenter hover-opens before the click
     * toggle (net closed) — same race the deep-link-walker documents; the
     * pointer is already inside after click #1, so click #2 usually lands
     * open. A LOOP (not a single retry) because the parity is not stable
     * under CPU contention (shared CI runners; sibling local pipelines):
     * a slow frame can re-run the hover-open before a click commits, so
     * each attempt just toggles again until the open state sticks. */
    async function clickOpenTrigger(page: Page, trigger: ReturnType<Page["locator"]>) {
      for (let attempt = 0; attempt < 5; attempt++) {
        await trigger.click();
        try {
          await expect(trigger).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
          return;
        } catch {
          // toggled closed again — loop
        }
      }
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
    }

    test("T4a: popover on a pane-bottom card is TRULY visible through both clipping ancestors", async ({
      page,
    }) => {
      await withSeededAlert(async (alertId) => {
        await openModal(page, POPUP);
        const card = page.locator(`[data-testid="attention-banner-${alertId}"]`);
        await expect(card).toBeVisible();
        // Scroll the pane so the card sits at its BOTTOM edge — the exact
        // geometry BL-HOVERHELP-PORTAL documents as clipped pre-portal.
        await card.evaluate((el) => el.scrollIntoView({ block: "end" }));
        const trigger = card.locator("button[aria-expanded]").first();
        await clickOpenTrigger(page, trigger);
        const ownsId = await card.locator("[aria-owns]").first().getAttribute("aria-owns");
        if (!ownsId) throw new Error("affordance root missing aria-owns");
        const body = page.locator(`[id=${JSON.stringify(ownsId)}]`);
        await expect(body).toHaveAttribute("data-popover-side", /top|bottom/);
        const hit = await body.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const probe = (x: number, y: number) => {
            const at = document.elementFromPoint(x, y);
            return at === el || el.contains(at);
          };
          const inset = 4;
          return {
            center: probe(r.left + r.width / 2, r.top + r.height / 2),
            tl: probe(r.left + inset, r.top + inset),
            tr: probe(r.right - inset, r.top + inset),
            bl: probe(r.left + inset, r.bottom - inset),
            br: probe(r.right - inset, r.bottom - inset),
          };
        });
        expect(hit).toEqual({ center: true, tl: true, tr: true, bl: true, br: true });
      });
    });

    test("T4b: dismiss-time inert covers the portaled body whenever it covers the panel", async ({
      page,
    }) => {
      await withSeededAlert(async (alertId) => {
        // Real motion: reduced-motion collapses the exit to none and the
        // inert window would be unobservable.
        await openModal(page, POPUP, { reducedMotion: "no-preference" });
        const card = page.locator(`[data-testid="attention-banner-${alertId}"]`);
        await card.evaluate((el) => el.scrollIntoView({ block: "center" }));
        const trigger = card.locator("button[aria-expanded]").first();
        await clickOpenTrigger(page, trigger);
        // Dismiss via the close button's programmatic click — no pointer
        // movement, so the hover popover stays OPEN when `beginDismiss`
        // inerts the dialog subtree (an Escape would be swallowed by the
        // popover's containment and never reach the modal). Sampling starts
        // in the same evaluate so frame 0 lands inside the inert window.
        const samples = await page.evaluate(
          async (args) => {
            const panel = document.querySelector("[data-review-modal-panel]");
            const cardEl = document.querySelector(
              `[data-testid="attention-banner-${args.alertId}"]`,
            );
            const bid = cardEl?.querySelector("[aria-owns]")?.getAttribute("aria-owns");
            const body = bid ? document.getElementById(bid) : null;
            if (!panel || !body) throw new Error("panel or portaled popover body missing");
            const closeBtn = document.querySelector<HTMLElement>(args.closeSel);
            if (!closeBtn) throw new Error("close button missing");
            const out: { panelInert: boolean; bodyInert: boolean }[] = [];
            closeBtn.click();
            for (let i = 0; i < 30; i++) {
              // Only frames where the panel is still CONNECTED are meaningful:
              // after the exit completes React removes the dialog tree, and the
              // detached dialog root keeps its `inert` attribute while the
              // portal child is detached separately — a post-unmount artifact,
              // not an accessibility state a user can reach.
              if (!panel.isConnected) break;
              out.push({
                panelInert: !!panel.closest("[inert]"),
                bodyInert: !!body.closest("[inert]"),
              });
              await new Promise((r) => requestAnimationFrame(() => r(null)));
            }
            return out;
          },
          { alertId, closeSel: CLOSE },
        );
        const inertFrames = samples.filter((s) => s.panelInert);
        // Non-vacuity: the exit transition must actually produce inert frames.
        expect(inertFrames.length).toBeGreaterThan(0);
        for (const f of inertFrames) expect(f.bodyInert).toBe(true);
      });
    });

    test("T7 panel-host: narrow panel engages maxWidth and pane scroll tracks the trigger", async ({
      page,
    }) => {
      await withSeededAlert(async (alertId) => {
        // 300px viewport: sheet-mode panel ≈ viewport width, bounds ≈ 284px
        // < the 288px natural body → the §4.2 width-first shrink engages.
        await openModal(page, { width: 300, height: 844 });
        const card = page.locator(`[data-testid="attention-banner-${alertId}"]`);
        await card.evaluate((el) => el.scrollIntoView({ block: "center" }));
        const trigger = card.locator("button[aria-expanded]").first();
        await clickOpenTrigger(page, trigger);
        const ownsId = await card.locator("[aria-owns]").first().getAttribute("aria-owns");
        if (!ownsId) throw new Error("affordance root missing aria-owns");
        const body = page.locator(`[id=${JSON.stringify(ownsId)}]`);
        // Horizontal containment at 300px: the body must sit fully inside the
        // panel's bounds. (An inline maxWidth is structurally unreachable on
        // this surface: the sheet-mode panel spans ~the full viewport, so the
        // class cap `max-w-[80vw]` = 240px is ALWAYS below the §4.2 bounds
        // width (vw - 2*VIEWPORT_INSET = 284px) — the width-first shrink
        // never engages. The inline-maxWidth engage/restore path is covered
        // by the geometry suite's `narrowpane` case, whose 160px pane host
        // is genuinely narrower than the class cap.)
        const containment = await page.evaluate((id) => {
          const b = document.getElementById(id)!.getBoundingClientRect();
          const p = document.querySelector("[data-review-modal-panel]")!.getBoundingClientRect();
          return {
            fitsLeft: b.left >= p.left - 0.5,
            fitsRight: b.right <= p.right + 0.5,
            w: b.width,
          };
        }, ownsId);
        expect(containment.fitsLeft).toBe(true);
        expect(containment.fitsRight).toBe(true);
        expect(containment.w).toBeGreaterThan(0); // non-vacuity: body visible
        // pane scroll tracking (±1px against the trigger). The scroller is
        // the card's own clipping ancestor — NOT `.overflow-y-auto:first`,
        // which at 300px matches the display:none `lg:flex` rail.
        const before = await page.evaluate(
          (args) => {
            const b = document.getElementById(args.id)!.getBoundingClientRect();
            const t = document
              .querySelector(
                `[data-testid="attention-banner-${args.alertId}"] button[aria-expanded="true"]`,
              )!
              .getBoundingClientRect();
            return b.top - t.bottom;
          },
          { id: ownsId, alertId },
        );
        await card.evaluate((el) => {
          const pane = el.closest(".overflow-y-auto");
          if (!pane) throw new Error("card has no scrolling ancestor pane");
          pane.scrollTop += 30;
        });
        // Poll to convergence (codex R2 F4): a loaded runner can take more
        // than one frame to run the coalesced rAF reposition.
        await expect
          .poll(
            () =>
              page.evaluate(
                (args) => {
                  const b = document.getElementById(args.id)!.getBoundingClientRect();
                  const t = document
                    .querySelector(
                      `[data-testid="attention-banner-${args.alertId}"] button[aria-expanded="true"]`,
                    )!
                    .getBoundingClientRect();
                  return Math.abs(b.top - t.bottom - args.before);
                },
                { id: ownsId, alertId, before },
              ),
            { timeout: 3_000 },
          )
          .toBeLessThanOrEqual(1);
      });
    });

    test("T8 panel-host: Tab cycle inside the trap reaches the Learn-more link and still wraps", async ({
      page,
    }) => {
      await withSeededAlert(async (alertId) => {
        await openModal(page, POPUP);
        const card = page.locator(`[data-testid="attention-banner-${alertId}"]`);
        await card.evaluate((el) => el.scrollIntoView({ block: "center" }));
        const trigger = card.locator("button[aria-expanded]").first();
        await clickOpenTrigger(page, trigger);
        // A full-cycle Tab walk is NOT viable here: focus-driven pane
        // auto-scroll shifts the card away from the resting mouse pointer,
        // Chrome recomputes hover, and the root's pointerleave schedules the
        // hover close — the popover is legitimately closed (hidden, out of
        // tab order) well before the walk reaches the panel's end. Instead,
        // prove the two §6-T8 claims surgically:
        //   (1) the learn-more link participates in native tab order INSIDE
        //       the panel (Tab from its DOM predecessor reaches it), and
        //   (2) the link is the trap's LAST focusable (the portal is the
        //       panel's last child), so Tab from it WRAPS inside the dialog
        //       instead of escaping to the document.
        const setup = await page.evaluate(() => {
          const panel = document.querySelector<HTMLElement>("[data-review-modal-panel]");
          if (!panel) throw new Error("panel missing");
          // Mirror lib/a11y/dialogFocus.ts FOCUSABLE_SELECTOR + offsetParent filter.
          const focusables = Array.from(
            panel.querySelectorAll<HTMLElement>(
              'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => el.offsetParent !== null);
          const idx = focusables.findIndex((el) =>
            /^Learn more about /.test(el.getAttribute("aria-label") ?? ""),
          );
          if (idx < 1) return { idx, total: focusables.length, linkIsLast: false };
          focusables[idx - 1]!.focus({ preventScroll: true });
          return { idx, total: focusables.length, linkIsLast: idx === focusables.length - 1 };
        });
        expect(setup.idx, "learn-more link not in the panel's focusable list").toBeGreaterThan(0);
        expect(setup.linkIsLast, "portaled link is the trap's last focusable").toBe(true);
        const activeIdentity = () =>
          page.evaluate(() => {
            const el = document.activeElement;
            const panel = document.querySelector("[data-review-modal-panel]");
            return {
              id: el
                ? `${el.tagName}:${el.getAttribute("aria-label") ?? el.getAttribute("data-testid") ?? el.tagName}`
                : "none",
              insidePanel: !!(el && panel && panel.contains(el)),
            };
          });
        await page.keyboard.press("Tab"); // predecessor → link (native order)
        const onLink = await activeIdentity();
        expect(onLink.id).toMatch(/^A:Learn more about /);
        await page.keyboard.press("Tab"); // link is trap-last → wraps inside the dialog
        const wrapped = await activeIdentity();
        expect(
          wrapped.insidePanel,
          `Tab from the link escaped the trap (landed on ${wrapped.id})`,
        ).toBe(true);
        expect(wrapped.id).not.toMatch(/^A:Learn more about /); // it moved
        // Trap-LIVENESS discriminator (codex R2 F1): with the background inert
        // and the modal at the end of document.body, NATIVE tab-wrap can mimic
        // a working trap for the insidePanel assertion above. A synthetic
        // cancelable Tab gets NO native default action from the browser, so
        // defaultPrevented===true can ONLY come from the trap's own keydown
        // listener on the LIVE panel node (i.e. the useDialogFocus reattachKey
        // wiring survived the mounted portal move). The wrap above landed
        // focus on the trap's FIRST focusable, so probe the Shift+Tab
        // boundary branch (active===first -> preventDefault + last.focus()).
        const trapActed = await page.evaluate(() => {
          const active = document.activeElement;
          if (!active) return false;
          const ev = new KeyboardEvent("keydown", {
            key: "Tab",
            shiftKey: true,
            bubbles: true,
            cancelable: true,
          });
          active.dispatchEvent(ev);
          return ev.defaultPrevented;
        });
        expect(trapActed, "trap keydown listener is attached to the live panel").toBe(true);
      });
    });
  });
});
