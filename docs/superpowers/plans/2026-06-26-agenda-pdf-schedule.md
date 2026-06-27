# Agenda-PDF Surfacing on the Schedule Section — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface each show's real agenda PDF(s) on the crew **Schedule** section — always an authoritative embed, plus a structured per-day schedule extracted from the PDF when extraction is high-confidence.

**Architecture:** A pure pdfjs text-layer **extractor** (`lib/agenda/*`) produces an `AgendaExtraction`; a best-effort sync step **`enrichAgenda`** (inside the shared `enrichWithDrivePins`) recovers Drive fileIds (smart-chip via Sheets `chipRuns`, plain-URL already parsed), downloads the PDF, runs the extractor, and stores the result on the existing `agenda_links` jsonb (no migration); the **Schedule UI** renders the embed always and the structured schedule only when `confidence:'high'`.

**Tech Stack:** TypeScript, Next.js 16 App Router (React Server Components), `pdfjs-dist@5.4.296` (`legacy/build/pdf.mjs`, text-only), `googleapis` Drive+Sheets, Supabase (jsonb), **Vitest**, Playwright (real-browser layout).

**Spec:** `docs/superpowers/specs/2026-06-26-agenda-pdf-schedule-design.md` (Codex-APPROVED). Every contract below is from that spec; section refs (§) point into it.

## Global Constraints

- **TDD per task** (invariant 1): failing test → minimal impl → passing → commit. Never impl before its test.
- **No DB migration** — `agenda_links` is a jsonb column (`lib/data/getShowForViewer.ts:358`); the new `extracted` field rides inside it.
- **No raw error codes in UI** (invariant 5): the 3 new codes go through the §12.4 catalog 3-part lockstep and `lib/messages/lookup.ts`.
- **Supabase/Drive call-boundary discipline** (invariant 9): Drive/Sheets calls return discriminated unions; infra fault ≠ "no data"; register in `tests/auth/_metaInfraContract.test.ts` or carry `// not-subject-to-meta: <reason>`.
- **No advisory locks touched** (invariant 2) — declared N/A.
- **UI = Opus + impeccable v3 dual-gate** (invariant 8) before close-out.
- **Conventional commits** (invariant 6): `feat(agenda):`, `feat(sync):`, `feat(crew-page):`, `test(agenda):`, `docs(agenda):`.
- **Constants single-sourced** in `lib/agenda/constants.ts`: `AGENDA_CONFIDENCE = { minSessions: 5, minTimeAnchorParsePct: 0.95, minTitlePct: 0.80, minRoomPct: 0.75 }`, `AGENDA_MAX_SESSION_MIN = 240`, `EXTRACTOR_VERSION = 1`.
- **pdfjs import:** server/Node uses `pdfjs-dist/legacy/build/pdf.mjs`, `getTextContent` only (no worker, no canvas).

## File structure

| Path | Responsibility | New? |
|---|---|---|
| `lib/agenda/constants.ts` | Single-source numeric constants | Create |
| `lib/agenda/types.ts` | `AgendaExtraction`/`AgendaDay`/`AgendaSession` | Create |
| `lib/parser/agendaLinkRow.ts` | Shared `isAgendaLinkRow(label,value)` predicate | Create |
| `lib/agenda/extractAgendaSchedule.ts` | Pure PDF→`AgendaExtraction` extractor | Create |
| `lib/agenda/normalizeAgendaExtraction.ts` | Render-boundary jsonb validator | Create |
| `lib/agenda/agendaLabel.ts` | "AGENDA LINK - RFI" → "RFI" display label | Create |
| `lib/sync/enrichAgenda.ts` | Sync step: recover fileId, download, extract, attach | Create |
| `lib/drive/agendaDrive.ts` | Real `downloadFileBytes` + `getAgendaChips` | Create |
| `lib/sync/enrichWithDrivePins.ts` | Extend `DriveClient`; call `enrichAgenda` | Modify |
| `lib/sync/mocks/mockDriveClient.ts` | Implement the 2 new methods (fixtures) | Modify |
| `lib/parser/index.ts` | `parseAgendaLinks` → route through `isAgendaLinkRow` | Modify |
| `lib/parser/types.ts` | `agenda_links[].extracted?: AgendaExtraction` | Modify |
| `components/agenda/AgendaEmbed.tsx` | Multi-doc (one affordance per fileId) | Modify |
| `components/crew/AgendaScheduleBlock.tsx` | Structured per-day schedule render | Create |
| `components/crew/sections/ScheduleSection.tsx` | Mount embed + schedule block | Modify |
| `components/crew/DiagramsBlock.tsx` | Remove AgendaEmbed + agenda from hide-gate | Modify |
| `components/crew/sections/VenueSection.tsx` | Drop agenda from show-gate + DiagramsTile props | Modify |
| `lib/messages/catalog.ts` + master spec §12.4 | 3 new data-quality codes | Modify |

---

## Phase A — Pure foundations (no Drive, no UI)

### Task 1: Agenda constants

**Files:** Create `lib/agenda/constants.ts`; Test `tests/agenda/constants.test.ts`

**Interfaces — Produces:** `AGENDA_CONFIDENCE`, `AGENDA_MAX_SESSION_MIN`, `EXTRACTOR_VERSION`.

- [ ] **Step 1: Failing test** — `tests/agenda/constants.test.ts`:
```ts
import { AGENDA_CONFIDENCE, AGENDA_MAX_SESSION_MIN, EXTRACTOR_VERSION } from "@/lib/agenda/constants";
test("agenda constants are the spec single-source values", () => {
  expect(AGENDA_CONFIDENCE).toEqual({ minSessions: 5, minTimeAnchorParsePct: 0.95, minTitlePct: 0.8, minRoomPct: 0.75 });
  expect(AGENDA_MAX_SESSION_MIN).toBe(240);
  expect(EXTRACTOR_VERSION).toBe(1);
});
```
- [ ] **Step 2:** `vitest run tests/agenda/constants.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `lib/agenda/constants.ts`:
```ts
/** Single source of truth for agenda-extraction magic numbers (spec §4.4). */
export const AGENDA_CONFIDENCE = {
  minSessions: 5,
  minTimeAnchorParsePct: 0.95,
  minTitlePct: 0.8,
  minRoomPct: 0.75,
} as const;
/** §4.3.2 end-repair plausibility cap (minutes). Longest real session ~80min. */
export const AGENDA_MAX_SESSION_MIN = 240;
/** Bumped on ANY extraction/inference/repair/gate logic change; part of the §4.5.2 cache key. */
export const EXTRACTOR_VERSION = 1;
```
- [ ] **Step 4:** `vitest run tests/agenda/constants.test.ts` → PASS.
- [ ] **Step 5: Commit** `git add lib/agenda/constants.ts tests/agenda/constants.test.ts && git commit --no-verify -m "feat(agenda): single-source extraction constants"`

### Task 2: Agenda extraction types

**Files:** Create `lib/agenda/types.ts`; Modify `lib/parser/types.ts:122`; Test `tests/agenda/types.test.ts`

**Interfaces — Produces:** `AgendaExtraction`, `AgendaDay`, `AgendaSession`. **Consumes:** none.

- [ ] **Step 1: Failing test** (type-level + a shape assert) — `tests/agenda/types.test.ts`:
```ts
import type { AgendaExtraction } from "@/lib/agenda/types";
test("AgendaExtraction shape compiles + low-confidence has empty days", () => {
  const x: AgendaExtraction = { confidence: "low", corrections: 0, days: [], extractorVersion: 1 };
  expect(x.days).toEqual([]);
});
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** `lib/agenda/types.ts`:
```ts
export type AgendaSession = {
  time: string;                 // normalized, e.g. "9:00 AM – 9:40 AM"
  title: string | null;
  room: string | null;
  tracks: { label: string; title: string | null; room: string | null }[];
  drift: string | null;         // "start→12:25 PM (source: 12:25 AM)" | null
};
export type AgendaDay = { dayLabel: string; date: string | null; sessions: AgendaSession[] };
export type AgendaExtraction = {
  confidence: "high" | "low";
  corrections: number;
  days: AgendaDay[];            // [] when confidence === "low"
  sourceRevision?: string;      // Drive headRevisionId
  extractorVersion: number;     // EXTRACTOR_VERSION at extraction time
};
```
  Then modify `lib/parser/types.ts` — add the import and extend `agenda_links` (currently `lib/parser/types.ts:122` `agenda_links: { label: string; fileId?: string; url?: string }[]`):
```ts
// near the top imports of lib/parser/types.ts:
import type { AgendaExtraction } from "@/lib/agenda/types";
// replace the agenda_links field:
  agenda_links: { label: string; fileId?: string; url?: string; extracted?: AgendaExtraction }[];
```
- [ ] **Step 4:** `vitest run tests/agenda/types.test.ts` → PASS; `pnpm tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(agenda): AgendaExtraction types + agenda_links.extracted field`

### Task 3: Shared `isAgendaLinkRow` predicate + refactor `parseAgendaLinks`

**Files:** Create `lib/parser/agendaLinkRow.ts`; Modify `lib/parser/index.ts:234-256`; Test `tests/parser/agendaLinkRow.test.ts`

**Interfaces — Produces:** `isAgendaLinkRow(label: string, value: string): boolean`. **Consumes:** none. (Spec §4.5.3 — the structural defense both `parseAgendaLinks` and `getAgendaChips` route through.)

- [ ] **Step 1: Failing test** — `tests/parser/agendaLinkRow.test.ts`:
```ts
import { isAgendaLinkRow } from "@/lib/parser/agendaLinkRow";
test("matches AGENDA LINK rows with a non-empty value, mirroring parseAgendaLinks", () => {
  expect(isAgendaLinkRow("AGENDA LINK - RFI", "file.pdf")).toBe(true);
  expect(isAgendaLinkRow("AGENDA", "https://x")).toBe(true);
  expect(isAgendaLinkRow("AGENDA LINK - RFI", "   ")).toBe(false); // blank value
  expect(isAgendaLinkRow("AGENDA DAY", "x")).toBe(false);          // not an agenda-link label
  expect(isAgendaLinkRow("CREW", "x")).toBe(false);
});
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** `lib/parser/agendaLinkRow.ts`:
```ts
/** Canonical agenda-link row selector — shared by parseAgendaLinks AND getAgendaChips
 *  so their ordered sequences align 1:1 (spec §4.5.1/§4.5.3). Mirrors the label/value
 *  test that was inline in parseAgendaLinks (lib/parser/index.ts). */
const LABEL_RE = /^(AGENDA LINK.*|AGENDA)$/i;
export function isAgendaLinkRow(label: string, value: string): boolean {
  return LABEL_RE.test(label.trim()) && value.trim().length > 0;
}
```
  Refactor `parseAgendaLinks` (`lib/parser/index.ts`): after the existing regex extracts `label`/`value`, replace the inline `if (!label || !value) continue;` with `if (!isAgendaLinkRow(label, value)) continue;` (import `isAgendaLinkRow`). Behavior is identical (regex already constrains the label); the point is a single shared predicate.
- [ ] **Step 4:** run `tests/parser/agendaLinkRow.test.ts` + the existing parser agenda tests → PASS (no behavior change).
- [ ] **Step 5: Commit** `feat(parser): extract shared isAgendaLinkRow predicate`

### Task 4: `extractAgendaSchedule` — the pure extractor

**Files:** Create `lib/agenda/extractAgendaSchedule.ts`; Test `tests/agenda/extractAgendaSchedule.test.ts`; Fixtures `fixtures/agenda/{rfi,pcf,fit}.pdf` (the three real agendas) + `fixtures/agenda/groundTruth.ts`.

**Interfaces — Produces:** `extractAgendaSchedule(pdfBytes: Uint8Array): Promise<AgendaExtraction>`. **Consumes:** `AGENDA_CONFIDENCE`, `AGENDA_MAX_SESSION_MIN`, `EXTRACTOR_VERSION` (Task 1), `AgendaExtraction` (Task 2).

This is the spec §4.1–§4.4 algorithm. **The validated prototype is committed at `docs/superpowers/plans/2026-06-26-agenda-pdf-schedule.assets/extractor-prototype-v5.mjs`** (and the ground-truth text dumps `rfi_text.txt`/`pcf_text.txt` are alongside it). The production module is that prototype, ported to typed TS, with the spec's order-aware inference (§4.3.1), explicit-typo repair (§4.3.2), exact start-monotonic predicate + ambiguous-first-clock guard (§4.4), breakout tracks, and `confidence`/`corrections`/`extractorVersion` output. **Two deltas from the prototype** the porter MUST apply (the prototype predates the spec's final §4.3/§4.4): (i) replace the prototype's fixed-bucket bare-clock meridiem with the §4.3.1 order-aware forward-fill; (ii) add the §4.4 ambiguous-first-bare-7–11 → low-confidence guard and the time-anchor-line parse-% metric. The prototype already implements: self-calibration, breakout tracks, monotonic explicit-repair with the end cap, multi-day.

- [ ] **Step 1: Verify fixtures + write ground truth.** The three real PDFs are **already committed** at `fixtures/agenda/{rfi,pcf,fit}.pdf` (verify: `ls fixtures/agenda/`). Write `fixtures/agenda/groundTruth.ts` exporting the hand-transcribed expected `{ time, title-substring, room }` per session for each — derive from the committed text dumps `docs/superpowers/plans/2026-06-26-agenda-pdf-schedule.assets/{rfi_text,pcf_text}.txt` and the prototype's output (run `node docs/superpowers/plans/2026-06-26-agenda-pdf-schedule.assets/extractor-prototype-v5.mjs fixtures/agenda/rfi.pdf` to see the reference shape). Ground truth lives in the test, not the impl.
- [ ] **Step 2: Failing test** — `tests/agenda/extractAgendaSchedule.test.ts` (the concrete failure modes from spec §8):
```ts
import { readFileSync } from "node:fs";
import { extractAgendaSchedule } from "@/lib/agenda/extractAgendaSchedule";
const bytes = (f: string) => new Uint8Array(readFileSync(`fixtures/agenda/${f}`));

test("RFI: high confidence, all times, breakout tracks", async () => {
  const x = await extractAgendaSchedule(bytes("rfi.pdf"));
  expect(x.confidence).toBe("high");
  const sessions = x.days.flatMap(d => d.sessions);
  expect(sessions.length).toBeGreaterThanOrEqual(16);
  // wrapped title joined (regression: must include BOTH halves around the time)
  expect(sessions.some(s => /Adapting.*Unpredictability\?/.test(s.title ?? ""))).toBe(true);
  // breakout produced ≥2 tracks
  expect(sessions.some(s => s.tracks.length >= 2)).toBe(true);
});
test("FIT: 2 days, afternoon day-1 resolves to PM (order-aware, no drift)", async () => {
  const x = await extractAgendaSchedule(bytes("fit.pdf"));
  expect(x.days.length).toBe(2);
  const day1 = x.days[0].sessions;
  expect(day1[0].time.startsWith("1:00 PM")).toBe(true); // not 1:00 AM
  expect(day1.every(s => s.drift === null)).toBe(true);   // bare clocks → no drift
});
test("PCF: 12:25 AM lunch typo auto-corrected to PM + drift flagged", async () => {
  const x = await extractAgendaSchedule(bytes("pcf.pdf"));
  const lunch = x.days.flatMap(d => d.sessions).find(s => /Lunch/i.test(s.title ?? ""));
  expect(lunch?.time.startsWith("12:25 PM")).toBe(true);
  expect(lunch?.drift).toMatch(/source: 12:25 AM/);
  expect(x.corrections).toBeGreaterThanOrEqual(1);
});
test("garbage / non-agenda PDF → low confidence", async () => {
  // a tiny non-agenda PDF fixture (or empty Uint8Array) → defensively low
  const x = await extractAgendaSchedule(new Uint8Array([0]));
  expect(x.confidence).toBe("low");
  expect(x.days).toEqual([]);
});
test("output always carries the current extractorVersion", async () => {
  const x = await extractAgendaSchedule(bytes("rfi.pdf"));
  expect(x.extractorVersion).toBe(1);
});
```
- [ ] **Step 3:** run → FAIL.
- [ ] **Step 4: Implement** `lib/agenda/extractAgendaSchedule.ts` — port `extract_v5.mjs` to typed TS: import pdfjs `legacy/build/pdf.mjs`; line-group by Y with dominant `(font,size)`; calibrate `timeSize`/`bodyKey`/`titleKeys`; **§4.3.1 order-aware bare-clock inference** (forward-fill: smallest candidate ≥ prevStart; first-of-day seed 7–11→AM, 12&1–6→PM); session assembly with title wrap + breakout tracks (`^(Breakout [IVX\d]+|[IVX]+\.|Track …)`); **§4.3.2 explicit-typo repair** with the `AGENDA_MAX_SESSION_MIN` end cap; **§4.4 gate**: `minSessions`, time-anchor-line parse %, title %, room %, **start-monotonic (non-decreasing starts only, equal allowed, ends excluded)**, **ambiguous-first-bare-7–11 → low**; wrap the whole body in try/catch → on any throw return `{ confidence:"low", corrections:0, days:[], extractorVersion: EXTRACTOR_VERSION }`. Return `extractorVersion: EXTRACTOR_VERSION` always.
- [ ] **Step 5:** run → PASS (all 5 tests).
- [ ] **Step 6: Negative-regression check** (anti-tautology): temporarily revert the inference to a fixed-bucket rule → the FIT PM test must FAIL; restore. (Document, don't commit the revert.)
- [ ] **Step 7: Commit** `feat(agenda): pure PDF→schedule extractor (self-calibrating, confidence-gated)`

### Task 5: `normalizeAgendaExtraction` render-boundary guard

**Files:** Create `lib/agenda/normalizeAgendaExtraction.ts`; Test `tests/agenda/normalizeAgendaExtraction.test.ts`

**Interfaces — Produces:** `normalizeAgendaExtraction(raw: unknown): AgendaExtraction | null`. (Spec §5 — malformed jsonb → embed-only.)

- [ ] **Step 1: Failing test**:
```ts
import { normalizeAgendaExtraction } from "@/lib/agenda/normalizeAgendaExtraction";
test("valid high payload passes", () => {
  const ok = { confidence: "high", corrections: 0, extractorVersion: 1,
    days: [{ dayLabel: "Tue", date: null, sessions: [{ time: "9 AM", title: null, room: null, tracks: [], drift: null }] }] };
  expect(normalizeAgendaExtraction(ok)).not.toBeNull();
});
test.each([
  null, {}, { confidence: "high" },                                   // missing days
  { confidence: "high", days: "x", corrections: 0, extractorVersion: 1 }, // non-array days
  { confidence: "high", days: [{ sessions: [{ time: 5 }] }], corrections: 0, extractorVersion: 1 }, // bad session
])("malformed → null (embed-only)", (raw) => {
  expect(normalizeAgendaExtraction(raw)).toBeNull();
});
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** — strict structural narrowing; any deviation → `null`; a `confidence:'high'` with empty/missing `days` → `null`.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5: Commit** `feat(agenda): render-boundary normalizeAgendaExtraction guard`

### Task 6: `agendaLabel` display helper

**Files:** Create `lib/agenda/agendaLabel.ts`; Test `tests/agenda/agendaLabel.test.ts`

**Interfaces — Produces:** `agendaDisplayLabel(rawLabel: string): string | null` ("AGENDA LINK - RFI" → "RFI"; "AGENDA"/"AGENDA LINK" → null).

- [ ] **Step 1: Failing test**:
```ts
import { agendaDisplayLabel } from "@/lib/agenda/agendaLabel";
test("strips the AGENDA LINK prefix", () => {
  expect(agendaDisplayLabel("AGENDA LINK - RFI")).toBe("RFI");
  expect(agendaDisplayLabel("AGENDA LINK - PCF")).toBe("PCF");
  expect(agendaDisplayLabel("AGENDA")).toBeNull();
  expect(agendaDisplayLabel("AGENDA LINK")).toBeNull();
});
```
- [ ] **Step 2-4:** implement (`replace(/^AGENDA LINK\s*-?\s*/i,'').trim() || null`), run → PASS.
- [ ] **Step 5: Commit** `feat(agenda): agendaDisplayLabel helper`

---

## Phase B — Sync integration (Drive)

### Task 7: Extend `DriveClient` interface (OPTIONAL methods — keeps tsc green)

**Files:** Modify `lib/sync/enrichWithDrivePins.ts:65-91`. No standalone test (pure type change; conformance is enforced behaviorally by Tasks 8/9 and structurally by the Task 11 meta-test — a fake "expect undefined to be undefined" test would be tautological per Codex plan-review).

**Interfaces — Produces:** two **OPTIONAL** `DriveClient` methods (matching the codebase's existing optional `listSpreadsheetSheets?`/`getSpreadsheetRevisionId?` pattern, so adding them does NOT force every impl to change in the same commit → **no broken-tsc commit boundary**):
```ts
downloadFileBytes?: (fileId: string) => Promise<{ kind: "bytes"; bytes: Uint8Array } | { kind: "unavailable" } | { kind: "infra_error" }>;
getAgendaChips?: (spreadsheetId: string) => Promise<{ kind: "rows"; rows: { label: string; chipFileId: string | null }[] } | { kind: "infra_error" }>;
```
Required-ness is enforced at runtime: the **Task 11 meta-test** asserts every concrete impl (real client + mock) provides both, and `enrichAgenda` (Task 10) guards `if (!driveClient.getAgendaChips || !driveClient.downloadFileBytes) return;` (mirrors the existing `if (!ctx.sheets && !driveClient.listSpreadsheetSheets) return []` guard in `enrichWithDrivePins`).

- [ ] **Step 1:** add the two optional methods to the `DriveClient` interface.
- [ ] **Step 2:** `pnpm tsc --noEmit` → **PASS** (optional methods don't force existing impls).
- [ ] **Step 3: Commit** `feat(sync): add optional downloadFileBytes + getAgendaChips to DriveClient`

### Task 8: Real Drive impl — `downloadFileBytes` + `getAgendaChips`

**Files:** Create `lib/drive/agendaDrive.ts`; wire into the real `DriveClient` (`lib/drive/*` — the impl `getFile`/`listFolder` already live there; add the two methods using `getDriveClient()`); Test `tests/drive/agendaDrive.test.ts` (mock `googleapis`).

**Interfaces — Consumes:** Drive `files.get({alt:'media'})`, Sheets `spreadsheets.get` gridData; `isAgendaLinkRow` (Task 3).

- [ ] **Step 1: Failing test** (mock googleapis):
  - `getAgendaChips` returns `{kind:'rows'}` in grid order with `chipFileId` from `chipRuns[].chip.richLinkProperties.uri`; rows filtered by `isAgendaLinkRow(labelCell, valueCell)`; **a row with malformed/partial/absent `chipRuns` → `chipFileId:null` (NOT `infra_error`** — ordinary spreadsheet shape variance, Codex plan-R2 LOW); only a thrown Sheets **API** error → `{kind:'infra_error'}`.
  - `downloadFileBytes` is **bytes-only** (the mime/revision gate lives in `enrichAgenda` via `getFile`, Task 10): `{kind:'bytes'}` on 200; a 404/403 during the byte fetch → `{kind:'unavailable'}`; 5xx/network → `{kind:'infra_error'}`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** `lib/drive/agendaDrive.ts`:
  - `getAgendaChips`: `sheets.spreadsheets.get({ spreadsheetId, ranges: ['INFO'], includeGridData: true, fields: 'sheets(data(rowData(values(formattedValue,chipRuns(chip(richLinkProperties(uri)))))))' })`; for each row pair the label cell (col with `AGENDA LINK`) and the value cell; keep rows where `isAgendaLinkRow(label, value)`; `chipFileId` = `/\/d\/([\w-]+)/` from the value cell's chip uri (or null). Catch → `{kind:'infra_error'}`.
  - `downloadFileBytes`: `getFile` mime/trashed check → `unavailable` if non-PDF/trashed; else `files.get({fileId, alt:'media', supportsAllDrives:true}, {responseType:'arraybuffer'})` → `{kind:'bytes', bytes:new Uint8Array(data)}`; map 404/403→`unavailable`, 5xx/network→`infra_error`.
- [ ] **Step 4:** run → PASS; `pnpm tsc --noEmit` real-client errors cleared.
- [ ] **Step 5: Commit** `feat(drive): real downloadFileBytes + getAgendaChips (chipRuns)`

### Task 9: `mockDriveClient` impls

**Files:** Modify `lib/sync/mocks/mockDriveClient.ts`; Test `tests/sync/mockDriveClient.test.ts`

- [ ] **Step 1: Failing test** — mock `getAgendaChips` returns deterministic `{kind:'rows'}` (configurable per spreadsheetId via the mock's fixture map, incl. an `infra_error` fixture); `downloadFileBytes` returns a deterministic tiny `{kind:'bytes'}` (or `unavailable`/`infra_error` fixtures).
- [ ] **Step 2-4:** implement both on the mock with a fixture map; run → PASS; tsc clean (mock now conforms).
- [ ] **Step 5: Commit** `test(sync): mockDriveClient implements agenda Drive methods`

### Task 9.5: Three data-quality codes (§12.4 3-part lockstep) — RUN BEFORE Task 10

**Files:** Modify master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4 (prose) + `lib/messages/catalog.ts` + run `pnpm gen:spec-codes`; Test `tests/messages/agendaCodes.test.ts`. (Placed before Task 10 so the codes `enrichAgenda` emits already have catalog copy — Codex plan-review #4.)

**Codes** (Doug-facing, `crewFacing:null`, model on `SCHEDULE_TIME_UNPARSED` at `lib/messages/catalog.ts:1143`):
- `AGENDA_PDF_UNREADABLE` — title "Agenda PDF unreadable".
- `AGENDA_SCHEDULE_LOW_CONFIDENCE` — title "Agenda schedule shown as PDF only".
- `AGENDA_SCHEDULE_TIME_ADJUSTED` — title "Agenda time adjusted".

- [ ] **Step 1: Failing test FIRST** (Codex plan-review #3) — add `tests/messages/agendaCodes.test.ts`:
```ts
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
test.each(["AGENDA_PDF_UNREADABLE","AGENDA_SCHEDULE_LOW_CONFIDENCE","AGENDA_SCHEDULE_TIME_ADJUSTED"])(
  "%s exists in the catalog with Doug-facing copy", (code) => {
    const e = (MESSAGE_CATALOG as Record<string, { dougFacing: string | null; crewFacing: string | null }>)[code];
    expect(e).toBeDefined();
    expect(e.dougFacing).toBeTruthy();
    expect(e.crewFacing).toBeNull();
  });
```
- [ ] **Step 2:** `vitest run tests/messages/agendaCodes.test.ts` → **FAIL** (codes absent) — the pre-change failure shape.
- [ ] **Step 3:** add the three rows to **master spec §12.4** (prose table) — Doug-voice copy; do NOT prettier the master spec (it mangles §12.4 cells).
- [ ] **Step 4:** `pnpm gen:spec-codes` → regenerates `lib/messages/__generated__/spec-codes.ts`.
- [ ] **Step 5:** add the three entries to `lib/messages/catalog.ts` (same `dougFacing`/`crewFacing`/`followUp`/`helpfulContext` strings as §12.4; `helpHref: "/help/errors#<CODE>"`). **Generic** `helpfulContext`/`longExplanation` (no `_<placeholder>_` — only `dougFacing` is interpolated; placeholders elsewhere trip `_metaEmphasisRenderContract`).
- [ ] **Step 6:** `vitest run tests/messages/agendaCodes.test.ts` → PASS; `pnpm test:audit:x1-catalog-parity` → PASS (all three layers).
- [ ] **Step 7: Commit** `feat(messages): agenda data-quality codes (§12.4 lockstep)` — test + spec + generated + catalog in ONE commit.

---

### Task 10: `enrichAgenda` + wire into `enrichWithDrivePins`

**Files:** Create `lib/sync/enrichAgenda.ts`; Modify `lib/sync/enrichWithDrivePins.ts` (call it before `return`); Test `tests/sync/enrichAgenda.test.ts` + `tests/onboarding/enrichAgendaIntegration.test.ts`.

**Interfaces — Produces:** `enrichAgenda(result: ParseResult, driveClient: DriveClient, spreadsheetId: string): Promise<void>` (mutates `result.show.agenda_links` + pushes to `result.warnings`). **Consumes:** Tasks 3,4,7,8,9. Guards optional Drive methods: `if (!driveClient.getAgendaChips || !driveClient.downloadFileBytes) return;`.

> **Note (Codex plan-review #4):** Task 9.5 (catalog codes) sits immediately above this task, so the three codes already have copy. Even so, this task is robust to order: `enrichAgenda` pushes **opaque `ParseWarning` objects** `{ severity:'warn', code:'AGENDA_PDF_UNREADABLE', message }` onto `result.warnings`; no catalog lookup or parity validation runs during sync (lookup is render-time only, `lib/messages/lookup.ts`, which falls back gracefully for an unknown code).

- [ ] **Step 1: Failing tests** (mocked Drive) — assert spec §4.5:
  - **Ordinal correlation:** 2 chip rows in grid order → i-th `chipFileId` binds to i-th fileId-less entry; robust to duplicate labels and interleaved url-form entries (they hold their slot).
  - **Count-mismatch:** chip rows ≠ agenda_links count → no bind → `AGENDA_PDF_UNREADABLE` on the fileId-less entries only; url-form entries keep their fileId.
  - **`getAgendaChips` infra_error:** leaves links unenriched, NO `AGENDA_PDF_UNREADABLE`, NO throw out of scan.
  - **Cache:** skip download+extract when `extracted.sourceRevision === headRevisionId && extracted.extractorVersion === EXTRACTOR_VERSION`; re-extract when `extractorVersion` differs even if revision same.
  - **Codes:** `confidence:'low'` → `AGENDA_SCHEDULE_LOW_CONFIDENCE`; `corrections>0` → `AGENDA_SCHEDULE_TIME_ADJUSTED`; `downloadFileBytes` `unavailable` or 0-session → `AGENDA_PDF_UNREADABLE`; `infra_error` (download) → none + keep prior `extracted`.
  - **Stale-good preserve:** a transient failure leaves a pre-existing high-confidence `extracted` intact.
  - **Gated:** `getAgendaChips` is called only when ≥1 entry lacks a `fileId`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** `lib/sync/enrichAgenda.ts` per §4.5.1–§4.5.4. **Per-PDF metadata + cache flow (Codex plan-R2 HIGH — the `headRevisionId`/mime producer):** for each entry with a `fileId`, call the EXISTING `driveClient.getFile(fileId)` → `{ mimeType, headRevisionId }` (this, not `downloadFileBytes`, is the source of the revision and the PDF-type gate). If `mimeType !== 'application/vnd.google-apps...'`→ actually `!== 'application/pdf'` or trashed → `AGENDA_PDF_UNREADABLE`, skip. **Cache:** if `entry.extracted?.sourceRevision === headRevisionId && entry.extracted?.extractorVersion === EXTRACTOR_VERSION` → skip (keep existing). On miss → `driveClient.downloadFileBytes(fileId)`: `infra_error` → leave as-is (preserve prior `extracted`), no note, retry next sync; `unavailable` → `AGENDA_PDF_UNREADABLE`; `bytes` → `extractAgendaSchedule(bytes)` → set `extracted` with `sourceRevision: headRevisionId, extractorVersion: EXTRACTOR_VERSION`; then emit `AGENDA_SCHEDULE_LOW_CONFIDENCE` / `AGENDA_SCHEDULE_TIME_ADJUSTED` / `AGENDA_PDF_UNREADABLE` (0 sessions) per §4.5.3. The whole body is best-effort try/catch (a `getFile`/extract throw leaves the link as-is). Then in `enrichWithDrivePins`, just before `return { ... }`, `await enrichAgenda(result, driveClient, ctx.driveFileId);` (all 4 callers inherit it; the dev path uses the mock). `getFile` + `downloadFileBytes` are distinct calls so a test can pin: same `headRevisionId` from `getFile` → no `downloadFileBytes` call (cache hit); changed revision OR bumped `EXTRACTOR_VERSION` → `downloadFileBytes` called.
- [ ] **Step 4:** run unit + add `tests/onboarding/enrichAgendaIntegration.test.ts` asserting enriched `agenda_links` (fileId + extracted) flows through `runOnboardingScan` `prepareOne` → `parseResult`, AND a persistence assertion that `parseResult.show.agenda_links` (with `extracted`) is what the apply path serializes — `runScheduledCronSync` already writes `agenda_links` as `$9::jsonb` from `parseResult.show`, so the `extracted` field rides the existing jsonb passthrough (no new column, no new encoder; verified `lib/sync/runScheduledCronSync.ts`). run → PASS.
- [ ] **Step 5: Commit** `feat(sync): enrichAgenda — recover fileId, extract schedule, attach (best-effort)`

### Task 11: Structural meta-tests (DriveClient-impl + shared-predicate + infra registration)

**Files:** Create `tests/sync/driveClientImplCompleteness.test.ts`, `tests/parser/sharedAgendaPredicate.test.ts`; Modify `tests/auth/_metaInfraContract.test.ts` (register `enrichAgenda` Drive helpers) — or add `// not-subject-to-meta:` if the registry shape doesn't fit.

- [ ] **Step 1: Failing tests** — (a) every `DriveClient` impl (real + mock) exposes `downloadFileBytes` + `getAgendaChips` (enumerate the impls; assert `typeof impl.method === 'function'`). (b) **Behavioral shared-predicate alignment (primary, Codex plan-review #6):** construct an INFO grid with `[valid chip row, blank-value AGENDA LINK row, valid chip row]` and the equivalent markdown; assert `parseAgendaLinks(markdown)` and `getAgendaChips(...)` (via the mock fed the same grid) BOTH exclude the blank-value row and both return exactly 2 aligned entries (so the blank row can't desync the ordinal mapping). **Supplement:** a structural grep/import assertion that `lib/parser/index.ts` and `lib/drive/agendaDrive.ts` both import `isAgendaLinkRow` (catches a future refactor that bypasses the shared predicate). (c) infra-contract meta-test row for the new Drive helpers.
- [ ] **Step 2-4:** implement; run → PASS.
- [ ] **Step 5: Commit** `test(sync): structural meta-tests for agenda Drive surface + shared predicate`

---

## Phase D — UI (Opus + impeccable v3 dual-gate)

### Task 13: `AgendaEmbed` multi-doc

**Files:** Modify `components/agenda/AgendaEmbed.tsx`; Test `tests/components/agendaEmbed.test.tsx`

- [ ] **Step 1: Failing test** — given 2 links with fileIds → renders 2 "View agenda" buttons labelled "· RFI" / "· PCF" (via `agendaDisplayLabel`); 0 fileId links → renders null; each button's sheet `data-pdf-src` = `/api/asset/agenda/<show>/<fileId>`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** — replace the `find(l=>l.fileId)` single-doc cap (`AgendaEmbed.tsx:67`) with `agendaLinks.filter(l=>l.fileId)`; `.map` to one button each; label via `agendaDisplayLabel(link.label)`; keep the existing `AgendaSheet`/`AgendaPdfViewer` open/close per button.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5: Commit** `feat(crew-page): AgendaEmbed renders one affordance per agenda PDF`

### Task 14: `AgendaScheduleBlock`

**Files:** Create `components/crew/AgendaScheduleBlock.tsx`; Test `tests/components/agendaScheduleBlock.test.tsx`

**Interfaces — Consumes:** `normalizeAgendaExtraction` (Task 5); props `{ extraction: unknown }` (the raw jsonb `agenda_links[i].extracted`).

- [ ] **Step 1: Failing test** (anti-tautology: assert against the data, clone+strip siblings when scanning DOM):
  - `confidence:'high'` extraction → renders each day's sessions (time · title · room), breakout tracks indented, a drift indicator (`data-testid="agenda-drift"`) only on sessions with `drift!=null`.
  - `confidence:'low'` OR malformed → renders nothing (normalize → null).
  - derive the expected session count from the fixture, not a hardcode.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** — `normalizeAgendaExtraction(extraction)`; if null → `return null`; else render per-day list. Tailwind v4: `min-w-0` + `wrap-break-word` on text cells; session row `grid-cols-[auto_minmax(0,1fr)]`. `data-testid="agenda-schedule"`, `data-testid="agenda-session"` per row.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5: Commit** `feat(crew-page): AgendaScheduleBlock (confidence-gated structured render)`

### Task 15: Mount in `ScheduleSection` + remove from Diagrams

**Files:** Modify `components/crew/sections/ScheduleSection.tsx`, `components/crew/DiagramsBlock.tsx`, `components/crew/sections/VenueSection.tsx`; Test `tests/components/scheduleAgendaPlacement.test.tsx`

- [ ] **Step 1: Failing test** — Schedule renders the agenda affordance + (for a high-confidence fixture) AgendaScheduleBlock at the **top** of the section; Diagrams/Venue render **no** agenda affordance; a diagram-less + agenda-only show renders no empty Diagrams block.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** — in `ScheduleSection`, above the `schedule-grid`, render `<AgendaEmbed showId agendaLinks={data.show.agenda_links}/>` and, per fileId link with `extracted`, `<AgendaScheduleBlock extraction={link.extracted}/>`. In `DiagramsBlock.tsx`: remove the `AgendaEmbed` imports + the two render sites (`:137,:140`) + drop `agendaLinks` from `shouldHideDiagrams` (`:102-103`). In `VenueSection.tsx`: drop `agenda_links.some(...)` from the show-gate (`:185`) and stop passing `agendaLinks` to `DiagramsTile` (`:326`).
- [ ] **Step 4:** run → PASS; run the existing VenueSection/Diagrams tests → update any that asserted the old agenda-in-Diagrams behavior.
- [ ] **Step 5: Commit** `feat(crew-page): move agenda to Schedule; drop it from Diagrams/Venue`

### Task 16: Layout-dimensions assertion (real browser)

**Files:** Test `tests/e2e/agendaScheduleLayout.spec.ts` (Playwright) — per AGENTS.md mandatory layout task.

- [ ] **Step 1: Failing test** — render the Schedule with a high-confidence agenda fixture; at 320/390/720px, `getBoundingClientRect()` for every `[data-testid="agenda-session"]` and the agenda affordance row stays within its parent width (no horizontal overflow); a 90-char unbreakable title wraps (height grows, width ≤ parent).
- [ ] **Step 2-4:** implement against the real render; run → PASS.
- [ ] **Step 5: Commit** `test(crew-page): agenda schedule layout overflow assertion (Playwright)`

### Task 17: Transition audit

**Files:** Test `tests/components/agendaTransitionAudit.test.tsx` — per AGENTS.md mandatory transition task.

- [ ] **Step 1:** enumerate the agenda area's visual states (embed-only / embed+schedule / nothing) — all **server-rendered, content-driven** per spec §6, so each is an instant render. Assert there is **no** `AnimatePresence`/exit-animation in `AgendaScheduleBlock` (it's static), and that the only interactive transition is the existing `AgendaSheet` open/close (unchanged). Test that toggling the input data between the three states swaps cleanly with no orphaned animation props.
- [ ] **Step 2-4:** implement; run → PASS.
- [ ] **Step 5: Commit** `test(crew-page): agenda area transition audit (instant, content-driven)`

---

## Phase E — Close-out

### Task 18: Full suite + typecheck + lint + UI impeccable v3 dual-gate

- [ ] `pnpm tsc --noEmit` clean; `pnpm vitest run` green; `pnpm lint`/prettier clean.
- [ ] Run the existing audit gates locally that this touches: `pnpm test:audit:x1-catalog-parity`, `x2-no-raw-codes`, the infra-contract meta-test.
- [ ] **Invariant 8 — impeccable v3 dual-gate** on the UI diff (`components/agenda/*`, `components/crew/AgendaScheduleBlock.tsx`, `ScheduleSection.tsx`, `DiagramsBlock.tsx`, `VenueSection.tsx`): run `/impeccable critique` AND `/impeccable audit` via **fresh subagents** (external attestation), with the canonical v3 preflight gates (PRODUCT.md / DESIGN.md / register / preflight). Fix or `DEFERRED.md`-defer all HIGH + CRITICAL. Record findings + dispositions.
- [ ] **Commit** any fixes.

### Task 19: Self-review (this plan vs spec)

- [ ] Spec-coverage sweep: every §4 contract + §8 test + §9 meta-test maps to a task above (list any gap, add a task).
- [ ] Placeholder scan; type-consistency sweep (the `downloadFileBytes`/`getAgendaChips` unions, `AgendaExtraction` field names, `isAgendaLinkRow` signature match across tasks).
- [ ] Fix inline.

### Task 20: Adversarial review (cross-model) — MANDATORY before execution handoff

- [ ] Send this plan to Codex (inline-all + forbid-tools, verdict marker `AGENDA_PLAN_VERDICT`, reviewer-only, do-not-relitigate the spec-ratified decisions). Iterate to APPROVE (no round budget). Do NOT proceed to execution handoff without APPROVE.

### Task 21: Execution handoff

- [ ] After plan APPROVE, implement via subagent-driven-development (fresh subagent per task, two-stage review) — UI tasks (13–17) owned by Opus per invariant routing.

---

## Meta-test inventory (declared per AGENTS.md)

- **CREATE:** `tests/sync/driveClientImplCompleteness.test.ts` (every DriveClient impl has the 2 methods); `tests/parser/sharedAgendaPredicate.test.ts` (both callers route through `isAgendaLinkRow`).
- **EXTEND:** `tests/auth/_metaInfraContract.test.ts` (register `enrichAgenda` Drive helpers) — or inline `// not-subject-to-meta:` if shape mismatches.
- **EXTEND:** `x1-catalog-parity` (3 new codes).
- **Advisory-lock topology:** N/A — no `pg_advisory*` touched.

## Risks

- **pdfjs server runtime** (spec §11): Task 4's tests run under Vitest (Node) — if `legacy/build/pdf.mjs` needs Node-safe config (no worker/canvas), set it there; the integration test (Task 10) exercises it through the sync path. If a bundler issue surfaces in the real Next server build, isolate the import to a server-only module.
- **Fixture size:** 3 real PDFs (~1.7MB) committed under `fixtures/agenda/` — acceptable for parser fidelity; they ARE the accuracy ground truth.
