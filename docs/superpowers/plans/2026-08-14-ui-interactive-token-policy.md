# UI Interactive Token Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three user-ratified interactive-token decisions — secondary-button outline to
`border-text-faint`, the three-family subtle-on-interactive carve-out policy with its structural
guard, and the statically-resolving repo-wide tap-height guard — as one PR.

**Architecture:** One shared AST scan core feeds two structural guard suites (D2 subtle-policy,
D3 tap-height); a contrast meta-test pins the D1 token swap; all three modules enroll in the
source-mutation registry before their review. All product-code edits are class-string edits.

**Tech Stack:** TypeScript compiler API (`typescript` package, already a dependency), Vitest,
existing mutation harness (`pnpm mutation:guards`), pinned Playwright Docker image for baselines.

**Spec:** `docs/superpowers/specs/2026-08-14-ui-interactive-token-policy-design.md` (APPROVED,
codex R5). The spec is canonical; §4.3 is the census disposition table, §5.2 the resolver rules.

**Routing:** every product-code surface here is UI — implementer is **Opus + impeccable v3**
(AGENTS.md hard rule). Run the `/impeccable` canonical v3 setup (context.mjs load of PRODUCT.md +
DESIGN.md, register read) BEFORE Task 2 — `DESIGN.md` is itself an invariant-8 UI surface, so the
first UI edit is Task 2, not Task 3 (plan R1 F10). The dual-gate itself is Task 7.

## Global Constraints

- Spec §1.1 R1–R11 are ratified; do not relitigate any of them during implementation or review.
- No new color tokens (spec R1: `--color-text-faint` is the outline token).
- The three ledger entries stay `IN PROGRESS · Branch: fix/ui-interactive-token-policy` until the
  PR's last commit (invariant 12).
- Heavy phases (`pnpm test`, `pnpm build`, screenshot capture, `pnpm mutation:guards`) run under
  `pnpm heavy` (AGENTS.md).
- Commit per task, conventional-commits style. A task commits only with the TEST SUITES
  passing — no task ends RED (plan R1 F4: guard-RED and its GREEN swaps live in ONE task). A
  task's `red=` MARKER command is a task-cycle observable, not a suite: it may lawfully remain
  red across a task's intermediate passing-state commits and greens at the task's designated
  GREEN step (plan R5 F2 — Task 8's patch-artifact commit and Task 6's baseline flow are the
  two instances; every suite is green at every commit in both).
- Em-dash ban and canonical token classes in any user-visible copy (pre-code mechanical UI gate).
- Every pasted snippet was typechecked at plan time against strict + `noUncheckedIndexedAccess` +
  `exactOptionalPropertyTypes`; keep signatures exactly as written or update every consumer task
  in the same edit.

## Meta-test inventory (declared)

CREATES: `tests/styles/interactiveScanCore.test.ts (new)`, `tests/styles/secondary-action-contrast.test.ts (new)`,
`tests/styles/_metaSubtleOnInteractive.test.ts (new)` (+ `subtleInteractiveScan.ts (new)`,
`subtleInteractiveExemptions.ts (new)`), `tests/styles/_metaTapTargetFloor.test.ts (new)`
(+ `tapTargetScan.ts (new)`, `tapTargetCensus.ts (new)`).
EXTENDS: `tests/mutation/source/registry.ts` (rows for `interactiveScanCore.ts (new)`,
`subtleInteractiveScan.ts (new)`, `tapTargetScan.ts (new)`) and the paired
`EXPECTED_LEDGER_KINDS` map in `tests/mutation/guardSurfaces.gate.test.ts:34` (the gate asserts
key equality with the registry, so registry rows without ledger-kind entries are RED — Task 5's
cycle).
The infra-contract, admin-alert, advisory-lock, and sentinel registries do NOT apply — this plan
touches no Supabase call, no alert, no lock, no tile sentinel.

## Mutation-family closure (declared up front)

Operator families for all three enrolled surfaces come from the declared vocabulary
(`tests/mutation/source/operators.ts:17`): `relational-boundary` (the ≥11 scale floor, depth
caps 3/6), `equality-flip` (tag and token comparisons), `logical-connector` (predicate arms,
rule-3/4 branch joins), `integer-literal` (44, 11, hop/depth bounds), `regex-quantifier-bound`
(floor/defeater token regexes), `statement-removal` (rule branches, the rule-8 defeater check,
registry validations). This enumeration is the closure set; a reviewer-proposed NEW family is
admissible only with a live escaping mutant against the shipped guard. `scoreFloor` for all
three rows: **0.9** — the registry's lowest live convention, chosen because these are
first-enrolment surfaces whose accepted-survivor set starts empty; raising the floor later is a
one-line change, lowering it is a debt decision (plan R1 F3: the live registry carries 0.9,
0.95, and 1; this plan pins one value instead of citing a "convention").

## String-presence mutants (four, run before review dispatch)

For `secondary-action-contrast.test.ts (new)` (the premise pin is a string-presence guard): (a) empty
the constant; (b) append `" border-border-strong"` after `border-text-faint`; (c) comment the
token out inside the constant string (present in file, not in the export); (d) vary the file
path read; (e) **ratio mutant (plan R7 F1, AC-2's executable ratio-drift proof)**: temporarily
set `--color-text-faint-runtime` in `app/globals.css`'s light block to `#cfcdc7` (1.59:1 vs
surface, below the 3:1 floor), run the suite, observe the ratio assertion RED, restore the
value, re-run green. Record each mutant's red in the Task 2 commit message.

## Acceptance criteria (spec §9, restated so task markers resolve)

- AC-1 constant wears `border-text-faint`, 8 call sites inherit (Task 2).
- AC-2 contrast meta-test passes and its premise/ratio mutants red (Task 2).
- AC-3 DESIGN.md §1.2/§1.2a amendments land; `pnpm spec:lint` on the spec and figure-parity green (Task 2).
- AC-4 every §4.3 SWAP site at `text-text`; one registry row per EXEMPT site (41/14 as
  shipped, corrected from 40/15 on 2026-08-15); guard fails naming site AND token on an unregistered hit (Task 3).
- AC-5 tap-height guard ships: rules 1-8 resolver, seeded census, fail-by-name (Tasks 1, 4).
- AC-6 three mutation-registry rows + ledger-kind entries; zero unaccepted survivors (Task 5).
- AC-7 impeccable dual-gate run; marker line written (Task 7).
- AC-8 all three ledger entries graduated, markers off in the final commit (Task 8).
- AC-9 affected baselines regenerated from the pinned image; parity green in real CI (Tasks 6, 8).

---

<!-- tasks: depth=3 -->

### Task 1: Shared scan core

**Files:**
- Create: `tests/styles/interactiveScanCore.ts (new)`
- Test: `tests/styles/interactiveScanCore.test.ts (new)`

**Interfaces:**
- Produces (later tasks import these exact names from `./interactiveScanCore`):

```ts
export type ScanElement = {
  file: string;      // repo-relative
  line: number;      // 1-based
  tag: string;
  paths: string[][]; // the COMPLETE set of render alternatives: one entry per full
                     // branch assignment of the className expression; each entry is
                     // the class strings reachable on that render. An unconditional
                     // className has exactly one path. Capped at 64 paths; beyond
                     // the cap the element is marked unresolved (demote, never guess).
  unresolved: boolean;  // any part unreadable, or path cap exceeded
  hasClassName: boolean;
};
export const FLOOR_COMPONENT_ALLOWLIST: ReadonlyArray<{
  tag: string; file: string; mustContain: string;
}>;
export function scanInteractiveElements(rootDir: string): ScanElement[];
export function allStrings(el: ScanElement): string[]; // union over every path
export function heightFloorSatisfied(el: ScanElement): boolean; // rules 1-7 positive arm
export function defeaterPresent(el: ScanElement): boolean;      // rule 8 (existential over allStrings)
```

`heightFloorSatisfied` semantics (plan R2 F1 — the round-1 `branchGroups` model lost branch
ANCESTRY: `outer ? (inner ? floor : floor) : ""` cleared through the inner group while the
outer false path had no floor; a path-set model cannot lose ancestry because a path IS a full
branch assignment): true only when `!unresolved`, `!defeaterPresent(el)`, and EITHER
(a) EVERY path in `paths` carries a floor token — this is spec §5.2 rules 1/3/4 in one
quantifier: an unconditional floor is a floor on the single path; a both-branches ternary
floors both paths; a one-branch floor leaves a floorless path and never clears — OR
(b) the element's tag is in `FLOOR_COMPONENT_ALLOWLIST` (spec §5.2 rule 7, the positive arm —
plan R2 F2: a registered component's own base guarantees the floor, so its call site clears
even with no className at all, but remains subject to `defeaterPresent` and to `unresolved`
demotion on whatever className it does carry).
Identifier resolution is scope-aware, **innermost declaration wins** (spec §2.3; plan R1 F2 —
do NOT keep the plan-time probe's first-wins shortcut; the probe was census-equivalent on the
current corpus but is not the contract).

<!-- task: red=`pnpm vitest run tests/styles/interactiveScanCore.test.ts` ac=AC-5 -->

What is red and why: the suite imports `./interactiveScanCore`, which does not exist on the
current tree — the RED derives from the missing production module, not from test-local fixtures.

- [ ] **Step 1: Write the failing test** — `tests/styles/interactiveScanCore.test.ts (new)`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { premiseHolds } from "../_shared/premise";
import {
  FLOOR_COMPONENT_ALLOWLIST,
  allStrings,
  defeaterPresent,
  heightFloorSatisfied,
  scanInteractiveElements,
  type ScanElement,
} from "./interactiveScanCore";

const el = (over: Partial<ScanElement>): ScanElement => ({
  file: "x.tsx",
  line: 1,
  tag: "button",
  paths: [[]],
  unresolved: false,
  hasClassName: true,
  ...over,
});

// Fixture harness (plan R2 F3): the resolver is ALSO exercised end-to-end through temp files,
// so a flattening scanner or first-wins lookup cannot stay green on unit cases alone.
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
function scanFixture(source: string) {
  const dir = mkdtempSync(join(tmpdir(), "scan-fixture-"));
  mkdirSync(join(dir, "components"), { recursive: true });
  mkdirSync(join(dir, "app"), { recursive: true });
  writeFileSync(join(dir, "components", "Fx.tsx"), source);
  return scanInteractiveElements(dir);
}

describe("resolver corpus walk", () => {
  const all = scanInteractiveElements(process.cwd());
  it("covers the live corpus (premise: non-trivial)", () => {
    premiseHolds("corpus has >=300 in-scope elements", all.length >= 300);
  });
  it("resolves same-file helper calls (segClass shape, spec §5.2 rule 6)", () => {
    const seg = all.filter((e) => e.file.endsWith("DashboardBucketSegmentedControl.tsx"));
    premiseHolds("segmented control links found", seg.length >= 2);
    expect(seg.some((e) => allStrings(e).some((str) => /text-text-subtle/.test(str)))).toBe(true);
  });
  it("resolves imported constants one hop (SECONDARY_ACTION_CLASS consumers clear)", () => {
    const re = all.find((e) => e.file.endsWith("RescanSheetButton.tsx"));
    expect(re && heightFloorSatisfied(re)).toBe(true);
  });
  it("marks prop-flow children unresolved (ClaimedRowButton, spec §10)", () => {
    const c = all.find((e) => e.file.endsWith("_ClaimedRowButton.tsx"));
    expect(c?.unresolved).toBe(true);
  });
  it("includes allowlisted component call sites without onClick (RetryWatchButton)", () => {
    expect(all.some((e) => e.file.endsWith("RetryWatchButton.tsx") && e.tag === "AccentButton")).toBe(true);
  });
});

describe("resolver end-to-end fixtures (plan R2 F3, executable, not comments)", () => {
  it("innermost const shadows outer: shadowed under-floor value must NOT clear", () => {
    const els = scanFixture([
      'const k = "min-h-tap-min";',
      "export function C() {",
      '  const k = "min-h-0";',
      "  return <button className={k}>x</button>;",
      "}",
    ].join("\n"));
    const b = els.find((e) => e.tag === "button");
    expect(b && heightFloorSatisfied(b)).toBe(false);
  });
  it("a ternary emits two paths, not a flattened union", () => {
    const els = scanFixture([
      "export function C({ f }: { f: boolean }) {",
      '  return <button className={f ? "min-h-tap-min" : "px-2"}>x</button>;',
      "}",
    ].join("\n"));
    const b = els.find((e) => e.tag === "button");
    expect(b?.paths.length).toBe(2);
    expect(b && heightFloorSatisfied(b)).toBe(false); // one floorless path
  });
  it("nested conditional keeps ancestry: inner both-branch floor under a floorless outer arm never clears", () => {
    const els = scanFixture([
      "export function C({ a, b }: { a: boolean; b: boolean }) {",
      '  return <button className={a ? (b ? "min-h-tap-min" : "min-h-tap-min") : ""}>x</button>;',
      "}",
    ].join("\n"));
    const btn = els.find((e) => e.tag === "button");
    expect(btn && heightFloorSatisfied(btn)).toBe(false); // the a-false path has no floor
  });
});

describe("height floor (spec §5.1/§5.2 rules 1-4, 7) and defeaters (rule 8)", () => {
  it.each([
    ["min-h-tap-min", true],
    ["size-tap-min", true],
    ["h-11", true],
    ["min-h-[44px]", true],
    ["h-10", false],
    ["min-w-tap-min", false],
    ["w-11", false],
  ])("single-path floor token %s -> %s", (tok, want) => {
    expect(heightFloorSatisfied(el({ paths: [[tok]] }))).toBe(want);
  });
  it("floor on every path clears; floor on one of two paths never clears (rules 3-4)", () => {
    expect(heightFloorSatisfied(el({ paths: [["min-h-tap-min a"], ["min-h-tap-min b"]] }))).toBe(true);
    expect(heightFloorSatisfied(el({ paths: [["min-h-tap-min"], ["px-2"]] }))).toBe(false);
  });
  it("unresolved never clears (rule 2)", () => {
    expect(heightFloorSatisfied(el({ paths: [["min-h-tap-min"]], unresolved: true }))).toBe(false);
  });
  it("rule 7: allowlisted component clears with no className, but a call-site defeater demotes", () => {
    expect(heightFloorSatisfied(el({ tag: "AccentButton", paths: [[]], hasClassName: false }))).toBe(true);
    expect(heightFloorSatisfied(el({ tag: "AccentButton", paths: [["min-h-0!"]] }))).toBe(false);
    expect(heightFloorSatisfied(el({ tag: "AccentButton", paths: [[]], unresolved: true }))).toBe(false);
  });
  it.each([
    "min-h-0!",
    "max-h-10!",
    "[height:0]!",
    "[min-height:0]",
    "sm:min-h-0",
    "hover:h-4",
  ])("defeater %s demotes even from a minority path", (tok) => {
    expect(defeaterPresent(el({ paths: [["min-h-tap-min"], [tok]] }))).toBe(true);
  });
  it("a clean floor string carries no defeater", () => {
    expect(defeaterPresent(el({ paths: [["inline-flex min-h-tap-min px-4"]] }))).toBe(false);
  });
});

describe("floor-component allowlist companion (spec §5.2 rule 7)", () => {
  it.each(FLOOR_COMPONENT_ALLOWLIST)("$tag base class declaration carries the floor", (row) => {
    // Scoped to the BASE_CLASS declaration, NOT the whole file: a comment elsewhere in the
    // file also contains the token, so a whole-file `toContain` is a false-green mutant
    // (plan R1 F6, probed: AccentButton.tsx line 86 comment vs line 106 live token).
    const src = readFileSync(row.file, "utf8");
    const decl = src.match(/const BASE_CLASS = cn\(([\s\S]*?)\);/);
    expect(decl, `${row.file}: BASE_CLASS declaration not found`).not.toBeNull();
    expect((decl as RegExpMatchArray)[1]).toContain(row.mustContain);
  });
});
```

- [ ] **Step 2: Run it, verify FAIL** — `pnpm vitest run tests/styles/interactiveScanCore.test.ts`
  — expected: module-not-found on `./interactiveScanCore`.
- [ ] **Step 3: Implement `tests/styles/interactiveScanCore.ts (new)`.** The spec's §2.3
  procedure prose is normative (the plan-time probe that produced the ratified census followed
  it; its shape: file-walk `app/**`+`components/**` `.tsx`, `ts.createSourceFile` per file,
  visit JSX opening/self-closing elements). Normative points:
  - In-scope predicate: tags `button|a|summary|Link`, `input` with static `type`
    `checkbox|radio`, any tag with `role="button"` or an `onClick` attribute, PLUS any tag in
    `FLOOR_COMPONENT_ALLOWLIST` (derive — map over the allowlist, never a second literal list).
  - Resolver (rules 1-6): string/template literals and template spans; ternary and
    `&&`/`||`/`??` FORK the path set (each arm continues its own paths; the missing arm of
    `&&` continues with no contribution), so nesting composes by construction; `cn`/`clsx` and
    other call arguments; identifiers via SCOPE-AWARE lookup, innermost wins; one-hop imports
    resolving `@/` and relative specifiers to exported consts (re-export depth ≤ 3); same-file
    function declarations and arrow/function-expression consts resolve their return
    expressions (a multi-return function forks paths like a conditional); recursion depth ≤ 6;
    path cap 64. Anything else sets `unresolved = true`.
  - `heightFloorSatisfied` / `defeaterPresent`: exactly as the Interfaces block above; floor and
    defeater token grammars per spec §5.1 and §5.2 rule 8 (including `max-h-*`, arbitrary
    height properties, recipe-scoped padding/inset families, `!` and variant-prefixed forms).
  - `FLOOR_COMPONENT_ALLOWLIST` first row:
    `{ tag: "AccentButton", file: "components/shared/AccentButton.tsx", mustContain: "min-h-tap-min" }`.
- [ ] **Step 4: Run the suite, verify PASS** — same command. If a corpus expectation fails, fix
  the RESOLVER, not the expectation: each corpus expectation restates a spec-§2.3 probe fact.
- [ ] **Step 5: Commit** — `test(styles): shared interactive scan core (spec §2.3/§5.2)`.

### Task 2: D1 — contrast meta-test, token swap, DESIGN.md pins

**Files:**
- Create: `tests/styles/secondary-action-contrast.test.ts (new)`
- Modify: `lib/ui/actionClass.ts` (the `SECONDARY_ACTION_CLASS` string: `border-border-strong` → `border-text-faint`; update the header comment's outline description in the same edit)
- Modify: `DESIGN.md` §1.2 (add the text-faint-as-outline contrast rows), §1.2a (extend the rule to control outlines; cite the button as worked example)

**Interfaces:** none consumed; produces the DESIGN.md §1.2 rows later tasks may cite.

<!-- task: red=`pnpm vitest run tests/styles/secondary-action-contrast.test.ts` ac=AC-1,AC-2,AC-3 -->

What is red and why: the premise assertion requires `border-text-faint` inside
`SECONDARY_ACTION_CLASS`; the live constant carries `border-border-strong`
(`lib/ui/actionClass.ts:30`, verified at plan time), so the new suite fails until Step 3 lands.

- [ ] **Step 1: Write the failing test**:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SECONDARY_ACTION_CLASS } from "@/lib/ui/actionClass";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function relLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const ch = (i: number) => parseInt(c.slice(i, i + 2), 16) / 255;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(ch(0)) + 0.7152 * lin(ch(2)) + 0.0722 * lin(ch(4));
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
// Same block-scoped extraction pattern as tests/styles/status-token-contrast.test.ts:
// light values from :root, dark from the [data-theme="dark"] block.
function tokenIn(block: string, name: string): string {
  const m = block.match(new RegExp(`${name}-runtime:\\s*(#[0-9a-fA-F]{6})`));
  if (!m || !m[1]) throw new Error(`token ${name} not found`);
  return m[1];
}
// Line-anchored regex anchors (plan R8 F1: bare indexOf hits a comment at css line 43 and the
// @theme alias block, leaving the dark block without runtime tokens; probed against live CSS:
// light #8b8c92/#ffffff/#f4f3f1/#fafaf9, dark #74736d/#16171c/#0b0c10/#0f1014 all resolve).
function anchor(re: RegExp): number {
  const m = css.match(re);
  if (!m || m.index === undefined) throw new Error(`anchor ${re} not found`);
  return m.index;
}
const lightBlock = css.slice(anchor(/^:root \{/m), anchor(/^@media \(prefers-color-scheme: dark\)/m));
const darkBlock = css.slice(anchor(/^\[data-theme="dark"\] \{/m));

describe("secondary action outline (spec §3, DESIGN §1.2a control-outline rule)", () => {
  it("premise: the constant actually wears the token the ratios pin", () => {
    expect(SECONDARY_ACTION_CLASS).toContain("border-text-faint");
    expect(SECONDARY_ACTION_CLASS).not.toContain("border-border-strong");
  });
  it.each([
    ["light", lightBlock],
    ["dark", darkBlock],
  ])("%s: text-faint clears 3:1 on surface, surface-sunken, and bg", (_mode, block) => {
    const faint = tokenIn(block, "--color-text-faint");
    for (const ground of ["--color-surface", "--color-surface-sunken", "--color-bg"]) {
      expect(contrast(faint, tokenIn(block, ground))).toBeGreaterThanOrEqual(3.0);
    }
  });
});
```

- [ ] **Step 2: Run, verify FAIL** on the premise assertion (constant still has the old token).
- [ ] **Step 3: Swap the token** in `lib/ui/actionClass.ts` and amend the header comment; add the
  DESIGN.md §1.2 rows (light 3.35/3.02/3.21, dark 3.76/4.11/4.00 — spec §2.2 table) and the
  §1.2a control-outline sentence with the R5 framing (design upgrade, not a compliance repair).
- [ ] **Step 4: Run** the new suite AND `pnpm vitest run tests/styles/design-figure-parity.test.ts
  tests/components/admin/wizard/step3JudgmentChrome.test.tsx` AND
  `pnpm spec:lint docs/superpowers/specs/2026-08-14-ui-interactive-token-policy-design.md` —
  all green (AC-3; plan R1 F7).
- [ ] **Step 5: Run the five mutants** (header section above — four string-presence plus the
  ratio mutant); record each red in the commit body.
- [ ] **Step 6: Commit** — `feat(admin): secondary action outline to text-faint (spec §3)`.

### Task 3: D2 guard + the swaps (one task: RED observed, GREEN committed)

**Files:**
- Create: `tests/styles/subtleInteractiveScan.ts (new)`
- Create: `tests/styles/subtleInteractiveExemptions.ts (new)`
- Test: `tests/styles/_metaSubtleOnInteractive.test.ts (new)`
- Modify: the SWAP sites of spec §4.3. Shared-const sites are edited AT THE CONST
  (`ghostBtn` in `RoleMappingRow.tsx`, `TAP_TARGET` in `AppHealthIndicator.tsx`, `HELP_LINK` in
  `BellPanel.tsx`, `ACTION_CLASS` in `PersonRow.tsx` — one edit each covers their consumers).
- Modify: `DESIGN.md` §1.1 (subtle row usage note) + new §1.1a (the three families, verbatim
  family definitions from spec §4.1 including the six state-dim cues).

**Interfaces:**
- Consumes: `scanInteractiveElements`, `allStrings`, `ScanElement` from Task 1.
- Produces:

```ts
// subtleInteractiveScan.ts
export type SubtleHit = { file: string; line: number; tag: string; token: string; partial: boolean };
export function scanSubtleInteractive(rootDir: string): SubtleHit[];
// subtleInteractiveExemptions.ts
export type SubtleFamily = "summary-disclosure" | "dismissable-chip" | "state-dim";
export type SubtleExemption = {
  file: string; line: number; tag: string; token: string; family: SubtleFamily; reason: string;
  siblingCue?: { file: string; token: string };
};
export const SUBTLE_INTERACTIVE_EXEMPTIONS: readonly SubtleExemption[];
```

`token` is the matched class token (always `"text-text-subtle"` today; the field exists so a
future second policed token cannot alias rows — plan R1 F5, spec §4.4's zIndexExemptions shape
`{file, line, token, reason}` now carried in full).

<!-- task: red=`pnpm vitest run tests/styles/_metaSubtleOnInteractive.test.ts` ac=AC-4 -->

What is red and why: with the registry seeded ONLY with the exempt rows (Step 2) and the
suite written (Step 3), the run at Step 4 fails naming each SWAP site (spec §4.3),
whose class strings still carry `text-text-subtle` on the live tree — the RED derives from live
production class strings; the SAME command goes green at Step 6 after the swaps, and the task
commits only then (plan R1 F4).

- [ ] **Step 1: Write the suite first (Step 3's snippet) and run it** — RED: module-not-found
  on `./subtleInteractiveScan` (invariant-1 ordering, plan R2 F4; the meaningful policy RED
  follows at Step 4 once the modules exist).
- [ ] **Step 2a: Write the scan module** — `scanSubtleInteractive` filters Task 1's elements to
  those where any of `allStrings(el)` matches `/(^|\s)text-text-subtle(\s|$)/`, emitting
  `token: "text-text-subtle"` and mapping `unresolved` to `partial`.
- [ ] **Step 2b: Seed the registry with EXACTLY the exempt rows** from spec §4.3 (7
  summary-disclosure, 1 dismissable-chip, 6 state-dim — 2 chips at plan time, corrected to 1
  on 2026-08-15 when the whole-diff review found the second was the "Clear filters" action
  and never met Family C's definition). The 6 state-dim rows carry `siblingCue`
  per spec §4.1 Family D (AdminNav desktop: `{ file: "components/admin/nav/AdminNav.tsx",
  token: "bg-surface-raised" }`; bottom tabs and crew sub-nav both pin the `aria-current`
  expression as shipped — `border-accent` and `text-accent-on-bg` were the plan-time pins and
  the whole-diff review showed each covered only one branch or the colour delta itself; picker:
  `{ file: "app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx", token: "picker-row-lock" }`;
  both dashboard segments: `{ file: "components/admin/DashboardBucketSegmentedControl.tsx",
  token: "shadow-tile" }`). Registry-count reconciliation (authored AND run at plan time): spec
  table EXEMPT rows = 14 = 7 + 1 + 6 as shipped (15 = 7 + 2 + 6 at plan time); the suite asserts
  the array length, which is the single place that number lives.
- [ ] **Step 3: The suite (written at Step 1)**:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { premiseHolds } from "../_shared/premise";
import { SUBTLE_INTERACTIVE_EXEMPTIONS } from "./subtleInteractiveExemptions";
import { scanSubtleInteractive } from "./subtleInteractiveScan";

const hits = scanSubtleInteractive(process.cwd());
const key = (x: { file: string; line: number; token: string }) => `${x.file}:${x.line}:${x.token}`;
const registry = new Map(SUBTLE_INTERACTIVE_EXEMPTIONS.map((r) => [key(r), r]));
const liveByKey = new Map(hits.map((h) => [key(h), h]));

// Strip line comments so a cue or reason surviving only in commentary cannot satisfy a pin
// (same false-green shape as plan R1 F6, applied to this suite's own source assertions).
const nonCommentSource = (file: string): string =>
  readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

describe("subtle-on-interactive policy (DESIGN §1.1/§1.1a, spec §4)", () => {
  it("premise: the scan sees the committed carve-out sites", () => {
    premiseHolds("scan finds >=1 hit", hits.length >= 1);
  });
  it("every hit is a registered carve-out (fail names site AND token)", () => {
    const unregistered = hits
      .filter((h) => !registry.has(key(h)))
      .map((h) => `${h.file}:${h.line} <${h.tag}> ${h.token}`);
    expect(unregistered).toEqual([]);
  });
  it("no stale registry row (every row still a live hit)", () => {
    expect(SUBTLE_INTERACTIVE_EXEMPTIONS.filter((r) => !liveByKey.has(key(r))).map(key)).toEqual([]);
  });
  it("reasons are never blank", () => {
    for (const r of SUBTLE_INTERACTIVE_EXEMPTIONS) expect(r.reason.trim().length).toBeGreaterThan(0);
  });
  it("family shapes hold against the SCANNED hit, not the row's own claim", () => {
    for (const r of SUBTLE_INTERACTIVE_EXEMPTIONS) {
      const live = liveByKey.get(key(r));
      expect(live, `${key(r)} has no live hit`).toBeDefined();
      if (!live) continue;
      if (r.family === "summary-disclosure") expect(live.tag).toBe("summary");
      if (r.family === "dismissable-chip") expect(live.file).toContain("ActiveFilterChips");
      if (r.family === "state-dim") {
        const cue = r.siblingCue;
        if (!cue) throw new Error(`${key(r)} state-dim row without siblingCue`);
        expect(nonCommentSource(cue.file), `${key(r)} sibling cue ${cue.token}`).toContain(cue.token);
      }
    }
  });
  it("registry cardinality matches the spec §4.3 tallies", () => {
    expect(SUBTLE_INTERACTIVE_EXEMPTIONS.length).toBe(14); // 15 at plan time; see §4.3
  });
});
```

- [ ] **Step 4: Run, verify FAIL** — the unregistered-hits assertion lists the SWAP sites
  with their tokens. Capture the list; it must equal spec §4.3's SWAP rows (site drift since
  spec approval = stop, re-derive, and reconcile against §4.3 before continuing).
- [ ] **Step 5: Apply the swaps.** Per spec §4.3: rest `text-text-subtle` → `text-text`;
  hover column governs each site (`→strong` sites get `hover:text-text-strong`; `same` sites
  keep their hover; `per-site check` sites: keep the existing hover if it still strengthens
  against the new rest color, else step it to `text-text-strong` — record each choice in the
  commit body). Also land the DESIGN.md §1.1/§1.1a policy text in this step.
- [ ] **Step 6: Run the suite, verify PASS.** Also `pnpm exec eslint .` (canonical class order)
  and Task 1's suite (the census expectations there reference files this step edits — the
  segClass/subtle expectations still hold because Family D sites keep their tokens).
- [ ] **Step 6b: One-shot hover verification (plan R2 F5).** The guard makes no hover claim at
  all — what it pins is the registry's rows plus the absence of any other bare
  `text-text-subtle`, not a site's replacement token — so
  hover retargets are verified once, executably, at this step: for each of the 15 spec-§4.3
  rows whose Hover cell is `→strong` (15 as shipped: `ActiveFilterChips.tsx:101` joined them in
  the 2026-08-15 correction) run
  `rg -n "hover:text-text-strong" <file>` and confirm a hit on the edited element's class
  string; for each `per-site check` row, confirm the recorded choice (commit body) leaves a
  hover that strengthens or a non-color hover affordance. Paste the 15-site command outputs
  into the commit body. This is a one-shot migration check, not a standing guard — hover
  policy permanence lives in DESIGN.md prose; worst case of later drift is cosmetic
  (documented limit, consistent with the spec's D2 posture).
- [ ] **Step 7: Behavioral spot-check** in the running app (`pnpm dev` outside the slot wrapper)
  on 390px + desktop: nav still shows active/inactive distinction (Family D untouched), swapped
  chrome (bell, user menu, theme toggle) reads at full text color, EventFilters selected state
  still inverts.
- [ ] **Step 8: Commit** — `feat(admin): subtle-on-interactive guard + step 40 sites up to text-text (spec §4)`.

### Task 4: D3 tap-height guard + census

**Files:**
- Create: `tests/styles/tapTargetScan.ts (new)`
- Create: `tests/styles/tapTargetCensus.ts (new)`
- Test: `tests/styles/_metaTapTargetFloor.test.ts (new)`

**Interfaces:**
- Consumes: Task 1's `scanInteractiveElements`, `heightFloorSatisfied`, `defeaterPresent`.
- Produces:

```ts
// tapTargetScan.ts
export type TapVerdict = { file: string; line: number; tag: string; state: "clear" | "unclassified" };
export function scanTapTargets(rootDir: string): TapVerdict[];
// tapTargetCensus.ts
export type TapCensusCategory =
  | "inline-prose-link" | "parent-label-target" | "full-bleed"
  | "padding-arithmetic" | "under-floor-filed" | "unresolvable-dynamic";
export type TapCensusRow = {
  file: string; line: number; tag: string;
  category: TapCensusCategory; reason: string; backlogRef?: string;
};
export const TAP_TARGET_CENSUS: readonly TapCensusRow[];
```

<!-- task: red=`pnpm vitest run tests/styles/_metaTapTargetFloor.test.ts` ac=AC-5 -->

What is red and why: at Step 3 the suite runs against an EMPTY census array and fails naming
every UNCLASSIFIED element — the spec-§2.4-baseline bucket families all exist on the live tree
(the 2026-08-07 baseline counted 139 uncleared of 340, and the resolver clears only part of
bucket E), so the red derives from live production class strings; the SAME command goes green
at Step 5 with the seeded census, and the task commits only then.

- [ ] **Step 1: Write the suite first (Step 2's snippet) and run it** — RED: module-not-found
  on `./tapTargetScan` (invariant-1 ordering, plan R2 F4; the meaningful census RED follows at
  Step 3).
- [ ] **Step 1b: Write `scanTapTargets`** — element `state` is `"clear"` when
  `heightFloorSatisfied(el)` and not `defeaterPresent(el)`, else `"unclassified"` — AND create
  `tests/styles/tapTargetCensus.ts (new)` with its types and an EMPTY `TAP_TARGET_CENSUS`
  array (plan R3 F1: the suite imports both modules, so the empty-census RED at Step 3 needs
  the census FILE to exist while its array is empty; Step 4 seeds the existing file).
- [ ] **Step 2: The suite (written at Step 1)** — the same shape as Task 3's, concretely:

```ts
import { describe, expect, it } from "vitest";
import { premiseHolds } from "../_shared/premise";
import { TAP_TARGET_CENSUS } from "./tapTargetCensus";
import { scanTapTargets } from "./tapTargetScan";

const verdicts = scanTapTargets(process.cwd());
const key = (x: { file: string; line: number }) => `${x.file}:${x.line}`;
const census = new Map(TAP_TARGET_CENSUS.map((r) => [key(r), r]));
const unclassified = verdicts.filter((v) => v.state === "unclassified");

describe("repo-wide tap-height floor (spec §5)", () => {
  it("premise: the corpus is non-trivial and something clears", () => {
    premiseHolds("corpus >=300", verdicts.length >= 300);
    premiseHolds("a SECONDARY_ACTION_CLASS consumer clears via rule 6",
      verdicts.some((v) => v.file.endsWith("RescanSheetButton.tsx") && v.state === "clear"));
  });
  it("every UNCLASSIFIED element has a census row (fail names the element)", () => {
    expect(unclassified.filter((v) => !census.has(key(v))).map((v) => `${key(v)} <${v.tag}>`)).toEqual([]);
  });
  it("no stale census row (every row still a live unclassified site)", () => {
    const live = new Set(unclassified.map(key));
    expect(TAP_TARGET_CENSUS.filter((r) => !live.has(key(r))).map(key)).toEqual([]);
  });
  it("reasons are never blank; filed rows carry the backlog ref", () => {
    for (const r of TAP_TARGET_CENSUS) {
      expect(r.reason.trim().length).toBeGreaterThan(0);
      if (r.category === "under-floor-filed") {
        expect(r.backlogRef).toBe("BL-TAP-TARGET-INLINE-TEXT-CONTROLS");
      }
    }
  });
});
```

- [ ] **Step 3: Run with the census EMPTY, verify FAIL**, and capture the failure list — it IS
  the derived census. Categorize every listed element into the six categories using spec §5.3
  (bucket B/C/F families from the 2026-08-07 §2.6 disposition, bucket D by padding arithmetic
  with the arithmetic in the reason, bucket A residue → `under-floor-filed`, remainder →
  `unresolvable-dynamic` with a one-line reason each).
- [ ] **Step 4: Seed `tests/styles/tapTargetCensus.ts (new)`** with the categorized rows. Paste
  the final per-category counts into §12 below — the spec deliberately promises no number (R7).
- [ ] **Step 5: Run, verify PASS** with the seeded census.
- [ ] **Step 6: Commit** — `test(styles): repo-wide tap-height structural guard + census (spec §5)`.

### Task 5: Mutation-registry enrolment

**Files:**
- Modify: `tests/mutation/source/registry.ts` — three `GuardSurface` rows:
  `interactiveScanCore.ts (new)` (suites: all three new meta-suites), `subtleInteractiveScan.ts (new)`
  (suite: `_metaSubtleOnInteractive`), `tapTargetScan.ts (new)` (suite: `_metaTapTargetFloor`);
  operators per the closure declaration above; `scoreFloor: 0.9` each; a `control` edit per
  surface that its suite provably notices (e.g. flip the subtle-token regex to match
  `text-text-faint`; drop the rule-8 defeater check; empty the in-scope tag set).
- Modify: `tests/mutation/guardSurfaces.gate.test.ts` — add the three surfaces'
  `EXPECTED_LEDGER_KINDS` entries with the counts the harness actually reports.

<!-- task: red=`pnpm heavy pnpm vitest run tests/mutation/guardSurfaces.gate.test.ts` ac=AC-6 -->

What is red and why (plan R1 F3 — the earlier `pnpm mutation:guards` red was invalid because
the registry is opt-in and an absent surface is untouched): after Step 1 adds the three
registry rows, the gate's key-equality assertion
(`tests/mutation/guardSurfaces.gate.test.ts:87`) fails because `EXPECTED_LEDGER_KINDS` lacks
the new ids; the SAME command goes green at Step 3 once the harness has run and the counted
ledger-kind entries land.

- [ ] **Step 1: Add the three registry rows.** Run the gate suite — verify FAIL on key
  equality. The gate suite TRANSITIVELY runs the mutation harness for every enrolled surface
  (`tests/mutation/guardSurfaces.gate.test.ts:93` runs `describe.each(GUARD_SURFACES)`), so
  every invocation here and in Step 3 is wrapped: `pnpm heavy pnpm vitest run
  tests/mutation/guardSurfaces.gate.test.ts` (heavy-phase transitive shape rule, plan R2 F6).
- [ ] **Step 2: Run the harness** — `pnpm heavy pnpm mutation:guards`. Triage survivors: kill
  genuine gaps by strengthening the suites; a genuinely equivalent mutant gets an `accepted`
  row with its reason. Zero UNACCEPTED survivors before the review dispatch (spec R9).
- [ ] **Step 3: Add the `EXPECTED_LEDGER_KINDS` entries** with the real counted kinds; run the
  wrapped gate suite — verify PASS.
- [ ] **Step 4: Commit** — `test(mutation): enroll interactive-scan guard surfaces`.

### Task 6: Screenshot baselines

**Files:**
- Modify: affected committed WebPs under `public/help/screenshots/`. The manifest
  (`scripts/help-screenshots.manifest.ts`) has seven entries — all seven enumerated (plan R2
  F7); expected impact from the diff's surfaces (verify each by pixel-diff, do not trust this
  table blindly):
  - `dashboard-overview`: AdminNav chrome swaps (AppHealthIndicator, NotifBell, UserMenu) —
    CHANGES. Dashboard bucket segments are Family D and stay.
  - `review-queues-empty-state`: same admin shell and nav chrome — CHANGES.
  - `preview-as-crew-banner`: admin nav chrome — CHANGES.
  - `needs-attention-mobile`: AdminNav bottom tabs are Family D (stay); nav bell (SWAP) may be
    in frame — verify; page body has no census site.
  - `crew-preview-today-mobile` / `crew-preview-gear-mobile` / `crew-preview-schedule-mobile`:
    CrewSubNav inactive tabs are Family D (stay); `ReportButton` (SWAP) renders in the crew
    footer; KeyTimesStrip/AgendaScheduleBlock summaries are Family S (stay) — CHANGES where the
    ReportButton is in frame, verify.

<!-- task: red=`git diff --quiet -- public/help/screenshots` ac=AC-9 -->

What is red and why: run at plan time on the clean tree, exit 0. Step 2 regenerates the WebPs
in the worktree and then RUNS THIS COMMAND, observing exit 1 (the declared RED on the declared
command — plan R1 F8); Step 3's commit returns it to exit 0, which is the task's green.

- [ ] **Step 1: Pixel-diff BEFORE rebaselining** — regenerate INTO A TEMP DIR from the pinned
  Playwright Docker image with `--platform linux/amd64` (byte-comparison discipline,
  AGENTS.md). **Wrapper placement (plan R4 F4): `pnpm heavy` wraps the HOST-side `docker run`
  command** — the semaphore's slot dir is host `/tmp/fx-heavy-slots`
  (`scripts/with-heavy-slot.py:36`), which the capture container does not mount, so an inner
  wrapper would coordinate only within the container and admit nothing machine-wide. Diff
  against committed baselines; confirm the moving set matches the table above — an unexpected
  moving surface is a defect: stop and diagnose.
- [ ] **Step 2: Rebaseline in the worktree** from the pinned image — same wrapper placement:
  `pnpm heavy docker run … pnpm screenshot:help` (host-side wrap, capture inside). Run
  `git diff --quiet -- public/help/screenshots` — verify exit 1 (RED observed).
- [ ] **Step 3: Commit the WebPs** — `chore(assets): rebaseline screenshots for token policy diff`
  — and re-run the marker command, verify exit 0.

### Task 7: Invariant-8 impeccable dual-gate

<!-- task: red=`grep -qE "^impeccable-gate: critique=(RAN|RAN-DEGRADED) audit=(RAN|RAN-DEGRADED) p0=[0-9]+ p1=[0-9]+ dispositions=(recorded|none)$" docs/superpowers/plans/2026-08-14-ui-interactive-token-policy.md` ac=AC-7 -->

What is red and why: the marker line below §12 does not exist yet (verified: this grep exits 1
on the committed plan); it is written only after both gate halves run on the real diff.

- [ ] **Step 1: Run `/impeccable critique`** with the canonical v3 setup (context.mjs load of
  PRODUCT.md + DESIGN.md, register read) on the affected diff.
- [ ] **Step 2: Run `/impeccable audit`** the same way.
- [ ] **Step 3: Fix P0/P1 findings or defer each via a DEFERRED.md entry** (ledger filing bar
  applies). Every fix is a product change: it follows the normal TDD cycle and commits with a
  conventional message before the gate reruns.
- [ ] **Step 4: If Step 3 changed ANY UI file, rerun BOTH gate halves on the updated diff**
  (plan R2 F8 — a marker written against a superseded diff is a stale claim). Loop Steps 3-4
  until a run reports no unfixed, undeferred P0/P1.
- [ ] **Step 5: Write the `impeccable-gate:` marker line in §12** with the FINAL run's values;
  record findings + dispositions in §12.
- [ ] **Step 6: Commit** — `docs(plan): invariant-8 gate results`.

### Task 8: Close-out — gates, ledger graduation, PR

<!-- task: red=`test $(grep -cE "^## (BL-SECONDARY-BUTTON-BOUNDARY-INVISIBLE|BL-SUBTLE-ON-INTERACTIVE-CLASS|BL-TAP-TARGET-STRUCTURAL-GUARD)( |$)" BACKLOG-archive.md) -eq 3` ac=AC-8 -->

What is red and why: none of the three entries has been graduated, so the heading-anchored
count is 0 and the test exits 1 (run at plan time; bare-mention greps false-positive on
cross-references in other entries' prose, and a single-id grep can green with two entries
ungraduated — plan R1 F9 — so the count demands ALL THREE headings). It exits 0 once Step 3
applies the reviewed graduation patch moving all three entries into `BACKLOG-archive.md` as
their own entries; `tests/docs/_metaLedgerInProgress.test.ts` (Step 4) then holds the rest of
the invariant-12 contract (markers gone, archives reject in-flight work).

- [ ] **Step 1: Draft the graduation as a reviewed artifact (plan R4 F1).** Author the full
  graduation change — the three `BACKLOG-archive.md` entries with provenance (census history
  32/34/53/55, Family D ratification, the Task 4 census counts), the three BACKLOG.md entry
  removals including their `**Status:** IN PROGRESS` marker lines — as a git patch file
  committed to the branch at `docs/superpowers/plans/2026-08-14-ui-interactive-token-policy.graduation.patch (new)`.
  Exact production mechanics (plan R5 F1 — no staging involved): apply the ledger edits in the
  WORKING TREE, run `git diff -- BACKLOG.md BACKLOG-archive.md > <patchfile>` (bare `git diff`
  reads the working tree, which is where the edits are), then restore with
  `git checkout -- BACKLOG.md BACKLOG-archive.md` and verify `git status --porcelain` shows
  only the new patch file. The patch's SEMANTIC content is thereby inside the whole-diff
  review's corpus; Step 3 applies it verbatim.
  Run the local gates in the same step: `pnpm heavy pnpm test` · `pnpm typecheck` ·
  `pnpm exec eslint .` · `pnpm format:check` ·
  `pnpm spec:lint docs/superpowers/specs/2026-08-14-ui-interactive-token-policy-design.md`.
  All green. (The ledger meta-test stays green here because the patch is not yet applied —
  markers are still on and the archive unchanged. Task 8's red= marker command remains red at
  this commit BY DESIGN; it greens at Step 3 — see the Global Constraints marker-vs-suite
  distinction.)
- [ ] **Step 2: Whole-diff cross-model review on the COMMITTED tree** (codex-guard,
  `--stage diff`; every change through Task 7 plus the graduation patch file is committed),
  split tight-scope briefs if the file list is large; APPROVE required. **Fix loop (plan R3
  F2):** any fix this review forces follows the full discipline — TDD cycle, its own
  conventional commit, re-run of the Step 1 local gates, re-run of BOTH impeccable halves if
  the fix touched any UI file (Task 7's marker updates from the new final run), regeneration
  of the graduation patch if the fix touched ledger text — then the whole-diff review RERUNS
  on the new tree. Loop until APPROVE lands.
- [ ] **Step 3: Apply the reviewed patch as the PR's LAST commit.**
  `git apply` of the committed graduation patch file,
  then verify byte identity: `git diff -- BACKLOG.md BACKLOG-archive.md > /tmp/applied.diff &&
  diff /tmp/applied.diff <patchfile>` — IDENTICAL bytes, no header allowance (same base tree
  produces the same headers; `git apply` failing OR any diff-of-diffs output means the tree
  moved since review: STOP, revert the apply, regenerate the patch, re-review). The commit
  contains EXACTLY two parts, both declared (plan R6 F1): the reviewed graduation bytes, and
  the review-corpus JSONL row(s) the final APPROVE dispatch appended to
  `docs/review-rounds/fix/ui-interactive-token-policy/` (wrapper-generated telemetry that by
  definition cannot precede its own review; auditable as append-only —
  `git diff --numstat` on the jsonl must show additions only). After committing, verify
  `git status --porcelain` is EMPTY — any other residue means an unaccounted mutation: stop
  and diagnose. Commit —
  `docs: graduate ui-token-policy ledger entries` (invariant 12's letter: markers come off in
  the last commit and never reach main; review-covers-what-merges holds because the commit
  reproduces reviewed bytes). Run the marker command — verify exit 0.
- [ ] **Step 4: Run `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts
  tests/docs/_metaReviewRoundEconomy.test.ts tests/docs/_metaInvariant8Closeout.test.ts`** —
  green (in-flight markers gone, archive shape valid, closeout marker present).
- [ ] **Step 5: Push, real CI green, `gh pr merge --merge`, fast-forward local main**
  (`git rev-list --left-right --count main...origin/main` → `0  0`).
  **Last-commit restoration loop (plan R4 F2):** if Step 4 or real CI forces ANY further
  change, first `git revert` the graduation commit (markers return, ledger meta-test stays
  lawful) and **PUSH the revert immediately** (plan R7 F2 — invariant 12 reads claims from
  origin's branches; a locally-restored marker is invisible to every other session for the
  whole repair window, which can be long when real CI forced the loop), land the fix through the Step 2 fix-loop discipline — including a FULL whole-diff review
  rerun on the new tree, never a delta-scoped review (plan R5 F3; the fresh-eyes whole-diff
  contract admits no narrower scope) — regenerate the patch if ledger text moved, then repeat
  Steps 3-5 so the graduation commit is again the branch's last commit at merge time (each
  repeat's final-dispatch corpus row rides in that commit under the same two-part declaration
  and the same clean-tree verification). Real-CI-only failures are an
  expected class (AGENTS.md local-passes-CI-fails); they take this loop, never a hotfix on
  top of the graduation commit.

<!-- tasks: end -->

## e2e harness note

No new Playwright surface: the guards are Vitest/AST; screenshot capture uses the existing
pinned-container configs. The e2e harness-readiness checklist is therefore N/A — no new server
boot, readiness gate, or sampler is introduced.

## 12. Closeout

### Task 4 census, derived by running the shipped scanner

354 in-scope interactive elements. AS FIRST RUN (2026-08-14): 303 clear, **51 census rows**
— 14 `full-bleed`, 13 `unresolvable-dynamic`, 8 `padding-arithmetic`, 7 `parent-label-target`,
7 `inline-prose-link`, 2 `under-floor-filed`. AS SHIPPED, after the whole-diff review tightened
the recogniser and corrected three rows: **301 clear, 53 census rows** — 15 `full-bleed`, 13
`unresolvable-dynamic`, 9 `padding-arithmetic`, 7 `inline-prose-link`, 5 `under-floor-filed`,
4 `parent-label-target`. `tests/styles/tapTargetCensus.ts` is the authority and now asserts its
own tallies against its rows, per section and in total; the numbers here are dated snapshots. The D2 side reproduced the ratified census
exactly on its first run — 55 `text-text-subtle` hits across 44 files, matching spec §2.3 v3
and every row of §4.3 by file, tag and line — which is the strongest available evidence that
the shipped scanner and the drafting-time probe agree.

Three grammar refinements landed during Task 4, each TDD'd first and each NARROWING false
demotion rather than widening what passes: named spacing tokens read from `@theme` (so
`min-h-tap-min` is one row of a map rather than a special case), descendant/pseudo token
scoping (`[&_svg]:size-4` sizes a child, `before:h-4` sizes a pseudo — neither speaks for the
element's own box), and an object-literal spread exception (a spread whose every reachable
value is a static object literal without a `className` key is read rather than feared).
Together they cleared 13 elements that a cruder grammar would have censused.

Two real defects surfaced on the guard's first run: `AutoPublishToggle` and `NotifyToggle`
were 28px switches with no hit-area expansion (repaired in-branch to the sibling
`PublishedToggle` recipe, 28 + 2x8 = 44), and the two `app/admin/dev/page.tsx` buttons are
~28px with classes Tailwind does not even compile (filed as `BL-ADMIN-DEV-PANEL-TAP-FLOOR`,
because a class-level repair there would emit no CSS while making the guard report a floor the
browser never applies).

### Task 5 mutation enrolment — two surfaces, not three, and a harness repair

**`subtleInteractiveScan` is NOT enrolled, and that is a deviation from the plan's own
Task 5 (three rows).** The harness rejected it by its own no-mutants condition: the module
produced ZERO mutants. The cause is structural rather than an oversight to patch — the module
is a filter over `interactiveScanCore` plus two data declarations, and the declared operator
set is control-flow shaped (no relational, equality or logical operator; no integer literal;
no regex quantifier; no removable statement). Every decision it makes belongs to the core,
which IS enrolled, through the very suite that decides this module's verdicts. Restructuring
it to grow mutation sites would be gaming the operator set, and a vacuous row is worse than an
honest absence — the gate's no-mutants condition exists to say exactly that. The registry
carries the reason at the row's former position, so the next reader finds it where they look.

**A mutant that never terminates wedged the harness, and the harness had no ceiling.**
`statement-removal` of `cursor = cursor.parent;` inside `while (cursor)`
(`tests/styles/interactiveScanCore.ts`) makes the scan loop forever. `runSuite` called
`execFileSync` with no `timeout`, so the child ran 1h48m and the run scored 0 of 207 mutants
before it was killed by hand. This is not this surface's problem: four wedged
`mutantOverlay.config.ts` children from OTHER arcs were alive on the same machine at that
moment (2h28m, 2h55m, 3h53m, 5h43m). Repaired in-branch under TDD — a 180 s per-suite ceiling
with `killSignal: "SIGKILL"`, and a timed-out child scored KILLED, which is both the standard
convention (Stryker, PIT) and defensible for the same reason as the existing L-3: a guard that
stops terminating never goes green again, so the mutant cannot ship silently. The
discrimination is `code === "ETIMEDOUT"` ALONE, because a timeout kill and this machine's
idle-process reaper arrive in the same no-status shape and must not share a verdict; a reaper
SIGTERM still throws `MutantRunInfraError` and stays fatal. Recorded as L-9 in the harness
spec, and pinned by three cases including a live unmocked probe that Node really does report
`ETIMEDOUT` — without it, the two mocked cases would agree with each other while every real
hang still wedged the run forever.

**The gate found 61 gaps in a suite that had already passed three impeccable rounds, and 56 of
them were repaid rather than blessed.** First run: 207 mutants, 146 killed, **score 0.7053**
against a 0.9 floor. The survivors were not exotic — they were the boundaries and the
cross-module forms the hand-written suite had no fixture for: all three resolver bounds
(`MAX_RESOLVE_DEPTH`, `MAX_PATHS`, `MAX_IMPORT_HOPS`) sat comfortably inside every existing
case, so each constant could be moved with nothing to notice; the negative-margin recipe had
no fixture at all; the whole spread reader and the whole re-export chain were dark, because
the fixture harness could only write ONE file. The repair added a multi-file harness and 34
cases — a 6-vs-7 nested-paren pair on the depth budget, a 64-vs-65 alternative pair on the
path cap, a 3-vs-4 link re-export chain on the hop ceiling, one case per spread arm
(`as` / `&&` / `||` / `??`, plus the two that must still demote), and the two crash cases where
an empty JSX expression reaches a predicate. Five survivors are ledgered `equivalent`, all one
shape: a mutation whose only effect is on a value no consumer can distinguish (the empty
string added to a token list nothing counts; a loop's off-the-end read of `undefined`).

One case was wrong in a way worth recording: the case-clause scope fixture used a BRACED case
body, which is an ordinary `Block` the resolver already handled, so the arm it meant to
exercise stayed dark and its mutant survived a second run. Removing the braces killed it. A
fixture can miss its own subject.

**The CI job's ceiling was already gone before this arc touched it.** `mutation-harness` is
non-gating by design, and it is not merge-blocking here either; but a job that always times
out stops meaning anything. Measured 2026-08-15: 138 min on `main` (run 31871859884) with no
new surfaces, and this arc's own PR head — which had enrolled NOTHING — hit the 180 min
ceiling exactly (run 31876214966, 180m15s, step cancelled). Enrolment adds 207 mutants to the
gates file's 519 (+40%), so `timeout-minutes` moves 180 -> 300 with the numbers in the comment.
That is headroom, not a fix: the real repair is bounding the gates file's wall clock as
surfaces enrol, filed as `BL-MUTATION-HARNESS-WALLCLOCK-CEILING`.

### Whole-diff cross-model review (Task 8)

Dispatched as TWO tight-scope reviews rather than one whole-diff pass (AGENTS.md: split
reviews are the default beyond a handful of files; this diff is 96). Round 1 returned
**BLOCKING on both halves** — 7 findings on the guard/harness half, 2 on the product half.
Seven were real, and every one of them was in the SILENT direction: a control the guard
PASSED whose class string does not actually prove 44px at rest. Each was probed against the
shipped scanner before repair, and the probe output is what settled it, not the argument.

**What the grammar was accepting.** `max-h-96` (a ceiling read as a floor), `hover:min-h-tap-min`
and `sm:h-11` (a floor in a state, which is not the at-rest claim), `[&:hover]:h-4` (the element
itself, read as a descendant's box), and `before:-inset-x-2` (a HORIZONTAL bleed accepted as
proof of height — the shape two live sites actually wear). Both expansion recipes are now one
arithmetic over the element's declared height, or `ASSUMED_TEXT_ROW_PX` when it declares none:
the assumption spec §5.3 already ratified for `p-3`, named once instead of implied twice in two
drifting versions. That also priced `p-3 py-1` honestly (4px, not 12) and a small bleed honestly
(`-inset-y-1` over a text row is 28px, not 44).

**What the resolver was claiming.** A `let` reassigned to an under-floor class was read from its
initializer; a helper with a bare `return;` or a fall-off-the-end path contributed only its
floored returns; and the floor-component allowlist matched on TAG SPELLING, so a locally defined
`AccentButton` inherited the canonical component's guarantee. The `let` repair has a sharp edge
worth recording: returning "not found" for an unreadable binding sends the lookup to the import
table, where another module's export of that name resolves and clears — so it returns a distinct
"found but unreadable" answer, and a fixture pins exactly that.

**Two census rows and one registry row were true about the pattern and false about the site.**
Three `parent-label-target` rows: two FINANCIALS checkboxes sit in a `div` with a SIBLING label
(a div does not toggle a checkbox) and one radio is wrapped by a label with no height and no
padding. All three are `under-floor-filed` now against `BL-CHECKBOX-ROW-LABEL-UNDER-FLOOR`. One
`dismissable-chip` row was the "Clear filters" action — no caption, no dismiss glyph — so it
never met Family C's definition; it was swapped, the registry is 14 rows, and spec §4.3 carries
the correction with the family set explicitly untouched.

**The census grew from 51 to 53 rows, and that is the system working.** BellPanel's chevron and
AdminPageHeader's back link lost a clear they had been getting for the wrong reason.

**One product finding is a recorded position rather than a repair.** The outline's ratios were
pinned on three neutral grounds while DESIGN claimed four, and eleven shipped controls across ten sites stand on a
TINTED plate where the outer edge measures 2.79-2.88:1. `surface-raised` is asserted now and the
tinted numbers are pinned so they cannot drift in either direction; whether tinted plates deserve
their own treatment is a design decision, filed as `BL-CONTROL-OUTLINE-ON-TINTED-PLATES` under
the same R5 frame that governs the whole change.

### Invariant-8 dual gate (Task 7)

Both halves ran on the implementing diff with the canonical v3 setup (`context.mjs` load of
PRODUCT.md + DESIGN.md, product register read). The critique half ran **dual-agent** in all
three rounds: Assessment A (design review) and Assessment B (detector + browser evidence) as
isolated sub-agents, neither seeing the other's output. No round was degraded.

**Assessment B, all three rounds.** `detect.mjs` over the changed `.tsx` set returned the same
9 findings at the same locations every round, all one rule (`broken-image`), all FALSE
POSITIVES: every cited line is a JS comment containing the literal text `<img>`, and the one
real `<img>` in those files was never flagged. Browser evidence (both themes, live server):
the swapped resting colour computes `--color-text` (#1a1b1f / #e8e6e0), a `border
border-text-faint` probe computes #8b8c92 / #74736d, and `min-h-tap-min` measures 44px.
Measured contrast for the new outline: 3.21 / 3.35 / 3.02 light and 4.00 / 3.76 / 4.11 dark
against bg / surface / surface-sunken — every ground clears the 3:1 non-text floor; the token
it replaced failed all six by roughly 2x. The new resting colour measures 16.47:1 light /
15.23:1 dark on bg, against the AA-only ~6.5:1 the 40 controls rested at.

**Findings and dispositions.**

| # | Round | Sev | Finding | Disposition |
|---|---|---|---|---|
| 1 | 1 | P1 | 25 sites carry the secondary-action recipe INLINE over a `bg-bg` fill and were left at 1.59:1, making the new §1.2a rule false on the surfaces it describes | FIXED — all 25 swapped; cover checked for the multi-line case |
| 2 | 1 | P1 | `ShowRowActions.tsx` "… and N more" row got a dead `text-text` override of a constant that already sets it | FIXED — token removed; the row is an action and its copy carries the distinction |
| 3 | 1 | P1 | `BellPanel.tsx` HELP_LINK comment still claimed the link was quiet/subtle | FIXED — rewritten to name hue and the hover-only underline as what separates it from the CTA |
| 4 | 1 | P2 | Family D read as an enumeration, so `EventFilters` and `DashboardBucketSegmentedControl` looked inconsistent | FIXED — §1.1a states the excluding predicate (a pair whose active member inverts the fill is not Family D) |
| 5 | 1 | P2 | The review modal's monitoring-only pill now out-contrasts the needs-you branch | FILED — `BL-REVIEW-MODAL-QUIET-PILL-OUTRANKS-URGENT`, exception (a): moving a site out of a ratified census table is the user's call |
| 6 | 2 | P1 | Three controls were split from a swapped partner in the same row | FIXED — `Step2Verify.tsx:126`, `DriveConnectionPanel.tsx:284`, `RecentAutoAppliedStrip.tsx:516` |
| 7 | 2 | P1 | 26 further in-scope controls carry the border token on surface fills | FILED — `BL-CONTROL-OUTLINE-BORDER-STRONG-ON-SURFACE-FILLS`, exception (a): extending §1.2a's predicate is a DESIGN decision and would silently retune the switch-track boundary §1.2 pins against `--color-accent-edge`. Entry carries a DERIVED cover, later re-run to 23 |
| 8 | 2 | P1 | Four controls rest at `text-text-faint`, one rung below the retired token | FILED — `BL-TEXT-FAINT-AS-RESTING-INTERACTIVE-COLOUR`, exception (a) |
| 9 | 2 | P2 | Stale prose: four sites asserting the old colour contract | FIXED (claimed complete — it was not; see 11) |
| 10 | 2 | P3 | A control that paints its label through a nested span is invisible to the D2 scan | RECORDED — documented limit in `subtleInteractiveScan.ts` |
| 11 | 3 | P1 | The co-visible criterion is TRANSITIVE: the strip repaired in round 2 renders `AcceptChangeButton` and `UndoChangeButton` from other files | FIXED — both swapped |
| 12 | 3 | P2/P3 | Eight MORE stale-prose instances, two in files fed by this arc's own constant and one inside DESIGN.md | FIXED — all eight, then closed by a mechanical eleven-shape sweep that now returns only a history note and one true claim about a filed `text-faint` control |

Round 3 reported `UNFIXED P0/P1: 1` (finding 11), which this branch then fixed; the audit half
ran on the resulting tree. The stale-prose vector took three rounds because rounds 1 and 2 each
repaired the instances they were shown instead of deriving the class — the round-3 close is a
sweep over claim SHAPES, not a longer list.

**Audit half (technical), run on the tree the third critique round produced.** Score 19/20:
accessibility 4, performance 3, theming 4, responsive 4, anti-patterns 4. **P0 = 0, P1 = 0,
P2 = 0.** Every contrast ratio was recomputed independently and matches DESIGN §1.2 to 0.01;
the switch recipe measures exactly 44px with no clipping parent and no colliding neighbour;
zero raw hex entered any component; every `max-sm:` variant survived the swap unchanged. The
audit agreed that `disabled:opacity-60` on the new outline is a documented limit rather than a
finding (SC 1.4.11 exempts inactive components), and that the tailwindcss shell-out inside the
contrast suite is near-necessary, because it is the only mechanism that can see the
`@source not "lib/"` failure mode at all.

Four P3s, all addressed rather than deferred:

- The `@source inline` entry no longer carries the load — peer controls wear the class now, so
  deleting the entry would currently change nothing. The comment says so, and names the
  compiled-CSS guard as the actual defence.
- Six of the changed controls have a non-near-ground fill, which §1.2a's wording did not cover.
  §1.2a now records exactly why those six moved — two direct pairs, two connected through a
  shared row, one by constant inheritance, all six to avoid a split treatment inside one
  rendered view — and restates that the general predicate is the ledger entry's to settle.
- The tailwindcss shell-out discarded stderr, so a compile failure would have surfaced as a
  bare "Command failed"; it now rethrows with the captured output.
- `--color-surface-raised` was an unpinned fourth ground for the outline; §1.2 now carries its
  row (3.35:1 light / 3.53:1 dark).

The audit independently verified that all four filed ledger entries exist in `BACKLOG.md` with
a class-sweep exception and a reachability line, and its one prose objection — that the
control-outline entry described only the `bg-bg` sites — is fixed in the entry.

impeccable-gate: critique=RAN audit=RAN p0=0 p1=7 dispositions=recorded

The counts are the gate's CUMULATIVE P0/P1 across all four runs, not the last run's. The task
text says "the FINAL run's values", and the final run — the audit half, on the shipped tree —
reported 0/0; but the marker grammar cross-checks the two against each other
(`tests/docs/_invariant8Closeout.ts`: nonzero counts require `dispositions=recorded`, zero
counts require `none`), so `p0=0 p1=0 dispositions=recorded` is rejected as malformed by
construction. Reporting 0/0/none would then have to claim this gate found nothing, which is
false: it found seven P1s, and the table above is what happened to each — five fixed in-branch,
two filed with a named class-sweep exception. The cumulative reading is the only one the
grammar and the history can both be true under.
