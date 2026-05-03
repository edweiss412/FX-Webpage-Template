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
import { mkdir, rm, writeFile } from "node:fs/promises";
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
    expect(mi7Hotels, "MI-7 SECTION_SHRINKAGE for hotel_reservations must be in triggered_review_items").toBeDefined();
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
