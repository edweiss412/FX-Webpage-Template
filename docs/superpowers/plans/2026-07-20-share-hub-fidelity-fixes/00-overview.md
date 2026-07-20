# Plan — share-hub fidelity fixes

**Spec:** `docs/superpowers/specs/2026-07-20-share-hub-fidelity-fixes.md` (canonical; the
plan never supersedes it).
**Branch:** `fix/share-hub-zorder-menu-rows`
**Implementer:** Opus / Claude Code (UI work — ROUTING.md hard rule).

Six TDD tasks. Each: failing test → minimal implementation → green → one commit.

---

## Pre-draft code-verification pass (run, not described)

| Claim | Command | Result |
| --- | --- | --- |
| ShareHub root class | `sed -n '221p' components/admin/showpage/ShareHub.tsx` | `<div className="relative z-30 flex items-center gap-2">` ✓ |
| Attention wrapper (NOT modified — spec §3.2) | `sed -n '510p' components/admin/showpage/PublishedReviewModal.tsx` | `<div className="relative">` ✓ stays as-is |
| ShareHub triggers are non-positioned | `sed -n '251,255p;270,272p' components/admin/showpage/ShareHub.tsx` | no `relative`/`absolute`/`fixed` on either button ✓ (this is why §3.2's one-line fix suffices) |
| `step3ReviewSections` is NOT a consumer (refutes a BLOCKING finding) | `grep -n 'PickerResetControl' components/admin/wizard/step3ReviewSections.tsx` | two COMMENT mentions only (`:1263`, `:1284`); no JSX ✓ |
| AttentionMenu panel z | `grep -n 'z-20' components/admin/showpage/AttentionMenu.tsx` | `:99` ✓ |
| Sole production consumers | `grep -rn --include='*.tsx' '<PickerResetControl\|<RotateShareTokenButton' app components` | only `ShareHub.tsx:353,363` ✓ |
| accName assertion — MUST KEEP PASSING (spec §4.2 retains the wiring) | `grep -n 'toHaveAccessibleName("Rotate share link")' tests/components/admin/showpage/shareHub.test.tsx` | `:296` ✓ unchanged |
| Compact describedby test — MUST KEEP PASSING | `grep -n 'compact: descriptive accessible name' tests/components/RotateShareTokenButton.test.tsx` | `:71` ✓ unchanged; this file needs no edit |
| Heading test to update | `grep -n 'getByRole("heading"' tests/admin/pickerResetControl.test.tsx` | `:38` ✓ |
| Tap token | `grep -n 'spacing-tap-min' app/globals.css` | `:162` `44px` ✓ |
| Panel transform cleared at rest | `sed -n '294p' components/admin/review/ReviewModalShell.tsx` | `panel.style.transform = "";` ✓ |
| Baseline green before any edit | `pnpm vitest run tests/components/admin/showpage/shareHub.test.tsx tests/components/RotateShareTokenButton.test.tsx tests/admin/pickerResetControl.test.tsx tests/styles` | 12 files / 141 tests passed ✓ |

## Meta-test inventory

- **CREATES:** `tests/components/admin/showpage/_rowAssertions.selftest.test.tsx` — a
  permanent self-test of the shared row-assertion helpers, asserting BOTH that a correct row
  passes every helper end to end (using the real lucide icons and real class strings) and
  that the known escapes still fail. It exists because four review findings were of the
  class "this assertion would fail the CORRECT implementation," each missed by unfaithful
  probe fixtures.
- **EXTENDS:** none.
- **Declared N/A with reason:**
  - `tests/auth/_metaInfraContract.test.ts` — no Supabase client call is added or moved.
  - `tests/log/_metaMutationSurfaceObservability.test.ts` /
    `tests/log/adminOutcomeBehavior.test.ts` — no route handler and no `"use server"`
    action is added or modified; the existing `rotateShareToken` / `resetPickerEpoch`
    registry rows are untouched.
  - `tests/messages/_metaAdminAlertCatalog.test.ts` — no new `admin_alerts` code.
  - `tests/auth/advisoryLockRpcDeadlock.test.ts` — no `pg_advisory*` surface in the diff.
  - `tests/styles/_metaDestructiveConfirm.test.ts` — the confirm-button class literals
    (the only lines carrying both `bg-warning-text` and `text-warning-bg`) are NOT edited,
    so no registry row and no occurrence index shifts. **Task 6 re-runs it to prove this.**
  - `tests/admin/no-inline-email-normalization.test.ts` — no email handling in the diff.

## Advisory-lock holder topology

N/A — the diff contains no `pg_advisory*` call, and no code path in it mutates `shows`,
`crew_members`, `crew_member_auth`, `pending_syncs`, or `pending_ingestions`.

## Task list

| # | Task | Commit type | Spec |
| --- | --- | --- | --- |
| 1 | Conditional elevation on the ShareHub root ONLY | `fix(admin)` | §3 |
| 2 | Rotate idle row → menu row (a11y wiring retained) | `fix(admin)` | §4.1–§4.2 |
| 3 | Reset idle row → menu row, `<h4>` → span, stale comment fixed | `fix(admin)` | §4.1–§4.3 |
| 4 | Caret notch as a SIBLING of the popover | `feat(admin)` | §5 |
| 5 | Real-browser T-HUB-ZORDER + dimensional invariants + caret | `test(admin)` | §7.3–§7.4 |
| 6 | Full-suite + registry sweep, impeccable dual-gate | `chore(admin)` | §7.5 |

## Verification commands (every task)

```
pnpm vitest run <the task's test files>
pnpm typecheck
pnpm exec eslint <changed files>
pnpm format:check <changed files>
```

Before push (Task 6): `pnpm test` (full), `pnpm typecheck`, `pnpm lint`,
`pnpm format:check`, and the Playwright specs named in Task 5.

## Anti-tautology commitments

Every assertion below names the concrete failure mode it catches. No assertion may pass by
accident:

- Row-shape assertions scope to the popover via `within(popover())` and assert the ABSENCE
  of the old shape (a bare `Rotate` button, an `<h4>`), not just the presence of the new —
  presence alone would pass while both shapes coexist.
- The z-order assertion is `elementFromPoint` in a real browser, NOT a computed-style or
  class read: a class-only assertion passes against a wrapper that is elevated but still
  loses to DOM order, which is the exact defect.
- The caret geometry is derived from the measured kebab rect, never hardcoded to 22px.
- The T-HUB-ZORDER intersection precondition FAILS LOUD rather than skipping, so a future
  layout change that separates the two rects cannot silently retire the test.
