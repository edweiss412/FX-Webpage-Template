# Per-crew flight info — crew Travel section enrichment (design / spec)

**Date:** 2026-06-19 · **Branch:** `feat/crew-flight-info` (off merged `main` `dfcdd33e`) · **Owner-review:** WAIVED (Codex adversarial review is the gate).

## Goal

Surface each crew member's own flight info — already parsed into `crew_members.flight_info` but **never projected** — as a conditional card in the crew **Travel** section. A viewer who has flight info on file sees it; everyone else sees the Travel section exactly as today.

## Scope (deliberately narrow)

**Projection + UI only.** NO parser change, NO migration, NO sync change.

- `flight_info` is **already parsed AND populated for real shows** — VERIFIED against the live sheets + the committed fixtures (2026-06-19 gsheets audit). The **TECH-block path** (`lib/parser/blocks/crew.ts` `parseTechBlock`, the `| TECH | PHONE | ARRIVAL | DEPARTURE |` block) builds `flight_info = [arrivalRaw, departureRaw].filter(Boolean).join(" | ")` (`crew.ts:181-193`). `parseSheet(fixtures/shows/exporter-xlsx/east-coast.md)` produces **non-null `flight_info` for all 3 crew** (e.g. Doug Larson: `"EWR-FLL UNITED 5/13 - 11:29am - 2:34pm HQQ79F | FLL-EWR JET BLUE 5/15 - 8:59pm - 11:58pm OSUULZ"`). Type `lib/parser/types.ts:71` `flight_info: string | null` on `CrewMemberRow`. (The CREW-block FLIGHT-column path at `crew.ts:81`/`:129`/`:263` also populates it, but no current sheet uses that shape — the TECH ARRIVAL/DEPARTURE path is the live source.)
- It is **already stored** (`flight_info text` — `supabase/migrations/20260501000000_initial_public_schema.sql:41`) and **already written** by the sync (`lib/sync/phase2.ts:340`, `runScheduledCronSync.ts:1225`).
- The only gap is **projection → render**. `getShowForViewer.ts:316-319` (the crew roster select) and the `crewMembers[]` element shape (`getShowForViewer.ts:323-347`) omit `flight_info`; `TravelSection.tsx:24` comments "There is NO flights block — flights are not in the ShowForViewer projection."

### Data reality (verified, 2026-06-19) — proves the premise + bounds the scope

A live gsheets audit of all 6 reachable show sheets found per-crew flight for **6 crew across 4 shows**, but only the **TECH-path source is parseable today**:

| Source | Shows | Reaches `flight_info`? |
|---|---|---|
| INFO-tab **TECH block** (ARRIVAL/DEPARTURE) | East Coast (3 crew) | **YES** — this feature surfaces it |
| Dedicated **TRAVEL tab** ("FLIGHT DETAILS" cell) | RPAS + both FinTech copies (1 crew each, "John Carleo") | **NO** — the parser never reads the TRAVEL tab |
| No flight data | Redefining FI, Fixed Income Trading | n/a (genuinely empty) |

This feature ships the **TECH/`flight_info` path** (East Coast's 3 crew, zero parser change). The **TRAVEL-tab parser is a DEFERRED fast-follow** (`DEF-FLIGHT-1`, below) — a distinct parser surface (different shape: one combined "FLIGHT DETAILS" cell, conf-first, blank-line-separated legs, `DRIVING`/`LOCAL` sentinels, a legend row, join-by-NAME to the roster) that ~doubles coverage (3→6 crew) but must not block the card. **The render built here is forward-compatible**: once the TRAVEL-tab parser feeds the same normalized `flight_info`, the card needs no rework.

## Resolved decisions

1. **Render the two legs (`" | "`-split), NOT deep-structured parsing.** The parsed `flight_info` from the TECH path has a **known top-level shape**: `arrivalLeg + " | " + departureLeg` (`crew.ts:181-193` joins `[arrivalRaw, departureRaw].filter(Boolean)` with `" | "`). Each leg is a **space-separated** run of `route airline M/D - h:mma - h:mmp confirmation` — the exporter (`synthesizeMarkdownFromXlsx`) flattens the source cell's newlines to spaces, so the **parsed value contains NO `\n`** (verified: `east-coast.md` → `"EWR-FLL UNITED 5/13 - 11:29am - 2:34pm HQQ79F | FLL-EWR JET BLUE 5/15 - 8:59pm - 11:58pm OSUULZ"`). So the render **splits on `" | "`** into arrival/departure legs and renders each leg as its own line — readable, and honoring the one reliable delimiter. It does NOT deep-parse a leg into route/airline/time/conf (those are space-separated with no stable delimiters — fragile, YAGNI) and does NOT split on `\n` (there is none in the parsed value; splitting on `\n` *as well* is a harmless forward-compat allowance for the deferred TRAVEL-tab source). Guard the **1-leg case** (only `arrivalRaw` or only `departureRaw` truthy → no `" | "`, one line) and the **0-leg case** (everything stripped → no card).
2. **The card shows the viewer their OWN flight (presentation choice, NOT a new security boundary).** The Travel section is personal, so the card surfaces only `viewerFlightInfo` (the viewer's own row, read via the existing own-row lookup) — it does not render a roster of everyone's flights. **This is a UX/leanness choice, not a privacy enforcement.** `flight_info` is a column on the **crew-readable** `public.crew_members` table: the `crew_read` RLS policy (`20260501002000_rls_policies.sql:230-232`, `is_admin() or (can_read_show(id) and published=true)`) + the `anon, authenticated` SELECT grant already let any authenticated crew member of the show query any crew row's columns — including `name`, `email`, `phone`, and `flight_info` — directly via PostgREST. So `flight_info` is **roster-shared data, exactly like `email`/`phone`** (the roster is intentionally shared among a show's crew; this is the OPPOSITE of admin-only `shows_internal`, which IS service-role-locked). Surfacing it in the UI does not change that pre-existing exposure and does not create a privacy boundary the projection must enforce. (Conf/record-locator codes — `HQQ79F`, `OSUULZ` — are sensitive, but no more protected than the `email`/`phone` already on the shared roster; if the project later wants to gate crew PII broadly — `flight_info` + `email` + `phone` behind a service-role/RPC surface with a column-grant lockdown + a PostgREST-boundary test — that is a **separate, broader effort** filed in `BACKLOG.md` as `BL-CREW-PII-DB-LOCKDOWN`, NOT this UI feature. Hardening only `flight_info` while `email`/`phone` stay open would be inconsistent.)
3. **Hidden when blank.** When the viewer has no flight on file (the common case), **no flight card renders** — matching the Travel section's existing hide-when-empty behaviour for the transport ("Getting there") and Hotels blocks.
4. **Render-time URL-strip (narrowed contract) + sentinel guard.** Strip the *problematic* link forms — **schemed URLs** (`https?://…`) and **scheme-less Google** Drive/Docs links — by reusing `stripAgendaUrls` (`lib/visibility/agendaUrls.ts`), and hide the card if the residue is empty or a generic sentinel. **A bare scheme-less non-Google domain (e.g. `aa.com/checkin`, `southwest.com/checkin`) is INTENTIONALLY NOT stripped and renders as plain text** — it is the crew member's own benign check-in info (mildly useful, not sensitive, and not a clickable link in the card), and a general bare-domain stripper would over-strip legitimate flight text (a fare class, a `T1/T2` terminal, a `6/24` date). This is the ratified `stripAgendaUrls` limitation, applied deliberately: the flight URL-strip contract is **schemed + scheme-less-Google only**, NOT "all URLs." The earlier framing "the link class this feature suppresses" means schemed/Drive links, not bare airline domains.
5. **No new Supabase call boundary / no fail-soft tile.** Flight rides the **existing** viewer own-row auth lookup (`getShowForViewer.ts:234-239`) as one extra selected column — not a new read. So it needs **no** `tileErrors` channel and **no** invariant-9 waiver (unlike run_of_show, which was a separate `shows_internal` read). A lookup error already throws the existing viewer-resolution error; flight inherits that.

## §1 — Projection (`lib/data/getShowForViewer.ts`)

**Read the viewer's own flight on the existing dual-constrained lookup — follow the exact `viewerName` pattern (declare-before-block, assign-inside-block).** `viewerName` is declared `let viewerName: string | null = null;` at `getShowForViewer.ts:227` (BEFORE the `if (needsCrewLookup)` block) and assigned INSIDE the block at `:247` (`viewerName = lookup.data.name`). `lookup` is block-scoped (`:234`), so a `const viewerFlightInfo = … lookup … ` placed *after* the block would not compile. Mirror `viewerName`:

1. Add `flight_info` to the lookup select (`:236`): `.select("role_flags, name, flight_info")`.
2. Declare `let viewerFlightInfo: string | null = null;` alongside `let viewerName …` at `:227` (BEFORE the block) — so it is in scope for the return literal regardless of viewer kind.
3. INSIDE the `if (needsCrewLookup)` block, after the existing `lookup.data` guards (`:240-247`), assign with a **blank-normalize** so a blank cell projects as `null` (not `""`):

```ts
// inside `if (needsCrewLookup) { … }`, after the :243-247 guards:
const rawFlight = (lookup.data.flight_info as string | null) ?? null;
viewerFlightInfo = rawFlight && rawFlight.trim().length > 0 ? rawFlight : null;
```

`flight_info` is `text` (not jsonb) → **no `decodeJsonbColumn`**. The `trim().length > 0` check normalizes a blank/whitespace-only cell to `null` at the projection (the `blank → viewerFlightInfo null` contract; defensive against a legacy non-`presence()`'d `""` row — `presence()` usually nulled blanks at parse, `lib/parser/blocks/crew.ts:263`). The plain-admin branch (`needsCrewLookup === false`) leaves `viewerFlightInfo` at its `null` initializer. Sentinel hiding (`TBD`/`N/A`) is NOT done here — it is the UI's `shouldHideGenericOptional` gate (§2); the projection only blank-normalizes.

**Add to `ShowForViewer`** a top-level field (sibling of the existing per-viewer-resolved fields like `viewerName`):

```ts
viewerFlightInfo: string | null;   // the ACTIVE viewer's own flight_info; null for a non-crew (plain admin) viewer
```

Emit `viewerFlightInfo` in the return literal. **The crew roster select (`getShowForViewer.ts:316-319`) and the `crewMembers[]` element (`:323-347`) are UNCHANGED — they never read or carry `flight_info`.**

### Projection guard conditions (every path)

| Viewer | `needsCrewLookup` | `viewerFlightInfo` |
|---|---|---|
| `crew` (own `crewMemberId`) | true | the viewer's own `flight_info` (or `null` if their cell is blank) |
| `admin_preview` (previewing a crew member) | true | the **previewed** crew member's `flight_info` (preview-as semantics — same as their other per-viewer data) |
| `admin` (plain, not previewing) | false | `null` (admin is not a crew member; no own-flight) |
| lookup row missing / wrong show | n/a | the existing `:243-245` throw `PICKER_CREW_MEMBER_WRONG_SHOW` (unchanged) |
| lookup error | n/a | the existing `:240-242` throw (unchanged) — flight is a column on this query, not a separate read |

### Projection scope (P-1 — presentation/leanness, NOT a security boundary)

`flight_info` is selected **only** in the `:234-239` own-row dual-constrained (`id` + `show_id`) lookup and exposed **only** as `viewerFlightInfo` — it is NOT added to the `:316-319` roster select or any `crewMembers[]` element. This keeps the projection lean and matches the card's need (it shows the viewer THEIR flight, not a roster of everyone's). **It is explicitly NOT a security boundary**: `flight_info` remains directly readable by any authenticated show-crew member via PostgREST (the crew-readable `crew_members` table, same as `email`/`phone` — see decision 2). The tests below assert the projection's SHAPE (viewerFlightInfo is the viewer's own; `crewMembers[]` carries no flight key) as a *presentation contract*, not a privacy guarantee — they do NOT claim flight is unreadable elsewhere.

## §2 — UI (`components/crew/sections/TravelSection.tsx`)

Add a **conditional flight `SectionCard`** to the Travel section, sourced from `data.viewerFlightInfo` (the section already consumes `ShowForViewer` via `resolveViewerContext`). The Travel section is keyed `?s=travel` (`resolveActiveSection.ts`), one of the 6+1 sub-nav sections (`today | schedule | venue | travel | crew | gear | budget`, `CrewSubNav.tsx:41-46`).

**Render rule (rendered element, not conceptual).** Split the parsed `flight_info` on its `" | "` arrival/departure separator (the TECH-path delimiter; also split on `\n` as a harmless forward-compat allowance for the deferred TRAVEL-tab source), URL-strip each leg, drop empty/sentinel/URL-only legs:

```ts
const flightLegs = (data.viewerFlightInfo ?? "")
  .split(/\s*\|\s*|\n/)                                  // " | " arrival/departure separator (+ \n forward-compat)
  .map((leg) => stripAgendaUrls(leg))                   // per-leg: schemed/Google URLs gone, intra-leg whitespace collapsed (fine)
  .filter((leg) => leg.length > 0 && !shouldHideGenericOptional(leg));
const showFlight = flightLegs.length > 0;
```

Splitting first (not one `stripAgendaUrls` over the whole string) is required because `stripAgendaUrls` collapses ALL whitespace runs (`.replace(/\s+/g, " ")` in `lib/visibility/agendaUrls.ts`); stripping per-leg keeps each leg intact and lets a URL-only leg drop cleanly.

- `showFlight === false` → **render nothing** for flight (no card, no header, no empty placeholder) — the section shows transport/hotels (or its own existing empty state) exactly as today.
- `showFlight === true` → render ONE `SectionCard` titled **"Your flight"** (`data-testid="travel-flight"`) whose body renders **each surviving leg as its own line element** (e.g. `flightLegs.map((l, i) => <span key={i} className="block">{l}</span>)`) — arrival and departure on **separate visual lines**, never a single run-on blob. A round-trip renders two lines (arrival, departure); a one-way (only `arrivalRaw` or only `departureRaw` truthy → no `" | "`) renders one line. A leg that is only a schemed URL or a Google link strips to empty and is dropped (the real leg still renders); a leg that is only a *bare* airline domain (`aa.com/checkin`) does NOT strip to empty and renders (per decision 4).

**Placement:** the flight card renders **first** within Travel (above "Getting there" and "Hotels") — a crew member's own flight is the most personal, time-sensitive Travel datum. Use the existing `SectionCard` primitive (`@/components/crew/primitives/SectionCard`, the same `<SectionCard title=…>` the transport block at `TravelSection.tsx:165` and hotels at `:245` use) — no new tokens (the impeccable dual-gate verifies real-browser fidelity, including no undefined-token fallbacks — the Phase-2 lesson). `viewerFlightInfo` is the exact sibling of the existing `viewerName` field (`getShowForViewer.ts:196`/`:247`/`:637`), both captured from the same own-row lookup.

**Section-level empty state (integration — load-bearing).** Travel renders `<EmptyState data-testid="section-empty">` "when BOTH blocks are hidden/empty" today (`TravelSection.tsx` header comment, the `section-empty` fallback). With the flight card added, the section is empty only when **ALL THREE** are absent: `showFlight === false` **AND** transport hidden/empty **AND** no hotels. So the `section-empty` condition must fold in `showFlight` — a viewer with a flight but no transport/hotels sees the flight card and **no** empty state. Update the empty-state predicate accordingly; a test asserts (a) flight-present + transport/hotels-empty → flight card, no `section-empty`; (b) all three empty → `section-empty`, no flight card. Also update/remove the `:24` header comment "There is NO flights block."

### UI guard conditions (every input state)

| `data.viewerFlightInfo` | Rendered |
|---|---|
| `null` (plain admin, or blank cell) | no flight card (Travel unchanged) |
| `""` / whitespace-only | no flight card (stripped length 0) |
| sentinel (`TBD`/`N/A`/`TBA`) | no flight card (`shouldHideGenericOptional`) — defensive; `presence()` usually nulled these at parse |
| a SCHEMED URL only (e.g. `https://aa.com/checkin`) | no flight card (schemed URL strips to empty) |
| a Drive/Docs link only (`drive.google.com/…`) | no flight card (scheme-less Google stripped) |
| a BARE airline domain only (`aa.com/checkin`) | the flight card rendering `aa.com/checkin` (scheme-less non-Google **intentionally NOT stripped** — benign crew-own check-in text; ratified `stripAgendaUrls` limitation) |
| round-trip (`"EWR-FLL UNITED 5/13 - 11:29am - 2:34pm HQQ79F \| FLL-EWR JET BLUE 5/15 - 8:59pm - 11:58pm OSUULZ"`) — the real East Coast shape | the flight card, **two lines**: arrival leg, departure leg (split on `" \| "`) |
| one-way (single leg, no `" \| "`) | the flight card, **one line** |
| a leg with a trailing schemed/Google URL | the flight card, that URL removed, the leg's real text retained |

## Test plan (the concrete failure each catches)

**Parse premise** (`tests/parser/crewFlightFixture.test.ts` — fixture-backed, PROVES the premise so the projection+UI are not built on an unproven assumption; resolves the "scope built on an unproven parser premise" concern): `parseSheet(readFileSync("fixtures/shows/exporter-xlsx/east-coast.md", "utf8"))` → all **3** crew have non-null `flight_info`, and Doug Larson's value contains both `"EWR-FLL"` (arrival) AND `"FLL-EWR"` (departure) separated by `" | "`. Catches a future converter/parser change that silently drops the TECH-path flight data (which would hollow this feature).

**Projection** (`tests/data/getShowForViewerFlight.test.ts`, mock modeled on `getShowForViewerRunOfShow.test.ts`):
- crew viewer with `flight_info` → `viewerFlightInfo` equals it (catches: not projected at all).
- crew viewer with blank `flight_info` → `viewerFlightInfo` null (catches: blank surfacing as `""`).
- plain admin (`needsCrewLookup` false) → `viewerFlightInfo` null (catches: admin getting a phantom flight).
- **P-1 presentation contract:** with a second crew member's `flight_info` set in the roster fixture → `viewerFlightInfo` is the VIEWER's own (not the other's), AND no `crewMembers[]` element carries a flight key (catches: the card accidentally sourcing the wrong row, or flight leaking onto the roster projection). This is a presentation/leanness assertion, NOT a security claim — `flight_info` is directly crew-readable via PostgREST regardless (decision 2).
- **P-1 source-scan:** `getShowForViewer.ts` reads `flight_info` only in the own-row lookup — the roster `.select(...)` substring does NOT contain `flight_info` (keeps the projection lean; catches a refactor that bloats the roster select).
- cross-show fail-closed: a viewer's id on the wrong show → the existing `PICKER_CREW_MEMBER_WRONG_SHOW` throw still fires (flight didn't widen the auth boundary).

**UI** (`tests/components/crew/sections/TravelSection.flight.test.tsx`, jsdom):
- `viewerFlightInfo` present → `[data-testid="travel-flight"]` renders the string (asserted vs the data source, scoped to the card — anti-tautology).
- `viewerFlightInfo` null / `""` / sentinel / **schemed-URL-only** (`https://…`) / **Google-link-only** (`drive.google.com/…`) → no `travel-flight` element (Travel anchor blocks intact).
- **round-trip → arrival + departure on SEPARATE lines** (the regression a naive "both legs present" check misses): the real East Coast shape `"EWR-FLL UNITED 5/13 - 11:29am - 2:34pm HQQ79F | FLL-EWR JET BLUE 5/15 - 8:59pm - 11:58pm OSUULZ"` must render as **≥2 distinct line elements** (split on `" | "`), NOT one run-on line. Derive the expected legs from the data source (split the fixture value on `" | "`), not hardcoded.
- one-way (single leg, no `" | "`) → exactly one line.
- a leg that is only a schemed-URL/Google-link → that leg is dropped, the other (real) leg renders (catches the per-leg filter).
- a SCHEMED or Google URL inside a leg → no `https://` / `http://` / `drive.google.com` / `docs.google.com` substring in the crew DOM; the leg's real text survives.
- **a BARE airline domain (`aa.com/checkin`) RENDERS** (pins the schemed-only contract — fails if a future change over-strips bare domains / breaks the documented `stripAgendaUrls` limitation, AND documents that we deliberately don't suppress benign crew-own check-in text).
- flight card renders even when transport + hotels are empty (the flight card is independent of the other Travel blocks).

## Out of scope (do-not-relitigate) + deferred

- **No parser change in this feature.** The TECH-path `flight_info` (East Coast's 3 crew) is consumed as-is. **No deep-structured parsing** of a leg into route/airline/time/conf (space-separated, fragile — render the `" | "`-split legs only).
- **DEF-FLIGHT-1 (DEFERRED, fast-follow): TRAVEL-tab flight parser.** RPAS + both FinTech copies carry one crew flight each in a dedicated **TRAVEL tab** (a single "FLIGHT DETAILS" cell, conf-first, blank-line-separated legs, `DRIVING`/`LOCAL` non-flyer sentinels, a legend/template row to exclude, join-by-NAME to the roster, year inferred from show dates) — a DISTINCT parser surface the current code never reads. It ~doubles coverage (3→6 crew) and is the highest-leverage parser addition, but it must NOT block this card. The render built here is forward-compatible: once the TRAVEL-tab parser normalizes into the same `flight_info` string, the card needs no rework. File in the Phase-3 `DEFERRED.md` with the trigger "next parser milestone / when TRAVEL-tab flight coverage is prioritized."
- No migration / no sync change (the column + write exist).
- The card surfaces only the viewer's own flight (P-1 presentation); no roster-of-all-flights view. This is NOT a DB privacy boundary — `flight_info` is crew-readable like `email`/`phone` (decision 2).
- **BL-CREW-PII-DB-LOCKDOWN (BACKLOG, separate effort):** if the project decides crew PII should be gated from other crew, harden `flight_info` + `email` + `phone` together (a column-grant lockdown so `anon`/`authenticated` cannot directly SELECT them, the service-role projection still reading, + a PostgREST-boundary test). Out of scope for this UI feature; hardening only `flight_info` would be inconsistent with the equally-exposed `email`/`phone`.
- No `tileErrors`/fail-soft channel for flight (it rides the existing auth lookup, not a new read) and no §12.4 code (flight projection emits no warning).

## Existing-code citations (verified live, 2026-06-19)

- Parse: `lib/parser/types.ts:71`; `lib/parser/blocks/crew.ts:81` / `:129` / `:263`.
- Storage: `supabase/migrations/20260501000000_initial_public_schema.sql:41`; sync write `lib/sync/phase2.ts:340`, `runScheduledCronSync.ts:1225`.
- Projection (the edit site): `lib/data/getShowForViewer.ts:234-239` (own-row lookup) + the `ShowForViewer` type + the return literal; roster (UNCHANGED) `:316-319` / `:323-347`.
- UI: `components/crew/sections/TravelSection.tsx` (+ `:24` the "no flights block" comment to remove); `resolveViewerContext` / `viewerContext.ts:112`; `CrewSubNav.tsx:41-46`.
- Reuse: `lib/visibility/agendaUrls.ts` (`stripAgendaUrls`), `lib/visibility/emptyState.ts` (`shouldHideGenericOptional`).
