# Step-3 a11y cluster — sub-44px targets and a skipped heading level

**Date:** 2026-08-07
**Branch:** `fix/step3-a11y-cluster`
**Ledger disposition:**
- `NEWTAB-A11Y-RESIDUE-1` (DEFERRED.md:67) — **fully resolved; moved to `DEFERRED-archive.md`**
  by this branch. Both its items ship (§2.4, §2.5).
- `STEP3-GALLERY-TAP-TARGETS-1` (DEFERRED.md:11) — **partially resolved; STAYS in
  `DEFERRED.md`**. Items (a), (b), (c) ship here and are struck from the entry body with a
  pointer to this spec; item (d) is untouched and keeps its own un-defer trigger (§9). The
  entry is NOT archived, because the ledger front matter defines the archive as where an item goes  *when it ships*, and (d) has not.
**Surface:** UI (invariant 8 applies — impeccable dual gate at close-out)

---

## 1. Problem

Two deferred entries record five accessibility defects on the `/admin` onboarding wizard,
surfaced by the invariant-8 dual gate against a seeded Step-3 gallery and deliberately left
out of the branches that found them. They share two root shapes:

1. **Interactive targets below the project's 44×44px floor** (`PRODUCT.md:59` — "All
   interactive targets ≥44×44px", both axes, with a WCAG 2.5.5 inline-prose exception that
   does not apply to any site below; `DESIGN.md:216` — `--spacing-tap-min: 44px`, "Every
   interactive element (button, link, toggle, accordion handle) ≥44×44px").
2. **A heading level skipped** on the Step-3 page: `h1` followed directly by `h3`, with no
   `h2` rendered at all (WCAG 1.3.1 Info and Relationships).

### 1.1 Resolved scope — do not relitigate

Each item is ratified at the cited location. Verify the citation; do not re-derive the decision.

| # | Decision | Ratification |
|---|---|---|
| R1 | **Two of the ledger entry's own citations are wrong and are corrected here, not preserved.** `STEP3-GALLERY-TAP-TARGETS-1(a)` (DEFERRED.md:28-36) places the "What does this mean?" `<summary>` in `step3ReviewSections.tsx` and claims its parent is `min-h-12`. Neither holds. §2.1 carries the corrected anchors with probe evidence. The 20.3px measurement itself is reproduced exactly and is not in dispute. | §2.1, §7 probe P1 |
| R2 | **`before:-inset-2` — the hit-expansion recipe DEFERRED.md:43 proposes — is refuted by probe and is NOT the recipe this spec adopts.** Measured: only the top and left extensions take the pointer; the right and bottom edges return the ancestor `<nav>`/wrapper. §7 probe P4 carries the measurement. Re-proposing it requires a probe showing all four edges hit. | §7 probe P4 |
| R3 | **`step3ReviewSections.tsx` is NOT modified for the heading fix.** Its `Heading = sub ? "h4" : "h3"` (`components/admin/wizard/step3ReviewSections.tsx:897`) reaches the DOM through the `step3Sections` registry, whose heading-producing render call is `components/admin/review/ShowReviewSurface.tsx:1156`, itself mounted by `components/admin/wizard/Step3ReviewModal.tsx:54` and `components/admin/showpage/PublishedReviewModal.tsx:79`. Promoting the two page-level `h3`s in `Step3Review.tsx` to `h2` makes the page outline monotonic without touching the shared component. §2.3. | §2.3 |
| R4 | **The class sweep was RUN, and it splits into a mechanical half that ships and a judgment half that is filed.** §2.6 carries the corpus baseline: 340 in-scope interactive elements, 139 the recogniser cannot clear, of which **16 are literal-and-genuinely-under-44px**. This branch repairs the **chrome** half — all 7 `<summary>` disclosures and all 7 icon/composite targets (§2.2: three step links, the two HelpSheet buttons, HelpTooltip, and the AdminNav brand link). The remaining 8 are inline text links and text buttons whose exemption status is a per-site product decision (exception (a)), and are filed in §9 with that reason named. **"Same defect, different file" is NOT claimed as a deferral reason anywhere.** | §2.6, §9 |
| R5 | **`NEWTAB-A11Y-RESIDUE-1(a)` reverses a previously accepted audit fix, deliberately.** `tests/components/admin/wizard/step3ReviewSections.test.tsx:906` currently pins that a blank `alt` falls back for BOTH the `<img alt>` and the anchor `aria-label`. The anchor's `aria-label` (`step3ReviewSections.tsx:3706`) now solves the nameless-link risk permanently, so the belt-and-braces `alt` is redundant and produces a double-name. That test is UPDATED, not deleted; §2.4 states the replacement contract. | DEFERRED.md:75-86 |
| R6 | **Every repaired control keeps its EXISTING painted box — 28px for the pills, trigger and tooltip, 36px for the HelpSheet close button — and its existing corner radius.** This is an accessibility repair, not a visual redesign; only the hit box grows. "28px everywhere" would be wrong: the close button is `size-9`. Any finding that the UI "looks different" is a defect in the implementation, not an intended change. | §2.2, §6 DI-4, DI-14 |
| R7 | **Layout geometry is preserved exactly.** The adopted recipe's negative margin cancels the growth, so pill centres are unchanged (probe P6: expanded-row pill centres identical to today's at 320px). This is required, not incidental: connectors measure **0px wide at 320 and 390** (probe P3), so the stepper has zero horizontal slack and any layout growth would overflow. | §7 probe P3/P6, §6 DI-3 |
| R8 | **`components/admin/nav/AdminNav.tsx:88-114` (the brand link) is in scope even though it does not render on the wizard route.** `app/admin/layout.tsx:169` renders `OnboardingTopBar` on the onboarding branch and `AdminNav` at `app/admin/layout.tsx:204` on every other `/admin/*` route. It is repaired here under R4 (same shape), not because the wizard shows it — and it takes its own recipe, because it is a composite link rather than an icon button (§2.2). | §2.2 |
| R9 | **All measurements in this document are written `width × height`.** The ledger's own `274.0x20.3` (DEFERRED.md:30) is quoted verbatim in that same order. A reviewer reading `288 × 20.3` as height-first is reading it wrong; the failing axis throughout §2.1 is the SECOND number. | §2.1, §7 |

---

## 2. What changes

### 2.1 Class A — `<summary>` elements below the floor

`text-sm` resolves to 14px/1.45 → **20.3px** line box; `text-xs` to 12px/1.4 → 16.8px. Probe
P1 measured the canonical instance at **288 × 20.3** (320px) and **358 × 20.3** (390px),
reproducing DEFERRED.md:30's "274.0x20.3" to the pixel on the vertical axis.

| Site | Today | Measured / computed height | Route |
|---|---|---|---|
| `components/admin/HelpAffordance.tsx:95` **(the ledger's P1)** | `cursor-pointer list-none underline-offset-2 hover:underline focus-visible:*` | 20.3px (probe P1) | `/admin?step=2`, `/admin?step=3`, ~17 admin action surfaces |
| `components/admin/OnboardingWizard.tsx:561` | `cursor-pointer font-medium` | 20.3px | `/admin` wizard error state |
| `components/messages/ErrorExplainer.tsx:114` | `cursor-pointer list-none` | 20.3px | `/auth/sign-in`, admin error toasts |
| `components/admin/HelpTooltip.tsx:57` | `inline-flex size-7 …` | 28px (also Class B) | `/admin` show detail, `/admin/settings` |
| `components/admin/settings/AdministratorsSection.tsx:131` | `cursor-pointer p-3 text-xs font-semibold …` | 16.8 + 12 + 12 = **40.8px** — a 3.2px near-miss, sized by padding rather than by a small utility | `/admin/settings/admins` |
| `app/me/page.tsx:239` | `cursor-pointer list-none text-xs font-semibold uppercase …` | 16.8px | `/me` |
| `components/crew/primitives/RunOfShowList.tsx:82` | template literal: `` `cursor-pointer list-none text-sm font-medium ${titleTone} …` `` | 20.3px | crew show page |

**Two of the seven are not literal-small-utility sites, which matters for §2.6's baseline and
for the fixtures §8 must use:**

- `AdministratorsSection.tsx:131` is sized by `p-3`, not by a size utility. Its repair still
  adds `min-h-tap-min`; `p-3` stays (it is the disclosure's own padding, not a tap fix).
- `RunOfShowList.tsx:82` has a **non-literal (template) className**, and — load-bearing for
  the test fixture — **its `<summary>` renders only when the title exceeds 80 characters.**
  `lib/crew/agendaDisplay.ts:25` defines `TITLE_TRUNCATE_AT = 80`;
  `components/crew/primitives/RunOfShowList.tsx:31` computes
  `const isLong = title.length > TITLE_TRUNCATE_AT;` and `components/crew/primitives/RunOfShowList.tsx:79-89` renders
  `{isLong ? (<details><summary …>) : (<span …>{title}</span>)}`. A short title yields a
  plain `<span>` and **no `<summary>` at all**, so a short-title fixture cannot exercise this
  repair. **The fixture must use a title longer than 80 characters.**

**Recipe (all seven):** add `inline-flex w-fit min-h-tap-min items-center` to the existing
class string, mirroring the sibling `Learn more →` link at `HelpAffordance.tsx:111`, which
already ships exactly `inline-flex w-fit min-h-tap-min items-center`.

Probe P2 confirms both halves of the risk this carries:
- Result is **144.8 × 44** — clears the floor on both axes.
- `w-fit` is load-bearing. Without it the `<summary>` stays block-level and becomes a
  **288px-wide invisible 44px band** that swallows pointer events aimed at neighbouring
  content. The spec requires `w-fit`; an implementation that drops it is a defect.
- **`display: inline-flex` does not break `<details>` toggling** — probed directly,
  `open false -> true` on click, at all four viewports. This was the standing risk with
  changing a `<summary>`'s display; it is settled, not assumed.

Sites already compliant, listed so a reviewer does not re-flag them:
`components/admin/wizard/step3ReviewSections.tsx:1590`,
`components/admin/wizard/step3ReviewSections.tsx:2634`,
`components/admin/wizard/Step1Share.tsx:122`,
`components/admin/wizard/Step1Share.tsx:194`,
`components/admin/showpage/sectionWarningExtras.tsx:272`,
`components/crew/AgendaScheduleBlock.tsx:107`,
`components/crew/sections/TodaySection.tsx:566`,
`components/crew/sections/GearSection.tsx:381`,
`components/crew/primitives/KeyTimesStrip.tsx:190`.

### 2.2 Class B — small interactive targets

| Site | Element | Today | Fix |
|---|---|---|---|
| `components/admin/OnboardingWizard.tsx:127` **(the ledger's P2)** | `<Link>` × 3 (`base` const) | `flex size-7 …` 28×28 | Anchor becomes the target; visual pill moves to an inner `<span>` |
| `components/admin/HelpSheet.tsx:68` **(the ledger's P2)** | `<button>` | `inline-flex size-7 …` 28×28 | Same recipe |
| `components/admin/HelpSheet.tsx:139` | `<button aria-label="Close help">` | `-m-1 inline-flex size-9 …` **36×36** | Same recipe. **Its `-m-1` has no matching padding**, so it expands nothing today — the negative margin is pure layout offset |
| `components/admin/HelpTooltip.tsx:57` | `<summary>` | `inline-flex size-7 …` 28×28 | Same recipe (also Class A — see precedence below) |
| `components/admin/nav/AdminNav.tsx:88-114` brand `<Link href="/admin">` | `<Link>` | 28px tall; 28px wide only below 360px | **Different recipe — see below.** Not the generic one |

**Recipe, empirically selected (probe P4/P5/P6):**

```
target (a / button / summary):  -m-2 <flex|inline-flex> size-tap-min shrink-0
                                items-center justify-center
inner <span> (new):             the visual classes, per the ownership table below
```

`<flex|inline-flex>` is whichever the element carries today: `flex` for the three step pills
(`components/admin/OnboardingWizard.tsx:127`), `inline-flex` for the two HelpSheet buttons
and HelpTooltip. Substituting one for the other changes how the element sits in its parent's
layout, which R7 forbids.

`size-tap-min` resolves through Tailwind v4's `--spacing-*` namespace from
`--spacing-tap-min: 44px` (`app/globals.css:179`) and is already used elsewhere in the repo.

**Class ownership when the string splits — stated per class, because "move `base` verbatim"
is wrong for two of the four.** `StepIndicator` is the easy case: its visual `base` and its
`focusRing` are already separate constants (`components/admin/OnboardingWizard.tsx:126-129`)
applied together at `components/admin/OnboardingWizard.tsx:167`, so `base` moves to the span and `focusRing` stays on the anchor
with no untangling. `HelpSheet` and `HelpTooltip` are NOT: each has one fused string
carrying visual, cursor, and focus classes together
(`components/admin/HelpSheet.tsx:68-78`, `components/admin/HelpTooltip.tsx:57-63`). Moving it
verbatim would put `cursor-pointer` and every `focus-visible:*` class on a **non-focusable
inner span**, which can never match the `focus-visible` pseudo-class — silently deleting the focus ring and
contradicting DI-13, and leaving the expansion band without a pointer cursor.

Split every fused string by destination:

The table is **exhaustive over the four fused strings** — every class present on
`components/admin/HelpSheet.tsx:75`, `components/admin/HelpSheet.tsx:145`,
`components/admin/HelpTooltip.tsx:60` and `components/admin/OnboardingWizard.tsx:127` has a
row. The last row is the residual rule, so a class the implementer finds unlisted still has
a defined destination rather than a judgment call.

| Class | Destination | Why |
|---|---|---|
| The size utility — `size-7` on the trigger/pills/tooltip, **`size-9` on the HelpSheet close button** | **inner span** | This is the painted visual, whatever its value. It is NOT always 28px (R6 is scoped accordingly) |
| `bg-*`, `text-*`, `font-*`, `align-middle`, `transition-colors duration-fast` | **inner span** | These paint the visual |
| `list-none` (HelpTooltip's `<summary>`) | **target element** | It suppresses the disclosure marker on the `<summary>` itself; on a child `<span>` it does nothing |
| The radius — `rounded-pill`, or **`rounded-sm` on the close button** | **BOTH** | The span needs it for the visual; **the target needs it too, or its focus ring turns square.** The ring follows the focused element's own radius, and today radius and ring sit on the same element |
| `focus-visible:*` (ring, offset, outline) | **target element** | Only the focusable element can match `focus-visible` (DI-13) |
| `cursor-pointer` | **target element** | The cursor must change across the whole 44px band |
| `hover:*` | **inner span, rewritten `group-hover:*`** | See the hover rewiring below |
| `items-center`, `justify-center` | **BOTH** | The target centres the span inside 44px; the span centres its glyph inside 28px (or 36px). Omitting either leaves a glyph off-centre |
| `shrink-0` | **BOTH** | The target must not shrink in its flex row; the span must not shrink inside the target |
| The display utility — `flex` (pills) or `inline-flex` (the other three) | **BOTH, each keeping its own** | The target keeps the display the original element had, so its participation in the parent's layout is unchanged; the span takes the same value so its own centring works. **`flex` for the pills, `inline-flex` for the HelpSheet pair and HelpTooltip** — the generic recipe line above writes `flex` because it is written for the pills |
| `-m-1` on the close button | **dropped** | It expands nothing today (no matching padding) and the target's own `-m-2` replaces its layout role. Keeping both would double-offset |
| **Anything not listed above** | **inner span** | Residual rule. Every remaining class on these four strings is presentational; if an implementer finds one whose behaviour depends on being on the interactive element, that is a spec gap to raise, not to decide |

**`HelpTooltip` appears in BOTH Class A and Class B; Class B wins.** It is a `<summary>` that
is also a 28×28 pill, so both recipes name it. Applying Class A's
`inline-flex w-fit min-h-tap-min items-center` would give it a 44px-tall but still 28px-wide
box. **Apply the Class B recipe only** — it satisfies both axes and preserves the pill.

**`AdminNav`'s brand link takes a DIFFERENT recipe, because it is a composite.** The generic
recipe fixes the target at `size-tap-min` — a 44px **square**. The brand link is not an icon
button: it is `flex items-center gap-2` wrapping a 28px `<Image>` plus two responsive text
spans, "FXAV" at `min-[360px]:inline` and an "Admin" pill at `min-[440px]:inline-block`
(`components/admin/nav/AdminNav.tsx:88-114`). Applying `size-tap-min` literally would clamp
the whole composite to 44px wide and crush the wordmark; wrapping only the `<Image>` would
leave the link's own box under the floor. Neither is the generic recipe, so it is stated
here rather than left to the implementer:

```
brand <Link>:  min-h-tap-min -mx-2 px-2   (added to the existing class string)
```

- `min-h-tap-min` fixes the vertical axis, which fails at every width.
- `-mx-2 px-2` fixes the horizontal axis in the **icon-only state below 360px**, where the
  link is 28px wide; 28 + 8 + 8 = 44. At ≥360px the wordmark already carries the width past
  the floor and the padding simply extends the target.
- The negative margin is required for the same reason as everywhere else: the 320px topbar
  budget is already tight — `components/admin/nav/AdminNav.tsx:95-109` documents four
  irreducible 44px controls in the action cluster, with the brand block yielding
  progressively to keep the bar inside the viewport. `-mx-2` keeps the link's layout
  footprint unchanged so that budget is untouched.
- **No inner span, and therefore no hover rewiring**, since no visual class moves. The link
  has no `hover:` variant today (`components/admin/nav/AdminNav.tsx:91`); its focus ring is
  already on the element that becomes the 44px target.
- The row is already ≥44px tall from those sibling controls, so raising the link to 44px
  changes no row geometry (DI-12).

**Hover and focus MUST be rewired to the anchor — this is not optional polish.** Moving the
visual classes to an inner `<span>` moves their `hover:` and `focus-visible:` variants too,
and those variants would then fire only when the pointer is over the **28px span**, not over
the 44px anchor. The 8px expansion band would be tappable but visually dead — a target that
responds to a tap it gave no feedback for, which is worse than the small target it replaced.

- **`group` goes on the TARGET element, all four of them** — the step-pill anchor, the
  HelpSheet trigger button (`components/admin/HelpSheet.tsx:68`), the HelpSheet close button
  (`components/admin/HelpSheet.tsx:139`), and the HelpTooltip `<summary>`
  (`components/admin/HelpTooltip.tsx:57`). Tailwind generates
  `group-hover:*` as `:is(:where(.group):hover *)`, so an ancestor carrying `.group` is
  mandatory; without it the rewritten utilities never match and hover feedback disappears
  entirely rather than degrading.
- **Do NOT put `group` on HelpTooltip's outer `<details>`.** It is an ancestor, so the
  selector would match — but then hovering anywhere in the *disclosed content* would light up
  the trigger. The `<summary>` is the target and the target is where `group` belongs.
- The step-pill anchor also keeps the existing focus ring
  (`components/admin/OnboardingWizard.tsx:128-129`), so the ring outlines the real target.
- Every `hover:` variant on the moved class string becomes `group-hover:` on the inner span.
  Concretely, `hover:text-text-strong` in the visited `pillState`
  (`components/admin/OnboardingWizard.tsx:157`) becomes `group-hover:text-text-strong`.
- The same rewiring applies to `HelpSheet.tsx:75` (`hover:bg-surface hover:text-text-strong`)
  and to `HelpTooltip.tsx:60`.
- `transition-colors duration-fast` stays on the inner span, which is where the color lives.

Why this and not the ledger's `before:-inset-*` (R2), stated as measurements:

| Candidate | Box | All four edges take the pointer? | Layout drift |
|---|---|---|---|
| `before:absolute before:-inset-2` (DEFERRED.md:43) | 44×44 | **NO** — top ✓ left ✓ right ✗ bottom ✗ | none |
| `-m-2 box-content p-2` | **46×46** (border sits outside the content box) | yes | **+2px per pill** |
| **`-m-2 … size-tap-min` + inner span (adopted)** | **44×44 exactly** | **yes** | **none — centres identical** |

The three step pills' 44px boxes end up exactly **adjacent** (measured inter-box gap `0.0`
at 320 and 390; 97.0 / 55.4 at 768). Adjacent is required and overlapping is forbidden: at
gap 0 every pixel belongs to exactly one pill, so no pill can steal a neighbour's tap.
Probe P6 confirms each pill's own four edge-midpoints return that pill and never a sibling.

**Decorative `size-7` sites — explicitly NOT changed** (no click handler, no role, `aria-hidden`
or a plain icon tile): `app/help/_components/Step.tsx:8`,
`components/admin/wizard/step3ReviewSections.tsx:955`,
`components/admin/wizard/step3ReviewSections.tsx:3026`,
`components/admin/nav/OnboardingTopBar.tsx:53`, `components/crew/primitives/FactRows.tsx:69`,
`components/crew/DiagramsBlock.tsx:122`, `components/crew/primitives/SectionCard.tsx:51`.
Also unchanged: the unreached step pill, which is a non-interactive
`<span aria-disabled="true">` (`components/admin/OnboardingWizard.tsx:172`) — it has no
pointer target to grow.

### 2.3 Class C — the skipped heading level

Probed heading sequence on the Step-3 page today is `h1, h3, h3` with
`document.querySelectorAll("h2")` empty (DEFERRED.md:47-52).

| Site | Today | After |
|---|---|---|
| `components/admin/wizard/Step3Review.tsx:1300` `id="wizard-step3-heading"` | `h1` | `h1` (unchanged) |
| `components/admin/wizard/Step3Review.tsx:749` grouped-rows section heading | `h3` | **`h2`** |
| `components/admin/wizard/Step3Review.tsx:1406` `id="wizard-step3-needs-attention-heading"` | `h3` | **`h2`** |

Both promoted headings are top-level page sections directly under the `h1`, each already the
`aria-labelledby` target of its own `<section>` (`components/admin/wizard/Step3Review.tsx:1295`,
`components/admin/wizard/Step3Review.tsx:1400`). Result: `h1, h2, h2` — monotonic, no skip.

**Why the shared component is untouched (R3).** The `h3`/`h4` pair in
`components/admin/wizard/step3ReviewSections.tsx:897` renders inside the review modal and the
show-review surface, each of which opens its own outline context below a dialog heading — not
directly under this page's `h1`. Promoting the page's two `h3`s is sufficient and leaves every
consumer of the shared component byte-identical.

**Precise blast radius, since "five consumers" overstates it.** Of the five files importing
from `step3ReviewSections`, only three are on the heading path, and none renders a heading
inline on the Step-3 page: `components/admin/review/ShowReviewSurface.tsx:1156` is the
heading-producing render call, reached from `components/admin/wizard/Step3ReviewModal.tsx:54`
and `components/admin/showpage/PublishedReviewModal.tsx:79`. The other two import helpers and
constants only, not the registry renderer:
`components/admin/wizard/Step3SheetCard.tsx:55` and
`components/admin/review/sectionFreshness.ts:88`. **Even if a section heading did render
inline on the page, `h1 → h2 → h3` is still monotonic** — the promotion cannot introduce a
skip on any mount path, which is why the fix is safe without auditing every consumer. The in-repo precedent for the alternative (threading a
`headingLevel` prop per call site) is `RecentAutoAppliedStrip.tsx:691` +
`app/admin/needs-attention/page.tsx:109` — it is the right tool when a component genuinely
renders at two levels, and this one does not.

**Font-size guard.** `components/admin/wizard/Step3Review.tsx:749` is
`text-sm font-semibold text-text-subtle` and `components/admin/wizard/Step3Review.tsx:1406`
is `text-base font-semibold text-text-strong`. Both keep their existing classes; the tag
changes, the rendered type scale does not. A visual diff here is a defect.

### 2.4 `NEWTAB-A11Y-RESIDUE-1(a)` — the diagram link names itself twice

`components/admin/wizard/step3ReviewSections.tsx:3704-3724` gives the wrapping `<a>` an
`aria-label` built from the stripped `alt` AND leaves the inner `<img alt={alt}>`, so a
screen reader navigating into the link hears the same string twice.

- **Change:** the inner `<img>` becomes `alt=""` (decorative — the anchor carries the name).
- **The anchor's `aria-label` logic at `components/admin/wizard/step3ReviewSections.tsx:3706`
  is UNCHANGED**, including its empty-alt
  fallback (`"Staged diagram (opens in a new tab)"`) and its new-tab suffix.
- **Test contract replacement (R5) — THREE tests assert the `img alt`, not one.** All three
  encode the old belt-and-braces contract and all three change. The anchor half of each is
  load-bearing and is preserved unchanged in every case; only the `img alt` expectation moves
  to `""`.

  | Test | Today's `img alt` expectation | Replacement |
  |---|---|---|
  | `tests/components/admin/wizard/step3ReviewSections.test.tsx:899` — "alt fallback derives from the stub's sheetTab when alt is absent" | ``toBe(`Diagram from ${stub.sheetTab}`)`` | `toBe("")`. **Add** an assertion that the ANCHOR's `aria-label` is ``` `${fallback} (opens in a new tab)` ``` — otherwise this test no longer checks the fallback at all and becomes a weaker test than it is today |
  | `tests/components/admin/wizard/step3ReviewSections.test.tsx:906` — the empty / whitespace-only case | `toBe(fallback)` | `toBe("")`. The two existing anchor assertions (`tile.tagName === "A"`, `aria-label` = fallback + suffix) are unchanged — this is the *"a persisted empty alt must never yield a nameless link"* contract and it must still pass |
  | `tests/components/admin/wizard/step3ReviewSections.test.tsx:919` — "a real alt names both the img and the wrapping anchor" | `toBe("Stage plot")` | `toBe("")`. The anchor assertion (`aria-label` = `"Stage plot (opens in a new tab)"`) is unchanged. **Rename the test** — it no longer names "both", it asserts the anchor names the tile and the img is decorative |

  Each test's name is updated to state the new contract; leaving a name that promises the old
  one is how the next reader concludes the change was a mistake.

### 2.5 `NEWTAB-A11Y-RESIDUE-1(b)` — an internal link wears the external glyph

`components/admin/BellPanel.tsx:324-329` renders `View in telemetry <span aria-hidden="true">↗</span>`
for `/admin/dev/telemetry#health` and `/admin/dev/telemetry`, both internal routes. After the
new-tab sweep, `↗` means "opens a new tab" everywhere else in the codebase, so this is the
only one that lies.

- **Change:** drop the `↗` glyph span. The link keeps its text and destination.
- It carries no `target`, so the new-tab structural guard never saw it (DEFERRED.md:91-92).

---

### 2.6 Corpus baseline — the class sweep, run rather than described

Run 2026-08-07 against `origin/main` @ `61281c23e`, before this section was drafted, per the
mandated detector pass (`docs/agents/spec-self-review.md:23`) and the class-sweep rule's
requirement of an explicit procedure with its current output.

**Procedure.** A TypeScript compiler AST walk over every `.tsx` under `app/**` and
`components/**` (`ts.createSourceFile(..., ScriptKind.TSX)`, visiting `JsxOpeningElement` and
`JsxSelfClosingElement`), not a regex — a regex over JSX matches example markup inside `//`
and `/* */` comments and nested JSX in prop values, both of which occur in this repo.
In scope: `<button>`, `<a>`, `<Link>`, `<summary>`, `<input type="checkbox|radio">`, or any
tag with `role="button"` or `onClick`. Satisfying the floor: `min-h-tap-min` /
`size-tap-min` / `min-w-tap-min`; any `size-`/`h-`/`w-`/`min-h-`/`min-w-` at ≥ 11 on the 4px
scale; an arbitrary value ≥ 44px; a negative-margin plus matching-padding pair;
`before:absolute` with a negative inset; or `sr-only` (the real target is a parent label).

| Result | Count |
|---|---|
| In-scope interactive elements | **340** |
| Not cleared by the recogniser | **139** |
| — (A) literal className, genuinely under 44px | **16** |
| — (B) inline prose link (`PRODUCT.md:59` WCAG 2.5.5 exception) | 5 |
| — (C) small control whose real target is a parent label | 7 |
| — (D) sized by padding only | 4 |
| — (E) **non-literal className — UNCLASSIFIABLE** | **94** |
| — (F) full-bleed or ancestor-filled (`inset-0` scrims, `size-full`) | 13 |

**Bucket (E) is why the guard is filed rather than shipped (§5).** Bucket (D)'s arithmetic:
`app/admin/dev/page.tsx:151` and `app/admin/dev/page.tsx:165` reach 32.8px (`py-1` + `text-base` 24.8px);
`components/admin/settings/AdministratorsSection.tsx:131` reaches 40.8px;
`app/me/page.tsx:332` reaches ≥48px and passes.

**Disposition of bucket (A)'s 16 — every one accounted for, none left implicit:**

| Site | Disposition |
|---|---|
| `app/me/page.tsx:239` | **Repaired** (§2.1) |
| `components/messages/ErrorExplainer.tsx:114` | **Repaired** (§2.1) |
| `components/admin/HelpAffordance.tsx:95` | **Repaired** (§2.1) |
| `components/admin/OnboardingWizard.tsx:561` | **Repaired** (§2.1) |
| `components/admin/HelpTooltip.tsx:57` | **Repaired** (§2.2, Class B wins) |
| `components/admin/HelpSheet.tsx:68` | **Repaired** (§2.2) |
| `components/admin/HelpSheet.tsx:139` | **Repaired** (§2.2) — found ONLY by this pass |
| `components/admin/nav/AdminNav.tsx:88` | **Repaired** (§2.2) |
| `app/admin/dev/page.tsx:334` | **Filed** — `BL-TAP-TARGET-INLINE-TEXT-CONTROLS` |
| `app/admin/settings/admins/RevokeRowButton.tsx:283` | **Filed** — same |
| `components/admin/RoleRecognizeControl.tsx:268` | **Filed** — same |
| `components/admin/wizard/Step3SheetCard.tsx:149` | **Filed** — same |
| `components/admin/wizard/step3ReviewSections.tsx:1405` (`tel:`) | **Filed** — same |
| `components/admin/wizard/step3ReviewSections.tsx:1414` (`mailto:`) | **Filed** — same |
| `components/admin/wizard/step3ReviewSections.tsx:2585` | **Filed** — same |
| `components/shared/ReportModal.tsx:526` | **Filed** — same |

Note that `components/admin/settings/AdministratorsSection.tsx:131` and
`components/crew/primitives/RunOfShowList.tsx:82` are repaired by §2.1 but are **not** bucket
(A) members — the first sorts to (D) and the second to (E). The seven repaired disclosures
are therefore not a subset of any single bucket, which is itself the reason the sweep had to
be run rather than reasoned about.

---

## 3. Guard conditions

Every changed surface receives partial or absent data in some state; each is specified.

| Input | Null / empty / zero | Renders |
|---|---|---|
| `HelpAffordance` `code` null, empty, or unknown | Component returns `null` before any markup (`components/admin/HelpAffordance.tsx:72`) | Nothing. The summary fix cannot regress this — it is inside the `showHelpful` branch at `components/admin/HelpAffordance.tsx:93`. |
| `HelpAffordance` `helpful` null | `showHelpful` false (`components/admin/HelpAffordance.tsx:80`); `<details>` not rendered | The `Learn more →` link may still render alone (`components/admin/HelpAffordance.tsx:106`). Unchanged. |
| Diagram `alt` empty / whitespace-only | Anchor `aria-label` falls back to `"Staged diagram (opens in a new tab)"` (`components/admin/wizard/step3ReviewSections.tsx:3706`) | Anchor named; `img alt=""`. **Never a nameless link** (R5). |
| `StepIndicator` `maxReachedStep` < n | Pill is a non-interactive `<span aria-disabled="true">` (`components/admin/OnboardingWizard.tsx:172`) | No target grown — nothing to grow (§2.2). |
| `StepIndicator` `step` === n | `aria-current="step"`, label `Step {n}, current step` (`components/admin/OnboardingWizard.tsx:166`) | Target grown; `aria-current` unchanged. |
| `Step3Review` grouped section `rows.length === 0` | `return null` (`components/admin/wizard/Step3Review.tsx:745`) | Section, including its promoted `h2`, does not render. **The outline must stay monotonic when a section is absent** — with both promoted headings at the same level, any subset of them still yields `h1` followed only by `h2`s. |
| `BellPanel` entry is health | The telemetry link renders with the `#health` href (`components/admin/BellPanel.tsx:318-326`) | Glyph removed. |
| `BellPanel` entry is non-health, **is the watch code, and `viewerIsDeveloper` is true** | The link renders with the unfiltered href. The gate is `entry.isHealth \|\| (isWatch && viewerIsDeveloper)` (`components/admin/BellPanel.tsx:318`), where `isWatch = entry.code === WATCH_CODE` (`components/admin/BellPanel.tsx:289`) | Glyph removed. **This is the only non-health state that renders the link**, so it is the fixture the non-health assertion must use. |
| `BellPanel` entry is non-health and **not** (watch AND developer) | **No telemetry link renders at all** | Nothing. A "no `↗` present" assertion on this state is vacuous — it passes on an unrepaired build — hence the §8 premise. |
| `OnboardingWizard` error disclosure `entry.helpfulContext` absent | **No `<details>` renders at all** — the whole disclosure is conditional (`components/admin/OnboardingWizard.tsx:559-564`) | Nothing. There is no `<summary>` to measure, so DI-1 has no subject and needs the §8 premise. |
| `ErrorExplainer` unknown code / disabled helpful context | Guarded at `components/messages/ErrorExplainer.tsx:79-96`; `<details>` block at `components/messages/ErrorExplainer.tsx:112-119` does not render | Nothing. The repaired `<summary>` is inside that block. |
| `AdministratorsSection` zero revoked admins | **No disclosure renders** (`components/admin/settings/AdministratorsSection.tsx:126-145`) | Nothing. The fixture must seed at least one revoked admin or DI-1 is vacuous here. |
| `app/me/page.tsx` zero past shows | **No disclosure renders** (`app/me/page.tsx:237-257`) | Nothing. The fixture must seed at least one past show. |
| `RunOfShowList` title ≤ 80 chars | **No `<summary>` renders** — a plain `<span>` does. `components/crew/primitives/RunOfShowList.tsx:31` computes `isLong = title.length > TITLE_TRUNCATE_AT` (80, `lib/crew/agendaDisplay.ts:25`); `components/crew/primitives/RunOfShowList.tsx:79-89` branches on it | Nothing to repair or measure. |
| `RunOfShowList` title > 80 chars | The `<details>`/`<summary>` branch renders (`components/crew/primitives/RunOfShowList.tsx:80-91`) | The 20.3px `<summary>` this spec repairs. **This is the ONLY case with discriminating power, so the fixture title must exceed 80 characters.** |
| `Step3Review` needs-attention section with zero blocking rows | `components/admin/wizard/Step3Review.tsx:1397-1406` | Section and its promoted `h2` do not render. Outline stays monotonic (both promoted headings are the same level). |
| `HelpSheet` / `HelpTooltip` `label` empty | Feeds the trigger's accessible name directly (`components/admin/HelpSheet.tsx:62-75`, `components/admin/HelpTooltip.tsx:51-60`) | **Out of scope and unchanged** — this spec touches neither component's naming. Recorded so the geometry repair is not read as licence to alter the name. |

---

## 4. Documented limits

Per the preparedness-audit posture, these are recorded as limits rather than open findings.
Each has a conservative worst case with a visible signal, not silent breakage.

1. **Adjacent-not-overlapping is a 0px margin at mobile.** At 320/390 the three pills' 44px
   boxes touch exactly (gap `0.0`) because the connectors are 0px wide. This meets the floor
   and gives every pixel exactly one owner, but leaves no slack: a future change that widens
   the pill visual or the nav gap will push them into overlap. DI-3 asserts the non-overlap
   directly, so such a change fails CI rather than shipping.
2. **The 44px boxes extend 8px beyond the nav's own box** at its outer edges. This is the
   intended effect of a negative margin and is why layout is preserved; it means the
   stepper's *painted* bounds and its *tappable* bounds differ by 8px. No adjacent
   interactive element sits within that band on any wizard viewport (probe P6).
3. **`AdministratorsSection.tsx:131` was 40.8px — a 3.2px miss.** Recorded because it is the
   one site the eye would pass: it is not obviously tiny, and only the arithmetic
   (16.8 + 12 + 12) shows it under the floor.
4. **Nothing fails by default for a NEW small target.** §5 ships no guard, and AC-7 forbids
   one. The defence this branch actually ships is the §8 real-browser assertions on the real
   components, which pin the thirteen repaired sites — every one of them, including the
   non-wizard `/me`, `/admin/settings/admins`, `/auth/sign-in` and crew `RunOfShowList`
   disclosures, since §8 requires all seven to be mounted. That is regression coverage, not
   discovery coverage: a contributor adding a `size-7` button tomorrow is caught by nothing
   here. `BL-TAP-TARGET-STRUCTURAL-GUARD` (§9.1) is exactly that gap, filed with its
   evidence and its blocker named.

---

## 5. Structural defense — DESCOPED, with the measurement that descopes it

A repo-wide structural guard was specified here in draft 1. **It is not shipping in this
branch, and the reason is the corpus baseline in §2.6, not a preference.**

The mandated pre-draft detector pass (`docs/agents/spec-self-review.md:23`) was run against
the full corpus. It found **94 of 340 in-scope elements carry a non-literal `className`** — a
template literal, a ternary, a named constant, a `.join()`, or (for four `AccentButton` call
sites) no `className` prop at all, the floor living in the child component's own base string.
A guard honouring the consequence bound must report every one of those as UNCLASSIFIED rather
than pass it silently. So the guard cannot go green until someone dispositions 94 elements
across surfaces this branch does not otherwise touch — which is class-sweep exception (c),
"the repair is a redesign of a surface the PR does not otherwise touch, or spans enough sites
to blow the review scope."

Shipping it anyway would mean one of two bad outcomes, both worse than filing it: a guard
weakened until it passes (which stops honouring the bound, and would have missed
`HelpSheet.tsx:139` — a real defect found only because the corpus pass ran), or 94 exemption
comments written in a branch whose subject is thirteen class strings.

**Filed as `BL-TAP-TARGET-STRUCTURAL-GUARD`** (§9), carrying the probe evidence the filing
bar requires: the exact command, the 340/139/94 counts, and the six-bucket disposition table.
The first scheduled step is named in the entry — decide the non-literal-className policy —
because that decision, not the recogniser, is what actually gates the guard.

**What this branch ships instead, so the class is not left undefended:** the repairs
themselves plus the §8 real-browser assertions on the real components. Those pin the thirteen
repaired sites against regression. They do not fail-by-default for a NEW small target, and
this spec does not claim otherwise — that is precisely what the filed guard is for.

### Consequence bound and threat-model fence

Retained because §2.6's recogniser is a detector, and because the filed guard inherits these
as its acceptance posture.

- **Consequence bound.** Every element the recogniser parses is correct or signaled, never
  silently wrong: it is either checked against the accept-set or reported by name. A
  construct it cannot classify is reported as UNCLASSIFIED, never passed. A worst case of
  conservative-report-plus-surfaced-signal is a **DOCUMENTED LIMIT, not a finding**. The
  criterion is closable: done when every parse outcome is one of correct, or reported.
- **Threat-model fence.** The guard defends against **accidental authoring mistakes by an
  ordinary contributor** — a new button written with `size-7`, a new `<summary>` with no
  height. **Adversarial obfuscation is explicitly out of scope** and files to documented
  limits rather than motivating a wider recogniser, which would only be a bigger target.

### Meta-test inventory

- **CREATES:** none. The guard that would have gone here is filed (above).
- **EXTENDS:** none.
- **N/A, with reason:** no Supabase call boundary (`tests/auth/_metaInfraContract.test.ts`) —
  this diff touches no Supabase client call. No advisory-lock topology
  (`tests/auth/advisoryLockRpcDeadlock.test.ts`) — no `pg_advisory*` in scope. No mutation
  surface (`tests/log/_metaMutationSurfaceObservability.test.ts`) — no route handler and no
  `"use server"` action is added or modified; every change is presentational.

---

## 6. Dimensional invariants

Tailwind v4 does not default `.flex` to `align-items: stretch`, and jsdom computes no layout,
so each of these requires a real-browser `getBoundingClientRect()` assertion (§8).

| ID | Invariant | Guaranteed by |
|---|---|---|
| **DI-1** | Every repaired `<summary>` measures **height ≥ 44px** and **width ≥ 44px**. | `inline-flex w-fit min-h-tap-min items-center` |
| **DI-2** | Each repaired `<summary>` is **narrower than its container** (`w-fit` held) — it must not become a full-width invisible band. | `w-fit` on the summary |
| **DI-3** | The three step pills' boxes each measure **exactly 44×44** (±0.5px), and **adjacent boxes never overlap** (inter-box gap ≥ 0) at 320/390/768/1280. | `-m-2 … size-tap-min` on the anchor |
| **DI-4** | The **visual** pill (inner `<span>`) still measures **28×28** (±0.5px) — the repair is invisible (R6). The close button's visual is 36×36 and is covered by DI-15, not here. | inner span keeps `size-7` |
| **DI-5** | Each pill's **margin box is 28×28** — `rect.width + marginLeft + marginRight === 28` and the same vertically (±0.5px) — so the repair consumes no layout, at 320px where connectors are 0px wide and there is no slack (R7). | `-m-2` cancels the `size-tap-min` growth |
| **DI-6** | Each pill's **four edge midpoints** return that pill from `document.elementFromPoint`, never a sibling or an ancestor. | the recipe (probe P6) |
| **DI-7** | The stepper **does not overflow at 320px** — `nav.scrollWidth ≤ container.clientWidth + 0.5`. Already pinned as DI-1 of `tests/e2e/step3-review-page.layout.spec.ts`; it must still hold after the change. | existing spec, re-run |
| **DI-8** | `HelpSheet`'s trigger (`components/admin/HelpSheet.tsx:75`) measures **≥44×44**, its four edge midpoints return the trigger, and its visual pill stays 28×28. | same recipe |
| **DI-9** | Hovering a point **inside the expansion band but outside the visual pill** produces the same computed values as hovering the pill's centre, **for EVERY property the element's hover state changes** — and each of those differs from its resting value, so the comparison has discriminating power. | `group` on the anchor + `group-hover:` on the span (§2.2) |
| **DI-10** | `HelpTooltip`'s `<summary>` trigger (`components/admin/HelpTooltip.tsx:60`) measures **≥44×44**, its four edge midpoints return the trigger, and its visual pill stays 28×28. Its hover band satisfies DI-9's parity. | same recipe |
| **DI-11** | `AdminNav`'s brand link (`components/admin/nav/AdminNav.tsx:88`) measures **≥44px on both axes at 320px** (icon-only) and **≥44px tall at 360/440/1280** (wordmark states). | `min-h-tap-min -mx-2 px-2` |
| **DI-12** | `AdminNav`'s brand link's **horizontal margin box equals its border box minus the added padding** — `marginLeft === -8 && marginRight === -8 && paddingLeft === 8 && paddingRight === 8` — so its layout footprint is unchanged at 320/360/440 and the documented-tight narrow-phone width budget is untouched. The topbar row's height is unchanged, since sibling controls already set it to ≥44px. | `-mx-2` cancelling `px-2` |
| **DI-13** | **Focus-visible feedback covers the whole target, not the visual box:** with the target focused, the element carrying a non-`none` computed `outline`/`box-shadow` ring IS the 44px target, and its rect is the 44px rect (±0.5px). The inner visual span carries no ring. | ring stays on the anchor/button (§2.2) |
| **DI-14** | The focused target's computed `border-radius` **is non-zero AND equals its inner span's** — so the ring keeps the shape it has today rather than turning square. Both halves are required: equality alone is satisfied by `0px === 0px`, which is exactly the regression of dropping the radius from both elements. For the pills, trigger and tooltip the value is the pill radius (half the box or greater); for the close button it is the `rounded-sm` token. | radius on BOTH (§2.2) |
| **DI-15** | The **HelpSheet close button** measures ≥44×44 with its four edge midpoints returning it, its visual span stays **36×36** (`size-9`, not 28), and DI-9's hover parity holds for both `color` and `background-color`. Asserted with the sheet OPEN. | same recipe |

**DI-9's "every property"** is enumerated per site, not left to the test author:
`components/admin/HelpSheet.tsx:68` and `components/admin/HelpTooltip.tsx:57` change **both**
foreground and background on hover (`hover:bg-surface hover:text-text-strong`), so a test
sampling only `color` would pass on a build where `group-hover:bg-*` was dropped and
`group-hover:text-*` kept. Both `color` and `background-color` are asserted for those two.
The step pill changes `color` only (`components/admin/OnboardingWizard.tsx:157`).

**DI-13 is measured from computed style, not geometry.** `getBoundingClientRect()` cannot see
a ring — a focus ring is `outline` or `box-shadow`, neither of which affects the border box.
The assertion reads `getComputedStyle(el).outlineStyle` / `boxShadow` on both the target and
the inner span and requires the ring on the former and absent on the latter, THEN compares
the target's rect to 44px. Asserting only the rect would pass with no ring at all.

**Corner hit-testing is deliberately excluded from DI-6.** Probe P4 measured that box
*corners* are unreliable across recipes while edge midpoints are stable. Asserting corners
would make the guard flaky without adding discriminating power.

### 6.1 Transition Inventory

No transition is added, removed, or retimed by this spec. The inventory exists because the
touched components have multiple visual states and the repair relocates the classes those
states are expressed in — which is exactly where a state can silently stop transitioning.

**Disclosure (`<summary>`), 2 states → 1 pair:**

| Pair | Treatment |
|---|---|
| collapsed ↔ expanded | **Instant — no animation needed.** Native `<details>` toggling, untimed today and untimed after. Probe P2 confirms the toggle still fires under `display: inline-flex`. |

**Step pill, 4 states → 6 pairs, each with exactly ONE treatment.** The split is structural,
not stylistic: the unreached state renders a `<span>`, the other three render a `<Link>`
(`components/admin/OnboardingWizard.tsx:161-179`). Any pair crossing that boundary swaps the
element, so React remounts and no transition can run — regardless of what
`transition-colors` says. The three pairs that stay within `<Link>` do crossfade.
**No pair animates geometry.** In the three `<Link>` states the 44×44 target and its 28×28
span are both static. The unreached state has **neither** — it stays the untouched
non-interactive `<span>` carrying `base` directly at 28×28
(`components/admin/OnboardingWizard.tsx:171-178`), because it is not a pointer target and
§2.2 excludes it. An implementation that grows a 44px target there has exceeded the spec.

| Pair | Crosses the span/Link boundary? | Treatment |
|---|---|---|
| unreached ↔ visited | yes (`<span>` → `<Link>`) | **Instant — remount, no animation possible** |
| unreached ↔ done | yes | **Instant — remount** |
| unreached ↔ active | yes | **Instant — remount** |
| visited ↔ done | no (both `<Link>`) | `transition-colors duration-fast` (border, bg, text) |
| visited ↔ active | no | `transition-colors duration-fast` |
| done ↔ active | no | `transition-colors duration-fast` |

This is today's behaviour, unchanged. It is spelled out because `transition-colors` moving to
the inner span makes it tempting to assert all six crossfade, and three of them provably
cannot.

**Compound transitions** (state A changes while state B is non-default), the class the
plain pair table cannot catch:

| Compound | Treatment |
|---|---|
| Pill colour transitions **while hovered** | The colour target is the `group-hover:` value; the crossfade runs to it. Requires the §2.2 rewiring — without `group-hover:`, hover over the expansion band applies no hover colour at all and the compound never occurs where the user expects it. |
| Pill colour transitions **while focus-visible** | Ring is on the anchor and does not transition; the span's colour crossfade runs underneath it. Ring geometry must not shift when the colour changes. |
| Hover **enters over the 8px expansion band** (not the visual pill) | Must produce the identical hover colour as entering over the pill itself. This is the assertion that proves the rewiring landed — **and it only discriminates on a pill that HAS a hover colour.** Only the visited-not-done pill carries one (`group-hover:text-text-strong`, `components/admin/OnboardingWizard.tsx:157`); active and done pills have none (`components/admin/OnboardingWizard.tsx:152-156`). On the ordinary Step-3 state every pill is active or done, so band-hover and centre-hover are trivially equal even with the rewiring entirely absent. **DI-9 therefore requires a forward-visited fixture** — `step=2, maxReachedStep=3`, which makes pill 3 a visited "Go to step 3" `<Link>` — and asserts centre-hover ≠ resting before comparing band-hover to centre-hover. |
| `<summary>` toggled **while hovered** | Instant open/close; the hover underline (`hover:underline`, `components/admin/HelpAffordance.tsx:97`) persists across the toggle and must not flicker, since the element is not remounted. |

---

## 7. Probe record

Run 2026-08-07 against `origin/main` @ `61281c23e`, via a throwaway standalone Playwright
harness modelled on `tests/e2e/step3-review-page.layout.spec.ts` (real `app/globals.css`
compiled through `compileEntryCss`, markup transcribed verbatim from the components).
Viewports 320/390/768/1280. The probe was removed after measurement; its findings are
reproduced by the committed assertions in §8.

| ID | Question | Result |
|---|---|---|
| **P1** | Height of the `HelpAffordance` `<summary>` today | **288 × 20.3** @320, **358 × 20.3** @390 — reproduces DEFERRED.md:30's 20.3px and confirms the defect at the corrected anchor (R1) |
| **P2** | Does `inline-flex w-fit min-h-tap-min items-center` fix it without breaking `<details>`? | **144.8 × 44**; toggle probed `open false -> true` at all four viewports |
| **P3** | Stepper slack at mobile | Connectors measure **width 0.0** at 320 and 390 — zero horizontal slack (R7) |
| **P4** | Does `before:-inset-2` produce a working 44px target? | **NO.** Box is 44×44 but only top + left take the pointer; right → `NAV`, bottom → outer wrapper. **Recipe refuted (R2)** |
| **P5** | Does `-m-2 box-content p-2` work? | All four edges hit, but box is **46×46** and layout grows **+2px per pill** (the 1px border falls outside the content box) |
| **P6** | Does `-m-2 … size-tap-min` + inner span work? | **44×44 exactly**; all four edge midpoints → the pill; neighbours' edges → their own pill; inter-box gap **0.0** @320/390, 97.0 / 55.4 @768; **pill centres identical to today** |

---

## 8. Test plan

Every task is TDD: failing test → minimal implementation → passing test → commit.

**Real-browser (Playwright, standalone config).** jsdom computes no layout and cannot
satisfy §6. New spec **tests/e2e/tap-target-floor.layout.spec.ts** (NEW), asserting
DI-1…DI-15 across 320/390/768/1280 (DI-11/DI-12 additionally at 360 and 440, the
`AdminNav` wordmark breakpoints).

> **The harness MUST mount the REAL components. A transcribed-markup harness is
> disqualified for this spec.** The nearest precedent,
> `tests/e2e/step3-review-page.layout.spec.ts:9-18`, deliberately transcribes class strings
> into static HTML and keeps them in sync by hand. That is sound for pinning a *layout
> shape*, but it is **fatal here**: this spec's entire subject is whether particular class
> strings are present on particular elements, so a harness holding its own copy of those
> strings would pass with the corrected copy while the production components stayed
> unrepaired — the exact unfixed-build case the anti-tautology rules exist to reject.
>
> Use the **live-entry** pattern instead, which is already established in this repo for
> exactly this reason: an **_<name>LiveEntry.tsx** module imports the real component, is
> bundled out-of-process with pinned esbuild, and is served to the page — see
> `tests/e2e/_pillFocusLiveEntry.tsx:1-20` and the config's own note that
> `step3-review-modal.layout` runs "on the REAL component tree"
> (`tests/e2e/standalone.config.ts:17`). The entry imports `StepIndicator`
> (`components/admin/OnboardingWizard.tsx:117`), `HelpAffordance`, `HelpSheet`,
> `HelpTooltip`, and the `AdminNav` brand block, and exposes the props each invariant needs
> (including DI-9's `step=2, maxReachedStep=3` forward-visited state).
>
> **The entry must mount ALL SEVEN repaired disclosures, not just the two admin ones** —
> otherwise DI-1/DI-2 and AC-1 pass while five production class strings stay unrepaired,
> which is the same defect one level down. Each needs the state that makes its `<summary>`
> exist at all (§3): `HelpAffordance` with a code whose `helpfulContext` is non-null;
> `OnboardingWizard`'s operator-error panel with `helpfulContext` present; `ErrorExplainer`
> with a known code and helpful context enabled; `AdministratorsSection` with at least one
> revoked admin; `app/me`'s past-shows block with at least one past show; `RunOfShowList`
> with a title of **more than 80 characters**; `HelpTooltip` mounted directly.
>
> **Two of the seven are private and MUST be exported — the spec chooses this, rather than
> leaving the implementer three options with different blast radii.** `OperatorErrorBlock`
> (`components/admin/OnboardingWizard.tsx:547`) and `MeShowSections` (`app/me/page.tsx:192`)
> are unexported, so a live entry cannot import them today. Add `export` to each.
>
> Exporting is precedented — `components/admin/OnboardingWizard.tsx:112-114` carries
> "Exported for the unit test (onboardingWizardNav.test.tsx)" above `StepIndicator`. Add the
> same one-line comment above each new export naming this spec.
>
> **But exporting alone is NOT sufficient, and the bundle path must be named.** Both
> containing modules statically import server-side graphs (`app/me/page.tsx:42`,
> `components/admin/OnboardingWizard.tsx:26`), and those graphs reach Node builtins that a
> browser bundle cannot resolve. Measured by bundling each named export with the ordinary
> helper's settings:
>
> ```text
> MeShowSections:      FAIL  Could not resolve "node:async_hooks"  @ lib/log/requestContext.ts
> OperatorErrorBlock:  FAIL  Could not resolve "node:crypto"       @ lib/parser/useRawContentHash.ts
> ```
>
> `bundleLiveEntry` passes Node builtins as **externals**
> (`tests/e2e/helpers/liveEntryToolchain.ts:99-101`), which leaves bare `node:*` imports the
> browser cannot load. The harness that does work stubs them: `_step3ReviewModalBundle.mjs`
> installs an `emptyNodeBuiltins` resolver that maps every name in `builtinModules` (both
> `x` and `node:x` forms) to an empty CJS module
> (`tests/e2e/_step3ReviewModalBundle.mjs:50-70`). That is why the `_pillFocusLiveEntry`
> precedent bundles at all — `tests/e2e/attention-pill-focus.spec.ts:50` invokes that
> bundler, not the ordinary helper.
>
> **`AdminNav` needs a routing context or it throws.** It calls `usePathname()`
> (`components/admin/nav/AdminNav.tsx:70`); mounted bare, the harness fails with
> `Cannot read properties of null (reading 'startsWith')`. Wrap it in
> `PathnameContext.Provider value="/admin"` — the seam an existing harness already documents
> and uses (`tests/e2e/_pusherRowsHarness.tsx:17-21`, `tests/e2e/_pusherRowsHarness.tsx:58-63`).
> `"/admin"` is the right value: it is the route whose brand link DI-11/DI-12 measure. Do not
> reach for `AppRouterContext` — `usePathname` is the only router hook on this path.
>
> **This spec's live entry uses `tests/e2e/_step3ReviewModalBundle.mjs`**, which is already
> generic (it takes `<entry> <outfile> <tsconfig>` on argv and is not modal-specific). Do NOT
> add `emptyNodeBuiltins` to the shared `_bundleLiveEntryChild.mjs`: that helper backs many
> existing standalone specs, and changing its resolution semantics is a redesign of a surface
> this branch does not otherwise touch.
>
> **Rejected alternatives, so they are not re-proposed:** bundling the async
> `OnboardingWizard` / `/me` page wholesale pulls the server tree for two `<summary>`
> elements; and asserting the class string from source text would not prove the 44px result
> in a browser, which is the whole point of §6.
> The probe in §7 used a transcribed harness because it was measuring *candidate recipes*
> that did not exist in any component yet. That is the one legitimate use, and it ended
> when the recipe was chosen.

> **Wiring, not optional:** `tests/e2e/standalone.config.ts:86` `testMatch` is an explicit
> allow-list — "a new standalone spec is NOT discovered until its name is added here. A spec
> file that merely exists runs nowhere and silently proves nothing." The new spec's stem is
> added to that regex in the same commit.

**Unit (vitest + jsdom)** — for contracts that are structural, not dimensional:
- The diagram `<img>` renders `alt=""` while the anchor `aria-label` keeps the fallback and
  the new-tab suffix (§2.4), including the empty-alt and whitespace-only-alt cases.
- `BellPanel` renders no `↗` on **both** branches that render the link — the health entry,
  and the non-health entry that is the watch code **with `viewerIsDeveloper` true** (§2.5,
  §3). **Premise:** each fixture asserts the telemetry link is present before asserting the
  glyph is absent. Without it the non-health case renders no link at all and passes on an
  unrepaired build.
- The Step-3 page renders `h1` then only `h2`s — asserted by **collecting the rendered
  heading tags in document order** and checking the level sequence never skips, not by
  asserting one tag name.

**Anti-tautology requirements, per test:**
- The heading test must **derive** the sequence from the DOM in document order and assert no
  level gap. Asserting `h2` exists would pass on a page that also still skips to `h4`.
- The tap-target tests must assert against **each element's own** `getBoundingClientRect`,
  not a container that also contains compliant siblings. DI-4 (visual still 28) and DI-3
  (target now 44) must be asserted on **different elements** — anchor vs inner span — or the
  pair is self-satisfying.
- **DI-5 and DI-7 are PRESERVATION invariants, not discriminating ones — and they are the
  only two.** Both pass on an unfixed build, deliberately: DI-5's formula evaluates to
  `28 + 0 + 0 = 28` today, because the pill is `size-7` with no margin utility
  (`components/admin/OnboardingWizard.tsx:126-129`, applied at
  `components/admin/OnboardingWizard.tsx:167`), and DI-7 is the pre-existing no-overflow
  assertion at `tests/e2e/step3-review-page.layout.spec.ts:203-216`. That is the point: they
  pin that the repair did **not** change layout, so a version that failed before the change
  would be asserting the wrong thing. Do not "strengthen" them into discriminating form.
  Every other invariant, DI-1 through DI-4 and DI-6 through DI-15, must fail on an unfixed
  build.
- **DI-5 and DI-12 take NO baseline.** An earlier draft asked for a pre-change variant
  rendered alongside the repaired one; that is incompatible with the real-components rule
  above, because production exposes only the repaired component and a hand-written "before"
  variant is exactly the transcribed markup this spec disqualifies. Both are therefore
  **margin-box invariants** computed from the repaired element alone: DI-5 asserts
  `rect.width + marginLeft + marginRight === 28`, DI-12 asserts the padding and negative
  margin cancel. Neither needs a baseline and neither hardcodes a centre, so neither rots at
  the next type change.
- DI-9 must sample a point **provably outside the visual pill** — derived from the span's
  measured rect, not a hardcoded offset — and compare the computed colour against the
  pill-centre hover. Comparing the band's hover colour to the *resting* colour would pass on
  a build where hover is broken everywhere.
- **Premise (`tests/_shared/premise.ts`), one per vacuity mode — not only the two obvious
  ones.** Each is stated executably, immediately above the assertion it guards, and
  **unconditionally relative to that assertion** — never inside a `.each` callback, whose
  case count can be zero.

  | Assertion | Vacuous when | Premise |
  |---|---|---|
  | DI-1, DI-2 | The conditional disclosure never rendered, so there is no `<summary>` to measure and a "no element is under 44px" phrasing passes trivially | The rendered `<summary>` count **equals 7**, the number of repaired disclosures mounted — not merely "> 0", which one rendered fixture satisfies |
  | Heading no-skip | Both promoted sections are conditional (`components/admin/wizard/Step3Review.tsx:745`, `components/admin/wizard/Step3Review.tsx:1397`); with neither rendered the page is just an `h1`, and "no level is skipped" is trivially true | **Both** promoted `h2`s are present in the fixture, asserted before the sequence check |
  | DI-3 | Fewer than two pills render, so "no two overlap" is trivially true | Exactly three pill targets are present |
  | DI-7 | The viewport is not actually 320px | Measured `window.innerWidth === 320` |
  | DI-9 | The sampled pill has no hover colour (active/done), so band-hover == centre-hover with the rewiring absent | Centre-hover colour ≠ resting colour on the sampled pill |
  | DI-11, DI-12 | The wordmark state under test did not apply | The "FXAV" span's measured visibility matches the viewport's expected breakpoint state |
  | DI-13 | No element has focus, so the ring rect is empty | `document.activeElement` is the target under test |

---

## 9. Out of scope

- **No visual redesign.** DEFERRED.md:54-57 records `STEP3-GALLERY-TAP-TARGETS-1(d)` — three
  affordance vocabularies in one row slot, and nested card chrome — as design-consistency
  findings whose un-defer trigger is "the next deliberate visual pass on the Step-3 row,
  where they should be resolved together rather than piecemeal." This is an accessibility
  repair, not that pass. **(d) stays deferred**, and `STEP3-GALLERY-TAP-TARGETS-1` is
  therefore NOT archived by this branch — items (a), (b), (c) are struck and (d) remains.
- **The `sr-only` checkbox pattern is correct and unchanged.** DEFERRED.md:59-65 records the
  three `INPUT.peer.sr-only` checkboxes measuring 1×1 inside `<label>` wrappers of 44.0×44.0
  and 87.4×44.0 as **verified NOT findings**. Do not "fix" them.
- **The eight `broken-image` detector hits are false positives** (DEFERRED.md:61-65): raw
  `<img>` with a required runtime `src` and an `onError` placeholder, a documented deliberate
  revert from `next/image`. Unchanged.
- **`NEWTAB-A11Y-RESIDUE-1` IS fully closed** by §2.4 + §2.5 and is archived by this branch.

### 9.1 Filed, each with its class-sweep exception named

Per the disposition rule, "same defect, different file" is never a sufficient reason. Each
entry below names exception (a), (b), or (c), and carries the probe evidence from §2.6.

**`BL-TAP-TARGET-INLINE-TEXT-CONTROLS` — exception (a), needs a product decision.** The eight
bucket-(A) sites this branch does not repair (§2.6) are all inline text links or text buttons
sitting inside sentences: "Refresh" in a banner (`RevokeRowButton.tsx:283`), "Change"
(`RoleRecognizeControl.tsx:268`), "Start fresh" (`ReportModal.tsx:526`), a "show more" toggle
(`step3ReviewSections.tsx:2585`), a sheet-title deep link (`Step3SheetCard.tsx:149`), `tel:`
and `mailto:` links (`step3ReviewSections.tsx:1405`, `step3ReviewSections.tsx:1414`), and a dev-page debug button
(`app/admin/dev/page.tsx:334`). `PRODUCT.md:59` grants an explicit WCAG 2.5.5 exception to
"links rendered inline within prose body text", and whether each of these is inline prose or
chrome is a **per-site product judgment**, not a mechanical class edit — several sit in
sentence flow where a 44px box would visibly break the line. That judgment is the deferred
work; the first scheduled step is to make it, per site, then repair whatever it classifies as
chrome. **Reachability: PROBED** — every site and its computed height is in §2.6.

**`BL-TAP-TARGET-STRUCTURAL-GUARD` — exception (c), spans surfaces this PR does not touch.**
The repo-wide guard, descoped per §5. Evidence: the §2.6 procedure and its 340 / 139 / 94
counts. The blocker is not the recogniser but the **94 non-literal classNames**, which a
bound-honouring guard must report as UNCLASSIFIED. The first scheduled step is therefore the
policy decision — resolve named class constants, require literal classNames on interactive
elements, or accept a standing UNCLASSIFIED census — because the recogniser cannot be
finished before it. **Reachability: PROBED.**

---

## 10. Acceptance criteria

- **AC-1** **All seven** sites in §2.1 render a `<summary>` measuring ≥44px on both axes,
  each narrower than its container, each mounted in the state that makes it exist (DI-1,
  DI-2, §3).
- **AC-2** **All seven** targets in §2.2 — the three step pills, both `HelpSheet` buttons,
  `HelpTooltip`, and the `AdminNav` brand link — expose a ≥44×44 target whose four edge
  midpoints hit it, with **each control's OWN painted box preserved at its existing size**
  (28px for the pills, trigger and tooltip; **36px for the HelpSheet close button**) and its
  existing corner radius, and with no overlap between adjacent targets (DI-3, DI-4, DI-6,
  DI-8, DI-10, DI-11, DI-14, DI-15).
- **AC-2b** Hover feedback covers the **whole** 44px target, not just the painted box (DI-9,
  DI-10, DI-15), and focus feedback outlines the target rather than the visual (DI-13) — the
  expansion band is never tappable-but-visually-dead.
- **AC-2c** `AdminNav`'s brand-link repair consumes no horizontal budget at 320px, asserted
  as the margin/padding cancellation in DI-12. The topbar row height is **not** separately
  asserted: sibling controls already fix it at ≥44px, so the brand link cannot raise it, and
  an assertion there would pin a value this change does not influence.
- **AC-3** Stepper layout is unchanged: each pill's **margin box is still 28×28**, so it
  consumes exactly the layout it did before, and the stepper does not overflow at 320px
  (DI-5, DI-7). Stated as a margin-box invariant rather than "centres identical" because no
  pre-change baseline is available to compare centres against (§8).
- **AC-3b** Every real-browser assertion runs against the **real components** via a
  live-entry harness, not transcribed markup (§8) — so no *discriminating* invariant can pass
  on a build where the production repair was not applied. **DI-5 and DI-7 are exempt by
  design and are the complete set of exemptions**: they are layout-PRESERVATION invariants,
  so passing before the change is what they mean (§8).
- **AC-4** The Step-3 page's heading sequence skips no level, asserted from document order.
- **AC-5** The diagram tile exposes exactly one accessible name; a blank `alt` still yields a
  named link.
- **AC-6** No internal link renders `↗`.
- **AC-7** Both ledger entries in §9.1 are filed with their exception named and the §2.6
  evidence attached. **No structural guard ships in this branch** (§5); an implementation
  that adds one has exceeded the spec.
- **AC-8** `/impeccable critique` and `/impeccable audit` pass on the diff; P0/P1 findings
  fixed or deferred with a `DEFERRED.md` entry (invariant 8).

---

## 11. Pre-code mechanical UI checklist

Run before implementation, not after — the impeccable dual gate is a verifier, not a
discovery mechanism.

- [ ] **Em-dash ban** in user-visible copy. §2.5 removes a glyph; it adds no copy. Any new
      string uses a hyphen or restructures.
- [ ] **Apostrophes** are the literal `'` in JSX text, per existing convention.
- [ ] **44px tap targets** — the subject of this spec; `min-h-tap-min` / `size-tap-min`.
- [ ] **Canonical type/token classes** — `text-xs/relaxed`, `text-subtle`. §2.3 changes tag
      names only; every type class is carried over verbatim.
- [ ] **No new color token** is introduced, so no `DESIGN.md` contrast pin is required.
