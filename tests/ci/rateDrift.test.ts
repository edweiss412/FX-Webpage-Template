/**
 * The rate-drift check: what it reports, and how it refuses.
 *
 * Drives `lib/mutationWeight/driftCli.ts` directly rather than spawning the script,
 * for the reason that module exists at all — decisions inline in a CLI main cannot be
 * imported, so they cannot be driven or enrolled. The script is a thin adapter and
 * has no decisions of its own to test.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import type { Drift } from "@/lib/mutationWeight/weights";
import { renderDrift, requiredCount, requiredEnv } from "@/lib/mutationWeight/driftCli";

const drift = (over: Partial<Drift> & { surfaceId: string }): Drift => ({
  declaredMillis: 1000,
  observedMillis: 1000,
  ratio: 1,
  actionable: false,
  ...over,
});

describe("required environment, with no defaults", () => {
  it("accepts a value that is set", () => {
    expect(requiredEnv({ RECORDS_DIR: "/tmp/x" }, "RECORDS_DIR")).toEqual({
      ok: true,
      value: "/tmp/x",
    });
  });

  it("REFUSES a missing value rather than defaulting it", () => {
    // A default is how this check becomes a second copy of a value it cannot import,
    // and it is worse than a crash: the run continues against a number nobody chose.
    const r = requiredEnv({}, "RECORDS_DIR");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem).toMatch(/RECORDS_DIR/);
  });

  it("REFUSES an empty or whitespace value, which a shell produces easily", () => {
    // `FOO=` and `FOO="$UNSET"` both arrive as the empty string, not as absent.
    expect(requiredEnv({ RECORDS_DIR: "" }, "RECORDS_DIR").ok).toBe(false);
    expect(requiredEnv({ RECORDS_DIR: "   " }, "RECORDS_DIR").ok).toBe(false);
  });

  it("REFUSES a malformed count instead of coercing it", () => {
    // Number("3600.5") is a number and Number("") is 0; neither is a shard count.
    for (const bad of ["", "abc", "3600.5", "-1", "0", "1e3"]) {
      expect(requiredCount({ N: bad }, "N").ok, `"${bad}" must be refused`).toBe(false);
    }
    expect(requiredCount({ N: "4" }, "N")).toEqual({ ok: true, value: 4 });
  });
});

describe("the rendered report", () => {
  it("names EVERY measured surface, whatever its ratio", () => {
    // A report listing only the actionable ones is indistinguishable from a report
    // that failed to measure anything at all.
    const r = renderDrift({
      drifted: [
        drift({ surfaceId: "quiet", ratio: 1.01 }),
        drift({ surfaceId: "loud", ratio: 8.33, actionable: true }),
      ],
      unmeasured: [],
      undeclared: [],
    });
    expect(r.lines.join("\n")).toContain("quiet");
    expect(r.lines.join("\n")).toContain("loud");
  });

  it("marks the actionable ones separately from the rest", () => {
    const r = renderDrift({
      drifted: [
        drift({ surfaceId: "quiet", ratio: 1.01 }),
        drift({ surfaceId: "loud", ratio: 8.33, actionable: true }),
      ],
      unmeasured: [],
      undeclared: [],
    });
    expect(r.actionable).toBe(1);
  });

  it("keeps declared-but-unmeasured and measured-but-undeclared DISTINCT", () => {
    // Opposite faults with opposite repairs: unmeasured is a stale registry row,
    // undeclared is a surface enrolled without a rate. Merged, a newly enrolled
    // surface reads as stale and gets deleted instead of measured.
    const r = renderDrift({
      drifted: [],
      unmeasured: ["stale-row"],
      undeclared: ["fresh-arrival"],
    });
    const staleLine = r.lines.find((l) => l.includes("stale-row"));
    const freshLine = r.lines.find((l) => l.includes("fresh-arrival"));
    expect(staleLine, "the unmeasured surface must be reported").toBeDefined();
    expect(freshLine, "the undeclared surface must be reported").toBeDefined();
    expect(staleLine).not.toBe(freshLine);
    // The LABELS, not merely two different lines. A mutant that relabelled the
    // unmeasured section as "drifted" escaped a version of this case that only
    // checked the ids landed on separate lines: both still did, and a reader would
    // have been told a stale registry row had drifted. What makes the two states
    // distinguishable is what each section SAYS it is.
    expect(staleLine).toMatch(/UNMEASURED/);
    expect(freshLine).toMatch(/UNDECLARED/);
  });

  it("reports nothing actionable when nothing drifted", () => {
    const r = renderDrift({ drifted: [], unmeasured: [], undeclared: [] });
    expect(r.actionable).toBe(0);
    expect(r.lines.length).toBeGreaterThan(0);
  });
});

describe("the script's exit status", () => {
  // These SPAWN, because an exit status is the one property that cannot be observed
  // by importing anything. A committed records fixture keeps it deterministic and
  // needs no scratch root, so this suite stays out of the cleanup guard's subjects.
  const run = (env: Record<string, string>): { code: number; out: string } => {
    try {
      return {
        code: 0,
        out: execFileSync("pnpm", ["tsx", "scripts/check-rate-drift.ts"], {
          encoding: "utf8",
          env: { ...process.env, ...env },
          stdio: ["ignore", "pipe", "pipe"],
        }),
      };
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
    }
  };

  it("exits ZERO even when a surface has drifted, because drift is a report", () => {
    // The fixture drifts hard on purpose -- ~45x -- so this cannot pass by the
    // report finding nothing. A drift check that reds a run turns an informational
    // signal into a blocker, and the budget check is what decides pass or fail.
    const r = run({ RECORDS_DIR: "tests/ci/fixtures/driftRecords", DRIFT_ACTIONABLE_AT: "2" });
    expect(r.out).toContain("DRIFTED");
    expect(r.out).toContain("actionable: 1");
    expect(r.code).toBe(0);
  });

  it("exits 2 on a missing required variable rather than defaulting it", () => {
    const r = run({ RECORDS_DIR: "", DRIFT_ACTIONABLE_AT: "2" });
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/RECORDS_DIR/);
  });

  it("exits 2 on a malformed count rather than coercing it", () => {
    const r = run({ RECORDS_DIR: "tests/ci/fixtures/driftRecords", DRIFT_ACTIONABLE_AT: "1e3" });
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/DRIFT_ACTIONABLE_AT/);
  });
});
