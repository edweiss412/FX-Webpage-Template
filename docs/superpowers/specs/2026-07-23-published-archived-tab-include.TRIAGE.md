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
