import { readFileSync, statSync } from "node:fs";
import type { Verdict } from "../source/oracle";
import type { MutantOutcome, RunResult } from "../source/runner";
import type { MutantEdit } from "./registry";

/**
 * The pure half of the browser-mutant runner (spec §3.3, §3.4).
 *
 * Nothing here spawns. The spawn wrapper is thin by design (spec §6) because a
 * spawn boundary cannot be expressed without executing Playwright; everything a
 * fast suite CAN pin — edit application, manifest construction, the verdict
 * table, outcome accounting — lives in this module instead, and is enrolled in
 * the source-mutation registry.
 */

/** One overlaid module: the real file, and the temp file holding its mutant text. */
export type ManifestEntry = { target: string; mutant: string };

/**
 * Apply a mutant's edits to the texts the caller read.
 *
 * ATOMIC. Any anchor that does not occur exactly once refuses the WHOLE mutant
 * and lists every miss in one message, because a partially-applied multi-site
 * mutant is a different mutant than the one enrolled — and the five- and
 * two-site rows in the payload are precisely the ones where that matters.
 *
 * Edits to the same file compose in order: the relocation shape (remove a token
 * from a target, add it to the inner visual) is two edits on one file, and the
 * second must see the first's output.
 */
export function applyEdits(
  files: ReadonlyMap<string, string>,
  edits: readonly MutantEdit[],
): Map<string, string> {
  const out = new Map<string, string>();
  const problems: string[] = [];

  for (const edit of edits) {
    const current = out.get(edit.file) ?? files.get(edit.file);
    if (current === undefined) {
      problems.push(`no source text was read for ${edit.file}`);
      continue;
    }
    const occurrences = edit.from === "" ? 0 : current.split(edit.from).length - 1;
    if (occurrences !== 1) {
      problems.push(
        `anchor ${occurrences === 0 ? "does not occur" : `occurs ${occurrences} times`} in ` +
          `${edit.file}: ${JSON.stringify(edit.from)}`,
      );
      continue;
    }
    // A FUNCTION replacement, never the string form: `String.prototype.replace`
    // interprets `$&`, `$1`, `` $` `` and `$'` in a string replacement, so a
    // mutant whose `to` contained one would be applied as something other than
    // its declared text — silently, and the run would score a mutant nobody
    // wrote. A function replacement is inserted verbatim.
    out.set(
      edit.file,
      current.replace(edit.from, () => edit.to),
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `mutant refused; ${problems.length} edit(s) could not be applied and a partially ` +
        `applied mutant is a different mutant:\n  ${problems.join("\n  ")}`,
    );
  }
  return out;
}

/**
 * The overlay manifest every layer reads (spec §2 flag-lifecycle table).
 *
 * ONE mechanism for all three consumers — the esbuild bundle plugin, the
 * tap-target spec's CSS assembly, and the browser-mode vitest config — so an
 * N-file mutant is expressed uniformly rather than through the vitest mode's
 * single-target `MUTATION_TARGET`/`MUTATION_MUTANT` pair, which this mode never
 * reads.
 */
export function buildManifest(entries: readonly ManifestEntry[]): string {
  if (entries.length === 0) {
    throw new Error(
      "refusing to build an empty overlay manifest: every mutant overlays at least one file, " +
        "and an empty manifest would let every consumer serve CLEAN source while looking live",
    );
  }
  return JSON.stringify({ entries }, null, 2);
}

/** Parse and shape-check a manifest. Throws rather than returning a partial. */
export function parseManifest(text: string): ManifestEntry[] {
  const parsed: unknown = JSON.parse(text);
  const entries = (parsed as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(entries)) {
    throw new Error("overlay manifest is malformed: expected an `entries` array");
  }
  return entries.map((raw, i) => {
    const entry = raw as Partial<ManifestEntry>;
    if (typeof entry?.target !== "string" || typeof entry?.mutant !== "string") {
      throw new Error(`overlay manifest entry ${i} is malformed: expected {target, mutant}`);
    }
    return { target: entry.target, mutant: entry.mutant };
  });
}

/** What a playwright child's json report proves about whether tests actually ran. */
export type ReportEvidence = { present: boolean; fresh: boolean; executed: number };

/**
 * Read a playwright json report as EXECUTION evidence.
 *
 * Freshness is checked against the spawn time even though the runner deletes the
 * report before each child: if the delete ever fails silently, a previous
 * child's report must not be read as this child's proof. A malformed or
 * stats-less report reports zero executed rather than throwing — the caller
 * turns that into an infra verdict, which is the same outcome with a better
 * message.
 */
export function reportEvidence({
  path,
  spawnedAt,
}: {
  path: string;
  spawnedAt: number;
}): ReportEvidence {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    return { present: false, fresh: false, executed: 0 };
  }

  const fresh = mtimeMs >= spawnedAt;
  try {
    const stats = (JSON.parse(readFileSync(path, "utf8")) as { stats?: Record<string, number> })
      .stats;
    if (!stats) return { present: true, fresh, executed: 0 };
    // `skipped` is deliberately excluded: a run that skipped every test executed
    // nothing and observed nothing.
    const executed = (stats.expected ?? 0) + (stats.unexpected ?? 0) + (stats.flaky ?? 0);
    return { present: true, fresh, executed };
  } catch {
    return { present: true, fresh, executed: 0 };
  }
}

/**
 * The §3.4 verdict table.
 *
 * A non-zero exit is not evidence by itself. Three causes are distinguishable:
 * the suite noticed the mutant (detection), the mutant broke the build
 * (detection — limit §8.6), and the HARNESS failed before the overlay was live
 * (NOT detection: scoring it KILLED fabricates a kill, and a systematically
 * broken setup fabricates a perfect score).
 */
export type ChildClassification = "KILLED" | "DID_NOT_KILL" | { infra: string };

export function classifyChild(input: {
  kind: "playwright" | "vitest";
  sentinelPresent: boolean;
  /**
   * The child's exit status, or a non-number when it produced none: a signal, an
   * OOM, a spawn failure. `undefined` is admitted DELIBERATELY — see the check.
   */
  exitStatus: number | null | undefined;
  report?: ReportEvidence;
}): ChildClassification {
  if (!input.sentinelPresent) {
    return {
      infra:
        "the overlay sentinel is absent: the manifest never validated, so nothing this child " +
        "did observed the mutant and no verdict it produced can be scored",
    };
  }

  // Anything that is not a NUMBER, rather than `=== null` (diff review round 4).
  // The runner assigns null on a non-numeric death, so `=== null` looked total —
  // but `statement-removal` on that assignment leaves the variable `undefined`,
  // which slipped past the null test and then satisfied `!== 0`, scoring a
  // signal-killed child as a detected mutant. The control can take the same
  // false kill. A trust boundary states what it ACCEPTS (a number) rather than
  // enumerating the ways a value can be absent.
  if (typeof input.exitStatus !== "number") {
    return {
      infra:
        "the child produced no numeric exit status (signal, OOM, or spawn failure). " +
        "This is an infrastructure fault, not a KILLED mutant — scoring it as detection " +
        "would inflate the mutation score with a kill the suite never earned",
    };
  }

  if (input.exitStatus !== 0) return "KILLED";

  // Exit 0 with the overlay live. For the playwright kind that is survival ONLY
  // if the run's own fresh report proves tests executed; the vitest kind's
  // no-tests trap is closed at baseline instead (spec §3.3 step 1), so a second
  // divergent oracle here would be a liability rather than a defence.
  if (input.kind === "vitest") return "DID_NOT_KILL";

  const report = input.report;
  if (!report || !report.present || !report.fresh) {
    return {
      infra:
        "the child exited 0 but wrote no fresh json report: a silent no-op run can never " +
        "count as survival evidence",
    };
  }
  if (report.executed === 0) {
    return {
      infra:
        "the child exited 0 and its fresh json report records 0 executed tests: " +
        "nothing observed the mutant, so this is not survival",
    };
  }
  return "DID_NOT_KILL";
}

/**
 * Does THIS suite's classification kill the mutant?
 *
 * Trivial, and it lives here rather than inline in the runner for a specific
 * reason (diff review round 2, P0). Inline, the runner read
 * `if (verdict === "KILLED") return "KILLED";` — an `equality-flip` site in a
 * module the mutation registry cannot enrol, because the runner's other half is
 * a spawn boundary. Flipped to `!==`, a vitest `DID_NOT_KILL` returns KILLED
 * immediately, the Playwright child never runs, and the surface reports 19/19
 * with a killed control and a score of 1.0 while almost no overlay ever
 * executed. That is the exact "perfect score from a dead harness" failure §3.4
 * exists to prevent, and it was the one path into it left open.
 *
 * Moving the comparison into this module puts it under the browserMutate
 * surface, where the flip is a scored mutant with a test that kills it. What
 * remains at the call site is a bare predicate call with no comparison operator
 * to flip; `statement-removal` on the `return` beside it fails SAFE, since every
 * mutant then survives and the gate reds loudly.
 */
export function killsMutant(classification: "KILLED" | "DID_NOT_KILL"): boolean {
  return classification === "KILLED";
}

/**
 * Fold per-mutant verdicts into the `RunResult` the existing gate consumes
 * (`tests/mutation/source/runner.ts:22-30`), unchanged and unforked (spec §1.1.6).
 *
 * `noOps` is structurally empty here: an explicit mutant cannot be a no-op
 * (`from !== to`, occurrence exactly 1, both enforced at validation), and the
 * field is still reported so a future regression would surface through the
 * gate's existing condition rather than through a new one.
 */
export function accountOutcomes(input: {
  surfaceId: string;
  baselineGreen: boolean;
  outcomes: readonly MutantOutcome[];
}): RunResult {
  const seen = new Set<string>();
  for (const outcome of input.outcomes) {
    if (seen.has(outcome.siteId)) {
      throw new Error(
        `duplicate site id in run outcomes: ${outcome.siteId}. Two mutants sharing one id ` +
          `would classify as one, leaving a mutant neither killed nor surviving`,
      );
    }
    seen.add(outcome.siteId);
  }

  const is = (v: Verdict) => (o: MutantOutcome) => o.verdict === v;
  return {
    surfaceId: input.surfaceId,
    mutantCount: input.outcomes.length,
    noOps: [],
    baselineGreen: input.baselineGreen,
    killed: input.outcomes.filter(is("KILLED")).length,
    survivors: input.outcomes.filter(is("SURVIVED")).map((o) => o.siteId),
    outcomes: [...input.outcomes],
  };
}
