# Backlog convergence — implementation plan

**Spec:** `docs/superpowers/specs/2026-08-04-backlog-convergence-design.md` (APPROVE at spec review R3, `424a30c21`). **Arc:** `chore/backlog-convergence` + three follow-on sweep branches + one out-of-repo work item. **Implementer:** new Opus pane (user-ratified routing, spec §1.1 item 6); this plan is authored in the Fable spec/plan pane.

## 1. Branch map

| Unit | Branch / venue | Contents |
|---|---|---|
| A + B (repo) | `chore/backlog-convergence` (this branch, already carries spec + claims) | Tasks 1–8 below; PR 1 |
| B (mdview) | no branch — `~/bin/mdview` on this machine | Task 9; after PR 1 merges (parity oracle needs `ledger:mass`) |
| C-ui | `feat/sweep-ui-a11y` | Tasks 10–14; impeccable dual-gate branch |
| C-guards | `chore/sweep-guards-tests` | Tasks 15–21 |
| C-docs | `docs/sweep-comment-drift` | Tasks 22–23 |
| C-x5 | `docs/x5-decided-by-boundary` | Task 24 (dedicated per spec §4.5 item 5) |

Every branch: worktree off `origin/main` (invariant 11), `pnpm install` + `pnpm worktree:link-env` + `pnpm preflight`; Stage 0 runs `pnpm ledger:claims --check <its ids>`, marks, commits, **pushes immediately**; markers come off in the PR's last commit (invariant 12 as amended); prettier before push; real CI green; `gh pr merge --merge`; ff-sync main and verify `0 0`. Branches C-ui/C-guards/C-docs/C-x5 are sequential after PR 1 (each pool id's route may have been changed by Unit A's probe outcomes).

## 2. Spec acceptance criteria (restated for task references)

From spec §7: **AC-A1** (filing-bar bullet + lint disposition + three seeded dispositions executed), **AC-A2** (semantic-screen table covers every open entry), **AC-B1** (`ledger:mass` fixture oracle 306/15/321, `--json` round-trip, `--at 8d78cdf13`, planted `severity-unrecognized`), **AC-B2** (sizing guard fails-by-name on planted unsized entry, passes real tree with 42-id grandfather registry), **AC-B3** (mdview mass-revision full-envelope parity + checklist + `.bak`), **AC-C1** (every pool id dispositioned), **AC-C2** (per-branch claim hygiene), **AC-PROG** (mass < 321, canonical count < 110 at arc close).

## 3. Meta-test inventory (spec §6)

CREATES `tests/docs/_metaLedgerSizing.test.ts` + `tests/docs/_ledgerSizingGrandfather.ts`. EXTENDS none. Registry rows: Supabase/admin N/A (no such surfaces); mutation-guard registry — deliberate non-enrollment of the sizing guard (spec §3.3), EXCEPT Task 17 retires the two `BL-TASKCONTRACT-SORT-COMPARATOR-EQUALKEY` `accepted-gap` rows in `tests/mutation/source/registry.ts` (rows at `registry.ts:239` region) as their mutants become killable — the gate reports stale rows, so retirement is part of that task's green.

## 4. Semantic-screen disposition table (AC-A2 — authored AND run, 2026-08-04)

Screen executed by two readers over every open entry; lexical screen command + output are in spec §2.2. Canonical census 110; readers covered 95 rows at entry depth (48 top-level read + 47 nested/DEFERRED read) and surfaced two census artifacts, reconciled below. Counts: top-level a=42 b=5 c=1; nested+DEFERRED a=39 b=7 c=1.

**(b)/(c) hits and their dispositions** (a-class = probe-backed, KEEP, listed at the end):

| Entry | Class | Disposition |
|---|---|---|
| BL-CAPABILITY-LOSS-SURVIVING-ROW-FALSE-POSITIVE | b | Unit A seeded probe — Task 4 |
| BL-LEDGER-DISCOVERY-FAMILY-SCOPED | b | entry self-fences ("not currently live", exactly four files) — DOCUMENTED-LIMIT demotion candidate, Task 5 executes the §2.2 three-way call |
| BL-CI-PARALLEL-DB-FALLBACK-AUDIT | b | audit-not-yet-run entry: the INFERRED escape hatch applies — stays, probe named as first step (annotation only, Task 5) |
| BL-WATCH-PROMOTION-ACTIVATION-RACE | b | race asserted with no probe — Task 5 three-way call (probe cost is a READ COMMITTED demo; if infeasible, demote to spec limits) |
| BL-FITWITHINCLIP-CLIP-SCROLL-STALE | b | "not reachable on today's surfaces" — Task 5 three-way call; if kept, C-guards Task 19 |
| BL-LEDGER-MDAST-SHARED-HOME | c | present-vs-conditional wording — Task 5 reads `scripts/**` consumers and settles it |
| BL-PICKER-LOCK-ICON-LUCIDIFY | b | PREREQ-FENCED (spec §4.2) + Task 5 probe-or-fence record |
| BL-IDENTITYCHIP-SUB390-COLLISION | b | PREREQ-FENCED + Task 5 record; 320px probe named |
| BL-IDENTITYCHIP-SR-SEPARATOR | b | Task 5 three-way; if kept, C-ui Task 12 |
| BL-TERMINAL-FAILURE-ICON | b | Task 5 three-way; if kept, C-ui Task 13 |
| BL-RATE-LIMIT-SNAPSHOT-DURABILITY | b | trigger "observed real flakiness" never observed — Task 5 three-way call |
| BL-HELP-UI-LABEL-CROSSWALK-EXACT-MATCH | b | self-declared "hardening, not a live bug" — Task 5 three-way call |
| DESTRUCT-ARM-ANNOUNCE-1 | b | asserted SR behavior, no AT probe — Task 5 three-way call |
| VOICEOVER-ANNOUNCER-SPOTCHECK | c | owner-action probe pending, no finding asserted — stays as owner action, annotated |

**Census artifacts reconciled:** `## BL-NULLCODE-STAMP-BATCH-2 residuals` and `## Merged from the plans backlog` are container headings, not double-counted; `DESTRUCT-DURATION-TOKENS-1` body says "UPDATE 2026-07-27: fixed" while still queued → graduation in Task 22; DEFERRED's `## Undo announcement channel` section sits at `##` depth where the DEFERRED walker (levels `[3]`) cannot see it → normalization in Task 6.

**a-class KEEP ids (top-level):** BL-CODE-ENUM-PROVENANCE-COMMENT-BLIND BL-SHADOW-REBUILD-EXHAUSTED-EMIT-PLACEMENT BL-ROLEFLAGSNOTICE-DROP-GUARD BL-LEDGER-BODY-DEFINED-ID-OVERMINT BL-TASK-ENROLLMENT-SINGLE-DEPTH BL-COVERAGE-CLAIMS-CITE-SKIPPED-SUITES BL-WARNING-SCAN-SCOPE-HAS-NO-ANCHOR BL-FRESHNESS-ABORTED-CLOSE-E2E BL-FRESHNESS-PROJECTION-NARROWING BL-SOURCE-ANCHORS-STALE-AFTER-FAILED-GID-FETCH BL-PG-CRON-HOST-ASSERTION BL-RESYNC-STAGED-REVIEW-UI BL-STEP3-FULL-CREW-PREVIEW BL-CATALOG-PARTITION-WARNING-CLASS BL-HEADER-REACT-RECONCILE-HARNESS BL-ADOPTION-PIN-REACHABILITY-BLIND BL-POPOVER-REGISTRY-PER-FILE-AND-TAILWIND-ONLY BL-CI-OVERLAP-BOOT-WITH-SETUP BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT BL-CI-RECLASSIFY-PARALLEL-STABILITY BL-REALTIME-BROADCAST-FRAME-DROP-WATCH BL-PG-CRON-COVERAGE-UNRUN BL-SERVER-ACTION-ORIGIN-GATE BL-E2E-COVERAGE-SCANNER-EXCLUSION-FILTERS BL-TELEMETRY-FALLBACK-RETRY BL-PICKER-CLEANUP-REVALIDATE-QUERY-VARIANT BL-DEV-GATE-GALLERY-SPEC-ROT BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS BL-CAPABILITY-MATRIX-FINANCIALS-PREDICATE BL-BELLPANEL-DISMISS-COMMENT-DRIFT BL-RESYNC-REGRESSED-JUMP-LINK BL-E2E-LIFECYCLE-SPECS-CI-DARK BL-E2E-LAYOUT-FIXED-WAIT-RESIDUE BL-RESOLVE-INTENT-WRONG-VERB BL-FITWITHINCLIP-DOUBLE-MOUNT-MEASURE BL-FITWITHINCLIP-DOUBLE-ANCESTOR-WALK BL-ADMIN-SEMANTIC-Z-INDEX-SCALE BL-ATTENTION-PANEL-NAME-LEADING-SECTION BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED BL-AUTH-INTERSTITIAL-FONT BL-HARNESS-FONT-FIDELITY

**a-class KEEP ids (nested + DEFERRED):** BL-OPS-LOG BL-PUSH-NOTIFICATIONS BL-X5-ROLE-TOKEN-DECIDED-BY-BOUNDARY BL-PRIVATE-IMAGE-PIPELINE BL-ADMIN-DASHBOARD-ROW-ACTIONS BL-ADMIN-PER-SHOW-HISTORY BL-HELP-NON-SHOW-REPORT-SURFACE BL-TWO-WAY-SHEET-SYNC BL-NON-CREW-UNDO BL-FEED-BUTTON-SUCCESS-ANNOUNCE BL-BULK-UNDO-ANNOUNCE-UNMOUNT BL-ANNOUNCE-REGION-UNMOUNT-CLASS BL-EM-DASH-POLICY BL-CANONICAL-CLASS-ARRAY-BLINDSPOT BL-ACCENT-BUTTON-ATOM-SWEEP BL-CREW-SHEET-TEMPLATE-V2 BL-CREW-FIELD-ENRICHMENT BL-CREW-AGENDA-ADMIN-CLEAR BL-LIBDATA-SUPABASE-CALL-BOUNDARY-METATEST BL-ADMIN-BADGE-CONTRAST-TOKEN BL-PROJECTION-ALERT-VIEWER-INDEPENDENT-PROBE BL-CREW-PII-DB-LOCKDOWN BL-FLIGHT-LEG-ORIENTATION BL-CREW-UNKNOWN-ASTERISK-TODAY-DATES BL-CI-UNIT-GATE-EXCLUSIONS BL-ADMIN-NAV-BADGE-SUSPENSE-STREAMING BL-RESURRECT-MOBILE-SAFARI-E2E PSQL-GUARD-RECALL-RESIDUAL STEP3-GALLERY-TAP-TARGETS-1 NEWTAB-GUARD-UNDECIDABLE-2 NEWTAB-A11Y-RESIDUE-1 SHARELINK-COPY-REF-ORDERING-PROOF SHARELINK-CUE-VISIBILITY-1 SHARELINK-CUE-FORCED-COLORS-1 SHARELINK-CONSTANTS-INVENTORY-1 ATTENTION-INDEX-JUMP-FOCUS-1 ATTENTION-INDEX-ROW-DESTINATION-NAME-1 DESTRUCT-FOCUSRING-1 SHEETLINK-SUBTLE-ACTION-CLASS-1 (+ remaining unlisted screened rows: BL-NULLCODE-STAMP-BATCH-2 children and section rows per reader notes)

## 5. Tasks

<!-- tasks: depth=2 -->

## Task 1 — AGENTS.md filing-bar bullet

<!-- task: red=`rg -q 'Ledger filing bar \(2026-08-04\)' AGENTS.md` ac=AC-A1 -->

Add the spec §2.1 bullet to AGENTS.md "Cross-cutting discipline", after the class-sweep bullet. Red command fails before the edit (string absent), passes after. Failure mode caught: the policy existing only in the spec, invisible to future filers reading AGENTS.md.

## Task 2 — demote PSQL-GUARD-RECALL-RESIDUAL

<!-- task: red=`rg -q 'Documented limits' tests/cross-cutting/psqlStartupFiles/scan.ts && rg -q 'PSQL-GUARD-RECALL-RESIDUAL' DEFERRED-archive.md` ac=AC-A1 -->

Per spec §2.2: move the three probe-backed limits (verbatim, with un-defer triggers) into a "Documented limits" header block in `tests/cross-cutting/psqlStartupFiles/scan.ts` (RATIFIED-SCOPE-header precedent: `tests/docs/_ledgerMdast.ts`); archive the entry to `DEFERRED-archive.md` with pointer. Ledger tests (`tests/docs/`) stay green. Failure mode caught: silent deletion of a probed limit.

## Task 3 — demote NEWTAB-GUARD-UNDECIDABLE-2

<!-- task: red=`rg -q 'NEWTAB-GUARD-UNDECIDABLE-2' DEFERRED-archive.md` ac=AC-A1 -->

Archive with pointer to `docs/superpowers/specs/2026-07-25-newtab-announcement-family.md` §6.4; append the one-line fix note there if absent (spec §2.2). Failure mode: the duplicate row resurrecting relitigation of a ratified limit.

## Task 4 — CAP-LOSS reachability probe

<!-- task: red=`pnpm vitest run tests/sync/capabilityLossReachability.probe.test.ts` ac=AC-A1 -->

Per spec §2.2 row 3: a vitest probe over `lib/sync/holds/holdAwareApply.ts` exercising EVERY hold kind, asserting for each whether a surviving-but-unlisted row (in `heldNames` via the unconditional add, absent from `protectedNames`' branch-gated adds) can reach `capabilityRoleChangesForNotice` arm (c). Fixture-driven, not mocked-only: drive `holdAwareApply` itself. Outcome A (no hold kind produces the shape): archive entry as unreachable with the transcript. Outcome B: entry stays, marker cleared, body upgraded with evidence + re-size. Anti-tautology: the probe asserts on arm (c)'s OUTPUT for a constructed surviving row, not on function-called. Failure mode caught: closing (or keeping) the entry on inference instead of evidence.

## Task 5 — semantic-screen dispositions (b/c rows)

<!-- task: red=`rg -q 'screen-disposition 2026-08-04' BACKLOG.md` ac=AC-A2 -->

Execute the §4-table three-way calls for every (b)/(c) row not covered by Tasks 2–4: run the named cheap probe where one exists; then per row: KEEP-with-evidence (annotate entry, stamp `screen-disposition 2026-08-04: kept — <probe>`), DEMOTE (limits record + archive, same shape as Tasks 2–3), or ANNOTATE-INFERRED (add the `**Reachability:** INFERRED, NOT PROBED` field + named probe per the new filing bar). Every row's disposition lands in the entry itself and in the PR body. Failure mode caught: the screen finding hypotheticals and nothing changing.

## Task 6 — normalize the invisible DEFERRED section

<!-- task: red=`pnpm vitest run tests/scripts/ledgerFields.test.ts -t 'exact entry sets'` ac=AC-A2 -->

Re-head DEFERRED.md's `## Undo announcement channel` block's three findings to `###` entries (walker levels `[3]`) so claims/sizing tooling can see them; update `tests/scripts/ledgerFields.test.ts`'s pinned entry set (its exact-set assertion goes red on the new ids — that IS the red). Bodies unchanged. Failure mode caught: ledger content invisible to every guard built on the walker.

## Task 7 — `pnpm ledger:mass` + oracle tests

<!-- task: red=`pnpm vitest run tests/scripts/ledgerMass.test.ts` ac=AC-B1 -->

`scripts/ledger-mass.ts` per spec §3.1–§3.2 (weights table exported once; `--json`, `--at`, `--root`, exclusivity; `severity-unrecognized` reporting; unsized excluded). Tests: fixture dir `tests/fixtures/ledger-mass/2026-08-04/` = committed copy of today's BACKLOG.md/DEFERRED.md; expected values HARD-CODED from spec §0 (306/15/321, unsized 31+11, the two `very low` ids) — derived from the spec, never recomputed via the script's own functions; `--at 8d78cdf13` equality; `--json` round-trip; planted unrecognized-severity fixture reported by id. package.json script row. Failure mode caught: wrong weights or silent severity auto-correct producing plausible mass.

## Task 8 — sizing guard + grandfather registry

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerSizing.test.ts` ac=AC-B2 -->

`tests/docs/_metaLedgerSizing.test.ts` per spec §3.3: walks disk-discovered open ledgers via `ledgerItems`; every open entry needs §3.1-parseable `**Effort:**` OR membership in `tests/docs/_ledgerSizingGrandfather.ts` (frozen 42-id array captured by the same parser); satisfied-but-listed ids flagged; scratch-fixture case proves fail-by-name on a planted unsized entry (AC-B2). Consequence bound + fence per spec §3.3 (review brief quotes them). Failure mode caught: new entries landing unsized, mass silently understating debt.

## Task 9 — mdview mass revision (out of repo, after PR 1)

<!-- task: red=`pnpm ledger:mass --json` ac=AC-B3 -->

At `~/bin/mdview` + `~/bin/mdview.design.md`: take the next free rev per the doc's log (Rev 16 at spec time); grammar alignment + mass display per spec §3.4; parity oracle = FULL `--json` envelope equality (red command produces the envelope the pane must match — before the mdview change the pane's numbers diverge: 94/109 vs 95/110); design-doc rev entry cites spec §3.1; ledger checklist re-run on `mdview-fixtures` scratch copies; timestamped `.bak` beside the binary. Failure mode caught: primary viewing surface disagreeing with the canonical count/mass.

## Task 10 — C-ui Stage 0 + probes

<!-- task: red=`pnpm ledger:claims --check BL-FEED-BUTTON-SUCCESS-ANNOUNCE` ac=AC-C2 -->

Branch `feat/sweep-ui-a11y` worktree; claims-check → mark → push for its surviving ids (post-Task-5 routes: FEED-BUTTON certain; PICKER-LOCK/SUB390/SR-SEPARATOR/TERMINAL-FAILURE only if kept). Red: claims check runs clean before marking (exit 0; a collision is the failure this catches).

## Task 11 — feed-button success announcements

<!-- task: red=`pnpm vitest run tests/components/feedButtonSuccessAnnounce.test.ts` ac=AC-C1 -->

Per §4.5 item 2: "Change accepted" / "Change approved" / "Change rejected" via `UndoAnnounceContext.announce`, `undoneAnnouncement` shape (`components/admin/undoAnnounceContext.ts`). Tests assert the announced STRING in the live region for each button's success path, tree-scoped per the anti-tautology rule (clone + strip siblings that render the same words). Failure mode: success silence for SR users on two of three buttons.

## Task 12 — identity-chip SR separator (if kept by Task 5)

<!-- task: red=`pnpm vitest run tests/components/identityChipSrSeparator.test.ts` ac=AC-C1 -->

Entry's own Work section is the contract. Conditional on Task 5 KEEP; skipped-with-record otherwise. Failure mode: per entry.

## Task 13 — terminal-failure icon (if kept by Task 5)

<!-- task: red=`pnpm vitest run tests/components/terminalFailureIcon.test.ts` ac=AC-C1 -->

Same conditional structure as Task 12.

## Task 14 — C-ui closeout: impeccable dual-gate

<!-- task: red=`rg -q 'impeccable-gate:' docs/superpowers/plans/2026-08-04-backlog-convergence-c-ui-closeout.md` ac=AC-C2 -->

`/impeccable critique` + `/impeccable audit` on the branch diff (canonical v3 setup gates); P0/P1 fixed or DEFERRED.md-routed; findings + dispositions into the stem-named closeout sibling `docs/superpowers/plans/2026-08-04-backlog-convergence-c-ui-closeout.md` carrying that branch's filled marker line. Failure mode: UI shipping ungated (invariant 8).

## Task 15 — C-guards Stage 0

<!-- task: red=`pnpm ledger:claims --check BL-SHADOW-REBUILD-EXHAUSTED-EMIT-PLACEMENT` ac=AC-C2 -->

Branch `chore/sweep-guards-tests`; same Stage-0 shape as Task 10 for: SHADOW-REBUILD, FRESHNESS-ABORTED-CLOSE-E2E, TASKCONTRACT-SORT, CANONICAL-CLASS-ARRAY-BLINDSPOT, LEDGER-BODY-DEFINED-ID-OVERMINT, WARNING-SCAN-SCOPE-HAS-NO-ANCHOR, TELEMETRY-FALLBACK-RETRY, REALTIME-BROADCAST-FRAME-DROP-WATCH, SECTION-HEADER-VISUAL-REQUIRED-CONTEXT (+ FITWITHINCLIP-CLIP-SCROLL-STALE if kept).

## Task 16 — shadow-rebuild always-emit

<!-- task: red=`pnpm vitest run tests/sync/shadowRebuildExhaustedEmit.test.ts` ac=AC-C1 -->

Per §4.5 item 1: accumulator-and-`finally` so the exhausted event emits even when the outer finalize rolls back; POST-COMMIT emit discipline (invariant 10 — emit outside the advisory-lock tx). Test drives a rollback path and asserts the durable event lands; failure mode: forensic event lost with the rollback (the entry's original defect).

## Task 17 — spec:lint comparator total order

<!-- task: red=`pnpm mutation:guards` ac=AC-C1 -->

Per §4.5 item 4: message third key in `lib/specLint/run.ts`'s findings sort (`run.ts:112`); retire the two `accepted-gap` ledger rows (`tests/mutation/source/registry.ts:239` region) — the mutation gate goes red on stale rows first (that's the red), green when both mutants are killable and the rows are gone. Ordering test derives expected order from constructed unequal messages, not from the sort's own output. Failure mode: user-visible report order resting on engine-specific stable sort.

## Task 18 — remaining C-guards closures

<!-- task: red=`pnpm vitest run tests/specLint tests/docs --changed` ac=AC-C1 -->

FRESHNESS-ABORTED-CLOSE-E2E (the one e2e case; harness-readiness: existing modal-freshness spec's boot + hydration gate, detach-safe samplers), CANONICAL-CLASS-ARRAY-BLINDSPOT, LEDGER-BODY-DEFINED-ID-OVERMINT, WARNING-SCAN-SCOPE-HAS-NO-ANCHOR, TELEMETRY-FALLBACK-RETRY — each per its entry's Work section, one commit per entry (invariant 6), each with its own red test named in the commit. REALTIME-BROADCAST: INVESTIGATION class — read the CI history the entry names, record verdict on the entry (close or re-size), no silent M expansion. Failure modes: per entry.

## Task 19 — FITWITHINCLIP-CLIP-SCROLL-STALE (route per Task 5)

<!-- task: red=`pnpm vitest run tests/components/fitWithinClip.scroll.test.ts` ac=AC-C1 -->

Only if Task 5 kept it; else skipped-with-record.

## Task 20 — section-header-visual branch-protection flip

<!-- task: red=`gh api repos/{owner}/{repo}/branches/main/protection/required_status_checks --jq '.contexts' | rg -q 'section-header-visual'` ac=AC-C1 -->

Per §4.5 item 3: first verify observed-green soak (`gh run list --workflow section-header-visual.yml` since 2026-07-27, merged-PR runs); green → add the context via `gh api` (red command then passes) and archive the entry; any red run → report, entry stays with the finding. Owner-approved (spec §4.5). Failure mode: a visible-but-non-blocking gate staying decorative.

## Task 21 — C-guards closeout

<!-- task: red=`pnpm test:fast` ac=AC-C2 -->

Marker removal in last pre-merge commit, whole-branch suite green, PR, CI, merge, ff-sync.

## Task 22 — C-docs closures

<!-- task: red=`rg -q 'DESTRUCT-DURATION-TOKENS-1' DEFERRED-archive.md` ac=AC-C1 -->

Branch `docs/sweep-comment-drift`, Stage 0 as above for BELLPANEL-DISMISS-COMMENT-DRIFT + CODE-ENUM-PROVENANCE-COMMENT-BLIND; graduate DESTRUCT-DURATION-TOKENS-1 (body says fixed 2026-07-27 — verify the cited fix live first, then archive). Comment-drift entries per their Work sections. Failure modes: per entry; for the graduation, archiving an unfixed row (hence the live verify).

## Task 23 — C-docs closeout

<!-- task: red=`pnpm vitest run tests/docs` ac=AC-C2 -->

Same closeout shape as Task 21.

## Task 24 — X5 decided_by boundary (dedicated branch)

<!-- task: red=`pnpm vitest run tests/cross-cutting/codes.test.ts tests/audit` ac=AC-C1 -->

Branch `docs/x5-decided-by-boundary` per §4.5 item 5: amend master spec §17.2 AC-X.5 to name `role_token_mappings.decided_by` (evaluate the two named siblings for the same amendment); `pnpm gen:email-boundaries` regenerates `lib/audit/email-boundaries.generated.ts`; prove the x5 gate now covers both write paths (`app/admin/show/[slug]/_actions/roleToken.ts:57`, `app/admin/settings/_actions/roleTokenMappings.ts:38`) by the delete-one-canonicalize-call mutant going red. Master-spec edit follows the §12.4-style lockstep discipline (prose + regen + gate in one commit). Failure mode: boundary registered on paper but the gate still blind.

<!-- tasks: end -->

## 6. Rules applied

- **Layout-dimensions / transition-audit tasks:** N/A — no fixed-dimension parents or Transition Inventory in this spec's surfaces (icon swaps + announcements only; if Task 5 keeps SUB390, its own fix must respect the entry's contract and C-ui's impeccable gate covers visuals).
- **e2e harness readiness (Task 18's e2e case):** server boot + hydration gate + detach-safety inherited from the modal-freshness-cue spec's existing harness — named there, reused, not reinvented.
- **Typecheck pasted snippets:** no TS snippets are embedded in task bodies (commands + file names only), so nothing to typecheck pre-dispatch.
- **Sweeps:** authored-and-run table in §4; the lexical screen's command + output live in spec §2.2.
- **Class-sweep disposition:** every screen (b)/(c) instance is routed in §4 — none deferred without a named reason.

## 7. Adversarial review (cross-model)

After plan self-review: codex-guard dispatch with this plan + spec as lint-docs, REVIEWER ONLY, convergence criterion (consequence bound + fences from spec §2.3/§3.3), round cap 4. Execution handoff (the new Opus pane) only after APPROVE.

## 12. Closeout

impeccable-gate: N/A — no UI surface

(The marker above covers THIS plan-document unit and PR 1 — branch `chore/backlog-convergence`, docs/scripts/tests only. The C-ui branch's UI diff gets its own filled marker in the stem-named sibling `docs/superpowers/plans/2026-08-04-backlog-convergence-c-ui-closeout.md`, written at that branch's closeout per Task 14.)
