/**
 * scripts/specLintGate.mjs — the bare-node bridge for lib/specLintGate/gate.ts.
 *
 * `scripts/codex-guard.mjs` must run as plain `node` from any checkout: the
 * AGENTS.md shim one-liner points a shell script straight at it, with no install
 * step and no bundler (`tests/codexGuard/importSurface.test.ts:1-13`). So it
 * cannot import a `.ts`, and the decision it needs lives in one. This file is the
 * same bridge shape `./reviewRoundEmit.mjs` already uses for
 * `lib/reviewRounds/`, and it is why the import allowlist admits a second
 * relative sibling.
 *
 * IT IS A MIRROR, AND THE MIRROR IS PINNED. `tests/specLintGate/bridgeParity.test.ts`
 * drives both this file and the TypeScript core over one shared case table and
 * asserts they agree case for case. The failure that pins: this bridge losing a
 * branch of the contract while the TypeScript suite stays green — which for THIS
 * contract would mean a hard artifact dispatching silently, on the exact code
 * path live dispatches take.
 */

const GATED = new Set(["spec", "plan"]);
const SUMMARY = /^summary: (\d+) hard, (\d+) advisory$/m;

/** Null is NOT zero. Coercing it re-introduces the silent dispatch. */
export function hardCountOf(block) {
  const m = SUMMARY.exec(block);
  return m === null ? null : Number(m[1]);
}

export function decide({ stage, reports, waived }) {
  if (!GATED.has(stage) || waived) return { kind: "proceed" };

  if (reports.length === 0) {
    return {
      kind: "refuse",
      message:
        `--stage ${stage} requires at least one --lint-doc naming the artifact under review ` +
        `(pass --no-lint-gate to review an artifact that is mid-repair)`,
    };
  }

  const unreadable = [];
  const failing = [];
  for (const r of reports) {
    const hard = hardCountOf(r.block);
    if (hard === null) unreadable.push(r.rel);
    else if (hard > 0) failing.push({ rel: r.rel, hard });
  }

  // Mirrors the core exactly; see lib/specLintGate/gate.ts for why BOTH classes
  // are reported rather than the infra fault alone (diff review R1).
  if (unreadable.length > 0 || failing.length > 0) {
    const parts = [];
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
