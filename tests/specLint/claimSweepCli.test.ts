/**
 * Task 7 — the adapter: flags, hunk spans, peers, and the injection
 * (spec §3.0, §3.3, §4, AC-2, AC-5, AC-9).
 *
 * FIVE SEMANTICS ARE ADAPTER-OWNED, and the pure-core suites cannot see any of
 * them: those run on CORRECTLY INJECTED data by construction. "Some populated
 * record reached `runLint`" is exactly the assertion an adapter with empty
 * spans, dropped peers or double-linted peers would satisfy, so every case here
 * asserts the RESULT of a whole invocation.
 *
 * WHY THE EXACT SETS RUN THROUGH INJECTED DEPS AND NOT A SUBPROCESS. The
 * incident's documents are still in the live tree and still moving: they carry
 * TEN occurrences of the identifier today against NINE at `c272ebed3`. Pinning
 * what a subprocess run yields against them would be a cardinality this arc's
 * own edits can move — the defect AC-6 exists to forbid. So the exact sets are
 * asserted against the FROZEN blobs through `runCli`, which is the whole
 * adapter minus the OS boundary, and a real subprocess case asserts the
 * RELATIONS that survive the corpus growing.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { runCli, type CliDeps, type SpawnResult } from "../../scripts/spec-lint";
import type { LintResult } from "../../lib/specLint/types";
import {
  C272_INSIDE_SPANS,
  C272_OUTSIDE_SPANS,
  INCIDENT_IDENTIFIER,
  INCIDENT_PLAN,
  INCIDENT_PROBE,
  INCIDENT_SPEC,
  fixtureLines,
  incidentDiff,
  siteKey,
} from "./claimSweepFixtures";
import { memSpliceSeam } from "./_memSpliceSeam";

const ROOT = "/repo";
const TSX = join(process.cwd(), "node_modules/tsx/dist/cli.mjs");

/** The frozen blobs, served at the incident arc's REAL repo-relative paths. */
function blobFor(rev: string, path: string): string {
  const stem = path === INCIDENT_SPEC ? "spec" : path === INCIDENT_PLAN ? "plan" : "probe";
  return fixtureLines(rev, stem).join("\n");
}

type Spy = {
  writes: string[];
  mkdirs: string[];
  rms: string[];
  repairDiffCalls: { rev: string; paths: readonly string[] }[];
};

const newSpy = (): Spy => ({ writes: [], mkdirs: [], rms: [], repairDiffCalls: [] });

/**
 * A `CliDeps` over the frozen incident tree. Everything the adapter does is
 * real; only the OS boundary is served from fixtures.
 */
function fixtureDeps(
  rev: string,
  opts: { unreadable?: readonly string[]; diff?: string; spy?: Spy } = {},
): CliDeps {
  const unreadable = new Set(opts.unreadable ?? []);
  const tracked = [INCIDENT_SPEC, INCIDENT_PLAN, INCIDENT_PROBE];
  const seam = memSpliceSeam();
  const rel = (p: string) => (p.startsWith(ROOT + "/") ? p.slice(ROOT.length + 1) : p);
  return {
    cwd: () => ROOT,
    repoRoot: () => ROOT,
    listTrackedFiles: () => [...tracked],
    lstatKind: (p) => {
      const r = rel(p);
      if (unreadable.has(r)) return "symlink"; // the live corpus shape
      return tracked.includes(r) ? "file" : "missing";
    },
    readFileBytes: (p) => {
      const r = rel(p);
      if (!tracked.includes(r)) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return Buffer.from(blobFor(rev, r), "utf8");
    },
    realpath: (p) => p,
    spawn: (): SpawnResult => ({ status: 0, signal: null, stderr: "", stdout: "" }),
    repairDiff: (r, paths) => {
      opts.spy?.repairDiffCalls.push({ rev: r, paths: [...paths] });
      return opts.diff ?? incidentDiff(rev);
    },
    mkdirExclusive: (relPath) => {
      opts.spy?.mkdirs.push(relPath);
      return seam.mkdirExclusive(relPath);
    },
    write: (relPath, body) => {
      opts.spy?.writes.push(relPath);
      seam.write(relPath, body);
    },
    readFile: seam.readFile,
    rm: (relPath) => {
      opts.spy?.rms.push(relPath);
      seam.rm(relPath);
    },
  };
}

function run(argv: string[], deps: CliDeps) {
  const out = runCli(argv, deps);
  const result: LintResult | null =
    out.stdout === "" ? null : (JSON.parse(out.stdout) as LintResult);
  // THE PREMISE, stated once for every injected-deps case below: the invocation
  // produced something. Exit 2 writes NO report, and a run that refused before
  // reading a document is indistinguishable from one that swept and found
  // nothing -- which is exactly the shape several of these cases assert.
  premiseHolds(`the invocation produced output for: ${argv.join(" ")}`, out.stdout.length > 0);
  return { ...out, result };
}

const sweepOf = (r: LintResult | null, code: string) =>
  (r?.findings ?? []).filter((f) => f.code === code);
const keysOf = (r: LintResult | null, code: string) =>
  sweepOf(r, code)
    .map((f) => siteKey({ docPath: f.docPath ?? "", docLine: f.docLine, column: f.column }))
    .sort();

const NAMED = ["--claim-about", INCIDENT_IDENTIFIER, "--repair", "c272ebed3"];
const PEERS = ["--also", INCIDENT_PLAN, "--also", INCIDENT_PROBE];

describe("claim sweep adapter — hunk spans are EXACT", () => {
  it("yields the four sites outside the repair's spans, end to end", () => {
    const out = run(["--json", INCIDENT_SPEC, ...NAMED, ...PEERS], fixtureDeps("c272ebed3"));
    premiseHolds("the invocation produced a parseable report", out.result !== null);
    // NOT 2. The exit code reflects the LINT of the document -- the incident
    // spec blob draws hard findings of its own under a fake tracked list -- and
    // every claim-sweep finding is advisory, so it contributes nothing to it.
    // What 2 would mean is a USAGE error: the run never happened.
    expect(out.exitCode).not.toBe(2);
    expect(out.result).not.toBeNull();
    expect(keysOf(out.result, "CLAIM_SITE_UNSWEPT")).toEqual([...C272_OUTSIDE_SPANS].sort());
  });

  it("an adapter supplying EMPTY spans would return nine — asserted by feeding an empty diff", () => {
    // The other direction, so a span bug that under-excludes is caught rather
    // than only one that over-excludes. Nine is four outside plus five inside.
    const out = run(
      ["--json", INCIDENT_SPEC, ...NAMED, ...PEERS],
      fixtureDeps("c272ebed3", { diff: "" }),
    );
    premiseHolds("the invocation produced a parseable report", out.result !== null);
    expect(keysOf(out.result, "CLAIM_SITE_UNSWEPT")).toEqual(
      [...C272_OUTSIDE_SPANS, ...C272_INSIDE_SPANS].sort(),
    );
  });

  it("an adapter supplying WHOLE-FILE spans would return zero", () => {
    const whole = [INCIDENT_SPEC, INCIDENT_PLAN, INCIDENT_PROBE]
      .map((p) => `+++ b/${p}\n@@ -1 +1,100000 @@\n`)
      .join("");
    const out = run(
      ["--json", INCIDENT_SPEC, ...NAMED, ...PEERS],
      fixtureDeps("c272ebed3", { diff: whole }),
    );
    premiseHolds("the invocation produced a parseable report", out.result !== null);
    expect(sweepOf(out.result, "CLAIM_SITE_UNSWEPT")).toEqual([]);
    // Premise: the run happened at all. Without this, "zero" is satisfied by an
    // adapter that never swept -- and a usage error (exit 2) writes no report,
    // which is exactly that shape.
    expect(out.exitCode).not.toBe(2);
    expect(out.result).not.toBeNull();
    expect(out.result!.findings.length).toBeGreaterThan(0);
  });
});

describe("claim sweep adapter — the git seam is asked for exactly the swept paths", () => {
  it("passes the declared rev and the SWEPT document paths, never an unrestricted diff", () => {
    // Without this the restriction is invisible: `git show --unified=0 <rev>`
    // with no pathspec returns hunks for every file the commit touched, and
    // those extra keys are simply never read, so the sweep's RESULT is
    // identical. The contract that the seam is asked a bounded question is
    // therefore only observable at the seam itself. Measured: a mutant dropping
    // the pathspec survived the whole suite until this case existed.
    const spy = newSpy();
    const out = run(
      ["--json", INCIDENT_SPEC, ...NAMED, ...PEERS],
      fixtureDeps("c272ebed3", { spy }),
    );
    premiseHolds("the invocation produced a parseable report", out.result !== null);
    expect(out.result).not.toBeNull(); // premise: the run reached the seam
    expect(spy.repairDiffCalls).toHaveLength(1);
    expect(spy.repairDiffCalls[0]!.rev).toBe("c272ebed3");
    expect([...spy.repairDiffCalls[0]!.paths].sort()).toEqual(
      [INCIDENT_SPEC, INCIDENT_PLAN, INCIDENT_PROBE].sort(),
    );
  });

  it("does not reach the git seam at all when no --repair is declared", () => {
    // A NUMERIC declaration, because `--repair` is OPTIONAL for that half.
    // `--claim-about` without `--repair` is REFUSED, so a run built from it
    // never reaches the seam for a reason that has nothing to do with this
    // rule -- the refusal would decide the observation instead of the flag.
    const spy = newSpy();
    const out = run(
      ["--json", INCIDENT_SPEC, "--superseded", "58", "--replacement", "57", ...PEERS],
      fixtureDeps("c272ebed3", { spy }),
    );
    premiseHolds("the invocation produced a parseable report", out.result !== null);
    // Premise: the run happened and DID sweep, so the empty call list is
    // attributable to the missing flag rather than to a refusal.
    expect(out.exitCode).not.toBe(2);
    expect(sweepOf(out.result, "VALUE_SUPERSEDED_ELSEWHERE").length).toBeGreaterThan(0);
    expect(spy.repairDiffCalls).toEqual([]);
  });
});

describe("claim sweep adapter — EVERY repeated --also is honoured", () => {
  it("sweeps all declared peers, not just the last", () => {
    // An adapter that keeps only the LAST `--also` returns the probe record's
    // one site and drops the plan's. The expectation is DERIVED from the
    // fixture rather than typed: it is the set of outside-span sites whose
    // document is one of the declared ones.
    const out = run(["--json", INCIDENT_SPEC, ...NAMED, ...PEERS], fixtureDeps("c272ebed3"));
    premiseHolds("the invocation produced a parseable report", out.result !== null);
    const docs = new Set(sweepOf(out.result, "CLAIM_SITE_UNSWEPT").map((f) => f.docPath));
    expect([...docs].sort()).toEqual([INCIDENT_PLAN, INCIDENT_PROBE, INCIDENT_SPEC].sort());
  });

  it("sweeps only the linted document when no peer is declared", () => {
    // One variable: the peers. So the multi-document result above is
    // attributable to `--also` rather than to the adapter sweeping a tree.
    const out = run(["--json", INCIDENT_SPEC, ...NAMED], fixtureDeps("c272ebed3"));
    premiseHolds("the invocation produced a parseable report", out.result !== null);
    const docs = new Set(sweepOf(out.result, "CLAIM_SITE_UNSWEPT").map((f) => f.docPath));
    expect([...docs]).toEqual([INCIDENT_SPEC]);
  });
});

describe("claim sweep adapter — an unreadable peer PROPAGATES rather than being dropped", () => {
  it("emits SWEEP_DOCUMENT_UNREADABLE for it and occurrences for the others", () => {
    // The adapter must pass `null` THROUGH rather than omitting the entry: an
    // omitted entry is indistinguishable from a peer nobody declared.
    const out = run(
      ["--json", INCIDENT_SPEC, ...NAMED, ...PEERS],
      fixtureDeps("c272ebed3", { unreadable: [INCIDENT_PLAN] }),
    );
    premiseHolds("the invocation produced a parseable report", out.result !== null);
    expect(sweepOf(out.result, "SWEEP_DOCUMENT_UNREADABLE").map((f) => f.docPath)).toEqual([
      INCIDENT_PLAN,
    ]);
    expect(keysOf(out.result, "CLAIM_SITE_UNSWEPT")).toEqual(
      C272_OUTSIDE_SPANS.filter((k) => !k.startsWith(INCIDENT_PLAN)).sort(),
    );
  });
});

describe("claim sweep adapter — peers are SWEPT, not LINTED", () => {
  it("contributes ONLY claim-sweep codes from a peer, whatever else its text would draw", () => {
    // The plan blob draws citation, numeric and copy findings when it is the
    // LINTED document. As a peer it must contribute claim-sweep findings and
    // nothing else, or the adapter is double-linting and the report describes a
    // document nobody asked about.
    const asPeer = run(["--json", INCIDENT_SPEC, ...NAMED, ...PEERS], fixtureDeps("c272ebed3"));
    const fromPlan = (asPeer.result?.findings ?? []).filter((f) => f.docPath === INCIDENT_PLAN);
    expect(fromPlan.length).toBeGreaterThan(0); // premise: the peer contributed something
    expect([...new Set(fromPlan.map((f) => f.check))]).toEqual(["claimSweep"]);

    // PAIRED, one variable — the same blob as the LINTED document draws other
    // checks, so "only claimSweep" above is attributable to peer status rather
    // than to the blob being uninteresting.
    const asLinted = run(["--json", INCIDENT_PLAN, "--kind", "plan"], fixtureDeps("c272ebed3"));
    premiseHolds("the paired linted run produced a report", asLinted.result !== null);
    const otherChecks = new Set(
      (asLinted.result?.findings ?? []).map((f) => f.check).filter((c) => c !== "claimSweep"),
    );
    expect(otherChecks.size).toBeGreaterThan(0);
  });

  it("reports the LINTED document once, never twice, when it is also named as a peer", () => {
    // `--also <the linted doc>` must not double-count it.
    const out = run(
      ["--json", INCIDENT_SPEC, ...NAMED, "--also", INCIDENT_SPEC, ...PEERS],
      fixtureDeps("c272ebed3"),
    );
    premiseHolds("the invocation produced a parseable report", out.result !== null);
    expect(keysOf(out.result, "CLAIM_SITE_UNSWEPT")).toEqual([...C272_OUTSIDE_SPANS].sort());
  });
});

describe("claim sweep adapter — THE ARM NEVER REWRITES A DOCUMENT (AC-3)", () => {
  it("performs ZERO writes across a full invocation that DID produce findings", () => {
    // `_metaPureCore` does NOT prove this: it forbids `node:fs` under
    // lib/specLint/** only, and this arm's git and file reads live in the
    // ADAPTER, where writes remain possible. The premise is asserted FIRST --
    // "nothing was written" and "nothing ran" are otherwise indistinguishable.
    const spy = newSpy();
    const out = run(
      ["--json", INCIDENT_SPEC, ...NAMED, ...PEERS],
      fixtureDeps("c272ebed3", { spy }),
    );
    premiseHolds("the invocation produced a parseable report", out.result !== null);
    expect(sweepOf(out.result, "CLAIM_SITE_UNSWEPT").length).toBeGreaterThan(0);
    expect(spy.writes).toEqual([]);
    expect(spy.mkdirs).toEqual([]);
    expect(spy.rms).toEqual([]);
  });
});

describe("claim sweep adapter — a real subprocess, asserted as RELATIONS", () => {
  const T = 60000;
  function cli(args: string[]) {
    const r = execFileSync(process.execPath, [TSX, "scripts/spec-lint.ts", ...args], {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    // The child ran and wrote a report. A tsx that fails to launch, or a usage
    // error that writes nothing to stdout, would otherwise arrive as a JSON
    // parse failure whose message says nothing about the arm.
    premise(`the CLI child wrote a report for: ${args.join(" ")}`, r.length, 0);
    return JSON.parse(r) as LintResult;
  }

  it(
    "runs the real flags against the live incident documents and emits only claim-sweep codes for peers",
    () => {
      // NO CARDINALITY IS PINNED. Those documents are live and still moving --
      // ten occurrences of the identifier today against nine at c272ebed3 -- so
      // a count here would turn a correct arm red the next time somebody edits
      // them. What is asserted is the relation: the run produces claim-sweep
      // findings, every one of them carries a code the module exports, and the
      // peers contribute nothing but claim-sweep findings.
      const result = cli([
        "--json",
        INCIDENT_SPEC,
        "--claim-about",
        INCIDENT_IDENTIFIER,
        "--repair",
        "c272ebed3",
        "--also",
        INCIDENT_PLAN,
        "--also",
        INCIDENT_PROBE,
      ]);
      // The live documents still carry the identifier, so the arm has something
      // to report. If a future edit removed every occurrence, this fails as a
      // PREMISE -- the environment stopped reaching the boundary -- rather than
      // as a claim that the arm is broken.
      const sweep = result.findings.filter((f) => f.check === "claimSweep");
      premise("the live incident documents still draw claim-sweep findings", sweep.length, 0);
      expect(sweep.every((f) => f.severity === "advisory")).toBe(true);
      const peerFindings = result.findings.filter(
        (f) => f.docPath === INCIDENT_PLAN || f.docPath === INCIDENT_PROBE,
      );
      expect(peerFindings.length).toBeGreaterThan(0);
      expect([...new Set(peerFindings.map((f) => f.check))]).toEqual(["claimSweep"]);
    },
    T,
  );

  it(
    "leaves every swept document byte-identical (the no-rewrite proof, against real files)",
    () => {
      const before = [INCIDENT_SPEC, INCIDENT_PLAN, INCIDENT_PROBE].map((p) =>
        readFileSync(join(process.cwd(), p)),
      );
      // The documents exist and were read. Comparing two empty buffers is the
      // default success case of every naive diff.
      for (const b of before) premise("a swept document was read before the run", b.length, 1000);
      const result = cli([
        "--json",
        INCIDENT_SPEC,
        "--claim-about",
        INCIDENT_IDENTIFIER,
        "--repair",
        "c272ebed3",
        "--also",
        INCIDENT_PLAN,
        "--also",
        INCIDENT_PROBE,
      ]);
      // Premise FIRST: the run produced findings, so "unchanged" is not
      // "nothing happened".
      expect(result.findings.filter((f) => f.check === "claimSweep").length).toBeGreaterThan(0);
      const after = [INCIDENT_SPEC, INCIDENT_PLAN, INCIDENT_PROBE].map((p) =>
        readFileSync(join(process.cwd(), p)),
      );
      for (let i = 0; i < before.length; i += 1) {
        premise("a swept document was read after the run", after[i]!.length, 1000);
        expect(after[i]!.equals(before[i]!)).toBe(true);
      }
    },
    T,
  );
});

/**
 * A repair whose revision GIT REFUSES is a refusal, never a clean.
 *
 * The arity check accepts any value not starting with `--`, so `--repair -3` is
 * a parseable invocation. Git then read `-3` as the max-count OPTION rather
 * than as a revision: it SUCCEEDED, returned unrelated recent hunks, and the
 * named half's touched-line filter suppressed the very occurrence the run was
 * asked about. Exit 0, empty findings, and a user who declared a repair and was
 * told there was nothing to re-read. Measured on the live corpus: a real
 * occurrence at plan line 722 vanished.
 *
 * Two layers now, and they fail in opposite directions so neither carries it
 * alone. The production dep passes `--end-of-options` before the revision, so
 * git cannot reinterpret the value at all; and the call is wrapped, so a git
 * refusal joins the USAGE channel the three declaration refusals already use --
 * exit 2, no report written -- rather than throwing out of `runCli` as an
 * unhandled exception.
 *
 * The cases below cover the wrapper, which is the layer a mutant can reach.
 * `--end-of-options` lives in the production `repairDiff` implementation that
 * these injected deps replace, and is covered end to end in
 * `tests/specLint/cli.test.ts`.
 */
describe("claim sweep adapter — a revision git refuses", () => {
  const bad = "fatal: bad revision '-3'";

  it("REFUSES through the usage channel, naming the revision, and writes NO report", () => {
    const spy = newSpy();
    const deps: CliDeps = {
      ...fixtureDeps("c272ebed3", { spy }),
      repairDiff: (rev, paths) => {
        spy.repairDiffCalls.push({ rev, paths: [...paths] });
        throw new Error(bad);
      },
    };
    const out = runCli(["--json", INCIDENT_SPEC, ...NAMED, ...PEERS], deps);
    // THE PREMISE: the run actually REACHED the repair read. Exit 2 is also what
    // a malformed declaration returns, and what an unparseable flag returns, so
    // without this the case is satisfied by an adapter that refused for some
    // entirely different reason and never called git at all -- which would make
    // it green against an arm that had lost this behaviour completely.
    premiseHolds("the adapter reached the repair read", spy.repairDiffCalls.length === 1);
    expect(out.exitCode).toBe(2);
    // No report at all: a refusal must not arrive in the same channel as a
    // claim about the corpus, or a reader cannot tell a swept-and-clean run
    // from one that never started.
    expect(out.stdout).toBe("");
    expect(out.stderr).toContain("c272ebed3");
    // The reason says what the silence is NOT. An exit code alone is the same
    // information a clean run carries to anyone reading output rather than
    // status.
    expect(out.stderr).toContain("NOT a clean");
  });

  it("still SWEEPS when the same revision reads (one variable: the git result)", () => {
    // Paired positive. Without it, an adapter that refused every `--repair`
    // invocation would pass the case above, and the refusal would be
    // indistinguishable from the arm being broken.
    const spy = newSpy();
    const out = run(
      ["--json", INCIDENT_SPEC, ...NAMED, ...PEERS],
      fixtureDeps("c272ebed3", { spy }),
    );
    // Same premise, the other side of the pair: the sweep is attributable to the
    // repair having been READ rather than to the record having been built
    // without one.
    premiseHolds("the adapter reached the repair read", spy.repairDiffCalls.length === 1);
    expect(out.exitCode).not.toBe(2);
    expect(sweepOf(out.result, "CLAIM_SITE_UNSWEPT").length).toBeGreaterThan(0);
  });
});
