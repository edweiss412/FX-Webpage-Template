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
  // finishable-clean count on the FIRST (pre-lock) read; finishableUnderLock (if set)
  // is returned on the SECOND (under-lock re-eval) read — models a finishable row a
  // scan/recovery committed before the reap collect. Defaults to `finishable`.
  finishable: number;
  finishableUnderLock?: number;
  // unresolved ids returned on the FIRST (pre-lock) vs SECOND (post-lock) read.
  preUnresolved: string[];
  postUnresolved: string[];
  // reap-lock drive-id set (collectReapDriveFileIds union) returned on the FIRST
  // (inside lockCleanupDriveFiles) vs SECOND (under-lock recheck) collect pass.
  preReap: string[];
  postReap: string[];
  // reap tables that STILL report a session-scoped row after the id-scoped deletes
  // (models a NEW-drive row a scan/recovery inserted mid-transaction) — the
  // post-delete residue check must abort when any is present.
  residueTables: string[];
  recentFinalize: number;
};

class FakeTx implements OnboardingSessionTx {
  unresolvedReads = 0;
  finishableReads = 0;
  reapReads = 0;
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

    // collectReapDriveFileIds unions five reap tables per pass; deferred_ingestions
    // is reap-only (never touched by the unresolved/finishable reads), so it is the
    // safe per-pass sentinel. Return the whole set here (the union of the other four
    // empty selects is identical) and split pre-lock (pass 0) vs under-lock recheck
    // (pass 1) so a test can model a lock-set that EXPANDED while cleanup waited.
    if (q.startsWith("select drive_file_id from public.deferred_ingestions")) {
      const ids = this.reapReads === 0 ? this.s.preReap : this.s.postReap;
      this.reapReads += 1;
      return rows(ids.map((drive_file_id) => ({ drive_file_id })));
    }
    if (q.startsWith("select drive_file_id from public.")) return rows([]);

    // Post-delete residue check: `select 1 from public.<table> where … limit 1`.
    // Return a row iff the modeled residue set names this table (a mid-tx insert).
    if (q.startsWith("select 1 from public.")) {
      const table = /from public\.(\w+)/.exec(q)?.[1] ?? "";
      return this.s.residueTables.includes(table) ? rows([{}]) : rows([]);
    }

    // Owner + staleness read (has the `as is_stale` computed column).
    if (q.includes("as is_stale")) {
      return row({
        id: "default",
        pending_wizard_session_id: this.s.ownerSessionId,
        pending_wizard_session_at: this.s.pendingAt,
        is_stale: this.s.isStale,
      });
    }
    if (q.includes("finishable_count")) {
      // First read = pre-lock; second = under-lock re-eval (R3 HIGH).
      const v =
        this.finishableReads === 0
          ? this.s.finishable
          : (this.s.finishableUnderLock ?? this.s.finishable);
      this.finishableReads += 1;
      return row({ finishable_count: v });
    }
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
  preReap: [],
  postReap: [],
  residueTables: [],
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

  test("under-lock re-eval ABORTS a fresh session that GAINED a finishable row before the reap collect (whole-diff R3 HIGH)", async () => {
    // Pre-lock the session looks stuck (0 finishable + D1 unresolved) so the fresh
    // gate is bypassed. But a concurrent scan committed a finishable D2 BEFORE the
    // reap collect, so D2 is in the locked set (no expansion → the R1 guard is
    // silent) and the session is no longer stuck. A fresh, no-longer-stuck session
    // must be blocked — the authoritative under-lock re-eval throws session_too_fresh.
    const { tx, result } = run({
      ...base,
      isStale: false, // FRESH
      finishable: 0, // stuck pre-lock
      finishableUnderLock: 1, // …but finishable under the locks → NOT stuck
      preUnresolved: ["D1"],
      postUnresolved: ["D1"], // D1 still unresolved (recovery recheck cannot fire)
      preReap: ["D1", "D2"],
      postReap: ["D1", "D2"], // no expansion — D2 was present at collect time
    });
    await expect(result).rejects.toMatchObject({ reason: "session_too_fresh" });
    expect(tx.rotated).toBe(false);
  });

  test("under-lock recheck ABORTS session_too_fresh when the reap lock-set EXPANDS post-lock (whole-diff R1 HIGH)", async () => {
    // A concurrent scan/recovery INSERTed a new session row (D2) after
    // lockCleanupDriveFiles's initial collect (or while cleanup waited on the show:
    // locks). The purge is SESSION-scoped, so it would delete D2's rows WITHOUT ever
    // holding show:D2 — an invariant-2 violation. cleanup must re-collect under the
    // held locks and abort rather than purge an unlocked drive id. The unresolved set
    // is deliberately unchanged so ONLY the reap-expansion guard can trip this.
    const { tx, result } = run({
      ...base,
      isStale: true,
      finishable: 1,
      preUnresolved: ["D1"],
      postUnresolved: ["D1"],
      preReap: ["D1"],
      postReap: ["D1", "D2"], // D2 appeared after our initial collect
    });
    await expect(result).rejects.toMatchObject({ reason: "session_too_fresh" });
    expect(tx.rotated).toBe(false); // purged nothing
  });

  test("post-delete residue (a NEW-drive row appeared after the recheck) → session_too_fresh, purge nothing (whole-diff R2 HIGH)", async () => {
    // The reap-set recheck passes (no expansion detected at recheck time), but a
    // scan/recovery inserts a new-drive row for this session BETWEEN the recheck and
    // the purge. The id-scoped deletes leave it (it is not in the locked set), and
    // the post-delete residue check then finds it and aborts the whole discard —
    // deleting it would be an invariant-2 violation (no show:<new id> held).
    const { tx, result } = run({
      ...base,
      isStale: true,
      finishable: 1,
      preUnresolved: [],
      postUnresolved: [],
      preReap: ["D1"],
      postReap: ["D1"], // recheck sees no expansion
      residueTables: ["pending_syncs"], // …but D2's row remains after the id-scoped delete
    });
    await expect(result).rejects.toMatchObject({ reason: "session_too_fresh" });
    expect(tx.rotated).toBe(false); // rollback — nothing committed
  });

  test("under-lock recheck PROCEEDS when the reap set is unchanged", async () => {
    const { tx, result } = run({
      ...base,
      isStale: true,
      finishable: 1,
      preUnresolved: [],
      postUnresolved: [],
      preReap: ["D1", "D2"],
      postReap: ["D2", "D1"], // same set, re-sorted — must NOT be seen as expansion
    });
    await expect(result).resolves.toMatchObject({ status: "cleaned" });
    expect(tx.rotated).toBe(true);
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
