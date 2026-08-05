# M-wave — W-UI closeout

Branch `feat/m-wave-ui`, the fourth and last unit of the M-wave. 57 files, +2055/−287
against merge-base `fc4902004`.

Seven ledger entries: `BL-ANNOUNCE-REGION-UNMOUNT-CLASS`, `BL-BULK-UNDO-ANNOUNCE-UNMOUNT`,
`BL-ADMIN-BADGE-CONTRAST-TOKEN`, `BL-FRESHNESS-PROJECTION-NARROWING`,
`BL-CREW-UNKNOWN-ASTERISK-TODAY-DATES`, `BL-RESYNC-REGRESSED-JUMP-LINK`,
`BL-HELP-UI-LABEL-CROSSWALK-EXACT-MATCH`.

## What this branch actually found

Three of the seven entries prescribed a fix that the work then disproved. That is the
through-line worth recording, because in each case the prescribed fix was plausible from
reading the code and wrong once something executed it.

- **Venue freshness (U3).** The entry said to gate `googleLink` through `isParseableUrl`.
  The probe found the section's eyebrow field COUNT counts the link whether or not it
  parses, so absent-to-unparseable moves a painted `(3)` to `(4)` that a gated href cannot
  see. The prescribed narrowing would have traded a benign extra flash for a SILENT MISSED
  CUE — the direction the entry's own parent findings were about. Shipped with a presence
  bit alongside the href; `D21b` pins it.

- **§12.4 RESYNC (U5).** The plan's executable RED — edit the row prose, watch x1
  catalog-parity fail — cannot happen. x1 compares four fields and the description column
  is not extracted at all; `pnpm gen:spec-codes` produces a zero-byte diff for that edit.
  Worse, the claim it was checking was already false: §12.4 said "No action link." while
  the code had been building one the whole time, aimed at the wrong section.

- **Crosswalk labels (U8).** The plan said the two live instances were bad copy to rewrite.
  They are Google Drive's controls — "click **Share** on that folder… Give it **Viewer**
  access" — so the copy is right and rewriting it would have made accurate documentation
  inaccurate. They also survive the new word-boundary tier, via a TYPE ANNOTATION that no
  lexical narrowing can distinguish from a button label.

Each disproof produced a guard rather than only a patch: `D21b`,
`tests/cross-cutting/specActionLinkParity.test.ts`, and an executable documented-limit
test that fails the day the crosswalk's oracle is fixed.

## Transition audit (Task U7.1)

Spec's Transition Inventory declares this unit all-instant. Verified mechanically over the
diff:

```
git diff fc4902004 HEAD -- app components \
  | grep -E '^\+' | grep -cE 'AnimatePresence|\bexit=|\binitial=|\banimate=|transition=\{'
0
```

Every conditional render this diff touches moved in the OPPOSITE direction — from
conditional mount to permanent mount with toggled text — so the population of
animatable state transitions strictly shrank. The `Step3ReviewModal` §11 source-marker
audit independently caught the count moving 19 → 17 and was updated with the reason
inline; both remaining sites are deliberate-instant.

## Dimensional invariants (Task U7.2)

Spec declares none introduced. Verified over the diff:

```
git diff fc4902004 HEAD -- app components \
  | grep -E '^\+' | grep -cE '\bh-\[|\bw-\[|\bmin-h-\[|\bmax-h-\[|\bheight:|\bwidth:'
0
```

No new fixed-dimension parent, so the layout-dimensions real-browser task does not
trigger. One layout-adjacent change exists and is not dimensional: `TodaySection`'s
Tonight card drops its Hotel row's `span: 2` when the two date rows are suppressed, so a
lone row does not stretch across a 2-up grid with nothing beside it.

## 12. impeccable dual-gate

Findings and dispositions below; both commands run against the scoped UI diff with the
canonical v3 setup gates (`context.mjs` context load, then the `product.md` register —
this is admin/tool UI, where design serves the product).

### Checks run directly, independent of the gate

These were verified in this session rather than taken on the gate's word, because
each one is a claim the diff makes about itself:

- **Idle live-region state.** Every `role="status"` in the diff was scanned for
  `aria-hidden` / `hidden` / `display:none` / `inert` within its element. None is
  disabled. The single `aria-hidden` hit is a decorative check glyph INSIDE a
  region, which is correct. This is the failure that would silently undo the
  entire branch, so it is checked here as well as by the audit.
- **Contrast.** `#b85800` on `#ffffff` computes to 4.74:1 (AA for normal text).
  The backlog entry's suggested `#C25E00` computes to 4.29:1 and was NOT used.
  Both recomputed from the sRGB relative-luminance formula in this session.
- **Em-dash ban in user-visible copy.** 14 em-dashes are added by the diff; all
  14 are in comment prose. Zero in rendered copy or string literals.
- **Tap targets.** No `<button>` added without a `min-h` companion.
- **Typographic apostrophes.** None added.

### Findings

**⚠️ DEGRADED: single-context (both delegated sub-agents stopped responding; run
completed inline rather than stalling the pipeline).** `reference/critique.md`
requires Assessment A and Assessment B as two isolated sub-agents and classifies
an inline run as degraded. Two were dispatched with the full scoped brief, went
quiet, and did not answer four escalating requests — including one asking only
for two integers. The run was completed inline rather than held open, and the
marker records `RAN-DEGRADED` on both halves rather than claiming a clean run.

**Assessment B — detector (`detect.mjs`, deterministic).** 11 findings across
`components/admin`, `app/admin`, `components/crew`, `components/shared`. Exactly
one lands in a file this diff touches — `step3ReviewSections.tsx:3651`,
`broken-image` on a raw `<img>` — and it is **not attributable to this diff**
(zero `img` lines added to that file) and is a documented revert besides:
`next/image` drops cookies, so the raw tag is deliberate and mirrors the crew
Gallery pattern. Zero detector findings caused by this branch.

**Assessment A — design review. One P1, and it was mine.**

**P1 — `components/crew/sections/TodaySection.tsx`: the suppressed Tonight card
stranded its remaining row.** Fixed in this branch. When the two date rows are
suppressed for an `unknown_asterisk` viewer, the lone Hotel row had its
`span: 2` REMOVED. I had reasoned that a spanning row alone would stretch across
a row with nothing beside it. Reading the primitive rather than the prop name
shows the opposite: `span: 2` means "occupy both columns" at ≥720px
(`KeyValueRows.tsx:38`), so removing it puts the lone row in the LEFT column and
leaves the right half of the card empty — the exact stranding I was trying to
avoid. Restored. This is the finding that justified running the gate at all:
every mechanical check passed, and this one needed someone to read the component
the prop belongs to.

**P0: none.** **P2/P3: none new.** The diff is overwhelmingly non-visual — it
converts conditional live regions to permanently-mounted ones that are `sr-only`
when idle, so there is no rendered change at the vast majority of sites. The two
genuinely visual changes are the badge token (contrast verified above) and the
Tonight card (the P1 above).

**Persona check.** Doug reads the admin surface on a venue floor, one-handed;
crew read the show page in variable light. Nothing here adds a hover-only
affordance, shrinks a target, or adds a step. The Today change REMOVES
information for one viewer class, which is a deliberate privacy decision, and
the card still answers "which hotel" — the question a crew member actually opens
it for.

**Disposition:** the single P1 is FIXED in this branch, not deferred.

impeccable-gate: critique=RAN-DEGRADED audit=RAN-DEGRADED p0=0 p1=1 dispositions=recorded
