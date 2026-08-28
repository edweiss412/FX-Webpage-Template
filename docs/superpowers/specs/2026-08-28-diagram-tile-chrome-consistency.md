# Diagram tile chrome: one arrangement, and the family count that follows

Closes `BL-DIAGRAM-TILE-CHROME-CONSISTENCY` (BACKLOG.md). Effort S, product-facing, LOW severity.

## 1. The ruling

The two diagram surfaces draw the same visual idiom two ways. The crew gallery paints the tile's box on
the grid CELL and leaves `object-cover` on the image
(`components/diagrams/Gallery.tsx:351`, image class at `components/diagrams/Gallery.tsx:412`). The admin
wizard tile paints `rounded-md border border-text-faint bg-surface-sunken` on the `<Image>`
(`components/admin/wizard/step3ReviewSections.tsx:3955`) and leaves the anchor carrying only `relative`,
its aspect box, `overflow-hidden` and a focus ring
(`components/admin/wizard/step3ReviewSections.tsx:3938`).

**Chosen: the chrome goes on the WRAPPER.** The admin tile's `rounded-md border border-text-faint
bg-surface-sunken` moves from the `<Image>` to the anchor; the image keeps `object-cover`. The crew
gallery is already this arrangement and is not edited. The token is NOT changed — see §6.

### 1.1 Resolved scope — do not relitigate

- **The move is not required by `fill` insetting, and no argument here rests on insetting.** With no
  border on the anchor its padding box IS its border box, so a `fill` image insets to the same
  rectangle either way. The filing arc ran the move as a mutant and the whole real-browser layout suite
  passed either way. An earlier justification claiming the insetting forced the move is DISPROVED. Any
  finding that revives it is refuted by this paragraph and by the BACKLOG row.
- **The border token is out of scope.** `border-text-faint` on this element was chosen four days ago by
  a ratified ruling (`docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md:320`
  swapped it from `border-border`). This diff moves which element carries it and changes no colour.
- **The failed branch is not edited.** See §6, L1.
- **Both surfaces are already correct about `relative` and their focus rings.** Those placements carry
  their own measured justifications in the code comments and are untouched.

## 2. The class, derived rather than listed

The row asks the question of every bordered thumbnail, not only of the two named surfaces. The class is
**an image inside a chrome box that exists independently of the image** — a wrapper that must paint the
box in a render state where there is no image. Swept over `components/` and `app/` excluding
`app/api/**`, every `<img>` / `<Image>`:

| Surface | chrome on | box chrome | in class? |
| --- | --- | --- | --- |
| `components/diagrams/Gallery.tsx:351` cell, image at `components/diagrams/Gallery.tsx:412` | CELL `<li>` | `rounded-sm border border-border bg-surface-sunken` | **yes** — the cell paints for the available branch and the `ImageOff` branch alike |
| `components/admin/wizard/step3ReviewSections.tsx:3955` image, anchor at `components/admin/wizard/step3ReviewSections.tsx:3938` | **IMG** | `rounded-md border border-text-faint bg-surface-sunken` | **yes** — and it is the violator |
| `components/admin/wizard/step3ReviewSections.tsx:3874` failed `<span>` | CONTAINER | `rounded-md border border-border bg-surface-sunken` | the SAME member as the row above — `DiagramTile`'s other branch, not a third surface. Already correct, and it is what the row above disagrees with |
| `app/help/_components/Screenshot.tsx:34` | IMG | `rounded border border-border` | **no** — one render state, so no wrapper is "the element present in every state". Its `<figure>` also holds the `<figcaption>`, and `ScreenshotPlaceholder` is a sibling component a doc author selects at authoring time, not a runtime fallback branch of `Screenshot`. Excluded by the shape, not deferred |
| `components/admin/wizard/VenueMapTile.tsx:100` | WRAPPER | no border or radius at all | no — there is no box chrome to place; the tile's ground is a gradient span at `components/admin/wizard/VenueMapTile.tsx:47` |
| `components/diagrams/GalleryLightbox.tsx:973` and `components/diagrams/GalleryLightbox.tsx:1152` | none | none | no — a full-viewport zoom canvas, `object-contain`, no tile box |
| `app/auth/sign-in/page.tsx:192`, `app/auth/sign-in/SignInButton.tsx:53`, `components/admin/nav/AdminNav.tsx:134`, `components/admin/nav/OnboardingTopBar.tsx:47` | n/a | none | no — bare wordmarks and logos |

The class has **two** members — `Gallery` and `DiagramTile` — and **one** violator. `DiagramTile` occupies two rows because its two branches answer the question differently. The shape is stated as a property (does a wrapper
have to paint the box with no image present?) precisely so it can be re-run rather than re-listed.

## 3. Why the wrapper, and not the image

Four reasons, each checkable. None of them is insetting.

**3.1 The wrapper is the only element present in every state, and the image is not.** Both class
members have a state with no image: the crew gallery's `ImageOff` branch
(`components/diagrams/Gallery.tsx:416`) and the admin tile's `failed` branch
(`components/admin/wizard/step3ReviewSections.tsx:3874`). Chrome on the image therefore has to be
declared twice, once per branch, and the two copies must be kept in agreement by hand. In the admin
tile they already disagree: the failed `<span>` paints `border-border`, the live `<Image>` paints
`border-text-faint`. Chrome on the wrapper is one declaration that cannot drift from itself.

**3.2 The control-outline token belongs on the control.** `border-text-faint` is the control-outline
token — a control edge that has to stand on its own needs text-grade contrast (DESIGN.md §1.2a;
`--color-text-faint` as OUTLINE is pinned at DESIGN.md:183). Today it sits on an `<img>`, which is not
a control. The anchor is. The 2026-08-26 ruling swept this element precisely because the image's border
WAS serving as the control's visual edge; putting the class on the control states that directly instead
of by proxy.

**3.3 The crew gallery cannot take the opposite arrangement, so only this one can be common to both.**
Two placements on that cell are load-bearing and documented at
`components/diagrams/Gallery.tsx:338-350`: `relative` must stay on the `<li>` because WebKit resolves
the button's `height: 100%` against the cell's aspect-ratio BORDER box, and the focus ring must stay on
the cell because an outset ring on the size-full button is clipped by the cell's `overflow-hidden`
while an inset one paints under the absolutely positioned fill image. A rule that says `chrome on the image` would have to except the crew gallery on its first
application.

**3.4 The radius clip already lives on the wrapper.** Both wrappers carry `overflow-hidden`
(`components/diagrams/Gallery.tsx:351`, `components/admin/wizard/step3ReviewSections.tsx:3938`), so the
wrapper is what clips the image to the corner radius. Chrome on the image puts the radius on an element
whose corners are already being clipped by its parent — two elements describing one rounded box.

## 4. The change

One file, one className pair.

`components/admin/wizard/step3ReviewSections.tsx:3938` — the anchor gains the box:

- add `rounded-md border border-text-faint bg-surface-sunken`

`components/admin/wizard/step3ReviewSections.tsx:3955` — the image keeps only its fit:

- `rounded-md border border-text-faint bg-surface-sunken object-cover` becomes `object-cover`

`components/diagrams/Gallery.tsx` is NOT edited: it is already the chosen arrangement, and §3.3 is why.

The tile's own code comment at `components/admin/wizard/step3ReviewSections.tsx:3926-3931` currently
says the chrome "deliberately STAYS on the image" and cites the perf arc's scope decision. That comment
is now false and is replaced by the ruling here, cross-referencing this spec.

## 5. §15 table 3: the count moves 4 to 3, deliberately

`docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md:816` (§15 table 3, last
row) counts "the four `step3ReviewSections` visuals" as single-state and instant. That count is DERIVED,
not retyped, by `tests/styles/controlOutlineTransitions.test.ts:242-255`: elements in
`step3ReviewSections.tsx` with `admittedAs === "painted-child"` and a class string matching
`border-(text-faint|control-outline-tinted)`. Run at base `60dece4d5` the derivation finds exactly:

| # | element | role |
| --- | --- | --- |
| 1 | `components/admin/wizard/step3ReviewSections.tsx:1236` `<span>` | icon chip |
| 2 | `components/admin/wizard/step3ReviewSections.tsx:1778` `<span>` | icon chip |
| 3 | `components/admin/wizard/step3ReviewSections.tsx:1789` `<span>` | icon chip |
| 4 | `components/admin/wizard/step3ReviewSections.tsx:3940` `<Image>` | **the diagram tile image** |

Moving the class off member 4 drops it from the population: it no longer matches the token pattern, so
it is no longer a swept painted child. The anchor that gains the class does NOT replace it — the anchor
is an interactive control admitted as itself, never `admittedAs === "painted-child"`, so it cannot enter
this filter. **The count becomes 3, and the movement is the point of the change rather than a side
effect of it.**

Landing in the same commit as the className move:

1. `docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md:816` — its
   `the four step3ReviewSections visuals` phrase becomes `the three`, with a one-line note naming
   this spec as what moved the fourth and why.
2. `tests/styles/controlOutlineTransitions.test.ts:254` — `toHaveLength(4)` becomes `toHaveLength(3)`,
   and the comment above it, which says a fifth appearing is an inventory change, is extended to say
   the same of a fourth reappearing.

§6.2 of that spec (`docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md:320`) is NOT edited. It is a record of what the swap measured at the time, anchored
to lines that have since drifted, and rewriting a past measurement to match today's tree would destroy
the only evidence of what was measured.

## 6. Documented limits

- **L1. The two branches of the admin tile still paint different border tokens.** After this change the
  anchor paints `border-text-faint` and the failed `<span>` paints `border-border`
  (`components/admin/wizard/step3ReviewSections.tsx:3874`). The boxes coincide — both are
  `aspect-4/3 w-full` under `box-sizing: border-box`, which is why
  `tests/e2e/step3-review-modal.layout.spec.ts:659` passes today and after — but the visible edge
  differs in weight between a tile that loaded and one that failed. This is NOT settled here, in either
  direction, because both tokens were set deliberately: `border-text-faint` is the control-outline token
  and the anchor is a control, while the failed `<span>` is a non-interactive placeholder that the
  control-outline rule does not reach. Choosing between them is a design decision about whether a tile's
  resting edge reads as a container or as a control, which is the question DESIGN.md §1.2a answers for
  controls only. Re-file trigger: a measurement showing the failure-state edge is not discoverable on
  the publish-review surface, which is where it matters most.
- **L2. `app/help/_components/Screenshot.tsx` keeps its chrome on the image.** §2 states why it is
  outside the class rather than deferred. If it ever gains a runtime no-image state, it enters the class
  and this ruling applies to it unchanged.

## 7. Dimensional invariants

The anchor is a fixed-dimension parent (`aspect-4/3 w-full`) with an absolutely positioned `fill`
child, so every relationship is listed even though none of them changes.

| Parent | Child | Invariant | Guaranteed by |
| --- | --- | --- | --- |
| anchor `components/admin/wizard/step3ReviewSections.tsx:3938` | `<Image fill>` `components/admin/wizard/step3ReviewSections.tsx:3940` | child fills the anchor's padding box | `fill` emits `position:absolute; inset:0`; the anchor is `relative` |
| anchor `components/admin/wizard/step3ReviewSections.tsx:3938` | itself | outer box unchanged by the added border | Tailwind preflight sets `box-sizing: border-box`, so a 1px border consumes content box, not outer box |
| grid cell | anchor | anchor is full width of its cell | `w-full` |
| live tile | placeholder tile | identical outer box | both `aspect-4/3 w-full`; asserted in a real browser at `tests/e2e/step3-review-modal.layout.spec.ts:659` |

The one visible consequence: the image now insets 1px inside the border instead of painting under it.
That is a rendering change of exactly the border width and is what putting a box on a box means. It is
not offered as a reason for the change (§1.1).

## 8. Transition inventory

The tile is single-state in both branches — `failed` selects a different element tree rather than a
different visual state of one element, and neither carries `transition-*`. No state pair exists, so
there is nothing to animate and nothing is added. This is the same claim §15 table 3 already makes; the
change moves which element the claim is about, not the claim.

| State pair | Transition |
| --- | --- |
| live to failed, failed to live | instant, no animation needed; the branches are separate element trees and neither declares a transition |
| anchor rest to focus | `focus-visible:ring-*`, unchanged by this diff |

## 9. Acceptance criteria

- **AC-1.** `components/admin/wizard/step3ReviewSections.tsx:3955`'s image class string is exactly
  `object-cover`; the anchor at `components/admin/wizard/step3ReviewSections.tsx:3938` carries `rounded-md border border-text-faint bg-surface-sunken`.
- **AC-2.** `components/diagrams/Gallery.tsx` is unchanged by this diff.
- **AC-3.** The §15 table 3 derivation finds three visuals, and the tile `<Image>` is not among them.
- **AC-4.** `docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md:816` says three,
  in the same commit as AC-1.
- **AC-5.** `tests/e2e/step3-review-modal.layout.spec.ts` is green in a real browser at this head, with
  its live-tile-equals-placeholder-tile box assertion among the passes. The count of tests it runs is
  reported from the run, not carried over from the filing.
- **AC-6.** The `border-text-faint` occurrence count for this file is unchanged, so
  `tests/styles/tintedPlateOutline.test.ts:224`'s `neutralFaintCount: 9` pin does not move: the class
  string is relocated within one file, not added or removed.
- **AC-7.** The full styles suite is green, including the fill and residue censuses — the anchor now
  carries the outline/ground pair the image used to carry, and the pair itself is unchanged.
