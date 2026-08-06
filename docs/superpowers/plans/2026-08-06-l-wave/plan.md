# L-wave implementation plan

> **For agentic workers:** execute task-by-task per `HANDOFF.md` in this directory (the Opus pane's entry point). The spec is `docs/superpowers/specs/2026-08-06-l-wave-design.md`; this plan carries its own adversarial-review gate below.

**Goal:** execute the ratified L-tier screen — 29 claimed entries (14 dispositions: 1 ship, 5 demotes incl. 1 probe-gated, 4 decompositions, 2 zero-code closures, 1 sentence-class delete, 1 enforce; plus 15 stamp/classification targets incl. 3 executed archives and 1 resize), plus one new filing and the decomposition children — across three themed branches to three merged PRs (after this spec/plan branch merges).

**Architecture:** `docs/l-wave-spec` (this branch: spec + plan + claim handoff) merges first; then `feat/l-wave-docs`, `feat/l-wave-push`, `feat/l-wave-emdash` off `origin/main`, in that order, each TDD per task, cross-model reviewed, CI-green merged.

**Date:** 2026-08-06 · **Spec:** `docs/superpowers/specs/2026-08-06-l-wave-design.md` (+ ratified brief `docs/superpowers/specs/2026-08-05-l-wave-decisions-brief.md`) · **Status:** DRAFT (pre-review)

## Global constraints

- Every AGENTS.md plan-wide invariant binds; the ones this wave exercises: 1 (TDD), 6 (conventional commits), 8 (W-EMDASH dual-gate), 11 (worktree-only), 12 (claims). Spec §1.1 lists the 16 do-not-relitigate items.
- Guard premise rule (`tests/_shared/premise.ts`) applies to the one new guard (em-dash copy guard, task E1).
- No em dashes in new user-visible copy (all units — W-EMDASH makes it mechanical).
- The archive RED, stated once and used by every archive task: move the entry body to `BACKLOG-archive.md` WITH its flight marker intact, run `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts`, observe the named failure (archives categorically reject in-progress entries — proves the guard sees THIS entry); then strip the marker and rerun to GREEN. That failing run is the task's executable RED. Stamp-only and refile tasks use `pnpm vitest run tests/docs/` green as their proof (prose edits have no executable red of their own).

## Pre-draft verification pass (writing-plans rule)

Every file/symbol/command named below was grep-verified in the worktree on 2026-08-06 (spec pre-draft pass + this plan's sweeps; transcripts in the review dispatch). Key probe results the plan RELIES on, recorded so no task re-derives them:

- `lib/messages/catalog.ts` copy strings carry **zero** em dashes today (probed: string-literal scan → 0 hits; the file's 9 U+2014 lines are all comments). The entry's "dozens of catalog rows" claim is stale — a prior copy pass cleaned it (e.g. `SYNC_DELAYED_SEVERE` now reads "…has stalled. Check the dashboard."). Consequence: **no §12.4 lockstep commit is expected in W-EMDASH**; the guard still covers the surface so regression is loud.
- `lib/notify/` copy strings carry exactly **2** em dashes (`lib/notify/templates/realtimeProblem.ts:121`, `lib/notify/templates/autoPublishUndo.ts:127` — both overflow lines of the shape `…and N more — open the dashboard…`); the other raw U+2014 hits are comments. The R1 AST probe additionally seeded ~25 copy-constant/JSX-child sites across 10 component/app files (spec §2.3 item 3) that a props-only scan would have missed.
- `app/help/**/*.mdx`: 20 U+2014 instances across 2 files (`app/help/admin/settings/page.mdx` 9 lines, `app/help/admin/dashboard/page.mdx` 10 lines).
- Unconditional-skip suites (`describe.skip(` / `test.fixme(`): 14 files — the 12 `tests/e2e/` files the entry probed, plus `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` and `tests/time/rightNowTransitions.test.ts` (task L1 classifies these two: wiring-meta-test string mention vs real suite).
- Phrase-family prose sweep (coverage claims): 9 candidate files; the `lib/messages/catalog.ts` / `lib/messages/__generated__/spec-codes.ts` / `tests/messages/popoverContextCopy.test.ts` hits are FALSE POSITIVES ("full audit suite" = the branch-protection CI check set, not a test-suite coverage claim) — excluded with that reason in L1's table.
- `transportTileVisible` Branch 0 ("garble-proof id path" over `transportationOwnerIds`, `lib/visibility/scopeTiles.ts:208-215`) — id-based visibility SHIPPED (#380/Flow 8.3b).
- Notify templates receive `origin` and build absolute links today (`${origin}/admin` in both overflow lines; `escapeHtml(href)` anchor pattern at `lib/notify/templates/autoPublishUndo.ts:74`).
- Mass weights: `EFFORT_WEIGHTS = { XS: 1, S: 2, M: 4, L: 8 }` (`scripts/ledger-mass.ts:46`), severity-multiplied — AC-PROG arithmetic recomputed at close, not predicted.

## Meta-test inventory (declared per writing-plans rule)

- **CREATES:** a new guard suite under `tests/styles/` (working name _metaEmDashCopy.test.ts, final at implementation; the em-dash copy guard + exemption registry + planted-dash premise fixtures, task E1); per-template report-link unit rows in the existing notify template test files (task P1).
- **EXTENDS:** nothing structural. The `tests/docs/` meta-suites (`_metaLedgerInProgress`, `_metaLedgerReferentialIntegrity`, sizing, claims) discover ledger files from disk and cover every archive/stamp/refile/child-filing by default. `tests/parser/mutation/knownHoles.test.ts` already pins `OPERATOR_FINDING_MAP` referential integrity — the decomposition keeps its BL- ids resolvable, proven by that suite staying green.
- **Registries:** invariant-9 (`tests/auth/_metaInfraContract.test.ts`) and invariant-10 (`tests/log/_auditableMutations.ts`) — no new Supabase call site, no new mutation surface in any unit. If implementation discovers otherwise, the registry row lands in the same commit. Advisory locks: untouched. Source-mutation registry: no unit enrolls (the em-dash guard's kill criterion is its planted fixtures, not a registry family).

## Unit W-LDOCS — `feat/l-wave-docs`

Worktree + branch + claim markers are created by the AUTHORING session BEFORE `docs/l-wave-spec` merges (handoff-by-overlap, spec §3: the authoring session creates all three unit branches off `origin/main`, runs `pnpm ledger:claims --check <unit ids>` from the MAIN checkout expecting exit 1 naming `docs/l-wave-spec` only, marks each unit's subset (W-LDOCS: 27 ids — 12 dispositions + 15 stamp/classification targets; W-PUSH: 1; W-EMDASH: 1), pushes; THEN strips the parent's 29 markers in its last pre-merge commit — no undeclared instant on origin). IMPLEMENTATION starts after the parent PR merges: the Opus pane runs `pnpm install && pnpm worktree:link-env && pnpm preflight` in the existing worktree (the branch runs test suites and the L3 probe — the docs-only preflight exemption is NOT invoked) and merges `origin/main` before its first task commit.

### Task L1 — BL-COVERAGE-CLAIMS-CITE-SKIPPED-SUITES: delete the sentence class

Sweeps RUN 2026-08-06 (plan R1 F1 repair; transcript completed plan R2 F4 — the artifact now carries RAW output of ALL commands, not just the prose sweeps): committed at `docs/superpowers/plans/2026-08-06-l-wave/l1-coverage-sweep-2026-08-06.txt`. Three enumeration commands (all re-run at execution and the table below re-verified against their output):

1. Unconditional suites: `grep -rln "describe\.skip(\|test\.fixme(\|test\.skip(" tests/` plus the multiline-chain form `grep -rn -B1 "^\s*\.skip(" tests/` → 22 raw matches: 19 `tests/e2e/` files with unconditional `describe.skip(` (20 in `tests/e2e/` + `tests/time/rightNowTransitions.test.ts`... CLASSIFIED: `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` hits are string/regex mentions in a wiring guard, NOT suites (excluded); `tests/time/rightNowTransitions.test.ts:8` "test.fixme" is a COMMENT, not a call (the file's suites run — its hit joins the prose sweep, not the suite set); `tests/e2e/crew-page.spec.ts:892` is a live multiline chain (test.describe on one line, .skip( on the next) — the §4.10 compound block is dead. `test.skip(` sites inside e2e files are case-level skips within already-enumerated files.
2. Aliased/conditional: `grep -rn "? describe : describe\.skip" tests/` → 5 sites (`resolveBlockerRebuild`, `finalizeInlineRescan`, `materializeRoundTrip`, `publishedPullSheetOverrideRpc`, `parseErrorReasonPersist`) — all CONDITIONAL env-gated db fallbacks that DO run with a DB present: outside the dead-suite class by construction; recorded here so no future sweep re-derives them.
3. Prose sweeps: the phrase-family grep (widened: `compound test|audit suite|the helper covers|exercised by e2e|exercised in e2e|compound-transition tests|Regression-guarded by the audit|covered by e2e|covered in e2e|tested by e2e`) AND a suite-filename citation grep (each dead suite's `<name>.spec` cited outside its own file), both over `lib/ tests/ components/ app/`.

Disposition table (every hit in the committed output falls in exactly one row):

| Class | Sites | Disposition |
|---|---|---|
| Coverage claims citing dead suites (the entry's class) | `lib/visibility/capabilityTransitions.ts` lines 39, 152, 170 + its line-235 matrix REASON STRING ("tested by e2e"); `lib/time/rightNowTransitions.ts:83`; `tests/visibility/capabilityTransitions.test.ts` lines 8, 244; `tests/visibility/transportTransitions.test.ts:10`; `tests/e2e/helpers/rightNow.ts` lines 23, 239, 259, 288, 291; `lib/visibility/openingReelText.ts:20` (cites dead `empty-state.spec` AC-4.5); `tests/components/atoms/Section.test.tsx:26` (cites dead `layout-dimensions.spec`); `tests/components/crew/transitionAudit.test.tsx:5` (cites the dead crew-page §4.10 compound block) | DELETE or REWRITE honest present-tense; the line-235 string is executable copy — its rewrite keeps the matrix text truthful ("compound interactions have no executing e2e coverage; see BL-E2E-APP-DEPENDENT-SPECS-CI-DARK") |
| Self-referential prose INSIDE dead files describing their own skipped siblings | `tests/e2e/right-now-transitions.spec.ts` lines 2, 44, 76, 84, 182 | REWRITE to name the skip ("the (skipped) compound audits") — one-phrase edits; the file header's `describe.skip` alone does not travel with quoted claims |
| "full audit suite" catalog copy | `lib/messages/catalog.ts` lines 2451, 2454 + the generated `lib/messages/__generated__/spec-codes.ts:219` + pin `tests/messages/popoverContextCopy.test.ts:62` | FALSE POSITIVE — "audit suite" = the branch-protection required-check set, not a test suite; NO edit (a copy edit here would trigger the §12.4 lockstep for zero gain) |
| Same-file live reference | `tests/visibility/transportTransitions.test.ts:195` ("the two compound tests below") | FALSE POSITIVE — refers to executing tests in the same file; keep |
| Coverage claim outside every phrase family | `tests/time/rightNowTransitions.test.ts` lines 6-8 ("Animation-behavior tests live in right-now-transitions.spec.ts") — caught by the filename-citation sweep, not the phrase sweep (plan R2 F4) | REWRITE honest present-tense |
| Non-suite grep artifacts | `tests/fixtures/ledger-mass/2026-08-04.ledgers.json` (a committed ledger FIXTURE whose embedded prose contains the tokens); `tests/cross-cutting/db-test-timeout-floor.test.ts:303` (comment-only alias example) | FALSE POSITIVE — neither is a suite nor a coverage claim; keep |
| Deliberately honest sites | `tests/visibility/capabilityTransitions.test.ts` lines 224, 272 | KEEP VERBATIM (entry pins these as already-honest) |
| Infrastructure filename citations | `walker-routes.test.ts` exemption rows, `_metaE2eWorkflowCoverage.test.ts` allowlist, `_metaSpecRegistration.test.ts` commands, `devSpecNonEmpty.test.ts` guard, `picker-flow-e2e-ci-wiring.test.ts` | FALSE POSITIVE — they name files as artifacts/allowlist rows, claiming no execution; keep |
| Cross-spec descriptive mirrors ("same seed as", "mirrors §4.9", "same pattern as") | `theme-toggle.spec.ts:17`, `tests/e2e/crew-layout-dimensions.spec.ts` lines 32, 47, `tests/e2e/crew-section-toggle.spec.ts` lines 272, 293, `report-modal.spec.ts:43`, `empty-state.spec.ts:18`, `layout-dimensions.spec.ts:44`, `tests/e2e/stage-restricted-crew-schedule.spec.ts` lines 8, 48, 81, `tests/e2e/source-link-dimensional.spec.ts` lines 37, 45, `developer-tier.spec.ts:37`, `needs-attention-page.spec.ts:6`, `right-now-transitions.spec.ts:607`, `_sectionHeaderWidths.ts:10`, `section-header-width-anchors.test.ts:7` | FALSE POSITIVE — describe implementation provenance, claim no coverage; keep |

Steps: (1) RED: none executable for prose deletion; proof = the table above re-verified against fresh sweep output at execution + `pnpm vitest run tests/visibility/ tests/time/` green after edits + the archive RED. (2) Apply the DELETE/REWRITE rows. (3) Archive the entry (archive-RED pattern) with the table + the ratified no-guard decision. (4) Commit `docs(backlog): delete the skipped-suite coverage-claim class; archive BL-COVERAGE-CLAIMS-CITE-SKIPPED-SUITES`.

### Task L2 — zero-code closures + demotes (one commit each, archive RED pattern each)

- **L2a** BL-ATTENTION-PANEL-NAME-LEADING-SECTION — archive; owner ruling (keep the deliberate name) + trigger preserved. `docs(backlog): archive BL-ATTENTION-PANEL-NAME-LEADING-SECTION — owner keeps the leading-section name`.
- **L2b** BL-RESYNC-STAGED-REVIEW-UI — archive; re-open trigger (operator asks for diff review) verbatim.
- **L2c** BL-ROLEFLAGSNOTICE-DROP-GUARD — archive; preserve the four refuted-designs list + locked-wrapper structural note as the fix-shape.
- **L2d** BL-CI-OVERLAP-BOOT-WITH-SETUP — archive; preserve measurement table, runner facts, `legfix`/`legwall` pointer, pre-baked-Postgres-image lever; note the dormant source branch `origin/chore/ci-overlap-boot-with-setup`.
- **L2e** BL-CI-RECLASSIFY-PARALLEL-STABILITY — archive; preserve the two re-attempt preconditions + reusable-asset pointers.
- **L2f** BL-ACCENT-BUTTON-ATOM-SWEEP — archive at honest census (3 live `MIGRATED_FILES`); preserve migration mechanics + trigger; state that repo-wide token coverage remains `tests/styles/_metaBgAccentInventory.test.ts`'s job.

### Task L3 — BL-CI-PARALLEL-DB-FALLBACK-AUDIT: probe, then demote or keep

1. Probe (both runs from the W-LDOCS worktree, local stack up via preflight):
   - DB-present: `pnpm vitest run --project=parallel --reporter=json --outputFile=<scratch>/parallel-db.json`
   - Closed-port: same command with every Supabase env endpoint pointed at `http://127.0.0.1:1` (`SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `TEST_DATABASE_URL` → `postgresql://127.0.0.1:1/none`) — a REFUSED connection, not an absent variable, per the entry's protocol.
   - Diff per-file assertion counts derived from `assertionResults[].status` per file in the JSON envelope (Vitest's JSON reporter exposes NO per-file `numPassingAsserts` — probed against installed Vitest, plan R1 F2; the shipped precedent for this exact derivation is `scripts/run-excluded-test.mjs`, its per-file `assertionResults` walk). Per-file metric = count of `assertionResults` with status `passed`; a file DEGRADES when that count drops FOR ANY REASON, or when ANY of its assertions newly reports `skipped`, or when the file reports only `skipped` results (plan R2 F1 — a drop 'explained' by a skip is exactly the fallback shape, never a pardon; this line and the decision rule below state one identical predicate). Small script committed alongside the transcript.
2. Validity gate BEFORE the decision rule (spec §2.1.3, R1 F3): both runs must exit with parseable JSON reports covering the IDENTICAL file set; the DB-present run must report a nonzero total assertion count; the diff script validates its fields (absent field = INVALID, never zero) — precedent `scripts/run-excluded-test.mjs` (its report-validation block: child-exit, numeric-field, `testResults`, exact-file-attribution checks). An invalid probe means fix-and-re-run; the entry is NEVER archived on an invalid probe.
3. Decision rule over a VALID probe (pre-ratified, total): a file whose count drops, newly skips, or reports all-skipped under the closed port is DEGRADING. Zero degrading → archive with the transcript (answered-negative). Any degrading → entry STAYS OPEN, resized to the named instances with count deltas; each listed file then either moves to serial or gains a fallback-under-test note — THAT follow-through work is the resized entry's content, not this wave's.
4. Commit `docs(backlog): settle BL-CI-PARALLEL-DB-FALLBACK-AUDIT by probe — <archive|resize> per result`.

### Task L4 — decompositions (one commit per umbrella)

- **L4a** BL-MUTATION-HARNESS-OPEN-HOLES → file `BL-MUTATION-REF-SUB`, `BL-MUTATION-UNICODE`, `BL-MUTATION-COLUMN-SHIFT`, `BL-MUTATION-MERGED-CELL`, `BL-MUTATION-SECTION-ORDER` as standalone sized entries (default M each; adjust honestly per class), each carrying its corpus evidence, `OPERATOR_FINDING_MAP` linkage, and the shrink-only ratchet contract. Archive the umbrella with the decomposition record. RED: archive RED + `pnpm vitest run tests/parser/mutation/knownHoles.test.ts` green (BL- refs resolve) + `pnpm vitest run tests/docs/` green.
- **L4b** BL-E2E-LIFECYCLE-SPECS-CI-DARK → refile as `BL-E2E-APP-DEPENDENT-SPECS-CI-DARK` (L): the ~60 app-dependent standalone-allowlist specs; promotion = incremental green batches; owner GitHub-settings action recorded. Archive the umbrella with the full wiring history (both lifecycle specs wired in `lifecycle-layout-e2e.yml`).
- **L4c** BL-OPS-LOG → file `BL-OPS-LOG-OAUTH-EMITS` (S), `BL-OPS-LOG-ONBOARDING-EMIT` (S), `BL-OPS-LOG-DASHBOARD-BANNER` (M, Opus/UI, design-gated), symbol-anchored per spec §2.1.4; archive the umbrella with the built/MOOT inventory.
- **L4d** BL-RESURRECT-MOBILE-SAFARI-E2E → refile at honest scope (~20 tile/crew specs; `crew-e2e.yml` template; id decision: KEEP the id — cheaper for cross-references; the refiled body corrects the premise). Archive nothing if the id is kept: the entry body is REWRITTEN in place at honest scope with a dated correction note. (If review prefers the new id, archive + refile — either satisfies spec AC-L1.)

### Task L5 — BL-PARSER-FIELD-PROVENANCE-MODEL: new filing

File the L entry per spec §2.1.5 (audit citations, shipped-already record #367/#379, remainder = full provenance model for the named P0-2 zero-signal residuals). RED: `pnpm vitest run tests/docs/` green (new entry parses, referential integrity holds). Commit `docs(backlog): file BL-PARSER-FIELD-PROVENANCE-MODEL — the provenance-model remainder, honestly scoped`.

### Task L6 — newly-L classification stamps + 3 executed archives

1. Stamp all 11 stamp-only entries per the spec §2.1.6 table (`l-wave-screen 2026-08-06: <classification> — <one-line reason>` on the meta block); resize BL-PG-CRON-COVERAGE-UNRUN L→M in the same commit.
2. Execute the 3 archives (archive RED each): BL-ADOPTION-PIN-REACHABILITY-BLIND (triggers + backstop-deletion warning preserved), UNDO-FAILURE-REANNOUNCE-1 (from DEFERRED.md; owning-spec ratification cross-ref), BL-TRANSPORT-ID-RESOLUTION — but FIRST re-verify the entry's deferred regression pins landed with 8.3b: `grep -rn "Doug Larson Loadout\|namesRefer\|transportationOwnerIds" tests/visibility/` — pins present → archive with the Branch-0 probe; any missing → RESIZE to exactly the missing pin list instead (both outcomes compliant per spec).
3. Stamp BL-WATCH-PROMOTION-ACTIVATION-RACE PARKED (spec §2.1.7 wording). No other edit to it.

### Task L7 — close W-LDOCS

Strip EVERY surviving marker in the PR's last commit — 13 to 15 of the 27, depending on the two probe outcomes (12 entries always archive and shed markers in their moves: COVERAGE-CLAIMS, ATTENTION-PANEL, RESYNC-STAGED, the 4 demotes, the 3 umbrella archives, ADOPTION-PIN, UNDO-FAILURE-REANNOUNCE; CI-PARALLEL and TRANSPORT-ID also archive iff their probes say so; the always-surviving 13 are the 12 stamp-only entries incl. WATCH-PROMOTION plus the in-place RESURRECT rewrite). Terminal check, run and recorded: `grep -c 'Branch:\*\* feat/l-wave-docs' BACKLOG.md DEFERRED.md` returns 0 matches (plan R1 F3). `pnpm vitest run tests/docs/` green. PR body: preflight ran (not docs-only exempt); probe transcripts linked. CI green → merge → ff main → `0 0`.

`impeccable-gate: N/A — no UI surface` (W-LDOCS: ledger prose, code comments, probe transcripts).

## Unit W-PUSH — `feat/l-wave-push`

### Task P1 — the Report-a-problem link (TDD)

1. RED (spec §2.2 R1 F4 — shapes × channels, not files): one unit row PER RENDER SHAPE — `renderAutoPublishUndo`, `renderAutoPublishUndoBatch`, `renderDigest`, `renderRealtimeProblem` with `kind` `show`/`global`/`ingestion`, `renderRealtimeProblemBatch` (7 shapes; locate suites by `grep -rln "autoPublishUndo\|realtimeProblem\|renderDigest" tests/notify/`) — asserting BOTH bodies of `RenderedEmail`: the `html` contains an anchor whose text is "Report a problem" with the expected href, AND the `text` contains the labeled URL. EXECUTABLE PREMISES (plan R2 F2, `tests/_shared/premise.ts`): both batch rows premise their fixture length ≥ 2 — probed: `renderAutoPublishUndoBatch` and `renderRealtimeProblemBatch` each DELEGATE to their single-item renderer at length 1 (`autoPublishUndo.ts:101`, `realtimeProblem.ts:111`), so a 1-item batch fixture exercises only the delegate and proves nothing about the true multi-item body; the realtime single rows premise their `kind` value is the one named. Href = `${origin}/admin?show=<slug>` for shapes with a single show context (the show modal — the landed destination the per-show route itself redirects to; it hosts the existing show-scoped report controls), `${origin}/admin` for shapes without one (digest and batch multi-show bodies, realtime `global`/`ingestion`). The link is a NAVIGATIONAL entry point by ratified resize — memo form 1's one-click report form is explicitly NOT shipped (spec §2.2 item 2, §4 limit 6); the archive records the delta and its trigger. Hrefs fixture-derived (anti-tautology: derive expected from the fixture's origin+slug inputs, never hardcode a literal the implementation also hardcodes). Concrete failure modes caught: a batch path shipping without the link while its single-item sibling has it; a plaintext body missing what the HTML carries; an off-origin link.
2. GREEN: add the footer anchor via the existing `escapeHtml(href)` pattern to each body-producing template. No em dash in the new copy. No new route; `/api/report` untouched.
3. SAME COMMIT (spec §2.2 item 1, plan R2 F3): the BACKLOG entry's resize `**Effort:** L` → `**Effort:** S` plus its staleness-repair note (prereqs (a)/(c) refuted) land in THIS commit with the link — `feat(notify): add the Report-a-problem footer link to every push template; resize BL-PUSH-NOTIFICATIONS L->S`.

### Task P2 — archive + close

1. Archive the resized entry (archive RED) with memo cross-ref; forms 2–3, the memo form-1 delta (navigational pointer shipped, one-click form NOT), and the UNVERIFIED Doug-observation prerequisite recorded as explicitly NOT shipped, with the un-archive trigger named.
2. Strip the marker in the last pre-merge commit; PR; CI green → merge → `0 0`.

`impeccable-gate: N/A — no UI surface` (email HTML in `lib/notify/`; invariant-8 UI definition not triggered).

## Unit W-EMDASH — `feat/l-wave-emdash` (Opus, dual gate)

Pre-code mechanical UI gate applies to every copy repair. **The reconciliation sweep RAN at plan time** (plan R1 F4): the exact accept-set scanner (spec §2.3 node kinds, comment-stripped by construction — AST tokens carry no comments) ran over `components/**`, `app/**` (excl. `app/api/**`), `lib/**`; raw output (119 executable-literal hits) committed at `docs/superpowers/plans/2026-08-06-l-wave/e1-emdash-scan-2026-08-06.txt`; MDX census 20 instances in 2 files; catalog copy strings 0. Per-FILE dispositions below are the plan's decisions — the guard re-derives the hit list at execution and every hit must land in a decided row (a NEW file appearing = repair-or-exempt under the same row rules, recorded in the commit).

**REPAIR rows (user-visible copy — em dash out per DESIGN.md §9):** `app/show/[slug]/unpublish/copy.ts` (6); `components/admin/ShowsTable.tsx` (5), `components/admin/roleRecognizeCopy.ts` (5), `components/admin/PublishedToggle.tsx` (3), `components/admin/showpage/AttentionMenu.tsx` (2), `components/admin/review/ShowReviewSurface.tsx` (2), `components/admin/wizard/step3ReviewSections.tsx` (5), `components/admin/nav/NotifBell.tsx`, `components/admin/settings/DriveConnectionPanel.tsx`, `components/diagrams/Gallery.tsx`; `lib/sync/changeLog/fieldChanges.ts` (7, renders in `RecentAutoAppliedStrip`); `lib/parser/warnings.ts` (3), `lib/sync/blockDisappearance.ts`, `lib/sync/enrichTransportAssignees.ts` (operator warning copy); `lib/parser/blocks/scheduleBookends.ts` (4, generated schedule titles on crew Schedule/Today); `lib/drive/watchEscalation.ts` (2, operator emails); `lib/admin/step3ReviewItemTiers.ts`; `lib/notify/templates/realtimeProblem.ts`, `lib/notify/templates/autoPublishUndo.ts`; `app/help/_affordanceMatrix.ts` (2, rendered help labels); `app/admin/settings/admins/error.tsx` (admin error-page copy); `components/admin/RecentAutoAppliedStrip.tsx` (feed header copy); `app/help/**/*.mdx` (20).

**EXEMPT rows (registry entries with these exact reasons):** `app/admin/dev/page.tsx` (9) + `lib/dev/**` (2) — developer-gated surfaces, not product copy; `lib/audit/email-boundaries.generated.ts` (4) — generated artifact, regen would resurrect (generated files exempt by rule); SQL template literals (`lib/sync/runScheduledCronSync.ts` 7, `lib/sync/applyStaged.ts:608`, `lib/sync/runOnboardingScan.ts`, `lib/drive/watch.ts` 2) — SQL text/comments, never rendered; operator-invisible diagnostics (`components/realtime/ShowRealtimeBridge.tsx` 3, `lib/sync/applyStaged.ts` lines 1955 and 2060, `lib/sync/applyStagedCore.ts` 5, `lib/sync/unpublishBinding.ts`, `lib/validation/fixtures.ts` 4, `lib/validation/reseedFixtures.ts` 2, `app/help/_components/RefAnchor.tsx` 2 — log/throw strings surfaced only in consoles/CI, invariant 5 keeps them out of UI); `lib/reports/submit.ts` (3) — GitHub-issue body, developer-facing artifact; matrix reason-string metadata (`lib/visibility/capabilityTransitions.ts:208`, `lib/visibility/transportTransitions.ts:144`, `lib/time/rightNowTransitions.ts:178`) and parser decision-note registry strings (`lib/parser/blocks/crew.ts:451`, `lib/parser/blocks/rooms.ts:1679`) — dev-gallery/test-consumed metadata, not rendered to users; `components/admin/telemetry/TelemetryOverviewStrip.tsx:82` — sentinel glyph on the developer-gated telemetry page; `lib/parser/blocks/ops.ts:46` — sentinel glyph; `lib/parser/index.ts:185` — a REGEX character class matching sheet-authored dashes (load-bearing pattern literal, never copy); `lib/specLint/sections.ts:35` — quotes the canonical spec-heading text it lints for (the heading lives in `docs/**`, out of scope); additional diagnostics (`lib/audit/noGlobalCursor.ts:610`, `lib/driveIdCoverage/introspect.ts:145`, `lib/sync/phase2.ts:214`, `lib/onboarding/sessionLifecycle.ts:633` SQL, `lib/notify/deliver.ts:289` SQL); `lib/visibility/emptyState.ts:56` — the standalone U+2014 SENTINEL glyph (an empty-value placeholder, not prose; the sentinel-hiding contract treats it as a known sentinel).

**Tasks (guard grows per batch — each task RED → repair → GREEN → commit, plan R1 F5; a single end-state guard cannot be green between batches, so the guard's covered-roots config expands task by task):**

### Task E1 — guard over catalog + MDX; MDX repairs
1. RED: guard suite (working name _metaEmDashCopy.test.ts under `tests/styles/`) covering surfaces (a) catalog string literals + (b) MDX prose (fenced code elided), with the `--` rule (STRUCTURAL EXCLUSION, plan R2 F5: fenced code AND markdown table rows — any line whose trimmed form starts with `|` — are elided before the `--` scan; the five current MDX `--` hits (`app/help/admin/onboarding-wizard/page.mdx:92`, `app/help/admin/review-queues/page.mdx` lines 8 and 68, `app/help/admin/dashboard/page.mdx:24`, `app/help/admin/settings/page.mdx:22`) are all table delimiters and are excluded by that rule, not by per-hit exemptions) and per-surface planted-dash premise fixtures (`tests/_shared/premise.ts`, unconditional execution). Fails on the 20 MDX hits; catalog clean.
2. Repair the 2 MDX files per §9; GREEN; commit guard + repairs.

### Task E2 — extend roots to `lib/**`; lib copy repairs + exemption registry
1. RED: add `lib/**` to the guard's roots — fails on the lib rows above.
2. Repair the lib REPAIR rows; add the lib EXEMPT registry rows (reasons above); update every test pin asserting a changed string in the same commit (locate per string: `grep -rn "<the changed string>" tests/` — run per repaired literal; the known pin cluster is the Held/not-published string in `ShowsTable`/`perShowPage` tests and the archive-confirm copy in `ArchiveShowButton` tests, plus whatever each per-string grep returns). GREEN; commit.

### Task E3 — extend roots to `components/**` + `app/**`; component/app repairs
1. RED: add the remaining roots — fails on the component/app rows.
2. Repair + exempt per the rows; pins per the same per-string grep rule. GREEN; commit.

### Task E4 — screenshots, DESIGN.md, dual gate, archive
1. **Screenshot regen (decided at plan time, R1 F4; RED stated, R2 F6):** repaired copy RENDERS on captured surfaces — `scheduleBookends` titles on crew-preview-schedule/today, `ShowsTable` status strings on dashboard-overview, `fieldChanges` labels on dashboard-overview (RecentAutoAppliedStrip), `AttentionMenu` copy on needs-attention. **RED:** capture fresh WebPs FROM the pinned Playwright Docker image (`--platform linux/amd64`) against the repaired tree and run a byte comparison (`cmp`) against the committed baselines — the affected captures MUST differ (that failing comparison, recorded in the task record, is the executable red proving the baselines are stale); a capture that does NOT differ is recorded as unaffected and not regenerated. **GREEN:** commit the regenerated baselines; a re-capture now byte-matches. Help MDX prose renders in no product capture, so MDX-only changes ripple nothing. After any local verification capture outside this step: `git restore public/help/screenshots/`.
2. `DESIGN.md` §9 gains one sentence naming the guard as enforcement (prose edit; proof = `pnpm spec:lint` on touched docs + docs suites green — the stated prose-task proof, R2 F6).
3. `/impeccable critique` + `/impeccable audit` on the unit diff (canonical v3 setup gates); P0/P1 fixed or DEFERRED-entried; findings + dispositions in the unit closeout.
4. Archive BL-EM-DASH-POLICY (archive RED) recording resolution 2 shipped + accept-set + §4 limits; strip marker last pre-merge commit; PR; CI green → merge → `0 0`.

The dual gate runs at branch close; the wave `closeout.md` carries the filled marker line for this unit (M-wave precedent, its plan.md line 196).

## Adversarial review (cross-model)

- This plan: self-review (below) → codex-guard `--stage plan --round <n>` to APPROVE before execution handoff. Briefs carry the canonical CONSEQUENCE BOUND / THREAT MODEL FENCE block, REVIEWER ONLY, VERDICT + FINDINGS lines, round cap 4.
- Each unit branch: whole-diff codex-guard `--stage diff` review to APPROVE before merge (split tight-scope briefs if the diff exceeds a handful of files — W-EMDASH likely splits: guard+tests vs copy repairs).

## Execution handoff

Per spec §3 and the kickoff: this branch's PR merges (spec + plan + brief + marker handoff order per spec §3 steps 2–3 — unit branches claim FIRST from worktrees created off origin/main, then this branch strips all 29 markers in its last pre-merge commit). Then a NEW Opus pane (split per kickoff §4) executes W-LDOCS → W-PUSH → W-EMDASH from `HANDOFF.md` in this directory. Never end a turn mid-pipeline; 10-minute nudge per Stage-0 semantics in each driving session.

## Impeccable gate (this authoring branch)

This spec/plan branch ships no UI surface; the W-EMDASH unit's filled marker lands in this directory's `closeout.md` at wave close (M-wave precedent, its plan.md line 196).

impeccable-gate: N/A — no UI surface

## Self-review checklist (run before dispatching the plan review)

- [ ] Every named file/symbol re-grepped (pre-draft pass above; re-verify any task edited during review rounds).
- [ ] Anti-tautology: P1 hrefs fixture-derived; E1 premise fixtures unconditional; L3's diff script compares independent runs, not a run against itself.
- [ ] Reconciliation sweeps authored AND RUN: L1's two greps (outputs above), E1's guard-as-enumerator (RED run recorded), L3's probe (runs at execution — the plan fixes commands + decision rule, compliant because the DISPOSITION is the deliverable, not the sweep).
- [ ] `pnpm spec:lint docs/superpowers/plans/2026-08-06-l-wave/plan.md` 0 hard.
- [ ] Numeric sweep after every repair round.
