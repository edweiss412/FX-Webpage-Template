# Alert Popover Context Copy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author `helpfulContext` popover copy for the 45 admin alert codes that currently show the useless "More about this alert in the help pages." lead-in, and add a fails-by-default meta-test so a new help-linked code without popover copy fails CI.

**Architecture:** Pure catalog-copy + one structural meta-test. No component, DB, migration, advisory-lock, or render-path change. `helpfulContext` is already read by `buildHelpPopoverBody` (`components/admin/compactAlertHelp.tsx`) and already classified `rendered-prose` in the hygiene gate. `helpfulContext` is under the §12.4 catalog-parity contract, so each string lands as a lockstep triple (master-spec appendix + `gen:spec-codes` regen + catalog).

**Tech Stack:** TypeScript (strict: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest (`parallel` no-DB project auto-discovers `tests/messages/**`).

**Spec:** `docs/superpowers/specs/2026-07-20-alert-popover-context-design.md` (APPROVED, Codex R2). Copy source of truth for the 45 strings is spec §3.2 / §3.3.

## Global Constraints

- **§12.4 lockstep (spec §7.5):** every `helpfulContext` value change = master-spec appendix line (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3108-3325`) + `pnpm gen:spec-codes` regen of `lib/messages/__generated__/spec-codes.ts` + `lib/messages/catalog.ts` row, ALL in one commit. AC-X.1 (`tests/cross-cutting/codes.test.ts`) blocks merge otherwise. Never `prettier` the master spec.
- **Copy hygiene:** no em-dash/en-dash, straight apostrophes/quotes, no markdown asterisks, ≤240 chars rendered. Enforced by `tests/messages/_metaCatalogCopyHygiene.test.ts` (`helpfulContext` = `rendered-prose`).
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
- Produces: 45 non-null `helpfulContext` values; a frozen `FROZEN` oracle map future edits must match.

- [ ] **Step 1: Write the failing frozen-oracle copy test.**

<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
`tests/messages/popoverContextCopy.test.ts` — a `FROZEN: Record<string,string>` of all 45 code→string pairs (verbatim from spec §3.2/§3.3), then:

```ts
import { describe, it, expect } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

const FROZEN: Record<string, string> = {
  AMBIGUOUS_EMAIL_BINDING: "Usually a recent typo or paste dropped the same address into two email cells. Once you correct it, the next sync clears this on its own; you can also mark it resolved right away.",
  // ... all 45, verbatim from spec §3.2 (Doug's 20) then §3.3 (developer's 25) ...
};

describe("popover helpfulContext copy (frozen oracle)", () => {
  for (const [code, expected] of Object.entries(FROZEN)) {
    it(`${code} carries the authored popover copy`, () => {
      const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG];
      expect(entry, `${code} missing from catalog`).toBeDefined();
      expect(entry.helpfulContext).toBe(expected);
    });
  }
});
```

- [ ] **Step 2: Run — verify RED.** `pnpm vitest run tests/messages/popoverContextCopy.test.ts` → 45 failures (`helpfulContext` is null).

- [ ] **Step 3: Set catalog `helpfulContext` for the 45.** Block-scoped: within each code's object, replace the single `helpfulContext: null,` with `helpfulContext:\n      "<string>",`. A block-scoped transform (parse the catalog into per-code objects, replace exactly one in-block `helpfulContext: null,` per code, abort unless exactly 45 unique matches) is safer than a global sed; each of the 45 has been verified to carry exactly one replaceable in-block occurrence.

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

### Task 2: Fails-by-default reachability gate + exemption ledger

**Files:**
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Create: `tests/messages/popoverContextExemptions.ts`
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Create: `tests/messages/_metaPopoverContextCoverage.test.ts`

**Interfaces:**
- Consumes: `MESSAGE_CATALOG`, `MessageCatalogEntry` (`@/lib/messages/catalog`); `HELP_ONLY_LEARN_MORE_LEAD_IN` (`@/components/admin/compactAlertHelp`); `renderEmphasis` (`@/components/messages/renderEmphasis`); `POPOVER_CONTEXT_EXEMPT` (`./popoverContextExemptions`).
- Produces: the coverage gate (4 rules, spec §4); an empty `POPOVER_CONTEXT_EXEMPT` ledger.

<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- [ ] **Step 1: Create the empty ledger.** `tests/messages/popoverContextExemptions.ts`:

```ts
export const POPOVER_CONTEXT_EXEMPT: ReadonlyArray<{ code: string; reason: string }> = [];
```

- [ ] **Step 2: Write the gate meta-test** implementing spec §4 rules 1-4. Imports `MESSAGE_CATALOG` + `MessageCatalogEntry` (`@/lib/messages/catalog`), `HELP_ONLY_LEARN_MORE_LEAD_IN` (`@/components/admin/compactAlertHelp`), `renderEmphasis` (`@/components/messages/renderEmphasis`), `POPOVER_CONTEXT_EXEMPT` (`./popoverContextExemptions`). A `renderedText(node)` helper flattens `renderEmphasis` output (marker-free copy => `[string]`) to text.

```ts
const popoverReachable = entries.filter(([, e]) => e.helpHref !== null);
// rule 1 completeness: helpHref != null ⟹ helpfulContext != null OR exempt
// rule 2 validity: renderedText(renderEmphasis(ctx)).trim() is non-empty AND !== HELP_ONLY_LEARN_MORE_LEAD_IN  (skip exempt)
// rule 3 mutual exclusion: for each exempt code, entry.helpfulContext === null
// rule 4 ledger closed: each exempt code exists, helpHref != null, reason.trim().length > 15, no duplicate codes
```

Full assertions per spec §4; each `describe` walks the LIVE catalog so a new code fails by default. Mirrors `tests/messages/_metaShowScopedTemplates.test.ts` structure.

- [ ] **Step 3: Run — verify GREEN.** `pnpm vitest run tests/messages/_metaPopoverContextCoverage.test.ts` → PASS (catalog complete from Task 1; ledger empty).

- [ ] **Step 4: Prove fails-by-default (do NOT commit the breakage).**
  1. Temporarily set one code's catalog `helpfulContext` back to `null` → run → completeness FAILS naming that code. Revert.
  2. Temporarily set one code's `helpfulContext` to `"   "` (whitespace) → validity FAILS (renders empty). Revert.
  3. Temporarily set one code's `helpfulContext` to `HELP_ONLY_LEARN_MORE_LEAD_IN`'s text → validity FAILS (equals lead-in). Revert.
  4. Temporarily add `{ code: <an authored code>, reason: "x" }` to the ledger → mutual-exclusion FAILS. Revert.
  5. Temporarily add `{ code: "NOT_A_CODE", reason: "x" }` → ledger-closed FAILS. Revert.
  Confirm all reverted (`git diff` clean except the two new files).

- [ ] **Step 5: Commit.**

```bash
git add tests/messages/popoverContextExemptions.ts tests/messages/_metaPopoverContextCoverage.test.ts
git commit --no-verify -m "test(messages): fails-by-default popover-context coverage gate + empty exemption ledger"
```

---

### Task 3: Pre-push verification gate

**Files:** none (verification only).

- [ ] **Step 1: Typecheck.** `pnpm typecheck` → clean (vitest strips types; a green test run is not a typecheck).
- [ ] **Step 2: Lint.** `pnpm lint` (or `pnpm eslint`) → clean (canonical Tailwind / import rules).
- [ ] **Step 3: Format check.** `pnpm format:check` → clean (`--no-verify` bypasses prettier; the master-spec appendix and new test files must be formatted, EXCEPT never reformat the master spec beyond the appendix lines — if `format:check` flags the master spec, hand-fix only the added lines).
- [ ] **Step 4: Full parallel (no-DB) suite.** `pnpm vitest run --project=parallel` → green (scoped runs miss registry suites; the full parallel project covers `tests/messages/**`, `tests/styles`, `tests/help`, etc.).
- [ ] **Step 5: x1 parity + extractor, one more time.** `pnpm test:audit:x1-catalog-parity` (runs `gen:spec-codes` then the parity + extractor tests) → green, confirming the committed generated file matches the appendix.
- [ ] **Step 6:** If any gate fails, fix and re-run before push. No commit needed for a clean pass.
