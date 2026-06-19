import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { handleOnboardingFinalizeCas } from "@/app/api/admin/onboarding/finalize-cas/route";

/**
 * F1 Task 1.6 — multi-shadow batch with a REJECT-choice shadow (real DB).
 *
 * Concrete failure mode pinned (plan 01-f1 Task 1.6 (a), reject-seed variant): the discarded-by-
 * reviewer-choice row must neither BLOCK nor CORRUPT its siblings — a regression where the
 * reject branch aborts the batch (sibling never applies / session never resolves) or where the
 * reject leaks partial writes alongside a committed sibling.
 *
 * Coverage note (do-not-duplicate, per Task 1.6 brief): the plan's "shadow A commits fully and
 * PERSISTS while shadow B CAS-fails untouched" multi-shadow class is already pinned by Task
 * 1.5's suite — tests/onboarding/finalizeCasFullApply.db.test.ts (b) equality-preflight refusal
 * with per-row rollback + shadow retention, (c)/(c2) corrupt-row-refused-while-sibling-applies
 * with session-unresolved assertions. This file adds ONLY the reject-seed batch the 1.5 suite
 * does not cover (its (g1) reject test is single-shadow).
 */

// Phase-wide DB-connection convention: TEST_DATABASE_URL is the VALIDATION project in this
// repo — every *.db.test.ts pins BOTH env vars to the local loopback (plan R19-1).
const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "1d1d1d1d-4444-4444-8444-1d1d1d1d1d1d";
const FOLDER = "finalize-cas-multi-shadow-folder";
const BASE = "2026-06-09T00:00:00.000Z";
const STAGED = "2026-06-10T12:00:00.040Z";
const APPLIED_AT_INTENT = "2026-06-10T09:15:00.000Z";

type Crew = { name: string; email: string };

// ALL expectations below derive from these fixture objects (anti-tautology rule).
const REJECT_LIVE_CREW: Crew[] = [{ name: "Bob", email: "bob@x.example" }];
const REJECT_PARSE_CREW: Crew[] = [{ name: "Robert", email: "bob@x.example" }];
const SIBLING_LIVE_CREW: Crew[] = [{ name: "Cara", email: "cara@x.example" }];
const SIBLING_PARSE_CREW: Crew[] = [
  { name: "Cara", email: "cara@x.example" },
  { name: "Dee", email: "dee@x.example" },
];

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
    `delete from public.show_change_log where drive_file_id like 'drive-msr-%'`,
    `delete from public.sync_audit where drive_file_id like 'drive-msr-%'`,
    `delete from public.sync_holds where drive_file_id like 'drive-msr-%'`,
    `delete from public.shows_pending_changes where drive_file_id like 'drive-msr-%'`,
    `delete from public.shows where drive_file_id like 'drive-msr-%'`,
    `delete from public.pending_syncs where drive_file_id like 'drive-msr-%'`,
    `delete from public.pending_ingestions where drive_file_id like 'drive-msr-%'`,
    `delete from public.onboarding_scan_manifest where drive_file_id like 'drive-msr-%'`,
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

async function seedShadow(
  drive: string,
  showId: string,
  parse: Record<string, unknown>,
  opts: { items?: unknown[]; choices?: unknown[] } = {},
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
        reviewer_choices: opts.choices ?? [],
        triggered_review_items: opts.items ?? [],
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

describe("Phase D finalize-cas — multi-shadow reject seed (real DB)", () => {
  test.skipIf(!dbUp)(
    "a REJECT-choice shadow in the batch is discarded while the sibling fully applies and the batch resolves",
    async () => {
      // Ordered by drive_file_id (the loop's read order): 'drive-msr-a' (reject) < 'drive-msr-b'.
      const rejectShowId = await seedLiveShow("drive-msr-a", "Msr Reject Live", REJECT_LIVE_CREW);
      await seedShadow("drive-msr-a", rejectShowId, makeParse("Msr Reject", REJECT_PARSE_CREW), {
        items: [
          {
            id: "i-mi12",
            invariant: "MI-12",
            removed_name: "Bob",
            added_name: "Robert",
            email: "bob@x.example",
          },
        ],
        choices: [{ item_id: "i-mi12", action: "reject" }],
      });
      const siblingShowId = await seedLiveShow(
        "drive-msr-b",
        "Msr Sibling Live",
        SIBLING_LIVE_CREW,
      );
      const siblingParse = makeParse("Msr Sibling", SIBLING_PARSE_CREW);
      await seedShadow("drive-msr-b", siblingShowId, siblingParse);

      const res = await handleOnboardingFinalizeCas(request(), deps);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        status: string;
        per_row: Array<{ drive_file_id: string; code: string; disposition?: string }>;
      };
      expect(body.status).toBe("finalize_complete");
      expect(body.per_row).toEqual([
        { drive_file_id: "drive-msr-a", code: "OK", disposition: "discarded_by_reviewer_choice" },
        { drive_file_id: "drive-msr-b", code: "OK" },
      ]);

      // Reject show ENTIRELY untouched (discard contract — the live MI-12 reject mirror):
      // Bob survives, Robert never lands; no audit, no feed, watermark unchanged at BASE.
      const rejectShow = one<{ last_seen_modified_time: Date }>(
        await sql!.unsafe(
          `select last_seen_modified_time from public.shows where drive_file_id = 'drive-msr-a'`,
        ),
      );
      const rejectCrew = (await sql!.unsafe(
        `select name from public.crew_members where show_id = $1 order by name`,
        [rejectShowId],
      )) as unknown as Array<{ name: string }>;
      expect(rejectCrew.map((c) => c.name)).toEqual(REJECT_LIVE_CREW.map((m) => m.name));
      expect(
        (await sql!.unsafe(`select 1 from public.sync_audit where drive_file_id = 'drive-msr-a'`))
          .length,
      ).toBe(0);
      expect(
        (
          await sql!.unsafe(`select 1 from public.show_change_log where show_id = $1`, [
            rejectShowId,
          ])
        ).length,
      ).toBe(0);
      expect(new Date(rejectShow.last_seen_modified_time).toISOString()).toBe(BASE);

      // Sibling COMMITTED fully despite the discard row in the same batch — children replaced
      // from its payload parse (fixture-derived), audit written, watermark advanced to STAGED.
      const siblingShow = one<{ last_seen_modified_time: Date }>(
        await sql!.unsafe(
          `select last_seen_modified_time from public.shows where drive_file_id = 'drive-msr-b'`,
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
        (await sql!.unsafe(`select 1 from public.sync_audit where drive_file_id = 'drive-msr-b'`))
          .length,
      ).toBe(1);
      expect(new Date(siblingShow.last_seen_modified_time).toISOString()).toBe(STAGED);

      // BOTH shadows consumed (reject consumed-as-discarded, sibling consumed-as-applied):
      expect(
        (
          await sql!.unsafe(
            `select 1 from public.shows_pending_changes where wizard_session_id = $1::uuid`,
            [SESSION],
          )
        ).length,
      ).toBe(0);

      // The discard row did NOT block batch resolution: settings promoted + checkpoint final.
      const settings = one<{ pending_wizard_session_id: string | null; watched_folder_id: string }>(
        await sql!.unsafe(
          `select pending_wizard_session_id, watched_folder_id from public.app_settings where id = 'default'`,
        ),
      );
      expect(settings.pending_wizard_session_id).toBeNull();
      expect(settings.watched_folder_id).toBe(FOLDER);
      expect(
        one<{ status: string }>(
          await sql!.unsafe(
            `select status from public.wizard_finalize_checkpoints where wizard_session_id = $1::uuid`,
            [SESSION],
          ),
        ).status,
      ).toBe("final_cas_done");
    },
  );
});
