import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { generateMutants } from "./generate";
import { enumerateSites, siteId } from "./operators";
import type { Verdict } from "./oracle";
import { classify } from "./oracle";
import { GUARD_SURFACES, type GuardSurface } from "./registry";
import { type ChildRecord, MutantRunInfraError, runMutantRecorded } from "./runner";

/**
 * The determinism harness core (spec §5.4) — probe 3, productized and pointable
 * at any site.
 *
 * Authored as an IMPORTABLE MODULE with a referring Vitest suite from the start
 * (AC-9). A CLI-shaped surface scores as if untested: the source-mutation runner
 * overlays modules IN MEMORY and a spawned `tsx` child reads them from DISK, so
 * every branch reached only through a subprocess is invisible to it.
 *
 * The per-run shape is the SAME per-child record `runner.ts` defines, one entry
 * per suite actually run. Singular per-run fields are deliberately not the shape
 * here: several enrolled surfaces declare two deciding suites and one declares
 * ten, and a harness reporting one kind and one code per run would discard
 * earlier children exactly as the shipped record does today.
 */

export type RunObservation = {
  run: number;
  verdict: Verdict;
  exitCode: number;
  children: readonly ChildRecord[];
};

/**
 * A digest over the run's DECLARED inputs — its source, its deciding suites and
 * its declared operators. NOT everything the run reads: a deciding suite may open
 * paths the registry does not declare (spec §6 limit 10).
 *
 * PROVENANCE IS PART OF THE CLAIM, NOT DECORATION (AC-8). A constant or
 * fabricated stamp associates a distribution with the wrong bytes, which is
 * wrong attribution — the direction the consequence bound forbids. So this is
 * DERIVED from the source, the deciding suites and the registry row's declared
 * operators and floor, and it is read from DISK because that is what the
 * harness itself reads on disk: a git-sourced stamp would certify bytes that did
 * not run. Within the declared set that holds exactly; outside it, the stamp is
 * silent rather than wrong, and the rendering says so on every result.
 */
export type InputStamp = {
  digest: string;
  files: Record<string, string>;
  operators: string;
  count: number;
};

export type DeterminismInput = {
  surface: string;
  site: string;
  runs: unknown;
  root?: string;
};

export type RefusedInput = "runs" | "surface" | "site" | "baseline" | "population";

export type DeterminismOutcome =
  | {
      kind: "refusal";
      /** WHICH input failed — never a bare "not found" (spec §5.4). */
      input: RefusedInput;
      detail: string;
    }
  | {
      kind: "result";
      surfaceId: string;
      siteId: string;
      runs: number;
      observations: RunObservation[];
      /** verdict -> count over completed runs. */
      verdicts: Record<string, number>;
      /** child kind -> count over every child of every completed run. */
      kinds: Record<string, number>;
      stampBefore: InputStamp;
      stampAfter: InputStamp;
      /**
       * Declared inputs whose bytes differ between the two stamps, i.e. that
       * moved WHILE the run was in flight. Non-empty means the distribution is
       * real but UNATTRIBUTABLE: it was produced by a set of inputs that no
       * longer exists, so it is reported and explicitly not certified.
       */
      inputsMoved: string[];
      /**
       * Runs that did NOT complete, one entry each. Reported rather than
       * silently reducing the denominator: a distribution over 4 of 6 runs is a
       * different claim from one over 6, and a reader must be able to tell.
       */
      infraFaults: string[];
    };

/**
 * `--runs` is an ACCEPT-SET with the complement DEFAULT-DENIED.
 *
 * Accepted iff it parses as an integer with value >= 1. Everything else is
 * refused — missing, empty, non-numeric, `NaN`, `Infinity`, fractional, zero,
 * negative, and anything else the complement contains. Enumerating the rejects
 * would be a denylist, and a denylist accepts whatever it did not model.
 */
export function parseRuns(
  value: unknown,
): { ok: true; runs: number } | { ok: false; detail: string } {
  if (value === undefined || value === null) return { ok: false, detail: "--runs is required" };
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 1
      ? { ok: true, runs: value }
      : { ok: false, detail: `--runs must be an integer >= 1, got ${String(value)}` };
  }
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, detail: `--runs must be an integer >= 1, got ${JSON.stringify(value)}` };
  }
  const text = value.trim();
  // Anchored and digits-only BY CONSTRUCTION, so "2.5", "1e3", "Infinity",
  // "NaN", "0x2" and " 2 " never reach Number() at all. `Number("2.5")` is a
  // finite number and `Math.trunc` would silently accept it as 2 — coercing a
  // fraction into a loop bound is precisely the weaker implementation AC-8 names.
  if (!/^[+-]?\d+$/.test(text)) {
    return { ok: false, detail: `--runs must be an integer >= 1, got ${JSON.stringify(value)}` };
  }
  const n = Number(text);
  return Number.isSafeInteger(n) && n >= 1
    ? { ok: true, runs: n }
    : { ok: false, detail: `--runs must be an integer >= 1, got ${JSON.stringify(value)}` };
}

function hashBytes(bytes: Buffer, what: string): string {
  if (bytes.length === 0) {
    throw new Error(`EMPTY INPUT: ${what} — refusing to stamp an empty file as if it were content`);
  }
  return createHash("sha256").update(bytes).digest("hex").slice(0, 12);
}

function hashFile(path: string): string {
  return hashBytes(readFileSync(path), path);
}

/**
 * Stamp the surface's declared inputs.
 *
 * `executed` overrides the DISK READ for a path whose bytes the caller already
 * holds — the source is snapshotted into memory before the run, and an ordinary
 * save between that snapshot and this call would otherwise make BOTH stamps
 * describe bytes that never executed, agreeing with each other so no mismatch
 * could ever surface. The stamp must read what RAN, which is not always what is
 * on disk when the stamp is taken.
 */
export function stampInputs(
  root: string,
  surface: GuardSurface,
  executed: Readonly<Record<string, string>> = {},
): InputStamp {
  const paths = [surface.sourcePath, ...surface.suitePaths];
  const files: Record<string, string> = {};
  // DECLARED ORDER, duplicates preserved. `runMutantRecorded` runs the suites in
  // this order and SHORT-CIRCUITS on the first non-zero, so the order and the
  // multiplicity are both inputs to the outcome; a digest built from a sorted,
  // path-keyed map reports two input sets that produce different runs as one.
  const ordered: string[] = [];
  for (const p of paths) {
    const override = executed[p];
    const hash =
      override === undefined
        ? hashFile(resolve(root, p))
        : hashBytes(Buffer.from(override, "utf8"), p);
    files[p] = hash;
    ordered.push(`${p}:${hash}`);
  }
  // The DECLARED OPERATORS and the floor are inputs to the score in exactly the
  // way the source is, and they live in a file that does not look like code
  // under test — which is why an input set that reads as obvious omits them.
  const operators = `${[...surface.operators].sort().join(",")}|floor=${surface.scoreFloor}`;
  const digest = createHash("sha256")
    .update(`${ordered.join("\n")}\n${operators}`)
    .digest("hex")
    .slice(0, 12);
  return { digest, files, operators, count: paths.length };
}

export function findSurface(id: string): GuardSurface | undefined {
  return GUARD_SURFACES.find((s) => s.id === id);
}

/**
 * Run ONE named site `runs` times and report the distribution.
 *
 * Every refusal returns a `refusal` outcome naming WHICH input failed and emits
 * NO distribution, so a swept-and-clean run can never read as a run that never
 * started.
 */
export function runDeterminism(input: DeterminismInput): DeterminismOutcome {
  const root = input.root ?? process.cwd();

  const runsParsed = parseRuns(input.runs);
  if (!runsParsed.ok) return { kind: "refusal", input: "runs", detail: runsParsed.detail };
  const runs = runsParsed.runs;

  const surface = findSurface(input.surface);
  if (surface === undefined) {
    return {
      kind: "refusal",
      input: "surface",
      detail: `no enrolled surface with id ${JSON.stringify(input.surface)}`,
    };
  }

  const target = resolve(root, surface.sourcePath);
  const text = readFileSync(target, "utf8");
  const sites = enumerateSites(target, text, surface.operators);
  const { mutants } = generateMutants(target, text, surface.operators, sites);
  const mutant = mutants.find((m) => siteId(m.site) === input.site);
  if (mutant === undefined) {
    return {
      kind: "refusal",
      input: "site",
      detail:
        `site ${JSON.stringify(input.site)} resolves in no generated set for surface ` +
        `${surface.id} (${mutants.length} mutant(s) generated). The SURFACE resolved; the SITE did not.`,
    };
  }

  // Bound to `text` — the bytes this run snapshotted and generated its mutant
  // from — rather than to a second read of the same path.
  const stampBefore = stampInputs(root, surface, { [surface.sourcePath]: text });

  const scratch = mkdtempSync(join(tmpdir(), "fx-determinism-"));
  const mutantFile = join(scratch, "mutant.ts");
  // EVERY stamp taken, not just the two endpoints. A declared suite edited to B
  // and reverted to A while the runs are in flight produces IDENTICAL endpoints —
  // the children spawned in between executed B, and an endpoint comparison
  // reports nothing at all. Stamping around each run shrinks the invisible window
  // from the whole invocation to one child's lifetime (spec §6 limit 11).
  const stamps: InputStamp[] = [stampBefore];
  const observations: RunObservation[] = [];
  const infraFaults: string[] = [];
  try {
    writeFileSync(mutantFile, text);
    const baseline = runMutantRecorded(
      root,
      target,
      mutantFile,
      surface.suitePaths,
      `${surface.id} baseline`,
    );
    if (baseline.code !== 0) {
      return {
        kind: "refusal",
        input: "baseline",
        detail:
          `${surface.id}: the suite is RED on unmutated source (exit ${baseline.code}). ` +
          `Against a red baseline every mutant scores KILLED and the distribution is meaningless.`,
      };
    }

    for (let run = 1; run <= runs; run += 1) {
      stamps.push(stampInputs(root, surface));
      writeFileSync(mutantFile, mutant.text);
      try {
        const { code, children } = runMutantRecorded(
          root,
          target,
          mutantFile,
          surface.suitePaths,
          `${surface.id} ${input.site} run ${run}`,
        );
        observations.push({ run, verdict: classify(code), exitCode: code, children });
      } catch (e) {
        // An INFRA FAULT is not a verdict and must never be folded into one — a
        // child that died on a signal is the harness failing, and scoring it as
        // detection is the inflation `MutantRunInfraError` exists to prevent. So
        // the run does not COMPLETE: it is reported and excluded from the
        // distribution rather than counted as KILLED.
        //
        // This catch is also what makes the zero-completed-runs abort below
        // REACHABLE. Without it `runs >= 1` guarantees at least one observation
        // and that abort is a guard whose condition is false where it runs —
        // which would pass unconditionally and forever.
        if (!(e instanceof MutantRunInfraError)) throw e;
        infraFaults.push(`run ${run}: ${e.message}`);
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  // ABORT-WHEN-VACUOUS. A positive control proves an instrument CAN fire; an
  // abort proves it REFUSES TO REPORT when it cannot, and unlike a control it is
  // a precondition of every run rather than a step that can drift away.
  if (observations.length === 0) {
    return {
      kind: "refusal",
      input: "population",
      detail:
        `every input validated and ZERO of ${runs} run(s) COMPLETED for ${surface.id} ` +
        `${input.site}; refusing to print a distribution over an empty population. ` +
        `Infra faults: ${infraFaults.length === 0 ? "none recorded" : infraFaults.join(" | ")}`,
    };
  }

  const stampAfter = stampInputs(root, surface);
  stamps.push(stampAfter);
  // Printing two digests and leaving a reader to compare them by eye is the same
  // defect as printing an exit code without branching on it: it LOOKS like
  // diligence and is indistinguishable from having not checked.
  //
  // Computed across the WHOLE sequence rather than between the endpoints: a path
  // whose hash is not constant at EVERY stamp moved, whether or not it came back.
  const inputsMoved = Object.keys(stampBefore.files).filter((p) =>
    stamps.some((s) => s.files[p] !== stampBefore.files[p]),
  );

  const verdicts: Record<string, number> = {};
  const kinds: Record<string, number> = {};
  for (const o of observations) {
    verdicts[o.verdict] = (verdicts[o.verdict] ?? 0) + 1;
    for (const c of o.children) kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
  }

  return {
    kind: "result",
    infraFaults,
    surfaceId: surface.id,
    siteId: input.site,
    runs,
    observations,
    verdicts,
    kinds,
    stampBefore,
    stampAfter,
    inputsMoved,
  };
}

/** The operator-facing rendering. Pure: takes a result, returns text, reads nothing. */
export function renderDeterminism(outcome: DeterminismOutcome): string {
  if (outcome.kind === "refusal") {
    return `REFUSED (${outcome.input}): ${outcome.detail}`;
  }
  const lines: string[] = [];
  lines.push(`surface: ${outcome.surfaceId}`);
  lines.push(`site: ${outcome.siteId}`);
  lines.push(`runs: ${outcome.runs}`);
  lines.push(
    `stamp before: ${outcome.stampBefore.digest} over ${outcome.stampBefore.count} input(s)`,
  );
  for (const o of outcome.observations) {
    lines.push(`run ${o.run}: ${o.verdict} (exit ${o.exitCode})`);
    for (const c of o.children) {
      lines.push(
        `  ${c.suite} kind=${c.kind} exitCode=${String(c.exitCode)} durationMs=${c.durationMs}`,
      );
    }
  }
  lines.push(
    `verdicts: ${Object.entries(outcome.verdicts)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${k}=${v}`)
      .join(" ")}`,
  );
  lines.push(
    `kinds: ${Object.entries(outcome.kinds)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${k}=${v}`)
      .join(" ")}`,
  );
  if (outcome.infraFaults.length > 0) {
    // Reported, never folded into the distribution: a run that did not complete
    // is not a data point, and omitting it entirely would misreport how many
    // runs the distribution actually covers.
    lines.push(`infra faults (runs EXCLUDED from the distribution): ${outcome.infraFaults.length}`);
    for (const f of outcome.infraFaults) lines.push(`  ${f}`);
  }
  lines.push(`stamp after: ${outcome.stampAfter.digest} over ${outcome.stampAfter.count} input(s)`);
  // COVERAGE, stated on every run rather than left to be inferred from an empty
  // list. A deciding suite may read inputs the registry does not declare — a
  // corpus walk is the measured case — so "no declared input moved" is the
  // claim this stamp can support, and it is strictly weaker than "nothing moved".
  lines.push(
    `stamp coverage: DECLARED inputs only (source, deciding suites, declared operators). ` +
      `A suite that reads undeclared inputs — a corpus walk, a fixture tree — can change a ` +
      `child's exit with both stamps identical. See spec §6 limit 10.`,
  );
  if (outcome.inputsMoved.length > 0) {
    lines.push(
      `INPUTS MOVED DURING THE RUN — this distribution is NOT attributable to any current tree:`,
    );
    for (const p of outcome.inputsMoved) {
      lines.push(`  ${p}: ${outcome.stampBefore.files[p]} -> ${outcome.stampAfter.files[p]}`);
    }
  }
  return lines.join("\n");
}
