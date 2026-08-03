# BACKLOG

Speculative / lower-priority hardening items. "Might do" — not blocking, no concrete near-term trigger. (Contrast `DEFERRED.md`: "will do, concrete trigger".)

**This file is the OPEN queue only.** Resolved / shipped / superseded entries live in **[BACKLOG-archive.md](./BACKLOG-archive.md)** with full provenance — grep by id, ids are unchanged. When an item below ships, move its whole entry there rather than annotating it resolved in place; otherwise this queue silently turns into a changelog.

Last reconciled: 2026-08-03 — `chore/orphan-components-lead-prose` settled the two entries the copy/dead-code sweep left behind. `BL-LEAD-CAPABILITY-PROSE-STALE` graduated: both prose claims turned out STALE rather than intentional — the `capabilityTransitions` line is a verbatim quote that stopped being verbatim at `e348c81ca`, and MI-9's "admin/ops" clause was inherited from §12.4 copy strings whose every other instance had already been retired or corrected. A third instance the literal sweep could not see (`lib/sync/phase2.ts`, a semantic variant in production source) was corrected with them, and two guards shipped in the same commits: `capabilityHeaderParity` extracts the expected flag set from `scopeTiles.ts` source, and `capabilityClaimProse` scans the MI-9 rows AND every `.ts`/`.tsx` under `app`/`components`/`lib` with a positive-claim recognizer. `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS` was AMENDED, not archived: four components retired (each with a named superseding commit and live successor; `RightNowCard`'s two regression suites were retargeted onto `RightNowHero` and each proven by mutation before the deletion), and `WrappedTile` stays as a DECIDED retention — deleting it would orphan `TileErrorBoundary` and `TileServerFallback` rather than shrink the ledger, and the orphan guard now asserts its reason says so. Filed `BL-CAPABILITY-MATRIX-FINANCIALS-PREDICATE` (the matrix models five predicates, the code has six) and `BL-BELLPANEL-DISMISS-COMMENT-DRIFT` (six comments name a label the panel stopped rendering). New guard `tests/docs/retiredIdentifierReferences.test.ts` walks every tracked file for references to what was retired, keyed by LINE CONTENT with reasoned exemptions — three adversarial rounds each found references a hand-curated census had missed, so the census is now a walk. Prior: 2026-08-03 — `docs/close-v1-override-wont-build` graduated `BL-VERSION-AMBIGUOUS-V1-OVERRIDE` as RESOLVED — WON'T BUILD: no admin force-classify override gets built, now or trigger-gated. The row's premise was false as stated. `v1` is a fallback bucket, not a confirmed legacy template (`lib/parser/schema.ts:37`; the registry entry at `lib/parser/schema.ts:53` carries no `requires` array, so nothing positively identifies a v1 sheet), and its "a genuine legacy-v1 sheet has neither resolution" conflated _no markers registered today_ with _no registrable structure_ — a real legacy sheet, once actually seen, is indistinguishable from a genuinely-new template, and the gate spec's §7.1 resolution #2 (developer registers the markers) is not limited to new templates. Probed: all 10 committed fixtures classify confidently (6× v2 at 7/0, 4× v4 at 8/0), zero ambiguous, zero v1. The override would convert a signaled failure into a silent one, inverting the preparedness-audit posture, and it serves none of the four indistinguishable bucket occupants better than their existing disposition. Re-open trigger recorded in the archive entry, conjunctive: a real legacy sheet surfaces AND marker registration proves impossible. **Current state after this and the same-day `docs/graduate-bl-unpublish-to-held` graduation: six of the eight rows the 2026-08-02 segment below enumerates remain open** (`BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`, `BL-HEADER-REACT-RECONCILE-HARNESS`, `BL-PG-CRON-HOST-ASSERTION`, `BL-NEEDS-ATTENTION-HOLDS-ROLLUP`, `BL-RESYNC-STAGED-REVIEW-UI`, `BL-STEP3-FULL-CREW-PREVIEW`); that segment's own "Eight open rows here" count is left as written, because it describes the state at the 2026-08-02 reconciliation and demoting it behind `Prior:` is what marks it as history. Prior: 2026-08-03 — `docs/graduate-bl-unpublish-to-held` graduated `BL-UNPUBLISH-TO-HELD` as already-shipped: the 2026-07-01 published toggle (`unpublish_show` RPC in `supabase/migrations/20260701000000_published_toggle_unpublish_show.sql`, driven by `setShowPublishedAction(slug, false)` from the admin show review modal, commit 945bd4ef0) is exactly the published→Held inverse the row asked for — the row's 2026-08-02 "Verified: no such RPC exists" was a false verification, and its premise that the M12.13 token-unpublish archives was stale too (both unpublish paths are pure `published=false`). A 10-point audit of the shipped surface before graduating found no functional gap and one gate-scope finding, filed as `BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED` (the validation-schema-parity gate covers tables×columns only, never functions — no current drift, probed live). Prior: 2026-08-02 — `chore/copy-deadcode-sweep` graduated three copy-and-dead-code entries (`BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT`: the §12.4 helpfulContext no longer claims either capability role unlocks admin access — probed, `is_admin()` never reads `role_flags` — landed as a five-surface lockstep in one commit plus the row's `longExplanation` and the `scopeTiles` header comment it contradicted; `BL-ADMIN-PARSEPANEL-ORPHANED`: the component deleted behind a new zero-production-importer guard that asks the compiler for both module edges and their targets, with the five peers the class sweep found filed as `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS`; `BL-HELP-STRIP-COPYLINK-STALE`: the per-show help prose now names the Share link button, no screenshot regenerated). Also filed `BL-LEAD-CAPABILITY-PROSE-STALE` for the two remaining prose claims that need a contract read. Prior: 2026-08-02 — `docs/dangling-citation-ledger-filing` took the referential-integrity guard's `KNOWN_DANGLING` debt map from 50 rows to 9, filing 39 real entries and correcting one citation (`BL-FLOW4` came off as a side effect: with its family now defined, the stem suppresses as a family reference). Eight open rows here (`BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`, `BL-HEADER-REACT-RECONCILE-HARNESS`, `BL-PG-CRON-HOST-ASSERTION`, `BL-NEEDS-ATTENTION-HOLDS-ROLLUP`, `BL-RESYNC-STAGED-REVIEW-UI`, `BL-STEP3-FULL-CREW-PREVIEW`, `BL-UNPUBLISH-TO-HELD`, `BL-VERSION-AMBIGUOUS-V1-OVERRIDE`) plus `BL-LEDGER-GUARD-BODY-DEFINED-IDS` as the handoff for the eight ids defined in a parent entry's BODY, which stay body-defined by decision. Thirty-one went straight to `BACKLOG-archive.md` at their terminal state: eleven already shipped (the row was deleted at close instead of graduated, twice on a spec's explicit instruction), fifteen were impeccable-gate deferrals whose promised row was never opened and whose deferral has since closed, and five name a branch that was never taken. One citation was corrected instead of filed: `BL-SYNC-FEED-UI-POLISH` pointed at a backlog-id family that exists nowhere in the repo. The 9 rows left are the eight body-defined ids above plus `BL-RESOLVED`, a prose placeholder in an audit doc, both handed to follow-ups. Prior: 2026-08-02 — `test/agenda-fold-seeded-e2e` graduated `BL-AGENDA-FOLD-NO-SEEDED-E2E` (the per-viewer agenda day fold exercised through the REAL crew page: seeded `agenda_links` + two complementary date-restricted viewers, each an email-matched Google session against its own seeded show, plus an unrestricted admin control in `stage-restricted-crew-schedule.spec.ts`, wired into `crew-e2e.yml` under desktop-chromium behind a run-command wiring guard) and `BL-AGENDA-A11Y-WEBKIT-COVERAGE` (grep-scoped `standalone-webkit-a11y` project resolving exactly one test, structurally pinned, plus webkit installs and a regenerated baseline). Prior: 2026-08-02 — docs/citation-rot-financials-vocab graduated BL-DANGLING-CITATIONS-RETIRED-WORKFLOW (15 dangling citations to the seven retired e2e workflows rendered as prose across 10 docs, class-swept per the AGENTS.md bug-shape rule; spec:lint target-class findings now zero tree-wide) and BL-MASTERSPEC-FINANCIALS-VOCAB (14 master-spec financials-entitlement claims reconciled to LEAD ∪ FINANCIALS ∪ admin, line-count-neutral; 4 seed exclusions + 8 window-probe non-claims ratified in docs/superpowers/specs/2026-08-02-docs-hygiene-citation-rot-financials-vocab-design.md; specs README line-count note corrected), and filed BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT (§12.4 copy over-grant, deferred to the next §12.4 copy pass). Earlier reconciliations (deduplicated 2026-08-02 — this line had accumulated 40 segments, 26 of them verbatim repeats of merge-concatenated chains): **[BACKLOG-archive.md § Reconciliation log](./BACKLOG-archive.md#reconciliation-log)**.

---

## BL-SOURCE-ANCHORS-STALE-AFTER-FAILED-GID-FETCH — a preserved anchor map has no revision stamp, so a stale range reads as a valid deep link

**Filed:** 2026-08-03 (surfaced by the cross-model review of the `fix/onboarding-cas-source-anchors` spec). **Class:** data fidelity. **Effort:** M (needs a schema decision first).

Every writer of `shows.source_anchors` preserves the stored map rather than clearing it when a scan could not compute anchors: the cron path emits `undefined` on a genuine sheets-list failure so the coalesce keeps the old value (`lib/sync/runScheduledCronSync.ts:3073`, `lib/sync/runScheduledCronSync.ts:1527`), the wizard scan degrades to `{}` on a gid-fetch failure (`lib/sync/runOnboardingScan.ts:1350`), and both finalize flows omit the arg rather than passing a defined `{}`. That is the right trade — the alternative wipes every good anchor on a transient Drive hiccup — but it has a blind spot: the same apply advances `shows.last_seen_modified_time`, so the show now carries data from revision R2 alongside anchors computed for R1.

`lib/sheet-links/buildSheetDeepLink.ts:22` cannot detect this. It guards structure only (allowlisted title, numeric gid), so an R1 anchor is accepted and the "In sheet" link opens the old range instead of falling back to `#gid=0`. The mis-link persists until a later anchor-writer run over that sheet either produces a non-empty map or clears the stale one — and nothing schedules such a run. Below the watermark an automatic pass skips the file entirely (`lib/sync/perFileProcessor.ts:337`). The wizard re-onboard path is the one that can hold a stale map indefinitely: it preserves on ANY empty scan because `pending_syncs.source_anchors` cannot distinguish a transient Drive failure from a workbook with no recognized regions, whereas a sync pass distinguishes exactly one cause and clears on the rest (`lib/sync/runScheduledCronSync.ts:3073`).

**Work:** store the revision the anchors were computed from (a `source_anchors_modified_time` column, or a stamp inside the jsonb) and have the deep-link builder fall back to `#gid=0` when it does not match `last_seen_modified_time`. The schema decision is the gate — a sibling column is simplest but adds a write to every anchor-writing path; an in-jsonb stamp keeps it to one column and one coalesce but changes the map's shape for every reader.

**Why backlog, not deferred:** the failure needs an empty-anchor scan AND a row-moving sheet edit in the same window, and the visible symptom is a deep link that opens the wrong range — not data loss. No trigger scheduled. Documented as an accepted limit at `docs/superpowers/specs/step3-onboarding/2026-08-03-finalize-cas-source-anchors.md` §4.1.

**Status:** OPEN.

---

## BL-PG-CRON-HOST-ASSERTION — the pg-cron suite asserts route paths only, never the host it dispatches to

**Filed:** 2026-08-02 (retroactively; `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md:295` files it by name, and §10.4 scopes it out, with no row anywhere). **Class:** CI guard completeness. **Effort:** M (needs a sound oracle first).

The host embedded in `cron.job.command` is environment-supplied and varies by target: `http://host.docker.internal:3000` on a developer stack, `https://fxav-screenshots-ci.invalid` in CI (`scripts/ci/supabase-local-bootstrap.sh:38`), a real host on validation. The suite therefore keys every assertion on the route PATH, which is host-agnostic, and never checks the host at all.

**Why it is still open, and why it should not be closed cheaply:** two review rounds could not produce a sound comparison. Keying off the target flag proves nothing about the database actually connected to, and comparing against the in-session GUC still admits a scheme mismatch, a trailing slash, and base paths. A host check that passes `http://` against an `https://` GUC would be worse than none, because it would read as coverage. Any attempt here needs an oracle that survives all four of those, demonstrated against a live mismatch, before the assertion lands.

**Status:** OPEN.

---

## BL-NEEDS-ATTENTION-HOLDS-ROLLUP — pending MI-11 holds do not surface on the needs-attention page

**Filed:** 2026-08-02 (retroactively; `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-10-mobile-needs-attention-design.md:285` lists it under §11 Deferred as a "BACKLOG candidate", and no row was created). **Class:** UX completeness. **Effort:** M (blocked on a read path).

`/admin/needs-attention` rolls up the durable attention stream but shows no pending MI-11 holds, so a hold is visible only from the show it belongs to. Verified 2026-08-02: no cross-show holds read path exists in `lib/` or `app/`, which is the actual blocker — the page cannot roll up what nothing can query.

**Work:** build the cross-show holds read, then add the rollup. Prerequisite first; the page change is small once the read exists. UI surface, so Opus-owned with the invariant-8 dual gate.

**Status:** OPEN.

---

## BL-RESYNC-STAGED-REVIEW-UI — no inline "review the diff, then approve the smaller roster" surface for an existing show

**Filed:** 2026-08-02 (retroactively; `docs/superpowers/specs/data-quality/2026-07-04-resync-quality-gate-design.md:267` §13 says it "files to `BACKLOG.md`", and it never did). **Class:** UX enhancement. **Effort:** M.

The shrink gate holds a reduced roster and offers `acceptShrink`, which applies the CURRENT sheet only if its `modifiedTime` still matches the reviewed one, and otherwise re-holds. That is deliberately not byte-exact: the design does not persist the held parse, so "apply exactly the version I first reviewed" is not available. This entry is that surface — restore or re-home `StagedReviewCard` in an existing-show mode exposing Apply / Keep-current, and update the `perShowPage.test.tsx` retirement pins.

**Explicitly not a safety gap** (owner decision, spec §10): retain-last-good plus the alert already prevent the data loss, and the modifiedTime binding already makes acceptance explicit and version-bound. Do not promote this on safety grounds; promote it if the diff-review workflow is actually wanted.

**Status:** OPEN.

---

## BL-STEP3-FULL-CREW-PREVIEW — no full crew-page preview from a staged parse in wizard step 3

**Filed:** 2026-08-02 (retroactively; `docs/superpowers/specs/step3-onboarding/2026-06-23-onboarding-step3-review-redesign.md:290` lists it under §11 Out of scope / Backlog, with no row anywhere). **Class:** UX enhancement. **Effort:** M.

Step 3 reviews a staged parse through its own section cards, not through the surface the crew will actually see. A C-style full preview would render `CrewShell` from the staged `parse_result`, which needs a `parse_result → ShowForViewer` adapter. Verified 2026-08-02: no such adapter exists.

The adapter is the substance of the work, not the rendering — `getShowForViewer` builds its projection from persisted rows, and a staged parse is neither persisted nor viewer-scoped, so the adapter has to decide what a preview means for viewer name aliases, per-viewer visibility filters, and the admin-preview branch before any of it renders. UI surface, so Opus-owned with the invariant-8 dual gate.

**Status:** OPEN.

---

## BL-LEDGER-GUARD-BODY-DEFINED-IDS — the citation guard resolves headings only, so a deliberate sub-item reads as dangling

**Filed:** 2026-08-02 (dangling-citation filing pass). **Class:** guard precision. **Effort:** S. **Owner note:** the guard file itself is owned by a parallel session; this entry is the handoff, not a patch.

`tests/docs/_metaLedgerReferentialIntegrity.test.ts` resolves a citation against `ledgerIds(...)`, which walks `##`/`###` HEADINGS. Some ids are defined deliberately in an entry's BODY instead: a parent entry enumerates its sub-items as bullets, and each bullet's id is how the sub-item is referenced everywhere else. Those resolve fine for a human reading the parent, and they are not debt — but the guard cannot see them, so they sit in `KNOWN_DANGLING` looking like untracked work.

**Decision (2026-08-02): they stay body-defined.** Promoting them would give each a heading whose content is one bullet, and would break the thing that makes them meaningful — the parent's ratchet or gate semantics. The eight below are the full current set:

- `BL-MUTATION-REF-SUB`, `BL-MUTATION-UNICODE`, `BL-MUTATION-COLUMN-SHIFT`, `BL-MUTATION-MERGED-CELL`, `BL-MUTATION-SECTION-ORDER` — the five operator classes enumerated by `BL-MUTATION-HARNESS-OPEN-HOLES` above, which states outright that "each is tracked as a backlog sub-item below". They are also the `finding` tags on thousands of rows in `tests/parser/mutation/knownHoles.ts`, where they identify a hole CLASS, not an item. The parent owns the shrink-only ratchet that gives them their meaning: hardening a class turns its holes into `staleRows` and fails the nightly harness until they are removed. Split across five headings, that ratchet has no single home.
- `BL-SYNCFEED-UI-1`, `BL-SYNCFEED-UI-2`, `BL-SYNCFEED-UI-3` — the three LOW / no-user-harm findings enumerated by `BL-SYNC-FEED-UI-POLISH` above, each a one-sentence "only act if" note from one impeccable dual-gate that PASSED. Their shared provenance and shared "no concrete trigger" disposition is the entry; individually they are not items.

**Work:** teach the guard that an id may be DEFINED by a body bullet of the form ``- **`BL-…`** — …`` inside an entry whose own heading id resolves, then delete these eight `KNOWN_DANGLING` rows. Two things to get right, both of which the existing family-reference suppressor already models: the bullet must be inside a resolving parent (a bullet in a plan or spec must NOT define anything, or any typo can define itself), and the definition must be a bullet LEAD, not any inline mention, or an entry that merely discusses a sibling id would define it. Worth a plant in the guard's own corpus for each failure mode.

**Status:** OPEN.

---

## BL-INTERNAL-CODE-ENUM-SCAN-WIDEN — the parse-warning enum generator scans one directory, so four live emitters are hand-listed

**Filed:** 2026-08-02 (retroactively; cited by `lib/dev/attentionScenarios/tier1.ts:127` and `docs/superpowers/specs/2026-07-20-attention-scenario-gallery-design.md:165` as if already filed, with no row anywhere). **Class:** generated-registry completeness. **Effort:** S.

`extractInternalCodeEnums` (`scripts/extract-internal-code-enums.ts:70-71`) collects `parse_warnings.code` literals from `readFiles(["lib/parser"])`, then filters those files by `/\bParseWarning\b|\bwarnings\b|hardErrors/`. Because no runtime module enumerates the parse-warning universe, the attention-scenario gallery has to union the generated enum with a hand-maintained residue, `EXTRA_WARNING_CODES` (`lib/dev/attentionScenarios/tier1.ts:131-136`): `AGENDA_SCHEDULE_LOW_CONFIDENCE`, `AGENDA_SCHEDULE_TIME_ADJUSTED`, `PULL_SHEET_ON_ARCHIVED_TAB`, `PULL_SHEET_OVERRIDE_CONTENT_CHANGED`.

The `tier1.ts` comment attributes the miss to the content regex alone. Verified 2026-08-02, that is only the second filter: all four emitters live in `lib/agenda/extractAgendaSchedule.ts`, `lib/sync/enrichAgenda.ts`, and `lib/sync/pullSheetOverride.ts` — outside the `["lib/parser"]` root the scan ever opens, so the regex never runs on them. Widening the content heuristic without widening the directory list would change nothing.

**Work:** widen the scan roots (and the content predicate, if it then over- or under-selects) so the generator reaches every `ParseWarning` emitter, and delete `EXTRA_WARNING_CODES`. The union in `warningCodes()` de-duplicates, so absorbing a code silently shrinks the residue rather than double-rendering it — which means the residue can rot invisibly, and is the reason this is worth closing rather than living with. Add a guard that fails when a `ParseWarning` code literal exists in a file the generator does not scan; otherwise the same drift reappears the next time an emitter lands outside the scanned roots.

**Status:** OPEN.

---

## BL-HEADER-REACT-RECONCILE-HARNESS — the section-header layout proof serves static markup, so a JS-driven animation is uncovered

**Filed:** 2026-08-02 (retroactively; cited by `tests/e2e/section-header-layout.layout.spec.ts:1185` as the filing that closes this gap, with no row anywhere). **Class:** test-coverage gap (harness capability). **Effort:** M.

`section-header-layout.layout.spec.ts` Part 2 proves both header heights belong to ONE mounted node, which the height matrix alone cannot do: `key={showId}` remounts only when the SHOW changes, so a `router.refresh()` reconciles a new pill or count under the same key, and the 44px / 72.8px figures are measured on separately-loaded pages that cannot distinguish "two states of one header" from "two headers". The test states its own limit at `:1176-1185` — the harness serves static server-rendered markup, so its toggle is a direct `style.display` mutation, not a prop change reconciled under the same key.

What bounds the gap today: Part 1 reads the computed style of every node in the subtree and would see a transition attached by a `motion.div layout` wrapper or an effect-driven animation. What stays genuinely uncovered is an animation driven entirely in JS, which attaches no CSS transition for Part 1 to find and survives a `style.display` toggle because no React reconciliation ever happens.

**Work:** stand up a hydrated React harness (mount the real header component, drive a prop change under a stable key, measure across the reconciliation) and move or extend the Part 2 assertions onto it. Note the two-mechanism split before touching either: Part 1 catches an attached transition, Part 2 catches a fixed `min-height` where the pill's presence stops driving the height and 72.8px becomes a coincidence — a replacement harness has to keep both, not collapse them.

**Status:** OPEN.

---

## BL-ADOPTION-PIN-REACHABILITY-BLIND — the shared-helper adoption guard cannot prove LIVE-PATH use

Surfaced by cross-model review of `fix/admin-popover-overlay-cluster` (2026-08-02, PR #658),
across three rounds of probes against the shipped guard.

`tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts` pins that each consumer
imports the shared helper, CALLS it (resolved through the TypeScript type checker, not by
name), declares no local copy by name or by shape, and — for coalescer rows — cancels the
instance it schedules. Rules (i)-(viii) are nonetheless **reachability-blind by
construction**: none of them connects the imported helper's RESULT to live behaviour. Two
evasion families were demonstrated, the second surviving a round of tightening:

1. **Executed decoy.** `createRafCoalescer(() => {}).cancel()` on a throwaway instance,
   while a private class handles every real `schedule()`/`cancel()`:

   ```text
   MUTANT HoverHelp executes sharedDecoy create+cancel, but all live
   schedule/cancel behavior uses PrivateCoalescer
   SHIPPED_GUARD_RESULTS 23 passed, 0 failed
   ```

2. **Discarded result.** Call `useFitWithinClip(...)`, drop the returned ref, attach a
   private callback to the node instead:

   ```text
   MUTANT PublishedToggle voids shared ref and attaches a private 1px-cap callback
   SHIPPED_GUARD_RESULTS 23 passed, 0 failed
   ```

Affects all five consumers: `ShareHub`, `HoverHelp`, `PublishedToggle`, `AttentionMenu`,
`ReSyncButton`.

**Accepted, not open.** Closing this statically means dataflow/reachability analysis, which
is not what a meta-test should carry, and two rounds of rule-tightening each invited a new
shape (the per-instance whack-a-mole the class-sweep discipline warns about). The guard's
header states the limit and names the per-consumer BEHAVIOURAL tests that do catch a fork —
`ReSyncButton.test.tsx` "overlay is capped to the room left inside a clipping ancestor",
`PublishedToggle.test.tsx` "the banner is capped against the clip ancestor",
`attentionMenu.test.tsx`'s capped-scroller case, the two HoverHelp suites, and
shareHubVisualViewport's T-S8/T-S9. The wiring layer and the behaviour layer are meant to be
read together; neither is sufficient alone.

**Filed here because a code comment is not a ledger.** The limit was documented at the guard
(discoverable once you are already reading it) but not where someone greps for known
weaknesses. Its sibling gap `BL-POPOVER-REGISTRY-PER-FILE-AND-TAILWIND-ONLY` went to this
file; this one should have too.

**Only act on this if** a consumer is found to have behaviourally forked despite a green
guard, or the behavioural backstops above are removed or narrowed — the latter is the real
risk, since deleting one silently converts this accepted limit into an uncovered gap.

## BL-POPOVER-REGISTRY-PER-FILE-AND-TAILWIND-ONLY — the anchored-scroller registry is fail-by-default per FILE, and only for the Tailwind idiom

Surfaced by cross-model review of `fix/admin-popover-overlay-cluster` (2026-08-02),
with live probes against the shipped guard. PRE-EXISTING: the cluster tightened the
`fit-within-clip` import assertion and added rows, but did not introduce either gap.

`tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts` compares a set
of detected FILES against the registry's file rows, and `looksLikeAnchoredScroller`
matches Tailwind class idiom in the source text. Two consequences:

1. **Per-file, not per-overlay.** A second, undispositioned overlay added to an
   already-registered file leaves the detected file set unchanged, so the guard stays
   green. Reviewer probe: appending an `UndispositionedSecondOverlay` with
   `className="absolute top-full overflow-y-auto"` to `ShareHub.tsx` gave
   `SUMMARY 15/15 passed; undispositioned overlay appended in already-registered file=true`.
   The same escape exists in all seven registered files.
2. **Tailwind-only recognition.** An overlay written with inline styles
   (`style={{ position: "absolute", top: "100%", overflowY: "auto" }}`) is genuinely an
   anchored scroller but is not detected at all. Reviewer probe:
   `CLASSIFIER inline-style mutant => false` and `SUMMARY 15/15 shipped guard cases passed`.

So a new unsafe overlay can ship undispositioned despite the guard's stated
fail-by-default contract. Fix shape: key the registry by OVERLAY (a stable per-element
marker such as a testid or a declared symbol) rather than by file, and widen the
classifier to computed/inline positioning as well as the class idiom — or state the
limit explicitly in the registry header so the contract stops over-promising.

Not fixed in the cluster that surfaced it: closing it means re-keying an existing
registry and re-dispositioning seven files, which is its own change with its own
review surface.

## BL-CI-OVERLAP-BOOT-WITH-SETUP — run the Supabase boot concurrently with pnpm install (built, MEASURED, and reverted — it does not pay)

**Status:** OPEN, but with the lever now MEASURED and REVERTED. Do not rebuild it without new information — the question this entry framed has an answer.

**Effort:** L

**Update 2026-08-03 (PR #670, branch `chore/ci-boot-overlap-and-popover-flake`).** The overlap was implemented, measured against real CI, missed its accept gate, and was reverted in the same PR under the gate's pre-ratified rule. The measurement, both figures per spec §7.4:

|                  | leg-median fixed overhead | max leg | run         |
| ---------------- | ------------------------- | ------- | ----------- |
| main baseline    | **96s**                   | 255s    | 30783618781 |
| with the overlap | **102s**                  | 324s    | 30796409070 |

Eight legs each, all green, `(job wall) − (vitest step)` per leg. The overlap did not save the install's ~16s; it **cost 6s of median**. Per-leg with the overlap: 92, 98, 101, 102, 102, 102, 107, 136. Baseline: 89, 91, 92, 94, 98, 101, 109, 112. The distributions overlap heavily and the median moved the wrong way, so this is not "a gain too small to see" — there is no gain. The accept threshold was ≥8s of REDUCTION (≤88s), chosen at half the theoretical 16s precisely so runner noise could not manufacture a result.

**The likely reason, and why it was not predicted.** The design assumed the two operations contend for nothing because they are "network-bound" and "registry-bound". On a 4-core GitHub-hosted runner they contend for the same cores, the same NIC and the same disk: the boot's `docker pull` decompresses layers while pnpm unpacks a `node_modules` tree, and the spec's own §3 anticipated contention "possibly less" than 16s of gain without considering that contention could exceed it. The 136s outlier leg is consistent with that.

**What is preserved from the attempt, and is worth keeping:** the write-surface audit is now empirical rather than inferred (three probes, including a fresh x86_64-Linux install under a recursive `inotifywait` that recorded zero events under `supabase/`), and the implementation spec at `docs/superpowers/specs/ci/2026-08-02-ci-boot-overlap-implementation.md` carries it along with a reusable, validated measurement procedure (`legfix` / `legwall`, §7.1). **If revisited:** this is now a measured-negative lever, not an unexplored one. The remaining wall-clock lever the spec names is a pre-baked Postgres image, which removes the ~14s schema+migration phase outright rather than trying to hide the install behind the pull.

Original status: OPEN — spec complete and probe-backed on `chore/ci-overlap-boot-with-setup`; NOT implemented, NOT merged. Read this before restarting: eight adversarial rounds are already sunk into it.

The last unexploited lever on unit-suite wall clock is the ~101s of per-leg FIXED overhead (leg-median; per-leg 89-108s on run 29741812457), of which ~70s is the Supabase boot and ~16s is `pnpm install`. They share no data but run sequentially, so overlapping them should reclaim up to ~16s per leg — roughly 6.5% of a 245s leg.

**What is already established, and is worth keeping:**

- **Probe (run 29743206592, real CI).** A process detached in one step DOES survive into later steps on a GitHub-hosted runner, and a filesystem status marker it publishes IS visible to a later step's shell (worker started 12:42:09, observed 12:42:49, status 7 written and read). `echo N > file` produced 0 empty reads in 400 create/read races. These are durable runner facts.
- **The final design is one step, not a cross-step protocol:** background the bootstrap, capture the PID, run `pnpm install --frozen-lockfile` in the foreground, `wait` on the PID, under `set -euo pipefail`. Native `wait` on a real child makes it fail-closed with no sentinel, no deadline arithmetic, and live log streaming. Adversarial review confirmed this success path correct and the overlap real.
- **Accepted non-goal:** if the install fails, the still-running bootstrap holds the step's stdout pipe and delays the failure report (typically ~70s; the only hard bound is the job's `timeout-minutes: 20`). Correct cleanup needs process-group termination plus a join plus PID-reuse care, and must not interrupt the bootstrap's held-aside-migration restore trap — a large surface for a rare path.

**Why it stopped.** Eight spec rounds without reaching implementation, on a ≤16s gain, with the correctness surface still expanding each round. The final round also caught a factual error in the spec's own write-surface audit: it claimed `pnpm-workspace.yaml`'s `allowBuilds` contained only `@sentry/cli`, when it contains five keys (`@sentry/cli`, `esbuild`, `sharp`, `unrs-resolver` enabled; `simple-git-hooks` deliberately false). The disjointness premise — that concurrent install writes never touch `supabase/` — is probably still true, but it has no audited basis until someone checks those four build scripts.

**If revisited:** start from the single-step design (skip rounds 1-4, which died on a cross-step protocol), redo the write-surface audit against all of `allowBuilds`, and decide up front whether ~16s justifies the failure-path tradeoff. A larger adjacent lever is the boot itself: a pre-baked Postgres image would remove the ~14s schema-init + migration phase, at the cost of a publish pipeline and a staleness contract.

**Provenance:** lifted to `main` 2026-08-01 from `chore/ci-overlap-boot-with-setup`, which was never opened as a PR; the branch remains the source of the underlying spec.

## BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT — promote the visual gate into branch protection's required set after soak

**Status:** OPEN · **Severity:** low · **Class:** CI wiring · **Filed:** 2026-07-27 (reconciliation — the one live follow-up carried out of `BL-HEADER-PROBE-RESIDUAL-VACUITY` when it graduated to `BACKLOG-archive.md`) · **Effort:** XS

`section-header-visual` (`.github/workflows/section-header-visual.yml`) runs as an unfiltered PR gate, but it is NOT in branch protection's required-context set, so a red run is a visible failing check that does not block merge at the GitHub layer. Deliberate at ship time: the spec ratifies promotion as a follow-up after observed-green runs, not part of that branch (`docs/superpowers/specs/2026-07-26-header-probe-residual-closure-design.md` §1.1). Same class as the required-set note in `BL-E2E-LIFECYCLE-SPECS-CI-DARK`: an owner GitHub-settings action, not repo code — the live required set held twelve contexts when last measured (2026-07-26). **Trigger:** observed-green soak of `section-header-visual` on merged PRs, then the owner adds the context.

## BL-HEADER-FONT-FALLBACK-WRAP — the admin tree loads no Inter, so a bare-Linux client gets a much wider fallback

**Filed:** 2026-07-26 (branch `feat/section-header-rebuild-phantom-spacers`, surfaced by real CI). **Class:** typography robustness. **Effort:** S (load the font) or M (make the affected rows font-independent).

`app/globals.css` sets `--font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Helvetica Neue", sans-serif`, and **nothing on the admin tree loads Inter** — no `@font-face` rule, no `next/font` import under `app/admin/` or the root layout. (CORRECTED 2026-07-27, reconciliation: the original claim "no `next/font` import anywhere" was wrong at filing — `app/show/[slug]/layout.tsx:31-37` has imported Inter via `next/font/google` since `8f4ad9c12`, 2026-05-03. That import defines `--font-inter` on the crew page shell, but nothing consumes `var(--font-inter)`, and `--font-sans` names the literal family `"Inter"`, which `next/font`'s hashed `@font-face` family name does not obviously satisfy — whether crew pages actually render Inter is UNVERIFIED; browser-check it when picking this up. The CI measurement below was on the admin-modal harness, which the crew import does not touch.) Every named entry after it is a system face, so a client with none of them (Chrome on a bare Linux install, which is what a GitHub Actions runner is) falls through to generic `sans-serif` and gets DejaVu Sans. DejaVu is substantially wider than SF Pro.

Measured consequence: the event-detail group title "Wardrobe & key moments" fills the 240px narrowest real row unaided under DejaVu, so it wraps to two lines (33.59px vs 16.8px) where SF Pro leaves 22.94px of room for the decorative rule beside it. The `min-w-4` floor that is free on every targeted device is not free there.

**This is narrow, not theoretical.** Every device the product actually targets resolves an earlier entry in the stack — iOS/macOS `-apple-system`, Android `ui-sans-serif`, Windows `Segoe UI` — so no crew member or admin sees the DejaVu rendering. It is reachable only on a desktop Linux browser lacking all six named faces.

**Work, either of:** (a) self-host the intended face and add an `@font-face` (or a `next/font` import — the crew layout's is the template, but note it must actually be BOUND to `--font-sans`, which the existing one is not), which makes every measurement in this repo font-deterministic and retires a whole class of local-vs-CI divergence; or (b) leave the stack alone and make the affected rows font-independent — `whitespace-nowrap` plus truncation on the closed-set group titles, so a wide fallback shortens the label instead of adding a line.

**Do not "fix" this by widening the tolerance in `tests/e2e/section-header-layout.layout.spec.ts`.** That test pins its own font to the Arial / Liberation Sans metric-compatible pair for exactly one measurement, deliberately and with the reason in a comment, so the floor assertion reads the same on macOS, Windows and the Ubuntu runner. Relaxing it instead would hide this entry's finding.

## Descoped from the CI-dark coverage cluster (2026-07-26) — read before re-attempting any of these

Four items landed here when the cluster descoped them — **designed, built, and measured**, then
descoped after four cross-model review rounds (37 accepted findings, none disputed) on branch
`feat/ci-dark-coverage`. The owner chose to ship the provably-sound subset rather than keep
iterating. One of the four, `BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC`, shipped 2026-07-27 on
`feat/ci-dark-descoped-guards` (with the separately-filed ceiling item
`BL-CI-ENV-DEPENDENT-CONFIG-NARROWING`) and graduated to
[BACKLOG-archive.md](./BACKLOG-archive.md), followed by `BL-CI-VITEST-EXCLUSION-COVERAGE` on `feat/ci-dark-vitest-exclusion` (2026-07-31, PR-B: the runner-as-oracle registry) and `BL-PG-CRON-PER-CASE-QUERY-ATTRIBUTION` on `test/pg-cron-mechanism-sabotage-probe` (2026-08-01, mechanism-sabotage probes); the one below remains open.

**Do not re-derive this analysis.** Each entry records what was tried and the measurement that
killed it. The reason each is open is that the obvious approach was implemented and shown not to
work, not that nobody thought about it. Full write-up with metafile traces and per-entry bundle
sizes: `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md` §10.

### BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE — a fast server action can leave the Published toggle stuck pending on WebKit

**Status:** OPEN · **Severity:** MEDIUM (real-user exposure unquantified; measured 7/10 in a CI loop) · **Class:** upstream framework defect, product exposure · **Filed:** 2026-07-26 (BL-E2E-LIFECYCLE-TRANSITIONS-ROUNDTRIP-FLAKE measurement work)

**Measured, not theorized** (CI run 30233337644 retry1 trace + baseline loop 30235889083, 7/10 samples): `setShowPublishedAction` POSTs, the server commits and responds 200 `{ok:true}` in ~230ms with the re-rendered `published:false` tree in the response body, the page stays responsive — and the `PublishedToggle` switch sits `disabled aria-busy="true"` with the OLD `aria-checked` indefinitely. `await setPublished(...)` inside the form action never resolves, so `useFormStatus().pending` never clears and `router.refresh()` is never reached. React never commits the applied tree (React 19 replay-loss class; nearest public report vercel/next.js discussion 88767). Vendored React is identical through next 16.2.12 (`19.3.0-canary-3f0b9e61-20260317`), so no patch-bump fix exists today.

**User-visible shape if it bites in production:** an admin flips Published on mobile Safari, the switch greys out and spins forever; the mutation HAS committed (crew link state is already flipped). A reload shows truth. All observations so far are Playwright WebKit under CI; not yet reproduced in desktop Chromium or a real handheld Safari — quantifying that is the first step if this is picked up.

**Watch signals:** `[wedge-recovery]` lines in the lifecycle-transitions e2e output (tier=nudge/reload counts per run), and admin reports of a stuck Published switch. **Candidate mitigations if real-user reports arrive:** a client-side watchdog in `PublishedToggle.formAction` (`Promise.race` the action against a generous timeout, then `router.refresh()` — the mutation is NOT retried, only the read is), or an upstream React/Next bump once the replay fix ships in a stable vendored canary.

### BL-CI-STALE-BRANCH-PROTECTION-COMMENT — one-line docs fix — ✅ RESOLVED (2026-07-26, PR2 of the CI-dark cluster)

**Resolved.** The comment is corrected in `tests/ci/_metaE2eWorkflowCoverage.test.ts`, and the same stale claim was swept from this file's `BL-E2E-LIFECYCLE-SPECS-CI-DARK` entry — it appeared in two places, not one. Kept here rather than graduated to the archive because it is a sub-entry of a still-open parent section, not a standalone item. Original text below for provenance.

`tests/ci/_metaE2eWorkflowCoverage.test.ts:11` states branch protection "deliberately requires ONLY
the `quality` context". Measured live 2026-07-26: `main` requires **twelve** contexts (`quality`,
`unit-suite`, `x1`–`x6`, `validation-schema-parity`, `affordance-matrix-parity`,
`postgrest-dml-lockdown`, `traceability-audit`), and `scripts/generate-traceability.ts` resolves a
third, different list of eight. Any reasoning that treats the repo's e2e jobs as "the only required
check is quality" is wrong — notably, edits to `unit-suite` DO touch a merge-blocking context.

## BL-CI-PARALLEL-DB-FALLBACK-AUDIT — re-run the closed-port protocol across the parallel project

**Status:** OPEN, raised by adversarial review of PR #517 (finding 2).

**Effort:** L

The `unit-suite-nodb` job proves that no parallel-project file FAILS without a database. That is weaker than "touches no database": a test that swallows a connection error, skips on unavailability, returns early from a setup hook, or takes an untaken conditional DB path will pass while exercising a FALLBACK rather than the DB-backed behavior it was written to check. The no-DB job repeats that same observation every PR, so it shares the blind spot — it is a regression detector, not a proof.

The stronger protocol already exists and was used for the original 2026-06-23 partition: point every Supabase endpoint at a CLOSED PORT rather than simply omitting the database. A refused connection surfaces swallowed-error paths that an absent server does not.

**Work:** re-run that closed-port protocol across all ~691 current parallel-project files, and compare per-file assertion COUNTS against a run with the database present. A file whose assertion count drops is silently degrading. Any found either move to serial or get an explicit note saying the fallback path is what is under test.

## BL-CI-RECLASSIFY-PARALLEL-STABILITY — revive the serial→parallel reclassification only with a concurrency-stability + clean-wall proof

**Filed:** 2026-07-20 (arc SHELVED). **Class:** CI perf. **Effort:** L (structural stability + multi-run measurement).

The DB-free serial→parallel reclassification (PR #528, closed unmerged) is correctness-verified but was shelved: moving ~527 files into the parallel project raises per-shard concurrency, and timing-sensitive moved files (e.g. `tests/admin/_metaInfraContract.test.ts`) starve past the 5s test timeout under CI load — candidate CI run 1 green, run 2 red on identical code. A required gate cannot flake, and the class is load-dependent (not fully enumerable up front). The wall-clock win was also unproven (~17s in contention-noisy samples, under the spec's 30s gate). Seventh lever this program has rejected on the local-passes-CI-fails pattern.

**Reusable asset:** the DB-touch probe + static `DB_BINDING_SIGNALS` matcher (branches `spike/db-touch-instrumentation`, `perf/ci-reclassify-db-free-serial`). Retrospective: `docs/superpowers/specs/ci/2026-07-20-serial-parallel-reclassification-retrospective.md`.

**Do NOT re-attempt the move without, in this order:** (1) solve criterion-3 at CI scale structurally — cap the parallel project's per-leg worker concurrency (`poolOptions.maxWorkers`) or raise the parallel `testTimeout` — and prove stability across ≥5 consecutive green CI runs; (2) demonstrate a clean ≥30s wall win with sequential, non-contending measurements (one CI run at a time). Absent both, the correctness tooling can stand alone (e.g. a nightly DB-drift audit) without the move.

**Status:** open (shelved).

---

## BL-MODAL-REALTIME-UPDATED-CUE — freshness cue near the published modal's action clusters

**Filed:** 2026-07-24 (retroactive — deferred in PR #505's body 2026-07-20, never filed) · **Class:** UI refinement · **Effort:** S

Impeccable P3 from `admin-modal-realtime-refresh`: an optional "updated just now" cue near the modal's action clusters, so a realtime-driven change is attributable rather than appearing as content silently shifting under the cursor. Deferred as a future refinement — the spec ratifies the silent-by-design posture, so nothing requires it.

**Un-defer signal (weak, hence backlog not DEFERRED.md):** a user reporting that modal content changed without explanation. Note the tension with the ratified posture — adding a cue is a spec decision, not a polish pass.

**Status:** open.

## BL-REALTIME-BROADCAST-FRAME-DROP-WATCH — ~9% local broadcast-frame loss on a healthy socket

**Filed:** 2026-07-24 (retroactive — recorded in PR #505's residuals 2026-07-20, never filed) · **Class:** observability watch item · **Effort:** S (read CI history) to M (if real)

PR #505 measured local realtime silently dropping ~9% of broadcast frames on an otherwise healthy socket; absorbed by CI runner retries and explicitly NOT a code defect of that diff. Filed as a watch item so the observation is not lost: if the drop rate is an artifact of the local stack it should disappear against validation/prod, and if it does not, subscriber code that assumes every broadcast arrives needs a reconcile-on-focus fallback.

**Work:** sample the realtime-dependent e2e/CI history for retry frequency before deciding whether there is anything to fix.

**Status:** open (watch).

## BL-MUTATION-LEDGER-AUTOCORRECT-DRIFT — refresh known-holes fingerprints after parser autocorrect field (2026-07-22)

**Effort:** XS

The `autocorrect` field populated at all 13 parser producers (`7295d794c`, merged via the
warning-card-identity-placement chain, PR #543-era) changes parse output for corpus fixtures whose
mutated cells produce autocorrect-bearing warnings, so the redacted parse-output fingerprints in
`tests/parser/mutation/knownHoles.ts` drift. Nightly run 29907734946 (2026-07-22): DRIFTED
fingerprint rows across 7 shards — SAME siteIds, fingerprint-only, zero NEW siteIds, zero fixed
holes — the benign class per the 2026-07-09 triage discipline (see BL-MUTATION-LEDGER-ROLETOKEN-DRIFT
and BL-MUTATION-LEDGER-REFRESH-AMBIGUITY in `BACKLOG-archive.md` for the identical prior instances and
their resolution mechanics). The nightly `mutation-harness`
workflow is non-required and path-filtered to `tests/parser/mutation/**`, so it gates no PR.
**Refresh:** `VITEST_INCLUDE_MUTATION_HARNESS=1 COLLECT_MUTATION_ALARMS=<dir> pnpm exec vitest run
--project mutation`, then surgical re-bless via `reconcileLedger` (drift bucket only). Trigger: the
next mutation-file-touching PR or the next post-merge nightly triage.

---

## BL-PG-CRON-COVERAGE-UNRUN — the live pg-cron introspection suite runs in no CI workflow

**Status:** PARTIALLY CLOSED 2026-07-26 (PR3 of the CI-dark coverage cluster) · **Severity:** medium · **Surfaced:** 2026-07-25, whole-diff review round 17

**What closed.** The suite now runs in `unit-suite-db` (removed from `ENV_BOUND_EXCLUDES`, which applied only under `VITEST_EXCLUDE_ENV_BOUND=1` — so it ran locally and was dark in CI only), and against the persistent validation project via the new `pg-cron-validation-parity` job in `x-audits.yml`. Under CI an unreachable `psql` now throws instead of skipping, and a live-case counter refuses a run where zero live cases executed — measured before: exit 0 with "2 passed | 6 skipped", asserting nothing.

**What stays open:** the per-job smoke-test residue (spec §9). The target-binding ceiling this entry used to inherit closed 2026-07-27: the connected cluster's `system_identifier` is now pinned and re-proven by a DO guard on every query's own connection (`feat/driveid-guard-cluster`, `docs/superpowers/specs/data-quality/2026-07-26-driveid-guard-cluster-design.md` §3.1) — a DSN substring check proves nothing, and no longer has to.

**Original text (SUPERSEDED 2026-07-26 — the exclusion and the "nothing runs it" finding are both fixed; see the status note above):**

`tests/cross-cutting/pg-cron-coverage.test.ts` is the only test that introspects the live `cron.job` table — job set, schedules, `active` flags, the pg_net extension, the vault secret. It was excluded from `unit-suite` via `ENV_BOUND_EXCLUDES` (`vitest.projects.ts`), and the comment there said it "runs against the validation project (like validation-schema-parity)". **Nothing ran it.** `pnpm test:audit:x6-pg-cron-pivot` runs four different files, and no other workflow references it; `grep -rl pg-cron-coverage .github/workflows/` returns only the `unit-suite.yml` comment that explains the exclusion.

So every assertion in it is dead in CI, including the `active=true` gate that exists specifically because a disabled job would otherwise satisfy the name/schedule/command checks.

**Fix:** give it a job in `x-audits.yml` with `PG_CRON_COVERAGE_TARGET=validation` and `TEST_DATABASE_URL` pointing at the validation project, alongside `validation-schema-parity` which already has that shape. Then correct the stale comment in `unit-suite.yml`.

**Wiring it up is necessary but not sufficient** (whole-diff R18). Every assertion this suite makes about `cron.job.command` is text matching: PostgreSQL resolves the OUTER `cron.schedule` call but stores the command body verbatim, comments included. A job whose `net.http_get(...)` is commented out, followed by an executable `select 1;`, satisfies the route check, the `net.http_get(` check and the exactly-one-timeout check while issuing no request — and `active=true` does not help, because the job runs, it just does nothing. Proving a job actually fires needs a smoke test per job; only the sync path has one today. Track that with this entry rather than by adding more text assertions.

## BL-WATCH-PROMOTION-ACTIVATION-RACE — a folder switch racing a subscriber can leave one stale active channel

**Status:** OPEN · **Severity:** low (bounded to one lease; no data loss) · **Surfaced:** 2026-07-26, watch-renewal-lifecycle spec rounds 2-5 · **Effort:** L

`promoteSettings` supersedes the prior folder's `active` channels and orphans its `pending` ones inside the settings-swap transaction, and `activatePending` refuses a zero-row activation. That closes every window where the pending row exists when promotion runs. It does NOT close the window where a subscriber reads the old configured folder, promotion commits, and the subscriber then inserts and activates its pending row — nor the one where the subscriber commits its activation while promotion is still uncommitted, since under READ COMMITTED it reads the previous committed folder.

Three review rounds tried to close this with an `app_settings` predicate inside `activatePending`; each attempt failed for a different reason, the last being that an ordinary subquery cannot see an uncommitted promotion. **A correct fix requires serialization** between the promotion transaction and concurrent subscribers — an advisory lock on the settings row, or `select … for update` — which collides with the ratified "no advisory locks on any watch surface" constraint (that constraint exists because a second holder on this hashkey is the M5-R20 nested-holder class). So this is a lock-topology change and needs its own design.

**Bounded, not open-ended:** refresh renews only the configured folder and renews nothing when the folder read fails, so a stale row is never renewed under any branch. It dies at its own `expires_at` within `WATCH_TTL_MS`, is reaped to `expired`, and is GC'd. Worst case is up to 24h of webhook deliveries for a folder nobody watches — the same class that was PERMANENT before that work landed.

**Amends AC-6.18**, which is otherwise absolute. Design context: `docs/superpowers/specs/observability/2026-07-26-watch-renewal-lifecycle-design.md` §3.2.4.

## BL-SERVER-ACTION-ORIGIN-GATE — same-origin gate for the crew guest Server Action

**Status:** OPEN · **Severity:** low (logout CSRF; no read, no escalation) · **Surfaced:** `fix/picker-flow-app-bugs` review rounds 1-3 (2026-07-25), descoped rather than guessed at · **Effort:** M

`clearIdentityAndSkip` (`lib/auth/picker/clearIdentity.ts`) is an exported Server Action that ends the Supabase session on the calling browser and deletes one picker entry from the `__Host-fxav_picker` envelope. It relies on Next's built-in Server Action origin validation, which rejects a mismatched `Origin` but **permits a request that carries no `Origin` header at all**. So a cross-site POST arriving without that header is not refused by anything the app adds.

**The residual, sized.** An attacker who forces the call signs the victim's browser out of this app on that device and removes one supplied show id from their picker envelope. There is no response data returned to the caller, no privilege gained, and no cross-account effect — with `scope: "local"` it does not even touch the victim's other devices. It is logout CSRF, in an app whose sign-out is a visible button. That is why it was filed rather than treated as blocking.

**Why it is not already fixed.** A hand-rolled gate was specified twice and failed review both times. The route-handler precedent (`app/auth/sign-out/route.ts:78-87`) reads `request.nextUrl.origin`, which a Server Action has no equivalent of, so the action must compose the expected origin from headers — `x-forwarded-proto`, `x-forwarded-host`, `host`. That is only sound behind a **trusted proxy** whose overwrite behavior this repo has never established; where a proxy forwards client-supplied values, a spoofed `Origin` plus `x-forwarded-host` pair passes the check. Three consecutive review rounds on one design-correctness vector triggered the prose cap in `docs/agents/spec-self-review.md`: descope, do not patch a fourth time.

**Open decision, and the trigger:** establish the trusted-proxy policy (which headers are authoritative in each deployment, and whether the platform overwrites them), then gate every destructive Server Action on it — not just this one. Pick this up on the next auth security pass, or sooner if a Server Action lands whose forced invocation would do more than log someone out. Reasoning in `docs/superpowers/specs/2026-07-24-picker-flow-app-bugs.md` §4.3a.

---

## BL-E2E-COVERAGE-SCANNER-EXCLUSION-FILTERS — audit other workflows now that paths-ignore counts as a filter

**Status:** OPEN · **Severity:** low · **Surfaced:** `fix/picker-flow-app-bugs` review round 5 (2026-07-25)

`tests/ci/_workflowCoverageScan.ts` classified a workflow as PR-blocking-capable unless it had a `pull_request.paths` filter, and matched only that spelling — so any workflow using `paths-ignore` was treated as running on every PR when it does not. This branch fixed the matcher (`paths(-ignore)?`) and added a self-test, and re-categorised the two crew-e2e specs as `PATH_GATED_BY_EXCLUSION`.

**What remains:** no other workflow in `.github/workflows/` used `paths-ignore` at the time of the fix, so nothing else changed category. Re-run the audit if one adopts it, and check whether any spec's allowlist row (or absence of one) became inaccurate. **Trigger:** the next workflow that adds a `paths-ignore` filter.

---

## BL-TELEMETRY-FALLBACK-RETRY — the scheduled-job health fallback states the cause but offers no retry

**Status:** OPEN · **Severity:** low (developer-tier surface) · **Surfaced:** #601 impeccable critique (2026-07-25), P1 partially addressed · **Effort:** S

`app/admin/dev/telemetry/page.tsx:84` now reads "Couldn't load scheduled-job health right now. The jobs are probably still running." — the second sentence landed in the #601 follow-up because the critique was right that the old one-liner named neither a cause nor a recourse at the moment Doug's stress is highest. What it still lacks is the recourse half: there is no retry control, so the only way to re-read is a full page reload.

**Fix (when prioritized):** a retry affordance on the fallback, consistent with `AutoRefreshControl`'s manual-refresh icon-button already on this page (spec §7.1) rather than a new idiom. **Trigger:** the next telemetry pass, or a report of the readout failing in practice.

---

## BL-PICKER-CLEANUP-REVALIDATE-QUERY-VARIANT — `cleanupStaleEntry` revalidates a path the picker is rarely on

> **PREMISE REFUTED — 2026-08-03.** This entry's stated cause is wrong, and the correction is the
> most important thing on it. Probed against the installed Next 16.2.10 during review of
> `fix/picker-signin-flow-cluster`:
>
> ```text
> getImplicitTags(page, pathname) → ["_N_T_/show/demo/<token>"]
> revalidatePath(originalPath)    → "_N_T_" + removeTrailingSlash(originalPath)
> ```
>
> Both the tag written at render and the tag `revalidatePath` invalidates are **pathname-only**.
> The query is not a separate cache tag, so there is no `?gate=skip` variant being "missed". The
> prose below reasons from a mechanism that does not exist; do not act on it as written.
>
> **Descoped from that branch by the owner**, after the item generated three consecutive rounds of
> review findings while the two shipped fixes converged. Obstacles found and worth knowing before
> a second attempt:
>
> - The redirect cannot live in `cleanupStaleEntryCoreImpl`: `cleanupStaleEntryCore`'s bare `catch`
>   converts Next's `NEXT_REDIRECT` sentinel into `{ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" }`,
>   so no navigation ever reaches the browser.
> - A bare-canonical redirect lands on the WRONG SCREEN. `page.tsx` gates `allowGateSkip` on
>   `gate === "skip"`, so without it the cleanup re-resolves as `no_auth: first_contact` and renders
>   `<SignInOrSkipGate>`, not the picker. Carrying `gate` needs a seven-hop threading path that does
>   not exist today.
> - Its e2e needs a `shows.picker_epoch` mutation, which would be an **unlocked write in violation
>   of plan-wide invariant 2**, and trips the frozen-DML guard pinning `picker-flow.spec.ts`.
>
> **Any future attempt starts by MEASURING what screen actually renders after a stale cleanup**,
> rather than reasoning from cache-tag behaviour. Full rationale:
> `docs/superpowers/specs/2026-08-03-picker-signin-flow-cluster-design.md` §1.3.

**Status:** OPEN · **Severity:** low · **Surfaced:** class-sweep of the `?gate=skip` revalidate defect (2026-07-25)

`lib/auth/picker/cleanupStaleEntry.ts:107` calls `revalidatePath('/show/<slug>/<shareToken>')`. `revalidatePath` takes a path and ignores the query string, and the picker is commonly reached at `?gate=skip`, so that variant's entry is not invalidated. This is the same defect fixed in `_PickerInterstitial`'s select-identity form action, where a roster tap set the cookie and then re-served the picker, leaving the person exactly where they were until a reload.

**Why it is low here, not the same severity.** The intended screen after a stale-entry cleanup IS the picker, so the user is already looking at the right thing — unlike the select case, where the intended screen was the resolved show. `_StaleCleanupAutoSubmit`'s effect has an empty dependency array, so a stale render cannot re-submit in a loop. The worst observable outcome is a cleared stale-entry hint lingering until the next navigation.

**Why it was not fixed alongside the select case:** the fix there is verified by a prod-build e2e (`CI=1` picker-flow, the guest case). The stale path has no equivalent, and shipping an unverified change to a second Server Action to claim a complete sweep would be worse than recording the instance. The comment in `_StaleCleanupAutoSubmit.tsx` now states the caveat rather than the old claim that the user "sees the fresh picker on next render."

**What remains:** decide whether the cleanup action should redirect to the canonical URL like the select action now does, and write a prod-build e2e for one of `epoch_stale | removed_from_roster | identity_invalidated` first so the change is provable. **Trigger:** the next change to the stale-cleanup path, or any report of a stale hint persisting.

---

## BL-DEV-GATE-GALLERY-SPEC-ROT — `attention-modal-gallery.spec.ts` runs nowhere but a dispatch-only gate, and has rotted

> **PARTIAL 2026-07-26 (PR4 of the CI-dark cluster).** `dev-gate-e2e.yml` now carries a DAILY schedule alongside `workflow_dispatch`, so a break is bounded to 24h instead of until someone remembers to dispatch. The ambiguous `getByText(String(n))` locator is FIXED (each count asserted on its own paragraph). The Escape assertion is deliberately UNCHANGED pending a reproduction — the product path was traced and is intact, and weakening an unreproduced assertion is how a real regression gets papered over. Still open because a schedule is not PR-blocking-capable, so the spec keeps its allowlist row.

**Status:** OPEN · **Severity:** medium · **Surfaced:** `fix/picker-flow-app-bugs` Task 13 close-out (2026-07-25)

`tests/e2e/attention-modal-gallery.spec.ts` runs only under the `dev-build` Playwright project (`playwright.config.ts:92`), and `dev-build` runs only in `dev-gate-e2e.yml`, which is `workflow_dispatch`-only. No PR ever triggers it. Its last green run was **2026-07-02**; the only other run since was a failure on 2026-06-22. Dispatching it during this branch's close-out failed two assertions:

- `:398` — `controls.getByText(String(GLOBAL.length), { exact: false })` raises a strict-mode violation, resolving to 2 elements. The substring match means any element in the controls bar containing that digit qualifies.
- `:265` — `await expect(attentionMenu).toHaveCount(0)` after `Escape` times out; the menu does not close the way the spec expects.

**Not caused by the branch that found it.** `fix/picker-flow-app-bugs` touches no file under `components/` or `app/admin/`, and its only `playwright.config.ts` edits are to the `mobile-safari` and `desktop-chromium` matchers — `dev-build` is untouched. Two commits that landed on `main` _after_ the gate's last green run change exactly what these assertions read: `432d8ef06 feat(admin-dev): exclude global-scope tier-1 scenarios from the gallery switcher` (the global-scope set the `:398` count is derived from) and `f4c4bf493 feat(admin): merge the attention panel's three groups into two` (the menu at `:265`). 793 commits touched `components/admin/` in that window.

This is the dark-spec class already recorded for this repo (`feedback_dark_spec_in_unrun_project_rots`, #486): a spec nothing runs stops describing the product, and the cost lands on whoever next dispatches the gate.

**What remains:** two decisions, in order. (1) Repair both assertions against the current UI — the count needs an exact/scoped match rather than a substring, and the menu-close assertion needs to match the post-merge panel behavior. (2) Decide whether the gallery spec belongs in a gate no PR runs at all. If its value is the built `ADMIN_DEV_PANEL_ENABLED=true` artifact, that is a reason for a dedicated project, not a reason to be unreachable; if it can run on the `:3000` baseline, move it somewhere PR CI executes. **Trigger:** the next `dev-gate-e2e.yml` dispatch, which will fail on this until it is fixed.

---

## BL-NULLCODE-STAMP-BATCH-2 residuals (2026-07-03)

Deferred out of the forensic code-stamping batch (`docs/superpowers/specs/observability/2026-07-03-nullcode-forensic-batch2-design.md` §9) — separate user-facing / alerting surfaces beyond the pure log-code enrichment.

**Heading caveat:** only the first two items (`BL-SCAN-SSE-BODY-NULL-CODE`, `BL-PICKER-TAMPER-ADMIN-ALERT`) actually came out of that batch. The rest accreted under this heading afterwards from unrelated 2026-07-04+ work (agenda visibility, quiet-link a11y, alert-link e2e, health-resolve lockdown, Step-3 impeccable) and are grouped here by filing date, not by subject. Read each item on its own; the heading is not a topic.

**Sweep status (2026-07-24/25).** Every item below was re-verified against live code, and citations that had rotted were corrected in place — several were badly stale (`AlertBanner.tsx` deleted, `PerShowAlertSection.tsx` deleted, a 9-code registry that is now 20, line numbers shifted). One item closed as obsolete (`BL-WATCH-ERROR-MESSAGE-RAW-DIAGNOSTIC`, since graduated to `BACKLOG-archive.md`). **Four** cross-model review rounds then caught further errors in the sweep itself, so treat the corrected text as verified but not sacred. The misses: a `grep -l` that matched a comment instead of a consumer; a nonexistent `shows.last_error_message`; a literal-attribute census that undercounted a dynamically-spread family by four; a "no live render exists" claim contradicted by an existing seeded e2e path; several citations pointing at an import, comment, JSDoc, or projection string rather than the executable binding; a component path copied from a review without resolving its directory; and a route prescription naming three renderers where the same section had already established four. **When picking up any item here, re-verify its citations before acting on them** — that is the whole lesson of this section. Working order for the rest: ~~PR2 `BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y`~~ (CLOSED, PR #592), ~~PR3 `BL-AGENDA-PERDAY-VIEWER-FILTER`~~ (CLOSED, PR #610), ~~PR4 `BL-SCAN-SSE-BODY-NULL-CODE`~~ (CLOSED, PR #621), ~~PR5 `BL-PICKER-TAMPER-ADMIN-ALERT`~~ (CLOSED, PR #623), ~~PR6 `BL-ALERT-ACTION-LINKS-E2E`~~ (CLOSED, PR #624 — the residual-sweep working order is COMPLETE). `BL-HEALTH-RESOLVE-DB-LOCKDOWN` stays an accepted risk, deliberately and not by omission. `BL-STEP3-IMPECCABLE-LIVE-RENDER` was unscheduled here and SHIPPED 2026-08-02 on `test/step3-live-render-cluster` (graduated to `BACKLOG-archive.md`).

### BL-AGENDA-PROSE-SECOND-DAY — a day label can name a second day in free prose

**Status:** OPEN — known limit, accepted in PR #610 review R6 · **Severity:** very low · **Class:** FEATURE REACH

`isAmbiguousLabel` (`lib/crew/agendaViewerDays.ts`) fires on SPECIFIC day-shaped signals — a second
date, a second weekday, a `Day N` count, a plural span, a spoken ordinal — judged by both count and
position. It does not require the rest of the label to be recognised, so free prose passes. Verified
still true at PR #610 close-out, after the rule was rewritten three times:

    "Tuesday, May 5, 2026 and the following day"   folds as a plain May 5 row
    "Tuesday, May 5, 2026 plus the next day"       folds
    "Tuesday, May 5, 2026 (two-day block)"         folds

A viewer assigned May 6 loses that row if a separate May 6 row exists.

**Why not closed.** A true whitelist — accepting only a remainder the code can parse — would reject
every heading carrying a venue, track, or session name, which is most real headings. Review R6
measured the over-fire side of that trade directly: month PREFIXES matched Marriott, Marketing,
Junior, Novel, Decision, Augusta and Octagon, which would have disabled folding for whole
extractions. The rule is deliberately positioned as the strictest thing that does not break ordinary
labels.

**Closed already, mechanically** — eleven distinct forms across rounds R2-R10, listed so nobody
re-reports one as new: a second full date; a second weekday name; an ordinal ("the 6th"); a
month-day without a year ("/ May 6"); the same month-day in two years, in ANY pairing of shapes;
slash, ISO and day-first dates; two ordinal-position phrases ("Day 1 / Day 2"); a plural day span
("Days 1-2"); the `Sat` abbreviation; and every one of those in LEADING position as well as
trailing. What remains is prose that names a day without any of those tokens.

**Fix (when prioritized):** only worth it if real corpus labels ever carry this prose. Check the
6-PDF corpus first; today every label there is a clean single date.

### BL-AGENDA-PERLINK-COMPLETENESS — date-partitioned multi-PDF agendas never fold

**Status:** OPEN — surfaced by PR #610 review R5 (MEDIUM) · **Severity:** low · **Class:** FEATURE REACH

`visibleAgendaDaysForViewer` requires ONE link to locate EVERY date the viewer is assigned before it
will fold anything (`located.size === R.size`, with `R` the show-wide viewer date set). When a show
publishes several agenda PDFs partitioned by date — link A covering May 5+7, link B covering May 6+8,
viewer assigned May 5+6 — each link locates one of two and both fail open. Folding is therefore
systematically disabled for that shape even though each link's own rows are completely identifiable.

**Deliberately not changed in #610.** Completeness is show-wide precisely because loosening it is what
produced six separate fold-the-viewer's-day defects across five review rounds. Narrowing it to "this
link's own rows are identifiable AND it located at least one viewer date" is probably the right rule,
but it re-opens that class and belongs in a change that can carry its own adversarial pass. The
current behaviour is SAFE — it fails open — so the cost is a missing improvement, not a wrong page.

**Fix (when prioritized):** per-link completeness, with the invariant search in
`tests/agenda/agendaViewerDaysInvariant.test.ts` extended to multi-link fixtures first, so the
loosening is measured against the property before it ships.

### BL-AGENDA-POSITIONAL-DAYSET-FALLBACK — the day-set matcher has no positional fallback

**Status:** OPEN — deliberate omission, ratified in-spec · **Severity:** very low · **Class:** FEATURE COMPLETENESS

`lib/crew/agendaViewerDays.ts` fails open when labels do not parse, rather than mirroring
`agendaSessionsForToday`'s four-condition positional fallback. Deliberate: the trigger (`!someDateParsed`)
does not occur in the 6-PDF corpus, and folding on positional index means folding in the state of least
knowledge. Full reasoning ratified at
`docs/superpowers/specs/2026-07-26-agenda-perday-viewer-fold.md` §3 under "RATIFIED AMENDMENT".

**Revisit if** the corpus gains documents with purely positional day labels ("Day 1" / "Day 2") AND a
viewer reports seeing the whole show expanded when they expected their day marked.

### BL-HEALTH-RESOLVE-DB-LOCKDOWN — DB-enforce developer-only health-alert resolution

**Status:** OPEN — ACCEPTED RISK, deliberately not scheduled (re-affirmed 2026-07-24) · **Severity:** low · **Class:** SECURITY / DEFENSE-IN-DEPTH · **Effort:** L

**Re-verified 2026-07-24:** the grant is still live — `supabase/migrations/20260501002000_rls_policies.sql:147` reads `grant select, insert, update, delete on table public.admin_alerts to anon, authenticated;`. The acceptance below is unchanged, and this item was explicitly reviewed and left open during the 2026-07-24 residual sweep rather than overlooked. Do not re-raise it as a finding on an unrelated diff; it closes only as part of `BL-ADMIN-POSTGREST-DML-LOCKDOWN`.

alert-audience-split (spec §6.7) makes health-alert resolution developer-gated at every PRODUCT surface (the dev-gated `resolveHealthAlertFormAction` plus HEALTH_CODES rejects on the three legacy user-facing resolve surfaces: `resolveAdminAlertFormAction`, `app/api/admin/admin-alerts/[id]/resolve`, `app/api/admin/show/[slug]/alerts/[id]/resolve`). This is app-surface defense-in-depth + UI coherence, NOT a DB-enforced trust boundary: `admin_alerts` still GRANTs UPDATE to `authenticated` and its RLS policy allows any `public.is_admin()` caller to update rows (`supabase/migrations/20260501002000_rls_policies.sql`), so a non-developer admin could in principle `PATCH admin_alerts.resolved_at` directly through PostgREST, bypassing the app layer. We ACCEPT this (Doug is the trusted business owner, not an adversary; role filtering is UX not security). **Fix (when prioritized):** revoke direct `admin_alerts` UPDATE from `authenticated`/`anon` and route ALL resolution — doug alerts included — through `SECURITY DEFINER` RPCs with an `is_developer()` check for health codes. Materially larger, whole-resolve-path change; deferred as a cross-reference of the broader `BL-ADMIN-POSTGREST-DML-LOCKDOWN` admin_alerts-class DML lockdown item.

### BL-PREPARE-INTERNAL-FAULT-KIND — a third fault kind for post-parse internal helpers

**Status:** OPEN (2026-07-25) · **Severity:** low · **Class:** TELEMETRY GRANULARITY

`PrepareOnboardingFileError` has two kinds, `drive_fetch` and `parse`, and the post-parse internal helpers (`finalizeArchivedTabs`, `reconcileIncludedTab`, `discardAndRerun`'s fix-up, `applyRoleTokenMappings`) currently fall to `drive_fetch` — today's unchanged behavior. Neither code is right for them: a bug in the role-mapping overlay is not a Drive failure, and it is not something Doug fixes by editing his sheet either, so `STAGED_PARSE_FAILED` ("fix its structure", `warn` severity) would be a new wrong instruction. **Fix (when prioritized):** a third `internal` kind mapped to a code that tells the operator to contact the developer, with the finalize severity staying `error`. Needs a new §12.4 row and the full four-gate CI fan-out, which is why it was not folded into the batch that surfaced it.

### BL-CRON-WORKBOOK-FAULT-CODE — a corrupt workbook on the cron path reports SYNC_FILE_FAILED

**Status:** OPEN (2026-07-25) · **Severity:** low · **Class:** TELEMETRY GRANULARITY

The cron sync path also synthesizes workbooks (`lib/sync/runScheduledCronSync.ts:3118,3144`). A throw at either site escapes `prepareProcessOneFile` and is caught by the outer per-file loop (`:3915-3925`), which records `outcome: "parse_error"` with `classifySyncFailure(error)` — typically `SYNC_FILE_FAILED`. So it is already parse-family rather than Drive-family (unlike the onboarding paths this batch fixed), and the open question is narrower: should a corrupt workbook there report `PARSE_ERROR_LAST_GOOD`, whose copy tells Doug the latest edit did not parse and the previous version is still live? **Fix (when prioritized):** key on the `WorkbookSynthesisError` type this batch introduced. Deferred because it changes a live crew-visible sync contract and belongs in its own spec.

### BL-ROOM-DIMS-ONLY-NOVEL-HEADER — parse a dims-only novel breakout header (no DAY-range)

**Status:** OPEN · **Severity:** low · **Class:** PARSER COVERAGE · **Effort:** M

The parser-anchor-de-literalization PR (spec `docs/superpowers/specs/2026-07-05-parser-anchor-deliteralization.md`, audit finding #6) de-literalizes the v1 breakout-room loop from the two literal names `MABEL`/`LAUDERDALE` to any `NAME + trailing DAY-range` header, so a future differently-named DAY-range breakout (`GRAND BALLROOM DAY 1 & 2`) now parses. A dims-ONLY header with NO DAY-range (`SALON ABCD&#10;60' x 45'`, `MERIDIAN HALL&#10;50' x 30'`) is deliberately **out of scope** (spec §2 "Descoped", adversarial-review R31 f1): it is structurally identical to a dims-bearing ASSET/equipment row (`PROJECTION SCREEN&#10;5' x 9'`, `4' X 8' RISER`), so a name-blind admit gate cannot tell a novel dims-only room from an asset — 14 adversarial rounds confirmed every dims-based admit/evidence/ownership gate reopened asset fabrication or field theft. origin/main never parsed this shape, so it is NOT a regression, and a blanket data-gap signal is rejected (it would fire on every gear row = noise). **Fix (when prioritized):** parse a dims-only room only under a POSITIVE room-context signal the sheets actually carry — a `BREAKOUT`/room-section header above the row, or an explicit room label — NOT a dims token. Add fixtures with a real dims-only room inside a room section and assert it parses without any asset row (dims-bearing gear elsewhere on the sheet) becoming a room.

**Update (2026-07-06, spec `docs/superpowers/specs/2026-07-06-bo-venue-header-anchor.md`):** partially addressed by the BO-venue-header anchor — a dims-only header sitting above a **`BO` field block** now parses, anchored on the field block (not the dims token), so no asset is fabricated. The remaining unaddressed sub-case is a dims-only header with **no** field block of any kind (a bare `NAME&#10;dims` cell), which stays out of scope (indistinguishable from an asset without an anchor).

---

### BL-MUTATION-HARNESS-OPEN-HOLES — parser silent-fragility classes pinned by the mutation harness

**Status:** OPEN (2026-07-06, feat/mutation-harness) · **Severity:** medium · **Class:** PARSER ROBUSTNESS · **Effort:** L

The rec-5 mutation-testing harness (`tests/parser/mutationHarness.test.ts`, nightly workflow) pins **7,885 day-1 silent holes** — mutants whose parse changed with no compensating signal (`SILENT_WRONG` / `SILENT_SIGNAL_LOSS`), recorded in `tests/parser/mutation/knownHoles.ts`. Each hole's `finding` field maps its operator class to the audit finding it exercises (`OPERATOR_FINDING_MAP`), so a ledger failure is triageable by operator. Documented-finding classes: **`header-typo` → audit #5** (short-header typo intolerance, `sectionHeaderNormalize.ts:16,66`); **`blank-row:inject` / `blank-row:remove` → audit #10** (blank-row block segmentation, `exportSheetToMarkdown.ts:104`). The remaining operator classes are silent-fragility surfaces the audit did not enumerate as a numbered finding; each is tracked as a backlog sub-item below and its holes shrink when that class is hardened:

- **`BL-MUTATION-REF-SUB`** — a body cell rewritten to the literal `#REF!` (a real broken-reference export artifact, present in 3/7 live shows) is absorbed into the parse with no signal. Value-corruption class.
- **`BL-MUTATION-UNICODE`** — a zero-width non-joiner (U+200C) injected into a cell value is silently retained (the fintech live ZWNJ shape). Invisible-character class.
- **`BL-MUTATION-COLUMN-SHIFT`** — a spurious leading empty column shifts a section's row grid with no signal (the East Coast column-shifted outlier). Layout-shift class.
- **`BL-MUTATION-MERGED-CELL`** — deleting one interior pipe (how a merged cell exports) fuses two adjacent cells silently. Cell-fusion class.
- **`BL-MUTATION-SECTION-ORDER`** — reordering two adjacent top-level blocks silently reorders the parser's output arrays (the parser preserves source order). **Order-sensitivity discovered by the harness on 2026-07-06** (58 `SILENT_WRONG` + 24 `SILENT_SIGNAL_LOSS` across the corpus); section-reorder was reclassified cosmetic → corrupting as a result.

**Ratchet:** the ledger is a shrink-only baseline. When a downstream fix hardens one of these classes, the corresponding holes become `staleRows` and the nightly harness fails until they are removed from `knownHoles.ts` — turning each parser-robustness fix into a measurable ledger reduction. Do NOT grow the ledger silently; a NEW hole (regression) fails the harness as `newAlarms`.

---

### BL-EXPORT-BLANK-ROW-SEGMENTATION — blank-row block segmentation fuses/splits sections silently (audit #10)

**Status:** PARTIALLY CLOSED (2026-07-27, `fix/export-blank-row-segmentation` — spec `docs/superpowers/specs/2026-07-27-export-blank-row-segmentation.md`) · **Severity:** medium · **Class:** EXPORT/PARSER ROBUSTNESS

**Partial closure (2026-07-27):** two of the three spec'd fix directions shipped. (b) **Header-aware segmentation** — `splitBlocks` now starts a new block at a mid-block row whose first non-blank cell is an uppercase known section header (`isMidBlockSectionStart`, `lib/parser/knownSections.ts`; `CLIENT` excluded on corpus evidence), closing the FUSE case structurally for uppercase-known headers with corpus-verified zero output drift (`tests/drive/round-trip-fixture.test.ts` byte-equality + archived-tab fingerprint golden). (c) **Crew-scoped orphan detection** — a new warn-severity `ORPHANED_CREW_ROWS` ParseWarning (operator card + crew-region deep link) fires when a table block's first row carries a crew-role cell (≥2 distinct Load In / Load Out / Strike / Set tokens on one line) with no section header — the SPLIT case for crew rosters, at 0 corpus false positives and 29/29 simulated-split recall (ratcheted by `tests/parser/orphanedCrewRowsCorpus.test.ts`). **The backlog entry's generic orphan-block rule ("no recognizable header adjacent to a recognized section") was probed and REFUTED: 30 false positives on the live corpus** (GEAR-tab gear lists under room headers, INFO free-text blocks, PULL SHEET title rows) — blocks starting with non-header rows are normal sheet layout. **Residuals (still open):** splits of non-crew sections (hotel/transport/details tails have no corpus-clean discriminator); fuses onto mixed-case or unknown headers; crew rows carrying fewer than two role tokens on one line of one cell (including role cells authored with literal pipes, which the parser's cell split decomposes); and the mutation harness cannot observe the exporter-level fuse fix (it mutates exported markdown, never the grid), so `blank-row:remove` ledger holes remain by construction.

`splitBlocks` (`lib/drive/exportSheetToMarkdown.ts:127-144`) segments the sheet grid into blocks using fully-blank rows as the **only** delimiter. Two failure modes, both silent: (a) a stray value in a spacer row (normal authoring noise — a forgotten cell, a note typed into the gap) **fuses** two adjacent sections into one block, so the downstream parser attributes one section's rows to another; (b) a blank row inserted mid-section **splits** one section into two blocks, orphaning the tail rows from their header. Neither emits a signal — mis-grouped sections flow into the parser as plausible structure. The 2026-07-07 e2e audit re-verified this unchanged; the 2026-07-10 re-rating (§10) left it as the only numbered finding with zero movement (2 fixed, 2 partial, 1 by-design). The mutation harness pins the blast radius (`blank-row:inject` / `blank-row:remove` holes in `knownHoles.ts`, mapped via `OPERATOR_FINDING_MAP` — see BL-MUTATION-HARNESS-OPEN-HOLES above) but detection-in-tests is not detection-at-runtime. **Fix directions (pick at spec time):** (a) near-blank-row heuristic — a row with exactly one short non-blank cell adjacent to blank rows emits a warn-severity `ParseWarning` instead of fusing; (b) section-header-aware segmentation — a row matching a `KNOWN_SECTION_HEADERS` shape mid-block starts a new block (closes the fuse case structurally); (c) orphan-block detection — a block with no recognizable header row adjacent to a recognized section warns as a probable split. Any fix hardens a mutation-harness class → the corresponding ledger holes become `staleRows` per the ratchet above. Trigger to promote: a live show where a spacer-row stray value or mid-section blank row mis-groups data with no operator signal.

---

### BL-TRANSPORT-ID-RESOLUTION — id-based transport visibility + no-match admin warning (deferred from Flow 8.4 to 8.3)

**Status:** PARTIALLY CLOSED (2026-07-09, Flow 8.4 PR #374) · **Severity:** medium · **Class:** CREW VISIBILITY / ENRICH

**Partial closure (Flow 8.4, PR #374 — `docs/superpowers/specs/2026-07-09-flow8.4-transport-assignee-warning.md`):** the **enrich-time no-match admin warning** shipped. `lib/sync/enrichTransportAssignees.ts` emits one admin-only aggregate data-gap warning (`TRAVEL_TRANSPORT_NAME_UNMATCHED`, `gateExempt: true`) when a transport driver/assignee name references a crew member who would not see their own tile — turning silent invisibility into a staged-review data-quality signal. **Still deferred to 8.3:** id-persistence + id-based visibility matching (a crew `id` does not exist at enrich time — the uuid is DB-assigned at APPLY via `gen_random_uuid()`, `initial_public_schema.sql:32` — so resolve-to-id-and-persist is architecturally infeasible in the enrich pass; 8.3 must move it to an apply-time step). The regression pins below also remain for 8.3, which changes the `transportTileVisible` predicate.

The Flow-8 audit item 8.4 (`docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` §Flow 8) asks that a transport name mis-parse cannot hide a driver's own itinerary. `transportTileVisible` (`lib/visibility/scopeTiles.ts:177-202`) matches assigned crew by **fuzzy name** (`namesRefer`, `lib/data/nameMatch.ts`), which closes the common variance (nickname / legal-name / case / trim / prefix) but NOT a **hard** mis-parse (a merged-cell overflow that shifts the surname token, e.g. a driver stored as `"Doug Larson Loadout"` — the adjacent column fused onto the name — vs roster `"Doug Larson"`; verified `namesRefer` returns false because the multi-token rule compares last tokens `"loadout"`≠`"larson"`). In that case the driver silently does not see their own ground-transport block. Flow 8.4 (PR #374, see Partial closure above) now emits an **admin-visible no-match warning** for this case, so it is no longer _silent_ — but the driver still does not see their tile until the operator fixes the name, because id-based visibility matching remains deferred to 8.3.

**Deferred defensive regression pins (moved out of `flow8-self-serve-trio` at plan-review Round-11; land red-first in 8.3):** pin `transportTileVisible`'s _current_ fuzzy tolerance against name-parse-variance regression — driver `"Doug"` vs viewer `"Doug Larson"` → visible (prefix); `"Douglas Larson"` vs `"Doug Larson"` → visible (surname); assigned-names `["Bill Werner"]` vs `"William Werner"` → visible; case/trim `"  doug larson "` → visible; negative controls (`"Jane Smith"` → not visible, empty/`null` → not visible, admin → visible when transportation exists); and the **known-gap fixture** driver `"Doug Larson Loadout"` vs `"Doug Larson"` → **not visible** (verified live: multi-token rule compares last tokens `"loadout"`≠`"larson"`, `nameMatch.ts:50-53`). These were removed from the milestone because a green-only regression-pin task conflicts with plan-wide invariant 1 (non-negotiable red-first per task); they belong red-first in 8.3, which changes this exact predicate.

**Fix (deferred to the 8.3 venue-timezone / enrich spec, same enrich domain + admin-warning machinery):** at enrich time, resolve free-text `driver_name` / `assigned_names` → `crew_member` ids against the show roster, persist the resolved id set on the transportation legs / driver, match viewer visibility by id (robust to any later render-time name garble), and emit an admin-visible alert when an assigned name resolves to **no** roster member (turns silent invisibility into a data-quality signal — parallels 8.3's ET-default admin warning). Add fixtures with a hard-mis-parsed driver name and assert the driver's own transport becomes visible via id resolution AND that the no-match name raises the admin warning. Interim crew recourse until this lands: the Flow-8.1 picker "Don't see your name?" affordance.

---

## Crew-page share-link chrome (2026-07-14, share-link-instant-rotate-dedup)

## Share hub follow-ups (2026-07-25, share-link-chrome-backlog)

## BL-STAGED-IDENTITYLINK-RENAME-IDENTITY — dashboard staged apply treats identity-link renames as remove+add

**Filed:** 2026-07-17 (role-flags-notice-lead-only-doug §2.5) · **Class:** sync (staged identity application) · **Effort:** M (staged-core threading + double-apply analysis)

The dashboard staged-apply path (`applyStagedCore`) applies an identity-linked rename (MI-12/13/14) as **remove-old + add-new** by ratified contract (R33-2, `applyStagedCore.ts:552`; passes zero `identityLinkRenames`), so crew identity (id/oauth link) is NOT preserved across a rename on that path. The capability AUDIT is already complete (arm (c) audits the removed old identity's loss + arm (b) the added new identity's grant, path-independent), so this is NOT an audit gap. If identity-PRESERVATION on the staged path is ever wanted, thread `identityLinkRenames` through `applyStagedCore` (compute via `computeIdentityLinkRenames` from the staged `triggeredReviewItems`) — but resolve the double-apply / R33-2-override risk first. Trigger: a report of a staged rename losing a crew member's oauth link.

## BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS — one component retained by contract; the other four retired

**Status:** IN PROGRESS · **Branch:** chore/orphan-components-lead-prose

**Filed:** 2026-08-02 (`chore/copy-deadcode-sweep`, the class sweep that closed `BL-ADMIN-PARSEPANEL-ORPHANED`) · **Worked:** 2026-08-03 (`chore/orphan-components-lead-prose`) · **Class:** dead code · **Severity:** low

ParsePanel was not alone. Shape swept: **a file under `components/` that no file under `app/`, `components/`, or `lib/` imports.** Test importers deliberately do not count — ParsePanel HAD two, which is why it survived the pivot unnoticed for months.

**Worked 2026-08-03. Four of the five were RETIRED**, each with a named superseding commit AND a named live successor — "nothing imports it" was the guard's finding, never the argument for deletion:

| File                                      | Disposition                                                                                                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/admin/PerShowCrewSection.tsx` | RETIRED. Mount removed at `d70761005`; the route is now a 307 into the dashboard modal, where `CrewBreakdown` renders the roster.                                 |
| `components/admin/ResolveAlertButton.tsx` | RETIRED. Superseded at `67ce6d082` by the bell panel's resolve control (labelled `Confirm` / `Mark resolved`, never "Dismiss").                                   |
| `components/admin/RunFinalCASButton.tsx`  | RETIRED. Superseded at `bd214c04b`; `FinalizeButton`'s `"finish"` mode is the live finalize-cas path.                                                             |
| `components/right-now/RightNowCard.tsx`   | RETIRED. Superseded at `b327d5eb0` by `RightNowHero`; its two regression suites were RETARGETED onto the hero first, each proven by mutation rather than assumed. |
| `components/shared/WrappedTile.tsx`       | **RETAINED — a decided terminal state, not leftover work.**                                                                                                       |

**Why the entry stays open with one row.** `WrappedTile` is retained by the ratified KEEP at `docs/superpowers/plans/crew/2026-06-15-crew-page-redesign-phase1/04-layout-migration-closeout.md:10`. Its dormancy is itself the contract the 2026-07-24 alert-autoresolve family relies on — it keeps `TileServerFallback`'s `TILE_SERVER_RENDER_FAILED` producer dormant and its write-site pin honest — and `tests/crew/_metaTileProducerTopology.test.ts` pins exactly that. Deleting it would not shrink this ledger: it is the sole production importer of BOTH `TileErrorBoundary` and `TileServerFallback`, so the ledger would grow by two and take a registered alert producer with it. There is no mount to wire either — the live crew sections are synchronous and use `WrappedSection`, the deliberate synchronous analog; `WrappedTile` is the async `load()` form. **A future sweep must not read this row as unfinished work.** `tests/components/_metaOrphanedComponents.test.ts` asserts the row's reason names the KEEP and both cascade dependents, so the reason cannot decay back into an observation.

**The debt is still not silent**, and it gained a second guard. `tests/components/_metaOrphanedComponents.test.ts` walks `components/**` every run and fails on any zero-production-importer file absent from `ORPHAN_ALLOWLIST`; `tests/docs/retiredIdentifierReferences.test.ts` walks every tracked file for references to what this branch retired, keyed by line content, so a stale citation to a deleted component cannot survive either. Emptying the allowlist is no longer this entry's goal; keeping every row's reason true is.

## BL-CAPABILITY-MATRIX-FINANCIALS-PREDICATE — the flip matrix models five predicates; the code has six

**Filed:** 2026-08-03 (`chore/orphan-components-lead-prose`, settling `BL-LEAD-CAPABILITY-PROSE-STALE`) · **Class:** docs/contract drift · **Severity:** low · **Effort:** M

`CAPABILITY_TRANSITION_MATRIX` (`lib/visibility/capabilityTransitions.ts`) enumerates the 10
unordered pairs of five predicates — `hasLead`, `hasA1`, `hasV1`, `hasL1`, `hasAdmin`
(`lib/visibility/capabilityTransitions.ts:53`). The `FINANCIALS` role flag, added to
`financialsVisible` at `e348c81ca` (2026-07-16, `lib/visibility/scopeTiles.ts:141`), is not among
them. The type comment at `lib/visibility/capabilityTransitions.ts:48-51` claims a new predicate
"surfaces here AND in the matrix as a TypeScript error if the matrix is incomplete"; that mechanism
did not fire, because nothing added the flag to the union.

**Consequence today is documentary, not behavioral.** The matrix has no production consumer — its
only reader is `tests/visibility/capabilityTransitions.test.ts`. But its own definition of a
recorded delta ("the flip is SUFFICIENT to change visibility regardless of the other predicate",
`lib/visibility/capabilityTransitions.ts:126-131`) is no longer literally true for `FinancialsTile`:
a `hasLead` flip does not toggle it for a viewer who also holds `FINANCIALS`. The header now states
that modeling boundary explicitly, and `tests/visibility/capabilityHeaderParity.test.ts` pins the
quoted predicates against `scopeTiles.ts` source, so the prose cannot drift again — but the MATRIX
is still five-predicate.

**Fix (when prioritized):** add `hasFinancials` to `CapabilityPredicate`, expand the matrix from
C(5,2)=10 to C(6,2)=15 entries with their deltas, and update the structural test's length assertion
(`tests/visibility/capabilityTransitions.test.ts:40`). Deliberately NOT done in a prose branch: it
is a design change with a 15-row blast radius, and the settled question there was whether the
header quote was stale (it was).

**Trigger:** the next milestone touching scope-tile visibility, the financials entitlement, or the
matrix itself.

## BL-BELLPANEL-DISMISS-COMMENT-DRIFT — six BellPanel comments name a label the panel stopped rendering

**Filed:** 2026-08-03 (`chore/orphan-components-lead-prose`, spec review R1 finding 4) · **Class:** docs/copy drift · **Severity:** low · **Effort:** S

`components/admin/BellPanel.tsx` calls its trailing ghost control "Dismiss" in six comments
beginning at `components/admin/BellPanel.tsx:224` ("Trailing ghost Dismiss (DESIGN.md §16)", "must
not stay stuck at Dismissing…", "Health rows … have no Dismiss", and so on). The control renders
`Confirm` or `Mark resolved`, chosen by the alert code's intent
(`components/admin/BellPanel.tsx:377-388`, `lib/adminAlerts/resolveActionLabel.ts:73-76`); no
"Dismiss" string reaches the DOM.

**Why filed rather than swept:** it is the same defect CLASS as the branch that found it (prose
asserting something the code does not do) but a different SHAPE — a renamed label, not a citation to
a deleted file — and the branch that found it was retiring components, not editing alert chrome.
Sweeping it in would have grown that diff past its subject. No product question: the code is right
and the comments are stale.

**Fix (when prioritized):** reword the six comments to the rendered labels, and check whether
`DESIGN.md §16`'s own wording still names a Dismiss affordance.

**Trigger:** the next branch touching `BellPanel` or the alert-resolve labels.

## BL-RESYNC-REGRESSED-JUMP-LINK — the alert's "open the parse panel" pointer is prose, not an affordance

**Status:** OPEN · **Severity:** LOW-MEDIUM (discoverability) · **Class:** UX — surfaced by the correction-loop de-duplication (#516, 2026-07-20) · **Effort:** M

`RESYNC_QUALITY_REGRESSED`'s body ends "…open the parse panel to see what degraded and fix the sheet." That sentence is the ONLY thing routing Doug from the alert to the Parse warnings panel, and it is plain prose: no link, no jump control.

This pointer became load-bearing in #516. Before that change, the Overview section rendered the correction-loop instruction ("Fixed it in the sheet? … then re-sync.") directly under the alert, so a reader who never scrolled still got the how-to-fix. #516 removed that copy as a duplicate — correctly, since the Parse warnings panel renders the same sentence on a strictly wider condition — which means the alert's prose pointer is now the whole bridge between "something degraded" and "here is how to fix it".

**Why this is NOT a code fix:** master spec §12.4 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2801`) ratifies "No action link." for this row. Adding a jump affordance contradicts a ratified contract, so it needs a spec amendment first, not a patch. Do not "just add a link" in a UI PR.

**Options to weigh at spec time:** (a) amend the §12.4 row to permit a section-jump action link (note the row's `resolution:"auto"` posture — the link would be navigational, not resolving, which is a different affordance class than the action links other rows carry); (b) leave the alert alone and instead make the rail's "Parse warnings" section carry the attention dot the alert implies, so the route is visible in the nav rather than in prose; (c) accept the prose pointer as sufficient given the rail is always visible in the modal.

**Trigger:** next milestone touching §12.4 alert rows, the attention surface, or `CompactAlertCard` affordances.

## BL-E2E-LIFECYCLE-SPECS-CI-DARK — admin-lifecycle e2e specs are matched by playwright projects but invoked by no workflow

> **UPDATE 2026-07-26 (PR4 of the CI-dark cluster).** `admin-lifecycle-transitions.spec.ts` stays allowlisted, but for a materially different reason than before: its two DETERMINISTIC breaks are fixed (a retired-testid assertion that failed every run, and a compound case the ShareHub backdrop made unreachable) and the pre-hydration swallow is repaired. It went from failing every run to one flaky case, measured 4/5 locally with one real-CI failure on the round-trip. Not wired, per spec §6.1's five-consecutive-greens acceptance and its pre-ratified fallback. Tracked as `BL-E2E-LIFECYCLE-TRANSITIONS-ROUNDTRIP-FLAKE`. The rest of this umbrella is the ~60 app-dependent specs needing a dev server and seeded database, deliberately out of the cluster's ratified scope.
>
> **UPDATE 2026-07-27 (`fix/lifecycle-transitions-roundtrip-flake`).** The round-trip flake is fixed and `admin-lifecycle-transitions.spec.ts` is WIRED — `lifecycle-layout-e2e.yml` runs it on every `pull_request`, five consecutive green normal-dispatch runs met spec §6.1 / AC-6, and its allowlist row is deleted. `BL-E2E-LIFECYCLE-TRANSITIONS-ROUNDTRIP-FLAKE` graduated to `BACKLOG-archive.md`. This umbrella's remaining scope is unchanged: the ~60 app-dependent specs.

**Status:** OPEN · **Severity:** MEDIUM (dark regression coverage) · **Class:** CI wiring — surfaced by the archive-row-menu-idiom spec R11 adversarial round (2026-07-24).

**Effort:** L

**PARTIAL 2026-07-26 (PR2 of the CI-dark coverage cluster).** The umbrella shrank substantially: 30 allowlist rows citing this item are gone, because `standalone-e2e.yml` now runs the whole standalone config unfiltered on every PR. 60 rows remain, all app-dependent specs that need a dev server and a seeded database — deliberately out of the cluster's ratified scope. `admin-lifecycle-transitions` specifically was PR4's subject and closed on 2026-07-27 (five consecutive greens, see the UPDATE above).

`tests/e2e/admin-lifecycle-layout.spec.ts` and `tests/e2e/admin-lifecycle-transitions.spec.ts` appear in the `mobile-safari` project `testMatch` (`playwright.config.ts`), but every e2e workflow runs an explicit spec list and none names them — they run nowhere in CI. The archive-row-menu-idiom branch wires the LAYOUT spec (new `lifecycle-layout-e2e.yml`, since it carries that feature's load-bearing assertions); the TRANSITIONS spec remains dark. **Fix (when prioritized):** add `admin-lifecycle-transitions.spec.ts` to the same workflow (or its own) after fixing its local flake class — the 2026-07-24 flake audit (archive-row branch) measured: static source-guard red since 2026-07-20 (fixed on that branch via the ArchiveShowButton transition-opacity carve-out mirroring PublishedToggle's), plus 3 pre-hydration click-swallow failures (hub kebab open x2, published toggle x1) whose failing cases move between runs; the layout spec's toPass hydration-retry is the template. The structural guard for the class (workflow-coverage meta-test with a reasoned allowlist) SHIPPED with the archive-row-menu-idiom branch (spec §6 item 6); un-wiring work here is now just moving this spec off that allowlist by adding it to a workflow. Related owner decision (R18), **corrected 2026-07-26**: the claim that branch protection requires only the `quality` context is STALE — measured, the live required set holds TWELVE contexts. The e2e jobs are advisory not because one context is required, but because none of them is in that set. Promoting e2e jobs into it so a red e2e blocks merge at the GitHub layer remains an owner GitHub-settings action, not repo code; until then enforcement is the pipeline's all-checks-green procedural gate. Measurement: `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md` §2.5.

**New instance observed 2026-07-26 — FIXED 2026-08-03** on `chore/ci-boot-overlap-and-popover-flake`: T-REGROW's two armed measurements no longer take a fixed wait. The real run retries the whole measurement so a transient pre-re-placement state retries while a regression still times out; the ladder sweep settles on observed growth. A structural guard (`tests/cross-cutting/e2e-regrow-settle-contract.test.ts`) anchors a retry at each arming site so the fixed wait cannot creep back. The three fixed waits the class sweep found ELSEWHERE in that file are filed separately as `BL-E2E-LAYOUT-FIXED-WAIT-RESIDUE`. The umbrella below — the ~60 app-dependent specs — is unchanged and stays OPEN. Original text follows, unedited, for provenance. (destruct-thumb-order PR #604): the LAYOUT spec — the one this row records as stabilized by the `toPass` hydration retry — failed once in `lifecycle-layout-e2e` on `mobile-safari`, at the archive-confirm popover assertions (`tests/e2e/admin-lifecycle-layout.spec.ts:411` `scrollIntoView(confirm) must have been called`, and `:538` armed body within the clip rect), 24 passed / 1 failed. Confirmed a flake, not a regression: the failing commit touched only `tests/e2e/pendingDiscardReal.layout.spec.ts`, which that workflow does not run, the two commits before it passed, and a re-run of the identical tree went green. So the hydration retry does NOT cover the popover-placement path — the growth-then-replace measurement takes a fixed `waitForTimeout(300)` rather than retrying to a condition, which is the likely remaining gap. \*\*Fix shape:\*\* replace that fixed wait with a `toPass` block around the armed measurement, same template as the rest of the spec.

## BL-E2E-LAYOUT-FIXED-WAIT-RESIDUE — three fixed waits remain in the lifecycle-layout spec after the T-REGROW fix

**Status:** OPEN · **Severity:** LOW (flake surface, no product impact) · **Class:** e2e test hygiene · **Filed:** 2026-08-02 (`chore/ci-boot-overlap-and-popover-flake`, class sweep behind the T-REGROW fix) · **Effort:** M

`docs/superpowers/specs/ci/2026-08-02-ci-boot-overlap-implementation.md` §6 replaced T-REGROW's two fixed `waitForTimeout` calls with `toPass` blocks, which is the instance `BL-E2E-LIFECYCLE-SPECS-CI-DARK` names. The class sweep behind that fix found three more in the same file, enumerated here rather than left implicit:

Anchored by ENCLOSING TEST rather than by line: the T-REGROW fix inserts lines above two of the three, so any line number recorded here rots the moment that branch lands.

- The `390x560: arming scrolls the popover's OWN scroller to the confirm` case (T-CONFIRM-SCROLL, opening at `tests/e2e/admin-lifecycle-layout.spec.ts:328`) — a 250ms wait immediately before the geometry read and the `window.__siv` call-record assertions. This case failed once in the same PR #604 run that produced the T-REGROW instance, so it is a live flake surface, not a theoretical one.
- The `T-FIT/T-REACH @ 390x{height}` case and the `T-TRANSITION` case — one fixed wait each.

**Why not fixed with T-REGROW.** Each needs its own settle predicate, and the predicate is the whole difficulty. T-CONFIRM-SCROLL's is "the production `scrollIntoView` call has been recorded on `window.__siv`" — a different condition from T-REGROW's growth-then-replace, and one where folding the assertion into the retry risks converting the thing under test into the wait condition. Picking each predicate is per-case work with its own tautology review; batching them behind one settle template is exactly the shortcut that would produce a green test proving nothing.

**Trigger:** the next observed CI failure in one of these three cases, or any change to the file that already re-opens the surrounding case.

## BL-RESOLVE-INTENT-WRONG-VERB — two event-shaped alerts render "Mark resolved" where "Confirm" is correct

**Status:** OPEN · **Severity:** LOW (copy defect, no functional impact) · **Class:** admin copy / lifecycle contract · **Effort:** M

`SHOW_FIRST_PUBLISHED` ("<sheet> is now live for crew…") and `PICKER_EPOCH_RESET` (whose own help text reads "Nothing to fix; this is a record of the reset") are both recorded as `intent: "resolve"` in `RESOLVE_INTENTS` (`lib/adminAlerts/resolveActionLabel.ts:58`, `:60`), so their button reads "Mark resolved". By the module's own rule (`lib/adminAlerts/resolveActionLabel.ts:9-12`) both are `confirm`: a deliberate thing that already happened, not a fault to clear. Visible in the notification bell; both codes are excluded from the per-show attention index, so the show modal is unaffected.

**Why it was not fixed in the attention-index change (2026-07-24).** `tests/adminAlerts/_metaResolveIntentLifecycle.test.ts` defense 5c reads the intent baseline from **`origin/main`** and asserts every historical `(code, intent)` pair still resolves identically (`tests/adminAlerts/_metaResolveIntentLifecycle.test.ts:118-124`). Both codes are `resolve` in that baseline (19 rows). Updating the in-tree baseline and the approved-confirm list does not satisfy the gate, because it compares against main's copy. Intent is append-only by design, and the test states the rationale: "rows already in admin_alerts still render it" — a persisted alert row resolves its label at render time, so flipping an intent retroactively relabels every open row of that code.

**What fixing it requires.** A ratified amendment to the append-only contract, deciding that a retroactive relabel is acceptable when the original intent was simply wrong, plus the mechanism to express that (an exception list the history gate honours, or a versioned baseline). That is a contract change with its own blast radius, not a copy edit. Analysis recorded in `docs/superpowers/specs/2026-07-24-attention-index-consolidation.md` §2.6.

---

## BL-FITWITHINCLIP-DOUBLE-MOUNT-MEASURE — the hook measures twice on every mount

Surfaced by the non-degraded impeccable gate rerun on PR #658 (2026-08-02), and pinned by
`tests/components/admin/useFitWithinClip.test.tsx` case (g), which asserts the count is 2 so a
change to the mount path is visible rather than silently absorbed.

`useFitWithinClip` measures once when the layout effect runs, then the ref callback's
`setAttachCount` bump re-runs the effect and it measures again. Both passes see a valid node
and compute the same number, so the second is pure cost: one extra forced synchronous reflow
(write, read, read, read, write) per mount, on every overlay the hook serves.

The bump exists for a real reason — these overlays mount long after their owner, so an effect
keyed on the ref alone would run once with `null` and never wire the observers up. The fix is
not to remove it but to stop needing it: React 19 lets a ref callback return a cleanup, so the
callback itself could own the observer wiring and the state counter could go away entirely.

**Trigger:** a refactor of the hook's attach mechanism, or evidence that mount cost matters on
a surface with many simultaneous overlays. Not worth a standalone change at two reflows.

---

## BL-FITWITHINCLIP-CLIP-SCROLL-STALE — a SCROLLING clip ancestor is never re-measured on scroll

**Effort:** S

Surfaced by the non-degraded impeccable gate rerun on PR #658 (2026-08-02).

`findClippingAncestor` (`components/admin/useFitWithinClip.ts`) accepts ANY non-`visible`
overflow as the clip edge, which deliberately includes `overflow-y: auto` — a scrolling
ancestor clips just as a `overflow-clip` panel does. But the effect subscribes to resize
(ResizeObserver on the clip ancestor and the offsetParent), `transitionend`, and window
resize. It never listens for `scroll`.

So on a surface where the clip edge SCROLLS, the fitted cap is computed once against the
ancestor's position at mount and then goes stale: scrolling moves the clip edge relative to
the overlay without resizing anything, and nothing re-measures.

Not reachable on today's surfaces — every current clip ancestor is the review-modal panel
(`overflow-clip`, non-scrolling). This is a latent gap in the hook's stated contract, not a
live defect.

**Trigger:** the first consumer whose clip ancestor scrolls. Fix is a passive `scroll` listener
on the resolved clip ancestor, routed through the same coalescer as the other signals.

---

## BL-FITWITHINCLIP-DOUBLE-ANCESTOR-WALK — `findClippingAncestor` walks the tree twice per effect run

Surfaced by the non-degraded impeccable gate rerun on PR #658 (2026-08-02).

`apply()` walks up from the node to resolve the clip ancestor, and the layout effect walks
again immediately afterwards to decide what to observe. Each walk calls `getComputedStyle` on
every ancestor until it finds a non-`visible` overflow.

Hoisting the result is not free: `apply()` must re-walk on every invocation, because the
ancestor chain can change between measures (an overlay can be reparented, and an ancestor's
overflow can change). Only the effect's own second walk is redundant, and only for the run
that just called `apply()`.

**Trigger:** profiling that shows ancestor-walk cost is material, or a refactor that already
restructures the effect body. Micro-optimisation otherwise.

---

## BL-ADMIN-SEMANTIC-Z-INDEX-SCALE — overlay stacking is raw Tailwind numerics, not named bands

Surfaced by the non-degraded impeccable gate rerun on PR #658 (2026-08-02).

The admin overlay cluster stacks by bare numeric utility: `z-20` (attention panel and hub
backdrop), `z-30` (elevated hub trigger), `z-40` (PublishedToggle refusal banner). The bands
and their ordering are explained only in code comments, so the relationships they encode —
"the elevated trigger must outrank the backdrop", "the refusal banner outranks everything in
the strip" — are invisible at each use site and are re-derived by hand every time an overlay
is added.

`app/globals.css` defines no `--z-*` tokens. The impeccable general rules ask for a semantic
scale (dropdown, sticky, modal-backdrop, modal, toast, tooltip) so the intent is readable and
a new surface picks a band rather than a number.

**Trigger:** the next overlay added to this cluster, or the first stacking bug caused by two
surfaces picking the same numeric. A tree-wide sweep is the natural companion to filing tokens,
since the value of the scale is that every site uses it.

---

## BL-ATTENTION-PANEL-NAME-LEADING-SECTION — the panel is named for its first section, not its contents

Surfaced by the non-degraded impeccable gate rerun on PR #658 (2026-08-02).

`components/admin/showpage/AttentionMenu.tsx` names the panel `"Needs you"` when any needs-you
item exists and `"Monitoring"` otherwise — the first group actually present. When both groups
are present the panel therefore announces as "Needs you" while also containing Monitoring rows,
so its accessible name understates what it holds.

This is deliberate and documented in-code: the name mirrors the visible leading heading, which
is what a sighted user sees at the top of the panel, and the alternative names ("Needs you and
monitoring", or a neutral third noun) either read as clutter or drift from the visible text.
The related genuine defect — the inner scroller calling itself "Show issues", which was wrong
for a monitoring-only list — is fixed separately.

**Trigger:** a screen-reader pass on the show page that judges the understatement in practice,
or a redesign that gives the panel a visible title of its own to name it from.

---

## Merged from the plans backlog (2026-08-02)

`docs/superpowers/plans/BACKLOG.md` was a second, disjoint `BL-` registry: 53 entries under
this file's own id prefix, sharing exactly one id with it, cross-referenced from neither side.
Two registries under one namespace means a `BL-` citation has no single place to resolve, which is
what `tests/docs/_metaLedgerReferentialIntegrity.test.ts` now enforces against. The 41 open entries
follow verbatim; the 12 already-terminal ones went to BACKLOG-archive.md per the open-queue-only
rule above. Ids and bodies are unchanged — grep by id still works. Headings are normalized to `###`
so they nest here.

Promotion path these were filed under, retained: spec at `docs/superpowers/specs/<date>-<name>-design.md`,
plan tree at `docs/superpowers/plans/<date>-<name>/`, a milestone number, then list it in
`docs/superpowers/plans/README.md`. Promotion is gated like any milestone — brainstorming, spec
self-review, adversarial review, planning, adversarial review.

### BL-OPS-LOG — Structured operator-log sink + producer wiring

**VERIFIED INCOMPLETE 2026-08-03 — 3 of 6 scope clauses unshipped. Do not archive.** Checked clause-by-clause during the merged-backlog sweep; recorded so the next reader does not re-derive it.

- **Built** — the durable sink: `lib/log/persist.ts:16` writes `app_events` (module is `lib/log/`, not the proposed `lib/operatorLog/` — equivalent). Sign-out producer: `app/auth/sign-out/route.ts:108,117`.
- **MOOT** — the redeem-link producer and its 10 codes: `app/api/auth/redeem-link/route.ts` was dropped at the M11.5 cutover and is now a banned term (`tests/cross-cutting/no-m9-5-surfaces.test.ts:38`). Cannot ship; not a blocker.
- **REMAINS (1)** — the OAuth callback producer is partial. `OAUTH_STATE_INVALID` has adjacent durable emits (`app/auth/callback/route.ts:234,250`), but the `OAUTH_REDIRECT_INVALID` branch emits nothing (`app/auth/callback/route.ts:265-269`; same gap at `app/api/auth/google/start/route.ts:47-49`). Neither code is ever a persisted `code:` — it exists only as a `validateNextParam` return discriminant and a catalog copy row.
- **REMAINS (2)** — the `ONBOARDING_OPERATOR_ERROR` producer. Render-only today: `components/admin/OnboardingWizard.tsx:548` displays catalog copy; no `log.*` emit anywhere.
- **REMAINS (3), the load-bearing one** — the admin-visible banner. The only reader of the sink is `/admin/dev/telemetry` (`app/admin/dev/telemetry/page.tsx:24`), gated by `requireDeveloperIdentity`. That is a developer-gated page, not a dashboard banner: Doug must leave the dashboard and, as a non-developer, likely cannot reach it at all. No admin-dashboard surface reads `app_events` (the two hits in `app/admin/actions.ts:81,168` are comments about paths that leave no row).

**Origin:** Consolidates four DEFERRED entries from the FXAV crew-pages plan that all blocked on the same nonexistent infrastructure: M5-D9 (OAuth callback structured operator-log), M5-D10 (Redeem-link structured operator-log), M5-D11 (Sign-out teardown structured operator-log), M10-D-PHASE1-1 (ONBOARDING_OPERATOR_ERROR durable notification via Sentry + admin-visible banner).

**Effort:** L

**Scope (combined from the four originating entries):**

- A `lib/operatorLog/` module that writes structured operator-facing log entries to a durable sink. Sink design TBD — candidates: Supabase table, Sentry, or hybrid (Sentry for high-signal incidents + a Supabase audit table for everything else).
- Producer call sites for:
  - `app/auth/callback/route.ts` — emit `OAUTH_REDIRECT_INVALID` + `OAUTH_STATE_INVALID` alongside the redirect query codes.
  - `app/api/auth/redeem-link/route.ts` — emit every redeem-link failure code (`CSRF_DENIED`, `CSRF_NONCE_EXPIRED`, `CSRF_KEY_ROTATED`, `LINK_REDEEM_KEY_ROTATED`, `SESSION_NOT_FOUND`, `LINK_NO_CREW_MATCH`, `LINK_VERSION_MISMATCH`, `LINK_REVOKED_FLOOR`, `LINK_REVOKED_SURGICAL`, `ADMIN_SESSION_LOOKUP_FAILED`).
  - `app/auth/sign-out/route.ts` — emit on `deleteSession()` and Supabase `signOut()` failures.
  - Onboarding wizard `ONBOARDING_OPERATOR_ERROR` producer (per M10 Phase 1 R1).
- Admin-visible banner integration so Doug sees the most recent operator-log entries (without having to leave the dashboard).

**Why backlog, not deferred:** The work is real and motivated, but: (a) no spec or plan exists; (b) the sink design needs a brainstorming session (Supabase vs Sentry vs hybrid); (c) no scheduled milestone exists to absorb it; (d) several of the producer surfaces work acceptably today via inline `console.error` or `admin_alerts` UPSERT — operator visibility is degraded, not absent. Picking this up requires first scoping the milestone (spec + plan), not just implementing the producer wiring.

**Promotion prerequisite:** brainstorming session on sink design (Supabase audit table vs Sentry vs hybrid + retention + admin-banner integration shape).

### BL-PUSH-NOTIFICATIONS — Email-primary operator push surface

**VERIFIED INCOMPLETE 2026-08-03 — 5.5 of 6 design principles shipped. Do not archive.** Checked during the merged-backlog sweep; recorded so the next reader does not re-derive it.

- **Built** — push-not-pull (`lib/notify/deliver.ts`, `app/api/cron/notify/route.ts`), severity tiering (`lib/notify/constants.ts:2`), push-debounce (`constants.ts:11`, 1h), coalescing (`constants.ts:15-16`), quiet success (`digest.ts:228` `no_send`). Provider decision settled on Resend (`lib/notify/send.ts:1`); the memo was ratified via `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-12-m12.13-unpublish-delivery-design.md`.
- **REMAINS** — principle 6, two-way feedback, is half-built. Action-token one-click undo landed (`lib/notify/templates/autoPublishUndo.ts:58`), but the memo's PRIMARY mechanism — a "Report a problem" link in EVERY push email routing to `/api/report` (memo §120) — is absent from all four templates in `lib/notify/templates/` (grep for `report` returns zero hits there).
- **UNVERIFIED** — promotion prerequisite (b), "Doug-workflow observation from a live v1 deployment"; no artifact found either way.

**Origin:** DEFERRED entry M6-D1 (Push notification surface, operator-facing). Filed 2026-05-09 following ratification of plan amendments 7 + 8 on the FXAV crew-pages plan. Design memo lives at `2026-04-30-fxav-crew-pages-v1/notification-design-memo.md`; Doug-validation questions consolidated at `2026-04-30-fxav-crew-pages-v1/doug-validation-questions.md` (§4 channels/timing, §5 feedback/communication).

**Effort:** L

**Scope:** The v1 spec currently has zero push surface. Every staging event (FIRST_SEEN_REVIEW, MI-6..MI-14, MI-1..MI-5b hard fails on existing shows) is functionally invisible to Doug until he visits the dashboard. The MI staging system is calibrated for an operator who isn't watching for it. A push surface — email primary; SMS/webhook optional — would close the loop.

Design memo captures six load-bearing principles: push-not-pull, severity tiering, push-debounce, coalescing, quiet success, two-way feedback. Concrete sketch includes schema additions, route shapes, integration with the existing M8 report pipeline, and action-token signing for one-click acknowledgements.

**Why backlog, not deferred:** Three independent prerequisites: (a) the design memo needs ratification via spec amendment + brainstorming; (b) Doug-validation questions need real answers from Doug's first-show workflow; (c) email-provider integration (Resend / Postmark / SES) requires a vendor decision + account setup + secrets management. Spec amendment + dedicated milestone plan, not a sub-milestone task. The notification-design-memo notes that MI-8/MI-8b modtime-stability debounce (ratified in plan amendment 7) becomes redundant once push-debounce lands — both achieve the same anti-spam UX outcome from different layers, so push-debounce might retire MI-8/MI-8b infrastructure.

**Promotion prerequisite:** Doug-workflow observation from a live v1 deployment (need real data on which staging events Doug actually misses) + email-provider integration decision + spec amendment formalizing the notification design memo.

### BL-X5-ROLE-TOKEN-DECIDED-BY-BOUNDARY — `role_token_mappings.decided_by` is a live email boundary absent from the AC-X.5 manifest

**Filed:** 2026-08-03, during the DB-lockdown-trio cluster (`docs/superpowers/specs/db/2026-08-02-db-lockdown-trio-design.md` §5.3). **Class:** X.5 coverage completeness. **Effort:** S.

`role_token_mappings.decided_by` stores a canonical admin email and carries a DB CHECK (`role_token_mappings_decided_by_canonical`, `supabase/migrations/20260716000000_role_token_mappings.sql:8`). Both write paths canonicalize correctly today — `app/admin/show/[slug]/_actions/roleToken.ts:57` and `app/admin/settings/_actions/roleTokenMappings.ts:38` both call `canonicalize(email)` before the write.

**The gap is coverage, not behavior.** The boundary is absent from `lib/audit/email-boundaries.generated.ts`, which derives from master spec AC-X.5 prose (`scripts/extract-email-boundaries.ts:87`). So deleting either `canonicalize()` call would NOT fail the `x5-email-canonicalization` gate — only the DB CHECK would catch it, and only at write time.

**Why not fixed in the lockdown cluster:** registering the boundary requires a master spec §17.2 AC-X.5 amendment, which has lockstep consequences for `pnpm gen:email-boundaries`, the `x5-email-canonicalization` gate, and traceability. That is its own review cycle, not a rider on a lockdown cluster. The cluster pins the CHECK's existence via the new `CATALOG_CANONICAL_CHECKS` registry, so the constraint cannot be dropped silently.

**Scope of a fix:** amend master spec §17.2 AC-X.5 to name `role_token_mappings.decided_by`; regenerate; confirm the x5 gate covers both write paths. Two sibling constraints (`admin_emails.email`, `ignored_warnings.ignored_by`) are pinned elsewhere (`tests/db/admin-emails.test.ts:135`, `tests/db/ignored-warnings-schema.test.ts:39`) and may warrant the same treatment in the same amendment.

**Promotion prerequisite:** any milestone already amending master spec §17.2, OR a decision that unpoliced canonicalization on this boundary is a real risk.

**Status:** OPEN.

### BL-PRIVATE-IMAGE-PIPELINE — Migrate diagrams gallery to `next/image` with auth-preserving pipeline

**Origin:** DEFERRED entry M7-D3 (Diagrams gallery `<img>` → `next/image`). Re-deferred at M9 C6b 2026-05-13 after an in-cluster attempt failed P0 (auth cookies don't forward through `/_next/image`; private Cache-Control rewritten to public, breaking revocation propagation).

**Scope:** Migrate `components/diagrams/Gallery.tsx` and `components/diagrams/GalleryLightbox.tsx` from `<img>` to `next/image` to gain LCP optimization on the mobile crew page. Currently they use `<img loading="lazy" decoding="async">` as the manual equivalent — works correctly but doesn't get Next's `/_next/image` optimizer benefits.

Asset URLs are proxied through `/api/asset/diagram/...` which returns auth-checked bytes with `private, max-age=0, must-revalidate`. The `next/image` optimizer would either need to bypass the auth proxy OR add a second redirect layer — neither is straightforward.

**Why backlog, not deferred:** The in-cluster M9 attempt failed P0 because the obvious paths (declare proxy origin as `next.config.ts` remote pattern; let `/_next/image` proxy through it) break the auth + cache contract. The right fix requires a private-image-pipeline design — custom loader + transform service, OR signed-URL CDN, OR architectural decision to accept the LCP cost of un-optimized images. Each path is a multi-day brainstorming session.

**Promotion prerequisite:** Private-image-pipeline brainstorming (custom loader vs signed-URL CDN vs accept-the-cost). May fold into a broader "v1.5 perf-and-polish" milestone rather than standalone.

### BL-ADMIN-DASHBOARD-ROW-ACTIONS — ActiveShowsPanel row-action shortcuts

**Origin:** M11-E-D3 (MEDIUM) filed 2026-05-20. M11 user-facing-docs `/help/admin/dashboard` documents per-row actions `Open`, `Preview as`, `Re-sync`, `Archive` on the Active Shows panel per master spec §9.1. Shipped `components/admin/ActiveShowsPanel.tsx` renders show title + crew count + sync-status only; no row-level action affordances.

**Effort:** M

**Scope:** Add the four documented row actions to `ActiveShowsPanel.tsx`:

- `Open` — link to `/admin/show/[slug]`. Already navigable via the show-title link; this would expose it as an explicit action with consistent affordance treatment.
- `Preview as` — link to `/admin/show/[slug]/preview/[crewId]` (M10 Phase 3 §B preview-as flow). Already routable; this exposes it as a row action.
- `Re-sync` — POST to the manual-sync route. Functional equivalent exists at `/admin/show/[slug]` via `<ReSyncButton>`; this is a dashboard-level shortcut.
- `Archive` — likely needs a new SECURITY DEFINER RPC for soft-delete (`shows.archived_at`). Spec §9.1 mentions archiving but the column doesn't exist yet; promotion may require a small schema migration.

**Why backlog, not deferred:** None of the four shortcuts close a functional ops gap — Doug can already accomplish all four actions by drilling into the per-show page (`Re-sync` directly; the others by navigation). This is pure surfacing/convenience. `Archive` is the only one with a schema implication; the others are pure UI work.

**Promotion prerequisite:** Either (a) FXAV operator feedback surfaces dashboard-level friction (Doug actively wants to triage multiple shows from the dashboard without drilling in), OR (b) a v1.x admin-UX polish milestone. `Archive` may need a separate spec amendment if `shows.archived_at` semantics need definition (idempotency, side effects on `crew_member_auth`, etc.).

### BL-ADMIN-PER-SHOW-HISTORY — Sync-health-history + parse-warnings-history sections on per-show panel

**Origin:** M11-E-D4 (MEDIUM) filed 2026-05-20. M11 `/help/admin/per-show-panel` documents per-spec §9.2 a "sync health" section (last 5 sync attempts) and a dedicated parse-warnings history section. Shipped `app/admin/show/[slug]/page.tsx` renders `PerShowAlertSection` + `ReSyncButton` + `ParsePanel` + `HelpTooltip` only; no historical-aggregate views.

**Scope:** Add two new sections to `app/admin/show/[slug]/page.tsx`:

- **Sync health (last 5)** — render the most recent 5 sync attempts for the show with timestamp + outcome (success / partial / hard-fail) + (if failed) the canonical error code. Data source TBD: most likely a new `sync_history` table OR a derived view over existing `pending_syncs` + `shows.last_seen_modified_time` change events. Either path requires schema work.
- **Parse warnings (history)** — distinct from the live `ParsePanel` view (which shows currently-blocked-on-warnings pending_syncs rows), this would show the historical aggregate of parse warnings emitted by previous sync attempts. Data source: extend `shows_internal.parse_warnings` to be append-only history OR query `pending_syncs` history.

Both surfaces need a schema decision (new table vs derived view vs append-only column) before implementation.

**Why backlog, not deferred:** No v1 ops gap. Doug has `admin_alerts` for high-signal failure notification (active and surfaced above the page chrome); historical-aggregate diagnostics are observability polish, not ops requirement. Both sections need schema/data-model work that's outside small mechanical fix scope.

**Promotion prerequisite:** Either (a) FXAV operator feedback surfaces "I can't tell if sync has been silently failing" pattern (real observability gap), OR (b) a v1.x admin-UX or admin-observability milestone bundles this with BL-OPS-LOG. The data-model question (new table vs derived view vs append-only column) needs a brainstorming session.

### BL-HELP-NON-SHOW-REPORT-SURFACE — Non-show-scoped recurrence-report surface for `/help/errors`

**Origin:** M11-I-D-1 (MEDIUM) filed 2026-05-22 during Phase I Codex R1 adversarial review.

**Effort:** L

**Symptom:** AC-11.11 (M11 spec line 695) says the `/help/errors` trailing CTA points to "the bug-report flow (per §4.3)". Master-spec §13.1 defines four bug-report surfaces, all show-scoped. There is no surface defined for a non-show-scoped recurrence report — "I keep seeing code X across my show portfolio."

**Scope of a real fix (if/when promoted):**

- **Surface design.** A 5th non-show-scoped report surface. Most likely a `<ReportRecurrenceButton>` per `/help/errors` catalog entry, opening a modal that captures `{code, free-text, optional contact}`. Possibly an admin triage view that aggregates recurrence reports by code.
- **API + storage.** Either extend `/api/report` to accept `showId: null` + a `recurrenceCode: string`, OR add `/api/report-recurrence` as a sibling endpoint. New `report_recurrences` table OR extend `reports` schema. Decision needed.
- **M8 contract impact.** ReportButton's existing show-scoped contract is hardened (~30 rounds of adversarial review). Extending requires a careful pass — the existing four surfaces must continue working unchanged.
- **Admin triage UX.** If recurrences are useful signal, Doug or Eric want a view that aggregates them. Adds an admin dashboard surface.
- **Catalog wiring.** §12.4 catalog rows would gain optional fields linking each code to its recurrence-report history.

Speculative scope: 1-2 weeks of milestone-shape work (design pass + impl + tests + adversarial review).

**Why backlog, not deferred:** No concrete trigger yet. v1 ships with `mailto:` (M11-I-D-1 in the M11 plan tree's DEFERRED.md) — that path works, just lacks idempotency / catalog labeling / GitHub routing of the four §13.1 surfaces. Whether Doug actually NEEDS a richer non-show-scoped flow is unknown until operators use the docs. Master-spec §13.1 was hardened without anyone identifying this surface as needed; not yet clear it's a real product gap rather than a spec-AC oversight.

**Promotion prerequisite:** EITHER (a) FXAV operator feedback flags the mailto-vs-modal divergence as real friction ("I want to report this without opening my mail client"), OR (b) a future milestone introduces a non-show-scoped report surface for any other reason (e.g., crew-side feedback that isn't per-show), and `/help/errors` adopts it as a sibling, OR (c) master-spec §13.1 gets revisited to add a fifth surface (which would itself need to ratify the AC-11.11 contract).

**Promotion mechanics:** Promote with companion M11-I-D-1 deferral re-open: amend AC-11.11 spec line to point at the new surface, swap `app/help/errors/page.tsx:45-49` mailto for the new component, run cross-CLI adversarial review on the §13.1 contract extension.

---

### BL-PICKER-LOCK-ICON-LUCIDIFY — replace U+1F512 emoji with lucide-react Lock in PickerInterstitial

**Filed:** 2026-05-24 from M11.5 §B impeccable v3 attestation (Unit 1 — picker chain audit P2).

**Effort:** S

**Description:** `_PickerInterstitial.tsx:171` renders the claimed-row lock indicator as the U+1F512 emoji (🔒). The inline comment explicitly justifies the choice as a 16px glyph matching the type rhythm. Audit flagged cross-platform inconsistency: iOS Safari renders Apple Color Emoji, Android Chrome renders Noto, desktop varies. Crew on Android may see a heavier glyph than design intends.

**Why backlog, not deferred:** DESIGN.md §8 ratifies lucide-react for icons, so the structural answer is `<Lock size={16} aria-hidden="true" />` with `aria-label` migrating to the parent span. But the inline rationale is defensible — the lock is the only visual cue paired with the `data-claimed="true"` row treatment, not load-bearing. Picking this up requires a visual regression screenshot pass across iOS Safari + Android Chrome + desktop to confirm the lucide swap is an improvement, not a regression. Speculative until cross-platform screenshots ship.

**Promotion prerequisite:** EITHER (a) cross-platform visual regression suite lands and shows the emoji glyph as a real friction point, OR (b) M11 screenshots set is extended to include the picker page and a lucide swap is part of a broader claimed-row treatment iteration.

**Promotion mechanics:** Trivial swap once accepted: `<Lock size={16} aria-hidden="true" />` + thread the existing `aria-label="IDENTITY_DEACTIVATED_LOCK_HINT" lookup` to the parent `<span>`.

---

### BL-IDENTITYCHIP-SUB390-COLLISION — IdentityChip + page title collision audit at 320px

**Filed:** 2026-05-24 from M11.5 §B impeccable v3 attestation (Unit 3 — post-pick header chrome critique P3).

**Effort:** S

**Description:** Header.tsx places the IdentityChip as the right-slot when present. The title column gets `min-w-0 flex-1`; the chip column gets `shrink-0 self-start`. At 320px viewport (sub-target), the title + chip could collide depending on title length + chip's name+role string length.

**Why backlog, not deferred:** 390px is the documented mobile primary target (PRODUCT.md "Indoor corporate event environments ... Devices are personal phones (Safari/Chrome, ~390px)"). 320px is out of spec. Crew on a 320px phone would see fold-down behavior or text truncation — annoying but not broken.

**Promotion prerequisite:** EITHER (a) Doug or a crew lead reports a 320px collision in the wild, OR (b) the project's mobile primary target widens to include sub-390px viewports.

**Promotion mechanics:** Likely solution is to allow the right slot to wrap below the title at narrow widths (`flex-col sm:flex-row` on the parent). Test pin via Playwright `setViewportSize({ width: 320 })` boundingbox assertion.

---

### BL-IDENTITYCHIP-SR-SEPARATOR — `<name> · <role>` separator SR experience polish

**Filed:** 2026-05-24 from M11.5 §B impeccable v3 attestation (Unit 3 — post-pick header chrome audit P3).

**Effort:** S

**Description:** IdentityChip renders `<name>` + `·` separator + `<role>` as flat siblings inside a single span. The `·` is `aria-hidden="true"` so SRs don't announce the punctuation, but they read "Eric Weiss Lead A2" as a flat phrase rather than "Eric Weiss, Lead A2" (proper pause). A `aria-label="Eric Weiss, Lead A2"` on the parent span (or wrapping in a comma-separated visually-hidden duplicate) would tighten the experience.

**Why backlog, not deferred:** The current SR behavior is acceptable per WCAG (no ambiguous content, no missing context). The polish is genuinely speculative — depends on whether SR users complain about the run-on phrasing.

**Promotion prerequisite:** EITHER (a) an a11y audit pass picks it up as part of a broader SR-experience review, OR (b) a crew member reports the issue.

**Promotion mechanics:** Add `aria-label={`${name}, ${role}`}` to the parent `<span>` and visually-hide the middle dot separator. ~3-line edit.

---

### BL-TERMINAL-FAILURE-ICON — visual failure cue beyond muted gray

**Filed:** 2026-05-24 from M11.5 §B impeccable v3 attestation (Unit 2 — TerminalFailure critique LOW).

**Effort:** S

**Description:** `<TerminalFailure>` uses the muted text-text-strong / text-text-subtle palette and renders as a centered max-w-md block. DESIGN.md §1 correctly bans red/green as primary semantic colors, but the surface has no iconography or shape signal that this IS a failure render. A neutral icon (e.g., lucide-react `AlertCircle` or `CloudOff`) above the h1 would improve glance-ability without violating the color-blind floor.

**Why backlog, not deferred:** The surface is rare in production — only renders on infra-error paths. Crew will encounter it at most a few times per quarter. Adding an icon is a glanceability nicety, not a recovery affordance gap (the new retryHref already closes that).

**Promotion prerequisite:** EITHER (a) a polish pass picks it up as part of a broader auth-surface visual update, OR (b) production telemetry shows TerminalFailure is rendering often enough that glanceability becomes load-bearing.

**Promotion mechanics:** Add an icon (lucide-react `AlertCircle`) above the h1, sized at `--icon-lg` (32px), in `text-text-subtle`. ~5-line edit.

### BL-RATE-LIMIT-SNAPSHOT-DURABILITY — DB-backed snapshot store for rate-limit fixture seed/restore

**Filed:** 2026-05-28 from M12 Phase 0.E close-out §6 finding 3 (R9 durability residual).

**Description:** The `validation:report-fixtures` rate-limit-admin / rate-limit-crew outcomes persist their pre-seed `(prior_count, recorded_hour_bucket, identity)` snapshot to a file-backed store at `.validation-state/rate-limit-{admin,crew}-snapshot.json` (gitignored) so cleanup can restore the exact pre-seed bucket state. A crash in the narrow window **between the rate-limit seed-commit (DB write) and the snapshot-file rewrite** leaves the snapshot stale — cleanup would then restore the wrong count (or the refuse-existing-snapshot guard blocks re-seed until manual file removal). The R-series ratified this as a **zero-impact bound** under the file-backed-only strategy: the window is sub-second, the blast radius is one validation-Supabase rate-limit bucket, and the R43 F39 refuse-existing-snapshot guard + `--force-overwrite-snapshot` escape hatch + unlink-on-cleanup semantics bound the failure to "operator re-runs cleanup with the force flag." No production data is ever at risk (validation Supabase only).

**Why backlog, not deferred:** Fully closing the crash-window requires authorizing a **DB-side snapshot table** so the snapshot write shares the same transaction as the seed-commit (atomic seed+snapshot). That's a **scope expansion beyond M12**: `validation_state` cannot be the backend (its `CHECK (key = 'validation_seed')` singleton constraint rejects any other key, and the table is RLS-locked + REVOKE-locked per R17), so closing this means a new migration adding a dedicated snapshot table + its RLS/REVOKE posture + RPC-gating registry row (per the postgrest-dml-lockdown class-wide invariant) + the harness rewrite to write snapshot-in-transaction. None of that is scoped or planned. The file-backed strategy is the ratified M12 design; this entry exists only so the idea isn't lost if rate-limit fixtures ever prove flaky in practice.

**Promotion prerequisite:** EITHER (a) observed real flakiness from the crash-window during Phase 1 walks or future validation runs, OR (b) a broader validation-tooling-durability milestone that justifies the new snapshot table + its full lockdown posture. Absent either, the file-backed bound stands.

---

### BL-TWO-WAY-SHEET-SYNC — Write corrections back to the source Google Sheet

**Filed:** 2026-06-08, during the "sync changes feed + identity-only gate" brainstorming (`docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-08-sync-changes-feed-identity-gate-design.md`). Surfaced when evaluating whether **undo** could write the old value back to the sheet to keep app and sheet consistent (instead of the chosen "revert + per-entity hold" approach).

**Effort:** L

**Description:** Today the app is strictly one-directional — Doug's Google Sheet is the source of truth, the app reflects it. A two-way-sync feature would let an admin correction made in the app (e.g. an undo, or a future inline edit) write back into the source sheet, so the sheet and the live pages stay consistent without the app having to "hold/override" the sheet's value across syncs. It would obviate the per-entity `sync_holds` override mechanism for the undo path (the conflict simply wouldn't exist if the sheet were corrected too).

**Why backlog, not deferred — three hard walls (all verified 2026-06-08):**

- **Read-only OAuth scopes.** The app uses `auth/drive.readonly` + `auth/spreadsheets.readonly` (`lib/drive/client.ts`). Write-back needs `auth/spreadsheets` (write) + re-consent + **edit** access to Doug's sheets — a real permission/security/trust escalation.
- **No source-cell provenance.** The parser abstracts the messy human sheet into structured `parse_result` and discards cell/row/range coordinates (`lib/parser/types.ts` `CrewMemberRow` etc. carry no provenance). Writing "Bob" back to "the name cell" requires a reverse field→cell mapping the parser doesn't retain — a significant parser change, brittle against merged cells/formulas/free-form layout.
- **Inverts the product model + new hazards.** "App edits Doug's source data" flips the one-directional trust model and introduces formatting-clobber risk, concurrent-edit races with Doug, and a modified-time feedback loop (app writes → sheet mtime advances → sync re-triggers; needs app-origin-write guards).

**Promotion prerequisite:** Doug (or the operator) explicitly wants genuine two-way sync (e.g. "fixing it in the app should fix my sheet"). It's its own project — scope expansion (write scope + consent), a parser change to retain cell provenance, conflict/feedback-loop handling, and a trust/relationship decision about the app editing source-of-truth sheets. The chosen v1 reconciliation (human fixes the sheet; the app holds the overridden item steady until then) keeps the app in its read-only lane; this entry exists only so the idea isn't lost.

---

### BL-NON-CREW-UNDO — Undo for non-crew feed rows (section shrinkage / field degradation / asset drift)

**Filed:** 2026-06-10 from the shipped "sync changes feed + identity-only gate" milestone (PR #19, `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-08-sync-changes-feed-identity-gate-design.md` §1 non-goals / §7 / finding F6).

**Description:** v1 undo covers **crew-identity** changes only (`crew_added` / `crew_removed` / `crew_renamed`). Non-crew auto-applied changes — MI-7 section shrinkage, MI-8/8b/8c field degradation, asset drift (DIAGRAMS\_\*/REEL_DRIFT) — render as **notification-only** feed rows (`action='none'`, null `before_image`, "edit the sheet to change this" pointer). This entry would extend per-item undo to those rows.

**Why backlog, not deferred — F6 showed it's "not cheap" + no committed trigger:** the undo restore path needs the **pre-apply state** in `before_image`, but the Phase-2 snapshot (`applyShowSnapshot` → `previousCrewMembers`, `lib/sync/runScheduledCronSync.ts:913-932,1088-1100`) captures **prior crew rows ONLY**. It does NOT snapshot prior hotel/room/contact rows, show fields, diagrams, or reel state. Backing non-crew undo requires **widening that prior-state capture** per domain (a real Phase-2 change), plus a domain-specific restore in `undo_change` and the feed's undoable predicate. The approved scope call (#9) was "crew-identity undo first, non-crew only if cheap"; F6 determined non-crew is not cheap.

**Technical home + promotion prerequisite:** widen `applyShowSnapshot`/`before_image` to capture the relevant prior non-crew rows → add the domain to `undo_change`'s direction handling + the feed's `isCrewDomainChangeKind`-style predicate (it currently single-sources `{crew_added,crew_removed,crew_renamed}`). Promote when an operator explicitly wants to undo a non-crew change in-app (rather than re-editing the sheet), and the capture-widening cost is judged worth it.

---

### BL-SYNC-FEED-UI-POLISH — impeccable v3 LOW/no-harm follow-ups (changes-feed UI)

**Filed:** 2026-06-10 from the Phase-6 impeccable v3 dual-gate (gate PASSED; zero HIGH after the Approve-button accent fix; these are LOW / no-user-harm, no concrete trigger — same shape as the `BACKLOG-B2UI-*` batch below (`:1303-1305`): one parent entry, the individual findings as sub-bullets under it). Citation corrected 2026-08-02: this line gave that family a `BL-` prefix, which resolves to nothing — the real ids carry the `BACKLOG-` prefix. A one-word prefix typo, not a vanished family; the analogy it draws was always sound. The wrong spelling is described rather than written out, since re-typing it would re-create the dangling reference.

- **BL-SYNCFEED-UI-1** — `UndoChangeButton`: post-submit success relies on page revalidation flipping the row to `undone`; consider an `aria-live` region announcing undo success (the failure path already surfaces via `ErrorExplainer`).
- **BL-SYNCFEED-UI-2** — `ChangeFeedBadge`: `title` tooltips are hover-only (desktop); acceptable since the visible text label already carries meaning (color-blind floor met) — only act if touch-discoverability is raised.
- **BL-SYNCFEED-UI-3** — `Disposition` test fixtures pass `{disposition:'removal', name:…}` where the canonical union has no `name` on `removal` (off-type but harmless at runtime; `dispositionName` returns null for removal). Tighten the fixtures if/when the `Disposition` type is hardened.

### BL-EM-DASH-POLICY — Resolve the DESIGN.md §9 em-dash ban vs. shipped usage

**Filed:** 2026-06-13 from the Doug/crew copy audit. Owner decision (2026-06-13): **defer for future consideration after a full review** — do NOT sweep now.

**The conflict:** `DESIGN.md` §9 (and the global `~/.claude/CLAUDE.md` Copy rule) state "No em dashes. Use commas, colons, semicolons, periods, parentheses. Also not `--`." But shipped copy uses em dashes widely and the rule has never been enforced:

- **§12.4 catalog** (`lib/messages/catalog.ts` + the spec §12.4 prose): dozens of `dougFacing`/`crewFacing`/`helpfulContext`/`longExplanation` rows contain `—` (e.g. `SYNC_DELAYED_SEVERE` "Push or cron is stalled — check the dashboard.").
- **Help MDX** (`app/help/**`): 25+ instances across multiple pages.
- **Components**: test-pinned strings include em dashes, e.g. `"Held — not published"` (pinned in `tests/components/admin/ShowsTable.test.tsx`, `tests/app/admin/perShowPage.test.tsx`) and the archive-confirm copy `"Confirm archive — crew links stop working now…"` (pinned in `tests/components/admin/ArchiveShowButton.test.tsx`).

**Two coherent resolutions (pick one during the full review):**

1. **Ratify reality (recommended).** Amend DESIGN.md §9 to permit em dashes in prose copy (optionally keep the ban for headings/eyebrow labels, or drop it entirely). One-line doc change, zero code/test churn. The ban appears inherited from the impeccable skill's defaults rather than chosen for this product; the shipped copy reads well.
2. **Enforce the ban.** A repo-wide sweep replacing every `—` with commas/periods/parentheses. This touches the §12.4 three-way lockstep across dozens of rows (spec prose + `gen:spec-codes` regen + `catalog.ts`), multiple test pins, help MDX, and possibly screenshot baselines if any captured surface renders a dash. Multi-hour, high-churn, and it relitigates copy that passed many M12 adversarial rounds.

**Why backlog, not deferred:** no spec, no plan, no scheduled milestone, no concrete trigger beyond "if/when the owner runs the full copy-voice review." If resolution (2) is ever chosen it should be its own scoped task (lockstep + test-pin updates + a structural guard, e.g. a meta-test banning `—` in `lib/messages/catalog.ts` and `app/help/**`), authored after the §9 decision is made.

**Promotion prerequisite:** owner decision on resolution (1) vs (2). (1) is a trivial DESIGN.md edit, not really a milestone; (2) needs a scoped task with the lockstep + meta-test.

---

### BL-CANONICAL-CLASS-ARRAY-BLINDSPOT — eslint canonical-class rule does not scan `[...].join(" ")` array classNames

**Filed:** 2026-06-21 from the `chore/lint-format-ci-gates` adversarial review (hygiene lens).

**Effort:** S

**Description:** `better-tailwindcss/enforce-canonical-classes` (`eslint.config.mjs`) canonicalizes Tailwind classes in plain-string classNames and `clsx`/`cn`/`cva` callees, but NOT in array-join patterns (`className={["a", cond ? "b" : "c"].join(" ")}`), which this codebase uses (e.g. `components/crew/primitives/DayCard.tsx`). Root cause (confirmed against the plugin source): the String matcher in `eslint-plugin-better-tailwindcss/lib/parsers/es.js` returns an `UNCROSSABLE_BOUNDARY` at any `CallExpression`, so `.join()` blocks traversal into the array; no plugin setting overrides this. Result: rem→unit / `@theme`-token / class-rename canonical violations inside those arrays escape the eslint gate (and thus CI's `pnpm lint`). Separately, the gate is Tailwind-signature-based and does **not** do px→spacing-unit conversion in ANY context — that suggestion is editor-only (`tailwindCSS.lint.suggestCanonicalClasses`) and out of scope here.

**Why backlog, not deferred:** the gate still catches the same violations in direct string literals and `clsx`/`cn`/`cva` calls; array-join is a documented plugin limitation, not a correctness bug. No concrete trigger.

**Promotion prerequisite / mechanics:** the actionable fix is a refactor, not config — migrate `[...].join(" ")` classNames to `cn(...)` (already a default-detected callee), after which a single `eslint --fix` mechanically canonicalizes them. Promote if/when canonical violations inside array classNames become a real maintenance problem, or as part of a broader className-helper standardization pass.

---

### BL-ACCENT-BUTTON-ATOM-SWEEP — Migrate remaining raw accent-button compositions to the shared `<AccentButton>` atom

**Filed:** 2026-06-21, during M5-D7 (extract shared `components/shared/AccentButton.tsx`).

**Effort:** L

**Description:** M5-D7 extracted the canonical accent-fill button chrome (`bg-accent` + `text-accent-text` + `hover:bg-accent-hover` + focus-ring + disabled treatment) into one atom and migrated the **8 admin call sites** the deferral named (ResolveAlertButton ×2, PendingPanelRetryButton, ReSyncButton, PublishShowButton, RunFinalCASButton, ResumeFinalizeButton, FinalizeButton, StagedReviewCard). **Census note (2026-08-03):** four of those eight call sites have since been deleted — PublishShowButton at `32fec4fac` (with `/admin/unpublished`), ResumeFinalizeButton at the Step-3 consolidation, and ResolveAlertButton and RunFinalCASButton as zero-production-importer components — and `ReSyncButton` was separately DE-MIGRATED to a ghost trigger by the modal-header reconciliation (§6.7), so the executable `MIGRATED_FILES` census in `tests/styles/accent-button-atom.test.ts` is now three: `PendingPanelRetryButton`, `FinalizeButton`, `StagedReviewCard`. That scan walks the migrated files, not the repo; repo-wide `bg-accent` coverage belongs to `tests/styles/_metaBgAccentInventory.test.ts`. A repo-wide grep at migration time found the pattern still hand-rolled in **~17 other sites** OUT OF M5-D7 SCOPE: `app/admin/error.tsx`, `app/admin/settings/error.tsx`, `app/admin/settings/admins/{error.tsx,AddAdminForm.tsx,RevokeRowButton.tsx ×3}`, `app/admin/show/[slug]/{ShareLinkCopyButton.tsx,ResetPickerEpochButton.tsx,RotateShareTokenButton.tsx ×2}`, `app/show/[slug]/unpublish/ConfirmUnpublishForm.tsx`, `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx ×2`, `components/admin/Mi11GateActions.tsx`, `components/admin/wizard/{Step1Share,Step2Verify ×2,Step3Review}.tsx`, `components/admin/settings/AddAdminDisclosure.tsx`, `components/shared/{ReportButton.tsx,ReportModal.tsx ×4}`. (Pill-badge `bg-accent text-accent-text` spans in AdminNav/NotifBell and the active-step indicators in OnboardingWizard/Step3Review/me/page are NOT buttons — they are a different, legitimate use of the token pair and out of scope for this atom.)

**Why backlog, not deferred:** The 4th-variant YAGNI gate justified the atom; migrating the long tail is mechanical but unbounded and touches crew-page + unpublish surfaces (UI gate work — Opus only). No correctness bug; the anti-drift meta-test at `tests/styles/accent-button-atom.test.ts` only pins the 8 MIGRATED files, so the untouched sites are not regressions, just un-DRYed. No concrete trigger.

**Promotion prerequisite / mechanics:** For each site, swap `<button className="…bg-accent…">` for `<AccentButton …variant props…>` (matching size/fontWeight/ringOffset/inline/selfStart/shadow/minWidthTap to the existing classes), preserving every `data-testid` and pending/useFormStatus wiring, then ADD the file to `MIGRATED_FILES` in `tests/styles/accent-button-atom.test.ts` (the documented extension point) so it's pinned against future re-drift. Note several of these (Share/Rotate/AddAdmin/wizard) use a `selected ? accentClass : otherClass` ternary or `cn(...)`/array-join className — those need the atom's `className` escape hatch or a small refactor, not a pure prop swap. Promote when a className-helper standardization pass or a UI-consistency milestone makes the long tail worth closing in one batch.

---

### BL-CREW-SHEET-TEMPLATE-V2 — Standardized downloadable show-spec template to capture redesign-required fields

**Filed:** 2026-06-15, during the crew-show-page redesign audit (Claude Design handoff bundle `fxav-crew-pages`; design source at `/tmp/design_extract/...` ephemeral, intent recorded in milestone memory). Owner is considering a **downloadable, standardized sheet template** Doug (and future operators) would fill in, so the richer crew-page surfaces have a reliable source instead of depending on organic per-show sheet conventions.

**Context — why this exists:** The redesign assumes a data-rich show page (live run-of-show timeline, call/doors stat strip, full travel itinerary, structured venue/wifi). An audit of **all 7 distinct real sheets** in the `fxav-test-shows` Drive folder (FinTech CTO Summit, Consultants Roundtable, + the 5 other `II -` shows; the `VB##`/`DRILL` sheets are same-size test copies of Consultants Roundtable) showed the organic sheets **do not reliably carry** much of what the design wants. The chosen v1 reconciliation is **Blend**: build on reliably-present data, render honest empty states for the variable fields, drop the truly-absent mock stats. This BACKLOG entry captures the fields a v2 standardized template could promote from "absent / unreliable" to "reliably present," making the full-fidelity design viable.

**Scope — candidate fields for the v2 template (each tagged with its current source reality, verified across the 7 real sheets):**

- **Crew CALL TIME** (labeled) — GENUINELY ABSENT in every sheet today; only Load-in/Set times exist. A template field would make the design's "call" stat real instead of a Load-in remap.
- **DOORS time** (labeled) — GENUINELY ABSENT; only "Registration" prose appears. Template field needed for the doors stat.
- **Hotel room-type** — ABSENT everywhere.
- **Hotel check-in / check-out TIME-of-day** — ABSENT everywhere (only calendar DATES are ever present).
- **Reliably-FILLED AGENDA tab (run-of-show titles/rooms)** — **CORRECTION (2026-06-18, live gsheets-MCP verification):** the earlier "empty in all 7 sheets" claim was WRONG. The AGENDA run-of-show **IS filled in production** for locked shows (verified filled in East Coast + RIA; empty auto-time-skeleton in the not-yet-locked others). **The AGENDA-title PARSER is now SCHEDULED v1 work** — see the Phase-2 spec `specs/v1-pre-deployment-amendments/2026-06-17-crew-page-redesign-phase2-agenda.md` (banner-anchored `parseAgenda` + `shows_internal.run_of_show` + Schedule enrichment). What remains for the **v2 TEMPLATE** is only **standardizing the SOURCE** so the parser has less to fail-soft around: prompt Doug to fill the title cells consistently, a stable banner/column layout, and discrete cells — i.e. making a frequently-but-inconsistently-filled grid uniformly clean. The parser ships in Phase 2; the template just improves source reliability.
- **Per-crew FLIGHT details** (flight #, airport, arrive/depart time) — the AGENDA NAME/ARRIVAL/FLIGHT# columns are blank scaffolding; INFO-level flight data was filled in **exactly 1 of 7** sheets (East Coast SFO). `crew_members.flight_info` is already parsed (`lib/parser/types.ts:71`, `blocks/crew.ts:248`) but usually null and not projected to the crew page. A template field standardizes this.
- **Crew Wi-Fi SSID + password** — reliable in only 2 of 7 (others say "Wifi from Encore" / speed-note only). Already captured as raw free-text under `event_details.internet` (`lib/parser/blocks/event.ts:71`). A template field with discrete SSID/PW cells would make it structured + reliable.
- **Venue street address + loading dock** — present in the older INFO layout, **blank in the newer compact template**. Standardize so it's always filled.
- **Room-within-venue name** — lives in EVENT DETAILS / section headers, not a clean field.
- **Key contacts (client / venue / in-house AV) phone + email** — filled on the older template, blank on the newer compact one; the CONTACTS-tab NUMBER column is always empty. Standardize required contact fields.
- **Parking detail** — present in ~4 of 5; standardize.

**Why backlog, not deferred:** This is a likely-v2 product direction (a downloadable STANDARDIZED TEMPLATE), not committed v1 work. It requires (a) a template-design pass (what the downloadable sheet looks like, how Doug adopts it, migration from organic sheets), (b) a product decision about mandating a template vs tolerating organic sheets, and (c) parser changes to read any **genuinely-new** structured fields the template adds (labeled Call/Doors, hotel room-type/check-in-out time-of-day, discrete Wi-Fi SSID/PW, etc.). **NOTE:** the **AGENDA run-of-show parser is NOT part of this backlog** — it is scheduled v1 work (Phase-2 spec, see the corrected AGENDA bullet above); this entry covers only the TEMPLATE-standardization of the source + the fields that are genuinely absent today. The v1 Blend reconciliation ships without any of it; the design drops/empty-states the genuinely-unreliable fields and parses the AGENDA run-of-show where present. No spec/plan/milestone **for the template** (the AGENDA parser does have one — Phase 2).

**Promotion prerequisite:** EITHER (a) owner decides to formalize the downloadable template as a real v2 feature (template design + adoption plan), OR (b) the v1 redesign ships and operator feedback shows the empty-state surfaces (timeline, wifi, flights, contacts) are a real friction point worth closing at the source. Promotion starts with a brainstorming session on the template shape + the parser contract for any new structured tabs (the AGENDA run-of-show grid contract is already partially mapped in the redesign milestone's deep-read notes).

### BL-CREW-FIELD-ENRICHMENT — Surface already-captured-but-unprojected crew-page fields (flights, Wi-Fi SSID/PW split, room-within-venue)

**Filed:** 2026-06-18, during the crew-page redesign Phase 2 spec adversarial review (R16-MEDIUM). The Phase-1 spec's prose originally lumped several field-enrichments into "Phase 2," but the Phase-2 spec was scoped to **AGENDA run-of-show only**. To single-source the phase boundary (so an implementer can't read Phase-1 as promising Travel-flight work that Phase-2 doesn't deliver), these three field-enrichments are split out here and the Phase-1 references were corrected to point at this item.

**Effort:** M

**Distinction from `BL-CREW-SHEET-TEMPLATE-V2`:** that entry is about a NEW standardized _source_ sheet (making genuinely-absent fields reliably present). THIS entry is about _surfacing fields that the organic sheets already carry_ (and the parser already captures or trivially could) but the projection/UI never exposes — no new source needed, just projection + UI + tests.

**Scope (each upgrades a Phase-1 section/empty-state in place):**

- **Per-crew flight surfacing.** `crew_members.flight_info` is already parsed (`lib/parser/types.ts:71`, `lib/parser/blocks/crew.ts:248`) but is **not** in the `ShowForViewer` projection and renders no UI. Add: the projection field, the Travel-section "flights" block (gated like ground transport — only the assigned crew member / admin sees their own flight PII), and a non-null flight test. Filled in ~1 of 7 organic sheets today, so it ships behind an honest empty state.
- **Wi-Fi SSID/PW structured split.** Phase 1 shows the raw `event_details.internet` string in Venue (raw display IS in scope and ships in v1). This item adds a structured SSID/PW parse so the two render as discrete labeled fields. Reliable in only 2 of 7 organic sheets — fail-soft to the raw string when unsplittable.
- **Room-within-venue name** structured capture (lives in EVENT DETAILS / section headers today, not a clean field).

**Why backlog, not deferred:** no committed v1 trigger; these are honest-empty-state enrichments, not gaps that block launch (Phase 1 + Phase 2 ship complete without them). Each needs a small spec/plan (projection + UI + gating + tests). The flight block in particular needs a trust-boundary decision (per-crew flight PII visibility) mirroring `transportTileVisible`.

**Promotion prerequisite:** owner prioritization OR post-launch operator feedback that a specific field (most likely flights) is a real friction point. Promotion starts with a brainstorming session per field (the flight trust boundary is the load-bearing design question).

### BL-CREW-AGENDA-ADMIN-CLEAR — Admin affordance to manually clear a run-of-show (low-priority convenience)

**Filed:** 2026-06-18, crew-page redesign Phase 2 spec adversarial review (R17 → re-scoped R21 → re-scoped again R22). **Re-scoped at R22 (do NOT treat as load-bearing):** the Phase-2 data-retention rule settled on **CONFIRMED-ONLY** (Phase-2 spec D-2 / §4.4 invariants 2-3 / watchpoint 12) — the crew see a day's run-of-show **iff the latest sync confirmed it**; **every** non-confirmed shape (read-empty, unresolved block, OR unlocatable grid) auto-coarsens to the anchor strip on the next sync with the matching admin warning. So **any** intentional removal — blank titles, deleted tab, broken header, changed template — self-resolves via sync; there is **no** lingering-stale crew exposure to remediate (that was the R17/R21 preserve-and-show stance, which R22 closed structurally).

**Effort:** M

**What's actually left for this item (narrow):** a convenience affordance only — an admin wanting to clear a run-of-show **without** blanking the source sheet (e.g. retract a wrongly-published agenda while leaving the sheet intact). That is a rare workflow; the normal path (blank the sheet → next sync clears) covers intentional removal.

**Scope (if promoted):** an admin affordance on the per-show panel (`app/admin/show/[slug]/`) to clear `shows_internal.run_of_show` (whole-column, or per-day) via a SECURITY DEFINER RPC under the per-show advisory lock (the Phase-2 R16 lockdown REVOKEs anon/authenticated DML on `shows_internal`, so the RPC is the only non-sync write surface).

**Why backlog, not deferred:** no committed v1 trigger; crew-facing stale exposure is **already prevented** by the read-empty auto-clear (R21), so this is purely an admin convenience, not a correctness gap. Lowest priority.

**Promotion prerequisite:** post-launch operator request to retract an agenda without editing the sheet, OR a broader per-show agenda-management pass.

---

### BL-LIBDATA-SUPABASE-CALL-BOUNDARY-METATEST — Structural meta-test for `lib/data` Supabase call-boundary discipline

**Filed:** 2026-06-19, crew-page redesign Phase 2 Task 02.5 (`getShowForViewer.runOfShow` projection).

**Context:** Invariant 9 (Supabase call-boundary discipline) requires every Supabase call site to EITHER carry a structural-meta-test registry row OR an inline `// not-subject-to-meta: <reason>` waiver. The auth-domain meta-test `tests/auth/_metaInfraContract.test.ts` only walks `lib/auth` / `app/auth` / `app/api/auth` / `app/api/show` (orphan scan at `:258-259`), so `lib/data` reads are outside its scan. Task 02.5's new `shows_internal.run_of_show` read in `lib/data/getShowForViewer.ts` discharged invariant 9 via the inline-waiver branch (the verbatim comment immediately above the `.select("run_of_show")` read), backed by behavioral returned-error + thrown-exception fail-soft tests. That is the in-scope discharge; this entry tracks the structural follow-up.

**Scope (if promoted):** an analogous registry-style meta-test (mirroring `_metaInfraContract`'s pattern) that walks `lib/data/**` and asserts every Supabase `.from(...)`/`.rpc(...)` call either (a) destructures `{ data, error }` and distinguishes returned-error from thrown-exception, or (b) carries an inline `// not-subject-to-meta:` waiver. `getShowForViewer.ts` already has multiple such reads (hotel/rooms/transportation/contacts/financials/run_of_show) — the meta-test would pin them all and gate future `lib/data` reads at CI time.

**Why backlog, not deferred:** the inline-waiver discharge is the complete in-scope answer for Phase 2; the structural meta-test is a hardening generalization with no committed v1 trigger. The behavioral fail-soft tests already enforce the boundary per-read; the meta-test would convert that to a class-wide CI guard.

**Promotion prerequisite:** Either (a) a second `lib/data` Supabase read lands without a waiver (real drift), OR (b) a v1.x security-hardening milestone bundles this with the related lockdown / call-boundary entries (`BL-ADMIN-POSTGREST-DML-LOCKDOWN`, `BL-RLS-COVERAGE-CROSSCUTTING`). Extend the `_metaInfraContract` pattern, don't write a parallel scanner.

---

### BL-ADMIN-BADGE-CONTRAST-TOKEN — badge token pair + nav polish batch

**Effort:** M

Filed 2026-06-10 (mobile needs-attention milestone impeccable dispositions). Project-wide badge token pair (accent-bg badges are ~2.3:1 white-on-#FF8C1A at 12px; e.g. #C25E00 bg ≈4.9:1 AA) applied to BOTH `NotifBell` and the attention-tab badge in the same change. Fold in two P3/LOW polish items from the same gate run: summary-card zero-state copy redundancy (`NeedsAttentionSummaryCard` "All caught up" + "Nothing waiting on you." say the same thing) and `app/admin/layout.tsx` serial `fetchUnresolvedAlertCount` → `loadNeedsAttentionCount` awaits (Promise.all saves a round-trip per admin render). Technical home: `app/globals.css` @theme token pair + the two badge components + layout. No trigger; speculative polish.

### BL-ADMIN-NOJS-LOADING-CONFLICT — no-JS contract vs loading.tsx streaming

Filed 2026-06-10 (discovered during mobile needs-attention T5 e2e run; pre-existing since M12.11 `f2f7f7b4`). The `admin-banner.spec.ts` "no-JS native summary" e2e fails on main: with `javaScriptEnabled:false` the admin dashboard never leaves the `app/admin/loading.tsx` skeleton because React streams suspense content into a hidden div swapped by an inline `$RC()` script that needs JS. No CI workflow runs Playwright, so it went unnoticed. Structurally: the no-JS banner contract and instant loading skeletons are incompatible as shipped. Options when picked up: drop the no-JS contract test, gate loading.tsx behind JS detection (not really possible server-side), or accept skeleton-only no-JS rendering and retarget the test. Technical home: `tests/e2e/admin-banner.spec.ts:261` + `app/admin/loading.tsx`.

### BL-PROJECTION-ALERT-VIEWER-INDEPENDENT-PROBE — true viewer-independent financials/lead-only alerting — **filed 2026-06-17 (crew-page redesign Phase 1 spec R44)**

**Effort:** M

The Phase 1 crew-page projection alert (`TILE_PROJECTION_FETCH_FAILED`, §4.13 of `specs/v1-pre-deployment-amendments/2026-06-15-crew-page-redesign-phase1-design.md`) records, per render, the `tileErrors` keys that render observed, and the dedup RPC union-merges across renders. Because `getShowForViewer` skips the `shows_internal` query unless `isLead` (`lib/data/getShowForViewer.ts:473-505`), a **non-lead render cannot observe a `financials` fetch failure** — so a `financials`/lead-only-domain outage with **non-lead-only crew-page traffic** is not alerted until a lead/admin renders. This is the **accepted v1 contract** ("union-by-accumulation"), and it is **not a regression** — today's `financials` alert already comes from the lead-gated `FinancialsTile` fallback. If true per-render viewer-independence is later wanted: add a **status-only admin-observability probe** that records each domain's fetch success/failure on every render **without returning the gated data to non-leads** (e.g. a service-role fetch-status check, or surfacing the failure through the data-sync path), and test it through the real projection path. Out of scope for v1; admins also have the dashboard's independent infra signals (drive-health, sync alerts). Technical home: `lib/data/getShowForViewer.ts` + the §4.13 projection-alert contract.

### BL-CREW-PII-DB-LOCKDOWN — Gate crew PII (flight_info + email + phone) from other show crew at the DB boundary

**Filed:** 2026-06-19, during the crew-page Phase 3 per-crew flight-info spec (`specs/v1-pre-deployment-amendments/2026-06-19-crew-flight-info.md`, decision 2 / R5 adversarial finding). Surfaced when the spec considered treating `crew_members.flight_info` as own-row-only PII.

**Effort:** M

**Description:** `public.crew_members` is **crew-readable**: the `anon, authenticated` SELECT grant (`supabase/migrations/20260501002000_rls_policies.sql:244`) + the `crew_read` RLS policy ON `crew_members` (`:247-258`, `is_admin() or (can_read_show(show_id) and the show is published)`) let any authenticated crew member of a show query **any** crew row's columns for that show via PostgREST — including `name`, `email`, `phone`, AND `flight_info`. This is intentional for the shared roster (crew see each other's contact info), but it means a flight itinerary's **booking confirmation / record-locator codes** (e.g. `HQQ79F`, `OSUULZ`) — enough, with a name, to manage someone else's reservation — are readable by every crew member of the show, not just the owner. The Phase-3 flight UI surfaces only the viewer's OWN flight (a presentation choice), but it does NOT change this pre-existing DB exposure.

**Scope of a real fix (if/when promoted):** decide whether crew PII should be gated from other crew. If yes, harden `flight_info` + `email` + `phone` **together** (hardening only `flight_info` while `email`/`phone` stay open is inconsistent): a column-grant lockdown so `anon`/`authenticated` cannot directly `SELECT` those columns (replace the table-level SELECT grant with column-level grants on the non-sensitive columns), the service-role projection (`getShowForViewer`) continuing to read them, + a PostgREST-boundary regression test proving a crew-authenticated session cannot read another crew member's `flight_info`/`email`/`phone`. This is the read-side analogue of `BL-ADMIN-POSTGREST-DML-LOCKDOWN` (which covers the statement-level/DML half for admin-only tables); a future v1.x security-hardening milestone may bundle both.

**Why backlog, not deferred:** the exposure is pre-existing (the columns were always crew-readable) and consistent with the deliberate roster-sharing model; the FXAV crew of a given show is a small trusted team, not arbitrary internet users; and no concrete trigger exists. Picking it up is genuine security-hardening polish requiring a product decision (is crew-to-crew PII visibility acceptable?) + a spec amendment + the column-grant/meta-test work.

**Promotion prerequisite:** EITHER (a) Doug/operator feedback or a security review decides crew should NOT see each other's flight/contact PII, OR (b) a v1.x security-hardening milestone bundles this with `BL-ADMIN-POSTGREST-DML-LOCKDOWN` + `BL-RLS-COVERAGE-CROSSCUTTING`. The structural meta-test pattern (`tests/db/postgrest-dml-lockdown.test.ts`) is the template for the read-side boundary test.

### BL-FLIGHT-LEG-ORIENTATION — arrival/departure labels + richer flight-leg layout

**Filed:** 2026-06-19 (crew-page Phase 3 per-crew flight info, impeccable v3 dual-gate LOW/MED note). The "Your flight" card renders each `flight_info` leg (split on the TECH-path `" | "`) as an unlabeled text line. The impeccable critique noted there is no arrival/departure orientation cue between the two legs, the confirmation code is buried mid-string, and the raw passthrough is slightly spreadsheet-flavored.

**Effort:** M

**Why backlog, not now:** intentional per the ratified spec decision to render the raw `" | "`-split legs WITHOUT deep-structuring (the split is positional — for a round-trip the first leg is arrival, second is departure, but a one-way leg cannot be disambiguated, and deep-parsing route/airline/time/conf from the space-separated string is fragile/YAGNI). Adding labels/structure is only sound once a structured-leg source exists. The cleanest enabler is `DEF-FLIGHT-1` (the TRAVEL-tab parser), which could normalize into a structured shape; alternatively a TECH-path post-parser that splits arrival vs departure deterministically.

**Promotion prerequisite:** EITHER (a) `DEF-FLIGHT-1` lands a structured flight shape this card can label, OR (b) operator feedback that the unlabeled legs are a real readability friction. Until then the unlabeled raw-leg render is truthful and passes the impeccable gate.

### BL-CREW-UNKNOWN-ASTERISK-TODAY-DATES — Today Tonight/Where date rows for date-restricted viewers

**Filed:** 2026-06-19 (crew mock-fidelity Today Mode-A review, Codex plan R3 HIGH). The Today section's Tonight/Where quick-cards render hotel `check_in`/`check_out` (`TodaySection.tsx:164-165`) + venue dates via `KeyValueRows` for ALL viewers, including `unknown_asterisk` (the date-restricted "we haven't confirmed your days yet" marker). `ScheduleSection` already hides every date for `unknown_asterisk`; Today does not gate the Tonight/Where date-bearing rows. The mock-fidelity pass gated the NEW run-of-show timeline (Mode A renders no timeline for `unknown_asterisk`), but did not change the pre-existing Tonight-card contract.

**Effort:** M

**Why backlog, not now:** changing the Tonight/Where contract is beyond a UI-fidelity pass (it touches the existing Today data contract + its tests) and is a broader product/privacy decision — hotel check-in ≈ travel-in date, so it leaks "when the show runs," but hotel/venue facts may be intentionally viewer-independent. Scoping it into the fidelity pass would silently expand the Today contract.

**Promotion prerequisite:** a dedicated crew-privacy review (groups with `BL-CREW-PII-DB-LOCKDOWN`) deciding whether `unknown_asterisk` suppresses Today's Tonight/Where date rows. Until then the timeline gate holds the line on the NEW surface.

### BL-CI-UNIT-GATE-EXCLUSIONS — gate the two files excluded from the full-suite job

> **UPDATED 2026-07-26 (PR3 of the CI-dark coverage cluster).** This entry described THREE excluded files and repeated the false premise that the local-bootstrap runner cannot provide pg_cron. `scripts/ci/supabase-local-bootstrap.sh` holds the guarded migrations aside for the INITIAL boot only, then applies them with `supabase migration up --include-all`, so that runner has always had them. `pg-cron-coverage` is no longer excluded and now runs in `unit-suite-db`; TWO files remain excluded. The promotion work this entry proposed for pg-cron-coverage is DONE — do not redo it.

**Filed:** 2026-06-22 (alongside the `unit-suite.yml` full-vitest CI gate that closed the "no gate runs `pnpm test`" gap). The new gate runs the whole vitest suite minus two files that need environments the local-bootstrap runner can't provide:

- `tests/cross-cutting/pg-cron-coverage.test.ts` — live-DB introspection of `cron.job` rows. The shared `supabase-local-bootstrap.sh` deliberately HOLDS ASIDE the two GUC-guarded `pg_cron` migrations (`app.fxav_vercel_url`), so no cron jobs exist locally → the test expects 9, gets 0. It is designed for the validation project (`TEST_DATABASE_URL` + `VALIDATION_SUPABASE_PROJECT_REF`), like `validation-schema-parity`.
- `tests/admin/test-auth-gate.test.ts` — the 3 Layer-2 "HTTP positive-path" tests drive a real Supabase `auth.admin.createUser → signInWithPassword` chain that returns 501 without the running instance's matching service-role key + a working GoTrue. They do NOT skip-when-unreachable by design (Codex M3 R2: "opportunistic skip is the wrong default for security tests"), so they fail rather than skip locally.
- `tests/cross-cutting/email-canonicalization.test.ts` — three tests set an EXPLICIT 15s per-test timeout while doc-scanning the large master spec + plan. Under full-suite concurrency on the 2-core CI runner they starve and time out, but pass STANDALONE (isolated resources) in the `x5-email-canonicalization` gate that already covers this file. (Surfaced on the gate's first real-CI run — the local-passes-CI-fails class the gate exists to catch, applied to itself.)

**Why backlog, not now:** both were ALREADY ungated before `unit-suite.yml`, so excluding them is not a regression — the gate's job was to cover the 6800+ tests that had NO gate at all. Wiring the two excluded files needs either a remote-validation job variant (TEST_DATABASE_URL pointed at the validation project, mirroring `validation-schema-parity`/`postgrest-dml-lockdown`) or a live-auth setup that provisions the matching service-role key. The `test-auth-gate` 501 may also indicate the Layer-2 tests have drifted since a route change — investigate before gating (don't freeze a possibly-broken security test green).

**Promotion prerequisite:** a CI pass that adds (a) a remote-validation matrix leg for `pg-cron-coverage` + (b) a live-auth setup (or a root-cause fix) for `test-auth-gate` Layer 2, each verified green in real CI before being added to the gate's run set.

### BL-ADMIN-NAV-BADGE-SUSPENSE-STREAMING — stream the admin nav badge counts via `<Suspense>` instead of blocking layout

**Filed:** 2026-06-23 (nav-perf Phase 2 — the descoped half of E). Phase 2's E-lite parallelized the admin layout's two badge reads (`Promise.all`), so first `/admin` entry blocks on one wall-time instead of three sequential round-trips. The further win is to stream the badges entirely OUT of the blocking layout path via `<Suspense>` so the nav chrome paints immediately and the counts arrive after.

**Why backlog, not now:** `components/admin/nav/AdminNav.tsx` is a `"use client"` component with a stateful refetch hook (`useNeedsAttentionBadge`), and the repo has **zero `<Suspense>` precedent** — streaming needs a server-child + slot bridge (refactor AdminNav's prop/slot contract) for a first-`/admin`-entry-only gain (the layout is reused across sibling navs, so its awaits don't re-run per nav). Invasive relative to the payoff.

**Promotion prerequisite:** an established `<Suspense>` streaming pattern in the codebase + an AdminNav slot refactor that lets the badge counts arrive as a streamed server child without breaking the client-side pathname-refetch hook.

### BL-RESURRECT-MOBILE-SAFARI-E2E — lift the rest of the mobile-safari Playwright project into CI

**Filed:** 2026-06-23 (discovered building the crew-e2e CI job). NO CI workflow runs the `mobile-safari` Playwright project — every CI playwright run is project-filtered (`dev-gate-e2e.yml`→dev/prod-build; `help-affordances.yml`→help-docs; `screenshots-*.yml`→screenshots). So `tests/e2e/crew-page.spec.ts` + the ~20 M4 tile specs (schedule-tile, transport-tile, status-financials, role-spoof, pack-list, notes-tile, right-now*, layout-dimensions, empty-state*, apply-driven-refresh, redeem-link, leaked-link, auth-chain, …) are committed but **dead-in-CI** (only run via local `pnpm test:e2e`, which cold-builds ~4 webServers — impractical). The new `.github/workflows/crew-e2e.yml` runs ONLY `crew-section-toggle.spec.ts` (the perf gate + 0-network/dimensional proofs) — the `CREW_E2E_ONLY` filter + `db:seed` pattern there is the reusable template for the rest.

**Effort:** L

**Why backlog, not now:** these specs have been unran in CI for a long time and could surface latent seed/timing/env failures (the crew corpus + the M4 tile fixtures mutate shared rows; `workers:1` already serializes them, but resurrecting ~20 at once is a multi-round debugging slog, not a follow-on edit). Scoping the crew-e2e job to one spec delivers the perf gate now without that risk.

**Promotion prerequisite:** extend `crew-e2e.yml` (or a sibling) to run `--project=mobile-safari` (all specs), triaging each failure (most likely: seed dependencies the corpus no longer satisfies, or specs that assumed a pre-redesign DOM). Land green incrementally (add spec globs as they pass) rather than flipping the whole project on at once.

### BL-HELP-UI-LABEL-CROSSWALK-EXACT-MATCH — tighten short action labels in the /help UI-label crosswalk

**Filed:** 2026-06-23 (Codex flagged it reviewing the D9 sync-model doc fix, PR #96). The crosswalk (`tests/help/_metaUiLabelCrosswalk.test.ts`) verifies each bold/quoted /help label exists in shipped `app/`+`components/` source via **substring** matching. So a short bolded label like `Undo` passes against any longer shipped string (`Undo this change`, `Undo auto-publish`, `Undoing…`) even if the doc means a different control. It catches invented labels but not subtly-wrong ones. (The D9 fix sidestepped this by naming the exact control "Undo this change" in the copy, so no current doc relies on the loose match — this is hardening, not a live bug.)

**Effort:** M

**Why backlog, not now:** tightening short labels to require exact / word-boundary UI-text match is a meta-test change that would re-validate **every** existing bold label across all /help pages at once, likely surfacing a batch of pre-existing loose matches (e.g. `**Sync**` vs shipped `Sync status`) that each need reconciliation or a declared-exception — a multi-round sweep, not a one-line edit. Low ROI relative to that risk.

**Promotion prerequisite:** a /help-docs hardening pass that can absorb re-validating the full label set, OR a concrete instance where a loose match let a wrong label ship. Then add an exact/word-boundary tier for labels under ~6 chars (keep substring for long, unambiguous labels), and reconcile every now-failing label in the same commit (per the structural-defense-calibration rule).

---

### Items considered for backlog but NOT included

These were on the deferred-vs-backlog audit list (2026-05-19) but determined to be genuine deferrals, not speculative future work. They stay in their plan's DEFERRED.md:

- **M2-D3** (`transportation.show_id` single-row uniqueness) — concrete trigger ("real multi-driver fixture surfaces"); spec question with a clear answer mechanism.
- **M2-D5** (seed hardcoded restage filename) — has a clear technical home ("next seed touch") even if the trigger hasn't fired.
- **M4-D1** (parser canonical-key probe) — clear technical home ("M1 follow-up touch OR cross-cutting key-canonicalization task").
- **M5-D7** (accent button atom) — concrete trigger (4th accent button variant materializes; YAGNI gate).
- **M9-D-C6c-1** (pinch-zoom discoverability hint) — declined with concrete re-open trigger ("FXAV crew explicitly identifies pinch-discovery friction").

### M12.2 B2 UI polish (impeccable v3 dual-gate deferrals, 2026-06-02)

Speculative finish polish from the B2 UI external impeccable attestation (gate PASSED, zero HIGH/P0/P1; these are LOW/P3 with no user-facing harm, no concrete trigger). Dispositions also in the B2 handoff §12.

- **BACKLOG-B2UI-1** — `DashboardBucketSegmentedControl`: disabled "Archived (0)" segment can read as clickable-but-dead on first encounter; consider `title="No archived shows"`.
- **BACKLOG-B2UI-2** — `ArchiveShowButton`: two `min-w-[18rem]` arbitrary literals; tokenize (sibling of the shipped `--spacing-confirm-box`) or accept the one-off button-pair width.
- **BACKLOG-B2UI-3** — `ArchiveShowButton`: armed confirm button's `hover:bg-warning-bg` equals its resting bg (no hover feedback); add a distinct `hover` token.

---

## BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED — one clip-fit anchor still has no real-surface number

**Effort:** M

Filed 2026-08-02 alongside the anchor-room census that measured the other two.

`lib/layout/fitWithinClip.ts` now carries a per-anchor reachability table instead of
generalizing one measurement. Two of the three anchors have real numbers: the Re-sync band
(209.75px at 375×667) and the AttentionMenu scroller (swept at 375×H — 844→563, 667→412,
560→322, 400→186, 300→101, linear in viewport height). The third, the PublishedToggle refusal
banner, does not.

Two obstacles, both in the harness rather than the code:

1. The banner mounts only on a REFUSAL, and the shared modal harness hardcodes
   `setPublished: NOOP_OK` (`tests/e2e/_publishedReviewModalHarness.tsx`), so no refusal can be
   driven through the real modal.
2. Its anchor — the StatusStrip — renders BELOW the clip window in that fixture at 375×667.
   Measured: strip `713.03..911.03` against a panel bottom of `667`. Room computed there is
   `-257px`, which describes an anchor clipped entirely out of view rather than one an operator
   interacts with.

What IS pinned today is the structural premise the fit depends on: walking up from the anchor
lands on the review-modal panel, asserted in the anchor-room census and proved live by mutation.
The dedicated replica entry (`tests/e2e/_publishedToggleClipLiveEntry.tsx`) exercises the
arithmetic and DOM wiring, but its ~80px of room is CHOSEN, so it cannot speak to reachability.

Obstacle 2 is worth a second look on its own terms: a fixture that renders the strip fully
outside the clip window may be an unrepresentative fixture, or may be a real responsive defect
at that viewport. Nobody has established which.

**Trigger:** a harness that can drive a refusal through the real modal (a `setPublished`
override on the shared harness would do it), or a decision about obstacle 2. Until then the
docblock states the gap rather than papering over it.

---

## BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED — the validation-schema-parity gate never looks at functions, so RPC drift on validation passes silently

**Filed:** 2026-08-03 (BL-UNPUBLISH-TO-HELD graduation audit). **Class:** CI gate scope. **Effort:** M.

`supabase/__generated__/schema-manifest.json` records tables × columns only, and `tests/db/validation-schema-parity.test.ts` asserts validation is a superset of that manifest — no function ever enters the comparison. A validation project missing an RPC, or running a stale body of one, passes the gate; the only live function check is the telemetry-RPC smoke job (`tests/db/telemetryConsoleReads.test.ts` via `x-audits.yml`), which covers telemetry reads and nothing else. Probed 2026-08-03 during the graduation audit: no current drift — `unpublish_show` and `_unpublish_show_core` are present on validation with the performed-boolean discriminator applied. The exposure is future RPC edits, where the surgical-apply step (AGENTS.md "Every migration must reach the validation project") is forgotten and nothing fails.

**Work:** extend the manifest generator and parity gate to cover functions — signature-level (name + args + return type) is the cheap tier and catches missing/renamed RPCs; a body hash would also catch stale bodies at the cost of noise on comment-only edits. Scope decision needed at pickup; either tier keeps the existing superset semantics.

**Status:** OPEN.
