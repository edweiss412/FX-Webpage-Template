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
    .maybeSingle();
  if (error) {
    fail(`shows read failed: ${error.message ?? JSON.stringify(error)}`);
  }
  if (!data) {
    fail(
      `no validation show for combo '${combo}' (drive_file_id='${driveFileId}'). ` +
        `Run \`pnpm validation:reseed --combo ${combo}\` first.`,
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

  // (a+c) DB-side snapshot + seed in one call (R2 MEDIUM fix). The RPC derives
  // hour_bucket = date_trunc('hour', now()) using the DATABASE clock — the same
  // expression live enforceQuota uses (rateLimit.ts:82-83) — eliminating the
  // client/gateway-clock hour-boundary race. SELECT-then-UPSERT yields the
  // PRE-seed prior count (NULL if no row); under --force-overwrite the prior
  // row is the already-seeded count (F39 force-overwrite semantics preserved).
  // identity is the live shape the caller passed (admin: canonicalize(email);
  // crew: raw UUID per rateLimit.ts:76 + submit.ts:168). p_expected_prev_bucket
  // is the R4 cross-hour guard (NULL on the normal non-force path).
  const count = kind === "admin" ? ADMIN_QUOTA_SEED_COUNT : CREW_QUOTA_SEED_COUNT;
  const { data, error } = await supabase.rpc("validation_seed_rate_limit", {
    p_kind: kind,
    p_identity: identity,
    p_count: count,
    p_expected_prev_bucket: expectedPrevBucket,
  });
  if (error) {
    fail(`validation_seed_rate_limit RPC failed: ${error.message ?? JSON.stringify(error)}`);
  }
  const result = data as {
    recorded_hour_bucket: string;
    snapshot_prior_count: number | null;
  };

  // (b) Persist the snapshot tuple keyed on the DB-AUTHORITATIVE bucket.
  writeSnapshot(file, {
    kind,
    identity,
    recorded_hour_bucket: result.recorded_hour_bucket,
    snapshot_prior_count: result.snapshot_prior_count,
  });

  process.stdout.write(
    `materialized rate-limit-${kind} report row (kind=${kind}, identity=${identity}, ` +
      `hour_bucket=${result.recorded_hour_bucket}, count=${count})\n`,
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
): Promise<void> {
  const { error } = await supabase
    .from("report_rate_limits")
    .delete()
    .eq("kind", kind)
    .eq("identity", identity)
    .eq("hour_bucket", hourBucketIso);
  if (error) fail(`force-cleanup-without-snapshot delete failed: ${error.message}`);
  // Best-effort unlink of any stale snapshot file.
  const file = SNAPSHOT_FILE[kind];
  if (existsSync(file)) unlinkSync(file);
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
      const identity =
        kind === "admin"
          ? canonicalize(requireEnv("VALIDATION_ADMIN_EMAIL")) || fail("admin email canonicalized to empty")
          : values["include-crew-id"] ?? fail("--force-cleanup-without-snapshot --kind crew requires --include-crew-id <uuid>.");
      await forceCleanupWithoutSnapshot(supabase, kind, identity, hourBucket);
      process.stdout.write(`force-cleanup-without-snapshot: deleted ${kind} bucket ${hourBucket}\n`);
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
        processing_lease_until: null,
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
        const globalId = await upsertAdminAlertRow(supabase, null, "GITHUB_BOT_LOGIN_MISSING", {
          idempotency_key: idempotencyKey,
          reason: "lookup_inconclusive_fixture",
          code: sourceCode,
          validation_tag: tag("lookup-inconclusive"),
        });
        const showScopedId = await upsertAdminAlertRow(
          supabase,
          showId,
          "REPORT_LOOKUP_INCONCLUSIVE",
          {
            idempotency_key: idempotencyKey,
            reason: "lookup_inconclusive_fixture",
            code: sourceCode,
            validation_tag: tag("lookup-inconclusive"),
          },
        );
        alertSummary =
          `global GITHUB_BOT_LOGIN_MISSING ${globalId} + ` +
          `show-scoped REPORT_LOOKUP_INCONCLUSIVE ${showScopedId}`;
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
