/**
 * DB-backed lease tests (d-cluster) + in-memory slot store unit tests.
 *
 * DB: always uses LOCAL supabase (TEST_DATABASE_URL unset → local 54322).
 * The agenda_extract_leases table is already applied to local via
 * 20260629000001_agenda_extract_leases.sql.
 */

import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  AGENDA_GLOBAL_MAX_CONCURRENT_EXTRACTIONS,
  AGENDA_MAX_CONCURRENT_EXTRACTIONS,
} from "@/lib/agenda/constants";
import {
  assertLeaseOwned,
  claimExtractLease,
  createInMemorySlotStore,
  defaultSlotStore,
  releaseExtractLease,
  releaseExtractLeaseStandalone,
  type LeaseTx,
  type LeasePool,
} from "@/lib/agenda/extractAgendaLease";

const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const K = AGENDA_GLOBAL_MAX_CONCURRENT_EXTRACTIONS; // 8

// ─── DB-backed tests ──────────────────────────────────────────────────────────

describe("extractAgendaLease — DB-backed (d-cluster)", () => {
  // Shared pool for setup/assertions/cleanup; each tx test opens its own connection.
  let pool: ReturnType<typeof postgres>;
  // Per-test prefix so afterEach cleanup never touches sibling tests' rows.
  let runId: string;

  beforeAll(() => {
    pool = postgres(LOCAL_DB_URL, { max: K + 12, prepare: false });
  });

  beforeEach(() => {
    runId = randomUUID().replace(/-/g, "").slice(0, 8);
  });

  afterEach(async () => {
    // Delete all rows seeded by this test via the runId prefix.
    const pattern = `test-${runId}%`;
    await pool`DELETE FROM public.agenda_extract_leases WHERE drive_file_id LIKE ${pattern}`;
  });

  afterAll(async () => {
    await pool.end({ timeout: 5 });
  });

  // ── Setup helpers ──────────────────────────────────────────────────────────

  function insertLiveLease(wiz: string, dfid: string, owner: string, minFromNow = 5) {
    const interval = `${minFromNow} minutes`;
    return pool`
      INSERT INTO public.agenda_extract_leases (wizard_session_id, drive_file_id, owner, expires_at)
      VALUES (${wiz}::uuid, ${dfid}, ${owner}, now() + ${interval}::interval)
    `;
  }

  function insertExpiredLease(wiz: string, dfid: string, owner: string) {
    return pool`
      INSERT INTO public.agenda_extract_leases (wizard_session_id, drive_file_id, owner, expires_at)
      VALUES (${wiz}::uuid, ${dfid}, ${owner}, now() - '1 second'::interval)
    `;
  }

  async function liveCount(pattern: string) {
    const rows = await pool<{ cnt: number }[]>`
      SELECT count(*)::int AS cnt
        FROM public.agenda_extract_leases
       WHERE drive_file_id LIKE ${pattern}
         AND expires_at > now()
    `;
    return rows[0]?.cnt ?? 0;
  }

  // ── (d) concurrent same (wiz,dfid) → one ok, one in_progress ─────────────

  test("d: two concurrent claims for the same (wiz,dfid) → one ok, one in_progress (never queued)", async () => {
    const wiz = randomUUID();
    const dfid = `test-${runId}-d`;

    const sql1 = postgres(LOCAL_DB_URL, { max: 1, prepare: false });
    const sql2 = postgres(LOCAL_DB_URL, { max: 1, prepare: false });

    try {
      const [r1, r2] = await Promise.all([
        sql1.begin((tx) =>
          claimExtractLease(tx as unknown as LeaseTx, {
            wizardSessionId: wiz,
            driveFileId: dfid,
            owner: "owner-1",
          }),
        ),
        sql2.begin((tx) =>
          claimExtractLease(tx as unknown as LeaseTx, {
            wizardSessionId: wiz,
            driveFileId: dfid,
            owner: "owner-2",
          }),
        ),
      ]);

      const results = [r1, r2];
      const okResults = results.filter((r) => r.ok);
      const failResults = results.filter((r) => !r.ok) as Array<{
        ok: false;
        reason: string;
      }>;

      expect(okResults).toHaveLength(1);
      expect(failResults).toHaveLength(1);
      // Must be in_progress, not queued (a live lease for that exact row)
      expect(failResults[0]?.reason).toBe("in_progress");
    } finally {
      await sql1.end({ timeout: 5 });
      await sql2.end({ timeout: 5 });
    }
  });

  // ── (d-cap) K live leases + distinct K+1 claim → queued ──────────────────

  test("d-cap: K live leases + distinct K+1 claim → queued (not in_progress)", async () => {
    for (let i = 0; i < K; i++) {
      await insertLiveLease(randomUUID(), `test-${runId}-cap-${i}`, `owner-${i}`);
    }

    const result = await pool.begin((tx) =>
      claimExtractLease(tx as unknown as LeaseTx, {
        wizardSessionId: randomUUID(),
        driveFileId: `test-${runId}-cap-new`,
        owner: "owner-new",
      }),
    );

    expect(result).toEqual({ ok: false, reason: "queued" });
    // The two distinct reasons must not be collapsed
    expect((result as { reason: string }).reason).not.toBe("in_progress");
  });

  // ── (d-cap-samerow) same-row duplicate AT full cap → in_progress ──────────

  test("d-cap-samerow: K-1 others + 1 live for requested row (cap full) → in_progress, NOT queued", async () => {
    const wiz = randomUUID();
    const dfid = `test-${runId}-csr`;

    // Fill K-1 slots with OTHER rows
    for (let i = 0; i < K - 1; i++) {
      await insertLiveLease(randomUUID(), `test-${runId}-csr-other-${i}`, `other-${i}`);
    }
    // 1 live lease for the requested (wiz, dfid) → total live = K (cap full)
    await insertLiveLease(wiz, dfid, "original-owner");

    const result = await pool.begin((tx) =>
      claimExtractLease(tx as unknown as LeaseTx, {
        wizardSessionId: wiz,
        driveFileId: dfid,
        owner: "duplicate-owner",
      }),
    );

    // Same-row check fires BEFORE global cap check → in_progress, not queued
    expect(result).toEqual({ ok: false, reason: "in_progress" });
  });

  // ── (d-x) different wizardSessionId same dfid → independent claim ─────────

  test("d-x: different wizardSessionId same dfid → each claim succeeds independently", async () => {
    const dfid = `test-${runId}-dx`;
    const wiz1 = randomUUID();
    const wiz2 = randomUUID();

    const r1 = await pool.begin((tx) =>
      claimExtractLease(tx as unknown as LeaseTx, {
        wizardSessionId: wiz1,
        driveFileId: dfid,
        owner: "owner-1",
      }),
    );
    expect(r1).toEqual({ ok: true });

    // Different wiz → different PK → independent row
    const r2 = await pool.begin((tx) =>
      claimExtractLease(tx as unknown as LeaseTx, {
        wizardSessionId: wiz2,
        driveFileId: dfid,
        owner: "owner-2",
      }),
    );
    expect(r2).toEqual({ ok: true });
  });

  // ── (d-g) STRICT cap: K+N concurrent distinct-row claims → at most K ok ───
  //
  // This test WOULD FAIL on a bare count-then-insert (all 12 would race past
  // the count check, see 0, and INSERT — producing 12 successes instead of ≤ 8).
  // The pg_advisory_xact_lock serializes them so exactly ≤ K succeed.

  test("d-g: K+N concurrent distinct-row claims → at most K ok, rest queued (advisory lock enforces STRICT cap)", async () => {
    const N = 4;
    const total = K + N;

    // Each connection gets its own max:1 pool to guarantee true concurrency
    const connections = Array.from({ length: total }, () =>
      postgres(LOCAL_DB_URL, { max: 1, prepare: false }),
    );
    const tags = Array.from({ length: total }, (_, i) => ({
      wizardSessionId: randomUUID(),
      driveFileId: `test-${runId}-dg-${i}`,
      owner: `owner-dg-${i}`,
    }));

    try {
      const results = await Promise.all(
        connections.map((sql, i) =>
          sql.begin((tx) => claimExtractLease(tx as unknown as LeaseTx, tags[i]!)),
        ),
      );

      const succeeded = results.filter((r) => r.ok).length;
      const queued = results.filter(
        (r) => !r.ok && (r as { reason: string }).reason === "queued",
      ).length;
      const inProgress = results.filter(
        (r) => !r.ok && (r as { reason: string }).reason === "in_progress",
      ).length;

      // Advisory lock serializes → at most K succeed
      expect(succeeded).toBeLessThanOrEqual(K);
      // All distinct rows → no same-row duplicate → never in_progress
      expect(inProgress).toBe(0);
      // Everything beyond K is queued
      expect(queued).toBe(total - succeeded);
      // Sanity: at least 1 succeeded (DB is live and empty at start of test)
      expect(succeeded).toBeGreaterThanOrEqual(1);
    } finally {
      await Promise.all(connections.map((c) => c.end({ timeout: 5 })));
    }
  }, 30_000); // allow for 12-connection serial advisory lock contention

  // ── (d2) GC: expired leases removed on next claim ────────────────────────

  test("d2: many expired leases are GC'd on next claim; live count excludes them", async () => {
    // Seed K+2 expired leases (simulating crashed extractors beyond the cap)
    for (let i = 0; i < K + 2; i++) {
      await insertExpiredLease(randomUUID(), `test-${runId}-gc-${i}`, `crashed-${i}`);
    }

    const [before] = await pool<{ cnt: number }[]>`
      SELECT count(*)::int AS cnt FROM public.agenda_extract_leases
       WHERE drive_file_id LIKE ${`test-${runId}-gc-%`}
    `;
    expect(before?.cnt).toBe(K + 2);

    // Next claim GCs them all; live count = 0 → claim succeeds
    const result = await pool.begin((tx) =>
      claimExtractLease(tx as unknown as LeaseTx, {
        wizardSessionId: randomUUID(),
        driveFileId: `test-${runId}-gc-new`,
        owner: "owner-gc",
      }),
    );
    expect(result).toEqual({ ok: true });

    // Expired rows are gone; live count is exactly 1 (the new claim)
    const liveAfter = await liveCount(`test-${runId}%`);
    expect(liveAfter).toBe(1);

    const [expiredAfter] = await pool<{ cnt: number }[]>`
      SELECT count(*)::int AS cnt FROM public.agenda_extract_leases
       WHERE drive_file_id LIKE ${`test-${runId}-gc-%`}
         AND expires_at <= now()
    `;
    expect(expiredAfter?.cnt).toBe(0);
  });

  // ── (d3) in-tx releaseExtractLease is owner-scoped ───────────────────────

  test("d3: releaseExtractLease deletes only the matching (wiz,dfid,owner) row", async () => {
    const dfid = `test-${runId}-d3`;
    const wiz1 = randomUUID();
    const wiz2 = randomUUID();

    await insertLiveLease(wiz1, dfid, "owner-a");
    await insertLiveLease(wiz2, dfid, "owner-b");

    // Release only owner-a's row (wiz1, dfid, "owner-a")
    await pool.begin((tx) =>
      releaseExtractLease(tx as unknown as LeaseTx, {
        wizardSessionId: wiz1,
        driveFileId: dfid,
        owner: "owner-a",
      }),
    );

    // owner-a's row is gone
    const [rowA] = await pool<{ cnt: number }[]>`
      SELECT count(*)::int AS cnt FROM public.agenda_extract_leases
       WHERE wizard_session_id = ${wiz1}::uuid AND drive_file_id = ${dfid}
    `;
    expect(rowA?.cnt).toBe(0);

    // owner-b's row (different wiz, same dfid) is untouched
    const [rowB] = await pool<{ cnt: number }[]>`
      SELECT count(*)::int AS cnt FROM public.agenda_extract_leases
       WHERE wizard_session_id = ${wiz2}::uuid AND drive_file_id = ${dfid}
    `;
    expect(rowB?.cnt).toBe(1);
  });

  // ── (d3b) releaseExtractLeaseStandalone deletes immediately ──────────────

  test("d3b: releaseExtractLeaseStandalone opens its own tx and DELETEs the row immediately (not TTL-recoverable)", async () => {
    const wiz = randomUUID();
    const dfid = `test-${runId}-d3b`;
    const owner = "standalone-owner";

    await insertLiveLease(wiz, dfid, owner);

    // Row exists before standalone release
    const [before] = await pool<{ cnt: number }[]>`
        SELECT count(*)::int AS cnt FROM public.agenda_extract_leases
         WHERE wizard_session_id = ${wiz}::uuid AND drive_file_id = ${dfid} AND owner = ${owner}
      `;
    expect(before?.cnt).toBe(1);

    // Standalone release — no open tx; function opens its own
    await releaseExtractLeaseStandalone(pool as unknown as LeasePool, {
      wizardSessionId: wiz,
      driveFileId: dfid,
      owner,
    });

    // Row is gone immediately after the call returns, NOT merely TTL-recoverable
    const [after] = await pool<{ cnt: number }[]>`
        SELECT count(*)::int AS cnt FROM public.agenda_extract_leases
         WHERE wizard_session_id = ${wiz}::uuid AND drive_file_id = ${dfid} AND owner = ${owner}
      `;
    expect(after?.cnt).toBe(0);
  });

  // ── (d5) persist guard ────────────────────────────────────────────────────

  test("d5: assertLeaseOwned → true for live owned lease, false for wrong owner or after release", async () => {
    const wiz = randomUUID();
    const dfid = `test-${runId}-d5`;
    const owner = "persist-owner";

    await insertLiveLease(wiz, dfid, owner);

    // Correct owner → true
    const owned = await assertLeaseOwned(pool as unknown as LeaseTx, {
      wizardSessionId: wiz,
      driveFileId: dfid,
      owner,
    });
    expect(owned).toBe(true);

    // Wrong owner → false (owner-scoped)
    const wrongOwner = await assertLeaseOwned(pool as unknown as LeaseTx, {
      wizardSessionId: wiz,
      driveFileId: dfid,
      owner: "wrong-owner",
    });
    expect(wrongOwner).toBe(false);

    // Release the lease
    await pool`
      DELETE FROM public.agenda_extract_leases
       WHERE wizard_session_id = ${wiz}::uuid AND drive_file_id = ${dfid}
    `;

    // After release → false
    const afterRelease = await assertLeaseOwned(pool as unknown as LeaseTx, {
      wizardSessionId: wiz,
      driveFileId: dfid,
      owner,
    });
    expect(afterRelease).toBe(false);
  });
});

// ─── In-memory slot store (pure-unit, no DB) ──────────────────────────────────

describe("createInMemorySlotStore — unit tests", () => {
  test("acquires slots up to AGENDA_MAX_CONCURRENT_EXTRACTIONS, rejects beyond", () => {
    const store = createInMemorySlotStore();

    const slots = Array.from({ length: AGENDA_MAX_CONCURRENT_EXTRACTIONS }, (_, i) =>
      store.tryAcquire(`key-${i}`),
    );
    expect(slots.every((s) => s.acquiredSlot)).toBe(true);
    expect(slots.every((s) => !s.ownsInFlight)).toBe(true);

    // One beyond cap → no slot
    const overflow = store.tryAcquire("overflow");
    expect(overflow.acquiredSlot).toBe(false);
    expect(overflow.ownsInFlight).toBe(false);
  });

  test("release frees the slot so a subsequent key can acquire", () => {
    const store = createInMemorySlotStore();
    const r = store.tryAcquire("key-a");
    expect(r.acquiredSlot).toBe(true);
    r.release();

    const next = store.tryAcquire("key-b");
    expect(next.acquiredSlot).toBe(true);
  });

  test("release is idempotent — count does not go negative", () => {
    const store = createInMemorySlotStore();
    const r = store.tryAcquire("key");
    r.release();
    r.release(); // second call is a no-op

    // If count went negative, this would report acquiredSlot=true even at cap+1
    const slots = Array.from({ length: AGENDA_MAX_CONCURRENT_EXTRACTIONS }, (_, i) =>
      store.tryAcquire(`fresh-${i}`),
    );
    expect(slots.every((s) => s.acquiredSlot)).toBe(true);
    // One more should still be blocked
    expect(store.tryAcquire("still-over").acquiredSlot).toBe(false);
  });

  test("ownsInFlight is true for a duplicate key on the same store", () => {
    const store = createInMemorySlotStore();
    const r1 = store.tryAcquire("same-key");
    expect(r1.acquiredSlot).toBe(true);

    const r2 = store.tryAcquire("same-key");
    expect(r2.ownsInFlight).toBe(true);
    expect(r2.acquiredSlot).toBe(false);
  });

  test("two stores are INDEPENDENT — separate counters and Sets", () => {
    const storeA = createInMemorySlotStore();
    const storeB = createInMemorySlotStore();

    // Fill storeA to cap
    for (let i = 0; i < AGENDA_MAX_CONCURRENT_EXTRACTIONS; i++) {
      storeA.tryAcquire(`a-key-${i}`);
    }
    expect(storeA.tryAcquire("a-overflow").acquiredSlot).toBe(false);

    // storeB is unaffected — still has full capacity
    const bSlot = storeB.tryAcquire("b-key");
    expect(bSlot.acquiredSlot).toBe(true);
    // And storeA's in-flight keys are not shared with storeB
    const bDuplicate = storeB.tryAcquire("a-key-0"); // key exists in A but not B
    expect(bDuplicate.ownsInFlight).toBe(false);
    expect(bDuplicate.acquiredSlot).toBe(true);
  });

  test("defaultSlotStore is a pre-created module-level InMemorySlotStore", () => {
    expect(defaultSlotStore).toBeDefined();
    expect(typeof defaultSlotStore.tryAcquire).toBe("function");

    // Sanity: it's independent from a freshly created store
    const fresh = createInMemorySlotStore();
    // Fill the fresh store to cap
    for (let i = 0; i < AGENDA_MAX_CONCURRENT_EXTRACTIONS; i++) {
      fresh.tryAcquire(`fill-${i}`);
    }
    // defaultSlotStore is unaffected
    const slot = defaultSlotStore.tryAcquire(`default-probe-${randomUUID()}`);
    // We can't know if defaultSlotStore is full (other tests might have used it),
    // but we can verify the interface works
    expect(typeof slot.acquiredSlot).toBe("boolean");
    expect(typeof slot.ownsInFlight).toBe("boolean");
    expect(typeof slot.release).toBe("function");
    slot.release(); // clean up
  });
});
