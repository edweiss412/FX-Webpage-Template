/**
 * Units B + C, ordinary finalize (spec 2026-08-03-apply-undo-audit-fidelity §2.3).
 *
 * `app/api/admin/onboarding/finalize/route.ts` obtained a real `roleFlagsNotice` from the shared
 * apply core and DISCARDED it, and had no sink at all for an unlanded identity-link rename. Both
 * now ride an internal per-row envelope out through `withRowTx` and are flushed in the `finally`
 * of the outer transaction.
 *
 * Lives in its own file rather than in finalize.test.ts because it mocks `applyStagedCore` — the
 * shared fake DB has no crew fixture that can drive a capability flip or an unlanded pair, and a
 * file-scoped mock of the apply core would change every other test in that file.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { RoleFlagsNotice } from "@/lib/sync/phase2";
import type { UnlandedRename } from "@/lib/sync/applyParseResult";

const SHOW_ID = "44444444-4444-4444-8444-444444444444";

// The apply core is the only realistic producer of these payloads; stub it so a first-seen row
// commits WITH a capability flip and an unlanded pair.
const applyStagedCoreMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sync/applyStagedCore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sync/applyStagedCore")>();
  return { ...actual, applyStagedCore: applyStagedCoreMock };
});

// The durable app_events sink BOTH emitters write through. Spying here (rather than on the
// emitters) keeps the assertion end-to-end: it fails if the route drops the payload AND if the
// route reaches an emitter with the wrong contents.
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

// The coalescing feed nudge (the "bell").
const upsertAdminAlertMock = vi.hoisted(() => vi.fn(async () => "alert-1"));
vi.mock("@/lib/adminAlerts/upsertAdminAlert", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/adminAlerts/upsertAdminAlert")>();
  return { ...actual, upsertAdminAlert: upsertAdminAlertMock };
});

vi.mock("@/lib/log/logAdminOutcome", () => ({ logAdminOutcome: vi.fn(async () => {}) }));

import {
  handleOnboardingFinalize,
  handleOnboardingFinalizeStream,
} from "@/app/api/admin/onboarding/finalize/route";
import { FakeFinalizeDb, pending, deps, json, request } from "./_finalizeFake";

const LEAD_NOTICE: RoleFlagsNotice = {
  showId: SHOW_ID,
  code: "ROLE_FLAGS_NOTICE",
  context: {
    drive_file_id: "first-seen-1",
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

// Ordered trace of every observable emit + the outer transaction's boundaries. The ordering test
// reads this; the lock is taken INSIDE the outer tx and released with it, so anything recorded
// after "outer-tx-end" provably ran with no lock held.
let trace: string[] = [];

function tracingDeps(db: FakeFinalizeDb, opts: { withTxThrows?: Error } = {}) {
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

describe("ordinary finalize: deferred post-commit apply emits", () => {
  test("Unit C: a LEAD capability flip reaches BOTH the durable event and the feed nudge", async () => {
    applyStagedCoreMock.mockResolvedValue(appliedCore({ roleFlagsNotice: LEAD_NOTICE }));
    const db = new FakeFinalizeDb();
    db.approved = [pending("first-seen-1")];

    const response = await handleOnboardingFinalize(request(), tracingDeps(db));

    expect(response.status).toBe(200);
    expect(emittedCodes()).toContain("LEAD_ROLE_APPLIED");
    expect(upsertAdminAlertMock).toHaveBeenCalledTimes(1);
    expect(upsertAdminAlertMock).toHaveBeenCalledWith(LEAD_NOTICE);
    // The load-bearing order: the durable audit is written BEFORE the throwing alert upsert.
    expect(trace.indexOf("event:LEAD_ROLE_APPLIED")).toBeLessThan(
      trace.indexOf("alert:ROLE_FLAGS_NOTICE"),
    );
  });

  test("Unit B: an unlanded rename produces IDENTITY_LINK_RENAME_UNLANDED end-to-end", async () => {
    applyStagedCoreMock.mockResolvedValue(appliedCore({ unlandedRenames: [UNLANDED] }));
    const db = new FakeFinalizeDb();
    db.approved = [pending("first-seen-1")];

    const response = await handleOnboardingFinalize(request(), tracingDeps(db));

    expect(response.status).toBe(200);
    const unlandedEvents = persistAppEventStrictMock.mock.calls
      .map((call) => call[0] as unknown as Record<string, unknown>)
      .filter((record) => record.code === "IDENTITY_LINK_RENAME_UNLANDED");
    expect(unlandedEvents).toHaveLength(1);
    expect(unlandedEvents[0]).toMatchObject({
      showId: SHOW_ID,
      driveFileId: "first-seen-1",
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
    const db = new FakeFinalizeDb();
    db.approved = [pending("first-seen-1")];

    const response = await handleOnboardingFinalize(request(), tracingDeps(db));
    const body = (await json(response)) as { per_row: Array<Record<string, unknown>> };

    expect(body.per_row).toEqual([
      { drive_file_id: "first-seen-1", wizard_session_id: expect.any(String), code: "OK" },
    ]);
    // Explicit, so a widened response type cannot pass by deep-equal drift on a renamed key.
    for (const row of body.per_row) {
      expect(Object.keys(row)).not.toContain("roleFlagsNotice");
      expect(Object.keys(row)).not.toContain("unlandedRenames");
    }
    // Anti-tautology: the payload really existed on this run — it was emitted, just not returned.
    expect(emittedCodes()).toEqual(
      expect.arrayContaining(["LEAD_ROLE_APPLIED", "IDENTITY_LINK_RENAME_UNLANDED"]),
    );
  });

  test("ordering: nothing is emitted while the finalize lock is held", async () => {
    applyStagedCoreMock.mockResolvedValue(
      appliedCore({ roleFlagsNotice: LEAD_NOTICE, unlandedRenames: [UNLANDED] }),
    );
    const db = new FakeFinalizeDb();
    db.approved = [pending("first-seen-1")];

    await handleOnboardingFinalize(request(), tracingDeps(db));

    // Anti-tautology: the lock really was taken, and this run really emitted something — a route
    // that emits nothing at all would otherwise satisfy the ordering loop below vacuously.
    expect(db.operations).toContain("try-finalize-lock");
    expect(
      trace.filter((entry) => entry.startsWith("event:") || entry.startsWith("alert:")),
    ).toHaveLength(3); // LEAD_ROLE_APPLIED + ROLE_FLAGS_NOTICE alert + IDENTITY_LINK_RENAME_UNLANDED
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
    const db = new FakeFinalizeDb();
    db.approved = [pending("first-seen-1"), pending("first-seen-2")];
    const rowError = new Error("simulated row-2 failure");
    let rows = 0;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await handleOnboardingFinalize(
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
        // Row 1 commits (its own transaction resolves); row 2 rejects.
        withRowTx: async (driveFileId, fn) => {
          rows += 1;
          if (rows === 2) throw rowError;
          const { fakePipelineTx } = await import("./_finalizeFake");
          return await fn(db, fakePipelineTx(db));
        },
      }),
    );

    expect(response.status).toBe(500);
    expect(emittedCodes()).toEqual(
      expect.arrayContaining(["LEAD_ROLE_APPLIED", "IDENTITY_LINK_RENAME_UNLANDED"]),
    );
    expect(upsertAdminAlertMock).toHaveBeenCalledTimes(1);
    // Anti-tautology: the loop really reached a SECOND row (the one that threw), so the surviving
    // emits above are row 1's and not an artifact of a single-row batch.
    expect(rows).toBe(2);
    errorSpy.mockRestore();
  });

  test("durability: an outer-commit failure does not drop an independently committed row's emits", async () => {
    applyStagedCoreMock.mockResolvedValue(
      appliedCore({ roleFlagsNotice: LEAD_NOTICE, unlandedRenames: [UNLANDED] }),
    );
    const db = new FakeFinalizeDb();
    db.approved = [pending("first-seen-1")];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await handleOnboardingFinalize(
      request(),
      tracingDeps(db, { withTxThrows: new Error("simulated post-success commit failure") }),
    );

    // The batch rolled back at the outer boundary, but the row's OWN transaction committed.
    expect(response.status).toBe(500);
    expect(emittedCodes()).toEqual(
      expect.arrayContaining(["LEAD_ROLE_APPLIED", "IDENTITY_LINK_RENAME_UNLANDED"]),
    );
    // Still outside the lock: the flush runs after the outer transaction unwound.
    expect(trace.indexOf("event:LEAD_ROLE_APPLIED")).toBeGreaterThan(trace.indexOf("outer-tx-end"));
    errorSpy.mockRestore();
  });

  test("fail-open: a throwing upsertAdminAlert leaves the durable event written and the response intact", async () => {
    applyStagedCoreMock.mockResolvedValue(appliedCore({ roleFlagsNotice: LEAD_NOTICE }));
    upsertAdminAlertMock.mockImplementation(async () => {
      trace.push("alert:ROLE_FLAGS_NOTICE");
      throw new Error("admin alert upsert failed");
    });
    const db = new FakeFinalizeDb();
    db.approved = [pending("first-seen-1")];

    const response = await handleOnboardingFinalize(request(), tracingDeps(db));

    expect(response.status).toBe(200);
    expect(emittedCodes()).toContain("LEAD_ROLE_APPLIED");
  });

  test("the STREAMING handler flushes the same emits (shared batch core)", async () => {
    applyStagedCoreMock.mockResolvedValue(
      appliedCore({ roleFlagsNotice: LEAD_NOTICE, unlandedRenames: [UNLANDED] }),
    );
    const db = new FakeFinalizeDb();
    db.approved = [pending("first-seen-1")];

    const res = await handleOnboardingFinalizeStream(request(), tracingDeps(db));
    await res.text();

    expect(emittedCodes()).toEqual(
      expect.arrayContaining(["LEAD_ROLE_APPLIED", "IDENTITY_LINK_RENAME_UNLANDED"]),
    );
    expect(trace.indexOf("event:LEAD_ROLE_APPLIED")).toBeGreaterThan(trace.indexOf("outer-tx-end"));
  });
});
