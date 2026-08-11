# M-wave 2 — per-unit closeout

Per-unit gate markers and the AC-PROG arithmetic land here as units merge
(HANDOFF.md wave-closeout contract; plan §12 covers the docs branch itself).

## W-PARSE (`feat/m2-payload-hygiene`, PR #766, merged 2026-08-10)

impeccable-gate: N/A — no UI surface

Cross-model review: diff round 1 APPROVE, 0 findings (corpus row
`docs/review-rounds/feat/m2-payload-hygiene/bdcd336f3f9c.jsonl`).

## W-SYNC (`feat/m2-sync-fault-codes`)

impeccable-gate: critique=RAN-DEGRADED audit=RAN p0=0 p1=0 dispositions=none

Scoped run on `/help/errors` (the unit's only invariant-8 surface: the
`ONBOARDING_INTERNAL_ERROR` help-family row). Snapshot:
`.impeccable/critique/2026-08-10T16-11-49Z__app-help-errors-page-tsx.md` —
detector exit 0 over `app/help/errors`, no em dashes / raw codes in the new
copy, heuristics 34/40, zero P0/P1 findings, nothing deferred. `RAN-DEGRADED`
because the two assessment sub-agents went unresponsive and both assessments
re-ran inline (single-context), declared per the critique contract's banner
rule.

Cross-model review, split tight-scope (large diff): brief A (fault kinds +
cron workbook code) round 1 NEEDS-ATTENTION with 2 findings — F1 (P1,
probe-backed): the existing-pending early return bypassed the first-seen
carve; repaired by hoisting the show read, with both signs pinned. F2 (P3):
stale suite header; rewritten to the three-kind contract. Round 2 APPROVE, 0
findings. Brief B (source-anchors stamp) round 1 APPROVE, 0 findings. Corpus
rows: `docs/review-rounds/feat/m2-sync-fault-codes/196334d5ef61.jsonl`.

## W-E2E (`feat/m2-e2e-infra`)

impeccable-gate: N/A — no UI surface

Cross-model review, whole-diff, four rounds (round cap reached, converged
APPROVE): r1 BLOCKING 4 findings (E1 lock-topology unpinned by the walker
guard → exported `lockedSeedTxSql` builder + DB-free unit pins;
`honorRemoteOptIn` flipped to false; recovery test gained an in-session
transition leg; 83-behind merge). r2 BLOCKING 2 (firing smoke tightened from
newest-row substring to ALL-xid-rows / exactly-one / parsed path+query
equality; five stale right-now prose sites class-swept, census restated
UNSEEN=24). r3 BLOCKING 2 (`judgeSample` swallowed FACES_UNREADABLE on
textless live documents — RED row 5 then fix; second merge with
`check-crew-e2e-executed.mjs` thresholds taken from main verbatim plus the
right-now row). r4 APPROVE, 0 findings. Corpus rows:
`docs/review-rounds/feat/m2-e2e-infra/` (`6b1f3bf2dea8`, `4cc9251c0312`,
`cdab62b8054f` — merge-base moved twice mid-arc; per-base round numbering per
the crew-field-enrichment precedent).

E2's five-consecutive-green crew-e2e bar (wave spec §4 limit 8) is tracked
post-merge, not a pre-merge gate.

## W-GUARDS (`feat/m2-guard-precision`)

impeccable-gate: critique=RAN audit=RAN p0=0 p1=0 dispositions=none

GATE FLIPPED from `N/A — no UI surface` per the spec §0 contingency: G2's
crosswalk triage corrected `app/help/getting-started/page.mdx` (the bolded
**Finalize** named no shipped control — the wizard UI and its own help page
say "finish setup"). Scoped dual-gate run 2026-08-10 on that one-sentence
diff, canonical v3 setup (context.mjs + product register), DUAL-AGENT
(Assessment A design review + Assessment B detector/mechanical evidence as
isolated subagents — not degraded). A: heuristics 36/40, clean slop verdict,
zero P0/P1, one P2 (buried payload — link pushed to line end by a 17-word
parenthetical) + P3s (all-shows overclaim; both FIXED in-branch: sentence
split with the link early, "publishes the shows you tick"). B: detector exit
0 with a planted-violation liveness control, PLUS the honest record that the
detector has no prose rule surface — its green is "untested", not "passed",
for a copy-only diff; greps clean (0 em dashes, ASCII quotes, 0 raw codes,
0 residual "Finalize"), link target verified. Residual gap: no rendered-DOM
pass (no browser session provisioned for the scoped run).

Cross-model review + mutation-gate record: see the review section below
(appended at dispatch/verdict time).

## W-UI (`feat/m2-ui-cluster`)

impeccable-gate: critique=PENDING audit=PENDING p0=PENDING p1=PENDING dispositions=PENDING

Five tasks: U1 semantic z-index bands + dual-idiom guard; U2 one row-slot
affordance vocabulary + flattened nested chrome (STEP3-GALLERY-TAP-TARGETS-1
item d, the entry's last open item, archived); U3 DESIGN.md §5.5 as a derived
interaction-timing inventory (SHARELINK-CONSTANTS-INVENTORY-1, archived); U4
five icon-only action targets off `text-text-subtle` (SHEETLINK-SUBTLE-ACTION-CLASS-1,
archived); U5 the Inter subset widened to the probe-derived glyph set
(BL-GLYPHS-OUTSIDE-INTER-SUBSET, archived).

### Transition audit (U6 step 1)

Zero new motion. `git diff origin/main...HEAD` over `app/` + `components/`
matches `AnimatePresence|initial=|animate=|exit=` in exactly two files, and
NEITHER is a new animation: `components/diagrams/GalleryLightbox.tsx` keeps its
pre-existing `initial`/`animate`/`exit` props untouched and changed only
`z-50` → `z-overlay` on the same element, and `app/globals.css` gained a
`@theme` token block with no keyframes. The diff adds zero new conditional
renders (`grep -cE "\? *\(|&& *\(|AnimatePresence"` over added lines = 0). The
one new prop, `RowItem`'s `flat`, selects a class and mounts nothing, so no
state pair changes mount/unmount timing. Every pair stays instant, deliberately.

### Dimensional invariants (U6 step 2)

The spec declares none for this unit, and the audit confirms none is created:
every change is a class-family substitution, a border removal, a text colour,
or a font payload. No fixed-height or fixed-width parent gains flex/grid
children, so the layout-dimensions rule is not triggered.

### Mechanism verified rather than assumed

`--z-index-<name>` in `@theme` really does emit the utility. Probed directly
against this repo's Tailwind (v4.2.4): a minimal `@theme` with
`--z-index-overlay: 50` compiles `.z-overlay { z-index: var(--z-index-overlay) }`.
This matters because a typo'd token would emit NO `z-index` at all — a silent
stacking regression that a class-string guard cannot catch, since the class
string would be exactly what the guard expects.

### Full suite

`pnpm test`: 23,711 passed, 5 failed, 57 skipped across 1,888 files. All five
failures are in two files — `tests/reviewRounds/report.test.ts` (1) and
`tests/scripts/validation-report-fixtures.test.ts` (4) — and both files pass
clean when re-run in isolation on the same tree. Shared-fixture contention
across concurrently running sibling worktrees, not a regression from this diff;
real CI runs isolated and is the arbiter.
