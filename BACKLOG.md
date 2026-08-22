# BACKLOG

Speculative / lower-priority hardening items. "Might do" — not blocking, no concrete near-term trigger. (Contrast `DEFERRED.md`: "will do, concrete trigger".)

**This file is the OPEN queue only.** Resolved / shipped / superseded entries live in **[BACKLOG-archive.md](./BACKLOG-archive.md)** with full provenance — grep by id, ids are unchanged. When an item below ships, move its whole entry there rather than annotating it resolved in place; otherwise this queue silently turns into a changelog.

Last reconciled: 2026-08-17 — `fix/shell-binding-mixed-quoted-value` graduated `BL-SHELL-BINDING-MIXED-QUOTED-VALUE`: the psql guard's assignment family reads LEXED WORDS now, and the quoting-position regex family is deleted rather than widened — declaration keywords and whole-argument quoting needed no grammar at all once words existed. The lexer had to become bash-faithful first (four escape fixes shipped as one class), which closed an R40-era documented limit as a by-product. Whole-diff review then found the repair's own class twice, both REGRESSIONS against the retired patterns and both repaired in-branch: compound-array values, and assignments inside a nested substitution body — the second a FALSE CERTIFICATION rather than a miss. Two peers are filed with their class-sweep exception named. Prior: 2026-08-17 — `fix/mutation-child-lifetime` graduated `BL-MUTATION-CHILD-LIFETIME-PARENT-DEATH`: mutation-harness children are now bounded in BOTH directions — by the parent's wall-clock ceiling while it lives, and by a perl supervisor's `getppid()` watchdog once it does not, which SIGKILLs the whole process group within one 0.5 s poll of the harness dying. The entry's own first scheduled step was answered NO and that is the load-bearing correction: the watchdog does NOT make `setpgrp` unnecessary, because the group serves the parent-ALIVE hazard and is also how the watchdog delivers its own kill, so the repair composes rather than simplifies. `childRun`'s sibling gap went with it — its `status ?? 1` catch turned a signal-killed fixture into exactly `1`, which the premise contract reads as PROVEN, and abnormal outcomes now throw. The new module is enrolled at 12/12 with an empty ledger and `scoreFloor: 1`, while the watchdog string itself is honestly CANNOT-EXPRESS (no declared operator rewrites string content) and is guarded by a live process-tree suite kept OUT of `suitePaths` so the per-mutant gate cost stays flat. Prior: 2026-08-16 — `test/execution-methods-driver-derived` graduated `BL-EXECUTION-METHODS-DERIVED-FROM-DRIVER-TYPES`: the query-submitting core of the destructive-file analyzer's `EXECUTION_METHODS` is now DERIVED from the installed postgres.js driver's own type declarations through a committed generated module, with freshness armed both locally (a `pretest-gen` MANIFEST row) and in CI (an x-audits step that fails on a stale COMMIT). The composed set did not move — the same ten members ship — because the deliverable is drift visibility, not a different answer. The entry's own equality claim turned out to be FALSE under probe and the correction is the load-bearing part: the rule yields FOUR members, not ten, so what ships is the IMPLICATION (every method typed as returning `PendingQuery`/`PendingRequest`/`ListenRequest` is an execution site) and the other six are hand-justified with per-member citations rather than contorted into derivation theater. The surface was enrolled in the source-mutation gate BEFORE the first diff-review round and scores 11/11 with an empty ledger — its one enrolment-run survivor was repaid with a fixture, not blessed — which matters because this row exists precisely to record what that gate cannot see: the surface sat at 1.00 with zero unaccepted survivors while `.file()` was missing from the set, since a missing member of a `Set` literal is not a mutation of code that exists. Prior: 2026-08-16 — `test/psql-scan-mutation-enrolment` graduated `BL-PSQL-SCAN-MUTATION-ENROLMENT`: the psql startup-file scanner is enrolled in the source-mutation registry at `scoreFloor` 1.00 with an empty unaccepted-survivor set — 48 mutants, 30 killed, 18 equivalent, 0 accepted-gap. The row's own four starters were corrected by measurement rather than argument, in both directions: the `token.length > 1` starter is a coverage gap but NOT a source defect (the original already reads a bare `-` as the DBNAME positional), and the `{1,2}` flag-regex starter turned out to be three sites with two answers — two killed, and one equivalent because its follower character class already contains a dash. `scan.ts` itself is untouched by the arc, which is the outcome the spec's original-misbehaves bar was written to produce. Both cross-model review rounds refuted a written argument with a probe it had never been checked against, and each refutation became a test rather than a re-argued row — which is why the surface ships with no accepted gap at all. `BL-SHELL-BINDING-MIXED-QUOTED-VALUE` and `BL-PREMISE-SCAN-DESCRIBE-LOCAL-EXTENTS` are filed in the same PR. Enrolment also caught the guard catching its own paperwork — quoting concrete shell spellings in `registry.ts` made that tracked file a reported psql binding. Prior: 2026-08-15 — `feat/mutation-playwright-component-mode` graduated `BL-MUTATION-HARNESS-PLAYWRIGHT-COMPONENT-MODE` and `BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT`, closing a circular wait: the enrolment row sat at WATCH on a trigger — "the harness gains a Playwright/component-mutant mode" — that no ledger row scheduled until the sibling was filed, and both closed in the arc that built the mode. The harness gained a browser-mutant mode (explicit per-surface edit lists, a serial runner with baseline and control brackets, three overlay layers driven by ONE env var, and a nightly non-required CI job), and its first customer enrolled at 19/19 killed, score 1.0, empty unaccepted-survivor set, control killed, targets byte-identical — 19.1 min in CI against a 60-min cap. The operator family is CLOSED and hand-enumerated rather than a generic recognizer, ratified up front because each widening of a recognizer is a bigger target for the next review round. Verdict integrity is the part neither row anticipated: a non-zero child exit is not evidence by itself, so every child runs against an overlay sentinel deleted before it and re-checked after, a Playwright child additionally needs a fresh json report recording at least one executed test, and anything else raises `MutantRunInfraError` and is never scored — the failure this closes is the worst one available to a mutation harness, where a systematically dead overlay reports a PERFECT score with every other gate condition still passing. Six defects surfaced that neither row described, each of which would have shipped a wrong NUMBER rather than a loud failure: `String.replace` expanding `$&`/`$1` in a string replacement so a mutant applies as text nobody wrote; macOS resolving `/var` through a symlink so the overlay served clean disk text while every other signal read live; the new gate silently joining the parser harness's whole-project sweep, a job that installs no browser; the mixed-kind suite list being load-bearing, since one payload mutant is killed by the vitest suite alone and a Playwright-only registry would have enrolled it as a guaranteed survivor; green-but-empty as the no-tests trap, closed by asserting a non-zero executed count at baseline; and a latent ambient-config bug in the vitest partition guard that this arc's own command exposed, swept to four sites and pinned by a source scan because every other case there reads a stubbed config and would pass a revert whenever the ambient is clean. The mode's own two pure modules are enrolled as source-mutation surfaces before the arc's first review dispatch; what the registry cannot express — the spawn boundary needing a real Playwright child — is stated rather than enrolled symbolically. Prior: 2026-08-15 — `feat/spec-lint-intent-red` graduated `BL-SPEC-LINT-CITATION-INTENT` and `BL-SPECLINT-RED-EXECUTABILITY-ARM`: `spec:lint` now says whether a citation resolves to the RIGHT file, and the task-marker contract's red-then-green cycle is declared and checkable. Both rows' own sketches were corrected by measurement rather than argument. The citation row asked for a per-case demotion; the corpus said the whole arm must be advisory, because the strictest content condition still fires on 15 of 135 CORRECT citations of a merged plan, and a hard code with an 11% false-positive floor gets waived reflexively. Detection was never the gap either — the shipped advisory already fired on most of the wrong citations and on 69 spans of the correct plan, so what shipped is discrimination (an enclosing-declaration rescue) and actionability (relocation hints naming which other file the doc itself cites does hold the identifiers). The red row's exempt branch for author-written reds became a DECLARED `red-state=authored` + `red-target=`, because no recognizer over task prose can decide whether a `red=` is asserted-red-now or authored-by-the-task. Validated against the citations that actually burned rounds: the fixture corpus is distilled from the KNOWN-BAD sync-log plan, not the corrected one, because the human repair of that defect made the mirror-image error on eight citations. Two wrong citations are a documented recall ceiling — a vocabulary-sharing sibling is indistinguishable by content — and are pinned as premise-guarded silent cases. The mutation gate found 26 unaccepted survivors on first run; fourteen were repaid by tests, one by a source simplification, and the rest are argued reachability rows. Prior: 2026-08-15 — `fix/changes-feed-batch-flake` graduated `BL-CHANGES-FEED-MODAL-BATCH-FLAKE`: the entry's own first-thing-to-check was checked and REFUTED. There is no cross-spec fixture collision — both CI failures hit the first spec executed, before any other spec had touched the database — and the real cause, measured from the failing runs' job logs, is a transient gateway 502 on the foreground snapshot RPC that the loader deliberately throws to the `/admin` error boundary, where a wait for the modal alone starves. The row's "passes standalone, fails in batch" evidence was a sampling artifact: standalone ran only locally, where that fault environment does not exist, so the flake correlated with "batch" by measurement design. Two defects the row did not describe were found on the way: the fatal log path rendered its PostgREST error as `'[object Object]'`, which is why the 502 had to be attributed through a same-class witness 62 seconds later, and a recovery on a GREEN run would have left no trace an operator could see — the list reporter prints no annotations and a green run uploads no artifact — so the executed-count oracle now prints every `infra-recovery` row plus a total. Filed `BL-MODAL-WAIT-BOUNDARY-HELPER-ADOPTION` and `BL-SNAPSHOT-READ-TRANSIENT-502-POSTURE`. Prior: 2026-08-15 — `fix/sync-observability-gaps` graduated `BL-MANUAL-SYNC-UNEMITTED` and `BL-PENDING-RETRY-EXISTING-SHOW-THROWS`: manual sync now records every terminal outcome, and the existing-show pending-ingestion retry executes real sync work instead of throwing `SyncInfraError` before touching anything. Both rows' own prescriptions were partly rejected with reasons recorded in the archive — a per-branch emit is the shape that failed (the single site switches exhaustively, so a new outcome variant is a compile error until the mapping says what it records), and per-route tail injection is the hand-enumerated cover that came up short five times in the parent arc (one default at the shared `applyStaged` chokepoint covers both live routes and every future caller). Three things the rows did not describe were found by sweeping rather than reading: `toResult` fell through to an implicit `null` that turned an unhandled phase-1 variant into a clean pass, four terminal branches of the SHARED pipeline wrote no row at all (three fetch-failure arms plus the pull-sheet-override TOCTOU skip, all of which benefit cron identically), and adding the production sink default made every existing applied-path unit test open a real postgres connection — probed, 14 rows written to the shared local DB, deleted, zero after the injections landed. Emit placement is load-bearing twice: post-commit, because attribution resolves in the sink's subselect and an in-tx emit is permanently NULL-attributed at show birth; and keyed on a TRACKED sink, because a throw after an outcome row already landed must add nothing rather than file a `parse_error` over it. The two live probes are why this shipped correct — the retry defect survived because the shipped tests inject `processOneFile_unlocked` itself, and the env-bound probe was verified to discriminate by re-injecting the defect. Prior: 2026-08-11 — `fix/tap-target-inline-controls` graduated `BL-TAP-TARGET-INLINE-TEXT-CONTROLS`: the per-site prose-vs-chrome judgment the row was filed to obtain, ratified by the user 2026-08-10 as **3 exempt / 5 repaired**. The exempt three are pinned in SOURCE rather than in a browser — an exempt site's contract is "unchanged source", and a rendered box cannot say whether the exemption is still the ratified decision or an accident nobody recorded; the guard pins the comment AND the class string and was proven against four mutants. The repaired five are pinned by real-browser rects on the PRODUCTION routes (red observed first at 16.80 / 19.36 / 17.05 / 16.80px), wired into `lifecycle-layout-e2e.yml` behind an execution oracle that job did not previously have. Two of the row's own site labels were wrong and were corrected from the live tree. Two measurement lessons are recorded in the archive entry because each produced a wrong answer first: `boundingBox()` is viewport-relative and Playwright scrolls between reads, which manufactured a phantom 5.4px overlap, and the container change made to "fix" that phantom was reverted once a mutant showed the suite stayed green without it. The invariant-8 gate's one P1 was refuted by measurement against a stale contrast comment in `app/globals.css`; four follow-ups filed. Prior: 2026-08-04 — `feat/harness-font-fidelity` (PR #705) graduated `BL-HARNESS-FONT-FIDELITY`: the face is declared once in `app/fonts.css` over the committed binary and read by BOTH Next roots AND by `compileEntryCss`, so the 32 standalone harnesses render what the product renders instead of the ambient host font. The entry's own count of 31 was right when filed and is 32 as shipped — the browser guard this work added is itself a caller, found by the fail-by-default wiring meta-test rather than by anyone remembering. The spec it asked for was written and its central premise EXPIRED before implementation: drafted against `next/font/google` with seven Google v20 subsets, while `main` had already moved to `next/font/local` over an upstream v4.1 subset, so shipping §3.3 verbatim would have stripped `ss04`/`zero`/`opsz` and reverted `BL-INTER-NUMERAL-DISAMBIGUATION`. User-ratified 2026-08-04 to one face over the existing bytes, with the stale sections marked SUPERSEDED in place because `consistency.mjs` cross-checks the document's own counts. Four claims were overturned by measurement rather than argument and each is corrected where it was wrong: the mutation matrix found the guard never compared the fallback's override VALUES; CI found a Linux/macOS rasterization gap (hinted 132px vs geometric 130.09375px) root-caused in the pinned container rather than papered over with a wider tolerance; the impeccable critique found a rationale written into five surfaces that this branch's own post-step had invalidated; and the audit found the binary had lost its one-year immutable cache on the move out of `.next/static/media/`, now restored by a content-hashed filename plus a `next.config.ts` header. Prior: 2026-08-04 — `fix/apply-undo-audit-fidelity` (PR #697, merge `644f8bb06`) graduated `BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP`, `BL-IDENTITYLINK-LANDED-VS-REQUESTED` and `BL-UNDO-SELECTIONS-RESET-AT-DROP`. The notice and feed now derive from rename pairs that actually LANDED, with unlanded ones recorded as a durable `IDENTITY_LINK_RENAME_UNLANDED` event — and that row's own premise was partly wrong: the feed never consumed the requested `identityLinkRenames` at all, it re-derived its own pairs from `triggeredItems` with NO accept gate, a wider defect than the row described. The notice needed a two-arm split rather than a swap, because feeding landed pairs to arm (c) as well would have fired a FALSE capability-loss notice for every pair whose source row survived; arm (c) now suppresses a loss only when the source SURVIVED, which also surfaces a real loss the old suppression hid. The roleFlagsNotice row named ONE discard site and the class sweep found FOUR (finalize-cas, ordinary finalize, `runManualStageForFirstSeen`, and the pending-ingestion retry, which bypasses the locked wrapper's post-commit tail entirely), all repaired through one shared `lib/sync/emitRoleFlagsNotice.ts` and flushed in a `finally` after the outer transaction at three sites — including the STREAMING finalize-cas handler, the one real operator traffic reaches; the structural guard against a fifth is DESCOPED and refiled as `BL-ROLEFLAGSNOTICE-DROP-GUARD`. `selections_reset_at` survives an undo, the real fix being to capture the successor's marker BEFORE the delete — the common rename path takes the clean-INSERT branch, so a merge living only in `ON CONFLICT` would never have run — with `mi11_approve_hold` repaired as a second producer dropping the column at two sites, and two historical shapes left unrescuable as documented limits. The same branch filed `BL-CAPABILITY-LOSS-SURVIVING-ROW-FALSE-POSITIVE`, `BL-SHADOW-REBUILD-EXHAUSTED-EMIT-PLACEMENT` and `BL-CODE-ENUM-PROVENANCE-COMMENT-BLIND`. Prior: 2026-08-03 — `feat/inter-numeral-disambiguation` graduated `BL-INTER-NUMERAL-DISAMBIGUATION` by changing the FONT rather than the CSS: the row's premise was false. Probed live before drafting — the Inter build Google Fonts serves has the character variants stripped (`calt ccmp dnom frac kern locl mark mkmk numr pnum tnum`, `wght` axis only), so the requested `"zero" 1, "cv05" 1` would have rendered nothing, exactly as the `"cv11" 1` beside it had been rendering nothing since `78662acb5` (2026-05-03). Two defects in the row itself besides: `cv05` never touches capital `I`, and `ss04` is Inter's own disambiguation set covering both letterforms. Shipped a latin + latin-ext SUBSET of the upstream v4.1 release (173 KB, built by `scripts/subset-inter.sh` from a checksum-pinned input, OFL alongside) via `next/font/local` — verbatim at 344 KB was the gate decision until the impeccable audit measured it costing FCP +136-164ms and a fallback-to-Inter swap landing 3.7s in on slow 4G. `ss04` at `html`, `ss04`/`tnum` on the tabular rule, and `zero` on a NARROWER `.code-value` class, because `.tabular-nums` turned out to sit on whole prose sentences including the Right Now hero's 30px bold h2. `ss04` is REPEATED on each rule because `font-feature-settings` inherits as a whole value, not a merged list. Fourteen false claims corrected across `DESIGN.md`, the font-binding spec and plan, and eight source comments, including that plan's own P3 disposition claiming the binding "deterministically activates Inter's alternates … for the first time" (it activated nothing). New guard `tests/styles/fontFeatureAvailability.test.ts` derives the font path from `app/fonts.ts` and fails the build on any tag the loaded binary cannot honor, with a regression proof against the committed Google binary; in the browser `zero` needs a PIXEL oracle because `zero` and `zero.slash` share an xAdvance of 1292, so no width assertion can ever see it. Cross-model spec review round 1 returned BLOCKING with 7 findings, five confirmed by probe and all repaired. Prior: 2026-08-03 — `feat/needs-attention-holds-rollup` graduated `BL-NEEDS-ATTENTION-HOLDS-ROLLUP` (the cross-show open-holds read plus the fourth needs-attention stream across page, inbox, badge, mobile chip, and digest; spec `docs/superpowers/specs/2026-08-03-needs-attention-holds-rollup-design.md`, plan `docs/superpowers/plans/2026-08-03-needs-attention-holds-rollup.md`). Prior: 2026-08-03 — `feat/sync-feed-undo-announce` graduated `BL-SYNC-FEED-UI-POLISH` and all three children. `BL-SYNCFEED-UI-1` shipped, with its own premise corrected: the note's proposed in-button `aria-live` region cannot work, because a successful undo flips the row out of `status='applied'` and unmounts the button before assistive technology reads anything. Six adversarial rounds then refuted every surface-level owner in turn (the group empties, the strip returns null, the dashboard returns a different tree, the feed is swapped for its error rendering), and the vector was settled by an executable spike rather than a seventh prose argument. The channel lives in `AdminAnnounceProvider`, mounted by the admin layout AND by `ReviewModalShell` — a modal needs its own, since content outside an `aria-modal` dialog is excluded from the accessibility tree. `BL-SYNCFEED-UI-3` graduated as already-shipped (fixture corrected at `c3920fe6a`); `BL-SYNCFEED-UI-2` ratified as untriggered with its re-open trigger preserved. The same work fixed a class defect the sweep found: all three feed action buttons rendered their failure card by conditional mount, so failures were silent to AT too. Filed `BL-FEED-BUTTON-SUCCESS-ANNOUNCE`, `BL-BULK-UNDO-ANNOUNCE-UNMOUNT`, and `BL-ANNOUNCE-REGION-UNMOUNT-CLASS`. Prior: 2026-08-03 — `feat/modal-freshness-cue` graduated `BL-MODAL-REALTIME-UPDATED-CUE` as SHIPPED: the published review modal now flashes the panel card of every registry section whose CONTENT changed across a realtime-driven reconcile, plus an sr-only announcement from the same detector, so a swap under the reader is attributable instead of silent. The entry's premise was wrong and is corrected in the archive: the 2026-07-19 realtime spec ratified that the BRIDGE renders `null`, never that the surface it refreshes must stay silent, so this was a new design decision rather than a reversal. The user chose flash-then-fade directly. Two adversarial rounds (the second split in half) returned BLOCKING and were repaired: the projection missed routed warnings, routed use-raw state, section anchors and attention items, and separately OVER-hashed the warnings panel and non-rendered decision fields; the mount baseline lived in a ref that abandoned renders consumed; and an aborted close hides the shell without unmounting the state owner. Prior: 2026-08-03 — `chore/scanner-precision-cluster` graduated `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN` and `BL-LEDGER-GUARD-BODY-DEFINED-IDS`, the two entries whose shared shape is a static scanner opening too small a set of files while a hand-maintained residue covers the gap. Both residues had already rotted: the enum's four-code list held one code that was long since absorbed while ELEVEN real §12.4 codes were dark, and the ledger guard's eight `KNOWN_DANGLING` rows were never debt at all. The scan is now type-aware and fail-closed (58 codes, 0 unresolved, 44 capture-linked skips) after six adversarial rounds established that every syntactic mechanism — root widening, type-stripping, written-return-type matching — is defeated by a spelling; the ledger guard now resolves body-defined sub-item ids under three corpus-measured conditions. One documented limit is fenced rather than overclaimed and filed as `BL-CATALOG-PARTITION-WARNING-CLASS`: provenance through `any` is undecidable, so the real closure is an enumerated catalog, not a better scanner. Prior: 2026-08-03 — `feat/font-binding-modal-freshness-cue` graduated `BL-HEADER-FONT-FALLBACK-WRAP`: the browser check it asked for refuted its own stated doubt (Next 16 registers the literal family name, so the crew import DID bind) and surfaced a wider finding — the product rendered two type families across its trees while `DESIGN.md` §2.1 commits to one, because the loader had never been wired at the root. Shipped as one shared loader instance in `app/fonts.ts` imported by BOTH Next roots (the crash screen replaces the root layout, so it was otherwise left behind), with `--font-sans` binding next/font's metric-matched fallback face so the swap window stops reflowing ~10%. Filed `BL-HARNESS-FONT-FIDELITY` (the 31 standalone harnesses have no Next runtime and keep measuring the ambient host font — zero cost today, needs a spec not a patch) and `BL-INTER-NUMERAL-DISAMBIGUATION` (impeccable P3). Prior: 2026-08-03 — `chore/orphan-components-lead-prose` settled the two entries the copy/dead-code sweep left behind. `BL-LEAD-CAPABILITY-PROSE-STALE` graduated: both prose claims turned out STALE rather than intentional — the `capabilityTransitions` line is a verbatim quote that stopped being verbatim at `e348c81ca`, and MI-9's "admin/ops" clause was inherited from §12.4 copy strings whose every other instance had already been retired or corrected. A third instance the literal sweep could not see (`lib/sync/phase2.ts`, a semantic variant in production source) was corrected with them, and two guards shipped in the same commits: `capabilityHeaderParity` extracts the expected flag set from `scopeTiles.ts` source, and `capabilityClaimProse` scans the MI-9 rows AND every `.ts`/`.tsx` under `app`/`components`/`lib` with a positive-claim recognizer. `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS` was AMENDED, not archived: four components retired (each with a named superseding commit and live successor; `RightNowCard`'s two regression suites were retargeted onto `RightNowHero` and each proven by mutation before the deletion), and `WrappedTile` stays as a DECIDED retention — deleting it would orphan `TileErrorBoundary` and `TileServerFallback` rather than shrink the ledger, and the orphan guard now asserts its reason says so. Filed `BL-CAPABILITY-MATRIX-FINANCIALS-PREDICATE` (the matrix models five predicates, the code has six) and `BL-BELLPANEL-DISMISS-COMMENT-DRIFT` (six comments name a label the panel stopped rendering). New guard `tests/docs/retiredIdentifierReferences.test.ts` walks every tracked file for references to what was retired, keyed by LINE CONTENT with reasoned exemptions — three adversarial rounds each found references a hand-curated census had missed, so the census is now a walk. Prior: 2026-08-03 — `docs/close-v1-override-wont-build` graduated `BL-VERSION-AMBIGUOUS-V1-OVERRIDE` as RESOLVED — WON'T BUILD: no admin force-classify override gets built, now or trigger-gated. The row's premise was false as stated. `v1` is a fallback bucket, not a confirmed legacy template (`lib/parser/schema.ts:37`; the registry entry at `lib/parser/schema.ts:53` carries no `requires` array, so nothing positively identifies a v1 sheet), and its "a genuine legacy-v1 sheet has neither resolution" conflated _no markers registered today_ with _no registrable structure_ — a real legacy sheet, once actually seen, is indistinguishable from a genuinely-new template, and the gate spec's §7.1 resolution #2 (developer registers the markers) is not limited to new templates. Probed: all 10 committed fixtures classify confidently (6× v2 at 7/0, 4× v4 at 8/0), zero ambiguous, zero v1. The override would convert a signaled failure into a silent one, inverting the preparedness-audit posture, and it serves none of the four indistinguishable bucket occupants better than their existing disposition. Re-open trigger recorded in the archive entry, conjunctive: a real legacy sheet surfaces AND marker registration proves impossible. **Current state after this and the same-day `docs/graduate-bl-unpublish-to-held` graduation: six of the eight rows the 2026-08-02 segment below enumerates remain open** (`BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`, `BL-HEADER-REACT-RECONCILE-HARNESS`, `BL-PG-CRON-HOST-ASSERTION`, `BL-NEEDS-ATTENTION-HOLDS-ROLLUP`, `BL-RESYNC-STAGED-REVIEW-UI`, `BL-STEP3-FULL-CREW-PREVIEW`); that segment's own "Eight open rows here" count is left as written, because it describes the state at the 2026-08-02 reconciliation and demoting it behind `Prior:` is what marks it as history. Prior: 2026-08-03 — `docs/graduate-bl-unpublish-to-held` graduated `BL-UNPUBLISH-TO-HELD` as already-shipped: the 2026-07-01 published toggle (`unpublish_show` RPC in `supabase/migrations/20260701000000_published_toggle_unpublish_show.sql`, driven by `setShowPublishedAction(slug, false)` from the admin show review modal, commit 945bd4ef0) is exactly the published→Held inverse the row asked for — the row's 2026-08-02 "Verified: no such RPC exists" was a false verification, and its premise that the M12.13 token-unpublish archives was stale too (both unpublish paths are pure `published=false`). A 10-point audit of the shipped surface before graduating found no functional gap and one gate-scope finding, filed as `BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED` (the validation-schema-parity gate covers tables×columns only, never functions — no current drift, probed live). Prior: 2026-08-02 — `chore/copy-deadcode-sweep` graduated three copy-and-dead-code entries (`BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT`: the §12.4 helpfulContext no longer claims either capability role unlocks admin access — probed, `is_admin()` never reads `role_flags` — landed as a five-surface lockstep in one commit plus the row's `longExplanation` and the `scopeTiles` header comment it contradicted; `BL-ADMIN-PARSEPANEL-ORPHANED`: the component deleted behind a new zero-production-importer guard that asks the compiler for both module edges and their targets, with the five peers the class sweep found filed as `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS`; `BL-HELP-STRIP-COPYLINK-STALE`: the per-show help prose now names the Share link button, no screenshot regenerated). Also filed `BL-LEAD-CAPABILITY-PROSE-STALE` for the two remaining prose claims that need a contract read. Prior: 2026-08-02 — `docs/dangling-citation-ledger-filing` took the referential-integrity guard's `KNOWN_DANGLING` debt map from 50 rows to 9, filing 39 real entries and correcting one citation (`BL-FLOW4` came off as a side effect: with its family now defined, the stem suppresses as a family reference). Eight open rows here (`BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`, `BL-HEADER-REACT-RECONCILE-HARNESS`, `BL-PG-CRON-HOST-ASSERTION`, `BL-NEEDS-ATTENTION-HOLDS-ROLLUP`, `BL-RESYNC-STAGED-REVIEW-UI`, `BL-STEP3-FULL-CREW-PREVIEW`, `BL-UNPUBLISH-TO-HELD`, `BL-VERSION-AMBIGUOUS-V1-OVERRIDE`) plus `BL-LEDGER-GUARD-BODY-DEFINED-IDS` as the handoff for the eight ids defined in a parent entry's BODY, which stay body-defined by decision. Thirty-one went straight to `BACKLOG-archive.md` at their terminal state: eleven already shipped (the row was deleted at close instead of graduated, twice on a spec's explicit instruction), fifteen were impeccable-gate deferrals whose promised row was never opened and whose deferral has since closed, and five name a branch that was never taken. One citation was corrected instead of filed: `BL-SYNC-FEED-UI-POLISH` pointed at a backlog-id family that exists nowhere in the repo. The 9 rows left are the eight body-defined ids above plus `BL-RESOLVED`, a prose placeholder in an audit doc, both handed to follow-ups. Prior: 2026-08-02 — `test/agenda-fold-seeded-e2e` graduated `BL-AGENDA-FOLD-NO-SEEDED-E2E` (the per-viewer agenda day fold exercised through the REAL crew page: seeded `agenda_links` + two complementary date-restricted viewers, each an email-matched Google session against its own seeded show, plus an unrestricted admin control in `stage-restricted-crew-schedule.spec.ts`, wired into `crew-e2e.yml` under desktop-chromium behind a run-command wiring guard) and `BL-AGENDA-A11Y-WEBKIT-COVERAGE` (grep-scoped `standalone-webkit-a11y` project resolving exactly one test, structurally pinned, plus webkit installs and a regenerated baseline). Prior: 2026-08-02 — docs/citation-rot-financials-vocab graduated BL-DANGLING-CITATIONS-RETIRED-WORKFLOW (15 dangling citations to the seven retired e2e workflows rendered as prose across 10 docs, class-swept per the AGENTS.md bug-shape rule; spec:lint target-class findings now zero tree-wide) and BL-MASTERSPEC-FINANCIALS-VOCAB (14 master-spec financials-entitlement claims reconciled to LEAD ∪ FINANCIALS ∪ admin, line-count-neutral; 4 seed exclusions + 8 window-probe non-claims ratified in docs/superpowers/specs/2026-08-02-docs-hygiene-citation-rot-financials-vocab-design.md; specs README line-count note corrected), and filed BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT (§12.4 copy over-grant, deferred to the next §12.4 copy pass). Earlier reconciliations (deduplicated 2026-08-02 — this line had accumulated 40 segments, 26 of them verbatim repeats of merge-concatenated chains): **[BACKLOG-archive.md § Reconciliation log](./BACKLOG-archive.md#reconciliation-log)**.

---

## BL-ACCEPTSET-CONSUMER-COVERAGE — an accept-set widened without its consumers is a change that reads as adoption and behaves as nothing

**Status:** OPEN · **Severity:** MEDIUM (silent FREE: a widened set that no consumer ranges over leaves the construct unclassified while the diff shows the widening) · **Class:** guard fidelity · **Effort:** S · **Filed:** 2026-08-21 (`fix/premisescan-registrar-accept-sets`, spec rounds 1-3) · **Facing:** process · **Mint-exception:** invariant · **Reachability:** PROBED — three separate consumers measured below.

A hand-maintained accept-set is only adopted where EVERY consumer of it agrees. `premiseScan` carries
three, and each has consumers that enumerate their own members rather than ranging over the set, so
widening the set changes the diff and not the behaviour.

**Incident — three findings, three consecutive spec rounds of one arc, all the same shape:**

- `REGISTRARS` widened to include `suite`; the walk then dispatches on the root BY NAME
  (`if (root_ === "describe")`, `if (root_ === "it" || root_ === "test")`), so `suite` is recognized
  and dropped. Measured: `suite("x", …)` loses hook attribution where `describe("x", …)` keeps it.
- THREE SITES share one bare-identifier-callee shape — the file-scope seed, `hookBodies`,
  `loadTimePremises`; `HOOK_REGISTRARS` itself has two consumers and the third ranges over a
  different matcher (corrected at plan time) —
  each requiring a bare identifier callee. Measured: a bare `beforeEach(spawn)` makes a test
  `environment-touching`; `test.beforeEach(spawn)` leaves the same test `environment-free`.
- `eachProducers` reads the immediate curried call only. Measured:
  `describe.skipIf(process.env.CI).each([1])(…)` collects `[1]` where the chain carries
  `[1] | process.env.CI`.

**Shape of the repair.** A structural test that, for each accept-set, enumerates its CONSUMERS and
asserts each ranges over the set rather than over its own copy of some members. The consumer list is
derived by walking the module for reads of the set's identifier, so a consumer added later is covered
by default rather than being a fourth instance of this row.

**First scheduled step:** enumerate the consumers of `REGISTRARS`, `MODIFIERS` and `HOOK_REGISTRARS`
in `tests/mutation/source/premiseScan.ts` and confirm the derived count matches the three, three and
one this arc found by hand — if a hand count and a derived count disagree, the derivation is the one
to trust and the disagreement is the row's first finding.

## BL-SENDAUTH-BINDING-IDENTITY-NAME-KEYED — the binding set is a Set of NAMES, so every consumer asks "is something called X in scope" rather than "is this identifier that binding"

**Status:** OPEN · **Filed:** 2026-08-21 (`fix/sendauth-arm-classifier-unification`, promised as a peer by that arc's spec §4.2 and filed on its diff-r1 reviewer noticing the promise had not been kept) · **Severity:** LOW-MEDIUM (a false advisory, which is the survivable direction; the silent direction is closed) · **Class:** detector fidelity · **Effort:** M · **Facing:** process · **Class-sweep exception:** (c) — resolving an identifier to its DECLARATION is a redesign of the binding-discovery layer the unification arc does not otherwise touch, and it needs the `ts.TypeChecker` that predecessor limits 5 and 8(b) both decline. · **Reachability:** PROBED — the false advisory below was measured in that arc's spec §3.6 against source blob `412cadd3`. · **Incident:** the measured false advisory at §3.6 — a name shadowing a surface binding was classified as the surface, because the consumer asks only whether SOME binding carries that name. That is a cost event that already happened, not a constructed hypothetical.

**The residue, stated precisely.** `surfaceBindings` returns a `Set<string>`. Rule A resolves a
receiver to its rightmost NAME and every consumer then asks `bindings.has(name)`. So a local that
merely SHARES a surface binding's name is treated as the surface wherever it appears in the module.

**Why this is the survivable direction, and why it is still worth a row.** The failure is a FALSE
ADVISORY — a report against code that is not the surface — which the consequence bound permits as a
documented over-report. So this is filed rather than fenced: it is real, it is reachable, and it is
not urgent.

**THAT CLAIM WAS PREMATURE WHEN THIS ROW WAS FIRST FILED, and the correction is kept rather than
overwritten.** As filed at diff r1 the row said the silent direction was already closed. It was not:
diff r3 found TWO name-keyed shapes that were SILENT, not merely over-reporting — a competing
declaration outside the pass, and a quoted declaration name — because the raw-binding count was
short on SCOPE and on SPELLING. Both are closed now, by making the count total on both axes rather
than by naming the two shapes. The row's characterisation is accurate at the time of writing and was
not accurate when it was written, which is the distinction a reader needs.

**What a repair needs.** Identifier-to-declaration resolution, which means either a
`ts.TypeChecker` or a scope model. Both are the machinery the predecessor limits decline, so this is
a design decision rather than a patch — which is what exception (c) records.

**Do not "fix" this by narrowing the name match.** A tighter string rule trades a permitted false
advisory for a silent miss, which is the direction the bound forbids. The only correct repair
resolves identity; anything else moves the error to the wrong side.

## BL-MUTATION-VERDICT-MECHANISM-INTRA-LEG — the verdict-movement mechanism is still unexplained, and the probe that could settle it must vary the process boundary

**Status:** OPEN · **Filed:** 2026-08-21 (`fix/mutation-score-nondeterminism`, the unmet close condition of the archived `BL-MUTATION-SCORE-NONDETERMINISM`) · **Severity:** MEDIUM (a score that is not reproducible from its declared inputs makes every "0 unaccepted survivors" claim a measurement of something the convergence criterion does not name) · **Class:** mutation harness fidelity · **Effort:** L · **Facing:** process · **Class-sweep exception:** (c) — settling it needs a probe harness that varies process boundary and ordering across trials, which is a NEW INSTRUMENT rather than a repair to any surface the closing PR touched. · **Reachability:** PROBED — four observations of one site disagreeing with itself on byte-identical inputs, recorded on the archived row. · **Incident:** PR #856's `source-shards (0)` leg was triaged as an inherited main-red and is not one (run `32375262145` job `96445004668`, against main's same-day nightly `32344648722` job `96350700409`, where the same surface is green); and separately, a CORRECT ledger row was removed on a single stale-row report and had to be restored after three further observations.

**This row exists because the row it succeeds was archived on a RE-SCOPED close condition.** `BL-MUTATION-SCORE-NONDETERMINISM` said what would close it is an EXPLANATION; the arc that closed it shipped ATTRIBUTION and explicitly did not achieve one. Rather than let the graduation absorb the unmet half silently, the original condition is carried here.

**THE ELIMINATED SET, SIX DEEP. Do not re-run these.**

| candidate                                                       | how it was eliminated                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **co-tenancy** (an LPT re-pack changing a surface's neighbours) | pre-registered experiment at ~30x the perturbation the original observation carried: ZERO flips across 38 pre-existing surfaces, and the decisive datum is one mover — `ledgerGit` itself changed shards 0 to 1 and STAYED GREEN. Background flip rate measured at zero across five consecutive nightlies, and shard placements reconciled against observed annotations BEFORE interpretation, so the null is over the right population. |
| **timeouts at the locus**                                       | ZERO of 93 kills, on the surface, site and bytes where the anomaly was observed, in three separate runs.                                                                                                                                                                                                                                                                                                                                 |
| **headroom correlation**                                        | positive but stuck at n = 2 known-flaky surfaces; suggestive, never confirmatory, and flakiness is observed rather than sampled.                                                                                                                                                                                                                                                                                                         |
| **duration drives instability — advance prediction**            | the #2 and #3 headroom surfaces show ZERO recorded movement across 19 failing runs. Written down with both branches before any history was read, and it did NOT confirm.                                                                                                                                                                                                                                                                 |
| **duration drives instability — direct**                        | across three controlled local runs on byte-identical inputs the mutant-duration maximum swung 19.8 s to 39.1 s **while the survivor set reproduced EXACTLY**. The axis that varies is not the axis under investigation.                                                                                                                                                                                                                  |
| **the bimodal tail as a structural lead**                       | run 2's 38.0/39.1 outlier pair did NOT reproduce; run 3's tail is a flat cluster with no outlier at all.                                                                                                                                                                                                                                                                                                                                 |

**READ THE NEGATIVES AT THEIR REAL STRENGTH, not as proof of absence.** The advance prediction's channel is CI-ONLY and FAILURE-ONLY — it cannot see `psqlStartupScan`, the surface with the CLEANEST reproduction in the corpus, because those flips happened in local gate runs and an annotation fires only on a gate FAILURE. So that row is "no recorded gate-failing movement", never "no movement". A ledger row that overstates its own negatives sends the next investigator past the branch that is still open. The durable per-run record the closing arc shipped exists precisely to remove that blind spot for the next attempt.

**AND ONE LOAD OBSERVATION, sized honestly at ONE.** The closing arc's two baselines differed in measured machine load — 100% co-tenanted over 61 samples against a >=49% floor — with every verdict identical, on the least-headroom surface where the load mechanism predicts its largest effect. That is ONE paired observation against the load mechanism, not six: the other runs held load FIXED and unmeasured, so they are evidence for verdict STABILITY and cannot be added to this column. A test requires the independent variable to move.

**The one branch genuinely still open, with the reason it is hard.** Probe 3 ran the known-flaky site six times SERIALLY IN ONE PROCESS and got 6/6 identical. Under independent trials that excludes only a flip rate around 40% per run or more. But `p^6 + (1-p)^6` presumes INDEPENDENCE, and serial runs in one process share cache, ordering, environment and load state — **correlated within-process state is exactly what an intra-leg mechanism WOULD BE**, so a perfectly correlated 50% mechanism yields six identical results with probability 1. **More trials in the same process carry no further information at any sample size.**

**First scheduled step, and it is an INSTRUMENT rather than another run:** a probe that varies the PROCESS BOUNDARY and the ORDERING across trials rather than repeating within one — separate processes, shuffled site order, a deliberate load control — with the per-run record the closing arc shipped as its read-out. `pnpm mutation:determinism --surface <id> --site <siteId> --runs <n>` is the in-process half and already exists; what is missing is the across-process half.

**Do not attempt this by widening the existing determinism harness.** Its core is deliberately in-process so the source-mutation runner can overlay it (AC-9); an across-process probe is a different instrument with a different contract, and merging them would make the in-process assertions unreachable — which is the defect that makes a CLI-shaped surface score as if untested.

## BL-PREMISESCAN-ALIAS-SLICE-UNCOVERED — the `@/` specifier slice has no killing test

**Status:** OPEN · **Filed:** 2026-08-16 (`fix/scanner-scope-totality`, from the premiseScan mutation-gate enrolment) · **Class:** guard coverage · **Effort:** S · **Class-sweep exception:** (c) — closing it needs a corpus module this PR does not otherwise touch. · **Reachability:** PROBED — a declared mutant that survives the shipped suite.

`resolveSpecifier` (`tests/mutation/source/premiseScan.ts`) maps `@/x` to a repo path with `spec.slice(2)`. The declared `integer-literal:326:59:2>3` mutant changes that to `slice(3)`, which breaks EVERY `@/` specifier: the module stops resolving, `resolveSpecifier` returns null, and the import is treated as a pure bare specifier — so any provenance reachable only through a `@/` import is silently lost. That is a false negative, the direction the recognizer does not announce.

It survives the suite, and is carried as an `accepted-gap` row on the `premiseScan` surface rather than blessed as equivalent, because it is NOT equivalent — it changes behavior.

**Why it is uncovered.** Killing it needs a fixture importing through `@/` from a repo module whose DECLARATION extent reaches provenance, where the specifier itself is not a provenance module — `isProvenanceModule(spec)` short-circuits before resolution ever runs, so `@/scripts/lib/ledger-git` cannot exercise the slice. No module in the corpus satisfies both halves today, and the recognizer's own foil case establishes that a module merely SHARING a file with a provenance importer is deliberately environment-free.

**RE-DERIVED 2026-08-21 (`fix/premisescan-hook-attachment`, AC-10) — two claims above are FALSE today, and the row still stands.** Spec §8 of that arc requires this premise to be re-derived rather than inherited, because an existing `equivalent` or `accepted-gap` row can stop being true once reachability widens. Derived through the shipped enumerator and the shipped `score()`:

- **There is no `accepted-gap` row.** `premiseScan`'s `accepted` array holds exactly two rows, both `equivalent` and both `relational-boundary`, and `EXPECTED_LEDGER_KINDS` declares `{ equivalent: 2 }`. The sentence above asserting this mutant "is carried as an `accepted-gap` row on the `premiseScan` surface" describes a row that does not exist.
- **The site id is stale.** `spec.slice(2)` is at line 1437, not 326, on this branch AND on `origin/main`; the live key is `integer-literal:1437:59:2>3`. Same column, same expression, same mutation.
- **It did NOT survive.** That arc's gate run passed 7 of 7 with ZERO unaccepted survivors, so the survivor set was exactly the two ledgered `equivalent` sites and this mutant was killed.

**Not archived, deliberately.** That is ONE run, and a row removed on a single observation is the mistake this repository has already made and reversed once — the correct posture is to record the observation and let a second one adjudicate. What would settle it: this site surviving, or not, in the next independent gate run of `premiseScan`, at which point the row either graduates with two observations behind it or is corrected again. What is settled NOW is that the row's own description of the ledger is wrong, and a falsely-described row recruits work that does not exist.

**First scheduled step:** add a committed two-file fixture under the recognizer's own fixture directory — a module reached via `@/` whose exported helper spawns — and assert `environment-touching`. That kills the mutant and lets the row graduate from `accepted-gap` to killed.

## BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION — a command substitution inside an ATTACHED redirection target hides an executing psql from both scanners

**Status:** OPEN · **Filed:** 2026-08-20 (`fix/shell-lexer-quoted-value-recall`, spec adversarial round 1 finding 1) · **Facing:** process · **Severity:** MEDIUM (a MISSED SITE for an executing command, not a conservative non-report; zero corpus instances) · **Class:** guard coverage · **Effort:** M · **Incident:** spec round 1 of `fix/shell-lexer-quoted-value-recall` was burned on this gap — the reviewer's BLOCKING finding is the round, corpus row `docs/review-rounds/fix/shell-lexer-quoted-value-recall/`, and the arc withdrew its attached-target scope in response (design §1.1 row 7, §6 item 3). · **Reachability:** PROBED — see below; zero live corpus instances.

`lexShellWords` (`tests/cross-cutting/psqlStartupFiles/scan.ts`) consumes an ATTACHED redirection target with a regex that matches the whole target and discards it, so a target CONTAINING A COMMAND SUBSTITUTION is never lexed and its body is never collected as a nested shell. Bash executes that body. Probed spellings, each reporting **zero sites and zero indirection hits** while the bash oracle confirms the call really runs: a bare backtick target; `$(…)` or a backtick inside an attached DOUBLE-QUOTED target; a locale-quoted `$"…"` target; and a command substitution inside an attached `${…}` target. The plain attached here-string (`read -r PG <<<p'sql'`) is the same family's benign end and is missed for the same reason.

The failure direction is the bad one — a missed SITE for an executing psql, not a missed discovery hit — which is why this is a ledger row rather than only a limits entry. It is nonetheless PRE-EXISTING and not made worse by the arc that filed it.

**What would close it, and what will not:** collecting the attached target's nested bodies into the lexer's `nested` array so `scanShellText` reads them as it reads every other substitution body. The two readings the filing arc REFUSED, recorded so they are not re-proposed: handing the attached slice to `lexShellWords` recursively and exposing the result to the site path (it breaks the by-construction site-path identity that the detached-target arm rests on), and recursive lexing that keeps the bodies private (machinery with the miss still in place). Closing it belongs to an arc that can re-measure the whole site path, not to a recall arc.

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

## BL-REVIEW-MODAL-QUIET-PILL-OUTRANKS-URGENT — the "no action needed" pill now reads louder than the "needs you" one

**Filed:** 2026-08-14 (`fix/ui-interactive-token-policy`, invariant-8 impeccable critique P2). **Class:** visual hierarchy. **Effort:** S. **Class-sweep exception:** (a) — the repair is a product decision this PR cannot settle. **Reachability:** PROBED — both branches are in `components/admin/showpage/PublishedReviewModal.tsx` at the alert pill (`data-testid` suffix `-alert-pill`), and the arithmetic is on the shipped class strings.

The alert pill has two branches. Monitoring-only ("clearing on their own, no action needed") is `border border-border bg-surface-sunken` and, since the subtle-on-interactive swap, rests at `text-text` — roughly 15:1 on its own fill. The needs-you branch is `text-warning-text` on `bg-warning-bg`, 9.5:1. The QUIET state now carries more contrast than the URGENT one.

**Why it was not repaired on this branch.** The site is dispositioned SWAP in the ratified census (spec `2026-08-14-ui-interactive-token-policy-design.md` §4.3), and the exemption side is pinned executably — the registry's 14 rows, plus the NEGATIVE guarantee that no other in-scope element carries a bare `text-text-subtle` — by `tests/styles/_metaSubtleOnInteractive.test.ts`. Moving it to a Family D carve-out would edit a user-ratified table, which is the user's call, not the implementer's. The pair is NOT indistinguishable meanwhile: the fills differ (`bg-surface-sunken` vs `bg-warning-bg`) and the dot differs in shape (hollow positive-tone vs filled review-tone), so the §1 colour-blind floor holds either way.

**First scheduled step:** decide whether an interactive pill whose whole message is "nothing to do here" is a Family D dim member (it is a state pair, and it already carries two non-colour cues), or whether the urgent branch should instead gain weight.

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

Fourteen shipped controls stand on such a plate, across thirteen sites: `components/admin/DataQualityWarningControls.tsx:21`, `MaintenanceResetButtons.tsx:308` and `:328`, `PerShowAlertResolveButton.tsx:94`, `ReapStaleSessionsButton.tsx:146`, `RecentAutoAppliedStrip.tsx:551`, `ReSyncButton.tsx:286`, `ShowRowActions.tsx:932`, `wizard/step3ReviewSections.tsx:2682`, `wizard/archivedTabOffer.tsx:140` (both its accept and revoke controls), and `StagedPreviewBanner.tsx:72` — the picker link, which joined this entry on 2026-08-16 when the control-outline swap took it from 1.44/1.19 to 3.04 light / **2.79** dark, clearing in light and landing on this entry's own `warning-bg` dark figure (spec `docs/superpowers/specs/2026-08-16-control-outline-surface-fills-design.md` §4.4), and two more the same swap put on this plate, found by whole-diff review R5: `app/admin/settings/roles/RoleMappingRow.tsx:343` (inside the `bg-warning-bg` confirm card opened at `:330`) and `components/shared/ReportModal.tsx:622` (inside the start-fresh warning plate at `:615`). Those two differ from the picker link and the difference is the entry's whole subject: they carry their OWN `bg-surface` fill, so the outline's INNER edge clears at 3.35/3.76 and only the OUTER edge against the plate sits at 3.04 light / **2.79** dark. The picker link is `bg-transparent`, so both of its edges are the plate.

**Why it is recorded rather than repaired here.** `BL-SECONDARY-BUTTON-BOUNDARY-INVISIBLE` was explicit that the prior 1.59:1 boundary was NOT a WCAG failure — the label carried the affordance — and this arc shipped the upgrade under that frame (spec §1.1 R5). A boundary that is strong against its own fill and 2.79-2.88:1 against a tinted plate is a weaker instance of the upgrade, not a regression against the state before it. Choosing the treatment — a darker token used only on tinted plates, a plate-matched outline, or accepting the current numbers — is a design decision, and picking one silently inside a policy arc is what the ledger exists to prevent.

**First scheduled step:** decide whether tinted plates get their own outline token. If yes, the shape is a per-plate `border-*` in the same recipe rather than a new global token, because the neutral grounds already clear and moving the shared token would push them the other way.

## BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER — two families of low-contrast outline the element-level cover cannot see in either direction

**Status:** OPEN · **Severity:** LOW-MEDIUM (a resting boundary at 1.4-1.8:1, on surfaces whose peers moved to 3.35:1 on 2026-08-16) · **Class:** visual boundary / DESIGN scope · **Effort:** S per site, M as a class · **Filed:** 2026-08-16 (`fix/control-outline-surface-fills`, spec §3.2) · **Class-sweep exception:** (a) — the repair needs a design decision this PR cannot settle, stated per family below · **Reachability:** PROBED — every claim below is a transcript, not an argument.

The 2026-08-16 ruling swapped the 21 controls a DERIVED cover found: interactive elements whose OWN className `tests/styles/interactiveScanCore.ts` statically resolves. Two families sit outside that cover **in both directions** — the census will never flag them and never exempt them — so they are recorded here rather than hand-added to a swap set that is otherwise entirely derived.

**Family B first, because one of its members has the strongest claim to have belonged in the 21.**

- `components/admin/wizard/VenueMapTile.tsx:123` — a `<span>` painted as a button visual inside an anchor. A resting outline on a neutral fill; its ONLY difference from the 21 is that the paint lands on a child. Named first deliberately.
- `components/admin/OnboardingWizard.tsx:240` — the done-branch pill inside the `Link` at `:251`.
- `components/admin/ShowRowActions.tsx:650` and `components/admin/wizard/CrewRowActions.tsx:273` — open-state menu-trigger visuals.

**Probe.** The scanner attributes a className to the interactive element. Where the border is painted on a child `<span>`, the interactive element's own class list is clean and the element reports `strong=false`, so the cover never sees the outline at all. Two switch tracks have the identical shape and were promoted into the ruling's exemption family for exactly this reason (spec §3.1) — the mechanism is live, not hypothetical.

**Family A — text-entry fields.**

- `components/admin/BellPanel.tsx:836` and `:847` — `type="number"` fields, `min-h-tap-min w-20 rounded-sm border border-border-strong bg-surface`.
- `components/admin/wizard/step3ReviewSections.tsx:4200` — a `<textarea>` (spec §3.2 cites `:4171`; the live line moved under the 2026-08-16 sibling merges).
- `components/admin/dev/SwitcherControls.tsx:119` — a `<select>`, added to this family on 2026-08-18 by the `border-border` arc. It carries `border border-border bg-surface … hover:border-accent`, so it sits inside §1.2a's widened predicate AND inside that arc's own hover-inversion class — and the scanner sees neither, because `tests/styles/interactiveScanCore.ts:789` admits only `button`, `a` and `summary` as intrinsic tags. The arc left it untouched deliberately: editing it would have shipped a change no assertion in that diff guards, which is the hand-extended cover the family exists to prevent. Its lexical neighbours at `components/admin/dev/SwitcherControls.tsx:29` and `:145` DID move, so this file now carries both treatments — a reader counting `hover:border-accent` occurrences there will find one that did not move, and this is why.

**Probe.** The rule is explicit and narrow: `tests/styles/interactiveScanCore.ts:868-870` admits an `<input>` **only** when its `type` is `checkbox` or `radio`. The scanner does see inputs — nine repo-wide, all checkboxes and radios — but a `type="number"` field and a `<textarea>` are outside its vocabulary by that rule. `scanInteractiveElements` over `components/admin/BellPanel.tsx` returns rows tagged `a`, `button` and `div`, and zero inputs.

**Why each family is filed rather than repaired, and why "same defect, different file" is not the reason.** Both differ from the 21 in element kind and in whether the outline is a resting boundary at all.

- **Family A:** whether an `<input>`'s border is a "control outline" under §1.2a is an open question. The user ruled against a mockup of BUTTONS resting on cards; a text field's border is arguably a field affordance rather than a control boundary, and moving it silently would answer a question the ruling did not ask.
- **Family B:** the closed state of these nested-child outlines is `border-border`, a DIFFERENT token doing a different job (§1.2a preserves it for tile edges, dividers and hover chrome). Whether an open/active STATE treatment is a resting outline or a state cue is the second unanswered question.

**Why `VenueMapTile.tsx:123` was not simply included.** Including it would make the swap set "the 21 the cover found, plus one the cover did not, chosen by hand" — a hand-extended list is exactly the enumerated cover the arc refused everywhere else. It goes here, named first.

**First scheduled step:** answer the two design questions — is a text field's border a control outline, and is an open-state child outline a resting boundary — then apply each answer as a derived sweep over its own family, starting with `VenueMapTile.tsx:123`.

## BL-CONTROL-OUTLINE-FORWARD-GUARD — a guard that keeps the control-outline population correct going forward, with five escapes already closed

**Status:** OPEN · **Severity:** LOW (no shipped defect; this is a regression-prevention ambition) · **Class:** guard design / design-system enforcement · **Effort:** L · **Filed:** 2026-08-16 (`fix/control-outline-surface-fills`, spec §5.2, §6) · **Class-sweep exception:** (c) — the repair is a redesign of a surface the shipping PR does not otherwise touch, and a guard that consumed five review rounds without converging does not belong in a 22-token-edit diff · **Reachability:** PROBED — every escape below was demonstrated against a LIVE mechanism during spec review, not reasoned about.

The 2026-08-16 arc ships a **regression pin** (`tests/styles/_metaControlOutlineFill.test.ts`): the 21 elements it swapped carry `border-text-faint` and no longer carry `border-border-strong`. That is a changelog assertion over a closed set the PR itself defines. It does **not** stop a future arc from adding a NEW control at `border-border-strong`, and the spec does not pretend otherwise.

The forward guard was attempted in five forms across five review rounds and escaped structurally each time. The table is carried here verbatim so the next attempt starts from five CLOSED escapes rather than from scratch:

| Round | Mechanism                                                 | The escape that killed it                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| draft | some branch carries `border-accent-edge`                  | move a track's OFF fill to `bg-surface`: green, while the recorded 1.43/1.75 becomes an unrecorded 1.59/1.60. And `border-accent-edge` is not toggle-exclusive — `DESIGN.md:35` gives it the active step pill and the show-day progress segment                                                                                                                                                                |
| R1 F2 | existential: has an `ON` branch AND has an `OFF` branch   | append a third branch `border-border-strong bg-surface`: green at 1.59/1.60. An existential predicate is a denylist in disguise                                                                                                                                                                                                                                                                                |
| R2 F1 | universal accept-set: EVERY branch is an `ON` or an `OFF` | "tokens include" is not "tokens are": `border-border-strong bg-surface-sunken bg-warning-bg` still includes the `OFF` pair while `bg-warning-bg` wins the cascade (1.44/1.19)                                                                                                                                                                                                                                  |
| R3 F2 | (as above, exactness attempted)                           | exactness requires deciding which of two paint tokens on one branch wins — that is the CSS cascade, i.e. a CSS evaluator in a test helper                                                                                                                                                                                                                                                                      |
| R5 F1 | enumerated five-row FILE registry                         | membership binds the exemption to the FILE, not the ELEMENT. Refactor a registered toggle so its track moves onto a nested span — **the live `components/admin/telemetry/AutoRefreshControl.tsx:106` pattern** — and the outer control becomes a plain `border-border-strong bg-surface` at 1.59/1.60: cover still three elements, file-set equality still true, recipe still present in the file, guard green |

**The reason, stated once so the next attempt does not re-derive it.** Deciding "is this element a switch track" is a question about rendered structure and effective paint, and `scanInteractiveElements` reports neither — it reports an interactive element's own statically-resolvable class strings. Every mechanism above tried to recover structure from that projection, and each recovered a slightly larger subset while leaving the next mutation available. R5's escape is composed entirely of two patterns already live in this repository, so the finding rate did not decay.

**AGENTS.md gives three repair directions when successive rounds each widen a recognizer:** narrow it, file the documented limit, or take the `2d9d0ba11`-style kill. Narrowing was tried twice (R3, R5). The arc took the kill, and this is the filing half of it.

**First scheduled step:** decide whether the guard needs a signal the scanner does not currently produce — a rendered-structure or effective-paint input, e.g. a real-browser computed-style pass over a seeded admin route — rather than a sixth predicate over the same projection. If the answer is no, close this entry as a documented limit instead of attempting a sixth mechanism.

## BL-CONTROL-OUTLINE-PAIRED-CHROME-WEIGHT — two non-interactive chips now read lighter than the control they sit beside

**Status:** OPEN · **Severity:** LOW-MEDIUM (a visible weight inversion in two places; neither loses information, both carry their state in the semantic tree) · **Class:** visual hierarchy / DESIGN scope · **Effort:** S per site, M as a rule · **Filed:** 2026-08-16 (`fix/control-outline-surface-fills`, invariant-8 impeccable gate — critique P1, audit P2) · **Class-sweep exception:** (b) a ratified scope decision fences it, AND (a) the rule it would need is a design decision this PR cannot settle · **Reachability:** PROBED — both pairs read out of the live tree, and both were verified to match on `origin/main` and diverge only after this branch.

The 2026-08-16 swap moved 21 CONTROLS. DESIGN.md §1.2a keeps `--color-border-strong` for non-interactive chrome, so two elements that shared a recipe with a swapped control correctly stayed put — and are now the quieter half of a pair a reader sees at once:

- `components/diagrams/GalleryLightbox.tsx:773` — the `aria-hidden` `pointer-events-none` demote chip ("Full detail unavailable"), `rounded-pill border border-border-strong bg-surface-raised px-4`, at `bottom-2`. The Reset chip it matches (`components/diagrams/GalleryLightbox.tsx:708`, `top-2`) is census row 20 and moved to `border-text-faint`. Same pill, same fill, same shadow, same padding; the two can be up in one frame, at opposite ends of the image. 1.59/1.50 versus 3.35/3.53.
- `components/admin/StagedPreviewBanner.tsx:65` — the `aria-current` chip, `border border-border-strong bg-surface`, standing IN A ROW with the picker `<Link>`s at `components/admin/StagedPreviewBanner.tsx:75` that moved. The entry marked current now carries the weakest boundary in its own row.

**Why it is filed and not repaired.** Spec §4.4 ratifies the second site verbatim — "The sibling `<span aria-current>` at `components/admin/StagedPreviewBanner.tsx:65` is non-interactive chrome: outside the census, keeps its token" — and §1.2a's scope paragraph ratifies the first. Moving either would be moving a non-interactive element under a ruling the user took against a mockup of BUTTONS resting on cards. The general question is the one worth answering, and it is a design decision: **should chrome that visually PAIRS with a control follow that control's outline weight, or does chrome follow chrome?** DESIGN.md's own 2026-08-14 rationale for moving six controls was "leaving a control at the old outline while a control it renders WITH had moved would have shipped a split treatment inside one view" — that reason now points the other way, at chrome, and no rule covers it.

**Not a contrast finding.** Neither element is interactive, so SC 1.4.11 does not reach either, and both carry their state programmatically (`aria-current`, `aria-hidden`). This is hierarchy, not accessibility.

**First scheduled step:** decide whether §1.2a gains a pairing clause (chrome that renders in-frame with a control of the same recipe takes that control's outline weight) or an explicit "chrome follows chrome" statement. Either answer closes both sites; a per-site judgment call closes neither.

## BL-CHECKBOX-ROW-LABEL-UNDER-FLOOR — three native-input rows are targeted through a label that carries no floor

**Filed:** 2026-08-15 (`fix/ui-interactive-token-policy`, whole-diff review R1 F5). **Class:** accessibility / tap target. **Effort:** S per site, M as a class. **Class-sweep exception:** (a) — the repair needs a decision the current PR cannot settle, stated per site below. **Reachability:** PROBED — the markup is read out in each census row, and the guard now names all three as `under-floor-filed`.

A native checkbox or radio is normally targeted through its `<label>`, and the tap-height census carries that as an exemption family. In three places the mechanism holds and the FLOOR does not:

- `app/admin/settings/roles/RoleMappingRow.tsx:266` and `components/admin/RoleRecognizeControl.tsx:343` — the FINANCIALS checkbox is not label-wrapped like its A1/V1/L1 siblings. It sits in a `div` carrying `min-h-tap-min` with the `<label htmlFor>` as a SIBLING, and a `div` does not toggle a checkbox. The real target is the 20px input plus a label whose own box is one text line.
- `components/admin/StagedReviewCard.tsx:580` — the radio IS label-wrapped, but the label is `flex cursor-pointer items-center gap-2 text-sm`: no minimum height, no padding, so the target is a single 20px line.

**Why not repaired here.** The FINANCIALS structure is deliberate: the caution copy is bound with `aria-describedby` precisely so it stays out of the checkbox's accessible name (the comment at `RoleRecognizeControl.tsx:337` says so). Wrapping the row in a `<label>` to gain the floor folds that caution back into the name, so the fix trades one a11y property for another and needs a decision, not a patch. The staged-review radio sits in a dense per-item list where adding 24px per row is a layout decision on a surface this branch does not otherwise touch.

**First scheduled step:** decide the FINANCIALS shape — either a `<label>` wrapping only the checkbox and its short caption with the caution outside it, or padding on the existing sibling label — then apply the same answer to both files, and settle the staged-review list separately.

## BL-HEAVY-REAP-REPORT-OBSERVABILITY — the reaper's reporting surface is specified but not exhaustively observed

**Status:** OPEN · **Severity:** LOW (a coverage limit, never a safety one: by the design's consequence bound a reporting defect cannot cause a kill, so the worst case is an operator running `--all` to see something the default should have shown) · **Class:** test coverage · **Effort:** S · **Filed:** 2026-08-16 (`chore/heavy-orphan-reaper`, as the deliberate fence that ended a 16-round plan review) · **Reachability: INFERRED, NOT PROBED** — no round of that review found a reporting BEHAVIOR that was wrong; every finding was a case that could not observe one. The probe that would settle whether any residue matters is a mutation run over the reporter, named below.

`docs/superpowers/specs/ci/2026-08-16-heavy-orphan-worker-lifetime-design.md` §6.2 specifies the CLI's reporting exactly, and §1.2 fences how far the test suite enumerates it. What the shipped cases DO observe: every candidate; the decline reasons `not-a-worker`, `has-live-parent`, `too-young`, `self`, `undecidable` and `unparsable`; the row and candidate summaries; the full twelve-cell `KillOutcome` print matrix; and `--quiet` across five decline kinds at once under `--kill --all`.

**Why it is fenced rather than finished.** Plan review rounds 11 through 16 each raised exactly one finding on this axis and each was repaired by adding cases — 40 cases became 87 — while the finding rate stayed flat and **no round found a behavior that was actually wrong.** That is the recognizer ratchet `AGENTS.md`'s round-economy block describes, and its prescribed repair is narrowing. The design's consequence bound (§1.2) is what makes narrowing safe here: a reporting defect cannot kill anything, so the axis is not load-bearing on the property the arc exists to protect.

**First scheduled step, and it is a probe rather than more cases:** enrol `scripts/heavy-reap.ts`'s reporting path in the source-mutation registry the way `lib/heavyReap/classify.ts` is enrolled (spec §9), and read the surviving-mutant set. That answers "is any reporting cell unobserved" mechanically, over a closed operator set, instead of by enumeration that does not terminate — which is exactly the substitution `AGENTS.md` convergence bullet 4 prescribes. If it reports no unaccepted survivors, this entry closes as a documented limit with the score attached.

## BL-SPECLINT-RED-TARGET-PATH-ONLY-EXPIRES — a path-only `red-target=` is invalid the moment its task commits the file

**Status:** OPEN · **Severity:** LOW (a plan that creates its own production surface cannot use the red-contract form at all; nothing ships wrong, but the machine-checked declaration is unavailable exactly where a TDD plan is most standard) · **Class:** tooling / spec-lint · **Effort:** S · **Filed:** 2026-08-16 (`chore/heavy-orphan-reaper`, found by plan review round 7) · **Reachability: PROBED** — the lifecycle below was traced through the shipped validator, not inferred.

The path-only form "declares an absent production file" and is validated as such: `targetProblem` returns an error when the cited path IS tracked (`lib/specLint/redContract.ts:112-116`). That is correct at plan time. It is also the ONLY form available to a task that creates its production file, because the colon form requires a tracked file with an in-range line.

**So the marker is valid exactly until the task it describes succeeds.** Task 1 declares `red-target=`lib/heavyReap/classify.ts``while the module is absent; Task 1 then commits that module; a later task in the same plan runs`pnpm spec:lint`and the marker is now`RED_TARGET_INVALID`. The plan cannot be simultaneously executed and lint-clean.

Sibling of `BL-SPECLINT-RED-TARGET-ROOT-FILE` above: same validator, same consequence (no legal spelling exists for the whole life of the plan), different cause. Together they mean the red-contract form is currently usable only by a plan whose production surface ALREADY EXISTS and is not at the repository root.

**Candidate repairs, for the implementing arc to weigh:** (a) accept a path-only target that is tracked when the plan's own task region declares it as created — the information is in the document; (b) treat the path-only form as a claim about plan-authoring time and stop validating trackedness after the fact; (c) add a `red-target-created=` variant whose contract is "absent now, created by this task", which is what these plans actually mean. (c) states the intent rather than inferring it, and leaves today's two forms untouched.

**First scheduled step:** decide whether (a) is expressible without a recognizer over task prose — the enrollment grain rule (`docs/agents/spec-self-review.md:36`) forbids inferring task structure from headings, and "this task creates that file" would have to come from a declared field rather than from the `Files:` list.

## BL-SPECLINT-RED-TARGET-ROOT-FILE — a red-contract `red-target=` cannot name a repository-root file

**Status:** OPEN · **Severity:** LOW (one plan region per affected arc falls back to the v1 marker; nothing ships wrong, but the stricter contract is unavailable exactly where a root-level config file is the production surface) · **Class:** tooling / spec-lint · **Effort:** S · **Filed:** 2026-08-16 (`chore/heavy-orphan-reaper`, hit while writing the heavy-orphan plan) · **Reachability: PROBED** — the finding below is a real `spec:lint` failure on a real plan, not a projection.

`classifySpan` marks a citation BARE when its path contains no `/` (`lib/specLint/citations.ts:55`), and `targetProblem` rejects a bare shorthand outright: "bare-filename shorthand is not legal in a marker; use the full path" (`lib/specLint/redContract.ts:110`). For a file at the repository root the full path IS the bare name, so **no legal spelling exists**. Probed on `docs/superpowers/plans/ci/2026-08-16-heavy-orphan-worker-lifetime.md`, whose Task 4 edits the `heavy` script:

```
FAIL RED_TARGET_INVALID 942:105 invalid `red-target=`: bare-filename shorthand is not legal in a marker; use the full path
```

The rule is right in general — a bare filename in a marker has no anchor context to resolve against, which is the defect it was written to stop. It is only wrong for the root, where there is nothing to disambiguate: `package.json` resolves to exactly one tracked path, and the ambiguity the rule guards against (`CITATION_AMBIGUOUS` lists three `package.json` files, two of them under `tests/styles/__fixtures__/`) is real for PROSE shorthands but not for a marker field that is required to be a full path.

**Workaround in use:** the affected task leaves the red-contract region and uses a v1 marker in a sibling plain region, with the red stated in prose. That is legal and the multi-region design supports it, but it loses `red-state=`/`why=`/`red-target=` for that task — the fields exist precisely so the claim is machine-checked rather than trusted.

**Candidate repairs, for the implementing arc to weigh:** (a) accept a path that resolves to exactly one tracked file even when it contains no `/`, keeping the rejection only when the basename is ambiguous — this makes the check match its stated rationale; (b) accept an explicit `./`-prefixed form and strip it before resolution; (c) declare the limit and document that root-level surfaces use the v1 marker. (a) is the smallest change that removes the dead spot rather than naming it.

**First scheduled step:** confirm whether any OTHER tracked root-level file is a plausible `red-target=` (`git ls-files --full-name . | grep -v /` is the enumeration), since that set bounds how much the gap actually costs.

## BL-ADMIN-DEV-PANEL-TAP-FLOOR — the two dev-panel buttons are ~28px, and their classes are not even compiled

**Filed:** 2026-08-14 (`fix/ui-interactive-token-policy`, found by the shipped tap-height scanner's first run). **Class:** accessibility / dev-only surface. **Effort:** S. **Class-sweep exception:** (c) — the repair is a build-scope decision about a surface this branch does not otherwise touch. **Reachability:** PROBED — `pnpm vitest run tests/styles/_metaTapTargetFloor.test.ts` against an empty census names both sites.

Both buttons are `className="border px-3 py-1 bg-{blue,yellow}-600 text-white"` — the materialize action at `app/admin/dev/page.tsx:151` is blue, the schema reset at `:168` is yellow: 4px of vertical padding around a single line, roughly 28px, against the 44px `--spacing-tap-min` floor.

**Why a class-level repair does not work here, which is the whole entry.** `app/globals.css:33` excludes this exact file from Tailwind's source detection, because the dev panel is build-gated out of production (`ADMIN_DEV_PANEL_ENABLED`). None of those classes is compiled — `bg-blue-600` renders nothing today. Adding `min-h-tap-min` would emit no CSS while making the static guard report a floor the browser never applies, which is strictly worse than the honest census row it carries now (`tests/styles/tapTargetCensus.ts`, category `under-floor-filed`).

**First scheduled step:** decide whether the dev panel should be styled at all — either narrow the `@source not` exclusion so the surface compiles and can carry the floor, or ratify it as an unstyled developer tool and move the two census rows to a documented-limit record.

## BL-TRANSITION-AUDIT-COUNTS-A-MENTION-AS-A-CONSUMER — naming `SECONDARY_ACTION_CLASS` in a comment changes the pinned count

**Filed:** 2026-08-16 (`fix/step3-tap-cluster`, whole-diff CI). **Class:** guard false positive (use-vs-mention). **Effort:** XS. **Class-sweep exception:** (c) — the guard belongs to a different spec's transition audit (§7.4) and this PR does not otherwise touch it; changing its scan semantics is a change to that guard's contract and deserves its own review. **Reachability:** PROBED — see the probe below.

`tests/components/admin/wizard/step3JudgmentChrome.test.tsx:158` decides whether to append `lib/ui/actionClass.ts` to the scanned source with a raw substring test:

```ts
if (src.includes("SECONDARY_ACTION_CLASS")) {
  src += `\n${readFileSync(join(process.cwd(), "lib/ui/actionClass.ts"), "utf8")}`;
}
```

The stated rule is "a file that CONSUMES `SECONDARY_ACTION_CLASS` is scanned WITH it", so collapsing hand-written button classes onto the constant cannot buy slack in the count. A COMMENT that merely names the constant is not a consumer, but `includes` cannot tell the difference.

**Probe (this is how it was found, not a hypothetical):** a one-line comment in `components/admin/wizard/step3ReviewSections.tsx` reading "the same recipe `SECONDARY_ACTION_CLASS` uses for its boundary" — no code change, no class change — moved the file's `transition-(all|colors|opacity)` count from 2 to 3 and failed CI with `expected 3 to be 2` on `unit-suite-nodb (2)`. The file's own transition classes were byte-identical to `origin/main` throughout. Worked around on that branch by rewording the comment.

**Why it matters beyond the annoyance:** it fails in the direction that teaches the wrong lesson. An author whose only change is a comment gets a red count pin and the natural repair is to bump the pinned number, which silently buys the slack the rule exists to deny.

**First scheduled step:** strip comments before the `includes` check using the existing shared helper `tests/_shared/stripComments.ts` (`stripCommentsSafely`, `ts.ScriptKind.TSX`) — the same defence `tests/styles/_metaSubtleOnInteractive.test.ts` already applies for exactly this reason ("a cue surviving only in commentary cannot satisfy a pin"). Then re-add the comment form above as a stays-quiet regression row.

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

### BL-THEME-NOTE-NO-DISMISS-AFFORDANCE — the persist-failure note cannot be dismissed, and a permanently-blocked device keeps it up all visit

**Status:** OPEN · **Severity:** LOW · **Class:** UX signal · **Filed:** 2026-08-16 (`feat/theme-persistence-note`, impeccable critique P1) · **Effort:** S

**Probed at implementation time, not theorized.** The note renders whenever `persistFailed` is true and clears only when a later write SUCCEEDS (`components/layout/useAppliedTheme.ts`). On a device where storage is blocked for the whole session — the entry that produced this feature named embedded webviews with storage partitioning — no later write can succeed, so the anchored bubble stays under the toggle until the page unloads, overlaying whatever sits beneath it.

Spec `docs/superpowers/specs/2026-08-15-theme-persistence-note-design.md` §4 limit 5 accepts the overlay as the price of not displacing three differently-engineered consumer rows, and bounds it (it appears only after the user taps the control directly above it, is at most three short lines, and clears on recovery). What it does not answer is whether the note should be dismissible.

**Why it is filed rather than fixed here.** A dismiss control is a product decision, not an implementation detail: it needs its own copy, a 44px tap target inside a `max-w-36` bubble, an a11y contract (a close button inside a `role="status"` region announces itself), and a rule for whether dismissal survives a later failure. Class-sweep disposition exception (a): needs a product decision.

**Reachability:** PROBED — same reachability as the parent entry (any storage-partitioned webview).

---

### BL-THEME-NOTE-BUBBLE-TEXT-ALIGN — the note bubble right-aligns copy the width math wraps to three lines

**Status:** OPEN · **Severity:** LOW · **Class:** UX polish · **Filed:** 2026-08-16 (`feat/theme-persistence-note`, impeccable critique P2) · **Effort:** XS

The bubble's chrome carries `text-right` (spec §2.2 class list, shipped verbatim in `components/layout/ThemeToggle.tsx`). The same spec section derives `max-w-36` from the tightest consumer and states the copy wraps to three short lines at 320px. Right-aligned multi-line body copy gives every line a different starting x, which is the readability case against it — and it lands hardest exactly where the width was engineered tightest.

**Why it is filed rather than fixed here.** `text-right` is part of a ratified spec class list, and invariant 7 makes the spec canonical: changing a ratified visual contract mid-arc is not the implementer's call. The fix is one class (`text-right` to `text-left`, or dropping it) plus the spec §2.2 edit that ratifies it.

**Reachability:** PROBED — the wrap is the spec's own width derivation; the alignment is visible on any failed persist at 320px.

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

## BL-SCREENSHOTS-DRIFT-SINGLE-FAILURE-UNEXPLAINED — one `dashboard-overview-light.webp` byte drift that a nine-run probe could not reproduce

**Severity:** LOW (advisory job; not a required context) · **Class:** CI-INFRA · **Effort:** S (the first step is a capture, not a repair) · **Filed:** 2026-08-18 (`fix/rowactions-submenu-reveal-flake`, as the surviving half of `BL-ADVISORY-E2E-JOBS-FLAKE-ACROSS-IDENTICAL-CODE`) · **Reachability:** INFERRED, NOT PROBED.

`screenshots-drift` failed once on `dashboard-overview-light.webp` at `b5aa6ef7` — Bin 77670 to 82600 — and passed at a head whose only delta was one markdown file. Nine `workflow_dispatch` runs at one fixed sha, distinct-ref method, then returned **0/9** reproductions.

**Why this is a ledger row and not a documented limit.** The observed failure is real and unexplained, and its worst case is not conservative: a byte-comparison gate that flips at a fixed tree teaches operators to ignore it, which is how a genuine capture regression ships unnoticed. That is a live consequence, not a surfaced-signal-plus-safe-fallback.

**Why it is filed unprobed.** A 0/9 sample rules out a per-run coin flip but cannot rule out a rare runner-population effect — a bimodal capture environment where some fraction of runners encode differently. The nine runs are evidence about rate, not about mechanism, and no instrument in the arc could distinguish the two readings.

**Reachability: INFERRED, NOT PROBED.** The probe that settles it is capturing runner identity — `Runner.Name` plus CPU model, from the runner context — on BOTH outcomes at the next recurrence, and comparing the populations. That capture, not a repair, is the first scheduled step; it is cheap, and it is the only thing that turns the leading reading into a testable one.

**Do NOT open a screenshots repair on the current evidence.** Regenerating or re-pinning a baseline against one unreproduced drift would destroy the signal the capture needs.

## BL-E2E-APP-DEPENDENT-SPECS-CI-DARK — 4 app-dependent e2e specs are named by no CI workflow

**Status:** OPEN · **Severity:** MEDIUM (dark regression coverage) · **Class:** CI wiring · **Effort:** L · **Filed:** 2026-08-06 (L-wave, refile of `BL-E2E-LIFECYCLE-SPECS-CI-DARK` at honest scope)

**The `UNSEEN` rows of `tests/ci/_metaE2eWorkflowCoverage.test.ts` are e2e specs named by no CI workflow** — that allowlist is the population, and the count is whatever it holds (the table below records the measured figures; it was 43, then 32 after PR #743, 25 after that batch, 24 after M-wave 2 W-E2E, and 23 once help-pages joined). No number is restated in this sentence, because a narrative copy of a machine-held count is exactly what went stale here. They are the residual of the 2026-07-26 CI-dark cluster, which closed everything that did NOT need a running application: `standalone-e2e.yml` now runs the whole standalone config unfiltered on every PR, and that alone retired 30 allowlist rows.

**Census, RESTATED 2026-08-09 by counting the allowlist rather than by arithmetic** (the "~60" this
entry was first filed with was wrong, and the miscount is recorded so the number is not re-inflated;
the 2026-08-06 counts are kept alongside so the delta is auditable):

| Allowlist rows                                                          | 2026-08-06 | 2026-08-09 | 2026-08-22 |
| ----------------------------------------------------------------------- | ---------- | ---------- | ---------- |
| `UNSEEN` — named by no workflow, **this entry's population**            | 43         | **25**     | **4**      |
| `PATH_GATED` — named by a workflow, runs when its filter matches        | 13         | 13         | 14         |
| `PATH_GATED_BY_EXCLUSION` — named, runs unless the change is prose-only | 6          | 8          | 10         |
| `LOCAL_ONLY` — local artifact by design                                 | 1          | 1          | 1          |
| custom-reason rows                                                      | 3          | 3          | 10         |
| **Total rows**                                                          | 66         | **50**     | **39**     |

**The 2026-08-22 column is produced by the commands below, not typed.** Pasted from the run at the
batch-2 closeout head, invocations included, so it reproduces rather than being taken on trust:

```
$ F=tests/ci/_metaE2eWorkflowCoverage.test.ts
$ rows(){ awk '/^const LOCAL_ONLY_ALLOWLIST/,/^};/' "$F" | grep -E '^ +"tests/e2e/'; }
$ cls(){ rows | sed -E 's/^ +"[^"]+":[[:space:]]*//' \
    | awk '{ v=$0; sub(/,$/,"",v); if (v ~ /^(UNSEEN|PATH_GATED|PATH_GATED_BY_EXCLUSION|LOCAL_ONLY_GALLERY_CAPTURE)$/) print v; else print "custom-reason" }'; }
$ chk(){ n=$(cls | grep -c "^$1\$"); [ "$n" -eq "$2" ] && echo "ok $1=$n" || { echo "FAIL $1=$n expected $2"; exit 1; }; }
$ d=2
$ chk UNSEEN $((2 + d))
ok UNSEEN=4
$ chk PATH_GATED 14
ok PATH_GATED=14
$ chk PATH_GATED_BY_EXCLUSION 10
ok PATH_GATED_BY_EXCLUSION=10
$ chk LOCAL_ONLY_GALLERY_CAPTURE 1
ok LOCAL_ONLY_GALLERY_CAPTURE=1
$ chk custom-reason 10
ok custom-reason=10
$ t=$(rows | wc -l | tr -d ' '); [ "$t" -eq $((37 + d)) ] && echo "ok total=$t" || echo "FAIL total=$t"
ok total=39
$ rows | grep -E ': UNSEEN,$' | grep -oE 'tests/e2e/[^"]+'
tests/e2e/admin-parse-panel.spec.ts
tests/e2e/empty-state-reachability.spec.ts
tests/e2e/onboarding-wizard-step1.spec.ts
tests/e2e/warning-panel-polish.spec.ts
```

Those four names are the whole remaining population of this entry: the two AC-4 drops below, plus
the two this batch never claimed.

The 23 → 4 drop is TWELVE row deletions (batch 2's members, which move the total 51 → 39) plus
SEVEN reclassifications out of `UNSEEN` into custom reasons (which move no total). A fourteenth
TWO more were wired, ran green four and five times respectively, and left under AC-4 mid-count —
their rows are back, so they are two of the four the last command prints. The pre-closeout total reads 51 where the 2026-08-10
restatement said 50: `staged-preview.spec.ts` joined the allowlist as `UNSEEN` after that
restatement, and is one of the twelve deleted here.

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

**Batch 2 — TWELVE specs wired, census 23 → 4** (this entry is restated in the same PR that wires
them, so it describes that PR's content, not a merge that has already happened) (PR #875,
`.github/workflows/app-e2e.yml` EXTENDED rather than duplicated, since these members have batch 1's
requirement class exactly). Wired: `admin-route-boundaries`, `admin-settings-admins-refresh`,
`dev-capture`, `developer-tier`, `needs-attention-page`, `no-raw-codes`,
`published-show-attention`, `roles-settings-layout`, `sign-in-page`, `source-link-dimensional`,
`staged-preview`, `telemetry-layout` — +90 executed identities on top of batch 1's 77, each carrying its own `REQUIRED` row derived from a real run's report through the
oracle's own walk. Spec:
`docs/superpowers/specs/ci/2026-08-21-app-e2e-batch2-design.md`; probe record:
`docs/superpowers/specs/ci/probes/2026-08-21-app-e2e-batch2-membership-probe.md`.

**TWO members were wired and then left under AC-4 mid-count, exactly as batch 1's changes-feed did,
and the count restarted from zero both times rather than taking an almost-done exception.**
`admin-parse-panel.spec.ts` was green on four CI runs (32558218336, 32559183296, 32559865786, 32560300422) and every local one, then red on 32561531983 at its Re-sync assertion, where the run's
own artifact shows the whole page rendering the admin error boundary ("Admin session unavailable").
That is the transient admin-session infra class `BL-CHANGES-FEED-MODAL-BATCH-FLAKE` already records
on this job, and no test-side wait outlasts it; the ratified recovery for the class is the OPEN-TIME
helper, and extending it across a click plus a server round-trip is a design decision, not a repair.
Its allowlist row is back with all five run ids in the comment, and re-entry needs the same
five-green bar.

`warning-panel-polish.spec.ts` then went green on five CI runs and red on 32563705156 with the
announcer still empty after Ignore — WITH the R7 hydration gate present, which is the condition spec
section 9 names as its falsifier. **It is recorded as UNATTRIBUTED rather than as that falsifier
firing**: `--retries=0` leaves no trace, the artifact carries no snapshot, and the same case under
the CI posture locally (`CI=1`, `pnpm build && pnpm start`, `--trace on`) passed 4 of 4. One CI red,
one green CI-posture reproduction, no trace. The falsifier stays open with that run id as its only
observation, and the row carries both readings. **Only CI settles a flake question.**

Batch 1's lesson held: **membership was derived from three real runs, not from a reading**, and seven
of the fourteen candidates were RED on first run. All seven were test-only staleness repaired in-branch (a
retired `/` route; a `/show/<slug>` `next` the validator has rejected since the picker pivot; two
fixture selections that raced another suite's rows on a shared database; badge literals that assumed
an otherwise-empty pending population; a width measured against an `sr-only` placeholder; an add form
behind a disclosure the spec predated; a click that landed before hydration).

**Two findings this batch banks for the next one.** First, the app's postgres.js paths resolve
`TEST_DATABASE_URL ?? DATABASE_URL`, and that fallback evaluated in two processes with different
environments is two different databases wearing one name: the local probe's run 1 read the REMOTE
validation project while the specs seeded the local stack, and three "reds" went green under nothing
but a pinned DSN. The CI half of the same repair is `DATABASE_URL` on the run step. Second, an
expectation must derive from the SAME discriminator the runtime uses: `developer-tier` asserted the
dev-tools row from the COMMITTED build-time constant, which describes the repo, while CI's webServer
builds with `ADMIN_DEV_PANEL_ENABLED=true` and bakes the opposite value into the artifact. It passed
every local run and failed the first CI one — the local-passes-CI-fails class, caught exactly where
AC-6 says it will be.

**Seven `UNSEEN` rows were reclassified, not wired, and the distinction is the point.** `admin-dev`,
`deep-link-walker`, `help-auth`, `help-mobile`, `help-typography`, `help-screenshots-clock-pipeline`
and `screenshots-help-capture` are all ALREADY RUN by a path-filtered workflow, through an invocation
the coverage scanner cannot see by its own contract: five through project-only `--project=` run steps
(`.github/workflows/dev-gate-e2e.yml:153`, `.github/workflows/help-affordances.yml:97`) and two
through the `screenshots-drift.yml:118` docker block that runs `pnpm screenshot:help`. Each row now
carries its invocation line, its filter, its schedule where one exists, and why it cannot join the
required set. This changes no workflow, no run and no total; it stops the census calling seven specs
"runs nowhere" when the evidence is in the same document.

**`onboarding-wizard-step1.spec.ts` is excluded from every batch until a seed-state redesign, and the reason is recorded so batch 2 does not re-derive it:** it asserts `[data-testid=onboarding-wizard]` on `/admin`, but `supabase/seed.ts` sets `app_settings.watched_folder_id` and `app/admin/page.tsx` then renders the dashboard — a deterministic failure on any seeded DB, and a required state mutually exclusive with `admin-changes-feed-layout.spec.ts`'s.

**Structural guard already in place:** the workflow-coverage meta-test with its reasoned allowlist (`tests/ci/_metaE2eWorkflowCoverage.test.ts`) shipped with the archive-row-menu-idiom branch. Wiring work here is moving a spec OFF that allowlist by adding it to a workflow — the guard makes each removal explicit rather than silent.

**Related, filed separately:** `BL-E2E-LAYOUT-FIXED-WAIT-RESIDUE` (three fixed waits the 2026-08-03 class sweep found in the layout spec).

## BL-MUTATION-SHARD-BUDGET-AGGREGATE-OVER — the source-mutation shards are 60% over budget in AGGREGATE, and the four-shard pin's premise no longer holds

**Status:** OPEN · **Filed:** 2026-08-22 (queued by `bl-orch` onto `ci/app-e2e-batch2`'s closeout commit, from `dbconn`'s arithmetic) · **Facing:** process · **Severity:** MEDIUM (the budget gate is FAILURE on main itself, so every arc reads its own leg against a red baseline and cannot tell a regression from the inherited state) · **Class:** CI capacity · **Effort:** M · **Reachability:** PROBED — the shard wall-clocks below, from the runs linked as the incident. · **Incident:** the `mutation-harness` budget gate is red on MAIN, not on a branch: confirmed on `a99a1500`, on `3cf9f...`, on #872's head and on #872's own run. Those are cost events that already happened, not a constructed hypothetical.

Measured shard wall-clocks: **4669 s, 6958 s, 4667 s, 6786 s = 23080 s** of work against a budget of
`4 x 3600 s`. That is 60% over IN AGGREGATE, and — the part that matters for the fix — **all four
legs are over**, with no single surface dominating any of them. The spec's §2.4 premise for pinning
`SOURCE_SHARD_COUNT = 4` was that a small number of expensive surfaces set the ceiling; that premise
is now false, so the pin cannot be defended on its original grounds.

Fix candidate, by the same arithmetic: **n = 8 fits** at roughly 2885 s for the longest leg. `n = 5`
and `n = 6` are both still over, so a one-notch bump buys nothing.

**The first scheduled step is the shard-count decision as a FLEET item, not a unilateral edit.**
`shardPartition` is a shared surface and the LPT partition re-packs whenever the surface set changes,
so a shard-count change moves which shard every enrolled surface lands in, and every arc holding a
stamped score is affected at once. Note also that `arc-ctloutline`'s incoming **231 sites** land on
this same partition and make every number above worse before any repair lands.

## BL-ADMIN-LOADER-CI-TRANSIENT — admin page and modal loaders fault transiently on the app-e2e runner, and the failure is indistinguishable from a spec defect

**Status:** OPEN · **Filed:** 2026-08-22 (`ci/app-e2e-batch2`, from three counted runs of that arc's five-green loop) · **Facing:** process · **Severity:** MEDIUM (it costs a full five-green restart per occurrence, and read per-spec it drops members that are not defective) · **Class:** CI flake · **Effort:** M · **Reachability:** PROBED — three CI runs below, each with the failing page's own snapshot, against local CI-posture reproductions that pass. · **Incident:** three counted runs of PR #875's AC-3 loop died on it in one evening, and two batch-2 members were dropped under AC-4 before the shape was recognized. Those are cost events that already happened.

Three CI runs, three DIFFERENT specs, one shape — an admin loader faulting and the segment rendering
its error boundary while the rest of the page is fine:

- [32561531983](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32561531983) — `admin-parse-panel`, snapshot is the whole page as "Admin session unavailable" at the Re-sync assertion.
- [32563705156](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32563705156) — `warning-panel-polish`, announcer empty after Ignore; no trace at `--retries=0`, so this one is the least attributed of the three.
- [32564772189](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32564772189) — `needs-attention-page`, nav and badge render (badge reads "2"), `main` is "This admin page couldn't load".

Every one of them reproduces GREEN locally under the CI posture (`CI=1`, so `pnpm build && pnpm
start`, both DSNs pinned): parse-panel 10 of 10, warning-panel 4 of 4 with `--trace on`,
needs-attention 12 of 12. So the domain of the defect is the LOADER on that runner, not the specs —
which is why reading it per-spec drops members that are not defective and empties a batch to certify
nothing. Same family as `BL-CHANGES-FEED-MODAL-BATCH-FLAKE`, which measured the transient gateway
502 reaching the `/admin` error boundary on this same job.

**`admin-parse-panel` and `warning-panel-polish` stay dropped for batch 2.** Both drops were
procedurally valid when they were made — one red on a counted run, no attribution, AC-4's own
procedure — and re-adding them tonight would be churn on an arc whose bar is five consecutive green
runs. Their restoration is **batch 3's first question**, and their allowlist rows already carry every
run id a batch-3 reader needs.

First scheduled step: decide whether the ratified open-time recovery (the changes-feed helper) can be
extended to a page-segment boundary at all, or whether the runner's Supabase bootstrap is what needs
hardening. Both are fleet decisions; neither belongs to a wiring arc.

## BL-E2E-EMPTY-STATE-REACHABILITY-RETIRED-ROUTE — the empty-state catalog's only real-browser proof navigates a route the picker pivot retired

**Status:** OPEN · **Filed:** 2026-08-22 (`ci/app-e2e-batch2`, deferred out of batch 2 by that spec's section 10) · **Facing:** product · **Severity:** MEDIUM (the §8.3 empty-state catalog has no live proof; the spec runs nowhere and would fail everywhere) · **Class:** e2e coverage · **Effort:** M · **Class-sweep exception:** (c) — re-targeting the route and replacing five `toHaveScreenshot` assertions with behaviour assertions is a rewrite of a spec batch 2 does not otherwise touch. · **Reachability:** PROBED — the run line below.

`tests/e2e/empty-state-reachability.spec.ts` navigates `/show/<slug>` (line 154). The M11.5 picker
pivot retired that route: there is no `page.tsx` under `app/show/[slug]/`, the crew route is
`/show/[slug]/[shareToken]`, and the page renders none of the tile testids the spec waits for. Batch
2's membership run measured it at **0 of 4 per project, both projects** — every case failed at
`toBeVisible` on `venue-tile` / `show-status-tile` / `tile-grid` / `stale-footer` after the `goto`
(probe record section 4.1, rows 2-5 and 17-20).

Two independent blockers, either sufficient, which is why this is a rewrite rather than a wiring gap:
the retired route above, and five `toHaveScreenshot` assertions comparing bytes against committed
`-darwin.png` baselines, which the byte-comparison discipline forbids on `app-e2e.yml`'s native Linux
runner. Closing it means re-targeting the route AND either replacing the pixel assertions with
behaviour assertions or moving the spec to the pinned-Docker screenshots job.

Its `UNSEEN` allowlist row stays until then, which is the conservative outcome batch 2's consequence
bound requires: a spec is either wired and proving its identities, or left on the allowlist with the
run line that says why.

## BL-MODAL-WAIT-LOADED-CORE-CLASSIFY-TOTALITY — the loaded-only wait treats "not loaded" as "must be the boundary"

**Status:** OPEN · **Severity:** LOW (the affected window is the streaming overlap, and the cost is a worse ERROR MESSAGE on a path that already fails) · **Class:** e2e diagnostics · **Effort:** S · **Filed:** 2026-08-18 (`fix/modal-wait-skeleton-tolerant`, from that arc's diff review round 1, which found the same shape in the NEW frame core) · **Class-sweep exception:** (b) — a ratified scope fence: that arc's plan lists "the loaded-only core's contract" under NOT edited, and its 30-plus adopted sites all run through it. · **Reachability:** PROBED — command and output below.

`awaitReviewModalOrRecover` samples one locator after its race and infers the rest: `if (await ready.isVisible()) return modal;` and everything else falls into the boundary-recovery branch (`tests/e2e/helpers/openShowReviewModal.ts`). Nothing verifies a boundary is actually present. Each `isVisible()` is a live DOM query, so a frame that is up when the race resolves and gone one sample later — the documented streaming overlap — routes into a recovery that clicks a `RETRY_SELECTOR` no page is showing.

**Probe** (throwaway vitest case against a fake Page whose `isVisible` is always false, mirroring the frame core's own regression case):

```
PEER-PROBE-MESSAGE: test.info() can only be called while test is running
AssertionError: expected 'test.info() can only be called while …' to contain 'peer:probe'
```

The thrown message names neither the caller's label, nor the selectors, nor `show_review_snapshot_failed` — exactly the diagnostic loss the parent arc's `starveError` exists to prevent. Under playwright the same path produces a generic click timeout instead.

**Cost of leaving it:** confined to error QUALITY. Every affected run already fails; it just fails without the grep target. Nothing silently passes.

**What a repair needs:** the totality the frame core now has — classify loaded, then boundary, and treat "neither" as one bounded re-race followed by the named starve error, never as an assumed boundary (`awaitReviewFrameOrRecover`'s `classify`/`raceOnce` pair is the shipped model). The reason it is not done here: the loaded core is on the hot path of every adopted site in the corpus, so it wants its own diff and its own review rather than riding along in an arc whose plan explicitly fenced it. **Re-open trigger:** any adopted site reporting a bare Playwright click timeout where a starve was expected.

## BL-PLANLINT-RECONCILIATION-AND-MARKER-CITATIONS — two already-mandated plan checks that only a human currently runs

**Status:** OPEN · **Severity:** LOW (each miss costs one review round, never a wrong artifact) · **Class:** authoring tooling · **Effort:** S · **Filed:** 2026-08-16 (`test/modal-wait-helper-adoption`, from that arc's plan-stage round-economy filing) · **Reachability:** PROBED — both misses were measured on that arc's own plan review, each with the finding that caught it.

Two rules in `docs/agents/writing-plans.md` are stated but unchecked, and the same arc broke both:

- **Reconciliation arithmetic is authored but not RUN.** `docs/agents/writing-plans.md:27` requires per-task sweeps to be authored AND run with their output pasted. The modal-wait plan's Task 3 row read 15 edits where its own two stated divergences give 16 − 3 + 1 = 14, so the column summed to 50 against a stated 49 (plan review R1 finding 2). A lint that parses a plan's reconciliation table, sums its columns, and compares against the stated total closes this without judgement.
- **The citation pass does not cover MARKER fields.** The pre-draft verification rule already says "every named file", and a task marker's `red=` command names files — they were simply not treated as part of the pass. That arc's Task 8 marker cited `tests/mutation/source/registry.test.ts`, which does not exist and never did; the suite is `tests/mutation/_metaGuardSurfaceRegistry.test.ts` (plan review R1 finding 4). `spec:lint`'s citation checker already resolves `file:line` citations in prose; extending it over `<!-- task: … red=\`…\` -->` comment bodies is the same resolver over a different span.

Both land on one surface (`lib/specLint/**` over `docs/superpowers/plans/**`), which is why they are one entry rather than two. **First scheduled step:** run the proposed column-sum check over the committed plan corpus and count how many existing plans it would fire on — a rule that reds a third of the corpus on day one is a corpus-correction task before it is a lint.

---

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

### BL-REPORT-CLIENT-ERROR-NON-ERROR-MESSAGE-ONLY — client boundary crashes collapse non-Error values to String(e)

**Status:** OPEN · **Severity:** LOW (client-only mirror; server logging is structural since `fix/serialize-error-structure`) · **Class:** observability · **Effort:** S · **Filed:** 2026-08-16 (`fix/serialize-error-structure` spec §1.1.5)

**Probe evidence.** `lib/observe/reportClientError.ts:11-14` — `toError` returns `{ message: String(e) }` for non-`Error` values, so a plain-object boundary crash reports `message: "[object Object]"` on the client-error wire. Same defect shape the serializeError arc repaired server-side.

**Why filed rather than fixed in that arc (class-sweep exception (c)).** The client wire is its own surface: `clientErrorTransport` CAPS, the dedup signature (`lib/observe/clientErrorTransport.ts:32`), and the `/api/observe/client-error` route contract would all move — a redesign of a surface the serializeError PR does not otherwise touch.

**Shape of the fix, when scheduled.** Reuse the structural posture: serialize non-`Error` crash values to bounded structure (or at minimum their own enumerable fields flattened into `detail`), respecting the wire CAPS.

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

### BL-PLANLINT-ASSERTIONLESS-EXPECT — an `expect(` with no matcher asserts nothing, and is mechanically detectable

**Status:** OPEN · **Severity:** MEDIUM · **Class:** review economy · **Filed:** 2026-08-16 (`fix/premisescan-import-edges`, plan round-4 finding 1) · **Effort:** S

A scripted conversion left 13 planned call sites as `expect(actual, { … })` with no matcher; Vitest returns an assertion object and nothing is asserted, so 16 executions passed regardless of verdict or detail. **Probe evidence:** the round-4 reviewer enumerated all 13 with line numbers, and a brace-balanced scan over fenced `ts` blocks reproduced exactly that set. Proposal: run that scan over `docs/superpowers/plans/**` in `spec-lint`, since the plan's test blocks are the artifact an implementer copies.

### BL-DOCEDIT-POSTCHECK — scripted edits to specs and plans need a post-edit invariant check

**Status:** OPEN · **Severity:** MEDIUM · **Class:** review economy · **Filed:** 2026-08-16 (`fix/premisescan-import-edges`, spec round-5 finding 2 and plan round-4 finding 1) · **Effort:** S

Two silent deletions in one arc, both from a multi-line non-greedy regex whose terminating phrase recurred later in the document: one removed §4 limits 6-14 from a spec, the other mangled reporting assertions in a plan. Neither was visible in the diff summary. **Probe evidence:** both were caught by cross-model review rather than by the author, and both were confirmed by counting structural elements before and after. Proposal: a `pnpm doc:postcheck` that compares section-number continuity, `it(` counts and fenced-block balance across an edit, to be run after any scripted change to these documents.

### BL-PROBE-RECORD-COVERAGE-TABLE — a probe record's universal claim should be checkable against its harness source

**Status:** OPEN · **Severity:** MEDIUM · **Class:** review economy · **Filed:** 2026-08-16 (`fix/premisescan-import-edges`, spec round-economy filing at `docs/review-rounds/fix/premisescan-import-edges/daa53759a953.md`) · **Effort:** S

Three consecutive spec rounds on one arc raised the same defect: a probe record asserting "every live edge resolves", then "every VALUE edge", then dynamic-import coverage — each time over a harness that walked strictly less than the prose claimed, and each time inside the repair of the previous instance. **Probe evidence:** rounds R2 F2, R3 F1 and R4 F2 of that arc, each reproduced against the target tree; the round-4 disposition (a per-edge-class YES/NO table checked against the harness source, with the uncovered populations counted) is the form that terminated it.

Proposal: require any probe record whose conclusion quantifies universally to carry that coverage table, as a `docs/agents/spec-self-review.md` rule. The table is cheap and it converts an unfalsifiable summary into a claim a reviewer can check in one pass.

### BL-CODEX-GUARD-CITATION-GATE — CITATION_MALFORMED should block the dispatch, not become a review finding

**Status:** OPEN · **Severity:** MEDIUM · **Class:** review economy · **Filed:** 2026-08-16 (`fix/premisescan-import-edges`, same filing) · **Effort:** S

The codex-guard `--lint-doc` arm already detects pathless `:NN` citations and attaches the report to the brief. On that arc it detected all three instances of round-4 finding 6, and they still cost a round, because nothing consumed the signal before dispatch. **Probe evidence:** the round-4 reviewer quotes the lint report as independently reporting all three as `CITATION_MALFORMED`.

Proposal: make `CITATION_MALFORMED` a dispatch-blocking condition in `scripts/codex-guard.mjs`, the way `~/.claude/hooks/review-convergence-gate.sh` blocks a brief with no consequence bound — a detected-but-unconsumed signal is the same defect shape the convergence gate exists to close.

### BL-SPEC-PIN-VS-BRANCH-HEAD — a spec pinning an unmerged commit should be checked against that branch's head at dispatch time

**Status:** OPEN · **Severity:** LOW · **Class:** review economy · **Filed:** 2026-08-16 (`fix/premisescan-import-edges`, same filing) · **Effort:** S

A spec designed against an unmerged PR pinned `ac9a40cd8`; the branch advanced five commits mid-review, and the document ended up citing two different trees at once — one limit describing a parser behaviour the target no longer had, and one limit citing a comment only the newer commits contained. **Probe evidence:** round-3 finding 5, plus `git log ac9a40cd8..origin/fix/scanner-scope-totality` showing the five commits and `premiseScan.ts:61` showing the changed parse-kind selection.

Proposal: when a `--lint-doc` document names both a branch and a commit sha, compare the sha to that branch's current head and surface the drift at dispatch time. Cheap, and it catches the class before a reviewer spends a round on it.

### BL-NEARMISS-CANDIDATE-RENDER — the near-miss card asks Doug to judge a suggestion no surface displays

**Severity:** MEDIUM (the card functions; the arc's whole point is unrealized in UI) · **Class:** UI / warning-card copy-behavior mismatch · **Filed:** 2026-08-15 (`feat/mutation-section-order`, impeccable dual-gate finding F1, deferred half) · **Effort:** S

**Probed, not theorized.** The detector computes the matched candidate and attaches it structurally — `lib/parser/warnings.ts:427`, `if (opts.candidate !== undefined) warning.candidate = opts.candidate;` — and the emitted message carries it as `; looks like '<candidate>'`. But `rg -n '\.candidate\b' components/ app/` returns only `NeedsAttentionInbox.tsx:92,105,106` `item.candidateTitle`, an unrelated show-title field. **Zero render sites for `ParseWarning.candidate`.** The card's only concrete example is the hard-coded `'Stage'` / `'Stage Size'` pair in `helpfulContext`, which is the wrong pair for nearly every one of the 65 live emissions.

**Why it is filed rather than fixed in the filing branch.** Rendering the candidate is a change to `components/` — a surface `feat/mutation-section-order` does not otherwise touch, so it would pull the invariant-8 dual gate onto a new rendered component and a fresh design pass. That is class-sweep disposition exception **(c)**: the repair is a redesign of a surface the PR does not otherwise touch. The copy half WAS repaired in that branch — every clause inviting Doug to Report "if our suggestion is wrong" is gone, so the shipped card names only what is on screen and is honest as it stands. That is what makes this schedulable rather than urgent.

**Work:** render `ParseWarning.candidate` on the near-miss card (and the wizard's step-3 row, which already derives its own per-row label from `rawSnippet` at `components/admin/wizard/step3ReviewSections.tsx:3067`), then re-edit `helpfulContext`/`longExplanation` to point at the shown suggestion instead of the invented `'Stage'` example — which also closes gate finding F2's residue, since the worked example exists only because there is nothing real to point at. Guard the render, or it regresses to the same silent mismatch.

### BL-TYPO-NORMALIZED-V4-VENUE-SHAPE — the re-keyed venue gate is unreachable on the current template, and the miss is silent

**Severity:** MEDIUM (a SILENT miss, not a conservative demote — nothing at all is emitted, so the operator gets no signal to act on) · **Class:** parser signal reachability · **Filed:** 2026-08-15 (`feat/mutation-section-order`, found by the implementer during the field-near-miss detector task and confirmed by its reviewer) · **Effort:** S (the code is one predicate; the DECISION is the work)

**Probed, not theorized.** Same typo-alias row, same parser, differing only in the shape of the table that holds it:

```
$ pnpm exec tsx --tsconfig tsconfig.json <probe>          # row: | Hotal Contact Info | Ashley M |
v2 (| VENUE | opener)        opener="VENUE"        gate=true   warnings=[…, TYPO_NORMALIZED]
v4 (| VENUE NAME | opener)   opener="VENUE NAME"   gate=false  warnings=[…]            <- no TYPO_NORMALIZED
```

(The other codes in both rows are unrelated document-shape noise from the two-row probe document; the discriminating difference is `TYPO_NORMALIZED` alone.)

**Mechanism.** The field-near-miss detector work re-keyed `TYPO_NORMALIZED` from the retired positional scope window to venue-BLOCK MEMBERSHIP (`lib/parser/blocks/venue.ts:103`), per that spec's §2.1 "the §2.2 mapping's `venue` block". The predicate is `matchesSectionHeader` (`lib/parser/blocks/_sectionHeaderMatch.ts:44`), which is whole-cell equality after `normalizeHeader` — so `"VENUE NAME" !== "VENUE"`. A v2 three-column block opens on a standalone `VENUE` cell (`fixtures/shows/raw/2025-10-consultants-roundtable.md:96`) and passes the gate. A v4 two-column block opens on `VENUE NAME` (`fixtures/shows/raw/2026-03-rpas-central-four-seasons.md:40`) and does not.

**Why this is a filing and not a documented limit.** On the v4 shape a registered typo alias inside the venue table now produces NOTHING: no `TYPO_NORMALIZED` (gate false), no `FIELD_LABEL_AUTOCORRECTED` (the alias resolves EXACTLY through `resolveAliasFull`, so the scoped fuzzy path never sees a `corrected` hit), and no `UNKNOWN_FIELD` (the label resolved, so it is not a near-miss candidate). The ledger filing bar sends a hypothetical to a limits record when its worst case is conservative behavior PLUS a surfaced signal; here there is no surfaced signal, so the screen does not cover it.

**Reachable live surface.** The v4 template plus a registered typo alias placed in the venue table — e.g. `Hotal Contact Info` (`lib/parser/aliases.ts:27`) in the `VENUE NAME`-opened block of any 2026 sheet. v4 is the CURRENT template: the three most recent corpus fixtures (2026-03, 2026-04, 2026-05) all carry it. **Nothing regresses on today's fixtures** — the corpus `TYPO_NORMALIZED` census is 0 both before and after the re-key, because every corpus `Hotal Contact Info` row sits in a hotel block, not a venue one. The loss is on a shape that exists and is current but carries no typo instance yet.

**Class-sweep exception (a) — needs a product/design decision this PR cannot settle.** Two candidate repairs, and choosing between them is the work:

1. **A second predicate at the gate only** — also treat a table whose opener resolves to a `venue.*` canonical as the venue block. Contained to `venue.ts`, changes no emitted `kind`, but makes venue-block membership mean two different things in two places, which is the drift the single-predicate design deliberately removed.
2. **Widen `anchorNamespace`'s venue arm** (`lib/parser/fieldNearMiss.ts:213`) so the v4 shape maps to `"venue"` for everyone. One definition of the venue block, but it changes `kind` on REAL `UNKNOWN_FIELD` emissions — `kind` is a routing key with three consumers (anchor resolution, the swap oracle, the persisted `block` column), so this moves the committed 65-row baseline and is a design call, not a refactor.

**Fix:** pick an option, then pin the v4 direction in `tests/parser/fieldNearMissBaseline.test.ts` alongside the existing both-directions v2 cases, so the shape that is currently silent becomes an asserted one.

## BL-E2E-WORKFLOW-PATHS-COVERAGE-GENERIC — a workflow-invoked spec can sit outside that workflow's `paths:` filter

**Status:** OPEN. · **Filed:** 2026-08-15, backfill from the review-round filing `docs/review-rounds/refactor/classname-array-join-cn/61281c23e8ce.md` (plan §, candidate 3 / R4-F2), per the enforcement-pair spec §4 candidate 1 · **Severity:** medium · **Class:** CI wiring · **Effort:** S

For each spec named in a workflow `run:` line, assert the workflow's `paths:` filter covers the
spec, its fixtures, and (advisory) the components it asserts on. Per-workflow wiring tests exist
for exactly three workflows (`tests/cross-cutting/app-e2e-ci-wiring.test.ts`,
`tests/cross-cutting/lifecycle-layout-e2e-ci-wiring.test.ts`,
`tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts`); the generic walk does not exist, so the
fourth workflow ships uncovered by default.

**Reachability:** PROBED in the originating filing — R4-F2 was a live instance found by review
round, and the three enumerated wiring tests are the enumeration-not-derivation shape the
class-sweep rule warns re-opens per workflow. Filed under class-sweep exception (c): a guard
surface of its own, out of scope for the arc that found it.

## BL-PLANLINT-ACCEPT-SET-CALIBRATION-PROBE — an enumerated accept-set must carry its calibration probe

**Status:** OPEN. · **Filed:** 2026-08-15, backfill from
`docs/review-rounds/refactor/classname-array-join-cn/61281c23e8ce.md` (delta-arc plan §,
candidate 1), per the enforcement-pair spec §4 candidate 3 · **Severity:** medium · **Class:**
plan-lint arm (sibling of `BL-SPECLINT-RED-EXECUTABILITY-ARM`) · **Effort:** S-M

Any plan text of the form "assert every X is one of {…}" must embed the probe output of the
current base measured against that set. The originating arc's R4-F1 is the proof: authored from
the repair context instead of a probe, the set was narrower than the tree it had to accept, and
no round before R4 ran the one command that shows it.

**Reachability:** PROBED in the originating filing (R4-F1, a live plan defect that burned a
round). Filed under class-sweep exception (c): a lint surface of its own.

## BL-PLANLINT-RECORDED-SHA-EXPIRY — a recorded SHA names its own expiry

**Status:** OPEN. · **Filed:** 2026-08-15, backfill from
`docs/review-rounds/refactor/classname-array-join-cn/61281c23e8ce.md` (delta-arc plan §,
candidate 2), per the enforcement-pair spec §4 candidate 4 · **Severity:** medium · **Class:**
plan-lint arm (same family as `BL-PLANLINT-ACCEPT-SET-CALIBRATION-PROBE`) · **Effort:** S-M

Any plan step that records a commit SHA for later reuse must enumerate every later step that
rewrites history and either re-resolve there or state why nothing can intervene. The vector burned
three rounds in the originating arc (R2-F1, R3-F1, R4-F2), each one history-rewrite deeper — the
signature of a class that wants a rule.

**Reachability:** PROBED in the originating filing (three rounds, three live instances). Filed
under class-sweep exception (c). May share one lint surface with
`BL-PLANLINT-ACCEPT-SET-CALIBRATION-PROBE`; the implementing arc decides and records it.

## BL-SPECLINT-BL-DISPOSITION-CLOSEOUT-ARM — a spec dispositioning `BL-` ids owes a closeout naming each id's terminal state

**Status:** OPEN. · **Filed:** 2026-08-15, backfill from
`docs/review-rounds/chore/guard-completeness-wave/04f601134519.md` (spec §, item (c)), per the
enforcement-pair spec §4 candidate 6 · **Severity:** low · **Class:** spec-lint arm ·
**Effort:** S

A spec that dispositions `BL-` ids owes a graduation/closeout section naming each id's terminal
state (graduated, superseded, declined) — the originating arc's R4 closeout class, where the
dispositions existed but no section accounted for them id-by-id.

**Reachability:** PROBED in the originating filing (the R4 closeout round). Filed under
class-sweep exception (c). May share one lint surface with
`BL-SPECLINT-POSTREPAIR-FORWARD-REF-SWEEP`; the implementing arc decides and records it.

## BL-MUTATION-HARNESS-MAIN-RED — the source-mutation gate is red on main, every PR inherits it, and the failure set turns over faster than a row can name it

**Status:** OPEN. · **Filed:** 2026-08-16 (found while shipping `chore/round-economy-enforcement-pair`, whose own enrolled surfaces passed) · **Re-scoped:** 2026-08-16 (`docs/mutation-ledger-accuracy`) · **Severity:** MEDIUM (a permanently red non-required gate trains every arc to read its verdict as noise, which is how the twelve-survivor catch of #786 nearly did not happen) · **Class:** CI gate fidelity · **Effort:** S-M

**Renamed away from a title carrying a count.** This entry shipped as `…-TWO-SURFACES`, and within the same day it was filed (`a49ef67a4`, 08:55) the count went two, three, four — while the MEMBERS turned over completely, so that both originally-named failures have stopped reproducing and not one of the four failures below is one the original row mentioned. The count was the fastest-staling fact in the row, so the id no longer carries one. Nothing else cites the old id; this heading was its only occurrence.

**The failure set as of `c5518dfab`**, read PER-ANNOTATION off run 31989590619. **Read the revision, not "latest":** `c5518dfab` is the branch tip merged as #827 / `ad9638fa9`, which is main as it stood immediately BEFORE #832 — and #832 enrolled a 30th surface, `sameOriginServerAction`, whose gate result NOBODY HAS OBSERVED, because the harness has not run on a revision containing it. So this set is a floor on current main, not a census of it. The registry carried 29 surfaces at this revision and carries 30 now.

1. `shardBudget` — 2 unaccepted survivors with no ledger row, `relational-boundary:73:56:<=><` and `integer-literal:118:66:100>101` in `lib/ci/shardBudget.ts`. Introduced with the surface itself, in #834.
2. `rowScanOpener` — AC-13 ledger-kind mismatch: the registry row carries `{ equivalent: 2 }` while `EXPECTED_LEDGER_KINDS` declares `{}`.
3. `fieldNearMiss` — the same shape: registry `{ equivalent: 1, 'accepted-gap': 1 }`, declared `{}`.
4. `destructiveFileAnalysis` — 8 unaccepted survivors AND 8 stale ledger rows over `tests/db/_destructiveFileAnalysis.ts`, which pair one-to-one under a LINE SHIFT: seven of the eight are the ledgered site plus one line (`371:61` for `370:61`, `388:32` for `387:32`, `392:19/27/47` for `391:19/27/47`, `397:24` for `396:24`, `503:73` for `502:73`) and the eighth is `626:29` for `602:29`. Coverage did not change; the repair is a re-key, not a test.

**(2) and (3) are one class, and the class is closed by derivation rather than by enumeration.** Comparing every `GUARD_SURFACES[].accepted` kind-count against its `EXPECTED_LEDGER_KINDS` entry — which is exactly what the AC-13 assertion does per surface, run here over all of them at once — yields EXACTLY these two mismatches — run over the CURRENT registry of 30 surfaces, with all 30 ids declared, so it covers `sameOriginServerAction` too even though no gate run has. Unlike everything else in this row, that is a static comparison of two committed files and needs no CI at all, which is why it can speak for a revision the harness has never executed. There is no third instance waiting in a shard nobody has read, and a fix for one is a fix for both.

**Two failures that have stopped reproducing, recorded rather than deleted** so a reader can tell a lapsed failure from one that was never there. Neither is confirmed CLOSED: every observation below is on a PR head, and no `workflow_dispatch` on main has established a baseline for either.

- Original failure 1, `interactionTimingScan` / `logical-connector:330:39:&&>||` in `scripts/scan-interaction-timings.ts` — **KILLED by #827** (`ad9638fa9`), not ledgered. Absent from every annotation on the run above; that arc's own final gate was `interactionTimingScan 105/113 = 1.0000`, 8 ledgered, 0 unaccepted, 0 stale.
- Original failure 2, `tests/parser/mutationHarness.shard4.test.ts` / `blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L38..L45` — **no longer reproducing.** `parser-shards (4)` is `success` on the three most recent runs (31984549526, 31984664534, 31989590619), as is every other parser leg and `parser-gates`. Three green observations on three unrelated heads is strong, but note what it is not: none of those heads IS main, and no `workflow_dispatch` on main has confirmed it — the same gap this row's last paragraph flags for the whole set. Nor is it attributed to a merge; whatever closed it is not identified here.

**Reachability: PROBED.** Every failure above is quoted from a CI annotation, not inferred. **(1) reproduces cross-branch**, appearing identically on `test/execution-methods-driver-derived` (run 31984549526) and `chore/heavy-orphan-reaper` (run 31984664534) — two unrelated heads, neither of which touches `lib/ci/shardBudget.ts`. **(2) and (3) are settled more strongly than by any observation**: they are a static disagreement between two committed files, reproducible with no CI at all (they also happen to appear on both of those runs). **(4) is the weakest of the four and is deliberately marked as such — it has been observed exactly ONCE, and only ONE other run could ever have seen it.** The shift that stales its ledger is `fbfc04fdf`. Of the two earlier runs, only `test/execution-methods-driver-derived` (31984549526, head `4638d2792`) contained that commit, and there the shard holding the surface was killed by the timeout described below, so it reported nothing — a censored opportunity. The `chore/heavy-orphan-reaper` run (31984664534, head `95c08e62f`) did NOT contain it and still carried the pre-shift file, so its own timeout masked nothing here and it is not evidence either way. Item (4)'s line-shift diagnosis therefore rests on the survivor/stale pairing inside a single annotation and has not been independently reproduced; treat a second sighting as confirmation rather than as new.

**Traps, each of which cost an arc real time on 2026-08-16** (deliberately unnumbered — this entry has been bitten once already by a count in prose that a later edit outgrew). They are properties of the sharded workflow, so they apply to every future read of this gate, not just to this failure set:

- `source-shards` is a check name that did not exist before #834. A poller filtered to the twelve REQUIRED contexts cannot see it at all, and reports `pending: 0` while it is red.
- A shard job fails WHOLESALE. Read per-annotation, never per-job status, or a shard's single failure gets attributed to every surface in it.
- **A shard that hits its job ceiling reports NOTHING** (the ceiling was `timeout-minutes: 90` when this trap was written; it is 125 from `fix/mutation-shard-ceiling-pin`, and `_metaSourceShardIntegrity` now pins it at >= 2x `SHARD_BUDGET_SECONDS` plus a 300 s reporting reserve so the two can never drift back together — see `BL-MUTATION-WEIGHT-MODEL-BOOT-COUNT-ONLY` for why the underlying imbalance is deliberately NOT repaired with it) — no gate annotation for any surface it holds, including the ones that failed. This is not hypothetical: `source-shards-2` was cancelled at 90m17s on run 31984664534 and at ~90m18s on 31984549526. On 31984549526 that is exactly why (4) went unseen; on 31984664534 the surface was not yet in its failing state, so that leg's silence hid nothing — which is the point, since a timed-out leg gives you no way to tell those two cases apart. A timed-out leg is not a green leg, and its budget record (`5410s`) is the timeout wall, not a measurement.
- **Leg NUMBER is not a stable name for a surface.** The partition is recomputed from the registry on every run (`sourceShardAssignment`, LPT over modelled child boots), and between the two earlier runs and `c5518dfab` — hours apart — `shardBudget` moved from leg 3 to leg 0 and `rowScanOpener` from leg 0 to leg 1. (Those revisions differ by more than one merge, so the movement is the observation; pinning it on any single PR would be an inference this row does not need.) Cite the SURFACE; re-derive the leg when one is actually needed, which `sourceShardAssignment` does locally in seconds.

**Why it is a row and not a shrug.** The gate is not a required context, so it merges red indefinitely, and its own memory record is that CI's run — not a local one — is what finds real survivors. A gate that is always red cannot deliver that signal, and a set that turns over this fast makes "is this failure mine?" unanswerable for every arc that touches the harness.

**First scheduled step:** repair (2) and (3) together as the one class they are — a single edit to `tests/mutation/source/expectedLedgerKinds.ts`, since the registry rows are the reviewed artifact and the declarations are what drifted from them. Then re-key (4), which is mechanical. Then repay (1) with ASSERTIONS — **not** with ledger rows. Both survivors were evaluated directly and both CHANGE BEHAVIOR, so blessing either would ledger a real defect:

- `relational-boundary:73:56:<=><` turns `budgetSeconds <= 0` into `< 0`, so a budget of exactly `0` stops failing: the verdict goes from `{ok: false, failures: ["budget is not a positive finite number of seconds: 0"]}` to `{ok: true, failures: []}`. That is precisely the outcome the line's own comment forbids — "A budget that failed to parse must not silently make every leg compliant."
- `integer-literal:118:66:100>101` turns `WARN_FRACTION * 100` into `* 101`, so the warning reads `over 75.75% of the 3600s budget` instead of `over 75%`. Observable output, and the leading indicator is the whole point of that string.

Neither is equivalent; both are genuine coverage gaps in `tests/ci/shardBudget.test.ts`. An earlier draft of this row reasoned from the SHAPE of the sites — a boundary comparison, an integer inside a string — and concluded "plausibly equivalent". That inference was wrong in the dangerous direction, and it is recorded here so the next reader does not re-derive it: on this gate, argue from the mutant's evaluated output, never from the site's shape.

Confirm the clean baseline with `workflow_dispatch` on main, not by reading a PR run — and note that a PR run's head is the PR branch, which is why the set above is dated to a revision rather than to "main".

**The main-branch baseline this row asks for now exists, and it is stronger than the `workflow_dispatch` it asks for** (recorded 2026-08-20 by `docs/mutation-harness-main-red-filing`; the row stays OPEN — this supplies evidence the row requested, it does not change the work). FOUR consecutive SCHEDULED runs on `main` — [31933821808](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/31933821808) (08-16), [32007234397](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32007234397) (08-17), [32111856491](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32111856491) (08-18) and [32228276600](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32228276600) (08-19), against a last-green [31871859884](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/31871859884) (08-15). A scheduled run's head IS the default branch, so the set below is dated to `main` rather than to a revision for the first time — and 08-19's head is `4e074d3bc`, which is main as it stands at this filing, so nothing here is extrapolated forward. Read per-annotation, per the trap above; leg numbers are omitted for the reason that trap gives.

- **(1) `shardBudget` — CONFIRMED ON MAIN, three times** (08-17, 08-18, 08-19), with the same two survivors quoted verbatim on 08-18 and 08-19: `relational-boundary:73:56:<=><` and `integer-literal:118:66:100>101`. Alongside (4) this is now the row's best-evidenced item.
- **(2) `rowScanOpener` — CONFIRMED ON MAIN, three times and STILL OPEN.** `expected { equivalent: 2 } to deeply equal {}` on 08-17, 08-18 and 08-19.
- **(3) `fieldNearMiss` — REPAIRED.** It failed on 08-17 (`expected { equivalent: 1, 'accepted-gap': 1 } to deeply equal {}`) and is absent from 08-18 and 08-19. Settled by DERIVATION rather than by that absence — re-running this row's own static comparison over the CURRENT registry yields exactly ONE mismatch, `rowScanOpener`, out of 38 surfaces. **This corrects a claim the paragraph above makes:** "a fix for one is a fix for both" proved false — one was fixed without the other. The class-closure argument itself survives, since the derivation still ranges over every surface at once and the nine enrolled since have added no third instance; only the coupling claim was wrong.
- **(4) `destructiveFileAnalysis` — CONFIRMED ON MAIN three times, which is the independent reproduction this row asked to be treated as confirmation.** It is no longer the weakest item and the "observed exactly ONCE" caveat above is superseded. 08-19 additionally emits BOTH halves in one annotation, so the line-shift diagnosis is now read directly rather than inferred: survivors `logical-connector:371:61`, `388:32`, `503:73`, `integer-literal:392:19`, `392:47`, `relational-boundary:392:27`, `397:24`, `626:29` against stale rows `logical-connector:370:61`, `387:32`, `502:73`, `integer-literal:391:19`, `391:47`, `relational-boundary:391:27`, `396:24`, `602:29` — the same one-to-one pairing, seven at plus-one line and the eighth `626:29` for `602:29`.
- **A FIFTH failure this row never named, which its own thesis predicts:** `premiseScan` — `stale-ledger-row: 1` on 08-17. Absent from 08-18 and 08-19 and NOT settled by derivation, so it is recorded exactly as the lapsed pair below is — observed once on main, not confirmed closed. Its likely class is named elsewhere and is not re-derived here: `premiseScan`'s accepted row is line-keyed and churns, and the merge of `fix/premisescan-nested-hook-sibling-leak` re-keyed it again (`relational-boundary:1881:28` to `1936:28`) without changing any ledger KIND, which is `BL-MUTATION-SITEID-LINE-KEYED-CHURN`, not this row.
- **Both "stopped reproducing" failures are now settled on main in BOTH directions.** They were live: the 08-16 nightly — a main-branch head predating this row's own filing — carries `interactionTimingScan` `unaccepted-survivor: 1` AND `tests/parser/mutationHarness.shard4.test.ts` DRIFTED fingerprints, and those two were its ONLY failures. And they are gone: both are absent from 08-17, 08-18 and 08-19, with every `parser-shards` leg and `parser-gates` green on all three. Three consecutive main nightlies is the baseline this row wanted. Neither closure is attributed to a merge here.

Derivation for (3), which needs no CI and is reproducible at any revision:

```
pnpm tsx -e 'import {GUARD_SURFACES} from "./tests/mutation/source/registry.ts";
import {EXPECTED_LEDGER_KINDS} from "./tests/mutation/source/expectedLedgerKinds.ts";
for (const s of GUARD_SURFACES) { const k = s.accepted.reduce((a,r)=>{a[r.kind]=(a[r.kind]??0)+1;return a;},{});
  if (JSON.stringify(k)!==JSON.stringify(EXPECTED_LEDGER_KINDS[s.id])) console.log(s.id,k,EXPECTED_LEDGER_KINDS[s.id]); }'
# at 4e074d3bc: MISMATCH rowScanOpener: registry={"equivalent":2} declared={}
#              surfaces=38 mismatches=1
# re-derived identically at 4b5028b44, this branch's merge base -- the premiseScan
# re-key that landed between them moved a siteId, not a ledger kind.
```

**What these four runs do NOT establish is the budget half**, which on 08-18 and 08-19 failed the `budget` job for reasons that are not this row's coverage failures. That is `BL-MUTATION-SOURCE-SHARD-BUDGET-BREACH`.

## BL-MUTATION-SOURCE-SHARD-BUDGET-BREACH — the source shards blew the 3600s budget on main, four days after the row that closed the wall-clock ceiling was archived

**Status:** OPEN. · **Filed:** 2026-08-20 (`docs/mutation-harness-main-red-filing`, from arc-browser's pre-task verification of the nightly reds) · **Facing:** process · **Severity:** MEDIUM (it fails a non-required gate today; the same growth censors a quarter of the source gate's annotations at the next enrolment) · **Class:** CI capacity · **Effort:** S-M

**Incident:** the `budget` job FAILED on the scheduled `main` run of **2026-08-18** — [run 32111856491](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32111856491) — with `leg source-shards-1 took 4442s, over the 3600s budget`, `leg source-shards-2 took 4562s, over the 3600s budget`, `leg source-shards-3 took 4025s, over the 3600s budget`, then `check-shard-budget: 3 failure(s)`. It failed AGAIN on **2026-08-19** — [run 32228276600](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32228276600) — with `leg source-shards-0 took 5210s, over the 3600s budget` plus warnings on all three remaining legs. The last scheduled `main` run to pass it, [32007234397](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32007234397) (08-17), carried a single warning: `leg source-shards-3 took 3404s, over 75% of the 3600s budget`. The binding leg went from 94.6% of budget to 144.7% in two nightlies.

**These are measurements, not timeout walls** — the distinction the archived `BL-MUTATION-HARNESS-WALLCLOCK-CEILING` draws about its own `5410s` figure, which was a leg cancelled at its ceiling. `timeout-minutes` is 90 (5400 s) and the longest leg here is 5210 s = **86.8 min**, so no leg was cancelled and every leg reported its gate annotations. Corroborated independently by the job clocks: on 08-19 `source-shards (0)` ran 07:32:08→08:59:03.

**The cause is enrolment growth, and the archived row predicted it in as many words.** `BL-MUTATION-HARNESS-WALLCLOCK-CEILING` was CLOSED 2026-08-16 by the sharding of #834, on a measurement at 29 surfaces where the binding leg was 3356 s = 93.2% of budget with **244 s** of headroom, and it says: "it survives by a margin a single enrolment can erase, so anyone deciding whether to raise `SOURCE_SHARD_COUNT` should re-measure rather than trust either number." Five surfaces enrolled between the 08-17 and 08-18 nightlies alone — `paneCompactionCore`, `modal-wait-disposition`, `mutationSurfaceEnumerate`, `mutationSurfaceTotality`, `spawnBounded` (from `git diff 59a9ef25a b24e3ac5f -- tests/mutation/source/registry.ts | grep -E '^\+.*id: "'`).

The series, each surface count produced by the command below it:

| revision                                  | surfaces | binding leg | % of 3600 s budget | `budget` job                                |
| ----------------------------------------- | -------- | ----------- | ------------------ | ------------------------------------------- |
| `c5518dfab` (wallclock row's measurement) | 29       | 3356 s      | 93.2%              | pass, 2 warnings                            |
| `59a9ef25a` (08-17 nightly head)          | 31       | 3404 s      | 94.6%              | pass, 1 warning                             |
| `b24e3ac5f` (08-18 nightly head)          | 36       | 4562 s      | 126.7%             | **FAIL, 3 legs over**                       |
| `4e074d3bc` (08-19 nightly head)          | 38       | 5210 s      | **144.7%**         | **FAIL, 1 leg over**                        |
| `50d68dd6d` (08-21, PR #859)              | 40       | **>5400 s** | **>150%**          | **leg CANCELLED at the 90 min job timeout** |

**THE PREDICTED CONSEQUENCE HAS NOW HAPPENED, and this row called it in advance.** Its severity line reads "the same growth censors a quarter of the source gate's annotations at the next enrolment". PR #859 is that next enrolment -- it adds `claimSweep` as surface 40 -- and on 2026-08-21 `source-shards (1)` ran 90 min 17 s from `05:11:10Z` to `06:41:27Z` and was CANCELLED at the job timeout with its single step `Run source-mutation shard 1` cancelled. Exactly one of four legs, and it produced NO annotations: not a red, not a green, silence. A quarter of the gate's output, censored, as written.

**The arriving surface is the MARGINAL cause and not the underlying one, which matters for the repair.** `sourceShardAssignment` is weight-balanced, so `claimSweep`'s 155 units do not land on one leg: measured on the branch, all four shards sit at 1078-1084 units against 1042 before, so every leg got about 4% heavier. The binding leg was already at 144.7% of a 3600 s budget one arc earlier. A 4% increase does not create a breach at 144.7%; it moves the binding leg across the JOB timeout, which is a different and harder ceiling than the budget warning, because a budget breach reports and a timeout is silent. (That timeout was 90 minutes when this was measured; `fix/mutation-shard-ceiling-pin` raised it to 125 and pinned it at >= 2x the budget plus a 300 s reporting reserve, so the crossing described here no longer censors the leg — the imbalance that produced it is untouched and is `BL-MUTATION-WEIGHT-MODEL-BOOT-COUNT-ONLY`.)

**Consequence for the arc that hit it:** #859's own enrolment was validated locally across several scored runs with paired in-run provenance stamps, and has NO CI evidence, because the leg carrying it never reported. The three legs that did report are `(0)` SUCCESS, `(3)` SUCCESS, and `(2)` FAILURE naming `rowScanOpener` -- an inherited main-red that reproduces identically on `origin/main` and that the PR does not touch. `source-shards` is not a required check, so this did not block the merge; it removed evidence somebody wanted.

```
git show <rev>:tests/mutation/source/registry.ts | grep -cE '^\s+id: "'
```

That lexical count is validated rather than trusted: at HEAD it agrees with the authoritative one — `pnpm tsx -e 'import {GUARD_SURFACES} from "./tests/mutation/source/registry.ts"; console.log(GUARD_SURFACES.length)'` prints `38` — and at `c5518dfab` it reproduces the `29` the archived row states independently. **The last row is a measurement of main, not a projection**: the 08-19 nightly's head IS `4e074d3bc`. Main has advanced to `4b5028b44` since, and the count there is unchanged at 38 by the same two commands — so the 144.7% is the most recent measurement of a tree with today's surface count, not a stale one.

**The consequence is not the red `budget` job; it is the leg that goes silent next — SUPERSEDED 2026-08-21 as to the margin, not as to the mechanism.** A leg that hits its job ceiling reports NO gate annotation for ANY surface it holds — the trap `BL-MUTATION-HARNESS-MAIN-RED` records, which has already masked a genuine surface failure once. The binding leg was at 5210 s against the then-5400 s ceiling: **190 s of margin**, against the ~1800 s that two nightlies of enrolment just added. The ceiling is now 7500 s, so that specific margin is superseded AND SO IS THE PREDICTION IT CARRIED: these very figures project 7010 s for the next comparable batch, which breaches the budget -- and therefore REPORTS -- while staying under the ceiling, so it is no longer censored. What is NOT superseded is the mechanism: a leg that does reach the ceiling still reports nothing, and the pin restores visibility without changing a single leg's cost. (The sentence that stood here — "the next comparable batch does not merely breach the budget again, it censors a quarter of the source gate" — is DELETED rather than left below its own correction: 7010 s reports under a 7500 s ceiling. A censored leg being indistinguishable from a leg with nothing to report is still true, and is why the ceiling is pinned at all.)

**Reachability: PROBED.** Every figure is quoted from a CI annotation or produced by the command printed beside it. The breach has been observed twice on main, out of the three sharded main nightlies that have ever run (08-16 predates the sharding and ran as a single job); the 08-17 run at 94.6% is a corroborating trend, not a counterexample.

**First scheduled step: re-measure, then raise `SOURCE_SHARD_COUNT`** (`tests/mutation/source/shardPartition.ts:26`, currently `4`) — which is what the workflow's own triage guidance prescribes verbatim: "over budget: the design reporting on itself as surfaces enrol. Raise SOURCE_SHARD_COUNT in tests/mutation/source/shardPartition.ts — NOT timeout-minutes." (`.github/workflows/mutation-harness.yml:346`).

**Do not expect the count alone to fix it, and this is the trap in the repair.** The partition is LPT over MODELLED CHILD BOOTS, and the archived row measured that model to be badly miscalibrated to seconds: at `c5518dfab` the four legs weighed 636 / 631 / 637 / 637 — one boot apart — while their wall clocks were 886 / 2166 / 3069 / 3356 s, a **3.8x** spread (1.4 s/boot against 5.3 s/boot). Raising the count rebalances BOOTS. Bounding wall clock needs a weight calibrated to seconds, which is the archived row's own conclusion and its deferred limit L-2 (sub-surface partitioning) — filed there with the `budget` job named as its self-reporting trigger. This row is that trigger firing.

**Not a duplicate of `BL-MUTATION-HARNESS-MAIN-RED`.** That row is the source gate's COVERAGE failure set — surviving mutants and ledger-kind drift — and explicitly disclaims the budget half. This is the `budget` job: a different job, a different failure, a different repair. The 08-18 and 08-19 nightlies are red for both reasons at once, which is exactly why they are easy to conflate.

## BL-MUTATION-CHEAPNESS-GUARD-HAND-ENUMERATED-SPECIFIERS — the reachability guard re-implements a resolver the project already owns, and is one spelling short every round

**Status:** OPEN · **Filed:** 2026-08-21 (`fix/mutation-ledger-kinds-derived-cover`, split out of that arc's diff review at the round cap per the documented-ratchet rule) · **Severity:** LOW (it never produces a wrong parity verdict — the deliverable it guards was confirmed correct in round 1 and never moved; it produces review rounds) · **Class:** guard fidelity · **Effort:** M · **Facing:** process · **Reachability:** PROBED — each miss below was demonstrated by a reviewer probe against the shipped guard, and each repair was verified by injecting the same import form and observing red. · **Incident:** three consecutive diff rounds on one arc were spent on this single axis, with the finding rate FLAT rather than decaying — corpus `docs/review-rounds/fix/mutation-ledger-kinds-derived-cover/0820436cf4dd.jsonl`, rounds 1-3 declaring 3, 2 and 2 findings, of which SEVEN OF SEVEN were against the guard and ZERO against the parity oracle the arc exists to ship.

**The shape, and it is one shape.** `tests/mutation/_metaLedgerKindsDeclarationParity.test.ts` walks its own import graph to prove it cannot reach a mutant-spawning module. To do that it resolves specifiers itself, and each round found it modelling exactly the spellings its author had in mind:

| round | modelled                                  | missed                                                |
| ----- | ----------------------------------------- | ----------------------------------------------------- |
| 1     | a regex over the file's own source        | re-exports, single quotes, dynamic, one module deeper |
| 2     | relative specifiers                       | the `@/` repo alias (`vitest.projects.ts:176`)        |
| 3     | relative + alias                          | Vite's root-relative `/tests/...`                     |
| 3     | static `import ... from` in the allowlist | `await import(...)`                                   |

**Why a row rather than another round.** The project already owns the authoritative answer — the Vite/vitest resolve configuration that actually resolves these modules at runtime. A guard that hand-writes a subset of it is a derived cover's opposite: an enumeration, of an open set, maintained by review. It will be one spelling short indefinitely, and every miss costs a round on whatever arc happens to be carrying it.

**Fenced against relitigation.** The current guard is NOT unsound for its stated threat model, and this row is not a defect report against it. Its threat fence is ordinary contributor error, all four known spellings are now handled, and the direct-import allowlist independently bounds what the file can pull in — asserted as an exact set across static AND dynamic forms, so an unmodelled spelling can only matter on a transitive edge inside repo modules whose own imports are ordinary. What this row buys is that the axis stops being maintained one review round at a time.

**What the arc did instead of hardening it, and why that is the starting state.** The transitive walk is DELETED on `fix/mutation-ledger-kinds-derived-cover`, not left one spelling short. Round 4 found a fifth form (Vite's `.js`/`.jsx`-to-TypeScript substitution) and adding it would have bought the sixth; more decisively, the walk forbade IMPORT EDGES and no import edge is hazardous -- `runner.ts` only defines `runSurface`, `surfaceCases.ts` only defines `registerSurfaceCases`, and neither executes at module scope. It red on safe code -- and PROBED, its false positives came from the walker's own comment-matching defect rather than from a real graph edge: `registry.ts` imports only `node:fs`, `./ledger` and `./operators`, so the `registry.ts` -> `runner.ts` path an earlier draft cited does not exist. Top-level parse of both forbidden modules: `runner.ts` has 3 non-declaration statements and `surfaceCases.ts` has 1, none calling a spawner. What ships is the exact-set direct-import allowlist, which is total over its domain because it never resolves a specifier at all.

**First scheduled step:** decide whether a transitive reachability claim is wanted AT ALL before rebuilding one. If it is, resolve through the project's own resolver rather than re-implementing it — `vite`'s `createResolver`/`resolveConfig` against the same config vitest loads, or the resolved module graph vitest already builds. If neither is reachable from a unit test at acceptable cost, the honest alternative is to DELETE the transitive walk and keep the direct-import allowlist alone, which is the half that is total over its domain rather than one enumeration short. Do not add a fifth specifier spelling.

## BL-MUTATION-WEIGHT-MODEL-BOOT-COUNT-ONLY — the shard partition balances modelled child boots, and the real cost per boot varies ~20x across surfaces

**Status:** OPEN · **Filed:** 2026-08-21 (`fix/mutation-shard-ceiling-pin`, from the Defect C diagnosis while clearing main's nightly red) · **Severity:** MEDIUM (it produces no wrong verdict; it produces UNBALANCED legs, which breach the budget and then cancel, and a cancelled leg carries no verdict at all) · **Class:** mutation harness fidelity · **Effort:** M-L · **Facing:** process · **Reachability:** PROBED — the load figures below were computed by running `sourceShardAssignment` and `weightOf` over the live registry at `0820436cf`; the elapsed figures are read off main's own legs. · **Incident:** main's nightly `source-shards` has been red for days with legs CANCELLED at the job ceiling rather than failing, and that silence has already cost two misattributions: `rowScanOpener`'s AC-13 mismatch went unattributed for five days inside a leg red for a sibling surface, and its failure was then misdated by three commits onto an unrelated arc, because the only available history was leg-level and two of the four legs had cancelled. The censored-leg mechanism is documented independently at `BL-MUTATION-HARNESS-MAIN-RED` (the `timeout-minutes` trap), which recorded a leg cancelled at 90m17s reporting nothing for any surface it held.

**The model, and what it prices.** `weightOf` (`tests/mutation/source/shardPartition.ts:31-38`) is `mutants.length + accepted.length * (suites - 1) + suites` — a count of modelled CHILD BOOTS, justified in its own comment by `runAllSuites` short-circuiting on the first rejecting suite, so a killed mutant costs one boot and a survivor pays every suite. That reasoning is sound. The unstated assumption is that every boot costs the SAME, quoted in `runner.ts:19-25` as ~0.75 s.

**The assumption is wrong by up to ~30x, and two independent measurements agree.** Per-mutant rates measured on this harness span roughly **1.19 s/mutant** (`spawnBounded`) to **23.45 s/mutant** (`ledgerGit`) — a 19.7x spread, measured by a different arc for an unrelated purpose (its own correction of a 7.6x figure derived from a convenient subset), so the two halves corroborate without sharing a method. `weightOf` prices both at 1.

**What that does to the partition, measured at `0820436cf`:** modelled loads are 1084 / 1080 / 1080 / 1078 — a **1.006x** spread, essentially perfect balance. Observed elapsed times on the same partition are 3310 / 3812 / 4180 / 5172 s — a **1.56x** spread. The optimiser is solving the wrong problem well.

**Why it is not repaired here, and this is a scope decision rather than a deferral of convenience.** Changing the weight function changes the LPT input, which repartitions EVERY surface at once. That invalidates every in-flight arc's shard assignment simultaneously — and this arc has already measured what a single enrolment does to the partition: adding one surface moved three others between legs. With four live arcs on the registry seam, a weight change is a fleet-wide disruption, and the imbalance is weeks old rather than urgent.

**Class-sweep exception:** (c) — the repair is a redesign of the cost model in a surface this PR does not otherwise touch, and its blast radius is every enrolled surface rather than the ones this PR names.

**What shipped instead, deliberately narrower.** `fix/mutation-shard-ceiling-pin` pins the job ceiling at `ceiling >= 2 x SHARD_BUDGET_SECONDS + a 300 s reporting reserve` (7500 s = 125 min today) in `_metaSourceShardIntegrity`, stated as a factor over the shared constant rather than as minutes. The reserve is not padding: the ceiling bounds the WHOLE job while the budget measures the leg's own stamp, so at exactly 2x a leg that fills its overrun allowance has zero seconds left to write and upload `elapsed.txt` and is cancelled with no record -- the same silence one step further along. That does NOT remove the imbalance; it guarantees the imbalance stays DIAGNOSABLE, by keeping the ceiling far enough above the budget that a breaching leg still finishes and reports instead of being cancelled into silence. Before it, 5400 s sat 228 s above the worst observed leg. Restoring the instrument was worth more than fixing one imbalance, because every other defect on this harness is diagnosed through it.

**First scheduled step:** measure per-surface seconds-per-boot directly from the elapsed artifacts the budget job already uploads, and decide whether the weight becomes a measured per-surface rate (accurate, but a committed table that goes stale — the failure mode this harness keeps hitting) or a derived proxy such as suite runtime (self-maintaining, less accurate). Do NOT land it while more than one arc holds the registry seam.

## BL-MUTATION-HARNESS-PR-TRIGGER-FANOUT — the harness's path-filtered PR trigger runs the whole matrix on every harness-touching PR, and those legs compete with that PR's own required checks

**Status:** OPEN. · **Filed:** 2026-08-16 (`docs/mutation-ledger-accuracy`, from the shipping arc of #834 — it existed only in that arc's handoff message until now) · **Severity:** MEDIUM (it does not fail anything; it delays the merge path for exactly the PRs least able to afford it) · **Class:** CI capacity · **Effort:** S

#834 split `mutation-harness` from ONE queued job into a matrix, and the same PR gave the workflow a path-filtered `pull_request` trigger. The trigger was right on its own terms — `workflow_dispatch` on a NEW workflow only works once the file is on the default branch, so a path-filtered PR run was the only way to validate the sharding against real Actions before merging it. What was not priced is the standing cost afterwards.

**Reachability: PROBED.** A harness-touching PR enqueues one job per matrix leg plus two cheap coordinators — `parser-shards` ×`PARSER_SHARD_COUNT`, `parser-gates`, `source-shards` ×`SOURCE_SHARD_COUNT`, `source-gates`, then `budget` and `notify`. **Measured 2026-08-16: 16 jobs, 14 of them full test legs** (8 + 1 + 4 + 1). The count is stated as a measurement with a date rather than as a property, because both shard counts are tunable and raising either makes the fan-out worse, never better. `SOURCE_SHARD_COUNT` is the live one: per the wallclock correction in `BL-MUTATION-HARNESS-WALLCLOCK-CEILING`, the binding leg was already at 93.2% of budget when it was measured at 29 surfaces, and a 30th has been enrolled since without ever being run — so the question is not whether a future enrolment will force the count up, it is whether the enrolment that already happened has done so, and nobody has measured. Measured consequence on the shipping arc itself: those legs occupied the account's queue alongside that PR's own required checks, and the arc CANCELLED its own harness run to get its required checks moving. The legs are long as well as numerous — on run 31989590619 the four source legs recorded 886 s, 2166 s, 3069 s and 3356 s, the eight parser legs 836 s to 1753 s, and on two earlier runs one source leg was cancelled at its 90-minute ceiling.

The filter is not loose by accident — it covers the eight parser shard files, the parser gates file, the whole `tests/mutation/**` tree, `lib/ci/shardBudget.ts`, `scripts/check-shard-budget.ts`, and both vitest wiring files, each for a stated reason. The problem is that harness work is precisely the work that edits those paths, so the arcs paying this cost are the ones iterating on the harness, repeatedly.

**Direction, stated not implemented** (the choice belongs to whoever owns the harness's CI shape): narrow the filter so that wiring-only or ledger-only edits do not fire the full matrix; or split the trigger by harness, so a `tests/mutation/**` edit fires the four source legs and not the eight parser ones; or move the shards to the nightly and keep only the gates files on PRs, which preserves the fast structural signal and drops thirteen legs. Any of them wants the `concurrency` cancel-in-progress behavior left exactly as it is.

## BL-REVIEW-ROUND-REPORT-TEST-TIMEOUT-GROWTH — a review-round test derives its expectation from main's merge log, so it slows down with every merge and will eventually time out

**Status:** OPEN. · **Filed:** 2026-08-16 (`docs/mutation-ledger-accuracy`, on behalf of #833, which reported it batch-wide and did not file it) · **Severity:** MEDIUM (a latent flake on a full local clone; CI is structurally immune) · **Class:** test durability · **Effort:** S

`tests/reviewRounds/report.test.ts` — the case `matches the live log when history is available` — builds its expectation by shelling out to `git log --merges --first-parent main --format=%s` (`tests/reviewRounds/report.test.ts:1263-1266`) and comparing it against `mergedArcs(process.cwd())`. Its cost therefore grows with main's merge history, permanently and in one direction, against the fixed `TEST_TIMEOUT_MS = 30_000` (`vitest.projects.ts:179`).

**Reachability: PROBED, twice, and the two measurements disagree — which is itself the finding.** #833 measured **27.6 s against the 30 s ceiling on an UNLOADED box**, and 43 s under contention, where it failed `test:fast`. A re-probe at 22:31 CDT on 2026-08-16, scoped to that one case, measured **19.18 s of test time** (`Duration 20.85s`, `1 passed | 41 skipped`) on a box with five arcs working. Two readings of one test, taken hours apart on the same day, disagree by more than 8 s: the surviving margin is somewhere between ~2 s and ~11 s depending on load, and no single number describes it. Both are recorded here deliberately, because a row claiming either one alone would misstate how load-sensitive the test is.

**Third measurement, 2026-08-19 (`fix/premisescan-nested-hook-sibling-leak`).** The walk is now at the ceiling on a LOADED box, and the same-machine differential shows the branch tipping it rather than the tree being at fault — which is what the growth half predicted:

```
mergedArcs()   origin/main   27863ms, 27738ms   -> test PASSES (41 passed)
               branch HEAD   29921ms, 29944ms   -> test TIMES OUT, 3 runs of 3
```

`git log` itself is 75ms and returns 824 first-parent merges on both sides (799 -> 803 -> 804 -> **824** across the three filings), and both trees report `recognized=823, unrecognized=1`. The arc contributes no merge commit, so its ~2.1s is the review-round rows it adds. **Main is at 93% of the cap and any arc adding corpus rows lands on the same edge.** That arc filed a duplicate row for this and removed it on discovering this one; the measurement is kept here, where it belongs.

**The growth is the durable half.** Main was at 799 first-parent merges when #833 measured, 803 ninety minutes later, and **804** at filing. The trend has no ceiling and no reset.

**Deriving the expectation is DELIBERATE and must not be undone by a careless repair.** The comment above the call says so in terms: "Numbers are derived from the live log, never from literals - a hardcoded 676 makes this a tripwire on the calendar instead of on the producer." A fix that hardcodes the count would trade a slow test for a test that fails on a date, which is the defect the current design already rejected.

**Not branch-attributable, and CI does not see it.** The input is the `main` ref, so no branch causes or fixes it, and `it.skipIf(isShallow)` (`tests/reviewRounds/report.test.ts:1262`) skips the case entirely on the depth-1 checkouts CI uses. It bites full local clones only — which is to say, it bites developers and agents, not the merge gate.

**The fix is a judgment call and is left open on purpose.** Raising the timeout for this case, bounding the walk to a window, caching the log per run, or restructuring what the case proves are all defensible, and they trade against each other differently depending on whether the point is the producer's correctness or its coverage of all history. **First scheduled step:** whoever owns `tests/reviewRounds/` picks between those, rather than the next arc that trips over it picking under time pressure.

---

### BL-SPECLINT-LINT-DRAFT-OUTSIDE-REPO — `spec:lint` refuses out-of-repo paths, so a draft written during a review freeze cannot be linted until it lands

**Status:** OPEN · **Severity:** LOW · **Class:** tooling reach · **Filed:** 2026-08-16 (`feat/orchestrator-pane-compaction`, spec round-economy filing) · **Effort:** S

**Probed, not theorized.** Invariant 11 puts every arc in a worktree, and the adversarial-review runbook freezes that worktree while a `codex-guard` dispatch is live — the wrapper reads the working tree, not the commit it was pointed at. The productive use of that window is drafting the next artifact in the session scratchpad. But:

```
$ pnpm spec:lint /private/tmp/claude-501/.../scratchpad/plan-draft.md
document is outside the repository: /private/tmp/claude-501/.../scratchpad/plan-draft.md
exit 2
```

So the draft cannot be checked until the freeze lifts and it is copied in, which is exactly when a defect becomes expensive.

**What it cost here.** All ten task markers in a plan drafted during the spec round-3 freeze had `ac=` before `why=`. The grammar is fixed-order — `red=` → `red-state=` → `red-target=` → `why=` → `ac=` (`lib/specLint/taskContract.ts:49-52`) — so every one would have returned `TASK_MARKER_MALFORMED` on the plan dispatch. They were caught by hand-matching the regex, which is the check `spec:lint` exists to make unnecessary.

**Why it is filed rather than fixed here.** Class-sweep disposition exception (c): the repair is to a surface this PR does not otherwise touch. It is also genuinely small — the checks that matter for a draft (task-marker grammar, numerics, copy, sections) are content-only; the citation checks are the sole part needing repo resolution, and they already resolve paths against the repo root rather than against the document. A `--content-only` flag, or resolving citations against the repo while accepting any readable path, would cover it.

**Reachability:** PROBED — the command above, on this branch, 2026-08-16.

## BL-SPECLINT-CITED-SYMBOL-EXISTENCE — spec:lint proves a cited FILE exists and stops there, so a cited symbol that does not can survive to dispatch

**Status:** OPEN. · **Filed:** 2026-08-16, from the review-round filing `docs/review-rounds/feat/mutation-section-order/40a7adfa5f29.md` (spec §, candidate a) · **Severity:** LOW (review-round cost; no product surface) · **Class:** review-round reduction (tooling) · **Effort:** S-M

**Probed, not theorized.** Three findings across two spec rounds of the field-near-miss arc were a cited symbol that does not exist at the cited path, while `spec:lint` passed on every one because the FILE existed: `parseEvent` (the export is `parseEventDetails`), a `broken` property on `GuardSurface` (no such field on the type), and a `ParseWarning` shape claim against `lib/parser/warnings.ts`. Each cost a round on an artifact whose own self-review rule already says "grep each cited name against the live codebase" — the rule binds the author's memory and nothing gates it.

**Work:** extend the spec:lint citation pass so a `file.ts:NN` citation naming an identifier in its surrounding prose also proves that identifier resolves at that path — a boundary-matched grep is enough for the measured misses, since all three were names that appear nowhere in the cited file. The `PROBE DOMAIN` is the live `docs/superpowers/specs/**` corpus; a citation whose identifier cannot be extracted unambiguously demotes to silence rather than firing, per the guard-narrowing rule.

## BL-SPEC-PROBE-RUNNABILITY — a committed `probes/*.ts` entrypoint can rot the day it lands and nothing executes it

**Status:** OPEN. · **Filed:** 2026-08-16, from the review-round filing `docs/review-rounds/feat/mutation-section-order/40a7adfa5f29.md` (spec §, candidate b) · **Severity:** LOW (review-round cost; the probes are evidence artifacts, not product) · **Class:** review-round reduction (tooling) · **Effort:** S

**Probed, not theorized.** Spec round 4 finding F5 of the field-near-miss arc was stale relative imports in a committed probe under `docs/superpowers/specs/parser/probes/`: the probe was the cited evidence for a spec claim and could not run as committed. The reviewer found it; nothing else could, because no step ever executes these files. Probes are the repo's answer to "settled by probe, not by argument" (the admissibility contract), so a probe that does not run degrades the mechanism the contract rests on.

**Work:** a CI or pre-dispatch step that executes every `docs/superpowers/specs/**/probes/*.ts` entrypoint and fails on a non-zero exit. Cheap because the set is small and the probes are self-contained by construction. Open question the implementing arc settles: whether a probe that needs a live DB or a network fixture declares itself skippable in a header line, or is moved out of the executed set.

## BL-REVIEW-BRIEF-BOUND-DRIFT — a repair narrows the artifact and the brief keeps scoring the old claim

**Status:** OPEN. · **Filed:** 2026-08-18, from the arc-D spec review train (`docs/review-rounds/fix/planlint-fixture-satisfiability/7d09a1f0ba41.md`, spec §) · **Severity:** MEDIUM (buys review rounds against a claim the artifact no longer makes; the findings are real against the brief and absent from the spec, so they cannot be refuted, only re-derived) · **Class:** review-round reduction (process) · **Effort:** S

**Probed, not theorized.** Arc D's spec narrowed twice under the repair-direction rule — round 4 deleted the `expect=` field, round 5 deleted the clean-observation branch — while bullet 1 of its review brief still read "Every ENROLLED block is passed clean … or declined with a surfaced `FIXTURE_PROBE_UNVERIFIED`", the pre-narrowing bound. A reviewer scores each round against the brief, so rounds 5 and 6 were judged against a WIDER claim the spec had stopped making. Both returned real findings against that wider claim; the orchestrator's ruling records the drift as the arc's one mechanizable cause and the reason "six rounds on one axis" understates how much of the count was self-inflicted.

The asymmetry is what makes it worth scheduling: a stale bound cannot be refuted by reading the spec, because the finding IS correct about the text the reviewer was handed. Only the brief's author can see the gap, and only if they think to look.

**Work:** make the brief's bound part of the repair commit rather than a later tidy-up. The cheap mechanical form is a diff-time check: a commit touching a spec's ratified bound section (the `§1.1` consequence-bound item) must also touch the bound bullet of any brief under `_briefs/` that targets that spec, or carry an explicit note saying why not. `_briefs/` is untracked per-machine scratch today, so the check either moves briefs into the repo or keys off the dispatch record in `docs/review-rounds/<branch>/<baseSha12>.jsonl`, which does track every dispatch and its stage — deciding which is the implementing arc's call.

## BL-SHRINK-SIZED-BY-HARNESS-CLOSURE — a hole-shrink list authored by hand is sized before the harness has been asked

**Status:** OPEN. · **Filed:** 2026-08-16, from the review-round filing `docs/review-rounds/feat/mutation-section-order/40a7adfa5f29.md` (diff §, candidate b) · **Severity:** MEDIUM (the wrong number reached a merged plan and was only corrected by a 2-hour harness cycle) · **Class:** mutation-harness process · **Effort:** S

**Probed, not theorized.** `tests/parser/mutation/knownHoles.ts` already carries branch 4's rule — size a shrink by the harness's own `fixedHoles` set, never by an operator's row count — and the `2026-08-08-parser-mutation-wave` plan shipped a hand-authored ten-id deletion list anyway. The measured closure was **86** holes: 24 `section-reorder` (the plan's ten a strict subset), plus 49 `blank-row`, 10 `header-typo` and 3 `merged-cell` that the arc was not aiming at, because position-blindness reaches every operator. The correction cost a full harness cycle and the arc's own review rounds carried the stale counts forward for three rounds.

**Work:** a plan-time step that runs the harness under `COLLECT_MUTATION_ALARMS` and derives the deletion list from `fixedHoles` BEFORE the plan names any id, so the authored list is a rendering of the measured set rather than a claim about it. The rule exists; only its ordering relative to plan authoring is unenforced.

### BL-CARVE-GUARD-SCANS-GITIGNORED-PATHS — a guard reds on files git cannot see, so the failure exists only on the author's machine

**Severity:** LOW (a FALSE POSITIVE that is local-only — CI never sees these paths, so it costs investigation time rather than correctness) · **Class:** guard premise / discovery scope · **Filed:** 2026-08-17 (`fix/premisescan-import-edges`, found while triaging a full-suite run during whole-diff round-1 repair) · **Effort:** S

**Probed, not theorized.** The `sheet-link phrase containment` guard walks the repo for non-exempt files importing from `tests/`. Its discovery does not consult gitignore, so an arc's own scratch under `.claude/` — a directory `.gitignore:55` excludes wholesale — is scanned like source:

```
$ pnpm vitest run tests/components/admin/sheetIconLinkContainment.test.ts
  AssertionError: expected [ …(4) ] to deeply equal []
  + ".claude/probe/mutateSurface.ts: non-exempt file imports from tests/ (carve laundering channel): …"
  + ".claude/probe/premiseScan827.ts: non-exempt file imports from tests/ (carve laundering channel): …"

$ mv .claude/probe /tmp/aside && pnpm vitest run tests/components/admin/sheetIconLinkContainment.test.ts
  Tests  7 passed (7)
$ mv /tmp/aside .claude/probe
```

`git check-ignore -v .claude/probe/mutateSurface.ts` -> `.gitignore:55:.claude/`. A fresh checkout has no such file, so the guard is green in CI and red for whoever is actually working on the surface — the inversion that makes it worth fixing rather than tolerating. The same discovery shape is likely shared by the other repo-walking containment guards; the repair is to filter discovery through `git ls-files` (or `check-ignore`) rather than a raw filesystem walk, which also makes the walked set the same set CI reviews.

**Not fixed in `fix/premisescan-import-edges`** under class-sweep exception (c): the repair is to a discovery helper that arc does not otherwise touch, and the sweep for peer guards sharing the walk is its own scope.

### BL-EXPORTRESOLUTION-SPREAD-NOT-RELITERAL — a caller rebuilds a union value by hand and drops a field, three times in three rounds

**Severity:** MEDIUM (each instance is a SILENT free — the dropped field is `reasons`, so the loss shows up as a missing explanation rather than a wrong verdict) · **Class:** guard fidelity / mechanizable review class · **Filed:** 2026-08-17 (`fix/premisescan-import-edges`, diff rounds 1 and 3) · **Effort:** S

**Measured, not theorized.** One defect, found THREE times across three review rounds at three different returns in `tests/mutation/source/premiseScan.ts`: diff R1 #2 caught the star loop's two returns, diff R3 #1 caught the E2 extent merge. Each repair fixed the instance in front of it; none derived the cover. `followForward` merges a hop's module reports into whatever it returns, so any caller that rebuilds an `ExportResolution` by hand — `{ kind: "extent", nodes: [...] }` instead of `{ ...via, nodes: [...] }` — silently drops `reasons`.

The derived enumeration exists now and took one grep:

```
$ grep -n 'kind: "extent"\|kind: "data"\|kind: "noSuchExport"\|kind: "unresolvable"' tests/mutation/source/premiseScan.ts
11 sites; exactly one had a `via`/`res` of the same type in scope
```

**The mechanical form:** a lint rule or structural test asserting that a site constructing a discriminated-union value, with a value of that same union in scope, SPREADS it rather than re-literalling. That enumeration is what should have existed at round 1, and it is a grep rather than a judgement — which is what makes this mechanizable rather than a review habit.

### BL-MUTATION-SITEID-LINE-KEYED-CHURN — every diff that moves lines invalidates the accepted-mutant ledger

**Severity:** LOW (pure bookkeeping — it never produces a wrong verdict, it consumes wall clock and reviewer attention) · **Class:** mutation harness ergonomics · **Effort:** S-M

**Measured.** `accepted` siteIds are `operator:LINE:COL:from>to`. On `fix/premisescan-import-edges` the two `premiseScan` equivalences were re-keyed FOUR times in one day — `601 -> 721 -> 604 -> 603` and `1752 -> 2061 -> 1864 -> 1872` — each discovery costing a ~8-minute gate cycle and each verification another. The expressions and their 1-based columns were byte-identical at every key; only the line moved.

The information to fix it is already in the failing run, and the two sets are complementary:

```
FAIL unaccepted-survivor: 2 survivor(s) with no ledger row: relational-boundary:604:29:>>>=, relational-boundary:1864:28:<><=
FAIL stale-ledger-row: 2 ledger row(s) whose site no longer survives: relational-boundary:721:29:>>>=, relational-boundary:2061:28:<><=
```

**Second incident, 2026-08-19, and it changes the severity argument** (`fix/premisescan-nested-hook-sibling-leak`, baseline gate run before any code edit). The same shape on a DIFFERENT surface, `destructiveFileAnalysis`, and this time **on `origin/main` itself** rather than under an in-flight diff — eight survivors and eight complementary stale rows, every pair one or two lines apart:

```
unaccepted-survivor: logical-connector:371:61:&&>||, logical-connector:388:32:&&>||, integer-literal:392:19:0>1,
  relational-boundary:392:27:<><=, integer-literal:392:47:1>2, relational-boundary:397:24:>>>=,
  logical-connector:503:73:&&>||, relational-boundary:626:29:>>>=
stale-ledger-row:    logical-connector:370:61:&&>||, logical-connector:387:32:&&>||, integer-literal:391:19:0>1,
  relational-boundary:391:27:<><=, integer-literal:391:47:1>2, relational-boundary:396:24:>>>=,
  logical-connector:502:73:&&>||, relational-boundary:602:29:>>>=
```

The filed severity is LOW on the grounds that this is bookkeeping that never produces a wrong verdict. That still holds per-run, but a red on MAIN is different in kind from a red under a diff: every arc that runs `pnpm mutation:guards` now inherits a failure it did not cause, must bracket it against main to prove that, and either scopes around it or repairs another arc's surface. The run that measured this took **4,489s**. Reachability is therefore no longer hypothetical for the cost claim — it is charged to every concurrent arc until main is green.

**The mechanical form:** key on the mutated EXPRESSION plus a disambiguator instead of the line, or have the gate emit a `--rekey` patch when the stale set and the unaccepted set are the same size and the expressions match. A third shape belongs here too, measured on the same arc: **removing dead code widened the mutation surface** — deleting an orphaned union variant forced a rewrite of its enclosing condition, and the natural rewrite turned a truthy numeric check into `carried.length > 0`, an operator where there had been none, producing a brand-new survivor. Nothing warned; the gate noticed one cycle later.

## BL-REVIEWROUND-CORPUS-REBASE-THRESHOLD — a mid-arc merge re-bases the round corpus and the threshold gate counts less

**Status:** OPEN. · **Filed:** 2026-08-20 (`feat/send-auth-single-read-lint`, closeout) · **Facing:** process · **Severity:** LOW-MEDIUM (no shipped defect; the gate under-reports an obligation) · **Class:** review economy · **Effort:** S · **Reachability:** PROBED — both corpus files are committed and the split reproduces from them.

Rounds are keyed `(branch, baseSha12)`, so merging `origin/main` mid-stage splits an arc's rounds across two corpus files while the `ROUND_THRESHOLD` gate counts per file. An arc can therefore sit below the trigger while genuinely owing a filing — **the gate stays green BY COUNTING LESS**, which is the fail-open direction.

**Incident:** this arc. Its four spec rounds sit 3 + 1 across `4b5028b446a4` and `03953337388b` after PR #854 merged mid-stage; the gate saw at most three and stayed green, and the filing at `docs/review-rounds/feat/send-auth-single-read-lint/4b5028b446a4.md` was written voluntarily rather than because anything demanded it. The same merge tripped the contiguity check, because the round after it was dispatched as `--round 4` into a base holding no rounds 1-3.

**Not repaired by this arc**, which owns a send-authorization lint rather than the round-economy gate.

## BL-SPECLINT-EXEC-RED-HEAVY-BLIND — the red-collection arm is silent on every `pnpm heavy` command

**Status:** OPEN. · **Filed:** 2026-08-20 (`feat/send-auth-single-read-lint`, closeout) · **Facing:** process · **Severity:** MEDIUM (a guard that passes unconditionally on the class of command the repo MANDATES) · **Class:** guard fidelity · **Effort:** S · **Reachability:** PROBED — isolated in four runs at plan time.

`spec:lint --exec-red`'s collection arm mints NOTHING for a `red=` wrapped in `pnpm heavy`: `deriveCollectionProbe` returns kind `none` and `collectionProbePlan` drops the marker (`lib/specLint/redContract.ts:721`), so it never enters the probe plan — **not even the `RED_PROBE_UNVERIFIED` advisory the same function emits for a probe it cannot derive.**

**That asymmetry is the difference between a gap and a bug.** The code carries a deliberate, named path for "I could not derive a probe for this", and the heavy-wrapped shape does not take it — an unclassified shape falling THROUGH the classifier, not an exemption anyone chose. Since `AGENTS.md` MANDATES `pnpm heavy` for every heavy phase, the arm is silent on exactly the class of command the repo requires to be wrapped, and silent reads as clean. This is `BL-GUARD-PREMISE-REACHABILITY`'s shape turned on a guard shipped to prevent it.

**Incident:** this plan's Task 8 red. Wrapped per the heavy rule, the originally drafted command exited 0 on the live tree — green from birth, no later edit could ever have made it fail — while `pnpm spec:lint --exec-red` reported nothing about it. It was found by running the command by hand. Isolated in four runs: the bare form and the env-var-prefixed form both FAIL `RED_COLLECTS_NOTHING`; both `pnpm heavy` forms are silent. So neither the `NIGHTLY_ONLY_EXCLUDES` shape nor the env prefix is the cause — the wrapper is.

**Not repaired by this arc**, which owns the lint's subject rather than the lint.

## BL-REVIEWROUNDS-REPORT-RACY-DUAL-GIT-READ — an equality between two non-atomic reads of mutable shared state

**Status:** OPEN. · **Filed:** 2026-08-20 (`feat/send-auth-single-read-lint`, closeout) · **Facing:** process · **Severity:** MEDIUM (it makes a whole-suite run unreliable on a shared checkout, and a known-spurious failure MASKS a real one) · **Class:** test determinism · **Effort:** S · **Reachability:** PROBED — reproduced twice and isolated once on the same tree.

`tests/reviewRounds/report.test.ts:1262` asserts equality between two NON-ATOMIC reads of mutable shared state: `expected` comes from a live `git log --merges --first-parent main` in the test body, and the left side from `mergedArcs()` shelling out to git independently. Nothing serialises them, so a merge or fast-forward landing between the two reads fails the assertion against a tree that is perfectly correct. **Racy by construction, not flaky by accident.**

**Incident:** 2026-08-20, TWICE, during this arc's Task 1 fixture-collision cover. It failed inside the whole-suite run at 42.8s, then again at 58.9s on a tree differing from the first only by a markdown heading, while every other suite passed. Isolated immediately: the same case PASSED in 21.5s on the same tree, and `main`'s unit-suite was green in CI the same morning (run 32336060812). Five arcs were pushing to the shared repo. Cost: one triage cycle plus a killed and restarted 20-minute whole-suite run — and it means a whole-suite run cannot be relied on to go green on this machine while other arcs push.

**Why a row rather than a shrug.** A test known to fail spuriously gets filed as "the known flake" and then MASKS a real failure on the same assertion — the counts genuinely disagreeing is exactly the defect it exists to catch.

**Do NOT loosen the assertion** — an equality that tolerates drift stops catching the real case. Take both counts from ONE git invocation, or resolve `main` to a sha once and read both sides at that sha.

**Not repaired by this arc**, which owns a send-authorization lint rather than the round-corpus reporter.

## BL-ENROLLED-SUITE-PLACEMENT-METATEST — a test that names an enrolled surface must be in its suitePaths

**Status:** OPEN. · **Effort:** S — a filesystem-walking meta-test in the shape of the existing
mutation-surface registry, gated on how many current files would need an exemption row.

Eight surviving mutants in round 2 of `feat/orchestrator-pane-compaction`
existed because the assertions covering them lived in
`tests/paneCompaction/adapter.test.ts`, which is not among that surface's
`suitePaths`. They ran, they passed, and they contributed nothing to the score.

**Probed, not theorized.** Moving the same assertions into an enrolled suite
killed all eight with no change to the assertions themselves.

**Why it recurs.** Nothing signals the omission: the suite is green, the tests
are real, and the only symptom is a score that will not move for reasons the
author cannot see. Mechanizable as a meta-test — a test file importing an
enrolled surface's exports is either listed in that surface's `suitePaths` or
carries an explicit exemption comment, the same fail-by-default shape as the
mutation-surface registry.

**First scheduled step:** measure how many existing test files would need an
exemption row, since a rule that starts with a large exemption list is a rule
nobody trusts.

## BL-PANE-COMPACTION-SEND-AUTHORIZATION — the pane-compaction send path needs its own arc

**Status:** OPEN. · **Effort:** L — an authorization redesign plus its own review arc; five diff
rounds could not close it as a sub-part of the classifier PR.

`pnpm panes:compact` ships with `--checkpoint`, `--compact` and `--resume` DISABLED. The classifier
and the read-only surfaces (default report, `--check`, `--json`) ship enabled and mutation-scored.
The three sending modes refuse before any observation and name this row.

**Which deferral exception applies: (c)** — a redesign of a surface the PR does not otherwise
settle. Not "same defect, different file": the send path needs an authorization model, and five
adversarial rounds demonstrated that it does not converge as a sub-part of this diff.

**Reachability: PROBED, repeatedly, by the reviewer.** Every one of these exited 0 and SENT bytes
before its repair:

- `--compact` authorized against a nonce captured before revalidation (AC-19).
- Revalidation compared only the verdict, so a purview TRANSFER passed through (AC-13).
- Revalidation ran against the ORIGINAL roster, freezing rules 1, 2, 5 and 7, so a takeover
  swapping `agent_session` was invisible (AC-17).
- The marker was read TWICE per authorization, so a `sessionId` change between the two reads
  preserved the nonce and passed rule 5 on the stale copy (AC-13/AC-17).
- `--checkpoint` and `--resume` never revalidated at all: they observed once and then sent, so a
  marker that changed in between was never seen (§6 guarantee 1).
- A labelled non-arc was driven and a checkpoint SENT to an orchestrator pane (AC-16).

**Why this is a row and not more rounds.** Findings per diff round were 9, 5, 4, 4, 4 — flat, with
a P0 in every round, and from round 3 on every P0 was in this path. The round cap is 4. Decisively,
**two repairs introduced the following round's defect**: one added dead code the mutation gate
caught, and one made a refusal LIE — roster disappearance encoded as a stale report with a null
nonce, refusing with "marker carries no checkpointNonce" while a matching nonce sat in the marker,
which would send an operator to re-checkpoint a pane that no longer exists. That is the ratchet: each
repair is a bigger target for the next round.

**First scheduled step:** decide the authorization model before writing code — specifically whether
one atomic snapshot per authorization is sufficient, or whether the target must acknowledge before
any byte is sent. Every defect above is an instance of "the decision and the send were separated by
a window", and four incremental repairs narrowed that window without closing it.

**Evidence:** the round-economy filing at
`docs/review-rounds/feat/orchestrator-pane-compaction/7d332074ec97.md` carries the full round-by-round
account. The adapter-level tests for the send path were removed when the fence landed and are
recoverable from git history on this branch; restore them with the arc rather than rewriting them.

## BL-CODEX-GUARD-SPECLINT-PREDISPATCH-GATE — a dispatch spends reviewer attention on lint the wrapper could have refused

**Status:** OPEN · **Severity:** LOW (no shipped defect; this is review-economy waste) · **Class:** review tooling / dispatch hygiene · **Effort:** S · **Filed:** 2026-08-18 (`fix/control-outline-border-token`, spec review R1 F2 + R2 F5) · **Facing:** process · **Class-sweep exception:** (c) — the repair is a change to `scripts/codex-guard.mjs`, a surface this arc does not otherwise touch · **Reachability:** PROBED — both incidents are committed corpus rows, and the failing lint reproduces on the pre-repair blobs.

`node scripts/codex-guard.mjs review` already refuses a round-1 `--stage diff` brief whose `GUARD SURFACE:` line carries no mutation score, exiting 2 before any dispatch. It makes no equivalent check on the ARTIFACT under review. So a spec or plan carrying hard `pnpm spec:lint` failures dispatches normally, and the reviewer spends a finding — and the arc spends a round — on a class the repo already detects mechanically in under a minute.

**Incident.** This arc, twice. Spec review R1 F2 reported **18 hard citation failures** (all the empty-path `` `:213` `` form) against `docs/superpowers/specs/2026-08-18-control-outline-border-token-design.md`; R2 F5 reported **13 more** in the sibling probe record. Both were `CITATION_MALFORMED`, both are what `pnpm spec:lint` prints, and neither needed a reviewer to find. Corpus rows: `docs/review-rounds/fix/control-outline-border-token/2ddbf038bdf4.jsonl`, rounds 1 and 2. Two findings out of sixteen across four rounds — roughly an eighth of the arc's total reviewer attention — spent on a mechanical class.

**Shape of the repair.** In `review`, when `--stage` is `spec` or `plan`, resolve the artifact path(s) the brief cites, run the existing lint, and exit 2 naming the failing file and count if any HARD failure is present. Advisory failures do not block — the probe-record artifacts show advisory noise is normal and blocking on it would be its own waste. The escape hatch matches the existing ones in that script (an explicit flag), because a brief may legitimately review an artifact that is mid-repair.

**Why the wrapper and not a habit.** The habit is already written down and was not followed on this arc by the session that wrote this entry. `codex-guard` is the single choke point every dispatch passes through, which is exactly why the mutation-score check lives there rather than in a checklist.

**First scheduled step:** confirm the lint's exit contract is stable enough to gate on (it currently exits 1 on hard failures and prints a `summary: N hard, M advisory` line), then add the check beside the existing `GUARD SURFACE:` refusal so both live in one place.

## BL-SPECLINT-ORPHANED-TASK-MARKERS — a plan whose markers sit outside a region lints as `0 hard` while checking nothing

**Status:** OPEN · **Severity:** MEDIUM (no shipped defect; the gate reports a pass over an empty set, which is the failure mode `spec:lint` exists to prevent) · **Class:** spec-lint grammar / review tooling · **Effort:** S · **Filed:** 2026-08-19 (`fix/premisescan-nested-hook-sibling-leak`, spec review R2 F1) · **Facing:** process · **Class-sweep exception:** (c) — the repair is an arm inside `lib/specLint/`, a surface this arc does not otherwise touch · **Reachability:** PROBED — the reviewer's own probe reproduces, and both figures come from data the linter already computes.

`taskTopology` (`lib/specLint/taskContract.ts`) enrols a `<!-- task: … -->` marker only when it is owned by a `<!-- tasks: depth=N red-contract -->` region (`lib/specLint/taskContract.ts:28`). A plan carrying markers and no region therefore enrols ZERO of them, every red-contract check is skipped, and `pnpm spec:lint` prints `summary: 0 hard` — indistinguishable from a plan whose contract genuinely passes. Nothing compares the two counts, though the linter has both.

**Incident:** This arc, spec round 2 finding 1. The plan at `docs/superpowers/plans/2026-08-19-premisescan-nested-hook-sibling-leak.md` carried seven markers and no region; the author read `0 hard` as a pass and dispatched. The reviewer's probe:

```text
taskRegionLines=0 taskMarkers=7
line 30 parsed=null
line 152 parsed=null
```

Two of those markers additionally carried `red-state=pre-existing-green`, which the grammar does not accept (`lib/specLint/taskContract.ts:49` allows only `live|authored`) — and the malformed-state check never ran either, for the same reason. One full spec round on this arc is attributable to the shape. Corpus row: `docs/review-rounds/fix/premisescan-nested-hook-sibling-leak/a85ccd453103.jsonl`, round 2; filing: the sibling `.md`.

**Shape of the repair.** An advisory — `TASK_MARKERS_UNENROLLED` — emitted when a plan's marker count is positive and its red-contract region extent is zero, naming the marker lines that parsed to nothing. Advisory rather than hard, because a document may legitimately quote a marker as an example; the existing use-versus-mention handling in the citations arm is the precedent. It is a comparison of two numbers the topology pass already returns, not new parsing.

**First scheduled step:** confirm `taskTopology` exposes both figures on the same call (it returns `extents` and the marker list), then site the advisory beside the existing region checks so a reader finds all of them together.

## BL-SPECLINT-RED-TARGET-CANNOT-NAME-A-REPO-ROOT-SURFACE — a plan whose production surface is a root file silently under-covers its own red contract

**Status:** OPEN · **Severity:** LOW-MEDIUM (no shipped defect; it produces silent under-coverage of a TDD gate) · **Class:** spec-lint grammar / review tooling · **Effort:** S · **Filed:** 2026-08-18 (`fix/control-outline-border-token`, plan review R1 F4 fallout) · **Facing:** process · **Class-sweep exception:** (c) — the repair is a grammar change to `lib/specLint/`, a surface this PR does not otherwise touch · **Reachability:** PROBED — both rejected forms reproduce, transcript below.

`red-target=` in a `<!-- task: ... -->` marker cannot name any repo-ROOT file. Probed on the live tree against `DESIGN.md`:

```
red-target=`DESIGN.md:227`     -> RED_TARGET_INVALID: bare-filename shorthand is not legal in a marker; use the full path
red-target=`./DESIGN.md:227`   -> RED_TARGET_INVALID: illegal path
```

The cause is `lib/specLint/citations.ts:55` — `const bare = !prefix.includes("/")` — so "full path" means "contains a directory separator", which a root file can never satisfy, and the dot-slash form that would satisfy it is rejected as illegal.

**Incident.** This arc. Two of its TDD tasks change `DESIGN.md`, so neither could carry an honest marker and both were moved outside the red-contract region. `pnpm spec:lint --exec-red` consequently validates four tasks where the plan describes six as test-first.

**Why the workaround does not close it, and this is the whole reason the row exists.** This arc DISCLOSED the exclusion in two sentences in the plan. That depends on the author noticing. An author who does not notice simply leaves the tasks out of the region and ships a plan whose `--exec-red` validates less than the plan claims — **silent under-coverage, with no signal anywhere**: the lint is green, the region is well-formed, and nothing reports that two tasks opted out.

**It is a recurring class, not a one-off.** Every repo-root file is affected, and plans legitimately target several: `DESIGN.md`, `AGENTS.md`, `BACKLOG.md`, `PRODUCT.md`, `package.json`. Any arc whose production surface is one of them meets this.

**First scheduled step:** widen the grammar to accept a repo-root form — either treat a tracked root-relative filename as non-bare when it resolves, or accept an explicit `./` prefix — and add the marker-level case to the spec-lint suite. A second, cheaper half worth doing either way: emit an advisory when a plan contains a red-contract region AND `##`-level tasks outside it, so an unnoticed opt-out is at least visible.

## BL-CONTROL-OUTLINE-SHAREHUB-MOBILE-SKIN-WEIGHT — one control paints 3.35:1 on desktop and 1.27:1 on a phone

**Status:** OPEN · **Severity:** LOW-MEDIUM (a resting boundary at 1.27:1 below 640px, on a control that measures 3.35:1 above it) · **Class:** visual boundary / DESIGN scope · **Effort:** S · **Filed:** 2026-08-18 (`fix/control-outline-border-token`, spec §3.5) · **Facing:** product · **Class-sweep exception:** (b) — a ratified scope decision fences it, and there are TWO of them, one executable · **Reachability:** PROBED — both figures measured from the runtime tokens, and the cascade behaviour read out of the live class strings.

`components/admin/showpage/ShareHub.tsx:781` and `components/admin/showpage/ShareHub.tsx:817` carry `max-sm:border-border`. A `max-sm:` prefix is a RESTING outline below 640px — unlike a `hover:` prefix, which is a state cue and is correctly outside every control-outline cover.

`:781` is the sharpest instance in the repository. Both of its ternary arms ALREADY carry `border-text-faint` from the 2026-08-16 swap, and `max-sm:border-border` wins the cascade below 640px, so **the same button paints 3.35:1 on a desktop viewport and 1.27:1 on a phone**. `:817` is a four-path element with different figures: its two open paths are `bg-surface-sunken` at **1.15:1 light / 1.38:1 dark**, and its two closed paths are `bg-transparent`, so both edges of the outline are whatever ground the kebab is rendered on and no static figure applies.

**Why it is filed rather than swept, and the reason is not "same defect, different file".** Two independent ratifications fence it:

1. **A design ratification.** The in-file comment at `components/admin/showpage/ShareHub.tsx:798` cites `spec 2026-07-24-strip-mobile-stacked-band §3 R3` — "border color drops to `border-border` below sm (the §3 R3 skin; width stays 1px)".
2. **An executable ratification, which is the load-bearing one.** The case NAMED `keeps max-sm:border-border on BOTH ShareHub ternary arms` in `tests/styles/_metaControlOutlineFill.test.ts` is a shipped pin whose stated purpose is that this exact token survives; its docstring records that a plan review probed corrupting both tokens and found the rest of the suite stays green while the responsive treatment is silently gone. (Cited by NAME, not by line: the 2026-08-18 arc's own Task 1 shifted it from `:156` to `:286`.)

Swapping here would mean editing that pin to assert the opposite of what it was written to catch — the shape where a guard is rewritten to match the change it exists to detect.

**First scheduled step:** decide whether `DESIGN.md` §1.2a's control-outline rule supersedes the §3 R3 mobile skin. If yes, the repair is two token edits plus a matching update to the pin, landing together.

## BL-VERIFICATION-BLOCK-FAILS-OPEN-ON-UNREADABLE-INPUT — a plan's verification commands report PASS when they could not look

**Status:** OPEN · **Severity:** MEDIUM (a verification block that cannot distinguish success from blindness certifies nothing, and the plans that carry them are the ones gating merges) · **Class:** plan authoring / verification hygiene · **Effort:** S · **Filed:** 2026-08-18 (`fix/control-outline-border-token`, plan review R6 F2) · **Facing:** process · **Class-sweep exception:** (c) — the repair is a lint arm over plan prose, a surface this PR does not otherwise touch · **Reachability:** PROBED — both failure modes reproduced by the reviewer against the shipped block, transcripts below.

A plan step that verifies something with a shell pipeline usually prints a count and compares it by eye. Probed against this arc's own Task 7 block, **that shape cannot tell success from inability to look**:

- a MISSING ledger file makes `grep` error to stderr while `wc -l` still prints `0`, and the pipeline exits **0**;
- an INVALID git object prints `fatal: invalid object name`, then `0`, and also exits **0**.

In both cases the expected-success output (`0`) and the could-not-look output (`0`) are byte-identical, so the check certifies nothing while reading as green.

**Incident.** This arc shipped three such blocks in its plan and they survived five review rounds before R6 probed them. They were repaired to emit an explicit PASS/FAIL, exit 1 on failure, and validate their reads BEFORE taking any count — and the repair was verified in both directions, with a constructed duplicate id making the check print FAIL and exit 1.

**Shape of the repair.** A `spec:lint` arm over plan prose: a fenced `sh` block inside a step whose text claims verification should either emit an explicit verdict token (`PASS`/`FAIL`) or set `-e`/`-o pipefail` and be reachable by a non-zero exit. Advisory first, since the corpus will have many pre-existing blocks.

**First scheduled step:** measure how many existing plan steps carry a bare-count verification block, from `docs/superpowers/plans/**`, before choosing advisory versus hard — the count decides whether this can ever be a hard arm.

## BL-IMPECCABLE-DETECTOR-FALSE-CLEAN-ON-FILE-LIST — the UI quality gate's detector reports clean when it could not read the files

**Status:** OPEN · **Severity:** MEDIUM (a shipped quality gate whose false-clean is byte-identical to a real clean, used by every UI arc in this repo) · **Class:** review tooling / gate fidelity · **Effort:** S upstream, S for a local wrapper · **Filed:** 2026-08-18 (`fix/control-outline-border-token`, invariant-8 gate) · **Facing:** process · **Class-sweep exception:** (c) — the repair is to a vendored plugin script this PR does not otherwise touch · **Reachability:** PROBED — transcript below, reproduced twice.

`scripts/detect.mjs` is the deterministic half of `/impeccable critique`, and invariant 8 makes that gate mandatory for every UI surface. **Passed an explicit list of files it prints a warning to stderr and then reports clean on stdout, exiting 0.**

```
$ node …/skills/impeccable/scripts/detect.mjs --json <26 changed .tsx paths>
Warning: cannot access <every one of the 26 paths>
[]
exit=0

$ node …/skills/impeccable/scripts/detect.mjs --json app components
[ …24 findings… ]
exit=2
```

Both runs were from the repo root with the paths valid and readable; relative and absolute forms behave identically. The tool takes DIRECTORIES. Passed anything else it does not error — it returns the same `[]` and the same exit 0 that a genuinely clean scan returns.

**Incident.** This arc's invariant-8 gate ran the file-list form first and would have recorded "detector clean on the diff" — an honest-sounding, false statement in a tracked gate record that a later reviewer would have had no way to distinguish from a real result. It was caught only because the run was repeated with directories, which is not a step the skill's reference prescribes.

**Not a deferred defect of this arc.** The 24 findings the correct invocation returns are all pre-existing on surfaces this branch does not modify (20 `broken-image`, 2 `side-tab`, 2 `overused-font`), and **zero** touch a file it changed. The row is about the TOOL's failure mode, not about work being deferred.

**Third instance of one shape on this arc**, which is why it is filed rather than noted: `BL-VERIFICATION-BLOCK-FAILS-OPEN-ON-UNREADABLE-INPUT` covers plan verification blocks, and an earlier bare `grep -c` in this arc's own plan had the inverse defect (a SUCCESSFUL check exiting 1). Same carelessness, both directions, now in a shipped tool.

**Shape of the repair.** Upstream: exit non-zero when a requested path could not be read, so inability-to-look is never spelled the same as nothing-found. Locally, cheaper and available now: a wrapper that refuses a non-directory argument, or an invariant-8 checklist line requiring the directory form and a non-zero exit before "detector clean" may be recorded.

**First scheduled step:** confirm the behaviour against the current upstream release, then decide wrapper-versus-report — a local wrapper is worth it either way, since this repo's gate cannot wait on an upstream fix.

## BL-SPECLINT-SELFLINT-NOT-IN-PREDISPATCH-GATE — a plan declares its own lint obligation in prose, so nothing runs it

**Status:** OPEN · **Filed:** 2026-08-21 (`feat/speclint-red-reason-verification`, from that arc's diff round 3) · **Facing:** process · **Severity:** LOW (it costs review rounds; it ships nothing wrong) · **Class:** spec-lint gate · **Effort:** S

**Incident:** diff round 3 on `feat/speclint-red-reason-verification` spent a finding on the plan failing its OWN `spec:lint`. The corpus row is `docs/review-rounds/feat/speclint-red-reason-verification/c9c71b947a85.jsonl`, `diff` round 3, `findingCount` 2. A cross-model reviewer, dispatched to attack the shipped behaviour, was instead spent running a lint the arc had already committed to running. The round also carried a second finding, so the round is not chargeable to this gap alone; the reviewer attention is.

**Probe:**

```
node --import tsx scripts/spec-lint.ts --json docs/superpowers/plans/2026-08-21-speclint-red-reason-verification.md
CITATION_MALFORMED at line 72: malformed citation `:837` (empty path)
```

The failing line was the sentence announcing that a stale citation had been REMOVED, which reproduced it while saying so. That is the shape worth noticing: the defect was in prose whose entire subject was the defect.

**Why prose was not enough.** That plan declares a pre-dispatch lint obligation in a sentence, and it also declares two oracles, `pnpm probe:citations` and `pnpm probe:reach`. Both oracles ran at every gate on that arc, several times each, because they are COMMANDS someone types. The lint obligation ran zero times, because it is a paragraph. The arc's own §3 makes the same argument about re-reads ("the re-read is a COMMAND, not a habit") and then left this one a habit.

**Shape of the repair.** The plan and spec self-lint belongs in whatever pre-dispatch step already runs the arc's oracles, so a `fail`-severity finding in either document blocks a review dispatch the way an unreadable citation does. Cheapest form: one line in the arc's verification block, next to the existing oracle invocations. It is deliberately NOT a new mechanism, and deliberately not a widening of `spec:lint` itself.

**First scheduled step:** decide the home — the invariant-8 style closeout checklist, or the codex-guard brief preflight, which already refuses a dispatch on a missing `GUARD SURFACE:` arm and is the closest existing gate in kind.

## BL-SPECLINT-DOC-BARE-LINE-NUMBERS-UNCOVERED — a document's raw line numbers rot where the citation oracle cannot look

**Status:** OPEN · **Filed:** 2026-08-21 (`feat/speclint-red-reason-verification`, from that arc's diff rounds 2 and 5) · **Facing:** process · **Severity:** LOW (prose rots; nothing ships wrong) · **Class:** spec-lint gate · **Effort:** S

**Incident:** THREE diff rounds on one arc, on one vector. `probe:citations` derives its population as `path:line` citations into a named file and is complete over it. A bare `line 742`, or a fenced movement table whose entire content is line numbers, carries no path, so the oracle cannot see it and reports OK while the document states something false. Round 2 found a bare prose instance, round 5 found a fenced-table instance claiming HEAD. Corpus rows: `docs/review-rounds/feat/speclint-red-reason-verification/c9c71b947a85.jsonl`, `diff` rounds 2 and 5. The limit was DECLARED in that plan's §3 and in the PR body before either round found an instance, so this is a known blind spot producing repeat findings, not a surprise.

**Probe.** A derived cover over both documents, rather than the regex sweeps that missed instances two rounds running:

```
redContract.ts has 965 lines; scanning both docs for integers in [500,965]
32 candidate(s)
```

Each candidate resolves to the line it names, so a human can separate a live claim from a historical one. Run after the round-5 repair, all 32 classify as correct: derived §0 table rows, explicitly historical narrative, quoted past values, or the two snapshot blocks now bound to a named commit.

**Why not teach the oracle.** Parsing prose for line references is recognizer growth on a doc scanner, which this repo has measured as the losing move, and the arc's own review rounds are the measurement. The narrowing repair is a PROHIBITION rather than a recognizer: a raw line number for a tracked file may appear only inside the derived table, or inside a block explicitly bound to a named commit. That is a scan for integers in a numeric range plus a location test, and it needs no grammar.

**Three repair shapes were used on this arc and only two are durable.** Symbol-naming retires the site (best, but impossible for a table whose content IS line numbers). Binding the block to a named commit makes it permanently true (used at round 5). Re-pointing the number resets the clock and is the losing move; it was declined every time.

**First scheduled step:** decide whether the prohibition lives in `probe/citations.mts` as a second assertion or in the pre-dispatch gate alongside `BL-SPECLINT-SELFLINT-NOT-IN-PREDISPATCH-GATE`, which shares an owner and a trigger point.
