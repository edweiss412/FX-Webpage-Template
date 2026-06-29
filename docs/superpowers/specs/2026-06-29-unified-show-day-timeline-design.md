# Unified Show-Day Timeline (Crew Today View) — Design Spec

**Status:** Draft → self-review → cross-model adversarial review (autonomous-ship; user spec/plan-review gates WAIVED per AGENTS.md brainstorming gate — user approved 2026-06-29).
**Scope:** Frontend-only, crew **Today** view. Render-time derivation. **No** DB write, **no** parser/extractor change, **no** re-extraction, **no** `EXTRACTOR_VERSION` bump, **no** schema, **no** new API route.
**Routing:** UI work → Opus + impeccable v3 dual-gate (invariant 8).

---

## 1. Problem & goal

On a show day, a crew member's day is split across two places: the **"Run of show"** card (sheet-sourced operational entries — Load In, Set, Strike) and, separately, the **event agenda** (the PDF program — Keynote, panels), reachable only via a "Full agenda" chip that jumps to the Schedule tab. There is no single chronological "what's my whole day" view.

**Goal:** On the Today view, render **one chronological timeline** that interleaves the crew's operational run-of-show entries for today with the event agenda's sessions for today — with the two sources **visually distinguished** so a crew member instantly reads *their job* (authoritative) vs *event context* (best-effort), and a mis-parsed agenda line can never masquerade as a crew instruction.

### 1.1 Ratified decisions (from brainstorming, 2026-06-29)

| # | Decision |
|---|---|
| D1 | **Today view ONLY.** The Schedule tab (all-days) is out of scope (separate future spec). |
| D2 | **Distinguished rendering.** Crew entries emphasized; agenda sessions muted "event" rows. |
| D3 | **Conservative dedup, crew wins.** Suppress an agenda session **only** on same-start-minute **AND** normalized-title match; any uncertainty → show both. |
| D4 | **Day matching:** parse a real date out of `dayLabel` and match today's ISO; **guarded positional fallback** only when agenda-day-count **exactly** equals show-day-count; else no agenda that day. |
| D5 | **Render-time derivation only** — no DB/extractor/parser change, no re-extraction. |
| D6 | **Agenda-only day** (today has agenda sessions but zero crew entries) **still renders** the card. |
| D7 | **Tracks omitted** from the Today timeline (the full agenda, with tracks, is one chip-tap away). |
| D8 | **Today's card title stays "Run of show"** (now genuinely the complete run of the show day). The parked "Crew Schedule" rename applies only to the Schedule tab + Step 3, not Today. |

---

## 2. The two data sources (verbatim contracts)

### 2.1 Crew operational entries (authoritative, per-viewer gated)
`runOfShow[todayIso].entries` — `AgendaEntry` (`lib/parser/types.ts:345-353`):
```ts
type AgendaEntryKind = "agenda" | "strike" | "loadout";          // :344
type AgendaEntry = { start: string; finish?: string; trt?: string; title: string; room?: string; av?: string; kind?: AgendaEntryKind };
```
- `start` is the `normClock` output from the sheet's SHOW DAY TIME column (`lib/parser/blocks/scheduleTimes.ts:40-53`): `[H]:?[MM]? [AM/PM]`, no leading-zero hour, **minutes optional** (bare hour `"9 AM"` is valid), AM/PM uppercased. Examples: `"4:00 AM"`, `"9 AM"`, `"12:00pm"`, `"2:00 PM"`.
- Already **per-viewer gated** before it reaches the card: `TodaySection.tsx:211-214` computes `todays = (unknown_asterisk ? [] : scheduleEntriesForViewer(runOfShow[todayIso].entries, { transportVisible }))`. `scheduleEntriesForViewer` (`lib/crew/agendaDisplay.ts:59-64`) = `displayableEntries(...)` (strips empty/sentinel titles) minus `loadout` entries unless `transportVisible`. **Strike + SET + agenda-kind entries are always visible; loadout is transport-gated.**

### 2.2 Event agenda sessions (best-effort, ungated)
`agenda_links[].extracted` — `AgendaExtraction` / `AgendaDay` / `AgendaSession` (`lib/agenda/types.ts:1-15`):
```ts
type AgendaSession = { time: string; title: string | null; room: string | null; tracks: {…}[]; drift: string | null };
type AgendaDay = { dayLabel: string; date: string | null; sessions: AgendaSession[] };   // date ALWAYS null from extractor
type AgendaExtraction = { confidence: "high" | "low"; corrections: number; days: AgendaDay[]; extractorVersion: number; sourceRevision?: string };
```
- `time` is `fmtClock` output (`lib/agenda/extractAgendaSchedule.ts:61`): `[H]:[MM] [AP]`, **always with minutes**; sessions are ranges `"9:00 AM – 9:40 AM"` (en-dash) or a single `"9:00 AM"`.
- `AgendaDay.date` is **always `null`** from the real extractor (`lib/agenda/extractAgendaSchedule.ts:575` — `days.push({ dayLabel, date: null, sessions })`). The day identity lives in `dayLabel` (a human string).
- **Ungated** — there is no per-viewer filter on agenda sessions anywhere; the program is the same for everyone.
- **Renderable only when high-confidence**: `confidence === "high"` with `days.length > 0` (`lib/agenda/normalizeAgendaExtraction.ts:50-56` validates `typeof extractorVersion === "number"` ONLY — never compares to `EXTRACTOR_VERSION`; the high-confidence+non-empty gate lives in the preview builder). Low-confidence → `days: []` → no agenda contribution.

---

## 3. Architecture — three pure modules + a thin TodaySection wiring

The merge is a **render-time derivation** in pure, independently-testable modules; `TodaySection` only wires inputs and chooses the render path. No data is written; the extractor/parser are untouched.

```
TodaySection (render)
  ├─ agendaSessionsForToday(extractions, showDays, todayIso)   ── lib/crew/agendaDayForToday.ts   (NEW, pure)
  │     ├─ parseIsoFromDayLabel(dayLabel)                       ── (same module, pure)
  │     └─ → AgendaSession[] | []   (high-conf, day-matched, today only)
  ├─ buildShowDayTimeline(crewEntries, agendaSessions)         ── lib/crew/showDayTimeline.ts       (NEW, pure)
  │     ├─ clockToMinutes(s)                                    ── lib/time/clockToMinutes.ts        (NEW, pure)
  │     └─ → TimelineItem[]   (discriminated, sorted, deduped)
  └─ <ShowDayTimelineList items=…>                             ── components/crew/primitives/ShowDayTimelineList.tsx (NEW)
```

**Activation rule (blast-radius minimization):** the merge path activates **only when `agendaSessionsForToday` returns ≥1 session.** When there is no agenda for today, TodaySection renders the **existing `RunOfShowList(todays)` unchanged** — so the common crew-only path is **byte-identical** to today (no reorder, no new sort, no regression). The new sort/dedup/distinguished rendering exists solely on days that actually have agenda to interleave.

### 3.1 `lib/time/clockToMinutes.ts` (NEW)

```ts
/** Minute-of-day for a clock string in EITHER the sheet (normClock) or agenda (fmtClock) format.
 *  Accepts: "9 AM", "9:00 AM", "12:00pm", "2:00 PM"; for a range ("9:00 AM – 9:40 AM") parses the START.
 *  Returns null on anything it cannot confidently place (no meridiem, garbage). */
export function clockToMinutes(raw: string): number | null;
```
- Take the substring before the first en-dash/hyphen (range → start), trim.
- Match `/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i` (minutes optional, meridiem **required**). No meridiem → `null`.
- `h = m[1]`, `mm = m[2] ?? 0`, `ap = m[3].toUpperCase()`.
- `minutes = ((h % 12) + (ap === "PM" ? 12 : 0)) * 60 + mm` — mirrors the private `toMin` (`extractAgendaSchedule.ts:56-59`): `12 AM → 0`, `12:30 AM → 30`, `12 PM → 720`, `12:30 PM → 750`, `1 PM → 780`.
- **Why a new module, not reuse:** `toMin` is private to the extractor and takes `(h,m,ap)` not a string; the exported clock utils (`extractFirstClock`, `extractClockTimes`) return strings/arrays, never minutes (grounding: time-formats surface). A single shared string→minutes converter is the correct new primitive.

### 3.2 `lib/crew/agendaDayForToday.ts` (NEW)

```ts
export function parseIsoFromDayLabel(dayLabel: string): string | null;
export function agendaSessionsForToday(
  agendaLinks: { extracted?: AgendaExtraction | null }[],
  showDays: string[],              // ISO show-day list (data.show.dates.showDays)
  todayIso: string,
): AgendaSession[];
```

**`parseIsoFromDayLabel`** — turn a date-bearing label into ISO, else `null`:
1. **Collapse glyph-split digits FIRST** — replace every space *between two digits* (`/(?<=\d)\s+(?=\d)/g → ""`). **This is load-bearing and validated against real data:** the live PDFs emit `"Tuesday, March 2 4 , 202 6"`, `"Wednesday , June 2 5 , 202 5"`, `"Thursday, October 9, 202 5"` (digits split by pdfjs). Without this collapse, ~50% of real day labels fail to parse. After it, **all 12 day labels across the 6 real agenda PDFs parse correctly** (validated 2026-06-29 by running the live extractor).
2. Match `/\b(jan|feb|…|dec)[a-z]*\.?\s+(\d{1,2})\s*,?\s*(\d{4})\b/i` (full or abbreviated month, comma optional, whitespace-tolerant) → `YYYY-MM-DD` (zero-padded). No existing parser does month-name→ISO (`normalizeDate` is M/D/YY-only — grounding day-matching surface), so this is new.
3. No month-name+year match → `null` (positional fallback territory; e.g. `"Day 1"`, weekday-only).

**`agendaSessionsForToday`** — the D4 algorithm:
1. Pick the **first high-confidence** extraction among `agendaLinks` (`extracted?.confidence === "high" && extracted.days.length > 0`); if none → `[]`.
2. **Primary (date-bearing):** for each `day`, if `parseIsoFromDayLabel(day.dayLabel) === todayIso` → return `day.sessions`. (First match wins.)
3. **Guarded positional fallback:** ONLY when **every** `showDays[i]` is non-null **AND** `extraction.days.length === showDays.length` **AND** no day parsed a date that matched: let `idx = showDays.indexOf(todayIso)`; if `idx >= 0` → return `extraction.days[idx].sessions`. The exact count + all-non-null guards prevent wrong-day mapping when the agenda has an extra/missing day (e.g. a pre-event reception day) — the ratified "never guess" rule (grounding: existing sheet-agenda matching uses the same principle).
4. Otherwise → `[]` (no confident match → no agenda today).

### 3.3 `lib/crew/showDayTimeline.ts` (NEW)

```ts
export type TimelineItem =
  | { source: "crew";   entry: AgendaEntry;     minutes: number | null }
  | { source: "agenda"; session: AgendaSession; minutes: number | null };

export function buildShowDayTimeline(
  crewEntries: AgendaEntry[],          // ALREADY per-viewer gated (scheduleEntriesForViewer)
  agendaSessions: AgendaSession[],     // ALREADY day-matched + high-conf (agendaSessionsForToday)
): TimelineItem[];
```
1. Map crew entries → `{source:"crew", entry, minutes: clockToMinutes(entry.start)}`.
2. Map agenda sessions → `{source:"agenda", session, minutes: clockToMinutes(session.time)}`; **drop** any whose `minutes === null` (an agenda session with no placeable time cannot be safely interleaved — D3 conservatism).
3. **Dedup (crew wins):** drop an agenda item iff there exists a crew item with **equal `minutes` (exact, no tolerance)** AND **`normTitle(crew) === normTitle(agenda)`**, where `normTitle(s) = stripAgendaUrls(s ?? "").toLowerCase().replace(/\s+/g," ").trim()` (`stripAgendaUrls` from `lib/visibility/agendaUrls.ts:35`). Crew-vs-crew duplicates are **never** deduped (sheet errors are preserved, not silently dropped).
4. **Sort:** ascending by `minutes`; **stable**; ties broken `crew` before `agenda` (the authoritative call leads its co-timed event session). Items with `minutes === null` (crew entries with unparseable `start` — agenda nulls were already dropped) sort **last**, preserving their original relative order (sheet order).

---

## 4. TodaySection wiring (`components/crew/sections/TodaySection.tsx`)

### 4.1 New computation (near `:211-215`)
```ts
const todays = (unknown_asterisk ? [] : scheduleEntriesForViewer(runOfShow[todayIso].entries, { transportVisible })); // unchanged :211-214
const agendaToday = agendaSessionsForToday(data.show.agenda_links, data.show.dates.showDays, todayIso);                // NEW
const modeA = isShowDay && eligible && (todays.length > 0 || agendaToday.length > 0);                                  // CHANGED :215
```
- `isShowDay` / `eligible` unchanged (`:198-201`). `todayIso` from `todayIsoInShowTimezone` (`lib/visibility/packList.ts:102`) — **timezone-aware**; all matching uses this same authority (no UTC/browser-local).
- **The only gate change:** `todays.length > 0` → `(todays.length > 0 || agendaToday.length > 0)` so an agenda-only show day renders Mode A (D6). **Existing tests don't regress:** the no-entries-no-agenda fixtures have no `agenda_links` → `agendaToday` is `[]` → `modeA` stays `false` exactly as before (the modeA test's "no entries → not Mode A" cases, `TodaySection.modeA.test.tsx:119,239-240`, still hold).

### 4.2 Render path (the `today-run-of-show` card body, `:579-599`)
The SectionCard shell (`data-card-id="today-run-of-show"`, icon, title `"Run of show"`, the `"Full agenda"` `SectionChipLink section="schedule"`, the `SourceLink` on `sourceAnchors[CARD_REGION_MAP["today-run-of-show"]]`) is **unchanged**. Only its **body** branches:
```tsx
{agendaToday.length > 0
  ? <ShowDayTimelineList items={buildShowDayTimeline(todays, agendaToday)} isoDate={todayIso} />
  : <RunOfShowList entries={todays} isoDate={todayIso} /> /* unchanged crew-only path */}
```

### 4.3 `components/crew/primitives/ShowDayTimelineList.tsx` (NEW)
- Container `data-testid={`show-day-timeline-${isoDate}`}` (distinct from RunOfShowList's `run-of-show-${iso}`).
- **Crew rows** reuse the existing `RunOfShowEntry` rendering (`RunOfShowList.tsx:26-…`) verbatim — same `data-testid="agenda-entry"`, same title/time(`START–FINISH·TRT`)/room/av/synthetic-muted treatment. Zero visual change to a crew row.
- **Agenda rows** = a NEW muted "event" row, `data-testid="timeline-agenda-session"` (distinct from the crew `"agenda-entry"`): renders `clock` (the session start, from `session.time`), `title` (null → time-only), `room` (null/empty → omit), with a small **event marker** (e.g. an eyebrow/badge "Agenda" or a calendar glyph) and muted text tone (`text-text-subtle`). **`tracks` and `drift` are never read** (D7). The exact visual treatment is specified in §6 and finalized against a DESIGN.md mock at implementation (impeccable v3).

---

## 5. States & guard conditions (every input)

| Condition | Behavior | Guard / citation |
|---|---|---|
| today not a show day (travel/set) | card not rendered | `modeA` false (`isShowDay` false, `:198,215`) |
| `unknown_asterisk` restriction | `todays = []`; agenda-only could still render if sessions exist *and* viewer eligible — but `eligible` is independent of restriction-kind here, so confirm: `unknown_asterisk` ⇒ no crew; agenda shows only if `eligible` true | `:212`, §4.1; **resolved:** `unknown_asterisk` does not force `eligible=false`, so an `unknown_asterisk` viewer on a show day *with* agenda would see agenda-only. **This is acceptable** (the agenda is public program info, never per-viewer gated, §2.2). |
| crew-only (no/low-conf/no-match agenda) | existing `RunOfShowList(todays)`, **unchanged** | §3 activation rule; `agendaToday=[]` |
| agenda-only (zero crew entries) | merged list = agenda rows only | D6; `modeA` via the `\|\|` (§4.1) |
| both present | interleaved, sorted, deduped | §3.3 |
| `runOfShow[todayIso]` missing / `entries: []` | `todays=[]` → crew-only-empty; if also no agenda, `modeA` false → no card | optional-chain `runOfShow?.[todayIso]?.entries` (`:214`) |
| `agenda_links` absent/empty | `agendaToday=[]` → crew-only | §3.2 step 1 |
| agenda low-confidence (`days:[]`) | `agendaToday=[]` → crew-only | §3.2 step 1 high-conf gate |
| `dayLabel` non-date ("Day 1") + counts match | positional fallback maps today's index | §3.2 step 3 |
| `dayLabel` non-date + counts differ | no agenda (crew-only) | §3.2 step 3 guard |
| `showDays` contains a null | positional fallback **blocked** (all-non-null guard); date-bearing primary still works | §3.2 step 3 |
| agenda session `time` unparseable | dropped from the merge | §3.3 step 2 |
| crew `start` unparseable (e.g. "TBD") | kept, sorts **last** in original order | §3.3 step 4 |
| agenda session `title === null` | included; renders time-only (no `isDisplayableEntry` gate on agenda) | §4.3 |
| agenda session `room` null/"" | room cell omitted | §4.3 |
| dedup exact (same minute + same normTitle) | agenda suppressed, crew kept (with its room/av) | §3.3 step 3 |
| dedup near-miss (minute off / title differs) | **both** shown | §3.3 step 3 (no fuzzy) |
| crew loadout entry, non-transport viewer | already filtered out upstream; never in the merge | §2.1; merge does NOT re-gate |
| DST / near-midnight | `todayIso` in show tz; all comparisons share that authority | `todayIsoInShowTimezone` (`packList.ts:102`) |

---

## 6. Rendering — Dimensional Invariants & Transition Inventory (AGENTS.md mandatory)

### 6.1 Dimensional Invariants
The card lives in the Mode A split-wide grid (`today-mode-a-grid`, `:575`), which uses `min-[720px]:items-start` (natural height — the 2026-06-21 owner amendment, `DESIGN.md`). The new timeline list is a vertical stack inside the left column.
- The `ShowDayTimelineList` container fills the card content width: `flex flex-col` (mirrors `RunOfShowList.tsx:139`); **no fixed height** (the split-wide grid is the one place equal-height is deliberately NOT used).
- Each row (crew `agenda-entry` and `timeline-agenda-session`) is `min-w-0` so long titles wrap, not overflow (mirrors the existing `min-w-0` rule, `ScheduleSection`/`TodaySection`).
- **Real-browser assertion (mandatory layout-dimensions task):** at the captured mobile width, every row's `getBoundingClientRect().width` equals the list container's content width (±0.5px), and the list's height equals the sum of its rows (no clipping). Jsdom is insufficient (AGENTS.md).

### 6.2 Transition Inventory
The card has **4 content states** keyed purely on data (no toggles/animation): `crew-only`, `agenda-only`, `merged`, `not-rendered`. There are **no client-side interactive transitions** (it's a server-rendered list; the only interactivity is the existing `SourceLink`/`SectionChipLink` navigations, unchanged). For the N=4 states, all `N*(N-1)/2 = 6` pairs are **"instant — no animation; the card re-renders from new server data on navigation/refresh"** (the page is RSC; state changes come from a fresh render, not in-place client animation). Compound transitions: none (no overlapping client state). This is declared explicitly so the reviewer does not expect `AnimatePresence`/exit props — there are none and none are needed.

---

## 7. Files touched

- **NEW** `lib/time/clockToMinutes.ts` + `tests/time/clockToMinutes.test.ts`
- **NEW** `lib/crew/agendaDayForToday.ts` + `tests/crew/agendaDayForToday.test.ts`
- **NEW** `lib/crew/showDayTimeline.ts` + `tests/crew/showDayTimeline.test.ts`
- **NEW** `components/crew/primitives/ShowDayTimelineList.tsx` + `tests/components/crew/primitives/ShowDayTimelineList.test.tsx`
- **MODIFY** `components/crew/sections/TodaySection.tsx` (`:211-215` compute + `:215` gate + `:579-599` card body branch)
- **MODIFY** `tests/components/crew/sections/TodaySection.modeA.test.tsx` (add agenda-only Mode-A case + a merged-interleave case; existing cases unchanged)
- **MODIFY** `tests/e2e/crew-layout-dimensions.spec.ts` (extend the Today Mode-A dimension assertions to the timeline rows)
- **DESIGN.md** — a short subsection documenting the unified-timeline card states + the crew-vs-agenda row treatment (referenced by the impeccable gate).

No `lib/agenda/*`, no `lib/parser/*`, no `supabase/`, no `app/api/`, no `EXTRACTOR_VERSION`.

---

## 8. Test plan (TDD, anti-tautology)

Pure-module tests assert against the **returned data structure**, with expectations **derived from fixture inputs** (never hardcoded). Each test names the concrete bug it catches.

- **`clockToMinutes`:** `"9 AM"→540`, `"9:00 AM"→540` (bare-hour ≡ explicit; catches sort-position divergence), `"12:00 AM"→0`, `"12:30 AM"→30`, `"12:00 PM"→720`, `"12:30 PM"→750`, `"1:00 PM"→780` (12h-wrap; catches noon-before-midnight), `"9:00 AM – 9:40 AM"→540` (range→start), `"9:00"→null`, `"TBD"→null` (no-meridiem→null; catches false placement).
- **`parseIsoFromDayLabel`:** the **6 real labels** as fixtures — `"Tuesday, March 2 4 , 202 6"→"2026-03-24"`, `"Wednesday , June 2 5 , 202 5"→"2025-06-25"`, `"Thursday, October 9, 202 5"→"2025-10-09"`, `"Monday , May 4, 2026"→"2026-05-04"`, `"Tuesday May 13,2024"→"2024-05-13"` (glyph-split + comma/space variance; **catches the silent ~50% parse failure** if the digit-collapse is dropped), `"Day 1"→null`, `"Friday"→null`.
- **`agendaSessionsForToday`:** date-bearing match returns that day's sessions; non-matching today → `[]`; low-conf → `[]`; positional fallback fires when counts equal + labels positional (assert the *index-mapped* day's sessions, derived from the fixture); positional **blocked** when counts differ (→`[]`); `showDays` with a null blocks positional. *Failure mode:* wrong-day sessions surfaced, or agenda silently shown on a non-show day.
- **`buildShowDayTimeline`:** interleave order (derive expected order by sorting the fixture's known minutes); dedup exact (crew "9 AM Keynote" + agenda "9:00 AM – … Keynote" → 1 item, crew kept); dedup near-miss (9:00 vs 9:05, or title differs → 2 items); agenda-null-time dropped (count = crew + agenda − dropped); crew-null-time sorts last; crew-vs-crew dup NOT deduped; ties → crew before agenda. *Failure mode:* an agenda extraction error suppressing a real crew call, or a double-shown item.
- **`ShowDayTimelineList`:** crew rows render as `agenda-entry` (existing treatment); agenda rows render as `timeline-agenda-session` with muted tone + event marker, time + title + room, **no track/drift**; agenda-only list renders; null-title agenda → time-only row.
- **`TodaySection.modeA`:** **agenda-only** show day (no crew entries, high-conf agenda for today) → Mode A renders with `timeline-agenda-session` rows and **no** `run-of-show-<iso>` plain list; **merged** day → both `agenda-entry` and `timeline-agenda-session` present, interleaved; **crew-only** day (no agenda) → unchanged `RunOfShowList` (`run-of-show-<iso>` present, no `timeline-agenda-session`). Existing no-content cases unchanged.
- **Layout-dimensions (e2e, real browser):** §6.1 width/height invariants on the timeline rows at the captured mobile viewport.
- **Anti-tautology guard:** the modeA component tests clone the tree and scope to the `today-run-of-show` card before counting rows (a sibling card must not satisfy the assertion); expected session counts come from `markdownVariables`/fixture session arrays, not literals.

---

## 9. CI close-out gates

- **screenshots-drift:** the Today view IS captured (`crew-preview-today-mobile-{light,dark}.webp`, manifest `scripts/help-screenshots.manifest.ts`). This change alters the Today card on a merged/agenda fixture → those baselines drift → `screenshots-drift` fails on the PR. Regenerate via the **`screenshots-regen` `workflow_dispatch`** (pinned `mcr.microsoft.com/playwright:v1.59.1-jammy` amd64, bot-commit) — **never locally** (host-arch bytes diverge). Then re-trigger required checks (bot commits don't auto-trigger them). *Only drifts if the captured RPAS-Central preview fixture has a high-confidence agenda day matching the preview "today"; if not, no drift — verify during implementation.*
- **impeccable v3 dual-gate (invariant 8):** the Today card is a crew UI surface → `/impeccable critique` + `/impeccable audit` on the diff, HIGH/CRITICAL fixed or `DEFERRED.md`'d, before milestone close.

---

## 10. Watchpoints (disagreement-loop preempts for the reviewer)

- **Render-only, no extractor change** is a ratified decision (D5). Do not propose populating `AgendaDay.date` in the extractor (that would force a re-extract / `EXTRACTOR_VERSION` bump, which we just shipped #190). The date is derived at render from `dayLabel`.
- **The glyph-split digit collapse in `parseIsoFromDayLabel` is mandatory and validated against live data** (not speculative) — ~50% of real day labels are `"202 6"`-style. Do not "simplify" it away.
- **Crew-only path is intentionally byte-identical** (§3 activation rule): the new sort/dedup only runs when agenda is present. Do not propose always-sorting crew entries (that would reorder the crew-only common case and regress its screenshot/tests).
- **Dedup is exact, crew-wins, no fuzzy matching** (D3) — by design, to avoid suppressing a real crew call on a wrong fuzzy match. Do not propose tolerance windows or similarity scoring.
- **The merge does NOT re-gate** — crew entries arrive already per-viewer filtered (`scheduleEntriesForViewer`); agenda is public/ungated. Do not add `dateRestriction` handling inside the merge.
- **`modeA` gate change is the minimal `|| agendaToday.length>0`** — the existing no-content tests are unaffected because those fixtures have no `agenda_links`.
- **Today card title stays "Run of show"** (D8) — not "Crew Schedule"; the rename is a separate (parked) change for the Schedule tab + Step 3.
