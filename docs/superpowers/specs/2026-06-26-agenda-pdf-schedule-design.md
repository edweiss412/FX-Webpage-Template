# Agenda-PDF Surfacing on the Schedule Section — Design Spec

**Date:** 2026-06-26
**Status:** Design (autonomous-ship pipeline)
**Author:** Opus / Claude Code
**Routing:** UI = Opus + impeccable v3 dual-gate (invariant 8). Sync/parser modules = Opus (same session, autonomous).

---

## 1. Problem & motivation

For many shows, the crew **Schedule** section is nearly empty. The structured schedule is derived only from the `DATES` block's `TIME / AGENDA` column (`lib/parser/blocks/scheduleTimes.ts`), which holds sparse key-times ("GS: 8:00 AM –", "4:15pm Meeting Concludes"). The **actual run-of-show** lives in **agenda PDFs** that Doug links from the INFO tab's `AGENDA LINK` rows. Today those PDFs surface **nowhere** on the crew page:

- The PDF viewer (`components/agenda/AgendaEmbed.tsx`) only renders when an `agenda_links` entry carries a Drive `fileId`, AND it is mounted in **Diagrams** (`components/crew/DiagramsBlock.tsx`), not Schedule.
- For **smart-chip** links the parser never gets a `fileId` at all (chips don't survive the xlsx export the parser reads).

This spec surfaces the real agenda on the **Schedule** section, two ways: (1) always an authoritative **PDF embed**, and (2) a **structured per-day schedule** extracted from the PDF, shown only when extraction is high-confidence.

### 1.1 Verified facts (live-probed, not assumed)

These were confirmed by live probing during brainstorming (recorded in memory `project_agenda_pdf_schedule`):

- `AGENDA LINK` cells come in **two forms**:
  - **Drive smart-chips** (e.g. "II – Redefining Fixed Income / Private Credit", sheet `1HHw…`): the fileId is **not** present in the xlsx export, the Sheets values API, or `=FORMULA`. It is only retrievable via the Sheets API `spreadsheets.get` field `sheets.data.rowData.values.chipRuns[].chip.richLinkProperties.uri` (a `https://drive.google.com/file/d/<id>/view` URL). Confirmed: B34→`1tuhXLwKG6ClClZjCWoQPkQhCnxo2w22O` (RFI, May 13), B35→`1JaC5oGW7vyDEZ-TE6LC583eCH6N3HXLi` (PCF, May 14).
  - **Plain Drive URLs** in the cell text (e.g. "II – Fixed Income Trading Summit", sheet `1xBbpHi…`, URL fileId `1TTcn4gNm1svFvbtrvPPpSty0OND478n9`): `parseAgendaLinks` (`lib/parser/index.ts:234`, regex `/\/d\/([a-zA-Z0-9_-]+)/`) **already** extracts the fileId today.
- The **production service account** `fxav-reader@fxav-crew-pages.iam.gserviceaccount.com` (scopes `drive.readonly` + `spreadsheets.readonly`, `lib/drive/client.ts:3-5,41-44`, creds from `process.env.GOOGLE_SERVICE_ACCOUNT_JSON`) can both recover the chip fileIds **and download the PDF bytes** (probed: RFI 538,980 B, PCF 495,409 B, both `%PDF-`). A personal-Drive-search miss does NOT mean the SA can't read it.
- A self-calibrating pdfjs text-layer extractor reaches ~98% times / ~88–100% titles+rooms across three different II templates (Forum, Forum, TraderForum) with **one codebase, zero per-document hardcoding** — and the failure case (a source `12:25 AM` typo) is automatically caught by a monotonicity check and either auto-corrected or gated.

---

## 2. Goals / non-goals

**Goals**
- Recover agenda-PDF `fileId`s at sync for **both** link forms (chips + URLs).
- Always embed the authoritative agenda PDF(s) on the **Schedule** section (one "View agenda" affordance per PDF — multi-doc).
- Extract a structured per-day schedule from each PDF; render it on Schedule **only when confidence is HIGH**.
- Auto-correct **mechanically-forced** time errors (AM/PM monotonicity) with a visible **drift** annotation, and surface a data-quality note to admin.
- Degrade safely: low confidence or an unknown future template → **embed-only**, never garbage.

**Non-goals (explicitly out of scope)**
- The `SCHEDULE_TIME_UNPARSED` (`…` placeholder) warning on the DATES column — unchanged; separate data issue.
- The title-less **AGENDA tab** timing skeleton — not read (renders nothing useful; PDFs are the agenda).
- Deep-linking the `UNKNOWN_ROLE_TOKEN` ("Role we didn't recognize") warning — separate follow-up, not this PR.
- Merging extracted sessions into the existing `run_of_show` (DATES-column) schedule — kept separate to preserve that field's semantics.
- OCR / scanned PDFs — all observed agendas have a real text layer; if a PDF has no text layer, extraction yields 0 sessions → embed-only (covered by the confidence gate).
- Cross-vendor generalization guarantees — only II templates exist today; the **confidence gate** is the structural defense for the day a non-II template appears.

---

## 3. Architecture & data flow

```
SYNC (server, has Drive SA + PDF bytes)                     RENDER (server component)
────────────────────────────────────────                   ───────────────────────────
parseSheet → parseAgendaLinks                               getShowForViewer
   → agenda_links: [{label, url?|fileId?}]                     → data.show.agenda_links (jsonb)
        │                                                            │
   enrichAgenda (NEW, best-effort, gated):                    ScheduleSection (UI)
     1. recover fileId:                                          ├─ AgendaEmbed (moved here, multi-doc):
        - chip: Sheets API chipRuns → /d/<id>                   │     one "View agenda" per link w/ fileId
        - url:  already-parsed fileId                           └─ AgendaScheduleBlock (NEW), per link:
     2. download PDF bytes (Drive SA, by fileId)                      if extracted?.confidence==='high'
     3. extractAgendaSchedule(bytes) → {confidence, days, …}             → render per-day sessions + drift flags
     4. attach to agenda_links[i].fileId + .extracted                else → nothing (embed is the surface)
        │
   applyParseResult → persist agenda_links jsonb (+ admin data-quality note)
```

**Why the recovery+extraction live in the sync/enrich layer, not the parser:** the pure parser runs on reshaped markdown and never sees chips or PDF bytes — exactly the boundary `enrichWithDrivePins` (`lib/sync/enrichWithDrivePins.ts`) already owns ("pin Drive things the parser couldn't"). This new work is a sibling enrichment step.

---

## 4. Components

### 4.1 `lib/agenda/extractAgendaSchedule.ts` (NEW — pure module)

Pure function: `extractAgendaSchedule(pdfBytes: Uint8Array): AgendaExtraction`. No Drive/network. Uses `pdfjs-dist` (`legacy/build/pdf.mjs`, already a dependency at `5.4.296`, used client-side by `AgendaPdfViewer`). Algorithm (validated as prototype v5):

1. **Lines**: per page, group text items by rounded Y (reading order), record dominant `(fontId,size)` and joined text. Drop chrome (`^Page \d+`, running header, superscript `th`).
2. **Self-calibration** (no hardcoded fonts):
   - `timeSize` = modal font-size among lines matching a clock regex (≈14 across all observed templates — the universal anchor).
   - `bodyKey` = modal `(font,size)` among long (>55 char) lines (paragraph text).
   - `titleKeys` = `(font,size)`s that appear ≥2× directly above a time anchor.
   - rooms: a candidate line is a **real room** iff it matches a room-keyword regex (`Ballroom|Salon|Foyer|Room|Hall|Suite|Lakeview|LaSalle|Adorn|Delaware|Drawing|…`) **or** recurs ≥2× as a post-time candidate (rooms repeat; subtitles are unique).
3. **Day partition**: lines matching `^(Mon|Tue|Wed…)day…<year>` are day headers; each session inherits the most-recent day header.
4. **Session assembly** anchored on each time line: title = title-font/non-body lines immediately above (stop at a real room, a `LABEL:` byline, or another time) + title-font lines immediately below before the room (wrap/subtitle); room = first real-room line after; **breakout tracks** = `^(Breakout [IVX\d]+|[IVX]+\.|Track …)` markers within the span, each → `{label, title?, room?}`.
5. **Time normalize**: strip intra-token spaces; an explicit `AM`/`PM` in the source is always honored. For a **bare** clock (no meridiem), meridiem is inferred **order-aware**, not by a fixed hour bucket (§4.3.1) — this is what prevents a 7–11 PM evening session from becoming AM (Codex R1).
6. **Deterministic time repair** for *explicit*-meridiem typos (§4.3.2).
7. **Confidence gate** (§4.4) → returns `confidence: 'high' | 'low'`.

**LABEL bylines MUST require a trailing colon** (`/^(Moderator|Panelists?|Chairperson|…)\s*:/`) — without the colon they swallow titles like "Chairperson's Welcome & Benchmarking Session".

### 4.2 Types (extend existing, no migration)

`ShowRow["agenda_links"]` (`lib/parser/types.ts:122`) extends each entry to:
```ts
agenda_links: {
  label: string;
  fileId?: string;
  url?: string;
  extracted?: AgendaExtraction;  // NEW, optional
}[]
```
```ts
type AgendaExtraction = {
  confidence: 'high' | 'low';
  corrections: number;          // count of drift auto-corrections applied
  days: AgendaDay[];            // [] when confidence==='low'
  sourceRevision?: string;      // Drive headRevisionId of the PDF the extraction was computed from
  extractorVersion: number;     // EXTRACTOR_VERSION at extraction time — part of the cache key (Codex R5)
};
type AgendaDay = { dayLabel: string; date: string | null; sessions: AgendaSession[] };
type AgendaSession = {
  time: string;                 // normalized, e.g. "9:00 AM – 9:40 AM"
  title: string | null;
  room: string | null;
  tracks: { label: string; title: string | null; room: string | null }[];
  drift: string | null;         // e.g. "start→12:25 PM (source: 12:25 AM)" or null
};
```
`agenda_links` is a **jsonb column** (`getShowForViewer.ts:358` decodes via `decodeJsonbColumn`), so adding optional fields to the stored value is **migration-free**. Render-time decode tolerates missing `extracted` (old rows) → treated as no structured schedule.

### 4.3 Time resolution: order-aware inference (4.3.1) + explicit-typo repair (4.3.2)

Two distinct steps. **4.3.1 resolves bare clocks** so they are monotonic *by construction* (no drift flag). **4.3.2 repairs only EXPLICIT meridiem typos** (e.g. `12:25 AM` for a lunch) and is the *only* thing that produces a `drift`. Both run per-day, in document order. We never invent a value; we only choose among the two meridiems the source allows.

Define `min(h, ap)` = absolute minute-of-day for hour:minute with meridiem `ap` (`12 AM`→0, `12 PM`→720, etc.). Track `prevStart` = the previous session's resolved start (null for the first).

#### 4.3.1 Order-aware bare-clock inference (Codex R1)
For a clock with **no explicit meridiem**, compute both candidates `am = min(h,'AM')` and `pm = min(h,'PM')` (note `pm ≥ am` always) and choose:
- **First time of the day** (`prevStart == null`): conference-plausibility seed — hour 7–11 → AM; hour 12 → PM; hour 1–6 → PM. (Mornings start 7–11; an afternoon-only day 1, e.g. FIT, starts 1–6 PM.)
- **Otherwise**: the **smallest candidate that is ≥ `prevStart`** (forward-monotonic fill). If `am ≥ prevStart` → AM; else if `pm ≥ prevStart` → PM; else (both < prevStart — only possible when the day is genuinely non-linear) → PM as best-effort (the day will then likely fail §4.4 monotonicity → embed-only).

This resolves `7:00` after a `5:00 PM` session to **7:00 PM** (not AM), with **no drift flag** — fixing the fixed-bucket bug. An explicit `AM`/`PM` is never overridden here.

#### 4.3.2 Explicit-meridiem repair (the only source of `drift`)
A session's **start** is a *repair candidate* iff its meridiem was **explicit in the source** AND `start < prevStart` (a backwards jump). Apply a meridiem flip iff **all** hold (a *forced* flip):
1. flipped start ≥ `prevStart`;
2. the session has an **end** and flipped start ≤ end; **or** it has no end and (next session's start exists ⇒ flipped start ≤ next start; else no upper bound);
3. the flip is **unique** — exactly one meridiem satisfies (1)+(2).

On apply: set `session.drift = "start→<new> (source: <old>)"`, increment `corrections`, update `prevStart`. Analogously for an explicit **end < its own start**, flip the end only if **all** hold (Codex round-3 MED — distinguishes a typo from a real overnight): (i) flipped end ≥ start; (ii) next start ⇒ flipped end ≤ next start; (iii) the resulting **same-day duration ≤ `AGENDA_MAX_SESSION_MIN`** (a single conference-plausibility cap; conference sessions are short, the longest observed is an ~80-min lunch). A genuine cross-midnight `11 PM–1 AM` fails (i) (flipped `1 PM` < `11 PM`) → left intact; an `11 AM–1 AM` typo flips to `1 PM` (a plausible ~2-h session) only because (iii) holds. **End times never enter the §4.4 gate predicate** (start-only), so end-repair is *display correctness only* and can never gate a valid agenda; a non-repairable end is rendered as the source shows (or omitted if nonsensical). 

**Edge-case policy (Codex R3):**
- **First session** (`prevStart == null`): never a start-repair candidate (nothing to violate).
- **Equal boundaries** (`start == prevStart`, or `start == end`): allowed, not a violation (concurrent/zero-length sessions are legal).
- **Missing end**: use the next session's start as the upper bound; if neither exists, only precondition (1) applies.
- **Overnight / genuinely backward**: a flip that does not satisfy (1)+(2) is **not** applied — a legitimate cross-midnight or out-of-order session is left intact and merely contributes to a non-monotonic day (→ §4.4 gates to embed). Repair can therefore never corrupt a non-linear agenda.
- **Bare clocks are never repair candidates** — 4.3.1 already made them monotonic.

### 4.4 Confidence gate (single source of truth for thresholds)

`confidence = 'high'` iff **all** of:
- `sessions ≥ 5`
- `% of detected time-anchor lines that normalized to a valid time ≥ 95%` — the denominator is **time-anchor lines** (size == `timeSize`), NOT sessions (Codex round-3 MED: "% of sessions with a time" is tautological because a session is only created from a parsed time). A low ratio means many size-`timeSize` lines were *not* real clocks → mis-calibration → gate to `'low'`.
- `% sessions with a title ≥ 80%`
- `% sessions with a room ≥ 75%`
- **start-monotonic within each day** — exact predicate below
- **no ambiguous-first-clock day** — guard below

Otherwise `'low'`. `confidence==='low'` ⇒ `days: []` ⇒ **embed-only** at render.

**Constants — single source of truth (Codex round-4 MED).** All agenda magic numbers live in one module (e.g. `lib/agenda/constants.ts`); nothing restates a literal:
- `AGENDA_CONFIDENCE = { minSessions: 5, minTimeAnchorParsePct: 0.95, minTitlePct: 0.80, minRoomPct: 0.75 }`
- `AGENDA_MAX_SESSION_MIN = 240` — the §4.3.2 end-repair plausibility cap (4 h; the longest observed real session is an ~80-min lunch, so 240 generously admits any genuine session while rejecting a multi-hour fake-overnight produced by an erroneous end flip).
- `EXTRACTOR_VERSION = 1` — bumped on any change to extraction/inference/repair/gate logic; part of the §4.5.2 cache key.

**Exact monotonic predicate (Codex R2-round2).** "Start-monotonic" means: for the sessions of a day in document order, each resolved **start** absolute-minute is `≥` the previous session's resolved start (`prev ≤ cur`, **non-strict** — equal starts are allowed so concurrent/zero-length sessions pass). The predicate is over **start times ONLY**. **End times are deliberately excluded** — a legitimate overnight session has `end < start`, and breakout children overlap; including ends would mis-gate valid agendas. (§4.3.2 still uses a session's own end as a *repair fit-bound*, but the gate predicate never compares ends across sessions.) This is the single definition; §4.3.2's `prevStart` tracking computes the same start sequence.

**Ambiguous-first-clock guard (Codex round-2 MEDIUM).** A bare (no-meridiem) first clock with hour 7–11 is genuinely undecidable AM-vs-PM with no preceding context, yet §4.3.1 seeds it to AM and §4.3.2 never repairs a bare clock — so an evening-only day could silently pass as morning. Therefore: **if any day's first session has a time token with NO explicit `AM`/`PM` anywhere in it AND a leading hour in 7–11, the show is `confidence:'low'` (embed-only).** (In practice morning agendas carry an explicit `AM` on the first session — RFI/PCF/FIT all do — so this gate rarely fires; when it does, the embed is the safe surface.)

**Monotonicity = the linearity check (Codex R2).** The structured render is defined **only for strictly time-ordered (linear) agendas**. A PDF that lists concurrent sessions as separate top-level rows (rather than as breakout children of one slot), or that sorts by track/room instead of time, is legitimately non-monotonic → `confidence:'low'` → **embed-only**. This is **by design** — the embed is the correct surface for a non-linear agenda — not an extraction failure. Combined with §4.3.2's forced-flip-only rule, a non-linear agenda **cannot be corrupted**: at worst it gates to the embed. (Future work could detect concurrent-session grouping and lift this restriction; v1 deliberately scopes structured render to linear agendas.)

### 4.5 `enrichAgenda` (sync step — `lib/sync/enrichAgenda.ts`, NEW)

Runs **inside the shared enrich step** so all sync paths inherit it (§4.5.4). Best-effort, fully wrapped in try/catch (a failure leaves links unenriched, **never breaks the scan** — mirrors PR #134's anchor attach). For each `agenda_links` entry:

1. **fileId recovery — document-order (ordinal) correlation, NOT filename-match (Codex R4 round 2).** `getAgendaChips(spreadsheetId)` (§4.5.3) returns **every** `AGENDA LINK` row of the INFO tab in **grid row order (top→bottom)** as `{ label, chipFileId: string | null }[]` — located by scanning for label cells starting with `AGENDA LINK`/`AGENDA` (analogous to `lib/drive/showDayTimeAnchors.ts`) and reading the chip (if any) in the adjacent value cell. The parser emits `agenda_links` in the **same document order** (`parseAgendaLinks` scans the synthesized markdown top→bottom). Correlate the **full ordered `agenda_links` list 1:1 by position** to the full ordered chip-row list. **Counts must match exactly**; if they diverge (an unexpected extra/missing row), the mapping is untrustworthy → bind nothing → `AGENDA_PDF_UNREADABLE` for the affected entries (no guess). For each fileId-less entry, adopt its correlated row's `chipFileId`. The entry `label` is a **sanity assertion only** (position i's labels should match; a mismatch is treated as divergence → no bind). **No filename matching anywhere** — duplicate labels are irrelevant because ordinal position disambiguates. **URL-form entries already carry `fileId`** (parser) and keep it; they still occupy their ordinal slot so the 1:1 alignment holds.
2. **bytes + cache key (Codex R5).** `getFile(fileId)` → `headRevisionId`; **skip re-extraction iff** `extracted.sourceRevision === headRevisionId` **AND** `extracted.extractorVersion === EXTRACTOR_VERSION` (a single exported constant bumped on any extractor logic/threshold change — so old payloads invalidate when the algorithm changes, not just when the PDF changes). On a cache miss, `downloadFileBytes(fileId)` (§4.5.3).
3. **extract**: `extractAgendaSchedule(bytes)` → attach `extracted` (with `sourceRevision` + `extractorVersion`). On download/parse failure or 0 sessions → emit `AGENDA_PDF_UNREADABLE`; on `confidence:'low'` → `AGENDA_SCHEDULE_LOW_CONFIDENCE`; on `corrections > 0` → `AGENDA_SCHEDULE_TIME_ADJUSTED`.
4. The `getAgendaChips` (Sheets `spreadsheets.get`) call is **gated** — fired only when ≥1 entry lacks a `fileId`, so URL-only shows pay no extra round-trip.

#### 4.5.3 DriveClient interface extension (Codex R6)
The `DriveClient` interface (`lib/sync/enrichWithDrivePins.ts`) has **no byte-download and no chip method today**, so the spec extends it with two methods, implemented by **every** `DriveClient` impl:
- `downloadFileBytes(fileId: string): Promise<{ kind: 'bytes'; bytes: Uint8Array } | { kind: 'unavailable' } | { kind: 'infra_error' }>` — Drive `files.get({alt:'media', supportsAllDrives:true})`. Invariant 9 — the outcome is **discriminated** (Codex round-3 LOW): `unavailable` = trashed / non-PDF / 404 / permission (→ `AGENDA_PDF_UNREADABLE`, and the cache may store a low-confidence/empty result); `infra_error` = transient/5xx/network (→ NOT cached, NOT a data-quality note — retried next sync); `bytes` = success. Callers must not collapse `infra_error` into `unavailable`.
- `getAgendaChips(spreadsheetId: string): Promise<{ kind: 'rows'; rows: { label: string; chipFileId: string | null }[] } | { kind: 'infra_error' }>` — Sheets `spreadsheets.get` with grid data + `chipRuns(chip(richLinkProperties(uri)))` + `formattedValue`, scanning the INFO tab. On success → `{ kind:'rows', rows }` with one element **per agenda-link row in grid row order** (`chipFileId` = `/d/<id>` from the value cell's chip `uri`, or `null` when that row's value is a plain URL/text). On a Sheets-API fault → `{ kind:'infra_error' }` — a **real union** so "couldn't read the sheet" can never collapse into "no agenda rows / count mismatch" (Codex round-4 HIGH; parallels `downloadFileBytes`; invariant 9). **Caller behavior:** `infra_error` ⇒ leave links unenriched and retry next sync (NOT a count-mismatch, NOT `AGENDA_PDF_UNREADABLE`, NOT cached); `rows` (including an empty array) ⇒ proceed with §4.5.1 ordinal correlation. Order preservation within `rows` is the contract §4.5.1 depends on.

**Shared row-selection predicate (Codex round-3 HIGH — structural defense).** The ordinal alignment of §4.5.1 is sound only if `parseAgendaLinks` and `getAgendaChips` select *the same* rows. Both MUST therefore use a **single shared predicate** `isAgendaLinkRow(label: string, value: string): boolean` (extracted to e.g. `lib/parser/agendaLinkRow.ts`): `label` matches `/^(AGENDA LINK.*|AGENDA)$/i` after trim **AND** `value` is non-empty after trim — exactly mirroring `parseAgendaLinks`'s current inline test (`lib/parser/index.ts:241-245`). `parseAgendaLinks` is refactored to call it (after regex-extracting label+value from a markdown line); `getAgendaChips` calls it per grid row (label cell, value cell). Because both sides apply the identical predicate, blank-value / label-only / template rows are excluded by **both** → the sequences align 1:1 in all non-pathological cases, so a stray INFO row cannot silently suppress every chip PDF (the failure mode Codex flagged). A **structural test** pins that `parseAgendaLinks` and `getAgendaChips` both route through `isAgendaLinkRow` (the count-mismatch guard in §4.5.1 remains only as a residual backstop).

Real impl in `lib/drive/*` (uses the verified SA). The **dev `mockDriveClient`** (`lib/sync/mocks/mockDriveClient.ts`) implements both with deterministic fixtures so the dev-preview path and tests have coverage. A **structural meta-test** asserts every `DriveClient` impl (real + mock) provides both methods, so a new caller can't silently skip them.

#### 4.5.4 All sync paths inherit it (companion-surface discipline)
`enrichAgenda` is invoked from the **shared enrich step** that all four callers already use (`runOnboardingScan`, `runScheduledCronSync`, dev `app/admin/dev/actions.ts`, retry `app/api/admin/pending-ingestions/[id]/retry/route.ts`). A test asserts the enriched `agenda_links` (with `fileId`/`extracted`) reaches `applyParseResult` on both the onboarding and cron paths.

**Supabase/Drive call-boundary discipline (invariant 9):** every Drive/Sheets call distinguishes infra fault from "no chip found"; infra faults surface as a discriminable result (`null` / typed), never a silent `continue`. Registered in the structural infra-contract meta-test or carrying an inline `// not-subject-to-meta: <reason>`.

### 4.6 `AgendaEmbed` — multi-doc + relocate (UI)

- **Lift the v1 single-doc cap** (`AgendaEmbed.tsx:67` `agendaLinks.find(l => l.fileId)`): render **one** "View agenda" affordance **per** `agenda_links` entry that has a `fileId`. Label = the `AGENDA LINK` suffix (strip the `AGENDA LINK -? ` prefix → "RFI" / "PCF"); bare `AGENDA` → just "View agenda".
- **Relocate the mount** — current location: `AgendaEmbed` is rendered inside `DiagramsTile` (`components/crew/DiagramsBlock.tsx:137,140`), which is rendered by `VenueSection` (`components/crew/sections/VenueSection.tsx:326`, passing `agendaLinks: data.show.agenda_links`). The move requires **three coordinated edits**, not just relocating the JSX:
  1. **Add** `AgendaEmbed` (multi-doc) to `ScheduleSection`, reading `data.show.agenda_links` (already on `data.show`).
  2. **Remove** `AgendaEmbed` + the `agendaLinks` prop from `DiagramsTile`, and stop factoring agenda into `shouldHideDiagrams` (`DiagramsBlock.tsx:102-103` `hasAgendaPdf`) — after the move, Diagrams hides on diagram content alone (room plots / signal-flow only).
  3. **Update** `VenueSection`'s show-gate (`VenueSection.tsx:185`, which currently keeps the block visible when `agenda_links.some(l => l.fileId)`) so agenda presence no longer forces the Venue/Diagrams block to render — otherwise a show with *only* an agenda (no diagrams) would render an empty Diagrams block.
  A regression test asserts: agenda affordance present in Schedule, **absent** from Diagrams/Venue, and a diagram-less + agenda-only show renders no empty Diagrams block.
- Each affordance opens the existing `AgendaSheet`/`AgendaPdfViewer` (unchanged) via the existing proxy `app/api/asset/agenda/[show]/[id]/route.ts` (confirmed: binds `[id]` to `agenda_links[*].fileId` at `:241`, downloads via Drive SA `alt:"media"` at `:462`).

### 4.7 `AgendaScheduleBlock` (NEW — UI, in ScheduleSection)

Renders the extracted structured schedule for links whose `extracted.confidence === 'high'`. Per day: a day heading + a list of sessions (time · title · room), breakout tracks indented, and a **drift indicator** on any session with `drift != null` ("Adjusted — tap to verify against the agenda", with the original value available). Always paired with the "View full agenda" embed (source of truth). When no link is high-confidence → render nothing (embed alone is the surface).

### 4.8 Placement within Schedule

A self-contained agenda area at the **top of the Schedule section**, above the existing day-cards grid (the agenda is the authoritative overview). Styling/placement goes through the invariant-8 impeccable dual-gate + a real-browser Playwright layout assertion.

### 4.9 Admin data-quality notes (§12.4 catalog codes)

New admin/Doug-facing parse-warning codes (NOT crew-facing), following the 3-part lockstep (master-spec §12.4 prose + `pnpm gen:spec-codes` → `lib/messages/__generated__/spec-codes.ts` + `lib/messages/catalog.ts`; the `x1-catalog-parity` gate enforces all three move together):
- `AGENDA_PDF_UNREADABLE` — a linked agenda PDF could not be downloaded/parsed (bytes failed or 0 sessions). Effect: embed-only (or, if bytes failed, the link still shows if a fileId exists).
- `AGENDA_SCHEDULE_LOW_CONFIDENCE` — extraction ran but was gated to embed-only (admin signal that the structured schedule is suppressed).
- `AGENDA_SCHEDULE_TIME_ADJUSTED` — ≥1 session time was auto-corrected (drift); tells Doug to fix the source typo.

**Persistence path (Codex R7):** `enrichAgenda` pushes these onto the existing `parseResult.warnings: ParseWarning[]` array (`severity:'warn'`) — the same array `enrichWithDrivePins` already appends to. That array is persisted by the sync layer to `shows_internal.parse_warnings` (jsonb; `runScheduledCronSync.ts:577` reads/writes `parse_warnings`) and surfaced to admin through the existing parse-warning flow — **no new persistence channel**. They are admin-facing only (never crew). All copy is Doug-voice, no raw codes in UI (invariant 5; read via `lib/messages/lookup.ts`).

---

## 5. Guard conditions (every input)

| Input | null / empty / malformed | Behavior |
|---|---|---|
| `agenda_links` | `null`/`[]` | No agenda area renders (existing empty behavior). |
| entry `.fileId` | absent (url-only with no `/d/`, or a chip that resolved to no fileId) | No embed affordance for that entry; no extraction. Emit `AGENDA_PDF_UNREADABLE` only when a chip row was present but yielded no usable fileId. A **transient `infra_error`** from `getAgendaChips`/`downloadFileBytes` does NOT emit a data-quality note (it's retried next sync) — links are simply left unenriched this pass (Codex round-4 LOW). |
| entry `.extracted` | absent (old row / not yet synced) | Embed-only for that link. |
| `extracted.confidence` | `'low'` | `days: []` → embed-only. |
| `extracted.days` | `[]` | AgendaScheduleBlock renders nothing. |
| `session.title` | `null` | Render time + room only (no title line). |
| `session.room` | `null` | Render time + title only. |
| `session.time` | (never null — anchor) | n/a; a session is only created from a parsed time. |
| `session.drift` | `null` | No drift indicator. |
| PDF bytes | download fails / non-PDF / no text layer | extractor returns `{confidence:'low', days:[]}`; `AGENDA_PDF_UNREADABLE`; embed still shown if `fileId` present. |
| pdfjs throws | — | caught in `enrichAgenda`; link left unenriched; scan continues. |
| `extracted` (malformed jsonb) | `confidence:'high'` w/ missing/empty `days`; non-array `tracks`; non-string `time`/`drift`; corrupt session | render-boundary validator (below) → treated as **embed-only**. |

**Render-boundary normalization contract (Codex R8):** a pure validator `normalizeAgendaExtraction(raw: unknown): AgendaExtraction | null` narrows the decoded jsonb at the read boundary (mirrors the defensive posture of `decodeJsonbColumn`): it returns `null` (⇒ embed-only) unless `raw` is exactly `{ confidence: 'high'|'low', days: AgendaDay[] }` with well-typed sessions (`time: string`, `title/room/drift: string|null`, `tracks: Array`). A `confidence:'high'` payload with missing/empty/malformed `days` is coerced to embed-only, never rendered. `AgendaScheduleBlock` consumes only the validator's output — never the raw jsonb.

---

## 6. Dimensional invariants & transition inventory (UI)

**Dimensional invariants** (Tailwind v4 has no default `align-items: stretch`):
- The agenda area and the day-cards grid each carry `min-w-0` so long titles/rooms wrap (not overflow) at 320px.
- Session rows use `grid-cols-[auto_minmax(0,1fr)]` (or equivalent) with `min-w-0` + `wrap-break-word` on the text cell so an unbreakable long title wraps.
- A Playwright layout task asserts `getBoundingClientRect()` for each `data-testid` agenda row stays within its parent width (no horizontal overflow) at 320/390/720px.

**Transition inventory** (visual states): the agenda area has these states — (a) embed-only, (b) embed + structured schedule, (c) nothing (no agenda). These are **server-rendered, content-driven** (depend on stored data), not interactive toggles, so each is an **instant render — no animation needed**. The only interactive transition is opening the PDF sheet, which reuses the existing `AgendaSheet` open/close behavior (unchanged). A transition-audit task confirms no `AnimatePresence`/ternary in the new block needs `exit`/`initial`.

---

## 7. Flag lifecycle

| Flag/field | Storage | Write path | Read path | Effect |
|---|---|---|---|---|
| `agenda_links[].fileId` | jsonb (existing) | `enrichAgenda` (chip recovery) / `parseAgendaLinks` (url) | `getShowForViewer` → AgendaEmbed | Enables the "View agenda" embed + the proxy binding |
| `agenda_links[].extracted` | jsonb (NEW field) | `enrichAgenda` → `extractAgendaSchedule` | `getShowForViewer` → AgendaScheduleBlock | High-confidence → structured schedule renders; low → embed-only |
| `extracted.confidence` | jsonb | `extractAgendaSchedule` gate | AgendaScheduleBlock | The render gate |
| `extracted.days[].sessions[].drift` | jsonb | §4.3 repair | AgendaScheduleBlock + admin note | Drift indicator + `AGENDA_SCHEDULE_TIME_ADJUSTED` |

No zombie flags: every field written is read and has an output effect.

---

## 8. Testing strategy

- **Extractor unit tests** (`tests/agenda/extractAgendaSchedule.test.ts`): run against committed fixture byte-PDFs derived from the three real agendas (RFI/PCF/FIT). Assert per-field accuracy against **hand-transcribed ground truth** (the data source, not the rendered output — anti-tautology). Concrete failure modes each test catches: wrapped-title truncation; AM/PM on an afternoon-start day (FIT day 1 must be PM); the `12:25 AM` source typo must be auto-corrected to PM **and** carry a `drift`; an unknown/garbage PDF must yield `confidence:'low'`; the breakout markers must produce ≥2 tracks for RFI. Derive expectations from fixture dimensions where possible; never hardcode a value a 2-session fixture can't reach.
- **Confidence-gate tests**: a doctored fixture that fails each threshold (≥5, times, titles, rooms) individually → `'low'`. **Start-monotonic predicate**: equal/concurrent starts PASS (non-strict); an overnight `end < start` does NOT fail the gate (ends excluded); a true backwards START fails. **Ambiguous-first-clock**: a day whose first time is a bare `7:00`–`11:00` (no meridiem) → `'low'`; the same first time written `7:00 AM` → passes.
- **Order-aware inference tests (§4.3.1)**: a `7:00` bare clock after a `5:00 PM` session resolves to **7:00 PM with NO drift flag** (the fixed-bucket-bug regression); afternoon-start day-1 (FIT) first session → PM; morning first session → AM.
- **Explicit-repair tests (§4.3.2)**: the `12:25 AM` forced flip applied + flagged; an *ambiguous* / non-fitting backwards jump is NOT flipped (left → drives `'low'`); overnight `11 PM–1 AM` end is NOT flipped (legitimate); first-session never repaired; equal/zero-length boundaries allowed.
- **enrichAgenda tests** (mocked Drive/Sheets): **ordinal (document-order) correlation** binds the i-th chip-row fileId to the i-th `agenda_links` entry — verified robust to **duplicate labels** (two `AGENDA LINK - X` rows still bind correctly by position) and to **interleaved url-form entries** (they hold their ordinal slot); **shared-predicate alignment** (a blank-value / label-only / template `AGENDA LINK` row is excluded by BOTH parser and chip scan → valid chips still bind, no suppression); **count-mismatch** (genuine divergence) → no bind → `AGENDA_PDF_UNREADABLE`, never a wrong PDF; **downloadFileBytes union** (`infra_error` retried, not a data-quality note; `unavailable` → `AGENDA_PDF_UNREADABLE`); **end-repair cap** (`11 PM–1 AM` overnight left intact; `11 AM–1 AM` typo → `1 PM`); url-form passthrough; cache-skip when `sourceRevision` **and** `extractorVersion` both unchanged; **re-extract when `extractorVersion` bumps** even if revision unchanged; best-effort — a thrown Drive error leaves links unenriched and does not throw out of the scan; infra-fault vs no-chip distinguished (invariant 9); the three data-quality codes land on `parseResult.warnings`.
- **normalizeAgendaExtraction tests**: `confidence:'high'` with missing/empty/malformed `days` → `null` (embed-only); valid payload passes through; corrupt session shapes rejected.
- **Component tests**: AgendaEmbed renders N affordances for N fileId links (multi-doc), 0 → nothing; removed from Diagrams; AgendaScheduleBlock renders sessions only when `confidence:'high'`, renders drift indicator when `drift!=null`, renders nothing when `'low'`. When scanning DOM for a session label, clone+strip sibling controls first (anti-self-satisfying).
- **Layout (real browser)**: Playwright overflow assertion at 320/390/720px.
- **Catalog parity** (`x1`): the three new §12.4 codes present in spec prose + generated + `catalog.ts`.

---

## 9. Meta-test inventory

- **Supabase call-boundary** (`tests/auth/_metaInfraContract.test.ts` or the analogous registry): `enrichAgenda`'s Drive/Sheets helpers either register a row or carry `// not-subject-to-meta: <reason>`.
- **No new advisory-lock surface** (no `pg_advisory*` touched) — declared N/A.
- **§12.4 catalog completeness** (`tests/messages/codes.test.ts` / `x1`): the three new codes.
- **DriveClient-impl completeness** (NEW structural test): asserts every `DriveClient` implementation (real + `mockDriveClient`) provides `downloadFileBytes` + `getAgendaChips`, so a new caller cannot silently skip the agenda surface (Codex R6).
- **Shared agenda-row predicate** (NEW structural test): asserts both `parseAgendaLinks` and `getAgendaChips` route row selection through the single `isAgendaLinkRow`, so the ordinal sequences can't drift (Codex round-3 HIGH).
- No new sentinel-hiding or admin_alerts.upsert surfaces.

---

## 10. Plan-wide invariant compliance

- (1) TDD per task. (2) No advisory locks touched. (3) Email canonicalization n/a. (4) No global sync cursor. (5) No raw error codes — new codes via `lib/messages/lookup.ts`. (6) Conventional commits (`feat(agenda):`, `feat(crew-page):`, `feat(sync):`, `test(agenda):`). (7) Spec canonical. (8) **UI impeccable v3 dual-gate** on the Schedule diff before close-out. (9) Supabase call-boundary discipline on `enrichAgenda`. **No DB migration** (jsonb extension) → validation-schema-parity is satisfied trivially, but `pnpm gen:schema-manifest` is re-run if any schema introspection changes (expected: none).

---

## 11. Risks & mitigations

- **pdfjs-dist in the sync runtime**: used client-side today; must run in the Node/server sync context. Mitigation: a plan task verifies `extractAgendaSchedule` runs under the sync runtime (Node import of `legacy/build/pdf.mjs`); if a worker/canvas dependency surfaces, configure the Node-safe path (no DOM needed — text content only).
- **Extra Drive downloads at sync**: one PDF download per agenda link. Mitigation: revision-cached (`sourceRevision`); bounded (0–2 per show); best-effort.
- **Future non-II template**: the confidence gate degrades it to embed-only. The extractor is self-calibrating, not II-hardcoded, but correctness is only *claimed* for the observed templates.
- **Text-layer noise** (`Allocation s`): cosmetic; the PDF embed remains source-of-truth and is always one tap away.

---

## 12. Open decisions (resolved)

- Multi-doc: **one affordance per PDF** (resolved with user).
- Placement: **Schedule**, removed from Diagrams (resolved).
- Embed vs parse: **both** — embed always, structured when high-confidence (resolved).
- Obvious bad data: **auto-correct forced AM/PM + show drift** (resolved with user).
- Storage: **extend `agenda_links` jsonb, no migration** (resolved from live code).
