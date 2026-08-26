# BACKLOG

Speculative / lower-priority hardening items. "Might do" — not blocking, no concrete near-term trigger. (Contrast `DEFERRED.md`: "will do, concrete trigger".)

**This file is the OPEN queue only.** Resolved / shipped / superseded entries live in **[BACKLOG-archive.md](./BACKLOG-archive.md)** with full provenance — grep by id, ids are unchanged. When an item below ships, move its whole entry there rather than annotating it resolved in place; otherwise this queue silently turns into a changelog.

Last reconciled: 2026-08-22 — `docs/derived-numbers-provenance` graduated `BL-DERIVED-NUMBERS-IN-DOCS-ROT` as a CONVENTION with no test, and the count the row scheduled as its first step sharpened the row's own prescription. The row asked that a figure carry its producing command or be script-assembled; that is NOT sufficient, because a command says how a figure was derived and not what from, and a command run against a moving tree answers differently tomorrow. The corpus supplied the counterexample: `2026-08-16-timing-scan-binding-probes.md` anchors every probe in it to `origin/fix/scanner-scope-totality` and prints the `git show` that materialises the scanner from it — a producing command, exactly as asked — and names no sha; that branch has since been deleted, so the record names nothing a reader can fetch. What ships is a `## Stating a figure` section requiring an IMMUTABLE anchor, plus the census script as apparatus wired into no gate. No test, and measured rather than argued: the sketched gate reds 23 times at base `b52481446` with at least 15 of those on lines that state no artifact figure at all, and it enforces the WRONG RULE — it demands a producing command, and a producing command is not a binding — while being blind to the one record the anchor screen flags. The classification the row asked for is also not mechanizable: three variants of one token-matching heuristic give 31.7%, 59.7% and 35.1% with 653 of the best variant's 725 hits below 100 where collision is expected, and the record scoring zero under every variant turns out to be one of the best-provenanced in the corpus, binding by blob hash and indented transcript. Two of this arc's own first-draft claims were overturned in review and are recorded rather than quietly fixed — a 1127-vs-1173 file count called live rot before reading that record's header, and a tenfold probe-versus-ledger provenance ratio WITHDRAWN because the instrument's bias is not constant across the two genres. The ledger population still gets an owner, `BL-LEDGER-FIGURE-PROVENANCE`, resting on the three incidents that happened there rather than on a number, with its overlap against `BL-CLOSEOUT-COUNT-PROSE-DRIFT` allocated by a stated rule: the owner is the document a figure is STATED IN. Prior: 2026-08-17 — `fix/shell-binding-mixed-quoted-value` graduated `BL-SHELL-BINDING-MIXED-QUOTED-VALUE`: the psql guard's assignment family reads LEXED WORDS now, and the quoting-position regex family is deleted rather than widened — declaration keywords and whole-argument quoting needed no grammar at all once words existed. The lexer had to become bash-faithful first (four escape fixes shipped as one class), which closed an R40-era documented limit as a by-product. Whole-diff review then found the repair's own class twice, both REGRESSIONS against the retired patterns and both repaired in-branch: compound-array values, and assignments inside a nested substitution body — the second a FALSE CERTIFICATION rather than a miss. Two peers are filed with their class-sweep exception named. Prior: 2026-08-17 — `fix/mutation-child-lifetime` graduated `BL-MUTATION-CHILD-LIFETIME-PARENT-DEATH`: mutation-harness children are now bounded in BOTH directions — by the parent's wall-clock ceiling while it lives, and by a perl supervisor's `getppid()` watchdog once it does not, which SIGKILLs the whole process group within one 0.5 s poll of the harness dying. The entry's own first scheduled step was answered NO and that is the load-bearing correction: the watchdog does NOT make `setpgrp` unnecessary, because the group serves the parent-ALIVE hazard and is also how the watchdog delivers its own kill, so the repair composes rather than simplifies. `childRun`'s sibling gap went with it — its `status ?? 1` catch turned a signal-killed fixture into exactly `1`, which the premise contract reads as PROVEN, and abnormal outcomes now throw. The new module is enrolled at 12/12 with an empty ledger and `scoreFloor: 1`, while the watchdog string itself is honestly CANNOT-EXPRESS (no declared operator rewrites string content) and is guarded by a live process-tree suite kept OUT of `suitePaths` so the per-mutant gate cost stays flat. Prior: 2026-08-16 — `test/execution-methods-driver-derived` graduated `BL-EXECUTION-METHODS-DERIVED-FROM-DRIVER-TYPES`: the query-submitting core of the destructive-file analyzer's `EXECUTION_METHODS` is now DERIVED from the installed postgres.js driver's own type declarations through a committed generated module, with freshness armed both locally (a `pretest-gen` MANIFEST row) and in CI (an x-audits step that fails on a stale COMMIT). The composed set did not move — the same ten members ship — because the deliverable is drift visibility, not a different answer. The entry's own equality claim turned out to be FALSE under probe and the correction is the load-bearing part: the rule yields FOUR members, not ten, so what ships is the IMPLICATION (every method typed as returning `PendingQuery`/`PendingRequest`/`ListenRequest` is an execution site) and the other six are hand-justified with per-member citations rather than contorted into derivation theater. The surface was enrolled in the source-mutation gate BEFORE the first diff-review round and scores 11/11 with an empty ledger — its one enrolment-run survivor was repaid with a fixture, not blessed — which matters because this row exists precisely to record what that gate cannot see: the surface sat at 1.00 with zero unaccepted survivors while `.file()` was missing from the set, since a missing member of a `Set` literal is not a mutation of code that exists. Prior: 2026-08-16 — `test/psql-scan-mutation-enrolment` graduated `BL-PSQL-SCAN-MUTATION-ENROLMENT`: the psql startup-file scanner is enrolled in the source-mutation registry at `scoreFloor` 1.00 with an empty unaccepted-survivor set — 48 mutants, 30 killed, 18 equivalent, 0 accepted-gap. The row's own four starters were corrected by measurement rather than argument, in both directions: the `token.length > 1` starter is a coverage gap but NOT a source defect (the original already reads a bare `-` as the DBNAME positional), and the `{1,2}` flag-regex starter turned out to be three sites with two answers — two killed, and one equivalent because its follower character class already contains a dash. `scan.ts` itself is untouched by the arc, which is the outcome the spec's original-misbehaves bar was written to produce. Both cross-model review rounds refuted a written argument with a probe it had never been checked against, and each refutation became a test rather than a re-argued row — which is why the surface ships with no accepted gap at all. `BL-SHELL-BINDING-MIXED-QUOTED-VALUE` and `BL-PREMISE-SCAN-DESCRIBE-LOCAL-EXTENTS` are filed in the same PR. Enrolment also caught the guard catching its own paperwork — quoting concrete shell spellings in `registry.ts` made that tracked file a reported psql binding. Prior: 2026-08-15 — `feat/mutation-playwright-component-mode` graduated `BL-MUTATION-HARNESS-PLAYWRIGHT-COMPONENT-MODE` and `BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT`, closing a circular wait: the enrolment row sat at WATCH on a trigger — "the harness gains a Playwright/component-mutant mode" — that no ledger row scheduled until the sibling was filed, and both closed in the arc that built the mode. The harness gained a browser-mutant mode (explicit per-surface edit lists, a serial runner with baseline and control brackets, three overlay layers driven by ONE env var, and a nightly non-required CI job), and its first customer enrolled at 19/19 killed, score 1.0, empty unaccepted-survivor set, control killed, targets byte-identical — 19.1 min in CI against a 60-min cap. The operator family is CLOSED and hand-enumerated rather than a generic recognizer, ratified up front because each widening of a recognizer is a bigger target for the next review round. Verdict integrity is the part neither row anticipated: a non-zero child exit is not evidence by itself, so every child runs against an overlay sentinel deleted before it and re-checked after, a Playwright child additionally needs a fresh json report recording at least one executed test, and anything else raises `MutantRunInfraError` and is never scored — the failure this closes is the worst one available to a mutation harness, where a systematically dead overlay reports a PERFECT score with every other gate condition still passing. Six defects surfaced that neither row described, each of which would have shipped a wrong NUMBER rather than a loud failure: `String.replace` expanding `$&`/`$1` in a string replacement so a mutant applies as text nobody wrote; macOS resolving `/var` through a symlink so the overlay served clean disk text while every other signal read live; the new gate silently joining the parser harness's whole-project sweep, a job that installs no browser; the mixed-kind suite list being load-bearing, since one payload mutant is killed by the vitest suite alone and a Playwright-only registry would have enrolled it as a guaranteed survivor; green-but-empty as the no-tests trap, closed by asserting a non-zero executed count at baseline; and a latent ambient-config bug in the vitest partition guard that this arc's own command exposed, swept to four sites and pinned by a source scan because every other case there reads a stubbed config and would pass a revert whenever the ambient is clean. The mode's own two pure modules are enrolled as source-mutation surfaces before the arc's first review dispatch; what the registry cannot express — the spawn boundary needing a real Playwright child — is stated rather than enrolled symbolically. Prior: 2026-08-15 — `feat/spec-lint-intent-red` graduated `BL-SPEC-LINT-CITATION-INTENT` and `BL-SPECLINT-RED-EXECUTABILITY-ARM`: `spec:lint` now says whether a citation resolves to the RIGHT file, and the task-marker contract's red-then-green cycle is declared and checkable. Both rows' own sketches were corrected by measurement rather than argument. The citation row asked for a per-case demotion; the corpus said the whole arm must be advisory, because the strictest content condition still fires on 15 of 135 CORRECT citations of a merged plan, and a hard code with an 11% false-positive floor gets waived reflexively. Detection was never the gap either — the shipped advisory already fired on most of the wrong citations and on 69 spans of the correct plan, so what shipped is discrimination (an enclosing-declaration rescue) and actionability (relocation hints naming which other file the doc itself cites does hold the identifiers). The red row's exempt branch for author-written reds became a DECLARED `red-state=authored` + `red-target=`, because no recognizer over task prose can decide whether a `red=` is asserted-red-now or authored-by-the-task. Validated against the citations that actually burned rounds: the fixture corpus is distilled from the KNOWN-BAD sync-log plan, not the corrected one, because the human repair of that defect made the mirror-image error on eight citations. Two wrong citations are a documented recall ceiling — a vocabulary-sharing sibling is indistinguishable by content — and are pinned as premise-guarded silent cases. The mutation gate found 26 unaccepted survivors on first run; fourteen were repaid by tests, one by a source simplification, and the rest are argued reachability rows. Prior: 2026-08-15 — `fix/changes-feed-batch-flake` graduated `BL-CHANGES-FEED-MODAL-BATCH-FLAKE`: the entry's own first-thing-to-check was checked and REFUTED. There is no cross-spec fixture collision — both CI failures hit the first spec executed, before any other spec had touched the database — and the real cause, measured from the failing runs' job logs, is a transient gateway 502 on the foreground snapshot RPC that the loader deliberately throws to the `/admin` error boundary, where a wait for the modal alone starves. The row's "passes standalone, fails in batch" evidence was a sampling artifact: standalone ran only locally, where that fault environment does not exist, so the flake correlated with "batch" by measurement design. Two defects the row did not describe were found on the way: the fatal log path rendered its PostgREST error as `'[object Object]'`, which is why the 502 had to be attributed through a same-class witness 62 seconds later, and a recovery on a GREEN run would have left no trace an operator could see — the list reporter prints no annotations and a green run uploads no artifact — so the executed-count oracle now prints every `infra-recovery` row plus a total. Filed `BL-MODAL-WAIT-BOUNDARY-HELPER-ADOPTION` and `BL-SNAPSHOT-READ-TRANSIENT-502-POSTURE`. Prior: 2026-08-15 — `fix/sync-observability-gaps` graduated `BL-MANUAL-SYNC-UNEMITTED` and `BL-PENDING-RETRY-EXISTING-SHOW-THROWS`: manual sync now records every terminal outcome, and the existing-show pending-ingestion retry executes real sync work instead of throwing `SyncInfraError` before touching anything. Both rows' own prescriptions were partly rejected with reasons recorded in the archive — a per-branch emit is the shape that failed (the single site switches exhaustively, so a new outcome variant is a compile error until the mapping says what it records), and per-route tail injection is the hand-enumerated cover that came up short five times in the parent arc (one default at the shared `applyStaged` chokepoint covers both live routes and every future caller). Three things the rows did not describe were found by sweeping rather than reading: `toResult` fell through to an implicit `null` that turned an unhandled phase-1 variant into a clean pass, four terminal branches of the SHARED pipeline wrote no row at all (three fetch-failure arms plus the pull-sheet-override TOCTOU skip, all of which benefit cron identically), and adding the production sink default made every existing applied-path unit test open a real postgres connection — probed, 14 rows written to the shared local DB, deleted, zero after the injections landed. Emit placement is load-bearing twice: post-commit, because attribution resolves in the sink's subselect and an in-tx emit is permanently NULL-attributed at show birth; and keyed on a TRACKED sink, because a throw after an outcome row already landed must add nothing rather than file a `parse_error` over it. The two live probes are why this shipped correct — the retry defect survived because the shipped tests inject `processOneFile_unlocked` itself, and the env-bound probe was verified to discriminate by re-injecting the defect. Prior: 2026-08-11 — `fix/tap-target-inline-controls` graduated `BL-TAP-TARGET-INLINE-TEXT-CONTROLS`: the per-site prose-vs-chrome judgment the row was filed to obtain, ratified by the user 2026-08-10 as **3 exempt / 5 repaired**. The exempt three are pinned in SOURCE rather than in a browser — an exempt site's contract is "unchanged source", and a rendered box cannot say whether the exemption is still the ratified decision or an accident nobody recorded; the guard pins the comment AND the class string and was proven against four mutants. The repaired five are pinned by real-browser rects on the PRODUCTION routes (red observed first at 16.80 / 19.36 / 17.05 / 16.80px), wired into `lifecycle-layout-e2e.yml` behind an execution oracle that job did not previously have. Two of the row's own site labels were wrong and were corrected from the live tree. Two measurement lessons are recorded in the archive entry because each produced a wrong answer first: `boundingBox()` is viewport-relative and Playwright scrolls between reads, which manufactured a phantom 5.4px overlap, and the container change made to "fix" that phantom was reverted once a mutant showed the suite stayed green without it. The invariant-8 gate's one P1 was refuted by measurement against a stale contrast comment in `app/globals.css`; four follow-ups filed. Prior: 2026-08-04 — `feat/harness-font-fidelity` (PR #705) graduated `BL-HARNESS-FONT-FIDELITY`: the face is declared once in `app/fonts.css` over the committed binary and read by BOTH Next roots AND by `compileEntryCss`, so the 32 standalone harnesses render what the product renders instead of the ambient host font. The entry's own count of 31 was right when filed and is 32 as shipped — the browser guard this work added is itself a caller, found by the fail-by-default wiring meta-test rather than by anyone remembering. The spec it asked for was written and its central premise EXPIRED before implementation: drafted against `next/font/google` with seven Google v20 subsets, while `main` had already moved to `next/font/local` over an upstream v4.1 subset, so shipping §3.3 verbatim would have stripped `ss04`/`zero`/`opsz` and reverted `BL-INTER-NUMERAL-DISAMBIGUATION`. User-ratified 2026-08-04 to one face over the existing bytes, with the stale sections marked SUPERSEDED in place because `consistency.mjs` cross-checks the document's own counts. Four claims were overturned by measurement rather than argument and each is corrected where it was wrong: the mutation matrix found the guard never compared the fallback's override VALUES; CI found a Linux/macOS rasterization gap (hinted 132px vs geometric 130.09375px) root-caused in the pinned container rather than papered over with a wider tolerance; the impeccable critique found a rationale written into five surfaces that this branch's own post-step had invalidated; and the audit found the binary had lost its one-year immutable cache on the move out of `.next/static/media/`, now restored by a content-hashed filename plus a `next.config.ts` header. Prior: 2026-08-04 — `fix/apply-undo-audit-fidelity` (PR #697, merge `644f8bb06`) graduated `BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP`, `BL-IDENTITYLINK-LANDED-VS-REQUESTED` and `BL-UNDO-SELECTIONS-RESET-AT-DROP`. The notice and feed now derive from rename pairs that actually LANDED, with unlanded ones recorded as a durable `IDENTITY_LINK_RENAME_UNLANDED` event — and that row's own premise was partly wrong: the feed never consumed the requested `identityLinkRenames` at all, it re-derived its own pairs from `triggeredItems` with NO accept gate, a wider defect than the row described. The notice needed a two-arm split rather than a swap, because feeding landed pairs to arm (c) as well would have fired a FALSE capability-loss notice for every pair whose source row survived; arm (c) now suppresses a loss only when the source SURVIVED, which also surfaces a real loss the old suppression hid. The roleFlagsNotice row named ONE discard site and the class sweep found FOUR (finalize-cas, ordinary finalize, `runManualStageForFirstSeen`, and the pending-ingestion retry, which bypasses the locked wrapper's post-commit tail entirely), all repaired through one shared `lib/sync/emitRoleFlagsNotice.ts` and flushed in a `finally` after the outer transaction at three sites — including the STREAMING finalize-cas handler, the one real operator traffic reaches; the structural guard against a fifth is DESCOPED and refiled as `BL-ROLEFLAGSNOTICE-DROP-GUARD`. `selections_reset_at` survives an undo, the real fix being to capture the successor's marker BEFORE the delete — the common rename path takes the clean-INSERT branch, so a merge living only in `ON CONFLICT` would never have run — with `mi11_approve_hold` repaired as a second producer dropping the column at two sites, and two historical shapes left unrescuable as documented limits. The same branch filed `BL-CAPABILITY-LOSS-SURVIVING-ROW-FALSE-POSITIVE`, `BL-SHADOW-REBUILD-EXHAUSTED-EMIT-PLACEMENT` and `BL-CODE-ENUM-PROVENANCE-COMMENT-BLIND`. Prior: 2026-08-03 — `feat/inter-numeral-disambiguation` graduated `BL-INTER-NUMERAL-DISAMBIGUATION` by changing the FONT rather than the CSS: the row's premise was false. Probed live before drafting — the Inter build Google Fonts serves has the character variants stripped (`calt ccmp dnom frac kern locl mark mkmk numr pnum tnum`, `wght` axis only), so the requested `"zero" 1, "cv05" 1` would have rendered nothing, exactly as the `"cv11" 1` beside it had been rendering nothing since `78662acb5` (2026-05-03). Two defects in the row itself besides: `cv05` never touches capital `I`, and `ss04` is Inter's own disambiguation set covering both letterforms. Shipped a latin + latin-ext SUBSET of the upstream v4.1 release (173 KB, built by `scripts/subset-inter.sh` from a checksum-pinned input, OFL alongside) via `next/font/local` — verbatim at 344 KB was the gate decision until the impeccable audit measured it costing FCP +136-164ms and a fallback-to-Inter swap landing 3.7s in on slow 4G. `ss04` at `html`, `ss04`/`tnum` on the tabular rule, and `zero` on a NARROWER `.code-value` class, because `.tabular-nums` turned out to sit on whole prose sentences including the Right Now hero's 30px bold h2. `ss04` is REPEATED on each rule because `font-feature-settings` inherits as a whole value, not a merged list. Fourteen false claims corrected across `DESIGN.md`, the font-binding spec and plan, and eight source comments, including that plan's own P3 disposition claiming the binding "deterministically activates Inter's alternates … for the first time" (it activated nothing). New guard `tests/styles/fontFeatureAvailability.test.ts` derives the font path from `app/fonts.ts` and fails the build on any tag the loaded binary cannot honor, with a regression proof against the committed Google binary; in the browser `zero` needs a PIXEL oracle because `zero` and `zero.slash` share an xAdvance of 1292, so no width assertion can ever see it. Cross-model spec review round 1 returned BLOCKING with 7 findings, five confirmed by probe and all repaired. Prior: 2026-08-03 — `feat/needs-attention-holds-rollup` graduated `BL-NEEDS-ATTENTION-HOLDS-ROLLUP` (the cross-show open-holds read plus the fourth needs-attention stream across page, inbox, badge, mobile chip, and digest; spec `docs/superpowers/specs/2026-08-03-needs-attention-holds-rollup-design.md`, plan `docs/superpowers/plans/2026-08-03-needs-attention-holds-rollup.md`). Prior: 2026-08-03 — `feat/sync-feed-undo-announce` graduated `BL-SYNC-FEED-UI-POLISH` and all three children. `BL-SYNCFEED-UI-1` shipped, with its own premise corrected: the note's proposed in-button `aria-live` region cannot work, because a successful undo flips the row out of `status='applied'` and unmounts the button before assistive technology reads anything. Six adversarial rounds then refuted every surface-level owner in turn (the group empties, the strip returns null, the dashboard returns a different tree, the feed is swapped for its error rendering), and the vector was settled by an executable spike rather than a seventh prose argument. The channel lives in `AdminAnnounceProvider`, mounted by the admin layout AND by `ReviewModalShell` — a modal needs its own, since content outside an `aria-modal` dialog is excluded from the accessibility tree. `BL-SYNCFEED-UI-3` graduated as already-shipped (fixture corrected at `c3920fe6a`); `BL-SYNCFEED-UI-2` ratified as untriggered with its re-open trigger preserved. The same work fixed a class defect the sweep found: all three feed action buttons rendered their failure card by conditional mount, so failures were silent to AT too. Filed `BL-FEED-BUTTON-SUCCESS-ANNOUNCE`, `BL-BULK-UNDO-ANNOUNCE-UNMOUNT`, and `BL-ANNOUNCE-REGION-UNMOUNT-CLASS`. Prior: 2026-08-03 — `feat/modal-freshness-cue` graduated `BL-MODAL-REALTIME-UPDATED-CUE` as SHIPPED: the published review modal now flashes the panel card of every registry section whose CONTENT changed across a realtime-driven reconcile, plus an sr-only announcement from the same detector, so a swap under the reader is attributable instead of silent. The entry's premise was wrong and is corrected in the archive: the 2026-07-19 realtime spec ratified that the BRIDGE renders `null`, never that the surface it refreshes must stay silent, so this was a new design decision rather than a reversal. The user chose flash-then-fade directly. Two adversarial rounds (the second split in half) returned BLOCKING and were repaired: the projection missed routed warnings, routed use-raw state, section anchors and attention items, and separately OVER-hashed the warnings panel and non-rendered decision fields; the mount baseline lived in a ref that abandoned renders consumed; and an aborted close hides the shell without unmounting the state owner. Prior: 2026-08-03 — `chore/scanner-precision-cluster` graduated `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN` and `BL-LEDGER-GUARD-BODY-DEFINED-IDS`, the two entries whose shared shape is a static scanner opening too small a set of files while a hand-maintained residue covers the gap. Both residues had already rotted: the enum's four-code list held one code that was long since absorbed while ELEVEN real §12.4 codes were dark, and the ledger guard's eight `KNOWN_DANGLING` rows were never debt at all. The scan is now type-aware and fail-closed (58 codes, 0 unresolved, 44 capture-linked skips) after six adversarial rounds established that every syntactic mechanism — root widening, type-stripping, written-return-type matching — is defeated by a spelling; the ledger guard now resolves body-defined sub-item ids under three corpus-measured conditions. One documented limit is fenced rather than overclaimed and filed as `BL-CATALOG-PARTITION-WARNING-CLASS`: provenance through `any` is undecidable, so the real closure is an enumerated catalog, not a better scanner. Prior: 2026-08-03 — `feat/font-binding-modal-freshness-cue` graduated `BL-HEADER-FONT-FALLBACK-WRAP`: the browser check it asked for refuted its own stated doubt (Next 16 registers the literal family name, so the crew import DID bind) and surfaced a wider finding — the product rendered two type families across its trees while `DESIGN.md` §2.1 commits to one, because the loader had never been wired at the root. Shipped as one shared loader instance in `app/fonts.ts` imported by BOTH Next roots (the crash screen replaces the root layout, so it was otherwise left behind), with `--font-sans` binding next/font's metric-matched fallback face so the swap window stops reflowing ~10%. Filed `BL-HARNESS-FONT-FIDELITY` (the 31 standalone harnesses have no Next runtime and keep measuring the ambient host font — zero cost today, needs a spec not a patch) and `BL-INTER-NUMERAL-DISAMBIGUATION` (impeccable P3). Prior: 2026-08-03 — `chore/orphan-components-lead-prose` settled the two entries the copy/dead-code sweep left behind. `BL-LEAD-CAPABILITY-PROSE-STALE` graduated: both prose claims turned out STALE rather than intentional — the `capabilityTransitions` line is a verbatim quote that stopped being verbatim at `e348c81ca`, and MI-9's "admin/ops" clause was inherited from §12.4 copy strings whose every other instance had already been retired or corrected. A third instance the literal sweep could not see (`lib/sync/phase2.ts`, a semantic variant in production source) was corrected with them, and two guards shipped in the same commits: `capabilityHeaderParity` extracts the expected flag set from `scopeTiles.ts` source, and `capabilityClaimProse` scans the MI-9 rows AND every `.ts`/`.tsx` under `app`/`components`/`lib` with a positive-claim recognizer. `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS` was AMENDED, not archived: four components retired (each with a named superseding commit and live successor; `RightNowCard`'s two regression suites were retargeted onto `RightNowHero` and each proven by mutation before the deletion), and `WrappedTile` stays as a DECIDED retention — deleting it would orphan `TileErrorBoundary` and `TileServerFallback` rather than shrink the ledger, and the orphan guard now asserts its reason says so. Filed `BL-CAPABILITY-MATRIX-FINANCIALS-PREDICATE` (the matrix models five predicates, the code has six) and `BL-BELLPANEL-DISMISS-COMMENT-DRIFT` (six comments name a label the panel stopped rendering). New guard `tests/docs/retiredIdentifierReferences.test.ts` walks every tracked file for references to what was retired, keyed by LINE CONTENT with reasoned exemptions — three adversarial rounds each found references a hand-curated census had missed, so the census is now a walk. Prior: 2026-08-03 — `docs/close-v1-override-wont-build` graduated `BL-VERSION-AMBIGUOUS-V1-OVERRIDE` as RESOLVED — WON'T BUILD: no admin force-classify override gets built, now or trigger-gated. The row's premise was false as stated. `v1` is a fallback bucket, not a confirmed legacy template (`lib/parser/schema.ts:37`; the registry entry at `lib/parser/schema.ts:53` carries no `requires` array, so nothing positively identifies a v1 sheet), and its "a genuine legacy-v1 sheet has neither resolution" conflated _no markers registered today_ with _no registrable structure_ — a real legacy sheet, once actually seen, is indistinguishable from a genuinely-new template, and the gate spec's §7.1 resolution #2 (developer registers the markers) is not limited to new templates. Probed: all 10 committed fixtures classify confidently (6× v2 at 7/0, 4× v4 at 8/0), zero ambiguous, zero v1. The override would convert a signaled failure into a silent one, inverting the preparedness-audit posture, and it serves none of the four indistinguishable bucket occupants better than their existing disposition. Re-open trigger recorded in the archive entry, conjunctive: a real legacy sheet surfaces AND marker registration proves impossible. **Current state after this and the same-day `docs/graduate-bl-unpublish-to-held` graduation: six of the eight rows the 2026-08-02 segment below enumerates remain open** (`BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`, `BL-HEADER-REACT-RECONCILE-HARNESS`, `BL-PG-CRON-HOST-ASSERTION`, `BL-NEEDS-ATTENTION-HOLDS-ROLLUP`, `BL-RESYNC-STAGED-REVIEW-UI`, `BL-STEP3-FULL-CREW-PREVIEW`); that segment's own "Eight open rows here" count is left as written, because it describes the state at the 2026-08-02 reconciliation and demoting it behind `Prior:` is what marks it as history. Prior: 2026-08-03 — `docs/graduate-bl-unpublish-to-held` graduated `BL-UNPUBLISH-TO-HELD` as already-shipped: the 2026-07-01 published toggle (`unpublish_show` RPC in `supabase/migrations/20260701000000_published_toggle_unpublish_show.sql`, driven by `setShowPublishedAction(slug, false)` from the admin show review modal, commit 945bd4ef0) is exactly the published→Held inverse the row asked for — the row's 2026-08-02 "Verified: no such RPC exists" was a false verification, and its premise that the M12.13 token-unpublish archives was stale too (both unpublish paths are pure `published=false`). A 10-point audit of the shipped surface before graduating found no functional gap and one gate-scope finding, filed as `BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED` (the validation-schema-parity gate covers tables×columns only, never functions — no current drift, probed live). Prior: 2026-08-02 — `chore/copy-deadcode-sweep` graduated three copy-and-dead-code entries (`BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT`: the §12.4 helpfulContext no longer claims either capability role unlocks admin access — probed, `is_admin()` never reads `role_flags` — landed as a five-surface lockstep in one commit plus the row's `longExplanation` and the `scopeTiles` header comment it contradicted; `BL-ADMIN-PARSEPANEL-ORPHANED`: the component deleted behind a new zero-production-importer guard that asks the compiler for both module edges and their targets, with the five peers the class sweep found filed as `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS`; `BL-HELP-STRIP-COPYLINK-STALE`: the per-show help prose now names the Share link button, no screenshot regenerated). Also filed `BL-LEAD-CAPABILITY-PROSE-STALE` for the two remaining prose claims that need a contract read. Prior: 2026-08-02 — `docs/dangling-citation-ledger-filing` took the referential-integrity guard's `KNOWN_DANGLING` debt map from 50 rows to 9, filing 39 real entries and correcting one citation (`BL-FLOW4` came off as a side effect: with its family now defined, the stem suppresses as a family reference). Eight open rows here (`BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`, `BL-HEADER-REACT-RECONCILE-HARNESS`, `BL-PG-CRON-HOST-ASSERTION`, `BL-NEEDS-ATTENTION-HOLDS-ROLLUP`, `BL-RESYNC-STAGED-REVIEW-UI`, `BL-STEP3-FULL-CREW-PREVIEW`, `BL-UNPUBLISH-TO-HELD`, `BL-VERSION-AMBIGUOUS-V1-OVERRIDE`) plus `BL-LEDGER-GUARD-BODY-DEFINED-IDS` as the handoff for the eight ids defined in a parent entry's BODY, which stay body-defined by decision. Thirty-one went straight to `BACKLOG-archive.md` at their terminal state: eleven already shipped (the row was deleted at close instead of graduated, twice on a spec's explicit instruction), fifteen were impeccable-gate deferrals whose promised row was never opened and whose deferral has since closed, and five name a branch that was never taken. One citation was corrected instead of filed: `BL-SYNC-FEED-UI-POLISH` pointed at a backlog-id family that exists nowhere in the repo. The 9 rows left are the eight body-defined ids above plus `BL-RESOLVED`, a prose placeholder in an audit doc, both handed to follow-ups. Prior: 2026-08-02 — `test/agenda-fold-seeded-e2e` graduated `BL-AGENDA-FOLD-NO-SEEDED-E2E` (the per-viewer agenda day fold exercised through the REAL crew page: seeded `agenda_links` + two complementary date-restricted viewers, each an email-matched Google session against its own seeded show, plus an unrestricted admin control in `stage-restricted-crew-schedule.spec.ts`, wired into `crew-e2e.yml` under desktop-chromium behind a run-command wiring guard) and `BL-AGENDA-A11Y-WEBKIT-COVERAGE` (grep-scoped `standalone-webkit-a11y` project resolving exactly one test, structurally pinned, plus webkit installs and a regenerated baseline). Prior: 2026-08-02 — docs/citation-rot-financials-vocab graduated BL-DANGLING-CITATIONS-RETIRED-WORKFLOW (15 dangling citations to the seven retired e2e workflows rendered as prose across 10 docs, class-swept per the AGENTS.md bug-shape rule; spec:lint target-class findings now zero tree-wide) and BL-MASTERSPEC-FINANCIALS-VOCAB (14 master-spec financials-entitlement claims reconciled to LEAD ∪ FINANCIALS ∪ admin, line-count-neutral; 4 seed exclusions + 8 window-probe non-claims ratified in docs/superpowers/specs/2026-08-02-docs-hygiene-citation-rot-financials-vocab-design.md; specs README line-count note corrected), and filed BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT (§12.4 copy over-grant, deferred to the next §12.4 copy pass). Earlier reconciliations (deduplicated 2026-08-02 — this line had accumulated 40 segments, 26 of them verbatim repeats of merge-concatenated chains): **[BACKLOG-archive.md § Reconciliation log](./BACKLOG-archive.md#reconciliation-log)**.

---

## BL-AVATAR-MENU-SWITCH-PENDING-WATCHDOG — a hung switch-person clear dims the menu row for good

**Status:** OPEN · **Filed:** 2026-08-25 (`feat/switch-person-google-signout`, impeccable critique P1 at the invariant-8 gate) · **Facing:** product · **Severity:** LOW (needs a server action that never settles; a reload recovers) · **Class:** UX resilience · **Effort:** S · **Reachability:** INFERRED, NOT PROBED — reachable when the `clearIdentity` server action never settles (a stalled sign-out round trip, now part of that action); the probe that settles it is a `deferred()` clear in `tests/components/auth/avatarMenu.test.tsx` left unresolved past the timeout under fake timers, asserting the row re-enables and the status region clears. That probe is the first scheduled step.

`components/auth/AvatarMenu.tsx` keeps `switchPending` from `useTransition` with no watchdog, and `onSwitchSubmit`'s re-entry guard refuses every further tap while it holds, so a transition that never settles leaves "Not you? Switch person" dimmed and inert until the page is reloaded. The same-route sibling `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx` already carries `PENDING_TIMEOUT_MS = 8_000` with a status region; the menu row wants the same shape.

**Deferral reason (c):** the repair adds a timing constant, and DESIGN.md's interaction-timing table is pinned in both directions by `tests/docs/_metaInteractionTimingInventory.test.ts`, so it is a small design-token change on a surface the filing arc did not otherwise touch. The arc fixed the sibling P1 (no `aria-busy`, no announcement) in-branch.

**Trigger:** the next avatar-menu pass, or a report of a stuck switch row.

---

## BL-SPECLINT-AC-UNCLAIMED — a plan can declare an acceptance criterion that no task is scheduled to prove

**Status:** OPEN · **Filed:** 2026-08-22 (`fix/screenshots-drift-instrument`) · **Facing:** process · **Severity:** LOW (an unwritten assertion; caught downstream by review rather than shipped) · **Class:** spec-lint arm · **Effort:** S · **Incident:** plan review round 1 of this arc raised "AC-2 has no executable owner" as a BLOCKING finding against a plan `pnpm spec:lint` had just passed at **0 hard**; the round is recorded in `docs/review-rounds/fix/screenshots-drift-instrument/50ca72a566b0.jsonl`. · **Reachability:** PROBED — the asymmetry is at `lib/specLint/taskContract.ts:376`, and the missing direction was written and run against this arc's own plan before filing.

`spec:lint` checks marker to AC but not AC to marker. `TASK_AC_UNRESOLVED` fires when a task marker cites an `ac=` id that appears nowhere in the plan's text. Nothing fires when a plan DECLARES an acceptance criterion in its own list and no task marker claims it — which means no task is scheduled to write that assertion, and the plan still lints clean.

**The check is the existing traversal read in the other direction**, and it was executed rather than proposed: collect the ids from every `ac=` field, collect the ids declared in the plan's acceptance-criteria list, report the set difference both ways. Run against this arc's pre-repair plan it reproduces the finding (AC-2 declared, unclaimed); run against the repaired plan it reports clean in both directions.

**The reverse direction is a second real defect,** not a symmetry nicety. `TASK_AC_UNRESOLVED` fires on an id absent from the plan's TEXT, which a passing mention in prose satisfies — so a marker may cite `ac=AC-9` against a plan that merely mentions AC-9 in a sentence, without AC-9 ever being a declared criterion.

## BL-ADMIN-LOADER-INFRA-ERROR-TELEMETRY-SILENT — the loader is telemetry-silent on the fault this instrument measures

**Status:** OPEN · **Filed:** 2026-08-24 (`fix/screenshots-drift-instrument`) · **Facing:** process · **Severity:** MEDIUM (a diagnosable fault leaves no trace in the job log) · **Class:** observability · **Effort:** S · **Incident:** this arc's own diagnosis. `lib/admin/loadRecentAutoApplied.ts` imports `log` (`:28`) and none of its five `infra_error` return sites (`:145`, `:170`, `:176`, `:231`, `:241`) emit anything, so attributing run 32528532727 required downloading the failure artifact inside its 7-day retention window rather than reading a log. A code-carrying emit would have named it from the log. · **Reachability:** PROBED — the five return sites are read directly.

**Class-sweep exception (c).** The repair is an emit in `lib/admin/**`, which pulls application review
surface into a PR whose brief scopes it to workflow, scripts and docs.

## BL-SERVER-TIME-GUARD-EXCLUDES-LIB — the server-time guard's population never walks `lib/`

**Status:** IN PROGRESS · **Branch:** fix/screenshots-drift-residue · **Filed:** 2026-08-24 (`fix/screenshots-drift-instrument`) · **Facing:** process · **Severity:** LOW · **Class:** guard fidelity · **Effort:** M · **Incident:** `lib/admin/loadAppEvents.ts:45` calls `new Date(Date.now() - sinceH * 3_600_000)` and is a LIVE UNWAIVED SURVIVOR of `tests/help/_metaServerTimeGuard.test.ts` — `discoverScanRoots()` (`:11`) seeds with `"components"` plus manifest-derived `app/<segment>` roots, so `lib/**` is never walked. The guard reports clean over a population that excludes the survivor. · **Reachability:** PROBED — the survivor is named above and the seeding is read at `:11`.

**Class-sweep exception (c).** Widening to `lib/**` is a redesign of a guard this PR does not otherwise
touch, and it pulls an unbounded waiver population into a CI-fidelity diff.

## BL-RENDER-FAULT-TERNARY-RESIDUE-ASYMMETRY — the marking scanner's ternary arm drops what its if-arm reports

**Status:** IN PROGRESS · **Branch:** fix/screenshots-drift-residue · **Filed:** 2026-08-24 (`fix/screenshots-drift-instrument`) · **Facing:** process · **Severity:** MEDIUM · **Class:** guard fidelity · **Effort:** M · **Incident:** the defect shipped INTO this arc's own registry and was caught pre-merge by its self-review. `tests/help/_metaRenderFaultMarking.test.ts` declared `Dashboard.tsx:ignoredDegraded` and `Dashboard.tsx:dataGapsDegraded` as flag-shaped residue on the stated ground that "the guard site returns no JSX". Both are ternaries whose `whenTrue` IS the JSX (`components/admin/Dashboard.tsx:674`, `:858`), so the recorded justification was false and the two entries were filed under the wrong cause. A registry whose reasons are wrong is worse than one with gaps, because it is read as settled. · **Reachability:** PROBED — see the probe below.

**The asymmetry.** `scanCandidates` (`tests/help/_renderFaultScan.ts`) gives its `IfStatement` arm a
vocabulary fallback: an unclassifiable guard matching `/error|fail|infra|degrad|unavailable|corrupt/i`
is pushed as `unknown` and lands in `REPORTED_RESIDUE`. The `ConditionalExpression` arm has no fallback
and does a bare `continue` at `:754`. A ternary whose `whenTrue` is JSX is exactly the shape layer 1
claims to reach, so this is a gap INSIDE the claimed coverage, not the documented ceiling at spec §4.2.

**Probe** (ts-morph over `scannedFiles()`, live tree, re-run 2026-08-25): **719** ternaries under the derived
roots return JSX in `whenTrue`; **79** of those carry a fault-vocabulary guard, 70 of them in `"use client"` files. The classifiable ones are
enforced; the rest are dropped in silence rather than reported. Reported residue today is 5, every one of
them from an `IfStatement`.

**Class-sweep exception (c).** Adding the fallback means declaring a reason for every unclassifiable
ternary it surfaces. Hand-writing that population reduces the registry to boilerplate and destroys the
signal residue exists to carry, so the repair is a redesign of the recognizer's residue model rather than
a one-line symmetry fix. Sizing it, and deciding whether the vocabulary probe is even the right filter on
this arm, is the first scheduled step.

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

## BL-SCREENSHOTS-DRIFT-SINGLE-FAILURE-UNEXPLAINED — one `dashboard-overview-light.webp` byte drift, now measured as rasterization variance with the population question still open

**Status:** IN PROGRESS · **Branch:** fix/screenshots-drift-residue · **Severity:** LOW (advisory job; not a required context) · **Class:** CI-INFRA · **Effort:** M (the instrument shipped; the open step is a population comparison) · **Filed:** 2026-08-18 (`fix/rowactions-submenu-reveal-flake`, as the surviving half of `BL-ADVISORY-E2E-JOBS-FLAKE-ACROSS-IDENTICAL-CODE`) · **Facing:** process · **Reachability:** PROBED for the mechanism; the runner-population reading remains unprobed and is what this row now schedules.

**MECHANISM NAMED, and it is NOT the sibling's.** The artifact was replayed inside its retention window
(`fix/screenshots-drift-instrument`, 2026-08-24). Geometry identical at 1216x1463 both; 45293 of 1779008
pixels differ; 93% of the differing pixels are delta 0-31; run lengths concentrate at 1-2px on glyph
edges; best vertical shift alignment is offset 0, so a uniform shift is refuted. Cropped and inspected:
identical layout, identical text, identical dates and counts. **Sub-pixel text rasterization variance.**

The hard part is that it happened at all: the capture already pins the image tag AND passes
`--platform linux/amd64`, so the variance survived both pins the byte-comparison discipline prescribes.

**The 0/9 non-reproduction was a MIS-SAMPLE, which is a sharper correction than "uninformative".** Probed
2026-08-24 against the workflow's own run list. Both failures are `pull_request` runs — occurrence A is
run 32528532727 on `be5d3d810db2`, this row's is run 31930558546 on `b5aa6ef7`, one run per sha,
`run_attempt` 1. The nine non-reproducing probes are every one `workflow_dispatch`, and every one on
`119895a7c756`, a descendant of `b5aa6ef7` whose `public/help/screenshots/` tree is byte-identical to it.
So the probes never sampled the population either failure came from, and the baseline is not the
difference — the trigger is. 0/9 was never weak evidence AGAINST a runner-population effect; it is not
evidence about the failing population at all.

This names no mechanism and must not be read as naming one. Nine dispatches is a small sample and the two
triggers may well share a runner pool.

**What shipped, and what it deliberately does not do.** The instrument now records, on BOTH outcomes,
`eventName` from `GITHUB_EVENT_NAME`, the three runner fields, `cpuModel`/`cpuCount`, and a
`pixelSha256` over DECODED RGB rather than the PNG container — a container hash reports a render change
whenever only the encoding moved, which is precisely the confusion this row sits in. The upload runs on
success as well as failure, because a passing run must leave a record or the comparison population can
never be built.

**The open step is a POPULATION COMPARISON, not a repair.** Collect records across both triggers and
compare `cpuModel` and `runnerName` between a reproducing and a non-reproducing run. Only then does the
runner-population reading become testable.

**Do NOT open a screenshots repair on the current evidence.** The two candidate repairs are different
products with different failure modes — pin the rasterization environment harder, or stop requiring byte
equality and compare within a perceptual tolerance — and choosing between them needs the population data
the instrument has only just begun collecting.

## BL-MUTATION-SHARD-BUDGET-AGGREGATE-OVER — the source-mutation shards are 60% over budget in AGGREGATE, and the four-shard pin's premise no longer holds

**Status:** OPEN · **Filed:** 2026-08-22 (queued by `bl-orch` onto `ci/app-e2e-batch2`'s closeout commit, from `dbconn`'s arithmetic) · **Facing:** process · **Severity:** MEDIUM (the budget gate is FAILURE on main itself, so every arc reads its own leg against a red baseline and cannot tell a regression from the inherited state) · **Class:** CI capacity · **Effort:** M · **Reachability:** PROBED — the main-red runs linked in the incident are this row's own evidence; the shard wall-clocks below were measured by `dbconn` on its own legs and are recorded here as ROUTED figures, attributed rather than re-derived, because the arc that measured them holds the artifacts. · **Incident:** the `mutation-harness` workflow is red on MAIN, not on a branch, and has been for days — the last five scheduled runs on `main` all failed: [32559529251](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32559529251) (2026-08-22), [32459382957](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32459382957), [32344648722](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32344648722), [32228276600](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32228276600) and [32111856491](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32111856491), listed by `gh run list --workflow=mutation-harness.yml --branch main`. Those are cost events that already happened, not a constructed hypothetical.

Shard wall-clocks, measured by `dbconn` and routed here by the orchestrator (that arc holds the run
artifacts; this row does not re-derive them): **4669 s, 6958 s, 4667 s, 6786 s = 23080 s** of work
against a budget of `4 x 3600 s`. That is 60% over IN AGGREGATE, and — the part that matters for the fix — **all four
legs are over**, with no single surface dominating any of them. The spec's §2.4 premise for pinning
`SOURCE_SHARD_COUNT = 4` was that a small number of expensive surfaces set the ceiling; that premise
is now false, so the pin cannot be defended on its original grounds.

Fix candidate, by the same arithmetic: **n = 8 fits** at roughly 2885 s for the longest leg. `n = 5`
and `n = 6` are both still over, so a one-notch bump buys nothing.

**Per-leg ceiling proximity is trending, not just the aggregate.** One shard measured 111 minutes and
then 118 minutes on consecutive runs against a 125-minute ceiling (`panecompact`, 2026-08-22). The
aggregate says the budget is wrong; that pair says a single leg is now close enough to the ceiling
that ordinary variance reaches it, and a leg that CANCELS at the ceiling reports nothing — the silent
form this row exists to prevent.

**The first scheduled step is the shard-count decision as a FLEET item, not a unilateral edit.**
`shardPartition` is a shared surface and the LPT partition re-packs whenever the surface set changes,
so a shard-count change moves which shard every enrolled surface lands in, and every arc holding a
stamped score is affected at once. Note also that `arc-ctloutline`'s incoming **231 sites** land on
this same partition and make every number above worse before any repair lands.

## BL-ADMIN-LOADER-CI-TRANSIENT — admin page and modal loaders fault transiently on the app-e2e runner, and the failure is indistinguishable from a spec defect

**Status:** OPEN · **Filed:** 2026-08-22 (`ci/app-e2e-batch2`, from the counted runs of that arc's five-green loop) · **Facing:** process · **Severity:** MEDIUM (it costs a full five-green restart per occurrence, and read per-spec it drops members that are not defective) · **Class:** CI flake · **Effort:** M · **Reachability:** PROBED — the runs listed below, each with the failing page's own snapshot or its error text; three of them also carry a local CI-posture reproduction that passes, and which three is stated rather than implied. · **Incident:** the runs listed below died on this shape in one evening, across two PRs, and three batch-2 members left under AC-4 because of it. Those are cost events that already happened.

Every run below is one occurrence, and the list is the count, which is why this sentence no longer restates it: counted runs of PR #875's own AC-3 loop plus one from an unrelated branch (`feat/destructive-guard-discovery-by-connection`), so TWO PRs, one shape — an admin loader faulting, never
resolving, or leaving a server round-trip unsettled, while the rest of the page renders fine. The
list is the row's evidence and the amended AC-3 exception reads its SIGNATURE from it, so every
occurrence lands here as it happens:

- [32561531983](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32561531983) — `admin-parse-panel`, snapshot is the whole page as "Admin session unavailable" at the Re-sync assertion.
- [32563705156](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32563705156) — `warning-panel-polish`, announcer empty after Ignore; no trace at `--retries=0`, so this one is the least attributed of the three.
- [32564772189](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32564772189) — `needs-attention-page`, nav and badge render (badge reads "2"), `main` is "This admin page couldn't load".
- [32571008405](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32571008405) — TWO members in one run: `published-show-attention`, where the ratified open-time recovery FIRED AND STILL FAILED ("error boundary persisted after one retry … grep the server log for `show_review_snapshot_failed`"), and `telemetry-layout`, whose snapshot ends at `status: Loading your dashboard…` with the sidebar and log both at zero rects. The second is the same class arriving as a loader that never resolves rather than one that faults, and it is the first evidence that the existing one-retry recovery is not sufficient.
- [32573475808](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32573475808) — `telemetry-layout` AGAIN, the same case and the same zero-rect stall as 32571008405. This is the observation that dropped it (the second red on one spec, batch 1's threshold), and it is listed here because the drop's reason lives in this class, not in the spec.
- [32572200250](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32572200250) — `notify-toggles`, **a BATCH-1 member wired on main since 2026-08-09**: the toggle's server action plus `router.refresh()` did not settle inside a 10 s poll (`aria-checked` still "true"). Nothing about batch 2 is in that spec's path, so this is the observation that separates the two readings cleanly: the variable is the runner, and main's own app-e2e job carries the same exposure. The pair is cross-PR: `dbconn`'s own app-e2e run [32557812890](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32557812890) on `feat/destructive-guard-discovery-by-connection` failed the SAME spec, the same case and at the same 10.7 s earlier the same night, and resolved green on one re-run. Two unrelated branches, one spec, one shape.
- [32587470121](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32587470121) — `notify-toggles` AGAIN, on PR #875's own loop at head `567b3c852`, and it is the closest match to a prior occurrence this row holds: the same spec, the same case (`toggling a notify switch fires exactly one POST and flips state`, §7.5), the same 10 s poll, the same `aria-checked` still `"true"` where `"false"` was expected, and 157 of the run's 158 cases green around it. That is 32572200250 repeated two days later on a branch that still does not touch the spec's path, so the signature the amended AC-3 exception reads is matched literally rather than by family resemblance. **It is recorded here and does NOT drop the spec, and the reason is a boundary the ruling did not have to draw before:** AC-4 removes _a member_ of this batch, and every remedial step it prescribes names an artifact this arc does not own. `notify-toggles` is a BATCH-1 member wired on `origin/main` since 2026-08-09 (`git show origin/main:.github/workflows/app-e2e.yml` names it; main's oracle carries `"notify-toggles.spec.ts": 14`), it has no allowlist row to restore because batch 1 deleted it, and its `REQUIRED` row and `governs` entries came from batch 1 rather than from this arc's wiring commit. Dropping it would strip a check `main` already requires, which is a coverage regression outside a wiring arc's fence (spec 1.1), not an AC-4 drop. It would also retire the very observation the amendment cites as its cleanest control. The batch-1 threshold is therefore reached for this spec and belongs to whoever holds the class, not to this arc: it is named in the first scheduled step below.

- [32763990640](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32763990640) — TWO members in one run, on PR #875's re-anchored AC-3 loop at head `8e8a159d7`, and the run's server log names the mechanism directly rather than leaving it to inference: `AdminInfraError: requireAdmin: is_admin RPC failed: An invalid response was received from the upstream server`, `code: 'ADMIN_SESSION_LOOKUP_FAILED'`, repeated through the run alongside `Error: The destination stream closed early`. An upstream 502 on the admin gate, which is `BL-CHANGES-FEED-MODAL-BATCH-FLAKE`'s measured shape on this same job. `admin-settings-admins-refresh` (`:91`) failed a `locator.click` at the 60 s test timeout, and `needs-attention-page` (`:223`) failed `toHaveText("9+")` with `element(s) not found`, both consistent with the admin page never resolving. 156 of 158 cases passed around them. `admin-settings-admins-refresh`'s FIRST occurrence; `needs-attention-page`'s SECOND, after 32564772189.

- [32763990640 attempt 2](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32763990640) — the SAME run re-run on the SAME bytes, and it is the most useful occurrence on this row because of what CHANGED. Attempt 1 failed `admin-settings-admins-refresh` and `needs-attention-page`; attempt 2 failed NEITHER of them and failed `admin-changes-feed-layout.spec.ts:118` (mobile-safari) instead, 157 of 158 passing. Three distinct admin specs across two replays of one tree, and the third is the spec `BL-CHANGES-FEED-MODAL-BATCH-FLAKE` is named for. **This is the row's cleanest disproof that these are spec defects**: a defect reproduces on identical bytes and these did not, they MOVED. It also settles an AC-4 question it was about to lose — `needs-attention-page`'s second red did not reproduce, so it is not a spec earning a strike, and dropping it would have removed a passing member and restarted the five-green count on an artefact.

- [32786399563](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32786399563) — `admin-settings-admins-refresh` (`:91`) AGAIN, on PR #875's FINAL CI gate at head `4ed670170`, and it is the occurrence that shows this class outliving the count it disrupted: #875's five-green loop had already closed when this fired. Attempt 1 failed a `locator.click` at the 60 s test timeout, 157 of 158 cases passing, with the run's own server log naming the mechanism rather than leaving it to inference: `AdminInfraError: requireAdmin: is_admin RPC failed: An invalid response was received from the upstream server`, alongside `admin_read_share_token returned error: An invalid response was received from the upstream server` and repeated `Error: The destination stream closed early`. An upstream 502 on the admin gate, the same spec and the same line as this row's `32763990640` attempt-1 occurrence, so the signature is matched literally rather than by family resemblance. **The replay on identical bytes went GREEN**, which is the counter rule below applied prospectively rather than retroactively: the red did not reproduce, so it is an environment observation and no spec earned a strike. Recorded here rather than committed on `ci/app-e2e-batch2` by orchestrator ruling of 2026-08-24 — the occurrence is evidence, not a gate, and committing it would have moved a head whose CI-green proof the readiness report rested on.

THREE of them were reproduced locally under the CI posture (`CI=1`, so `pnpm build && pnpm start`,
both DSNs pinned) and passed: parse-panel 10 of 10, warning-panel 4 of 4 with `--trace on`,
needs-attention 12 of 12. The occurrences not named in that sentence were not re-probed locally, and the row
says so rather than generalizing: by then the shape was established, and a fourth green reproduction would have added a
data point to a question already answered. So the domain of the defect is the LOADER on that runner, not the specs —
which is why reading it per-spec drops members that are not defective and empties a batch to certify
nothing. Same family as `BL-CHANGES-FEED-MODAL-BATCH-FLAKE`, which measured the transient gateway
502 reaching the `/admin` error boundary on this same job.

**RATIFIED 2026-08-24 — the per-spec red counter advances only on a red that REPRODUCES on the
same bytes.** A non-reproducing red is an environment observation, not a spec earning a strike, which
is already what the amended AC-3 says about signature reds; this states the same thing for the
per-spec threshold that DROPS members, where it had been left implicit. The evidence is the
attempt-1/attempt-2 pair above: `needs-attention-page` had reached the batch-1 second-red threshold
with AC-4 fully applicable, and the replay of identical bytes cleared it while failing a different
spec. Applying the threshold to the unreproduced red would have removed a passing member, shipped
nine instead of ten, and restarted a five-green count on an artefact. The four drops recorded above
are unaffected: each was taken on evidence this rule does not disturb, and `telemetry-layout`'s two
reds were the same case in two separate runs rather than one run's replay.

**`admin-parse-panel`, `warning-panel-polish`, `telemetry-layout` and `published-show-attention` stay dropped for batch 2.** Each drop was
procedurally valid when it was made — the first two on a first red with no attribution, the last two
on a SECOND red for one spec, which is batch 1's threshold and the ruling's boundary (d) — and
re-adding them tonight would be churn on an arc whose bar is five consecutive green
runs. Their restoration is **batch 3's first question**, and their allowlist rows already carry every
run id a batch-3 reader needs.

**What `fix/admin-loader-ci-transient` (PR #882) closed, and what it did not.** It ships a bounded
retry at the Supabase RPC boundary plus the instrumentation that makes the fault visible, so the ONE
mechanism this row's log finally named — `AdminInfraError: requireAdmin: is_admin RPC failed: An
invalid response was received from the upstream server`, an upstream 502 on the admin gate (run 32763990640) — is absorbed and, when it recurs, leaves a durable `SUPABASE_UPSTREAM_RETRY` record
instead of being inferred from app logs.

The row stays OPEN because it is a CLASS and that is one member of it. Not every occurrence listed
above is an RPC 502: `notify-toggles` is a server action plus `router.refresh()` failing to settle
inside a 10 s poll, and `telemetry-layout` is a loader that never resolves at all, with the sidebar
and log at zero rects. Neither is a request the retry wrapper sees. The remaining scope is therefore
exactly the decision below, unchanged by this PR, plus the descoped
`BL-SUPABASE-UPSTREAM-FAULT-OBSERVABILITY` — and the shipping spec's §7.1 repairs four consumer
boundaries while explicitly claiming no completeness.

First scheduled step: decide whether the ratified open-time recovery (the changes-feed helper) can be
extended to a page-segment boundary at all, or whether the runner's Supabase bootstrap is what needs
hardening. Both are fleet decisions; neither belongs to a wiring arc. **`notify-toggles` now carries the second red on one spec that is batch 1's drop threshold, and it is wired on `main`,** so that step now also has to say what the threshold means for a member no batch owns: the choices are the recovery above, a targeted wait on that one server-action settle, or accepting a known-flaky required check on `main`. A wiring arc can record the occurrence, which is what this row is; it cannot choose between those three.

## BL-SUPABASE-UPSTREAM-FAULT-OBSERVABILITY — a transient upstream 5xx can be swallowed by its consumer, leaving the occurrence unattributable

**Status:** OPEN · **Filed:** 2026-08-24 (`fix/admin-loader-ci-transient`, descoped out of that spec by orchestrator ruling after the attribution design drew twelve of eighteen findings across three review rounds) · **Facing:** process · **Severity:** MEDIUM (it does not break a shipped surface; it means the NEXT occurrence of an already-recurring CI class is diagnosed by inference again) · **Class:** observability · **Effort:** M · **Reachability:** PROBED — the four boundaries below were each read at their error branch, and the shipping spec's §7.1 repairs the four while explicitly claiming no completeness. · **Incident:** `BL-ADMIN-LOADER-CI-TRANSIENT`'s own arc. Five counted spec review rounds, eighteen declared findings, twelve of them against three successive attribution designs (`docs/review-rounds/fix/admin-loader-ci-transient/bcd3d088ec76.md` and its `.jsonl`). Separately, that row's occurrence list is a set of CI reds whose mechanism had to be inferred from app logs because nothing captured the gateway's own state.

**What is missing.** A 502 from the local Supabase gateway is recorded only if the consumer that
receives it chooses to log the message. Many do not: two log a code without the message, one returns
it inside `infra_error` and never logs it, one discards it and returns a bare 500, and others swallow
it entirely (`components/admin/Dashboard.tsx` maps both a returned error and a throw to "Held";
`lib/admin/bellFeed.ts` returns `infra_error` without logging). The class is NOT bounded by the retry
population — it includes VOLATILE RPCs and plain table reads — which is precisely why enumerating
consumers failed three times.

**Honest state after the shipping PR.** `fix/admin-loader-ci-transient` repairs FOUR boundaries as
invariant-9 defects (`lib/admin/loadAlertSummary.ts`, `lib/admin/loadTelemetryStats.ts`,
`lib/admin/loadRecentAutoApplied.ts`, `app/api/show/[slug]/version/route.ts`) and claims nothing
beyond them. **Every other swallowing path stays dark until this row lands.** That is stated here so a
reader does not mistake the stopgap for the solution.

**The design this arc already paid for, so it is not re-derived.** Each item below cost at least one
review round:

- **Observe at the transport, not at the consumer.** A hook on the server-side client factories sees
  every call and no consumer can swallow it. Enumerating consumers is the wrong shape.
- **The recursion fence belongs on the LOG LEVEL, not on a client scope.** The durable sink persists
  `warn`/`error` through `createSupabaseServiceRoleClient` (`lib/log/persist.ts`), so an observer on
  that client emitting at `warn` observes its own persist write, without bound. `debug` reaches the
  console chokepoint synchronously and can NEVER persist — the `app_events` level CHECK admits only
  info/warn/error, and `tests/log/logger.test.ts` pins that `persist: true` on a debug call is inert.
  A property anchored in a database constraint survives a later scope change; a fence written about
  one mechanism did not survive being restated about a sibling.
- **Plant FOUR transport states, not two.** 5xx records; success is invisible with identical bytes; a
  rejected fetch rethrows the same error unwrapped (a hook written around `response.status` can throw
  its own TypeError and change the failure class); the body is never read or cloned (reading it
  consumes the stream and hands the consumer an empty response, a symptom that looks nothing like a
  logging change).
- **The workflow must CAPTURE the signal.** A later step cannot read an earlier step's stdout. Four
  mechanics, each with a failure mode worse than the one it prevents: `set -o pipefail` under
  `shell: bash` (without it the step's status is `tee`'s and a FAILING app-e2e reports success — a
  required check that cannot go red is worse than the flake it instruments), `2>&1` before the pipe
  (the records travel on stderr), `if: always()` on the grep step (else it is skipped exactly when the
  run failed), and an `id:` (the dump's condition references `steps.<id>.outputs.<name>`).
  `.github/workflows/x-audits.yml` already does all of this in four places.
- **Coverage is enforced, not asserted.** Three server-side clients are constructed directly rather
  than through a factory (`app/api/test-auth/set-session/route.ts` twice,
  `lib/dev/materialize/client.ts`). Each is exempt on a stated ground, and a walked meta-test makes a
  FOURTH fail by default.

**First scheduled step:** decide observer versus a capture-only approach on the evidence, then build
the plant-four harness BEFORE the spec, since three prose designs in a row each introduced the next
round's defect.

## BL-TAP-TARGET-LAYOUT-SUBPIXEL-TOLERANCE — a 0.5px equality on a webkit text-derived box flakes, and the job that would notice is dark on `main`

**Status:** OPEN · **Filed:** 2026-08-24 (`ci/app-e2e-batch2`, from that arc's own CI) · **Facing:** product · **Severity:** MEDIUM (the assertion guards the 44px tap-target floor, a crew-facing a11y contract; a guard that reds on identical bytes gets rerun by habit, and a guard rerun by habit stops being read) · **Class:** e2e flake / a11y guard fidelity · **Effort:** M · **Reachability:** PROBED — the byte diff below, taken across the two consecutive heads that disagree. · **Incident:** run 32760376685 on head `4be690393` red on an arc whose diff contains no rendering code at all, costing a diagnosis cycle and a rerun during a deep-queue window.

`tests/e2e/tap-target-inline-controls.layout.spec.ts:440` asserts cell bottom padding as an exact
equality with a half-pixel tolerance:

```
expect(driverCell.y + driverCell.height - (mailto.y + mailto.height),
  `cell bottom padding must be ${CELL_PAD_Y_PX}px (py-2)`).toBeCloseTo(CELL_PAD_Y_PX, 0);
```

On `mobile-safari` it measured `9.5096435546875` against an expected `8` — a 1.5px miss on a 0.5px
tolerance, with the file's other four cases green in the same run.

**It is a flake, and the proof is byte-level rather than a signature match.** The same job was GREEN on
head `e403da690` and RED on `4be690393`, which are consecutive heads on one branch. Everything that
test can load is identical between them:

```
$ git diff --name-only e403da690..4be690393 | grep -vE '^docs/|\.md$'
tests/docs/_metaLedgerReferentialIntegrity.test.ts
tests/docs/_retiredIdentifiers.ts
```

Two Vitest meta-tests, neither reachable from a Playwright browser context and neither on any render
path. The spec is not in that arc's diff, the arc never touched it, and the arc changes zero files
under `app/`, `components/` or `lib/`. Identical application bytes, identical spec, identical config,
opposite outcomes one run apart. The rerun cleared it.

**Why the tolerance is the suspect.** The measured box is derived from webkit text metrics, so its
height depends on font rasterisation that is not pixel-stable across runner load. `f816d2ca8`
recently TIGHTENED this file ("decompose the dead-space budget so the distribution is pinned too"),
which is the right direction for a guard and also what leaves it sitting on a half-pixel edge. The
question this row asks is not "loosen it": it is whether the invariant that actually matters — the
44px floor and disjointness — can be asserted without an exact-equality claim about padding, so the
guard keeps its teeth and stops reporting on rasterisation.

**The second half, and the reason this is filed rather than shrugged at: `main` cannot see its own
version of this.** `lifecycle-layout-e2e` is path-filtered, and `main`'s recent merges have been
docs-only, so the job has not run there — no `lifecycle` run appears in `main`'s last 30. A tightened
assertion can therefore sit latent on `main` and first surface on whichever unrelated PR next touches
a matching path, which is precisely how it surfaced here: on a wiring arc that changes no rendering
code. Whatever is decided about the tolerance, the dark-on-main window is its own finding.

**First scheduled step.** Re-run the case N times on one head under CI posture to size the flake rate
before touching the assertion — the tolerance may be one of several on that file's measurements, and
a per-assertion patch on a guard that just got tightened is the widening this project's round-economy
rules warn about. Sibling: `BL-ADMIN-LOADER-CI-TRANSIENT`, a different mechanism (loader faults) with
the same cost shape (a red indistinguishable from a spec defect).

## BL-E2E-EMPTY-STATE-REACHABILITY-RETIRED-ROUTE — the empty-state catalog's only real-browser proof navigates a route the picker pivot retired

**Status:** OPEN · **Filed:** 2026-08-22 (`ci/app-e2e-batch2`, deferred out of batch 2 by that spec's section 10) · **Facing:** product · **Severity:** MEDIUM (the §8.3 empty-state catalog has no live proof; the spec runs nowhere and would fail everywhere) · **Class:** e2e coverage · **Effort:** M · **Class-sweep exception:** (c) — re-targeting the route and replacing its four `toHaveScreenshot` assertions with behaviour assertions is a rewrite of a spec batch 2 does not otherwise touch. · **Reachability:** PROBED — the run line below.

`tests/e2e/empty-state-reachability.spec.ts` navigates `/show/<slug>` (line 154). The M11.5 picker
pivot retired that route: there is no `page.tsx` under `app/show/[slug]/`, the crew route is
`/show/[slug]/[shareToken]`, and the page renders none of the tile testids the spec waits for. Batch
2's membership run measured it at **0 of 4 per project, both projects** — every case failed at
`toBeVisible` on `venue-tile` / `show-status-tile` / `tile-grid` / `stale-footer` after the `goto`
(probe record section 4.1, rows 2-5 and 17-20).

Two independent blockers, either sufficient, which is why this is a rewrite rather than a wiring gap:
the retired route above, and four `toHaveScreenshot` assertions comparing bytes against committed
`-darwin.png` baselines, which the byte-comparison discipline forbids on `app-e2e.yml`'s native Linux
runner. Closing it means re-targeting the route AND either replacing the pixel assertions with
behaviour assertions or moving the spec to the pinned-Docker screenshots job.

Its `UNSEEN` allowlist row stays until then, which is the conservative outcome batch 2's consequence
bound requires: a spec is either wired and proving its identities, or left on the allowlist with the
run line that says why.

---

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

## BL-MUTATION-HARNESS-PR-TRIGGER-FANOUT — the harness's path-filtered PR trigger runs the whole matrix on every harness-touching PR, and those legs compete with that PR's own required checks

**Status:** OPEN. · **Filed:** 2026-08-16 (`docs/mutation-ledger-accuracy`, from the shipping arc of #834 — it existed only in that arc's handoff message until now) · **Severity:** MEDIUM (it does not fail anything; it delays the merge path for exactly the PRs least able to afford it) · **Class:** CI capacity · **Effort:** S

#834 split `mutation-harness` from ONE queued job into a matrix, and the same PR gave the workflow a path-filtered `pull_request` trigger. The trigger was right on its own terms — `workflow_dispatch` on a NEW workflow only works once the file is on the default branch, so a path-filtered PR run was the only way to validate the sharding against real Actions before merging it. What was not priced is the standing cost afterwards.

**Reachability: PROBED.** A harness-touching PR enqueues one job per matrix leg plus two cheap coordinators — `parser-shards` ×`PARSER_SHARD_COUNT`, `parser-gates`, `source-shards` ×`SOURCE_SHARD_COUNT`, `source-gates`, then `budget` and `notify`. **Measured 2026-08-16: 16 jobs, 14 of them full test legs** (8 + 1 + 4 + 1). The count is stated as a measurement with a date rather than as a property, because both shard counts are tunable and raising either makes the fan-out worse, never better. `SOURCE_SHARD_COUNT` is the live one: per the wallclock correction in `BL-MUTATION-HARNESS-WALLCLOCK-CEILING`, the binding leg was already at 93.2% of budget when it was measured at 29 surfaces, and a 30th has been enrolled since without ever being run — so the question is not whether a future enrolment will force the count up, it is whether the enrolment that already happened has done so, and nobody has measured. Measured consequence on the shipping arc itself: those legs occupied the account's queue alongside that PR's own required checks, and the arc CANCELLED its own harness run to get its required checks moving. The legs are long as well as numerous — on run 31989590619 the four source legs recorded 886 s, 2166 s, 3069 s and 3356 s, the eight parser legs 836 s to 1753 s, and on two earlier runs one source leg was cancelled at its 90-minute ceiling.

The filter is not loose by accident — it covers the eight parser shard files, the parser gates file, the whole `tests/mutation/**` tree, `lib/ci/shardBudget.ts`, `scripts/check-shard-budget.ts`, and both vitest wiring files, each for a stated reason. The problem is that harness work is precisely the work that edits those paths, so the arcs paying this cost are the ones iterating on the harness, repeatedly.

**Direction, stated not implemented** (the choice belongs to whoever owns the harness's CI shape): narrow the filter so that wiring-only or ledger-only edits do not fire the full matrix; or split the trigger by harness, so a `tests/mutation/**` edit fires the four source legs and not the eight parser ones; or move the shards to the nightly and keep only the gates files on PRs, which preserves the fast structural signal and drops thirteen legs. Any of them wants the `concurrency` cancel-in-progress behavior left exactly as it is.

---

## BL-CODEX-GUARD-SPECLINT-PREDISPATCH-GATE — a dispatch spends reviewer attention on lint the wrapper could have refused

**Status:** OPEN · **Severity:** LOW (no shipped defect; this is review-economy waste) · **Class:** review tooling / dispatch hygiene · **Effort:** S · **Filed:** 2026-08-18 (`fix/control-outline-border-token`, spec review R1 F2 + R2 F5) · **Facing:** process · **Class-sweep exception:** (c) — the repair is a change to `scripts/codex-guard.mjs`, a surface this arc does not otherwise touch · **Reachability:** PROBED — both incidents are committed corpus rows, and the failing lint reproduces on the pre-repair blobs.

`node scripts/codex-guard.mjs review` already refuses a round-1 `--stage diff` brief whose `GUARD SURFACE:` line carries no mutation score, exiting 2 before any dispatch. It makes no equivalent check on the ARTIFACT under review. So a spec or plan carrying hard `pnpm spec:lint` failures dispatches normally, and the reviewer spends a finding — and the arc spends a round — on a class the repo already detects mechanically in under a minute.

**Incident.** This arc, twice. Spec review R1 F2 reported **18 hard citation failures** (all the empty-path `` `:213` `` form) against `docs/superpowers/specs/2026-08-18-control-outline-border-token-design.md`; R2 F5 reported **13 more** in the sibling probe record. Both were `CITATION_MALFORMED`, both are what `pnpm spec:lint` prints, and neither needed a reviewer to find. Corpus rows: `docs/review-rounds/fix/control-outline-border-token/2ddbf038bdf4.jsonl`, rounds 1 and 2. Two findings out of sixteen across four rounds — roughly an eighth of the arc's total reviewer attention — spent on a mechanical class.

**Incident, second class (2026-08-21, cross-arc).** `pnpm typecheck` is a SECOND mechanical gate the same refusal could cover. Three arcs in one day (`feat/speclint-red-reason-verification`, `fix/shell-attached-redirection-target`, `feat/destructive-guard-discovery-by-connection`) independently committed probe scripts that import with a `.ts` extension (TS5097) or call `ts.isImportKeyword` (runtime-only, TS2339); `tsx` resolves both, so every local run passed, and the third arc's probes survived twelve commits and four adversarial rounds — because reviewers run sandboxed and read-only and never execute the gates, so a round is BLIND to a gate-red by construction. Caught only by `pnpm typecheck`, which docs-stage work rarely runs. Same wrapper, same exit-2 refusal, one more gate in the list.

**Incident, third instance (2026-08-21, independently filed).** `feat/speclint-red-reason-verification` spent a diff-round-3 finding on its plan failing its OWN `spec:lint` — `CITATION_MALFORMED at line 72: malformed citation \`:837\` (empty path)`, the same empty-path form as the eighteen above. Corpus row: `docs/review-rounds/feat/speclint-red-reason-verification/c9c71b947a85.jsonl`, `diff`round 3,`findingCount`2 (the round carried a second finding, so the round is not chargeable here; the reviewer attention is). That arc filed it as`BL-SPECLINT-SELFLINT-NOT-IN-PREDISPATCH-GATE`, blind to this row, which sat on an unmerged branch at the time — which is itself the point: the same defect was independently rediscovered by a session reading `origin/main` to choose work. Its own diagnosis is worth keeping verbatim: that plan declared two oracles as COMMANDS and this obligation as a PARAGRAPH, and the commands ran several times each while the paragraph ran zero times.

**Shape of the repair.** In `review`, when `--stage` is `spec` or `plan`, resolve the artifact path(s) the brief cites, run the existing lint, and exit 2 naming the failing file and count if any HARD failure is present. Advisory failures do not block — the probe-record artifacts show advisory noise is normal and blocking on it would be its own waste. The escape hatch matches the existing ones in that script (an explicit flag), because a brief may legitimately review an artifact that is mid-repair.

**Why the wrapper and not a habit.** The habit is already written down and was not followed on this arc by the session that wrote this entry. `codex-guard` is the single choke point every dispatch passes through, which is exactly why the mutation-score check lives there rather than in a checklist.

**First scheduled step:** confirm the lint's exit contract is stable enough to gate on (it currently exits 1 on hard failures and prints a `summary: N hard, M advisory` line), then add the check beside the existing `GUARD SURFACE:` refusal so both live in one place.
