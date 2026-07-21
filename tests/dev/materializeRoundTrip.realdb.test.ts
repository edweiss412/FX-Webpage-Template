/**
 * tests/dev/materializeRoundTrip.realdb.test.ts
 * (spec 2026-07-20-attention-scenario-gallery §12)
 *
 * The acceptance gate for the materialize executor, against a REAL database.
 * Every assertion reads the tables directly and never the action's own report:
 * an executor that miscounts would otherwise confirm its own mistake.
 *
 * ── Connection posture ───────────────────────────────────────────────────────
 * Loopback ONLY, asserted before a connection is attempted, and deliberately
 * with NO TEST_DATABASE_URL fallback: in this repo that variable points at the
 * VALIDATION project (see `pnpm preflight`, which warns about exactly this), so
 * a fallback would aim a suite that deletes rows at a shared remote. Same
 * posture as tests/db/_remediationHelpers.ts:19-30.
 *
 * ── Isolation ────────────────────────────────────────────────────────────────
 * The suite creates its own show with a unique slug and removes it in both
 * beforeAll and afterAll. Cleanup runs BEFORE as well as after because a run
 * killed midway (a common thing during development) otherwise leaves rows that
 * make the next run fail for a reason unrelated to the code under test.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { executeApply, executeClear, DEV_SCENARIO_TAG } from "@/lib/dev/materialize/run";
import { planApply, planClear } from "@/lib/dev/materialize/plan";
import { scenarioById } from "@/lib/dev/attentionScenarios/index";
import {
  T3_CREW_COLLISION,
  T3_HOLD_AND_DRIFT,
  T3_SHEET_MISSING,
} from "@/lib/dev/attentionScenarios/tier3";
import type { AttentionScenario } from "@/lib/dev/attentionScenarios/types";
import type { SupabaseLike } from "@/lib/dev/materialize/run";
import { createClient } from "@supabase/supabase-js";

const LOOPBACK_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

function assertLoopback(url: string): string {
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(host)) {
    throw new Error(`REFUSING non-loopback database host "${host}"`);
  }
  return url;
}

function psql(sql: string): string {
  return execFileSync("psql", [assertLoopback(LOOPBACK_DB), "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

/** True when a local Supabase is actually up; the suite skips rather than fails otherwise. */
function localDbReachable(): boolean {
  try {
    psql("select 1;");
    return true;
  } catch {
    return false;
  }
}

const RUN = localDbReachable();
const SUITE = RUN ? describe : describe.skip;
if (!RUN) {
  console.log("[materializeRoundTrip.realdb] skipped — no local Supabase on 127.0.0.1:54322.");
}

const SLUG = `matz-${randomUUID().slice(0, 8)}`;
const DRIVE_ID = `matz-drive-${randomUUID().slice(0, 8)}`;
let showId = "";
const client = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
}) as unknown as SupabaseLike;

function q(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

function removeFixture(): void {
  psql(`
    delete from public.sync_holds where drive_file_id = ${q(DRIVE_ID)};
    delete from public.admin_alerts where show_id in (select id from public.shows where slug = ${q(SLUG)});
    delete from public.shows_internal where show_id in (select id from public.shows where slug = ${q(SLUG)});
    delete from public.shows where slug = ${q(SLUG)};
  `);
}

function s(id: string): AttentionScenario {
  const found = scenarioById(id);
  if (!found) throw new Error(`missing scenario ${id}`);
  return found;
}

function show() {
  return { id: showId, driveFileId: DRIVE_ID };
}

async function apply(scenario: AttentionScenario, target: "local" | "validation" = "local") {
  const plan = planApply(scenario, { slug: SLUG, archived: false, target });
  return executeApply(scenario, plan, show(), target, { client });
}

async function clear(target: "local" | "validation" = "local") {
  // resync is omitted deliberately: this suite proves the DELETE semantics, and
  // a real sync would need Drive.
  return executeClear(planClear({ slug: SLUG, target }), show(), target, { client });
}

/** Every alert row for the fixture show, ordered so comparisons are stable. */
function alertRows(): string {
  return psql(
    `select code, coalesce(context->>'${DEV_SCENARIO_TAG}', '-'), occurrence_count
     from public.admin_alerts where show_id = ${q(showId)} order by code;`,
  );
}

function holdRows(): string {
  return psql(
    `select entity_key, created_by from public.sync_holds
     where drive_file_id = ${q(DRIVE_ID)} order by entity_key;`,
  );
}

function warningsJson(): string {
  return psql(
    `select coalesce(parse_warnings::text, 'NULL') from public.shows_internal where show_id = ${q(showId)};`,
  );
}

SUITE("materialize round-trip against a real database", () => {
  beforeAll(() => {
    // BEFORE as well as after: a previously killed run must not poison this one.
    removeFixture();
    showId = psql(`
      insert into public.shows (slug, drive_file_id, title, client_label, template_version)
      values (${q(SLUG)}, ${q(DRIVE_ID)}, 'Materialize round-trip fixture',
              'Materialize fixture client', 'v1')
      returning id;
    `);
    psql(
      `insert into public.shows_internal (show_id, parse_warnings) values (${q(showId)}, '[]'::jsonb)
       on conflict (show_id) do update set parse_warnings = '[]'::jsonb;`,
    );
  });

  afterAll(() => {
    removeFixture();
  });

  beforeEach(() => {
    // Wipes EVERY row for the fixture show, not just the tagged ones. Using
    // clear() here would be circular (the verb under test as its own reset) and
    // wrong: it correctly preserves untagged rows, so an authentic row seeded by
    // one test would leak into the next and fail it for an unrelated reason.
    psql(`
      delete from public.admin_alerts where show_id = ${q(showId)};
      delete from public.sync_holds where drive_file_id = ${q(DRIVE_ID)};
      update public.shows_internal set parse_warnings = '[]'::jsonb where show_id = ${q(showId)};
    `);
  });

  test("a tagged Apply is fully reversed by Clear", async () => {
    const r = await apply(s(T3_CREW_COLLISION));
    expect(r.kind).toBe("ok");
    expect(alertRows()).not.toBe("");

    await clear();
    expect(alertRows()).toBe("");
    expect(holdRows()).toBe("");
  });

  test("Clear preserves AUTHENTIC rows and removes only tagged ones", async () => {
    psql(`
      insert into public.admin_alerts (show_id, code, context, occurrence_count)
      values (${q(showId)}, 'AUTHENTIC_UNTAGGED', '{"real": true}'::jsonb, 3);
      insert into public.sync_holds
        (show_id, drive_file_id, domain, entity_key, held_value, proposed_value,
         base_modified_time, kind, created_by)
      values (${q(showId)}, ${q(DRIVE_ID)}, 'crew_email', 'authentic-key',
              '{}'::jsonb, '{"disposition":"email_change","name":"A","email":"a@b.test"}'::jsonb,
              now(), 'mi11_pending', 'system');
    `);
    const alertsBefore = alertRows();
    const holdsBefore = holdRows();

    await apply(s(T3_HOLD_AND_DRIFT));
    await clear();

    // Byte-identical: the authentic rows are untouched by both verbs.
    expect(alertRows()).toBe(alertsBefore);
    expect(holdRows()).toBe(holdsBefore);
  });

  test("a created_by that merely RESEMBLES the tag is never deleted", async () => {
    // The wildcard-safety case. Under the spec's original LIKE '\\_\\_devScenario:%'
    // predicate, an unescaped `_` is a single-character wildcard, so both of
    // these would have matched and been destroyed. A correctly-tagged fixture
    // alone could never surface that.
    for (const impostor of ["xxdevScenario:real", "a_bdevScenario:real", "__devScenarioX"]) {
      psql(`
        insert into public.sync_holds
          (show_id, drive_file_id, domain, entity_key, held_value, proposed_value,
           base_modified_time, kind, created_by)
        values (${q(showId)}, ${q(DRIVE_ID)}, 'crew_email', ${q(`imp-${impostor}`)},
                '{}'::jsonb, '{"disposition":"email_change","name":"A","email":"a@b.test"}'::jsonb,
                now(), 'mi11_pending', ${q(impostor)});
      `);
    }
    const before = holdRows();

    await apply(s(T3_HOLD_AND_DRIFT));
    await clear();

    expect(holdRows()).toBe(before);
  });

  test("Apply A then Apply B leaves exactly B's rows", async () => {
    await apply(s(T3_SHEET_MISSING));
    const afterA = alertRows();
    expect(afterA).toContain("SHEET_UNAVAILABLE");

    await apply(s(T3_CREW_COLLISION));
    const afterB = alertRows();
    // A's codes are gone, B's are present: the deletes really do precede the
    // inserts against live rows, not just in the plan's step order.
    expect(afterB).not.toContain("SHEET_UNAVAILABLE");
    expect(afterB).toContain("AMBIGUOUS_EMAIL_BINDING");
  });

  test("an alert code colliding with a real unresolved row is skipped, and the real row survives", async () => {
    const scenario = s(T3_SHEET_MISSING);
    const collidingCode = scenario.alerts[0]!.code;
    psql(`
      insert into public.admin_alerts (show_id, code, context, occurrence_count)
      values (${q(showId)}, ${q(collidingCode)}, '{"authentic": true}'::jsonb, 9);
    `);
    const realBefore = psql(
      `select code, context::text, occurrence_count from public.admin_alerts
       where show_id = ${q(showId)} and code = ${q(collidingCode)};`,
    );

    const r = await apply(scenario);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.skipped.map((x) => x.code)).toContain(collidingCode);
    }
    // BOTH halves: the real row is byte-identical AND the other code landed.
    expect(
      psql(
        `select code, context::text, occurrence_count from public.admin_alerts
         where show_id = ${q(showId)} and code = ${q(collidingCode)};`,
      ),
    ).toBe(realBefore);
    expect(alertRows()).toContain("PARSE_ERROR_LAST_GOOD");
  });

  test("a hold key colliding on (show_id, domain, entity_key) is skipped, and the real hold survives", async () => {
    const scenario = s(T3_HOLD_AND_DRIFT);
    const key = scenario.holds[0]!.entity_key;
    psql(`
      insert into public.sync_holds
        (show_id, drive_file_id, domain, entity_key, held_value, proposed_value,
         base_modified_time, kind, created_by)
      values (${q(showId)}, ${q(DRIVE_ID)}, 'crew_email', ${q(key)},
              '{"authentic": true}'::jsonb,
              '{"disposition":"email_change","name":"Real","email":"real@b.test"}'::jsonb,
              now(), 'mi11_pending', 'system');
    `);
    const before = psql(
      `select held_value::text, created_by from public.sync_holds
       where show_id = ${q(showId)} and domain = 'crew_email' and entity_key = ${q(key)};`,
    );

    const r = await apply(scenario);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.skipped.map((x) => x.code)).toContain(`crew_email:${key}`);
    }
    expect(
      psql(
        `select held_value::text, created_by from public.sync_holds
         where show_id = ${q(showId)} and domain = 'crew_email' and entity_key = ${q(key)};`,
      ),
    ).toBe(before);
  });

  test("the warnings tri-state behaves as declared, against the real column", async () => {
    const seeded = '[{"severity": "warn", "code": "SEEDED", "message": "authentic"}]';
    psql(
      `update public.shows_internal set parse_warnings = ${q(seeded)}::jsonb where show_id = ${q(showId)};`,
    );
    const before = warningsJson();

    // ABSENT: the column is left byte-identical.
    await apply(s(T3_SHEET_MISSING));
    expect(warningsJson()).toBe(before);

    // EMPTY ARRAY: zero warnings is deliberately written.
    await apply(s(T3_HOLD_AND_DRIFT));
    expect(JSON.parse(warningsJson())).toEqual([]);

    // NON-EMPTY: the declared warnings land.
    await apply(s(T3_CREW_COLLISION));
    expect(JSON.parse(warningsJson())).toHaveLength(3);
  });

  test("a validation-target Apply never writes the warnings column", async () => {
    const seeded = '[{"severity": "warn", "code": "SEEDED", "message": "authentic"}]';
    psql(
      `update public.shows_internal set parse_warnings = ${q(seeded)}::jsonb where show_id = ${q(showId)};`,
    );
    const before = warningsJson();
    // The executor is driven directly with target "validation" while still
    // connected to the LOCAL database: this proves the skip comes from the
    // target argument, not from where the client happens to point.
    const r = await apply(s(T3_CREW_COLLISION), "validation");
    expect(r.kind === "ok" && r.warnings).toBe("skipped_validation");
    expect(warningsJson()).toBe(before);
  });

  test("a refused plan writes nothing at all", async () => {
    psql(`
      insert into public.admin_alerts (show_id, code, context, occurrence_count)
      values (${q(showId)}, 'AUTHENTIC_UNTAGGED', '{"real": true}'::jsonb, 1);
    `);
    const alertsBefore = alertRows();
    const holdsBefore = holdRows();
    const warningsBefore = warningsJson();

    // Archived is an Apply-only guard, and it must refuse BEFORE the deletes.
    const plan = planApply(s(T3_CREW_COLLISION), {
      slug: SLUG,
      archived: true,
      target: "local",
    });
    const r = await executeApply(s(T3_CREW_COLLISION), plan, show(), "local", { client });
    expect(r.kind).toBe("refused");

    expect(alertRows()).toBe(alertsBefore);
    expect(holdRows()).toBe(holdsBefore);
    expect(warningsJson()).toBe(warningsBefore);
  });

  test("Clear succeeds on an ARCHIVED show, so cleanup is never stranded", async () => {
    await apply(s(T3_CREW_COLLISION));
    expect(alertRows()).not.toBe("");
    psql(`update public.shows set archived = true where id = ${q(showId)};`);
    try {
      const r = await clear();
      expect(r.kind).toBe("ok");
      expect(alertRows()).toBe("");
    } finally {
      psql(`update public.shows set archived = false where id = ${q(showId)};`);
    }
  });
});
