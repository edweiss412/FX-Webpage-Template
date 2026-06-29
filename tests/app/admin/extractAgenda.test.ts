/**
 * Route-boundary tests for the per-show extract-agenda POST endpoint (spec §8
 * test-2 catalog). Task 8 covers the lease MODULE in isolation; these prove the
 * ROUTE wires it (durable lease, fences, no-DB-during-Drive, atomic persist,
 * deadline race, lease-release-on-every-exit).
 *
 * DB: LOCAL supabase (TEST_DATABASE_URL unset → local 54322). The
 * agenda_extract_leases + pending_syncs + app_settings tables are already applied.
 */

import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import {
  handleExtractAgenda,
  type ExtractAgendaDeps,
} from "@/app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route";
import { createInMemorySlotStore } from "@/lib/agenda/extractAgendaLease";
import { AGENDA_GLOBAL_MAX_CONCURRENT_EXTRACTIONS } from "@/lib/agenda/constants";
import type { EnrichAgendaReport } from "@/lib/sync/enrichAgenda";
import type { DriveClient } from "@/lib/sync/enrichWithDrivePins";
import type { AgendaExtraction } from "@/lib/agenda/types";

const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const K = AGENDA_GLOBAL_MAX_CONCURRENT_EXTRACTIONS; // 8
const STAGED_ISO = "2026-06-01T00:00:00.000Z";

const VALID_EXTRACTION: AgendaExtraction = {
  confidence: "high",
  corrections: 0,
  days: [
    {
      dayLabel: "Day 1",
      date: "2026-06-01",
      sessions: [
        { time: "9:00 AM – 9:40 AM", title: "Keynote", room: "A", tracks: [], drift: null },
      ],
    },
  ],
  sourceRevision: "rev-1",
  extractorVersion: 1,
};

// A DIFFERENT valid payload to prove "persist only from the report, never from a
// preserved/mutated link.extracted" (j-from-report).
const STALE_EXTRACTION: AgendaExtraction = {
  confidence: "high",
  corrections: 99,
  days: [
    {
      dayLabel: "STALE",
      date: "2000-01-01",
      sessions: [{ time: "1:00 AM – 2:00 AM", title: "Old", room: "Z", tracks: [], drift: null }],
    },
  ],
  sourceRevision: "rev-OLD",
  extractorVersion: 1,
};

let pool: ReturnType<typeof postgres>;

beforeAll(() => {
  pool = postgres(LOCAL_DB_URL, { max: K + 12, prepare: false });
});

afterAll(async () => {
  await pool.end({ timeout: 5 });
});

afterEach(async () => {
  await pool`DELETE FROM public.agenda_extract_leases WHERE drive_file_id LIKE 'xa-%'`;
  await pool`DELETE FROM public.pending_syncs WHERE drive_file_id LIKE 'xa-%'`;
  await pool`DELETE FROM public.onboarding_scan_manifest WHERE drive_file_id LIKE 'xa-%'`;
  await pool`
    UPDATE public.app_settings
       SET pending_wizard_session_id = NULL, pending_wizard_session_at = NULL,
           pending_folder_id = NULL
     WHERE id = 'default'`;
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ctx(wizardSessionId: string, driveFileId: string) {
  return { params: Promise.resolve({ wizardSessionId, driveFileId }) };
}

type ParseFixture = {
  warnings: unknown[];
  show: { title: string; agenda_links: { label: string; fileId?: string; extracted?: unknown }[] };
};

function parseFixture(
  links: { label: string; fileId?: string; extracted?: unknown }[],
): ParseFixture {
  return { warnings: [], show: { title: "X", agenda_links: links } };
}

async function seedActive(
  wiz: string,
  dfid: string,
  folder: string,
  parseResult: unknown,
): Promise<void> {
  await pool`
    UPDATE public.app_settings
       SET pending_wizard_session_id = ${wiz}::uuid, pending_wizard_session_at = now(),
           pending_folder_id = ${folder}
     WHERE id = 'default'`;
  await pool`
    INSERT INTO public.pending_syncs
      (drive_file_id, wizard_session_id, base_modified_time, staged_modified_time,
       parse_result, source_kind, warning_summary)
    VALUES (${dfid}, ${wiz}::uuid, ${STAGED_ISO}::timestamptz, ${STAGED_ISO}::timestamptz,
            ${pool.json(parseResult as never)}, 'onboarding_scan', '')`;
}

async function readParseResult(wiz: string, dfid: string): Promise<ParseFixture | null> {
  const rows = await pool<{ parse_result: ParseFixture }[]>`
    SELECT parse_result FROM public.pending_syncs
     WHERE wizard_session_id = ${wiz}::uuid AND drive_file_id = ${dfid}`;
  return rows[0]?.parse_result ?? null;
}

async function liveLeaseCount(dfid: string): Promise<number> {
  const rows = await pool<{ cnt: number }[]>`
    SELECT count(*)::int AS cnt FROM public.agenda_extract_leases
     WHERE drive_file_id = ${dfid} AND expires_at > now()`;
  return rows[0]?.cnt ?? 0;
}

async function insertLiveLease(dfid: string): Promise<void> {
  await pool`
    INSERT INTO public.agenda_extract_leases (wizard_session_id, drive_file_id, owner, expires_at)
    VALUES (${randomUUID()}::uuid, ${dfid}, 'filler', now() + '5 minutes'::interval)`;
}

function makeMeta(modifiedTime: string, parents: string[]) {
  return { modifiedTime, parents };
}

function metaSpy(modifiedTime: string, parents: string[]) {
  return vi.fn(async () => makeMeta(modifiedTime, parents));
}

/** A DriveClient whose agenda methods are spies (used only when enrichAgenda is real). */
function makeDriveClient(headRevisionId = "rev-1"): DriveClient {
  return {
    getFile: vi.fn(async (fileId: string) => ({
      driveFileId: fileId,
      headRevisionId,
      md5Checksum: "md5",
      mimeType: "application/pdf",
      modifiedTime: STAGED_ISO,
    })),
    listFolder: vi.fn(),
    downloadFileBytes: vi.fn(async () => ({ kind: "bytes" as const, bytes: new Uint8Array([1]) })),
    getAgendaChips: vi.fn(async () => ({ kind: "rows" as const, rows: [] })),
  } as unknown as DriveClient;
}

const FOLDER = "xa-folder";

function baseDeps(overrides: ExtractAgendaDeps): ExtractAgendaDeps {
  return {
    slotStore: createInMemorySlotStore(),
    sql: pool as unknown as NonNullable<ExtractAgendaDeps["sql"]>,
    requireAdminIdentity: async () => ({ email: "admin@fxav.com" }),
    fetchMeta: metaSpy(STAGED_ISO, [FOLDER]),
    driveClient: makeDriveClient(),
    ...overrides,
  };
}

// ─── (a) AUTH ────────────────────────────────────────────────────────────────

describe("extract-agenda — auth", () => {
  test("a1: forbidden (control-flow) → 403 ADMIN_FORBIDDEN, no DB/Drive work", async () => {
    const wiz = randomUUID();
    const dfid = "xa-a1";
    const fetchMeta = metaSpy(STAGED_ISO, [FOLDER]);
    const res = await handleExtractAgenda(
      new Request("http://x"),
      ctx(wiz, dfid),
      baseDeps({
        requireAdminIdentity: async () => {
          throw new Error("forbidden");
        },
        fetchMeta,
      }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "ADMIN_FORBIDDEN" });
    expect(fetchMeta).not.toHaveBeenCalled();
    expect(await liveLeaseCount(dfid)).toBe(0);
  });

  test("a2: AdminInfraError (ADMIN_SESSION_LOOKUP_FAILED) → typed 500, no lease/Drive", async () => {
    const wiz = randomUUID();
    const dfid = "xa-a2";
    const fetchMeta = metaSpy(STAGED_ISO, [FOLDER]);
    const res = await handleExtractAgenda(
      new Request("http://x"),
      ctx(wiz, dfid),
      baseDeps({
        requireAdminIdentity: async () => {
          const e = new Error("auth backend down") as Error & { code: string };
          e.code = "ADMIN_SESSION_LOOKUP_FAILED";
          throw e;
        },
        fetchMeta,
      }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ code: "ADMIN_SESSION_LOOKUP_FAILED" });
    expect(fetchMeta).not.toHaveBeenCalled();
    expect(await liveLeaseCount(dfid)).toBe(0);
  });
});

// ─── (lifecycle) missing / superseded ──────────────────────────────────────────

describe("extract-agenda — lifecycle guard", () => {
  test("missing staged row → 200 { items: [] }, no Drive", async () => {
    const wiz = randomUUID();
    const dfid = "xa-missing";
    // active session set, but NO pending_syncs row for this (wiz,dfid)
    await pool`UPDATE public.app_settings SET pending_wizard_session_id = ${wiz}::uuid, pending_folder_id = ${FOLDER} WHERE id = 'default'`;
    const fetchMeta = metaSpy(STAGED_ISO, [FOLDER]);
    const res = await handleExtractAgenda(
      new Request("http://x"),
      ctx(wiz, dfid),
      baseDeps({ fetchMeta }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });
    expect(fetchMeta).not.toHaveBeenCalled();
    expect(await liveLeaseCount(dfid)).toBe(0); // lease released on exit
  });

  test("superseded session → 409 stale (approved-state irrelevant), no Drive", async () => {
    const wiz = randomUUID();
    const dfid = "xa-superseded";
    await seedActive(wiz, dfid, FOLDER, parseFixture([{ label: "A", fileId: "f" }]));
    // Rotate the active session away → row is no longer active.
    await pool`UPDATE public.app_settings SET pending_wizard_session_id = ${randomUUID()}::uuid WHERE id = 'default'`;
    const fetchMeta = metaSpy(STAGED_ISO, [FOLDER]);
    const res = await handleExtractAgenda(
      new Request("http://x"),
      ctx(wiz, dfid),
      baseDeps({ fetchMeta }),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ status: "stale" });
    expect(fetchMeta).not.toHaveBeenCalled();
    expect(await liveLeaseCount(dfid)).toBe(0);
  });
});

// ─── (m) fences ─────────────────────────────────────────────────────────────

describe("extract-agenda — fences", () => {
  test("m: before-fence revision mismatch → 409, NO extraction", async () => {
    const wiz = randomUUID();
    const dfid = "xa-m";
    await seedActive(wiz, dfid, FOLDER, parseFixture([{ label: "A", fileId: "f" }]));
    const enrich = vi.fn(async () => ({ perLink: [] }) as EnrichAgendaReport);
    const res = await handleExtractAgenda(
      new Request("http://x"),
      ctx(wiz, dfid),
      baseDeps({
        fetchMeta: metaSpy("2026-06-02T00:00:00.000Z", [FOLDER]), // changed
        enrichAgenda: enrich,
      }),
    );
    expect(res.status).toBe(409);
    expect(enrich).not.toHaveBeenCalled();
    expect(await liveLeaseCount(dfid)).toBe(0);
  });

  test("m-scope: before-fence folder out-of-scope → 409, NO extraction", async () => {
    const wiz = randomUUID();
    const dfid = "xa-mscope";
    await seedActive(wiz, dfid, FOLDER, parseFixture([{ label: "A", fileId: "f" }]));
    const enrich = vi.fn(async () => ({ perLink: [] }) as EnrichAgendaReport);
    const res = await handleExtractAgenda(
      new Request("http://x"),
      ctx(wiz, dfid),
      baseDeps({
        fetchMeta: metaSpy(STAGED_ISO, ["some-other-folder"]),
        enrichAgenda: enrich,
      }),
    );
    expect(res.status).toBe(409);
    expect(enrich).not.toHaveBeenCalled();
  });

  test("m-ts: staged Date vs ISO string (same instant) does NOT false-409 → extracts", async () => {
    const wiz = randomUUID();
    const dfid = "xa-mts";
    await seedActive(wiz, dfid, FOLDER, parseFixture([{ label: "A", fileId: "f" }]));
    const enrich = vi.fn(async () => ({ perLink: [] }) as EnrichAgendaReport);
    const res = await handleExtractAgenda(
      new Request("http://x"),
      ctx(wiz, dfid),
      // staged_modified_time read back as a postgres.js Date; meta gives the ISO string.
      baseDeps({ fetchMeta: metaSpy(STAGED_ISO, [FOLDER]), enrichAgenda: enrich }),
    );
    expect(res.status).toBe(200);
    expect(enrich).toHaveBeenCalledTimes(1); // fence PASSED via revisionTimesMatch
  });

  test("m3: pending_folder_id CHANGED between tx#1b and tx#2 → 409, no show lock, parse_result unchanged", async () => {
    const wiz = randomUUID();
    const dfid = "xa-m3";
    const original = parseFixture([{ label: "A", fileId: "f" }]);
    await seedActive(wiz, dfid, FOLDER, original);
    const enrich = vi.fn(async () => {
      // Mutate the configured folder DURING the no-DB Drive window.
      await pool`UPDATE public.app_settings SET pending_folder_id = 'xa-folder-CHANGED' WHERE id = 'default'`;
      return { perLink: [{ ordinal: 0, verdict: "fresh", extraction: VALID_EXTRACTION }] } as EnrichAgendaReport;
    });
    const res = await handleExtractAgenda(
      new Request("http://x"),
      ctx(wiz, dfid),
      baseDeps({ fetchMeta: metaSpy(STAGED_ISO, [FOLDER]), enrichAgenda: enrich }),
    );
    expect(res.status).toBe(409);
    const after = await readParseResult(wiz, dfid);
    expect(after?.show.agenda_links[0]?.extracted).toBeUndefined(); // unchanged
    expect(await liveLeaseCount(dfid)).toBe(0); // lease released on exit
  });
});

// ─── (b/k/j-from-report/o) persist ─────────────────────────────────────────────

describe("extract-agenda — persist from report", () => {
  test("persists ONLY from report verdicts (fresh set / known_stale clear / unknown leave / recovered additive)", async () => {
    const wiz = randomUUID();
    const dfid = "xa-persist";
    // link0: stale stored extracted (must be OVERWRITTEN by report, not preserved).
    // link1: stored extracted (must be CLEARED by known_stale).
    // link2: no fileId (recoveredFileId additive on an unknown verdict, extracted left).
    const original = parseFixture([
      { label: "A", fileId: "file-a", extracted: STALE_EXTRACTION },
      { label: "B", fileId: "file-b", extracted: STALE_EXTRACTION },
      { label: "C" },
    ]);
    await seedActive(wiz, dfid, FOLDER, original);
    const enrich = vi.fn(
      async () =>
        ({
          perLink: [
            { ordinal: 0, verdict: "fresh", extraction: VALID_EXTRACTION },
            { ordinal: 1, verdict: "known_stale" },
            { ordinal: 2, verdict: "unknown", recoveredFileId: "rec-c" },
          ],
        }) as EnrichAgendaReport,
    );
    const res = await handleExtractAgenda(
      new Request("http://x"),
      ctx(wiz, dfid),
      baseDeps({ fetchMeta: metaSpy(STAGED_ISO, [FOLDER]), enrichAgenda: enrich }),
    );
    expect(res.status).toBe(200);

    const stored = await readParseResult(wiz, dfid);
    // fresh → set from the REPORT payload (NOT the preserved STALE link.extracted).
    expect(stored?.show.agenda_links[0]?.extracted).toEqual(VALID_EXTRACTION);
    // known_stale → cleared.
    expect(stored?.show.agenda_links[1]?.extracted).toBeUndefined();
    // unknown → left; recoveredFileId applied additively.
    expect(stored?.show.agenda_links[2]?.extracted).toBeUndefined();
    expect((stored?.show.agenda_links[2] as { fileId?: string })?.fileId).toBe("rec-c");

    // Response preview: ordinal 0 fresh + valid extraction → a render block; href exact.
    const body = (await res.json()) as { items: { href: string | null; block: unknown }[] };
    expect(body.items[0]?.block).not.toBeNull();
    expect(body.items[0]?.href).toBe("https://drive.google.com/file/d/file-a/view");

    // success → owner-scoped tx#2 release: no live lease remains.
    expect(await liveLeaseCount(dfid)).toBe(0);
  });
});

// ─── (c) cache short-circuit (real enrichAgenda) ───────────────────────────────

describe("extract-agenda — cache hit", () => {
  test("c: stored extracted current on rev+version → READY block, zero download/chips", async () => {
    const wiz = randomUUID();
    const dfid = "xa-cache";
    // link.extracted.sourceRevision === current headRevisionId ('rev-1') + version 1.
    const original = parseFixture([{ label: "A", fileId: "file-a", extracted: VALID_EXTRACTION }]);
    await seedActive(wiz, dfid, FOLDER, original);
    const drive = makeDriveClient("rev-1");
    const res = await handleExtractAgenda(
      new Request("http://x"),
      ctx(wiz, dfid),
      baseDeps({ fetchMeta: metaSpy(STAGED_ISO, [FOLDER]), driveClient: drive }), // REAL enrichAgenda
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { block: unknown }[] };
    expect(body.items[0]?.block).not.toBeNull(); // cache-hit fresh → block present
    expect(drive.getFile).toHaveBeenCalled();
    expect(drive.downloadFileBytes).not.toHaveBeenCalled();
    expect(drive.getAgendaChips).not.toHaveBeenCalled();
  });
});

// ─── (j) three DB windows; no connection held during Drive ─────────────────────

describe("extract-agenda — connection-lifetime (three windows)", () => {
  test("j: tx#1a→commit→tx#1b→commit→[Drive,no DB]→tx#2; a free connection exists during Drive", async () => {
    const wiz = randomUUID();
    const dfid = "xa-j";
    await seedActive(wiz, dfid, FOLDER, parseFixture([{ label: "A", fileId: "f" }]));

    // Route runs on a max:1 pool: if ANY tx were held across Drive, a concurrent
    // query on the SAME pool would block (deadlock under max:1).
    const sqlMax1 = postgres(LOCAL_DB_URL, { max: 1, prepare: false });

    // Count begin() calls to assert EXACTLY THREE DB windows (no fourth).
    let beginCount = 0;
    const instrumented = ((...args: unknown[]) =>
      (sqlMax1 as unknown as (...a: unknown[]) => unknown)(...args)) as unknown as NonNullable<
      ExtractAgendaDeps["sql"]
    >;
    (instrumented as { begin: unknown }).begin = (fn: (tx: unknown) => Promise<unknown>) => {
      beginCount++;
      return (sqlMax1 as unknown as { begin: (f: (tx: unknown) => Promise<unknown>) => Promise<unknown> }).begin(fn);
    };

    let freeDuringDrive: "row" | "blocked" | "error" = "error";
    const fetchMeta = vi.fn(async () => makeMeta(STAGED_ISO, [FOLDER]));
    const enrich = vi.fn(async () => {
      // We are mid-Drive: prove a connection on the route's max:1 pool is FREE.
      const probe = await Promise.race([
        sqlMax1`SELECT 1 AS one`.then(() => "row" as const),
        new Promise<"blocked">((r) => setTimeout(() => r("blocked"), 2000)),
      ]);
      freeDuringDrive = probe;
      return { perLink: [] } as EnrichAgendaReport;
    });

    try {
      const res = await handleExtractAgenda(
        new Request("http://x"),
        ctx(wiz, dfid),
        baseDeps({ sql: instrumented, fetchMeta, enrichAgenda: enrich }),
      );
      expect(res.status).toBe(200);
      expect(freeDuringDrive).toBe("row"); // no tx held across Drive
      expect(beginCount).toBe(3); // exactly THREE windows: tx#1a, tx#1b, tx#2
      expect(fetchMeta).toHaveBeenCalledTimes(2); // before-fence + after-fence
    } finally {
      await sqlMax1.end({ timeout: 5 });
    }
  });
});

// ─── (q) deadline timeout ──────────────────────────────────────────────────────

describe("extract-agenda — deadline race", () => {
  test("q-cooperative: timeout aborts → settles → 504, no tx#2, lease released, retry can claim", async () => {
    const wiz = randomUUID();
    const dfid = "xa-qc";
    const original = parseFixture([{ label: "A", fileId: "f" }]);
    await seedActive(wiz, dfid, FOLDER, original);

    const enrich = vi.fn(
      (_r: unknown, _d: unknown, _s: unknown, opts?: { signal?: AbortSignal }) =>
        new Promise<EnrichAgendaReport>((_resolve, reject) => {
          opts?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const res = await handleExtractAgenda(
      new Request("http://x"),
      ctx(wiz, dfid),
      baseDeps({
        fetchMeta: metaSpy(STAGED_ISO, [FOLDER]),
        enrichAgenda: enrich as unknown as NonNullable<ExtractAgendaDeps["enrichAgenda"]>,
        deadlineMs: 30,
      }),
    );
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ status: "timeout" });
    // tx#2 skipped → parse_result unchanged.
    expect((await readParseResult(wiz, dfid))?.show.agenda_links[0]?.extracted).toBeUndefined();
    // lease released by the finally (standalone) → a retry can claim.
    expect(await liveLeaseCount(dfid)).toBe(0);
  });

  test("q-stuck: while awaiting non-settling work, a same-row retry → 202 in_progress (lease HELD)", async () => {
    const wiz = randomUUID();
    const dfid = "xa-qs";
    await seedActive(wiz, dfid, FOLDER, parseFixture([{ label: "A", fileId: "f" }]));

    let settle: (r: EnrichAgendaReport) => void = () => {};
    const stuck = new Promise<EnrichAgendaReport>((r) => {
      settle = r;
    });
    const enrich = vi.fn(() => stuck); // never settles on abort

    // Handler 1: times out, then AWAITS settlement (does not return yet).
    const p1 = handleExtractAgenda(
      new Request("http://x"),
      ctx(wiz, dfid),
      baseDeps({
        fetchMeta: metaSpy(STAGED_ISO, [FOLDER]),
        enrichAgenda: enrich as unknown as NonNullable<ExtractAgendaDeps["enrichAgenda"]>,
        deadlineMs: 30,
      }),
    );

    // Give handler 1 time to claim the lease and enter the await-settlement phase.
    await new Promise((r) => setTimeout(r, 200));
    expect(await liveLeaseCount(dfid)).toBe(1); // lease still HELD

    // Concurrent same-row retry on a SEPARATE slot store → durable lease → in_progress.
    const retry = await handleExtractAgenda(
      new Request("http://x"),
      ctx(wiz, dfid),
      baseDeps({
        slotStore: createInMemorySlotStore(),
        fetchMeta: metaSpy(STAGED_ISO, [FOLDER]),
        enrichAgenda: enrich as unknown as NonNullable<ExtractAgendaDeps["enrichAgenda"]>,
        deadlineMs: 30,
      }),
    );
    expect(retry.status).toBe(202);
    expect(await retry.json()).toEqual({ status: "pending", reason: "in_progress" });

    // Let handler 1 settle so it returns + releases (teardown).
    settle({ perLink: [] });
    const res1 = await p1;
    expect(res1.status).toBe(504);
    expect(await liveLeaseCount(dfid)).toBe(0);
  });
});

// ─── (d) durable cross-instance dedup ──────────────────────────────────────────

describe("extract-agenda — durable lease dedup (two separate slot stores)", () => {
  test("d: same (wiz,dfid) → one extracts (one downloadFileBytes), other 202 in_progress via DURABLE lease", async () => {
    const wiz = randomUUID();
    const dfid = "xa-d";
    await seedActive(wiz, dfid, FOLDER, parseFixture([{ label: "A", fileId: "f" }]));

    const drive = makeDriveClient();
    let release: () => void = () => {};
    const blockA = new Promise<void>((r) => {
      release = r;
    });
    const enrich = vi.fn(async (_r: unknown, d: DriveClient) => {
      await d.downloadFileBytes!("f"); // observable: one download for the extractor
      await blockA; // hold the lease while handler B fires
      return { perLink: [] } as EnrichAgendaReport;
    });

    // Handler A (store 1) — blocks mid-extraction.
    const pA = handleExtractAgenda(
      new Request("http://x"),
      ctx(wiz, dfid),
      baseDeps({
        slotStore: createInMemorySlotStore(),
        driveClient: drive,
        fetchMeta: metaSpy(STAGED_ISO, [FOLDER]),
        enrichAgenda: enrich as unknown as NonNullable<ExtractAgendaDeps["enrichAgenda"]>,
      }),
    );

    await new Promise((r) => setTimeout(r, 200)); // let A claim + start extraction

    // Handler B — SEPARATE slot store (fresh in-flight Set) → 202 must come from the
    // DURABLE lease, not a shared local guard.
    const resB = await handleExtractAgenda(
      new Request("http://x"),
      ctx(wiz, dfid),
      baseDeps({
        slotStore: createInMemorySlotStore(),
        driveClient: drive,
        fetchMeta: metaSpy(STAGED_ISO, [FOLDER]),
        enrichAgenda: enrich as unknown as NonNullable<ExtractAgendaDeps["enrichAgenda"]>,
      }),
    );
    expect(resB.status).toBe(202);
    expect(await resB.json()).toEqual({ status: "pending", reason: "in_progress" });

    release();
    const resA = await pA;
    expect(resA.status).toBe(200);

    // Exactly ONE extractor downloaded; B short-circuited before enrichAgenda.
    expect((drive.downloadFileBytes as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    expect(await liveLeaseCount(dfid)).toBe(0); // A released on success
  });

  test("queued: global cap full → 202 queued", async () => {
    const wiz = randomUUID();
    const dfid = "xa-queued";
    await seedActive(wiz, dfid, FOLDER, parseFixture([{ label: "A", fileId: "f" }]));
    for (let i = 0; i < K; i++) await insertLiveLease(`xa-queued-filler-${i}`);
    const res = await handleExtractAgenda(
      new Request("http://x"),
      ctx(wiz, dfid),
      baseDeps({ fetchMeta: metaSpy(STAGED_ISO, [FOLDER]) }),
    );
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ status: "pending", reason: "queued" });
    await pool`DELETE FROM public.agenda_extract_leases WHERE drive_file_id LIKE 'xa-queued-filler-%'`;
  });
});

// ─── (p / d5) lease released on every post-claim exit ──────────────────────────

describe("extract-agenda — lease release on every exit", () => {
  test("p: enrichAgenda throw → 504-or-500 path releases the lease immediately", async () => {
    const wiz = randomUUID();
    const dfid = "xa-p-throw";
    await seedActive(wiz, dfid, FOLDER, parseFixture([{ label: "A", fileId: "f" }]));
    const enrich = vi.fn(async () => {
      throw new Error("boom");
    });
    await handleExtractAgenda(
      new Request("http://x"),
      ctx(wiz, dfid),
      baseDeps({
        fetchMeta: metaSpy(STAGED_ISO, [FOLDER]),
        enrichAgenda: enrich as unknown as NonNullable<ExtractAgendaDeps["enrichAgenda"]>,
      }),
    ).catch(() => {});
    // Whatever the response, the durable lease must NOT linger.
    expect(await liveLeaseCount(dfid)).toBe(0);
  });

  test("d5: lease lost mid-flight (expired+reclaimed) → tx#2 UPDATE 0 rows → 409, no overwrite", async () => {
    const wiz = randomUUID();
    const dfid = "xa-d5";
    const original = parseFixture([{ label: "A", fileId: "f" }]);
    await seedActive(wiz, dfid, FOLDER, original);
    const enrich = vi.fn(async () => {
      // Simulate owner A's lease being GC'd + reclaimed by another owner B during Drive.
      await pool`DELETE FROM public.agenda_extract_leases WHERE drive_file_id = ${dfid}`;
      await pool`INSERT INTO public.agenda_extract_leases (wizard_session_id, drive_file_id, owner, expires_at)
                 VALUES (${wiz}::uuid, ${dfid}, 'owner-B', now() + '5 minutes'::interval)`;
      return { perLink: [{ ordinal: 0, verdict: "fresh", extraction: VALID_EXTRACTION }] } as EnrichAgendaReport;
    });
    const res = await handleExtractAgenda(
      new Request("http://x"),
      ctx(wiz, dfid),
      baseDeps({ fetchMeta: metaSpy(STAGED_ISO, [FOLDER]), enrichAgenda: enrich }),
    );
    expect(res.status).toBe(409);
    // A did NOT overwrite (owner-scoped EXISTS guard made the UPDATE affect 0 rows).
    expect((await readParseResult(wiz, dfid))?.show.agenda_links[0]?.extracted).toBeUndefined();
    // cleanup owner-B filler
    await pool`DELETE FROM public.agenda_extract_leases WHERE drive_file_id = ${dfid}`;
  });
});
