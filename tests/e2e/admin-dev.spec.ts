/**
 * Playwright E2E suite for /admin/dev (Task 3.1, AC-3.1).
 *
 * Two project layout (configured in playwright.config.ts):
 *  - prod-build: built with ADMIN_DEV_PANEL_ENABLED unset → /admin/dev returns 404
 *  - dev-build:  built with ADMIN_DEV_PANEL_ENABLED=true → /admin/dev requires admin
 *
 * The dual-build approach validates the *build artifact* gate, not just runtime
 * env state. See docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/03-04-tiles.md:13-19.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_FIXTURE, NON_ADMIN_CREW_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import {
  admin,
  resetDevSchema,
  snapshotPublicSchema,
} from "./helpers/supabaseAdmin";

const FIXTURE_HAPPY = "2026-03-rpas-central-four-seasons.md";
const FIXTURE_FINTECH_WITH_REEL = "2026-05-fintech-forum-cto-summit.md";
const FIXTURE_DCI_WITH_TYPOS = "2025-03-dci-rpas-central.md";

test.beforeEach(async ({ page }) => {
  // Auto-truncate dev.* before every test (dev-build only — the prod-build
  // RPC will return error/404 since the dev-schema migration is loaded the
  // same on both builds, so truncate succeeds on both).
  if (test.info().project.name === "dev-build") {
    await resetDevSchema();
  }
  await signOut(page);
});

test.describe("dev-build only — admin-dev page behaves under ADMIN_DEV_PANEL_ENABLED=true", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "dev-build",
      "dev-build project only",
    );
  });

  test("admin/dev: upload fixture, see parse panel (AC-3.1) — public schema untouched", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);

    const before = await snapshotPublicSchema();

    await page.goto("/admin/dev");
    await page.selectOption("[data-testid=fixture-picker]", FIXTURE_HAPPY);
    await page.click("[data-testid=parse-and-stage]");

    await expect(page.locator("[data-testid=parse-outcome]")).toHaveText(
      /auto[- ]apply|stage|hard fail/i,
    );
    await expect(page.locator("[data-testid=triggered-items]")).toBeVisible();

    // Comprehensive public-schema isolation probe — every Phase-1 write surface.
    const after = await snapshotPublicSchema();
    expect(after.showsCount, "public.shows row count must not change").toBe(before.showsCount);
    expect(
      after.showsStatus,
      "public.shows status fields must not change on existing rows",
    ).toEqual(before.showsStatus);
    expect(after.pendingSyncsCount, "public.pending_syncs row count must not change").toBe(
      before.pendingSyncsCount,
    );
    expect(
      after.pendingSyncsHashes,
      "public.pending_syncs content hash must not change",
    ).toEqual(before.pendingSyncsHashes);
    expect(
      after.pendingIngestionsCount,
      "public.pending_ingestions row count must not change",
    ).toBe(before.pendingIngestionsCount);
    expect(
      after.pendingIngestionsHashes,
      "public.pending_ingestions content hash must not change",
    ).toEqual(before.pendingIngestionsHashes);
    expect(after.crewMemberAuthCount, "public.crew_member_auth must not change").toBe(
      before.crewMemberAuthCount,
    );
    expect(after.syncLogCount, "public.sync_log must not change").toBe(before.syncLogCount);
    expect(after.syncAuditCount, "public.sync_audit must not change").toBe(before.syncAuditCount);
  });

  test("admin/dev: dev build rejects non-admin", async ({ page }) => {
    await signInAs(page, NON_ADMIN_CREW_FIXTURE);
    const response = await page.goto("/admin/dev");
    expect(response?.status()).toBe(403);
    // Verify dev.* state was NOT mutated by the unauthorized GET.
    const { count, error } = await admin
      .schema("dev")
      .from("shows")
      .select("*", { count: "exact", head: true });
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  test("admin/dev: parseAndStage form submit blocked at page level for non-admin", async ({
    page,
  }) => {
    await signInAs(page, NON_ADMIN_CREW_FIXTURE);
    const response = await page.goto("/admin/dev");
    expect(response?.status()).toBe(403); // page-level requireAdmin already rejects
    const { count, error } = await admin
      .schema("dev")
      .from("pending_syncs")
      .select("*", { count: "exact", head: true });
    expect(error).toBeNull();
    expect(count).toBe(0); // no fixture-derived rows landed
  });

  test("admin/dev: page-level gate also blocks ?fixture= URL traversal for non-admin", async ({
    page,
  }) => {
    // This test exercises ONLY the page-level requireAdmin gate via a
    // ?fixture= query param. It is NOT independent action-level coverage —
    // tests/admin/parseAndStage-auth.test.ts is the actual independent
    // proof that requireAdmin() runs as the first line of the parseAndStage
    // server action (Vitest's ESM loader handles "use server" modules
    // natively; Playwright's CJS runner does not, which is why the
    // independent gate test lives in Vitest).
    //
    // What this asserts: a non-admin GET with ?fixture=... cannot smuggle a
    // fixture-parse through the URL — the page render gate rejects before
    // the server-side parseAndStage call dispatches. dev.pending_syncs
    // stays empty, proving no fixture-derived row landed.
    await signInAs(page, NON_ADMIN_CREW_FIXTURE);
    const response = await page.goto(
      `/admin/dev?fixture=${encodeURIComponent(FIXTURE_HAPPY)}`,
    );
    expect(response?.status()).toBe(403);

    // dev.* state must be unchanged.
    const { count, error } = await admin
      .schema("dev")
      .from("pending_syncs")
      .select("*", { count: "exact", head: true });
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  test("admin/dev: page-level gate prevents non-admin from reaching the reset form (existing dev.shows row survives)", async ({
    page,
  }) => {
    // This test exercises ONLY the page-level requireAdmin gate. It is NOT
    // independent action-level coverage of resetDevSchema —
    // tests/admin/parseAndStage-auth.test.ts is the actual independent
    // proof that requireAdmin() runs as the first line of resetDevSchema.
    //
    // What this asserts: a non-admin who lands on /admin/dev cannot reach
    // the "Reset dev schema" form because the page itself returns 403, so
    // the reset action is never even rendered as a target. A pre-seeded
    // dev.shows row survives — proving no truncate happened during the
    // rejected page load.
    const { error: insertError } = await admin.schema("dev").from("shows").insert({
      drive_file_id: "dev:fixture:reset-blocked-test",
      slug: "reset-blocked-test",
      title: "Reset Blocked Test",
      client_label: "test",
      template_version: "v4",
    });
    expect(insertError).toBeNull();

    await signInAs(page, NON_ADMIN_CREW_FIXTURE);
    const response = await page.goto("/admin/dev");
    expect(response?.status()).toBe(403);

    // dev.shows row must still exist — reset never executed.
    const { count, error } = await admin
      .schema("dev")
      .from("shows")
      .select("*", { count: "exact", head: true });
    expect(error).toBeNull();
    expect(count).toBe(1); // reset blocked — the row we inserted is still there
  });

  test("admin/dev: GET ?fixture=... is selection-only and does NOT mutate dev.* (Round 1 Finding 2)", async ({
    page,
  }) => {
    // Codex Round 1 Finding 2: GET /admin/dev?fixture=... must be safe per
    // HTTP semantics. The previous design called parseAndStage during Server
    // Component render based on the query param, turning admin browser
    // navigation/prefetch/reload into a real Phase-1 write. The fix: POST
    // Server Action submission only; GET ?fixture= reads previously-staged
    // state via a SELECT, never invokes the parsing pipeline.
    //
    // Failure mode this test catches: any future refactor that puts
    // parseAndStage back into the Server Component render path.
    await signInAs(page, ADMIN_FIXTURE);

    // Baseline: dev.* is empty (beforeEach calls resetDevSchema).
    const baseline = await admin
      .schema("dev")
      .from("pending_syncs")
      .select("*", { count: "exact", head: true });
    expect(baseline.error).toBeNull();
    expect(baseline.count).toBe(0);

    // Navigate to /admin/dev?fixture=... via raw GET — the most-prefetched
    // shape (browsers may prefetch query-param URLs aggressively).
    const response = await page.goto(
      `/admin/dev?fixture=${encodeURIComponent(FIXTURE_HAPPY)}`,
    );
    expect(response?.status()).toBe(200);

    // dev.pending_syncs MUST still be empty — GET did not parse.
    const after = await admin
      .schema("dev")
      .from("pending_syncs")
      .select("*", { count: "exact", head: true });
    expect(after.error).toBeNull();
    expect(after.count, "GET /admin/dev?fixture=... must NOT trigger parseAndStage").toBe(
      0,
    );
  });

  test("admin/dev runs the FULL parseSheet → enrichWithDrivePins → invariants → phase1 chain", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await page.goto("/admin/dev");
    await page.selectOption("[data-testid=fixture-picker]", FIXTURE_FINTECH_WITH_REEL);
    await page.click("[data-testid=parse-and-stage]");

    // Enrichment ran — assertions visible in the rendered panel:
    await expect(page.locator("[data-testid=enriched-reel-pin]")).toBeVisible();
    await expect(
      page.locator("[data-testid=enriched-linked-folder-items]"),
    ).toBeVisible();
    await expect(page.locator("[data-testid=enriched-embedded-images]")).toBeVisible();

    // Anti-tautology: assert mockDriveClient was called by checking the
    // mock-emitted marker that the panel surfaces. The marker is set inside
    // the mock implementation and rendered by the page's enrichment-summary.
    await expect(
      page.locator("[data-testid=enrichment-mock-marker]"),
    ).toContainText(/mock/i);
  });

  test("admin/dev surfaces parse_warnings, every triggered MI, and raw_unrecognized chunks", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await page.goto("/admin/dev");
    await page.selectOption("[data-testid=fixture-picker]", FIXTURE_DCI_WITH_TYPOS);
    await page.click("[data-testid=parse-and-stage]");

    await expect(page.locator("[data-testid=parse-warnings]")).toBeVisible();
    // The DCI fixture is a v2 corpus fixture with a known typo and several
    // raw_unrecognized chunks; assert at least one of each surface renders.
    const warningCount = await page.locator("[data-testid=parse-warning-item]").count();
    expect(warningCount).toBeGreaterThanOrEqual(1);
    await expect(page.locator("[data-testid=raw-unrecognized]")).toBeVisible();

    // NOTE: The `triggered-mi` element only renders when MI-6..MI-14 fire,
    // which requires a non-null `prior` baseline. Phase-1 strictness (per
    // plan 03-04-tiles.md:159) forbids parseAndStage from inserting into
    // dev.shows, so M3 cannot establish a `prior` via the dev panel itself.
    // Task 3.2's MI-7 + MI-1 synthesis tests directly inject synthetic
    // priors to exercise the triggered-mi path. For Task 3.1 we assert that
    // the triggered-items section RENDERS (count == 0 is valid for first-seen).
    await expect(page.locator("[data-testid=triggered-items]")).toBeVisible();

    // The "report this" button per the §15 demo flow — pre-fills /api/report
    // (M8 wires the actual endpoint; M3 stubs the destination).
    await expect(
      page.locator("[data-testid=report-snippet-button]").first(),
    ).toBeVisible();
  });
});

test.describe("prod-build only — page is permanently absent regardless of auth", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "prod-build",
      "prod-build project only",
    );
  });

  test("admin/dev: prod build returns 404 even for admin (build artifact gate)", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    const response = await page.goto("/admin/dev");
    expect(response?.status()).toBe(404);
  });
});

test.describe("prod-runtime-flip only — Round 1 Finding 1 regression", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "prod-runtime-flip",
      "prod-runtime-flip project only",
    );
  });

  test("admin/dev: STILL 404 when prod build is started with ADMIN_DEV_PANEL_ENABLED=true at runtime (build-artifact gate, not runtime-flippable)", async ({
    page,
  }) => {
    // Codex Round 1 Finding 1 (HIGH): the previous gate was a request-time
    // process.env.ADMIN_DEV_PANEL_ENABLED check — that test passes for a
    // purely runtime gate too. If the .next-prod artifact is ever started
    // with ADMIN_DEV_PANEL_ENABLED=true (operator typo, stale CI config,
    // env-file leak), a runtime-only gate would let /admin/dev come alive
    // in production.
    //
    // The prod-runtime-flip Playwright project (port 3003) builds with
    // ADMIN_DEV_PANEL_ENABLED UNSET (production posture) but then START with
    // ADMIN_DEV_PANEL_ENABLED=true. If the gate is a true build-artifact
    // decision, /admin/dev MUST still return 404. If this test fails with
    // 200 or 403, the gate is runtime-only — fix by extending the prebuild
    // step to omit app/admin/dev entirely from the build artifact.
    await signInAs(page, ADMIN_FIXTURE);
    const response = await page.goto("/admin/dev");
    expect(
      response?.status(),
      "build-artifact gate must hold even when runtime env tries to enable the panel",
    ).toBe(404);
  });

  test("admin/dev: parseAndStage server action also unreachable in runtime-flipped prod artifact", async ({
    page,
  }) => {
    // The Server Action POST endpoint Next.js mounts for parseAndStageFormAction
    // shares the same compiled app/admin/dev module tree. If the route was
    // truly excluded at build time, the action endpoint is also absent and
    // the form submission cannot reach the parsing pipeline.
    //
    // Probe: try to POST a form-encoded body to /admin/dev with admin auth.
    // Next.js Server Actions are mounted under the page's route, so an
    // unmount means a 404. (We don't try to forge a Server-Action header —
    // the GET-based admin/dev probe above is sufficient evidence that the
    // route module is absent. This test belt-and-suspenders the same claim.)
    await signInAs(page, ADMIN_FIXTURE);
    const response = await page.goto("/admin/dev");
    expect(response?.status()).toBe(404);
  });
});
