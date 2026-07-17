/**
 * tests/admin/readShowReviewSnapshot.test.ts
 *
 * Behavioral contract for the consolidated admin show-page snapshot reader
 * (Task 7). The helper wraps the single-statement `get_admin_show_review_snapshot`
 * RPC (Task 6 migration) and maps its outcomes onto the discriminated
 * ReadSnapshotResult union per invariant 9 (every Supabase call destructures
 * { data, error }; returned-error and thrown-error are BOTH surfaced as a
 * discriminable typed infra_error, never a silent null).
 *
 * The §B meta-test's shared mock rpc() is not fn-keyed (loadTelemetryStats /
 * loadAlertSummary precedent), so the RPC returned-error and rpc-throw paths
 * are pinned HERE against a hand-built client whose .rpc is fully controllable.
 */
import { describe, expect, test, vi } from "vitest";

const logError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/log", () => ({
  log: { error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { readShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";

type RpcResult = { data: unknown; error: unknown };

function clientReturning(result: RpcResult) {
  const rpc = vi.fn(async () => result);
  return {
    client: { rpc } as unknown as Parameters<typeof readShowReviewSnapshot>[0],
    rpc,
  };
}

function clientThrowing(err: unknown) {
  const rpc = vi.fn(async () => {
    throw err;
  });
  return {
    client: { rpc } as unknown as Parameters<typeof readShowReviewSnapshot>[0],
    rpc,
  };
}

// A representative to_jsonb(row) snapshot payload. Field-level typing is Task 8's
// job; here we assert the payload passes through structurally unchanged.
const SNAPSHOT = {
  show: { id: "00000000-0000-0000-0000-000000000001", slug: "rpas", title: "RPAS" },
  internal: { show_id: "00000000-0000-0000-0000-000000000001", parse_warnings: [] },
  crew_members: [{ id: "c1", full_name: "Alex" }],
  rooms: [{ id: "r1" }],
  hotel_reservations: [{ id: "h1", ordinal: 0 }],
  transportation: [{ id: "t1" }],
  contacts: [{ id: "k1" }],
};

const SHOW_ID = "00000000-0000-0000-0000-000000000001";

describe("readShowReviewSnapshot", () => {
  test("data present → { kind: 'ok' } carrying the snapshot verbatim", async () => {
    const { client } = clientReturning({ data: SNAPSHOT, error: null });
    const result = await readShowReviewSnapshot(client, SHOW_ID);
    expect(result).toEqual({ kind: "ok", snapshot: SNAPSHOT });
    // Assert against the data SOURCE (the rpc payload), not a re-derived shape:
    // every top-level section is passed through unchanged.
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.snapshot.show).toBe(SNAPSHOT.show);
    expect(result.snapshot.internal).toBe(SNAPSHOT.internal);
    expect(result.snapshot.crew_members).toBe(SNAPSHOT.crew_members);
    expect(result.snapshot.rooms).toBe(SNAPSHOT.rooms);
    expect(result.snapshot.hotel_reservations).toBe(SNAPSHOT.hotel_reservations);
    expect(result.snapshot.transportation).toBe(SNAPSHOT.transportation);
    expect(result.snapshot.contacts).toBe(SNAPSHOT.contacts);
  });

  test("invokes the RPC by name with the p_show_id param", async () => {
    const { client, rpc } = clientReturning({ data: SNAPSHOT, error: null });
    await readShowReviewSnapshot(client, SHOW_ID);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_admin_show_review_snapshot", { p_show_id: SHOW_ID });
  });

  test("ok payload with internal:null passes the null through (no shows_internal row)", async () => {
    const payload = { ...SNAPSHOT, internal: null };
    const { client } = clientReturning({ data: payload, error: null });
    const result = await readShowReviewSnapshot(client, SHOW_ID);
    expect(result).toEqual({ kind: "ok", snapshot: payload });
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.snapshot.internal).toBeNull();
  });

  test("data:null (RPC's non-admin OR missing-show sentinel) → not_admin_or_missing", async () => {
    const { client } = clientReturning({ data: null, error: null });
    const result = await readShowReviewSnapshot(client, SHOW_ID);
    expect(result).toEqual({ kind: "not_admin_or_missing" });
  });

  test("returned error → infra_error (never ok), logged with a source and NO code", async () => {
    logError.mockClear();
    const { client } = clientReturning({
      data: null,
      error: { message: "permission denied", code: "42501" },
    });
    const result = await readShowReviewSnapshot(client, SHOW_ID);
    expect(result.kind).toBe("infra_error");
    if (result.kind !== "infra_error") throw new Error("expected infra_error");
    expect(result.message.length).toBeGreaterThan(0);
    expect(logError).toHaveBeenCalledTimes(1);
    const call = logError.mock.calls[0];
    if (!call) throw new Error("expected a log.error call");
    const fields = call[1] as Record<string, unknown>;
    expect(fields.source).toBe("admin.showReview.snapshot");
    // Zero-new-codes constraint: this read path does not stamp a §12.4 code.
    expect(fields).not.toHaveProperty("code");
  });

  test("truthy data alongside a returned error still yields infra_error (error checked first, no bare-data destructure)", async () => {
    // The R6 bug shape: reading `data` without first honoring `error` would
    // wrongly return ok here. The error branch MUST win.
    const { client } = clientReturning({ data: SNAPSHOT, error: { message: "mid-query reset" } });
    const result = await readShowReviewSnapshot(client, SHOW_ID);
    expect(result.kind).toBe("infra_error");
  });

  test("rpc throws (auth-token expiry / network reset) → infra_error, logged", async () => {
    logError.mockClear();
    const { client } = clientThrowing(new Error("network reset mid-await"));
    const result = await readShowReviewSnapshot(client, SHOW_ID);
    expect(result.kind).toBe("infra_error");
    if (result.kind !== "infra_error") throw new Error("expected infra_error");
    expect(result.message.length).toBeGreaterThan(0);
    expect(logError).toHaveBeenCalledTimes(1);
    const call = logError.mock.calls[0];
    if (!call) throw new Error("expected a log.error call");
    const fields = call[1] as Record<string, unknown>;
    expect(fields.source).toBe("admin.showReview.snapshot");
    expect(fields).not.toHaveProperty("code");
  });
});
