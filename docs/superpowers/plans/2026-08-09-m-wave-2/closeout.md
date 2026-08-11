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

The gate marker line is written when the gate COMPLETES, not before — a
placeholder is not a valid marker and the guard is right to reject one
(same handling as the step3-live-render-cluster plan, whose §12 carried no
marker until its Task 6 finished).

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

### Cross-model review — brief A (z-index bands)

Split tight-scope per the large-diff rule. Brief A covered U1's guard and sweep.

| Round | Verdict | Findings | What was accepted |
| --- | --- | --- | --- |
| 1 | NEEDS-ATTENTION | 2 (both P1) | The scanner was blind to variant prefixes (`focus:z-50`) and to non-module-scope consts, reporting ZERO sites for three files that carried live numerals. And a typo'd band emits no `z-index` while the census stays silent. |
| 2 | NEEDS-ATTENTION | 2 (both P1) | The r1 repair was `@theme`-scoped STRING PRESENCE, which cannot tell a live declaration from a commented-out one, a duplicate, or a `:root` override. And exemptions keyed on file + token alone would let one row cover every identical site in a file. |

Every finding was probe-backed, accepted without argument, and repaired by shape
rather than by instance. The r1 widening independently reproduced exactly the
three sites the review named — a useful confirmation that the repair addressed
the mechanism and not the examples.

**All four findings were ONE shape: a guard whose green state is compatible with
the thing it claims to prevent.** That is worth stating plainly because it is the
class this arc kept re-encountering, in the guard and outside it — the same shape
produced the fill-separation claim in U2 and the four-site enumeration in U4. The
guard's answer is now to COMPILE rather than to read: Tailwind processes the
shipped `app/globals.css` and the emitted rules are asserted for presence and for
resolved value, so nothing about the source text can fool it. Both of round 2's
vectors were mutated against it and each reds.

### Cross-model review — brief B (row-slot vocabulary, icon-only colour)

| Round | Verdict | Findings | What was accepted |
| --- | --- | --- | --- |
| 1 | NEEDS-ATTENTION | 4 (1 P1, 3 P2) | The border contract read the INITIAL render only, and a re-scan result is bordered chrome reachable only after interaction. Both carve-outs were shaped so a new action could hide behind them. The action census saw only `button` and `a[href]`. `isBorderedContainer` used an eight-tag allowlist plus an invented `rounded` requirement. |

All four accepted. The P1 is the one worth remembering: **a guard on a surface
with interaction states owes those states an assertion.** The two nested-border
sites it named were unreachable from any first-render assertion, and the guard
now drives every Re-scan in the slot and re-asserts — mutating the border back
reds it and names exactly those two sites.

The reviewer also independently reproduced this close-out's focus-ring
measurements (3.24–4.56:1) and raised nothing on `flat` placement or on the five
painting elements, which is the useful kind of silence.

### The mutation gate earned its rule

`scripts/scan-interaction-timings.ts` was enrolled in the source-mutation
registry BEFORE the first review dispatch, per the guard-gate rule. It scored
**0.607 against a 0.95 floor** — and the reason is instructive rather than
embarrassing: the parity test drives the scanner through exactly ONE path, the
live repo, so a mutation to any form the repo does not currently contain changes
nothing observable. Roughly two mutants in five survived.

A recognizer's contract is the set of forms it recognizes, so that set is now
asserted directly (`tests/docs/interactionTimingScan.test.ts`, 25 cases), and the
CLI entry moved out of the enrolled module — an argv guard and a few
`process.stdout.write` calls are unreachable from any test and survive mutation
by construction, dragging the score down for lines that carry no contract.

**This is the argument for enrolling before review, not after.** The score is a
fact about the suite that no amount of reading it would have produced, and it
arrived before a reviewer had to spend a round guessing at the same gap.

### Measurements taken during close-out

Computed from the runtime tokens rather than eyeballed, because every one of
these had a decision resting on it:

| Pair | Light | Dark | Floor | Consequence |
| --- | --- | --- | --- | --- |
| `surface` vs `surface-sunken` | 1.11:1 | 1.09:1 | 3:1 | Killed the fill-separation claim; the flat row drops its fill. |
| `surface-sunken` vs page `bg` | ~1.05:1 | — | 3:1 | The plate cannot yield its border instead. |
| `border-strong` on `surface` | 1.59:1 | 1.60:1 | 3:1 | The secondary button's box is not perceivable; filed. |
| focus ring on `surface` | 3.59:1 | 4.39:1 | 3:1 | PASSES. |
| focus ring on button fill | 3.44:1 | — | 3:1 | PASSES. |
| focus ring on the sunken plate | 3.24:1 | — | 3:1 | PASSES — the tightest of the set. |

The focus-ring rows are the ones that mattered for U2: the shared treatment drops
`focus-visible:ring-offset-*` (one constant cannot carry a correct offset COLOUR
across `bg-surface` cards and the `bg-surface-sunken` plate), so the ring now
sits flush on every ground the button lands on. All three clear the floor.

### §12 Invariant-8 dual gate — findings and dispositions

impeccable-gate: critique=RAN-DEGRADED audit=RAN-DEGRADED p0=0 p1=0 dispositions=none

**⚠️ DEGRADED: single-context (both assessment sub-agents idled without returning
a report).** Declared per the critique contract's banner rule rather than taken
silently. Assessment A and Assessment B were dispatched as two isolated
sub-agents, as the contract requires; both reported idle twice, and neither
delivered its report after two explicit requests. The skill's sanctioned
sequential fallback was used. Setup gates were the canonical v3 pair: the
`context.mjs` context load (PRODUCT.md + DESIGN.md) and the **product** register
reference — admin UI, where design SERVES the product.

**No authenticated live render.** `/admin` 307s to sign-in and this run did not
stand up the wizard session + seeded gallery behind it. Every measurement below
is therefore computed from the tokens in `app/globals.css` and from the AST,
not read off a browser. That is a real gap and it is the honest limit of this
gate: the numbers are exact, the *look* was not inspected at 390px in dark.

**Assessment B — deterministic evidence.** Detector over every changed directory:
16 findings, ALL `broken-image`, 7 in `components/admin/wizard/VenueMapTile.tsx`,
2 at `step3ReviewSections.tsx`, 7 in `components/diagrams/`. Every one is the
pre-adjudicated false positive (raw `<img>` with a required runtime `src` and an
`onError` placeholder, a documented deliberate revert from `next/image`, which
drops cookies), and **none is in this diff** — `git diff origin/main...HEAD`
touches zero `<img>` lines.

The detector's green is a REAL green, not an unrun one: a planted probe
(`side-tab` + `gradient-text` + `broken-image` in one throwaway component under
`components/shared`) was caught on all three rules, and the directory returned to
silent when the probe was removed.

Mechanical checks over the 147 added UI lines: 10 em dashes, all inside comments
(the ban is on user-visible copy); zero straight apostrophes in JSX text; zero
raw hex / `rgb()` / `hsl()`; the 44px floor preserved (`min-h-tap-min` /
`size-tap-min` on every added control).

**Assessment A — design review, heuristics 35/40.** Strongest movement is exactly
where the previous gate on this surface was weakest: Consistency and Standards
was scored 2/4 there and is the subject of this whole unit — one action
vocabulary, one bordered level, one action colour, one semantic z-scale. Weakest
now is Recognition rather than Recall (3/4), for the reason below.

| # | Sev | Finding | Disposition |
| - | --- | ------- | ----------- |
| 1 | P2 | The single vocabulary means a clean row's **View** and a blocked row's **Permanently ignore** now carry identical visual weight; the row's urgency is carried only by the chip and the copy. | ACCEPTED — this IS the ratified acceptance shape (spec §2.6 `:92`: the set of distinct treatments must be size 1). The warn chip and judgment chip still differ per row, so state is not carried by the button alone. |
| 2 | P2 | The shared secondary treatment is not perceivable as a box at the non-text floor: `--color-border-strong` on `--color-surface` measures **1.59:1** light / **1.60:1** dark, and its `bg-bg` fill on a `bg-surface` card measures **1.04:1** / **1.06:1**. Both are under 3:1. | PRE-EXISTING, NOT introduced here — this is `RescanSheetButton`'s shipped class, promoted verbatim, and the retired ghost "View" had no border at all so nothing regressed. Not a strict AA failure either: the label carries identification at 16.47:1 / 15.23:1, which is the WCAG 1.4.11 carve. FILED as `BL-SECONDARY-BUTTON-BOUNDARY-INVISIBLE` — it affects every surface rendering that button, class-sweep exception (c). |
| 3 | P3 | A `flat` row keeps `p-tile-pad` while no longer having a box to pad. | ACCEPTED — the padding preserves the vertical rhythm of the list and costs nothing; removing it would tighten the group against the plate edge. |

**Zero P0. Zero P1**, so the marker reads `dispositions=none` — the §3.3 grammar ties that field
to the P0/P1 count specifically, and the guard rejects `recorded` when both are zero. The P2/P3
dispositions are the table above. Nothing is deferred that needed fixing: findings 1 and 3 are
accepted design consequences of the ratified shape, and finding 2 is pre-existing
and filed.

**Recorded so a later gate does not re-raise them:** the 16 `broken-image` hits
(false positives, adjudicated 2026-08-02); `text-text-subtle` on body and caption
prose, which DESIGN.md permits — the ban is on action TARGETS; and the demoted
card's double "Review", ratified intentional.

### A self-caught P1, recorded because the claim shipped before the measurement

The first U2 repair flattened the blocking rows inside the "Needs your attention"
plate but kept `bg-surface` on them, and asserted in the commit message and the
ledger archive that the row "still separates on fill". Measured, that pair is
**1.11:1 light and 1.09:1 dark** (`--color-surface` vs `--color-surface-sunken`)
against a 3:1 non-text floor, so the claim was simply false. Nor was the obvious
alternative available: `--color-surface-sunken` on the page `--color-bg` is
~1.05:1, so yielding the PLATE's border instead would have made the plate vanish.

`flat` now drops the fill as well as the border and the row is a genuine flat
list item, separated by the list's `gap-3` and by its own content. A third
assertion in `step3RowSlot.test.tsx` pins it, because the failure mode is a later
edit re-adding `bg-surface` "for separation" — a change that reads as a fix while
restoring a claim the tokens do not support.

Worth recording as a pattern, not just an incident: this is DESIGN.md §1.2a one
layer up. That section already establishes that tokens tuned to sit BESIDE a
filled surface do not carry contrast when they stand alone; the same is true of
two fills tuned to sit one step apart in a stack. Neither was caught by reading —
both took the arithmetic.

### What CI caught that local verification could not

**`screenshots-drift`.** The U4 archive argued — correctly — that none of the five
recoloured controls appears on a captured route. It then concluded that no
baseline moves, which was wrong, because U5 widened the Inter subset in the same
branch. Characters the dashboard already drew (`⚠` in `ShowsTable`, `✓`, `→`)
previously fell back to a system face and now resolve in Inter, so
`dashboard-overview-{light,dark}.webp` legitimately changed pixels.

A font-payload change is a RENDERING change on every route that draws an affected
glyph, not only on the routes whose components changed. That is the transferable
form of the mistake, and no amount of reasoning about which components moved
would have surfaced it — only a byte gate on a real capture does.

Baselines regenerated through the `screenshots-regen` workflow on a native-amd64
runner from the pinned `mcr.microsoft.com/playwright:v1.59.1-jammy` image, per the
byte-comparison discipline. Regenerating from this arm64 dev host would have
produced different bytes: a green local run that fails in CI.

**The regen's scope was PREDICTED before it ran, then checked against it.** Of the
nine added glyphs, only `⚠` (in `ShowsTable`) appears on a captured route, so the
prediction was exactly two files — `dashboard-overview-{light,dark}.webp` — and
that is exactly what the bot committed (81,670 → 81,698 and 77,638 → 77,670
bytes). Predicting the blast radius first is what turns a regen from "accept
whatever the runner produces" into a check: a third file moving would have meant
something else changed and been worth stopping for.

The first dispatch captured correctly and was rejected at the push, because a
docs commit landed on the branch while it ran — the regen checks out a ref and
cannot fast-forward under it. Pushes are held for the duration of a regen now.

### Full suite

`pnpm test` on the final tree: **23,744 passed**, 3 failed, 57 skipped across
1,889 files. Both failing files are accounted for, and neither is a regression:

- `tests/mutation/_metaPremiseContract.test.ts` (2) — that run STARTED before the
  commit registering the two new suites in `EXPECTED_ENV_TOUCHING`. Verified
  passing at HEAD (exit 0, 10/10).
- `tests/reviewRounds/report.test.ts` (1) — a 30-second TIMEOUT, not an
  assertion. **Verified pre-existing at the merge-base**: a throwaway worktree at
  `876cbd06c` fails the same test the same way (30,178 ms), so it is a
  load-sensitive timeout on this machine rather than anything this branch did.
  Earlier in the arc it passed in isolation, which is the signature of load
  rather than logic.

An earlier full run reported 5 failures including four in
`tests/scripts/validation-report-fixtures.test.ts`; those passed in isolation and
do not recur here — shared-fixture contention across concurrently running sibling
worktrees. Real CI runs isolated and is the arbiter.
