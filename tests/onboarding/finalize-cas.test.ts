import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import type { WizardStagedRouteTx } from "@/app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route";
import { handleOnboardingFinalizeCas } from "@/app/api/admin/onboarding/finalize-cas/route";
import { handleWizardStagedApply } from "@/app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route";
import {
  W1,
  EXISTING_SHOW_TITLE,
  parseResult,
  request,
  shadowPayload,
  FakeFinalizeCasDb,
  makeFakePipelineTx,
  deps,
  json,
} from "./_finalizeCasFake";

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
