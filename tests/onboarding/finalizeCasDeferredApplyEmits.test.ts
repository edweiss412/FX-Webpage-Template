/**
 * Units B + C, finalize-cas — BOTH handlers (spec 2026-08-03-apply-undo-audit-fidelity §2.3).
 *
 * `applyShadow` obtained a real `roleFlagsNotice` from the shared apply core and returned without
 * it (BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP), and had no sink for an unlanded identity-link
 * rename. Both now ride the caller-only channel out of `applyShadow`, are collected per COMMITTED
 * row, and are flushed in the `finally` of each handler's own outer transaction.
 *
 * The streaming handler is covered by every structural test here, not just a smoke test: POST
 * dispatches to it on the admin finalize button's NDJSON Accept header, so it is the path real
 * operators use and the one whose omission would leave production dark.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { RoleFlagsNotice } from "@/lib/sync/phase2";
import type { UnlandedRename } from "@/lib/sync/applyParseResult";

const SHOW_ID = "22222222-2222-4222-8222-222222222222";

const applyStagedCoreMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sync/applyStagedCore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sync/applyStagedCore")>();
  return { ...actual, applyStagedCore: applyStagedCoreMock };
});

// The durable app_events sink BOTH emitters write through — spying here keeps the assertions
// end-to-end rather than stopping at the emitter's front door.
const persistAppEventStrictMock = vi.hoisted(() =>
  vi.fn(
    async (_record: unknown): Promise<{ ok: true } | { ok: false; error: unknown }> => ({
      ok: true,
    }),
  ),
);
vi.mock("@/lib/log/persist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/log/persist")>();
  return { ...actual, persistAppEventStrict: persistAppEventStrictMock };
});

const upsertAdminAlertMock = vi.hoisted(() => vi.fn(async () => "alert-1"));
vi.mock("@/lib/adminAlerts/upsertAdminAlert", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/adminAlerts/upsertAdminAlert")>();
  return { ...actual, upsertAdminAlert: upsertAdminAlertMock };
});

vi.mock("@/lib/log/logAdminOutcome", () => ({ logAdminOutcome: vi.fn(async () => {}) }));

import {
  handleOnboardingFinalizeCas,
  handleOnboardingFinalizeCasStream,
} from "@/app/api/admin/onboarding/finalize-cas/route";
import {
  W1,
  FakeFinalizeCasDb,
  makeFakePipelineTx,
  deps,
  json,
  request,
  shadowPayload,
} from "./_finalizeCasFake";

const LEAD_NOTICE: RoleFlagsNotice = {
  showId: SHOW_ID,
  code: "ROLE_FLAGS_NOTICE",
  context: {
    drive_file_id: "existing-1",
    changes: [{ crew_name: "Ada Byron", prior_flags: [], new_flags: ["LEAD"] }],
  },
};

const UNLANDED: UnlandedRename = {
  pair: { removedName: "Old Name", addedName: "New Name" },
  reason: "target_absent",
  sourceSurvived: true,
};

function appliedCore(overrides: Record<string, unknown> = {}) {
  return {
    outcome: "applied" as const,
    showId: SHOW_ID,
    syncAuditId: "audit-1",
    derivedSideEffects: { revokeFloorForNames: [] },
    parseWarnings: [],
    appliedRoleMappings: [],
    ...overrides,
  };
}

function shadow(driveFileId: string) {
  return {
    wizard_session_id: W1,
    drive_file_id: driveFileId,
    show_id: SHOW_ID,
    applied_by_email: "apply-admin@example.com",
    applied_at_intent: "2026-05-08T12:00:00.000Z",
    payload: shadowPayload(),
  };
}

let trace: string[] = [];

function tracingDeps(db: FakeFinalizeCasDb, opts: { withTxThrows?: Error } = {}) {
  return deps(db, {
    withTx: async (fn) => {
      trace.push("outer-tx-begin");
      try {
        const out = await fn(db);
        if (opts.withTxThrows) throw opts.withTxThrows;
        return out;
      } finally {
        trace.push("outer-tx-end");
      }
    },
  });
}

function emittedCodes(): string[] {
  return persistAppEventStrictMock.mock.calls.map(
    (call) => (call[0] as unknown as { code?: string }).code ?? "",
  );
}

// Both handlers, driven through one table so no structural case can silently cover only the
// non-streaming fallback. `drain` normalizes the two response shapes.
const HANDLERS = [
  {
    name: "non-streaming",
    run: handleOnboardingFinalizeCas,
    drain: async (res: Response) => await json(res),
  },
  {
    name: "streaming",
    run: handleOnboardingFinalizeCasStream,
    drain: async (res: Response) => {
      const lines = (await res.text()).split("\n").filter((line) => line.trim().length > 0);
      const messages = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
      return messages.find((m) => m.type === "result")?.body;
    },
  },
] as const;

beforeEach(() => {
  trace = [];
  applyStagedCoreMock.mockReset();
  persistAppEventStrictMock.mockReset();
  persistAppEventStrictMock.mockImplementation(async (record: unknown) => {
    trace.push(`event:${(record as { code?: string }).code ?? ""}`);
    return { ok: true };
  });
  upsertAdminAlertMock.mockReset();
  upsertAdminAlertMock.mockImplementation(async () => {
    trace.push("alert:ROLE_FLAGS_NOTICE");
    return "alert-1";
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(HANDLERS)("finalize-cas ($name): deferred post-commit apply emits", (handler) => {
  test("Unit C: a LEAD capability flip reaches BOTH the durable event and the feed nudge", async () => {
    applyStagedCoreMock.mockResolvedValue(appliedCore({ roleFlagsNotice: LEAD_NOTICE }));
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [shadow("existing-1")];

    await handler.drain(await handler.run(request(), tracingDeps(db)));

    expect(emittedCodes()).toContain("LEAD_ROLE_APPLIED");
    expect(upsertAdminAlertMock).toHaveBeenCalledTimes(1);
    expect(upsertAdminAlertMock).toHaveBeenCalledWith(LEAD_NOTICE);
    // The load-bearing order: durable audit BEFORE the throwing alert upsert.
    expect(trace.indexOf("event:LEAD_ROLE_APPLIED")).toBeLessThan(
      trace.indexOf("alert:ROLE_FLAGS_NOTICE"),
    );
  });

  test("Unit B: an unlanded rename produces IDENTITY_LINK_RENAME_UNLANDED end-to-end", async () => {
    applyStagedCoreMock.mockResolvedValue(appliedCore({ unlandedRenames: [UNLANDED] }));
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [shadow("existing-1")];

    await handler.drain(await handler.run(request(), tracingDeps(db)));

    const unlandedEvents = persistAppEventStrictMock.mock.calls
      .map((call) => call[0] as unknown as Record<string, unknown>)
      .filter((record) => record.code === "IDENTITY_LINK_RENAME_UNLANDED");
    expect(unlandedEvents).toHaveLength(1);
    expect(unlandedEvents[0]).toMatchObject({
      showId: SHOW_ID,
      driveFileId: "existing-1",
      context: {
        removedName: "Old Name",
        addedName: "New Name",
        reason: "target_absent",
        sourceSurvived: true,
      },
    });
  });

  test("response shape: per_row carries neither roleFlagsNotice nor unlandedRenames", async () => {
    applyStagedCoreMock.mockResolvedValue(
      appliedCore({ roleFlagsNotice: LEAD_NOTICE, unlandedRenames: [UNLANDED] }),
    );
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [shadow("existing-1")];

    const body = (await handler.drain(await handler.run(request(), tracingDeps(db)))) as {
      per_row: Array<Record<string, unknown>>;
    };

    expect(body.per_row).toEqual([{ drive_file_id: "existing-1", code: "OK" }]);
    for (const row of body.per_row) {
      expect(Object.keys(row)).not.toContain("roleFlagsNotice");
      expect(Object.keys(row)).not.toContain("unlandedRenames");
    }
    // Anti-tautology: the payload existed on this run — it was emitted, just not returned.
    expect(emittedCodes()).toEqual(
      expect.arrayContaining(["LEAD_ROLE_APPLIED", "IDENTITY_LINK_RENAME_UNLANDED"]),
    );
  });

  test("ordering: nothing is emitted while the finalize lock is held", async () => {
    applyStagedCoreMock.mockResolvedValue(
      appliedCore({ roleFlagsNotice: LEAD_NOTICE, unlandedRenames: [UNLANDED] }),
    );
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [shadow("existing-1")];

    await handler.drain(await handler.run(request(), tracingDeps(db)));

    // Anti-tautology: the lock really was taken, and this run really emitted something.
    expect(db.operations).toContain("try-finalize-lock");
    expect(
      trace.filter((entry) => entry.startsWith("event:") || entry.startsWith("alert:")),
    ).toHaveLength(3);
    const txEnd = trace.indexOf("outer-tx-end");
    expect(txEnd).toBeGreaterThan(-1);
    for (const [index, entry] of trace.entries()) {
      if (entry.startsWith("event:") || entry.startsWith("alert:")) {
        expect(index, `${entry} was emitted before the outer transaction ended`).toBeGreaterThan(
          txEnd,
        );
      }
    }
  });

  test("durability: a LATER row's throw does not drop the committed first row's emits", async () => {
    applyStagedCoreMock.mockResolvedValue(
      appliedCore({ roleFlagsNotice: LEAD_NOTICE, unlandedRenames: [UNLANDED] }),
    );
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [shadow("existing-1"), shadow("existing-2")];
    let rows = 0;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await handler.drain(
      await handler.run(
        request(),
        deps(db, {
          withTx: async (fn) => {
            trace.push("outer-tx-begin");
            try {
              return await fn(db);
            } finally {
              trace.push("outer-tx-end");
            }
          },
          // Row 1's own transaction commits; row 2 rejects.
          withRowTx: async (_driveFileId, fn) => {
            rows += 1;
            if (rows === 2) throw new Error("simulated row-2 failure");
            return await fn(db, makeFakePipelineTx(db));
          },
        }),
      ),
    );

    expect(rows).toBe(2);
    expect(emittedCodes()).toEqual(
      expect.arrayContaining(["LEAD_ROLE_APPLIED", "IDENTITY_LINK_RENAME_UNLANDED"]),
    );
    expect(upsertAdminAlertMock).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  test("durability: an outer-commit failure does not drop an independently committed row's emits", async () => {
    applyStagedCoreMock.mockResolvedValue(
      appliedCore({ roleFlagsNotice: LEAD_NOTICE, unlandedRenames: [UNLANDED] }),
    );
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [shadow("existing-1")];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await handler.drain(
      await handler.run(
        request(),
        tracingDeps(db, { withTxThrows: new Error("simulated post-success commit failure") }),
      ),
    );

    expect(emittedCodes()).toEqual(
      expect.arrayContaining(["LEAD_ROLE_APPLIED", "IDENTITY_LINK_RENAME_UNLANDED"]),
    );
    expect(trace.indexOf("event:LEAD_ROLE_APPLIED")).toBeGreaterThan(trace.indexOf("outer-tx-end"));
    errorSpy.mockRestore();
  });

  test("fail-open: a throwing upsertAdminAlert still reaches markFinalCasDone", async () => {
    applyStagedCoreMock.mockResolvedValue(appliedCore({ roleFlagsNotice: LEAD_NOTICE }));
    upsertAdminAlertMock.mockImplementation(async () => {
      trace.push("alert:ROLE_FLAGS_NOTICE");
      throw new Error("admin alert upsert failed");
    });
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [shadow("existing-1")];

    const body = (await handler.drain(await handler.run(request(), tracingDeps(db)))) as {
      status?: string;
    };

    // The flush is fail-open AND post-transaction, so the CAS tail is untouched by the throw.
    expect(body.status).toBe("finalize_complete");
    expect(db.operations).toContain("mark-final-cas-done");
    expect(db.checkpoint?.status).toBe("final_cas_done");
    // The durable record was still written first — the throw is caught downstream of it.
    expect(emittedCodes()).toContain("LEAD_ROLE_APPLIED");
  });
});
