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
5. `MERIDIAN&#10;40' x 30'` + `BO Setup | m-setup` / `BO Audio | m-audio` placed **immediately** below case 1's block with NO blank separator (admitted→admitted adjacency / extraTerm proof).
6. `ORCHID&#10;50' x 40'` + `BO Setup | orchid-setup` block, then **immediately** (NO blank) `| PROJECTOR CART | 3' x 4' |` (`label|value` asset) + `| BO Setup | cart-setup |`. Proves a **rejected** header (`admit=false`) still terminates the prior admitted block — a broken `extraTerm = boVenue.filter(h=>h.admit)...` would leak `cart-setup` into ORCHID (Codex plan HIGH2).

- [ ] **Step 1: Write the fixture** with the six cases (markdown tables; `&#10;` for in-cell newlines; col-duplicated headers use `| X | X |` + a `| :---: | :---: |` separator, matching `exporter-xlsx/east-coast.md:67`).
- [ ] **Step 2: Commit** — `test(parser): add synthetic BO-venue-header fixture (6 cases)`.

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

## Task 3: The fifth pass in `parseBoRooms` (incl. `extractBoBlock` extraTerminators) + e2e tests

**Files:** Modify `lib/parser/blocks/rooms.ts` (`extractBoBlock` rooms.ts:1177 + `parseBoRooms` after the DAY-range group loop, rooms.ts:1117); Test `tests/parser/blocks/boVenueHeader.test.ts` (e2e via `parseSheet`)

**Interfaces — Consumes:** `findBoBlockVenueHeaders` (Task 2). **Produces:** `extractBoBlock(lines, startLine, model, extraTerminators?: ReadonlySet<number> = EMPTY)` — loop also breaks on `k > 0 && extraTerminators.has(startLine + k)`; existing call sites pass nothing. (`extractBoBlock` stays private; it's exercised through `parseSheet` e2e — no direct test, per Codex plan HIGH1.)

- [ ] **Step 1: Write failing e2e test** — `parseSheet(readFileSync('fixtures/shows/synthetic/2026-07-bo-venue-header.md','utf8')).rooms` (spec §7 tests 2 & 5). Derive every expected value from the fixture cells (anti-tautology):
  - exactly one `SALON ABCD` breakout, dims `60' x 45'`, `setup === 'A'`, audio/video from its block;
  - exactly one `MERIDIAN` breakout with ITS OWN `setup === 'm-setup'` / audio (admitted→admitted adjacency, no field theft, case 5);
  - **exactly one `ORCHID` breakout with `setup === 'orchid-setup'`, and `ORCHID.setup !== 'cart-setup'`** (case 6 — proves the REJECTED `PROJECTOR CART` header still terminated ORCHID's extraction; a `filter(h=>h.admit)` extraTerm would fail here);
  - NO room named `PROJECTION SCREEN`, `RISER`, or `PROJECTOR CART`;
  - the `GRAND HALL` DAY breakout present exactly once (no double-emit).
- [ ] **Step 2: Run — expect FAIL** (SALON ABCD / MERIDIAN / ORCHID absent).
- [ ] **Step 3: Implement** BOTH:
  1. `extractBoBlock`: add `extraTerminators: ReadonlySet<number> = EMPTY_TERMINATORS` (a module-level `new Set<number>()`) + the extra break condition.
  2. The fifth pass in `parseBoRooms` per spec §3.2: `const emitted = new Set(rooms.map(r => (r.name ?? '').toUpperCase()))`; `const boVenue = findBoBlockVenueHeaders(markdown, model)`; `const extraTerm = new Set(boVenue.map(h => h.headerLine))` (INCLUDES `admit===false` headers — that is what terminates a prior block before a rejected asset, case 6); for each `h` with `h.admit`: split, skip if `!name || emitted.has(key)`, build breakout, `applyBoFields(room, extractBoBlock(model.lines, h.headerLine, model, extraTerm))`, `if (!roomHasContent(room)) continue`, `emitted.add(key); rooms.push(room)`. Do NOT touch `seen`.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(parser): admit dims-only BO-venue-header breakout rooms (fifth pass)`.

---

## Task 4: Corpus no-op + asset-mutation + GS/BO reconciliation tests

**Files:** Test `tests/parser/blocks/boVenueHeader.test.ts`.

- [ ] **Step 1: Corpus no-op test (§7 test 3)** — iterate every `fixtures/shows/**/*.md` **EXCLUDING `fixtures/shows/synthetic/**`** (the synthetic fixture legitimately admits; it is NOT in `__baselines__/origin-main-rooms.json`, which covers only raw + exporter-xlsx). For each, `computeRoomHeaderModel(md)` and assert `findBoBlockVenueHeaders(md, model).filter(h => h.admit).length === 0`. Also confirm the existing `roomHeaderModel.test.ts` baseline `toEqual` stays green **without regenerating the baseline** (real-corpus rooms unchanged — new pass admits zero there).
- [ ] **Step 2: Asset-mutation micro-test (§7 test 4)** — take fixture case 2 (asset directly above BO block) as an inline string, programmatically inject a blank row / shift a column around the `label|value` pair, assert `parseSheet(...).rooms` still has no `PROJECTION SCREEN` room. Failure mode: shape-gate brittleness under perturbation. Complements `feat/mutation-harness` (no dependency).
- [ ] **Step 3: GS/BO reconciliation test (§7 test 5)** — TWO exact inline-markdown cases against the existing rooms.ts:408-438 reconciliation (Codex plan MEDIUM — pin both, don't adapt to output):
  - **(a) lossless-subset absorbed:** a GS block `HELICON` with `GS Setup | theatre` / `GS Audio | 2 mics`, AND a dims-only `HELICON&#10;60' x 45'` above a BO block whose ONLY populated field is a subset already in GS (e.g. `BO Audio | 2 mics`, same value). Assert the breakout is **absorbed** → exactly one `HELICON` room (the GS one, dims filled from the header), no separate breakout.
  - **(b) conflicting field kept:** same GS `HELICON` (`GS Audio | 2 mics`), and a dims-only `HELICON&#10;60' x 45'` above a BO block with a CONFLICTING value (`BO Audio | 6 mics`). Assert **both** rooms are kept (GS `HELICON` + a distinct breakout `HELICON`), matching current behavior for east-coast MABEL 1. This proves the new pass routed through reconciliation and did NOT delete the breakout (regression guard against GS-name `seen`-seeding).
- [ ] **Step 4: Run all — expect PASS. Commit** — `test(parser): corpus no-op + asset-mutation + GS/BO reconciliation for BO-venue anchor`.

---

## Task 5: Full-suite gate (typecheck / lint / format / vitest)

- [ ] **Step 1:** `pnpm vitest run tests/parser` — all parser tests green.
- [ ] **Step 2:** `pnpm test` (full suite) — triage any failure env/psql-vs-real (memory: pre-existing live-DB/HTTP failures acceptable; broad breakage = design signal).
- [ ] **Step 3:** `pnpm typecheck` (vitest strips types — separate tsc gate) — green.
- [ ] **Step 4:** `pnpm lint` + `pnpm format:check` — green (`--no-verify` bypassed the prettier hook).
- [ ] **Step 5: §12.4 confirmation (diff-scoped, Codex plan LOW):** `git diff origin/main -- lib/parser/blocks/rooms.ts tests/parser` and confirm NO added `code:` literal and NO change under `lib/messages/` / `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` / any `gen:*` output — i.e. zero catalog/spec-code touchpoints (this feature emits no signal).

---

## Self-review checklist (run before adversarial review)

- Spec coverage: §6 six cases → Task 1 fixture; §3.1 helper → Task 2; §3.2 (all steps: local emitted-set, extraTerm incl. rejected headers, admit filter, roomHasContent) + `extractBoBlock` param → Task 3; §5/§7 tests 3/4/5 → Task 4; typecheck/lint/format/§12.4 → Task 5. ✅
- Anti-tautology: expected values derived from fixture cells; corpus test asserts on the data source (`findBoBlockVenueHeaders` return), not a container; case 6 proves rejected-header termination (defeats a `filter(admit)` shortcut); reconciliation test pins two exact cases; each test states its failure mode. ✅
- No placeholders; exact file paths + commands. ✅
- Type consistency: `findBoBlockVenueHeaders` return shape identical across Tasks 2/3/4; `extractBoBlock` `extraTerminators` param consistent. `extractBoBlock` stays private (tested via `parseSheet` e2e), only `findBoBlockVenueHeaders` exported. ✅

## Adversarial review (cross-model) — MANDATORY before execution handoff

After self-review, invoke Codex adversarial-review on this plan (fresh-eyes, REVIEWER ONLY, no round budget). Iterate to APPROVE. Only then advance to Stage 3 execution.
