# Agenda per-viewer day folding (option C)

Draft for PR3 of the BL-NULLCODE-STAMP-BATCH-2 residual sweep.

**Citations verified against `origin/main` @ `36638e063` on 2026-07-26.** Every line number below was
re-derived from live code immediately before this spec was written, not inherited from the draft:

| Symbol | Line |
| --- | --- |
| `resolveViewerContext(viewer, data)` | `components/crew/sections/ScheduleSection.tsx:101` |
| `const agendaLinks` | `components/crew/sections/ScheduleSection.tsx:141` |
| `const hasAgenda` | `components/crew/sections/ScheduleSection.tsx:142` |
| `const agendaPdfCount` | `components/crew/sections/ScheduleSection.tsx:146` |
| `const agendaArea` | `components/crew/sections/ScheduleSection.tsx:147` |
| `kind === "unknown_asterisk"` early return | `components/crew/sections/ScheduleSection.tsx:172` |
| drift-guard comment | `components/crew/sections/ScheduleSection.tsx:200` |
| `const allowedShowDays` | `components/crew/sections/ScheduleSection.tsx:201` |
| `const visibleDays` | `components/crew/sections/ScheduleSection.tsx:202` |

These are stale-by-construction — sibling sessions merge into this file continuously, and they have
already shifted once (+4) during this item's life. The durable facts are the SYMBOL names and their
relative ORDER; the hoist in §2 depends only on `resolveViewerContext` sitting above `agendaArea`, which
it does. Re-derive with:

```
git show origin/main:components/crew/sections/ScheduleSection.tsx | grep -nE 'const agendaLinks|const hasAgenda|const agendaPdfCount|const agendaArea|resolveViewerContext\(viewer|const allowedShowDays|const visibleDays|kind === "unknown_asterisk"'
```

`pnpm spec:lint` checks every citation against live code, so a stale number fails lint rather than
reaching review.

**Backlog item:** `BL-AGENDA-PERDAY-VIEWER-FILTER` · **Owner decision:** option C, 2026-07-24, from a three-option mockup at `docs/superpowers/specs/2026-07-24-agenda-visibility-mock/agenda-visibility-options.html` (committed in `de7a40f0d`)

## 1. Problem

A crew member who works one day of a four-day show sees the **whole show's** agenda at the top of Schedule, even though the day cards below are already trimmed to their days. `components/crew/sections/ScheduleSection.tsx:147` builds the agenda area with no date restriction; the only branch that suppresses it is the `unknown_asterisk` early return at `components/crew/sections/ScheduleSection.tsx:172`.

**This is a scan-cost problem, not a privacy one.** `AgendaEmbed` sits directly above the structured block and opens the unfilterable whole-show PDF, so no filtering of the rows can withhold a date the viewer could not reach in one tap. That framing is what makes option C (fold, don't hide) coherent rather than security theatre.

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Viewer's day expanded and marked; other days fold to a one-line row | owner decision 2026-07-24 against a rendered three-option mockup |
| NOT trimmed-to-worked-days | loses on-page visibility of load-in/strike days a strike-only crew member legitimately uses |
| NOT left whole-show | that is the scan cost the item exists to fix |
| Fail-open to whole-show when no day resolves | §5 — matching is best-effort; a failed match must never cost the viewer the agenda |
| Native `<details>`/`<summary>`, no client JS | `components/crew/AgendaScheduleBlock.tsx` is a pure Server Component; `useState` would break that contract |
| Not a privacy feature | §1 — the unfilterable PDF is one tap above |
| Hoisting the visible-day derivation past `WrappedSection`'s error boundary is safe | `visibleShowDays` (`lib/crew/agendaDisplay.ts`) is TOTAL — zero `throw` sites in the file, `dates.showDays ?? []`, and every `DateRestriction.kind` branch returns. `resolveViewerContext` CAN throw, but already runs above the hoist target at `ScheduleSection.tsx:101`, so that exposure is pre-existing and unwidened by this work. |

## 2. The structural obstacle (do not skip)

`agendaArea` is built at `ScheduleSection.tsx:147`, but the viewer's visible-day set is derived **lower**, inside the `WrappedSection` render callback — drift warning comment at `ScheduleSection.tsx:197`, `allowedShowDays` at `components/crew/sections/ScheduleSection.tsx:201`, `visibleDays` at `components/crew/sections/ScheduleSection.tsx:202-206`. `AggregateDay`, `aggregateDays`, and `visibleShowDays` all live in `lib/crew/agendaDisplay.ts` (`lib/crew/agendaDisplay.ts:94`, `lib/crew/agendaDisplay.ts:113`, `lib/crew/agendaDisplay.ts:144`):

```
const allDays = aggregateDays(data.show.dates);
const allowedShowDays = new Set(visibleShowDays(data.show.dates, dateRestriction));
const visibleDays = dateRestriction.kind === "explicit"
  ? allDays.filter((d) => allowedShowDays.has(d.date) || dateRestriction.days.includes(d.date))
  : allDays;
```

So the derivation must be **hoisted** above `agendaArea`.

**CORRECTED in review R2 (MEDIUM): this DOES add a prop, and there is a second production caller.** An
earlier revision said "not a prop-threading change", which is true of the *derivation* but false of the
result — the viewer's day set has to reach `AgendaScheduleBlock`, whose props today are exactly
`{ extraction, label }` (`components/crew/AgendaScheduleBlock.tsx:51-54`). It gets one new OPTIONAL prop:

```ts
viewerDays?: ViewerAgendaDays; // default: { kind: "all" }
```

**The second caller is the admin Step 3 review preview** at
`components/admin/wizard/step3ReviewSections.tsx:3230`, which renders the same component with no viewer
context and must keep its current whole-schedule render. Making the prop REQUIRED would break that build;
making it optional without a specified default would let the admin preview fold rows or show a
meaningless "Your day" marker to an admin who has no assigned days. Hence: optional, defaulting to
`{ kind: "all" }`, which by THE MARKER RULE (§5) also means no marker — an admin previewing a show is
exactly the "no day is the viewer's" case, and the existing behaviour falls out of the rule rather than
needing a special branch. The admin caller is NOT edited by this change. Do not duplicate it — the existing comment calls `visibleShowDays` "the SINGLE SOURCE for the SHOW-DAY ∩ restriction set" and warns about drift, so a second derivation is exactly the drift it guards against.

**CONSTRAINT DISCOVERED 2026-07-25, load-bearing: the hoist must not move THROWING work.**
`WrappedSection` exists specifically to contain per-block render throws, and its own docstring
states the rule (`components/crew/WrappedSection.tsx:22-27`): "The throwable block is passed as a
`render: () => ReactNode` FUNCTION" so that "throwing work (the transform that can throw) lives
inside `render`." `aggregateDays(data.show.dates)` is inside that callback for that reason. Hoisting
it above `agendaArea` would move it OUTSIDE the containment boundary, so a malformed-date throw
would take down the whole section instead of degrading one block — silently reversing the guarantee
this component was built to provide.

Therefore hoist the **restriction** derivation only, never the aggregate.

**Correction to an earlier draft of this line (verified 2026-07-26).** It said `dateRestriction` at
`ScheduleSection.tsx:101` "cannot throw". That is false: `resolveViewerContext` DOES throw
`MalformedProjectionError`, and the comment directly above it at
`components/crew/sections/ScheduleSection.tsx:99-100` says the throw is placed outside
`WrappedSection` **on purpose**, "so the route-level infra arm catches it, not the per-block
fallback". The conclusion is unchanged and the reason is not: hoisting the restriction derivation is
safe not because nothing throws, but because that throw is ALREADY outside the boundary by design, so
the hoist adds no new exposure. Getting this reason right matters for the plan — a task author who
believes "nothing here throws" will happily hoist something that does.

`visibleShowDays` itself contains no `throw` (`lib/crew/agendaDisplay.ts:144-150`, verified) and reads
`dates.showDays ?? []`, so it is genuinely safe to evaluate above the boundary.

**CORRECTED (review R2, HIGH).** An earlier revision said the viewer's agenda day comes from
`dateRestriction` plus `todayIsoInShowTimezone`. That is wrong and dangerous: this feature marks the days
the viewer is ASSIGNED, which is a property of `dateRestriction` alone and does not depend on what day it
is now. A viewer assigned only May 6 who opens the page on May 4 must still see May 6 expanded and
marked. `todayIsoInShowTimezone` belongs to the separate "what is happening right now" surface and is NOT
an input here — the contract is `visibleShowDays(dates, dateRestriction)`, which takes no clock. The
viewer's day set also does NOT need `aggregateDays`. `visibleShowDays(data.show.dates,
dateRestriction)` is the hoistable piece. Any plan task that moves `aggregateDays` or `allDays`
above `agendaArea` is wrong on this point and must be rejected in plan self-review.

**The hoist is verified feasible, not assumed.** `visibleShowDays` needs exactly two inputs (`lib/crew/agendaDisplay.ts:144-147`): `dates` and `dateRestriction`. `dateRestriction` is destructured from `resolveViewerContext` at `components/crew/sections/ScheduleSection.tsx:101`, which sits **above** `agendaArea` in the same function body, and `data.show.dates` is available throughout. The gap was 40 lines at `0c2b9ad00` and 46 at `d62d620e8`; the durable fact is the ORDER, not the distance. So the three lines move up as-is with no reordering of any other statement and no new prop. If a later refactor moves `resolveViewerContext` below the agenda area, this section is void. Verify the order first: `git show origin/main:components/crew/sections/ScheduleSection.tsx | grep -n "resolveViewerContext(viewer\|const agendaArea"` and confirm the former's line number is the smaller one.

## 3. Matching, and why it must fail open

`lib/crew/agendaDayForToday.ts` already solves day→date matching, split across two functions:

- `parseIsoFromDayLabel` (`lib/crew/agendaDayForToday.ts:36`) parses a date-bearing heading into ISO. Collapses pdfjs glyph-split digits (`"2 4"` → `"24"`) FIRST, exact month-name match. No fallback of its own.
- The positional fallback lives inside `agendaSessionsForToday` (`lib/crew/agendaDayForToday.ts:47`) and fires only under FOUR conditions, all at `lib/crew/agendaDayForToday.ts:64-71`: `matched === null`, `!someDateParsed` (NO label in that extraction parsed), `showDays.length > 0 && showDays.every((d) => d != null)`, AND `ext.days.length === showDays.length`. The null-element guard is easy to miss and a day-set variant must carry it — a `dates` row with a null date otherwise indexes into a hole.

**No reusable day-SET matcher exists** — that function maps one `todayIso` and returns sessions. PR3 writes a day-set variant beside it, reusing `parseIsoFromDayLabel` and the same positional rule. Two constraints:

1. The positional fallback must index against the **full show day list**, never the viewer's subset — indexing a filtered list shifts every index and silently mismatches days.
2. **Fail open per link.** `hasAgenda` allows multiple PDFs; one may parse while another does not. When neither path resolves a day for this viewer, that link's block renders every day expanded (today's behaviour).
3. **Fail open on PARTIAL resolution too — corrected in review R2 (HIGH), and this is the finding most worth
   understanding.** An earlier revision defined fail-open only for the all-or-nothing case: zero resolved
   days. That leaves the dangerous middle unguarded. Concrete reachable scenario: the viewer works May 5
   and May 6; May 5's heading parses to an ISO date, May 6's heading reads `"Day 3"` and does not parse,
   and some OTHER heading in the extraction parsed — which disables the positional fallback, because its
   second condition is `!someDateParsed` (`lib/crew/agendaDayForToday.ts:64`). May 5 expands and is
   marked; **May 6, a day the viewer actually works, folds.** That is exactly the outcome §1.1 calls the
   worst this feature can produce, and a test that only covers total failure passes straight through it.

   **The rule: fold nothing unless EVERY day in the viewer's restriction was located in this extraction.**
   Let `R` = the viewer's restriction days that fall within the show's days, and `L` = the subset of `R`
   the matcher located in this extraction's day list. Fold only when `L` is complete — `|L| == |R|`.
   Otherwise return the fail-open variant and expand everything. Partial knowledge is treated as no
   knowledge, because a partially-correct fold silently hides a day the viewer needs while looking
   perfectly normal on screen.

   This makes the matcher's contract all-or-nothing per link, which is also what makes it testable: the
   completeness comparison is a single assertion, whereas "which days did we probably get right" is not.

## 4. The rendered change

Today each day in `AgendaScheduleBlock` is a plain `div` holding an `h3` and a `ul` of sessions (`components/crew/AgendaScheduleBlock.tsx:70-79`). Option C wraps each day in `<details>`:

- **Viewer's day:** `<details open>`, `<summary>` carries the existing `h3` content plus a "Your day" marker. Body renders exactly as today — no change below the summary.
- **Other days:** `<details>` closed. `<summary>` is the one-line row: day label, date, and a session count.
- **`dateRestriction.kind === "none"`, or no day resolved:** every `<details open>`, no marker. Fold affordance still present (the disclosure is the same element), so markup shape is uniform across all states — only `open` and the marker vary.

Precedent for the summary itself is `app/me/page.tsx:239-243`, which is already a `list-none` disclosure whose label carries a parenthesised count. PR3 follows that class list and **adds** `min-h-tap-min` (`--spacing-tap-min: 44px`, `app/globals.css:162`), which that precedent does not carry — this is a crew surface operated one-handed on a venue floor.

`list-none` matters for more than looks: a `<summary>` given `display: flex` loses its default disclosure triangle in WebKit, so the chevron is an explicit `aria-hidden` span rotated via `group-open:`/`[details[open]_&]`, never a bare CSS marker pseudo-element.

**The per-document label is NOT part of the fold.** `AgendaScheduleBlock` renders an optional `label` paragraph (`components/crew/AgendaScheduleBlock.tsx:62-70`, `data-testid="agenda-schedule-label"`) above the day list. `ScheduleSection` passes it only when `agendaPdfCount > 1` (`components/crew/sections/ScheduleSection.tsx:158`, counted at `components/crew/sections/ScheduleSection.tsx:142`), so two agenda PDFs produce two distinguishable blocks. That paragraph stays OUTSIDE every `<details>`, unchanged: it names the document, not a day. Folding it would hide which PDF a day belongs to, which is the opposite of what it exists for.

**Multi-PDF is real, and it is why matching fails open per link.** `hasAgenda` is `agendaLinks.some((link) => Boolean(link.fileId))` (`components/crew/sections/ScheduleSection.tsx:138`), and `agendaPdfCount` counts them, so a show can carry two or more agenda extractions. One may resolve a viewer day while another does not; each block decides independently.

## 5. Guard conditions

**THE MARKER RULE (single source of truth; later rows and sections reference it, never restate it).**
The "Your day" marker renders on a day only when it *distinguishes* — that is, when at least one day is
the viewer's **and** at least one day is not. If every day is the viewer's, or no day is, or there is
only one day at all, no marker renders anywhere.

Found during self-review: the first draft applied this reasoning to the lone-day case ("a marker
distinguishing one thing from nothing is noise") but marked every row in the all-days-are-yours case,
where the identical argument applies — four rows each saying "Your day" tell the viewer nothing they
could act on, and the feature exists to help them find their day AMONG others. Stating it once as a
rule also collapses three table rows that were being reasoned about independently, and makes the
`kind === "none"` row fall out of the same rule rather than being a separate special case: no
restriction and every-day-restricted look identical on screen, which is correct, because they are the
same situation for the viewer.

Folding is independent of marking and is NOT governed by this rule: a day folds iff it is not the
viewer's. So when no day is the viewer's, fail-open expands everything (§3); when every day is, nothing
folds because nothing is non-matching.

| Input state | Render |
| --- | --- |
| `confidence !== "high"` or `days.length === 0` | nothing — existing gate at `AgendaScheduleBlock.tsx:58`, unchanged |
| `dateRestriction.kind === "none"` | all days expanded, no folding, and no marker per THE MARKER RULE (no day is the viewer's) |
| `kind === "unknown_asterisk"` | unreachable — early return at `ScheduleSection.tsx:172` returns JSX that omits `{agendaArea}` entirely (the variable is built at `components/crew/sections/ScheduleSection.tsx:147` but never rendered on that branch) |
| `kind === "explicit"`, one day resolves | that day expanded + marked; others fold |
| `kind === "explicit"`, several resolve but not all | matching days expanded + marked; only non-matching fold |
| `kind === "explicit"`, ALL days resolve | all expanded, nothing folds, and no marker per THE MARKER RULE |
| `kind === "explicit"`, none resolve | ALL days expanded, no marker (fail open) |
| viewer's day is the only day in the extraction | nothing to fold, and no marker per THE MARKER RULE (cf. the DQ singleton-eyebrow precedent) |
| a folded day has zero sessions | still render its row with the count (`0 sessions`), so the fold is not silently empty |
| `day.date === null` | summary shows the label only; no empty date span. `AgendaScheduleBlock.tsx:74` already guards this for the expanded heading |

## 5.0 List bound and boundary behaviour (checklist item, answered rather than skipped)

The day list has **no artificial cap, and that is the decision** — folding IS the bound this feature
introduces. Before it, N days rendered N expanded blocks; after it, N-1 of them are one-line rows.
Adding a "show more" cap on top would re-hide the thing the viewer is scanning for and reintroduce
the problem in a second form.

**CORRECTED in review R2 (MEDIUM) — the previous claim was factually wrong.** It said days derive from
`data.show.dates`, so the count is the show's own length (2 to 10 in the fixture corpus) and a malformed
sheet could not inflate the list without inflating the day cards too. `AgendaScheduleBlock` actually maps
`normalizeAgendaExtraction(extraction).days` (`components/crew/AgendaScheduleBlock.tsx:70`) — the
EXTRACTION's days, which come from a parsed PDF and are unrelated to `show.dates`. Normalization applies
no cap to days or sessions. So a high-confidence extraction with 40 alternating day labels renders 40
rows while the show still shows four day cards below, and the two counts genuinely can diverge.

What that changes: nothing about the fold decision, which is per-day and works at any count. What it
changes is the honesty of this section — the row count is bounded by whatever the PDF parsed, not by the
show's length. The fold makes a long list *better* (N-1 one-line rows instead of N expanded blocks), so
this is not a reason to add a cap; it IS a reason not to claim a bound the data does not have. If a
40-row agenda ever appears in practice, capping is a new decision with its own mockup per the paragraph
below, not something to slip into implementation.

Boundary behaviour that IS specified, because it is reachable:

| Case | Render |
| --- | --- |
| one day total | expanded, and **no** "Your day" marker (a marker distinguishing one thing from nothing is noise) |
| every day is the viewer's | all expanded, no folded rows, and NO marker per THE MARKER RULE in §5 |
| no day is the viewer's | all expanded, no marker (fail open, §3) |
| more days than fit the viewport | the section scrolls; no row is dropped and no count is elided |

If a future show legitimately runs long enough that folded rows themselves need bounding, that is a
new decision with its own mockup — do not add a silent cap during implementation.

## 5.1 Dimensional Invariants

The fold introduces `<details>`/`<summary>` inside the block's `min-w-0` column. Tailwind v4 does NOT default `.flex` to `align-items: stretch`, so every parent→child width relationship is pinned explicitly.

| Parent | Child | Invariant | Guaranteeing class |
| --- | --- | --- | --- |
| `div[data-testid=agenda-schedule]` (`flex min-w-0 flex-col gap-4`) | each `<details>` | child width === parent content width | **`w-full`, plus `min-w-0`.** CORRECTED in review R2 (MEDIUM): the earlier row named `min-w-0` alone as the guarantee, which is wrong — `min-w-0` only permits shrinking below the content-based minimum, it does not make a flex item fill the cross axis. Under this project's non-stretch default (Tailwind v4 does not default `.flex` to `align-items: stretch`) a `<details>` would shrink to its summary's contents, leaving a short tap row instead of a full-width one — the exact failure this section exists to prevent. `w-full` supplies the width; `min-w-0` still needed so a long unbroken label cannot widen the column. |
| `<details>` | `<summary>` | summary width === details content width | `flex min-w-0 items-baseline` on the summary |
| `<summary>` | label / date / count / chevron | label may shrink; date, count, chevron never truncate | `min-w-0` + `wrap-break-word` on the label; `shrink-0 tabular-nums` on date and count, matching `components/crew/AgendaScheduleBlock.tsx:75` and `components/crew/AgendaScheduleBlock.tsx:87` |
| `<summary>` | "Your day" marker | never wraps and never truncates; it is the one cue the feature exists to deliver | `shrink-0` on the marker, so at 320px the LABEL absorbs the shortfall (it already carries `min-w-0 wrap-break-word`) rather than the marker |
| `<summary>` | tap target | rendered height ≥ 44px | `min-h-tap-min` |
| `<details>` | `ul` of sessions | body width === details content width, unchanged from today | existing `flex flex-col gap-2` |

**The `w-full` guarantee gets its own assertion, not just a class check.** Assert
`details.getBoundingClientRect().width === parentContentWidth` within 0.5px for EVERY row, at both
viewports. A class-presence check would pass on a `<details>` that shrank anyway because some ancestor
overrode the alignment, and the whole point of this table is that the class and the measured result are
separate claims.

Real-browser assertion (Playwright, NOT jsdom — jsdom computes no layout) at 320px and 390px,
measuring the **content** box via `getComputedStyle` padding subtraction, because
`getBoundingClientRect` alone is blind to x-padding (PR #586). Harness precedent:
`tests/e2e/agendaScheduleLayout.spec.ts` — but see §6.2: that spec is currently CI-dark, so wiring it
is part of this work rather than an assumption.

**Assert the marker row in BOTH open states.** A `<summary>` measured only while its `<details>` is
open proves nothing about the folded row, which is the state most of the days are in — and folded is
where the width pressure actually is, since every folded row shows label + date + count + marker on
one line. Measure collapsed first, then toggle open and re-measure.

## 5.2 Transition Inventory

**Corrected during self-review: there are FOUR states, not three.** The first version listed
`collapsed`, `expanded`, `expanded+marked` and computed 3 pairs — but its own compound row described
"the viewer's day collapsed BY the viewer", which is a fourth state the state list denied existed.
Marked-ness is orthogonal to open-ness, so the space is the product:

| | unmarked | marked (viewer's day) |
| --- | --- | --- |
| **collapsed** | other day, folded | viewer's day, collapsed by the viewer |
| **expanded** | other day, opened by the viewer | viewer's day, initial render |

**The marker lives on the `<summary>` row, so it persists while collapsed.** Stated explicitly
because it is what makes `collapsed+marked` reachable, and because putting the marker inside the
disclosure body instead would silently delete that state — a viewer who folds their own day would
lose the only cue telling them which day is theirs, which is the entire feature.

All 4*3/2 = 6 UNORDERED pairs. **Corrected during a second self-review pass:** the first version
listed six rows but they were a mix of directed transitions and pair-classes — two rows were the same
pair reversed, and two more overlapped — so "6 rows" did not mean "6 pairs". Each row below is one
unordered pair, with both directions considered.

| # | Pair | Animation, both directions |
| --- | --- | --- |
| 1 | collapsed+unmarked ↔ expanded+unmarked | the viewer toggling ANOTHER day. Instant both ways — native disclosure, no animation needed beyond the chevron. |
| 2 | collapsed+marked ↔ expanded+marked | the viewer toggling THEIR OWN day. Instant both ways, same as pair 1; the marker does not animate. |
| 3 | collapsed+unmarked ↔ collapsed+marked | **unreachable.** Marked-ness is decided server-side per day from `dateRestriction` and never changes without a new render. |
| 4 | expanded+unmarked ↔ expanded+marked | **unreachable**, same reason as pair 3. |
| 5 | collapsed+unmarked ↔ expanded+marked | **unreachable** — would require open-ness AND marked-ness to change together. |
| 6 | collapsed+marked ↔ expanded+unmarked | **unreachable**, same reason as pair 5. |

Two pairs are reachable and both are instant; four are unreachable because marked-ness is fixed at
render. If a future change makes the marker client-toggleable, pairs 3 to 6 become reachable and this
table is void — re-derive it rather than amending it.

**Mechanism note — `duration-fast` as a Tailwind class emits NOTHING in this repo.** Measured against
this checkout, not assumed:

```
grep -c "transition-duration-fast" app/globals.css   ->  0
grep -rn "duration-fast" components/ | grep -c className  ->  118
app/globals.css:223   --duration-fast: 120ms;
app/globals.css:419   --duration-fast: 0ms;      (inside @media (prefers-reduced-motion: reduce))
```

Tailwind v4 resolves `duration-<name>` from `--transition-duration-<name>`, which this project never
defines — it defines `--duration-*`. So `className="transition-transform duration-fast"` produces a
`transition-property` with **no duration from that class**, and it is invisible to the reduced-motion
block at `app/globals.css:417`, which only rewrites `--duration-*`. The 118 existing class-based sites
are pre-existing and out of scope here; this spec must not add a 119th.

Two acceptable mechanisms, and the implementation MUST pick one explicitly:

1. **Preferred — hand-written CSS in `app/globals.css` consuming `var(--duration-fast)`**, the way the
   existing accordion does at `app/globals.css:709-710`. Reduced motion then comes for free via the
   token rewrite, with no per-component opt-in, exactly as the comment at `app/globals.css:413-415`
   describes.
2. A Tailwind numeric duration (`duration-150`) PAIRED WITH an explicit `motion-reduce:duration-0`.
   Acceptable but worse: it re-states the reduced-motion policy locally instead of inheriting it.

The plan's transition-audit task must assert the chosen mechanism actually emits a
`transition-duration` in a real browser — a class that compiles to nothing looks identical to a
deliberately-instant transition in jsdom, and both look correct in review.

Non-pair transitions:

| Transition | Animation |
| --- | --- |
| chevron rotation on toggle | CSS `transform` on the `aria-hidden` chevron. **The duration MUST come from `var(--duration-fast)` in hand-written CSS, NOT from a Tailwind `duration-fast` class** — see the mechanism note below. Reduced motion is then free. |
| compound: sibling toggled while the viewer's day stays open | independent `<details>` elements, no shared state — each animates its own chevron only |
| compound: viewer's day collapsed by the viewer, then a sibling expanded | both independent; no reflow coupling, since each `<details>` is its own block in a `gap-4` column |
| compound: every day collapsed, including the marked one | allowed; the section still shows N summary rows and the marker, so it never reaches an empty state |

## 6. Copy and tokens

The marker reads **"Your day"**. No new color tokens; the marker reuses the existing eyebrow treatment (`text-xs`, `tracking-eyebrow` at `app/globals.css:146`, `text-text-subtle`), so no contrast meta-test row is required. Session count copy is `N sessions` / `1 session`, and `0 sessions` per §5.

No em dashes in any user-visible string (`DESIGN.md:350`); apostrophes are `&apos;` entities, matching `ScheduleSection.tsx:179`.

### Why "Your day" is resolved, not an open question

Possessive second person is the established crew-surface voice, not a new choice. Verified instances against `origin/main` @ `36638e063` (re-checked during self-review, all three still exact): `components/crew/RightNowHero.tsx:274` ("Your days are done"), `RightNowHero.tsx:301` ("Your days aren’t confirmed yet"), and `components/crew/sections/ScheduleSection.tsx:179`. The mockup used "Your day" and it matches.

Checked for an adjacency collision and there is none. `ScheduleSection.tsx:179` renders "Your days haven’t been confirmed yet" in the same file, but on the `unknown_asterisk` branch, which returns at `components/crew/sections/ScheduleSection.tsx:172` with JSX that omits the agenda area. The singular marker and the plural empty-state can never appear together, so "Your day" carries no "Your day / Your days" ambiguity on screen.

Devices are shared in practice (one show link, a picker per device), but the whole page is already rendered for the picked identity, so a possessive marker is no more presumptuous than the "Your days" heading above it.

## 6.1 One open question for implementation time, stated rather than assumed

Today each day's label is an `<h3>` (`components/crew/AgendaScheduleBlock.tsx:72`). Moving it inside `<summary>` is valid HTML — summary's content model is phrasing content optionally intermixed with heading content — but **whether the heading stays in the accessibility tree as a heading, and whether the disclosure's expanded/collapsed state is still announced, must be checked in a real browser, not asserted here.** Two shapes are acceptable and the layout task decides between them:

- `<summary><h3>Day 1</h3> <span>count</span></summary>` — keeps heading navigation, risks the summary's own name absorbing the heading.
- `<summary>` carrying the text directly, with the `<h3>` moved just inside the body — loses the heading from the collapsed row.

**EXTEND that spec; do not add a new one.** `tests/e2e/agendaScheduleLayout.spec.ts` exists
(verified 2026-07-25), and a NEW Playwright spec that no PR workflow names fails
`tests/ci/_metaE2eWorkflowCoverage.test.ts` by default — it either needs a workflow run command
naming it or a `LOCAL_ONLY_ALLOWLIST` row. Adding cases to the existing spec avoids that fan-out
entirely. Check whether the existing spec is itself in that allowlist before relying on it to gate
anything: an allowlisted spec runs locally but is not asserted to report on every PR.

Verify with the real-browser harness (`tests/e2e/agendaScheduleLayout.spec.ts`) using the accessibility snapshot, then pin whichever shape ships. Do NOT decide this from jsdom: it computes no layout and its accname support is not the arbiter here.

## 6.2 The real-browser harness this spec depends on is CI-dark, and the fix is narrower than two earlier revisions claimed

`tests/e2e/agendaScheduleLayout.spec.ts` is listed at
`tests/ci/_metaE2eWorkflowCoverage.test.ts:49` as `UNSEEN` — "not named in any workflow run command".
**No workflow runs it.** So every real-browser assertion §5.1, §6.1 and §7 rely on would pass locally, be
cited as proof in the handoff, and never execute in CI. A dark spec rots: the next upstream change to
`ScheduleSection` silently invalidates it and nothing reports.

**Two earlier revisions of this section were wrong, in different ways. Both are recorded because each
mistake is instructive and a third revision should not repeat either.**

Revision 1 named `crew-e2e.yml:141` as the target and called it a one-line append. Wrong:
`agendaScheduleLayout` is matched **only** by `tests/e2e/standalone.config.ts:36`, never by the default
`playwright.config.ts` under any project, and `crew-e2e.yml` runs `--project=…` under the DEFAULT config.
The append would have collected **zero tests and passed green**. The root `BACKLOG.md` documents this trap
at line 670: the failure "looks like a bad path, not a missing project". This spec is an instance of
`BL-STANDALONE-CONFIG-CI-DARK` (root `BACKLOG.md`, line 666), not of the lifecycle umbrella.

Revision 2 corrected the target to the standalone-config job
(`.github/workflows/modal-header-layout-e2e.yml`, which runs `pnpm test:e2e:modal-header` →
`playwright test --config=tests/e2e/standalone.config.ts …` per `package.json:52`) and said to DELETE the
allowlist row. The target is right; **deleting the row is wrong.** That workflow is path-gated —
`on: pull_request:` with a `paths:` filter at `.github/workflows/modal-header-layout-e2e.yml:45-47` — and
the scanner categorically rejects path-filtered workflows from `covered`
(`tests/ci/_workflowCoverageScan.ts:105` computes `hasPathsFilter`, `tests/ci/_workflowCoverageScan.ts:119` pushes the rejection reason
"pull_request.paths/paths-ignore filter"). So running the spec there does NOT make it `covered`. Deleting
its allowlist row would make the meta-test report the spec as **dark**, failing the dark assertion rather
than the shadowing one.

**The correct change, and it already has two precedents in the tree.** Run the spec in the path-gated
standalone job AND change its allowlist row's value from `UNSEEN` to `PATH_GATED`:

```
tests/ci/_metaE2eWorkflowCoverage.test.ts:38  "tests/e2e/admin-layout-dimensions.spec.ts":   PATH_GATED,
tests/ci/_metaE2eWorkflowCoverage.test.ts:39  "tests/e2e/pusher-alignment.layout.spec.ts":   PATH_GATED,
tests/ci/_metaE2eWorkflowCoverage.test.ts:40  "tests/e2e/section-header-layout.layout.spec.ts": PATH_GATED,
```

The last two are standalone specs run by this very job, wired exactly this way by the sibling batch. The
`PATH_GATED` reason string already says what the honest guarantee is: "runs when its filter matches, not
PR-blocking-capable per the scanner contract".

**So what this work buys, stated without inflation:** the spec runs automatically whenever a PR touches
the agenda component, the Schedule section, the spec itself, or `app/globals.css` — which is when it can
actually regress. It does NOT run on every PR, and a change that breaks it from an unrelated file will
not be caught. That is strictly better than dark and strictly worse than PR-blocking, and the handoff must
say so in those terms rather than writing "verified in a real browser" unqualified.

**Explicitly NOT in scope:** making the standalone job unconditional. That would run every standalone spec
on every PR, a cost decision affecting ~19 specs across `BL-STANDALONE-CONFIG-CI-DARK`, not something this
feature should decide unilaterally. The backlog item stays open and this spec's row moves from one
non-covered category to a better-justified one.

Four constraints from the scanner's own header (`tests/ci/_workflowCoverageScan.ts:6-12`) still bind
whatever job is used: the run command must not suppress the exit code; neither the job head nor the run
step may carry `if:` / `continue-on-error` (a sibling diagnostic step with `if: failure()` does NOT
disqualify — every real e2e workflow here has one, e.g.
`.github/workflows/crew-e2e.yml:143`); a path filter makes it `PATH_GATED` rather than covered, which is
the whole point above; and commands resolve transitively through `package.json` scripts, so extending a
`test:e2e:*` alias works as well as naming the spec inline.

## 7. Tests

- Real-browser layout assertion per §5.1 at 320px and 390px, asserting every row in the table.
- **Fail-open case** — an extraction whose labels do not parse and whose length ≠ `showDays` renders every day expanded. Highest-value test: a silent fold of the viewer's own day is the worst outcome this feature can produce.
- Null-element guard: a `dates` row containing a null date must not reach the positional fallback (§3, condition 3).
- Positional-fallback indexing asserted against the full day list, with a fixture whose viewer subset would shift indices if the filtered list were used — the assertion must FAIL if the implementation indexes `visibleDays`.
- **BOTH suppression cases of THE MARKER RULE (§5), not just one.** (a) a one-day extraction renders no
  "Your day" marker; (b) an extraction where EVERY day is the viewer's also renders no marker anywhere.
  Case (b) is the one the first draft got wrong — it specified all rows marked — so a test that covers
  only (a) would have passed against the defective spec. Catches: an implementation that marks per-day
  without ever asking whether the marker distinguishes anything.
- **The marker DOES render in the mixed case**, asserted alongside the two suppression cases. Without
  this, "no marker" passes trivially for an implementation that never renders the marker at all — the
  fail-closed direction of the same rule.
- `<summary>` carries `min-h-tap-min` and a visible focus ring, asserted in the real browser.
- Derive every expected day/count from fixture dimensions, never hardcode — a 2-day fixture must not be able to satisfy a 4-day assertion.

Added during self-review, from the corrected 4-state model in §5.2. Each names the failure mode it
catches, per the anti-tautology rule:

- **Marker survives the viewer collapsing their own day.** Toggle the marked `<details>` shut and
  assert the marker is still in the accessible tree on the summary row. Catches: an implementation
  that renders the marker inside the disclosure body, which deletes the `collapsed+marked` state and
  strips the only cue identifying the viewer's day from a viewer who folded it.
- **Every day collapsed reaches no empty state.** Collapse all N and assert N summary rows plus the
  marker remain. Catches: a "nothing expanded" branch that renders an empty-state placeholder over a
  section that legitimately has content.
- **The marker never truncates at 320px.** Assert the marker's content-box width equals its
  scrollWidth while the row is COLLAPSED (the folded row is where the width pressure is: label +
  date + count + marker on one line). Catches: a marker with `min-w-0` instead of `shrink-0`, which
  would ellipsize the cue rather than the label.
- **A day whose label is the empty string still renders a row.** Catches: a truthiness guard on the
  label that drops the whole `<details>`, silently reducing the day count and shifting any positional
  fallback below it.

## 8. Sibling-surface checks, run before drafting (4th verification pass)

Two claims in this draft are the shape that has already cost rounds elsewhere, so both were
re-verified against the live tree rather than carried forward.

**1. The `unknown_asterisk` unreachability claim holds.** Verified positively, not by absence:
`components/crew/sections/ScheduleSection.tsx:172` returns early, and the JSX it returns
(`components/crew/sections/ScheduleSection.tsx:173-182`) contains only the `schedule-unconfirmed` placeholder div — `{agendaArea}` appears
exactly once in the file, at `components/crew/sections/ScheduleSection.tsx:187`, inside the OTHER return. So the agenda block genuinely cannot
render on that branch, and the guard row saying so is accurate. (PR2's spec had an "unreachable by
construction" claim that turned out false; that is why this one is cited to both line ranges.)

**2. The `<details>` fold cannot collide with the new-tab announcement guard shipped in PR2.** That
guard treats a `<details>` without a provably-true `open` as HIDING its content, so an external
anchor inside a folded day row would be reported — correctly, since closed `<details>` content is
`display: none` and unreachable. Checked whether any such anchor exists in the surface being folded:

- `grep -rln "_blank" components/crew/ app/show/` returns exactly two files:
  `components/crew/sections/VenueSection.tsx` and `components/crew/primitives/SourceLink.tsx`.
- Neither is reachable from the fold: `SourceLink` is not imported by `ScheduleSection.tsx` or
  `AgendaScheduleBlock.tsx`, and `VenueSection` is a different section entirely.
- `components/agenda/AgendaEmbed.tsx` (the block's sibling, at that path — NOT `components/crew/`)
  contains no `_blank`.

So no exemption is needed and no announcement can be swallowed by the fold. **If implementation adds
an external anchor inside a folded row, that changes** — the guard will fail by default, which is the
intended behaviour, and the fix is to hoist the anchor out of the fold rather than to exempt it.


## 9. Fourth citation pass, 2026-07-26 (every load-bearing claim re-checked)

Run against `origin/main` while PR2 was in close-out. Everything below was confirmed at the cited
line, so the plan can rely on it without re-deriving:

| Claim | Verified |
| --- | --- |
| `resolveViewerContext` sits ABOVE `agendaArea` — the hoist's whole premise | `components/crew/sections/ScheduleSection.tsx:101` vs `components/crew/sections/ScheduleSection.tsx:147`, same function body |
| The four positional-fallback conditions, incl. the null-element guard | `lib/crew/agendaDayForToday.ts:64-71`, exactly as written |
| `parseIsoFromDayLabel` is separately exported and reusable | `lib/crew/agendaDayForToday.ts:36` |
| `visibleShowDays` takes only `dates` + `dateRestriction` and cannot throw | `lib/crew/agendaDisplay.ts:144-150`, no `throw` in body |
| Day rows are `div > h3 + ul` today | `components/crew/AgendaScheduleBlock.tsx:70-79` |
| The `confidence !== "high"` / empty-days gate | `components/crew/AgendaScheduleBlock.tsx:58` |
| `day.date === null` already guarded in the heading | `components/crew/AgendaScheduleBlock.tsx:74` |
| `agendaScheduleLayout.spec.ts` is CI-dark | confirmed — `tests/ci/_metaE2eWorkflowCoverage.test.ts:49`, value `UNSEEN` |
| the wiring target | **NOT `crew-e2e.yml:141`** (that was revision 1's error — the spec is matched only by `tests/e2e/standalone.config.ts:36`, so the append would collect zero tests). Target is the path-gated standalone job, with the allowlist row's value moving `UNSEEN` → `PATH_GATED`, not deleted. See §6.2. |

**One correction was needed** and is recorded inline in §2: the earlier claim that `dateRestriction`
"cannot throw" was false. It throws `MalformedProjectionError`, deliberately outside `WrappedSection`
so the route-level infra arm catches it. The hoist is still safe, for a different reason.

**Note for the impeccable gate, so it is not mistaken for new scaffolding:** the existing day heading
at `AgendaScheduleBlock.tsx:72` is an uppercase `tracking-eyebrow` label. That is a pre-existing
pattern carrying real information (the day), not a decorative eyebrow added by this change. The fold
should reuse it rather than introduce a second label style.
