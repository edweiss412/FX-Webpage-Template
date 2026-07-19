/**
 * tests/e2e/published-review-modal.prefetch.spec.ts
 * (spec docs/superpowers/specs/2026-07-19-show-modal-prefetch.md §6)
 *
 * PROD-SERVER-ONLY (MODAL_PREFETCH_E2E=1): Next disables Link prefetch in dev,
 * so these assertions are meaningful only against a `pnpm build && pnpm start`
 * server — locally that means booting :3000 as a prod artifact (see the plan's
 * Task 3 Step 3); in CI, published-modal-e2e.yml's :3000 webServer already is
 * one (CI=true → build && start).
 *
 * Network-assertion posture (spec §3.4, ratified): presence/boundedness only.
 * Exact refresh-once lives in the unit test (publishedReviewModal.test.tsx).
 */
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";
import { seedShowWithCrew, deleteSeededShow, type SeededShow } from "./helpers/seedShowWithCrew";
import { settleDashboardAdminState } from "./helpers/dashboardState";

const BASE = "published-show-review";
const MODAL_ANY = `[data-testid="${BASE}-modal"]`;
const MODAL = `${MODAL_ANY}:has([data-testid="${BASE}-title"])`;
const CLOSE = `[data-testid="${BASE}-close"]`;
const POPUP = { width: 1280, height: 800 };

// Spec §6.3(b): cache open (0 nav) + refresh + one re-warm probe/twin pair.
// A per-render storm produces dozens; 4 is the documented ceiling.
const OPEN_SLUG_REQUEST_BOUND = 4;
const PREFETCH_SETTLE_MS = 4_000;
const POST_OPEN_WINDOW_MS = 5_000;

test.skip(
  process.env.MODAL_PREFETCH_E2E !== "1",
  "prod-server-only: Link prefetch is inert on the local dev :3000 server",
);

let show: SeededShow;
let restoreDashboardState: (() => Promise<void>) | null = null;

test.describe("published review modal — prefetch + revalidate (prefetch spec §6)", () => {
  test.beforeAll(async () => {
    restoreDashboardState = await settleDashboardAdminState();
    show = await seedShowWithCrew({});
  });
  test.afterAll(async () => {
    if (show) await deleteSeededShow(show.driveFileId);
    await restoreDashboardState?.();
  });

  /** URL predicate: any RSC request addressing this slug's modal. */
  const isShowReq = (u: URL, slug: string) => u.searchParams.get("show") === slug;

  /** Copied from interactions.spec.ts:137-152 (file-local there): a
   *  pre-hydration row click is a full document navigation — no client nav, no
   *  router cache, no optimistic path — which would make every click-driven
   *  assertion here measure hydration timing instead of prefetch behavior. */
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

  async function loadDashboard(page: Page) {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(POPUP);
    await signInAs(page, ADMIN_FIXTURE);
    await page.goto("/admin");
    await expect(page.getByTestId(`shows-table-row-${show.slug}`)).toBeVisible({
      timeout: 30_000,
    });
    await waitForRowHydration(page, show.slug);
  }

  test("§6.1 dashboard load emits a viewport prefetch for a visible row before any click", async ({
    page,
  }) => {
    // Failure mode caught: prefetch={true} dropped/downgraded → NO ?show=<slug>
    // request exists before the click and this times out.
    const seen = page.waitForRequest((r) => isShowReq(new URL(r.url()), show.slug), {
      timeout: 15_000,
    });
    await loadDashboard(page);
    await seen;
  });

  test("§6.2 cache proof: loaded modal renders while every post-settle ?show request is HELD", async ({
    page,
  }) => {
    await loadDashboard(page);
    await page.waitForTimeout(PREFETCH_SETTLE_MS);
    // Hold (never fulfill) EVERY subsequent request for this slug — navigation
    // and refresh alike. Only a router-cache-served open can paint the loaded
    // modal now. Failure mode caught: silent prefetch downgrade → the click
    // becomes a cold navigation that blocks on the held route → only the
    // skeleton appears → the MODAL (title-bearing) wait times out.
    const held: Array<() => void> = [];
    await page.route(
      (u) => isShowReq(u, show.slug),
      async (route) => {
        await new Promise<void>((resolve) => held.push(resolve));
        await route.continue();
      },
    );
    await page.getByTestId(`shows-table-row-${show.slug}`).click();
    await expect(page.locator(MODAL)).toBeVisible({ timeout: 10_000 });
    for (const release of held) release();
  });

  test("§6.3 revalidate reaches the network post-click, bounded (no refresh storm)", async ({
    page,
  }) => {
    await loadDashboard(page);
    await page.waitForTimeout(PREFETCH_SETTLE_MS);
    const openSlugRequests: number[] = [];
    const t0 = Date.now();
    page.on("request", (r) => {
      if (isShowReq(new URL(r.url()), show.slug)) openSlugRequests.push(Date.now() - t0);
    });
    // Window anchored at CLICK time, not modal-visible time: the mount refresh
    // is only guaranteed to fire after React mount, which can precede the
    // Playwright visibility assertion resolving — an openAt anchor would race
    // a correct implementation into a false failure. A cache-served open
    // issues NO navigation request, so any post-click ?show=<slug> traffic is
    // revalidate/re-warm by construction (a silent prefetch downgrade instead
    // surfaces in the §6.2 cache proof, not here).
    const clickAt = Date.now() - t0;
    await page.getByTestId(`shows-table-row-${show.slug}`).click();
    await expect(page.locator(MODAL)).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(POST_OPEN_WINDOW_MS);
    const postClick = openSlugRequests.filter((t) => t >= clickAt);
    // (a) presence: the mount refresh reaches the network (dead-revalidate
    // detector — with a broken effect this array is empty);
    expect(postClick.length, "at least one post-click request (the refresh)").toBeGreaterThan(0);
    // (b) boundedness: a per-render refresh storm fires dozens in the window.
    expect(postClick.length, "no refresh storm").toBeLessThanOrEqual(OPEN_SLUG_REQUEST_BOUND);
  });

  /** Shared §6.4 scaffold: open with every post-settle ?show request HELD, then
   *  close, then hand the release decision to the case. EVERY ?show=<slug>
   *  request from pre-click onward is in the trap — the cache-served open
   *  issues no navigation, so whatever lands here arrives post-mount: the
   *  mount refresh (proved to fire by the unit oracle and §6.3's presence
   *  assertion) is necessarily AMONG the held requests when the case releases
   *  them; re-warm twins may be held alongside it, which only widens the
   *  release. held.length > 0 additionally proves the trap actually captured
   *  traffic (a release-of-nothing cannot pass). */
  async function openHeldThenClose(page: Page, motion: "reduce" | "no-preference") {
    await loadDashboard(page);
    await page.emulateMedia({ reducedMotion: motion });
    await page.waitForTimeout(PREFETCH_SETTLE_MS);
    const held: Array<() => void> = [];
    await page.route(
      (u) => isShowReq(u, show.slug),
      async (route) => {
        await new Promise<void>((resolve) => held.push(resolve));
        await route.continue();
      },
    );
    await page.getByTestId(`shows-table-row-${show.slug}`).click();
    await expect(page.locator(MODAL)).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => held.length, { timeout: 10_000 }).toBeGreaterThan(0);
    await page.locator(CLOSE).click();
    return held;
  }

  async function assertClosedForGood(page: Page) {
    await expect(page.locator(MODAL_ANY)).toHaveCount(0, { timeout: 5_000 });
    await expect
      .poll(() => new URL(page.url()).searchParams.has("show"), { timeout: 15_000 })
      .toBe(false);
    await page.waitForTimeout(1_000);
    await expect(page.locator(MODAL_ANY)).toHaveCount(0);
  }

  test("§6.4a close safety — refresh released DURING the animated exit (spec §3.2 case 1)", async ({
    page,
  }) => {
    // CLOSE MODEL (do not "fix" this to expect an instant URL strip): under
    // normal motion the shell's requestClose plays the exit and calls onClose
    // only at exit-END (transitionend, ReviewModalShell.tsx; reduced motion
    // short-circuits immediately) — PublishedReviewModal.handleClose (whose
    // "instant close" header comment predates #488) therefore pushes the
    // close URL ~220ms AFTER the click, so the URL check below runs inside
    // that window. Release immediately after the close click: the refreshed
    // payload for the OPEN URL lands mid-exit. Failure mode: the refresh
    // remounts/reshows the shell (resurrection) or restarts the exit.
    const held = await openHeldThenClose(page, "no-preference");
    expect(new URL(page.url()).searchParams.get("show"), "URL still open mid-exit").toBe(show.slug);
    for (const release of held) release();
    await assertClosedForGood(page);
  });

  test("§6.4b close safety — refresh released after the VISUAL close, before the URL commit (spec §3.2 case 2)", async ({
    page,
  }) => {
    // Empirical router constraint (first gated run of this spec): the app
    // router SERIALIZES actions — the close `push` queues behind the held
    // refresh, so "release only after the URL strips" is unconstructible (the
    // strip itself waits on the release; the original formulation deadlocked).
    // The constructible — and stronger — case-2 ordering: the exit finishes and
    // the shell unmounts CLIENT-SIDE while the URL still says ?show and the
    // refresh is still held; releasing then lets the refreshed OPEN-URL payload
    // apply against a visually-closed modal, followed by the queued close
    // commit. Failure mode: that payload re-showing the shell (resurrection).
    const held = await openHeldThenClose(page, "no-preference");
    // Visual close completes while the trap is shut and the URL is still open.
    await expect(page.locator(MODAL_ANY)).toHaveCount(0, { timeout: 5_000 });
    expect(new URL(page.url()).searchParams.get("show"), "URL commit still pending").toBe(
      show.slug,
    );
    for (const release of held) release();
    await assertClosedForGood(page);
  });

  test("§6.4c close safety — reduced motion (spec §3.2 case 3)", async ({ page }) => {
    // Instant close (exit collapsed): case 1 degenerates into case 2.
    const held = await openHeldThenClose(page, "reduce");
    for (const release of held) release();
    await assertClosedForGood(page);
  });
});
