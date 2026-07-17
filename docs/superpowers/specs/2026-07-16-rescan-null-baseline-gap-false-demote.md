# Spec — Re-scan: a null gap baseline must not count as a regression

**Date:** 2026-07-16
**Slug:** `rescan-null-baseline-gap-false-demote`
**Status:** Draft → self-review → adversarial (Codex) → APPROVE
**Owner harness:** Opus / Claude Code (logic-only; NO UI surface — see §7)

---

## 1. Problem

Per-sheet Re-scan demotes a sheet to `RESCAN_REVIEW_REQUIRED` (rendered by the Step-3 modal as the **"Sheet changed"** chip, `components/admin/wizard/Step3SheetCard.tsx:228`) even when the sheet's content is unchanged.

Root cause — `lib/onboarding/rescanDecision.ts:45-47`:

```ts
const gapRegressed = (Object.keys(newGaps) as Array<keyof typeof newGaps>).some(
  (cls) => !isAmbiguityCode(cls) && newGaps[cls] > (priorGaps?.[cls] ?? 0),
);
```

`priorGaps` is `priorDataGaps?.classes` (`rescanDecision.ts:41`). When the prior baseline is **null** (`priorDataGaps === null`), `priorGaps?.[cls] ?? 0` treats every class as `0`, so **any standing non-ambiguity data-gap warning** in the refreshed parse is counted as a regression-from-zero → `gapRegressed = true` → `dirty = true` (`rescanDecision.ts:50`). The caller (`lib/onboarding/applyRescanDecisionUnderLock.ts:286-303`) then demotes the row.

`priorDataGaps` is `null` in exactly two `capturePriorState` outcomes:

| Source | `priorReady` | `priorParse` | `priorDataGaps` | citation |
|---|---|---|---|---|
| Corrupt Flow-B shadow | `true` | `null` | `null` | `applyRescanDecisionUnderLock.ts:139-145` |
| No prior at all (first-seen OR pending row consumed by finalize) | `false` | `null` | `null` | `applyRescanDecisionUnderLock.ts:148-154` |

**Proven reproduction (read-only, validation project `vzakgrxqwcalbmagufjh`, show "RFI & PC Chicago", `drive_file_id 1HHw7vqCpnuxeDQDU5Gyxl70kyYV5-q6OFhcH_slXTcg`):** the sheet carries a permanent `PULL_SHEET_ON_ARCHIVED_TAB` warning (its `OLD PULL SHEET` tab — a fixed property of the sheet, `lib/parser/dataGaps.ts:57`, non-ambiguity per `lib/parser/ambiguityCodes.ts:19-24`). Running the exact decision inputs:

```
computeRescanDecision(priorParse=<stored>, refreshed=<live>, priorGaps=<stored>)  -> dirty: false
computeRescanDecision(priorParse=null,      refreshed=<live>, priorGaps=null)      -> dirty: true   ← false demote
```

Telemetry sequence confirming the null-baseline path fires in production: scan `04:30:42` → approve `04:31:05` → `SHOW_FINALIZED` (final_cas) `04:31:52` (finalize consumes the pending row) → re-scan `04:32:24` = the demote, which re-stages the now-unapproved `RESCAN_REVIEW_REQUIRED` row observed live.

## 2. Goal

A **null gap baseline is not comparable** — a standing warning on a row with no prior baseline is a property of the sheet, not a regression. Gate `gapRegressed` on a present baseline so a no-prior / consumed-baseline re-scan of an otherwise-unchanged sheet does NOT demote.

## 3. Non-goals

- No change to crew-change detection (`MI-11..14`, `DECISION_REQUIRING_INVARIANTS` — `rescanDecision.ts:16-18`). Those fire off `runInvariants`, independent of the gap gate.
- No change to real gap-count regressions when a baseline IS present (0→1, 1→2, newly-counted code, ambiguity exclusion — all pinned by existing tests, `tests/onboarding/rescanDecision.test.ts:119-203`).
- No change to the corrupt-shadow demotion: `applyRescanDecisionUnderLock.ts:287-289` already force-dirties `priorReady && priorParse === null` via a **separate** clause, so gating the gap gate does not weaken it.
- No UI change. The "Sheet changed" chip and the "Resolve before publishing" copy are untouched (the copy shortfall is tracked separately — see §8).
- No DB, migration, advisory-lock, RPC, email-boundary, or telemetry-code change.

## 4. Design

`lib/onboarding/rescanDecision.ts` — gate the gap comparison on a present baseline:

```ts
const priorGaps = priorDataGaps?.classes;
// A null gap baseline is NOT comparable: with no prior parse (first-seen row, or a
// pending row consumed by finalize) a STANDING warning is a property of the sheet,
// not a regression. Only a present baseline can surface a gap regression. The
// corrupt-shadow "previously-ready but unreadable prior" case is force-dirtied by the
// caller's SEPARATE priorReady && priorParse===null clause
// (applyRescanDecisionUnderLock.ts:287-289), so this gate does not weaken it.
const gapRegressed =
  priorGaps != null &&
  (Object.keys(newGaps) as Array<keyof typeof newGaps>).some(
    (cls) => !isAmbiguityCode(cls) && newGaps[cls] > priorGaps[cls],
  );
```

`summarizeDataGaps` always returns an all-keys-zeroed `classes` record (`lib/parser/dataGaps.ts:92`), so once `priorGaps != null`, `priorGaps[cls]` is always a number — the `?? 0` becomes dead and is removed. A genuine all-zero baseline (prior had no gaps) still correctly catches a 0→1 regression because that baseline is a non-null record.

### Guard conditions (every input)

| `priorParse` | `priorDataGaps` | refreshed warnings | `gapRegressed` (after fix) | who owns dirty |
|---|---|---|---|---|
| null | null | standing non-ambiguity gap (≥1) | **false** (was true — the bug) | clean path / caller's priorReady clause |
| null | null | none | false | unchanged |
| non-null | non-null all-zero | 0→1 non-ambiguity | true | this gate (unchanged) |
| non-null | non-null | same count both sides | false | unchanged |
| non-null | non-null | count decrease | false | unchanged |
| non-null | non-null | ambiguity-only increase | false | unchanged (`isAmbiguityCode`) |
| any | any | (crew email/rename change) | n/a | `decisionItems` (MI-11..14), unaffected |

`newGaps` is never null (`summarizeDataGaps(refreshedParse.warnings ?? [])`, `rescanDecision.ts:40` — empty array on null warnings). `refreshedParse` is always non-null (function contract: `ParseResult`, not `| null`).

## 5. Self-consistency / numeric sweep

- Only one literal touched: the removed `?? 0` fallback. No other numbers in the file.
- Caller call site `applyRescanDecisionUnderLock.ts:272-276` passes `(prior.priorParse, refreshedParse, prior.priorDataGaps)` — signature unchanged; no caller edit needed.

## 6. Meta-test inventory

- **CREATES:** none.
- **EXTENDS:** `tests/onboarding/rescanDecision.test.ts` — add the null-baseline-standing-gap case (the failing test that pins the fix). No structural/registry meta-test applies (no auth boundary, no admin_alert code, no advisory-lock surface, no tile sentinel, no inline-email path). Declared explicitly per the writing-plans meta-test-inventory rule.
- Advisory-lock topology: **N/A** — this change touches no `pg_advisory*` code.

## 7. Surface classification

Files touched: `lib/onboarding/rescanDecision.ts` (logic) + `tests/onboarding/rescanDecision.test.ts` (test) + this spec + the plan. **No** file under `app/` (except none), `components/`, `app/globals.css`, `tailwind.config.*`, or `DESIGN.md`. Invariant-8 impeccable dual-gate is therefore **not triggered**. UI-always-Opus rule not engaged beyond the doc being authored by Opus.

## 8. Out of scope (tracked separately)

When a demote IS legitimate, the "Resolve before publishing" box renders only the generic `ONBOARDING_SCAN_REVIEW` sentinel copy ("Onboarding scan staged this sheet for review." — `lib/admin/step3ReviewItemTiers.ts:57-58`) and does not surface the actual actionable `PULL_SHEET_ON_ARCHIVED_TAB` warning + its accept/revoke override. That is a copy/UX improvement, UI-gated (invariant 8), and is filed for a follow-up — NOT part of this logic fix.
