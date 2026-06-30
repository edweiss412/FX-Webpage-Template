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
- **Untrusted raw JSONB → normalize at the boundary**: `show.agenda_links` is decoded via a **generic cast** (`lib/data/getShowForViewer.ts:359` — `decodeJsonbColumn<ShowRow["agenda_links"]>(…)`), so `link.extracted` is **not shape-validated**. Every consumer normalizes via `normalizeAgendaExtraction` before trusting fields (`components/crew/AgendaScheduleBlock.tsx:55`). This feature does the same (§3.2 step 2).
- **Renderable only when high-confidence**: after normalization, `confidence === "high"` with `days.length > 0` (`lib/agenda/normalizeAgendaExtraction.ts:50-56` validates `typeof extractorVersion === "number"` ONLY — never compares to `EXTRACTOR_VERSION`). Low-confidence / malformed → no agenda contribution.

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

**Activation rule (blast-radius minimization):** `agendaSessionsForToday` returns **only placeable** sessions — it drops any session whose `time` is unparseable (`clockToMinutes(time) === null`) *before* returning (see §3.2 step 5). So `agendaToday.length > 0` is a faithful "≥1 interleavable agenda session" gate. The merge path (`ShowDayTimelineList` via `buildShowDayTimeline`) activates **iff `agendaToday.length > 0`**; otherwise TodaySection renders the **existing `RunOfShowList(todays)` unchanged**. Two consequences, both intentional:
- **Crew-only path is render-identical** to today (no reorder, no new sort, no dedup) — the new code is unreachable when no placeable agenda exists. (The `modeA` gate condition changes, §4.1, but the *rendered output* is identical because `RunOfShowList` is invoked with the same `todays`.)
- **No "ghost activation":** filtering null-time sessions in `agendaSessionsForToday` (not later in `buildShowDayTimeline`) closes the hole where an all-unparseable-time agenda would flip on the merge path (and re-sort the crew entries) while contributing zero visible agenda rows.

### 3.1 `lib/time/clockToMinutes.ts` (NEW)

```ts
/** Minute-of-day for a clock string in EITHER the sheet (normClock) or agenda (fmtClock) format.
 *  Accepts: "9 AM", "9:00 AM", "12:00pm", "2:00 PM"; for a range ("9:00 AM – 9:40 AM") parses the START.
 *  Returns null on anything it cannot confidently place (no meridiem, garbage). */
export function clockToMinutes(raw: string): number | null;
```
- **Split on the first en-dash/hyphen** (range → start): `raw.split(/[–—-]/)[0]`, then `.trim()`.
- Match `/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i` — **fully anchored** (`^…$`), minutes optional, meridiem **required**. Anything with trailing content or no meridiem → `null`.
- `h = +m[1]`, `mm = m[2] ? +m[2] : 0`, `ap = m[3].toUpperCase()`.
- **Range-validate (mandatory): `if (h < 1 || h > 12 || mm > 59) return null`.** The regex alone accepts impossible clocks (`"13:75 AM"`, `"99:99 PM"`), and `normalizeAgendaExtraction` only requires `session.time` be a **non-empty string** (`lib/agenda/normalizeAgendaExtraction.ts:18-20`) — so corrupt/raw JSONB could otherwise survive normalization, pass the placeable filter, activate the merged path, and sort to a nonsensical position. (`mm >= 0` is guaranteed by `\d{2}`; `h >= 1` because `"0:00 AM"` is not a valid 12-hour clock.)
- `minutes = ((h % 12) + (ap === "PM" ? 12 : 0)) * 60 + mm` — mirrors the private `toMin` (`extractAgendaSchedule.ts:55-59`): `12 AM → 0`, `12:30 AM → 30`, `12 PM → 720`, `12:30 PM → 750`, `1 PM → 780`.
- **Why a new module, not reuse:** `toMin` is private to the extractor and takes `(h,m,ap)` not a string; the exported clock utils (`extractFirstClock`, `extractClockTimes`) return strings/arrays, never minutes (grounding: time-formats surface). A single shared string→minutes converter is the correct new primitive.

### 3.2 `lib/crew/agendaDayForToday.ts` (NEW)

```ts
export function parseIsoFromDayLabel(dayLabel: string): string | null;
export function agendaSessionsForToday(
  agendaLinks: { extracted?: AgendaExtraction | null }[] | null | undefined,
  showDays: string[],              // ISO show-day list (data.show.dates.showDays)
  todayIso: string,
): AgendaSession[];
```

**`parseIsoFromDayLabel`** — turn a date-bearing label into ISO, else `null`:
1. **Collapse glyph-split digits FIRST** — `dayLabel.replace(/(?<=\d)\s+(?=\d)/g, "")` (remove every space *between two digits*; leaves `"May 4"` and `"4, 2026"` intact). **Load-bearing, validated against real data:** the live PDFs emit `"Tuesday, March 2 4 , 202 6"`, `"Wednesday , June 2 5 , 202 5"`, `"Thursday, October 9, 202 5"` (digits split by pdfjs). Without it, ~50% of real day labels fail to parse; with it, **all 12 day labels across the 6 real agenda PDFs parse correctly** (validated 2026-06-29 by running the live extractor — this is empirical, not speculative).
2. Match `/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*,?\s*(\d{4})\b/` (month word, comma optional, **4-digit year**, whitespace-tolerant) against the collapsed label.
3. **Month→number (EXACT, not prefix):** lower-case the captured word, strip a trailing `.`, and look it up in a map keyed on BOTH full names and 3-letter abbreviations — `MONTHS = {january:1,jan:1,february:2,feb:2,march:3,mar:3,april:4,apr:4,may:5,june:6,jun:6,july:7,jul:7,august:8,aug:8,september:9,sept:9,sep:9,october:10,oct:10,november:11,nov:11,december:12,dec:12}` (note both `sept` and `sep` for September — `"Sept."` is a common 4-letter PDF abbreviation; the regex `[A-Za-z]{3,9}` captures it) — by **exact key match**. **Not a 3-char prefix slice:** `"Marb"` is not a key → `null`, so a garbage word never false-matches a real month (which would wrongly date-match and bypass the positional fallback). Not found → `null`. Else `${m[3]}-${pad2(month)}-${pad2(+m[2])}` (zero-padded). No existing util does month-name→ISO (`normalizeDate` is M/D/YY-only — grounding), so this map is new.
4. No match (e.g. `"Day 1"`, weekday-only, a bad month word, or a **2-digit year** like `"May 4, 26"` — unsupported, intentionally) → `null` (positional-fallback territory).

**`agendaSessionsForToday`** — the D4 algorithm (aggregates TODAY's **placeable** sessions across **ALL** high-confidence agenda links):
1. **Nullsafe:** null/undefined `agendaLinks` → `[]`.
2. **Normalize at the trust boundary, every link:** `link.extracted` is **raw JSONB** decoded via a generic cast (`lib/data/getShowForViewer.ts:359` — `decodeJsonbColumn<…>(…)`, NOT shape-validated), so a legacy/corrupt extraction could be the wrong shape. For each link, `const ext = normalizeAgendaExtraction(link.extracted)` (`lib/agenda/normalizeAgendaExtraction.ts`) — **exactly** the boundary `AgendaScheduleBlock` uses (`components/crew/AgendaScheduleBlock.tsx:55`). **Skip** the link unless `ext && ext.confidence === "high" && ext.days.length > 0` (malformed → `normalizeAgendaExtraction` returns `null` → skipped, never crashes/leaks).
3. **For each surviving `ext`, find today's day** (per-link):
   a. **Primary (date-bearing):** the first `day` whose `parseIsoFromDayLabel(day.dayLabel) === todayIso`. Track `someDateParsed` = did **any** day in *this* `ext` parse to a non-null ISO.
   b. **Guarded positional fallback** (per-link): only if no primary match in this `ext` **AND** `!someDateParsed` (this ext's labels are **all** non-date — avoids fallback on a *partially* date-aligned agenda) **AND** `showDays.length > 0 && showDays.every(d => d != null)` **AND** `ext.days.length === showDays.length`: `idx = showDays.indexOf(todayIso)`; if `idx >= 0` → `ext.days[idx]`. The exact-count + all-non-null + no-date-parsed guards prevent wrong-day mapping (extra/missing day, e.g. a pre-event reception day) — the ratified "never guess" rule.
   c. If a day matched, collect its `sessions`.
4. **Aggregate + filter to placeable:** **concatenate** matched sessions across all links (a show may carry multiple agenda PDFs that each cover today — `ScheduleSection.tsx:139` renders **every** link's block, so using only the first would silently drop later links' today-sessions). From the concatenation, **drop any with `clockToMinutes(session.time) === null`**. Return the survivors (order: link order then in-day order; the merge re-sorts chronologically). No matches → `[]`.

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
1. Map crew entries → `{source:"crew", entry, minutes: clockToMinutes(entry.start)}` (minutes may be `null` for an unparseable `start` like `"TBD"`).
2. Map agenda sessions → `{source:"agenda", session, minutes: clockToMinutes(session.time)}`. The caller (`agendaSessionsForToday` step 5) already filtered unplaceable sessions, so `minutes` is non-null here; defensively drop any `minutes === null` anyway (a no-op for the normal path — keeps `buildShowDayTimeline` correct if called directly in a test).
3. **Dedup (crew wins):** drop an agenda item iff there exists a crew item with **equal `minutes` (exact, no tolerance)** AND **`normTitle(crew.entry.title) === normTitle(agenda.session.title)`**, where `normTitle(s) = stripAgendaUrls(s ?? "").toLowerCase()` — `stripAgendaUrls` (`lib/visibility/agendaUrls.ts:35`) already collapses whitespace runs + trims (`:44-45`), so no extra `.replace(/\s+/)/.trim()` is needed. A crew item with `minutes === null` can never dedup (null ≠ null is not matched — both being unplaceable means neither participates). Crew-vs-crew duplicates are **never** deduped (sheet errors preserved). (`crew.entry.title` is guaranteed non-empty by `displayableEntries`; a null/empty agenda title normalizes to `""` and would only "match" an impossible empty crew title — operationally never.)
4. **Sort:** ascending by `minutes`; **stable** (preserve input order for equal keys); ties broken `crew` before `agenda` (the authoritative call leads its co-timed event session). Items with `minutes === null` (only crew, post-step-2) sort **last**, preserving their original relative order (sheet order).

---

## 4. TodaySection wiring (`components/crew/sections/TodaySection.tsx`)

### 4.1 New computation (near `:211-215`)
```ts
const todays = (unknown_asterisk ? [] : scheduleEntriesForViewer(runOfShow[todayIso].entries, { transportVisible })); // unchanged :211-214
const agendaToday = agendaSessionsForToday(data.show.agenda_links ?? [], data.show.dates.showDays ?? [], todayIso);    // NEW (nullsafe)
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
**Props:** `{ items: TimelineItem[]; isoDate: string }`. For each item: `source === "crew"` → render the existing `RunOfShowEntry` with `item.entry`; `source === "agenda"` → render the new `AgendaSessionRow` with `item.session`. Direct import from `RunOfShowList.tsx` (no barrel; `components/crew/primitives/` has no `index.ts`).
- Container `data-testid={`show-day-timeline-${isoDate}`}`, classes `mt-2 flex flex-col` (mirrors `RunOfShowList.tsx:139`). Distinct from RunOfShowList's `run-of-show-${iso}`.
- **Crew rows** reuse the existing `RunOfShowEntry` rendering (`RunOfShowList.tsx:26-…`) **verbatim** — same `data-testid="agenda-entry"`, same title/time(`START–FINISH·TRT`)/room/av/synthetic-muted treatment. Zero visual change to a crew row. (`RunOfShowEntry` must be exported from `RunOfShowList.tsx` for reuse — currently module-private; export it.)
- **Agenda rows** = a NEW muted "event" row `AgendaSessionRow`, `data-testid="timeline-agenda-session"` (distinct from the crew `"agenda-entry"`), `min-w-0`. Renders: the **full `session.time` string verbatim** (e.g. `"9:00 AM – 9:40 AM"` or `"9:00 AM"` — NOT just the start; the range is useful event context), `title` (null → time-only row), `room` (null/empty → omit), a small **event marker** (badge/eyebrow), muted tone (`text-text-subtle`). **`tracks` and `drift` are never read** (D7). `clockToMinutes` is used ONLY for sort/dedup, never for display.
- **Capping (matches `RunOfShowList`'s exact semantics, `:128-138`):** `RunOfShowList` exempts **synthetic** crew rows (`kind` `strike`/`loadout` — few, load-bearing milestones) and caps the **non-synthetic content** (crew `kind` absent/`"agenda"`) at `RUN_OF_SHOW_DISPLAY_CAP` (`lib/crew/agendaDisplay.ts:16`, =20) with the overflow counting only that group. The merged timeline applies the **same rule, unified across both sources**: **synthetic crew rows always render** (never capped); the **non-synthetic content** = crew `kind∈{undefined,"agenda"}` **+ all PDF-agenda sessions** is capped *collectively* at `RUN_OF_SHOW_DISPLAY_CAP`. Algorithm: from the sorted+deduped `items`, keep every synthetic-crew item; keep the first `cap` non-synthetic items in timeline order; drop the rest; if any non-synthetic was dropped, render one `+N more` overflow stub (`data-testid="timeline-agenda-overflow"`) at the end. This prevents the `>20`-crew-row regression Codex flagged (a 30-entry sheet day must not render 30 rows on mobile) while keeping strike/loadout always visible.
- The agenda-row visual treatment (the event marker glyph/badge, its placement/color/contrast, and a side-by-side proving it is **distinct from the muted synthetic crew row** `RunOfShowList.tsx` strike/loadout treatment) is finalized against the DESIGN.md subsection (§7) at implementation, under the impeccable v3 dual-gate.

---

## 5. States & guard conditions (every input)

| Condition | Behavior | Guard / citation |
|---|---|---|
| today not a show day (travel/set) | card not rendered | `modeA` false (`isShowDay` false, `:198,215`) |
| `unknown_asterisk` restriction | **card NOT rendered (no agenda leak)** | `eligible` (`:199-201`) is `true` **only** when `dateRestriction.kind === "none"` OR (`"explicit"` ∧ today ∈ days); `kind === "unknown_asterisk"` matches **neither** → `eligible === false` → `modeA === false`. So an `unknown_asterisk` viewer sees **no** timeline (and `todays` is `[]` too, `:212`). The unified timeline introduces **no** new exposure for restricted viewers — agenda is never shown to an ineligible viewer because the whole `modeA` branch is gated on `eligible`. |
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
| > `RUN_OF_SHOW_DISPLAY_CAP` non-synthetic rows | synthetic strike/loadout always shown; first `cap` non-synthetic (crew-agenda + PDF-agenda) shown + `+N more` stub | §4.3 capping |
| multiple high-conf agenda links each covering today | sessions aggregated across all links | §3.2 step 4 |
| malformed/corrupt `extracted` JSONB | `normalizeAgendaExtraction` → null → link skipped (no crash) | §3.2 step 2 |
| agenda session time unparseable | dropped in `agendaSessionsForToday` (step 4) → not in `agendaToday` | §3.2 step 4 |
| DST / near-midnight | `todayIso` in show tz; all comparisons share that authority | `todayIsoInShowTimezone` (`packList.ts:102`) |

---

## 6. Rendering — Dimensional Invariants & Transition Inventory (AGENTS.md mandatory)

### 6.1 Dimensional Invariants
The card lives in the Mode A split-wide grid (`today-mode-a-grid`, `:575`), which uses `min-[720px]:items-start` (natural height — the 2026-06-21 owner amendment, `DESIGN.md`). The new timeline list is a vertical stack inside the left column.
- The `ShowDayTimelineList` container fills the card content width: `flex flex-col` (mirrors `RunOfShowList.tsx:139`); **no fixed height** (the split-wide grid is the one place equal-height is deliberately NOT used).
- Each row (crew `agenda-entry` and `timeline-agenda-session`) is `min-w-0` so long titles wrap, not overflow (mirrors the existing `min-w-0` rule, `ScheduleSection`/`TodaySection`).
- **Real-browser assertion (mandatory layout-dimensions task):** at the captured mobile width, every row's `getBoundingClientRect().width` equals the list container's content width (±0.5px), and the list's height equals the sum of its rows (no clipping). Jsdom is insufficient (AGENTS.md).

### 6.2 Transition Inventory
The card is **server-rendered**; no client-side animation. The four states (`crew-only`, `agenda-only`, `merged`, `not-rendered`) are purely data-driven and **instant** (RSC re-render on navigation/refresh) — all 6 state-pairs are "instant, no animation." No `AnimatePresence`/exit props exist or are needed; the only interactivity is the existing (unchanged) `SourceLink`/`SectionChipLink` navigations. Distinguishing crew vs agenda rows is a **static styling** difference (§4.3), not a transition.

---

## 7. Files touched

- **NEW** `lib/time/clockToMinutes.ts` + `tests/time/clockToMinutes.test.ts`
- **NEW** `lib/crew/agendaDayForToday.ts` + `tests/crew/agendaDayForToday.test.ts`
- **NEW** `lib/crew/showDayTimeline.ts` + `tests/crew/showDayTimeline.test.ts`
- **NEW** `components/crew/primitives/ShowDayTimelineList.tsx` + `tests/components/crew/primitives/ShowDayTimelineList.test.tsx`
- **MODIFY** `components/crew/sections/TodaySection.tsx` (`:211-215` compute + `:215` gate + `:579-599` card body branch)
- **MODIFY** `tests/components/crew/sections/TodaySection.modeA.test.tsx` (add agenda-only Mode-A case + a merged-interleave case; existing cases unchanged)
- **MODIFY** `tests/e2e/crew-layout-dimensions.spec.ts` (extend the Today Mode-A dimension assertions to the timeline rows)
- **MODIFY** `components/crew/primitives/RunOfShowList.tsx` — **export `RunOfShowEntry`** (currently module-private) for reuse by `ShowDayTimelineList`. No behavior change.
- **DESIGN.md** — a NEW subsection (placed after the existing split-wide amendment) titled "Crew Today — unified show-day timeline card." It MUST contain: (a) the 4-state table (crew-only / agenda-only / merged / not-rendered); (b) the **crew row** treatment (real vs synthetic-muted, unchanged from today); (c) the **agenda row** treatment — the exact event marker (badge/eyebrow/glyph), its placement/size/color/contrast, and a **side-by-side** showing the agenda row is visually **distinct from the muted synthetic crew row** (the two muted styles must not collide); (d) the cap + overflow-stub copy. This subsection is the artifact the impeccable v3 gate critiques.

No `lib/agenda/*`, no `lib/parser/*`, no `supabase/`, no `app/api/`, no `EXTRACTOR_VERSION`. No primitives barrel (`components/crew/primitives/` has no `index.ts`; direct imports).

---

## 8. Test plan (TDD, anti-tautology)

Pure-module tests assert against the **returned data structure**. **Anti-tautology rules (AGENTS.md):** sort/order assertions use a fixture in a **deliberately non-sorted** input order and assert a **constant** expected order (never one re-derived by sorting the fixture); the digit-collapse and dedup tests are **mutation-verified** (the named line, when removed, must flip the test); DOM scans clone the tree and scope to the card. Each test states the concrete bug it catches.

- **`clockToMinutes` (`tests/time/clockToMinutes.test.ts`):** `"9 AM"→540` and `"9:00 AM"→540` (bare-hour ≡ explicit-minutes — catches a parser that ignores bare hours); `"12:00 AM"→0`, `"12:30 AM"→30`, `"12:00 PM"→720`, `"12:30 PM"→750`, `"1:00 PM"→780` (12h-wrap — catches noon/midnight inversion); `"9:00 AM – 9:40 AM"→540` (range→start split); `"9:00"→null`, `"TBD"→null`, `"9:00 AM x"→null` (no-meridiem / trailing-garbage → null, proving the `^…$` anchor); **impossible clocks → null** (range-validation, catches corrupt JSONB surviving as a "placeable" nonsense position): `"13:00 PM"→null`, `"99:99 PM"→null`, `"9:75 AM"→null`, `"0:00 AM"→null`. *Failure mode:* a clock that converts to the wrong/garbage minute-of-day. (Sort-position regressions live in the `buildShowDayTimeline` tests, not here.)
- **`parseIsoFromDayLabel` (`tests/crew/agendaDayForToday.test.ts`):** **representative real labels** from the 6-PDF corpus (verbatim, including glyph-split + spacing variance) → exact ISO: `"Tuesday, March 2 4 , 202 6"→"2026-03-24"`, `"Wednesday, March 2 5, 2026"→"2026-03-25"`, `"Wednesday , June 2 5 , 202 5"→"2025-06-25"`, `"Thursday, October 9, 202 5"→"2025-10-09"`, `"Monday , May 4, 2026"→"2026-05-04"`, `"Tuesday May 13,2024"→"2024-05-13"`; plus `"Friday, Sept. 18, 2026"→"2026-09-18"` (4-letter "Sept." abbr); and the `null` cases `"Day 1"`, `"Friday"`, `"Marb 5, 2026"` (bad month word → map miss, NOT a prefix false-match), `"May 4, 26"` (2-digit year unsupported). **Mutation guard (mandatory):** the fixture `"March 2 4 , 202 6"` (provably unparseable without the digit-collapse) is asserted `→"2026-03-24"`, and the plan's negative-regression step removes `/(?<=\d)\s+(?=\d)/g` and confirms this case flips to `null` (proving the collapse is load-bearing).
- **`agendaSessionsForToday`:** (1) date-bearing match returns exactly the matched day's **placeable** sessions; (2) today not in any day → `[]`; (3) low-confidence extraction → `[]`; (4) **malformed `extracted`** (e.g. `{confidence:"high"}` missing `days`, or a string scalar) → `normalizeAgendaExtraction` returns null → that link skipped, **no throw** (catches the raw-JSONB trust gap); (5) **multiple high-conf links** each with a day matching today → sessions **aggregated** (concatenated) across links — catches the silent "first-link-only" omission; (6) positional fallback **fires** — fixture `showDays=["2026-01-01","2026-01-02","2026-01-03"]`, `todayIso="2026-01-02"`, one extraction with 3 days labeled `"Day 1/2/3"` each with **distinct** sessions; assert the returned sessions are exactly **day index 1's** (the fixture's day-2 sessions) — catches off-by-one; (7) positional **blocked** when `ext.days.length !== showDays.length` → `[]`; (8) positional **blocked** when any `showDays[i]` null → `[]`; (9) positional **blocked** when *any* label parsed a date (partial alignment) → `[]`; (10) unplaceable-time sessions filtered out (matched day has 3, one `time:"TBD"` → returns 2). *Failure mode:* wrong-day sessions, dropped multi-PDF sessions, or a crash on bad JSONB.
- **`buildShowDayTimeline`:** **interleave order** — fixture in non-sorted input order (crew `["10:00 AM" Set, "8:00 AM" LoadIn]`, agenda `["9:00 AM – … Keynote"]`) → assert the **constant** expected order `[LoadIn(8:00), Keynote(9:00), Set(10:00)]` by `(source,minutes)` (a descending or input-order impl fails); **dedup exact** — crew `"9:00 AM" "Keynote"` + agenda `"9:00 AM – 9:40 AM" "Keynote"` → **1** item, the crew row (keeps crew room/av); **dedup near-miss** — `9:00` vs `9:05`, or title `"Keynote"` vs `"Keynote Q&A"` → **2** items; **mutation guard:** removing the dedup `normTitle`-equality clause makes the exact-dedup case render 2 instead of 1; **ties** — crew `"9:00 AM" "X"` + agenda `"9:00 AM" "Y"` (different titles → not deduped) → **2** items, crew **first**; **crew-null-time** — crew `"TBD"` sorts last; **agenda-null-time** dropped (defensive); **crew-vs-crew dup** — two identical crew entries → **both** kept. *Failure mode:* a real crew call suppressed, or a double-shown item.
- **`ShowDayTimelineList` (`tests/components/crew/primitives/…`):** scope every assertion to `container.querySelector('[data-testid="show-day-timeline-<iso>"]')`. Crew items → `data-testid="agenda-entry"` (existing treatment); agenda items → `data-testid="timeline-agenda-session"` with the full `session.time` string, muted tone + event marker, room when present, **no** track/drift text; null-title agenda → time-only row. **Capping (synthetic-exempt):** fixture = 22 crew `kind:"agenda"` items + 1 crew `kind:"strike"` (synthetic) + 1 PDF agenda session → assert exactly `RUN_OF_SHOW_DISPLAY_CAP`(20) non-synthetic rows shown, the **strike row still present** (exempt), and one `timeline-agenda-overflow` stub with the dropped count (`23 non-synthetic − 20 = 3`). *Failure mode:* a 30-row mobile dump, or a strike milestone hidden behind the cap.
- **`TodaySection.modeA` (`tests/components/crew/sections/TodaySection.modeA.test.tsx`, EXTEND):** build inputs with the real `makeShowForViewer()` fixture (`tests/fixtures/showForViewer.ts`); derive expected counts from the fixture's `agendaToday`/`todays` arrays (never literals). Clone the tree and scope to the `today-run-of-show` card before counting. Cases: (a) **agenda-only** show day (fixture crew `[]`, one high-conf agenda day matching the fixture's `todayIso`) → `[data-testid="show-day-timeline-<iso>"]` present, `timeline-agenda-session` count === the day's session count, **no** `run-of-show-<iso>` plain list; (b) **merged** → both `agenda-entry` and `timeline-agenda-session` present; (c) **crew-only** (no `agenda_links`) → `run-of-show-<iso>` present, **zero** `timeline-agenda-session`, and `show-day-timeline-<iso>` absent (proves the activation rule). Existing no-content cases (`:119,239-240`) unchanged (their fixtures have no `agenda_links`).
- **Layout-dimensions (e2e, real browser, `tests/e2e/crew-layout-dimensions.spec.ts`):** fixture = 2 crew + 2 agenda rows interleaved; assert each row's `getBoundingClientRect().width === showDayTimeline.contentWidth` (±0.5px) and `list.height === Σ rows` (±0.5px) at the captured mobile viewport (§6.1). Jsdom insufficient.

---

## 9. CI close-out gates

- **screenshots-drift:** the Today view IS captured (`crew-preview-today-mobile-{light,dark}.webp`, manifest `scripts/help-screenshots.manifest.ts`). This change alters the Today card on a merged/agenda fixture → those baselines drift → `screenshots-drift` fails on the PR. Regenerate via the **`screenshots-regen` `workflow_dispatch`** (pinned `mcr.microsoft.com/playwright:v1.59.1-jammy` amd64, bot-commit) — **never locally** (host-arch bytes diverge). Then re-trigger required checks (bot commits don't auto-trigger them). *Only drifts if the captured RPAS-Central preview fixture has a high-confidence agenda day matching the preview "today"; if not, no drift — verify during implementation.*
- **impeccable v3 dual-gate (invariant 8):** the Today card is a crew UI surface → `/impeccable critique` + `/impeccable audit` on the diff, HIGH/CRITICAL fixed or `DEFERRED.md`'d, before milestone close.

---

## 10. Watchpoints (disagreement-loop preempts for the reviewer)

- **Render-only, no extractor change** is a ratified decision (D5). Do not propose populating `AgendaDay.date` in the extractor (that would force a re-extract / `EXTRACTOR_VERSION` bump, which we just shipped #190). The date is derived at render from `dayLabel`.
- **The glyph-split digit collapse in `parseIsoFromDayLabel` is mandatory and validated against live data** (not speculative) — ~50% of real day labels are `"202 6"`-style. Do not "simplify" it away.
- **Crew-only path renders the identical component** (§3 activation rule): when `agendaToday` is empty, `RunOfShowList(todays)` is invoked exactly as today (same component, same sort=sheet-order, same cap) — render-identical output. (The `modeA` *gate condition* gains `|| agendaToday.length>0`, but that only adds the agenda-only case; it never changes the crew-only render.) Do not propose always-sorting crew entries (that would reorder the crew-only common case). Note the intentional asymmetry: on a *merged* day crew entries are time-sorted to interleave; on a *crew-only* day they keep sheet order — acceptable because well-formed sheets are already chronological and the sort is stable.
- **Dedup is exact, crew-wins, no fuzzy matching** (D3) — by design, to avoid suppressing a real crew call on a wrong fuzzy match. Do not propose tolerance windows or similarity scoring.
- **The merge does NOT re-gate** — crew entries arrive already per-viewer filtered (`scheduleEntriesForViewer`); agenda is public/ungated. Do not add `dateRestriction` handling inside the merge.
- **`modeA` gate change is the minimal `|| agendaToday.length>0`** — the existing no-content tests are unaffected because those fixtures have no `agenda_links`.
- **Today card title stays "Run of show"** (D8) — not "Crew Schedule"; the rename is a separate (parked) change for the Schedule tab + Step 3. **On an agenda-only day** the card titled "Run of show" shows only event sessions — this is the **deliberate, ratified** choice (D6+D8): the agenda *is* the run of the show that day, and a conditional title would add state/complexity the user did not request. Do not relitigate as a "misleading title."
- **`clockToMinutes` lives in `lib/time/`** as a string→minute-of-day primitive (no existing `lib/time/*` does string→minutes — grounding). This is a deliberate placement (reusable, pure), not over-scoping; it has exactly one caller today and that is fine.
- **2-digit years are intentionally unsupported** in `parseIsoFromDayLabel` (real PDFs use 4-digit years; the 6-PDF corpus confirms). Such a label falls to the guarded positional fallback. Do not add ambiguous 2-digit-year parsing (the >2069 pivot is a footgun).
- **`agendaSessionsForToday` normalizes every link's `extracted`** via `normalizeAgendaExtraction` (raw JSONB is untrusted, `getShowForViewer.ts:359`) and **aggregates across ALL high-confidence links** (`ScheduleSection.tsx:139` renders every link; using only the first would silently drop multi-PDF today-sessions). Do not relitigate to first-link-only or to trusting `extracted` directly.
- **The cap is synthetic-exempt** (matches `RunOfShowList.tsx:128-138`): strike/loadout always render; the cap is on non-synthetic content (crew-agenda + PDF). Do not propose "crew never capped."
- **Month parse is EXACT** (full or 3-letter abbr, not a prefix slice): `"Marb"` → null. This is deliberate to keep garbage labels on the positional path.
