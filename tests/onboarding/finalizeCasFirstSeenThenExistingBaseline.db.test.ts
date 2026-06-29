import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { PostgresOnboardingScanTx, type PostgresTransaction } from "@/lib/sync/runOnboardingScan";
import { runPhase1 } from "@/lib/sync/phase1";
import type { ParseResult } from "@/lib/parser/types";
import { handleOnboardingFinalize } from "@/app/api/admin/onboarding/finalize/route";
import { handleOnboardingFinalizeCas } from "@/app/api/admin/onboarding/finalize-cas/route";

/**
 * Scan → (out-of-band show create) → Phase B → Phase D first-seen→existing regression
 * (real DB, production write path).
 *
 * Concrete failure mode caught (validation onboarding drill, 2026-06-28): the final publish step
 * refused two shows with 409 STAGED_PARSE_OUTDATED_AT_PHASE_D even though the operator changed
 * nothing — `shows_pending_changes.payload->>'staged_modified_time'` equalled
 * `shows.last_seen_modified_time` to the millisecond, while the payload's `base_modified_time`
 * was jsonb NULL.
 *
 * Root cause is a FIRST-SEEN → EXISTING race, distinct from finalizeCasReonboardBaseline.db.test.ts
 * (which seeds the show BEFORE the scan, so the scan's upsertLivePendingSync coalesce stamps a
 * non-null base): here the show does NOT exist at scan time, so the wizard scan correctly stages
 * `base_modified_time = null` (first-seen — there was no prior live watermark). Between the scan and
 * Phase B, the live cron first-seen auto-publish (runScheduledCronSync.processOneFile →
 * insertFirstSeenShow) CREATES the live `shows` row (wizard_created_session_id NULL, no sync_audit,
 * no manifest created_show_id). By Phase B the row classifies as an EXISTING show, so
 * stageExistingShowShadow stages the shadow carrying the stale NULL base, and Phase D's equality
 * preflight (finalize-cas applyShadow → revisionTimesMatch(live, base)) can never match a non-null
 * live watermark against a null base → the row refuses though nothing changed.
 *
 * The fix: stageExistingShowShadow coalesces the staged base to the live show's current
 * `last_seen_modified_time` (read inside the same INSERT…SELECT, under the per-show advisory lock
 * the finalize route already holds) whenever the pending row's base is null — mirroring the ratified
 * scan-time coalesce in runOnboardingScan.upsertLivePendingSync. It is a no-op for a normal existing
 * row (non-null base preserved), so genuine staleness still refuses (covered by the sibling test).
 *
 * Like the sibling, every instant carries NON-ZERO milliseconds so the adjacent ms-truncation class
 * cannot pass by accident.
 */

const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "6e6e6e6e-7777-4777-8777-6e6e6e6e6e6e";
const FOLDER = "finalize-cas-firstseen-existing-folder";
const DRIVE = "drive-cas-firstseen-1";
// One instant with non-zero milliseconds, shared by the (cron-created) live watermark and the
// staged modified time — the sheet was unedited between scan and finalize.
const MS_INSTANT = "2026-06-28T03:21:34.057Z";
const APPROVED_AT = "2026-06-28T03:25:00.123Z";

type Crew = { name: string; email: string };

// ALL expectations below derive from these fixture objects (anti-tautology rule).
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

const CREW_LIVE: Crew[] = [{ name: "Ada", email: "ada@x.example" }];
const CREW_STAGED: Crew[] = [...CREW_LIVE, { name: "Bo", email: "bo@x.example" }];
const PARSE = makeParse("FirstSeen Existing Fixture", CREW_STAGED);

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

function one<T = Record<string, unknown>>(rows: unknown): T {
  return (rows as T[])[0]!;
}

async function cleanup(): Promise<void> {
  if (!sql) return;
  for (const stmt of [
    `delete from public.show_change_log where drive_file_id = '${DRIVE}'`,
    `delete from public.sync_audit where drive_file_id = '${DRIVE}'`,
    `delete from public.shows_pending_changes where drive_file_id = '${DRIVE}'`,
    `delete from public.shows where drive_file_id = '${DRIVE}'`,
    `delete from public.pending_syncs where drive_file_id = '${DRIVE}'`,
    `delete from public.pending_ingestions where drive_file_id = '${DRIVE}'`,
    `delete from public.onboarding_scan_manifest where drive_file_id = '${DRIVE}'`,
    `delete from public.deferred_ingestions where wizard_session_id = '${SESSION}'::uuid`,
    `delete from public.wizard_finalize_checkpoints where wizard_session_id = '${SESSION}'::uuid`,
    `update public.app_settings
        set pending_wizard_session_id = null, pending_wizard_session_at = null,
            pending_folder_id = null, watched_folder_id = null, watched_folder_name = null
      where id = 'default'`,
  ]) {
    await sql.unsafe(stmt, []).catch(() => {});
  }
}

async function seed(): Promise<string> {
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now(),
            pending_folder_id = $2
      where id = 'default'`,
    [SESSION, FOLDER],
  );
  // (1) Wizard scan FIRST, with NO live show yet — the file is genuinely first-seen, so the scan's
  // upsertLivePendingSync coalesce has no shows row to read and correctly stages base = NULL.
  await sql!.begin(async (rawTx) => {
    const tx = new PostgresOnboardingScanTx(
      rawTx as unknown as PostgresTransaction,
      FOLDER,
      SESSION,
    );
    await rawTx.unsafe(`select pg_advisory_xact_lock(hashtext('show:' || $1))`, [DRIVE]);
    const phase1 = await runPhase1(tx, {
      driveFileId: DRIVE,
      mode: "onboarding_scan",
      wizardSessionId: SESSION,
      fileMeta: {
        driveFileId: DRIVE,
        name: "fixture.gsheet",
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: MS_INSTANT,
        parents: [FOLDER],
      },
      parseResult: PARSE as unknown as ParseResult,
      binding: { bindingToken: MS_INSTANT, modifiedTime: MS_INSTANT },
    });
    expect(phase1.outcome).toBe("stage");
  });
  // Pre-fix invariant: the scan staged a NULL base because the show did not exist at scan time.
  const stagedBase = one<{ base_text: string | null }>(
    await sql!.unsafe(
      `select base_modified_time::text as base_text from public.pending_syncs
        where drive_file_id = $1 and wizard_session_id = $2::uuid`,
      [DRIVE, SESSION],
    ),
  );
  expect(stagedBase.base_text).toBeNull();

  // (2) The live cron first-seen auto-publish wins the race and CREATEs the show AFTER the scan —
  // wizard_created_session_id NULL, watermark = the sheet's modified time, no sync_audit. This is
  // the out-of-band creator that flips the row from first-seen to existing before Phase B.
  const show = one<{ id: string }>(
    await sql!.unsafe(
      `insert into public.shows
         (drive_file_id, slug, title, client_label, template_version,
          last_seen_modified_time, published, last_sync_status)
       values ($1, $2, 'FirstSeen Existing Live', 'Client', 'v4', $3::timestamptz, true, 'ok')
       returning id`,
      [DRIVE, `slug-${DRIVE}`, MS_INSTANT],
    ),
  );
  for (const member of CREW_LIVE) {
    await sql!.unsafe(
      `insert into public.crew_members (show_id, name, email, role) values ($1, $2, $3, 'A1')`,
      [show.id, member.name, member.email],
    );
  }

  // (3) Reviewer approval — one 'apply' choice per staged sentinel (mirrors the wizard apply).
  const staged = one<{ triggered_review_items: Array<{ id: string }> }>(
    await sql!.unsafe(
      `select triggered_review_items from public.pending_syncs
        where drive_file_id = $1 and wizard_session_id = $2::uuid`,
      [DRIVE, SESSION],
    ),
  );
  const choices = staged.triggered_review_items.map((item) => ({
    item_id: item.id,
    action: "apply",
  }));
  await sql!.unsafe(
    `update public.pending_syncs
        set wizard_approved = true,
            wizard_reviewer_choices_version = 1,
            wizard_reviewer_choices = $4::jsonb,
            wizard_approved_by_email = 'approver@fxav.com',
            wizard_approved_at = $3::timestamptz
      where drive_file_id = $1 and wizard_session_id = $2::uuid`,
    [DRIVE, SESSION, APPROVED_AT, choices] as never[],
  );
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', 'fixture.gsheet', 'applied')
     on conflict (wizard_session_id, drive_file_id) do update set status = 'applied'`,
    [FOLDER, SESSION, DRIVE],
  );
  return show.id;
}

function requestFor(path: string): Request {
  return new Request(`https://crew.fxav.test/api/admin/onboarding/${path}`, { method: "POST" });
}

function phaseBDeps() {
  return {
    requireAdminIdentity: async () => ({ email: "finalizer@fxav.com" }),
    fetchDriveFileMetadata: async (driveFileId: string) => ({
      driveFileId,
      name: "Sheet",
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [FOLDER],
      modifiedTime: MS_INSTANT,
    }),
  };
}

function phaseDDeps() {
  return {
    requireAdminIdentity: async () => ({ email: "finalizer@fxav.com" }),
    subscribeToWatchedFolder: async () => undefined,
  };
}

type PerRow = { drive_file_id: string; code: string };

async function runPhaseB(): Promise<void> {
  const resB = await handleOnboardingFinalize(requestFor("finalize"), phaseBDeps());
  expect(resB.status).toBe(200);
  const bodyB = (await resB.json()) as { per_row: PerRow[] };
  expect(bodyB.per_row[0]!.code).toBe("OK");
  // The staged shadow carries the live watermark as its base even though the pending row's base was
  // NULL — the fix coalesces to shows.last_seen_modified_time inside stageExistingShowShadow. At the
  // pre-fix HEAD this is jsonb null, which can never equal the non-null live watermark → false refusal.
  const base = one<{ base_text: string | null }>(
    await sql!.unsafe(
      `select payload->>'base_modified_time' as base_text
         from public.shows_pending_changes where drive_file_id = $1`,
      [DRIVE],
    ),
  );
  expect(base.base_text).not.toBeNull();
  // Derived from the live show's watermark (anti-tautology) — they must be the same instant.
  const live = one<{ watermark: Date }>(
    await sql!.unsafe(
      `select last_seen_modified_time as watermark from public.shows where drive_file_id = $1`,
      [DRIVE],
    ),
  );
  expect(new Date(base.base_text!).toISOString()).toBe(new Date(live.watermark).toISOString());
}

beforeAll(() => {
  if (!dbUp) return;
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

describe("scan → out-of-band show create → Phase B → Phase D (first-seen became existing, real DB)", () => {
  test.skipIf(!dbUp)(
    "a first-seen file that gained a live show before Phase B APPLIES at Phase D (no false STAGED_PARSE_OUTDATED_AT_PHASE_D)",
    async () => {
      const showId = await seed();
      await runPhaseB();

      const resD = await handleOnboardingFinalizeCas(requestFor("finalize-cas"), phaseDDeps());
      const bodyD = (await resD.json()) as { per_row?: PerRow[]; code?: string };
      // The drill's failure: 409 STAGED_PARSE_OUTDATED_AT_PHASE_D despite an unedited sheet
      // (staged == live). The apply must succeed.
      expect(bodyD.per_row?.find((r) => r.drive_file_id === DRIVE)?.code).toBe("OK");
      expect(resD.status).toBe(200);

      // Apply landed: staged crew present, watermark still the exact staged instant, shadow consumed.
      const crew = (await sql!.unsafe(
        `select name from public.crew_members where show_id = $1 order by name`,
        [showId],
      )) as unknown as Array<{ name: string }>;
      expect(crew.map((c) => c.name)).toEqual(CREW_STAGED.map((m) => m.name).sort());
      const show = one<{ last_seen_modified_time: Date }>(
        await sql!.unsafe(
          `select last_seen_modified_time from public.shows where drive_file_id = $1`,
          [DRIVE],
        ),
      );
      expect(new Date(show.last_seen_modified_time).toISOString()).toBe(MS_INSTANT);
      expect(
        (
          await sql!.unsafe(`select 1 from public.shows_pending_changes where drive_file_id = $1`, [
            DRIVE,
          ])
        ).length,
      ).toBe(0);
    },
  );
});
