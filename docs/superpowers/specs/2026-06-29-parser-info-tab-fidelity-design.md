# Parser INFO-tab fidelity cluster — design spec

**Date:** 2026-06-29
**Slug:** parser-info-tab-fidelity
**Scope:** **three** parser-only (non-UI) fixes surfaced by the INFO-tab data-fidelity audit (`docs/info-tab-fidelity-audit-2026-06-29.md`): H1 DRESS capture, H2 lunch-room dedup, M3 title banner-preference. No migrations, no UI files, no `app/`, no `components/`. Commit style `feat|fix|test(parser):`. **(A fourth fix — M1 GS-dimension capture — was DROPPED during spec review; see Resolved Decision 5.)**
**Source of truth fixture:** `fixtures/shows/exporter-xlsx/consultants.md` (prod-exporter synthesis) cross-checked against the LIVE Consultants INFO/GEAR tabs (gsheets MCP). The `fixtures/shows/raw/*` family is legacy MCP-converter output — **never regenerate it**; add focused inline fixtures for new unit tests. **Caveat (learned this round):** the committed exporter fixtures are stale 2026-06-18 snapshots and are NOT authoritative for sheet *content* — a fix must be validated against the live sheet, not just the fixture (AGENTS.md Codex notes; `exporterFixtures.test.ts:1168-1177`).

This spec fixes data fidelity at the parse layer for shipped, consumer-backed surfaces. Rendering work (tech-specs card, per-room detail display, review-modal completeness, partial-attendance chip) is explicitly OUT OF SCOPE and tracked separately in `BACKLOG.md`.

---

## Resolved decisions (read first — these preempt review relitigation)

1. **Dress is preserved as a label-retaining multi-line `event_details.dress_code`, NOT split into two new fields.** The existing and only consumer reads `event_details.dress_code` (TodaySection.tsx:297; event.ts:90-96 comment: "the consumer reads `event_details.dress_code` only"). The source already self-labels its lines (`Set/Strike: …`, `Show: …`), so a newline-joined value preserves **both** values with zero loss — this is what "preserve two distinct values, not a lossy collapse" means here. The lossy "collapse" the audit warned against was last-write-wins overwrite that drops one line; we drop nothing. Introducing new `dress_set_strike`/`dress_show` fields would create **zombie fields** (no reader; the global flag-lifecycle rule forbids storing a field nothing reads) and would require an out-of-scope UI change. A richer two-card presentation can split on the retained labels in the deferred UI work.

2. **The generic "Additional rooms" card is intentional and stays.** rooms.ts:158-167 deliberately surfaces the client-intake-form prose (`Additional Room Name(s)` / `Additional Room Setup`) as a single `Additional rooms` card carrying `notes`/`setup`, "so the real 'which rooms / no AV needed' signal stays visible behind a clean label" — the crew Today section renders it. It only *looks* empty in the **Step-3 modal** because the modal doesn't render room `notes`/`setup`; that is the M2 review-modal gap (`BL-REVIEW-MODAL-COMPLETENESS`), **not** a parser bug. We do **not** suppress this card. (The audit's "phantom Additional rooms" framing is superseded by reading the code.)

3. **The `mergeGearIntoRooms` `(kind, name-token)` match key is preserved — NOT relaxed to token-only.** index.ts:341-348 documents a prior review decision (R8-H1): "NOT by name token alone … an `additional` and a `breakout` can share a token." Relaxing to token-only would relitigate that and risk false merges. The lunch-room duplication is a *same-room, mismatched-kind+name* problem (INFO `breakout`/`BALLROOM C` vs GEAR `additional`/`GRAND BALLROOM C`), fixed by **aligning the GEAR lunch kind to `breakout`** AND **dropping the leading `GRAND` qualifier from the GEAR lunch room name (scoped to the lunch branch only)** — the shared `gearNameToken` is left untouched (no global `GRAND` strip), keeping the `(kind, token)` key intact and avoiding any cross-room `GRAND X`/`X` collision (Codex spec-R1 finding 2).

4. **The lunch-room dedup changes the consultants room key-set, which triggers a one-time MI-7b re-stage on next sync.** invariants.ts:337 keys room preservation on `${kind}::${name}`; removing the duplicate `additional::GRAND BALLROOM C` room is a room-set change → MI-7b re-stages affected already-staged shows exactly once. This is the documented, intended MI-7b behavior (parser changes re-stage once), not a regression.

5. **GS `room.dimensions` capture (the audit's M1) is DROPPED from this PR — it targets a stale fixture artifact, not live behavior.** The audit observed `GS room.dimensions === null` while testing the committed `exporter-xlsx/consultants.md`, whose GS header carries no dims (they sit in a standalone `ROOM DIMENSIONS:` intake row). But the **live** Consultants sheet carries GS dims **inline** in the `GENERAL SESSION\nNAME\nDIMS\nFLOOR` header cell — which `splitRoomHeader` already parses (verified: live INFO tab via gsheets MCP; pinned by `tests/parser/exporterFixtures.test.ts:1168-1185`, which also states the *"separate-ROOM-DIMENSIONS-row #1b is obsolete: no live sheet uses that shape anymore"*). So on production data GS dims are **not** dropped; a standalone-row backfill would fix a non-problem, add a fresh collision surface (spec-R3/R4), and cause needless MI-7b re-stage churn. The render-side gap (no component renders `room.dimensions`) remains real and stays in `BL-ROOM-DETAIL-UNRENDERED`, where any genuine live capture gap must be designed against the inline-header shape.

6. **No `lib/parser/versions/` mirror exists** (verified: directory absent). Companion-surface mirror check (a) is moot.

---

## Fix 1 — H1: capture the DRESS block (`BL-PARSER-DRESS-DROP`)

**Bug.** `parseEventDetails` slices markdown from the DETAILS header (`event.ts:134-137`) and only reads rows in that slice. The INFO `DRESS` block sits **before** the DETAILS header (fixture:31-33, header at fixture:63), so the `dress`/`attire`→`dress_code` aliases (`event.ts:97-100`) never fire. `crew.ts:34` lists `"DRESS"` only as a parse *terminator*. No dress capture exists → `event_details.dress_code === undefined` → TodaySection dress card renders null (TodaySection.tsx:297-299,467). DRESS-before-DETAILS is the standard exporter layout → affects every show.

**Source shape** (fixture:31-34) — note the markdown **separator row** between the header and the continuation, and the blank line that terminates the block:
```
| DRESS | Set/Strike: Black Pants, Black Polo Shirt, Black Footwear |
| :---: | :---: |
|  | Show: Black Pants, Black Long Sleeve Button Down Shirt, Black Footwear |
<blank line>
```
Header row: col0 == `DRESS`, value in col1. Then a separator row (`| :---: | :---: |`). Then a continuation row: col0 empty, value in col1. Then a blank line.

**Design.** New block parser `lib/parser/blocks/dress.ts` exporting `parseDress(markdown): string | null`:
- Scan lines for a table row whose normalized col0 === `"DRESS"` (uppercase, single-spaced, trimmed — reuse `normalizeHeader` from `knownSections.ts`).
- Collect that row's col1 (if non-empty), then continue scanning subsequent lines:
  - **separator row** (matches the repo-standard `/^\|\s*:?-+:?\s*\|/` — i.e. `| :---: | … |`) → **SKIP** and keep scanning. **This is the round-2 fix (Codex spec-R2): the exporter emits a `| :---: | :---: |` separator between the DRESS header and the `Show:` continuation, so without skipping it the scan would stop and persist only the Set/Strike line — recreating a lossy capture for every standard exporter sheet.**
  - **continuation row** (col0 empty/whitespace, col1 non-empty) → COLLECT col1.
  - **terminator** — a blank/non-table line, EOF, or a row whose col0 is a non-empty label/section header → STOP.
- Join the collected lines with `\n`, trimmed. Return `null` if nothing collected.
- Handle exporter column-duplication: `Set/Strike: X | Set/Strike: X | …` → take the first non-empty cell after col0 and de-dup identical trailing cells (mirror how room headers treat `col1 === col0`).

Wire into `index.ts` orchestrator after `parseEventDetails`: `const dress = parseDress(markdown); if (dress) eventDetails.dress_code = dress;` — **overwrite precedence**: `parseDress` captures the complete block (header value + continuations), strictly ≥ what the in-DETAILS single-row alias could capture, so it wins when both fire. For a show whose dress is a `| Dress | X |` row *inside* DETAILS, `parseEventDetails` already set `dress_code = X`; `parseDress` finds the same `DRESS`/`Dress` row, captures `X` (no continuations) → idempotent, no regression. The typo-tolerant alias path (`atire`→dress_code) is untouched: `parseDress` matches only exact normalized `DRESS`, so fuzzy-only labels stay with `parseEventDetails`.

**Guard conditions:** no DRESS block → returns `null` → `dress_code` stays absent → card hidden (unchanged). DRESS header with empty col1 and no continuations → `null`. Single-row DRESS → that one line. A separator row immediately after the header does NOT terminate the scan (it is skipped — round-2 fix). A blank line or a real labeled row terminates. Sentinel value (`N/A`) → stored; TodaySection's `shouldHideGenericOptional` hides it (existing behavior).

**Meta-test:** add `"DRESS"` to `REQUIRED_HEADERS` in `tests/parser/_metaKnownSectionsRegistry.test.ts` and the citing comment (DRESS becomes a parser-recognized header). `DRESS` is already in `KNOWN_SECTION_HEADERS` (knownSections.ts) → registry passes unchanged.

**Consumer:** `event_details.dress_code` (string) — TodaySection.tsx:297 already reads it. Multi-line renders fine in the SectionCard. No UI change; immediate crew value.

---

## Fix 2 — H2: dedupe the lunch room (`BL-ROOM-GEAR-MERGE-DEDUP`, lunch-room portion)

**Bug.** For the lunch room, INFO produces `{kind:"breakout", name:"BALLROOM C"}` (rooms.ts:718-727 `lunchRe` → `buildEmptyRoom("breakout", …)`) while GEAR produces `{kind:"additional", name:"GRAND BALLROOM C"}` (gear.ts:92-102 `newRoom` defaults non-GS/non-BO to `additional`; `ROOM_PREFIX_RE` strips `LUNCH SESSION -` but leaves `GRAND BALLROOM C`). `mergeGearIntoRooms` (index.ts:355) needs `r.kind === g.kind && gearNameToken(r.name) === gearNameToken(g.name)`; the lunch room misses on **both** (kind: breakout≠additional; token: `BALLROOM C`≠`GRAND BALLROOM C`, since `gearNameToken`/`ROOM_NAME_PREFIX_RE` at index.ts:326-336 don't strip `GRAND`). The unmatched GEAR room is appended → two cards (INFO card has times, GEAR card has gear). Confirmed: `parseSheet()` → 9 rooms; one is the split.

**Design — two narrow changes scoped to the GEAR lunch room only, both preserving the `(kind, token)` key:**

1. **Align GEAR lunch kind** — gear.ts `newRoom` (after the BREAKOUT branch at gear.ts:96): add `else if (/^LUNCH\b/.test(upper)) kind = "breakout";`. This matches INFO's `lunchRe` choice (`buildEmptyRoom("breakout", …)`), so both lunch rooms share `kind:"breakout"`.
2. **Drop the `GRAND` qualifier from the GEAR lunch room NAME (lunch-scoped, not global)** — in gear.ts `newRoom`, in the same LUNCH branch, after `ROOM_PREFIX_RE` strips `LUNCH SESSION -`, also strip a leading `GRAND ` from the lunch room's name: `name = name.replace(/^GRAND\s+/i, "")`. So `LUNCH SESSION - GRAND BALLROOM C` → `GRAND BALLROOM C` → `BALLROOM C`, matching INFO's `BALLROOM C`. **The shared `gearNameToken` (index.ts:328-336) is NOT modified** — there is no global `GRAND` strip, so non-lunch rooms named `GRAND X` and `X` never collide (Codex spec-R1 finding 2). GS rooms are unaffected: both INFO and GEAR carry `GRAND BALLROOM A/B`, whose tokens already match, so GS continues to merge with no change.

Result: GEAR lunch `{breakout, name "BALLROOM C", token BALLROOM C}` matches INFO lunch `{breakout, "BALLROOM C", token BALLROOM C}` → gear merges onto the INFO room (fill-don't-clobber, index.ts:357-360). No duplicate. The `(kind, token)` key and `gearNameToken` are unchanged → R8-H1 protection intact, no cross-room collision surface. (If a GEAR lunch room has *no* INFO counterpart, it appends with the `GRAND`-stripped name — a cosmetic, INFO-consistent naming, not data loss.)

**Out of scope (per Resolved Decision 2):** the `Additional rooms` card and the `FOYER` gear-only room (real gear at fixture:181) are correct and untouched. After this fix the consultants room count goes 9 → 8.

**Guard conditions:** a GEAR room with no INFO counterpart still appends (unchanged). All-null GEAR rooms still skipped (index.ts:353). Non-lunch rooms are entirely unaffected — both the kind-align and the `GRAND` strip live inside the `^LUNCH` branch, so a non-lunch `GRAND FOYER`/`FOYER` pair keeps distinct tokens and never merges. The lunch `GRAND` strip only removes a leading `GRAND ` token; names like `GRANDVIEW` are unaffected (`\s+` boundary).

**Collision-safety note (vs the Fix-4 dimension-match concern).** Unlike the standalone dimension-row match, this merge is NOT a collision surface: it keys on the full `(kind, gearNameToken)` and the GEAR lunch room's stripped token `BALLROOM C` can only match an INFO room **of kind `breakout` named `BALLROOM C`** — which is uniquely the lunch room itself (two distinct breakout rooms cannot share the name `BALLROOM C`). `result.find` returning the first match is pre-existing behavior unchanged by this fix, and `fill-don't-clobber` means even a hypothetical mis-match only fills currently-null gear columns. So no new `GRAND X`/`X` false-merge is introduced here (the kind-equality requirement, preserved per R8-H1, is exactly what prevents it).

**Re-stage note:** changes the consultants room key-set → one-time MI-7b re-stage (Resolved Decision 4). Other shows with GEAR `LUNCH`/`GRAND`-prefixed rooms may also re-stage once.

---

## Fix 3 — M3: prefer the line-1 banner title (`BL-TITLE-EVENT-NAME-PREFERENCE`)

**Bug.** `extractTitleFromMarkdown` priority #1 (index.ts:121-133) returns the first `Event Name:` cell before the line-1 banner (priority #6, index.ts:186-205). For exporter shows the `Event Name:` cell is UPPERCASE and year-dropped (`AII/III - CONSULTANTS ROUNDTABLE`, fixture:137) while line 1 is the proper banner (`AII/III - Consultants Roundtable 2025`, fixture:1). Mangled title renders on the crew header and the review-modal source link.

**Corpus evidence.** Every exporter-xlsx fixture has line 1 = the proper-cased title **duplicated across all cells** (the exporter column-duplication signature); four also carry an uppercase `Event Name:` row. So banner-first is a corpus-wide improvement:
| fixture | line-1 banner | `Event Name:` (current, mangled) |
|---|---|---|
| consultants | `AII/III - Consultants Roundtable 2025` | `AII/III - CONSULTANTS ROUNDTABLE` |
| fintech | `II - FinTech Forum CTO Summit 2026` | `FINTECH FORUM CTO SUMMIT 2026` |
| fixed-income | `II - Fixed Income Trading Summit 2025` | `FIXED INCOME TRADING SUMMIT 2025` |
| rpas | `II - Retirement Plan Advisor Institute - Central 2026` | `RETIREMENT PLAN ADVISOR INSTITUTE - CENTRAL 2026` |
| east-coast / ria / redefining-fi | banner present | (no `Event Name:` row) |

**Design.** Add a new **priority #0** to `extractTitleFromMarkdown`: scan the first table region (skipping markdown **separator rows** `/^\|\s*[:|-]+\s*\|/`, mirroring the existing #6 scan at index.ts:197); the **banner** is the first non-separator row whose first cell (`cells[0]`) is **duplicated in ≥1 other cell of the same row** (`cells[1] === cells[0]`, after trim) **AND passes the full non-title guard set** (round-5 fix, Codex spec-R5).

**Acceptance predicate (must NOT be weaker than the existing #6 fallback).** Refactor the existing #6 guard (`index.ts:202-209`) into a shared helper `isAcceptableTitleCell(cell)` used by BOTH #0 and #6, so they can't drift. It rejects: empty; `isKnownNonTitle(cell)`; `cell.toUpperCase().startsWith("CLIENT")`; `startsWith("NO_HEADER")`; `cell === "\\#NUM\\!"`; `/^\\#/.test(cell)` (escaped error cells). **#0 additionally rejects `isKnownSectionHeader(cell)`** (from `knownSections.ts` — catches `DOCUMENT FOLDER LINK`, `DETAILS`, `VENUE`, `DRESS`, `HOTEL`, etc.). So a no-banner sheet whose first row is a duplicated **section header** (`| CLIENT | CLIENT |`, `| DOCUMENT FOLDER LINK | DOCUMENT FOLDER LINK |`, `| \#NUM\! | \#NUM\! |`) is rejected by #0 and falls through to the existing chain (Codex spec-R5). Only after passing all guards is a duplicated `cells[0]` returned. This signature:
- Matches all exporter banners (title in every cell).
- Skips the exporter `Event Name:` row (`cells[0]="Event Name:"` ≠ `cells[1]`).
- Skips RAW `| CLIENT | Institutional Investor |` rows (not duplicated; `cells[0]="CLIENT"` ≠ `cells[1]`) → raw consultants title **unchanged** (still via the existing path).
- Skips RAW `| NO_HEADER | title |` (not duplicated) → NO_HEADER handler (#5) still wins.
- RAW col0-only banners (`East Coast …` with empty col1, `II - Asset Management …`) are **not** duplicated, so priority #0 skips them and the existing first-cell path (#6) continues to handle them → **unchanged**.

Stop the #0 scan at the first non-separator table row (don't scan deep). Keep priorities #1-#6 as the fallback chain.

**Guard conditions:** no banner → falls through to existing chain (no behavior change for non-banner fixtures). Banner value that is a known-non-title → skipped. Multi-line banner (`redefining-fi`, contains `&#10;`) → returned as the same trimmed first-cell value the existing #6 path produces (verified identical), so its title is **unchanged**.

---

## Fix 4 — DROPPED (re-scoped out of this PR)

The audit's M1 "GS dimensions dropped" was an **artifact of testing the stale exporter fixture**, not a live-data defect. The live Consultants sheet carries GS dims **inline** in the `GENERAL SESSION\nNAME\nDIMS\nFLOOR` header cell, which `splitRoomHeader` already parses (verified live via gsheets MCP; pinned by `tests/parser/exporterFixtures.test.ts:1168-1185`, which declares the standalone-`ROOM DIMENSIONS:`-row shape **obsolete**). A standalone-row backfill would fix a non-problem, introduce a fresh collision surface, and cause needless re-stage churn (Codex spec-R3/R4). **Removed from scope** (Resolved Decision 5). The render-side gap stays in `BL-ROOM-DETAIL-UNRENDERED`. **This PR ships 3 fixes: H1 (dress), H2 (lunch dedup), M3 (title).**

---

## Flag / field lifecycle table

| field | storage | write path(s) | read path(s) | effect |
|---|---|---|---|---|
| `event_details.dress_code` | `ShowRow.event_details` | NEW `parseDress` (authoritative) + existing in-DETAILS alias | TodaySection.tsx:297 (existing) | crew "Dress code" card now populates |
| `room.kind` (GEAR lunch) | `RoomRow.kind` | gear.ts `newRoom` (NEW lunch branch) | `mergeGearIntoRooms` key; room render by kind | lunch gear merges onto INFO lunch room |
| `show.title` | `ShowRow.title` | `extractTitleFromMarkdown` (NEW priority #0) | crew header, review-modal link (existing) | proper-cased banner title |

No empty/zombie columns — every field written has an existing reader. (The dropped GS-dimension fix is the reason there is no zombie `room.dimensions` write here; see Resolved Decision 5.)

---

## Companion-surface checklist (from AGENTS.md Codex notes)

- (a) `lib/parser/versions/` — **absent**; no version mirror to update. ✓
- (b) fixture families — tests use committed `exporter-xlsx/consultants.md` (source of truth) + small inline fixtures; **no `raw/` regeneration**. ✓
- (c) `dataGaps.ts` / `warnings.ts` — no dress data-gap warning exists; room-count is not warned; `invariants.ts` MI-5 only requires `rooms.length >= 1` (8 ≥ 1 ✓). Re-run `dataGaps.test.ts` + `warnings.test.ts` to confirm no spurious trip/silence. ✓
- (d) meta-tests — EXTEND `tests/parser/_metaKnownSectionsRegistry.test.ts` (add `DRESS`). No new Supabase boundary / admin-alert / advisory-lock / tile-sentinel surfaces → those meta-tests N/A.

## Meta-test inventory (writing-plans declaration)
- **Extends:** `tests/parser/_metaKnownSectionsRegistry.test.ts` (+`DRESS`).
- **Creates:** none.
- **N/A:** `_metaInfraContract` (no Supabase calls), `_metaAdminAlertCatalog` (no alerts), `advisoryLockRpcDeadlock` (no `pg_advisory*`), tile sentinel (no tiles).

## Advisory-lock topology
N/A — no `pg_advisory*` touched.

---

## Test plan (TDD per task; failure-mode-first)

Each fix lands as its own commit: failing test → minimal impl → green → commit.

1. **parseDress unit** (`dress.ts` + new `tests/parser/dress.test.ts`): inline fixture using the **exact 3-line shape from `fixtures/shows/exporter-xlsx/consultants.md` including the `| :---: | :---: |` separator row** between header and continuation (header → separator → continuation → blank) **before** a DETAILS header → assert `event_details.dress_code === "Set/Strike: …\nShow: …"` (both lines, labels retained). **Separator-skip assertion (Codex spec-R2):** this exact shape proves the parser does not stop at the separator and drop the `Show:` line. Negative: no DRESS block → `dress_code` absent. Idempotency: DRESS-inside-DETAILS single row → same value, no duplication. Negative-regression: make `parseDress` treat the separator as a terminator → only `Set/Strike` captured → test fails. Concrete failure caught: the slice-after-DETAILS drop (today returns `undefined`) AND the separator-stop loss.
2. **Dress on real fixture** (`parseSheet`/`exporterFixtures`): assert `parseSheet(consultants).show.event_details.dress_code` contains both `Set/Strike` and `Show`. Negative-regression: mutate `parseDress` to return only the header row → test fails (proves it captures continuations).
3. **Lunch dedup** (`tests/parser/...`): assert `parseSheet(consultants).rooms` has exactly one `BALLROOM C`-token room with `kind:"breakout"` carrying **both** the INFO times and the GEAR audio gear; assert no separate `GRAND BALLROOM C` room; assert total room count 9→8; assert GS and FOYER unchanged. **Collision negative test (Codex spec-R1 finding 2):** an inline fixture with a GEAR `additional` room `GRAND FOYER` and an INFO `additional` room `FOYER` (or any non-lunch `GRAND X`/`X` same-kind pair) → assert they do **not** merge (two distinct rooms remain), proving the `GRAND` strip is lunch-scoped and `gearNameToken` is unchanged. Negative-regression: revert the gear-kind branch → two lunch rooms reappear.
4. **Title banner** (`tests/parser/...`): exact assertions — consultants → `AII/III - Consultants Roundtable 2025`; fintech/fixed-income/rpas → proper-cased banners (not uppercase). Unchanged assertions: east-coast, ria, redefining-fi titles equal their current values (snapshot the current value first, assert preserved). Generic guards (parseSheet.test.ts:44/54) still pass. Negative: revert priority #0 → consultants title reverts to uppercase. **Duplicated-section-header negatives (Codex spec-R5):** inline no-banner fixtures whose first table row is `| CLIENT | CLIENT |`, `| DOCUMENT FOLDER LINK | DOCUMENT FOLDER LINK |`, and `| \#NUM\! | \#NUM\! |` → assert `#0` does NOT return them as `show.title` (they fall through to the existing chain / filename fallback), proving the acceptance predicate is not weaker than #6.
5. **Meta-test** (`_metaKnownSectionsRegistry`): `DRESS` registered (passes with the registry as-is).

(GS-dimension tests removed with Fix 4 — see Resolved Decision 5.)

Full `pnpm test` (or the parser-scoped suite + `exporterFixtures` + `parseSheet` + `invariants`/`dataGaps`/`warnings`) green before whole-diff review.
