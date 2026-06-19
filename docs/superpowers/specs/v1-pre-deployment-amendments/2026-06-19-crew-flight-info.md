# Per-crew flight info — crew Travel section enrichment (design / spec)

**Date:** 2026-06-19 · **Branch:** `feat/crew-flight-info` (off merged `main` `dfcdd33e`) · **Owner-review:** WAIVED (Codex adversarial review is the gate).

## Goal

Surface each crew member's own flight info — already parsed into `crew_members.flight_info` but **never projected** — as a conditional card in the crew **Travel** section. A viewer who has flight info on file sees it; everyone else sees the Travel section exactly as today.

## Scope (deliberately narrow)

**Projection + UI only.** NO parser change, NO migration, NO sync change.

- `flight_info` is **already parsed** (`lib/parser/blocks/crew.ts:81` header detect → `:129` cell read → `:263` `flight_info: flightRaw ? presence(flightRaw) : null`; type `lib/parser/types.ts:71` `flight_info: string | null` on `CrewMemberRow`).
- It is **already stored** (`flight_info text` — `supabase/migrations/20260501000000_initial_public_schema.sql:41`) and **already written** by the sync (`lib/sync/phase2.ts:340`, `runScheduledCronSync.ts:1225`).
- The only gap is **projection → render**. `getShowForViewer.ts:316-319` (the crew roster select) and the `crewMembers[]` element shape (`getShowForViewer.ts:323-347`) omit `flight_info`; `TravelSection.tsx:24` comments "There is NO flights block — flights are not in the ShowForViewer projection."

## Resolved decisions

1. **Raw-string display, NOT structured parsing.** `flight_info` is free-form (airline / confirmation / flight # in whatever format the sheet used — `lib/parser/blocks/crew.ts:263` stores the raw cell). It is also **usually blank** (the agenda-grid `FLIGHT#` column is "essentially always blank — Doug doesn't fill them," `fixtures/shows/_schema-diff.md:233`; only one prose-format fixture carries flight data). Structuring it (airline/dep/arr/times) would be unreliable and is YAGNI. We render the raw string with line breaks preserved.
2. **Per-viewer, own-flight only (privacy — load-bearing).** Flight is PII. It is read **only on the viewer's own row** and projected as a single dedicated field — **never** on the full `crewMembers[]` roster array. A crew member never sees another crew member's flight.
3. **Hidden when blank.** When the viewer has no flight on file (the common case), **no flight card renders** — matching the Travel section's existing hide-when-empty behaviour for the transport ("Getting there") and Hotels blocks.
4. **Render-time URL-strip + sentinel guard.** Flight free text could paste a check-in link; strip URLs (reuse `stripAgendaUrls`, `lib/visibility/agendaUrls.ts`) and hide the card if the stripped residue is empty or a generic sentinel.
5. **No new Supabase call boundary / no fail-soft tile.** Flight rides the **existing** viewer own-row auth lookup (`getShowForViewer.ts:234-239`) as one extra selected column — not a new read. So it needs **no** `tileErrors` channel and **no** invariant-9 waiver (unlike run_of_show, which was a separate `shows_internal` read). A lookup error already throws the existing viewer-resolution error; flight inherits that.

## §1 — Projection (`lib/data/getShowForViewer.ts`)

**Read the viewer's own flight on the existing dual-constrained lookup.** At `getShowForViewer.ts:234-239` the lookup is:

```ts
const lookup = await supabase
  .from("crew_members")
  .select("role_flags, name")          // ← add flight_info
  .eq("id", viewer.crewMemberId)
  .eq("show_id", showId)               // dual constraint = cross-show fail-closed (:230-233)
  .maybeSingle();
```

Change the select to `.select("role_flags, name, flight_info")`. After the existing `lookup.data` guards (`:240-247`), capture:

```ts
const viewerFlightInfo: string | null =
  needsCrewLookup ? ((lookup.data.flight_info as string | null) ?? null) : null;
```

`flight_info` is `text` (not jsonb) → **no `decodeJsonbColumn`** needed (it is a plain string scalar; `presence()` already nulled sentinel-empties at parse time).

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

### Privacy invariant (P-1, load-bearing)

`flight_info` is selected **only** in the `:234-239` own-row dual-constrained (`id` + `show_id`) lookup, and exposed **only** as `viewerFlightInfo`. It is **never** in the `:316-319` roster select, **never** on any `crewMembers[]` element, and **never** for any id other than `viewer.crewMemberId`. A test asserts the roster select string does not contain `flight_info` and that `crewMembers[]` elements have no flight key.

## §2 — UI (`components/crew/sections/TravelSection.tsx`)

Add a **conditional flight `SectionCard`** to the Travel section, sourced from `data.viewerFlightInfo` (the section already consumes `ShowForViewer` via `resolveViewerContext`). The Travel section is keyed `?s=travel` (`resolveActiveSection.ts`), one of the 6+1 sub-nav sections (`today | schedule | venue | travel | crew | gear | budget`, `CrewSubNav.tsx:41-46`).

**Render rule (rendered element, not conceptual).** URL-strip **per line** so line breaks survive. `stripAgendaUrls` collapses ALL whitespace runs (`.replace(/\s+/g, " ")` in `lib/visibility/agendaUrls.ts`), so calling it on the whole multi-line string would FLATTEN a multi-leg itinerary (`AA1…\nAA2…`) into one line — the line-break requirement and a single `stripAgendaUrls` call are mutually exclusive. Therefore split first, strip each line, drop empty/sentinel/URL-only lines, and preserve the surviving line structure:

```ts
const flightLines = (data.viewerFlightInfo ?? "")
  .split("\n")
  .map((line) => stripAgendaUrls(line))                 // per-line: URLs gone, intra-line whitespace collapsed (fine)
  .filter((line) => line.length > 0 && !shouldHideGenericOptional(line));
const showFlight = flightLines.length > 0;
```

- `showFlight === false` → **render nothing** for flight (no card, no header, no empty placeholder) — the section shows transport/hotels (or its own existing empty state) exactly as today.
- `showFlight === true` → render ONE `SectionCard` titled **"Your flight"** (`data-testid="travel-flight"`) whose body renders **each surviving line as its own line element** (e.g. `flightLines.map((l, i) => <span key={i} className="block">{l}</span>)`, or a `<div className="whitespace-pre-line">{flightLines.join("\n")}</div>`) — a multi-leg itinerary stays on **separate visual lines**, never flattened. A URL-only line strips to empty and is dropped (so a 2-leg itinerary where one leg is just a check-in URL renders the one real leg).

**Placement:** the flight card renders **first** within Travel (above "Getting there" and "Hotels") — a crew member's own flight is the most personal, time-sensitive Travel datum. Use the existing `SectionCard` primitive (`@/components/crew/primitives/SectionCard`, the same `<SectionCard title=…>` the transport block at `TravelSection.tsx:165` and hotels at `:245` use) — no new tokens (the impeccable dual-gate verifies real-browser fidelity, including no undefined-token fallbacks — the Phase-2 lesson). `viewerFlightInfo` is the exact sibling of the existing `viewerName` field (`getShowForViewer.ts:196`/`:247`/`:637`), both captured from the same own-row lookup.

**Section-level empty state (integration — load-bearing).** Travel renders `<EmptyState data-testid="section-empty">` "when BOTH blocks are hidden/empty" today (`TravelSection.tsx` header comment, the `section-empty` fallback). With the flight card added, the section is empty only when **ALL THREE** are absent: `showFlight === false` **AND** transport hidden/empty **AND** no hotels. So the `section-empty` condition must fold in `showFlight` — a viewer with a flight but no transport/hotels sees the flight card and **no** empty state. Update the empty-state predicate accordingly; a test asserts (a) flight-present + transport/hotels-empty → flight card, no `section-empty`; (b) all three empty → `section-empty`, no flight card. Also update/remove the `:24` header comment "There is NO flights block."

### UI guard conditions (every input state)

| `data.viewerFlightInfo` | Rendered |
|---|---|
| `null` (plain admin, or blank cell) | no flight card (Travel unchanged) |
| `""` / whitespace-only | no flight card (stripped length 0) |
| sentinel (`TBD`/`N/A`/`TBA`) | no flight card (`shouldHideGenericOptional`) — defensive; `presence()` usually nulled these at parse |
| a check-in URL only (e.g. `https://aa.com/checkin`) | no flight card (URL strips to empty) |
| real string (`"AA1234 JFK→LAX 8:05a, conf ABCDEF"`) | the flight card, string verbatim post-strip |
| multi-line (`"AA1 JFK→LAX 8a\nAA2 LAX→SFO 2p"`) | the flight card, both legs on separate lines |
| real string + a trailing URL | the flight card, URL removed, real text retained |

## Test plan (the concrete failure each catches)

**Projection** (`tests/data/getShowForViewerFlight.test.ts`, mock modeled on `getShowForViewerRunOfShow.test.ts`):
- crew viewer with `flight_info` → `viewerFlightInfo` equals it (catches: not projected at all).
- crew viewer with blank `flight_info` → `viewerFlightInfo` null (catches: blank surfacing as `""`).
- plain admin (`needsCrewLookup` false) → `viewerFlightInfo` null (catches: admin getting a phantom flight).
- **P-1 privacy:** a second crew member's `flight_info` set in the roster fixture → `viewerFlightInfo` is the VIEWER's own (not the other's), AND no `crewMembers[]` element carries a flight field (catches: cross-crew PII leak).
- **P-1 source-scan:** `getShowForViewer.ts` reads `flight_info` only in the dual-constrained lookup — the roster `.select(...)` substring does NOT contain `flight_info` (catches: a future refactor adding flight to the roster).
- cross-show fail-closed: a viewer's id on the wrong show → the existing `PICKER_CREW_MEMBER_WRONG_SHOW` throw still fires (flight didn't widen the auth boundary).

**UI** (`tests/components/crew/sections/TravelSection.flight.test.tsx`, jsdom):
- `viewerFlightInfo` present → `[data-testid="travel-flight"]` renders the string (asserted vs the data source, scoped to the card — anti-tautology).
- `viewerFlightInfo` null / `""` / sentinel / URL-only → no `travel-flight` element (Travel anchor blocks intact).
- **multi-line → both legs on SEPARATE lines, NOT flattened** (the regression the naive "both legs present" test misses): a `"AA1 …\nAA2 …"` itinerary must render as ≥2 distinct line elements (or the card's text retains the `\n` / a `<br>`/block boundary between legs). Assert the card does NOT render both legs as one run-on line — i.e. fail if a single `stripAgendaUrls` over the whole string flattened it.
- a multi-line itinerary where ONE leg is a URL-only line → that line is dropped, the real leg renders (catches the per-line filter).
- URL in a line → no `https://` / `drive.google.com` substring in the crew DOM; the real text on that line survives.
- flight card renders even when transport + hotels are empty (the flight card is independent of the other Travel blocks).

## Out of scope (do-not-relitigate)

- No parser change (flight is already parsed) — and **no structured parsing** of the free-form string.
- No migration / no sync change (the column + write exist).
- No other crew member's flight (P-1). No admin "all crew flights" view.
- No `tileErrors`/fail-soft channel for flight (it rides the existing auth lookup, not a new read) and no §12.4 code (flight projection emits no warning).

## Existing-code citations (verified live, 2026-06-19)

- Parse: `lib/parser/types.ts:71`; `lib/parser/blocks/crew.ts:81` / `:129` / `:263`.
- Storage: `supabase/migrations/20260501000000_initial_public_schema.sql:41`; sync write `lib/sync/phase2.ts:340`, `runScheduledCronSync.ts:1225`.
- Projection (the edit site): `lib/data/getShowForViewer.ts:234-239` (own-row lookup) + the `ShowForViewer` type + the return literal; roster (UNCHANGED) `:316-319` / `:323-347`.
- UI: `components/crew/sections/TravelSection.tsx` (+ `:24` the "no flights block" comment to remove); `resolveViewerContext` / `viewerContext.ts:112`; `CrewSubNav.tsx:41-46`.
- Reuse: `lib/visibility/agendaUrls.ts` (`stripAgendaUrls`), `lib/visibility/emptyState.ts` (`shouldHideGenericOptional`).
