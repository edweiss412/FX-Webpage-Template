import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

// The PRODUCTION exporter (synthesizeMarkdownFromXlsx, lib/drive/exportSheetToMarkdown.ts:186)
// is what parseSheet sees in prod. Its 2026-06-18 capture lives in fixtures/shows/exporter-xlsx/.
// The fixtures/shows/raw/* corpus is the Drive-MCP renderer (a DIFFERENT shape) — stale for AGENDA,
// kept ONLY as fail-soft robustness inputs (Task 1.7). These two fixtures carry FILLED AGENDA grids.
const EXPORTER = "fixtures/shows/exporter-xlsx";

describe("agenda fixtures — production-exporter filled grids are the source of truth", () => {
  it("East Coast exporter fixture carries the canonical AGENDA token-header", () => {
    const md = readFileSync(`${EXPORTER}/east-coast.md`, "utf8");
    // token-header is the reliable anchor: NAME | ARRIVAL | FLIGHT# | ... | START | FINISH | TRT
    expect(md).toMatch(/NAME\s*\|\s*ARRIVAL\s*\|\s*FLIGHT\\?#/);
    expect(md).toMatch(/START\s*\|\s*FINISH\s*\|\s*TRT/);
    // and real session content (not an auto-time skeleton)
    expect(md).toContain("Family Office Only Breakfast");
    expect(md).toContain("Opening Keynote");
  });

  it("RIA exporter fixture carries a filled AGENDA token-header + sessions", () => {
    const md = readFileSync(`${EXPORTER}/ria.md`, "utf8");
    expect(md).toMatch(/NAME\s*\|\s*ARRIVAL\s*\|\s*FLIGHT\\?#/);
    expect(md).toMatch(/START\s*\|\s*FINISH\s*\|\s*TRT/);
    expect(md).toContain("Attendee Registration and Breakfast");
  });
});
