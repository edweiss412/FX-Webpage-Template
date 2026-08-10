# M-wave 2 implementation plan

> **For agentic workers:** execute task-by-task per `HANDOFF.md` in this directory (the Opus pane's entry point). The spec is APPROVED (codex-guard R6, 2026-08-09); this plan carries its own adversarial-review gate below.

**Goal:** close 18 pre-ratified ledger entries (15 work items + 2 docs demotes, one pair merged) across six themed units to six merged PRs.

**Architecture:** W-DOCS on `docs/m-wave-2-spec` (spec/plan/brief + demote archives + claim handoff), then `feat/m2-payload-hygiene`, `feat/m2-sync-fault-codes`, `feat/m2-e2e-infra`, `feat/m2-guard-precision`, `feat/m2-ui-cluster` off `origin/main`, each TDD per task, cross-model reviewed, CI-green merged, in that order.

**Date:** 2026-08-09 · **Spec:** `docs/superpowers/specs/2026-08-09-m-wave-2-design.md` (+ ratified brief `docs/superpowers/specs/2026-08-09-m-wave-2-decisions-brief.md`) · **Status:** DRAFT (plan-review round 1 repairs applied)

## Global constraints

- Every AGENTS.md plan-wide invariant binds; exercised here: 1 (TDD — every task below leads with its RED), 2 (advisory locks — topology table below), 6 (conventional commits), 8 (dual gates: W-UI full; W-SYNC scoped to `/help/errors`; W-GUARDS contingent), 9 (call-boundary registry — W-E2E), 11 (worktree-only), 12 (claims). Spec §1.1 = 13 do-not-relitigate ratifications; spec §4 = 9 documented limits.
- Guard premise rule (`tests/_shared/premise.ts`) for every new guard/meta-test; four pre-dispatch mutants for string-presence assertions; anti-tautology fixture derivation.
- No em dashes in new user-visible copy; 44px tap targets; canonical type/token classes.
- §12.4 lockstep triple for `ONBOARDING_INTERNAL_ERROR` (W-SYNC S1): master-spec prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts`, same commit, + help-family row. New-code CI fan-out = the four gates S1 step 5 names and runs.
- Validation-schema-parity three-step for the new column (S3): local apply → `pnpm gen:schema-manifest` commit → surgical validation apply + `notify pgrst, 'reload schema'`.
- **Marker-strip ordering (invariant 12 × review-covers-what-merges, resolved):** each branch runs its whole-diff cross-model review WITH markers still on; repairs loop inside the review; after APPROVE the marker-strip lands as the FINAL commit, verified marker-only by `git diff HEAD~1 --stat` touching ONLY `BACKLOG.md`/`DEFERRED.md` and `git diff HEAD~1 | grep '^[-+]' | grep -v '^[-+][-+]'` showing ONLY `**Status:**`-run lines. A strip commit failing that check re-enters review. The reviewed diff and the merged diff differ by exactly that mechanically-verified meta-line delta.

## Advisory-lock topology (invariant-2 enumeration; hashkeys `show:<drive_file_id>` unless noted; every surface single-holder)

Live holders, probed 2026-08-09 (`rg -n "pg_advisory_xact_lock|pg_try_advisory_xact_lock" lib scripts --glob '*.ts'`):

| Holder site | Layer | This wave |
|---|---|---|
| cron per-file pipeline (caller-held; `lib/sync/runOnboardingScan.ts:196` comment: "the caller is the single holder of `show:driveFileId`"; apply core asserts, never re-acquires — `lib/sync/runScheduledCronSync.ts:1858`) | JS-side wrapper | S3 column write joins existing locked statements; NO new acquisition |
| wizard rescan `lib/onboarding/rescanWizardSheet.ts:207` | JS-side | unchanged |
| finalize flows `lib/onboarding/sessionLifecycle.ts:223` and `lib/onboarding/sessionLifecycle.ts:763` (+ `finalize:` keys at `lib/onboarding/sessionLifecycle.ts:421` and `lib/onboarding/sessionLifecycle.ts:782`) | JS-side | S3 stamp joins existing locked writes |
| validation backfill `scripts/backfill-validation-source-anchors.ts:75` | JS-side (`sql.begin`) | S3 TOCTOU guard added INSIDE this same tx |
| **NEW** migration backfill (S3) | in-migration per-row `pg_advisory_xact_lock` | standalone run; sole holder for its keys; precedent `supabase/migrations/20260611000001_onboarding_fixups_remediation.sql:62` |
| **NEW** e2e fixture writes (E1) | JS-side helper, `tests/e2e/helpers/lockedCrewRestriction.ts` pattern | `seedShowWithCrew.ts` repaired to this layer; structural ripple: `tests/help/walker-routes.test.ts:104` freezes `["seedShowWithCrew.ts", 3]` writes — that row is REKEYED in the same commit as the repair (shrink-only registry, so the change is loud by design) |

No hashkey gains a second holder layer anywhere in the wave.

## Meta-test inventory (declared)

- **CREATES:** `tests/parser/payloadZeroWidthEnriched.test.ts` (P1); z-band guard `tests/styles/_metaZIndexBands.test.ts` + registry `tests/styles/zIndexExemptions.ts` (U1); timing scanner `scripts/scan-interaction-timings.ts` + `tests/docs/_metaInteractionTimingInventory.test.ts` (U3); per-job cron smokes extending `tests/cross-cutting/pg-cron-coverage.test.ts` (E3); `lib/sheet-links/freshSourceAnchors.ts` + unit/integration rows (S3); no-migration-marker assertion in `tests/parser/mutation/knownHoles.test.ts` (P2).
- **EXTENDS / RE-KEYS:** `tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts` + `popoverOverlayRegistry.ts` (G1); `tests/help/_metaUiLabelCrosswalk.test.ts` (G2); `tests/e2e/helpers/fontFidelityFixture.ts` (E2); font identity pipeline — `scripts/subset-inter.sh`, `tests/helpers/fontManifest.ts`, `tests/styles/fontLoadingMutants.test.ts`, `tests/styles/fontFeatureAvailability.test.ts` `PINNED_RANGE_COVERAGE` (U5); `tests/help/walker-routes.test.ts` seed-write freeze row (E1); crew-e2e executed-count/wiring registries — `scripts/check-crew-e2e-executed.mjs` + `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` (E1).
- **Registries:** invariant-9 rows (or inline reasons) for E1's new session-seeding call sites; invariant-10 — no new mutation surface (S1/S2 error-path telemetry on instrumented paths; S3 rides existing mutations); discovery to the contrary adds the row same-commit.

## Plan-time sweeps (authored AND RUN 2026-08-09; corrected in plan-review r1)

- **Z-index utilities** — command: `rg -o '\bz-[0-9]+\b' app components --glob '*.tsx' | grep -oE 'z-[0-9]+' | sort | uniq -c` → `z-0`×1, `z-10`×12, `z-20`×12, `z-30`×10, `z-40`×9, `z-50`×15, `z-60`×2 in className context = **61 utility occurrences** (the raw grep's `z-100` hit is the COMMENT at `components/admin/PreviewBanner.tsx:66` — the banner's live stacking is the inline `zIndex: 100` at `components/admin/PreviewBanner.tsx:69`, counted as the one inline site; the guard counts className-context utilities + inline numerics, so its expected census = 61 + 1). `z-60` lives at `components/admin/dev/SwitcherControls.tsx:78`.
- **Band set, FIXED HERE (spec §2.6 requires it at plan time); values = current numerics so the sweep is name-substitution with zero stacking change:** `--z-raised: 10` · `--z-dropdown: 20` · `--z-nav: 30` · `--z-banner: 40` · `--z-overlay: 50` · `--z-dev-controls: 60` · `--z-sticky-banner: 100`. `z-0` is a stacking reset, not a band — exemption-registry row with that reason. Per-site band mapping is the U1 sweep table (mechanical: same numeral → same band).
- **Timing constants** — deriving command (the scanner reproduces it): `rg -n "setTimeout\(|setInterval\(|duration:\s*[0-9]|const [A-Za-z][A-Za-z0-9_]*([Mm][Ss]|SECONDS|[Dd]elay|[Dd]uration|[Tt]imeout)\s*=\s*[0-9]" app components --glob '*.ts' --glob '*.tsx'`. Known members: 3 raw literals (`app/admin/show/[slug]/ShareLinkCopyButton.tsx:108` 2_000; `components/admin/wizard/step3ReviewSections.tsx:1627` 5_000; `components/crew/RightNowHero.tsx:352` 60_000), `submitTimeoutMs = 30_000` (`components/shared/ReportModal.tsx:176`), spec r4's fifteen non-exported named timings, explicit include `ARM_REVERT_MS` (`lib/admin/destructiveConfirm.ts:18`). **`app/api/**` is EXCLUDED by the scanner with its reason in code** (server route budgets — `maxDuration` at `app/api/cron/sync/route.ts:15`, `TOKEN_TTL_SECONDS` at `app/api/realtime/subscriber-token/route.ts:39`, Drive timeouts in `app/api/asset/**` — are not user-perceived interaction timing); those three named hits are the exclusion's own premise fixtures.
- **Cron jobs** — command: `grep -rh "cron.schedule(" supabase/migrations/*.sql | grep -oE "fxav_cron_[a-z_]+" | sort -u` → **9 distinct jobs**: asset_recovery, diagram_gc, gc_watch, keepalive, notify_digest, notify_realtime, refresh_watch, report_reaper, sync. (Earlier "10" counted refresh_watch's reschedule row; corrected per plan-review r1 F8.)
- **Popover registry:** 7 files in `tests/components/admin/showpage/popoverOverlayRegistry.ts` (BellPanel, FinalizeButton, HoverHelp, PublishedToggle, ReSyncButton, AttentionMenu, ShareHub).
- **Crosswalk corpus:** 171 distinct bolded spans under `app/help/**/*.mdx`.
- **fontTools:** 4.63.0 present.

## Unit W-DOCS — on `docs/m-wave-2-spec` (this branch; docs-only, preflight skip declared in PR body)

Archive RED, stated once, used by D1+D2 — this is the RATIFIED wave convention, not a test-local artifact (M-wave-1 plan preamble, adopted verbatim by L-wave §2.1.2: "each archive's executable RED is the M-wave preamble pattern"): move the entry body to the owning archive file WITH its flight marker intact, run `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts`, observe the named failure (archives categorically reject in-flight entries — proves the guard sees THIS entry), strip the marker, rerun GREEN.

### Task D1 — BL-PICKER-CLEANUP-REVALIDATE-QUERY-VARIANT: demote + archive
**Files:** modify `BACKLOG.md`, `BACKLOG-archive.md`.
1. Move the full body to `BACKLOG-archive.md` (marker intact) with dated resolution: premise refuted in-body 2026-08-03 (probe block preserved verbatim); worst case = cleared stale-entry hint lingering until next navigation; filing-bar demotion per spec §2.1. Preserve verbatim the three obstacles and the measure-first re-attempt rule. Re-open trigger: next stale-cleanup change or a persisting-hint report.
2. Run: `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` — Expected: FAIL naming this entry (in-flight entry in archive). Strip the marker; rerun — Expected: PASS. Then `pnpm vitest run tests/docs/` — PASS.
3. Commit `docs(backlog): archive BL-PICKER-CLEANUP-REVALIDATE-QUERY-VARIANT — refuted premise, filing-bar demotion`.

### Task D2 — UNDO-UNCATALOGUED-CODE-CARD-1: demote + archive
**Files:** modify `DEFERRED.md`, `DEFERRED-archive.md`.
Same mechanics as D1 (archive RED → strip → green). Resolution: no live surface (entry's own catalog citations); preserve un-defer trigger + fix shape (resolve code before render). Commit `docs(deferred): archive UNDO-UNCATALOGUED-CODE-CARD-1 — no live surface, filing-bar demotion`.

### Task D3 — claim handoff + spec-branch PR (LAST commits; handoff-by-overlap per spec §3)
**Files:** modify `BACKLOG.md`, `DEFERRED.md` (markers) here and in five new worktrees.
1. Merge `origin/main` if anything landed; `pnpm vitest run tests/docs/` green.
2. **Create the five unit worktrees from the MAIN CHECKOUT (absolute, cwd-independent):**
```bash
git -C /Users/ericweiss/FX-Webpage-Template worktree add -b feat/m2-payload-hygiene  /Users/ericweiss/FX-worktrees/m2-payload-hygiene  origin/main
git -C /Users/ericweiss/FX-Webpage-Template worktree add -b feat/m2-sync-fault-codes /Users/ericweiss/FX-worktrees/m2-sync-fault-codes origin/main
git -C /Users/ericweiss/FX-Webpage-Template worktree add -b feat/m2-e2e-infra        /Users/ericweiss/FX-worktrees/m2-e2e-infra        origin/main
git -C /Users/ericweiss/FX-Webpage-Template worktree add -b feat/m2-guard-precision  /Users/ericweiss/FX-worktrees/m2-guard-precision  origin/main
git -C /Users/ericweiss/FX-Webpage-Template worktree add -b feat/m2-ui-cluster       /Users/ericweiss/FX-worktrees/m2-ui-cluster       origin/main
```
3. **Claims checks from the main checkout** (its branch is `main`, so no wave branch is excluded as self), one per unit with FULL ids, EXPECTING exit 1 naming `docs/m-wave-2-spec` and ONLY it (any other branch = real collision, stop):
```bash
cd /Users/ericweiss/FX-Webpage-Template
pnpm ledger:claims --check BL-ZERO-WIDTH-POST-PARSE-ENRICHMENT BL-MUTATION-DRIFT-TRIAGE
pnpm ledger:claims --check BL-PREPARE-INTERNAL-FAULT-KIND BL-CRON-WORKBOOK-FAULT-CODE BL-SOURCE-ANCHORS-STALE-AFTER-FAILED-GID-FETCH
pnpm ledger:claims --check BL-RIGHTNOW-SECTION57-FIXTURE-INERT BL-RIGHTNOW-RECOVERY-CASE-NEEDS-RESTRICTED-VIEWER BL-FONT-CENSUS-ORACLE-FLAKE-BLOCKS-CREW-E2E BL-PG-CRON-COVERAGE-UNRUN
pnpm ledger:claims --check BL-POPOVER-REGISTRY-PER-FILE-AND-TAILWIND-ONLY BL-CROSSWALK-HAYSTACK-RENDERED-TEXT-ONLY
pnpm ledger:claims --check BL-ADMIN-SEMANTIC-Z-INDEX-SCALE STEP3-GALLERY-TAP-TARGETS-1 SHARELINK-CONSTANTS-INVENTORY-1 SHEETLINK-SUBTLE-ACTION-CLASS-1 BL-GLYPHS-OUTSIDE-INTER-SUBSET
```
Expected per invocation: exit 1, collision table naming `docs/m-wave-2-spec` only.
4. In each new worktree: mark its subset `**Status:** IN PROGRESS · **Branch:** <unit branch>` (plain-text edit, pre-install), `git commit --no-verify`, `git push -u origin <branch>`.
5. **Marker-removal commit on `docs/m-wave-2-spec`:** strip the 16 handed-off markers (D1/D2 carried theirs into the archives). `pnpm vitest run tests/docs/` green. Push. No instant undeclared on origin.
6. PR (spec + brief + plan + archives + marker handoff + review-rounds corpus); body declares docs-only preflight skip; CI green → `gh pr merge --merge` → `git -C /Users/ericweiss/FX-Webpage-Template pull --ff-only` → `git rev-list --left-right --count main...origin/main` = `0  0`.
7. Unit worktrees then each: `pnpm install && pnpm worktree:link-env && pnpm preflight`; merge `origin/main` before first task commit; standing refresh after every earlier unit lands and before own PR.

`impeccable-gate: N/A — no UI surface`

## Unit W-PARSE — `feat/m2-payload-hygiene`

### Task P1 — BL-ZERO-WIDTH-POST-PARSE-ENRICHMENT
**Files:** create `tests/parser/payloadZeroWidthEnriched.test.ts`, `lib/parser/zeroWidth.ts` (FIXED home — no in-branch decision); modify `lib/parser/index.ts`, `lib/parser/blocks/_helpers.ts`, `lib/sync/enrichWithDrivePins.ts`, `lib/sync/pullSheetOverride.ts`, `lib/drive/exportSheetToMarkdown.ts`, `lib/parser/blocks/hotelConfTokens.ts` (consolidation DECIDED: it imports the shared helper — same character class, plain import, no behavior change).
1. **RED first:** write `tests/parser/payloadZeroWidthEnriched.test.ts` — fixture Drive payloads planting U+200B in each covered field (`embeddedImages[].sheetTab` both branches, `embeddedImages[].alt`, `linkedFolderItems[].alt`, `archivedPullSheetTabs[].tabName`, `.headerPreviews[]`) through `enrichWithDrivePins` + the archived-tab attach path; assert the ENRICHED payload zero-width-free; plus a clean-fixture pass row (premise both signs).
   Run: `pnpm vitest run tests/parser/payloadZeroWidthEnriched.test.ts` — Expected: FAIL at every planted field (the entry's SILENT_WRONG probes are these reds).
2. Implement: extract `stripZeroWidth` to `lib/parser/zeroWidth.ts`; `lib/parser/index.ts` + `clean()` + `hotelConfTokens.ts` import it; strip at the five Drive-string sites. **Structural uniqueness proof (spec AC-M2; corrected r2 F3):** the guard's scan is COMMENT-STRIPPED and matches BOTH forms — escaped `\u200B`-class sequences AND raw zero-width glyph literals — over production `.ts` under `lib/parser/**`, `lib/sync/**`, `lib/drive/**`; it asserts the ONLY production definition site is `lib/parser/zeroWidth.ts` (the helper module is the expected single hit, not excluded from the scan). Planted-mutant premise rows both ways: a scratch escaped-form literal AND a scratch glyph-form literal each fail by name; a comment mention does not. Sweep RUN 2026-08-09, per-hit disposition: `lib/parser/index.ts:559` (definition → moves to helper), `lib/parser/index.ts:555` + `lib/parser/blocks/_helpers.ts:46` + `lib/parser/blocks/hotels.ts:343` (comments — stripped, no hits post-guard), `lib/parser/blocks/_helpers.ts:50` (character class → imports helper), `lib/parser/blocks/hotelConfTokens.ts:125` (raw-glyph class, the form a naive escaped-only scan misses → imports helper). Class-sweep: `rg -n 'sheetTab|\.alt|headerPreviews|tabName' lib/sync/enrichWithDrivePins.ts lib/sync/pullSheetOverride.ts lib/drive/exportSheetToMarkdown.ts`; new Drive-string entry points join same-commit.
3. Run: `pnpm vitest run tests/parser/` — Expected: PASS (guard + existing suites; mutation oracle untouched by design).
4. Fingerprint note (spec §4 limit 2) in the archive entry. Commit `fix(sync): strip zero-width at every Drive-string payload boundary via shared helper`.

### Task P2 — BL-MUTATION-DRIFT-TRIAGE
**Files:** modify `tests/parser/mutation/knownHoles.ts`, `tests/parser/mutation/knownHoles.test.ts`, `BACKLOG.md`/`BACKLOG-archive.md`.
1. **RED first (durable production-shaped assertion, not a grep):** add to `knownHoles.test.ts` a row asserting NO ledger row note contains `re-kinded by classifier` (mechanism triage owed = un-triaged debt in the instrument itself; the assertion also guards recurrence).
   Run: `pnpm vitest run tests/parser/mutation/knownHoles.test.ts` — Expected: FAIL, 143 rows named/counted.
2. Triage: per row, confirm the histogram's derived shape (125 snippet-moved / 14 reorder-only / 4 blockRef.index-moved) against the row's baseline-vs-mutant diff; replace the marker with the mechanism name. Script pass fine; a disagreeing row is ESCALATED in the PR body, never re-shaped (mis-anchor = likely-regression per the owning spec §11.5).
3. Run: `pnpm vitest run tests/parser/mutation/` — Expected: PASS (new row green; shrink-only ratchet untouched).
4. Archive the entry; commit `test(parser): mechanism-triage the 143 re-kinded text_drift ledger rows`.

`impeccable-gate: N/A — no UI surface`

## Unit W-SYNC — `feat/m2-sync-fault-codes`

### Task S1 — BL-PREPARE-INTERNAL-FAULT-KIND
**Files:** modify `lib/sync/runOnboardingScan.ts` (union + `asPrepareError`), `lib/sync/roleMappingOverlay.ts`, `lib/sync/pullSheetOverride.ts` (three helpers), `lib/messages/catalog.ts`, `lib/messages/__generated__/spec-codes.ts` (regen), `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4, `app/help/errors/_families.ts`; test homes: the existing onboarding-scan unit suites + `tests/cross-cutting/codes.test.ts`.
1. **RED first:** unit rows asserting each of the four helpers (`applyRoleTokenMappings`, `reconcileIncludedTab`, `discardAndRerun` fix-up, `finalizeArchivedTabs`) surfaces `PrepareOnboardingFileError` with `kind: "internal"` → `ONBOARDING_INTERNAL_ERROR`.
   Run: `pnpm vitest run tests/sync/ -t internal` — Expected: FAIL (union has two members; code absent).
2. Implement union member + throw sites + mapping; finalize severity stays `error`.
3. Lockstep same commit: §12.4 row (contact-developer copy, no em dash) + `pnpm gen:spec-codes` + catalog row + `app/help/errors/_families.ts` row.
4. Run: `pnpm vitest run tests/sync/ tests/cross-cutting/codes.test.ts` — Expected: PASS.
5. **Four-gate CI fan-out for the new code, all run and recorded:** (a) x1 catalog-parity (`tests/cross-cutting/codes.test.ts`); (b) help-family coverage (`pnpm vitest run tests/help/`); (c) messages/catalog suites (`pnpm vitest run tests/messages/`); (d) full `pnpm test` before push (the pre-push full-suite rule). Any gate this list mis-names is corrected to the repo's actual gate set in the commit body — the obligation is the ENTRY's "full four-gate CI fan-out", discharged by running every catalog-consuming gate.
6. Commit `feat(sync): internal fault kind for post-parse helpers with ONBOARDING_INTERNAL_ERROR`.

### Task S2 — BL-CRON-WORKBOOK-FAULT-CODE
**Files:** modify `lib/sync/runScheduledCronSync.ts` (per-file catch); test home: cron-path unit suite (existing `tests/sync/` cron files).
1. **RED first, through the LIVE boundary (plan-review r2 F2):** synthesis happens inside `fetchSheetMarkdownAndBytesAtRevision` (`lib/drive/fetch.ts:490-494`), and the cron path wraps its throw as `kind: "fetch_failure"` with `code: classifySyncFailure(error)` (the wrapper near `lib/sync/runScheduledCronSync.ts:2966-2980`) — NOT the outer per-file catch. The RED therefore injects fixture xlsx bytes that make `synthesizeMarkdownFromXlsx` throw inside the fetch layer (mock at the Drive-bytes boundary, real synthesis code) and asserts on the STAGED ROW the pipeline records: code `PARSE_ERROR_LAST_GOOD`, parse-family presentation (not a Drive-failure read), and the show's last-good payload UNCHANGED byte-wise. Negative row: a non-synthesis fetch throw still records via the existing classification.
   Run: `pnpm vitest run tests/sync/ -t "workbook synthesis"` — Expected: FAIL (records `SYNC_FILE_FAILED` today, Drive-family).
2. Implement: the `instanceof WorkbookSynthesisError` case inside `classifySyncFailure` (`lib/sync/runScheduledCronSync.ts:2518`) returning `PARSE_ERROR_LAST_GOOD` — the single classification point both the wrapper and the outer catch call. If the RED's family assertion shows the `fetch_failure` kind wrapper still surfaces the row Drive-family crew-visibly, the wrapper gains the parse-family arm for this type in the same commit (the RED decides; both sites are named). Run again — Expected: PASS. No new §12.4 row.
3. Commit `fix(sync): corrupt cron workbook reports PARSE_ERROR_LAST_GOOD (ratified)`.

### Task S3 — BL-SOURCE-ANCHORS-STALE-AFTER-FAILED-GID-FETCH (spec §2.3 matrix is the contract)
**Files:** create `supabase/migrations/<ts>_source_anchors_modified_time.sql`, `lib/sheet-links/freshSourceAnchors.ts` + its test; modify `lib/data/getShowForViewer.ts`, `components/admin/review/publishedAdapter.ts`, `lib/sync/runScheduledCronSync.ts` (coalesce sites at lines 3073 and 1527), `lib/sync/runOnboardingScan.ts` (line 1350), the two finalize flows `app/api/admin/onboarding/finalize/route.ts` + `app/api/admin/onboarding/finalize-cas/route.ts` (probed 2026-08-09 — `rg -ln source_anchors`; `lib/onboarding/sessionLifecycle.ts` holds locks but writes no anchors), the staging carriers `lib/sync/applyStagedCore.ts` / `lib/sync/phase1.ts` / `lib/onboarding/shadowPayload.ts`, `scripts/backfill-validation-source-anchors.ts`, `supabase/__generated__/schema-manifest.json` (regen).
1. **RED first (production behavior, per the RED-validity rule):** the crew-page integration pair and the admin published-review row, written against the LIVE tree — a stale-anchor fixture (anchors present, data revision advanced) renders a DEEP LINK today because no comparison exists anywhere; the rows assert the `#gid=0` fallback and therefore FAIL against production, not against a missing import. Run: `pnpm vitest run tests/data/ tests/components/admin/review/ -t "anchor freshness"` — Expected: FAIL (deep link rendered where fallback asserted). The `freshSourceAnchors(anchors, stamp, lastSeen)` unit rows (match → map; mismatch → empty; NULL → empty) land WITH the helper as its function spec.
2. Migration: column + legacy backfill (stamp = `last_seen_modified_time` where `source_anchors` non-empty) as a cursor loop copied from the remediation precedent's SHAPE (`20260611000001_onboarding_fixups_remediation.sql:62`): rows selected `ORDER BY drive_file_id` (deterministic lock order — two concurrent lockers of overlapping key sets cannot invert), `pg_advisory_xact_lock(hashtext('show:' || r.drive_file_id))` as the FIRST statement of each loop body, the `UPDATE` after it. **Executable lock-shape proof (not a bare count):** a recorded check that the migration text contains the ordered cursor (`grep -n "order by drive_file_id"`) AND that within the loop body the lock line's line number precedes the update's (`grep -n "pg_advisory_xact_lock\|update public.shows" <file>` — lock first), pasted in the commit body. Apply local; `pnpm gen:schema-manifest`; surgical validation apply + `notify pgrst, 'reload schema'`.
3. **Remaining REDs, then implement writers/readers:** **pre-migration-populated row proof** (seed a row with non-empty anchors + NULL stamp, run the backfill statement, assert the deep link renders identically post-migration — spec F6); writer rows (fresh-write stamps Drive modifiedTime; preserve keeps old stamp); validation-backfill rows (unraced: stamp=watermark deep link; raced W1≠W2: NULL stamp + warning printed).
   Run: `pnpm vitest run tests/sheet-links/ tests/data/ tests/components/admin/review/` — Expected: FAIL pre-implementation, PASS after.
4. Class-sweep, RUN 2026-08-09 (`rg -ln source_anchors lib/ components/ app/ scripts/`) — 14 files, per-hit disposition: WRITERS (stamp per §2.3): `lib/sync/runScheduledCronSync.ts`, `lib/sync/runOnboardingScan.ts`, `app/api/admin/onboarding/finalize/route.ts`, `app/api/admin/onboarding/finalize-cas/route.ts`, `lib/sync/applyStagedCore.ts`, `lib/sync/phase1.ts`, `lib/onboarding/shadowPayload.ts`, `scripts/backfill-validation-source-anchors.ts`. READERS (helper): `lib/data/getShowForViewer.ts`, `components/admin/review/publishedAdapter.ts`. FRESH-BY-CONSTRUCTION (inline reason): `components/admin/wizard/Step3Review.tsx`, `components/admin/wizard/step3ReviewSections.tsx` (staging anchors just computed by the scan), `lib/admin/step3SectionStatus.ts`, `components/admin/OnboardingWizard.tsx` (same staging source). DEV FIXTURE (inline reason, non-production): `lib/dev/publishedModalFixture.ts`. Implementation re-runs the command; a new consumer gets a disposition in the same commit.
5. `/help/errors` scoped dual-gate run (S1's family row is the unit's only invariant-8 surface); P0/P1 fixed or DEFERRED-entried; RAN-form marker to `closeout.md`.
6. Commits: `feat(db): source_anchors revision stamp column + locked legacy backfill` · `feat(sync): stamp anchor writers + freshness helper at every reader` · `fix(scripts): TOCTOU guard in backfill-validation-source-anchors`.

`impeccable-gate:` filled RAN form at closeout (scoped `/help/errors`).

## Unit W-E2E — `feat/m2-e2e-infra`

### Task E1 — RIGHTNOW pair (discovery-first; entries close together or resize together)
**Files:** modify `tests/e2e/right-now-transitions.spec.ts`, `tests/e2e/helpers/seedShowWithCrew.ts`, `tests/help/walker-routes.test.ts` (freeze row rekey), `scripts/check-crew-e2e-executed.mjs` + `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` (enrollment registries), `.github/workflows/crew-e2e.yml`; invariant-9 registry rows as needed.
e2e harness-readiness (writing-plans rule, stated): server boot = the crew-e2e prod-build boot `crew-e2e.yml` already uses; readiness gate = `driveToState`'s rendered-state assertion (never `networkidle`); detach-safety = `toPass`-wrapped `locator.evaluate` with attached-check for any sampler that can outlive its node.
1. **RED first (lock repair):** structural assertion (new row beside the walker-routes freeze) that `seedShowWithCrew.ts` contains NO bare PostgREST write to `shows`/`crew_members` outside the locked-helper wrapper.
   Run: `pnpm vitest run tests/help/walker-routes.test.ts` — Expected: FAIL against today's helper (three bare writes; the frozen `["seedShowWithCrew.ts", 3]` row at `tests/help/walker-routes.test.ts:104` is REKEYED in the same commit so the shrink is loud, not silent).
2. Repair the helper to the `lockedCrewRestriction.ts` pattern (JS-side holder; single layer); invariant-9 rows or inline reasons for its call sites. Reconcile with `BL-LOCKED-FIXTURE-HELPER-TARGETS-REMOTE-DB` if `fix/quick-wins-2-mech` lands first.
3. DISCOVERY: under a real crew viewer (email-matched session, `tests/e2e/stage-restricted-crew-schedule.spec.ts` pattern), instrument RightNowHero to find its actual anchor source; record in the PR body.
4. **RED (fixture drive):** re-pointed fixture with DISCRIMINATING values (≠ show-start anchor, ≠ any clock rendering); flip test = change the fixture value, hero assertion must move. Recovery case enters `viewer_off_day` via a restricted crew viewer through real resolution.
5. GREEN + wiring: un-skip; enroll in `crew-e2e.yml` AND both exact-set registries. Verification order (r2 F5 — the executed-count script READS a Playwright JSON report and exits 1 without one): FIRST produce the report by running the crew suite locally exactly as `crew-e2e.yml` does (its playwright invocation with the JSON reporter writing the crew report file under the test-results directory (the exact path `check-crew-e2e-executed.mjs` names in its own error message) — copy the workflow's command line verbatim at execution time), THEN `node scripts/check-crew-e2e-executed.mjs` — Expected: PASS with the suite counted; and `pnpm vitest run tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` — Expected: PASS. Flip-test output in the commit body.
6. Lawful alternative (spec §2.4): anchor source not per-test drivable → both entries resize to that named finding.
7. Commit `test(e2e): right-now suite drives the hero's real anchor source under a locked crew-viewer harness`.

### Task E2 — BL-FONT-CENSUS-ORACLE-FLAKE
**Files:** modify `tests/e2e/helpers/fontFidelityFixture.ts` (+ a deterministic reproduction row).
1. Diagnose: why the registered-face query fails on a readable document (`fontFidelityFixture.ts:400`; pre- vs post-navigate discriminated). Candidates: closed/navigating page mid-sample; `document.fonts` not yet queryable.
2. **RED (deterministic reproduction, post-diagnosis):** new standalone spec `tests/e2e/font-oracle-readiness.spec.ts`, registered in `tests/e2e/standalone.config.ts` testMatch + `tests/e2e/standalone-baseline.json` (the M-wave G2 wiring precedent — a spec not added there runs nowhere), forcing the identified condition (e.g., sampling before `document.fonts.ready` resolves). Run: the standalone runner on that spec — Expected: FAIL reproducing the flake's exact `enforce` message deterministically.
3. Fix: readiness gate (`document.fonts.ready`-class await) or live-document retry — fail-loud preserved (unreadable after the gate still throws).
4. Run: the reproduction row PASSES; then 5 consecutive green crew-e2e runs recorded in closeout (the entry's bar).
5. Commit `fix(e2e): font oracle awaits font readiness before the registered-face sample`.

### Task E3 — BL-PG-CRON-COVERAGE-UNRUN residual (9 jobs)
**Files:** modify `tests/cross-cutting/pg-cron-coverage.test.ts` (+ smoke helpers).
1. **RED first (representative job):** planted no-op mutant — a job body with its `net.http_get` commented out and `select 1;` — the new smoke MUST fail against it (premise: the smoke can fail). Run: targeted vitest row — Expected: FAIL against the mutant fixture, PASS against the real job.
2. Per-job disposition, authored from the migration bodies (all nine are `net.http_get` to an app route; RUN 2026-08-09): sync → `/api/cron/sync` (existing smoke — the template); asset_recovery → `/api/cron/asset-recovery`; diagram_gc → `/api/cron/diagram-gc`; gc_watch → `/api/cron/gc-watch`; keepalive → `/api/cron/keepalive`; notify_realtime → `/api/cron/notify?job=realtime`; notify_digest → `/api/cron/notify?job=digest`; refresh_watch → `/api/cron/refresh-watch`; report_reaper → `/api/cron/report-reaper`. Smoke shape per job: prove the scheduled command's `net.http_get` actually issues against ITS route and the route's own observable effect fires (helpers in a new `tests/cross-cutting/pgCronSmokes.ts`, consumed by `pg-cron-coverage.test.ts`); a job whose route effect cannot be observed cheaply gets its named documented-limit row instead — never silent.
3. Wire into `pg-cron-validation-parity` (`x-audits.yml`). Commit `test(db): per-job pg-cron firing smokes with named limits` and PUSH first (r2 F6 — a workflow dispatch resolves the REMOTE ref; dispatching before push tests the previous tip); then Run: `gh workflow run x-audits.yml --ref feat/m2-e2e-infra`, await green, record URL in the closeout.
4. Archive the entry in a follow-up docs commit.

`impeccable-gate: N/A — no UI surface`

## Unit W-GUARDS — `feat/m2-guard-precision`

### Task G1 — BL-POPOVER-REGISTRY re-key
**Files:** modify `tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts`, `tests/components/admin/showpage/popoverOverlayRegistry.ts`.
1. **RED first:** the entry's two reviewer probes as self-tests — (a) undispositioned second overlay appended to a registered file MUST fail; (b) inline-style mutant (`style={{ position: "absolute", top: "100%", overflowY: "auto" }}`) MUST be detected.
   Run: `pnpm vitest run tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts` — Expected: the new self-test rows FAIL against the shipped per-file key + Tailwind-only classifier (the recorded escapes).
2. Implement: registry keyed per OVERLAY (stable marker = the overlay element's `data-testid`, FIXED — overlays lacking one gain one in the same commit); classifier widened to inline-style positioning (structural accept-set); seven files' overlays re-dispositioned; unreadable constructs REPORTED unclassified. Registry header states the fence (runtime-assembled styles, spread-in props → documented limit).
3. Run again — Expected: PASS both signs on the real tree. Commit `test(admin): popover registry keyed per-overlay with inline-style recognition`.

### Task G2 — BL-CROSSWALK-HAYSTACK rebuild
**Files:** modify `tests/help/_metaUiLabelCrosswalk.test.ts`; create `tests/help/_uiLabelThirdPartyCarve.ts` (third-party rows, own reason field) and `tests/help/_uiLabelIndirectCopySources.ts` (indirect-copy rows: reason + render-site citation).
1. **RED first:** negative premise fixture (planted non-rendered constant matching a help label does NOT attest) + positive fixture (planted JsxText DOES) + the existing bare-identifier documented-limit pin (its flip to green is the entry-level RED).
   Run: `pnpm vitest run tests/help/_metaUiLabelCrosswalk.test.ts` — Expected: fixtures FAIL against the current all-source haystack.
2. Implement the render-position AST haystack (spec §2.5 node set); carve registries (reason fields; Share/Viewer seeded; indirect-copy rows cite render sites).
3. Triage every newly-failing label (denominator 171): corrected copy / carve row / indirect-copy row — same PR. Mdx copy corrections FLIP the unit gate to the dual gate before merge.
4. Run: `pnpm vitest run tests/help/` — Expected: PASS. Commit `test(help): crosswalk haystack rebuilt to rendered positions with third-party and indirect-copy carves`.

`impeccable-gate: N/A — no UI surface` (CONTINGENT — closeout records the flip if mdx changed)

## Unit W-UI — `feat/m2-ui-cluster` (Opus, impeccable dual-gate)

Order: U1 → U2 → U3 → U4 → U5 → U6. `/impeccable` setup gates before ANY code. Pre-code mechanical checklist per task.

### Task U1 — BL-ADMIN-SEMANTIC-Z-INDEX-SCALE
**Files:** create `tests/styles/_metaZIndexBands.test.ts`, `tests/styles/zIndexExemptions.ts`; modify `app/globals.css` (@theme) + every census site.
1. **RED first:** the band guard — walks `app/**`+`components/**` for numeric z in BOTH idioms (utility `z-<n>` in className context AND inline `zIndex:` numerics), plus a planted-fixture premise row.
   Run: `pnpm vitest run tests/styles/_metaZIndexBands.test.ts` — Expected: FAIL listing the census (62 utility occurrences incl. `z-60`/`z-100`, + `PreviewBanner.tsx:69` inline).
2. Implement: the FIXED band set (`--z-raised:10 · --z-dropdown:20 · --z-nav:30 · --z-banner:40 · --z-overlay:50 · --z-dev-controls:60 · --z-sticky-banner:100`) in `app/globals.css` `@theme`; sweep every site to its numeral's band (name substitution, zero stacking change); `z-0` → exemption row (stacking reset, not a band).
3. Run again — Expected: PASS. Commit `feat(admin): semantic z-index band tokens + dual-idiom sweep and guard`.

### Task U2 — STEP3-GALLERY-TAP-TARGETS-1 item (d)
**Files:** modify `components/admin/wizard/step3ReviewSections.tsx` / `components/admin/wizard/Step3Review.tsx` row-slot chrome; create `tests/components/admin/wizard/step3RowSlot.test.tsx` (the two count assertions below); existing wizard suites updated where pins move.
1. **RED first:** DOM assertions on the six-variant seeded gallery encoding the spec's falsifiable shape — distinct action-treatment count in the row slot = 1; no bordered card inside a bordered container within the slot.
   Run: targeted vitest/RTL rows — Expected: FAIL against today's three vocabularies (bare-text "View", bordered "Review", two inline error actions) + nested chrome.
2. Design + implement under the dual gate (WHICH class family wins and which border yields are the in-branch calls; the counts are the contract).
3. Run again — Expected: PASS. Archive entry with the resolution recorded. Commit `fix(admin): one affordance vocabulary + flattened chrome in the Step-3 row slot`.

### Task U3 — SHARELINK-CONSTANTS-INVENTORY-1
**Files:** create `scripts/scan-interaction-timings.ts`, `tests/docs/_metaInteractionTimingInventory.test.ts`; modify `DESIGN.md` §5.5.
1. **RED first (test + scanner land together; the RED is against production DESIGN.md):** scanner per spec §2.6 (universe `app/**`+`components/**` minus `app/api/**` — exclusion IN CODE with its reason and the three named api hits as premise fixtures; forms: literal timer delays; case-insensitive `ms/delay/duration/timeout/seconds`-suffixed numeric bindings incl. default params; motion `duration:`; TOTALITY over every timer delay arg — literal, resolved-covered, or UNCLASSIFIED-emitted; explicit include `ARM_REVERT_MS`). Inventory test derives expected population from the scanner and compares to `DESIGN.md` §5.5.
   Run: `pnpm vitest run tests/docs/_metaInteractionTimingInventory.test.ts` — Expected: FAIL (today's §5.5 lists a fraction of the derived population). Planted-unlisted-constant premise row included.
2. Implement: §5.5 rewritten as the pinned inventory (value + owning file per row); UNCLASSIFIED set empty or registry-dispositioned.
3. Run again — Expected: PASS. Commit `docs(design): §5.5 pinned interaction-timing inventory derived from committed scanner`.

### Task U4 — SHEETLINK-SUBTLE-ACTION-CLASS-1
**Files:** modify `components/admin/review/ModalCloseButton.tsx`, `components/admin/RescanSheetButton.tsx`, `components/admin/BellPanel.tsx` (bell-panel-close), `components/admin/HelpSheet.tsx` + their pinned tests + header baselines.
1. **RED first:** class assertions on the four targets expecting the action-affordance class, added to each component's pinning suites — located at task start with `rg -l "ModalCloseButton" tests/`, `rg -l "RescanSheetButton" tests/`, `rg -l "bell-panel-close" tests/`, `rg -l "HelpSheet" tests/` (the four commands ARE the locator; every hit updates in the recolor commit). Run those suites — Expected: FAIL on `text-text-subtle`.
2. Recolor; SAME COMMITS update pinned tests + byte-for-byte header baselines; any help screenshots regenerate FROM the pinned Playwright image `--platform linux/amd64`; `git restore public/help/screenshots/` after local verification captures.
3. Run: affected suites — Expected: PASS. Archive; commit `fix(admin): icon-only action targets adopt the action-affordance class`.

### Task U5 — BL-GLYPHS-OUTSIDE-INTER-SUBSET
**Files:** modify `scripts/subset-inter.sh`, `public/fonts/` (new hashed woff2 + PROVENANCE.md), `app/fonts.css`, `components/FontPreload.tsx`, `tests/helpers/fontManifest.ts`, `tests/styles/fontLoadingMutants.test.ts`, `tests/styles/fontFeatureAvailability.test.ts` (`PINNED_RANGE_COVERAGE`).
1. Probe (output committed to `docs/superpowers/plans/2026-08-09-m-wave-2/glyph-probe.md`): widened-universe scan (`.ts`/`.tsx`/`.mdx` under `app/`+`components/` + CSS `content:` declarations) × full InterVariable face → partition (a) Inter-carries / (b) Inter-lacks. Known adds: U+22EE (five help MDX pages), U+2303/U+2304 (`app/globals.css:785` and `app/globals.css:788`).
2. **RED:** a coverage row in `tests/styles/fontFeatureAvailability.test.ts` (beside `PINNED_RANGE_COVERAGE`, which it updates in lockstep) asserting every partition-(a) codepoint ∈ the shipped woff2 cmap.
   Run: `pnpm vitest run tests/styles/` — Expected: FAIL against the current subset (the missing glyphs named).
3. Implement THROUGH the pipeline: widen ranges in `scripts/subset-inter.sh`, regenerate, update the full identity ripple (fonts.css, FontPreload, manifest path/URL/filename/digest, PROVENANCE, loading mutants, `PINNED_RANGE_COVERAGE`) — same commits.
4. Run: `pnpm vitest run tests/styles/` + font-census e2e — Expected: PASS. Archive with the partition-(b) residue note + site lists. Commit `feat(assets): widen Inter subset to the probe-derived glyph set via the identity pipeline`.

### Task U6 — dual-gate closeout
1. Transition-audit: grep the unit diff for `AnimatePresence`/exit/initial/animate; every new conditional render deliberately instant; recorded.
2. Dimensional invariants: spec declares none; audit confirms; violation triggers the layout-dimensions rule before close.
3. `/impeccable critique` + `/impeccable audit` (canonical v3 gates); P0/P1 fixed or DEFERRED-entried; findings + dispositions in `closeout.md` §12; §3.3 RAN-grammar marker line.

## Per-branch closeout (all units)
1. Entries archive with resolution paragraphs (or E1's lawful resize).
2. Whole-diff cross-model review WITH markers still on (codex-guard; REVIEWER ONLY + convergence block + VERDICT/FINDINGS + cap 4; detached `nohup … & disown` dispatch; split tight-scope briefs when large — W-SYNC and W-UI likely split). Repairs loop inside review.
3. After APPROVE: the marker-strip FINAL commit, verified marker-only (Global-constraints check); a strip failing the check re-enters review.
4. Real CI green → `gh pr merge --merge` → ff main → `0  0`. **Stage 4.4 per unit:** `CronDelete` that unit's nudge, clear pane + agent labels, set that worktree's marker `stage: "done"`; the NEXT unit re-runs Stage 0 in its own worktree (fresh marker with own sessionId + nudge + labels) — per-unit lifecycle, nothing left armed on a merged branch.
5. After the LAST merge: `pnpm ledger:mass`; record the delta vs baseline (77 / 365) in `closeout.md` for AC-PROG.

## Adversarial review (cross-model) — plan gate
This plan goes to codex-guard review (REVIEWER ONLY, convergence block, VERDICT, cap 4) after self-review; execution handoff only on APPROVE. Declared planned-file lint class: `tests/parser/payloadZeroWidthEnriched.test.ts`, `scripts/scan-interaction-timings.ts`, `lib/parser/zeroWidth.ts`, `tests/styles/_metaZIndexBands.test.ts`, `tests/styles/zIndexExemptions.ts`, `tests/docs/_metaInteractionTimingInventory.test.ts`, `lib/sheet-links/freshSourceAnchors.ts` — files this plan creates.

## 12. Closeout

impeccable-gate: N/A — no UI surface

(The marker covers THIS plan-document unit and the `docs/m-wave-2-spec` branch — spec/plan/brief docs + ledger archives; no UI surface. W-SYNC's scoped `/help/errors` run and W-UI's full dual-gate get their own filled RAN-form markers in this directory's `closeout.md`; W-GUARDS' contingent flip is recorded there too.)

## Execution handoff
`HANDOFF.md` (this directory) is the Opus pane's self-contained entry: per-unit Stage 0 → tasks → per-unit Stage 4.4, starting at W-PARSE Task P1 (W-DOCS executes in the authoring session before handoff).
