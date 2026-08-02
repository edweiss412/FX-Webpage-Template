# Docs hygiene — retired-workflow citation rot + master-spec financials vocabulary

**Date:** 2026-08-02
**Backlog items:** `BL-DANGLING-CITATIONS-RETIRED-WORKFLOW` (BACKLOG.md §"BL-DANGLING-CITATIONS-RETIRED-WORKFLOW"), `BL-MASTERSPEC-FINANCIALS-VOCAB` (BACKLOG.md §"BL-MASTERSPEC-FINANCIALS-VOCAB"). `BL-HELP-STRIP-COPYLINK-STALE` was evaluated and **deferred** (§1.1).
**Class:** docs-only. No app code, no DB, no UI surface, no §12.4 rows.
**Verification ground truth:** `pnpm spec:lint` per-file deltas + the backlog entry's grep seed. Every count below was measured live on this branch's merge-base (2509f1452), not copied from the backlog entry — the 2026-07-24 sweep-status warning (BACKLOG.md §"Sweep status (2026-07-24/25)") was applied and it mattered: two of the entry's claims were stale (§1.1 items 4 and 5).

---

## 1. Scope

Two changes, one docs-only branch:

1. **Item 1 — strip dangling citations to deleted e2e workflows.** `origin/main` (c7c5625c2, ratified by `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md` — its deletion list is at line 230 of that file) deleted seven per-feature e2e workflows. Backticked references to those `.yml` paths parse as citations to `spec:lint` (`scripts/spec-lint.ts`) and hard-fail `CITATION_FILE_MISSING`. Fix: render each reference as prose, PR #610 style ("the retired modal-header-layout-e2e workflow"). The linter keys on the backticked `.yml` extension; a backticked bare filename does NOT clear it (measured: the modal-header CLOSE-OUT doc, file 3 in §2.2, fails at its line 86 on the bare backticked filename with no directory prefix).
2. **Item 2 — reconcile master-spec financials-access prose.** The `FINANCIALS` role flag (`docs/superpowers/specs/admin/2026-07-15-extend-role-scope-vocab.md`) grants financials access alongside `LEAD` and admin, but 11 master-spec prose claims (of 15 grep-seed hits; 4 are ratified exclusions, §3.2) still say LEAD-only. Live code verified 2026-08-02: `lib/data/getShowForViewer.ts:375-380` (`isLead = isAdmin || derivedFlags.includes("LEAD")`; `financialsEntitled = isLead || derivedFlags.includes("FINANCIALS")`) and `lib/visibility/scopeTiles.ts:141` (`financialsVisible = isAdmin || flags.includes("LEAD") || flags.includes("FINANCIALS")`). Reconcile every stale claim to the entitlement set **admin ∪ LEAD ∪ FINANCIALS**.

### 1.1 Resolved scope — do not relitigate

1. **`BL-HELP-STRIP-COPYLINK-STALE` is DEFERRED, not forgotten.** The entry's own trigger says "the next help pass, which can own the regeneration" (BACKLOG.md, entry body). Including it would (a) touch `app/help/admin/per-show-panel/page.mdx` — a UI surface per AGENTS.md invariant 8, requiring the impeccable dual-gate; (b) pull in the help prose-pinning test surface (`tests/help/page-per-show-panel.test.tsx`, `tests/help/sheetChangesCopy.test.ts`, affordance-matrix meta-tests); and (c) convert a docs-only branch into an app branch needing preflight. Both stale claims were re-verified live (`page.mdx:7` "the copy-link for the crew URL" in the status strip; `page.mdx:30` "between the sync line and the copy-link button") — the entry is accurate and stays OPEN.
2. **Class-sweep widening is mandated, not scope creep.** AGENTS.md §"Class-sweep before patching adversarial findings" requires sweeping the bug SHAPE, not the named instance. The entry names only the modal-header workflow; the same shape (backticked citation to any of the seven deleted workflows) was swept across `docs/` and found in four additional files (attention-anchor, hoverhelp-geometry). All ten files are in scope. The sweep covered all seven deleted names: attention-anchor-e2e, attention-pill-focus-e2e, bulk-ignore-eyebrow-e2e, destructive-layout-e2e, hoverhelp-geometry-e2e, modal-header-layout-e2e, share-link-flash-e2e.
3. **Acceptance is target-class zero, not file-wide zero.** Residual hard findings of OTHER classes in touched files are deliberately left (inventory in §2.2): 8× `COPY_EM_DASH` in the strip-mobile plan (quoted UI copy in a shipped historical plan), 1× citation of the untracked codex models-cache JSON path (CLOSE-OUT doc line 125), 1× citation of the impeccable context script by bare name (caret-blur plan line 1136), 1× `CITATION_LINE_OUT_OF_RANGE` (attention-index plan line 286). Different classes; fixing them here would be the drip-feed anti-pattern in reverse — unrelated edits widening an in-review diff. `spec:lint` is not wired into any workflow (verified: no `.github/workflows/**` match), so nothing is merge-blocked by leaving them.
4. **The retiring spec needs NO edit — backlog entry claim corrected.** The entry says "the last entry is the retiring spec itself, where the old name is legitimate history." Measured: the retiring spec is `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md` (second-to-last in the entry's list, not last), and it already renders every deleted-workflow name as plain prose — `spec:lint` reports **0 hard** on it. No edit. The entry's list is also stale the other way: it omits nothing that fails, but two files it lists as needing work carry additional non-target findings (§2.2).
5. **Fenced-code-block occurrences stay.** Lines 355 and 375 of `docs/superpowers/plans/2026-07-24-strip-mobile-stacked-band.md` name the deleted workflow inside fenced command blocks (historical task commands). `spec:lint` does not parse citations inside fenced blocks (measured: those lines produce no finding). Rewriting shipped-plan command history has negative value. Untouched.
6. **Item 2 exclusions are the entry's own, ratified here.** (a) RLS-admin-only denial claims stay (the RLS layer really is admin-only; `FINANCIALS` entitlement is applied server-side by the service-role fetch path). (b) `raw_unrecognized` / `parse_warnings` access claims stay admin/LEAD-only — `FINANCIALS` grants only the `financials` column (master spec :653 already states `only selects financials`). (c) The §6.8 MI-9 claim was already corrected by the capability-narrow change (2026-07-17) — measured: master spec :190-195 already reads "LEAD OR FINANCIALS" and cites `BL-MASTERSPEC-FINANCIALS-VOCAB`.
7. **No master-spec-patches/ entry.** The semantics were ratified by `2026-07-15-extend-role-scope-vocab.md`; this change is prose reconciliation to an already-ratified amendment, recorded by this spec and inline `(… — 2026-07-15 vocab extension)` markers, not a new ratification. The patch-doc convention (`docs/superpowers/specs/README.md` §"Master-spec patches") is for edits that *change* contract content.
8. **Master-spec edits are line-count-neutral.** No lines added or removed — every edit rewrites in place. This keeps every existing `file:line` citation into the master spec valid. The specs README's "3769 lines" note is already false today (the file is 4027 lines at merge-base, rotted independently of this change); it is corrected to 4027 as a same-class one-word hygiene fix.
9. **§12.4 untouched.** No error-code rows change; no `gen:spec-codes` / `lib/messages/catalog.ts` lockstep applies.

---

## 2. Item 1 — dangling-citation strip

### 2.1 Fix rule

For every hard `CITATION_FILE_MISSING` finding naming one of the seven deleted workflow files: rewrite the backticked reference as prose. Style follows the PR #610 precedent already in-tree (lines 61, 70, 142, 290 and 291 of `docs/superpowers/plans/2026-07-26-agenda-perday-viewer-fold.md`): "the retired modal-header-layout-e2e workflow". Rules:

- Strip the backticks and the `.github/workflows/` path prefix; keep the workflow's base name in prose with a "retired" (or "deleted"/"now-deleted") qualifier if the sentence doesn't already carry one.
- Drop colon-suffixed line numbers into prose or omit them — a line citation into a deleted file has no referent. Where the line number carries meaning (a sentence quoting what a specific line of the deleted workflow said), keep it as prose ("line 39 of the retired modal-header workflow said exactly that") with past tense where the sentence now describes history.
- Do not alter sentence meaning; these are shipped historical documents.
- No em-dashes introduced (`COPY_EM_DASH` class); no new backticked file citations introduced.

### 2.2 File inventory (measured, merge-base 2509f1452)

Hard-finding counts from `pnpm spec:lint <file>`; "target" = findings naming a deleted workflow.

| # | File | Hard before | Target | Expected hard after | Residual (left deliberately) |
| --- | --- | --- | --- | --- | --- |
| 1 | `docs/superpowers/plans/2026-07-24-strip-mobile-stacked-band.md` | 10 | 2 (34:12, 352:6) | 8 | 8× COPY_EM_DASH |
| 2 | `docs/superpowers/plans/admin/2026-07-25-destruct-thumb-order-drift-guard.md` | 1 | 1 (102:198) | 0 | — |
| 3 | `docs/superpowers/plans/2026-07-18-modal-header-reconciliation/CLOSE-OUT.md` | 2 | 1 (86:204) | 1 | models_cache.json citation (:125) |
| 4 | `docs/superpowers/specs/2026-07-24-share-link-chrome-backlog-design.md` | 2 | 2 (30:624, 30:1033) | 0 | — |
| 5 | `docs/superpowers/specs/2026-07-24-archive-row-menu-idiom.md` | 1 | 1 (128:1708) | 0 | — |
| 6 | `docs/superpowers/specs/admin/2026-07-25-destruct-thumb-order-drift-guard.md` | 2 | 2 (24:308, 326:88) | 0 | — |
| 7 | `docs/superpowers/plans/2026-07-22-hoverhelp-caret-blur-close.md` | 2 | 1 (20:237) | 1 | context.mjs citation (:1136) |
| 8 | `docs/superpowers/plans/2026-07-24-attention-index.md` | 3 | 2 (269:40, 288:2) | 1 | CITATION_LINE_OUT_OF_RANGE (:286) |
| 9 | `docs/superpowers/specs/2026-07-22-hoverhelp-caret-blur-close.md` | 1 | 1 (30:686) | 0 | — |
| 10 | `docs/superpowers/specs/2026-07-24-hoverhelp-visual-viewport.md` | 2 | 2 (63:8, 251:33) | 0 | — |

**Totals (single source of truth):** **15 target findings across 10 files** (2+1+1+2+1+2+1+2+1+2); expected residual hard findings after the change: 8+0+1+0+0+0+1+1+0+0 = **11**, all non-target classes. Line:offset pairs above are drafting-time locators from the measured lint run; the acceptance check is the per-file assertion, not the offsets.

### 2.3 Acceptance (item 1)

For each of the ten files: `pnpm spec:lint <file>` reports zero `CITATION_FILE_MISSING` findings naming any of the seven deleted workflow basenames, and the file's remaining hard findings exactly match the residual column above (no new findings of any class introduced). Additionally a tree-wide sweep re-run — the same backtick-aware grep over `docs/**/*.md` for all seven basenames, confirmed against `spec:lint` for any hit — reports zero remaining target-class citations.

---

## 3. Item 2 — master-spec financials vocabulary

### 3.1 Decision rules

- **(a) Current-behavior claims** (data model comments, access-control body text, fetch-path descriptions, tile descriptions, AC text): rewrite in place to the admin ∪ LEAD ∪ FINANCIALS entitlement, citing the vocab extension inline where a bare rewrite would look like drift from the v1 ratification: `(FINANCIALS also grants — 2026-07-15 vocab extension)`. Wording may use "financials-entitled (LEAD or FINANCIALS flag, or admin)" to match `financialsEntitled` in `lib/data/getShowForViewer.ts:380`.
- **(b) Historical records** (resolved-questions log, per-milestone demo scripts): the v1-era resolution text stays; append a brief bracketed amendment note so the record reads true today.
- **(c) Line-count-neutral:** every edit stays on its original line(s) (§1.1 item 8).

### 3.2 Edit inventory

The backlog entry's grep seed (`rg -n "financ|shows_internal|FinancialsTile|financialsEntitled|Proposal|Invoice|PO#" <masterspec> | rg -i "LEAD" | rg -v "FINANCIALS"`, final exclude case-sensitive) returns **15 hits** at merge-base. Classification (line numbers are merge-base locators; anchors are the quoted phrases):

**EDIT — rule (a), 9 lines:**

| Line | Anchor phrase | Edit direction |
| --- | --- | --- |
| 23 | "server-side filtered out of non-LEAD views" | "…out of non-financials-entitled views (LEAD or FINANCIALS flag, or admin; 2026-07-15 vocab extension)" |
| 199 | "`financials jsonb, -- LEAD-only:`" | DDL comment → "financials-entitled (LEAD/FINANCIALS/admin):" |
| 640 | "LEAD crew see this table's columns only because" | "Financials-entitled crew (LEAD or FINANCIALS)…" — the sentence's RLS-admin-only claim stays untouched |
| 653 | "it joins only when the freshly-derived role is LEAD (or `viewer.kind === 'admin'`)" | "…when the freshly-derived flags grant financials (LEAD or FINANCIALS, or admin)…"; the same line's "only selects `financials`" and parse_warnings/raw_unrecognized admin-only text stays |
| 1487 | "**LEAD detection.** `role_flags` contains `LEAD` ⇒ user sees `shows_internal.financials`" | "**Financials entitlement.** `role_flags` contains `LEAD` or `FINANCIALS` ⇒ …" |
| 2372 | "has `LEAD` in `role_flags`, OR the viewer is admin → `viewerRole === 'lead'`" | add FINANCIALS to the flag condition; note the financials join keys on entitlement, not the `viewerRole` label |
| 2460 | "LEAD only." (the Financials tile row) | "financials-entitled only (LEAD or FINANCIALS flag, or admin; 2026-07-15 vocab extension)." — the row's existing dash separator stays as-is |
| 3727 | "cannot unlock financials when the bound crew row's role_flags don't include LEAD" | "…don't include LEAD (or FINANCIALS)" |
| 3831 | "AC-5.9 LEAD viewer's response includes … non-LEAD viewer's response omits it" | "financials-entitled viewer's … non-entitled viewer's…" |

**EDIT — rule (b), 2 lines:**

| Line | Anchor phrase | Edit direction |
| --- | --- | --- |
| 3728 | "demote a crew member from LEAD in the sheet … observe Financials tile disappear" | append "[2026-07-15 vocab extension: assumes the member holds no FINANCIALS flag]" |
| 3747 | "~~Should ops fields ever be visible to non-LEAD?~~ Resolved: financials … stay LEAD-only" | append "[Amended 2026-07-15 (extend-role-scope-vocab): the FINANCIALS role flag now also grants; entitlement is LEAD ∪ FINANCIALS ∪ admin.]" |

**NO EDIT, 3 lines:** 193 (false positive — multi-line sentence, "FINANCIALS" sits on line 194; already reconciled by capability-narrow 2026-07-17), 655 ("A non-LEAD crew member querying directly via the Supabase client cannot reach financials" — a true RLS-denial claim, excluded class §1.1 item 6a; direct-query denial is total, so the claim holds a fortiori), 1418 ("`raw_unrecognized` … admin/LEAD-only table per §4.1" — excluded class §1.1 item 6b).

**NO EDIT (4th line):** 657 ("only LEAD sees Invoice Notes; A1 still sees everything else") — inside the v2-candidate hypothetical about *finer* per-field segmentation. It is an illustration of a possible future config, not a current-behavior claim.

**Partition tally (single source of truth):** the seed returns **15 lines** at merge-base — 23, 193, 199, 640, 653, 655, 657, 1418, 1487, 2372, 2460, 3727, 3728, 3747, 3831 — partitioned 9 edit-(a) + 2 edit-(b) + 4 no-edit (193, 655, 657, 1418) = 15. The plan reproduces the seed run and re-pins this partition before editing.

### 3.3 Acceptance (item 2)

1. Re-running the seed on the edited master spec returns **only** the four ratified no-edit lines (193, 655, 657, 1418) — every other hit now names `FINANCIALS` on its own line or no longer matches.
2. `wc -l` on the master spec is unchanged (4027).
3. `pnpm spec:lint` on the master spec introduces **zero new findings of any severity** relative to a merge-base baseline run (edits use plain hyphens/commas, no em-dashes, no new backticked citations).
4. A manual read of §4.1, §4.4, §7.4, §7.5-area prose around each edited line confirms no adjacent sentence still asserts LEAD-only financials via phrasing the seed can't see (e.g. "LEAD" and the financial noun on different lines). Any such stragglers found at plan time join the rule-(a) set with the same treatment.

---

## 4. Out of scope

- The residual non-target lint findings inventoried in §2.2 (four classes, 11 findings).
- `BL-HELP-STRIP-COPYLINK-STALE` (§1.1 item 1) — stays OPEN with its own trigger.
- Any change to `scripts/spec-lint.ts` behavior.
- Wiring `spec:lint` into CI (would need its own backlog entry; today's zero-enforcement state is a known property, not a defect introduced here).
- The other six deleted workflows' *prose* mentions that already pass lint (e.g. ci-dark spec line 230's deletion list).

## 5. Testing / verification posture

Docs-only: the "tests" are the measured acceptance checks in §2.3 and §3.3, executed as before/after `spec:lint` runs plus the seed grep, with outputs recorded in the PR body. Additionally the standard repo gates run pre-push: full `pnpm test` (docs meta-tests — graduation ledger, invariant-8 closeout markers, README indexes — are the relevant subset), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`. Ledger graduation (measured convention, `tests/docs/_metaDeferralLedgerGraduation.test.ts`): both closed entries MOVE from BACKLOG.md's open queue to `BACKLOG-archive.md` with a close-out note containing the provenance branch string `docs/citation-rot-financials-vocab`; a `{ id, provenance }` row is appended to `BACKLOG_GRADUATED` in that meta-test for each; BACKLOG.md's "Last reconciled" header line gains this pass. (This makes the branch not strictly `docs/**`-only — it also edits one test registry file, which is the graduation convention's own requirement.) The deferred item 3 entry stays untouched. New-spec obligations: this file lives at specs root (the `tests/docs/specsReadmeIndexParity.test.ts` guard covers only subsystem folders with an Entry/Date index table; root-level precedent: `docs/superpowers/specs/2026-07-24-share-link-chrome-backlog-design.md`) — discovery is via the BACKLOG graduation notes, which cite this spec. `docs/superpowers/specs/README.md` changes only its stale "3769 lines" master-spec note (per §1.1 item 8). The plan doc will carry `impeccable-gate: N/A — no UI surface`.

## 6. Dimensional Invariants

N/A — docs-only change; no component, layout, or rendered surface is touched. (Heading present to satisfy the spec-lint structural check.)

## 7. Transition Inventory

N/A — docs-only change; no visual states exist. (Heading present to satisfy the spec-lint structural check.)

## 8. Documented limits

- The tree-wide sweep guards the seven names deleted by c7c5625c2 only. Future workflow deletions can mint new dangling citations; that is the (unscheduled) general case of `spec:lint` enforcement, out of scope (§4).
- The seed grep is line-based; §3.3 item 4 is the compensating manual pass for multi-line phrasing. Its coverage is the four §4-area sections named there, not the whole 4027-line file.
