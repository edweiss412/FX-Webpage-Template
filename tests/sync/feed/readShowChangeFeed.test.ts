import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { getRequiredDougFacing } from "@/lib/messages/lookup";
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
    // baseModifiedTime (PF40) is the open hold's base_modified_time AS RETURNED
    // by the query — the OPAQUE optimistic-concurrency token Phase 6 submits as
    // p_expected_base_modified_time. P5-F4: it must carry the RAW full-precision
    // string (microseconds intact), NOT a Date/toIso-normalized value (which
    // would truncate sub-millisecond precision → false MI11_TARGET_MOVED). So
    // assert holdId + disposition exactly, and the token at FULL precision.
    expect(pending!.gate!.holdId).toBe(holdId);
    expect(pending!.gate!.disposition).toEqual({
      disposition: "email_change",
      name: "Alice",
      email: "alice@new",
    });
    // Token normalized via the DB equals the stored base_modified_time at full
    // microsecond precision (derived from the seeded row, not a literal); and it
    // must NOT have been millisecond-truncated by a Date round-trip.
    const tokenNorm = runPsql(
      `select to_char((${q(pending!.gate!.baseModifiedTime!)}::text)::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');`,
    );
    expect(tokenNorm).toBe(holdBaseModifiedTime); // === seeded hold's base_modified_time, full precision
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

  // P5-F2: cover the cases the THREE-conjunct predicate exists to protect. A
  // regression dropping individually_undoable, or only special-casing
  // 'superseded' while letting 'rejected'/'undone' through, must RED here.
  test("applied crew_renamed with individually_undoable=false → action='none', no payload (P4-F4)", async () => {
    showId = runPsql(`
      with s as (
        insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
        values (${q(prefix + "-e")}, ${q(prefix + "-e")}, 'Feed Test', 'FXAV', 'v4', true)
        returning id
      )
      insert into public.show_change_log
        (show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary, after_image, status, individually_undoable)
      select id, ${q(prefix + "-e")}, now() - interval '3 min',
        'mi11_approve', 'crew_renamed', 'Frank', 'Crew renamed: Fr → Frank', '{"name":"Frank"}'::jsonb, 'applied', false
      from s
      returning show_id;
    `);
    const { entries } = await readShowChangeFeed(showId);
    // Anti-tautology: an APPLIED crew-domain row (which WOULD be undo at
    // individually_undoable=true) must NOT be undoable when the column is FALSE.
    const frank = entries.find((e) => e.entityRef === "Frank");
    expect(frank).toBeDefined();
    expect(frank!.status).toBe("applied"); // applied — only the third conjunct gates it
    expect(frank!.action).toBe("none"); // individually_undoable=false → no undo
    expect(frank!.gate).toBeUndefined();
    expect(frank!.changeLogId).toBeUndefined();
  });

  test("a rejected crew-domain row → action='none', no payload", async () => {
    showId = runPsql(`
      with s as (
        insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
        values (${q(prefix + "-f")}, ${q(prefix + "-f")}, 'Feed Test', 'FXAV', 'v4', true)
        returning id
      )
      insert into public.show_change_log
        (show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary, after_image, status)
      select id, ${q(prefix + "-f")}, now() - interval '4 min',
        'mi11_reject', 'crew_removed', 'Gina', 'Removal rejected: Gina', '{}'::jsonb, 'rejected'
      from s
      returning show_id;
    `);
    const { entries } = await readShowChangeFeed(showId);
    // Anti-tautology: a CREW-DOMAIN change_kind ('crew_removed') is undoable only
    // at status='applied'; a 'rejected' row must NOT carry undo.
    const gina = entries.find((e) => e.entityRef === "Gina");
    expect(gina).toBeDefined();
    expect(gina!.status).toBe("rejected");
    expect(gina!.action).toBe("none");
    expect(gina!.gate).toBeUndefined();
    expect(gina!.changeLogId).toBeUndefined();
  });

  test("an undone crew-domain row → action='none', no payload", async () => {
    showId = runPsql(`
      with s as (
        insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
        values (${q(prefix + "-g")}, ${q(prefix + "-g")}, 'Feed Test', 'FXAV', 'v4', true)
        returning id
      )
      insert into public.show_change_log
        (show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary, after_image, status)
      select id, ${q(prefix + "-g")}, now() - interval '6 min',
        'auto_apply', 'crew_added', 'Hank', 'Crew added: Hank', '{"name":"Hank"}'::jsonb, 'undone'
      from s
      returning show_id;
    `);
    const { entries } = await readShowChangeFeed(showId);
    // Anti-tautology: a CREW-DOMAIN change_kind ('crew_added') is undoable only at
    // status='applied'; an 'undone' row must NOT carry undo.
    const hank = entries.find((e) => e.entityRef === "Hank");
    expect(hank).toBeDefined();
    expect(hank!.status).toBe("undone");
    expect(hank!.action).toBe("none");
    expect(hank!.gate).toBeUndefined();
    expect(hank!.changeLogId).toBeUndefined();
  });

  // P5-F3: a FOLDED email+rename pending hold (proposed email MOVES the OAuth
  // anchor) must render the rename_FOLDED warning copy, not the plain rename
  // copy — otherwise Doug sees "Rename pending" while Approve also changes the
  // email + evicts the claimed session. Anti-tautology: expected text is the
  // catalog dougFacing for the folded key, derived via getRequiredDougFacing,
  // never a hardcoded literal.
  test("folded rename (proposed email != held email) renders the rename_folded warning copy", async () => {
    showId = runPsql(`
      with s as (
        insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
        values (${q(prefix + "-h")}, ${q(prefix + "-h")}, 'Feed Test', 'FXAV', 'v4', true)
        returning id
      )
      insert into public.sync_holds
        (show_id, drive_file_id, domain, entity_key, held_value, proposed_value, base_modified_time, kind, created_by)
      select id, ${q(prefix + "-h")}, 'crew_identity', 'Iris',
        '{"name":"Iris","email":"iris@old"}'::jsonb,
        '{"disposition":"rename","name":"Irene","email":"irene@new"}'::jsonb,
        now(), 'mi11_pending', 'system' from s
      returning show_id;
    `);
    const { entries } = await readShowChangeFeed(showId);
    const pending = entries.find((e) => e.status === "pending");
    expect(pending).toBeDefined();
    expect(pending!.action).toBe("approve_reject");
    // Folded copy: "Email change + rename pending for {name}" → {name}=entity_key.
    const foldedExpected = getRequiredDougFacing("mi11_pending_rename_folded").replaceAll(
      "{name}",
      "Iris",
    );
    expect(pending!.summary).toBe(foldedExpected);
    // It must NOT use the plain-rename copy (the bug under test rendered this).
    const plainRename = getRequiredDougFacing("mi11_pending_rename")
      .replaceAll("{old}", "Iris")
      .replaceAll("{new}", "Irene");
    expect(pending!.summary).not.toBe(plainRename);
  });

  // Control: a rename whose proposed email EQUALS the held email does NOT move
  // the OAuth anchor → plain rename copy (so the folded branch is conditional,
  // not hardcoded; a future pure-rename case renders correctly).
  test("pure rename (proposed email == held email) renders the plain rename copy", async () => {
    showId = runPsql(`
      with s as (
        insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
        values (${q(prefix + "-i")}, ${q(prefix + "-i")}, 'Feed Test', 'FXAV', 'v4', true)
        returning id
      )
      insert into public.sync_holds
        (show_id, drive_file_id, domain, entity_key, held_value, proposed_value, base_modified_time, kind, created_by)
      select id, ${q(prefix + "-i")}, 'crew_identity', 'Jack',
        '{"name":"Jack","email":"jack@same"}'::jsonb,
        '{"disposition":"rename","name":"Jacques","email":"jack@same"}'::jsonb,
        now(), 'mi11_pending', 'system' from s
      returning show_id;
    `);
    const { entries } = await readShowChangeFeed(showId);
    const pending = entries.find((e) => e.status === "pending");
    expect(pending).toBeDefined();
    const plainExpected = getRequiredDougFacing("mi11_pending_rename")
      .replaceAll("{old}", "Jack")
      .replaceAll("{new}", "Jacques");
    expect(pending!.summary).toBe(plainExpected);
    const folded = getRequiredDougFacing("mi11_pending_rename_folded").replaceAll("{name}", "Jack");
    expect(pending!.summary).not.toBe(folded);
  });

  // P5-F5: the merge must order cross-source rows by FULL-PRECISION timestamps,
  // not the ms-truncated display value. Seed a pending hold (created_at) and a
  // change-log row (occurred_at) in the SAME millisecond but the change-log row
  // strictly NEWER in microseconds → it must sort BEFORE the older hold
  // (newest-first), even though both truncate to the same millisecond and the
  // array is built holds-before-logs.
  test("cross-source merge honors microsecond ordering (same ms, log newer than hold)", async () => {
    // Anchor both at the same millisecond; the change-log row is +123µs newer.
    const holdTs = "2026-06-09T12:00:00.000111+00";
    const logTs = "2026-06-09T12:00:00.000234+00"; // same ms (.000), larger micros → strictly newer
    showId = runPsql(`
      with s as (
        insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
        values (${q(prefix + "-j")}, ${q(prefix + "-j")}, 'Feed Test', 'FXAV', 'v4', true)
        returning id
      ),
      hold as (
        insert into public.sync_holds
          (show_id, drive_file_id, domain, entity_key, held_value, proposed_value, base_modified_time, kind, created_by, created_at)
        select id, ${q(prefix + "-j")}, 'crew_email', 'Kim',
          '{"name":"Kim","email":"kim@old"}'::jsonb,
          '{"disposition":"email_change","name":"Kim","email":"kim@new"}'::jsonb,
          now(), 'mi11_pending', 'system', ${q(holdTs)}::timestamptz from s
        returning id
      ),
      log as (
        insert into public.show_change_log
          (show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary, after_image, status)
        select id, ${q(prefix + "-j")}, ${q(logTs)}::timestamptz,
          'auto_apply', 'crew_added', 'Leo', 'Crew added: Leo', '{"name":"Leo"}'::jsonb, 'applied' from s
        returning id
      )
      select id from s;
    `);

    const { entries } = await readShowChangeFeed(showId);
    const logIdx = entries.findIndex((e) => e.entityRef === "Leo"); // newer change-log row
    const holdIdx = entries.findIndex((e) => e.entityRef === "Kim"); // older pending hold
    expect(logIdx).toBeGreaterThanOrEqual(0);
    expect(holdIdx).toBeGreaterThanOrEqual(0);
    // Newest-first: the microsecond-newer change-log row precedes the older hold.
    // Derived from the seeded timestamps (logTs micros > holdTs micros), not a
    // hardcoded order.
    expect(logIdx).toBeLessThan(holdIdx);
  });
});
