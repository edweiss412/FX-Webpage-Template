import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, test } from "vitest";
import {
  archivedImmutabilityRaceReset,
  closeB2Helpers,
  readShow,
  seedLiveShowWithToken,
  sqlClient,
} from "@/tests/db/_b2Helpers";

// BL-RPC-RESET-SELECTION-LIFECYCLE-GUARD — DEF-1 lifecycle guard on reset_crew_member_selection.
// Lifecycle/success/not-found cases use the self-cleaning runPsql + begin/rollback harness (mirrors the
// existing tests/db/reset_crew_member_selection.test.ts). The R32 TOCTOU race uses the _b2Helpers
// two-connection harness (the archive COMMITS, so that case has explicit finally-cleanup).

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}
function s(v: string): string {
  return `'${v.replaceAll("'", "''")}'`;
}
const ADMIN_JWT = JSON.stringify({
  sub: "00000000-0000-0000-0000-000000000020",
  email: "dlarson@fxav.net",
  app_metadata: { role: "admin" },
});

// `stateSql` mutates the freshly-inserted (Live) show into the target lifecycle state before the call.
function callReset(drive: string, stateSql: string, crewSelector: string): string {
  return runPsql(`
    begin;
    insert into public.shows (drive_file_id, slug, title, client_label, template_version, archived, published, picker_epoch)
      values (${s(drive)}, ${s(drive)}, 'Reset Guard Test', 'FXAV', 'v4', false, true, 1);
    ${stateSql}
    insert into public.crew_members (show_id, name, role)
      values ((select id from public.shows where drive_file_id = ${s(drive)}), 'Alice', 'A2');
    set local role authenticated;
    set local request.jwt.claims = ${s(ADMIN_JWT)};
    select 'r=' || coalesce(public.reset_crew_member_selection(
      (select id from public.shows where drive_file_id = ${s(drive)}),
      ${crewSelector}
    )::text, 'null');
    rollback;
  `);
}
const ALICE = (drive: string) =>
  `(select id from public.crew_members where name='Alice' and show_id=(select id from public.shows where drive_file_id=${s(drive)}))`;

// finalize-owned state seed — mirrors _b2Helpers seedShow finalizeOwned branch (:148-153).
function finalizeOwnedSql(drive: string): string {
  return `
    with w as (select gen_random_uuid() wid)
    insert into public.shows_pending_changes (wizard_session_id, drive_file_id, show_id, payload, applied_by_email, applied_at_intent)
      select wid, ${s(drive)}, (select id from public.shows where drive_file_id=${s(drive)}), '{}'::jsonb, 'dlarson@fxav.net', now() from w;
    insert into public.wizard_finalize_checkpoints (wizard_session_id, status)
      select wizard_session_id, 'in_progress' from public.shows_pending_changes where drive_file_id=${s(drive)};`;
}

afterAll(async () => {
  await closeB2Helpers();
});

describe("reset_crew_member_selection — DEF-1 lifecycle guard", () => {
  test("archived → SHOW_ARCHIVED_IMMUTABLE", () => {
    const d = `rg-arch-${randomUUID()}`;
    expect(() =>
      callReset(
        d,
        `update public.shows set archived=true, published=false where drive_file_id=${s(d)};`,
        ALICE(d),
      ),
    ).toThrow(/SHOW_ARCHIVED_IMMUTABLE/);
  });

  test("finalize-owned → FINALIZE_OWNED_SHOW", () => {
    const d = `rg-fin-${randomUUID()}`;
    expect(() =>
      callReset(
        d,
        `update public.shows set published=false where drive_file_id=${s(d)};` + finalizeOwnedSql(d),
        ALICE(d),
      ),
    ).toThrow(/FINALIZE_OWNED_SHOW/);
  });

  test("Held → SHOW_NOT_PUBLISHED", () => {
    const d = `rg-held-${randomUUID()}`;
    expect(() =>
      callReset(d, `update public.shows set published=false where drive_file_id=${s(d)};`, ALICE(d)),
    ).toThrow(/SHOW_NOT_PUBLISHED/);
  });

  test("Live → returns a timestamptz", () => {
    const d = `rg-live-${randomUUID()}`;
    const out = callReset(d, ``, ALICE(d));
    expect(out).toMatch(/r=\d{4}-\d{2}-\d{2}/); // stamped, not 'null'
  });

  test("Live + bad crew id → NULL not-found (distinct from refusals)", () => {
    const d = `rg-nf-${randomUUID()}`;
    const out = callReset(d, ``, `'00000000-0000-0000-0000-000000000000'::uuid`);
    expect(out).toContain("r=null");
  });

  test("loses the race to a concurrent Archive → REFUSES post-lock (R32 TOCTOU)", async () => {
    const { showId, driveFileId } = await seedLiveShowWithToken();
    const [{ id: crewId }] = await sqlClient<{ id: string }[]>`
      insert into public.crew_members (show_id, name, role)
      values (${showId}::uuid, 'Alice', 'A2') returning id`;
    try {
      const { concurrentThrew } = await archivedImmutabilityRaceReset(showId, crewId);
      expect(concurrentThrew).toBe(true); // reset refused after the archive committed
      expect((await readShow(showId)).archived).toBe(true); // A's archive landed
    } finally {
      await sqlClient`delete from public.shows where drive_file_id = ${driveFileId}`;
    }
  });
});
