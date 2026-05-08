/**
 * tests/sync/dev-routing.test.ts (M3 Task 3.2 — AC-3.2 + AC-3.3)
 *
 * Verifies that parseAndStage routes parse outcomes to the correct dev.* table
 * via the dev_phase1_stage RPC:
 *
 *   AC-3.2 — A fixture run with a synthesized `prior` (4 hotels) against a
 *     real fixture (1 hotel) triggers MI-7 SECTION_SHRINKAGE. The row lands
 *     in dev.pending_syncs with triggered_review_items containing the MI-7
 *     entry on section='hotel_reservations'.
 *
 *   AC-3.3 — A markdown blob with no version markers triggers
 *     MI-1_VERSION_DETECTION_FAILED. The row lands in dev.pending_ingestions
 *     with last_error_code = 'MI-1_VERSION_DETECTION_FAILED'.
 *
 * Anti-tautology discipline (per AGENTS.md / handoff §6 watchpoints):
 *   - We do NOT INSERT into dev.pending_syncs/dev.pending_ingestions and then
 *     assert against the row we inserted. Instead, we drive parseAndStage end
 *     to end (parseSheet → enrichWithDrivePins → runInvariants → dev_phase1_stage)
 *     and assert the routing decision and stored fields the RPC produced.
 *   - For AC-3.2, the synthetic prior is a ParseResult-shaped TS object passed
 *     as the second parameter to parseAndStage. The MI-7 trigger is computed
 *     by runInvariants from (prior.hotelReservations.length=4,
 *     next.hotelReservations.length=1) — NOT by inserting that JSON ourselves.
 *   - For AC-3.3, we write a temp markdown file to fixtures/shows/raw/ that
 *     contains zero version markers. parseSheet's version-detection branch
 *     emits MI-1_VERSION_DETECTION_FAILED into hardErrors; parseAndStage then
 *     routes to dev.pending_ingestions. We do NOT pre-insert that error code.
 *
 * Schema isolation (per AGENTS.md plan §1 invariants and Task 3.1):
 *   - All writes target dev.*. Cleanup runs via the dev_truncate_all RPC.
 *   - The dev_phase1_stage RPC wraps every write in
 *     pg_advisory_xact_lock(hashtext('show:' || drive_file_id)) per AGENTS.md §1.2;
 *     these tests inherit that protection.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { admin } from "../e2e/helpers/supabaseAdmin";
import { parseSheet } from "@/lib/parser";
import { mockDriveClient } from "@/lib/sync/mocks/mockDriveClient";
import { enrichWithDrivePins } from "@/lib/sync/enrichWithDrivePins";
import type { ParseResult } from "@/lib/parser/types";

// requireAdmin's build-flag gate must accept this Vitest run before we can
// reach the action body. See tests/admin/parseAndStage-auth.test.ts:34 for the
// established pattern. We also need to mark the caller as admin; the simplest
// path is to monkey-patch the requireAdmin module (similar to what the
// auth-defense suite leverages: it relies on the gate firing). Here we need
// the OPPOSITE — the gate must NOT fire because we're testing the routing
// path that runs after auth. We do this by mocking requireAdmin to a no-op.
process.env.ADMIN_DEV_PANEL_ENABLED = "true";
import { vi } from "vitest";
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: async () => ({ id: "test-admin", email: "admin@fxav.test" }),
}));

// Import AFTER the mock is set so the action picks up the no-op requireAdmin.
import { parseAndStage } from "@/app/admin/dev/actions";

// Real fixture with hotelReservations.length === 1 (verified by parser probe).
// With prior.hotelReservations.length === 4, MI-7 triggers because
// nc=1 < pc/2=2 (per lib/parser/invariants.ts:256).
const FIXTURE_NEXT_ONE_HOTEL = "2026-04-asset-mgmt-cfo-coo-waldorf.md";

// AC-3.3 synthetic markdown. Contains zero v1/v2/v4 detection markers
// (no `Contact Office` row label, no v1/v2 Crew block patterns, no
// recognizable FXAV layout). parseSheet's detectVersion returns null →
// hardErrors gets MI-1_VERSION_DETECTION_FAILED (lib/parser/index.ts:316-322).
const SYNTHETIC_NO_VERSION_MARKDOWN =
  "# Some Document Title\n\nThis markdown blob contains no FXAV sheet template markers.\n" +
  "It should fail version detection at the parser's first hard-error gate.\n";
const TEMP_FIXTURE_NAME = "_temp-mi1-no-version.md";
const FIXTURE_DIR = join(process.cwd(), "fixtures/shows/raw");

beforeAll(async () => {
  // Wipe dev.* before this suite begins so we don't inherit residue from
  // any other test that ran before us.
  const { error } = await admin.rpc("dev_truncate_all");
  if (error) throw new Error(`dev_truncate_all (beforeAll) failed: ${error.message}`);

  // Create the temp fixture for AC-3.3. Synthetic markdown lives in
  // fixtures/shows/raw/ because parseAndStage's allowlist gates on that dir
  // (see app/admin/dev/actions.ts:56-69). The filename matches the regex.
  await mkdir(FIXTURE_DIR, { recursive: true });
  await writeFile(join(FIXTURE_DIR, TEMP_FIXTURE_NAME), SYNTHETIC_NO_VERSION_MARKDOWN, "utf8");
});

afterAll(async () => {
  // Remove the temp fixture so it doesn't pollute the corpus or leak into
  // /admin/dev's listFixtures() output for the next dev session.
  await rm(join(FIXTURE_DIR, TEMP_FIXTURE_NAME), { force: true });
  await admin.rpc("dev_truncate_all");
});

beforeEach(async () => {
  const { error } = await admin.rpc("dev_truncate_all");
  if (error) throw new Error(`dev_truncate_all (beforeEach) failed: ${error.message}`);
});

afterEach(async () => {
  // Belt-and-suspenders cleanup so a passing/failing test never leaves residue.
  await admin.rpc("dev_truncate_all");
});

describe("AC-3.2: MI-7 SECTION_SHRINKAGE routes to dev.pending_syncs with triggered MI-7", () => {
  test("synthetic prior=4 hotels vs real fixture next=1 hotel → triggered_review_items contains MI-7", async () => {
    // Build the synthetic prior by running the real pipeline on the same
    // fixture, then mutating ONLY the hotelReservations array. This keeps the
    // prior internally consistent (so MI-6/MI-8/MI-8b/MI-8c/MI-9..MI-14 do
    // NOT spurious-trigger) while isolating MI-7-hotels as the single change.
    //
    // Why: MI-8 reads prior.show.po/proposal/invoice/invoice_notes; MI-8b
    // reads prior.show.coi_status; MI-8c reads prior.pullSheet; MI-6 reads
    // prior.crewMembers.length; MI-9..MI-14 read prior.crewMembers. Copying
    // the next-side values for all of those guarantees zero deltas there.
    const { readFile } = await import("node:fs/promises");
    const realMarkdown = await readFile(join(FIXTURE_DIR, FIXTURE_NEXT_ONE_HOTEL), "utf8");
    const realParsed = parseSheet(realMarkdown, FIXTURE_NEXT_ONE_HOTEL);
    expect(
      realParsed.hardErrors.length,
      "fixture must parse cleanly so MI-1..MI-5b do not fire on next side",
    ).toBe(0);
    expect(
      realParsed.hotelReservations.length,
      "fixture invariant: next side must have exactly 1 hotel for MI-7 to trigger",
    ).toBe(1);

    const realEnriched = await enrichWithDrivePins(realParsed, mockDriveClient, {
      driveFileId: `dev:fixture:${FIXTURE_NEXT_ONE_HOTEL}`,
      fileMeta: {
        driveFileId: `dev:fixture:${FIXTURE_NEXT_ONE_HOTEL}`,
        headRevisionId: "mock-prior-rev",
        md5Checksum: "f".repeat(32),
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: new Date(Date.now() - 86400_000).toISOString(),
      },
    });

    // Synthesize the prior: copy realEnriched, swap hotelReservations to a
    // 4-element array. Other arrays are identical, so only MI-7-hotels fires.
    const syntheticPrior: ParseResult = {
      ...realEnriched,
      hotelReservations: [
        {
          ordinal: 1,
          hotel_name: "Prior Hotel A",
          hotel_address: null,
          names: [],
          confirmation_no: null,
          check_in: null,
          check_out: null,
          notes: null,
        },
        {
          ordinal: 2,
          hotel_name: "Prior Hotel B",
          hotel_address: null,
          names: [],
          confirmation_no: null,
          check_in: null,
          check_out: null,
          notes: null,
        },
        {
          ordinal: 3,
          hotel_name: "Prior Hotel C",
          hotel_address: null,
          names: [],
          confirmation_no: null,
          check_in: null,
          check_out: null,
          notes: null,
        },
        {
          ordinal: 4,
          hotel_name: "Prior Hotel D",
          hotel_address: null,
          names: [],
          confirmation_no: null,
          check_in: null,
          check_out: null,
          notes: null,
        },
      ],
    };

    // Drive the action end-to-end. parseAndStage will: read fixture →
    // parseSheet → enrichWithDrivePins → runInvariants(prior=synthetic, next)
    // → dev_phase1_stage RPC. The RPC routes 'stage' outcome to
    // dev.pending_syncs with triggered_review_items.
    const result = await parseAndStage(FIXTURE_NEXT_ONE_HOTEL, syntheticPrior);

    expect(result.outcome, "MI-7 trigger should produce 'stage' outcome").toBe("stage");
    expect(result.staging?.kind).toBe("pending_sync");

    // Anti-tautology assertion: read back from dev.pending_syncs and verify
    // the MI-7 entry the RPC stored under triggered_review_items came from
    // runInvariants's actual computation, not from anything we inserted.
    const psRead = await admin
      .schema("dev")
      .from("pending_syncs")
      .select("id, drive_file_id, triggered_review_items, source_kind")
      .eq("drive_file_id", result.driveFileId)
      .single();
    expect(psRead.error, `dev.pending_syncs read failed: ${psRead.error?.message}`).toBeNull();

    const row = psRead.data as {
      id: string;
      drive_file_id: string;
      triggered_review_items: Array<Record<string, unknown>>;
      source_kind: string;
    };
    expect(row.source_kind).toBe("manual");
    expect(Array.isArray(row.triggered_review_items)).toBe(true);

    // The MI-7 hotel-reservations entry must be present with the right
    // section + counts (computed by runInvariants from prior=4, next=1).
    const mi7Hotels = row.triggered_review_items.find(
      (t) => t.invariant === "MI-7" && t.section === "hotel_reservations",
    );
    expect(
      mi7Hotels,
      "MI-7 SECTION_SHRINKAGE for hotel_reservations must be in triggered_review_items",
    ).toBeDefined();
    expect(mi7Hotels?.prior_count).toBe(4);
    expect(mi7Hotels?.new_count).toBe(1);

    // MI-7-hotels should be the ONLY MI-7 entry (transportation/rooms/contacts
    // arrays are identical between prior and next, so they must not trigger).
    const allMi7 = row.triggered_review_items.filter((t) => t.invariant === "MI-7");
    expect(allMi7).toHaveLength(1);
  });
});

describe("AC-3.3: MI-1_VERSION_DETECTION_FAILED routes to dev.pending_ingestions", () => {
  test("synthetic markdown without version markers → last_error_code = MI-1_VERSION_DETECTION_FAILED", async () => {
    // Drive the action end-to-end. parseAndStage will: read the temp fixture
    // (zero version markers) → parseSheet → MI-1 hardError fires →
    // effectiveOutcome='hard_fail' → dev_phase1_stage routes to
    // dev.pending_ingestions with the canonical MI-1 code.
    const result = await parseAndStage(TEMP_FIXTURE_NAME);

    // PRIMARY anti-tautology assertion: read back from dev.pending_ingestions
    // and verify last_error_code is what parseSheet's version-detection branch
    // produced — NOT a value we inserted directly. This is the canonical
    // AC-3.3 check: the row landed in the right table with the right code.
    const piRead = await admin
      .schema("dev")
      .from("pending_ingestions")
      .select("id, drive_file_id, drive_file_name, last_error_code, last_error_message")
      .eq("drive_file_id", result.driveFileId)
      .single();
    expect(piRead.error, `dev.pending_ingestions read failed: ${piRead.error?.message}`).toBeNull();

    const row = piRead.data as {
      id: string;
      drive_file_id: string;
      drive_file_name: string;
      last_error_code: string;
      last_error_message: string | null;
    };
    expect(row.drive_file_name).toBe(TEMP_FIXTURE_NAME);
    expect(row.last_error_code).toBe("MI-1_VERSION_DETECTION_FAILED");
    expect(row.last_error_message ?? "").toContain("version");

    // No row should have been written to dev.pending_syncs for this run.
    const psRead = await admin
      .schema("dev")
      .from("pending_syncs")
      .select("id", { count: "exact", head: true })
      .eq("drive_file_id", result.driveFileId);
    expect(psRead.error).toBeNull();
    expect(psRead.count ?? 0).toBe(0);

    // Defense-in-depth: the in-memory action result must agree with the DB
    // readback. If these diverge, parseAndStage's return value lies about
    // what it stored — a class of bug the DB-only assertion above would not
    // catch on its own.
    expect(result.outcome).toBe("hard_fail");
    expect(result.staging?.kind).toBe("pending_ingestion");
    expect(result.hardFailCodes).toContain("MI-1_VERSION_DETECTION_FAILED");
  });
});

// ============================================================================
// Round 5 Finding 1 — outcome-flip mutual-exclusion regression
// ============================================================================
//
// dev_phase1_stage MUST clear the opposite-table live row when an outcome
// flips between hard_fail and pass/stage for the same drive_file_id. Prior
// to the fix, a hard_fail then a pass left a stale dev.pending_ingestions
// row; getStagedResult (which checks pending_ingestions first) reported the
// stale failure even though the latest run succeeded. Reverse direction
// left a stale dev.pending_syncs row.
//
// Both flip directions must use the SAME synthetic drive_file_id across
// the two parseAndStage calls so the conflict path is exercised. The
// fixture file is rewritten between calls — same filename → same
// drive_file_id (`dev:fixture:<filename>`) → same advisory-lock key → same
// conflict target on the partial unique index.
//
// Cross-check: getStagedResult is the consumer that depends on the mutual-
// exclusion invariant (app/admin/dev/actions.ts:286-289 reads pending_
// ingestions first, then pending_syncs, and assumes only one will hit).
// The tests below assert each direction's post-state via DIRECT db reads
// AND via getStagedResult, so a regression in either the RPC's DELETE
// statements OR the consumer's ordering would surface.
const FLIP_FIXTURE_NAME = "_temp-flip-test.md";
const FLIP_DRIVE_FILE_ID = `dev:fixture:${FLIP_FIXTURE_NAME}`;

// Corpus-derived "valid" markdown for the pass branch of the flip tests.
// Synthesizing a fully-passing v4 markdown by hand is brittle (the parser
// expects very specific CREW/DATES block structures); copying a real
// fixture's bytes is the honest path. We use 2026-03-rpas-central-four-
// seasons.md because it's a known-clean v4 fixture with crew, rooms,
// dates, and zero hardErrors (verified by the parser-corpus probe).
async function readValidV4(): Promise<string> {
  return await readFile(join(FIXTURE_DIR, "2026-03-rpas-central-four-seasons.md"), "utf8");
}

const NO_VERSION_MARKDOWN =
  "# Some Document Title\n\nThis markdown blob contains no FXAV sheet template markers.\n";

describe("Round 5 Finding 1 — dev_phase1_stage clears opposite-table live row on outcome flip", () => {
  beforeEach(async () => {
    await rm(join(FIXTURE_DIR, FLIP_FIXTURE_NAME), { force: true });
  });
  afterAll(async () => {
    await rm(join(FIXTURE_DIR, FLIP_FIXTURE_NAME), { force: true });
  });

  test("hard_fail → pass: stale pending_ingestions row is cleared, getStagedResult returns pass", async () => {
    // Step 1: stage with no-version markdown → hard_fail → pending_ingestions.
    await writeFile(join(FIXTURE_DIR, FLIP_FIXTURE_NAME), NO_VERSION_MARKDOWN, "utf8");
    const r1 = await parseAndStage(FLIP_FIXTURE_NAME);
    expect(r1.outcome, "step 1 must hard-fail (no version markers)").toBe("hard_fail");
    expect(r1.staging?.kind).toBe("pending_ingestion");

    // Sanity: pending_ingestions has a live row, pending_syncs does not.
    const ing1 = await admin
      .schema("dev")
      .from("pending_ingestions")
      .select("id", { count: "exact", head: true })
      .eq("drive_file_id", FLIP_DRIVE_FILE_ID)
      .is("wizard_session_id", null);
    expect(ing1.count).toBe(1);
    const syn1 = await admin
      .schema("dev")
      .from("pending_syncs")
      .select("id", { count: "exact", head: true })
      .eq("drive_file_id", FLIP_DRIVE_FILE_ID)
      .is("wizard_session_id", null);
    expect(syn1.count).toBe(0);

    // Step 2: rewrite same fixture as valid v4 → pass → pending_syncs.
    // The fix-under-test: dev_phase1_stage's pass branch must DELETE the
    // stale pending_ingestions row before the new pending_syncs upsert.
    await writeFile(join(FIXTURE_DIR, FLIP_FIXTURE_NAME), await readValidV4(), "utf8");
    const r2 = await parseAndStage(FLIP_FIXTURE_NAME);
    expect(r2.outcome, "step 2 must NOT be hard_fail — valid v4 markdown should pass").not.toBe(
      "hard_fail",
    );
    expect(r2.staging?.kind).toBe("pending_sync");

    // Mutual-exclusion invariant: pending_ingestions must be EMPTY.
    const ing2 = await admin
      .schema("dev")
      .from("pending_ingestions")
      .select("id", { count: "exact", head: true })
      .eq("drive_file_id", FLIP_DRIVE_FILE_ID)
      .is("wizard_session_id", null);
    expect(
      ing2.count,
      "stale pending_ingestions row must be cleared on outcome flip (Round 5 Finding 1)",
    ).toBe(0);
    const syn2 = await admin
      .schema("dev")
      .from("pending_syncs")
      .select("id", { count: "exact", head: true })
      .eq("drive_file_id", FLIP_DRIVE_FILE_ID)
      .is("wizard_session_id", null);
    expect(syn2.count).toBe(1);

    // Consumer-level cross-check: getStagedResult must return the FRESH
    // pass outcome, not the stale hard_fail. A bug in the RPC's DELETE
    // would still leave the stale pending_ingestions row, and
    // getStagedResult (which reads ingestions first) would incorrectly
    // report hard_fail.
    const { getStagedResult } = await import("@/app/admin/dev/actions");
    const consumed = await getStagedResult(FLIP_FIXTURE_NAME);
    expect(consumed, "getStagedResult must return a row").not.toBeNull();
    expect(
      consumed?.outcome,
      "getStagedResult must reflect the LATEST (pass) outcome, not the stale hard_fail",
    ).not.toBe("hard_fail");
    expect(consumed?.staging?.kind).toBe("pending_sync");
  });

  test("pass → hard_fail: stale pending_syncs row is cleared, getStagedResult returns hard_fail", async () => {
    // Step 1: valid v4 → pass → pending_syncs.
    await writeFile(join(FIXTURE_DIR, FLIP_FIXTURE_NAME), await readValidV4(), "utf8");
    const r1 = await parseAndStage(FLIP_FIXTURE_NAME);
    expect(r1.outcome, "step 1 must NOT be hard_fail").not.toBe("hard_fail");
    expect(r1.staging?.kind).toBe("pending_sync");

    const syn1 = await admin
      .schema("dev")
      .from("pending_syncs")
      .select("id", { count: "exact", head: true })
      .eq("drive_file_id", FLIP_DRIVE_FILE_ID)
      .is("wizard_session_id", null);
    expect(syn1.count).toBe(1);
    const ing1 = await admin
      .schema("dev")
      .from("pending_ingestions")
      .select("id", { count: "exact", head: true })
      .eq("drive_file_id", FLIP_DRIVE_FILE_ID)
      .is("wizard_session_id", null);
    expect(ing1.count).toBe(0);

    // Step 2: rewrite same fixture as no-version → hard_fail → pending_ingestions.
    // The fix-under-test: dev_phase1_stage's hard_fail branch must DELETE
    // the stale pending_syncs row before the new pending_ingestions upsert.
    await writeFile(join(FIXTURE_DIR, FLIP_FIXTURE_NAME), NO_VERSION_MARKDOWN, "utf8");
    const r2 = await parseAndStage(FLIP_FIXTURE_NAME);
    expect(r2.outcome, "step 2 must hard_fail").toBe("hard_fail");
    expect(r2.staging?.kind).toBe("pending_ingestion");

    // Mutual-exclusion invariant: pending_syncs must be EMPTY.
    const syn2 = await admin
      .schema("dev")
      .from("pending_syncs")
      .select("id", { count: "exact", head: true })
      .eq("drive_file_id", FLIP_DRIVE_FILE_ID)
      .is("wizard_session_id", null);
    expect(
      syn2.count,
      "stale pending_syncs row must be cleared on outcome flip (Round 5 Finding 1)",
    ).toBe(0);
    const ing2 = await admin
      .schema("dev")
      .from("pending_ingestions")
      .select("id", { count: "exact", head: true })
      .eq("drive_file_id", FLIP_DRIVE_FILE_ID)
      .is("wizard_session_id", null);
    expect(ing2.count).toBe(1);

    // Consumer-level cross-check: getStagedResult must return the FRESH
    // hard_fail outcome, not the stale pass.
    const { getStagedResult } = await import("@/app/admin/dev/actions");
    const consumed = await getStagedResult(FLIP_FIXTURE_NAME);
    expect(consumed, "getStagedResult must return a row").not.toBeNull();
    expect(
      consumed?.outcome,
      "getStagedResult must reflect the LATEST (hard_fail) outcome, not the stale pass",
    ).toBe("hard_fail");
    expect(consumed?.staging?.kind).toBe("pending_ingestion");
  });
});

// ============================================================================
// Round 6 Finding 1 — per-show advisory lock IS held during dev_phase1_stage
// ============================================================================
//
// AGENTS.md §1.2 (non-negotiable): every code path that mutates pending_*
// rows runs inside `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))`,
// AND tests assert the lock is held. Prior to this test, the suite only
// commented that the lock was acquired; if a future refactor deleted the
// `perform pg_advisory_xact_lock(...)` line at
// supabase/migrations/20260502000000_dev_schema_clone.sql:405, every existing
// test would still pass because none observed pg_locks.
//
// Approach (Codex Round 6 option (b) — pg_locks query):
//   1. BEGIN a transaction.
//   2. SELECT dev_phase1_stage(...) — the function acquires
//      pg_advisory_xact_lock; because it's xact-scoped the lock stays held
//      until COMMIT/ROLLBACK.
//   3. Query pg_locks within the SAME transaction (filtered to this
//      backend's pid + locktype='advisory') and confirm exactly one
//      Exclusive advisory lock granted, with objid matching
//      `hashtext('show:' || drive_file_id)::oid`.
//   4. ROLLBACK so no dev.* rows persist.
// Negative-control: comment out the perform pg_advisory_xact_lock line in
// the RPC and re-run; this test fails with a message naming AGENTS.md §1.2.
//
// Implementation note: supabase-js doesn't expose multi-statement
// transactions cleanly, so this test uses psql via execFileSync — same
// pattern as tests/db/checks.test.ts. No new dependency.

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runPsqlAt(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

describe("Round 6 Finding 1 — dev_phase1_stage holds the per-show advisory lock (AGENTS.md §1.2)", () => {
  test("calling dev_phase1_stage acquires pg_advisory_xact_lock with objid = hashtext('show:'||drive_file_id)", () => {
    // Arbitrary but recognizable drive_file_id for this assertion. Keeping
    // it under a `dev:assert-lock:` prefix so it's distinct from real
    // fixture-derived IDs and easy to find in pg_locks if a debugger needs
    // to inspect.
    const driveFileId = "dev:assert-lock:round6-finding1";

    // Single SQL transaction:
    //   - SELECT dev_phase1_stage(...) — acquires the advisory lock under
    //     this session's xact.
    //   - SELECT classid, objid::bigint, mode, granted FROM pg_locks
    //     WHERE pid = pg_backend_pid() AND locktype = 'advisory' — observe
    //     the lock(s) held by THIS backend right now.
    //   - SELECT hashtext('show:' || $1)::int::bigint — the expected key.
    //   - All wrapped in a single ROLLBACK so no dev.* state leaks.
    //
    // psql -At with FORMAT json gives one row per query; we delimit with a
    // SELECT '---' marker for easy splitting in JS.
    // Build the SQL via String.raw so JS doesn't interpret backslashes in
    // the template literal. JSON literals use single-quoted strings (no
    // dollar-quote conflict with the outer expression). The drive_file_id
    // is interpolated via JS template — safe because the value is a known
    // constant defined above (no untrusted input).
    // Round 7 Finding 1 (Codex): the prior filter only matched objid (low
    // 32 bits), so a refactor to the two-arg variant
    // pg_advisory_xact_lock(0, hashtext(...)) would still pass — same low
    // bits, but classid=0 instead of the high bits of the bigint, AND
    // objsubid=2 instead of 1. Tighten to the full (classid, objid,
    // objsubid) tuple, derived in SQL from the same hashtext expression
    // so client-side bit-math is avoided.
    //
    // Postgres pg_locks representation for one-arg bigint advisory lock
    // (verified via probe — see commit message):
    //   classid  = HIGH 32 bits of the bigint key (as oid, sign-extended
    //              for negative hashtext outputs → 4294967295 = 0xFFFFFFFF)
    //   objid    = LOW  32 bits of the bigint key (as oid)
    //   objsubid = 1 (one-arg variant); two-arg variant is 2
    const sql = String.raw`
      begin;
      select dev_phase1_stage(
        '${driveFileId}',           -- p_drive_file_id
        'lock-probe.md',            -- p_drive_file_name
        '{}'::jsonb,                -- p_parse_result (empty object)
        'pass',                     -- p_outcome
        '[]'::jsonb,                -- p_triggered_items
        null,                       -- p_hard_error_code
        null,                       -- p_hard_error_message
        '[]'::jsonb,                -- p_warnings
        'lock probe',               -- p_warning_summary
        now()                       -- p_staged_modified_time
      );
      select '---LOCKS---';
      with k as (
        select hashtext('show:' || '${driveFileId}')::bigint as kb
      ),
      expected as (
        select ((kb >> 32) & x'FFFFFFFF'::bigint)::oid as expected_classid,
               (kb & x'FFFFFFFF'::bigint)::oid         as expected_objid
          from k
      )
      select count(*) from pg_locks, expected
        where pid = pg_backend_pid()
          and locktype = 'advisory'
          and mode = 'ExclusiveLock'
          and granted = true
          and classid = expected.expected_classid     -- HIGH 32 bits
          and objid   = expected.expected_objid       -- LOW  32 bits
          and objsubid = 1;                            -- one-arg variant
      select '---ANY_ADVISORY---';
      select count(*) from pg_locks
        where pid = pg_backend_pid()
          and locktype = 'advisory';
      rollback;
    `;
    const out = runPsqlAt(sql);

    // Parse: split on the marker labels. psql -At returns one value per
    // line, with an empty line between SELECT statements is NOT emitted —
    // values come back contiguous; markers tell us which is which.
    const lines = out
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const lockMarkerIdx = lines.indexOf("---LOCKS---");
    const anyMarkerIdx = lines.indexOf("---ANY_ADVISORY---");
    expect(lockMarkerIdx, "psql output must contain ---LOCKS--- marker").toBeGreaterThan(-1);
    expect(anyMarkerIdx, "psql output must contain ---ANY_ADVISORY--- marker").toBeGreaterThan(
      lockMarkerIdx,
    );

    const expectedLockCount = Number(lines[lockMarkerIdx + 1] ?? "0");
    const totalAdvisoryCount = Number(lines[anyMarkerIdx + 1] ?? "0");

    // CORE assertion: exactly one ExclusiveLock advisory lock granted with
    // objid = hashtext('show:' || drive_file_id). If a future refactor
    // removes the `perform pg_advisory_xact_lock(...)` line at
    // supabase/migrations/20260502000000_dev_schema_clone.sql:405, this
    // assertion fails with the count being 0.
    expect(
      expectedLockCount,
      "AGENTS.md §1.2: dev_phase1_stage MUST hold pg_advisory_xact_lock(hashtext('show:'||drive_file_id)) " +
        "with the EXACT (classid=high32, objid=low32, objsubid=1) tuple of the one-arg-bigint variant. " +
        "Got 0 matching locks. Possible causes (any one breaks AGENTS.md §1.2): (a) the lock call was removed " +
        "from supabase/migrations/20260502000000_dev_schema_clone.sql; (b) the call switched to the two-arg " +
        "variant pg_advisory_xact_lock(c, k) — that lock has objsubid=2 and a different classid; " +
        "(c) the key composition changed (e.g., dropped the 'show:' prefix or used a different column).",
    ).toBe(1);

    // Diagnostic: confirm there are no UNEXPECTED advisory locks the test
    // missed. If totalAdvisoryCount > expectedLockCount, the RPC may be
    // taking additional locks the assertion doesn't account for — the
    // test would still pass on the core assertion but the diagnostic
    // prompts review.
    expect(
      totalAdvisoryCount,
      "diagnostic: total advisory locks held by this backend should match the keyed lock count exactly",
    ).toBe(expectedLockCount);
  });

  test("different drive_file_ids produce different lock keys (full-tuple membership, no collision)", () => {
    // Defense-in-depth: confirms the lock key actually depends on
    // drive_file_id. If the RPC accidentally locked on a constant or on
    // the wrong column, both calls would acquire the same key.
    //
    // Round 7 Finding 1 tightening: instead of `count(distinct objid)`
    // (which would still pass for a refactor to two-arg variant whose
    // low bits collide), build the EXACT expected (classid, objid,
    // objsubid) tuple set for both drive_file_ids and assert pg_locks
    // contains BOTH tuples granted to the current backend.
    const sql = String.raw`
      begin;
      select dev_phase1_stage(
        'dev:assert-lock:show-A', 'probe-A.md', '{}'::jsonb, 'pass',
        '[]'::jsonb, null, null, '[]'::jsonb, 'probe', now()
      );
      select dev_phase1_stage(
        'dev:assert-lock:show-B', 'probe-B.md', '{}'::jsonb, 'pass',
        '[]'::jsonb, null, null, '[]'::jsonb, 'probe', now()
      );
      select '---MATCHED---';
      with expected as (
        select ((kb >> 32) & x'FFFFFFFF'::bigint)::oid as classid,
               (kb & x'FFFFFFFF'::bigint)::oid         as objid,
               1::int                                  as objsubid
          from (values
            (hashtext('show:dev:assert-lock:show-A')::bigint),
            (hashtext('show:dev:assert-lock:show-B')::bigint)
          ) as v(kb)
      )
      select count(*) from pg_locks l
        join expected e
          on l.classid = e.classid
         and l.objid = e.objid
         and l.objsubid = e.objsubid
        where l.pid = pg_backend_pid()
          and l.locktype = 'advisory'
          and l.mode = 'ExclusiveLock'
          and l.granted = true;
      rollback;
    `;
    const out = runPsqlAt(sql);
    const lines = out
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const matchedIdx = lines.indexOf("---MATCHED---");
    const matchedCount = Number(lines[matchedIdx + 1] ?? "0");
    expect(
      matchedCount,
      "AGENTS.md §1.2 specifies PER-SHOW lock granularity with the one-arg-bigint advisory lock variant. " +
        "Both expected (classid, objid, objsubid=1) tuples for show-A and show-B must be present in pg_locks. " +
        "If the RPC switched to the two-arg variant or a fixed key, this count would be 0 or 1.",
    ).toBe(2);
  });
});
