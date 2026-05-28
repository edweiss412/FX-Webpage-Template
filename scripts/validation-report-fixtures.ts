// scripts/validation-report-fixtures.ts — M12 Phase 0.E Task 0.E.1.
//
// Band F report-pipeline fault-injection harness. Materializes the 9 deep
// report outcomes (per master spec §13.2.3 + §9.1.2, R31 commit 65 rewrite,
// R43 commit 81 F40 split) directly via service-role PostgREST writes against
// the production producer tables (reports, report_rate_limits, admin_alerts).
//
// Per-outcome producer-state map (canonical R31 map in plan
// 04-phase0-tooling-report.md Task 0.E.1):
//   success-admin       → reports (reported_by_kind='admin', github_issue_url, lease released)
//   success-crew        → reports (reported_by_kind='crew', github_issue_url, lease released)
//   in-flight           → reports (live lease: processing_lease_until=+90s, lease_holder set)
//   rate-limit-admin    → report_rate_limits (canonical admin email identity, count=11)
//   rate-limit-crew     → report_rate_limits (raw fixture crew_member_id UUID, count=4)
//   lookup-inconclusive → reports (post-lease-expired) + admin_alerts (code per --alert-code)
//   lease-expired       → reports (processing_lease_until=-60s, github_issue_url NULL)
//   horizon-expired     → reports (created_at=-25h — live path can't reach this state)
//   orphaned-lost-lease → admin_alerts (REPORT_ORPHANED_LOST_LEASE, full context shape)
//
// Producer tables reports / report_rate_limits / admin_alerts are NOT in the
// RPC_GATED_TABLES registry (no table-level REVOKE) — service-role writes are
// the normal production path (lib/reports/* writes via service-role). No
// advisory lock required (none of these tables are in the per-show lock set
// per plan-wide invariant 2). Real-identity outcomes (rate-limit-{admin,crew})
// use snapshot+restore (R35 F34 / R39 F36) so prod rate-limit state in OTHER
// hour buckets is never disturbed.
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { canonicalize } from "@/lib/email/canonicalize";
import { loadValidationEnv } from "./lib/validation-env";
import {
  assertProdEquivalentTarget,
  assertSupabaseTargetMatchesProjectRef,
} from "./lib/validation-target";
import { R_COMBOS, SW_COMBOS } from "./lib/validation-fixtures";

const ALL_COMBOS: readonly string[] = [...R_COMBOS, ...SW_COMBOS];

const OUTCOMES = [
  "success-admin",
  "success-crew",
  "in-flight",
  "rate-limit-admin",
  "rate-limit-crew",
  "lookup-inconclusive",
  "lease-expired",
  "horizon-expired",
  "orphaned-lost-lease",
] as const;
type Outcome = (typeof OUTCOMES)[number];

const RATE_LIMIT_OUTCOMES = new Set<Outcome>([
  "rate-limit-admin",
  "rate-limit-crew",
]);

// R43 commit 81 F40 — --alert-code selector → resolved admin_alerts.code,
// mirroring lookupAlertCode at lib/reports/submit.ts:202-208.
const ALERT_CODE_VARIANTS = {
  "bot-login-missing": "GITHUB_BOT_LOGIN_MISSING",
  "duplicate-live-matches": "REPORT_DUPLICATE_LIVE_MATCHES",
  "open-orphan-label": "REPORT_OPEN_ORPHAN_LABEL",
  inconclusive: "REPORT_LOOKUP_INCONCLUSIVE",
} as const;
type AlertCodeVariant = keyof typeof ALERT_CODE_VARIANTS;
const ALERT_CODE_KEYS = Object.keys(ALERT_CODE_VARIANTS) as AlertCodeVariant[];
const DEFAULT_ALERT_CODE: AlertCodeVariant = "bot-login-missing";

const ADMIN_QUOTA_SEED_COUNT = 11; // admin limit 10 (rateLimit.ts:53) → +1 denies
const CREW_QUOTA_SEED_COUNT = 4; // crew limit 3 (rateLimit.ts:54) → +1 denies

const SNAPSHOT_DIR = ".validation-state";
const SNAPSHOT_FILE: Record<"admin" | "crew", string> = {
  admin: join(SNAPSHOT_DIR, "rate-limit-admin-snapshot.json"),
  crew: join(SNAPSHOT_DIR, "rate-limit-crew-snapshot.json"),
};

const USAGE = `Usage: pnpm validation:report-fixtures --outcome <outcome> [options]
       pnpm validation:report-fixtures --cleanup [--include-admin-email <email>] [--include-crew-id <uuid>]

Band F report-pipeline fault-injection harness (spec §9.1.2). Materializes a
deep report outcome's producer-state directly via service-role writes so the
solo dev can drive the rendered ReportModal / AlertBanner surface in the
prod-equivalent validation Supabase project.

Outcomes (--outcome):
  success-admin         reports row, admin shape, github_issue_url set
  success-crew          reports row, crew shape, github_issue_url set
  in-flight             reports row with a live 90s lease (next POST → 409)
  rate-limit-admin      report_rate_limits seed at canonical admin email,
                        count=11 (next admin POST → REPORT_RATE_LIMITED_ADMIN)
  rate-limit-crew       report_rate_limits seed at fixture crew_member_id,
                        count=4 (next crew POST → REPORT_RATE_LIMITED_CREW);
                        REQUIRES --combo <combo>
  lookup-inconclusive   admin_alerts + reports two-write; code chosen by
                        --alert-code (default ${DEFAULT_ALERT_CODE})
  lease-expired         reports row with an expired lease (no direct UI)
  horizon-expired       reports row created_at -25h (live path can't reach it)
  orphaned-lost-lease   admin_alerts REPORT_ORPHANED_LOST_LEASE row

Options:
  --combo <combo>             Fixture combo selector. REQUIRED for
                              rate-limit-crew (resolves crew_member_id via the
                              alias_map alias_5a_lead). OPTIONAL for the other 8
                              outcomes (picks which fixture show reports/
                              admin_alerts rows attach to; default R1). IGNORED
                              for rate-limit-admin (no show needed).
  --alert-code <variant>      lookup-inconclusive variant selector:
                              bot-login-missing | duplicate-live-matches |
                              open-orphan-label | inconclusive
                              (default ${DEFAULT_ALERT_CODE}). IGNORED for the
                              other 8 outcomes. bot-login-missing mirrors
                              production's dual-write (a GLOBAL
                              GITHUB_BOT_LOGIN_MISSING alert + a show-scoped
                              REPORT_LOOKUP_INCONCLUSIVE alert); the other 3
                              variants write a single show-scoped alert.
  --force-overwrite-snapshot  Valid ONLY with --outcome rate-limit-{admin,crew}.
                              Re-snapshots the CURRENTLY-seeded count as the new
                              restore target (loses the original pre-seed
                              prior_count). Crash-recovery escape hatch.
  --cleanup                   Tear down all m12-fixture-tagged rows (admin_alerts
                              → report_rate_limits → reports). Conservative by
                              default: does NOT touch the real canonical-admin
                              identity or real crew-UUID rate-limit rows.
  --include-admin-email <e>   Cleanup extension: restore the rate-limit-admin
                              recorded hour_bucket from its file-backed snapshot
                              (UPDATE to prior count, or DELETE the exact bucket
                              if no prior row existed). Refuses without a
                              snapshot unless --force-cleanup-without-snapshot.
  --include-crew-id <uuid>    Cleanup extension: same restore for rate-limit-crew.
  --force-cleanup-without-snapshot
                              Emergency cleanup with no snapshot file. REQUIRES
                              --hour-bucket <ISO> and --kind {admin,crew}. DELETEs
                              only the exact named bucket (never cross-hour).
  --hour-bucket <ISO>         Exact hour_bucket (ISO timestamptz) for the force
                              cleanup escape hatch.
  --kind <admin|crew>         Quota kind for the force cleanup escape hatch.
  --allow-local-override      Permit running against http://localhost / 127.0.0.1.
  --help                      Print this message and exit 0.

Snapshot persistence (rate-limit-{admin,crew}):
  File-backed at ${SNAPSHOT_FILE.admin} /
  ${SNAPSHOT_FILE.crew} (both gitignored under .validation-state/). The harness
  refuses to seed if a snapshot file already exists (use --force-overwrite-snapshot
  for crash recovery); cleanup unlinks the file on success.

Required environment variables (§9.1.2):
  VALIDATION_SUPABASE_URL
  VALIDATION_SUPABASE_SECRET_KEY
  VALIDATION_SUPABASE_PROJECT_REF
  VALIDATION_ADMIN_EMAIL          (REQUIRED for rate-limit-admin — the dev's real
                                   admin email; canonicalized to match the bucket
                                   live enforceQuota writes on a real admin POST)
`;

type LooseSupabaseClient = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type Snapshot = {
  kind: "admin" | "crew";
  identity: string;
  recorded_hour_bucket: string;
  snapshot_prior_count: number | null;
  // R9 — write-ahead durability marker. The peek writes "pending" BEFORE the
  // seed; the post-seed rewrite writes "committed" with the seed-time prior.
  // A "pending" snapshot at cleanup time means the process died between the
  // seed commit and the rewrite — so snapshot_prior_count is the PEEK-time
  // value, which may not reflect a concurrent enforceQuota increment that
  // landed in the [peek, seed] window. Cleanup warns rather than silently
  // restoring a possibly-stale prior. (Under file-backed-only — the ratified
  // sole snapshot strategy — this residual crash window cannot be eliminated
  // without a DB-transactional snapshot store; the realistic impact is zero in
  // the single-user validation environment, where no concurrent real POSTs hit
  // the fixture identity during a manual seed. See closeout §4a.)
  status: "pending" | "committed";
};

function err(msg: string): void {
  process.stderr.write(`[validation-report-fixtures] ${msg}\n`);
}

function fail(msg: string): never {
  err(`ERROR: ${msg}`);
  process.exit(1);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v.length === 0) {
    fail(`${name} is required — set it in .env.local per .env.local.example + spec §9.1.2.`);
  }
  return v;
}

/**
 * Source the server's UTC clock from the Supabase gateway `Date` response
 * header, not the local machine clock. The seeded report_rate_limits
 * hour_bucket MUST equal what live enforceQuota computes via
 * date_trunc('hour', now()) server-side; sourcing server time removes
 * client-clock-skew as a failure mode near hour boundaries.
 */
async function serverNow(supabaseUrl: string, supabaseKey: string): Promise<Date> {
  const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/`, {
    method: "HEAD",
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
  });
  const dateHeader = res.headers.get("date");
  if (!dateHeader) {
    fail("Supabase gateway returned no Date header — cannot source server time for hour_bucket.");
  }
  const parsed = new Date(dateHeader);
  if (Number.isNaN(parsed.getTime())) {
    fail(`Supabase Date header is unparseable: '${dateHeader}'.`);
  }
  return parsed;
}

function offsetSeconds(d: Date, seconds: number): string {
  return new Date(d.getTime() + seconds * 1000).toISOString();
}

async function readValidationStateAliasMap(
  supabase: LooseSupabaseClient,
): Promise<Record<string, Record<string, string>>> {
  const { data, error } = await supabase
    .from("validation_state")
    .select("alias_map")
    .eq("key", "validation_seed")
    .maybeSingle();
  if (error) {
    fail(`validation_state read failed: ${error.message ?? JSON.stringify(error)}`);
  }
  if (!data) {
    fail("validation_state row missing — run `pnpm validation:reseed --combo all` first.");
  }
  return (data as { alias_map: Record<string, Record<string, string>> }).alias_map ?? {};
}

async function resolveCrewMemberId(
  supabase: LooseSupabaseClient,
  combo: string,
): Promise<string> {
  // R9-F1 canonical-enum guard — mirror validation-resolve-alias.ts so a
  // stale alias_map key from a prior matrix version can't resolve.
  if (!ALL_COMBOS.includes(combo)) {
    fail(`combo '${combo}' is not in the canonical enum. Valid: ${ALL_COMBOS.join(", ")}.`);
  }
  const aliasMap = await readValidationStateAliasMap(supabase);
  const slice = aliasMap?.[combo];
  if (!slice || typeof slice !== "object") {
    fail(
      `alias_map missing combo '${combo}'. Available: ${Object.keys(aliasMap ?? {}).join(", ") || "<none>"}.`,
    );
  }
  const uuid = slice["alias_5a_lead"];
  if (!uuid) {
    fail(
      `alias_map[${combo}] missing alias 'alias_5a_lead' (rate-limit-crew identity selector). ` +
        `Available aliases: ${Object.keys(slice).join(", ")}.`,
    );
  }
  // R7 (HIGH) — bind the alias_map UUID to THIS combo's validation fixture show
  // before using it as a service-role rate-limit identity. A stale/poisoned
  // alias_map could otherwise point at a UUID belonging to another combo or a
  // REAL crew row, and the harness would rate-limit (then have cleanup touch)
  // the wrong identity. Require the UUID to be a crew_member on the combo's
  // `validation_<combo>` show carrying the 'M12 Validation' fixture sentinel.
  const driveFileId = `validation_${combo}`;
  const { data: bound, error: bindErr } = await supabase
    .from("crew_members")
    .select("id, shows!inner(drive_file_id, client_label)")
    .eq("id", uuid)
    .eq("shows.drive_file_id", driveFileId)
    .eq("shows.client_label", "M12 Validation")
    .maybeSingle();
  if (bindErr) {
    fail(`crew_members ownership check failed: ${bindErr.message ?? JSON.stringify(bindErr)}`);
  }
  if (!bound) {
    fail(
      `alias_map[${combo}].alias_5a_lead UUID '${uuid}' does NOT resolve to a crew_member on ` +
        `the validation fixture show for combo '${combo}' (drive_file_id='${driveFileId}', ` +
        `client_label='M12 Validation'). The alias_map may be stale/poisoned — refusing to ` +
        `seed a rate-limit row for an unverified identity. Re-run \`pnpm validation:reseed --combo ${combo}\`.`,
    );
  }
  return uuid;
}

async function resolveShowId(
  supabase: LooseSupabaseClient,
  combo: string,
): Promise<string> {
  if (!ALL_COMBOS.includes(combo)) {
    fail(`combo '${combo}' is not in the canonical enum. Valid: ${ALL_COMBOS.join(", ")}.`);
  }
  const driveFileId = `validation_${combo}`;
  const { data, error } = await supabase
    .from("shows")
    .select("id")
    .eq("drive_file_id", driveFileId)
    // R11 (HIGH) — require the fixture-ownership sentinel. A real/imported show
    // could collide on the `validation_<combo>` drive_file_id; without the
    // client_label='M12 Validation' proof the harness would attach
    // reports/admin_alerts service-role writes to a NON-fixture show. Same
    // sentinel the mint RPC stamps and the cleanup helpers + R7 crew binding
    // require.
    .eq("client_label", "M12 Validation")
    .maybeSingle();
  if (error) {
    fail(`shows read failed: ${error.message ?? JSON.stringify(error)}`);
  }
  if (!data) {
    fail(
      `no validation FIXTURE show for combo '${combo}' (drive_file_id='${driveFileId}' ` +
        `AND client_label='M12 Validation'). Run \`pnpm validation:reseed --combo ${combo}\` first.`,
    );
  }
  return (data as { id: string }).id;
}

function tag(outcome: Outcome): string {
  return `m12-fixture-${outcome}`;
}

// NOTE on report_rate_limits.identity: the plan's synthetic-prefix form
// `validation:m12-fixture-<outcome>:<uuid>` is the cleanup-predicate net
// (defaultCleanup deletes `identity LIKE 'validation:m12-fixture-%'`), but
// in practice NO outcome writes a synthetic report_rate_limits identity —
// the only two outcomes touching report_rate_limits (rate-limit-{admin,crew})
// MUST use the live production identity shape (canonical email / raw UUID per
// rateLimit.ts:76 + submit.ts:168) so the live quota-deny path actually fires.
// Their rows are torn down via the snapshot+restore path, not the LIKE net.

function writeSnapshot(file: string, snap: Snapshot): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(snap, null, 2) + "\n");
}

function readSnapshot(file: string): Snapshot | null {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as Snapshot;
}

// ───────────────────────────────────────────────────────────────────────
// Producer-state writers (per-outcome)
// ───────────────────────────────────────────────────────────────────────

async function insertReportRow(
  supabase: LooseSupabaseClient,
  row: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await supabase.from("reports").insert(row).select("id").single();
  if (error) {
    fail(`reports INSERT failed: ${error.message ?? JSON.stringify(error)}`);
  }
  return (data as { id: string }).id;
}

// Writes admin_alerts through the canonical upsert_admin_alert RPC
// Writes a fixture admin_alert through the validation_seed_admin_alert RPC
// (supabase/migrations/20260527210003_*.sql). That RPC ATOMICALLY (under a
// SHARE ROW EXCLUSIVE table lock) refuses if a pre-existing UNRESOLVED
// (show_id, code) row is NOT a m12-fixture row — then delegates the actual
// write to the canonical upsert_admin_alert RPC. The atomic check closes the
// R5 TOCTOU: a harness-side preflight SELECT + later upsert could be raced by
// a real producer (live submit.ts writes admin_alerts via raw INSERT) inserting
// between the check and the write; the table lock serializes them. A row that
// is ALREADY a m12-fixture-* row is safe to re-seed (idempotent refresh).
//
// Callers in the alert-producing branches invoke this BEFORE writing the
// reports row, so a refusal (RPC raise → fail) never orphans a reports row.
async function upsertAdminAlertRow(
  supabase: LooseSupabaseClient,
  showId: string | null,
  code: string,
  context: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await supabase.rpc("validation_seed_admin_alert", {
    p_show_id: showId,
    p_code: code,
    p_context: context,
  });
  if (error) {
    fail(`validation_seed_admin_alert RPC failed: ${error.message ?? JSON.stringify(error)}`);
  }
  return data as string;
}

// ───────────────────────────────────────────────────────────────────────
// Rate-limit seed (admin / crew) — snapshot+restore lifecycle
// ───────────────────────────────────────────────────────────────────────

async function seedRateLimitOutcome(
  supabase: LooseSupabaseClient,
  kind: "admin" | "crew",
  identity: string,
  forceOverwrite: boolean,
): Promise<void> {
  const file = SNAPSHOT_FILE[kind];
  // R4 cross-hour guard — set to the existing snapshot's bucket under
  // --force-overwrite; passed to the RPC, which refuses if the DB hour rolled.
  let expectedPrevBucket: string | null = null;

  // (a0) F39 refuse-existing-snapshot guard (file-presence).
  if (existsSync(file)) {
    if (!forceOverwrite) {
      fail(
        `snapshot file already present at ${file}; run cleanup first OR use ` +
          `--force-overwrite-snapshot to re-snapshot the existing seeded state ` +
          `(loses original pre-seed prior_count).`,
      );
    }
    // R2 adversarial R3 (MEDIUM) — force-overwrite must NOT silently discard a
    // DIFFERENT identity's snapshot. Re-seeding crew combo R7b with
    // --force-overwrite-snapshot while an R1 snapshot exists would replace the
    // R1 snapshot and strand R1's quota row with no restore path. Require the
    // existing snapshot's (kind, identity) to match the seed being forced;
    // otherwise refuse and direct the dev to clean up the other identity first.
    const existingSnap = readSnapshot(file);
    if (existingSnap && (existingSnap.kind !== kind || existingSnap.identity !== identity)) {
      fail(
        `--force-overwrite-snapshot refused: the existing snapshot at ${file} belongs to ` +
          `a DIFFERENT identity (kind=${existingSnap.kind}, identity=${existingSnap.identity}) ` +
          `than the seed being forced (kind=${kind}, identity=${identity}). Overwriting it ` +
          `would strand that identity's seeded quota row with no restore path. Run ` +
          `\`--cleanup --include-${existingSnap.kind === "admin" ? "admin-email <email>" : "crew-id <uuid>"}\` ` +
          `for the existing identity first, then re-seed.`,
      );
    }
    // R4 (HIGH) — pass the existing snapshot's bucket to the RPC so it can
    // refuse (DB-clock authoritative) if the hour has rolled over since the
    // snapshot was taken. Without this, force-overwrite in a new hour would
    // overwrite the snapshot with the new bucket and strand the prior hour's
    // seeded row with no restore path.
    if (existingSnap) expectedPrevBucket = existingSnap.recorded_hour_bucket;
    err(
      `--force-overwrite-snapshot: rewriting existing snapshot at ${file} from ` +
        `previous seeded state; original pre-seed prior_count is lost (cleanup ` +
        `will restore to current seeded count, not pre-seed count).`,
    );
  }

  // Write-ahead seed (R6 HIGH) — the restore record must be DURABLE before the
  // destructive mutation, else a crash between the seed and the file write
  // strands the bucket with no recoverable prior. Three phases:
  //
  //   (1) PEEK (p_dry_run) — under the SHARE ROW EXCLUSIVE lock, read the
  //       pre-seed prior count + DB-authoritative bucket WITHOUT mutating. The
  //       bucket comes from DB date_trunc('hour', now()) (R2: same as live
  //       enforceQuota); the prior is accurate at peek time (R3 lock).
  //       p_expected_prev_bucket is the R4 cross-hour guard for --force.
  //   (2) PERSIST — fsync the snapshot file BEFORE any mutation. A crash here
  //       leaves a snapshot whose bucket was never seeded; cleanup restores it
  //       to its (unchanged) prior — a safe no-op.
  //   (3) SEED — mutate at the recorded bucket, guarding against an hour roll
  //       between peek and seed (p_expected_prev_bucket = the peeked bucket).
  //
  // identity is the live shape the caller passed (admin: canonicalize(email);
  // crew: raw UUID per rateLimit.ts:76 + submit.ts:168).
  const count = kind === "admin" ? ADMIN_QUOTA_SEED_COUNT : CREW_QUOTA_SEED_COUNT;

  // (1) PEEK.
  const peek = await supabase.rpc("validation_seed_rate_limit", {
    p_kind: kind,
    p_identity: identity,
    p_count: count,
    p_expected_prev_bucket: expectedPrevBucket,
    p_dry_run: true,
  });
  if (peek.error) {
    fail(`validation_seed_rate_limit (peek) RPC failed: ${peek.error.message ?? JSON.stringify(peek.error)}`);
  }
  const peeked = peek.data as {
    recorded_hour_bucket: string;
    snapshot_prior_count: number | null;
  };

  // (2) PERSIST the restore record durably BEFORE mutating, marked "pending"
  // (the seed has not run yet). A crash after this write but before the seed
  // leaves a "pending" snapshot whose bucket was never mutated — cleanup
  // restores it to its unchanged prior (safe no-op) + warns.
  writeSnapshot(file, {
    kind,
    identity,
    recorded_hour_bucket: peeked.recorded_hour_bucket,
    snapshot_prior_count: peeked.snapshot_prior_count,
    status: "pending",
  });

  // (3) SEED (guard against an hour roll since the peek). The seed RPC re-reads
  // the prior under ITS OWN SHARE ROW EXCLUSIVE lock immediately before the
  // UPSERT, so its returned snapshot_prior_count is authoritative as of the
  // seed — it INCLUDES any legitimate enforceQuota increment that landed in the
  // [peek, seed] window (R7 no-lost-update). The peek's snapshot (step 2) was
  // the durable fallback for a crash between this seed and the rewrite below
  // (it restores to a valid prior, never an unrecoverable strand — R6).
  const seed = await supabase.rpc("validation_seed_rate_limit", {
    p_kind: kind,
    p_identity: identity,
    p_count: count,
    p_expected_prev_bucket: peeked.recorded_hour_bucket,
    p_dry_run: false,
  });
  if (seed.error) {
    fail(`validation_seed_rate_limit (seed) RPC failed: ${seed.error.message ?? JSON.stringify(seed.error)}`);
  }
  const seeded = seed.data as {
    recorded_hour_bucket: string;
    snapshot_prior_count: number | null;
  };

  // (4) Rewrite the snapshot with the SEED-time prior so cleanup restores the
  // true pre-seed count, including any [peek, seed] increment (R7). Marked
  // "committed" — the seed succeeded and this prior is authoritative. Same
  // bucket (the cross-hour guard guarantees seeded.bucket === peeked.bucket).
  writeSnapshot(file, {
    kind,
    identity,
    recorded_hour_bucket: seeded.recorded_hour_bucket,
    snapshot_prior_count: seeded.snapshot_prior_count,
    status: "committed",
  });

  process.stdout.write(
    `materialized rate-limit-${kind} report row (kind=${kind}, identity=${identity}, ` +
      `hour_bucket=${seeded.recorded_hour_bucket}, count=${count})\n`,
  );
}

// ───────────────────────────────────────────────────────────────────────
// Cleanup
// ───────────────────────────────────────────────────────────────────────

async function defaultCleanup(supabase: LooseSupabaseClient): Promise<void> {
  // Order: admin_alerts → report_rate_limits → reports (R31 cleanup-order).
  const a = await supabase
    .from("admin_alerts")
    .delete()
    .like("context->>validation_tag", "m12-fixture-%");
  if (a.error) fail(`admin_alerts cleanup failed: ${a.error.message}`);

  const r = await supabase
    .from("report_rate_limits")
    .delete()
    .like("identity", "validation:m12-fixture-%");
  if (r.error) fail(`report_rate_limits cleanup failed: ${r.error.message}`);

  const rep = await supabase
    .from("reports")
    .delete()
    .like("context->>validation_tag", "m12-fixture-%");
  if (rep.error) fail(`reports cleanup failed: ${rep.error.message}`);
}

// Throws (rather than fail()/exit) on a per-side REFUSAL so a combined
// --include-admin-email + --include-crew-id invocation can attempt BOTH sides
// and exit 1 only at the end (plan line 123 — "one side may succeed while the
// other refuses"). Hard DB faults inside applyRateLimitRestore still fail()/exit.
async function restoreRateLimitFromSnapshot(
  supabase: LooseSupabaseClient,
  kind: "admin" | "crew",
  expectedIdentity: string | null,
): Promise<void> {
  const file = SNAPSHOT_FILE[kind];
  const snap = readSnapshot(file);
  if (!snap) {
    throw new Error(
      `no rate-limit-${kind} snapshot found; cleanup aborted to avoid touching prod buckets`,
    );
  }
  if (expectedIdentity && snap.identity !== expectedIdentity) {
    throw new Error(
      `rate-limit-${kind} snapshot identity '${snap.identity}' does not match the ` +
        `--include-${kind === "admin" ? "admin-email" : "crew-id"} value '${expectedIdentity}'.`,
    );
  }
  // R9 — a "pending" snapshot means the seed process died between the seed
  // commit and the snapshot rewrite, so snapshot_prior_count is the PEEK-time
  // value. In the single-user validation environment this restores the correct
  // prior (no concurrent writes), but warn so the operator can verify the count
  // if there was any concurrent quota activity in the peek→seed window.
  if (snap.status === "pending") {
    err(
      `WARNING: rate-limit-${kind} snapshot is "pending" (the seed process did not ` +
        `complete its post-seed snapshot rewrite). Restoring to the peek-time prior ` +
        `(${snap.snapshot_prior_count === null ? "delete bucket" : `count=${snap.snapshot_prior_count}`}). ` +
        `If a real report POST hit this identity+bucket between the peek and the seed, ` +
        `verify the restored count manually — that increment may not be reflected.`,
    );
  }
  await applyRateLimitRestore(supabase, snap);
  unlinkSync(file);
}

async function applyRateLimitRestore(
  supabase: LooseSupabaseClient,
  snap: Snapshot,
): Promise<void> {
  if (snap.snapshot_prior_count === null) {
    // No prior row → DELETE the exact bucket (never cross-hour).
    const { error } = await supabase
      .from("report_rate_limits")
      .delete()
      .eq("kind", snap.kind)
      .eq("identity", snap.identity)
      .eq("hour_bucket", snap.recorded_hour_bucket);
    if (error) fail(`report_rate_limits restore-delete failed: ${error.message}`);
  } else {
    // Prior row → restore the exact-bucket count (never cross-hour).
    const { error } = await supabase
      .from("report_rate_limits")
      .update({ count: snap.snapshot_prior_count })
      .eq("kind", snap.kind)
      .eq("identity", snap.identity)
      .eq("hour_bucket", snap.recorded_hour_bucket);
    if (error) fail(`report_rate_limits restore-update failed: ${error.message}`);
  }
}

async function forceCleanupWithoutSnapshot(
  supabase: LooseSupabaseClient,
  kind: "admin" | "crew",
  identity: string,
  hourBucketIso: string,
): Promise<number> {
  // R13 — request the affected-row count so the caller can detect a zero-match
  // (typo'd --hour-bucket / wrong identity) instead of falsely reporting
  // success and leaving the seeded over-limit row behind.
  const { error, count } = await supabase
    .from("report_rate_limits")
    .delete({ count: "exact" })
    .eq("kind", kind)
    .eq("identity", identity)
    .eq("hour_bucket", hourBucketIso);
  if (error) fail(`force-cleanup-without-snapshot delete failed: ${error.message}`);
  // No snapshot unlink here: the caller has already enforced the precondition
  // that NO snapshot file exists for this kind (R10). If one existed, normal
  // `--cleanup --include-*` must be used instead (it restores via the snapshot)
  // — so there is never a valid restore record to destroy on this path.
  return count ?? 0;
}

// ───────────────────────────────────────────────────────────────────────
// main
// ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadValidationEnv();
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      help: { type: "boolean", default: false },
      outcome: { type: "string" },
      combo: { type: "string" },
      "alert-code": { type: "string" },
      "force-overwrite-snapshot": { type: "boolean", default: false },
      cleanup: { type: "boolean", default: false },
      "include-admin-email": { type: "string" },
      "include-crew-id": { type: "string" },
      "force-cleanup-without-snapshot": { type: "boolean", default: false },
      "hour-bucket": { type: "string" },
      kind: { type: "string" },
      "allow-local-override": { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }

  const allowLocal = values["allow-local-override"] ?? false;
  assertProdEquivalentTarget(process.env.VALIDATION_SUPABASE_URL, allowLocal);
  const supabaseUrl = requireEnv("VALIDATION_SUPABASE_URL");
  const supabaseKey = requireEnv("VALIDATION_SUPABASE_SECRET_KEY");
  const projectRef = requireEnv("VALIDATION_SUPABASE_PROJECT_REF");
  assertSupabaseTargetMatchesProjectRef(supabaseUrl, projectRef, allowLocal);

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as LooseSupabaseClient;

  // ── Cleanup mode ──────────────────────────────────────────────────
  if (values.cleanup) {
    // R8 — reject seed-only flags BEFORE any destructive cleanup. Their scope
    // validation otherwise lives only in the (unreachable) seed branch, so a
    // malformed command like `--cleanup --force-overwrite-snapshot` would
    // silently delete tagged rows and exit 0 instead of refusing.
    if (values["force-overwrite-snapshot"]) {
      fail("--force-overwrite-snapshot is a seed-only flag and is not valid with --cleanup.");
    }
    if (values.outcome !== undefined) {
      fail("--outcome (seed mode) and --cleanup are mutually exclusive — pass one or the other.");
    }
    if (values["alert-code"] !== undefined) {
      fail("--alert-code is a seed-only flag (lookup-inconclusive) and is not valid with --cleanup.");
    }
    if (values.combo !== undefined) {
      fail("--combo is a seed-only flag and is not valid with --cleanup; use --include-crew-id <uuid> to scope crew cleanup.");
    }
    await defaultCleanup(supabase);

    const forceWithout = values["force-cleanup-without-snapshot"] ?? false;
    if (forceWithout) {
      const kind = values.kind;
      const hourBucket = values["hour-bucket"];
      if (kind !== "admin" && kind !== "crew") {
        fail("--force-cleanup-without-snapshot requires --kind <admin|crew>.");
      }
      if (!hourBucket) {
        fail("--force-cleanup-without-snapshot requires --hour-bucket <ISO timestamp>.");
      }
      // R10 — enforce the documented precondition: this emergency path is ONLY
      // for when the snapshot file was LOST. If a snapshot still exists, normal
      // `--cleanup --include-*` must be used (it restores via the snapshot at
      // the recorded bucket). Refusing here prevents the force path from
      // deleting a typo'd/zero-row bucket AND destroying a still-valid restore
      // record — which would strand the real seeded row unrecoverably.
      if (existsSync(SNAPSHOT_FILE[kind])) {
        fail(
          `--force-cleanup-without-snapshot refused: a snapshot file still exists at ` +
            `${SNAPSHOT_FILE[kind]}. This emergency path is only for a LOST snapshot. ` +
            `Use \`--cleanup --include-${kind === "admin" ? "admin-email <email>" : "crew-id <uuid>"}\` ` +
            `instead — it restores the recorded bucket via the snapshot.`,
        );
      }
      let identity: string;
      if (kind === "admin") {
        identity = canonicalize(requireEnv("VALIDATION_ADMIN_EMAIL")) || fail("admin email canonicalized to empty");
      } else {
        const crewId = values["include-crew-id"];
        if (!crewId || crewId.trim().length === 0) {
          fail("--force-cleanup-without-snapshot --kind crew requires a non-empty --include-crew-id <uuid>.");
        }
        identity = crewId;
      }
      const deleted = await forceCleanupWithoutSnapshot(supabase, kind, identity, hourBucket);
      // R13 — a zero-match means the bucket/identity didn't match the seeded
      // row (typo'd --hour-bucket, wrong/stale identity). Fail loudly rather
      // than falsely reporting success and leaving the over-limit row behind.
      if (deleted === 0) {
        fail(
          `force-cleanup-without-snapshot: 0 rows matched (kind=${kind}, identity=${identity}, ` +
            `hour_bucket=${hourBucket}) — nothing deleted. Verify --hour-bucket and the identity ` +
            `(${kind === "admin" ? "VALIDATION_ADMIN_EMAIL" : "--include-crew-id"}); the seeded ` +
            `row may be at a different bucket.`,
        );
      }
      process.stdout.write(
        `force-cleanup-without-snapshot: deleted ${deleted} row(s) at ${kind} bucket ${hourBucket}\n`,
      );
      return;
    }

    let refused = false;
    // Treat a PRESENT-but-empty value as a loud error, not a silent skip. The
    // common footgun: `--include-admin-email $VALIDATION_ADMIN_EMAIL` where the
    // var is unset in the shell (it lives in .env.local, which the harness
    // loads internally but the SHELL does not export) expands to an empty
    // string — silently skipping the admin restore would leave a real-identity
    // rate-limit row behind plus an orphaned snapshot file.
    if (values["include-admin-email"] !== undefined) {
      const raw = values["include-admin-email"];
      if (raw.trim().length === 0) {
        fail(
          "--include-admin-email was passed an empty value. If you used " +
            "$VALIDATION_ADMIN_EMAIL, it lives in .env.local (not the shell env) — " +
            "pass the admin email literally, e.g. --include-admin-email you@example.com.",
        );
      }
      const identity = canonicalize(raw);
      if (!identity) fail("--include-admin-email canonicalized to empty.");
      try {
        await restoreRateLimitFromSnapshot(supabase, "admin", identity);
      } catch (e) {
        err(e instanceof Error ? e.message : String(e));
        refused = true;
      }
    }
    if (values["include-crew-id"] !== undefined) {
      const raw = values["include-crew-id"];
      if (raw.trim().length === 0) {
        fail("--include-crew-id was passed an empty value; pass the fixture crew_member_id UUID literally.");
      }
      try {
        await restoreRateLimitFromSnapshot(supabase, "crew", raw);
      } catch (e) {
        err(e instanceof Error ? e.message : String(e));
        refused = true;
      }
    }
    if (refused) process.exit(1);
    process.stdout.write("cleanup complete\n");
    return;
  }

  // ── Seed mode ─────────────────────────────────────────────────────
  const outcome = values.outcome as Outcome | undefined;
  if (!outcome || !OUTCOMES.includes(outcome)) {
    fail(`unknown outcome '${outcome ?? ""}'. Valid: ${OUTCOMES.join(", ")}.`);
  }

  const forceOverwrite = values["force-overwrite-snapshot"] ?? false;
  if (forceOverwrite && !RATE_LIMIT_OUTCOMES.has(outcome)) {
    fail(
      `--force-overwrite-snapshot is valid only with --outcome rate-limit-admin OR rate-limit-crew.`,
    );
  }

  // Resolve + validate --alert-code (only meaningful for lookup-inconclusive).
  let alertCodeVariant: AlertCodeVariant = DEFAULT_ALERT_CODE;
  if (values["alert-code"] !== undefined) {
    if (!ALERT_CODE_KEYS.includes(values["alert-code"] as AlertCodeVariant)) {
      fail(
        `unknown --alert-code '${values["alert-code"]}'. Valid: ${ALERT_CODE_KEYS.join(", ")}.`,
      );
    }
    alertCodeVariant = values["alert-code"] as AlertCodeVariant;
  }

  const idempotencyKey = randomUUID();

  switch (outcome) {
    case "rate-limit-admin": {
      const adminEmail = requireEnv("VALIDATION_ADMIN_EMAIL");
      const identity = canonicalize(adminEmail);
      if (!identity) fail("VALIDATION_ADMIN_EMAIL canonicalized to empty.");
      await seedRateLimitOutcome(supabase, "admin", identity, forceOverwrite);
      return;
    }
    case "rate-limit-crew": {
      const combo = values.combo;
      if (!combo) {
        fail(
          "--outcome rate-limit-crew requires --combo <combo> to resolve a fixture " +
            "crew_member_id via validation:resolve-alias <combo> alias_5a_lead.",
        );
      }
      const identity = await resolveCrewMemberId(supabase, combo);
      await seedRateLimitOutcome(supabase, "crew", identity, forceOverwrite);
      return;
    }
    default:
      break;
  }

  // All remaining outcomes write reports and/or admin_alerts and need a show.
  const combo = values.combo ?? "R1";
  const showId = await resolveShowId(supabase, combo);
  const now = await serverNow(supabaseUrl, supabaseKey);
  const adminEmail = process.env.VALIDATION_ADMIN_EMAIL
    ? canonicalize(process.env.VALIDATION_ADMIN_EMAIL)
    : null;

  const baseReportContext = (o: Outcome): Record<string, unknown> => ({
    surface: "validation-fixture",
    validation_tag: tag(o),
  });

  switch (outcome) {
    case "success-admin": {
      const id = await insertReportRow(supabase, {
        idempotency_key: idempotencyKey,
        show_id: showId,
        reported_by_kind: "admin",
        reported_by: adminEmail ?? "validation-admin@example.com",
        reporter_role: null,
        context: baseReportContext("success-admin"),
        github_issue_url: `https://github.com/fxav-validation/fixtures/issues/${Math.floor(Math.random() * 9000) + 1000}`,
        processing_lease_until: now.toISOString(),
        lease_holder: null,
      });
      process.stdout.write(
        `materialized success-admin report row ${id} (idempotency_key=${idempotencyKey}, show_id=${showId})\n`,
      );
      return;
    }
    case "success-crew": {
      const id = await insertReportRow(supabase, {
        idempotency_key: idempotencyKey,
        show_id: showId,
        reported_by_kind: "crew",
        reported_by: randomUUID(),
        reporter_role: "none",
        context: baseReportContext("success-crew"),
        github_issue_url: `https://github.com/fxav-validation/fixtures/issues/${Math.floor(Math.random() * 9000) + 1000}`,
        processing_lease_until: now.toISOString(),
        lease_holder: null,
      });
      process.stdout.write(
        `materialized success-crew report row ${id} (idempotency_key=${idempotencyKey}, show_id=${showId})\n`,
      );
      return;
    }
    case "in-flight": {
      const id = await insertReportRow(supabase, {
        idempotency_key: idempotencyKey,
        show_id: showId,
        reported_by_kind: "admin",
        reported_by: adminEmail ?? "validation-admin@example.com",
        reporter_role: null,
        context: baseReportContext("in-flight"),
        github_issue_url: null,
        processing_lease_until: offsetSeconds(now, 90),
        lease_holder: randomUUID(),
      });
      process.stdout.write(
        `materialized in-flight report row ${id} (idempotency_key=${idempotencyKey}, show_id=${showId})\n`,
      );
      return;
    }
    case "lease-expired": {
      const id = await insertReportRow(supabase, {
        idempotency_key: idempotencyKey,
        show_id: showId,
        reported_by_kind: "admin",
        reported_by: adminEmail ?? "validation-admin@example.com",
        reporter_role: null,
        context: baseReportContext("lease-expired"),
        github_issue_url: null,
        processing_lease_until: offsetSeconds(now, -60),
        lease_holder: null,
      });
      process.stdout.write(
        `materialized lease-expired report row ${id} (idempotency_key=${idempotencyKey}, show_id=${showId})\n`,
      );
      return;
    }
    case "horizon-expired": {
      const id = await insertReportRow(supabase, {
        idempotency_key: idempotencyKey,
        show_id: showId,
        reported_by_kind: "admin",
        reported_by: adminEmail ?? "validation-admin@example.com",
        reporter_role: null,
        context: baseReportContext("horizon-expired"),
        github_issue_url: null,
        // 25h ago — live acquireReportLease uses default now() so the live
        // submit path can never reach this state (leaseProtocol.ts:80-126).
        created_at: offsetSeconds(now, -25 * 3600),
        // R14 — processing_lease_until must be in the PAST, not NULL. A real
        // 25h-old report acquired a ~90s lease at creation, so its lease lapsed
        // ~25h ago. The §13.2.3-amendment-2 reaper (8.3f) only deletes stale
        // rows where `processing_lease_until < now()`; a NULL would make this
        // fixture non-reapable and unrepresentative of the live stale-report
        // shape the retention predicate targets. (The horizon-expired RESPONSE
        // is created_at-based, so it fires either way — but the row must match
        // the reaper to be a faithful fixture.)
        processing_lease_until: offsetSeconds(now, -25 * 3600 + 90),
        lease_holder: null,
      });
      process.stdout.write(
        `materialized horizon-expired report row ${id} (idempotency_key=${idempotencyKey}, show_id=${showId})\n`,
      );
      return;
    }
    case "lookup-inconclusive": {
      // R2 HIGH fix — mirror live handleLookupInconclusive (submit.ts:691-735).
      // BOT_LOGIN_MISSING is special: production writes a GLOBAL
      // GITHUB_BOT_LOGIN_MISSING alert (show_id=null, line 704) AND a
      // show-scoped REPORT_LOOKUP_INCONCLUSIVE state-gated alert (line 731-732).
      // The other 3 variants write a single show-scoped alert whose code is
      // lookupAlertCode(error.code) (REPORT_DUPLICATE_LIVE_MATCHES /
      // REPORT_OPEN_ORPHAN_LABEL / REPORT_LOOKUP_INCONCLUSIVE).
      const isBotLogin = alertCodeVariant === "bot-login-missing";
      const sourceCode = alertCodeSourceEnum(alertCodeVariant);

      // (i) admin_alerts FIRST — upsertAdminAlertRow's atomic guard (R5)
      // refuses if a pre-existing non-fixture unresolved (show_id, code) row
      // exists. Writing alerts before the reports row means a refusal exits
      // before the reports INSERT, so no reports row is orphaned.
      let alertSummary: string;
      if (isBotLogin) {
        // R12 — the bot-login dual-write (global GITHUB_BOT_LOGIN_MISSING +
        // show-scoped REPORT_LOOKUP_INCONCLUSIVE) goes through ONE atomic RPC so
        // it is both-or-neither: under a single table lock it checks both scopes
        // for a non-fixture clobber, then writes both (or raises, writing
        // neither). Two separate upserts could leave a stray global fixture
        // alert if the show-scoped write refused.
        const { data, error } = await supabase.rpc("validation_seed_bot_login_alerts", {
          p_show_id: showId,
          p_context: {
            idempotency_key: idempotencyKey,
            reason: "lookup_inconclusive_fixture",
            code: sourceCode,
            validation_tag: tag("lookup-inconclusive"),
          },
        });
        if (error) {
          fail(`validation_seed_bot_login_alerts RPC failed: ${error.message ?? JSON.stringify(error)}`);
        }
        const ids = data as { global_id: string; show_scoped_id: string };
        alertSummary =
          `global GITHUB_BOT_LOGIN_MISSING ${ids.global_id} + ` +
          `show-scoped REPORT_LOOKUP_INCONCLUSIVE ${ids.show_scoped_id}`;
      } else {
        const code = ALERT_CODE_VARIANTS[alertCodeVariant];
        const alertId = await upsertAdminAlertRow(supabase, showId, code, {
          idempotency_key: idempotencyKey,
          reason: "lookup_inconclusive_fixture",
          code: sourceCode,
          validation_tag: tag("lookup-inconclusive"),
        });
        alertSummary = `admin_alerts row ${alertId} (code=${code})`;
      }

      // (ii) reports row in post-lease-expired state (all variants).
      const reportId = await insertReportRow(supabase, {
        idempotency_key: idempotencyKey,
        show_id: showId,
        reported_by_kind: "admin",
        reported_by: adminEmail ?? "validation-admin@example.com",
        reporter_role: null,
        context: baseReportContext("lookup-inconclusive"),
        github_issue_url: null,
        processing_lease_until: offsetSeconds(now, -60),
        lease_holder: null,
      });
      process.stdout.write(
        `materialized lookup-inconclusive report row ${reportId} + ${alertSummary} ` +
          `(idempotency_key=${idempotencyKey}, show_id=${showId})\n`,
      );
      return;
    }
    case "orphaned-lost-lease": {
      const orphanIssueNumber = Math.floor(Math.random() * 9000) + 1000;
      const alertId = await upsertAdminAlertRow(
        supabase,
        showId,
        "REPORT_ORPHANED_LOST_LEASE",
        {
          idempotency_key: idempotencyKey,
          orphan_url: `https://github.com/fxav-validation/fixtures/issues/${orphanIssueNumber}`,
          orphan_issue_number: orphanIssueNumber,
          lease_holder: randomUUID(),
          row_reaped: false,
          stored_url: null,
          orphan_close_failed: false,
          orphan_close_error: null,
          validation_tag: tag("orphaned-lost-lease"),
        },
      );
      process.stdout.write(
        `materialized orphaned-lost-lease admin_alerts row ${alertId} ` +
          `(idempotency_key=${idempotencyKey}, show_id=${showId})\n`,
      );
      return;
    }
    default:
      fail(`outcome '${outcome}' not implemented.`);
  }
}

// Map the --alert-code selector back to the source LookupInconclusiveCode enum
// value (the input side of lookupAlertCode at lib/reports/submit.ts:202-208),
// stored in admin_alerts.context.code for fidelity with the live shape.
function alertCodeSourceEnum(variant: AlertCodeVariant): string {
  switch (variant) {
    case "bot-login-missing":
      return "BOT_LOGIN_MISSING";
    case "duplicate-live-matches":
      return "DUPLICATE_LIVE_MATCHES";
    case "open-orphan-label":
      return "OPEN_ISSUE_WITH_ORPHAN_LABEL";
    case "inconclusive":
      return "LOOKUP_INCONCLUSIVE";
  }
}

main().catch((e) => {
  err(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
