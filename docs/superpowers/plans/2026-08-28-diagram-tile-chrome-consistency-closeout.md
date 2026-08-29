# Closeout — diagram tile chrome consistency

Plan: `docs/superpowers/plans/2026-08-28-diagram-tile-chrome-consistency.md`.
Spec: `docs/superpowers/specs/2026-08-28-diagram-tile-chrome-consistency.md`.
Closes `BL-DIAGRAM-TILE-CHROME-CONSISTENCY`.

impeccable-gate: critique=RAN audit=RAN p0=0 p1=2 dispositions=recorded

## 12. UI quality gate

Invariant 8's dual pair, both halves run on this diff at commit `7647976b3`:
`/impeccable critique` and `/impeccable audit`, each with the v3 setup gates (`context.mjs` loaded
PRODUCT.md and DESIGN.md; register reference `product.md`, since this is admin app UI serving a task).

**Provenance: NOT degraded.** The critique's Assessment A and Assessment B ran as two isolated
sub-agents, which the command requires whenever a sub-agent tool is exposed. Running them inline would
have been a degraded run needing a banner, and the tool was available.

### Critique — Assessment A (design review)

Verdict on the change itself: **PASS, a net improvement.** Chrome now sits on the element that forms the
box, matching the shipped crew gallery arrangement, and the radius finally sits on the element that does
the clipping, so `overflow-hidden` clips round rather than square. Nielsen: aesthetic 4, error recovery
4, match 3, consistency 3, error prevention 3, recognition-not-recall 1.

Five findings, none a regression from this diff — every one is a pre-existing property of the tile:

| # | tier | finding | disposition |
| --- | --- | --- | --- |
| 1 | P1 | only the FAILED tile shows the diagram's name; the live tile is visually anonymous | DEFERRED — `DIAGRAMTILE-LIVE-TILE-UNLABELLED-1` |
| 2 | P1 | `object-cover` crops stage plots to their middle third | DEFERRED — `DIAGRAMTILE-OBJECT-COVER-CROPS-1` |
| 3 | P2 | no hover state on a bordered control | not deferred; P2 is below the invariant-8 threshold and is recorded here only |
| 4 | P2 | a transparent-PNG diagram reads as an empty box on the dark sunken plate | recorded here only |
| 5 | P3 | crew get a lightbox, admin gets a new browser tab, for the same artifact | recorded here only |

**One of A's claims was checked rather than accepted.** A reported the live tile as having no name. It
has an accessible one: the anchor's `aria-label` carries the diagram name plus the new-tab suffix
(`components/admin/wizard/step3ReviewSections.tsx:3918`), and the failed branch renders its name as
VISIBLE text (`components/admin/wizard/step3ReviewSections.tsx:3892`). So the defect is sighted scanning,
not accessibility, and the deferral says so — which changes what the eventual fix should be.

### Critique — Assessment B (detector evidence)

`detect.mjs` exit 2, two `broken-image` warnings, at
`components/admin/wizard/step3ReviewSections.tsx:3802` and
`components/admin/wizard/step3ReviewSections.tsx:3904`. **Both are FALSE POSITIVES and neither is
actioned.** The literal string `<img>` appears at both lines inside code COMMENTS that exist to explain
why this component does NOT render a raw `<img>`: one is a JSDoc paragraph about the `/_next/image`
optimizer, the other a JSX comment about the nameless-link guard. It is a use-versus-mention match, the
same class this repo's own review-convergence gate had to fix by stripping quoted spans before scanning.

Contrast, from DESIGN.md's pinned table rather than recomputed: `--color-text-faint` as OUTLINE against
`--color-surface-sunken` is 3.02:1 light and 4.11:1 dark, clearing the >=3:1 non-text floor. That row
carries its own warning that light clears "with a thin margin, so any `text-faint` or `surface-sunken`
retune re-checks this row" — this diff retunes neither token, it relocates the pair, so the pin holds.

### Audit — five dimensions

| dimension | score | basis |
| --- | --- | --- |
| Accessibility | 3 | WCAG AA met: the anchor carries an accessible name, the house focus-visible ring, and a decorative empty `alt`. Held off 4 by A's finding 1, a sighted-identification gap |
| Performance | 4 | `next/image` with a custom loader, `fill` and `sizes`; no animation on the tile at all, so nothing to thrash |
| Theming | 4 | every colour in the diff is a token; zero hard-coded hex, `rgb()` or `hsl()` in the added lines, verified by grep |
| Responsive | 3 | `aspect-4/3 w-full` in a grid, no fixed widths, no horizontal overflow; green in a real browser at 390, 800 and 1280. Held off 4 by the ~8px gaps between twelve targets for one-handed use |
| Anti-patterns | 4 | no gradient text, glassmorphism, side-stripe, hero-metric block or section eyebrow. The thumbnail grid is the correct affordance for diagrams, not a card-grid reflex |

### Disposition summary

P0: 0. P1: 2, both deferred with entries in `DEFERRED.md` naming class-sweep exception (a) — each needs a
product decision this PR cannot settle. P2 and P3 findings are recorded above and are below the
invariant-8 disposition threshold.


## Acceptance criteria, discharged

| id | how it was discharged | result |
| --- | --- | --- |
| AC-1 | new suite, exact token membership on the anchor and exact string equality on the image | pass |
| AC-2 | `git diff --name-only` captured to a file, then grepped in an `if` block | pass, Gallery.tsx absent |
| AC-3 | `tests/styles/controlOutlineTransitions.test.ts` derivation | pass, three visuals |
| AC-4 | count parity assertion reading the 2026-08-26 spec, plus the git history check | pass |
| AC-5 | `pnpm heavy pnpm test:e2e:standalone` | pass, 44 of 44 |
| AC-6 | `tests/styles/tintedPlateOutline.test.ts`; counts derived with `stripCommentsForFile` | pass, pin unmoved at 9 |
| AC-7 | full styles suite | see below |
| AC-8 | inverted placement pin, observed RED then GREEN | pass |
| AC-9 | prose greps both directions, plus the census-diff field check | pass |

## What the run actually cost, and what it caught

**The full styles suite earned its place in the plan.** Every scoped run was green while
`tests/styles/_metaControlOutlineFill.test.ts` had eight failures: two line-keyed registry rows in
`tests/styles/controlOutlineScan.ts` addressed `step3ReviewSections.tsx:4455` and `:4512`, and the
comment this arc rewrote added sixteen lines above both. Repaired by LOCATING the `<button>` openers, at
4471 and 4528, which is what those rows' own comments instruct and warn about: "not by adding the two
sides' deltas, which is what put them 5 lines short."

The class sweep that followed was derived rather than recalled: every registry row keyed to that file was
enumerated and checked against the edit point. Two are anchor-keyed and drift-immune, one carries no line
key, and two point above the edit at 1633 and 3909. The two repaired were the complete set, which is why
the suite reported exactly eight failures and not more.

## A measurement that was not what it looked like

bl-orch's first condition asked for every task command run at the UNMODIFIED head. That baseline is
partly INVALID and it is recorded here rather than quietly relied on. The job ran typecheck first and
reached `format:check` after this session had already copied the new test file into the tree, so its
`exit=1` was that unformatted file rather than a pre-existing repo failure. Confirmed twice: the full
check named exactly one file, mine, and after formatting the repo-wide check reports all files clean.

Only the two vitest entries, captured in the foreground before any edit, are trustworthy as
unmodified-head measurements. The lesson generalises past this arc: a baseline taken in the background
while its own tree keeps changing measures neither the before nor the after, and nothing in its output
says so.

## Documented limits carried forward

L1 (the two branches paint different border tokens), L2 (`Screenshot.tsx` keeps chrome on the image),
L3 (focused elements are squashed to a 6px radius app-wide), and L4 (the reconciliation route relocates
no focus) are stated in the spec with re-file triggers. None is repaired here, and each says why.
