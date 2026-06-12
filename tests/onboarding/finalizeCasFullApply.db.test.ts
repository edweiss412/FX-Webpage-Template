import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import {
  handleOnboardingFinalizeCas,
  type FinalizeCasRouteTx,
} from "@/app/api/admin/onboarding/finalize-cas/route";
import { makeSyncPipelineTx, type SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";
import { cleanupAbandonedFinalize } from "@/lib/onboarding/sessionLifecycle";

/**
 * F1 Task 1.5 — Phase D `applyShadow` routes through the shared apply core (real DB).
 *
 * Concrete failure modes pinned (plan 01-f1 Task 1.5):
 *  (a) bespoke shows-only UPDATE drops children/feed/audit-provenance (origin incident class);
 *  (b) the `<=` CAS gate applies from a baseline the reviewer never saw (advanced-but-still-<=);
 *  (c) corrupt/missing triggered_review_items consumed fail-OPEN (MI-11 would apply ungated);
 *  (c2) parse_result-less shadow CONSUMED-as-OK (damaged shadow disappears, no retry surface);
 *  (d) bulk publish flip force-publishes pre-existing published=false shows + forged manifest
 *      rows (provenance binding R47-1/R55-1/R56-1, locked-set bound R50-1);
 *  (g1) reviewer-choice override — an MI-12 reject shadow wholesale-applies the rejected rename;
 *  (g2) MI-13 independent collapsing into rename semantics (wrong floors / crew_renamed feed row);
 *  (e1/e2) mid-loop session-currency race — old-session shadow applies commit before the tail CAS
 *      409s (the up-front app_settings FOR UPDATE serializes supersession);
 *  (race) runFinalizeCas vs cleanupAbandonedFinalize share the finalize→app_settings total order
 *      (no AB-BA 40P01).
 */

// Phase-wide DB-connection convention: TEST_DATABASE_URL is the VALIDATION project in this
// repo — every *.db.test.ts pins BOTH env vars to the local loopback (plan R19-1).
const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "7a7a7a7a-1111-4111-8111-7a7a7a7a7a7a";
const OTHER_SESSION = "8b8b8b8b-2222-4222-8222-8b8b8b8b8b8b";
const FOLDER = "finalize-cas-full-apply-folder";
const BASE = "2026-06-09T00:00:00.000Z";
const MID = "2026-06-09T12:00:00.000Z";
const STAGED = "2026-06-10T12:00:00.040Z";
const APPLIED_AT_INTENT = "2026-06-10T09:15:00.000Z";

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

function shadowPayload(
  parse: Record<string, unknown>,
  opts: {
    base?: string | null;
    staged?: string;
    items?: unknown[];
    choices?: unknown[];
    omit?: string[];
  } = {},
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    parse_result: parse,
    staged_modified_time: opts.staged ?? STAGED,
    staged_id: randomUUID(),
    reviewer_choices: opts.choices ?? [],
    triggered_review_items: opts.items ?? [],
    base_modified_time: opts.base === undefined ? BASE : opts.base,
  };
  for (const key of opts.omit ?? []) delete payload[key];
  return payload;
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
    `delete from public.show_change_log where drive_file_id like 'drive-cas-%'`,
    `delete from public.sync_audit where drive_file_id like 'drive-cas-%'`,
    `delete from public.shows_pending_changes where drive_file_id like 'drive-cas-%'`,
    `delete from public.shows where drive_file_id like 'drive-cas-%'`,
    `delete from public.pending_syncs where drive_file_id like 'drive-cas-%'`,
    `delete from public.pending_ingestions where drive_file_id like 'drive-cas-%'`,
    `delete from public.onboarding_scan_manifest where drive_file_id like 'drive-cas-%'`,
    `delete from public.deferred_ingestions where wizard_session_id in ('${SESSION}'::uuid, '${OTHER_SESSION}'::uuid)`,
    `delete from public.wizard_finalize_checkpoints where wizard_session_id in ('${SESSION}'::uuid, '${OTHER_SESSION}'::uuid)`,
    `update public.app_settings
        set pending_wizard_session_id = null, pending_wizard_session_at = null,
            pending_folder_id = null, watched_folder_id = null, watched_folder_name = null
      where id = 'default'`,
  ]) {
    await sql.unsafe(stmt, []).catch(() => {});
  }
}

async function seedSession(opts: { sessionAt?: string } = {}): Promise<void> {
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid,
            pending_wizard_session_at = coalesce($3::timestamptz, now()),
            pending_folder_id = $2
      where id = 'default'`,
    [SESSION, FOLDER, opts.sessionAt ?? null],
  );
  await sql!.unsafe(
    `insert into public.wizard_finalize_checkpoints (wizard_session_id, status, batches_completed)
     values ($1::uuid, 'all_batches_complete', 1)
     on conflict (wizard_session_id) do update set status = 'all_batches_complete'`,
    [SESSION],
  );
}

async function seedLiveShow(opts: {
  drive: string;
  title: string;
  crew?: Crew[];
  lastSeen?: string | null;
  published?: boolean;
  discriminator?: string | null;
}): Promise<string> {
  const row = one<{ id: string }>(
    await sql!.unsafe(
      `insert into public.shows
         (drive_file_id, slug, title, client_label, template_version,
          last_seen_modified_time, published, wizard_created_session_id, last_sync_status)
       values ($1, $2, $3, 'Client', 'v4', $4::timestamptz, $5, $6::uuid, 'ok')
       returning id`,
      [
        opts.drive,
        `slug-${opts.drive}`,
        opts.title,
        opts.lastSeen === undefined ? BASE : opts.lastSeen,
        opts.published ?? true,
        opts.discriminator ?? null,
      ],
    ),
  );
  for (const member of opts.crew ?? []) {
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
  payload: Record<string, unknown>,
): Promise<void> {
  await sql!.unsafe(
    `insert into public.shows_pending_changes
       (wizard_session_id, drive_file_id, show_id, payload, applied_by_email, applied_at_intent)
     values ($1::uuid, $2, $3::uuid, $4, 'approver@fxav.com', $5::timestamptz)`,
    // postgres.js serializes a raw object for a jsonb column itself — never JSON.stringify
    // (the double-encode class); the cast through `never[]` only widens the param tuple type.
    [SESSION, drive, showId, payload, APPLIED_AT_INTENT] as never[],
  );
}

async function seedManifestRow(
  drive: string,
  opts: { createdShowId?: string | null } = {},
): Promise<void> {
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status, created_show_id)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', 'fixture.gsheet',
             'applied', $4::uuid)
     on conflict (wizard_session_id, drive_file_id)
       do update set status = 'applied', created_show_id = excluded.created_show_id`,
    [FOLDER, SESSION, drive, opts.createdShowId ?? null],
  );
}

function request(): Request {
  return new Request("https://crew.fxav.test/api/admin/onboarding/finalize-cas", {
    method: "POST",
  });
}

function deps(overrides: Record<string, unknown> = {}) {
  return {
    requireAdminIdentity: async () => ({ email: "finalizer@fxav.com" }),
    subscribeToWatchedFolder: async () => undefined,
    ...overrides,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type PerRow = { drive_file_id: string; code: string; disposition?: string };

async function perRows(res: Response): Promise<PerRow[]> {
  return ((await res.json()) as { per_row: PerRow[] }).per_row;
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
  await seedSession();
});

afterAll(async () => {
  if (dbUp) await cleanup();
  vi.unstubAllEnvs();
  if (sql) await sql.end().catch(() => {});
});

describe("Phase D finalize-cas — shared apply core (real DB)", () => {
  test.skipIf(!dbUp)(
    "(a) benign existing-show shadow applies the FULL parse via the core: children, feed row, audit",
    async () => {
      const items = [{ id: "i-mi6", invariant: "MI-6" }];
      const showId = await seedLiveShow({
        drive: "drive-cas-1",
        title: "Cas One Live",
        crew: [{ name: "Ada", email: "ada@old.example" }],
        lastSeen: BASE,
      });
      const parse = makeParse("Cas One", [
        { name: "Ada", email: "ada@old.example" },
        { name: "Bo", email: "bo@x.example" },
      ]);
      await seedShadow(
        "drive-cas-1",
        showId,
        shadowPayload(parse, { items, choices: [{ item_id: "i-mi6", action: "apply" }] }),
      );

      const res = await handleOnboardingFinalizeCas(request(), deps());
      expect(res.status).toBe(200);

      const show = one<{ id: string; last_seen_modified_time: Date }>(
        await sql!.unsafe(
          `select id, last_seen_modified_time from public.shows where drive_file_id = 'drive-cas-1'`,
        ),
      );
      // children replaced from the payload parse (derived from fixture):
      const crew = (await sql!.unsafe(
        `select name from public.crew_members where show_id = $1 order by name`,
        [show.id],
      )) as unknown as Array<{ name: string }>;
      expect(crew.map((c) => c.name)).toEqual(
        (parse.crewMembers as Array<{ name: string }>).map((m) => m.name).sort(),
      );
      // watermark advanced to the staged instant (self-heal anchor for T1.8):
      expect(new Date(show.last_seen_modified_time).toISOString()).toBe(STAGED);
      // feed row(s) written (D-2 choice_aware policy; crew diff yields crew_added):
      const feed = await sql!.unsafe(
        `select source from public.show_change_log where show_id = $1`,
        [show.id],
      );
      expect(feed.length).toBeGreaterThan(0);
      // audit: real provenance + base_modified_time persisted + summary shape:
      const audit = one<{
        applied_by: string;
        applied_at: Date;
        base_modified_time: Date;
        triggered_review_items: unknown;
        parse_result_summary: Record<string, unknown>;
      }>(
        await sql!.unsafe(
          `select applied_by, applied_at, base_modified_time, triggered_review_items,
                  parse_result_summary
             from public.sync_audit where drive_file_id = 'drive-cas-1'`,
        ),
      );
      expect(audit.applied_by).toBe("approver@fxav.com");
      expect(new Date(audit.applied_at).toISOString()).toBe(APPLIED_AT_INTENT); // = wizard_approved_at snapshot
      expect(new Date(audit.base_modified_time).toISOString()).toBe(BASE);
      expect(audit.triggered_review_items).toEqual(items);
      expect(audit.parse_result_summary).toMatchObject({
        source: "onboarding_finalize_cas",
        crewCount: (parse.crewMembers as unknown[]).length, // F2 Arm B healthy marker
        roomCount: (parse.rooms as unknown[]).length,
      });
      // shadow consumed:
      expect(
        (
          await sql!.unsafe(
            `select 1 from public.shows_pending_changes where drive_file_id = 'drive-cas-1'`,
          )
        ).length,
      ).toBe(0);
    },
  );

  test.skipIf(!dbUp)(
    "(b) equality preflight REPLACES the <= gate: advanced-but-still-<= baseline is REFUSED",
    async () => {
      // Live watermark moved AFTER staging to MID where BASE < MID < STAGED — the old
      // `<= $15` predicate (finalize-cas/route.ts:277 pre-rewire) would have applied this.
      const seededCrew = [{ name: "Ada", email: "ada@old.example" }];
      const showId = await seedLiveShow({
        drive: "drive-cas-2",
        title: "Cas Two Live",
        crew: seededCrew,
        lastSeen: MID,
      });
      const parse = makeParse("Cas Two", [
        { name: "Ada", email: "ada@old.example" },
        { name: "Bo", email: "bo@x.example" },
      ]);
      await seedShadow("drive-cas-2", showId, shadowPayload(parse, { base: BASE }));

      const res = await handleOnboardingFinalizeCas(request(), deps());
      expect(res.status).toBe(409);
      const rows = await perRows(res);
      expect(rows[0]!.code).toBe("STAGED_PARSE_OUTDATED_AT_PHASE_D"); // code retained
      // per-row rollback: NO child writes, shadow RETAINED, watermark unchanged at MID:
      const show = one<{ id: string; last_seen_modified_time: Date }>(
        await sql!.unsafe(
          `select id, last_seen_modified_time from public.shows where drive_file_id = 'drive-cas-2'`,
        ),
      );
      expect(new Date(show.last_seen_modified_time).toISOString()).toBe(MID);
      expect(
        (await sql!.unsafe(`select 1 from public.crew_members where show_id = $1`, [show.id]))
          .length,
      ).toBe(seededCrew.length); // pre-apply crew intact
      expect(
        (
          await sql!.unsafe(
            `select 1 from public.shows_pending_changes where drive_file_id = 'drive-cas-2'`,
          )
        ).length,
      ).toBe(1);
    },
  );

  test.skipIf(!dbUp)(
    "(c) corrupt/missing items payload is REFUSED per-row, siblings continue (fail-closed integration)",
    async () => {
      const LIVE_ADA_EMAIL = "ada@old.example";
      const show3 = await seedLiveShow({
        drive: "drive-cas-3",
        title: "Cas Three Live",
        crew: [{ name: "Ada", email: LIVE_ADA_EMAIL }],
        lastSeen: BASE,
      });
      // MI-11-bearing parse (Ada email differs from live) with the items key MISSING entirely
      // (legacy shape) — coercing to [] would apply the email change ungated.
      const parse3 = makeParse("Cas Three", [{ name: "Ada", email: "ada@new.example" }]);
      await seedShadow(
        "drive-cas-3",
        show3,
        shadowPayload(parse3, { omit: ["triggered_review_items"] }),
      );
      const show4 = await seedLiveShow({
        drive: "drive-cas-4",
        title: "Cas Four Live",
        crew: [{ name: "Cara", email: "cara@x.example" }],
        lastSeen: BASE,
      });
      const parse4 = makeParse("Cas Four", [
        { name: "Cara", email: "cara@x.example" },
        { name: "Dee", email: "dee@x.example" },
      ]);
      await seedShadow("drive-cas-4", show4, shadowPayload(parse4));

      const res = await handleOnboardingFinalizeCas(request(), deps());
      expect(res.status).toBe(409);
      const rows = await perRows(res);
      expect(rows.find((r) => r.drive_file_id === "drive-cas-3")!.code).toBe(
        "STAGED_REVIEW_ITEMS_CORRUPT",
      );
      expect(rows.find((r) => r.drive_file_id === "drive-cas-4")!.code).toBe("OK");
      // Ada's email did NOT change (the identity gate held), shadow retained for operator cleanup:
      const ada = one<{ email: string }>(
        await sql!.unsafe(
          `select cm.email from public.crew_members cm
            join public.shows s on s.id = cm.show_id
           where s.drive_file_id = 'drive-cas-3' and cm.name = 'Ada'`,
        ),
      );
      expect(ada.email).toBe(LIVE_ADA_EMAIL);
      expect(
        (
          await sql!.unsafe(
            `select 1 from public.shows_pending_changes where drive_file_id = 'drive-cas-3'`,
          )
        ).length,
      ).toBe(1);
    },
  );

  test.skipIf(!dbUp)(
    "(c2) parse_result-less shadow is REFUSED per-row and RETAINED — never consumed-as-OK",
    async () => {
      // Concrete failure mode: the legacy branch deleted the shadow and reported OK — the
      // damaged shadow disappears during finalize-cas, leaving stale live data with NO retry
      // surface and a green finalize.
      const seededCrew = [{ name: "Eve", email: "eve@x.example" }];
      const SEEDED_CAS6_PUBLISHED = true;
      const show6 = await seedLiveShow({
        drive: "drive-cas-6",
        title: "Cas Six Live",
        crew: seededCrew,
        lastSeen: BASE,
        published: SEEDED_CAS6_PUBLISHED,
      });
      const parse6 = makeParse("Cas Six", [{ name: "Eve", email: "eve@x.example" }]);
      await seedShadow("drive-cas-6", show6, shadowPayload(parse6, { omit: ["parse_result"] }));
      const show7 = await seedLiveShow({
        drive: "drive-cas-7",
        title: "Cas Seven Live",
        crew: [{ name: "Finn", email: "finn@x.example" }],
        lastSeen: BASE,
      });
      await seedShadow(
        "drive-cas-7",
        show7,
        shadowPayload(makeParse("Cas Seven", [{ name: "Finn", email: "finn@x.example" }])),
      );
      // A wizard-session deferral: the blocked batch must NOT reach deleteWizardDeferrals.
      await sql!.unsafe(
        `insert into public.deferred_ingestions
           (drive_file_id, wizard_session_id, deferred_kind)
         values ('drive-cas-6', $1::uuid, 'permanent_ignore')`,
        [SESSION],
      );

      const res = await handleOnboardingFinalizeCas(request(), deps());
      expect(res.status).toBe(409); // route's blocked contract
      const rows = await perRows(res);
      expect(rows.find((r) => r.drive_file_id === "drive-cas-6")!.code).toBe(
        "STAGED_PARSE_RESULT_CORRUPT",
      );
      expect(rows.find((r) => r.drive_file_id === "drive-cas-7")!.code).toBe("OK"); // sibling continued
      // Shadow RETAINED (the operator-recovery surface), and NOTHING persisted for that show:
      expect(
        (
          await sql!.unsafe(
            `select 1 from public.shows_pending_changes where drive_file_id = 'drive-cas-6'`,
          )
        ).length,
      ).toBe(1);
      const live6 = one<{ id: string; published: boolean }>(
        await sql!.unsafe(
          `select id, published from public.shows where drive_file_id = 'drive-cas-6'`,
        ),
      );
      expect(
        (
          (await sql!.unsafe(`select name from public.crew_members where show_id = $1`, [
            live6.id,
          ])) as unknown as Array<{ name: string }>
        )
          .map((r) => r.name)
          .sort(),
      ).toEqual(seededCrew.map((m) => m.name).sort()); // children untouched
      expect(
        (await sql!.unsafe(`select 1 from public.sync_audit where drive_file_id = 'drive-cas-6'`))
          .length,
      ).toBe(0);
      expect(live6.published).toBe(SEEDED_CAS6_PUBLISHED); // no publish flip
      // Deferral cleanup did NOT run (blocked batch never reaches deleteWizardDeferrals):
      expect(
        (
          await sql!.unsafe(
            `select 1 from public.deferred_ingestions where wizard_session_id = $1::uuid`,
            [SESSION],
          )
        ).length,
      ).toBe(1);
    },
  );

  test.skipIf(!dbUp)(
    "(d) publish flip narrowed: session-created publishes; pre-existing unpublished + forged manifests do NOT",
    async () => {
      // A — genuine session-created row: created_show_id + drive join + show-side discriminator.
      const createdShowId = await seedLiveShow({
        drive: "drive-cas-d-a",
        title: "Cas D Created",
        lastSeen: STAGED,
        published: false,
        discriminator: SESSION,
      });
      await seedManifestRow("drive-cas-d-a", { createdShowId });
      // B — pre-existing published=false (B2-unpublished) show approved into a shadow:
      // manifest row applied, created_show_id NULL. The shadow row is load-bearing twice:
      // it matches the production shape this case describes, AND it exempts the row from
      // the WM-R7 legacy-ambiguity preflight (shadow-backed rows legitimately carry NULL
      // created_show_id; shadowless ones are the refused legacy shape).
      const preexistingId = await seedLiveShow({
        drive: "drive-cas-d-b",
        title: "Cas D Preexisting",
        lastSeen: BASE,
        published: false,
      });
      await seedManifestRow("drive-cas-d-b");
      await seedShadow(
        "drive-cas-d-b",
        preexistingId,
        shadowPayload(makeParse("Cas D Preexisting", [])),
      );
      // C — SAME-DRIVE forge (R55-1/R56-1): created_show_id forged to the row's own show id via
      // service-role SQL; the SHOW carries no wizard_created_session_id discriminator.
      const sameDriveForgedId = await seedLiveShow({
        drive: "drive-cas-d-c",
        title: "Cas D SameDrive Forge",
        lastSeen: STAGED,
        published: false,
      });
      await seedManifestRow("drive-cas-d-c", { createdShowId: sameDriveForgedId });
      // D — MISMATCHED-DRIVE forge (R47-1): manifest row for drive d-d1 points created_show_id
      // at an UNRELATED unpublished show (drive d-d2) — the drive_file_id join must block it.
      const mismatchedTargetId = await seedLiveShow({
        drive: "drive-cas-d-d2",
        title: "Cas D Mismatched Target",
        lastSeen: STAGED,
        published: false,
        discriminator: SESSION,
      });
      await seedManifestRow("drive-cas-d-d1", { createdShowId: mismatchedTargetId });

      const res = await handleOnboardingFinalizeCas(request(), deps());
      expect(res.status).toBe(200);

      const published = async (id: string) =>
        one<{ published: boolean }>(
          await sql!.unsafe(`select published from public.shows where id = $1`, [id]),
        ).published;
      expect(await published(createdShowId)).toBe(true);
      expect(await published(preexistingId)).toBe(false);
      expect(await published(sameDriveForgedId)).toBe(false);
      expect(await published(mismatchedTargetId)).toBe(false);
    },
  );

  test.skipIf(!dbUp)(
    "(d-late) publish flip is bound to the locked set: a manifest row inserted after the lock-set SELECT is NOT published (R50-1)",
    async () => {
      const lockedShowId = await seedLiveShow({
        drive: "drive-cas-late-a",
        title: "Cas Late Locked",
        lastSeen: STAGED,
        published: false,
        discriminator: SESSION,
      });
      await seedManifestRow("drive-cas-late-a", { createdShowId: lockedShowId });
      const lateShowId = await seedLiveShow({
        drive: "drive-cas-late-b",
        title: "Cas Late Injected",
        lastSeen: STAGED,
        published: false,
        discriminator: SESSION,
      });
      // NO manifest row for late-b yet — it is injected mid-tail, after the lock-set SELECT,
      // immediately before the joined UPDATE executes (side connection, autocommit).
      let injected = false;
      const lateWithTx = async <R>(fn: (tx: FinalizeCasRouteTx) => Promise<R>): Promise<R> => {
        const conn = postgres(LOCAL_URL, { max: 1, idle_timeout: 1, prepare: false });
        try {
          return (await conn.begin(async (rawTx) => {
            const unsafe = rawTx as unknown as {
              unsafe(q: string, params?: unknown[]): Promise<unknown[]>;
            };
            const tx: FinalizeCasRouteTx = {
              async query<T>(q: string, params: readonly unknown[] = []) {
                if (q.includes("set published = true") && !injected) {
                  injected = true;
                  await sql!.unsafe(
                    `insert into public.onboarding_scan_manifest
                       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status,
                        created_show_id)
                     values ($1, $2::uuid, 'drive-cas-late-b',
                             'application/vnd.google-apps.spreadsheet', 'late.gsheet', 'applied',
                             $3::uuid)`,
                    [FOLDER, SESSION, lateShowId],
                  );
                }
                const rows = (await unsafe.unsafe(q, [...params])) as T[];
                return { rows, rowCount: rows.length };
              },
            };
            return await fn(tx);
          })) as R;
        } finally {
          await conn.end({ timeout: 5 });
        }
      };

      const res = await handleOnboardingFinalizeCas(request(), deps({ withTx: lateWithTx }));
      expect(res.status).toBe(200);
      expect(injected).toBe(true);

      const published = async (id: string) =>
        one<{ published: boolean }>(
          await sql!.unsafe(`select published from public.shows where id = $1`, [id]),
        ).published;
      expect(await published(lockedShowId)).toBe(true); // the locked set published
      expect(await published(lateShowId)).toBe(false); // the late row did NOT (set-bound any($2))
    },
  );

  test.skipIf(!dbUp)(
    "(legacy) pre-provenance Phase B rows REFUSE the final CAS fail-closed; provenance siblings publish after recovery (WM-R7)",
    async () => {
      // Concrete failure mode: a setup that ran Phase B on MAIN (pre-provenance)
      // left status='applied' manifest rows with created_show_id NULL and a
      // published=false first-seen show with wizard_created_session_id NULL (no
      // shadow — first-seen rows never have one). The narrowed publish flip
      // selects only provenance-bearing rows → final-CAS would COMPLETE
      // (final_cas_done, settings promoted) publishing ZERO rows; the show
      // stays invisible forever with no pending row to recover.
      const legacyShowId = await seedLiveShow({
        drive: "drive-cas-legacy-a",
        title: "Cas Legacy Old PhaseB",
        lastSeen: STAGED,
        published: false,
        // discriminator omitted → wizard_created_session_id NULL (the OLD shape)
      });
      await seedManifestRow("drive-cas-legacy-a"); // applied, created_show_id NULL, NO shadow
      // Provenance-bearing sibling (the positive case): session-created row.
      const createdShowId = await seedLiveShow({
        drive: "drive-cas-legacy-b",
        title: "Cas Legacy Created",
        lastSeen: STAGED,
        published: false,
        discriminator: SESSION,
      });
      await seedManifestRow("drive-cas-legacy-b", { createdShowId });

      const res = await handleOnboardingFinalizeCas(request(), deps());
      expect(res.status).toBe(409);
      const body = (await res.json()) as { ok: boolean; code: string; per_row: PerRow[] };
      expect(body.code).toBe("ONBOARDING_LEGACY_ROW_AMBIGUOUS");
      expect(body.per_row).toEqual([
        { drive_file_id: "drive-cas-legacy-a", code: "ONBOARDING_LEGACY_ROW_AMBIGUOUS" },
      ]);
      // Fail-closed: NOT final_cas_done, settings NOT promoted, NOTHING published.
      const checkpoint = one<{ status: string }>(
        await sql!.unsafe(
          `select status from public.wizard_finalize_checkpoints where wizard_session_id = $1::uuid`,
          [SESSION],
        ),
      );
      expect(checkpoint.status).toBe("all_batches_complete");
      const settings = one<{ pending_wizard_session_id: string | null; watched_folder_id: string | null }>(
        await sql!.unsafe(
          `select pending_wizard_session_id, watched_folder_id from public.app_settings where id = 'default'`,
        ),
      );
      expect(settings.pending_wizard_session_id).toBe(SESSION);
      expect(settings.watched_folder_id).toBeNull();
      const published = async (id: string) =>
        one<{ published: boolean }>(
          await sql!.unsafe(`select published from public.shows where id = $1`, [id]),
        ).published;
      expect(await published(legacyShowId)).toBe(false);
      expect(await published(createdShowId)).toBe(false); // sibling NOT published either — preflight is before the flip

      // Recovery: re-running setup restages + re-finalizes the sheet on the NEW
      // code, which records provenance on both sides. Simulate that outcome,
      // then the final CAS completes and publishes BOTH rows (positive case).
      await sql!.unsafe(
        `update public.onboarding_scan_manifest set created_show_id = $1::uuid
          where wizard_session_id = $2::uuid and drive_file_id = 'drive-cas-legacy-a'`,
        [legacyShowId, SESSION],
      );
      await sql!.unsafe(
        `update public.shows set wizard_created_session_id = $1::uuid where id = $2::uuid`,
        [SESSION, legacyShowId],
      );
      const res2 = await handleOnboardingFinalizeCas(request(), deps());
      expect(res2.status).toBe(200);
      expect(await published(legacyShowId)).toBe(true);
      expect(await published(createdShowId)).toBe(true);
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

  test.skipIf(!dbUp)(
    "(g1) MI-12 REJECT wizard shadow: staged rename NOT applied — discard mirror of the live contract",
    async () => {
      // Live contract: reject → discard, NO Phase 2, NO audit (applyStaged.ts reject branch;
      // tests/sync/applyStaged.test.ts:1118-1147).
      const CAS8_BASE = BASE;
      const showId = await seedLiveShow({
        drive: "drive-cas-8",
        title: "Cas Eight Live",
        crew: [{ name: "Bob", email: "bob@x.example" }],
        lastSeen: CAS8_BASE,
      });
      const parse = makeParse("Cas Eight", [{ name: "Robert", email: "bob@x.example" }]);
      await seedShadow(
        "drive-cas-8",
        showId,
        shadowPayload(parse, {
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
        }),
      );

      const res = await handleOnboardingFinalizeCas(request(), deps());
      expect(res.status).toBe(200);
      const rows = await perRows(res);
      const row8 = rows.find((r) => r.drive_file_id === "drive-cas-8")!;
      expect(row8.code).toBe("OK");
      expect(row8.disposition).toBe("discarded_by_reviewer_choice");

      const show = one<{ id: string; last_seen_modified_time: Date }>(
        await sql!.unsafe(
          `select id, last_seen_modified_time from public.shows where drive_file_id = 'drive-cas-8'`,
        ),
      );
      // Live row INTACT per the discard contract — Bob survives, Robert never lands:
      const crew = (await sql!.unsafe(`select name from public.crew_members where show_id = $1`, [
        show.id,
      ])) as unknown as Array<{ name: string }>;
      expect(crew.map((c) => c.name)).toEqual(["Bob"]);
      // NO audit (live contract: insertSyncAudit never called on reject) and NO feed row:
      expect(
        (await sql!.unsafe(`select 1 from public.sync_audit where drive_file_id = 'drive-cas-8'`))
          .length,
      ).toBe(0);
      expect(
        (await sql!.unsafe(`select 1 from public.show_change_log where show_id = $1`, [show.id]))
          .length,
      ).toBe(0);
      // Shadow CONSUMED-as-discarded, watermark UNCHANGED (the try_again analogue):
      expect(
        (
          await sql!.unsafe(
            `select 1 from public.shows_pending_changes where drive_file_id = 'drive-cas-8'`,
          )
        ).length,
      ).toBe(0);
      expect(new Date(show.last_seen_modified_time).toISOString()).toBe(CAS8_BASE);
    },
  );

  test.skipIf(!dbUp)(
    "(g2) MI-13 INDEPENDENT wizard shadow: wholesale apply + removed-name-only floor — not a plain rename",
    async () => {
      // Live contract: independent applies the SAME wholesale parse; floors = removed name ONLY
      // (deriveAuthSideEffects; tests/sync/applyStaged.test.ts:1189-1217). R33-2: the feed must
      // NOT contain a crew_renamed row for a choice the operator declined to treat as a rename.
      const showId = await seedLiveShow({
        drive: "drive-cas-9",
        title: "Cas Nine Live",
        crew: [{ name: "Old Person", email: "old@x.example" }],
        lastSeen: BASE,
      });
      const parse = makeParse("Cas Nine", [{ name: "New Person", email: "new@x.example" }]);
      await seedShadow(
        "drive-cas-9",
        showId,
        shadowPayload(parse, {
          items: [
            {
              id: "i-mi13",
              invariant: "MI-13",
              removed_name: "Old Person",
              added_name: "New Person",
            },
          ],
          choices: [{ item_id: "i-mi13", action: "independent" }],
        }),
      );

      const res = await handleOnboardingFinalizeCas(request(), deps());
      expect(res.status).toBe(200);
      const show = one<{ id: string }>(
        await sql!.unsafe(`select id from public.shows where drive_file_id = 'drive-cas-9'`),
      );
      // Wholesale apply landed: Old removed, New added (fixture-derived):
      const crew = (await sql!.unsafe(`select name from public.crew_members where show_id = $1`, [
        show.id,
      ])) as unknown as Array<{ name: string }>;
      expect(crew.map((c) => c.name)).toEqual(
        (parse.crewMembers as Array<{ name: string }>).map((m) => m.name),
      );
      // Audit derived_side_effects = removed name ONLY (the independent ≠ rename distinction):
      const audit = one<{ derived_side_effects: unknown }>(
        await sql!.unsafe(
          `select derived_side_effects from public.sync_audit where drive_file_id = 'drive-cas-9'`,
        ),
      );
      expect(audit.derived_side_effects).toEqual({ revokeFloorForNames: ["Old Person"] });
      expect(
        (
          await sql!.unsafe(
            `select 1 from public.shows_pending_changes where drive_file_id = 'drive-cas-9'`,
          )
        ).length,
      ).toBe(0);
      // R33-2 feed assertions: zero crew_renamed for those names; remove+add rows ARE present:
      const kinds = (await sql!.unsafe(
        `select change_kind, entity_ref from public.show_change_log where show_id = $1`,
        [show.id],
      )) as unknown as Array<{ change_kind: string; entity_ref: string | null }>;
      expect(kinds.filter((k) => k.change_kind === "crew_renamed")).toEqual([]);
      expect(
        kinds.some((k) => k.change_kind === "crew_removed" && k.entity_ref === "Old Person"),
      ).toBe(true);
      expect(
        kinds.some((k) => k.change_kind === "crew_added" && k.entity_ref === "New Person"),
      ).toBe(true);
    },
  );

  test.skipIf(!dbUp)(
    "(e1) PRE-superseded session: typed abort BEFORE any row transaction — zero shadow applies persisted",
    async () => {
      const seededCrew = [{ name: "Gail", email: "gail@x.example" }];
      const showId = await seedLiveShow({
        drive: "drive-cas-5",
        title: "Cas Five Live",
        crew: seededCrew,
        lastSeen: BASE,
      });
      await seedShadow(
        "drive-cas-5",
        showId,
        shadowPayload(makeParse("Cas Five", [{ name: "Hank", email: "hank@x.example" }])),
      );
      // Supersession lands BEFORE the call:
      await sql!.unsafe(
        `update public.app_settings set pending_wizard_session_id = $1::uuid where id = 'default'`,
        [OTHER_SESSION],
      );

      const res = await handleOnboardingFinalizeCas(request(), deps());
      expect(res.status).toBe(409);
      expect(((await res.json()) as { code: string }).code).toBe(
        "WIZARD_FINALIZE_CHECKPOINT_MISSING", // existing typed abort (no checkpoint for OTHER_SESSION)
      );
      // ZERO row transactions ran: live crew untouched, shadow retained, no audit:
      expect(
        (
          (await sql!.unsafe(`select name from public.crew_members where show_id = $1`, [
            showId,
          ])) as unknown as Array<{ name: string }>
        )
          .map((r) => r.name)
          .sort(),
      ).toEqual(seededCrew.map((m) => m.name).sort());
      expect(
        (
          await sql!.unsafe(
            `select 1 from public.shows_pending_changes where drive_file_id = 'drive-cas-5'`,
          )
        ).length,
      ).toBe(1);
      expect(
        (await sql!.unsafe(`select 1 from public.sync_audit where drive_file_id = 'drive-cas-5'`))
          .length,
      ).toBe(0);
    },
  );

  test.skipIf(!dbUp)(
    "(e2) lock-topology proof: the up-front app_settings FOR UPDATE serializes a MID-LOOP supersession attempt",
    async () => {
      // A concurrent flip can no longer interleave with the shadow loop — it BLOCKS on the
      // app_settings row lock (held from the up-front currency re-check through the
      // promoteSettings tail CAS) until Phase D commits.
      const showId = await seedLiveShow({
        drive: "drive-cas-10",
        title: "Cas Ten Live",
        crew: [{ name: "Ida", email: "ida@x.example" }],
        lastSeen: BASE,
      });
      await seedShadow(
        "drive-cas-10",
        showId,
        shadowPayload(makeParse("Cas Ten", [{ name: "Ida", email: "ida@x.example" }])),
      );

      const slowWithRowTx = async <R>(
        driveFileId: string,
        fn: (tx: FinalizeCasRouteTx, pipelineTx: SyncPipelineTx) => Promise<R>,
      ): Promise<R> => {
        const conn = postgres(LOCAL_URL, { max: 1, idle_timeout: 1, prepare: false });
        try {
          return (await conn.begin(async (rawTx) => {
            const unsafe = rawTx as unknown as {
              unsafe(q: string, params?: unknown[]): Promise<unknown[]>;
            };
            const tx: FinalizeCasRouteTx = {
              async query<T>(q: string, params: readonly unknown[] = []) {
                const rows = (await unsafe.unsafe(q, [...params])) as T[];
                return { rows, rowCount: rows.length };
              },
            };
            await tx.query(`select pg_advisory_xact_lock(hashtext('show:' || $1))`, [driveFileId]);
            await delay(300); // hold the per-row apply mid-flight (outer app_settings lock held)
            return await fn(tx, makeSyncPipelineTx(unsafe));
          })) as R;
        } finally {
          await conn.end({ timeout: 5 });
        }
      };

      // NOTE (mirrors the Task-1.3 deviation from the plan's literal completion-order array):
      // promise-resolution order is a racy proxy for lock serialization (route connection
      // teardown). Assert the load-bearing contract directly: the flip is BLOCKED for (at
      // least) the per-row delay window, and Phase D completed normally.
      const finalize = handleOnboardingFinalizeCas(request(), deps({ withRowTx: slowWithRowTx }));
      await delay(50); // Phase D is mid-loop, holding the app_settings row lock
      const flipFiredAt = Date.now();
      let flipBlockedMs = -1;
      const flip = sql!
        .unsafe(
          `update public.app_settings set pending_wizard_session_id = $1::uuid where id = 'default'`,
          [OTHER_SESSION],
        )
        .then(() => {
          flipBlockedMs = Date.now() - flipFiredAt;
        });
      const [res] = await Promise.all([finalize, flip]);

      // The per-row apply held the batch open ~300ms after the flip fired at ~50ms; an
      // unblocked flip completes in single-digit ms. ≥200ms proves it waited on the
      // app_settings row lock until Phase D's transaction committed.
      expect(flipBlockedMs).toBeGreaterThanOrEqual(200);
      expect(res.status).toBe(200); // S1 finalized consistently (flip applied after)
    },
  );

  test.skipIf(!dbUp)(
    "(race) runFinalizeCas vs cleanupAbandonedFinalize for the SAME session: both settle, no 40P01, one winner",
    async () => {
      // Both paths share the global total order finalize: → app_settings (→ per-show). The R7
      // sketch's readSession-first shape would AB-BA deadlock here (plan R16-1).
      await cleanup();
      await seedSession({ sessionAt: "2026-06-08T00:00:00.000Z" }); // >24h stale → cleanup-eligible
      const showId = await seedLiveShow({
        drive: "drive-cas-11",
        title: "Cas Eleven Live",
        crew: [{ name: "Jay", email: "jay@x.example" }],
        lastSeen: BASE,
      });
      await seedShadow(
        "drive-cas-11",
        showId,
        shadowPayload(makeParse("Cas Eleven", [{ name: "Jay", email: "jay@x.example" }])),
      );

      const [finalizeOutcome, cleanupOutcome] = await Promise.allSettled([
        handleOnboardingFinalizeCas(request(), deps()),
        cleanupAbandonedFinalize(SESSION, {
          requireAdminIdentity: async () => ({ email: "finalizer@fxav.com" }),
        }),
      ]);

      // Neither side may reject with a deadlock (SQLSTATE 40P01):
      for (const outcome of [finalizeOutcome, cleanupOutcome]) {
        if (outcome.status === "rejected") {
          const code = (outcome.reason as { code?: unknown })?.code;
          expect(code).not.toBe("40P01");
          expect(String(outcome.reason)).not.toMatch(/deadlock/i);
        }
      }
      const finalizeWon =
        finalizeOutcome.status === "fulfilled" && finalizeOutcome.value.status === 200;
      const cleanupWon =
        cleanupOutcome.status === "fulfilled" && cleanupOutcome.value.status === "cleaned";
      expect(Number(finalizeWon) + Number(cleanupWon)).toBe(1); // exactly one wins the session
    },
  );
});
