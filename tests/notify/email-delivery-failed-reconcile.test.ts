import postgres from "postgres";
import { describe, expect, test, vi } from "vitest";
import {
  reconcileEmailDeliveryState,
  type ChannelToggleState,
  type EmailDeliveryFailedSql,
  type EmailDeliveryStateInput,
} from "@/lib/notify/detect/emailDeliveryFailed";
import { deliverDigest, type DeliverySql } from "@/lib/notify/deliver";
import { mintIdFor } from "@/lib/sync/unpublishBinding";

type ScopeRow = { show_id: string | null };

const ENABLED: ChannelToggleState = { kind: "enabled" };
const DISABLED: ChannelToggleState = { kind: "disabled" };
const UNKNOWN: ChannelToggleState = { kind: "unknown" };

function triState(input: {
  sync?: ChannelToggleState;
  digest?: ChannelToggleState;
  undo?: ChannelToggleState;
  configValid?: boolean;
  todayET?: string;
}): EmailDeliveryStateInput {
  return {
    alertOnSyncProblems: input.sync ?? ENABLED,
    dailyReviewDigest: input.digest ?? DISABLED,
    alertOnAutoPublish: input.undo ?? DISABLED,
    configValid: input.configValid ?? true,
    todayET: input.todayET ?? "2026-06-02",
  };
}

type UndoRow = { mint_id: string | null; live_token: string | null };

function fakeSql(
  options: {
    scopes?: ScopeRow[];
    // Query A (realtime_problem/digest currentness). A function receives the
    // boolean channel flags the reconciler passed on THIS evaluation pass
    // (pessimistic: unknown→disabled; optimistic: unknown→enabled), so
    // tri-state tests can model rows whose currentness hinges on one flag.
    currentByScope?: Record<
      string,
      boolean | ((flags: { sync: boolean; digest: boolean }) => boolean)
    >;
    // Query B (auto_publish_undo candidate rows; the mintId compare happens
    // in memory in the reconciler).
    undoRowsByScope?: Record<string, UndoRow[]>;
    throwOn?: "scopes" | "current";
  } = {},
) {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const scopes = options.scopes ?? [{ show_id: "show-a" }, { show_id: null }];
  const currentByScope = options.currentByScope ?? { "show-a": true, null: false };
  const undoRowsByScope = options.undoRowsByScope ?? {};
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = String.raw(strings, ...values.map((_value, index) => `$${index + 1}`));
    calls.push({ text, values });
    if (/failed_scopes/i.test(text)) {
      if (options.throwOn === "scopes") return Promise.reject(new Error("scope read failed"));
      return Promise.resolve(scopes);
    }
    if (/auto_publish_undo/i.test(text)) {
      if (options.throwOn === "current") return Promise.reject(new Error("current read failed"));
      const key = String(values[0] ?? "null");
      return Promise.resolve(undoRowsByScope[key] ?? []);
    }
    if (/from\s+public\.email_deliveries\s+e/i.test(text)) {
      if (options.throwOn === "current") return Promise.reject(new Error("current read failed"));
      const key = String(values[0] ?? "null");
      const entry = currentByScope[key];
      // The two boolean params of Query A are the sync + digest channel flags,
      // in that order (the showId param repeats, so filter by type).
      const flags = values.filter((value) => typeof value === "boolean");
      const current =
        typeof entry === "function"
          ? entry({ sync: flags[0] === true, digest: flags[1] === true })
          : entry;
      return Promise.resolve(current ? [{ exists: true }] : []);
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

    const result = await reconcileEmailDeliveryState(triState({ sync: ENABLED, digest: ENABLED }), {
      sql,
      upsertAdminAlert,
      resolveAdminAlert,
    });

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
    const { sql, calls } = fakeSql({
      scopes: [{ show_id: "show-from-open-alert" }],
      currentByScope: {},
    });
    const resolveAdminAlert = vi.fn();

    await reconcileEmailDeliveryState(triState({ sync: ENABLED, digest: ENABLED }), {
      sql,
      resolveAdminAlert,
      upsertAdminAlert: vi.fn(),
    });

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

    await reconcileEmailDeliveryState(triState({ sync: DISABLED, digest: ENABLED }), {
      sql,
      upsertAdminAlert: vi.fn(),
      resolveAdminAlert: vi.fn(),
    });

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
    expect(currentQuery?.text).toMatch(
      /floor\(extract\(epoch\s+from\s+a\.raised_at\)\s*\*\s*1e6\)::bigint/i,
    );
    expect(currentQuery?.text).toMatch(
      /floor\(extract\(epoch\s+from\s+pi\.first_seen_at\)\s*\*\s*1e6\)::bigint/i,
    );
    expect(currentQuery?.text).not.toMatch(/Date\.parse/i);
  });

  test("EMAIL_NOT_CONFIGURED opens only when config is invalid and at least one email tier is enabled", async () => {
    const upsertAdminAlert = vi.fn();
    const resolveAdminAlert = vi.fn();

    await reconcileEmailDeliveryState(
      triState({ sync: DISABLED, digest: ENABLED, configValid: false }),
      { ...fakeSql({ scopes: [] }), upsertAdminAlert, resolveAdminAlert },
    );
    await reconcileEmailDeliveryState(
      triState({ sync: DISABLED, digest: DISABLED, configValid: false }),
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

    const result = await reconcileEmailDeliveryState(triState({}), {
      sql,
      resolveAdminAlert,
      upsertAdminAlert: vi.fn(),
    });

    expect(result).toMatchObject({ kind: "ok", resolved: 2 });
    expect(resolveAdminAlert).toHaveBeenCalledWith({
      showId: "show-recovered",
      code: "EMAIL_DELIVERY_FAILED",
    });
  });

  test("returned wrapper errors and thrown SQL faults return infra_error without throwing", async () => {
    await expect(
      reconcileEmailDeliveryState(triState({ sync: ENABLED, digest: ENABLED }), {
        ...fakeSql({ throwOn: "current" }),
        upsertAdminAlert: vi.fn(),
        resolveAdminAlert: vi.fn(),
      }),
    ).resolves.toEqual({ kind: "infra_error" });

    await expect(
      reconcileEmailDeliveryState(
        triState({ sync: ENABLED, digest: ENABLED, configValid: false }),
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

// ---------------------------------------------------------------------------
// M12.13 spec §4.3b — kind-aware undo reconciliation + tri-state semantics.
// The mintId compare (exact mint identity) happens IN MEMORY against the live
// token the undo query returns; unknown channels make a scope un-resolvable
// (R11) and keep EMAIL_NOT_CONFIGURED honest (R16).
// ---------------------------------------------------------------------------

describe("reconcileEmailDeliveryState — undo channel + tri-state (M12.13 §4.3b)", () => {
  const LIVE_TOKEN = "tok-live-fixture";

  test("failed undo row is CURRENT only when the LIVE token's hash equals context.mintId (in-memory compare)", async () => {
    const upsertAdminAlert = vi.fn();
    const resolveAdminAlert = vi.fn();
    const { sql } = fakeSql({
      scopes: [{ show_id: "show-undo" }],
      currentByScope: { "show-undo": false },
      undoRowsByScope: {
        "show-undo": [{ mint_id: mintIdFor(LIVE_TOKEN), live_token: LIVE_TOKEN }],
      },
    });

    const result = await reconcileEmailDeliveryState(triState({ sync: ENABLED, undo: ENABLED }), {
      sql,
      upsertAdminAlert,
      resolveAdminAlert,
    });

    expect(result).toMatchObject({ kind: "ok", opened: 1 });
    expect(upsertAdminAlert).toHaveBeenCalledWith({
      showId: "show-undo",
      code: "EMAIL_DELIVERY_FAILED",
      context: {},
    });
    expect(resolveAdminAlert).not.toHaveBeenCalledWith({
      showId: "show-undo",
      code: "EMAIL_DELIVERY_FAILED",
    });
  });

  test("re-minted token (stale context.mintId vs live token) is NON-current → scope resolves", async () => {
    const upsertAdminAlert = vi.fn();
    const resolveAdminAlert = vi.fn();
    const { sql } = fakeSql({
      scopes: [{ show_id: "show-undo" }],
      currentByScope: { "show-undo": false },
      undoRowsByScope: {
        "show-undo": [{ mint_id: mintIdFor("tok-prior-mint"), live_token: LIVE_TOKEN }],
      },
    });

    await reconcileEmailDeliveryState(triState({ sync: ENABLED, undo: ENABLED }), {
      sql,
      upsertAdminAlert,
      resolveAdminAlert,
    });

    expect(upsertAdminAlert).not.toHaveBeenCalledWith(
      expect.objectContaining({ showId: "show-undo", code: "EMAIL_DELIVERY_FAILED" }),
    );
    expect(resolveAdminAlert).toHaveBeenCalledWith({
      showId: "show-undo",
      code: "EMAIL_DELIVERY_FAILED",
    });
  });

  test("undo channel DISABLED never issues the undo currentness query → scope resolves", async () => {
    const resolveAdminAlert = vi.fn();
    const { sql, calls } = fakeSql({
      scopes: [{ show_id: "show-undo" }],
      currentByScope: { "show-undo": false },
      undoRowsByScope: {
        "show-undo": [{ mint_id: mintIdFor(LIVE_TOKEN), live_token: LIVE_TOKEN }],
      },
    });

    await reconcileEmailDeliveryState(triState({ sync: ENABLED, undo: DISABLED }), {
      sql,
      upsertAdminAlert: vi.fn(),
      resolveAdminAlert,
    });

    expect(calls.some((c) => /auto_publish_undo/i.test(c.text))).toBe(false);
    expect(resolveAdminAlert).toHaveBeenCalledWith({
      showId: "show-undo",
      code: "EMAIL_DELIVERY_FAILED",
    });
  });

  test("R11: unknown SYNC channel leaves the shared per-scope alert UNTOUCHED while its realtime row may be current", async () => {
    const upsertAdminAlert = vi.fn();
    const resolveAdminAlert = vi.fn();
    const { sql } = fakeSql({
      scopes: [{ show_id: "show-shared" }],
      // The realtime row is current exactly when the sync flag is treated as
      // enabled — i.e. only on the optimistic pass while the toggle is unknown.
      currentByScope: { "show-shared": (flags) => flags.sync },
    });

    await reconcileEmailDeliveryState(triState({ sync: UNKNOWN, undo: ENABLED }), {
      sql,
      upsertAdminAlert,
      resolveAdminAlert,
    });

    expect(upsertAdminAlert).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: "EMAIL_DELIVERY_FAILED" }),
    );
    expect(resolveAdminAlert).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: "EMAIL_DELIVERY_FAILED" }),
    );
  });

  test("R11 symmetric: unknown UNDO channel with a possibly-current undo row leaves the alert untouched", async () => {
    const upsertAdminAlert = vi.fn();
    const resolveAdminAlert = vi.fn();
    const { sql } = fakeSql({
      scopes: [{ show_id: "show-shared" }],
      currentByScope: { "show-shared": false },
      undoRowsByScope: {
        "show-shared": [{ mint_id: mintIdFor(LIVE_TOKEN), live_token: LIVE_TOKEN }],
      },
    });

    await reconcileEmailDeliveryState(triState({ sync: ENABLED, undo: UNKNOWN }), {
      sql,
      upsertAdminAlert,
      resolveAdminAlert,
    });

    expect(upsertAdminAlert).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: "EMAIL_DELIVERY_FAILED" }),
    );
    expect(resolveAdminAlert).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: "EMAIL_DELIVERY_FAILED" }),
    );
  });

  test("unknown channel does NOT block resolution when the scope is known non-current under BOTH passes", async () => {
    const resolveAdminAlert = vi.fn();
    const { sql } = fakeSql({
      scopes: [{ show_id: "show-dead" }],
      currentByScope: { "show-dead": false },
      // Undo rows whose other conditions fail return no candidate rows at all,
      // so even the optimistic pass finds nothing — expiry/consumption resolve
      // regardless of the unknown toggle.
      undoRowsByScope: { "show-dead": [] },
    });

    await reconcileEmailDeliveryState(triState({ sync: ENABLED, undo: UNKNOWN }), {
      sql,
      upsertAdminAlert: vi.fn(),
      resolveAdminAlert,
    });

    expect(resolveAdminAlert).toHaveBeenCalledWith({
      showId: "show-dead",
      code: "EMAIL_DELIVERY_FAILED",
    });
  });

  test("undo currentness SQL pins per-row recipient strictness, mintId presence, context-expiry window, and show state", async () => {
    const { sql, calls } = fakeSql({
      scopes: [{ show_id: "show-undo" }],
      currentByScope: { "show-undo": false },
    });

    await reconcileEmailDeliveryState(triState({ undo: ENABLED }), {
      sql,
      upsertAdminAlert: vi.fn(),
      resolveAdminAlert: vi.fn(),
    });

    const undoQuery = calls.find((c) => /auto_publish_undo/i.test(c.text));
    expect(undoQuery).toBeDefined();
    expect(undoQuery?.text).toMatch(/kind\s*=\s*'auto_publish_undo'/i);
    expect(undoQuery?.text).toMatch(/status\s*=\s*'failed'/i);
    // R4 per-row strictness: the failed row's OWN recipient must still be an
    // active admin — never "any active recipient exists".
    expect(undoQuery?.text).toMatch(/ae\.email\s*=\s*e\.recipient/i);
    expect(undoQuery?.text).toMatch(/revoked_at\s+is\s+null/i);
    // Rows WITHOUT context.mintId are non-current by construction.
    expect(undoQuery?.text).toMatch(/context\s*\?\s*'mintId'/i);
    expect(undoQuery?.text).toMatch(/'expires_at'\)::timestamptz\s*>\s*now\(\)/i);
    expect(undoQuery?.text).toMatch(/unpublish_token\s+is\s+not\s+null/i);
    expect(undoQuery?.text).toMatch(/published\s+is\s+true/i);
    expect(undoQuery?.text).toMatch(/archived\s+is\s+false/i);
  });

  test("R16: EMAIL_NOT_CONFIGURED opens on config-invalid while the undo toggle read is UNKNOWN and the others are known-off", async () => {
    const upsertAdminAlert = vi.fn();
    const resolveAdminAlert = vi.fn();

    await reconcileEmailDeliveryState(
      triState({ sync: DISABLED, digest: DISABLED, undo: UNKNOWN, configValid: false }),
      { ...fakeSql({ scopes: [] }), upsertAdminAlert, resolveAdminAlert },
    );

    expect(upsertAdminAlert).toHaveBeenCalledWith({
      showId: null,
      code: "EMAIL_NOT_CONFIGURED",
      context: {},
    });
    expect(resolveAdminAlert).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: "EMAIL_NOT_CONFIGURED" }),
    );
  });

  test("EMAIL_NOT_CONFIGURED opens when ONLY the undo toggle is enabled and config is invalid; resolves when all three are KNOWN disabled", async () => {
    const opensUpsert = vi.fn();
    await reconcileEmailDeliveryState(
      triState({ sync: DISABLED, digest: DISABLED, undo: ENABLED, configValid: false }),
      { ...fakeSql({ scopes: [] }), upsertAdminAlert: opensUpsert, resolveAdminAlert: vi.fn() },
    );
    expect(opensUpsert).toHaveBeenCalledWith({
      showId: null,
      code: "EMAIL_NOT_CONFIGURED",
      context: {},
    });

    const resolves = vi.fn();
    await reconcileEmailDeliveryState(
      triState({ sync: DISABLED, digest: DISABLED, undo: DISABLED, configValid: false }),
      { ...fakeSql({ scopes: [] }), upsertAdminAlert: vi.fn(), resolveAdminAlert: resolves },
    );
    expect(resolves).toHaveBeenCalledWith({ showId: null, code: "EMAIL_NOT_CONFIGURED" });
  });

  test("EMAIL_NOT_CONFIGURED resolves on VALID config even while toggle reads are unknown", async () => {
    const resolveAdminAlert = vi.fn();

    await reconcileEmailDeliveryState(
      triState({ sync: UNKNOWN, digest: UNKNOWN, undo: UNKNOWN, configValid: true }),
      { ...fakeSql({ scopes: [] }), upsertAdminAlert: vi.fn(), resolveAdminAlert },
    );

    expect(resolveAdminAlert).toHaveBeenCalledWith({
      showId: null,
      code: "EMAIL_NOT_CONFIGURED",
    });
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
        // Compute the μs-epoch IN SQL from the STORED raised_at (the same way the
        // candidate query + reconciliation do). Round-tripping raised_at through a JS
        // Date (ms precision) would truncate the sub-ms digits and produce a dedup_key
        // epoch that no longer matches the reconciliation's μs-precise recompute.
        const [alert] = await sql<{ id: string; us: string }[]>`
          insert into public.admin_alerts (show_id, code, context, raised_at)
          values (${show!.id}::uuid, 'SHEET_UNAVAILABLE', '{}'::jsonb, now() - interval '2 hours')
          returning id, (floor(extract(epoch from raised_at) * 1e6)::bigint)::text as us
        `;
        await sql`insert into public.admin_emails (email) values (${recipient}) on conflict do nothing`;
        await sql`
          insert into public.email_deliveries (
            kind, channel, dedup_key, show_id, recipient, triggered_codes, context, status, error, attempt_count
          )
          values (
            'realtime_problem', 'email',
            ${`${show!.id}:SHEET_UNAVAILABLE:${alert!.us}`}, ${show!.id}::uuid,
            ${recipient}, array['SHEET_UNAVAILABLE']::text[], '{}'::jsonb, 'failed', 'provider', 1
          )
        `;

        await expect(
          reconcileEmailDeliveryState(triState({}), {
            sql: sql as unknown as EmailDeliveryFailedSql,
          }),
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
          reconcileEmailDeliveryState(triState({}), {
            sql: sql as unknown as EmailDeliveryFailedSql,
          }),
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

  test.skipIf(!DB_URL)(
    "opens and resolves this test's NULL-scope digest delivery-failed alert as the digest row changes from failed to sent",
    async () => {
      const sql = postgres(DB_URL!, { max: 1, prepare: false });
      const suffix = `digest-delivery-failed-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const recipient = `notify-${suffix}@example.com`;
      const driveFileId = `pending-${suffix}`;
      const todayET = "2026-06-02";
      const model = {
        recipient,
        dateET: todayET,
        shows: [{ showTitle: "Digest Pending Sheet", slug: null, items: ["Sheet needs review"] }],
        sourceTotals: { ingestions: 1, syncs: 0, shows: 1 },
      };
      let openedByTest = false;

      try {
        const preexisting = await sql<{ id: string }[]>`
          select id
            from public.admin_alerts
           where show_id is null
             and code = 'EMAIL_DELIVERY_FAILED'
             and resolved_at is null
        `;
        if (preexisting.length > 0) return;

        await sql`insert into public.admin_emails (email) values (${recipient}) on conflict do nothing`;
        await sql`
          insert into public.pending_ingestions (
            drive_file_id, drive_file_name, first_seen_at, last_error_code, last_error_message, wizard_session_id
          )
          values (${driveFileId}, 'Digest Pending Sheet', now() - interval '2 hours', 'SHEET_PROCESS_FAILED', 'failed', null)
        `;

        await expect(
          deliverDigest(
            { model, origin: "https://crew.fxav.app" },
            {
              sql: sql as unknown as DeliverySql,
              sendEmail: async () => ({ ok: false, kind: "infra_error", message: "provider down" }),
              upsertAdminAlert: async () => null,
            },
          ),
        ).resolves.toMatchObject({ kind: "ok", failed: 1 });

        let rows = await sql<{ status: string }[]>`
          select status
            from public.email_deliveries
           where kind = 'digest'
             and dedup_key = ${`digest:${todayET}`}
             and recipient = ${recipient}
             and show_id is null
        `;
        expect(rows).toEqual([{ status: "failed" }]);

        await expect(
          reconcileEmailDeliveryState(triState({ sync: DISABLED, digest: ENABLED, todayET }), {
            sql: sql as unknown as EmailDeliveryFailedSql,
          }),
        ).resolves.toMatchObject({ kind: "ok" });
        rows = await sql<{ status: string }[]>`
          select 'open' as status
            from public.admin_alerts
           where show_id is null
             and code = 'EMAIL_DELIVERY_FAILED'
             and resolved_at is null
        `;
        expect(rows.length).toBe(1);
        openedByTest = true;

        await expect(
          deliverDigest(
            { model, origin: "https://crew.fxav.app" },
            {
              sql: sql as unknown as DeliverySql,
              sendEmail: async () => ({ ok: true, messageId: `msg-${suffix}` }),
              upsertAdminAlert: async () => null,
            },
          ),
        ).resolves.toMatchObject({ kind: "ok", sent: 1 });

        await expect(
          reconcileEmailDeliveryState(triState({ sync: DISABLED, digest: ENABLED, todayET }), {
            sql: sql as unknown as EmailDeliveryFailedSql,
          }),
        ).resolves.toMatchObject({ kind: "ok" });
        rows = await sql<{ status: string }[]>`
          select 'open' as status
            from public.admin_alerts
           where show_id is null
             and code = 'EMAIL_DELIVERY_FAILED'
             and resolved_at is null
        `;
        expect(rows.length).toBe(0);
      } finally {
        if (openedByTest) {
          await sql`
            update public.admin_alerts
               set resolved_at = coalesce(resolved_at, now())
             where show_id is null
               and code = 'EMAIL_DELIVERY_FAILED'
               and resolved_at is null
          `;
        }
        await sql`delete from public.email_deliveries where recipient = ${recipient}`;
        await sql`delete from public.admin_emails where email = ${recipient}`;
        await sql`delete from public.pending_ingestions where drive_file_id = ${driveFileId}`;
        await sql.end({ timeout: 5 });
      }
    },
  );
});
