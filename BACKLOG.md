# BACKLOG

Speculative / lower-priority hardening items. "Might do" — not blocking, no concrete near-term trigger. (Contrast `DEFERRED.md`: "will do, concrete trigger".)

**This file is the OPEN queue only.** Resolved / shipped / superseded entries live in **[BACKLOG-archive.md](./BACKLOG-archive.md)** with full provenance — grep by id, ids are unchanged. When an item below ships, move its whole entry there rather than annotating it resolved in place; otherwise this queue silently turns into a changelog.

Last reconciled: 2026-08-04 — `fix/apply-undo-audit-fidelity` (PR #697, merge `644f8bb06`) graduated `BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP`, `BL-IDENTITYLINK-LANDED-VS-REQUESTED` and `BL-UNDO-SELECTIONS-RESET-AT-DROP`. The notice and feed now derive from rename pairs that actually LANDED, with unlanded ones recorded as a durable `IDENTITY_LINK_RENAME_UNLANDED` event — and that row's own premise was partly wrong: the feed never consumed the requested `identityLinkRenames` at all, it re-derived its own pairs from `triggeredItems` with NO accept gate, a wider defect than the row described. The notice needed a two-arm split rather than a swap, because feeding landed pairs to arm (c) as well would have fired a FALSE capability-loss notice for every pair whose source row survived; arm (c) now suppresses a loss only when the source SURVIVED, which also surfaces a real loss the old suppression hid. The roleFlagsNotice row named ONE discard site and the class sweep found FOUR (finalize-cas, ordinary finalize, `runManualStageForFirstSeen`, and the pending-ingestion retry, which bypasses the locked wrapper's post-commit tail entirely), all repaired through one shared `lib/sync/emitRoleFlagsNotice.ts` and flushed in a `finally` after the outer transaction at three sites — including the STREAMING finalize-cas handler, the one real operator traffic reaches; the structural guard against a fifth is DESCOPED and refiled as `BL-ROLEFLAGSNOTICE-DROP-GUARD`. `selections_reset_at` survives an undo, the real fix being to capture the successor's marker BEFORE the delete — the common rename path takes the clean-INSERT branch, so a merge living only in `ON CONFLICT` would never have run — with `mi11_approve_hold` repaired as a second producer dropping the column at two sites, and two historical shapes left unrescuable as documented limits. The same branch filed `BL-CAPABILITY-LOSS-SURVIVING-ROW-FALSE-POSITIVE`, `BL-SHADOW-REBUILD-EXHAUSTED-EMIT-PLACEMENT` and `BL-CODE-ENUM-PROVENANCE-COMMENT-BLIND`. Prior: 2026-08-03 — `feat/inter-numeral-disambiguation` graduated `BL-INTER-NUMERAL-DISAMBIGUATION` by changing the FONT rather than the CSS: the row's premise was false. Probed live before drafting — the Inter build Google Fonts serves has the character variants stripped (`calt ccmp dnom frac kern locl mark mkmk numr pnum tnum`, `wght` axis only), so the requested `"zero" 1, "cv05" 1` would have rendered nothing, exactly as the `"cv11" 1` beside it had been rendering nothing since `78662acb5` (2026-05-03). Two defects in the row itself besides: `cv05` never touches capital `I`, and `ss04` is Inter's own disambiguation set covering both letterforms. Shipped a latin + latin-ext SUBSET of the upstream v4.1 release (173 KB, built by `scripts/subset-inter.sh` from a checksum-pinned input, OFL alongside) via `next/font/local` — verbatim at 344 KB was the gate decision until the impeccable audit measured it costing FCP +136-164ms and a fallback-to-Inter swap landing 3.7s in on slow 4G. `ss04` at `html`, `ss04`/`tnum` on the tabular rule, and `zero` on a NARROWER `.code-value` class, because `.tabular-nums` turned out to sit on whole prose sentences including the Right Now hero's 30px bold h2. `ss04` is REPEATED on each rule because `font-feature-settings` inherits as a whole value, not a merged list. Fourteen false claims corrected across `DESIGN.md`, the font-binding spec and plan, and eight source comments, including that plan's own P3 disposition claiming the binding "deterministically activates Inter's alternates … for the first time" (it activated nothing). New guard `tests/styles/fontFeatureAvailability.test.ts` derives the font path from `app/fonts.ts` and fails the build on any tag the loaded binary cannot honor, with a regression proof against the committed Google binary; in the browser `zero` needs a PIXEL oracle because `zero` and `zero.slash` share an xAdvance of 1292, so no width assertion can ever see it. Cross-model spec review round 1 returned BLOCKING with 7 findings, five confirmed by probe and all repaired. Prior: 2026-08-03 — `feat/needs-attention-holds-rollup` graduated `BL-NEEDS-ATTENTION-HOLDS-ROLLUP` (the cross-show open-holds read plus the fourth needs-attention stream across page, inbox, badge, mobile chip, and digest; spec `docs/superpowers/specs/2026-08-03-needs-attention-holds-rollup-design.md`, plan `docs/superpowers/plans/2026-08-03-needs-attention-holds-rollup.md`). Prior: 2026-08-03 — `feat/sync-feed-undo-announce` graduated `BL-SYNC-FEED-UI-POLISH` and all three children. `BL-SYNCFEED-UI-1` shipped, with its own premise corrected: the note's proposed in-button `aria-live` region cannot work, because a successful undo flips the row out of `status='applied'` and unmounts the button before assistive technology reads anything. Six adversarial rounds then refuted every surface-level owner in turn (the group empties, the strip returns null, the dashboard returns a different tree, the feed is swapped for its error rendering), and the vector was settled by an executable spike rather than a seventh prose argument. The channel lives in `AdminAnnounceProvider`, mounted by the admin layout AND by `ReviewModalShell` — a modal needs its own, since content outside an `aria-modal` dialog is excluded from the accessibility tree. `BL-SYNCFEED-UI-3` graduated as already-shipped (fixture corrected at `c3920fe6a`); `BL-SYNCFEED-UI-2` ratified as untriggered with its re-open trigger preserved. The same work fixed a class defect the sweep found: all three feed action buttons rendered their failure card by conditional mount, so failures were silent to AT too. Filed `BL-FEED-BUTTON-SUCCESS-ANNOUNCE`, `BL-BULK-UNDO-ANNOUNCE-UNMOUNT`, and `BL-ANNOUNCE-REGION-UNMOUNT-CLASS`. Prior: 2026-08-03 — `feat/modal-freshness-cue` graduated `BL-MODAL-REALTIME-UPDATED-CUE` as SHIPPED: the published review modal now flashes the panel card of every registry section whose CONTENT changed across a realtime-driven reconcile, plus an sr-only announcement from the same detector, so a swap under the reader is attributable instead of silent. The entry's premise was wrong and is corrected in the archive: the 2026-07-19 realtime spec ratified that the BRIDGE renders `null`, never that the surface it refreshes must stay silent, so this was a new design decision rather than a reversal. The user chose flash-then-fade directly. Two adversarial rounds (the second split in half) returned BLOCKING and were repaired: the projection missed routed warnings, routed use-raw state, section anchors and attention items, and separately OVER-hashed the warnings panel and non-rendered decision fields; the mount baseline lived in a ref that abandoned renders consumed; and an aborted close hides the shell without unmounting the state owner. Prior: 2026-08-03 — `chore/scanner-precision-cluster` graduated `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN` and `BL-LEDGER-GUARD-BODY-DEFINED-IDS`, the two entries whose shared shape is a static scanner opening too small a set of files while a hand-maintained residue covers the gap. Both residues had already rotted: the enum's four-code list held one code that was long since absorbed while ELEVEN real §12.4 codes were dark, and the ledger guard's eight `KNOWN_DANGLING` rows were never debt at all. The scan is now type-aware and fail-closed (58 codes, 0 unresolved, 44 capture-linked skips) after six adversarial rounds established that every syntactic mechanism — root widening, type-stripping, written-return-type matching — is defeated by a spelling; the ledger guard now resolves body-defined sub-item ids under three corpus-measured conditions. One documented limit is fenced rather than overclaimed and filed as `BL-CATALOG-PARTITION-WARNING-CLASS`: provenance through `any` is undecidable, so the real closure is an enumerated catalog, not a better scanner. Prior: 2026-08-03 — `feat/font-binding-modal-freshness-cue` graduated `BL-HEADER-FONT-FALLBACK-WRAP`: the browser check it asked for refuted its own stated doubt (Next 16 registers the literal family name, so the crew import DID bind) and surfaced a wider finding — the product rendered two type families across its trees while `DESIGN.md` §2.1 commits to one, because the loader had never been wired at the root. Shipped as one shared loader instance in `app/fonts.ts` imported by BOTH Next roots (the crash screen replaces the root layout, so it was otherwise left behind), with `--font-sans` binding next/font's metric-matched fallback face so the swap window stops reflowing ~10%. Filed `BL-HARNESS-FONT-FIDELITY` (the 31 standalone harnesses have no Next runtime and keep measuring the ambient host font — zero cost today, needs a spec not a patch) and `BL-INTER-NUMERAL-DISAMBIGUATION` (impeccable P3). Prior: 2026-08-03 — `chore/orphan-components-lead-prose` settled the two entries the copy/dead-code sweep left behind. `BL-LEAD-CAPABILITY-PROSE-STALE` graduated: both prose claims turned out STALE rather than intentional — the `capabilityTransitions` line is a verbatim quote that stopped being verbatim at `e348c81ca`, and MI-9's "admin/ops" clause was inherited from §12.4 copy strings whose every other instance had already been retired or corrected. A third instance the literal sweep could not see (`lib/sync/phase2.ts`, a semantic variant in production source) was corrected with them, and two guards shipped in the same commits: `capabilityHeaderParity` extracts the expected flag set from `scopeTiles.ts` source, and `capabilityClaimProse` scans the MI-9 rows AND every `.ts`/`.tsx` under `app`/`components`/`lib` with a positive-claim recognizer. `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS` was AMENDED, not archived: four components retired (each with a named superseding commit and live successor; `RightNowCard`'s two regression suites were retargeted onto `RightNowHero` and each proven by mutation before the deletion), and `WrappedTile` stays as a DECIDED retention — deleting it would orphan `TileErrorBoundary` and `TileServerFallback` rather than shrink the ledger, and the orphan guard now asserts its reason says so. Filed `BL-CAPABILITY-MATRIX-FINANCIALS-PREDICATE` (the matrix models five predicates, the code has six) and `BL-BELLPANEL-DISMISS-COMMENT-DRIFT` (six comments name a label the panel stopped rendering). New guard `tests/docs/retiredIdentifierReferences.test.ts` walks every tracked file for references to what was retired, keyed by LINE CONTENT with reasoned exemptions — three adversarial rounds each found references a hand-curated census had missed, so the census is now a walk. Prior: 2026-08-03 — `docs/close-v1-override-wont-build` graduated `BL-VERSION-AMBIGUOUS-V1-OVERRIDE` as RESOLVED — WON'T BUILD: no admin force-classify override gets built, now or trigger-gated. The row's premise was false as stated. `v1` is a fallback bucket, not a confirmed legacy template (`lib/parser/schema.ts:37`; the registry entry at `lib/parser/schema.ts:53` carries no `requires` array, so nothing positively identifies a v1 sheet), and its "a genuine legacy-v1 sheet has neither resolution" conflated _no markers registered today_ with _no registrable structure_ — a real legacy sheet, once actually seen, is indistinguishable from a genuinely-new template, and the gate spec's §7.1 resolution #2 (developer registers the markers) is not limited to new templates. Probed: all 10 committed fixtures classify confidently (6× v2 at 7/0, 4× v4 at 8/0), zero ambiguous, zero v1. The override would convert a signaled failure into a silent one, inverting the preparedness-audit posture, and it serves none of the four indistinguishable bucket occupants better than their existing disposition. Re-open trigger recorded in the archive entry, conjunctive: a real legacy sheet surfaces AND marker registration proves impossible. **Current state after this and the same-day `docs/graduate-bl-unpublish-to-held` graduation: six of the eight rows the 2026-08-02 segment below enumerates remain open** (`BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`, `BL-HEADER-REACT-RECONCILE-HARNESS`, `BL-PG-CRON-HOST-ASSERTION`, `BL-NEEDS-ATTENTION-HOLDS-ROLLUP`, `BL-RESYNC-STAGED-REVIEW-UI`, `BL-STEP3-FULL-CREW-PREVIEW`); that segment's own "Eight open rows here" count is left as written, because it describes the state at the 2026-08-02 reconciliation and demoting it behind `Prior:` is what marks it as history. Prior: 2026-08-03 — `docs/graduate-bl-unpublish-to-held` graduated `BL-UNPUBLISH-TO-HELD` as already-shipped: the 2026-07-01 published toggle (`unpublish_show` RPC in `supabase/migrations/20260701000000_published_toggle_unpublish_show.sql`, driven by `setShowPublishedAction(slug, false)` from the admin show review modal, commit 945bd4ef0) is exactly the published→Held inverse the row asked for — the row's 2026-08-02 "Verified: no such RPC exists" was a false verification, and its premise that the M12.13 token-unpublish archives was stale too (both unpublish paths are pure `published=false`). A 10-point audit of the shipped surface before graduating found no functional gap and one gate-scope finding, filed as `BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED` (the validation-schema-parity gate covers tables×columns only, never functions — no current drift, probed live). Prior: 2026-08-02 — `chore/copy-deadcode-sweep` graduated three copy-and-dead-code entries (`BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT`: the §12.4 helpfulContext no longer claims either capability role unlocks admin access — probed, `is_admin()` never reads `role_flags` — landed as a five-surface lockstep in one commit plus the row's `longExplanation` and the `scopeTiles` header comment it contradicted; `BL-ADMIN-PARSEPANEL-ORPHANED`: the component deleted behind a new zero-production-importer guard that asks the compiler for both module edges and their targets, with the five peers the class sweep found filed as `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS`; `BL-HELP-STRIP-COPYLINK-STALE`: the per-show help prose now names the Share link button, no screenshot regenerated). Also filed `BL-LEAD-CAPABILITY-PROSE-STALE` for the two remaining prose claims that need a contract read. Prior: 2026-08-02 — `docs/dangling-citation-ledger-filing` took the referential-integrity guard's `KNOWN_DANGLING` debt map from 50 rows to 9, filing 39 real entries and correcting one citation (`BL-FLOW4` came off as a side effect: with its family now defined, the stem suppresses as a family reference). Eight open rows here (`BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`, `BL-HEADER-REACT-RECONCILE-HARNESS`, `BL-PG-CRON-HOST-ASSERTION`, `BL-NEEDS-ATTENTION-HOLDS-ROLLUP`, `BL-RESYNC-STAGED-REVIEW-UI`, `BL-STEP3-FULL-CREW-PREVIEW`, `BL-UNPUBLISH-TO-HELD`, `BL-VERSION-AMBIGUOUS-V1-OVERRIDE`) plus `BL-LEDGER-GUARD-BODY-DEFINED-IDS` as the handoff for the eight ids defined in a parent entry's BODY, which stay body-defined by decision. Thirty-one went straight to `BACKLOG-archive.md` at their terminal state: eleven already shipped (the row was deleted at close instead of graduated, twice on a spec's explicit instruction), fifteen were impeccable-gate deferrals whose promised row was never opened and whose deferral has since closed, and five name a branch that was never taken. One citation was corrected instead of filed: `BL-SYNC-FEED-UI-POLISH` pointed at a backlog-id family that exists nowhere in the repo. The 9 rows left are the eight body-defined ids above plus `BL-RESOLVED`, a prose placeholder in an audit doc, both handed to follow-ups. Prior: 2026-08-02 — `test/agenda-fold-seeded-e2e` graduated `BL-AGENDA-FOLD-NO-SEEDED-E2E` (the per-viewer agenda day fold exercised through the REAL crew page: seeded `agenda_links` + two complementary date-restricted viewers, each an email-matched Google session against its own seeded show, plus an unrestricted admin control in `stage-restricted-crew-schedule.spec.ts`, wired into `crew-e2e.yml` under desktop-chromium behind a run-command wiring guard) and `BL-AGENDA-A11Y-WEBKIT-COVERAGE` (grep-scoped `standalone-webkit-a11y` project resolving exactly one test, structurally pinned, plus webkit installs and a regenerated baseline). Prior: 2026-08-02 — docs/citation-rot-financials-vocab graduated BL-DANGLING-CITATIONS-RETIRED-WORKFLOW (15 dangling citations to the seven retired e2e workflows rendered as prose across 10 docs, class-swept per the AGENTS.md bug-shape rule; spec:lint target-class findings now zero tree-wide) and BL-MASTERSPEC-FINANCIALS-VOCAB (14 master-spec financials-entitlement claims reconciled to LEAD ∪ FINANCIALS ∪ admin, line-count-neutral; 4 seed exclusions + 8 window-probe non-claims ratified in docs/superpowers/specs/2026-08-02-docs-hygiene-citation-rot-financials-vocab-design.md; specs README line-count note corrected), and filed BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT (§12.4 copy over-grant, deferred to the next §12.4 copy pass). Earlier reconciliations (deduplicated 2026-08-02 — this line had accumulated 40 segments, 26 of them verbatim repeats of merge-concatenated chains): **[BACKLOG-archive.md § Reconciliation log](./BACKLOG-archive.md#reconciliation-log)**.

---

## BL-CODE-ENUM-PROVENANCE-COMMENT-BLIND — a doc comment silently rewrites generated code provenance

**Status:** OPEN · **Severity:** LOW (no consumer keys on the widened field today; the exposure is that generated provenance stops meaning what it says) · **Class:** generator fidelity · **Filed:** 2026-08-04 (`fix/apply-undo-audit-fidelity`, surfaced while reconciling the Unit C registry drift) · **Effort:** S

`scripts/extract-internal-code-enums.ts:161` decides whether a file's codes claim `admin_alerts.code` provenance by regexing the **raw source**:

```
if (/\badmin_alerts?\b|upsertAdminAlert|upsert_admin_alert/i.test(source)) {
```

That test is comment-blind. Adding a doc comment that merely _names_ `upsertAdminAlert` — as the apply/undo branch did at `app/api/admin/onboarding/finalize/route.ts` and `app/api/admin/onboarding/finalize-cas/route.ts`, explaining why an emit does NOT belong at a given point — flips provenance for **every** code in that file. Six §12.4 codes widened to claim `admin_alerts.code` on that regeneration (`ONBOARDING_FINALIZE_INTERNAL_ERROR`, `ONBOARDING_LEGACY_ROW_AMBIGUOUS`, `ROLE_MAPPINGS_OUTDATED_AT_PUBLISH`, `STAGED_PARSE_OUTDATED_AT_PHASE_D`, `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE`, `WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED`) without any of them gaining a write site.

**Benign as shipped, which is exactly why it is worth filing.** Code membership is unchanged and no consumer keys on `admin_alerts.code` — the live filters key on `parse_warnings.code` — so the widening changed nothing observable and the regenerated manifest was committed rather than the extractor patched mid-branch. The defect is that a generated artifact's provenance field can be rewritten by prose, so it cannot be trusted as evidence of a write site, and the next person to rely on it will not know that.

**Work:** gate on parsed source rather than raw text — strip comments and string literals before the provenance test, the same shape `stripLogEmissionCalls` already uses for the §12.4 scans. A regression fixture is a file whose only mention of the writer is in a comment.

---

## BL-SHADOW-REBUILD-EXHAUSTED-EMIT-PLACEMENT — a durable event for a committed row is skipped when the outer finalize rolls back

**Status:** OPEN · **Severity:** LOW-MEDIUM (lost forensic event; no data impact) · **Class:** telemetry durability · **Filed:** 2026-08-03 (`fix/apply-undo-audit-fidelity`, spec §2.3, deferred under class-sweep exception (a)) · **Effort:** S once the product question is settled

`logAdminOutcome({ code: "ONBOARDING_SHADOW_REBUILD_EXHAUSTED", … })` (`app/api/admin/onboarding/finalize-cas/route.ts:1025-1038`) fires inside `runFinalizeCas`, which runs inside the outer `deps.withTx` holding `tryFinalizeLock` (`app/api/admin/onboarding/finalize-cas/route.ts:905`). The row mutation it describes commits in its own `withRowTx`, independently of that outer transaction — so when the outer commit fails, the mutation stands and the event describing it is silently skipped.

**The exposure is the lock, not a lost event.** The emit fires after `withRowTx` resolves (`app/api/admin/onboarding/finalize-cas/route.ts:968-970`, `:1020-1022`) and before the outer transaction finishes, so a later outer rollback cannot retract it — an earlier draft of this row claimed the event was skipped, which is wrong. What is true is that it runs while `tryFinalizeLock` is still held, which is the invariant-10 posture AGENTS.md states for emits ("POST-COMMIT, outside any advisory-lock tx"). Its neighbour `SHOW_FINALIZED` shares the placement, but both finalize routes have deliberate, test-pinned behavior for it (ordinary finalize suppresses on outer failure, `tests/onboarding/finalize.test.ts:864`; finalize-cas preserves it, `tests/onboarding/finalize-cas.test.ts:685-686`), so it is not in this row's scope.

**Why this is exception (a), not a mechanical fix.** Moving the emit outside the lock also changes when it fires relative to an outer rollback, and whether an operator should hear about an exhausted shadow rebuild belonging to a finalize attempt that then failed is a product question about their mental model. If the answer is yes, the fix is the accumulator-and-`finally` pattern the closing branch establishes for its own emits. Surfaced by cross-model review R9 of that branch, which identified the placement while the branch had no basis to settle the semantics.

---

## BL-ROLEFLAGSNOTICE-DROP-GUARD — no guard detects a path that obtains a `roleFlagsNotice` and never emits it

**Status:** OPEN · **Severity:** LOW-MEDIUM (all four known instances closed; the class is unguarded) · **Class:** guard completeness, static analysis · **Filed:** 2026-08-03 (`fix/apply-undo-audit-fidelity`, descoped at spec review R5 after the vector produced a finding in four consecutive rounds) · **Effort:** L

`tests/sync/_metaLeadRoleAppliedTopology.test.ts:29` matches `upsertAdminAlert(<expr>roleFlagsNotice` and asserts the discovered emit-site list. That detects a site that upserts the alert **without** the durable event. It has never detected the opposite and more damaging shape: a path that obtains a real notice and emits nothing. `BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP` was one instance of that shape; the closing branch found and repaired four.

**Why this is L, not S — read before attempting.** Four adversarial rounds each refuted a cheaper design, and those refutations are the real specification:

1. Keying on `applyStagedCore` callers misses `runManualStageForFirstSeen`, which takes its notice straight from `runPhase2` (`lib/sync/runManualStageForFirstSeen.ts:111`).
2. Keying on `runPhase2` consumers still misses the one known bypass: the pending-ingestion retry route is not a `runPhase2` OR a `processOneFile_unlocked` consumer. It calls `runManualSyncForShow_unlocked`, which forwards through an import alias and a dependency-injection seam (`lib/sync/runManualSyncForShow.ts:13`, `lib/sync/runManualSyncForShow.ts:287-288`). A direct-consumer guard would approve that helper for faithfully preserving the envelope while staying blind to the route that drops it.
3. So the guard needs **recursive carrier tracking** from every producer through those seams to terminal sinks, plus an exemption syntax and a registry — a static-analysis surface with its own design.

Structural note for whoever takes this: the emit is attached to the locked wrapper (`lib/sync/runScheduledCronSync.ts:2750`), not to the apply, which is why every `_unlocked` caller is a discard site by construction. A future design might close the class at that layer instead of by analysis. Deferred under class-sweep exception (c) — a redesign of a surface the closing PR does not otherwise touch.

---

## BL-CAPABILITY-LOSS-SURVIVING-ROW-FALSE-POSITIVE — arm (c) reports a capability loss for a row that is still live

**Status:** IN PROGRESS · **Branch:** chore/backlog-convergence · **Severity:** LOW-MEDIUM (false operator alert; no data impact) · **Class:** notice fidelity · **Filed:** 2026-08-03 (`fix/apply-undo-audit-fidelity`, spec §9, deferred under class-sweep exception (c)) · **Effort:** S · **Reachability: PROBED 2026-08-04 — REACHABLE on one hold shape of four.**

`capabilityRoleChangesForNotice` arm (c) (`lib/sync/phase2.ts:347-356`) reports a capability loss for any `previousCrewMembers` entry that is absent from `nextByName` and absent from `renamedAway`. `nextByName` is built from `appliedCrewMembers`, which is the post-hold **parse** list (`lib/sync/applyParseResult.ts:189`), while `deleteKeepNames` (`lib/sync/applyParseResult.ts:178`) protects rows from deletion **without** adding them to that list. A row can therefore survive the apply with its capability flags intact and still be reported as a loss.

The rename-linked instances of this shape were fixed in the filing PR via the survival test in its spec §2.1 A3. The non-rename instances are what this row tracks.

**PROBED 2026-08-04**, per hold kind × domain × sub-shape, end-to-end through `runPhase2` (survival read from `crew_members` after the apply; the report read from the real `roleFlagsNotice`, since `capabilityRoleChangesForNotice` is not exported). Probe: `tests/sync/capabilityLossReachability.probe.test.ts`.

| hold kind / domain / sub-shape                           | survived | reported | verdict                       |
| -------------------------------------------------------- | -------- | -------- | ----------------------------- |
| `mi11_pending` / `crew_email`                            | yes      | no       | correct                       |
| `undo_override` / `crew_email`                           | yes      | **yes**  | **FALSE LOSS**                |
| `undo_override` / `crew_identity` (held-present restore) | yes      | no       | correct                       |
| `undo_override` / `crew_identity` (tombstone)            | no       | yes      | real loss, correctly reported |

**The premise holds, but for ONE shape, and not for the reason the row assumed.** It is not arm (c)'s absence predicate that is wrong: it is a two-line asymmetry among the four branches that delete-protect a name. Every other branch also puts a row BACK — `mi11_pending`'s genuine-removal fallback retains the held row (`lib/sync/holds/holdAwareApply.ts:322`), and the `crew_identity` restore branch retains it (`lib/sync/holds/holdAwareApply.ts:449`) — and retained rows are merged into `plan.crewMembers` at `lib/sync/holds/holdAwareApply.ts:390`, which is what becomes `appliedCrewMembers`. `applyUndoOverrideToMaps`'s `crew_email` branch (`lib/sync/holds/holdAwareApply.ts:432-439`) adds `protectedNames` and `pinnedIdentity` and returns with no `retainRows.set`. That is precisely "survives the delete, absent from the applied list", so a live LEAD is announced to the operator as having lost LEAD access.

**Re-sized M → S** on the probe: the search space collapsed from "redesign arm (c)'s absence predicate on a path no unit touches" to one branch that is asymmetric with its three siblings.

screen-disposition 2026-08-04: KEEP — probe (`tests/sync/capabilityLossReachability.probe.test.ts`) demonstrates the false loss end-to-end on `undo_override`/`crew_email`; three sibling shapes verified correct in the same run, and all four are pinned at current behaviour.

**Work.** Restore the symmetry at the source rather than loosening arm (c). The tombstone row above is the counterweight and is pinned in the same probe file: it is a REAL loss, and any fix that suppresses arm (c) more aggressively to silence the false positive will silence that one too. All four rows are pinned at current behaviour, so the fix arrives with a failing case waiting for it.

---

## BL-LEDGER-BODY-DEFINED-ID-OVERMINT — any bold lone id at a bullet lead defines, so a mention can mint an id

**Status:** OPEN · **Severity:** low (latent, not live) · **Class:** guard precision · **Filed:** 2026-08-03 (`chore/ledger-claim-visibility`, spec §9.2) · **Effort:** S

`bodyDefinedIds` (`tests/docs/_ledgerMdast.ts:346`) does not require a separator after the bold id,
so any bold lone id at a bullet lead defines. A bullet whose bold id is followed by ordinary prose,
or by a colon, mints that id exactly as a real sub-item definition would; a nested bullet and a
backticked enumeration both correctly do not. The five-shape probe with its outputs is in
`docs/superpowers/specs/2026-08-03-ledger-claim-visibility-design.md` §9.2 — deliberately not
reproduced here, because its planted ids would need citation exemptions in this ledger.

Latent, not live: main mints exactly the intended eight ids today. But it over-mints in the
direction the guard exists to prevent — a bullet naming a sibling id in bold makes that id resolve,
so a typo can define itself. Deferred out of `chore/ledger-claim-visibility` under exception (b) of
the `AGENTS.md` class-sweep disposition rule: the originating brief fenced it explicitly. Any
tightening needs a probe demonstrating the corruption it prevents, per the finding-admissibility
contract.

---

## BL-LEDGER-DISCOVERY-FAMILY-SCOPED — "discovered from disk" holds only inside one naming family

**Status:** OPEN · **Severity:** low · **Class:** guard coverage · **Filed:** 2026-08-03 (`chore/ledger-claim-visibility`, spec §5) · **Effort:** M

`AGENTS.md` states that ledger files are discovered from disk so a new one is covered by default.
That is true only within one naming family. `ledgerFiles` (`tests/docs/_metaLedgerInProgress.test.ts:46`)
does `readdirSync` and then filters on a regex accepting `BACKLOG` or `DEFERRED` with an optional
`-archive` suffix; `tests/docs/_metaLedgerReferentialIntegrity.test.ts` hardcodes the same four names
independently. A new ledger family would be silently invisible to both, and to the claim reader that
consumes the same helper.

Not currently live — the repo has exactly the four files. Deferred out of
`chore/ledger-claim-visibility` under exception (c): widening discovery changes which files three
existing guards walk, which is its own blast radius and its own review.

---

**Reachability:** INFERRED, NOT PROBED — the probe that settles it: build a scratch root holding a fifth ledger file outside the family (say `WATCHLIST.md`) and assert what `ledgerFiles`, `_metaLedgerReferentialIntegrity`'s hardcoded name list, and the claim reader each see. The probe is cheap and is the first scheduled step, not the widening.

screen-disposition 2026-08-04: ANNOTATE-INFERRED, stays open. It does NOT qualify for demotion: the worst case is a new ledger family silently invisible to three guards, and a SILENT miss is the opposite of the conservative-plus-surfaced shape the filing bar routes to documented limits. Verified 2026-08-04 that the claim is accurate and inert today — `scripts/lib/ledger-fields.ts:42-45` filters `readdirSync` on `/^(BACKLOG|DEFERRED)(-archive)?\.md$/`, `tests/docs/_metaLedgerReferentialIntegrity.test.ts:56-59` hardcodes the same four names independently, and the repo root holds exactly those four files. **Citation corrected:** the `readdirSync` + regex the body attributes to `tests/docs/_metaLedgerInProgress.test.ts:46` lives in `scripts/lib/ledger-fields.ts:42-45`; that test line is the closing brace of its import block.

## BL-LEDGER-MDAST-SHARED-HOME — the ledger walker lives under tests/ but is consumed by scripts/

**Status:** IN PROGRESS · **Branch:** chore/backlog-convergence

**Status:** OPEN · **Severity:** low · **Class:** module placement · **Filed:** 2026-08-03 (`chore/ledger-claim-visibility`, spec §9.3) · **Effort:** M

`tests/docs/_ledgerMdast.ts` is the authoritative ledger walker and is pure by construction — the
referential-integrity guard forbids `node:fs`, `node:path`, and `require(` inside it. Once a script
consumes it, `scripts/**` imports from `tests/**`, which is backwards.

Relocating it beside its consumers is the repair. Deferred out of `chore/ledger-claim-visibility`
under exception (c): it spans four importers plus three hardcoded path exemptions inside
`tests/docs/_metaLedgerReferentialIntegrity.test.ts` that must all move in lockstep, none of which
that branch otherwise touches.

---

## BL-TASK-ENROLLMENT-SINGLE-DEPTH — the declared task region cannot express hierarchical or interleaved plan shapes

**Status:** OPEN · **Severity:** LOW (opt-in convention; conservative failure with a surfaced finding, never silent) · **Class:** spec-lint task contract, enrollment expressiveness · **Filed:** 2026-08-03, from `docs/superpowers/specs/2026-08-03-pre-review-gate-arms-design.md` §6 items 6 and 7

The `<!-- tasks: depth=N -->` region declares ONE heading depth. Two real corpus shapes do not fit it, both measured:

- **Task units at two depths** — 7 of 533 plans, e.g. `docs/superpowers/plans/alerts/2026-07-04-alert-at-a-glance-identity.md` (depths 2 and 3). Enrolling either depth silently excludes the units at the other.
- **Non-task headings at the task depth, between the first and last task** — 6 plans, e.g. grouping headers like `Tasks 5-22: A3-A20 (PROC each)`. No region delimiter can exclude a heading in the middle of the region; it is classified as a task and draws `TASK_MARKER_MISSING`.

**Deferral exception (c)** per the class-sweep disposition rule in `AGENTS.md`: the repair is a redesign of a surface this PR does not otherwise touch. Multi-depth enrollment forces a nesting model — a depth-3 task inside a depth-2 extent — whose marker ownership, extent boundaries, and `TASK_MARKER_MISSING` semantics are a design of their own, not a clause. Neither (a) nor (b) applies: this is not an unsettled product decision, and no prior ratification fences it.

**Why it is safe to carry.** Enrollment is opt-in and no legacy plan is enrolled (measured: 534 plans scanned, 1 attempted, 0 findings). A plan of either shape either normalizes its task depths or stays unenrolled; the author is told plainly rather than checked wrongly. Re-open when someone wants to enrol a plan of one of these shapes.

## BL-COVERAGE-CLAIMS-CITE-SKIPPED-SUITES — contract artifacts claim e2e coverage from suites that do not execute

**Status:** OPEN · **Severity:** LOW-MEDIUM (dark coverage on documented contracts; no product impact) · **Class:** docs/contract, test-coverage claims · **Filed:** 2026-08-03 (`docs/settle-lead-capability-prose`, descoped at spec review R3 after three rounds of under-counting) · **Effort:** L

Twelve artifacts tell a maintainer that compound capability transitions, RightNow transition behavior, and transport animation are exercised by e2e suites. **They are not.** Both named suites are `test.describe.skip`, and neither contains an assertion about the thing claimed.

**Instances found so far. The set is NOT known to be complete** — see the methodological finding below.

| Site                                                 | Claim                                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `lib/visibility/capabilityTransitions.ts:36-39`      | compound transitions "are exercised by the e2e compound-transition tests in `tests/e2e/right-now-transitions.spec.ts`"         |
| `lib/visibility/capabilityTransitions.ts:130`        | "the delta is empty (the e2e compound tests cover those cases)"                                                                |
| `lib/visibility/capabilityTransitions.ts:213`        | an entry `reason` ending "LEAD/admin compound interactions are tested by e2e"                                                  |
| `tests/visibility/capabilityTransitions.test.ts:8-9` | the first claim restated in the test header                                                                                    |
| `tests/visibility/capabilityTransitions.test.ts:194` | "the e2e compound test verifies the no-flicker invariant"                                                                      |
| `tests/e2e/helpers/rightNow.ts:183`                  | skipped pairs "the compound tests handle them with explicit setup"                                                             |
| `tests/e2e/helpers/rightNow.ts:239`                  | "the compound tests … cover the recovery paths"                                                                                |
| `tests/e2e/helpers/rightNow.ts:286-292`              | "the helper covers TIME-DRIVEN transitions"; "the audit suite documents which transitions can be driven via tick-only"         |
| `tests/visibility/transportTransitions.test.ts:10`   | "animation behavior is exercised in e2e tests"                                                                                 |
| `lib/time/rightNowTransitions.ts:12-14`              | the Playwright audit "scaffolded as `test.fixme` until Batch 2 lands `framer-motion`" drives its assertions from this constant |
| `lib/time/rightNowTransitions.ts:82-86`              | `unreachable` transitions are "Regression-guarded by the audit suite"                                                          |
| `tests/time/rightNowTransitions.test.ts:6-8`         | "Animation-behavior tests live in `tests/e2e/right-now-transitions.spec.ts` (scaffolded as `test.fixme()` …)"                  |

**Ground truth, probed 2026-08-03 — recorded so no future pass re-derives it:**

```
$ grep -n 'describe.skip' tests/e2e/right-now-transitions.spec.ts
154:  RightNow §8.2 — 66-pair pairwise transition audit
291:  RightNow §8.2 — 6 compound transition audits
$ grep -c 'CAPABILITY_TRANSITION_MATRIX|affectedTilesOnFlip|FinancialsTile|AudioScopeTile' tests/e2e/right-now-transitions.spec.ts
0
$ grep -n 'describe.skip|test.describe(' tests/e2e/transport-tile.spec.ts
225:  crew page — TransportTile (Task 4.7, §8.1)     [the file's ONLY describe]
$ grep -c 'AnimatePresence|animation|transition|opacity' tests/e2e/transport-tile.spec.ts
0
$ grep -rl 'describe.skip' tests/e2e/ | wc -l
12
```

**One blocker explains all of it:** the `?crew=`/`?as=admin` dev mock was retired, and each case renders as a specific non-LEAD crew identity that `signInAs` cannot reproduce without per-test crew rows matching `NON_ADMIN_CREW_FIXTURE` plus per-test fixture seeding (`tests/e2e/right-now-transitions.spec.ts:285-290`). Several claims are stale a SECOND way: they attribute non-execution to `test.fixme` pending `framer-motion`, a blocker that no longer applies.

**Two sites are already honest and must NOT be "fixed":** `tests/visibility/capabilityTransitions.test.ts:224` says the gap is deferred pending Realtime push (M6); `:272` is future-tense about the same thing.

**The methodological finding — this row's most valuable content.** Three hand-run sweeps under-counted this class (2 → 4 → 9 → 12), and each failure was a PATTERN failure, not an effort failure:

- Sweeping `e2e|E2E` misses claims phrased "the audit suite", "the compound tests", "the helper covers" — no token in common.
- Scoping the sweep to files the branch already had reason to open missed `tests/time/rightNowTransitions.test.ts` entirely.

So the fix shape is **not** "grep harder". It is: enumerate every `describe.skip` / `test.fixme` / `test.skip` suite mechanically, resolve which modules and tests cite each one, and check the citing prose — **or** decide that prose coverage claims are unguardable and delete the class of sentence rather than maintain it. That decision is this row's open question and is a design call.

**Why it was descoped rather than fixed:** it is a different class from the one `BL-LEAD-CAPABILITY-PROSE-STALE` filed (now in `BACKLOG-archive.md`) (restatements of whether a test EXECUTES, not of what a predicate COMPUTES), its extent is unmeasured, and bundling it into a branch chartered to settle two named claims drove three BLOCKING review rounds. Full reasoning: `docs/superpowers/specs/2026-08-03-lead-capability-prose-settle-design.md` §1.2 and §2.7.

## BL-WARNING-SCAN-SCOPE-HAS-NO-ANCHOR — the recognizer signals unresolvable sites, but a narrowed scan scope drops codes with nothing to signal

**Filed:** 2026-08-03 (from a duplicate implementation of `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`, abandoned once `chore/scanner-precision-cluster` merged first; this is the one finding of that run not already covered). **Class:** guard completeness. **Effort:** S.

`scanParseWarningSites` is fail-closed for sites it VISITS: a construction whose code the checker cannot resolve is signalled rather than dropped (`lib/messages/__internal__/parseWarningSites.ts`). The scope it visits is a different question. `inWarningScanRoots` (`scripts/extract-internal-code-enums.ts:42-49`) is a hand-written predicate — `^(lib|app)/`, minus `lib/dev/`, the generated dir, and `catalog.ts` — and **a file the predicate never admits produces no site, so there is nothing to signal.** Narrow the predicate, or land an emitter outside `lib/`|`app/`, and the universe shrinks silently while every existing assertion stays green.

Probed on the abandoned branch, against an equivalent recognizer: excluding one contributing file dropped the code set 57 → 51 while `unresolved` stayed empty; tightening a pre-filter _within_ files dropped 22 of 57 codes with the contributing-FILE set unchanged, which is why a file-list anchor does not close it either. Twelve root-level source files sit outside `^(lib|app)/` today, including the live Next.js entry point `instrumentation.ts`.

**Work:** give the scan an anchor independent of its own output — a committed golden snapshot of the code set, compared by equality, so a narrowing fails loud in both directions and its diff is the review artifact. The trade is explicit: a hand-maintained list, justified not by size but by failure mode (it cannot rot silently the way the deleted `EXTRA_WARNING_CODES` residue could). Alternatively `BL-CATALOG-PARTITION-WARNING-CLASS`, already filed as the closure for the related soundness question, may subsume this — check it first, and close this as duplicate if it does.

**Status:** OPEN.

---

## BL-FRESHNESS-ABORTED-CLOSE-E2E — the freshness cue's clear-on-hide branch has no behavioural proof

**Filed:** 2026-08-03 (round-3 cross-model review of `feat/modal-freshness-cue`) · **Class:** test coverage · **Effort:** S (one e2e case on an existing spec) · **Severity:** low

`PublishedReviewModal`'s clear-on-hide branch fires when the published review modal is HIDDEN without unmounting — an aborted close, where the shell animates out but the component holding the freshness state stays mounted. Without it a live cue survives the hide and resumes on reopen with whatever was left of its 1600ms timer.

The branch is guarded structurally by `S19` in `tests/components/admin/showpage/publishedModalFreshnessCue.test.tsx`, which asserts the WIRING only. It cannot be driven from jsdom: the close runs through the shell's animated exit, which never completes there, and with `?show` still committed the aborted-close self-heal un-hides during the very render that hid the surface, so no commit observes `closing` as true. Both were verified rather than assumed — a click-driven version of that row sat at "still armed" against a render-phase implementation AND a commit-phase one.

S19's comment used to claim a behavioural twin lived in the realtime e2e. Round-3 review probed for it: no test under `tests/e2e` combines an aborted close with `data-section-freshness-flash`, and the freshness e2e coverage there is geometry and broadcast attribution. The claim has been removed from the comment; this row is the honest replacement.

**What would close it:** one case on `tests/e2e/published-review-modal.realtime.spec.ts` that arms a cue, begins a close, aborts it inside the flash window, and asserts no card carries the attribute on reopen. A real browser can drive the animated exit that jsdom cannot.

## BL-FRESHNESS-PROJECTION-NARROWING — seven freshness projections hash a wider model than their renderer paints, so they can over-cue

**Filed:** 2026-08-03 (class-sweep triggered by the whole-diff review of `feat/modal-freshness-cue`) · **Class:** correctness (cosmetic) · **Effort:** M (seven independent projections, each needing its own probe) · **Severity:** low

`components/admin/review/sectionFreshness.ts` holds one contract: the signature reads what the RENDERER reads. The whole-diff review found two violations where the detector read NARROWER than the renderer, which is the severe direction — content changes on screen and no cue fires. Both are fixed (the diagrams `{current,pending}` unwrap; the agenda projection), as are the two further missed-cue instances the follow-up class-sweep turned up (the uncapped `roomHasScope` rail count; the strike/load-out entry cap exemption).

The sweep also found seven places where the detector reads WIDER than the renderer. Each is over-cue only — the renderer collapses or drops something the detector already hashes, so the worst case is a card that flashes without a visible change, never a change that fails to flash:

- **venue** — `googleLink` is gated through `isParseableUrl` before it reaches `VenueMapTile` (`step3ReviewSections.tsx:1253`); an unparseable-to-unparseable edit paints nothing.
- **event** — `opening_reel` is painted as `stripOpeningReelText(text).trim()` (`:2224`).
- **crew** — `date_restriction` is painted through `partialAttendanceLabel(..., { humanize: false })` (`:1682`), which collapses `kind:"none"`, ignores `days` for `unknown_asterisk`, and drops blank days.
- **contacts** — `contactBlocks` drops any block with no name and no content rows (`:1155`), so an all-blank contact row moves the hash and nothing else.
- **hotels** — names run through `.filter(hasContent)` and the dates through `formatIsoDate` (`:2726-2728`).
- **transport** — inside a surviving leg, `assigned_names` is filtered by `hasContent` and date+time are joined into one `when` string (`:1351-1354`).
- **packlist** — `packItemLabel` erases `TBD`/`N/A`/`TBA` from `cat`/`subCat` via `shouldHideGenericOptional` (`:2379-2380`).

**Why backlog, not land-now:** each fix is an independent projection rewrite, and this project's finding-admissibility rule says a recognizer is not tightened without a probe demonstrating the corruption it prevents. Seven unprobed tightenings landed at merge time is precisely how a projection drifts from its renderer — the same failure this row documents. The severity asymmetry sets the ordering: a missed cue breaks the feature silently and was fixed immediately; an extra flash is visible, self-explaining, and costs nothing to leave.

**What would close it:** per projection, a probe that renders the section with and without the candidate edit, asserts the HTML is byte-identical, then a `D`-row in `tests/components/admin/review/sectionFreshness.test.ts` asserting no cue. Import the shipped predicate rather than re-typing it — every instance above is a re-typed derivation waiting to happen. One further sweep claim, that the schedule day domain misses the `aggregateDays` bookends, was REFUTED by probe: `pick(d.dates, DATE_KEYS)` already covers them and `D20` pins it. Do not re-raise it.

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

## BL-CATALOG-PARTITION-WARNING-CLASS — the warning universe is inferred by a scanner, not enumerated by the catalog

**Status:** OPEN · **Class:** registry completeness · **Effort:** M · **Filed:** 2026-08-03 (`chore/scanner-precision-cluster`, spec §3.5a)

`MESSAGE_CATALOG` (`lib/messages/catalog.ts:62`) lists every §12.4 code but carries no field saying
which are parse-warnings, so the attention-scenario gallery infers the warning universe by scanning
source for ParseWarning constructions. `lib/dev/attentionScenarios/tier1.ts:117-121` records the gap
verbatim: "MESSAGE_CATALOG holds all of them but carries no field to partition on."

Inference has a hard ceiling, established by five adversarial rounds on `chore/scanner-precision-cluster`.
The shipped recognizer is type-aware, fail-closed, and capture-linked, and it is still **blind by
construction** to a code whose provenance passes through `any`/`unknown` or that reaches its factory
only by higher-order application (`["X"].map(make)`) — tracing that is undecidable, not unimplemented.
Zero such constructions exist today; the limit is documented in that spec's §3.5a.

- `BL-MUTATION-REF-SUB`, `BL-MUTATION-UNICODE`, `BL-MUTATION-COLUMN-SHIFT`, `BL-MUTATION-MERGED-CELL`, `BL-MUTATION-SECTION-ORDER` — the five operator classes enumerated by `BL-MUTATION-HARNESS-OPEN-HOLES` above, which states outright that "each is tracked as a backlog sub-item below". They are also the `finding` tags on thousands of rows in `tests/parser/mutation/knownHoles.ts`, where they identify a hole CLASS, not an item. The parent owns the shrink-only ratchet that gives them their meaning: hardening a class turns its holes into `staleRows` and fails the nightly harness until they are removed. Split across five headings, that ratchet has no single home.
- `BL-SYNCFEED-UI-1`, `BL-SYNCFEED-UI-2`, `BL-SYNCFEED-UI-3` — the three LOW / no-user-harm findings enumerated by `BL-SYNC-FEED-UI-POLISH`, which graduated to `BACKLOG-archive.md` on 2026-08-03 and took its body bullets with it (they resolve there, by the same body-bullet rule this entry describes), each a one-sentence "only act if" note from one impeccable dual-gate that PASSED. Their shared provenance and shared "no concrete trigger" disposition is the entry; individually they are not items.

**Work:** add a partition field (e.g. `class: "parse_warning" | ...`) to the catalog row shape,
backfill it, and invert the dependency — the gallery reads the catalog, and the source scanner
becomes a CROSS-CHECK that fails when a constructed code is absent from the catalog or vice versa.
That makes the universe enumerated rather than inferred, and turns the undecidable question into a
registry lookup.

**Cost:** a §12.4 catalog row-shape change, so it carries the three-way lockstep (master spec §12.4
prose, `pnpm gen:spec-codes`, `lib/messages/catalog.ts`) plus the x1 catalog-parity gate.

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

**Reachability:** INFERRED, NOT PROBED — the probe that settles it: run the `parallel` project once with the DB port closed and once with a DB present, and diff the PER-FILE assertion counts. A file whose count drops without a skip is the shape the entry describes. That probe, not the audit, is the first scheduled step.

screen-disposition 2026-08-04: ANNOTATE-INFERRED, stays open. The entry names no instance, and the escape hatch it needs is the one the filing bar prescribes. Static facts re-verified 2026-08-04: the job is `.github/workflows/unit-suite.yml:135-136` (3 legs, `--project=parallel`, boots nothing), rolled up at `:177-187`, over `PARALLEL_TEST_GLOBS` at `vitest.projects.ts:94-140`. **Count corrected:** the body's "~691 current parallel-project files" is stale — the same globs now resolve 875 `.test.ts(x)` files, which makes the unmeasured surface ~27% larger than the row claims, not smaller.

## BL-CI-RECLASSIFY-PARALLEL-STABILITY — revive the serial→parallel reclassification only with a concurrency-stability + clean-wall proof

**Filed:** 2026-07-20 (arc SHELVED). **Class:** CI perf. **Effort:** L (structural stability + multi-run measurement).

The DB-free serial→parallel reclassification (PR #528, closed unmerged) is correctness-verified but was shelved: moving ~527 files into the parallel project raises per-shard concurrency, and timing-sensitive moved files (e.g. `tests/admin/_metaInfraContract.test.ts`) starve past the 5s test timeout under CI load — candidate CI run 1 green, run 2 red on identical code. A required gate cannot flake, and the class is load-dependent (not fully enumerable up front). The wall-clock win was also unproven (~17s in contention-noisy samples, under the spec's 30s gate). Seventh lever this program has rejected on the local-passes-CI-fails pattern.

**Reusable asset:** the DB-touch probe + static `DB_BINDING_SIGNALS` matcher (branches `spike/db-touch-instrumentation`, `perf/ci-reclassify-db-free-serial`). Retrospective: `docs/superpowers/specs/ci/2026-07-20-serial-parallel-reclassification-retrospective.md`.

**Do NOT re-attempt the move without, in this order:** (1) solve criterion-3 at CI scale structurally — cap the parallel project's per-leg worker concurrency (`poolOptions.maxWorkers`) or raise the parallel `testTimeout` — and prove stability across ≥5 consecutive green CI runs; (2) demonstrate a clean ≥30s wall win with sequential, non-contending measurements (one CI run at a time). Absent both, the correctness tooling can stand alone (e.g. a nightly DB-drift audit) without the move.

**Status:** open (shelved).

---

## BL-REALTIME-BROADCAST-FRAME-DROP-WATCH — ~9% local broadcast-frame loss on a healthy socket

**Filed:** 2026-07-24 (retroactive — recorded in PR #505's residuals 2026-07-20, never filed) · **Class:** observability watch item · **Effort:** S (read CI history) to M (if real)

PR #505 measured local realtime silently dropping ~9% of broadcast frames on an otherwise healthy socket; absorbed by CI runner retries and explicitly NOT a code defect of that diff. Filed as a watch item so the observation is not lost: if the drop rate is an artifact of the local stack it should disappear against validation/prod, and if it does not, subscriber code that assumes every broadcast arrives needs a reconcile-on-focus fallback.

**Work:** sample the realtime-dependent e2e/CI history for retry frequency before deciding whether there is anything to fix.

**Status:** open (watch).

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

screen-disposition 2026-08-04: KEEP — probe-adjacent evidence already in the tree, and the worst case is not conservative. The race is asserted by the production code itself at `app/api/admin/onboarding/finalize-cas/route.ts:860-862` ("A subscriber that inserts AFTER promotion commits is not covered — closing that needs serialization this surface deliberately does not have"), the same-transaction supersede it races is at `:863-869`, and the isolation premise is stated verbatim at `lib/drive/watch.ts:1070-1072` ("`sql.begin` runs at READ COMMITTED, where each statement takes its own"). `activatePending` (`lib/drive/watch.ts:253-283`) takes no `for update`, no advisory lock and no isolation override. The outcome is a stale `active` channel delivering webhooks for an unwatched folder for up to 24h — a wrong live state, not a refusal, so it is not a documented-limit candidate.

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

**Status:** IN PROGRESS · **Branch:** chore/backlog-convergence

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

### BL-TASKCONTRACT-SORT-COMPARATOR-EQUALKEY — finding-order comparator is unpinnable for equal `(docLine, code)` pairs

**Status:** OPEN (2026-08-04, `feat/mutation-gate-guard-surfaces`) · **Severity:** low · **Class:** TEST COVERAGE · **Effort:** S

Two source mutants of the `findings.sort(...)` comparator at `lib/specLint/taskContract.ts:247` survive the suite and cannot be killed through the function's output: `a.code > b.code` → `>=` and the final `: 0` → `: 1`. Both are reached only when `a.docLine - b.docLine` is `0`, and each differs from clean behavior only when the two `code` values are ALSO equal — for unequal codes both take an identical path.

Such a pair is reachable: `ac=AC-90,AC-91` with both ids unresolved emits two `TASK_AC_UNRESOLVED` findings on one line, sharing `(docLine, code)` and differing only in `message`. Probed against the real `checkTaskContract` on `node v20.20.1` — clean `AC-90,AC-91`; `>=` mutant `AC-90,AC-91`; `: 0`→`: 1` mutant `AC-90,AC-91`. Neither reorders.

A **third** mutant of the same comparator, `a.code < b.code` → `<=`, was originally filed here and does NOT belong: it reverses the pair to `AC-91,AC-90`, so it is killable and was repaid by test in the same arc. It was misfiled because the first probe sorted elements identical in every field, a fixture that cannot express a reversal and therefore reported "no difference" for a mutant that plainly reorders real findings. That trap is recorded as documented limit **L-8** of `docs/superpowers/specs/ci/2026-08-04-source-mutation-guard-gate.md`.

The two survivors are ledgered `accepted-gap` (not `equivalent`) in the source-mutation registry and counted as survivors, costing ~2.4 points of that surface's mutation score. `equivalent` would overclaim: an inconsistent comparator is implementation-defined in ECMA-262, so the argument rests on V8's stable sort rather than on control flow — documented limit **L-7** of the same spec.

**Closing this** means making the comparator total so no equal-key pair exists — add a third tiebreak (e.g. `message`), after which both mutants become killable and their ledger rows go stale, which the gate reports rather than absorbs.

**Deferred from `feat/mutation-gate-guard-surfaces` under class-sweep exception (a) — it needs a product decision this PR cannot settle.** Ordering for same-line, same-code findings is `spec:lint`'s user-visible report contract; that arc ships a mutation harness plus test debt and touches no `taskContract.ts` product code. The sweep itself was complete — all three comparator sites were found and classified together, one repaid and two ledgered — so this entry covers every remaining instance of the class, not one peer of several.

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

screen-disposition 2026-08-04: KEEP — PROBED, and the mislabeling is deterministic rather than hypothetical. Verified 2026-08-04: `PrepareOnboardingFileError.kind` is the two-member union `"drive_fetch" | "parse"` at `lib/sync/runOnboardingScan.ts:1164-1172` (repeated in `asPrepareError` at `:1177`), there is no `"internal"` anywhere under `lib/sync/`, and the doc comment at `:1154` states outright that `drive_fetch` is "everything else, deliberately including the post-parse" helpers. All four helpers the entry names exist and are reachable: `applyRoleTokenMappings` (`lib/sync/roleMappingOverlay.ts:62`), `reconcileIncludedTab` (`lib/sync/pullSheetOverride.ts:157`), `discardAndRerun` (`:199`), `finalizeArchivedTabs` (`:229`). A precedent for the operator-facing code already exists at `lib/messages/catalog.ts:812` (`ONBOARDING_FINALIZE_INTERNAL_ERROR`). Every one of those faults reports today as a Drive failure.

## Crew-page share-link chrome (2026-07-14, share-link-instant-rotate-dedup)

## Share hub follow-ups (2026-07-25, share-link-chrome-backlog)

## BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS — one component retained by contract; the other four retired

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

### BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED — one clip-fit anchor still has no real-surface number

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

---

## BL-AUTH-INTERSTITIAL-FONT — four hand-built HTML auth responses mount no React root, so they miss the app font

**Filed:** 2026-08-03 (`feat/font-binding-modal-freshness-cue`, adversarial review R5). **Class:** consistency / completeness. **Effort:** S–M depending on the approach chosen.

Four route handlers build and return a complete `<html>` document as a string, so neither Next root renders them and neither the font loader's generated class nor the app stylesheet reaches them: `app/api/auth/google/start/route.ts`, `app/api/auth/picker-bootstrap/route.ts`, `app/auth/callback/route.ts`, and `app/auth/sign-out/route.ts` — the last of which explicitly sets `system-ui, sans-serif` in its own inline style.

**What they are.** Persistent ERROR documents with readable copy and no automatic redirect: a 503 from the Google-auth start, 403/502 from the picker bootstrap, a 503 from the auth callback, and a 500 from sign-out carrying explanatory copy and a retry button. A user who lands on one reads it. (An earlier filing called them transient bounces; review R6 corrected that, and the correction matters — the disposition below rests on the accurate reading.)

**Why it was not fixed with the font binding.** Sign-out's explicit `system-ui, sans-serif` rests on one narrow, checkable fact: it is a self-contained document that requests **zero external assets** (it inlines its own `<style>` block — it is NOT styleless, a claim review R8 disproved). A webfont would add its first network dependency, on a page reached because a request already failed. This is NOT a general "error pages should avoid webfonts" principle, which would contradict the app's own fatal-error page, where the font IS bound. The real gap is the other three, which fall to browser defaults: a serif nobody chose. Covering them means either inlining an `@font-face` into each hand-built document, which is a SECOND font-delivery mechanism (the same objection that keeps `BL-HARNESS-FONT-FIDELITY` open), or routing them through React, which is a far larger change to auth plumbing than a font justifies. Recorded as a documented limit rather than left as an implied-but-false "app-wide" claim.

**Work:** the three pages that fall to browser-default serif are the real gap — the Google-auth start, the picker bootstrap and the auth callback. Sign-out already carries an explicit system stack and is the LEAST urgent of the four, not the most. Worth pairing with any future pass over the auth interstitials rather than doing on its own.

---

screen-disposition 2026-08-04: KEEP — and the entry's own dichotomy is REFUTED by a precedent already in the tree. The body argues both directions are bad ("either inlining an `@font-face` into each hand-built document, which is a SECOND font-delivery mechanism … or routing them through React"), but `app/auth/sign-out/route.ts:33` already takes a THIRD: an inline `body{font:16px/1.5 system-ui,sans-serif;…}` — a stack DECLARATION, not a delivery mechanism, with zero external assets and no React. Probed 2026-08-04: the other three documents (`app/api/auth/google/start/route.ts:24-37`, `app/api/auth/picker-bootstrap/route.ts:38-48`, `app/auth/callback/route.ts:49-62`) carry charset/title/viewport and nothing else, so they fall to browser-default serif while their sibling does not. Closing on `feat/sweep-ui-a11y` by extending the sign-out precedent to the other three; `app/auth/**` is an invariant-8 UI surface, which is why it lands on the dual-gate branch.

## BL-HARNESS-FONT-FIDELITY — the 31 standalone harnesses measure a different font than the product renders

**Status:** OPEN.

**Filed:** 2026-08-03 (`feat/font-binding-modal-freshness-cue`, the successor residual of `BL-HEADER-FONT-FALLBACK-WRAP`). **Class:** test fidelity / CI determinism. **Effort:** M.
The 31 standalone e2e harnesses route through `compileEntryCss` (`tests/e2e/helpers/liveEntryToolchain.ts:124-141`), which runs the Tailwind CLI over `app/globals.css` and serves the result as a static file beside harness-rendered markup. There is no Next.js runtime, so no `next/font` `@font-face` — they resolve `--font-sans`'s literal fallback pair and land on the ambient host font (SF Pro locally, DejaVu Sans on the Ubuntu runner). The product now renders Inter on every React-root surface; the harnesses measure something the product never shows.
**Cost today is zero**, which is why this is backlog and not deferred: CI is green, and the one measurement that was font-sensitive carries a deliberate Arial / Liberation Sans metric-compatible pin with its reason inline (`tests/e2e/section-header-layout.layout.spec.ts:165-183`). Widening that tolerance is refused — it hides the finding.
**Work:** give `compileEntryCss` a font asset to emit alongside the stylesheet it already writes, and an `@font-face` to match. It is a single choke point, so all 31 harnesses gain fidelity at once. The tradeoff to decide first: that is a SECOND font-delivery mechanism alongside `next/font`, and two sources for one family can drift. The alternative — self-hosting the face and having both the app and the harnesses read it — is a larger change that would supersede `DESIGN.md` §2.1's ratified `next/font` mechanism, so it needs a spec, not a patch.

---
