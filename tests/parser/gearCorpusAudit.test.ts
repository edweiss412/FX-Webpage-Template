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

  // BLOCKED by Task 4 (EVENT form-layout harvest): consultants-raw `event_details` is
  // currently empty (the dropped-form bug). The harvest that would recover it is
  // unimplementable AS SPECIFIED — the RPAS-raw negative-regression baseline (17 keys)
  // is incompatible with harvesting the identical full 2-cell intake form that
  // consultants-raw carries (RPAS-raw contains the same form at lines 701-751; harvesting
  // it adds ~33 non-classic keys, and the zero-keys gate that would exclude it is
  // explicitly forbidden by the spec and would break fixed-income). See the
  // implementation report. Un-skip once Task 4's harvest design is resolved.
  it.skip("raw/2025-10-consultants-roundtable.md recovers non-empty event_details (needs Task 4)", () => {
    const ed = parseSheet(md("raw/2025-10-consultants-roundtable.md"), "c.md").show.event_details;
    expect(Object.keys(ed).length).toBeGreaterThan(0);
  });
});
