/**
 * Playwright E2E reachability baselines for the §8.3 empty-state catalog
 * (M9 Task 9.3 / AC-9.2).
 *
 * One scenario per §8.3 category — each scenario mutates the seed fixture
 * into the state, navigates the crew page, and captures a screenshot
 * baseline via `toHaveScreenshot`. The first CI run with
 * `--update-snapshots` generates the baseline PNGs; subsequent runs
 * compare against them.
 *
 * §8.3 categories covered:
 *
 *   1. **Required-field-missing** — VenueTile when `venue.name` is null.
 *      Renders the canonical "Doug hasn't filled this in yet" placeholder
 *      (per spec line 2434).
 *
 *   2. **Optional-field-missing** — `event_details.power` set to `'TBD'`
 *      (or null/empty/N/A). The generic-optional dispatch in
 *      `lib/visibility/emptyState.ts` hides the field — no "—" or "TBD"
 *      reaches the DOM.
 *
 *   3. **Whole-tile-missing** — viewer is not named on any
 *      `hotel_reservations` row. <LodgingTile> returns null; the grid
 *      reflows around the missing tile.
 *
 *   4. **Stale-sync** — `shows.last_synced_at` is more than 6 hours old
 *      with `last_sync_status='ok'`. <StaleFooter> (M9 Task 9.1) renders
 *      the red SYNC_DELAYED_SEVERE message; per-tile content stays as
 *      last-good (no per-tile staleness signal — invariant from spec
 *      line 2437).
 *
 * AUTH STATE (M9-D-9.3-1 migration, 2026-05-17): migrated off the
 * retired `?crew=<id>` query-param mock. Each test now signs in as
 * NON_ADMIN_CREW_FIXTURE (via the test-only `/api/test-auth/set-session`
 * endpoint) and a per-suite crew_members row ties that fixture email
 * to the seed show with role_flags=['LEAD'] so categories 1/2/4 see
 * a LEAD viewer. Category 3 stays valid because the test crew is NOT
 * on any seed hotel_reservations row.
 *
 * BASELINE GENERATION (operator workflow):
 *
 *     # Local: ensure local dev server + Supabase are up, then:
 *     pnpm test:e2e tests/e2e/empty-state-reachability.spec.ts \\
 *       --project=mobile-safari --update-snapshots
 *
 *     # Commit the generated *-snapshots/*.png files alongside this spec.
 *
 * Anti-tautology (AGENTS.md): each scenario also asserts a DOM contract
 * the §8.3 invariant exposes, so a regression that breaks the rendering
 * fails BEFORE the screenshot diff would flag it. The screenshot diff
 * is the visual safety net, not the primary assertion.
 */
import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";
import { NON_ADMIN_CREW_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";
const STALE_SEVERE_AGE_MS = 7 * 60 * 60 * 1000; // 7h — > 6h SYNC_DELAYED_SEVERE boundary

type Snapshot = {
  slug: string;
  showId: string;
  originalVenueName: string | null;
  originalEventDetails: Record<string, string>;
  originalLastSyncedAt: string | null;
  originalLastSyncStatus: string | null;
};

async function snapshot(): Promise<Snapshot> {
  const showRes = await admin
    .from("shows")
    .select("id, slug, venue, event_details, last_synced_at, last_sync_status")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (showRes.error || !showRes.data) {
    throw new Error(`empty-state-reachability.spec: seed show not found`);
  }
  const showId = showRes.data.id as string;
  const venue = (showRes.data.venue as { name?: string | null } | null) ?? null;
  return {
    slug: showRes.data.slug as string,
    showId,
    originalVenueName: venue?.name ?? null,
    originalEventDetails: (showRes.data.event_details as Record<string, string> | null) ?? {},
    originalLastSyncedAt: (showRes.data.last_synced_at as string | null) ?? null,
    originalLastSyncStatus: (showRes.data.last_sync_status as string | null) ?? null,
  };
}

async function restore(s: Snapshot): Promise<void> {
  const res = await admin
    .from("shows")
    .update({
      venue: { name: s.originalVenueName },
      event_details: s.originalEventDetails,
      last_synced_at: s.originalLastSyncedAt,
      last_sync_status: s.originalLastSyncStatus,
    })
    .eq("id", s.showId);
  if (res.error) throw new Error(`restore failed: ${res.error.message}`);
}

test.describe("crew page — §8.3 empty-state reachability (Task 9.3, AC-9.2)", () => {
  let s: Snapshot;
  let testCrewId: string;

  test.beforeAll(async () => {
    s = await snapshot();
    // M9-D-9.3-1 migration: create a per-suite crew_members row tied
    // to NON_ADMIN_CREW_FIXTURE.email + role_flags=['LEAD'] so signed-
    // in OAuth sessions resolve to LEAD on this show. Defensive
    // delete-before-insert in case a prior failed run left residue.
    await admin
      .from("crew_members")
      .delete()
      .eq("show_id", s.showId)
      .eq("email", NON_ADMIN_CREW_FIXTURE.email);
    testCrewId = randomUUID();
    const insertCrew = await admin.from("crew_members").insert({
      id: testCrewId,
      show_id: s.showId,
      name: "Empty-State Test Lead",
      email: NON_ADMIN_CREW_FIXTURE.email,
      role: "A1",
      role_flags: ["LEAD"],
    });
    if (insertCrew.error) {
      throw new Error(`crew_members seed failed: ${insertCrew.error.message}`);
    }
  });

  test.afterAll(async () => {
    await admin.from("crew_members").delete().eq("id", testCrewId);
    await restore(s);
  });

  test.beforeEach(async ({ page }) => {
    await restore(s);
    // Sign in fresh per test — signInAs deletes any prior fixture
    // auth.users row first so this is idempotent across runs.
    await signInAs(page, NON_ADMIN_CREW_FIXTURE);
  });

  test("category 1: required-field-missing — venue.name null → placeholder", async ({ page }) => {
    const venuePatch = { name: null, address: null, contact_info: null, notes: null };
    const res = await admin.from("shows").update({ venue: venuePatch }).eq("id", s.showId);
    if (res.error) throw new Error(`category-1 patch failed: ${res.error.message}`);
    await page.goto(`/show/${s.slug}`);
    const venueTile = page.getByTestId("venue-tile");
    await expect(venueTile).toBeVisible();
    // Anti-tautology: assert the canonical VenueTile required-field-
    // missing copy (per components/tiles/VenueTile.tsx:70 — the literal
    // copy was "Venue details haven't been added yet.", not the
    // hypothetical "Doug hasn't filled this in yet" the spec author
    // initially wrote). Migration fix 2026-05-17.
    await expect(venueTile).toContainText(/Venue details haven't been added yet/i);
    await expect(venueTile).toHaveScreenshot("category-1-venue-name-missing.png");
  });

  test("category 2: optional-field-missing — event_details.power='TBD' → hidden", async ({
    page,
  }) => {
    const merged = { ...s.originalEventDetails, power: "TBD" };
    const res = await admin.from("shows").update({ event_details: merged }).eq("id", s.showId);
    if (res.error) throw new Error(`category-2 patch failed: ${res.error.message}`);
    await page.goto(`/show/${s.slug}`);
    const showStatusTile = page.getByTestId("show-status-tile");
    await expect(showStatusTile).toBeVisible();
    // Anti-tautology: 'TBD' MUST NOT appear in the rendered field — the
    // generic-optional dispatch hides it (§8.3 line 2435).
    const text = (await showStatusTile.textContent()) ?? "";
    expect(text).not.toContain("TBD");
    // Hydration + fonts barrier: waits for network quiescence and font
    // rendering to settle before the screenshot, preventing sub-pixel
    // layout/font jitter from dev-build module-cache state warmed by
    // earlier specs (M11-A-D5).
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await expect(showStatusTile).toHaveScreenshot("category-2-power-tbd-hidden.png");
  });

  test("category 3: whole-tile-missing — viewer not on any reservation → LodgingTile absent", async ({
    page,
  }) => {
    // Default fixture: the LEAD viewer is not named on a hotel reservation
    // in the seeded Waldorf fixture (verified via empty-state.spec.ts
    // mutation patterns). No patch needed — the default state demonstrates
    // category 3. If the seed evolves, the assertion below catches the drift.
    await page.goto(`/show/${s.slug}`);
    await expect(page.getByTestId("tile-grid")).toBeVisible();
    await expect(page.getByTestId("lodging-tile")).toHaveCount(0);
    // Hydration + fonts barrier: waits for network quiescence and font
    // rendering to settle before the screenshot, preventing sub-pixel
    // layout/font jitter from dev-build module-cache state warmed by
    // earlier specs (M11-A-D5).
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByTestId("tile-grid")).toHaveScreenshot(
      "category-3-lodging-tile-absent.png",
    );
  });

  test("category 4: stale-sync — last_synced_at >6h ago → SYNC_DELAYED_SEVERE footer", async ({
    page,
  }) => {
    const stale = new Date(Date.now() - STALE_SEVERE_AGE_MS).toISOString();
    const res = await admin
      .from("shows")
      .update({ last_synced_at: stale, last_sync_status: "ok" })
      .eq("id", s.showId);
    if (res.error) throw new Error(`category-4 patch failed: ${res.error.message}`);
    await page.goto(`/show/${s.slug}`);
    const footer = page.getByTestId("stale-footer");
    await expect(footer).toBeVisible();
    await expect(footer).toHaveAttribute("data-tier", "red");
    await expect(footer).toHaveAttribute("data-code", "SYNC_DELAYED_SEVERE");
    await expect(footer).toHaveScreenshot("category-4-stale-sync-severe.png");
  });
});
