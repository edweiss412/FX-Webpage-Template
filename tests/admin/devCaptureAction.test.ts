/**
 * tests/admin/devCaptureAction.test.ts — spec 2026-07-22 §5/§4.2 matrix
 * (plan Task 5): gate-first both directions, fail-closed exact-shape guard,
 * probe-row truncation x4 lists x3 cases, events hasMore mapping,
 * infra_error embedding x5, nested warnings caps (staged `warnings`,
 * failures `lastWarnings`, marker literally `warningsTruncated`; syncLog
 * untransformed), commitSha env gate, exact filter plumbing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  gate,
  gateCalls,
  queryEvents,
  queryAlerts,
  querySyncLog,
  queryStagedParses,
  queryIngestFailures,
} = vi.hoisted(() => {
  const gateCalls: string[] = [];
  return {
    gateCalls,
    gate: vi.fn(async () => {
      gateCalls.push("gate");
    }),
    queryEvents: vi.fn(),
    queryAlerts: vi.fn(),
    querySyncLog: vi.fn(),
    queryStagedParses: vi.fn(),
    queryIngestFailures: vi.fn(),
  };
});
vi.mock("@/lib/auth/requireDeveloper", () => ({
  requireDeveloper: gate,
}));
vi.mock("@/lib/observe/query/events", () => ({
  queryEvents: (...a: unknown[]) => queryEvents(...a),
}));
vi.mock("@/lib/observe/query/alerts", () => ({
  queryAlerts: (...a: unknown[]) => queryAlerts(...a),
}));
vi.mock("@/lib/observe/query/syncLog", () => ({
  querySyncLog: (...a: unknown[]) => querySyncLog(...a),
}));
vi.mock("@/lib/observe/query/staged", () => ({
  queryStagedParses: (...a: unknown[]) => queryStagedParses(...a),
}));
vi.mock("@/lib/observe/query/failures", () => ({
  queryIngestFailures: (...a: unknown[]) => queryIngestFailures(...a),
}));

import { captureShowTelemetry, type CaptureTelemetryRequest } from "@/app/admin/_devCaptureAction";

const UUID = "11111111-2222-4333-8444-555555555555";
const readCoreMocks = [
  queryEvents,
  queryAlerts,
  querySyncLog,
  queryStagedParses,
  queryIngestFailures,
];

function okEvents(n: number, hasMore = false) {
  return { kind: "ok", events: Array.from({ length: n }, (_, i) => ({ id: `e${i}` })), hasMore };
}
function okAlerts(n: number) {
  return { kind: "ok", alerts: Array.from({ length: n }, (_, i) => ({ id: `a${i}` })) };
}
function okRows(n: number, extra: Record<string, unknown> = {}) {
  return { kind: "ok", rows: Array.from({ length: n }, (_, i) => ({ id: `r${i}`, ...extra })) };
}

function armPublishedHappy() {
  queryEvents.mockResolvedValue(okEvents(3));
  queryAlerts.mockResolvedValue(okAlerts(3));
  querySyncLog.mockResolvedValue(okRows(3));
}
function armStagedHappy() {
  queryStagedParses.mockResolvedValue(okRows(2));
  queryIngestFailures.mockResolvedValue(okRows(2));
}

beforeEach(() => {
  gate.mockClear();
  gateCalls.splice(0);
  for (const m of readCoreMocks) {
    m.mockReset();
    m.mockImplementation(async () => {
      gateCalls.push("read");
      return { kind: "infra_error", message: "unarmed mock" };
    });
  }
});

describe("gate-first (spec §5 execution order)", () => {
  it("rejected gate propagates and no read-core call happens", async () => {
    gate.mockRejectedValueOnce(new Error("forbidden"));
    await expect(captureShowTelemetry({ kind: "published", showId: UUID })).rejects.toThrow(
      "forbidden",
    );
    for (const m of readCoreMocks) expect(m).not.toHaveBeenCalled();
  });

  it("gate runs before any read-core call on the happy path", async () => {
    armPublishedHappy();
    queryEvents.mockImplementation(async () => {
      gateCalls.push("read");
      return okEvents(1);
    });
    await captureShowTelemetry({ kind: "published", showId: UUID });
    expect(gateCalls[0]).toBe("gate");
    expect(gate).toHaveBeenCalledTimes(1);
  });

  it("invalid request after a passing gate returns bad_request with zero read-core calls", async () => {
    const res = await captureShowTelemetry({
      kind: "published",
      showId: "not-a-uuid",
    } as CaptureTelemetryRequest);
    expect(res).toEqual({ kind: "bad_request" });
    expect(gate).toHaveBeenCalledTimes(1);
    for (const m of readCoreMocks) expect(m).not.toHaveBeenCalled();
  });
});

describe("fail-closed exact-shape guard (§5)", () => {
  const bad: unknown[] = [
    null,
    undefined,
    42,
    {},
    { kind: "published" },
    { kind: "published", showId: "not-a-uuid" },
    { kind: "staged" },
    { kind: "staged", driveFileId: 7 },
    { kind: "staged", driveFileId: "" },
    { kind: "staged", driveFileId: "x".repeat(129) },
    { kind: "other" },
    { kind: "published", showId: UUID, extra: 1 },
    { kind: "published", showId: UUID, driveFileId: "x" },
    Object.create({ kind: "published", showId: UUID }) as unknown,
  ];
  for (const [i, input] of bad.entries()) {
    it(`case ${i} returns bad_request with zero read-core calls`, async () => {
      const res = await captureShowTelemetry(input as CaptureTelemetryRequest);
      expect(res).toEqual({ kind: "bad_request" });
      for (const m of readCoreMocks) expect(m).not.toHaveBeenCalled();
    });
  }
});

describe("probe-row truncation (§4.2) — all four lists x three cases", () => {
  type Case = { name: string; got: number; cap: number; truncated: boolean };
  const table: Array<{ list: "alerts" | "syncLog" | "staged" | "failures"; cap: number }> = [
    { list: "alerts", cap: 100 },
    { list: "syncLog", cap: 50 },
    { list: "staged", cap: 10 },
    { list: "failures", cap: 100 },
  ];
  for (const { list, cap } of table) {
    const cases: Case[] = [
      { name: "cap+1", got: cap + 1, cap, truncated: true },
      { name: "exactly cap", got: cap, cap, truncated: false },
      { name: "fewer", got: cap - 1, cap, truncated: false },
    ];
    for (const c of cases) {
      it(`${list} ${c.name}`, async () => {
        if (list === "alerts" || list === "syncLog") {
          armPublishedHappy();
          if (list === "alerts") queryAlerts.mockResolvedValue(okAlerts(c.got));
          else querySyncLog.mockResolvedValue(okRows(c.got));
          const res = await captureShowTelemetry({ kind: "published", showId: UUID });
          if (res.kind !== "ok") throw new Error("expected ok");
          const section = res[list] as { rows: unknown[]; truncated: boolean };
          expect(section.rows).toHaveLength(Math.min(c.got, c.cap));
          expect(section.truncated).toBe(c.truncated);
        } else {
          armStagedHappy();
          if (list === "staged") queryStagedParses.mockResolvedValue(okRows(c.got));
          else queryIngestFailures.mockResolvedValue(okRows(c.got));
          const res = await captureShowTelemetry({ kind: "staged", driveFileId: "drive-1" });
          if (res.kind !== "ok") throw new Error("expected ok");
          const section = res[list] as { rows: unknown[]; truncated: boolean };
          expect(section.rows).toHaveLength(Math.min(c.got, c.cap));
          expect(section.truncated).toBe(c.truncated);
        }
      });
    }
  }
});

describe("events hasMore mapping (§4.2)", () => {
  for (const hasMore of [true, false]) {
    it(`hasMore ${hasMore} -> truncated ${hasMore}`, async () => {
      armPublishedHappy();
      queryEvents.mockResolvedValue(okEvents(2, hasMore));
      const res = await captureShowTelemetry({ kind: "published", showId: UUID });
      if (res.kind !== "ok") throw new Error("expected ok");
      expect(res.events).toEqual({ rows: [{ id: "e0" }, { id: "e1" }], truncated: hasMore });
    });
  }
});

describe("infra_error embedding — each of the five, verbatim, siblings ok", () => {
  const infra = { kind: "infra_error", message: "boom" } as const;
  it.each(["events", "alerts", "syncLog"] as const)("published: %s", async (which) => {
    armPublishedHappy();
    ({ events: queryEvents, alerts: queryAlerts, syncLog: querySyncLog })[which].mockResolvedValue(
      infra,
    );
    const res = await captureShowTelemetry({ kind: "published", showId: UUID });
    if (res.kind !== "ok") throw new Error("expected ok");
    expect(res[which]).toEqual(infra);
    for (const other of ["events", "alerts", "syncLog"] as const) {
      if (other !== which) expect(res[other]).not.toEqual(infra);
    }
  });
  it.each(["staged", "failures"] as const)("staged: %s", async (which) => {
    armStagedHappy();
    ({ staged: queryStagedParses, failures: queryIngestFailures })[which].mockResolvedValue(infra);
    const res = await captureShowTelemetry({ kind: "staged", driveFileId: "drive-1" });
    if (res.kind !== "ok") throw new Error("expected ok");
    expect(res[which]).toEqual(infra);
  });
});

describe("nested warnings caps (§4.2 — exactly the two enumerated arrays)", () => {
  it("staged rows: warnings capped at 200 with warningsTruncated marker", async () => {
    armStagedHappy();
    queryStagedParses.mockResolvedValue(
      okRows(1, { warnings: Array.from({ length: 201 }, (_, i) => i) }),
    );
    const res = await captureShowTelemetry({ kind: "staged", driveFileId: "drive-1" });
    if (res.kind !== "ok") throw new Error("expected ok");
    const row = (res.staged as { rows: Array<Record<string, unknown>> }).rows[0]!;
    expect(row["warnings"]).toHaveLength(200);
    expect(row["warningsTruncated"]).toBe(true);
  });
  it("failure rows: lastWarnings capped at 200 with warningsTruncated marker", async () => {
    armStagedHappy();
    queryIngestFailures.mockResolvedValue(
      okRows(1, { lastWarnings: Array.from({ length: 201 }, (_, i) => i) }),
    );
    const res = await captureShowTelemetry({ kind: "staged", driveFileId: "drive-1" });
    if (res.kind !== "ok") throw new Error("expected ok");
    const row = (res.failures as { rows: Array<Record<string, unknown>> }).rows[0]!;
    expect(row["lastWarnings"]).toHaveLength(200);
    expect(row["warningsTruncated"]).toBe(true);
  });
  it("under-cap arrays get no marker", async () => {
    armStagedHappy();
    queryStagedParses.mockResolvedValue(okRows(1, { warnings: [1, 2] }));
    const res = await captureShowTelemetry({ kind: "staged", driveFileId: "drive-1" });
    if (res.kind !== "ok") throw new Error("expected ok");
    const row = (res.staged as { rows: Array<Record<string, unknown>> }).rows[0]!;
    expect(row["warnings"]).toEqual([1, 2]);
    expect(row["warningsTruncated"]).toBeUndefined();
  });
  it("syncLog rows pass through untransformed (no cap, no marker)", async () => {
    armPublishedHappy();
    querySyncLog.mockResolvedValue(
      okRows(1, { warnings: Array.from({ length: 201 }, (_, i) => i) }),
    );
    const res = await captureShowTelemetry({ kind: "published", showId: UUID });
    if (res.kind !== "ok") throw new Error("expected ok");
    const row = (res.syncLog as { rows: Array<Record<string, unknown>> }).rows[0]!;
    expect(row["warnings"]).toHaveLength(201);
    expect(row["warningsTruncated"]).toBeUndefined();
  });
});

describe("commitSha env gate (§5)", () => {
  it("64-hex env -> null; 40-hex -> passed through; unset -> null", async () => {
    armPublishedHappy();
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "a".repeat(64));
    let res = await captureShowTelemetry({ kind: "published", showId: UUID });
    if (res.kind !== "ok") throw new Error("expected ok");
    expect(res.commitSha).toBeNull();

    const sha = "0123456789abcdef0123456789abcdef01234567";
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", sha);
    res = await captureShowTelemetry({ kind: "published", showId: UUID });
    if (res.kind !== "ok") throw new Error("expected ok");
    expect(res.commitSha).toBe(sha);

    vi.unstubAllEnvs();
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    res = await captureShowTelemetry({ kind: "published", showId: UUID });
    if (res.kind !== "ok") throw new Error("expected ok");
    expect(res.commitSha).toBeNull();
  });
});

describe("filter plumbing — exact object per call (§4.2)", () => {
  it("published pins events/alerts/syncLog filters", async () => {
    armPublishedHappy();
    await captureShowTelemetry({ kind: "published", showId: UUID });
    expect(queryEvents).toHaveBeenCalledWith({ showId: UUID, sinceHours: 168 });
    expect(queryAlerts).toHaveBeenCalledWith({ openOnly: true, limit: 101, showIdOrGlobal: UUID });
    expect(querySyncLog).toHaveBeenCalledWith({ showId: UUID, sinceHours: 168, limit: 51 });
  });
  it("staged pins staged/failures filters", async () => {
    armStagedHappy();
    await captureShowTelemetry({ kind: "staged", driveFileId: "drive-1" });
    expect(queryStagedParses).toHaveBeenCalledWith({
      driveFileId: "drive-1",
      sinceHours: 168,
      limit: 11,
    });
    expect(queryIngestFailures).toHaveBeenCalledWith({
      sinceHours: 168,
      limit: 101,
      driveFileId: "drive-1",
    });
  });
});
