# M-wave implementation plan

> **For agentic workers:** execute task-by-task per `HANDOFF.md` in this directory (the Opus pane's entry point). The spec is APPROVED (codex-guard R3, 2026-08-05); this plan carries its own adversarial-review gate below.

**Goal:** close 19 pre-ratified backlog entries (14 implementation + 5 docs) across four themed branches to four merged PRs.

**Architecture:** W-DOCS on `feat/m-wave` (spec/plan/docs + claim handoff), then `feat/m-wave-guards`, `feat/m-wave-parity`, `feat/m-wave-ui` off origin/main, each TDD per task, cross-model reviewed, CI-green merged.

**Date:** 2026-08-05 · **Spec:** `docs/superpowers/specs/2026-08-05-m-wave-design.md` (+ ratified brief `docs/superpowers/specs/2026-08-05-m-wave-decisions-brief.md`) · **Status:** SPEC-APPROVED; plan pending its adversarial gate

## Global constraints

- Every AGENTS.md plan-wide invariant binds; the ones this wave exercises: 1 (TDD), 6 (conventional commits), 8 (W-UI dual-gate), 11 (worktree-only), 12 (claims). Spec §1.1 lists the 13 do-not-relitigate ratifications.
- Guard premise rule (`tests/_shared/premise.ts`) applies to every new guard/meta-test (see W-GUARDS preamble).
- No em dashes in new user-visible copy; 44px tap targets; canonical type/token classes (pre-code mechanical UI gate, W-UI).

Four branches, executed in this order by the Opus implementer pane (HANDOFF.md in this directory is the pane's entry point): W-DOCS (on `feat/m-wave`, this branch) → W-GUARDS → W-PARITY → W-UI. Every branch: worktree off `origin/main` (invariant 11; W-DOCS reuses the existing `FX-worktrees/m-wave` worktree), Stage-0 claims (invariant 12), TDD per task (invariant 1), conventional commits (invariant 6), real CI green → merge → `0 0`.

Pre-draft verification pass: every file/symbol/script named below was grep-verified against the worktree on 2026-08-05 (citation table in the spec-review dispatch record; key re-checks inline per task). Commands named are real `package.json` scripts: `gen:spec-codes`, `gen:schema-manifest`, `spec:lint`, `ledger:claims`, `ledger:mass`, `test` (vitest run), `test:e2e` (playwright), `preflight`.

## Meta-test inventory (declared per writing-plans rule)

- **EXTENDS:** `tests/help/_metaUiLabelCrosswalk.test.ts` + `tests/help/_uiLabelExceptions.ts` (G3); `scripts/lib/ledger-fields.ts` + `tests/scripts/ledgerFields.test.ts` + `tests/docs/_metaLedgerReferentialIntegrity.test.ts` (G4); `tests/db/validation-schema-parity.test.ts` + `scripts/generate-schema-manifest.ts` (P1); `tests/styles/fontLoading.test.ts` (P2); `tests/e2e/helpers/fontFidelityFixture.ts` (G1); `tests/components/admin/review/sectionFreshness.test.ts` D-rows (U3); `tests/cross-cutting/codes.test.ts` x1 stays green as a non-regression proof (G6 catalog-internal field; U5 row-prose lockstep).
- **CREATES:** badge-token contrast meta-test (U1); settle-contract guard rows for three e2e cases, extending the `tests/cross-cutting/e2e-regrow-settle-contract.test.ts` pattern (G5); catalog partition cross-check (G6); hydrated React header harness (G2).
- **Registries:** invariant-9 (`tests/auth/_metaInfraContract.test.ts`) and invariant-10 (`tests/log/_auditableMutations.ts`, `tests/log/mutationSurface/exemptions.ts`) — no new Supabase call site, no new mutation surface in any unit; if an implementation step discovers otherwise, the registry row lands in the same commit. Advisory locks: untouched (no `pg_advisory*` surface in scope). Source-mutation registry (`tests/mutation/source/registry.ts`): no unit enrolls; G1's kill criterion is the entry's own named mutant, not a registry family.

## Unit W-DOCS — 5 closures on `feat/m-wave` (docs-only)

TDD note, stated once: these tasks move/annotate ledger prose and comments; no behavior changes. The failing-test step is the ledger meta-suite (`pnpm vitest run tests/docs/`) which FAILS if an archive carries a flight marker or a marker names a dead branch — run it red-conscious after each move, plus `pnpm spec:lint` on touched specs. This is the convergence-arc precedent for docs closures.

### Task D1 — BL-CREW-PII-DB-LOCKDOWN: documented limit + archive
1. Append to `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-19-crew-flight-info.md` a "Documented limit (ratified 2026-08-04)" note: crew-to-crew visibility of `crew_members.flight_info`/`email`/`phone` accepted; rationale (source sheet already crew-shared); cite `supabase/migrations/20260501002000_rls_policies.sql:244` (grant) and `supabase/migrations/20260501002000_rls_policies.sql:247-258` (`crew_read` policy); un-accept triggers (operator/security-review reversal, v1.x hardening milestone bundling with `BL-ADMIN-POSTGREST-DML-LOCKDOWN` + `BL-RLS-COVERAGE-CROSSCUTTING`).
2. Move the full entry body to `BACKLOG-archive.md` with dated resolution paragraph + cross-ref; strip the flight marker in the move.
3. `pnpm vitest run tests/docs/` green; commit `docs(backlog): archive BL-CREW-PII-DB-LOCKDOWN as ratified documented limit`.

### Task D2 — BL-RESOLVE-INTENT-WRONG-VERB: correct-reading note + archive
1. In `lib/adminAlerts/resolveActionLabel.ts`, extend the module rule comment (`lib/adminAlerts/resolveActionLabel.ts:9-12`) and annotate the `PICKER_EPOCH_RESET` (`lib/adminAlerts/resolveActionLabel.ts:58`) and `SHOW_FIRST_PUBLISHED` (`lib/adminAlerts/resolveActionLabel.ts:61`) rows: semantically `confirm`; label stays `resolve` because intent is append-only (defense 5c, `tests/adminAlerts/_metaResolveIntentLifecycle.test.ts:118-124` compares against origin/main) and a retroactive flip relabels every persisted open row. Comment-only — `pnpm vitest run tests/adminAlerts/` must stay green (proves no baseline drift).
2. Archive the entry citing `docs/superpowers/specs/2026-07-24-attention-index-consolidation.md` §2.6.
3. Commit `docs(backlog): archive BL-RESOLVE-INTENT-WRONG-VERB — verb kept, reading documented`.

### Task D3/D4/D5 — filing-bar demotions: archive with pointers
One commit each, same mechanics as D1 step 2:
- **D3** BL-CAPABILITY-MATRIX-FINANCIALS-PREDICATE — resolution: "documentary, not behavioral" (entry's own words); prose drift already pinned by `tests/visibility/capabilityHeaderParity.test.ts`; trigger rides in archive (next scope-tile/financials/matrix milestone).
- **D4** BL-CREW-AGENDA-ADMIN-CLEAR — resolution: R22 confirmed-only retention structurally closed the exposure; PREREQ trigger (operator retract-without-sheet-edit request) in archive.
- **D5** BL-ROOM-DIMS-ONLY-NOVEL-HEADER — resolution: partially closed by 2026-07-06 BO-venue-header anchor; bare `NAME`+dims sub-case out of scope per the entry's own 14-round ratification; fix-shape (positive room-context signal) preserved in archive.

### Task D6 — claim handoff + spec/plan finalization (LAST commits on `feat/m-wave`, order binding — handoff-by-overlap per spec §3)
0. Merge `origin/main` into `feat/m-wave` first (PR #707 landed after this branch was cut and edits BACKLOG.md — resolve marker/graduation conflicts mechanically: both sides' edits stand) and rerun `pnpm vitest run tests/docs/`.
1. Commit any post-review spec/plan repairs first.
2. **Unit branches claim FIRST:** create the three unit branches off `origin/main` (`git worktree add -b feat/m-wave-guards ../FX-worktrees/m-wave-guards origin/main`, same for `-parity`, `-ui`); in each: `pnpm ledger:claims --check <unit ids>` EXPECTING exit 1 naming `feat/m-wave` and ONLY it (the planned-handoff signature; any other branch named = real collision, stop); add markers `**Status:** IN PROGRESS · **Branch:** <unit branch>`, commit `--no-verify` (pre-install), push `-u`. Entries briefly dual-declared by design.
3. **Then the marker-removal commit on `feat/m-wave`:** remove the `**Status:** IN PROGRESS · **Branch:** feat/m-wave` run from the 14 implementation entries (D1–D5 archives already stripped theirs). `pnpm vitest run tests/docs/` green. Push. From this push each entry is declared by exactly its unit branch; at no instant was any undeclared on origin.
4. Open the `feat/m-wave` PR (spec + plan + docs closures + marker handoff), body notes docs-only preflight skip does NOT apply (tests ran); CI green → `gh pr merge --merge` → ff main → `0 0`.
5. Unit worktrees then each: `pnpm install && pnpm worktree:link-env && pnpm preflight`, rebase onto updated `origin/main` before first task.

`impeccable-gate: N/A — no UI surface` (W-DOCS: ledger prose, one comment block, spec/plan docs).

## Unit W-GUARDS — 6 entries on `feat/m-wave-guards`

Premise rule (AGENTS.md `BL-GUARD-PREMISE-REACHABILITY` bullet, landed PR #707 mid-wave): every NEW guard/meta-test below states its discriminating premise executably via `tests/_shared/premise.ts` — a fixture past the boundary or a non-empty environment proven before the assertion counts. Applies to G3's tier (a ≤6-char label fixture that would fail the tier), G4's probe fixtures, G5's settle-contract rows, G6's cross-check (planted-mismatch fixtures), and W-PARITY's planted manifest mutants. Read the rule's shapes in `docs/agents/writing-plans.md` before authoring any of them.

### Task G1 — BL-HARNESS-FIXTURE-ENFORCEMENT (evidence-first)
Failure mode caught: a caller-local `font-family` override or impostor `@font-face` inside one harness document passing silently.
1. RED: reproduce the entry's live mutant — patch `compileEntryCss` output in a scratch branch state to emit `@font-face{font-family:"NotInter";src:local("Arial")}` + `:root{--font-inter:"NotInter"}`; run `pnpm test:e2e -- toggle-edge-layout` (or the narrowest caller); record GREEN (that green IS the red — the defect).
2. Implement enforcement in `tests/e2e/helpers/fontFidelityFixture.ts` honoring the entry's vantage evidence verbatim: pre-navigate sees the OUTGOING document; teardown sees `about:blank`; never gate on `document.body.childElementCount`. The workable vantage must observe the LOADED document post-`goto` — instrument, don't re-derive; the entry's findings list is the map of dead ends.
3. GREEN: the mutant now turns ≥1 test red; unmutated tree fully green across the 32 `compileEntryCss` callers.
4. ESCAPE HATCH (spec §4.1): if the "not yet understood" gap resists, stop at a documented non-guarantee: append findings to the entry (stays OPEN, marker removed at branch close), fixture header updated. AC-W3 words this lawful outcome. Cap the attempt at one focused session-day; do not burn the branch on it.
5. Commit `test(assets): enforce collected font families in fontFidelityFixture` (or `docs(backlog): record …` on the escape path).

### Task G2 — BL-HEADER-REACT-RECONCILE-HARNESS
Failure mode caught: a JS-driven height animation (no CSS transition, no remount) under a stable key that static markup cannot exercise.
1. RED: new hydrated harness test — mount the real section-header component (the component `tests/e2e/section-header-layout.layout.spec.ts` Part 2 proves; read its import to name it), drive a prop change (pill/count) under a stable `key`, measure across reconciliation. Assert the Part 2 contracts (one mounted node owns both heights; height driven by pill presence, not fixed `min-height`). Fails or is impossible against the current static harness — that impossibility documented in the test file header is the red.
2. Implement: hydrated harness (client-render the component in the e2e page, or a Playwright-mounted React root; e2e-harness-readiness checklist applies — boot mechanism, hydration gate before first assert, detach-safety on samplers).
3. Keep BOTH mechanisms: Part 1 computed-style transition scan and Part 2 fixed-min-height detection survive separately (spec §2.3; entry's two-mechanism warning).
4. Wire: probed 2026-08-05 — `section-header-layout.layout.spec.ts` runs via the STANDALONE config, executed unfiltered on every PR by `standalone-e2e.yml` (see the moved-legs note at `.github/workflows/phantom-gap-e2e.yml:166`). The new harness spec joins the same standalone config (its testMatch), which covers it with NO workflow edit; verify membership by running the config filter locally and record it in the commit body. Commit `test(e2e): hydrated React reconciliation harness for section-header`.

### Task G3 — BL-HELP-UI-LABEL-CROSSWALK-EXACT-MATCH (live bug)
Failure mode caught: a short /help label attesting against an import identifier instead of rendered UI text (live instances: `**Share**` at `app/help/getting-started/page.mdx:8`, `**Viewer**` at `app/help/getting-started/page.mdx:10`).
1. RED: add the word-boundary tier to `tests/help/_metaUiLabelCrosswalk.test.ts` per the spec §2.3 accept-set — normalized label length ≤ 6 (INCLUSIVE; `Viewer` is 6 and in-tier; threshold one exported named constant) matches only via a `\b`-delimited escaped-label regex against the same haystack each layer consumes; BOTH layers get the tier (heuristic at `tests/help/_metaUiLabelCrosswalk.test.ts:328`, registry at `tests/help/_metaUiLabelCrosswalk.test.ts:408`); run — expect Share/Viewer (+ any peers) to fail BY NAME.
2. GREEN, same commit (structural-defense-calibration rule): reconcile every failure — correct the mdx copy to name rendered controls (the two known-bad get real labels; enumerate the rest from the failing run), or add a `tests/help/_uiLabelExceptions.ts` row with stated reason. No exception rows for the two known-bad (they name controls the product does not render — copy is wrong, not the guard).
3. Sweep (class rule): rerun the full crosswalk; attach the before/after failing-label list to the commit body. Commit `fix(help): exact-match tier for short crosswalk labels + copy reconciliation`.

### Task G4 — BL-LEDGER-DISCOVERY-FAMILY-SCOPED (probe-first)
Failure mode caught: a fifth ledger family silently invisible to `ledgerFiles`, `_metaLedgerReferentialIntegrity`'s name list, and the claim reader.
1. RED (the probe, the entry's own first step): fixture dir with the four real names + a fifth-family file (name it WATCHLIST, `.md`); new test rows asserting `ledgerFiles(root)` (`scripts/lib/ledger-fields.ts:42-45`) sees it — fails today.
2. Widen by REGISTRATION per spec §2.3: exported family registry in `scripts/lib/ledger-fields.ts` (today `BACKLOG`, `DEFERRED`), each family declaring its parse opts (the filename-keyed `optsFor` dispatch becomes registry-keyed); discovery accepts registered-family filenames only (name + ".md", optional "-archive" suffix); an UNREGISTERED all-caps ledger-shaped markdown file is not discovered and the meta-test reports it BY NAME; `tests/docs/_metaLedgerReferentialIntegrity.test.ts:56-59` derives from the same helper (single grammar holder).
3. GREEN: probe passes; existing suites (`tests/scripts/ledgerFields.test.ts`, `tests/docs/`) green — behavior on the four real files byte-identical (assert: same discovery result on repo root before/after).
4. Commit `fix(docs): family-scoped ledger discovery widened via registered family list`.

### Task G5 — BL-E2E-LAYOUT-FIXED-WAIT-RESIDUE
Failure mode caught: flake (T-CONFIRM-SCROLL failed live in PR #604) and, worse, a settle predicate that IS the assertion (tautology).
Per case in `tests/e2e/admin-lifecycle-layout.spec.ts` (anchor by enclosing test title, not line — entry's own warning):
- T-CONFIRM-SCROLL (`390x560: arming scrolls the popover's OWN scroller to the confirm`): predicate = `window.__siv` has recorded ≥1 call (presence, not the asserted call-shape); assertions on the recorded call and geometry stay OUTSIDE the `toPass`.
- T-FIT/T-REACH: predicate = popover attached + geometry stable across two frames (read what the case measures; pick the settle condition that precedes the measurement, never the measured value itself).
- T-TRANSITION: predicate = transition end signal (computed style settled across two reads).
1. RED: extend the settle-contract guard (pattern: `tests/cross-cutting/e2e-regrow-settle-contract.test.ts`) with rows anchoring a retry at each of the three sites — fails while the fixed waits remain.
2. GREEN: replace the three `waitForTimeout`s with the per-case `toPass` blocks; guard green; `pnpm test:e2e -- admin-lifecycle-layout` green locally ×3 consecutive runs (flake check); real CI run via the `lifecycle-layout-e2e.yml` PR firing.
3. Commit `test(e2e): per-case settle predicates replace three fixed waits in lifecycle-layout`.

### Task G6 — BL-CATALOG-PARTITION-WARNING-CLASS (catalog-internal field; NO lockstep)
Failure mode caught: a ParseWarning code invisible to the gallery (scanner blind through `any`/higher-order) or a catalog row claiming a class its source never constructs.
Design per spec §2.3: the partition is a CATALOG-INTERNAL field (precedent `triggerContext`, `lib/messages/catalog.ts:54-58`), binary closed union `warningClass: "parse_warning" | "general"`, total over rows. §12.4 prose does NOT change; lockstep + x1 untouched (spec records the correction to the entry's cost prediction).
1. RED: new cross-check test — scanner set (`INTERNAL_CODE_ENUMS` via `lib/messages/__internal__/parseWarningSites.ts`, membership semantics per `lib/dev/attentionScenarios/tier1.ts:116-125`) === catalog `parse_warning` set; planted fixture mismatch in EACH direction fails by name. Fails against current catalog (no field).
2. Implement: row-shape field + full backfill from the scanner output; gallery reads the catalog field; scanner inverts to cross-check; tier1 gap comment updated.
3. GREEN: cross-check green on real tree; `pnpm vitest run tests/cross-cutting/codes.test.ts` still green (proves x1 untouched).
4. Commit `feat(report): catalog-enumerated warning partition with source cross-check`.

`impeccable-gate: N/A — no UI surface` (tests, `scripts/lib`, `lib/messages` row shape, `lib/dev` gallery consumer, one spec-prose §12.4 edit).

## Unit W-PARITY — 2 entries on `feat/m-wave-parity`

### Task P1 — BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED (signature tier, ratified)
Failure mode caught: an RPC missing or signature-drifted on the validation project passing the parity gate silently.
1. RED: fixture manifests with planted mutants for EACH compared dimension — missing function, drifted identity-arguments string, drifted return type, flipped `prosecdef` — each failing BY NAME; PLUS the overload-coexistence fixture (two overloads of one `proname` as two rows; validation missing exactly one fails naming that overload's identity-arguments — kills `proname`-only keying). Comparator per spec §2.4: identity = (`proname`, `pg_get_function_identity_arguments(oid)` string); compared fields = identity-args string + `pg_get_function_result(oid)` + `prosecdef`; overloads separate rows; `public` schema only.
2. Implement in `scripts/generate-schema-manifest.ts` (manifest gains `functions` rows); Layer 2 in `tests/db/validation-schema-parity.test.ts` runs the same introspection against `TEST_DATABASE_URL`, superset semantics.
3. GREEN locally + regen `supabase/__generated__/schema-manifest.json` (committed). Negative proof: two introspection fixtures differing only in function body compare equal (bodies never read — the ratified no-body-hash bound, structural).
4. Real-CI: fire `x-audits.yml` via `workflow_dispatch` (the local-passes-CI-fails rule; the job already targets validation).
5. Commit `feat(db): schema-manifest + validation parity extended to function signatures`.

### Task P2 — BL-FONT-STYLESHEET-GRAPH-FIDELITY (built artifact, ratified)
Failure mode caught: a font-face arriving via dependency-internal CSS or package-`exports` subpath, invisible to the source walk (both R4-probed).
1. RED: RECONSTRUCT the two R4 escapes as committed fixtures (no executable probe exists today — spec §2.4 probe): a fixture dependency whose JS entry imports its own stylesheet, and a fixture package resolving a stylesheet via an `exports` subpath; assert each is invisible to the source walk (current behavior — the red) and, after implementation, caught by the artifact oracle.
2. Implement: `tests/styles/fontLoading.test.ts` gains a built-artifact assertion path — read the production build's emitted CSS (`.next/static/css/*.css` after `pnpm build`; cache/reuse an existing CI build product if the hosting workflow already builds — name the workflow edit) and assert the font-face universe against it. The source-tree walk stays as the fast pre-check (both run; the artifact is the oracle).
3. Build-cost placement: if no existing workflow builds on the unit-suite path, the artifact assertion runs in a workflow that already builds (`step3-live-bundle.yml` candidates — verify at implementation, name the final wiring in the commit body) rather than adding a build to `unit-suite.yml`.
4. Commit `test(assets): font-face oracle asserts against built CSS artifact`.

`impeccable-gate: N/A — no UI surface`.

## Unit W-UI — 6 entries on `feat/m-wave-ui` (Opus, impeccable dual-gate)

Order within unit: U1 (token) → U2 (announce family) → U3 (freshness probes) → U4 (Today suppression) → U5+U6 (RESYNC amendment + link). `/impeccable` setup gates before ANY code (canonical v3: context load of PRODUCT.md + DESIGN.md via the skill's context script, register reference read). Pre-code mechanical checklist per task: no em dashes in new user-visible copy, apostrophe literals, 44px tap targets, canonical type/token classes.

### Task U1 — BL-ADMIN-BADGE-CONTRAST-TOKEN
1. RED: contrast meta-test (CREATES; pattern: the `bg-warning-bg` contrast pin from #500) asserting the new badge token pair ≥4.5:1 white-on at declared size — fails while token absent.
2. `app/globals.css` `@theme` token pair (~`#C25E00` bg + text pairing; exact value the meta-test pins); apply in `components/admin/nav/NotifBell.tsx` + the attention-tab badge (locate: grep `bg-accent` under `components/admin/nav/`); fold the ONE surviving polish item: `NeedsAttentionSummaryCard` zero-state copy dedup. (The entry's second polish item — serial badge awaits — is stale: `app/admin/layout.tsx:152-155` already ships `Promise.all`; spec §2.2 records the probe. Note the correction in the archive entry.)
3. Commit `feat(admin): AA badge token pair + nav polish batch`.

### Task U2 — announce-region unmount family (BL-ANNOUNCE-REGION-UNMOUNT-CLASS + BL-BULK-UNDO-ANNOUNCE-UNMOUNT, one family per §1.1.9)
Failure mode caught: success announcement silently lost because its region unmounted with the branch that owned it.
Channel: `AdminAnnounceProvider` (`components/admin/AdminAnnounceProvider.tsx:38`, props `testId`/`label`; context `announce` via `UndoAnnounceContext`; instances: `app/admin/layout.tsx` + `ReviewModalShell`) — the entry-sanctioned pattern. Per surface:
1. RED per surface: RTL test — trigger success, assert the announcement text is present in a region that SURVIVES the success re-render (query the hoisted region, not the surface's own subtree; anti-tautology: the region queried must be outside the component under test's branch).
2. Fix tiers:
   - Four severity-ranked surfaces (`RescanSheetButton` [P0, 8 call sites], `FinalizeButton`, `PublishedArchivedTabOffer`, `RoleRecognizeControl`): announce via the context channel (nearest provider — layout or modal instance resolves correctly by construction).
   - Bulk channel: `bulkUndoOutcome` (`components/admin/RecentAutoAppliedStrip.tsx:332`, region `components/admin/RecentAutoAppliedStrip.tsx:545`) moves to the same channel; per-row channel is the worked example.
   - Fifteen conditionally-INSERTED region elements across thirteen sites (list verbatim in the entry): mount each region unconditionally, toggle text. Mechanical; one commit may batch several sites, each named.
3. Class-sweep closure: `grep -rln 'aria-live\|role="status"' components/ app/ --include='*.tsx'` — run at plan time 2026-08-05: **51 files** (the denominator; command verbatim). The entry's table enumerates the known violations (4 surfaces + 15 conditional elements across 13 sites + bulk); at implementation the same command re-runs and EVERY file gets a one-line disposition in the closeout: fixed-this-branch / already-branch-stable / no-success-announcement (error-only or static region). A file with no disposition is an incomplete sweep. Both entries archive.
4. Commits: `fix(admin): hoist success announcements to branch-stable channel` (+ follow-ups per site batch).

### Task U3 — BL-FRESHNESS-PROJECTION-NARROWING (probe-then-decide)
Per projection (venue / event / crew / contacts / hotels / transport / packlist, all in `components/admin/review/sectionFreshness.ts`):
1. Probe: render section with/without the candidate edit; assert byte-identical HTML (probe harness in the test file; import the SHIPPED renderer predicate — e.g. the actual `stripOpeningReelText`, `partialAttendanceLabel`, `hasContent`, `formatIsoDate`, `packItemLabel` — never re-type).
2. Probe passes (byte-identical) → D-row no-cue test in `tests/components/admin/review/sectionFreshness.test.ts` + narrow the projection. Probe fails → NO narrowing; probe transcript recorded on the entry (documented limit, spec §4.2).
3. Do not re-raise the refuted `aggregateDays` claim (D20).
4. Commit per projection or batched with per-projection evidence: `fix(admin): narrow <name> freshness projection to renderer width`.

### Task U4 — BL-CREW-UNKNOWN-ASTERISK-TODAY-DATES (suppress, ratified)
1. RED: RTL tests on `components/crew/sections/TodaySection.tsx` — `unknown_asterisk` viewer: the Tonight card's `Check in` and `Check out` rows (`components/crew/sections/TodaySection.tsx:282-283`) absent while the Hotel name row stays; unrestricted viewer: all rows unchanged (fixture-derived values, not hardcoded). The Where card has NO date rows today (spec §2.2 probe) — assert nothing about it beyond unchanged render.
2. Implement by importing the shipped `unknown_asterisk` restriction predicate that gates dates in `components/crew/sections/ScheduleSection.tsx:165` (single source, never re-typed).
3. Commit `feat(crew-page): suppress Today date rows for unknown_asterisk viewers`.

### Task U5 — RESYNC §12.4 amendment (lockstep triple, ONE commit)
1. Master spec §12.4 `RESYNC_QUALITY_REGRESSED` row (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2802`): "No action link." → prose naming the navigational Parse-warnings anchor the action ships (`resolution:"auto"` untouched). Record in the master spec's amendment convention, citing wave spec §1.1.5.
2. `pnpm gen:spec-codes` regen + `lib/messages/catalog.ts` row check, same commit; `pnpm vitest run tests/cross-cutting/codes.test.ts` green.
3. Commit `docs(spec): §12.4 RESYNC_QUALITY_REGRESSED names its navigational jump link (ratified amendment)`.

### Task U6 — BL-RESYNC-REGRESSED-JUMP-LINK: re-target the existing action
The action EXISTS and points at the wrong section (spec §2.2 probe: `lib/adminAlerts/alertActions.ts:170` = `showAnchor("overview", "Go to Overview")`). NO element carries `id="warnings"` today — the landed-route fragment proof requires adding it (spec §2.2 R2 probe; precedent `id="overview"` at `components/admin/showpage/OverviewSection.tsx:52`).
1. RED: update the unit rows in `tests/adminAlerts/alertActions.test.ts` (label naming the Parse warnings panel; href fragment `#warnings`) — fails against the shipped `#overview` mapping. Update the `RESYNC_QUALITY_REGRESSED` row in `tests/e2e/alert-action-links.spec.ts` so the landed-route fragment proof covers the new destination. Sibling codes (`PARSE_ERROR_LAST_GOOD`, `SHOW_UNPUBLISHED`) asserted UNCHANGED at `#overview` (anti-leak guard).
2. Implement: the one-line re-target in `lib/adminAlerts/alertActions.ts:170` + any label constant + `id="warnings"` on the Parse warnings panel wrapper on the landed route (the failing fragment row locates the wrapper; mirror the OverviewSection precedent).
3. Commit `fix(admin): RESYNC_QUALITY_REGRESSED action targets the Parse warnings panel`.

### Task U7 — transition-audit + dual-gate closeout
1. Transition-audit (writing-plans rule; spec Transition Inventory says all-instant, incl. the RESYNC action re-target as a static mapping change): assert no `AnimatePresence`/exit/initial/animate props ship in this unit's diff (grep-based check recorded in closeout); every conditional render new to this diff is deliberately instant.
2. Dimensional invariants: spec declares NONE introduced; audit confirms (no new fixed-dimension parent in the diff) — recorded in closeout; if violated, the layout-dimensions task rule triggers (real-browser `getBoundingClientRect` assertion) before close.
3. `/impeccable critique` + `/impeccable audit` on the unit diff (canonical v3 setup gates); P0/P1 fixed or DEFERRED.md-entried; findings + dispositions in `closeout.md` §12.
4. Marker line appended to this directory's `closeout.md` in the exact §3.3 RAN grammar: `impeccable-gate: critique=RAN audit=RAN p0=<int> p1=<int> dispositions=<recorded|none>` (cross-check rule: p0+p1 > 0 requires `recorded`, zero requires `none`; RAN-DEGRADED where the skill reports a degraded run).

## Per-branch closeout (all units)
1. Entries archive with resolution paragraphs (except a lawful G1 escape: entry stays, findings appended).
2. Flight markers stripped in the branch's LAST pre-merge commit.
3. Whole-diff cross-model review (codex-guard; split tight-scope briefs if the diff is large — W-UI almost certainly splits: token+copy / announce family / freshness / crew+RESYNC), REVIEWER ONLY + convergence block + VERDICT line + round cap 4.
4. Real CI green → `gh pr merge --merge` → ff main → `0 0`.
5. `pnpm ledger:mass` after the last merge; record the delta against baseline (290 / 93) in the wave closeout for AC-PROG.

## Adversarial review (cross-model) — plan gate
This plan goes to codex-guard review (REVIEWER ONLY, convergence block, VERDICT, cap 4) after self-review; execution handoff only on APPROVE.

## 12. Closeout

impeccable-gate: N/A — no UI surface

(The marker above covers THIS plan-document unit and the `feat/m-wave` branch — spec/plan docs, ledger closures, one lib comment block; no UI surface. The W-UI branch's UI diff gets its own filled RAN-form marker appended to this directory's `closeout.md` at that branch's closeout, per Task U7.)

## Execution handoff
`HANDOFF.md` (this directory) is the Opus pane's self-contained entry: takeover protocol (date → read AGENTS.md + spec + plan → overwrite marker sessionId → own cron nudge → pane/agent labels), then W-DOCS Task D1.
