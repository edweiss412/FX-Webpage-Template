import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import {
  PostgresOnboardingScanTx,
  prepareOnboardingFiles,
  type PostgresTransaction,
  type PreparedOnboardingFile,
} from "@/lib/sync/runOnboardingScan";
import { runPhase1 } from "@/lib/sync/phase1";
import type { ArchivedPullSheetTab, ParseResult, ParsedSheet } from "@/lib/parser/types";
import { rescanWizardSheet, type RescanDeps } from "@/lib/onboarding/rescanWizardSheet";

/**
 * Pull-sheet override — production reader injection (GAP 3) + rescan persist (GAP 2), real DB.
 *  - The DEFAULT `prepareOnboardingFiles` reader loads `pending_syncs.pull_sheet_override`
 *    for the ACTIVE session and threads `includePullSheetFromTab` (feature is dark otherwise).
 *  - `rescanWizardSheet` persists `pull_sheet_override_applied` (and clears the override on
 *    discard) through `applyRescanDecisionUnderLock` → runScan → `upsertLivePendingSync`.
 */

const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SESSION = "6c6c6c6c-2222-4222-8222-6c6c6c6c6c6c";
const FOLDER = "pso-scan-folder";
const DRIVE = "drive-pso-1";
const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const MODIFIED = "2026-06-20T10:00:00.250Z";
const TAB = "OLD PULL SHEET";

function makeParse(tabs: ArchivedPullSheetTab[], pullItem?: string): Record<string, unknown> {
  return {
    show: {
      title: "Show",
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
    crewMembers: [
      {
        name: "Ada",
        email: "ada@x.example",
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
    pullSheet: pullItem ? [{ caseLabel: "C1", items: [{ qty: 1, item: pullItem }] }] : null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    archivedPullSheetTabs: tabs,
    hardErrors: [],
  };
}

let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
try {
  const probe = postgres(LOCAL_URL, {
    max: 5,
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

async function cleanup(): Promise<void> {
  if (!sql) return;
  for (const stmt of [
    `delete from public.pending_syncs where drive_file_id = '${DRIVE}'`,
    `delete from public.onboarding_scan_manifest where drive_file_id = '${DRIVE}'`,
    `delete from public.wizard_finalize_checkpoints where wizard_session_id = '${SESSION}'::uuid`,
    `update public.app_settings set pending_wizard_session_id = null, pending_wizard_session_at = null, pending_folder_id = null where id = 'default'`,
  ]) {
    await sql.unsafe(stmt);
  }
}

async function setSession(): Promise<void> {
  await sql!.unsafe(
    `update public.app_settings set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now(), pending_folder_id = $2 where id = 'default'`,
    [SESSION, FOLDER],
  );
}

async function stage(parse: Record<string, unknown>): Promise<void> {
  await sql!.begin(async (rawTx) => {
    const tx = new PostgresOnboardingScanTx(
      rawTx as unknown as PostgresTransaction,
      FOLDER,
      SESSION,
    );
    await rawTx.unsafe(`select pg_advisory_xact_lock(hashtext('show:' || $1))`, [DRIVE]);
    const r = await runPhase1(tx, {
      driveFileId: DRIVE,
      mode: "onboarding_scan",
      wizardSessionId: SESSION,
      fileMeta: {
        driveFileId: DRIVE,
        name: "fixture.gsheet",
        mimeType: SHEET_MIME,
        modifiedTime: MODIFIED,
        parents: [FOLDER],
      },
      parseResult: parse as unknown as ParseResult,
      binding: { bindingToken: MODIFIED, modifiedTime: MODIFIED },
    });
    expect(r.outcome).toBe("stage");
  });
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
       values ($1, $2::uuid, $3, $4, 'fixture.gsheet', 'staged')
       on conflict (wizard_session_id, drive_file_id) do update set status = excluded.status`,
    [FOLDER, SESSION, DRIVE, SHEET_MIME],
  );
}

async function setOverride(o: unknown): Promise<void> {
  await sql!.unsafe(
    `update public.pending_syncs set pull_sheet_override = $3::jsonb where drive_file_id = $1 and wizard_session_id = $2::uuid`,
    [DRIVE, SESSION, o as never],
  );
}

async function readRow(): Promise<{
  override: unknown;
  applied: unknown;
  parse_result: ParseResult;
}> {
  const rows = (await sql!.unsafe(
    `select pull_sheet_override as override, pull_sheet_override_applied as applied, parse_result from public.pending_syncs where drive_file_id = $1 and wizard_session_id = $2::uuid`,
    [DRIVE, SESSION],
  )) as Array<{ override: unknown; applied: unknown; parse_result: ParseResult }>;
  return rows[0]!;
}

function injectedDeps(prepared: PreparedOnboardingFile): RescanDeps {
  const meta = {
    driveFileId: DRIVE,
    name: "fixture.gsheet",
    mimeType: SHEET_MIME,
    modifiedTime: MODIFIED,
    parents: [FOLDER],
  };
  return {
    fetchDriveFileMetadata: async () => meta,
    prepareOnboardingFiles: async () => [prepared],
    withTx: async <R>(fn: (rawTx: PostgresTransaction) => Promise<R>): Promise<R> =>
      (await sql!.begin(async (tx) => fn(tx as unknown as PostgresTransaction))) as R,
  };
}

beforeAll(() => {
  if (!dbUp) return;
  vi.stubEnv("TEST_DATABASE_URL", LOCAL_URL);
  vi.stubEnv("DATABASE_URL", LOCAL_URL);
  expect(LOCAL_URL).toMatch(/127\.0\.0\.1|localhost/);
});
beforeEach(async () => {
  if (dbUp) await cleanup();
});
afterAll(async () => {
  if (dbUp) await cleanup();
  vi.unstubAllEnvs();
  if (sql) await sql.end().catch(() => {});
});

const FP = "ff00ff";
const OVERRIDE = {
  tabName: TAB,
  fingerprint: FP,
  acceptedBy: "doug@fxav.com",
  acceptedAt: MODIFIED,
};

describe("pull-sheet override — production reader + rescan persist (real DB)", () => {
  test.skipIf(!dbUp)(
    "GAP3: DEFAULT prepareOnboardingFiles reader loads pending_syncs override + threads includePullSheetFromTab",
    async () => {
      await setSession();
      await stage(makeParse([]));
      await setOverride(OVERRIDE);

      const seenOpts: Array<{ includePullSheetFromTab?: string } | undefined> = [];
      const files = await prepareOnboardingFiles(FOLDER, {
        listFolder: async () => [
          {
            driveFileId: DRIVE,
            name: "fixture.gsheet",
            mimeType: SHEET_MIME,
            modifiedTime: MODIFIED,
            parents: [FOLDER],
          },
        ],
        // NO readPullSheetOverride injected → exercises defaultReadPullSheetOverride (the DB read).
        fetchMarkdownWithBinding: async (_id, opts) => {
          seenOpts.push(opts);
          return {
            binding: { bindingToken: MODIFIED, modifiedTime: MODIFIED },
            markdown: "# md",
            bytes: new ArrayBuffer(8),
            // Matching fingerprint → reconcile "match" → no discard, applied = snapshot.
            archivedPullSheetTabs: [
              {
                tabName: TAB,
                headerPreviews: ["RIA"],
                fingerprint: FP,
                included: true,
                contentChangedSinceAccept: false,
              },
            ],
          };
        },
        parseSheet: (_md: string) => makeParse([]) as unknown as ParsedSheet,
        enrichWithDrivePins: async (p: ParsedSheet) =>
          ({
            ...p,
            diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
            openingReel: null,
          }) as unknown as ParseResult,
        listSheetGids: async () => new Map<string, number>(),
      });

      const prepared = files[0]!;
      expect(prepared.kind).toBe("sheet");
      // The default reader returned the seeded override → export threaded the tab name.
      expect(seenOpts[0]?.includePullSheetFromTab).toBe(TAB);
      if (prepared.kind === "sheet") {
        expect(prepared.pullSheetOverrideApplied).toEqual({ tabName: TAB, fingerprint: FP });
        expect(prepared.pullSheetOverrideCleared ?? false).toBe(false);
      }
    },
  );

  test.skipIf(!dbUp)(
    "GAP2a: normal rescan persists parse_result.archivedPullSheetTabs",
    async () => {
      await setSession();
      await stage(makeParse([]));
      const offer: ArchivedPullSheetTab = {
        tabName: TAB,
        headerPreviews: ["RIA"],
        fingerprint: FP,
        included: false,
        contentChangedSinceAccept: false,
      };
      const prepared: PreparedOnboardingFile = {
        file: {
          driveFileId: DRIVE,
          name: "fixture.gsheet",
          mimeType: SHEET_MIME,
          modifiedTime: MODIFIED,
          parents: [FOLDER],
        },
        kind: "sheet",
        sourceAnchors: {},
        binding: { bindingToken: MODIFIED, modifiedTime: MODIFIED },
        parseResult: makeParse([offer]) as unknown as ParseResult,
      };
      const res = await rescanWizardSheet(DRIVE, SESSION, injectedDeps(prepared));
      expect(res.status).toBe("updated");
      const row = await readRow();
      expect(row.parse_result.archivedPullSheetTabs).toEqual([
        expect.objectContaining({ tabName: TAB, fingerprint: FP, included: false }),
      ]);
    },
  );

  test.skipIf(!dbUp)(
    "GAP2b: rescan with match persists pull_sheet_override_applied = snapshot",
    async () => {
      await setSession();
      await stage(makeParse([]));
      await setOverride(OVERRIDE);
      const prepared: PreparedOnboardingFile = {
        file: {
          driveFileId: DRIVE,
          name: "fixture.gsheet",
          mimeType: SHEET_MIME,
          modifiedTime: MODIFIED,
          parents: [FOLDER],
        },
        kind: "sheet",
        sourceAnchors: {},
        binding: { bindingToken: MODIFIED, modifiedTime: MODIFIED },
        parseResult: makeParse(
          [
            {
              tabName: TAB,
              headerPreviews: ["RIA"],
              fingerprint: FP,
              included: true,
              contentChangedSinceAccept: false,
            },
          ],
          "Shure SM58",
        ) as unknown as ParseResult,
        pullSheetOverrideApplied: { tabName: TAB, fingerprint: FP },
        pullSheetOverrideCleared: false,
        // §5.7: production prepareOne sets this to overrideSnapshot(pre-lock override); the
        // locked-snapshot guard compares it against the under-lock pending_syncs read. Here it
        // matches OVERRIDE, so the guard proceeds (a fixture missing this made preLock=null vs a
        // non-null DB override → the guard refused with stale_override_refused).
        pullSheetOverrideUsed: { tabName: TAB, fingerprint: FP },
      };
      const res = await rescanWizardSheet(DRIVE, SESSION, injectedDeps(prepared));
      expect(res.status).toBe("updated");
      const row = await readRow();
      expect(row.applied).toEqual({ tabName: TAB, fingerprint: FP });
      expect(row.override).toEqual(OVERRIDE); // not cleared on the match path
    },
  );

  test.skipIf(!dbUp)(
    "GAP2c: rescan on drift clears override, applied=null, S4 flag persisted, current gear preserved",
    async () => {
      await setSession();
      await stage(makeParse([]));
      await setOverride(OVERRIDE);
      const changedOffer: ArchivedPullSheetTab = {
        tabName: TAB,
        headerPreviews: ["NEW"],
        fingerprint: "ee11ee",
        included: false,
        contentChangedSinceAccept: true,
      };
      const prepared: PreparedOnboardingFile = {
        file: {
          driveFileId: DRIVE,
          name: "fixture.gsheet",
          mimeType: SHEET_MIME,
          modifiedTime: MODIFIED,
          parents: [FOLDER],
        },
        kind: "sheet",
        sourceAnchors: {},
        binding: { bindingToken: MODIFIED, modifiedTime: MODIFIED },
        // No-override re-parse preserved the current non-OLD gear; OLD gear dropped.
        parseResult: makeParse([changedOffer], "Current DI Box") as unknown as ParseResult,
        pullSheetOverrideApplied: null,
        pullSheetOverrideCleared: true,
        // §5.7: the pre-lock override (OVERRIDE, fingerprint FP) is what drove this export; the
        // drift is a CONTENT change (tab now hashes to a different fingerprint), NOT a change to
        // the durable override, so the under-lock pending_syncs read still returns OVERRIDE and
        // the locked-snapshot guard proceeds before the discard clears it.
        pullSheetOverrideUsed: { tabName: TAB, fingerprint: FP },
      };
      const res = await rescanWizardSheet(DRIVE, SESSION, injectedDeps(prepared));
      expect(res.status).toBe("updated");
      const row = await readRow();
      expect(row.override).toBeNull(); // durable override cleared on discard
      expect(row.applied).toBeNull(); // applied null → row finalizes as no-pull-sheet
      expect(
        row.parse_result.archivedPullSheetTabs.find((t) => t.tabName === TAB)
          ?.contentChangedSinceAccept,
      ).toBe(true);
      const items = (row.parse_result.pullSheet ?? []).flatMap((c) => c.items).map((i) => i.item);
      expect(items).toContain("Current DI Box");
      expect(items).not.toContain("Shure SM58");
    },
  );
});
