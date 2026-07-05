import { describe, expect, test, vi } from "vitest";
import {
  cleanupAbandonedFinalize,
  CleanupRequiresStaleSessionError,
  type OnboardingSessionTx,
} from "@/lib/onboarding/sessionLifecycle";

/**
 * Thread 2b (spec 2026-07-05-finalize-resume-deadlock §5.1/§5.4/§5.5 step 3):
 * fast branch-level pins for cleanupAbandonedFinalize's NEW eligibility ladder.
 * The real-DB semantics (that finishable/unresolved counts derive from the
 * actual SQL predicates, and that the show: locks genuinely serialize a
 * concurrent recovery) live in cleanupStuckEligibility.db.test.ts and
 * cleanupRecoveryConcurrency.db.test.ts. Here a controllable fake OnboardingSessionTx
 * drives ONLY the JS branch decisions:
 *   - stuck (0 finishable + >0 unresolved) bypasses BOTH the 24h age gate and
 *     the 1-hour finalize-recency gate;
 *   - not-stuck + fresh still throws session_too_fresh;
 *   - not-stuck + stale + recent finalize throws finalize_active_within_last_hour;
 *   - the under-lock recheck aborts session_too_fresh when a pre-lock-unresolved id
 *     is resolved post-lock, and proceeds otherwise — on BOTH eligibility paths.
 */

const SESSION = "11111111-1111-4111-8111-111111111111";
const NEW_SESSION = "22222222-2222-4222-8222-222222222222";

type FakeState = {
  ownerSessionId: string | null;
  isStale: boolean;
  pendingAt: string | null;
  finishable: number;
  // unresolved ids returned on the FIRST (pre-lock) vs SECOND (post-lock) read.
  preUnresolved: string[];
  postUnresolved: string[];
  recentFinalize: number;
};

class FakeTx implements OnboardingSessionTx {
  unresolvedReads = 0;
  deletes: string[] = [];
  rotated = false;

  constructor(private readonly s: FakeState) {}

  async query<T>(sql: string, _params: readonly unknown[] = []) {
    const q = sql.replace(/\s+/g, " ").trim().toLowerCase();
    const row = (obj: unknown): { rows: T[]; rowCount: number } => ({
      rows: [obj as T],
      rowCount: 1,
    });
    const rows = (arr: unknown[]): { rows: T[]; rowCount: number } => ({
      rows: arr as T[],
      rowCount: arr.length,
    });

    if (q.includes("pg_advisory_xact_lock")) return rows([]);

    // Owner + staleness read (has the `as is_stale` computed column).
    if (q.includes("as is_stale")) {
      return row({
        id: "default",
        pending_wizard_session_id: this.s.ownerSessionId,
        pending_wizard_session_at: this.s.pendingAt,
        is_stale: this.s.isStale,
      });
    }
    if (q.includes("finishable_count")) return row({ finishable_count: this.s.finishable });
    // Unresolved-id set: first call = pre-lock, second = post-lock.
    if (q.includes("onboarding_scan_manifest m") && q.includes("m.status in")) {
      const ids = this.unresolvedReads === 0 ? this.s.preUnresolved : this.s.postUnresolved;
      this.unresolvedReads += 1;
      return rows(ids.map((drive_file_id) => ({ drive_file_id })));
    }
    if (q.includes("wizard_finalize_checkpoints") && q.includes("in_progress")) {
      return rows(Array.from({ length: this.s.recentFinalize }, (_, i) => ({ id: `f${i}` })));
    }
    if (q.startsWith("update public.app_settings")) {
      this.rotated = true;
      return row({
        id: "default",
        pending_wizard_session_id: NEW_SESSION,
        pending_wizard_session_at: "2026-07-05T00:00:00.000Z",
      });
    }
    if (q.startsWith("delete")) {
      this.deletes.push(q);
      return rows([]);
    }
    if (q.startsWith("insert into public.sync_log")) return rows([]);
    // Any other read (e.g. purge helpers) — benign empty.
    return rows([]);
  }
}

function run(state: FakeState) {
  const tx = new FakeTx(state);
  return {
    tx,
    result: cleanupAbandonedFinalize(SESSION, {
      withTx: async (fn) => fn(tx),
      requireAdminIdentity: async () => ({ email: "doug@example.com" }),
      randomUUID: () => NEW_SESSION,
    }),
  };
}

const base: FakeState = {
  ownerSessionId: SESSION,
  isStale: false,
  pendingAt: "2026-07-05T12:00:00.000Z",
  finishable: 0,
  preUnresolved: [],
  postUnresolved: [],
  recentFinalize: 0,
};

describe("cleanupAbandonedFinalize eligibility (Thread 2b)", () => {
  test("fresh + stuck (0 finishable, 1 unresolved) → cleaned, bypasses 24h gate", async () => {
    const { tx, result } = run({
      ...base,
      isStale: false,
      preUnresolved: ["D1"],
      postUnresolved: ["D1"],
    });
    await expect(result).resolves.toMatchObject({ status: "cleaned" });
    expect(tx.rotated).toBe(true);
  });

  test("fresh + stuck also bypasses the 1-hour finalize-recency gate", async () => {
    const { result } = run({
      ...base,
      isStale: false,
      preUnresolved: ["D1"],
      postUnresolved: ["D1"],
      recentFinalize: 1, // would throw finalize_active_within_last_hour if NOT stuck
    });
    await expect(result).resolves.toMatchObject({ status: "cleaned" });
  });

  test("fresh + NOT stuck (has finishable rows) → session_too_fresh", async () => {
    const { result } = run({ ...base, isStale: false, finishable: 2, preUnresolved: [] });
    await expect(result).rejects.toMatchObject({
      code: "CLEANUP_REQUIRES_STALE_SESSION",
      reason: "session_too_fresh",
    });
  });

  test("fresh + empty session (0 finishable, 0 unresolved → NOT stuck) → session_too_fresh", async () => {
    const { result } = run({ ...base, isStale: false, finishable: 0, preUnresolved: [] });
    await expect(result).rejects.toMatchObject({ reason: "session_too_fresh" });
  });

  test("stale + NOT stuck + recent finalize → finalize_active_within_last_hour", async () => {
    const { result } = run({ ...base, isStale: true, finishable: 3, recentFinalize: 1 });
    await expect(result).rejects.toMatchObject({ reason: "finalize_active_within_last_hour" });
  });

  test("stale + NOT stuck + no recent finalize → cleaned", async () => {
    const { tx, result } = run({ ...base, isStale: true, finishable: 3, recentFinalize: 0 });
    await expect(result).resolves.toMatchObject({ status: "cleaned" });
    expect(tx.rotated).toBe(true);
  });

  test("under-lock recheck ABORTS session_too_fresh when a pre-lock-unresolved id is resolved post-lock (stuck path)", async () => {
    const { tx, result } = run({
      ...base,
      isStale: false,
      preUnresolved: ["D1"],
      postUnresolved: [], // D1 got resolved by a concurrent recovery while we waited on show: lock
    });
    await expect(result).rejects.toMatchObject({ reason: "session_too_fresh" });
    expect(tx.rotated).toBe(false); // purged nothing
  });

  test("under-lock recheck runs on the STALE path too and ABORTS when resolved", async () => {
    const { tx, result } = run({
      ...base,
      isStale: true,
      finishable: 1,
      preUnresolved: ["D1"],
      postUnresolved: [], // resolved during the wait
    });
    await expect(result).rejects.toMatchObject({ reason: "session_too_fresh" });
    expect(tx.rotated).toBe(false);
  });

  test("under-lock recheck PROCEEDS when the unresolved set is unchanged", async () => {
    const { tx, result } = run({
      ...base,
      isStale: true,
      finishable: 1,
      preUnresolved: ["D1"],
      postUnresolved: ["D1"], // still unresolved → operator did not recover → proceed
    });
    await expect(result).resolves.toMatchObject({ status: "cleaned" });
    expect(tx.rotated).toBe(true);
  });

  test("wrong owner → already_cleaned (never throws)", async () => {
    const { result } = run({ ...base, ownerSessionId: "99999999-9999-4999-8999-999999999999" });
    await expect(result).resolves.toEqual({ status: "already_cleaned" });
  });

  test.each([["session_too_fresh"], ["finalize_active_within_last_hour"]])(
    "%s is a CleanupRequiresStaleSessionError (409)",
    async (reason) => {
      const state =
        reason === "session_too_fresh"
          ? { ...base, isStale: false, finishable: 1 }
          : { ...base, isStale: true, finishable: 1, recentFinalize: 1 };
      const { result } = run(state);
      await result.catch((e: unknown) => {
        expect(e).toBeInstanceOf(CleanupRequiresStaleSessionError);
        expect((e as CleanupRequiresStaleSessionError).status).toBe(409);
      });
    },
  );

  test("stuck path never queries recency (proves the bypass, not just the outcome)", async () => {
    // A spy tx recording whether the in_progress recency select was issued.
    let recencyQueried = false;
    const tx = new FakeTx({
      ...base,
      isStale: false,
      preUnresolved: ["D1"],
      postUnresolved: ["D1"],
    });
    const origQuery = tx.query.bind(tx);
    tx.query = async <T>(sql: string, params: readonly unknown[] = []) => {
      if (sql.replace(/\s+/g, " ").toLowerCase().includes("in_progress")) recencyQueried = true;
      return origQuery<T>(sql, params);
    };
    await cleanupAbandonedFinalize(SESSION, {
      withTx: async (fn) => fn(tx),
      requireAdminIdentity: async () => ({ email: "doug@example.com" }),
      randomUUID: () => NEW_SESSION,
    });
    expect(recencyQueried).toBe(false);
    void vi; // keep vi import (used elsewhere in the suite style)
  });
});
