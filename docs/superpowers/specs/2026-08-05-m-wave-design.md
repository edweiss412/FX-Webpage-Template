# M-wave — READY + decision-unlocked backlog implementation wave

**Date:** 2026-08-05 · **Arc branch:** `feat/m-wave` · **Status:** DRAFT (pre-review)

## §0 Why this wave exists, and its baseline

The 2026-08-04 backlog-convergence arc (`docs/superpowers/specs/2026-08-04-backlog-convergence-design.md`) installed the filing bar, the mass metric, and the small-game sweep. This wave is the follow-through on the mid-size queue: every open entry that is READY to implement or was blocked on exactly one product decision the user has now made. Pool selection and every product decision below were ratified by the user on 2026-08-04 (two AskUserQuestion batches in the backlog-convergence session, recorded in `docs/superpowers/specs/2026-08-05-m-wave-decisions-brief.md`, committed with this spec); the wave runs fully autonomously under the AGENTS.md autonomous-ship gate.

Baseline census (`pnpm ledger:mass --json`, 2026-08-05 00:34 CDT, main at post-C-x5 `ad4d39412`): **93 open entries (XS 1 / S 5 / M 31 / L 16), mass 290, unsized 40, severity-unrecognized 2.** AC-PROG pins against these numbers.

Wave pool: **19 entries** — 14 implementation + 5 docs-only closures. Four themed units, each its own branch and PR:

| Unit | Branch | Entries | Gate |
|---|---|---|---|
| W-DOCS | `feat/m-wave` (this branch: spec + plan + docs closures) | BL-CREW-PII-DB-LOCKDOWN, BL-RESOLVE-INTENT-WRONG-VERB, BL-CAPABILITY-MATRIX-FINANCIALS-PREDICATE, BL-CREW-AGENDA-ADMIN-CLEAR, BL-ROOM-DIMS-ONLY-NOVEL-HEADER | `impeccable-gate: N/A — no UI surface` |
| W-UI | `feat/m-wave-ui` | BL-ADMIN-BADGE-CONTRAST-TOKEN, BL-ANNOUNCE-REGION-UNMOUNT-CLASS, BL-BULK-UNDO-ANNOUNCE-UNMOUNT, BL-FRESHNESS-PROJECTION-NARROWING, BL-CREW-UNKNOWN-ASTERISK-TODAY-DATES, BL-RESYNC-REGRESSED-JUMP-LINK | impeccable dual-gate (critique + audit); Opus implements (UI hard rule) |
| W-GUARDS | `feat/m-wave-guards` | BL-HARNESS-FIXTURE-ENFORCEMENT, BL-HEADER-REACT-RECONCILE-HARNESS, BL-HELP-UI-LABEL-CROSSWALK-EXACT-MATCH, BL-LEDGER-DISCOVERY-FAMILY-SCOPED, BL-E2E-LAYOUT-FIXED-WAIT-RESIDUE, BL-CATALOG-PARTITION-WARNING-CLASS | `impeccable-gate: N/A — no UI surface` |
| W-PARITY | `feat/m-wave-parity` | BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED, BL-FONT-STYLESHEET-GRAPH-FIDELITY | `impeccable-gate: N/A — no UI surface` |

## §1.1 Resolved scope — do not relitigate

All ratified 2026-08-04 by the user unless another source is cited. The brief at `docs/superpowers/specs/2026-08-05-m-wave-decisions-brief.md` is the capture of record.

1. **Pool = "READY + decision-unlocked"** — the 19 entries in §0's table, no more. Entries the user fenced out stay out: PREREQ-fenced (BL-ADMIN-DASHBOARD-ROW-ACTIONS, BL-CREW-FIELD-ENRICHMENT, BL-FLIGHT-LEG-ORIENTATION, BL-PG-CRON-HOST-ASSERTION, BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED, DEFERRED SHEETLINK-SUBTLE-ACTION-CLASS-1) and DECISION-fenced (BL-PROJECTION-ALERT-VIEWER-INDEPENDENT-PROBE, BL-RESYNC-STAGED-REVIEW-UI, BL-SERVER-ACTION-ORIGIN-GATE, BL-SOURCE-ANCHORS-STALE-AFTER-FAILED-GID-FETCH, BL-STEP3-FULL-CREW-PREVIEW). User selection (Recommended option).
2. **BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED → signature tier.** Compare function existence + signatures (name, arguments, return type, security posture — DEFINER vs INVOKER). NOT a body hash. User ratification.
3. **BL-FONT-STYLESHEET-GRAPH-FIDELITY → assert against the BUILT artifact** (the production build's emitted CSS), not a resolved module graph. User ratification.
4. **BL-CREW-UNKNOWN-ASTERISK-TODAY-DATES → suppress.** `unknown_asterisk` viewers get the Today view's Tonight/Where date rows suppressed. User ratification.
5. **BL-RESYNC-REGRESSED-JUMP-LINK → amend the §12.4 row and add the jump link.** The user chose to overturn the ratified "No action link." prose for `RESYNC_QUALITY_REGRESSED` (master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2802`). This wave records that as a ratified spec amendment (§2.2-W-UI below). The one non-recommended option the user picked — deliberate, not an oversight.
6. **BL-CREW-PII-DB-LOCKDOWN → crew-to-crew PII visibility is ACCEPTABLE.** Rationale ratified: the source Google Sheet is already shared with the whole crew. Documented limit + archive; NO lockdown work ships.
7. **BL-RESOLVE-INTENT-WRONG-VERB → keep + document.** The append-only audit contract stays absolute; the wrong verb is recorded as a documented limit with the correct reading noted. NO relabel migration, NO exception-list mechanism.
8. **Filing-bar demotions ride along under already-ratified policy** (convergence spec §2 + AGENTS.md ledger filing bar): BL-CAPABILITY-MATRIX-FINANCIALS-PREDICATE, BL-CREW-AGENDA-ADMIN-CLEAR, BL-ROOM-DIMS-ONLY-NOVEL-HEADER. No new user ask needed; dispositions in §2.1.
9. **Dedup: BL-ANNOUNCE-REGION-UNMOUNT-CLASS and BL-BULK-UNDO-ANNOUNCE-UNMOUNT are ONE task family, two entries closed.** User-directed in the brief.
10. **Fully autonomous; both user review gates (spec, plan) WAIVED.** Stop only for genuine unresolvable ambiguity; an ambiguity that maps to a decision above is NOT a stop.
11. **Routing:** spec + plan authored in the Fable kickoff session; implementation + closeout in a NEW Opus pane in the same herdr workspace. UI work is Opus-owned per the AGENTS.md hard rule (satisfied — the implementer IS Opus).
12. **All AGENTS.md invariants bind** — worktree-only (11), ledger claims + push (12), TDD (1), conventional commits (6), impeccable dual-gate on UI (8), mutation-surface observability (10), §12.4 lockstep triple, class-sweep discipline.
13. **This wave does not redesign any ledger, catalog, or guard grammar beyond what an entry names.** Parse shapes, entry grammar, and unrelated catalog rows are out of scope.

## §2 Per-entry contracts

The entry bodies in `BACKLOG.md` are the spec-of-record for mechanics (each carries its own **Work** section with citations, verified at filing and re-verified in the pre-draft citation pass for this spec). This section states only what the wave ADDS: the ratified decision, scope boundary, and acceptance shape per entry.

### §2.1 W-DOCS (5 closures on `feat/m-wave`, docs-only)

- **BL-CREW-PII-DB-LOCKDOWN.** Record the accepted limit on the owning surface: append a documented-limit note to `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-19-crew-flight-info.md` (the spec that filed it) stating crew-to-crew visibility of `flight_info`/`email`/`phone` is accepted 2026-08-04 with the sheet-already-shared rationale, citing the RLS grant (`supabase/migrations/20260501002000_rls_policies.sql:244`). Archive the entry to `BACKLOG-archive.md` with the ratification + cross-ref. The un-accept trigger stays in the archive entry verbatim (operator/security review reversal, or a v1.x security-hardening milestone).
- **BL-RESOLVE-INTENT-WRONG-VERB.** The append-only intent contract is re-affirmed. Add the correct-reading note to the module rule comment in `lib/adminAlerts/resolveActionLabel.ts` (at the `SHOW_FIRST_PUBLISHED` / `PICKER_EPOCH_RESET` rows): both are semantically `confirm`; the label stays `resolve` because intent is append-only (`tests/adminAlerts/_metaResolveIntentLifecycle.test.ts` defense 5c) and a retroactive relabel would relabel every persisted open row. Archive the entry citing the analysis at `docs/superpowers/specs/2026-07-24-attention-index-consolidation.md` §2.6. Comment-only edit to the module; no behavior change, no baseline change.
- **BL-CAPABILITY-MATRIX-FINANCIALS-PREDICATE.** Demote per the filing bar: consequence is the entry's own words, "documentary, not behavioral" — the matrix has no production consumer and `tests/visibility/capabilityHeaderParity.test.ts` already pins the prose against drift. Archive with pointer; the entry's trigger (next milestone touching scope-tile visibility / the financials entitlement / the matrix) rides in the archive entry.
- **BL-CREW-AGENDA-ADMIN-CLEAR.** Archive with pointer: R22 structurally closed the original problem (confirmed-only retention; "no lingering-stale crew exposure to remediate"); what remains is a rare admin convenience. The PREREQ trigger (post-launch operator request to retract an agenda without editing the sheet) is noted in the archive entry.
- **BL-ROOM-DIMS-ONLY-NOVEL-HEADER.** Archive with pointer: partially resolved by the 2026-07-06 BO-venue-header anchor (dims-only header above a `BO` field block parses); the remaining bare `NAME\ndims` sub-case is declared out of scope by the entry itself (indistinguishable from an asset without an anchor — 14 adversarial rounds confirmed). The archive entry carries the fix-shape (positive room-context signal) for any future pickup.

Archive convention: full original body moves to `BACKLOG-archive.md` with a dated resolution paragraph; flight markers are stripped in the move (archives reject in-progress entries per `tests/docs/_metaLedgerInProgress.test.ts`).

### §2.2 W-UI (6 entries on `feat/m-wave-ui`, Opus, impeccable dual-gate)

- **BL-ADMIN-BADGE-CONTRAST-TOKEN.** New `@theme` token pair in `app/globals.css` (~#C25E00 bg, AA ≥4.5:1 white-on at badge size — exact value pinned by a contrast meta-test per the pre-code mechanical UI gate), applied to BOTH `components/admin/nav/NotifBell.tsx` and the attention-tab badge in the same change. Fold in the entry's two named polish items: the `NeedsAttentionSummaryCard` zero-state copy redundancy, and the `app/admin/layout.tsx` serial `fetchUnresolvedAlertCount` → `loadNeedsAttentionCount` awaits (`Promise.all`).
- **BL-ANNOUNCE-REGION-UNMOUNT-CLASS + BL-BULK-UNDO-ANNOUNCE-UNMOUNT (one task family, §1.1 item 9).** Per surface, hoist the live region above the branch its own success flips; `AdminAnnounceProvider` + `components/admin/announceLog.tsx` are the shipped pattern. Scope = the class as enumerated in the entry: the four severity-ranked surfaces (`RescanSheetButton`, `FinalizeButton`, `PublishedArchivedTabOffer`, `RoleRecognizeControl`), the bulk channel (`bulkUndoOutcome` in `RecentAutoAppliedStrip.tsx` `GroupSection` moves to `AdminAnnounceProvider` or an owner above the group), and the fifteen conditionally-inserted region elements across thirteen sites (fix shape there: mount the region unconditionally, toggle its text — a conditionally INSERTED live region is itself the not-announced pitfall). `DESIGN.md` already ratifies branch-stable regions, so this is enforcement of an existing rule, not new design. Both entries archive on merge.
- **BL-FRESHNESS-PROJECTION-NARROWING.** Per the entry's own close condition, for each of the seven wider-than-renderer projections in `components/admin/review/sectionFreshness.ts` (venue / event / crew / contacts / hotels / transport / packlist): a probe that renders the section with and without the candidate edit and asserts byte-identical HTML, then a D-row no-cue test in `tests/components/admin/review/sectionFreshness.test.ts`, then the projection narrowing — probe before tightening, per the finding-admissibility rule the entry itself cites. Import the shipped renderer predicate; never re-type it. The refuted `aggregateDays` bookends claim (D20 pins it) is not re-raised. A projection whose probe FAILS (the HTML actually changes) is NOT narrowed — the probe result is recorded on the entry and that projection is out (documented limit), because the probe just demonstrated the hash width is load-bearing.
- **BL-CREW-UNKNOWN-ASTERISK-TODAY-DATES.** Ratified: suppress (§1.1 item 4). `unknown_asterisk` viewers get the Tonight/Where date-bearing rows suppressed in `components/crew/sections/TodaySection.tsx` (check-in/check-out + venue dates), mirroring the existing `unknown_asterisk` date gate in `components/crew/sections/ScheduleSection.tsx`. Non-date rows stay. Tests cover the `unknown_asterisk` × row-type matrix and the unrestricted-viewer no-change case.
- **BL-RESYNC-REGRESSED-JUMP-LINK.** Ratified: amend + link (§1.1 item 5). §12.4 lockstep triple in ONE commit: (a) master spec §12.4 `RESYNC_QUALITY_REGRESSED` row prose changes from "No action link." to a navigational section-jump affordance (link text decided at plan time from the row's existing copy; the row's `resolution:"auto"` posture is unchanged — the link navigates to the Parse warnings panel, it resolves nothing); (b) `pnpm gen:spec-codes` regen; (c) the matching `lib/messages/catalog.ts` row. Then the UI affordance on the alert card. The x1-catalog-parity gate (`tests/cross-cutting/codes.test.ts`) proves the lockstep.

#### Dimensional Invariants (W-UI)

This unit introduces NO new fixed-dimension parent with flex/grid children. Inventory of what it does touch: the badge token swap is color-only (no box-model change to `components/admin/nav/NotifBell.tsx` or the attention-tab badge); hoisted live regions are `sr-only` (visually dimensionless — the hoist moves them in the tree, it renders no visible box); the Today suppression REMOVES rows from an existing stack (no dimension contract on the remaining rows changes); the RESYNC jump link renders inline inside the existing alert-card flow (no fixed-height container is created). If the plan or implementation introduces any fixed-dimension parent→child relationship after all, that task must add the relationship here plus the real-browser `getBoundingClientRect` assertion per the writing-plans layout-dimensions rule — absence of entries in this section is a claim, and the dual-gate audit checks it.

#### Transition Inventory (W-UI)

New or changed visual states, each pair explicit:

| Surface | State pair | Treatment |
|---|---|---|
| Alert card (`RESYNC_QUALITY_REGRESSED`) | without link ↔ with link | Not a runtime transition — the link is unconditionally present on the amended row. Instant render. |
| Hoisted announce regions (all sites) | text empty ↔ text set | Instant — `aria-live` announcement is auditory, not visual; no animation. Region element stays mounted in both states (that is the fix). |
| Today rows (`unknown_asterisk`) | rows shown ↔ rows suppressed | Per-viewer server render decision; the two states never coexist in one session. Instant — no animation needed. |
| Badge (NotifBell + attention tab) | old accent bg ↔ new token bg | Static token change, not a runtime state. No transition. |
| Compound | any of the above while another is mid-transition | None possible — no animated transitions exist in this unit's scope. |

No `AnimatePresence`, no exit/initial/animate props ship in this unit. If a task adds one, the inventory gains its pairs first.

Dual-gate closeout: one `/impeccable critique` + `/impeccable audit` pass over the unit's whole diff at branch close; P0/P1 fixed or `DEFERRED.md`-entried; findings + dispositions recorded in the unit's closeout section; the `impeccable-gate:` marker line per invariant 8.

### §2.3 W-GUARDS (6 entries on `feat/m-wave-guards`)

- **BL-HARNESS-FIXTURE-ENFORCEMENT.** Make `tests/e2e/helpers/fontFidelityFixture.ts` assert the families it collects. START FROM THE PR #705 EVIDENCE (the entry's vantage findings are the spec-of-record): enforcement must observe the LOADED harness document (pre-navigate sees the outgoing blank page; teardown sees `about:blank`), and must not gate on `document.body.childElementCount`. Kill criterion: the live impostor-face mutant (`@font-face{font-family:"NotInter";src:local("Arial")}` + `:root{--font-inter:"NotInter"}` emitted from `compileEntryCss`) turns at least one test red. If the remaining gap ("not yet understood" per the entry) resists after the evidence-guided attempt, the honest outcome is the entry's own: a documented non-guarantee in the fixture header, the findings appended to the entry, entry STAYS open — a check that cannot fail is worse than no check.
- **BL-HEADER-REACT-RECONCILE-HARNESS.** Hydrated React harness: mount the real section-header component, drive a prop change under a stable key, measure across the reconciliation; move or extend the Part 2 assertions of `tests/e2e/section-header-layout.layout.spec.ts` onto it. Keep BOTH mechanisms (the entry's two-mechanism split): Part 1's computed-style transition scan and Part 2's fixed-`min-height` detection must survive, not collapse into one.
- **BL-HELP-UI-LABEL-CROSSWALK-EXACT-MATCH.** Live bug (2026-08-04 screen: `**Share**` and `**Viewer**` in `app/help/getting-started/page.mdx` pass the crosswalk only by matching import identifiers; no shipped UI string exists for either). Add the exact/word-boundary tier for labels under ~6 characters in `tests/help/_metaUiLabelCrosswalk.test.ts` (substring stays for longer labels), and reconcile EVERY now-failing label in the same commit — corrected copy, or a `tests/help/_uiLabelExceptions.ts` row with reason. The two known-bad labels get corrected copy (they name controls the product does not render).
- **BL-LEDGER-DISCOVERY-FAMILY-SCOPED.** PROBE FIRST (the entry's own first scheduled step): scratch root with a fifth ledger family file outside the current naming family (the entry's example name: WATCHLIST, as a markdown ledger); assert what `ledgerFiles` (`scripts/lib/ledger-fields.ts:42-45`), `tests/docs/_metaLedgerReferentialIntegrity.test.ts`'s hardcoded list, and the claim reader each see. Then widen: discovery regex accepts the new family shape, the hardcoded name list is replaced by (or asserted against) the discovery helper, and the probe becomes the regression test. Single-holder rule for the grammar: `scripts/lib/ledger-fields.ts` stays the one place discovery lives.
- **BL-E2E-LAYOUT-FIXED-WAIT-RESIDUE.** Replace the three fixed waits in `tests/e2e/admin-lifecycle-layout.spec.ts` with per-case `toPass` settle predicates. T-CONFIRM-SCROLL's predicate is named by the entry: the production `scrollIntoView` call recorded on `window.__siv` — and the assertion-vs-wait-condition tautology risk the entry flags is the review focus: the settle predicate must not BE the assertion. T-FIT/T-REACH and T-TRANSITION each get their own predicate chosen at plan time from what the case measures. The `e2e-regrow-settle-contract` structural guard pattern extends to the three new sites.
- **BL-CATALOG-PARTITION-WARNING-CLASS.** Add the partition field (e.g. `class: "parse_warning" | ...`) to the `MESSAGE_CATALOG` row shape, backfill every row, invert the dependency: the attention-scenario gallery reads the catalog; the source scanner becomes a cross-check failing on mismatch in either direction. Carries the §12.4 lockstep triple (row-shape change → spec §12.4 prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts` in one commit) + the x1 gate.

### §2.4 W-PARITY (2 entries on `feat/m-wave-parity`)

- **BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED.** Ratified: signature tier (§1.1 item 2). Extend the manifest generator (`pnpm gen:schema-manifest` → `supabase/__generated__/schema-manifest.json`) to record public functions: name, argument types, return type, security posture (DEFINER/INVOKER). `tests/db/validation-schema-parity.test.ts` asserts validation is a superset at the same tier. Existing superset semantics keep: extra functions on validation are fine; missing/mismatched ones fail by name. NOT a body hash — comment-only edits must not fail the gate. The post-migration checklist in AGENTS.md gains nothing new; this makes forgetting it LOUD for RPCs, which is the entry's whole point.
- **BL-FONT-STYLESHEET-GRAPH-FIDELITY.** Ratified: built artifact (§1.1 item 3). `discoverShippedStylesheets()` in `tests/styles/fontLoading.test.ts` (or a sibling assertion path) asserts against the production build's emitted CSS — the ground truth the source walk approximates — closing both R4 probes (dependency-internal CSS, package `exports` subpaths) and the CSS-in-JS route at once. Build-cost decision at plan time: reuse an existing CI build product if one exists in the workflow, or gate behind the job that already builds. The source-tree walk may stay as a fast pre-check; the built-artifact assertion is the oracle.

## §3 Sequencing + claim-handoff protocol

1. `feat/m-wave` (this branch) carries spec + plan + the W-DOCS closures. It currently claims all 19 entries (markers pushed 2026-08-05, Stage 0).
2. In `feat/m-wave`'s LAST commit before merge: the 5 W-DOCS entries archive (markers stripped in the move); the 14 implementation-entry markers are REMOVED (they revert to OPEN on main).
3. BEFORE that PR merges: the three unit branches are created off `origin/main`, each runs `pnpm ledger:claims --check <its ids>` (passes — `feat/m-wave` no longer declares them after step 2's push), marks its subset `**Status:** IN PROGRESS · **Branch:** <unit branch>`, commits, pushes. No OPEN gap on origin.
4. Unit branches implement, each removing its markers in its own last pre-merge commit as its entries archive. Each unit branch rebases/merges `origin/main` after prior units land (BACKLOG.md archival edits will conflict textually; resolution is mechanical — both sides archive different entries).
5. Merge order: W-DOCS → (W-GUARDS, W-PARITY in either order or parallel) → W-UI last is the default (largest review surface benefits from a quiet base), adjustable by the implementer without a new decision.
6. Every branch: real CI green → `gh pr merge --merge` → fast-forward main → `0 0` check, per the autonomous-ship gate. The wave is complete when all four PRs are merged and `git rev-list --left-right --count main...origin/main` reports `0 0` with all 19 entries archived or (HARNESS-FIXTURE escape hatch only) annotated.

## §4 Documented limits (this wave's own)

1. **BL-HARNESS-FIXTURE-ENFORCEMENT may lawfully end open** (§2.3): if the not-yet-understood vantage gap resists the evidence-guided attempt, the deliverable is the appended findings + the explicit non-guarantee, not a check that cannot fail. AC-W3 words this.
2. **Freshness projections whose probe shows a real repaint are NOT narrowed** (§2.2); the probe transcript on the entry is the record. Up to all seven could survive — the wave's promise is probe-then-decide, not seven narrowings.
3. **The RESYNC jump link is navigational only.** The row's `resolution:"auto"` posture and every other §12.4 row are untouched.
4. **W-DOCS demotions leave durable records** reachable by grepping the entry id (archive + cross-ref), per the convergence-arc archive convention. A wrong demotion is recoverable by construction.
5. **The crosswalk's exact-match tier covers labels under ~6 characters only**; longer labels keep substring matching with its known looseness (the entry's original hardening scope; widening further is out of scope).
6. **Ledger-discovery widening changes which files three guards walk.** The probe-first step bounds it; any behavior change beyond admitting new families is out of scope.

## §5 Meta-test / registry inventory (pre-declared for the plan)

- **EXTENDS:** `tests/help/_metaUiLabelCrosswalk.test.ts` (+ exceptions registry), `scripts/lib/ledger-fields.ts` + `tests/docs/_metaLedgerReferentialIntegrity.test.ts` + `tests/scripts/ledgerFields.test.ts` (discovery widening), `tests/db/validation-schema-parity.test.ts` + manifest generator, `tests/styles/fontLoading.test.ts`, `tests/e2e/helpers/fontFidelityFixture.ts`, `tests/components/admin/review/sectionFreshness.test.ts` (D-rows), `tests/cross-cutting/codes.test.ts` consumers via catalog row shape.
- **CREATES:** contrast meta-test for the new badge token pair (per the pre-code mechanical UI gate); settle-contract guard rows for the three de-waited e2e cases; catalog partition cross-check (scanner inverted); hydrated React header harness.
- **Invariant-9/10 registries:** no new Supabase call site and no new mutation surface ships in this wave (UI edits touch announce/badge/suppression rendering and one nav link; no new server action or route). Any plan-time discovery to the contrary adds the registry row per invariant.
- **§12.4 lockstep:** touched TWICE (W-UI RESYNC row edit; W-GUARDS catalog row-shape change). Both commits carry the triple; the second to land rebases over the first.

## §6 Acceptance criteria

- **AC-W1 (docs):** the 5 W-DOCS entries are archived with their §2.1 records in place (owning-surface limit notes + pointers + triggers); the claim-handoff (§3 steps 2–3) executed with no OPEN gap on origin; `tests/docs/_metaLedgerInProgress.test.ts` green on every branch tip.
- **AC-W2 (UI):** the 6 W-UI entries closed per §2.2; the impeccable dual-gate ran on the unit diff with P0/P1 findings fixed or DEFERRED-entried; the contrast meta-test pins the new token pair; the §12.4 lockstep commit for RESYNC passes x1; the ratified amendment is recorded in the master spec's amendment log per its convention.
- **AC-W3 (guards):** the 5 closable W-GUARDS entries closed with their per-entry proof (impostor mutant killed OR the documented HARNESS-FIXTURE escape per §4.1; reconciled crosswalk; family probe as regression test; three `toPass` predicates with no tautology; catalog cross-check failing on planted mismatch in each direction).
- **AC-W4 (parity):** the manifest carries function signatures; the parity gate fails by name on a planted missing/mismatched function against a fixture; the font oracle reads the built artifact and both R4 probe escapes are closed (re-run the probes, expect caught).
- **AC-W5 (process):** every branch checked/marked/pushed its claims at Stage 0 and stripped them in its last pre-merge commit (invariant 12); every commit conventional (invariant 6); TDD per task (invariant 1).
- **AC-PROG:** at wave close, `pnpm ledger:mass` total is strictly below the §0 baseline of 290 and open entries strictly below 93. Expected: −18 or −19 entries depending on the HARNESS-FIXTURE outcome.

## §7 Impeccable gate

`impeccable-gate:` decided per-branch as the §0 table states: W-UI carries the dual-gate; W-DOCS, W-GUARDS, W-PARITY are `impeccable-gate: N/A — no UI surface`. (W-GUARDS touches `tests/` and `lib/messages/catalog.ts` only; the gallery consumer is `lib/dev/`, not a UI surface under invariant 8's definition.)
