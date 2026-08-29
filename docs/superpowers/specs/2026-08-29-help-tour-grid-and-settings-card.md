# /help/tour — lift the card grids out of the reading measure, and make the page's completeness claim true

**Branch:** `fix/help-tour-grid-and-settings-card` · **Date:** 2026-08-29 · **Effort:** M
**Closes:** `DEFERRED.md` HELPTOUR-CARD-GRID-MEASURE-1 and HELPTOUR-SETTINGS-CARD-MISSING-1

Two impeccable P1 findings from the invariant-8 dual gate on PR #778, deferred there under
class-sweep exception (b) because that arc's spec fenced copy and layout changes out of scope.
Both are pre-existing on `origin/main` and neither has moved since.

---

## 1. What is wrong

### The card grids divide a reading measure

`app/help/layout.tsx` wraps every `/help/*` page's children in a single `help-prose` div, and
`app/globals.css` caps that wrapper at `max-width: 70ch`. The tour page then puts two card grids
inside it: a `md:grid-cols-2` grid and a `md:grid-cols-3` grid. The three-column grid divides that
column three ways, and the card body text renders at 10.4ch at 768px, rising only to 18.1ch on any
wider screen. The cards grow very tall to compensate: 824.8px at 768px, for 45 words.

**The `DEFERRED.md` entry's mechanism claim is half right, and §2.2 corrects it.** The 70ch cap
binds wherever `main` exceeds 704.4px, which is **two intervals, not one**: 740 to 767, and 1004
upward. It does NOT bind between them, because the shell's sidebar engages at 768 and drops `main`
to 472px. At 900px the column is 604px and at 768px it is 472px, both narrower than the cap, which
is therefore not what constrains them.

Earlier drafts said the cap binds "only at 1024px and above", read off a table sampling 390, 768,
900, 1024 and 1280 that steps straight over the pre-`md` window. A later draft corrected it to
752-767 and 1016 upward, which was still wrong, and wrong in a way worth naming: **those are the
two-column SWITCH thresholds, not the cap thresholds.** The switch needs a 720px container; the cap
binds at 704.4px. Two different numbers, measured in the same sweep, and conflating them put the
switch's viewports into the cap's sentence. The values above are read directly from the §2.3 sweep,
which is the only place either threshold should ever be taken from. What hurts most at 768px is the column COUNT: three columns of a 472px space. The entry's
proposed repair, lifting the grids out of the cap, cannot reach the viewport with the worst
measure, because at that viewport there is no cap to lift them out of. This spec ships that repair
AND the one the numbers actually call for.

Mobile is a single column. Its 31.4ch is a consequence of a 390px screen rather than of this
layout, and it is the best measure the page currently achieves anywhere.

### The page claims to cover every admin screen and covers seven of eight

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
| **The repair goes beyond the `DEFERRED.md` entry's named mechanism, deliberately.** The entry proposed lifting the grids out of the 70ch cap; §2.2 measures that cap binding only in two narrow intervals (740-767 and 1004 upward), so the named repair cannot reach 768px, where the measure is worst. The bleed still ships, joined by a derived column count. | bl-orch ruling, 2026-08-29: the owner ratified the OUTCOME (cards readable at full width), and a better mechanism for the same outcome is the arc's call. Conditions attached and met: the probe and the refutation are in this document (§1.1, §2.2), the floor carries real-browser assertions across the sampled matrix (AC-1), and the sweep covers the errors peer (§3.2a, §7). |
| **AC-1's floor is 28ch, not `DESIGN.md` §2.5's 65-75ch.** §2.5 caps long-form prose; no multi-column card grid on an 856px column can reach it. | §8, AC-1. Stated because "the spec ignores the documented measure floor" is the obvious finding, and the answer is that the floor is a cap on a different thing. |
| Both findings are pre-existing on `origin/main`, not regressions introduced by any recent arc. | `DEFERRED.md`, both entries, "Why deferred rather than repaired in-branch". |

---

## 2. Probe

Numbers in this section are measured, never argued. Per the probe-before-argue rule, no design
decision below rests on a predicted measurement. Both §2.1 and §2.2 are complete.

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

### 2.2 The live measure (complete)

Measured 2026-08-29, admin-signed-in, real render, on the branch head. Command and the port hazard
are below. Body measure is the card's `<p>` width over the `ch` advance of its own computed font
(10.063px); `cardChrome` (padding plus border) is a measured 42px, and the grid gap is 16px.

| viewport | prose column | grid | cols | card | body | measure | card height |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 390 | 358 | both | 1 | 358 | 316 | 31.4ch | 324.6 / 298.6 |
| 768 | 472 | 2-col | 2 | 228 | 186 | 18.5ch | 626.2 |
| 768 | 472 | **3-col** | 3 | **146.7** | **104.7** | **10.4ch** | **824.8** |
| 900 | 604 | 2-col | 2 | 294 | 252 | 25.0ch | 454.6 |
| 900 | 604 | 3-col | 3 | 190.7 | 148.7 | 14.8ch | 626.2 |
| 1024 | 704.4 | 2-col | 2 | 344.2 | 302.2 | 30.0ch | 402.6 |
| 1024 | 704.4 | 3-col | 3 | 224.1 | 182.1 | 18.1ch | 522.2 |
| 1280 | 704.4 | 2-col | 2 | 344.2 | 302.2 | 30.0ch | 402.6 |
| 1280 | 704.4 | 3-col | 3 | 224.1 | 182.1 | 18.1ch | 522.2 |

The 2026-08-11 readings reproduce almost exactly (10.5 / 14.9 / 18.2 against today's 10.4 / 14.8 /
18.1), so the defect is unchanged and both grids are affected, not only the three-column one: the
two-column grid never exceeds 30ch either.

**Where the cap actually binds, which is the finding that reshaped §3.** `main`'s content width
and the prose column diverge only above 1024px:

| viewport | `main` content | prose column | does the 70ch cap bind? |
| --- | --- | --- | --- |
| 390 | 358 | 358 | no |
| **740** | **708** | **704.4** | **yes, by 3.6px — the first pre-`md` viewport where it binds at all** |
| 752 | 720 | 704.4 | yes, by 15.6px — also where the grid reaches two columns, which is a DIFFERENT threshold |
| 768 | 472 | 472 | no — the sidebar engages and `main` drops |
| 900 | 604 | 604 | no |
| **1004** | **708** | **704.4** | **yes, by 3.6px — first post-`md` viewport where it binds** |
| 1016 | 720 | 704.4 | yes, by 15.6px — and where the grid returns to two columns |
| 1024 | 728 | 704.4 | yes, by 23.6px |
| 1280 | 856 | 704.4 | yes, by 151.6px |
| 1440 | 856 | 704.4 | yes; `max-w-6xl` caps `main`, so nothing widens past 1280 |

So a bleed buys between 3.6px and 15.6px across the 740-767 window, **nothing at all at 768** where the sidebar drops the
container below the cap, then 3.6px again from 1004, 15.6px at 1016, 23.6px at 1024 and 151.6px at 1280. The
viewport where the measure is worst is exactly the one where the bleed buys nothing. That is why §3.2 does not stop at the bleed.

**The errors-page peer is a confirmed instance, not a hypothetical.** At 768px, 5 of its 7 jump-list
items wrap. It does not wrap at 390 (one column), nor at 900 and above. Same shape, same viewport,
same cause: a fixed column count applied to a column too narrow to hold it.

| viewport | cols | item width | measure | wrapped items |
| --- | --- | --- | --- | --- |
| 390 | 1 | 358 | 35.6ch | 0 of 7 |
| **768** | 2 | 220 | 21.9ch | **5 of 7** |
| 900 | 2 | 286 | 28.4ch | 0 of 7 |
| 1024 | 2 | 336.2 | 33.4ch | 0 of 7 |
| 1280 | 2 | 336.2 | 33.4ch | 0 of 7 |

Probe command, recorded so it is reproducible and so the port hazard is not rediscovered:

```
BASELINE_SERVER_ONLY=1 E2E_PORT=3417 \
  TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  pnpm heavy pnpm exec playwright test help-grid-probe --project=desktop-chromium
```

`E2E_PORT` is not optional, and port 3004 is not usable: the `help-docs` project family hardcodes
its base URL on port 3004 with `reuseExistingServer: !CI`, and a sibling arc held that port while
this spec was drafted. A run there would have measured another branch's build and reported it as
this one, which is the failure `tests/e2e/help-pages.spec.ts` records for port 3000. Note also that
`--project` is variadic: `--project desktop-chromium help-grid-probe` reads BOTH words as project
names and exits before running anything.

### 2.3 The proposed design, swept on the real page (complete)

Three consecutive review rounds found the same class of error: a layout claim computed from a model
of the container that was missing a term — first the 70ch cap, then the `auto-fit` continuum, then
the shell's `md` sidebar and the errors nav's own cap. The same-vector rule says stop patching
instances and re-analyse. This is that re-analysis, and it replaces derivation with measurement:
the PROPOSED CSS injected into the REAL page, swept at 4px from 320 to 1440, reading actual
computed column counts and rendered widths.

Two properties of the harness are worth stating because the first version of it was wrong. It
forces `display: grid` on the "Once per environment" wrapper, which is a plain `div` today and
which §3.3 turns into a grid — without that, the injected track list applies to a non-grid element.
And it REFUSES to report a column count it cannot resolve, returning a sentinel instead: v1 parsed
`grid-template-columns` by splitting on spaces, which on a non-grid element returns the unresolved
`repeat(...)` text and reported a constant "4 columns" that was not a number at all. Zero
unresolved reads in the final run.

**The sweep.** 320 to 1440 inclusive at 4px, which is 281 viewports per page:

```
BASELINE_SERVER_ONLY=1 E2E_PORT=3417 \
  TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  pnpm heavy pnpm exec playwright test help-grid-probe --project=desktop-chromium
```

**Results, and this section is the one that owns them** — §3.2, §3.2a and §7.1 reference these
numbers rather than restating them. Over every sampled viewport: **no grid overflows its container
at any width**, and **no jump-list item wraps at any width**. The worst measure while multi-column
is **30.8ch at a 752px viewport**, clearing AC-1's 28ch floor. The tour transitions are tabulated
in §7.1 and the jump list's in §3.2a.

**One caveat, stated because the sweep measured today's content.** The "Once per environment" group
holds one card today, and `auto-fit` collapses empty tracks, so that group renders full-width in
the sweep rather than as two tracks. With the Settings card added (§3.3) it holds two, and its
cards then behave as the other grids' do. That row of the sweep describes the page as it is, not as
it ships.

---

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

### 3.2 Both tour grids: bleed, and stop pinning the column count

The bleed alone does not fix this. §2.2 measures the 70ch cap binding in two intervals, 740-767 and
1004 upward, and NOT at 768 where the sidebar drops the container — so at 768px — where the measure is worst, 10.4ch — there is no cap to escape and a bleed changes
nothing. The column count is what divides a 472px space three ways. Both parts ship:

**Part zero, the markup the guard depends on.** Every card anchor on the page gains
`data-tour-card` — the seven that exist today and the one §3.3 adds, eight in total. This is stated
here as a concrete edit rather than only in §3.4, because a guard keyed on an attribute no card
carries matches nothing and passes vacuously, which is a worse failure than the one it replaces.

**Part one, the bleed.** `help-bleed` on both grids, which buys 3.6px from 1004, 15.6px at 1016, 23.6px at 1024 and 151.6px at 1280 (§2.2).

**Part two, a minimum card width instead of a fixed column count.** Each grid's
`grid-cols-1 md:grid-cols-N` becomes `grid-cols-[repeat(auto-fit,minmax(min(22rem,100%),1fr))]`. The column
count then falls out of the space available rather than being asserted against it, and no
breakpoint has to be kept in sync with a sidebar width. Arbitrary `minmax()` track utilities are
already this codebase's idiom for exactly this (`app/admin/dev/telemetry/page.tsx`,
`components/admin/Dashboard.tsx`).

**Why 22rem, and why the first derivation of this number was wrong.** `auto-fit` has NO
breakpoint: the column count is continuous in container width, so a matrix of sampled viewports
cannot see the worst case. The first draft picked 20rem by comparing five sampled widths and
reported a worst of 31.2ch. That number was an artefact of where the samples fell.

The worst measure is not at any sampled viewport. It is at the **switch**, the container width
where a second column first fits, because that is where each track is exactly the minimum. Its
value therefore depends only on the minimum: `(MIN - 42) / 10.063`, using the measured card chrome
and the `ch` measured on the real card body (§2.2). Swept at 1px over container widths 288 to 900
and confirmed in a real browser:

| candidate | 2-col switch at | measure AT the switch | 728px container (1024) | 856px container (1280) |
| --- | --- | --- | --- | --- |
| 20rem | 656px | **27.6ch** | 2 col, 31.2ch | 2 col, 37.6ch |
| 21rem | 688px | 29.2ch | 2 col, 31.2ch | 2 col, 37.6ch |
| **22rem** | 720px | **30.8ch** | 2 col, 31.2ch | 2 col, 37.6ch |
| 23rem | 752px | 32.4ch | **1 col**, 68.2ch | 2 col, 37.6ch |
| 24rem | 784px | 34.0ch | **1 col**, 68.2ch | 2 col, 37.6ch |

**22rem is the largest ROUND minimum that still gives two columns at a 728px container**, which is
the 1024px viewport. The exact maximum is `(728 - 16) / 2 = 356px`, or 22.25rem — an earlier draft
of this sentence claimed 22rem was that maximum, which is false by 4px. 22rem is chosen over
22.25rem deliberately and not for tidiness: at exactly 356px the track equals the minimum, so any
subpixel difference in the container (a scrollbar, a zoom level, a font-size change moving `rem`)
flips the grid to one column. 4px of headroom is what stops the two-column state depending on an
exact tie. Above 22.25rem the grid collapses to a single card per row at 1024 and stops reading as
a grid at all. Below it the switch measure falls, and at 20rem it falls to 27.6ch — under AC-1's
floor, at a viewport no acceptance criterion sampled. So 22rem maximises the worst case subject to
keeping the grid a grid, and both ends of that statement are checks rather than judgements.
Measured on the real page across the full sweep (§2.3), the worst measure while multi-column is
30.8ch at a 752px viewport, which is the switch, exactly as the general form predicts.

An earlier draft of this section dismissed 22rem as "the same layout with a less round number".
That was wrong in both halves: 20rem switches at a 656px container and 22rem at 720px, so they are
not the same layout, and the difference is exactly the 3.2ch that decides whether AC-1 holds.

Narrow phones sit below all of this and are unaffected by the choice: a 288px container is one
column at 24.4ch whatever the minimum is, because a 288px screen cannot be made wider. That is the
same class as the 31.4ch at 390px which §7.1 declares unchanged rather than improved.

**The parse-warnings card's span changes with it.** That card carries `md:col-span-2`
(`app/help/tour/page.mdx`), which assumes exactly two columns. Under `auto-fit` the count varies,
and a two-track span in a one-track grid creates an implicit second column and breaks the row. It
becomes `col-span-full`, which is `grid-column: 1 / -1` and spans whatever count is live. This is
the kind of interaction that makes `auto-fit` worth stating carefully rather than dropping in.

### 3.2a The errors-page jump list

Confirmed by probe as the same defect, not a suspected peer: 5 of its 7 items wrap at 768px
(§2.2). It takes the derived column count and **no** `help-bleed` — the defect is the wrap, and the
wrap is gone once the column count stops being asserted; widening the list as well would be a
change with no defect behind it.

**Its minimum is 18rem, not the cards' 22rem, and sharing theirs was a real error.** Two reasons,
both of which a reviewer found before this section did.

First, arithmetic: this grid's gap is `gap-x-8`, 32px, not the cards' 16px, so it does not inherit
their column behaviour. Two 22rem tracks need `352 x 2 + 32 = 736px`.

Second, and decisively: this `nav` is NOT bled, so it stays under the 70ch cap at 704.4px. 736 is
greater than 704.4, so **two 22rem columns are unreachable at every viewport** — the grid would
have been permanently single-column, and AC-1b and AC-1c would both still have passed, because one
column neither wraps nor overflows. The acceptance criteria could not have caught it.

18rem is derived from this list's own content rather than borrowed. §2.2 measured its items at
286px with 0 of 7 wrapping, so 288px is the smallest round minimum that is known to fit every
label. Two 18rem tracks need `288 x 2 + 32 = 608px`, comfortably inside the 704.4px cap. Swept on
the real page (§2.3):

| viewport | `nav` | cols | item | wrapped |
| --- | --- | --- | --- | --- |
| 320 | 288 | 1 | 288 | 0 of 7 |
| 640 | 608 | 2 | 288 | 0 of 7 |
| 768 | 472 | 1 | 472 | 0 of 7 |
| 904 | 608 | 2 | 288 | 0 of 7 |

The same two-to-one-to-two shape as the tour grids, and for the same reason: the shell's sidebar,
not the list. Zero wrapping at every sampled viewport of the sweep (§2.3), against a baseline of 5
of 7 wrapping at 768.

### 3.3 The Settings card

The "Once per environment" section is currently a bare `<div className="my-6">` holding one card
(the onboarding wizard). It becomes a grid carrying the same
`grid-cols-[repeat(auto-fit,minmax(min(22rem,100%),1fr))]` and `help-bleed` as the other two, with a second
card for `/help/admin/settings`. Two cards under `auto-fit` sit side by side wherever there is room
for two 22rem columns and stack below that, so the group needs no column count of its own.

The new card copies the structural shape of the seven existing cards exactly: the same
`className` run on the anchor, the same eyebrow / duration / `h3` / body / call-to-action
skeleton, the same `aria-label` form (`"Settings: read the reference"`), and the `data-tour-card`
attribute §3.2 puts on all eight.

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
- **The links are read from the RENDERED DOM, never from the MDX source text**, AND only from
  anchors the page marks as cards. Each card anchor carries a `data-tour-card` attribute, and the
  guard collects `a[data-tour-card][href]`.

  **Both halves are load-bearing, and the second was missing from this spec's first draft.** Reading
  rendered anchors instead of scanning source defeats a source regex matching a route named in a
  sentence. It does NOT defeat a prose LINK, because an ordinary Markdown link renders as an anchor
  too — so a contributor who deleted the Settings card while leaving or adding
  `[Settings](/help/admin/settings)` in a sentence would satisfy a bare `a[href]` set equality with
  no card on the page, defeating AC-3, AC-4 and AC-6.

  That is not a hypothetical shape: `](/help/admin/` appears on **8 of the 14** help pages
  (`app/help/daily-rhythm/page.mdx`, `app/help/getting-started/page.mdx`,
  `app/help/whats-different/page.mdx`, and five pages under `app/help/admin/`). Prose links to
  admin routes are ordinary authoring on this corpus, which puts the failure squarely inside the
  threat fence rather than outside it. The tour page happens to carry none today — all seven of its
  admin references are card hrefs — so the bare form would have passed on the day it shipped and
  broken on an ordinary edit later, which is the worst available failure shape.

  `data-tour-card` is the page DECLARING its accept-set rather than the guard inferring one. It is
  keyed on an attribute rather than on nesting depth or a class-name substring, so it survives this
  branch's own regrouping of the cards, and a reviewer can see what counts as a card by reading the
  page.

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
| `main` | `.help-bleed` grid | grid width == `main` content width: 728 at 1024, 856 at 1280 and 1440 | `max-width: none` (§3.1); `max-w-6xl` on the page shell is what stops 1440 exceeding 1280 |
| grid | each card | card width >= 22rem OR == the container, whichever is smaller; never wider than the container | `grid-cols-[repeat(auto-fit,minmax(min(22rem,100%),1fr))]` (§3.2). `auto-fit` collapses to one track rather than shrinking below the minimum, and the `min(...,100%)` is what stops that one track exceeding a container narrower than 22rem |
| grid | parse-warnings card | spans every column, whatever the live count | `col-span-full` (`grid-column: 1 / -1`), NOT `md:col-span-2`, which assumes exactly two tracks and creates an implicit one when there is a single track |
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
- ~~The peer grid at `app/help/errors/page.tsx`~~ — **resolved, not a limit.** The probe confirmed
  it as an instance of the class (5 of 7 items wrap at 768px) and §3.2a repairs it in this PR.

---

## 7. Class sweep — every grid whose column count is asserted rather than derived

The change touches `.help-prose`, which all fourteen `/help/*` pages render through, so the sweep
is owed. It is a derived cover, not a list: walk `app/help/**` for grid containers rather than
naming the pages believed to have them.

```
grep -rn 'grid-cols\|className="grid\|grid ' app/help --include='*.mdx' --include='*.tsx'
```

Three hits across the tree AS IT STANDS: the two tour grids, and `app/help/errors/page.tsx`, a
`sm:grid-cols-2` list of error-code links. (Do not read this three as the three that take `help-bleed` — that set is the tour's grids, and
the errors grid takes the derived column count without the bleed, per §3.2a. After §3.3 the tree
holds four grids, three of them on the tour page.) The errors grid is a different SHAPE — short
link labels on a tight `gap-y-1`, not paragraphs of body copy — so whether it belonged to this
class was a real question rather than a formality, and the probe answered it. Disposition:

**Resolved by probe: it IS an instance, and it is repaired in this PR.** 5 of its 7 items wrap at
768px (§2.2), at the same viewport and from the same cause as the tour grids — a column count
asserted against a space too narrow to hold it. The class-sweep default applies: every instance of
one shape is repaired together, and the marginal cost while already holding this context is near
zero. Nothing is deferred, so no exception (a), (b) or (c) is owed. The repair is §3.2a.

**One structural difference that changes how the repair would be applied, if it is needed.** The
errors grid is a `ul` inside `<nav className="my-6">`, so the direct child of `.help-prose` is the
`nav`, not the grid. Two consequences. First, §3.1 leaves this grid's width untouched either way:
the `nav` takes the measure exactly as the wrapper imposed it before, and the `ul` is bounded by
the `nav` as it always was — so nothing about the errors page changes unless this branch chooses
to change it. Second, a bleed here would put `help-bleed` on the `nav`, because
`.help-prose > .help-bleed` matches direct children only. Worth stating because adding the class to the grid
itself is the obvious move, and it would silently do nothing.

768px was where to look, and it is where the defect was: the sidebar has appeared while the column
is at its narrowest, so the two columns are far tighter than the 70ch cap alone suggests. Every one
of the three grids in this tree fails at that one viewport and nowhere else, which is the clearest
statement of what the class actually is. It is not the framing the `DEFERRED.md` entry used, grids
trapped under the 70ch cap: that is true only above 1024px, and it would have left the worst
instance of all three unrepaired. The class is a column count asserted as a constant against a
space whose width is not one.

A separate sweep covers the guard defect described in §1 — a completeness claim over the admin surface
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

**A third sweep, owed by the review's second finding.** Its shape is a `minmax()` minimum that can
exceed its container, so the sweep is every `minmax(` in the rendered tree:

```
grep -rno 'minmax([^,]*,' app/ components/ --include='*.tsx' --include='*.mdx' --include='*.css' | grep -v 'minmax(0,'
```

Empty. Every existing `minmax()` on this codebase uses a `0` minimum and therefore cannot overflow;
the non-zero minimum this branch introduces would be the first. That is the honest reason the
hazard had no precedent here to learn from, and the reason §3.2 now carries the measured track
widths rather than a column-count formula.

---

## 7.1 Mode boundaries and growth

**The grid has no breakpoint. The SHELL does, and the container width is not monotonic in
viewport width.** Two earlier drafts got this wrong in opposite directions: the first said every
grid is `grid-cols-1` below `md`, carried over from the design this spec replaced; the second
overcorrected to "there are no modes", which denied the shell's `md` threshold. Both were prose
about layout. This section now states what was measured.

`auto-fit` responds to the CONTAINER, and the container is `main`, which loses 240px of sidebar
plus a 24px gap when the shell's `md:flex` engages at 768px. So `main` grows with the viewport,
then DROPS at 768, then grows again. Swept at 4px from 320 to 1440 on the real page with the
proposed CSS applied (§2.3):

| viewport | `main` | tour card grid | card | measure |
| --- | --- | --- | --- | --- |
| 320 | 288 | 1 col | 288 | 24.4ch |
| **752** | **720** | **2 col** | 352 | **30.8ch** |
| **768** | **472** | **back to 1 col** | 472 | 42.7ch |
| **1016** | **720** | **2 col again** | 352 | 30.8ch |

The two-to-one-to-two sequence is real, it is caused by the sidebar rather than by the grid, and
no arithmetic over the grid alone can predict it. It is not a defect: every state in it is
readable, and the one-column state at 768 is the WIDEST measure of the three at 42.7ch. It is
recorded because a reader who did not know it would read the 768 row as a regression.

Nothing is hidden or shown per mode; the same cards render at every width. The bleed has a visible
effect only where `main` exceeds 704.4px, which §2.2 measures as 740-767 and 1004 upward (§2.2). The
grid's own switch, the shell's `md`, and the bleed's threshold are three different numbers.

**Growth.** The card list is bounded by the `admin-surface` group, which has eight entries today
and grows only when someone adds an admin help page. There is no truncation and no cap: a ninth
entry means a ninth card, and the grid reflows it onto a new row. AC-4 is what makes that a
deliberate act rather than a silent omission — the guard fails until the card exists. This is the
right behaviour for a page whose entire purpose is to be exhaustive, so capping the list at some
N and showing a link to the rest is explicitly rejected.

---

## 8. Acceptance criteria

**The matrix is 320, 390, 640, 740, 752, 768, 900, 904, 1004, 1016, 1024 and 1280.** The round numbers alone are what
hid a 27.6ch measure behind a 20rem minimum, so every threshold the sweep found is sampled
explicitly: **752** is the first switch, **768** is where the shell's sidebar drops the container
and the grid falls back to one column, and **1016** is where it returns to two (§7.1). **320** is
AC-1c's overflow pin. A criterion that samples only round viewports cannot see a transition, and
this layout has three.

- **AC-1** Every tour card's rendered body measure is **at least 28ch** at 752, 768, 1016, 1024 and 1280,
  measured in a real browser with `getBoundingClientRect`. The floor is 28 and not 31.2, which is
  what §3.2's arithmetic predicts, so that cross-engine glyph-metric variance cannot fail a correct
  layout — the same headroom `tests/e2e/help-typography.spec.ts` already leaves on its own measure
  bound. **This is deliberately NOT `DESIGN.md` §2.5's 65-75ch.** That is a CAP on long-form prose,
  and a card in any multi-column grid on an 856px column cannot reach it: three columns cannot
  exceed 24ch and two cannot exceed 38ch, at any minimum width. Writing 65ch here would have made
  AC-1 unsatisfiable by the change it is supposed to accept, which is how it read before §2.2 was
  measured.
- **AC-1a** The 390px measure is UNCHANGED at 31.4ch, single-column.

  **Narrowed deliberately, because the earlier wording had no independent violation.** It used to
  say "no viewport whose baseline was at or above the floor ends below it", which AC-1 already
  pins at every matrix viewport — and the violation staged for it was AC-1's own. The one thing
  AC-1a claims that AC-1 does not is that the mobile case is left alone: this change is desktop
  work, 390px is single-column before and after, and a repair that improved desktop by touching
  mobile would pass every other criterion. That is now what it asserts and what its violation
  stages.

- **AC-1b** Zero items in the errors-page jump list wrap, at every viewport in the matrix. The
  baseline is 5 of 7 wrapping at 768.
- **AC-1d** The measured column sequences hold, asserted as column COUNTS and not as measures.
  The tour card grids are **2 columns at 752, 1 at 768, 2 again at 1016**; the errors jump list is
  **1 column at 320, 2 at 640, 1 at 768, 2 again at 904** (§7.1, §3.2a).

  **Without this, every other criterion passes on a permanently single-column page.** A single
  column is 65.8ch, which clears AC-1's floor; it never crosses the floor, so AC-1a holds; it
  cannot overflow, so AC-1c holds; and one column never wraps, so AC-1b holds. §3.2a already
  records that exact hole for the errors list — it is why a 22rem minimum there would have shipped
  a permanently collapsed grid with every criterion green — and the hole is general, not specific
  to that list. The criteria asserted the absence of the symptoms and never the presence of the
  behaviour the change exists to produce.

- **AC-1c** No grid on either page overflows its container horizontally, asserted at **320px** as
  well as across the matrix. 320 is deliberately below it: a 320px phone gives this layout a 288px
  container, the narrowest real one, and a BARE minimum of either candidate value overflows it —
  20rem by 32px, 22rem by 64px. `min(...,100%)` is what makes the assertion pass, so the criterion
  is what proves the `min()` is doing work rather than decorating the declaration.
- **AC-2** Every `/help/*` page other than the tour and the errors page renders at the same widths
  as before the change: the cap moved, it was not lifted. The errors page is deliberately in scope
  (§3.2a); its prose, headings, lists and tables are still asserted unchanged, and only its
  jump-list column count moves.
- **AC-3** The tour page's CARDS cover every `admin-surface` slug in `NAV`, and point at no
  `/help/*` route absent from that group. Both directions fail by name. Coverage is read from
  `a[data-tour-card][href]`, so a prose link to an admin route neither satisfies nor breaks it.
  The negative case is part of the criterion: a page carrying a prose link to an uncarded admin
  route still fails.
- **AC-4** Adding a ninth `admin-surface` entry to `NAV` with no card fails AC-3's test with no
  edit to the test.
- **AC-5** The existing `/help` prose contracts still hold: heading scale, list markers, inline
  link affordance, paragraph rhythm, and the reading measure of body text.
- **AC-6** The intro sentence's completeness claim is true: the NUMBER of `a[data-tour-card]`
  anchors equals the number of `admin-surface` entries in `NAV`. This is a cardinality assertion and
  not a restatement of AC-3, because **set equality cannot express it**: the guard compares
  deduplicated sets, so eight correct hrefs plus a duplicated ninth card satisfy AC-3 while "eight
  cards for eight admin screens" is false. Verified by construction, not supposed.
- **AC-7** No user-visible copy introduced by this branch violates the mechanical UI invariants
  named in the `AGENTS.md` pre-code mechanical UI gate: no em dashes, apostrophe literals, 44px
  tap targets, canonical type and token classes.

---

## 9. Out of scope

- Any change to the seven existing cards' copy. Only the new card carries new copy.
- The `/help` sidebar, breadcrumb, and nav ordering.
- Uncapping any prose element other than the tour's three card grids (§3.2, §3.3).
- The looseness noted in §6 for `help-prose-layer.test.ts`.
