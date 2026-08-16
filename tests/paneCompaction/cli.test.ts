import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  type PaneReport,
  checkExitCode,
  renderRow,
  reportEnvelope,
} from "@/scripts/lib/pane-compaction-core";
import { premise, premiseHolds } from "@/tests/_shared/premise";

/** A report row for a pane, with only the fields these assertions read. */
const row = (over: Partial<PaneReport> = {}): PaneReport => ({
  paneId: "wM:p1",
  branch: "feat/x",
  tenths: 6,
  verdict: "COMPACT",
  rule: 12,
  position: { row: 7, cost: "Lowest" },
  inPurview: true,
  ...over,
});

describe("the envelope is never capped", () => {
  it("serializes every pane, at a size the live roster cannot reach", () => {
    // The live roster is ~12 panes. An end-to-end assertion against the real
    // machine could not fail against the mutant it names, so the fixture is
    // deliberately larger than any plausible cap.
    const many = Array.from({ length: 250 }, (_, i) => row({ paneId: `wM:p${i}` }));
    premise("the fixture exceeds any plausible display cap", many.length, 100);
    const env = reportEnvelope(many, []);
    expect(env.panes).toHaveLength(many.length);
    expect(env.status).toBe(0);
  });

  it("carries degraded reasons rather than dropping them", () => {
    const env = reportEnvelope([row()], ["herdr roster unreadable"]);
    expect(env.degraded).toEqual(["herdr roster unreadable"]);
  });
});

describe("--check aggregation is purview-only", () => {
  it("exits 0 when nothing in purview is actionable", () => {
    expect(checkExitCode([row({ verdict: "HOLD" })])).toBe(0);
  });

  it("exits 1 when a purview pane is COMPACT or FORCE", () => {
    expect(checkExitCode([row({ verdict: "COMPACT" })])).toBe(1);
    expect(checkExitCode([row({ verdict: "FORCE" })])).toBe(1);
  });

  it("exits 2 when a purview pane is UNDETERMINED, outranking an actionable one", () => {
    const rows = [row({ verdict: "COMPACT" }), row({ paneId: "wM:p2", verdict: "UNDETERMINED" })];
    premiseHolds(
      "an actionable pane is present, so 2 really is outranking 1",
      rows.some((r) => r.verdict === "COMPACT"),
    );
    expect(checkExitCode(rows)).toBe(2);
  });

  it("EXCLUDES out-of-purview panes from the exit, or an orchestrator on a shared machine never sees 0", () => {
    const rows = [
      row({ verdict: "HOLD" }),
      row({ paneId: "wM:p2", verdict: "UNDETERMINED", inPurview: false }),
      row({ paneId: "wM:p3", verdict: "NOT-AN-ARC", inPurview: false }),
      row({ paneId: "wM:p4", verdict: "UNOWNED", inPurview: false }),
    ];
    premiseHolds(
      "out-of-purview panes would otherwise force a 2",
      rows.some((r) => !r.inPurview && r.verdict === "UNDETERMINED"),
    );
    expect(checkExitCode(rows)).toBe(0);
  });
});

describe("AC-1 — a rendered row carries its verdict AND its position evidence", () => {
  it("renders both, so an operator can overrule the inference", () => {
    // Roster coverage alone is not AC-1: the classifier can compute both while
    // the adapter silently omits them, which defeats the operator-overrule
    // purpose that makes inferred position acceptable at all.
    const text = renderRow(row({ verdict: "WAIT", position: { row: 1, cost: "HardWait" } }));
    expect(text).toContain("WAIT");
    expect(text).toContain("HardWait");
    expect(text).toMatch(/row\s*1/i);
  });
});

describe("the shipped entry point", () => {
  it("package.json exposes panes:compact, resolving to the adapter", () => {
    const pkg: unknown = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const scripts = (pkg as { scripts?: Record<string, string> }).scripts ?? {};
    const alias = scripts["panes:compact"];
    expect(alias, "package.json has no panes:compact script").toBeDefined();
    expect(alias).toContain("scripts/pane-compaction.ts");
  });
});
