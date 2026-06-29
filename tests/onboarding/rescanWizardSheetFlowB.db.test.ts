import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { PostgresOnboardingScanTx, type PostgresTransaction } from "@/lib/sync/runOnboardingScan";
import { runPhase1 } from "@/lib/sync/phase1";
import type { ParseResult, TriggeredReviewItem } from "@/lib/parser/types";
import { handleOnboardingFinalize } from "@/app/api/admin/onboarding/finalize/route";
import { handleOnboardingFinalizeCas } from "@/app/api/admin/onboarding/finalize-cas/route";
import { rescanWizardSheet, type RescanDeps } from "@/lib/onboarding/rescanWizardSheet";

/**
 * Flow-B blocker heal — headline end-to-end integration (real DB, production writers).
 *
 * The flow the spec §5.3 (b) / §7 / §11 T-B pins:
 *   1. Two EXISTING published shows (BLOCKED + SIBLING) are staged + approved through the real
 *      wizard staging path, then Phase B (handleOnboardingFinalize) stages BOTH shadows into
 *      shows_pending_changes and consumes their pending_syncs rows.
 *   2. A cron sync advances the BLOCKED show's live watermark between Phase B and Phase D, so its
 *      staged base is genuinely stale. Phase D (handleOnboardingFinalizeCas) refuses the whole
 *      batch with 409 STAGED_PARSE_OUTDATED_AT_PHASE_D — BUT the clean SIBLING row-txn already
 *      applied + consumed its shadow durably (finalize-cas batch-hold semantics, route:711-721).
 *   3. rescanWizardSheet(BLOCKED) re-fetches + re-parses + re-stages the blocked sheet under the
 *      finalize→app_settings→show lock order, captures the prior approver from the orphan SHADOW
 *      (Flow B — the pending_syncs row was deleted at Phase B), deletes the stale orphan shadow,
 *      re-stamps approval with a CHECK-valid payload (base == the CURRENT live watermark), heals
 *      the manifest back to 'staged' (publish_intent preserved) and re-opens the checkpoint — all
 *      scoped to the blocked drive_file_id, so the already-applied SIBLING is UNTOUCHED.
 *   4. Re-running Phase B + Phase D now publishes the blocked sheet cleanly; both shows end Live.
 *
 * Concrete failure modes pinned:
 *   - the rescan re-stamps base = the CURRENT live watermark (NOT the stale staged base), so the
 *     re-staged sheet is no longer refused at Phase D (the STAGED_PARSE_OUTDATED block is cleared);
 *   - the approval payload is non-null (wizard_approved_by_email = the shadow's applied_by_email),
 *     satisfying pending_syncs_approved_requires_full_payload;
 *   - the rescan's scoped DELETE/UPDATE never bleed into the sibling's committed state;
 *   - pre-heal control: WITHOUT the rescan heal, the second Phase D STILL 409s (the block persists).
 *
 * All expectations derive from the fixture crew/instant objects (anti-tautology); every instant
 * carries non-zero milliseconds so the adjacent ms-truncation class cannot pass by accident.
 */

const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "fb0fb0fb-2222-4222-8222-fb0fb0fb0fb0";
const FOLDER = "rescan-flowb-folder";
const BLOCKED = "drive-flowb-blocked";
const SIBLING = "drive-flowb-sibling";
const SHEET_MIME = "application/vnd.google-apps.spreadsheet";

// One staged instant (non-zero ms) shared by both shows' live watermark + staged base + staged
// modified time (sheets unedited between scan and the first Publish).
const MS_INSTANT = "2026-06-12T23:39:21.474Z";
// A genuinely-newer instant: a cron sync advanced the BLOCKED show's live watermark after Phase B.
const NEWER_MS_INSTANT = "2026-06-12T23:39:22.910Z";
// The re-scan re-reads the sheet at a fresh Drive modifiedTime (also non-zero ms).
const RESCAN_MODIFIED = "2026-06-13T01:02:03.456Z";
const APPROVED_AT = "2026-06-12T23:45:00.123Z";
const APPROVER = "approver@fxav.com";

type Crew = { name: string; email: string };

function makeParse(title: string, crew: Crew[]): Record<string, unknown> {
  return {
    show: {
      title,
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
    crewMembers: crew.map(({ name, email }) => ({
      name,
      email,
      phone: null,
      role: "A1",
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
    warnings: [],
    hardErrors: [],
  };
}

// The live show starts with one crew member; the staged parse ADDS a second (a roster add the
// onboarding scan is blinded to — it stages only the ONBOARDING_SCAN_REVIEW sentinel). After Phase
// D applies, the live crew becomes CREW_STAGED — the proof the sibling row-txn durably committed.
const CREW_LIVE: Crew[] = [{ name: "Ada", email: "ada@x.example" }];
const CREW_STAGED: Crew[] = [...CREW_LIVE, { name: "Bo", email: "bo@x.example" }];

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

function iso(v: unknown): string | null {
  if (v == null) return null;
  const ms = v instanceof Date ? v.getTime() : Date.parse(String(v));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

async function cleanup(): Promise<void> {
  if (!sql) return;
  for (const drive of [BLOCKED, SIBLING]) {
    for (const stmt of [
      `delete from public.show_change_log where drive_file_id = '${drive}'`,
      `delete from public.sync_audit where drive_file_id = '${drive}'`,
      `delete from public.shows_pending_changes where drive_file_id = '${drive}'`,
      `delete from public.crew_members where show_id in (select id from public.shows where drive_file_id = '${drive}')`,
      `delete from public.shows where drive_file_id = '${drive}'`,
      `delete from public.pending_syncs where drive_file_id = '${drive}'`,
      `delete from public.pending_ingestions where drive_file_id = '${drive}'`,
      `delete from public.onboarding_scan_manifest where drive_file_id = '${drive}'`,
    ]) {
      await sql.unsafe(stmt, []).catch(() => {});
    }
  }
  for (const stmt of [
    `delete from public.deferred_ingestions where wizard_session_id = '${SESSION}'::uuid`,
    `delete from public.wizard_finalize_checkpoints where wizard_session_id = '${SESSION}'::uuid`,
    `update public.app_settings
        set pending_wizard_session_id = null, pending_wizard_session_at = null,
            pending_folder_id = null, pending_folder_name = null,
            watched_folder_id = null, watched_folder_name = null
      where id = 'default'`,
  ]) {
    await sql.unsafe(stmt, []).catch(() => {});
  }
}

async function setSession(): Promise<void> {
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now(),
            pending_folder_id = $2
      where id = 'default'`,
    [SESSION, FOLDER],
  );
}

// An EXISTING published live show with CREW_LIVE and a non-zero-ms watermark.
async function seedExistingShow(drive: string): Promise<string> {
  const show = one<{ id: string }>(
    await sql!.unsafe(
      `insert into public.shows
         (drive_file_id, slug, title, client_label, template_version,
          last_seen_modified_time, published, last_sync_status)
       values ($1, $2, 'Live', 'Client', 'v4', $3::timestamptz, true, 'ok')
       returning id`,
      [drive, `slug-${drive}`, MS_INSTANT],
    ),
  );
  for (const member of CREW_LIVE) {
    await sql!.unsafe(
      `insert into public.crew_members (show_id, name, email, role) values ($1, $2, $3, 'A1')`,
      [show.id, member.name, member.email],
    );
  }
  return show.id;
}

// Stage a parse through the REAL wizard scan staging path (runPhase1 + PostgresOnboardingScanTx
// under the per-show advisory lock) — exactly as a Step-2 scan would. Returns the staged sentinel.
async function stage(
  drive: string,
  parse: Record<string, unknown>,
  modifiedTime: string,
): Promise<TriggeredReviewItem[]> {
  await sql!.begin(async (rawTx) => {
    const tx = new PostgresOnboardingScanTx(
      rawTx as unknown as PostgresTransaction,
      FOLDER,
      SESSION,
    );
    await rawTx.unsafe(`select pg_advisory_xact_lock(hashtext('show:' || $1))`, [drive]);
    const phase1 = await runPhase1(tx, {
      driveFileId: drive,
      mode: "onboarding_scan",
      wizardSessionId: SESSION,
      fileMeta: {
        driveFileId: drive,
        name: "fixture.gsheet",
        mimeType: SHEET_MIME,
        modifiedTime,
        parents: [FOLDER],
      },
      parseResult: parse as unknown as ParseResult,
      binding: { bindingToken: modifiedTime, modifiedTime },
    });
    expect(phase1.outcome).toBe("stage");
  });
  return one<{ triggered_review_items: TriggeredReviewItem[] }>(
    await sql!.unsafe(
      `select triggered_review_items from public.pending_syncs
        where drive_file_id = $1 and wizard_session_id = $2::uuid`,
      [drive, SESSION],
    ),
  ).triggered_review_items;
}

async function seedManifest(drive: string, status: string): Promise<void> {
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values ($1, $2::uuid, $3, $4, 'fixture.gsheet', $5)
     on conflict (wizard_session_id, drive_file_id) do update set status = excluded.status`,
    [FOLDER, SESSION, drive, SHEET_MIME, status],
  );
}

async function approve(drive: string, items: TriggeredReviewItem[]): Promise<void> {
  const choices = items.map((item) => ({ item_id: item.id, action: "apply" }));
  await sql!.unsafe(
    `update public.pending_syncs
        set wizard_approved = true,
            wizard_reviewer_choices_version = 1,
            wizard_reviewer_choices = $4::jsonb,
            wizard_approved_by_email = $5,
            wizard_approved_at = $3::timestamptz,
            last_finalize_failure_code = null
      where drive_file_id = $1 and wizard_session_id = $2::uuid`,
    [drive, SESSION, APPROVED_AT, choices, APPROVER] as never[],
  );
}

async function shadowCount(drive: string): Promise<number> {
  return (
    one(
      await sql!.unsafe(
        `select count(*)::int as c from public.shows_pending_changes
          where drive_file_id = $1 and wizard_session_id = $2::uuid`,
        [drive, SESSION],
      ),
    ) as { c: number }
  ).c;
}

async function pendingCount(drive: string): Promise<number> {
  return (
    one(
      await sql!.unsafe(
        `select count(*)::int as c from public.pending_syncs
          where drive_file_id = $1 and wizard_session_id = $2::uuid`,
        [drive, SESSION],
      ),
    ) as { c: number }
  ).c;
}

async function readPending(drive: string): Promise<{
  wizard_approved: boolean;
  wizard_approved_by_email: string | null;
  last_finalize_failure_code: string | null;
  base_modified_time: Date | null;
  staged_modified_time: Date | null;
}> {
  return one(
    await sql!.unsafe(
      `select wizard_approved, wizard_approved_by_email, last_finalize_failure_code,
              base_modified_time, staged_modified_time
         from public.pending_syncs where drive_file_id = $1 and wizard_session_id = $2::uuid`,
      [drive, SESSION],
    ),
  );
}

async function manifestRow(drive: string): Promise<{ status: string; publish_intent: boolean }> {
  return one(
    await sql!.unsafe(
      `select status, publish_intent from public.onboarding_scan_manifest
        where drive_file_id = $1 and wizard_session_id = $2::uuid`,
      [drive, SESSION],
    ),
  );
}

async function checkpointStatus(): Promise<string | null> {
  const rows = (await sql!.unsafe(
    `select status from public.wizard_finalize_checkpoints where wizard_session_id = $1::uuid`,
    [SESSION],
  )) as unknown as Array<{ status: string }>;
  return rows[0]?.status ?? null;
}

async function showRow(
  drive: string,
): Promise<{ published: boolean; last_seen_modified_time: Date }> {
  return one(
    await sql!.unsafe(
      `select published, last_seen_modified_time from public.shows where drive_file_id = $1`,
      [drive],
    ),
  );
}

async function crewNames(drive: string): Promise<string[]> {
  const rows = (await sql!.unsafe(
    `select c.name from public.crew_members c
       join public.shows s on s.id = c.show_id
      where s.drive_file_id = $1 order by c.name`,
    [drive],
  )) as unknown as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

function requestFor(path: string): Request {
  return new Request(`https://crew.fxav.test/api/admin/onboarding/${path}`, { method: "POST" });
}

// Phase B re-validates each row's staged_modified_time against the file's CURRENT Drive
// modifiedTime (processApprovedRow → sameTimestamp), so the deps must return the staged instant
// per drive id (or the row is demoted STAGED_PARSE_REVISION_RACE_DURING_FINALIZE).
function phaseBDeps(modifiedTimeByDrive: Record<string, string>) {
  return {
    requireAdminIdentity: async () => ({ email: "finalizer@fxav.com" }),
    fetchDriveFileMetadata: async (driveFileId: string) => ({
      driveFileId,
      name: "Sheet",
      mimeType: SHEET_MIME,
      parents: [FOLDER],
      modifiedTime: modifiedTimeByDrive[driveFileId] ?? MS_INSTANT,
    }),
  };
}

function phaseDDeps() {
  return {
    requireAdminIdentity: async () => ({ email: "finalizer@fxav.com" }),
    subscribeToWatchedFolder: async () => undefined,
  };
}

function mkWithTx(): NonNullable<RescanDeps["withTx"]> {
  return async <R>(fn: (rawTx: PostgresTransaction) => Promise<R>): Promise<R> =>
    (await sql!.begin(async (tx) => fn(tx as unknown as PostgresTransaction))) as R;
}

// Rescan deps for the BLOCKED sheet: a clean refresh (crew unchanged vs the shadow's staged parse),
// so the clean rule re-approves (priorReady via the shadow). The fresh Drive modifiedTime is later.
function rescanDeps(refreshedParse: Record<string, unknown>): RescanDeps {
  const meta = {
    driveFileId: BLOCKED,
    name: "fixture.gsheet",
    mimeType: SHEET_MIME,
    modifiedTime: RESCAN_MODIFIED,
    parents: [FOLDER],
  };
  return {
    fetchDriveFileMetadata: async () => meta,
    prepareOnboardingFiles: async () => [
      {
        file: meta,
        kind: "sheet",
        binding: { bindingToken: RESCAN_MODIFIED, modifiedTime: RESCAN_MODIFIED },
        parseResult: refreshedParse as unknown as ParseResult,
      },
    ],
    withTx: mkWithTx(),
  };
}

type PerRow = { drive_file_id: string; code: string };

beforeAll(() => {
  if (!dbUp) return;
  // The real Phase B/D handlers fall back TEST_DATABASE_URL ?? DATABASE_URL — stub BOTH to the
  // LOCAL loopback (plan R19-1) so the handlers under test never touch validation.
  vi.stubEnv("TEST_DATABASE_URL", LOCAL_URL);
  vi.stubEnv("DATABASE_URL", LOCAL_URL);
  expect(LOCAL_URL).toMatch(/127\.0\.0\.1|localhost/);
});

beforeEach(async () => {
  if (!dbUp) return;
  await cleanup();
});

afterAll(async () => {
  if (dbUp) await cleanup();
  vi.unstubAllEnvs();
  if (sql) await sql.end().catch(() => {});
});

// Seed two existing published shows, stage + approve both, then run Phase B (stages both shadows,
// consumes both pending rows). Shared by the headline + control cases.
async function seedThroughPhaseB(): Promise<void> {
  await setSession();
  await seedExistingShow(BLOCKED);
  await seedExistingShow(SIBLING);
  const blockedItems = await stage(BLOCKED, makeParse("Blocked", CREW_STAGED), MS_INSTANT);
  const siblingItems = await stage(SIBLING, makeParse("Sibling", CREW_STAGED), MS_INSTANT);
  await seedManifest(BLOCKED, "applied");
  await seedManifest(SIBLING, "applied");
  await approve(BLOCKED, blockedItems);
  await approve(SIBLING, siblingItems);

  const resB = await handleOnboardingFinalize(
    requestFor("finalize"),
    phaseBDeps({ [BLOCKED]: MS_INSTANT, [SIBLING]: MS_INSTANT }),
  );
  expect(resB.status).toBe(200);
  const bodyB = (await resB.json()) as { per_row: PerRow[] };
  expect(bodyB.per_row.find((r) => r.drive_file_id === BLOCKED)?.code).toBe("OK");
  expect(bodyB.per_row.find((r) => r.drive_file_id === SIBLING)?.code).toBe("OK");
  // Both shadows staged; both pending rows consumed; checkpoint complete.
  expect(await shadowCount(BLOCKED)).toBe(1);
  expect(await shadowCount(SIBLING)).toBe(1);
  expect(await pendingCount(BLOCKED)).toBe(0);
  expect(await pendingCount(SIBLING)).toBe(0);
  expect(await checkpointStatus()).toBe("all_batches_complete");
}

describe("rescanWizardSheet — Flow B blocker heal (real DB, end-to-end)", () => {
  test.skipIf(!dbUp)(
    "T-B: rescanning a STAGED_PARSE_OUTDATED-blocked sheet heals it; sibling untouched; both publish",
    async () => {
      await seedThroughPhaseB();

      // A cron sync advanced the BLOCKED show's live watermark after Phase B → its staged base is
      // now genuinely stale. The reviewer never saw this newer baseline.
      await sql!.unsafe(
        `update public.shows set last_seen_modified_time = $1::timestamptz where drive_file_id = $2`,
        [NEWER_MS_INSTANT, BLOCKED],
      );

      // First Phase D: the batch is refused (the blocked sheet is stale). The clean SIBLING row-txn
      // applies + consumes its shadow durably (batch-hold semantics) BEFORE the batch 409s.
      const resD1 = await handleOnboardingFinalizeCas(requestFor("finalize-cas"), phaseDDeps());
      expect(resD1.status).toBe(409);
      const bodyD1 = (await resD1.json()) as { code: string; per_row: PerRow[] };
      expect(bodyD1.code).toBe("STAGED_PARSE_OUTDATED_AT_PHASE_D");
      expect(bodyD1.per_row.find((r) => r.drive_file_id === BLOCKED)!.code).toBe(
        "STAGED_PARSE_OUTDATED_AT_PHASE_D",
      );
      expect(bodyD1.per_row.find((r) => r.drive_file_id === SIBLING)!.code).toBe("OK");
      // Blocked shadow RETAINED (the block); sibling shadow CONSUMED + its live crew applied.
      expect(await shadowCount(BLOCKED)).toBe(1);
      expect(await shadowCount(SIBLING)).toBe(0);
      expect(await crewNames(SIBLING)).toEqual([...CREW_STAGED.map((m) => m.name)].sort());

      // Snapshot the sibling's now-committed state to prove the rescan does not disturb it.
      const siblingShadowBefore = await shadowCount(SIBLING);
      const siblingCrewBefore = await crewNames(SIBLING);
      const siblingShowBefore = await showRow(SIBLING);
      const blockedManifestBefore = await manifestRow(BLOCKED);
      expect(blockedManifestBefore.publish_intent).toBe(true); // Phase B stamped checked → preserved

      // ── Heal: re-scan the BLOCKED sheet with a CLEAN refresh (crew unchanged vs the shadow). ──
      const result = await rescanWizardSheet(
        BLOCKED,
        SESSION,
        rescanDeps(makeParse("Blocked", CREW_STAGED)),
      );
      expect(result).toEqual({ status: "updated", needsReview: false, changed: true });

      // Orphan shadow deleted; a fresh approved pending row re-stamped with base == CURRENT live.
      expect(await shadowCount(BLOCKED)).toBe(0);
      const blockedPending = await readPending(BLOCKED);
      expect(blockedPending.wizard_approved).toBe(true);
      expect(blockedPending.wizard_approved_by_email).toBe(APPROVER); // = the shadow's applied_by_email
      expect(blockedPending.last_finalize_failure_code).toBeNull();
      // base == the watermark the cron advanced to (NOT the stale staged base) → no longer outdated.
      expect(iso(blockedPending.base_modified_time)).toBe(NEWER_MS_INSTANT);
      // Manifest healed back to 'staged' with publish_intent preserved; checkpoint re-opened.
      const blockedManifestAfter = await manifestRow(BLOCKED);
      expect(blockedManifestAfter.status).toBe("staged");
      expect(blockedManifestAfter.publish_intent).toBe(true);
      expect(await checkpointStatus()).toBe("in_progress");

      // Sibling UNTOUCHED by the rescan (scoped to BLOCKED's drive_file_id).
      expect(await shadowCount(SIBLING)).toBe(siblingShadowBefore);
      expect(await crewNames(SIBLING)).toEqual(siblingCrewBefore);
      const siblingShowAfter = await showRow(SIBLING);
      expect(siblingShowAfter.published).toBe(siblingShowBefore.published);
      expect(iso(siblingShowAfter.last_seen_modified_time)).toBe(
        iso(siblingShowBefore.last_seen_modified_time),
      );

      // ── Re-run Publish: Phase B re-stages ONLY the blocked sheet; Phase D applies it cleanly. ──
      const resB2 = await handleOnboardingFinalize(
        requestFor("finalize"),
        phaseBDeps({ [BLOCKED]: RESCAN_MODIFIED }),
      );
      expect(resB2.status).toBe(200);
      const bodyB2 = (await resB2.json()) as { per_row: PerRow[] };
      expect(bodyB2.per_row.find((r) => r.drive_file_id === BLOCKED)?.code).toBe("OK");

      const resD2 = await handleOnboardingFinalizeCas(requestFor("finalize-cas"), phaseDDeps());
      expect(resD2.status).toBe(200);
      const bodyD2 = (await resD2.json()) as { status: string; per_row?: PerRow[] };
      expect(bodyD2.status).toBe("finalize_complete");
      expect(bodyD2.per_row?.find((r) => r.drive_file_id === BLOCKED)?.code).toBe("OK");

      // Both shows end Live; the blocked sheet's staged crew add landed.
      expect((await showRow(BLOCKED)).published).toBe(true);
      expect((await showRow(SIBLING)).published).toBe(true);
      expect(await crewNames(BLOCKED)).toEqual([...CREW_STAGED.map((m) => m.name)].sort());
      // No orphan shadows remain for either sheet.
      expect(await shadowCount(BLOCKED)).toBe(0);
      expect(await shadowCount(SIBLING)).toBe(0);
    },
  );

  test.skipIf(!dbUp)(
    "pre-heal control: WITHOUT the rescan heal, the second Phase D still 409s STAGED_PARSE_OUTDATED",
    async () => {
      await seedThroughPhaseB();
      await sql!.unsafe(
        `update public.shows set last_seen_modified_time = $1::timestamptz where drive_file_id = $2`,
        [NEWER_MS_INSTANT, BLOCKED],
      );

      // First Phase D 409s (the block exists).
      const resD1 = await handleOnboardingFinalizeCas(requestFor("finalize-cas"), phaseDDeps());
      expect(resD1.status).toBe(409);
      expect(((await resD1.json()) as { code: string }).code).toBe(
        "STAGED_PARSE_OUTDATED_AT_PHASE_D",
      );

      // Re-running Publish WITHOUT the rescan: Phase B finds no approved rows (both consumed), and
      // the SECOND Phase D STILL 409s — the stale orphan shadow is never healed on its own.
      await handleOnboardingFinalize(requestFor("finalize"), phaseBDeps({ [BLOCKED]: MS_INSTANT }));
      const resD2 = await handleOnboardingFinalizeCas(requestFor("finalize-cas"), phaseDDeps());
      expect(resD2.status).toBe(409);
      const bodyD2 = (await resD2.json()) as { code: string; per_row: PerRow[] };
      expect(bodyD2.code).toBe("STAGED_PARSE_OUTDATED_AT_PHASE_D");
      expect(bodyD2.per_row.find((r) => r.drive_file_id === BLOCKED)!.code).toBe(
        "STAGED_PARSE_OUTDATED_AT_PHASE_D",
      );
      // The blocked sheet stays unpublished-but-stale; nothing was force-applied.
      expect(await shadowCount(BLOCKED)).toBe(1);
      expect((await showRow(BLOCKED)).published).toBe(true); // already-live show, never mutated
      expect(await crewNames(BLOCKED)).toEqual([...CREW_LIVE.map((m) => m.name)].sort());
    },
  );
});
