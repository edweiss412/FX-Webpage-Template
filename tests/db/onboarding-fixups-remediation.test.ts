import { beforeAll, describe, expect, it } from "vitest";
import {
  sql,
  newConn,
  runRemediationPass,
  resetPassMarkers,
  seedPassMarker,
  seedShow,
  seedCrew,
  seedAudit,
  readWatermark,
  setWatermark,
  BROKEN_FIRST_SEEN,
  BROKEN_CAS,
  F1_CAS,
  NON_WIZARD,
  PURGED_SESSION_ID,
  MARKER_KEY,
  assertLocalDbUrl,
} from "@/tests/db/_remediationHelpers";
import { randomUUID } from "node:crypto";

const T1 = "2026-06-01T10:00:00.000Z";
const T2 = "2026-06-01T12:00:00.000Z";
const T3 = "2026-06-01T14:00:00.000Z";

beforeAll(async () => {
  // First run creates data_migration_markers (idempotent) so resetPassMarkers can run.
  await runRemediationPass();
});

describe("F2 Arm A — first-seen wizard damage (spec §4 + R7)", () => {
  it("resets a damaged wizard show; leaves healthy + manually-resynced shows untouched", async () => {
    // Failure modes caught: (a) migration never lands / predicate inverted →
    // damaged.watermark stays T2 and cron never re-processes the file;
    // (b) over-broad predicate → a healthy or genuinely re-synced show gets
    // watermark-nulled and burns a redundant full re-sync.
    await resetPassMarkers();
    const damaged = await seedShow({ watermark: T2 });
    await seedAudit({
      showId: damaged.id,
      driveFileId: damaged.driveFileId,
      summary: BROKEN_FIRST_SEEN,
      stagedModifiedTime: T2,
    });
    const healthy = await seedShow({ watermark: T2 });
    await seedCrew(healthy.id);
    await seedAudit({
      showId: healthy.id,
      driveFileId: healthy.driveFileId,
      summary: BROKEN_FIRST_SEEN,
      stagedModifiedTime: T2,
    });
    const resynced = await seedShow({ watermark: T3 }); // watermark advanced PAST the wizard audit
    await seedAudit({
      showId: resynced.id,
      driveFileId: resynced.driveFileId,
      summary: BROKEN_FIRST_SEEN,
      stagedModifiedTime: T2,
    });

    await runRemediationPass();

    expect(await readWatermark(damaged.id)).toBeNull();
    expect(await readWatermark(healthy.id)).not.toBeNull();
    expect(await readWatermark(resynced.id)).not.toBeNull(); // genuinely crew-less sheet, real sync won
  });

  it("R7: a later NON-wizard audit row that did not advance the watermark does NOT shield a damaged show", async () => {
    // Failure mode: an "audit purity" predicate (no non-wizard audits exist)
    // would permanently exclude this still-damaged show — watermarked-as-current forever.
    await resetPassMarkers();
    const s = await seedShow({ watermark: T2 });
    await seedAudit({
      showId: s.id,
      driveFileId: s.driveFileId,
      summary: BROKEN_FIRST_SEEN,
      stagedModifiedTime: T2,
      appliedAtAgo: "10 minutes",
    });
    // Non-wizard audit, LATER applied_at, but staged BELOW the watermark (probe/recovery write).
    await seedAudit({
      showId: s.id,
      driveFileId: s.driveFileId,
      summary: NON_WIZARD,
      stagedModifiedTime: T1,
    });

    await runRemediationPass();
    expect(await readWatermark(s.id)).toBeNull();
  });

  it("R19-2: a genuinely zero-crew wizard show resets at most once (Arm A windowing)", async () => {
    // Failure mode: without the per-pass window, the old wizard audit re-qualifies on
    // EVERY re-run (backfill restores the same modified time with still-zero crew) →
    // infinite reset/re-sync loop for genuinely crew-less sheets.
    await resetPassMarkers();
    const s = await seedShow({ watermark: T2 });
    await seedAudit({
      showId: s.id,
      driveFileId: s.driveFileId,
      summary: BROKEN_FIRST_SEEN,
      stagedModifiedTime: T2,
      appliedAtAgo: "2 hours",
    });

    await runRemediationPass(); // pass 1: prev_pass IS NULL → no window → reset
    expect(await readWatermark(s.id)).toBeNull();

    // Backfill: cron re-applies the same revision — same modified time, STILL zero
    // crew, and (load-bearing) writes no onboarding_finalize sync_audit row.
    await setWatermark(s.id, T2);

    await runRemediationPass(); // pass 2: audit applied_at (2h ago) ≤ prev_pass − 1h → excluded
    expect(await readWatermark(s.id)).not.toBeNull();
  });
});

describe("F2 Arm B — existing-show CAS damage (R13/R14/R15/R16/R18-2)", () => {
  it("R13: nonzero-but-stale children behind a broken-shape CAS audit ARE reset", async () => {
    // Failure mode: Arm A alone (zero-crew predicate) misses existing shows whose
    // OLD children survived while the wizard advanced the watermark — stale data
    // invisible until Doug edits the sheet.
    await resetPassMarkers();
    const s = await seedShow({ watermark: T2 });
    await seedCrew(s.id); // stale, NONZERO crew
    await seedAudit({
      showId: s.id,
      driveFileId: s.driveFileId,
      summary: BROKEN_CAS,
      stagedModifiedTime: T2,
    });

    await runRemediationPass();
    expect(await readWatermark(s.id)).toBeNull();
  });

  it("R14: matches by audit SHAPE at any age (pass 1), and an F1-shape latest audit does NOT match", async () => {
    // Failure modes: (a) a calendar-cutoff predicate misses broken-writer damage
    // written after the cutoff was chosen; (b) matching ANY broken audit instead of
    // the LATEST at-or-after-watermark audit resets a show F1 already re-applied.
    await resetPassMarkers();
    const oldDamage = await seedShow({ watermark: T2 });
    await seedCrew(oldDamage.id);
    await seedAudit({
      showId: oldDamage.id,
      driveFileId: oldDamage.driveFileId,
      summary: BROKEN_CAS,
      stagedModifiedTime: T2,
      appliedAtAgo: "90 days",
    });

    const healed = await seedShow({ watermark: T2 });
    await seedCrew(healed.id);
    await seedAudit({
      showId: healed.id,
      driveFileId: healed.driveFileId,
      summary: BROKEN_CAS,
      stagedModifiedTime: T2,
      appliedAtAgo: "1 day",
    });
    await seedAudit({
      showId: healed.id,
      driveFileId: healed.driveFileId,
      summary: F1_CAS,
      stagedModifiedTime: T3,
    }); // latest writer = fixed F1

    await runRemediationPass();
    expect(await readWatermark(oldDamage.id)).toBeNull();
    expect(await readWatermark(healed.id)).not.toBeNull();
  });

  it("R15: a cron-healed show is NOT re-reset on a later pass (heal writes no sync_audit row)", async () => {
    // Failure mode: audit shape alone cannot prove convergence (the heal is
    // audit-invisible); without per-pass windowing every re-run re-nulls the healed
    // show → permanent reset/re-sync churn.
    await resetPassMarkers();
    const s = await seedShow({ watermark: T2 });
    await seedCrew(s.id);
    await seedAudit({
      showId: s.id,
      driveFileId: s.driveFileId,
      summary: BROKEN_CAS,
      stagedModifiedTime: T2,
      appliedAtAgo: "2 hours",
    });

    await runRemediationPass(); // pass 1 resets
    expect(await readWatermark(s.id)).toBeNull();
    await setWatermark(s.id, T2); // cron heal: same revision re-applied, NO new audit row

    await runRemediationPass(); // pass 2: broken audit is pre-window → excluded
    expect(await readWatermark(s.id)).not.toBeNull();
  });

  it("R16: broken-writer damage written AFTER pass 1 (deploy-skew window) is caught by pass 2", async () => {
    // Failure mode: a global one-shot guard ("marker exists → return") permanently
    // masks damage written between migration-apply and code-deploy.
    await resetPassMarkers();
    await runRemediationPass(); // pass 1 happens BEFORE the damage exists
    const s = await seedShow({ watermark: T2 });
    await seedCrew(s.id);
    await seedAudit({
      showId: s.id,
      driveFileId: s.driveFileId,
      summary: BROKEN_CAS,
      stagedModifiedTime: T2,
    }); // applied_at = now() > pass 1

    await runRemediationPass(); // pass 2
    expect(await readWatermark(s.id)).toBeNull();
  });

  it("R18-2: a finalize tx that STARTED before a pass and committed after it is caught (1-hour margin)", async () => {
    // Failure mode: applied_at defaults to now() = transaction-START time; a strict
    // `applied_at > prev_pass` predicate classifies the straddling finalize as
    // old damage and masks it forever.
    await resetPassMarkers();
    await seedPassMarker("30 minutes"); // pass 1 ran 30 min ago
    const s = await seedShow({ watermark: T2 });
    await seedCrew(s.id);
    // Broken finalize whose tx began 45 min ago (before pass 1) but committed after it.
    await seedAudit({
      showId: s.id,
      driveFileId: s.driveFileId,
      summary: BROKEN_CAS,
      stagedModifiedTime: T2,
      appliedAtAgo: "45 minutes",
    });

    await runRemediationPass(); // pass 2: applied_at (−45m) > prev_pass (−30m) − 1h → eligible
    expect(await readWatermark(s.id)).toBeNull();
  });
});

describe("F2 locked re-check (R12-2) — concurrent heal between SELECT and lock", () => {
  it("a show healed while the migration waits on its advisory lock is left untouched", async () => {
    // Failure mode: a bare `where s.id = r.id` UPDATE (no re-checked eligibility
    // predicate under the lock) resets the just-healed show → redundant full
    // re-sync and a watermark regression the healing sync already advanced.
    await resetPassMarkers();
    const s = await seedShow({ watermark: T2 });
    await seedAudit({
      showId: s.id,
      driveFileId: s.driveFileId,
      summary: BROKEN_FIRST_SEEN,
      stagedModifiedTime: T2,
    });

    const a = newConn();
    try {
      let release!: () => void;
      const held = new Promise<void>((r) => (release = r));
      // Connection A: take the show lock, then heal INSIDE the lock, then commit.
      const aTx = a.begin(async (tx) => {
        await tx.unsafe(`select pg_advisory_xact_lock(hashtext('show:' || $1))`, [s.driveFileId]);
        // Migration (connection B) is started while A holds the lock.
        await held;
        // Heal: children land + watermark advances (what a concurrent sync does).
        await tx.unsafe(
          `insert into public.crew_members (show_id, name, role) values ($1::uuid, $2, 'A1')`,
          [s.id, `Crew ${randomUUID()}`],
        );
        await tx.unsafe(
          `update public.shows set last_seen_modified_time = $2::timestamptz where id = $1::uuid`,
          [s.id, T3],
        );
      });

      const b = newConn();
      const migration = runRemediationPass(b).finally(() => b.end());
      // Wait until B is genuinely blocked on the advisory lock (pattern:
      // tests/db/_b2Helpers.ts raceArchiveAgainst pg_stat_activity poll).
      for (let i = 0; i < 200; i += 1) {
        const waiting = await sql<{ n: string }[]>`
          select count(*)::text as n from pg_stat_activity
           where wait_event_type = 'Lock' and wait_event = 'advisory'`;
        if (Number(waiting[0]!.n) > 0) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      release();
      await aTx; // A commits → lock released → B's locked re-check runs
      await migration;

      expect(await readWatermark(s.id)).toBe(new Date(T3).toISOString()); // NOT nulled
    } finally {
      await a.end();
    }
  });
});

describe("destructive-suite local-host guard (adversarial R9 HIGH)", () => {
  it("refuses a non-local database URL BEFORE any connection attempt", () => {
    // Failure mode: a fallback to TEST_DATABASE_URL (the VALIDATION project in
    // this repo's .env.local) would let a routine `pnpm vitest run` execute the
    // watermark resets + the exact-ID purge of the 30 real validation sessions
    // against validation BEFORE Task 2.5's surgical apply — corrupting the
    // close-out verification and seeding test fixtures into validation.
    // assertLocalDbUrl is a pure URL-parse check: the expect().toThrow proves it
    // rejects synchronously, with no postgres() client ever constructed.
    expect(() =>
      assertLocalDbUrl(
        "postgresql://postgres:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      ),
    ).toThrow(/REFUSING non-local database host/);
    expect(() => assertLocalDbUrl("not a url")).toThrow(/unparseable database URL/);
    // Loopback forms pass through unchanged.
    expect(assertLocalDbUrl("postgresql://postgres:postgres@127.0.0.1:54322/postgres")).toBe(
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    );
    expect(assertLocalDbUrl("postgresql://postgres:postgres@localhost:54322/postgres")).toBe(
      "postgresql://postgres:postgres@localhost:54322/postgres",
    );
  });
});

describe("F2 idempotency + marker-table lockdown", () => {
  it("the full file applies twice back-to-back; an already-reset show stays reset and untouched", async () => {
    // Failure mode: non-idempotent DDL (bare CREATE TABLE) or a reset loop that
    // chokes on `last_seen_modified_time IS NULL` rows → second apply errors,
    // which would also break the validation surgical re-apply.
    await resetPassMarkers();
    const s = await seedShow({ watermark: T2 });
    await seedAudit({
      showId: s.id,
      driveFileId: s.driveFileId,
      summary: BROKEN_FIRST_SEEN,
      stagedModifiedTime: T2,
    });
    await runRemediationPass();
    expect(await readWatermark(s.id)).toBeNull();
    await runRemediationPass(); // must not throw; nulled row fails the `is not null` guard
    expect(await readWatermark(s.id)).toBeNull();
    const markers = await sql<{ n: string }[]>`
      select count(*)::text as n from public.data_migration_markers where key = ${MARKER_KEY}`;
    expect(Number(markers[0]!.n)).toBe(2); // one pass row per execution
  });

  it("data_migration_markers is locked down (RLS on, no anon/authenticated DML)", async () => {
    // Failure mode: Supabase default privileges expose the new table to PostgREST;
    // any authenticated caller could insert a fake pass row and mask Arm B damage.
    const rls = await sql<{ relrowsecurity: boolean }[]>`
      select relrowsecurity from pg_class where oid = 'public.data_migration_markers'::regclass`;
    expect(rls[0]!.relrowsecurity).toBe(true);
    const grants = await sql<{ n: string }[]>`
      select count(*)::text as n from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'data_migration_markers'
         and grantee in ('anon', 'authenticated')
         and privilege_type in ('INSERT', 'UPDATE', 'DELETE')`;
    expect(Number(grants[0]!.n)).toBe(0);
  });
});

describe("F4 one-time purge (rides this migration; exact-id keyed)", () => {
  it("removes every row of a listed synthetic session; non-listed sessions and live rows survive", async () => {
    // Failure modes: (a) purge keys on a drive_file_id prefix (rejected R23-2) and
    // misses/over-deletes; (b) purge deletes a NON-listed session's staging (the
    // exact-id contract); (c) purge deletes LIVE-partition rows sharing a drive_file_id.
    const keepSession = randomUUID();
    const dfP = `drive-${randomUUID()}`;
    const dfK = `drive-${randomUUID()}`;
    const showP = await seedShow({ watermark: null });
    const showK = await seedShow({ watermark: null });

    for (const [sid, df, show] of [
      [PURGED_SESSION_ID, dfP, showP],
      [keepSession, dfK, showK],
    ] as const) {
      await sql`insert into public.wizard_finalize_checkpoints (wizard_session_id, status)
                values (${sid}, 'in_progress')
                on conflict (wizard_session_id) do nothing`;
      await sql`insert into public.shows_pending_changes
                  (wizard_session_id, drive_file_id, show_id, payload, applied_by_email, applied_at_intent)
                values (${sid}, ${df}, ${show.id}, '{}'::jsonb, 'remediation-test@example.com', now())`;
      await sql`insert into public.onboarding_scan_manifest
                  (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
                values ('folder-x', ${sid}, ${df}, 'application/vnd.google-apps.spreadsheet', 'fixture', 'applied')`;
      await sql`insert into public.pending_syncs
                  (drive_file_id, staged_modified_time, parse_result, source_kind, wizard_session_id, warning_summary)
                values (${df}, now(), '{}'::jsonb, 'onboarding_scan', ${sid}, '')`;
      await sql`insert into public.pending_ingestions
                  (drive_file_id, drive_file_name, last_error_code, last_error_message, wizard_session_id)
                values (${df}, 'fixture', 'PARSE_FAILED', 'fixture', ${sid})`;
      await sql`insert into public.deferred_ingestions
                  (drive_file_id, wizard_session_id, deferred_kind)
                values (${df}, ${sid}, 'defer_until_modified')`;
    }
    // LIVE pending_ingestions row sharing the purged session's drive_file_id.
    await sql`insert into public.pending_ingestions
                (drive_file_id, drive_file_name, last_error_code, last_error_message, wizard_session_id)
              values (${dfP}, 'live-fixture', 'PARSE_FAILED', 'fixture', null)`;

    await runRemediationPass();

    const countIn = async (table: string, sid: string): Promise<number> => {
      const r = await sql.unsafe<{ n: number }[]>(
        `select count(*)::int as n from public.${table} where wizard_session_id = $1::uuid`,
        [sid],
      );
      return r[0]!.n;
    };
    for (const table of [
      "wizard_finalize_checkpoints",
      "shows_pending_changes",
      "onboarding_scan_manifest",
      "pending_syncs",
      "pending_ingestions",
      "deferred_ingestions",
    ]) {
      expect(await countIn(table, PURGED_SESSION_ID), `${table} purged-id rows`).toBe(0);
      expect(await countIn(table, keepSession), `${table} kept-id rows`).toBe(1);
    }
    const live = await sql<{ n: string }[]>`
      select count(*)::text as n from public.pending_ingestions
       where drive_file_id = ${dfP} and wizard_session_id is null`;
    expect(Number(live[0]!.n)).toBe(1); // live partition untouched

    // Cleanup the kept-session debris (test isolation across runs).
    for (const table of [
      "wizard_finalize_checkpoints",
      "shows_pending_changes",
      "onboarding_scan_manifest",
      "pending_syncs",
      "pending_ingestions",
      "deferred_ingestions",
    ]) {
      await sql.unsafe(`delete from public.${table} where wizard_session_id = $1::uuid`, [
        keepSession,
      ]);
    }
    await sql`delete from public.pending_ingestions where drive_file_id = ${dfP} and wizard_session_id is null`;
  });
});
