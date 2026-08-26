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
import { psqlChildEnv, resolvePsqlTarget } from "./psqlTarget";

// Locked-fixture transport (helpers/lockedCrewRestriction.ts pattern): every
// pending_syncs mutation runs in a psql transaction holding the per-show
// advisory lock — tests/help/walker-routes.test.ts forbids unlocked PostgREST
// DML on locked tables under tests/e2e/.
//
// The module-level `databaseUrl` constant this file used to carry is GONE: it
// captured `TEST_DATABASE_URL ?? DATABASE_URL ?? default` at import, which is
// BL-LOCKED-FIXTURE-HELPER-TARGETS-REMOTE-DB. Every DSN entry point below —
// the `runLockedSql` default, an explicit `seedStagedRow({ dsn })` argument,
// and the postgres-js probe transport — now resolves through the ONE shared
// resolver in ./psqlTarget, so no caller can route around it.

/**
 * The query-parameter contract now lives in the shared resolver as a true
 * ACCEPT-SET (`PSQL_QUERY_PARAM_ACCEPT_SET`), not as the seven-name denylist
 * that used to live here.
 *
 * The denylist was correct about every name it held — a live probe drove
 * `?host=` and `?hostaddr=` past a hostname-only guard, and `?service=` steered
 * a loopback authority to 192.0.2.3 out of an external service file — but a
 * denylist accepts whatever it did not model, and libpq keeps adding
 * parameters. The accept-set refuses every parameter outside
 * `connect_timeout` / `application_name` / `sslmode` BY NAME, which is strictly
 * tighter: each of those seven is still refused, and so is the eighth nobody
 * has written down yet.
 */

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
 * observe CLI's `--env` guardrail). FIVE independent rejections — each one was
 * an escape that a live probe drove past the guard as it stood, so none of them
 * is implied by the others:
 *
 *   1. ANY libpq authority-override query parameter. These beat the URI's own
 *      authority, so an accepted-looking loopback URI can still connect to a
 *      remote host, a different database, or as a different role.
 *   2. a non-loopback hostname;
 *   3. a loopback host on a port that is NOT the local Supabase database. Not a
 *      remote-write hazard — a SPLIT-TARGET hazard: DML would land in some other
 *      local Postgres while the wizard session, the readback, and the rendered
 *      page stay on the Supabase instance, and the gallery would come up empty
 *      with nothing to point at;
 *   4. the right host and port on the wrong DATABASE (the URI path);
 *   5. a DSN that is not self-contained, since `galleryPsqlEnv()` strips
 *      PGPASSWORD and an ambient-credential DSN would fail far from here.
 *
 * The transport is hardened alongside the DSN: `galleryPsqlEnv()` removes every
 * PG* variable, and psql runs with `-X`. A validated DSN is necessary but not
 * sufficient — libpq also reads the environment and startup files.
 */
export function galleryDatabaseUrl(dsn?: string): string {
  return resolvePsqlTarget({
    caller: "devCaptureStaged",
    ...(dsn === undefined ? {} : { dsn }),
    // Deliberately NOT TEST_DATABASE_URL. The gallery's hazard is a SPLIT
    // TARGET, not only a remote one: `supabaseAdmin`, the readback and the
    // rendered page all resolve the loopback `SUPABASE_URL`, so honoring the
    // validation pooler here would seed one database and read another.
    envVars: ["DATABASE_URL"],
    requireLocalSupabase: true,
    // …and for the same reason the remote opt-in does not apply. Deliberately
    // targeting a remote database does not make the split safe, so migrating
    // onto the shared resolver turns nothing this file refused into an
    // acceptance.
    honorRemoteOptIn: false,
  });
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
  return psqlChildEnv({ source, honorRemoteOptIn: false });
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function lockStatement(driveFileId: string): string {
  return `select pg_advisory_xact_lock(hashtext('show:' || ${sqlString(driveFileId)}));`;
}

function runLockedSql(driveFileId: string, body: string, label: string, dsn?: string): void {
  // An explicit dsn argument is validated exactly like the env-derived default.
  // An argument path that skipped the resolver would reopen the whole class
  // through the caller (spec §2.6).
  const target = galleryDatabaseUrl(dsn);
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
    execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-At", target], {
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
  // The postgres-js transport is a DIFFERENT door onto the same target, so it
  // gets the same validation — a resolver that only guarded the psql spawn
  // would leave this one open.
  const sql = postgres(galleryDatabaseUrl(dsn), { max: 1 });
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

/**
 * Optional parse-preview content a caller can add on top of a variant's base
 * parse_result. Every field is OMITTED from the emitted JSON when absent, so a
 * caller that passes nothing gets byte-identical output to before this existed.
 *
 * Added for the tap-target inline-controls layout spec, whose render premises
 * need review-section content the gallery variants never seeded: a pack case
 * past `PACK_LIST_ITEMS_CAP` (which is what makes the "Show all N items" tail
 * toggle exist at all) and a transport contact carrying phone + email (the
 * `tel:` / `mailto:` links render only for populated fields).
 */
export type SeedPreviewExtras = {
  /**
   * Seed ONE pull-sheet case holding this many items. Pass a number ABOVE
   * `PACK_LIST_ITEMS_CAP` (8) to make the overflow toggle render — at or below
   * it the tail `<li>` does not exist.
   */
  packCaseItems?: number;
  /** Driver phone, as-parsed. Renders the `tel:` link in the transport cell. */
  driverPhone?: string;
  /** Driver email, as-parsed. Renders the `mailto:` link in the same cell. */
  driverEmail?: string;
  /**
   * Vehicle description, as-parsed. Renders a SECOND, short transport cell
   * beside the contact cell — the row-mate whose height the `items-start`
   * assertion compares against (spec 2026-08-15-step3-tap-cluster §3.5). It
   * works on its own, not only when it rides beside a contact: the
   * `transportation` key's inclusion predicate below counts it.
   */
  vehicle?: string;
};

function packSheetCases(count: number): unknown {
  return [
    {
      caseLabel: "Tap Floor Case",
      items: Array.from({ length: count }, (_, i) => ({
        qty: 1,
        cat: "AUDIO",
        subCat: null,
        item: `Seeded pack item ${i + 1}`,
      })),
    },
  ];
}

function transportationRow(preview: SeedPreviewExtras): unknown {
  return {
    driver_name: "Tap Floor Driver",
    driver_phone: preview.driverPhone ?? null,
    driver_email: preview.driverEmail ?? null,
    loadout_name: null,
    loadout_phone: null,
    loadout_email: null,
    vehicle: preview.vehicle ?? null,
    license_plate: null,
    color: null,
    parking: null,
    schedule: [],
    notes: null,
  };
}

function parseResultJson(spec: VariantSpec, preview?: SeedPreviewExtras): string {
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
  // Every field that produces a transport cell counts here, not just the two
  // contact ones: gating on contacts alone would make a vehicle-only caller
  // silently emit no `transportation` key at all, and the test would then fail
  // on a missing cell rather than on the geometry it is measuring.
  const hasTransport =
    preview?.driverPhone !== undefined ||
    preview?.driverEmail !== undefined ||
    preview?.vehicle !== undefined;
  return JSON.stringify({
    show: { title: spec.title, client_label: "Gallery Client" },
    warnings,
    ...(preview?.packCaseItems !== undefined
      ? { pullSheet: packSheetCases(preview.packCaseItems) }
      : {}),
    ...(hasTransport ? { transportation: transportationRow(preview) } : {}),
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
  /**
   * Extra parse-preview content (pack case, transport contact). Only meaningful
   * with a `variant` — the variant-less legacy row uses the fixed minimal
   * PARSE_RESULT. Absent = byte-identical parse_result to before this option.
   */
  preview?: SeedPreviewExtras;
};

export async function seedStagedRow(options: SeedStagedRowOptions = {}): Promise<string> {
  const sessionId = options.sessionId ?? randomUUID();
  const variant = options.variant;
  const driveFileId = variant ? galleryDriveFileId(variant) : `e2e-devcapture:${randomUUID()}`;
  const dsn = galleryDatabaseUrl(options.dsn);

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
    ? parseResultJson(options.title ? { ...spec, title: options.title } : spec, options.preview)
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
  const errors = deleteSeededRow(driveFileId, galleryDatabaseUrl());

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

/** Budget for the panel entrance. The animation itself is 220ms at the mobile
 *  viewport (`--duration-normal`, app/globals.css:285); this is a loud-failure
 *  ceiling, not a sleep. */
const ENTRANCE_SETTLE_BUDGET_MS = 5_000;

/**
 * Hand the page back only once the review panel has FINISHED animating in.
 *
 * WHY. `waitForSelector("[data-step3-review-panel]")` resolves when the panel
 * enters the DOM, which is the instant its CSS entrance animation STARTS:
 * `step3-details-sheet-rise` over `--duration-normal` (220ms) at the mobile
 * viewport, `step3-details-pop-in` over `--duration-fast` (120ms) at >=640px
 * (app/globals.css:977-991, :917-945, :284-285). A `getBoundingClientRect`
 * taken inside that window returns rects that are internally inconsistent
 * between the transformed panel and its descendants.
 *
 * MEASURED (2026-08-25, 39 runs x 14 reads at 40ms on one head under CI
 * posture, spec docs/superpowers/specs/2026-08-25-e2e-proof-retired-route-subpixel-design.md §3):
 * 537 of 546 reads were bit-identical; all 9 outliers fell within 120ms of the
 * panel appearing and none after. 3 of 39 runs had a bad FIRST read — the 7.7%
 * flake BL-TAP-TARGET-LAYOUT-SUBPIXEL-TOLERANCE was filed on. One outlier was a
 * NEGATIVE 0.290px inset, which no font metric can produce; that is what ruled
 * out the rasterisation hypothesis and pointed here instead.
 *
 * PLACED ON THE HELPER, not on the call sites, so it is a DERIVED cover: every
 * present and future caller of `openStep3Modal` inherits it and a newly added
 * measurement cannot forget it (AGENTS.md class-sweep — sweep to a derivation,
 * not an enumeration; the same reasoning as `rectOf` in crew-page.spec.ts:226).
 *
 * `document.fonts.ready` is settled here too. It is NOT the fix for the defect
 * above and is not redundant with it: it closes the separate fallback-frame arm
 * that tests/e2e/_metaFontWaitCoverage.test.ts exists for, on a helper that
 * navigates and whose callers measure.
 */
async function settleReviewPanelEntrance(page: Page): Promise<void> {
  const unfinished = await page.evaluate(async (budgetMs: number) => {
    const panel = document.querySelector("[data-step3-review-panel]");
    if (!panel) return ["the panel vanished before its entrance could settle"];
    const running = panel.getAnimations({ subtree: true });
    // `.catch` per animation: a CANCELLED animation rejects `finished`, and a
    // cancelled entrance is settled for our purposes — it is not still moving.
    const settled = await Promise.race([
      Promise.all(running.map((a) => a.finished.catch(() => undefined))).then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), budgetMs)),
    ]);
    if (settled) return [];
    return panel
      .getAnimations({ subtree: true })
      .filter((a) => a.playState === "running")
      .map((a) => ("animationName" in a ? String(a.animationName) : "unnamed"));
  }, ENTRANCE_SETTLE_BUDGET_MS);
  if (unfinished.length > 0) {
    // Loud, not a silent continue: an entrance that never finishes means every
    // downstream measurement is unsound, and a timeout that shrugged would put
    // us back where the flake started.
    throw new Error(
      `openStep3Modal: review panel entrance did not settle within ${ENTRANCE_SETTLE_BUDGET_MS}ms ` +
        `(still running: ${unfinished.join(", ")})`,
    );
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
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
      await settleReviewPanelEntrance(page);
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
