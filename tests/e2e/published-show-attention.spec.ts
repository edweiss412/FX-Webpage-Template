/**
 * tests/e2e/published-show-attention.spec.ts
 * (published-show-alerts spec §5/§6/§9 — plan Task 8 real-browser coverage)
 *
 * The attention surface against the REAL app: seeded show + two unresolved
 * admin_alerts (one crew-routed ROLE_FLAGS_NOTICE naming a seeded roster
 * member, one overview-routed code). Covers auto-open on arrival, menu row
 * click → scroll+flash into the scroller viewport, in-row crew banner
 * placement, Esc semantics (menu first, modal second — the capture-phase
 * contract), click-outside, and the optimistic resolve lifecycle
 * (2 to confirm → 1 to confirm → In sync) without a reload.
 *
 * Serial: the resolve test mutates admin_alerts, so it runs LAST and the
 * earlier tests are read-only.
 *
 * Runs in the default playwright.config.ts (desktop-chromium project).
 */
import { test, expect, type Page } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { seedShowWithCrew, deleteSeededShow, type SeededShow } from "./helpers/seedShowWithCrew";
import { settleDashboardAdminState } from "./helpers/dashboardState";

const BASE = "published-show-review";
const MODAL_ANY = `[data-testid="${BASE}-modal"]`;
const MODAL = `${MODAL_ANY}:has([data-testid="${BASE}-title"])`;
const PILL = `${MODAL} [data-testid="${BASE}-alert-pill"]`;
const MENU = `${MODAL} [data-testid="${BASE}-attention-menu"]`;

const SEED_TITLE = "Attention Surface E2E Show";
const CREW_NAME = "Alice Cooper";
// Crew-routed and actionable.
//
// NOT `ROLE_FLAGS_NOTICE`, which this fixture used until warning-surface-trim
// §5: it is an info-severity member of `DOUG_EXCLUDED_CODES`
// (lib/adminAlerts/audience.ts:34) and no longer reaches the modal's attention
// surface, by the ratified intent of `2026-07-04-alert-audience-split` §3.
//
// IN-ROW PLACEMENT, re-activated by warning-trim-undefer §6.3: the crew banner
// no longer depends on a name-keyed `crewKey` (still null here without a
// `crewName`). AMBIGUOUS_EMAIL_BINDING now derives an id-keyed `crewMatch` from
// `context.crew_member_ids`, and the placement layer fans the banner INTO each
// rendered roster row whose id matches (all-or-nothing; else one section-top
// banner). The base seed below carries NO `crew_member_ids` (section-top, as the
// sibling scroll/resolve tests expect); the fan-out test seeds the ids itself and
// restores the base context so serial order is unaffected.
const CREW_CODE = "AMBIGUOUS_EMAIL_BINDING";
// Not in the production registry → overview fallback route; unknown codes are
// actionable by classification (not inbox-routed, not auto-resolving) — the
// same seed code the deeplink suite uses.
const OVERVIEW_CODE = "SYNC_DELAYED_SEVERE";

let show: SeededShow;
let crewAlertId: string;
let overviewAlertId: string;
let restoreDashboardState: (() => Promise<void>) | null = null;

async function seedAlert(code: string, context: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin
    .from("admin_alerts")
    .insert({ show_id: show.showId, code, context, raised_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error || !data) throw new Error(`attention spec alert seed failed: ${error?.message}`);
  return data.id as string;
}

async function openModal(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/admin?show=${show.slug}`);
  await expect(page.locator(MODAL)).toBeVisible({ timeout: 30_000 });
}

test.describe.configure({ mode: "serial" });

test.describe("published show attention surface (spec §5/§6)", () => {
  test.beforeAll(async () => {
    restoreDashboardState = await settleDashboardAdminState();
    show = await seedShowWithCrew({
      title: SEED_TITLE,
      crew: [
        { name: CREW_NAME, role: "A1", email: "alice@fxav.test" },
        { name: "Bob Fields", role: "V2", email: "bob@fxav.test" },
      ],
    });
    // Identity-map shape for AMBIGUOUS_EMAIL_BINDING (show name, email, crew
    // count — lib/adminAlerts/alertIdentityMap.ts:60). It carries no "Crew"
    // segment, so `crewName` is null and the item routes to `crew` WITHOUT a
    // `crewKey`; see the CREW_CODE note above.
    crewAlertId = await seedAlert(CREW_CODE, {
      email: "alice@fxav.test",
      crew_member_count: 2,
    });
    overviewAlertId = await seedAlert(OVERVIEW_CODE, {});
  });

  test.afterAll(async () => {
    if (show) {
      const { error } = await admin.from("admin_alerts").delete().eq("show_id", show.showId);
      if (error) throw new Error(`attention spec cleanup failed: ${error.message}`);
      await deleteSeededShow(show.driveFileId);
    }
    if (restoreDashboardState) await restoreDashboardState();
  });

  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  test("auto-open on arrival: menu visible with both actionable rows; pill reads '2 to confirm'", async ({
    page,
  }) => {
    await openModal(page);
    await expect(page.locator(MENU)).toBeVisible();
    await expect(page.locator(PILL)).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(`${MENU} [data-testid^="attention-menu-row-"]`)).toHaveCount(2);
    const visible = await page.locator(PILL).evaluate((el) => {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.sr-only, [aria-hidden="true"]').forEach((n) => n.remove());
      return clone.textContent!.replace(/\s+/g, " ").trim();
    });
    expect(visible).toBe("2 to confirm");
  });

  // Un-skipped by warning-trim-undefer §6.3/§6.4: id-matched fan-out. Seeds the
  // two roster ids onto the crew alert so it fans into BOTH rows, asserts in-row
  // (not section-top) placement, then re-seeds with one id absent to prove the
  // section-top fallback. Restores the base context in `finally` so the sibling
  // scroll/resolve tests (which run after, serial) see the original section-top.
  test("crew banner fans out INSIDE each matched roster row's <li>, id-matched (spec §6.3)", async ({
    page,
  }) => {
    const aliceId = show.crew[0]!.id;
    const bobId = show.crew[1]!.id;
    const ABSENT_ID = "00000000-0000-4000-8000-0000000000ff";
    const setCrewContext = async (context: Record<string, unknown>) => {
      const { error } = await admin.from("admin_alerts").update({ context }).eq("id", crewAlertId);
      if (error) throw new Error(`fan-out context update failed: ${error.message}`);
    };
    const bannerLoc = () =>
      page.locator(`${MODAL} [data-testid="attention-banner-${crewAlertId}"]`);
    try {
      // ── Fan-out: both involved ids match rendered rows → one banner per row.
      await setCrewContext({ email: "alice@fxav.test", crew_member_ids: [aliceId, bobId] });
      await openModal(page);
      const banners = bannerLoc();
      await expect(banners).toHaveCount(2);
      const placements = await banners.evaluateAll((els) =>
        els.map((el) => {
          const li = el.closest("li");
          const rowContent = li?.firstElementChild ?? null;
          return {
            inLi: !!li,
            name: li?.textContent ?? "",
            belowRow: rowContent
              ? el.getBoundingClientRect().top >= rowContent.getBoundingClientRect().bottom - 0.5
              : false,
          };
        }),
      );
      // EACH banner is inside a roster <li>, below the row content (so NONE at
      // section-top, which renders outside the <ul>); the two host rows name the
      // two involved members.
      expect(placements.every((p) => p.inLi && p.belowRow)).toBe(true);
      const names = placements.map((p) => p.name);
      expect(names.some((n) => n.includes(CREW_NAME))).toBe(true); // Alice Cooper
      expect(names.some((n) => n.includes("Bob Fields"))).toBe(true);

      // ── Fallback: one involved id absent from the roster → one section-top banner.
      await setCrewContext({ email: "alice@fxav.test", crew_member_ids: [aliceId, ABSENT_ID] });
      await openModal(page);
      await expect(bannerLoc()).toHaveCount(1);
      const atSectionTop = await bannerLoc().evaluate((el) => el.closest("li") === null);
      expect(atSectionTop, "unmatched fan-out renders one section-top banner").toBe(true);
    } finally {
      // Restore the base section-top context for the serial siblings that follow.
      await setCrewContext({ email: "alice@fxav.test", crew_member_count: 2 });
    }
  });

  // Retitled: without a `crewKey` the anchor is the CREW SECTION rather than a
  // roster row (lib/admin/attentionItems.ts:257). The scroll + one-shot flash
  // contract this test owns is unchanged; only the anchor's granularity is.
  test("menu row click → menu closes, scroller lands on the crew anchor, one-shot flash fires and clears", async ({
    page,
  }) => {
    await openModal(page);
    await page.locator(`${MENU} [data-testid="attention-menu-row-alert:${crewAlertId}"]`).click();
    await expect(page.locator(MENU)).toHaveCount(0);
    const anchorSel = `${MODAL} [data-attention-anchor="alert:${crewAlertId}"]`;
    // Flash present promptly after the jump…
    await expect(page.locator(`${anchorSel}[data-step3-warning-flash]`)).toHaveCount(1, {
      timeout: 2_000,
    });
    // …anchor inside the scroller viewport once the glide settles…
    const inViewport = await page.locator(anchorSel).evaluate((el, dfid) => {
      const scroller = document.querySelector(
        `[data-testid="wizard-step3-card-${dfid}-review-content"]`,
      )!;
      const s = scroller.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      return b.top >= s.top - 0.5 && b.top < s.bottom;
    }, show.driveFileId);
    expect(inViewport, "banner top inside the scroller viewport").toBe(true);
    // …and the one-shot flash clears after WARNING_HIGHLIGHT_MS (1600ms).
    await expect(page.locator(`${anchorSel}[data-step3-warning-flash]`)).toHaveCount(0, {
      timeout: 4_000,
    });
  });

  test("Esc closes the MENU first (modal stays), second Esc closes the modal", async ({ page }) => {
    await openModal(page);
    await expect(page.locator(MENU)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(MENU)).toHaveCount(0);
    await expect(page.locator(MODAL)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(MODAL_ANY)).toHaveCount(0, { timeout: 10_000 });
  });

  test("click outside closes the menu; the pill toggles it back open", async ({ page }) => {
    await openModal(page);
    await expect(page.locator(MENU)).toBeVisible();
    await page.locator(`${MODAL} [data-testid="${BASE}-title"]`).click();
    await expect(page.locator(MENU)).toHaveCount(0);
    await page.locator(PILL).click();
    await expect(page.locator(MENU)).toBeVisible();
  });

  test("resolve lifecycle: 2 to confirm → 1 to confirm → In sync, without reload (LAST — mutates)", async ({
    page,
  }) => {
    await openModal(page);
    // Dismiss the auto-opened menu so it never overlaps the Overview banner.
    // ORDER MATTERS: wait for the menu to actually mount first — an Escape
    // fired before the auto-open effect runs hits the SHELL's document
    // listener instead and closes the whole modal (the §5.2 capture contract
    // only applies while the menu is open).
    await expect(page.locator(MENU)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(MENU)).toHaveCount(0);
    await expect(page.locator(MODAL)).toBeVisible();
    // "Without reload" is load-bearing: stamp a window sentinel now — a full
    // document reload (or navigation) would wipe it, so the final assertion
    // proves the whole lifecycle ran in ONE document.
    await page.evaluate(() => {
      (window as unknown as { __attnNoReload?: boolean }).__attnNoReload = true;
    });
    // Resolve the overview banner first. The pill is the durable signal: the
    // optimistic decrement fires immediately and the router.refresh()
    // reconcile (which unmounts the transient "✓ Confirmed" swap) converges on
    // the SAME count — asserting the pill covers both phases without racing
    // the refresh. (The Confirmed swap itself is pinned in jsdom.)
    await page
      .locator(`${MODAL} [data-testid="per-show-alert-resolve-${overviewAlertId}"]`)
      .click();
    await expect(page.locator(PILL)).toContainText("1 to confirm");
    // The resolved item's actionable affordance is gone (either Confirmed swap
    // or reconciled unmount — never a still-clickable resolve button).
    await expect(
      page.locator(`${MODAL} [data-testid="per-show-alert-resolve-${overviewAlertId}"]`),
    ).toHaveCount(0);
    // Then the crew banner — deep in the Crew section. Center it in the INNER
    // scroller first: Playwright's auto-scroll can park it at the pane's top
    // edge under the sticky header band, where the hit-test never succeeds.
    await page
      .locator(`${MODAL} [data-attention-anchor="alert:${crewAlertId}"]`)
      .evaluate((el, dfid) => {
        const scroller = document.querySelector<HTMLElement>(
          `[data-testid="wizard-step3-card-${dfid}-review-content"]`,
        )!;
        const s = scroller.getBoundingClientRect();
        const b = el.getBoundingClientRect();
        scroller.scrollTop += b.top - s.top - s.height / 2;
      }, show.driveFileId);
    await page.locator(`${MODAL} [data-testid="per-show-alert-resolve-${crewAlertId}"]`).click();
    await expect(page.locator(PILL)).toContainText("In sync");
    await expect(
      page.locator(`${MODAL} [data-testid="per-show-alert-resolve-${crewAlertId}"]`),
    ).toHaveCount(0);
    // The sentinel survived → no document reload anywhere in the lifecycle.
    expect(
      await page.evaluate(() => (window as unknown as { __attnNoReload?: boolean }).__attnNoReload),
      "resolve lifecycle must not reload the document",
    ).toBe(true);
  });
});
