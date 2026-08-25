/**
 * Turning measured cost into the weight the shard partition packs by, and
 * refusing every comparison that cannot be trusted.
 */
import type { Measured } from "./records";

/** Modelled boots per surface, as `bootsOf` computes them at one sha. */
export type ModelledBoots = ReadonlyMap<string, number>;

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
  const boots = modelled.get(m.surfaceId);
  if (boots === undefined || boots <= 0) return undefined;
  return (m.seconds * 1000) / boots;
}

/** One run's measurements paired with the modelled boots of the sha it ran at. */
export type Snapshot = { label: string; surfaces: readonly Measured[]; modelled: ModelledBoots };

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
  const out = new Map<string, number>();
  for (const snap of newestFirst) {
    for (const m of snap.surfaces) {
      if (out.has(m.surfaceId)) continue;
      const rate = ratePerModelledBoot(m, snap.modelled);
      if (rate !== undefined && rate > 0) out.set(m.surfaceId, Math.round(rate));
    }
  }
  return out;
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

/** Real seconds each leg would have run, had the partition been `assign`. */
export function legSeconds(
  assign: ReadonlyMap<string, number>,
  surfaces: readonly Measured[],
  n: number,
): number[] {
  const secs = new Map(surfaces.map((m) => [m.surfaceId, m.seconds]));
  const bins = new Array<number>(n).fill(0);
  for (const [id, leg] of assign) bins[leg] = (bins[leg] ?? 0) + (secs.get(id) ?? 0);
  return bins;
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
  const observed = new Map(surfaces.map((m) => [m.surfaceId, m.leg]));
  const recordOnly = [...observed.keys()].filter((id) => !modelled.has(id)).sort();
  const modelOnly = [...modelled.keys()].filter((id) => !observed.has(id)).sort();
  // The partition is recomputed over the MODELLED set, never over the overlap:
  // a surface the records lack still consumes a leg and displaces its neighbours.
  const recomputed = lpt(
    [...modelled].map(([key, w]) => ({ key, w })),
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
    ok: recordOnly.length === 0 && modelOnly.length === 0 && moved.length === 0,
    recordOnly,
    modelOnly,
    moved,
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
export function driftReport(
  declared: ReadonlyMap<string, number>,
  surfaces: readonly Measured[],
  modelled: ModelledBoots,
  actionableAt: number,
): { drifted: Drift[]; unmeasured: string[] } {
  const seen = new Set<string>();
  const drifted: Drift[] = [];
  for (const m of surfaces) {
    const dec = declared.get(m.surfaceId);
    const obs = ratePerModelledBoot(m, modelled);
    if (dec === undefined || obs === undefined || dec <= 0 || obs <= 0) continue;
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
  // Unmeasured is its own state, never folded into agreeing: a surface whose leg
  // died reports nothing, and reading that as "the rate is fine" is the silence
  // this whole harness keeps being bitten by.
  const unmeasured = [...declared.keys()].filter((id) => !seen.has(id)).sort();
  drifted.sort((a, b) => b.ratio - a.ratio || a.surfaceId.localeCompare(b.surfaceId));
  return { drifted, unmeasured };
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
