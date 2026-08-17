# Parser Mutation-Hardening Wave — Implementation Plan (overview)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the five `BL-MUTATION-*` parser silent-fragility classes (6,838 ledgered holes) per the approved spec `docs/superpowers/specs/parser/2026-08-07-parser-mutation-wave-design.md`, shrinking the known-holes ledger accordingly.

**Architecture:** Five sequential branches off `origin/main`, one per operator class (spec §2.1): a whole-document zero-width strip at `parseSheet` entry; two post-parse cell detectors emitting new warn codes; one document-normalize autocorrect (the `normalizeSectionHeaders` pattern); one venue-scope hoist under a hard signal-parity constraint. Each branch deletes its closed rows from `RAW_HOLES` and must leave all four reconciliation buckets empty (spec §9).

**Tech Stack:** Next.js 16 repo, TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), vitest, the parser mutation harness (`tests/parser/mutation/`, 8 shards).

## Global Constraints (from the spec — every task inherits these)

- **Spec is canonical:** `docs/superpowers/specs/parser/2026-08-07-parser-mutation-wave-design.md` (APPROVED via substitute adversarial review 2026-08-08, 3 rounds, codex quota-dead — see Review mechanism below). §1.1 resolved-scope items 1-8 are do-not-relitigate.
- **Warn, never hard-fail** (spec §1.1.4). Severity `"warn"`, parse output preserved.
- **New warn codes:** `REF_ERROR_LITERAL`, `ROW_CELLS_FUSED`, `LEADING_COLUMN_AUTOCORRECTED`. Each lands with the FULL §8 fan-out in ONE commit: master-spec §12.4 row + `pnpm gen:spec-codes` + `lib/messages/catalog.ts` row + `WARNING_CARD_COPY_CODES` + copy (`tests/messages/warningCardCopyRegistry.ts`) + `OPERATOR_ACTIONABLE_ANCHORED` (`lib/parser/dataGaps.ts:403`) + gap-class bucket (`tests/parser/dataGapsClassCompleteness.test.ts` — counts 37/7/2/11/57 → 39/8/2/11/60 across the wave) + `WARNING_CODE_ANCHOR` (`tests/parser/_warningCodeAnchor.ts:31`) + help family row (`app/help/errors/_families.ts:16`).
- **Bucket decisions (spec §8, fixed):** `REF_ERROR_LITERAL`, `ROW_CELLS_FUSED` → `GAP_CLASSES`; `LEADING_COLUMN_AUTOCORRECTED` → benign-warn bucket + `AUTO_FIX_CLASSES` (+ the full §6.2 sixth-autocorrect fan-out).
- **Copy rules:** no raw error codes in UI copy; NO em-dashes in user-visible copy; apostrophes as `'`; Doug-facing tone per `STAGE_WORD_AUTOCORRECTED` template (`lib/messages/catalog.ts:1382-1397`).
- **Ledger green bar (spec §9):** all FOUR classified buckets empty — `newHoles`, `fixedHoles`, `driftedAlarms`, `driftedStale` (`tests/parser/mutationHarness.shard0.test.ts:49-68`). `newHoles` ≠ ∅ is never acceptable. Drift → regenerate the drifted rows' fingerprints in the same branch.
- **TDD per task; commit per task** (`feat(parser):` / `test(parser):` / `infra:` conventions).
- **Invariant 11/12 per branch:** worktree off `origin/main` BEFORE first edit; `pnpm install && pnpm worktree:link-env && pnpm preflight`; `pnpm ledger:claims --check <its BL id>`; mark the row `**Status:** IN PROGRESS · **Branch:** <branch>`; commit + push immediately; marker off in the PR's last commit.
- **One UI-surface touch only** — the help-family rows in `app/help/errors/_families.ts` (spec §1.1.8 as amended by the retro review); the impeccable dual-gate runs once at branch-4 close, which also swaps the closeout marker line.

## Branch order and plan files

1. `feat/mutation-unicode` — [01-unicode.md](./01-unicode.md)
2. `feat/mutation-ref-sub` — [02-ref-sub.md](./02-ref-sub.md)
3. `feat/mutation-merged-cell` — [03-merged-cell.md](./03-merged-cell.md)
4. `feat/mutation-column-shift` — [04-column-shift.md](./04-column-shift.md)
5. `feat/mutation-section-order` — [05-section-order.md](./05-section-order.md)

Each branch merges before the next starts (spec §2.1). Each plan file is self-contained for a zero-context implementer.

## Meta-test inventory (project writing-plans mandate)

- **CREATES:** `tests/parser/cleanCorpusCalibration.test.ts` (spec §10 — per-code clean-corpus expectations; branch 2 creates, branches 3-4 extend); `tests/parser/payloadZeroWidth.test.ts` (spec §3.4 guard, branch 1); `tests/parser/venueSignalParity.test.ts` (spec §7.2(a), branch 5).
- **EXTENDS:** `tests/parser/_metaAutocorrectProducers.test.ts` (+1 producer, length 13→14), `tests/parser/dataGaps.test.ts` (:402/:427 sets), `tests/parser/dataGapsClassCompleteness.test.ts` (buckets), `tests/messages/warningCardCopyRegistry.ts`, `tests/parser/operatorActionableWarnings.test.ts`, `tests/parser/_warningCodeAnchor.ts`, `tests/parser/mutation/classify.ts` `RISK_CRITICAL` (+pull_sheet) + `applicabilityAudit.ts`, `tests/parser/mutation/knownHoles.ts` (row deletions + `OPERATOR_FINDING_MAP` comment update; value unchanged per spec §7.4).
- Advisory-lock topology: N/A — no `pg_advisory*` surface touched (parser-only wave). Supabase call-boundary registry: N/A — no Supabase calls added.

## Plan-time sweep output (run 2026-08-08, embedded per the reconciliation-sweep mandate)

`grep -rn "five \*_AUTOCORRECTED|the five autocorrect|All five|counts only the five|five benign" lib/ tests/` →
`lib/parser/dataGaps.ts:131`, `lib/parser/dataGaps.ts:136`, `lib/parser/dataGaps.ts:155` · `lib/parser/autocorrectCodes.ts:18` · `lib/parser/types.ts:106` · `tests/parser/dataGaps.test.ts:402`, `tests/parser/dataGaps.test.ts:427` (plus two false hits in unrelated files: `tests/styles/_metaNewTabAnnouncement.test.ts:1689`, `tests/e2e/crew-layout-dimensions.spec.ts:1308`). All true hits are enumerated in branch 4's fan-out task. **The grep pattern under-reports (r1 F7):** it requires a "five" literal, so three spec §6.2 sites it misses are `lib/parser/dataGaps.ts:26`, `tests/parser/_metaAutocorrectProducers.test.ts:77`, and `tests/messages/autocorrectGuidance.test.ts:94` - branch 4's task table (which follows spec §6.2, the authoritative enumeration) carries all three. Consumer files that read the autocorrect summary generically and MUST be re-checked for exact-set assumptions in branch 4 (recorded here from the plan-time file sweep): `tests/notify/monitorDigest.autofix.test.ts`, `tests/notify/monitorDigest.autofix.db.test.ts`, `tests/notify/monitorDigest.autofixAnchors.test.ts`, `tests/admin/step3Buckets.test.ts`, `tests/dataQuality/warningFingerprint.test.ts`, `tests/admin/sectionWarningModel.autocorrect.test.ts`, `tests/components/perShowActionableWarnings.autocorrect.test.tsx`.

## Harness commands (spec §2.2)

- Full harness (CI shape): `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation`
- Single shard locally: `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run tests/parser/mutationHarness.shard0.test.ts` (shards 0-7; a class's rows spread across shards, so branch close-out runs the full 8-shard set; per-shard iteration is for the inner loop).
- The PR fires `.github/workflows/mutation-harness.yml` via the `tests/parser/mutation/**` path filter (every branch edits `knownHoles.ts`). Close-out additionally verifies via `workflow_dispatch` on the PR head. NOT branch-protection-required; the gate is procedural (spec §2.2).

## Ledger row deletion (used by every branch; adjust the prefix)

```bash
# delete a whole class (branches 1-4); section-order deletes 10 named rows only (see 05)
perl -ni -e 'print unless /^(ref-sub|unicode-inject|merged-cell|column-shift):/' tests/parser/mutation/knownHoles.ts
```

Rows live inside the `RAW_HOLES` template literal, one per line, `<operator>:<fixture-slug>:B<n>:L<line>:X<locus>|kind|fingerprint|finding|note` — the operator prefix is line-anchored, so the filter is exact. After deletion run `pnpm exec vitest run tests/parser/mutation/knownHoles.test.ts` (row-format + finding-resolvability pins).

## Review mechanism for this wave (recorded deviation)

Codex CLI is quota-dead until 2026-08-11 6:21 PM (3× `nonzero_exit` usage-limit, `scratchpad/codex-out/spec-r1-235900`). Per the documented ladder (`feedback_codex_exec_killed_fallback_selfreview_ci`, inlined here because Codex-bound docs cannot read memory files): substitute fresh-eyes adversarial review by an independent Claude session, findings admissible under the same probe-backed contract, real CI as the hard arbiter, and the deviation recorded in every PR body — NEVER claimed as a cross-model APPROVE. If the quota resets mid-wave, switch back to `codex-guard` (`node scripts/codex-guard.mjs review --brief <file> --cwd <dir> --out <dir> --stage diff --round <n>`).

## Ratified amendment — branch 5 Tasks 3–4 superseded (2026-08-15)

Branch 5's Task 3 (venue-scope hoist) hit the spec §7.2 stop rule: the parity probe (`05-section-order-parity-probe.md`) proved §7.2(a) and §7.2(b) jointly unsatisfiable (+4,291 emissions under any swap-invariant rule). User-ratified resolution: the positional `UNKNOWN_FIELD` sweep is RETIRED and replaced by a content-keyed field near-miss detector per `docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md`, which supersedes branch-5 Tasks 3–4 (Tasks 1–2 artifacts are kept and repurposed). The §7.2(a) parity constraint is superseded by that spec's calibrated baseline (394 → calibrated true-positive set, a ratified QUIETING). AC-S1..S4 are replaced by the spec's AC-N1..N7. **AC-W1's 10-row deletion intent is REFUTED BY MEASUREMENT (amended 2026-08-16, implementation).** The ten was authored, not measured; the collected harness run closes **86** holes — 24 `section-reorder` (the ten a strict subset), 49 `blank-row`, 10 `header-typo`, 3 `merged-cell` — opens 17, and drifts 1,002 of 1,088 fingerprints, because the retired positional sweep was part of nearly every mutant's redacted signal. This is the rule `knownHoles.ts` already carried from branch 4: size a shrink by the harness's own `fixedHoles` set, never by an operator's row count or a plan's id list. Evidence: `docs/superpowers/specs/parser/probes/2026-08-16-newhole-mechanism.md`.

## Acceptance criteria index

Per-branch ACs live in each plan file (AC-U*, AC-R*, AC-M*, AC-C*, AC-S*). Wave-level:

- **AC-W1:** After all five branches merge, `RAW_HOLES` holds 1,076 rows PLUS the merged-cell residue: 7,842 − 827 − 3,314 − (2,404 − residue) − 211 − 10. Retro plan review F7 replayed the discriminator over the ledger and predicted a residue of 31 mutants across 13 target rows (≈2,373 closures, final ≈1,107). **The replay is superseded by measurement (amended 2026-08-16, implementation), as this criterion's own next clause always said it would be — the harness run is authoritative over the replay.** The live merged-cell residue is 119 rows, not 31; the pre-branch-5 total was 1,088; and branch 5 lands the ledger at **1,019**, regenerated from its own collected alarms rather than edited. 1,019 is the number AC-W1 closes on. Census: blank-row 696, header-typo 133, merged-cell 119, section-reorder 59, column-shift 12; by kind 1,002 `wrong` + 13 `text_drift` + 4 `signal_loss`. Every remaining row maps to a documented finding (audit #5, audit #10, section-order documented ref) or a recorded residue note.
- **AC-W2:** Every new code passes `x1-catalog-parity`, card-copy, actionable, gap-class, and anchor gates (Global Constraints fan-out list).
- **AC-W3:** Each branch's PR body records the substitute-review deviation while codex is quota-dead.
