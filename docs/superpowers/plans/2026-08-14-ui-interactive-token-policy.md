# UI Interactive Token Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three user-ratified interactive-token decisions — secondary-button outline to
`border-text-faint`, the three-family subtle-on-interactive carve-out policy with its structural
guard, and the statically-resolving repo-wide tap-height guard — as one PR.

**Architecture:** One shared AST scan core feeds two structural guard suites (D2 subtle-policy,
D3 tap-height); a contrast meta-test pins the D1 token swap; both guard modules enroll in the
source-mutation registry before their review. All product-code edits are class-string edits.

**Tech Stack:** TypeScript compiler API (`typescript` package, already a dependency), Vitest,
existing mutation harness (`pnpm mutation:guards`), pinned Playwright Docker image for baselines.

**Spec:** `docs/superpowers/specs/2026-08-14-ui-interactive-token-policy-design.md` (APPROVED,
codex R5). The spec is canonical; §4.3 is the census disposition table, §5.2 the resolver rules.

**Routing:** every product-code surface here is UI — implementer is **Opus + impeccable v3**
(AGENTS.md hard rule). Run `/impeccable` context setup before the first UI edit (Task 4), and the
dual-gate (Task 8) before close.

## Global Constraints

- Spec §1.1 R1–R11 are ratified; do not relitigate any of them during implementation or review.
- No new color tokens (spec R1: `--color-text-faint` is the outline token).
- The three ledger entries stay `IN PROGRESS · Branch: fix/ui-interactive-token-policy` until the
  PR's last commit (invariant 12).
- Heavy phases (`pnpm test`, `pnpm build`, screenshot capture) run under `pnpm heavy` (AGENTS.md).
- Commit per task, conventional-commits style.
- Em-dash ban and canonical token classes in any user-visible copy (pre-code mechanical UI gate).
- Every pasted snippet was typechecked at plan time against the repo tsconfig; keep signatures
  exactly as written or update every consumer task in the same edit.

## Meta-test inventory (declared)

CREATES: `tests/styles/interactiveScanCore.test.ts (new)`, `tests/styles/secondary-action-contrast.test.ts (new)`,
`tests/styles/_metaSubtleOnInteractive.test.ts (new)` (+ `subtleInteractiveScan.ts (new)`,
`subtleInteractiveExemptions.ts (new)`), `tests/styles/_metaTapTargetFloor.test.ts (new)`
(+ `tapTargetScan.ts (new)`, `tapTargetCensus.ts (new)`).
EXTENDS: `tests/mutation/source/registry.ts` (rows for `interactiveScanCore.ts (new)`,
`subtleInteractiveScan.ts (new)`, `tapTargetScan.ts (new)`).
The infra-contract, admin-alert, advisory-lock, and sentinel registries do NOT apply — this plan
touches no Supabase call, no alert, no lock, no tile sentinel.

## Mutation-family closure (declared up front)

Operator families for all three enrolled surfaces come from the declared vocabulary
(`tests/mutation/source/operators.ts:17`): `relational-boundary` (the ≥11 scale floor, depth
caps 3/6), `equality-flip` (tag and token comparisons), `logical-connector` (predicate arms,
rule-3/4 branch joins), `integer-literal` (44, 11, hop/depth bounds), `regex-quantifier-bound`
(floor/defeater token regexes), `statement-removal` (rule branches, the rule-8 defeater check,
registry validations). This enumeration is the closure set; a reviewer-proposed NEW family is
admissible only with a live escaping mutant against the shipped guard.

## String-presence mutants (four, run before review dispatch)

For `secondary-action-contrast.test.ts (new)` (the premise pin is a string-presence guard): (a) empty
the constant; (b) append `" border-border-strong"` after `border-text-faint`; (c) comment the
token out inside the constant string (present in file, not in the export); (d) vary the file
path read. Record each mutant's red in the Task 2 commit message.

## Acceptance criteria (spec §9, restated so task markers resolve)

- AC-1 constant wears `border-text-faint`, 8 call sites inherit (Task 2).
- AC-2 contrast meta-test passes and its premise/ratio mutants red (Task 2).
- AC-3 DESIGN.md §1.2/§1.2a amendments land; figure-parity green (Task 2).
- AC-4 40 SWAP sites at `text-text`; 15 registry rows; guard fails by name on an unregistered hit (Tasks 3-4).
- AC-5 tap-height guard ships: rules 1-8 resolver, seeded census, fail-by-name (Tasks 1, 5).
- AC-6 three mutation-registry rows; zero unaccepted survivors (Task 6).
- AC-7 impeccable dual-gate run; marker line written (Task 8).
- AC-8 ledger graduation with markers off in the final commit (Task 9).
- AC-9 affected baselines regenerated from the pinned image; parity green in real CI (Tasks 7, 9).

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
  file: string;        // repo-relative
  line: number;        // 1-based
  tag: string;
  resolved: string[];  // statically reachable className strings (rules 1–6)
  unresolved: boolean; // any part of the className expression was unreadable
  hasClassName: boolean;
};
export const FLOOR_COMPONENT_ALLOWLIST: ReadonlyArray<{
  tag: string; file: string; mustContain: string;
}>;
export function scanInteractiveElements(rootDir: string): ScanElement[];
export function heightFloorSatisfied(el: ScanElement): boolean; // rules 1–7 positive arm
export function defeaterPresent(el: ScanElement): boolean;      // rule 8
```

<!-- task: red=`pnpm vitest run tests/styles/interactiveScanCore.test.ts` ac=AC-5 -->

What is red and why: the suite imports `./interactiveScanCore`, which does not exist on the
current tree — the RED derives from the missing production module, not from test-local fixtures.

- [ ] **Step 1: Write the failing test** — `tests/styles/interactiveScanCore.test.ts (new)`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { premiseHolds } from "../_shared/premise";
import {
  FLOOR_COMPONENT_ALLOWLIST,
  defeaterPresent,
  heightFloorSatisfied,
  scanInteractiveElements,
  type ScanElement,
} from "./interactiveScanCore";

const el = (over: Partial<ScanElement>): ScanElement => ({
  file: "x.tsx",
  line: 1,
  tag: "button",
  resolved: [],
  unresolved: false,
  hasClassName: true,
  ...over,
});

describe("resolver corpus walk", () => {
  const all = scanInteractiveElements(process.cwd());
  it("covers the live corpus (premise: non-trivial)", () => {
    premiseHolds("corpus has >=300 in-scope elements", all.length >= 300);
  });
  it("resolves same-file helper calls (segClass shape, spec §5.2 rule 6)", () => {
    const seg = all.filter((e) => e.file.endsWith("DashboardBucketSegmentedControl.tsx"));
    premiseHolds("segmented control links found", seg.length >= 2);
    expect(seg.some((e) => e.resolved.some((s) => /text-text-subtle/.test(s)))).toBe(true);
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

describe("height floor (spec §5.1) and defeaters (spec §5.2 rule 8)", () => {
  it.each([
    ["min-h-tap-min", true],
    ["size-tap-min", true],
    ["h-11", true],
    ["min-h-[44px]", true],
    ["h-10", false],
    ["min-w-tap-min", false],
    ["w-11", false],
  ])("floor token %s -> %s", (tok, want) => {
    expect(heightFloorSatisfied(el({ resolved: [tok] }))).toBe(want);
  });
  it("unresolved never clears (rule 2)", () => {
    expect(heightFloorSatisfied(el({ resolved: ["min-h-tap-min"], unresolved: true }))).toBe(false);
  });
  it.each([
    "min-h-0!",
    "max-h-10!",
    "[height:0]!",
    "[min-height:0]",
    "sm:min-h-0",
    "hover:h-4",
  ])("defeater %s demotes", (tok) => {
    expect(defeaterPresent(el({ resolved: [`min-h-tap-min ${tok}`] }))).toBe(true);
  });
  it("a clean floor string carries no defeater", () => {
    expect(defeaterPresent(el({ resolved: ["inline-flex min-h-tap-min px-4"] }))).toBe(false);
  });
});

describe("floor-component allowlist companion (spec §5.2 rule 7)", () => {
  it.each(FLOOR_COMPONENT_ALLOWLIST)("$tag base class still guarantees the floor", (row) => {
    expect(readFileSync(row.file, "utf8")).toContain(row.mustContain);
  });
});
```

- [ ] **Step 2: Run it, verify FAIL** — `pnpm vitest run tests/styles/interactiveScanCore.test.ts`
  — expected: module-not-found on `./interactiveScanCore`.
- [ ] **Step 3: Implement `tests/styles/interactiveScanCore.ts (new)`.** The plan-time probe script (scratchpad file probe-subtle-v2.mjs, session-local; its
  procedure is normative in spec §2.3) is the verified reference implementation — it produced
  the spec's §2.3 v3 census. Port that procedure to TS with these normative points, all from spec
  §2.3/§5.1/§5.2:
  - Corpus: every `.tsx` under `app/**` + `components/**`, filesystem-walked.
  - In-scope predicate: tags `button|a|summary|Link`, `input` with static `type` `checkbox|radio`,
    any tag with `role="button"` or an `onClick` attribute, PLUS any tag in
    `FLOOR_COMPONENT_ALLOWLIST` (derive — map over the allowlist, never a second literal list).
  - Resolver (rules 1–6): string/template literals; template spans; ternary both branches;
    binary operands; `cn`/`clsx` and other call arguments; identifiers via a file-wide
    `const`-initializer map (innermost-wins acceptable as first cut: the probe's first-wins map
    produced the ratified census — keep first-wins and note it in a comment); one-hop imports
    resolving `@/` and relative specifiers to exported consts (re-export depth ≤ 3); same-file
    function declarations and arrow/function-expression consts resolve to the union of their
    return expressions or expression body; recursion depth ≤ 6. Anything else sets
    `unresolved = true`.
  - `heightFloorSatisfied`: false when `unresolved` or `defeaterPresent`; true when any resolved
    string carries `min-h-tap-min`, `size-tap-min`, `h-<n>`/`min-h-<n>` with n ≥ 11, arbitrary
    `h-[…]`/`min-h-[…]` ≥ 44px, the negative-margin+padding recipe pair, `before:absolute` with
    negative inset, or `sr-only`; or when the tag is an allowlist component (rule 7).
  - `defeaterPresent`: regex family over every resolved string per spec §5.2 rule 8 — sub-floor
    `h-*`/`min-h-*`/`max-h-*`/`size-*` (numeric < 11, `0|auto|none|fit|min|max|px`, arbitrary
    < 44px), arbitrary properties `[height:…]`/`[min-height:…]`/`[max-height:…]` sub-floor, the
    recipe-scoped padding and inset families (apply only when the floor was proven by that
    recipe), each also in `!` and variant-prefixed (`*:`) forms.
  - `FLOOR_COMPONENT_ALLOWLIST` first row:
    `{ tag: "AccentButton", file: "components/shared/AccentButton.tsx", mustContain: "min-h-tap-min" }`.
- [ ] **Step 4: Run the suite, verify PASS** — same command. If a corpus expectation fails,
  fix the RESOLVER, not the expectation: each expectation restates a spec-§2.3 probe fact.
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
  tests/components/admin/wizard/step3JudgmentChrome.test.tsx` — all PASS (transition counts are
  unaffected: the swap adds no `transition-*` token).
- [ ] **Step 5: Run the four string-presence mutants** (header section above); record each red in
  the commit body.
- [ ] **Step 6: Commit** — `feat(admin): secondary action outline to text-faint (spec §3)`.

### Task 3: D2 guard (RED against the un-swapped tree)

**Files:**
- Create: `tests/styles/subtleInteractiveScan.ts (new)`
- Create: `tests/styles/subtleInteractiveExemptions.ts (new)`
- Test: `tests/styles/_metaSubtleOnInteractive.test.ts (new)`

**Interfaces:**
- Consumes: `scanInteractiveElements`, `ScanElement` from Task 1.
- Produces:

```ts
// subtleInteractiveScan.ts
export type SubtleHit = { file: string; line: number; tag: string; partial: boolean };
export function scanSubtleInteractive(rootDir: string): SubtleHit[];
// subtleInteractiveExemptions.ts
export type SubtleFamily = "summary-disclosure" | "dismissable-chip" | "state-dim";
export type SubtleExemption = {
  file: string; line: number; tag: string; family: SubtleFamily; reason: string;
  siblingCue?: { file: string; token: string };
};
export const SUBTLE_INTERACTIVE_EXEMPTIONS: readonly SubtleExemption[];
```

<!-- task: red=`pnpm vitest run tests/styles/_metaSubtleOnInteractive.test.ts` ac=AC-4 -->

What is red and why: with the registry seeded ONLY with the 15 exempt rows, the suite fails
naming each of the 40 SWAP sites (spec §4.3), whose class strings still carry
`text-text-subtle` on the live tree — verified by the plan-time census run.

- [ ] **Step 1: Write the scan module** — `scanSubtleInteractive` filters Task 1's elements to
  those whose `resolved` strings match `/(^|\s)text-text-subtle(\s|$)/`, mapping `unresolved`
  to `partial`.
- [ ] **Step 2: Seed the registry with EXACTLY the 15 exempt rows** from spec §4.3 (7
  summary-disclosure, 2 dismissable-chip, 6 state-dim). The 6 state-dim rows carry `siblingCue`
  per spec §4.1 Family D (e.g. AdminNav desktop: `{ file: "components/admin/nav/AdminNav.tsx",
  token: "bg-surface-raised" }`; bottom tabs: token `aria-current`; crew sub-nav: token
  `border-accent`; picker: `{ file: "app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx",
  token: "picker-row-lock" }`; both dashboard segments: `{ file:
  "components/admin/DashboardBucketSegmentedControl.tsx", token: "shadow-tile" }`).
  Registry-count reconciliation (authored AND run at plan time): spec table EXEMPT rows = 15 =
  7 + 2 + 6; the seeded array length is asserted `=== 15` in the suite.
- [ ] **Step 3: Write the failing suite**:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { premiseHolds } from "../_shared/premise";
import { SUBTLE_INTERACTIVE_EXEMPTIONS } from "./subtleInteractiveExemptions";
import { scanSubtleInteractive } from "./subtleInteractiveScan";

const hits = scanSubtleInteractive(process.cwd());
const key = (x: { file: string; line: number }) => `${x.file}:${x.line}`;
const registry = new Map(SUBTLE_INTERACTIVE_EXEMPTIONS.map((r) => [key(r), r]));

describe("subtle-on-interactive policy (DESIGN §1.1/§1.1a, spec §4)", () => {
  it("premise: the scan sees the committed carve-out sites", () => {
    premiseHolds("scan finds >=1 hit", hits.length >= 1);
  });
  it("every hit is a registered carve-out (fail names the site)", () => {
    const unregistered = hits.filter((h) => !registry.has(key(h))).map((h) => `${key(h)} <${h.tag}>`);
    expect(unregistered).toEqual([]);
  });
  it("no stale registry row (every row still a live hit with the token)", () => {
    const live = new Set(hits.map(key));
    expect(SUBTLE_INTERACTIVE_EXEMPTIONS.filter((r) => !live.has(key(r))).map(key)).toEqual([]);
  });
  it("family shapes hold", () => {
    for (const r of SUBTLE_INTERACTIVE_EXEMPTIONS) {
      if (r.family === "summary-disclosure") expect(r.tag).toBe("summary");
      if (r.family === "dismissable-chip") expect(r.file).toContain("ActiveFilterChips");
      if (r.family === "state-dim") {
        expect(r.siblingCue).toBeDefined();
        const cue = r.siblingCue;
        if (!cue) throw new Error(`${key(r)} state-dim row without siblingCue`);
        expect(readFileSync(cue.file, "utf8"), `${key(r)} sibling cue ${cue.token}`).toContain(cue.token);
      }
    }
  });
  it("registry cardinality matches the spec §4.3 tallies", () => {
    expect(SUBTLE_INTERACTIVE_EXEMPTIONS.length).toBe(15);
  });
});
```

- [ ] **Step 4: Run, verify FAIL** — the unregistered-hits assertion lists the 40 SWAP sites.
- [ ] **Step 5: Commit** — `test(styles): subtle-on-interactive structural guard, RED at 40 swap sites`.

### Task 4: The 40 swaps + DESIGN.md policy text (GREEN for Task 3)

**Files:**
- Modify: the 40 SWAP sites of spec §4.3. Shared-const sites are edited AT THE CONST
  (`ghostBtn` in `RoleMappingRow.tsx`, `TAP_TARGET` in `AppHealthIndicator.tsx`, `HELP_LINK` in
  `BellPanel.tsx`, `ACTION_CLASS` in `PersonRow.tsx` — one edit each covers their consumers).
- Modify: `DESIGN.md` §1.1 (subtle row usage note) + new §1.1a (the three families, verbatim
  family definitions from spec §4.1 including the six state-dim cues).

**Interfaces:** consumes Task 3's suite as the oracle; produces nothing new.

<!-- task: red=`pnpm vitest run tests/styles/_metaSubtleOnInteractive.test.ts` ac=AC-4 -->

What is red and why: same command as Task 3 — red observed at Task 3 Step 4; this task's GREEN
criterion is the SAME command passing after the swaps.

- [ ] **Step 1: Apply the swaps.** Per spec §4.3: rest `text-text-subtle` → `text-text`; hover
  column governs each site (`→strong` sites get `hover:text-text-strong`; `same` sites keep
  their hover; `per-site check` sites: keep the existing hover if it still strengthens against
  the new rest color, else step it to `text-text-strong` — record the choice in the commit
  body). `/impeccable` context load precedes this step (Routing note above).
- [ ] **Step 2: Run Task 3's suite, verify PASS.** Also `pnpm exec eslint . --quiet` on touched
  files (canonical class order).
- [ ] **Step 3: Behavioral spot-check** in the running app (`pnpm dev` outside the slot wrapper)
  on 390px + desktop: nav still shows active/inactive distinction (Family D untouched), swapped
  chrome (bell, user menu, theme toggle) reads at full text color, EventFilters selected state
  still inverts.
- [ ] **Step 4: Commit** — `feat(admin): step 40 subtle-on-interactive sites up to text-text (spec §4.3)`.

### Task 5: D3 tap-height guard + census

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

What is red and why: with an EMPTY census array committed first, the suite fails naming every
UNCLASSIFIED element (the spec-§2.4-baseline bucket families all exist on the live tree —
the 2026-08-07 baseline counted 139 uncleared of 340, and the resolver clears only part of
bucket E), so the red derives from live production class strings.

- [ ] **Step 1: Write `scanTapTargets`** — element `state` is `"clear"` when
  `heightFloorSatisfied(el)` and not `defeaterPresent(el)`, else `"unclassified"`.
- [ ] **Step 2: Write the suite** (mirror of Task 3's shape): premise `>= 300` in-scope; every
  `"unclassified"` verdict must have a census row (fail lists `file:line <tag>`); every census
  row must still be a live `"unclassified"` site (stale row fails); at least one known-clear
  site premise (a `SECONDARY_ACTION_CLASS` consumer resolves through rule 6); `under-floor-filed`
  rows must carry `backlogRef: "BL-TAP-TARGET-INLINE-TEXT-CONTROLS"` (spec R8).
- [ ] **Step 3: Run with the census EMPTY, verify FAIL**, and capture the failure list — it IS
  the derived census. Categorize every listed element into the six categories using spec §5.3
  (bucket B/C/F families from the 2026-08-07 §2.6 disposition, bucket D by padding arithmetic
  with the arithmetic in the reason, bucket A residue → `under-floor-filed`, remainder →
  `unresolvable-dynamic` with a one-line reason each). Paste the final category counts into the
  closeout section (§12) — the spec deliberately promises no number (R7).
- [ ] **Step 4: Run, verify PASS** with the seeded census.
- [ ] **Step 5: Commit** — `test(styles): repo-wide tap-height structural guard + census (spec §5)`.

### Task 6: Mutation-registry enrolment

**Files:**
- Modify: `tests/mutation/source/registry.ts` — three `GuardSurface` rows:
  `interactiveScanCore.ts (new)` (suites: all three new meta-suites), `subtleInteractiveScan.ts (new)`
  (suite: `_metaSubtleOnInteractive`), `tapTargetScan.ts (new)` (suite: `_metaTapTargetFloor`);
  operators per the closure declaration above; `scoreFloor` matched to the registry's existing
  convention (read the current rows and use the same floor; do not invent a new one); a
  `control` edit per surface that its suite provably notices (e.g. flip the subtle-token regex).

<!-- task: red=`pnpm mutation:guards` ac=AC-6 -->

What is red and why: enrolment-then-run is the invariant-1 cycle here — before the rows land,
the harness does not cover the new surfaces (absence verified at plan time: `registry.ts` has
no `interactiveScanCore` row); after they land the SAME command computes scores and the task is
green only at zero unaccepted survivors.

- [ ] **Step 1: Add the three rows.** Run `pnpm mutation:guards` (heavy — wrap: `pnpm heavy pnpm
  mutation:guards`).
- [ ] **Step 2: Triage survivors.** Kill genuine gaps by strengthening the suites; a genuinely
  equivalent mutant gets an `accepted` row with its reason. Zero UNACCEPTED survivors before
  the review dispatch (spec R9).
- [ ] **Step 3: Commit** — `test(mutation): enroll interactive-scan guard surfaces`.

### Task 7: Screenshot baselines

**Files:**
- Modify: affected committed WebPs under `public/help/screenshots/` (admin nav chrome appears in
  help captures) and any gallery baselines the diff moves.

<!-- task: red=`git diff --quiet -- public/help/screenshots` ac=AC-9 -->

What is red and why: after Tasks 2/4 the rendered chrome changed, so regenerated baselines
differ — the command exits non-zero exactly when the regen produced changes to commit; it was
run at plan time on the clean tree and exited 0 (no drift before implementation).

- [ ] **Step 1: Pixel-diff BEFORE rebaselining** — regenerate INTO A TEMP DIR from the pinned
  Playwright Docker image with `--platform linux/amd64` (byte-comparison discipline, AGENTS.md);
  diff against committed baselines; confirm ONLY intended surfaces moved (nav chrome, secondary
  buttons, swapped controls). An unexpected moving surface is a defect — stop and diagnose.
- [ ] **Step 2: Rebaseline** from the pinned image; commit the WebPs.
  Wrap capture: `pnpm heavy pnpm screenshot:help` (inside the container per the capture docs).
- [ ] **Step 3: Commit** — `chore(assets): rebaseline screenshots for token policy diff`.

### Task 8: Invariant-8 impeccable dual-gate

<!-- task: red=`grep -qE "^impeccable-gate: critique=(RAN|RAN-DEGRADED) audit=(RAN|RAN-DEGRADED) p0=[0-9]+ p1=[0-9]+ dispositions=(recorded|none)$" docs/superpowers/plans/2026-08-14-ui-interactive-token-policy.md` ac=AC-7 -->

What is red and why: the marker line below §12 does not exist yet (verified: this grep exits 1
on the committed plan); it is written only after both gate halves run on the real diff.

- [ ] **Step 1: Run `/impeccable critique`** with the canonical v3 setup (context.mjs load of
  PRODUCT.md + DESIGN.md, register read) on the affected diff.
- [ ] **Step 2: Run `/impeccable audit`** the same way.
- [ ] **Step 3: Fix P0/P1 findings or defer each via a DEFERRED.md entry** (ledger filing bar
  applies). Record findings + dispositions in §12 below.
- [ ] **Step 4: Write the `impeccable-gate:` marker line in §12** with real values.
- [ ] **Step 5: Commit** — `docs(plan): invariant-8 gate results`.

### Task 9: Close-out — gates, ledger graduation, PR

<!-- task: red=`grep -qE "^## BL-TAP-TARGET-STRUCTURAL-GUARD" BACKLOG-archive.md` ac=AC-8 -->

What is red and why: the entry has not been graduated, so the archive holds no `## `-heading
entry for it (bare-mention greps false-positive on cross-references in other entries' prose,
so the pattern is heading-anchored) — run at plan time, exit 1. It exits 0 once Step 2 moves
the three entries into `BACKLOG-archive.md` as their own entries, and
`tests/docs/_metaLedgerInProgress.test.ts` (Step 3) then holds the rest of the invariant-12
contract (markers gone, archives reject in-flight work).

- [ ] **Step 1: Full local gates under the slot wrapper**: `pnpm heavy pnpm test` ·
  `pnpm typecheck` · `pnpm exec eslint .` · `pnpm format:check`. All green.
- [ ] **Step 2: Graduate the three ledger entries** to `BACKLOG-archive.md` with full provenance
  (census history 32/34/53/55 recorded; Family D ratification noted; the D3 census counts from
  Task 5 pasted). Remove the three `**Status:** IN PROGRESS` markers in the SAME final commit
  (invariant 12 — the marker never reaches main).
- [ ] **Step 3: Run `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts
  tests/docs/_metaReviewRoundEconomy.test.ts tests/docs/_metaInvariant8Closeout.test.ts`** — green.
- [ ] **Step 4: Whole-diff cross-model review** (codex-guard, `--stage diff`), split tight-scope
  briefs if the file list is large; APPROVE required.
- [ ] **Step 5: Push, real CI green, `gh pr merge --merge`, fast-forward local main**
  (`git rev-list --left-right --count main...origin/main` → `0  0`).

<!-- tasks: end -->

## e2e harness note

No new Playwright surface: the guards are Vitest/AST; screenshot capture uses the existing
pinned-container configs. The e2e harness-readiness checklist is therefore N/A — no new server
boot, readiness gate, or sampler is introduced.

## 12. Closeout (filled by the implementing session)

Gate findings + dispositions land here (Task 8), followed by the marker line in the exact
grammar `impeccable-gate: critique=<RAN|RAN-DEGRADED> audit=<RAN|RAN-DEGRADED> p0=<int>
p1=<int> dispositions=<recorded|none>`, plus the Task 5 census category counts.
