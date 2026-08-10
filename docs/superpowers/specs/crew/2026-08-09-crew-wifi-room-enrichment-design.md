# Crew-page Wi-Fi split + room-within-venue surfacing — design

**Date:** 2026-08-09 · **Ledger:** `BL-CREW-FIELD-ENRICHMENT` + `BL-FLIGHT-LEG-ORIENTATION` (bundled arc) · **Branch:** `feat/crew-field-enrichment`

## §0 Summary

Two display-time enrichments to the crew page, plus two ledger graduations the corpus probe forced:

1. **Wi-Fi SSID/password structured split** — a display-time parser (`lib/crew/wifiDisplay.ts`, mirroring the shipped `lib/crew/flightDisplay.ts` precedent) over the raw `event_details.internet` string; `VenueSection` renders labeled rows when the parse succeeds and today's raw row when it does not. No parser/schema/projection change.
2. **Room-within-venue surfacing** — the room name is ALREADY parsed (`rooms[].name`, `splitRoomHeader` at `lib/parser/blocks/rooms.ts`, general-session prefix stripped); the enrichment is one Venue fact row surfacing the general-session room's name. No new capture.
3. **`BL-FLIGHT-LEG-ORIENTATION` graduates as OBSOLETE** — its premise (unlabeled raw `" | "` legs) and its promotion prerequisite (a structured flight shape) are BOTH already satisfied: the structured flight card shipped (`lib/crew/flightDisplay.ts` — `FlightSegment` with date/flightNo/airline/origin/dest/depTime/arrTime/conf; `components/crew/sections/TravelSection.tsx` "Your flight" card), superseding PR #46's raw split per the PR-38-217 bug audit (`docs/audits/pr-38-217-bug-audit-2026-07-02.md`, the "fully superseded on main by the structured flight card" line). The live successor concern is already filed separately (`DEFERRED.md` `TRAVEL-FLIGHT-SUPPRESSED-LEGIBILITY-1`).
4. **`BL-CREW-FIELD-ENRICHMENT` graduates on this arc's merge** — its flight bullet shipped earlier (the entry's "not in the `ShowForViewer` projection and renders no UI" claim is stale: `viewerFlightInfo` is projected via an own-row read and renders in `TravelSection`, pinned by `tests/data/getShowForViewerFlight.test.ts`); its Wi-Fi and room bullets ship here.

## §1 Resolved scope — do not relitigate

1. **Display-time structuring, not parser capture.** The split lives in `lib/crew/` and runs at render, exactly like `flightDisplay.ts` (the ratified flight precedent). `event_details.internet` stays a raw passthrough key (`lib/parser/aliases.ts` `"event.internet"`); no migration, no projection change, no parser edit.
2. **Accept-set, not denylist (label vocabulary).** The splitter accepts EXACTLY the observed label vocabulary from the full-corpus probe (§4, BOTH fixture families + live sheets): network labels `SSID` / `Network`; password labels `Code` / `PW` / `Passcode` / `Password`; separators colon and dash (the RIA value uses the dash form). All word-boundary-anchored, case-insensitive, line-oriented. Everything outside the accept-set renders as today's raw string — rejected-by-default, surfaced unchanged. (Spec R1 F1 forced the vocabulary widening WITH probes: the initial draft's four-label set turned the observed Consultants value into a corrupted SSID capture — `Institutional Investor Passcode: Investor2025` as the network name — because the lookahead did not know `Passcode`. Every label and separator in the set now has a corpus instance; further widening still requires a probe.)
3. **Fail-soft is the contract.** An unsplittable value renders the existing raw "Crew Wi-Fi" row byte-identically. Show-level accounting (spec R2 F1 + R3 F1 — the 10 fixture SHOWS have raw + exporter MIRRORS whose values differ; the canonical per-show value is the richer mirror): 4 of 10 fixture shows split (Fixed Income, FinTech, Consultants, RIA), 4 are prose-only (East Coast, RPAS, Waldorf, and Redefining FI whose exporter mirror carries `Wifi for Polling from Encore`), 2 are empty; 2 of 4 live sheets split. Mirror divergence (a raw mirror empty while the exporter mirror carries a value) is a fixture-family artifact, recorded, not a product state.
4. **Room surfacing reads `rooms[].name` only.** No new parser field, no `event.*` key (the probe confirmed EVENT DETAILS never carries the room; it is line 2 of the ROOMS header, already captured). Multi-room shows surface the GENERAL SESSION room in Venue; breakout names already render in their own room-scoped tiles.
5. **Both graduations land in this arc's PR** (markers off in the archiving commits per invariant 12; archives reject in-flight entries).
6. **UI gate:** `VenueSection` is a crew UI surface — impeccable dual-gate applies (invariant 8), Opus implements.

## §2 Current state (live-code citations + probe, verified 2026-08-09)

- Render site: `components/crew/sections/VenueSection.tsx` — `rawInternet = data.show.event_details["internet"]`, `shouldHideGenericOptional` gate, `factRows.push({ k: "Crew Wi-Fi", v: internet, icon: <WifiIcon /> })`.
- Rooms projection: `ShowForViewer.rooms: ProjectedRoomRow[]` (`lib/crew/resolveKeyTimes.ts`: `ProjectedRoomRow = RoomRow & { id: string }`); `RoomRow.kind ∈ { "gs", "breakout", "additional" }` with `ROOM_KIND_RANK` ordering and `compareRooms`; `RoomRow.name` is the header line-2 name with the section prefix stripped by `splitRoomHeader` (`lib/parser/blocks/rooms.ts`).
- Flight state (graduation evidence): `lib/data/getShowForViewer.ts` `viewerFlightInfo` (own-row read, `.eq("id", viewer.crewMemberId).eq("show_id", showId)`); `components/crew/sections/TravelSection.tsx` "Your flight" `SectionCard` (`data-testid` `travel-flight`); `lib/crew/flightDisplay.ts` `parseFlightItinerary`/`sortSegmentsByDate`/`pickUpcomingIndex`; TRAVEL-tab parser `lib/parser/blocks/travelFlights.ts` (`normalizeTravelCell`) — i.e. `DEF-FLIGHT-1`'s structured shape landed.
- Ledger entries: `BL-CREW-FIELD-ENRICHMENT` (BACKLOG.md, stale flight bullet), `BL-FLIGHT-LEG-ORIENTATION` (BACKLOG.md, obsolete premise), both currently carrying this branch's invariant-12 markers.

## §3 Design

### 3.1 `lib/crew/wifiDisplay.ts`

```ts
export type WifiInfo = { ssid: string; password: string | null; notes: string | null };
export function parseWifiValue(raw: string): WifiInfo | null;
```

Line-oriented over the RAW cell (live cells are multi-line — `\n\n` after prose, `\n` between label pairs; the flattened fixture shape "label pairs separated by spaces" must ALSO parse, since both occur in the corpus):

- Label set: `NET = SSID|Network`, `PWD = Code|PW|Passcode|Password`, `SEP = \s*[:\-]\s*`. Tokenize into lines; within each line, match `\b(NET)SEP(\S[^\n]*?)\s*(?=\b(?:NET|PWD)SEP|$)` and `\b(PWD)SEP(\S[^\n]*?)\s*(?=\b(?:NET|PWD)SEP|$)` (case-insensitive; NET/PWD expand to their alternations) — the lookahead lets pairs share one flattened line AND stops each value at the NEXT label regardless of which separator it uses (the Consultants corruption class, spec R1 F1).
- `ssid` = first network-label value; `password` = first password-label value (trailing punctuation preserved verbatim — `ORDTG. ` trims outer whitespace only, keeping the period: the probe shows the password may legitimately end in punctuation and guessing is worse than showing).
- `notes` = the remaining text (prose before/after the labeled pairs — e.g. `Hardline from Encore`), trimmed, `null` when empty. The prose is operationally load-bearing (hardline vs Wi-Fi for streaming) and is NEVER discarded (the probe's "lossy" R1 defect is the anti-goal).
- **All-or-nothing (added across three whole-diff review rounds; the code is canonical, this records it).** A PARTIALLY understood cell is more dangerous than an unrecognized one — it renders confident, wrong credentials — so the parse is rejected outright when: a captured value or a prose residue still contains an UNCONSUMED separator character (the grammar consumes every separator it resolves, so a leftover one belongs to a pair this splitter did not understand); an accepted label word appears with no separator after it (`SSID: Guest Password is secret`); a network or password label repeats (picking the first is a coin flip presented as fact); or a recognized label carries an empty value (dropping the bare label would lose text). Every rejection renders the raw cell, per §6.1.

  The leftover-separator test is DERIVED from the accept-set's own separator class, not from a list of unknown label spellings, and that is load-bearing rather than stylistic: three consecutive review rounds attacked the recognizer form of this check and each produced fresh escapes from whatever bound the previous round had introduced (`P:` below a length floor, `AuthenticationCode:` above a cap, `WiFi_Password:` outside a character class, `802.1X:` digit-initial, `Contraseña:` non-ASCII, and both one-sided dash forms). "Which unknown labels exist" ranges over an open set; "is any separator unconsumed" ranges over the two characters this spec defines. `tests/crew/wifiDisplay.test.ts` pins the derivation itself, so widening the separators cannot widen the grammar without widening the guard.

- Return `null` unless at least an `ssid` was matched — password-only matches ("Code: X" alone) return `null` (ambiguous without a network name; raw fallback renders).

### 3.2 VenueSection rendering

When `parseWifiValue(internet)` returns non-null: replace the single "Crew Wi-Fi" fact row with "Wi-Fi network" (ssid, WifiIcon) + "Wi-Fi password" (password, only when non-null) fact rows, and the `notes` as the value of a retained notes row (only when non-null). **Amendment 2026-08-10 (impeccable critique P1, gate-driven):** that notes row is labeled **"Internet notes"**, not "Crew Wi-Fi" as this section originally specified. Probe: of the five corpus values that produce notes, four describe a HARDLINE (`Hardline from Encore` ×2, `Encore to provide hardline for streaming` ×2; the fifth is `Wifi for Polling`), so a "Crew Wi-Fi" label contradicts its own value on the majority of real data and would tell a crew member the opposite of what the sheet says. The RAW-FALLBACK row keeps "Crew Wi-Fi" unchanged, because there the value is the whole internet cell rather than the residual prose. When null: today's raw row, byte-identical. All three rows pass through the `factRows` mechanism. **Declared shared-primitive change (spec R3 F2):** `FactRow` (`components/crew/primitives/FactRows.tsx`) gains an optional `testId?: string` rendered as `data-testid` on the row — the type today has only `k`/`v`/`sub`/`icon`, so the four row testids are unreachable without it. Additive and optional: every existing `FactRows` consumer is untouched; the change ships with a FactRows unit test.

Room row: `const gsRoom = rooms.filter(r => r.kind === "gs").sort(compareRooms)[0]` — when present and the name is REAL, `factRows.push({ k: "Room", v: gsRoom.name })` positioned before the connectivity rows. **REAL means not parser-synthesized (spec R1 F2):** the parser falls back to the literal `General Session` when a v1/metadata-trimmed sheet has no named room (`lib/parser/blocks/rooms.ts`, the "fall back to 'General Session' rather than mis-naming" branch), and five raw fixtures get exactly that synthesized name — rendering `Room: General Session` is noise, not information. Gate: skip when `name.trim()` is empty OR case-insensitively equals the synthesized fallback literal `General Session` OR the rooms fetch failed (`tileErrors["rooms"]` set — spec R2 F3: `readRooms` fail-softs to `[]` with `tileErrors.rooms`, so zero-rooms and infra-failure are indistinguishable from the array alone; on failure the row is SUPPRESSED rather than implying "no room", and the failure already surfaces where rooms render — the Schedule/Gear tiles' `SectionTileError domain="rooms"`). Guard conditions: zero rooms → no row; fetch failure → no row (error surfaced by the rooms-consuming tiles, not Venue); multiple gs rooms → first by `compareRooms`; synthesized/empty name → no row. Cap: single row; never a list (breakouts render in their own tiles).

### 3.3 Graduations

- `BL-FLIGHT-LEG-ORIENTATION` → `BACKLOG-archive.md` as OBSOLETE (premise and prerequisite both satisfied by the shipped structured card; §0.3 evidence), `BACKLOG_GRADUATED` row (provenance `feat/crew-field-enrichment`), marker off in the archiving commit.
- `BL-CREW-FIELD-ENRICHMENT` → archived as RESOLVED in the SAME PR's closing commits (flight bullet: shipped prior, evidence recorded; Wi-Fi + room bullets: this arc), `BACKLOG_GRADUATED` row, marker off in the archiving commit.

### 3.4 Dimensional Invariants

None introduced: fact rows are existing auto-height list items; no fixed-dimension parent gains flex/grid children. Declared per the self-review rule.

### 3.5 Transition Inventory

The Venue section is static per render (no client state); rows appear/disappear only across server renders. States: raw Wi-Fi row / split Wi-Fi rows / no Wi-Fi row; room row present/absent.

| Transition | Treatment |
| --- | --- |
| any state → any state (across server re-render) | instant — server-rendered fact list, no animation, no client state (matches every existing VenueSection row) |

No compound transitions: no client state exists in this section.

## §4 Corpus probe (full-corpus, run 2026-08-09 — fixtures + live sheets via gsheets MCP)

14 sources (10 fixtures, 4 live sheets). `event_details.internet` values:

| Class | Sources | Example |
| --- | --- | --- |
| Labeled pairs (SPLITS) | 4 fixture shows + 2 live (Fixed Income, FinTech, + exporter-family Consultants `Wifi for Polling Network: Institutional Investor Passcode: Investor2025` → ssid `Institutional Investor`, password `Investor2025`, notes `Wifi for Polling`; RIA `SSID - Hyatt_Meeting Password: PHC2025` → ssid `Hyatt_Meeting`, password `PHC2025`) | `Hardline from Encore\n\nSSID: Hyatt_Meeting\nCode: FITS2025` → ssid `Hyatt_Meeting`, password `FITS2025`, notes `Hardline from Encore` |
| Prose only (raw fallback) | East Coast (`The conference wifi has 20mb download speed.`), RPAS (`Wifi from Encore`), Waldorf (`Wifi`), Redefining FI (`Wifi for Polling from Encore`, exporter mirror) | renders raw, unchanged |
| Empty | 2 fixture shows | no row (existing gate) |

Calibration facts the design encodes: the corpus spans BOTH fixture families (`fixtures/shows/raw/` AND `fixtures/shows/exporter-xlsx/` — the two Drive renderer families; the initial probe read only `raw/` and missed the Consultants and RIA values, which spec R1 caught); live cells are MULTI-LINE while fixture markdown flattened them (both shapes parse); observed label vocabulary is `SSID`/`Network` + `Code`/`PW`/`Passcode`/`Password` with colon and dash separators, each with a corpus instance (colon AND dash — an earlier draft said colon-only here, spec R3 F3); no internet value contains `/` (the rejected R2 rule would have been calibrated on nothing and endangered by `GRAND BALLROOM A/B`-class strings elsewhere); unanchored `code|pw` substrings are dangerous (`dress code` exists as an event key) — hence word-boundary plus colon anchoring and line orientation.

Room-within-venue: identifiable in 4/4 live sheets; across the 10 fixture shows, 5 raw fixtures parse REAL GS names and 5 parse the synthesized `General Session` fallback, with exporter mirrors recovering real names for 3 of those 5 — at most 8/10 fixture shows identifiable (spec R2 F2 corrected an earlier 9/10 claim). ALWAYS ROOMS header line 2 (never EVENT DETAILS), already captured as `rooms[].name` (e.g. `GRAND BALLROOM A/B`, `SALON ABC`, `ADLER BALLROOM`, `MABEL 1`). The suppressed-synthesized cases (§3.2 gate) drive AC-4's no-row assertions.

## §5 Acceptance criteria

- **AC-1** `parseWifiValue` unit tests derived from the §4 corpus verbatim ACROSS BOTH FIXTURE FAMILIES: the live multi-line values, the flattened shapes, the Consultants value (ssid `Institutional Investor`, password `Investor2025`, notes `Wifi for Polling` — the R1 corruption case as a permanent regression pin), and the RIA dash-separator value all split exactly; all prose-only values return `null`; empty returns `null`; password-only returns `null`.
- **AC-2** Accept-set negatives: `Dress Code: formal` does not produce a password (line-orientation + the value being outside the internet cell is the real guard; the planted test feeds it AS the internet value and asserts... it matches `Code:` — see §6.2 — so the assertion is that ssid is required: `null` without a network label). `Backdrop / Scenic`-class strings return `null`.
- **AC-3** VenueSection: split values render network/password/notes rows (testids `venue-wifi-ssid`, `venue-wifi-password`, `venue-wifi-notes`); unsplittable values render the existing raw row BYTE-identically (snapshot equality against the pre-change render — the fail-soft regression pin); empty renders nothing.
- **AC-4** Room row: a REAL gs room name renders (`venue-room` testid); zero-rooms, empty-name, synthesized-name (`General Session` suppressed — driven by one of the five raw fixtures carrying it), rooms-fetch-failure (`tileErrors.rooms` set → row suppressed, no fake no-room state), and multi-gs (first by `compareRooms`) cases covered.
- **AC-5** Both graduations: entries archived (OBSOLETE / RESOLVED), `BACKLOG_GRADUATED` rows added, markers off in the archiving commits, graduation + in-progress meta-tests green.
- **AC-6** Impeccable dual-gate on the diff; `impeccable-gate:` closeout marker.
- **AC-7** Full suite + real CI green; whole-diff cross-model review APPROVE.

## §6 Documented limits

1. **Unobserved label spellings render raw.** `WPA:`, `Login:`, etc. remain outside the accept-set and fall to the raw fallback — surfaced verbatim, never silently wrong. (`Passcode`/`Password`/dash-separator joined the set in R1 with corpus probes.) Widening further is a one-line change gated on a future probe.
2. **A password-labeled value with no network label returns `null`** (raw fallback), even when a human could infer the network from prose. Deliberate: guessing pairs is the corruption class; raw is truthful.
3. **Trailing punctuation in passwords is preserved** (`ORDTG. `→`ORDTG.`). The probe cannot distinguish sentence-period from password-period; showing exactly what the sheet says is the conservative choice.
4. **On a rooms fetch failure the Venue room row is absent, identical to no-room.** Deliberate: Venue adds information only from healthy data; the failure is surfaced by the rooms-consuming tiles' existing `SectionTileError`, so the state is signaled, just not twice.
5. **A synthesized `General Session` name is suppressed, so v1 sheets show no room row.** Their sheets never named the room; showing the placeholder would be noise. If a real venue room is ever literally named "General Session", the raw fallback posture applies: the sheet can rename it, and the suppression is a one-line literal to revisit with a probe.
7. **On a SINGLE FLATTENED line, text following a value is absorbed into that value.** Prose is recovered as `notes` when it sits on its own line — before OR after the label lines, which is the shape every multi-line corpus value has — but on one flattened line there is no structural signal separating trailing prose from a multi-word value. Probed against the shipped module (diff review, post-merge segment F1):

   ```text
   "SSID: Guest Hardline from Encore"                  => ssid "Guest Hardline from Encore"
   "SSID: Guest Password: secret Hardline from Encore" => password "secret Hardline from Encore"
   "Hardline from Encore\nSSID: Guest\nPassword: secret" => notes "Hardline from Encore"  (correct)
   "SSID: Guest\nPassword: secret\nHardline from Encore" => notes "Hardline from Encore"  (correct)
   ```

   **Why this is documented rather than fixed.** The corpus contains `Network: Institutional Investor Passcode: Investor2025`, whose SSID is genuinely two words — structurally identical to "Guest Hardline". Any rule separating them is a word-count or position cap calibrated on NOTHING (no corpus value has trailing prose on a flattened line), and a recognizer bounded by a number is the shape this project's own writing-plans rule tells us the next reviewer will defeat. The consequence is bounded and weaker than the defects that were fixed: the text is still rendered in full and nothing vanishes — it is attributed to the wrong row. Tracked as `BL-WIFI-FLATTENED-TRAILING-PROSE`, whose promotion prerequisite is a corpus probe finding a real flattened value with trailing prose; that probe, not a guess, would supply the discriminator.

6. **The room row surfaces the general-session room only.** Breakout/additional rooms stay in their own tiles; a show whose crew works only breakouts sees no Venue room row (their room appears in room-scoped tiles). Accepted scope line.

## §7 Out of scope

- Parser/schema/projection changes; TRAVEL/flight surfaces (shipped; graduation only); `BL-CREW-SHEET-TEMPLATE-V2` (source standardization); any admin surface; caching.
