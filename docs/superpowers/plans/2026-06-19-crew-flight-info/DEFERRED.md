# DEFERRED.md — Crew page Phase 3 (per-crew flight info)

Deferral discipline (per AGENTS.md): land-now vs **DEFERRED** (will-do, concrete
trigger or blocked on a planned milestone) vs BACKLOG (might-do, speculative).
Entries here are **will-do** with a named trigger. See memory
`feedback_deferral_discipline.md`.

---

## DEF-FLIGHT-1 — TRAVEL-tab flight parser (the second live flight-data source)

**Surface:** `lib/parser/blocks/crew.ts` (a NEW parser path) + the existing
`flight_info` write/projection (consumed unchanged — the render built in this
milestone is forward-compatible).

**Finding (live gsheets audit, 2026-06-18/19; spec §"Data reality"):** per-crew
flight data exists for **6 crew across 4 shows**, but this milestone surfaces
only the **TECH-block** source (East Coast, 3 crew — `| TECH | PHONE | ARRIVAL |
DEPARTURE |` → `flight_info = [arrival,departure].filter(Boolean).join(" | ")`).
The other **3 crew flights** (RPAS Central + both FinTech Forum CTO Summit
copies — one crew each, all "John Carleo") live in a dedicated **TRAVEL tab**
("FLIGHT DETAILS" column) that the parser **never reads**, so they project as
`null` and the Travel card stays empty for them. This is real, currently-live
data the feature intentionally does not yet surface.

**Why deferred, not in-scope:** the TRAVEL-tab format is a **distinct parser
surface**, structurally different from the TECH block:

- One **combined "FLIGHT DETAILS" cell** (not separate `ARRIVAL`/`DEPARTURE`
  columns), confirmation-code-first.
- Legs separated by **blank lines** (not the TECH `" | "` join), each leg
  `date / flight# / route / times`.
- **`DRIVING` / `LOCAL`** non-flyer sentinels to exclude.
- A **legend / template row** to exclude.
- **Join-by-NAME** from the TRAVEL tab back to the crew roster (rosters mirror
  1:1 in the audited shows).
- **Year inference** from the show dates (the cell omits the year).

Building it now would expand this milestone from "projection + UI only" into a
parser change. The render built here normalizes whatever reaches `flight_info`,
so once a TRAVEL-tab parser feeds the same string, the Travel card needs **no
rework** — this is genuinely a fast-follow, not a blocker. It is the single
highest-leverage parser addition (~doubles flight coverage, 3 → 6 crew).

**Concrete trigger to resolve:** the **next parser-touching milestone**, OR when
an operator/Doug reports that a crew member's TRAVEL-tab flight (RPAS / FinTech)
is not appearing on their Travel card. Whichever fires first, implement the
TRAVEL-tab → `flight_info` parser (the bullet list above is the spec) behind the
existing write/projection/render contract.

**Interim state:** the Travel "Your flight" card renders only when
`flight_info` is populated (TECH-block shows). For TRAVEL-tab-only shows the card
is correctly hidden (matches the section's hide-when-empty pattern) — truthful,
not a defect; the data is simply not yet parsed.
