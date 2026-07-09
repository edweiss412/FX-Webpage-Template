/**
 * Tests for `lib/data/viewerContext.ts` — pure helper extracted from the
 * inline IIFE in `app/show/[slug]/page.tsx` (M4 catch-up review,
 * Important 2). The helper takes a freshly-resolved `Viewer` plus the
 * `ShowForViewer` projection and returns the per-viewer context the tile
 * grid needs (date/stage restriction, the active `viewerCrew` row,
 * synthesized admin flags, viewer name, isAdmin).
 *
 * Pure: NO I/O, NO async — the page already awaited
 * `getShowForViewer(showId, viewer)` before calling this.
 *
 * The three plan-listed cases:
 *   1. admin viewer (kind: 'admin') → null viewerCrew, all-flags
 *      synthesized, null viewerName, isAdmin true.
 *   2. crew viewer with valid match → the matched row's flags + name
 *      flow through; isAdmin false.
 *   3. admin_preview viewer → resolves identically to crew (binds the
 *      crewMemberId to a row, viewerCrew populated, isAdmin false).
 *
 * The synthesized admin flags MUST be sourced from
 * `SCOPE_TILE_UNLOCKING_FLAGS` (Important 3). The test asserts the array
 * is exactly the constant — magic strings here would defeat the
 * extraction.
 */
import { describe, expect, test } from "vitest";
import { MalformedProjectionError, UnmatchedViewerError, resolveViewerContext } from "@/lib/data/viewerContext";
import type { Viewer, ShowForViewer } from "@/lib/data/getShowForViewer";
import type { RoleFlag } from "@/lib/parser/types";
import { SCOPE_TILE_UNLOCKING_FLAGS } from "@/lib/visibility/scopeTiles";

// Minimal projection shape — the helper only reads `crewMembers`. The
// rest of the ShowForViewer fields are unused by the helper today, but
// they MUST be carried in the type so the page can pass `data` straight
// through. Tests construct a stub that satisfies the type.
function makeData(crewMembers: ShowForViewer["crewMembers"]): ShowForViewer {
  return {
    show: {} as ShowForViewer["show"],
    crewMembers,
    hotelReservations: [],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: null,
    viewerName: null,
    viewerFlightInfo: null,
    viewerVersionToken: "",
    diagrams: null,
    openingReelHasVideo: false,
    lastSyncedAt: null,
    lastSyncStatus: null,
    tileErrors: {},
    runOfShow: null,
    driveFileId: null,
    sourceAnchors: {},
  };
}

const crewRowAlice: ShowForViewer["crewMembers"][number] = {
  id: "crew-alice",
  name: "Alice",
  email: null,
  phone: null,
  role: "A1",
  roleFlags: ["A1"] as RoleFlag[],
  dateRestriction: { kind: "explicit", days: ["2026-04-15"] },
  stageRestriction: { kind: "none" },
};

const crewRowBob: ShowForViewer["crewMembers"][number] = {
  id: "crew-bob",
  name: "Bob",
  email: null,
  phone: null,
  role: "LEAD",
  roleFlags: ["LEAD"] as RoleFlag[],
  dateRestriction: { kind: "none" },
  stageRestriction: { kind: "explicit", stages: ["Show"] },
};

describe("resolveViewerContext", () => {
  test("admin viewer → null viewerCrew, all-flags synthesized from SCOPE_TILE_UNLOCKING_FLAGS, null viewerName, isAdmin true", () => {
    const viewer: Viewer = { kind: "admin" };
    const data = makeData([crewRowAlice, crewRowBob]);
    const ctx = resolveViewerContext(viewer, data);

    expect(ctx.viewerCrew).toBeNull();
    expect(ctx.dateRestriction).toEqual({ kind: "none" });
    expect(ctx.stageRestriction).toEqual({ kind: "none" });
    expect(ctx.isAdmin).toBe(true);
    expect(ctx.viewerName).toBeNull();
    // Synthesized flags mirror the canonical constant (Important 3).
    expect(ctx.viewerFlags).toEqual([...SCOPE_TILE_UNLOCKING_FLAGS]);
  });

  test("crew viewer with valid match → returns crew row's flags, name, and per-crew restrictions; isAdmin false", () => {
    const viewer: Viewer = { kind: "crew", crewMemberId: "crew-alice" };
    const data = makeData([crewRowAlice, crewRowBob]);
    const ctx = resolveViewerContext(viewer, data);

    expect(ctx.viewerCrew).toBe(crewRowAlice);
    expect(ctx.viewerFlags).toEqual(["A1"]);
    expect(ctx.viewerName).toBe("Alice");
    expect(ctx.dateRestriction).toEqual({
      kind: "explicit",
      days: ["2026-04-15"],
    });
    expect(ctx.stageRestriction).toEqual({ kind: "none" });
    expect(ctx.isAdmin).toBe(false);
  });

  test("admin_preview viewer → resolves like crew (matched row, real flags, real name, isAdmin false)", () => {
    const viewer: Viewer = {
      kind: "admin_preview",
      crewMemberId: "crew-bob",
    };
    const data = makeData([crewRowAlice, crewRowBob]);
    const ctx = resolveViewerContext(viewer, data);

    expect(ctx.viewerCrew).toBe(crewRowBob);
    expect(ctx.viewerFlags).toEqual(["LEAD"]);
    expect(ctx.viewerName).toBe("Bob");
    expect(ctx.dateRestriction).toEqual({ kind: "none" });
    expect(ctx.stageRestriction).toEqual({
      kind: "explicit",
      stages: ["Show"],
    });
    expect(ctx.isAdmin).toBe(false);
  });

  test("crew viewer with no matching row in a well-formed array THROWS UnmatchedViewerError (8.2: was the {none} whole-show fail-open)", () => {
    // 8.2 Point C reverses the old defense-in-depth {none} fallback: an
    // unmatched crew id in a WELL-FORMED array now fails CLOSED. Returning
    // {none} = whole-show visibility (every day, every phase) was fail-OPEN.
    const viewer: Viewer = { kind: "crew", crewMemberId: "crew-missing" };
    const data = makeData([crewRowAlice]); // well-formed array, id absent
    expect(() => resolveViewerContext(viewer, data)).toThrow(UnmatchedViewerError);
  });

  test("admin_preview viewer with no matching row in a well-formed array ALSO throws UnmatchedViewerError (same fail-closed limb)", () => {
    const viewer: Viewer = { kind: "admin_preview", crewMemberId: "crew-missing" };
    const data = makeData([crewRowAlice]);
    expect(() => resolveViewerContext(viewer, data)).toThrow(UnmatchedViewerError);
  });

  test("admin viewer with an empty well-formed array still returns {none} + all-flags (unchanged)", () => {
    const ctx = resolveViewerContext({ kind: "admin" } as Viewer, makeData([]));
    expect(ctx.dateRestriction).toEqual({ kind: "none" });
    expect(ctx.viewerFlags).toEqual([...SCOPE_TILE_UNLOCKING_FLAGS]);
    expect(ctx.isAdmin).toBe(true);
  });

  test("crew viewer with UNDEFINED crewMembers array → throws MalformedProjectionError (fail closed)", () => {
    // Malformed projection / degraded data layer: crewMembers missing
    // entirely, not just the row. Restrictions could not be VERIFIED here
    // — routing this into the none-restrictions fallback would render
    // Right Now / Schedule / Pack List unrestricted (fail-OPEN on
    // per-crew visibility). The helper must throw the typed error so the
    // render path can surface the existing infra TerminalFailure arm.
    // Concrete failure mode caught: reverting the throw to the previous
    // `?.`-fallback silently grants an unrestricted page.
    const viewer: Viewer = { kind: "crew", crewMemberId: "crew-alice" };
    const data = makeData(undefined as unknown as ShowForViewer["crewMembers"]);

    expect(() => resolveViewerContext(viewer, data)).toThrowError(MalformedProjectionError);
  });

  test("admin_preview viewer with NON-ARRAY crewMembers → throws MalformedProjectionError (fail closed)", () => {
    // Same class, different malformation shape (object instead of array)
    // and the other restriction-reading viewer kind. Array.isArray is the
    // guard, not truthiness — a truthy non-array must still fail closed.
    const viewer: Viewer = {
      kind: "admin_preview",
      crewMemberId: "crew-bob",
    };
    const data = makeData({ length: 1 } as unknown as ShowForViewer["crewMembers"]);

    expect(() => resolveViewerContext(viewer, data)).toThrowError(MalformedProjectionError);
  });

  test("admin viewer with UNDEFINED crewMembers → does NOT throw (admin never reads crewMembers here)", () => {
    // kind: 'admin' resolves to the synthesized all-flags context without
    // touching crewMembers; the fail-closed guard must not regress that.
    const viewer: Viewer = { kind: "admin" };
    const data = makeData(undefined as unknown as ShowForViewer["crewMembers"]);

    const ctx = resolveViewerContext(viewer, data);

    expect(ctx.viewerCrew).toBeNull();
    expect(ctx.isAdmin).toBe(true);
    expect(ctx.viewerFlags).toEqual([...SCOPE_TILE_UNLOCKING_FLAGS]);
  });
});
