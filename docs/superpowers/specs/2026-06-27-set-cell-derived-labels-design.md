# SET cell-derived run-of-show labels (D-SET1) — Design Spec

**Date:** 2026-06-27
**Status:** Draft → adversarial review
**Author:** Opus 4.8 (autonomous-ship pipeline)
**Resolves:** `DEFERRED.md` **D-SET1** ("Rich multi-entry SET run-of-show (cell-derived titles)"), itself deferred from `docs/superpowers/specs/2026-06-27-schedule-strike-loadout-inference-design.md` §6 (rounds R9/R11/R12/R13/R14).

---

## 1. Goal

The SET day's run-of-show entries should carry the operator's **actual labels** from the SET TIME cell (e.g. `"Room Access"`), not the generic `"Setup"` they collapse to today, and should support **N entries** (the future "morning set + afternoon session" case). This is a **parser-only** change — no DB, no migration, no UI files, no new error code, no `AgendaEntry.kind` change.

**One-sentence architecture:** add a SET-specific **label-before-clock** tokenizer (`tokenizeSetSchedule`) that reuses the existing colon-required clock scanner for clock *values* (so they stay byte-identical to `dates.loadIn`/`setupTime`) and slices the text *before* each clock as its label; `deriveScheduleBookends` uses it when the cell is label-before-shaped, and otherwise falls through to today's exact 2-entry synthesis.

---

## 2. Corpus grounding (why this is small)

Surveyed **both** the committed fixtures (10 deduplicated shows under `fixtures/shows/raw/` + `fixtures/shows/exporter-xlsx/`) **and** the 6 live "II-" Google Sheets in Drive folder `fxav-test-shows` (`1iU80Y2mqYmkCuBQYer0TEF1fta6fDp1C`) via the Drive connector (all 6 reads succeeded):

- **0 / 16 shows** have a SET cell with **>2** colon-clocks. Max anywhere is **2**.
- **0 / 16 shows** carry a **non-generic** label (no session/rehearsal/agenda labels — every label is load-in/setup/room-access logistics).
- The only label-before-shaped multi-time cell in the entire corpus is **RFI/PCF**: `"Load In: 7:00 PM Room Access: 8:30 PM"`. Today it renders `Load In 7:00 PM` + **`Setup` 8:30 PM** — losing the operator's `"Room Access"`. **This is the one real, non-speculative fidelity gap this feature closes.**
- The dominant shape is a single load-in clock (`"11:00 AM LOAD IN"`, `"12:30 PM LOAD IN"`, etc.) — these are **time-first** (clock before label) and must keep rendering generic `"Load In"`.

**Implication:** the N>2 path is speculative (built because the user explicitly wants the "morning set + afternoon session" capability); the cell-derived-label path fixes exactly one real show today. The design therefore degrades to today's behavior for **every cell except RFI/PCF and future label-before cells.**

---

## 3. Current behavior (cited)

| Layer | Location | Behavior |
|---|---|---|
| SET-cell clock extraction | `lib/parser/blocks/dates.ts:218-224` (`set` case), `:208-216` (`travel_set` case) | `extractClockTimes(row[4])` → keeps **only** `times[0]`→`result.loadIn`, `times[1]`→`result.setupTime`. The raw cell + all labels + any 3rd+ clock are **discarded**. `travel_set` fills only if unset; explicit `set` overrides. |
| Clock scanner | `lib/parser/blocks/dates.ts:267-278` (`extractClockTimes`) | Colon-**required**: `/\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?/g`. Minimally normalizes each match: collapse internal whitespace + uppercase a trailing am/pm. Does **not** insert spaces — `"9:00PM"` stays `"9:00PM"`, `"7:00 PM"` stays `"7:00 PM"` (`tests/parser/blocks/dates.test.ts:412,473`). `"AFTER 8PM"`→`[]`, `"LOAD IN"`→`[]` (`dates.test.ts:476,478`). |
| `dates` shape | `lib/parser/types.ts:114-119` | `travelIn`, `set`, `showDays`, `travelOut`, `loadIn?`, `setupTime?`. **No raw-cell field.** |
| SET run-of-show synthesis | `lib/parser/blocks/scheduleBookends.ts:100-106` | `if (dates.set)`: append `{start: dates.loadIn, title:"Load In"}` (kind absent) and `{start: dates.setupTime, title:"Setup"}` (kind absent) to `runOfShow[dates.set]`. |
| Render (no title source distinction) | crew `components/crew/primitives/RunOfShowList.tsx`; admin `components/admin/wizard/Step3SheetCard.tsx` (`ScheduleDayRow`) | `entry.title` rendered verbatim (via `stripAgendaUrls`). kind-absent → STRONG agenda row, counted against the per-day agenda cap (20 crew / 6 admin). |

---

## 4. Design (strategy S3)

### 4.1 Plumb the raw SET cell onto `dates`

Add one **parse-transient** optional field to `ShowRow["dates"]` (`lib/parser/types.ts`, after `setupTime?` at `:119`):

```ts
// PARSE-TRANSIENT: raw SET-row TIME cell, populated by parseDates and consumed by
// deriveScheduleBookends. STRIPPED in lib/parser/index.ts before the ShowRow is composed
// — never written to public.shows.dates nor projected by getShowForViewer. D-SET1.
setAgendaRaw?: string | null;
```

- Initialize it `null` in the `parseDates` result literal (`dates.ts:54-61`).
- Store the **raw cell** (null when the cleaned cell is empty). The raw cell (not a decoded/normalized form) is the right carrier because `tokenizeSetSchedule` (§4.3) applies the **identical** `decodeEntities(clean(...))` that `extractClockTimes` (§4.2) applies to `row[4]` — so the tokenizer's clock values are byte-identical to `dates.loadIn`/`setupTime` (no-drift **by construction**, §4.5), and the sliced labels are decoded the same way. Use the **same precedence the existing `loadIn`/`setupTime` lines encode** — explicit `set` overrides `travel_set`:
  - helper: `const setCell = row[4] ?? ""; const sar = clean(setCell) ? setCell : null;` (`clean` only tests emptiness; the raw `setCell` is what gets stored).
  - `travel_set` case (`dates.ts:208-216`): `if (result.setAgendaRaw == null) result.setAgendaRaw = sar;` (fill-if-unset, mirroring `:213-214`).
  - `set` case (`dates.ts:218-224`): `result.setAgendaRaw = sar;` (override, mirroring `:221-222`).
  - `clean` is already imported in `dates.ts:18`.

**Strip before persistence (R2 P1c).** `dates` is persisted: `parseSheet` composes `show.dates` (`lib/parser/index.ts:424`), the cron sync writes `show.dates`→`public.shows.dates` JSONB (`lib/sync/runScheduledCronSync.ts:1045,1119`), and `getShowForViewer` decodes + projects it to the viewer `ShowRow` (`lib/data/getShowForViewer.ts:326,350`). `setAgendaRaw` must therefore be **removed before the `ShowRow` literal**. In `index.ts`, just before the `const show: ShowRow = {…}` at `:418`:

```ts
// setAgendaRaw is parse-transient (consumed by deriveScheduleBookends below); never persist/project it.
const datesForShow: ShowRow["dates"] = { ...dates };
delete datesForShow.setAgendaRaw; // `delete` is lint-clean (no throwaway var); legal because the field is optional
```

Use `datesForShow` for `show.dates` (`:424`) and `deriveSchedulePhases(datesForShow)` (`:425`). Keep passing the **full** `dates` local (with `setAgendaRaw`) to `deriveScheduleBookends` (`:460-466`, which runs after the literal and reads `dates.setAgendaRaw`). The `delete`-based omit is chosen over a `{ setAgendaRaw: _x, ...rest }` destructure to avoid a `@typescript-eslint/no-unused-vars` failure (`ignoreRestSiblings` is not guaranteed in `eslint-config-next/typescript`). Pinned by a test asserting `parseSheet(...).show.dates` has no `setAgendaRaw` key (§9.F).
- **Rationale for a field vs. re-reading `row[4]`:** the DATES-tab read is a single forward scan gated by `inDatesBlock` with per-row `classifyLabel` (`dates.ts:32-44`, scan `:169-237`); re-reading would duplicate ~70 lines of block-shape/version logic and risk drift. `row[4]` is already in hand at the capture site.

### 4.2 Position-returning clock core (zero behavior change to `extractClockTimes`)

Refactor `extractClockTimes` (`dates.ts:267`) to delegate to a new exported core. **The core operates on the string exactly as given (it does NOT call `clean` itself); each caller cleans its raw input exactly once and passes the cleaned string in.** This eliminates the double-`clean` offset hazard (R1 P2b: `clean` is not idempotent — it removes one backslash-escape layer per call, `_helpers.ts:48`):

```ts
// Operates on `text` verbatim; offsets index `text`. Caller is responsible for cleaning.
export function extractClockTimeTokens(text: string): { clock: string; start: number; end: number }[] {
  const re = /\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?/g;
  const out: { clock: string; start: number; end: number }[] = [];
  for (const m of text.matchAll(re)) {
    const clock = m[0].replace(/\s+/g, " ").replace(/([AaPp][Mm])$/, (s) => s.toUpperCase()).trim();
    out.push({ clock, start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}
export function extractClockTimes(raw: string): string[] {
  const c = decodeEntities(clean(raw)); // decode &#10;/&#9;→space BEFORE tokenizing (R2 P1d)
  if (!c) return [];
  return extractClockTimeTokens(c).map((t) => t.clock);
}
```

- **`extractClockTimes` now `decodeEntities`-s its input** (it previously `clean`-ed only). This is **behavior-preserving for the entire corpus**: real cells only ever carry `&#10;`/`&#9;` as field *separators between* tokens (exporter-xlsx), never *inside* a clock — decoding a separator to a space leaves the same matches. It is required so that a contrived `"7:00&#9;PM"` tokenizes to `"7:00 PM"` instead of `"7:00"`, keeping `dates.loadIn`/`setupTime` consistent with the tokenizer (R2 P1d). Both existing `extractClockTimes` assertions (`dates.test.ts:469-481`, no entities) and every SET-row `loadIn`/`setupTime` test (`dates.test.ts:305-420`, no entities) stay green — `decodeEntities` is the identity on entity-free strings. Pinned green-by-construction + a new `"7:00&#9;PM"→["7:00 PM"]` test (§9.A).
- `extractClockTimeTokens` is called only by `extractClockTimes` and `tokenizeSetSchedule`, each of which passes an already-`decodeEntities(clean(...))`-ed string. `start`/`end` index that string; the tokenizer slices labels from the **same** string — no idempotency assumption.
- `decodeEntities` is imported from `./_helpers` in `dates.ts:18` (extend the existing import).

### 4.3 `tokenizeSetSchedule(raw): { label: string | null; clock: string }[]`

New export in `lib/parser/blocks/scheduleBookends.ts` (or a small sibling module it imports). Algorithm:

1. `const c = decodeEntities(clean(raw ?? ""));` — if empty, return `[]`. (This is the **single** decode+clean — identical to what `extractClockTimes` applies to `row[4]`; `c` is both tokenized and label-sliced, so clock values match `dates.loadIn`/`setupTime`.)
2. `const toks = extractClockTimeTokens(c);` — if empty, return `[]`. Offsets index `c`.
3. **Mode detection (§4.4).** `const lead = c.slice(0, toks[0].start);` — if `lead` is **not colon-terminated** (`!/:\s*$/.test(lead)`), return `[]` (→ caller falls through to today's path). The trailing-colon is the true `"Label:"` signature; "non-empty lead" alone is too weak (R1 P1b — it would turn leading provenance like `"As per Alyssa email 4/29 8:00 AM"` into a bogus label).
4. For each token `i`: `label = labelBefore(c, prevEnd, toks[i].start)` where `prevEnd = i === 0 ? 0 : toks[i-1].end`. Push `{ label: label || null, clock: toks[i].clock }`.

`labelBefore` (mirror of `titleAfter` at `scheduleTimes.ts:88-94`, stripping a wider separator set on **both** ends so `"Load In:"`→`"Load In"` and `" / Room Access:"`→`"Room Access"`; `c` is already decoded so no `decodeEntities` here):

```ts
function labelBefore(cell: string, from: number, to: number): string {
  const slice = cell.slice(from, to)
    .replace(/^\s*[-–:/,;]?\s*/, "") // leading separator (e.g. " / ", " - " trailing a prior clock)
    .replace(/\s*[-–:/,;]?\s*$/, "") // trailing separator (the label's own colon, or "/")
    .replace(/\s+/g, " ")
    .trim();
  return shouldHideGenericOptional(slice) ? "" : slice; // sentinel/placeholder gap → no label
}
```

- New imports in `scheduleBookends.ts` (currently imports only `presence, normalizeDate` from `./_helpers` at `:1`): add `clean`, `decodeEntities` (`_helpers.ts:45,66`), `extractClockTimeTokens` (from `./dates`), and `shouldHideGenericOptional` from `@/lib/visibility/emptyState` (same import the SHOW-DAY tokenizer uses, `scheduleTimes.ts:13`).
- Clock values come from `toks[i].clock` over the decoded `c` — identical to `dates.loadIn`/`setupTime` (which `extractClockTimes` derives from `decodeEntities(clean(row[4]))`). No drift (R2 P1d).
- A residual backslash in a contrived label (`"Load\\ In"`) is cosmetic and out-of-corpus; `clean` runs exactly once per path so there is no offset/drift bug.

**Label casing is verbatim** — the operator's exact text (consistent with the verbatim-clock policy, `extractFirstClock` doc at `scheduleTimes.ts:56-58`). No `STAGE_LABEL_MAP` canonicalization (kept out of scope; additive later if wanted).

### 4.4 Mode detection — the R9–R14 trap

SET cells come in two shapes and **only one** must be tokenized for labels:

| Mode | Trigger | Examples | Treatment |
|---|---|---|---|
| **label-before** | the slice *before the first clock* (`c.slice(0, toks[0].start)`) is **colon-terminated** (`/:\s*$/`) **AND its label is in the recognized SET-label vocabulary** (see below) | `"Load In: 7:00 PM Room Access: 8:30 PM"`, `"Load In: 8:00 AM Session: 1:00 PM"` | tokenize → per-clock derived labels (each label recognized, else position default) |
| **position-default** (= today) | first-clock lead is empty, separator-only, **or non-colon prose** | `"11:00 AM LOAD IN"`, `"9:00PM - LOAD IN 10:00PM - SETUP"`, `"8:00 AM LOAD IN As per Alyssa email 4/29"` (trailing provenance), `"As per Alyssa email 4/29 8:00 AM LOAD IN"` (leading provenance — no colon), `"AFTER 8PM"` | `tokenizeSetSchedule` returns `[]` → caller falls through to `loadIn`/`setupTime` synthesis |

The colon-terminated trigger is the exact fix for two failure modes:
- **Trailing labels (R9–R14):** a back-scan applied to time-first cells would mis-attribute a clock's *trailing* label to the *next* clock (e.g. `"9:00PM LOAD IN 10:00PM SETUP"` → 2nd clock wrongly `"LOAD IN"`). The first clock's lead is empty → not colon-terminated → position-default. **Pinned by test** (§9.B, the `consultants` time-first 2-time fixture).
- **Leading provenance (R1 P1b):** `"As per Alyssa email 4/29 8:00 AM LOAD IN"` has a non-empty but non-colon lead → position-default → renders `"Load In 8:00 AM"`, not the bogus `"As per Alyssa email 4/29"`. **Pinned by test** (§9.B).

Partial/mixed cells (a colon-label only on a non-first clock, or a no-colon first label) degrade to safe position-default — acceptable, none are in the corpus.

**Closed-vocabulary gate (structural defense).** A colon-terminated lead alone is not sufficient — the label must be in a **closed `SET_LABEL_VOCAB`** (normalized lowercase: `load in`, `room access`, `set`/`setup`/`set up`, `session`, `rehearsal`, `doors`, `soundcheck`/`sound check`, `tech`/`tech check`, `strike`, `load out`, plus hyphen/`loadin` variants). Arbitrary prose / provenance (`"Alyssa email:"`, `"As per …:"`, `"Per email:"`, `"Notes:"`) is **not** in the vocab → the cell falls through to the `loadIn`/`setupTime` synthesis. An open-ended prose heuristic (word-count / no-digits) always has a bypass (the colon-provenance vector recurred across review rounds); a **closed allow-list cannot mislabel prose by construction**. The vocab matches the live corpus exactly (RFI/PCF `Load In`/`Room Access`); it is the single extension point — add a word when a genuinely new SET label appears in a real sheet. Per-entry: an unrecognized later-clock label → `null` → position default (`Load In`/`Setup`/skip).

### 4.5 `deriveScheduleBookends` SET branch (replaces `scheduleBookends.ts:100-106`)

```ts
if (dates.set) {
  const tokens = tokenizeSetSchedule(dates.setAgendaRaw ?? null);
  if (tokens.length > 0) {
    // label-before mode: one entry per clock; derived label or position default
    tokens.forEach((t, i) => {
      const title = t.label ?? (i === 0 ? "Load In" : i === 1 ? "Setup" : null);
      if (title == null) return; // 3rd+ clock with no derived label → skip (matches today's ≤2 cap)
      appendEntry(ros, dates.set!, { start: t.clock, title });
    });
  } else {
    // position-default / no-cell: today's exact synthesis (unchanged)
    if (presence(dates.loadIn ?? "")) appendEntry(ros, dates.set, { start: dates.loadIn!, title: "Load In" });
    if (presence(dates.setupTime ?? "")) appendEntry(ros, dates.set, { start: dates.setupTime!, title: "Setup" });
  }
}
```

- **Clock values** in the tokenized path come from `extractClockTimeTokens` — the **same** normalized strings that populate `dates.loadIn`/`setupTime` (`dates.ts:220` feeds both) → **no drift** with `resolveKeyTimes` (which reads `dates.loadIn`, `lib/crew/resolveKeyTimes.ts:106`).
- **Append-not-overwrite** preserved: `appendEntry` (`scheduleBookends.ts:44-47`) merges into any pre-existing grid `ScheduleDay` on `dates.set`.
- All entries stay **kind-absent** (see §5).

---

## 5. Rendering — no `kind`, no UI change

SET entries remain **kind-absent** (rendered as STRONG agenda rows, exactly as the shipped 2-entry SET). Rationale and consequences, verified against the render path:

- **No `decodeRunOfShow` change.** The kind whitelist (`lib/data/decodeRunOfShow.ts:60-64`) accepts only `strike`/`loadout`; kind-absent entries round-trip as `agenda`. Introducing a `kind:"set"` would force a whitelist edit + new render predicates for zero corpus benefit — **explicitly out of scope** (§8).
- **Caps unchanged & never hit in practice.** Per-day agenda cap is 20 (crew, `lib/crew/agendaDisplay.ts:16` via `RunOfShowList.tsx:133-137`) / 6 (admin, `Step3SheetCard.tsx:58,196-202`). Realistic SET entry counts are 1–3. If a pathological cell ever exceeds the cap, the existing `+N more` / `Show all` affordance handles it correctly (no special-casing needed).
- **`isSetDay` "Setup"-meta suppression already correct.** `components/crew/sections/ScheduleSection.tsx:273-281` suppresses the standalone `"Setup <time>"` DayCard meta whenever `dayEntries.length > 0`; multi-entry SET keeps this working unchanged.
- **`resolveKeyTimes` safe.** The Set strip anchor is built from `dates.loadIn` (`resolveKeyTimes.ts:104-112`), independent of run-of-show entries; the show-anchor loop iterates only `visibleShowDays` (`:128`), which excludes the SET day — so SET entries are never visited and never need a kind to stay out of the show-start anchor.
- **`getShowForViewer` projection already includes the SET day** (and never sees `setAgendaRaw`, which is stripped at `index.ts` before persistence, §4.1). `dates.set` is in the aggregate-day domain (`aggregateDays` pushes phase `'Set'`, `lib/crew/agendaDisplay.ts:87`; gate at `lib/data/getShowForViewer.ts:674`), so N SET *run-of-show entries* reach crew untouched (the PR #169 widening).
- **Trust-boundary filter unaffected.** `scheduleEntriesForViewer` (`agendaDisplay.ts:59-64`) only transport-gates `kind:"loadout"`; kind-absent SET entries pass ungated (correct — SET is not transport-gated). Each entry must carry a real non-sentinel title to render (`displayableEntries`, `:43-50`) — derived labels and the `"Load In"`/`"Setup"` defaults all qualify.

---

## 6. Guard conditions (every input)

| `dates.setAgendaRaw` | Tokenizer result | SET entries rendered |
|---|---|---|
| `null` / `undefined` / `""` | `[]` | fall-through → today's `loadIn`/`setupTime` (may be 0/1/2) |
| `"AFTER 8PM"`, `"LOAD IN"` (0 colon-clocks) | `[]` (no tokens) | none (today's behavior; `loadIn`/`setupTime` are also null) |
| `"11:00 AM LOAD IN"` (time-first, 1 clock) | `[]` (position-default mode) | fall-through → 1 entry `Load In 11:00 AM` |
| `"9:00PM - LOAD IN 10:00PM - SETUP"` (time-first, 2 clocks) | `[]` (position-default mode) | fall-through → `Load In 9:00PM` + `Setup 10:00PM` |
| `"8:00 AM LOAD IN As per Alyssa email 4/29"` (time-first + trailing provenance) | `[]` (position-default; first-clock lead empty) | fall-through → 1 entry `Load In 8:00 AM` |
| `"As per Alyssa email 4/29 8:00 AM LOAD IN"` (leading provenance, no colon) | `[]` (position-default; lead not colon-terminated) | fall-through → 1 entry `Load In 8:00 AM` (not the provenance text) |
| `"Load In: 7:00 PM Room Access: 8:30 PM"` (label-before, 2 clocks) | `[{Load In,7:00 PM},{Room Access,8:30 PM}]` | `Load In 7:00 PM` + **`Room Access` 8:30 PM** |
| `"Load In: 7:00 PM / Room Access: 8:30 PM"` (label-before, `/`-separated) | `[{Load In,7:00 PM},{Room Access,8:30 PM}]` (leading `/` stripped) | `Load In 7:00 PM` + `Room Access 8:30 PM` |
| `"Load In: 8:00 AM Rehearsal: 1:00 PM Doors: 5:00 PM"` (label-before, N=3) | 3 tokens, all labeled | 3 entries with derived labels |
| label-before with an **unlabeled 2nd** clock (`"Setup: 7:00 PM 8:30 PM"`) | `[{Setup,7:00 PM},{null,8:30 PM}]` | `Setup 7:00 PM` + position-default `Setup 8:30 PM` |
| label-before with an **unlabeled 3rd+** clock | 3rd token `label:null` | 3rd entry **skipped** (no default beyond position 2; matches today's ≤2 cap) |
| label with no following clock (`"Room Access:"` alone, or trailing `"Rehearsal"` after last clock) | not a token (no colon-clock) | dropped — never fabricates an entry |

**Colon-required is inherited** (the tokenizer's clocks come from the colon-required scanner). A future "morning/afternoon" SET cell must therefore write **colon clocks** (`"1:00 PM"`, not `"1PM"`) to be picked up — consistent with every current SET parse. This is the deliberate disambiguator: the label-separator `:` in `"Load In:"` is *not* an `HH:MM` clock, so it is harmlessly stripped as a separator and never mistaken for a time.

---

## 7. Data-field lifecycle (`setAgendaRaw`)

| Storage | Write path | Read path | Effect on output |
|---|---|---|---|
| `ShowRow["dates"].setAgendaRaw` — **parse-transient**: raw cell (null when clean-empty), present only on the in-parser `dates` local; **stripped at `index.ts:418` before the `ShowRow` literal** so it is never persisted to `public.shows.dates` nor projected by `getShowForViewer` | `dates.ts` `set`/`travel_set` cases (§4.1) | `deriveScheduleBookends` → `tokenizeSetSchedule` (`scheduleBookends.ts`, §4.3/§4.5) only — reads the full pre-strip `dates` | When label-before-shaped → cell-derived SET run-of-show titles (clocks from the same `decodeEntities(clean())` as `loadIn`); otherwise inert (fall-through). Strip pinned by §9.F. Not a zombie: written, read, and dropped within `parseSheet`. |

No zombie-flag risk: the field has exactly one writer and one reader, both in this change.

---

## 8. Out of scope / not changing (do-not-relitigate)

These are deliberate, precedent-backed decisions. **Reviewers: do not relitigate without a corpus counter-example.**

1. **No `AgendaEntry.kind:"set"`.** kind-absent (STRONG render) preserves shipped behavior and avoids touching `decodeRunOfShow.ts:60-64` + render predicates. Precedent: today's SET Load In/Setup are kind-absent (`scheduleBookends.ts:100-106`).
2. **No new warning** for skipped 3rd+ unlabeled clocks. Honors ratified contract **D11** ("No SET warning", strike/loadout spec §6 / `dataGaps.ts`). SET emits no parse warning at all.
3. **No UI files touched.** The render path already handles N kind-absent entries (§5). → **invariant 8 (impeccable dual-gate) does not apply.** (The plan will include a guard step that fails if any `app/**`/`components/**`/CSS file is in the diff.)
4. **No DB / migration / schema-manifest / validation-parity.** `run_of_show` is schemaless JSONB; `setAgendaRaw` is an in-memory parse field. → no `supabase/migrations/**`, no `pnpm gen:schema-manifest`.
5. **No §12.4 catalog / `gen:spec-codes` / `gen:internal-code-enums`.** No new error code.
6. **Clock values are minimally-normalized, not byte-verbatim, and come from the SAME `decodeEntities(clean(row[4]))` as `dates.loadIn`/`setupTime`.** `setAgendaRaw` is stored raw; `tokenizeSetSchedule` and `extractClockTimes` both apply `decodeEntities(clean(...))` to the same raw text → clock values match `loadIn`/`setupTime` exactly (no key-times drift), by construction (R2 P1d). Strict source-verbatim is explicitly *not* pursued — it would force realigning `loadIn`/`setupTime` and risk the normalized `setupTime` assertions (`dates.test.ts:406-420`).
10. **Label recognition is a CLOSED vocabulary, intentionally** (`SET_LABEL_VOCAB`, §4.4). This is a structural defense shipped after the colon-provenance vector recurred — do **not** re-propose an open-ended prose heuristic (every such heuristic has a bypass) and do **not** flag the vocab as "too restrictive": a genuinely new SET label is the documented single extension point, and dropping an unrecognized label degrades to the safe generic synthesis (never a mislabel). The vocab covers the entire live corpus.
9. **`extractClockTimes` now `decodeEntities`-s its input** (signature unchanged; body adds the decode it previously lacked). This is a deliberate, corpus-behavior-preserving change required for no-drift + correct labels — **do not flag as scope creep.** Real cells carry `&#10;`/`&#9;` only as field separators between tokens, so decoding them to spaces never alters a match; only the contrived `"7:00&#9;PM"` (entity inside a clock) changes, and changes *correctly*. Verified green against `dates.test.ts:305-481`.
7. **Colon-required (not the permissive SHOW-DAY `CLOCK_RE`).** Adopting the permissive scanner would turn `"AFTER 8PM"` into a key time — the exact regression `dates.test.ts:475` guards.
8. **`extractClockTimes` public signature unchanged** (the refactor only extracts an internal/exported core it delegates to).

---

## 9. Test plan (TDD)

All new tests are parser unit/integration (jsdom not required). Each states the failure mode it catches.

**A. `extractClockTimeTokens` + `extractClockTimes` regression** (`tests/parser/blocks/dates.test.ts`, extend):
- `extractClockTimeTokens("Load In: 7:00 PM Room Access: 8:30 PM")` → 2 tokens with correct `clock`/`start`/`end`; `.map(t=>t.clock)` equals `extractClockTimes` output. *Catches: offsets wrong / normalization drift.*
- **All existing `extractClockTimes` assertions (`:469-481`) unchanged and green.** *Catches: the refactor altering public behavior.*
- **entity decode (R2 P1d):** `extractClockTimes("7:00&#9;PM")` → `["7:00 PM"]` (previously would have been `["7:00"]`). *Catches: the decode regression / entity-inside-clock.*

**B. `tokenizeSetSchedule` unit** (`tests/parser/blocks/scheduleBookends.test.ts`, extend):
- label-before 2-time: `"Load In: 7:00 PM Room Access: 8:30 PM"` → `[{label:"Load In",clock:"7:00 PM"},{label:"Room Access",clock:"8:30 PM"}]`. *Catches: the core fidelity gap.*
- label-before N=3: `"Load In: 8:00 AM Rehearsal: 1:00 PM Doors: 5:00 PM"` → 3 labeled tokens. *Catches: N>2 support.*
- **mode detection — trailing labels (R9–R14 pin):** `"9:00PM - LOAD IN 10:00PM - SETUP"` → `[]`; `"8:00 AM LOAD IN As per Alyssa email 4/29"` → `[]`; `"11:00 AM LOAD IN"` → `[]`. *Catches: time-first cells being mislabeled.*
- **mode detection — leading provenance (R1 P1b pin):** `"As per Alyssa email 4/29 8:00 AM LOAD IN"` → `[]` (non-colon lead → position-default). *Catches: leading prose becoming a bogus label.*
- **separator strip (R1 P2a):** `"Load In: 7:00 PM / Room Access: 8:30 PM"` → 2nd label `"Room Access"` (not `"/ Room Access"`). *Catches: incomplete separator set.*
- **entity decode in label (R2 P1d):** `"Load In: 7:00 PM Room Access:&#10;8:30 PM"` → 2nd label `"Room Access"` (entity → space, stripped). *Catches: undecoded `&#10;` leaking into a label.*
- **entity inside a clock (R2 P1d):** `"Load In: 7:00&#9;PM Room Access: 8:30 PM"` → `[{label:"Load In",clock:"7:00 PM"},{label:"Room Access",clock:"8:30 PM"}]` — **not** `clock:"7:00"` and **not** label `"PM Room Access"`. *Catches: the exact R2 P1d mislabel.*
- degradation: `""`→`[]`; `"AFTER 8PM"`→`[]`; `null`→`[]`. *Catches: crashes / phantom entries on coarse text.*
- unlabeled-tail: `"Setup: 7:00 PM 8:30 PM"` → `[{Setup,7:00 PM},{null,8:30 PM}]`. *Catches: gap-slice over-attribution.*

**C. `deriveScheduleBookends` SET branch** (`tests/parser/blocks/scheduleBookends.test.ts`, extend):
- With `dates.set` set and `setAgendaRaw="Load In: 7:00 PM Room Access: 8:30 PM"` → `runOfShow[set].entries` contains `{start:"7:00 PM",title:"Load In"}` + `{start:"8:30 PM",title:"Room Access"}` (kind absent). *Catches: label not reaching the entry.*
- With `setAgendaRaw="11:00 AM LOAD IN"` (time-first), `loadIn="11:00 AM"`, `setupTime=null` → exactly one `{start:"11:00 AM",title:"Load In"}` (fall-through). *Catches: regression of the dominant corpus shape.*
- With `setAgendaRaw=null`, `loadIn`/`setupTime` set → today's 2 entries verbatim. *Catches: fall-through path breaking.*
- **Append-not-overwrite:** a pre-existing grid `ScheduleDay` on `dates.set` keeps its grid entries AND gains the SET entries. *Catches: collision/overwrite (R10/R13 class).*
- **Clock equals field + label correct (no-drift, R2 P1d pin):** for a SET cell `"Load In: 7:00&#9;PM Room Access: 8:30 PM"`, the first entry's `start` `===` `dates.loadIn` (`"7:00 PM"` on both — both derive from `decodeEntities(clean(row[4]))`) AND the second entry's `title` `=== "Room Access"` (not `"PM Room Access"`). *Catches: tokenizer/loadIn drift (resolveKeyTimes) AND the entity-mislabel.*

**D. `dates.ts` capture** (`tests/parser/blocks/dates.test.ts`, extend):
- A `SET` row with TIME `"Load In: 7:00 PM Room Access: 8:30 PM"` → `dates.setAgendaRaw === "Load In: 7:00 PM Room Access: 8:30 PM"` (raw cell) AND `dates.loadIn="7:00 PM"`, `dates.setupTime="8:30 PM"` (field capture unchanged). *Catches: precedence / not-captured / accidental decode-at-capture.*
- An empty/whitespace SET TIME cell → `dates.setAgendaRaw === null`. *Catches: empty cell not nulled.*
- `travel_set` fills `setAgendaRaw` only if unset; explicit `set` overrides. *Catches: precedence inversion.*

**E. Integration** (`tests/parser/scheduleBookendsIntegration.test.ts` or `parseSheet`):
- The RFI/PCF fixture (`fixtures/shows/raw/2025-05-redefining-fixed-income-private-credit.md` or its `exporter-xlsx` sibling `fixtures/shows/exporter-xlsx/redefining-fi.md`) parsed end-to-end → SET day run-of-show contains a `"Room Access"` entry, **not** `"Setup"`. *Catches: the whole pipeline, asserted against the data source (the parse result), not a rendered container (anti-tautology rule).*

**F. Strip / no-persist (R2 P1c pin)** (`tests/parser/scheduleBookendsIntegration.test.ts` or `parseSheet`):
- `parseSheet(...).show.dates` for the RFI/PCF fixture does **not** have a `setAgendaRaw` own-property (`expect("setAgendaRaw" in show.dates).toBe(false)`), even though the run-of-show still has the `"Room Access"` entry. *Catches: the transient field leaking into the persisted/projected `dates` (the exact R2 P1c failure).*

---

## 10. Self-review checklist (project Spec self-review additions)

- **Guard conditions for every input:** §6 table — null/empty/0-clock/1-clock/N/label-no-clock all specified. ✅
- **Mode boundaries:** §4.4 — label-before vs position-default, with trigger + examples. ✅
- **Cap/truncation:** §5 — caps unchanged (20/6), 3rd+ unlabeled skipped, realistic N never hits cap. ✅
- **Existing-code citations:** §3/§4/§5 every claim cites `file:line`; verified against the worktree (`origin/main` @ 4db99621). ✅
- **Numeric sweep:** the literals are `20`/`6` (caps, §5), `2` (max corpus clocks, §2), `16` (shows surveyed, §2). Cross-checked. ✅
- **Tier×domain / CHECK-enum / migration matrices:** N/A — no DB (§8.4). Stated explicitly. ✅
- **Flag lifecycle:** §7 — `setAgendaRaw` storage/write/read/effect; one writer, one reader, no zombie. ✅
- **Disagreement-loop preempt:** §8 — 8 do-not-relitigate items each with precedent citation. ✅
- **Build-vs-runtime gate:** N/A — no env gate. ✅
- **Dimensional invariants / transition inventory:** N/A — no UI (§8.3). ✅
- **Meta-test inventory:** none created/extended — this change touches no Supabase boundary, no admin_alerts, no advisory lock, no tile sentinel, no email normalization. Declared explicitly: **"None applies — parser-pure change."** ✅

---

## 11. Implementation surface summary

| File | Change |
|---|---|
| `lib/parser/types.ts` | + `setAgendaRaw?: string \| null` (parse-transient) on `dates` |
| `lib/parser/blocks/dates.ts` | refactor `extractClockTimes` → `extractClockTimeTokens` core + decoding wrapper; capture `setAgendaRaw` in `set`/`travel_set` cases + init in result literal; extend `_helpers` import with `decodeEntities` |
| `lib/parser/blocks/scheduleBookends.ts` | + `tokenizeSetSchedule` + `labelBefore`; rewrite SET branch (`:100-106`); new imports (`clean`, `decodeEntities`, `extractClockTimeTokens`, `shouldHideGenericOptional`) |
| `lib/parser/index.ts` | strip `setAgendaRaw` from `dates` before the `ShowRow` literal (`:418`); pass full `dates` to `deriveScheduleBookends` |
| `tests/parser/blocks/dates.test.ts` | + token core, decode, capture, precedence tests |
| `tests/parser/blocks/scheduleBookends.test.ts` | + tokenizer + SET-branch tests |
| `tests/parser/scheduleBookendsIntegration.test.ts` | + RFI/PCF end-to-end label assertion + strip/no-persist assertion |
| `DEFERRED.md` | resolve **D-SET1** (mark shipped) |

No other files. No UI, no DB, no migrations, no catalog, no generated artifacts.
