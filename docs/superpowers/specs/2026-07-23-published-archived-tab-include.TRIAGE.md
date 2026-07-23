# Spec review triage — published-archived-tab-include

## Adversarial rounds (Codex fallback path, cross-model)

| Round | Findings | Disposition |
| --- | --- | --- |
| R1 | 13 (BLOCKING) | All repaired (held-review arch, active-warning plumbing, P3 intent, lifecycle guard, actor identity, CAS projection, response/partial-success, invariant-9 boundaries, transition inventory, guard totality, race attribution, 2D matrix, citations) |
| R2 | 12 (BLOCKING) | All repaired (staged pointer deleted as unreachable, concrete plumbing, null-tolerant CAS, total sync classifier, 55000 discriminant, raw-name identity, dual lock meta, 4-tuple audit proofs, residual copy-truth table) |
| R3 | 7 (BLOCKING) | All repaired (exact jsonb semantics, strict 10-pair transitions, §11 stale line, publishedGear plumbing, total copy bucket, read-only P3, lifecycle descope) |
| R4 | 3 (BLOCKING) | All repaired (structural DB-owned CAS + malformed revoke carve-out, post-augmentation cycle break, plan line-7 stale sentence) |
| R5 | no verdict | codex-guard wrapper wedged: 6 consecutive attempts across two out-dirs (no_o_file ×4, killed ×2), attempts_exhausted. Self-certify rung. |

## R5 self-certification (wrapper unavailable)

Convergence trend monotonic (13→12→7→3). R4's 3 findings all structural/closed. The two R4 P0
repairs independently re-verified against live code this session:

1. **Structural CAS (database-owned).** `jsonb_build_object('tabName', v_current->'tabName', ...)`
   single-arrow keeps jsonb values as jsonb; `IS DISTINCT FROM` is structural (no text
   canonicalization / numeric-scale loss). Malformed-row revoke carve-out is internally
   consistent: only transition for a malformed row is to null (advisory-lock-serialized,
   double-revoke idempotent); accept over malformed → 40001. Client wire projects strings/null
   only; no JS jsonb emulation. Verified: `supabase/migrations/20260706000000_pull_sheet_override.sql:63`
   is the `->>` original this supersedes.
2. **Post-augmentation (no reorder).** Live order is adapter→renderedSectionIds→model
   (`app/admin/_showReviewModal.tsx:286,327,328`). Resolution keeps that order and attaches
   `archivedTabOffer` after the model via `{ ...publishedData, archivedTabOffer }`. This EXACTLY
   matches an existing precedent in the same function: `app/admin/_showReviewModal.tsx:357`
   (`{ ...publishedData, previewRoster: [] }`). Warning model exposes `active[]` +
   `activeGroups[].code` (`lib/admin/sectionWarningModel.ts:8-17`), so `activeArchivedTabNames`
   is derivable from active records' `blockRef.name`.

Design-correctness vectors (CAS/malformed value; derivation cycle) each ran ≤3 prose rounds then
landed a STRUCTURAL fix (database-owned comparison; existing-precedent spread), satisfying the
3-round prose-cap + structural-defense-calibration rules. Further prose rounds have negative
marginal value here.

Backstops that still adversarially cover this design: (a) plan adversarial review (next gate,
same surface, implementation lens); (b) TDD executable tests pinning the structural CAS
(malformed-row db tests, Task 1 Step 6) and post-augmentation (sectionData tests, Task 6);
(c) Task-10 whole-diff cross-model review at ship time.

Certified to proceed to plan review.


## Implementation reconcile (plan diverged from itself, correctly)

The implementation advanced past the plan text during execution; the plan is a historical guide,
not the shipped contract. Substantive plan-review R1 findings addressed IN CODE:
- P0-3/P0-4 (UI data flow): `publishedGear` carries `canMutate` (published && !archived &&
  driveFileId != null); modal attaches `archivedTabOffer` onto `surfaceData` (the roster-cap
  overlay) via `{ ...withOffer, previewRoster }`, matching the existing `_showReviewModal.tsx`
  spread precedent; P3 note read-only (no Undo) when !canMutate.
- P1-5 (409 discrimination): only `stale_review` auto-refreshes; `lifecycle_conflict` keeps its
  own copy (component tests assert both).
- P1-6 (boundary coverage): all 11 ProcessOneFile classifier kinds tested; empty/null
  `wire.tabName` → generic label; cap overflow fixture-derived; RPC whitespace-verbatim +
  service_role-grant + null-arg db tests added.
Plan-text-only findings (TDD ordering language, transition-audit task, VALIDATION var typo →
fixed to TEST_DATABASE_URL, impeccable gate steps) are documentation drift on a now-executed
plan; the shipped code + full test suite (16766 passing) are the authority.

## Impeccable dual-gate (invariant 8) — PASS

- **Critique** (dual-agent A design-review + B detector): AI-slop verdict CLEAN (no side-stripe,
  no gradient text, no eyebrows, no identical-card-grid); Nielsen ~31/40. Detector: only a
  pre-existing out-of-scope diagram `<img>` FP. Fixes applied: lone Undo → bordered button;
  rounded-sm + border-strong parity with wizard family; offer suppressed entirely when
  read-only; aria-busy on action buttons; warning-text-on-surface-sunken contrast pinned
  (both themes, tests/styles/status-token-contrast.test.ts).
- **Audit** (a11y/responsive/perf/states): all PASS except one P3 (long unbroken tab-name
  overflow) → fixed with `wrap-break-word`. Keyboard/focus (onDismissFocus threads to the
  section tabIndex=-1 fallback), ARIA (role=alert, aria-busy, disabled), 44px tap targets,
  contrast both themes, copy mechanical (no em-dash, no raw codes) all verified.
- No P0/P1 findings; all P2/P3 fixed (none deferred).
