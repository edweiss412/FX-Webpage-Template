import { describe, expect, test, vi } from "vitest";
import {
  handleOnboardingFinalizeCas,
  handleOnboardingFinalizeCasStream,
} from "@/app/api/admin/onboarding/finalize-cas/route";
import { FakeFinalizeCasDb, deps, json, request, shadowPayload, W1 } from "./_finalizeCasFake";

const NDJSON = "application/x-ndjson";

async function readNdjson(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function shadow(driveFileId: string) {
  return {
    wizard_session_id: W1,
    drive_file_id: driveFileId,
    show_id: "22222222-2222-4222-8222-222222222222",
    applied_by_email: "apply-admin@example.com",
    applied_at_intent: "2026-05-08T12:00:00.000Z",
    payload: shadowPayload(),
  };
}

describe("handleOnboardingFinalizeCasStream", () => {
  test("streams applying → publishing → subscribing → finalize_complete; subscribe called once after commit", async () => {
    const seed = () => {
      const db = new FakeFinalizeCasDb();
      db.shadowRows = [shadow("existing-1")];
      db.sessionCreatedDriveIds = ["first-seen-1"];
      return db;
    };

    const dbStream = seed();
    const routeDeps = deps(dbStream);
    const res = await handleOnboardingFinalizeCasStream(request(), routeDeps);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(NDJSON);

    const msgs = await readNdjson(res);
    const phases = msgs.filter((m) => m.type === "phase").map((m) => m.phase);
    expect(phases).toEqual(["applying", "publishing", "subscribing"]);

    const results = msgs.filter((m) => m.type === "result");
    expect(results).toHaveLength(1);
    expect((results[0]!.body as { status: string }).status).toBe("finalize_complete");
    expect(routeDeps.subscribeToWatchedFolder).toHaveBeenCalledTimes(1);
    expect(routeDeps.subscribeToWatchedFolder).toHaveBeenCalledWith("folder-1");

    // Anti-tautology: terminal body deep-equals the non-streaming body for an identical fake.
    const nonStream = await handleOnboardingFinalizeCas(request(), deps(seed()));
    expect(results[0]!.body).toEqual(await json(nonStream));
  });

  test("blocked shadow: emits applying then a terminal ok:false with per_row; no publishing/subscribing; subscribe NOT called", async () => {
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [shadow("existing-1")];
    db.phaseDCasFailDriveIds.add("existing-1"); // live show advanced → STAGED_PARSE_OUTDATED_AT_PHASE_D
    const routeDeps = deps(db);

    const msgs = await readNdjson(await handleOnboardingFinalizeCasStream(request(), routeDeps));
    const phases = msgs.filter((m) => m.type === "phase").map((m) => m.phase);
    expect(phases).toEqual(["applying"]); // stopped before publishing/subscribing

    const results = msgs.filter((m) => m.type === "result");
    expect(results).toHaveLength(1);
    expect(results[0]!.body).toMatchObject({
      ok: false,
      code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
    });
    expect(
      (results[0]!.body as { per_row: Array<{ drive_file_id: string; code: string }> }).per_row,
    ).toEqual([
      {
        drive_file_id: "existing-1",
        code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
        display_name: "Existing Show",
      },
    ]);
    expect(routeDeps.subscribeToWatchedFolder).not.toHaveBeenCalled();
  });

  test("the subscribing phase is emitted BEFORE the post-commit subscribe runs (ordering proof)", async () => {
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [shadow("existing-1")];
    db.sessionCreatedDriveIds = ["first-seen-1"];
    // If subscribe ran before the emit, a throwing subscribe would suppress the subscribing event.
    const res = await handleOnboardingFinalizeCasStream(
      request(),
      deps(db, {
        subscribeToWatchedFolder: vi.fn(async () => {
          throw new Error("subscribe boom");
        }),
      }),
    );
    const msgs = await readNdjson(res);
    const phases = msgs.filter((m) => m.type === "phase").map((m) => m.phase);
    expect(phases).toEqual(["applying", "publishing", "subscribing"]); // subscribing emitted before the throw
    const results = msgs.filter((m) => m.type === "result");
    expect(results[0]!.body).toMatchObject({
      ok: false,
      code: "ONBOARDING_FINALIZE_INTERNAL_ERROR",
    });
  });

  test("auth failure returns a NON-stream 403 JSON (pre-stream)", async () => {
    const db = new FakeFinalizeCasDb();
    const res = await handleOnboardingFinalizeCasStream(
      request(),
      deps(db, {
        requireAdminIdentity: vi.fn(async () => {
          throw { code: "ADMIN_FORBIDDEN" };
        }),
      }),
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).not.toBe(NDJSON);
    expect(await res.json()).toEqual({ ok: false, code: "ADMIN_FORBIDDEN" });
  });
});
