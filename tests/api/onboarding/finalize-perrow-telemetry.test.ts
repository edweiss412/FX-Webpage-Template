import { afterEach, describe, expect, test, vi } from "vitest";
import { setLogSink, resetLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import { handleOnboardingFinalize } from "@/app/api/admin/onboarding/finalize/route";
import { handleOnboardingFinalizeCas } from "@/app/api/admin/onboarding/finalize-cas/route";
import { W1, FakeFinalizeDb, pending, deps, request } from "../../onboarding/_finalizeFake";
import {
  W1 as CAS_W1,
  request as casRequest,
  shadowPayload,
  FakeFinalizeCasDb,
  deps as casDeps,
} from "../../onboarding/_finalizeCasFake";

// S2 — finalize / finalize-cas per-row hard-fail durable telemetry (POST-COMMIT flush).
// setLogSink capture proves the per-row log.error/warn AND the existing SHOW_FINALIZED (via
// logAdminOutcome → log.info) both land, and that a rolled-back batch emits NEITHER. The per-row
// codes are REUSED catalog codes (no NEW_FORENSIC_CODES change).

function capture(): LogRecord[] {
  const sink: LogRecord[] = [];
  setLogSink((r) => {
    sink.push(r);
  });
  return sink;
}
afterEach(() => resetLogSink());

describe("finalize per-row hard-fail telemetry", () => {
  test("mixed committed batch → SHOW_FINALIZED + one log.error DRIVE_FETCH_FAILED + one log.warn revision-race", async () => {
    const sink = capture();
    const db = new FakeFinalizeDb();
    db.approved = [pending("ok-1"), pending("drive-fail-1"), pending("revrace-1")];
    const response = await handleOnboardingFinalize(
      request(),
      deps(db, {
        fetchDriveFileMetadata: vi.fn(async (driveFileId: string) => {
          if (driveFileId === "drive-fail-1") throw new Error("drive down");
          return {
            driveFileId,
            name: `${driveFileId}.xlsx`,
            mimeType: "application/vnd.google-apps.spreadsheet",
            // revrace-1: modifiedTime later than the staged instant → revision race.
            modifiedTime:
              driveFileId === "revrace-1" ? "2026-05-08T13:00:00.000Z" : "2026-05-08T12:00:00.000Z",
            parents: ["folder-1"],
          };
        }),
      }),
    );
    expect(response.status).toBe(200);

    // Existing success telemetry still fires (batch_complete — one OK row committed).
    const finalized = sink.filter((r) => r.code === "SHOW_FINALIZED");
    expect(finalized).toHaveLength(1);

    const driveFail = sink.filter((r) => r.code === "DRIVE_FETCH_FAILED");
    expect(driveFail).toHaveLength(1);
    expect(driveFail[0]!.level).toBe("error");
    expect(driveFail[0]!.source).toBe("api.admin.onboarding.finalize");
    expect(driveFail[0]!.driveFileId).toBe("drive-fail-1");
    expect(driveFail[0]!.context.wizardSessionId).toBe(W1);

    const revRace = sink.filter((r) => r.code === "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE");
    expect(revRace).toHaveLength(1);
    expect(revRace[0]!.level).toBe("warn");
    expect(revRace[0]!.driveFileId).toBe("revrace-1");
    expect(revRace[0]!.context.wizardSessionId).toBe(W1);
  });

  test("rolled-back batch (commit fault) → NO per-row failure emission and NO SHOW_FINALIZED", async () => {
    const sink = capture();
    const db = new FakeFinalizeDb();
    db.approved = [pending("ok-1"), pending("drive-fail-1")];
    const response = await handleOnboardingFinalize(
      request(),
      deps(db, {
        // Callback resolves (mutations staged), but the COMMIT faults → outer catch → typed 500.
        // The post-commit flush is never reached, mirroring SHOW_FINALIZED.
        withTx: async (fn) => {
          await fn(db);
          throw new Error("commit fault");
        },
        fetchDriveFileMetadata: vi.fn(async (driveFileId: string) => {
          if (driveFileId === "drive-fail-1") throw new Error("drive down");
          return {
            driveFileId,
            name: `${driveFileId}.xlsx`,
            mimeType: "application/vnd.google-apps.spreadsheet",
            modifiedTime: "2026-05-08T12:00:00.000Z",
            parents: ["folder-1"],
          };
        }),
      }),
    );
    expect(response.status).toBe(500);
    expect(sink.some((r) => r.code === "SHOW_FINALIZED")).toBe(false);
    expect(sink.some((r) => r.code === "DRIVE_FETCH_FAILED")).toBe(false);
  });
});

describe("finalize-cas per-row hard-fail telemetry", () => {
  test("blocked shadow row → log.warn STAGED_PARSE_OUTDATED_AT_PHASE_D (driveFileId + wizardSessionId)", async () => {
    const sink = capture();
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [
      {
        wizard_session_id: CAS_W1,
        drive_file_id: "existing-1",
        show_id: "22222222-2222-4222-8222-222222222222",
        applied_by_email: "apply-admin@example.com",
        applied_at_intent: "2026-05-08T12:00:00.000Z",
        payload: shadowPayload(),
      },
    ];
    db.sessionCreatedDriveIds = ["first-seen-1"];
    db.phaseDCasFailDriveIds.add("existing-1");

    const response = await handleOnboardingFinalizeCas(casRequest(), casDeps(db));
    expect(response.status).toBe(409);

    const blocked = sink.filter((r) => r.code === "STAGED_PARSE_OUTDATED_AT_PHASE_D");
    expect(blocked).toHaveLength(1);
    expect(blocked[0]!.level).toBe("warn");
    expect(blocked[0]!.source).toBe("api.admin.onboarding.finalize-cas");
    expect(blocked[0]!.driveFileId).toBe("existing-1");
    expect(blocked[0]!.context.wizardSessionId).toBe(CAS_W1);
  });
});
