import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { cleanupAbandonedFinalize } from "@/lib/onboarding/sessionLifecycle";

/**
 * Thread 2b (spec 2026-07-05-finalize-resume-deadlock §5.5 step 3, plan T10) — the
 * full 2×2 recovery-vs-cleanup concurrency matrix, against the REAL local DB.
 *
 * A recovery route takes the row's `show:` advisory lock FIRST, then mutates the
 * pending row (Task 5 made cleanup advisory-before-row too, so the two orderings
 * agree and cannot AB-BA). This test contends a concurrent recovery transaction —
 * holding `show:<D_FAIL>` — against cleanupAbandonedFinalize, across:
 *
 *   recovery flavor ∈ {
 *     RESOLVING  — clears the row's finalize failure code (models a staged Apply
 *                  that resolves the blocked sheet): D_FAIL LEAVES the unresolved set,
 *     NON_RESOLVING — rewrites the failure code to a different non-null value
 *                  (models an Unapprove / partial touch): D_FAIL STAYS unresolved,
 *   }
 *   × cleanup eligibility path ∈ { STALE (25h), STUCK (fresh, 0 finishable) }
 *
 * For every cell we assert:
 *   (1) no AB-BA hang / SQLSTATE 40P01 — both settle, cleanup serializes BEHIND the
 *       recovery (which holds the show: lock until it commits);
 *   (2) the under-lock recheck ABORTS `session_too_fresh` (purging nothing) exactly
 *       when the recovery RESOLVED the row, and PROCEEDS (cleaned) otherwise —
 *       identically on the stale and the stuck path (a stuck-only recheck fails the
 *       two STALE×RESOLVING/ NON_RESOLVING cells).
 */

const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "3c3c3c3c-4d4d-4d4d-8d4d-3c3c3c3c3c3c";
const FOLDER = "recovery-concurrency-folder";
const D_FAIL = "recovery-concurrency-fail";
const D_OK = "recovery-concurrency-ok";
const STAGED_INSTANT = "2026-06-10T08:00:00.000Z";
const FAIL_CODE = "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE";
const OTHER_CODE = "WIZARD_SESSION_SUPERSEDED";

const PARSE_RESULT = {
  show: {
    title: "Recovery Fixture",
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
    event_details: {},
    agenda_links: [],
    coi_status: null,
  },
  crewMembers: [],
  hotelReservations: [],
  rooms: [],
  transportation: null,
  contacts: [],
  pullSheet: null,
  diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
  openingReel: null,
  raw_unrecognized: [],
  warnings: [],
  hardErrors: [],
};

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

const ALL_DRIVE_FILES = [D_FAIL, D_OK];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reset(): Promise<void> {
  if (!sql) return;
  for (const stmt of [
    `delete from public.shows where drive_file_id = any($1::text[])`,
    `delete from public.pending_syncs where drive_file_id = any($1::text[])`,
    `delete from public.shows_pending_changes where drive_file_id = any($1::text[])`,
    `delete from public.onboarding_scan_manifest where wizard_session_id = '${SESSION}'::uuid`,
    `delete from public.wizard_finalize_checkpoints where wizard_session_id = '${SESSION}'::uuid`,
    `update public.app_settings set pending_wizard_session_id = null, pending_wizard_session_at = null, pending_folder_id = null where id = 'default'`,
  ]) {
    await sql.unsafe(stmt, stmt.includes("$1") ? [ALL_DRIVE_FILES] : []).catch(() => {});
  }
}

// Seed a session whose D_FAIL is a demoted (unresolved) staged row: manifest
// 'staged' + pending_syncs carrying a non-null last_finalize_failure_code and
// wizard_approved=false (so it is NOT finishable). `stuck` omits the finishable
// D_OK row so finishableCleanCount is 0; the stale variant adds D_OK so the
// session is eligible via the 24h age gate rather than the stuck predicate.
async function seed(path: "STALE" | "STUCK"): Promise<void> {
  const age = path === "STALE" ? "25 hours" : "20 minutes";
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid,
            pending_wizard_session_at = now() - interval '${age}',
            pending_folder_id = $2
      where id = 'default'`,
    [SESSION, FOLDER],
  );
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', $3, 'staged')`,
    [FOLDER, SESSION, D_FAIL],
  );
  await sql!.unsafe(
    `insert into public.pending_syncs
       (drive_file_id, staged_modified_time, parse_result, triggered_review_items,
        source_kind, warning_summary, wizard_session_id,
        wizard_approved, last_finalize_failure_code)
     values ($1, $2::timestamptz, $3::jsonb, '[]'::jsonb, 'onboarding_scan', '', $4::uuid, false, $5)`,
    [D_FAIL, STAGED_INSTANT, PARSE_RESULT, SESSION, FAIL_CODE],
  );
  if (path === "STALE") {
    // a finishable clean row → finishableCleanCount > 0 → NOT stuck (eligible only via age)
    await sql!.unsafe(
      `insert into public.onboarding_scan_manifest
         (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
       values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', $3, 'applied')`,
      [FOLDER, SESSION, D_OK],
    );
    await sql!.unsafe(
      `insert into public.pending_syncs
         (drive_file_id, staged_modified_time, parse_result, triggered_review_items,
          source_kind, warning_summary, wizard_session_id,
          wizard_approved, wizard_reviewer_choices, wizard_reviewer_choices_version,
          wizard_approved_by_email, wizard_approved_at)
       values ($1, $2::timestamptz, $3::jsonb, '[]'::jsonb, 'onboarding_scan', '', $4::uuid,
               true, '[]'::jsonb, 1, 'approver@fxav.com', now())`,
      [D_OK, STAGED_INSTANT, PARSE_RESULT, SESSION],
    );
  }
}

// A concurrent recovery: take show:<D_FAIL> FIRST, mutate under it, then hold the
// lock long enough for cleanup to contend before committing.
async function runRecovery(resolving: boolean): Promise<void> {
  await sql!.begin(async (tx) => {
    await tx.unsafe(`select pg_advisory_xact_lock(hashtext('show:' || $1))`, [D_FAIL]);
    await tx.unsafe(
      `update public.pending_syncs set last_finalize_failure_code = $2 where drive_file_id = $1 and wizard_session_id = $3::uuid`,
      [D_FAIL, resolving ? null : OTHER_CODE, SESSION],
    );
    await delay(250); // hold show:<D_FAIL> so cleanup blocks on it, then commit
  });
}

const deps = { requireAdminIdentity: async () => ({ email: "doug@example.com" }) };

beforeAll(() => {
  if (!dbUp) return;
  vi.stubEnv("TEST_DATABASE_URL", LOCAL_URL);
  vi.stubEnv("DATABASE_URL", LOCAL_URL);
  expect(LOCAL_URL).toMatch(/127\.0\.0\.1|localhost/);
});

beforeEach(async () => {
  if (!dbUp) return;
  await reset();
});

afterAll(async () => {
  if (dbUp) await reset();
  vi.unstubAllEnvs();
  if (sql) await sql.end().catch(() => {});
});

type Cell = { path: "STALE" | "STUCK"; resolving: boolean; expect: "abort" | "cleaned" };
const CELLS: Cell[] = [
  { path: "STALE", resolving: true, expect: "abort" },
  { path: "STALE", resolving: false, expect: "cleaned" },
  { path: "STUCK", resolving: true, expect: "abort" },
  { path: "STUCK", resolving: false, expect: "cleaned" },
];

describe("cleanup vs concurrent recovery (T10 2×2, real DB)", () => {
  for (const cell of CELLS) {
    const label = `${cell.path} × ${cell.resolving ? "RESOLVING" : "NON_RESOLVING"} → recheck ${cell.expect}`;
    test.skipIf(!dbUp)(label, { timeout: 15000 }, async () => {
      await seed(cell.path);

      const recoveryPromise = runRecovery(cell.resolving);
      await delay(60); // let the recovery grab show:<D_FAIL> before cleanup contends
      const cleanupPromise = cleanupAbandonedFinalize(SESSION, deps)
        .then((ok) => ({ ok }) as const)
        .catch((err: unknown) => ({ err }) as const);

      const [rec, clean] = await Promise.allSettled([recoveryPromise, cleanupPromise]);

      // (1) No AB-BA hang: both settle, recovery committed cleanly.
      expect(rec.status, "recovery tx must commit").toBe("fulfilled");
      expect(clean.status).toBe("fulfilled");
      const outcome = (clean as PromiseFulfilledResult<{ ok?: unknown; err?: unknown }>).value;
      if ("err" in outcome && outcome.err) {
        const e = outcome.err as Error & { code?: string; reason?: string };
        expect(`${e.name}: ${e.message}`, "cleanup must not deadlock").not.toMatch(
          /deadlock|40P01/i,
        );
      }

      const manifestRows = await sql!.unsafe(
        `select count(*)::int as c from public.onboarding_scan_manifest where wizard_session_id = $1::uuid`,
        [SESSION],
      );
      const manifestCount = (manifestRows[0] as unknown as { c: number }).c;

      if (cell.expect === "abort") {
        // (2a) recovery RESOLVED D_FAIL → recheck aborts, purges nothing.
        expect("err" in outcome && outcome.err).toBeTruthy();
        const e = (outcome as { err: Error & { code?: string; reason?: string } }).err;
        expect(e.code).toBe("CLEANUP_REQUIRES_STALE_SESSION");
        expect(e.reason).toBe("session_too_fresh");
        expect(manifestCount, "aborted cleanup must purge nothing").toBeGreaterThan(0);
      } else {
        // (2b) recovery did NOT resolve D_FAIL → cleanup proceeds and purges.
        expect("ok" in outcome && outcome.ok).toBeTruthy();
        expect((outcome as { ok: { status: string } }).ok.status).toBe("cleaned");
        expect(manifestCount, "cleaned cleanup must purge the session manifest").toBe(0);
      }
    });
  }
});
