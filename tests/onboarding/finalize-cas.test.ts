import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { WizardStagedRouteTx } from "@/app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route";
import {
  handleOnboardingFinalizeCas,
  handleOnboardingFinalizeCasStream,
} from "@/app/api/admin/onboarding/finalize-cas/route";
import { handleWizardStagedApply } from "@/app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route";
import {
  W1,
  EXISTING_SHOW_TITLE,
  request,
  shadowPayload,
  FakeFinalizeCasDb,
  makeFakePipelineTx,
  deps,
  json,
} from "./_finalizeCasFake";

// Outcome-ref (per-committed-row SHOW_FINALIZED): mock the durable-outcome wrapper so we assert
// exactly which committed shows get a durable log — and that a PRE-commit failure / typed 409
// block / mid-loop throw does NOT log a show whose row transaction never committed.
const logAdminOutcomeMock = vi.hoisted(() =>
  vi.fn(async (_outcome: Record<string, unknown>) => {}),
);
vi.mock("@/lib/log/logAdminOutcome", () => ({ logAdminOutcome: logAdminOutcomeMock }));

// File-scoped: every test starts from a clean outcome-mock so the per-committed-row assertions
// count only THIS test's SHOW_FINALIZED emissions (the first describe's committing tests otherwise
// accumulate into the shared mock, since vitest runs tests in a file serially).
afterEach(() => {
  logAdminOutcomeMock.mockClear();
});

describe("POST /api/admin/onboarding/finalize-cas", () => {
  test("commits Phase D atomically then subscribes to the watched folder after commit", async () => {
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [
      {
        wizard_session_id: W1,
        drive_file_id: "existing-1",
        show_id: "22222222-2222-4222-8222-222222222222",
        applied_by_email: "apply-admin@example.com",
        applied_at_intent: "2026-05-08T12:00:00.000Z",
        payload: shadowPayload(),
      },
    ];
    db.sessionCreatedDriveIds = ["first-seen-1"];
    const routeDeps = deps(db);

    const response = await handleOnboardingFinalizeCas(request(), routeDeps);

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      status: "finalize_complete",
      wizard_session_id: W1,
      watched_folder_id: "folder-1",
      per_row: [{ drive_file_id: "existing-1", code: "OK" }],
    });
    expect(db.appliedShadows).toEqual(["existing-1"]);
    expect(db.auditRows).toEqual(["existing-1"]);
    expect(db.shadowRows).toEqual([]);
    expect(db.published).toBe(true);
    // Wizard scope never touches the live partition (Task 1.2 class op #1):
    expect(db.operations).not.toContain("delete-live-pending-ingestion");
    expect(db.deletedWizardDeferrals).toBe(true);
    expect(db.checkpoint?.status).toBe("final_cas_done");
    expect(routeDeps.subscribeToWatchedFolder).toHaveBeenCalledWith("folder-1");
    expect(db.operations.at(-1)).toBe("mark-final-cas-done");
  });

  test("Phase D blocks final CAS when one shadow row is outdated, preserving recovery state until re-apply", async () => {
    const db = new FakeFinalizeCasDb();
    db.shadowRows = Array.from({ length: 5 }, (_, index) => ({
      wizard_session_id: W1,
      drive_file_id: `existing-${index + 1}`,
      show_id: `22222222-2222-4222-8222-22222222222${index}`,
      applied_by_email: "apply-admin@example.com",
      applied_at_intent: "2026-05-08T12:00:00.000Z",
      payload: shadowPayload(),
    }));
    db.sessionCreatedDriveIds = ["first-seen-1"];
    db.phaseDCasFailDriveIds.add("existing-3");
    const routeDeps = deps(db);

    const blockedResponse = await handleOnboardingFinalizeCas(request(), routeDeps);

    expect(blockedResponse.status).toBe(409);
    expect(await json(blockedResponse)).toEqual({
      ok: false,
      code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
      per_row: [
        { drive_file_id: "existing-1", code: "OK" },
        { drive_file_id: "existing-2", code: "OK" },
        {
          drive_file_id: "existing-3",
          code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
          display_name: EXISTING_SHOW_TITLE,
        },
        { drive_file_id: "existing-4", code: "OK" },
        { drive_file_id: "existing-5", code: "OK" },
      ],
    });
    expect(db.appliedShadows).toEqual(["existing-1", "existing-2", "existing-4", "existing-5"]);
    expect(db.auditRows).toEqual(["existing-1", "existing-2", "existing-4", "existing-5"]);
    expect(db.shadowRows.map((row) => row.drive_file_id)).toEqual(["existing-3"]);
    expect(db.published).toBe(false);
    expect(db.deletedWizardDeferrals).toBe(false);
    expect(db.watchedFolderId).toBeNull();
    expect(db.checkpoint?.status).toBe("all_batches_complete");
    expect(routeDeps.subscribeToWatchedFolder).not.toHaveBeenCalled();
    expect(db.operations).not.toContain("publish");
    expect(db.operations).not.toContain("delete-deferrals");
    expect(db.operations).not.toContain("promote-settings");
    expect(db.operations).not.toContain("mark-final-cas-done");

    const reapplyResponse = await handleWizardStagedApply(
      new Request(`https://crew.fxav.test/api/admin/onboarding/staged/${W1}/existing-3/apply`, {
        method: "POST",
        body: JSON.stringify({
          stagedId: "33333333-3333-4333-8333-333333333333",
          reviewerChoicesVersion: 1,
          reviewerChoices: [],
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ wizardSessionId: W1, driveFileId: "existing-3" }) },
      {
        requireAdminIdentity: async () => ({ email: "doug@example.com" }),
        withRowTx: async (_driveFileId, fn) => fn(db as unknown as WizardStagedRouteTx),
        applyStaged: async () => {
          db.phaseDCasFailDriveIds.delete("existing-3");
          db.shadowRows = [
            {
              wizard_session_id: W1,
              drive_file_id: "existing-3",
              show_id: "22222222-2222-4222-8222-222222222222",
              applied_by_email: "apply-admin@example.com",
              applied_at_intent: "2026-05-08T12:00:00.000Z",
              payload: shadowPayload(),
            },
          ];
          return {
            outcome: "wizard_applied" as const,
            wizardSessionId: W1,
            stagedId: "33333333-3333-4333-8333-333333333333",
          };
        },
      },
    );
    expect(reapplyResponse.status).toBe(200);
    expect(await json(reapplyResponse)).toEqual({
      status: "reapplied",
      wizard_session_id: W1,
      drive_file_id: "existing-3",
    });

    const successResponse = await handleOnboardingFinalizeCas(request(), routeDeps);

    expect(successResponse.status).toBe(200);
    expect(await json(successResponse)).toEqual({
      status: "finalize_complete",
      wizard_session_id: W1,
      watched_folder_id: "folder-1",
      per_row: [{ drive_file_id: "existing-3", code: "OK" }],
    });
    expect(db.shadowRows).toEqual([]);
    expect(db.published).toBe(true);
    expect(db.deletedWizardDeferrals).toBe(true);
    expect(db.watchedFolderId).toBe("folder-1");
    expect(db.checkpoint?.status).toBe("final_cas_done");
    expect(routeDeps.subscribeToWatchedFolder).toHaveBeenCalledWith("folder-1");
  });

  test("reports Phase D shadow rows whose live show advanced after Phase B without final cleanup", async () => {
    const db = new FakeFinalizeCasDb();
    db.phaseDCasFailDriveIds.add("existing-1");
    db.shadowRows = [
      {
        wizard_session_id: W1,
        drive_file_id: "existing-1",
        show_id: "22222222-2222-4222-8222-222222222222",
        applied_by_email: "apply-admin@example.com",
        applied_at_intent: "2026-05-08T12:00:00.000Z",
        payload: shadowPayload(),
      },
    ];

    const response = await handleOnboardingFinalizeCas(request(), deps(db));

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({
      ok: false,
      code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
      per_row: [
        {
          drive_file_id: "existing-1",
          code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
          display_name: EXISTING_SHOW_TITLE,
        },
      ],
    });
    expect(db.shadowRows.map((row) => row.drive_file_id)).toEqual(["existing-1"]);
    expect(db.published).toBe(false);
    expect(db.deletedWizardDeferrals).toBe(false);
    expect(db.checkpoint?.status).toBe("all_batches_complete");
  });

  test("object-shaped-but-invalid parse_result shadow gets the typed per-row refusal; shadow retained; siblings continue", async () => {
    // Concrete failure mode (whole-milestone HIGH): `{ show: {} }` passed the old
    // object-shape-only check (coerceJsonbObject), then syntheticFileMeta dereferenced
    // parsed.parseResult.show.title → uncaught TypeError → route-level 500
    // ONBOARDING_FINALIZE_INTERNAL_ERROR with NO per_row, NO retained-row recovery
    // path, and the healthy sibling never applied.
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [
      {
        wizard_session_id: W1,
        drive_file_id: "existing-corrupt",
        show_id: "22222222-2222-4222-8222-222222222220",
        applied_by_email: "apply-admin@example.com",
        applied_at_intent: "2026-05-08T12:00:00.000Z",
        payload: shadowPayload({ parse_result: { show: {} } }),
      },
      {
        wizard_session_id: W1,
        drive_file_id: "existing-2",
        show_id: "22222222-2222-4222-8222-222222222221",
        applied_by_email: "apply-admin@example.com",
        applied_at_intent: "2026-05-08T12:00:00.000Z",
        payload: shadowPayload(),
      },
    ];

    const response = await handleOnboardingFinalizeCas(request(), deps(db));

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({
      ok: false,
      code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
      per_row: [
        { drive_file_id: "existing-corrupt", code: "STAGED_PARSE_RESULT_CORRUPT" },
        { drive_file_id: "existing-2", code: "OK" },
      ],
    });
    // The corrupt shadow is RETAINED for operator recovery; the sibling applied.
    expect(db.shadowRows.map((row) => row.drive_file_id)).toEqual(["existing-corrupt"]);
    expect(db.appliedShadows).toEqual(["existing-2"]);
    expect(db.published).toBe(false);
    expect(db.deletedWizardDeferrals).toBe(false);
    expect(db.checkpoint?.status).toBe("all_batches_complete");
  });

  test("malformed reviewer_choices ELEMENT shadow gets the typed per-row refusal; shadow retained; siblings continue (WM-R4)", async () => {
    // Concrete failure mode (whole-milestone WM-R4 HIGH): parseShadowPayloadForApply cast
    // reviewer_choices after only an is-array check, so `[null]` reached
    // applyStagedCore.validateReviewerChoices which dereferences choice.item_id →
    // uncaught TypeError → route-level 500 ONBOARDING_FINALIZE_INTERNAL_ERROR with NO
    // per_row, NO retained-row recovery path — one malformed retained shadow blocked
    // publish and the healthy sibling never applied.
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [
      {
        wizard_session_id: W1,
        drive_file_id: "existing-corrupt-choices",
        show_id: "22222222-2222-4222-8222-222222222220",
        applied_by_email: "apply-admin@example.com",
        applied_at_intent: "2026-05-08T12:00:00.000Z",
        payload: shadowPayload({ reviewer_choices: [null] }),
      },
      {
        wizard_session_id: W1,
        drive_file_id: "existing-2",
        show_id: "22222222-2222-4222-8222-222222222221",
        applied_by_email: "apply-admin@example.com",
        applied_at_intent: "2026-05-08T12:00:00.000Z",
        payload: shadowPayload(),
      },
    ];

    const response = await handleOnboardingFinalizeCas(request(), deps(db));

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({
      ok: false,
      code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
      per_row: [
        { drive_file_id: "existing-corrupt-choices", code: "STAGED_REVIEW_ITEMS_CORRUPT" },
        { drive_file_id: "existing-2", code: "OK" },
      ],
    });
    // The corrupt shadow is RETAINED for operator recovery; the sibling applied.
    expect(db.shadowRows.map((row) => row.drive_file_id)).toEqual(["existing-corrupt-choices"]);
    expect(db.appliedShadows).toEqual(["existing-2"]);
    expect(db.published).toBe(false);
    expect(db.deletedWizardDeferrals).toBe(false);
    expect(db.checkpoint?.status).toBe("all_batches_complete");
  });

  test("archived-show shadow gets the typed SHOW_ARCHIVED_IMMUTABLE per-row refusal BEFORE apply; shadow retained; siblings continue (WM-R9)", async () => {
    // Concrete failure mode (whole-milestone WM-R9 HIGH): applyShadow adopted the held show
    // lock and ran applyStagedCore WITHOUT re-checking shows.archived — a show archived
    // between Phase B staging and the final CAS got mutated (children/audit/feed), its shadow
    // consumed, OK reported, violating archived-show immutability (DEF-4 of B2). The live
    // staged paths refuse via readShowArchived_unlocked (lib/sync/applyStaged.ts /
    // lib/sync/discardStaged.ts); Phase D must mirror that guard under the per-row lock.
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [
      {
        wizard_session_id: W1,
        drive_file_id: "existing-archived",
        show_id: "22222222-2222-4222-8222-222222222220",
        applied_by_email: "apply-admin@example.com",
        applied_at_intent: "2026-05-08T12:00:00.000Z",
        payload: shadowPayload(),
      },
      {
        wizard_session_id: W1,
        drive_file_id: "existing-2",
        show_id: "22222222-2222-4222-8222-222222222221",
        applied_by_email: "apply-admin@example.com",
        applied_at_intent: "2026-05-08T12:00:00.000Z",
        payload: shadowPayload(),
      },
    ];
    db.archivedDriveIds.add("existing-archived");

    const response = await handleOnboardingFinalizeCas(request(), deps(db));

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({
      ok: false,
      code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
      per_row: [
        {
          drive_file_id: "existing-archived",
          code: "SHOW_ARCHIVED_IMMUTABLE",
          display_name: EXISTING_SHOW_TITLE,
        },
        { drive_file_id: "existing-2", code: "OK" },
      ],
    });
    // Archived show NEVER reached the apply core (no snapshot, no audit); shadow RETAINED.
    expect(db.appliedShadows).toEqual(["existing-2"]);
    expect(db.auditRows).toEqual(["existing-2"]);
    expect(db.shadowRows.map((row) => row.drive_file_id)).toEqual(["existing-archived"]);
    // Batch does NOT resolve while the row pends.
    expect(db.published).toBe(false);
    expect(db.deletedWizardDeferrals).toBe(false);
    expect(db.watchedFolderId).toBeNull();
    expect(db.checkpoint?.status).toBe("all_batches_complete");
  });

  test("is idempotent after settings were already promoted", async () => {
    const db = new FakeFinalizeCasDb();
    db.activeSessionId = null;
    db.pendingFolderId = null;
    db.watchedFolderId = "folder-1";
    db.checkpoint = { status: "final_cas_done", batches_completed: 2 };
    const routeDeps = deps(db);

    const response = await handleOnboardingFinalizeCas(request(), routeDeps);

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      status: "finalize_complete",
      wizard_session_id: W1,
      watched_folder_id: "folder-1",
      idempotent: true,
    });
    expect(routeDeps.subscribeToWatchedFolder).toHaveBeenCalledWith("folder-1");
  });

  test("rejects early-fire before all batches are complete", async () => {
    const db = new FakeFinalizeCasDb();
    db.checkpoint = { status: "in_progress", batches_completed: 1 };

    const response = await handleOnboardingFinalizeCas(request(), deps(db));

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ ok: false, code: "WIZARD_FINALIZE_BATCHES_PENDING" });
  });

  test("rejects missing checkpoint or missing active wizard session", async () => {
    const missingCheckpoint = new FakeFinalizeCasDb();
    missingCheckpoint.checkpoint = null;

    await expect(
      json(await handleOnboardingFinalizeCas(request(), deps(missingCheckpoint))),
    ).resolves.toEqual({
      ok: false,
      code: "WIZARD_FINALIZE_CHECKPOINT_MISSING",
    });

    const missingSession = new FakeFinalizeCasDb();
    missingSession.activeSessionId = null;

    const response = await handleOnboardingFinalizeCas(request(), deps(missingSession));
    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ ok: false, code: "WIZARD_FINALIZE_CHECKPOINT_MISSING" });
  });

  test("rejects when approved pending rows or unresolved manifest rows remain", async () => {
    const approved = new FakeFinalizeCasDb();
    approved.approvedCount = 1;

    const approvedResponse = await handleOnboardingFinalizeCas(request(), deps(approved));
    expect(approvedResponse.status).toBe(409);
    expect(await json(approvedResponse)).toEqual({
      ok: false,
      code: "WIZARD_FINALIZE_BATCHES_PENDING",
      approved_count: 1,
    });

    const unresolved = new FakeFinalizeCasDb();
    unresolved.unresolvedManifestCount = 1;

    const unresolvedResponse = await handleOnboardingFinalizeCas(request(), deps(unresolved));
    expect(unresolvedResponse.status).toBe(409);
    expect(await json(unresolvedResponse)).toEqual({
      ok: false,
      code: "ONBOARDING_NOT_RESOLVED",
      unresolved_manifest_count: 1,
    });
  });

  test("legacy pre-provenance Phase B rows REFUSE the final CAS fail-closed — before any apply/flip (WM-R7 finding 1)", async () => {
    // Concrete failure mode: a setup that ran Phase B on MAIN (pre-provenance)
    // has status='applied' manifest rows with created_show_id NULL and a
    // published=false first-seen show with wizard_created_session_id NULL. The
    // narrowed publish flip selects only provenance-bearing rows, so the final
    // CAS would COMPLETE (final_cas_done, settings promoted) publishing ZERO
    // rows — the show stays invisible with no pending row to recover.
    const db = new FakeFinalizeCasDb();
    db.legacyAmbiguousDriveIds = ["legacy-1"];
    db.shadowRows = [
      {
        wizard_session_id: W1,
        drive_file_id: "existing-1",
        show_id: "22222222-2222-4222-8222-222222222222",
        applied_by_email: "apply-admin@example.com",
        applied_at_intent: "2026-05-08T12:00:00.000Z",
        payload: shadowPayload(),
      },
    ];
    db.sessionCreatedDriveIds = ["first-seen-1"];
    const routeDeps = deps(db);

    const response = await handleOnboardingFinalizeCas(request(), routeDeps);

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({
      ok: false,
      code: "ONBOARDING_LEGACY_ROW_AMBIGUOUS",
      per_row: [{ drive_file_id: "legacy-1", code: "ONBOARDING_LEGACY_ROW_AMBIGUOUS" }],
    });
    // The preflight fires BEFORE any row apply/flip: nothing applied, nothing
    // published, shadow retained, settings NOT promoted, checkpoint NOT done.
    expect(db.appliedShadows).toEqual([]);
    expect(db.shadowRows).toHaveLength(1);
    expect(db.published).toBe(false);
    expect(db.checkpoint?.status).toBe("all_batches_complete");
    expect(db.activeSessionId).toBe(W1);
    expect(routeDeps.subscribeToWatchedFolder).not.toHaveBeenCalled();
    expect(db.operations).not.toContain("read-shadows");
    expect(db.operations).toContain("legacy-ambiguity-preflight");
  });

  test("ONBOARDING_LEGACY_ROW_AMBIGUOUS is cataloged with Doug-facing recovery copy (invariant 5)", async () => {
    // RunFinalCASButton renders per-row codes via messageFor().dougFacing — an
    // uncataloged code would fall back to the generic error and strand the
    // operator without the re-run-setup recovery instruction.
    const { MESSAGE_CATALOG } = await import("@/lib/messages/catalog");
    const entry = MESSAGE_CATALOG[
      "ONBOARDING_LEGACY_ROW_AMBIGUOUS" as keyof typeof MESSAGE_CATALOG
    ] as { dougFacing: string | null; helpfulContext: string | null } | undefined;
    expect(entry).toBeDefined();
    expect(entry!.dougFacing).toMatch(/setup/i);
    expect(entry!.helpfulContext).toBeTruthy();
  });

  test("never returns an empty 500 — an unexpected throw becomes a typed JSON error + console.error", async () => {
    // finalize-cas coerces parse_result / reviewer_choices (which can throw a
    // typed JsonbCoercionError on a genuinely-corrupt legacy shadow payload) and
    // runs DB work that may fault. Without the wrapper that throw escaped the
    // route → Next returned an empty 500 body → the client's response.json()
    // failed with "Unexpected end of JSON input" (the M12 Phase 0.F smoke-3 class,
    // Codex R1 HIGH: the wrapper existed on /finalize but not on /finalize-cas).
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = new FakeFinalizeCasDb();
    const response = await handleOnboardingFinalizeCas(request(), {
      requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
      withTx: async () => {
        throw new Error("kaboom: simulated unexpected finalize-cas failure");
      },
      withRowTx: async (_driveFileId, fn) => fn(db, makeFakePipelineTx(db)),
      subscribeToWatchedFolder: vi.fn(async () => undefined),
    });
    expect(response.status).toBe(500);
    // Would itself throw on an empty body — that is the regression.
    expect(await json(response)).toMatchObject({
      ok: false,
      code: "ONBOARDING_FINALIZE_INTERNAL_ERROR",
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test("publish flip SQL is provenance-bound and locked-set-bound (R47-1/R55-1/R56-1/R50-1 structural pin)", () => {
    // Concrete failure mode: a refactor dropping any join lets a forged/stale manifest row (or
    // a row inserted after the lock-set SELECT) publish a deliberately-unpublished show.
    const src = readFileSync(
      join(process.cwd(), "app/api/admin/onboarding/finalize-cas/route.ts"),
      "utf8",
    );
    const flipAt = src.indexOf("set published = true");
    expect(flipAt).toBeGreaterThan(-1);
    const flip = src.slice(flipAt, src.indexOf("returning true as published", flipAt));
    for (const fragment of [
      "m.wizard_session_id = $1::uuid",
      "m.status = 'applied'",
      "m.created_show_id = s.id",
      "m.drive_file_id = s.drive_file_id",
      "s.wizard_created_session_id = m.wizard_session_id",
      "m.drive_file_id = any($2::text[])",
    ]) {
      expect(flip).toContain(fragment);
    }
  });
});

describe("POST /api/admin/onboarding/finalize-cas — per-committed-row SHOW_FINALIZED outcome log", () => {
  // Derived from the fake's live-show read (_finalizeCasFake read-live-show branch): every applied
  // shadow's live show id is this constant, so the log's `showId` must equal it for each committed
  // row. NOT hardcoded to a literal the assertion also produces — sourced from the fixture's DB read.
  const LIVE_SHOW_ID = "22222222-2222-4222-8222-222222222222";
  const ADMIN_EMAIL = "doug@example.com"; // the fake deps' requireAdminIdentity() identity.

  function shadow(driveFileId: string) {
    return {
      wizard_session_id: W1,
      drive_file_id: driveFileId,
      show_id: LIVE_SHOW_ID,
      applied_by_email: "apply-admin@example.com",
      applied_at_intent: "2026-05-08T12:00:00.000Z",
      payload: shadowPayload(),
    };
  }

  function finalizedCalls() {
    return logAdminOutcomeMock.mock.calls
      .map((call) => call[0])
      .filter((arg) => arg.code === "SHOW_FINALIZED");
  }

  test("(1) full success (non-streamed): one SHOW_FINALIZED per committed show — showId + result + actorEmail", async () => {
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [shadow("existing-1"), shadow("existing-2")];
    db.sessionCreatedDriveIds = ["first-seen-1"];

    const response = await handleOnboardingFinalizeCas(request(), deps(db));
    expect(response.status).toBe(200);

    // Expected count is DERIVED from the fixture: exactly the rows that committed to a live show.
    expect(db.appliedShadows).toEqual(["existing-1", "existing-2"]);
    const calls = finalizedCalls();
    expect(calls).toHaveLength(db.appliedShadows.length);
    for (const call of calls) {
      expect(call).toEqual({
        code: "SHOW_FINALIZED",
        source: "api.admin.onboarding.finalize-cas",
        actorEmail: ADMIN_EMAIL,
        showId: LIVE_SHOW_ID,
        wizardSessionId: W1,
        result: "final_cas",
      });
    }
  });

  test("(1) full success (streamed): identical per-committed-row SHOW_FINALIZED logs", async () => {
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [shadow("existing-1"), shadow("existing-2")];
    db.sessionCreatedDriveIds = ["first-seen-1"];

    // Drain the NDJSON stream so the ReadableStream start() (which runs runFinalizeCas) completes.
    const res = await handleOnboardingFinalizeCasStream(request(), deps(db));
    await res.text();

    expect(db.appliedShadows).toEqual(["existing-1", "existing-2"]);
    const calls = finalizedCalls();
    expect(calls).toHaveLength(db.appliedShadows.length);
    for (const call of calls) {
      expect(call).toMatchObject({
        code: "SHOW_FINALIZED",
        source: "api.admin.onboarding.finalize-cas",
        actorEmail: ADMIN_EMAIL,
        showId: LIVE_SHOW_ID,
        wizardSessionId: W1,
        result: "final_cas",
      });
    }
  });

  test("(2) PRE-COMMIT failure (live watermark advanced → typed 409, show NOT in affectedShowIds) → no log for that show", async () => {
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [shadow("existing-1")];
    // The row refuses at the equality preflight (STAGED_PARSE_OUTDATED_AT_PHASE_D) BEFORE any
    // apply/commit — its show never enters affectedShowIds. This drives the "nothing commits" arm.
    db.phaseDCasFailDriveIds.add("existing-1");

    const response = await handleOnboardingFinalizeCas(request(), deps(db));
    expect(response.status).toBe(409);
    expect(db.appliedShadows).toEqual([]);
    expect(finalizedCalls()).toHaveLength(0);
  });

  test("(3) COMMITTED-THEN-LOOP-THROWS: row A commits (logs), row B throws out of the loop → A's log fired, request 500s", async () => {
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [shadow("existing-A"), shadow("existing-B")];

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Row A applies via the real fake path (commits → affectedShowIds → log fires as withRowTx
    // resolves). Row B throws an UNEXPECTED error out of the per-row callback — modeling a fault
    // that escapes the loop AFTER a sibling already committed durably.
    const response = await handleOnboardingFinalizeCas(request(), {
      ...deps(db),
      withRowTx: async (driveFileId, fn) => {
        if (driveFileId === "existing-B") {
          throw new Error("kaboom: unexpected per-row fault escaping the loop");
        }
        return fn(db, makeFakePipelineTx(db));
      },
    });

    // The throw escapes runFinalizeCas → the route's outer catch → typed 500 (never empty).
    expect(response.status).toBe(500);
    expect(await json(response)).toMatchObject({
      ok: false,
      code: "ONBOARDING_FINALIZE_INTERNAL_ERROR",
    });

    // Row A committed BEFORE the throw, so its SHOW_FINALIZED log already fired — durable and
    // NOT rolled back by the later throw. Row B never committed → no log for it.
    expect(db.appliedShadows).toEqual(["existing-A"]);
    const calls = finalizedCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      code: "SHOW_FINALIZED",
      showId: LIVE_SHOW_ID,
      wizardSessionId: W1,
      result: "final_cas",
      actorEmail: ADMIN_EMAIL,
    });
    errorSpy.mockRestore();
  });

  test("(4) MIXED batch: row A commits, row B typed-409-blocked (siblings continue) → log for A only, none for B", async () => {
    const db = new FakeFinalizeCasDb();
    // Ordered by drive_file_id (readShadowRows order by drive_file_id): existing-1 commits;
    // existing-2's live watermark advanced → typed STAGED_PARSE_OUTDATED_AT_PHASE_D per-row 409.
    db.shadowRows = [shadow("existing-1"), shadow("existing-2")];
    db.phaseDCasFailDriveIds.add("existing-2");

    const response = await handleOnboardingFinalizeCas(request(), deps(db));
    expect(response.status).toBe(409);
    expect(await json(response)).toMatchObject({
      ok: false,
      code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
    });

    // Only existing-1 committed; existing-2 was retained (blocked). One log, for the committed show.
    expect(db.appliedShadows).toEqual(["existing-1"]);
    const calls = finalizedCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      code: "SHOW_FINALIZED",
      showId: LIVE_SHOW_ID,
      wizardSessionId: W1,
      result: "final_cas",
      actorEmail: ADMIN_EMAIL,
    });
  });

  test("source-level: the SHOW_FINALIZED log fires from the per-row loop AFTER withRowTx resolves — not inside applyShadow's row tx (placement pin)", () => {
    // Not fully drivable via the fake (both call sites would produce identical mock calls), so pin
    // the PLACEMENT at source level: the emission is in runFinalizeCas's loop guarded by the OK
    // branch + result.showId, NOT inside applyShadow (which runs INSIDE the pre-commit row tx).
    const src = readFileSync(
      join(process.cwd(), "app/api/admin/onboarding/finalize-cas/route.ts"),
      "utf8",
    );
    const applyShadowStart = src.indexOf("async function applyShadow(");
    const applyShadowEnd = src.indexOf("async function publishAppliedWizardShows(");
    const applyShadowBody = src.slice(applyShadowStart, applyShadowEnd);
    // applyShadow must NOT emit the outcome log (it runs before its row tx commits).
    expect(applyShadowBody).not.toContain("logAdminOutcome");

    // The emission lives in runFinalizeCas, gated by result.showId inside the OK branch.
    const runStart = src.indexOf("async function runFinalizeCas(");
    const runBody = src.slice(
      runStart,
      src.indexOf("export async function handleOnboardingFinalizeCas("),
    );
    const logAt = runBody.indexOf("logAdminOutcome");
    expect(logAt).toBeGreaterThan(-1);
    // The emission is gated on the committed-show id (only durably-applied rows carry one), so a
    // discarded_by_choice OK or a blocked row never logs. Guard precedes the emission.
    const guardAt = runBody.indexOf("if (showId)");
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(logAt);
    expect(runBody).toContain('code: "SHOW_FINALIZED"');
    expect(runBody).toContain('source: "api.admin.onboarding.finalize-cas"');
    expect(runBody).toContain('result: "final_cas"');
  });
});
