import { describe, expect, test, vi } from "vitest";

// Mock the durable outcome logger (SHOW_FINALIZED telemetry) so the finalize route's post-commit
// emission can be asserted without a real app_events write. Hoisted so the vi.mock factory can
// reference it (same dispatch style as tests/onboarding/wizardScopedReapply.test.ts).
const logAdminOutcomeMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/log/logAdminOutcome", () => ({ logAdminOutcome: logAdminOutcomeMock }));

import {
  handleOnboardingFinalize,
  handleOnboardingFinalizeStream,
} from "@/app/api/admin/onboarding/finalize/route";
import { handleWizardStagedApply } from "@/app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route";
import { W1, FakeFinalizeDb, pending, deps, json, request, parseResult } from "./_finalizeFake";

function applyRequest(wizardSessionId: string, driveFileId: string, stagedId: string): Request {
  return new Request(
    `https://crew.fxav.test/api/admin/onboarding/staged/${wizardSessionId}/${driveFileId}/apply`,
    {
      method: "POST",
      body: JSON.stringify({
        stagedId,
        reviewerChoicesVersion: 1,
        reviewerChoices: [],
      }),
      headers: { "content-type": "application/json" },
    },
  );
}

async function reapplyDemotedRow(db: FakeFinalizeDb, driveFileId: string): Promise<Response> {
  const row = db.approved.find((candidate) => candidate.drive_file_id === driveFileId);
  if (!row) throw new Error(`missing fake pending row for ${driveFileId}`);
  return await handleWizardStagedApply(
    applyRequest(W1, driveFileId, row.staged_id),
    { params: Promise.resolve({ wizardSessionId: W1, driveFileId }) },
    {
      requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
      withRowTx: vi.fn(async (_lockedDriveFileId, fn) =>
        fn({
          queryOne: vi.fn(async () => ({ held: true })),
        } as never),
      ),
      applyStaged: vi.fn(async (args) => {
        row.wizard_approved = true;
        row.wizard_approved_by_email = args.appliedByEmail;
        row.wizard_reviewer_choices = args.reviewerChoices;
        row.wizard_reviewer_choices_version = 1;
        db.manifestStatuses.set(driveFileId, "applied");
        return {
          outcome: "wizard_applied" as const,
          wizardSessionId: W1,
          stagedId: row.staged_id,
        };
      }),
    },
  );
}

describe("POST /api/admin/onboarding/finalize", () => {
  // Regression: the finalize revision-guard peer of the apply revision-race
  // false positive (M12 Phase 0.F smoke 3). `staged_modified_time` is read from
  // pending_syncs via postgres.js, which yields a JS Date (not an ISO string).
  // The route's local sameTimestamp ran Date.parse(<Date>), dropping the
  // milliseconds, so an UNEDITED sheet whose live Drive modifiedTime matched the
  // staged value to the millisecond was demoted with
  // STAGED_PARSE_REVISION_RACE_DURING_FINALIZE — blocking the publish step (the
  // existing tests never caught this because they used ".000Z", which has no ms
  // to lose). Every prior onboarding sheet would hit this once apply was fixed.
  test("does not false-fire the finalize revision guard for a Date staged_modified_time (postgres.js) at the same instant", async () => {
    const INSTANT = "2026-05-09T03:44:06.040Z"; // nonzero ms — the trigger
    const db = new FakeFinalizeDb();
    db.approved = [
      // postgres.js returns a Date for the timestamptz column.
      pending("first-seen-1", { staged_modified_time: new Date(INSTANT) as unknown as string }),
    ];

    const response = await handleOnboardingFinalize(
      request(),
      deps(db, {
        fetchDriveFileMetadata: vi.fn(async (driveFileId: string) => ({
          driveFileId,
          name: `${driveFileId}.xlsx`,
          mimeType: "application/vnd.google-apps.spreadsheet",
          modifiedTime: INSTANT, // same instant, ISO string with milliseconds
          parents: ["folder-1"],
        })),
      }),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      per_row: [{ drive_file_id: "first-seen-1", wizard_session_id: W1, code: "OK" }],
    });
    // Published as a draft (reached the publish step), NOT demoted.
    expect(db.firstSeenApplied).toEqual(["first-seen-1"]);
    expect(db.demoted).toEqual([]);
  });

  // True-positive preserved: a genuine later edit must still demote with the
  // finalize revision-race code (the guard still fires on a real edit).
  test("still fires the finalize revision guard when the sheet was genuinely edited", async () => {
    const db = new FakeFinalizeDb();
    db.approved = [
      pending("first-seen-1", {
        staged_modified_time: new Date("2026-05-09T03:44:06.040Z") as unknown as string,
      }),
    ];

    const response = await handleOnboardingFinalize(
      request(),
      deps(db, {
        fetchDriveFileMetadata: vi.fn(async (driveFileId: string) => ({
          driveFileId,
          name: `${driveFileId}.xlsx`,
          mimeType: "application/vnd.google-apps.spreadsheet",
          modifiedTime: "2026-05-09T03:45:00.000Z", // a real edit, ~1 min later
          parents: ["folder-1"],
        })),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await json(response)) as {
      per_row: Array<{ drive_file_id: string; code: string; display_name?: string }>;
    };
    expect(body).toMatchObject({
      per_row: [
        {
          drive_file_id: "first-seen-1",
          code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
        },
      ],
    });
    // The blocked row carries the parsed show title — derived from the pending() builder, which
    // sets parse_result.show.title to `Show ${driveFileId}` (NOT hardcoded).
    const FS1_TITLE = `Show first-seen-1`;
    const failed = body.per_row.find((r) => r.drive_file_id === "first-seen-1")!;
    expect(failed.code).toBe("STAGED_PARSE_REVISION_RACE_DURING_FINALIZE");
    expect(failed.display_name).toBe(FS1_TITLE);
    expect(db.demoted).toEqual([
      { driveFileId: "first-seen-1", code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE" },
    ]);
    expect(db.firstSeenApplied).toEqual([]);
  });

  // Empty show title → helper returns null → the choke point omits display_name entirely (not a
  // present `undefined`, per exactOptionalPropertyTypes) → the client falls back to the id.
  test("blocker per_row OMITS display_name when the parsed show title is empty", async () => {
    const db = new FakeFinalizeDb();
    db.approved = [
      pending("first-seen-1", {
        staged_modified_time: new Date("2026-05-09T03:44:06.040Z") as unknown as string,
        parse_result: parseResult(""),
      }),
    ];

    const response = await handleOnboardingFinalize(
      request(),
      deps(db, {
        fetchDriveFileMetadata: vi.fn(async (driveFileId: string) => ({
          driveFileId,
          name: `${driveFileId}.xlsx`,
          mimeType: "application/vnd.google-apps.spreadsheet",
          modifiedTime: "2026-05-09T03:45:00.000Z", // a real edit → revision race blocks the row
          parents: ["folder-1"],
        })),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await json(response)) as {
      per_row: Array<{ drive_file_id: string; code: string; display_name?: string }>;
    };
    const failed = body.per_row.find((r) => r.drive_file_id === "first-seen-1")!;
    expect(failed.code).toBe("STAGED_PARSE_REVISION_RACE_DURING_FINALIZE");
    expect(failed).not.toHaveProperty("display_name");
  });

  test("processes one batch: first-seen rows apply as unpublished drafts and existing rows stage shadow changes", async () => {
    // F1 Task 1.4 fixture instants — the shadow payload must carry these VERBATIM from the
    // pending row (it is deleted right after staging, so Phase D has no other source).
    const EXISTING_ITEMS = [
      {
        id: "i-mi11",
        invariant: "MI-11",
        crew_name: "Ada",
        prior_email: "ada@old.com",
        new_email: "ada@new.com",
      },
    ];
    const EXISTING_BASE = "2026-05-06T00:00:00.000Z";
    const EXISTING_APPROVED_AT = "2026-05-08T12:34:56.789Z";

    const db = new FakeFinalizeDb();
    db.approved = [
      pending("first-seen-1"),
      pending("existing-1", {
        triggered_review_items: EXISTING_ITEMS,
        base_modified_time: EXISTING_BASE,
        wizard_approved_at: EXISTING_APPROVED_AT,
      }),
    ];
    db.existingShows.add("existing-1");

    const response = await handleOnboardingFinalize(request(), deps(db));

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      status: "all_batches_complete",
      wizard_session_id: W1,
      remaining_count: 0,
      per_row: [
        { drive_file_id: "first-seen-1", wizard_session_id: W1, code: "OK" },
        { drive_file_id: "existing-1", wizard_session_id: W1, code: "OK" },
      ],
    });
    expect(db.checkpoint?.status).toBe("all_batches_complete");
    expect(db.firstSeenApplied).toEqual(["first-seen-1"]);
    expect(db.auditRows).toEqual(["first-seen-1"]);
    expect(db.stagedShadows).toEqual(["existing-1"]);
    expect(db.deletedPending).toEqual(["first-seen-1", "existing-1"]);

    // F1 Task 1.4: the shadow payload carries triggered_review_items + base_modified_time
    // copied from pending_syncs BEFORE deleteApprovedPending, and applied_at_intent is the
    // seeded Apply-click instant (wizard_approved_at), NOT a now() window (spec §3.1 R8-1).
    expect(db.stagedShadowParams).toHaveLength(1);
    const shadowParams = db.stagedShadowParams[0]!;
    expect(shadowParams[7]).toEqual(EXISTING_ITEMS); // $8::jsonb triggered_review_items
    expect(shadowParams[8]).toBe(EXISTING_BASE); // $9::timestamptz base_modified_time
    expect(shadowParams[9]).toBe(EXISTING_APPROVED_AT); // $10::timestamptz applied_at_intent
  });

  test("returns all_batches_complete only after approved rows and unresolved manifest rows are gone", async () => {
    const db = new FakeFinalizeDb();

    const response = await handleOnboardingFinalize(request(), deps(db));

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      status: "all_batches_complete",
      wizard_session_id: W1,
      remaining_count: 0,
      unresolved_manifest_count: 0,
    });
    expect(db.checkpoint?.status).toBe("all_batches_complete");
  });

  test("final real batch transitions checkpoint to all_batches_complete when it processes every approved row", async () => {
    const db = new FakeFinalizeDb();
    db.approved = Array.from({ length: 50 }, (_, index) => pending(`single-${index}`));

    const response = await handleOnboardingFinalize(request(), deps(db));

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      status: "all_batches_complete",
      wizard_session_id: W1,
      remaining_count: 0,
      unresolved_manifest_count: 0,
    });
    expect(db.checkpoint?.status).toBe("all_batches_complete");
    expect(db.approved).toEqual([]);
    expect(db.deletedPending).toHaveLength(50);
  });

  test("third multi-batch finalize call transitions checkpoint to all_batches_complete after processing the remaining approved rows", async () => {
    const db = new FakeFinalizeDb();
    db.approved = Array.from({ length: 250 }, (_, index) => pending(`multi-${index}`));
    const routeDeps = deps(db);

    const first = await handleOnboardingFinalize(request(), routeDeps);
    expect(first.status).toBe(200);
    expect(await json(first)).toMatchObject({
      status: "batch_complete",
      wizard_session_id: W1,
      remaining_count: 150,
    });
    expect(db.checkpoint?.status).toBe("in_progress");

    const second = await handleOnboardingFinalize(request(), routeDeps);
    expect(second.status).toBe(200);
    expect(await json(second)).toMatchObject({
      status: "batch_complete",
      wizard_session_id: W1,
      remaining_count: 50,
    });
    expect(db.checkpoint?.status).toBe("in_progress");

    const third = await handleOnboardingFinalize(request(), routeDeps);
    expect(third.status).toBe(200);
    expect(await json(third)).toMatchObject({
      status: "all_batches_complete",
      wizard_session_id: W1,
      remaining_count: 0,
      unresolved_manifest_count: 0,
    });
    expect(db.checkpoint?.status).toBe("all_batches_complete");
    expect(db.approved).toEqual([]);
    expect(db.deletedPending).toHaveLength(250);
  });

  test("last-row failure demotion keeps finalize in progress until the row is reapplied and finalized", async () => {
    const db = new FakeFinalizeDb();
    db.approved = [pending("failure-last-1"), pending("failure-last-2"), pending("failure-last-3")];
    const routeDeps = deps(db, {
      fetchDriveFileMetadata: vi.fn(async (driveFileId: string) => ({
        driveFileId,
        name: `${driveFileId}.xlsx`,
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime:
          driveFileId === "failure-last-3"
            ? "2026-05-08T12:01:00.000Z"
            : "2026-05-08T12:00:00.000Z",
        parents: ["folder-1"],
      })),
    });

    const first = await handleOnboardingFinalize(request(), routeDeps);

    expect(first.status).toBe(200);
    expect(await json(first)).toMatchObject({
      status: "batch_complete",
      wizard_session_id: W1,
      remaining_count: 0,
      unresolved_manifest_count: 1,
      per_row: [
        { drive_file_id: "failure-last-1", code: "OK" },
        { drive_file_id: "failure-last-2", code: "OK" },
        {
          drive_file_id: "failure-last-3",
          code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
          re_apply_url:
            "/admin/onboarding/staged/11111111-1111-4111-8111-111111111111/failure-last-3",
        },
      ],
    });
    expect(db.checkpoint?.status).toBe("in_progress");
    expect(db.manifestStatuses.get("failure-last-3")).toBe("staged");
    expect(db.approved.find((row) => row.drive_file_id === "failure-last-3")).toMatchObject({
      wizard_approved: false,
      wizard_approved_by_email: null,
    });

    const reapply = await reapplyDemotedRow(db, "failure-last-3");
    expect(reapply.status).toBe(200);
    expect(await json(reapply)).toEqual({
      status: "reapplied",
      wizard_session_id: W1,
      drive_file_id: "failure-last-3",
    });

    const second = await handleOnboardingFinalize(
      request(),
      deps(db, {
        fetchDriveFileMetadata: vi.fn(async (driveFileId: string) => ({
          driveFileId,
          name: `${driveFileId}.xlsx`,
          mimeType: "application/vnd.google-apps.spreadsheet",
          modifiedTime: "2026-05-08T12:00:00.000Z",
          parents: ["folder-1"],
        })),
      }),
    );

    expect(second.status).toBe(200);
    expect(await json(second)).toMatchObject({
      status: "all_batches_complete",
      wizard_session_id: W1,
      remaining_count: 0,
      unresolved_manifest_count: 0,
      per_row: [{ drive_file_id: "failure-last-3", code: "OK" }],
    });
    expect(db.checkpoint?.status).toBe("all_batches_complete");
  });

  test("last-row failure in the final multi-batch keeps finalize in progress", async () => {
    const db = new FakeFinalizeDb();
    db.approved = Array.from({ length: 250 }, (_, index) => pending(`multi-failure-${index}`));
    const routeDeps = deps(db, {
      fetchDriveFileMetadata: vi.fn(async (driveFileId: string) => ({
        driveFileId,
        name: `${driveFileId}.xlsx`,
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime:
          driveFileId === "multi-failure-249"
            ? "2026-05-08T12:01:00.000Z"
            : "2026-05-08T12:00:00.000Z",
        parents: ["folder-1"],
      })),
    });

    await handleOnboardingFinalize(request(), routeDeps);
    await handleOnboardingFinalize(request(), routeDeps);
    const third = await handleOnboardingFinalize(request(), routeDeps);

    expect(third.status).toBe(200);
    expect(await json(third)).toMatchObject({
      status: "batch_complete",
      wizard_session_id: W1,
      remaining_count: 0,
      unresolved_manifest_count: 1,
    });
    expect(db.checkpoint?.status).toBe("in_progress");
    expect(db.manifestStatuses.get("multi-failure-249")).toBe("staged");
    expect(db.approved.find((row) => row.drive_file_id === "multi-failure-249")).toMatchObject({
      wizard_approved: false,
      wizard_approved_by_email: null,
    });
  });

  test("rejects early completion when unresolved manifest rows remain", async () => {
    const db = new FakeFinalizeDb();
    db.unresolvedManifestCount = 1;

    const response = await handleOnboardingFinalize(request(), deps(db));

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({
      ok: false,
      code: "ONBOARDING_NOT_RESOLVED",
      unresolved_manifest_count: 1,
    });
  });

  test("rejects an already-complete checkpoint when unresolved manifest rows remain", async () => {
    const db = new FakeFinalizeDb();
    db.checkpoint = {
      wizard_session_id: W1,
      status: "all_batches_complete",
      batches_completed: 3,
    };
    db.unresolvedManifestCount = 1;

    const response = await handleOnboardingFinalize(request(), deps(db));

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({
      ok: false,
      code: "ONBOARDING_NOT_RESOLVED",
      unresolved_manifest_count: 1,
    });
    expect(db.checkpoint.status).toBe("all_batches_complete");
  });

  test("returns CONCURRENT_FINALIZE_IN_FLIGHT when the session finalize lock is held elsewhere", async () => {
    const db = new FakeFinalizeDb();
    db.finalizeLocked = false;

    const response = await handleOnboardingFinalize(request(), deps(db));

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ ok: false, code: "CONCURRENT_FINALIZE_IN_FLIGHT" });
    expect(db.operations).toEqual(["read-session", "try-finalize-lock"]);
  });

  test("demotes a row when Drive head modifiedTime changed between approval and finalize", async () => {
    const db = new FakeFinalizeDb();
    db.approved = [pending("race-1")];

    const response = await handleOnboardingFinalize(
      request(),
      deps(db, {
        fetchDriveFileMetadata: vi.fn(async (driveFileId: string) => ({
          driveFileId,
          name: `${driveFileId}.xlsx`,
          mimeType: "application/vnd.google-apps.spreadsheet",
          modifiedTime: "2026-05-08T12:01:00.000Z",
          parents: ["folder-1"],
        })),
      }),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      status: "batch_complete",
      per_row: [
        {
          drive_file_id: "race-1",
          wizard_session_id: W1,
          code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
          re_apply_url: "/admin/onboarding/staged/11111111-1111-4111-8111-111111111111/race-1",
        },
      ],
    });
    expect(db.demoted).toEqual([
      { driveFileId: "race-1", code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE" },
    ]);
    expect(db.deletedPending).toEqual([]);
  });

  test("demotes a row when Drive head is outside the pending folder", async () => {
    const db = new FakeFinalizeDb();
    db.approved = [pending("moved-1")];

    const response = await handleOnboardingFinalize(
      request(),
      deps(db, {
        fetchDriveFileMetadata: vi.fn(async (driveFileId: string) => ({
          driveFileId,
          name: `${driveFileId}.xlsx`,
          mimeType: "application/vnd.google-apps.spreadsheet",
          modifiedTime: "2026-05-08T12:00:00.000Z",
          parents: ["other-folder"],
        })),
      }),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      status: "batch_complete",
      per_row: [
        {
          drive_file_id: "moved-1",
          wizard_session_id: W1,
          code: "STAGED_PARSE_SOURCE_OUT_OF_SCOPE",
          re_apply_url: "/admin/onboarding/staged/11111111-1111-4111-8111-111111111111/moved-1",
        },
      ],
    });
    expect(db.demoted).toEqual([
      { driveFileId: "moved-1", code: "STAGED_PARSE_SOURCE_OUT_OF_SCOPE" },
    ]);
    expect(db.deletedPending).toEqual([]);
  });

  test("demotes unsupported reviewer-choice payloads instead of finalizing them", async () => {
    const db = new FakeFinalizeDb();
    db.approved = [pending("version-1", { wizard_reviewer_choices_version: 2 })];

    const response = await handleOnboardingFinalize(request(), deps(db));

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      per_row: [
        {
          drive_file_id: "version-1",
          wizard_session_id: W1,
          code: "WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED",
          re_apply_url: "/admin/onboarding/staged/11111111-1111-4111-8111-111111111111/version-1",
        },
      ],
    });
    expect(db.demoted).toEqual([
      { driveFileId: "version-1", code: "WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED" },
    ]);
  });

  // WM-R6 — third instance of the malformed-ELEMENT class (WM-R4/WM-R5 covered the shadow
  // payload gate). Phase B's checks were array-only: a stored `[null]` element passed them
  // and threw inside validateReviewerChoices (`choice.item_id`) / the items `.map`, which the
  // route wrapper turned into ONBOARDING_FINALIZE_INTERNAL_ERROR — wedging the WHOLE batch
  // with no per-row recovery. These pin the per-row demote posture instead: typed
  // STAGED_REVIEW_ITEMS_CORRUPT, re_apply_url, siblings continue, row re-applyable.
  test("demotes a first-seen row whose wizard_reviewer_choices contain a malformed element; siblings continue; row is re-applyable", async () => {
    const db = new FakeFinalizeDb();
    db.approved = [
      pending("corrupt-choice-1", { wizard_reviewer_choices: [null] }),
      pending("healthy-1"),
    ];

    const first = await handleOnboardingFinalize(request(), deps(db));

    expect(first.status).toBe(200);
    expect(await json(first)).toMatchObject({
      status: "batch_complete",
      per_row: [
        {
          drive_file_id: "corrupt-choice-1",
          wizard_session_id: W1,
          code: "STAGED_REVIEW_ITEMS_CORRUPT",
          re_apply_url:
            "/admin/onboarding/staged/11111111-1111-4111-8111-111111111111/corrupt-choice-1",
        },
        { drive_file_id: "healthy-1", code: "OK" },
      ],
    });
    expect(db.demoted).toEqual([
      { driveFileId: "corrupt-choice-1", code: "STAGED_REVIEW_ITEMS_CORRUPT" },
    ]);
    // The sibling finished its first-seen apply; the corrupt row applied NOTHING.
    expect(db.firstSeenApplied).toEqual(["healthy-1"]);
    expect(db.deletedPending).toEqual(["healthy-1"]);
    expect(db.manifestStatuses.get("corrupt-choice-1")).toBe("staged");

    // Recovery: re-apply through the staged review page (writes fresh validated choices) …
    const reapply = await reapplyDemotedRow(db, "corrupt-choice-1");
    expect(reapply.status).toBe(200);

    // … then the next finalize batch processes the row cleanly.
    const second = await handleOnboardingFinalize(request(), deps(db));
    expect(second.status).toBe(200);
    expect(await json(second)).toMatchObject({
      status: "all_batches_complete",
      per_row: [{ drive_file_id: "corrupt-choice-1", code: "OK" }],
    });
  });

  test("demotes a first-seen row whose triggered_review_items contain a malformed element instead of 500ing the batch", async () => {
    const db = new FakeFinalizeDb();
    db.approved = [
      pending("corrupt-items-1", { triggered_review_items: [null] }),
      pending("healthy-2"),
    ];

    const response = await handleOnboardingFinalize(request(), deps(db));

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      status: "batch_complete",
      per_row: [
        {
          drive_file_id: "corrupt-items-1",
          wizard_session_id: W1,
          code: "STAGED_REVIEW_ITEMS_CORRUPT",
          re_apply_url:
            "/admin/onboarding/staged/11111111-1111-4111-8111-111111111111/corrupt-items-1",
        },
        { drive_file_id: "healthy-2", code: "OK" },
      ],
    });
    expect(db.demoted).toEqual([
      { driveFileId: "corrupt-items-1", code: "STAGED_REVIEW_ITEMS_CORRUPT" },
    ]);
    expect(db.firstSeenApplied).toEqual(["healthy-2"]);
    expect(db.deletedPending).toEqual(["healthy-2"]);
    expect(db.approved.find((row) => row.drive_file_id === "corrupt-items-1")).toMatchObject({
      wizard_approved: false,
      wizard_approved_by_email: null,
    });
  });

  test("an existing-show row with a malformed review-item element demotes at Phase B and stages NO shadow", async () => {
    const db = new FakeFinalizeDb();
    db.existingShows.add("corrupt-existing-1");
    db.approved = [
      pending("corrupt-existing-1", {
        triggered_review_items: [{ id: "i1", invariant: "MI-12" }], // missing removed_name/added_name
      }),
    ];

    const response = await handleOnboardingFinalize(request(), deps(db));

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      per_row: [{ drive_file_id: "corrupt-existing-1", code: "STAGED_REVIEW_ITEMS_CORRUPT" }],
    });
    expect(db.stagedShadows).toEqual([]);
    expect(db.demoted).toEqual([
      { driveFileId: "corrupt-existing-1", code: "STAGED_REVIEW_ITEMS_CORRUPT" },
    ]);
  });

  test("provenance UPDATE matching 0 rows throws FirstSeenProvenanceRaceError BEFORE deleteApprovedPending; the loop demotes with WIZARD_SESSION_SUPERSEDED", async () => {
    // Defense-in-depth (F1 Task 1.3): if a wizard-session supersession ever committed between
    // the core apply and the provenance UPDATE, the UPDATE's active-session EXISTS predicate
    // matches 0 rows. Without the returning-check, the per-row tx would still COMMIT an
    // unpublished show with NO created_show_id recorded AND consume the staging row — a
    // permanent invisible orphan (F4's reap can't identify it; Phase D's narrowed flip never
    // publishes it; no pending row left to re-apply). TODAY this interleaving is unreachable —
    // readActiveSessionForUpdate holds app_settings FOR UPDATE for the whole outer batch (the
    // lock-topology DB test pins that serialization); this unit test pins the guard against
    // future lock refactors.
    const db = new FakeFinalizeDb();
    db.approved = [pending("provenance-race-1")];
    db.provenanceRecordSucceeds = false; // simulate the FOR UPDATE being weakened/removed

    const response = await handleOnboardingFinalize(request(), deps(db));

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      per_row: [
        {
          drive_file_id: "provenance-race-1",
          wizard_session_id: W1,
          code: "WIZARD_SESSION_SUPERSEDED",
          re_apply_url:
            "/admin/onboarding/staged/11111111-1111-4111-8111-111111111111/provenance-race-1",
        },
      ],
    });
    // The throw aborts the per-row transaction BEFORE the staged row is consumed — the
    // pending_syncs row survives for re-apply (spy op-order, not just absence):
    expect(db.operations).toContain("record-provenance");
    expect(db.operations).not.toContain("delete-pending");
    expect(db.deletedPending).toEqual([]);
    // …and the loop's catch demotes the row in a FRESH per-row tx with the cataloged code:
    expect(db.demoted).toEqual([
      { driveFileId: "provenance-race-1", code: "WIZARD_SESSION_SUPERSEDED" },
    ]);
    expect(db.approved.find((row) => row.drive_file_id === "provenance-race-1")).toMatchObject({
      wizard_approved: false,
      wizard_approved_by_email: null,
    });
  });

  test("never returns an empty 500 — an unexpected throw becomes a typed JSON error + console.error", async () => {
    // Failure mode this catches: the publish loop threw an uncaught error (the
    // M12 Phase 0.F smoke-3 parse_result TypeError was one instance), Next.js
    // returned a 500 with an EMPTY body, and the client's `response.json()`
    // failed with "Unexpected end of JSON input". The wrapper must turn ANY
    // unexpected throw into a parseable JSON body carrying a typed code, and log
    // the underlying message so the next failure is diagnosable from logs.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new Error("kaboom: simulated unexpected finalize failure");
    const response = await handleOnboardingFinalize(request(), {
      requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
      withTx: async () => {
        throw boom;
      },
    });

    expect(response.status).toBe(500);
    // This line would itself throw on an empty body — that is the regression.
    const body = (await json(response)) as { ok?: boolean; code?: string };
    expect(body).toMatchObject({ ok: false, code: "ONBOARDING_FINALIZE_INTERNAL_ERROR" });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test("a missing-approver-email defensive throw is surfaced as a typed 500, not an empty body", async () => {
    // The DB CHECK (pending_syncs_approved_requires_full_payload) makes this
    // unreachable in practice; if it ever fires, finalize must NOT leak an empty
    // 500. The wrapper converts the throw into a diagnosable JSON 500.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = new FakeFinalizeDb();
    db.approved = [pending("missing-email-1", { wizard_approved_by_email: null })];

    const response = await handleOnboardingFinalize(request(), deps(db));
    expect(response.status).toBe(500);
    const body = (await json(response)) as { ok?: boolean; code?: string };
    expect(body).toMatchObject({ ok: false, code: "ONBOARDING_FINALIZE_INTERNAL_ERROR" });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  // Task 8 — durable SHOW_FINALIZED outcome telemetry. The route stages an OUTCOME-REF inside the
  // withTx callback (before each committed-success return) and emits logAdminOutcome AFTER withTx
  // resolves (post-commit). Both the streaming and non-streaming handlers funnel through the same
  // executeFinalizeBatch core, so a single emit covers both. Expected values are derived from the
  // shared fake fixtures (W1, the deps() admin email), never hardcoded independently of them.
  describe("SHOW_FINALIZED outcome telemetry", () => {
    // The admin email the shared deps()/streamDeps() harness authenticates as (its
    // requireAdminIdentity mock). Derived from the fixture, not an independent literal.
    const FIXTURE_ADMIN_EMAIL = "doug@example.com";

    async function readNdjson(res: Response): Promise<Array<Record<string, unknown>>> {
      const text = await res.text();
      return text
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    }

    test("(1) a NON-STREAMED terminal committed success emits SHOW_FINALIZED post-commit with the response status", async () => {
      logAdminOutcomeMock.mockClear();
      const db = new FakeFinalizeDb();
      db.approved = [pending("first-seen-1")];

      const response = await handleOnboardingFinalize(request(), deps(db));

      // Derive the expected result from the authoritative response body (anti-tautology: the
      // telemetry result must equal the terminal HTTP status the route actually returned).
      expect(response.status).toBe(200);
      const body = (await json(response)) as { status: string; wizard_session_id: string };
      expect(logAdminOutcomeMock).toHaveBeenCalledTimes(1);
      expect(logAdminOutcomeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "SHOW_FINALIZED",
          source: "api.admin.onboarding.finalize",
          actorEmail: FIXTURE_ADMIN_EMAIL,
          wizardSessionId: body.wizard_session_id, // === W1
          result: body.status, // "all_batches_complete" for this single clean batch
        }),
      );
      expect(body.wizard_session_id).toBe(W1);
      expect(body.status).toBe("all_batches_complete");
    });

    test("(2) a STREAMED terminal committed success emits SHOW_FINALIZED once, matching the terminal result body", async () => {
      logAdminOutcomeMock.mockClear();
      const db = new FakeFinalizeDb();
      db.approved = [pending("stream-seen-1")];

      const res = await handleOnboardingFinalizeStream(
        request(),
        // No-op source-anchor fetch so the first-seen apply never attempts a real Drive read.
        deps(db, { fetchOnboardingSourceAnchors: vi.fn(async () => ({})) }),
      );
      expect(res.status).toBe(200);
      const msgs = await readNdjson(res);
      const result = msgs.find((m) => m.type === "result") as
        | { type: "result"; body: { status: string; wizard_session_id: string } }
        | undefined;
      expect(result).toBeDefined();

      expect(logAdminOutcomeMock).toHaveBeenCalledTimes(1);
      expect(logAdminOutcomeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "SHOW_FINALIZED",
          source: "api.admin.onboarding.finalize",
          actorEmail: FIXTURE_ADMIN_EMAIL,
          wizardSessionId: result!.body.wizard_session_id, // === W1
          result: result!.body.status, // authoritative terminal status from the stream body
        }),
      );
      expect(result!.body.wizard_session_id).toBe(W1);
      expect(result!.body.status).toBe("all_batches_complete");
    });

    test("(3) a POST-SUCCESS commit failure returns the typed 500 and does NOT emit SHOW_FINALIZED (ref set inside tx, emit is post-wrapper)", async () => {
      // Inject a withTx that runs the batch callback to its terminal-success return (so the
      // OUTCOME-REF is SET inside the callback) and THEN rejects — modeling a commit fault after
      // the batch body succeeded. Because the emit is placed AFTER withTx resolves, the rejection
      // routes into the outer catch (typed 500) and logAdminOutcome is NEVER reached. This is the
      // load-bearing proof of ref→post-wrapper placement (a naive in-callback emit would fire here).
      logAdminOutcomeMock.mockClear();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const db = new FakeFinalizeDb();
      db.approved = [pending("commit-fault-1")];
      const commitError = new Error("simulated post-success commit failure");

      const response = await handleOnboardingFinalize(
        request(),
        deps(db, {
          withTx: async (fn) => {
            // Run the batch to its committed-success return (ref SET), then reject the commit.
            await fn(db);
            throw commitError;
          },
        }),
      );

      expect(response.status).toBe(500);
      const body = (await json(response)) as { ok?: boolean; code?: string };
      expect(body).toMatchObject({ ok: false, code: "ONBOARDING_FINALIZE_INTERNAL_ERROR" });
      // The proof: the ref was set inside the callback, but the post-commit emit never ran.
      expect(logAdminOutcomeMock).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    test("(4) an idempotent re-poll of an already-finalized session does NOT emit SHOW_FINALIZED", async () => {
      // Codex whole-diff HIGH: the final_cas_done / already-all_batches_complete returns commit no
      // finalize mutation THIS request — logging there would create a FALSE audit entry on every
      // re-poll. Drive the final_cas_done branch (no approved rows, checkpoint already done) and
      // assert the terminal all_batches_complete response STILL returns but NO outcome is logged.
      logAdminOutcomeMock.mockClear();
      const db = new FakeFinalizeDb();
      db.checkpoint = { wizard_session_id: W1, status: "final_cas_done", batches_completed: 3 };
      db.approved = [];

      const response = await handleOnboardingFinalize(request(), deps(db));

      expect(response.status).toBe(200);
      expect(await json(response)).toMatchObject({
        status: "all_batches_complete",
        wizard_session_id: W1,
      });
      expect(logAdminOutcomeMock).not.toHaveBeenCalled();
    });

    test("(4) a mid-batch 409 (CONCURRENT_FINALIZE_IN_FLIGHT) does NOT emit SHOW_FINALIZED", async () => {
      logAdminOutcomeMock.mockClear();
      const db = new FakeFinalizeDb();
      db.finalizeLocked = false; // try-finalize-lock returns not-locked → 409 before any commit

      const response = await handleOnboardingFinalize(request(), deps(db));

      expect(response.status).toBe(409);
      expect(await json(response)).toEqual({ ok: false, code: "CONCURRENT_FINALIZE_IN_FLIGHT" });
      expect(logAdminOutcomeMock).not.toHaveBeenCalled();
    });
  });
});
