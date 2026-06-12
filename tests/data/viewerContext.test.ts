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
import { resolveViewerContext } from "@/lib/data/viewerContext";
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
    viewerVersionToken: "",
    diagrams: null,
    openingReelHasVideo: false,
    lastSyncedAt: null,
    lastSyncStatus: null,
    tileErrors: {},
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

  test("crew viewer with no matching row → falls back to none restrictions + empty flags + null name", () => {
    // This branch matches the original IIFE behavior: when the crew row
    // is missing (shouldn't happen post-getShowForViewer cross-show
    // check, but the IIFE guards anyway), the page renders with empty
    // flags so no scope tile unlocks. Defense-in-depth.
    const viewer: Viewer = { kind: "crew", crewMemberId: "crew-missing" };
    const data = makeData([crewRowAlice]);
    const ctx = resolveViewerContext(viewer, data);

    expect(ctx.viewerCrew).toBeNull();
    expect(ctx.viewerFlags).toEqual([]);
    expect(ctx.viewerName).toBeNull();
    expect(ctx.dateRestriction).toEqual({ kind: "none" });
    expect(ctx.stageRestriction).toEqual({ kind: "none" });
    expect(ctx.isAdmin).toBe(false);
  });

  test("crew viewer with UNDEFINED crewMembers array → same fallback, no throw (defense-in-depth)", () => {
    // Malformed projection / degraded data layer: crewMembers missing
    // entirely, not just the row. Per the live type (getShowForViewer.ts:96)
    // and its only constructor (`(crewRes.data ?? []).map`, line 305) this
    // can't happen through the real helper today — the guard pins the
    // same tolerance the missing-row branch above already has, so an
    // unguarded `.find` revert fails here with a TypeError.
    const viewer: Viewer = { kind: "crew", crewMemberId: "crew-alice" };
    const data = makeData(undefined as unknown as ShowForViewer["crewMembers"]);

    const ctx = resolveViewerContext(viewer, data);

    expect(ctx.viewerCrew).toBeNull();
    expect(ctx.viewerFlags).toEqual([]);
    expect(ctx.viewerName).toBeNull();
    expect(ctx.dateRestriction).toEqual({ kind: "none" });
    expect(ctx.stageRestriction).toEqual({ kind: "none" });
    expect(ctx.isAdmin).toBe(false);
  });
});
