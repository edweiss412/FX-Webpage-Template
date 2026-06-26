# Plan — BL-HOTEL-VIEWER-NAME-MATCH

Spec: `docs/superpowers/specs/2026-06-26-hotel-viewer-name-match.md` (Codex-APPROVED). User-ratified: matcher = LENIENT (surname-only multi-token), slash-split INCLUDED, ship autonomously. UX-not-security per owner determination (`PRODUCT.md:69-73`, master spec `:7-10`).

## Meta-test inventory (mandatory declaration)
- **Creates:** a **structural static-analysis guard** (Task 2c, `tests/data/hotelVisibility.test.ts`) pinning that the `getShowForViewer` hotel filter routes through `hotelVisibleToViewer`/`namesRefer` and never reverts to a naive `.includes` substring predicate — mirrors the existing static-analysis tests at `tests/data/getShowForViewer.test.ts:165-177`.
- **Keeps green:** the `#4 PRIVACY` meta-test (`tests/parser/exporterFixtures.test.ts`) through the slash-split (Task 3 asserts it).
- **N/A:** No Supabase call-boundary meta-test row (no new `.from()`/`.rpc()` — pure in-memory filter over already-fetched `allHotels`). No advisory-lock surface (`pg_advisory*` not touched). No new RPC-gated table → no PostgREST DML lockdown. No UI → no impeccable dual-gate (invariant 8 N/A). No migration → no schema-manifest / validation-parity.

## Scope of files
- NEW `lib/data/nameMatch.ts` — `namesRefer` (+ exported `toks`/`tokCompat` if useful for tests).
- EDIT `lib/data/getShowForViewer.ts` — replace the `.includes` predicate (`:644-645`) with `res.names.some((n) => namesRefer(n, viewerName))`; extract a pure `hotelVisibleToViewer(res, viewerName)` (exported) for direct testing.
- EDIT `lib/parser/blocks/hotels.ts` — `parseGuestCell` (`:108`) pre-splits a slash-separated cell.
- NEW tests `tests/data/nameMatch.test.ts`, `tests/data/hotelVisibility.test.ts`; EXTEND `tests/parser/blocks/hotels.test.ts` (or `exporterFixtures.test.ts`) for the slash-split.
- DOCS: BACKLOG mark BL-HOTEL-VIEWER-NAME-MATCH done (close-out).

## Tasks (TDD per task: failing test → minimal impl → green → commit)

### Task 1 — `namesRefer` matcher
- **Test first** (`tests/data/nameMatch.test.ts`): the §1 oracle matrix as a data table (roster, guest, expected). Rows: every oracle pair (east-coast Doug Larson↔Doug, Carl Fenton↔Carl, Eric Weiss↔Eric W; ria Doug Larson↔Doug, Eric Weiss↔Eric; rpas Doug Larson↔Douglas Larson, John Carleo↔John Carleo, Eric Weiss↔Eric Weiss; consultants Alex Rodrigues↔Alexandre Rodrigues, John Clark↔John Clark; fixed-income DJ Johnson↔David Johnson, Jeffrey Justice↔Jeffrey Justice; fintech John Carleo, Eric Weiss). **Over-match exclusions** (false): Eric Carroll↮Eric Weiss, Eric Weiss↮Eric Carroll, Calvin Saller↮Carlos Pineda, John Carleo↮Carlos Pineda, Calvin Saller↮Carlos Pineda. **Nickname/accent:** Bill Werner↔William Werner, Bill Werner↔William Werner Jr, José Núñez (precomposed)↔Jose Nunez↔José Núñez (decomposed via `́` combining acute). **Edges:** ""↮anything, "   "↮anything, single-token both sides, hyphenated `Smith-Jones`↔`Smith`. **Symmetry**: assert `namesRefer(a,b)===namesRefer(b,a)` for every row. *Failure mode:* substring-only relapse (fails the broken-show rows), over-broad (fails distinct-surname exclusions), first-name-gate reintroduction (fails Bill↔William).
- **Impl:** `namesRefer` exactly per spec §3.1 (`toks` with NFD+strip-marks+suffix-strip; `tokCompat`; single-token → first/last; multi-token → surname-only). Pure, no deps.
- Commit `feat(crew-page): add namesRefer hotel-guest↔viewer matcher`.

### Task 2 — extract + wire the hotel visibility filter
- **Test first** (`tests/data/hotelVisibility.test.ts`):
  - (a) **explicit helper** — `hotelVisibleToViewer({names:["Carl"]}, "Carl Fenton") === true`; `hotelVisibleToViewer({names:["Eric Carroll"]}, "Eric Weiss") === false`.
  - (b) **fixture-derived** — for east-coast, ria, rpas, consultants, fixed-income: `parseSheet(readFileSync(exporter-xlsx/<slug>.md))`, then for each `crewMembers[].name` that `namesRefer`-matches some `hotelReservations[].names[]`, assert `hotelReservations.filter((r) => hotelVisibleToViewer(r, name))` includes that reservation — reading both names from the parse output, no hardcoded strings.
  - (c) **STRUCTURAL GUARD (catches "forgot to wire", Codex plan R1/R2)** — static-analysis on the `getShowForViewer.ts` SOURCE (mirroring `tests/data/getShowForViewer.test.ts:165-177`): assert `src.includes("hotelVisibleToViewer(")` AND `expect(src).not.toMatch(/res\.names\.some\([\s\S]{0,120}?\.includes\(/)`. The lazy `[\s\S]{0,120}?` **crosses the arrow-param `)`** (the R2 fix — the earlier `[^)]*` stopped at `(n) =>` and false-passed the real `res.names.some((n) => n.toLowerCase().includes(...))`), and the bound avoids matching unrelated `.includes` elsewhere. After the fix the hotel filter is `allHotels.filter((res) => hotelVisibleToViewer(...))` and `hotelVisibleToViewer` calls `namesRefer` (no `.includes`), so the guard passes; before the fix it fails. *Failure mode:* helper correct + tested but the live predicate (`:644-645`) never swapped.
  - (d) **Seeded `getShowForViewer` regression (truest proof, Codex plan R2)** — extend the live-DB `tests/data/getShowForViewer.test.ts`: seed a show + a crew member `Carl Fenton` + a `hotel_reservations` row `names:["Carl"]`; call `getShowForViewer(showId, {kind:"crew", crewMemberId})`; assert the result's `hotelReservations` includes that row (and a second crew `Eric Weiss` does NOT see a `names:["Eric Carroll"]` row). Drives the REAL production path end-to-end. (If the existing harness cannot seed `hotel_reservations` cheaply, fall back to (c) as the binding guard and record the limitation — but attempt (d) first; the harness already seeds `crew_members`.)
- **Impl:** export `hotelVisibleToViewer(res: HotelReservationRow, viewerName: string): boolean` from `getShowForViewer.ts`, `= res.names.some((n) => namesRefer(n, viewerName))`; replace the inline `.includes` predicate at `:644-645` with `allHotels.filter((res) => hotelVisibleToViewer(res, viewerName as string))`. The `isAdmin || viewerName===null → allHotels` branch is unchanged.
- Commit `fix(crew-page): match hotel reservations to viewer by name, not substring`.

### Task 3 — `parseGuestCell` slash-split
- **Test first** (extend `tests/parser/blocks/hotels.test.ts`): fixed-income's structured "Names on Reservation" cell `David Johnson / Jeffrey Justice` parses to `names` containing both `"David Johnson"` and `"Jeffrey Justice"` (two entries); no conf# leak (assert neither contains a digit run). Synthetic: `"A - #111 / B - #222"` → `["A","B"]`, confs stripped. Re-assert `#4 PRIVACY` (`exporterFixtures.test.ts`) stays green. *Failure mode:* the slash-merge regressing, or a conf# surviving a split segment.
- **Impl:** in `parseGuestCell` (`hotels.ts:108`), split the cleaned `flat` on `\s*/\s*` into segments and run the existing per-segment name/conf extraction, merging results. Keep all current behavior (`&#10;`/space delimiting, dash/# conf strip, accents) per-segment.
- Commit `fix(parser): split slash-separated guests in parseGuestCell`.

### Task 4 — close-out
- Mark BL-HOTEL-VIEWER-NAME-MATCH ✅ done in `docs/superpowers/plans/BACKLOG.md` (cite the matcher + slash-split + the UX-not-security ratification). Commit `docs(plan): mark BL-HOTEL-VIEWER-NAME-MATCH done`.

## Anti-tautology / test rules
- Matcher expectations come from the §1 oracle data table (cited provenance); the fixture-derived integration test reads names from `parseSheet`, never hardcodes them.
- Every test states its concrete failure mode (above). No test merely asserts "function is called."
- Derive, don't hardcode: the integration test re-parses the live fixtures so a fixture edit fails CI rather than staling.

## Adversarial review (cross-model)
After plan self-review → Codex `adversarial-review` to APPROVE (no round budget). Then Stage 3.
