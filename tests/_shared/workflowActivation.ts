/**
 * tests/_shared/workflowActivation.ts
 *
 * "Which `run:` scalars in this workflow are PROVABLY executed?" — the single source of truth for
 * every wiring guard that wants to conclude "CI runs this spec" from workflow text.
 *
 * Whole-diff review R6/R7 drove this out of the guards and into one place. R6 showed that scanning
 * text for a `run:` line cannot see step structure at all (`if: false` on the one Playwright step
 * left both suites dark with every guard green). R7 then produced three more overrides against the
 * first structural version, and — decisively — pointed out that the two guards had each grown their
 * own copy of the predicate, so a fix to one was not a fix to the other. Hence one exported
 * function, imported by both.
 *
 * The policy is deliberately REFUSAL, matching `tests/ci/_workflowCoverageScan.ts`'s own hard-won
 * conclusion (its `UNMODELLED_RE` and `hasContinueOnError` were written after an adversarial round
 * produced false coverage through six of these): constructs that change WHERE or WHETHER a command
 * runs are not modelled, they are refused. A workflow using one yields no activated runs at all,
 * which reads as "unwired" and FAILS the calling guard. That is conservative in the correct
 * direction — a legitimate `shell:` or `needs:` costs someone a guard failure and a conversation,
 * whereas modelling it wrongly costs silent dark coverage, which is the whole failure class these
 * guards exist to prevent.
 *
 * Refused (any occurrence ⇒ that run is not counted):
 *   - `if:` at step or job level — an expression this code cannot evaluate is not proof. ONE
 *     literal is excepted at STEP level, `always()`: it is the only expression whose value is
 *     decidable without evaluating anything, and it decides in the SAFE direction — a step
 *     carrying it runs even when an earlier step failed, which is strictly MORE execution than
 *     the unconditional default this function already counts. The exception is the exact literal
 *     only (whitespace and an optional `${{ … }}` wrapper aside), so `always() && <anything>` is
 *     refused like any other expression. Introduced 2026-08-16, when the modal-wait adoption arc
 *     put `if: always()` on crew-e2e.yml's executed-count oracle so a recovered-then-failed run
 *     still reaches it: without the exception, hardening that step read as UNWIRING it.
 *   - `continue-on-error:` at step or job level, unless it is literally `false`. `${{ true }}`
 *     parses as a STRING, so an `=== true` test misses it (R7 probe); so would `yes`/`on`.
 *   - `needs:` on the job — a gate job carrying `if: false` skips this job implicitly, even though
 *     this job's own head is unconditional (R7 probe).
 *   - `shell:` or `working-directory:` at step level — `shell: echo {0}` prints the generated
 *     script path and exits 0 without running it (R7 probe); a relative `working-directory:`
 *     silently retargets a config path.
 *   - `defaults:` or `container:` at workflow or job level — the same two overrides, one scope up.
 */
import { parse as parseYaml } from "yaml";

type StepLike = Record<string, unknown>;
type JobLike = Record<string, unknown> & { steps?: unknown[] };

/** Only a literal `false` is safe; anything else (including an expression) swallows status. */
function swallowsFailure(block: Record<string, unknown>): boolean {
  const raw = block["continue-on-error"];
  if (raw === undefined) return false;
  if (raw === false) return false;
  return (
    String(raw)
      .trim()
      .replace(/^["']|["']$/g, "")
      .toLowerCase() !== "false"
  );
}

const REFUSED_JOB_KEYS = ["if", "needs", "defaults", "container"] as const;
const REFUSED_STEP_KEYS = ["shell", "working-directory"] as const;

/**
 * The one `if:` that is proof of execution rather than an obstacle to it.
 *
 * Deliberately exact-match, not a prefix or a contains: `always() && inputs.x` is an expression
 * this code cannot evaluate, and accepting it because it starts with `always()` is precisely the
 * recognizer growth this file's refusal policy exists to avoid.
 */
function stepIfIsProvablyAlways(raw: unknown): boolean {
  if (raw === undefined) return true;
  const text = String(raw).trim();
  const inner = /^\$\{\{(.*)\}\}$/.exec(text)?.[1] ?? text;
  return inner.trim() === "always()";
}

/**
 * Every `run:` scalar whose step, job and workflow carry no construct that can switch it off,
 * redirect it, or swallow its failure. Empty when the workflow cannot be parsed — fail-closed.
 */
export function activatedRunScalars(yamlText: string): string[] {
  let doc: { jobs?: Record<string, JobLike>; defaults?: unknown } | null;
  try {
    doc = parseYaml(yamlText) as { jobs?: Record<string, JobLike>; defaults?: unknown };
  } catch {
    return [];
  }
  if (doc === null || typeof doc !== "object") return [];
  if (doc.defaults !== undefined) return [];

  const runs: string[] = [];
  for (const job of Object.values(doc.jobs ?? {})) {
    if (job === null || typeof job !== "object") continue;
    if (REFUSED_JOB_KEYS.some((k) => job[k] !== undefined)) continue;
    if (swallowsFailure(job)) continue;
    for (const raw of job.steps ?? []) {
      if (raw === null || typeof raw !== "object") continue;
      const step = raw as StepLike;
      if (typeof step.run !== "string") continue;
      if (REFUSED_STEP_KEYS.some((k) => step[k] !== undefined)) continue;
      if (!stepIfIsProvablyAlways(step["if"])) continue;
      if (swallowsFailure(step)) continue;
      runs.push(step.run);
    }
  }
  return runs;
}
