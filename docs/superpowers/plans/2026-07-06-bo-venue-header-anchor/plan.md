# BO-venue-header anchor — Implementation Plan

> **For agentic workers:** Implement task-by-task, TDD per task (failing test → minimal impl → green → commit). Steps use `- [ ]` checkboxes.

**Goal:** Admit a dims-only breakout room whose header sits above a `BO` field block, anchored on the field block (not a dims token), symmetric to the shipped `findGsBlockVenueHeader`.

**Architecture:** One new exported helper `findBoBlockVenueHeaders` + a new fifth pass in `parseBoRooms`, plus an optional `extraTerminators` param on `extractBoBlock`. Parser-only. Spec: `docs/superpowers/specs/2026-07-06-bo-venue-header-anchor.md` (APPROVED, Codex R5).

**Tech Stack:** TypeScript, Vitest. Files: `lib/parser/blocks/rooms.ts`, `fixtures/shows/synthetic/2026-07-bo-venue-header.md`, `tests/parser/blocks/*.test.ts`.

## Global Constraints

- Parser-only: NO UI, NO DB/migrations, NO advisory-locks, NO new §12.4 code (spec §2, §8, §10).
- Corpus byte-identical: `tests/parser/blocks/__baselines__/origin-main-rooms.json` `toEqual` must stay green; new pass admits ZERO on the committed corpus (spec §5).
- Every commit conventional-style `feat(parser):` / `test(parser):`, `--no-verify`, trailers `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` + `Claude-Session: …`.
- Meta-test inventory (spec §8.2): EXTENDS the room corpus-no-op baseline with a `findBoBlockVenueHeaders(...).filter(h=>h.admit).length===0` assertion. Creates no new registry. Advisory-lock topology: N/A.

---

## Task 1: Synthetic fixture

**Files:** Create `fixtures/shows/synthetic/2026-07-bo-venue-header.md`

Hand-authored capability fixture (NOT a Drive render — header comment says so). One INFO-style sheet containing the five §6 cases:
1. `SALON ABCD&#10;60' x 45'` (col-duplicated header) directly above `BO Setup | A` / `BO Set Time | 8 AM` / `BO Audio | mics` / `BO Video | screen`.
2. `| PROJECTION SCREEN | 5' x 9' |` (`label|value`) directly above `| BO Setup | screen-only |` — asset directly above a BO block.
3. `| 4' X 8' RISER | staging |` (`label|value`) elsewhere, no BO block.
4. `GRAND HALL&#10;DAY 1 & 2` + a `BO Setup`/`BO Video` block (DAY-range breakout, owned by the v1 loop).
5. `MERIDIAN&#10;40' x 30'` + `BO Setup | m-setup` / `BO Audio | m-audio` placed **immediately** below case 1's block with NO blank separator (adjacency / extraTerm proof).

- [ ] **Step 1: Write the fixture** with the five cases (markdown tables; `&#10;` for in-cell newlines; col-duplicated headers use `| X | X |` + a `| :---: | :---: |` separator, matching `exporter-xlsx/east-coast.md:67`).
- [ ] **Step 2: Commit** — `test(parser): add synthetic BO-venue-header fixture (5 cases)`.

---

## Task 2: `findBoBlockVenueHeaders` (exported helper) + unit test

**Files:** Modify `lib/parser/blocks/rooms.ts`; Test `tests/parser/blocks/boVenueHeader.test.ts` (new)

**Interfaces — Produces:** `export function findBoBlockVenueHeaders(markdown: string, model: RoomHeaderModel): { header: string; headerLine: number; admit: boolean }[]` (spec §3.1).

- [ ] **Step 1: Write failing test** (`tests/parser/blocks/boVenueHeader.test.ts`) — inline markdown snippets asserting on the `admit` flag (spec §7 test 1):
  - `SALON ABCD\n60' x 45'` + BO block → one record `admit === true`, `header` contains `SALON ABCD`.
  - `| PROJECTION SCREEN | 5' x 9' |` + `| BO Setup | x |` → one record `admit === false`.
  - `RPAS BREAKOUT 2&#10;LASALLE B&#10;30' x 25'` + BO block → `admit === false` (substring gate).
  - `SALON A&#10;DAY 1 & 2` + BO block → `admit === false` (DAY gate).
  - `BO BALLROOM&#10;40' x 30'` + BO block → `admit === true` (recognized-field-label skip must not swallow the venue).
  - Two anchors (`BO Setup` + `BO Set Time`) under one header → exactly ONE record.
  - A `SALON\n60' x 45'` header, then `BO Setup | A`, `|  | continuation |`, `BO Set Time | B` → still ONE `admit===true` record for SALON (empty-col-0 continuation skipped, spec §3.1 step 1 / R5 MEDIUM).
  - Assert `filter(h => h.admit).map(h => h.header)` equals the intended rooms.
- [ ] **Step 2: Run — expect FAIL** (`pnpm vitest run tests/parser/blocks/boVenueHeader.test.ts`) — "findBoBlockVenueHeaders is not a function".
- [ ] **Step 3: Implement** `findBoBlockVenueHeaders` per spec §3.1: iterate anchor rows `^\|\s*BO\s+(?:Setup|Set Time|Show Time|Strike Time)\b`; walk up skipping blanks, separators, empty-col-0 rows, and recognized `^BO\s+<label∈ROOM_FIELD_LABELS>` rows; resolve the header row `j`; compute `admit` = shape (`c0!=="" && (c1===""||c1===c0)`) ∧ ¬substring-banner ∧ evidence(`&#10;`|dims) ∧ ¬`headerDayMarker`; record `{header: rawCell, headerLine: j, admit}`; dedup by `headerLine`. Reuse `col0Of`, `splitRow`, `clean`, `allEmptyCells`, `ROOM_FIELD_LABELS`, `headerDayMarker`.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(parser): add findBoBlockVenueHeaders (dims-only BO header resolver)`.

---

## Task 3: `extractBoBlock` extraTerminators param

**Files:** Modify `lib/parser/blocks/rooms.ts` (`extractBoBlock`, rooms.ts:1177)

**Interfaces — Produces:** `extractBoBlock(lines, startLine, model, extraTerminators?: ReadonlySet<number>)`; default empty set; loop also breaks on `k > 0 && extraTerminators.has(startLine + k)`.

- [ ] **Step 1: Write failing test** (append to `boVenueHeader.test.ts` or a focused `extractBoBlock` test): a two-block markdown (`SALON A` block immediately followed by `SALON B` block, no blank), assert extracting from `SALON A`'s line WITH an `extraTerminators` set containing `SALON B`'s line yields only SALON A's rows (no SALON B fields).
- [ ] **Step 2: Run — expect FAIL** (overrun; SALON B rows included).
- [ ] **Step 3: Implement** the optional `extraTerminators: ReadonlySet<number> = EMPTY` param + the extra break condition. Existing call sites unchanged (spec §3.2 step 2).
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(parser): extractBoBlock accepts extra terminator lines`.

---

## Task 4: The fifth pass in `parseBoRooms` + end-to-end tests

**Files:** Modify `lib/parser/blocks/rooms.ts` (`parseBoRooms`, after the DAY-range group loop, rooms.ts:1117); Test `tests/parser/blocks/boVenueHeader.test.ts` (e2e via `parseSheet`)

**Interfaces — Consumes:** `findBoBlockVenueHeaders` (Task 2), `extractBoBlock` w/ extraTerm (Task 3).

- [ ] **Step 1: Write failing e2e test** — `parseSheet(readFixture('synthetic/2026-07-bo-venue-header.md')).rooms` (spec §7 tests 2 & 5):
  - exactly one `SALON ABCD` breakout, dims `60' x 45'`, `setup === 'A'`, audio/video from its block;
  - exactly one `MERIDIAN` breakout with ITS OWN `setup === 'm-setup'` / audio (no field theft from SALON);
  - NO room named `PROJECTION SCREEN` or `RISER`;
  - the `GRAND HALL` DAY breakout present exactly once (no double-emit).
  - Derive expected dims/setup from the fixture cells, not hardcoded (anti-tautology, spec §7).
- [ ] **Step 2: Run — expect FAIL** (SALON ABCD / MERIDIAN absent).
- [ ] **Step 3: Implement** the fifth pass per spec §3.2: build `const emitted = new Set(rooms.map(r => (r.name ?? '').toUpperCase()))`; `const boVenue = findBoBlockVenueHeaders(markdown, model)`; `const extraTerm = new Set(boVenue.map(h => h.headerLine))`; for each `h` with `h.admit`: split header, skip if `!name || emitted.has(key)`, build breakout room, `applyBoFields(room, extractBoBlock(model.lines, h.headerLine, model, extraTerm))`, `if (!roomHasContent(room)) continue`, `emitted.add(key); rooms.push(room)`. Do NOT touch `seen`.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(parser): admit dims-only BO-venue-header breakout rooms (fifth pass)`.

---

## Task 5: Corpus no-op + asset-mutation + GS/BO reconciliation tests

**Files:** Test `tests/parser/blocks/boVenueHeader.test.ts`; touch `tests/parser/blocks/roomHeaderModel.test.ts` if the baseline assertion needs the new zero-admit check co-located.

- [ ] **Step 1: Corpus no-op test (§7 test 3)** — iterate every `fixtures/shows/**/*.md` **EXCLUDING `fixtures/shows/synthetic/**`** (the synthetic capability fixture legitimately admits SALON ABCD/MERIDIAN — it is not part of the frozen corpus, and is NOT in `__baselines__/origin-main-rooms.json`, which covers only the raw + exporter-xlsx families). For each, `computeRoomHeaderModel(md)` and assert `findBoBlockVenueHeaders(md, model).filter(h => h.admit).length === 0`. Run — expect PASS (already true per emulation). Also confirm the existing `roomHeaderModel.test.ts` baseline `toEqual` still green **without regenerating the baseline** (real-corpus rooms are unchanged since the new pass admits zero there).
- [ ] **Step 2: Asset-mutation micro-test (§7 test 4)** — take fixture case 2 (asset directly above BO block), programmatically inject a blank row / shift a column around the `label|value` pair, assert `parseSheet(...).rooms` still has no `PROJECTION SCREEN` room. States the failure mode: shape-gate brittleness under perturbation. Complements `feat/mutation-harness` (no dependency on it).
- [ ] **Step 3: GS/BO reconciliation test (§7 test 5)** — synthetic sheet with a GS room `SALON ABCD` (GS block) AND a dims-only `SALON ABCD\n60' x 45'` above a separate BO block; assert output matches the EXISTING rooms.ts:408-438 reconciliation (absorb-if-lossless-subset else keep both) — NOT a deleted breakout. Guards against re-introducing GS-name `seen`-seeding.
- [ ] **Step 4: Run all three — expect PASS. Commit** — `test(parser): corpus no-op + asset-mutation + GS/BO reconciliation for BO-venue anchor`.

---

## Task 6: Full-suite gate (typecheck / lint / format / vitest)

- [ ] **Step 1:** `pnpm vitest run tests/parser` — all parser tests green.
- [ ] **Step 2:** `pnpm test` (full suite) — triage any failure env/psql-vs-real (memory: pre-existing live-DB/HTTP failures are acceptable; broad breakage = design signal).
- [ ] **Step 3:** `pnpm typecheck` (vitest strips types — must run `next build`/tsc gate) — green.
- [ ] **Step 4:** `pnpm lint` (eslint canonical Tailwind etc.) + `pnpm format:check` — green (`--no-verify` bypassed prettier hook).
- [ ] **Step 5:** No new §12.4 code, so NO catalog/gen touchpoints. Confirm `git grep` shows no new `code:` literal added.

---

## Self-review checklist (run before adversarial review)

- Spec coverage: every §6 case → Task 1 fixture; §3.1 → Task 2; §3.2 step 2 → Task 3; §3.2 step 1/3 → Task 4; §5/§7 → Task 5. ✅
- Anti-tautology: expected values derived from fixture cells; corpus test asserts on the data source (`findBoBlockVenueHeaders` return), not a container; each test states its failure mode. ✅
- No placeholders; exact file paths + commands. ✅
- Type consistency: `findBoBlockVenueHeaders` return shape identical across Tasks 2/4/5; `extractBoBlock` param name `extraTerminators` consistent Tasks 3/4. ✅

## Adversarial review (cross-model) — MANDATORY before execution handoff

After self-review, invoke Codex adversarial-review on this plan (fresh-eyes, REVIEWER ONLY, no round budget). Iterate to APPROVE. Only then advance to Stage 3 execution.
