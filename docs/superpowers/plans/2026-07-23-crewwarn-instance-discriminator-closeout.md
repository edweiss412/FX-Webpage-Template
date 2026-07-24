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
| 1 | critique P3 | Full-mode `bandName` joins into the value span (`PerShowActionableWarnings.tsx:220,233`), so a human name renders `font-mono` + `break-all`. | **RESOLVED** by the whole-diff R2 fix (see §13): name now lives in its own proportional `break-words` span; mono/`break-all` reserved for the quoted value. |
| 2 | audit P3 | Eyebrow recipe fork: band label uses `tracking-wider` + `text-[10px]` (parity with `:247` sibling and 12 pre-existing uses) while the token family uses `tracking-eyebrow`. | Deferred. Parity was the ratified choice; candidate repo-wide eyebrow-recipe consolidation sweep (BACKLOG-class, not this diff). |

**Re-gate after whole-diff R2 UI fix (2026-07-24, delta pass):** span split verified clean — `text-text-subtle` separator token canonical; `aria-hidden` middot matches project precedent (`components/auth/IdentityChip.tsx:49`), no SR boundary regression (flex-item text-run separation + literal quoting carry it); guards correct (no dangling middot). One P3 (name span missing `min-w-0` — unbroken pathological name could exceed card width at 390px) fixed in the same commit. No open impeccable findings.

## 13. Whole-diff review

**R1 (2026-07-24, codex-guard inline mode): NEEDS-ATTENTION** — 1 finding, P1, CONFIRMED against code: `warningIdentityKey` fold not injection-resistant — `blockRef.name` (unvalidated jsonb, raw NUL in-domain) could forge the `\0F` marker; `(name="J", field="x|\0Fphone")` and `(name="J|\0Fx", field="phone")` collided, recreating the shared-surfaceId class the feature eliminates. Fix (TDD, RED observed on the exact collision pair): `fu` now `\0F${JSON.stringify(field)}` — JSON output carries no raw NUL, so the key's last raw NUL is always the delimiter; present-vs-absent forgery also blocked (field-less keys end `|`, never a quote). Legacy field-less keys byte-unchanged (pin still green). Class sweep: dedup `rowDisc` fold (lib/parser/dataGaps.ts:423-434) verified NOT in class — all pre-terminal segments are enum/numeric/a1 (no arbitrary strings), terminal slots safe; roleToken identity fold disjoint by code. No meta-test exists for this vector; the injection test itself is the structural pin.

**R2 (2026-07-24, inline mode): NEEDS-ATTENTION** — R1 fix confirmed sound by reviewer; 1 new finding, P1, CONFIRMED by construction: full-mode band joined name+value into one string, so delimiter-bearing sheet data rendered two DISTINCT warnings identically (name `Jordan` + value `office" · "night` vs name `Jordan · "office"` + value `night`). Fix (TDD, RED observed on the exact pair): name and value now render in separate testid'd spans (`per-show-actionable-field-name` proportional/`break-words`/`min-w-0`; `per-show-actionable-field-label-value` mono/`break-all` holding only the quoted value) with an `aria-hidden` middot span between when both present — the (name, value) tuple stays DOM-distinct and typographically distinct. Also resolves impeccable critique P3 #1 (§12). Impeccable delta re-gate run on the fix: clean after a same-commit `min-w-0` P3 fix. Byte pins in fieldBand/StagedReviewCard tests updated to the split-span structure (separator is its own span; gap spacing is CSS, so textContent drops the joiner spaces).

**R3 (2026-07-24, inline mode): NEEDS-ATTENTION** — production R1+R2 fixes confirmed sound (legacy-key preservation, condensed omission, separator guards, regression pins). Both findings were documentation drift: the checked-in spec §2.2 and plan (Task 3 Step 3 fold snippet; Task 4 interface/test/implementation snippets) still prescribed the superseded shapes (raw `\0F` fold; joined single value span) and would recreate the R1/R2 bugs if re-executed. Fix: spec §2.2 amended in place to the split-span structure (name span testid, aria-hidden separator, value-only span, break-words + min-w-0 name rationale); spec §1 identity bullet amended with the JSON.stringify fold serialization; plan Task 3 snippet updated to the shipped fold + amendment blockquote; plan Task 4 gained an amendment blockquote marking the joined-string snippets as historical record, do-not-re-implement. `pnpm spec:lint` both docs: 0 hard.
