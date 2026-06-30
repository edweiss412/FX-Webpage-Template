# Close the Step-3 review-modal publish-gate blind spots — Design Spec

**BL:** `BL-REVIEW-MODAL-COMPLETENESS` (INFO-tab audit finding M2). **Routing:** UI → Opus + impeccable v3 dual-gate (AGENTS.md invariant 8). **Class:** REVIEW-ONLY GAP. **Render-only, modal-only** — no parser / DB / projection / crew-page change.

## Goal

The Step-3 review modal (the operator's pre-publish gate) renders only 6 of the parsed sections, so the operator cannot pre-publish-verify a large set of fields that the parser captures (and that mostly reach the crew page). Add operator-only review sections so the gate shows everything that landed: **Transport, Venue (address + loading dock + maps), Contacts (client + venue + in-house AV), Ops (COI / Proposal / PO# / Invoice), crew phone, hotel address.** All fields already live on `ParseResult` (the modal already holds `row.parseResult`); the modal simply doesn't render them.

## Background / recon grounding

The modal body is six `<BreakdownSection>`s (Crew, Crew Schedule, Rooms, Event details, Pack list, Hotels) + an Agenda block + a Warnings callout, assembled in `Step3SheetCard.tsx:1464-1505`, each reading a top-level `ParseResult` field (`Step3SheetCard.tsx:1260-1265`). A whole-file grep confirms ZERO references to transportation, contacts, loadingDock, coi, proposal, po, venue address, hotel address, or crew phone. Two of the audit's original gap rows are **already closed**: event-details (PR #195 extended `EventDetailsBreakdown` to the full whitelist) and per-room detail (PR #197 added the `RoomsBreakdown` detail sub-list). This spec covers the **remaining** rows.

The modal is an **as-parsed review surface**: primary values use `hasContent(v)` (`Step3SheetCard.tsx:97-99` — non-null, non-whitespace string), NOT `shouldHideGenericOptional`, so sentinels like `TBD`/`N/A` render verbatim (the operator sees exactly what parsed). This contract is pinned by `tests/components/admin/wizard/Step3Review.test.tsx:582`. New sections follow it.

## Resolved Decisions

1. **Modal-only, render-only.** All edits are in `components/admin/wizard/Step3SheetCard.tsx` + its two test files. No `lib/parser/**`, `supabase/**`, `getShowForViewer.ts`, or crew-page change. No shared module — the modal labels are modal-local (the crew page already renders this data via its own section components with its own labels; nothing to share).

2. **Read from `ParseResult` (`pr = row.parseResult`), not `ShowForViewer`.** The modal reviews the staged parse pre-publish. Every gap field is present on `ParseResult` (`data-shapes` recon). Notably **PO#/Proposal/Invoice are on `pr.show.{po,proposal,invoice}` directly** (`types.ts:134-137`) — they are force-nulled on the public `ShowForViewer.show` projection and only re-exposed via the LEAD-gated `financials`, but the operator modal reads `ParseResult` so it shows them straight, no gate (the modal is already admin-only).

3. **As-parsed (sentinels shown), via `hasContent` — same contract as the existing sections.** Do NOT apply `shouldHideGenericOptional` to primary values. A `TBD`/`N/A` field renders verbatim; only empty/whitespace (`hasContent` false) is omitted.

4. **Scope = the audit's remaining M2 rows.** Transport (T1-T7), venue address (V2) + loading dock (V3) + maps, COI (O1) + Proposal (O2) + PO# (O3) + Invoice, client contact (C2-C4), in-house AV + venue contact (O4/O5), crew phone (CR-PHONE), hotel address (H1). **Explicitly handled nuances:**
   - **Client contact** renders on NEITHER the crew page NOR the modal today; the crew deliberately never sees the client rep. But it is parsed, operator-relevant data the operator should verify pre-publish, so it IS added to the modal (operator-only). (The audit's claim that it "renders on the crew page" is inaccurate per live code; included anyway because the operator review should cover parsed data.)
   - **Hotel contact (O4)** has NO dedicated field on `ParseResult` (`HotelReservationRow` has no phone; `ContactKind` is only `'venue'|'in_house_av'`); a hotel phone, if any, parses into `pr.contacts` (kind `'venue'`) or hotel `notes`. So it is covered by the new Contacts section (venue contacts) — no separate hotel-contact field exists to render.
   - **Hotel confirmation_no** stays unrendered everywhere (by-design privacy; `audit:56,91`). NOT added.
   - **`venue.city`** is enrichment-time (`enrichVenueGeocode`), not parser-set (`types.ts:106-111`), so it may be absent on a freshly-staged `ParseResult` → `hasContent` false → omitted. Fine (as-parsed).

## Surface — new + extended modal sections (all in `Step3SheetCard.tsx`)

All new sections are `BreakdownSection` (`Step3SheetCard.tsx:159-181`: `{dfid, label, count, testId, children}`), rendered inside the breakdown grid (`columns-1 sm:columns-2`, `:1466-1476`), with empty-state `<p className="text-sm text-text-subtle">No … parsed.</p>` at count 0, and a per-section `data-testid={`wizard-step3-card-${dfid}-breakdown-<x>`}`. Each derives its data next to the existing `const crewMembers = arr(pr.crewMembers)` block (`:1260-1265`).

### NEW: `VenueBreakdown` (`-breakdown-venue`)
Reads `pr.show.venue` (`ShowRow.venue`, `types.ts:101-112`). Rows (label : value, as-parsed, omit empty): **Venue** (`venue.name`), **Address** (`venue.address`), **City** (`venue.city`), **Loading dock** (`venue.loadingDock`), **Maps link** (`venue.googleLink` — shown as raw text, NOT a live `<a>`; this is a review surface and a `TBD`/garbled URL must be visible as-parsed, not a dead link). `count` = number of present rows.

### NEW: `TransportBreakdown` (`-breakdown-transport`)
Reads `pr.transportation` (`TransportationRow|null`, `types.ts:186-196`). If null → "No transportation parsed." Rows: **Driver** (`driver_name`), **Driver phone** (`driver_phone`), **Driver email** (`driver_email`), **Vehicle** (`vehicle`), **License plate** (`license_plate`), **Color** (`color`), **Parking** (`parking`), **Notes** (`notes`). Then the schedule legs — **array-guarded against untyped JSONB** via the existing `arr()` helper (`arr(pr.transportation.schedule)`; same helper the modal uses for `arr(pr.crewMembers)`, coerces a non-array to `[]`): one row per leg = `${stage}` with `${date} ${time}` and `arr(leg.assigned_names).join(", ")` (also `arr()`-guarded so a non-array `assigned_names` can't crash `.join`), each leg gated by `hasContent(stage)`. `count` = present field rows + legs.

### NEW: `ContactsBreakdown` (`-breakdown-contacts`)
Reads `pr.show.client_contact` (`ClientContact = ClientContactPerson & { secondary?: ClientContactPerson | null }`, `types.ts:88-94`: each person `{ name, email, phone, officePhone? }`) + `pr.contacts` (`ContactRow[]`, `types.ts:198-205`, `kind: 'venue'|'in_house_av'`).

**Client people:** render BOTH the primary `client_contact` AND `client_contact.secondary` (when present) — iterate `[client_contact, client_contact?.secondary].filter(Boolean)` (**null-safe optional chaining** — `client_contact` may be null per guard conditions, so `?.secondary` avoids a throw; `[null, undefined].filter(Boolean)` → `[]`), each as a **Client contact** sub-block with name, phone, email, and **Office** (`officePhone`) rows. (Spec-R1: `secondary` is a parsed operator-relevant person; completeness requires rendering it.)

**Contact rows:** one sub-block per `pr.contacts[]` entry with a kind label (**In-house AV** for `kind==='in_house_av'`; **Venue contact** for `kind==='venue'`) + name, phone, email rows.

A person/contact with no `hasContent` fields is omitted. `count` = number of rendered people (client primary + client secondary + contacts). Order: client primary, client secondary, then `pr.contacts` in array order.

### NEW: `OpsBreakdown` (`-breakdown-ops`)
Reads `pr.show.{coi_status, po, proposal, invoice, invoice_notes}` (`types.ts:133-137`). Rows: **COI** (`coi_status`), **Proposal** (`proposal`), **PO#** (`po`), **Invoice** (`invoice`), **Invoice notes** (`invoice_notes`). `count` = number of present rows.

### EXTEND: `CrewBreakdown` (+ phone) (`Step3SheetCard.tsx:183-207`)
Currently renders name + role per crew member. Add a **phone** sub-row per member (`pr.crewMembers[].phone`, `types.ts:80`), gated by `hasContent`, as-parsed (no `tel:` link — review surface). Existing testid + count unchanged.

### EXTEND: `HotelsBreakdown` (+ address) (`Step3SheetCard.tsx:529-560`)
Currently renders hotel name + check-in/check-out. Add a **hotel_address** sub-row per reservation (`pr.hotelReservations[].hotel_address`, `types.ts:146`), gated by `hasContent`. `confirmation_no` stays unrendered (privacy). Existing testid + count unchanged.

### Section ordering
Insert the four new sections into the grid in a logical review order. Proposed: **Crew, Contacts, Crew Schedule, Rooms, Venue, Transport, Event details, Pack list, Hotels, Ops.** (Contacts next to Crew; Venue/Transport near Rooms; Ops last as back-office.) Order is a minor UX choice; impeccable critique may adjust.

## Guard conditions (every input)

- `pr.transportation` null → Transport section "No transportation parsed." `pr.contacts` empty AND `client_contact` null/empty → Contacts "No contacts parsed." `pr.show.venue` with all-empty fields → Venue "No venue details parsed." Ops with all-empty → "No ops details parsed."
- A non-string value (numbers/objects on a `string|null` field via untyped JSONB) → render must not throw. The existing sections render `r[key] as string`; the new sections use `hasContent` (which is `typeof === 'string'`), so a non-string is treated as absent (omitted) — matching the existing modal behavior. (The modal does NOT coerce non-strings to text; that's the established `hasContent` contract — distinct from the crew card's `String()` coercion.)
- Whitespace-only value → `hasContent` false → omitted.
- A contact/crew person with a name but no phone/email → renders the name only. A leg with a stage but no date/time → renders the stage only.
- **`client_contact` null** → `[client_contact, client_contact?.secondary].filter(Boolean)` → `[]` (no client sub-blocks; null-safe `?.`). **`client_contact` present, no `secondary`** → one client block.
- **`pr.transportation.schedule` absent / non-array** (untyped JSONB) → `arr(schedule)` → `[]` (no legs, no crash). **`leg.assigned_names` absent / non-array** → `arr(...)` → `[]` → empty join. Same `arr()` guard the modal already uses for `arr(pr.crewMembers)`.
- Long free-text (`parking`, `notes`, `invoice_notes`) → wraps (`wrap-break-word`, matching the existing scope sub-list).

## Dimensional invariants

N/A. The new sections are `BreakdownSection`s in the existing `columns-1 sm:columns-2` modal grid — the same primitive the 6 current sections use, with no fixed-dimension parent and no new parent→child dimension relationship. Nothing to assert with a real-browser layout test beyond what `BreakdownSection` already does. Documented explicitly.

## Transition inventory

N/A. The modal content is static server-rendered JSX revealed by the existing expand/`-more` toggle; no new `AnimatePresence`, ternary-animated, or conditional-motion element is introduced. The only state is the pre-existing expand/collapse of the whole overlay (unchanged). Instant — no animation.

## Cross-cutting touchpoints

- **No new card-id / CARD_REGION_MAP / SourceLink** — the modal `BreakdownSection`s carry no deep-link `SourceLink` (only crew cards do; the existing 6 modal sections have none). So `sourceLinkCoverage` (crew-only walker) is unaffected.
- **No `_metaSentinelHidingContract` change** — that meta-test walks `components/crew/sections` + `components/crew/primitives`, NOT `components/admin/wizard` (the modal is an as-parsed surface, deliberately not sentinel-hidden). Confirm it stays green (no admin path added).
- **Affordance-matrix** (help-only) — N/A.
- **No DESIGN.md change required** — the modal review breakdowns are an admin/operator internal surface, not part of the crew visual-token catalog (the existing 6 sections have no DESIGN.md entry). If impeccable's preflight wants a note, add a brief admin-modal mention; otherwise omit.
- **Invariant 8:** `/impeccable critique` + `/impeccable audit` on the diff (the modal is `components/**` → UI surface); HIGH/CRITICAL fixed or `DEFERRED.md`; dispositions in the PR description.

## Meta-test inventory

- **Creates/extends none** structural. No auth/DB/advisory-lock/admin-alert/card-id surface. (The §12.4 no-raw-codes contract: the new sections render parsed sheet content + static labels, NO error codes, so x2/no-raw-codes is unaffected — confirm no `MI-`/`MEK-`-style literals are introduced.)
- Advisory-lock / Supabase call-boundary: N/A (no Supabase calls, no locks).

## Test plan (anti-tautology; scope each assertion to the section testid; counts derived from fixture lengths)

1. **Transport** (`Step3Review.test.tsx`): `pr.transportation` with driver/vehicle/parking + a sentinel (`color: "TBD"`) + a schedule leg + a whitespace field → the `-breakdown-transport` section lists driver/vehicle/parking + the leg, SHOWS `TBD` (as-parsed), omits whitespace; a separate `transportation: null` fixture → "No transportation parsed." Failure mode: transport never surfaced / sentinel wrongly hidden.
2. **Venue** (`-breakdown-venue`): venue with address + loadingDock + a `TBD` city + a googleLink → all shown as-parsed incl. the raw googleLink text (NOT an `<a href>`); all-empty venue → empty state. Failure mode: address/dock never surfaced; maps link rendered as a live (possibly-dead) link.
3. **Contacts** (`-breakdown-contacts`): a `client_contact` with a `secondary` person (both name+phone) + a `contacts` entry kind `in_house_av` (name+email) + a `venue` contact → FOUR sub-blocks render (client primary, client secondary, in-house AV, venue) with correct kind labels; count === 4 derived; no contacts + no client → empty state. Failure mode: client contact (or its `secondary`) omitted; kind mislabeled.
4. **Ops** (`-breakdown-ops`): `coi_status`/`po`/`proposal`/`invoice` populated (+ a sentinel) → all shown as-parsed; all-empty → empty state. Failure mode: PO/proposal wrongly gated/hidden (they're null on the public projection — assert the modal still shows them from ParseResult).
5. **Crew phone** (extend): a crew member with a phone → the crew section shows the phone as-parsed (no `tel:` link); a member without → name+role only, no throw. Scope to the crew breakdown testid.
6. **Hotel address** (extend): a reservation with `hotel_address` → the hotels section shows it; `confirmation_no` present → NOT shown (privacy). Scope to the hotels breakdown testid.
7. **Full-suite green** — `step3SheetCard.test.tsx` + `Step3Review.test.tsx` + `_metaSentinelHidingContract` (unaffected) + x2-no-raw-codes (unaffected).

## Out of scope / deferred

- Hotel confirmation_no (privacy, unrendered everywhere).
- A dedicated hotel-contact field (none exists; covered by Contacts/venue + hotel notes).
- Crew flight_info in the modal (roster select omits it; not in the BL).
- Any crew-page / parser / projection change.
- Deep-link `SourceLink`s on modal sections (the existing 6 don't have them).
