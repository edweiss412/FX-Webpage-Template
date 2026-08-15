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
- Commit per task, conventional-commits style. A task commits only in a passing state — no task
  ends RED (plan R1 F4: guard-RED and its GREEN swaps live in ONE task).
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
path read. Record each mutant's red in the Task 2 commit message.

## Acceptance criteria (spec §9, restated so task markers resolve)

- AC-1 constant wears `border-text-faint`, 8 call sites inherit (Task 2).
- AC-2 contrast meta-test passes and its premise/ratio mutants red (Task 2).
- AC-3 DESIGN.md §1.2/§1.2a amendments land; `pnpm spec:lint` on the spec and figure-parity green (Task 2).
- AC-4 40 SWAP sites at `text-text`; 15 registry rows; guard fails naming site AND token on an unregistered hit (Task 3).
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
const lightBlock = css.slice(css.indexOf(":root"), css.indexOf("@media (prefers-color-scheme: dark)"));
const darkStart = css.indexOf('[data-theme="dark"]');
const darkBlock = css.slice(darkStart, css.indexOf("}", css.indexOf("--color-status-degraded-text-runtime", darkStart)));

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
- [ ] **Step 5: Run the four string-presence mutants** (header section above); record each red in
  the commit body.
- [ ] **Step 6: Commit** — `feat(admin): secondary action outline to text-faint (spec §3)`.

### Task 3: D2 guard + the 40 swaps (one task: RED observed, GREEN committed)

**Files:**
- Create: `tests/styles/subtleInteractiveScan.ts (new)`
- Create: `tests/styles/subtleInteractiveExemptions.ts (new)`
- Test: `tests/styles/_metaSubtleOnInteractive.test.ts (new)`
- Modify: the 40 SWAP sites of spec §4.3. Shared-const sites are edited AT THE CONST
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

What is red and why: with the registry seeded ONLY with the 15 exempt rows (Step 2) and the
suite written (Step 3), the run at Step 4 fails naming each of the 40 SWAP sites (spec §4.3),
whose class strings still carry `text-text-subtle` on the live tree — the RED derives from live
production class strings; the SAME command goes green at Step 6 after the swaps, and the task
commits only then (plan R1 F4).

- [ ] **Step 1: Write the suite first (Step 3's snippet) and run it** — RED: module-not-found
  on `./subtleInteractiveScan` (invariant-1 ordering, plan R2 F4; the meaningful policy RED
  follows at Step 4 once the modules exist).
- [ ] **Step 2a: Write the scan module** — `scanSubtleInteractive` filters Task 1's elements to
  those where any of `allStrings(el)` matches `/(^|\s)text-text-subtle(\s|$)/`, emitting
  `token: "text-text-subtle"` and mapping `unresolved` to `partial`.
- [ ] **Step 2b: Seed the registry with EXACTLY the 15 exempt rows** from spec §4.3 (7
  summary-disclosure, 2 dismissable-chip, 6 state-dim). The 6 state-dim rows carry `siblingCue`
  per spec §4.1 Family D (AdminNav desktop: `{ file: "components/admin/nav/AdminNav.tsx",
  token: "bg-surface-raised" }`; bottom tabs: token `aria-current`; crew sub-nav:
  `{ file: "components/crew/CrewSubNav.tsx", token: "border-accent" }`; picker:
  `{ file: "app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx", token: "picker-row-lock" }`;
  both dashboard segments: `{ file: "components/admin/DashboardBucketSegmentedControl.tsx",
  token: "shadow-tile" }`). Registry-count reconciliation (authored AND run at plan time): spec
  table EXEMPT rows = 15 = 7 + 2 + 6; the suite asserts the array length.
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
    expect(SUBTLE_INTERACTIVE_EXEMPTIONS.length).toBe(15);
  });
});
```

- [ ] **Step 4: Run, verify FAIL** — the unregistered-hits assertion lists the 40 SWAP sites
  with their tokens. Capture the list; it must equal spec §4.3's SWAP rows (site drift since
  spec approval = stop, re-derive, and reconcile against §4.3 before continuing).
- [ ] **Step 5: Apply the 40 swaps.** Per spec §4.3: rest `text-text-subtle` → `text-text`;
  hover column governs each site (`→strong` sites get `hover:text-text-strong`; `same` sites
  keep their hover; `per-site check` sites: keep the existing hover if it still strengthens
  against the new rest color, else step it to `text-text-strong` — record each choice in the
  commit body). Also land the DESIGN.md §1.1/§1.1a policy text in this step.
- [ ] **Step 6: Run the suite, verify PASS.** Also `pnpm exec eslint .` (canonical class order)
  and Task 1's suite (the census expectations there reference files this step edits — the
  segClass/subtle expectations still hold because Family D sites keep their tokens).
- [ ] **Step 6b: One-shot hover verification (plan R2 F5).** The guard pins REST color only, so
  hover retargets are verified once, executably, at this step: for each of the 14 spec-§4.3
  rows whose Hover cell is `→strong`, run
  `rg -n "hover:text-text-strong" <file>` and confirm a hit on the edited element's class
  string; for each `per-site check` row, confirm the recorded choice (commit body) leaves a
  hover that strengthens or a non-color hover affordance. Paste the 14-site command outputs
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
  committed to the branch at `docs/superpowers/plans/2026-08-14-ui-interactive-token-policy.graduation.patch (new)`,
  produced by `git diff` from a locally staged (then reset) application. The patch's SEMANTIC
  content is thereby inside the whole-diff review's corpus; Step 3 applies it verbatim.
  Run the local gates in the same step: `pnpm heavy pnpm test` · `pnpm typecheck` ·
  `pnpm exec eslint .` · `pnpm format:check` ·
  `pnpm spec:lint docs/superpowers/specs/2026-08-14-ui-interactive-token-policy-design.md`.
  All green. (The ledger meta-test stays green here because the patch is not yet applied —
  markers are still on and the archive unchanged.)
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
  verify the working diff equals the patch (`git diff | diff - <patchfile>` modulo headers —
  any mismatch means the tree moved since review: STOP, regenerate, re-review), commit —
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
  lawful), land the fix through the Step 2 fix-loop discipline (including review rerun on the
  delta), regenerate the patch if ledger text moved, then repeat Steps 3-5 so the graduation
  commit is again the branch's last commit at merge time. Real-CI-only failures are an
  expected class (AGENTS.md local-passes-CI-fails); they take this loop, never a hotfix on
  top of the graduation commit.

<!-- tasks: end -->

## e2e harness note

No new Playwright surface: the guards are Vitest/AST; screenshot capture uses the existing
pinned-container configs. The e2e harness-readiness checklist is therefore N/A — no new server
boot, readiness gate, or sampler is introduced.

## 12. Closeout (filled by the implementing session)

Gate findings + dispositions land here (Task 7), followed by the marker line in the exact
grammar `impeccable-gate: critique=<RAN|RAN-DEGRADED> audit=<RAN|RAN-DEGRADED> p0=<int>
p1=<int> dispositions=<recorded|none>`, plus the Task 4 census category counts.
