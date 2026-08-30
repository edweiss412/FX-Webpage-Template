import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the durable outcome logger so the finalize route's post-commit SHOW_FINALIZED emission
// does not attempt a real app_events write (same pattern as finalize.test.ts).
const logAdminOutcomeMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/log/logAdminOutcome", () => ({ logAdminOutcome: logAdminOutcomeMock }));

import {
  handleOnboardingFinalize,
  handleOnboardingFinalizeStream,
} from "@/app/api/admin/onboarding/finalize/route";
import { setLogSink, resetLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import type { DriveListedFile } from "@/lib/drive/list";
import type { RescanDecisionOutcome } from "@/lib/onboarding/applyRescanDecisionUnderLock";
import { PrepareOnboardingFileError } from "@/lib/sync/runOnboardingScan";
import {
  FakeFinalizeDb,
  pipelineWithHoldPort,
  preparedSheetFor,
  pending,
  deps,
  json,
  request,
  parseResult,
} from "./_finalizeFake";

const D = "D_DRIFT";
const T0 = "2026-05-08T12:00:00.000Z"; // staged modified time (what finalize captured)
const T1 = "2026-06-01T09:30:00.000Z"; // Google-bumped live modifiedTime (cosmetic drift)

function driftedMetadata(driveFileId: string): DriveListedFile {
  return {
    driveFileId,
    name: `${driveFileId}.xlsx`,
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: T1,
    parents: ["folder-1"],
  };
}

function preparedSheet(driveFileId: string) {
  return preparedSheetFor(driveFileId, "East Coast");
}

function seededDb(): FakeFinalizeDb {
  const db = new FakeFinalizeDb();
  db.approved = [pending(D, { staged_modified_time: T0 })];
  db.existingShows.add(D); // publish via existing-show shadow path (hold-port-free in the fake)
  return db;
}

function driftDeps(db: FakeFinalizeDb, overrides: Parameters<typeof deps>[1] = {}) {
  return deps(db, {
    withRowTx: async (_driveFileId, fn) => fn(db, pipelineWithHoldPort(db)),
    fetchDriveFileMetadata: vi.fn(async (id: string) => driftedMetadata(id)),
    ...overrides,
  });
}

describe("finalize inline re-parse on modtime drift (Thread 3)", () => {
  afterEach(() => {
    resetLogSink();
    logAdminOutcomeMock.mockClear();
  });

  it("CLEAN cosmetic drift: does not demote, re-binds fresh identifiers, publishes, emits auto-heal log", async () => {
    const db = seededDb();
    const records: LogRecord[] = [];
    setLogSink((r) => {
      records.push(r);
    });

    // The real core would re-stage and re-stamp approval; the fake mirrors the DB effects the
    // rebind + publish path depends on (fresh staged_modified_time = metadata.modifiedTime; approved).
    const fakeCore = vi.fn(async (_tx, input): Promise<RescanDecisionOutcome> => {
      const r = db.approved.find((x) => x.drive_file_id === input.driveFileId)!;
      r.staged_modified_time = T1;
      r.wizard_approved = true;
      r.wizard_approved_by_email = "doug@example.com";
      r.wizard_reviewer_choices_version = 1;
      return { kind: "clean_restamped", changed: true };
    });

    const res = await handleOnboardingFinalize(
      request(),
      driftDeps(db, {
        prepareOnboardingFiles: vi.fn(async () => [preparedSheet(D)]),
        applyRescanDecisionUnderLock: fakeCore as never,
      }),
    );

    const body = (await json(res)) as { per_row: Array<{ code: string }> };
    expect(fakeCore).toHaveBeenCalledOnce();
    // Not demoted with the revision-race code.
    expect(db.demoted.some((d) => d.code === "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE")).toBe(
      false,
    );
    // Reached publish (existing-show shadow staged).
    expect(db.stagedShadows).toContain(D);
    expect(body.per_row.every((r) => r.code === "OK")).toBe(true);
    // Post-commit auto-heal breadcrumb: event-keyed log.info, NO §12.4 code field.
    const healed = records.find((r) => r.context?.event === "modtime_autohealed");
    expect(healed?.driveFileId).toBe(D);
    expect(healed?.code).toBeNull();
  });

  it("DIRTY genuine content change: returns RESCAN_REVIEW_REQUIRED, does not publish", async () => {
    const db = seededDb();
    const fakeCore = vi.fn(
      async (): Promise<RescanDecisionOutcome> => ({
        kind: "dirty_demoted",
        changed: true,
        reviewCodes: ["MI-12"],
      }),
    );

    const res = await handleOnboardingFinalize(
      request(),
      driftDeps(db, {
        prepareOnboardingFiles: vi.fn(async () => [preparedSheet(D)]),
        applyRescanDecisionUnderLock: fakeCore as never,
      }),
    );

    const body = (await json(res)) as { per_row: Array<{ code: string }> };
    expect(body.per_row[0]?.code).toBe("RESCAN_REVIEW_REQUIRED");
    expect(db.stagedShadows).not.toContain(D);
  });

  it("Drive export fails during inline re-parse: DRIVE_FETCH_FAILED demote, not published", async () => {
    const db = seededDb();
    const fakeCore = vi.fn(
      async (): Promise<RescanDecisionOutcome> => ({ kind: "clean_restamped", changed: true }),
    );

    const res = await handleOnboardingFinalize(
      request(),
      driftDeps(db, {
        prepareOnboardingFiles: vi.fn(async () => {
          throw new Error("drive export boom");
        }),
        applyRescanDecisionUnderLock: fakeCore as never,
      }),
    );

    const body = (await json(res)) as { per_row: Array<{ code: string }> };
    expect(body.per_row[0]?.code).toBe("DRIVE_FETCH_FAILED");
    expect(db.demoted.some((d) => d.code === "DRIVE_FETCH_FAILED")).toBe(true);
    expect(fakeCore).not.toHaveBeenCalled();
    expect(db.stagedShadows).not.toContain(D);
  });

  it("PARSE fault during inline re-parse: STAGED_PARSE_FAILED demote, not a Drive failure", async () => {
    // BL-RESCAN-PREPARE-ERROR-GRANULARITY: the demote itself is unchanged; what
    // changes is WHY Doug is told it happened. DRIVE_FETCH_FAILED tells him to check
    // his Drive share settings, which is the wrong place when his sheet's structure
    // is what broke. Asserts the persisted demote code too, not just the response
    // body — the two drifting apart is the failure this pins.
    const db = seededDb();
    const fakeCore = vi.fn(
      async (): Promise<RescanDecisionOutcome> => ({ kind: "clean_restamped", changed: true }),
    );

    const res = await handleOnboardingFinalize(
      request(),
      driftDeps(db, {
        prepareOnboardingFiles: vi.fn(async () => {
          throw new PrepareOnboardingFileError("parse", "unexpected section header");
        }),
        applyRescanDecisionUnderLock: fakeCore as never,
      }),
    );

    const body = (await json(res)) as { per_row: Array<{ code: string }> };
    expect(body.per_row[0]?.code).toBe("STAGED_PARSE_FAILED");
    expect(db.demoted.some((d) => d.code === "STAGED_PARSE_FAILED")).toBe(true);
    expect(db.demoted.some((d) => d.code === "DRIVE_FETCH_FAILED")).toBe(false);
    expect(fakeCore).not.toHaveBeenCalled();
    expect(db.stagedShadows).not.toContain(D);
  });

  it("common path (no modtime drift): inline re-parse seams are never touched", async () => {
    const db = seededDb();
    const fakeCore = vi.fn(
      async (): Promise<RescanDecisionOutcome> => ({ kind: "clean_restamped", changed: true }),
    );
    const prepare = vi.fn(async () => [preparedSheet(D)]);

    await handleOnboardingFinalize(
      request(),
      driftDeps(db, {
        // metadata modifiedTime == staged_modified_time → no mismatch → inline path skipped.
        fetchDriveFileMetadata: vi.fn(async (id: string) => ({
          ...driftedMetadata(id),
          modifiedTime: T0,
        })),
        prepareOnboardingFiles: prepare,
        applyRescanDecisionUnderLock: fakeCore as never,
      }),
    );

    expect(prepare).not.toHaveBeenCalled();
    expect(fakeCore).not.toHaveBeenCalled();
    expect(db.stagedShadows).toContain(D);
  });
  // ---------------------------------------------------------------------------
  // Task 3b (spec 2026-08-29 §3.1b): the STREAM must name the parse that was
  // APPLIED, not the one selected before the inline re-scan refreshed it.
  //
  // onRow reads parsedShowTitle(row.parse_result) from the OUTER select-time row.
  // The auto-heal block rebinds only staged_id, staged_modified_time and
  // triggered_review_items — its query does not even SELECT parse_result — so the
  // refreshed parse lives on a local copy inside processApprovedRow and never
  // reaches the outer row. A title-only rename stays clean (computeRescanDecision
  // weighs crew invariants and data-gap regressions, not the title), so the sheet
  // is set up as its new title while the stream reports the old one, with nothing
  // downstream to correct it: a successful per_row entry carries no name.
  // ---------------------------------------------------------------------------
  it("CLEAN title-only drift: the emitted row name is the REFRESHED title, not the select-time one", async () => {
    const db = seededDb();
    const OLD = "Old Show";
    const NEW = "New Show";
    db.approved = [pending(D, { staged_modified_time: T0, parse_result: parseResult(OLD) })];

    // The core re-stages and re-stamps, AND the refreshed parse carries a new title.
    const fakeCore = vi.fn(async (_tx, input): Promise<RescanDecisionOutcome> => {
      const r = db.approved.find((x) => x.drive_file_id === input.driveFileId)!;
      r.staged_modified_time = T1;
      r.wizard_approved = true;
      r.wizard_approved_by_email = "doug@example.com";
      r.wizard_reviewer_choices_version = 1;
      r.parse_result = parseResult(NEW);
      return { kind: "clean_restamped", changed: true };
    });

    const rows: Array<{ name: string | null; driveFileId: string }> = [];
    const res = await handleOnboardingFinalizeStream(
      request(),
      driftDeps(db, {
        applyRescanDecisionUnderLock: fakeCore as never,
        prepareOnboardingFiles: vi.fn(async () => [preparedSheet(D)]),
      }),
    );
    const text = await res.text();
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line) as { type: string; name?: string | null; driveFileId?: string };
      if (msg.type === "row") rows.push({ name: msg.name ?? null, driveFileId: msg.driveFileId! });
    }

    // The fixture must be able to EXPRESS the difference, or the assertion proves
    // nothing: a stable-title fixture cannot tell the stale source from the fresh one.
    expect(OLD).not.toBe(NEW);
    expect(rows).toHaveLength(1);
    // POSITIVE assertion. "not OLD" would pass on the silent-null failure mode:
    // parsedShowTitle is fully defensive, so an unwidened fake projection yields
    // undefined -> null -> the client falls back to the Drive file id.
    expect(rows[0]!.name).toBe(NEW);
  });
  it("post-rescan FAILURE: per_row display_name is the REFRESHED title too", async () => {
    // Case (b) of spec §3.1b. The failure display_name at route.ts:1704-1705 reads the
    // SAME outer row.parse_result the stream does, so it carries the identical staleness.
    // Ordering matters: the row must re-parse CLEANLY and only then fail, so its failure
    // entry is built after the refreshed parse exists. The version gate (route.ts:1223-1230)
    // fires exactly there — it keys on the LOCKED wizard_approved + version.
    const db = seededDb();
    const OLD = "Old Show";
    const NEW = "New Show";
    db.approved = [pending(D, { staged_modified_time: T0, parse_result: parseResult(OLD) })];

    const fakeCore = vi.fn(async (_tx, input): Promise<RescanDecisionOutcome> => {
      const r = db.approved.find((x) => x.drive_file_id === input.driveFileId)!;
      r.staged_modified_time = T1;
      r.wizard_approved = true;
      r.wizard_approved_by_email = "doug@example.com";
      r.parse_result = parseResult(NEW);
      // Unsupported version -> the row clears the rescan, then fails the version gate.
      r.wizard_reviewer_choices_version = 999;
      return { kind: "clean_restamped", changed: true };
    });

    const res = await handleOnboardingFinalize(
      request(),
      driftDeps(db, {
        prepareOnboardingFiles: vi.fn(async () => [preparedSheet(D)]),
        applyRescanDecisionUnderLock: fakeCore as never,
      }),
    );
    const body = (await json(res)) as {
      per_row: Array<{ code: string; display_name?: string }>;
    };

    expect(OLD).not.toBe(NEW);
    const failed = body.per_row.find((r) => r.code !== "OK");
    // Premise: this case only proves anything if the row actually FAILED after the
    // rescan. A row that succeeded carries no display_name at all.
    expect(failed, "the version gate must have failed this row").toBeTruthy();
    expect(failed!.display_name).toBe(NEW);
  });

  // ---------------------------------------------------------------------------
  // Whole-diff R1 BLOCKING + its class. The restage runs INSIDE
  // applyRescanDecisionUnderLock and persists the refreshed parse BEFORE dirtiness
  // is evaluated, but three post-core early returns (route.ts:997 dirty/hard-failed,
  // :1017 schema_missing/superseded/not_staged, :1063 restaged-but-gone) return
  // before the rebind at :1079. Each builds a per-row FAILURE whose display_name
  // reads row.parse_result, so each reported the SELECT-time title against storage
  // that already held the refreshed one. R1 named only the first; the sweep found
  // three, so the repair is one rebind ahead of every branch rather than three patches.
  // ---------------------------------------------------------------------------
  it("DIRTY after a rename: the failure display_name is the REFRESHED title, not the select-time one", async () => {
    const db = seededDb();
    const OLD = "Old Show";
    const NEW = "New Show";
    db.approved = [pending(D, { staged_modified_time: T0, parse_result: parseResult(OLD) })];

    // The restage landed (it precedes the dirty decision in the core), so storage
    // carries NEW while the route's outer row still holds OLD.
    const fakeCore = vi.fn(async (_tx, input): Promise<RescanDecisionOutcome> => {
      const r = db.approved.find((x) => x.drive_file_id === input.driveFileId)!;
      r.parse_result = parseResult(NEW);
      return { kind: "dirty_demoted", changed: true, reviewCodes: ["MI-12"] };
    });

    const res = await handleOnboardingFinalize(
      request(),
      driftDeps(db, {
        prepareOnboardingFiles: vi.fn(async () => [preparedSheetFor(D, NEW)]),
        applyRescanDecisionUnderLock: fakeCore as never,
      }),
    );
    const body = (await json(res)) as {
      per_row: Array<{ code: string; display_name?: string }>;
    };

    expect(OLD).not.toBe(NEW);
    const failed = body.per_row.find((r) => r.code === "RESCAN_REVIEW_REQUIRED");
    // Premise: the assertion below says nothing unless this row actually took the
    // dirty branch. A row that never failed carries no display_name at all.
    expect(failed, "the row must have been demoted for review").toBeTruthy();
    expect(failed!.display_name).toBe(NEW);
  });

  it("SCHEMA_MISSING after a rename: the same rebind covers the second post-restage return", async () => {
    const db = seededDb();
    const OLD = "Old Show";
    const NEW = "New Show";
    db.approved = [pending(D, { staged_modified_time: T0, parse_result: parseResult(OLD) })];

    // A DIFFERENT branch (route.ts:1017) from the one review named, reached through a
    // different outcome kind. Two branches make this a class assertion: a fix that
    // patched only the dirty return would pass the test above and fail this one.
    const fakeCore = vi.fn(
      async (): Promise<RescanDecisionOutcome> => ({
        kind: "schema_missing",
        code: "STAGED_PARSE_FAILED",
      }),
    );

    const res = await handleOnboardingFinalize(
      request(),
      driftDeps(db, {
        prepareOnboardingFiles: vi.fn(async () => [preparedSheetFor(D, NEW)]),
        applyRescanDecisionUnderLock: fakeCore as never,
      }),
    );
    const body = (await json(res)) as {
      per_row: Array<{ code: string; display_name?: string }>;
    };

    expect(OLD).not.toBe(NEW);
    const failed = body.per_row.find((r) => r.code !== "OK");
    expect(failed, "the defensive outcome must have failed this row").toBeTruthy();
    expect(failed!.display_name).toBe(NEW);
  });
});
