// Help-docs setup deliberately diverges from screenshots-help setup.
// Screenshot capture needs dashboard state; the deep-link affordance walker
// also needs /admin to be wizard-renderable so the onboarding matrix rows
// materialize in the browser.
import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { admin } from "./helpers/supabaseAdmin";

const HELP_DOCS_WIZARD_SESSION_ID = "22222222-2222-4222-8222-222222222222";

// M12.12 Task 12 — walker-only locked seed extension fixtures. The deep-link
// affordance walker is READ-ONLY on locked tables (plan-wide invariant 2);
// these rows are seeded by supabase/seedWalkerFixtures.ts and asserted here.
const WALKER_FIRST_SEEN_STAGED_ID = "11111111-1111-4111-8111-111111111111";
const WALKER_ALERT_CODE = "DRIVE_FETCH_FAILED";
const RPAS_SLUG = "2026-03-retirement-plan-advisor-institute-central-2026";
const WALKER_SHOW_STATES: Record<
  string,
  { archived: boolean; published: boolean; last_sync_status: string }
> = {
  "walker-pending-review-2026": {
    archived: false,
    published: true,
    last_sync_status: "pending_review",
  },
  "walker-archived-2026": { archived: true, published: false, last_sync_status: "ok" },
  "walker-drive-error-2026": { archived: false, published: true, last_sync_status: "drive_error" },
};

test("seed help-docs DB with wizard-active /admin state", async () => {
  expect(process.env.ENABLE_TEST_AUTH).toBe("true");
  expect(process.env.TEST_AUTH_SECRET).toBe("test-secret-fixture");

  const result = spawnSync("pnpm", ["db:seed"], {
    stdio: "inherit",
    shell: false,
  });
  expect(result.status, `pnpm db:seed exited with status ${result.status}`).toBe(0);

  // Step 12.1/12.2 — walker fixture rows (shows states + first-seen
  // pending_syncs + per-show alert) come from the locked seed extension.
  const walkerSeed = spawnSync("pnpm", ["dlx", "tsx", "supabase/seedWalkerFixtures.ts"], {
    stdio: "inherit",
    shell: false,
  });
  expect(walkerSeed.status, `seedWalkerFixtures exited with status ${walkerSeed.status}`).toBe(0);

  const { data: walkerShows, error: walkerShowsError } = await admin
    .from("shows")
    .select("drive_file_id, slug, archived, published, archived_at, last_sync_status")
    .like("drive_file_id", "seed-fixture:walker-%");
  expect(
    walkerShowsError,
    `walker shows lookup failed: ${walkerShowsError?.message ?? ""}`,
  ).toBeNull();
  expect(walkerShows?.length, "expected 3 seeded walker shows").toBe(3);
  for (const [slug, expected] of Object.entries(WALKER_SHOW_STATES)) {
    const row = walkerShows?.find((candidate) => candidate.slug === slug);
    expect(row, `walker show ${slug} missing`).toBeTruthy();
    expect(row?.archived, `${slug} archived`).toBe(expected.archived);
    expect(row?.published, `${slug} published`).toBe(expected.published);
    expect(row?.last_sync_status, `${slug} last_sync_status`).toBe(expected.last_sync_status);
    if (expected.archived) {
      expect(row?.archived_at, `${slug} archived_at`).not.toBeNull();
    }
  }

  const { data: firstSeenRows, error: firstSeenError } = await admin
    .from("pending_syncs")
    .select("staged_id, drive_file_id, triggered_review_items, wizard_session_id")
    .eq("drive_file_id", "seed-fixture:walker-first-seen");
  expect(
    firstSeenError,
    `walker first-seen lookup failed: ${firstSeenError?.message ?? ""}`,
  ).toBeNull();
  expect(firstSeenRows?.length, "expected 1 walker first-seen pending_syncs row").toBe(1);
  expect(firstSeenRows?.[0]?.staged_id).toBe(WALKER_FIRST_SEEN_STAGED_ID);
  expect(firstSeenRows?.[0]?.wizard_session_id).toBeNull();
  const reviewItems = firstSeenRows?.[0]?.triggered_review_items;
  expect(
    Array.isArray(reviewItems) &&
      reviewItems.some(
        (item) =>
          item !== null &&
          typeof item === "object" &&
          (item as { invariant?: unknown }).invariant === "FIRST_SEEN_REVIEW",
      ),
    "first-seen row carries a FIRST_SEEN_REVIEW review item",
  ).toBe(true);

  // The seeded per-show alert hangs off the base-seed RPAS show — the show
  // the walker's per-show matrix rows navigate.
  const { data: rpasRows, error: rpasError } = await admin
    .from("shows")
    .select("id")
    .eq("slug", RPAS_SLUG)
    .limit(1);
  expect(rpasError, `RPAS show lookup failed: ${rpasError?.message ?? ""}`).toBeNull();
  const rpasId = rpasRows?.[0]?.id;
  expect(rpasId, `base-seed show ${RPAS_SLUG} missing`).toBeTruthy();

  const { data: alertRows, error: alertError } = await admin
    .from("admin_alerts")
    .select("id, show_id, code")
    .eq("show_id", rpasId as string)
    .eq("code", WALKER_ALERT_CODE)
    .is("resolved_at", null);
  expect(alertError, `walker alert lookup failed: ${alertError?.message ?? ""}`).toBeNull();
  expect(
    alertRows?.length,
    `expected exactly 1 unresolved ${WALKER_ALERT_CODE} fixture alert for the RPAS show`,
  ).toBe(1);
  expect(alertRows?.[0]?.show_id).toBe(rpasId);

  const { data, error } = await admin
    .from("app_settings")
    .update({
      watched_folder_id: null,
      watched_folder_name: null,
      watched_folder_set_by_email: null,
      watched_folder_set_at: null,
      pending_folder_id: null,
      pending_folder_name: null,
      pending_folder_set_by_email: null,
      pending_folder_set_at: null,
      pending_wizard_session_id: HELP_DOCS_WIZARD_SESSION_ID,
      pending_wizard_session_at: new Date().toISOString(),
    })
    .eq("id", "default")
    .select("watched_folder_id, pending_wizard_session_id")
    .single();

  expect(error, `help-docs wizard-state seed failed: ${error?.message ?? ""}`).toBeNull();
  expect(data?.watched_folder_id).toBeNull();
  expect(data?.pending_wizard_session_id).toBe(HELP_DOCS_WIZARD_SESSION_ID);
});
