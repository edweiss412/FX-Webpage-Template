import postgres, { type Sql, type TransactionSql } from "postgres";
import { randomUUID } from "node:crypto";

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

const sql: Sql = postgres(DB_URL, { max: 4, prepare: false });
export const mi11Sql: Sql = sql;

export async function closeMi11Helpers(): Promise<void> {
  await sql.end({ timeout: 5 });
}

/** Run `body` in a txn with role=authenticated + ADMIN JWT claims (the real PostgREST authed admin path). */
export async function asAdminTx<T>(body: (tx: TransactionSql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true)`;
    await tx`select set_config('request.jwt.claims', ${ADMIN_CLAIMS}, true)`;
    return body(tx);
  }) as Promise<T>;
}

/** Run `body` in a txn with role=authenticated + NON-ADMIN JWT claims. */
export async function asNonAdminTx<T>(body: (tx: TransactionSql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true)`;
    await tx`select set_config('request.jwt.claims', ${NON_ADMIN_CLAIMS}, true)`;
    return body(tx);
  }) as Promise<T>;
}

export type SeededMi11Show = { showId: string; driveFileId: string };

/** Seed a live show (service-role / no JWT). The share-token trigger fires automatically. */
export async function seedShow(tx: Sql): Promise<SeededMi11Show> {
  const driveFileId = `drv-${randomUUID()}`;
  const slug = `sh-${randomUUID().slice(0, 8)}`;
  const [row] = await tx`
    insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
    values (${driveFileId}, ${slug}, 'T', 'c', 'v', true)
    returning id`;
  return { showId: row!.id as string, driveFileId };
}

export type SeedCrewOpts = {
  email?: string | null;
  role?: string;
  claimed?: boolean | string; // true → now(); a string → that timestamptz; false/undefined → null
};

/** Seed one crew member; returns its id + claimed_via_oauth_at (ISO|null). */
export async function seedCrew(
  tx: Sql,
  showId: string,
  name: string,
  opts: SeedCrewOpts = {},
): Promise<{ id: string; claimed_via_oauth_at: string | null }> {
  const claim =
    opts.claimed === true
      ? tx`now()`
      : typeof opts.claimed === "string"
        ? tx`${opts.claimed}::timestamptz`
        : null;
  const [row] = await tx`
    insert into public.crew_members
      (show_id, name, email, phone, role, role_flags, date_restriction, stage_restriction,
       flight_info, claimed_via_oauth_at)
    values (${showId}, ${name}, ${opts.email === undefined ? null : opts.email}, '555-OLD',
            ${opts.role ?? "A1"}, ${["A1"]}, ${tx.json({ kind: "none" })}, ${tx.json({ kind: "none" })},
            null, ${claim})
    returning id, claimed_via_oauth_at`;
  const c = row!.claimed_via_oauth_at as Date | string | null;
  return {
    id: row!.id as string,
    claimed_via_oauth_at: c == null ? null : new Date(c).toISOString(),
  };
}

export type Disposition =
  | { disposition: "email_change"; name: string; email: string | null }
  | { disposition: "rename"; name: string; email: string | null }
  | { disposition: "removal" };

export type SeedHoldOpts = {
  domain?: "crew_email" | "crew_identity";
  entityKey: string;
  heldValue: Record<string, unknown>;
  proposedValue: Disposition;
  baseModifiedTime: string; // ISO
  reservationCollisions?: Array<{ name: string; email: string | null }>;
};

/** Seed one mi11_pending sync_holds row. Returns its id + base_modified_time (ISO). */
export async function seedHold(
  tx: Sql,
  show: SeededMi11Show,
  opts: SeedHoldOpts,
): Promise<{ id: string; baseModifiedTime: string }> {
  const [row] = await tx`
    insert into public.sync_holds
      (show_id, drive_file_id, domain, entity_key, held_value, proposed_value,
       base_modified_time, kind, reservation_collisions, created_by)
    values (${show.showId}, ${show.driveFileId}, ${opts.domain ?? "crew_email"}, ${opts.entityKey},
            ${tx.json(opts.heldValue)}, ${tx.json(opts.proposedValue)},
            ${opts.baseModifiedTime}::timestamptz, 'mi11_pending',
            ${tx.json(opts.reservationCollisions ?? [])}, 'system')
    returning id, base_modified_time`;
  const b = row!.base_modified_time as Date | string;
  return { id: row!.id as string, baseModifiedTime: new Date(b).toISOString() };
}

export async function readHold(tx: Sql, holdId: string) {
  const [row] = (await tx`
    select id, entity_key, kind, domain, held_value, proposed_value, base_modified_time,
           reservation_collisions
      from public.sync_holds where id = ${holdId}`) as unknown as Array<{
    id: string;
    entity_key: string;
    kind: string;
    domain: string;
    held_value: Record<string, unknown>;
    proposed_value: Record<string, unknown> | null;
    base_modified_time: string | null;
    reservation_collisions: Array<{ name: string; email: string | null }>;
  }>;
  return row ?? null;
}

export async function readHoldsByShow(tx: Sql, showId: string) {
  return (await tx`
    select id, entity_key, kind, domain, held_value, proposed_value, base_modified_time,
           reservation_collisions
      from public.sync_holds where show_id = ${showId} order by entity_key`) as unknown as Array<{
    id: string;
    entity_key: string;
    kind: string;
    domain: string;
    held_value: Record<string, unknown>;
    proposed_value: Record<string, unknown> | null;
    base_modified_time: string | null;
    reservation_collisions: Array<{ name: string; email: string | null }>;
  }>;
}

export async function readCrewByShow(tx: Sql, showId: string) {
  return (await tx`
    select id, name, email, phone, role, role_flags, claimed_via_oauth_at
      from public.crew_members where show_id = ${showId} order by name`) as unknown as Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    role: string;
    role_flags: string[];
    claimed_via_oauth_at: string | Date | null;
  }>;
}

export async function readCrewByName(tx: Sql, showId: string, name: string) {
  const rows = await readCrewByShow(tx, showId);
  return rows.find((r) => r.name === name) ?? null;
}

export async function readChangeLogByShow(tx: Sql, showId: string) {
  return (await tx`
    select id, source, change_kind, entity_ref, summary, before_image, after_image, status, created_by
      from public.show_change_log where show_id = ${showId}
      order by occurred_at, change_kind, entity_ref`) as unknown as Array<{
    id: string;
    source: string;
    change_kind: string;
    entity_ref: string | null;
    summary: string;
    before_image: Record<string, unknown> | null;
    after_image: Record<string, unknown> | null;
    status: string;
    created_by: string;
  }>;
}

/** Build a held_value object from a seeded crew member (the prior live row). */
export function heldFromCrew(name: string, email: string | null): Record<string, unknown> {
  return {
    name,
    email,
    phone: "555-OLD",
    role: "A1",
    role_flags: ["A1"],
    date_restriction: { kind: "none" },
    stage_restriction: { kind: "none" },
    flight_info: null,
  };
}

/** Call mi11_reject_hold(p_hold_id, p_expected_base_modified_time) and return the jsonb result. */
export async function callReject(
  tx: TransactionSql,
  holdId: string,
  expectedBase: string,
): Promise<{ ok: boolean; code?: string }> {
  const [row] = await tx.unsafe(
    `select public.mi11_reject_hold($1::uuid, $2::timestamptz) as r`,
    [holdId, expectedBase],
  );
  return (row as { r: { ok: boolean; code?: string } }).r;
}

/** Call mi11_approve_hold(p_hold_id, p_observed_modified_time, p_expected_base_modified_time). */
export async function callApprove(
  tx: TransactionSql,
  holdId: string,
  observed: string,
  expectedBase: string,
): Promise<{ ok: boolean; code?: string }> {
  const [row] = await tx.unsafe(
    `select public.mi11_approve_hold($1::uuid, $2::timestamptz, $3::timestamptz) as r`,
    [holdId, observed, expectedBase],
  );
  return (row as { r: { ok: boolean; code?: string } }).r;
}
