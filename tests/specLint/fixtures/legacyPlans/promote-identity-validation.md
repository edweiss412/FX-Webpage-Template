# Plan: snapshot promotion validates required names (exact set + path binding)

**Spec:** `docs/superpowers/specs/2026-08-10-promote-identity-validation.md` (APPROVED, round 6, 0 findings) · **Branch:** `fix/promote-identity-validation` · **Implementer:** Opus / Claude Code

**Meta-test inventory (declared):** EXTENDS `tests/sync/promoteSnapshotExpectedCount.realdb.test.ts` (repointed at the names SQL, multiplicity-preserving, malformed-variants row kept, composed-seam `queryRows` exercise) and `tests/sync/promoteSnapshot.test.ts` (delta fixtures). No advisory-lock topology change (single holder unchanged, `withShowLock` at `lib/sync/promoteSnapshot.ts:291` — declared per the writing-plans advisory-lock rule: no `pg_advisory*` surface is touched). Invariant-10: the NEW `SNAPSHOT_PROMOTE_MANIFEST_MISMATCH` emit inside `promoteSnapshotUpload` is the code-carrying emit for this non-admin surface (post-commit, outside the lock). No UI surface — no impeccable gate (marker below).

**Layout-dimensions / transition-audit:** N/A — no UI.

<!-- tasks: depth=2 -->

## Task 1 — Names SQL + queryRows seam + path binding

<!-- task: red=`pnpm vitest run tests/sync/promoteSnapshotExpectedCount.realdb.test.ts` ac=AC-4 -->

Red is written by this task (invariant-1 shape): repointing the realdb suite at `EXPECTED_ASSET_NAMES_SQL` fails against the live tree because the constant does not exist — `lib/sync/promoteSnapshot.ts:63` exports only the count SQL, and `LockablePromoteTx` (`lib/sync/lockedPromoteTx.ts:5`) has no `queryRows` (both verified on the live tree 2026-08-10).

1. `EXPECTED_ASSET_NAMES_SQL` per spec §4.1: discriminated `kind='original'` (full `snapshotPath`) / `kind='variant'` (key) rows, both JSON legs keeping the malformed-`variants` guard verbatim; count SQL deleted.
2. `queryRows<T>` on `LockablePromoteTx` + its `postgresTxAdapter` only (shared `LockableSyncTx` untouched — five other implementers enumerated in the spec must NOT change).
3. Realdb assertions: the full `{kind, name}` ROW list with multiplicities (sorted-array equality on BOTH fields — R1 F2: name-only equality lets originals mislabeled as variants bypass path binding, and variants mislabeled as originals go falsely `mispathed`) for a seeded manifest incl. variants, null-`snapshotPath` exclusion, a duplicate-basename manifest, and the malformed-variants row; exercised through the COMPOSED `withPromoteLock` → `withShowLock` → `queryRows` path.
4. Structural fences (R1 F4): a source-scan assertion that `EXPECTED_ASSET_COUNT_SQL` no longer exists anywhere in `lib/` (the single-source negative), and a type-level assertion that `LockableSyncTx` does NOT declare `queryRows` (e.g. a `@ts-expect-error` on `declare const t: LockableSyncTx; t.queryRows` in a typecheck-only test) so a shared-interface widening fails the suite rather than the diff review.
5. Green: suite passes.

## Task 2 — Path binding + set comparison + deltas + emit

<!-- task: red=`pnpm vitest run tests/sync/promoteSnapshot.test.ts` ac=AC-1,AC-2,AC-3 -->

Red is written by this task (invariant-1 shape): the new fixtures fail against the live tree because `lib/sync/promoteSnapshot.ts:301` and `lib/sync/promoteSnapshot.ts:321` compare LENGTHS only — the filing's probe shape (equal count, missing required name) PASSES promotion today, and no `deltas`, no `mispathed` class, and no fulfilled-outcome emit exist (all verified on the live tree).

1. Path binding first (every `original` row's dirname === `canonicalPrefix(show_id, revision)`; slash-less paths are `mispathed` by definition), then multiset comparison at both checkpoints; deltas `{missing, extra, duplicated, mispathed, truncated}` bounded to 10, present on the three comparison-derived branches only.
2. The post-commit `log.warn` with `code: "SNAPSHOT_PROMOTE_MANIFEST_MISMATCH"` + deltas + `snapshotRevisionId` inside `promoteSnapshotUpload`, after the transaction resolves, outside the lock.
3. Fixtures per spec §6: the filing's probe shape (red today — it passes; green when it fails with `missing`+`extra` populated); all-required-plus-extra (`extra` only — exact-set); duplicated-requirement (`duplicated`, not `missing`); stale-revision snapshotPath (`mispathed`, before any listing comparison — the R4 probe shape; ORDERING PROVEN by a storage spy asserting `storage.list` was NEVER invoked on that fixture — R1 F3); exact match promotes; 11-name delta → 10 + `truncated`; rollback-on-post-move-mismatch (moved objects restored); emit ordering sink-spy (fires once per deltas-carrying outcome, post-resolve, never on rollback-failure/lock-skipped). Expected names derived from fixture manifests, never from implementation output.
4. Green: suite passes; `pnpm vitest run tests/sync` green as the belt.

## Task 3 — Graduation + merge sequence

<!-- task: red=`sh -c '! grep -q "^## BL-PROMOTE-VALIDATES-COUNTS-NOT-IDENTITIES" BACKLOG.md'` ac=AC-5 -->

Red now (the entry heading exists; the negated grep exits 1; exits 0 once graduated — same command).

1. Graduate the entry to the archive (marker off in the graduation commit — invariant 12's sanctioned shape); registry row per `tests/docs/_metaDeferralLedgerGraduation.test.ts`. **Completion checks (R1 F1 — the red alone would pass on a bare deletion):** `grep -q "BL-PROMOTE-VALIDATES-COUNTS-NOT-IDENTITIES" BACKLOG-archive.md` (archived, not deleted) AND `grep -q "BL-PROMOTE-VALIDATES-COUNTS-NOT-IDENTITIES" tests/docs/_metaDeferralLedgerGraduation.test.ts` (registry row present); then `pnpm vitest run tests/docs` green as the belt.
2. Whole-diff cross-model review to APPROVE; real CI green; `gh pr merge --merge`; fast-forward main; `0  0` check.

<!-- tasks: end -->

## Acceptance criteria (crosswalk to the spec's §8)

- AC-1: the filing's probe shape fails promotion with the missing name reported.
- AC-2: extras fail loudly with names; exact match promotes.
- AC-3: duplicated → `duplicated`; stale-revision path → `mispathed` before listing comparison.
- AC-4: count SQL gone; realdb pins the names SQL; single requirement source.
- AC-5: entry graduates with the registry row.

impeccable-gate: N/A — no UI surface
