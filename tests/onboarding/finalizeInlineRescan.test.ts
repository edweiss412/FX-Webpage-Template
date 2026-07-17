import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the durable outcome logger so the finalize route's post-commit SHOW_FINALIZED emission
// does not attempt a real app_events write (same pattern as finalize.test.ts).
const logAdminOutcomeMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/log/logAdminOutcome", () => ({ logAdminOutcome: logAdminOutcomeMock }));

import { handleOnboardingFinalize } from "@/app/api/admin/onboarding/finalize/route";
import { setLogSink, resetLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import type { DriveListedFile } from "@/lib/drive/list";
import type { RescanDecisionOutcome } from "@/lib/onboarding/applyRescanDecisionUnderLock";
import {
  FakeFinalizeDb,
  pipelineWithHoldPort,
  preparedSheetFor,
  pending,
  deps,
  json,
  request,
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
});
