/**
 * tests/e2e/admin-route-boundaries.spec.ts (M12.2 B1 Task 2.3 — §2.7 route-render proof)
 *
 * Proves Next routes a REAL server-thrown POST-LAYOUT page-gate
 * `AdminInfraError` to the intended `error.tsx` segment boundary —
 * rendering the cataloged `ADMIN_ROUTE_LOAD_FAILED` Doug copy — NOT
 * swallowed by the admin LAYOUT catch, NOT Next's generic error page.
 *
 * Force-fail mechanics (Task 2.0 layer-aware hook `maybeForceTestInfraFail`
 * in lib/auth/requireAdmin.ts): the hook throws `AdminInfraError` only when
 * ENABLE_TEST_AUTH==="true" + TEST_AUTH_SECRET matches + the
 * `Authorization: Bearer <secret>` header is present + the
 * `x-test-force-infra-fail` header EQUALS the gate's `layer`. The admin
 * layout gate uses `layer:"layout"`; every page gate uses the default
 * `layer:"page"`. So sending header `x-test-force-infra-fail: page` (plus
 * the Bearer secret) makes only PAGE gates throw — the layout gate
 * (`layer:"layout"`) does NOT match "page", falls through to normal cookie
 * auth, and SUCCEEDS (so we also signInAs(ADMIN_FIXTURE) first). The page
 * segment then renders, its `requireAdmin`/`requireAdminIdentity` page gate
 * throws, and the closest `error.tsx` boundary catches it.
 *
 * Anti-tautology: the expected copy is IMPORTED via getRequiredDougFacing()
 * against the live catalog, never a literal in this file. We also assert the
 * boundary is NOT the layout surface (admin-layout-infra-error) — the
 * negative-regression flip in Task 2.3 Step 2 confirms the assertion
 * distinguishes layout-catch from page-boundary.
 *
 * Seeding: the staged route seeds a real `pending_syncs` row (insertStaged
 * pattern from admin-parse-panel.spec.ts) against a seed-fixture drive file;
 * the preview route looks up a real published, non-archived show + a crew
 * member. Both staged and preview pages call requireAdmin() as their FIRST
 * line (before param resolution / any DB lookup — verified against
 * app/admin/show/staged/[stagedId]/page.tsx:145 and
 * app/admin/show/[slug]/preview/[crewId]/page.tsx:130), so the gate fault
 * fires before the seeded row is read — but seeding real fixtures keeps the
 * URLs valid end-to-end and matches the plan's §8 requirement.
 */
import { test, expect } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { getRequiredDougFacing } from "@/lib/messages/lookup";

const FORCE_HEADERS = {
  "x-test-force-infra-fail": "page",
  authorization: "Bearer fxav-m3-test-auth-2026-DO-NOT-SHIP",
} as const;

const ROUTE_LOAD_FAILED = getRequiredDougFacing("ADMIN_ROUTE_LOAD_FAILED");

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";

/** A real published, non-archived show + one of its crew members. */
async function lookupPublishedShowWithCrew(): Promise<{ slug: string; crewId: string }> {
  const showRes = await admin
    .from("shows")
    .select("id, slug")
    .eq("published", true)
    .eq("archived", false)
    .limit(1);
  if (showRes.error || !showRes.data?.length) {
    throw new Error(
      `admin-route-boundaries.spec: no published non-archived show found (run \`pnpm db:seed\`). error=${showRes.error?.message ?? "no row"}`,
    );
  }
  const show = showRes.data[0] as { id: string; slug: string };
  const crewRes = await admin
    .from("crew_members")
    .select("id")
    .eq("show_id", show.id)
    .limit(1);
  if (crewRes.error || !crewRes.data?.length) {
    throw new Error(
      `admin-route-boundaries.spec: no crew member for show ${show.slug} (run \`pnpm db:seed\`). error=${crewRes.error?.message ?? "no row"}`,
    );
  }
  return { slug: show.slug, crewId: (crewRes.data[0] as { id: string }).id };
}

async function clearPendingSyncs(driveFileId: string): Promise<void> {
  const { error } = await admin
    .from("pending_syncs")
    .delete()
    .eq("drive_file_id", driveFileId);
  if (error) throw new Error(`clearPendingSyncs failed: ${error.message}`);
}

async function insertStaged(driveFileId: string): Promise<{ staged_id: string }> {
  const { data, error } = await admin
    .from("pending_syncs")
    .insert({
      drive_file_id: driveFileId,
      source_kind: "manual",
      base_modified_time: null,
      staged_modified_time: new Date().toISOString(),
      parse_result: { show: { title: "Seed Test Show", client_label: "Seed Test Client" } },
      triggered_review_items: [],
      warning_summary: "",
    })
    .select("staged_id")
    .single();
  if (error) throw new Error(`insertStaged failed: ${error.message}`);
  return data as { staged_id: string };
}

test.describe("§2.7 route-render proof — post-layout page-gate faults route to their boundaries", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
    // The layout gate uses layer:"layout"; the "page" force header does NOT
    // match it, so the layout falls through to normal cookie auth and needs a
    // valid admin session.
    await signInAs(page, ADMIN_FIXTURE);
    await page.setExtraHTTPHeaders({ ...FORCE_HEADERS });
  });

  /** Asserts the per-segment page boundary rendered the cataloged copy and the
   *  LAYOUT surface did NOT catch it (distinguishes layout-catch from page). */
  async function expectRouteBoundary(page: import("@playwright/test").Page) {
    await expect(page.getByText(ROUTE_LOAD_FAILED).first()).toBeVisible();
    // Negative-side of the proof: the layout's catch surface must NOT be what
    // rendered. (When the layout gate is flipped to layer:"page" in the Task
    // 2.3 Step 2 negative-regression, this locator becomes visible for every
    // route — proving this assertion discriminates the two surfaces.)
    await expect(page.getByTestId("admin-layout-infra-error")).toHaveCount(0);
  }

  test("/admin → catch-all app/admin/error.tsx", async ({ page }) => {
    await page.goto("/admin");
    await expectRouteBoundary(page);
    await expect(page.getByTestId("admin-route-error-boundary")).toBeVisible();
  });

  test("/admin/settings → app/admin/settings/error.tsx", async ({ page }) => {
    await page.goto("/admin/settings");
    await expectRouteBoundary(page);
    await expect(page.getByTestId("admin-settings-error-boundary")).toBeVisible();
  });

  test("/admin/settings/admins → app/admin/settings/admins/error.tsx (repointed)", async ({
    page,
  }) => {
    await page.goto("/admin/settings/admins");
    await expectRouteBoundary(page);
    await expect(page.getByTestId("admin-allowlist-error-boundary")).toBeVisible();
  });

  test("/admin/show/staged/<seededId> → inherits catch-all app/admin/error.tsx", async ({
    page,
  }) => {
    await clearPendingSyncs(SEED_DRIVE_FILE_ID);
    const staged = await insertStaged(SEED_DRIVE_FILE_ID);
    try {
      await page.goto(`/admin/show/staged/${staged.staged_id}`);
      await expectRouteBoundary(page);
      await expect(page.getByTestId("admin-route-error-boundary")).toBeVisible();
    } finally {
      await clearPendingSyncs(SEED_DRIVE_FILE_ID);
    }
  });

  test("/admin/show/<slug>/preview/<crewId> → inherits catch-all app/admin/error.tsx (§8)", async ({
    page,
  }) => {
    const { slug, crewId } = await lookupPublishedShowWithCrew();
    await page.goto(`/admin/show/${slug}/preview/${crewId}`);
    await expectRouteBoundary(page);
    await expect(page.getByTestId("admin-route-error-boundary")).toBeVisible();
  });
});
