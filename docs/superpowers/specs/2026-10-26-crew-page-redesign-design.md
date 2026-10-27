# Crew page redesign: one design language with the admin popup

**Status:** draft, autonomous ship approved by Eric 2026-10-26.
**Branch:** `feat/crew-page-redesign`.
**Mockups (canonical visual reference):** https://claude.ai/artifact/APJoqTo3Q2rx8gBEZPG8Fd, page "Round 2: built on C". Boards: `R2Home` (phone home), `R2Sheet` (phone section sheet), `R2Details` (shared section panels), `R2Wide` (wide window, left nav), `R2Search` (search, out of scope here, see §1.2). Board `R2WideAll` is a rejected alternative kept for reference.

## 0. Why

Crew open their page on a phone, on site, to find one fact from Doug's sheet: a call time, the dock, the wifi password, tonight's hotel, who to call. They need to find it fast and trust it. Most of the trust comes from Doug reviewing the sheet before publishing, so the admin show popup Doug reviews in should show the same section panels the crew see. Today the two surfaces look and behave differently: the admin popup is one scrolling column of grouped panels with a side rail, while the crew page is a set of tabs showing one section at a time. This spec gives both surfaces one design language and rebuilds the crew page around the "find one fact fast" moment.

## 1. Goals, non-goals, anti-goals

### Goals

- **G1. Phone home built for the on-site moment.** Header with the show name and a light/dark switch, a row of the show's days, a "pass" card for the selected day, the day's run of show, four quick facts, and a list of every other section.
- **G2. Phone sections open in a bottom sheet** over the home screen, so a crew member peeks at a section without losing their place.
- **G3. Wide windows use a left nav like the admin popup.** "Today" first, then the section groups; sections stack in one scrolling column; the nav tracks the section in view.
- **G4. One set of section panels.** The crew page and the admin popup render the same panel components for every shared section. The admin popup adds its admin-only chrome around them; the crew page adds nothing the admin cannot preview.
- **G5. Dark mode switch on the crew page.** Follows the device setting until the crew member picks one; the pick is remembered on that device.
- **G6. Consistent, plain copy** across both surfaces, from the copy audit in §9.

### Non-goals (each is its own project, already split off)

- **Search** (project 3, separate session). This spec reserves the header slot only; see §1.2.
- **Offline copy with a "last updated" note** (project 2, separate session).
- **Doug's per-show quick-facts picker** (project 4). This spec defines the default quick-facts set and its field identifiers so project 4 can extend it without reworking the component.
- Any change to what data a viewer can see, to parsing, sync, auth, or the database.

### Anti-goals (failure even if everything else works)

- The crew page and the admin popup drift apart again because each keeps its own copy of a panel.
- A fact that is one tap away today becomes two taps away.
- A crew member sees something the admin preview of that crew member does not show, or the reverse.
- An empty tile, an empty card, or a raw machine token anywhere on the crew page.

## 1.1 Resolved scope: do not relitigate

Ratified by Eric in the 2026-10-26 design conversation, recorded on the mockup canvas named above.

| # | Decision | Ratification |
|---|---|---|
| R1 | Build on round-1 option C (search and shortcuts first), reworked with patterns from travel and event apps (boarding pass, day strip, itinerary timeline, booking card). | Canvas page "Round 2: built on C"; Eric: "Round 2 is the direction." |
| R2 | Wide windows use a left nav like the admin popup. The everything-on-one-page grid was tried and rejected as too busy. | Boards `R2Wide` (chosen) vs `R2WideAll` (rejected). |
| R3 | On phones, sections open in a bottom sheet. | Eric: "a bottom sheet would work well for most of those items if not all"; board `R2Sheet`. |
| R4 | Quick facts start from a fixed default set; Doug can change them per show later (project 4). | Eric: "a default that's changeable by Doug if he wants to." |
| R5 | A light/dark switch lives in the crew page header. | Canvas comment thread "need a dark mode option". |
| R6 | The pass card and the day row are personal to the viewer. The admin popup shows them only while Doug previews the page as a specific crew member. | Playback accepted by Eric ("otherwise sounds good"). |
| R7 | The pass card stays dark in both themes so it remains the page's focal point. | Same playback. |
| R8 | Search, offline, and the quick-facts picker ship as separate projects, in parallel where practical. | Eric: "yes though we should work concurrently if practical." |
| R9 | Search is fuzzy and client-side with an alias list, never AI/RAG. Recorded here only because §1.2 reserves its slot. | Brainstorm decision, search session brief. |

## 1.2 Seams with the parallel projects

- **Search.** The header renders a search slot component that this project ships as nothing at all (no inert box). The search project replaces it. Contract: TODO §3 once the header structure is final.
- **Offline.** The page shell exposes one slot above the day row for a status note. This project renders nothing there; the offline project fills it.
- **Quick-facts picker.** Quick facts are chosen from a typed, ordered list of fact identifiers (§4.5). This project hardcodes the default order; project 4 replaces the source of that order with a per-show setting.

## 2. Current state

TODO: filled from the code inventories, every claim cited by file and symbol.

## 3. Modes and layout

TODO.

## 4. Components

TODO.

## 9. Copy

TODO: from the copy audit.
