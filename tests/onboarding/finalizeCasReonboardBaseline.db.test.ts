import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { PostgresOnboardingScanTx, type PostgresTransaction } from "@/lib/sync/runOnboardingScan";
import { runPhase1 } from "@/lib/sync/phase1";
import type { ParseResult } from "@/lib/parser/types";
import { handleOnboardingFinalize } from "@/app/api/admin/onboarding/finalize/route";
import { handleOnboardingFinalizeCas } from "@/app/api/admin/onboarding/finalize-cas/route";

/**
 * Scan → Phase B → Phase D re-onboarding regression (real DB, production write path).
 *
 * Concrete failure mode caught (validation onboarding drill, 2026-06-12): Phase D returned
 * 409 STAGED_PARSE_OUTDATED_AT_PHASE_D for EVERY staged row even though
 * `shows_pending_changes.payload->>'staged_modified_time'` equalled
 * `shows.last_seen_modified_time` to the millisecond. Root cause was NOT millisecond loss:
 * the wizard scan tx blinds `readShowForPhase1` (returns null — first-seen semantics,
 * lib/sync/runOnboardingScan.ts), so runPhase1 staged `baseModifiedTime: show?.
 * lastSeenModifiedTime ?? null` = jsonb NULL even for an EXISTING show (lib/sync/phase1.ts).
 * Phase B copied the NULL into the shadow payload's base_modified_time, and Phase D's
 * equality preflight (finalize-cas applyShadow → revisionTimesMatch(live, base)) can never
 * match a non-null live watermark against a null base → every re-onboarded row refused.
 * The fix stamps the live watermark as the staged base inside the scan's pending-sync
 * writer, under the per-show advisory lock the scan already holds.
 *
 * Unlike finalizeCasFullApply.db.test.ts (which seeds shadow payloads as raw JS objects),
 * this test stages through the REAL pipeline writers — runPhase1 + PostgresOnboardingScanTx
 * → Phase B stageExistingShowShadow's jsonb_build_object($n::timestamptz) — so the payload
 * carries the exact production jsonb shape ('2026-06-12T23:39:21.474+00:00' text form,
 * NULL-vs-watermark base semantics). Every instant has NON-ZERO milliseconds so the
 * adjacent ms-truncation class (Date.parse(Date) — lib/sync/applyStagedCore.ts:45-58)
 * cannot pass by accident either: a `.000` fixture would mask it.
 */

// Phase-wide DB-connection convention: TEST_DATABASE_URL is the VALIDATION project in this
// repo — every *.db.test.ts pins BOTH env vars to the local loopback (plan R19-1).
const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "5d5d5d5d-6666-4666-8666-5d5d5d5d5d5d";
const FOLDER = "finalize-cas-ms-precision-folder";
const DRIVE = "drive-cas-ms-1";
// The drill's shape: one instant with non-zero milliseconds, shared by live watermark,
// staged base, and staged modified time (sheet unedited between scan and finalize).
const MS_INSTANT = "2026-06-12T23:39:21.474Z";
// A genuinely-newer instant (also non-zero ms) for the true-staleness counterpart.
const NEWER_MS_INSTANT = "2026-06-12T23:39:22.910Z";
const APPROVED_AT = "2026-06-12T23:45:00.123Z";

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
const PARSE = makeParse("Ms Precision Fixture", CREW_STAGED);

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
  // Existing live show whose watermark carries NON-ZERO milliseconds (the drill's shape).
  const show = one<{ id: string }>(
    await sql!.unsafe(
      `insert into public.shows
         (drive_file_id, slug, title, client_label, template_version,
          last_seen_modified_time, published, last_sync_status)
       values ($1, $2, 'Ms Precision Live', 'Client', 'v4', $3::timestamptz, true, 'ok')
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
  // Stage through the REAL wizard scan staging path — runPhase1 with the production
  // PostgresOnboardingScanTx — so base_modified_time holds exactly what the scan writes for
  // an EXISTING live show (the drill's shape: a folder re-onboarded after a prior setup).
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
  // Approve with the choice shape the wizard apply records: one 'apply' choice per staged
  // item (the scan stages the ONBOARDING_SCAN_REVIEW sentinel; an approved row without its
  // matching choice would refuse at Phase D with MISSING_REVIEWER_CHOICE).
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
  // Existing-show row → shadow staged via the REAL jsonb_build_object($n::timestamptz) writer.
  const shadow = one<{ staged_text: string }>(
    await sql!.unsafe(
      `select payload->>'staged_modified_time' as staged_text
         from public.shows_pending_changes where drive_file_id = $1`,
      [DRIVE],
    ),
  );
  // Production jsonb text form preserves the milliseconds — the loss (if any) is downstream.
  expect(new Date(shadow.staged_text).toISOString()).toBe(MS_INSTANT);
  // The staged shadow's base records the live watermark the parse was staged against —
  // the value Phase D's equality preflight compares to shows.last_seen_modified_time.
  // At the pre-fix HEAD this was jsonb null (the scan tx blinds readShowForPhase1), which
  // can never equal a non-null live watermark → every row refused.
  const base = one<{ base_text: string | null }>(
    await sql!.unsafe(
      `select payload->>'base_modified_time' as base_text
         from public.shows_pending_changes where drive_file_id = $1`,
      [DRIVE],
    ),
  );
  expect(base.base_text).not.toBeNull();
  expect(new Date(base.base_text!).toISOString()).toBe(MS_INSTANT);
}

beforeAll(() => {
  if (!dbUp) return;
  // The route openers fall back TEST_DATABASE_URL ?? DATABASE_URL — stub BOTH (plan R19-1) so
  // the real handlers under test connect to the LOCAL loopback, never validation.
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

describe("scan → Phase B → Phase D re-onboarded existing show (real DB, production staging path)", () => {
  test.skipIf(!dbUp)(
    "a staged row whose instants carry non-zero milliseconds APPLIES at Phase D (no false STAGED_PARSE_OUTDATED_AT_PHASE_D)",
    async () => {
      const showId = await seed();
      await runPhaseB();

      const resD = await handleOnboardingFinalizeCas(requestFor("finalize-cas"), phaseDDeps());
      const bodyD = (await resD.json()) as { per_row?: PerRow[]; code?: string };
      // The drill's failure: 409 STAGED_PARSE_OUTDATED_AT_PHASE_D despite a
      // millisecond-equal live watermark. The apply must succeed.
      expect(bodyD.per_row?.find((r) => r.drive_file_id === DRIVE)?.code).toBe("OK");
      expect(resD.status).toBe(200);

      // Apply landed: staged crew present, watermark still the exact staged instant,
      // shadow consumed.
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

  test.skipIf(!dbUp)(
    "true staleness still REFUSES: live watermark genuinely newer than the staged base (both non-zero ms)",
    async () => {
      const showId = await seed();
      await runPhaseB();
      // A cron sync applies a Doug edit between Phase B and Phase D — the live watermark is
      // now genuinely NEWER than the staged base. The reviewer never saw this baseline.
      await sql!.unsafe(
        `update public.shows set last_seen_modified_time = $1::timestamptz where id = $2::uuid`,
        [NEWER_MS_INSTANT, showId],
      );

      const resD = await handleOnboardingFinalizeCas(requestFor("finalize-cas"), phaseDDeps());
      expect(resD.status).toBe(409);
      const bodyD = (await resD.json()) as { code: string; per_row: PerRow[] };
      expect(bodyD.code).toBe("STAGED_PARSE_OUTDATED_AT_PHASE_D");
      expect(bodyD.per_row.find((r) => r.drive_file_id === DRIVE)!.code).toBe(
        "STAGED_PARSE_OUTDATED_AT_PHASE_D",
      );
      // Refusal is non-destructive: shadow retained, live row untouched.
      expect(
        (
          await sql!.unsafe(`select 1 from public.shows_pending_changes where drive_file_id = $1`, [
            DRIVE,
          ])
        ).length,
      ).toBe(1);
      const show = one<{ last_seen_modified_time: Date }>(
        await sql!.unsafe(
          `select last_seen_modified_time from public.shows where drive_file_id = $1`,
          [DRIVE],
        ),
      );
      expect(new Date(show.last_seen_modified_time).toISOString()).toBe(NEWER_MS_INSTANT);
      const crew = (await sql!.unsafe(
        `select name from public.crew_members where show_id = $1 order by name`,
        [showId],
      )) as unknown as Array<{ name: string }>;
      expect(crew.map((c) => c.name)).toEqual(CREW_LIVE.map((m) => m.name).sort());
    },
  );
});
