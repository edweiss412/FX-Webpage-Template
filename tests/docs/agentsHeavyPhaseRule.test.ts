/**
 * tests/docs/agentsHeavyPhaseRule.test.ts — pins the AGENTS.md heavy-phase rule.
 *
 * Spec: docs/superpowers/specs/2026-08-10-heavy-phase-semaphore-design.md §5.
 * Codex sessions read AGENTS.md, not the spec, so this bullet IS the durable
 * cross-CLI contract; a silently-dropped clause is a rule nobody is following.
 *
 * The check is a PURE function over the document text, which is what lets the
 * mutation block below be executable rather than a probe someone ran once. The
 * declared operator set is: delete the whole bullet, delete one MUST shape,
 * delete one MUST-NOT shape, and move a member across the MUST/MUST-NOT
 * boundary. Every operator must produce at least one violation; a new operator
 * belongs here as a row, not in a review round.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { premiseHolds } from "@/tests/_shared/premise";

const AGENTS_PATH = join(process.cwd(), "AGENTS.md");
const RULE_OPENER = "- **Heavy local phases run under the machine-wide slot semaphore.**";
const MUST_MARKER = "**MUST wrap**";
const MUST_NOT_MARKER = "**MUST NOT wrap**";
const TAIL_MARKER = "Wrap the OUTERMOST command only";

/** A backticked code span, so `pnpm test` never matches `pnpm test:e2e:ui`. */
function codeSpan(literal: string): RegExp {
  return new RegExp("`" + literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "`");
}

/**
 * Members of the MUST class. Each must appear on the MUST side and NOWHERE on
 * the MUST-NOT side — the second half is what catches a member moved across the
 * boundary, which a presence-only check reads as still-present.
 */
const MUST_MEMBERS = [
  "pnpm test",
  "pnpm test:fast",
  "vitest run",
  "pnpm test:e2e",
  "pnpm screenshot:gallery",
  "pnpm screenshot:help",
  "pnpm build",
  "next build",
  "pnpm mutation:guards",
  "--project mutation",
];

const MUST_NOT_MEMBERS = ["pnpm test:e2e:ui", "--ui", "--debug", "PWDEBUG", "next dev", "next start"];

/** Clauses whose absence would drop a load-bearing rule element. */
const MUST_PHRASES: Array<[string, RegExp]> = [
  ["entry point", /`pnpm heavy\b/],
  ["wrapper path", /scripts\/with-heavy-slot\.py/],
  ["full-suite vitest shape", /not scoped to an explicit file list/],
  ["transitive shape rule", /transitively launches|TRANSITIVELY launches/i],
  ["transitive member: build-artifact-gate", /tests\/admin\/build-artifact-gate\.test\.ts/],
  [
    "transitive member: share-link-flash matrix",
    /scripts\/share-link-flash-adversary-matrix\.mjs/,
  ],
];

const MUST_NOT_PHRASES: Array<[string, RegExp]> = [
  ["scoped-vitest exclusion", /[Ss]coped vitest runs with an explicit file list/],
];

const TAIL_PHRASES: Array<[string, RegExp]> = [
  ["outermost-wrap rule", /OUTERMOST command only/],
  ["FX_HEAVY_PRIORITY closeout convention", /FX_HEAVY_PRIORITY=1/],
  ["never-set FX_HEAVY_SLOT_DIR rule", /NEVER set `FX_HEAVY_SLOT_DIR`/],
  ["recreate-only capacity rule", /--recreate --slots/],
  [
    "spec citation",
    /docs\/superpowers\/specs\/2026-08-10-heavy-phase-semaphore-design\.md/,
  ],
];

export function extractRule(agents: string): string | null {
  const start = agents.indexOf(RULE_OPENER);
  if (start === -1) return null;
  const rest = agents.slice(start + 1);
  const next = rest.search(/\n- \*\*/);
  return next === -1 ? agents.slice(start) : agents.slice(start, start + 1 + next);
}

/** Returns one string per violation; empty means the rule is intact. */
export function checkHeavyPhaseRule(agents: string): string[] {
  const problems: string[] = [];

  // The bullet must live in the cross-cutting-discipline section it claims.
  const sectionStart = agents.indexOf("## Cross-cutting discipline");
  if (sectionStart === -1) return ["AGENTS.md has no cross-cutting-discipline section"];
  const sectionEnd = agents.indexOf("\n## ", sectionStart + 1);
  const section = agents.slice(sectionStart, sectionEnd === -1 ? undefined : sectionEnd);

  const rule = extractRule(section);
  if (rule === null) return ["the heavy-phase rule bullet is absent from the cross-cutting section"];

  const mustAt = rule.indexOf(MUST_MARKER);
  const mustNotAt = rule.indexOf(MUST_NOT_MARKER);
  const tailAt = rule.indexOf(TAIL_MARKER);
  if (mustAt === -1) problems.push(`the rule has no ${MUST_MARKER} block`);
  if (mustNotAt === -1) problems.push(`the rule has no ${MUST_NOT_MARKER} block`);
  if (tailAt === -1) problems.push(`the rule has no "${TAIL_MARKER}" tail`);
  if (problems.length > 0) return problems;
  if (!(mustAt < mustNotAt && mustNotAt < tailAt)) {
    return ["the rule's MUST / MUST NOT / tail blocks are out of order"];
  }

  const mustRegion = rule.slice(mustAt, mustNotAt);
  const mustNotRegion = rule.slice(mustNotAt, tailAt);
  const tailRegion = rule.slice(tailAt);

  for (const member of MUST_MEMBERS) {
    const pattern = codeSpan(member);
    if (!pattern.test(mustRegion)) problems.push(`MUST member missing: \`${member}\``);
    if (pattern.test(mustNotRegion)) {
      problems.push(`MUST member \`${member}\` appears on the MUST-NOT side`);
    }
  }
  for (const member of MUST_NOT_MEMBERS) {
    const pattern = codeSpan(member);
    if (!pattern.test(mustNotRegion)) problems.push(`MUST-NOT member missing: \`${member}\``);
    if (pattern.test(mustRegion)) {
      problems.push(`MUST-NOT member \`${member}\` appears on the MUST side`);
    }
  }
  for (const [label, pattern] of MUST_PHRASES) {
    if (!pattern.test(rule.slice(0, mustNotAt))) problems.push(`missing clause: ${label}`);
  }
  for (const [label, pattern] of MUST_NOT_PHRASES) {
    if (!pattern.test(mustNotRegion)) problems.push(`missing clause: ${label}`);
  }
  for (const [label, pattern] of TAIL_PHRASES) {
    if (!pattern.test(tailRegion)) problems.push(`missing clause: ${label}`);
  }
  return problems;
}

const LIVE = readFileSync(AGENTS_PATH, "utf8");

describe("AGENTS.md heavy-phase rule", () => {
  it("carries every load-bearing element of spec §5", () => {
    expect(checkHeavyPhaseRule(LIVE)).toEqual([]);
  });

  /**
   * Operator closure. Each row edits the LIVE document and must be rejected; a
   * row whose edit is a no-op is a premise failure, not a pass.
   *
   * Every operator edits WITHIN the rule. Editing the whole document would let a
   * replacement land on an unrelated occurrence elsewhere in AGENTS.md and leave
   * the rule untouched — a no-op the guard would rightly accept, reported as a
   * guard failure.
   */
  const withinRule = (text: string, edit: (rule: string) => string): string => {
    const rule = extractRule(text);
    return rule === null ? text : text.replace(rule, edit(rule));
  };

  const OPERATORS: Array<[string, (text: string) => string]> = [
    ["delete the whole bullet", (text) => withinRule(text, () => "")],
    [
      "delete one MUST shape",
      (text) => withinRule(text, (rule) => rule.replace("`pnpm mutation:guards`", "the harness")),
    ],
    [
      "delete one MUST-NOT shape",
      (text) => withinRule(text, (rule) => rule.replace("`PWDEBUG`", "a debug")),
    ],
    [
      "move a member across the MUST/MUST-NOT boundary",
      (text) =>
        withinRule(text, (rule) =>
          rule
            .replace(" (including the `pnpm test:e2e:ui` alias)", "")
            .replace("`pnpm mutation:guards`", "`pnpm mutation:guards`, `pnpm test:e2e:ui`"),
        ),
    ],
  ];

  it.each(OPERATORS)("rejects a mutant that would %s", (_label, mutate) => {
    const mutated = mutate(LIVE);
    premiseHolds("the operator actually changed the document", mutated !== LIVE);
    expect(checkHeavyPhaseRule(mutated).length).toBeGreaterThan(0);
  });
});
