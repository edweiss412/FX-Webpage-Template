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

  test("returned error → infra_error (never ok), logged with a source AND a forensic code", async () => {
    logError.mockClear();
    const { client } = clientReturning({
      data: null,
      error: {
        message: "permission denied",
        code: "42501",
        details: "fixture details",
        hint: "fixture hint",
      },
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
    // The fatal path's own error must be READABLE. Passing the raw PostgREST
    // object here USED to render as '[object Object]' (lib/log/serializeError.ts's
    // old non-Error arm), which is exactly what made the CI 502 undiagnosable —
    // spec docs/superpowers/specs/ci/2026-08-15-changes-feed-modal-batch-flake-design.md §2.4.
    // That arm is structural since fix/serialize-error-structure, so this pin now
    // holds a RETAINED site-local extraction choice (spec
    // docs/superpowers/specs/observability/2026-08-16-serialize-error-structure-design.md §1.1.6):
    // it asserts `fields.error` BEFORE serialization, so it is untouched either way.
    // `error` is now the raw object, not error.message. serializeError captures
    // its own code/details/hint (lib/log/logger.ts), which is strictly more than
    // the extracted string kept — and the flat pgrst* fields stay as the stable
    // named slots this site chose, now redundant rather than load-bearing.
    expect(fields.error).toMatchObject({
      message: "permission denied",
      code: "42501",
      details: "fixture details",
      hint: "fixture hint",
    });
    expect(fields.pgrstCode).toBe("42501");
    expect(fields.pgrstDetails).toBe("fixture details");
    expect(fields.pgrstHint).toBe("fixture hint");
    // The zero-new-codes constraint this used to pin rested on a premise that is
    // false: it read `code` as the §12.4 telemetry slot, so stamping one here
    // would owe a catalog row. It does not.
    // lib/messages/__internal__/stripLogEmissionCalls.ts strips `log.*` spans
    // BEFORE the §12.4 producer scan, so a code literal inside one never reaches
    // x1/x2 — verified by running both against this arc's 82 new forensic codes,
    // which pass. Meanwhile `observe events --code` filters on exactly this field,
    // so leaving it unstamped made this fault findable only by source.
    expect(fields.code).toBe("SHOW_REVIEW_SNAPSHOT_READ_RETURNED_ERROR");
  });

  test("truthy data alongside a returned error still yields infra_error (error checked first, no bare-data destructure)", async () => {
    // The R6 bug shape: reading `data` without first honoring `error` would
    // wrongly return ok here. The error branch MUST win.
    const { client } = clientReturning({ data: SNAPSHOT, error: { message: "mid-query reset" } });
    const result = await readShowReviewSnapshot(client, SHOW_ID);
    expect(result.kind).toBe("infra_error");
  });

  test("rpc throws (auth-token expiry / network reset) → infra_error, logged with its own code", async () => {
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
    // Same reasoning as the returned-error branch above: a forensic code inside a
    // log.* span is not a §12.4 producer, and it is what `observe events --code`
    // filters on.
    expect(fields.code).toBe("SHOW_REVIEW_SNAPSHOT_READ_THREW");
  });
});
