/**
 * tests/e2e/needs-attention-page.spec.ts (mobile needs-attention Task 9 — plan §Task 9)
 *
 * Navigation-flow + badge-freshness e2e for the /admin/needs-attention page
 * and the mobile Attention tab (spec §4.2/§4.3). Same harness as
 * admin-nav-layout-dimensions.spec.ts: signInAs(ADMIN_FIXTURE) + service-role
 * seeding of pending_syncs / pending_ingestions with pre-clean + cleanup.
 *
 * Flows (mobile viewport 390×844 unless stated):
 *   1. tap summary card on /admin → lands on /admin/needs-attention, seeded
 *      inbox items render
 *   2. from /admin/settings, tap the Attention tab → page renders; tab has
 *      aria-current="page"
 *   3. badge text equals seeded pending count (3 → "3"; 12 → "9+")
 *   4. soft-nav freshness (spec test 11): /admin with N rows (badge "N"),
 *      insert one more server-side, CLIENT-SIDE navigate via tab tap (no
 *      reload — pinned via a window marker that a full load would wipe) →
 *      badge shows N+1 (useNeedsAttentionBadge pathname-change refetch)
 *   5. same-route freshness (spec test 11b): on /admin/needs-attention,
 *      Discard a seeded pending-ingestion (PendingPanelDiscardButtons
 *      permanent_ignore → router.refresh(), NO navigation) → badge decrements
 *      with the URL unchanged and the window marker intact
 *   6. desktop spot-check (1280×800): page.goto renders the page directly (no
 *      redirect); topbar has no Attention link (spec D-2)
 *
 * Concrete failure modes caught: badge rendered from a stale layout prop
 * after soft navigation (flow 4); badge not re-rendering on the
 * router.refresh() prop path (flow 5); summary card / tab wiring to a wrong
 * route; the page being desktop-redirected (flow 6).
 *
 * Requires the e2e env (server on :3000 with TEST_DATABASE_URL → local
 * Supabase + seeded DB). Pending fixtures are namespaced by drive_file_id
 * prefix and pre-cleaned per test (clean seed has 0 pending rows).
 */
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { admin } from "./helpers/supabaseAdmin";

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

// Namespace every fixture drive_file_id so pre-clean/cleanup can never touch
// other suites' rows (mirrors the supabase/seed.ts prefix-delete idiom).
const FIXTURE_PREFIX = "e2e-needs-attention-page-";

// Deterministic staged ids for pending_syncs rows (hex-safe decimal suffix).
function syncStagedId(n: number): string {
  return `55555555-5555-4555-8555-${String(n).padStart(12, "0")}`;
}

// Deterministic pending_ingestions id → the Discard button testid is
// admin-pending-ignore-<id> (PendingPanelDiscardButtons.tsx:89).
const INGESTION_ID = "66666666-6666-4666-8666-666666666666";
const INGESTION_DRIVE_FILE_ID = `${FIXTURE_PREFIX}ingestion-1`;

/**
 * Seed `count` pending_syncs rows (wizard_session_id NULL → counted by
 * loadNeedsAttentionCount and rendered as first_seen cards — the drive ids
 * match no show). Shape mirrors the admin-nav-layout-dimensions badge
 * fixture insert.
 */
async function seedSyncRows(count: number, startAt = 1): Promise<void> {
  const rows = Array.from({ length: count }, (_, i) => {
    const n = startAt + i;
    return {
      drive_file_id: `${FIXTURE_PREFIX}sync-${n}`,
      staged_id: syncStagedId(n),
      staged_modified_time: "2026-06-10T12:00:00.000Z",
      base_modified_time: null,
      parse_result: { show: { title: `Needs-attention e2e sync fixture ${n}` } },
      triggered_review_items: [{ id: `needs-attention-e2e-${n}`, invariant: "FIRST_SEEN_REVIEW" }],
      source_kind: "cron",
      warning_summary: "needs-attention page e2e fixture",
    };
  });
  const { error } = await admin.from("pending_syncs").insert(rows);
  if (error) throw new Error(`pending_syncs fixture insert failed: ${error.message}`);
}

/**
 * Seed one live pending_ingestions row that renders with Retry/Discard
 * buttons (NeedsAttentionInbox pending_ingestion variant). last_error_code is
 * a real catalog code (SHEET_PROCESS_FAILED) so the card copy resolves
 * normally; last_seen_modified_time satisfies the discard route's
 * defer-kind guard even though the test uses permanent_ignore.
 */
async function seedIngestionRow(): Promise<void> {
  const { error } = await admin.from("pending_ingestions").insert({
    id: INGESTION_ID,
    drive_file_id: INGESTION_DRIVE_FILE_ID,
    drive_file_name: "Needs-attention e2e ingestion fixture.xlsx",
    last_error_code: "SHEET_PROCESS_FAILED",
    last_error_message: "needs-attention page e2e fixture",
    last_seen_modified_time: "2026-06-10T12:00:00.000Z",
    wizard_session_id: null,
  });
  if (error) throw new Error(`pending_ingestions fixture insert failed: ${error.message}`);
}

/**
 * Remove every fixture row this spec can produce. Also clears the
 * deferred_ingestions row the discard route upserts (permanent_ignore) so
 * reruns start clean. Runs as pre-clean (residue from aborted runs) AND as
 * afterEach cleanup.
 */
async function cleanupFixtures(): Promise<void> {
  for (const table of ["pending_syncs", "pending_ingestions", "deferred_ingestions"] as const) {
    const { error } = await admin.from(table).delete().like("drive_file_id", `${FIXTURE_PREFIX}%`);
    if (error) throw new Error(`${table} fixture cleanup failed: ${error.message}`);
  }
}

/**
 * Plant a window marker that survives ONLY client-side (soft) navigation —
 * a full document load wipes it. The freshness flows assert it afterward so
 * the badge update cannot be satisfied by an accidental hard reload.
 */
async function plantSoftNavMarker(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__needsAttentionE2eMarker = true;
  });
}

async function softNavMarkerSurvived(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (window as unknown as Record<string, unknown>).__needsAttentionE2eMarker === true,
  );
}

test.describe("needs-attention page: navigation flows + badge freshness", () => {
  test.beforeEach(async ({ page }) => {
    await cleanupFixtures(); // pre-clean residue from earlier aborted runs
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  test.afterEach(async () => {
    await cleanupFixtures();
  });

  test("flow 1: summary card tap on /admin lands on the page with seeded items", async ({
    page,
  }) => {
    await seedSyncRows(2);
    await page.setViewportSize(MOBILE);
    await page.goto("/admin");

    const card = page.getByTestId("needs-attention-summary-card");
    await expect(card).toBeVisible();
    await card.click();

    await expect(page).toHaveURL(/\/admin\/needs-attention$/);
    await expect(page.getByTestId("admin-needs-attention-page")).toBeVisible();
    // Both seeded rows render as first_seen inbox cards on the page.
    await expect(
      page.getByTestId(`needs-attention-item-first-seen-${syncStagedId(1)}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`needs-attention-item-first-seen-${syncStagedId(2)}`),
    ).toBeVisible();
  });

  test("flow 2: Attention tab from /admin/settings renders the page with aria-current", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/admin/settings");

    const attentionTab = page.getByTestId("admin-bottom-tab-attention");
    await expect(attentionTab).toBeVisible();
    // On settings the attention tab is NOT current.
    await expect(attentionTab).not.toHaveAttribute("aria-current", "page");
    await attentionTab.click();

    await expect(page).toHaveURL(/\/admin\/needs-attention$/);
    await expect(page.getByTestId("admin-needs-attention-page")).toBeVisible();
    await expect(page.getByTestId("admin-bottom-tab-attention")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test('flow 3: badge text equals seeded pending count (3 → "3"; 12 → "9+")', async ({ page }) => {
    await page.setViewportSize(MOBILE);

    await seedSyncRows(3);
    await page.goto("/admin");
    await expect(page.getByTestId("admin-attention-badge")).toHaveText("3");

    // Grow the seed to 12 (9 more rows) → the badge caps at "9+".
    await seedSyncRows(9, 4);
    await page.reload();
    await expect(page.getByTestId("admin-attention-badge")).toHaveText("9+");
  });

  test("flow 4 (spec test 11): soft-nav tab tap refetches the badge count — no reload", async ({
    page,
  }) => {
    await seedSyncRows(2);
    await page.setViewportSize(MOBILE);
    await page.goto("/admin");
    await expect(page.getByTestId("admin-attention-badge")).toHaveText("2");

    // Server-side mutation AFTER first paint: the layout prop still says 2.
    await seedSyncRows(1, 3);
    await plantSoftNavMarker(page);

    // Client-side navigate via the settings tab (Next <Link> soft nav).
    await page.getByTestId("admin-bottom-tab-settings").click();
    await expect(page).toHaveURL(/\/admin\/settings$/);

    // Pathname change → useNeedsAttentionBadge refetches
    // /api/admin/needs-attention-count → badge shows the NEW count.
    await expect(page.getByTestId("admin-attention-badge")).toHaveText("3", { timeout: 10_000 });
    // The marker survived → this was a soft navigation, not a full reload
    // (a reload would also deliver a fresh layout prop, making the
    // assertion above tautological).
    expect(await softNavMarkerSurvived(page), "tab tap must be a client-side navigation").toBe(
      true,
    );
  });

  test("flow 5 (spec test 11b): Discard on the page decrements the badge without navigation", async ({
    page,
  }) => {
    // 1 pending_ingestion + 1 pending_sync → badge "2"; discarding the
    // ingestion leaves "1" (decrement stays VISIBLE instead of vanishing
    // at 0, which would also pass for a badge that merely unmounted).
    await seedIngestionRow();
    await seedSyncRows(1);
    await page.setViewportSize(MOBILE);
    await page.goto("/admin/needs-attention");

    await expect(page.getByTestId("admin-attention-badge")).toHaveText("2");
    const pendingCard = page.getByTestId(`needs-attention-item-pending-${INGESTION_ID}`);
    await expect(pendingCard).toBeVisible();
    const urlBefore = page.url();
    await plantSoftNavMarker(page);

    // Discard (permanent_ignore — deterministic: no Drive/parser round-trip).
    const [discardResponse] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes(`/api/admin/pending-ingestions/${INGESTION_ID}/discard`) &&
          res.request().method() === "POST",
      ),
      page.getByTestId(`admin-pending-ignore-${INGESTION_ID}`).click(),
    ]);
    expect(discardResponse.ok(), "discard POST must succeed").toBe(true);

    // router.refresh() path: same route, layout re-render delivers the new
    // count as a prop (useNeedsAttentionBadge prop-sync source).
    await expect(pendingCard).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByTestId("admin-attention-badge")).toHaveText("1", { timeout: 10_000 });
    // No navigation happened: URL unchanged AND the window marker survived
    // (router.refresh() preserves client state; a redirect/reload would not).
    expect(page.url(), "URL must be unchanged after discard").toBe(urlBefore);
    expect(await softNavMarkerSurvived(page), "discard must not navigate or reload").toBe(true);
  });

  test("flow 6: desktop spot-check — direct load renders the page; topbar has no Attention link", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/admin/needs-attention");

    // No redirect: the page renders at its own URL on desktop.
    await expect(page).toHaveURL(/\/admin\/needs-attention$/);
    await expect(page.getByTestId("admin-needs-attention-page")).toBeVisible();

    // Spec D-2: desktop nav unchanged — no topbar link to the page.
    const topbar = page.getByTestId("admin-nav-topbar");
    await expect(topbar).toBeVisible();
    await expect(topbar.locator('a[href="/admin/needs-attention"]')).toHaveCount(0);
  });
});
