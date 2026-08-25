/**
 * Turning measured cost into the weight the shard partition packs by, and
 * refusing every comparison that cannot be trusted.
 */
import type { Measured } from "./records";

/**
 * The median of a sample, averaging the middle PAIR when the count is even.
 *
 * Exported and used by every caller, because three private copies produced two
 * wrong ones: both `bootRatioStability` and the report's rejected historical
 * baseline picked the upper-middle value, so `[1000, 3000]` returned 3000 where the
 * median is 2000. An ordinary enrolment makes the surface population even, so that
 * was not a corner — it was the common case one enrolment away.
 */
export function median(xs: readonly number[]): number {
  const v = [...xs].sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? (v[mid] ?? 0) : ((v[mid - 1] ?? 0) + (v[mid] ?? 0)) / 2;
}

/**
 * What `bootsOf` computed for one surface at one sha, IN PARTS.
 *
 * The parts are carried and not just the total, because the total alone cannot
 * establish that a dump and a set of records describe one tree: a weight can move
 * without moving the partition, and a partition-level check then reports agreement.
 * `mutants` and `suites` are both observable in the records, so they are the two
 * places a dump from a different sha shows itself.
 */
export type ModelledSurface = {
  boots: number;
  mutants: number;
  accepted: number;
  suites: number;
  /**
   * Milliseconds per modelled boot, as the registry declared it at that sha.
   *
   * OPTIONAL, and the absence is meaningful rather than missing: a dump taken
   * before the rate existed describes a tree that really did partition by boots
   * alone. Reproducing it needs a factor of 1, which is a correct model of that
   * tree and not a default standing in for a value someone forgot to record.
   */
  millisPerBoot?: number;
};
export type ModelledBoots = ReadonlyMap<string, ModelledSurface>;

/**
 * Milliseconds of real wall clock per MODELLED boot.
 *
 * The denominator is the modelled count and not the observed one on purpose.
 * The partition multiplies this rate by modelled boots, so calibrating it
 * against the same quantity makes the product a prediction of the surface's
 * seconds; calibrating against observed children would leave a systematic
 * factor -- 4.60x on the worst surface -- between what is measured and what is
 * used. Any bias in the count is absorbed here, which is why the count only has
 * to be PROPORTIONAL to cost as a source grows, never accurate in absolute terms.
 */
export function ratePerModelledBoot(m: Measured, modelled: ModelledBoots): number | undefined {
  const boots = modelled.get(m.surfaceId)?.boots;
  if (boots === undefined || boots <= 0) return undefined;
  return (m.seconds * 1000) / boots;
}

/**
 * One run's measurements paired with the modelled boots of the sha it ran at.
 *
 * `sha` is carried because two runs can share one: the 2026-08-23 and 2026-08-24
 * nightlies both ran at `50ca72a56`. Averaging over TIME re-imports staleness and
 * is refused; averaging within ONE sha is a noise filter over repeated measurements
 * of the same program, which is a different operation with a different justification.
 */
export type Snapshot = {
  label: string;
  sha: string;
  surfaces: readonly Measured[];
  modelled: ModelledBoots;
};

/**
 * The rate each surface should declare, from the MOST RECENT snapshot in which
 * it appears.
 *
 * Most-recent and not an average over time, because an average re-imports the
 * staleness the design exists to remove: measured over four nightlies, a median
 * of the prior three scored barely better than shipping nothing, while the most
 * recent prior scored near the achievable floor on two of three pairs.
 */
export function seedRates(newestFirst: readonly Snapshot[]): Map<string, number> {
  // For each surface, find the NEWEST sha that measured it, then take the median
  // across every snapshot at that same sha. Snapshots at older shas are ignored
  // entirely rather than blended in.
  const bySurface = new Map<string, { sha: string; rates: number[] }>();
  for (const snap of newestFirst) {
    for (const m of snap.surfaces) {
      const rate = ratePerModelledBoot(m, snap.modelled);
      if (rate === undefined || rate <= 0) continue;
      const held = bySurface.get(m.surfaceId);
      if (held === undefined) {
        bySurface.set(m.surfaceId, { sha: snap.sha, rates: [rate] });
      } else if (held.sha === snap.sha) {
        held.rates.push(rate);
      }
    }
  }
  return new Map([...bySurface].map(([id, v]) => [id, Math.round(median(v.rates))]));
}

/**
 * Deterministic LPT, restated over arbitrary weights so a counterfactual can be
 * scored without touching the shipped packer. Ties break on the key, so a rerun
 * on identical input cannot report a different partition.
 */
export function lpt(items: readonly { key: string; w: number }[], n: number): Map<string, number> {
  const bins = new Array<number>(n).fill(0);
  const out = new Map<string, number>();
  for (const it of [...items].sort((a, b) => b.w - a.w || a.key.localeCompare(b.key))) {
    let best = 0;
    for (let i = 1; i < n; i += 1) if ((bins[i] ?? 0) < (bins[best] ?? 0)) best = i;
    bins[best] = (bins[best] ?? 0) + it.w;
    out.set(it.key, best);
  }
  return out;
}

/**
 * Real seconds each leg would have run, had the partition been `assign`.
 *
 * An out-of-range leg is REFUSED rather than coalesced. `noUncheckedIndexedAccess`
 * pushes toward `bins[leg] ?? 0`, and that spelling is silently catastrophic here:
 * `new Array(3).fill(0)` assigned at index 5 becomes `[0,0,0,null,null,100]`, so
 * the caller's `Math.max(...)` returns NaN and the binding leg — the one number
 * this whole model exists to bound — is quietly not a number. Throwing turns a
 * caller bug into a caller bug, which is what it is.
 *
 * A surface named by `assign` with no measurement is priced at ZERO, and that is
 * deliberate rather than defensive: an unmeasured surface is an ordinary state on
 * a registry that grew a row since the last nightly, so refusing would fail the
 * whole report over a routine condition. The zero UNDERSTATES the leg, which is
 * the dangerous direction, so it is never left silent — `driftReport` returns the
 * same surfaces under `unmeasured` and every caller here prints that list beside
 * these totals. Conservative plus surfaced is this design's stated bound; the
 * pairing is the reason it holds, so do not price the gap without printing it.
 */
export function legSeconds(
  assign: ReadonlyMap<string, number>,
  surfaces: readonly Measured[],
  n: number,
): number[] {
  const secs = new Map(surfaces.map((m) => [m.surfaceId, m.seconds]));
  // Accumulated in a Map and materialised at the end, rather than written into a
  // pre-filled array. Indexing an array to READ-then-add reintroduces exactly the
  // `bins[leg] ?? 0` the range check above exists to delete, because the compiler
  // will not narrow an indexed read from a guard on the index. Both coalesces
  // below are reachable and asserted: an empty leg, and an unpriced surface.
  const totals = new Map<number, number>();
  for (const [id, leg] of assign) {
    if (!Number.isInteger(leg) || leg < 0 || leg >= n) {
      throw new Error(`legSeconds: ${id} assigned to leg ${leg}, outside 0..${n - 1}`);
    }
    totals.set(leg, (totals.get(leg) ?? 0) + (secs.get(id) ?? 0));
  }
  return Array.from({ length: n }, (_, i) => totals.get(i) ?? 0);
}

/**
 * The binding leg, which is the quantity that breaches a budget and crosses a
 * ceiling. Spread (max/min) is NOT that quantity and is a trap: a partition that
 * leaves one leg unusually light scores a worse ratio while costing nothing,
 * and the measured pairs contain exactly that case.
 */
export const bindingLeg = (legs: readonly number[]): number => Math.max(...legs);

export type Reconciliation = {
  ok: boolean;
  /** Surfaces the records hold that the modelled set does not, and the reverse. */
  recordOnly: string[];
  modelOnly: string[];
  /** Surfaces whose recomputed leg differs from the leg they were observed in. */
  moved: { surfaceId: string; observed: number; recomputed: number }[];
  /**
   * Surfaces where the DUMP disagrees with the RECORDS about how many mutants ran
   * or how many distinct suites were entered.
   *
   * This is the arm a partition-level check cannot have. A weight can change
   * without changing the assignment -- probed on the live registry, moving one
   * surface from 8 to 12 modelled boots left the partition identical -- so
   * membership and legs both agreeing says nothing about the weights.
   */
  weightDisagreement: {
    surfaceId: string;
    field: "mutants" | "suites" | "accepted" | "boots";
    modelled: number;
    observed: number;
  }[];
  /**
   * Surface ids appearing more than once in the records.
   *
   * Collapsing them by id silently doubles that surface's seconds while every
   * other arm still reports agreement.
   */
  duplicated: string[];
};

/**
 * Prove that a set of records and a set of modelled weights describe ONE TREE.
 *
 * Total in both directions, and that is the whole point. An earlier version
 * intersected the two sets and reconciled only the overlap, which cannot see a
 * surface the model has and the run does not -- the single most likely
 * difference between two shas, since an enrolment is how surfaces arrive.
 * Probed against the live registry, removing any one of 43 surfaces still
 * reported IDENTICAL in 42 of 43 cases while the full partition differed, once
 * by 35 surfaces.
 */
export function reconcile(
  surfaces: readonly Measured[],
  modelled: ModelledBoots,
  shardCount: number,
): Reconciliation {
  const seen = new Map<string, number>();
  for (const m of surfaces) seen.set(m.surfaceId, (seen.get(m.surfaceId) ?? 0) + 1);
  const duplicated = [...seen]
    .filter(([, n]) => n > 1)
    .map(([id]) => id)
    .sort();

  const observed = new Map(surfaces.map((m) => [m.surfaceId, m.leg]));
  const recordOnly = [...observed.keys()].filter((id) => !modelled.has(id)).sort();
  const modelOnly = [...modelled.keys()].filter((id) => !observed.has(id)).sort();

  // The weights themselves, through the two components the records can witness.
  const weightDisagreement: Reconciliation["weightDisagreement"] = [];
  for (const m of surfaces) {
    const dump = modelled.get(m.surfaceId);
    if (dump === undefined) continue;
    if (dump.mutants !== m.mutants)
      weightDisagreement.push({
        surfaceId: m.surfaceId,
        field: "mutants",
        modelled: dump.mutants,
        observed: m.mutants,
      });
    // A BOUND, not an equality, and the difference is the short-circuit itself:
    // the runner stops at the first rejecting suite, so a surface whose every
    // mutant dies in suite one never spawns a child for suites two and three.
    // Observed distinct suites is therefore a LOWER bound on the declared count,
    // and `citationIntent` (3 declared, 1 observed) is an ordinary instance rather
    // than a defect. Only the other direction is impossible on one tree: a run
    // cannot enter a suite the dump does not know about.
    const suites = new Set(m.children.map((c) => c.suite)).size;
    if (suites > dump.suites)
      weightDisagreement.push({
        surfaceId: m.surfaceId,
        field: "suites",
        modelled: dump.suites,
        observed: suites,
      });
  }

  // The dump against ITSELF. `accepted` is the third input to the boot formula and
  // nothing above can witness it: moving it changes `boots` while the mutant count,
  // the suite bound and the assignment can all still agree, which is a dump from a
  // different tree passing as one from this one. There is no observable for
  // `accepted` in the records, so it is checked the only way it can be -- by
  // requiring the dump's own parts to compose into its own total. A dump whose
  // `boots` does not equal `mutants + accepted * (suites - 1) + suites` was either
  // produced by a different formula or hand-edited, and neither is a tree this
  // comparison can speak about.
  for (const [id, dump] of modelled) {
    const composed = dump.mutants + dump.accepted * (dump.suites - 1) + dump.suites;
    if (composed !== dump.boots)
      weightDisagreement.push({
        surfaceId: id,
        field: "boots",
        modelled: dump.boots,
        observed: composed,
      });
  }
  // The partition is recomputed over the MODELLED set, never over the overlap:
  // a surface the records lack still consumes a leg and displaces its neighbours.
  const recomputed = lpt(
    // Weighted by what the registry PRICED, not by the boot count alone. Once
    // production partitions by `bootsOf * millisPerBoot`, a run's observed legs
    // come from the priced weight, and recomputing from boots reports most of the
    // corpus as moved: measured on this arc's own registry, 29 of 43 surfaces
    // change leg. `ok` then goes false, the report stops before any verdict
    // comparison, and the neutrality evidence it exists to produce never appears.
    //
    // A dump with no rate is priced at 1 rather than refused. That dump was taken
    // before the field existed, at a sha whose partition really was by boots
    // alone, so 1 reproduces that tree exactly. It is a correct model of an old
    // tree and not a fallback for a value someone forgot to write down.
    [...modelled].map(([key, v]) => ({ key, w: v.boots * (v.millisPerBoot ?? 1) })),
    shardCount,
  );
  const moved = [...observed]
    .filter(([id, leg]) => recomputed.has(id) && recomputed.get(id) !== leg)
    .map(([surfaceId, leg]) => ({
      surfaceId,
      observed: leg,
      recomputed: recomputed.get(surfaceId) as number,
    }))
    .sort((a, b) => a.surfaceId.localeCompare(b.surfaceId));
  return {
    ok:
      recordOnly.length === 0 &&
      modelOnly.length === 0 &&
      moved.length === 0 &&
      weightDisagreement.length === 0 &&
      duplicated.length === 0,
    recordOnly,
    modelOnly,
    moved,
    weightDisagreement,
    duplicated,
  };
}

export type Drift = {
  surfaceId: string;
  declaredMillis: number;
  observedMillis: number;
  /** Always >= 1, whichever way the rate moved. */
  ratio: number;
  actionable: boolean;
};

/**
 * Every surface, with how far its declared rate sits from what it just charged.
 *
 * EVERY surface, not only the ones past the threshold. The consequence bound
 * this design ships promises that a misdeclared rate is NAMED, and a report that
 * speaks only above a threshold leaves every ratio inside it unnamed while the
 * promise still stands in the spec. The threshold decides what is ACTIONABLE; it
 * does not decide what is visible.
 */
/**
 * The seed table the registry is written from, or a refusal naming what it cannot price.
 *
 * A PURE function rather than logic inside the CLI, because the property that matters is
 * an ORDER: the bootstrap overrides must be merged BEFORE completeness is judged, or a
 * surface that was explicitly given a rate is still reported as unmeasured and the
 * bootstrap can never close. Order inside a main() is provable only by spawning it;
 * order inside a function is provable by calling it.
 */
export function buildSeedTable(
  fromRecords: ReadonlyMap<string, number>,
  overrides: ReadonlyMap<string, number>,
  surfaceIds: readonly string[],
):
  | { ok: true; table: Map<string, number> }
  | { ok: false; missing: string[]; unmatched: string[] } {
  const ids = new Set(surfaceIds);
  // An override naming no row is refused rather than dropped. A bootstrap rate is
  // hand-typed from a score run, so the realistic failure is a misspelled id, and
  // silently ignoring it leaves the REAL surface unpriced under a different spelling —
  // reported as "unmeasured" while its rate sits right there in the invocation.
  const unmatched = [...overrides.keys()].filter((id) => !ids.has(id)).sort();

  // MERGE FIRST. Overrides go in on top of the records, and completeness is judged
  // against the merged table below. Judged first, a surface explicitly given a rate is
  // still called unmeasured and the bootstrap can never close.
  const table = new Map(fromRecords);
  for (const [id, rate] of overrides) if (ids.has(id)) table.set(id, rate);

  const missing = surfaceIds.filter((id) => !table.has(id)).sort();
  if (missing.length > 0 || unmatched.length > 0) return { ok: false, missing, unmatched };
  return { ok: true, table };
}

/**
 * One held-out pair: rates seeded from an EARLIER run, scored on a LATER one.
 *
 * Extracted so the report and the suite that pins AC-3 run the SAME comparison. A
 * suite that re-implemented it would be asserting against its own arithmetic rather
 * than against the thing the spec's figures came from, and the two could drift apart
 * without either failing.
 *
 * A surface the seed run never saw is EXCLUDED from both sides rather than priced.
 * There is no honest fallback: using the later run's own rate makes boots x rate
 * reproduce that run's seconds exactly, so the surface scores itself. An earlier
 * version did that and quietly contaminated two of three pairs.
 */
/**
 * The modelled parts of ONE surface, recovered from the fields the registry holds.
 *
 * Extracted so the recovery is testable at all. It lived inside the report's
 * `modelledFrom`, which nothing drives, so the plant that claimed to cover it named a
 * suite that cannot see the report — it reported CAUGHT while the mutation ran against
 * code the decider never loads. A plant caught for the wrong reason is worse than no
 * plant, because it reads as coverage.
 *
 * `boots` MUST be the boot count, never a priced weight: the mutant total is recovered
 * by subtracting the ledger and suite terms from it, so a priced input yields a count
 * wrong by a factor of the rate — and it is that recovered count the reconciliation
 * compares against what actually ran.
 */
export function recoverModelled(
  boots: number,
  acceptedCount: number,
  suites: number,
  millisPerBoot: number,
): ModelledSurface {
  return {
    boots,
    mutants: boots - acceptedCount * (suites - 1) - suites,
    accepted: acceptedCount,
    suites,
    millisPerBoot,
  };
}

export function heldOutMargin(
  seed: ReadonlyMap<string, number>,
  laterSurfaces: readonly Measured[],
  laterModelled: ModelledBoots,
  shardCount: number,
): { scored: Measured[]; excluded: string[]; seconds: number[]; boots: number[] } {
  const scored = laterSurfaces.filter((m) => seed.has(m.surfaceId));
  const excluded = laterSurfaces
    .filter((m) => !seed.has(m.surfaceId))
    .map((m) => m.surfaceId)
    .sort();
  const bootsFor = (id: string): number => laterModelled.get(id)?.boots ?? 0;
  const seconds = legSeconds(
    lpt(
      scored.map((m) => ({
        key: m.surfaceId,
        w: bootsFor(m.surfaceId) * (seed.get(m.surfaceId) ?? 0),
      })),
      shardCount,
    ),
    scored,
    shardCount,
  );
  const boots = legSeconds(
    lpt(
      scored.map((m) => ({ key: m.surfaceId, w: bootsFor(m.surfaceId) })),
      shardCount,
    ),
    scored,
    shardCount,
  );
  return { scored, excluded, seconds, boots };
}

export function driftReport(
  declared: ReadonlyMap<string, number>,
  surfaces: readonly Measured[],
  modelled: ModelledBoots,
  actionableAt: number,
): { drifted: Drift[]; unmeasured: string[]; undeclared: string[] } {
  const seen = new Set<string>();
  const drifted: Drift[] = [];
  // A surface that RAN but has no declared rate is its own state. An earlier
  // version `continue`d past it, so a newly enrolled surface -- the one case where
  // a missing rate matters most -- appeared in no list at all while the report
  // still claimed to name everything.
  const undeclared: string[] = [];
  for (const m of surfaces) {
    const dec = declared.get(m.surfaceId);
    const obs = ratePerModelledBoot(m, modelled);
    if (obs === undefined || obs <= 0) continue;
    if (dec === undefined || dec <= 0) {
      undeclared.push(m.surfaceId);
      continue;
    }
    seen.add(m.surfaceId);
    const ratio = Math.max(dec, obs) / Math.min(dec, obs);
    drifted.push({
      surfaceId: m.surfaceId,
      declaredMillis: dec,
      observedMillis: Math.round(obs),
      ratio,
      actionable: ratio > actionableAt,
    });
  }
  undeclared.sort();
  // Unmeasured is its own state, never folded into agreeing: a surface whose leg
  // died reports nothing, and reading that as "the rate is fine" is the silence
  // this whole harness keeps being bitten by.
  const unmeasured = [...declared.keys()].filter((id) => !seen.has(id)).sort();
  drifted.sort((a, b) => b.ratio - a.ratio || a.surfaceId.localeCompare(b.surfaceId));
  return { drifted, unmeasured, undeclared };
}

export type VerdictDelta = {
  sharedSurfaces: number;
  sharedSiteIds: number;
  moved: { surfaceId: string; siteId: string; from: string; to: string }[];
};

/**
 * Which mutants reached a DIFFERENT verdict between two runs.
 *
 * Restricted to siteIds present in both, because a mutant that did not exist on
 * one side has no verdict to disagree with — counting it as a move would
 * report every source edit as a verdict regression. The shared count is
 * returned alongside, so a comparison over almost nothing cannot read as a
 * clean result.
 */
export function verdictDelta(
  before: readonly Measured[],
  after: readonly Measured[],
): VerdictDelta {
  const b = new Map(before.map((m) => [m.surfaceId, m]));
  const moved: VerdictDelta["moved"] = [];
  let sharedSurfaces = 0;
  let sharedSiteIds = 0;
  for (const m of after) {
    const prev = b.get(m.surfaceId);
    if (prev === undefined) continue;
    sharedSurfaces += 1;
    for (const [siteId, verdict] of m.verdicts) {
      const was = prev.verdicts.get(siteId);
      if (was === undefined) continue;
      sharedSiteIds += 1;
      if (was !== verdict) moved.push({ surfaceId: m.surfaceId, siteId, from: was, to: verdict });
    }
  }
  moved.sort((a, c) => a.surfaceId.localeCompare(c.surfaceId) || a.siteId.localeCompare(c.siteId));
  return { sharedSurfaces, sharedSiteIds, moved };
}

/**
 * How many surfaces land on a different leg under two weight functions.
 *
 * This is the fleet consequence of any weight change and the number a readiness
 * report owes the other arcs: every leg number written down before the change
 * is wrong for these surfaces afterwards.
 */
export function seamMagnitude(
  a: ReadonlyMap<string, number>,
  b: ReadonlyMap<string, number>,
  shardCount: number,
): string[] {
  const pa = lpt(
    [...a].map(([key, w]) => ({ key, w })),
    shardCount,
  );
  const pb = lpt(
    [...b].map(([key, w]) => ({ key, w })),
    shardCount,
  );
  return [...pa.keys()].filter((k) => pb.has(k) && pa.get(k) !== pb.get(k)).sort();
}

/**
 * The per-surface `observed / modelled` boot ratio, and how much it MOVED.
 *
 * Documented limit L-6 rests on both halves: the ratio is far from 1 in a tail
 * (so the count model carries a real bias, which the rate absorbs), and it barely
 * moves (so the absorption does not silently expire). A limit asserting the first
 * without the second would read as a warning rather than as a bound.
 */
export function bootRatioStability(
  newestFirst: readonly Snapshot[],
  movedBy: number,
): {
  latest: { min: number; median: number; max: number; maxSurface: string };
  moved: { surfaceId: string; ratios: number[]; factor: number }[];
} {
  const per = newestFirst.map(
    (snap) =>
      new Map(
        snap.surfaces
          .map(
            (m) =>
              [
                m.surfaceId,
                m.observedBoots / (snap.modelled.get(m.surfaceId)?.boots ?? 0),
              ] as const,
          )
          .filter(([, r]) => Number.isFinite(r) && r > 0),
      ),
  );
  const first = per[0] ?? new Map<string, number>();
  const vals = [...first.values()].sort((a, b) => a - b);
  const maxSurface = [...first].reduce((a, b) => (b[1] > a[1] ? b : a), ["", 0] as [
    string,
    number,
  ])[0];
  const moved: { surfaceId: string; ratios: number[]; factor: number }[] = [];
  for (const id of first.keys()) {
    // OLDEST first, matching `bootCountHistory`, so a reader comparing the two
    // blocks is not silently reading one of them backwards.
    const ratios = [...per]
      .reverse()
      .map((m) => m.get(id))
      .filter((r): r is number => r !== undefined);
    if (ratios.length < 2) continue;
    const factor = Math.max(...ratios) / Math.min(...ratios);
    if (factor > movedBy) moved.push({ surfaceId: id, ratios, factor });
  }
  moved.sort((a, b) => b.factor - a.factor);
  return {
    latest: {
      min: vals[0] ?? 0,
      median: median(vals),
      max: Math.max(...vals),
      maxSurface,
    },
    moved,
  };
}

/**
 * Surfaces whose MODELLED boot count changed across the snapshots, and those that
 * ARRIVED. The two are reported apart because they are different events with
 * different consequences: a count change is repriced automatically by the derived
 * half, and an arrival is the case a bolt-on table cannot price at all.
 */
export function bootCountHistory(newestFirst: readonly Snapshot[]): {
  changed: { surfaceId: string; boots: (number | undefined)[] }[];
  arrived: string[];
} {
  const order = [...newestFirst].reverse();
  const ids = new Set(order.flatMap((s) => [...s.modelled.keys()]));
  const changed: { surfaceId: string; boots: (number | undefined)[] }[] = [];
  const arrived: string[] = [];
  for (const id of [...ids].sort()) {
    const boots = order.map((s) => s.modelled.get(id)?.boots);
    if (boots[0] === undefined) arrived.push(id);
    const seen = boots.filter((b): b is number => b !== undefined);
    if (new Set(seen).size > 1 || boots[0] === undefined) changed.push({ surfaceId: id, boots });
  }
  return { changed, arrived };
}

/** Per-suite median child duration for one surface, which is L-5's evidence. */
export function suiteMedians(m: Measured): { suite: string; children: number; medianMs: number }[] {
  const by = new Map<string, number[]>();
  for (const c of m.children) by.set(c.suite, [...(by.get(c.suite) ?? []), c.durationMs]);
  return [...by]
    .map(([suite, xs]) => ({ suite, children: xs.length, medianMs: Math.round(median(xs)) }))
    .sort((a, b) => b.medianMs - a.medianMs);
}
