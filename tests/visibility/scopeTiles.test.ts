/**
 * Tests for `lib/visibility/scopeTiles.ts` — the canonical
 * SCOPE_TILE_VISIBILITY_RULE predicates (M4 Task 4.6, plan lines 332-363).
 *
 * Single source of truth for which scope tiles a viewer sees:
 *
 *   audioScopeVisible(flags)    → true iff flags has A1, A2, or LEAD
 *   videoScopeVisible(flags)    → true iff flags has V1 or LEAD
 *   lightingScopeVisible(flags) → true iff flags has L1
 *                                 (LEAD INTENTIONALLY NOT included — §8.1)
 *   financialsVisible(flags, isAdmin)
 *                               → true iff isAdmin OR flags has LEAD
 *
 * Static-analysis hygiene: the predicate file MUST document the
 * "no caller-supplied role_flags trust" header. The flags array always
 * originates in `getShowForViewer` (freshly read from `crew_members.role_flags`),
 * never from caller-controlled input.
 *
 * The 6 plan-listed cases (A1 / V1 / L1 / LEAD / LEAD+A1 / LEAD+L1)
 * + a CAM_OP negative case + the financialsVisible admin/LEAD/A1 matrix
 * are all exercised below.
 */
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  audioScopeVisible,
  videoScopeVisible,
  lightingScopeVisible,
  financialsVisible,
  transportTileVisible,
  SCOPE_TILE_UNLOCKING_FLAGS,
} from "@/lib/visibility/scopeTiles";
import type { RoleFlag, TransportationRow } from "@/lib/parser/types";

// Valid RoleFlag values per lib/parser/types.ts:36-59. Kept in sync via
// the SCOPE_TILE_UNLOCKING_FLAGS test below — the `satisfies RoleFlag[]`
// in the source carries most of the contract; this list is the runtime
// backstop in case the type goes out of date.
const VALID_ROLE_FLAGS: RoleFlag[] = [
  "LEAD",
  "A1",
  "A2",
  "V1",
  "L1",
  "GS",
  "BO",
  "ONLY",
  "CAM_OP",
  "PTZ",
  "LED",
  "STREAM",
  "GAV",
  "FLOATER",
  "FLOOR",
  "SHOW_CALLER",
  "GREEN_ROOM",
  "OWNER",
  "CONTENT_CREATION",
];

describe("scope-tile visibility predicates (Task 4.6)", () => {
  test("['A1'] viewer → Audio visible; Video and Lighting hidden", () => {
    const flags: RoleFlag[] = ["A1"];
    expect(audioScopeVisible(flags)).toBe(true);
    expect(videoScopeVisible(flags)).toBe(false);
    expect(lightingScopeVisible(flags)).toBe(false);
  });

  test("['A2'] viewer → Audio visible (A2 also unlocks Audio per §8.1)", () => {
    const flags: RoleFlag[] = ["A2"];
    expect(audioScopeVisible(flags)).toBe(true);
    expect(videoScopeVisible(flags)).toBe(false);
    expect(lightingScopeVisible(flags)).toBe(false);
  });

  test("['V1'] viewer → Video visible; Audio and Lighting hidden", () => {
    const flags: RoleFlag[] = ["V1"];
    expect(audioScopeVisible(flags)).toBe(false);
    expect(videoScopeVisible(flags)).toBe(true);
    expect(lightingScopeVisible(flags)).toBe(false);
  });

  test("['L1'] viewer → Lighting visible; Audio and Video hidden", () => {
    const flags: RoleFlag[] = ["L1"];
    expect(audioScopeVisible(flags)).toBe(false);
    expect(videoScopeVisible(flags)).toBe(false);
    expect(lightingScopeVisible(flags)).toBe(true);
  });

  test("['LEAD'] viewer → Audio AND Video visible; Lighting hidden (LEAD does NOT include L1)", () => {
    const flags: RoleFlag[] = ["LEAD"];
    expect(audioScopeVisible(flags)).toBe(true);
    expect(videoScopeVisible(flags)).toBe(true);
    expect(lightingScopeVisible(flags)).toBe(false);
  });

  test("['LEAD','A1'] viewer → Audio AND Video visible; Lighting hidden (compound)", () => {
    const flags: RoleFlag[] = ["LEAD", "A1"];
    expect(audioScopeVisible(flags)).toBe(true);
    expect(videoScopeVisible(flags)).toBe(true);
    expect(lightingScopeVisible(flags)).toBe(false);
  });

  test("['LEAD','L1'] viewer → Audio AND Video AND Lighting visible (Lighting from L1, not LEAD)", () => {
    const flags: RoleFlag[] = ["LEAD", "L1"];
    expect(audioScopeVisible(flags)).toBe(true);
    expect(videoScopeVisible(flags)).toBe(true);
    expect(lightingScopeVisible(flags)).toBe(true);
  });

  test("['CAM_OP'] viewer → no scope tiles (negative control: irrelevant flag unlocks nothing)", () => {
    const flags: RoleFlag[] = ["CAM_OP"];
    expect(audioScopeVisible(flags)).toBe(false);
    expect(videoScopeVisible(flags)).toBe(false);
    expect(lightingScopeVisible(flags)).toBe(false);
  });

  test("[] viewer (empty flags) → no scope tiles (defense in depth)", () => {
    const flags: RoleFlag[] = [];
    expect(audioScopeVisible(flags)).toBe(false);
    expect(videoScopeVisible(flags)).toBe(false);
    expect(lightingScopeVisible(flags)).toBe(false);
  });
});

describe("financialsVisible predicate (Task 4.6, supporting Task 4.8)", () => {
  test("admin sees financials regardless of flags", () => {
    expect(financialsVisible([], true)).toBe(true);
    expect(financialsVisible(["A1"], true)).toBe(true);
    expect(financialsVisible(["LEAD"], true)).toBe(true);
  });

  test("LEAD viewer (non-admin) sees financials", () => {
    expect(financialsVisible(["LEAD"], false)).toBe(true);
    expect(financialsVisible(["LEAD", "A1"], false)).toBe(true);
  });

  test("A1 viewer (non-admin, no LEAD) does NOT see financials", () => {
    expect(financialsVisible(["A1"], false)).toBe(false);
  });

  test("empty flags + non-admin → no financials", () => {
    expect(financialsVisible([], false)).toBe(false);
  });
});

describe("transportTileVisible predicate (Task 4.7, §8.1)", () => {
  const baseTransport: TransportationRow = {
    driver_name: "Cara",
    driver_phone: null,
    driver_email: null,
    vehicle: null,
    license_plate: null,
    color: null,
    parking: null,
    schedule: [
      {
        stage: "Travel In",
        date: "2026-06-01",
        time: "09:00",
        assigned_names: ["Alice"],
      },
    ],
    notes: null,
  };

  test("null transportation → predicate false (nothing to render)", () => {
    expect(
      transportTileVisible({
        transportation: null,
        viewerName: "Alice",
        isAdmin: false,
      }),
    ).toBe(false);
  });

  test("admin viewer + transportation present → predicate true (admin sees all)", () => {
    expect(
      transportTileVisible({
        transportation: baseTransport,
        viewerName: null,
        isAdmin: true,
      }),
    ).toBe(true);
  });

  test("branch 1: viewerName === driver_name → predicate true", () => {
    expect(
      transportTileVisible({
        transportation: baseTransport,
        viewerName: "Cara",
        isAdmin: false,
      }),
    ).toBe(true);
  });

  test("branch 2: viewerName in schedule[*].assigned_names (driver mismatch) → predicate true", () => {
    expect(
      transportTileVisible({
        transportation: baseTransport,
        viewerName: "Alice",
        isAdmin: false,
      }),
    ).toBe(true);
  });

  test("neither branch matches → predicate false", () => {
    expect(
      transportTileVisible({
        transportation: baseTransport,
        viewerName: "Bob",
        isAdmin: false,
      }),
    ).toBe(false);
  });

  test("null viewerName + non-admin → predicate false (defense in depth)", () => {
    expect(
      transportTileVisible({
        transportation: baseTransport,
        viewerName: null,
        isAdmin: false,
      }),
    ).toBe(false);
  });
});

describe("static-analysis: scopeTiles.ts documents the role-flag origin contract", () => {
  test("source file carries a 'no caller-supplied role_flags trust' comment header", () => {
    const src = readFileSync(path.resolve(__dirname, "../../lib/visibility/scopeTiles.ts"), "utf8");
    // The contract: the *origin* of `flags` is always
    // getShowForViewer's freshly-loaded crew_members.role_flags. The header
    // must mention that explicitly so future maintainers don't reroute the
    // predicate to take caller-controlled input. Look for the substring
    // "freshly" together with "role_flags" — both anchors must appear in
    // the documentation block at the top of the file.
    expect(src).toMatch(/freshly/i);
    expect(src).toMatch(/role_flags/);
  });
});

describe("SCOPE_TILE_UNLOCKING_FLAGS (admin all-flags synthesis constant)", () => {
  // The constant is the canonical "what flags does a bare admin viewer
  // get synthesized so every scope tile unlocks" set. It was magic-string
  // inline at app/show/[slug]/page.tsx:243 before the M4 catch-up review
  // (Important 3); future RoleFlag additions silently skipped admin
  // tiles. Now the value lives here, type-checked via `satisfies
  // RoleFlag[]`. The runtime test below is the backstop in case the
  // type-level satisfies guard is bypassed (e.g., a string cast).
  test("is non-empty and every value is a valid RoleFlag", () => {
    expect(SCOPE_TILE_UNLOCKING_FLAGS.length).toBeGreaterThan(0);
    for (const flag of SCOPE_TILE_UNLOCKING_FLAGS) {
      expect(VALID_ROLE_FLAGS).toContain(flag);
    }
  });
});
