# /help/tour — lift the card grids out of the reading measure, and make the page's completeness claim true

**Branch:** `fix/help-tour-grid-and-settings-card` · **Date:** 2026-08-29 · **Effort:** M
**Closes:** `DEFERRED.md` HELPTOUR-CARD-GRID-MEASURE-1 and HELPTOUR-SETTINGS-CARD-MISSING-1

Two impeccable P1 findings from the invariant-8 dual gate on PR #778, deferred there under
class-sweep exception (b) because that arc's spec fenced copy and layout changes out of scope.
Both are pre-existing on `origin/main` and neither has moved since.

---

## 1. What is wrong

### 1.1 The card grids divide a reading measure

`app/help/layout.tsx` wraps every `/help/*` page's children in a single `help-prose` div, and
`app/globals.css` caps that wrapper at `max-width: 70ch`. The tour page then puts two card grids
inside it: a `md:grid-cols-2` grid and a `md:grid-cols-3` grid. A three-column grid inside a
70ch column gives each card roughly a third of a reading measure, so the card body text renders
at a measure far below the 65-75ch floor `DESIGN.md` §2.5 sets, and the cards grow very tall to
compensate.

The cap binds before the viewport does, so the problem does not improve on a wider screen.
Mobile is a single column and is unaffected.

### 1.2 The page claims to cover every admin screen and covers seven of eight

The tour's intro paragraph says the page lists every admin screen. It renders seven cards.
`app/help/_nav.ts` declares eight entries in the `admin-surface` group; `/help/admin/settings`
("Settings") has no card. The claim is false by one, on the one page whose whole job is to be
exhaustive.

**Why no guard caught it.** `tests/help/page-tour.test.tsx` asserts the tour links to each of a
hardcoded seven-URL list. The list enumerates exactly the cards that exist, so it passes while
the eighth surface is missing. This is not a new failure shape on this page's neighbourhood:
`tests/e2e/help-pages.spec.ts` carried the same defect, its comment records that the earlier
guard pinned a literal count, that `/help/admin/settings` had already been added to `NAV`, and
that it was silently uncovered. It was repaired there by asserting set equality against `NAV`.
The repair landed on one file and the class was never swept. This spec sweeps it.

---

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| **Add a Settings card** rather than soften the intro copy. The "Once per environment" group becomes a two-card group and the page's rhythm changes. Accepted. | Eric, relayed by bl-orch 2026-08-29. The `DEFERRED.md` HELPTOUR-SETTINGS-CARD-MISSING-1 entry names this as the product decision the fix required, and it has now been made. |
| **Lift both grids out of the cap** rather than the cheap alternative of dropping the second grid to `md:grid-cols-2`. | `DEFERRED.md` HELPTOUR-CARD-GRID-MEASURE-1, "Un-defer trigger": "The second is the better answer and the larger change." The arc file names it as the repair to ship. |
| **The cap moves to the direct children of `.help-prose`, carried by an `@property`-registered length.** The registration is not decoration: `ch` is font-relative, so a plain per-child `max-width: 70ch` resolves in each child's own font and the headings escape the column. | §2.1 measured exactly that, and §3.1 is the mechanism that survives it. |
| **Container units (`100cqi` against `main`) were considered and rejected**, although they are the least invasive option on paper and passed the same probe. `container-type: inline-size` applies `contain: layout`, which makes `main` a containing block for absolutely positioned descendants, and `app/help/errors/page.tsx` renders a `focus:absolute` skip link inside it. Adopting them would move that skip link's focused position from the page corner into `main`, which is a WCAG 2.4.1 regression traded for a CSS convenience. | §2.1. Recorded so the cheaper-looking option is not proposed again without its cost. |
| **`@property` is not a new primitive here.** Tailwind 4.2.4 emits `@property` itself, so the generated stylesheet already carries these registrations and the project already assumes browsers that honour them. | Verified against the installed `tailwindcss` build, §2.1. |
| **Two existing guards are retargeted, not weakened** — `tests/e2e/help-typography.spec.ts`'s measure assertion moves from the wrapper to a paragraph, and `tests/help/help-prose-layer.test.ts`'s `max-width: <n>ch` pattern moves to whatever declaration then carries the measure. Neither is weakened to accommodate the change: the wrapper stops being the element that carries the measure, and a paragraph is what the contract was always about, so the retargeted assertion is the stronger of the two because it measures rendered text rather than a container. Both still fail if the measure disappears. | §3.4. Flagged explicitly because "the diff changed a test" is a predictable finding and the reasoning belongs in the record, not in a review round. |
| **Uncapping tables, screenshots and the custom prose components is out of scope.** The only elements that take `help-bleed` are the tour's three card grids: the two that exist (§3.2) and the one §3.3 creates. | §6 Documented limits. |
| Both findings are pre-existing on `origin/main`, not regressions introduced by any recent arc. | `DEFERRED.md`, both entries, "Why deferred rather than repaired in-branch". |

---

## 2. Probe

Numbers in this section are measured, never argued. Per the probe-before-argue rule, no design
decision below rests on a predicted measurement. §2.1 is complete; §2.2 is pending the fleet's DB
quiet period.

### 2.1 Which cap mechanism actually preserves the page (complete)

This is a pure CSS box question, so it needs no app, no server, no auth and no database: a
headless Chromium over a static document that reproduces the cascade — Tailwind's preflight reset,
an `@layer base` block, a 900px `main`, and one child of every kind that really occurs. Baseline is
today's rule. A candidate passes only if **every** existing child keeps its exact x and width and
the bleed child reaches the full container.

**The child kinds are enumerated, not guessed.** Rendering all fourteen pages through the real MDX
pipeline under an `MDXProvider` and collecting the top-level nodes gives twelve distinct kinds:
`h1`, `h2`, `h3`, `p`, `ul`, `table`, `aside` (Callout), `figure` (Screenshot, on four pages),
`nav`, a `flex` block (Step, on fourteen pages between its two spacings), an inline `span.sr-only`,
and the `focus:absolute` skip link on the errors page. The probe carries one of each.

| candidate | existing children that moved | grid width | card width | verdict |
| --- | --- | --- | --- | --- |
| today (`.help-prose { max-width: 70ch }`) | baseline | 705.47 | 224.48 | baseline |
| per-child `max-width: 70ch` | **h1, h2 and h3, 705.47 to 900** | 900 | 289.33 | **fails** |
| per-child cap via an `@property`-registered length | **none, across all twelve kinds** | 900 | 289.33 | **passes** |
| wrapper untouched, bleed at `width: 100cqi` | none | 900 | 289.33 | passes, then rejected |

Two of the twelve are worth naming. The inline `span` is unaffected because `max-width` does not
apply to a non-replaced inline element. The skip link keeps its exact position and width (16 /
109.8), because it is an absolutely positioned element whose width is content-driven and far under
the measure — which is the same element that rules out container units, for a different reason.

**The probe needed its own correction, so it is recorded rather than quietly fixed.** An earlier
run omitted Tailwind's preflight and reported `figure` moving from 625.47 to 705.47. That was the
user agent's 40px inline margin on `figure`, not anything the cap did: Tailwind's shipped preflight
stylesheet zeroes `margin` on the universal selector, so no such margin exists in this app. With the reset in place the figure does not move. A probe whose output feeds a spec is itself
a spec input, and this one was wrong until its cascade matched the real one.

**The first candidate was this spec's original draft, and the probe refuted it.** `ch` is the
advance of the "0" glyph in the element's OWN font, so a per-child `70ch` is a different pixel
width per child: at `--text-2xl` it is far wider than the column, so every heading level would
have run full width on all fourteen help pages. Registering the property with `syntax: "<length>"`
makes `70ch` compute once, in the wrapper's font context, and inherit as an absolute length.

The fourth candidate passed the geometry test and was still rejected, on a cost the geometry
cannot show: `container-type: inline-size` applies `contain: layout`, which makes `main` a
containing block for absolutely positioned descendants, and `app/help/errors/page.tsx` renders a
`focus:absolute` skip link inside `main`. Its focused position would move from the page corner
into the content column. A keyboard affordance is not worth a shorter diff.

`@property` needs no support argument: `tailwindcss` 4.2.4 emits it, so every build of this app
already ships registrations of this kind.

### 2.2 The live measure — **Status: PENDING.** The probe spec is written as a throwaway under `tests/e2e/` (deleted before
the first commit, so it is deliberately not a tracked path this spec can cite) and is parked: it needs `signInAs`, which writes an `auth.users` row, and the help layout runs
`requireAdmin()` per request, so it is DB-backed and a fleet-wide DB quiet period is in effect.
**This section is filled before any review dispatch; a review must not be dispatched against a
spec with an empty probe table.**

Probe command, recorded so it is reproducible and so the port hazard is not rediscovered:

```
BASELINE_SERVER_ONLY=1 E2E_PORT=3417 \
  TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  pnpm heavy pnpm exec playwright test --project desktop-chromium help-grid-probe
```

`E2E_PORT` is not optional, and port 3004 is not usable: the `help-docs` project family hardcodes
its base URL on port 3004 with `reuseExistingServer: !CI`, and a sibling arc held that port while
this spec was drafted. A run there would have measured another branch's build and reported it as
this one — the exact failure `tests/e2e/help-pages.spec.ts` records for port 3000.

| viewport | grid | card width | body width | measure (ch) | card height |
| --- | --- | --- | --- | --- | --- |
| _pending_ | | | | | |

The 2026-08-11 measurements in the `DEFERRED.md` entry (10.5ch at 768px, 14.9ch at 900px, 18.2ch
at 1024px and above, on the three-column grid) are the prior reading. They are quoted as history,
not as this spec's evidence, and the fresh probe either confirms them or this spec is redrafted
around what it actually finds.

---

## 3. The change

### 3.1 Move the measure cap from the wrapper to its direct children

`app/globals.css`, the `.help-prose` ruleset in `@layer base`:

```css
/* was */
.help-prose { max-width: 70ch; }

/* becomes */
@property --help-measure {
  syntax: "<length>";
  inherits: true;
  initial-value: 0px;
}

.help-prose {
  /* Resolved HERE, in the wrapper's font context, and inherited as an absolute
     length. An unregistered custom property would substitute the tokens "70ch"
     into each child and re-resolve them against that child's font — which is
     what §2.1 measured the headings escaping through. */
  --help-measure: 70ch;
}
.help-prose > * {
  max-width: var(--help-measure);
}
.help-prose > .help-bleed {
  max-width: none;
}
```

**Why this is behaviour-preserving.** The wrapper is not centred, so every direct child today is
laid out inside a 70ch box that starts at the same left edge. Capping each child at the same
absolute length instead of capping their shared parent puts every one of them at the same width
and the same origin — measured, not assumed (§2.1: zero drift across h1, h2, p, ul, table and a
component block). The one observable difference is the width of the wrapper element itself, which
no page paints a background or border on.

**Why an opt-out class and not a wider rule.** A rule that capped only text elements would
silently uncap tables, screenshots and the custom prose components on all fourteen pages, which
is a layout change to surfaces this branch has no reason to touch and no probe for. `.help-bleed`
makes the escape explicit and per-element, so the blast radius is exactly the elements that ask
for it.

### 3.2 Both tour grids opt in

`app/help/tour/page.mdx`: add `help-bleed` to the `className` of the `md:grid-cols-2` grid and
the `md:grid-cols-3` grid. No other class on either grid changes, and no card markup changes.

### 3.3 The Settings card

The "Once per environment" section is currently a bare `<div className="my-6">` holding one card
(the onboarding wizard). It becomes a two-column grid matching the "Daily" group's shape, also
carrying `help-bleed`, with a second card for `/help/admin/settings`.

The new card copies the structural shape of the seven existing cards exactly: the same
`className` run on the anchor, the same eyebrow / duration / `h3` / body / call-to-action
skeleton, and the same `aria-label` form (`"Settings: read the reference"`).

**It is a standard card, not an accent card.** The wizard card carries `border-accent` and an
accent eyebrow because it marks the one thing you do once and never again. Giving the Settings
card the same treatment would spend that emphasis on two of two cards, which is the same as
having none. The contrast between the two is the hierarchy, and it is deliberate.

Exact rendered copy, so this is a specification and not a description:

| slot | text |
| --- | --- |
| eyebrow | `Set once, revisit rarely` |
| duration | `3 min` |
| `h3` | `Settings` |
| body | `Settings holds the account-wide choices: who can sign in as an admin, which Drive folder the app watches, and which emails it sends you. Nothing here changes day to day. You come back when someone joins or leaves, when the folder moves, or when you want different notifications.` |
| call to action | `Read the settings reference →` |

The body is faithful to `app/help/admin/settings/page.mdx`, which opens on the same three
subjects (the administrators list, the watched Drive folder, and notification preferences) and
makes the same "set it up once and come back only when something needs reconnecting" point.

This copy satisfies the invariants `tests/help/page-tour.test.tsx` already enforces over the whole
file: no em dash, no `<ScreenshotPlaceholder>`, and no token matching the raw catalog error-code
shape. It contains no apostrophes, so the apostrophe-literal invariant is satisfied vacuously
rather than by choosing a character.

### 3.4 The derived guard — the class, not the instance

`tests/help/page-tour.test.tsx` loses its hardcoded `ADMIN_REFERENCE_URLS` array. In its place,
an assertion derived from the data source:

- **Accept-set, keyed on structure rather than spelling:** the guard's subject is every entry in
  `NAV` whose `group` field is exactly `"admin-surface"`. It reads that field; it does not pattern-match
  the slug string, so a future admin surface that does not live under `/help/admin/` is still in
  scope, and a non-admin page that happens to sit under that path prefix is still out of it.
- **Both directions, reported by name.** Set equality between the admin-surface slugs and the
  `/help/*` hrefs the tour page links, so a missing card AND a card pointing at something that
  left the nav both fail, each naming the offending slug. A one-directional `toContain` loop is
  what let this defect live.
- **Fails by default for a ninth surface.** Adding an entry to `NAV` with no card fails this test
  with no edit to it, which is the property the hardcoded list did not have.
- **The links are read from the RENDERED DOM, never from the MDX source text.** `page-tour.test.tsx`
  already renders the page through the real MDX pipeline under an `MDXProvider`, so the guard
  collects `a[href]` from that tree. A regex over the source would be the same defect wearing a
  new coat: the page mentions routes in prose as well as in cards, so a source scan could match
  `/help/admin/settings` in a sentence and report the surface covered while no card exists. Reading
  rendered anchors cannot be satisfied by prose.

**Why this guard is not enrolled in the source-mutation registry.** The registry mutates a module
named by `sourcePath` and decides KILLED against a suite. This guard has no such module: after the
change above it is a rendering assertion, and its logic is set equality over two collections it
obtains structurally. There is nothing to mutate that is not the test itself. That is the same
disposition the step3 tap-target surface reached, and it is stated here rather than resolved by
enrolling a surface symbolically.

Held to the same bar, `tests/e2e/help-pages.spec.ts` already derives correctly and needs no change.

Two guards move with the mechanism rather than with the guard defect. `tests/e2e/help-typography.spec.ts`
measures the wrapper's width to prove the reading measure; under §3.1 the wrapper is no longer the
element that carries it, so the assertion retargets to a paragraph, which is the element the
contract was always about. `tests/help/help-prose-layer.test.ts` pins the measure by matching
`max-width: <n>ch` in the stylesheet; that literal becomes `--help-measure: 70ch`, so the pattern
follows it. Neither is loosened: both still fail if the measure disappears. This is checked, not
assumed — that `max-width: 70ch` at `app/globals.css` is the only match of its shape in the file,
so the guard is load-bearing today and would have broken silently if left alone.

### 3.5 Real-browser layout assertions

Per the writing-plans layout-dimensions rule, the measure contract is proven with
`getBoundingClientRect()` in a real browser, not in jsdom, which computes no layout. The
assertions live with the other `/help` real-browser typography work and are derived from the
live paragraph metrics on the same page rather than hardcoded pixel values, matching the
anti-tautology posture `tests/e2e/help-typography.spec.ts` already states in its header.

The contract: at every desktop viewport in the probe matrix, each card's body measure clears a
floor derived from `DESIGN.md` §2.5, and the assertion cannot pass by measuring a container that
is not the text.

---

## 4. Dimensional invariants

The parent whose width is constrained is the prose column; the grid children are what must be
allowed to exceed it. Tailwind v4 does not default `.flex` to `align-items: stretch` on this
project, so nothing here relies on an implicit stretch.

| Parent | Child | Relationship required | What guarantees it |
| --- | --- | --- | --- |
| `.help-prose` | every direct child that is not `.help-bleed` | child width ≤ the measure, and identical to today's width for every child that exists | `.help-prose > * { max-width: var(--help-measure) }` over an `@property`-registered length (§3.1); the registration is what makes this hold for the headings as well as the body (§2.1) |
| `.help-prose` | `.help-bleed` grid | child width == the `main` column's content width, not 70ch | `.help-prose > .help-bleed { max-width: none }` plus the grid's own default `width: auto` as a block child |
| `main` | `.help-prose` | wrapper width == `main` content width | wrapper carries no `max-width` after §3.1 |
| grid | each card | equal column widths; cards in a row share a height | `grid-template-columns` from the `grid-cols-*` utilities; grid's default `align-items: stretch` (a grid default this project does not override, unlike the flex case) |

Every row is asserted in a real browser (§3.5), each `data-testid`-addressed element measured
inside one `page.evaluate` — `boundingBox()` is viewport-relative and actionability scrolls, so
two separate reads can manufacture geometry that never coexisted.

---

## 5. Transition inventory

The cards have two visual states and one transition, and the tour page has no state machine. The
table is short because the surface is, not because it was skipped.

| From | To | Treatment |
| --- | --- | --- |
| rest | hover | `border-color` only, via the existing `transition-colors` on the anchor. Unchanged by this branch. |
| rest | focus-visible | Instant. The focus ring is not animated anywhere in this project's help surfaces. |
| hover | focus-visible | Instant; the border-color transition already in flight is not interrupted, because the two properties do not overlap. |

Compound: a viewport resize while a hover transition is mid-flight re-runs layout under the new
grid template. Nothing is animated on width, so there is no interpolation to interrupt. No
`AnimatePresence`, no conditional render, and no exit animation exists on this page.

---

## 6. Documented limits

Recorded here rather than filed as ledger rows, per the process mint freeze.

- **Tables, screenshots and the custom prose components keep the 70ch cap.** Some of them may
  read better bled too. Nothing here probes that, so nothing here changes it. Re-file trigger: a
  report that a specific help table or screenshot is cramped, with the surface named.
- **`tests/help/help-prose-layer.test.ts` isolates its "region" as everything from the first
  `.help-prose` occurrence to end of file**, so its measure assertion would be satisfied by a match
  anywhere below that point. It happens to be load-bearing today because that shape appears exactly
  once in the whole stylesheet, but the isolation is looser than the comment above it claims, and a
  future unrelated rule could make it vacuous without anyone noticing. Process-facing, so the freeze
  applies; recorded here rather than filed. Process-facing, and the freeze applies.
- **The peer grid at `app/help/errors/page.tsx`** is dispositioned in §7 once the probe runs.

---

## 7. Class sweep — every grid inside the prose column

The change touches `.help-prose`, which all fourteen `/help/*` pages render through, so the sweep
is owed. It is a derived cover, not a list: walk `app/help/**` for grid containers rather than
naming the pages believed to have them.

```
grep -rn 'grid-cols\|className="grid\|grid ' app/help --include='*.mdx' --include='*.tsx'
```

Three hits across the tree AS IT STANDS: the two tour grids, and `app/help/errors/page.tsx`, a
`sm:grid-cols-2` list of error-code links. (Do not read this three as the three that take
`help-bleed` — that set is the tour's grids, and the errors grid is the one this sweep is about.
After §3.3 the tree holds four grids, three of them on the tour page.) The errors grid is a different shape — short link
labels on a tight `gap-y-1`, not paragraphs of body copy — so whether it is an instance of this
finding at all depends on whether its items wrap. The probe measures it. Disposition:

- **If items wrap at any viewport**, it is the same defect and it is repaired in this PR. The
  class-sweep default is that every instance of one shape is fixed together, and the marginal cost
  while already holding this context is near zero.
- **If no item wraps at any viewport**, it is not an instance: a one-line label in a narrow column
  is not a degraded measure. That is recorded here with the probe output, not filed.

A separate sweep covers the guard defect of §1.2 — a completeness claim over the admin surface
that restates the list instead of deriving it. Derived cover: every file under `tests/` mentioning
two or more literal `/help/admin/*` URLs, checked for whether it imports `NAV`.

| File | Literal admin URLs | Derives from NAV | Disposition |
| --- | --- | --- | --- |
| `tests/help/page-tour.test.tsx` | 7 | no | **The defect.** Repaired in §3.4. |
| `tests/e2e/help-pages.spec.ts` | 8 | yes | Correct already — set equality against `NAV`. |
| `tests/help/_nav-shape.test.ts` | 8 | yes | Correct already. |
| `tests/help/render.test.ts` | 8 | no | Not a defect: the literal list is the *expected* value asserted against a filesystem-derived discovery, so a new page fails it loudly. Pinning a derived result is the anti-tautology shape, not a restatement. |
| `tests/e2e/help-typography.spec.ts` | 4 | no | Not in the class — navigates to a few pages, claims no completeness. |
| `tests/help/page-daily-rhythm.test.tsx` | 2 | no | Not in the class — same reason. |

One instance in the class, repaired in branch. Nothing deferred, so no exception (a)/(b)/(c) is owed.

---

## 7.1 Mode boundaries and growth

**Which elements belong to which mode.** Every grid is `grid-cols-1` below the `md` breakpoint,
so on mobile all three groups are single-column stacks and the bleed buys nothing: at that width
the prose column is already narrower than 70ch, so the cap is not what binds and no card changes
size. `help-bleed` therefore has a visible effect only at `md` and above. Nothing is hidden or
shown per mode; the same cards render at every width, in a different number of columns.

**Growth.** The card list is bounded by the `admin-surface` group, which has eight entries today
and grows only when someone adds an admin help page. There is no truncation and no cap: a ninth
entry means a ninth card, and the grid reflows it onto a new row. AC-4 is what makes that a
deliberate act rather than a silent omission — the guard fails until the card exists. This is the
right behaviour for a page whose entire purpose is to be exhaustive, so capping the list at some
N and showing a link to the rest is explicitly rejected.

---

## 8. Acceptance criteria

- **AC-1** Each tour card's rendered body measure clears the `DESIGN.md` §2.5 floor at every
  desktop viewport in the probe matrix, measured in a real browser.
- **AC-2** Every other `/help/*` page renders at the same widths as before the change — the cap
  moved, it was not lifted.
- **AC-3** The tour page links to every `admin-surface` slug in `NAV`, and links to no
  `/help/*` route absent from that group. Both directions fail by name.
- **AC-4** Adding a ninth `admin-surface` entry to `NAV` with no card fails AC-3's test with no
  edit to the test.
- **AC-5** The existing `/help` prose contracts still hold: heading scale, list markers, inline
  link affordance, paragraph rhythm, and the reading measure of body text.
- **AC-6** The intro sentence's completeness claim is true: eight cards for eight admin surfaces.
- **AC-7** No user-visible copy introduced by this branch violates the mechanical UI invariants
  named in the `AGENTS.md` pre-code mechanical UI gate: no em dashes, apostrophe literals, 44px
  tap targets, canonical type and token classes.

---

## 9. Out of scope

- Any change to the seven existing cards' copy. Only the new card carries new copy.
- The `/help` sidebar, breadcrumb, and nav ordering.
- Uncapping any prose element other than the tour's three card grids (§3.2, §3.3).
- The looseness noted in §6 for `help-prose-layer.test.ts`.
