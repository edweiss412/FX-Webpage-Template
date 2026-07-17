/**
 * tests/e2e/admin-parse-panel.spec.ts (M6 §B Task 6.11 — UI portion;
 * REWRITTEN for the consolidated-admin-show-page rebuild)
 *
 * E2E coverage for the admin staged-review card chain. The rebuild moved this
 * flow OFF the per-show page: `/admin/show/[slug]` is now the PUBLISHED review
 * surface (readShowReviewSnapshot) and renders NO `pending_syncs` staged rows.
 * The `<StagedReviewCard>` (with the `staged-review-*` testids) now lives on the
 * dedicated FIRST-SEEN staged route `/admin/show/staged/[stagedId]`
 * (app/admin/show/staged/[stagedId]/page.tsx → `<StagedReviewCard mode="first_seen">`).
 *
 * A first-seen staged row is one whose `drive_file_id` has NO `shows` row yet;
 * an existing-show staged row is instead redirected by that route to
 * `/admin/show/[slug]?review=<stagedId>` (page.tsx:236-240). So these tests seed
 * a first-seen row (a novel drive_file_id, never in `shows`) and drive the card
 * on its current live host. The behaviors are identical to the old per-show
 * ParsePanel — the only endpoint difference is the first-seen apply/discard
 * routes and their 404 code (STALE_DISCARD_REJECTED, apply/route.ts:156).
 *
 * Anti-tautology: every catalog-text assertion compares against the literal
 * MESSAGE_CATALOG[code].dougFacing string, never a runtime messageFor() call.
 *
 * Apply-SUCCESS is intentionally OUT OF SCOPE (it requires a real Drive
 * re-verify the seed cannot satisfy — unchanged from the original spec). Covered
 * here: render, discard, stale-staged-id error, local MISSING_REVIEWER_CHOICE
 * validation, and the per-show Re-sync button wiring (still on /admin/show/[slug]
 * via the Overview section).
 */
import { randomUUID } from "node:crypto";
import { test, expect, type Request } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

/** A seeded EXISTING show (has a `shows` row) — used only by the Re-sync test,
 *  which drives the per-show page's Overview Re-sync button. */
const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";

async function lookupSeed(): Promise<{ slug: string; driveFileId: string }> {
  const res = await admin
    .from("shows")
    .select("slug, drive_file_id")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (res.error || !res.data) {
    throw new Error(
      `admin-parse-panel.spec: seed show not found (run \`pnpm db:seed\`). drive_file_id=${SEED_DRIVE_FILE_ID}, error=${res.error?.message ?? "no row"}`,
    );
  }
  return { slug: res.data.slug as string, driveFileId: res.data.drive_file_id as string };
}

async function clearStagedByDriveFileId(driveFileId: string): Promise<void> {
  const { error } = await admin.from("pending_syncs").delete().eq("drive_file_id", driveFileId);
  if (error) throw new Error(`clearStagedByDriveFileId failed: ${error.message}`);
}

/**
 * Insert a FIRST-SEEN staged row: a `pending_syncs` row whose `drive_file_id` is
 * novel (never present in `shows`, so the first-seen route renders the card
 * instead of redirecting) and whose `wizard_session_id` is null (the first-seen
 * route filters on that). Returns the row's `staged_id` + the novel drive id so
 * the caller can clean up.
 */
async function insertFirstSeenStaged(opts: {
  triggeredReviewItems?: unknown[];
  parseResult?: unknown;
}): Promise<{ staged_id: string; drive_file_id: string }> {
  // Novel per-insert id → no `shows` row, no cross-test collision on a UNIQUE.
  const driveFileId = `e2e-firstseen:parse-panel-${randomUUID()}`;
  const items = opts.triggeredReviewItems ?? [];
  const parse =
    opts.parseResult ??
    ({ show: { title: "Seed Test Show", client_label: "Seed Test Client" } } as unknown);
  const { data, error } = await admin
    .from("pending_syncs")
    .insert({
      drive_file_id: driveFileId,
      source_kind: "manual",
      base_modified_time: null,
      staged_modified_time: new Date().toISOString(),
      parse_result: parse,
      triggered_review_items: items,
      warning_summary: "",
    })
    .select("staged_id, drive_file_id")
    .single();
  if (error) throw new Error(`insertFirstSeenStaged failed: ${error.message}`);
  return data as { staged_id: string; drive_file_id: string };
}

test.describe("admin staged-review card — /admin/show/staged/[stagedId] (first-seen)", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
  });

  test("renders the staged card and the parse summary for an admin", async ({ page }) => {
    const staged = await insertFirstSeenStaged({
      triggeredReviewItems: [{ id: "mi6-1", invariant: "MI-6" }],
      parseResult: { show: { title: "Hello Show", client_label: "Acme Corp" } },
    });

    try {
      await signInAs(page, ADMIN_FIXTURE);
      const response = await page.goto(`/admin/show/staged/${staged.staged_id}`);
      expect(response?.status()).toBe(200);

      // The dedicated first-seen page (its <main> carries data-staged-id) hosts the
      // card. (Replaces the old per-show `admin-page-header-title` assertion — the
      // rebuild dropped AdminPageHeader from the staged surface; the page identity
      // is now the "Review this sheet" heading + the staged page main.)
      await expect(page.getByTestId("live-first-seen-staged-page")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Review this sheet" })).toBeVisible();
      await expect(page.getByTestId("staged-review-card")).toBeVisible();
      await expect(page.getByTestId("staged-parse-summary")).toContainText("Hello Show");
    } finally {
      await clearStagedByDriveFileId(staged.drive_file_id);
    }
  });

  test("Discard try_again removes the staged row from DB", async ({ page }) => {
    const staged = await insertFirstSeenStaged({
      triggeredReviewItems: [{ id: "mi6-1", invariant: "MI-6" }],
    });

    try {
      await signInAs(page, ADMIN_FIXTURE);
      await page.goto(`/admin/show/staged/${staged.staged_id}`);
      await expect(page.getByTestId("staged-review-card")).toBeVisible();

      await Promise.all([
        page.waitForResponse(
          (res) => res.url().includes(`/api/admin/show/staged/`) && res.url().endsWith("/discard"),
        ),
        page.getByTestId("staged-review-discard-try-again").click(),
      ]);

      // The row is gone from the DB (the mutation is the invariant; the page then
      // refreshes to a not-found surface once the row is deleted).
      const { data, error } = await admin
        .from("pending_syncs")
        .select("staged_id")
        .eq("staged_id", staged.staged_id);
      expect(error).toBeNull();
      expect(data?.length ?? 0).toBe(0);
    } finally {
      await clearStagedByDriveFileId(staged.drive_file_id);
    }
  });

  test("stale staged_id (row deleted underfoot) → 404 STALE_DISCARD_REJECTED surfaces catalog copy", async ({
    page,
  }) => {
    const staged = await insertFirstSeenStaged({
      triggeredReviewItems: [{ id: "mi6-1", invariant: "MI-6" }],
    });

    try {
      await signInAs(page, ADMIN_FIXTURE);
      await page.goto(`/admin/show/staged/${staged.staged_id}`);
      await expect(page.getByTestId("staged-review-card")).toBeVisible();

      // Race the row out from under the render, then click Apply. The first-seen
      // apply route can't resolve the drive_file_id for the staged_id → 404
      // STALE_DISCARD_REJECTED (apply/route.ts:156); the card surfaces the catalog
      // dougFacing copy through ErrorExplainer.
      await clearStagedByDriveFileId(staged.drive_file_id);

      await Promise.all([
        page.waitForResponse(
          (res) => res.url().includes(`/api/admin/show/staged/`) && res.url().endsWith("/apply"),
        ),
        page.getByTestId("staged-review-apply").click(),
      ]);

      await expect(page.getByTestId("staged-review-card-error")).toContainText(
        MESSAGE_CATALOG.STALE_DISCARD_REJECTED.dougFacing!,
      );
    } finally {
      await clearStagedByDriveFileId(staged.drive_file_id);
    }
  });

  test("MISSING_REVIEWER_CHOICE renders catalog copy locally without a round-trip", async ({
    page,
  }) => {
    const staged = await insertFirstSeenStaged({
      triggeredReviewItems: [
        {
          id: "mi12-1",
          invariant: "MI-12",
          removed_name: "Old Person",
          added_name: "New Person",
          email: "test@example.com",
        },
      ],
    });

    try {
      await signInAs(page, ADMIN_FIXTURE);
      await page.goto(`/admin/show/staged/${staged.staged_id}`);
      await expect(page.getByTestId("staged-review-card")).toBeVisible();

      // Capture POSTs to the staged routes — the local validator must block before
      // any round-trip when the multi-action MI-12 reviewer choice is unset.
      const stagedPosts: Request[] = [];
      page.on("request", (req) => {
        if (req.url().includes("/api/admin/show/staged/") && req.method() === "POST") {
          stagedPosts.push(req);
        }
      });

      await page.getByTestId("staged-review-apply").click();
      await expect(page.getByTestId("staged-review-card-error")).toContainText(
        MESSAGE_CATALOG.MISSING_REVIEWER_CHOICE.dougFacing!,
      );

      // Belt-and-suspenders: confirm zero POSTs landed.
      expect(stagedPosts.length).toBe(0);
    } finally {
      await clearStagedByDriveFileId(staged.drive_file_id);
    }
  });

  test("Re-sync button (per-show Overview) POSTs /api/admin/sync/[slug] and surfaces catalog copy on Drive infra failure", async ({
    page,
  }) => {
    const seed = await lookupSeed();

    await signInAs(page, ADMIN_FIXTURE);
    await page.goto(`/admin/show/${seed.slug}`);

    const responses: { url: string; status: number }[] = [];
    page.on("response", (res) => {
      if (res.url().includes("/api/admin/sync/")) {
        responses.push({ url: res.url(), status: res.status() });
      }
    });

    // The seed-fixture drive_file_id is not a real Drive file — Re-sync round-trips
    // and the route surfaces SYNC_INFRA_ERROR (or a Drive-side code) through the
    // catalog. We assert the round-trip happened and the error renders through
    // ErrorExplainer; we do NOT assert a specific status (failure mode depends on
    // the env's Drive wiring).
    //
    // Rebuild note: the old `#resync` footer anchor is gone. The Re-sync button now
    // lives in the Overview section's `overview-sheet-sync` block (OverviewSection.tsx:
    // 126-137) — either standalone or wrapped in a CorrectionLoopCallout when the show
    // has actionable warnings, but exactly one <ReSyncButton> renders there. Scope to
    // that container so the click is unambiguous under Playwright strict mode.
    const sheetSync = page.getByTestId("overview-sheet-sync");
    await expect(sheetSync).toBeVisible();
    await sheetSync.getByTestId("admin-resync-button").click();
    await expect(page.getByTestId("admin-resync-error")).toBeVisible({ timeout: 15_000 });

    expect(responses.length).toBeGreaterThan(0);
    expect(responses[0]!.url).toContain(`/api/admin/sync/${encodeURIComponent(seed.slug)}`);
  });
});
