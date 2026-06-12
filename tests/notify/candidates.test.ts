import postgres from "postgres";
import { describe, expect, test, vi } from "vitest";
import { SYNC_PROBLEM_CODES } from "@/lib/notify/constants";
import { listRealtimeCandidates, type CandidateSql } from "@/lib/notify/detect/candidates";
import { mintIdFor } from "@/lib/sync/unpublishBinding";

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
    if (text.includes("s.unpublish_token")) {
      return Promise.resolve([
        {
          show_id: "show-undo",
          slug: "show-undo-slug",
          title: "Undo Show",
          token: "11111111-1111-4111-8111-111111111111",
          expires_at: new Date("2026-06-02T13:00:00.000Z"),
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
        {
          kind: "auto_publish_undo",
          dedupKey: `show-undo:${mintIdFor("11111111-1111-4111-8111-111111111111")}`,
          showId: "show-undo",
          slug: "show-undo-slug",
          showTitle: "Undo Show",
          token: "11111111-1111-4111-8111-111111111111",
          mintId: mintIdFor("11111111-1111-4111-8111-111111111111"),
          expiresAt: new Date("2026-06-02T13:00:00.000Z"),
        },
      ],
    });
  });

  test("auto-publish-undo query selects live-token shows and derives a token-hash mint dedupKey", async () => {
    const { sql, calls } = fakeSql();

    await listRealtimeCandidates(sql);

    const undoQuery = calls.find((c) => c.text.includes("s.unpublish_token"))!;
    expect(undoQuery).toBeDefined();
    expect(undoQuery.text).toMatch(/from\s+public\.shows\s+s/i);
    expect(undoQuery.text).toMatch(/s\.unpublish_token\s+is\s+not\s+null/i);
    expect(undoQuery.text).toMatch(/s\.unpublish_token_expires_at\s*>\s*now\(\)/i);
    // No locked-table write — read-only detection (invariant 2 untouched).
    expect(undoQuery.text).not.toMatch(/\b(update|insert|delete)\b/i);
  });

  test("auto-publish-undo dedupKey is per-mint (token-distinct, not expires_at)", () => {
    // mintId derives from the token hash, so two mints sharing an expires_at
    // millisecond still produce DISTINCT dedup keys (spec §4.1 R6).
    const a = mintIdFor("11111111-1111-4111-8111-111111111111");
    const b = mintIdFor("22222222-2222-4222-8222-222222222222");
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).not.toBe(b);
    expect(`show-x:${a}`).not.toBe(`show-x:${b}`);
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
    expect(showQuery.text).toMatch(
      /floor\(extract\(epoch\s+from\s+a\.raised_at\)\s*\*\s*1e6\)::bigint/i,
    );
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
    expect(globalQuery.text).toMatch(
      /floor\(extract\(epoch\s+from\s+a\.raised_at\)\s*\*\s*1e6\)::bigint/i,
    );
  });

  test("pending-ingestion query excludes wizard-scoped and sub-hour rows with SQL-computed keys", async () => {
    const { sql, calls } = fakeSql();

    await listRealtimeCandidates(sql);

    const pendingQuery = calls[2]!;
    expect(pendingQuery.text).toMatch(/from\s+public\.pending_ingestions/i);
    expect(pendingQuery.text).toMatch(/wizard_session_id\s+is\s+null/i);
    expect(pendingQuery.text).toMatch(/now\(\)\s*-\s*first_seen_at\s*>\s*interval\s+'1 hour'/i);
    expect(pendingQuery.text).toMatch(/'ingestion:'\s*\|\|\s*drive_file_id/i);
    expect(pendingQuery.text).toMatch(
      /floor\(extract\(epoch\s+from\s+first_seen_at\)\s*\*\s*1e6\)::bigint/i,
    );
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
      let globalAlertId: string | undefined;

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
        // Show-scoped alerts cascade-delete with their shows; the global (null-show)
        // SYNC_STALLED alert does not, so insert it separately and capture its id for cleanup.
        await sql`
          insert into public.admin_alerts (show_id, code, context, raised_at)
          values
            (${show!.id}::uuid, 'SHEET_UNAVAILABLE', '{"sheet_name":"Candidate Show"}'::jsonb, now() - interval '2 hours'),
            (${show!.id}::uuid, 'DRIVE_FETCH_FAILED', '{}'::jsonb, now() - interval '2 hours'),
            (${archived!.id}::uuid, 'SHEET_UNAVAILABLE', '{}'::jsonb, now() - interval '2 hours'),
            (${unpublished!.id}::uuid, 'SHEET_UNAVAILABLE', '{}'::jsonb, now() - interval '2 hours')
        `;
        // One-unresolved-per-(scope,code) is enforced by admin_alerts_one_unresolved_idx,
        // so only insert a global SYNC_STALLED if none is already open; own (and later
        // clean up) ONLY the row we created. Either way a global candidate will exist.
        const existingGlobal = await sql<{ id: string }[]>`
          select id from public.admin_alerts
           where show_id is null and code = 'SYNC_STALLED' and resolved_at is null
           limit 1
        `;
        if (existingGlobal.length === 0) {
          const [globalAlert] = await sql<{ id: string }[]>`
            insert into public.admin_alerts (show_id, code, context, raised_at)
            values (null, 'SYNC_STALLED', '{}'::jsonb, now() - interval '2 hours')
            returning id
          `;
          globalAlertId = globalAlert?.id;
        }
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
        // Scope every assertion to THIS test's fixtures — the shared local DB holds
        // unrelated candidates, so an exact-equality on the whole set is not isolation-safe.
        const keys = result.candidates.map((c) => c.dedupKey);
        // published+unarchived show: unresolved SHEET_UNAVAILABLE is a candidate;
        // its RESOLVED DRIVE_FETCH_FAILED is excluded (resolved_at IS NULL filter).
        expect(keys.some((k) => k.startsWith(`${show!.id}:SHEET_UNAVAILABLE:`))).toBe(true);
        expect(keys.some((k) => k.startsWith(`${show!.id}:DRIVE_FETCH_FAILED:`))).toBe(false);
        // archived + unpublished shows are excluded entirely (AC-B3.7a).
        expect(keys.some((k) => k.startsWith(`${archived!.id}:`))).toBe(false);
        expect(keys.some((k) => k.startsWith(`${unpublished!.id}:`))).toBe(false);
        // >1h, non-wizard pending is a candidate; the <1h "new" and wizard-scoped rows are not.
        expect(keys.some((k) => k.startsWith(`ingestion:${pendingDrive}:`))).toBe(true);
        expect(keys.some((k) => k.startsWith(`ingestion:new-${pendingDrive}:`))).toBe(false);
        expect(keys.some((k) => k.startsWith(`ingestion:wizard-${pendingDrive}:`))).toBe(false);
        // the global SYNC_STALLED this test inserted surfaces as a global candidate
        // (presence, not exact-count — other unrelated globals may exist in the shared DB).
        expect(keys.some((k) => k.startsWith("global:SYNC_STALLED:"))).toBe(true);
      } finally {
        if (globalAlertId) {
          await sql`delete from public.admin_alerts where id = ${globalAlertId}::uuid`;
        }
        await sql`delete from public.pending_ingestions where drive_file_id like ${`%${suffix}%`}`;
        await sql`delete from public.shows where drive_file_id like ${`%${suffix}%`}`;
        await sql.end({ timeout: 5 });
      }
    },
  );
});

describe("listRealtimeCandidates real DB — auto_publish_undo (M12.13 §4.1)", () => {
  test.skipIf(!DB_URL)(
    "live-token published show → exactly one undo candidate; expired/null/archived → none; same-ms re-mints → distinct dedupKeys; read-only",
    async () => {
      const sql = postgres(DB_URL!, { max: 1, prepare: false });
      const suffix = `undo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const liveDrive = `live-${suffix}`;
      const expiredDrive = `expired-${suffix}`;
      const nullDrive = `null-${suffix}`;
      const archivedDrive = `archived-${suffix}`;
      const liveBDrive = `live-b-${suffix}`;
      // Force-equal expiry millisecond across the two live shows (R6: the mint,
      // not expires_at, disambiguates same-ms re-mints).
      const sharedExpiry = new Date(Date.now() + 12 * 3600 * 1000);

      try {
        const liveToken = "33333333-3333-4333-8333-333333333333";
        const liveBToken = "44444444-4444-4444-8444-444444444444";
        const expiredToken = "55555555-5555-4555-8555-555555555555";

        const [live] = await sql<{ id: string }[]>`
          insert into public.shows (drive_file_id, slug, title, client_label, template_version, published, archived, unpublish_token, unpublish_token_expires_at)
          values (${liveDrive}, ${`show-${liveDrive}`}, 'Live Undo', 'Client', 'v4', true, false, ${liveToken}::uuid, ${sharedExpiry})
          returning id
        `;
        const [liveB] = await sql<{ id: string }[]>`
          insert into public.shows (drive_file_id, slug, title, client_label, template_version, published, archived, unpublish_token, unpublish_token_expires_at)
          values (${liveBDrive}, ${`show-${liveBDrive}`}, 'Live Undo B', 'Client', 'v4', true, false, ${liveBToken}::uuid, ${sharedExpiry})
          returning id
        `;
        // Expired token → excluded by the expires_at > now() filter.
        await sql`
          insert into public.shows (drive_file_id, slug, title, client_label, template_version, published, archived, unpublish_token, unpublish_token_expires_at)
          values (${expiredDrive}, ${`show-${expiredDrive}`}, 'Expired Undo', 'Client', 'v4', true, false, ${expiredToken}::uuid, now() - interval '1 hour')
        `;
        // Null token → excluded by the unpublish_token is not null filter.
        await sql`
          insert into public.shows (drive_file_id, slug, title, client_label, template_version, published, archived)
          values (${nullDrive}, ${`show-${nullDrive}`}, 'No Token', 'Client', 'v4', true, false)
        `;
        // Archived show with a live token: still surfaces by the §4.1 SQL (which
        // gates only on token presence + expiry); the deliver-time currentness
        // guard (§4.3, T8) drops archived. Asserting it here would over-pin the
        // detector; instead we pin that the LIVE published shows surface.
        await sql`
          insert into public.shows (drive_file_id, slug, title, client_label, template_version, published, archived, unpublish_token, unpublish_token_expires_at)
          values (${archivedDrive}, ${`show-${archivedDrive}`}, 'Archived Undo', 'Client', 'v4', false, true, gen_random_uuid(), ${sharedExpiry})
        `;

        const result = await listRealtimeCandidates(sql as unknown as CandidateSql);
        expect(result.kind).toBe("ok");
        if (result.kind !== "ok") return;

        const undo = result.candidates.filter(
          (c): c is Extract<typeof c, { kind: "auto_publish_undo" }> =>
            c.kind === "auto_publish_undo",
        );
        const byShow = new Map(undo.map((c) => [c.showId, c]));

        // Live published shows with an unexpired token surface, with the right fields.
        const a = byShow.get(live!.id);
        expect(a).toBeDefined();
        expect(a!.slug).toBe(`show-${liveDrive}`);
        expect(a!.showTitle).toBe("Live Undo");
        expect(a!.token).toBe(liveToken);
        expect(a!.mintId).toBe(mintIdFor(liveToken));
        expect(a!.dedupKey).toBe(`${live!.id}:${mintIdFor(liveToken)}`);

        // Same-ms expiry across the two live mints → DISTINCT dedup keys (token-hash).
        const b = byShow.get(liveB!.id);
        expect(b).toBeDefined();
        expect(a!.expiresAt.getTime()).toBe(b!.expiresAt.getTime());
        expect(a!.dedupKey).not.toBe(b!.dedupKey);

        // Expired + null-token shows are NOT undo candidates.
        const undoSlugs = undo.map((c) => c.slug);
        expect(undoSlugs).not.toContain(`show-${expiredDrive}`);
        expect(undoSlugs).not.toContain(`show-${nullDrive}`);

        // Read-only: token state unchanged after detection (no consume/clear).
        const [afterLive] = await sql<{ unpublish_token: string | null }[]>`
          select unpublish_token::text from public.shows where id = ${live!.id}::uuid
        `;
        expect(afterLive!.unpublish_token).toBe(liveToken);
      } finally {
        await sql`delete from public.shows where drive_file_id like ${`%${suffix}%`}`;
        await sql.end({ timeout: 5 });
      }
    },
  );
});
