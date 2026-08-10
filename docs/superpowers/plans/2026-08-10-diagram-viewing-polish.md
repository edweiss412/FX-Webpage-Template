# Plan: diagram viewing polish — zoom-gated original, blur closure, failed-thumbnail a11y

**Spec:** `docs/superpowers/specs/2026-08-10-diagram-viewing-polish.md` (APPROVED, round 7, 0 findings) · **Branch:** `feat/diagram-viewing-polish` · **Implementer:** Opus / Claude Code (UI surfaces — routing hard rule)

**Meta-test inventory (declared):** EXTENDS the `T-DIAGRAM-VARIANTS` e2e family in `tests/e2e/crew-layout-dimensions.spec.ts` (updates two superseded URL oracles, adds two cases), the `phantom-gap-e2e.yml` diagram step (adds `--project=desktop-chromium` + a NEW executed-count oracle on the `check-crew-e2e-executed.mjs` pattern), and the pipeline spec's §6 back-reference. Creates no registry-bearing meta-test. Advisory locks / Supabase boundaries / admin alerts: none applies — the diff is client components, one e2e file, one workflow, and docs. New telemetry: none (announcements are UI live regions, not log emits; the surfaces are non-admin crew UI with no new mutation surface).

**Layout-dimensions task:** N/A — the spec's Dimensional Invariants section declares none new; the existing geometry gate keeps pinning the cells (no re-baseline).

**Transition-audit task:** REQUIRED (the spec carries a Transition Inventory) — folded into Tasks 1 and 3, whose test lists carry the inventory's rows verbatim; Task 3 additionally audits the `AnimatePresence` exit path (`Gallery.tsx:236`) against the buffer/flush design.

**e2e harness readiness:** boots via the existing playwright port-3000 webServer used by the wired diagram cases; readiness gates are the existing `T-DIAGRAM-VARIANTS` seed + hydration helpers; detach-safety: the new failure-injection cases locate elements fresh after each `onError` (no held locators across unmounts).

<!-- tasks: depth=2 -->

## Task 1 — Zoom-gated original (loader wiring + per-slide state)

<!-- task: red=`pnpm vitest run tests/components/diagrams/galleryLightbox.zoomGate.test.tsx` ac=AC-1,AC-2 -->

Red is written by this task (invariant-1 shape): the new component suite fails against the live tree because `components/diagrams/GalleryLightbox.tsx:661` passes `pinOriginal: true` UNCONDITIONALLY on the active slide — there is no `wantsOriginal` state, no intent path wiring, and no per-slide map (verified on the live tree 2026-08-10).

1. Per-slide `wantsOriginal` map keyed by slide identity; flips on the FOUR path classes (committed pinch via the existing 1.01 commitment detection around `GalleryLightbox.tsx:79`, Ctrl/Meta-wheel + trackpad pinch via `GalleryLightbox.tsx:549`/`GalleryLightbox.tsx:608`, keyboard `+`/zoom control, double-tap), derived from scale crossing the 1.01 bound so future paths cannot bypass; never resets within the lightbox session.
2. Active slide's loader gets `pinOriginal: wantsOriginal[slide]`; variant-less entries unchanged (URL equality both states).
3. Tests (spec §6 list): four intent paths; de-zoom persistence; **isolation + session persistence** (zoom A → B clamped → return A pins WITHOUT new gesture — a global or reset-on-selection boolean fails); URL oracles read off the LOADER's return (anti-tautology), tiers derived from fixture ladders.
4. Green: suite passes; existing lightbox suites untouched-green.

## Task 2 — E2E contract update + CI binding

<!-- task: red=`pnpm exec playwright test tests/e2e/crew-layout-dimensions.spec.ts -g "T-DIAGRAM-VARIANTS" --project=mobile-safari` ac=AC-1,AC-5 -->

Red is OBSERVED after Task 1 lands (same command, currently green): the wired mobile case asserts the active slide serves the ORIGINAL (`tests/e2e/crew-layout-dimensions.spec.ts:2066`, `tests/e2e/crew-layout-dimensions.spec.ts:2084`, `tests/e2e/crew-layout-dimensions.spec.ts:2144`) — the exact contract the spec amends, so Task 1's implementation flips it red for the stated reason before this task repairs the oracles.

1. Update the three superseded URL oracles to the clamped-tier contract (geometry assertions byte-untouched; no re-baseline).
2. Add the two new cases as `T-DIAGRAM-VARIANTS` members: desktop-chromium network-order gate (no original request before programmatic zoom; original fires + `currentSrc` upgrades after), mobile-safari tier assertion. DECLARED `test.skip(project !== …)` per project — bare early returns prohibited for the new cases.
3. `phantom-gap-e2e.yml` diagram step: add `--project=desktop-chromium`; add `--reporter=list,json` + `PLAYWRIGHT_JSON_OUTPUT_NAME` + a post-run per-case×project executed-count oracle (floors from a real run; a runtime-skip or bare-return no-op fails it). Register any governance pairs the coverage scan attributes (verify against the meta-test's own output).
4. Pipeline-spec §6 back-reference commit (`docs/superpowers/specs/crew/2026-08-09-private-image-pipeline-design.md:146` region gains the amendment pointer; no other contract line changes — AC-5).
5. Green: the red command passes with the updated oracles; the new cases execute under their projects per the oracle.

## Task 3 — Failed-thumbnail focus + announcements

<!-- task: red=`pnpm vitest run tests/components/diagrams/gallery.failedItem.test.tsx` ac=AC-3 -->

Red is written by this task (invariant-1 shape): the new suite fails against the live tree because `components/diagrams/Gallery.tsx:198` swaps the failed cell to a non-interactive div with NO focus relocation, NO announce region (`gallery-announce-log` absent from the tree), and no restore-target ref (verified on the live tree 2026-08-10).

1. Two `AnnounceLogRegion`s: Gallery root (`label="Diagram updates"`, `testId="gallery-announce-log"`), lightbox-internal (`label="Diagram viewer updates"`, `testId="lightbox-announce-log"`); three-state routing (open → lightbox channel; exiting → Gallery-owned buffer flushed on `AnimatePresence` `onExitComplete`; browse → gallery channel); messages follow the alt-else-`Diagram <n>` scheme (`Gallery.tsx:156`).
2. Focus: relocation order (next / prev / show-more / list `tabIndex={-1}`); `restoreTargetRef` (stable mutable ref) passed to the lightbox, read by `useDialogFocus` at restore; retarget CLOSURE on every failure that removes the current restore target, in open and exit states alike.
3. Tests (spec §6 + Transition Inventory rows verbatim in the suite): both channels' before/after oracles (exists-empty → same-node keyed child → other channel untouched); the THREE-phase exit-buffer oracle (empty before; both untouched while exiting; exactly one gallery addition after flush); focus relocation per availability configuration; the detached-trigger probe sequence; the succession closure (A→B→C); no-focus failure relocates nothing; per-case premises asserted before measuring.
4. Green: suite passes; existing Gallery/lightbox suites green.

## Task 4 — Impeccable dual gate (invariant 8)

<!-- task: red=`grep -qE "^impeccable-gate: critique=RAN" docs/superpowers/plans/2026-08-10-diagram-viewing-polish.md` ac=AC-6 -->

Red now (line-anchored grep exits 1 — the only occurrence is this marker comment, not at line start). Run both halves of the invariant-8 dual gate (`/impeccable`, critique mode then audit mode, canonical v3 setup). Expected deltas: none visual at rest (loader/state changes + live regions); the gate verifies. Fill the §12 marker, then RERUN the same command and observe exit 0.

## Task 5 — Graduations + merge sequence

<!-- task: red=`sh -c '! grep -q "^## BL-LIGHTBOX-ORIGINAL-PROGRESS-AFFORDANCE" BACKLOG.md'` ac=AC-4 -->

Red now (the entry heading exists; the negated grep exits 1; green when all three rows graduate — same command on the first row as the representative, with step-level greps for the other two).

1. Graduate all three rows to the archive with their dispositions (amendment / probe closure / repair); markers come off in the graduation commit (invariant 12's sanctioned shape — no end-of-PR marker step); add graduation-registry rows per `tests/docs/_metaDeferralLedgerGraduation.test.ts`.
2. `pnpm vitest run tests/docs` green as the belt.
3. Whole-diff cross-model review to APPROVE; real CI green (including the phantom-gap run exercising the new oracle); `gh pr merge --merge`; fast-forward main; `0  0` check.

<!-- tasks: end -->

## Acceptance criteria (crosswalk to the spec's §8)

- AC-1: clamped tier on open; original only after intent, all four path classes (network-log assertion).
- AC-2: variant-less entries URL-identical both states.
- AC-3: focus never lands on body (open, exit-window, succession cases); every failure announced per the three-state routing.
- AC-4: three rows graduate with dispositions recorded.
- AC-5: pipeline-spec back-reference only; no other contract line changes.
- AC-6: the invariant-8 dual gate (both halves) run with P0/P1 dispositioned.

## §12 — impeccable gate record

The marker line lands here, filled, at Task 4 completion (the guard accepts only the filled grammar).
