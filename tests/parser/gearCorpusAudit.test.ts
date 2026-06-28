import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { parseSheet } from "@/lib/parser/index";

const md = (rel: string) => readFileSync(`fixtures/shows/${rel}`, "utf8");
const allFixtures = ["raw", "exporter-xlsx"].flatMap((d) =>
  readdirSync(`fixtures/shows/${d}`)
    .filter((f) => f.endsWith(".md") && !/readme/i.test(f))
    .map((f) => `${d}/${f}`),
);

describe("full-corpus gear audit regression (gear-parser-fidelity Task 11)", () => {
  it("parseSheet over the whole {raw,exporter-xlsx} corpus never throws", () => {
    for (const rel of allFixtures) expect(() => parseSheet(md(rel), rel), rel).not.toThrow();
  });

  // Confirmed GEAR date-grid shows: the GEAR tab now merges per-room A/V/L scope onto
  // `rooms` (Tasks 1-3). Asserted against parseSheet output (anti-tautology), not a
  // hardcoded count — a regression in the grid parse/merge drops these to zero.
  it.each(["exporter-xlsx/rpas.md", "exporter-xlsx/fixed-income.md"])(
    "%s surfaces >=1 room with non-empty audio/video/lighting scope",
    (rel) => {
      const rooms = parseSheet(md(rel), rel).rooms;
      const withScope = rooms.filter(
        (r) => r.audio != null || r.video != null || r.lighting != null,
      );
      expect(withScope.length).toBeGreaterThanOrEqual(1);
    },
  );

  // The form-layout show: the closed-vocab EVENT harvest (Task 4) recovers consultants-raw's
  // dropped intake-form values — keynote_requirements + Opening Sizzle Reel — into a
  // non-empty event_details (was 0 keys before the harvest). Asserted against parseSheet
  // output; the full behavioral detail + permission boundary are pinned in
  // tests/parser/event.test.ts + tests/parser/eventDetailsNoFinancials.test.ts.
  it("raw/2025-10-consultants-roundtable.md recovers non-empty event_details (form harvest)", () => {
    const ed = parseSheet(md("raw/2025-10-consultants-roundtable.md"), "c.md").show.event_details;
    expect(Object.keys(ed).length).toBeGreaterThan(0);
    expect(ed["keynote_requirements"]).toBe("TBD");
    expect(ed["opening_reel"]).toMatch(/Available if needed/i);
  });
});
