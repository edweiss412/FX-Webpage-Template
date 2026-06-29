import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { handleOnboardingFinalizeCas } from "@/app/api/admin/onboarding/finalize-cas/route";

/**
 * WM-R9 — Phase D archived-show immutability guard (real DB).
 *
 * Concrete failure mode pinned: a show archived BETWEEN Phase B staging (shadow row written)
 * and the final CAS used to be MUTATED by applyShadow — children replaced, audit + feed
 * written, shadow consumed, OK reported — violating archived-show immutability (DEF-4 of B2).
 * The live staged apply/discard paths refuse archived shows via readShowArchived_unlocked →
 * SHOW_ARCHIVED_IMMUTABLE (lib/sync/applyStaged.ts:1037-1039, lib/sync/discardStaged.ts:418-419);
 * Phase D must mirror that exact guard under the per-row held lock, BEFORE applyStagedCore.
 *
 * Required end-state on refusal: typed per-row SHOW_ARCHIVED_IMMUTABLE, shadow RETAINED, show
 * UNMUTATED (crew/audit/feed/watermark unchanged), siblings continue (their row transactions
 * commit), and the batch does NOT reach final_cas_done while the row pends.
 */

// Phase-wide DB-connection convention: TEST_DATABASE_URL is the VALIDATION project in this
// repo — every *.db.test.ts pins BOTH env vars to the local loopback (plan R19-1).
const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "2a2a2a2a-4444-4444-8444-2a2a2a2a2a2a";
const FOLDER = "finalize-cas-archived-guard-folder";
const BASE = "2026-06-09T00:00:00.000Z";
const STAGED = "2026-06-10T12:00:00.040Z";
const APPLIED_AT_INTENT = "2026-06-10T09:15:00.000Z";

type Crew = { name: string; email: string };

// ALL expectations below derive from these fixture objects (anti-tautology rule).
const ARCHIVED_LIVE_CREW: Crew[] = [{ name: "Bob", email: "bob@x.example" }];
const ARCHIVED_PARSE_CREW: Crew[] = [
  { name: "Bob", email: "bob@x.example" },
  { name: "Eve", email: "eve@x.example" },
];
const SIBLING_LIVE_CREW: Crew[] = [{ name: "Cara", email: "cara@x.example" }];
const SIBLING_PARSE_CREW: Crew[] = [
  { name: "Cara", email: "cara@x.example" },
  { name: "Dee", email: "dee@x.example" },
];

// Archived shadow's parsed title — the finalize-cas blocked-row enricher surfaces it as
// display_name on the SHOW_ARCHIVED_IMMUTABLE per_row entry (parse succeeds before the guard).
const ARCHIVED_TITLE = "Acg Archived";

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
    `delete from public.show_change_log where drive_file_id like 'drive-acg-%'`,
    `delete from public.sync_audit where drive_file_id like 'drive-acg-%'`,
    `delete from public.sync_holds where drive_file_id like 'drive-acg-%'`,
    `delete from public.shows_pending_changes where drive_file_id like 'drive-acg-%'`,
    `delete from public.shows where drive_file_id like 'drive-acg-%'`,
    `delete from public.pending_syncs where drive_file_id like 'drive-acg-%'`,
    `delete from public.pending_ingestions where drive_file_id like 'drive-acg-%'`,
    `delete from public.onboarding_scan_manifest where drive_file_id like 'drive-acg-%'`,
    `delete from public.wizard_finalize_checkpoints where wizard_session_id = '${SESSION}'::uuid`,
    `update public.app_settings
        set pending_wizard_session_id = null, pending_wizard_session_at = null,
            pending_folder_id = null, watched_folder_id = null, watched_folder_name = null
      where id = 'default'`,
  ]) {
    await sql.unsafe(stmt, []).catch(() => {});
  }
}

async function seedSession(): Promise<void> {
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid,
            pending_wizard_session_at = now(),
            pending_folder_id = $2
      where id = 'default'`,
    [SESSION, FOLDER],
  );
  await sql!.unsafe(
    `insert into public.wizard_finalize_checkpoints (wizard_session_id, status, batches_completed)
     values ($1::uuid, 'all_batches_complete', 1)
     on conflict (wizard_session_id) do update set status = 'all_batches_complete'`,
    [SESSION],
  );
}

async function seedLiveShow(drive: string, title: string, crew: Crew[]): Promise<string> {
  const row = one<{ id: string }>(
    await sql!.unsafe(
      `insert into public.shows
         (drive_file_id, slug, title, client_label, template_version,
          last_seen_modified_time, published, last_sync_status)
       values ($1, $2, $3, 'Client', 'v4', $4::timestamptz, true, 'ok')
       returning id`,
      [drive, `slug-${drive}`, title, BASE],
    ),
  );
  for (const member of crew) {
    await sql!.unsafe(
      `insert into public.crew_members (show_id, name, email, role) values ($1, $2, $3, 'A1')`,
      [row.id, member.name, member.email],
    );
  }
  return row.id;
}

// The live lifecycle archive shape (lib/sync/unpublishShow.ts archiveAndConsumeUnpublishToken /
// the admin archive RPC): archived=true + archived_at stamp + published=false.
async function archiveShow(showId: string): Promise<void> {
  await sql!.unsafe(
    `update public.shows
        set archived = true, archived_at = now(), published = false
      where id = $1::uuid`,
    [showId],
  );
}

async function seedShadow(
  drive: string,
  showId: string,
  parse: Record<string, unknown>,
): Promise<void> {
  await sql!.unsafe(
    `insert into public.shows_pending_changes
       (wizard_session_id, drive_file_id, show_id, payload, applied_by_email, applied_at_intent)
     values ($1::uuid, $2, $3::uuid, $4, 'approver@fxav.com', $5::timestamptz)`,
    // postgres.js serializes a raw object for a jsonb column itself — never JSON.stringify.
    [
      SESSION,
      drive,
      showId,
      {
        parse_result: parse,
        staged_modified_time: STAGED,
        staged_id: randomUUID(),
        reviewer_choices: [],
        triggered_review_items: [],
        base_modified_time: BASE,
      },
      APPLIED_AT_INTENT,
    ] as never[],
  );
}

function request(): Request {
  return new Request("https://crew.fxav.test/api/admin/onboarding/finalize-cas", {
    method: "POST",
  });
}

const deps = {
  requireAdminIdentity: async () => ({ email: "finalizer@fxav.com" }),
  subscribeToWatchedFolder: async () => undefined,
};

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
  await seedSession();
});

afterAll(async () => {
  if (dbUp) await cleanup();
  vi.unstubAllEnvs();
  if (sql) await sql.end().catch(() => {});
});

describe("Phase D finalize-cas — archived-show immutability guard (real DB)", () => {
  test.skipIf(!dbUp)(
    "a show archived between Phase B staging and final CAS yields SHOW_ARCHIVED_IMMUTABLE with the shadow retained, the show unmutated, the sibling applied, and the batch unresolved",
    async () => {
      // Ordered by drive_file_id (the loop's read order): 'drive-acg-a' (archived) < 'drive-acg-b'.
      const archivedShowId = await seedLiveShow(
        "drive-acg-a",
        "Acg Archived Live",
        ARCHIVED_LIVE_CREW,
      );
      await seedShadow(
        "drive-acg-a",
        archivedShowId,
        makeParse(ARCHIVED_TITLE, ARCHIVED_PARSE_CREW),
      );
      // Archive AFTER staging — the exact DEF-4 race window this guard closes.
      await archiveShow(archivedShowId);

      const siblingShowId = await seedLiveShow(
        "drive-acg-b",
        "Acg Sibling Live",
        SIBLING_LIVE_CREW,
      );
      const siblingParse = makeParse("Acg Sibling", SIBLING_PARSE_CREW);
      await seedShadow("drive-acg-b", siblingShowId, siblingParse);

      const res = await handleOnboardingFinalizeCas(request(), deps);
      expect(res.status).toBe(409);
      const body = (await res.json()) as {
        ok: boolean;
        per_row: Array<{ drive_file_id: string; code: string }>;
      };
      expect(body.ok).toBe(false);
      expect(body.per_row).toEqual([
        {
          drive_file_id: "drive-acg-a",
          code: "SHOW_ARCHIVED_IMMUTABLE",
          display_name: ARCHIVED_TITLE,
        },
        { drive_file_id: "drive-acg-b", code: "OK" },
      ]);

      // Archived show ENTIRELY unmutated: crew unchanged (Eve never lands), no audit, no feed,
      // watermark unchanged at BASE, still archived.
      const archivedShow = one<{ last_seen_modified_time: Date; archived: boolean }>(
        await sql!.unsafe(
          `select last_seen_modified_time, archived from public.shows where drive_file_id = 'drive-acg-a'`,
        ),
      );
      expect(archivedShow.archived).toBe(true);
      expect(new Date(archivedShow.last_seen_modified_time).toISOString()).toBe(BASE);
      const archivedCrew = (await sql!.unsafe(
        `select name from public.crew_members where show_id = $1 order by name`,
        [archivedShowId],
      )) as unknown as Array<{ name: string }>;
      expect(archivedCrew.map((c) => c.name)).toEqual(ARCHIVED_LIVE_CREW.map((m) => m.name));
      expect(
        (await sql!.unsafe(`select 1 from public.sync_audit where drive_file_id = 'drive-acg-a'`))
          .length,
      ).toBe(0);
      expect(
        (
          await sql!.unsafe(`select 1 from public.show_change_log where show_id = $1`, [
            archivedShowId,
          ])
        ).length,
      ).toBe(0);

      // Shadow RETAINED for the refused row (recovery surface: unarchive → re-run final CAS).
      expect(
        (
          await sql!.unsafe(
            `select 1 from public.shows_pending_changes
              where wizard_session_id = $1::uuid and drive_file_id = 'drive-acg-a'`,
            [SESSION],
          )
        ).length,
      ).toBe(1);

      // Sibling row transaction COMMITTED despite the refusal: children replaced from its
      // payload parse (fixture-derived), audit written, watermark advanced, shadow consumed.
      const siblingShow = one<{ last_seen_modified_time: Date }>(
        await sql!.unsafe(
          `select last_seen_modified_time from public.shows where drive_file_id = 'drive-acg-b'`,
        ),
      );
      const siblingCrew = (await sql!.unsafe(
        `select name from public.crew_members where show_id = $1 order by name`,
        [siblingShowId],
      )) as unknown as Array<{ name: string }>;
      expect(siblingCrew.map((c) => c.name)).toEqual(
        (siblingParse.crewMembers as Array<{ name: string }>).map((m) => m.name).sort(),
      );
      expect(
        (await sql!.unsafe(`select 1 from public.sync_audit where drive_file_id = 'drive-acg-b'`))
          .length,
      ).toBe(1);
      expect(new Date(siblingShow.last_seen_modified_time).toISOString()).toBe(STAGED);
      expect(
        (
          await sql!.unsafe(
            `select 1 from public.shows_pending_changes
              where wizard_session_id = $1::uuid and drive_file_id = 'drive-acg-b'`,
            [SESSION],
          )
        ).length,
      ).toBe(0);

      // Batch does NOT resolve while the row pends: settings unpromoted, checkpoint NOT
      // final_cas_done.
      const settings = one<{
        pending_wizard_session_id: string | null;
        watched_folder_id: string | null;
      }>(
        await sql!.unsafe(
          `select pending_wizard_session_id, watched_folder_id from public.app_settings where id = 'default'`,
        ),
      );
      expect(settings.pending_wizard_session_id).toBe(SESSION);
      expect(settings.watched_folder_id).toBeNull();
      expect(
        one<{ status: string }>(
          await sql!.unsafe(
            `select status from public.wizard_finalize_checkpoints where wizard_session_id = $1::uuid`,
            [SESSION],
          ),
        ).status,
      ).toBe("all_batches_complete");
    },
  );
});
