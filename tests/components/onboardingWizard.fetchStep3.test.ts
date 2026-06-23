/**
 * tests/components/onboardingWizard.fetchStep3.test.ts (Task D1)
 *
 * Data-wiring unit tests for `fetchStep3Data`
 * (`components/admin/OnboardingWizard.tsx`). Covers spec §7.1 (thread the
 * full `parse_result` into `Step3Row.parseResult`) and §7.3 (the
 * `finishable` predicate replacing `allResolved`).
 *
 * The blocking set is the canonical 3-element set from spec §7.3:
 *   { hard_failed, live_row_conflict, discard_retryable }
 * `finishable` is true iff NO row is in a blocking status (an empty list
 * is finishable). A clean `staged` row (unchecked → Held) is NOT blocking.
 *
 * Mock pattern mirrors tests/admin/_metaInfraContract.test.ts: a hoisted
 * `dataByTable` seed drives an awaitable `.from()` builder, but here we
 * exercise the happy path (no throws) to assert the returned `rows` /
 * `finishable` shape rather than the infra_error boundary.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const seed = vi.hoisted(() => ({
  dataByTable: {} as Record<string, unknown>,
}));

type AwaitableQuery = Promise<{ data: unknown; error: null }> & {
  select: (..._args: unknown[]) => AwaitableQuery;
  eq: (..._args: unknown[]) => AwaitableQuery;
  in: (..._args: unknown[]) => AwaitableQuery;
  is: (..._args: unknown[]) => AwaitableQuery;
  order: (..._args: unknown[]) => AwaitableQuery;
  limit: (..._args: unknown[]) => AwaitableQuery;
};

function makeClient() {
  return {
    from: (table?: string) => {
      const data =
        typeof table === "string" && table in seed.dataByTable
          ? (seed.dataByTable[table] as unknown)
          : [];
      const result = { data, error: null as null };
      const builder: Partial<AwaitableQuery> = {};
      const passthrough = () => builder as AwaitableQuery;
      builder.select = passthrough;
      builder.eq = passthrough;
      builder.in = passthrough;
      builder.is = passthrough;
      builder.order = passthrough;
      builder.limit = passthrough;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (builder as unknown as { then: any }).then = (
        onfulfilled?: ((v: { data: unknown; error: null }) => unknown) | null,
      ) => (onfulfilled ? onfulfilled(result) : undefined);
      return builder as AwaitableQuery;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => makeClient(),
}));

const SESSION_ID = "00000000-0000-0000-0000-000000000001";

// Minimal-but-real ParseResult-shaped fixture: enough of the object that a
// title-only extraction (the old behavior) would NOT capture the rest, so an
// equality assertion against the full object proves the full jsonb is threaded.
const PARSE_RESULT_FIXTURE = {
  show: { title: "II - East Coast Tour" },
  crewMembers: [{ name: "Alice" }, { name: "Bob" }],
  hotelReservations: [],
  rooms: [],
  transportation: null,
  contacts: [{ name: "Doug" }],
  pullSheet: null,
  diagrams: { linkedFolder: null, embeddedImages: [] },
};

function seedManifest(rows: ReadonlyArray<{ drive_file_id: string; name: string | null; status: string }>) {
  seed.dataByTable["onboarding_scan_manifest"] = rows;
}

beforeEach(() => {
  seed.dataByTable = {};
  // Default: no pending_syncs / pending_ingestions rows unless a test seeds them.
  seed.dataByTable["pending_syncs"] = [];
  seed.dataByTable["pending_ingestions"] = [];
});

describe("fetchStep3Data — finishable predicate (§7.3)", () => {
  test.each([
    "hard_failed",
    "live_row_conflict",
    "discard_retryable",
  ])("finishable=false when any row is blocking status %s", async (blockingStatus) => {
    seedManifest([
      { drive_file_id: "dfid-clean", name: "Clean.xlsx", status: "staged" },
      { drive_file_id: "dfid-block", name: "Broken.xlsx", status: blockingStatus },
    ]);
    seed.dataByTable["pending_ingestions"] = [
      { id: "ing-1", drive_file_id: "dfid-block", last_error_code: "SOME_CODE" },
    ];

    const { fetchStep3Data } = await import("@/components/admin/OnboardingWizard");
    const result = await fetchStep3Data(SESSION_ID);

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    // Derive expectation from the fixture: a blocking status is present.
    const BLOCKING = new Set(["hard_failed", "live_row_conflict", "discard_retryable"]);
    const hasBlocking = result.rows.some((r) => BLOCKING.has(r.status));
    expect(hasBlocking).toBe(true);
    expect(result.finishable).toBe(false);
  });

  test("finishable=true when all rows are clean staged/applied", async () => {
    seedManifest([
      { drive_file_id: "dfid-1", name: "One.xlsx", status: "staged" },
      { drive_file_id: "dfid-2", name: "Two.xlsx", status: "applied" },
    ]);
    seed.dataByTable["pending_syncs"] = [
      { staged_id: "s-1", drive_file_id: "dfid-1", parse_result: PARSE_RESULT_FIXTURE },
    ];

    const { fetchStep3Data } = await import("@/components/admin/OnboardingWizard");
    const result = await fetchStep3Data(SESSION_ID);

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const BLOCKING = new Set(["hard_failed", "live_row_conflict", "discard_retryable"]);
    expect(result.rows.every((r) => !BLOCKING.has(r.status))).toBe(true);
    expect(result.finishable).toBe(true);
  });

  test("finishable=true when the manifest list is empty", async () => {
    seedManifest([]);

    const { fetchStep3Data } = await import("@/components/admin/OnboardingWizard");
    const result = await fetchStep3Data(SESSION_ID);

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.rows.length).toBe(0);
    expect(result.finishable).toBe(true);
  });
});

describe("fetchStep3Data — parse_result threading (§7.1)", () => {
  test("a staged row's Step3Row.parseResult equals the full seeded parse_result object", async () => {
    seedManifest([{ drive_file_id: "dfid-1", name: "One.xlsx", status: "staged" }]);
    seed.dataByTable["pending_syncs"] = [
      { staged_id: "s-1", drive_file_id: "dfid-1", parse_result: PARSE_RESULT_FIXTURE },
    ];

    const { fetchStep3Data } = await import("@/components/admin/OnboardingWizard");
    const result = await fetchStep3Data(SESSION_ID);

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const stagedRow = result.rows.find((r) => r.driveFileId === "dfid-1");
    expect(stagedRow).toBeDefined();
    // Full object, not just title — the assertion fails if only show.title is threaded.
    expect(stagedRow?.parseResult).toEqual(PARSE_RESULT_FIXTURE);
  });

  // FIX 1 (CRITICAL): an 'applied' row (a checked card, post-refresh) must ALSO
  // carry its full parse_result — the pending_syncs row survives approval (it is
  // deleted only at finalize), so the card has everything it needs to keep
  // rendering. The bug gated the threading on status === 'staged' only, so a
  // refreshed applied row lost its preview + checkbox and collapsed to a badge.
  test("an applied row's Step3Row.parseResult equals the full seeded parse_result object", async () => {
    seedManifest([{ drive_file_id: "dfid-applied", name: "Applied.xlsx", status: "applied" }]);
    seed.dataByTable["pending_syncs"] = [
      { staged_id: "s-a", drive_file_id: "dfid-applied", parse_result: PARSE_RESULT_FIXTURE },
    ];

    const { fetchStep3Data } = await import("@/components/admin/OnboardingWizard");
    const result = await fetchStep3Data(SESSION_ID);

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const appliedRow = result.rows.find((r) => r.driveFileId === "dfid-applied");
    expect(appliedRow).toBeDefined();
    expect(appliedRow?.status).toBe("applied");
    // Full object, not just title — fails if the threading still gates on 'staged' only.
    expect(appliedRow?.parseResult).toEqual(PARSE_RESULT_FIXTURE);
  });

  test("a non-staged row carries parseResult = null (or undefined)", async () => {
    seedManifest([{ drive_file_id: "dfid-x", name: "Other.xlsx", status: "skipped_non_sheet" }]);

    const { fetchStep3Data } = await import("@/components/admin/OnboardingWizard");
    const result = await fetchStep3Data(SESSION_ID);

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const row = result.rows.find((r) => r.driveFileId === "dfid-x");
    expect(row).toBeDefined();
    expect(row?.parseResult ?? null).toBeNull();
  });
});
