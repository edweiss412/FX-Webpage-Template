import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { handleOnboardingFinalizeCas } from "@/app/api/admin/onboarding/finalize-cas/route";
import {
  processOneFile_unlocked,
  withPostgresSyncPipelineLock,
  type PreparedProcessOneFile,
} from "@/lib/sync/runScheduledCronSync";
import type { DriveListedFile } from "@/lib/drive/list";

/**
 * F1 Task 1.6 — MI-11 wizard/cron PARITY (real DB).
 *
 * Concrete failure mode pinned (plan 01-f1 Task 1.6 (b)): wizard MI-11 semantics drift from the
 * cron decision-rule path — hold row shape, identity pin, or derived auth side effects differ,
 * making the wizard a SECOND identity-gate variant (D-2 violation).
 *
 * Why the twin oracle is not tautological: the wizard row and the cron row are produced by two
 * different entry paths — Phase D `applyShadow` → `applyStagedCore` (`mi11Items: parsed.mi11Items`,
 * finalize-cas/route.ts:363) vs `processOneFile_unlocked` → `runPhase2` with `phase1.mi11Items`
 * (runScheduledCronSync.ts decision rule) — both writing through `writeMi11Holds`. The field-by-
 * field comparison fails if Phase D bypasses the holds composition (e.g. routes MI-11 into a
 * direct apply) or feeds different `liveCrewByName` inputs. Both sides derive from ONE shared
 * crew/parse fixture.
 */

// Phase-wide DB-connection convention: TEST_DATABASE_URL is the VALIDATION project in this
// repo — every *.db.test.ts pins BOTH env vars to the local loopback (plan R19-1).
const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "9c9c9c9c-3333-4333-8333-9c9c9c9c9c9c";
const FOLDER = "finalize-cas-mi11-parity-folder";
const BASE = "2026-06-09T00:00:00.000Z";
const STAGED = "2026-06-10T12:00:00.040Z";
const APPLIED_AT_INTENT = "2026-06-10T09:15:00.000Z";

// ONE shared fixture drives BOTH paths (anti-tautology: expectations derive from it).
const CREW_NAME = "Ada";
const OLD_EMAIL = "ada@old.example";
const NEW_EMAIL = "ada@new.example";
const SHOW_TITLE = "Mi11 Parity";
const SHOW_DATES = {
  travelIn: "2026-05-07",
  set: "2026-05-08",
  showDays: ["2026-05-09"],
  travelOut: "2026-05-10",
};

const MI11_ITEM = {
  id: "i-mi11",
  invariant: "MI-11",
  crew_name: CREW_NAME,
  prior_email: OLD_EMAIL,
  new_email: NEW_EMAIL,
};

function makeParse(): Record<string, unknown> {
  return {
    show: {
      title: SHOW_TITLE,
      client_label: "Client",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: SHOW_DATES,
      schedule_phases: {},
      event_details: {},
      agenda_links: [],
      coi_status: null,
      po: "PO-1",
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: [
      {
        name: CREW_NAME,
        email: NEW_EMAIL, // the MI-11 email change — live row holds OLD_EMAIL
        phone: null,
        role: "A1",
        role_flags: [],
        date_restriction: { kind: "none" },
        stage_restriction: { kind: "none" },
        flight_info: null,
      },
    ],
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
    `delete from public.show_change_log where drive_file_id like 'drive-mi11-%'`,
    `delete from public.sync_audit where drive_file_id like 'drive-mi11-%'`,
    `delete from public.sync_log where drive_file_id like 'drive-mi11-%'`,
    `delete from public.sync_holds where drive_file_id like 'drive-mi11-%'`,
    `delete from public.shows_pending_changes where drive_file_id like 'drive-mi11-%'`,
    `delete from public.shows where drive_file_id like 'drive-mi11-%'`,
    `delete from public.pending_syncs where drive_file_id like 'drive-mi11-%'`,
    `delete from public.pending_ingestions where drive_file_id like 'drive-mi11-%'`,
    `delete from public.onboarding_scan_manifest where drive_file_id like 'drive-mi11-%'`,
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

/** Seeds the SAME live show shape for both halves of the parity pair — identical title, dates,
 * watermark, and crew row, so held_value (the prior live crew row) derives from one fixture. */
async function seedLiveShow(drive: string): Promise<string> {
  const row = one<{ id: string }>(
    await sql!.unsafe(
      `insert into public.shows
         (drive_file_id, slug, title, client_label, template_version, dates,
          last_seen_modified_time, published, last_sync_status)
       values ($1, $2, $3, 'Client', 'v4', $4, $5::timestamptz, true, 'ok')
       returning id`,
      // postgres.js serializes a raw object for a jsonb column itself — never JSON.stringify.
      [drive, `slug-${drive}`, SHOW_TITLE, SHOW_DATES, BASE] as never[],
    ),
  );
  await sql!.unsafe(
    `insert into public.crew_members (show_id, name, email, role) values ($1, $2, $3, 'A1')`,
    [row.id, CREW_NAME, OLD_EMAIL],
  );
  return row.id;
}

type HoldRow = {
  domain: string;
  kind: string;
  entity_key: string;
  held_value: Record<string, unknown>;
  proposed_value: Record<string, unknown>;
  created_by: string;
};

async function readHold(showId: string): Promise<HoldRow | undefined> {
  return (
    (await sql!.unsafe(
      `select domain, kind, entity_key, held_value, proposed_value, created_by
         from public.sync_holds where show_id = $1`,
      [showId],
    )) as unknown as HoldRow[]
  )[0];
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

/** The CRON decision-rule path on the twin show: processOneFile_unlocked with an injected
 * "ready" pipeline (Phase D is SQL-only, so the Drive prepare stage is the injection seam —
 * the SAME seam `processOneFile` itself uses between prepare and the locked apply). Phase 1
 * derives the MI-11 from prior-vs-next (live crew OLD_EMAIL vs parse NEW_EMAIL) and routes to
 * `auto_apply_with_holds`; runPhase2 writes the hold through writeMi11Holds. */
async function runCronMi11Twin(driveFileId: string): Promise<unknown> {
  const fileMeta: DriveListedFile = {
    driveFileId,
    name: "twin.gsheet",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: STAGED,
    parents: [FOLDER],
  };
  const prepared: PreparedProcessOneFile = {
    kind: "ready",
    resolvedMode: "cron",
    binding: { bindingToken: STAGED, modifiedTime: STAGED },
    parseResult: makeParse() as never,
  };
  return await withPostgresSyncPipelineLock(driveFileId, (lockedTx) =>
    processOneFile_unlocked(lockedTx, driveFileId, "cron", fileMeta, {}, prepared),
  );
}

beforeAll(() => {
  if (!dbUp) return;
  // The route + cron openers fall back TEST_DATABASE_URL ?? DATABASE_URL — stub BOTH (plan
  // R19-1) so the real handlers under test connect to the LOCAL loopback, never validation.
  vi.stubEnv("TEST_DATABASE_URL", LOCAL_URL);
  vi.stubEnv("DATABASE_URL", LOCAL_URL);
  expect(LOCAL_URL).toMatch(/127\.0\.0\.1|localhost/);
  // The cron path's snapshotAssetsForApply EAGERLY constructs a Drive client
  // (makeSnapshotAssetsForApply, lib/sync/defaultSnapshotAssetsForApply.ts) even though the twin
  // fixture has zero diagram assets (no Drive call ever fires — google.auth.GoogleAuth validates
  // credentials lazily, at first token request). Provide inert credentials so construction
  // succeeds; the fixture's empty `diagrams` guarantees nothing uses them.
  vi.stubEnv(
    "GOOGLE_SERVICE_ACCOUNT_JSON",
    JSON.stringify({
      client_email: "parity-twin@test.iam.gserviceaccount.com",
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

describe("Phase D MI-11 — wizard/cron parity (real DB)", () => {
  test.skipIf(!dbUp)(
    "wizard MI-11 apply writes the SAME hold + pin + auth side effects as the cron decision-rule path",
    async () => {
      // ---- Wizard half: shadow with the MI-11 item + 'apply' choice through finalize-cas.
      const wizardShowId = await seedLiveShow("drive-mi11-w");
      await sql!.unsafe(
        `insert into public.shows_pending_changes
           (wizard_session_id, drive_file_id, show_id, payload, applied_by_email, applied_at_intent)
         values ($1::uuid, $2, $3::uuid, $4, 'approver@fxav.com', $5::timestamptz)`,
        [
          SESSION,
          "drive-mi11-w",
          wizardShowId,
          {
            parse_result: makeParse(),
            staged_modified_time: STAGED,
            staged_id: randomUUID(),
            reviewer_choices: [{ item_id: MI11_ITEM.id, action: "apply" }],
            triggered_review_items: [MI11_ITEM],
            base_modified_time: BASE,
          },
          APPLIED_AT_INTENT,
        ] as never[],
      );

      const res = await handleOnboardingFinalizeCas(request(), deps);
      expect(res.status).toBe(200);

      // 1. Hold row matches writeMi11Holds' contract (lib/sync/holds/writeMi11Holds.ts):
      //    held_value = prior LIVE crew row; proposed_value = email_change disposition.
      const hold = await readHold(wizardShowId);
      expect(hold).toBeDefined();
      expect(hold).toMatchObject({
        domain: "crew_email",
        kind: "mi11_pending",
        entity_key: CREW_NAME,
        created_by: "system",
      });
      expect(hold!.held_value).toMatchObject({ name: CREW_NAME, email: OLD_EMAIL });
      expect(hold!.proposed_value).toEqual({
        disposition: "email_change",
        name: CREW_NAME,
        email: NEW_EMAIL,
      });

      // 2. Identity PINNED — assert the DB row, not the parse object (anti-tautology):
      expect(
        one<{ email: string }>(
          await sql!.unsafe(
            `select email from public.crew_members where show_id = $1 and name = $2`,
            [wizardShowId, CREW_NAME],
          ),
        ).email,
      ).toBe(OLD_EMAIL);

      // 3. Audit auth side effects match deriveAuthSideEffects(items, choices) — the SAME
      //    dashboard derivation (applyStagedCore): MI-11 + apply → revoke floor for the crew name.
      const audit = one<{ derived_side_effects: unknown }>(
        await sql!.unsafe(
          `select derived_side_effects from public.sync_audit where drive_file_id = 'drive-mi11-w'`,
        ),
      );
      expect(audit.derived_side_effects).toEqual({ revokeFloorForNames: [CREW_NAME] });

      // ---- Cron half: the decision-rule path on an IDENTICAL twin show, same shared fixture.
      const twinShowId = await seedLiveShow("drive-mi11-c");
      const twinResult = await runCronMi11Twin("drive-mi11-c");
      expect(twinResult).toMatchObject({ outcome: "applied" });

      // The cron path pins the identity the same way (DB row, not parse):
      expect(
        one<{ email: string }>(
          await sql!.unsafe(
            `select email from public.crew_members where show_id = $1 and name = $2`,
            [twinShowId, CREW_NAME],
          ),
        ).email,
      ).toBe(OLD_EMAIL);

      // 4. Parity oracle: compare the two sync_holds rows FIELD-BY-FIELD — values must be
      //    EQUAL, derived from the one shared fixture. Fails if Phase D bypasses the holds
      //    composition or feeds different liveCrewByName inputs.
      const twinHold = await readHold(twinShowId);
      expect(twinHold).toBeDefined();
      for (const field of [
        "domain",
        "kind",
        "entity_key",
        "held_value",
        "proposed_value",
      ] as const) {
        expect(hold![field], `wizard/cron hold parity on '${field}'`).toEqual(twinHold![field]);
      }
    },
  );
});
