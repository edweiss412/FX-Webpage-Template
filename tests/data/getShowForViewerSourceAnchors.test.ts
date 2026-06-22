/**
 * tests/data/getShowForViewerSourceAnchors.test.ts (Task 7)
 *
 * Narrow projection-shape test: verifies that `getShowForViewer` projects
 * `shows.drive_file_id` → `driveFileId` and `shows.source_anchors` →
 * `sourceAnchors`, and that null/absent columns degrade gracefully to
 * `null` / `{}` without throwing.
 *
 * Uses a mock Supabase client (vi.mock on @/lib/supabase/server) so this test
 * runs without a live database connection — safe in CI without Supabase
 * credentials. Pattern mirrors getShowForViewer-rooms-projection.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";

// ── Compile-time assertions ──────────────────────────────────────────────────
type _HasDriveFileId = ShowForViewer["driveFileId"] extends string | null ? true : never;
type _HasSourceAnchors = ShowForViewer["sourceAnchors"] extends Record<string, SourceAnchor>
  ? true
  : never;
const _assertDriveFileId: _HasDriveFileId = true;
const _assertSourceAnchors: _HasSourceAnchors = true;

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SHOW_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const DRIVE_FILE_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345678";

const SAMPLE_SOURCE_ANCHORS: Record<string, SourceAnchor> = {
  schedule: { title: "Schedule", gid: 123456789 },
  crew: { title: "Crew", gid: 987654321, a1: "A1" },
};

function makeShowRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SHOW_ID,
    title: "Mock Show",
    client_label: "Mock Client",
    template_version: "v4",
    published: true,
    coi_status: null,
    client_contact: null,
    venue: null,
    dates: { travelIn: null, set: null, showDays: [], travelOut: null },
    schedule_phases: null,
    event_details: {},
    agenda_links: null,
    pull_sheet: null,
    diagrams: null,
    opening_reel_drive_file_id: null,
    opening_reel_drive_modified_time: null,
    opening_reel_head_revision_id: null,
    opening_reel_mime_type: null,
    last_synced_at: null,
    last_sync_status: null,
    drive_file_id: null,
    source_anchors: null,
    ...overrides,
  };
}

function buildMockClient(showRow: ReturnType<typeof makeShowRow>) {
  const tableResponses: Record<string, { data: unknown; error: null }> = {
    shows: { data: showRow, error: null },
    crew_members: { data: [], error: null },
    hotel_reservations: { data: [], error: null },
    rooms: { data: [], error: null },
    transportation: { data: null, error: null },
    contacts: { data: [], error: null },
    shows_internal: { data: null, error: null },
  };

  function makeChain(table: string): Record<string, unknown> {
    const response = tableResponses[table] ?? { data: [], error: null };
    const chain: Record<string, unknown> = {};
    const terminal = () => Promise.resolve(response);
    const self = () => chain;
    chain.select = self;
    chain.eq = self;
    chain.order = self;
    chain.limit = self;
    chain.like = self;
    chain.maybeSingle = terminal;
    chain.single = terminal;
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject);
    return chain;
  }

  return {
    from: (table: string) => makeChain(table),
    rpc: (_fn: string, _args: unknown) => Promise.resolve({ data: "1000", error: null }),
  };
}

// ── Mock setup ───────────────────────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
  showRow: null as ReturnType<typeof makeShowRow> | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => buildMockClient(mockState.showRow!),
}));

const { getShowForViewer } = await import("@/lib/data/getShowForViewer");

// ── Tests ────────────────────────────────────────────────────────────────────

describe("getShowForViewer — driveFileId + sourceAnchors projection", () => {
  beforeEach(() => {
    mockState.showRow = makeShowRow() as ReturnType<typeof makeShowRow>;
  });

  it("maps drive_file_id → driveFileId when column is populated", async () => {
    mockState.showRow = makeShowRow({ drive_file_id: DRIVE_FILE_ID });
    const out = await getShowForViewer(SHOW_ID, { kind: "admin" });
    // Expected value derived from the fixture constant — not hardcoded independently.
    expect(out.driveFileId).toBe(DRIVE_FILE_ID);
  });

  it("maps source_anchors → sourceAnchors when column is populated", async () => {
    mockState.showRow = makeShowRow({ source_anchors: SAMPLE_SOURCE_ANCHORS });
    const out = await getShowForViewer(SHOW_ID, { kind: "admin" });
    expect(out.sourceAnchors).toEqual(SAMPLE_SOURCE_ANCHORS);
  });

  it("returns driveFileId: null when drive_file_id column is null", async () => {
    mockState.showRow = makeShowRow({ drive_file_id: null });
    const out = await getShowForViewer(SHOW_ID, { kind: "admin" });
    expect(out.driveFileId).toBeNull();
  });

  it("returns sourceAnchors: {} when source_anchors column is null (no throw)", async () => {
    mockState.showRow = makeShowRow({ source_anchors: null });
    const out = await getShowForViewer(SHOW_ID, { kind: "admin" });
    expect(out.sourceAnchors).toEqual({});
  });

  it("returns sourceAnchors: {} when source_anchors column is absent (no throw)", async () => {
    // Omit the field entirely to simulate a row that doesn't include the column.
    const rowWithoutAnchors = makeShowRow();
    delete (rowWithoutAnchors as Record<string, unknown>)["source_anchors"];
    mockState.showRow = rowWithoutAnchors;
    const out = await getShowForViewer(SHOW_ID, { kind: "admin" });
    expect(out.sourceAnchors).toEqual({});
  });
});

// Suppress "unused variable" lint for compile-time sentinels.
void _assertDriveFileId;
void _assertSourceAnchors;
