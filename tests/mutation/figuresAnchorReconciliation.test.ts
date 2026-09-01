import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

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

  const generated = mutants(base);

  it("generates a mutant for every digit of every number on the three tables", () => {
    const expected = Object.keys(base.rates).reduce(
      (n, id) =>
        n +
        digitDeletions(base.rates[id]!.observedPerBoot).length +
        digitDeletions(base.surfaceMs[id]!).length +
        digitDeletions(base.bootsAtRun[id]!).length,
      0,
    );
    expect(generated.length).toBe(expected);
    expect(generated.length).toBeGreaterThan(3 * Object.keys(base.rates).length);
  });

  it("refuses every single-digit deletion on all three tables", () => {
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
