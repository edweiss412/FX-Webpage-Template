# BO-venue-header anchor — dims-only breakout room parsing (symmetric to the GS anchor)

**Status:** DRAFT (autonomous /ship-feature; both user-review gates waived)
**Date:** 2026-07-06
**Slug:** `bo-venue-header-anchor`
**Backlog:** closes / advances `BL-ROOM-DIMS-ONLY-NOVEL-HEADER` (BACKLOG.md:268)
**Blast radius:** parser-only. NO UI, NO DB/migrations, NO advisory-locks, **NO new §12.4 code** (pure admit path; emits no signal/warning).

---

## 1. Problem

`lib/parser/blocks/rooms.ts` already parses a **dims-only General Session header** — a header cell of the shape `NAME\n<dims>` with **no** `DAY N` range and **no** `GENERAL SESSION`/`BREAKOUT N` label — via `findGsBlockVenueHeader` (rooms.ts:806) + `parseGsRoom` (rooms.ts:846). Concretely, `MABEL 1\nAPPROXIMATELY 60' x 45'` (committed at `fixtures/shows/exporter-xlsx/east-coast.md:67`, sitting above a `GS Setup`/`GS Audio`/… field block) is admitted as GS room "MABEL 1", dims `60' x 45'` (`splitRoomHeader` strips the leading `APPROXIMATELY`, rooms.ts:1282+).

The **breakout** side has no symmetric capability. A dims-only header sitting above a `BO Setup`/`BO Audio`/… field block — e.g. a novel `SALON ABCD\n60' x 45'` breakout that carries neither a `DAY N` range (which the v1 group loop at rooms.ts:1094 handles) nor a `BREAKOUT`/`LUNCH ROOM` label (rooms.ts:1020, 1069) — is **dropped entirely**. `harvestSameNameHeaderDims` (rooms.ts:1125) only merges a dims-only header's dims **into an already-emitted same-named DAY-range room**; it never admits a *novel-named* dims-only breakout as its own room.

### 1.1 Why this was descoped before, and what changed

`BL-ROOM-DIMS-ONLY-NOVEL-HEADER` was descoped during PR #332 because a **dims-blind** admit gate ("any `NAME\n<dims>` cell is a room") cannot distinguish a novel dims-only room from a dims-bearing **asset/gear row** (`PROJECTION SCREEN\n5' x 9'`, `4' X 8' RISER`) — 14 adversarial rounds confirmed every *dims-token-based* gate reopened asset fabrication or field theft.

This spec does **not** add a dims-blind gate. It anchors on the **`BO` field block beneath the header** — the exact evidence pattern already shipped and proven safe for the GS side (`findGsBlockVenueHeader` walks UP from the first `GS` field row, rooms.ts:808-815). An asset/gear row has **no** `BO Setup…` block beneath it, so the anchor never fires on an asset. This is the "positive field-block anchor, not dims-token gate" distinction the backlog names as the safe path.

### 1.2 Real-world grounding (why now, and why a synthetic fixture)

Live-sheet audit (gsheets MCP) of the two representative real shows:

- **East Coast** (`1N1PKmhcvLAn5UwHLn4Rplm1yeVeYMvwfL3eOzB4McnY`, v1/v2 family): the only dims-only header is `MABEL 1\nAPPROXIMATELY 60' x 45'` — a **GS** room, already handled. Its breakouts (`MABEL 1\nDAY 1 & 2`, `LAUDERDALE 1, 2, 3\nDAY 1 & 2`) carry DAY-ranges, handled by the v1 loop.
- **RPAS** (`1vyZMRTqeFAJgocbSJM2_HDDMsUUJFBiLKk6WKq-dUYo`, v4 template; VB01–VB10/DRILL are copies): breakouts carry explicit `BREAKOUT N\nSTATE A\n38' x 29'…` labels, handled by the v4 path.

**No live show currently carries a dims-only breakout header without a label/DAY/GS anchor.** So this is a *forward-looking* capability (the shape is a plausible near-neighbor of shapes that already occur), not a fix for a broken real input. Its regression coverage is therefore a **new synthetic fixture**, and the *existing* corpus must remain **byte-identical** (the new pass fires on zero committed fixtures — §5).

---

## 2. Scope

**In scope:** admit a **breakout** room whose header is a dims-only (or `&#10;`-multiline) venue cell sitting immediately above a `BO` field block, using the same guards as the shipped GS anchor, gated so it can never (a) fabricate an asset row into a room, (b) double-emit a room already produced by another pass, or (c) steal fields from an adjacent DAY-range/BREAKOUT room.

**Out of scope (unchanged from PR #332 §2 descope):**
- A dims-only header with **no** field block of any kind beneath it (a bare `NAME\n<dims>` cell) stays unparsed — indistinguishable from an asset without an anchor.
- Any dims-token-based admit that does not require the `BO` field-block anchor.
- Rehearsal / `WorkPhase` / `StageRestriction` type changes.
- Any new §12.4 code, UI surface, DB column, or advisory-lock surface.

---

## 3. Design

### 3.1 New function `findBoBlockVenueHeaders(markdown, model): { header: string; headerLine: number; admit: boolean }[]`

Mirror of `findGsBlockVenueHeader` (rooms.ts:806-844) with three differences: (a) it anchors on `BO` field rows, not `GS`; (b) it returns **all** matches, because BO blocks repeat within a sheet (GS is one-per-sheet); (c) it records **every** resolved header row it finds — even one that fails the admit gates — with an `admit` flag, because a rejected header (e.g. a `label|value` asset) still **delimits** the preceding block and must be a terminator (§3.2 step 2, R2 HIGH2).

For **each** row matching `^\|\s*BO\s+(?:Setup|Set Time|Show Time|Strike Time)\b` (case-insensitive) — call its line index `firstBoRow`:

1. **Walk UP** from `firstBoRow - 1`:
   - skip blank lines;
   - if a line does **not** start with `|` → **no header for this anchor** (the block is already blank/non-table-delimited, which `extractBoBlock` handles at rooms.ts:1182) — produce **no** record and stop the walk;
   - skip separator rows (`^\|\s*:?-+:?\s*\|`);
   - **skip rows that are themselves `BO`-field rows** (`^\|\s*BO\s+`) — CRITICAL (R3): a block has multiple anchors (`BO Setup`, `BO Set Time`, …), and the anchor at `BO Set Time` would otherwise resolve `BO Setup` as its "header", record that BO row `admit=false`, and (via `extraTerm`, §3.2) truncate the block's OWN extraction, dropping the room. A `BO`-field row is never a header — walk past it. (The GS anchor sidesteps this by finding only the *first* GS row in the whole markdown, rooms.ts:808-815; the plural BO version must skip intermediate BO rows explicitly.)
   - take the first remaining row (line index `j`) as the resolved header row; split its cells → `c0` (cleaned), `c1` (cleaned), `rawCell` (col-0 raw, keeps `&#10;`). This row is ALWAYS recorded (below); the gates only set `admit`. Because every anchor in one block skips the intervening `BO` rows and resolves to the **same** `j`, the block's anchors collapse to a single record via the `headerLine` dedup — and no `BO`-field row is ever recorded (so none pollutes `extraTerm`).
2. Compute `admit` = **all** of:
   - **Block-header shape** (rooms.ts:824-826): `c0.length > 0` **and** (`c1 === ""` **or** `c1 === c0`). A `| label | value |` pair (`c1 !== "" && c1 !== c0`, e.g. `| PROJECTION SCREEN | 5' x 9' |`) → `admit = false`.
   - **Banner / ownership exclusion (SUBSTRING, stricter than the GS anchor):** the flattened cell (`&#10;`→space) does **not** match `\b(?:BREAKOUT|LUNCH ROOM|LUNCH|ADDITIONAL ROOM|ADDITIONAL|GENERAL SESSION|DETAILS|DOCUMENTS|DATES|CREW|DRESS|TRANSPORTATION|HOTEL|VENUE|AGENDA|CONTACTS)\b` (case-insensitive). Deliberately diverges from the GS anchor's `^`-anchored `c0` test (rooms.ts:828-834): real BO headers carry a **show prefix** — `RPAS BREAKOUT 2&#10;LASALLE B&#10;30' x 25'…` (`fixtures/shows/raw/2025-03-dci-rpas-central.md:152`, `:207`) — so `^BREAKOUT` would miss them and fabricate two phantom rooms on the frozen corpus. Substring-matching `BREAKOUT`/`LUNCH`/`ADDITIONAL`/`GENERAL SESSION` hands every label-bearing room back to its owning pass. **Fail-closed**: over-excluding a would-be novel room is a no-op, never a fabrication.
   - **Evidence** (rooms.ts:840): the raw cell contains `&#10;` **or** a dims token `\d+\s*'\s*x` (a trimmed-empty label above a BO block is not a room header).
   - **Not a DAY-range** (BO-specific): `headerDayMarker(rawCell)` is **false** (the exported helper, rooms.ts:140). A DAY-range header is owned by the v1 group loop (rooms.ts:1094); admitting it here would double-emit.
3. Record `{ header: rawCell, headerLine: j, admit }`.

**Dedup by `headerLine`** — two anchor rows (`BO Setup` + `BO Set Time`) under one header must yield **one** record. When two anchors resolve to the same `j`, keep a single record (its `admit` is deterministic — same header → same gates).

### 3.2 Integration into `parseBoRooms` (rooms.ts:1011)

Add a **fifth pass**, positioned **after** the v1 DAY-range group loop (rooms.ts:1094-1117), so every earlier BO pass has claimed its names first:

1. **Dedup against a LOCAL emitted-name set — do NOT touch `seen`.** The new pass must skip a name already emitted by an earlier BO pass (a novel dims-only `SALON A\n60' x 45'` must not double-emit if `SALON A` already exists). It builds `const emitted = new Set(rooms.map(r => (r.name ?? "").toUpperCase()))` from `parseBoRooms`'s own `rooms` array **at the top of the new pass** (BREAKOUT + LUNCH + DAY-range names). It must **NOT** add to `seen`: `seen` is read by the DAY-range group loop's skip at rooms.ts:1097, and `model.groups` is keyed by `roomGroupKey` (base name + day-range, rooms.ts:278) while the skip keys on `displayName.toUpperCase()` (rooms.ts:1095) — so `SALON\nDAY 1` and `SALON\nDAY 2` share displayName `SALON`; a `seen.add("SALON")` after the first group would make the second group `continue`, deleting a committed distinct-day room (R2 HIGH1; contract at `roomHeaderModel.test.ts:59-63`). The GS room is **not** in `rooms` here (it is pushed by `collectV2V1Rooms` at rooms.ts:477, *before* `parseBoRooms` runs), so `emitted` correctly excludes GS — GS overlap flows through the reconciliation (§3.3), not a skip.
2. **Resolve all headers first, then extract with EVERY resolved header line as a terminator.** Compute `const boVenue = findBoBlockVenueHeaders(markdown, model)` and `const extraTerm = new Set(boVenue.map(h => h.headerLine))` — this includes headers with `admit === false` (the rejected `label|value` asset header at the top of the *next* block). Because a dims-only header is **never** in `model.roomHeaderLines` (it lacks a DAY marker, so `computeRoomHeaderModel` never adds it, rooms.ts:271-279), and `NEXT_ROOM_HEADER_RE` (rooms.ts:1186) matches only keyword headers, `extractBoBlock` would otherwise **run past** an adjacent block (admitted *or* rejected) with no blank separator and let `applyBoFields` overwrite fields (R2 HIGH2: `SALON ABCD` block followed with no blank by `PROJECTION SCREEN | 5'x9'` + `BO Setup | B` → `SALON ABCD.setup === "B"`). Add an optional `extraTerminators: ReadonlySet<number> = EMPTY_SET` parameter to `extractBoBlock` (rooms.ts:1177); its loop also breaks when `k > 0 && extraTerminators.has(startLine + k)`. **Existing call sites pass nothing (inert)** — only the new pass passes `extraTerm`, so no existing extraction boundary changes and the corpus stays byte-identical.
3. For each `{ header, headerLine, admit }` in `boVenue` **where `admit === true`**:
   - `split = splitRoomHeader(header, "breakout")`; `name = split.name`; `headerKey = name.toUpperCase()`.
   - if `!name` or `emitted.has(headerKey)` → skip.
   - build `buildEmptyRoom("breakout", name)`; set `dimensions`/`floor` from `split`; `applyBoFields(room, extractBoBlock(model.lines, headerLine, model, extraTerm))` — extraction starts at the header line, exactly as the DAY-range loop does at rooms.ts:1106.
   - `if (!roomHasContent(room)) continue;` (a header whose BO block is all-empty is not a room — mirrors rooms.ts:1054).
   - `emitted.add(headerKey); rooms.push(room);` (so two admitted novel headers with the same name collapse to one).

### 3.3 GS overlap is handled by the existing reconciliation — no GS threading

A dims-only BO header that happens to share the GS room's name (`MABEL 1`) is **not** a bug to guard in `parseBoRooms`. `parseGsRoom` (rooms.ts:846) and `parseBoRooms` (rooms.ts:478) both feed `collectV2V1Rooms` → `mergeRooms` (rooms.ts:456) → the same-name GS/breakout reconciliation at **rooms.ts:408-438** (which already keeps east-coast's `MABEL 1` as BOTH a GS room and a distinct DAY-range breakout, or absorbs a lossless-subset breakout into the GS room). Threading the GS name into `parseBoRooms`'s `seen` would **break** this: the DAY-range group loop reads `seen` at rooms.ts:1097, so seeding `MABEL 1` there would make it **skip the real `MABEL 1` DAY breakout**, deleting a committed room and violating the corpus invariant. So the new pass does **not** receive or seed the GS name; GS/breakout same-name overlap flows through the existing reconciliation exactly as it does today.

---

## 4. Guard conditions (every input branch)

| Input to `findBoBlockVenueHeaders` / new pass | Result |
| --- | --- |
| No `BO Setup/Set Time/Show Time/Strike Time` row anywhere | `[]` — new pass is a no-op (covers v4-only and GS-only sheets) |
| Header row is a `label \| value` pair (`c1 !== "" && c1 !== c0`), e.g. an asset `\| PROJECTION SCREEN \| 5' x 9' \|` **directly above** a `\| BO Setup \| … \|` block | abandoned at shape gate (§3.1 step 2) — **asset never fabricated** even when a BO block sits right beneath it (the load-bearing §4.1(a) case) |
| Header is a section banner (`DETAILS`, `HOTEL`, …) **or** carries an ownership label anywhere (`BREAKOUT`, `RPAS BREAKOUT 2`, `LUNCH ROOM`, `ADDITIONAL ROOM`, `GENERAL SESSION`) | abandoned at substring banner/ownership gate (§3.1 step 3) — handed back to the owning pass; **fail-closed** |
| Header has neither `&#10;` nor a dims token (trimmed-empty label above a BO block) | abandoned at evidence gate → falls back to no room |
| Header carries a `DAY N` range (`SALON A\nDAY 1 & 2`) | abandoned at DAY gate — owned by the v1 group loop (no double-emit) |
| Header name already emitted by the BREAKOUT / LUNCH / DAY-range pass (present in `parseBoRooms`'s local `rooms`) | skipped via the local `emitted` set (§3.2 step 1) — no double-emit |
| Header name equals the **GS** room's name | NOT skipped here (GS isn't in `parseBoRooms`'s `rooms`); the same-name GS/breakout pair flows to the existing reconciliation at rooms.ts:408-438 (absorb-if-lossless-subset, else keep both) — §3.3 |
| A **rejected** header (asset / banner / DAY) sits directly above the *next* BO block | recorded with `admit=false` → still a terminator so it delimits the prior block (no field theft), but emits no room |
| Header valid but its BO block is all-empty (`!roomHasContent`) | skipped (no empty phantom) |
| Walk-up leaves the table (hits a non-`\|` line) before a header | abandoned (no cross-section reach) |
| Two `BO` anchor rows resolve to the same header line | admitted **once** (dedup by resolved header line) |
| `name` empty after `splitRoomHeader` (pure placeholder) | skipped |

## 4.1 Asset-fabrication safety argument (the load-bearing invariant)

An asset/gear row that a dims-blind gate would fabricate has one of two shapes, **both rejected without any dims-token reasoning**:
1. `| PROJECTION SCREEN | 5' x 9' |` — a `label \| value` pair → fails the block-header **shape** gate (`c1 !== "" && c1 !== c0`).
2. A gear-grid row on the PULL SHEET / GEAR tab (`lib/parser/blocks/gear.ts`) — never has a `BO Setup…` labeled field block beneath it, so **no anchor row exists** to walk up from.

The admit decision is driven **entirely** by "is there a `BO` field block, and is the row directly above it a bannerless single/duplicated multiline cell" — the dims token is only *evidence that the cell is a header vs a trimmed label*, never the *admit trigger*. This is why the guard set that ships safely for GS (rooms.ts:806-844, live since PR #332) transfers to BO without reopening the fabrication class.

---

## 5. Corpus no-op invariant

The byte-frozen baseline `tests/parser/blocks/__baselines__/origin-main-rooms.json` (deep-equal at `roomHeaderModel.test.ts:194-203`, both renderer families) **MUST stay identical**. The proof is a **mechanical emulation of the revised §3.1 gate over every `fixtures/shows/**` file** (not a hand-argued grep — the round-1 corpus claim was wrong precisely because it wasn't re-derived): the emulation admits **zero** headers across the entire committed corpus. The header directly above each committed BO block is always one of:

- a `DAY N` range header → DAY gate abandons (east-coast `MABEL 1\nDAY 1 & 2`, etc.);
- an ownership-labelled header, incl. the show-prefixed `RPAS BREAKOUT 1/2\nLASALLE A/B\n30' x 25'…` (`dci-rpas-central.md:152,207`) → substring banner/ownership gate abandons;
- (the one dims-only bannerless venue cell in the corpus — `exporter-xlsx/east-coast.md:67` `MABEL 1\nAPPROXIMATELY 60' x 45'` — sits above a **`GS`** block, so `findBoBlockVenueHeaders` never reaches it).

Test 3 (§7) runs this exact emulation as a CI assertion — `findBoBlockVenueHeaders(md, model).filter(h => h.admit).length === 0` for every fixture (NOT total `.length`: the function records rejected headers too — every real block header on the corpus is a resolved-but-rejected record, so only the **admitted** count is zero). The frozen baseline `toEqual` (existing) and the zero-admit assertion (new) both fail loud on any regression.

**Discovered latent gap (out of scope, → BACKLOG):** the `RPAS BREAKOUT 1/2\nLASALLE A/B` breakout rooms in `dci-rpas-central.md` are **currently unparsed** — `boBlockRe` (rooms.ts:1020) is `^\|\s*BREAKOUT`-anchored (case-sensitive) and does not own the `<show-prefix> BREAKOUT N` shape, and no other pass claims it. This PR must NOT start parsing them (that would change the frozen baseline); it only ensures the new pass does not fabricate them differently. A new backlog item `BL-ROOM-SHOW-PREFIXED-BREAKOUT-HEADER` captures the real fix.

---

## 6. New synthetic fixture

`fixtures/shows/synthetic/2026-07-bo-venue-header.md` (new `synthetic/` family; committed with a header comment stating it is a hand-authored capability fixture, not a Drive render). It contains, on one INFO-style sheet:

1. A dims-only breakout `SALON ABCD&#10;60' x 45'` (col-duplicated header cell) directly above a `BO Setup`/`BO Set Time`/`BO Audio`/`BO Video` block → **must parse** as breakout "SALON ABCD", dims `60' x 45'`, with the block's fields.
2. A dims-bearing **asset** `| PROJECTION SCREEN | 5' x 9' |` (a `label|value` pair) sitting **directly above** a `| BO Setup | … |` block → **must NOT** become a room (the load-bearing §4.1(a) case: the BO anchor exists but the shape gate rejects the `label|value` row).
3. A dims-bearing **asset** row `| 4' X 8' RISER | <value> |` (`label|value`) elsewhere with no BO block → **must NOT** become a room (the no-anchor case).
4. A real DAY-range breakout `GRAND HALL&#10;DAY 1 & 2` + BO block on the same sheet → parses via the existing v1 loop, and the new pass does **not** double-emit it.
5. A second dims-only breakout `MERIDIAN&#10;40' x 30'` + BO block placed **immediately** below case 1's block with **no** blank separator → both `SALON ABCD` and `MERIDIAN` parse with their **own** fields (proves the `extraTerminators` fix, §3.2 step 2; without it SALON ABCD would steal MERIDIAN's fields).

Fixture-dimension-derived assertions (per anti-tautology rule): expected dims/name are read from the fixture header cells, not hardcoded literals divorced from the input.

---

## 7. Tests (TDD)

All under `tests/parser/`. Each states the concrete failure mode it catches.

1. **`findBoBlockVenueHeaders` unit** — synthetic markdown: returns the `SALON ABCD` header for the BO-anchored dims-only cell; `[]` for a `label|value` asset pair **directly above a BO block**; `[]` for a `RPAS BREAKOUT 2\nLASALLE B\n30' x 25'` ownership header (substring gate); `[]` for a DAY-range header; a **single** result when two BO field rows (`BO Setup` + `BO Set Time`) share one header (dedup by resolved header line). *Catches: asset fabrication, show-prefixed-BREAKOUT double-emit, DAY double-emit, N-fold header duplication.*
2. **End-to-end parse of the synthetic fixture** — `parseSheet(fixture).rooms`: exactly one `SALON ABCD` breakout (dims `60' x 45'`, right fields) **and** one `MERIDIAN` breakout with its **own** fields (no field theft); no `PROJECTION SCREEN`/`RISER` room; the `GRAND HALL` DAY breakout present exactly once. *Catches: the whole admit path + adjacent-header termination + no-double-emit + asset exclusion, end to end.*
3. **Corpus no-op** — the existing `roomHeaderModel.test.ts` baseline `toEqual` stays green; PLUS a new test iterating every `fixtures/shows/**` file asserting `findBoBlockVenueHeaders(md, model).filter(h => h.admit).length === 0` (admitted count, per §5). *Catches: any silent regression that admits a new room on the frozen corpus.*
4. **Asset-mutation micro-test (complements the concurrent `feat/mutation-harness`)** — take fixture case 2 (asset directly above a BO block) and programmatically inject a blank row / shift a column around the `label|value` pair; assert it still produces no room. Scoped to this path; no dependency on the mutation-harness worktree landing. *Catches: shape-gate brittleness under row/column perturbation.*
5. **GS/BO same-name reconciliation** — a synthetic sheet with a GS room `SALON ABCD` (via a `GS Setup…` block under a `GENERAL SESSION` label or GS venue header) AND a dims-only `SALON ABCD\n60' x 45'` above a separate `BO` block: assert the output matches the **existing** rooms.ts:408-438 reconciliation (lossless-subset breakout absorbed into the GS room; otherwise both kept) — NOT a deleted breakout. *Catches: a regression if someone re-introduces GS-name `seen`-seeding (the CRITICAL that §3.3 forbids).*

---

## 8. Tier × domain matrix

Parser-only; no DB/RPC/UI/lock layers touched. Matrix is **N/A** — no table DDL, inline CHECK, RPC read/write, propagation trigger, cleanup function, frontend form, or audit page is affected. The only files changed: `lib/parser/blocks/rooms.ts`, new `fixtures/shows/synthetic/2026-07-bo-venue-header.md`, and test files under `tests/parser/`.

## 8.1 Flag lifecycle

No boolean config field or toggle introduced. **N/A.**

## 8.2 Meta-test inventory

- **Extends:** the room corpus-no-op baseline (`roomHeaderModel.test.ts` + `__baselines__/origin-main-rooms.json`) with a new "`findBoBlockVenueHeaders(md, model).filter(h => h.admit).length === 0` on every fixture" structural assertion (test 3).
- **Creates:** none (no new registry — no §12.4 code, no Supabase boundary, no advisory lock, no admin-alert catalog row).
- **Advisory-lock topology:** N/A — no `pg_advisory*` surface touched.

---

## 9. Numeric sweep

- The corpus-no-op claim uses **no fixture count literal** (round-1 "12" and R2 "7" were both wrong header-count derivations). §5 is stated as "every fixture" + a mechanical emulation over all `fixtures/shows/**` (independently reproduced by the R2 reviewer = 0 admits across 25 files), so no count can drift.
- `5` tests (§7). `5` synthetic-fixture cases (§6). Guard table (§4) enumerates every abandon branch.
- No magic numbers enter `rooms.ts`; regexes reuse the shipped GS-anchor patterns except: the `BO`-prefix anchor, the **substring** banner/ownership exclusion (§3.1 step 3), the DAY-range exclusion (`headerDayMarker`, rooms.ts:140), and the new `extraTerminators` param on `extractBoBlock`.

## 10. Disagreement-loop preempts (for the adversarial reviewer)

- **This is NOT a dims-blind gate.** The admit trigger is the `BO` field-block anchor + block-header shape, identical to the shipped, safe GS anchor (rooms.ts:806-844). The dims token is header-vs-label *evidence*, never the trigger. Do not relitigate as "reopens the PR #332 asset-fabrication class" — §4.1 is the structural argument; the guard set is copied from live code.
- **Synthetic fixture is intentional**, not a corpus-fidelity violation. No live show carries this shape yet (§1.2, verified via gsheets MCP on East Coast + RPAS); the fixture is a hand-authored capability anchor, clearly labeled, and the *existing* corpus stays byte-identical (§5, mechanically emulated → zero admits).
- **Substring banner/ownership gate is deliberate & fail-closed** (§3.1 step 3), diverging from the GS anchor's `^`-anchored test, specifically to catch show-prefixed `RPAS BREAKOUT N` headers. Over-exclusion is a no-op, never a fabrication. Do not relitigate as "inconsistent with `findGsBlockVenueHeader`."
- **No GS-name threading** (§3.3). GS/breakout same-name overlap is owned by the existing reconciliation (rooms.ts:408-438); seeding the GS name into `seen` would delete the real `MABEL 1` breakout (R1 CRITICAL). Do not re-propose it.
- **The new pass dedups against a LOCAL `emitted` name-set, not `seen`** (§3.2 step 1). Adding to `seen` in the DAY-range group loop would collapse distinct-day groups (`SALON\nDAY 1`/`SALON\nDAY 2` share displayName `SALON`), deleting a committed room (R2 HIGH1). The `emitted` set is derived from `parseBoRooms`'s own `rooms` array and never touches `seen`.
- **`extractBoBlock` gets an `extraTerminators` param carrying EVERY resolved BO header line — admitted *and* rejected** (§3.2 step 2), so a rejected asset header between two novel blocks still terminates the prior block (R2 HIGH2 field theft). Existing call sites pass nothing (inert); only the new pass passes it, so no corpus extraction boundary moves.
- **`extractBoBlock` tolerates a non-terminator start line.** The dims-only header is never admitted into `roomHeaderLines`, but `extractBoBlock` (rooms.ts:1180-1189) exempts `k === 0` from the terminator check and stops at the *next* terminator/blank — so extracting from the header line captures exactly its `BO` field block. `applyBoFields`'s `plainFieldRe` (rooms.ts:1205) cannot misfire on the header cell (its col0 is the venue name, not a field label).
- **No new §12.4 code by design** — this pass emits a *room*, not a *signal*. An unparseable dims-only header (no BO block) is not a new silent-drop: origin/main never parsed it either, and §2 keeps it explicitly out of scope. No `UNKNOWN_*` code is warranted.
