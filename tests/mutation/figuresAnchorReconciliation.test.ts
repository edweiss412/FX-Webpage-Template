import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { premiseHolds } from "@/tests/_shared/premise";

import {
  MEASURED_AFTER_ANCHOR,
  SPLIT_SOURCE,
  type Anchor,
  anchorProblems,
  loadAnchor,
} from "../../scripts/probes/2026-09-01-mutation-shard-figures-anchor";

/**
 * THE DEFECT THIS PINS, and why it is a suite rather than a hand probe.
 *
 * `observedPerBoot` is the weight the whole partition is priced by, and until diff round 4
 * the anchor validated it as positive and finite and nothing more. Positivity cannot see a
 * WRONG number. Deleting one digit from `connectionCensus`, 6842 to 684, passed every check
 * the validator had and reported N=10 elapsed at 2694.859 s -- inside the 3600 s budget --
 * while the same assignment priced at the measured rate puts leg 3 at 4348.508 s. A figure
 * that is wrong and looks right is the exact consequence the probe's bound forbids.
 *
 * The repair binds the two tables through a THIRD number measured independently of both:
 * the boot count of each surface in the tree the anchor's run actually ran on
 * (47e9544e6), so `observedPerBoot` must equal `round(surfaceMs / bootsAtRun)` exactly.
 * Deriving it from `surfaceMs / observedPerBoot` would have been circular and near-vacuous
 * -- for any mutated rate v there is an integer b with `round(ms / b) === v` -- which is why
 * the count comes from the run's own tree instead.
 *
 * Rounds 1, 2 and 3 each closed one anchor hole by hand and the fourth found another, so
 * these cases are DERIVED rather than listed: every single-digit deletion of every number
 * on all three reconciled tables, asserted refused. The seven the reviewer demonstrated are
 * asserted to be members of that generated set, so the sweep cannot silently stop covering
 * the case that produced it.
 */

const SPLIT_TEXT = readFileSync(join(__dirname, "..", "..", SPLIT_SOURCE), "utf8");
const clone = (a: Anchor): Anchor => JSON.parse(JSON.stringify(a)) as Anchor;

/** Every value one digit deletion produces from a positive integer, in written order. */
function digitDeletions(n: number): number[] {
  const s = String(n);
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const cut = s.slice(0, i) + s.slice(i + 1);
    if (cut.length === 0) continue;
    const v = Number(cut);
    if (Number.isFinite(v) && v > 0 && v !== n) out.push(v);
  }
  return out;
}

type Mutant = { label: string; anchor: Anchor };

function mutants(base: Anchor): Mutant[] {
  const out: Mutant[] = [];
  for (const id of Object.keys(base.rates).sort()) {
    for (const v of digitDeletions(base.rates[id]!.observedPerBoot)) {
      const a = clone(base);
      a.rates[id]!.observedPerBoot = v;
      out.push({
        label: `rates.${id}.observedPerBoot ${base.rates[id]!.observedPerBoot} -> ${v}`,
        anchor: a,
      });
    }
    for (const v of digitDeletions(base.surfaceMs[id]!)) {
      const a = clone(base);
      a.surfaceMs[id] = v;
      out.push({ label: `surfaceMs.${id} ${base.surfaceMs[id]} -> ${v}`, anchor: a });
    }
    for (const v of digitDeletions(base.bootsAtRun[id]!)) {
      const a = clone(base);
      a.bootsAtRun[id] = v;
      out.push({ label: `bootsAtRun.${id} ${base.bootsAtRun[id]} -> ${v}`, anchor: a });
    }
  }
  // The ELAPSED tables, both of them. Whole-diff round 4: neither was swept, and both are read by
  // gates -- the body's by `growthSecondsPerDay`, the block's by `legOverheadSeconds` -- so a
  // dropped digit moved growth 491.6 -> 91.6 s/day and the overhead 195 -> 185 with the validator
  // reporting clean. Positivity cannot see a number that is merely wrong.
  for (const [label, legs] of [
    ["legs", base.legs],
    ["recalibration.legs", base.recalibration.legs],
  ] as const) {
    for (const n of Object.keys(legs).sort()) {
      for (const v of digitDeletions(legs[n]!.elapsedS)) {
        const a = clone(base);
        const table = label === "legs" ? a.legs : a.recalibration.legs;
        table[n]!.elapsedS = v;
        out.push({ label: `${label}[${n}].elapsedS ${legs[n]!.elapsedS} -> ${v}`, anchor: a });
      }
    }
  }
  // The RECALIBRATION block's three tables, on the same footing. It is where the registry's
  // declared rates come from, so a wrong number there is a partition priced by a figure nobody
  // measured -- the same consequence the body's sweep exists to forbid. Round 3 measured that
  // `anchorProblems` returned [] for an anchor carrying an INVALID recalibration block: a
  // validator only knows about tables that existed when it was written, and a sweep only mutates
  // the ones it was pointed at.
  const R = base.recalibration;
  for (const id of Object.keys(R.rates).sort()) {
    for (const v of digitDeletions(R.rates[id]!.observedPerBoot)) {
      const a = clone(base);
      a.recalibration.rates[id]!.observedPerBoot = v;
      out.push({
        label: `recalibration.rates.${id}.observedPerBoot ${R.rates[id]!.observedPerBoot} -> ${v}`,
        anchor: a,
      });
    }
    for (const v of digitDeletions(R.surfaceMs[id]!)) {
      const a = clone(base);
      a.recalibration.surfaceMs[id] = v;
      out.push({ label: `recalibration.surfaceMs.${id} ${R.surfaceMs[id]} -> ${v}`, anchor: a });
    }
    for (const v of digitDeletions(R.bootsAtRun[id]!)) {
      const a = clone(base);
      a.recalibration.bootsAtRun[id] = v;
      out.push({ label: `recalibration.bootsAtRun.${id} ${R.bootsAtRun[id]} -> ${v}`, anchor: a });
    }
  }
  return out;
}

describe("the figures anchor reconciles its rate table against its millisecond table", () => {
  const base = loadAnchor();

  it("accepts the committed anchor, so every refusal below is the mutation and not the fixture", () => {
    expect(anchorProblems(base, SPLIT_TEXT)).toEqual([]);
  });

  // The unmeasured check is the one condition here whose passing can be bought by
  // editing a list rather than by measuring something, so the list is pinned and an
  // addition is a deliberate edit that shows up in review. Without this the exemption
  // fails OPEN: the next surface that cannot be priced is one append away from
  // silence, which is the same shape as the anchor row that is legitimately absent.
  it("exempts exactly the post-anchor surfaces it declares, each naming the run that measured it", () => {
    expect(MEASURED_AFTER_ANCHOR.map((e) => e.id).sort()).toEqual(["forcedColorsScan"]);
    const unattributed = MEASURED_AFTER_ANCHOR.filter((e) => e.measuredByRun.trim().length < 8).map(
      (e) => e.id,
    );
    expect(unattributed, "an exemption that names no run is an unmeasured surface").toEqual([]);
  });

  it("records a boot count for exactly the surfaces it records rates for", () => {
    expect(Object.keys(base.bootsAtRun).sort()).toEqual(Object.keys(base.rates).sort());
    expect(Object.keys(base.bootsAtRun).length).toBeGreaterThan(0);
  });

  it("reconciles all three tables on the committed anchor with no slack", () => {
    for (const id of Object.keys(base.rates)) {
      expect(Math.round(base.surfaceMs[id]! / base.bootsAtRun[id]!)).toBe(
        base.rates[id]!.observedPerBoot,
      );
    }
  });

  it("refuses a recalibration relabelled as the run the BODY measures", () => {
    // Whole-diff review round 1. Syntax alone accepted the body's own runId and headSha on the
    // block, while the block claimed psqlStartupScan at 25952 ms/boot and the body records that
    // same run measuring 16462. Three relabels, each independently refused.
    for (const [label, edit] of [
      ["runId", (a: Anchor) => (a.recalibration.runId = a.runId)],
      [
        "runId set to the anchor's PRIOR run",
        (a: Anchor) => (a.recalibration.runId = a.priorRun.runId),
      ],
      [
        "runId one digit shorter, so numerically earlier",
        (a: Anchor) => (a.recalibration.runId = a.recalibration.runId.slice(0, -1)),
      ],
      ["runHeadSha", (a: Anchor) => (a.recalibration.runHeadSha = a.runHeadSha)],
      ["dateISO before the body's", (a: Anchor) => (a.recalibration.dateISO = "2026-08-01")],
    ] as const) {
      const a = clone(base);
      edit(a);
      // PREMISE: the edit must actually change the block, or the refusal below proves nothing.
      premiseHolds(
        `the ${label} relabel changed the anchor`,
        JSON.stringify(a.recalibration) !== JSON.stringify(base.recalibration),
      );
      expect(anchorProblems(a, SPLIT_TEXT), label).not.toEqual([]);
    }
  });

  it("the recalibration's head sha names a commit that EXISTS, where history is deep enough to say", () => {
    // `anchorProblems` is pure over the anchor's contents and takes no git, so a well-formed
    // invented sha is invisible to it -- whole-diff round 2 demonstrated exactly that with a
    // one-character typo. The existence question needs git, so it is asked here.
    //
    // SKIPPED ON A SHALLOW CLONE, and that is the whole reason this guard is shaped this way.
    // Whole-diff round 4 measured it: `unit-suite` checks out at depth 1 and fetches only
    // `origin/main`, the recalibration's head is 18 commits behind, so `cat-file` would throw and
    // a REQUIRED check would report an infrastructure red dressed as a provenance verdict. A
    // guard that cannot distinguish "this sha is invented" from "this checkout has no history"
    // must say which one it is looking at, and here it can: ask git.
    const root = join(__dirname, "..", "..");
    const git = (args: string[]) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        // An EXPLICIT ceiling, required of every member row in the spawn-disposition
        // registry and checked per hit. These are short local queries, but this suite runs
        // inside `unit-suite`, so a git that blocks on a lock or a credential prompt would
        // hang a REQUIRED check rather than fail it.
        timeout: 10_000,
      }).trim();
    const shallow = git(["rev-parse", "--is-shallow-repository"]) === "true";
    if (shallow) {
      // Asserted rather than silently returned: a skip nobody can see is the same as no guard.
      expect(shallow, "shallow checkout — existence is unknowable here, not false").toBe(true);
      return;
    }
    const sha = base.recalibration.runHeadSha;
    expect(git(["cat-file", "-t", sha]), `${sha} is not a commit in this repository`).toBe(
      "commit",
    );
    // PREMISE: `cat-file -t` on an unknown object THROWS rather than returning a non-"commit"
    // string, so a passing assertion above must be shown to be discriminating at all.
    expect(() => git(["cat-file", "-t", "0".repeat(40)])).toThrow();
  });

  const generated = mutants(base);

  it("generates a mutant for every digit of every number on the EIGHT reconciled tables", () => {
    const tablesOf = (
      rates: Record<string, { observedPerBoot: number }>,
      surfaceMs: Record<string, number>,
      bootsAtRun: Record<string, number>,
    ) =>
      Object.keys(rates).reduce(
        (n, id) =>
          n +
          digitDeletions(rates[id]!.observedPerBoot).length +
          digitDeletions(surfaceMs[id]!).length +
          digitDeletions(bootsAtRun[id]!).length,
        0,
      );
    const elapsedOf = (legs: Record<string, { elapsedS: number }>) =>
      Object.values(legs).reduce((n, l) => n + digitDeletions(l.elapsedS).length, 0);
    const expected =
      tablesOf(base.rates, base.surfaceMs, base.bootsAtRun) +
      tablesOf(
        base.recalibration.rates,
        base.recalibration.surfaceMs,
        base.recalibration.bootsAtRun,
      ) +
      elapsedOf(base.legs) +
      elapsedOf(base.recalibration.legs);
    expect(generated.length).toBe(expected);
    // Both halves are non-empty, so a sweep that silently stopped covering one of them cannot
    // pass this by matching a total the other half alone could reach.
    expect(generated.filter((m) => m.label.startsWith("recalibration.")).length).toBeGreaterThan(
      3 * Object.keys(base.recalibration.rates).length,
    );
    expect(generated.filter((m) => !m.label.startsWith("recalibration.")).length).toBeGreaterThan(
      3 * Object.keys(base.rates).length,
    );
  });

  it("refuses every single-digit deletion on all EIGHT tables", () => {
    const survivors = generated.filter((m) => anchorProblems(m.anchor, SPLIT_TEXT).length === 0);
    expect(survivors.map((s) => s.label)).toEqual([]);
  });

  // The seven the round-4 reviewer demonstrated, pinned by value. If a later edit narrows
  // the sweep, this fails rather than passing on a smaller set.
  const DEMONSTRATED: ReadonlyArray<readonly [string, number]> = [
    ["connectionCensus", 642],
    ["connectionCensus", 684],
    ["connectionCensus", 682],
    ["connectionCensus", 842],
    ["interactiveScanCore", 374],
    ["interactiveScanCore", 384],
    ["interactiveScanCore", 387],
  ];

  it.each(DEMONSTRATED)(
    "refuses the reviewer's demonstrated mutant rates.%s.observedPerBoot -> %i",
    (id, v) => {
      expect(digitDeletions(base.rates[id]!.observedPerBoot)).toContain(v);
      const a = clone(base);
      a.rates[id]!.observedPerBoot = v;
      const problems = anchorProblems(a, SPLIT_TEXT);
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.join("\n")).toContain(id);
    },
  );
});
