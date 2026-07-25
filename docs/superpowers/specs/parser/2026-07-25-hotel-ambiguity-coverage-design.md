# Hotel ambiguity coverage (2026-07-25)

**Status:** Draft → self-review → adversarial review → plan
**Closes:** `BL-PARSER-HOTEL-INLINE-AMBIGUITY`, `BL-PARSER-ADDRESS-SPLIT-AMBIGUITY` (BACKLOG.md §"Parser ambiguity-warning coverage (2026-07-07, ambiguity-warnings-v1)")
**Extends:** `docs/superpowers/specs/parser/2026-07-07-ambiguity-warnings-v1-design.md` (§3.1/§3.2 registry, §4.2 guest emit, §6 transform-sites walker, §7 overlay anchors)

---

## 1. Why now

Both backlog rows deferred with the same promote trigger: _"a live show where [the split] lands wrong with no operator signal."_ **That trigger has already fired and went unreported.** Running `parseHotels` over every fixture show (probe, 2026-07-25) shows `fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md` mis-parsing today:

```
hotel_name: "Four Seasons Chicago Eric Weiss"
address:    null
names:      ["Four Seasons", "Chicago Eric", "Jeffrey Justice"]
```

`"Four Seasons"` and `"Chicago Eric"` are not people. Eric Weiss's name was absorbed into `hotel_name` and is absent from `names`. Because crew visibility filters reservations by whether any `names` entry refers to the viewer (`lib/data/getShowForViewer.ts:125`, `res.names.some((n) => namesReferAny(n, viewerNameAliases))`), **Eric Weiss's own crew page does not show him this hotel.** The parse is silent: no warning, no gap class, nothing in the wizard.

This spec does not fix that parse. It makes the parser **say** when it made the judgment that produced it. Correcting the underlying extraction is explicitly out of scope (§11).

### 1.1 Resolved scope — do not relitigate

| # | Decision | Ratification |
|---|---|---|
| R1 | `splitHotelNameAddress` stays **suffix-only**; the ZIP-tail regex is NOT wired into the split. A numeric hotel brand ("Hotel 71 Chicago, IL 60601") must never be corrupted. This spec ADDS A WARNING at that boundary, it does not change the boundary. | `lib/parser/blocks/hotelConfTokens.ts:24-27` (Codex R5) |
| R2 | Confirmation numbers are parsed but **never persisted** (`confirmation_no: null` on every row). Any new warning payload inherits this: no conf# reaches a crew-readable field. | `lib/parser/blocks/hotels.ts:126-132`, `lib/parser/blocks/hotels.ts:864-867`; DEFERRED.md AUDIT-2026-06-18-PARSE-FIDELITY round 3 |
| R3 | Ambiguity warnings are `severity:"warn"`, **never block publish, never mark a rescan dirty**. New codes join `AMBIGUITY_CODES` and inherit that routing. | `lib/parser/ambiguityCodes.ts:2-6`; `lib/admin/step3Buckets.ts:65-69` |
| R4 | A cap-truncated reservation must **never** emit an ambiguity warning — a hotel that is not shown must not warn. Existing rank gate at `lib/parser/blocks/hotels.ts:487-504` (Codex R5). This spec preserves the property by moving the gate, not removing it. | `lib/parser/blocks/hotels.ts:487-491` |
| R5 | Admin **field overrides were deliberately removed** — `hotel_name`/`hotel_address` were 2 of the 6 overridable fields. There is no hand-edit path and this spec does not reintroduce one. | `docs/superpowers/specs/admin/2026-07-10-remove-admin-field-overrides.md:12`, `docs/superpowers/specs/admin/2026-07-10-remove-admin-field-overrides.md:164` |
| R6 | `AGENDA_DAY_AMBIGUOUS` is NOT in `AMBIGUITY_CODES` despite its name (fail-closed, no value produced). Membership is semantic. Do not propose adding it. | `lib/parser/ambiguityCodes.ts:8-13` |
| R7 | Option 1 of the design review: the address code covers BOTH the no-split-but-address-shaped case AND the numeric-name-split case. Corpus evidence shows neither fires on the 10 saved fixture shows (§9); that is accepted and is not evidence the rule is wrong. | This document, §9 |
| R8 | Inline guest warnings ship `resolvable:false`. The raw inline cell interleaves hotel, address, dates and guests, so there is no guest-only substring to swap in; the structured path's "raw cell as one names entry" would push the hotel name and check-in dates into a crew-readable `names` array. | This document, §6 |

---

## 2. Current behavior (verified)

### 2.1 The two guest paths

| Path | Entry | Judgment | Warns today |
|---|---|---|---|
| **Structured** (v4 / newer v2) | `parseGuestCell` (`lib/parser/blocks/hotels.ts:162`) | where one guest ends and the next begins, inside a cell already known to be guests-only | **Yes** — `HOTEL_GUEST_SPLIT_AMBIGUOUS` via `emitHotelGuestSplitAmbiguity` (`lib/parser/warnings.ts:212`) |
| **Inline** (v1 "Hotel Stays", older v2 "Hotel Reservations") | `buildInlineHotel` (`lib/parser/blocks/hotels.ts:642`) | where the hotel name ends, where the address starts, AND where each guest begins — all in one unlabeled run | **No** |

The inline path is strictly the harder problem and is the silent one. That asymmetry is the substance of `BL-PARSER-HOTEL-INLINE-AMBIGUITY`.

### 2.2 Inline sub-paths inside `buildInlineHotel`

1. **learn-K peel** (`lib/parser/blocks/hotels.ts:696-747`) — with ≥2 confirmation delimiters, learn the first guest's word count from the later guests. Applied only when the later guests agree on shape (`consistent`, `lib/parser/blocks/hotels.ts:716`); a mixed row deliberately falls through rather than guess (Codex R6, `lib/parser/blocks/hotels.ts:710-714`).
2. **No-guest split** (`lib/parser/blocks/hotels.ts:756-778`) — no guests at all, so any `" - "` is a name/address separator; `splitHotelNameAddress` owns the boundary.
3. **Legacy Patterns 1/2/3** (`lib/parser/blocks/hotels.ts:783-819`) — dash-name (`lib/parser/blocks/hotels.ts:784`), multi-dash (`lib/parser/blocks/hotels.ts:792`), and **title-case pairing** (`lib/parser/blocks/hotels.ts:802-819`), which grabs consecutive capitalized word pairs. Pattern 3 is the weakest: it cannot tell a three-word person from two people, and when the cell has no literal "check out" the strip is a no-op so it pairs across the **entire** cell including the hotel name. That is the exact mechanism that produced `["Four Seasons", "Chicago Eric", …]` in §1.

### 2.3 `splitHotelNameAddress`

`lib/parser/blocks/hotels.ts:261`. Locates the boundary with `STREET_ADDRESS_RE` (`lib/parser/blocks/hotelConfTokens.ts:14`) — a full street shape, suffix-anchored. On no match it returns the whole cleaned string as `name` with `address: null` (`lib/parser/blocks/hotels.ts:278`), a deliberately SAFE fallback.

A sibling regex `STREET_ADDRESS_ZIP_RE` (`lib/parser/blocks/hotelConfTokens.ts:20`) already recognizes a **suffixless** street by its `, <ST> <ZIP>` tail. It is used by `looksLikeStreetStart` (`lib/parser/blocks/hotelConfTokens.ts:28`) for conf-vs-street discrimination but is deliberately NOT used to split (R1). **This spec reuses that existing, tested regex as the ambiguity signal** rather than inventing a new heuristic: if the suffix regex misses and the ZIP regex hits, the parser is knowingly under-splitting.

---

## 3. New emission sites

### 3.1 Predicates (normative)

Three new predicates. Each is a pure function; none changes a parsed value.

| ID | Site | Fires when | Reason string |
|---|---|---|---|
| **P1** | `buildInlineHotel`, Pattern 3 (`lib/parser/blocks/hotels.ts:802-819`) | Patterns 1 and 2 both produced zero names AND Pattern 3 produced ≥1 name | `"titlecase-pairing-fallback"` |
| **P2** | `buildInlineHotel`, learn-K (`lib/parser/blocks/hotels.ts:696-747`) | `delims.length >= 2` AND control leaves the learn-K block without returning (either `!consistent` at `lib/parser/blocks/hotels.ts:716`, or the `names.length >= 2 && hotelPart.length > 0` guard at `lib/parser/blocks/hotels.ts:733` fails) | `"learn-k-shape-disagreement"` |
| **P3** | `splitHotelNameAddress` (`lib/parser/blocks/hotels.ts:261`) | **(a)** `STREET_ADDRESS_RE` misses AND `STREET_ADDRESS_ZIP_RE` matches the cleaned string → `"address-shape-unsplit"`; **or (b)** `STREET_ADDRESS_RE` matches AND the resulting `name` contains `/\d/` → `"numeric-name-boundary"` | as shown |

P1 and P2 are mutually reachable in one cell and both stash; the emitter collapses them to ONE warning per reservation carrying both reasons (mirrors `parseGuestCell`'s existing `reasons: string[]`, `lib/parser/blocks/hotels.ts:178`).

**P3 purity.** `splitHotelNameAddress` is exported and called from 5 sites (`lib/parser/blocks/hotels.ts:413`, `lib/parser/blocks/hotels.ts:418`, `lib/parser/blocks/hotels.ts:607`, `lib/parser/blocks/hotels.ts:734`, `lib/parser/blocks/hotels.ts:765`). It gains an optional third field on its return object; it does not gain an `agg` parameter and does not emit. Existing callers that ignore the new field are unaffected — this is an additive return-shape change, not a signature change.

**P3 dedup.** `stripHotelNameConf` (`lib/parser/blocks/hotels.ts:600`) re-runs `splitHotelNameAddress` on a name already split by `buildInlineHotel` (`lib/parser/blocks/hotels.ts:734`/`lib/parser/blocks/hotels.ts:765`). At most ONE address warning is emitted per reservation: the stash is keyed per reservation and a second stash for the same reservation is dropped (last-write-wins is NOT used — first stash wins, so the earliest/most-specific split is reported).

### 3.2 Codes

| Predicate | Code | New? |
|---|---|---|
| P1, P2 | `HOTEL_GUEST_SPLIT_AMBIGUOUS` | No — reuses the existing code (`lib/messages/catalog.ts:1368`). Same field, same semantics, `blockRef.index` discriminates instances. |
| P3 | `HOTEL_ADDRESS_SPLIT_AMBIGUOUS` | **Yes** — one new code. |

Reusing the guest code for P1/P2 is deliberate: the existing catalog copy ("A hotel guest cell looked like several people glued together…", `lib/messages/catalog.ts:1374-1375`) describes the inline case as accurately as the structured one, and a second code would duplicate the entire §4 registration matrix for no operator-visible benefit.

---

## 4. Registration fan-out for `HOTEL_ADDRESS_SPLIT_AMBIGUOUS`

Every cell gets an action or an explicit N/A. Per the AGENTS.md three-lockstep rule, (a)(b)(c) land in ONE commit.

| # | Surface | Action |
|---|---|---|
| a | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2903` neighbourhood) | New catalog row: code, trigger prose, Doug-facing copy, crew-facing `—`, follow-up |
| b | `lib/messages/__generated__/spec-codes.ts` | Regenerate via `pnpm gen:spec-codes` — never hand-edit |
| c | `lib/messages/catalog.ts` | New entry mirroring `lib/messages/catalog.ts:1368-1381`: `dougFacing`, `crewFacing: null`, `followUp`, `helpfulContext`, `triggerContext`, `title`, `longExplanation`, `helpHref` |
| d | master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3194` block (`longExplanation` prose) | New line |
| e | `lib/parser/ambiguityCodes.ts:19` | Add to `AMBIGUITY_CODES` |
| f | `tests/parser/ambiguityCodes.test.ts:17` | Extend the expected sorted list |
| g | `lib/parser/dataGaps.ts:30` `GAP_CLASSES` | New row + label (required: `AMBIGUITY_CODES ⊆ GAP_CLASSES`, pinned `tests/parser/ambiguityCodes.test.ts:33`) |
| h | `tests/messages/warningCardCopyRegistry.ts:17`, `tests/messages/warningCardCopyRegistry.ts:65` | Add to the code list + `triggerContext` map |
| i | `app/help/errors/_families.ts:66` | Already routes the `HOTEL` prefix family — verify the new code lands there; extend the comment |
| j | `lib/parser/warnings.ts` | New `emitHotelAddressSplitAmbiguity`, sibling of `lib/parser/warnings.ts:212` |
| k | `lib/parser/blocks/hotels.ts:893` `TRANSFORM_SITES` | Flip both `deferred:` exempts to `{ site, code }` entries |
| l | `tests/parser/_metaTransformSitesWalker.test.ts:43` `REQUIRED_DECLARATIONS` | Add `HOTEL_ADDRESS_SPLIT_AMBIGUOUS` to the `hotels.ts` required list |
| m | `BACKLOG.md` | Delete both rows and the now-empty section heading |
| n | `lib/parser/types.ts` | New `parsed`/`replacement` variant + 2 new `resolvable:false` reasons (§6) |
| o | `lib/sync/useRawOverlay.ts:121` | New `applyReplacement` branch |
| p | `components/admin/UseRawControl.tsx` | New kind in `parsedFields` (`components/admin/UseRawControl.tsx:99`), `components/admin/UseRawControl.tsx:195`, `components/admin/UseRawControl.tsx:219`, `components/admin/UseRawControl.tsx:239`, `components/admin/UseRawControl.tsx:453`; 2 new `DISABLED_REASON` rows (`components/admin/UseRawControl.tsx:258`) |
| q | `tests/helpers/warningSurfaceFixture.ts:85` | Add a fixture warning for the new code |
| r | `lib/messages/__generated__/internal-code-enums.ts` | Generated — confirm regeneration covers it |

`m` is load-bearing: `tests/parser/_metaTransformSitesWalker.test.ts:119-138` asserts every `deferred:BL-<REF>` exempt has a matching BACKLOG.md row. Flipping the exempts (k) without deleting the rows leaves dead backlog entries; deleting the rows without flipping the exempts **fails the walker**. Both in one commit.

---

## 5. Emission plumbing

### 5.1 The problem

`parseInlineHotelRow` (`lib/parser/blocks/hotels.ts:531`), `parseHotelStaysRow` (`lib/parser/blocks/hotels.ts:543`), `buildInlineReservations` (`lib/parser/blocks/hotels.ts:563`) and `buildInlineHotel` (`lib/parser/blocks/hotels.ts:642`) take no `ParseAggregator`. Threading `agg` down to `buildInlineHotel` would emit **before** `cap()` runs (`lib/parser/blocks/hotels.ts:73`, `lib/parser/blocks/hotels.ts:77`), violating R4 — a reservation truncated by the cardinality cap would warn about a hotel the operator never sees.

### 5.2 The change: one commit point

```ts
type HotelAmbiguity =
  | { kind: "guests"; reasons: string[]; rawCell: string }
  | { kind: "address"; reason: string; rawCell: string };

type PendingHotel = { row: HotelReservationRow; ambiguities: HotelAmbiguity[] };

function commitHotels(pending: PendingHotel[], agg?: ParseAggregator): HotelReservationRow[];
```

`commitHotels` **replaces** `cap()` (`lib/parser/blocks/hotels.ts:92`) and absorbs the emit loop currently inlined in `parseHotelTable` (`lib/parser/blocks/hotels.ts:487-504`). It: emits `HOTEL_CARDINALITY_EXCEEDED` when `pending.length > MAX_HOTELS`; then for each surviving reservation at rank `< MAX_HOTELS`, emits its stashed ambiguities with `index` = final array position.

All three producers return `PendingHotel[]`. `parseHotels` calls `commitHotels` once per path (`lib/parser/blocks/hotels.ts:65`, `lib/parser/blocks/hotels.ts:73`, `lib/parser/blocks/hotels.ts:77`).

**Why this rather than threading `agg`:** it is the only shape that keeps the rank gate in ONE place. Today the gate is duplicated — `cap()` truncates at `lib/parser/blocks/hotels.ts:98`, and `parseHotelTable` independently re-derives "did this survive" via `result.length < MAX_HOTELS` at `lib/parser/blocks/hotels.ts:491`. Adding a third producer to that arrangement would mean a third copy. This is a targeted improvement to code the change already touches, not unrelated refactoring.

### 5.3 Invariant preserved

`tests/parser/blocks/hotels.ambiguity.test.ts:212` already pins "does NOT emit `HOTEL_GUEST_SPLIT_AMBIGUOUS` for the truncated over-cap hotel", and `tests/parser/blocks/hotels.ambiguity.test.ts:168` pins the at-cap boundary (the guard is strictly `>`, so exactly `MAX_HOTELS` hotels must NOT warn). Both must pass **unchanged** after the commit-point move, and a new sibling must assert the same two properties for the inline path.

---

## 6. Use-raw resolution matrix

| Warning | `resolution` | Rationale |
|---|---|---|
| Structured guests (existing) | `resolvable: true`, replacement `{kind:"hotels", names:[strippedRaw]}` | Unchanged (`lib/parser/warnings.ts:246-258`) |
| **Inline guests (P1/P2)** | `resolvable: false`, reason `"no-isolated-raw"` | R8. The raw cell interleaves hotel, address, dates, guests. There is no guest-only substring; swapping the whole cell into `names` would publish the hotel name and check-in dates as crew-readable "guest names". |
| **Address, P3(b) numeric-name split** | `resolvable: true`, new replacement `{kind:"hotel-name", hotelName: <full cleaned cell>, hotelAddress: null}` | A split DID happen, so undoing it is a real state change |
| **Address, P3(a) unsplit** | `resolvable: false`, reason `"no-split-to-undo"` | No split occurred; parsed value and raw value are byte-identical, so an enabled control would be a guaranteed no-op |

New type members in `lib/parser/types.ts` (union at `lib/parser/types.ts:36-46`):

```ts
parsed:      | { kind: "hotel-name"; hotelName: string | null; hotelAddress: string | null }
replacement: | { kind: "hotel-name"; hotelName: string; hotelAddress: null }
reason:      "empty-raw" | "invalid-dmy" | "no-isolated-raw" | "no-split-to-undo"
```

Widening `reason` is type-safe by construction: `DISABLED_REASON` (`components/admin/UseRawControl.tsx:258`) is a `Record` over the union, so a missing copy row is a **compile error**, not a runtime gap.

Copy for the two new disabled reasons (no em-dashes, per the mechanical UI gate):

- `no-isolated-raw` — "This hotel line mixes the hotel, the dates and the guests together, so there's no guest text on its own to swap in."
- `no-split-to-undo` — "We left this line exactly as your sheet has it, so there's nothing to swap back."

---

## 7. UI surface and gates

`components/admin/UseRawControl.tsx` is a UI surface under AGENTS.md invariant 8 and the ROUTING.md hard rule. Therefore:

- Implemented by Opus / Claude Code, never delegated to Codex.
- Ships only after **both** `/impeccable critique` AND `/impeccable audit` pass on the diff, P0/P1 fixed or explicitly deferred via `DEFERRED.md`.
- Pre-code mechanical checklist before writing the component change: em-dash ban in user-visible copy, apostrophe literals, 44px tap targets (`min-h-tap-min`), canonical type/token classes (`text-xs/relaxed`, `text-subtle`).

No new color token is introduced, so no contrast meta-test is required.

### 7.1 Dimensional Invariants

**None introduced.** The change adds label/value rows to an existing list rendered by `parsedFields` (`components/admin/UseRawControl.tsx:99`) and two `DISABLED_REASON` strings. It introduces no fixed-dimension parent and no new flex/grid parent-child relationship, so there is no parent→child dimension relationship to guarantee and no `items-stretch` / `h-full` / `self-stretch` obligation.

| Parent → child relationship | Introduced by this change? | Guarantee |
|---|---|---|
| (none) | No | N/A — no fixed-height or fixed-width parent is added, and no existing one gains a new flex/grid child |

Consequence for the plan: **no real-browser layout task is required.** Tailwind v4's non-default `align-items: stretch` cannot bite a change that adds no flex parent-child pair.

### 7.2 Transition Inventory

**No new states and no new edges.** The control's state machine is `legacy-unavailable` / `disabled` / `pending` / resolvable (`components/admin/UseRawControl.tsx:50`, `components/admin/UseRawControl.tsx:77-80`). This spec adds new *values* to the existing `disabled` reason set and a new parsed *kind* — neither is a state.

| From → To | Treatment | Changed here? |
|---|---|---|
| legacy-unavailable → disabled | instant — no animation needed | No |
| legacy-unavailable → pending | instant — no animation needed | No |
| legacy-unavailable → resolvable | instant — no animation needed | No |
| disabled → pending | instant — no animation needed | No |
| disabled → resolvable | instant — no animation needed | No |
| pending → resolvable | existing optimistic in-flight overlay (`components/admin/UseRawControl.tsx:79`) | No |

Compound transitions: the only compound case is a refresh delivering an unresolvable version of the same in-scope warning while `inFlight` is set. That is already handled by the guard-first ordering at `components/admin/UseRawControl.tsx:72-78` (Codex R8 F2), and the two new `resolvable:false` reasons enter through exactly that path — they add a reason value to a branch that already exists, so the compound case gains no new edge.

---

## 8. Test plan

TDD per task (invariant 1): failing test → minimal implementation → passing test → commit.

### 8.1 Emit unit tests (one per predicate)

Each asserts `severity === "warn"`, the exact `code`, `blockRef` shape, `rawSnippet`, the reason set, and the resolution discriminant.

- **P1** — cell with no dashes and no literal "check out" (the 2025-04 shape) → exactly one `HOTEL_GUEST_SPLIT_AMBIGUOUS`, reasons `["titlecase-pairing-fallback"]`, `resolution.resolvable === false`, `reason === "no-isolated-raw"`.
- **P2** — mixed-shape guests (`"Eric - 110525 John Smith - 103316"`) → reasons contain `"learn-k-shape-disagreement"`.
- **P3(a)** — `"Hyatt Place Chicago 71 Chicago, IL 60601"` → one `HOTEL_ADDRESS_SPLIT_AMBIGUOUS`, reason `"address-shape-unsplit"`, `resolvable: false`, `"no-split-to-undo"`.
- **P3(b)** — `"Hotel 71 71 E Wacker Dr Chicago, IL 60601"` → reason `"numeric-name-boundary"`, `resolvable: true`, replacement `hotelName` equals the full cleaned cell and `hotelAddress === null`.

### 8.2 Negative / no-spam tests (anti-tautology)

Derived from the real corpus, not invented:

- Each of the 8 quiet fixture shows (§9) parses with **zero** new warnings. Assertion extracts by code from `agg.warnings`, not by total count, so an unrelated new warning elsewhere cannot mask a regression.
- `"Four Seasons Fort Lauderdale"` (no ZIP, no number) → no address warning. Proves P3 is not "warn whenever address is null".
- A clean structured cell → still exactly one warning path, no double-emit from the commit-point refactor.

### 8.3 Failure modes each test catches

| Test | Catches |
|---|---|
| P1 emit | Pattern 3 firing silently — the live 2025-04 bug |
| P2 emit | learn-K fall-through being treated as a confident parse |
| P3(a) emit | Suffixless address glued into the name with no signal |
| P3(b) emit + replacement equality | An "undo" that does not actually restore the pre-split value |
| Rank gate (inline) | A cap-truncated inline reservation warning about an invisible hotel (R4) |
| Corpus zero-warning | Predicate over-firing — the crying-wolf failure |
| `DISABLED_REASON` exhaustiveness | A new reason shipping with no operator copy |

### 8.4 Guard conditions

| Input | Behavior |
|---|---|
| `splitHotelNameAddress(null)` | `{name: null, address: null}`, no ambiguity field (existing `lib/parser/blocks/hotels.ts:265`) |
| `combined` cleans to `""` | `{name: null, address: null}`, no ambiguity (existing `lib/parser/blocks/hotels.ts:271`) |
| Inline cell with zero guests | No guest warning; address predicate still evaluated |
| Reservation whose `hotel_name` is null at emit time | `blockRef.name` key **omitted**, never `undefined` (`exactOptionalPropertyTypes`; mirrors `lib/parser/warnings.ts:234-241`) |
| >`MAX_HOTELS` inline reservations | Ranks ≥ `MAX_HOTELS` stash but never emit (R4) |
| Both P1 and P2 fire on one cell | ONE warning, `reasons` length 2 |
| P3(a) and P3(b) on one reservation | Mutually exclusive by construction (a requires regex miss, b requires match) |

### 8.5 Full gates before push

`pnpm test` (full suite, not scoped), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm spec:lint` on this document. Real CI green is a separate gate from local green.

---

## 9. Corpus expectations (normative golden)

Measured by probe over all **10** fixture shows in `fixtures/shows/raw/` on 2026-07-25 at branch base `d62d620e8`. A test pins this table; changing it requires updating this section in the same commit.

| Show | Guest card | Address card | Why |
|---|---|---|---|
| 2025-04-asset-mgmt-cfo-coo | **Yes** (P1) | No | Pattern 3 produced `["Four Seasons","Chicago Eric","Jeffrey Justice"]` |
| 2025-05-redefining-fixed-income | **Yes** (P1) | No | Pattern 3; currently correct but fragile |
| 2024-05-east-coast-family-office | No | No | learn-K consistent, clean peel |
| 2025-03-dci-rpas-central | No | No | Pattern 1 matched |
| 2025-06-ria-investment-forum | No | No | Pattern 2 matched |
| 2025-10-fixed-income-trading-summit | No | No | Structured, clean |
| 2025-10-consultants-roundtable | No | No | No hotel reservations parsed |
| 2026-03-rpas-central-four-seasons | No | No | Structured, clean |
| 2026-04-asset-mgmt-cfo-coo-waldorf | No | No | Structured, clean |
| 2026-05-fintech-forum-cto-summit | No | No | Structured, clean |

**Totals: 2 guest cards, 0 address cards across 10 shows.**

Zero address cards is expected and accepted (R7): no fixture hotel has a suffixless address, and no fixture hotel name contains a digit. P3 is forward-looking coverage. Its two synthetic emit tests (§8.1) are what prove it works; the corpus proves it does not over-fire.

---

## 10. Numeric single-source

Every count in this document derives from one of these; later sections reference, never restate:

- `MAX_HOTELS` = **4** (`lib/parser/blocks/hotels.ts:47`)
- Fixture shows = **10** (`fixtures/shows/raw/*.md`)
- New message codes = **1** (`HOTEL_ADDRESS_SPLIT_AMBIGUOUS`)
- New predicates = **3** (P1, P2, P3 — P3 has 2 reasons)
- New `resolvable:false` reasons = **2**
- New replacement kinds = **1** (`hotel-name`)
- Registration surfaces = **18** (§4 rows a–r)
- Expected corpus cards = **2** guest, **0** address (§9)

---

## 11. Out of scope

- **Fixing** the 2025-04 mis-parse. This spec makes it visible; changing the extraction is a separate, riskier change with its own corpus regression surface.
- Wiring `STREET_ADDRESS_ZIP_RE` into `splitHotelNameAddress` (R1).
- Persisting confirmation numbers (R2).
- Reintroducing any hand-edit path for `hotel_name`/`hotel_address` (R5).
- A distinct code for inline vs structured guest ambiguity (§3.2).
- Any change to the structured path's existing emit behavior beyond relocating its rank gate into `commitHotels` (§5.2).
