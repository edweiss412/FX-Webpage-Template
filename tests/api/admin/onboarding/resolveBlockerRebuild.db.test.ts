import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { assertLocalDbUrl } from "../../../db/_remediationHelpers";

import type { ParseResult, ParseWarning } from "@/lib/parser/types";
import type { DriveListedFile } from "@/lib/drive/list";
import type {
  OnboardingScanResult,
  PreparedOnboardingFile,
  scanOnboardingPreparedFiles as ScanFn,
} from "@/lib/sync/runOnboardingScan";

/**
 * Task 8 — POST /api/admin/onboarding/resolve-blocker, `action: "rebuild"` REAL dispatch.
 *
 * Structural defense: the seven-outcome enumeration injects ONLY the real core's OWN
 * `scanOnboardingPreparedFiles` seam (never the whole `applyRescanDecisionUnderLock`), so
 * the REAL core runs its real `shows_pending_changes` deletes + `onShadowDeleted`
 * co-location. The four scan-level outcomes (schema_missing/superseded/not_staged/
 * hard_failed) don't touch `capturePriorState`'s result at all — only a corrupt shadow
 * (matching the claimed code) + a manifest row are required. The three staged outcomes
 * (dirty_demoted/clean_restamped/clean_unchecked) DO require `capturePriorState` to see a
 * real prior — a `pending_syncs` row is pre-seeded (capturePriorState checks pending_syncs
 * BEFORE the shadow, so a present pending_syncs row IS the prior) and the injected
 * `prepareOnboardingFiles` dep's `parseResult` is set identical to (clean) or divergent
 * from (dirty) that prior, driving the REAL `computeRescanDecision`.
 *
 * `fetchDriveFileMetadata` is not one of `ResolveBlockerRouteDeps`' injectable seams (only
 * `requireAdminIdentity`/`prepareOnboardingFiles`/`scanOnboardingPreparedFiles` are), so it
 * is module-mocked here — its absence-of-call is the proof in the pre-lock cap-gate test.
 */

const LOCAL_URL = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);

const FOLDER_ID = "resolve-blocker-rebuild-folder";

const fetchDriveFileMetadataMock = vi.fn(async (driveFileId: string) => ({
  driveFileId,
  name: "Rebuild Sheet",
  mimeType: "application/vnd.google-apps.spreadsheet",
  modifiedTime: "2026-07-16T00:00:00.000Z",
  parents: [FOLDER_ID],
}));
vi.mock("@/lib/drive/fetch", () => ({
  fetchDriveFileMetadata: (...a: unknown[]) => fetchDriveFileMetadataMock(...(a as [string])),
}));

const deferredTasks: Array<() => Promise<void>> = [];
const deferPostResponseMock = vi.fn((task: () => Promise<void>) => {
  deferredTasks.push(task);
});
vi.mock("@/lib/async/deferPostResponse", () => ({
  deferPostResponse: (t: () => Promise<void>) => deferPostResponseMock(t),
}));

const logAdminOutcomeMock = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/lib/log/logAdminOutcome", () => ({
  logAdminOutcome: (...a: unknown[]) => logAdminOutcomeMock(...a),
}));

import {
  handleResolveBlocker,
  resolveRebuild,
} from "@/app/api/admin/onboarding/resolve-blocker/route";

const SESSION = "8a8a8a8a-1111-4111-8111-8a8a8a8a8a8a";
const DRIVE = "resolve-blocker-rebuild-drive-file";
const ADMIN_EMAIL = "admin@example.com";
const APPROVER_EMAIL = "doug@fxav.com";
const CLAIMED_CODE = "STAGED_REVIEW_ITEMS_CORRUPT";
const PRIOR_MODTIME = "2026-06-01T00:00:00.000Z";

function parseResult(crew: Array<{ name: string; email: string; role: string }>): ParseResult {
  return {
    show: {
      title: "Rebuild Fixture",
      client_label: "Client",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: {
        travelIn: "2026-05-07",
        set: "2026-05-08",
        showDays: ["2026-05-09"],
        travelOut: "2026-05-10",
      },
      schedule_phases: {},
      event_details: {},
      agenda_links: [],
      coi_status: null,
      po: "PO-1",
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: crew.map((c) => ({
      name: c.name,
      email: c.email,
      phone: null,
      role: c.role,
      role_flags: [],
      date_restriction: { kind: "none" },
      stage_restriction: { kind: "none" },
      flight_info: null,
    })),
    hotelReservations: [],
    rooms: [
      {
        kind: "ballroom",
        name: "Main",
        dimensions: null,
        floor: null,
        setup: null,
        set_time: null,
        show_time: null,
        strike_time: null,
        audio: null,
        video: null,
        lighting: null,
        scenic: null,
        power: null,
        digital_signage: null,
        other: null,
        notes: null,
      },
    ],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [] as ParseWarning[],
    hardErrors: [],
  } as unknown as ParseResult;
}

const PARSE_PRIOR = parseResult([{ name: "Ada", email: "ada@x.example", role: "A1" }]);
// A genuine content edit (MI-11/12 email change on an existing member) — the canonical
// computeRescanDecision DIRTY trigger (mirrors tests/onboarding/finalizeInlineRescan.db.test.ts).
const PARSE_DIRTY = parseResult([{ name: "Ada", email: "ada-changed@example.com", role: "A1" }]);

function preparedFor(parse: ParseResult): Extract<PreparedOnboardingFile, { kind: "sheet" }> {
  return {
    file: {
      driveFileId: DRIVE,
      name: "Rebuild Sheet",
      mimeType: "application/vnd.google-apps.spreadsheet",
      modifiedTime: "2026-07-16T00:00:00.000Z",
      parents: [FOLDER_ID],
    } as DriveListedFile,
    kind: "sheet",
    binding: {} as never,
    parseResult: parse,
    sourceAnchors: {},
  };
}

type OutcomeKind =
  | "schema_missing"
  | "superseded"
  | "not_staged"
  | "hard_failed"
  | "dirty_demoted"
  | "clean_restamped"
  | "clean_unchecked";

function scanReturning(outcome: OutcomeKind): typeof ScanFn {
  const fn = async (): Promise<OnboardingScanResult> => {
    switch (outcome) {
      case "schema_missing":
        return {
          outcome: "schema_missing",
          code: "WIZARD_ISOLATION_INDEXES_MISSING",
          missingIndexes: [],
        };
      case "superseded":
        return {
          outcome: "superseded",
          code: "WIZARD_SESSION_SUPERSEDED_DURING_SCAN",
          processed: [],
        };
      case "not_staged":
        return {
          outcome: "completed",
          processed: [{ driveFileId: DRIVE, outcome: "skipped_non_sheet" }],
        };
      case "hard_failed":
        return {
          outcome: "completed",
          processed: [{ driveFileId: DRIVE, outcome: "hard_failed" }],
        };
      default:
        // The three staged outcomes: the mocked scan reports 'staged' WITHOUT touching the
        // DB — the REAL prior + readback both come from a pre-seeded pending_syncs row
        // (capturePriorState checks pending_syncs BEFORE the shadow).
        return { outcome: "completed", processed: [{ driveFileId: DRIVE, outcome: "staged" }] };
    }
  };
  return fn as unknown as typeof ScanFn;
}

let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
try {
  const probe = postgres(LOCAL_URL, {
    max: 4,
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

function one<T = Record<string, unknown>>(rows: unknown): T {
  return (rows as T[])[0]!;
}

async function cleanup(): Promise<void> {
  if (!sql) return;
  for (const stmt of [
    `delete from public.onboarding_rebuild_attempts where drive_file_id = '${DRIVE}'`,
    `delete from public.pending_syncs where drive_file_id = '${DRIVE}'`,
    `delete from public.pending_ingestions where drive_file_id = '${DRIVE}'`,
    `delete from public.shows_pending_changes where drive_file_id = '${DRIVE}'`,
    `delete from public.onboarding_scan_manifest where drive_file_id = '${DRIVE}'`,
    `delete from public.shows where drive_file_id = '${DRIVE}'`,
  ]) {
    await sql.unsafe(stmt, []).catch(() => {});
  }
  await sql
    .unsafe(
      `update public.app_settings
          set pending_wizard_session_id = null, pending_wizard_session_at = null,
              pending_folder_id = null
        where id = 'default'`,
      [],
    )
    .catch(() => {});
}

async function seedActiveSession(session: string): Promise<void> {
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now(), pending_folder_id = $2
      where id = 'default'`,
    [session, FOLDER_ID],
  );
}

async function seedShow(): Promise<string> {
  const row = one<{ id: string }>(
    await sql!.unsafe(
      `insert into public.shows
         (drive_file_id, slug, title, client_label, template_version, published, last_sync_status, archived)
       values ($1, $2, 'Resolve Blocker Rebuild', 'Client', 'v4', true, 'ok', false)
       returning id`,
      [DRIVE, `slug-${DRIVE}`],
    ),
  );
  return row.id;
}

async function seedManifestRow(session: string, driveFileId: string): Promise<void> {
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', 'Rebuild Sheet', 'applied')`,
    [FOLDER_ID, session, driveFileId],
  );
}

/** A shadow row that REFUSES with `code` (the two corrupt codes are constructed via the
 * minimal missing-key each refusal reason needs — see lib/onboarding/shadowPayload.ts). */
async function seedShadow(
  session: string,
  driveFileId: string,
  showId: string,
  code: "STAGED_REVIEW_ITEMS_CORRUPT" | "STAGED_PARSE_RESULT_CORRUPT" | "clean",
): Promise<void> {
  const base: Record<string, unknown> = {
    staged_id: "staged-1",
    staged_modified_time: PRIOR_MODTIME,
    base_modified_time: null,
    parse_result: PARSE_PRIOR,
    triggered_review_items: [],
  };
  let payload: Record<string, unknown>;
  if (code === "STAGED_PARSE_RESULT_CORRUPT") {
    payload = { ...base, parse_result: null };
  } else if (code === "STAGED_REVIEW_ITEMS_CORRUPT") {
    payload = { ...base };
    delete payload.triggered_review_items; // key ABSENT → refuse STAGED_REVIEW_ITEMS_CORRUPT
  } else {
    payload = base; // fully valid → parses ok:true
  }
  await sql!.unsafe(
    `insert into public.shows_pending_changes
       (wizard_session_id, drive_file_id, show_id, payload, applied_by_email, applied_at_intent)
     values ($1::uuid, $2, $3::uuid, $4, $5, now())`,
    // postgres.js serializes a raw object for a jsonb column itself — never JSON.stringify
    // (the double-encode class; see tests/onboarding/finalizeCasFullApply.db.test.ts:236).
    [session, driveFileId, showId, payload, APPROVER_EMAIL] as never[],
  );
}

/** Pre-seeds `pending_syncs` as the REAL prior `capturePriorState` will read (it checks
 * pending_syncs BEFORE the shadow) — and, since the mocked scan never restages, this SAME
 * row is also what the core's post-scan readback returns. */
async function seedPendingSyncsPrior(
  session: string,
  driveFileId: string,
  opts: { approved: boolean; parse: ParseResult },
): Promise<void> {
  await sql!.unsafe(
    `insert into public.pending_syncs
       (drive_file_id, wizard_session_id, base_modified_time, staged_modified_time, parse_result,
        triggered_review_items, source_kind, wizard_approved, wizard_approved_by_email,
        wizard_approved_at, wizard_reviewer_choices, wizard_reviewer_choices_version, warning_summary)
     values ($1, $2::uuid, null, $3::timestamptz, $4, '[]'::jsonb, 'onboarding_scan', $5, $6, $7,
             case when $5 then '[]'::jsonb else null end,
             case when $5 then 1 else null end,
             '')`,
    // postgres.js serializes a raw object for a jsonb column itself — never JSON.stringify
    // (the double-encode class; see tests/onboarding/finalizeCasFullApply.db.test.ts:236). The
    // reviewer-choices empty array is an inline SQL literal (not a JS array param) — a JS
    // array param round-trips as a Postgres array type, not jsonb.
    [
      driveFileId,
      session,
      PRIOR_MODTIME,
      opts.parse,
      opts.approved,
      opts.approved ? APPROVER_EMAIL : null,
      opts.approved ? PRIOR_MODTIME : null,
    ] as never[],
  );
}

async function seedAttempts(session: string, driveFileId: string, attempts: number): Promise<void> {
  await sql!.unsafe(
    `insert into public.onboarding_rebuild_attempts (wizard_session_id, drive_file_id, attempts)
     values ($1::uuid, $2, $3)
     on conflict (wizard_session_id, drive_file_id) do update set attempts = excluded.attempts`,
    [session, driveFileId, attempts],
  );
}

async function readAttempts(session: string, driveFileId: string): Promise<number> {
  const rows = (await sql!.unsafe(
    `select attempts from public.onboarding_rebuild_attempts where wizard_session_id = $1::uuid and drive_file_id = $2`,
    [session, driveFileId],
  )) as Array<{ attempts: number }>;
  return rows[0]?.attempts ?? 0;
}

async function shadowExists(session: string, driveFileId: string): Promise<boolean> {
  const rows = await sql!.unsafe(
    `select 1 from public.shows_pending_changes where wizard_session_id = $1::uuid and drive_file_id = $2`,
    [session, driveFileId],
  );
  return (rows as unknown[]).length > 0;
}

function req(body: unknown): Request {
  return new Request("https://crew.fxav.test/api/admin/onboarding/resolve-blocker", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Fully seeds the pre-conditions for a given target outcome and returns the `prepared`
 * sheet the injected `prepareOnboardingFiles` dep must return. */
async function seedForOutcome(
  outcome: OutcomeKind,
): Promise<Extract<PreparedOnboardingFile, { kind: "sheet" }>> {
  await seedActiveSession(SESSION);
  const showId = await seedShow();
  await seedManifestRow(SESSION, DRIVE);
  await seedShadow(SESSION, DRIVE, showId, CLAIMED_CODE);
  if (
    outcome === "dirty_demoted" ||
    outcome === "clean_restamped" ||
    outcome === "clean_unchecked"
  ) {
    const approved = outcome === "clean_restamped";
    await seedPendingSyncsPrior(SESSION, DRIVE, { approved, parse: PARSE_PRIOR });
    return preparedFor(outcome === "dirty_demoted" ? PARSE_DIRTY : PARSE_PRIOR);
  }
  return preparedFor(PARSE_PRIOR);
}

async function drainDeferred(): Promise<void> {
  const tasks = deferredTasks.splice(0);
  for (const t of tasks) await t();
}

const maybe = dbUp ? describe : describe.skip;

maybe("POST /api/admin/onboarding/resolve-blocker — action: rebuild real dispatch (Task 8)", () => {
  beforeAll(() => {
    vi.stubEnv("TEST_DATABASE_URL", LOCAL_URL);
    vi.stubEnv("DATABASE_URL", LOCAL_URL);
    expect(LOCAL_URL).toMatch(/127\.0\.0\.1|localhost/);
  });
  beforeEach(async () => {
    deferredTasks.length = 0;
    deferPostResponseMock.mockClear();
    logAdminOutcomeMock.mockClear();
    fetchDriveFileMetadataMock.mockClear();
    await cleanup();
  });
  afterAll(async () => {
    await cleanup();
    vi.unstubAllEnvs();
    if (sql) await sql.end({ timeout: 5 });
  });

  describe("not_currently_blocked guard cases (no mutation)", () => {
    test("no shows_pending_changes row at all → not_currently_blocked", async () => {
      await seedActiveSession(SESSION);
      await seedShow();
      await seedManifestRow(SESSION, DRIVE);
      const res = await handleResolveBlocker(
        req({
          wizardSessionId: SESSION,
          driveFileId: DRIVE,
          code: CLAIMED_CODE,
          action: "rebuild",
        }),
        {
          requireAdminIdentity: async () => ({ email: ADMIN_EMAIL }),
          prepareOnboardingFiles: async () => [preparedFor(PARSE_PRIOR)],
        },
      );
      expect(await res.json()).toEqual({ ok: false, status: "not_currently_blocked" });
      expect(deferredTasks.length).toBe(0);
    });

    test("shadow parses clean (not STAGED_*_CORRUPT) → not_currently_blocked", async () => {
      await seedActiveSession(SESSION);
      const showId = await seedShow();
      await seedManifestRow(SESSION, DRIVE);
      await seedShadow(SESSION, DRIVE, showId, "clean");
      const res = await handleResolveBlocker(
        req({
          wizardSessionId: SESSION,
          driveFileId: DRIVE,
          code: CLAIMED_CODE,
          action: "rebuild",
        }),
        {
          requireAdminIdentity: async () => ({ email: ADMIN_EMAIL }),
          prepareOnboardingFiles: async () => [preparedFor(PARSE_PRIOR)],
        },
      );
      expect(await res.json()).toEqual({ ok: false, status: "not_currently_blocked" });
      expect(await shadowExists(SESSION, DRIVE)).toBe(true); // unmutated
    });

    test("corrupt shadow exists but NO onboarding_scan_manifest row for (session, sheet) → not_currently_blocked, no mutation", async () => {
      await seedActiveSession(SESSION);
      const showId = await seedShow();
      // No seedManifestRow() — the shadow is outside this session's scan manifest.
      await seedShadow(SESSION, DRIVE, showId, CLAIMED_CODE);
      const res = await handleResolveBlocker(
        req({
          wizardSessionId: SESSION,
          driveFileId: DRIVE,
          code: CLAIMED_CODE,
          action: "rebuild",
        }),
        {
          requireAdminIdentity: async () => ({ email: ADMIN_EMAIL }),
          prepareOnboardingFiles: async () => [preparedFor(PARSE_PRIOR)],
        },
      );
      expect(await res.json()).toEqual({ ok: false, status: "not_currently_blocked" });
      expect(await shadowExists(SESSION, DRIVE)).toBe(true); // unmutated
    });

    test("wrong-code shadow: shadow refuses with a code != the requested code → not_currently_blocked, no mutation", async () => {
      await seedActiveSession(SESSION);
      const showId = await seedShow();
      await seedManifestRow(SESSION, DRIVE);
      // Shadow actually refuses STAGED_PARSE_RESULT_CORRUPT; request claims STAGED_REVIEW_ITEMS_CORRUPT.
      await seedShadow(SESSION, DRIVE, showId, "STAGED_PARSE_RESULT_CORRUPT");
      const res = await handleResolveBlocker(
        req({
          wizardSessionId: SESSION,
          driveFileId: DRIVE,
          code: "STAGED_REVIEW_ITEMS_CORRUPT",
          action: "rebuild",
        }),
        {
          requireAdminIdentity: async () => ({ email: ADMIN_EMAIL }),
          prepareOnboardingFiles: async () => [preparedFor(PARSE_PRIOR)],
        },
      );
      expect(await res.json()).toEqual({ ok: false, status: "not_currently_blocked" });
      expect(await shadowExists(SESSION, DRIVE)).toBe(true); // unmutated
    });
  });

  test("pre-restage cap gate (advisory, no Drive fetch): attempts already at CAP → escalated, Drive fetch + prepareOnboardingFiles never called", async () => {
    await seedActiveSession(SESSION);
    await seedAttempts(SESSION, DRIVE, 1); // == CAP
    const prepareOnboardingFilesSpy = vi.fn(async () => [preparedFor(PARSE_PRIOR)]);
    const res = await handleResolveBlocker(
      req({ wizardSessionId: SESSION, driveFileId: DRIVE, code: CLAIMED_CODE, action: "rebuild" }),
      {
        requireAdminIdentity: async () => ({ email: ADMIN_EMAIL }),
        prepareOnboardingFiles: prepareOnboardingFilesSpy,
      },
    );
    expect(await res.json()).toEqual({ ok: false, status: "escalated", code: CLAIMED_CODE });
    expect(fetchDriveFileMetadataMock).not.toHaveBeenCalled();
    expect(prepareOnboardingFilesSpy).not.toHaveBeenCalled();
    expect(deferredTasks.length).toBe(0);
  });

  test("cap gate (authoritative, under-lock race backstop): direct resolveRebuild call with attempts=1 + corrupt shadow + manifest → escalated, no restage", async () => {
    const showId = await seedShow();
    await seedManifestRow(SESSION, DRIVE);
    await seedShadow(SESSION, DRIVE, showId, CLAIMED_CODE);
    await seedAttempts(SESSION, DRIVE, 1);

    const res = await sql!.begin(async (rawTx) => {
      return await resolveRebuild(
        rawTx as unknown as { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> },
        {
          wizardSessionId: SESSION,
          driveFileId: DRIVE,
          code: CLAIMED_CODE,
          admin: { email: ADMIN_EMAIL },
          prepared: preparedFor(PARSE_PRIOR),
          pendingFolderId: FOLDER_ID,
        },
      );
    });
    expect(await (res as Response).json()).toEqual({
      ok: false,
      status: "escalated",
      code: CLAIMED_CODE,
    });
    expect(await shadowExists(SESSION, DRIVE)).toBe(true); // unmutated
    expect(await readAttempts(SESSION, DRIVE)).toBe(1); // unchanged
  });

  const OUTCOMES: Array<{ outcome: OutcomeKind; consumesCap: boolean }> = [
    { outcome: "schema_missing", consumesCap: false },
    { outcome: "superseded", consumesCap: false },
    { outcome: "not_staged", consumesCap: false },
    { outcome: "hard_failed", consumesCap: true },
    { outcome: "dirty_demoted", consumesCap: true },
    { outcome: "clean_restamped", consumesCap: true },
    { outcome: "clean_unchecked", consumesCap: true },
  ];

  const EXPECTED_RESPONSE: Record<OutcomeKind, unknown> = {
    schema_missing: {
      ok: false,
      status: "needs_attention",
      code: "WIZARD_ISOLATION_INDEXES_MISSING",
    },
    superseded: { ok: false, status: "superseded" },
    not_staged: { ok: false, status: "needs_attention", code: expect.any(String) },
    hard_failed: { ok: false, status: "needs_attention", code: expect.any(String) },
    dirty_demoted: { ok: true, status: "resolved" },
    clean_restamped: { ok: true, status: "resolved" },
    clean_unchecked: { ok: true, status: "resolved" },
  };

  for (const { outcome, consumesCap } of OUTCOMES) {
    test(`rebuild outcome ${outcome}: attempts increments iff shadow deleted (consumesCap=${consumesCap})`, async () => {
      const prepared = await seedForOutcome(outcome);
      const before = await readAttempts(SESSION, DRIVE);

      const res = await handleResolveBlocker(
        req({
          wizardSessionId: SESSION,
          driveFileId: DRIVE,
          code: CLAIMED_CODE,
          action: "rebuild",
        }),
        {
          requireAdminIdentity: async () => ({ email: ADMIN_EMAIL }),
          prepareOnboardingFiles: async () => [prepared],
          scanOnboardingPreparedFiles: scanReturning(outcome),
        },
      );
      expect(await res.json()).toEqual(EXPECTED_RESPONSE[outcome]);
      await drainDeferred();

      const after = await readAttempts(SESSION, DRIVE);
      expect(after).toBe(consumesCap ? before + 1 : before);
    });
  }

  test("concurrent double-submit on a shadow-deleting outcome: exactly ONE rescan consumes the cap; the loser sees the shadow already superseded (not_currently_blocked, not escalated)", async () => {
    await seedActiveSession(SESSION);
    const showId = await seedShow();
    await seedManifestRow(SESSION, DRIVE);
    await seedShadow(SESSION, DRIVE, showId, CLAIMED_CODE);
    await seedPendingSyncsPrior(SESSION, DRIVE, { approved: true, parse: PARSE_PRIOR });

    const runOnce = () =>
      handleResolveBlocker(
        req({
          wizardSessionId: SESSION,
          driveFileId: DRIVE,
          code: CLAIMED_CODE,
          action: "rebuild",
        }),
        {
          requireAdminIdentity: async () => ({ email: ADMIN_EMAIL }),
          prepareOnboardingFiles: async () => [preparedFor(PARSE_DIRTY)],
          scanOnboardingPreparedFiles: scanReturning("dirty_demoted"),
        },
      );

    const [resA, resB] = await Promise.all([runOnce(), runOnce()]);
    await drainDeferred();
    const bodies = await Promise.all([resA.json(), resB.json()]);

    const resolved = bodies.filter((b) => (b as { ok: boolean }).ok === true);
    const notCurrentlyBlocked = bodies.filter(
      (b) => (b as { status: string }).status === "not_currently_blocked",
    );
    expect(resolved.length).toBe(1);
    expect(resolved[0]).toEqual({ ok: true, status: "resolved" });
    expect(notCurrentlyBlocked.length).toBe(1);
    // Neither response is `escalated` — the loser is refused at the shadow-check, which
    // precedes the cap gate (spec: after a successful rebuild the blocker is gone).
    expect(bodies.every((b) => (b as { status: string }).status !== "escalated")).toBe(true);
    expect(await readAttempts(SESSION, DRIVE)).toBe(1);
  });

  test("forensic reason survives a shadow-deleting hard_failed", async () => {
    await seedActiveSession(SESSION);
    const showId = await seedShow();
    await seedManifestRow(SESSION, DRIVE);
    await seedShadow(SESSION, DRIVE, showId, CLAIMED_CODE); // review_items_invalid reason

    const res = await handleResolveBlocker(
      req({ wizardSessionId: SESSION, driveFileId: DRIVE, code: CLAIMED_CODE, action: "rebuild" }),
      {
        requireAdminIdentity: async () => ({ email: ADMIN_EMAIL }),
        prepareOnboardingFiles: async () => [preparedFor(PARSE_PRIOR)],
        scanOnboardingPreparedFiles: scanReturning("hard_failed"),
      },
    );
    expect(((await res.json()) as { status: string }).status).toBe("needs_attention");
    expect(deferredTasks.length).toBe(1);
    await drainDeferred();

    expect(logAdminOutcomeMock).toHaveBeenCalledTimes(1);
    expect(logAdminOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "ONBOARDING_BLOCKER_REBUILT",
        source: "api.admin.onboarding.resolveBlocker",
        actorEmail: ADMIN_EMAIL,
        driveFileId: DRIVE,
        wizardSessionId: SESSION,
        result: "hard_failed",
        extra: expect.objectContaining({
          corruptionReason: "review_items_invalid",
          shadowDeleted: true,
        }),
      }),
    );
  });
});
