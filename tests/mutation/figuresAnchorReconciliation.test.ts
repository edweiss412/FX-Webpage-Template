import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { premiseHolds } from "@/tests/_shared/premise";

import {
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

  const generated = mutants(base);

  it("generates a mutant for every digit of every number on the SIX reconciled tables", () => {
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
    const expected =
      tablesOf(base.rates, base.surfaceMs, base.bootsAtRun) +
      tablesOf(
        base.recalibration.rates,
        base.recalibration.surfaceMs,
        base.recalibration.bootsAtRun,
      );
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

  it("refuses every single-digit deletion on all SIX tables", () => {
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
