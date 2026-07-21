# Alert Popover Context Copy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author `helpfulContext` popover copy for the 45 admin alert codes that currently show the useless "More about this alert in the help pages." lead-in, and add a fails-by-default coverage gate so a new help-linked code without popover copy fails CI.

**Architecture:** Pure catalog-copy + one structural coverage gate built as a pure function (`checkPopoverContextCoverage`) proven by synthetic-input unit tests and applied to the live catalog. No component, DB, migration, advisory-lock, or render-path change. `helpfulContext` is already read by `buildHelpPopoverBody` (`components/admin/compactAlertHelp.tsx`) and already classified `rendered-prose` in the hygiene gate. `helpfulContext` is under the §12.4 catalog-parity contract, so each string lands as a lockstep triple (master-spec appendix + `gen:spec-codes` regen + catalog).

**Tech Stack:** TypeScript (strict: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest (`parallel` no-DB project auto-discovers `tests/messages/**`).

**Spec:** `docs/superpowers/specs/2026-07-20-alert-popover-context-design.md` (APPROVED, Codex R2). Copy source of truth for the 45 strings is spec §3.2 / §3.3.

## Global Constraints

- **§12.4 lockstep (spec §7.5):** every `helpfulContext` value change = master-spec appendix line (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3108-3325`) + `pnpm gen:spec-codes` regen of `lib/messages/__generated__/spec-codes.ts` + `lib/messages/catalog.ts` row, ALL in one commit. AC-X.1 (`tests/cross-cutting/codes.test.ts`) blocks merge otherwise. Never `prettier` the master spec.
- **Copy hygiene:** no em-dash/en-dash, straight apostrophes/quotes, no markdown asterisks, ≤240 chars. Enforced by `tests/messages/_metaCatalogCopyHygiene.test.ts` (`helpfulContext` = `rendered-prose`).
- **Frozen-oracle discipline:** the catalog IS the subject under test, so expected strings are hardcoded in the copy test (inverting derive-never-hardcode), matching `_metaShowScopedTemplates` `PAIRED`.
- **`longExplanation` untouched.** Only `helpfulContext` changes.
- **Worktree-only, commit per task, `--no-verify` (autonomous run).**

The 45 strings verbatim: spec §3.2 (Doug's 20) + §3.3 (developer's 25). Do not paraphrase; copy exactly.

---

### Task 1: Author the 45 `helpfulContext` strings (copy + §12.4 lockstep)

**Files:**
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Create: `tests/messages/popoverContextCopy.test.ts`
- Modify: `lib/messages/catalog.ts` (45 `helpfulContext: null` → authored string, block-scoped)
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (45 appendix lines, YAML fence 3108-3325)
- Modify (generated): `lib/messages/__generated__/spec-codes.ts` (via `pnpm gen:spec-codes`)

**Interfaces:**
- Consumes: `MESSAGE_CATALOG` (`lib/messages/catalog.ts`), the 45 strings from spec §3.2/§3.3.
- Produces: 45 non-null `helpfulContext` values; a frozen `FROZEN` oracle of exactly 45 code→string pairs.

- [ ] **Step 1: Write the failing frozen-oracle copy test (with 45-closure).**

<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
`tests/messages/popoverContextCopy.test.ts` — a `FROZEN: Record<string,string>` of all 45 pairs (verbatim from spec §3.2/§3.3), a count-closure assertion, then a per-code check:

```ts
import { describe, it, expect } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

const FROZEN: Record<string, string> = {
  AMBIGUOUS_EMAIL_BINDING: "Usually a recent typo or paste dropped the same address into two email cells. Once you correct it, the next sync clears this on its own; you can also mark it resolved right away.",
  // ... all 45, verbatim from spec §3.2 (Doug's 20) then §3.3 (developer's 25) ...
};

describe("popover helpfulContext copy (frozen oracle)", () => {
  it("the oracle is closed over exactly the 45 authored codes", () => {
    // F5: pin the count so dropping a code fails here rather than leaving its copy unchecked.
    expect(Object.keys(FROZEN).length).toBe(45);
  });
  for (const [code, expected] of Object.entries(FROZEN)) {
    it(`${code} carries the authored popover copy`, () => {
      const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG];
      expect(entry, `${code} missing from catalog`).toBeDefined();
      expect(entry.helpfulContext).toBe(expected);
    });
  }
});
```

- [ ] **Step 2: Run — verify RED.** `pnpm vitest run tests/messages/popoverContextCopy.test.ts` → 45 failures (`helpfulContext` is null; the count assertion passes).

- [ ] **Step 3: Set catalog `helpfulContext` for the 45.** Block-scoped: within each code's object, replace the single `helpfulContext: null,` with `helpfulContext:\n      "<string>",`. Use a block-scoped transform (parse the catalog into per-code objects, replace exactly one in-block `helpfulContext: null,` per code, abort unless exactly 45 unique matches) — each of the 45 has been verified to carry exactly one replaceable in-block occurrence. A global sed is unsafe.

- [ ] **Step 4: Add the 45 appendix lines to the master spec.** Insert `CODE: "<string>"` for each of the 45 into the YAML fence at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (before the closing ``` at line 3325), byte-identical to the catalog strings. Do not reformat anything else in that file.

- [ ] **Step 5: Regenerate spec-codes.** `pnpm gen:spec-codes` → updates `lib/messages/__generated__/spec-codes.ts`.

- [ ] **Step 6: Run copy + parity + hygiene — verify GREEN.**

```
pnpm vitest run tests/messages/popoverContextCopy.test.ts \
  tests/cross-cutting/codes.test.ts \
  tests/cross-cutting/extract-spec-codes.test.ts \
  tests/messages/_metaCatalogCopyHygiene.test.ts
```
Expected: PASS (copy matches; catalog↔§12.4 parity holds; hygiene clean).

- [ ] **Step 7: Commit (lockstep triple + copy test, one commit).**

```bash
git add tests/messages/popoverContextCopy.test.ts lib/messages/catalog.ts \
  docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/__generated__/spec-codes.ts
git commit --no-verify -m "feat(messages): author helpfulContext popover copy for 45 alert codes"
```

---

### Task 2: Coverage gate (pure checker + synthetic proofs + live assertion)

TDD-natural: the tests import `checkPopoverContextCoverage` before it exists, so they are RED until the checker is implemented. No manual break/revert of the live catalog — every rule is proven on synthetic fixtures.

**Files:**
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Create: `tests/messages/popoverContextExemptions.ts` (`POPOVER_CONTEXT_EXEMPT = []`)
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Create: `tests/messages/popoverContextCoverage.ts` (pure `checkPopoverContextCoverage`)
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Create: `tests/messages/_metaPopoverContextCoverage.test.ts` (live assertion + synthetic proofs)

**Interfaces:**
- Consumes: `MESSAGE_CATALOG`, `MessageCatalogEntry` (`@/lib/messages/catalog`); `HELP_ONLY_LEARN_MORE_LEAD_IN` (`@/components/admin/compactAlertHelp`); `renderEmphasis` (`@/components/messages/renderEmphasis`).
- Produces: `checkPopoverContextCoverage(entries: readonly CoverageEntry[], exempt: readonly ExemptRow[]): Violation[]` where `CoverageEntry = { code; helpHref: string|null; helpfulContext: string|null }`, `ExemptRow = { code; reason }`, `Violation = { rule: 1|2|3|4; code; detail }`; and an empty `POPOVER_CONTEXT_EXEMPT` ledger.

- [ ] **Step 1: Create the empty ledger.**

<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
`tests/messages/popoverContextExemptions.ts`:

```ts
export const POPOVER_CONTEXT_EXEMPT: ReadonlyArray<{ code: string; reason: string }> = [];
```

<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- [ ] **Step 2: Write the meta-test + synthetic proofs FIRST (RED — checker absent).** `tests/messages/_metaPopoverContextCoverage.test.ts` imports `checkPopoverContextCoverage` from `./popoverContextCoverage` (not yet created). It contains:
  - **Live assertion:** map `MESSAGE_CATALOG` to `CoverageEntry[]` (`code`, `helpHref`, `helpfulContext`), then `expect(checkPopoverContextCoverage(liveEntries, POPOVER_CONTEXT_EXEMPT)).toEqual([])`.
  - **Synthetic proofs**, each a hand-built fixture asserting the exact violation (or none): rule 1 gap (helpHref + null + not exempt → `{rule:1}`); rule 1 valid exemption (null + well-formed row → `[]`); helpHref null + null → `[]`; rule 2 whitespace-only → `{rule:2}`; rule 2 exact lead-in → `{rule:2}`; rule 2 whitespace-PADDED lead-in → `{rule:2}` (normalization load-bearing); rule 3 exempt+authored → `{rule:3}`; rule 4 unknown code → `{rule:4}`; rule 4 helpHref-null exempt → `{rule:4}`; rule 4 empty reason → `{rule:4}`; rule 4 duplicate rows → contains `duplicate exemption row`; valid catalog + empty ledger → `[]`.

- [ ] **Step 3: Run — verify RED.** `pnpm vitest run tests/messages/_metaPopoverContextCoverage.test.ts` → fails to resolve `./popoverContextCoverage` (module/function absent).

- [ ] **Step 4: Implement the pure checker.**

<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
`tests/messages/popoverContextCoverage.ts` — export `checkPopoverContextCoverage` implementing the four §4 rules:
  - **Rule 4 (ledger):** for each exempt row — flag duplicates; flag if code not in catalog; flag if `helpHref === null` (vacuous); flag if `reason.trim().length === 0`.
  - **Rule 3 (exclusivity):** for each exempt row whose catalog entry has `helpfulContext !== null` → violation.
  - **Rules 1 & 2 (reachable entries, `helpHref !== null`):** `helpfulContext === null` and not exempt → rule 1; `helpfulContext !== null` and not exempt → normalize `renderedText(renderEmphasis(ctx.trim())).trim()`, flag empty (rule 2) or `=== HELP_ONLY_LEARN_MORE_LEAD_IN` (rule 2). Exempt reachable entries skip rule 2 (rule 3 owns them).

  `renderedText(node)` recursively flattens `ReactNode` (string/number/array/element-children) to text; marker-free copy renders to `[string]`.

- [ ] **Step 5: Run — verify GREEN.** `pnpm vitest run tests/messages/_metaPopoverContextCoverage.test.ts` → PASS (live zero-violations because Task 1 completed the catalog; all synthetic proofs pass).

- [ ] **Step 6: Typecheck the new module + tests.** `pnpm typecheck` → clean (strict tsconfig; `Violation.rule` is the `1|2|3|4` union, `expect.any(String)` on `detail`).

- [ ] **Step 7: Commit.**

```bash
git add tests/messages/popoverContextExemptions.ts tests/messages/popoverContextCoverage.ts \
  tests/messages/_metaPopoverContextCoverage.test.ts
git commit --no-verify -m "test(messages): fails-by-default popover-context coverage gate + synthetic proofs"
```

---

### Task 3: Pre-push verification gate

**Files:** none (verification only). If any step needs a fix, apply it, re-run, and COMMIT the fix before proceeding (F7).

- [ ] **Step 1: Typecheck.** `pnpm typecheck` → clean (vitest strips types; a green test run is not a typecheck).
- [ ] **Step 2: Lint.** `pnpm lint` → clean.
- [ ] **Step 3: Format check.** `pnpm format:check` → clean. `--no-verify` bypasses prettier, so the new test files must be formatted. If `format:check` flags the master spec, hand-fix ONLY the added appendix lines — never reformat the rest of that file; if prettier insists on reformatting untouched master-spec content, leave it unformatted and note the deliberate exception.
- [ ] **Step 4: Full parallel (no-DB) suite.** `pnpm vitest run --project=parallel` → green (scoped runs miss registry suites; the full parallel project covers `tests/messages/**`, `tests/styles`, `tests/help`).
- [ ] **Step 5: x1 parity + extractor, and prove the committed generated file is NOT stale (F6).**

```bash
pnpm gen:spec-codes
git diff --exit-code lib/messages/__generated__/spec-codes.ts   # MUST be clean: committed generated file already matches the appendix
pnpm vitest run tests/cross-cutting/codes.test.ts tests/cross-cutting/extract-spec-codes.test.ts
```
If `git diff --exit-code` is non-zero, the Task 1 commit shipped a stale generated file — commit the regenerated `spec-codes.ts` before push.

- [ ] **Step 6: Clean-tree gate before push (F7).** `git status --porcelain` shows no uncommitted tracked changes (the skip-worktree `.claude/ship-state.json` is excluded by construction). Any verification fix from Steps 1-5 is committed. Only then push.
