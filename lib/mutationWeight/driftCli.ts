/**
 * The decidable parts of the rate-drift check, kept OUT of the CLI.
 *
 * Same reason `lib/ci/shardBudget.ts` exists beside `scripts/check-shard-budget.ts`:
 * a guard whose decisions live inline in a CLI main cannot be imported, so it cannot
 * be driven by a suite and cannot be enrolled in the source-mutation registry. The
 * script that uses this reads environment, calls in here, prints, and exits.
 */
import type { Drift } from "./weights";

/** What the report says, and nothing about how the process ends. */
export type DriftRender = { lines: string[]; actionable: number };

/**
 * Required environment, with NO defaults.
 *
 * A default is exactly how this check would become a second copy of a value that
 * lives in TypeScript it cannot import, and it is worse than a crash: the run
 * continues against a number nobody chose. Malformed is refused for the same reason
 * as missing — a value that does not parse is not a value.
 */
export function requiredEnv(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): { ok: true; value: string } | { ok: false; problem: string } {
  const raw = env[name];
  // Empty and whitespace are REFUSED alongside absent, because a shell produces them
  // trivially: `FOO=` and `FOO="$UNSET"` both arrive as the empty string rather than
  // as missing, and a check that only tested for undefined would accept both.
  if (raw === undefined || raw.trim() === "") return { ok: false, problem: `${name} is not set` };
  return { ok: true, value: raw.trim() };
}

/** As above, for a value that must be a positive integer. */
export function requiredCount(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): { ok: true; value: number } | { ok: false; problem: string } {
  const str = requiredEnv(env, name);
  if (!str.ok) return str;
  // DECIMAL DIGITS ONLY, checked before parsing rather than after. `Number` is a
  // generous reader: "3600.5" is a number, "1e3" is 1000, " 4 " is 4, "0x10" is 16.
  // Every one of those is a spelling nobody types into a workflow on purpose, and
  // this script's sibling carries three rounds of exactly that scar -- each guard
  // accepted a spelling it had not modelled. Constraining the INPUT is total over
  // the class; constraining the parsed output is a list of the cases someone thought
  // of.
  if (!/^[0-9]+$/.test(str.value)) {
    return { ok: false, problem: `${name} must be a positive integer, got "${str.value}"` };
  }
  const n = Number(str.value);
  if (!Number.isInteger(n) || n <= 0) {
    return { ok: false, problem: `${name} must be a positive integer, got "${str.value}"` };
  }
  return { ok: true, value: n };
}

/**
 * Render the report.
 *
 * EVERY measured surface is named whatever its ratio, because a report that lists
 * only the actionable ones cannot be distinguished from a report that failed to
 * measure anything. Declared-but-unmeasured and measured-but-undeclared stay two
 * sections: they are opposite faults with opposite repairs, and merging them makes
 * a newly enrolled surface look like a stale registry row.
 */
export function renderDrift(report: {
  drifted: readonly Drift[];
  unmeasured: readonly string[];
  undeclared: readonly string[];
}): DriftRender {
  const lines: string[] = [];
  const actionable = report.drifted.filter((d) => d.actionable).length;

  lines.push(`measured ${String(report.drifted.length)} surface(s):`);
  for (const d of report.drifted) {
    lines.push(
      `  ${d.actionable ? "DRIFTED " : "        "}${d.surfaceId}: ` +
        `declared ${String(d.declaredMillis)} ms/boot, observed ${String(d.observedMillis)} ` +
        `(${d.ratio.toFixed(2)}x)`,
    );
  }

  // Two sections, never one. See the doc comment: opposite faults, opposite repairs.
  lines.push(
    `declared but UNMEASURED (${String(report.unmeasured.length)}): ` +
      (report.unmeasured.length > 0 ? report.unmeasured.join(", ") : "none"),
  );
  lines.push(
    `measured but UNDECLARED (${String(report.undeclared.length)}): ` +
      (report.undeclared.length > 0 ? report.undeclared.join(", ") : "none"),
  );
  lines.push(`actionable: ${String(actionable)}`);
  return { lines, actionable };
}
