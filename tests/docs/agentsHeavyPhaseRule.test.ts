/**
 * tests/docs/agentsHeavyPhaseRule.test.ts — pins the AGENTS.md heavy-phase rule.
 *
 * Spec: docs/superpowers/specs/2026-08-10-heavy-phase-semaphore-design.md §4.6
 * (the shapes) and §5 (the bullet's required elements). Codex sessions read
 * AGENTS.md and never read the spec, so this bullet IS the durable cross-CLI
 * contract; a silently-dropped clause is a rule nobody is following.
 *
 * The member list is NOT maintained by hand. `specWrapShapes()` scans every
 * backticked code span out of spec §4.6, and `CLASSIFIED` must account for every
 * one of them — so a shape ADDED to the spec turns this guard red until somebody
 * puts it on a side. That is the derived cover; an enumeration alone re-opens the
 * moment the spec grows, which is exactly how the first version of this guard
 * accepted a document missing the direct `playwright test` shape.
 *
 * The check is a pure function over text, which is what makes the operator table
 * at the bottom executable rather than a probe someone ran once. Every operator
 * must produce at least one violation; a new operator belongs there as a row,
 * not in a review round.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { premiseHolds } from "@/tests/_shared/premise";

const ROOT = process.cwd();
const AGENTS_PATH = join(ROOT, "AGENTS.md");
const SPEC_PATH = join(ROOT, "docs/superpowers/specs/2026-08-10-heavy-phase-semaphore-design.md");

const RULE_OPENER = "- **Heavy local phases run under the machine-wide slot semaphore.**";
const MUST_MARKER = "**MUST wrap**";
const MUST_NOT_MARKER = "**MUST NOT wrap**";
const TAIL_MARKER = "Wrap the OUTERMOST command only";

/** A backticked code span, so `pnpm test` never matches `pnpm test:e2e:ui`. */
function codeSpan(literal: string): RegExp {
  return new RegExp("`" + literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "`");
}

/** Every backticked span in spec §4.6, in document order, deduplicated. */
export function specWrapShapes(spec: string): string[] {
  const start = spec.indexOf("### 4.6 What must be wrapped");
  if (start === -1) throw new Error("spec §4.6 not found — the guard's scanner has no source");
  const end = spec.indexOf("\n## 5.", start);
  const section = spec.slice(start, end === -1 ? undefined : end);
  const found: string[] = [];
  for (const [, span] of section.matchAll(/`([^`\n]+)`/g)) {
    if (span && !found.includes(span)) found.push(span);
  }
  return found;
}

type Side =
  | { side: "must"; as?: string }
  | { side: "must-not"; as?: string }
  | { side: "ignore"; why: string };

/**
 * Every spec §4.6 span, classified. `as` gives the literal the BULLET spells it
 * with when that differs from the spec's spelling. An `ignore` row states why the
 * span is not an invocation-shape member — those reasons are the part a reviewer
 * should argue with, which is why each carries one.
 */
const CLASSIFIED: Array<[string, Side]> = [
  [
    "pnpm heavy -- <cmd>",
    { side: "ignore", why: "the entry point itself, pinned by its own clause" },
  ],
  ["pnpm test", { side: "must" }],
  ["pnpm test:fast", { side: "must" }],
  ["vitest run", { side: "must" }],
  [
    "pnpm exec vitest run",
    { side: "ignore", why: "a spelling of `vitest run`; the bullet states the shape once" },
  ],
  // The spec writes the glob; the bullet spells the base alias and then covers
  // the rest with "and its scoped-config aliases". Classifying the glob `ignore`
  // (the first repair's mistake) left NOTHING requiring the base shape, so the
  // whole non-interactive umbrella could be deleted with the guard still green.
  ["pnpm test:e2e*", { side: "must", as: "pnpm test:e2e" }],
  ["playwright test", { side: "must" }],
  ["pnpm screenshot:gallery", { side: "must" }],
  ["pnpm screenshot:help", { side: "must" }],
  ["playwright.screenshots.config.ts:128", { side: "must" }],
  ["pnpm build", { side: "must" }],
  ["next build", { side: "must" }],
  ["scripts/with-admin-dev-flag.mjs", { side: "must" }],
  // The spec states these two inside its MUST paragraph only to send them to the
  // MUST-NOT class ("are long-lived servers and belong to the MUST-NOT class
  // below"), so a scanner that trusted paragraph position would misfile them.
  ["next start", { side: "must-not" }],
  ["next dev", { side: "must-not" }],
  ["pnpm mutation:guards", { side: "must" }],
  ["--project mutation", { side: "must" }],
  [
    "rg -n -U 'execFileSync\\(\"pnpm\",\\s*\\[\"build\"\\]|execFileSync\\(\"pnpm\",\\s*\\[\"test:e2e'",
    { side: "must" },
  ],
  ["tests/", { side: "ignore", why: "a path argument of the sweep command above" }],
  ["scripts/", { side: "ignore", why: "a path argument of the sweep command above" }],
  [
    "RUN_BUILD_ARTIFACT_GATE_TEST=1 pnpm vitest run tests/admin/build-artifact-gate.test.ts",
    { side: "ignore", why: "the transitive member is pinned below by its cited file:line" },
  ],
  ["tests/admin/build-artifact-gate.test.ts:73", { side: "must" }],
  [
    "node scripts/share-link-flash-adversary-matrix.mjs",
    { side: "ignore", why: "the transitive member is pinned below by its cited file:line" },
  ],
  ["scripts/share-link-flash-adversary-matrix.mjs:1014", { side: "must" }],
  [
    "--quick",
    {
      side: "ignore",
      why: "the transitive member's UNWRAPPED mode, stated inside the MUST-side clause that names it; pinned by its own clause instead",
    },
  ],
  ["--ui", { side: "must-not" }],
  ["pnpm test:e2e:ui", { side: "must-not" }],
  ["--debug", { side: "must-not" }],
  ["PWDEBUG", { side: "must-not" }],
  ["format:check", { side: "must-not", as: "pnpm format:check" }],
  [
    '"heavy": "python3 scripts/with-heavy-slot.py --"',
    { side: "ignore", why: "the package.json script body, not an invocation shape" },
  ],
  ["pnpm heavy pnpm test", { side: "ignore", why: "an example invocation of the entry point" }],
];

/**
 * Members the BULLET must carry that spec §4.6 states in prose rather than as a
 * code span. The completeness assertion runs spec -> registry, so extra rows
 * here are allowed; each still gets both side checks.
 */
const EXTRA_MEMBERS: Array<[string, "must" | "must-not"]> = [
  ["pnpm typecheck", "must-not"],
  ["pnpm exec eslint .", "must-not"],
];

/** Semantics that a token-presence check reads as intact while they are gone. */
const MUST_CLAUSES: Array<[string, RegExp]> = [
  ["entry point", /`pnpm heavy\b/],
  ["wrapper path", /scripts\/with-heavy-slot\.py/],
  ["classification is by shape, not alias", /Classification is by INVOCATION SHAPE/],
  ["full-suite vitest shape", /not scoped to an explicit file list/],
  ["scoped-config playwright aliases", /scoped-config aliases/],
  ["mutation shard-batch rule", /one slot per concurrently-running shard batch/],
  ["worktree-local build lock, cited where it is established", /`ROOT = process\.cwd\(\)`/],
  ["build-lock citation: the ROOT definition", /with-admin-dev-flag\.mjs:42/],
  ["build-lock citation: the lock path under that root", /with-admin-dev-flag\.mjs:97-98/],
  ["transitive shape rule", /TRANSITIVELY launches/],
  ["transitive member: build-artifact-gate", /tests\/admin\/build-artifact-gate\.test\.ts:73/],
  [
    "transitive member: share-link-flash matrix",
    /scripts\/share-link-flash-adversary-matrix\.mjs:1014/,
  ],
  ["the --quick exception stays unwrapped", /`--quick` spawns none and stays unwrapped/],
  ["the sweep is the derived cover, to be rerun", /rerun it when authoring changes to either tree/],
];

const MUST_NOT_CLAUSES: Array<[string, RegExp]> = [
  ["scoped-vitest exclusion", /Scoped vitest runs with an explicit file list/],
  ["spec/plan authoring exclusion", /spec\/plan authoring/],
  ["codex dispatch exclusion", /codex dispatches/],
  ["CI-polling exclusion", /CI polling/],
  ["git/gh exclusion", /git\/gh operations/],
  ["pre-warmed dev servers start outside", /pre-warmed dev servers/],
  ["why interactive runs are excluded", /unbounded-lived/],
];

const TAIL_CLAUSES: Array<[string, RegExp]> = [
  ["outermost-wrap rule", /OUTERMOST command only/],
  ["an inner wrap passes through rather than deadlocking", /passes through with a surfaced notice/],
  [
    "the priority convention's CONDITION, not just the variable",
    /Closeout and CI-stage runs set `FX_HEAVY_PRIORITY=1`/,
  ],
  ["priority is bias, not a queue position", /bias toward the nearest merge rather than a queue/],
  ["never-set FX_HEAVY_SLOT_DIR rule", /NEVER set `FX_HEAVY_SLOT_DIR`/],
  ["slot-dir divergence is undetectable", /undetectable by design/],
  [
    "capacity changes go through --recreate ONLY",
    /`python3 scripts\/with-heavy-slot\.py --recreate --slots <N>` ONLY/,
  ],
  ["spec citation", /docs\/superpowers\/specs\/2026-08-10-heavy-phase-semaphore-design\.md/],
  ["guard citation", /tests\/docs\/agentsHeavyPhaseRule\.test\.ts/],
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

  const members: Array<[string, "must" | "must-not"]> = [
    ...CLASSIFIED.flatMap(([span, entry]): Array<[string, "must" | "must-not"]> =>
      entry.side === "ignore" ? [] : [[entry.as ?? span, entry.side]],
    ),
    ...EXTRA_MEMBERS,
  ];

  for (const [literal, side] of members) {
    const pattern = codeSpan(literal);
    const own = side === "must" ? mustRegion : mustNotRegion;
    const other = side === "must" ? mustNotRegion : mustRegion;
    if (!pattern.test(own)) problems.push(`${side.toUpperCase()} member missing: \`${literal}\``);
    // The absence half is what catches a member MOVED across the boundary,
    // which a presence-only check reads as still-present.
    if (pattern.test(other)) {
      problems.push(`${side.toUpperCase()} member \`${literal}\` appears on the wrong side`);
    }
  }

  for (const [label, pattern] of MUST_CLAUSES) {
    if (!pattern.test(rule.slice(0, mustNotAt))) problems.push(`missing clause: ${label}`);
  }
  for (const [label, pattern] of MUST_NOT_CLAUSES) {
    if (!pattern.test(mustNotRegion)) problems.push(`missing clause: ${label}`);
  }
  for (const [label, pattern] of TAIL_CLAUSES) {
    if (!pattern.test(tailRegion)) problems.push(`missing clause: ${label}`);
  }
  return problems;
}

const LIVE = readFileSync(AGENTS_PATH, "utf8");
const SPEC = readFileSync(SPEC_PATH, "utf8");

describe("AGENTS.md heavy-phase rule", () => {
  it("carries every load-bearing element of spec §4.6 and §5", () => {
    expect(checkHeavyPhaseRule(LIVE)).toEqual([]);
  });

  it("classifies every wrap shape the spec names — the registry is derived, not enumerated", () => {
    const shapes = specWrapShapes(SPEC);
    premiseHolds(
      "the spec §4.6 scan found shapes to classify — an empty scan would make the " +
        "completeness assertion below hold trivially",
      shapes.length > 10,
    );
    const known = new Set(CLASSIFIED.map(([span]) => span));
    expect(shapes.filter((span) => !known.has(span))).toEqual([]);
    // And nothing classified that the spec no longer names, so the registry
    // cannot rot into a list of shapes the contract dropped.
    expect(CLASSIFIED.map(([span]) => span).filter((span) => !shapes.includes(span))).toEqual([]);
  });

  /**
   * Operator closure. Each row edits the LIVE document and must be rejected; a
   * row whose edit is a no-op is a premise failure, not a pass.
   *
   * Every operator edits WITHIN the rule. Editing the whole document would let a
   * replacement land on an unrelated occurrence elsewhere in AGENTS.md and leave
   * the rule untouched — a no-op the guard would rightly accept, reported as a
   * guard failure.
   *
   * Rows 5 onward are the mutants a cross-model review produced against the first
   * version of this guard, which accepted every one of them. They are rows rather
   * than prose so the regression is executable.
   */
  const withinRule = (text: string, edit: (rule: string) => string): string => {
    const rule = extractRule(text);
    return rule === null ? text : text.replace(rule, edit(rule));
  };
  const editRule =
    (find: string, replace: string) =>
    (text: string): string =>
      withinRule(text, (rule) => rule.replace(find, replace));

  const OPERATORS: Array<[string, (text: string) => string]> = [
    ["delete the whole bullet", (text) => withinRule(text, () => "")],
    ["delete one MUST shape", editRule("`pnpm mutation:guards`", "the harness")],
    ["delete one MUST-NOT shape", editRule("`PWDEBUG`", "a debug")],
    [
      "move a member across the MUST/MUST-NOT boundary",
      (text) =>
        withinRule(text, (rule) =>
          rule
            .replace(" (including the `pnpm test:e2e:ui` alias)", "")
            .replace("`pnpm mutation:guards`", "`pnpm mutation:guards`, `pnpm test:e2e:ui`"),
        ),
    ],
    [
      "delete the direct `playwright test` shape",
      editRule(", any `playwright test` without an interactive flag", ""),
    ],
    [
      "delete the non-interactive umbrella and the base `pnpm test:e2e` shape",
      editRule(
        "Any non-interactive playwright run: `pnpm test:e2e` and its scoped-config aliases, any `playwright test` without an interactive flag,",
        "Wrap the scoped-config aliases, any direct `playwright test` without an interactive flag,",
      ),
    ],
    [
      "delete the with-admin-dev-flag build path",
      editRule(", or a `next build` run through `scripts/with-admin-dev-flag.mjs`", ""),
    ],
    [
      "move `pnpm typecheck` from the MUST-NOT list into MUST",
      (text) =>
        withinRule(text, (rule) =>
          rule
            .replace("`pnpm typecheck`, ", "")
            .replace("`pnpm test:fast`", "`pnpm test:fast`, `pnpm typecheck`"),
        ),
    ],
    [
      "delete the derived sweep that covers the transitive class",
      (text) =>
        withinRule(text, (rule) =>
          rule.replace(/ The derived cover is the sweep `rg[^]*?trusting that member list\./, ""),
        ),
    ],
    [
      "weaken the recreate-only requirement to a suggestion",
      editRule(
        "go through `python3 scripts/with-heavy-slot.py --recreate --slots <N>` ONLY",
        "can use `python3 scripts/with-heavy-slot.py --recreate --slots <N>`",
      ),
    ],
    [
      "drop the closeout/CI-stage condition from the priority convention",
      editRule(
        "Closeout and CI-stage runs set `FX_HEAVY_PRIORITY=1`, a best-effort",
        "`FX_HEAVY_PRIORITY=1` is a best-effort",
      ),
    ],
    [
      "delete the shape-not-alias classification rule",
      editRule(" Classification is by INVOCATION SHAPE, never by alias.", ""),
    ],
    ["delete the shard-batch rule", editRule(", one slot per concurrently-running shard batch", "")],
    ["delete the `--quick` exception", editRule("; `--quick` spawns none and stays unwrapped", "")],
    ["delete the pre-warmed dev server instruction", editRule(", and pre-warmed dev servers", "")],
    ["delete the spec/plan authoring exclusion", editRule(", and spec/plan authoring", "")],
  ];

  it.each(OPERATORS)("rejects a mutant that would %s", (_label, mutate) => {
    const mutated = mutate(LIVE);
    premiseHolds("the operator actually changed the document", mutated !== LIVE);
    expect(checkHeavyPhaseRule(mutated).length).toBeGreaterThan(0);
  });
});
