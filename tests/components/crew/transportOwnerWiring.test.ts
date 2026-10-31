import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Flow 8.3b — the behavioral render test (TravelSection.transportIdPath.test.tsx) proves
// ONE section forwards data.viewerId / data.transportationOwnerIds correctly. This pins the
// value SOURCE for all four sections, CALL-SCOPED: the literals must live INSIDE the
// transportTileVisible({ ... }) object, not merely somewhere in the file (a comment / unused
// object could satisfy a file-wide regex while the real call passes null).
//
// The home body's call lives in its sibling rows module (todayRows.ts), which the section
// and its search builder share, and the quick facts make their own for parking; the Schedule and Travel search builders each make their own
// call, mirroring their section's, so each is pinned the same way.
const FILES: ReadonlyArray<{ name: string; file: string }> = [
  { name: "ScheduleSection", file: "components/crew/sections/ScheduleSection.tsx" },
  // The home body's notes gate (HomeSection renders from todayRows.ts) and its
  // parking quick fact (buildQuickFacts), crew page redesign plan Task 11.
  { name: "HomeSection notes", file: "components/crew/sections/todayRows.ts" },
  { name: "Home quick facts", file: "lib/crew/quickFacts.ts" },
  { name: "TravelSection", file: "components/crew/sections/TravelSection.tsx" },
  // Since crew search (2026-10-26) VenueSection's call lives in its rows module,
  // which the search builder shares; the delegation itself is pinned below.
  { name: "VenueSection", file: "components/crew/sections/venueRows.ts" },
  { name: "Schedule search builder", file: "lib/search/sections/schedule.ts" },
  { name: "Travel search builder", file: "lib/search/sections/travel.ts" },
];

describe("transport tile gate is wired from data, not a stale literal", () => {
  for (const { name: f, file } of FILES) {
    it(`${f} sources both id-path args from data INSIDE the transportTileVisible call`, () => {
      const src = readFileSync(path.join(process.cwd(), file), "utf8");
      // Scan EVERY transportTileVisible({...}) object (a JSDoc comment can also contain the
      // call token — e.g. TravelSection's block comment — so the FIRST match isn't reliably
      // the real call). Require at least one call body that wires BOTH id-path args from data.
      const bodies = [...src.matchAll(/transportTileVisible\(\{([\s\S]*?)\}\)/g)].map((m) => m[1]!);
      expect(bodies.length, `${f} must call transportTileVisible({...})`).toBeGreaterThan(0);
      const wired = bodies.some(
        (b) =>
          /viewerId:\s*data\.viewerId\b/.test(b) &&
          /transportationOwnerIds:\s*data\.transportationOwnerIds\b/.test(b),
      );
      expect(
        wired,
        `${f}: a transportTileVisible call must wire viewerId: data.viewerId AND transportationOwnerIds: data.transportationOwnerIds`,
      ).toBe(true);
    });
  }

  it("VenueSection takes its transport gate from venueRows.ts, not a call of its own", () => {
    const src = readFileSync(
      path.join(process.cwd(), "components/crew/sections/VenueSection.tsx"),
      "utf8",
    );
    expect(src).toMatch(/venueTransportVisible\(data, ctx\.isAdmin\)/);
    expect(src).not.toMatch(/transportTileVisible\(\{/);
  });
});
