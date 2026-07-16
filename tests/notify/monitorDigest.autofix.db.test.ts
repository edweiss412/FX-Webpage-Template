import { afterAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { buildMonitorDigestModel } from "@/lib/notify/monitorDigest";
import type { DigestBuilderSql } from "@/lib/notify/digest";

// Spec 2026-07-16 §3/§9.2: DB-integration proof for the per-show autofix notices.
// Seeds eligible applied sync_log rows of published shows plus non-applied /
// unpublished / orphan rows and proves filtering, per-show fingerprint dedupe,
// event semantics (older distinct notices survive), newest-first show order, and
// exact tied-row item order under the sl.id asc tiebreak (run-unique uuids).
const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
try {
  const probe = postgres(LOCAL_URL, {
    max: 2,
    idle_timeout: 2,
    connect_timeout: 3,
    prepare: false,
  });
  await probe.unsafe("select 1", []);
  sql = probe;
  dbUp = true;
} catch {
  if (sql) await (sql as ReturnType<typeof postgres>).end().catch(() => {});
  sql = null;
  dbUp = false;
}

const MARK = `f62af-${Date.now()}`;
const PUB = `${MARK}-pub`;
const SECOND = `${MARK}-second`;
const TIED = `${MARK}-tied`;
const UNPUB = `${MARK}-unpub`;
const ORPHAN = `${MARK}-orphan`;

afterAll(async () => {
  if (!sql) return;
  await sql`delete from public.sync_log where drive_file_id in (${PUB}, ${SECOND}, ${TIED}, ${UNPUB}, ${ORPHAN})`.catch(
    () => {},
  );
  await sql`delete from public.shows where drive_file_id in (${PUB}, ${SECOND}, ${TIED}, ${UNPUB})`.catch(
    () => {},
  );
  await sql.end().catch(() => {});
});

const fix = (msg: string) => [{ code: "STAGE_WORD_AUTOCORRECTED", severity: "warn", message: msg }];

const build = (now: string) =>
  buildMonitorDigestModel(new Date(now), {
    sql: sql as unknown as DigestBuilderSql,
    getWatermark: async () => ({ kind: "value", watermark: new Date("2098-01-01T00:00:00Z") }),
  });

describe.runIf(dbUp)(
  "buildMonitorDigestModel — autofix DB proof (spec 2026-07-16 §3, §9.2)",
  () => {
    test("filter + dedupe + event semantics + per-show scope + ordering", async () => {
      if (!sql) throw new Error("db not up");
      await sql`insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
      values (${PUB}, ${MARK + "-ps"}, ${"Pub"}, ${"c"}, ${"v1"}, true)`;
      await sql`insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
      values (${SECOND}, ${MARK + "-ss"}, ${"Second"}, ${"c"}, ${"v1"}, true)`;
      await sql`insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
      values (${UNPUB}, ${MARK + "-us"}, ${"Unpub"}, ${"c"}, ${"v1"}, false)`;

      const log = (drive: string, status: string, msg: string, at: string) => sql!`
      insert into public.sync_log (drive_file_id, status, message, parse_warnings, occurred_at)
      values (${drive}, ${status}, ${status}, ${sql!.json(fix(msg))}, ${at})
    `;
      // PUB: same notice on two rows (collapses) + a distinct notice on an older row (survives).
      await log(PUB, "applied", "corrected 'a' as 'b'", "2099-01-01T10:00:00Z");
      await log(PUB, "applied", "corrected 'a' as 'b'", "2099-01-01T09:00:00Z");
      await log(PUB, "applied", "corrected 'p' as 'q'", "2099-01-01T09:00:00Z");
      // SECOND: most recent activity → must group FIRST. Its first notice is
      // BYTE-IDENTICAL to PUB's (same code, no anchor) — per-show dedupe scope must
      // keep both shows' copies (a global seen-set would drop one).
      await log(SECOND, "applied", "corrected 'a' as 'b'", "2099-01-01T11:00:00Z");
      await log(SECOND, "applied", "corrected 'm' as 'n'", "2099-01-01T10:45:00Z");
      // Excluded rows: non-applied / unpublished / orphan.
      await log(PUB, "drive_error", "corrected 'z' as 'w'", "2099-01-01T10:30:00Z");
      await log(UNPUB, "applied", "corrected 'z' as 'w'", "2099-01-01T10:30:00Z");
      await log(ORPHAN, "applied", "corrected 'z' as 'w'", "2099-01-01T10:30:00Z");

      const r = await build("2099-01-01T12:00:00Z");
      if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
      // PUB: 1 collapsed + 1 distinct; SECOND: identical-to-PUB notice + its own.
      expect(r.model.autofix.total).toBe(4);
      expect(r.model.autofix.shows.map((s) => s.showTitle)).toEqual(["Second", "Pub"]); // newest-first
      const [second, pub] = r.model.autofix.shows;
      // Per-show dedupe scope: SECOND keeps the notice byte-identical to PUB's.
      expect(second!.items).toEqual(["corrected 'a' as 'b'", "corrected 'm' as 'n'"]);
      expect(pub!.items).toEqual(["corrected 'a' as 'b'", "corrected 'p' as 'q'"]);
    });

    test("tied occurred_at rows: model preserves ALL items in the exact id-asc order (run-unique uuids)", async () => {
      if (!sql) throw new Error("db not up");
      await sql`insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
      values (${TIED}, ${MARK + "-ts"}, ${"Tied"}, ${"c"}, ${"v1"}, true)`;
      const at = "2099-06-01T10:00:00Z";
      // 7 rows, identical occurred_at. RUN-UNIQUE uuids (a fixed literal id is a
      // primary key on public.sync_log — a crashed run or sibling worktree on the
      // shared local DB would collide on retry); the expected order is DERIVED by
      // sorting the generated ids. Postgres orders uuid by byte value, which matches
      // lexicographic order of the lowercase hex string crypto.randomUUID() returns,
      // so a plain string sort is a valid oracle.
      const ids = Array.from({ length: 7 }, () => crypto.randomUUID());
      for (const [i, id] of ids.entries()) {
        await sql!`insert into public.sync_log (id, drive_file_id, status, message, parse_warnings, occurred_at)
        values (${id}, ${TIED}, ${"applied"}, ${"applied"}, ${sql!.json(
          fix(`corrected 'x' as 'y' #${i}`),
        )}, ${at})`;
      }
      const r = await build("2099-06-01T12:00:00Z");
      if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
      const tied = r.model.autofix.shows.find((s) => s.showTitle === "Tied")!;
      // Expected order = uuid ascending (id asc), NOT insert order. Model preserves
      // all 7 (count caps are render-only); index i identifies the source row.
      const byIdAsc = [...ids.entries()].sort(([, a], [, b]) => (a < b ? -1 : 1)).map(([i]) => i);
      expect(tied.items).toEqual(byIdAsc.map((i) => `corrected 'x' as 'y' #${i}`));
    });
  },
);
