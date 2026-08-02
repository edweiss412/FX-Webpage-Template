# Docs hygiene — retired-workflow citation rot + master-spec financials vocabulary

**Date:** 2026-08-02
**Backlog items:** `BL-DANGLING-CITATIONS-RETIRED-WORKFLOW` (BACKLOG.md §"BL-DANGLING-CITATIONS-RETIRED-WORKFLOW"), `BL-MASTERSPEC-FINANCIALS-VOCAB` (BACKLOG.md §"BL-MASTERSPEC-FINANCIALS-VOCAB"). `BL-HELP-STRIP-COPYLINK-STALE` was evaluated and **deferred** (§1.1).
**Class:** docs-only. No app code, no DB, no UI surface, no §12.4 rows.
**Verification ground truth:** `pnpm spec:lint` per-file deltas + the backlog entry's grep seed. Every count below was measured live on this branch's merge-base (2509f1452), not copied from the backlog entry — the 2026-07-24 sweep-status warning (BACKLOG.md §"Sweep status (2026-07-24/25)") was applied and it mattered: two of the entry's claims were stale (§1.1 items 4 and 5).

---

## 1. Scope

Two changes, one docs-only branch:

1. **Item 1 — strip dangling citations to deleted e2e workflows.** `origin/main` (c7c5625c2, ratified by `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md` — its deletion list is at line 230 of that file) deleted seven per-feature e2e workflows. Backticked references to those `.yml` paths parse as citations to `spec:lint` (`scripts/spec-lint.ts`) and hard-fail `CITATION_FILE_MISSING`. Fix: render each reference as prose, PR #610 style ("the retired modal-header-layout-e2e workflow"). The linter keys on the backticked `.yml` extension; a backticked bare filename does NOT clear it (measured: the modal-header CLOSE-OUT doc, file 3 in §2.2, fails at its line 86 on the bare backticked filename with no directory prefix).
2. **Item 2 — reconcile master-spec financials-access prose.** The `FINANCIALS` role flag (`docs/superpowers/specs/admin/2026-07-15-extend-role-scope-vocab.md`) grants financials access alongside `LEAD` and admin, but 14 master-spec prose claims still say LEAD-only: 11 of the 15 grep-seed hits (4 are ratified exclusions) plus 3 seed-blind instances found by the §3.2 window probe. Live code verified 2026-08-02: `lib/data/getShowForViewer.ts:375-380` (`isLead = isAdmin || derivedFlags.includes("LEAD")`; `financialsEntitled = isLead || derivedFlags.includes("FINANCIALS")`) and `lib/visibility/scopeTiles.ts:141` (`financialsVisible = isAdmin || flags.includes("LEAD") || flags.includes("FINANCIALS")`). Reconcile every stale claim to the entitlement set **admin ∪ LEAD ∪ FINANCIALS**.

### 1.1 Resolved scope — do not relitigate

1. **`BL-HELP-STRIP-COPYLINK-STALE` is DEFERRED, not forgotten.** The entry's own trigger says "the next help pass, which can own the regeneration" (BACKLOG.md, entry body). Including it would (a) touch `app/help/admin/per-show-panel/page.mdx` — a UI surface per AGENTS.md invariant 8, requiring the impeccable dual-gate; (b) pull in the help prose-pinning test surface (`tests/help/page-per-show-panel.test.tsx`, `tests/help/sheetChangesCopy.test.ts`, affordance-matrix meta-tests); and (c) convert a docs-only branch into an app branch needing preflight. Both stale claims were re-verified live (`page.mdx:7` "the copy-link for the crew URL" in the status strip; `page.mdx:30` "between the sync line and the copy-link button") — the entry is accurate and stays OPEN.
2. **Class-sweep widening is mandated, not scope creep.** AGENTS.md §"Class-sweep before patching adversarial findings" requires sweeping the bug SHAPE, not the named instance. The entry names only the modal-header workflow; the same shape (backticked citation to any of the seven deleted workflows) was swept across `docs/` and found in four additional files (attention-anchor, hoverhelp-geometry). All ten files are in scope. The sweep covered all seven deleted names: attention-anchor-e2e, attention-pill-focus-e2e, bulk-ignore-eyebrow-e2e, destructive-layout-e2e, hoverhelp-geometry-e2e, modal-header-layout-e2e, share-link-flash-e2e.
3. **Acceptance is target-class zero, not file-wide zero.** Residual hard findings of OTHER classes in touched files are deliberately left (inventory in §2.2): 8× `COPY_EM_DASH` in the strip-mobile plan (quoted UI copy in a shipped historical plan), 1× citation of the untracked codex models-cache JSON path (CLOSE-OUT doc line 125), 1× `CITATION_MALFORMED` empty-path ":root" token (CLOSE-OUT doc line 28), 1× citation of the impeccable context script by bare name (caret-blur plan line 1136), 1× `CITATION_LINE_OUT_OF_RANGE` (attention-index plan line 286) — 12 findings, five classes. Different classes; fixing them here would be the drip-feed anti-pattern in reverse — unrelated edits widening an in-review diff. `spec:lint` is not wired into any workflow (verified: no `.github/workflows/**` match), so nothing is merge-blocked by leaving them.
4. **The retiring spec needs NO edit — backlog entry claim corrected.** The entry says "the last entry is the retiring spec itself, where the old name is legitimate history." Measured: the retiring spec is `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md` (second-to-last in the entry's list, not last), and it already renders every deleted-workflow name as plain prose — `spec:lint` reports **0 hard** on it. No edit. The entry's list is also stale the other way: it omits nothing that fails, but two files it lists as needing work carry additional non-target findings (§2.2).
5. **Fenced-code-block occurrences stay.** Lines 355 and 375 of `docs/superpowers/plans/2026-07-24-strip-mobile-stacked-band.md` name the deleted workflow inside fenced command blocks (historical task commands). `spec:lint` does not parse citations inside fenced blocks (measured: those lines produce no finding). Rewriting shipped-plan command history has negative value. Untouched.
6. **Item 2 exclusions are the entry's own, ratified here.** (a) RLS-admin-only denial claims stay (the RLS layer really is admin-only; `FINANCIALS` entitlement is applied server-side by the service-role fetch path). (b) `raw_unrecognized` / `parse_warnings` access claims stay admin/LEAD-only — `FINANCIALS` grants only the `financials` column (master spec :653 already states `only selects financials`). (c) The §6.8 MI-9 claim was already corrected by the capability-narrow change (2026-07-17) — measured: master spec :190-195 already reads "LEAD OR FINANCIALS" and cites `BL-MASTERSPEC-FINANCIALS-VOCAB`.
7. **No master-spec-patches/ entry.** The semantics were ratified by `2026-07-15-extend-role-scope-vocab.md`; this change is prose reconciliation to an already-ratified amendment, recorded by this spec and inline `(… — 2026-07-15 vocab extension)` markers, not a new ratification. The patch-doc convention (`docs/superpowers/specs/README.md` §"Master-spec patches") is for edits that *change* contract content.
8. **Master-spec edits are line-count-neutral.** No lines added or removed — every edit rewrites in place. This keeps every existing `file:line` citation into the master spec valid. The specs README's "3769 lines" note is already false today (the file is 4027 lines at merge-base, rotted independently of this change); it is corrected to 4027 as a same-class one-word hygiene fix.
9. **§12.4 untouched.** No error-code rows change; no `gen:spec-codes` / `lib/messages/catalog.ts` lockstep applies.
10. **The `ROLE_FLAGS_NOTICE` helpfulContext over-grant (master :3356) is DEFERRED to its own backlog row, not fixed here.** Spec review R2 finding 3 (confirmed by probe): the §12.4 catalog copy says LEAD or FINANCIALS are "the roles that unlock internal financials and admin access", but FINANCIALS unlocks financials only — LEAD alone additionally grants the admin/ops surface (master :1627; vocab authority Effect row). Fixing it is a §12.4 catalog-row copy edit, which requires the three-way lockstep (§12.4 prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts`, same commit — AGENTS.md cross-cutting rule) and touches the frozen helpfulContext byte-parity contract (BL-CARD-COPY-HELPFULCONTEXT-PARITY graduation, 2026-08-01) — app-code fan-out that item 9 of this section keeps out of this docs branch. The plan's graduation task (Task 3 in the plan's final numbering) files it as a new BACKLOG row (`BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT`) so it is owned, not silenced. It is also structurally invisible to both §3 probes by design (the line names all-caps FINANCIALS), which is recorded in Documented limits.

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
| 3 | `docs/superpowers/plans/2026-07-18-modal-header-reconciliation/CLOSE-OUT.md` | 3 | 1 (86:204) | 2 | models-cache citation (:125); CITATION_MALFORMED empty-path ":root" token (:28) |
| 4 | `docs/superpowers/specs/2026-07-24-share-link-chrome-backlog-design.md` | 2 | 2 (30:624, 30:1033) | 0 | — |
| 5 | `docs/superpowers/specs/2026-07-24-archive-row-menu-idiom.md` | 1 | 1 (128:1708) | 0 | — |
| 6 | `docs/superpowers/specs/admin/2026-07-25-destruct-thumb-order-drift-guard.md` | 2 | 2 (24:308, 326:88) | 0 | — |
| 7 | `docs/superpowers/plans/2026-07-22-hoverhelp-caret-blur-close.md` | 2 | 1 (20:237) | 1 | context.mjs citation (:1136) |
| 8 | `docs/superpowers/plans/2026-07-24-attention-index.md` | 3 | 2 (269:40, 288:2) | 1 | CITATION_LINE_OUT_OF_RANGE (:286) |
| 9 | `docs/superpowers/specs/2026-07-22-hoverhelp-caret-blur-close.md` | 1 | 1 (30:686) | 0 | — |
| 10 | `docs/superpowers/specs/2026-07-24-hoverhelp-visual-viewport.md` | 2 | 2 (63:8, 251:33) | 0 | — |

**Totals (single source of truth):** **15 target findings across 10 files** (2+1+1+2+1+2+1+2+1+2); expected residual hard findings after the change: 8+0+2+0+0+0+1+1+0+0 = **12**, all non-target classes. (Plan review R1 finding 2 corrected an earlier residual of 11: the CLOSE-OUT baseline was captured through a narrow grep filter that hid its `CITATION_MALFORMED` finding at :28 — the re-measured unfiltered baseline for all ten files is the committed plan artifact.) Line:offset pairs above are drafting-time locators from the measured lint run; the acceptance check is the per-file assertion, not the offsets.

### 2.3 Acceptance (item 1)

1. For each of the ten files: `pnpm spec:lint <file>` reports zero `CITATION_FILE_MISSING` findings naming any of the seven deleted workflow basenames, and the file's remaining hard findings exactly match the residual column above.
2. **All-severity delta (R1 finding 4):** before editing, capture each file's full `spec:lint` finding list (hard AND advisory); after editing, the list is identical except for the removed target-class findings — no new finding of any severity is introduced.
3. **Tree-wide class sweep, explicit command (R1 finding 3):**

   ```sh
   for n in attention-anchor-e2e attention-pill-focus-e2e bulk-ignore-eyebrow-e2e \
            destructive-layout-e2e hoverhelp-geometry-e2e modal-header-layout-e2e \
            share-link-flash-e2e; do
     rg -n --glob 'docs/**/*.md' "\`[^\`]*${n}\.yml" docs/
   done
   ```

   The backtick-spanning pattern over-approximates (a match may open its backtick earlier on the line), so every hit is confirmed against `spec:lint` — the citation parser is ground truth. Acceptance: the command's confirmed target-class hit set is empty.

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
| 640 | "LEAD crew see this table's columns only because" | "Financials-entitled crew (LEAD or FINANCIALS) see this table's `financials` column only because…" — COLUMN-scoped, not table-scoped: the flag "enables only the financials read, nothing else" per the vocab authority's Effect row, and parse_warnings/raw_unrecognized stay admin/LEAD paths (§1.1 item 6b). The sentence's RLS-admin-only claim stays untouched |
| 653 | THREE stale clauses on one line: "the LEAD-aware fetch helper"; "it joins only when the freshly-derived role is LEAD (or `viewer.kind === 'admin'`)"; "For non-LEAD viewers, it does not query" | All three rewritten (plan Task 2 pins the full line): "the entitlement-aware fetch helper"; "…when the freshly-derived flags grant financials (LEAD or FINANCIALS, or admin; 2026-07-15 vocab extension)…"; "For non-entitled viewers, it does not query…". The line's "only selects `financials`" and parse_warnings/raw_unrecognized admin-only text stays (plan review R1 finding 4: single-clause edits would leave stale clauses probe-blinded once the line names FINANCIALS) |
| 1487 | "**LEAD detection.** `role_flags` contains `LEAD` ⇒ user sees `shows_internal.financials`" | "**Financials entitlement.** `role_flags` contains `LEAD` or `FINANCIALS` ⇒ …" |
| 2372 | "has `LEAD` in `role_flags`, OR the viewer is admin → `viewerRole === 'lead'`" | "has `LEAD` or `FINANCIALS` in `role_flags`, OR the viewer is admin: financials-entitled (2026-07-15 vocab extension)" — the `viewerRole === 'lead'` pseudo-label is dropped; no such variable exists in the live fetch path (`financialsEntitled` is the live mechanism, `lib/data/getShowForViewer.ts:380`), and the next line's "Otherwise:" reads correctly against the entitlement condition |
| 2460 | TWO stale clauses: "LEAD only." and "Hidden entirely for non-LEAD (omitted from data fetch…)" | "financials-entitled only (LEAD or FINANCIALS flag, or admin; 2026-07-15 vocab extension)." and "Hidden entirely for non-entitled viewers (omitted from data fetch…)" — the row's existing dash separator stays as-is |
| 3727 | "cannot unlock financials when the bound crew row's role_flags don't include LEAD" | "…don't include LEAD (or FINANCIALS)" |
| 3831 | "AC-5.9 LEAD viewer's response includes … non-LEAD viewer's response omits it" | "financials-entitled viewer's … non-entitled viewer's…" |

**EDIT — rule (b), 2 lines:**

| Line | Anchor phrase | Edit direction |
| --- | --- | --- |
| 3728 | "demote a crew member from LEAD in the sheet … observe Financials tile disappear" | append "[2026-07-15 vocab extension: assumes the member holds no FINANCIALS flag]" |
| 3747 | "~~Should ops fields ever be visible to non-LEAD?~~ Resolved: financials … stay LEAD-only" | append "[Amended 2026-07-15 (extend-role-scope-vocab): the FINANCIALS role flag now also grants; entitlement is LEAD ∪ FINANCIALS ∪ admin.]" |

**NO EDIT, 3 lines:** 193 (false positive — multi-line sentence, "FINANCIALS" sits on line 194; already reconciled by capability-narrow 2026-07-17), 655 ("A non-LEAD crew member querying directly via the Supabase client cannot reach financials" — a true RLS-denial claim, excluded class §1.1 item 6a; direct-query denial is total, so the claim holds a fortiori), 1418 ("`raw_unrecognized` … admin/LEAD-only table per §4.1" — excluded class §1.1 item 6b).

**NO EDIT (4th line):** 657 ("only LEAD sees Invoice Notes; A1 still sees everything else") — inside the v2-candidate hypothetical about *finer* per-field segmentation. It is an illustration of a possible future config, not a current-behavior claim.

**Partition tally (single source of truth):** the seed returns **15 lines** at merge-base — 23, 193, 199, 640, 653, 655, 657, 1418, 1487, 2372, 2460, 3727, 3728, 3747, 3831 — partitioned 9 edit-(a) + 2 edit-(b) + 4 no-edit (193, 655, 657, 1418) = 15. With the window-probe additions below, the full edit set is **14 claims: 11 rule-(a) + 3 rule-(b)**. The plan reproduces both probes and re-pins this partition before editing.

### 3.2.1 Seed-blind instances (window probe — spec review R1 finding 2, class-swept to closure)

The seed is line-based and case-sensitive on its first stage, so it structurally misses (i) claims split across lines and (ii) lines whose only financial token is capitalized ("Financials tile"). A whole-file window probe closes the class: every line matching `\bLEAD\b|\blead\b|\bLead\b` with a line matching `financ|invoice|proposal|po#|shows_internal|financials|\bops\b` (case-insensitive) within ±2 lines, excluding ONLY (a) lines already naming all-caps `FINANCIALS` and (b) a 12-line ratified no-edit list: the 8 non-claims below plus the 4 seed no-edit lines. **The edit-site lines are NOT in the exclusion list** — that is what makes the probe a real red/green check (spec review R2 finding 2: an earlier revision pre-exempted the edit sites, so it could not detect a missed edit). Measured pre-edit: the probe returns exactly the **14 edit-site lines** (23, 178, 199, 632, 640, 653, 1487, 2372, 2460, 3727, 3728, 3747, 3831, 3832 — line 177 pairs with 178 as one claim and carries no LEAD token itself); post-edit it must return **zero**. The probe's exact script and measured output live in the plan (Task 2).

**EDIT — additions:**

| Line(s) | Anchor phrase | Rule | Edit direction |
| --- | --- | --- | --- |
| 177-178 | DDL comment "the financial fields (PO#, Proposal $, Invoice, Invoice Notes) are / LEAD-gated" | (a) | "…are / gated on financials entitlement (LEAD or FINANCIALS flag, or admin); COI is now public…" — edit stays on line 178 |
| 632 | "the page renders all of `ops` for a LEAD or none of it for a non-LEAD" | (a) | "…all of `ops` for a financials-entitled viewer (LEAD or FINANCIALS, or admin) or none of it otherwise" — semantically exact: `ops` holds the financial fields only; COI is NOT in `ops` (master :199 "COI moved to shows.coi_status", :1186 "The COI value … is written separately to `shows.coi_status`"), refuting spec review R2 finding 1 (see Review log) |
| 3832 | AC-5.10 "Demote a crew member from LEAD to A1 … Financials tile disappears" | (b) | append "[2026-07-15 vocab extension: assumes the member holds no FINANCIALS flag]" — same treatment as line 3728 |

**NO EDIT — window-probe non-claims (recorded so review R2 does not re-derive them):** 221 (verbatim sheet role-string example), 1715 (MI auth-floor table row, no entitlement claim), 2076 (counterfactual rationale for why the token carries no role claim — a hypothetical bad design, not a current-behavior claim; holds regardless of which flags grant), 2449 (Lighting tile amendment, not financials), 2451 (generic role-flag predicate definitions), 2733 (generic role-change re-fetch row), 2865 (retired MI-9 staging-code row), 3805 (AC-4.2: a seeded-LEAD viewer DOES see the tile — inclusive claim, true under the extended vocabulary).

### 3.3 Acceptance (item 2)

1. Re-running the seed on the edited master spec returns **only** the four ratified no-edit lines (193, 655, 657, 1418) — every other hit now names `FINANCIALS` on its own line or no longer matches. Re-running the §3.2.1 window probe (exact script in the plan; exclusion list = the 12 ratified no-edit lines only, never the edit sites) returns **zero hits** — pre-edit it returns exactly the 14 edit-site lines, so an omitted or still-stale edit keeps the probe red. Line numbers are stable because edits are line-count-neutral.
2. `wc -l` on the master spec is unchanged (4027).
3. `pnpm spec:lint` on the master spec introduces **zero new findings of any severity** relative to a merge-base baseline run (edits use plain hyphens/commas, no em-dashes, no new backticked citations).
4. A manual read of §4.1, §4.4, §7.4, §7.5-area prose around each edited line confirms no adjacent sentence still asserts LEAD-only financials via phrasing the seed can't see (e.g. "LEAD" and the financial noun on different lines). Any such stragglers found at plan time join the rule-(a) set with the same treatment.

---

## 4. Out of scope

- The residual non-target lint findings inventoried in §2.2 (five classes, 12 findings).
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
- Both §3 probes exclude lines naming all-caps `FINANCIALS` by design, so a line that names the flag but claims too MUCH for it is invisible to them. That category was swept once manually at review R2 (reviewer sweep + author confirmation): sole instance is master :3356, deferred per §1.1 item 10. Future edits in that category have no standing probe; the residual risk is accepted for this docs pass.

## 9. Review log (round economy — refuted claims recorded so they are not re-derived)

- **R1 (NEEDS-ATTENTION, 4 findings):** all four accepted and repaired — line-640 column scoping, §3.2.1 seed-blind additions + window probe, explicit §2.3 sweep command, §2.3 all-severity delta.
- **R2 (NEEDS-ATTENTION, 3 findings):** F1 (line-632 "ops includes COI") **REFUTED by probe** — COI is not in `ops`: master :199 ("COI moved to shows.coi_status because it's operational, not financial"), :1186 ("The COI value parsed from the same template block is written separately to `shows.coi_status`"); the reviewer's cited :629 lists the JSONB columns without COI membership. Edit direction unchanged; a preempt note added to the §3.2.1 row. F2 (self-blinded probe) **ACCEPTED** — probe redefined to discovery mode (exclusions = 12 ratified no-edit lines only; pre-edit 14 hits, post-edit 0) and the stale "within 2 of a seed hit" description removed. F3 (:3356 helpfulContext over-grant) **ACCEPTED as deferral** — §1.1 item 10; new backlog row filed by the plan's graduation task (Task 3).
