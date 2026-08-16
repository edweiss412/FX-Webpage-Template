# BACKLOG

Speculative / lower-priority hardening items. "Might do" — not blocking, no concrete near-term trigger. (Contrast `DEFERRED.md`: "will do, concrete trigger".)

**This file is the OPEN queue only.** Resolved / shipped / superseded entries live in **[BACKLOG-archive.md](./BACKLOG-archive.md)** with full provenance — grep by id, ids are unchanged. When an item below ships, move its whole entry there rather than annotating it resolved in place; otherwise this queue silently turns into a changelog.

Last reconciled: 2026-08-15 — `feat/spec-lint-intent-red` graduated `BL-SPEC-LINT-CITATION-INTENT` and `BL-SPECLINT-RED-EXECUTABILITY-ARM`: `spec:lint` now says whether a citation resolves to the RIGHT file, and the task-marker contract's red-then-green cycle is declared and checkable. Both rows' own sketches were corrected by measurement rather than argument. The citation row asked for a per-case demotion; the corpus said the whole arm must be advisory, because the strictest content condition still fires on 15 of 135 CORRECT citations of a merged plan, and a hard code with an 11% false-positive floor gets waived reflexively. Detection was never the gap either — the shipped advisory already fired on most of the wrong citations and on 69 spans of the correct plan, so what shipped is discrimination (an enclosing-declaration rescue) and actionability (relocation hints naming which other file the doc itself cites does hold the identifiers). The red row's exempt branch for author-written reds became a DECLARED `red-state=authored` + `red-target=`, because no recognizer over task prose can decide whether a `red=` is asserted-red-now or authored-by-the-task. Validated against the citations that actually burned rounds: the fixture corpus is distilled from the KNOWN-BAD sync-log plan, not the corrected one, because the human repair of that defect made the mirror-image error on eight citations. Two wrong citations are a documented recall ceiling — a vocabulary-sharing sibling is indistinguishable by content — and are pinned as premise-guarded silent cases. The mutation gate found 26 unaccepted survivors on first run; fourteen were repaid by tests, one by a source simplification, and the rest are argued reachability rows. Prior: 2026-08-15 — `fix/changes-feed-batch-flake` graduated `BL-CHANGES-FEED-MODAL-BATCH-FLAKE`: the entry's own first-thing-to-check was checked and REFUTED. There is no cross-spec fixture collision — both CI failures hit the first spec executed, before any other spec had touched the database — and the real cause, measured from the failing runs' job logs, is a transient gateway 502 on the foreground snapshot RPC that the loader deliberately throws to the `/admin` error boundary, where a wait for the modal alone starves. The row's "passes standalone, fails in batch" evidence was a sampling artifact: standalone ran only locally, where that fault environment does not exist, so the flake correlated with "batch" by measurement design. Two defects the row did not describe were found on the way: the fatal log path rendered its PostgREST error as `'[object Object]'`, which is why the 502 had to be attributed through a same-class witness 62 seconds later, and a recovery on a GREEN run would have left no trace an operator could see — the list reporter prints no annotations and a green run uploads no artifact — so the executed-count oracle now prints every `infra-recovery` row plus a total. Filed `BL-MODAL-WAIT-BOUNDARY-HELPER-ADOPTION` and `BL-SNAPSHOT-READ-TRANSIENT-502-POSTURE`. Prior: 2026-08-15 — `fix/sync-observability-gaps` graduated `BL-MANUAL-SYNC-UNEMITTED` and `BL-PENDING-RETRY-EXISTING-SHOW-THROWS`: manual sync now records every terminal outcome, and the existing-show pending-ingestion retry executes real sync work instead of throwing `SyncInfraError` before touching anything. Both rows' own prescriptions were partly rejected with reasons recorded in the archive — a per-branch emit is the shape that failed (the single site switches exhaustively, so a new outcome variant is a compile error until the mapping says what it records), and per-route tail injection is the hand-enumerated cover that came up short five times in the parent arc (one default at the shared `applyStaged` chokepoint covers both live routes and every future caller). Three things the rows did not describe were found by sweeping rather than reading: `toResult` fell through to an implicit `null` that turned an unhandled phase-1 variant into a clean pass, four terminal branches of the SHARED pipeline wrote no row at all (three fetch-failure arms plus the pull-sheet-override TOCTOU skip, all of which benefit cron identically), and adding the production sink default made every existing applied-path unit test open a real postgres connection — probed, 14 rows written to the shared local DB, deleted, zero after the injections landed. Emit placement is load-bearing twice: post-commit, because attribution resolves in the sink's subselect and an in-tx emit is permanently NULL-attributed at show birth; and keyed on a TRACKED sink, because a throw after an outcome row already landed must add nothing rather than file a `parse_error` over it. The two live probes are why this shipped correct — the retry defect survived because the shipped tests inject `processOneFile_unlocked` itself, and the env-bound probe was verified to discriminate by re-injecting the defect. Prior: 2026-08-11 — `fix/tap-target-inline-controls` graduated `BL-TAP-TARGET-INLINE-TEXT-CONTROLS`: the per-site prose-vs-chrome judgment the row was filed to obtain, ratified by the user 2026-08-10 as **3 exempt / 5 repaired**. The exempt three are pinned in SOURCE rather than in a browser — an exempt site's contract is "unchanged source", and a rendered box cannot say whether the exemption is still the ratified decision or an accident nobody recorded; the guard pins the comment AND the class string and was proven against four mutants. The repaired five are pinned by real-browser rects on the PRODUCTION routes (red observed first at 16.80 / 19.36 / 17.05 / 16.80px), wired into `lifecycle-layout-e2e.yml` behind an execution oracle that job did not previously have. Two of the row's own site labels were wrong and were corrected from the live tree. Two measurement lessons are recorded in the archive entry because each produced a wrong answer first: `boundingBox()` is viewport-relative and Playwright scrolls between reads, which manufactured a phantom 5.4px overlap, and the container change made to "fix" that phantom was reverted once a mutant showed the suite stayed green without it. The invariant-8 gate's one P1 was refuted by measurement against a stale contrast comment in `app/globals.css`; four follow-ups filed. Prior: 2026-08-04 — `feat/harness-font-fidelity` (PR #705) graduated `BL-HARNESS-FONT-FIDELITY`: the face is declared once in `app/fonts.css` over the committed binary and read by BOTH Next roots AND by `compileEntryCss`, so the 32 standalone harnesses render what the product renders instead of the ambient host font. The entry's own count of 31 was right when filed and is 32 as shipped — the browser guard this work added is itself a caller, found by the fail-by-default wiring meta-test rather than by anyone remembering. The spec it asked for was written and its central premise EXPIRED before implementation: drafted against `next/font/google` with seven Google v20 subsets, while `main` had already moved to `next/font/local` over an upstream v4.1 subset, so shipping §3.3 verbatim would have stripped `ss04`/`zero`/`opsz` and reverted `BL-INTER-NUMERAL-DISAMBIGUATION`. User-ratified 2026-08-04 to one face over the existing bytes, with the stale sections marked SUPERSEDED in place because `consistency.mjs` cross-checks the document's own counts. Four claims were overturned by measurement rather than argument and each is corrected where it was wrong: the mutation matrix found the guard never compared the fallback's override VALUES; CI found a Linux/macOS rasterization gap (hinted 132px vs geometric 130.09375px) root-caused in the pinned container rather than papered over with a wider tolerance; the impeccable critique found a rationale written into five surfaces that this branch's own post-step had invalidated; and the audit found the binary had lost its one-year immutable cache on the move out of `.next/static/media/`, now restored by a content-hashed filename plus a `next.config.ts` header. Prior: 2026-08-04 — `fix/apply-undo-audit-fidelity` (PR #697, merge `644f8bb06`) graduated `BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP`, `BL-IDENTITYLINK-LANDED-VS-REQUESTED` and `BL-UNDO-SELECTIONS-RESET-AT-DROP`. The notice and feed now derive from rename pairs that actually LANDED, with unlanded ones recorded as a durable `IDENTITY_LINK_RENAME_UNLANDED` event — and that row's own premise was partly wrong: the feed never consumed the requested `identityLinkRenames` at all, it re-derived its own pairs from `triggeredItems` with NO accept gate, a wider defect than the row described. The notice needed a two-arm split rather than a swap, because feeding landed pairs to arm (c) as well would have fired a FALSE capability-loss notice for every pair whose source row survived; arm (c) now suppresses a loss only when the source SURVIVED, which also surfaces a real loss the old suppression hid. The roleFlagsNotice row named ONE discard site and the class sweep found FOUR (finalize-cas, ordinary finalize, `runManualStageForFirstSeen`, and the pending-ingestion retry, which bypasses the locked wrapper's post-commit tail entirely), all repaired through one shared `lib/sync/emitRoleFlagsNotice.ts` and flushed in a `finally` after the outer transaction at three sites — including the STREAMING finalize-cas handler, the one real operator traffic reaches; the structural guard against a fifth is DESCOPED and refiled as `BL-ROLEFLAGSNOTICE-DROP-GUARD`. `selections_reset_at` survives an undo, the real fix being to capture the successor's marker BEFORE the delete — the common rename path takes the clean-INSERT branch, so a merge living only in `ON CONFLICT` would never have run — with `mi11_approve_hold` repaired as a second producer dropping the column at two sites, and two historical shapes left unrescuable as documented limits. The same branch filed `BL-CAPABILITY-LOSS-SURVIVING-ROW-FALSE-POSITIVE`, `BL-SHADOW-REBUILD-EXHAUSTED-EMIT-PLACEMENT` and `BL-CODE-ENUM-PROVENANCE-COMMENT-BLIND`. Prior: 2026-08-03 — `feat/inter-numeral-disambiguation` graduated `BL-INTER-NUMERAL-DISAMBIGUATION` by changing the FONT rather than the CSS: the row's premise was false. Probed live before drafting — the Inter build Google Fonts serves has the character variants stripped (`calt ccmp dnom frac kern locl mark mkmk numr pnum tnum`, `wght` axis only), so the requested `"zero" 1, "cv05" 1` would have rendered nothing, exactly as the `"cv11" 1` beside it had been rendering nothing since `78662acb5` (2026-05-03). Two defects in the row itself besides: `cv05` never touches capital `I`, and `ss04` is Inter's own disambiguation set covering both letterforms. Shipped a latin + latin-ext SUBSET of the upstream v4.1 release (173 KB, built by `scripts/subset-inter.sh` from a checksum-pinned input, OFL alongside) via `next/font/local` — verbatim at 344 KB was the gate decision until the impeccable audit measured it costing FCP +136-164ms and a fallback-to-Inter swap landing 3.7s in on slow 4G. `ss04` at `html`, `ss04`/`tnum` on the tabular rule, and `zero` on a NARROWER `.code-value` class, because `.tabular-nums` turned out to sit on whole prose sentences including the Right Now hero's 30px bold h2. `ss04` is REPEATED on each rule because `font-feature-settings` inherits as a whole value, not a merged list. Fourteen false claims corrected across `DESIGN.md`, the font-binding spec and plan, and eight source comments, including that plan's own P3 disposition claiming the binding "deterministically activates Inter's alternates … for the first time" (it activated nothing). New guard `tests/styles/fontFeatureAvailability.test.ts` derives the font path from `app/fonts.ts` and fails the build on any tag the loaded binary cannot honor, with a regression proof against the committed Google binary; in the browser `zero` needs a PIXEL oracle because `zero` and `zero.slash` share an xAdvance of 1292, so no width assertion can ever see it. Cross-model spec review round 1 returned BLOCKING with 7 findings, five confirmed by probe and all repaired. Prior: 2026-08-03 — `feat/needs-attention-holds-rollup` graduated `BL-NEEDS-ATTENTION-HOLDS-ROLLUP` (the cross-show open-holds read plus the fourth needs-attention stream across page, inbox, badge, mobile chip, and digest; spec `docs/superpowers/specs/2026-08-03-needs-attention-holds-rollup-design.md`, plan `docs/superpowers/plans/2026-08-03-needs-attention-holds-rollup.md`). Prior: 2026-08-03 — `feat/sync-feed-undo-announce` graduated `BL-SYNC-FEED-UI-POLISH` and all three children. `BL-SYNCFEED-UI-1` shipped, with its own premise corrected: the note's proposed in-button `aria-live` region cannot work, because a successful undo flips the row out of `status='applied'` and unmounts the button before assistive technology reads anything. Six adversarial rounds then refuted every surface-level owner in turn (the group empties, the strip returns null, the dashboard returns a different tree, the feed is swapped for its error rendering), and the vector was settled by an executable spike rather than a seventh prose argument. The channel lives in `AdminAnnounceProvider`, mounted by the admin layout AND by `ReviewModalShell` — a modal needs its own, since content outside an `aria-modal` dialog is excluded from the accessibility tree. `BL-SYNCFEED-UI-3` graduated as already-shipped (fixture corrected at `c3920fe6a`); `BL-SYNCFEED-UI-2` ratified as untriggered with its re-open trigger preserved. The same work fixed a class defect the sweep found: all three feed action buttons rendered their failure card by conditional mount, so failures were silent to AT too. Filed `BL-FEED-BUTTON-SUCCESS-ANNOUNCE`, `BL-BULK-UNDO-ANNOUNCE-UNMOUNT`, and `BL-ANNOUNCE-REGION-UNMOUNT-CLASS`. Prior: 2026-08-03 — `feat/modal-freshness-cue` graduated `BL-MODAL-REALTIME-UPDATED-CUE` as SHIPPED: the published review modal now flashes the panel card of every registry section whose CONTENT changed across a realtime-driven reconcile, plus an sr-only announcement from the same detector, so a swap under the reader is attributable instead of silent. The entry's premise was wrong and is corrected in the archive: the 2026-07-19 realtime spec ratified that the BRIDGE renders `null`, never that the surface it refreshes must stay silent, so this was a new design decision rather than a reversal. The user chose flash-then-fade directly. Two adversarial rounds (the second split in half) returned BLOCKING and were repaired: the projection missed routed warnings, routed use-raw state, section anchors and attention items, and separately OVER-hashed the warnings panel and non-rendered decision fields; the mount baseline lived in a ref that abandoned renders consumed; and an aborted close hides the shell without unmounting the state owner. Prior: 2026-08-03 — `chore/scanner-precision-cluster` graduated `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN` and `BL-LEDGER-GUARD-BODY-DEFINED-IDS`, the two entries whose shared shape is a static scanner opening too small a set of files while a hand-maintained residue covers the gap. Both residues had already rotted: the enum's four-code list held one code that was long since absorbed while ELEVEN real §12.4 codes were dark, and the ledger guard's eight `KNOWN_DANGLING` rows were never debt at all. The scan is now type-aware and fail-closed (58 codes, 0 unresolved, 44 capture-linked skips) after six adversarial rounds established that every syntactic mechanism — root widening, type-stripping, written-return-type matching — is defeated by a spelling; the ledger guard now resolves body-defined sub-item ids under three corpus-measured conditions. One documented limit is fenced rather than overclaimed and filed as `BL-CATALOG-PARTITION-WARNING-CLASS`: provenance through `any` is undecidable, so the real closure is an enumerated catalog, not a better scanner. Prior: 2026-08-03 — `feat/font-binding-modal-freshness-cue` graduated `BL-HEADER-FONT-FALLBACK-WRAP`: the browser check it asked for refuted its own stated doubt (Next 16 registers the literal family name, so the crew import DID bind) and surfaced a wider finding — the product rendered two type families across its trees while `DESIGN.md` §2.1 commits to one, because the loader had never been wired at the root. Shipped as one shared loader instance in `app/fonts.ts` imported by BOTH Next roots (the crash screen replaces the root layout, so it was otherwise left behind), with `--font-sans` binding next/font's metric-matched fallback face so the swap window stops reflowing ~10%. Filed `BL-HARNESS-FONT-FIDELITY` (the 31 standalone harnesses have no Next runtime and keep measuring the ambient host font — zero cost today, needs a spec not a patch) and `BL-INTER-NUMERAL-DISAMBIGUATION` (impeccable P3). Prior: 2026-08-03 — `chore/orphan-components-lead-prose` settled the two entries the copy/dead-code sweep left behind. `BL-LEAD-CAPABILITY-PROSE-STALE` graduated: both prose claims turned out STALE rather than intentional — the `capabilityTransitions` line is a verbatim quote that stopped being verbatim at `e348c81ca`, and MI-9's "admin/ops" clause was inherited from §12.4 copy strings whose every other instance had already been retired or corrected. A third instance the literal sweep could not see (`lib/sync/phase2.ts`, a semantic variant in production source) was corrected with them, and two guards shipped in the same commits: `capabilityHeaderParity` extracts the expected flag set from `scopeTiles.ts` source, and `capabilityClaimProse` scans the MI-9 rows AND every `.ts`/`.tsx` under `app`/`components`/`lib` with a positive-claim recognizer. `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS` was AMENDED, not archived: four components retired (each with a named superseding commit and live successor; `RightNowCard`'s two regression suites were retargeted onto `RightNowHero` and each proven by mutation before the deletion), and `WrappedTile` stays as a DECIDED retention — deleting it would orphan `TileErrorBoundary` and `TileServerFallback` rather than shrink the ledger, and the orphan guard now asserts its reason says so. Filed `BL-CAPABILITY-MATRIX-FINANCIALS-PREDICATE` (the matrix models five predicates, the code has six) and `BL-BELLPANEL-DISMISS-COMMENT-DRIFT` (six comments name a label the panel stopped rendering). New guard `tests/docs/retiredIdentifierReferences.test.ts` walks every tracked file for references to what was retired, keyed by LINE CONTENT with reasoned exemptions — three adversarial rounds each found references a hand-curated census had missed, so the census is now a walk. Prior: 2026-08-03 — `docs/close-v1-override-wont-build` graduated `BL-VERSION-AMBIGUOUS-V1-OVERRIDE` as RESOLVED — WON'T BUILD: no admin force-classify override gets built, now or trigger-gated. The row's premise was false as stated. `v1` is a fallback bucket, not a confirmed legacy template (`lib/parser/schema.ts:37`; the registry entry at `lib/parser/schema.ts:53` carries no `requires` array, so nothing positively identifies a v1 sheet), and its "a genuine legacy-v1 sheet has neither resolution" conflated _no markers registered today_ with _no registrable structure_ — a real legacy sheet, once actually seen, is indistinguishable from a genuinely-new template, and the gate spec's §7.1 resolution #2 (developer registers the markers) is not limited to new templates. Probed: all 10 committed fixtures classify confidently (6× v2 at 7/0, 4× v4 at 8/0), zero ambiguous, zero v1. The override would convert a signaled failure into a silent one, inverting the preparedness-audit posture, and it serves none of the four indistinguishable bucket occupants better than their existing disposition. Re-open trigger recorded in the archive entry, conjunctive: a real legacy sheet surfaces AND marker registration proves impossible. **Current state after this and the same-day `docs/graduate-bl-unpublish-to-held` graduation: six of the eight rows the 2026-08-02 segment below enumerates remain open** (`BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`, `BL-HEADER-REACT-RECONCILE-HARNESS`, `BL-PG-CRON-HOST-ASSERTION`, `BL-NEEDS-ATTENTION-HOLDS-ROLLUP`, `BL-RESYNC-STAGED-REVIEW-UI`, `BL-STEP3-FULL-CREW-PREVIEW`); that segment's own "Eight open rows here" count is left as written, because it describes the state at the 2026-08-02 reconciliation and demoting it behind `Prior:` is what marks it as history. Prior: 2026-08-03 — `docs/graduate-bl-unpublish-to-held` graduated `BL-UNPUBLISH-TO-HELD` as already-shipped: the 2026-07-01 published toggle (`unpublish_show` RPC in `supabase/migrations/20260701000000_published_toggle_unpublish_show.sql`, driven by `setShowPublishedAction(slug, false)` from the admin show review modal, commit 945bd4ef0) is exactly the published→Held inverse the row asked for — the row's 2026-08-02 "Verified: no such RPC exists" was a false verification, and its premise that the M12.13 token-unpublish archives was stale too (both unpublish paths are pure `published=false`). A 10-point audit of the shipped surface before graduating found no functional gap and one gate-scope finding, filed as `BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED` (the validation-schema-parity gate covers tables×columns only, never functions — no current drift, probed live). Prior: 2026-08-02 — `chore/copy-deadcode-sweep` graduated three copy-and-dead-code entries (`BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT`: the §12.4 helpfulContext no longer claims either capability role unlocks admin access — probed, `is_admin()` never reads `role_flags` — landed as a five-surface lockstep in one commit plus the row's `longExplanation` and the `scopeTiles` header comment it contradicted; `BL-ADMIN-PARSEPANEL-ORPHANED`: the component deleted behind a new zero-production-importer guard that asks the compiler for both module edges and their targets, with the five peers the class sweep found filed as `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS`; `BL-HELP-STRIP-COPYLINK-STALE`: the per-show help prose now names the Share link button, no screenshot regenerated). Also filed `BL-LEAD-CAPABILITY-PROSE-STALE` for the two remaining prose claims that need a contract read. Prior: 2026-08-02 — `docs/dangling-citation-ledger-filing` took the referential-integrity guard's `KNOWN_DANGLING` debt map from 50 rows to 9, filing 39 real entries and correcting one citation (`BL-FLOW4` came off as a side effect: with its family now defined, the stem suppresses as a family reference). Eight open rows here (`BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`, `BL-HEADER-REACT-RECONCILE-HARNESS`, `BL-PG-CRON-HOST-ASSERTION`, `BL-NEEDS-ATTENTION-HOLDS-ROLLUP`, `BL-RESYNC-STAGED-REVIEW-UI`, `BL-STEP3-FULL-CREW-PREVIEW`, `BL-UNPUBLISH-TO-HELD`, `BL-VERSION-AMBIGUOUS-V1-OVERRIDE`) plus `BL-LEDGER-GUARD-BODY-DEFINED-IDS` as the handoff for the eight ids defined in a parent entry's BODY, which stay body-defined by decision. Thirty-one went straight to `BACKLOG-archive.md` at their terminal state: eleven already shipped (the row was deleted at close instead of graduated, twice on a spec's explicit instruction), fifteen were impeccable-gate deferrals whose promised row was never opened and whose deferral has since closed, and five name a branch that was never taken. One citation was corrected instead of filed: `BL-SYNC-FEED-UI-POLISH` pointed at a backlog-id family that exists nowhere in the repo. The 9 rows left are the eight body-defined ids above plus `BL-RESOLVED`, a prose placeholder in an audit doc, both handed to follow-ups. Prior: 2026-08-02 — `test/agenda-fold-seeded-e2e` graduated `BL-AGENDA-FOLD-NO-SEEDED-E2E` (the per-viewer agenda day fold exercised through the REAL crew page: seeded `agenda_links` + two complementary date-restricted viewers, each an email-matched Google session against its own seeded show, plus an unrestricted admin control in `stage-restricted-crew-schedule.spec.ts`, wired into `crew-e2e.yml` under desktop-chromium behind a run-command wiring guard) and `BL-AGENDA-A11Y-WEBKIT-COVERAGE` (grep-scoped `standalone-webkit-a11y` project resolving exactly one test, structurally pinned, plus webkit installs and a regenerated baseline). Prior: 2026-08-02 — docs/citation-rot-financials-vocab graduated BL-DANGLING-CITATIONS-RETIRED-WORKFLOW (15 dangling citations to the seven retired e2e workflows rendered as prose across 10 docs, class-swept per the AGENTS.md bug-shape rule; spec:lint target-class findings now zero tree-wide) and BL-MASTERSPEC-FINANCIALS-VOCAB (14 master-spec financials-entitlement claims reconciled to LEAD ∪ FINANCIALS ∪ admin, line-count-neutral; 4 seed exclusions + 8 window-probe non-claims ratified in docs/superpowers/specs/2026-08-02-docs-hygiene-citation-rot-financials-vocab-design.md; specs README line-count note corrected), and filed BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT (§12.4 copy over-grant, deferred to the next §12.4 copy pass). Earlier reconciliations (deduplicated 2026-08-02 — this line had accumulated 40 segments, 26 of them verbatim repeats of merge-concatenated chains): **[BACKLOG-archive.md § Reconciliation log](./BACKLOG-archive.md#reconciliation-log)**.

---

## BL-TIMING-SCAN-NAME-VS-BINDING — an identifier delay resolves by spelling, so a local shadow is suppressed

**Filed:** 2026-08-15 (`feat/wifi-password-legibility`, whole-diff review round 9, finding 2). **Effort:** M — scope-aware resolution, not a pattern tweak. **Class-sweep exception:** (c) — a redesign of the resolution step on a surface this arc does not otherwise own. **Reachability: PROBED** (constructed, see below); no live instance exists today.

`scripts/scan-interaction-timings.ts` resolves an identifier delay by NAME against the set of covered bindings, so any binding anywhere that carries the same spelling counts as coverage. A local one that shadows it is therefore suppressed:

```ts
// in some component, alongside the real lib/ui/copyFeedback.ts export
const COPY_FEEDBACK_RESET_MS = readDelayFromRuntimeConfig();
setTimeout(fn, COPY_FEEDBACK_RESET_MS);
```

Probed: before resolution the site is correctly `unclassified`; the global name filter then removes it, and neither §5.5 nor the unclassified list mentions it. That contradicts the delay-side totality claim — the one half of the scanner that IS complete — which is why this is a separate row from `BL-TIMING-SCAN-PROPERTY-TOTALITY` rather than folded into it.

**Scope if promoted:** resolve identifiers against the binding in scope (the TypeScript checker already models this) instead of a name set, or narrow the name set per-file and report cross-file identifiers as `unclassified`. The consequence today is bounded — the value is a runtime one, so no fixed timing is being hidden, and the current tree contains no shadowing instance — but the claim the guard makes about delays should be true of delays.

## BL-TIMING-SCAN-PROPERTY-TOTALITY — a timing-named property with a non-literal value is dropped, not reported

**Filed:** 2026-08-15 (`feat/wifi-password-legibility`, whole-diff review round 7, finding 2). **Effort:** S. **Class-sweep exception:** (c) — the repair spans surfaces this arc does not otherwise touch. **Reachability: PROBED**, with the site list below as the probe.

`scripts/scan-interaction-timings.ts` is complete for TIMER DELAYS — every `setTimeout` / `setInterval` delay argument is walked, and one that is neither a literal nor a resolvable identifier is reported `unclassified` so someone must disposition it. Its PROPERTY forms are not: a timing-named property whose value is not a numeric literal is dropped silently, so it appears in neither `DESIGN.md` §5.5 nor the unclassified list.

Five sites in the tree are invisible for that reason today:

| site                                           | value                                         |
| ---------------------------------------------- | --------------------------------------------- |
| `components/admin/telemetry/EventRow.tsx`      | `duration: reduce ? 0 : 0.22`                 |
| `components/crew/RightNowHero.tsx`             | `duration: prefersReducedMotion ? 0 : 0.22`   |
| `components/diagrams/GalleryLightbox.tsx` (x2) | `duration: emblaDuration(...)`, live value 22 |
| `components/diagrams/GalleryLightbox.tsx`      | `duration: motionDuration`, live value 0.22   |

**This predates the key widening** that surfaced it — the original `duration:` form dropped non-literals the same way — so it is a pre-existing gap rather than a regression, and every one of the five is a real interaction timing a person watches.

**Scope if promoted:** report a non-literal property value as `unclassified`, exactly as a delay argument is, and disposition the five above (the reduced-motion ternaries resolve to two constants; the GalleryLightbox pair resolve elsewhere in the same file). The consequence today is bounded and conservative — §5.5 lists fewer timings than exist, so the document undersells rather than misstates — but the guard's whole purpose is that no timing passes silently, and five do.

## BL-EXECUTION-METHODS-DERIVED-FROM-DRIVER-TYPES — derive the execution-method set from postgres.js's types instead of hand-typing it

**Severity:** MEDIUM (a silent miss admits an unchecked wipe; the failure mode is acceptance, not rejection) · **Class:** structural guard · **Effort:** M · **Filed:** 2026-08-15 (`chore/guard-completeness-wave`, diff review R6)

`EXECUTION_METHODS` in `tests/db/_destructiveFileAnalysis.ts` is a hand-typed name list. Rule 1's property-call leg asks whether a method is in that set; a driver method the list omits is simply not an execution site, so a discovered file can run destructive SQL on an unchecked client and the analyzer returns `ok:true`.

**Probe evidence — this is not hypothetical, it shipped and was caught in review.** The set omitted postgres.js's `.file()` for the entire life of the surface. Diff review R6 probed it and the repair landed in the same wave (`cdac23ae9`, fixture `(ca)`):

```
discovered true
verdict {"ok":true}     // await remote.file("./destructive.sql") on an unchecked client
```

postgres.js's own types declare `file<T>(path, ...): PendingQuery<T>` (`postgres@3.4.9`, `types/index.d.ts:696`) — it reads the path and submits the contents as a query, executing caller-supplied SQL as directly as `unsafe` does.

**Why the mutation gate cannot backstop this, which is the actual argument for the row.** The surface was at score **1.00 with zero unaccepted survivors** when R6 found the gap. Mutation testing perturbs code that EXISTS and asks whether a test notices; a missing member of a `Set` literal is not a mutation of existing code, and no operator in the registry adds one. The gate was faithfully measuring a program whose relevant line had never been written. A green gate here means "the suite pins what is there", never "the set is complete".

**The terminating framing.** Derive the set from the driver's own type surface rather than from memory: every method the installed `postgres` types declare as returning `PendingQuery` / `PendingRequest` / `ListenRequest` is an execution site. Measured against the current pin, that derivation yields exactly the shipped set — `unsafe file begin end reserve savepoint listen notify subscribe cursor` — while `json` / `array` / `types` / `options` return `Parameter` or config and stay out. So the derivation is provably equivalent to the hand list TODAY; its value is that a postgres.js upgrade adding a query-submitting method cannot silently widen the gap, and the diff that adds it becomes visible.

**Why M and not S.** The naive form (parse `node_modules` `.d.ts` at test time) coupled a guard to an install tree and is slow and brittle. Candidate shapes to weigh: a generator that writes a committed manifest from the pinned types with a drift test (same pattern as `pnpm gen:schema-manifest` + `validation-schema-parity`); or a narrower guard asserting only that no `PendingQuery`-returning method is absent from the set. The exclusion of `json` / `array` is deliberate and must survive whichever shape wins — they collide with `Response` and `Object` members that real destructive files call on non-clients, and fixture `(cb)` pins that.

**Re-open trigger if deferred further:** any postgres.js version bump, or any second omission found by review rather than by a guard.

## BL-DESTRUCTIVE-GUARD-DISCOVERY-BY-CONNECTION — discover destructive-analysis files by connection, not by SQL spelling

**Severity:** MEDIUM · **Class:** structural guard · **Effort:** L · **Filed:** 2026-08-14 (`chore/guard-completeness-wave`, spec `docs/superpowers/specs/ci/2026-08-14-guard-completeness-wave-design.md` §2.5)

Discovery in `tests/db/_metaDestructiveDbTargetGuard.test.ts` is spelling-sensitive, and its own header has recorded that as a documented limit since r16: the patterns require the schema-qualified, unquoted `public.<name>(` form, so an unqualified `select prune_sync_log()` or a quoted `select "public"."prune_sync_log"()` is never discovered and NO analysis runs on that file. The 2026-08-14 execution-site redesign closed the acquisition question inside a discovered file; it does not touch which files are discovered.

The terminating framing is the same one that closed acquisition: stop asking how the statement is spelled and ask whether the file OPENS A DATABASE CONNECTION, then require the loopback guard of all of them.

**Probe (2026-08-14), which is why this is an L and not a follow-up commit:** `rg -l 'from "postgres"|require\("postgres"\)' tests/` — about 150 test files import the driver, and roughly 60 of them never call `assertLocalDbUrl`. Many connect through shared helpers (`tests/db/_b2Helpers.ts`, `tests/sync/_holdAwareTestkit.ts`) rather than directly, and many legitimately target the validation project. Requiring the analyzer of all of them needs per-file dispositions, helper-module modeling, and a validation-target accept-set the loopback-only guard deliberately does not have.

**Prereq:** its own spec. Do not attempt this as a widening of the existing guard — that is the recognizer ratchet the analyzer's own history documents.

---

## BL-PRIVATE-IMAGE-POSTMERGE-PROBE — the private-image-pipeline shipped without its post-merge validation evidence

**Status:** OPEN — owed close-out evidence, not speculative work · **Severity:** medium · **Class:** VERIFICATION DEBT · **Effort:** XS

Plan Task 11 step 6 (`docs/superpowers/plans/crew/2026-08-09-private-image-pipeline.md`) requires one
validation-project sync of a diagram-bearing show showing (a) variant objects in storage and (b) no
module-resolution telemetry, recorded as a comment on the merged PR (#761, merged
`8739556586e5441d1b4f3fb905fe580c58b19b4e`). It was NOT run.

**Why it could not be run at close-out, and this is measured rather than assumed:** the probe
exercises the DEPLOYED validation app — `scripts/validation-smoke.ts` is deployed-side by
construction ("agent smoke test of the DEPLOYED validation app", and its prerequisites are Vercel
validation-project env vars). At merge time Vercel refused deployments account-wide:
`Deployment rate limited — retry in 24 hours`, visible on PR #761's checks. No deploy, no sync, no
evidence. The half that needs no deploy — that `sharp` resolves under a production-only install —
WAS run pre-merge and is recorded in the arc (`pnpm install --prod && node -e "require('sharp')"`,
resolving 0.34.5 after the dependency move).

**The probe, verbatim, so this is a step rather than an intention:**

1. Confirm the validation deployment carries the merge commit above.
2. Trigger one sync of a diagram-bearing show against validation.
3. `select name from storage.objects where bucket_id='diagram-snapshots'` — assert `@<width>.webp`
   objects sit beside their originals under the show's current `snapshot_revision_id` prefix.
4. `pnpm observe --env validation` — assert no module-resolution fault, and specifically no
   `DIAGRAM_VARIANT_GENERATION_FAILED` row whose `error` names a missing module.
5. Post the transcript as a comment on PR #761 and replace this entry's pointer in the plan's §12.

**Why it is filed rather than left in the plan:** its only record was a step inside Task 11 of a plan
whose other ten tasks are done. §12 was supposed to pre-carry a pointer and did not — that omission
is the reason this row exists, and §12 now points here.

**What is at risk if it is never run:** low but real. The failure it would catch is `sharp` failing to
resolve or produce variants in the deployed Node runtime, which degrades silently — originals still
render, so the only signal is telemetry nobody is reading. The production defect this arc already
found by probe (sharp sitting in `devDependencies`) is exactly that shape, which is the argument for
finishing the check rather than assuming the fix held.

## BL-ADMIN-DIAGRAM-NEXT-IMAGE — the two admin wizard diagram surfaces still render raw `<img>`

**Status:** OPEN — filed at private-image-pipeline close-out · **Severity:** low · **Class:** PERF / consistency · **Effort:** M

`components/admin/wizard/step3ReviewSections.tsx` has two same-shape `<img>` sites — the staged-diagram
preview and the published breakdown that builds `/api/asset/diagram/` srcs. They are the same defect
shape the crew gallery just fixed, and the loader plus the ingest variant ladder are reusable there
as-is: `makeDiagramLoader` (`lib/images/diagramLoader.ts`) already takes manifest `variants` and
returns asset-route URLs, and the manifest fields land for every show at its next snapshot.

Deferred under the class-sweep disposition rule's exception **(c)**, ratified in the design session
(`docs/superpowers/specs/crew/2026-08-09-private-image-pipeline-design.md` §1.1): the repair lands
inside a ~4000-line admin wizard file the shipping PR does not otherwise touch, which blows its review
scope; and the value driver — crew bandwidth on venue 4G — does not apply to a desktop admin surface.
This is NOT "same defect, different file" with nothing more to say: the exception is named, and the
reason it applies is that the cost of the repair is dominated by the file it lives in rather than by
the change itself.

**Un-defer trigger:** any work that already opens `step3ReviewSections.tsx` for another reason should
carry these two sites with it, since the marginal cost then collapses to the edit itself.

## BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT — enrol the tap-target-floor spec in the source-mutation registry

**Status:** WATCH · **Filed:** 2026-08-09 (`fix/step3-a11y-cluster`, diff-review round economy). **Class:** review-round economy (a convergence criterion that is machine-computed rather than argued). **Effort:** M-L (resized from S 2026-08-09 by the probe below — the cost is a harness mode, not a registry row). **Un-defer trigger:** the source-mutation harness gains a Playwright/component-mutant mode (or an equivalent runner exists) — building that mode is now scheduled as `BL-MUTATION-HARNESS-PLAYWRIGHT-COMPONENT-MODE` below. **Reachability: PROBED.**

> **PROBE-REFUTED AS FILED, 2026-08-09 (`fix/quick-wins-2-mech`, quick-wins-2 §2.4). Re-dispositioned to WATCH; no code shipped, and that is the honest outcome rather than a scope dodge.** The entry costed itself at S on an assumed harness contract — "one registry row plus an operator pass" — and that contract does not exist for a Playwright suite or for component-file mutants. Three capabilities are missing, each measured against the shipped harness rather than argued:
>
> 1. **The runner spawns one `vitest` child per mutant** (`tests/mutation/guardSurfaces.gate.test.ts:11`, "It spawns one `vitest` child per mutant"). `tests/e2e/tap-target-floor.layout.spec.ts` is a Playwright spec; no vitest child can execute it. Enrolling it needs a Playwright child-runner mode.
> 2. **Every enrolled `sourcePath` is a lib module** (`tests/mutation/source/registry.ts:153` `taskContract`, `tests/mutation/source/registry.ts:314` `ledgerClaimsCore`), and the declared operator set is six GENERIC source operators (`tests/mutation/source/operators.ts:17` `OPERATOR_NAMES`). The nineteen mutants below are bespoke `.tsx` COMPONENT edits — drop a `group`, swap `rounded-pill` for `rounded-sm`, collapse a `gap-3` to `gap-0`. No declared operator expresses any of them; they need their own family.
> 3. **Runtime.** The nineteen mutants are real-browser runs, not vitest units, so the budget is far above the ~93 s/run this entry cites for the existing surface.
>
> That is a harness redesign, not an S. What the entry got RIGHT is preserved and is the reason it stays open rather than closing: the nineteen isolating mutants below were each run locally and reverted, and they are the ready enrolment payload the moment a runner can execute them. Do not relitigate this toward shipping a registry row the harness cannot run — the row would be dark, which is worse than the honest gap.
>
> Partial credit landed on the same branch and is worth knowing before enrolling: mutant #14 (collapse a container's `gap` so a grown target overlaps its neighbour) is now asserted for all three previously uncovered containers by `BL-TAP-TARGET-NEIGHBOUR-OVERLAP-COVERAGE`'s work, and was observed killing exactly its own case per container. Eighteen mutants remain unmachine-run.

`tests/e2e/tap-target-floor.layout.spec.ts` is a guard suite, and its nine diff-review rounds produced **20 declared findings, of which 15 were the same shape**: "the guard does not pin what it claims", each arriving with an exact production edit the committed suite failed to catch. Every one was reproduced locally as an isolating mutant and reverted, so the operator set is already written down — in the commit messages of `893793235`, `95e9eb4a7`, `06cc09ed1`, `fc628f3e9`, `cc9fcfe4d`, `e88e7e0f6`, `0bce8e51c` and `50f2478e1`. It is simply not machine-run.

The **nineteen** isolating mutants, as an operator list ready to enrol — every one run locally and reverted, each named in the commit message of the round that answered it: drop `group` from a `<details>`; strip `transition-colors duration-fast` from a visual span; add `group` to an ancestor that must not carry it; strip an `aria-label` entirely; relabel an `aria-label` to a string that contradicts the visible wordmark; swap `rounded-pill` for `rounded-sm` on BOTH a target and its visual; swap `rounded-pill` for `rounded-[14px]` on both (passes a half-the-VISUAL check while the 44px target squares off); delete a caret's glyph while keeping its span and classes; add `text-transparent` to a caret; change `-m-2` to `-m-1`; remove `items-center` from a split target; move `cursor-pointer` from a target to its inner span; narrow `transition-colors` to `transition-[background-color]` (a substring matcher accepts it as `color`); collapse the topbar's `gap-3` to `gap-0` so a grown box overlaps its neighbour; narrow the STEP PILL's `transition-colors` the same way (the substring matcher survived at a second site); drop `justify-center` from a VISUAL span so its glyph slides to the edge while the span stays centred; revert only ONE of the two promoted headings, leaving `h1, h2, h3`; strip `w-fit` from all six Class-A summaries (a conformance pin, since `inline-flex` alone already shrink-wraps); delete `transition-colors duration-fast` outright, so the property computes to the `all` default that a lenient matcher accepts.

**Why this is worth a row rather than a shrug:** the brief's prose bar ("an exact production edit the suite fails to catch") kept every finding admissible, but it never made the set CLOSABLE — "can you think of another way to defeat it?" does not terminate, and rounds 2 through 8 were spent hand-discovering mutants one at a time. Enrolment converts that into "is the unaccepted-survivor set empty?", which does terminate, at the cost of one registry row and roughly 93s per run (`pnpm mutation:guards`). Registry: `tests/mutation/source/registry.ts`; spec: `docs/superpowers/specs/ci/2026-08-04-source-mutation-guard-gate.md`; the round-economy filing is `docs/review-rounds/fix/step3-a11y-cluster/61281c23e8ce.md`.

**First scheduled step:** add the registry row and run the gate, then triage survivors — the nineteen above should all be killed already, so any survivor is new information.

## BL-MUTATION-HARNESS-PLAYWRIGHT-COMPONENT-MODE — Playwright/component-mutant runner mode for the source-mutation harness

**Status:** OPEN · **Filed:** 2026-08-15 (round-economy win sweep, post-#791 reconciliation). **Severity:** LOW (tooling; no product surface). **Class:** review-round economy (extends the one convergence criterion measured to terminate — the mutation score — to the surface class that burns the most rounds). **Effort:** M-L (a harness mode, not a registry row; sized by the 2026-08-09 probe recorded in `BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT`'s probe block above). **Reachability:** PROBED — the three missing capabilities are measured against the shipped harness rather than argued (quick-wins-2 §2.4 probe, `docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md` §1.1.4; recorded verbatim under `BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT`).

**The circular wait this row closes.** `BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT` sits at WATCH with un-defer trigger "the source-mutation harness gains a Playwright/component-mutant mode (or an equivalent runner exists)" — and until this row, nothing in any ledger scheduled building that mode, so the WATCH waited on work nobody owned. The value case is the round-economy record itself: an enrolled vitest surface converges by machine (~93s/run, `pnpm mutation:guards`), while the two arcs whose guard surfaces the registry could NOT express burned the worst — step3-a11y spent six of nine diff rounds hand-discovering mutants at review-dispatch prices (`docs/review-rounds/fix/step3-a11y-cluster/61281c23e8ce.md`), and the classname equivalence scripts drew fifty false-pass findings across fourteen diff rounds (`docs/review-rounds/refactor/classname-array-join-cn/9bd0a8456151.md`).

**What to build,** per the probe's three measured gaps against the shipped harness (`tests/mutation/guardSurfaces.gate.test.ts:11`; `tests/mutation/source/registry.ts`; spec `docs/superpowers/specs/ci/2026-08-04-source-mutation-guard-gate.md`): (1) a child-runner mode that executes a Playwright spec per mutant, alongside the existing one-vitest-child-per-mutant contract; (2) an operator family for bespoke `.tsx` component edits — the current six generic source operators express none of the nineteen ready mutants; (3) a runtime budget model for real-browser runs, which will not hit ~93s/run and must run under the heavy-phase semaphore (`pnpm heavy`), since per-mutant Playwright is a non-interactive playwright workload by invocation shape. Design belongs to the implementing arc, not this row.

**First scheduled step:** run the mode against its ready first customer — the nineteen isolating mutants enumerated in `BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT`, each already run locally and reverted. All nineteen should be killed; any survivor is new information. Landing this row's mode is that entry's un-defer trigger.

## BL-CODEX-GUARD-ENROLMENT-PRECEDES-DISPATCH — mechanize promotion P2: a round-1 guard-surface dispatch states its mutation score or its cannot-express probe

**Status:** OPEN · **Filed:** 2026-08-15 (round-economy win sweep, post-#791 reconciliation). **Severity:** LOW (tooling; no product surface). **Class:** review-round reduction (tooling). **Effort:** M. **Reachability:** PROBED — "enrolment precedes review" shipped 2026-08-10 as prose only: followups-2 promotion P2 landed in AGENTS.md's convergence-criterion block, and that spec's §5 non-goals explicitly excluded building any enforcement (`docs/superpowers/specs/ci/2026-08-09-round-economy-followups-2.md` §2 P2, §5). The cost of the unenforced form is measured in the same filings the promotion cites: fifty false-pass findings across fourteen diff rounds on never-enrolled equivalence scripts (`docs/review-rounds/refactor/classname-array-join-cn/9bd0a8456151.md`), six of nine rounds hand-discovering mutants (`docs/review-rounds/fix/step3-a11y-cluster/61281c23e8ce.md`).

The prose rule binds the author's memory; nothing gates the dispatch. The per-machine review-convergence hook cannot carry this (it lives outside the repo and P2's arc fenced it off), but `scripts/codex-guard.mjs` is tracked and already refuses dispatches structurally — a missing `--stage` or `--round` exits 2 naming the flag. Extend that contract: a round-1 `--stage diff` dispatch whose brief declares its subject a guard/proof/equivalence surface (candidate shape: a `GUARD SURFACE:` brief line, mirroring the `PROBE DOMAIN:` line the convergence gate already requires for detector briefs) must also carry either a stated mutation score plus unaccepted-survivor set from `tests/mutation/source/registry.ts`, or an explicit cannot-express disposition citing its probe (the step3 re-disposition pattern, `docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md` §1.1.4). Missing both exits 2 naming what is absent, before any tokens burn. Detection heuristics, override mechanics, and whether the declaration is a brief line or a flag belong to the implementing arc, not this row.

## BL-FILING-MECHANIZABLE-LEDGER-PARITY — a non-none Mechanizable filing entry cites a resolvable ledger row or declines with a reason

**Status:** OPEN · **Filed:** 2026-08-15 (round-economy win sweep, post-#791 reconciliation). **Severity:** LOW (docs gate; the leak loses mechanization candidates, not product behavior). **Class:** review-round reduction (tooling). **Effort:** S-M. **Reachability:** PROBED — `tests/docs/_metaReviewRoundEconomy.test.ts` asserts every `BL-`/`DEF-` id CITED in a filing resolves, but nothing requires a non-none `**Mechanizable:**` entry to cite one at all, and merged filings hold at least five candidates with no ledger row and no declared decline: the workflow `paths:`-coverage generalization (classname plan filing candidate 3, R4-F2 — per-workflow wiring tests exist for three workflows, the generic walk does not) and the plan filing's `testMatch` candidate 2 where not already covered by those wiring tests (`docs/review-rounds/refactor/classname-array-join-cn/61281c23e8ce.md`); the enumerated-accept-set calibration probe and the recorded-SHA-names-its-own-expiry rule (same file, delta-arc plan §); the post-repair forward-reference self-consistency arm and the BL-disposition closeout arm (`docs/review-rounds/chore/guard-completeness-wave/04f601134519.md` spec § items (a) and (c)).

Two halves. **Gate:** extend `tests/docs/_metaReviewRoundEconomy.test.ts` so a filing's non-none `**Mechanizable:**` entry must contain a resolvable `BL-`/`DEF-` id OR an explicit decline marker with a reason (`declined: <reason>` — "belongs to whoever next touches X" is a decline and should say so in that form). Filings are immutable evidence (corpus contract), so the gate applies to filings authored AFTER it lands; the existing corpus is grandfathered as-is. **Backfill:** disposition the five candidates above — each gets a row (they carry probe evidence in their filings already) or a recorded decline in the disposing arc's ledger note; the implementing arc decides which, per the ledger filing bar. Enumeration here is the probe, not the cover — the gate half is what keeps the next candidate from leaking.

## BL-TESTFAST-RACES-TRANSIENT-MUTANT-FILE — a probe writes a temp test file into the tree while the other project is globbing

**Filed:** 2026-08-11 (`fix/tap-target-inline-controls`, found while triaging a local suite failure). **Class:** test-harness race (local false failure). **Effort:** S. **Class-sweep exception:** (c) — a harness surface the filing PR does not otherwise touch. **Reachability:** PROBED — observed, with the writer named and the victims cleared standalone.

`tests/cross-cutting/pgCronCiVacuity.test.ts:159` writes a real file into the repo — `tests/cross-cutting/pg-cron-coverage.mechanism-probe-mutant.test.ts` — runs it as a mutant, and removes it. `scripts/test-fast.mjs` runs the SERIAL and PARALLEL projects concurrently (that concurrency is the whole point of `test:fast`), so the other project's file glob can pick the transient up mid-run and execute it outside its harness.

Observed once, in a full `pnpm test:fast`:

```
FAIL tests/cross-cutting/pg-cron-coverage.mechanism-probe-mutant.test.ts > INERT MECHANISM PROBE
Error: live case "INERT MECHANISM PROBE" issued NO database query — it is not a live case.
FAIL tests/cross-cutting/pg-cron-coverage.test.ts
```

The failure is maximally confusing: the named file **does not exist** by the time anyone looks, and `pg-cron-coverage.test.ts` passes 8/8 standalone immediately afterwards. Nothing in the output says "this was a temp file".

**Not a CI problem** — CI runs the projects in separate jobs, so the glob never overlaps. It costs local runs only, which is why it can persist.

**First scheduled step:** write the mutant outside the globbed tree (a temp dir passed to vitest) rather than into `tests/`, or give it an extension the projects' `include` patterns do not match. Either removes the race outright; excluding the basename by name would leave the next such probe exposed.

## BL-PSQL-GUARD-WALKS-NEXT-BUILD-VARIANTS — the psql startup-file guard parses local `.next-*` build output and blows its own stack

**Filed:** 2026-08-11 (`fix/tap-target-inline-controls`, found while triaging a local suite failure). **Class:** guard usability (local-only false failure). **Effort:** XS. **Class-sweep exception:** (c) — a guard surface the filing PR does not otherwise touch. **Reachability:** PROBED, with a bisect that named the cause.

`tests/cross-cutting/psqlStartupFiles/scan.ts:315`'s `IGNORED_AT_ROOT` skips `.next`, but this repo's own Playwright config builds into `.next-dev`, `.next-prod`, `.next-prod-flip` and `.next-screenshots-help` (`playwright.config.ts` webServer entries). Those are not skipped, so the walk hands megabytes of generated bundle JS to the TypeScript AST scan and it dies:

```
RangeError: Maximum call stack size exceeded
 ❯ visit tests/cross-cutting/psqlStartupFiles/scan.ts:535:9
 ❯ forEachChildInBinaryExpression typescript.js:32647:12
```

**19 of the guard's 745 cases fail** — including its own structural cases ("the walk is not vacuous", "the walk read every directory"), which is the confusing part: the failures read like a real psql violation and name no file.

**Probed by bisect, all four steps:** the same commit passes 745/745 in a freshly-created worktree that has never built; it fails in a worktree that has; clearing `test-results/` and `.next/` does NOT fix it; moving the four `.next-*` directories aside DOES (745/745). So the trigger is the directory set, not the diff and not the environment more broadly.

**CI is unaffected** — a fresh checkout has no `.next-*` — which is exactly why this can sit here indefinitely and cost each developer the same half-hour bisect.

**First scheduled step:** widen the root skip to the `.next*` prefix rather than adding four literals (a fifth build target would otherwise re-open it), and consider making the walk report the file it was parsing when a scan throws, so the next occurrence names itself instead of needing a bisect.

## BL-REVIEW-MODAL-QUIET-PILL-OUTRANKS-URGENT — the "no action needed" pill now reads louder than the "needs you" one

**Filed:** 2026-08-14 (`fix/ui-interactive-token-policy`, invariant-8 impeccable critique P2). **Class:** visual hierarchy. **Effort:** S. **Class-sweep exception:** (a) — the repair is a product decision this PR cannot settle. **Reachability:** PROBED — both branches are in `components/admin/showpage/PublishedReviewModal.tsx` at the alert pill (`data-testid` suffix `-alert-pill`), and the arithmetic is on the shipped class strings.

The alert pill has two branches. Monitoring-only ("clearing on their own, no action needed") is `border border-border bg-surface-sunken` and, since the subtle-on-interactive swap, rests at `text-text` — roughly 15:1 on its own fill. The needs-you branch is `text-warning-text` on `bg-warning-bg`, 9.5:1. The QUIET state now carries more contrast than the URGENT one.

**Why it was not repaired on this branch.** The site is dispositioned SWAP in the ratified census (spec `2026-08-14-ui-interactive-token-policy-design.md` §4.3), and the exemption side is pinned executably — the registry's 14 rows, plus the NEGATIVE guarantee that no other in-scope element carries a bare `text-text-subtle` — by `tests/styles/_metaSubtleOnInteractive.test.ts`. Moving it to a Family D carve-out would edit a user-ratified table, which is the user's call, not the implementer's. The pair is NOT indistinguishable meanwhile: the fills differ (`bg-surface-sunken` vs `bg-warning-bg`) and the dot differs in shape (hollow positive-tone vs filled review-tone), so the §1 colour-blind floor holds either way.

**First scheduled step:** decide whether an interactive pill whose whole message is "nothing to do here" is a Family D dim member (it is a state pair, and it already carries two non-colour cues), or whether the urgent branch should instead gain weight.

## BL-CONTROL-OUTLINE-BORDER-STRONG-ON-SURFACE-FILLS — 23 control outlines still at 1.4-1.8:1 on non-ground fills

**Filed:** 2026-08-14 (`fix/ui-interactive-token-policy`, invariant-8 impeccable critique round 2, P1). **Class:** visual boundary / DESIGN scope. **Effort:** M. **Class-sweep exception:** (a) — the repair needs a DESIGN.md scope decision this PR cannot settle. **Reachability:** PROBED, with a DERIVED cover (below).

This arc moved the secondary-action outline to `border-text-faint` (3.35:1 on `bg-surface`) at the shared constant, at the 25 sites that carry the same recipe inline over a `bg-bg` fill, and at six further controls whose fill is a SURFACE rather than the page ground — because leaving each at the old outline while a sibling it renders with had moved would have shipped a split treatment inside one view. Two are DIRECT pairs (`Step2Verify`'s re-scan beside its folder input, `DriveConnectionPanel`'s two actions); two are connected through a shared row rather than adjacency (`RecentAutoAppliedStrip`, whose near-ground control is in its confirmation row, and the `AcceptChangeButton`/`UndoChangeButton` pair `ChangeFeedEntry.tsx:135` renders); one inherits `Step2Verify`'s file-local `SECONDARY_BUTTON`. Twenty-three in-scope CONTROLS still carry `border border-border-strong` over `bg-surface`, `bg-surface-sunken`, `bg-surface-raised` or `bg-transparent` fills — at the per-ground ratios in the paragraph below, all of them far under the 3:1 non-text floor.

**The 1.59:1 / 1.60:1 figures are `bg-surface`'s, not every fill's** (whole-diff R4 F4). Measured 2026-08-15 against the runtime tokens, `border-strong` sits at 1.59 light / 1.60 dark on `surface`, **1.43 / 1.75** on `surface-sunken`, **1.59 / 1.50** on `surface-raised` and 1.52 / 1.70 on `bg`; a `bg-transparent` control takes whatever its rendered ground is, which no static measurement can supply. All of them are far under the 3:1 non-text floor, which is the entry's point — but the entry should not quote one ground's number for twenty-three controls that do not share it.

**Derived cover** (re-run it rather than trusting this list — it is a query, not an enumeration):

```ts
scanInteractiveElements(process.cwd()).filter((e) =>
  allStrings(e).some((s) => /(^|\s)border-border-strong(\s|$)/.test(s)),
);
```

from `tests/styles/interactiveScanCore.ts`. On 2026-08-14 it returned 29 elements; six were repaired on the filing branch because THIS diff created their inconsistency — two beside a swapped sibling (`Step2Verify.tsx:126`, `settings/DriveConnectionPanel.tsx:284`), two connected through a shared row (`RecentAutoAppliedStrip.tsx:516`, and the `AcceptChangeButton`/`UndoChangeButton` pair rendered by `ChangeFeedEntry.tsx:135`), and one by inheritance of `Step2Verify`'s file-local constant. That leaves 23, none of them co-visible with a swapped peer.

**Why the sweep stopped there, and what has to be decided first.** DESIGN.md §1.2a's predicate is a control "whose fill is the near-ground". A `bg-surface` button ON a `bg-surface` card measures 1.00:1 against its container, so extending the rule to it is defensible — but that extension REWRITES the predicate from "the fill is the page ground" to "the fill equals its container", and the wider predicate then also captures the three switch TRACKS in the set (`PublishedToggle.tsx:292`, `settings/AutoPublishToggle.tsx:123`, `settings/NotifyToggle.tsx:131`), whose OFF-state boundary is pinned separately in §1.2 against `--color-accent-edge` as the load-bearing 1.4.11 pair. A blanket swap would silently retune that pinned pair. The text-level cover is also NOT safe to apply mechanically: of the 69 lines carrying `border border-border-strong` as of 2026-08-15 (74 when the entry was filed; the difference is this arc's own swaps), most are cards, chips, tiles and popover surfaces that must keep the border token.

**First scheduled step:** settle §1.2a's predicate — "near-ground" as page-ground only, or as fill-equals-container — and state explicitly whether switch tracks are in or out. The swap itself is one token per site once that is written down.

## BL-TEXT-FAINT-AS-RESTING-INTERACTIVE-COLOUR — four controls rest one rung BELOW the token this arc retired

**Filed:** 2026-08-14 (`fix/ui-interactive-token-policy`, invariant-8 impeccable critique round 2, P1). **Class:** colour policy completeness. **Effort:** S-M. **Class-sweep exception:** (a) — whether a control may rest at the faint rung is a design decision, and the census this arc shipped was ratified around one token. **Reachability:** PROBED — all four sites read from the live tree.

DESIGN §1.1a now says `--color-text-subtle` is never the resting colour of an action target outside three carve-out families. These four controls rest at `--color-text-faint`, which is one rung QUIETER (3.02:1 on `bg-surface-sunken`, vs subtle's 6.09:1) and which §1.1 already describes as "never used for crew-actionable copy":

- `components/crew/primitives/SourceLink.tsx` — crew-facing "In sheet" deep link (sunlit-readability surface).
- `components/shared/CardReportTrigger.tsx` — crew-facing card report flag.
- `components/admin/BellPanel.tsx` — bell-row affordance.
- `components/admin/HoverHelp.tsx` — help trigger glyph.

**Why it was not repaired here.** The ratified census (spec `2026-08-14-ui-interactive-token-policy-design.md` §2.3/§4.3) defines a hit as the BARE token `text-text-subtle`, and the exemption side is pinned executably: 14 registry rows plus the negative guarantee that no other in-scope element rests at a bare `text-text-subtle`. What is NOT pinned is each swapped site's exact token — a site moved from `text-text` to `text-text-faint` would pass, which is what `BL-TEXT-FAINT-AS-RESTING-INTERACTIVE-COLOUR` is about — nor the 41-site swap tally, nor hover, which was a one-shot verification at implementation time. Policing a second token is a guard-contract change plus a new census, and the sites are deliberately recessive by their own documented design — two of them are crew surfaces whose quietness was an explicit choice. That is a decision to make, not an omission to patch. The `token` field already exists on `SubtleHit` and on the exemption registry rows precisely so a second policed token cannot alias the first's rows.

**First scheduled step:** decide whether `text-faint` is admissible as a resting colour for a deliberately recessive control (and if so, name the condition in §1.1a — e.g. only where a non-colour affordance carries the control), or add it to the policed set and re-census.

## BL-RUNOFSHOW-SUMMARY-NO-MARKER — the one Family S site with no visible fold affordance

**Filed:** 2026-08-15 (`fix/ui-interactive-token-policy`, whole-diff review R2 F3). **Class:** design-system policy / crew UX. **Effort:** S. **Class-sweep exception:** (a) — restoring a cue or reclassifying the site is a crew-surface design decision the policy arc did not make. **Reachability:** PROBED — the class string is read out below and the site is one of the seven Family S rows in `tests/styles/subtleInteractiveExemptions.ts`.

DESIGN §1.1a's Family S sanctions a resting `text-text-subtle` on a `<summary>` because "the fold affordance is carried by the marker/chevron and the interaction, not by label weight". `components/crew/primitives/RunOfShowList.tsx:82` carries `list-none [&::-webkit-details-marker]:hidden` and renders no replacement, so on the mobile-first crew surface the only hint that the truncated title expands is its trailing ellipsis. It is the only one of the seven Family S sites in that position.

**Why it was not repaired here.** Two defensible answers and no ratification for either: render a chevron (a visual change to a crew row whose density was designed deliberately), or move the site out of Family S and rest it at `text-text` (which changes the row's tone, the thing the dimness was chosen for). The registry row carries the caveat so the exemption's claim is not silently false while the question is open.

**First scheduled step:** decide between a rendered fold cue and a reclassification, and if Family S keeps the site, amend §1.1a to say what counts as the affordance when the marker is suppressed.

## BL-CONTROL-OUTLINE-ON-TINTED-PLATES — the secondary outline dips under 3:1 against warning, info and danger cards

**Filed:** 2026-08-15 (`fix/ui-interactive-token-policy`, whole-diff review R1 F1). **Class:** design-system contrast. **Effort:** S at the token, M across the plates. **Class-sweep exception:** (a) — which treatment a tinted plate should get is a design decision this policy did not make. **Reachability:** PROBED — ratios computed from the runtime tokens in `app/globals.css` and pinned in `tests/styles/secondary-action-contrast.test.ts`.

The secondary action paints its own `bg-bg` fill, so its outline has two neighbours: the fill inside it (3.21:1 light / 4.00:1 dark) and whatever it stands on outside. On the four neutral grounds DESIGN §1.2 pins, both sides clear 3:1. On a tinted plate the outer edge does not, in exactly one theme per plate: `warning-bg` **2.79** dark (3.04 light), `info-bg` **2.87** light (3.48 dark), `danger-bg` **2.88** light (3.19 dark).

Eleven shipped controls stand on such a plate, across ten sites: `components/admin/DataQualityWarningControls.tsx:21`, `MaintenanceResetButtons.tsx:308` and `:328`, `PerShowAlertResolveButton.tsx:94`, `ReapStaleSessionsButton.tsx:146`, `RecentAutoAppliedStrip.tsx:551`, `ReSyncButton.tsx:286`, `ShowRowActions.tsx:932`, `wizard/step3ReviewSections.tsx:2682`, and `wizard/archivedTabOffer.tsx:140` (both its accept and revoke controls).

**Why it is recorded rather than repaired here.** `BL-SECONDARY-BUTTON-BOUNDARY-INVISIBLE` was explicit that the prior 1.59:1 boundary was NOT a WCAG failure — the label carried the affordance — and this arc shipped the upgrade under that frame (spec §1.1 R5). A boundary that is strong against its own fill and 2.79-2.88:1 against a tinted plate is a weaker instance of the upgrade, not a regression against the state before it. Choosing the treatment — a darker token used only on tinted plates, a plate-matched outline, or accepting the current numbers — is a design decision, and picking one silently inside a policy arc is what the ledger exists to prevent.

**First scheduled step:** decide whether tinted plates get their own outline token. If yes, the shape is a per-plate `border-*` in the same recipe rather than a new global token, because the neutral grounds already clear and moving the shared token would push them the other way.

## BL-CHECKBOX-ROW-LABEL-UNDER-FLOOR — three native-input rows are targeted through a label that carries no floor

**Filed:** 2026-08-15 (`fix/ui-interactive-token-policy`, whole-diff review R1 F5). **Class:** accessibility / tap target. **Effort:** S per site, M as a class. **Class-sweep exception:** (a) — the repair needs a decision the current PR cannot settle, stated per site below. **Reachability:** PROBED — the markup is read out in each census row, and the guard now names all three as `under-floor-filed`.

A native checkbox or radio is normally targeted through its `<label>`, and the tap-height census carries that as an exemption family. In three places the mechanism holds and the FLOOR does not:

- `app/admin/settings/roles/RoleMappingRow.tsx:266` and `components/admin/RoleRecognizeControl.tsx:343` — the FINANCIALS checkbox is not label-wrapped like its A1/V1/L1 siblings. It sits in a `div` carrying `min-h-tap-min` with the `<label htmlFor>` as a SIBLING, and a `div` does not toggle a checkbox. The real target is the 20px input plus a label whose own box is one text line.
- `components/admin/StagedReviewCard.tsx:580` — the radio IS label-wrapped, but the label is `flex cursor-pointer items-center gap-2 text-sm`: no minimum height, no padding, so the target is a single 20px line.

**Why not repaired here.** The FINANCIALS structure is deliberate: the caution copy is bound with `aria-describedby` precisely so it stays out of the checkbox's accessible name (the comment at `RoleRecognizeControl.tsx:337` says so). Wrapping the row in a `<label>` to gain the floor folds that caution back into the name, so the fix trades one a11y property for another and needs a decision, not a patch. The staged-review radio sits in a dense per-item list where adding 24px per row is a layout decision on a surface this branch does not otherwise touch.

**First scheduled step:** decide the FINANCIALS shape — either a `<label>` wrapping only the checkbox and its short caption with the caution outside it, or padding on the existing sibling label — then apply the same answer to both files, and settle the staged-review list separately.

## BL-MUTATION-HARNESS-WALLCLOCK-CEILING — the nightly job's wall clock grows with every enrolled surface and nothing bounds it

**Filed:** 2026-08-15 (`fix/ui-interactive-token-policy`, Task 5 enrolment). **Class:** CI capacity. **Effort:** M. **Class-sweep exception:** (c) — the repair is a redesign of the harness's execution model (sharding) on a surface this branch only enrols into. **Reachability:** PROBED — three measured runs, below.

`mutation-harness` runs `vitest run --project mutation`: 8 LPT-balanced parser shard files plus `tests/mutation/guardSurfaces.gate.test.ts`, which runs EVERY registered source-mutation surface serially, one `vitest` child per mutant (`tests/mutation/source/runner.ts`; serial execution is ratified in the harness spec as R6 / limit L-4). The gates file therefore grows monotonically as surfaces enrol, and no layer bounds it.

Measured 2026-08-15: 138 min on `main` (run 31871859884, 07:24:20Z..09:42:08Z) at 519 gate mutants; **180m15s on this arc's PR head, which had enrolled nothing** (run 31876214966, step cancelled at the `timeout-minutes: 180` ceiling); 146 min and red on a concurrent sibling arc (run 31877020683). The headroom was gone to runner variance ALONE, before any new surface. This branch enrols `interactiveScanCore` (207 mutants, +40% on the gates file) and raises `timeout-minutes` to 300 with those run ids in the workflow comment — headroom, not a fix.

**Why it is not merely a bigger number.** The job is non-gating by design, so a timeout is silent to everyone except whoever reads the nightly. The failure mode is that enrolment — the thing the round-economy rule in `AGENTS.md` asks arcs to do BEFORE their first review dispatch — is exactly what pushes the job over, so the incentive runs toward not enrolling.

**First scheduled step:** lift the parser harness's existing sharding (`tests/parser/mutation/shardPartition.ts:11`) to the gates file so surfaces partition across workers instead of accumulating on one. The harness spec already files serial execution as a deferred limit with that mechanism named; this entry is its trigger.

## BL-ADMIN-DEV-PANEL-TAP-FLOOR — the two dev-panel buttons are ~28px, and their classes are not even compiled

**Filed:** 2026-08-14 (`fix/ui-interactive-token-policy`, found by the shipped tap-height scanner's first run). **Class:** accessibility / dev-only surface. **Effort:** S. **Class-sweep exception:** (c) — the repair is a build-scope decision about a surface this branch does not otherwise touch. **Reachability:** PROBED — `pnpm vitest run tests/styles/_metaTapTargetFloor.test.ts` against an empty census names both sites.

Both buttons are `className="border px-3 py-1 bg-{blue,yellow}-600 text-white"` — the materialize action at `app/admin/dev/page.tsx:151` is blue, the schema reset at `:168` is yellow: 4px of vertical padding around a single line, roughly 28px, against the 44px `--spacing-tap-min` floor.

**Why a class-level repair does not work here, which is the whole entry.** `app/globals.css:33` excludes this exact file from Tailwind's source detection, because the dev panel is build-gated out of production (`ADMIN_DEV_PANEL_ENABLED`). None of those classes is compiled — `bg-blue-600` renders nothing today. Adding `min-h-tap-min` would emit no CSS while making the static guard report a floor the browser never applies, which is strictly worse than the honest census row it carries now (`tests/styles/tapTargetCensus.ts`, category `under-floor-filed`).

**First scheduled step:** decide whether the dev panel should be styled at all — either narrow the `@source not` exclusion so the surface compiles and can carry the floor, or ratify it as an unstyled developer tool and move the two census rows to a documented-limit record.

## BL-TAP-TITLE-LINK-META-LINE-BLEED — the sheet-title link's 44px hit box covers ~8px of the meta line beneath it

**Filed:** 2026-08-11 (`fix/tap-target-inline-controls`, invariant-8 impeccable critique P2). **Class:** accessibility / mis-tap. **Effort:** S. **Class-sweep exception:** (b) — a ratified scope decision fences it. **Reachability:** PROBED — the geometry is arithmetic on the shipped class strings, and the arc's own e2e suite measures the 44.8px box in a real browser (`tests/e2e/tap-target-inline-controls.layout.spec.ts`).

`SheetTitleLink`'s repaired class string (`components/admin/wizard/Step3SheetCard.tsx:167`) carries `-my-2.5 py-2.5`: the padding lifts the target to 44.8px and the negative margin cancels the growth in flow, so the row does not get taller. The consequence is that 10px of live hit box hangs below the text, and the meta line under it only clears 2px of that with its own `mt-0.5` — leaving the top ~8px of a 21.7px non-interactive text line inside a target that opens Google Sheets in a NEW TAB. Which element wins a tap varies with x-position. The same shape exists at `Step3SheetCard.tsx:452` (`mt-1`, so 6px) over "We couldn't read the details of this sheet".

**Why it was not repaired on the filing branch:** spec `docs/superpowers/specs/2026-08-10-tap-target-inline-controls.md` §2 ratifies this recipe verbatim — "**Exactly** `inline-block -my-2.5 py-2.5 -mx-2 px-2` … (R1 F2: one recipe, no delegated choice)" — and the spec's neighbour-overlap contract is scoped to _interactive_ neighbours, which this diff satisfies and pins. Changing the bleed is a spec amendment, not an implementation call.

**First scheduled step:** decide whether the overlap contract should cover non-interactive text at all (a mis-tap over prose is indistinguishable, to the user, from a mis-tap over a control). If yes, the candidate is a one-directional bleed — `-mt-5 pt-5 pb-0` — which keeps the whole 44.8px box inside the card's own 20px `--spacing-tile-pad` and off the meta line entirely.

## BL-TRANSPORT-CELL-STRETCH-AFTER-TAP-FLOOR — contact cells grew ~54px and drag their grid row-mates to match

**Filed:** 2026-08-11 (`fix/tap-target-inline-controls`, invariant-8 impeccable critique P2). **Class:** visual regression (layout). **Effort:** S. **Class-sweep exception:** (c) — a container redesign the filing PR does not otherwise touch. **Reachability:** PROBED — arithmetic on the shipped strings; the tap-floor heights are measured in a real browser by the arc's e2e suite.

Lifting the `tel:` and `mailto:` links to the 44px floor (`components/admin/wizard/step3ReviewSections.tsx:1412`, `:1424`) takes the Driver cell from roughly 106px to roughly 160px. The cells sit in `grid grid-cols-2 gap-2 min-[560px]:grid-cols-3` (`:1461`) whose items stretch by default, so at ≥560px the Vehicle and Parking cells stretch to 160px around ~34px of content — a large `bg-surface-sunken` panel that reads as broken rather than spacious. Each contact cell also costs ~54px more scroll on a phone, which is where this surface is read.

**First scheduled step:** pick one of — `items-start` on the grid so short cells stay short, or a shared `min-h` across every `TransportCell` so the row is uniform by intent rather than by accident.

## BL-CONTACT-CELL-TAP-SPACING-AND-GROUPING — two 44px contact targets sit 6px apart, and the taller boxes invert the grouping

**Filed:** 2026-08-11 (`fix/tap-target-inline-controls`, invariant-8 impeccable critique P2 + P3). **Class:** accessibility / mis-tap + visual grouping. **Effort:** S. **Class-sweep exception:** (a) — needs a design decision the filing branch cannot settle. **Reachability:** PROBED — the arc's e2e suite asserts the two rects are disjoint and measures both at 44px; the 6px separation is the cell's `gap-1.5`.

Two consequences of the floor repair at `components/admin/wizard/step3ReviewSections.tsx:1412`/`:1424`, neither a correctness defect:

1. **Separation did not grow with the targets.** The `tel:` and `mailto:` links are now 44px tall and 6px apart in a `flex-col gap-1.5` cell. Bigger targets make the intended one easier to hit AND the wrong one easier to hit; here the wrong one dials the driver mid-show.
2. **Grouping inverted.** With `items-center` in a 44px box, a 17px label leaves ~13.5px dead above and below, so the visual gap name→phone (~19.5px) is now smaller than phone→email (~33px). The two contact _methods_ became the furthest-apart things in the cell.

Folded in from the same gate (P3): sites 4/6/7 rely on `hover:` treatments for their only affordance, which `PRODUCT.md:59`'s venue-floor constraint bans as a sole affordance — 44px of air that looks exactly like static text is a bigger _invisible_ target. Pre-existing (the repair enlarged the boxes, it removed no rest state), but it is the same cell and should be settled with it.

**First scheduled step:** decide the resting presentation for a contact row — a container (`w-full justify-center rounded-sm bg-surface px-2`) so 44px reads as a row rather than a void — then set the gap from that decision rather than leaving `gap-1.5`.

## BL-GLOBALS-STALE-ACCENT-CONTRAST-COMMENT — globals.css states a contrast figure that has been wrong since 2026-07-16

**Filed:** 2026-08-11 (`fix/tap-target-inline-controls`, invariant-8 impeccable critique P3). **Class:** doc-rot with a measured cost. **Effort:** XS. **Reachability:** PROBED — the comment and the token are both in `app/globals.css`; the ratio was recomputed from the live values during the gate.

`app/globals.css:1206-1209` tells the reader, in the repo's own voice, that "`--color-accent-on-bg` is 4.11:1 on `--color-bg` … below the 4.5:1 normal-text floor (see `BL-ACCENT-ON-BG-AA-CONTRAST`)". That was true of `#c25e00`. `BL-ACCENT-ON-BG-AA-CONTRAST` shipped 2026-07-16 (`BACKLOG-archive.md:4983`) and moved the light token to `#a65000`, which measures **5.34:1** — the comment survived the fix that invalidated it.

**The cost is measured, not hypothetical:** in the impeccable critique of `fix/tap-target-inline-controls`, an assessment agent read this comment and raised a P1 against a token swap that in fact improves compliance, which then had to be refuted by recomputing both modes by hand. A stale figure in a load-bearing comment is a finding generator.

**First scheduled step:** correct the two figures in place (light 5.34:1; the tinted Callout/aside fills need re-measuring too, since their ≈3.6-3.9:1 claim has the same provenance) and re-point the `BL-` reference at the archive. The prose conclusion — that the prose-link layer uses text colour + underline rather than the accent — is a ratified decision and stays.

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

## BL-STEP3-FULL-CREW-PREVIEW — no full crew-page preview from a staged parse in wizard step 3

**Filed:** 2026-08-02 (retroactively; `docs/superpowers/specs/step3-onboarding/2026-06-23-onboarding-step3-review-redesign.md:290` lists it under §11 Out of scope / Backlog, with no row anywhere). **Class:** UX enhancement. **Effort:** M.

Step 3 reviews a staged parse through its own section cards, not through the surface the crew will actually see. A C-style full preview would render `CrewShell` from the staged `parse_result`, which needs a `parse_result → ShowForViewer` adapter. Verified 2026-08-02: no such adapter exists.

The adapter is the substance of the work, not the rendering — `getShowForViewer` builds its projection from persisted rows, and a staged parse is neither persisted nor viewer-scoped, so the adapter has to decide what a preview means for viewer name aliases, per-viewer visibility filters, and the admin-preview branch before any of it renders. UI surface, so Opus-owned with the invariant-8 dual gate.

**Status:** IN PROGRESS · **Branch:** feat/admin-ui-surfaces

---

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

## BL-SERVER-ACTION-ORIGIN-GATE-SWEEP — gate the remaining destructive Server Actions on same-origin

**Status:** OPEN · **Severity:** low · **Surfaced:** `fix/auth-picker-hardening` spec/plan (2026-08-15) · **Effort:** M

`fix/auth-picker-hardening` closes the crew picker's identity-clear actions (`clearIdentity` / `clearIdentityAndSkip` / `clearIdentityCore`) with `isSameOriginServerAction()` (`lib/auth/sameOriginServerAction.ts`), a proxy-independent Fetch-Metadata gate that never trusts `x-forwarded-host`/`host`. That helper reduces each peer destructive Server Action to a one-line guard, but the arc deliberately scoped itself to the picker surface (class-sweep disposition exception (c): a redesign spanning enough sites to blow the review scope).

**Reachable surface (stated, not probed here):** `rg -n '"use server"' lib app` at authoring time returned 38 files; not all are destructive, and the exact destructive set is the first step of this entry. Each destructive exported action that mutates on a forced cross-site POST has the same logout/CSRF shape as the filed `BL-SERVER-ACTION-ORIGIN-GATE`, minus a demonstrated higher-impact payload.

**Trigger / first step:** enumerate the destructive `"use server"` exports; gate each on `isSameOriginServerAction()` (admin actions behind a `require`-gate get it additively). Admin mutating routes under `app/api/admin/` are a separate transport (route handlers, not actions) and are out of this entry's scope.

---

## BL-SWITCH-PERSON-GOOGLE-LOOPBACK — menu "Switch person" is ineffective for a Google-authenticated viewer

**Status:** OPEN · **Severity:** low · **Class:** UX correctness / product decision · **Surfaced:** `fix/auth-picker-hardening` spec R1-F1 (2026-08-15) · **Effort:** M

For a viewer whose access derives from a live Google session (not a cookie-only picker identity), tapping "Not you? Switch person" clears the picker cookie entry but the next resolve re-mints the SAME identity via bootstrap, so the control appears to do nothing. This is pre-existing behavior, distinct from the silent-failure defect `fix/auth-picker-hardening` fixes, and out of that arc's scope (class-sweep disposition exception (a): needs a product decision).

**Reachability: PROBED.** `lib/auth/picker/resolveShowPageAccess.ts:246` — a Google `success` with a missing or mismatched picker entry returns `needs_picker_bootstrap`, which re-mints the identity; clearing the cookie entry does not end the Google session, so the loop closes back to the same person.

**Open decision:** whether menu switch-person should sign a Google viewer out (Supabase `scope: "local"`) as part of the clear, or whether the control should be hidden/relabelled for Google-authed viewers. Documented as a limit in the arc spec §4.7 / §7.

**Trigger:** the next auth/picker UX pass, or a product call on Google-viewer switch semantics.

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

## BL-NULLCODE-STAMP-BATCH-2 residuals (2026-07-03)

**Effort:** XS

Deferred out of the forensic code-stamping batch (`docs/superpowers/specs/observability/2026-07-03-nullcode-forensic-batch2-design.md` §9) — separate user-facing / alerting surfaces beyond the pure log-code enrichment.

**Heading caveat:** only the first two items (`BL-SCAN-SSE-BODY-NULL-CODE`, `BL-PICKER-TAMPER-ADMIN-ALERT`) actually came out of that batch. The rest accreted under this heading afterwards from unrelated 2026-07-04+ work (agenda visibility, quiet-link a11y, alert-link e2e, health-resolve lockdown, Step-3 impeccable) and are grouped here by filing date, not by subject. Read each item on its own; the heading is not a topic.

**Sweep status (2026-07-24/25).** Every item below was re-verified against live code, and citations that had rotted were corrected in place — several were badly stale (`AlertBanner.tsx` deleted, `PerShowAlertSection.tsx` deleted, a 9-code registry that is now 20, line numbers shifted). One item closed as obsolete (`BL-WATCH-ERROR-MESSAGE-RAW-DIAGNOSTIC`, since graduated to `BACKLOG-archive.md`). **Four** cross-model review rounds then caught further errors in the sweep itself, so treat the corrected text as verified but not sacred. The misses: a `grep -l` that matched a comment instead of a consumer; a nonexistent `shows.last_error_message`; a literal-attribute census that undercounted a dynamically-spread family by four; a "no live render exists" claim contradicted by an existing seeded e2e path; several citations pointing at an import, comment, JSDoc, or projection string rather than the executable binding; a component path copied from a review without resolving its directory; and a route prescription naming three renderers where the same section had already established four. **When picking up any item here, re-verify its citations before acting on them** — that is the whole lesson of this section. Working order for the rest: ~~PR2 `BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y`~~ (CLOSED, PR #592), ~~PR3 `BL-AGENDA-PERDAY-VIEWER-FILTER`~~ (CLOSED, PR #610), ~~PR4 `BL-SCAN-SSE-BODY-NULL-CODE`~~ (CLOSED, PR #621), ~~PR5 `BL-PICKER-TAMPER-ADMIN-ALERT`~~ (CLOSED, PR #623), ~~PR6 `BL-ALERT-ACTION-LINKS-E2E`~~ (CLOSED, PR #624 — the residual-sweep working order is COMPLETE). `BL-HEALTH-RESOLVE-DB-LOCKDOWN` stays an accepted risk, deliberately and not by omission. `BL-STEP3-IMPECCABLE-LIVE-RENDER` was unscheduled here and SHIPPED 2026-08-02 on `test/step3-live-render-cluster` (graduated to `BACKLOG-archive.md`).

### BL-THEME-PERSISTENCE-FAILURE-IS-SILENT — a blocked localStorage loses the theme on reload with no signal

**Severity:** LOW (the in-session pick still applies; only persistence is lost, and the fallback is the OS preference) · **Class:** UX signal · **Filed:** 2026-08-10 (`feat/crew-chrome-footer-avatar`, cross-model review round 1, finding 3) · **Effort:** S

**Probed, not theorized.** With `localStorage.setItem` throwing (restrictive in-app browser, private mode, third-party-storage block):

```
after-toggle-with-storage-blocked: dark:dark  stored null
next-load/os-light:                light
```

The user picks dark, the page turns dark, and the next load is light again with nothing said.

**Why it is filed rather than fixed here.** `components/layout/useAppliedTheme.ts` absorbs the write failure deliberately — throwing would take the whole control down over a preference, and the fallback (follow the OS) is the conservative answer. What is missing is the SIGNAL, and what the signal should say is a product-copy decision this arc cannot settle: a toast is heavy for a preference, an inline note next to a toggle inside a popover has nowhere to live, and "your browser will not remember this" is the kind of technical explanation `PRODUCT.md` §5 rules out of the UI. Class-sweep disposition exception (a): needs a product decision.

**Reachability:** PROBED — the failure mode is reachable in any embedded webview with storage partitioning, which is exactly where crew open a link from a group thread.

---

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

### BL-EXPORT-BLANK-ROW-SEGMENTATION — blank-row block segmentation fuses/splits sections silently (audit #10)

**Status:** OPEN at residual scope (partial closure 2026-07-27, `fix/export-blank-row-segmentation` — spec `docs/superpowers/specs/2026-07-27-export-blank-row-segmentation.md`) · **Severity:** medium · **Class:** EXPORT/PARSER ROBUSTNESS · **Effort:** L
**l-wave-screen 2026-08-06:** PREREQ-trigger — the residuals have no corpus-clean discriminator (the generic orphan-block rule was probed and REFUTED at 30 false positives); the in-body promote trigger is a live mis-grouped show.
**Promotion prerequisite:** a live mis-grouped show — a spacer-row stray value or mid-section blank row mis-groups data with no operator signal (the in-body "Trigger to promote" line, hoisted to a recognized gate field 2026-08-07 so the ledger viewer classifies the row as gated (watch); the Status lead was reworded from "PARTIALLY CLOSED" in the same pass because the viewer's terminal-status matcher read it as archived).

**Partial closure (2026-07-27):** two of the three spec'd fix directions shipped. (b) **Header-aware segmentation** — `splitBlocks` now starts a new block at a mid-block row whose first non-blank cell is an uppercase known section header (`isMidBlockSectionStart`, `lib/parser/knownSections.ts`; `CLIENT` excluded on corpus evidence), closing the FUSE case structurally for uppercase-known headers with corpus-verified zero output drift (`tests/drive/round-trip-fixture.test.ts` byte-equality + archived-tab fingerprint golden). (c) **Crew-scoped orphan detection** — a new warn-severity `ORPHANED_CREW_ROWS` ParseWarning (operator card + crew-region deep link) fires when a table block's first row carries a crew-role cell (≥2 distinct Load In / Load Out / Strike / Set tokens on one line) with no section header — the SPLIT case for crew rosters, at 0 corpus false positives and 29/29 simulated-split recall (ratcheted by `tests/parser/orphanedCrewRowsCorpus.test.ts`). **The backlog entry's generic orphan-block rule ("no recognizable header adjacent to a recognized section") was probed and REFUTED: 30 false positives on the live corpus** (GEAR-tab gear lists under room headers, INFO free-text blocks, PULL SHEET title rows) — blocks starting with non-header rows are normal sheet layout. **Residuals (still open):** splits of non-crew sections (hotel/transport/details tails have no corpus-clean discriminator); fuses onto mixed-case or unknown headers; crew rows carrying fewer than two role tokens on one line of one cell (including role cells authored with literal pipes, which the parser's cell split decomposes); and the mutation harness cannot observe the exporter-level fuse fix (it mutates exported markdown, never the grid), so `blank-row:remove` ledger holes remain by construction.

`splitBlocks` (`lib/drive/exportSheetToMarkdown.ts:127-144`) segments the sheet grid into blocks using fully-blank rows as the **only** delimiter. Two failure modes, both silent: (a) a stray value in a spacer row (normal authoring noise — a forgotten cell, a note typed into the gap) **fuses** two adjacent sections into one block, so the downstream parser attributes one section's rows to another; (b) a blank row inserted mid-section **splits** one section into two blocks, orphaning the tail rows from their header. Neither emits a signal — mis-grouped sections flow into the parser as plausible structure. The 2026-07-07 e2e audit re-verified this unchanged; the 2026-07-10 re-rating (§10) left it as the only numbered finding with zero movement (2 fixed, 2 partial, 1 by-design). The mutation harness pins the blast radius (`blank-row:inject` / `blank-row:remove` holes in `knownHoles.ts`, mapped via `OPERATOR_FINDING_MAP` — see BL-MUTATION-HARNESS-OPEN-HOLES above) but detection-in-tests is not detection-at-runtime. **Fix directions (pick at spec time):** (a) near-blank-row heuristic — a row with exactly one short non-blank cell adjacent to blank rows emits a warn-severity `ParseWarning` instead of fusing; (b) section-header-aware segmentation — a row matching a `KNOWN_SECTION_HEADERS` shape mid-block starts a new block (closes the fuse case structurally); (c) orphan-block detection — a block with no recognizable header row adjacent to a recognized section warns as a probable split. Any fix hardens a mutation-harness class → the corresponding ledger holes become `staleRows` per the ratchet above. Trigger to promote: a live show where a spacer-row stray value or mid-section blank row mis-groups data with no operator signal.

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

## BL-APP-EVENTS-DEBUG-LEVEL-CHECK-MISMATCH — a debug-level log can never persist, and the rejection is silent

**Status:** OPEN · **Severity:** LOW · **Class:** OBSERVABILITY · **Effort:** S · **Filed:** 2026-08-15 (`feat/admin-ui-surfaces`, from the `BL-OPS-LOG-DASHBOARD-BANNER` audit)

`LogLevel` includes `"debug"` (`lib/log/types.ts:2`), but the `app_events` CHECK accepts only three values:

```sql
level         text not null check (level in ('info','warn','error')),
```

(`supabase/migrations/20260629000002_app_events.sql:4`.) So a `debug`-level persist is CHECK-rejected by Postgres, and `persistAppEvent` swallows the returned error by contract — it records the fault for `/api/health` and writes to console, never throwing over the caller (`lib/log/persist.ts:12-40`, invariant 9). The row simply never lands.

**Reachability:** the type admits the value at every `log.*` call site, so nothing but convention stops a `debug` emit; no current producer uses one (which is why this is LOW, not MEDIUM).

**The decision this needs, and why it was filed rather than fixed:** which side moves. Widen the CHECK to accept `debug` (and accept that the forensic log gains a chatty tier with a 60-day retention window), or narrow `LogLevel` to the three values the sink actually stores (and give `debug` callers a console-only path that is honest about not persisting). That is a product decision about what the run log is for, not a repair — class-sweep disposition exception (a).

## BL-E2E-APP-DEPENDENT-SPECS-CI-DARK — 23 app-dependent e2e specs are named by no CI workflow

**Status:** OPEN · **Severity:** MEDIUM (dark regression coverage) · **Class:** CI wiring · **Effort:** L · **Filed:** 2026-08-06 (L-wave, refile of `BL-E2E-LIFECYCLE-SPECS-CI-DARK` at honest scope)

**The `UNSEEN` rows of `tests/ci/_metaE2eWorkflowCoverage.test.ts` are e2e specs named by no CI workflow** — that allowlist is the population, and the count is whatever it holds (the table below records the measured figures; it was 43, then 32 after PR #743, 25 after that batch, 24 after M-wave 2 W-E2E, and 23 once help-pages joined). No number is restated in this sentence, because a narrative copy of a machine-held count is exactly what went stale here. They are the residual of the 2026-07-26 CI-dark cluster, which closed everything that did NOT need a running application: `standalone-e2e.yml` now runs the whole standalone config unfiltered on every PR, and that alone retired 30 allowlist rows.

**Census, RESTATED 2026-08-09 by counting the allowlist rather than by arithmetic** (the "~60" this
entry was first filed with was wrong, and the miscount is recorded so the number is not re-inflated;
the 2026-08-06 counts are kept alongside so the delta is auditable):

| Allowlist rows                                                          | 2026-08-06 | 2026-08-09 |
| ----------------------------------------------------------------------- | ---------- | ---------- |
| `UNSEEN` — named by no workflow, **this entry's population**            | 43         | **25**     |
| `PATH_GATED` — named by a workflow, runs when its filter matches        | 13         | 13         |
| `PATH_GATED_BY_EXCLUSION` — named, runs unless the change is prose-only | 6          | 8          |
| `LOCAL_ONLY` — local artifact by design                                 | 1          | 1          |
| custom-reason rows                                                      | 3          | 3          |
| **Total rows**                                                          | 66         | **50**     |

The 11-row drop in `UNSEEN` and the 9-row drop in the total are `BL-RESURRECT-MOBILE-SAFARI-E2E`
(archived 2026-08-09): NINE rows removed with their deleted spec files, and TWO reclassified
`UNSEEN` → `PATH_GATED_BY_EXCLUSION` as `crew-e2e.yml` grew crew-page and theme-toggle.
`right-now-transitions` stayed `UNSEEN` at that count — its whole-file valve had fired
(`BL-RIGHTNOW-SECTION57-FIXTURE-INERT`). **RESTATED 2026-08-10 (M-wave 2 W-E2E):** that verdict was
overturned by probe (the inertness was `getShowForViewer`'s per-show `unstable_cache` tag, not the
anchor source); the spec is un-skipped, wired desktop-chromium in `crew-e2e.yml`, and reclassified
`UNSEEN` → `PATH_GATED_BY_EXCLUSION` — `UNSEEN` 25 → **24**, `PATH_GATED_BY_EXCLUSION` 8 → **9**,
total unchanged at 50. Only the NINE deletions move the
TOTAL (66 → 57); the two reclassifications move a row between buckets and cannot change it. A first
draft of this table said 54 by counting only rows whose value is a bare constant, which silently
dropped the three custom-reason rows — recorded because an uncounted bucket is exactly how the
original "~60" overcount happened. Recounted from
`tests/ci/_metaE2eWorkflowCoverage.test.ts`, which is disk-walked, so these numbers are checkable
rather than asserted.

Path-gated rows are NOT this entry's scope: a workflow does name them, and "not PR-blocking-capable" is a different property from "runs nowhere". Conflating the two is what produced the original overcount.

**The blocker is not uniform, and promoting the cheap ones first is the obvious first batch.** Most of the remaining rows need a dev server AND a seeded database, which is why the cluster excluded them — but not all do. Sorting them by what they actually require, and wiring the cheapest first, is a cheaper opening move than the entry's original all-or-nothing framing implied. Batch 1 did exactly that; **read the current population off the allowlist rather than off this paragraph**, which is how the figure went stale here in the first place.

**This entry replaces a row whose heading premise had gone false.** Its predecessor was named for two `admin-lifecycle` specs being invoked by no workflow; both have been wired since 2026-07-27 and run on `mobile-safari` on every `pull_request` (`.github/workflows/lifecycle-layout-e2e.yml:110,130,132`, re-verified 2026-08-06). The full wiring history is preserved in `BACKLOG-archive.md` § `BL-E2E-LIFECYCLE-SPECS-CI-DARK`. Only the app-dependent residual survives here, and the scope has not changed — only the name now matches it.

**Promotion path — the entry's own, and it is incremental by design:** land green batches one at a time rather than attempting the whole residual at once. `crew-e2e.yml`'s `CREW_E2E_ONLY` + `pnpm db:seed` pattern is the working template for an app-dependent job, and `lifecycle-layout-e2e.yml` is the worked example of the acceptance bar a batch must clear: **five consecutive green normal-dispatch runs** before a spec is considered wired (spec §6.1 / AC-6). That bar is what took the transitions spec from "one flaky case" to wired, and it is the reason batches must be small.

**Owner action that no branch can close.** Promoting e2e jobs into the branch-protection required set — so a red e2e blocks merge at the GitHub layer — is a GitHub-settings action, not repo code. Measured 2026-07-26: the live required set holds TWELVE contexts, and no e2e job is among them, which is why every e2e job is advisory. Until an owner changes that, enforcement is the pipeline's all-checks-green procedural gate. Measurement: `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md` §2.5.

**Batch 1 — SEVEN specs wired, census 32 → 25** (this entry is restated in the same PR that wires them, so it describes that PR's content, not a merge that has already happened) (PR #753, `.github/workflows/app-e2e.yml`, an always-on bare-`pull_request` job running both projects with `--retries=0` behind a per-spec executed-count oracle, `scripts/check-app-e2e-executed.mjs`). Wired: `sample`, `root-landing`, `admin-layout`, `admin-phase2-surfaces`, `notify-toggles`, `me-page`, `report-modal`. Their `UNSEEN` rows are deleted, which is what moves both the population and the total by seven. Spec: `docs/superpowers/specs/ci/2026-08-09-app-e2e-batch1-design.md`.

Five of the nine specced members were RED when first run — the spec had verified them by full-file read, and a read is not a run. Four were repaired in-branch as test-only staleness (a Next 16 streamed `redirect()` answering 200 where two specs asserted a 3xx first hop; a `/show/<slug>` href predating the M11.5 picker pivot; a Phase-2 dev-link guard whose telemetry exemption matched the raw href and so failed on its own sanctioned link once that link grew a `#health` fragment). Recorded here because the same read-not-run gap will otherwise be repeated by batch 2: **derive a batch's membership from a real run, not from reading the files.**

**Ninth member deferred at batch 1, wired since — `help-pages.spec.ts`, census 24 → 23.** It was held back with its `UNSEEN` allowlist row intact because its blocker was an APP defect, not a wiring gap: `/help/tour` threw a React hydration mismatch (13 page errors) under `pnpm dev` and the production build alike. The fix landed in `app/help/tour/page.mdx`, a UI surface under invariant 8, so repairing it dragged the impeccable dual gate into what is otherwise a CI-wiring arc — it got its own arc, `BL-HELP-TOUR-HYDRATION-MISMATCH` (graduated to `BACKLOG-archive.md`, `fix/help-tour-hydration`), where the mismatch turned out to be nested markdown paragraphs emitted by three prettier-reformatted link cards. That arc then spent the promotion this paragraph had banked: the allowlist row is deleted, the spec is named by `app-e2e.yml`'s run step, and it carries a `"help-pages.spec.ts": 15` row in the executed-count oracle. The route-coverage guard was already repaired at batch 1 (it derives from the `_nav.ts` export and covers `/help/admin/settings`), which is why the promotion cost exactly the one allowlist-row deletion this paragraph predicted.

**A second member was dropped mid-acceptance under AC-4 — `admin-changes-feed-layout.spec.ts`, and RE-ENTERED 2026-08-15.** The cross-spec-interaction reading recorded below is DISPROVEN; the measured cause was a transient gateway 502 reaching the `/admin` error boundary, and the repair plus the spec's re-entry are recorded in `BACKLOG-archive.md` under `BL-CHANGES-FEED-MODAL-BATCH-FLAKE`. The AC-4 bar itself is vindicated either way — it caught a real CI-reproducible failure that local runs could not see. Unlike help-pages this one is a genuine FLAKE, and it was caught by exactly the bar that exists to catch it: it passed the first two `pull_request` runs of the five-green loop and then failed two of the next three, on a DIFFERENT width band each time (`@720`, then `@1280`, both mobile-safari), with `published-show-review-modal` never appearing inside a 30s wait after `/admin?show=<slug>`. It appeared to pass standalone (6/6 locally, repeatedly) and to fail only inside the batch — read at the time as a cross-spec interaction, and now known to be a sampling artifact: standalone ran only LOCALLY, where the CI-hosted fault environment does not exist, so the batch runs were the only samples that could ever fail (spec §2.3). Filed as `BL-CHANGES-FEED-MODAL-BATCH-FLAKE`. Recorded because the local signal was misleading in BOTH directions here: the same spec's local reds were correctly attributed to a shared-database collision with a concurrent agent session, and that correct diagnosis then masked a real CI-reproducible flake underneath. **Only CI settles a flake question — AC-4 exists so an admitted flake never rides in.**

**`onboarding-wizard-step1.spec.ts` is excluded from every batch until a seed-state redesign, and the reason is recorded so batch 2 does not re-derive it:** it asserts `[data-testid=onboarding-wizard]` on `/admin`, but `supabase/seed.ts` sets `app_settings.watched_folder_id` and `app/admin/page.tsx` then renders the dashboard — a deterministic failure on any seeded DB, and a required state mutually exclusive with `admin-changes-feed-layout.spec.ts`'s.

**Structural guard already in place:** the workflow-coverage meta-test with its reasoned allowlist (`tests/ci/_metaE2eWorkflowCoverage.test.ts`) shipped with the archive-row-menu-idiom branch. Wiring work here is moving a spec OFF that allowlist by adding it to a workflow — the guard makes each removal explicit rather than silent.

**Related, filed separately:** `BL-E2E-LAYOUT-FIXED-WAIT-RESIDUE` (three fixed waits the 2026-08-03 class sweep found in the layout spec).

## BL-MODAL-WAIT-BOUNDARY-HELPER-ADOPTION — adopt the boundary-recovering wait helper across the other modal-waiting e2e specs

**Status:** OPEN · **Severity:** LOW (flake exposure on already-wired workflows; no product impact) · **Class:** e2e flake hardening · **Effort:** M · **Filed:** 2026-08-15

The `BL-CHANGES-FEED-MODAL-BATCH-FLAKE` arc proved the class mechanism from two failing CI runs' own logs (spec `docs/superpowers/specs/ci/2026-08-15-changes-feed-modal-batch-flake-design.md` §2): a transient gateway 502 on the foreground `get_admin_show_review_snapshot` RPC throws the loader to the `/admin` error boundary, and any spec waiting only for `published-show-review-modal` starves its full timeout. The repair shipped a shared helper (`tests/e2e/helpers/openShowReviewModal.ts` once that arc's implementation lands) that recovers once via the boundary's own Retry and surfaces the recovery as a test annotation. This entry is the peer-adoption sweep: two overlapping censuses (2026-08-15, not deduplicated against each other) share the starve-on-boundary shape — `rg -l 'published-show-review-modal' tests/e2e/*.spec.ts` names 7 other specs asserting the modal testid (`admin-lifecycle-layout`, `admin-lifecycle-transitions`, `admin-parse-panel`, `attention-modal-gallery`, `dev-capture`, `font-binding`, `picker-flow`), and `rg -c 'admin\?show=' tests/e2e/published-*.spec.ts` names 7 navigating the modal URL directly (`published-review-modal.{layout,crew-actions,deeplink,interactions,reopen,realtime}`, `published-show-attention`). Derive the member list by re-running both greps at pickup, not from this snapshot.

**Deferral reason (c):** spans many sites and several workflows (`published-modal-e2e.yml`, `lifecycle-layout-e2e.yml`, …) — blowing the parent arc's review scope. **Reachability:** INFERRED, NOT PROBED per-spec — the class mechanism is CI-proven on the parent arc; the probe that settles each peer is its own workflow's failure history.

## BL-SNAPSHOT-READ-TRANSIENT-502-POSTURE — should the show-review snapshot read absorb one bounded retry before throwing to the boundary?

**Status:** OPEN · **Severity:** LOW (rare, recoverable via the boundary's own Retry) · **Class:** product posture decision · **Effort:** S · **Filed:** 2026-08-15

A transient gateway 502 on `get_admin_show_review_snapshot` currently throws `show_review_snapshot_failed` to the `/admin` error boundary (`app/admin/_showReviewModal.tsx`, `snapResult.kind === "infra_error"` branch) — a real admin sees the boundary flash and must click Retry. Evidence: two CI occurrences with exact-timestamp server-log correlation in spec `docs/superpowers/specs/ci/2026-08-15-changes-feed-modal-batch-flake-design.md` §2.1, plus a same-class unmasked witness (`An invalid response was received from the upstream server`, the Kong 502 body). A single bounded server-side retry on this READ would spare that flash; the loader's other reads already fail open.

**Deferral reason (a):** reverses the ratified fail-hard posture (`app/admin/_showReviewModal.tsx:25-30` — "infra faults still THROW to the error boundary") — a product decision the test-infra arc could not settle. The decision needs an owner ruling on whether a read-retry weakens the fail-loud contract or merely debounces it.

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

## BL-PSQL-SCAN-NEXT-VARIANT-BUILD-DIRS — the psql startup-file scan walks `.next-*` build outputs and blows the stack

**Status:** OPEN · **Severity:** MEDIUM (a whole guard suite is red locally for a reason unrelated to any change; the failure names a TypeScript internal, not the cause) · **Class:** guard robustness · **Effort:** S · **Filed:** 2026-08-11

**Probed 2026-08-11 on `fix/help-tour-hydration`**, where the suite failed 19/745 with `RangeError: Maximum call stack size exceeded` inside `tests/cross-cutting/psqlStartupFiles/scan.ts:535`, on a tree whose only source changes were one MDX page and CI wiring. Bisecting by reverting each changed file to `origin/main` left it red; the cause was never in the diff.

`IGNORED_AT_ROOT` (`tests/cross-cutting/psqlStartupFiles/scan.ts:315`) lists `.next` but not the sibling output directories this repo's own tooling writes: `playwright.config.ts` and the screenshot/flip scripts build into **`.next-dev`, `.next-prod`, `.next-prod-flip`, and `.next-screenshots-help`**. Those are walked. An AST-depth probe over the walk's own directory rules found 6516 files, of which twelve are ~12 MB webpack chunks the walk skips only by luck of the parse, and several bundled files reach an AST depth of 4342 — the recursive `visit` at `:535` overflows long before the guard reaches a psql call site.

Moving the four directories outside the repo and re-running takes the same suite to **745 passed** with no other change. Same command, same tree.

**Why it matters more than a local annoyance.** The failure mode is silent misattribution: the stack trace names `typescript.js` and the scan's own line 535, so the reader's first hypothesis is their own diff. That cost a bisect on this arc. Worse, the walk is the guard's completeness claim — a walk that dies partway through has not certified the tree, and 19 red tests are the only thing standing between that and a false green if the overflow were ever caught and swallowed.

**Why it is filed rather than repaired in the arc that found it — exception (c).** The repair is on a guard surface this PR does not otherwise touch, and this particular guard's review history (its own test names run to "R40 escaping mutants") is precisely about enumerated recognizers not terminating. Adding four literals to an enumerated ignore list is the shape that invites the next round to ask for a derived one. It deserves its own arc, where the derivation question can be answered properly.

**The derivation is available, which is the real fix.** The ignored set is enumerable from configuration rather than by hand: `next.config.ts` / the build scripts name their `distDir`s, and `.gitignore` already lists all four. A walk that skips what git ignores at root would close the class instead of the four instances, and would not need editing the next time a build script picks a new output directory.

## BL-SCREENSHOTS-DRIFT-STALE-NEXTCACHE-SELF-PERPETUATING — a failing drift run can never refresh the cache that made it fail

**Status:** OPEN · **Severity:** MEDIUM · **Class:** CI-INFRA · **Effort:** S · **Filed:** 2026-08-14 from a live main-branch incident

`screenshots-drift.yml` restores `.next-screenshots-help/cache` via `actions/cache` with a `restore-keys` prefix fallback, and `actions/cache` saves only in the post step of a SUCCESSFUL job. Those two facts compose into a trap: once every saved `Linux-nextcache-screenshots-*` cache predates a UI-changing merge, the nightly drift job restores a stale Next build cache, renders the OLD chrome, diffs against the CURRENT committed baselines, fails — and by failing, skips the cache save that would have replaced the stale cache. The failure self-perpetuates until a human deletes the caches.

**Probe evidence (two-run, 2026-08-14).** Main-branch drift runs 31693276503 and 31748971797 failed on the same 6 `public/help/screenshots/crew-preview-*.webp` files (md5-verified as the only drifting set) while (a) the committed baselines were current — regenerated at `a5e1ee44d` AFTER the #779 UI change — and (b) the sanctioned `screenshots-regen.yml` on the same sha, same pinned image (`mcr.microsoft.com/playwright:v1.59.1-jammy`), same `pnpm screenshot:help` command committed NOTHING ("No baseline changes to commit") — the regen workflow has no cache step, so a fresh build reproduced the committed bytes exactly. All 12 saved caches predated #779. Deleting all 12 via `gh cache delete` and re-dispatching flipped the outcome: run 31749355724 SUCCESS with zero source change. Same sha, same image, same command; the only variable was the restored cache.

**Repair directions (any one closes the class):** key the cache on a hash of the inputs that feed the build (so a stale restore is impossible, not merely unlucky); or split restore/save into explicit `actions/cache/restore` + `actions/cache/save` with `if: always()` so a failing run still refreshes its cache; or drop the `restore-keys` prefix fallback so a miss builds cold instead of restoring a wrong-generation cache. Whichever lands should note in the workflow why, citing this entry.

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

### BL-SERIALIZE-ERROR-NON-ERROR-BRANCH-STRINGIFIES — a plain-object error still persists as "[object Object]"

**Status:** OPEN · **Severity:** MEDIUM (diagnostic loss on every non-`Error` value logged) · **Class:** observability · **Effort:** M · **Filed:** 2026-08-15 (`fix/sync-log-emit-guard` PR #808, diff review R3)

**Probe evidence.** `lib/log/serializeError.ts` is `error instanceof Error ? { name, message, stack } : String(error)`. The non-`Error` branch is `String(value)`, so any plain object collapses to the literal `"[object Object]"`. Supabase/PostgREST returned-errors are exactly that shape — plain parsed-JSON objects, never `Error` instances (`PostgrestBuilder.ts` returns them from the parsed body), and several call sites forward them straight to `log.*`:

```
lib/auth/picker/resolvePickerSelection.ts:56    ...(detail === undefined ? {} : { error: detail })
lib/auth/picker/resolveShowPageAccess.ts:75     ...(detail === undefined ? {} : { error: detail })
lib/log/emitIdentityLinkRenameUnlanded.ts:65    error: result.error
lib/log/emitLeadRoleApplied.ts:76               error: result.error
```

Reproducing `serializeError` against a Supabase returned-error `{ message: "gateway 502", code: "PGRST301", … }`:

```
plain object (Supabase)   ->  "[object Object]"
Error instance            ->  {"name":"Error","message":"boom","stack":"…"}
```

**This is NOT a regression from PR #808, and the distinction is the reason the row exists rather than a fix.** That PR removed a double-`serializeError` wrapper at 18 sites. Measured before and after at the same four sites: a plain object produced `"[object Object]"` BOTH ways (identical, unchanged), while an `Error` went from `"[object Object]"` to a full `{name, message, stack}`. The repair is strictly non-regressive and strictly better for `Error` values; what it did was make an INDEPENDENT pre-existing defect visible, namely that the helper's own non-`Error` branch discards structure.

**Why filed rather than fixed in that PR (disposition reason (c) — a redesign of a surface the PR does not otherwise touch, spanning far more sites than its review scope).** `serializeError` is the single canonical error-shaping helper; changing its non-`Error` branch changes the shape of `context.error` for EVERY non-`Error` value logged anywhere in the app, which touches the `app_events.context` payload shape, the redaction pass in `sanitizeContext`, and `tests/log/serializeError.test.ts`, which pins the current contract deliberately. That is its own arc with its own review, not a rider on an emit-guard PR whose spec explicitly holds the helper's behavior constant (`docs/superpowers/specs/observability/2026-08-15-sync-log-emit-guard-design.md` §2.2 treats `serializeError`'s behavior as given).

**The shape of the fix, when scheduled.** Preserve structure for non-`Error` values rather than stringifying: a plain object should serialize to its own enumerable fields (bounded depth, same truncation posture as the existing `stack` slice), with `String(value)` kept only for primitives. Sweep for the class, not these four sites: the defect is in the HELPER, so every `log.*` call that can receive a non-`Error` is an instance. Derive the site set rather than enumerating it — `tests/log/noDoubleSerializedLogError.test.ts` already walks `lib/`, `app/`, and `components/` for `log.*` call sites and is the natural place to hang a companion assertion.

### BL-SYNC-LOG-ATTRIBUTION-METATEST — structural guard that every sync_log writer names its show

**Status:** OPEN · **Severity:** MEDIUM (regression prevention; the defects it guards are repaired in `fix/sync-log-show-id-duration`) · **Class:** structural guard · **Effort:** M · **Filed:** 2026-08-09

**Why filed rather than shipped with the repair it guards.** Descoped under the three-round prose cap (`docs/agents/spec-self-review.md:22`) after its _definition_ — not the change it guards — consumed spec review rounds 11, 12, and 13 plus two self-found findings. Each repair to the guard's accept-set or marker vocabulary introduced the next round's edge case, which is exactly the negative-marginal-value pattern that rule describes. The attribution repairs themselves are correct with or without it; the guard prevents future regressions.

**The design is done and should be implemented as specified, not re-derived.** Six rounds of work, preserved:

- **Writers are DERIVED from the exports of `lib/sync/syncLog.ts`**, plus the `logSync`/`insertSyncLog` method and callback forms, plus a literal `insert into … sync_log` (schema qualifier optional). A hand-listed writer set omitted `writeSyncLog` and `makePostgresSyncLogSink` while `app/api/cron/sync/route.ts:4,21` imports and wires the former (spec R4 F4).
- **Emission vs construction:** `makePostgresSyncLogSink(sql)(entry)` is immediately invoked with no binding (`lib/sync/syncLog.ts:54`), so for `f(a)(b)` the OUTER call is the emission and the inner is construction (spec R6 F2).
- **Only inline object literals are judged.** Measured on the live tree: 37 sites, 12 non-attributing, of which 3 were false positives — `lib/sync/runPushSyncForShow.ts:246`, `lib/sync/runScheduledCronSync.ts:2250`, `lib/sync/syncLog.ts:54` — because a variable argument hides a present `driveFileId`. A variable argument is a documented limit, not a finding.
- **Exemption is site-precise**, never a file-level registry: a file-scoped row for `lib/sync/runOnboardingScan.ts` (which needs one for `:1134`) would exempt the seven superseded sites in the same file — the very sites the guard exists to catch.
- **Three disjoint markers**, none substitutable: `run-level-sync-log` (no show is knowable), `sync-log-no-attempt` (a show may be knowable but this call reaches no attempt — the wizard `applyStaged` call), `sync-log-emission-gap: <BL-id>` (an attempt happens, is unemitted, gap filed).
- **Entry-point rule keys on the SINK PARAMETER**, not transitive reachability, which is recursive and unsatisfiable — `unarchiveShow` reaches a writer, so its callers would owe sinks up the whole graph (spec R13 F1). A signature that cannot carry a sink is a defect to widen, not grounds to exempt the path.
- **Scope bound:** roots `lib`, `app/api`, `app/admin`; ~150 lines, and past ~250 narrow the claim rather than widen the recognizer. Threat model is ordinary authoring; deliberate obfuscation files to documented limits.
- Mechanism: `walkSourceFiles` (`lib/messages/__internal__/walkSourceFiles.ts:8-11`) + TypeScript AST, per `tests/log/_metaMutationSurfaceObservability.test.ts`.

A working draft exists in the shipping session's scratchpad; the design above is authoritative.

**Two open definitional questions the shipping arc did NOT settle (spec R14 F2/F3) — resolve these before implementing, do not treat the design above as complete on them:**

- **The signature-keyed accept-set is not yet decidable.** If "carries `logSync`" means a DIRECT property it excludes real entry points whose sink is nested — `runManualSyncForShow`/`_unlocked` via `processDeps.logSync` (`lib/sync/runManualSyncForShow.ts:48-72`), `applyStaged`/`_unlocked`/`applyStagedParse` via `firstPublishedTailDeps.logSync` (`lib/sync/applyStaged.ts:369`, `:950`, `:1152`, `:1940`, `:2073`). If nested properties count, a checker probe admitted five non-runners — `evaluateQualityRegression_unlocked` (`lib/sync/runScheduledCronSync.ts:316-381`), `runPhase1_unlocked` (`:2543-2549`), `runPhase2_unlocked` (`:2551-2557`), `prepareProcessOneFile` (`:2858`), `prepareOnboardingFiles` (`lib/sync/runOnboardingScan.ts:1194-1204`) — plus `runOnboardingScan`, whose production caller passes only `{ onProgress }` (`app/api/admin/onboarding/scan/route.ts:282-284`) while the callee opens its own logging transaction, leaving no truthful disposition.
- **The three markers are not disjoint in the current tree.** Every run-level seed also reaches no per-file attempt, so `run-level-sync-log` and `sync-log-no-attempt` are both defensible at all eight seeds (`lib/sync/runScheduledCronSync.ts:3780`, `:3796`; the four `lib/onboarding/sessionLifecycle.ts` sites; `lib/sync/runOnboardingScan.ts:1134`; `app/api/drive/webhook/route.ts:224`). Either collapse them or find a predicate that separates them.

**Scope addition (2026-08-15, `fix/sync-log-emit-guard` / PR #808).** When this walker is built it ALSO asserts GUARD-PRESENCE alongside attribution: every derived `sync_log` sink invocation must sit inside a try/catch that escalates under `SYNC_LOG_EMIT_FAILED`, not merely name its show. The emit-guard arc repaired every unguarded site on the live tree but deliberately shipped NO completeness recognizer for FUTURE sites (`docs/superpowers/specs/observability/2026-08-15-sync-log-emit-guard-design.md` §4 limit 6, ship-and-fence): a second ad-hoc walker would fork the writer-set definition designed here, which is the two-copies-drift shape. The two dimensions share one writer-set derivation, so they belong in one guard. The regression accepted in the meantime is bounded — a new unguarded site regresses to the pre-arc LOUD behavior (the sink throw propagates and fails the observed operation), never a silent one.

**Promotion prerequisite:** none for scheduling, but the two questions above are the first work, not an afterthought — they are why this was descoped.

**Interim coverage:** `fix/sync-log-show-id-duration` ships `tests/sync/syncLogRepairSites.test.ts`, an enumerated pin over the fifteen sites it repairs. Delete it when this guard lands.

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

### BL-FLIGHT-UNSTRUCTURED-LEG-RAW-FALLBACK — a leg with no displayable content beyond its date renders as an unlabeled raw line

**Effort:** M

**Filed:** 2026-08-10, whole-diff review R2 F3 on `feat/crew-field-enrichment`, which refuted the claim that the unlabeled-leg render "no longer exists" while `BL-FLIGHT-LEG-ORIENTATION` was being archived. This row is that entry's successor: the archived one closed because the structured card became the DEFAULT render, and this one carries the residual it did not cover.

**Corrected diagnosis (review S5 R4, probed).** An earlier draft of this entry called these legs "unstructurable". That is wrong, and the distinction changes the repair direction: `parseFlightItinerary("3/22 Charter pending | 3/24 Return pending", 2026)` returns two segments with `structured: true` and both dates parsed (`2026-03-22`, `2026-03-24`). They take the raw branch because the segment carries no DISPLAYABLE content beyond the date — no flight number, route, times, or confirmation — so the structured renderer has nothing but a date to show and falls back to the operator's text. The parser is not failing; the card has nothing to lay out.

**Reachable live surface, with the branch already pinned by a test.** `components/crew/sections/TravelSection.tsx` renders structured fields only when a leg carries content beyond a bare date; otherwise it falls back to `seg.raw` under `data-testid="travel-flight-leg"`, deliberately, so an operator's text is never dropped. `tests/components/crew/sections/TravelSection.flight.test.tsx` pins that branch. An itinerary such as `3/22 Charter pending | 3/24 Return pending` produces TWO such legs, and a crew member then sees two unlabeled lines with no arrival/departure orientation — the shape the archived entry described, surviving in the narrow case.

**Why this is a different problem from the entry it succeeds.** That entry asked for labels once a structured source existed; the source exists and the labels ship. This one is about segments that ARE structured — `structured: true`, date parsed — but carry no other displayable field, so the structured card has only a date to lay out and hands them to the raw branch. Layout work on the card's populated fields therefore never reaches them: the gap is what to render when every field except the date is empty. The candidate direction is a RENDERER one — give the date-only segment a labeled treatment of its own — not parser widening, which an earlier draft of this row wrongly implied and which would find nothing to fix.

**Why backlog, not now:** the fallback is truthful today — it shows exactly what the sheet says, and the date still drives sort and emphasis. Nothing is silently wrong; what is missing is orientation in a case whose real-world frequency has not been measured. **Promotion prerequisite:** a corpus probe over live `flight_info` values counting how often a segment parses but carries no displayable field beyond its date. Because the segments ARE structured, the cheap direction is a renderer question — give the date-only segment a labeled treatment of its own — rather than the parser widening an earlier draft implied.

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

## BL-DIAGRAM-DEMOTE-SIGHTED-PARITY — the full-detail fallback is announced but never shown

**Status:** OPEN. · **Filed:** from the invariant-8 dual gate on `feat/diagram-viewing-polish` (2026-08-11, both halves independently) · **Severity:** medium · **Class:** A11Y/UX · **Effort:** S

The zoom gate loads the original only on zoom intent, and when that fetch fails the slide demotes
back to the clamped tier rather than showing "Image unavailable"
(`components/diagrams/GalleryLightbox.tsx`, spec `docs/superpowers/specs/2026-08-10-diagram-viewing-polish.md` §4.1).
The demote announces once, through an `sr-only` `role="log"` region. A SIGHTED crew member gets
nothing: they pinched a stage plot, the image stayed soft, and no pixel says why or that pinching
again will not help. Screen-reader users are told; everyone else is not, which is the parity gap
backwards from the usual one.

**Reachability:** PROBED at the design layer, not in a browser — the code path is exercised by
`tests/components/diagrams/galleryLightbox.zoomGate.test.tsx` ("a zoom-triggered original failure
keeps the image and falls back to the clamped tier"), and the only emitted signal there is the log
entry. What is NOT settled is the affordance: a transient inline chip on that slide is the obvious
shape, but it is new chrome on a surface whose decision round explicitly declined new chrome during
the sharpen (§1.1), so the boundary between "progress affordance" (declined) and "failure notice"
(not considered) is a product call. Fold into `DIAGRAM-FAILURE-RECOVERY-1` if that entry is taken
up first — one decision covers both.

## BL-DIAGRAMS-ANNOUNCE-CHANNEL-TTL — two crew announce channels ship without the pruning their own module prescribes

**Status:** OPEN. · **Filed:** from the invariant-8 dual gate on `feat/diagram-viewing-polish` (2026-08-11, audit half) · **Severity:** low · **Class:** A11Y · **Effort:** XS

`components/diagrams/Gallery.tsx` calls `useAnnounceLog()` twice with no `ttlMs`. The gallery
channel's region lives for the whole page session, so N thumbnail failures leave N permanent
`sr-only` sentences that a top-down screen-reader read recites before reaching the grid — the exact
accumulation `components/admin/announceLog.tsx:31-51` documents and measures for the admin channel
(12 undos = 12 sibling nodes / 686 chars). The dialog channel is bounded by
`resetDialogChannel()` on `onExitComplete`, but a close CANCELLED by a re-open inside the 220 ms
window retains the dialog instance and its log, so that session opens pre-populated.

**Reachability:** PROBED by reading — `ANNOUNCE_LOG_TTL_MS` exists and is exported for exactly this
case, and neither call site passes it. Not repaired in-branch because the module's own doc weighs a
strand hazard against accumulation and settles it per channel, and settling it for two NEW channels
belongs with a look at whether the crew page should share the admin provider at all rather than
carry two of its own.

## BL-LIGHTBOX-INACTIVE-SLIDES-IN-A11Y-TREE — every carousel slide is exposed, with no current marker

**Status:** OPEN. · **Filed:** from the invariant-8 dual gate on `feat/diagram-viewing-polish` (2026-08-11, audit half) · **Severity:** low · **Class:** A11Y · **Effort:** XS

Embla keeps all slides mounted, and `components/diagrams/GalleryLightbox.tsx` marks none of them
`aria-hidden`. A gallery of twelve diagrams therefore presents twelve images and twelve `sr-only`
figcaptions to assistive technology with nothing saying which one is on screen; the visible
"N of M" indicator is the only current-slide signal and it is not associated with the slides.
The same shape is why arriving on a slide that failed while inactive is silent: nothing announces
the active-slide transition.

**Reachability:** PROBED by reading the rendered tree in
`tests/components/diagrams/GalleryLightbox.test.tsx`, which queries inactive slides by DOM rather
than by role precisely because they are all present. `aria-hidden={!isActive}` is a one-attribute
change, deferred only because it moves several existing role-based queries and belongs with the
current-slide announcement decision rather than ahead of it.

### BL-PREMISESCAN-IMPORT-EDGE-FIDELITY — ordinary import forms and helper-body unclassifiable constructs silently lose environment reach

**Status:** OPEN · **Severity:** MEDIUM (both halves are false NEGATIVES — the direction that does not announce itself) · **Class:** guard fidelity · **Filed:** 2026-08-15 (`docs/scanner-scope-totality-spec`, spec review R1 findings 2 and 3 — reviewer-probed, transcripts below) · **Effort:** M

Two probed reachability gaps in `tests/mutation/source/premiseScan.ts`, distinct from the scope-resolution axis `BL-PREMISESCAN-NESTED-HELPER-SCOPE`'s arc repairs (that arc also fixes the ALIAS row below, the one case inside the lookup it already rewrites; the rest is this row).

**Half 1 — import forms.** Cross-module extent lookup resolves by the LOCAL name against the target module, and import facts keep only local-name → specifier, so ordinary repository-local refactors lose a reachable spawning helper. Reviewer probe (same helper, same call site, only the import form varied):

```
direct          -> environment-touching
named_alias     -> environment-free      (fixed by the scope arc: propertyName-aware lookup)
namespace       -> environment-free
default_renamed -> environment-free
reexport        -> environment-free
```

Namespace imports, renamed defaults, and re-export chains need tracking structures the scanner does not have (namespace member edges; re-export following — the canonical premise design additionally wants an unfollowable re-export to report `unclassifiable`, not pass clean).

**Half 2 — unclassifiable constructs do not propagate through reachable helpers.** `moduleFacts` records non-literal dynamic `import()` and computed `process` access wherever they occur, but final classification consults them only lexically within the test's own extent (`unclassifiableWithin` filters the module-level list to "unparseable" entries). Reviewer probe:

```
module_dynamic    -> environment-free
describe_dynamic  -> environment-free
module_computed   -> environment-free
describe_computed -> environment-free
```

A helper whose body holds a construct the recognizer explicitly refuses to resolve should surface `unclassifiable` to its callers; today it reads as free.

**Scope if promoted:** thread importedName (`propertyName`) through every lookup (the scope arc lands this), add namespace-member and re-export edges with an unfollowable-edge → `unclassifiable` posture, and propagate helper-extent unclassifiable reasons into the caller's verdict. Regression cases: the five-form import table and the four-cell propagation table above, plus the AC-10b collision fixture (must stay quiet).

### BL-PREMISESCAN-NESTED-HELPER-SCOPE — a helper declared inside `describe` hides its environment reach from the recognizer

**Severity:** MEDIUM (the recognizer reports a clean corpus it no longer understands — a false NEGATIVE, which is the direction that does not announce itself) · **Class:** guard fidelity · **Filed:** 2026-08-14 (`feat/diagram-viewing-polish`, found because the count it produced for a suite this arc enrolled was a false `0`) · **Effort:** S-M

**Probed, not theorized.** Two sources differing ONLY in where the helper is declared — same `spawnSync`, same import, same call site:

```
$ # classifyTests(root, "tests/probe.test.ts") on each variant
helper at MODULE scope   -> ["environment-touching"]
helper at DESCRIBE scope -> ["environment-free"]
```

**Mechanism.** `premiseScan` registers declaration extents at MODULE SCOPE ONLY (`tests/mutation/source/premiseScan.ts:146-161`). `isModuleScope` (`:187-200`) walks parents and returns `false` at the first enclosing function — and a `describe("...", () => { ... })` body IS an arrow function. So a helper nested in a `describe` has no registered extent, its `node:child_process` reach is invisible, and every test calling it classifies `environment-free`.

**This is a deliberate trade-off, not an oversight** — and that is the hard part of fixing it. The module-scope restriction exists to prevent OVER-classification (spec AC-10b): a flat name map collided `reportEnvelope`'s parameter `res` with an unrelated `const res` inside `main()`, and every test importing `reportEnvelope` went environment-touching. The comment at `:140-145` records that probe. A naive fix that registers all scopes re-opens exactly that. The repair therefore has to be scope-AWARE resolution (extents keyed by declaring scope, resolved innermost-out), not scope-blind registration.

**Live cost already paid.** `tests/ci/phantomGapExecuted.test.ts` declared its spawning `runCli` inside the `describe` body; all three shipped-CLI cases classified environment-free and `EXPECTED_ENV_TOUCHING` recorded a truthful-looking `0`. Hoisting the helper to module scope moved it to `3`. Nothing failed in between — the corpus simply under-reported, silently, which is the failure mode the premise contract exists to prevent.

**Fix:** scope-aware extent resolution in `premiseScan`, with the AC-10b `reportEnvelope`/`res` collision kept as a regression case so the repair cannot trade a false negative for the false positive it replaced. Until then the recognizer's contract is "module-scope helpers only", which no current caller states.
