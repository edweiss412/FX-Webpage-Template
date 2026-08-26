/**
 * lib/specLintGate/gate.ts — whether a dispatch may proceed given its lint reports.
 *
 * WHY IT IS HERE AND NOT IN THE WRAPPER. `scripts/codex-guard.mjs` is ratified
 * CANNOT-EXPRESS for the source-mutation registry, measured rather than argued:
 * the runner overlays a target only when a Vitest suite imports it, and every
 * suite in `tests/codexGuard/` SPAWNS the script instead
 * (`docs/superpowers/specs/ci/2026-08-15-round-economy-enforcement-pair.md` §1.1
 * item 8). That same ratification names the remedy — the lib half is expressible,
 * so the decision lives here, is imported by tests, and is enrolled. The wrapper
 * keeps every side effect: this module does no I/O and spawns nothing, which is
 * the property that makes it scoreable at all.
 *
 * THE DECISION, and why each arm exists:
 *
 *   COVERAGE — a `spec` or `plan` dispatch must NAME an artifact. Without this
 *   the gate is opt-in, which is the defect the row describes: the obligation to
 *   attach a lint report is stated as a PARAGRAPH in
 *   `docs/agents/spec-self-review.md:25` and the mechanism is a flag nobody has
 *   to pass, so it ran zero times.
 *
 *   ENFORCEMENT — every named artifact with a hard finding refuses, and the
 *   refusal names each failing file with its count. Ranging over EVERY report
 *   rather than the first is load-bearing: real dispatches cite a spec plus its
 *   probe records, so a first-document gate would dispatch a hard artifact
 *   whenever a clean one was named ahead of it, while passing every
 *   single-document test.
 *
 *   GRAMMAR — a report whose summary line carries no readable count is an infra
 *   fault, NOT a zero. `embedReport` validates that a `summary:` line exists, is
 *   unique and is last; it never validates that a count can be read out of it
 *   (probed: a report ending `summary: banana` passes intact). Defaulting to zero
 *   there would dispatch a hard artifact with every frame check green, which is
 *   the silent-wrongness the consequence bound rules out.
 *
 * Advisory findings NEVER refuse. Advisory noise is normal in probe-record
 * artifacts, and blocking on it would be its own waste.
 */

/** A stage the CLI accepts. Only `spec` and `plan` are gated. */
export type Stage = "spec" | "plan" | "diff" | "task";

/** One report the wrapper has already produced, as its embedded block. */
export interface LintReport {
  /** Repo-relative path, as the wrapper resolved it. */
  readonly rel: string;
  /** The embedded block, whose final content line is the summary. */
  readonly block: string;
}

export interface GateInput {
  readonly stage: Stage;
  readonly reports: readonly LintReport[];
  /** `--no-lint-gate`: waives both arms for an artifact under repair. */
  readonly waived: boolean;
}

export type GateDecision =
  | { readonly kind: "proceed" }
  | { readonly kind: "refuse"; readonly message: string };

/** The stages the gate applies to. `diff` and `task` are untouched. */
const GATED: ReadonlySet<Stage> = new Set<Stage>(["spec", "plan"]);

/**
 * `summary: <hard> hard, <advisory> advisory`, anchored to a whole line.
 * The renderer is `scripts/spec-lint.ts:208`. Anchored deliberately: a loose
 * match would read a count out of prose that merely resembles the line.
 */
const SUMMARY = /^summary: (\d+) hard, (\d+) advisory$/m;

/**
 * The hard count, or null when the line is unreadable.
 *
 * Null is NOT zero and callers must not coerce it — that distinction is the
 * whole point of this function, and collapsing it re-introduces the silent
 * dispatch it exists to prevent.
 */
export function hardCountOf(block: string): number | null {
  const m = SUMMARY.exec(block);
  return m === null ? null : Number(m[1]);
}

export function decide(input: GateInput): GateDecision {
  if (!GATED.has(input.stage) || input.waived) return { kind: "proceed" };

  if (input.reports.length === 0) {
    return {
      kind: "refuse",
      message:
        `--stage ${input.stage} requires at least one --lint-doc naming the artifact under review ` +
        `(pass --no-lint-gate to review an artifact that is mid-repair)`,
    };
  }

  const unreadable: string[] = [];
  const failing: { rel: string; hard: number }[] = [];
  for (const r of input.reports) {
    const hard = hardCountOf(r.block);
    if (hard === null) unreadable.push(r.rel);
    else if (hard > 0) failing.push({ rel: r.rel, hard });
  }

  // BOTH classes are reported, always. An earlier draft returned the
  // unreadable-only message and DROPPED every known hard failure in the same
  // dispatch, on the reasoning that an infra fault should not be mixed into a
  // findings verdict. That reasoning is wrong here and diff review R1 caught it:
  // the operator fixes what the message names, so a suppressed hard count is a
  // second dispatch they did not need. It also contradicted this arm's own
  // consequence bound, which requires every failing file and its count to be
  // NAMED. The infra fault still leads, because a report that cannot be read is
  // not evidence about that document either way.
  if (unreadable.length > 0 || failing.length > 0) {
    const parts: string[] = [];
    if (unreadable.length > 0) {
      parts.push(
        `spec:lint produced a report with no readable summary count for:\n` +
          unreadable.map((r) => `  ${r}`).join("\n") +
          `\nexpected a final line matching \`summary: <n> hard, <n> advisory\``,
      );
    }
    if (failing.length > 0) {
      parts.push(
        `artifact under review has hard spec:lint failures:\n` +
          failing.map((f) => `  ${f.rel}: ${f.hard} hard`).join("\n"),
      );
    }
    parts.push(`fix them or pass --no-lint-gate to review an artifact that is mid-repair`);
    return { kind: "refuse", message: parts.join("\n") };
  }

  return { kind: "proceed" };
}
