import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { handleOnboardingFinalizeCas } from "@/app/api/admin/onboarding/finalize-cas/route";
import { processOneFile, type ProcessOneFileDeps } from "@/lib/sync/runScheduledCronSync";
import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult } from "@/lib/parser/types";

/**
 * F1 Task 1.8 — B→D Doug-edit self-heal convergence regression (bounded staleness, spec §3.4
 * R23-1), real DB.
 *
 * Concrete failure mode caught: the bounded-staleness contract silently breaks — a Doug edit
 * landing between Phase B and Phase D either
 *  (a) blocks Phase D (someone "fixed" the equality preflight to compare against live Drive
 *      time, reintroducing Drive I/O into the SQL-only Phase D — pinned by the strict fetch
 *      stub), or
 *  (b) is never converged because Phase D stamps a watermark ≥ the edit's modifiedTime (e.g.
 *      stamping now() instead of the STAGED instant), so the next cron's watermark gate
 *      (lib/sync/perFileProcessor.ts isAtOrBefore → skip) skips the file forever — the origin
 *      incident's permanent-until-edit damage shape, recreated through the new path.
 *
 * The cron pass runs the REAL gate: processOneFile with the DEFAULT perFileProcessor, whose
 * service-role client falls back to the LOCAL Supabase REST origin (lib/supabase/server.ts
 * createSupabaseServiceRoleClient local fallback) — only the Drive-touching pipeline steps
 * (captureBinding / fetch / parse / enrich) are injected, so the watermark decision itself is
 * never mocked (anti-tautology).
 */

// Phase-wide DB-connection convention: TEST_DATABASE_URL is the VALIDATION project in this
// repo — every *.db.test.ts pins BOTH env vars to the local loopback (plan R19-1).
const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "9c9c9c9c-3333-4333-8333-9c9c9c9c9c9c";
const FOLDER = "finalize-cas-doug-edit-heal-folder";
const DRIVE = "drive-heal-1";
// Instants T0 < T1 < T2 with non-zero milliseconds, so a ms-dropping comparison (the
// Date.parse(Date) class) cannot accidentally pass the gate either way.
const T0 = "2026-06-09T00:00:00.000Z";
const T1 = "2026-06-10T12:00:00.040Z";
const T2 = "2026-06-11T09:30:00.250Z";
const APPLIED_AT_INTENT = "2026-06-10T13:05:00.000Z";

type Crew = { name: string; email: string };

// ALL expectations below derive from these fixture objects (anti-tautology rule): one fixture
// family, PARSE_T1 ⊂ PARSE_T2 (Cy added, room renamed).
function makeParse(title: string, crew: Crew[], roomName: string): Record<string, unknown> {
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
        name: roomName,
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

const CREW_T1: Crew[] = [
  { name: "Ada", email: "ada@x.example" },
  { name: "Bo", email: "bo@x.example" },
];
const CREW_T2: Crew[] = [...CREW_T1, { name: "Cy", email: "cy@x.example" }];
const PARSE_T1 = makeParse("Heal One", CREW_T1, "Main");
const PARSE_T2 = makeParse("Heal One", CREW_T2, "Main Hall");
// Derived, never hardcoded: the crew member the Doug edit (T1→T2) adds.
const NEW_CREW_NAMES = CREW_T2.map((c) => c.name).filter(
  (name) => !CREW_T1.some((c) => c.name === name),
);

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
    `delete from public.sync_holds where drive_file_id like 'drive-heal-%'`,
    `delete from public.show_change_log where drive_file_id like 'drive-heal-%'`,
    `delete from public.sync_audit where drive_file_id like 'drive-heal-%'`,
    `delete from public.sync_log where drive_file_id like 'drive-heal-%'`,
    `delete from public.revision_race_cooldowns where drive_file_id like 'drive-heal-%'`,
    `delete from public.shows_pending_changes where drive_file_id like 'drive-heal-%'`,
    `delete from public.pending_syncs where drive_file_id like 'drive-heal-%'`,
    `delete from public.pending_ingestions where drive_file_id like 'drive-heal-%'`,
    `delete from public.onboarding_scan_manifest where drive_file_id like 'drive-heal-%'`,
    `delete from public.shows where drive_file_id like 'drive-heal-%'`,
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

async function seedLiveShow(opts: { crew: Crew[]; lastSeen: string }): Promise<string> {
  const row = one<{ id: string }>(
    await sql!.unsafe(
      `insert into public.shows
         (drive_file_id, slug, title, client_label, template_version,
          last_seen_modified_time, published, last_sync_status)
       values ($1, $2, 'Heal One Live', 'Client', 'v4', $3::timestamptz, true, 'ok')
       returning id`,
      [DRIVE, `slug-${DRIVE}`, opts.lastSeen],
    ),
  );
  for (const member of opts.crew) {
    await sql!.unsafe(
      `insert into public.crew_members (show_id, name, email, role) values ($1, $2, $3, 'A1')`,
      [row.id, member.name, member.email],
    );
  }
  return row.id;
}

async function seedShadow(showId: string): Promise<void> {
  const payload = {
    parse_result: PARSE_T1,
    staged_modified_time: T1,
    staged_id: randomUUID(),
    reviewer_choices: [],
    triggered_review_items: [],
    base_modified_time: T0,
  };
  await sql!.unsafe(
    `insert into public.shows_pending_changes
       (wizard_session_id, drive_file_id, show_id, payload, applied_by_email, applied_at_intent)
     values ($1::uuid, $2, $3::uuid, $4, 'approver@fxav.com', $5::timestamptz)`,
    // postgres.js serializes a raw object for a jsonb column itself — never JSON.stringify.
    [SESSION, DRIVE, showId, payload, APPLIED_AT_INTENT] as never[],
  );
}

function request(): Request {
  return new Request("https://crew.fxav.test/api/admin/onboarding/finalize-cas", {
    method: "POST",
  });
}

function fileMeta(modifiedTime: string): DriveListedFile {
  return {
    driveFileId: DRIVE,
    name: "Heal One",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime,
    parents: [FOLDER],
    headRevisionId: `rev-${modifiedTime}`,
  } as DriveListedFile;
}

/**
 * One cron pass for DRIVE: REAL processOneFile + REAL (un-mocked) perFileProcessor watermark
 * gate against the live local DB; only the Drive-touching steps are injected. The parse pipeline
 * returns `parse` at `modifiedTime` — the simulated Drive head after Doug's edit.
 */
async function runCronPassForFile(opts: { modifiedTime: string; parse: Record<string, unknown> }) {
  const meta = fileMeta(opts.modifiedTime);
  const processDeps = {
    captureBinding: async () => ({
      bindingToken: meta.headRevisionId,
      modifiedTime: opts.modifiedTime,
    }),
    fetchMarkdownAtRevision: async () => "# v4\nHeal One",
    parseSheet: () => opts.parse,
    enrichWithDrivePins: async () => opts.parse as unknown as ParseResult,
    readRevisionRaceCooldown: async () => null,
    logSync: async () => {},
    publishShowInvalidation: async () => {},
  } as unknown as ProcessOneFileDeps;
  return processOneFile(DRIVE, "cron", meta, processDeps);
}

async function openHoldCount(showId: string): Promise<number> {
  // R39-2: sync_holds has NO released_at column (release = row DELETE;
  // supabase/migrations/20260608000000_sync_holds.sql, lib/sync/holds/holdPort.ts).
  // Open-hold predicate = row EXISTENCE.
  const holds = await sql!.unsafe(`select 1 from public.sync_holds where show_id = $1`, [showId]);
  return (holds as unknown[]).length;
}

beforeAll(() => {
  if (!dbUp) return;
  // The route/pipeline openers fall back TEST_DATABASE_URL ?? DATABASE_URL — stub BOTH (plan
  // R19-1) so the real handlers under test connect to the LOCAL loopback, never validation.
  vi.stubEnv("TEST_DATABASE_URL", LOCAL_URL);
  vi.stubEnv("DATABASE_URL", LOCAL_URL);
  expect(LOCAL_URL).toMatch(/127\.0\.0\.1|localhost/);
  // perFileProcessor's service-role client must hit the LOCAL Supabase REST origin (the
  // default fallback in lib/supabase/server.ts): pin the URL + clear any real keys so the
  // local demo service key is used.
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("SUPABASE_SECRET_KEY", undefined);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
  // processOneFile_unlocked eagerly CONSTRUCTS the snapshot-assets factory + default drive
  // client (makeSnapshotAssetsForApply → getDriveClient), which only requires parseable
  // service-account JSON — construction is lazy (no network / key validation). The fixture
  // parses carry ZERO diagram assets, so no code path ever CALLS Drive; an unexpected call
  // fails loudly at token fetch with this dummy key.
  vi.stubEnv(
    "GOOGLE_SERVICE_ACCOUNT_JSON",
    JSON.stringify({
      client_email: "doug-edit-heal@test.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----\n",
    }),
  );
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

describe("B→D Doug-edit self-heal convergence (spec §3.4 bounded staleness, real DB)", () => {
  test.skipIf(!dbUp)(
    "stage → Doug edit → Phase D applies STAGED content → next cron pass converges to the newest revision",
    async () => {
      // 1. Live show synced at T0 (live crew = Ada only — the pre-wizard state).
      const seededShowId = await seedLiveShow({ crew: [CREW_T1[0]!], lastSeen: T0 });
      // 2. Wizard Phase B at T1: shadow staged with PARSE_T1, base_modified_time = T0,
      //    staged_modified_time = T1 (Drive head re-verify passed at T1 — B.2.pre lives in
      //    Phase B).
      await seedShadow(seededShowId);
      // 3. DOUG EDIT: Drive modifiedTime becomes T2. No DB effect — the edit is upstream; it
      //    exists only as the modifiedTime the NEXT cron pass will list.
      // 4. Phase D fires (SQL-only — no Drive dep injected at all; if Phase D tries Drive I/O
      //    the strict fetch stub throws, pinning the §3.4 contract):
      vi.stubGlobal("fetch", () => {
        throw new Error("Phase D must be SQL-only — Drive I/O attempted (spec §3.4)");
      });
      let casRes: Response;
      try {
        casRes = await handleOnboardingFinalizeCas(request(), {
          requireAdminIdentity: async () => ({ email: "finalizer@fxav.com" }),
          subscribeToWatchedFolder: async () => undefined,
        } as never);
      } finally {
        vi.unstubAllGlobals();
      }
      expect(casRes.status).toBe(200);

      const show = one<{ id: string; last_seen_modified_time: Date }>(
        await sql!.unsafe(
          `select id, last_seen_modified_time from public.shows where drive_file_id = $1`,
          [DRIVE],
        ),
      );
      // Phase D applied the operator-REVIEWED staged parse (T1), not the unreviewed T2:
      const crewAfterD = (await sql!.unsafe(
        `select name from public.crew_members where show_id = $1 order by name`,
        [show.id],
      )) as unknown as Array<{ name: string }>;
      expect(crewAfterD.map((c) => c.name)).toEqual(CREW_T1.map((m) => m.name).sort());
      // Watermark = STAGED instant T1 — strictly LESS than the edit's T2 (the self-heal
      // anchor). Stamping now() here is exactly the failure mode this test exists for.
      expect(new Date(show.last_seen_modified_time).toISOString()).toBe(T1);

      // 5. Next cron pass: REAL watermark gate sees modifiedTime T2 > watermark T1 → FIRES.
      const cronResult = await runCronPassForFile({ modifiedTime: T2, parse: PARSE_T2 });
      if ("skipped" in cronResult) {
        throw new Error("unexpected ConcurrentSyncSkipped — no other sync holds this show's lock");
      }
      expect(cronResult.outcome).not.toBe("skipped"); // watermark gate FIRED (T2 > T1)
      const crewAfterCron = (await sql!.unsafe(
        `select name from public.crew_members where show_id = $1 order by name`,
        [show.id],
      )) as unknown as Array<{ name: string }>;
      expect(crewAfterCron.map((c) => c.name)).toEqual(CREW_T2.map((m) => m.name).sort());
      const finalShow = one<{ last_seen_modified_time: Date }>(
        await sql!.unsafe(
          `select last_seen_modified_time from public.shows where drive_file_id = $1`,
          [DRIVE],
        ),
      );
      expect(new Date(finalShow.last_seen_modified_time).toISOString()).toBe(T2);

      // Feed state consistent: the cron pass produced feed rows for the T1→T2 delta (Cy added —
      // derived from the fixture diff, never hardcoded).
      const feedRows = (await sql!.unsafe(
        `select change_kind, entity_ref from public.show_change_log where show_id = $1`,
        [show.id],
      )) as unknown as Array<{ change_kind: string; entity_ref: string | null }>;
      expect(feedRows.length).toBeGreaterThan(0);
      for (const added of NEW_CREW_NAMES) {
        expect(
          feedRows.some((r) => r.change_kind === "crew_added" && r.entity_ref === added),
          `expected a crew_added feed row for "${added}" from the T1→T2 convergence pass`,
        ).toBe(true);
      }

      // R41-2 EXECUTABLE holds assertion (not prose), AFTER the convergence check: zero rows in
      // sync_holds for the show after convergence (open hold = row existence, R39-2).
      expect(await openHoldCount(show.id)).toBe(0);

      // Negative-regression for the holds assertion: seed a leftover open hold and confirm the
      // SAME assertion fails (proves the predicate reads the real table, not a vacuous query).
      await sql!.unsafe(
        `insert into public.sync_holds
           (show_id, drive_file_id, domain, entity_key, held_value, kind, created_by)
         values ($1::uuid, $2, 'crew_email', 'ada@x.example', '{}'::jsonb, 'undo_override', 'test-seed')`,
        [show.id, DRIVE],
      );
      let leftoverHoldAssertionFailed = false;
      try {
        expect(await openHoldCount(show.id)).toBe(0);
      } catch {
        leftoverHoldAssertionFailed = true;
      }
      expect(leftoverHoldAssertionFailed).toBe(true);
      await sql!.unsafe(
        `delete from public.sync_holds where show_id = $1 and created_by = 'test-seed'`,
        [show.id],
      );
      expect(await openHoldCount(show.id)).toBe(0);
    },
  );

  test.skipIf(!dbUp)(
    "negative control: a genuinely current show (no Doug edit) is SKIPPED by the next cron pass",
    async () => {
      // Live show already at T1 with PARSE_T1 content — re-listing the same head must NOT churn.
      await seedLiveShow({ crew: CREW_T1, lastSeen: T1 });
      const cronResult = await runCronPassForFile({ modifiedTime: T1, parse: PARSE_T1 });
      expect(cronResult).toMatchObject({ outcome: "skipped", reason: "watermark" });
    },
  );
});
