/**
 * tests/db/driveFileIdNonblank.db.test.ts
 *
 * Behavioral proof (local Postgres) that every census Drive-ID column's canonical nonblank
 * CHECK actually REJECTS blank writes — registry-enforced TOTAL coverage, not a sample
 * (spec docs/superpowers/specs/data-quality/2026-07-26-driveid-guard-cluster-design.md §3.4).
 *
 * The claim IS the execution: each generated probe CONSTRUCTS its insert from the claimed
 * tuple, and the rejection must cite the claimed constraint (driver fields
 * code/schema_name/table_name/constraint_name — measured, spec §2 item 5). The completeness
 * meta-test runs the live census through auditProbeRegistry, so a FUTURE constrained column
 * fails this suite by default until it gets a probe row or a reviewed exemption.
 *
 * Every mutating probe runs inside a transaction that is always rolled back, so the suite
 * leaves ZERO residue even while red.
 */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { assertLocalDbUrl } from "@/tests/db/_localDbUrl";
import { unreachableDbFailure } from "@/lib/driveIdCoverage/introspect";
import {
  auditProbeRegistry,
  censusInPinnedTx,
  type ProbeExemption,
  type ProbeRegistryRow,
} from "@/tests/db/_censusRunner";

const LOCAL_URL = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);

// All public columns named exactly `drive_file_id` that get a nonblank CHECK — the
// migration-anchored complement to the census-driven registry below (14 from 20260702120200;
// onboarding_rebuild_attempts added by 20260725000000).
const PUBLIC_NONBLANK_TABLES = [
  "shows",
  "pending_syncs",
  "pending_ingestions",
  "sync_audit",
  "deferred_ingestions",
  "onboarding_scan_manifest",
  "pending_snapshot_uploads",
  "revision_race_cooldowns",
  "shows_pending_changes",
  "show_change_log",
  "sync_holds",
  "agenda_extract_leases",
  "onboarding_rebuild_attempts",
  "sync_log",
  "app_events",
];

let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
let probeError: unknown = null;
let probe: ReturnType<typeof postgres> | null = null;
try {
  probe = postgres(LOCAL_URL, {
    max: 4,
    idle_timeout: 2,
    connect_timeout: 5,
    prepare: false,
  });
  await probe.unsafe("select 1", []);
  sql = probe;
  dbUp = true;
} catch (e) {
  probeError = e;
  if (probe) await probe.end().catch(() => {});
  sql = null;
  dbUp = false;
}

// FAIL, never skip, under CI: this suite now hosts the completeness guard, and a silent skip
// would leave `unit-suite` green while proving nothing (same posture as
// tests/db/driveIdCoverage.db.test.ts).
const ciFailure = unreachableDbFailure({
  dbUp,
  ci: process.env.CI,
  host: (() => {
    try {
      return new URL(LOCAL_URL).host;
    } catch {
      return "<unparseable>";
    }
  })(),
  error: probeError,
});
if (ciFailure) throw ciFailure;

afterAll(async () => {
  if (sql) await sql.end().catch(() => {});
});

/**
 * FK parent for the rows that need a public.shows anchor. Runs inside the SAME rolled-back
 * transaction as its probe. Fixed id, unique-safe generated values; public.shows.id carries a
 * default, so the explicit id is legal.
 */
const SHOW_SETUP = `insert into public.shows
    (id, drive_file_id, slug, title, client_label, template_version,
     published, last_seen_modified_time, last_sync_status)
  values ('11111111-1111-4111-8111-111111111111'::uuid,
          'dfidnb-parent-' || gen_random_uuid(), 'dfidnb-parent-slug-' || gen_random_uuid(),
          'Probe Parent', 'Acme Corp', 'v4', true, now(), 'ok')`;
const SHOW_FK = "'11111111-1111-4111-8111-111111111111'::uuid";

/**
 * The registry: every census tuple, its canonical constraint, and the sibling scaffolding a
 * legal insert needs. Sibling lists carry AT LEAST the NOT-NULL-no-default columns (the shows
 * rows keep their original hand-written extras for behavior parity). All 23 valid shapes were
 * executed against the live schema in one rolled-back transaction at plan time; the
 * deferred_ingestions row carries wizard_session_id for its deferred_by_scope_check.
 */
export const DRIVE_ID_PROBES: ProbeRegistryRow[] = [
  // ── the seven ported hand-written probes ──────────────────────────────────
  {
    schema: "public",
    table: "agenda_extract_leases",
    column: "drive_file_id",
    nullable: false,
    constraintName: "agenda_extract_leases_drive_file_id_nonblank",
    siblings: "wizard_session_id, owner, expires_at",
    siblingValues: "gen_random_uuid(), 'owner', now() + interval '5 minutes'",
  },
  {
    // Reuses the held-show insert shape from tests/onboarding/finalizeHeldCreation.db.test.ts.
    schema: "public",
    table: "shows",
    column: "drive_file_id",
    nullable: false,
    constraintName: "shows_drive_file_id_nonblank",
    siblings:
      "slug, title, client_label, template_version, published, last_seen_modified_time, last_sync_status",
    siblingValues: "'dfidnb-slug-' || gen_random_uuid(), 'T', 'Acme Corp', 'v4', true, now(), 'ok'",
  },
  {
    schema: "public",
    table: "app_events",
    column: "drive_file_id",
    nullable: true,
    constraintName: "app_events_drive_file_id_nonblank",
    siblings: "level, source, message",
    siblingValues: "'info', 'test.nonblank', 'msg'",
  },
  {
    schema: "public",
    table: "shows",
    column: "opening_reel_drive_file_id",
    nullable: true,
    constraintName: "shows_opening_reel_drive_file_id_nonblank",
    siblings:
      "drive_file_id, slug, title, client_label, template_version, published, last_seen_modified_time, last_sync_status",
    siblingValues:
      "'dfidnb-or-' || gen_random_uuid(), 'dfidnb-or-slug-' || gen_random_uuid(), 'T', 'Acme Corp', 'v4', true, now(), 'ok'",
  },
  {
    // id / batches_completed / status all carry defaults; wizard_session_id is the only
    // NOT NULL sibling without one.
    schema: "public",
    table: "wizard_finalize_checkpoints",
    column: "last_processed_drive_file_id",
    nullable: true,
    constraintName: "wizard_finalize_checkpoints_drive_file_id_nonblank",
    siblings: "wizard_session_id",
    siblingValues: "gen_random_uuid()",
  },
  {
    // This column is half of the composite PK, which does NOT protect it — a blank is a legal
    // distinct key value.
    schema: "public",
    table: "onboarding_rebuild_attempts",
    column: "drive_file_id",
    nullable: false,
    constraintName: "onboarding_rebuild_attempts_drive_file_id_nonblank",
    siblings: "wizard_session_id",
    siblingValues: "gen_random_uuid()",
  },
  {
    // The dev clone carries this column, so a public-only regression would leave it asymmetric.
    schema: "dev",
    table: "shows",
    column: "opening_reel_drive_file_id",
    nullable: true,
    constraintName: "shows_opening_reel_drive_file_id_nonblank",
    siblings:
      "drive_file_id, slug, title, client_label, template_version, published, last_seen_modified_time, last_sync_status",
    siblingValues:
      "'dfidnb-devor-' || gen_random_uuid(), 'dfidnb-devor-slug-' || gen_random_uuid(), 'T', 'Acme Corp', 'v4', true, now(), 'ok'",
  },
  // ── the sixteen columns that were declaration-covered only ────────────────
  {
    schema: "public",
    table: "pending_syncs",
    column: "drive_file_id",
    nullable: false,
    constraintName: "pending_syncs_drive_file_id_nonblank",
    siblings: "parse_result, source_kind, staged_modified_time, warning_summary",
    siblingValues: "'{}'::jsonb, 'manual', now(), ''",
  },
  {
    schema: "public",
    table: "pending_ingestions",
    column: "drive_file_id",
    nullable: false,
    constraintName: "pending_ingestions_drive_file_id_nonblank",
    siblings: "drive_file_name, last_error_code, last_error_message",
    siblingValues: "'f.xlsx', 'CODE', 'msg'",
  },
  {
    schema: "public",
    table: "sync_audit",
    column: "drive_file_id",
    nullable: false,
    constraintName: "sync_audit_drive_file_id_nonblank",
    siblings:
      "applied_by, derived_side_effects, parse_result_summary, reviewer_choices, staged_id, staged_modified_time, triggered_review_items",
    siblingValues:
      "'tester', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, gen_random_uuid(), now(), '[]'::jsonb",
  },
  {
    // deferred_by_scope_check requires wizard_session_id OR deferred_by_email.
    schema: "public",
    table: "deferred_ingestions",
    column: "drive_file_id",
    nullable: false,
    constraintName: "deferred_ingestions_drive_file_id_nonblank",
    siblings: "deferred_kind, wizard_session_id",
    siblingValues: "'permanent_ignore', gen_random_uuid()",
  },
  {
    schema: "public",
    table: "onboarding_scan_manifest",
    column: "drive_file_id",
    nullable: false,
    constraintName: "onboarding_scan_manifest_drive_file_id_nonblank",
    siblings: "folder_id, mime_type, name, status, wizard_session_id",
    siblingValues:
      "'folder', 'application/vnd.google-apps.spreadsheet', 'n', 'staged', gen_random_uuid()",
  },
  {
    schema: "public",
    table: "pending_snapshot_uploads",
    column: "drive_file_id",
    nullable: false,
    constraintName: "pending_snapshot_uploads_drive_file_id_nonblank",
    siblings: "asset_count, show_id, snapshot_revision_id, temp_prefix",
    siblingValues: `0, ${SHOW_FK}, gen_random_uuid(), 'tmp/'`,
    setup: SHOW_SETUP,
  },
  {
    schema: "public",
    table: "revision_race_cooldowns",
    column: "drive_file_id",
    nullable: false,
    constraintName: "revision_race_cooldowns_drive_file_id_nonblank",
    siblings: "raced_head_revision_id",
    siblingValues: "'rev1'",
  },
  {
    schema: "public",
    table: "shows_pending_changes",
    column: "drive_file_id",
    nullable: false,
    constraintName: "shows_pending_changes_drive_file_id_nonblank",
    siblings: "applied_at_intent, applied_by_email, payload, show_id, wizard_session_id",
    siblingValues: `now(), 'probe@example.com', '{}'::jsonb, ${SHOW_FK}, gen_random_uuid()`,
    setup: SHOW_SETUP,
  },
  {
    // change_kind carries no CHECK; source/status must satisfy their _chk enums.
    schema: "public",
    table: "show_change_log",
    column: "drive_file_id",
    nullable: false,
    constraintName: "show_change_log_drive_file_id_nonblank",
    siblings: "change_kind, show_id, source, status, summary",
    siblingValues: `'crew_email', ${SHOW_FK}, 'auto_apply', 'applied', 's'`,
    setup: SHOW_SETUP,
  },
  {
    // kind_shape_chk: undo_override requires proposed_value IS NULL — satisfied by omission.
    schema: "public",
    table: "sync_holds",
    column: "drive_file_id",
    nullable: false,
    constraintName: "sync_holds_drive_file_id_nonblank",
    siblings: "created_by, domain, entity_key, held_value, kind, show_id",
    siblingValues: `'tester', 'crew_email', 'k', '{}'::jsonb, 'undo_override', ${SHOW_FK}`,
    setup: SHOW_SETUP,
  },
  {
    schema: "public",
    table: "sync_log",
    column: "drive_file_id",
    nullable: true,
    constraintName: "sync_log_drive_file_id_nonblank",
    siblings: "status",
    siblingValues: "'ok'",
  },
  {
    schema: "dev",
    table: "pending_ingestions",
    column: "drive_file_id",
    nullable: false,
    constraintName: "pending_ingestions_drive_file_id_nonblank",
    siblings: "drive_file_name, last_error_code, last_error_message",
    siblingValues: "'f.xlsx', 'CODE', 'msg'",
  },
  {
    schema: "dev",
    table: "pending_syncs",
    column: "drive_file_id",
    nullable: false,
    constraintName: "pending_syncs_drive_file_id_nonblank",
    siblings: "parse_result, source_kind, staged_modified_time, warning_summary",
    siblingValues: "'{}'::jsonb, 'manual', now(), ''",
  },
  {
    // dev.shows is a narrower clone: published/last_seen/last_sync carry defaults there.
    schema: "dev",
    table: "shows",
    column: "drive_file_id",
    nullable: false,
    constraintName: "shows_drive_file_id_nonblank",
    siblings: "slug, title, client_label, template_version",
    siblingValues: "'dfidnb-dev-slug-' || gen_random_uuid(), 'T', 'Acme Corp', 'v4'",
  },
  {
    schema: "dev",
    table: "sync_audit",
    column: "drive_file_id",
    nullable: false,
    constraintName: "sync_audit_drive_file_id_nonblank",
    siblings:
      "applied_by, derived_side_effects, parse_result_summary, reviewer_choices, staged_id, staged_modified_time, triggered_review_items",
    siblingValues:
      "'tester', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, gen_random_uuid(), now(), '[]'::jsonb",
  },
  {
    schema: "dev",
    table: "sync_log",
    column: "drive_file_id",
    nullable: true,
    constraintName: "sync_log_drive_file_id_nonblank",
    siblings: "status",
    siblingValues: "'ok'",
  },
];

/** Deliberate probe exceptions. Ships EMPTY; every future row lands in a reviewable diff. */
export const PROBE_EXEMPTIONS: ProbeExemption[] = [];

const BLANKS = ["", "   ", "\t"];

/** The constructed insert — the probed column and table come from the CLAIM (spec §3.4). */
function probeInsert(row: ProbeRegistryRow): string {
  return `insert into ${row.schema}.${row.table} (${row.siblings}, ${row.column})
    values (${row.siblingValues}, $1)`;
}

type PgError = {
  code?: string;
  message?: string;
  schema_name?: string;
  table_name?: string;
  constraint_name?: string;
};

/** Run setup + insert in ONE always-rolled-back tx; return the caught PG error, if any. */
async function runProbe(row: ProbeRegistryRow, value: string | null): Promise<PgError | null> {
  let caught: PgError | null = null;
  try {
    await sql!.begin(async (tx) => {
      if (row.setup) await tx.unsafe(row.setup, []);
      await tx.unsafe(probeInsert(row), [value]);
      throw new Error("__rollback__");
    });
  } catch (e) {
    const err = e as PgError;
    if (err?.message === "__rollback__") return null;
    caught = err;
  }
  return caught;
}

describe("drive_file_id nonblank CHECK — registry-enforced behavioral proof", () => {
  for (const row of DRIVE_ID_PROBES) {
    const label = `${row.schema}.${row.table}.${row.column}`;
    test.skipIf(!dbUp)(`${label} rejects blanks citing ${row.constraintName}`, async () => {
      for (const blank of BLANKS) {
        const err = await runProbe(row, blank);
        expect(err, `${label}: blank ${JSON.stringify(blank)} must be rejected`).not.toBeNull();
        // Bound to the CLAIMED constraint: a 23514 from some other CHECK cannot pass.
        expect(err!.code).toBe("23514");
        expect(err!.constraint_name).toBe(row.constraintName);
        expect(err!.schema_name).toBe(row.schema);
        expect(err!.table_name).toBe(row.table);
      }
    });

    test.skipIf(!dbUp)(
      `${label} accepts a valid id${row.nullable ? " and NULL" : ""}`,
      async () => {
        expect(await runProbe(row, `dfidnb-${randomUUID()}`)).toBeNull();
        if (row.nullable) expect(await runProbe(row, null)).toBeNull();
      },
    );
  }

  test.skipIf(!dbUp)(
    "COMPLETENESS — every live census tuple is probed or exempted, and every claim is live-true",
    async () => {
      // The registry-enforced-total guard (spec §3.4): a NEW constrained column fails here by
      // default; so does a stale/mislabeled row or a blinding exemption overlap.
      const { columns, constraints } = await censusInPinnedTx(sql!);
      const findings = auditProbeRegistry({
        censusColumns: columns,
        censusConstraints: constraints,
        probes: DRIVE_ID_PROBES,
        exemptions: PROBE_EXEMPTIONS,
      });
      expect(
        findings,
        `probe-registry findings:\n${findings.map((f) => JSON.stringify(f)).join("\n")}`,
      ).toEqual([]);
    },
  );

  test.skipIf(!dbUp)("all public *_drive_file_id_nonblank CHECK constraints exist", async () => {
    const rows = await sql!.unsafe(
      `select conname from pg_constraint
          where contype = 'c'
            and connamespace = 'public'::regnamespace
            and conname like '%_drive_file_id_nonblank'`,
      [],
    );
    const found = new Set((rows as unknown as { conname: string }[]).map((r) => r.conname));
    for (const t of PUBLIC_NONBLANK_TABLES) {
      expect(found.has(`${t}_drive_file_id_nonblank`), `missing constraint for ${t}`).toBe(true);
    }
    expect(PUBLIC_NONBLANK_TABLES.length).toBe(15);
  });
});
