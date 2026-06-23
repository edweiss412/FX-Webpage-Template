import postgres from "postgres";
import { describe, expect, test, vi } from "vitest";
import { DIGEST_MAX_ITEMS_PER_SHOW } from "@/lib/notify/constants";
import { buildDigestModel, type DigestBuilderSql } from "@/lib/notify/digest";

function fakeSql() {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = String.raw(strings, ...values.map((_value, index) => `$${index + 1}`));
    calls.push({ text, values });
    if (/from\s+public\.pending_ingestions/i.test(text)) {
      return Promise.resolve([
        {
          id: "ing-1",
          drive_file_id: "drive-new",
          drive_file_name: "New Sheet",
          last_error_code: "SHEET_PROCESS_FAILED",
          last_attempt_at: "2026-06-02T14:00:00.000Z",
          first_seen_at: "2026-06-02T13:00:00.123Z",
        },
      ]);
    }
    if (/from\s+public\.pending_syncs/i.test(text)) {
      return Promise.resolve([
        {
          staged_id: "sync-new",
          drive_file_id: "drive-first",
          candidate_title: "First Seen Show",
          staged_modified_time: "2026-06-02T13:00:00.000Z",
        },
        {
          staged_id: "sync-existing",
          drive_file_id: "drive-existing",
          candidate_title: "Existing Candidate",
          staged_modified_time: "2026-06-02T12:00:00.000Z",
        },
      ]);
    }
    if (/from\s+public\.shows/i.test(text)) {
      return Promise.resolve([
        {
          drive_file_id: "drive-existing",
          slug: "existing-show",
          title: "Existing Show",
          published: true,
          archived: false,
        },
      ]);
    }
    return Promise.resolve([]);
  }) as unknown as DigestBuilderSql;
  return { sql, calls };
}

describe("buildDigestModel", () => {
  test("mirrors needs-attention variants into digest groups and excludes only sent pending-ingestion items per recipient", async () => {
    const { sql, calls } = fakeSql();

    const result = await buildDigestModel(
      "doug@fxav.net",
      new Date("2026-06-02T12:00:00.000-04:00"),
      {
        sql,
      },
    );

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.model.sourceTotals).toEqual({ ingestions: 1, syncs: 2, shows: 3 });
    expect(result.model.shows).toEqual([
      {
        showTitle: "New Sheet",
        slug: null,
        items: [expect.stringContaining("sheet")],
      },
      {
        showTitle: "First Seen Show",
        slug: null,
        items: ["New show ready for review"],
      },
      {
        showTitle: "Existing Show",
        slug: "existing-show",
        items: ["Changes staged for review"],
      },
    ]);

    const ingestionQuery = calls.find((c) => /from\s+public\.pending_ingestions/i.test(c.text));
    expect(ingestionQuery?.values).toContain("doug@fxav.net");
    expect(ingestionQuery?.text).toMatch(/not\s+exists[\s\S]*email_deliveries/i);
    expect(ingestionQuery?.text).toMatch(/sent\.status\s*=\s*'sent'/i);
    expect(ingestionQuery?.text).toMatch(/sent\.recipient\s*=\s*\$1/i);
    expect(ingestionQuery?.text).toMatch(/'ingestion:'\s*\|\|\s*pi\.drive_file_id/i);
  });

  test("applies wizard_session_id IS NULL to both pending sources and does not exclude staged syncs via email ledger", async () => {
    const { sql, calls } = fakeSql();

    await buildDigestModel("doug@fxav.net", "2026-06-02", { sql });

    const ingestionQuery = calls.find((c) => /from\s+public\.pending_ingestions/i.test(c.text));
    const syncQuery = calls.find((c) => /from\s+public\.pending_syncs/i.test(c.text));
    expect(ingestionQuery?.text).toMatch(/pi\.wizard_session_id\s+is\s+null/i);
    expect(syncQuery?.text).toMatch(/ps\.wizard_session_id\s+is\s+null/i);
    expect(syncQuery?.text).not.toMatch(/email_deliveries/i);
  });

  test("returns no_send when the mirrored source has zero open items", async () => {
    const sql = vi.fn(() => Promise.resolve([])) as unknown as DigestBuilderSql;

    await expect(buildDigestModel("doug@fxav.net", "2026-06-02", { sql })).resolves.toEqual({
      kind: "no_send",
      sourceTotals: { ingestions: 0, syncs: 0, shows: 0 },
    });
  });

  test("overflow counts come from source totals, not rendered caps", async () => {
    const rows = Array.from({ length: DIGEST_MAX_ITEMS_PER_SHOW + 2 }, (_, index) => ({
      id: `ing-${index}`,
      drive_file_id: `drive-${index}`,
      drive_file_name: "Overflow Sheet",
      last_error_code: "SHEET_PROCESS_FAILED",
      last_attempt_at: `2026-06-02T14:${String(index).padStart(2, "0")}:00.000Z`,
      first_seen_at: `2026-06-02T13:${String(index).padStart(2, "0")}:00.000Z`,
    }));
    const sql = vi.fn((strings: TemplateStringsArray) => {
      const text = strings.join("$");
      if (text.includes("pending_ingestions")) return Promise.resolve(rows);
      return Promise.resolve([]);
    }) as unknown as DigestBuilderSql;

    const result = await buildDigestModel("doug@fxav.net", "2026-06-02", { sql });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.model.sourceTotals.ingestions).toBe(DIGEST_MAX_ITEMS_PER_SHOW + 2);
    expect(result.model.shows).toHaveLength(DIGEST_MAX_ITEMS_PER_SHOW + 2);
  });

  test("thrown SQL faults return infra_error and never throw", async () => {
    const sql = vi.fn(() => Promise.reject(new Error("db down"))) as unknown as DigestBuilderSql;

    await expect(buildDigestModel("doug@fxav.net", "2026-06-02", { sql })).resolves.toEqual({
      kind: "infra_error",
    });
  });
});

const DB_URL = process.env.TEST_DATABASE_URL;

describe("buildDigestModel real DB filters", () => {
  test.skipIf(!DB_URL)(
    "excludes wizard rows on both pending sources and excludes only this recipient's sent pending-ingestion item",
    async () => {
      const sql = postgres(DB_URL!, { max: 1, prepare: false });
      const suffix = `digest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const recipient = `digest-${suffix}@example.com`;
      const pendingDrive = `pending-${suffix}`;
      const sentDrive = `sent-${suffix}`;
      const syncDrive = `sync-${suffix}`;

      try {
        await sql`
          insert into public.pending_ingestions (
            drive_file_id, drive_file_name, first_seen_at, last_error_code, last_error_message, wizard_session_id
          )
          values
            (${pendingDrive}, 'Pending Digest Sheet', now() - interval '2 hours', 'SHEET_PROCESS_FAILED', 'failed', null),
            (${sentDrive}, 'Sent Digest Sheet', now() - interval '2 hours', 'SHEET_PROCESS_FAILED', 'failed', null),
            (${`wizard-${pendingDrive}`}, 'Wizard Digest Sheet', now() - interval '2 hours', 'SHEET_PROCESS_FAILED', 'failed', gen_random_uuid())
        `;
        await sql`
          insert into public.pending_syncs (
            drive_file_id, staged_modified_time, parse_result, triggered_review_items, source_kind, warning_summary, wizard_session_id
          )
          values
            (${syncDrive}, now(), '{"title":"Digest Sync"}'::jsonb, '[]'::jsonb, 'cron', '', null),
            (${`wizard-${syncDrive}`}, now(), '{"title":"Wizard Sync"}'::jsonb, '[]'::jsonb, 'onboarding_scan', '', gen_random_uuid())
        `;
        const [sentEpoch] = await sql<{ us: string }[]>`
          select (floor(extract(epoch from first_seen_at) * 1e6)::bigint)::text as us
            from public.pending_ingestions
           where drive_file_id = ${sentDrive}
        `;
        await sql`
          insert into public.email_deliveries (
            kind, channel, dedup_key, recipient, triggered_codes, context, status, provider_message_id, attempt_count, sent_at
          )
          values (
            'realtime_problem', 'email', ${`ingestion:${sentDrive}:${sentEpoch!.us}`},
            ${recipient}, array['SHEET_PROCESS_FAILED']::text[], '{}'::jsonb, 'sent', 'msg', 0, now()
          )
        `;

        const result = await buildDigestModel(recipient, "2026-06-02", {
          sql: sql as unknown as DigestBuilderSql,
        });
        expect(result.kind).toBe("ok");
        if (result.kind !== "ok") return;
        const titles = result.model.shows.map((show) => show.showTitle);
        expect(titles).toContain("Pending Digest Sheet");
        expect(titles).toContain("Digest Sync");
        expect(titles).not.toContain("Sent Digest Sheet");
        expect(titles).not.toContain("Wizard Digest Sheet");
        expect(titles).not.toContain("Wizard Sync");
      } finally {
        await sql`delete from public.email_deliveries where recipient = ${recipient}`;
        await sql`delete from public.pending_ingestions where drive_file_id like ${`%${suffix}%`}`;
        await sql`delete from public.pending_syncs where drive_file_id like ${`%${suffix}%`}`;
        await sql.end({ timeout: 5 });
      }
    },
  );
});
