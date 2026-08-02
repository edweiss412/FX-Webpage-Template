/**
 * tests/e2e/helpers/devCaptureStaged.ts — dev-capture staged e2e setup.
 *
 * Puts the shared local DB into the ONBOARDING WIZARD state (app_settings
 * `pending_wizard_session_id` non-null → app/admin/page.tsx precedence 1
 * renders the wizard) with staged `pending_syncs` rows bound to that session,
 * so the REAL Step3 grid renders the sheet cards whose "More" opens the real
 * Step3ReviewModal. Insert pattern from tests/e2e/admin-parse-panel.spec.ts:76-93;
 * state capture/restore pattern from helpers/dashboardState.ts (single-worker
 * suite — no concurrent writers). AGENTS invariant 9: every call destructures
 * { data, error }.
 *
 * `seedStep3StateGallery` seeds the SIX Step-3 card variants (spec
 * docs/superpowers/specs/admin/2026-08-02-step3-live-render-cluster-design.md
 * §2.3) into one reserved wizard session, so the live `/admin?step=3` render
 * shows the whole gallery for the impeccable dual-gate.
 *
 * Invariant 2 (advisory lock): EVERY seed-path mutation of `pending_syncs`,
 * `onboarding_scan_manifest` and `pending_ingestions` runs inside the psql/
 * postgres transaction holding `pg_advisory_xact_lock(hashtext('show:' ||
 * drive_file_id))`. The JS-side wrapper here is the SINGLE holder — this path
 * issues plain SQL, never an RPC, so no nested SECURITY DEFINER holder exists.
 * Per-row locking over six distinct drive_file_id values; no cross-row ordering
 * concern.
 */
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import postgres from "postgres";
import { FIELD_UNREADABLE } from "@/lib/parser/warnings";
import { RESCAN_REVIEW_REQUIRED } from "@/lib/onboarding/rescanReviewCode";
import { admin } from "./supabaseAdmin";

// Locked-fixture transport (helpers/lockedCrewRestriction.ts pattern): every
// pending_syncs mutation runs in a psql transaction holding the per-show
// advisory lock — tests/help/walker-routes.test.ts forbids unlocked PostgREST
// DML on locked tables under tests/e2e/.
const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "0.0.0.0"]);

/** The local Supabase database port (`supabase/config.toml:29`). The gallery pins
 *  to it so the SQL transport and the `supabaseAdmin` client (loopback API on
 *  54321) can only ever be two doors onto the SAME instance. */
const LOCAL_SUPABASE_DB_PORT = "54322";

/** The database every other gallery consumer reads through `supabaseAdmin`. */
const LOCAL_SUPABASE_DB_NAME = "postgres";

/** libpq connection parameters that RE-TARGET a URI regardless of its authority.
 *  `psql "postgresql://…@127.0.0.1:54322/postgres?host=192.0.2.1"` connects to
 *  192.0.2.1: the authority a URL parser reads is NOT the effective target, so a
 *  hostname-only guard is bypassable. `service` is worse — it pulls host, port,
 *  and database from an external service file the guard never sees. */
const LIBPQ_TARGET_OVERRIDE_PARAMS = ["host", "hostaddr", "service", "port", "dbname"];

/**
 * The ONE database the state-gallery path binds to — seed, cleanup, lock probe,
 * readback and the live `/admin` render all target it.
 *
 * Deliberately IGNORES `TEST_DATABASE_URL`: the canonical `.env.local` points
 * that at the validation pooler (scripts/preflight-env.mjs:121) while
 * `supabaseAdmin` and the app resolve the loopback `SUPABASE_URL`, so honoring
 * it would seed validation and read local.
 *
 * Fail-loud rather than silently mutating a remote fixture (same posture as the
 * observe CLI's `--env` guardrail). Three independent rejections, because a
 * hostname check alone closes none of the other two:
 *
 *   1. a non-loopback hostname;
 *   2. ANY libpq target-override query parameter — these beat the authority, so
 *      an accepted-looking loopback URI can still connect to a remote host;
 *   3. a loopback host on a port that is NOT the local Supabase database. That
 *      is not a remote-write hazard, it is a SPLIT-TARGET hazard: DML would land
 *      in some other local Postgres while the wizard session, the readback, and
 *      the rendered page stay on the Supabase instance, and the gallery would
 *      come up empty with nothing to point at.
 */
export function galleryDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`devCaptureStaged: DATABASE_URL is not a parseable URL`);
  }

  const overrides = LIBPQ_TARGET_OVERRIDE_PARAMS.filter((p) => parsed.searchParams.has(p));
  if (overrides.length > 0) {
    throw new Error(
      `devCaptureStaged: the Step-3 state gallery refuses a DATABASE_URL carrying libpq ` +
        `target-override parameter(s) (${overrides.join(", ")}). They override the URI's own host ` +
        `and port, so the loopback check below cannot see where the connection actually goes. ` +
        `Remove them, or unset DATABASE_URL to use the 127.0.0.1:${LOCAL_SUPABASE_DB_PORT} default.`,
    );
  }

  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `devCaptureStaged: the Step-3 state gallery refuses a non-loopback database host (${parsed.hostname}). ` +
        `Point DATABASE_URL at the local Supabase instance, or unset it to use the 127.0.0.1:${LOCAL_SUPABASE_DB_PORT} default.`,
    );
  }

  if (parsed.port !== LOCAL_SUPABASE_DB_PORT) {
    throw new Error(
      `devCaptureStaged: the Step-3 state gallery refuses a loopback database on port ` +
        `${parsed.port || "(default)"}; it must be the local Supabase database on ` +
        `${LOCAL_SUPABASE_DB_PORT}. Seeding another local Postgres would split the gallery: the ` +
        `rows land there while the wizard session, the readback, and the rendered page stay on ` +
        `Supabase.`,
    );
  }

  // The URI PATH is the database name. Distinct from the closed `?dbname=`
  // override — this is the ordinary component, and `…:54322/template1` is
  // host-correct, port-correct, and still the wrong database: SQL would land in
  // `template1` while `supabaseAdmin`, the readback, and the render stay on
  // `postgres` (whole-diff review R3).
  const database = parsed.pathname.replace(/^\//, "");
  if (database !== LOCAL_SUPABASE_DB_NAME) {
    throw new Error(
      `devCaptureStaged: the Step-3 state gallery refuses database "${database || "(none)"}"; ` +
        `it must be "${LOCAL_SUPABASE_DB_NAME}", the database every other gallery consumer reads.`,
    );
  }

  // Self-containment. `galleryPsqlEnv()` strips PGPASSWORD along with the rest
  // of PG*, so a DSN that relied on the ambient password would be ACCEPTED here
  // and then fail at connect time with an authentication error that points
  // nowhere near this guard. Require the DSN to carry its own credentials, and
  // say so now (whole-diff review R3).
  if (parsed.username === "" || parsed.password === "") {
    throw new Error(
      `devCaptureStaged: the Step-3 state gallery requires a DATABASE_URL carrying BOTH a user ` +
        `and a password. The gallery runs psql with every PG* variable stripped (PGPASSWORD ` +
        `included), so an ambient-credential DSN would be accepted here and then fail to ` +
        `authenticate. Use the 127.0.0.1:${LOCAL_SUPABASE_DB_PORT} default, or supply credentials inline.`,
    );
  }

  return url;
}

/**
 * The environment every gallery-path `psql` runs under: the ambient environment
 * with EVERY `PG*` variable stripped.
 *
 * Inspecting the DSN is not sufficient and cannot be made sufficient. libpq also
 * reads its target from the environment, and those variables are invisible to
 * any amount of URL parsing. Demonstrated by whole-diff review R2 against the
 * DSN-only guard: with a loopback DATABASE_URL the guard ACCEPTED and psql then
 * reported `connection to server at "192.0.2.2"` under `PGHOSTADDR=192.0.2.2`,
 * and `"192.0.2.3"` under a `PGSERVICE` whose service entry carried a hostaddr.
 * (`PGHOST` and `PGPORT` did NOT retarget, because the URI supplies host and
 * port explicitly and those win — but that is a detail of two variables, not a
 * property worth depending on.)
 *
 * So the fix is not detection, it is non-inheritance: strip the whole `PG`
 * prefix rather than denylisting the ones known today, which closes variables
 * added by future libpq versions too. Everything the connection needs — host,
 * port, user, password, database — is already in the DSN that
 * `galleryDatabaseUrl()` validated.
 */
export function galleryPsqlEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (key.toUpperCase().startsWith("PG")) delete env[key];
  }
  return env;
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function lockStatement(driveFileId: string): string {
  return `select pg_advisory_xact_lock(hashtext('show:' || ${sqlString(driveFileId)}));`;
}

function runLockedSql(
  driveFileId: string,
  body: string,
  label: string,
  dsn: string = databaseUrl,
): void {
  const sql = `
    begin;
    ${lockStatement(driveFileId)}
    ${body}
    commit;
  `;
  try {
    // `-X` is load-bearing, not tidiness: without it psql reads PSQLRC, then
    // `$HOME/.psqlrc` (and its versioned variants), then the compiled system
    // psqlrc, ALL of which run before the transaction arrives on stdin and any
    // of which may contain `\connect postgresql://…@remote`. That reconnects the
    // session after the validated local connection is made, so the seed or
    // cleanup would execute remotely with the guard none the wiser (whole-diff
    // review R3). Stripping PG* cannot close this: PSQLRC and HOME are not PG*.
    execFileSync("psql", [dsn, "-X", "-v", "ON_ERROR_STOP=1", "-At"], {
      input: sql,
      encoding: "utf8",
      // NOT the ambient environment: PG* variables retarget libpq behind the
      // validated DSN (see galleryPsqlEnv).
      env: galleryPsqlEnv(),
    });
  } catch (err) {
    throw new Error(
      `devCaptureStaged ${label} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Same locked transaction as `runLockedSql`, opened through the `postgres`
 * client so a caller can observe the transaction WHILE it holds the lock. The
 * probe runs after the body's DML and before COMMIT; a throw inside it rolls
 * the whole transaction back. Only the lock-topology test uses this seam — the
 * ordinary seed path stays on one-shot psql.
 */
async function runLockedSqlWithProbe(
  driveFileId: string,
  statements: string[],
  label: string,
  dsn: string,
  probe: (driveFileId: string) => Promise<void>,
): Promise<void> {
  const sql = postgres(dsn, { max: 1 });
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(lockStatement(driveFileId));
      for (const statement of statements) await tx.unsafe(statement);
      await probe(driveFileId);
    });
  } catch (err) {
    throw new Error(
      `devCaptureStaged ${label} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    await sql.end();
  }
}

const SETTINGS_FIELDS = [
  "watched_folder_id",
  "watched_folder_name",
  "watched_folder_set_by_email",
  "watched_folder_set_at",
  "pending_folder_id",
  "pending_folder_name",
  "pending_folder_set_by_email",
  "pending_folder_set_at",
  "pending_wizard_session_id",
  "pending_wizard_session_at",
] as const;

const priorBySession = new Map<string, Record<string, unknown> | null>();
const sessionByDfid = new Map<string, string>();

/** Write the wizard-pending state. Exposed separately so openStep3Modal can
 *  RE-assert it: the shared local DB has sibling-worktree writers (parallel
 *  agent sessions run onboarding e2e whose Start Over wipes app_settings —
 *  observed live: ONBOARDING_STARTED_OVER landing mid-render). Bursty, so a
 *  re-assert + reload retry rides it out; CI runs are isolated and never hit
 *  this. */
async function assertWizardSettings(sessionId: string): Promise<void> {
  const { error: upErr } = await admin
    .from("app_settings")
    .update({
      pending_folder_id: "seed-fixture-folder",
      pending_folder_name: "Seed fixture folder",
      pending_folder_set_by_email: "seed-mode@fxav.local",
      pending_folder_set_at: new Date().toISOString(),
      pending_wizard_session_id: sessionId,
      pending_wizard_session_at: new Date().toISOString(),
    })
    .eq("id", "default");
  if (upErr) throw new Error(`devCaptureStaged settings update failed: ${upErr.message}`);
}

/** Restore the SETTLED dashboard state (see cleanupStagedRow's rationale). */
async function restoreSettledSettings(): Promise<string | null> {
  try {
    const { error: restoreErr } = await admin
      .from("app_settings")
      .update({
        watched_folder_id: "seed-fixture-folder",
        watched_folder_name: "Seed fixture folder",
        watched_folder_set_by_email: "seed-mode@fxav.local",
        watched_folder_set_at: "2026-01-01T12:00:00.000Z",
        pending_folder_id: null,
        pending_folder_name: null,
        pending_folder_set_by_email: null,
        pending_folder_set_at: null,
        pending_wizard_session_id: null,
        pending_wizard_session_at: null,
      })
      .eq("id", "default");
    return restoreErr?.message ?? null;
  } catch (err) {
    return String(err);
  }
}

/** Minimal-but-renderable parse_result: the Step3 card + modal guard every
 *  missing section (spec guard conditions), so title/client suffice. */
const PARSE_RESULT = {
  show: { title: "Dev Capture Staged Show", client_label: "Dev Capture Client" },
} as unknown;

/**
 * The six Step-3 card variants (spec §2.3). Five derivation states; `needs_a_look`
 * is the warn-card presentation of `ready` (spec §1.1) — its driver is
 * `nonAmbiguityGapTotal(row) > 0`, not a distinct display state.
 */
export type GalleryVariant =
  | "ready"
  | "needs_a_look"
  | "demoted_rescan"
  | "no_details"
  | "blocking"
  | "set_aside";

export const GALLERY_VARIANTS: readonly GalleryVariant[] = [
  "ready",
  "needs_a_look",
  "demoted_rescan",
  "no_details",
  "blocking",
  "set_aside",
] as const;

export type GalleryRow = {
  driveFileId: string;
  variant: GalleryVariant;
  /** The onboarding_scan_manifest.name this row was seeded with. */
  name: string;
};

// §12.4 codes the matrix writes, spelled as literals here rather than imported:
// the race code lives in a route module (app/api/admin/onboarding/finalize/route.ts:47-48)
// and the hard-fail code is written by lib/onboarding/applyRescanDecisionUnderLock.ts:240;
// importing either would pull server-only dependencies into a Playwright helper.
const STAGED_PARSE_REVISION_RACE_DURING_FINALIZE = "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE";
const STAGED_PARSE_FAILED = "STAGED_PARSE_FAILED";

type VariantSpec = {
  /** onboarding_scan_manifest.status */
  manifestStatus: "staged" | "hard_failed" | "permanent_ignore";
  /** pending_syncs.last_finalize_failure_code */
  lastFinalizeFailureCode: string | null;
  /** The row's title. Rendered as the card headline for the clean variants
   *  (Step3SheetCard.tsx:497 prefers pr.show.title over the manifest name). */
  title: string;
  /** pending_syncs.parse_result — `null` here means the empty `{}` jsonb object
   *  (the column is `jsonb not null`), which makes hasWellFormedParseResult false. */
  parseShape: "well_formed" | "well_formed_with_gap_warning" | "empty_object";
  /** Variant 5 alone seeds pending_ingestions; the blocking card's
   *  HardFailedActions + HelpAffordance render off row.pendingIngestionId. */
  seedIngestion: boolean;
};

const VARIANT_SPECS: Record<GalleryVariant, VariantSpec> = {
  ready: {
    manifestStatus: "staged",
    lastFinalizeFailureCode: null,
    title: "Gallery Ready",
    parseShape: "well_formed",
    seedIngestion: false,
  },
  needs_a_look: {
    manifestStatus: "staged",
    lastFinalizeFailureCode: null,
    title: "Gallery Needs A Look",
    parseShape: "well_formed_with_gap_warning",
    seedIngestion: false,
  },
  demoted_rescan: {
    manifestStatus: "staged",
    lastFinalizeFailureCode: RESCAN_REVIEW_REQUIRED,
    title: "Gallery Demoted",
    parseShape: "well_formed",
    seedIngestion: false,
  },
  no_details: {
    manifestStatus: "staged",
    lastFinalizeFailureCode: STAGED_PARSE_REVISION_RACE_DURING_FINALIZE,
    title: "Gallery No Details",
    parseShape: "empty_object",
    seedIngestion: false,
  },
  blocking: {
    manifestStatus: "hard_failed",
    lastFinalizeFailureCode: null,
    title: "Gallery Blocking",
    parseShape: "well_formed",
    seedIngestion: true,
  },
  set_aside: {
    manifestStatus: "permanent_ignore",
    lastFinalizeFailureCode: null,
    title: "Gallery Set Aside",
    parseShape: "well_formed",
    seedIngestion: false,
  },
};

function parseResultJson(spec: VariantSpec): string {
  if (spec.parseShape === "empty_object") return "{}";
  const warnings =
    spec.parseShape === "well_formed_with_gap_warning"
      ? [
          {
            // A non-ambiguity GAP_CLASSES code (lib/parser/dataGaps.ts:31-32), so
            // nonAmbiguityGapTotal counts it and the card renders as a warn card.
            // Survives stripLegacyUnknownFieldAnchors (it is not an UNKNOWN_FIELD anchor).
            severity: "warn",
            code: FIELD_UNREADABLE,
            message: "Seeded gap warning",
          },
        ]
      : [];
  return JSON.stringify({
    show: { title: spec.title, client_label: "Gallery Client" },
    warnings,
  });
}

function galleryDriveFileId(variant: GalleryVariant): string {
  return `e2e-devcapture:gallery-${variant}-${randomUUID()}`;
}

/** The locked-transaction statements that seed one row. */
function seedStatements(args: {
  driveFileId: string;
  sessionId: string;
  name: string;
  parseResult: string;
  manifestStatus: string;
  lastFinalizeFailureCode: string | null;
  seedIngestion: boolean;
}): string[] {
  const failureCode =
    args.lastFinalizeFailureCode === null ? "null" : sqlString(args.lastFinalizeFailureCode);
  const statements = [
    `insert into public.pending_syncs
       (drive_file_id, source_kind, base_modified_time, staged_modified_time,
        parse_result, triggered_review_items, warning_summary, last_finalize_failure_code,
        wizard_session_id)
     values
       (${sqlString(args.driveFileId)}, 'manual', null, now(),
        ${sqlString(args.parseResult)}::jsonb, '[]'::jsonb, '', ${failureCode},
        ${sqlString(args.sessionId)}::uuid);`,
    // Step3 rows derive from onboarding_scan_manifest (status staged/applied)
    // joined to the session's pending_syncs rows — without the manifest row the
    // wizard renders no card (OnboardingWizard fetchStep3Data contract).
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values
       ('seed-fixture-folder', ${sqlString(args.sessionId)}::uuid, ${sqlString(args.driveFileId)},
        'application/vnd.google-apps.spreadsheet', ${sqlString(args.name)},
        ${sqlString(args.manifestStatus)});`,
  ];
  if (args.seedIngestion) {
    // The blocking card's real controls read row.pendingIngestionId
    // (Step3Review.tsx:599). STAGED_PARSE_FAILED is a catalog MessageCode, so
    // HelpAffordance's isKnownCode gate passes and the affordance renders.
    statements.push(
      `insert into public.pending_ingestions
         (drive_file_id, drive_file_name, last_error_code, last_error_message, wizard_session_id)
       values
         (${sqlString(args.driveFileId)}, ${sqlString(args.name)},
          ${sqlString(STAGED_PARSE_FAILED)}, 'Seeded hard fail',
          ${sqlString(args.sessionId)}::uuid);`,
    );
  }
  return statements;
}

/** The locked-transaction statements that remove one row's seeded state. */
function cleanupStatements(driveFileId: string): string[] {
  return [
    `delete from public.pending_ingestions where drive_file_id = ${sqlString(driveFileId)};`,
    `delete from public.pending_syncs where drive_file_id = ${sqlString(driveFileId)};`,
    `delete from public.onboarding_scan_manifest where drive_file_id = ${sqlString(driveFileId)};`,
  ];
}

export type SeedStagedRowOptions = {
  /** Which card variant to seed. Defaults to the legacy clean/ready row. */
  variant?: GalleryVariant;
  /** Reuse an existing reserved wizard session (the gallery seeds six rows into one). */
  sessionId?: string;
  /** Override the parsed show title. */
  title?: string;
  /** Override the manifest name. */
  name?: string;
  /** Which database to seed. Defaults to the helper's existing resolution chain. */
  dsn?: string;
  /** Skip the app_settings write (the caller owns it — gallery seeds once for six rows). */
  skipSettings?: boolean;
};

export async function seedStagedRow(options: SeedStagedRowOptions = {}): Promise<string> {
  const sessionId = options.sessionId ?? randomUUID();
  const variant = options.variant;
  const driveFileId = variant ? galleryDriveFileId(variant) : `e2e-devcapture:${randomUUID()}`;
  const dsn = options.dsn ?? databaseUrl;

  if (!options.skipSettings) {
    const { data, error } = await admin
      .from("app_settings")
      .select(SETTINGS_FIELDS.join(", "))
      .eq("id", "default")
      .maybeSingle();
    if (error) throw new Error(`devCaptureStaged settings read failed: ${error.message}`);
    priorBySession.set(sessionId, (data ?? null) as Record<string, unknown> | null);
  }
  sessionByDfid.set(driveFileId, sessionId);

  const spec = variant ? VARIANT_SPECS[variant] : null;
  const name = options.name ?? spec?.title ?? "Dev Capture Staged Show";
  const parseResult = spec
    ? parseResultJson(options.title ? { ...spec, title: options.title } : spec)
    : JSON.stringify(PARSE_RESULT);

  // Rows first, settings LAST: if the insert throws, app_settings is still
  // settled (no half-seeded wizard-pending state to strand). Both table writes
  // land in ONE locked transaction, so a failure leaves nothing behind.
  try {
    runLockedSql(
      driveFileId,
      seedStatements({
        driveFileId,
        sessionId,
        name,
        parseResult,
        manifestStatus: spec?.manifestStatus ?? "staged",
        lastFinalizeFailureCode: spec?.lastFinalizeFailureCode ?? null,
        seedIngestion: spec?.seedIngestion ?? false,
      }).join("\n"),
      `${variant ?? "staged"} row insert`,
      dsn,
    );
  } catch (err) {
    priorBySession.delete(sessionId);
    sessionByDfid.delete(driveFileId);
    throw err;
  }

  if (!options.skipSettings) {
    try {
      await assertWizardSettings(sessionId);
    } catch (err) {
      // Ambiguous transport failure: the update may or may not have committed.
      // Full cleanup (best-effort) restores the settled state either way.
      await cleanupStagedRow(driveFileId).catch(() => undefined);
      throw err;
    }
  }

  return driveFileId;
}

/** Delete one seeded row's rows under the lock. Returns collected failures. */
function deleteSeededRow(driveFileId: string, dsn: string): string[] {
  try {
    runLockedSql(driveFileId, cleanupStatements(driveFileId).join("\n"), "row cleanup", dsn);
    return [];
  } catch (err) {
    return [String(err)];
  }
}

export async function cleanupStagedRow(driveFileId: string): Promise<void> {
  // Failure-safe teardown: run EVERY step, collect failures, throw at the end -
  // an early throw must not strand the settings row in wizard-pending state.
  const errors = deleteSeededRow(driveFileId, databaseUrl);

  // Restore the SETTLED dashboard state rather than the captured prior: under
  // sibling-worktree pollution the prior snapshot may itself be a foreign
  // session's mid-onboarding state, and the spec file's afterAll restores the
  // true beforeAll prior anyway.
  const restoreErrMsg = await restoreSettledSettings();
  if (restoreErrMsg !== null) errors.push(`settings restore failed: ${restoreErrMsg}`);
  const sessionId = sessionByDfid.get(driveFileId);
  if (sessionId !== undefined) priorBySession.delete(sessionId);
  sessionByDfid.delete(driveFileId);
  if (errors.length > 0) throw new Error(`devCaptureStaged cleanup: ${errors.join("; ")}`);
}

/**
 * Seed all six Step-3 card variants into ONE reserved wizard session, so
 * `/admin?step=3` renders the whole gallery (spec §2). Each row carries a
 * distinct drive_file_id (the `pending_syncs` / manifest uniqueness is on
 * `(drive_file_id, wizard_session_id)`), and every mutation runs under that
 * row's advisory lock.
 */
export async function seedStep3StateGallery(): Promise<{
  sessionId: string;
  rows: GalleryRow[];
}> {
  const sessionId = randomUUID();
  const { data, error } = await admin
    .from("app_settings")
    .select(SETTINGS_FIELDS.join(", "))
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error(`devCaptureStaged settings read failed: ${error.message}`);
  priorBySession.set(sessionId, (data ?? null) as Record<string, unknown> | null);

  const rows: GalleryRow[] = [];
  try {
    for (const variant of GALLERY_VARIANTS) {
      const spec = VARIANT_SPECS[variant];
      const driveFileId = await seedStagedRow({
        variant,
        sessionId,
        dsn: galleryDatabaseUrl(),
        skipSettings: true,
      });
      rows.push({ driveFileId, variant, name: spec.title });
    }
    // Settings LAST, once for the whole gallery.
    await assertWizardSettings(sessionId);
  } catch (err) {
    await cleanupStep3StateGallery(rows).catch(() => undefined);
    throw err;
  }
  return { sessionId, rows };
}

export async function cleanupStep3StateGallery(rows: GalleryRow[]): Promise<void> {
  const errors: string[] = [];
  for (const row of rows) {
    errors.push(...deleteSeededRow(row.driveFileId, galleryDatabaseUrl()));
    const sessionId = sessionByDfid.get(row.driveFileId);
    if (sessionId !== undefined) priorBySession.delete(sessionId);
    sessionByDfid.delete(row.driveFileId);
  }
  const restoreErrMsg = await restoreSettledSettings();
  if (restoreErrMsg !== null) errors.push(`settings restore failed: ${restoreErrMsg}`);
  if (errors.length > 0) throw new Error(`devCaptureStaged gallery cleanup: ${errors.join("; ")}`);
}

/**
 * Seed ONE variant and immediately tear it down, invoking `probe` inside BOTH
 * transactions while each still holds the per-show advisory lock. The
 * lock-topology test uses this to observe the holder from a second connection.
 *
 * Deliberately does NOT touch app_settings: this path renders nothing, so the
 * shared local DB's wizard state stays untouched.
 */
export async function seedOneVariantWithHook(
  variant: GalleryVariant,
  probe: (driveFileId: string) => Promise<void>,
): Promise<void> {
  const sessionId = randomUUID();
  const spec = VARIANT_SPECS[variant];
  const driveFileId = galleryDriveFileId(variant);
  try {
    await runLockedSqlWithProbe(
      driveFileId,
      seedStatements({
        driveFileId,
        sessionId,
        name: spec.title,
        parseResult: parseResultJson(spec),
        manifestStatus: spec.manifestStatus,
        lastFinalizeFailureCode: spec.lastFinalizeFailureCode,
        seedIngestion: spec.seedIngestion,
      }),
      `${variant} hooked seed`,
      galleryDatabaseUrl(),
      probe,
    );
  } finally {
    await runLockedSqlWithProbe(
      driveFileId,
      cleanupStatements(driveFileId),
      `${variant} hooked cleanup`,
      galleryDatabaseUrl(),
      probe,
    );
  }
}

export async function openStep3Modal(page: Page, driveFileId: string): Promise<void> {
  const sessionId = sessionByDfid.get(driveFileId);
  if (sessionId === undefined) throw new Error("openStep3Modal: unknown driveFileId");
  const more = page.getByTestId(`wizard-step3-card-${driveFileId}-more`);
  let lastErr: unknown = null;
  // 10 short attempts beat 4 long ones: the observed local wipe cadence is
  // ~30-60 s (external admin actors on the shared DB), so each assert+goto
  // must land inside a wipe-free window. CI is isolated and passes first try.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await assertWizardSettings(sessionId); // re-assert against sibling wipes
    await page.goto("/admin?step=3");
    try {
      await expect(more).toBeVisible({ timeout: 3_000 });
      await more.click();
      await page.waitForSelector("[data-step3-review-panel]");
      return;
    } catch (err) {
      lastErr = err;
      const { data: w, error: wErr } = await admin
        .from("app_settings")
        .select("pending_wizard_session_id, watched_folder_id")
        .eq("id", "default")
        .maybeSingle();
      console.error(
        `attempt ${attempt}: settings=${JSON.stringify(w)} settingsErr=${wErr?.message ?? "none"} body0=${(await page.innerText("body")).slice(0, 60).replace(/\n/g, "|")}`,
      );
    }
  }
  console.error("openStep3Modal final-fail body:", (await page.innerText("body")).slice(0, 700));
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
