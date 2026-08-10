# M-wave 2 implementation plan

> **For agentic workers:** execute task-by-task per `HANDOFF.md` in this directory (the Opus pane's entry point). The spec is APPROVED (codex-guard R6, 2026-08-09); this plan carries its own adversarial-review gate below.

**Goal:** close 18 pre-ratified ledger entries (15 work items + 2 docs demotes, one pair merged) across six themed units to six merged PRs.

**Architecture:** W-DOCS on `docs/m-wave-2-spec` (spec/plan/brief + demote archives + claim handoff), then `feat/m2-payload-hygiene`, `feat/m2-sync-fault-codes`, `feat/m2-e2e-infra`, `feat/m2-guard-precision`, `feat/m2-ui-cluster` off `origin/main`, each TDD per task, cross-model reviewed, CI-green merged, in that order.

**Date:** 2026-08-09 · **Spec:** `docs/superpowers/specs/2026-08-09-m-wave-2-design.md` (+ ratified brief `docs/superpowers/specs/2026-08-09-m-wave-2-decisions-brief.md`) · **Status:** DRAFT (pre-review)

## Global constraints

- Every AGENTS.md plan-wide invariant binds; the ones this wave exercises: 1 (TDD), 2 (advisory locks — three surfaces below), 6 (conventional commits), 8 (dual gates: W-UI full; W-SYNC scoped to `/help/errors`; W-GUARDS contingent), 9 (call-boundary registry — W-E2E harness), 11 (worktree-only), 12 (claims). Spec §1.1 lists the 13 do-not-relitigate ratifications; §4 lists 9 documented limits.
- Guard premise rule (`tests/_shared/premise.ts`) applies to every new guard/meta-test (payload zero-width guard, z-band guard, timing-inventory test, crosswalk haystack, popover registry).
- Four pre-dispatch mutants for every string-presence assertion (writing-plans rule); anti-tautology fixture derivation throughout.
- No em dashes in new user-visible copy; 44px tap targets; canonical type/token classes (pre-code mechanical UI gate, W-UI + the W-SYNC catalog copy).
- §12.4 lockstep triple for the ONE new code (`ONBOARDING_INTERNAL_ERROR`, W-SYNC): master-spec prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts`, same commit, plus the help-family row and warning-card check (fault codes are operator alerts, not ParseWarnings — no WARNING_CARD_COPY_CODES row; verified against `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md` §4.2 scope).
- Validation-schema-parity three-step checklist for the new column (W-SYNC): local apply → `pnpm gen:schema-manifest` commit → surgical validation apply.

## Advisory-lock topology (mandatory enumeration — three touched surfaces, all `show:<drive_file_id>` hashkeys, each single-holder)

| Surface | Holder layer | Note |
|---|---|---|
| Runtime anchor writers (cron/wizard/finalize) | existing per-path holders, unchanged | new column write joins existing locked statements; NO new acquisition |
| Migration backfill (S3) | in-migration `pg_advisory_xact_lock` per row | runs standalone; precedent `supabase/migrations/20260611000001_onboarding_fixups_remediation.sql:62` |
| Backfill-validation script | its existing JS-side `sql.begin` + advisory lock (`scripts/backfill-validation-source-anchors.ts:74-75`) | TOCTOU guard added INSIDE that same tx (S3) |
| e2e fixture writes (E1) | JS-side helper, `tests/e2e/helpers/lockedCrewRestriction.ts` pattern (its header: "invariant 2 admits no exception for fixture writes") | `seedShowWithCrew.ts` repaired to this layer; no second holder introduced |

## Meta-test inventory (declared per writing-plans rule)

- **CREATES:** enriched-payload zero-width guard `tests/parser/payloadZeroWidthEnriched.test.ts` (P1); z-band structural guard + exemption registry (U1); DESIGN.md §5.5 timing-inventory meta-test + committed scanner `scripts/scan-interaction-timings.ts` (U3); per-job cron smokes extending `tests/cross-cutting/pg-cron-coverage.test.ts` (E3); anchor-freshness helper unit rows + crew/admin integration pairs (S3).
- **EXTENDS / RE-KEYS:** `tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts` + `popoverOverlayRegistry.ts` (G1, per-overlay key + inline-style recognition); `tests/help/_metaUiLabelCrosswalk.test.ts` (G2, render-position AST haystack + third-party carve + indirect-copy registry); `tests/parser/mutation/knownHoles.ts` notes (P2); `tests/e2e/helpers/fontFidelityFixture.ts` (E2); font identity pipeline (`scripts/subset-inter.sh`, `tests/helpers/fontManifest.ts`, `tests/styles/fontLoadingMutants.test.ts`, `tests/styles/fontFeatureAvailability.test.ts` `PINNED_RANGE_COVERAGE`) (U5).
- **Registries:** invariant-9 — E1's new session-seeding Supabase call sites get `tests/auth/_metaInfraContract.test.ts` rows or inline `// not-subject-to-meta:` reasons; invariant-10 — no new mutation surface in any unit (S1/S2 are error-path telemetry on existing instrumented paths; S3's writers ride existing mutations; a discovery to the contrary adds the row in the same commit).

## Plan-time sweeps (authored AND RUN 2026-08-09; outputs are the working censuses)

- **Z-index:** 58 numeric `z-*` utility sites under `app/`+`components/` (bands 10/20/30/40/50; head of list in the U1 task) + 1 inline `zIndex: 100` (`components/admin/PreviewBanner.tsx:69`). Command: `grep -rEon '\bz-(10|20|30|40|50)\b' --include="*.tsx" components/ app/` and `rg -n 'zIndex\s*:' app components`.
- **Timing constants:** 3 raw literals (`ShareLinkCopyButton.tsx:108` 2_000, `step3ReviewSections.tsx:1627` 5_000, `RightNowHero.tsx:352` 60_000) + spec r4's fifteen non-exported named timings + `submitTimeoutMs = 30_000` default parameter (`components/shared/ReportModal.tsx:176`). The scanner (U3) is the deriving instrument; this census is its seed expectation.
- **Cron jobs:** 10 distinct `fxav_cron_*` names from `grep -rhn "cron.schedule(" supabase/migrations/*.sql`: asset_recovery, diagram_gc, gc_watch, keepalive, notify_digest, notify_realtime, refresh_watch, report_reaper, sync (+ refresh_watch's reschedule row). E3 dispositions each.
- **Popover registry:** 7 files in `tests/components/admin/showpage/popoverOverlayRegistry.ts` (BellPanel, FinalizeButton, HoverHelp, PublishedToggle, ReSyncButton, AttentionMenu, ShareHub). G1 re-dispositions per overlay.
- **Crosswalk corpus:** 171 distinct bolded spans under `app/help/**/*.mdx`. G2's triage denominator.
- **fontTools:** 4.63.0 present (`python3 -c "import fontTools"`). U5's generator dependency.

## Unit W-DOCS — on `docs/m-wave-2-spec` (this branch; docs-only, preflight skip declared in PR body)

Archive RED, stated once and used by D1+D2: move the entry body to the owning archive file WITH its flight marker intact, run `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts`, observe the named failure (archives categorically reject in-flight entries — proves the guard sees THIS entry); strip the marker, rerun to GREEN.

### Task D1 — BL-PICKER-CLEANUP-REVALIDATE-QUERY-VARIANT: demote + archive
1. Move the full body to `BACKLOG-archive.md` with a dated resolution paragraph: premise refuted in-body 2026-08-03 (`revalidatePath` tags are pathname-only on Next 16.2.10 — the probe block is preserved verbatim); worst case = a cleared stale-entry hint lingering until next navigation; filing-bar demotion per spec §2.1. Preserve verbatim: the three recorded obstacles (NEXT_REDIRECT swallowed; bare-canonical redirect lands `<SignInOrSkipGate>`; e2e `picker_epoch` write trips invariant 2) and the re-attempt rule ("start by MEASURING what screen renders after a stale cleanup"). Re-open trigger: next change to the stale-cleanup path, or a report of a persisting stale hint.
2. Archive RED per preamble; `pnpm vitest run tests/docs/` green.
3. Commit `docs(backlog): archive BL-PICKER-CLEANUP-REVALIDATE-QUERY-VARIANT — refuted premise, filing-bar demotion`.

### Task D2 — UNDO-UNCATALOGUED-CODE-CARD-1: demote + archive
1. Move to `DEFERRED-archive.md` with resolution: no live surface — every code reachable from the feed call sites has a catalog row today (entry's own citations); the empty-card render needs a future code addition to become reachable. Preserve the un-defer trigger (new feed-reachable code, or the next `lib/messages` pass) and the fix shape (resolve the code before deciding to render).
2. Archive RED per preamble; `pnpm vitest run tests/docs/` green.
3. Commit `docs(deferred): archive UNDO-UNCATALOGUED-CODE-CARD-1 — no live surface, filing-bar demotion`.

### Task D3 — claim handoff + spec-branch PR (LAST commits, order binding — handoff-by-overlap per spec §3)
1. Merge `origin/main` into `docs/m-wave-2-spec` if anything landed since; rerun `pnpm vitest run tests/docs/`.
2. **Unit branches claim FIRST:** create the five unit worktrees off `origin/main` (`git worktree add -b feat/m2-payload-hygiene ../FX-worktrees/m2-payload-hygiene origin/main`, same for `m2-sync-fault-codes`, `m2-e2e-infra`, `m2-guard-precision`, `m2-ui-cluster`). Run each `pnpm ledger:claims --check <unit ids>` FROM THE MAIN CHECKOUT `/Users/ericweiss/FX-Webpage-Template` (its branch is `main`, so no wave branch is excluded as self — the checker drops claims whose branch equals the invoker's own), EXPECTING exit 1 naming `docs/m-wave-2-spec` and ONLY it (planned-handoff signature; any other branch named = real collision, stop). In each new worktree: mark its subset `**Status:** IN PROGRESS · **Branch:** <unit branch>` (plain-text edit, pre-install), commit `--no-verify`, push `-u`. Unit subsets: W-PARSE = {ZERO-WIDTH-POST-PARSE-ENRICHMENT, MUTATION-DRIFT-TRIAGE}; W-SYNC = {PREPARE-INTERNAL-FAULT-KIND, CRON-WORKBOOK-FAULT-CODE, SOURCE-ANCHORS-STALE-AFTER-FAILED-GID-FETCH}; W-E2E = {RIGHTNOW-SECTION57-FIXTURE-INERT, RIGHTNOW-RECOVERY-CASE-NEEDS-RESTRICTED-VIEWER, FONT-CENSUS-ORACLE-FLAKE-BLOCKS-CREW-E2E, PG-CRON-COVERAGE-UNRUN}; W-GUARDS = {POPOVER-REGISTRY-PER-FILE-AND-TAILWIND-ONLY, CROSSWALK-HAYSTACK-RENDERED-TEXT-ONLY}; W-UI = {ADMIN-SEMANTIC-Z-INDEX-SCALE, STEP3-GALLERY-TAP-TARGETS-1, SHARELINK-CONSTANTS-INVENTORY-1, SHEETLINK-SUBTLE-ACTION-CLASS-1, GLYPHS-OUTSIDE-INTER-SUBSET}.
3. **Then the marker-removal commit on `docs/m-wave-2-spec`:** strip the 16 handed-off markers (D1/D2 archives already carried theirs out). `pnpm vitest run tests/docs/` green. Push. At no instant is any entry undeclared on origin.
4. Open the PR (spec + brief + plan + demote archives + marker handoff + review-rounds corpus), body declares the docs-only preflight skip; CI green → `gh pr merge --merge` → ff main → `0 0`.
5. Unit worktrees then each: `pnpm install && pnpm worktree:link-env && pnpm preflight`, and merge `origin/main` before the first task commit. Standing refresh: each unit merges `origin/main` after every prior unit lands and once more before opening its own PR; BACKLOG/archive conflicts resolve mechanically (both sides stand).

`impeccable-gate: N/A — no UI surface`

## Unit W-PARSE — `feat/m2-payload-hygiene`

### Task P1 — BL-ZERO-WIDTH-POST-PARSE-ENRICHMENT
Failure mode caught: an author-controlled Drive string (tab name, alt text, header preview) carrying U+200B-200D/FEFF entering the persisted payload and silently defeating equality (the entry's SILENT_WRONG probes).
1. Export the shared helper: `stripZeroWidth` moves from its module-local definition (`lib/parser/index.ts:559`) to one exported module (home decided in-branch, e.g. `lib/parser/zeroWidth.ts`), imported by `lib/parser/index.ts` AND the sync/drive sites. `clean()` (`lib/parser/blocks/_helpers.ts:50`) imports the same character class from it. Uniqueness scope per spec §2.2: no second character-class literal in `lib/sync/**`/`lib/drive/**` or the two consolidated parser sites; deliberate mirrors stay (mutation oracle `tests/parser/mutation/oracle.ts:81` per its own comment; `lib/parser/blocks/hotelConfTokens.ts:125` — consolidate if its import graph allows, else inline exemption comment with reason; `tests/**` fixture literals).
2. RED: `tests/parser/payloadZeroWidthEnriched.test.ts` — fixture Drive payloads planting a ZWSP in each covered field (`embeddedImages[].sheetTab` both branches, `embeddedImages[].alt`, `linkedFolderItems[].alt`, `archivedPullSheetTabs[].tabName`, `.headerPreviews[]`), run through `enrichWithDrivePins` and the archived-tab attachment path; assert the ENRICHED payload is zero-width-free. Fails against current tree at every field (the entry's probe verdicts are the expected reds). Premise: the planted fixture proves each assertion can fail (a clean fixture row asserts the guard passes clean).
3. GREEN: strip at the five entry sites (`lib/sync/enrichWithDrivePins.ts` sheetTab/alt/alt sites, `lib/drive/exportSheetToMarkdown.ts` archived-tab site attached via `lib/sync/pullSheetOverride.ts`) via the shared helper. Class-sweep at round 0: `rg -n 'sheetTab|\.alt|headerPreviews|tabName' lib/sync/enrichWithDrivePins.ts lib/sync/pullSheetOverride.ts lib/drive/exportSheetToMarkdown.ts` — any additional Drive-string entry point found joins the helper in the same commit.
4. Fingerprint note (spec §4 limit 2): one-line note in the archive entry — rekey affects only payloads that carried zero-width in Drive fields; one extra staged re-sync diff per affected show; no migration.
5. `pnpm test` green; commit `fix(sync): strip zero-width at every Drive-string payload boundary via shared helper`.

### Task P2 — BL-MUTATION-DRIFT-TRIAGE
1. For each of the 143 `text_drift` rows in `tests/parser/mutation/knownHoles.ts` carrying `[re-kinded by classifier; mechanism triage owed, BL-MUTATION-DRIFT-TRIAGE]`: confirm the histogram's derived shape (125 snippet-moved / 14 reorder-only / 4 blockRef.index-moved) against the row's own baseline-vs-mutant diff, replace the migration marker with the mechanism name. Mechanical script pass acceptable; a row whose confirmation DISAGREES with its derived shape is escalated in the PR body, never silently re-shaped (mis-anchor drift = likely-regression per the owning spec §11.5).
2. RED/GREEN: `grep -c "re-kinded by classifier" tests/parser/mutation/knownHoles.ts` — 143 before, 0 after; `pnpm vitest run tests/parser/mutation/` green throughout (shrink-only ratchet untouched).
3. Archive the entry; commit `test(parser): mechanism-triage the 143 re-kinded text_drift ledger rows`.

`impeccable-gate: N/A — no UI surface`

## Unit W-SYNC — `feat/m2-sync-fault-codes`

### Task S1 — BL-PREPARE-INTERNAL-FAULT-KIND
1. RED: unit rows asserting each of the four helpers (`applyRoleTokenMappings`, `reconcileIncludedTab`, `discardAndRerun`'s fix-up, `finalizeArchivedTabs`) surfaces a `PrepareOnboardingFileError` with `kind: "internal"` mapped to `ONBOARDING_INTERNAL_ERROR` — fails against the two-member union (`lib/sync/runOnboardingScan.ts:1164-1172`).
2. Implement: third union member `"internal"`; the four helpers' catch/wrap sites throw it; mapping to the new code; finalize severity stays `error`.
3. §12.4 lockstep, same commit: new row in master spec §12.4 (`ONBOARDING_INTERNAL_ERROR`, copy = contact-the-developer per the `ONBOARDING_FINALIZE_INTERNAL_ERROR` precedent at `lib/messages/catalog.ts:891`; no em dash) + `pnpm gen:spec-codes` + catalog row + help-family row in `app/help/errors/_families.ts`. `pnpm vitest run tests/cross-cutting/codes.test.ts` green.
4. Commit `feat(sync): internal fault kind for post-parse helpers with ONBOARDING_INTERNAL_ERROR`.

### Task S2 — BL-CRON-WORKBOOK-FAULT-CODE
1. RED: cron-path unit planting a `WorkbookSynthesisError` (`lib/drive/exportSheetToMarkdown.ts:325`) through the per-file loop's catch (anchor by the `classifySyncFailure(error)` call near `lib/sync/runScheduledCronSync.ts:3915-3925`); assert recorded code `PARSE_ERROR_LAST_GOOD` (`lib/messages/catalog.ts:187`) — fails (records `SYNC_FILE_FAILED` today). Negative row: a non-synthesis throw still classifies via `classifySyncFailure` (anti-leak).
2. GREEN: `instanceof WorkbookSynthesisError` arm selecting the existing code; outcome family and last-good behavior unchanged. No new §12.4 row.
3. Commit `fix(sync): corrupt cron workbook reports PARSE_ERROR_LAST_GOOD (ratified)`.

### Task S3 — BL-SOURCE-ANCHORS-STALE-AFTER-FAILED-GID-FETCH (the DB task; spec §2.3 matrix is the contract)
1. Migration: nullable timestamptz `shows.source_anchors_modified_time` + legacy backfill (stamp = `last_seen_modified_time` where `source_anchors` non-empty) inside a per-row `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))` loop (remediation precedent `20260611000001_onboarding_fixups_remediation.sql:62`). Apply local; `pnpm gen:schema-manifest` commit; surgical validation apply + `notify pgrst, 'reload schema'`.
2. RED: freshness-helper unit rows (match → map; mismatch → empty; NULL → empty), the five writer rows (fresh-write stamps, preserve keeps old stamp), crew-page integration pair (mismatch → `#gid=0`; match → deep link), admin published-review demote row, validation-backfill rows (unraced: stamp=watermark deep link; raced W1≠W2: NULL stamp + warning). All fail pre-implementation.
3. Implement: helper `freshSourceAnchors(anchors, stamp, lastSeen)` beside the builder; applied in `lib/data/getShowForViewer.ts` and `components/admin/review/publishedAdapter.ts`; writer stamps at the cron coalesce sites (`lib/sync/runScheduledCronSync.ts:3073` and `lib/sync/runScheduledCronSync.ts:1527`), wizard degrade path (`lib/sync/runOnboardingScan.ts:1350`), both finalize flows, `pending_syncs` staging carry-through; backfill-validation script gains W1-read → fetch → in-tx W2 recheck → stamp-or-NULL+warning. Class-sweep: `rg -n 'source_anchors' lib/ components/ app/ scripts/` — every consumer applies the helper or carries an inline fresh-by-construction reason (`step3ReviewSections.tsx:912` wizard chrome expected in the latter class).
4. `/help/errors` dual-gate run (critique + audit scoped to that page — the S1 family row is the unit's only invariant-8 surface); P0/P1 fixed or DEFERRED-entried; closeout marker per invariant 8.
5. Commit series: `feat(db): source_anchors revision stamp column + locked legacy backfill`, `feat(sync): stamp anchor writers + freshness helper at every reader`, `fix(scripts): TOCTOU guard in backfill-validation-source-anchors`.

`impeccable-gate:` filled RAN form at closeout (scoped `/help/errors` run).

## Unit W-E2E — `feat/m2-e2e-infra`

### Task E1 — RIGHTNOW pair (discovery-first; entries close together or resize together)
1. DISCOVERY: under a real crew viewer (email-matched session per `tests/e2e/stage-restricted-crew-schedule.spec.ts` header), instrument the RightNowHero render path to find its actual anchor source (the probe proved `shows_internal.run_of_show` is not it on this route). Record the finding in the PR body.
2. Repair `tests/e2e/helpers/seedShowWithCrew.ts` to the locked fixture pattern (`lockedCrewRestriction.ts` precedent; JS-side holder, single layer) — its bare PostgREST `shows` delete/insert + `crew_members` insert is a live invariant-2 violation. Invariant-9 rows (or inline reasons) for new Supabase call sites. Reconcile with `BL-LOCKED-FIXTURE-HELPER-TARGETS-REMOTE-DB` if `fix/quick-wins-2-mech` lands first.
3. RED: fixture values chosen DISCRIMINATING (never equal to the seed's show-start anchor nor to a clock rendering — the two coincidences that hid the defect); flip test: change the fixture value, watch the hero assertion move. Recovery case enters `viewer_off_day` through real resolution (restricted crew viewer), asserted via the `driveToState` rendered-state check.
4. GREEN: suite un-skipped, wired into `crew-e2e.yml`, flip test recorded in the commit body. If discovery shows the anchor source cannot be driven per-test, the honest outcome is both entries resized to exactly that finding (spec §2.4 carries both branches).
5. Commit `test(e2e): right-now suite drives the hero's real anchor source under a crew viewer`.

### Task E2 — BL-FONT-CENSUS-ORACLE-FLAKE
1. Reproduce/diagnose: why does the registered-face query fail on a document the element walk could read (`fontFidelityFixture.ts:400` throw; message distinguishes pre- vs post-navigate)? Candidates the entry names: closed/navigating page during sample; `document.fonts` not yet queryable.
2. Fix at the fixture: await a font-readiness gate (`document.fonts.ready`-class) or retry the sample on a live document — WITHOUT weakening fail-loud (a document unreadable after the gate still fails).
3. Proof: mechanism named in the commit with a reproduction note; then 5 consecutive green crew-e2e runs recorded in the closeout (the bar the entry blocks).
4. Commit `fix(e2e): font oracle awaits font readiness before the registered-face sample`.

### Task E3 — BL-PG-CRON-COVERAGE-UNRUN residual (per-job smokes)
1. For each of the 10 `fxav_cron_*` jobs: a smoke observing the job's SIDE EFFECT fire (the sync path's existing smoke is the template — command-text assertions are already proven insufficient). A job whose side effect cannot be observed cheaply gets a named documented-limit row in the suite (consequence bound: proven or named, never silent).
2. RED first for one representative job (planted no-op mutant: the smoke fails when the job body is inert); premise fixture per the guard rule.
3. Wire into the existing `pg-cron-validation-parity` job in `x-audits.yml`; fire `gh workflow run x-audits.yml --ref feat/m2-e2e-infra` and record the green run URL (real-CI proof, dev-gate pattern).
4. Archive the entry; commit `test(db): per-job pg-cron firing smokes with named limits`.

`impeccable-gate: N/A — no UI surface`

## Unit W-GUARDS — `feat/m2-guard-precision`

### Task G1 — BL-POPOVER-REGISTRY re-key (consequence bound + fence per spec §2.5)
1. RED: the entry's two reviewer probes as executable self-tests — (a) an undispositioned second overlay appended to a registered file MUST fail; (b) the inline-style mutant (`style={{ position: "absolute", top: "100%", overflowY: "auto" }}`) MUST be detected. Both pass-through today (the recorded escapes).
2. Implement: registry keyed by OVERLAY (stable per-element marker — testid or declared symbol) in `popoverOverlayRegistry.ts`; classifier widened to inline-style positioning (structural accept-set: position + overflow declarations however expressed in JSX); re-disposition the seven files' overlays under the new key; anything unreadable REPORTED unclassified. Registry header states the fence (runtime-assembled styles, spread-in props → documented limit).
3. GREEN: both self-tests (positive AND negative), real tree green; commit `test(admin): popover registry keyed per-overlay with inline-style recognition`.

### Task G2 — BL-CROSSWALK-HAYSTACK rebuild (render-position accept-set per spec §2.5)
1. RED: negative premise fixture — a planted non-rendered constant matching a help label does NOT attest it; positive fixture — a planted JsxText label DOES. Plus the existing bare-identifier documented-limit pin flipping green is the entry-level RED.
2. Implement the AST haystack: JsxText; string/template nodes (incl. TemplateHead/Middle/Tail) as/inside JSX expression children; allowlisted user-visible attributes (`aria-label`, `aria-description`, `title`, `alt`, `placeholder`, `label`). Third-party-UI carve registry (own reason field; Share/Viewer = Google Drive's controls, seeded); indirect-copy-source registry (reasons + render-site citations) for constant-defined copy.
3. Triage every newly-failing label (denominator: 171 bolded spans): corrected copy, third-party carve row, or indirect-copy row — same PR. If any mdx copy is corrected, the unit gate FLIPS to the dual gate before merge (spec §0 contingency).
4. Commit `test(help): crosswalk haystack rebuilt to rendered positions with third-party and indirect-copy carves`.

`impeccable-gate: N/A — no UI surface` (CONTINGENT — flips with mdx copy corrections; the closeout marker records which)

## Unit W-UI — `feat/m2-ui-cluster` (Opus, impeccable dual-gate)

Order: U1 (z tokens) → U2 (STEP3 d) → U3 (timing inventory) → U4 (icon-only recolor) → U5 (glyph subset) → U6 (dual-gate closeout). `/impeccable` setup gates before ANY code (canonical v3: context load PRODUCT.md + DESIGN.md, register reference). Pre-code mechanical checklist per task.

### Task U1 — BL-ADMIN-SEMANTIC-Z-INDEX-SCALE
1. RED: z-band guard — walks `app/**`+`components/**` for numeric z in BOTH idioms (Tailwind `z-<n>` utilities AND inline `zIndex:` numeric declarations); fails on the current 58+1 census (paste in the guard's first output); planted-fixture premise (a scratch numeric z fails by name).
2. Implement: `--z-*` band tokens in `app/globals.css` `@theme` (band set fixed from the live census: dropdown/sticky/overlay-backdrop/overlay/banner — exact names + values chosen in-branch under the dual gate); sweep all census sites to bands (`PreviewBanner.tsx:69` inline site included); numerics that map to no band are design questions resolved in the PR; reasons-required exemption registry for deliberate leftovers.
3. GREEN: guard green over the swept tree; contrast untouched (tokens are z-order, not color). Commit `feat(admin): semantic z-index band tokens + dual-idiom sweep and guard`.

### Task U2 — STEP3-GALLERY-TAP-TARGETS-1 item (d)
1. Against the six-variant seeded gallery (`/admin?step=3` seeded states): resolve the three affordance vocabularies (bare-text "View", bordered "Review", two inline error actions — plan §12 of `docs/superpowers/plans/admin/2026-08-02-step3-live-render-cluster.md`) into ONE visual class family, and flatten nested chrome to ≤1 bordered level in the row slot. WHICH family wins is the in-branch design call under the dual gate; the acceptance shape is falsifiable (spec §2.6): distinct action-treatment count in slot = 1; no bordered card inside a bordered container within the slot.
2. RED: RTL/DOM assertions encoding exactly those two counts against the gallery fixtures — fail against today's three-vocabulary slot.
3. GREEN + archive the entry with (d)'s resolution recorded. Commit `fix(admin): one affordance vocabulary + flattened chrome in the Step-3 row slot`.

### Task U3 — SHARELINK-CONSTANTS-INVENTORY-1
1. Implement `scripts/scan-interaction-timings.ts` per spec §2.6: universe `app/**`+`components/**`; forms — numeric-literal timer delays; numeric-initialized bindings (const/let/default param) with case-insensitive `ms/delay/duration/timeout/seconds` name suffix; numeric `duration:` motion props; TOTALITY: every `setTimeout`/`setInterval` delay arg is literal, resolved-covered, or emitted UNCLASSIFIED. Explicit include: `ARM_REVERT_MS` (`lib/admin/destructiveConfirm.ts`). `lib/**` infra exclusions live in the scanner with reasons.
2. RED: inventory meta-test derives expected population from the scanner and compares to `DESIGN.md` §5.5 — fails against today's §5.5 (seed census: the 2_000 clipboard reset, 5_000 outcome reset, 60_000 hero tick, `submitTimeoutMs`, the fifteen named constants). Premise: planted in-scope unlisted constant fails by name.
3. GREEN: §5.5 rewritten as the pinned inventory (values + owning file per row); UNCLASSIFIED set empty or registry-dispositioned. Commit `docs(design): §5.5 pinned interaction-timing inventory derived from committed scanner`.

### Task U4 — SHEETLINK-SUBTLE-ACTION-CLASS-1
1. RED: class assertions on the four icon-only action targets (`components/admin/review/ModalCloseButton.tsx`, `components/admin/RescanSheetButton.tsx`, `components/admin/BellPanel.tsx` bell-panel-close, `components/admin/HelpSheet.tsx`) — expect the action-affordance class the sheet-link branch established; fails on `text-text-subtle`.
2. GREEN: recolor; SAME COMMITS update every pinned test and the byte-for-byte header baselines ModalCloseButton feeds; any captured help screenshots regenerate FROM the pinned Playwright Docker image `--platform linux/amd64` (never the dev machine), `git restore public/help/screenshots/` after any local verification capture.
3. Archive; commit `fix(admin): icon-only action targets adopt the action-affordance class`.

### Task U5 — BL-GLYPHS-OUTSIDE-INTER-SUBSET
1. Probe first (spec §2.6 partition): re-run the fontTools + source scan with the widened universe (`.ts`/`.tsx`/`.mdx` under `app/`+`components/` + CSS `content:` declarations); partition against the full InterVariable face into (a) Inter-carries → MUST enter subset, (b) Inter-lacks (emoji-class) → residue note with site lists. Known adds: U+22EE (five help MDX pages), U+2303/U+2304 (`app/globals.css` generated content). Commit the probe output.
2. Implement THROUGH the pipeline: widen ranges in `scripts/subset-inter.sh`; regenerate; update `app/fonts.css:28`, `components/FontPreload.tsx`, `tests/helpers/fontManifest.ts` (path/URL/filename/digest), `public/fonts/PROVENANCE.md`, `tests/styles/fontLoadingMutants.test.ts`, `PINNED_RANGE_COVERAGE` in `tests/styles/fontFeatureAvailability.test.ts` — same commits.
3. GREEN: re-run probe shows partition (a) fully in the shipped subset; font-census e2e green; archive with residue note. Commit `feat(assets): widen Inter subset to the probe-derived glyph set via the identity pipeline`.

### Task U6 — dual-gate closeout
1. Transition-audit: spec's Transition Inventory declares no new visual state — grep the unit diff for `AnimatePresence`/exit/initial/animate; every new conditional render deliberately instant; recorded in closeout.
2. Dimensional invariants: spec declares none introduced; audit confirms; violation triggers the layout-dimensions rule (real-browser `getBoundingClientRect`) before close.
3. `/impeccable critique` + `/impeccable audit` on the unit diff (canonical v3 gates); P0/P1 fixed or DEFERRED-entried; findings + dispositions in this directory's `closeout.md` §12; marker line in the §3.3 RAN grammar.

## Per-branch closeout (all units)
1. Entries archive with resolution paragraphs (or resize per E1's lawful discovery outcome).
2. Flight markers stripped in the branch's LAST pre-merge commit.
3. Whole-diff cross-model review (codex-guard; REVIEWER ONLY + convergence block + VERDICT/FINDINGS lines + cap 4; split tight-scope briefs when the diff is large — W-SYNC and W-UI likely split). Detached dispatch (`nohup … & disown`) per the round-economy filing's infra note.
4. Real CI green → `gh pr merge --merge` → ff main → `0 0`.
5. After the last merge: `pnpm ledger:mass`; record the delta against baseline (77 / 365) in the wave closeout for AC-PROG.

## Adversarial review (cross-model) — plan gate
This plan goes to codex-guard review (REVIEWER ONLY, convergence block, VERDICT, cap 4) after self-review; execution handoff only on APPROVE.

## 12. Closeout

impeccable-gate: N/A — no UI surface

(The marker covers THIS plan-document unit and the `docs/m-wave-2-spec` branch — spec/plan/brief docs + ledger archives; no UI surface. W-SYNC's scoped `/help/errors` run and W-UI's full dual-gate get their own filled RAN-form markers in this directory's `closeout.md` at those branches' closeouts; W-GUARDS' contingent flip is recorded there too.)

## Execution handoff
`HANDOFF.md` (this directory) is the Opus pane's self-contained entry: takeover protocol (date → read AGENTS.md + spec + plan → overwrite marker sessionId → own cron nudge → pane/agent labels), then W-PARSE Task P1 (W-DOCS executes in the authoring session before handoff).
