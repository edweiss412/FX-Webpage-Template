# Step-3 a11y cluster — sub-44px targets and a skipped heading level

**Date:** 2026-08-07
**Branch:** `fix/step3-a11y-cluster`
**Ledger entries closed:** `STEP3-GALLERY-TAP-TARGETS-1` (DEFERRED.md:11), `NEWTAB-A11Y-RESIDUE-1` (DEFERRED.md:67)
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
| R3 | **`step3ReviewSections.tsx` is NOT modified for the heading fix.** Its `Heading = sub ? "h4" : "h3"` (`components/admin/wizard/step3ReviewSections.tsx:897`) is consumed by five surfaces (`Step3ReviewModal.tsx:54`, `Step3SheetCard.tsx:55`, `ShowReviewSurface.tsx:56`, `PublishedReviewModal.tsx:79`, `sectionFreshness.ts:88`). Promoting the two page-level `h3`s in `Step3Review.tsx` to `h2` makes the page outline monotonic without touching the shared component. §2.3. | §2.3 |
| R4 | **The tap-target repair covers every instance of the shape repo-wide, not only the four the ledger names.** Class sweep (§2.1, §2.2) found 7 failing `<summary>` elements and 4 failing small interactive targets. Per the AGENTS.md class-sweep disposition rule the default is repair-all-in-branch; none of exceptions (a)/(b)/(c) applies, since every repair is the same mechanical class change. **No tap-target peers are deferred.** | AGENTS.md "Class-sweep before patching adversarial findings" |
| R5 | **`NEWTAB-A11Y-RESIDUE-1(a)` reverses a previously accepted audit fix, deliberately.** `tests/components/admin/wizard/step3ReviewSections.test.tsx:906-917` currently pins that a blank `alt` falls back for BOTH the `<img alt>` and the anchor `aria-label`. The anchor's `aria-label` (`step3ReviewSections.tsx:3706`) now solves the nameless-link risk permanently, so the belt-and-braces `alt` is redundant and produces a double-name. That test is UPDATED, not deleted; §2.4 states the replacement contract. | DEFERRED.md:75-86 |
| R6 | **The `size-7` visual dimension is preserved everywhere.** This is an accessibility repair, not a visual redesign. Every pill, trigger, and glyph keeps its 28px painted box; only the hit box grows. Any finding that the UI "looks different" is a defect in the implementation, not an intended change. | §2.2, §6 DI-4 |
| R7 | **Layout geometry is preserved exactly.** The adopted recipe's negative margin cancels the growth, so pill centres are unchanged (probe P6: expanded-row pill centres identical to today's at 320px). This is required, not incidental: connectors measure **0px wide at 320 and 390** (probe P3), so the stepper has zero horizontal slack and any layout growth would overflow. | §7 probe P3/P6, §6 DI-3 |
| R8 | **`components/admin/nav/AdminNav.tsx:99` is in scope even though it does not render on the wizard route.** `app/admin/layout.tsx:169` renders `OnboardingTopBar` on the onboarding branch and `AdminNav` at `app/admin/layout.tsx:204` on every other `/admin/*` route. It is repaired here under R4 (same shape), not because the wizard shows it. | §2.2 |

---

## 2. What changes

### 2.1 Class A — `<summary>` elements below the floor

`text-sm` resolves to 14px/1.45 → **20.3px** line box; `text-xs` to 12px/1.4 → 16.8px. Probe
P1 measured the canonical instance at **20.3 × 288** (320px) and **20.3 × 358** (390px),
reproducing DEFERRED.md:30's "274.0x20.3" to the pixel on the vertical axis.

| Site | Today | Measured / computed height | Route |
|---|---|---|---|
| `components/admin/HelpAffordance.tsx:95` **(the ledger's P1)** | `cursor-pointer list-none underline-offset-2 hover:underline focus-visible:*` | 20.3px (probe P1) | `/admin?step=2`, `/admin?step=3`, ~17 admin action surfaces |
| `components/admin/OnboardingWizard.tsx:561` | `cursor-pointer font-medium` | 20.3px | `/admin` wizard error state |
| `components/messages/ErrorExplainer.tsx:114` | `cursor-pointer list-none` | 20.3px | `/auth/sign-in`, admin error toasts |
| `components/admin/HelpTooltip.tsx:57` | `inline-flex size-7 …` | 28px (also Class B) | `/admin` show detail, `/admin/settings` |
| `components/admin/settings/AdministratorsSection.tsx:131` | `cursor-pointer p-3 text-xs font-semibold …` | 16.8 + 12 + 12 = **40.8px** | `/admin/settings/admins` |
| `app/me/page.tsx:239` | `cursor-pointer list-none text-xs font-semibold uppercase …` | 16.8px | `/me` |
| `components/crew/primitives/RunOfShowList.tsx:82` | `cursor-pointer list-none text-sm font-medium …` | 20.3px | crew show page |

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
| `components/admin/HelpSheet.tsx:75` **(the ledger's P2)** | `<button>` | `inline-flex size-7 …` 28×28 | Same recipe |
| `components/admin/HelpTooltip.tsx:60` | `<summary>` | `inline-flex size-7 …` 28×28 | Same recipe (also Class A) |
| `components/admin/nav/AdminNav.tsx:99` parent `<Link href="/admin">` | `<Link>` | ~28px box | Same recipe |

**Recipe, empirically selected (probe P4/P5/P6):**

```
target (a / button / summary):  -m-2 flex size-tap-min shrink-0 items-center justify-center
inner <span> (new):             <today's `base` string, verbatim, unchanged>
```

`size-tap-min` resolves through Tailwind v4's `--spacing-*` namespace from
`--spacing-tap-min: 44px` (`app/globals.css:179`) and is already used elsewhere in the repo.

**Hover and focus MUST be rewired to the anchor — this is not optional polish.** Moving the
visual classes to an inner `<span>` moves their `hover:` and `focus-visible:` variants too,
and those variants would then fire only when the pointer is over the **28px span**, not over
the 44px anchor. The 8px expansion band would be tappable but visually dead — a target that
responds to a tap it gave no feedback for, which is worse than the small target it replaced.

- The anchor carries `group` and keeps the existing focus ring
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
`step3ReviewSections.tsx:897` renders inside the review modal and the show-review surface,
each of which opens its own outline context below a dialog heading — not directly under this
page's `h1`. Promoting the page's two `h3`s is sufficient and leaves all five consumers of
the shared component byte-identical. The in-repo precedent for the alternative (threading a
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
- **Test contract replacement (R5):** `tests/components/admin/wizard/step3ReviewSections.test.tsx:906-917`
  currently asserts the fallback reaches BOTH the img alt and the anchor label. Its
  load-bearing half — *"a persisted empty alt must never yield a nameless link"* — is
  preserved and must still pass: the anchor's `aria-label` is still asserted non-empty and
  still carries the fallback + new-tab suffix. Only the `img alt` assertion changes, from
  `toBe(fallback)` to `toBe("")`. The test name is updated to say why.

### 2.5 `NEWTAB-A11Y-RESIDUE-1(b)` — an internal link wears the external glyph

`components/admin/BellPanel.tsx:324-329` renders `View in telemetry <span aria-hidden="true">↗</span>`
for `/admin/dev/telemetry#health` and `/admin/dev/telemetry`, both internal routes. After the
new-tab sweep, `↗` means "opens a new tab" everywhere else in the codebase, so this is the
only one that lies.

- **Change:** drop the `↗` glyph span. The link keeps its text and destination.
- It carries no `target`, so the new-tab structural guard never saw it (DEFERRED.md:91-92).

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
| `BellPanel` entry `isHealth` true/false | Href differs (`components/admin/BellPanel.tsx:324`) | Glyph removed on both branches. |

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
4. **The guard in §5 checks classes, not rendered pixels.** A site can satisfy the class
   contract and still be under 44px if an ancestor clips or transforms it. The real-browser
   assertions in §6 are what close that gap, and they cover the wizard surfaces only; other
   routes rest on the class contract alone.

---

## 5. Structural defense

Per the structural-defense calibration rule, the class is nameable now, so the guard ships in
this branch rather than after a recurrence.

**New meta-test:** **tests/styles/_metaTapTargetFloor.test.ts** (NEW)

- **Discovery is filesystem-walked** over `app/**` and `components/**`, so a NEW file is
  covered by default rather than silently exempt.
- **Accept-set, keyed on structure not spelling:** an element is IN SCOPE when it is an
  interactive tag (`<button>`, `<a>`, `<Link>`, `<summary>`, `<input type=checkbox|radio>`)
  or carries `role="button"`/`onClick`. An in-scope element SATISFIES the contract when it
  carries any of `min-h-tap-min`, `size-tap-min`, `min-w-tap-min`, a negative-margin
  expansion pair (`-m*-N` with matching `p*-N` or `size-tap-min`), or a
  `before:absolute` + negative-inset run. Everything outside the accept-set is **reported by
  name**, never skipped silently.
- **Exemption:** an inline `// tap-target-exempt: <reason>` comment on the line above, or a
  row in a small registry for the inline-prose-link exception (`PRODUCT.md:59`). A file with
  neither fails.
- **Vacuity gate:** the test asserts it found more than 50 in-scope elements, so a discovery
  regression that silently matches nothing fails loudly rather than passing green.

### Consequence bound and threat-model fence

Stated here because §5's guard is a detector and the review of it converges against these,
not against an enumeration of inputs.

- **Consequence bound.** Every element the walker parses is either checked against the accept
  set or **reported by name**; nothing is silently passed. A construct the parser cannot
  classify (a computed className, a `cn()` call it cannot resolve) is reported as
  `UNCLASSIFIED` and fails the test until a human either fixes it or exempts it by name.
  Conservative-report-plus-visible-signal is a **documented limit, not a finding**.
- **Threat-model fence.** The guard defends against **accidental authoring mistakes by an
  ordinary contributor** — a new button written with `size-7`, a new `<summary>` with no
  height. **Adversarial obfuscation is explicitly out of scope**: a contributor determined to
  hide a small target from a regex can, and that files to documented limits rather than
  motivating a wider recognizer. A wider recognizer is a bigger target for the next round.

### Meta-test inventory

- **CREATES:** **tests/styles/_metaTapTargetFloor.test.ts** (NEW) (above).
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
| **DI-4** | The **visual** pill (inner `<span>`) still measures **28×28** (±0.5px) — the repair is invisible (R6). | inner span keeps `size-7` |
| **DI-5** | Pill **centres are unchanged** from the pre-change layout at 320px, where connectors are 0px wide and there is no slack (R7). | `-m-2` cancels the padding growth |
| **DI-6** | Each pill's **four edge midpoints** return that pill from `document.elementFromPoint`, never a sibling or an ancestor. | the recipe (probe P6) |
| **DI-7** | The stepper **does not overflow at 320px** — `nav.scrollWidth ≤ container.clientWidth + 0.5`. Already pinned as DI-1 of `tests/e2e/step3-review-page.layout.spec.ts`; it must still hold after the change. | existing spec, re-run |
| **DI-8** | `HelpSheet`'s trigger measures **≥44×44** while its visual pill stays 28×28. | same recipe |
| **DI-9** | Hovering a point **inside the expansion band but outside the visual pill** produces the same computed colour as hovering the pill's centre. | `group` on the anchor + `group-hover:` on the span (§2.2) |

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

**Step pill, 4 states → 6 pairs.** All six are colour-only crossfades via the existing
`transition-colors duration-fast` (`components/admin/OnboardingWizard.tsx:127`), which moves
to the inner span with the rest of the visual string. **No pair animates geometry** — the
44×44 anchor and the 28×28 span are both static in every state.

| Pair | Treatment |
|---|---|
| unreached ↔ visited | `transition-colors duration-fast` (border, bg, text) |
| unreached ↔ done | `transition-colors duration-fast` |
| unreached ↔ active | `transition-colors duration-fast` |
| visited ↔ done | `transition-colors duration-fast` |
| visited ↔ active | `transition-colors duration-fast` |
| done ↔ active | `transition-colors duration-fast` |

Note that unreached is a `<span>` and the other three are `<Link>`
(`components/admin/OnboardingWizard.tsx:161-179`), so any pair crossing that boundary is a
remount, not a transition — the colour change is instant there regardless of the class. That
is today's behaviour and is unchanged.

**Compound transitions** (state A changes while state B is non-default), the class the
plain pair table cannot catch:

| Compound | Treatment |
|---|---|
| Pill colour transitions **while hovered** | The colour target is the `group-hover:` value; the crossfade runs to it. Requires the §2.2 rewiring — without `group-hover:`, hover over the expansion band applies no hover colour at all and the compound never occurs where the user expects it. |
| Pill colour transitions **while focus-visible** | Ring is on the anchor and does not transition; the span's colour crossfade runs underneath it. Ring geometry must not shift when the colour changes. |
| Hover **enters over the 8px expansion band** (not the visual pill) | Must produce the identical hover colour as entering over the pill itself. This is the assertion that proves the rewiring landed. |
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
| **P1** | Height of the `HelpAffordance` `<summary>` today | **20.3 × 288** @320, **20.3 × 358** @390 — reproduces DEFERRED.md:30's 20.3px and confirms the defect at the corrected anchor (R1) |
| **P2** | Does `inline-flex w-fit min-h-tap-min items-center` fix it without breaking `<details>`? | **144.8 × 44**; toggle probed `open false -> true` at all four viewports |
| **P3** | Stepper slack at mobile | Connectors measure **width 0.0** at 320 and 390 — zero horizontal slack (R7) |
| **P4** | Does `before:-inset-2` produce a working 44px target? | **NO.** Box is 44×44 but only top + left take the pointer; right → `NAV`, bottom → outer wrapper. **Recipe refuted (R2)** |
| **P5** | Does `-m-2 box-content p-2` work? | All four edges hit, but box is **46×46** and layout grows **+2px per pill** (the 1px border falls outside the content box) |
| **P6** | Does `-m-2 … size-tap-min` + inner span work? | **44×44 exactly**; all four edge midpoints → the pill; neighbours' edges → their own pill; inter-box gap **0.0** @320/390, 97.0 / 55.4 @768; **pill centres identical to today** |

---

## 8. Test plan

Every task is TDD: failing test → minimal implementation → passing test → commit.

**Real-browser (Playwright, standalone config).** jsdom computes no layout and cannot
satisfy §6. New spec **tests/e2e/tap-target-floor.layout.spec.ts** (NEW), asserting DI-1…DI-8 across
320/390/768/1280.

> **Wiring, not optional:** `tests/e2e/standalone.config.ts:86` `testMatch` is an explicit
> allow-list — "a new standalone spec is NOT discovered until its name is added here. A spec
> file that merely exists runs nowhere and silently proves nothing." The new spec's stem is
> added to that regex in the same commit.

**Unit (vitest + jsdom)** — for contracts that are structural, not dimensional:
- The diagram `<img>` renders `alt=""` while the anchor `aria-label` keeps the fallback and
  the new-tab suffix (§2.4), including the empty-alt and whitespace-only-alt cases.
- `BellPanel` renders no `↗` on either the health and non-health branch (§2.5).
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
- DI-5 requires a **pre-change baseline** captured in the same spec run (both variants
  rendered on one page, as the probe did), never a hardcoded pixel constant. A hardcoded
  centre would encode today's font metrics and rot at the next type change.
- DI-9 must sample a point **provably outside the visual pill** — derived from the span's
  measured rect, not a hardcoded offset — and compare the computed colour against the
  pill-centre hover. Comparing the band's hover colour to the *resting* colour would pass on
  a build where hover is broken everywhere.
- **Premise (`tests/_shared/premise.ts`):** DI-3's non-overlap assertion is vacuous if fewer
  than two pills render, and DI-7 is vacuous if the viewport is not actually 320px. Each
  states its premise executably, immediately above the assertion, and **unconditionally
  relative to what it guards** — never inside a `.each` callback whose case count could be
  zero.

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

---

## 10. Acceptance criteria

- **AC-1** Every site in §2.1 renders a `<summary>` measuring ≥44px on both axes, and each
  remains narrower than its container (DI-1, DI-2).
- **AC-2** Every site in §2.2 exposes a ≥44×44 target whose four edge midpoints hit it, with
  the 28px visual preserved and no overlap between adjacent targets (DI-3, DI-4, DI-6, DI-8).
- **AC-2b** Hover and focus feedback covers the **whole** 44px target, not just the 28px
  visual (DI-9) — the expansion band is never tappable-but-visually-dead.
- **AC-3** Stepper layout is unchanged: pill centres identical, no 320px overflow (DI-5, DI-7).
- **AC-4** The Step-3 page's heading sequence skips no level, asserted from document order.
- **AC-5** The diagram tile exposes exactly one accessible name; a blank `alt` still yields a
  named link.
- **AC-6** No internal link renders `↗`.
- **AC-7** **tests/styles/_metaTapTargetFloor.test.ts** (NEW) passes, reports >50 in-scope elements,
  and fails when a `size-7` interactive element is added without an exemption.
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
