import postgres from "postgres";
import { describe, expect, test, vi } from "vitest";
import {
  reconcileEmailDeliveryState,
  type EmailDeliveryFailedSql,
} from "@/lib/notify/detect/emailDeliveryFailed";

type ScopeRow = { show_id: string | null };

function fakeSql(options: {
  scopes?: ScopeRow[];
  currentByScope?: Record<string, boolean>;
  throwOn?: "scopes" | "current";
} = {}) {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const scopes = options.scopes ?? [{ show_id: "show-a" }, { show_id: null }];
  const currentByScope = options.currentByScope ?? { "show-a": true, null: false };
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = String.raw(strings, ...values.map((_value, index) => `$${index + 1}`));
    calls.push({ text, values });
    if (/failed_scopes/i.test(text)) {
      if (options.throwOn === "scopes") return Promise.reject(new Error("scope read failed"));
      return Promise.resolve(scopes);
    }
    if (/from\s+public\.email_deliveries\s+e/i.test(text)) {
      if (options.throwOn === "current") return Promise.reject(new Error("current read failed"));
      const key = String(values[0] ?? "null");
      return Promise.resolve(currentByScope[key] ? [{ exists: true }] : []);
    }
    return Promise.resolve([]);
  }) as unknown as EmailDeliveryFailedSql;
  return { sql, calls };
}

describe("reconcileEmailDeliveryState", () => {
  test("opens per-scope EMAIL_DELIVERY_FAILED only while a current failed row exists and resolves stale scopes", async () => {
    const { sql } = fakeSql({
      scopes: [{ show_id: "show-a" }, { show_id: "show-b" }, { show_id: null }],
      currentByScope: { "show-a": true, "show-b": false, null: true },
    });
    const upsertAdminAlert = vi.fn();
    const resolveAdminAlert = vi.fn();

    const result = await reconcileEmailDeliveryState(
      {
        alertOnSyncProblems: true,
        dailyReviewDigest: true,
        configValid: true,
        todayET: "2026-06-02",
      },
      { sql, upsertAdminAlert, resolveAdminAlert },
    );

    expect(result).toEqual({ kind: "ok", opened: 2, resolved: 2 });
    expect(upsertAdminAlert).toHaveBeenCalledWith({
      showId: "show-a",
      code: "EMAIL_DELIVERY_FAILED",
      context: {},
    });
    expect(upsertAdminAlert).toHaveBeenCalledWith({
      showId: null,
      code: "EMAIL_DELIVERY_FAILED",
      context: {},
    });
    expect(resolveAdminAlert).toHaveBeenCalledWith({
      showId: "show-b",
      code: "EMAIL_DELIVERY_FAILED",
    });
    expect(resolveAdminAlert).toHaveBeenCalledWith({
      showId: null,
      code: "EMAIL_NOT_CONFIGURED",
    });
  });

  test("enumerates the union of failed-row scopes and open EMAIL_DELIVERY_FAILED alert scopes", async () => {
    const { sql, calls } = fakeSql({ scopes: [{ show_id: "show-from-open-alert" }], currentByScope: {} });
    const resolveAdminAlert = vi.fn();

    await reconcileEmailDeliveryState(
      {
        alertOnSyncProblems: true,
        dailyReviewDigest: true,
        configValid: true,
        todayET: "2026-06-02",
      },
      { sql, resolveAdminAlert, upsertAdminAlert: vi.fn() },
    );

    expect(calls[0]?.text).toMatch(/failed_scopes/i);
    expect(calls[0]?.text).toMatch(/status\s*=\s*'failed'/i);
    expect(calls[0]?.text).toMatch(/open_alert_scopes/i);
    expect(calls[0]?.text).toMatch(/code\s*=\s*'EMAIL_DELIVERY_FAILED'/i);
    expect(resolveAdminAlert).toHaveBeenCalledWith({
      showId: "show-from-open-alert",
      code: "EMAIL_DELIVERY_FAILED",
    });
  });

  test("currentness query is recipient-active, toggle-aware, occurrence-exact, and excludes wizard rows", async () => {
    const { sql, calls } = fakeSql();

    await reconcileEmailDeliveryState(
      {
        alertOnSyncProblems: false,
        dailyReviewDigest: true,
        configValid: true,
        todayET: "2026-06-02",
      },
      { sql, upsertAdminAlert: vi.fn(), resolveAdminAlert: vi.fn() },
    );

    const currentQuery = calls.find((c) => /from\s+public\.email_deliveries\s+e/i.test(c.text));
    expect(currentQuery?.values).toContain(false);
    expect(currentQuery?.values).toContain(true);
    expect(currentQuery?.values).toContain("digest:2026-06-02");
    expect(currentQuery?.text).toMatch(/from\s+public\.admin_emails/i);
    expect(currentQuery?.text).toMatch(/revoked_at\s+is\s+null/i);
    expect(currentQuery?.text).toMatch(/s\.published\s+is\s+true/i);
    expect(currentQuery?.text).toMatch(/s\.archived\s+is\s+false/i);
    expect(currentQuery?.text).toMatch(/'global:SYNC_STALLED:'\s*\|\|/i);
    expect(currentQuery?.text).toMatch(/'ingestion:'\s*\|\|\s*pi\.drive_file_id/i);
    expect(currentQuery?.text).toMatch(/wizard_session_id\s+is\s+null/i);
    expect(currentQuery?.text).toMatch(/floor\(extract\(epoch\s+from\s+a\.raised_at\)\s*\*\s*1e6\)::bigint/i);
    expect(currentQuery?.text).toMatch(/floor\(extract\(epoch\s+from\s+pi\.first_seen_at\)\s*\*\s*1e6\)::bigint/i);
    expect(currentQuery?.text).not.toMatch(/Date\.parse/i);
  });

  test("EMAIL_NOT_CONFIGURED opens only when config is invalid and at least one email tier is enabled", async () => {
    const upsertAdminAlert = vi.fn();
    const resolveAdminAlert = vi.fn();

    await reconcileEmailDeliveryState(
      {
        alertOnSyncProblems: false,
        dailyReviewDigest: true,
        configValid: false,
        todayET: "2026-06-02",
      },
      { ...fakeSql({ scopes: [] }), upsertAdminAlert, resolveAdminAlert },
    );
    await reconcileEmailDeliveryState(
      {
        alertOnSyncProblems: false,
        dailyReviewDigest: false,
        configValid: false,
        todayET: "2026-06-02",
      },
      { ...fakeSql({ scopes: [] }), upsertAdminAlert, resolveAdminAlert },
    );

    expect(upsertAdminAlert).toHaveBeenCalledWith({
      showId: null,
      code: "EMAIL_NOT_CONFIGURED",
      context: {},
    });
    expect(resolveAdminAlert).toHaveBeenCalledWith({
      showId: null,
      code: "EMAIL_NOT_CONFIGURED",
    });
  });

  test("failed-to-sent recovery resolves stale open alerts by visiting open-alert scopes even with no failed rows", async () => {
    const { sql } = fakeSql({
      scopes: [{ show_id: "show-recovered" }],
      currentByScope: { "show-recovered": false },
    });
    const resolveAdminAlert = vi.fn();

    const result = await reconcileEmailDeliveryState(
      {
        alertOnSyncProblems: true,
        dailyReviewDigest: false,
        configValid: true,
        todayET: "2026-06-02",
      },
      { sql, resolveAdminAlert, upsertAdminAlert: vi.fn() },
    );

    expect(result).toMatchObject({ kind: "ok", resolved: 2 });
    expect(resolveAdminAlert).toHaveBeenCalledWith({
      showId: "show-recovered",
      code: "EMAIL_DELIVERY_FAILED",
    });
  });

  test("returned wrapper errors and thrown SQL faults return infra_error without throwing", async () => {
    await expect(
      reconcileEmailDeliveryState(
        { alertOnSyncProblems: true, dailyReviewDigest: true, configValid: true, todayET: "2026-06-02" },
        { ...fakeSql({ throwOn: "current" }), upsertAdminAlert: vi.fn(), resolveAdminAlert: vi.fn() },
      ),
    ).resolves.toEqual({ kind: "infra_error" });

    await expect(
      reconcileEmailDeliveryState(
        { alertOnSyncProblems: true, dailyReviewDigest: true, configValid: false, todayET: "2026-06-02" },
        {
          ...fakeSql({ scopes: [] }),
          upsertAdminAlert: async () => {
            throw new Error("returned error");
          },
          resolveAdminAlert: vi.fn(),
        },
      ),
    ).resolves.toEqual({ kind: "infra_error" });
  });
});

const DB_URL = process.env.TEST_DATABASE_URL;

describe("EMAIL_DELIVERY_FAILED reconciliation real DB", () => {
  test.skipIf(!DB_URL)(
    "opens and resolves only this test's show-scoped delivery-failed alert as currentness changes",
    async () => {
      const sql = postgres(DB_URL!, { max: 1, prepare: false });
      const suffix = `email-delivery-failed-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const driveFileId = `drive-${suffix}`;
      const recipient = `notify-${suffix}@example.com`;

      try {
        const [show] = await sql<{ id: string }[]>`
          insert into public.shows (drive_file_id, slug, title, client_label, template_version, published, archived)
          values (${driveFileId}, ${`show-${suffix}`}, 'Delivery Failed Show', 'Client', 'v4', true, false)
          returning id
        `;
        const [alert] = await sql<{ id: string; raised_at: Date }[]>`
          insert into public.admin_alerts (show_id, code, context, raised_at)
          values (${show!.id}::uuid, 'SHEET_UNAVAILABLE', '{}'::jsonb, now() - interval '2 hours')
          returning id, raised_at
        `;
        await sql`insert into public.admin_emails (email) values (${recipient}) on conflict do nothing`;
        const [epoch] = await sql<{ us: string }[]>`
          select (floor(extract(epoch from ${alert!.raised_at}::timestamptz) * 1e6)::bigint)::text as us
        `;
        await sql`
          insert into public.email_deliveries (
            kind, channel, dedup_key, show_id, recipient, triggered_codes, context, status, error, attempt_count
          )
          values (
            'realtime_problem', 'email',
            ${`${show!.id}:SHEET_UNAVAILABLE:${epoch!.us}`}, ${show!.id}::uuid,
            ${recipient}, array['SHEET_UNAVAILABLE']::text[], '{}'::jsonb, 'failed', 'provider', 1
          )
        `;

        await expect(
          reconcileEmailDeliveryState(
            { alertOnSyncProblems: true, dailyReviewDigest: false, configValid: true, todayET: "2026-06-02" },
            { sql: sql as unknown as EmailDeliveryFailedSql },
          ),
        ).resolves.toMatchObject({ kind: "ok" });
        let rows = await sql<{ id: string }[]>`
          select id from public.admin_alerts
           where show_id = ${show!.id}::uuid
             and code = 'EMAIL_DELIVERY_FAILED'
             and resolved_at is null
        `;
        expect(rows.length).toBe(1);

        await sql`update public.email_deliveries set status = 'sent' where recipient = ${recipient}`;
        await expect(
          reconcileEmailDeliveryState(
            { alertOnSyncProblems: true, dailyReviewDigest: false, configValid: true, todayET: "2026-06-02" },
            { sql: sql as unknown as EmailDeliveryFailedSql },
          ),
        ).resolves.toMatchObject({ kind: "ok" });
        rows = await sql<{ id: string }[]>`
          select id from public.admin_alerts
           where show_id = ${show!.id}::uuid
             and code = 'EMAIL_DELIVERY_FAILED'
             and resolved_at is null
        `;
        expect(rows.length).toBe(0);
      } finally {
        await sql`delete from public.email_deliveries where recipient = ${recipient}`;
        await sql`delete from public.admin_emails where email = ${recipient}`;
        await sql`delete from public.shows where drive_file_id = ${driveFileId}`;
        await sql.end({ timeout: 5 });
      }
    },
  );
});
