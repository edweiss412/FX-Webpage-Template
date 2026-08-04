import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { PostgresOnboardingScanTx, type PostgresTransaction } from "@/lib/sync/runOnboardingScan";
import { runPhase1 } from "@/lib/sync/phase1";
import type { ParseResult } from "@/lib/parser/types";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";
import { handleOnboardingFinalize } from "@/app/api/admin/onboarding/finalize/route";
import { handleOnboardingFinalizeCas } from "@/app/api/admin/onboarding/finalize-cas/route";
import { assertLocalDbUrl } from "@/tests/db/_localDbUrl";

/**
 * BL-ONBOARDING-CAS-SOURCE-ANCHORS (spec 2026-08-03-finalize-cas-source-anchors): the
 * existing-show re-onboard path must refresh `shows.source_anchors` from the anchors the
 * scan persisted, exactly as the first-seen flow already does — and must never wipe them.
 *
 * Two concrete failure modes, one per case:
 *
 *  (a) REFRESH — Phase B drops the scan's anchors on the floor (they live only in
 *      `pending_syncs.source_anchors`, which `deleteApprovedPending` consumes in the same
 *      transaction), so by Phase D there is nothing left to apply and the re-onboarded show
 *      keeps whatever a prior sync left. That was the bug.
 *
 *  (b) WIPE GUARD — the opposite defect: forwarding a DEFINED `{}` when the scan computed
 *      no anchors. `applyShowSnapshot`'s UPDATE arm is
 *      `source_anchors = coalesce($18::jsonb, source_anchors)`, so an empty map durably
 *      erases good anchors. That is strictly worse than the bug being fixed, and it is what
 *      the `Object.keys(...)` guard at the Phase-D call site exists to prevent.
 *
 * Both cases stage through the REAL pipeline writers (runPhase1 → PostgresOnboardingScanTx →
 * Phase B's jsonb_build_object → Phase D's applyStagedCore), and both assert on the `shows`
 * row read back from Postgres AFTER the apply — never on the args handed to the core, which
 * would pass against broken plumbing.
 *
 * PRIOR and FRESH are distinct fixtures, so neither case can pass by coincidence, and the
 * wipe guard asserts the apply actually SUCCEEDED first — a refused apply would "preserve"
 * PRIOR trivially and make the assertion vacuous.
 *
 * Also pins the Drive-free posture: the export functions are mocked to throw, so any
 * regression that re-introduces an XLSX export on either phase fails loudly here.
 */

// Phase D is SQL-only (spec §3.4) and Phase B reads anchors from the locked pending_syncs
// row rather than re-exporting. If either ever exports again, these throw.
vi.mock("@/lib/drive/fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/drive/fetch")>();
  const boom = () => {
    throw new Error("finalize must not export XLSX");
  };
  return {
    ...actual,
    fetchSheetMarkdownWithBinding: boom,
    fetchSheetAsMarkdown: boom,
    fetchSheetAsMarkdownAtRevision: boom,
    fetchSheetMarkdownAndBytesAtRevision: boom,
  };
});

// TEST_DATABASE_URL is the VALIDATION project in this repo, and this suite writes and
// deletes rows — pin the loopback (tests/db/_metaLocalDbUrlGuard.test.ts covers the class).
const LOCAL_URL = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);

const SESSION = "6e6e6e6e-7777-4777-8777-6e6e6e6e6e6e";
const FOLDER = "finalize-cas-source-anchors-folder";
const DRIVE = "drive-cas-source-anchors-1";
const INSTANT = "2026-06-12T23:39:21.474Z";
const APPROVED_AT = "2026-06-12T23:45:00.123Z";

/** What a prior sync left on the live show. */
const PRIOR: Record<string, SourceAnchor> = {
  schedule: { title: "AGENDA", gid: 111, a1: "A1:X10" },
  venue: { title: "INFO", gid: 0, a1: "A1:E5" },
};
/** What THIS scan computed — different tab, gid and range in every entry. */
const FRESH: Record<string, SourceAnchor> = {
  schedule: { title: "AGENDA", gid: 222, a1: "A20:X99" },
  venue: { title: "INFO", gid: 0, a1: "B7:F30" },
  gear_packlist: { title: "GEAR", gid: 333, a1: "A1:D40" },
};

type Crew = { name: string; email: string };

// Every expectation derives from these fixtures (anti-tautology rule).
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
    // One ballroom: the invariant set hard-fails a v4 parse with no rooms, so an empty list
    // would fail the fixture at staging rather than exercising anything under test.
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
const PARSE = makeParse("Source Anchors Fixture", CREW_STAGED);

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

/**
 * Live show carrying PRIOR anchors + a staged re-onboard whose scan produced `scanAnchors`.
 * Staged through runPhase1 with the production scan tx, so `pending_syncs.source_anchors`
 * holds exactly what the real writer persists.
 */
async function seed(scanAnchors: Record<string, SourceAnchor>): Promise<string> {
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now(),
            pending_folder_id = $2
      where id = 'default'`,
    [SESSION, FOLDER],
  );
  const show = one<{ id: string }>(
    await sql!.unsafe(
      `insert into public.shows
         (drive_file_id, slug, title, client_label, template_version,
          last_seen_modified_time, published, last_sync_status, source_anchors)
       values ($1, $2, 'Source Anchors Live', 'Client', 'v4', $3::timestamptz, true, 'ok', $4::jsonb)
       returning id`,
      [DRIVE, `slug-${DRIVE}`, INSTANT, PRIOR] as never[],
    ),
  );
  for (const member of CREW_LIVE) {
    await sql!.unsafe(
      `insert into public.crew_members (show_id, name, email, role) values ($1, $2, $3, 'A1')`,
      [show.id, member.name, member.email],
    );
  }
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
        modifiedTime: INSTANT,
        parents: [FOLDER],
      },
      parseResult: PARSE as unknown as ParseResult,
      binding: { bindingToken: INSTANT, modifiedTime: INSTANT },
      sourceAnchors: scanAnchors,
    });
    expect(phase1.outcome).toBe("stage");
  });
  // The staging writer is the source of truth for what finalize reads; assert it landed as
  // given, so a later failure cannot be blamed on the fixture.
  const stagedAnchors = one<{ source_anchors: Record<string, SourceAnchor> }>(
    await sql!.unsafe(
      `select source_anchors from public.pending_syncs
        where drive_file_id = $1 and wizard_session_id = $2::uuid`,
      [DRIVE, SESSION],
    ),
  );
  expect(stagedAnchors.source_anchors).toEqual(scanAnchors);

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
      modifiedTime: INSTANT,
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

/** Phase B: stages the existing-show shadow and consumes the pending_syncs row. */
async function runPhaseB(): Promise<void> {
  const res = await handleOnboardingFinalize(requestFor("finalize"), phaseBDeps());
  expect(res.status).toBe(200);
  const body = (await res.json()) as { per_row: PerRow[] };
  expect(body.per_row[0]!.code).toBe("OK");
}

/** Phase D: applies the shadow. Asserts the row committed, not merely that it ran. */
async function runPhaseD(): Promise<void> {
  const res = await handleOnboardingFinalizeCas(requestFor("finalize-cas"), phaseDDeps());
  const body = (await res.json()) as { per_row?: PerRow[]; code?: string };
  expect(body.per_row?.find((r) => r.drive_file_id === DRIVE)?.code).toBe("OK");
  expect(res.status).toBe(200);
  // The shadow was consumed — the apply committed rather than refusing and retaining it.
  const remaining = await sql!.unsafe(
    `select 1 from public.shows_pending_changes where drive_file_id = $1`,
    [DRIVE],
  );
  expect(remaining.length).toBe(0);
}

async function readShowAnchors(): Promise<unknown> {
  const row = one<{ source_anchors: unknown }>(
    await sql!.unsafe(`select source_anchors from public.shows where drive_file_id = $1`, [DRIVE]),
  );
  return row.source_anchors;
}

beforeAll(() => {
  if (!dbUp) return;
  // The route openers fall back TEST_DATABASE_URL ?? DATABASE_URL — stub BOTH so the real
  // handlers under test connect to the LOCAL loopback, never validation.
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

describe("existing-show re-onboard threads source anchors to shows (real DB)", () => {
  test.skipIf(!dbUp)(
    "Phase B carries the scan's anchors into the shadow payload (they exist nowhere else by Phase D)",
    async () => {
      await seed(FRESH);
      await runPhaseB();

      // Read the payload back out of the table, not the argument handed to the writer: an
      // implementation that accepts the parameter and forgets the jsonb_build_object member
      // must fail here.
      const shadow = one<{ anchors: Record<string, SourceAnchor> | null }>(
        await sql!.unsafe(
          `select payload->'source_anchors' as anchors
             from public.shows_pending_changes where drive_file_id = $1`,
          [DRIVE],
        ),
      );
      expect(shadow.anchors).toEqual(FRESH);

      // And the row they came from is gone — which is why the payload is the only channel.
      const pending = await sql!.unsafe(
        `select 1 from public.pending_syncs where drive_file_id = $1 and wizard_session_id = $2::uuid`,
        [DRIVE, SESSION],
      );
      expect(pending.length).toBe(0);
    },
  );

  test.skipIf(!dbUp)("Phase D refreshes shows.source_anchors with the staged map", async () => {
    await seed(FRESH);
    expect(await readShowAnchors()).toEqual(PRIOR); // precondition, from the fixture
    await runPhaseB();
    await runPhaseD();

    expect(await readShowAnchors()).toEqual(FRESH);
  });

  test.skipIf(!dbUp)(
    "an empty staged map PRESERVES the live anchors — a defined {} would wipe them through the coalesce",
    async () => {
      await seed({});
      expect(await readShowAnchors()).toEqual(PRIOR);
      await runPhaseB();
      await runPhaseD(); // asserts the apply COMMITTED, so the preservation below is not vacuous

      expect(await readShowAnchors()).toEqual(PRIOR);
    },
  );
});
