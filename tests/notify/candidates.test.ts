import postgres from "postgres";
import { describe, expect, test, vi } from "vitest";
import { SYNC_PROBLEM_CODES } from "@/lib/notify/constants";
import { listRealtimeCandidates, type CandidateSql } from "@/lib/notify/detect/candidates";

function fakeSql() {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = String.raw(strings, ...values.map((_value, index) => `$${index + 1}`));
    calls.push({ text, values });
    if (text.includes("from public.admin_alerts a") && text.includes("join public.shows")) {
      return Promise.resolve([
        {
          kind: "show",
          alert_id: "alert-show",
          show_id: "show-1",
          code: "SHEET_UNAVAILABLE",
          raised_at: new Date("2026-06-02T12:00:00.123Z"),
          dedup_key: "show-1:SHEET_UNAVAILABLE:1780000000123000",
          slug: "show-one",
          title: "Show One",
          context: { sheet_name: "Sheet One" },
        },
      ]);
    }
    if (text.includes("global:SYNC_STALLED")) {
      return Promise.resolve([
        {
          kind: "global",
          alert_id: "alert-global",
          code: "SYNC_STALLED",
          raised_at: new Date("2026-06-02T12:00:00.456Z"),
          dedup_key: "global:SYNC_STALLED:1780000000456000",
        },
      ]);
    }
    return Promise.resolve([
      {
        kind: "ingestion",
        drive_file_id: "drive-1",
        drive_file_name: "New Sheet",
        first_seen_at: new Date("2026-06-02T12:00:00.789Z"),
        last_error_code: "SHEET_PROCESS_FAILED",
        dedup_key: "ingestion:drive-1:1780000000789000",
      },
    ]);
  }) as unknown as CandidateSql;
  return { sql, calls };
}

describe("listRealtimeCandidates", () => {
  test("queries show/global/pending candidates and maps template fields", async () => {
    const { sql } = fakeSql();

    await expect(listRealtimeCandidates(sql)).resolves.toEqual({
      kind: "ok",
      candidates: [
        {
          kind: "show",
          dedupKey: "show-1:SHEET_UNAVAILABLE:1780000000123000",
          alertId: "alert-show",
          showId: "show-1",
          code: "SHEET_UNAVAILABLE",
          raisedAt: new Date("2026-06-02T12:00:00.123Z"),
          slug: "show-one",
          showTitle: "Show One",
          contextSheetName: "Sheet One",
        },
        {
          kind: "global",
          dedupKey: "global:SYNC_STALLED:1780000000456000",
          alertId: "alert-global",
          code: "SYNC_STALLED",
          raisedAt: new Date("2026-06-02T12:00:00.456Z"),
        },
        {
          kind: "ingestion",
          dedupKey: "ingestion:drive-1:1780000000789000",
          driveFileId: "drive-1",
          driveFileName: "New Sheet",
          firstSeenAt: new Date("2026-06-02T12:00:00.789Z"),
          lastErrorCode: "SHEET_PROCESS_FAILED",
        },
      ],
    });
  });

  test("show-level query filters unresolved aged sync-problem alerts on active shows", async () => {
    const { sql, calls } = fakeSql();

    await listRealtimeCandidates(sql);

    const showQuery = calls[0]!;
    expect(showQuery.values).toContain(SYNC_PROBLEM_CODES);
    expect(showQuery.text).toMatch(/a\.resolved_at\s+is\s+null/i);
    expect(showQuery.text).toMatch(/a\.code\s*=\s*any\(\$1::text\[\]\)/i);
    expect(showQuery.text).toMatch(/a\.raised_at\s*<=\s*now\(\)\s*-\s*interval\s+'1 hour'/i);
    expect(showQuery.text).toMatch(/s\.published\s+is\s+true/i);
    expect(showQuery.text).toMatch(/s\.archived\s+is\s+false/i);
    expect(showQuery.text).toMatch(/floor\(extract\(epoch\s+from\s+a\.raised_at\)\s*\*\s*1e6\)::bigint/i);
    expect(showQuery.text).not.toMatch(/Date\.parse/i);
  });

  test("global stall query filters only unresolved show-wide SYNC_STALLED and builds the SQL key", async () => {
    const { sql, calls } = fakeSql();

    await listRealtimeCandidates(sql);

    const globalQuery = calls[1]!;
    expect(globalQuery.text).toMatch(/a\.resolved_at\s+is\s+null/i);
    expect(globalQuery.text).toMatch(/a\.show_id\s+is\s+null/i);
    expect(globalQuery.text).toMatch(/a\.code\s*=\s*'SYNC_STALLED'/i);
    expect(globalQuery.text).toMatch(/'global:SYNC_STALLED:'\s*\|\|/i);
    expect(globalQuery.text).toMatch(/floor\(extract\(epoch\s+from\s+a\.raised_at\)\s*\*\s*1e6\)::bigint/i);
  });

  test("pending-ingestion query excludes wizard-scoped and sub-hour rows with SQL-computed keys", async () => {
    const { sql, calls } = fakeSql();

    await listRealtimeCandidates(sql);

    const pendingQuery = calls[2]!;
    expect(pendingQuery.text).toMatch(/from\s+public\.pending_ingestions/i);
    expect(pendingQuery.text).toMatch(/wizard_session_id\s+is\s+null/i);
    expect(pendingQuery.text).toMatch(/now\(\)\s*-\s*first_seen_at\s*>\s*interval\s+'1 hour'/i);
    expect(pendingQuery.text).toMatch(/'ingestion:'\s*\|\|\s*drive_file_id/i);
    expect(pendingQuery.text).toMatch(/floor\(extract\(epoch\s+from\s+first_seen_at\)\s*\*\s*1e6\)::bigint/i);
  });

  test("thrown SQL fault returns infra_error and never throws", async () => {
    const sql = vi.fn(() => Promise.reject(new Error("db down"))) as unknown as CandidateSql;

    await expect(listRealtimeCandidates(sql)).resolves.toEqual({ kind: "infra_error" });
  });
});

const DB_URL = process.env.TEST_DATABASE_URL;

describe("listRealtimeCandidates real DB filters", () => {
  test.skipIf(!DB_URL)(
    "returns show, global, and pending candidates while excluding resolved/inactive/wizard/new rows",
    async () => {
      const sql = postgres(DB_URL!, { max: 1, prepare: false });
      const suffix = `candidates-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const showDrive = `drive-${suffix}`;
      const archivedDrive = `archived-${suffix}`;
      const unpublishedDrive = `unpublished-${suffix}`;
      const pendingDrive = `pending-${suffix}`;

      try {
        const [show] = await sql<{ id: string }[]>`
          insert into public.shows (drive_file_id, slug, title, client_label, template_version, published, archived)
          values (${showDrive}, ${`show-${suffix}`}, 'Candidate Show', 'Client', 'v4', true, false)
          returning id
        `;
        const [archived] = await sql<{ id: string }[]>`
          insert into public.shows (drive_file_id, slug, title, client_label, template_version, published, archived)
          values (${archivedDrive}, ${`archived-${suffix}`}, 'Archived Show', 'Client', 'v4', true, true)
          returning id
        `;
        const [unpublished] = await sql<{ id: string }[]>`
          insert into public.shows (drive_file_id, slug, title, client_label, template_version, published, archived)
          values (${unpublishedDrive}, ${`unpublished-${suffix}`}, 'Unpublished Show', 'Client', 'v4', false, false)
          returning id
        `;
        await sql`
          insert into public.admin_alerts (show_id, code, context, raised_at)
          values
            (${show!.id}::uuid, 'SHEET_UNAVAILABLE', '{"sheet_name":"Candidate Show"}'::jsonb, now() - interval '2 hours'),
            (${show!.id}::uuid, 'DRIVE_FETCH_FAILED', '{}'::jsonb, now() - interval '2 hours'),
            (${archived!.id}::uuid, 'SHEET_UNAVAILABLE', '{}'::jsonb, now() - interval '2 hours'),
            (${unpublished!.id}::uuid, 'SHEET_UNAVAILABLE', '{}'::jsonb, now() - interval '2 hours'),
            (null, 'SYNC_STALLED', '{}'::jsonb, now() - interval '2 hours')
        `;
        await sql`
          update public.admin_alerts
             set resolved_at = now()
           where show_id = ${show!.id}::uuid
             and code = 'DRIVE_FETCH_FAILED'
        `;
        await sql`
          insert into public.pending_ingestions (
            drive_file_id, drive_file_name, first_seen_at, last_error_code, last_error_message, wizard_session_id
          )
          values
            (${pendingDrive}, 'Pending Sheet', now() - interval '2 hours', 'SHEET_PROCESS_FAILED', 'failed', null),
            (${`new-${pendingDrive}`}, 'New Sheet', now(), 'SHEET_PROCESS_FAILED', 'failed', null),
            (${`wizard-${pendingDrive}`}, 'Wizard Sheet', now() - interval '2 hours', 'SHEET_PROCESS_FAILED', 'failed', gen_random_uuid())
        `;

        const result = await listRealtimeCandidates(sql as unknown as CandidateSql);
        expect(result.kind).toBe("ok");
        if (result.kind !== "ok") return;
        expect(result.candidates.map((candidate) => candidate.kind).sort()).toEqual([
          "global",
          "ingestion",
          "show",
        ]);
        expect(result.candidates.some((candidate) => candidate.dedupKey.includes(pendingDrive))).toBe(
          true,
        );
        expect(result.candidates.some((candidate) => candidate.dedupKey.includes("DRIVE_FETCH_FAILED"))).toBe(
          false,
        );
      } finally {
        await sql`delete from public.pending_ingestions where drive_file_id like ${`%${suffix}%`}`;
        await sql`delete from public.shows where drive_file_id like ${`%${suffix}%`}`;
        await sql.end({ timeout: 5 });
      }
    },
  );
});
