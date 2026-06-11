# Phase 2 — F2 remediation migration (windowed watermark reset + F4 one-time purge)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this phase task-by-task. Steps use checkbox (`- [ ]`) syntax. Every task is TDD: failing test → minimal implementation → passing test → commit. **Owner:** backend implementer — no UI files. NOTE: this phase requires a live local Postgres (local Supabase stack) and a psql apply; the Codex sandbox blocks DB access (precedent: sync-changes-feed milestone, where Opus subagents implemented all DB-touching phases). Route accordingly.

**Spec:** `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-10-onboarding-fixups-design.md` §4 (F2) + §6 final bullet (F4 one-time purge rides this migration). The §4 SQL block is copied **verbatim** into the migration — do not "improve" it; every clause is the residue of a numbered adversarial finding (R7/R12/R13/R14/R15/R16/R18-2/R19-2) and each clause has a regression test below.

**Goal:** One migration file — `supabase/migrations/20260611000001_onboarding_fixups_remediation.sql` — containing (1) the `data_migration_markers` table, (2) the windowed two-arm watermark-reset DO block (spec §4, verbatim), (3) the F4 one-time purge of the 18 synthetic validation wizard sessions, plus the full regression suite, the `ON_ERROR_STOP` local-apply verification, the schema-manifest regen commit, and the documented surgical validation apply.

**Depends on:** Phase 1 (F1) only for the *audit-shape contract*: F1's Phase D writer is required (spec §4 R14 bullet, citing R8-1) to emit the shared `parseResultSummary` shape (`lib/sync/applyStaged.ts:505-512` — `{ title, crewCount, roomCount, warningCount }`) **plus** a `'source': 'onboarding_finalize_cas'` key. ⚠️ Pre-draft verification note: the live shared `parseResultSummary` has NO `source` key today — adding it for the wizard writers is a Phase 1 deliverable; this phase's "F1-shape audit" fixtures assume it. The migration itself has no code dependency on Phase 1 and is deployment-order-independent by design (Arm B keys on audit *shape*, not dates — spec §4 R14).

**Deployment ordering:** apply this migration AFTER Phase 1's code deploys (same posture as `supabase/migrations/20260608000004_retire_live_pending_syncs.sql:9-13` — the migration is a residue sweep, not concurrency control against the old writer; the per-pass windowing makes pre-deploy application *safe* but wasteful, since pre-F1 wizard re-runs would re-damage and need another pass).

**Lock topology (spec §3.3 row "F2 remediation migration"):** the migration's own DO-block loop is the single holder of `show:<drive_file_id>` per candidate, acquired in deterministic `drive_file_id` order. It is a DO block, NOT a `create function`, so `tests/auth/advisoryLockRpcDeadlock.test.ts` (which greps create-function bodies) does not need extension — same exemption rationale documented at `supabase/migrations/20260608000004_retire_live_pending_syncs.sql:17-18`. No new lock-acquiring RPC surface appears in this phase.

**Meta-test inventory (spec §9):** this phase EXTENDS nothing and CREATES nothing in the structural registries — the two NEW structural guards in §9 (second-copy tripwire, live-vs-wizard partition classification) are Phase 1 deliverables; `data_migration_markers` is not RPC-gated (no RPC touches it), so `tests/db/postgrest-dml-lockdown.test.ts` registry is N/A — but the table DOES get RLS + REVOKE lockdown (Task 2.2 step 5) because Supabase default privileges would otherwise expose it to PostgREST DML.

---

## Task 2.1 — Capture the exact 18 synthetic `wizard_session_id` values (verification step, no commit)

The F4 purge is keyed to the EXACT ids (spec §6: "keyed to the EXACT 18 `wizard_session_id` values captured from the validation DB (enumerated in the migration; no-op in any environment where they don't exist)"). A `drive_file_id like 'drive-%'` prefix boundary was explicitly rejected (spec §6, R23 finding 2).

**Steps:**

- [ ] **1. Query the validation DB** (TEST_DATABASE_URL lives in the repo root `.env.local` of the main checkout):

```bash
set -a && source .env.local && set +a
psql "$TEST_DATABASE_URL" -At -c "select wizard_session_id from public.wizard_finalize_checkpoints where status <> 'final_cas_done' order by 1;"
psql "$TEST_DATABASE_URL" -At -c "select count(*), count(distinct wizard_session_id), bool_and(drive_file_id like 'drive-%') from public.shows_pending_changes;"
```

- [ ] **2. Confirm** the two id sets are identical (18 ids; `shows_pending_changes` count check returns `18|18|t`). Captured 2026-06-11 (already verified during plan drafting — re-run to confirm nothing moved before the migration commits):

```text
02304ebb-1d29-4a7e-b042-86b893247240
023ddce3-9d9c-428a-b3bc-59501b73e77b
2123a4d7-2992-4345-bb98-6882b09951e4
2265e894-3d42-4c93-9a9a-fce6dda97fa1
24b619a2-b2f7-4432-a114-640e05833ee5
35fd4ba3-4fd6-4c27-9b74-8284ca7f7c70
417b1867-8d7e-49a2-bb31-0abb413355c5
43d95a73-eaf4-4a91-b97a-3e3bddfe5c23
515d2e64-23d9-483f-9a05-ace5030af67d
943737a2-caa7-4771-ad66-62fde4f8e888
ad5b5459-0f2d-46b7-a185-f64b681d4286
b864845d-12b6-40ca-8750-a1109984ee5a
bfd41ae1-4c0a-42e2-8d75-a6489690071c
d1d15523-b62d-403d-9ee0-508a338a8970
d5e32eaf-9c87-4625-96ca-7735e245998c
d6975cf2-6062-4fc7-a92f-e61eab9be538
da638b4b-7079-45fb-b6af-635a3f67d59d
ffda8263-241c-427e-8c04-51dba595ea83
```

  (4 additional checkpoints exist at `final_cas_done` — real completed sessions; they are NOT in the purge list.) If the re-run differs, update the migration's array AND this file before committing.

---

## Task 2.2 — Migration + regression suite (TDD, one commit)

**Files:**
- New: `supabase/migrations/20260611000001_onboarding_fixups_remediation.sql` (latest existing migration is `20260609000000_lockdown_allowed_watermark_columns.sql` — timestamp verified free)
- New: `tests/db/_remediationHelpers.ts`
- New: `tests/db/onboarding-fixups-remediation.test.ts`

**Schema facts verified against the live repo (cite-checked 2026-06-11):**
- `public.shows` NOT-NULL-no-default seed columns: `drive_file_id, slug, title, client_label, template_version` (`supabase/migrations/20260501000000_initial_public_schema.sql:3-29`); `last_seen_modified_time` nullable (:27).
- `public.crew_members(show_id, name, role)` NOT NULL (`20260501000000:31-47`).
- `public.sync_audit` NOT NULL columns: `drive_file_id, applied_at (default now()), applied_by, staged_id, triggered_review_items, reviewer_choices, derived_side_effects, parse_result_summary, staged_modified_time` (`supabase/migrations/20260501001000_internal_and_admin.sql:204-217`). `id` is `uuid` (random) — the spec SQL's `sa.id desc` tiebreak is deterministic-per-dataset, not insertion-ordered; tests therefore never construct ties on `(staged_modified_time, applied_at)`.
- Broken first-seen audit shape: `jsonb_build_object('title', $6::text, 'source', 'onboarding_finalize')` (`app/api/admin/onboarding/finalize/route.ts:393`); broken CAS shape: `'source', 'onboarding_finalize_cas'`, no `crewCount` key (`app/api/admin/onboarding/finalize-cas/route.ts:308-321`). Live cron/dashboard audits use the shared summary with NO `source` key (`lib/sync/applyStaged.ts:505-512`) — so Arm A's `source in (...)` can never match a real-sync audit. ✔ matches spec claims.
- Purge tables + key columns: `wizard_finalize_checkpoints.wizard_session_id uuid not null unique` (`20260501001000:420-428`), `shows_pending_changes.wizard_session_id` (:433-443, FK `show_id → shows` cascade), `onboarding_scan_manifest.wizard_session_id` (:336-358), `pending_syncs.wizard_session_id uuid` (:150), `pending_ingestions.wizard_session_id` (:195), `deferred_ingestions.wizard_session_id` (:253). `pending_syncs.warning_summary` is NOT NULL (:157).
- Lock key shapes: `hashtext('show:' || drive_file_id)` (`lib/sync/lockedShowTx.ts:59-61`), `hashtext('finalize:' || sessionId)` (`lib/onboarding/sessionLifecycle.ts:329`). Cleanup's lock order is finalize-lock → `app_settings FOR UPDATE` → show locks (sessionLifecycle.ts:329-374) — the purge mirrors it (finalize locks, then show locks; it never touches `app_settings`).

### Steps

- [ ] **1. Write the helper** — `tests/db/_remediationHelpers.ts` (postgres.js client pattern per `tests/db/_b2Helpers.ts`, but **deliberately NOT its `TEST_DATABASE_URL → DATABASE_URL → local` fallback chain**). ⚠️ **Destructive-suite guard (adversarial R9, HIGH):** in this repo `TEST_DATABASE_URL` is the VALIDATION Supabase project (`.env.local`; Tasks 2.1/2.5). This suite executes the FULL migration — watermark resets + the exact-ID purge of the 18 REAL validation sessions — so the `_b2Helpers` fallback chain would, with `.env.local` loaded, run the purge against validation BEFORE Task 2.5's intended surgical apply. Concrete failure mode: Task 2.5's close-out verification (steps 2–3 expect to observe the migration's first validation pass — ≥6 watermark-nulled shows, 18→0 checkpoint/shadow counts) finds the work already done by an uncontrolled test run, plus test fixtures seeded into validation. The helper therefore reads ONLY an explicit `LOCAL_TEST_DATABASE_URL` (default: the local Supabase literal `postgresql://postgres:postgres@127.0.0.1:54322/postgres` — same final-fallback literal as `tests/db/_b2Helpers.ts:8`, the repo's local convention) and refuses non-loopback hosts BEFORE any connection attempt:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import postgres, { type Sql } from "postgres";

const LOCAL_DEFAULT = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/**
 * DESTRUCTIVE-SUITE GUARD (adversarial R9 HIGH). This suite applies the full
 * remediation migration, INCLUDING the F4 purge keyed to 18 REAL validation
 * wizard-session ids. It must never connect to a remote host:
 *   - NO TEST_DATABASE_URL / DATABASE_URL fallback — in this repo
 *     TEST_DATABASE_URL is the validation project (.env.local);
 *   - the URL host must be loopback, asserted BEFORE postgres() is invoked
 *     (URL parse only — no connection is ever attempted on refusal).
 * Validation access for this migration lives ONLY in the plan's Task 2.5
 * surgical-apply close-out commands — never in any test run.
 */
export function assertLocalDbUrl(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`_remediationHelpers: unparseable database URL (${url})`);
  }
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "[::1]" && host !== "::1") {
    throw new Error(
      `_remediationHelpers: REFUSING non-local database host "${host}". ` +
        "This suite applies the destructive F2/F4 remediation migration and only " +
        "runs against local Supabase. Set LOCAL_TEST_DATABASE_URL to a " +
        "127.0.0.1/localhost URL (TEST_DATABASE_URL is the validation project " +
        "and is intentionally ignored by this helper).",
    );
  }
  return url;
}

const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL ?? LOCAL_DEFAULT);

export const sql: Sql = postgres(DB_URL, { max: 4, prepare: false });
export const newConn = (): Sql => postgres(DB_URL, { max: 1, prepare: false });

export const MIGRATION_PATH = join(
  process.cwd(),
  "supabase/migrations/20260611000001_onboarding_fixups_remediation.sql",
);
export const MARKER_KEY = "onboarding_fixups_watermark_reset";

// One of the 18 synthetic validation session ids the F4 purge enumerates
// (Task 2.1). Seeding rows under it locally proves the purge actually
// deletes by EXACT id — and that a non-listed id survives.
export const PURGED_SESSION_ID = "02304ebb-1d29-4a7e-b042-86b893247240";

/** Run the WHOLE migration file (marker table + windowed reset + purge). One "pass". */
export async function runRemediationPass(conn: Sql = sql): Promise<void> {
  await conn.unsafe(readFileSync(MIGRATION_PATH, "utf8"));
}

/** Delete all pass markers → the next run is "pass 1" (prev_pass IS NULL). */
export async function resetPassMarkers(): Promise<void> {
  await sql`delete from public.data_migration_markers where key = ${MARKER_KEY}`;
}

/** Simulate a historical pass at now() - <interval> without sleeping. */
export async function seedPassMarker(agoInterval: string): Promise<void> {
  await sql.unsafe(
    `insert into public.data_migration_markers (key, executed_at)
       values ($1, now() - $2::interval)`,
    [MARKER_KEY, agoInterval],
  );
}

export type SeededShow = { id: string; driveFileId: string };

export async function seedShow(opts: { watermark: string | null }): Promise<SeededShow> {
  const driveFileId = `remed-${randomUUID()}`;
  const rows = await sql<{ id: string }[]>`
    insert into public.shows
      (drive_file_id, slug, title, client_label, template_version, last_seen_modified_time)
    values
      (${driveFileId}, ${`remed-${randomUUID()}`}, 'Remediation Fixture', 'Client', 'v1',
       ${opts.watermark})
    returning id`;
  return { id: rows[0]!.id, driveFileId };
}

export async function seedCrew(showId: string): Promise<void> {
  await sql`insert into public.crew_members (show_id, name, role)
            values (${showId}, ${`Crew ${randomUUID()}`}, 'A1')`;
}

/** Audit summary shapes (verified against the live writers — see file header). */
export const BROKEN_FIRST_SEEN = { title: "x", source: "onboarding_finalize" };
export const BROKEN_CAS = { title: "x", source: "onboarding_finalize_cas" };
export const F1_CAS = {
  title: "x", source: "onboarding_finalize_cas", crewCount: 6, roomCount: 7, warningCount: 0,
};
export const NON_WIZARD = { title: "x", crewCount: 6, roomCount: 7, warningCount: 0 };

export async function seedAudit(opts: {
  showId: string;
  driveFileId: string;
  summary: Record<string, unknown>;
  stagedModifiedTime: string;
  /** sync_audit.applied_at = now() - this interval (default '0 seconds'). */
  appliedAtAgo?: string;
}): Promise<void> {
  await sql.unsafe(
    `insert into public.sync_audit
       (show_id, drive_file_id, applied_at, applied_by, staged_id,
        triggered_review_items, reviewer_choices, derived_side_effects,
        parse_result_summary, staged_modified_time)
     values ($1::uuid, $2, now() - $3::interval, 'remediation-test@example.com',
             gen_random_uuid(), '[]'::jsonb, '[]'::jsonb, '{}'::jsonb,
             $4::jsonb, $5::timestamptz)`,
    [
      opts.showId,
      opts.driveFileId,
      opts.appliedAtAgo ?? "0 seconds",
      JSON.stringify(opts.summary),
      opts.stagedModifiedTime,
    ],
  );
}

export async function readWatermark(showId: string): Promise<string | null> {
  const rows = await sql<{ last_seen_modified_time: Date | null }[]>`
    select last_seen_modified_time from public.shows where id = ${showId}`;
  return rows[0]!.last_seen_modified_time?.toISOString() ?? null;
}

export async function setWatermark(showId: string, ts: string | null): Promise<void> {
  await sql`update public.shows set last_seen_modified_time = ${ts} where id = ${showId}`;
}
```

- [ ] **2. Write the failing regression suite** — `tests/db/onboarding-fixups-remediation.test.ts`. Every test names the concrete failure mode it catches (anti-tautology rule). Fixed fixture instants: `T1 = '2026-06-01T10:00:00.000Z'`, `T2 = '2026-06-01T12:00:00.000Z'`, `T3 = '2026-06-01T14:00:00.000Z'`. ⚠️ The pass markers are GLOBAL state shared across tests — every windowing-sensitive test calls `resetPassMarkers()` first and constructs its own prior passes with `seedPassMarker(...)`; never rely on a marker left by a sibling test.

```ts
import { beforeAll, describe, expect, it } from "vitest";
import {
  sql, newConn, runRemediationPass, resetPassMarkers, seedPassMarker,
  seedShow, seedCrew, seedAudit, readWatermark, setWatermark,
  BROKEN_FIRST_SEEN, BROKEN_CAS, F1_CAS, NON_WIZARD,
  PURGED_SESSION_ID, MARKER_KEY, assertLocalDbUrl,
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
    await seedAudit({ showId: damaged.id, driveFileId: damaged.driveFileId, summary: BROKEN_FIRST_SEEN, stagedModifiedTime: T2 });
    const healthy = await seedShow({ watermark: T2 });
    await seedCrew(healthy.id);
    await seedAudit({ showId: healthy.id, driveFileId: healthy.driveFileId, summary: BROKEN_FIRST_SEEN, stagedModifiedTime: T2 });
    const resynced = await seedShow({ watermark: T3 }); // watermark advanced PAST the wizard audit
    await seedAudit({ showId: resynced.id, driveFileId: resynced.driveFileId, summary: BROKEN_FIRST_SEEN, stagedModifiedTime: T2 });

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
    await seedAudit({ showId: s.id, driveFileId: s.driveFileId, summary: BROKEN_FIRST_SEEN, stagedModifiedTime: T2, appliedAtAgo: "10 minutes" });
    // Non-wizard audit, LATER applied_at, but staged BELOW the watermark (probe/recovery write).
    await seedAudit({ showId: s.id, driveFileId: s.driveFileId, summary: NON_WIZARD, stagedModifiedTime: T1 });

    await runRemediationPass();
    expect(await readWatermark(s.id)).toBeNull();
  });

  it("R19-2: a genuinely zero-crew wizard show resets at most once (Arm A windowing)", async () => {
    // Failure mode: without the per-pass window, the old wizard audit re-qualifies on
    // EVERY re-run (backfill restores the same modified time with still-zero crew) →
    // infinite reset/re-sync loop for genuinely crew-less sheets.
    await resetPassMarkers();
    const s = await seedShow({ watermark: T2 });
    await seedAudit({ showId: s.id, driveFileId: s.driveFileId, summary: BROKEN_FIRST_SEEN, stagedModifiedTime: T2, appliedAtAgo: "2 hours" });

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
    await seedAudit({ showId: s.id, driveFileId: s.driveFileId, summary: BROKEN_CAS, stagedModifiedTime: T2 });

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
    await seedAudit({ showId: oldDamage.id, driveFileId: oldDamage.driveFileId, summary: BROKEN_CAS, stagedModifiedTime: T2, appliedAtAgo: "90 days" });

    const healed = await seedShow({ watermark: T2 });
    await seedCrew(healed.id);
    await seedAudit({ showId: healed.id, driveFileId: healed.driveFileId, summary: BROKEN_CAS, stagedModifiedTime: T2, appliedAtAgo: "1 day" });
    await seedAudit({ showId: healed.id, driveFileId: healed.driveFileId, summary: F1_CAS, stagedModifiedTime: T3 }); // latest writer = fixed F1

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
    await seedAudit({ showId: s.id, driveFileId: s.driveFileId, summary: BROKEN_CAS, stagedModifiedTime: T2, appliedAtAgo: "2 hours" });

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
    await seedAudit({ showId: s.id, driveFileId: s.driveFileId, summary: BROKEN_CAS, stagedModifiedTime: T2 }); // applied_at = now() > pass 1

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
    await seedAudit({ showId: s.id, driveFileId: s.driveFileId, summary: BROKEN_CAS, stagedModifiedTime: T2, appliedAtAgo: "45 minutes" });

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
    await seedAudit({ showId: s.id, driveFileId: s.driveFileId, summary: BROKEN_FIRST_SEEN, stagedModifiedTime: T2 });

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
    // watermark resets + the exact-ID purge of the 18 real validation sessions
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
    await seedAudit({ showId: s.id, driveFileId: s.driveFileId, summary: BROKEN_FIRST_SEEN, stagedModifiedTime: T2 });
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
      const r = await sql.unsafe(
        `select count(*)::int as n from public.${table} where wizard_session_id = $1::uuid`,
        [sid],
      );
      return (r[0] as { n: number }).n;
    };
    for (const table of [
      "wizard_finalize_checkpoints", "shows_pending_changes", "onboarding_scan_manifest",
      "pending_syncs", "pending_ingestions", "deferred_ingestions",
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
      "wizard_finalize_checkpoints", "shows_pending_changes", "onboarding_scan_manifest",
      "pending_syncs", "pending_ingestions", "deferred_ingestions",
    ]) {
      await sql.unsafe(`delete from public.${table} where wizard_session_id = $1::uuid`, [keepSession]);
    }
    await sql`delete from public.pending_ingestions where drive_file_id = ${dfP} and wizard_session_id is null`;
  });
});
```

- [ ] **3. Run it — fails** — prerequisite: local Supabase running with all committed migrations applied (`supabase db reset` if unsure). The suite needs NO env vars (the helper defaults to the local 54322 URL and ignores `TEST_DATABASE_URL`/`DATABASE_URL` entirely — do NOT export `LOCAL_TEST_DATABASE_URL` to anything non-local; the guard refuses it). Then:

```bash
pnpm vitest run tests/db/onboarding-fixups-remediation.test.ts
```

Expected: `beforeAll` throws `ENOENT ... 20260611000001_onboarding_fixups_remediation.sql` (the migration file does not exist yet) — every DB test fails; the pure local-host guard test already passes (it needs neither the migration nor a connection). This is the required negative regression for the file as a whole.

- [ ] **4. Minimal implementation — write the migration** — `supabase/migrations/20260611000001_onboarding_fixups_remediation.sql`. Sections 1–2 are the spec §4 block **VERBATIM** (spec lines 104–177 — copy, don't retype). Sections 3–4 are plan-level additions (lockdown + F4 purge) explicitly sanctioned by spec §4 ("marker table … IS a schema change") and §6 ("one-time purge … rides the F2 migration"):

```sql
-- M-onboarding-fixups F2 — windowed watermark reset for wizard-damaged shows
-- + F4 one-time purge of the 18 synthetic validation wizard sessions.
--
-- Spec: docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-10-onboarding-fixups-design.md §4, §6.
-- Idiom precedent: supabase/migrations/20260608000004_retire_live_pending_syncs.sql
-- (DO-block + per-show pg_advisory_xact_lock; DO block ≠ create function, so the
-- advisoryLockRpcDeadlock meta-test's create-function grep is intentionally not extended).
-- Re-runnable BY DESIGN: each execution records a pass row; Arm A/B window on the
-- previous pass (minus a 1-hour applied_at margin — R18-2). Apply AFTER F1 deploys.

-- ── 1+2. Spec §4 SQL — VERBATIM (marker table + windowed two-arm DO block) ──────

create table if not exists public.data_migration_markers (
  key text not null,
  executed_at timestamptz not null default now(),
  primary key (key, executed_at)
);

do $$
declare
  r record;
  prev_pass timestamptz;
begin
  -- R15/R16: per-pass WINDOWING, not a global one-shot. Each execution records a pass row.
  -- Arm B on a re-run considers only broken-shape audits NEWER than the previous pass:
  --   * old broken audits (pre previous pass) are excluded -> a cron-healed show is never
  --     re-damaged even though the heal writes no sync_audit row (R15);
  --   * broken-writer damage written AFTER a pass (migration-applied-before-code-deployed
  --     skew) is still eligible on the NEXT pass -> never permanently masked (R16).
  select max(executed_at) into prev_pass
    from public.data_migration_markers
   where key = 'onboarding_fixups_watermark_reset';
  insert into public.data_migration_markers (key) values ('onboarding_fixups_watermark_reset');

  for r in
    select s.id, s.drive_file_id
      from public.shows s
     where s.last_seen_modified_time is not null
       and (
         -- Arm A (first-seen damage): zero children, wizard was last content writer.
         (not exists (select 1 from public.crew_members cm where cm.show_id = s.id)
          and exists (select 1 from public.sync_audit sa
                       where sa.show_id = s.id
                         and sa.parse_result_summary->>'source' in ('onboarding_finalize', 'onboarding_finalize_cas')
                         and sa.staged_modified_time >= s.last_seen_modified_time
                         and (prev_pass is null or sa.applied_at > prev_pass - interval '1 hour')))
         or
         -- Arm B (existing-show damage): the LATEST at-or-after-watermark audit is a
         -- broken-shape CAS apply (stale children despite advanced watermark).
         (select not (sa.parse_result_summary ? 'crewCount')
                 and sa.parse_result_summary->>'source' = 'onboarding_finalize_cas'
                 and (prev_pass is null or sa.applied_at > prev_pass - interval '1 hour')
            from public.sync_audit sa
           where sa.show_id = s.id
             and sa.staged_modified_time >= s.last_seen_modified_time
           order by sa.staged_modified_time desc, sa.applied_at desc, sa.id desc
           limit 1)
       )
     order by s.drive_file_id   -- deterministic lock order (deadlock prevention)
  loop
    perform pg_advisory_xact_lock(hashtext('show:' || r.drive_file_id));
    -- R12 finding 2: re-check full eligibility UNDER the lock — a concurrent sync may
    -- have healed the show (children + fresh watermark) between SELECT and lock-acquire.
    update public.shows s
       set last_seen_modified_time = null
     where s.id = r.id
       and s.last_seen_modified_time is not null
       and (
         (not exists (select 1 from public.crew_members cm where cm.show_id = s.id)
          and exists (select 1 from public.sync_audit sa
                       where sa.show_id = s.id
                         and sa.parse_result_summary->>'source' in ('onboarding_finalize', 'onboarding_finalize_cas')
                         and sa.staged_modified_time >= s.last_seen_modified_time
                         and (prev_pass is null or sa.applied_at > prev_pass - interval '1 hour')))
         or
         (select not (sa.parse_result_summary ? 'crewCount')
                 and sa.parse_result_summary->>'source' = 'onboarding_finalize_cas'
                 and (prev_pass is null or sa.applied_at > prev_pass - interval '1 hour')
            from public.sync_audit sa
           where sa.show_id = s.id
             and sa.staged_modified_time >= s.last_seen_modified_time
           order by sa.staged_modified_time desc, sa.applied_at desc, sa.id desc
           limit 1)
       );
  end loop;
end $$;

-- ── 3. Marker-table lockdown (plan addition; not in the spec block) ─────────────
-- Supabase default privileges would expose the new table to PostgREST DML; an
-- authenticated INSERT of a fake pass row could mask Arm B damage. Internal-only:
-- RLS on with NO policies + REVOKE (BL-ADMIN-POSTGREST-DML-LOCKDOWN posture).
alter table public.data_migration_markers enable row level security;
revoke all on table public.data_migration_markers from anon, authenticated;
-- plan R20-1: the Layer-4 reconciliation in tests/db/postgrest-dml-lockdown.test.ts requires a
-- registry row for every REVOKEd live table, and Layer-1 asserts service_role keeps full access.
grant all privileges on table public.data_migration_markers to service_role;

-- R52-1: same locked-set deletion contract as the F4 reap — drive-id-bearing DELETEs carry
-- `and drive_file_id = any(<locked array>)` (the array captured at lock time inside the DO block),
-- and a post-delete residue check re-selects each session's drive-id-bearing tables: any row outside
-- the locked set → RAISE EXCEPTION (aborting the whole migration transaction — safe: marker row rolls
-- back too, re-run is clean). OPERATIONAL note: the surgical validation apply for THIS migration runs
-- in a no-writer window (cron paused or off-hours; PostgREST DML on these tables is still open until
-- Task 4.7's lockdown lands).
-- ── 4. F4 one-time purge — EXACT 18 synthetic validation wizard sessions ────────
-- Spec §6 final bullet: keyed to the exact ids captured from the validation DB
-- (Task 2.1, 2026-06-11; checkpoint-in_progress set ≡ shows_pending_changes set).
-- A drive_file_id prefix boundary was rejected (R23 finding 2): Drive ids are
-- opaque external identifiers. No-op in any environment where the ids don't exist.
-- Lock order mirrors cleanupAbandonedFinalize (sessionLifecycle.ts:329→374):
-- finalize:<session> locks first (sorted), then show:<drive_file_id> locks (sorted).
do $$
declare
  locked_drive_file_ids text[];
  dfid text;
  synthetic_ids constant uuid[] := array[
    '02304ebb-1d29-4a7e-b042-86b893247240',
    '023ddce3-9d9c-428a-b3bc-59501b73e77b',
    '2123a4d7-2992-4345-bb98-6882b09951e4',
    '2265e894-3d42-4c93-9a9a-fce6dda97fa1',
    '24b619a2-b2f7-4432-a114-640e05833ee5',
    '35fd4ba3-4fd6-4c27-9b74-8284ca7f7c70',
    '417b1867-8d7e-49a2-bb31-0abb413355c5',
    '43d95a73-eaf4-4a91-b97a-3e3bddfe5c23',
    '515d2e64-23d9-483f-9a05-ace5030af67d',
    '943737a2-caa7-4771-ad66-62fde4f8e888',
    'ad5b5459-0f2d-46b7-a185-f64b681d4286',
    'b864845d-12b6-40ca-8750-a1109984ee5a',
    'bfd41ae1-4c0a-42e2-8d75-a6489690071c',
    'd1d15523-b62d-403d-9ee0-508a338a8970',
    'd5e32eaf-9c87-4625-96ca-7735e245998c',
    'd6975cf2-6062-4fc7-a92f-e61eab9be538',
    'da638b4b-7079-45fb-b6af-635a3f67d59d',
    'ffda8263-241c-427e-8c04-51dba595ea83'
  ];
  active_sid uuid;
  sid uuid;
  r record;
begin
  -- Defense-in-depth: never purge the ACTIVE session even if an id collided.
  select pending_wizard_session_id into active_sid
    from public.app_settings where id = 'default';

  foreach sid in array synthetic_ids loop
    continue when active_sid is not null and sid = active_sid;
    perform pg_advisory_xact_lock(hashtext('finalize:' || sid::text));
  end loop;

  -- R53-1: capture the locked drive ids into an array; deletes are bound to EXACTLY this set.
  select coalesce(array_agg(drive_file_id order by drive_file_id), '{}') into locked_drive_file_ids from (
      select drive_file_id from public.shows_pending_changes      where wizard_session_id = any (synthetic_ids)
      union
      select drive_file_id from public.onboarding_scan_manifest   where wizard_session_id = any (synthetic_ids)
      union
      select drive_file_id from public.pending_syncs              where wizard_session_id = any (synthetic_ids)
      union
      select drive_file_id from public.pending_ingestions         where wizard_session_id = any (synthetic_ids)
      union
      select drive_file_id from public.deferred_ingestions        where wizard_session_id = any (synthetic_ids)
    ) ids;
  foreach dfid in array locked_drive_file_ids loop
    perform pg_advisory_xact_lock(hashtext('show:' || dfid));
  end loop;

  -- R53-1: session-scoped AND locked-set-bound deletes (live-partition rows wizard_session_id IS NULL
  -- untouchable by construction; drive-id-bearing tables additionally bound to locked_drive_file_ids).
  delete from public.pending_syncs              where wizard_session_id = any (synthetic_ids) and drive_file_id = any (locked_drive_file_ids) and (active_sid is null or wizard_session_id <> active_sid);
  delete from public.pending_ingestions         where wizard_session_id = any (synthetic_ids) and drive_file_id = any (locked_drive_file_ids) and (active_sid is null or wizard_session_id <> active_sid);
  delete from public.deferred_ingestions        where wizard_session_id = any (synthetic_ids) and drive_file_id = any (locked_drive_file_ids) and (active_sid is null or wizard_session_id <> active_sid);
  delete from public.onboarding_scan_manifest   where wizard_session_id = any (synthetic_ids) and drive_file_id = any (locked_drive_file_ids) and (active_sid is null or wizard_session_id <> active_sid);
  delete from public.shows_pending_changes      where wizard_session_id = any (synthetic_ids) and drive_file_id = any (locked_drive_file_ids) and (active_sid is null or wizard_session_id <> active_sid);
  delete from public.wizard_finalize_checkpoints where wizard_session_id = any (synthetic_ids) and (active_sid is null or wizard_session_id <> active_sid);  -- no drive id column

  -- R53-1: post-delete residue check — a late row (stale tab / PostgREST writer pre-Task-4.7) outside
  -- the locked set aborts the WHOLE migration transaction (marker row rolls back; re-run is clean).
  if exists (
    select 1 from public.pending_syncs       where wizard_session_id = any (synthetic_ids)
    union all
    select 1 from public.pending_ingestions  where wizard_session_id = any (synthetic_ids)
    union all
    select 1 from public.deferred_ingestions where wizard_session_id = any (synthetic_ids)
    union all
    select 1 from public.onboarding_scan_manifest where wizard_session_id = any (synthetic_ids)
    union all
    select 1 from public.shows_pending_changes    where wizard_session_id = any (synthetic_ids)
  ) then
    raise exception 'onboarding_fixups purge: residue outside locked drive-id set — re-run the migration';
  end if;
end $$;
```

**Lockdown registry lockstep (plan R20-1, prose moved OUTSIDE the SQL fence per R21-1):** same commit as this migration, add a `RPC_GATED_TABLES` row for `data_migration_markers` in `tests/db/postgrest-dml-lockdown.test.ts` (`selectAnon`/`selectAuthenticated` false, minimal valid `postBody` e.g. `{ key: "lockdown-probe" }`). Add `pnpm vitest run tests/db/postgrest-dml-lockdown.test.ts` to this task's verification commands; the ON_ERROR_STOP expected output now includes `GRANT`. The phase header's earlier "lockdown N/A for this table" claim is REVERSED.


  Purge scope note: the purge deletes staging/debris tables ONLY — it never deletes `shows` rows (the `slug-*`/`sh-*` synthetic show debris is explicitly out of scope, spec §11), and the F4 interim-row provenance deletion (`created_show_id`) belongs to the session-scoped reap in the F4 phase, not this one-shot.

- [ ] **5. Run the suite — passes:**

```bash
pnpm vitest run tests/db/onboarding-fixups-remediation.test.ts
```

Expected: all 12 tests pass (3 Arm A, 4 Arm B, 1 race, 1 local-host guard, 2 idempotency/lockdown, 1 purge). The local-host guard test must appear in the run output — it is the structural defense that keeps this destructive suite off the validation project (validation access happens ONLY in Task 2.5's labeled close-out commands).

- [ ] **6. Negative-regression spot check (pin the windowing clause):** temporarily delete the two `and (prev_pass is null or sa.applied_at > prev_pass - interval '1 hour')` lines from the UPDATE's Arm B predicate, re-run — R15 must fail (`expect(not null)` receives null). Restore verbatim, re-run green. (This proves the test actually exercises the window rather than passing tautologically.)

- [ ] **7. Commit:**

```
feat(db): F2 remediation migration — windowed watermark reset + F4 synthetic-session purge
```

(Conventional-commit per AGENTS.md invariant 6; scope `db`. Includes migration + helper + test file in one task commit.)

---

## Task 2.3 — `ON_ERROR_STOP` local apply verification (spec §4, R24 finding 1; no commit)

The vitest harness swallows multi-statement semantics differences; the deploy path is psql. Verify the file applies cleanly AND idempotently through the real apply path before sign-off.

**Steps:**

- [ ] **1. Apply to the local all-migrations DB with ON_ERROR_STOP:**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260611000001_onboarding_fixups_remediation.sql
```

Expected output: `CREATE TABLE` (or no-op notice on re-apply), `DO`, `ALTER TABLE`, `REVOKE`, `DO` — exit code 0.

- [ ] **2. Apply a second time** (same command). Expected: identical success (apply-twice idempotency through psql, not just postgres.js).

- [ ] **3. Confirm marker rows accrued:** `psql ... -c "select count(*) from public.data_migration_markers where key = 'onboarding_fixups_watermark_reset';"` — count ≥ 2 and grows by exactly 1 per apply.

---

## Task 2.4 — Schema-manifest regen + commit (post-migration checklist step 2)

`data_migration_markers` IS a schema change (spec §4 opening line); the `validation-schema-parity` Layer-1 tripwire (`tests/db/validation-schema-parity.test.ts`, runs DB-free in `x-audits.yml`) reds on the next CI run if the committed manifest lags the migrations.

**Steps:**

- [ ] **1. Regen** (introspects the LOCAL all-migrations-applied DB — Task 2.3 just guaranteed that state):

```bash
pnpm gen:schema-manifest
```

- [ ] **2. Verify the diff** touches only `supabase/__generated__/schema-manifest.json` and adds the `data_migration_markers` table (key + executed_at columns).

- [ ] **3. Gate check:**

```bash
pnpm test:audit:validation-schema-parity
```

Expected: Layer 1 (manifest ↔ migrations) green; Layer 2 (vs `TEST_DATABASE_URL`) RED at this point — validation doesn't have the table yet. That red is expected and is cleared by Task 2.5; do not merge the PR before Task 2.5 runs.

- [ ] **4. Commit:**

```
chore(db): regen schema manifest for data_migration_markers
```

---

## Task 2.5 — Surgical validation apply + pgrst reload (CLOSE-OUT step, not CI)

> **The ONLY validation-DB WRITE access in this phase** (Task 2.1's id capture is read-only SELECTs). Every test task runs exclusively against local Supabase — the regression helper hard-refuses non-loopback hosts (Task 2.2 step 1, adversarial R9). The commands below are operator-run close-out steps, never part of any test run.

`supabase db push` is BLOCKED on the validation project `vzakgrxqwcalbmagufjh` (Phase-0 history divergence) — per AGENTS.md "Every migration must reach the validation project", each migration is applied surgically. This step runs at milestone close-out, AFTER Phase 1's code has deployed to validation (deployment-ordering note in the header) and BEFORE the PR merges (so the `validation-schema-parity` Layer-2 gate is green on the merge run).

**Steps:**

- [ ] **1. Apply surgically** (pooler URL in `.env.local` as `TEST_DATABASE_URL` — precedent: B3 email_deliveries apply):

```bash
set -a && source .env.local && set +a
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260611000001_onboarding_fixups_remediation.sql
psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';"
```

- [ ] **2. Verify the remediation fired on the six damaged shows** (spec §4 "Applies to the six validation shows"):

```bash
psql "$TEST_DATABASE_URL" -At -c "
  select count(*) from public.shows s
   where s.last_seen_modified_time is null
     and exists (select 1 from public.sync_audit sa
                  where sa.show_id = s.id
                    and sa.parse_result_summary->>'source' like 'onboarding_finalize%');"
```

Expected: ≥ 6 (the six wizard-onboarded shows watermark-nulled, queued for the next cron full pass).

- [ ] **3. Verify the F4 purge:**

```bash
psql "$TEST_DATABASE_URL" -At -c "select count(*) from public.wizard_finalize_checkpoints where status <> 'final_cas_done';"
psql "$TEST_DATABASE_URL" -At -c "select count(*) from public.shows_pending_changes;"
```

Expected: `0` and `0`.

- [ ] **4. Re-run the parity gate** — `pnpm test:audit:validation-schema-parity` — both layers green.

- [ ] **5. After the next cron pass**, spot-check the origin-incident show: `select count(*) from crew_members cm join shows s on s.id = cm.show_id where s.slug = '2025-10-aii-iii-consultants-roundtable';` — expected 6 (spec §0 origin incident: 6 crew / 7 rooms). Record the result in the milestone handoff doc §7. In production this migration is a verified no-op (no wizard-onboarded shows yet — spec §4).
