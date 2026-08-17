import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseArgv } from "@/scripts/pane-compaction";
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
  rejectedField: null,
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

describe("the single-target grammar (AC-7)", () => {
  // Diff round 2, finding 5 (P1). The positional branch was guarded by
  // `out.target === null`, so a second target was silently dropped:
  // `--checkpoint pane-a pane-b --as owner` exited 0 and drove pane-a. An
  // orchestrator typo that drives the WRONG PANE while reporting success is
  // precisely the failure a tool that types into other sessions must not have.
  it("records positionals beyond the first rather than dropping them", () => {
    const p = parseArgv(["--checkpoint", "pane-a", "pane-b", "--as", "owner"]);
    expect(p.target).toBe("pane-a");
    expect(p.extraTargets).toEqual(["pane-b"]);
  });

  it("records every extra, not just the second", () => {
    const p = parseArgv(["--checkpoint", "a", "b", "c", "--as", "o"]);
    expect(p.extraTargets).toEqual(["b", "c"]);
  });

  it("leaves extraTargets empty for a well-formed single target", () => {
    // The other side: the guard must not fire on ordinary usage.
    const p = parseArgv(["--checkpoint", "pane-a", "--as", "owner"]);
    expect(p.target).toBe("pane-a");
    expect(p.extraTargets).toEqual([]);
  });

  it("does not treat a flag VALUE as an extra target", () => {
    // `--as owner` consumes `owner`; counting it as a positional would refuse
    // every correct invocation.
    expect(parseArgv(["--check", "--as", "owner"]).extraTargets).toEqual([]);
  });
});

describe("a second COMMAND is a usage error, like a second target (AC-7)", () => {
  // Diff round 3, finding 3 (P1). The mode branch overwrote both `mode` and
  // `target`, so `--checkpoint p1 --compact p2` parsed as compacting p2, exited
  // 0, and SENT. The operator asked to checkpoint p1 and the tool typed
  // `/compact` into a different pane -- the single worst outcome available to a
  // surface whose entire job is which bytes reach which session.
  it("records a second sending mode instead of silently re-aiming", () => {
    const p = parseArgv(["--checkpoint", "p1", "--compact", "p2", "--as", "owner"]);
    expect(p.extraModes).toEqual(["--compact"]);
  });

  it("keeps the FIRST target when a second command supplies another", () => {
    // Recorded, not dropped: the refusal names both so the operator can see
    // which two readings of their command line were possible.
    const p = parseArgv(["--checkpoint", "p1", "--compact", "p2", "--as", "owner"]);
    expect(p.target).toBe("p1");
    expect(p.extraTargets).toEqual(["p2"]);
  });

  it("leaves extraModes empty for a single well-formed command", () => {
    expect(parseArgv(["--compact", "p1", "--as", "owner"]).extraModes).toEqual([]);
  });

  it("does not count --check or --json as a sending mode", () => {
    // Only the three sending modes collide; flags that shape the report do not.
    expect(parseArgv(["--json", "--check", "--as", "o"]).extraModes).toEqual([]);
  });
});
