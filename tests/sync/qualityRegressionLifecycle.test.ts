/**
 * Unit C (audit #16) — RESYNC_QUALITY_REGRESSED lifecycle.
 *
 * Helper-level cases (fake tx): raise / anti-storm no-op / keep-open re-upsert / resolve /
 * record-and-skip / show-null / present-empty baseline. Derived from `summarizeDataGaps` of
 * constructed warning arrays (NOT hardcoded totals), so the real summarizer is exercised
 * (anti-tautology). Plus delivery-contract structural cases (bell exclusion + code-agnostic
 * realtime ping triggers) and a MANDATORY DB-backed anti-storm/read-state proof.
 */
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import type { ParseResult } from "@/lib/parser/types";
import type { ProcessOneFileDeps, SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";
import {
  evaluateQualityRegression_unlocked,
  withPostgresSyncPipelineLock,
} from "@/lib/sync/runScheduledCronSync";
import { summarizeDataGaps } from "@/lib/parser/dataGaps";
import { bellExcludedCodes } from "@/lib/admin/bellAudience";

type Warn = ParseResult["warnings"][number];

/** n `warn`-severity warnings of `code` — summarizeDataGaps counts each as one gap in that class. */
function warns(code: string, n: number): Warn[] {
  return Array.from(
    { length: n },
    () => ({ severity: "warn", code, message: "x" }) as unknown as Warn,
  );
}

/**
 * Fake tx: `queryOne` returns the scripted open-alert context for the select, records the
 * resolve UPDATE, and returns undefined otherwise. `openContext === null` → no open alert.
 */
function makeFakeTx(openContext: Record<string, unknown> | null) {
  const resolveCalls: unknown[][] = [];
  const queryOne = vi.fn(async <T>(sql: string, params?: unknown[]): Promise<T> => {
    if (sql.includes("update public.admin_alerts") && sql.includes("resolved_at = now()")) {
      resolveCalls.push(params ?? []);
      return undefined as T;
    }
    if (sql.includes("select context from public.admin_alerts")) {
      return (openContext === null ? undefined : { context: openContext }) as T;
    }
    return undefined as T;
  });
  return {
    tx: { queryOne } as unknown as Pick<SyncPipelineTx, "queryOne">,
    queryOne,
    resolveCalls,
  };
}

type UpsertInput = { showId: string | null; code: string; context: Record<string, unknown> };

async function runEval(args: {
  openContext: Record<string, unknown> | null;
  showId: string | null | undefined;
  priorParseWarningsRaw: Warn[] | null;
  nextWarnings: Warn[];
}) {
  const { tx, queryOne, resolveCalls } = makeFakeTx(args.openContext);
  const upsertAdminAlert = vi.fn(async (_input: UpsertInput): Promise<string | null> => "alert-1");
  const deps = { upsertAdminAlert } as unknown as ProcessOneFileDeps;
  await evaluateQualityRegression_unlocked({
    tx,
    deps,
    driveFileId: "drive-file-1",
    showId: args.showId,
    priorParseWarningsRaw: args.priorParseWarningsRaw,
    nextWarnings: args.nextWarnings,
    sheetName: "My Sheet",
  });
  return { upsertAdminAlert, queryOne, resolveCalls };
}

// context.baseline as summarizeDataGaps stores it — for an OPEN alert whose pre-regression prior
// was `priorWarnings`, the stored baseline + payload mirror what the producer wrote on open.
const baselineFrom = (w: Warn[]) => summarizeDataGaps(w);

describe("RESYNC_QUALITY_REGRESSED lifecycle (helper-level)", () => {
  test("1. 4→40, no open alert → upsert OPEN with context.baseline summarizing to 4", async () => {
    const { upsertAdminAlert } = await runEval({
      openContext: null,
      showId: "show-1",
      priorParseWarningsRaw: warns("UNKNOWN_FIELD", 4),
      nextWarnings: warns("UNKNOWN_FIELD", 40),
    });
    expect(upsertAdminAlert).toHaveBeenCalledTimes(1);
    const call = upsertAdminAlert.mock.calls[0]![0];
    expect(call.showId).toBe("show-1");
    expect(call.code).toBe("RESYNC_QUALITY_REGRESSED");
    expect(
      (call.context.baseline as { classes: Record<string, number> }).classes.UNKNOWN_FIELD,
    ).toBe(4);
    expect(call.context.worsened).toEqual(["UNKNOWN_FIELD"]); // 4→40: +36 abs, ≥+50% rel
  });

  test("2. 40→40, open baseline 4, identical payload → NO upsert (anti-storm no-op)", async () => {
    // Open alert context mirrors what case 1 stored: baseline=4, payload delta vs baseline.
    const baseline = baselineFrom(warns("UNKNOWN_FIELD", 4));
    const openContext = {
      drive_file_id: "drive-file-1",
      sheet_name: "My Sheet",
      breakdown: { UNKNOWN_FIELD: 40 },
      new_classes: [],
      worsened: ["UNKNOWN_FIELD"],
      baseline,
    };
    const { upsertAdminAlert, resolveCalls } = await runEval({
      openContext,
      showId: "show-1",
      priorParseWarningsRaw: warns("UNKNOWN_FIELD", 4),
      nextWarnings: warns("UNKNOWN_FIELD", 40),
    });
    expect(upsertAdminAlert).not.toHaveBeenCalled();
    expect(resolveCalls).toHaveLength(0);
  });

  test("3. 40→80, open baseline 4, payload changed → upsert, context.baseline STILL 4 (preserved)", async () => {
    const baseline = baselineFrom(warns("UNKNOWN_FIELD", 4));
    const openContext = {
      drive_file_id: "drive-file-1",
      sheet_name: "My Sheet",
      breakdown: { UNKNOWN_FIELD: 40 },
      new_classes: [],
      worsened: ["UNKNOWN_FIELD"],
      baseline,
    };
    const { upsertAdminAlert } = await runEval({
      openContext,
      showId: "show-1",
      priorParseWarningsRaw: warns("UNKNOWN_FIELD", 4),
      nextWarnings: warns("UNKNOWN_FIELD", 80),
    });
    expect(upsertAdminAlert).toHaveBeenCalledTimes(1);
    const call = upsertAdminAlert.mock.calls[0]![0];
    expect(
      (call.context.baseline as { classes: Record<string, number> }).classes.UNKNOWN_FIELD,
    ).toBe(4);
    expect((call.context.breakdown as Record<string, number>).UNKNOWN_FIELD).toBe(80);
  });

  test("4. 40→8, open baseline 4 → keep open (8 > 4), NO resolve, NO upsert-if-unchanged", async () => {
    const baseline = baselineFrom(warns("UNKNOWN_FIELD", 4));
    // stored payload reflects baseline=4 vs current-at-open=40: worsened UNKNOWN_FIELD.
    const openContext = {
      drive_file_id: "drive-file-1",
      sheet_name: "My Sheet",
      breakdown: { UNKNOWN_FIELD: 40 },
      new_classes: [],
      worsened: ["UNKNOWN_FIELD"],
      baseline,
    };
    const { upsertAdminAlert, resolveCalls } = await runEval({
      openContext,
      showId: "show-1",
      priorParseWarningsRaw: warns("UNKNOWN_FIELD", 4),
      nextWarnings: warns("UNKNOWN_FIELD", 8),
    });
    expect(resolveCalls, "8 > baseline 4 → not recovered → no resolve").toHaveLength(0);
    // 8 vs baseline 4: 8-4=4 < 5 → not worsened → payload {breakdown:{UNKNOWN_FIELD:8}, worsened:[]}
    // differs from stored (worsened:[UNKNOWN_FIELD], breakdown 40) → re-upsert (material change).
    expect(upsertAdminAlert).toHaveBeenCalledTimes(1);
  });

  test("5. 8→4, open baseline 4 → resolveQualityRegression_unlocked, NO upsert", async () => {
    const baseline = baselineFrom(warns("UNKNOWN_FIELD", 4));
    const openContext = {
      drive_file_id: "drive-file-1",
      sheet_name: "My Sheet",
      breakdown: { UNKNOWN_FIELD: 8 },
      new_classes: [],
      worsened: [],
      baseline,
    };
    const { upsertAdminAlert, resolveCalls } = await runEval({
      openContext,
      showId: "show-1",
      priorParseWarningsRaw: warns("UNKNOWN_FIELD", 8),
      nextWarnings: warns("UNKNOWN_FIELD", 4), // all classes ≤ baseline 4
    });
    expect(resolveCalls, "current 4 ≤ baseline 4 → full recovery → resolve").toHaveLength(1);
    expect(resolveCalls[0]![0]).toBe("show-1");
    expect(upsertAdminAlert).not.toHaveBeenCalled();
  });

  test("6. priorParseWarningsRaw === null, current non-empty → record-and-skip (no upsert, no resolve)", async () => {
    const { upsertAdminAlert, resolveCalls, queryOne } = await runEval({
      openContext: null,
      showId: "show-1",
      priorParseWarningsRaw: null,
      nextWarnings: warns("UNKNOWN_FIELD", 40),
    });
    expect(upsertAdminAlert).not.toHaveBeenCalled();
    expect(resolveCalls).toHaveLength(0);
    expect(queryOne, "null baseline returns BEFORE reading the open alert").not.toHaveBeenCalled();
  });

  test("7. showId null → no-op", async () => {
    const { upsertAdminAlert, resolveCalls, queryOne } = await runEval({
      openContext: null,
      showId: null,
      priorParseWarningsRaw: warns("UNKNOWN_FIELD", 4),
      nextWarnings: warns("UNKNOWN_FIELD", 40),
    });
    expect(upsertAdminAlert).not.toHaveBeenCalled();
    expect(resolveCalls).toHaveLength(0);
    expect(queryOne).not.toHaveBeenCalled();
  });

  test("8. present-empty [] prior + non-empty current → upsert OPEN, baseline 0 (new class)", async () => {
    const { upsertAdminAlert } = await runEval({
      openContext: null,
      showId: "show-1",
      priorParseWarningsRaw: [], // present-empty (published, last-good clean), NOT null
      nextWarnings: warns("UNKNOWN_FIELD", 3), // 0→3 = new class → regression
    });
    expect(upsertAdminAlert).toHaveBeenCalledTimes(1);
    const call = upsertAdminAlert.mock.calls[0]![0];
    expect(
      (call.context.baseline as { classes: Record<string, number> }).classes.UNKNOWN_FIELD,
    ).toBe(0);
    expect(call.context.new_classes).toEqual(["UNKNOWN_FIELD"]);
  });
});

describe("RESYNC_QUALITY_REGRESSED delivery contract (structural)", () => {
  test("9. bellExcludedCodes never excludes RESYNC_QUALITY_REGRESSED (feed-visible; banner, not inbox/health)", () => {
    expect(bellExcludedCodes(false)).not.toContain("RESYNC_QUALITY_REGRESSED");
    expect(bellExcludedCodes(true)).not.toContain("RESYNC_QUALITY_REGRESSED");
  });

  const bellSql = readFileSync("supabase/migrations/20260705100002_bell_realtime.sql", "utf8");

  test("10. INSERT bell-ping trigger is statement-level + code-agnostic (C's OPEN insert pings)", () => {
    const insTrig = bellSql.match(/create trigger admin_alerts_bell_ping_ins[\s\S]*?;/)?.[0] ?? "";
    expect(insTrig).toMatch(/after insert on public\.admin_alerts/);
    expect(insTrig).toMatch(/for each statement/);
    expect(insTrig).not.toMatch(/\bwhen\b/i); // no row/code filter → every insert pings
  });

  test("10b. UPDATE bell-ping trigger is statement-level + code-agnostic (40→80 re-upsert pings)", () => {
    const updTrig = bellSql.match(/create trigger admin_alerts_bell_ping_upd[\s\S]*?;/)?.[0] ?? "";
    expect(updTrig).toMatch(/after update on public\.admin_alerts/);
    expect(updTrig).toMatch(/for each statement/);
    expect(updTrig).not.toMatch(/\bwhen\b/i);
  });
});

// ── DB-backed anti-storm / read-state proof (MANDATORY — spec §6.7 test 1) ─────────────────────
// Proves the PERSISTED admin_alerts row's last_seen_at + occurrence_count do NOT churn on an
// unchanged 40→40 sync (so the bell's unread clock stays quiet), and DO advance on a material
// 40→80 change with context.baseline preserved. Skips-with-notice when TEST_DATABASE_URL absent.

// When a DB URL is EXPLICITLY configured (CI sets TEST_DATABASE_URL), the mandatory anti-storm
// proof must NOT silently skip on a broken connection (Codex whole-diff R1) — a guard test below
// fails fast in that case. Absent any URL (local dev), the loopback default may skip cleanly.
const DB_URL_EXPLICIT = process.env.TEST_DATABASE_URL ?? process.env.LOCAL_TEST_DATABASE_URL;
const DB_URL = DB_URL_EXPLICIT ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const ORIG_ENV = {
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
};
process.env.TEST_DATABASE_URL = DB_URL;
process.env.DATABASE_URL = DB_URL;

const DRIVE_FILE_ID = "quality-regression-antistorm-fixture";
const SLUG = "2026-07-quality-regression-antistorm";
const MODIFIED_TIME = "2026-07-05T00:00:00.000Z";

let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
try {
  const probe = postgres(DB_URL, { max: 1, idle_timeout: 2, connect_timeout: 3, prepare: false });
  await probe.unsafe("select 1", []);
  sql = probe;
  dbUp = true;
} catch {
  if (sql) await (sql as ReturnType<typeof postgres>).end().catch(() => {});
  sql = null;
  dbUp = false;
}

async function cleanup(showId: string | null): Promise<void> {
  if (!sql) return;
  if (showId) {
    await sql
      .unsafe("delete from public.admin_alerts where show_id = $1::uuid", [showId])
      .catch(() => {});
  }
  await sql
    .unsafe("delete from public.shows where drive_file_id = $1", [DRIVE_FILE_ID])
    .catch(() => {});
}

afterAll(async () => {
  process.env.TEST_DATABASE_URL = ORIG_ENV.TEST_DATABASE_URL;
  process.env.DATABASE_URL = ORIG_ENV.DATABASE_URL;
  if (ORIG_ENV.TEST_DATABASE_URL === undefined) delete process.env.TEST_DATABASE_URL;
  if (ORIG_ENV.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  if (sql) await sql.end().catch(() => {});
});

async function runProducerDb(
  showId: string,
  priorParseWarningsRaw: Warn[] | null,
  nextWarnings: Warn[],
): Promise<void> {
  await withPostgresSyncPipelineLock(DRIVE_FILE_ID, async (lockedTx) => {
    const txUpsert = (
      lockedTx as unknown as {
        upsertAdminAlert: NonNullable<ProcessOneFileDeps["upsertAdminAlert"]>;
      }
    ).upsertAdminAlert.bind(lockedTx);
    await evaluateQualityRegression_unlocked({
      tx: lockedTx,
      deps: {
        upsertAdminAlert: txUpsert,
      } as unknown as ProcessOneFileDeps,
      driveFileId: DRIVE_FILE_ID,
      showId,
      priorParseWarningsRaw,
      nextWarnings,
      sheetName: "My Sheet",
    });
    return { outcome: "skipped" as const, reason: "test" };
  });
}

type AlertRow = {
  last_seen_at: number; // epoch ms (postgres returns Date; normalized here for stable comparison)
  occurrence_count: number;
  raised_at: number; // epoch ms
  context: Record<string, unknown>;
};

async function readAlert(showId: string): Promise<AlertRow | null> {
  const rows = (await sql!.unsafe(
    `select last_seen_at, occurrence_count, raised_at, context
       from public.admin_alerts
      where show_id = $1::uuid and code = 'RESYNC_QUALITY_REGRESSED' and resolved_at is null`,
    [showId],
  )) as Array<{
    last_seen_at: string;
    occurrence_count: number;
    raised_at: string;
    context: Record<string, unknown>;
  }>;
  const r = rows[0];
  if (!r) return null;
  return {
    last_seen_at: new Date(r.last_seen_at).getTime(),
    occurrence_count: Number(r.occurrence_count),
    raised_at: new Date(r.raised_at).getTime(),
    context: r.context,
  };
}

/** Mirror lib/admin/bellFeed.ts:103,122 — unread iff readAt === null || readAt < greatest(raised,last_seen). */
function isUnread(row: AlertRow, readAt: number | null): boolean {
  const activityAt = Math.max(row.raised_at, row.last_seen_at);
  return readAt === null || readAt < activityAt;
}

describe("RESYNC_QUALITY_REGRESSED DB-backed anti-storm (MANDATORY)", () => {
  test.skipIf(!dbUp)(
    "40→40 no-op leaves last_seen_at/occurrence_count/read-state unchanged; 40→80 advances them",
    async () => {
      let showId: string | null = null;
      try {
        const seeded = (await sql!.unsafe(
          `insert into public.shows (drive_file_id, slug, title, client_label, template_version,
             last_seen_modified_time, last_synced_at, last_sync_status, last_sync_error)
           values ($1, $2, 'AntiStorm Fixture', 'AS Corp', 'v4', $3::timestamptz, now(), 'ok', null)
           returning id::text as id`,
          [DRIVE_FILE_ID, SLUG, MODIFIED_TIME],
        )) as Array<{ id: string }>;
        showId = seeded[0]!.id;

        // (a) 4→40 opens the alert.
        await runProducerDb(showId, warns("UNKNOWN_FIELD", 4), warns("UNKNOWN_FIELD", 40));
        const opened = await readAlert(showId);
        expect(opened, "4→40 opens exactly one alert row").not.toBeNull();
        expect(
          (opened!.context.baseline as { classes: Record<string, number> }).classes.UNKNOWN_FIELD,
        ).toBe(4);

        // (b) Doug reads: cursor at the row's activityAt → row is read (unread false).
        const readCursor =
          opened!.last_seen_at > opened!.raised_at ? opened!.last_seen_at : opened!.raised_at;
        expect(isUnread(opened!, readCursor)).toBe(false);

        // (c) 40→40 identical → producer issues NO upsert → last_seen_at + occurrence_count UNCHANGED,
        //     and the row is STILL read (no re-badge). ← the anti-storm proof.
        await runProducerDb(showId, warns("UNKNOWN_FIELD", 4), warns("UNKNOWN_FIELD", 40));
        const afterNoop = await readAlert(showId);
        expect(afterNoop!.occurrence_count, "no-op must not bump occurrence_count").toBe(
          opened!.occurrence_count,
        );
        expect(afterNoop!.last_seen_at, "no-op must not advance last_seen_at").toBe(
          opened!.last_seen_at,
        );
        expect(isUnread(afterNoop!, readCursor), "no-op must not re-badge the read row").toBe(
          false,
        );

        // (d) 40→80 material change → upsert conflict advances last_seen_at + occurrence_count;
        //     row becomes unread again; context.baseline STILL the 4-gap summary (preserved).
        await new Promise((r) => setTimeout(r, 25)); // ensure now() strictly advances
        await runProducerDb(showId, warns("UNKNOWN_FIELD", 4), warns("UNKNOWN_FIELD", 80));
        const afterChange = await readAlert(showId);
        expect(afterChange!.occurrence_count, "material change bumps occurrence_count").toBe(
          opened!.occurrence_count + 1,
        );
        expect(
          afterChange!.last_seen_at > opened!.last_seen_at,
          "material change advances last_seen_at",
        ).toBe(true);
        expect(isUnread(afterChange!, readCursor), "advanced row is unread vs the old cursor").toBe(
          true,
        );
        expect(
          (afterChange!.context.baseline as { classes: Record<string, number> }).classes
            .UNKNOWN_FIELD,
          "baseline preserved verbatim across the material re-upsert",
        ).toBe(4);
      } finally {
        await cleanup(showId);
      }
    },
  );

  // Codex whole-diff R1, finding 4: when a DB URL is EXPLICITLY configured (CI sets
  // TEST_DATABASE_URL), the mandatory anti-storm proof above must NOT silently skip on a broken
  // connection. Fail fast so a misconfigured CI surfaces loudly instead of a false green.
  test("mandatory DB gate is not silently skipped when a DB URL is explicitly configured", () => {
    if (DB_URL_EXPLICIT) {
      expect(
        dbUp,
        "TEST_DATABASE_URL/LOCAL_TEST_DATABASE_URL is set but the DB probe failed — the mandatory " +
          "anti-storm + read-path proofs would silently skip. Fix the DB env before merging.",
      ).toBe(true);
    } else {
      expect(true).toBe(true); // local dev without any DB URL: skip-clean is acceptable
    }
  });
});

// ── Read-path 3-path runtime proof (Codex whole-diff R1, finding 3 — spec §6.7 test 2) ──────────
// The concrete readShowForPhase1 producer must map RAW parse_warnings so Unit C distinguishes:
//   (A) no shows_internal row      → priorParseWarningsRaw === null (untrustworthy → skip)
//   (B) parse_warnings column NULL → null
//   (C) parse_warnings = []        → [] (trustworthy present-empty; a new class fires vs baseline 0)
// This exercises the REAL DB row mapping (`internal?.parse_warnings ?? null`), which the helper-level
// tests above cannot reach (they inject priorParseWarningsRaw directly).

const RP_DRIVE_FILE_ID = "quality-regression-readpath-fixture";
const RP_SLUG = "2026-07-quality-regression-readpath";

async function seedShowForReadPath(
  internal: { parseWarnings: Warn[] | null } | null,
): Promise<void> {
  const seeded = (await sql!.unsafe(
    `insert into public.shows (drive_file_id, slug, title, client_label, template_version,
       last_seen_modified_time, last_synced_at, last_sync_status, last_sync_error)
     values ($1, $2, 'ReadPath Fixture', 'RP Corp', 'v4', $3::timestamptz, now(), 'ok', null)
     returning id::text as id`,
    [RP_DRIVE_FILE_ID, RP_SLUG, MODIFIED_TIME],
  )) as Array<{ id: string }>;
  const showId = seeded[0]!.id;
  if (internal) {
    // Pass the RAW array/null (postgres.js serializes $N::jsonb itself; a manual JSON.stringify
    // double-encodes into a jsonb STRING scalar — the postgres.js jsonb param trap). Mirrors the
    // production upsertShowsInternal write at lib/sync/runScheduledCronSync.ts:1667.
    await sql!.unsafe(
      `insert into public.shows_internal (show_id, financials, parse_warnings, raw_unrecognized, run_of_show)
       values ($1::uuid, '{}'::jsonb, $2::jsonb, '[]'::jsonb, null)`,
      [showId, internal.parseWarnings],
    );
  }
}

async function readPathCleanup(): Promise<void> {
  if (!sql) return;
  await sql
    .unsafe("delete from public.shows where drive_file_id = $1", [RP_DRIVE_FILE_ID])
    .catch(() => {});
}

async function readPriorRaw(): Promise<Warn[] | null> {
  return withPostgresSyncPipelineLock(RP_DRIVE_FILE_ID, async (lockedTx) => {
    const row = await lockedTx.readShowForPhase1(RP_DRIVE_FILE_ID);
    return (row?.priorParseWarningsRaw ?? null) as Warn[] | null;
  }) as Promise<Warn[] | null>;
}

describe("readShowForPhase1 priorParseWarningsRaw DB mapping (MANDATORY)", () => {
  test.skipIf(!dbUp)("(A) no shows_internal row → null", async () => {
    try {
      await seedShowForReadPath(null);
      expect(await readPriorRaw()).toBeNull();
    } finally {
      await readPathCleanup();
    }
  });

  test.skipIf(!dbUp)("(B) parse_warnings column NULL → null", async () => {
    try {
      await seedShowForReadPath({ parseWarnings: null });
      expect(await readPriorRaw()).toBeNull();
    } finally {
      await readPathCleanup();
    }
  });

  test.skipIf(!dbUp)("(C) parse_warnings = [] → [] (present-empty, NOT null)", async () => {
    try {
      await seedShowForReadPath({ parseWarnings: [] });
      const raw = await readPriorRaw();
      expect(raw, "trustworthy empty baseline must be [] not null").toEqual([]);
      expect(raw).not.toBeNull();
    } finally {
      await readPathCleanup();
    }
  });

  test.skipIf(!dbUp)("(D) parse_warnings with entries → the raw array round-trips", async () => {
    try {
      await seedShowForReadPath({ parseWarnings: warns("UNKNOWN_FIELD", 3) });
      const raw = await readPriorRaw();
      expect(summarizeDataGaps(raw).classes.UNKNOWN_FIELD).toBe(3);
    } finally {
      await readPathCleanup();
    }
  });
});

// ── Fix-1 (Codex whole-diff R1, finding 1): a pure sheet rename refreshes the stale copy ─────────
describe("RESYNC_QUALITY_REGRESSED sheet-rename refresh (helper-level)", () => {
  test("unchanged payload but renamed sheet → re-upsert (refresh stale context.sheet_name)", async () => {
    const baseline = baselineFrom(warns("UNKNOWN_FIELD", 4));
    const openContext = {
      drive_file_id: "drive-file-1",
      sheet_name: "Old Sheet Name", // stale — the open alert was raised under the old name
      breakdown: { UNKNOWN_FIELD: 40 },
      new_classes: [],
      worsened: ["UNKNOWN_FIELD"],
      baseline,
    };
    const { upsertAdminAlert } = await runEval({
      openContext,
      showId: "show-1",
      priorParseWarningsRaw: warns("UNKNOWN_FIELD", 4),
      nextWarnings: warns("UNKNOWN_FIELD", 40), // identical quality payload (40→40)
    });
    // Payload is unchanged, but the sheet was renamed → must re-upsert to refresh the copy.
    expect(upsertAdminAlert).toHaveBeenCalledTimes(1);
    const call = upsertAdminAlert.mock.calls[0]![0];
    expect(call.context.sheet_name, "context refreshed to the current sheet name").toBe("My Sheet");
    expect(
      (call.context.baseline as { classes: Record<string, number> }).classes.UNKNOWN_FIELD,
      "baseline still preserved across the identity refresh",
    ).toBe(4);
  });
});

describe("buildRegressionPayload shares the tuned regressionKind (Flow 6 Task 3)", () => {
  test("3→7 drift fires AND names the class in worsened (payload uses tuned rule, not old +5-AND)", async () => {
    const { upsertAdminAlert } = await runEval({
      openContext: null,
      showId: "show-1",
      priorParseWarningsRaw: warns("UNKNOWN_FIELD", 3),
      nextWarnings: warns("UNKNOWN_FIELD", 7),
    });
    expect(upsertAdminAlert).toHaveBeenCalledTimes(1);
    const call = upsertAdminAlert.mock.calls[0]![0];
    // Before the fix, buildRegressionPayload's worsened uses `+5 abs AND +50%` → 3→7 (+4) is
    // EXCLUDED, leaving Doug an empty reason even though the alert opened. Tuned → included.
    expect(call.context.worsened).toEqual(["UNKNOWN_FIELD"]);
    expect(call.context.new_classes).toEqual([]);
  });
});
