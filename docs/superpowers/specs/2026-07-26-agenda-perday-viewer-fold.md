# Agenda per-viewer day folding (option C)

> ## AS SHIPPED — authoritative over anything below it
>
> This document was written before implementation and revised across seven pre-code review rounds
> plus four whole-diff rounds. Body text that contradicts this table is superseded; the body is
> retained because the reasoning is the point, but **where they disagree, this table is correct.**
> Added after review R4 enumerated five contradictions that survived being fixed one at a time —
> a per-instance sweep kept generating the next one, so the class is closed with a single
> authority instead.
>
> | Contested point | AS SHIPPED |
> | --- | --- |
> | Matcher input | Takes **raw JSONB** and normalizes internally via `normalizeAgendaExtraction`, mirroring `agendaSessionsForToday`. Body text requiring an already-normalized extraction is superseded. |
> | Matcher output | **Row indices** — `{kind:"all"} \| {kind:"subset"; rows: ReadonlySet<number>}`. Never dates: `AgendaDay.date` is always null in production (`lib/agenda/extractAgendaSchedule.ts` is its sole constructor). |
> | Positional fallback | **Not implemented, deliberately.** Ratified in §3; tracked as `BL-AGENDA-POSITIONAL-DAYSET-FALLBACK`. Every other passage requiring it is superseded. |
> | Throw contract of the hoist | `visibleShowDays` is total, but the hoisted block is wrapped in **capture-and-rethrow** anyway, because the matcher normalizes raw JSONB. The rethrow happens inside the render callback so `WrappedSection` still records its ledger entry and renders the tile fallback. Passages calling the hoisted work non-throwing describe `visibleShowDays` alone, not the block. |
> | Unrestricted viewer (`dateRestriction.kind === "none"`) | `{kind:"all"}` — every day expanded, **no marker**. The two readings in the body ("every day is theirs" / "no day is theirs") reach the same place: nothing distinguishes one day, so THE MARKER RULE suppresses the marker. "Every day is theirs" is the accurate one. |
> | CI wiring | `.github/workflows/standalone-e2e.yml` runs the WHOLE standalone config **unfiltered on every PR**; both agenda specs are covered with **no allowlist row**. Every instruction to edit the retired modal-header workflow, add a `paths:` entry, or set a `PATH_GATED` row is superseded. |
> | CI enforcement strength | Runs on every PR, but **not merge-blocking**: no e2e job is among branch protection's twelve required contexts. Enforcement is procedural. |



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
export type ViewerAgendaDays =
  | { kind: "all" } // render every day expanded, and no marker
  | { kind: "subset"; rows: ReadonlySet<number> }; // INDICES into extraction.days

viewerDays?: ViewerAgendaDays; // default: { kind: "all" }
```

**`rows`, not ISO dates — see §2.5 fact 1.** `AgendaDay.date` is always `null` in production, so a set of
dates gives the component nothing to match on. Indices are what it can actually use: it maps
`extraction.days` and already has the index in hand (`components/crew/AgendaScheduleBlock.tsx:70`
destructures `(day, di)`).

**An empty `rows` set must be treated as `{ kind: "all" }` by the consumer, defensively.** The type does
not make `{ kind: "subset"; rows: <empty> }` unconstructible — an earlier revision claimed it was
"unreachable", which is a convention, not a guarantee, and a caller can produce it. The natural
implementation ("fold iff my index is absent from the set") would fold EVERY day including the viewer's,
which is the worst outcome this feature can produce. So the component treats an empty `rows` as "all",
and a test asserts that directly rather than trusting the producer.

**The two arms are a discriminated union on purpose, and `{ kind: "subset"; rows: <empty> }` must be
unreachable.** An earlier plan draft described the fail-open case as "returns the empty set". That is the
one ambiguity this feature cannot contain: an empty `Set` reads equally well as *no day is the viewer's, so
fold everything*, which silently hides the viewer's own day. The discriminant makes the dangerous reading
fail to compile rather than fail in production. If the matcher resolves nothing, it returns
`{ kind: "all" }`.

**THREE distinct upstream causes converge on `{ kind: "all" }`, and that convergence is deliberate rather
than three unhandled cases:**

| Cause | Why "all" is right |
| --- | --- |
| the admin Step 3 preview passes no `viewerDays` | there is no viewer, so no day is anyone's day |
| `dateRestriction.kind === "none"` — an unrestricted viewer | every day is theirs, which by THE MARKER RULE (§5) marks nothing |
| the matcher could not locate every restriction day (§3 constraint 3) | partial knowledge is treated as no knowledge |

All three render identically: every day rendered as `<details open>` (UNIFORM markup — §4; NOT plain rows, and not the absence of `<details>`), no marker. So no consumer needs a
special branch for any of them, and THE MARKER RULE is not consulted separately — "all" already means
"nothing distinguishes", which is the rule's own suppression condition. A reviewer looking for the
admin-preview case or the no-restriction case will not find dedicated code, and that absence is correct.

**The second caller is the admin Step 3 review preview** at
`components/admin/wizard/step3ReviewSections.tsx:3230`, which renders the same component with no viewer
context and must keep its current whole-schedule render. Making the prop REQUIRED would break that build;
making it optional without a specified default would let the admin preview fold rows or show a
meaningless "Your day" marker to an admin who has no assigned days. Hence: optional, defaulting to
`{ kind: "all" }`, which by THE MARKER RULE (§5) also means no marker — an admin previewing a show is
exactly the "no day is the viewer's" case, and the existing behaviour falls out of the rule rather than
needing a special branch. The admin caller is NOT edited by this change. Do not duplicate it — the existing comment calls `visibleShowDays` "the SINGLE SOURCE for the SHOW-DAY ∩ restriction set" and warns about drift, so a second derivation is exactly the drift it guards against.

**CONSTRAINT WITHDRAWN — review R4 (CRITICAL) exposed it as resting on a false premise, and the truth is
simpler.** Three revisions of this section forbade hoisting `aggregateDays` above `WrappedSection` on the
grounds that it performs "throwing work" a malformed date could trigger, so only the restriction
derivation could move. R4 pointed out that the R3 completeness domain then REQUIRED the aggregate above
`agendaArea`, making the spec self-contradictory. Checking which side was wrong:

```
grep -c "throw" lib/crew/agendaDisplay.ts   ->  0
imports:  shouldHideGenericOptional, stripAgendaUrls  (+ types only)
```

**`aggregateDays` contains no `throw` statement.** It is `push`/`sort`/`map` over a `Map`, in a file with zero
`throw` statements and no import that introduces one. R4 read that as "cannot throw" and withdrew the
constraint on that basis; R5 then showed the reading was wrong, and R7 showed the same wrong reading had
spread to four more statements. **All of `aggregateDays`, `visibleShowDays` and `visibleDays` read `showDays` unvalidated, so ALL of them can throw at runtime** even though none contains a `throw` statement — `.filter`, spread, `for…of` and `.sort` all fault on a non-array or a non-string element (review R7, HIGH: five live statements still called this work total). That is precisely why the hoisted block needs the capture-and-rethrow containment; "total" is a statement about the source text, not the runtime domain.

**The withdrawal was itself too broad — review R5 (HIGH) found the throw I did not look for.** The R4
check was `grep -c throw` → 0, which proves only that no `throw` STATEMENT exists. It does not prove the
function cannot throw, and `aggregateDays` can:

```
lib/data/getShowForViewer.ts:399   const datesDecoded = decodeJsonbColumn<ShowRow["dates"]>(showRowDb.dates);
```

That is a CAST, not a validation — nothing checks the shape. So `dates.showDays` is typed `string[]` but at
runtime holds whatever the JSONB held, and two lines in `aggregateDays` are then reachable faults:
`for (const d of dates.showDays ?? [])` throws `TypeError` on a non-null non-iterable, and
`.sort(([a], [b]) => a.localeCompare(b))` throws if a truthy non-string date became a `Map` key (a numeric
`20260505` passes the `if (!date) return` filter).

**So the original constraint was right, for a reason nobody had stated.** The claim it needed was never
that `aggregateDays` contains a throw, because it does not. The claim it needed was that `aggregateDays`
can throw on malformed JSONB no layer validates. Three revisions defended the constraint with the weaker
argument, R4 then demolished that weaker argument and concluded the constraint was fake, and both steps
went wrong the same way: reasoning about the code's TEXT instead of its runtime domain.

**The resolution keeps the hoist and adds containment, which this feature's posture already implies.**
Wrap the hoisted derivation in a `try`/`catch` that yields `{ kind: "all" }`:

```ts
let viewerDays: ViewerAgendaDays = { kind: "all" };
try {
  const allDays = aggregateDays(data.show.dates);
  // … existing allowedShowDays / visibleDays lines, unmodified …
  viewerDays = /* per-link matcher, §3 */;
} catch {
  viewerDays = { kind: "all" }; // malformed show dates = no knowledge = fail open
}
```

Malformed show dates are exactly the "partial knowledge is no knowledge" case §3 already fails open on, so
the catch is not a new policy — it is the existing one applied to a new fault source. The Schedule section
keeps rendering, the agenda expands whole, and nothing is silently folded.

**Two corrections to that containment story, both from review R6 (CRITICAL).**

*First, the scope of the promise.* R6 objected that "malformed show dates keep Schedule rendering" is false
unless the catch also covers existing anchor work. Checked, and the conclusion is the opposite of what it
looks like: `const anchors = resolveKeyTimes(...)` runs at
`components/crew/sections/ScheduleSection.tsx:117` — **already above `agendaArea` and already outside the
`WrappedSection` callback** — and it reads `showDays` just as unvalidatedly
(`lib/crew/resolveKeyTimes.ts:75` calls `showDays.indexOf`, which throws on a non-array). Note that
`lib/crew/resolveKeyTimes.ts:145` is *not* the fault: `.length` on a non-array is `undefined`, not a throw.

So malformed `showDays` can ALREADY escape the boundary today, at line 117, before this feature exists. The
hoist therefore adds no new exposure — the same conclusion §2 already reaches for
`resolveViewerContext`, and for the same reason. What the promise must say honestly is narrower: **the
catch keeps THIS feature from adding a fault path, and the agenda fails open rather than propagating.** It
does not repair the pre-existing exposure at line 117, which is out of scope and left as-is.

*Second, and this one is a real defect.* Hoisting `aggregateDays` out of the callback removes ITS throw from
`WrappedSection`'s ledger (`components/crew/WrappedSection.tsx:86-100`), which records the fault and renders
a tile fallback. A bare `catch` would convert a recorded day-card render fault into a silently empty day
list — strictly worse than today, because the operator alert disappears.

**So the catch must fail open for the agenda AND re-surface the fault for the day cards.** Capture the error
rather than swallowing it, and rethrow it inside the callback so `WrappedSection` still sees it:

```ts
let viewerDays: ViewerAgendaDays = { kind: "all" };
let derivationError: unknown = null;
if (dateRestriction.kind !== "unknown_asterisk") {
  try {
    // the three existing visibleDays lines, unmodified
    viewerDays = /* per-link matcher, §3 */;
  } catch (err) {
    derivationError = err;      // agenda: fail open, below
    viewerDays = { kind: "all" };
  }
}
// …inside the WrappedSection render callback:
if (derivationError !== null) throw derivationError;   // day cards: ledger + tile fallback, unchanged
```

The agenda expands whole and the day-card path behaves exactly as it does today, including the ledger
record and the alert. Fail-open is the right posture for the fold; it is NOT the right posture for
swallowing an infra fault someone needs to see.

**Also skip the derivation entirely on the `unknown_asterisk` path (R5, HIGH).** That branch returns a
placeholder and renders no agenda at all (§5), so aggregating dates and running per-link matching for it is
work whose result is discarded — and, before this fix, exposure taken for nothing. Guard the derivation with
the same condition the early return uses.

**Better still, the live code already computes exactly what this feature needs.** The existing
`WrappedSection` callback at `components/crew/sections/ScheduleSection.tsx:193-207` derives:

```ts
const allDays = aggregateDays(data.show.dates);
const allowedShowDays = new Set(visibleShowDays(data.show.dates, dateRestriction));
const visibleDays: AggregateDay[] =
  dateRestriction.kind === "explicit"
    ? allDays.filter((d) => allowedShowDays.has(d.date) || dateRestriction.days.includes(d.date))
    : allDays;
```

and its own comment at `components/crew/sections/ScheduleSection.tsx:194-195` states the intent —
"Intersect the restriction against the FULL aggregate (travel / set / showDays / travelOut — not just
showDays)". That is `R`. The viewer's day set is not something this feature must invent; it already exists
one scope below the agenda area, computed correctly including travel days.

**So the change is: hoist those three existing lines above `agendaArea`, unmodified, and read
`R = new Set(visibleDays.map((d) => d.date))`.** No new domain expression, no `restrictionAllows` helper,
no second derivation to drift from the first. The drift-guard comment at
`components/crew/sections/ScheduleSection.tsx:200` keeps its meaning because the code it guards is the
same code, just evaluated earlier in the same function body.

What genuinely can throw stays where it is: `resolveViewerContext` at
`components/crew/sections/ScheduleSection.tsx:101` throws `MalformedProjectionError` and already runs
ABOVE the boundary by design (`components/crew/sections/ScheduleSection.tsx:99-100`: "INTENTIONALLY outside
Wr…" so the route-level arm catches it). The hoist adds no new exposure because the hoisted lines add no
throw.

## 2.5 SPIKE — measured facts that invalidated two earlier contract revisions

This section exists because the matching contract took findings in two consecutive review rounds. The
project rule for a design-correctness vector that survives repeated rounds is to stop patching prose and
probe instead, so these are **measured** facts, each with the command or citation that produced it. They
reshape the contract in §3, and any later revision that contradicts one of them is wrong.

**1. `AgendaDay.date` is ALWAYS `null` in production.** `lib/agenda/extractAgendaSchedule.ts:653` is the
only place an `AgendaDay` is constructed, and it hardcodes `date: null`:

```
days.push({ dayLabel: label ?? "", date: null, sessions: [session] });
```

`normalizeAgendaExtraction` only validates and passes the field through
(`lib/agenda/normalizeAgendaExtraction.ts:39` and `lib/agenda/normalizeAgendaExtraction.ts:47`), so nothing ever fills it.

**Scope of that claim, narrowed after review R4 (HIGH).** It is true of the CURRENT EXTRACTOR's output,
not as a render-boundary invariant. `normalizeAgendaExtraction` validates opaque JSONB and preserves any
string it finds (`lib/agenda/normalizeAgendaExtraction.ts:39` accepts `null` or `string`, `lib/agenda/normalizeAgendaExtraction.ts:47` passes it
through), so a row written by an older extractor, a forward-compatible writer, or a hand edit CAN carry a
non-null date. **The non-null branch is therefore live and must keep working** — an implementer must not
treat `components/crew/AgendaScheduleBlock.tsx:74`'s truthy arm as dead code.

**What still follows regardless.** Every day the CURRENT extractor produces has `date: null`, so the
component cannot rely on dates to identify rows, and a matcher returning ISO dates would match nothing on
freshly-extracted data — **the matcher must return row indices into `extraction.days`.** An earlier
revision returned `ReadonlySet<string>` of ISO dates; on current production data that could not have
worked at all.

**2. Day identity comes only from `dayLabel`, and in the live corpus it parses.**
`parseIsoFromDayLabel` (`lib/crew/agendaDayForToday.ts:36`) needs a full date-bearing label. The
representative real labels from the 6-PDF corpus are all date-bearing and all parse
(`tests/crew/agendaDayForToday.test.ts:19-30`, e.g. `"Tuesday, March 2 4 , 202 6"` → `2026-03-24`,
including pdfjs glyph-split digits); `"Day 1"` and `"Friday"` are the documented null cases at
`tests/crew/agendaDayForToday.test.ts:31`. So label matching is the primary path and it works on real
data — this feature is feasible, which was worth confirming before redesigning around it.

**3. The viewer's restriction can include days OUTSIDE `showDays`.**
`effectiveViewerDateRestriction` (`lib/crew/stageSchedule.ts:48`) builds `{ kind: "explicit", days:
workedDays }` from `aggregateDays(dates)` (`lib/crew/stageSchedule.ts:56`, returned at `lib/crew/stageSchedule.ts:66`), and
aggregate days include travel-in and travel-out, not just show days.

**Consequence:** an earlier revision defined the completeness domain as
`new Set(visibleShowDays(...))` — the show-day intersection — specifically to handle an out-of-show
assignment. That was backwards: it DROPS a travel day the viewer is genuinely assigned, so completeness
passes while that day folds. The domain must be the viewer's restriction days intersected with the
**aggregate** day set, not the show-day set.

## 3. Matching, and why it must fail open

`lib/crew/agendaDayForToday.ts` already solves day→date matching, split across two functions:

- `parseIsoFromDayLabel` (`lib/crew/agendaDayForToday.ts:36`) parses a date-bearing heading into ISO. Collapses pdfjs glyph-split digits (`"2 4"` → `"24"`) FIRST, exact month-name match. No fallback of its own.
- The positional fallback lives inside `agendaSessionsForToday` (`lib/crew/agendaDayForToday.ts:47`) and fires only under FOUR conditions, all at `lib/crew/agendaDayForToday.ts:64-71`: `matched === null`, `!someDateParsed` (NO label in that extraction parsed), `showDays.length > 0 && showDays.every((d) => d != null)`, AND `ext.days.length === showDays.length`. The null-element guard is easy to miss and a day-set variant must carry it — a `dates` row with a null date otherwise indexes into a hole.

> **RATIFIED AMENDMENT (implementation, whole-diff review R2 MEDIUM): the positional fallback is
> DELIBERATELY NOT IMPLEMENTED.** The reviewer correctly observed the shipped matcher has no
> aggregate-list parameter and fails open wherever labels do not parse, so the four-condition
> fallback described just below is absent, along with its planned tests. That is a change to this
> spec, recorded here rather than left as a silent omission.
>
> Three reasons, in order of weight:
>
> 1. **Its trigger cannot occur in the known corpus.** The fallback fires only when NO label in the
>    extraction parsed (`!someDateParsed`). The R3 spike measured the 6-PDF corpus: every label is
>    date-bearing and every one parses (`tests/crew/agendaDayForToday.test.ts:19-30`). The branch
>    would ship unexercised by any real input.
> 2. **It folds on position rather than evidence, in the state of least knowledge.** Every other
>    path folds because a date was matched. This one would fold because a count lined up, precisely
>    when nothing about the document was understood. This rule has now folded a day the viewer works
>    in FOUR distinct input shapes across review (partial location, duplicate dates, an
>    unidentifiable row, a row naming two dates); each was a path that folded on weaker evidence than
>    it appeared to. A fifth such path is not worth an unreachable feature gain.
> 3. **Fail-open is the correct behaviour for that input anyway.** The cost is that a viewer whose
>    agenda uses purely positional labels sees the whole show expanded — today's behaviour, and the
>    outcome §1.1 names as acceptable. The cost of the alternative is folding the wrong day.
>
> The text below is retained as the accurate description of the EXISTING `agendaSessionsForToday`
> fallback, which is unchanged and still in use for its own purpose. It is no longer a requirement
> on the new matcher. Filed as `BL-AGENDA-POSITIONAL-DAYSET-FALLBACK` if the corpus ever gains
> positional-label documents.

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

   Stated as SETS of ISO date strings, deliberately — not as counts of matched extraction rows, which two
   reachable inputs would break:

   - `R` = the viewer's restriction dates intersected with the **aggregate** day set:
     `new Set(visibleDays.map((d) => d.date))`, reading the EXISTING hoisted `visibleDays` (§2) rather than
     recomputing anything.

     **No null filter and no dedup needed.** `AggregateDay.date` is typed `string`, not `string | null`
     (`lib/crew/agendaDisplay.ts:96`), because `aggregateDays`' `push` helper drops falsy dates before they
     enter its map (`lib/crew/agendaDisplay.ts:116`), and that `Map` already dedupes by date
     (`lib/crew/agendaDisplay.ts:113-121`). The `Set` here is purely for O(1) membership lookup.

     **This also settles the positional-fallback domain, which review R4 (HIGH) found contradictory.** Two
     different lists were in play: the existing fallback in `agendaSessionsForToday` gates on `showDays`
     and carries a null-element guard (`lib/crew/agendaDayForToday.ts:64`), while an earlier revision of
     this spec told the new matcher to index the full `AggregateDay[]`, which has no nulls to guard. Both
     the completeness domain and the positional index basis are now the SAME list — the hoisted
     `visibleDays`' parent `allDays` (the full aggregate, chronologically sorted, non-null by
     construction). The new matcher therefore does NOT need a null-element guard, because the list it
     indexes cannot contain one; the guard remains necessary only in the pre-existing `showDays`-based
     function, which this work does not change. Stating which list each rule uses is the whole point —
     conflating them shifts every index.
     **NOT `visibleShowDays`** — see §2.5 fact 3. An earlier revision used the show-day intersection
     specifically to neutralise an out-of-show assignment, and that was backwards: stage-derived
     restrictions are BUILT from `aggregateDays` (`lib/crew/stageSchedule.ts:56`, returned at `lib/crew/stageSchedule.ts:66`) and
     legitimately include travel-in and travel-out dates, so intersecting with `showDays` DROPS a day the
     viewer is actually assigned. Completeness would then pass while that day folds.

     The aggregate set is the correct domain because it is the same set the day cards below are built
     from, so "the viewer's days" means the same thing in both places.
   - `L` = the set of **dates** in `R` that the matcher located in at least one extraction day. `L` is a
     set of DATES even though the matcher's OUTPUT is row indices (§2.5 fact 1) — the two representations
     do different jobs and conflating them is what an earlier revision got wrong. "At least one" matters:
     an extraction can legitimately carry two blocks for the same date, and counting located ROWS would
     make `|located| > |R|` on a duplicate. Worse, in the R3 scenario — restriction May 5 + May 6, two
     May 5 headings, `"Day 3"` for May 6 — counting rows gives `2 == 2` and wrongly declares completeness,
     folding May 6. Counting distinct DATES gives `|L| = 1 ≠ 2 = |R|` and correctly fails open.

   Fold only when `L` covers `R` — and since `L ⊆ R` by construction, that is exactly `L.size === R.size`.
   Otherwise return the fail-open variant and expand everything. Partial knowledge is treated as no
   knowledge, because a partially-correct fold silently hides a day the viewer needs while looking
   perfectly normal on screen.

   **A fourth condition, found by spiking the rule rather than by review.** Five review rounds did not name
   this input, and a throwaway implementation of the rule folded a day the viewer works on it:

   > The viewer is assigned May 5 and June 25. The agenda PDF has a June 25 block. But `show.dates` does
   > NOT list June 25, so the aggregate does not contain it. `R` therefore excludes June 25, `L` matches
   > `R` on May 5 alone, completeness passes — **and the June 25 row folds even though the viewer works
   > it.**

   The sheet and the PDF disagree about which dates the show has. That is partial knowledge, and this
   section's own posture says partial knowledge is no knowledge. So: **if any extraction day parses to a
   date that is in the viewer's restriction but NOT in the aggregate, fail open.**

   Note what that guard does NOT do. A restriction date absent from the aggregate AND absent from the
   extraction stays harmless — nothing folds on it, and there is no disagreement to detect, so folding
   proceeds normally. The guard fires only when the extraction actually carries a block for a restriction
   date the show data lacks. Spiked both ways to confirm the discrimination holds:

```
extraction has a June 25 block, aggregate does not, viewer works it  ->  fail open  (was: folded it)
restriction has June 25, extraction does not mention it              ->  folds normally, unchanged
R3 scenario / duplicates / travel day / nothing-parses               ->  all unchanged
```

   Both edge cases above get their own test in the plan; neither is hypothetical — a duplicated day block
   is ordinary PDF output, and an out-of-show restriction day appears whenever a crew member's assignment
   spans a travel day the extraction does not cover.

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
| `kind === "explicit"`, **every** restriction day LOCATED, and some extraction day is not the viewer's | the located days expanded + marked; the rest fold |
| `kind === "explicit"`, **every** restriction day located, and they are ALL of the extraction's days | all expanded, nothing folds, no marker per THE MARKER RULE |
| `kind === "explicit"`, **any** restriction day NOT located | ALL days expanded, no marker — fail open per §3 constraint 3. **This row supersedes the "one day resolves" and "several resolve but not all" rows an earlier revision had here**, which said to fold the rest and would therefore have folded a day the viewer works whenever its label did not parse. Partial location is not partial folding; it is no folding. |
| `kind === "explicit"`, no restriction day located | ALL days expanded, no marker (the degenerate case of the row above) |
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

**Test-id inventory — the fold introduces four, and they must be named here or the assertions have
nothing to select.** The component today carries only `agenda-schedule`, `agenda-schedule-label`,
`agenda-session`, `agenda-track` and `agenda-drift` (verified by grep), none of which identifies a day
row. The plan's layout task asserts "every documented `data-testid`", so this is that list:

| New test id | On | Why the assertions need it |
| --- | --- | --- |
| `agenda-day-<i>` | each `<details>`, `i` = index in `extraction.days` | the per-row width assertion (`details.width === parent content width`) needs to select rows individually; the index mirrors the existing `key={`${day.dayLabel}-${di}`}` at `components/crew/AgendaScheduleBlock.tsx:71` and the repo's indexed-testid convention |
| `agenda-day-summary-<i>` | each `<summary>` | the 44px tap-target and both-open-states assertions measure the summary, not the details |
| `agenda-day-marker-<i>` | the "Your day" marker | THE MARKER RULE's suppression cases assert absence, which needs a selector that can be absent rather than a text search that could match prose elsewhere |
| `agenda-day-count-<i>` | the session count on a folded row | the zero-sessions case asserts `0 sessions` renders; scoping it prevents matching a count elsewhere in the page |

Indexed, not keyed by date, because per §2.5 fact 1 the date is `null` for every day the current extractor
produces — a date-keyed test id would collapse to the same value on every row.

| Parent | Child | Invariant | Guaranteeing class |
| --- | --- | --- | --- |
| `div[data-testid=agenda-schedule]` (`flex min-w-0 flex-col gap-4`) | each `<details>` | child width === parent content width | **`w-full`, plus `min-w-0`.** CORRECTED in review R2 (MEDIUM): the earlier row named `min-w-0` alone as the guarantee, which is wrong — `min-w-0` only permits shrinking below the content-based minimum, it does not make a flex item fill the cross axis. Under this project's non-stretch default (Tailwind v4 does not default `.flex` to `align-items: stretch`) a `<details>` would shrink to its summary's contents, leaving a short tap row instead of a full-width one — the exact failure this section exists to prevent. `w-full` supplies the width; `min-w-0` still needed so a long unbroken label cannot widen the column. |
| `<details>` | `<summary>` | summary width === details content width | `flex min-w-0 items-baseline` on the summary |
| `<summary>` | label / date / count / chevron | label may shrink; count and chevron never truncate; **the date never truncates for any well-formed value but degrades rather than breaking the row for a malformed one** | `min-w-0` + `wrap-break-word` on the label; `shrink-0 tabular-nums` on count, matching `components/crew/AgendaScheduleBlock.tsx:87`. The date gets `shrink-0 max-w-[12ch] truncate` — see the note below. |
| `<summary>` | "Your day" marker | never wraps and never truncates; it is the one cue the feature exists to deliver | `shrink-0` on the marker, so at 320px the LABEL absorbs the shortfall (it already carries `min-w-0 wrap-break-word`) rather than the marker |
| `<summary>` | tap target | rendered height ≥ 44px | `min-h-tap-min` |
| `<details>` | `ul` of sessions | body width === details content width, unchanged from today | existing `flex flex-col gap-2` |

**Why the date is capped — review R4 (HIGH) found the previous row self-contradictory.** It promised the
date is `shrink-0` AND never truncates AND the summary stays inside 320px, while §5.0 requires an
over-long date to be survivable. Those cannot all hold: an unbounded `shrink-0` child forces its parent
wider, full stop. And the over-long case IS reachable — per §2.5 fact 1 as narrowed, `day.date` is any
string the JSONB carried, so a hand-edited or legacy row can hold one.

The resolution is a cap, not a promise. `max-w-[12ch] truncate` on the date means:

- Every well-formed value fits and never truncates. The rendered forms are short (`2026-05-04` is 10
  characters, and the display strings the component already emits are shorter still), so `12ch` clears
  them with room and the "never truncates" guarantee holds for all real data.
- A malformed value truncates with an ellipsis instead of pushing the row past the viewport. Degrading one
  field beats breaking the layout of every row beside it.

So the boundary assertion is testable as written: a 200-character date must leave the summary within the
viewport, and it does — by truncating. The assertion and the invariant now agree.

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
| 3 | collapsed+unmarked ↔ collapsed+marked | **REACHABLE — corrected in review R3 (MEDIUM).** Instant, no animation. |
| 4 | expanded+unmarked ↔ expanded+marked | **REACHABLE**, same mechanism as pair 3. Instant. |
| 5 | collapsed+unmarked ↔ expanded+marked | **REACHABLE** in principle (both dimensions change at once) but only by the pair-3 mechanism composed with a user toggle. Instant either way. |
| 6 | collapsed+marked ↔ expanded+unmarked | **REACHABLE**, same as pair 5. Instant. |

**All six pairs are reachable, and every one is instant.** An earlier revision called pairs 3 to 6
unreachable on the grounds that marked-ness "never changes without a new render". That sentence is true and
still misleading: a new render happens WITHOUT a page load. `ShowRealtimeBridge → router.refresh()`
re-renders `_CrewShell` with all section bodies fresh while the client controller stays mounted, and the
freshness invariant at `components/crew/CrewSections.tsx:13-19` states exactly that. So a sheet edit that
changes the viewer's assignment from May 5 to May 6 flips May 5 expanded+marked → collapsed+unmarked and
May 6 the other way, on a page nobody reloaded.

**Does a user's toggle survive a refresh that rewrites `open`? MEASURED — review R5 (HIGH) flagged this as
needing execution, so it was executed rather than argued.** The worry was real: the documents require a
user-toggled state to persist across `router.refresh()` while new server data simultaneously changes which
rows carry `open`, with no client JS available to mediate. Three cases, rendered and re-rendered:

```
user opens a row the server said was closed, then a refresh with UNCHANGED props
  -> row stays open   (React diffs against its last rendered value, not the DOM, so it does not touch it)

refresh where the assignment MOVED (open prop changes on two rows)
  -> the old row closes, the new row opens   (server authority wins where it actually changed)

user opens a row AND the refresh now also says open
  -> stays open, no conflict
```

**So both requirements hold at once, and neither needs a mechanism we write.** Persistence is guaranteed
for every row whose server-side open-ness did not change, because React leaves untouched attributes alone.
Server authority is guaranteed exactly where open-ness did change. The reconciliation IS the mechanism, and
the no-client-JS ratification survives.

Scope of that measurement, stated honestly: it exercises React's reconciliation under jsdom, which runs the
same reconciler as a browser. It does NOT exercise the native disclosure widget's own click behaviour —
that is a browser concern, covered by the real-browser assertions, and unaffected by the reconciliation
question here.

Two consequences worth stating rather than discovering:

- **A `<details>` the viewer opened stays open across the refresh.** Open-ness is a DOM property of the
  element, not React state, so a re-render that produces the same element does not reset it. That is the
  desired behaviour — a refresh must not collapse what the viewer opened — but it means open-ness and
  marked-ness genuinely vary independently at runtime, which is the whole reason the state space is a
  product rather than a list.
- **The marker must update on refresh even while the row stays open.** The plan's transition audit covers
  this as a compound case: mark/unmark a row whose `<details>` is open, and assert both the marker change
  and that the row did not collapse.

**Mechanism note — `duration-fast` as a Tailwind class emits NOTHING in this repo.** Measured against
this checkout, not assumed:

```
grep -c "transition-duration-fast" app/globals.css   ->  0     <- the load-bearing fact
app/globals.css:223   --duration-fast: 120ms;
app/globals.css:419   --duration-fast: 0ms;      (inside @media (prefers-reduced-motion: reduce))
```

**The count of existing class-based uses has been REMOVED from this spec, deliberately.** Three revisions
carried a number (118, then 124 from a reviewer's broader pattern, then 124/148/185 from R4's) and every
round disputed it, because the value depends entirely on grep flavour and scope: `className`-filtered
versus every mention, `components/` versus `components/ app/`, line-count versus `git grep`'s per-file
sums. It was decoration — nothing in this spec's reasoning depends on how MANY sites already do the wrong
thing. What matters is the mechanism, which both the author and two independent review rounds verified the
same way: `--transition-duration-fast` is undefined, so the utility emits no duration. That single
`grep -c` above is reproducible and sufficient. A number that costs a finding per round and carries no
argument should not be in the document.

Tailwind v4 resolves `duration-<name>` from `--transition-duration-<name>`, which this project never
defines — it defines `--duration-*`. So `className="transition-transform duration-fast"` produces a
`transition-property` with **no duration from that class**, and it is invisible to the reduced-motion
block at `app/globals.css:417`, which only rewrites `--duration-*`. The existing class-based sites are pre-existing and out of scope here; what matters is that this spec adds no new one.

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


> **SUPERSEDED AT IMPLEMENTATION (merge of `origin/main` c7c5625c2).** Everything in this section
> about the retired modal-header-layout-e2e workflow, its `paths:` filter, and a `PATH_GATED`
> registry row is obsolete: `origin/main` DELETED that workflow, retiring seven per-feature e2e
> workflows for one unfiltered `.github/workflows/standalone-e2e.yml` that runs the WHOLE of
> `tests/e2e/standalone.config.ts` on every PR. Both agenda specs were already named in that
> config's `testMatch`, so they are now covered unfiltered with NO allowlist row — the registry's
> `shadowing` check FAILS on an allowlisted spec that is covered. The shipped outcome is stronger
> than what this section prescribes. Retained unedited as the reasoning of record.

Revision 2 corrected the target to the standalone-config job
(the retired modal-header-layout-e2e workflow, which runs `pnpm test:e2e:modal-header` →
`playwright test --config=tests/e2e/standalone.config.ts …` per `package.json:52`) and said to DELETE the
allowlist row. The target is right; **deleting the row is wrong.** That workflow is path-gated —
`on: pull_request:` with a `paths:` filter at the retired modal-header-layout-e2e workflow (was 45-47) — and
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
- **NO null-element-guard test for the new matcher** (review R6, CRITICAL: this inventory row previously demanded one). The EXISTING `agendaSessionsForToday` keeps its guard because it gates on `showDays`; the new matcher's domain is the aggregate list, whose `date` is typed `string` and non-null by construction, so such a test could only be written by constructing an impossible typed input. §3 is the authority.
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
| The four positional-fallback conditions of the EXISTING function, incl. its null-element guard (the NEW matcher needs no such guard -- its domain is non-null `AggregateDay[]`; see §3) | `lib/crew/agendaDayForToday.ts:64-71`, exactly as written |
| `parseIsoFromDayLabel` is separately exported and reusable | `lib/crew/agendaDayForToday.ts:36` |
| `visibleShowDays` takes only `dates` + `dateRestriction` (it CAN throw on unvalidated `showDays`; see §2) and cannot throw | `lib/crew/agendaDisplay.ts:144-150`, no `throw` in body |
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
