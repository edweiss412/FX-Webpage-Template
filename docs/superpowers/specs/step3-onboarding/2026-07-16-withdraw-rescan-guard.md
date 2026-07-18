# Spec — Withdraw the G3 re-scan two-tap guard

**Date:** 2026-07-16
**Slug:** withdraw-rescan-guard
**Status:** Ratified amendment to `docs/superpowers/specs/2026-07-16-destructive-confirm-pass.md` (PR #408).
**Type:** UI confirm-affordance removal. No DB, no routes, no advisory locks.

---

## 1. Problem

PR #408 shipped four two-tap destructive-confirm guards on previously-unguarded one-tap admin actions. One of them — **G3, "Re-scan this sheet"** (`components/admin/RescanSheetButton.tsx`) — does not belong on the guard ladder. This spec withdraws it, reverting the control to a pure one-tap that matches its sibling **Re-sync** (`components/admin/ReSyncButton.tsx:135-150`), which is un-guarded.

### 1.1 Why G3 is unjustified (the ratified rationale)

The #408 guard-tier ladder (DESIGN.md §15, tier 2) is for **irreversible or work-destroying** ops. Re-scan is neither, because the apply path is already content-aware:

- `computeRescanDecision` (`lib/onboarding/rescanDecision.ts:30-64`) diffs the prior parse against the refreshed parse. It marks the re-scan **DIRTY only** when the refresh surfaces a decision-requiring crew change (`DECISION_REQUIRING_INVARIANTS` = `MI-11`..`MI-14`, line 17) **or** a non-ambiguity data-gap count increase against a **present** baseline (`gapRegressed`, lines 58-62). A NULL gap baseline (first-seen / consumed-parse row) is explicitly not comparable and never marks dirty (PR #410, lines 43-51) — so even fewer clean re-scans demote than before. Ambiguity-class gap increases never mark it dirty (lines 53-55).
- `applyRescanDecisionUnderLock` (`lib/onboarding/applyRescanDecisionUnderLock.ts`) has three non-failure outcomes (union at lines 46-53), selected by the `isDirty` gate at lines 286-289:
  - `clean_restamped` — previously-ready + clean → **approval re-stamped** (lines 306-336). Nothing lost. (Reviewer choices are regenerated one-apply-per-item because the re-parse mints fresh item ids, lines 310-312 — a mechanical refresh, not a decision loss.)
  - `clean_unchecked` — was not ready → stays unapproved (lines 339-350).
  - `dirty_demoted` — demotes `wizard_approved` (lines 291-303).
- **The `isDirty` gate (lines 286-289) is broader than the content diff** — it demotes a previously-ready sheet when `computeRescanDecision` says dirty **OR** in two corrupt/legacy-data safety clauses even on a clean diff: (i) `priorReady && priorParse === null` — a corrupt/unreadable prior shadow that cannot be verified clean (line 288); (ii) `priorReady && priorApprovedByEmail === null` — a Flow-B/legacy row with an unattributable approver that cannot be re-stamped without violating `pending_syncs_approved_requires_full_payload` (line 289, would 500 otherwise). These are not content-driven demotions; they are data-integrity fallbacks.

So for the normal case — a re-scan with no change, or an unrelated change, on a healthy previously-approved row — the apply path **preserves** the ratified decision (`clean_restamped`). It demotes only when (a) the sheet genuinely changed in a decision-requiring way (re-review is wanted), or (b) the prior state is corrupt/unattributable (a safety fallback that must happen regardless). **Crucially for this withdrawal:** the two-tap guard never prevented ANY of these demotions — the confirm fires *into* the same apply path, so demotion behavior is identical whether the control is one-tap or two-tap. The guard added a tap; it never added protection. That is the core reason it is unjustified, and it holds even accounting for the two forced-demote clauses.

Meanwhile **Re-sync**, whose blast radius is strictly larger (it can stage/apply against a LIVE published show — `components/admin/ReSyncButton.tsx`), carries no confirm at all. The friction asymmetry has no blast-radius basis. Doug/admin intent when tapping Re-scan is unambiguous ("refresh this sheet from Drive"); the guard taxes that intent with no protective payoff.

### 1.2 The label is also factually wrong

The armed confirm label reads **"Confirm re-scan: replaces this staged review"** (`RescanSheetButton.tsx:213`). For the common (clean) case this is false — a clean re-scan re-stamps approval and replaces nothing. Withdrawing the guard deletes the label; no replacement copy is needed (the existing result-line copy at `RescanSheetButton.tsx:88-112` explains every outcome accurately, post-hoc).

---

## 2. Scope

### 2.1 Component — `components/admin/RescanSheetButton.tsx`

Withdraw the entire G3 armed morph. Remove:

- `ARM_REVERT_MS` constant (line 86).
- `armed` state + `armTimerRef` + `clearArmTimer` + the `useEffect(() => clearArmTimer, [])` + `onGuardedClick` (lines 125-150).
- The armed `className` branch — the inverted-amber destructive-recipe literal (`bg-warning-text text-warning-bg …`, line 207-210). Only the resting (idle) className string survives.
- The armed label branch `"Confirm re-scan: replaces this staged review"` (line 212-213). Label collapses to `pending ? "Re-scanning…" : "Re-scan this sheet"`.
- The persistent sr-only `role="status"` "Tap again to confirm." live region (lines 218-223) — it exists only to announce the armed morph.

Change:

- `onClick={onGuardedClick}` → `onClick={() => void handleClick()}` (line 203).

**Untouched:** `handleClick` (the fetch + result + `router.refresh`), `RescanResponse`/`resultFor`/`PLAIN_COPY`/`lookupDougFacing`, the result overlay + dismiss button, `triggerRef` (still the dismiss-button focus-return target, line 247), both `placement` variants, all props.

### 2.2 Tests — `tests/components/admin/RescanSheetButton.test.tsx`

- **Delete** the entire `describe("G3 two-tap guard — Re-scan this sheet")` block (~line 494 to its close), including its member tests: armed-morph className, overlay-placement armed morph, second-click-fires-once + timer clear, second-tap-disarms-before-fetch, unmount-while-armed clears timer, and the sr-only "Tap again to confirm." announcement.
- **Convert** the eight non-G3 tests that currently arm-then-fire as setup (the "first click arms, second click fires" comment sites, ~lines 78, 101, 123, 154, 182, 205, 221, 326) to a **single** click. Their behavioral assertions (fetch fired with the right body, result copy, `router.refresh`, overlay behavior) are unchanged; only the interaction reduces from two taps to one.
- **Add** a regression test: **one tap fires immediately.** A single click on the Re-scan button POSTs `/api/admin/onboarding/rescan-sheet`, and the armed label `"Confirm re-scan: replaces this staged review"` NEVER appears in the DOM at any point. Concrete failure mode caught: a re-introduced guard (any future edit that re-adds an armed intermediate state).

### 2.2b Integration + e2e tests exercising the guard through the Step-3 modal

`RescanSheetButton` is mounted inside the Step-3 review modal (its "first consumer"), so three more test files double-tap the rescan button to fire it and MUST convert to a single tap (else they hang on the now-nonexistent second-tap fire). Enumerated so the change is complete:

- **`tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx`**
  - **T8** (`§11 T8: rescanPending false ↔ true …`, ~lines 405-427): asserts the armed morph directly — `expect(btn.textContent).toBe("Re-scan this sheet")` → arm → `.toBe("Confirm re-scan: replaces this staged review")` (line 424) → `.toBe("Re-scanning…")`. **Remove the armed-label assertion**; the test becomes idle → (single tap) → pending, matching the post-withdrawal transition inventory (§3.2). This IS the rescan transition-audit surface — keep it as the idle↔pending audit.
  - **§H N4** overlay pop-in (~lines 715-717) and **§H compound (d)** (~lines 1006-1007): double-tap-to-open-overlay setup → single tap. Overlay/dismiss assertions unchanged.
- **`tests/components/admin/wizard/Step3ReviewModal.test.tsx`** — footer overlay result test (~lines 587-590): double-tap → single tap. The other rescan references in this file (lines 363/377/565/651/874/891 etc.) are dirty-rescan CHIP / footer presence assertions that do NOT tap the button — leave them untouched.
- **`tests/e2e/step3-review-modal.interactions.spec.ts`** — §K14 footer no-shift (~lines 730-732) and §K14-at-390px (~lines 776-778): double-tap → single tap. (e2e is excluded from `pnpm test`; still must be corrected or the Playwright run breaks and the grep-removed-testids check flags stale interactions. Run the e2e spec explicitly as part of verification.)

No armed-morph assertion survives anywhere after this change (grep `"Confirm re-scan: replaces this staged review"` returns zero hits outside the WITHDRAWN spec notes).

### 2.3 Meta-test — `tests/styles/_metaDestructiveConfirm.test.ts`

Remove the `RescanSheetButton.tsx` registry row (the `R("components/admin/RescanSheetButton.tsx", 0, "morph", "rescan-sheet-button-* armed branch (G3 two-tap guard)")` entry, ~lines 54-58). The inverted-amber literal it pins is deleted in 2.1; a per-occurrence registry row with no matching occurrence fails the meta-test. No matcher loosening — the row is removed, per the #408 "extension seam = registry row, never matcher loosening" contract (applied in reverse: withdrawal = registry-row removal).

### 2.4 DESIGN.md §15 ladder (line ~412)

Strike **"re-scan over staged work"** from the tier-2 (two-tap confirm) enumeration. Leave a one-line breadcrumb so the ladder stays honest about why re-scan is absent:

> _(Re-scan was withdrawn from this tier — it is content-aware and preserves ratified decisions on a clean refresh; see `docs/superpowers/specs/2026-07-16-withdraw-rescan-guard.md`.)_

No tier-3 addition — tier 3 ("unguarded one-tap, reversible with recovery path") is unenumerated by design.

### 2.5 Parent spec — `docs/superpowers/specs/2026-07-16-destructive-confirm-pass.md`

Mark G3 **WITHDRAWN** without deleting history (audit trail per invariant 7):

- Line ~10 (the "Unguarded irreversible one-taps" inventory): annotate that "Re-scan this sheet" **stays** one-tap — the G3 guard added in this spec was withdrawn 2026-07-16.
- Line ~45 (the G3 table row): prefix **`WITHDRAWN (2026-07-16)`** with a one-line rationale pointer.
- Line ~50 (the "G3 applies in both placement variants" note): mark WITHDRAWN.

The §12.4 catalog is **not** touched (no error codes involved).

---

## 3. Button state model (post-withdrawal)

`RescanSheetButton` has exactly two visual states, both pre-existing (the armed state is removed):

| State | Trigger | Rendering | Label |
|---|---|---|---|
| **idle** | default / after a result settles | `border border-border-strong bg-bg … text-text-strong` (the surviving resting className) | "Re-scan this sheet" |
| **pending** | `handleClick` in flight (`pending === true`) | idle className + `disabled` + `aria-busy` + `disabled:opacity-60` | "Re-scanning…" |

### 3.1 Guard conditions (button + inputs)

- `disabled` prop truthy → button `disabled` (idle rendering, no fire). Unchanged — the external publish-run freeze (`disabled={pending || disabled}`, line 204) is preserved.
- `pending === true` → re-entrancy guarded inside `handleClick` (`if (pending) return`, line 153) AND the button is `disabled`. A double-tap during flight is a no-op. This replaces the armed state as the only double-fire guard — and it already existed.
- Empty/missing `driveFileId` or `wizardSessionId`: unchanged from today (the props are required; the route validates and returns a typed body — no client-side guard added or removed).

### 3.2 Transition inventory (post-withdrawal)

Two states → one ordered pair (N·(N−1)/2 = 1):

| From → To | Treatment |
|---|---|
| idle ↔ pending | **Instant — no animation.** The label + `disabled` swap on `pending`; no morph, no auto-revert timer, no `AnimatePresence`. Matches Re-sync's idle↔pending (`ReSyncButton.tsx`). |

Removed transitions (were in #408, now gone): idle→armed (tap 1), armed→idle (4s auto-revert), armed→pending (tap 2), armed-unmount (timer cleanup). None survive; there is no armed state.

---

## 4. Non-goals

- **Not** touching the Re-scan apply path (`computeRescanDecision`, `applyRescanDecisionUnderLock`, `app/api/admin/onboarding/rescan-sheet/route.ts`) — behavior of what a re-scan *does* is unchanged; only the confirm affordance is removed.
- **Not** touching the other three #408 guards (G1 permanent-ignore, G2 stop-showing-sheet, G4 bulk Ignore-all-N) — they remain two-tap. Their registry rows stay.
- **Not** the archive-confirm-to-modal proposal (separate, out of scope here).
- **Not** re-wording the resting button or result-line copy (design decision: removal-only).

---

## 5. Acceptance criteria

- **AC-1** A single tap on "Re-scan this sheet" issues the POST immediately; the armed label never renders. (Regression test, 2.2.)
- **AC-2** No inverted-amber destructive-recipe literal remains in `RescanSheetButton.tsx`; `_metaDestructiveConfirm.test.ts` passes with the G3 row removed. (2.3.)
- **AC-3** The eight converted tests in `RescanSheetButton.test.tsx` pass with one click each; the G3 describe block is gone; the three Step-3-modal surfaces (2.2b) convert to single-tap and pass; T8 no longer asserts the armed label; a repo-wide grep for `"Confirm re-scan: replaces this staged review"` returns zero hits outside WITHDRAWN spec notes. (2.2, 2.2b.)
- **AC-4** DESIGN.md §15 no longer lists re-scan in tier 2 and carries the breadcrumb; the parent spec marks G3 WITHDRAWN with history intact. (2.4, 2.5.)
- **AC-5** `impeccable critique` + `impeccable audit` pass on the diff (invariant 8); no P0/P1 unresolved.
- **AC-6** Full `pnpm test`, typecheck, lint, format:check green; Codex whole-diff review APPROVE.

---

## 6. Watchpoints (disagreement-loop preempt)

- **Reviewer may relitigate "should re-scan be guarded at all?"** — Do NOT. The withdrawal is the ratified decision of this amendment, justified by §1.1's content-awareness citations (`rescanDecision.ts:30-64`, `applyRescanDecisionUnderLock.ts:46-53`). The un-guarded, larger-blast-radius Re-sync is the precedent.
- **Reviewer may flag "removing a guard reduces safety."** — The safety mechanism is `computeRescanDecision`, not the confirm morph; it is untouched. The guard protected against a loss (`dirty_demoted`) that only occurs when re-review is desired.
- **Reviewer may flag the deleted sr-only region as an a11y regression.** — It announced the armed morph only. No armed morph → nothing to announce. The button keeps its accessible name; `pending` sets `aria-busy`. No live-region contract is broken.
- **Reviewer may expect a tier-3 ladder entry in DESIGN.md.** — Tier 3 is unenumerated by design (#408 DESIGN.md §15); the breadcrumb is the correct treatment.
