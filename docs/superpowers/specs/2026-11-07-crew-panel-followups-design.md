# Crew panel follow-ups: type size, repeated titles, card headers, wide Today

**Status:** ratified by the product owner on 2026-11-07, from real before and after renders (<https://claude.ai/artifact/8NzBjYsV7GaQb8YNFyUKoy>). Option A for the wide Today block. Shipped autonomously.

Closes `CREWPANEL-TYPE-SCALE-1`, `CREWPANEL-DOUBLE-TITLE-1` and `CREWPANEL-MIXED-CARD-HEADERS-1` and question 2 of `docs/superpowers/plans/2026-11-05-crew-page-redesign-pr-c.md:452`. The redesign spec stays canonical: `docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md` takes dated amendments on its lines 130, 131, 132 and 290, and stays 532 lines.

## 1. Why

Crew read this page on a phone on a show floor. Since PR B the section bodies are the admin popup's, at the admin's compact sizes: 10px labels, 11px times. Every section also opens by repeating its own name, and three sections mix two card header styles. On a desktop the Today block's right column ends 269px above the left on the seeded show (measured at 1280: left 1027, right 758).

## 2. Goals, non-goals, anti-goals

Goals: crew section text reads one step larger and never below 12px; a section's name prints once; every card in a section shares one header; the wide Today block has no column of air beside the run of show.

Non-goals: the home's cards keep their eyebrow headers (Run of show, Show notes, the quick fact tiles, spec §4.4, §4.5). The wide nav, the sheet chrome and search are unchanged. Copy does not change.

Anti-goals: any change to the admin popup's rendered DOM (`tests/components/admin/wizard/adminSectionDom.test.tsx` and its 402 goldens pass with no regeneration). Any change to the phone's reading order on Today.

## 2.1 Resolved scope: do not relitigate

The owner chose these from real renders on 2026-11-07: Option A for the wide Today block, the taller page included; labels 12px, supporting lines 13px, main values 15px, in section bodies only; repeated titles removed with the "In sheet" row kept; crew-only cards on the panel card's header. Section 12's limits are accepted.

## 3. Type scale

One rule set in `app/globals.css`, outside every `@layer`, so it beats Tailwind's utilities layer. It keys on a new attribute, `data-crew-section-type`, set on the two elements that hold a section's body: the sheet body (`components/crew/CrewSectionSheet.tsx:480`) and the wide stack's section (`components/crew/CrewSections.tsx:1020`). The home is in neither, and neither is the admin popup.

```css
[data-crew-section-type] {
  --text-xs: 0.8125rem;
  --text-sm: 0.9375rem;
}
[data-crew-section-type] .text-\[11px\] {
  font-size: 0.8125rem;
}
[data-crew-section-type]
  :is(.uppercase, .text-\[8px\], .text-\[9px\], .text-\[10px\], .text-\[10\.5px\], .text-\[0\.625rem\]) {
  font-size: 0.75rem;
}
```

The order matters. Both rules have equal specificity and `components/crew/primitives/DayCard.tsx:88` carries `text-[11px]` and `uppercase` together, so the label rule comes last and that weekday is a 12px label.

| Text | Now | After |
| --- | --- | --- |
| Uppercase labels, avatar initials, chips | 8 to 12px | 12px |
| Supporting lines (`text-xs`, `text-[11px]`) | 11 to 12px | 13px |
| Main values (`text-sm`) | 14px | 15px |
| `text-base` and larger | unchanged | unchanged |

Redefining the two theme variables moves every `text-xs` and `text-sm` under the attribute with no markup change, so the shared bodies' class strings stay as the goldens pin them. Line height follows, because `--text-xs--line-height` and `--text-sm--line-height` are unitless (`app/globals.css:179`, `app/globals.css:181`). The probe behind the mockup injected exactly this CSS into the live page.

Literal sizes below 12px are listed by name, because a class cannot be compared by value in CSS. Today's complete set: `components/show-panels/TransportBody.tsx:173` (8px), `components/crew/sections/TransportSection.tsx:191` (9px), `components/show-panels/FieldRowList.tsx:34`, `components/show-panels/HotelCardBody.tsx:397` and `components/crew/primitives/DayCard.tsx:130` (10px), `components/crew/sections/TransportSection.tsx:185` (10.5px), `components/show-panels/RoomsBody.tsx:280` (0.625rem), and `text-[11px]` at `components/show-panels/TransportBody.tsx:195`, `components/show-panels/TransportBody.tsx:207`, `components/show-panels/TransportBody.tsx:224`, `components/show-panels/TransportBody.tsx:230`, `components/show-panels/TransportBody.tsx:333`, `components/show-panels/TransportBody.tsx:415`, `components/show-panels/TransportBody.tsx:431` and `components/crew/primitives/DayCard.tsx:88`. Two guards hold it: a real-browser walk asserts no text node under the attribute computes below 12px, and a static test walks `components/show-panels` and `components/crew` from disk and fails on a literal size below 12px the rule set does not name.

The rule is plain CSS rather than a new `@theme` token because a warm Turbopack build drops a new token and the class that uses it (`BACKLOG.md:375`). The rule set adds no token.

## 4. One title per section

`PanelCard` (`components/show-panels/PanelCard.tsx:33-34`) stops printing its registry label by default. The title is shown only where it tells two cards apart.

```ts
type PanelIcon = ComponentType<{ className?: string }>;
type PanelCardHeading =
  | { sectionId: ShowSectionId; title?: never; icon?: never }
  | { sectionId?: never; title: string; icon: PanelIcon };
type PanelCardProps = PanelCardHeading & {
  /** Print the title. Default: false with `sectionId`, true with `title`. */
  titled?: boolean;
  /** The title's search line id (the Diagrams heading). */
  titleSearchTarget?: string;
  cardId?: string;
  actions?: ReactNode;
  children: ReactNode;
};
```

- **Untitled.** No chip and no `h3`. The header renders only when `actions` is present, holding the actions at the right. The card keeps its search group: the first child is `<span hidden data-search-group="">{label}</span>`, because the parity harness requires a group heading in the region (`tests/search/_parity.ts:224-225`) and `hidden` keeps it out of the accessibility tree, so heading navigation hears the name once.
- **Titled.** Today's header, unchanged, with `titleSearchTarget` on the `h3` as `data-search-target`.
- **Null, empty.** `title` is a required non-empty constant at every call site. `actions` undefined with no title renders no header.

`titled` by call site:

| Card | Heading | `titled` |
| --- | --- | --- |
| Venue, Event details, Crew, Contacts, Agenda, Hotels, Rooms, Pack list, Billing | `sectionId` | false (default) |
| Transport | `sectionId="transport"` | true when "Your flight" renders above it, else false |
| Crew schedule's times card | `title={SCHEDULE_CALL_TIMES_TITLE}`, `ClockIcon` | false |
| Facilities, Venue status, Your flight, Diagrams | `title`, their existing glyph | true (default) |

The schedule's card is the same defect and was found by the probe below: `SCHEDULE_CALL_TIMES_TITLE` is "Crew Schedule" (`components/crew/sections/scheduleRows.ts:141`) under the section's "Crew schedule" (`lib/showSections/registry.ts:54`). It passes `title` rather than `sectionId` so the hidden group keeps the constant the search entries name.

**Heading levels.** An untitled card has no `h3`, so a heading inside it moves up one level and the outline stays `h2` to `h3` with no skip (`tests/e2e/crew-wide-nav.spec.ts:228-232` reads the rendered outline). Three headings do this: the Event details group title (`components/crew/sections/EventSection.tsx:112`, `titleAs`), the room name (`components/crew/sections/RoomsSection.tsx:130`, `nameAs`) and the agenda day label (`components/show-panels/AgendaScheduleBlock.tsx:133`, a literal `h4` today). `titleAs` and `nameAs` widen to accept `"h3"` (`components/show-panels/EventDetailsBody.tsx:54`, `components/show-panels/RoomsBody.tsx:59`), `AgendaScheduleBlock` takes `dayHeadingAs?: "h3" | "h4"`, default `"h4"`, and the crew passes `"h3"` to all three. Every default is the admin's output, so its DOM does not change. No other `h4` sits in a section body: the sweep is `grep -rnE '<h[3-6]\b|"h[3-6]"' components/show-panels components/crew/sections`.

Venue prints a third copy, its 10px "Venue" label (`components/show-panels/VenueBody.tsx:117-122`). `VenueBody` takes `nameLabel?: boolean`, default true, and the crew passes false. The admin's output does not change.

Probe, every section at 390 on the seeded show, leaf elements whose text equals the sheet's `h2`: Venue 2, Event details 1, Crew 1, Contacts 1, Crew schedule 1, Agenda 1, Hotels 1, Rooms 1, Billing 1, Transport 0 (the panel card absent for this viewer). Pack list was gated out that day.

## 5. One card header

Facilities and Venue status (`components/crew/sections/VenueSection.tsx:222`, `components/crew/sections/VenueSection.tsx:242`), "Your flight" (`components/crew/sections/TransportSection.tsx:135`), Diagrams (`components/crew/DiagramsBlock.tsx:72`) and the schedule's times card (`components/crew/sections/ScheduleSection.tsx:297`) move from `SectionCard` to `PanelCard`. Their `data-card-id` wrappers stay, so `cardId` is omitted and region lookups read the same element. Every header action moves with its card (spec line 328).

Tests that read these cards move with them, including the geometry and outline readers: `tests/e2e/crew-page.spec.ts:1276` and `tests/e2e/crew-page.spec.ts:4699` look for a `section-card` ancestor, `tests/e2e/crew-wide-nav.spec.ts:215` walks `section-card` and asserts more than three titles, and `tests/e2e/crew-page.spec.ts:3888` measures Billing's chip and `h3`, which no longer exist. `tests/e2e/_wifiPasswordRowLiveEntry.tsx:58` is a standalone harness of the Facilities card, so it takes `PanelCard` and the `data-crew-section-type` attribute, or it measures a card production no longer draws; `tests/e2e/wifi-password-row.layout.spec.ts:235` reads it. The plan lists every reader by command.

`SectionCard` stays for the home (`components/crew/CrewRunOfShowCard.tsx:160`, `components/crew/sections/HomeSection.tsx:102`) and the dev page. The glyphs in `components/crew/icons/sectionIcons.tsx` already take `className` (`components/crew/icons/sectionIcons.tsx:183`), so `PanelCard` draws them at the registry icons' `size-4`.

## 6. Wide Today block

Option A. `TODAY_PACKED` (`components/crew/CrewSections.tsx:315-328`) stops being gated on `runCard === null` (`components/crew/CrewSections.tsx:975`) and applies always. The run card leaves `crew-today-lead` (`components/crew/CrewSections.tsx:998`) and becomes the lead's next sibling, in a slot: `<div data-testid="crew-today-run" className="min-w-0 empty:hidden lg:basis-full">`. DOM order is unchanged: day row, pass, run of show, quick facts, show notes. So is the phone.

`TODAY_PACKED` gains two rules, both under the same `has-data-[testid=crew-quick-facts]` condition: the slot takes `col-span-2`, and its child's `mb-4` (`components/crew/CrewRunOfShowCard.tsx:153`) goes to 0, as the lead's last child's already does. The block gains `lg:flex-wrap`, for the rows below with no quick facts. In the grid it has no effect.

Wide states, with QF the quick facts and Run the rendered card. `runCard` non-null can still render nothing (`components/crew/CrewSections.tsx:174`), so a state is decided by what renders; `empty:hidden` removes the slot then.

| QF | Run | Notes | Row 1 | Row 2 | Row 3 |
| --- | --- | --- | --- | --- | --- |
| yes | yes | yes | lead, QF | Run, full width | Notes, full width |
| yes | yes | no | lead, QF | Run, full width | none |
| yes | no | yes | lead, QF | Notes, full width | none (as today) |
| yes | no | no | lead, QF | none | none (as today) |
| no | yes | yes | lead, full width | Run, full width | Notes, full width |
| no | yes | no | lead, full width | Run, full width | none |
| no | no | yes | lead, Notes | none | none (as today) |
| no | no | no | lead, full width | none | none (as today) |

Row 1 of the no-QF states comes from flex wrapping: the slot's `basis-full` breaks the line, and `lg:flex-1` takes each line's width.

Measured with this layout injected at 1280 on the seeded show: day row and pass 128 to 497, quick facts 128 to 497, run of show 513 to 968, show notes 1000 to 1206 (the 32px gap is the `mb-4` this section removes). The block is 147px taller after that repair.

## 7. Mode boundaries

| Element | Compact | Wide | Admin popup |
| --- | --- | --- | --- |
| Type scale | inside the sheet body | inside each stacked section | none |
| Home cards | old scale, eyebrow headers | old scale, eyebrow headers | none |
| Untitled panel cards | yes | yes | none (admin chrome is `ModalSectionChrome`) |
| Today grid | none, one column | section 6 | none |

## 8. Dimensional invariants

No fixed-height parent is involved. Two relationships are layout claims, and a real-browser test pins them: under quick facts and a run of show, the slot's and the notes' widths equal the block's within 0.5px, and the slot's top is the lower of the lead's and the quick facts' bottoms plus the 16px row gap.

## 9. Transition Inventory

Every change here is static CSS or static markup per render, so nothing here animates.

| From | To | Treatment |
| --- | --- | --- |
| Compact one column | Wide grid | instant, at the 1024 breakpoint, as today |
| Transport titled | Transport untitled | instant: "Your flight" appears or leaves on a refresh |
| Today grid with a run card | Today grid without one | instant: the slot goes `empty:hidden` on a refresh |

Compound: the run card's day crossfade (`components/crew/CrewRunOfShowCard.tsx:175`) is inside the card, so a breakpoint crossing during a crossfade moves the card and leaves the fade running, as it does today.

## 10. Flags

| Prop | Storage | Write path | Read path | Effect |
| --- | --- | --- | --- | --- |
| `PanelCard.titled` | none, a prop | the table in section 4 | `PanelCard` | prints or hides chip and `h3` |
| `VenueBody.nameLabel` | none, a prop | `components/crew/sections/VenueSection.tsx` | `VenueBody` | prints or omits the "Venue" label |
| `AgendaScheduleBlock.dayHeadingAs` | none, a prop | `components/crew/sections/AgendaSection.tsx:97` | `AgendaScheduleBlock` | the day label's element, `h3` on the crew page |
| `data-crew-section-type` | none, an attribute | sheet body, wide section | `app/globals.css` | the type scale |

## 11. Acceptance criteria

- AC-1: at 390 and 1280, no visible text node under `data-crew-section-type` computes below 12px, in every section the seeded viewer can open.
- AC-2: sampled sizes hold: a `.uppercase` label 12px, a `text-xs` line 13px, a `text-sm` value 15px; the same classes on the home keep 12px and 14px.
- AC-3: `pnpm vitest run tests/components/admin/wizard/adminSectionDom.test.tsx` passes with no golden changed.
- AC-4: no leaf element in a section body repeats the section's name, except Transport's title under "Your flight".
- AC-5: the search parity harness passes for every section, and an untitled card's group marker is `hidden`.
- AC-6: Facilities, Venue status, Your flight and Diagrams render a `crew-panel-card` with an `h3` at 16px, and no `section-card` remains in a section body.
- AC-7: section 6's table holds in a real browser for all eight states.
- AC-8: at compact widths the block's DOM and visual order is day row, pass, run of show, quick facts, show notes.
- AC-9: no horizontal overflow at 320, 390, 768, 1024 and 1280.
- AC-10: the static size walk fails when a literal below 12px is added to a section component without a rule.
- AC-11: the rendered outline on the wide page skips no level, and a schedule weekday computes 12px.

## 12. Documented limits

- Row 1 of the Today grid can still differ in height, either way: a show with one or two quick facts has a shorter right side than the pass, and at 1024, where the quick fact tiles wrap, the pass column ends 178px above the quick facts on the seeded show. This is the state `TODAY_PACKED` already accepted (critique F7). The block no longer has a full column of air, only that row's difference.
- Focus follows the grid's rows through `reading-flow: grid-rows`, which Chromium honours. Safari and Firefox keep DOM order, so there Tab reaches the run of show before the quick facts above it.
- Text-only zoom at 200% gives the Schedule sheet a 13px sideways scroll at 390. Page zoom at 200% and 400% is clean.
- Option A makes the page taller and moves Show notes below the run of show, which the owner chose knowing it.
- The CSS names literal classes. A size added through an inline style, a new unit, a variant (`sm:text-[10px]`), a line-height suffix (`text-[10px]/4`) or an important flag escapes the rule set while the static walk still counts it as named, and the walk reads only `components/show-panels` and `components/crew`. The browser walk catches any of these when a seeded section renders it.
- An untitled card with actions keeps a short action row, so the saving at 390 is about 25px rather than the row's full height.
