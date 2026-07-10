import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Flow 8.3b — the behavioral render test (TravelSection.transportIdPath.test.tsx) proves
// ONE section forwards data.viewerId / data.transportationOwnerIds correctly. This pins the
// value SOURCE for all four sections, CALL-SCOPED: the literals must live INSIDE the
// transportTileVisible({ ... }) object, not merely somewhere in the file (a comment / unused
// object could satisfy a file-wide regex while the real call passes null).
const FILES = ["ScheduleSection", "TodaySection", "TravelSection", "VenueSection"];

describe("transport tile gate is wired from data, not a stale literal", () => {
  for (const f of FILES) {
    it(`${f} sources both id-path args from data INSIDE the transportTileVisible call`, () => {
      const src = readFileSync(path.join(process.cwd(), `components/crew/sections/${f}.tsx`), "utf8");
      // Scan EVERY transportTileVisible({...}) object (a JSDoc comment can also contain the
      // call token — e.g. TravelSection's block comment — so the FIRST match isn't reliably
      // the real call). Require at least one call body that wires BOTH id-path args from data.
      const bodies = [...src.matchAll(/transportTileVisible\(\{([\s\S]*?)\}\)/g)].map((m) => m[1]!);
      expect(bodies.length, `${f} must call transportTileVisible({...})`).toBeGreaterThan(0);
      const wired = bodies.some(
        (b) => /viewerId:\s*data\.viewerId\b/.test(b) && /transportationOwnerIds:\s*data\.transportationOwnerIds\b/.test(b),
      );
      expect(wired, `${f}: a transportTileVisible call must wire viewerId: data.viewerId AND transportationOwnerIds: data.transportationOwnerIds`).toBe(true);
    });
  }
});
