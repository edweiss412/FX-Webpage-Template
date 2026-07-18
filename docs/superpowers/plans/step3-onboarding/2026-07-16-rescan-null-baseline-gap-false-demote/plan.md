# Plan — Re-scan: a null gap baseline must not count as a regression

**Spec:** `docs/superpowers/specs/2026-07-16-rescan-null-baseline-gap-false-demote.md`
**Date:** 2026-07-16
**Owner harness:** Opus / Claude Code (logic-only)

---

## Scope recap

Single logic fix in `lib/onboarding/rescanDecision.ts`: gate `gapRegressed` on a present gap baseline (`priorGaps != null`) so a null-baseline re-scan (first-seen row, or a pending row consumed by finalize) does not falsely demote a sheet carrying a standing non-ambiguity gap warning. One caller only (`lib/onboarding/applyRescanDecisionUnderLock.ts:272`).

## Meta-test inventory

- **CREATES:** none.
- **EXTENDS:** `tests/onboarding/rescanDecision.test.ts` (new failing case → pins the fix).
- No structural/registry meta-test applies (no auth boundary, admin_alert code, advisory-lock surface, tile sentinel, inline-email path). Declared per the writing-plans meta-test-inventory rule.
- **Advisory-lock holder topology:** N/A — touches no `pg_advisory*` code.

## Pre-draft code verification (done)

- `lib/onboarding/rescanDecision.ts:46-47` — `gapRegressed` uses `newGaps[cls] > (priorGaps?.[cls] ?? 0)`; `newGaps` line 41, `priorGaps = priorDataGaps?.classes` line 42, `dirty` return line 50. ✓
- `lib/parser/dataGaps.ts:91` — `zeroClasses()` returns an all-keys-zeroed record; `summarizeDataGaps` (`:232`) seeds from it (`:235`) and returns it on both `:236`/`:246`, so a non-null return always has every `GapCode` key. ✓
- `lib/parser/dataGaps.ts:57` — `PULL_SHEET_ON_ARCHIVED_TAB` is a `GAP_CLASSES` code. ✓
- `lib/parser/ambiguityCodes.ts:19-24` — not an ambiguity code, so it drives the non-ambiguity gap gate. ✓
- `lib/onboarding/applyRescanDecisionUnderLock.ts:115,143,152` — `priorDataGaps` null iff `priorParse` null (four shapes A–D per spec §1); the corrupt-prior force-dirty is a SEPARATE clause at `:286-289` (the `priorReady && priorParse === null` line is `:288`). ✓
- Sole caller: `applyRescanDecisionUnderLock.ts:272`; none in `components/`. ✓

## Tasks

### Task 1 — TDD: null gap baseline is not a regression

**Failure mode caught:** a sheet with a permanent non-ambiguity gap warning (e.g. `PULL_SHEET_ON_ARCHIVED_TAB`) is re-scanned with NO prior baseline (`priorParse`/`priorDataGaps` null — first-seen, or pending row consumed by finalize). Today `gapRegressed` counts the standing gap as a regression-from-zero → `dirty=true` → false "Sheet changed" demote. The test asserts `dirty=false` for that input. Anti-tautology: the expected value is derived from the semantics (no baseline ⇒ not comparable), the input carries a real non-ambiguity `GAP_CLASSES` code, and a sibling assertion pins that the SAME standing gap WITH a matching non-null baseline is also clean (proving the fix is baseline-gating, not gap-suppression).

1. **RED** — add to `tests/onboarding/rescanDecision.test.ts`:
   - `priorParse === null` + refreshed carrying one `PULL_SHEET_ON_ARCHIVED_TAB` warning, `priorDataGaps = null` → expect `dirty === false`, `decisionItems === []`. (Fails today: currently `dirty === true`.)
   - Sibling control: same standing warning WITH a non-null baseline that also counts it once (`mkDataGaps({ PULL_SHEET_ON_ARCHIVED_TAB: 1 })`) → `dirty === false` (already passes; guards against over-correcting into gap-suppression).
   - Run the file; confirm the RED case fails for the stated reason.

2. **GREEN** — edit `lib/onboarding/rescanDecision.ts`:
   ```ts
   const priorGaps = priorDataGaps?.classes;
   const gapRegressed =
     priorGaps != null &&
     (Object.keys(newGaps) as Array<keyof typeof newGaps>).some(
       (cls) => !isAmbiguityCode(cls) && newGaps[cls] > priorGaps[cls],
     );
   ```
   Removes the dead `?? 0` (once `priorGaps != null`, every key is a number). Update the adjacent comment to state the null-baseline-not-comparable rationale and cite the caller's separate corrupt-shadow clause.

3. **VERIFY** — run `tests/onboarding/rescanDecision.test.ts` (all green, including the pre-existing 0→1 / newly-counted-code / ambiguity-exclusion / decrease cases), then the full `tests/onboarding/` dir (`applyRescanDecisionUnderLock.test.ts`, `_metaRescanDecisionInvariants.test.ts`, `rescanWizardSheet.db.test.ts`, `finalizeInlineRescan.db.test.ts`) to confirm no regression. Then `pnpm typecheck` + `pnpm lint` + `pnpm format:check` on the diff.

4. **COMMIT** — `fix(onboarding): a null gap baseline is not a rescan regression (no false "Sheet changed")`.

## Fix-round regression budget

After the GREEN edit: re-grep `computeRescanDecision` callers (confirm still single) and re-run the full `tests/onboarding/` suite + the broader `pnpm test` before push. Note results in the close-out.

## Verification commands

- `pnpm vitest run tests/onboarding/rescanDecision.test.ts`
- `pnpm vitest run tests/onboarding`
- `pnpm typecheck && pnpm lint && pnpm format:check`
- `pnpm test` (full suite before push)

## Out of scope

Per spec §8: the "Resolve before publishing" sentinel copy improvement (UI-gated) is a separate follow-up.
