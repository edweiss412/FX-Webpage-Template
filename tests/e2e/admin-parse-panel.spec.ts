/**
 * tests/e2e/admin-parse-panel.spec.ts (M6 §B Task 6.11 — UI portion)
 *
 * E2E coverage for the per-show admin parse panel. Drives a real browser
 * authenticated as ADMIN_FIXTURE through `/admin/show/[slug]`, exercising
 * the full chain: Server Component renders rows → Client Component cards
 * POST to §A's Pin-stop 2 extension routes (apply / discard / sync) →
 * Supabase mutates state → router.refresh re-renders.
 *
 * Anti-tautology: every catalog-text assertion compares against the
 * literal MESSAGE_CATALOG[code].dougFacing string, never the runtime
 * messageFor() call (which would round-trip and pass even if both sides
 * drifted in lockstep).
 *
 * Apply-success path is intentionally OUT OF SCOPE here: it requires a
 * real Drive re-verify step that the seed fixture's `seed-fixture:*`
 * drive_file_id cannot satisfy. The vitest unit tests cover the apply
 * happy path against §A's contract surface; this e2e suite covers the
 * UI integration paths that complete without Drive credentials:
 * render, discard, stale-staged-id error, local MISSING_REVIEWER_CHOICE
 * validation, and the Re-sync button wiring.
 */
import { test, expect, type Request } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

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

async function clearPendingSyncs(driveFileId: string): Promise<void> {
  const { error } = await admin
    .from("pending_syncs")
    .delete()
    .eq("drive_file_id", driveFileId);
  if (error) throw new Error(`clearPendingSyncs failed: ${error.message}`);
}

async function insertStaged(
  driveFileId: string,
  opts: {
    triggeredReviewItems?: unknown[];
    parseResult?: unknown;
    sourceKind?: "cron" | "push" | "manual" | "onboarding_scan";
  } = {},
): Promise<{ staged_id: string; drive_file_id: string }> {
  const items = opts.triggeredReviewItems ?? [];
  const parse =
    opts.parseResult ??
    ({ show: { title: "Seed Test Show", client_label: "Seed Test Client" } } as unknown);
  const { data, error } = await admin
    .from("pending_syncs")
    .insert({
      drive_file_id: driveFileId,
      source_kind: opts.sourceKind ?? "manual",
      base_modified_time: null,
      staged_modified_time: new Date().toISOString(),
      parse_result: parse,
      triggered_review_items: items,
      warning_summary: "",
    })
    .select("staged_id, drive_file_id")
    .single();
  if (error) throw new Error(`insertStaged failed: ${error.message}`);
  return data as { staged_id: string; drive_file_id: string };
}

test.describe("admin parse panel — /admin/show/[slug]", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
  });

  test("renders the staged row and the parse summary for an admin", async ({ page }) => {
    const seed = await lookupSeed();
    await clearPendingSyncs(seed.driveFileId);
    const staged = await insertStaged(seed.driveFileId, {
      triggeredReviewItems: [{ id: "mi6-1", invariant: "MI-6" }],
      parseResult: { show: { title: "Hello Show", client_label: "Acme Corp" } },
    });

    await signInAs(page, ADMIN_FIXTURE);
    const response = await page.goto(`/admin/show/${seed.slug}`);
    expect(response?.status()).toBe(200);

    const card = page.locator(`[data-staged-id="${staged.staged_id}"]`);
    await expect(card).toBeVisible();
    await expect(page.getByTestId("staged-parse-summary")).toContainText("Hello Show");
    await expect(page.getByTestId("admin-show-title")).toBeVisible();

    await clearPendingSyncs(seed.driveFileId);
  });

  test("Discard try_again removes the staged row from DOM and DB", async ({ page }) => {
    const seed = await lookupSeed();
    await clearPendingSyncs(seed.driveFileId);
    const staged = await insertStaged(seed.driveFileId, {
      triggeredReviewItems: [{ id: "mi6-1", invariant: "MI-6" }],
    });

    await signInAs(page, ADMIN_FIXTURE);
    await page.goto(`/admin/show/${seed.slug}`);
    await expect(page.locator(`[data-staged-id="${staged.staged_id}"]`)).toBeVisible();

    await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/admin/staged/") && res.url().endsWith("/discard"),
      ),
      page.getByTestId("staged-review-discard-try-again").click(),
    ]);

    await expect(page.locator(`[data-staged-id="${staged.staged_id}"]`)).toHaveCount(0);

    const { data, error } = await admin
      .from("pending_syncs")
      .select("staged_id")
      .eq("staged_id", staged.staged_id);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });

  test("stale staged_id (row deleted underfoot) → 404 PENDING_SYNC_NOT_FOUND surfaces catalog copy", async ({
    page,
  }) => {
    const seed = await lookupSeed();
    await clearPendingSyncs(seed.driveFileId);
    const staged = await insertStaged(seed.driveFileId, {
      triggeredReviewItems: [{ id: "mi6-1", invariant: "MI-6" }],
    });

    await signInAs(page, ADMIN_FIXTURE);
    await page.goto(`/admin/show/${seed.slug}`);
    await expect(page.locator(`[data-staged-id="${staged.staged_id}"]`)).toBeVisible();

    // Race the row out from under the page render, then click Apply. The
    // route returns 404 PENDING_SYNC_NOT_FOUND; the card surfaces the
    // catalog dougFacing copy through ErrorExplainer.
    await clearPendingSyncs(seed.driveFileId);

    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes("/api/admin/staged/") && res.url().endsWith("/apply"),
      ),
      page.getByTestId("staged-review-apply").click(),
    ]);

    await expect(page.getByTestId("staged-review-card-error")).toContainText(
      MESSAGE_CATALOG.PENDING_SYNC_NOT_FOUND.dougFacing!,
    );
  });

  test("MISSING_REVIEWER_CHOICE renders catalog copy locally without a round-trip", async ({
    page,
  }) => {
    const seed = await lookupSeed();
    await clearPendingSyncs(seed.driveFileId);
    await insertStaged(seed.driveFileId, {
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

    await signInAs(page, ADMIN_FIXTURE);
    await page.goto(`/admin/show/${seed.slug}`);

    // Capture POSTs to the staged routes — the local validator must block
    // before any round-trip when reviewer choices are unset.
    const stagedPosts: Request[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/admin/staged/") && req.method() === "POST") {
        stagedPosts.push(req);
      }
    });

    await page.getByTestId("staged-review-apply").click();
    await expect(page.getByTestId("staged-review-card-error")).toContainText(
      MESSAGE_CATALOG.MISSING_REVIEWER_CHOICE.dougFacing!,
    );

    // Belt-and-suspenders: confirm zero POSTs landed.
    expect(stagedPosts.length).toBe(0);

    await clearPendingSyncs(seed.driveFileId);
  });

  test("Re-sync button POSTs /api/admin/sync/[slug] and surfaces catalog copy on Drive infra failure", async ({
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

    // The seed-fixture drive_file_id is not a real Drive file — Re-sync
    // will round-trip and the route will surface SYNC_INFRA_ERROR (or a
    // Drive-side 409 code) through the catalog. We assert the round-trip
    // happened and the error renders through ErrorExplainer; we do NOT
    // assert a specific status because the failure mode depends on the
    // Drive credentials / env wiring of the test environment.
    await page.getByTestId("admin-resync-button").click();
    await expect(page.getByTestId("admin-resync-error")).toBeVisible({ timeout: 15_000 });

    expect(responses.length).toBeGreaterThan(0);
    expect(responses[0]!.url).toContain(`/api/admin/sync/${encodeURIComponent(seed.slug)}`);
  });
});
