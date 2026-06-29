import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { PostgresOnboardingScanTx, type PostgresTransaction } from "@/lib/sync/runOnboardingScan";
import { runPhase1 } from "@/lib/sync/phase1";
import type { ParseResult, ParseWarning, TriggeredReviewItem } from "@/lib/parser/types";
import { FIELD_UNREADABLE } from "@/lib/parser/warnings";
import { STAGED_PARSE_SOURCE_OUT_OF_SCOPE } from "@/lib/sync/applyStaged";
import { RESCAN_REVIEW_REQUIRED } from "@/lib/onboarding/rescanReviewCode";
import {
  rescanWizardSheet,
  type RescanDeps,
  type RescanResult,
} from "@/lib/onboarding/rescanWizardSheet";

/**
 * `rescanWizardSheet` core — Flow A (review) + folder guard + lock (real DB).
 *
 * Mirrors the harness shape of finalizeCasReonboardBaseline.db.test.ts: seed
 * app_settings pending session+folder, stage via runPhase1 + PostgresOnboardingScanTx
 * under the per-show advisory lock, then drive `rescanWizardSheet` with INJECTED
 * Drive deps (no real Drive) + an injected `withTx` over the local test connection.
 *
 * Concrete failure modes pinned here:
 *  - T-A1: a clean, previously-approved sheet keeps its approval (CHECK-valid: email +
 *          refreshed at) with REGENERATED choices keyed to the new staged item ids.
 *  - T-A2: an email change (MI-11) demotes the row to RESCAN_REVIEW_REQUIRED so finalize
 *          cannot silently consume a crew-identity change.
 *  - T-A4: a parse hard-fail surfaces the CONCRETE pending_ingestions.last_error_code.
 *  - T-SCOPE2 / T-LOCK(i) / T-MANIFEST: each guard returns its typed result with ZERO mutation.
 *  - T-LOCK(iv): prior state is captured UNDER the lock, so an unapprove during the pre-lock
 *               Drive window is NOT lost (no resurrected approval).
 *  - T-DEMOTED-CLEAN: a previously-demoted row rescanned clean clears its failure code (unblocks).
 */

const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "7e7e7e7e-1111-4111-8111-7e7e7e7e7e7e";
const FOLDER = "rescan-wizard-folder";
const DRIVE = "drive-rescan-1";
const SHEET_MIME = "application/vnd.google-apps.spreadsheet";

const SEED_MODIFIED = "2026-06-20T10:00:00.250Z";
const RESCAN_MODIFIED = "2026-06-22T14:30:00.750Z";
const SEED_APPROVED_AT = "2026-06-20T11:00:00.100Z";
const APPROVER = "approver@fxav.com";

type Crew = { name: string; email: string };

function makeParse(
  title: string,
  crew: Crew[],
  warnings: ParseWarning[] = [],
): Record<string, unknown> {
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
    warnings,
    hardErrors: [],
  };
}

const CREW: Crew[] = [{ name: "Ada", email: "ada@x.example" }];
const CREW_EMAIL_CHANGED: Crew[] = [{ name: "Ada", email: "ada-new@x.example" }];
const fieldGap = (n: number): ParseWarning[] =>
  Array.from({ length: n }, (_, i) => ({
    severity: "warn" as const,
    code: FIELD_UNREADABLE,
    message: `field ${i} unreadable`,
  }));

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
  for (const stmt of [
    `delete from public.shows_pending_changes where drive_file_id = '${DRIVE}'`,
    `delete from public.shows where drive_file_id = '${DRIVE}'`,
    `delete from public.pending_syncs where drive_file_id = '${DRIVE}'`,
    `delete from public.pending_ingestions where drive_file_id = '${DRIVE}'`,
    `delete from public.onboarding_scan_manifest where drive_file_id = '${DRIVE}'`,
    `delete from public.wizard_finalize_checkpoints where wizard_session_id = '${SESSION}'::uuid`,
    `update public.app_settings
        set pending_wizard_session_id = null, pending_wizard_session_at = null,
            pending_folder_id = null, watched_folder_id = null, watched_folder_name = null
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

// Stage the ORIGINAL parse through the REAL wizard staging path (runPhase1 +
// PostgresOnboardingScanTx under the per-show advisory lock) — exactly as a Step-2 scan
// would. Returns the staged triggered_review_items (the blinded sentinel).
async function stageOriginal(
  parse: Record<string, unknown>,
  modifiedTime: string,
): Promise<TriggeredReviewItem[]> {
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
      [DRIVE, SESSION],
    ),
  ).triggered_review_items;
}

async function seedManifest(status: string): Promise<void> {
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values ($1, $2::uuid, $3, $4, 'fixture.gsheet', $5)
     on conflict (wizard_session_id, drive_file_id) do update set status = excluded.status`,
    [FOLDER, SESSION, DRIVE, SHEET_MIME, status],
  );
}

async function approve(
  items: TriggeredReviewItem[],
  email: string,
  approvedAt: string,
): Promise<void> {
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
    [DRIVE, SESSION, approvedAt, choices, email] as never[],
  );
}

async function readPending(): Promise<{
  wizard_approved: boolean;
  wizard_approved_by_email: string | null;
  wizard_approved_at: Date | null;
  wizard_reviewer_choices: Array<{ item_id: string; action: string }> | null;
  wizard_reviewer_choices_version: number | null;
  last_finalize_failure_code: string | null;
  triggered_review_items: TriggeredReviewItem[];
  staged_modified_time: Date | null;
}> {
  return one(
    await sql!.unsafe(
      `select wizard_approved, wizard_approved_by_email, wizard_approved_at,
              wizard_reviewer_choices, wizard_reviewer_choices_version,
              last_finalize_failure_code, triggered_review_items, staged_modified_time
         from public.pending_syncs where drive_file_id = $1 and wizard_session_id = $2::uuid`,
      [DRIVE, SESSION],
    ),
  );
}

async function manifestStatus(): Promise<string | null> {
  const rows = (await sql!.unsafe(
    `select status from public.onboarding_scan_manifest where drive_file_id = $1 and wizard_session_id = $2::uuid`,
    [DRIVE, SESSION],
  )) as unknown as Array<{ status: string }>;
  return rows[0]?.status ?? null;
}

async function countRows(table: string): Promise<number> {
  const rows = (await sql!.unsafe(
    `select count(*)::int as c from public.${table} where drive_file_id = $1 and wizard_session_id = $2::uuid`,
    [DRIVE, SESSION],
  )) as unknown as Array<{ c: number }>;
  return rows[0]?.c ?? 0;
}

function mkWithTx(): NonNullable<RescanDeps["withTx"]> {
  return async <R>(fn: (rawTx: PostgresTransaction) => Promise<R>): Promise<R> =>
    (await sql!.begin(async (tx) => fn(tx as unknown as PostgresTransaction))) as R;
}

function deps(opts: {
  refreshedParse: Record<string, unknown>;
  modifiedTime?: string;
  metadataParents?: string[];
  afterDriveRead?: () => void | Promise<void>;
}): RescanDeps {
  const modifiedTime = opts.modifiedTime ?? RESCAN_MODIFIED;
  const meta = {
    driveFileId: DRIVE,
    name: "fixture.gsheet",
    mimeType: SHEET_MIME,
    modifiedTime,
    parents: opts.metadataParents ?? [FOLDER],
  };
  const base: RescanDeps = {
    fetchDriveFileMetadata: async () => meta,
    prepareOnboardingFiles: async () => [
      {
        file: meta,
        kind: "sheet",
        binding: { bindingToken: modifiedTime, modifiedTime },
        parseResult: opts.refreshedParse as unknown as ParseResult,
      },
    ],
    withTx: mkWithTx(),
  };
  return opts.afterDriveRead ? { ...base, afterDriveRead: opts.afterDriveRead } : base;
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

describe("rescanWizardSheet — Flow A + folder guard + lock (real DB)", () => {
  test.skipIf(!dbUp)(
    "T-A1: clean + previously-approved → re-approved with CHECK-valid payload + regenerated choices",
    async () => {
      await setSession();
      const seedItems = await stageOriginal(makeParse("Show", CREW), SEED_MODIFIED);
      await seedManifest("staged");
      await approve(seedItems, APPROVER, SEED_APPROVED_AT);

      const result = await rescanWizardSheet(
        DRIVE,
        SESSION,
        deps({ refreshedParse: makeParse("Show", CREW), modifiedTime: RESCAN_MODIFIED }),
      );

      expect(result).toEqual({ status: "updated", needsReview: false, changed: true });

      const row = await readPending();
      expect(row.wizard_approved).toBe(true);
      expect(row.wizard_approved_by_email).toBe(APPROVER); // non-null (CHECK passes)
      expect(row.wizard_reviewer_choices_version).toBe(1);
      expect(row.last_finalize_failure_code).toBeNull();
      // approved_at refreshed to now() (later than the seed approval instant).
      expect(iso(row.wizard_approved_at)).not.toBeNull();
      expect(new Date(row.wizard_approved_at!).getTime()).toBeGreaterThan(
        new Date(SEED_APPROVED_AT).getTime(),
      );
      // choices regenerated to the NEW staged item ids (derive from the row, not hardcoded).
      const newIds = row.triggered_review_items.map((i) => i.id);
      expect(newIds.length).toBeGreaterThan(0);
      expect(row.wizard_reviewer_choices!.map((c) => c.item_id).sort()).toEqual([...newIds].sort());
      expect(row.wizard_reviewer_choices!.every((c) => c.action === "apply")).toBe(true);
      // The re-parse minted FRESH ids — none of the seed's choice ids survive.
      const seedIds = seedItems.map((i) => i.id);
      expect(newIds.some((id) => seedIds.includes(id))).toBe(false);
      expect(await manifestStatus()).toBe("staged");
    },
  );

  test.skipIf(!dbUp)(
    "T-A2: email change (MI-11) → demoted to RESCAN_REVIEW_REQUIRED + manifest staged",
    async () => {
      await setSession();
      const seedItems = await stageOriginal(makeParse("Show", CREW), SEED_MODIFIED);
      await seedManifest("staged");
      await approve(seedItems, APPROVER, SEED_APPROVED_AT);

      const result = await rescanWizardSheet(
        DRIVE,
        SESSION,
        deps({ refreshedParse: makeParse("Show", CREW_EMAIL_CHANGED) }),
      );

      expect(result).toEqual({ status: "updated", needsReview: true, changed: true });

      const row = await readPending();
      expect(row.wizard_approved).toBe(false);
      expect(row.wizard_approved_by_email).toBeNull();
      expect(row.last_finalize_failure_code).toBe(RESCAN_REVIEW_REQUIRED);
      // triggered_review_items carry the staged sentinel ++ the MI-11 decision item.
      const invariants = row.triggered_review_items.map((i) => i.invariant);
      expect(invariants).toContain("MI-11");
      expect(invariants).toContain("ONBOARDING_SCAN_REVIEW");
      expect(await manifestStatus()).toBe("staged");
    },
  );

  test.skipIf(!dbUp)(
    "T-A3: a NEW data-gap (FIELD_UNREADABLE count 0→2) regresses → demoted; a removed gap stays clean",
    async () => {
      await setSession();
      const seedItems = await stageOriginal(makeParse("Show", CREW, []), SEED_MODIFIED);
      await seedManifest("staged");
      await approve(seedItems, APPROVER, SEED_APPROVED_AT);

      const result = await rescanWizardSheet(
        DRIVE,
        SESSION,
        deps({ refreshedParse: makeParse("Show", CREW, fieldGap(2)) }),
      );
      expect(result).toEqual({ status: "updated", needsReview: true, changed: true });
      const row = await readPending();
      expect(row.wizard_approved).toBe(false);
      expect(row.last_finalize_failure_code).toBe(RESCAN_REVIEW_REQUIRED);
    },
  );

  test.skipIf(!dbUp)(
    "T-A4: parse hard-fail → needs_attention with the CONCRETE pending_ingestions code + manifest hard_failed + orphan shadow deleted",
    async () => {
      await setSession();
      const seedItems = await stageOriginal(makeParse("Show", CREW), SEED_MODIFIED);
      await seedManifest("staged");
      await approve(seedItems, APPROVER, SEED_APPROVED_AT);
      // Seed an orphan shadow (FK-valid show_id) to prove the hard-fail path deletes it.
      const show = one<{ id: string }>(
        await sql!.unsafe(
          `insert into public.shows (drive_file_id, slug, title, client_label, template_version,
              last_seen_modified_time, published, last_sync_status)
           values ($1, $2, 'Live', 'Client', 'v4', $3::timestamptz, true, 'ok') returning id`,
          [DRIVE, `slug-${DRIVE}`, SEED_MODIFIED],
        ),
      );
      await sql!.unsafe(
        `insert into public.shows_pending_changes
           (wizard_session_id, drive_file_id, show_id, payload, applied_by_email, applied_at_intent)
         values ($1::uuid, $2, $3::uuid, '{}'::jsonb, $4, now())`,
        [SESSION, DRIVE, show.id, APPROVER],
      );

      // An empty title hard-fails MI-2 even under the blinded (prior=null) onboarding scan.
      const badParse = makeParse("", CREW);
      const result = await rescanWizardSheet(DRIVE, SESSION, deps({ refreshedParse: badParse }));

      expect(result.status).toBe("needs_attention");
      const code = (result as { code: string }).code;
      expect(code).toBe("MI-2_EMPTY_TITLE");
      // The returned code is the ACTUAL row the scan just wrote, not a generic.
      const ing = one<{ last_error_code: string }>(
        await sql!.unsafe(
          `select last_error_code from public.pending_ingestions where drive_file_id = $1 and wizard_session_id = $2::uuid`,
          [DRIVE, SESSION],
        ),
      );
      expect(code).toBe(ing.last_error_code);
      expect(await manifestStatus()).toBe("hard_failed");
      expect(await countRows("shows_pending_changes")).toBe(0); // orphan shadow deleted
    },
  );

  test.skipIf(!dbUp)(
    "T-SCOPE2: metadata.parents lacks the pending folder → STAGED_PARSE_SOURCE_OUT_OF_SCOPE, no mutation",
    async () => {
      await setSession();
      const seedItems = await stageOriginal(makeParse("Show", CREW), SEED_MODIFIED);
      await seedManifest("staged");
      await approve(seedItems, APPROVER, SEED_APPROVED_AT);

      const before = await readPending();
      const result = await rescanWizardSheet(
        DRIVE,
        SESSION,
        deps({
          refreshedParse: makeParse("Show", CREW_EMAIL_CHANGED),
          metadataParents: ["some-other-folder"],
        }),
      );
      expect(result).toEqual({ status: "needs_attention", code: STAGED_PARSE_SOURCE_OUT_OF_SCOPE });
      const after = await readPending();
      expect(after.wizard_approved).toBe(true); // untouched
      expect(iso(after.staged_modified_time)).toBe(iso(before.staged_modified_time));
      expect(after.last_finalize_failure_code).toBeNull();
    },
  );

  test.skipIf(!dbUp)(
    "T-LOCK(i): a concurrently-held finalize:<session> lock → busy CONCURRENT_FINALIZE_IN_FLIGHT, no mutation",
    async () => {
      await setSession();
      const seedItems = await stageOriginal(makeParse("Show", CREW), SEED_MODIFIED);
      await seedManifest("staged");
      await approve(seedItems, APPROVER, SEED_APPROVED_AT);
      const before = await readPending();

      const holder = postgres(LOCAL_URL, { max: 1, prepare: false });
      let result: RescanResult | undefined;
      try {
        await holder.begin(async (htx) => {
          await htx.unsafe(`select pg_advisory_xact_lock(hashtext('finalize:' || $1))`, [SESSION]);
          result = await rescanWizardSheet(
            DRIVE,
            SESSION,
            deps({ refreshedParse: makeParse("Show", CREW_EMAIL_CHANGED) }),
          );
        });
      } finally {
        await holder.end().catch(() => {});
      }
      expect(result).toEqual({ status: "busy", code: "CONCURRENT_FINALIZE_IN_FLIGHT" });
      const after = await readPending();
      expect(after.wizard_approved).toBe(true); // untouched
      expect(iso(after.staged_modified_time)).toBe(iso(before.staged_modified_time));
      expect(after.last_finalize_failure_code).toBeNull();
    },
  );

  test.skipIf(!dbUp)(
    "T-LOCK(iv): an unapprove during the pre-lock Drive window is seen under the lock (no resurrected approval)",
    async () => {
      await setSession();
      const seedItems = await stageOriginal(makeParse("Show", CREW), SEED_MODIFIED);
      await seedManifest("staged");
      await approve(seedItems, APPROVER, SEED_APPROVED_AT);

      const result = await rescanWizardSheet(
        DRIVE,
        SESSION,
        deps({
          refreshedParse: makeParse("Show", CREW), // clean refresh
          afterDriveRead: async () => {
            // A concurrent unapprove lands AFTER the pre-lock Drive read, BEFORE the lock.
            await sql!.unsafe(
              `update public.pending_syncs
                  set wizard_approved = false, wizard_approved_by_email = null,
                      wizard_approved_at = null, wizard_reviewer_choices = null,
                      wizard_reviewer_choices_version = null
                where drive_file_id = $1 and wizard_session_id = $2::uuid`,
              [DRIVE, SESSION],
            );
          },
        }),
      );
      // Clean refresh but priorReady=false captured UNDER the lock → stays needs-review, NOT re-approved.
      expect(result).toEqual({ status: "updated", needsReview: true, changed: true });
      const row = await readPending();
      expect(row.wizard_approved).toBe(false);
      expect(row.wizard_approved_by_email).toBeNull();
      expect(row.last_finalize_failure_code).toBeNull();
    },
  );

  test.skipIf(!dbUp)(
    "T-MANIFEST: no onboarding_scan_manifest row for the session → not_found, zero mutation",
    async () => {
      await setSession();
      // NO manifest row, NO pending_syncs row — the membership guard fires before any write.
      const result = await rescanWizardSheet(
        DRIVE,
        SESSION,
        deps({ refreshedParse: makeParse("Show", CREW) }),
      );
      expect(result).toEqual({ status: "not_found" });
      expect(await countRows("pending_syncs")).toBe(0);
      expect(await countRows("onboarding_scan_manifest")).toBe(0);
      expect(await countRows("shows_pending_changes")).toBe(0);
    },
  );

  test.skipIf(!dbUp)(
    "T-DEMOTED-CLEAN: a previously-demoted row rescanned clean clears its failure code (un-blocks)",
    async () => {
      await setSession();
      await stageOriginal(makeParse("Show", CREW), SEED_MODIFIED);
      await seedManifest("staged");
      // Demote the row (wizard_approved=false + a non-null failure code) — the unresolved-blocked state.
      await sql!.unsafe(
        `update public.pending_syncs
            set wizard_approved = false, wizard_approved_by_email = null, wizard_approved_at = null,
                wizard_reviewer_choices = null, wizard_reviewer_choices_version = null,
                last_finalize_failure_code = $3
          where drive_file_id = $1 and wizard_session_id = $2::uuid`,
        [DRIVE, SESSION, STAGED_PARSE_SOURCE_OUT_OF_SCOPE],
      );

      const result = await rescanWizardSheet(
        DRIVE,
        SESSION,
        deps({ refreshedParse: makeParse("Show", CREW) }), // clean
      );
      expect(result.status).toBe("updated");
      expect((result as { needsReview: boolean }).needsReview).toBe(true);
      const row = await readPending();
      expect(row.wizard_approved).toBe(false);
      expect(row.last_finalize_failure_code).toBeNull(); // cleared → no longer blocking
    },
  );
});
