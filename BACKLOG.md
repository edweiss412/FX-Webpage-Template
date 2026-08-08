# BACKLOG

Speculative / lower-priority hardening items. "Might do" — not blocking, no concrete near-term trigger. (Contrast `DEFERRED.md`: "will do, concrete trigger".)

**This file is the OPEN queue only.** Resolved / shipped / superseded entries live in **[BACKLOG-archive.md](./BACKLOG-archive.md)** with full provenance — grep by id, ids are unchanged. When an item below ships, move its whole entry there rather than annotating it resolved in place; otherwise this queue silently turns into a changelog.

Last reconciled: 2026-08-04 — `feat/harness-font-fidelity` (PR #705) graduated `BL-HARNESS-FONT-FIDELITY`: the face is declared once in `app/fonts.css` over the committed binary and read by BOTH Next roots AND by `compileEntryCss`, so the 32 standalone harnesses render what the product renders instead of the ambient host font. The entry's own count of 31 was right when filed and is 32 as shipped — the browser guard this work added is itself a caller, found by the fail-by-default wiring meta-test rather than by anyone remembering. The spec it asked for was written and its central premise EXPIRED before implementation: drafted against `next/font/google` with seven Google v20 subsets, while `main` had already moved to `next/font/local` over an upstream v4.1 subset, so shipping §3.3 verbatim would have stripped `ss04`/`zero`/`opsz` and reverted `BL-INTER-NUMERAL-DISAMBIGUATION`. User-ratified 2026-08-04 to one face over the existing bytes, with the stale sections marked SUPERSEDED in place because `consistency.mjs` cross-checks the document's own counts. Four claims were overturned by measurement rather than argument and each is corrected where it was wrong: the mutation matrix found the guard never compared the fallback's override VALUES; CI found a Linux/macOS rasterization gap (hinted 132px vs geometric 130.09375px) root-caused in the pinned container rather than papered over with a wider tolerance; the impeccable critique found a rationale written into five surfaces that this branch's own post-step had invalidated; and the audit found the binary had lost its one-year immutable cache on the move out of `.next/static/media/`, now restored by a content-hashed filename plus a `next.config.ts` header. Prior: 2026-08-04 — `fix/apply-undo-audit-fidelity` (PR #697, merge `644f8bb06`) graduated `BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP`, `BL-IDENTITYLINK-LANDED-VS-REQUESTED` and `BL-UNDO-SELECTIONS-RESET-AT-DROP`. The notice and feed now derive from rename pairs that actually LANDED, with unlanded ones recorded as a durable `IDENTITY_LINK_RENAME_UNLANDED` event — and that row's own premise was partly wrong: the feed never consumed the requested `identityLinkRenames` at all, it re-derived its own pairs from `triggeredItems` with NO accept gate, a wider defect than the row described. The notice needed a two-arm split rather than a swap, because feeding landed pairs to arm (c) as well would have fired a FALSE capability-loss notice for every pair whose source row survived; arm (c) now suppresses a loss only when the source SURVIVED, which also surfaces a real loss the old suppression hid. The roleFlagsNotice row named ONE discard site and the class sweep found FOUR (finalize-cas, ordinary finalize, `runManualStageForFirstSeen`, and the pending-ingestion retry, which bypasses the locked wrapper's post-commit tail entirely), all repaired through one shared `lib/sync/emitRoleFlagsNotice.ts` and flushed in a `finally` after the outer transaction at three sites — including the STREAMING finalize-cas handler, the one real operator traffic reaches; the structural guard against a fifth is DESCOPED and refiled as `BL-ROLEFLAGSNOTICE-DROP-GUARD`. `selections_reset_at` survives an undo, the real fix being to capture the successor's marker BEFORE the delete — the common rename path takes the clean-INSERT branch, so a merge living only in `ON CONFLICT` would never have run — with `mi11_approve_hold` repaired as a second producer dropping the column at two sites, and two historical shapes left unrescuable as documented limits. The same branch filed `BL-CAPABILITY-LOSS-SURVIVING-ROW-FALSE-POSITIVE`, `BL-SHADOW-REBUILD-EXHAUSTED-EMIT-PLACEMENT` and `BL-CODE-ENUM-PROVENANCE-COMMENT-BLIND`. Prior: 2026-08-03 — `feat/inter-numeral-disambiguation` graduated `BL-INTER-NUMERAL-DISAMBIGUATION` by changing the FONT rather than the CSS: the row's premise was false. Probed live before drafting — the Inter build Google Fonts serves has the character variants stripped (`calt ccmp dnom frac kern locl mark mkmk numr pnum tnum`, `wght` axis only), so the requested `"zero" 1, "cv05" 1` would have rendered nothing, exactly as the `"cv11" 1` beside it had been rendering nothing since `78662acb5` (2026-05-03). Two defects in the row itself besides: `cv05` never touches capital `I`, and `ss04` is Inter's own disambiguation set covering both letterforms. Shipped a latin + latin-ext SUBSET of the upstream v4.1 release (173 KB, built by `scripts/subset-inter.sh` from a checksum-pinned input, OFL alongside) via `next/font/local` — verbatim at 344 KB was the gate decision until the impeccable audit measured it costing FCP +136-164ms and a fallback-to-Inter swap landing 3.7s in on slow 4G. `ss04` at `html`, `ss04`/`tnum` on the tabular rule, and `zero` on a NARROWER `.code-value` class, because `.tabular-nums` turned out to sit on whole prose sentences including the Right Now hero's 30px bold h2. `ss04` is REPEATED on each rule because `font-feature-settings` inherits as a whole value, not a merged list. Fourteen false claims corrected across `DESIGN.md`, the font-binding spec and plan, and eight source comments, including that plan's own P3 disposition claiming the binding "deterministically activates Inter's alternates … for the first time" (it activated nothing). New guard `tests/styles/fontFeatureAvailability.test.ts` derives the font path from `app/fonts.ts` and fails the build on any tag the loaded binary cannot honor, with a regression proof against the committed Google binary; in the browser `zero` needs a PIXEL oracle because `zero` and `zero.slash` share an xAdvance of 1292, so no width assertion can ever see it. Cross-model spec review round 1 returned BLOCKING with 7 findings, five confirmed by probe and all repaired. Prior: 2026-08-03 — `feat/needs-attention-holds-rollup` graduated `BL-NEEDS-ATTENTION-HOLDS-ROLLUP` (the cross-show open-holds read plus the fourth needs-attention stream across page, inbox, badge, mobile chip, and digest; spec `docs/superpowers/specs/2026-08-03-needs-attention-holds-rollup-design.md`, plan `docs/superpowers/plans/2026-08-03-needs-attention-holds-rollup.md`). Prior: 2026-08-03 — `feat/sync-feed-undo-announce` graduated `BL-SYNC-FEED-UI-POLISH` and all three children. `BL-SYNCFEED-UI-1` shipped, with its own premise corrected: the note's proposed in-button `aria-live` region cannot work, because a successful undo flips the row out of `status='applied'` and unmounts the button before assistive technology reads anything. Six adversarial rounds then refuted every surface-level owner in turn (the group empties, the strip returns null, the dashboard returns a different tree, the feed is swapped for its error rendering), and the vector was settled by an executable spike rather than a seventh prose argument. The channel lives in `AdminAnnounceProvider`, mounted by the admin layout AND by `ReviewModalShell` — a modal needs its own, since content outside an `aria-modal` dialog is excluded from the accessibility tree. `BL-SYNCFEED-UI-3` graduated as already-shipped (fixture corrected at `c3920fe6a`); `BL-SYNCFEED-UI-2` ratified as untriggered with its re-open trigger preserved. The same work fixed a class defect the sweep found: all three feed action buttons rendered their failure card by conditional mount, so failures were silent to AT too. Filed `BL-FEED-BUTTON-SUCCESS-ANNOUNCE`, `BL-BULK-UNDO-ANNOUNCE-UNMOUNT`, and `BL-ANNOUNCE-REGION-UNMOUNT-CLASS`. Prior: 2026-08-03 — `feat/modal-freshness-cue` graduated `BL-MODAL-REALTIME-UPDATED-CUE` as SHIPPED: the published review modal now flashes the panel card of every registry section whose CONTENT changed across a realtime-driven reconcile, plus an sr-only announcement from the same detector, so a swap under the reader is attributable instead of silent. The entry's premise was wrong and is corrected in the archive: the 2026-07-19 realtime spec ratified that the BRIDGE renders `null`, never that the surface it refreshes must stay silent, so this was a new design decision rather than a reversal. The user chose flash-then-fade directly. Two adversarial rounds (the second split in half) returned BLOCKING and were repaired: the projection missed routed warnings, routed use-raw state, section anchors and attention items, and separately OVER-hashed the warnings panel and non-rendered decision fields; the mount baseline lived in a ref that abandoned renders consumed; and an aborted close hides the shell without unmounting the state owner. Prior: 2026-08-03 — `chore/scanner-precision-cluster` graduated `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN` and `BL-LEDGER-GUARD-BODY-DEFINED-IDS`, the two entries whose shared shape is a static scanner opening too small a set of files while a hand-maintained residue covers the gap. Both residues had already rotted: the enum's four-code list held one code that was long since absorbed while ELEVEN real §12.4 codes were dark, and the ledger guard's eight `KNOWN_DANGLING` rows were never debt at all. The scan is now type-aware and fail-closed (58 codes, 0 unresolved, 44 capture-linked skips) after six adversarial rounds established that every syntactic mechanism — root widening, type-stripping, written-return-type matching — is defeated by a spelling; the ledger guard now resolves body-defined sub-item ids under three corpus-measured conditions. One documented limit is fenced rather than overclaimed and filed as `BL-CATALOG-PARTITION-WARNING-CLASS`: provenance through `any` is undecidable, so the real closure is an enumerated catalog, not a better scanner. Prior: 2026-08-03 — `feat/font-binding-modal-freshness-cue` graduated `BL-HEADER-FONT-FALLBACK-WRAP`: the browser check it asked for refuted its own stated doubt (Next 16 registers the literal family name, so the crew import DID bind) and surfaced a wider finding — the product rendered two type families across its trees while `DESIGN.md` §2.1 commits to one, because the loader had never been wired at the root. Shipped as one shared loader instance in `app/fonts.ts` imported by BOTH Next roots (the crash screen replaces the root layout, so it was otherwise left behind), with `--font-sans` binding next/font's metric-matched fallback face so the swap window stops reflowing ~10%. Filed `BL-HARNESS-FONT-FIDELITY` (the 31 standalone harnesses have no Next runtime and keep measuring the ambient host font — zero cost today, needs a spec not a patch) and `BL-INTER-NUMERAL-DISAMBIGUATION` (impeccable P3). Prior: 2026-08-03 — `chore/orphan-components-lead-prose` settled the two entries the copy/dead-code sweep left behind. `BL-LEAD-CAPABILITY-PROSE-STALE` graduated: both prose claims turned out STALE rather than intentional — the `capabilityTransitions` line is a verbatim quote that stopped being verbatim at `e348c81ca`, and MI-9's "admin/ops" clause was inherited from §12.4 copy strings whose every other instance had already been retired or corrected. A third instance the literal sweep could not see (`lib/sync/phase2.ts`, a semantic variant in production source) was corrected with them, and two guards shipped in the same commits: `capabilityHeaderParity` extracts the expected flag set from `scopeTiles.ts` source, and `capabilityClaimProse` scans the MI-9 rows AND every `.ts`/`.tsx` under `app`/`components`/`lib` with a positive-claim recognizer. `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS` was AMENDED, not archived: four components retired (each with a named superseding commit and live successor; `RightNowCard`'s two regression suites were retargeted onto `RightNowHero` and each proven by mutation before the deletion), and `WrappedTile` stays as a DECIDED retention — deleting it would orphan `TileErrorBoundary` and `TileServerFallback` rather than shrink the ledger, and the orphan guard now asserts its reason says so. Filed `BL-CAPABILITY-MATRIX-FINANCIALS-PREDICATE` (the matrix models five predicates, the code has six) and `BL-BELLPANEL-DISMISS-COMMENT-DRIFT` (six comments name a label the panel stopped rendering). New guard `tests/docs/retiredIdentifierReferences.test.ts` walks every tracked file for references to what was retired, keyed by LINE CONTENT with reasoned exemptions — three adversarial rounds each found references a hand-curated census had missed, so the census is now a walk. Prior: 2026-08-03 — `docs/close-v1-override-wont-build` graduated `BL-VERSION-AMBIGUOUS-V1-OVERRIDE` as RESOLVED — WON'T BUILD: no admin force-classify override gets built, now or trigger-gated. The row's premise was false as stated. `v1` is a fallback bucket, not a confirmed legacy template (`lib/parser/schema.ts:37`; the registry entry at `lib/parser/schema.ts:53` carries no `requires` array, so nothing positively identifies a v1 sheet), and its "a genuine legacy-v1 sheet has neither resolution" conflated _no markers registered today_ with _no registrable structure_ — a real legacy sheet, once actually seen, is indistinguishable from a genuinely-new template, and the gate spec's §7.1 resolution #2 (developer registers the markers) is not limited to new templates. Probed: all 10 committed fixtures classify confidently (6× v2 at 7/0, 4× v4 at 8/0), zero ambiguous, zero v1. The override would convert a signaled failure into a silent one, inverting the preparedness-audit posture, and it serves none of the four indistinguishable bucket occupants better than their existing disposition. Re-open trigger recorded in the archive entry, conjunctive: a real legacy sheet surfaces AND marker registration proves impossible. **Current state after this and the same-day `docs/graduate-bl-unpublish-to-held` graduation: six of the eight rows the 2026-08-02 segment below enumerates remain open** (`BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`, `BL-HEADER-REACT-RECONCILE-HARNESS`, `BL-PG-CRON-HOST-ASSERTION`, `BL-NEEDS-ATTENTION-HOLDS-ROLLUP`, `BL-RESYNC-STAGED-REVIEW-UI`, `BL-STEP3-FULL-CREW-PREVIEW`); that segment's own "Eight open rows here" count is left as written, because it describes the state at the 2026-08-02 reconciliation and demoting it behind `Prior:` is what marks it as history. Prior: 2026-08-03 — `docs/graduate-bl-unpublish-to-held` graduated `BL-UNPUBLISH-TO-HELD` as already-shipped: the 2026-07-01 published toggle (`unpublish_show` RPC in `supabase/migrations/20260701000000_published_toggle_unpublish_show.sql`, driven by `setShowPublishedAction(slug, false)` from the admin show review modal, commit 945bd4ef0) is exactly the published→Held inverse the row asked for — the row's 2026-08-02 "Verified: no such RPC exists" was a false verification, and its premise that the M12.13 token-unpublish archives was stale too (both unpublish paths are pure `published=false`). A 10-point audit of the shipped surface before graduating found no functional gap and one gate-scope finding, filed as `BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED` (the validation-schema-parity gate covers tables×columns only, never functions — no current drift, probed live). Prior: 2026-08-02 — `chore/copy-deadcode-sweep` graduated three copy-and-dead-code entries (`BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT`: the §12.4 helpfulContext no longer claims either capability role unlocks admin access — probed, `is_admin()` never reads `role_flags` — landed as a five-surface lockstep in one commit plus the row's `longExplanation` and the `scopeTiles` header comment it contradicted; `BL-ADMIN-PARSEPANEL-ORPHANED`: the component deleted behind a new zero-production-importer guard that asks the compiler for both module edges and their targets, with the five peers the class sweep found filed as `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS`; `BL-HELP-STRIP-COPYLINK-STALE`: the per-show help prose now names the Share link button, no screenshot regenerated). Also filed `BL-LEAD-CAPABILITY-PROSE-STALE` for the two remaining prose claims that need a contract read. Prior: 2026-08-02 — `docs/dangling-citation-ledger-filing` took the referential-integrity guard's `KNOWN_DANGLING` debt map from 50 rows to 9, filing 39 real entries and correcting one citation (`BL-FLOW4` came off as a side effect: with its family now defined, the stem suppresses as a family reference). Eight open rows here (`BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`, `BL-HEADER-REACT-RECONCILE-HARNESS`, `BL-PG-CRON-HOST-ASSERTION`, `BL-NEEDS-ATTENTION-HOLDS-ROLLUP`, `BL-RESYNC-STAGED-REVIEW-UI`, `BL-STEP3-FULL-CREW-PREVIEW`, `BL-UNPUBLISH-TO-HELD`, `BL-VERSION-AMBIGUOUS-V1-OVERRIDE`) plus `BL-LEDGER-GUARD-BODY-DEFINED-IDS` as the handoff for the eight ids defined in a parent entry's BODY, which stay body-defined by decision. Thirty-one went straight to `BACKLOG-archive.md` at their terminal state: eleven already shipped (the row was deleted at close instead of graduated, twice on a spec's explicit instruction), fifteen were impeccable-gate deferrals whose promised row was never opened and whose deferral has since closed, and five name a branch that was never taken. One citation was corrected instead of filed: `BL-SYNC-FEED-UI-POLISH` pointed at a backlog-id family that exists nowhere in the repo. The 9 rows left are the eight body-defined ids above plus `BL-RESOLVED`, a prose placeholder in an audit doc, both handed to follow-ups. Prior: 2026-08-02 — `test/agenda-fold-seeded-e2e` graduated `BL-AGENDA-FOLD-NO-SEEDED-E2E` (the per-viewer agenda day fold exercised through the REAL crew page: seeded `agenda_links` + two complementary date-restricted viewers, each an email-matched Google session against its own seeded show, plus an unrestricted admin control in `stage-restricted-crew-schedule.spec.ts`, wired into `crew-e2e.yml` under desktop-chromium behind a run-command wiring guard) and `BL-AGENDA-A11Y-WEBKIT-COVERAGE` (grep-scoped `standalone-webkit-a11y` project resolving exactly one test, structurally pinned, plus webkit installs and a regenerated baseline). Prior: 2026-08-02 — docs/citation-rot-financials-vocab graduated BL-DANGLING-CITATIONS-RETIRED-WORKFLOW (15 dangling citations to the seven retired e2e workflows rendered as prose across 10 docs, class-swept per the AGENTS.md bug-shape rule; spec:lint target-class findings now zero tree-wide) and BL-MASTERSPEC-FINANCIALS-VOCAB (14 master-spec financials-entitlement claims reconciled to LEAD ∪ FINANCIALS ∪ admin, line-count-neutral; 4 seed exclusions + 8 window-probe non-claims ratified in docs/superpowers/specs/2026-08-02-docs-hygiene-citation-rot-financials-vocab-design.md; specs README line-count note corrected), and filed BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT (§12.4 copy over-grant, deferred to the next §12.4 copy pass). Earlier reconciliations (deduplicated 2026-08-02 — this line had accumulated 40 segments, 26 of them verbatim repeats of merge-concatenated chains): **[BACKLOG-archive.md § Reconciliation log](./BACKLOG-archive.md#reconciliation-log)**.

---

## BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT — enrol the tap-target-floor spec in the source-mutation registry

**Filed:** 2026-08-09 (`fix/step3-a11y-cluster`, diff-review round economy). **Class:** review-round economy (a convergence criterion that is machine-computed rather than argued). **Effort:** S — one registry row plus an operator pass. **Class-sweep exception:** (c) — the registry and its runner are a surface this PR does not otherwise touch, and enrolling mid-review would have changed the artifact under review. **Reachability: PROBED.**

`tests/e2e/tap-target-floor.layout.spec.ts` is a guard suite, and its nine diff-review rounds produced **20 declared findings, of which 15 were the same shape**: "the guard does not pin what it claims", each arriving with an exact production edit the committed suite failed to catch. Every one was reproduced locally as an isolating mutant and reverted, so the operator set is already written down — in the commit messages of `893793235`, `95e9eb4a7`, `06cc09ed1`, `fc628f3e9`, `cc9fcfe4d`, `e88e7e0f6`, `0bce8e51c` and `50f2478e1`. It is simply not machine-run.

The **nineteen** isolating mutants, as an operator list ready to enrol — every one run locally and reverted, each named in the commit message of the round that answered it: drop `group` from a `<details>`; strip `transition-colors duration-fast` from a visual span; add `group` to an ancestor that must not carry it; strip an `aria-label` entirely; relabel an `aria-label` to a string that contradicts the visible wordmark; swap `rounded-pill` for `rounded-sm` on BOTH a target and its visual; swap `rounded-pill` for `rounded-[14px]` on both (passes a half-the-VISUAL check while the 44px target squares off); delete a caret's glyph while keeping its span and classes; add `text-transparent` to a caret; change `-m-2` to `-m-1`; remove `items-center` from a split target; move `cursor-pointer` from a target to its inner span; narrow `transition-colors` to `transition-[background-color]` (a substring matcher accepts it as `color`); collapse the topbar's `gap-3` to `gap-0` so a grown box overlaps its neighbour; narrow the STEP PILL's `transition-colors` the same way (the substring matcher survived at a second site); drop `justify-center` from a VISUAL span so its glyph slides to the edge while the span stays centred; revert only ONE of the two promoted headings, leaving `h1, h2, h3`; strip `w-fit` from all six Class-A summaries (a conformance pin, since `inline-flex` alone already shrink-wraps); delete `transition-colors duration-fast` outright, so the property computes to the `all` default that a lenient matcher accepts.

**Why this is worth a row rather than a shrug:** the brief's prose bar ("an exact production edit the suite fails to catch") kept every finding admissible, but it never made the set CLOSABLE — "can you think of another way to defeat it?" does not terminate, and rounds 2 through 8 were spent hand-discovering mutants one at a time. Enrolment converts that into "is the unaccepted-survivor set empty?", which does terminate, at the cost of one registry row and roughly 93s per run (`pnpm mutation:guards`). Registry: `tests/mutation/source/registry.ts`; spec: `docs/superpowers/specs/ci/2026-08-04-source-mutation-guard-gate.md`; the round-economy filing is `docs/review-rounds/fix/step3-a11y-cluster/61281c23e8ce.md`.

**First scheduled step:** add the registry row and run the gate, then triage survivors — the nineteen above should all be killed already, so any survivor is new information.

## BL-TAP-TARGET-INLINE-TEXT-CONTROLS — eight inline text controls sit under the 44px floor pending a per-site prose-vs-chrome call

**Filed:** 2026-08-07 (`fix/step3-a11y-cluster`, spec §9.1). **Class:** accessibility (tap-target floor). **Effort:** S-M (the judgment, then a mechanical repair for whatever it classifies as chrome). **Class-sweep exception:** (a) — needs a product decision the filing branch cannot settle. **Reachability:** PROBED — every site and its computed height is in the spec's §2.6 corpus baseline (`docs/superpowers/specs/2026-08-07-step3-a11y-cluster.md`).

The `fix/step3-a11y-cluster` corpus pass (AST walk, 340 in-scope interactive elements) found 16 literal-className elements genuinely under the 44px floor. Eight were repaired on that branch (chrome: disclosures, icon buttons, pills, the brand link). These are the other eight — all inline text links or text buttons sitting inside sentences: "Refresh" in a banner (`app/admin/settings/admins/RevokeRowButton.tsx:283`), "Change" (`components/admin/RoleRecognizeControl.tsx:268`), "Start fresh" (`components/shared/ReportModal.tsx:526`), a "show more" toggle (`components/admin/wizard/step3ReviewSections.tsx:2585`), a sheet-title deep link (`components/admin/wizard/Step3SheetCard.tsx:149`), `tel:` and `mailto:` links (`components/admin/wizard/step3ReviewSections.tsx:1405`, `components/admin/wizard/step3ReviewSections.tsx:1414`), and a dev-page debug button (`app/admin/dev/page.tsx:334`).

`PRODUCT.md:59` grants an explicit WCAG 2.5.5 exception to "links rendered inline within prose body text". Whether each of these eight is inline prose (exempt) or chrome (repair) is a per-site product judgment, not a mechanical class edit — several sit in sentence flow where a 44px box would visibly break the line. **First scheduled step:** make that call per site, then repair whatever it classifies as chrome using the recipes the spec ships.

## BL-TAP-TARGET-STRUCTURAL-GUARD — repo-wide tap-target guard blocked on the non-literal-className policy

**Filed:** 2026-08-07 (`fix/step3-a11y-cluster`, spec §5 + §9.1). **Class:** structural defense (fail-by-default coverage for NEW small targets). **Effort:** M-L. **Class-sweep exception:** (c) — spans surfaces the filing PR does not otherwise touch. **Reachability:** PROBED — the full detector procedure and its output are in the spec's §2.6 (`docs/superpowers/specs/2026-08-07-step3-a11y-cluster.md`).

The mandated pre-draft detector pass ran a TypeScript-AST walk over every `.tsx` under `app/**` and `components/**`: **340** in-scope interactive elements, **139** the recogniser cannot clear, of which **94 carry a non-literal `className`** (template literal, ternary, named constant, `.join()`, or no `className` prop at all with the floor living in a child component's base string). A guard honouring the consequence bound — every element checked or reported by name, never silently passed — must report all 94 as UNCLASSIFIED, so it cannot go green until they are dispositioned. Shipping it weakened (passing constructs it cannot read) would have missed `components/admin/HelpSheet.tsx:139`, a real 36px defect the corpus pass caught.

**First scheduled step is the policy decision, not the recogniser:** resolve named class constants, require literal classNames on interactive elements, or accept a standing UNCLASSIFIED census. The recogniser cannot be finished before that call. Until then, the filing branch's defence is its real-browser assertions pinning the thirteen repaired sites (regression coverage, not discovery coverage — spec §4 documents the limit).

## BL-MI11-REMOVAL-FALLBACK-STALE-OVERWRITE — the mi11 genuine-removal fallback retains a frozen snapshot over a live row

**Filed:** 2026-08-07 (arc C Q1 class-sweep, `feat/backlog-quick-wins`). **Class:** correctness (silent data revert). **Effort:** S. **Severity:** low-medium — no loss of the row, but live edits are silently reverted.

Arc C repaired the `crew_email` reject branch to retain the LIVE crew row instead of nothing. The sweep for that bug SHAPE — "a retain that sources a frozen snapshot while a live row exists" — found one more instance, and it ships today.

`lib/sync/holds/holdAwareApply.ts:337`, the mi11 genuine-removal fallback, does `retainRows.set(hold.entity_key, rowFromHeldValue(held))`. `held` is the value captured when the hold OPENED. The retain feeds `plan.crewMembers`, which the snapshot-replace engine upserts across every column (`runScheduledCronSync.ts:1653-1685`), so every field edited on that member since the hold opened is reverted — phone, role, restrictions, flight info.

**PROBED, not inferred.** `tests/sync/capabilityLossReachability.probe.test.ts` now carries a `phoneAfter` oracle: the live seed is `555-NEW` and every `heldValue` is `555-OLD`, so the two are distinguishable. The `mi11_pending/crew_email` row pins `phoneAfter: HELD_PHONE` — i.e. the live phone IS reverted, executably, today. That row is the reproduction; the arc left it pinned at current behaviour rather than fixing it here.

**Why this is a RULING question and not a straight fix, which is why it is filed rather than swept.** The two adjacent sites disagree on purpose, and the disagreement is documented:

- The `crew_identity` restore branch (`:477`) also retains `rowFromHeldValue(held)`, and there it is CORRECT — that branch resurrects a deleted row, so the held snapshot is the only source there is. The probe pins `phoneAfter: HELD_PHONE` for it as INTENDED.
- The rename-fold path (`:392-397`) does the opposite: it takes the sheet row and overrides only the pinned identity fields (`{ ...m, name: pin.name, email: pin.email }`), i.e. live-row-wins with a narrow pin.
- WM-F6 (`:308`) deliberately prefers held values in its own neighbourhood.

So "retain the live row" is not obviously right at `:337`: the fallback runs when the member is genuinely absent from the sheet, which is precisely when there may be no live row to prefer, and the hold's semantics may intend the snapshot. **The entry's first step is that ruling — defect or intended hold semantics — not a patch.**

**Deferral exception: (a)** — needs a design decision about hold semantics that arc C's ratified scope (spec §1.1) does not settle, on a branch whose diff is otherwise two narrow changes. Swept and probed at round 0 rather than left for a later reader to rediscover.

**Promotion prerequisite:** the ruling above. If it lands as "defect", the fix mirrors arc C's: thread the live row and prefer it, with no-match falling back to today's behaviour.

## BL-TASK-ENROLLMENT-SINGLE-DEPTH — the declared task region cannot express hierarchical or interleaved plan shapes

**Status:** OPEN · **Severity:** LOW (opt-in convention; conservative failure with a surfaced finding, never silent) · **Class:** spec-lint task contract, enrollment expressiveness · **Filed:** 2026-08-03, from `docs/superpowers/specs/2026-08-03-pre-review-gate-arms-design.md` §6 items 6 and 7 · **Effort:** L
**l-wave-screen 2026-08-06:** PREREQ — design-gated multi-depth enrollment redesign; the entry's own deferral-exception (c) fences it, so no wave can schedule it.

The `<!-- tasks: depth=N -->` region declares ONE heading depth. Two real corpus shapes do not fit it, both measured:

- **Task units at two depths** — 7 of 533 plans, e.g. `docs/superpowers/plans/alerts/2026-07-04-alert-at-a-glance-identity.md` (depths 2 and 3). Enrolling either depth silently excludes the units at the other.
- **Non-task headings at the task depth, between the first and last task** — 6 plans, e.g. grouping headers like `Tasks 5-22: A3-A20 (PROC each)`. No region delimiter can exclude a heading in the middle of the region; it is classified as a task and draws `TASK_MARKER_MISSING`.

**Deferral exception (c)** per the class-sweep disposition rule in `AGENTS.md`: the repair is a redesign of a surface this PR does not otherwise touch. Multi-depth enrollment forces a nesting model — a depth-3 task inside a depth-2 extent — whose marker ownership, extent boundaries, and `TASK_MARKER_MISSING` semantics are a design of their own, not a clause. Neither (a) nor (b) applies: this is not an unsettled product decision, and no prior ratification fences it.

**Why it is safe to carry.** Enrollment is opt-in and no legacy plan is enrolled (measured: 534 plans scanned, 1 attempted, 0 findings). A plan of either shape either normalizes its task depths or stays unenrolled; the author is told plainly rather than checked wrongly. Re-open when someone wants to enrol a plan of one of these shapes.

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

## BL-STEP3-FULL-CREW-PREVIEW — no full crew-page preview from a staged parse in wizard step 3

**Filed:** 2026-08-02 (retroactively; `docs/superpowers/specs/step3-onboarding/2026-06-23-onboarding-step3-review-redesign.md:290` lists it under §11 Out of scope / Backlog, with no row anywhere). **Class:** UX enhancement. **Effort:** M.

Step 3 reviews a staged parse through its own section cards, not through the surface the crew will actually see. A C-style full preview would render `CrewShell` from the staged `parse_result`, which needs a `parse_result → ShowForViewer` adapter. Verified 2026-08-02: no such adapter exists.

The adapter is the substance of the work, not the rendering — `getShowForViewer` builds its projection from persisted rows, and a staged parse is neither persisted nor viewer-scoped, so the adapter has to decide what a preview means for viewer name aliases, per-viewer visibility filters, and the admin-preview branch before any of it renders. UI surface, so Opus-owned with the invariant-8 dual gate.

**Status:** OPEN.

---

## BL-POPOVER-REGISTRY-PER-FILE-AND-TAILWIND-ONLY — the anchored-scroller registry is fail-by-default per FILE, and only for the Tailwind idiom

**Effort:** M

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

screen-disposition 2026-08-04: BOTH PRECONDITIONS VERIFIED, mutation BLOCKED on tooling permission.
Stays open, and the only work left is one command.

**Soak — green.** `gh run list --workflow section-header-visual.yml`, 60 runs since 2026-07-27:
57 success, 3 cancelled, **zero failures**. The §4.5 item 3 gate condition ("green → add the
context") is met.

**Second precondition, checked because the soak cannot show it.** A required context that never
REPORTS blocks every PR forever, so a path-filtered workflow must never be made required.
`section-header-visual.yml` is deliberately UNFILTERED on `pull_request` (its own header explains
why: path filters would make it invisible to the coverage scanner). It runs on every PR, so
requiring it cannot hang one.

**Blocked:** the `gh api -X POST .../required_status_checks/contexts` mutation was denied by this
session's tooling permission classifier — an environment limit, not a repo or GitHub one. Current
required set is 12 contexts; this adds the 13th. The exact command, unchanged from §4.5 item 3:

```
gh api -X POST repos/edweiss412/FX-Webpage-Template/branches/main/protection/required_status_checks/contexts \
  -f "contexts[]=section-header-visual"
```

Run it, confirm with `gh api repos/edweiss412/FX-Webpage-Template/branches/main/protection/required_status_checks --jq '.contexts'`,
then archive this entry. Nothing else is owed.

### BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE — a fast server action can leave the Published toggle stuck pending on WebKit

**Status:** OPEN · **Severity:** MEDIUM (real-user exposure unquantified; measured 7/10 in a CI loop) · **Class:** upstream framework defect, product exposure · **Filed:** 2026-07-26 (BL-E2E-LIFECYCLE-TRANSITIONS-ROUNDTRIP-FLAKE measurement work) · **Effort:** L
**l-wave-screen 2026-08-06:** PARKED-WATCH — measured upstream React replay-loss defect; mitigations gated on real-user reports or a vendored React fix, and the watch signals are named in-body.

**Measured, not theorized** (CI run 30233337644 retry1 trace + baseline loop 30235889083, 7/10 samples): `setShowPublishedAction` POSTs, the server commits and responds 200 `{ok:true}` in ~230ms with the re-rendered `published:false` tree in the response body, the page stays responsive — and the `PublishedToggle` switch sits `disabled aria-busy="true"` with the OLD `aria-checked` indefinitely. `await setPublished(...)` inside the form action never resolves, so `useFormStatus().pending` never clears and `router.refresh()` is never reached. React never commits the applied tree (React 19 replay-loss class; nearest public report vercel/next.js discussion 88767). Vendored React is identical through next 16.2.12 (`19.3.0-canary-3f0b9e61-20260317`), so no patch-bump fix exists today.

**User-visible shape if it bites in production:** an admin flips Published on mobile Safari, the switch greys out and spins forever; the mutation HAS committed (crew link state is already flipped). A reload shows truth. All observations so far are Playwright WebKit under CI; not yet reproduced in desktop Chromium or a real handheld Safari — quantifying that is the first step if this is picked up.

**Watch signals:** `[wedge-recovery]` lines in the lifecycle-transitions e2e output (tier=nudge/reload counts per run), and admin reports of a stuck Published switch. **Candidate mitigations if real-user reports arrive:** a client-side watchdog in `PublishedToggle.formAction` (`Promise.race` the action against a generous timeout, then `router.refresh()` — the mutation is NOT retried, only the read is), or an upstream React/Next bump once the replay fix ships in a stable vendored canary.

## BL-PG-CRON-COVERAGE-UNRUN — the live pg-cron introspection suite runs in no CI workflow

**Status:** PARTIALLY CLOSED 2026-07-26 (PR3 of the CI-dark coverage cluster) · **Severity:** medium · **Surfaced:** 2026-07-25, whole-diff review round 17 · **Effort:** M
**l-wave-screen 2026-08-06:** KEEP at honest residual scope — the wired-in-CI half closed 2026-07-26/27 and only the per-job smoke residue remains, so it is resized L->M in this same commit.

**What closed.** The suite now runs in `unit-suite-db` (removed from `ENV_BOUND_EXCLUDES`, which applied only under `VITEST_EXCLUDE_ENV_BOUND=1` — so it ran locally and was dark in CI only), and against the persistent validation project via the new `pg-cron-validation-parity` job in `x-audits.yml`. Under CI an unreachable `psql` now throws instead of skipping, and a live-case counter refuses a run where zero live cases executed — measured before: exit 0 with "2 passed | 6 skipped", asserting nothing.

**What stays open:** the per-job smoke-test residue (spec §9). The target-binding ceiling this entry used to inherit closed 2026-07-27: the connected cluster's `system_identifier` is now pinned and re-proven by a DO guard on every query's own connection (`feat/driveid-guard-cluster`, `docs/superpowers/specs/data-quality/2026-07-26-driveid-guard-cluster-design.md` §3.1) — a DSN substring check proves nothing, and no longer has to.

**Original text (SUPERSEDED 2026-07-26 — the exclusion and the "nothing runs it" finding are both fixed; see the status note above):**

`tests/cross-cutting/pg-cron-coverage.test.ts` is the only test that introspects the live `cron.job` table — job set, schedules, `active` flags, the pg_net extension, the vault secret. It was excluded from `unit-suite` via `ENV_BOUND_EXCLUDES` (`vitest.projects.ts`), and the comment there said it "runs against the validation project (like validation-schema-parity)". **Nothing ran it.** `pnpm test:audit:x6-pg-cron-pivot` runs four different files, and no other workflow references it; `grep -rl pg-cron-coverage .github/workflows/` returns only the `unit-suite.yml` comment that explains the exclusion.

So every assertion in it is dead in CI, including the `active=true` gate that exists specifically because a disabled job would otherwise satisfy the name/schedule/command checks.

**Fix:** give it a job in `x-audits.yml` with `PG_CRON_COVERAGE_TARGET=validation` and `TEST_DATABASE_URL` pointing at the validation project, alongside `validation-schema-parity` which already has that shape. Then correct the stale comment in `unit-suite.yml`.

**Wiring it up is necessary but not sufficient** (whole-diff R18). Every assertion this suite makes about `cron.job.command` is text matching: PostgreSQL resolves the OUTER `cron.schedule` call but stores the command body verbatim, comments included. A job whose `net.http_get(...)` is commented out, followed by an executable `select 1;`, satisfies the route check, the `net.http_get(` check and the exactly-one-timeout check while issuing no request — and `active=true` does not help, because the job runs, it just does nothing. Proving a job actually fires needs a smoke test per job; only the sync path has one today. Track that with this entry rather than by adding more text assertions.

## BL-WATCH-PROMOTION-ACTIVATION-RACE — a folder switch racing a subscriber can leave one stale active channel

**Status:** OPEN · **Severity:** low (bounded to one lease; no data loss) · **Surfaced:** 2026-07-26, watch-renewal-lifecycle spec rounds 2-5 · **Effort:** L
**l-wave-screen 2026-08-06:** PARKED (ratified 2026-08-05) for its own lock-topology design session; not schedulable inside any wave (see the 2026-08-04 screen ruling in-body).

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

**Status:** OPEN · **Severity:** low · **Surfaced:** `fix/picker-flow-app-bugs` review round 5 (2026-07-25) · **Effort:** S

`tests/ci/_workflowCoverageScan.ts` classified a workflow as PR-blocking-capable unless it had a `pull_request.paths` filter, and matched only that spelling — so any workflow using `paths-ignore` was treated as running on every PR when it does not. This branch fixed the matcher (`paths(-ignore)?`) and added a self-test, and re-categorised the two crew-e2e specs as `PATH_GATED_BY_EXCLUSION`.

**What remains:** no other workflow in `.github/workflows/` used `paths-ignore` at the time of the fix, so nothing else changed category. Re-run the audit if one adopts it, and check whether any spec's allowlist row (or absence of one) became inaccurate. **Trigger:** the next workflow that adds a `paths-ignore` filter.

---

## BL-TELEMETRY-FALLBACK-RETRY — the scheduled-job health fallback states the cause but offers no retry

**Status:** OPEN · **Severity:** low (developer-tier surface) · **Surfaced:** #601 impeccable critique (2026-07-25), P1 partially addressed · **Effort:** S

`app/admin/dev/telemetry/page.tsx:84` now reads "Couldn't load scheduled-job health right now. The jobs are probably still running." — the second sentence landed in the #601 follow-up because the critique was right that the old one-liner named neither a cause nor a recourse at the moment Doug's stress is highest. What it still lacks is the recourse half: there is no retry control, so the only way to re-read is a full page reload.

**Fix (when prioritized):** a retry affordance on the fallback, consistent with `AutoRefreshControl`'s manual-refresh icon-button already on this page (spec §7.1) rather than a new idiom. **Trigger:** the next telemetry pass, or a report of the readout failing in practice.

---

screen-disposition 2026-08-04: PREREQ-FENCED, stays open, NOT closed by `chore/sweep-guards-tests`.
Two independent reasons, and either alone would be enough. First, the entry's own trigger is quoted
and unmet: "the next telemetry pass, or a report of the readout failing in practice" — neither has
happened, so closing now would violate the entry rather than honor it. Second, the fix is a retry
control on `app/admin/dev/telemetry/page.tsx`, which is an invariant-8 UI surface; the plan scopes
the dual gate to the UI branch and marks this one `impeccable-gate: N/A — no UI surface`, so the
work cannot land here without either violating that scoping or dragging a UI change through a guards
review. Unlike `BL-CANONICAL-CLASS-ARRAY-BLINDSPOT`, there is no guard half to ship in the meantime:
the fix IS the control. Claim released; it was marked at Stage 0 before the fence was read.

## BL-PICKER-CLEANUP-REVALIDATE-QUERY-VARIANT — `cleanupStaleEntry` revalidates a path the picker is rarely on

**Effort:** M

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

**Status:** OPEN · **Severity:** medium · **Surfaced:** `fix/picker-flow-app-bugs` Task 13 close-out (2026-07-25) · **Effort:** M
**Nightly-red measurement 2026-08-09:** the PARTIAL's daily schedule has been red 9 of its last 10 firings (probed via `gh run list --workflow=dev-gate-e2e.yml --branch main`: failures 2026-07-31, -08-01, -08-02, -08-04, -08-05, -08-06, -08-07, -08-08, -08-09 = runs 30619278961, 30691990257, 30740095858, 30894831479, 30990761496, 31087555225, 31158561514, 31245680158, 31300710571; sole green 2026-08-03 run 30804083044). Every probed failure is the SAME test — `tests/e2e/attention-modal-gallery.spec.ts:192` ("Flight boundary + write containment"), `dev-build` project — a THIRD rotted site beyond the `:398`/`:265` pair below: on 2026-08-09 the click on the review-modal Published toggle looped "element was detached from the DOM, retrying" for the full 60s budget (the toggle keeps remounting under the dev build), and each failure aborts the run with 38 tests never executed, so the gate certifies nothing nightly. This is the entry's own predicted trigger firing daily; the "What remains" decisions below are now bounding a permanently-red scheduled gate, not a hypothetical dispatch.

`tests/e2e/attention-modal-gallery.spec.ts` runs only under the `dev-build` Playwright project (`playwright.config.ts:92`), and `dev-build` runs only in `dev-gate-e2e.yml`, which is `workflow_dispatch`-only. No PR ever triggers it. Its last green run was **2026-07-02**; the only other run since was a failure on 2026-06-22. Dispatching it during this branch's close-out failed two assertions:

- `:398` — `controls.getByText(String(GLOBAL.length), { exact: false })` raises a strict-mode violation, resolving to 2 elements. The substring match means any element in the controls bar containing that digit qualifies.
- `:265` — `await expect(attentionMenu).toHaveCount(0)` after `Escape` times out; the menu does not close the way the spec expects.

**Not caused by the branch that found it.** `fix/picker-flow-app-bugs` touches no file under `components/` or `app/admin/`, and its only `playwright.config.ts` edits are to the `mobile-safari` and `desktop-chromium` matchers — `dev-build` is untouched. Two commits that landed on `main` _after_ the gate's last green run change exactly what these assertions read: `432d8ef06 feat(admin-dev): exclude global-scope tier-1 scenarios from the gallery switcher` (the global-scope set the `:398` count is derived from) and `f4c4bf493 feat(admin): merge the attention panel's three groups into two` (the menu at `:265`). 793 commits touched `components/admin/` in that window.

This is the dark-spec class already recorded for this repo (`feedback_dark_spec_in_unrun_project_rots`, #486): a spec nothing runs stops describing the product, and the cost lands on whoever next dispatches the gate.

**What remains:** two decisions, in order. (1) Repair both assertions against the current UI — the count needs an exact/scoped match rather than a substring, and the menu-close assertion needs to match the post-merge panel behavior. (2) Decide whether the gallery spec belongs in a gate no PR runs at all. If its value is the built `ADMIN_DEV_PANEL_ENABLED=true` artifact, that is a reason for a dedicated project, not a reason to be unreachable; if it can run on the `:3000` baseline, move it somewhere PR CI executes. **Trigger:** the next `dev-gate-e2e.yml` dispatch, which will fail on this until it is fixed.

---

## BL-NULLCODE-STAMP-BATCH-2 residuals (2026-07-03)

**Effort:** XS

Deferred out of the forensic code-stamping batch (`docs/superpowers/specs/observability/2026-07-03-nullcode-forensic-batch2-design.md` §9) — separate user-facing / alerting surfaces beyond the pure log-code enrichment.

**Heading caveat:** only the first two items (`BL-SCAN-SSE-BODY-NULL-CODE`, `BL-PICKER-TAMPER-ADMIN-ALERT`) actually came out of that batch. The rest accreted under this heading afterwards from unrelated 2026-07-04+ work (agenda visibility, quiet-link a11y, alert-link e2e, health-resolve lockdown, Step-3 impeccable) and are grouped here by filing date, not by subject. Read each item on its own; the heading is not a topic.

**Sweep status (2026-07-24/25).** Every item below was re-verified against live code, and citations that had rotted were corrected in place — several were badly stale (`AlertBanner.tsx` deleted, `PerShowAlertSection.tsx` deleted, a 9-code registry that is now 20, line numbers shifted). One item closed as obsolete (`BL-WATCH-ERROR-MESSAGE-RAW-DIAGNOSTIC`, since graduated to `BACKLOG-archive.md`). **Four** cross-model review rounds then caught further errors in the sweep itself, so treat the corrected text as verified but not sacred. The misses: a `grep -l` that matched a comment instead of a consumer; a nonexistent `shows.last_error_message`; a literal-attribute census that undercounted a dynamically-spread family by four; a "no live render exists" claim contradicted by an existing seeded e2e path; several citations pointing at an import, comment, JSDoc, or projection string rather than the executable binding; a component path copied from a review without resolving its directory; and a route prescription naming three renderers where the same section had already established four. **When picking up any item here, re-verify its citations before acting on them** — that is the whole lesson of this section. Working order for the rest: ~~PR2 `BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y`~~ (CLOSED, PR #592), ~~PR3 `BL-AGENDA-PERDAY-VIEWER-FILTER`~~ (CLOSED, PR #610), ~~PR4 `BL-SCAN-SSE-BODY-NULL-CODE`~~ (CLOSED, PR #621), ~~PR5 `BL-PICKER-TAMPER-ADMIN-ALERT`~~ (CLOSED, PR #623), ~~PR6 `BL-ALERT-ACTION-LINKS-E2E`~~ (CLOSED, PR #624 — the residual-sweep working order is COMPLETE). `BL-HEALTH-RESOLVE-DB-LOCKDOWN` stays an accepted risk, deliberately and not by omission. `BL-STEP3-IMPECCABLE-LIVE-RENDER` was unscheduled here and SHIPPED 2026-08-02 on `test/step3-live-render-cluster` (graduated to `BACKLOG-archive.md`).

### BL-AGENDA-PROSE-SECOND-DAY — a day label can name a second day in free prose

**Status:** OPEN — known limit, accepted in PR #610 review R6 · **Severity:** low · **Class:** FEATURE REACH · **Effort:** S

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

### BL-AGENDA-POSITIONAL-DAYSET-FALLBACK — the day-set matcher has no positional fallback

**Status:** OPEN — deliberate omission, ratified in-spec · **Severity:** low · **Class:** FEATURE COMPLETENESS · **Effort:** S

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

**Status:** OPEN (2026-07-25) · **Severity:** low · **Class:** TELEMETRY GRANULARITY · **Effort:** M

`PrepareOnboardingFileError` has two kinds, `drive_fetch` and `parse`, and the post-parse internal helpers (`finalizeArchivedTabs`, `reconcileIncludedTab`, `discardAndRerun`'s fix-up, `applyRoleTokenMappings`) currently fall to `drive_fetch` — today's unchanged behavior. Neither code is right for them: a bug in the role-mapping overlay is not a Drive failure, and it is not something Doug fixes by editing his sheet either, so `STAGED_PARSE_FAILED` ("fix its structure", `warn` severity) would be a new wrong instruction. **Fix (when prioritized):** a third `internal` kind mapped to a code that tells the operator to contact the developer, with the finalize severity staying `error`. Needs a new §12.4 row and the full four-gate CI fan-out, which is why it was not folded into the batch that surfaced it.

screen-disposition 2026-08-04: KEEP — PROBED, and the mislabeling is deterministic rather than hypothetical. Verified 2026-08-04: `PrepareOnboardingFileError.kind` is the two-member union `"drive_fetch" | "parse"` at `lib/sync/runOnboardingScan.ts:1164-1172` (repeated in `asPrepareError` at `:1177`), there is no `"internal"` anywhere under `lib/sync/`, and the doc comment at `:1154` states outright that `drive_fetch` is "everything else, deliberately including the post-parse" helpers. All four helpers the entry names exist and are reachable: `applyRoleTokenMappings` (`lib/sync/roleMappingOverlay.ts:62`), `reconcileIncludedTab` (`lib/sync/pullSheetOverride.ts:157`), `discardAndRerun` (`:199`), `finalizeArchivedTabs` (`:229`). A precedent for the operator-facing code already exists at `lib/messages/catalog.ts:812` (`ONBOARDING_FINALIZE_INTERNAL_ERROR`). Every one of those faults reports today as a Drive failure.

### BL-CRON-WORKBOOK-FAULT-CODE — a corrupt workbook on the cron path reports SYNC_FILE_FAILED

**Status:** OPEN (2026-07-25) · **Severity:** low · **Class:** TELEMETRY GRANULARITY · **Effort:** M

The cron sync path also synthesizes workbooks (`lib/sync/runScheduledCronSync.ts:3118,3144`). A throw at either site escapes `prepareProcessOneFile` and is caught by the outer per-file loop (`:3915-3925`), which records `outcome: "parse_error"` with `classifySyncFailure(error)` — typically `SYNC_FILE_FAILED`. So it is already parse-family rather than Drive-family (unlike the onboarding paths this batch fixed), and the open question is narrower: should a corrupt workbook there report `PARSE_ERROR_LAST_GOOD`, whose copy tells Doug the latest edit did not parse and the previous version is still live? **Fix (when prioritized):** key on the `WorkbookSynthesisError` type this batch introduced. Deferred because it changes a live crew-visible sync contract and belongs in its own spec.

### BL-MUTATION-REF-SUB — an exported `#REF!` is absorbed into the parse with no signal

**Status:** OPEN (2026-08-06, L-wave decomposition of `BL-MUTATION-HARNESS-OPEN-HOLES`; wave spec+plan ratified 2026-08-08 — see docs/superpowers/specs/parser/2026-08-07-parser-mutation-wave-design.md) · **Severity:** medium · **Class:** PARSER ROBUSTNESS · **Effort:** M

A body cell rewritten to the literal `#REF!` — a real broken-reference export artifact, **present in 3 of the 7 live shows** — parses as an ordinary value. Value-corruption class: the operator sees a crew page with `#REF!` where a name or time belongs, and nothing upstream said so.

**Ledgered blast radius: 3314 holes** (3094 `wrong` / 220 `signal_loss`), the LARGEST class in the harness — derived 2026-08-06 from `RAW_HOLES` in `tests/parser/mutation/knownHoles.ts`. Linkage: `OPERATOR_FINDING_MAP["ref-sub"] = "BL-MUTATION-REF-SUB"` (`tests/parser/mutation/knownHoles.ts:82`), pinned by `tests/parser/mutation/knownHoles.test.ts` — this id must stay resolvable while that row exists.

**Shape (M):** one corpus-calibrated detection heuristic (`#REF!` is an unambiguous literal, so the discriminator is cheap — the calibration is deciding WHICH fields warn vs hard-fail) plus one new warn-severity `ParseWarning` code carrying the §12.4 lockstep triple (master-spec §12.4 prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts`, same commit) and a warning-card copy row.

**Ratchet contract:** the ledger is SHRINK-ONLY. Hardening this class turns its holes into `staleRows` and the nightly harness FAILS until they are removed from `knownHoles.ts`, so the fix is measurable as a ledger reduction. Never grow the ledger silently; a NEW hole fails as `newAlarms`. Decomposition record: `BACKLOG-archive.md` § `BL-MUTATION-HARNESS-OPEN-HOLES`.

### BL-MUTATION-MERGED-CELL — a merged cell exports as a deleted pipe and silently fuses two cells

**Status:** OPEN (2026-08-06, L-wave decomposition of `BL-MUTATION-HARNESS-OPEN-HOLES`; wave spec+plan ratified 2026-08-08 — see docs/superpowers/specs/parser/2026-08-07-parser-mutation-wave-design.md) · **Severity:** medium · **Class:** PARSER ROBUSTNESS · **Effort:** M

Deleting one interior pipe — which is exactly how a merged cell exports to markdown — fuses two adjacent cells with no signal. Cell-fusion class: two columns become one value, and every downstream column index shifts within that row.

**Ledgered blast radius: 2404 holes** (2271 `wrong` / 133 `signal_loss`), the second-largest class — derived 2026-08-06 from `RAW_HOLES`. Linkage: `OPERATOR_FINDING_MAP["merged-cell"] = "BL-MUTATION-MERGED-CELL"` (`tests/parser/mutation/knownHoles.ts:87`), pinned by `knownHoles.test.ts`.

**Shape (M):** the discriminator is a row whose cell count is short by one against its section's established width, which needs corpus calibration — genuinely ragged rows are normal sheet authoring, so the heuristic must separate "merged cell" from "author left a trailing cell blank". Plus the warn-severity `ParseWarning` code with its §12.4 lockstep triple and warning-card copy row.

**Ratchet contract:** SHRINK-ONLY, as above — `staleRows` on hardening, `newAlarms` on regression. Decomposition record: `BACKLOG-archive.md` § `BL-MUTATION-HARNESS-OPEN-HOLES`.

### BL-ZERO-WIDTH-POST-PARSE-ENRICHMENT — zero-width text still reaches the PERSISTED payload through the sync/Drive enrichment layer

**Status:** OPEN (2026-08-09, surfaced by codex-guard round 4 on `feat/mutation-unicode`, PR #736) · **Severity:** medium · **Class:** PARSER ROBUSTNESS / SYNC · **Effort:** M

The parser-side hole is closed: `parseSheet` strips `[\u200B-\u200D\uFEFF]` from both of its inputs, so nothing invisible survives a parse. But `ParsedSheet` is not finished when `parseSheet` returns. The sync layer attaches Drive-derived fields afterwards (`lib/parser/index.ts` header: those fields are "NEVER populated here"), and every one of them carries author-controlled text that no boundary strips:

- `embeddedImages[].sheetTab` — both the XLSX and Sheets-API branches (`lib/sync/enrichWithDrivePins.ts:232`, `:311`)
- `embeddedImages[].alt` (`enrichWithDrivePins.ts:314`)
- `linkedFolderItems[].alt` (`enrichWithDrivePins.ts:380`)
- `archivedPullSheetTabs[].tabName` and `.headerPreviews[]` (`lib/drive/exportSheetToMarkdown.ts:382`), attached post-parse by `lib/sync/pullSheetOverride.ts:229`

**Probe evidence** (codex-guard round 4, `--stage diff --round 4`). Clean-vs-dirty runs through `enrichWithDrivePins` and through `buildXlsx → parseSheet → finalizeArchivedTabs`, both scored with the mutation oracle:

```
{"verdict":"SILENT_WRONG","paths":["payload.diagrams.embeddedImages[0].sheetTab","payload.diagrams.embeddedImages[0].alt","payload.diagrams.linkedFolderItems[0].alt"]}
{"verdict":"SILENT_WRONG","paths":["payload.archivedPullSheetTabs[0].tabName","payload.archivedPullSheetTabs[0].headerPreviews[0]"]}
```

The archived-tab fingerprint also rekeys silently: `{"clean":"705848ac…f97c25","dirty":"80fd09c3…28058","equal":false}`.

This is the SAME consequence the wave exists to remove — invisible characters defeat equality, so a sheet tab or alt text carrying one fails exact comparison while rendering identically.

**Why filed rather than repaired in the branch that found it** (AGENTS.md class-sweep disposition, exception (b) — a ratified scope decision already fences it): the wave's spec fences every branch to the parser (`docs/superpowers/specs/parser/2026-08-07-parser-mutation-wave-design.md` §3.1 scopes the strip to `parseSheet` entry), and plan-wide invariant 7 makes the spec canonical, directing an out-of-scope discovery to a question rather than a silent fix. `lib/sync/**` and `lib/drive/**` are a different subsystem that no branch of this wave otherwise touches. Note this is NOT the "same defect, different file" case the rule forbids deferring: the fence is a ratified scope decision, not convenience.

**Shape (M):** strip at the point Drive-supplied strings enter the payload (five call sites across the three files above, sharing one helper with the parser's `stripZeroWidth` so the boundaries cannot drift), plus a guard in the shape of `tests/parser/payloadZeroWidth.test.ts` covering the enriched payload rather than the parse output, plus a decision on whether the archived-tab fingerprint rekey needs a one-time migration note.

### BL-MUTATION-LEDGERGIT-SITE-DRIFT — the `ledgerGit` source-mutation gate is red on main: relocated sites, an uncovered new constant, and a CI-only survivor pair

**Status:** OPEN (2026-08-08, surfaced by the parser mutation-hardening wave; PRE-EXISTING on `main`, not introduced by that wave) · **Severity:** medium · **Class:** CI / GUARD SURFACE · **Effort:** M

`tests/mutation/guardSurfaces.gate.test.ts` fails for the `ledgerGit` surface (`tests/mutation/source/registry.ts:355`, source `scripts/lib/ledger-git.ts`). Three distinct causes, only the first of which is bookkeeping:

1. **Relocated sites (6 rows, mechanical).** `229563b76` ("fix(scripts): CLIs set exitCode instead of exit()") inserted ~16-19 lines into `scripts/lib/ledger-git.ts` without re-pointing the registry's `accepted` rows, which key on line numbers. Every one of the six is byte-identical at its new line, so the existing `reason` prose stays valid verbatim: `67:12`→`83:12`, `114:18`→`130:18`, `176:32`→`192:32`, `202:17`→`219:17`, `261:11`→`280:11`, `306:14`→`325:14`.
2. **A genuinely uncovered new constant (3 mutants).** The same commit added `const MAX_GIT_STDOUT = 64 * 1024 * 1024;` (`scripts/lib/ledger-git.ts:62`). All three of its integer-literal mutants survive — `62:24:64>65`, `62:29:1024>1025`, `62:36:1024>1025` — so `tests/scripts/ledgerClaimsCheck.test.ts` never exercises the maxBuffer bound. This is a real coverage gap, not a relocation, and closing it needs a new suite case that drives stdout past the cap.
3. **A CI-only survivor pair contradicting the surface's own documented limit.** CI reports 11 unaccepted survivors and score 0.8333; a local full clone reports 9 and 0.8571. The two extra are `integer-literal:284:60:2>3` and `284:93:2>3`. The registry comment at `registry.ts:359-363` asserts every verdict is "environment-INDEPENDENT by construction ... none of them can read differently on a developer's full clone than in CI's zero-ref checkout (spec AC-6, limit L-6)". The measurement below falsifies that claim for at least these two sites; the fix must either make them environment-independent or amend the claim.

**Probe evidence.** Nightly `mutation-harness` on `main` @ `9bd0a8456` (run 31246763153): `unaccepted-survivor: 11 survivor(s) with no ledger row: ... integer-literal:284:60:2>3, integer-literal:284:93:2>3`, `stale-ledger-row: 6 ledger row(s) whose site no longer survives: logical-connector:114:18:||>&&, logical-connector:67:12:||>&&, logical-connector:176:32:||>&&, integer-literal:202:17:1>2, statement-removal:261:11:continue;>(removed), logical-connector:306:14:||>&&`, `below-floor: ledgerGit: score 0.8333 < floor 0.9`. Local reproduction on a full clone off the same commit: `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run tests/mutation/guardSurfaces.gate.test.ts` → same 6 stale rows, 9 survivors, `score 0.8571 < floor 0.9`. Byte-identity of the six relocations verified with `git show 229563b76~1:scripts/lib/ledger-git.ts`.

**Why filed rather than repaired in the wave branch that found it** (AGENTS.md class-sweep disposition, exception (c)): causes 2 and 3 are a redesign of a guard surface the parser wave does not otherwise touch — a new executable suite case for the maxBuffer bound, plus settling an environment-dependence claim in the surface's ratified limits. Repairing only cause 1 would leave the gate red anyway (below-floor persists), so it buys nothing. The parser wave's PRs record this as an inherited red.

### BL-MUTATION-COLUMN-SHIFT — a spurious leading empty column shifts a section's row grid with no signal

**Status:** OPEN (2026-08-06, L-wave decomposition of `BL-MUTATION-HARNESS-OPEN-HOLES`; wave spec+plan ratified 2026-08-08 — see docs/superpowers/specs/parser/2026-08-07-parser-mutation-wave-design.md) · **Severity:** medium · **Class:** PARSER ROBUSTNESS · **Effort:** M

A spurious leading empty column shifts every cell in a section's row grid one position right, and the parse absorbs it — the East Coast column-shifted outlier, i.e. a shape observed in a LIVE show, not a synthetic one. Layout-shift class: every field in the section reads its neighbour's value, which is the most damaging silent outcome in this set because each individual value still looks well-formed.

**Ledgered blast radius: 211 holes** (193 `wrong` / 18 `signal_loss`) — derived 2026-08-06 from `RAW_HOLES`. Linkage: `OPERATOR_FINDING_MAP["column-shift"] = "BL-MUTATION-COLUMN-SHIFT"` (`tests/parser/mutation/knownHoles.ts:84`), pinned by `knownHoles.test.ts`.

**Shape (M):** the discriminator is a section whose header-to-column alignment breaks while cell count holds, calibrated against the corpus so a legitimately indented section does not warn. Plus the warn-severity `ParseWarning` code with its §12.4 lockstep triple and warning-card copy row.

**Ratchet contract:** SHRINK-ONLY, as above. Decomposition record: `BACKLOG-archive.md` § `BL-MUTATION-HARNESS-OPEN-HOLES`.

### BL-MUTATION-SECTION-ORDER — reordering two adjacent blocks silently reorders parser output

**Status:** OPEN (2026-08-06, L-wave decomposition of `BL-MUTATION-HARNESS-OPEN-HOLES`; wave spec+plan ratified 2026-08-08 — see docs/superpowers/specs/parser/2026-08-07-parser-mutation-wave-design.md) · **Severity:** medium · **Class:** PARSER ROBUSTNESS · **Effort:** M

Reordering two adjacent top-level blocks silently reorders the parser's output arrays, because the parser preserves source order. **Order-sensitivity was DISCOVERED by the harness on 2026-07-06** and section-reorder was reclassified cosmetic → corrupting as a result — this class exists because the harness found something no one had posited, which is the strongest evidence in the set that the remaining classes are worth detecting.

**Ledgered blast radius: 82 holes** (58 `wrong` / 24 `signal_loss`) — derived 2026-08-06 from `RAW_HOLES`, reproducing the umbrella's own stated "58 `SILENT_WRONG` + 24 `SILENT_SIGNAL_LOSS`" exactly. Linkage: `OPERATOR_FINDING_MAP["section-reorder"] = "BL-MUTATION-SECTION-ORDER"` (`tests/parser/mutation/knownHoles.ts:88`), pinned by `knownHoles.test.ts`.

**Shape (M):** this one is the least like the others and should be spec'd before it is built — the honest question is whether output order should be NORMALIZED (making the reorder a non-event) rather than detected, and that is a parser-contract decision, not a heuristic. If detection is chosen instead, it carries the same warn-severity `ParseWarning` code plus §12.4 lockstep triple and warning-card copy row as its siblings.

**Ratchet contract:** SHRINK-ONLY, as above. Decomposition record: `BACKLOG-archive.md` § `BL-MUTATION-HARNESS-OPEN-HOLES`.

### BL-PARSER-FIELD-PROVENANCE-MODEL — per-field provenance/confidence for the P0-2 zero-signal residuals

**Status:** OPEN · **Severity:** medium · **Class:** PARSER ROBUSTNESS / DATA PROVENANCE · **Effort:** L · **Filed:** 2026-08-06 (L-wave, spec §2.1.5)

The 2026-07-07 e2e real-world-variation preparedness audit names a per-field provenance/confidence model as the structural fix for its P0-2 class (confident wrong values rendering as authoritative). It is listed as **§7 item 5, "Medium (structural, from prior audit, still the right long-term move)"** and carried in the §11 shipped-status table as item 4: _"Provenance model (§7 item 5 remainder) — the long-term move for the P0-2 zero-signal residuals; 9+ territory. — ⏳ still the open long-term move."_ This row is that remainder, filed honestly rather than left as a dangling audit reference.

**What already SHIPPED, so this entry is not re-litigated as unstarted.** The audit's §10.5 P0-2 row records the class as **BOUNDED, not closed**, by three layers that all landed: detection (`CREW_COLUMN_POSITIONAL_FALLBACK` #361, then ambiguity-warnings-v1 **#367** — four judgment-call warn codes with `blockRef.field` anchors and the wizard third state), monitoring (#366/#370), and a three-legged single-source correction layer (fix-in-sheet + Re-sync, use-raw reversal #388/#393/#394, role-token mapping #396). The `fast-check` property-fuzz layer (**#379**) is the other half-step toward provenance. The audit's own words: the structural fix is _"partway there."_

**The residual this entry actually covers — the audit's named zero-signal cases, the ones where NO warning fires by construction:**

- a **mis-read date that stays MDY-monotone**, because the DMY heuristic only trips on a strict sequence violation (`lib/parser/blocks/dates.ts:513-534`);
- a **wrong-but-`explicit` `date_restriction`** — the value is well-formed and marked explicit, so nothing downstream doubts it;
- **mis-splits that evade the heuristics** entirely.

Each is a value the system is confident about and wrong about, with no signal prompting Doug to look. That is precisely the gap detection cannot close by adding more warn codes: these parses emit none **by definition**.

**Why L.** A provenance model means every field carries where it came from and how confidently — a schema change, a parser-wide threading of provenance through every block reader, and a UI contract for surfacing confidence without drowning the operator in caveats. The audit sizes it "9+ territory". **It is explicitly NOT implemented by the L-wave** (spec §4 limit 5); this row exists so the remainder is schedulable rather than living only inside an audit document.

**Promotion prerequisite:** its own design session. The first question that session must settle is whether provenance is stored (a schema-carried per-field record) or derived (recomputed at read time from the parse), because that choice determines whether re-sync must preserve it — and the use-raw overlay (#388) is the worked precedent for a decision layer that survives a full-replace re-sync.

**Source:** `docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` §7 item 5, §10.5 (P0-2 row), §11 item 4.

### BL-LEDGER-GIT-TIMEOUT-CONSTANTS — the git adapter's three spawn timeouts are unassertable through its own surface

**Status:** OPEN (2026-08-04, `chore/guard-premise-reachability`) · **Severity:** low · **Class:** TEST COVERAGE · **Effort:** M

`FETCH_MS`, `LS_REMOTE_MS` (both 30 000 ms) and `GH_MS` (10 000 ms) at `scripts/lib/ledger-git.ts:32-34` are handed straight to `spawnSync`'s `timeout` option. Three source mutants of them — `30_000 -> 30_001` twice and `10_000 -> 10_001` — survive `tests/scripts/ledgerClaimsCheck.test.ts` and cannot be killed through the adapter's public surface. The only behaviour that separates a mutant from clean is whether a child running for between 30 000 and 30 001 ms is killed, so an assertion means either waiting the bound out — a 30 s test per constant, on a suite that runs on every merge — or reaching into the spawn.

Ledgered `accepted-gap`, not `equivalent`, in `tests/mutation/source/registry.ts`: a timeout a test could reach WOULD be observable, so an equivalence claim would overclaim. They therefore count as survivors and depress that surface's mutation score rather than being excluded from it.

**Closing this** means giving the adapter an injectable spawn seam — a module-level `run = spawnSync` a test can replace, or an options object carrying the three bounds — and asserting the value each reader passes. That is a redesign of the one module in this repo permitted to spawn, and it widens the surface the "nothing outside this may spawn" structural guard has to police.

**Deferred from `chore/guard-premise-reachability` under class-sweep exception (c) — the repair redesigns a surface this PR does not otherwise touch.** The sweep is complete: all three constants were found and dispositioned together, so this entry covers every instance of the class rather than one peer of several. The gap was named once before, in `5f1a98a66`'s commit message, and until now had no ledger row.

---

### BL-EXPORT-BLANK-ROW-SEGMENTATION — blank-row block segmentation fuses/splits sections silently (audit #10)

**Status:** OPEN at residual scope (partial closure 2026-07-27, `fix/export-blank-row-segmentation` — spec `docs/superpowers/specs/2026-07-27-export-blank-row-segmentation.md`) · **Severity:** medium · **Class:** EXPORT/PARSER ROBUSTNESS · **Effort:** L
**l-wave-screen 2026-08-06:** PREREQ-trigger — the residuals have no corpus-clean discriminator (the generic orphan-block rule was probed and REFUTED at 30 false positives); the in-body promote trigger is a live mis-grouped show.
**Promotion prerequisite:** a live mis-grouped show — a spacer-row stray value or mid-section blank row mis-groups data with no operator signal (the in-body "Trigger to promote" line, hoisted to a recognized gate field 2026-08-07 so the ledger viewer classifies the row as gated (watch); the Status lead was reworded from "PARTIALLY CLOSED" in the same pass because the viewer's terminal-status matcher read it as archived).

**Partial closure (2026-07-27):** two of the three spec'd fix directions shipped. (b) **Header-aware segmentation** — `splitBlocks` now starts a new block at a mid-block row whose first non-blank cell is an uppercase known section header (`isMidBlockSectionStart`, `lib/parser/knownSections.ts`; `CLIENT` excluded on corpus evidence), closing the FUSE case structurally for uppercase-known headers with corpus-verified zero output drift (`tests/drive/round-trip-fixture.test.ts` byte-equality + archived-tab fingerprint golden). (c) **Crew-scoped orphan detection** — a new warn-severity `ORPHANED_CREW_ROWS` ParseWarning (operator card + crew-region deep link) fires when a table block's first row carries a crew-role cell (≥2 distinct Load In / Load Out / Strike / Set tokens on one line) with no section header — the SPLIT case for crew rosters, at 0 corpus false positives and 29/29 simulated-split recall (ratcheted by `tests/parser/orphanedCrewRowsCorpus.test.ts`). **The backlog entry's generic orphan-block rule ("no recognizable header adjacent to a recognized section") was probed and REFUTED: 30 false positives on the live corpus** (GEAR-tab gear lists under room headers, INFO free-text blocks, PULL SHEET title rows) — blocks starting with non-header rows are normal sheet layout. **Residuals (still open):** splits of non-crew sections (hotel/transport/details tails have no corpus-clean discriminator); fuses onto mixed-case or unknown headers; crew rows carrying fewer than two role tokens on one line of one cell (including role cells authored with literal pipes, which the parser's cell split decomposes); and the mutation harness cannot observe the exporter-level fuse fix (it mutates exported markdown, never the grid), so `blank-row:remove` ledger holes remain by construction.

`splitBlocks` (`lib/drive/exportSheetToMarkdown.ts:127-144`) segments the sheet grid into blocks using fully-blank rows as the **only** delimiter. Two failure modes, both silent: (a) a stray value in a spacer row (normal authoring noise — a forgotten cell, a note typed into the gap) **fuses** two adjacent sections into one block, so the downstream parser attributes one section's rows to another; (b) a blank row inserted mid-section **splits** one section into two blocks, orphaning the tail rows from their header. Neither emits a signal — mis-grouped sections flow into the parser as plausible structure. The 2026-07-07 e2e audit re-verified this unchanged; the 2026-07-10 re-rating (§10) left it as the only numbered finding with zero movement (2 fixed, 2 partial, 1 by-design). The mutation harness pins the blast radius (`blank-row:inject` / `blank-row:remove` holes in `knownHoles.ts`, mapped via `OPERATOR_FINDING_MAP` — see BL-MUTATION-HARNESS-OPEN-HOLES above) but detection-in-tests is not detection-at-runtime. **Fix directions (pick at spec time):** (a) near-blank-row heuristic — a row with exactly one short non-blank cell adjacent to blank rows emits a warn-severity `ParseWarning` instead of fusing; (b) section-header-aware segmentation — a row matching a `KNOWN_SECTION_HEADERS` shape mid-block starts a new block (closes the fuse case structurally); (c) orphan-block detection — a block with no recognizable header row adjacent to a recognized section warns as a probable split. Any fix hardens a mutation-harness class → the corresponding ledger holes become `staleRows` per the ratchet above. Trigger to promote: a live show where a spacer-row stray value or mid-section blank row mis-groups data with no operator signal.

---

### BL-TRANSPORT-ID-RESOLUTION — the deferred red-first regression pins for `transportTileVisible`

**Status:** OPEN at residual scope · **Severity:** low · **Class:** TEST COVERAGE · **Effort:** S · **Filed:** 2026-07-09 · **Resized:** 2026-08-06 (L-wave)

> **RESIZED 2026-08-06 (L-wave, `feat/l-wave-docs`), decided by probe.** The entry's headline residual
> — id-based transport visibility — landed as Flow 8.3b (#380). `transportTileVisible` now carries
> a garble-proof id path: Branch 0 matches `transportationOwnerIds.includes(viewerId)` before any name
> comparison (`lib/visibility/scopeTiles.ts:189,200,214-215`, re-probed 2026-08-06), and the
> preparedness audit's shipped-status table records "8.4 transport visibility fully closed".
>
> What did NOT land is the deferred REGRESSION PIN SET, and that is the entire remaining content of
> this row. Probed 2026-08-06: `rg -n 'Bill Werner|William Werner' tests/visibility lib/visibility`
> returns nothing (exit 1). **The pin-set probe must grep the SPECIFIC named fixtures** — greping the
> abundant `namesRefer` / `transportationOwnerIds` tokens instead would false-green, since those exist
> precisely because the id path shipped. Resized L → S accordingly: what is left is one red-first test
> task against an existing predicate, not a feature.

**The residual, verbatim from the original deferral — land these RED-FIRST** (they were removed from
`flow8-self-serve-trio` at plan-review Round-11 because a green-only regression-pin task conflicts with
plan-wide invariant 1, and they belong red-first in the branch that next touches this predicate):

Pin `transportTileVisible`'s CURRENT fuzzy-name tolerance against name-parse-variance regression:

- driver `"Doug"` vs viewer `"Doug Larson"` → visible (prefix)
- `"Douglas Larson"` vs `"Doug Larson"` → visible (surname)
- assigned-names `["Bill Werner"]` vs `"William Werner"` → visible
- case/trim `"  doug larson "` → visible
- negative controls: `"Jane Smith"` → not visible; empty / `null` → not visible; admin → visible when transportation exists
- the **known-gap fixture**: driver `"Doug Larson Loadout"` vs `"Doug Larson"` → **not visible**, verified live (the multi-token rule compares last tokens, `"loadout"` ≠ `"larson"`, `lib/data/nameMatch.ts:50-53`)

**Why the known-gap fixture stays a NEGATIVE assertion, given Branch 0:** Branch 0
only fires when `transportationOwnerIds` carries the viewer's id. The fuzzy-name branch is still the
fallback for legs with no resolved owner id, so its tolerance — and its documented hard-mis-parse hole
— remain live behaviour worth pinning. Pinning the name branch is not redundant with the id branch;
they are different code paths for different data states.

**Prior work, recorded so no future pass re-derives it:** the enrich-time no-match admin warning
shipped in Flow 8.4 (PR #374) — `lib/sync/enrichTransportAssignees.ts` emits an admin-only aggregate
`TRAVEL_TRANSPORT_NAME_UNMATCHED` (`gateExempt: true`) when a transport name references a crew member
who would not see their own tile. The id-persistence half that PR called "architecturally infeasible
in the enrich pass" (a crew uuid is DB-assigned at APPLY via `gen_random_uuid()`) was solved at
apply-time by 8.3b, which is why Branch 0 exists.

---

## Crew-page share-link chrome (2026-07-14, share-link-instant-rotate-dedup)

## Share hub follow-ups (2026-07-25, share-link-chrome-backlog)

## BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS — one component retained by contract; the other four retired

**Effort:** XS

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

## BL-OPS-LOG-DASHBOARD-BANNER — the operator-log sink has no admin-visible reader

**Status:** OPEN · **Severity:** medium · **Class:** OBSERVABILITY / UI · **Effort:** M (Opus/UI, design-gated) · **Filed:** 2026-08-06 (L-wave decomposition of `BL-OPS-LOG`)

The durable sink is built and written (`lib/log/persist.ts:16` → `app_events`), but **its only reader is developer-gated.** Re-verified 2026-08-06: `loadAppEvents` and `loadCronHealth` have exactly ONE UI consumer, `app/admin/dev/telemetry/page.tsx`, which calls `requireDeveloperIdentity()` at `:24`. The `lib/observe/query/*` modules are non-logging copies feeding the `pnpm observe` CLI, not a surface. **No admin-dashboard surface reads `app_events` at all** — the two hits in `app/admin/actions.ts:81,168` are comments about paths that leave no row.

Consequence: Doug must leave the dashboard to see operator telemetry and, as a non-developer, likely cannot reach the page at all. Everything the other two children emit lands somewhere he cannot look.

**Why M and DESIGN-GATED, not S:** this is a new admin surface, not a query change. What belongs on a dashboard banner — which severities, what recency window, what dismissal behavior, whether it is a banner at all rather than a panel or a bell-badge source — is a product decision, and it is Opus/UI work under the invariant-8 dual gate. Do not implement it as "render the telemetry table on the dashboard."

**Possible bundle, with the caveat that decides it:** `BL-ADMIN-PER-SHOW-HISTORY` wants a per-show operator history view, and both surface operator history to an admin — but they read DIFFERENT stores today. This entry's sink is `app_events`; that entry's own body names `sync_history` / `pending_syncs` / `shows` and `shows_internal.parse_warnings`, and sync history persists to `sync_log` (`lib/sync/syncLog.ts:43`). So a bundle is a DESIGN question (should one surface span both stores?), not a shared read path to be reused. Decomposition record: `BACKLOG-archive.md` § `BL-OPS-LOG`.

## BL-E2E-APP-DEPENDENT-SPECS-CI-DARK — 43 app-dependent e2e specs are named by no CI workflow

**Status:** OPEN · **Severity:** MEDIUM (dark regression coverage) · **Class:** CI wiring · **Effort:** L · **Filed:** 2026-08-06 (L-wave, refile of `BL-E2E-LIFECYCLE-SPECS-CI-DARK` at honest scope)

**43 standalone-allowlist e2e specs are named by no CI workflow** — the `UNSEEN` rows of `tests/ci/_metaE2eWorkflowCoverage.test.ts`. They are the residual of the 2026-07-26 CI-dark cluster, which closed everything that did NOT need a running application: `standalone-e2e.yml` now runs the whole standalone config unfiltered on every PR, and that alone retired 30 allowlist rows.

**Census, counted 2026-08-06 rather than estimated** (the "~60" this entry was first filed with was wrong, and the miscount is recorded so the number is not re-inflated):

| Allowlist rows                                                                                         | 66  |
| ------------------------------------------------------------------------------------------------------ | --- |
| `UNSEEN` — named by no workflow, **this entry's population**                                           | 43  |
| `PATH_GATED` — named by a workflow, runs when its filter matches                                       | 13  |
| `PATH_GATED_BY_EXCLUSION` — named, runs unless the change is prose-only                                | 6   |
| `LOCAL_ONLY` — local artifact by design                                                                | 1   |
| custom-reason rows (`admin-lifecycle-transitions`, `attention-modal-gallery`, `section-header-visual`) | 3   |

Path-gated rows are NOT this entry's scope: a workflow does name them, and "not PR-blocking-capable" is a different property from "runs nowhere". Conflating the two is what produced the original overcount.

**The blocker is not uniform, and promoting the cheap ones first is the obvious first batch.** Most of the 43 need a dev server AND a seeded database, which is why the cluster excluded them — but not all do: `sample.spec.ts`, for instance, requests `/` and asserts the title. Sorting the 43 by what they actually require, and wiring the no-seed ones first, is a cheaper opening move than the entry's original all-or-nothing framing implied.

**This entry replaces a row whose heading premise had gone false.** Its predecessor was named for two `admin-lifecycle` specs being invoked by no workflow; both have been wired since 2026-07-27 and run on `mobile-safari` on every `pull_request` (`.github/workflows/lifecycle-layout-e2e.yml:110,130,132`, re-verified 2026-08-06). The full wiring history is preserved in `BACKLOG-archive.md` § `BL-E2E-LIFECYCLE-SPECS-CI-DARK`. Only the app-dependent residual survives here, and the scope has not changed — only the name now matches it.

**Promotion path — the entry's own, and it is incremental by design:** land green batches one at a time rather than attempting all 43. `crew-e2e.yml`'s `CREW_E2E_ONLY` + `pnpm db:seed` pattern is the working template for an app-dependent job, and `lifecycle-layout-e2e.yml` is the worked example of the acceptance bar a batch must clear: **five consecutive green normal-dispatch runs** before a spec is considered wired (spec §6.1 / AC-6). That bar is what took the transitions spec from "one flaky case" to wired, and it is the reason batches must be small.

**Owner action that no branch can close.** Promoting e2e jobs into the branch-protection required set — so a red e2e blocks merge at the GitHub layer — is a GitHub-settings action, not repo code. Measured 2026-07-26: the live required set holds TWELVE contexts, and no e2e job is among them, which is why every e2e job is advisory. Until an owner changes that, enforcement is the pipeline's all-checks-green procedural gate. Measurement: `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md` §2.5.

**Structural guard already in place:** the workflow-coverage meta-test with its reasoned allowlist (`tests/ci/_metaE2eWorkflowCoverage.test.ts`) shipped with the archive-row-menu-idiom branch. Wiring work here is moving a spec OFF that allowlist by adding it to a workflow — the guard makes each removal explicit rather than silent.

**Related, filed separately:** `BL-E2E-LAYOUT-FIXED-WAIT-RESIDUE` (three fixed waits the 2026-08-03 class sweep found in the layout spec).

## BL-FITWITHINCLIP-DOUBLE-MOUNT-MEASURE — the hook measures twice on every mount

**Effort:** S

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

**Effort:** S

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

**Effort:** M

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

### BL-PRIVATE-IMAGE-PIPELINE — Migrate diagrams gallery to `next/image` with auth-preserving pipeline

**Effort:** L (scope floor — design-gated)
**l-wave-screen 2026-08-06:** PREREQ — scope floor — needs its own private-image-pipeline design session.

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

**Effort:** L (scope floor — design-gated)
**l-wave-screen 2026-08-06:** PREREQ — scope floor — a schema/data-model decision, and the store is part of what must be decided. This entry's own body names `sync_history` / `pending_syncs` / `shows` and `shows_internal.parse_warnings`; sync history and warnings persist to `sync_log` (`lib/sync/syncLog.ts:43`), NOT to `app_events`. A possible bundle with BL-OPS-LOG-DASHBOARD-BANNER is worth evaluating because both surface operator history to an admin, but they read DIFFERENT stores today, so the bundle is a design question rather than a shared read path. (Corrected 2026-08-06: an earlier version of this stamp asserted a shared `app_events` read path, which pre-selected a store that does not hold this history.)

**Store correction 2026-08-06 (L-wave, cross-model review R3):** the body below proposes a new table or view and states schema work is mandatory. That is no longer established. `public.sync_log` already carries `show_id`, `drive_file_id`, status/code, warnings, and `occurred_at`, and `querySyncLog` (`lib/observe/query/syncLog.ts:24`) already filters per show/file and orders newest-first — so a per-show history view may need no new schema at all. What remains genuinely open is whether that store's COMPLETENESS, RETENTION, and INDEXING suit an operator-facing history, which is a design question rather than a schema prerequisite. Read the body's schema framing as superseded by this note.

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

screen-disposition 2026-08-04: PREREQ-FENCED, stays open, NOT claimed by any branch of this arc. The fence is the entry's own, quoted: promotion requires "(a) cross-platform visual regression suite lands and shows the emoji glyph as a real friction point" — closing it now would violate the entry rather than honor it, and the suite does not exist. **Citation corrected in this pass:** the glyph is no longer at `_PickerInterstitial.tsx:171`; it moved to `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx:148`, inside `<span data-testid="picker-row-lock" aria-hidden="true">` at `:144`, with the sr-only hint already a sibling at `:150` (fed `messageFor("IDENTITY_DEACTIVATED_LOCK_HINT")` from `_PickerInterstitial.tsx:212-215`). So the entry's proposed "thread the aria-label to the parent span" is already satisfied by a different mechanism; only the glyph swap remains, and it stays fenced.

---

### BL-IDENTITYCHIP-SUB390-COLLISION — IdentityChip + page title collision audit at 320px

**Filed:** 2026-05-24 from M11.5 §B impeccable v3 attestation (Unit 3 — post-pick header chrome critique P3).

**Effort:** S

**Description:** Header.tsx places the IdentityChip as the right-slot when present. The title column gets `min-w-0 flex-1`; the chip column gets `shrink-0 self-start`. At 320px viewport (sub-target), the title + chip could collide depending on title length + chip's name+role string length.

**Why backlog, not deferred:** 390px is the documented mobile primary target (PRODUCT.md "Indoor corporate event environments ... Devices are personal phones (Safari/Chrome, ~390px)"). 320px is out of spec. Crew on a 320px phone would see fold-down behavior or text truncation — annoying but not broken.

**Promotion prerequisite:** EITHER (a) Doug or a crew lead reports a 320px collision in the wild, OR (b) the project's mobile primary target widens to include sub-390px viewports.

**Promotion mechanics:** Likely solution is to allow the right slot to wrap below the title at narrow widths (`flex-col sm:flex-row` on the parent). Test pin via Playwright `setViewportSize({ width: 320 })` boundingbox assertion.

**Reachability:** INFERRED, NOT PROBED — the probe that settles it: Playwright `setViewportSize({ width: 320 })` against the post-pick crew header, asserting the bounding boxes of `components/layout/Header.tsx:68` (the `min-w-0 flex-1` title column) and `:118` (`data-testid="page-header-right-slot"`, `shrink-0 self-start`) do not overlap, using the longest name+role string the corpus actually contains. Run that BEFORE any layout change.

screen-disposition 2026-08-04: PREREQ-FENCED + ANNOTATED, stays open, NOT claimed. Two independent reasons to leave it: the entry's own words are hedged ("could collide depending on title length + chip's name+role string length", "320px is out of spec"), and its fence is external — "(b) the project's mobile primary target widens to include sub-390px viewports". The probe above is now the first scheduled step per the ledger filing bar, rather than the layout change.

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

**Effort:** L
**l-wave-screen 2026-08-06:** PREREQ — waits on the operator explicitly wanting non-crew undo; the capture-widening cost is judged then, not now.
**park-review 2026-08-07:** trigger re-checked with the owner — unfired. No operator has wanted to un-apply a non-crew change in-app; "edit the sheet to change this" remains the intended path (the feed spec's §6.2 rationale — sheet stays the source of truth, and even crew undo is only a temporary `undo_override` pin that releases when the sheet reconciles or moves on, §4.3). Stays PREREQ-fenced. The gate field below was split out of the compound "Technical home + promotion prerequisite" label in this pass so the ledger viewer classifies the row as gated (watch) rather than open.

**Filed:** 2026-06-10 from the shipped "sync changes feed + identity-only gate" milestone (PR #19, `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-08-sync-changes-feed-identity-gate-design.md` §1 non-goals / §7 / finding F6).

**Description:** v1 undo covers **crew-identity** changes only (`crew_added` / `crew_removed` / `crew_renamed`). Non-crew auto-applied changes — MI-7 section shrinkage, MI-8/8b/8c field degradation, asset drift (DIAGRAMS\_\*/REEL_DRIFT) — render as **notification-only** feed rows (`action='none'`, null `before_image`, "edit the sheet to change this" pointer). This entry would extend per-item undo to those rows.

**Why backlog, not deferred — F6 showed it's "not cheap" + no committed trigger:** the undo restore path needs the **pre-apply state** in `before_image`, but the Phase-2 snapshot (`applyShowSnapshot` → `previousCrewMembers`, `lib/sync/runScheduledCronSync.ts:913-932,1088-1100`) captures **prior crew rows ONLY**. It does NOT snapshot prior hotel/room/contact rows, show fields, diagrams, or reel state. Backing non-crew undo requires **widening that prior-state capture** per domain (a real Phase-2 change), plus a domain-specific restore in `undo_change` and the feed's undoable predicate. The approved scope call (#9) was "crew-identity undo first, non-crew only if cheap"; F6 determined non-crew is not cheap.

**Technical home:** widen `applyShowSnapshot`/`before_image` to capture the relevant prior non-crew rows → add the domain to `undo_change`'s direction handling + the feed's `isCrewDomainChangeKind`-style predicate (it currently single-sources `{crew_added,crew_removed,crew_renamed}`).

**Promotion prerequisite:** an operator explicitly wants to undo a non-crew change in-app (rather than re-editing the sheet), and the capture-widening cost is judged worth it.

---

### BL-CLASSNAME-ARRAY-JOIN-MIGRATION — migrate the 18 array-join classNames so the canonical-class rule can see them

**Status:** IN PROGRESS · **Branch:** refactor/classname-array-join-cn

**Severity:** LOW (lint coverage, no user-visible defect) · **Class:** lint coverage · **Filed:** 2026-08-04 (`chore/sweep-guards-tests`, split out of BL-CANONICAL-CLASS-ARRAY-BLINDSPOT under class-sweep exception (c)) · **Effort:** M · **Reachability:** PROBED 2026-08-04 — 18 files, 33 sites, enumerated in `tests/specLint/canonicalClassArray.test.ts`.

**Description:** `better-tailwindcss/enforce-canonical-classes` cannot traverse `[...].join(" ")`, so Tailwind drift inside those classNames escapes `pnpm lint` and CI. The blind spot is now BOUNDED by a census guard — no NEW array-join className can land — but the 18 existing files remain unreadable to the rule.

**Two shapes,** both covered by the census: inline `className={[...].join(" ")}` (15 files) and joined-into-a-local-then-used-as-className (3 files: `_PickerInterstitial.tsx`, `Section.tsx`, `AccentButton.tsx`).

**The parent entry's prescribed fix does not apply as written.** It says "migrate to `cn(...)` (already a default-detected callee)". Probed 2026-08-04: **there is no `cn` helper anywhere** under `lib/`, `components/` or `app/`, and neither `clsx` nor `class-variance-authority` is a dependency — the eslint config names them only in a comment describing plugin defaults. So this is not the mechanical `eslint --fix` the parent promises: it must first INTRODUCE a recognized callee, which is a dependency-or-helper decision in its own right. `tests/specLint/canonicalClassArray.test.ts` asserts the absence, so the day a `cn` lands this becomes cheap and the test says so.

**Why not done on `chore/sweep-guards-tests`:** class-sweep exception (c). The repair spans 20 files under `components/` and `app/`, which would make that branch an invariant-8 UI surface; the plan scopes the dual gate to the UI branch and marks the guards branch `impeccable-gate: N/A — no UI surface`. Doing it there would either violate the plan's scoping or drag a 20-file UI refactor through a guards review.

**Work:** decide the callee (add a small local `cn`, or take `clsx`), migrate the 33 sites, run `eslint --fix`, delete the census guard and its entry. Lands on a UI branch under the dual gate.

---

### BL-SHADOW-TILE-ARROW-SYNTAX — `shadow-(--shadow-tile)` is not canonicalized, and globals.css claims it is

**Severity:** LOW (documented inconsistency, nothing renders differently) · **Class:** lint coverage · **Filed:** 2026-08-07 (`refactor/classname-array-join-cn`, spec §9.1 / R5, class-sweep exception (c)) · **Effort:** S · **Reachability:** PROBED 2026-08-07 — 24 textual matches across 18 files (21 class-string sites; 3 are doc comments), all live under a passing `pnpm lint`.

**Description:** `app/globals.css:285-289` instructs components to prefer the canonical `shadow-tile` over the `shadow-(--shadow-tile)` arrow form and states _"(eslint-plugin-better-tailwindcss enforces this)."_ **Probed false.** A plain-string className carrying `shadow-(--shadow-tile)` — the shape the rule reads best — is reported clean. This entry owns both the sweep and correcting that false claim in the comment.

**The mechanism is the token's VALUE, not its namespace,** which is what makes this bigger than shadows. The rule canonicalizes a token whose `@theme` value is a literal and skips one whose value is itself a `var()` reference. Probed, four cases in `app/globals.css`:

| `@theme` value                                    | Line | Arrow/bracket form                  | Reported? |
| ------------------------------------------------- | ---- | ----------------------------------- | --------- |
| `--spacing-right-now-min-h: 176px`                | 216  | `min-h-(--spacing-right-now-min-h)` | **yes**   |
| `--spacing-confirm-box: 60px`                     | 186  | `max-w-[60px]`                      | **yes**   |
| `--shadow-tile: var(--shadow-tile-runtime)`       | 293  | `shadow-(--shadow-tile)`            | no        |
| `--shadow-popover: var(--shadow-popover-runtime)` | 302  | `shadow-(--shadow-popover)`         | no        |

So this is not a `shadow-*` carve-out: **every `@theme` token defined through a `-runtime` indirection — the pattern this project uses for all light/dark-spanning tokens — is invisible to the rule.** Both forms resolve to the same token, so the consequence is a documented inconsistency, not a defect.

**Why not done on `refactor/classname-array-join-cn`:** class-sweep exception (c) — 21 sites spanning files that arc does not otherwise touch, which would blow its review scope.

**Work:** sweep the 21 class-string sites to `shadow-tile` / `shadow-popover`, correct the `app/globals.css:288` enforcement claim, and decide whether the `-runtime` indirection blind spot deserves its own guard.

---

### BL-CLASS-CONST-LINT-BLINDSPOT — class strings in arbitrary-named consts and object values stay unlinted

**Severity:** LOW (lint coverage, no user-visible defect) · **Class:** lint coverage · **Filed:** 2026-08-07 (`refactor/classname-array-join-cn`, spec §9.2 / R6, class-sweep exception (c)) · **Effort:** S-M · **Reachability:** PROBED 2026-08-07 — shape matrix run against the real config (spec §2.3).

**Description:** `better-tailwindcss/enforce-canonical-classes` traverses string literals, recognized callees, and the `^classes$` variable selector. It does NOT traverse a class string bound to an arbitrarily-named const, an object value, or an identifier passed INTO a recognized callee. Probe table:

| Shape                                                | Reported?                                                         |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| `className="… min-h-(--spacing-tap-min)"`            | **yes**                                                           |
| `cn("…", "min-h-(--spacing-tap-min)")`               | **yes**                                                           |
| `cn("…", cond ? "min-h-(--spacing-tap-min)" : "…")`  | **yes**                                                           |
| `const anyName = cn(…)` used as a className          | **yes** — the callee match does not depend on the variable's name |
| `cn(IDENT, …)` where `IDENT` is a class-string const | **no** — identifier args are not followed                         |
| `const TRACK_BASE = "… min-h-(--spacing-tap-min)"`   | **no**                                                            |
| `const classes = "… min-h-(--spacing-tap-min)"`      | **yes** — `^classes$` variable selector                           |
| `const SIZE = { sm: "… min-h-(--spacing-tap-min)" }` | **no**                                                            |

**Surviving dark sites after the cn migration:** `DeveloperToggleButton.tsx` `TRACK_BASE:78` / `THUMB_BASE:80` / `TAP_TARGET:83`; `AccentButton.tsx` `SIZE_CLASS:83` / `WEIGHT_CLASS:91` / `RING_OFFSET_CLASS:96` / `BASE_CLASS:104`; `OnboardingWizard.tsx` `base:126` / `focusRing:128`.

**This is a DIFFERENT mechanism from the array-join blind spot** and was never covered by the census guard, so the cn migration neither worsens it nor is responsible for it. `tests/specLint/canonicalClassCallee.test.ts` records deliberately that its recognizer does not decide these either — its subject is the join, and the join alone.

**Cheap known repair, which is why this is filed rather than merely noted:** rename to `classes` (which the plugin's variable selector matches) or wrap in `cn(...)`.

**Why not done on `refactor/classname-array-join-cn`:** class-sweep exception (c) — a different mechanism needing its own recognizer decision, not another instance of the shape that arc repaired.

---

### BL-ESLINT-CONFIG-ARRAY-JOIN-COMMENT-STALE — the eslint config's array-join comment outlived the sites it describes

**Severity:** LOW (stale comment, no behavior) · **Class:** docs accuracy · **Filed:** 2026-08-07 (`refactor/classname-array-join-cn`) · **Effort:** XS · **Reachability:** PROBED 2026-08-07 — read at `eslint.config.mjs:64-70` on the post-migration tree.

**Description:** The comment above `"better-tailwindcss/enforce-canonical-classes"` says array-style patterns like `className={[...].filter(Boolean).join(" ")}` "are NOT covered by the plugin's default selectors — those are linted **by hand** on initial canonicalization." Its first clause is still true (the plugin genuinely cannot traverse an array join); its second is not. After `refactor/classname-array-join-cn` there are no array-join classNames left to lint by hand, and `tests/specLint/canonicalClassCallee.test.ts` reports any new one as a hard failure rather than leaving it to a manual pass.

**Why not fixed in the arc that made it stale:** class-sweep exception (b) — a ratified scope fence. `eslint.config.mjs` is not in that plan's declared-delta allowlist (C4 step 4.3), and widening the allowlist after the diff had passed cross-model review would have put an unreviewed file in the merge.

**Work:** replace the second clause with a pointer to the zero-tolerance guard. One comment edit.

---

### BL-WIZARD-CONNECTOR-MAXW-INERT — the wizard step connector renders 0-width, so its `max-w` is a dead constraint

**Severity:** LOW (cosmetic; an intended hairline separator never renders) · **Class:** UI correctness · **Filed:** 2026-08-07 (`refactor/classname-array-join-cn`) · **Effort:** S · **Reachability:** PROBED 2026-08-08 — measured `getBoundingClientRect()` in mobile-safari at 390px AND at 900px: both connectors are `0 × 1` at both widths.

**Description:** `components/admin/OnboardingWizard.tsx` renders a step-indicator connector after steps 1 and 2 as `<span className={cn("h-px max-w-confirm-box flex-1 rounded-full", …)} />` — evidently intended as a hairline rule between the step pills. It never renders: measured 0px wide at every viewport.

**Cause is structural, not a viewport threshold.** `StepIndicator`'s `<nav>` is `flex items-center gap-2`, and it sits inside `<div className="flex items-center justify-between gap-3">` — a ROW flex container, in which the nav is a flex ITEM with the default `flex: 0 1 auto` and therefore sizes to its CONTENT. A content-sized flex container has no free space to distribute, so the connector's `flex-1` resolves to 0 and its `max-w` upper bound never applies. Widening the viewport does not help; the nav simply stays as wide as its pills and labels.

**Consequence for the cn arc, recorded so it is not rediscovered as a finding:** C1 (`max-w-[60px]` → `max-w-confirm-box`) cannot be verified by measuring this element — a rect equality there is `0 == 0` before and after. `tests/e2e/canonical-class-dimensions.spec.ts` keeps both connector keys as a REGRESSION TRIPWIRE and asserts the 0-width state explicitly, so the day the layout changes the spec says so; C1's discriminating proof is the deterministic token assertion in `tests/specLint/canonicalTokenIdentity.test.ts`.

**Why not fixed in the arc that found it:** class-sweep exception (a) — it needs a design decision the cn arc could not settle. Making the connector visible is a deliberate visual change to the wizard's step indicator (spec §9.4 of that arc states no dimensional invariant may change), and whether the hairline should render at all — and at what width on a 390px viewport — is an impeccable/design call, not a mechanical repair.

**Work:** decide whether the connector should render; if yes, let the nav stretch (`w-full` on the nav, or `flex-1` on its wrapper) and re-baseline `tests/e2e/__baselines__/canonical-dimensions.json`, which will then measure a real 60px clamp.

---

### BL-CREW-SHEET-TEMPLATE-V2 — Standardized downloadable show-spec template to capture redesign-required fields

**Effort:** L (scope floor — design-gated)
**l-wave-screen 2026-08-06:** PREREQ — scope floor — an owner product decision on whether a standardized template is adopted at all.

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

### BL-LIBDATA-SUPABASE-CALL-BOUNDARY-METATEST — Structural meta-test for `lib/data` Supabase call-boundary discipline

**Effort:** M

**Filed:** 2026-06-19, crew-page redesign Phase 2 Task 02.5 (`getShowForViewer.runOfShow` projection).

**Context:** Invariant 9 (Supabase call-boundary discipline) requires every Supabase call site to EITHER carry a structural-meta-test registry row OR an inline `// not-subject-to-meta: <reason>` waiver. The auth-domain meta-test `tests/auth/_metaInfraContract.test.ts` only walks `lib/auth` / `app/auth` / `app/api/auth` / `app/api/show` (orphan scan at `:258-259`), so `lib/data` reads are outside its scan. Task 02.5's new `shows_internal.run_of_show` read in `lib/data/getShowForViewer.ts` discharged invariant 9 via the inline-waiver branch (the verbatim comment immediately above the `.select("run_of_show")` read), backed by behavioral returned-error + thrown-exception fail-soft tests. That is the in-scope discharge; this entry tracks the structural follow-up.

**Scope (if promoted):** an analogous registry-style meta-test (mirroring `_metaInfraContract`'s pattern) that walks `lib/data/**` and asserts every Supabase `.from(...)`/`.rpc(...)` call either (a) destructures `{ data, error }` and distinguishes returned-error from thrown-exception, or (b) carries an inline `// not-subject-to-meta:` waiver. `getShowForViewer.ts` already has multiple such reads (hotel/rooms/transportation/contacts/financials/run_of_show) — the meta-test would pin them all and gate future `lib/data` reads at CI time.

**Why backlog, not deferred:** the inline-waiver discharge is the complete in-scope answer for Phase 2; the structural meta-test is a hardening generalization with no committed v1 trigger. The behavioral fail-soft tests already enforce the boundary per-read; the meta-test would convert that to a class-wide CI guard.

**Promotion prerequisite:** Either (a) a second `lib/data` Supabase read lands without a waiver (real drift), OR (b) a v1.x security-hardening milestone bundles this with the related lockdown / call-boundary entries (`BL-ADMIN-POSTGREST-DML-LOCKDOWN`, `BL-RLS-COVERAGE-CROSSCUTTING`). Extend the `_metaInfraContract` pattern, don't write a parallel scanner.

---

### BL-FLIGHT-LEG-ORIENTATION — arrival/departure labels + richer flight-leg layout

**Filed:** 2026-06-19 (crew-page Phase 3 per-crew flight info, impeccable v3 dual-gate LOW/MED note). The "Your flight" card renders each `flight_info` leg (split on the TECH-path `" | "`) as an unlabeled text line. The impeccable critique noted there is no arrival/departure orientation cue between the two legs, the confirmation code is buried mid-string, and the raw passthrough is slightly spreadsheet-flavored.

**Effort:** M

**Why backlog, not now:** intentional per the ratified spec decision to render the raw `" | "`-split legs WITHOUT deep-structuring (the split is positional — for a round-trip the first leg is arrival, second is departure, but a one-way leg cannot be disambiguated, and deep-parsing route/airline/time/conf from the space-separated string is fragile/YAGNI). Adding labels/structure is only sound once a structured-leg source exists. The cleanest enabler is `DEF-FLIGHT-1` (the TRAVEL-tab parser), which could normalize into a structured shape; alternatively a TECH-path post-parser that splits arrival vs departure deterministically.

**Promotion prerequisite:** EITHER (a) `DEF-FLIGHT-1` lands a structured flight shape this card can label, OR (b) operator feedback that the unlabeled legs are a real readability friction. Until then the unlabeled raw-leg render is truthful and passes the impeccable gate.

### BL-CI-UNIT-GATE-EXCLUSIONS — gate the two files excluded from the full-suite job

**Effort:** M

> **UPDATED 2026-07-26 (PR3 of the CI-dark coverage cluster).** This entry described THREE excluded files and repeated the false premise that the local-bootstrap runner cannot provide pg_cron. `scripts/ci/supabase-local-bootstrap.sh` holds the guarded migrations aside for the INITIAL boot only, then applies them with `supabase migration up --include-all`, so that runner has always had them. `pg-cron-coverage` is no longer excluded and now runs in `unit-suite-db`; TWO files remain excluded. The promotion work this entry proposed for pg-cron-coverage is DONE — do not redo it.

**Filed:** 2026-06-22 (alongside the `unit-suite.yml` full-vitest CI gate that closed the "no gate runs `pnpm test`" gap). The new gate runs the whole vitest suite minus two files that need environments the local-bootstrap runner can't provide:

- `tests/cross-cutting/pg-cron-coverage.test.ts` — live-DB introspection of `cron.job` rows. The shared `supabase-local-bootstrap.sh` deliberately HOLDS ASIDE the two GUC-guarded `pg_cron` migrations (`app.fxav_vercel_url`), so no cron jobs exist locally → the test expects 9, gets 0. It is designed for the validation project (`TEST_DATABASE_URL` + `VALIDATION_SUPABASE_PROJECT_REF`), like `validation-schema-parity`.
- `tests/admin/test-auth-gate.test.ts` — the 3 Layer-2 "HTTP positive-path" tests drive a real Supabase `auth.admin.createUser → signInWithPassword` chain that returns 501 without the running instance's matching service-role key + a working GoTrue. They do NOT skip-when-unreachable by design (Codex M3 R2: "opportunistic skip is the wrong default for security tests"), so they fail rather than skip locally.
- `tests/cross-cutting/email-canonicalization.test.ts` — three tests set an EXPLICIT 15s per-test timeout while doc-scanning the large master spec + plan. Under full-suite concurrency on the 2-core CI runner they starve and time out, but pass STANDALONE (isolated resources) in the `x5-email-canonicalization` gate that already covers this file. (Surfaced on the gate's first real-CI run — the local-passes-CI-fails class the gate exists to catch, applied to itself.)

**Why backlog, not now:** both were ALREADY ungated before `unit-suite.yml`, so excluding them is not a regression — the gate's job was to cover the 6800+ tests that had NO gate at all. Wiring the two excluded files needs either a remote-validation job variant (TEST_DATABASE_URL pointed at the validation project, mirroring `validation-schema-parity`/`postgrest-dml-lockdown`) or a live-auth setup that provisions the matching service-role key. The `test-auth-gate` 501 may also indicate the Layer-2 tests have drifted since a route change — investigate before gating (don't freeze a possibly-broken security test green).

**Promotion prerequisite:** a CI pass that adds (a) a remote-validation matrix leg for `pg-cron-coverage` + (b) a live-auth setup (or a root-cause fix) for `test-auth-gate` Layer 2, each verified green in real CI before being added to the gate's run set.

### BL-ADMIN-NAV-BADGE-SUSPENSE-STREAMING — stream the admin nav badge counts via `<Suspense>` instead of blocking layout

**Effort:** M

**Filed:** 2026-06-23 (nav-perf Phase 2 — the descoped half of E). Phase 2's E-lite parallelized the admin layout's two badge reads (`Promise.all`), so first `/admin` entry blocks on one wall-time instead of three sequential round-trips. The further win is to stream the badges entirely OUT of the blocking layout path via `<Suspense>` so the nav chrome paints immediately and the counts arrive after.

**Why backlog, not now:** `components/admin/nav/AdminNav.tsx` is a `"use client"` component with a stateful refetch hook (`useNeedsAttentionBadge`), and the repo has **zero `<Suspense>` precedent** — streaming needs a server-child + slot bridge (refactor AdminNav's prop/slot contract) for a first-`/admin`-entry-only gain (the layout is reused across sibling navs, so its awaits don't re-run per nav). Invasive relative to the payoff.

**Promotion prerequisite:** an established `<Suspense>` streaming pattern in the codebase + an AdminNav slot refactor that lets the badge counts arrive as a streamed server child without breaking the client-side pathname-refetch hook.

### BL-RESURRECT-MOBILE-SAFARI-E2E — lift the remaining mobile-safari tile/crew specs into CI

**Filed:** 2026-06-23 (discovered building the crew-e2e CI job). **Effort:** L

> **CORRECTION 2026-08-06 (L-wave, `feat/l-wave-docs`).** The entry's founding premise — "NO CI
> workflow runs the `mobile-safari` Playwright project" — is **REFUTED**. Three workflows run it
> today: `lifecycle-layout-e2e.yml` (`:110`, `:130`, `:132`), `crew-e2e.yml` (`:159`, alongside
> desktop-chromium), and `phantom-gap-e2e.yml` (`:175`). The project is not dark; a **subset of specs
> inside it** is. The id is KEPT deliberately — it is cross-referenced from the CI-dark cluster specs
> and the 2026-08-05 sizing sweep, and a rename would cost more than the stale title saved. The body
> below is rewritten at honest scope; the original claim is preserved in this note so the correction
> is auditable rather than silent.

**Honest residual: the ~20 M4 tile/crew specs that no workflow names.** Every CI Playwright run is
still an explicit spec list, so a spec matched by the `mobile-safari` project but named in no run
command executes nowhere. That set is roughly: `crew-page`, `schedule-tile`, `transport-tile`,
`status-financials`, `role-spoof`, `pack-list`, `notes-tile`, `right-now`, `right-now-transitions`,
`layout-dimensions`, `empty-state`, `theme-toggle`, and their siblings — the twelve that are
additionally `describe.skip` are enumerated in `BACKLOG-archive.md` §
`BL-COVERAGE-CLAIMS-CITE-SKIPPED-SUITES`. **A spec being project-matched is not coverage**, and that
distinction is the whole content of this row now.

**Why it is still L, and still not "now":** these specs have been unrun in CI for a long time and
will surface latent seed/timing/env failures. The crew corpus and the M4 tile fixtures mutate shared
rows — `workers: 1` already serializes them, but resurrecting ~20 at once is a multi-round debugging
slog, not a follow-on edit. Several also predate the crew redesign and assume a pre-redesign DOM.

**Promotion path — incremental, and the bar is already demonstrated.** Extend `crew-e2e.yml` (or a
sibling) spec by spec, triaging each failure; the `CREW_E2E_ONLY` filter + `pnpm db:seed` pattern
there is the working template. `lifecycle-layout-e2e.yml` is the worked example of the acceptance bar
a batch must clear — **five consecutive green normal-dispatch runs** before a spec counts as wired
(spec §6.1 / AC-6). Land green globs as they pass rather than flipping the project on at once.

**Relationship to `BL-E2E-APP-DEPENDENT-SPECS-CI-DARK` — it is a SUBSET, not a sibling.** Probed
2026-08-06: all twelve specs listed above are `UNSEEN` rows of the same
`tests/ci/_metaE2eWorkflowCoverage.test.ts` allowlist that entry's 43-row population is drawn from.
An earlier draft of this note claimed the two cover different populations and may close
independently; that was false in the direction that matters, and is corrected here rather than left
to be re-derived. **Closing the parent closes this one.** This entry survives as a distinct row only
because it names a coherent, prioritizable BATCH — the mobile-safari tile/crew specs, which share one
project, one seed, and one template — and the parent's own promotion path is explicitly incremental
batches. If the parent is worked wholesale, archive this as absorbed.

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

## BL-CROSSWALK-HAYSTACK-RENDERED-TEXT-ONLY — the /help UI-label crosswalk attests against all source, so a type annotation counts as a button label

**Filed:** 2026-08-05 (M-wave W-UI, U8 probe). **Class:** guard precision. **Effort:** M (touches every label in the crosswalk corpus). **Severity:** low.

`tests/help/_metaUiLabelCrosswalk.test.ts` attests that a bolded /help label names a real control by searching a haystack built from ALL production source. Comments are stripped, and U8 added import statements — both are categorically non-rendered. What remains is everything else: type annotations, identifiers, object keys. So `**Viewer**` at `app/help/getting-started/page.mdx:10` is attested by `viewer: Viewer` in `app/show/[slug]/[shareToken]/_CrewShell.tsx`, a type annotation, and the guard reports a match that proves nothing about rendered UI.

**Probed, not inferred** (U8, 2026-08-05): the word-boundary tier U8 shipped closes the ACCIDENTAL-SUBSTRING half of this — `Share` no longer matches inside `ShareHub`/`shareToken` — and is proven to discriminate by a premise fixture. It does not close the bare-identifier half, and no further lexical narrowing can: excluding identifiers wholesale would break every label that IS its component name, which is common and legitimate. `tests/help/_metaUiLabelCrosswalk.test.ts` pins the residual as an executable DOCUMENTED LIMIT that fails the day this is fixed.

**Work:** build the haystack from RENDERED TEXT ONLY — string literals and JSX text children, via the TypeScript AST rather than a regex. Decidable and bounded. Expect a wave of newly-failing labels on the first run; each is either real drift or a third-party-UI label (below), and the triage is the bulk of the effort.

**Also needs settling in the same pass: third-party UI labels have no home.** `**Share**` and `**Viewer**` in `app/help/getting-started/page.mdx` are GOOGLE DRIVE's controls, not this app's — "click **Share** on that folder… Give it **Viewer** access". They are correct copy that this guard should never have treated as candidates. The M-wave plan assumed the opposite (that the copy was wrong and should be rewritten to name real controls); the probe refuted it, and rewriting them would have made accurate documentation inaccurate. `tests/help/_uiLabelExceptions.ts` cannot hold them either: every row must cite a `DEFERRED.md M11-E-D<N>` id, and these are not deferrals. Needs a third-party-UI carve with its own reason field.

**Deferral exception: (c)** — a redesign of the guard's oracle spanning the whole crosswalk corpus, on a surface this PR does not otherwise touch. W-UI shipped the half that is closable without it.

**Status:** OPEN.
