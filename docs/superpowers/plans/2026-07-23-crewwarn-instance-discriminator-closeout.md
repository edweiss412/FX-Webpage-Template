# CREWWARN instance discriminator + eyebrow wrap — close-out

**Branch:** `feat/crewwarn-instance-discriminator`
**Spec:** `docs/superpowers/specs/2026-07-23-crewwarn-instance-discriminator-design.md` (Codex APPROVE R3)
**Plan:** `docs/superpowers/plans/2026-07-23-crewwarn-instance-discriminator.md` (Codex APPROVE R5)
**Resolves:** DEFERRED `CREWWARN-INSTANCE-DISCRIMINATOR-1` (P1) + `CREWWARN-INCARD-MOBILE-EYEBROW-1` (P2) — both graduated to `DEFERRED-archive.md`.

## 1. Task → commit ledger

| Task | Commit | Summary |
| --- | --- | --- |
| 1 producer | 90841d849 | `emitFieldUnreadable` writes `blockRef.field`; full message/rawSnippet byte pins both branches |
| 2 dedup fold | 321a269f6 | `rowDisc` folds field (NUL presence-delimited, raw); hidden-card bug pinned RED first |
| 3 identity fold | fac27437e | `warningIdentityKey` tail-slot fold; legacy byte-literal pin; `buildReportSurfaceId` divergence asserted |
| 4 card band | 9a8659b87 | context-aware detail band (condensed: field+value; full/staged: field+name+value); {USABLE,ABSENT}³ guard matrix; staged wiring test; baseline snapshot UNCHANGED |
| 5 eyebrow | 82dfdabf5 | `truncate` dropped; real-browser 390px idle+armed spec (RED observed pre-fix on clip assertion); jsdom class pin; standalone testMatch registered |
| 6 close-out docs | (this commit) | DEFERRED graduation, archive entries, this ledger |

## 2. Review-round ledger (append per round; through approval)

**Spec:** R1 NEEDS-ATTENTION (5: identity-key collision → fold adopted; jsonb guard rule; transition inventory; staged-snapshot claim unreachable; "zero writers" false). R2 (inline mode after ×3 repo-access deaths) NEEDS-ATTENTION (3: eyebrow pair table; junk-label wrap; disjoint-bbox assertion). R3 APPROVE.

**Plan:** R1 BLOCKING (13: TDD ordering ×2, harness CSS, `as const`, tautological legacy pin, EXPECTED_TITLE co-drift, (d)-as-red error, message/rawSnippet coverage, surfaceId wiring, 6 guard-matrix gaps, close-out commit steps, review-before-docs order, verification loop, Files accuracy). R2 BLOCKING (6: impeccable re-gate loop, Stage 0 provenance, raw/trim fold contracts + presence delimiter, Task 4 rendered-contract gaps, RED description, cross-refs). R3 BLOCKING (3: presence-delimiter test, per-test RED ledger, close-out recording commits). R4 BLOCKING (3: in-scope identifier, true key omission, compound-test naming). R5 APPROVE.

**Observations recorded for future work (not in scope):**
- Producer grammar: email branch reads "read as a email address" (`lib/parser/warnings.ts:89` kind construction). Spec §2.1 pinned message unchanged; a grammar fix is a one-line copy change + test-literal update for a future copy pass.

## 12. Impeccable dual-gate dispositions

Both gates run 2026-07-24 with canonical v3 setup (context.mjs load from skill base dir, product register reference) on the branch UI diff (`components/admin/PerShowActionableWarnings.tsx`, `components/admin/BulkIgnoreControls.tsx`).

**Critique** (dual-agent, detector exit 0 / findings `[]`, browser overlay skipped — admin-auth surface, no dev server; real-browser evidence supplied instead by the Task 5 standalone spec): **37/40**, zero P0/P1. Snapshot: `.impeccable/critique/2026-07-24T06-10-23Z__components-admin-pershowactionablewarnings-tsx.md`.

**Audit** (5-dimension technical): **19/20 Excellent**, anti-patterns PASS, zero P0/P1/P2. Contrast derived from runtime tokens, both themes: label `text-warning-text`/`warning-bg` 8.8:1 light / 9.6:1 dark; value `text-text` 15.6:1 / 10.7:1 — AAA throughout. Eyebrow dimension verified by the green `tests/e2e/bulk-ignore-eyebrow.layout.spec.ts` 390px run (idle+armed).

**Findings + dispositions (all P3 — no fix required by invariant 8; recorded, deferred to a future polish/sweep pass, no DEFERRED.md entry needed at P3):**

| # | Gate | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | critique P3 | Full-mode `bandName` joins into the value span (`PerShowActionableWarnings.tsx:220,233`), so a human name renders `font-mono` + `break-all`. | Deferred. Spec §2.2 ratified byte-parity with the sibling Sheet-row band; splitting the name into its own `break-words` span is a §2.2 amendment for a future polish pass. Verified real against code before recording. |
| 2 | audit P3 | Eyebrow recipe fork: band label uses `tracking-wider` + `text-[10px]` (parity with `:247` sibling and 12 pre-existing uses) while the token family uses `tracking-eyebrow`. | Deferred. Parity was the ratified choice; candidate repo-wide eyebrow-recipe consolidation sweep (BACKLOG-class, not this diff). |

## 13. Whole-diff review

(Appended at Task 7 Step 4 — verdict + any refuted-claim ledger.)
