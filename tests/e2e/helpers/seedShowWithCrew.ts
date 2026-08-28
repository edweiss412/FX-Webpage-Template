/**
 * tests/e2e/helpers/seedShowWithCrew.ts (M11.5-PLAYWRIGHT-HELPERS)
 *
 * Service-role seed helper for the picker-flow Playwright suite. Writes a
 * fully-resolvable crew route — `shows` + `crew_members` + `show_share_tokens`
 * — so the tokenized URL `/show/<slug>/<shareToken>` resolves through
 * `resolve_show_by_slug_and_token` (a SECURITY DEFINER join over both tables,
 * supabase/migrations/20260523000005_resolve_show_by_slug_and_token.sql).
 *
 * Resolvability contract (lib/auth/picker/resolveShowPageAccess.ts):
 *   - the slug+token pair must join in `show_share_tokens` (a row is created
 *     for us — see below)
 *   - the show must be `published=true` AND `archived=false` (table defaults;
 *     we leave them at default unless the caller overrides) so the route
 *     reaches the picker chain rather than 404 / unpublished.
 *
 * share_token provenance: an AFTER INSERT trigger on `shows`
 * (shows_create_share_token_after_insert → create_share_token_for_show) ALWAYS
 * creates the `show_share_tokens` row with a random 64-hex default token. So we
 * do NOT insert that row ourselves (it would collide on the show_id PK); we
 * UPDATE it to the caller's token (when supplied) and read the effective token
 * back. share_token shape `^[0-9a-f]{64}$` is enforced by a CHECK constraint
 * (show_share_tokens_share_token_check); freshShareToken() satisfies it.
 *
 * AGENTS invariant 9 (Supabase call-boundary): every PostgREST call destructures
 * { data, error } and throws with context — a silent failed insert would
 * leave a half-seeded show that satisfies some assertions and hides the bug.
 *
 * AGENTS invariant 2 (M-wave 2 W-E2E, spec 2026-08-09-m-wave-2-design §2.4):
 * the locked-table writes — the `shows` purge, the `shows` insert, and the
 * `crew_members` insert — run inside ONE psql transaction holding
 * `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))`, the
 * lockedCrewRestriction pattern (its header explains the single-transaction
 * shape and why per-helper copies of it are the bug). Single-holder: this
 * transaction is the only lock holder on this path — nothing wraps it. The
 * `show_share_tokens` update/read stays on the PostgREST admin client: that
 * table is not lock-governed (invariant 2 names shows / crew_members /
 * pending_syncs / pending_ingestions and the dropped M9.5 auth table this
 * comment deliberately does not spell), and it runs after
 * the seeding transaction committed.
 */
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import type { DateRestriction, ShowRow, StageRestriction } from "@/lib/parser/types";
import { psqlChildEnv, resolvePsqlTarget } from "./psqlTarget";
import { admin } from "./supabaseAdmin";

export type SeedCrewMemberInput = {
  /** Defaults to a fresh UUID; pass one when the test needs to reference it (e.g. picker cookie entry). */
  id?: string;
  name: string;
  role: string;
  /** Optional canonical email so a Google-session match (validateGoogleSession) resolves to this row. */
  email?: string | null;
  roleFlags?: string[];
  /** ISO timestamp; when set the picker renders this row as claimed (data-claimed="true"). */
  claimedViaOauthAt?: string | null;
  /**
   * crew_members.stage_restriction jsonb. Omit → column left NULL (getShowForViewer
   * decodes NULL as {kind:'none'}). Set {kind:'explicit',stages:[...]} to seed a
   * stage-restricted crew member (the stage-filtered-schedule #248 surface).
   */
  stageRestriction?: StageRestriction | null;
  /** crew_members.date_restriction jsonb. Omit → column left NULL ({kind:'none'} on read). */
  dateRestriction?: DateRestriction | null;
};

export type SeededCrewMember = {
  id: string;
  name: string;
  role: string;
  email: string | null;
  claimedViaOauthAt: string | null;
};

export type SeedShowWithCrewOptions = {
  /** Stable identifier so re-runs can purge prior residue; defaults to a unique value. */
  driveFileId?: string;
  /** URL slug path segment; defaults to a unique value. */
  slug?: string;
  title?: string;
  clientLabel?: string;
  templateVersion?: string;
  /** 64-hex share token; defaults to the trigger-minted one (read back). */
  shareToken?: string;
  published?: boolean;
  archived?: boolean;
  pickerEpoch?: number;
  /**
   * shows.dates jsonb ({travelIn,set,showDays[],travelOut}). Omit → column left
   * NULL (getShowForViewer falls back to an all-null dates → zero day cards). Set
   * it to render a real Schedule timeline (e.g. the stage-filtered-schedule e2e).
   */
  dates?: ShowRow["dates"];
  /** shows.agenda_links jsonb. Omit → column left NULL (getShowForViewer decodes to []). */
  agendaLinks?: ShowRow["agenda_links"];
  /**
   * shows.event_details jsonb (the parsed sheet's event-detail fields). Omit →
   * column left NULL, and `EventDetailsBreakdown` filters every group out, so
   * the review modal renders no event-detail section at all
   * (components/admin/wizard/step3ReviewSections.tsx:2216-2221). Set it to
   * render real groups — e.g. the font-binding row measurement, which needs a
   * non-empty "Wardrobe & key moments" group.
   *
   * Carried on this helper's EXISTING insert rather than a follow-up write from
   * the caller: a separate PostgREST write at a call site would be a NEW
   * unlocked mutation path against a lock-governed table (AGENTS.md invariant
   * 2) and a new Supabase call boundary (invariant 9). Adding a column to the
   * insert this helper already performs adds neither.
   */
  eventDetails?: ShowRow["event_details"];
  crew?: SeedCrewMemberInput[];
  /**
   * shows_internal seed, written INSIDE the same locked transaction as the show
   * insert. `runOfShow` lands in shows_internal.run_of_show — the per-day agenda
   * store resolveKeyTimes reads for the RightNow hero's per-day Show anchors.
   * `parseWarnings` lands in shows_internal.parse_warnings, the array the review
   * modal routes into section warnings and, since
   * 2026-08-27-wizard-review-attention-menu, counts on the header pill.
   * Omit → no shows_internal row (getShowForViewer projects runOfShow: null).
   */
  internal?: { runOfShow?: unknown; parseWarnings?: unknown };
};

export type SeededShow = {
  showId: string;
  slug: string;
  shareToken: string;
  driveFileId: string;
  pickerEpoch: number;
  crew: SeededCrewMember[];
};

/** A 64-lowercase-hex token satisfying show_share_tokens_share_token_check. */
export function freshShareToken(): string {
  return randomBytes(32).toString("hex");
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlJsonbOrNull(value: unknown): string {
  return value == null ? "null" : `${sqlString(JSON.stringify(value))}::jsonb`;
}

function sqlTextOrNull(value: string | null | undefined): string {
  return value == null ? "null" : sqlString(value);
}

/** crew_members.role_flags is text[], not jsonb — encode as an array literal. */
function sqlTextArray(values: string[]): string {
  if (values.length === 0) return "'{}'::text[]";
  return `array[${values.map(sqlString).join(", ")}]::text[]`;
}

/**
 * The ONE locked seeding transaction (invariant 2): begin -> advisory lock on
 * the show -> statements -> commit. Statements run in caller order under the
 * held lock; the lock is acquired BEFORE the first write and released only by
 * the commit after the last. Same psql target discipline as
 * lockedCrewRestriction (resolved at spawn, remote refused by name, child env
 * scrubbed so PG* variables cannot retarget libpq behind the validated DSN).
 */
/**
 * Build the ONE locked-transaction SQL (exported for the unit pin, review r1
 * F1): begin -> per-show advisory lock -> caller statements -> commit, in that
 * order BY CONSTRUCTION. Caller statements may not smuggle their own
 * transaction control — a statement containing top-level BEGIN/COMMIT/ROLLBACK
 * is refused, so "commit before the writes" cannot be expressed through this
 * builder at all (the reviewer's escaping-mutant class).
 */
export function lockedSeedTxSql(driveFileId: string, statements: string[]): string {
  for (const st of statements) {
    if (/\b(begin|commit|rollback)\b/i.test(st)) {
      throw new Error(
        "lockedSeedTxSql: a caller statement may not contain transaction control " +
          "(begin/commit/rollback) — the builder owns the transaction shape",
      );
    }
  }
  return [
    "begin;",
    `select pg_advisory_xact_lock(hashtext('show:' || ${sqlString(driveFileId)}));`,
    ...statements,
    "commit;",
  ].join("\n");
}

function runLockedSeedTx(driveFileId: string, statements: string[], context: string): string {
  const sql = lockedSeedTxSql(driveFileId, statements);
  // Deliberately NOT TEST_DATABASE_URL (the devCaptureStaged precedent): this
  // helper's hazard is a SPLIT TARGET, not merely a remote one. The token
  // read-back below and every consumer suite's PostgREST admin client resolve
  // the loopback SUPABASE_URL stack, so the locked psql writes must land on the
  // SAME database — honoring an ambient validation TEST_DATABASE_URL would seed
  // one database and read another (or, with the refusal, fail every consumer
  // under the canonical .env.local, which is what the first full crew run
  // measured on 2026-08-10). The resolver falls through to the loopback default.
  const dsn = resolvePsqlTarget({ caller: "seedShowWithCrew" });
  try {
    return execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-At", dsn], {
      input: sql,
      encoding: "utf8",
      // honorRemoteOptIn: false, deliberately (review r1 F2): this helper's DSN
      // resolver never honors the remote opt-in — it is loopback-only by the
      // split-target rationale above — so the child env must not either. With
      // the opt-in honored, LOCKED_FIXTURE_ALLOW_REMOTE=1 would keep ambient
      // PG* variables (probe: PGHOST=192.0.2.2 survived) and libpq could send
      // the locked writes somewhere other than the loopback DSN psql was given.
      env: psqlChildEnv({ honorRemoteOptIn: false }),
    });
  } catch (err) {
    throw new Error(
      `seedShowWithCrew: locked ${context} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Purge any prior show seeded under `driveFileId` (and its FK-cascading
 * crew_members / show_share_tokens rows) so re-runs start clean. Idempotent.
 * Locked (invariant 2): the delete mutates `shows` and runs under the per-show
 * advisory lock like every other writer of that hashkey.
 */
export async function deleteSeededShow(driveFileId: string): Promise<void> {
  runLockedSeedTx(
    driveFileId,
    [`delete from public.shows where drive_file_id = ${sqlString(driveFileId)};`],
    `deleteSeededShow(${driveFileId})`,
  );
}

export async function seedShowWithCrew(options: SeedShowWithCrewOptions = {}): Promise<SeededShow> {
  const driveFileId = options.driveFileId ?? `picker-e2e:${randomUUID()}`;
  const slug = options.slug ?? `picker-e2e-${randomUUID().slice(0, 8)}`;
  const pickerEpoch = options.pickerEpoch ?? 1;

  const showId = randomUUID();
  const crewInput = options.crew ?? [];
  const crewRows = crewInput.map((c) => ({
    id: c.id ?? randomUUID(),
    name: c.name,
    role: c.role,
    email: c.email ?? null,
    roleFlags: c.roleFlags ?? [],
    claimedViaOauthAt: c.claimedViaOauthAt ?? null,
    stageRestriction: c.stageRestriction ?? null,
    dateRestriction: c.dateRestriction ?? null,
  }));

  // ONE locked transaction (invariant 2): purge residue, insert the show, insert
  // the crew — all under the held show lock. FK ON DELETE CASCADE clears prior
  // crew_members + show_share_tokens on the purge; the AFTER INSERT trigger mints
  // the new show_share_tokens row inside this same transaction.
  const statements: string[] = [
    `delete from public.shows where drive_file_id = ${sqlString(driveFileId)};`,
    `insert into public.shows
       (id, drive_file_id, slug, title, client_label, template_version,
        published, archived, picker_epoch, dates, agenda_links, event_details)
     values
       (${sqlString(showId)}::uuid, ${sqlString(driveFileId)}, ${sqlString(slug)},
        ${sqlString(options.title ?? "Picker E2E Show")},
        ${sqlString(options.clientLabel ?? "Picker E2E Client")},
        ${sqlString(options.templateVersion ?? "v1")},
        ${options.published ?? true}, ${options.archived ?? false}, ${pickerEpoch},
        ${sqlJsonbOrNull(options.dates ?? null)},
        ${sqlJsonbOrNull(options.agendaLinks ?? null)},
        ${sqlJsonbOrNull(options.eventDetails ?? null)});`,
  ];
  for (const row of crewRows) {
    statements.push(
      `insert into public.crew_members
         (id, show_id, name, role, email, role_flags, claimed_via_oauth_at,
          stage_restriction, date_restriction)
       values
         (${sqlString(row.id)}::uuid, ${sqlString(showId)}::uuid, ${sqlString(row.name)},
          ${sqlString(row.role)}, ${sqlTextOrNull(row.email)},
          ${sqlTextArray(row.roleFlags)},
          ${row.claimedViaOauthAt == null ? "null" : `${sqlString(row.claimedViaOauthAt)}::timestamptz`},
          ${sqlJsonbOrNull(row.stageRestriction)}, ${sqlJsonbOrNull(row.dateRestriction)});`,
    );
  }
  if (options.internal !== undefined) {
    statements.push(
      // The parse_warnings column is emitted ONLY when a caller supplies it:
      // the column defaults to '[]'::jsonb, and naming it unconditionally would
      // write NULL over that default for every existing caller.
      options.internal.parseWarnings === undefined
        ? `insert into public.shows_internal (show_id, run_of_show)
       values (${sqlString(showId)}::uuid, ${sqlJsonbOrNull(options.internal.runOfShow ?? null)});`
        : `insert into public.shows_internal (show_id, run_of_show, parse_warnings)
       values (${sqlString(showId)}::uuid, ${sqlJsonbOrNull(options.internal.runOfShow ?? null)}, ${sqlJsonbOrNull(options.internal.parseWarnings)});`,
    );
  }
  runLockedSeedTx(driveFileId, statements, `seed (${driveFileId})`);

  // The AFTER INSERT trigger already created the show_share_tokens row. Set the
  // token to the caller's value when supplied; otherwise read the minted one.
  let shareToken: string;
  if (options.shareToken) {
    const { data, error } = await admin
      .from("show_share_tokens")
      .update({ share_token: options.shareToken })
      .eq("show_id", showId)
      .select("share_token");
    if (error) throw new Error(`seedShowWithCrew share_token update failed: ${error.message}`);
    if (!data || data.length === 0)
      throw new Error("seedShowWithCrew: trigger did not create a show_share_tokens row");
    shareToken = data[0]!.share_token as string;
  } else {
    const { data, error } = await admin
      .from("show_share_tokens")
      .select("share_token")
      .eq("show_id", showId)
      .maybeSingle();
    if (error) throw new Error(`seedShowWithCrew share_token read failed: ${error.message}`);
    if (!data?.share_token)
      throw new Error("seedShowWithCrew: trigger did not create a show_share_tokens row");
    shareToken = data.share_token as string;
  }

  // The seeded rows equal their inputs by construction (ids minted above, values
  // written verbatim in the locked transaction; ON_ERROR_STOP would have thrown
  // on any refused row), so the return is built from the same data.
  const crew: SeededCrewMember[] = crewRows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    email: row.email,
    claimedViaOauthAt: row.claimedViaOauthAt,
  }));

  return { showId, slug, shareToken, driveFileId, pickerEpoch, crew };
}
