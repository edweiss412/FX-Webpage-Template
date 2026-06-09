/**
 * Phase-4 (undo & tombstone) DB-test harness.
 *
 * Unlike the Phase-2 hold-aware testkit (which runs everything inside one rollback txn), Phase-4
 * tests COMMIT their seed + auto-apply so a SEPARATE authed-admin connection can call the
 * `undo_change` SECURITY DEFINER RPC against committed rows (the RPC takes a per-show advisory lock
 * and re-reads under it — a never-committed row would be invisible to the second connection). Every
 * seeded show uses a unique `drive_file_id`; `shows` cascades on delete, so leftover rows are
 * harmless across runs and a per-show cleanup keeps the table tidy.
 *
 * `runAutoApply` drives the REAL Phase-2 auto-apply (`runPhase2`) through the same focused
 * real-postgres adapter the Phase-2 tests use — so `before_image` / hold writes / change-log rows
 * are produced by production code, not re-implemented here.
 */
import { randomUUID } from "node:crypto";

import postgres, { type Sql, type TransactionSql } from "postgres";

import type { CrewMemberRow, ParseResult, TriggeredReviewItem } from "@/lib/parser/types";
import { runPhase2 } from "@/lib/sync/phase2";

import { crew as crewRow, parseResult as buildParseResult, phase2Tx } from "@/tests/sync/_holdAwareTestkit";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// is_admin() reads app_metadata.role from auth.jwt(); auth_email_canonical() reads `email`.
const ADMIN_CLAIMS = JSON.stringify({
  sub: "00000000-0000-0000-0000-000000000020",
  email: "dlarson@fxav.net",
  app_metadata: { role: "admin" },
});
export const ADMIN_EMAIL = "dlarson@fxav.net";

const NON_ADMIN_CLAIMS = JSON.stringify({
  sub: "00000000-0000-0000-0000-000000000099",
  email: "crew@example.com",
  app_metadata: { role: "crew" },
});

const sql: Sql = postgres(DB_URL, { max: 6, prepare: false });
export const holdsSql: Sql = sql;
export const newHoldsConn = (): Sql => postgres(DB_URL, { max: 1, prepare: false });

export async function closeHoldsHelpers(): Promise<void> {
  await sql.end({ timeout: 5 });
}

export type CrewSeed = {
  name: string;
  email: string | null;
  phone?: string | null;
  role?: string;
  /** true → now(); a timestamptz string → that value; false/undefined → null (never claimed). */
  claimed?: boolean | string;
};

export type SeededHoldsShow = { showId: string; driveFileId: string };

/** Seed a published show + the given crew. COMMITS (Phase-4 RPC reads committed rows). */
export async function seedShowWithCrew(crew: CrewSeed[]): Promise<SeededHoldsShow> {
  const driveFileId = `drv-${randomUUID()}`;
  const slug = `sh-${randomUUID().slice(0, 8)}`;
  const [row] = await sql`
    insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
    values (${driveFileId}, ${slug}, 'T', 'c', 'v', true)
    returning id`;
  const showId = row!.id as string;
  for (const member of crew) {
    const claim =
      member.claimed === true
        ? sql`now()`
        : typeof member.claimed === "string"
          ? sql`${member.claimed}::timestamptz`
          : null;
    await sql`
      insert into public.crew_members
        (show_id, name, email, phone, role, role_flags, date_restriction, stage_restriction,
         flight_info, claimed_via_oauth_at)
      values (${showId}, ${member.name}, ${member.email}, ${member.phone ?? "555-OLD"},
              ${member.role ?? "A1"}, ${["A1"]}, ${sql.json({ kind: "none" })},
              ${sql.json({ kind: "none" })}, null, ${claim})`;
  }
  return { showId, driveFileId };
}

export type AutoApplyInput = {
  crew: CrewSeed[];
  /** Optional triggered review items (e.g. an MI-12 rename so a crew_renamed feed row is written). */
  triggeredItems?: TriggeredReviewItem[];
  modifiedTime?: string;
};

let autoApplyClock = Date.parse("2026-06-08T12:00:00.000Z");

function toCrewRow(member: CrewSeed): CrewMemberRow {
  return crewRow(member.name, {
    email: member.email,
    phone: member.phone ?? "555-OLD",
    role: member.role ?? "A1",
  });
}

/**
 * Drive a real Phase-2 auto-apply of the given sheet state. COMMITS. `modifiedTime` auto-increments
 * across calls so the staleness guard accepts each successive sync.
 */
export async function runAutoApply(driveFileId: string, input: AutoApplyInput): Promise<void> {
  const modifiedTime = input.modifiedTime ?? new Date((autoApplyClock += 60_000)).toISOString();
  const next: ParseResult = buildParseResult(input.crew.map(toCrewRow));
  await sql.begin(async (tx) => {
    await runPhase2(phase2Tx(tx as unknown as Sql) as never, {
      driveFileId,
      mode: "cron" as const,
      fileMeta: {
        driveFileId,
        name: "Sheet",
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime,
        parents: ["f"],
      },
      parseResult: next,
      binding: { bindingToken: "tok", modifiedTime },
      verifyReelOnApply: false as const,
      mi11Items: [] as never,
      notableItems: (input.triggeredItems ?? []) as TriggeredReviewItem[],
    });
  });
}

export type ChangeLogRow = {
  id: string;
  source: string;
  change_kind: string;
  entity_ref: string | null;
  summary: string;
  before_image: Record<string, unknown> | null;
  after_image: Record<string, unknown> | null;
  status: string;
  created_by: string;
  undo_of: string | null;
};

/** Read change-log rows for a show, optionally filtered by change_kind / entity_ref. */
export async function readChangeLog(
  showId: string,
  filter?: { change_kind?: string; entity_ref?: string; status?: string },
): Promise<ChangeLogRow & { all: ChangeLogRow[] }>;
export async function readChangeLog(showId: string): Promise<ChangeLogRow & { all: ChangeLogRow[] }>;
export async function readChangeLog(
  showId: string,
  filter?: { change_kind?: string; entity_ref?: string; status?: string },
): Promise<ChangeLogRow & { all: ChangeLogRow[] }> {
  const all = (await sql`
    select id, source, change_kind, entity_ref, summary, before_image, after_image, status,
           created_by, undo_of
      from public.show_change_log where show_id = ${showId}
      order by occurred_at, change_kind, entity_ref`) as unknown as ChangeLogRow[];
  if (!filter) {
    const [first] = all;
    return { ...(first ?? ({} as ChangeLogRow)), all };
  }
  const match = all.find(
    (r) =>
      (filter.change_kind === undefined || r.change_kind === filter.change_kind) &&
      (filter.entity_ref === undefined || r.entity_ref === filter.entity_ref) &&
      (filter.status === undefined || r.status === filter.status),
  );
  return { ...(match ?? ({} as ChangeLogRow)), all };
}

export type CrewMemberDbRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  role_flags: string[];
  date_restriction: unknown;
  stage_restriction: unknown;
  flight_info: string | null;
  last_changed_at: string | Date | null;
  claimed_via_oauth_at: string | Date | null;
};

/** Read crew rows for a show (alphabetical by name). */
export async function readCrew(showId: string): Promise<CrewMemberDbRow[]> {
  return (await sql`
    select id, name, email, phone, role, role_flags, date_restriction, stage_restriction,
           flight_info, last_changed_at, claimed_via_oauth_at
      from public.crew_members where show_id = ${showId} order by name`) as unknown as CrewMemberDbRow[];
}

export async function readCrewByName(showId: string, name: string): Promise<CrewMemberDbRow | null> {
  const rows = await readCrew(showId);
  return rows.find((r) => r.name === name) ?? null;
}

export type SyncHoldRow = {
  id: string;
  entity_key: string;
  kind: string;
  domain: string;
  held_value: Record<string, unknown>;
  proposed_value: Record<string, unknown> | null;
  base_modified_time: string | null;
};

export async function readHold(
  showId: string,
  filter: { entity_key: string },
): Promise<SyncHoldRow | null> {
  const [row] = (await sql`
    select id, entity_key, kind, domain, held_value, proposed_value, base_modified_time
      from public.sync_holds where show_id = ${showId} and entity_key = ${filter.entity_key}
      limit 1`) as unknown as SyncHoldRow[];
  return row ?? null;
}

export async function readHoldsByShow(showId: string): Promise<SyncHoldRow[]> {
  return (await sql`
    select id, entity_key, kind, domain, held_value, proposed_value, base_modified_time
      from public.sync_holds where show_id = ${showId} order by entity_key`) as unknown as SyncHoldRow[];
}

/** Run `body` as role=authenticated with ADMIN JWT claims (the real PostgREST authed-admin path). */
export async function asAdminTx<T>(body: (tx: TransactionSql) => Promise<T>, conn: Sql = sql): Promise<T> {
  return conn.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true)`;
    await tx`select set_config('request.jwt.claims', ${ADMIN_CLAIMS}, true)`;
    return body(tx);
  }) as Promise<T>;
}

export async function asNonAdminTx<T>(body: (tx: TransactionSql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true)`;
    await tx`select set_config('request.jwt.claims', ${NON_ADMIN_CLAIMS}, true)`;
    return body(tx);
  }) as Promise<T>;
}

export type UndoResult = { ok: boolean; code?: string; entity?: string };

/** Call undo_change(p_change_log_id) via the authed-admin path; returns the jsonb result. */
export async function callUndoAsAdmin(changeLogId: string): Promise<UndoResult> {
  return asAdminTx(async (tx) => {
    const [row] = await tx.unsafe(`select public.undo_change($1::uuid) as r`, [changeLogId]);
    return (row as unknown as { r: UndoResult }).r;
  });
}

/** Call undo_change via a NON-admin authed session; returns {forbidden,errcode} or throws other errors. */
export async function callUndoAsNonAdmin(
  changeLogId: string,
): Promise<{ forbidden: boolean; errcode?: string }> {
  try {
    await asNonAdminTx(async (tx) => {
      await tx.unsafe(`select public.undo_change($1::uuid) as r`, [changeLogId]);
    });
    return { forbidden: false };
  } catch (err) {
    const e = err as { code?: string };
    return e.code === undefined
      ? { forbidden: false }
      : { forbidden: e.code === "42501", errcode: e.code };
  }
}
