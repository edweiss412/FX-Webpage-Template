# Plan: diagram viewing polish — zoom-gated original, blur closure, failed-thumbnail a11y

**Spec:** `docs/superpowers/specs/2026-08-10-diagram-viewing-polish.md` (APPROVED, round 7, 0 findings) · **Branch:** `feat/diagram-viewing-polish` · **Implementer:** Opus / Claude Code (UI surfaces — routing hard rule)

**Meta-test inventory (declared):** EXTENDS the `T-DIAGRAM-VARIANTS` e2e family in `tests/e2e/crew-layout-dimensions.spec.ts` (updates two superseded URL oracles, adds two cases), the `phantom-gap-e2e.yml` diagram step (adds `--project=desktop-chromium` + a NEW executed-count oracle on the `check-crew-e2e-executed.mjs` pattern), and the pipeline spec's §6 back-reference. Creates no registry-bearing meta-test. Advisory locks / Supabase boundaries / admin alerts: none applies — the diff is client components, one e2e file, one workflow, and docs. New telemetry: none (announcements are UI live regions, not log emits; the surfaces are non-admin crew UI with no new mutation surface).

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

<!-- task: red=`pnpm exec playwright test tests/e2e/crew-layout-dimensions.spec.ts -g "T-DIAGRAM-VARIANTS" --project=mobile-safari` ac=AC-1,AC-5 -->

Red is OBSERVED after Task 1 lands (same command, currently green): the wired mobile case asserts the active slide serves the ORIGINAL (`tests/e2e/crew-layout-dimensions.spec.ts:2066`, `tests/e2e/crew-layout-dimensions.spec.ts:2084`, `tests/e2e/crew-layout-dimensions.spec.ts:2144`) — the exact contract the spec amends, so Task 1's implementation flips it red for the stated reason before this task repairs the oracles.

1. Update the three superseded URL oracles to the clamped-tier contract (geometry assertions byte-untouched; no re-baseline).
2. Add the two new cases as `T-DIAGRAM-VARIANTS` members: desktop-chromium network-order gate (no original request before programmatic zoom; original fires + `currentSrc` upgrades after), mobile-safari tier assertion. DECLARED `test.skip(project !== …)` per project — bare early returns prohibited for the new cases.
3. `phantom-gap-e2e.yml` diagram step (R1 F2, concrete): add `--project=desktop-chromium`; `--reporter=list,json` with the reporter env var set to the new report path test-results/phantom-gap-diagrams-report.json (value registered in the `governs` allowlist, reconciled against `tests/ci/_workflowCoverageScan.ts:703` region using the meta-test's own failure output, AND the allowlist's consumer-enumerating reason comment at `tests/ci/_workflowCoverageScan.ts:736` region updated to name the new third checker — R2 F4); a NEW checker script (basename check-phantom-gap-executed.mjs under scripts/) that parses the JSON report's suites with BOTH `projectName` and case title (the existing `check-crew-e2e-executed.mjs` collapses to a per-file Set and cannot express case×project — this checker keys on `(title, project)` pairs), REQUIRED pairs derived from a real run; the checker gets its own constructed RED (a doctored report with a skipped/no-op case fails it) recorded in the task; add the checker to the workflow step, update the workflow's path-filter triggers (`phantom-gap-e2e.yml:27` region) so checker/spec changes re-run the job, and refresh the header comments (`phantom-gap-e2e.yml:23` region) that become false once a crew-file case runs under desktop-chromium.
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

1. ORDERING (R1 F6, refined R2 F3 — review must cover what merges AND the graduation commit must be last): PREPARE the graduation content UNCOMMITTED (archive moves, marker removal, three registry rows) BEFORE the whole-diff review, and include the staged diff in the review's scope; after APPROVE (and any repairs + re-gates), commit the already-reviewed graduation content as the final commit. Nothing unreviewed merges.
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

The marker line lands here, filled, at Task 4 completion (the guard accepts only the filled grammar), FOLLOWED by the full findings table: every critique and audit finding — P0 through P3 — one row each with severity, description, and disposition (P0/P1: fixed or DEFERRED.md ref ONLY; P2/P3 may be accepted-with-reason — R3 F1).
