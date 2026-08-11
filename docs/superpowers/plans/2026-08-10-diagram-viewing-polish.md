# Plan: diagram viewing polish — zoom-gated original, blur closure, failed-thumbnail a11y

**Spec:** `docs/superpowers/specs/2026-08-10-diagram-viewing-polish.md` (APPROVED, round 7, 0 findings) · **Branch:** `feat/diagram-viewing-polish` · **Implementer:** Opus / Claude Code (UI surfaces — routing hard rule)

**Meta-test inventory (declared):** EXTENDS the `T-DIAGRAM-VARIANTS` e2e family in `tests/e2e/crew-layout-dimensions.spec.ts` (updates two superseded URL oracles, adds two cases), the `phantom-gap-e2e.yml` diagram step (adds `--project=desktop-chromium` + a NEW executed-count oracle on the `check-crew-e2e-executed.mjs` pattern), and the pipeline spec's §6 back-reference. CREATES one registry-bearing enrollment: the new executed-count checker module joins the source-mutation registry (R4 F2). Advisory locks / Supabase boundaries / admin alerts: none applies — the diff is client components, one e2e file, one workflow, and docs. New telemetry: none (announcements are UI live regions, not log emits; the surfaces are non-admin crew UI with no new mutation surface).

**Layout-dimensions task:** N/A — the spec's Dimensional Invariants section declares none new; the existing geometry gate keeps pinning the cells (no re-baseline).

**Transition-audit task:** REQUIRED — folded into Tasks 1 and 3 with the spec's inventory table VERBATIM (R1 F3):

| pair | treatment |
| --- | --- |
| active slide, `wantsOriginal` false → true | instant loader swap; bitmap keeps painting until the original loads (silent sharpen) |
| sharpening in flight → slide becomes inactive (Embla) | clamped tier as today; fetch may complete unobserved. Instant |
| inactive slide with `wantsOriginal=true` → active again | `pinOriginal` immediately, no new gesture. Instant |
| sharpening in flight → lightbox closes | unmount; existing teardown guards. Tested (R1 F3) |
| thumbnail available → failed (had focus) | swap + relocation + one announcement. Instant |
| thumbnail available → failed (no focus) | swap + announcement only |
| fails WHILE lightbox open | lightbox-local announcement; restore-target closure |
| fails DURING the 220 ms exit window | buffered, flushed on `onExitComplete`; closure via ref bridge |

Compound rows tested too: zoom gesture mid-sharpen (transform layer src-agnostic — asserted no gesture interruption on src swap); multiple failures mid-announcement (log appends). Table cells are summaries; the spec's Transition Inventory is normative where wording differs (R2 F2). The audit step disposes EACH live render site, enumerated from the live tree (R2 F2): `Gallery.tsx` lines 116, 136, 152, 183, 209, 216, and the `AnimatePresence` at 236-237; `GalleryLightbox.tsx` lines 66-68, 395-400, 464, 488, 512-513, 578-580, 673, 754, 779 — every one audited animated-or-deliberately-instant in the Task 3 suite body, plus any sites the implementation adds.

**Plan-time red transcript (run 2026-08-10, this worktree):** Task 4's line-anchored marker grep → exit 1; Task 5's negated entry-heading grep → exit 1; both new suite files absent (`ls` → No such file); `grep -n wantsOriginal components/diagrams/GalleryLightbox.tsx` → no matches (Task 1's red basis); Task 2's red is deliberately post-Task-1 (the wired case is green today by design).

**e2e harness readiness:** boots via the existing playwright port-3000 webServer used by the wired diagram cases; readiness gates are the existing `T-DIAGRAM-VARIANTS` seed + hydration helpers; detach-safety: the new failure-injection cases locate elements fresh after each `onError` (no held locators across unmounts).

<!-- tasks: depth=2 -->

## Task 1 — Zoom-gated original (loader wiring + per-slide state)

<!-- task: red=`pnpm vitest run tests/components/diagrams/galleryLightbox.zoomGate.test.tsx` ac=AC-1,AC-2 -->

Red is written by this task (invariant-1 shape): the new component suite fails against the live tree because `components/diagrams/GalleryLightbox.tsx:661` passes `pinOriginal: true` UNCONDITIONALLY on the active slide — there is no `wantsOriginal` state, no intent path wiring, and no per-slide map (verified on the live tree 2026-08-10).

1. Per-slide `wantsOriginal` map keyed by slide identity; flips on the FOUR path classes (committed pinch via the existing 1.01 commitment detection around `GalleryLightbox.tsx:79`, Ctrl/Meta-wheel + trackpad pinch via `GalleryLightbox.tsx:549`/`GalleryLightbox.tsx:608`, keyboard `+`/zoom control, double-tap), derived from scale crossing the 1.01 bound so future paths cannot bypass; never resets within the lightbox session.
2. Active slide's loader gets `pinOriginal: wantsOriginal[slide]`; variant-less entries unchanged (URL equality both states).
3. Tests (spec §6 list): four intent paths; de-zoom persistence; **isolation + session persistence** (zoom A → B clamped → return A pins WITHOUT new gesture — a global or reset-on-selection boolean fails); URL oracles read off the LOADER's return (anti-tautology), tiers derived from fixture ladders.
4. UPDATE the existing suite's superseded assertions (R1 F1): `tests/components/diagrams/GalleryLightbox.test.tsx:209` region, `tests/components/diagrams/GalleryLightbox.test.tsx:400`, and the `tests/components/diagrams/GalleryLightbox.test.tsx:427` region assert the unzoomed active slide uses the ORIGINAL — the amended contract flips them; rewrite to the clamped-tier expectations, and refresh the stale inventory prose near the top of that file (its lines 11 and 39).
5. Green: both suites pass.

## Task 2 — E2E contract update + CI binding

<!-- task: red=`sh -c 'BASELINE_SERVER_ONLY=1 pnpm exec playwright test tests/e2e/crew-layout-dimensions.spec.ts -g "T-DIAGRAM-VARIANTS" --project=mobile-safari'` ac=AC-1,AC-5 -->

Red is OBSERVED after Task 1 lands (same command, currently green): the wired mobile case asserts the active slide serves the ORIGINAL (`tests/e2e/crew-layout-dimensions.spec.ts:2066`, `tests/e2e/crew-layout-dimensions.spec.ts:2084`, `tests/e2e/crew-layout-dimensions.spec.ts:2144`) — the exact contract the spec amends, so Task 1's implementation flips it red for the stated reason before this task repairs the oracles.

1. Update the three superseded URL oracles to the clamped-tier contract (geometry assertions byte-untouched; no re-baseline).
2. Add the two new cases as `T-DIAGRAM-VARIANTS` members: desktop-chromium network-order gate (no original request before programmatic zoom; original fires + `currentSrc` upgrades after), mobile-safari tier assertion. DECLARED `test.skip(project !== …)` per project — bare early returns prohibited for the new cases.
3. `phantom-gap-e2e.yml` diagram step (R1 F2, concrete): add `--project=desktop-chromium`; `--reporter=list,json` with the reporter env var set to the new report path test-results/phantom-gap-diagrams-report.json (value registered in the `governs` allowlist, reconciled against `tests/ci/_workflowCoverageScan.ts:703` region using the meta-test's own failure output, AND the allowlist's consumer-enumerating reason comment at `tests/ci/_workflowCoverageScan.ts:736` region updated to name the new third checker — R2 F4); a NEW checker script (basename check-phantom-gap-executed.mjs under scripts/) that parses the JSON report's suites with BOTH `projectName` and case title (the existing `check-crew-e2e-executed.mjs` collapses to a per-file Set and cannot express case×project — this checker keys on `(title, project)` pairs), REQUIRED pairs derived from a real run; the checker is AUTHORED AS AN IMPORTABLE MODULE with a thin CLI wrapper and a referring Vitest suite whose fixture is the doctored skipped-case report (the constructed RED), and ENROLLED in the source-mutation registry (`tests/mutation/source/registry.ts`) with the FULL declared operator-family set (all six generic source operators, `tests/mutation/source/operators.ts` `OPERATOR_NAMES` — no subset enrollment; R5 F2), `pnpm mutation:guards` run, and the score plus an EMPTY unaccepted-survivor set recorded (R3 F3/R4 F2); add the checker to the workflow step, update the workflow's path-filter triggers (`phantom-gap-e2e.yml:27` region) so checker/spec changes re-run the job, and refresh EVERY comment the desktop case falsifies (R5 F3): the workflow header (`phantom-gap-e2e.yml:23` region) AND the e2e file's own prose — the desktop-early-returns statement at `tests/e2e/crew-layout-dimensions.spec.ts:38`, the crew-describes-run-on-mobile assertion at `tests/e2e/crew-layout-dimensions.spec.ts:1366`, and the diagram harness's mobile-safari-only statement at `tests/e2e/crew-layout-dimensions.spec.ts:1391` — swept with a grep for mobile-only claims across the file in the same commit.
4. Pipeline-spec §6 back-reference commit (`docs/superpowers/specs/crew/2026-08-09-private-image-pipeline-design.md:146` region gains the amendment pointer; no other contract line changes — AC-5).
5. Green: the red command passes with the updated oracles; the new cases execute under their projects per the oracle.

## Task 3 — Failed-thumbnail focus + announcements

<!-- task: red=`pnpm vitest run tests/components/diagrams/gallery.failedItem.test.tsx` ac=AC-3 -->

Red is written by this task (invariant-1 shape): the new suite fails against the live tree because `components/diagrams/Gallery.tsx:198` swaps the failed cell to a non-interactive div with NO focus relocation, NO announce region (`gallery-announce-log` absent from the tree), and no restore-target ref (verified on the live tree 2026-08-10).

1. Two `AnnounceLogRegion`s: Gallery root (`label="Diagram updates"`, `testId="gallery-announce-log"`), lightbox-internal (`label="Diagram viewer updates"`, `testId="lightbox-announce-log"`); three-state routing (open → lightbox channel; exiting → Gallery-owned buffer flushed on `AnimatePresence` `onExitComplete`; browse → gallery channel); messages follow the alt-else-`Diagram <n>` scheme (`Gallery.tsx:156`).
2. Focus: relocation order (next / prev / show-more / list `tabIndex={-1}`); `restoreTargetRef` (stable mutable ref) passed to the lightbox and into `useDialogFocus` as a NEW OPTIONAL options parameter — `lib/a11y/dialogFocus.ts:46` region changes, signature BACKWARD-COMPATIBLE (the existing third positional `reattachKey` is NOT repurposed; all existing call sites compile unchanged — R1 F5); retarget CLOSURE on every failure that removes the current restore target, in open and exit states alike. Regression: `pnpm vitest run tests/lib/a11y/dialogFocusReattach.test.tsx` (path corrected R2 F1) plus the suites of the helper's other consumers (enumerated by grep at implementation time) run green.
3. Tests (spec §6 + Transition Inventory rows verbatim in the suite): both channels' before/after oracles (exists-empty → same-node keyed child → other channel untouched); the THREE-phase exit-buffer oracle (empty before; both untouched while exiting; exactly one gallery addition after flush); focus relocation per availability configuration; the detached-trigger probe sequence; the succession closure (A→B→C); no-focus failure relocates nothing; **stale-`onError` guard (R1 F4): a delayed handler firing after the item is no longer rendered announces NOTHING (tested with a collapsed/unmounted item);** per-case premises asserted before measuring.
4. Green: suite passes; existing Gallery/lightbox suites green.

## Task 4 — Impeccable dual gate (invariant 8)

<!-- task: red=`grep -qE "^impeccable-gate: critique=RAN" docs/superpowers/plans/2026-08-10-diagram-viewing-polish.md` ac=AC-6 -->

Red now (line-anchored grep exits 1 — the only occurrence is this marker comment, not at line start). Run both halves of the invariant-8 dual gate (`/impeccable`, critique mode then audit mode, canonical v3 setup). Expected deltas: none visual at rest (loader/state changes + live regions); the gate verifies. Fill the §12 marker + the full findings table — where EVERY P0 and P1 is FIXED or explicitly deferred via a `DEFERRED.md` entry (invariant 8's own bar; accepted-with-reason is available to P2/P3 ONLY — R3 F1) — then RERUN the same command and observe exit 0.

## Task 5 — Graduations + merge sequence

<!-- task: red=`sh -c '! grep -q "^## BL-LIGHTBOX-ORIGINAL-PROGRESS-AFFORDANCE" BACKLOG.md'` ac=AC-4 -->

Red now (the entry heading exists; the negated grep exits 1; green when all three rows graduate — same command on the first row as the representative, with step-level greps for the other two).

1. ORDERING (R1 F6, refined R2 F3 — review must cover what merges AND the graduation commit must be last): PREPARE the graduation content UNCOMMITTED (archive moves, marker removal, three registry rows) BEFORE the whole-diff review, and include the staged diff in the review's scope; after APPROVE and any repairs — where ANY UI-touching repair reruns BOTH gate halves and REWRITES the §12 marker AND findings table from the LATEST rerun's actual findings (R3 F2/R4 F1; the guard checks syntax only, so freshness is this plan's own contract) — commit the already-reviewed graduation content as the final commit. Nothing unreviewed merges.
2. The graduation commit: all three rows to the archive with their dispositions (amendment / probe closure / repair), markers off in the same commit, and three `BACKLOG_GRADUATED` registry rows (`BL-LIGHTBOX-ORIGINAL-PROGRESS-AFFORDANCE`, `BL-DIAGRAM-BLUR-EDGE-SIZE`, `BL-GALLERY-FAILED-ITEM-FOCUS-AND-ANNOUNCE`) in `tests/docs/_metaDeferralLedgerGraduation.test.ts` — the registry diff is exactly these three additions, reconciled in the commit body (the authored-AND-run registry rule). Completion checks: all three headings present in `BACKLOG-archive.md` and absent from `BACKLOG.md`; `pnpm vitest run tests/docs` green.
3. Real CI green (including the phantom-gap run exercising the new oracle); `gh pr merge --merge`; fast-forward main; `0  0` check.

<!-- tasks: end -->

## Acceptance criteria (crosswalk to the spec's §8)

- AC-1: clamped tier on open; original only after intent, all four path classes (network-log assertion).
- AC-2: variant-less entries URL-identical both states.
- AC-3: focus never lands on body (open, exit-window, succession cases); every failure announced per the three-state routing.
- AC-4: three rows graduate with dispositions recorded.
- AC-5: pipeline-spec back-reference only; no other contract line changes.
- AC-6: the invariant-8 dual gate (both halves) run with P0/P1 dispositioned.

## §12 — impeccable gate record

impeccable-gate: critique=RAN audit=RAN p0=0 p1=0 dispositions=none

Run 2026-08-11 against `components/diagrams/**` plus `lib/a11y/dialogFocus.ts` and
`components/admin/announceLog.tsx` (both changed by this arc). `dispositions=none` is the guard's
cross-check for `p0=0 p1=0` — the FINAL round raised no P0 and no P1, so there is no open
disposition to declare. Everything the earlier rounds raised is dispositioned in the table below;
the marker describes the state of the code as shipped, not the history that got there.

**Method.** Both halves run as isolated sub-agents (critique: design review + deterministic detector, kept isolated until synthesis; audit: 5-dimension code-level scan). Browser visualization SKIPPED on every run and reported as such — the crew route is Supabase-backed and needs seeded auth, so no dev server was started and no user-visible overlay is claimed. Four rounds: an initial pair, then a rerun after each batch of repairs, per this plan's Task 5 freshness rule. **The table below is the FINAL round's findings**, taken against the code as shipped.

**Final round scores.** Critique 38/40 (Exceptional). Audit 20/20 (Exceptional; Accessibility 4, Performance 4, Theming 4, Responsive 4, Anti-Patterns 4). Anti-patterns verdict: PASS on both halves — no absolute-ban hits, no product-register violations. **P0 = 0, P1 = 0 on both halves.**

**Deterministic detector.** `detect.mjs --json components/diagrams` → 7 hits, all rule `broken-image`, **all 7 false positives**, re-verified line by line each round: every hit is the literal token `<img>` inside a JSDoc or JSX prose comment explaining why a raw `<img>` was replaced by `next/image` with a custom loader. `grep -n "<img"` returns only those comment lines; neither file renders an `<img>` element. `eslint` clean, `tsc --noEmit` clean, `tests/components/diagrams/` 131 passing.

### Findings and dispositions

Every finding raised across all four rounds, most severe first. "Fixed" means fixed in this branch with a test that fails without the fix.

| # | Sev | Half | Finding | Disposition |
| --- | --- | --- | --- | --- |
| 1 | P0 | critique | The zoom gate made the original a fetch the USER triggers, so on venue wifi a pinch could turn a painted, readable 1024px view into "Image unavailable" — the gesture meant to read the plot destroying it. | **FIXED.** A zoom-triggered original failure DEMOTES to the clamped tier, announces once, and leaves the gesture untouched; `demotedRef` prevents the re-pin loop the published scale would otherwise cause. `galleryLightbox.zoomGate.test.tsx` (5 cases). |
| 2 | P1 | critique | No recovery path on any image failure: `failedKeys` never clears, the announcement offers no next step, the replacement cell is inert. | **DEFERRED** — `DEFERRED.md` `DIAGRAM-FAILURE-RECOVERY-1`. Reason (a): the retry affordance, its copy, and which tier it retries are one product decision, and the no-ETag asset route makes a naive retry a full re-download. |
| 3 | P1 | audit | The re-open flush appended into a live region node created in the same commit, so `role="log"` had no addition WITHIN a live log to present. | **FIXED.** The re-open drain moved into an effect, one commit after the region is live. Pinned by a MutationObserver oracle that fails if the entry arrives with the region rather than into it. |
| 4 | P1 | critique | The branch that DEGRADES the view announced; the branch that DESTROYS it was silent, while focus jumped to Close — a screen-reader user heard only "Close gallery". | **FIXED.** The active-slide destroy branch announces by name, using the same scheme as the aria-label. |
| 5 | P1 | audit | Activating a chevron at a bound disabled it, the browser blurred it to `<body>` outside the `aria-modal` dialog, and both the non-Escape keymap gate and the Tab trap then dead-ended. | **FIXED.** The used chevron hands focus to its opposite when it is about to be disabled, and only when it actually held focus. |
| 6 | P1 | both | `onAnnounce` is a prop, and `AnimatePresence` freezes an exiting child's props — so a lightbox failure inside the 220 ms exit window routed through a stale-open closure into a frozen region and was then wiped. Probe-confirmed by both halves independently. | **FIXED.** `routeAnnouncement` reads openness from a ref, written synchronously on open and on close; the message now buffers and is delivered on `onExitComplete`. |
| 7 | P1 | both | The Reset chip unmounts on every de-zoom path (`0`, `-`, chevrons, pinch-out) and is Tab-reachable; only its own click relocated focus, so the others stranded focus on `<body>`. | **FIXED.** A `useLayoutEffect` conditioned on WHERE FOCUS IS (not a was-focused flag, which browsers disagree about clearing) relocates to Close before paint. |
| 8 | P2 | critique | Exit-buffer messages were stranded when a re-open cancelled the exit (`onExitComplete` never fires), and a message routed before the dialog channel published hit a null ref. | **FIXED.** Both holes closed — the channel is now ordinary props with the state owned by the Gallery, and the buffer drains on both ways the window can end. |
| 9 | P2 | audit | The dialog channel accumulated across lightbox sessions, so a new session mounted a region pre-loaded with the last one's failures. | **FIXED.** `useAnnounceLog` gained an additive `reset()`; the dialog channel is cleared on `onExitComplete`. Existing admin consumers verified unchanged. |
| 10 | P2 | audit | `successorTo` used `isConnected`, which reports current attachment and not pending removal, so a sibling failing in the same tick could receive focus moments before unmounting. | **FIXED.** `pendingFailuresRef` records the id before relocation; `usable()` rejects pending ids. |
| 11 | P2 | critique | The sharpen has no state signal for anyone, including the low-vision user pinching for legibility. | **ACCEPTED** — ratified out of scope by the decision round (spec §1.1, §7 documented limits). Not re-litigated. |
| 12 | P2 | critique | The demote is silent for SIGHTED users: the only signal is an `sr-only` region. | **DEFERRED** — `BACKLOG.md` `BL-DIAGRAM-DEMOTE-SIGHTED-PARITY`. Reason (a): new chrome on a surface whose decision round declined new chrome during the sharpen; the failure-notice/progress-affordance boundary is a product call. |
| 13 | P2 | critique | Full resolution is now reachable only through an undiscoverable gesture; no on-screen zoom control, no keymap hint. | **ACCEPTED** — the gate itself is the ratified design (spec §4.1, decision round 2026-08-10). |
| 14 | P2 | critique | The demote is permanent for the lightbox session. | **ACCEPTED** — deliberate. Re-spending a multi-megabyte fetch on a link that just failed is the worse failure mode; closing and reopening clears it. |
| 15 | P2 | audit | Two polite regions in one dialog (`role="log"` failure channel + `role="status"` zoom region) can interleave during a pinch. | **ACCEPTED** — low reachability (requires a demote mid-gesture), and merging them would supersede the ratified zoom-announcement contract. |
| 16 | P2 | audit | `useTransformEffect` drives `setActiveScale` on every transform sample, re-rendering the slide list at gesture frame rate. | **ACCEPTED** — pre-existing shape, not introduced here; the arc's own change removes work from that path rather than adding it. |
| 17 | P2 | audit | Inactive carousel slides are not `aria-hidden`, so all N images and figcaptions sit in the accessibility tree with no current marker; consequently, arriving on a slide that failed while inactive is silent. | **DEFERRED** — `BACKLOG.md` `BL-LIGHTBOX-INACTIVE-SLIDES-IN-A11Y-TREE`. One attribute, but it moves several role-based queries and belongs with the current-slide announcement decision. |
| 18 | P2 | audit | Both crew announce channels ship without the `ttlMs` their own module prescribes for channels that outlive their announcements. | **DEFERRED** — `BACKLOG.md` `BL-DIAGRAMS-ANNOUNCE-CHANNEL-TTL`. The module settles the strand-hazard/accumulation trade per channel; settling it for two new ones belongs with a look at sharing the admin provider. |
| 19 | P3 | critique | The gallery `<ul>`, now a focus target, lost list semantics to Tailwind preflight and had `focus:outline-none` with no replacement indicator. | **FIXED.** Explicit `role="list"` plus a `focus:ring-2 focus:ring-focus-ring` (`:focus`, not `:focus-visible` — it is only ever focused programmatically). |
| 20 | P3 | audit | The keydown effect listed `activeScale` as a dependency without reading it, re-binding a window listener every pinch frame. | **FIXED.** Dependency removed; `onKey` reads only `requestedScaleRef`, verified. |
| 21 | P3 | critique | "lower-resolution" is jargon for the crew register. | **FIXED.** Copy is now "<name>: full detail could not be loaded. Showing a less detailed view." — named, because a demote buffered in the exit window is delivered after the viewer is gone. |
| 22 | P3 | audit | `flushExitBuffer`'s doc-comment claimed two call sites when the second drain had moved into an effect. | **FIXED.** Comment corrected in the same commit. |
| 23 | P3 | both | Unavailable-state vocabulary splits between a raw `⊘` glyph in the lightbox and lucide `ImageOff` in the gallery. | **ACCEPTED** — pre-existing and cosmetic; both carry equivalent `sr-only` text. |
| 24 | P3 | audit | Failing a slide AND its still-mounted thumbnail produces the same sentence twice in one log. | **ACCEPTED** — two elements really did fail, and `role="log"` is the ratified shape for legitimately recurring text. |
| 25 | P3 | audit | `focus:outline-none` plus a box-shadow ring is invisible under forced-colors. | **ACCEPTED** — pre-existing app-wide pattern (close button, reset chip, chevrons all share it); a forced-colors sweep is its own arc. |
| 26 | P3 | audit | Per-render recreation of the thumbnail `ref` callback and `makeDiagramLoader`. | **ACCEPTED** — URLs are string-identical so nothing refetches; the cost is wasted render work only. |
| 27 | P3 | audit | The unreachable `closeRef` fallback in the chevron guard (both chevrons render under one condition). | **ACCEPTED** — defensive, zero cost. |
| 28 | P3 | audit | The chip-relocation layout effect also runs at mount, focusing Close before `useDialogFocus` captures its trigger snapshot. | **ACCEPTED** — latent only: the Gallery always sets `restoreTargetRef`, which takes precedence over the snapshot, so the shadowed value is unreachable. |
| 29 | P3 | audit | A clamped-tier error racing zoom intent in the same tick takes the demote branch and says "showing a less detailed view" though nothing painted. | **ACCEPTED** — self-corrects on the refetch, which reaches the destroy branch; consistent with the ratified "the condition is the REQUESTED TIER" rule. |
| 30 | warn | detector | 7 × `broken-image` in `components/diagrams/**`. | **FALSE POSITIVE**, re-verified every round: each hit is the literal token `<img>` inside a prose comment. Neither file renders an `<img>`. |

## §13 — whole-diff review record

Three dispatches. Rounds 1-2 ran against base `a7393880ae6d`; `origin/main` was then merged in (see below) and the post-merge round ran against `876cbd06c156`, which is a NEW corpus file by design — the rows are keyed by merge-base and are never consolidated.

| round | verdict | findings | disposition |
| --- | --- | --- | --- |
| diff R1 (`a7393880ae6d`) | NEEDS-ATTENTION | 1 LOW | FIXED. Three guard rationales still described the diagram e2e cases as carrying bare early returns after this arc converted them to declared skips. Class-swept. |
| diff R2 (`a7393880ae6d`) | NEEDS-ATTENTION | 1 HIGH, 1 MEDIUM | Both FIXED. See `efb779fe2`. |
| diff R1 (`876cbd06c156`, post-merge) | BLOCKING | 1 P0, 1 MEDIUM, 1 LOW | MEDIUM and LOW fixed; the P0 REFUTED — see below. |

**Why the merge happened mid-review.** `origin/main` had moved 20+ commits past this branch's base, leaving PR #780 `CONFLICTING`. GitHub cannot build a merge commit for a conflicting PR, so ZERO Actions workflows had run and the only green checks were Vercel's — "CI green" would have been a reading of two checks that test nothing about this diff.

### The refuted P0, recorded so a later round does not re-derive it

**The claim.** All three graduations were committed in `0bdce4372`, before the merge, the R2 repairs and the formatting commit — so the markers did not come off in "the PR's last commit", violating invariant 12 and AC-4.

**Why it does not hold.** AGENTS.md invariant 12 carves this case out in its own text: *"(A graduating entry's marker comes off in the same commit that archives it — archives categorically reject in-progress entries, so it cannot ride along.)"* The rejection is not a convention but an executable one: `tests/docs/_metaLedgerInProgress.test.ts:77` asserts *"keeps in-progress out of the archives"*. The finding's prescription — carry the markers to a later commit — is therefore unsatisfiable for a graduating entry: re-adding them to `BACKLOG-archive.md` would red that guard. The "last commit" clause governs entries that stay in the active queue, where the marker and the entry can be separated.

**What is true in it.** Between the graduation commit and the merge, `pnpm ledger:claims` shows no claim on these three rows while this branch was still working on them. That window is inherent to graduating entries under the carve-out, and the plan's own ordering requirement (the graduation content is REVIEWED, then committed) was met.

### The other two, both fixed

- **MEDIUM — `hasVariantTier` could not prove a LOWER tier existed.** It took only `variants`, so a well-formed row naming the ORIGINAL key (`{ width: 256, key: <the original> }`) passed every §4 guard and returned true, while both loader states resolved to one URL. The predicate now takes the original key and asks whether any valid row differs from it. Reviewer confirmed the old behavior by direct execution; the repair carries its own case.
- **LOW — a formatter-mangled conflict marker in `BACKLOG-archive.md`.** `> > > > > > > origin/main`: Prettier reads a seven-deep blockquote and re-spaces it, which the contiguous-glyph guard cannot see. Main's pre-existing content, and left alone in the merge commit on purpose — but a guard that cannot see a corrupt document is the more interesting half, so `tests/docs/_metaNoConflictMarkers.test.ts` now recognises the mangled shape (with cases proving it fires on seven levels and not on six), and the line is gone.
