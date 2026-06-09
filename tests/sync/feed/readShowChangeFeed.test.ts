import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { readShowChangeFeed } from "@/lib/sync/feed/readShowChangeFeed";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const runPsql = (sql: string) =>
  execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: sql,
    encoding: "utf8",
  }).trim();
const q = (v: string) => `'${v.replaceAll("'", "''")}'`;

describe("readShowChangeFeed", () => {
  const prefix = `feed-${randomUUID()}`;
  let showId: string;

  afterEach(() => {
    runPsql(`delete from public.shows where drive_file_id like ${q(prefix + "%")};`);
  });

  test("shapes applied crew row → undo, applied non-crew row → none, open mi11 hold → pending approve_reject (old→proposed)", async () => {
    showId = runPsql(`
      with s as (
        insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
        values (${q(prefix + "-a")}, ${q(prefix + "-a")}, 'Feed Test', 'FXAV', 'v4', true)
        returning id
      ),
      added as (
        insert into public.show_change_log
          (show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary, after_image, status)
        select id, ${q(prefix + "-a")}, now() - interval '2 min',
          'auto_apply', 'crew_added', 'Bob', 'Crew added: Bob', '{"name":"Bob"}'::jsonb, 'applied' from s
        returning id
      ),
      renamed as (
        insert into public.show_change_log
          (show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary, after_image, status)
        -- entity_ref = the PRIOR name (the addressing key undo restores on),
        -- NOT the new name (00-overview resolution #19). Summary still shows
        -- "Dan → Dana"; only the addressing key is the old name.
        select id, ${q(prefix + "-a")}, now() - interval '90 sec',
          'auto_apply', 'crew_renamed', 'Dan', 'Crew renamed: Dan → Dana', '{"name":"Dana"}'::jsonb, 'applied' from s
        returning id
      ),
      shrink as (
        insert into public.show_change_log
          (show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary, after_image, status)
        select id, ${q(prefix + "-a")}, now() - interval '1 min',
          'auto_apply', 'section_shrunk', 'Hotels', 'Section shrunk: Hotels', '{}'::jsonb, 'applied' from s
        returning id
      ),
      hold as (
        insert into public.sync_holds
          (show_id, drive_file_id, domain, entity_key, held_value, proposed_value, base_modified_time, kind, created_by)
        select id, ${q(prefix + "-a")}, 'crew_email', 'Alice',
          '{"name":"Alice","email":"alice@old"}'::jsonb,
          '{"disposition":"email_change","name":"Alice","email":"alice@new"}'::jsonb,
          now(), 'mi11_pending', 'system' from s
        returning id
      )
      select id from s;
    `);

    const { entries, truncated, totalShown } = await readShowChangeFeed(showId);

    // Anti-tautology: assert the SHAPE keyed off seeded discriminators.
    const pending = entries.find((e) => e.status === "pending");
    expect(pending).toBeDefined();
    expect(pending!.action).toBe("approve_reject");
    expect(pending!.entityRef).toBe("Alice");
    expect(pending!.summary).toContain("alice@old"); // old, from held_value
    expect(pending!.summary).toContain("alice@new"); // proposed, from proposed_value

    const added = entries.find((e) => e.entityRef === "Bob");
    expect(added!.status).toBe("applied");
    expect(added!.action).toBe("undo"); // crew_added → crew-domain → undo

    // entity_ref for crew_renamed is the PRIOR name ('Dan'), not 'Dana' (res #19).
    const renamed = entries.find((e) => e.entityRef === "Dan");
    expect(renamed!.action).toBe("undo"); // crew_renamed → crew-domain → undo

    const shrink = entries.find((e) => e.entityRef === "Hotels");
    expect(shrink!.action).toBe("none"); // non-crew → notification-only

    // Resolution #17: action payload is inlined so Phase 6 needs no 2nd query.
    // Derive expected ids from the DB (the seeded rows' own ids), not literals.
    const holdId = runPsql(
      `select id from public.sync_holds where show_id = ${q(showId)} and entity_key = 'Alice';`,
    );
    // PF40 staleness token: derive the EXPECTED baseModifiedTime from the seeded
    // hold's own base_modified_time AS RENDERED by the read layer (ISO 8601),
    // never a hardcoded literal. The read renders timestamptz as ISO; format the
    // DB value identically so the assertion pins the rendered token, not the raw.
    const holdBaseModifiedTime = runPsql(
      `select to_char(base_modified_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') from public.sync_holds where show_id = ${q(showId)} and entity_key = 'Alice';`,
    );
    const addedLogId = runPsql(
      `select id from public.show_change_log where show_id = ${q(showId)} and entity_ref = 'Bob';`,
    );
    const renamedLogId = runPsql(
      `select id from public.show_change_log where show_id = ${q(showId)} and entity_ref = 'Dan';`,
    );

    // approve_reject → gate{holdId, disposition, baseModifiedTime}; NO changeLogId.
    // baseModifiedTime (PF40) is the open hold's base_modified_time AS RENDERED —
    // the optimistic-concurrency token Phase 6 submits as p_expected_base_modified_time.
    expect(pending!.gate).toEqual({
      holdId,
      disposition: { disposition: "email_change", name: "Alice", email: "alice@new" },
      baseModifiedTime: new Date(holdBaseModifiedTime).toISOString(), // === seeded hold's base_modified_time
    });
    expect(pending!.changeLogId).toBeUndefined();

    // undo → changeLogId = the show_change_log.id undo_change takes; NO gate.
    expect(added!.changeLogId).toBe(addedLogId);
    expect(added!.gate).toBeUndefined();
    expect(renamed!.changeLogId).toBe(renamedLogId);
    expect(renamed!.gate).toBeUndefined();

    // none → neither field set.
    expect(shrink!.gate).toBeUndefined();
    expect(shrink!.changeLogId).toBeUndefined();

    expect(truncated).toBe(false);
    expect(totalShown).toBe(entries.length);
  });

  test("undo_override holds are NOT pending feed entries", async () => {
    showId = runPsql(`
      with s as (
        insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
        values (${q(prefix + "-b")}, ${q(prefix + "-b")}, 'Feed Test', 'FXAV', 'v4', true)
        returning id
      )
      insert into public.sync_holds
        (show_id, drive_file_id, domain, entity_key, held_value, proposed_value, base_modified_time, kind, created_by)
      select id, ${q(prefix + "-b")}, 'crew_identity', 'Carol',
        '{"name":"Carol"}'::jsonb, null, null, 'undo_override', 'system' from s
      returning show_id;
    `);
    const { entries } = await readShowChangeFeed(showId);
    expect(entries.filter((e) => e.status === "pending")).toHaveLength(0);
  });

  test("caps at limit and sets truncated when more rows exist", async () => {
    const seeded = 8;
    const limit = 3;
    showId = runPsql(`
      with s as (
        insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
        values (${q(prefix + "-c")}, ${q(prefix + "-c")}, 'Feed Test', 'FXAV', 'v4', true)
        returning id
      ),
      ins as (
        insert into public.show_change_log
          (show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary, after_image, status)
        select (select id from s), ${q(prefix + "-c")},
          now() - (g || ' min')::interval, 'auto_apply', 'crew_added', 'C' || g,
          'Crew added: C' || g, '{}'::jsonb, 'applied'
        from generate_series(1, ${seeded}) g
        returning 1
      )
      select id from s;
    `);

    const { entries, truncated, totalShown } = await readShowChangeFeed(showId, { limit });
    expect(entries.filter((e) => e.status === "applied")).toHaveLength(limit); // derived from limit
    expect(truncated).toBe(true); // seeded(8) > limit(3)
    expect(totalShown).toBe(entries.length);
    // newest-first: most recent occurred_at (g=1) appears before older (g=8)
    const refs = entries.filter((e) => e.status === "applied").map((e) => e.entityRef);
    expect(refs).toEqual(["C1", "C2", "C3"]);
  });

  test("a superseded crew-domain row is feed history only — status='superseded', action='none', no payload (PF21)", async () => {
    showId = runPsql(`
      with s as (
        insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
        values (${q(prefix + "-d")}, ${q(prefix + "-d")}, 'Feed Test', 'FXAV', 'v4', true)
        returning id
      )
      insert into public.show_change_log
        (show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary, after_image, status)
      select id, ${q(prefix + "-d")}, now() - interval '5 min',
        'auto_apply', 'crew_renamed', 'Eve', 'Crew renamed: Ev → Eve', '{"name":"Eve"}'::jsonb, 'superseded'
      from s
      returning show_id;
    `);
    const { entries } = await readShowChangeFeed(showId);
    // Anti-tautology: a CREW-DOMAIN change_kind ('crew_renamed') that would be
    // undoable at status='applied' must NOT be undoable at status='superseded'.
    const eve = entries.find((e) => e.entityRef === "Eve");
    expect(eve).toBeDefined();
    expect(eve!.status).toBe("superseded");
    expect(eve!.action).toBe("none");
    expect(eve!.gate).toBeUndefined();
    expect(eve!.changeLogId).toBeUndefined();
  });
});
