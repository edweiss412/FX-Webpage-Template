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
5. **Time normalize**: strip intra-token spaces; AM/PM inference: hour 7–11→AM, 12 & 1–6→PM.
6. **Deterministic monotonic repair** (§4.3).
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
  sourceRevision?: string;      // Drive headRevisionId/md5 the extraction was computed from (cache key)
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

### 4.3 Deterministic AM/PM auto-correction + drift

Per day, walk sessions in order tracking `prevStart`. If a session's start < `prevStart` (a backwards jump) **and** flipping that time's meridiem makes it ≥ `prevStart` **and** ≤ its own end → apply the flip, set `session.drift`, increment `corrections`. Same for `end < start` within a session. **Only forced flips** (uniquely restore monotonicity AND fit between neighbors) are applied; anything ambiguous is left as-is (and will likely keep the show below the monotonicity bar → embed-only). We never invent or guess a value; we only repair a mechanically-certain meridiem error, and the `drift` string records exactly what changed vs. the source.

### 4.4 Confidence gate (single source of truth for thresholds)

`confidence = 'high'` iff **all** of:
- `sessions ≥ 5`
- `% sessions with a parsed time ≥ 95%`
- `% sessions with a title ≥ 80%`
- `% sessions with a room ≥ 75%`
- times are **monotonic within each day** (after §4.3 repair)

Otherwise `'low'`. These five numbers are defined **here only**; the implementation imports them from a single `AGENDA_CONFIDENCE` constant — no restating literals elsewhere. `confidence==='low'` ⇒ `days: []` ⇒ **embed-only** at render.

### 4.5 `enrichAgenda` (sync step — `lib/sync/enrichAgenda.ts`, NEW)

Best-effort, fully wrapped in try/catch (a failure leaves links unenriched, **never breaks the scan** — mirrors PR #134's anchor attach). For each `agenda_links` entry:
1. **fileId recovery**: if no `fileId` and the entry came from a chip, read the cell's `chipRuns` via Sheets API `spreadsheets.get` (bounded `ranges` to the INFO tab, `fields: sheets(data(rowData(values(formattedValue,chipRuns(chip(richLinkProperties(uri)))))))`), match the chip whose `formattedValue` equals the entry's stored filename (`url`), extract `/d/<id>`. URL-form entries already have `fileId`.
2. **bytes**: download the PDF via the Drive client (`getFile` for `headRevisionId`/`md5` + media download). **Cache**: skip re-extraction if `extracted.sourceRevision` already equals the current revision (avoids re-downloading + re-parsing every sync).
3. **extract**: `extractAgendaSchedule(bytes)` → attach `extracted`.
4. The Sheets `spreadsheets.get` call is **gated** — only fired when at least one entry lacks a `fileId` (i.e. there is a chip to resolve), so URL-only shows pay no extra round-trip.

**Supabase call-boundary discipline (invariant 9):** every Drive/Sheets call destructures/handles `{ data, error }` (or typed throw), distinguishes infra faults from "no chip found", and surfaces infra faults as a discriminable result — never a silent `continue`. New helpers are registered in the relevant structural meta-test or carry an inline `// not-subject-to-meta:` reason.

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

All copy is Doug-voice, no raw codes in UI (invariant 5; read via `lib/messages/lookup.ts`).

---

## 5. Guard conditions (every input)

| Input | null / empty / malformed | Behavior |
|---|---|---|
| `agenda_links` | `null`/`[]` | No agenda area renders (existing empty behavior). |
| entry `.fileId` | absent (recovery failed / url-only with no `/d/`) | No embed affordance for that entry; no extraction. `AGENDA_PDF_UNREADABLE` if a chip was present but unresolved. |
| entry `.extracted` | absent (old row / not yet synced) | Embed-only for that link. |
| `extracted.confidence` | `'low'` | `days: []` → embed-only. |
| `extracted.days` | `[]` | AgendaScheduleBlock renders nothing. |
| `session.title` | `null` | Render time + room only (no title line). |
| `session.room` | `null` | Render time + title only. |
| `session.time` | (never null — anchor) | n/a; a session is only created from a parsed time. |
| `session.drift` | `null` | No drift indicator. |
| PDF bytes | download fails / non-PDF / no text layer | extractor returns `{confidence:'low', days:[]}`; `AGENDA_PDF_UNREADABLE`; embed still shown if `fileId` present. |
| pdfjs throws | — | caught in `enrichAgenda`; link left unenriched; scan continues. |

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
- **Confidence-gate tests**: a doctored fixture that fails each threshold (≥5, times, titles, rooms, monotonic) individually → `'low'`.
- **AM/PM repair tests**: forced flip applied + flagged; an *ambiguous* backwards jump is NOT flipped (left, drives `'low'`).
- **enrichAgenda tests** (mocked Drive/Sheets): chip recovery by filename match; url-form passthrough; cache-skip when `sourceRevision` unchanged; best-effort — a thrown Drive error leaves links unenriched and does not throw out of the scan; infra-fault vs no-chip distinguished (invariant 9 meta-test row).
- **Component tests**: AgendaEmbed renders N affordances for N fileId links (multi-doc), 0 → nothing; removed from Diagrams; AgendaScheduleBlock renders sessions only when `confidence:'high'`, renders drift indicator when `drift!=null`, renders nothing when `'low'`. When scanning DOM for a session label, clone+strip sibling controls first (anti-self-satisfying).
- **Layout (real browser)**: Playwright overflow assertion at 320/390/720px.
- **Catalog parity** (`x1`): the three new §12.4 codes present in spec prose + generated + `catalog.ts`.

---

## 9. Meta-test inventory

- **Supabase call-boundary** (`tests/auth/_metaInfraContract.test.ts` or the analogous registry): `enrichAgenda`'s Drive/Sheets helpers either register a row or carry `// not-subject-to-meta: <reason>`.
- **No new advisory-lock surface** (no `pg_advisory*` touched) — declared N/A.
- **§12.4 catalog completeness** (`tests/messages/codes.test.ts` / `x1`): the three new codes.
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
