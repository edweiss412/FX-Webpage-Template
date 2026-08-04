# Backlog convergence — implementation plan

**Spec:** `docs/superpowers/specs/2026-08-04-backlog-convergence-design.md` (APPROVE at spec review R3; AC-B2/§3.3 grandfather-capture amendment applied post-approval with plan R1, recorded in §6 below). **Arc:** `chore/backlog-convergence` + three follow-on sweep branches + one out-of-repo work item. **Implementer:** new Opus pane (user-ratified routing, spec §1.1 item 6); this plan is authored in the Fable spec/plan pane.

## 1. Branch map

| Unit | Branch / venue | Contents |
|---|---|---|
| A + B (repo) | `chore/backlog-convergence` (this branch, already carries spec + claims) | Tasks 1–8; PR 1 |
| B (mdview) | no branch — `~/bin/mdview` on this machine | Task 9; after PR 1 merges (parity oracle needs `ledger:mass`) |
| C-ui | `feat/sweep-ui-a11y` | Tasks 10–14; the arc's impeccable dual-gate branch; ALL component-file work lands here |
| C-guards | `chore/sweep-guards-tests` | Tasks 15–20 (no `components/` or non-api `app/` files — anything that turns out to need one moves to C-ui) |
| C-docs | `docs/sweep-comment-drift` | Tasks 21–22 |
| C-x5 | `docs/x5-decided-by-boundary` | Task 23 (dedicated per spec §4.5 item 5) |

Every branch: worktree off `origin/main` (invariant 11), `pnpm install` + `pnpm worktree:link-env` + `pnpm preflight`; Stage 0 runs `pnpm ledger:claims --check <all its ids>` (one invocation, full id list), marks, commits, **pushes immediately**; markers come off in the PR's last commit (invariant 12 as amended); prettier before push; real CI green; `gh pr merge --merge`; ff-sync main and verify `0 0`. C branches are sequential after PR 1 (pool routes depend on Unit A probe outcomes). One commit per entry closure throughout (invariant 6) — multi-entry tasks below list per-entry red commands and produce one commit each.

## 2. Spec acceptance criteria (restated for task references)

From spec §7: **AC-A1** (filing-bar bullet + lint disposition + three seeded dispositions executed), **AC-A2** (semantic-screen table covers every open entry), **AC-B1** (`ledger:mass` fixture oracle 306/15/321, `--json` round-trip, `--at 8d78cdf13`, planted `severity-unrecognized`), **AC-B2** (sizing guard fails-by-name on planted unsized entry, passes real tree with the implementation-time grandfather registry), **AC-B3** (mdview mass-revision full-envelope parity + checklist + `.bak`), **AC-C1** (every pool id dispositioned), **AC-C2** (per-branch claim hygiene), **AC-PROG** (mass < 321, canonical count < 110 at arc close).

## 3. Meta-test inventory (spec §6)

CREATES `tests/docs/_metaLedgerSizing.test.ts` + `tests/docs/_ledgerSizingGrandfather.ts`. EXTENDS `tests/scripts/ledgerFields.test.ts` (Task 6 adds the three re-headed DEFERRED ids to its expectations) and the source-mutation ledger (Task 16 retires the two `BL-TASKCONTRACT-SORT-COMPARATOR-EQUALKEY` `accepted-gap` rows in `tests/mutation/source/registry.ts` — the comparator they annotate lives at `lib/specLint/taskContract.ts:246-248`, and the gate reports stale rows, so retirement is part of that task's green). Registry rows: Supabase/admin N/A (no such surfaces). Sizing guard: deliberate mutation-registry non-enrollment (spec §3.3).

## 4. Semantic-screen disposition table (AC-A2 — authored AND run, 2026-08-04)

Three reader passes over every open entry (two primary + one follow-up covering the 12 ids the primaries' container-section handling skipped); lexical screen command + output in spec §2.2. Canonical census 110. Final counts: **a = 91 KEEP · b = 14 · c = 2 · terminal-flagged = 3** (CI-STALE resolved-in-body; DESTRUCT-DURATION fixed-in-body; EXPORT-BLANK-ROW / TRANSPORT-ID are PARTIALLY CLOSED with named residuals — counted in a, flagged here so nobody re-litigates their closed halves).

**(b)/(c) rows and dispositions:**

| Entry | Class | Disposition |
|---|---|---|
| BL-CAPABILITY-LOSS-SURVIVING-ROW-FALSE-POSITIVE | b | Unit A seeded probe — Task 4 |
| BL-LEDGER-DISCOVERY-FAMILY-SCOPED | b | Task 5 three-way (self-fenced "not currently live") |
| BL-CI-PARALLEL-DB-FALLBACK-AUDIT | b | stays — INFERRED escape hatch, probe named as first step (Task 5 annotates) |
| BL-WATCH-PROMOTION-ACTIVATION-RACE | b | Task 5 three-way (READ COMMITTED demo or demote) |
| BL-FITWITHINCLIP-CLIP-SCROLL-STALE | b | Task 5 three-way; if kept → C-ui Task 13 (component file — dual-gate branch) |
| BL-LEDGER-MDAST-SHARED-HOME | c | Task 5 settles present-vs-conditional by reading `scripts/**` consumers |
| BL-PICKER-LOCK-ICON-LUCIDIFY | b | PREREQ-FENCED (spec §4.2) — Task 5 records the fence; NOT claimed by any C branch |
| BL-IDENTITYCHIP-SUB390-COLLISION | b | PREREQ-FENCED — Task 5 records; NOT claimed; 320px probe named in the record |
| BL-IDENTITYCHIP-SR-SEPARATOR | b | Task 5 three-way; if kept → C-ui Task 12 |
| BL-TERMINAL-FAILURE-ICON | b | Task 5 three-way; if kept → C-ui Task 12 |
| BL-RATE-LIMIT-SNAPSHOT-DURABILITY | b | Task 5 three-way ("observed real flakiness" never observed) |
| BL-HELP-UI-LABEL-CROSSWALK-EXACT-MATCH | b | Task 5 three-way (self-declared hardening) |
| BL-AGENDA-PERLINK-COMPLETENESS | b | Task 5 three-way (invented shape, no corpus instance) |
| BL-PREPARE-INTERNAL-FAULT-KIND | b | Task 5 three-way (helper names, no probe) |
| DESTRUCT-ARM-ANNOUNCE-1 | b | Task 5 three-way (no AT probe) |
| VOICEOVER-ANNOUNCER-SPOTCHECK | c | stays as owner action, Task 5 annotates |

Also routed by the screen though not (b)/(c): **BL-AUTH-INTERSTITIAL-FONT** (its own body argues both fix directions are bad — Task 5 runs the three-way with demote-to-limits as the leaning; if KEPT it becomes a C-ui task, since `app/auth/**` routes are invariant-8 UI surface); **BL-CI-STALE-BRANCH-PROTECTION-COMMENT** (body opens "Resolved." — graduation-verify in Task 21); **DESTRUCT-DURATION-TOKENS-1** (body says fixed 2026-07-27 — graduation-verify in Task 21).

**a-class KEEP ids — top-level:** BL-CODE-ENUM-PROVENANCE-COMMENT-BLIND BL-SHADOW-REBUILD-EXHAUSTED-EMIT-PLACEMENT BL-ROLEFLAGSNOTICE-DROP-GUARD BL-LEDGER-BODY-DEFINED-ID-OVERMINT BL-TASK-ENROLLMENT-SINGLE-DEPTH BL-COVERAGE-CLAIMS-CITE-SKIPPED-SUITES BL-WARNING-SCAN-SCOPE-HAS-NO-ANCHOR BL-FRESHNESS-ABORTED-CLOSE-E2E BL-FRESHNESS-PROJECTION-NARROWING BL-SOURCE-ANCHORS-STALE-AFTER-FAILED-GID-FETCH BL-PG-CRON-HOST-ASSERTION BL-RESYNC-STAGED-REVIEW-UI BL-STEP3-FULL-CREW-PREVIEW BL-CATALOG-PARTITION-WARNING-CLASS BL-HEADER-REACT-RECONCILE-HARNESS BL-ADOPTION-PIN-REACHABILITY-BLIND BL-POPOVER-REGISTRY-PER-FILE-AND-TAILWIND-ONLY BL-CI-OVERLAP-BOOT-WITH-SETUP BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT BL-CI-RECLASSIFY-PARALLEL-STABILITY BL-REALTIME-BROADCAST-FRAME-DROP-WATCH BL-PG-CRON-COVERAGE-UNRUN BL-SERVER-ACTION-ORIGIN-GATE BL-E2E-COVERAGE-SCANNER-EXCLUSION-FILTERS BL-TELEMETRY-FALLBACK-RETRY BL-PICKER-CLEANUP-REVALIDATE-QUERY-VARIANT BL-DEV-GATE-GALLERY-SPEC-ROT BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS BL-CAPABILITY-MATRIX-FINANCIALS-PREDICATE BL-BELLPANEL-DISMISS-COMMENT-DRIFT BL-RESYNC-REGRESSED-JUMP-LINK BL-E2E-LIFECYCLE-SPECS-CI-DARK BL-E2E-LAYOUT-FIXED-WAIT-RESIDUE BL-RESOLVE-INTENT-WRONG-VERB BL-FITWITHINCLIP-DOUBLE-MOUNT-MEASURE BL-FITWITHINCLIP-DOUBLE-ANCESTOR-WALK BL-ADMIN-SEMANTIC-Z-INDEX-SCALE BL-ATTENTION-PANEL-NAME-LEADING-SECTION BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED BL-HARNESS-FONT-FIDELITY

**a-class KEEP ids — nested + DEFERRED:** BL-OPS-LOG BL-PUSH-NOTIFICATIONS BL-X5-ROLE-TOKEN-DECIDED-BY-BOUNDARY BL-PRIVATE-IMAGE-PIPELINE BL-ADMIN-DASHBOARD-ROW-ACTIONS BL-ADMIN-PER-SHOW-HISTORY BL-HELP-NON-SHOW-REPORT-SURFACE BL-TWO-WAY-SHEET-SYNC BL-NON-CREW-UNDO BL-FEED-BUTTON-SUCCESS-ANNOUNCE BL-BULK-UNDO-ANNOUNCE-UNMOUNT BL-ANNOUNCE-REGION-UNMOUNT-CLASS BL-EM-DASH-POLICY BL-CANONICAL-CLASS-ARRAY-BLINDSPOT BL-ACCENT-BUTTON-ATOM-SWEEP BL-CREW-SHEET-TEMPLATE-V2 BL-CREW-FIELD-ENRICHMENT BL-CREW-AGENDA-ADMIN-CLEAR BL-LIBDATA-SUPABASE-CALL-BOUNDARY-METATEST BL-ADMIN-BADGE-CONTRAST-TOKEN BL-PROJECTION-ALERT-VIEWER-INDEPENDENT-PROBE BL-CREW-PII-DB-LOCKDOWN BL-FLIGHT-LEG-ORIENTATION BL-CREW-UNKNOWN-ASTERISK-TODAY-DATES BL-CI-UNIT-GATE-EXCLUSIONS BL-ADMIN-NAV-BADGE-SUSPENSE-STREAMING BL-RESURRECT-MOBILE-SAFARI-E2E PSQL-GUARD-RECALL-RESIDUAL STEP3-GALLERY-TAP-TARGETS-1 NEWTAB-GUARD-UNDECIDABLE-2 NEWTAB-A11Y-RESIDUE-1 SHARELINK-COPY-REF-ORDERING-PROOF SHARELINK-CUE-VISIBILITY-1 SHARELINK-CUE-FORCED-COLORS-1 SHARELINK-CONSTANTS-INVENTORY-1 ATTENTION-INDEX-JUMP-FOCUS-1 ATTENTION-INDEX-ROW-DESTINATION-NAME-1 DESTRUCT-FOCUSRING-1 SHEETLINK-SUBTLE-ACTION-CLASS-1

**a-class KEEP ids — 12-id follow-up pass:** BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE ("measured, not theorized", CI trace) BL-AGENDA-PROSE-SECOND-DAY (verified at PR #610 close-out) BL-AGENDA-POSITIONAL-DAYSET-FALLBACK (spec-ratified corpus omission) BL-HEALTH-RESOLVE-DB-LOCKDOWN (re-verified grant, accepted risk) BL-CRON-WORKBOOK-FAULT-CODE (traced `runScheduledCronSync.ts` sites) BL-ROOM-DIMS-ONLY-NOVEL-HEADER (14 rounds confirmed) BL-MUTATION-HARNESS-OPEN-HOLES (knownHoles ratchet ledger) BL-EXPORT-BLANK-ROW-SEGMENTATION (probed residuals) BL-TRANSPORT-ID-RESOLUTION (verified `nameMatch.ts:50-53`) — plus terminal-flagged BL-CI-STALE-BRANCH-PROTECTION-COMMENT (Task 21).

## 5. Tasks

<!-- tasks: depth=2 -->

## Task 1 — AGENTS.md filing-bar bullet

<!-- task: red=`rg -q 'Ledger filing bar \(2026-08-04\)' AGENTS.md` ac=AC-A1 -->

Add the spec §2.1 bullet to AGENTS.md "Cross-cutting discipline", after the class-sweep bullet. Red fails before the edit, passes after. Failure mode: policy existing only in the spec, invisible to future filers.

## Task 2 — demote PSQL-GUARD-RECALL-RESIDUAL

<!-- task: red=`rg -q 'Documented limits' tests/cross-cutting/psqlStartupFiles/scan.ts && rg -q 'PSQL-GUARD-RECALL-RESIDUAL' DEFERRED-archive.md` ac=AC-A1 -->

Per spec §2.2: three probe-backed limits (verbatim, with un-defer triggers) into a "Documented limits" header block in `tests/cross-cutting/psqlStartupFiles/scan.ts` (precedent: `tests/docs/_ledgerMdast.ts` RATIFIED SCOPE header); archive the entry with pointer. Ledger tests stay green. Failure mode: silent deletion of a probed limit.

## Task 3 — demote NEWTAB-GUARD-UNDECIDABLE-2

<!-- task: red=`rg -q 'NEWTAB-GUARD-UNDECIDABLE-2' DEFERRED-archive.md` ac=AC-A1 -->

Archive with pointer to `docs/superpowers/specs/2026-07-25-newtab-announcement-family.md` §6.4; append the one-line fix note there if absent. Failure mode: duplicate row resurrecting a ratified limit.

## Task 4 — CAP-LOSS reachability probe (end-to-end)

<!-- task: red=`pnpm vitest run tests/sync/capabilityLossReachability.probe.test.ts` ac=AC-A1 -->

Per spec §2.2 row 3 and plan-review R1 finding 4: the probe drives `applyParseResult` END-TO-END per hold kind (not `planHoldAwareApply` alone — survival is computed from `deleteKeepNames` in `applyParseResult`, and arm (c) fires later), then asserts on the REAL arm-(c) output — either through `runPhase2` or by invoking the actual extracted `capabilityRoleChangesForNotice` with the end-to-end products, never a reimplementation. Fixture-driven per hold kind. Outcome A (no hold kind produces a surviving-but-unlisted row reaching arm (c)): archive as unreachable with transcript. Outcome B: entry stays, marker cleared, body upgraded + re-sized. Failure mode: settling reachability on a partial pipeline that skips the layer where the defect lives.

## Task 5 — semantic-screen dispositions (all (b)/(c) rows)

<!-- task: red=`test $(rg -c 'screen-disposition 2026-08-04' BACKLOG.md DEFERRED.md | awk -F: '{s+=$2} END {print s}') -ge 15` ac=AC-A2 -->

First step: `pnpm ledger:claims --check` for every row this task may demote (the §4 (b)/(c) list minus Tasks 2–4's already-claimed seeds), mark the ones being demoted, push. Then execute the three-way call for every §4 (b)/(c) row not covered by Tasks 2–4, plus BL-AUTH-INTERSTITIAL-FONT: run the named cheap probe where one exists; per row KEEP-with-evidence / DEMOTE (limits record + archive) / ANNOTATE-INFERRED (add `**Reachability:** INFERRED, NOT PROBED` + named probe per the new filing bar). EVERY dispositioned row gets a `screen-disposition 2026-08-04: <verdict> — <basis>` stamp in the entry (or its archive record) — the red counts stamps across both ledgers (15 = 16 (b)/(c) rows + AUTH-INTERSTITIAL − Tasks 2–4's two seeds handled separately, floor set conservatively). Dispositions also in the PR body. Failure mode: the screen finding hypotheticals and nothing changing — or changing without a stamp a later reader can audit.

## Task 6 — normalize the invisible DEFERRED section

<!-- task: red=`pnpm vitest run tests/scripts/ledgerFields.test.ts -t 'undo announcement channel entries are visible'` ac=AC-A2 -->

Write the failing test FIRST: a new named case in `tests/scripts/ledgerFields.test.ts` asserting `ledgerItems("DEFERRED.md", …)` contains the three Undo-channel finding ids (red now — the `##`-depth section is invisible to the `levels: [3]` walker). Then re-head the three findings to `###` entries (bodies unchanged) and update the test file's pinned exact-set expectations in the same commit. Runs BEFORE Task 8's grandfather capture — the three re-headed entries are unsized, so the captured registry inherits them (spec §3.3 capture rule, amended with plan R1). Failure mode: ledger content invisible to every walker-built guard.

## Task 7 — `pnpm ledger:mass` + oracle tests

<!-- task: red=`pnpm vitest run tests/scripts/ledgerMass.test.ts` ac=AC-B1 -->

`scripts/ledger-mass.ts` per spec §3.1–§3.2 (single exported weights table; `--json` full envelope; `--at`; `--root`; exclusivity; `severity-unrecognized`; unsized excluded). Tests: fixture dir `tests/fixtures/ledger-mass/2026-08-04/` = committed copy of the 2026-08-04 ledgers; expected values HARD-CODED from spec §0 (306/15/321, unsized 31+11, the two `very low` ids) — never recomputed via the script's own functions; `--at 8d78cdf13` equality; `--json` round-trip; planted unrecognized-severity fixture reported by id. package.json script row. Failure mode: wrong weights or silent severity auto-correct producing plausible mass.

## Task 8 — sizing guard + grandfather registry

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerSizing.test.ts` ac=AC-B2 -->

Per spec §3.3 (as amended): walker-based guard; grandfather registry captured AT THIS POINT by the same parser (after Tasks 2–6 have moved the corpus — 42 at spec time, expected 45-ish after the re-heading, minus any unsized rows Tasks 2–5 archived; the capture, not the prediction, is authoritative); satisfied-but-listed ids flagged; scratch-fixture fail-by-name case (AC-B2). Consequence bound + fence per spec §3.3. Failure mode: new entries landing unsized, mass silently understating debt.

## Task 9 — mdview mass revision (out of repo, after PR 1)

<!-- task: red=`rg -q 'parity.*ledger:mass|ledger:mass.*parity' ~/bin/mdview.design.md` ac=AC-B3 -->

At `~/bin/mdview` + `~/bin/mdview.design.md`: next free rev per the doc's log; grammar alignment + mass display per spec §3.4. Red: the design doc carries no parity-oracle language before this work (command fails), and the new rev entry citing the `pnpm ledger:mass --json` parity oracle makes it pass. Behavioral proof is the §3.4 full-envelope parity comparison run against the same tree (must include the previously-missed `BL-NULLCODE-STAMP-BATCH-2`), on `mdview-fixtures` scratch copies + real ledgers read-only; timestamped `.bak` beside the binary. Failure mode: primary viewing surface disagreeing with canonical count/mass.

## Task 10 — C-ui Stage 0

<!-- task: red=`rg -q 'IN PROGRESS · \*\*Branch:\*\* feat/sweep-ui-a11y' BACKLOG.md` ac=AC-C2 -->

Branch `feat/sweep-ui-a11y` worktree. Ids: BL-FEED-BUTTON-SUCCESS-ANNOUNCE certainly, plus whichever of {SR-SEPARATOR, TERMINAL-FAILURE, FITWITHINCLIP-CLIP-SCROLL-STALE, AUTH-INTERSTITIAL-FONT} Task 5 KEPT (fenced/demoted rows are NOT claimed). `pnpm ledger:claims --check <full list>` → mark → commit → push. Red: the marker line exists in BACKLOG.md after Stage 0 (fails before). Failure mode: invisible claims racing another session.

## Task 11 — feed-button success announcements

<!-- task: red=`pnpm vitest run tests/components/feedButtonSuccessAnnounce.test.ts` ac=AC-C1 -->

Per §4.5 item 2: "Change accepted" / "Change approved" / "Change rejected" via `UndoAnnounceContext.announce`, `undoneAnnouncement` shape (`components/admin/undoAnnounceContext.ts`). Tests assert the announced STRING in the live region per button success path, tree-scoped per the anti-tautology rule (clone + strip siblings rendering the same words). Failure mode: SR success silence on two of three buttons.

## Task 12 — kept UI closures (SR separator, terminal icon)

<!-- task: red=`pnpm vitest run tests/components --changed=HEAD~1` ac=AC-C1 -->

For each of BL-IDENTITYCHIP-SR-SEPARATOR and BL-TERMINAL-FAILURE-ICON that Task 5 KEPT: one commit per entry, each with its own failing test named in the commit (`tests/components/identityChipSrSeparator.test.ts`, `tests/components/terminalFailureIcon.test.ts`), entry's own Work section as contract. The task-level red is per-commit: the entry's named test file, written first, red before its fix. Skipped-with-record for rows Task 5 demoted/fenced. Failure mode: per entry.

## Task 13 — FITWITHINCLIP-CLIP-SCROLL-STALE (if kept)

<!-- task: red=`pnpm vitest run tests/components/fitWithinClip.scroll.test.ts` ac=AC-C1 -->

Component-file work (`components/admin/useFitWithinClip.ts`) — lives on C-ui BECAUSE of the dual gate (plan R1 finding 6). Conditional on Task 5 KEEP; skipped-with-record otherwise.

## Task 14 — C-ui closeout: impeccable dual-gate + merge

<!-- task: red=`! rg -q 'Branch:\*\* feat/sweep-ui-a11y' BACKLOG.md DEFERRED.md` ac=AC-C2 -->

`/impeccable critique` + `/impeccable audit` on the branch diff (canonical v3 setup gates); P0/P1 fixed or DEFERRED-routed; findings + dispositions + the branch's filled marker line into the stem-named sibling `docs/superpowers/plans/2026-08-04-backlog-convergence-c-ui-closeout.md`. Then marker removal in the last pre-merge commit — the red (markers still present) flips only when that commit lands — PR, CI green, merge, ff-sync. Failure mode: UI shipping ungated, or markers reaching main.

## Task 15 — C-guards Stage 0

<!-- task: red=`rg -q 'IN PROGRESS · \*\*Branch:\*\* chore/sweep-guards-tests' BACKLOG.md` ac=AC-C2 -->

Branch `chore/sweep-guards-tests`; same Stage-0 shape for: SHADOW-REBUILD, FRESHNESS-ABORTED-CLOSE-E2E, TASKCONTRACT-SORT, CANONICAL-CLASS-ARRAY-BLINDSPOT, LEDGER-BODY-DEFINED-ID-OVERMINT, WARNING-SCAN-SCOPE-HAS-NO-ANCHOR, TELEMETRY-FALLBACK-RETRY, REALTIME-BROADCAST-FRAME-DROP-WATCH, SECTION-HEADER-VISUAL-REQUIRED-CONTEXT. Red as in Task 10.

## Task 16 — spec:lint comparator total order

<!-- task: red=`pnpm vitest run tests/specLint/taskContractFindingOrder.test.ts` ac=AC-C1 -->

Per §4.5 item 4 and plan R1 finding 1: the comparator is `lib/specLint/taskContract.ts:246-248` (`findings.sort((a, b) => a.docLine - b.docLine || …code…)`) — NOT `run.ts`. Write the failing ordering test first: constructed findings with equal docLine + equal code and distinct messages must sort by message (red against the current comparator). Then add the message third key; retire the two `accepted-gap` rows in `tests/mutation/source/registry.ts` in the same commit (the gate reports stale rows — `pnpm mutation:guards` green again only once rows are retired AND both mutants killable). Failure mode: user-visible report order resting on engine-specific stable sort.

## Task 17 — shadow-rebuild always-emit (both handlers)

<!-- task: red=`pnpm vitest run tests/sync/shadowRebuildExhaustedEmit.test.ts` ac=AC-C1 -->

Per §4.5 item 1 and plan R1 finding 7: `app/api/admin/onboarding/finalize-cas/route.ts` has TWO finalize paths — the non-streaming handler and the streaming handler (its post-commit work runs inside the `ReadableStream` `start()` body). Accumulate the exhausted-rebuild event and flush in BOTH outer finalizers, post-commit, outside the advisory-lock tx (invariant 10). Behavioral proof for BOTH: a rollback-path test per handler asserting the durable event lands. Failure mode: the streaming path silently keeping the emit inside the rolled-back tx while the non-streaming test glows green.

## Task 18 — remaining C-guards closures (one commit per entry)

<!-- task: red=`pnpm vitest run tests/specLint/canonicalClassArray.test.ts` ac=AC-C1 -->

Five independent closures, ONE COMMIT PER ENTRY, each commit naming its own red test written first: CANONICAL-CLASS-ARRAY-BLINDSPOT (`tests/specLint/canonicalClassArray.test.ts` — the task-level red, first in sequence), LEDGER-BODY-DEFINED-ID-OVERMINT (`tests/docs/ledgerBodyIdOvermint.test.ts`), WARNING-SCAN-SCOPE-HAS-NO-ANCHOR (`tests/parser/warningScanScopeAnchor.test.ts`), TELEMETRY-FALLBACK-RETRY (`tests/log/telemetryFallbackRetry.test.ts`), FRESHNESS-ABORTED-CLOSE-E2E (the one e2e case; harness readiness inherited from the modal-freshness-cue spec's harness — boot mechanism, hydration gate, detach-safe samplers all named there). Each per its entry's Work section. REALTIME-BROADCAST-FRAME-DROP-WATCH is INVESTIGATION class: read the CI history the entry names, record the verdict on the entry (close or re-size), no silent M expansion — its "red" is the recorded verdict stamp, listed in the commit. Failure modes: per entry, stated in each commit body.

## Task 19 — section-header-visual branch-protection flip

<!-- task: red=`gh api repos/{owner}/{repo}/branches/main/protection/required_status_checks --jq '.contexts' | rg -q 'section-header-visual'` ac=AC-C1 -->

Per §4.5 item 3: verify observed-green soak (`gh run list --workflow section-header-visual.yml` since 2026-07-27, merged-PR runs); green → add the context with the exact mutation `gh api -X POST repos/{owner}/{repo}/branches/main/protection/required_status_checks/contexts -f "contexts[]=section-header-visual"` (red command then passes) and archive the entry; any red soak run → report, entry stays with the finding. Owner-approved. Failure mode: a visible-but-non-blocking gate staying decorative.

## Task 20 — C-guards closeout

<!-- task: red=`! rg -q 'Branch:\*\* chore/sweep-guards-tests' BACKLOG.md DEFERRED.md` ac=AC-C2 -->

Whole-branch suite green, marker removal in last pre-merge commit (flips the red), PR, CI, merge, ff-sync.

## Task 21 — C-docs closures (one commit per entry)

<!-- task: red=`rg -q 'DESTRUCT-DURATION-TOKENS-1' DEFERRED-archive.md` ac=AC-C1 -->

Branch `docs/sweep-comment-drift`; Stage 0 claims BELLPANEL-DISMISS-COMMENT-DRIFT, CODE-ENUM-PROVENANCE-COMMENT-BLIND, DESTRUCT-DURATION-TOKENS-1, AND BL-CI-STALE-BRANCH-PROTECTION-COMMENT (marker-presence red per Task 10's shape, then per-entry commits). Graduation-verifies: DESTRUCT-DURATION-TOKENS-1 (task-level red — verify the cited 2026-07-27 fix live, then archive) and BL-CI-STALE-BRANCH-PROTECTION-COMMENT (body opens "Resolved." — verify, then archive; its own red: `rg -q 'BL-CI-STALE-BRANCH-PROTECTION-COMMENT' BACKLOG-archive.md`). Comment-drift entries per their Work sections with their own greps as reds, one commit each. Failure mode: archiving an unfixed row (hence live verification first).

## Task 22 — C-docs closeout

<!-- task: red=`! rg -q 'Branch:\*\* docs/sweep-comment-drift' BACKLOG.md DEFERRED.md` ac=AC-C2 -->

Same closeout shape as Task 20.

## Task 23 — X5 decided_by boundary (dedicated branch)

<!-- task: red=`pnpm test:audit:x5-email-canonicalization` ac=AC-C1 -->

Branch `docs/x5-decided-by-boundary` per §4.5 item 5 and plan R1 finding 2. Write the failing assertion FIRST: extend `tests/cross-cutting/email-canonicalization.test.ts` to require `role_token_mappings.decided_by` in the derived boundary set — the red command (`pnpm test:audit:x5-email-canonicalization`, which regenerates then runs that exact test) goes red. Then amend BOTH sources the test derives parity from — master spec §17.2 AC-X.5 AND `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/11-cross-cutting.md` — evaluate the two named sibling constraints for the same amendment; `pnpm gen:email-boundaries` regenerates; prove gate coverage of both write paths (`app/admin/show/[slug]/_actions/roleToken.ts:57`, `app/admin/settings/_actions/roleTokenMappings.ts:38`) by the delete-one-canonicalize-call mutant going red. Prose + regen + test in one commit (lockstep discipline). Failure mode: boundary registered on paper, gate still blind.

<!-- tasks: end -->

## 6. Rules applied + ratifications

- **Spec amendment with plan R1 (do not relitigate):** spec §3.3/AC-B2/§5-3 now define the grandfather registry by its implementation-time capture (Task 8) rather than the literal 42 — forced by Task 6's re-heading, which surfaces three unsized DEFERRED entries to the walker. Recorded here and in the spec commit.
- **Layout-dimensions / transition-audit tasks:** N/A — no fixed-dimension parents or Transition Inventory in scope (icon swaps + announcements; C-ui's impeccable gate covers visuals).
- **e2e harness readiness (Task 18's e2e case):** inherited from the modal-freshness-cue spec's harness — named there, reused, not reinvented.
- **Typecheck pasted snippets:** no TS snippets embedded in task bodies (commands + file names only).
- **Sweeps:** authored-and-run table in §4 (three reader passes, counts reconciled); lexical screen in spec §2.2.
- **Class-sweep disposition:** every screen (b)/(c) instance routed in §4; none deferred without a named reason.
- **Commit-per-task / per-entry:** multi-entry Tasks 12/18/21 explicitly one-commit-per-entry with per-entry reds.

## 7. Adversarial review (cross-model)

After plan self-review: codex-guard dispatch with this plan + spec as lint-docs, REVIEWER ONLY, canonical convergence-criterion block, round cap 4. Execution handoff (the new Opus pane) only after APPROVE.

## 12. Closeout

impeccable-gate: N/A — no UI surface

(The marker above covers THIS plan-document unit and PR 1 — branch `chore/backlog-convergence`, docs/scripts/tests only. The C-ui branch's UI diff gets its own filled marker in the stem-named sibling `docs/superpowers/plans/2026-08-04-backlog-convergence-c-ui-closeout.md`, written at that branch's closeout per Task 14.)
