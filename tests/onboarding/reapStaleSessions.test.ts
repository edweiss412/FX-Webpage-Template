/**
 * F4 Task 4.2/4.3/4.4 — unit suite for reapStaleOnboardingSessions (spec §6).
 *
 * FakeReapTx classifies EXACTLY the SQL the implementation issues and THROWS on
 * anything unclassified — that throw IS the structural no-purge/no-rotate
 * guarantee: a purgeWizardRows-shaped cross-session delete
 * (`delete ... where wizard_session_id is not null`), a bare manifest truncate,
 * or an `update public.app_settings` would all fail the suite.
 *
 * R67-1/R63-1: the delete classifiers enforce the SAME predicates as the real
 * SQL (created_show_id + drive_file_id binding + wizard_created_session_id
 * discriminator + published=false + locked-set membership) and throw on any
 * delete lacking them.
 */
import { describe, expect, test } from "vitest";
import {
  reapStaleOnboardingSessions,
  type OnboardingSessionTx,
} from "@/lib/onboarding/sessionLifecycle";

const ACTIVE = "aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa";
const STALE = "bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb";
const TERMINAL = "cccccccc-0000-4000-8000-cccccccccccc";

type Row = Record<string, unknown>;

const DRIVE_ID_TABLES = [
  "onboarding_scan_manifest",
  "shows_pending_changes",
  "pending_syncs",
  "pending_ingestions",
  "deferred_ingestions",
] as const;

export class FakeReapTx implements OnboardingSessionTx {
  activeSession: string | null = ACTIVE;
  /** Sessions whose GREATEST activity timestamp is within 24h (freshness contract). */
  freshSessions = new Set<string>();
  tables: Record<string, Row[]> = {
    wizard_finalize_checkpoints: [],
    onboarding_scan_manifest: [],
    shows_pending_changes: [],
    pending_syncs: [],
    pending_ingestions: [],
    deferred_ingestions: [],
    shows: [],
    sync_log: [],
  };
  operations: string[] = [];

  async query<T>(sql: string, params: readonly unknown[] = []) {
    const q = sql.replace(/\s+/g, " ").trim();
    if (/pg_advisory_xact_lock\(hashtext\('finalize:'/.test(q)) {
      this.operations.push(`lock-finalize:${String(params[0])}`);
      return { rows: [] as T[], rowCount: 0 };
    }
    if (/pg_advisory_xact_lock\(hashtext\('show:'/.test(q)) {
      this.operations.push(`lock-show:${String(params[0])}`);
      return { rows: [] as T[], rowCount: 0 };
    }
    if (/^select distinct wizard_session_id from \(/.test(q)) {
      this.operations.push("enumerate-candidates");
      const ids = new Set<string>();
      for (const name of [
        "wizard_finalize_checkpoints",
        "onboarding_scan_manifest",
        "shows_pending_changes",
        "pending_syncs",
        "pending_ingestions",
        "deferred_ingestions",
      ]) {
        for (const r of this.tables[name]!) {
          const sid = r.wizard_session_id as string | null;
          if (sid && sid !== this.activeSession) ids.add(sid);
        }
      }
      const rows = [...ids].sort().map((wizard_session_id) => ({ wizard_session_id }));
      return { rows: rows as T[], rowCount: rows.length };
    }
    if (/^select pending_wizard_session_id from public\.app_settings/.test(q)) {
      this.operations.push("read-active-session");
      return { rows: [{ pending_wizard_session_id: this.activeSession }] as T[], rowCount: 1 };
    }
    if (/greatest\(/.test(q) && /< now\(\) - interval '24 hours', true\) as stale/.test(q)) {
      this.operations.push(`activity-check:${String(params[0])}`);
      return {
        rows: [{ stale: !this.freshSessions.has(String(params[0])) }] as T[],
        rowCount: 1,
      };
    }
    if (
      /from public\.wizard_finalize_checkpoints where wizard_session_id = \$1::uuid and status = 'in_progress'/.test(
        q,
      )
    ) {
      this.operations.push(`recency-check:${String(params[0])}`);
      const rows = this.tables.wizard_finalize_checkpoints!.filter(
        (r) => r.wizard_session_id === params[0] && r.status === "in_progress" && r.recent === true,
      );
      return { rows: rows as T[], rowCount: rows.length };
    }
    if (/^select status from public\.wizard_finalize_checkpoints where wizard_session_id/.test(q)) {
      const rows = this.tables
        .wizard_finalize_checkpoints!.filter((r) => r.wizard_session_id === params[0])
        .map((r) => ({ status: r.status }));
      return { rows: rows as T[], rowCount: rows.length };
    }
    const driveSelect = q.match(
      /^select drive_file_id from public\.([a-z_]+) where wizard_session_id = \$1::uuid$/,
    );
    if (driveSelect) {
      this.operations.push(`collect:${driveSelect[1]}:${String(params[0])}`);
      const rows = this.tables[driveSelect[1]!]!.filter(
        (r) => r.wizard_session_id === params[0],
      ).map((r) => ({ drive_file_id: r.drive_file_id }));
      return { rows: rows as T[], rowCount: rows.length };
    }
    if (/delete from public\.shows s using public\.onboarding_scan_manifest m/.test(q)) {
      this.operations.push(`delete-interim-shows:${String(params[0])}`);
      // R67-1: enforce the FULL real-SQL predicate set in BOTH the SQL shape and
      // the data model. SQL-shape guard — a delete missing any safety predicate
      // THROWS (catches an implementation that drops a guard while this fake
      // still passes):
      for (const required of [
        /m\.created_show_id = s\.id/,
        /m\.drive_file_id = s\.drive_file_id/,
        /s\.wizard_created_session_id = m\.wizard_session_id/,
        /s\.published = false/,
        /m\.drive_file_id = any\(\$2\)/, // reap locked-set membership ($2 = lockedDriveFileIds)
      ]) {
        if (!required.test(q)) throw new Error(`unsafe interim-show delete: missing ${required}`);
      }
      const lockedSet = new Set((params[1] ?? []) as string[]);
      const manifest = this.tables.onboarding_scan_manifest!.filter(
        (r) => r.wizard_session_id === params[0] && r.created_show_id != null,
      );
      const before = this.tables.shows!.length;
      this.tables.shows = this.tables.shows!.filter((show) => {
        const m = manifest.find(
          (r) =>
            r.created_show_id === show.id &&
            r.drive_file_id === show.drive_file_id && // R67-1: provenance binding
            show.wizard_created_session_id === r.wizard_session_id && // show-side discriminator
            lockedSet.has(r.drive_file_id as string), // locked-set membership
        );
        return !(m && show.published === false);
      });
      const count = before - this.tables.shows.length;
      // Mirror the adapter contract (sessionLifecycle.ts postgresTxAdapter):
      // rowCount derives from `returning` rows — the R4 idempotency fix depends
      // on real counts here.
      return {
        rows: Array.from({ length: count }, () => ({ deleted: 1 })) as T[],
        rowCount: count,
      };
    }
    const lockedScopedDelete = q.match(
      /^delete from public\.([a-z_]+) where wizard_session_id = \$1::uuid and drive_file_id = any\(\$2\) returning 1 as deleted$/,
    );
    if (lockedScopedDelete) {
      const table = lockedScopedDelete[1]!;
      this.operations.push(`delete:${table}:${String(params[0])}`);
      const lockedSet = new Set((params[1] ?? []) as string[]);
      const before = this.tables[table]!.length;
      this.tables[table] = this.tables[table]!.filter(
        (r) => !(r.wizard_session_id === params[0] && lockedSet.has(r.drive_file_id as string)),
      );
      const count = before - this.tables[table]!.length;
      return {
        rows: Array.from({ length: count }, () => ({ deleted: 1 })) as T[],
        rowCount: count,
      };
    }
    const scopedDelete = q.match(
      /^delete from public\.([a-z_]+) where wizard_session_id = \$1::uuid returning 1 as deleted$/,
    );
    if (scopedDelete) {
      const table = scopedDelete[1]!;
      // R42-1: a drive-id-bearing reap table deleted WITHOUT the locked-set
      // filter is the exact bug class this suite pins — throw.
      if ((DRIVE_ID_TABLES as readonly string[]).includes(table)) {
        throw new Error(`unsafe session-only delete on drive-id-bearing table ${table}`);
      }
      this.operations.push(`delete:${table}:${String(params[0])}`);
      const before = this.tables[table]!.length;
      this.tables[table] = this.tables[table]!.filter((r) => r.wizard_session_id !== params[0]);
      const count = before - this.tables[table]!.length;
      return {
        rows: Array.from({ length: count }, () => ({ deleted: 1 })) as T[],
        rowCount: count,
      };
    }
    const residue = q.match(
      /^select 1 from public\.([a-z_]+) where wizard_session_id = \$1::uuid limit 1$/,
    );
    if (residue) {
      this.operations.push(`residue-check:${residue[1]}:${String(params[0])}`);
      const rows = this.tables[residue[1]!]!.filter((r) => r.wizard_session_id === params[0]);
      return { rows: rows.slice(0, 1) as T[], rowCount: Math.min(rows.length, 1) };
    }
    if (/^insert into public\.sync_log/.test(q)) {
      this.operations.push(`sync-log:${String(params[0])}`); // params: [sessionId, adminEmail, deletedCount]
      this.tables.sync_log!.push({ params: [...params] });
      return { rows: [] as T[], rowCount: 1 };
    }
    throw new Error(`FakeReapTx: unclassified SQL: ${q}`);
  }
}

export function deps(tx: FakeReapTx) {
  let txCount = 0;
  return {
    // Each withTx call models ONE real transaction (R5: enumeration tx + one tx
    // per session attempt). The marker lets tests assert the per-session tx
    // boundary structurally.
    withTx: async <R>(fn: (t: OnboardingSessionTx) => Promise<R>) => {
      txCount += 1;
      tx.operations.push(`tx-begin:${txCount}`);
      const result = await fn(tx);
      tx.operations.push(`tx-commit:${txCount}`);
      return result;
    },
    requireAdminIdentity: async () => ({ email: "admin@example.com" }),
  };
}

export function staleSessionFixture(tx: FakeReapTx) {
  tx.tables.wizard_finalize_checkpoints!.push({
    wizard_session_id: STALE,
    status: "in_progress",
    recent: false,
  });
  tx.tables.onboarding_scan_manifest!.push(
    {
      wizard_session_id: STALE,
      drive_file_id: "drive-m1",
      status: "applied",
      created_show_id: "show-1",
    },
    {
      wizard_session_id: ACTIVE,
      drive_file_id: "drive-active",
      status: "staged",
      created_show_id: null,
    },
  );
  tx.tables.shows_pending_changes!.push(
    { wizard_session_id: STALE, drive_file_id: "drive-s1" },
    { wizard_session_id: ACTIVE, drive_file_id: "drive-active" },
  );
  tx.tables.pending_syncs!.push(
    { wizard_session_id: STALE, drive_file_id: "drive-p1" },
    { wizard_session_id: ACTIVE, drive_file_id: "drive-active" },
    { wizard_session_id: null, drive_file_id: "drive-live" },
  );
  tx.tables.pending_ingestions!.push({ wizard_session_id: STALE, drive_file_id: "drive-i1" });
  tx.tables.deferred_ingestions!.push(
    { wizard_session_id: STALE, drive_file_id: "drive-d1" },
    { wizard_session_id: null, drive_file_id: "drive-live" },
  );
  // R68-1: a session-CREATED interim show carries the discriminator (the delete
  // predicate requires it); NULL/mismatch variants live only in the explicit
  // forged-provenance negative tests.
  tx.tables.shows!.push({
    id: "show-1",
    drive_file_id: "drive-m1",
    published: false,
    wizard_created_session_id: STALE,
  });
}

describe("reapStaleOnboardingSessions — session-scoped reap (F4)", () => {
  test("a stale in_progress session is fully reaped; the active session and live-partition rows are untouched", async () => {
    const tx = new FakeReapTx();
    staleSessionFixture(tx);
    const result = await reapStaleOnboardingSessions(deps(tx));
    expect(result.sessions).toEqual([{ wizardSessionId: STALE, outcome: "reaped_full" }]);
    // Stale session debris fully removed (checkpoints + shadows + manifest + all
    // three staging tables + interim show).
    for (const name of [
      "wizard_finalize_checkpoints",
      "shows_pending_changes",
      "onboarding_scan_manifest",
      "pending_syncs",
      "pending_ingestions",
      "deferred_ingestions",
    ]) {
      expect(
        tx.tables[name]!.filter((r) => r.wizard_session_id === STALE),
        `${name} must hold no rows for the reaped session`,
      ).toEqual([]);
    }
    expect(tx.tables.shows).toEqual([]); // session-created interim row deleted (provenance, Task 4.4 hardens)
    // Active-session rows and live-partition (wizard_session_id IS NULL) rows survive.
    expect(
      tx.tables.onboarding_scan_manifest!.filter((r) => r.wizard_session_id === ACTIVE),
    ).toHaveLength(1);
    expect(
      tx.tables.shows_pending_changes!.filter((r) => r.wizard_session_id === ACTIVE),
    ).toHaveLength(1);
    expect(tx.tables.pending_syncs!.filter((r) => r.wizard_session_id === ACTIVE)).toHaveLength(1);
    expect(tx.tables.pending_syncs!.filter((r) => r.wizard_session_id === null)).toHaveLength(1);
    expect(tx.tables.deferred_ingestions!.filter((r) => r.wizard_session_id === null)).toHaveLength(
      1,
    );
    // sync_log row written for the reaped session.
    expect(tx.operations).toContain(`sync-log:${STALE}`);
  });

  test("the reap NEVER issues purgeWizardRows-shaped statements or app_settings writes", async () => {
    const tx = new FakeReapTx();
    staleSessionFixture(tx);
    await reapStaleOnboardingSessions(deps(tx));
    // FakeReapTx throws on unclassified SQL, so a `delete ... where
    // wizard_session_id is not null` (purgeWizardRows shape), a bare
    // `delete from public.onboarding_scan_manifest`, or an
    // `update public.app_settings` would have thrown above.
    // Belt-and-suspenders: source-level pin.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("lib/onboarding/sessionLifecycle.ts", "utf8");
    const reapBody = source.slice(
      source.indexOf("export async function reapStaleOnboardingSessions"),
    );
    expect(reapBody.length).toBeGreaterThan(0);
    expect(reapBody).not.toMatch(/purgeWizardRows\(/);
    expect(reapBody).not.toMatch(/update\s+public\.app_settings/i);
  });

  test("orphan rows of a final_cas_done session are reaped (staging tables only); checkpoint + shadows are preserved", async () => {
    const tx = new FakeReapTx();
    tx.tables.wizard_finalize_checkpoints!.push({
      wizard_session_id: TERMINAL,
      status: "final_cas_done",
      recent: false,
    });
    tx.tables.deferred_ingestions!.push({ wizard_session_id: TERMINAL, drive_file_id: "drive-t1" });
    tx.tables.shows_pending_changes!.push({
      wizard_session_id: TERMINAL,
      drive_file_id: "drive-t2",
    });
    const result = await reapStaleOnboardingSessions(deps(tx));
    expect(result.sessions).toEqual([{ wizardSessionId: TERMINAL, outcome: "reaped_orphan_rows" }]);
    expect(tx.tables.deferred_ingestions).toEqual([]); // the F5 commit-window residue shape is sweepable
    // Terminal checkpoint row is the terminal record; CAS-failed shadows are
    // operator-recovery surface (spec §3.2) — both preserved.
    expect(tx.tables.wizard_finalize_checkpoints).toHaveLength(1);
    expect(tx.tables.shows_pending_changes).toHaveLength(1);
  });

  test("a terminal session with ONLY preserved surfaces is NOT reaped: no result entry, no sync_log row", async () => {
    // Concrete failure mode (R4 HIGH): preserved checkpoint + shadows keep the
    // session in the candidate query forever; without the zero-delete guard
    // every run returns it as "reaped_orphan_rows" and writes a sync_log row —
    // inflated success counts + log spam while deleting nothing, indefinitely.
    const tx = new FakeReapTx();
    tx.tables.wizard_finalize_checkpoints!.push({
      wizard_session_id: TERMINAL,
      status: "final_cas_done",
      recent: false,
    });
    tx.tables.shows_pending_changes!.push({
      wizard_session_id: TERMINAL,
      drive_file_id: "drive-t2",
    });
    const result = await reapStaleOnboardingSessions(deps(tx));
    expect(result.sessions).toEqual([]); // skipped_no_residue filtered from reaped output
    expect(tx.operations.filter((op) => op.startsWith("sync-log"))).toEqual([]);
    expect(tx.tables.wizard_finalize_checkpoints).toHaveLength(1);
    expect(tx.tables.shows_pending_changes).toHaveLength(1);
  });

  test("two-run idempotency: run 1 sweeps the terminal session's residue; run 2 reaps nothing and logs nothing", async () => {
    const tx = new FakeReapTx();
    tx.tables.wizard_finalize_checkpoints!.push({
      wizard_session_id: TERMINAL,
      status: "final_cas_done",
      recent: false,
    });
    tx.tables.shows_pending_changes!.push({
      wizard_session_id: TERMINAL,
      drive_file_id: "drive-t2",
    });
    tx.tables.deferred_ingestions!.push({ wizard_session_id: TERMINAL, drive_file_id: "drive-t1" });

    const run1 = await reapStaleOnboardingSessions(deps(tx));
    expect(run1.sessions).toEqual([{ wizardSessionId: TERMINAL, outcome: "reaped_orphan_rows" }]);
    expect(tx.tables.deferred_ingestions).toEqual([]);
    expect(tx.operations.filter((op) => op.startsWith("sync-log"))).toHaveLength(1);

    const run2 = await reapStaleOnboardingSessions(deps(tx));
    expect(run2.sessions).toEqual([]); // session still a candidate (preserved rows), but zero deletes → skipped
    expect(tx.operations.filter((op) => op.startsWith("sync-log"))).toHaveLength(1); // STILL exactly one
    expect(tx.tables.wizard_finalize_checkpoints).toHaveLength(1); // preserved surfaces untouched by run 2
    expect(tx.tables.shows_pending_changes).toHaveLength(1);
  });

  test("a checkpoint-less session with orphan staging rows is fully reaped", async () => {
    const tx = new FakeReapTx();
    tx.tables.pending_ingestions!.push({ wizard_session_id: STALE, drive_file_id: "drive-x1" });
    const result = await reapStaleOnboardingSessions(deps(tx));
    expect(result.sessions).toEqual([{ wizardSessionId: STALE, outcome: "reaped_full" }]);
    expect(tx.tables.pending_ingestions).toEqual([]);
  });

  test("no candidates → empty result, zero lock acquisitions, zero deletes", async () => {
    const tx = new FakeReapTx();
    tx.tables.pending_syncs!.push({ wizard_session_id: ACTIVE, drive_file_id: "drive-active" });
    const result = await reapStaleOnboardingSessions(deps(tx));
    expect(result.sessions).toEqual([]);
    expect(tx.operations.filter((op) => op.startsWith("lock-") || op.startsWith("delete"))).toEqual(
      [],
    );
  });
});

describe("reap lock-set expansion retry (R24-1/R27-1/R28-1)", () => {
  /**
   * Interposes on FakeReapTx.query so a NEW pending_syncs row appears in the
   * RE-collection (the collect that runs under the show locks). `expansions`
   * controls how many attempts see an expanded set: 1 → attempt 1 throws,
   * attempt 2 succeeds; 3+ → every attempt throws → budget exhausted →
   * skipped_unstable.
   */
  function injectLateRows(tx: FakeReapTx, expansions: number) {
    let pendingSyncCollects = 0;
    let injected = 0;
    const originalQuery = tx.query.bind(tx);
    tx.query = (async (sql: string, params: readonly unknown[] = []) => {
      const q = sql.replace(/\s+/g, " ").trim();
      if (
        /^select drive_file_id from public\.pending_syncs where wizard_session_id = \$1::uuid$/.test(
          q,
        )
      ) {
        pendingSyncCollects += 1;
        // Every EVEN-numbered pending_syncs collect is a recheck (initial,
        // recheck, initial, recheck, ...). Inject a fresh drive id right
        // before the recheck executes so the recheck sees an id the lock
        // pass never acquired.
        if (pendingSyncCollects % 2 === 0 && injected < expansions) {
          injected += 1;
          tx.tables.pending_syncs!.push({
            wizard_session_id: STALE,
            drive_file_id: `drive-aa-late-${injected}`, // sorts BEFORE the fixture ids
          });
        }
      }
      return originalQuery(sql, params);
    }) as FakeReapTx["query"];
  }

  test("a lock-set expansion rolls the session back and retries from a fresh sorted set (no in-place acquisition)", async () => {
    const tx = new FakeReapTx();
    tx.tables.pending_syncs!.push({ wizard_session_id: STALE, drive_file_id: "drive-z1" });
    injectLateRows(tx, 1);
    const result = await reapStaleOnboardingSessions(deps(tx));
    expect(result.sessions).toEqual([{ wizardSessionId: STALE, outcome: "reaped_full" }]);
    // The late row WAS reaped — but only on the retry attempt, under its own lock.
    expect(tx.tables.pending_syncs).toEqual([]);
    expect(tx.operations).toContain("lock-show:drive-aa-late-1");
    // NEVER acquire an additional show lock while already holding higher-sorted
    // ones: within every attempt the acquired sequence must be sorted.
    const attempts: string[][] = [];
    let current: string[] | null = null;
    for (const op of tx.operations) {
      if (op.startsWith("tx-begin:")) current = [];
      if (op.startsWith("lock-show:") && current) current.push(op.slice("lock-show:".length));
      if (op.startsWith("tx-commit:") && current) {
        attempts.push(current);
        current = null;
      }
    }
    // Attempt 1 (rolled back, no commit marker) is captured at throw time via
    // the in-flight `current`; assert every COMMITTED attempt locked in sorted
    // order and never re-locked an already-held id.
    for (const locked of attempts) {
      expect(locked).toEqual([...locked].sort((a, b) => a.localeCompare(b)));
      expect(new Set(locked).size).toBe(locked.length);
    }
  });

  test("persistent expansion exhausts the bounded retry budget (3) → skipped_unstable, zero deletes, no sync_log", async () => {
    const tx = new FakeReapTx();
    tx.tables.pending_syncs!.push({ wizard_session_id: STALE, drive_file_id: "drive-z1" });
    injectLateRows(tx, 99); // every recheck expands
    const result = await reapStaleOnboardingSessions(deps(tx));
    // R29-2: skipped_unstable MUST be visible to the admin caller.
    expect(result.sessions).toEqual([{ wizardSessionId: STALE, outcome: "skipped_unstable" }]);
    expect(tx.operations.filter((op) => op.startsWith("delete"))).toEqual([]);
    expect(tx.operations.filter((op) => op.startsWith("sync-log"))).toEqual([]);
    // Exactly 3 attempts were made (3 finalize-lock acquisitions for the session).
    expect(tx.operations.filter((op) => op === `lock-finalize:${STALE}`)).toHaveLength(3);
  });
});
