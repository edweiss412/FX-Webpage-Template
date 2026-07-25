# Hotel ambiguity coverage (2026-07-25)

**Status:** Draft → self-review → adversarial review R1 (BLOCKING, repaired) → R2
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

| #  | Decision | Ratification |
| -- | -------- | ------------ |
| R1 | `splitHotelNameAddress` stays **suffix-only**; `STREET_ADDRESS_ZIP_RE` is NOT wired into the split decision. A numeric hotel brand ("Hotel 71 Chicago, IL 60601") must never be corrupted. This spec adds warnings at that boundary, never a behavior change. | `lib/parser/blocks/hotelConfTokens.ts:24-27` (Codex R5) |
| R2 | Confirmation numbers are parsed but **never persisted** (`confirmation_no: null` on every row). No conf# may reach a crew-readable field. | `lib/parser/blocks/hotels.ts:126-132`, `lib/parser/blocks/hotels.ts:864-867` |
| R3 | Ambiguity warnings are `severity:"warn"`, **never block publish, never mark a rescan dirty**. | `lib/parser/ambiguityCodes.ts:2-6`; `lib/admin/step3Buckets.ts:65-69` |
| R4 | A cap-truncated reservation must **never** emit an ambiguity warning. | `lib/parser/blocks/hotels.ts:487-491` (Codex R5) |
| R5 | Admin **field overrides were deliberately removed**; `hotel_name`/`hotel_address` were 2 of the 6 removed fields. No hand-edit path exists and this spec does not add one. | `docs/superpowers/specs/admin/2026-07-10-remove-admin-field-overrides.md:12`, `docs/superpowers/specs/admin/2026-07-10-remove-admin-field-overrides.md:164` |
| R6 | `AGENDA_DAY_AMBIGUOUS` is deliberately NOT in `AMBIGUITY_CODES`. Membership is semantic. | `lib/parser/ambiguityCodes.ts:8-13` |
| R7 | The address code covers a no-split-but-address-shaped case AND an ambiguous-boundary case. P3 firing zero times on the current corpus is accepted forward-looking coverage. | This document, §9 |
| R8 | Inline guest warnings ship `resolvable:false` **unless** the emitting path isolated a guest-only substring; see §6. | This document, §6 |

**Amendments applied after adversarial review R1** (do not re-derive; these ARE the repairs):

- **R7 amended.** The original P3(b) predicate ("split happened and the resulting name contains a digit") was **wrong in both directions** and is withdrawn. Probe-verified: `"Hotel 71 71 E Wacker Dr Chicago, IL 60601"` splits **correctly** to name `"Hotel 71"` (the old predicate would warn on correct data and offer an undo that degrades it), while `"Hotel 71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601"` **corrupts** the name to `"Hotel"` yet contains no digit (the old predicate stayed silent). Replaced by the candidate-count predicate in §3.1 P3(b).
- **R8 amended.** The original blanket `no-isolated-raw` rationale was **factually false** for the 2025-05 corpus row, where Pattern 3 does isolate a guest-only substring after `Check Out: 5/15`. Resolution is now per-path (§6), and the reason string is only used where it is true.

---

## 2. Current behavior (verified)

### 2.1 The two guest paths

| Path | Entry | Judgment | Warns today |
| ---- | ----- | -------- | ----------- |
| **Structured** (v4 / newer v2) | `parseGuestCell` (`lib/parser/blocks/hotels.ts:162`) | where one guest ends and the next begins, inside a cell already known to be guests-only | **Yes** — `HOTEL_GUEST_SPLIT_AMBIGUOUS` via `emitHotelGuestSplitAmbiguity` (`lib/parser/warnings.ts:212`) |
| **Inline** (v1 "Hotel Stays", older v2 "Hotel Reservations") | `buildInlineHotel` (`lib/parser/blocks/hotels.ts:642`) | where the hotel name ends, where the address starts, AND where each guest begins — all in one unlabeled run | **No** |

### 2.2 Inline sub-paths inside `buildInlineHotel`

1. **learn-K peel** (`lib/parser/blocks/hotels.ts:696-747`) — with ≥2 confirmation delimiters, learn the first guest's base-word count `k` from the **later** guests (`later`, `lib/parser/blocks/hotels.ts:706`), then peel `k` words off segment 0. Applied only when `consistent` (`lib/parser/blocks/hotels.ts:716`).
2. **No-guest split** (`lib/parser/blocks/hotels.ts:756-778`).
3. **Legacy Patterns 1/2/3** (`lib/parser/blocks/hotels.ts:783-819`) — dash-name (`lib/parser/blocks/hotels.ts:784`), multi-dash (`lib/parser/blocks/hotels.ts:792`), **title-case pairing** (`lib/parser/blocks/hotels.ts:802-819`). Pattern 3 is the weakest: it cannot tell a three-word person from two people, and when the cell has no literal "check out" the strip is a no-op so it pairs across the **entire** cell including the hotel name. That is the mechanism behind §1.

**`consistent` is trivially true for a single later guest.** Probe-verified: `"Hyatt Regency Eric - 110525 John Smith - 103316"` yields `later === ["John Smith"]`, so `counts === [2]` and `consistent === true`; learn-K peels 2 words and produces `hotel_name:"Hyatt"`, `names:["Regency Eric","John Smith"]` — a live mis-parse. A `k` learned from ONE sample is a guess with no corroboration. This drives P2 (§3.1).

### 2.3 `splitHotelNameAddress`

`lib/parser/blocks/hotels.ts:261`. Locates the boundary with `STREET_ADDRESS_RE` (`lib/parser/blocks/hotelConfTokens.ts:14`), suffix-anchored, taking the **first** match (`lib/parser/blocks/hotels.ts:277`). On no match it returns the whole cleaned string as `name` with `address: null` (`lib/parser/blocks/hotels.ts:278`) — a deliberately SAFE fallback.

`STREET_ADDRESS_ZIP_RE` (`lib/parser/blocks/hotelConfTokens.ts:20`) recognizes a **suffixless** street by its `, <ST> <ZIP>` tail. It is used by `looksLikeStreetStart` (`lib/parser/blocks/hotelConfTokens.ts:28`) but deliberately not to split (R1). **It is currently module-private and MUST be exported** for P3(a) to consume it (§4 row t).

Because the splitter takes the FIRST match, a cell containing **two** street-phrase candidates splits at the earlier one, which can swallow part of the address into neither field or truncate the name. Probe-verified corruption: `"Hotel 71 Wacker Drive 71 E Wacker Dr …"` → name `"Hotel"`. This drives P3(b).

---

## 3. New emission sites

### 3.1 Predicates (normative)

Four predicate rows across three sites (P3 has two disjoint arms). Each is pure; none changes a parsed value.

| ID | Site | Fires when | Reason string |
| -- | ---- | ---------- | ------------- |
| **P1** | `buildInlineHotel`, Pattern 3 (`lib/parser/blocks/hotels.ts:802-819`) | Patterns 1 and 2 both produced zero names, AND Pattern 3 produced ≥1 name, **AND the scanned region contains no explicit guest delimiter** — no `/` separator and no `guests?:` label (case-insensitive) | `"titlecase-pairing-fallback"` |
| **P2** | `buildInlineHotel`, learn-K (`lib/parser/blocks/hotels.ts:696-747`) | `delims.length >= 2` AND **any** of: (i) `!consistent` (`lib/parser/blocks/hotels.ts:716`); (ii) `later.length < 2` — `k` learned from a single uncorroborated sample; (iii) the `names.length >= 2 && hotelPart.length > 0` guard at `lib/parser/blocks/hotels.ts:733` fails | `"learn-k-shape-disagreement"` |
| **P3(a)** | `splitHotelNameAddress` (`lib/parser/blocks/hotels.ts:261`) | `STREET_ADDRESS_RE` misses AND `STREET_ADDRESS_ZIP_RE` matches the cleaned string | `"address-shape-unsplit"` |
| **P3(b)** | `splitHotelNameAddress` (`lib/parser/blocks/hotels.ts:261`) | `STREET_ADDRESS_RE` matches at **more than one index** in the cleaned string (global-flag match count > 1) — the split point was a choice among candidates, not a determination | `"multiple-street-candidates"` |

**P1's delimiter exclusion** closes a crying-wolf case: probe-verified, `"Hyatt Place 123 Main St Check In: 5/1 Check Out: 5/2 Guests: Eric Weiss / John Smith"` parses **correctly** to `["Eric Weiss","John Smith"]`; the `/` and the `Guests:` label make the boundary explicit, so no judgment was made and no warning is owed.

**P3(b)'s candidate count** is the corrected predicate (R7 amendment). Probe-verified separation over the cleaned strings of all 9 distinct corpus hotels plus both synthetic cases:

| Input | Candidates | Fires |
| ----- | ---------- | ----- |
| `Hotel 71 71 E Wacker Dr Chicago, IL 60601` (correct split) | 1 | No |
| `Hotel 71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601` (corrupts to "Hotel") | **2** | **Yes** |
| All 7 distinct corpus hotel strings (§9) | 1 each | No |

P1 and P2 are mutually reachable in one cell and both stash; the emitter collapses them to ONE warning per reservation carrying both reasons (mirrors `parseGuestCell`'s `reasons: string[]`, `lib/parser/blocks/hotels.ts:178`).

**P3 purity.** `splitHotelNameAddress` gains an optional field on its return object; it does not gain an `agg` parameter and does not emit. Additive return-shape change — the 5 existing callers (`lib/parser/blocks/hotels.ts:413`, `lib/parser/blocks/hotels.ts:418`, `lib/parser/blocks/hotels.ts:607`, `lib/parser/blocks/hotels.ts:734`, `lib/parser/blocks/hotels.ts:765`) are unaffected.

**P3 is NOT mutually exclusive per reservation** (R1 finding 9). `stripHotelNameConf` (`lib/parser/blocks/hotels.ts:600`) re-invokes the splitter at `lib/parser/blocks/hotels.ts:607` on a name already split at `lib/parser/blocks/hotels.ts:734`/`lib/parser/blocks/hotels.ts:765`, so one reservation can produce P3(b) on the first call and P3(a) on the second. The predicates are exclusive **per invocation only**. At most ONE address warning is emitted per reservation: **first stash wins**, later stashes for the same reservation are dropped.

### 3.2 Codes

| Predicate | Code | New? |
| --------- | ---- | ---- |
| P1, P2 | `HOTEL_GUEST_SPLIT_AMBIGUOUS` | No — reuses the existing code (`lib/messages/catalog.ts:1368`). `blockRef.index` discriminates instances. |
| P3(a), P3(b) | `HOTEL_ADDRESS_SPLIT_AMBIGUOUS` | **Yes** — one new code. |

---

## 4. Registration fan-out for `HOTEL_ADDRESS_SPLIT_AMBIGUOUS`

Every cell gets an action or an explicit N/A. Per the AGENTS.md three-lockstep rule, (a)(b)(c) land in ONE commit.

| # | Surface | Action |
| - | ------- | ------ |
| a | master spec §12.4 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2903` region) | New catalog row |
| b | `lib/messages/__generated__/spec-codes.ts` | Regenerate via `pnpm gen:spec-codes`; never hand-edit |
| c | `lib/messages/catalog.ts` | New entry mirroring `lib/messages/catalog.ts:1368-1381` (all 8 fields) |
| d | master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3194` block | New `longExplanation` line |
| e | `lib/parser/ambiguityCodes.ts:19` | Add to `AMBIGUITY_CODES` |
| f | `tests/parser/ambiguityCodes.test.ts:17` | Extend the expected sorted list |
| g | `lib/parser/dataGaps.ts:30` `GAP_CLASSES` | New row + label |
| h | `tests/messages/warningCardCopyRegistry.ts:17`, `tests/messages/warningCardCopyRegistry.ts:65` | Code list + `triggerContext` map |
| i | `app/help/errors/_families.ts:66` | Verify the `HOTEL` prefix family covers it; extend the comment |
| j | `lib/parser/warnings.ts` | New `emitHotelAddressSplitAmbiguity`, sibling of `lib/parser/warnings.ts:212` |
| k | `lib/parser/blocks/hotels.ts:893` `TRANSFORM_SITES` | Flip both `deferred:` exempts to `{ site, code }` |
| l | `tests/parser/_metaTransformSitesWalker.test.ts:43` | Add the code to the `hotels.ts` required list |
| m | `BACKLOG.md` | Delete both rows + the now-empty section heading |
| n | `lib/parser/types.ts:36-46` | New `parsed`/`replacement` variant + new `resolvable:false` reasons (§6) |
| o | `lib/sync/useRawOverlay.ts:81` | New `applyReplacement` branch |
| **p** | `lib/sync/useRawOverlay.ts:24` `USE_RAW_CODES` | **Add the code.** Without it `IN_SCOPE` (`lib/sync/useRawOverlay.ts:49`) excludes it, normalization drops persisted decisions, and `findLiveResolvableWarning` treats it as out of scope |
| q | `components/admin/UseRawControl.tsx` | `parsedFields` (`components/admin/UseRawControl.tsx:99`), `components/admin/UseRawControl.tsx:195`, `components/admin/UseRawControl.tsx:219`, `components/admin/UseRawControl.tsx:239`, `components/admin/UseRawControl.tsx:453`; new `DISABLED_REASON` rows (`components/admin/UseRawControl.tsx:258`) |
| **r** | `components/admin/UseRawControl.tsx:54` `IN_SCOPE` | **Add the code.** Separate UI allowlist — without it BOTH the resolvable and disabled address controls render nothing |
| **s** | `components/admin/UseRawControl.tsx:10` `RADIOGROUP_LABEL` | **Exhaustive `Record` over `parsed["kind"]`** — the new kind is a compile error until added |
| **t** | `lib/parser/blocks/hotelConfTokens.ts:20` | **Export `STREET_ADDRESS_ZIP_RE`** (currently module-private; P3(a) cannot import it) |
| **u** | `tests/parser/dataGaps.test.ts:44` | `DATA_GAP_CODES.size` asserted `=== 33` → **34** |
| **v** | `tests/parser/dataGapsClassCompleteness.test.ts:205`, `tests/parser/dataGapsClassCompleteness.test.ts:209` | `DATA_GAP_CODES.size` 33 → **34**; `ALL_PERSISTED_WARNING_CODES.size` 53 → **54**; plus the doc comment `tests/parser/dataGapsClassCompleteness.test.ts:36` and the test NAME at `tests/parser/dataGapsClassCompleteness.test.ts:204` which embeds "total 53 (33/7/2/11)" |
| **w** | `tests/messages/warningCardCopyRegistry.ts:121` `EXPECTED_CORPUS_WARN_CODES` | The two new corpus guest emissions (§9) change the expected corpus warn-code set |
| **x** | `tests/components/UseRawControl.test.tsx:746` | Hard-coded component expectations touched by the new parsed kind |
| **y** | `tests/messages/_metaWarningCardCopy.test.ts` | New code needs title + condensed `helpfulContext` + `triggerContext` |
| **z** | `tests/messages/_metaCatalogCopyHygiene.test.ts` | New copy must not leak code names / regex fragments |
| **aa** | `tests/messages/_metaErrorCatalogDocs.test.ts` | New code must satisfy the shared catalog-field validator |
| **bb** | `tests/messages/_metaPopoverContextCoverage.test.ts` | Fails-by-default popover coverage gate |
| **cc** | `lib/parser/dataGaps.ts:370` `OPERATOR_ACTIONABLE_ANCHORED` | **N/A — do NOT add.** `HOTEL_GUEST_SPLIT_AMBIGUOUS` is absent from this set (verified); ambiguity codes are spot-check, not anchored-actionable. Recorded so a reviewer does not re-derive it. |

Row `m` is load-bearing: `tests/parser/_metaTransformSitesWalker.test.ts:119-138` asserts every `deferred:BL-<REF>` exempt has a matching BACKLOG.md row. Flipping the exempts without deleting the rows leaves dead entries; deleting without flipping **fails the walker**. Both in one commit.

---

## 5. Emission plumbing

### 5.1 The problem

`parseInlineHotelRow` (`lib/parser/blocks/hotels.ts:531`), `parseHotelStaysRow` (`lib/parser/blocks/hotels.ts:543`), `buildInlineReservations` (`lib/parser/blocks/hotels.ts:563`) and `buildInlineHotel` (`lib/parser/blocks/hotels.ts:642`) take no `ParseAggregator`. Threading `agg` down would emit **before** `cap()` runs (`lib/parser/blocks/hotels.ts:73`, `lib/parser/blocks/hotels.ts:77`), violating R4.

### 5.2 The change: one commit point

```ts
type HotelAmbiguity =
  | { kind: "guests"; reasons: string[]; rawCell: string }
  | { kind: "address"; reason: string; rawCell: string };

type PendingHotel = { row: HotelReservationRow; ambiguities: HotelAmbiguity[] };

function commitHotels(pending: PendingHotel[], agg?: ParseAggregator): HotelReservationRow[];
```

`commitHotels` replaces `cap()` (`lib/parser/blocks/hotels.ts:92`) and absorbs the emit loop inlined in `parseHotelTable` (`lib/parser/blocks/hotels.ts:487-504`). All three producers return `PendingHotel[]`; `parseHotels` calls it once per path (`lib/parser/blocks/hotels.ts:65`, `lib/parser/blocks/hotels.ts:73`, `lib/parser/blocks/hotels.ts:77`).

**Emission order is preserved exactly** (R1 finding 8). Today, with an over-cap structured parse, the per-hotel guest ambiguity is pushed inside `parseHotelTable` (`lib/parser/blocks/hotels.ts:491-504`) **before** `cap()` emits `HOTEL_CARDINALITY_EXCEEDED` (`lib/parser/blocks/hotels.ts:97`). `commitHotels` MUST emit in the same order: **all surviving-reservation ambiguities first, then the cardinality warning.** Persisted and rendered warning order is observable; a code-filtering test cannot detect a regression here, so §8.2 pins order explicitly.

**Why this shape:** the rank gate exists in two places today — `cap()` truncates at `lib/parser/blocks/hotels.ts:98` and `parseHotelTable` independently re-derives survival via `result.length < MAX_HOTELS` at `lib/parser/blocks/hotels.ts:491`. A third producer would mean a third copy.

### 5.3 `blockRef.index` contract

`index` is the reservation's position in the **final** hotels array — the anchor `applyReplacement` uses (`lib/sync/useRawOverlay.ts:122-127`). It is **not** `ordinal` and **not** the pre-filter slot position. Slots without a resolved `hotel_name` are skipped (`lib/parser/blocks/hotels.ts:486`), so a surviving reservation's final index can differ from its ordinal. §8.1 pins this with a non-zero index case.

---

## 6. Use-raw resolution matrix

| Warning | `resolution` | Rationale |
| ------- | ------------ | --------- |
| Structured guests (existing) | `resolvable: true`, `{kind:"hotels", names:[strippedRaw]}` | Unchanged (`lib/parser/warnings.ts:246-258`) |
| **P1 where Pattern 3's checkout strip isolated a guest region** (`lib/parser/blocks/hotels.ts:803`, non-empty `postCheckout`) | `resolvable: true`, `{kind:"hotels", names:[<isolated region, conf-stripped>]}` | R8 amendment. A guest-only substring demonstrably exists — the 2025-05 corpus row is exactly this case. Claiming otherwise would ship false operator copy. |
| **P1 with no isolated region / P2** | `resolvable: false`, reason `"no-isolated-raw"` | True here: the scanned text is the whole cell, interleaving hotel, address, dates and guests. Swapping it into `names` would publish the hotel name and check-in dates as crew-readable guest names. |
| **P3(b)** multiple candidates | `resolvable: true`, `{kind:"hotel-name", hotelName: <full cleaned cell>, hotelAddress: null}` | A split happened at a chosen candidate; undoing it restores the unsplit cell — a real state change, proven behaviorally in §8.1 |
| **P3(a)** unsplit | `resolvable: false`, reason `"no-split-to-undo"` | No split occurred; parsed and raw are byte-identical, so an enabled control would be a guaranteed no-op |

New members in `lib/parser/types.ts:36-46`:

```ts
parsed:      | { kind: "hotel-name"; hotelName: string | null; hotelAddress: string | null }
replacement: | { kind: "hotel-name"; hotelName: string; hotelAddress: null }
reason:      "empty-raw" | "invalid-dmy" | "no-isolated-raw" | "no-split-to-undo"
```

Widening `reason` is type-safe by construction: `DISABLED_REASON` (`components/admin/UseRawControl.tsx:258`) is a `Record` over the union, so a missing copy row is a **compile error**. Same for `RADIOGROUP_LABEL` (`components/admin/UseRawControl.tsx:10`) over `parsed["kind"]`.

Copy for the new disabled reasons (no em-dashes; straight apostrophes to match the existing siblings at `components/admin/UseRawControl.tsx:259-260`):

- `no-isolated-raw` — "This hotel line mixes the hotel, the dates and the guests together, so there's no guest text on its own to swap in."
- `no-split-to-undo` — "We left this line exactly as your sheet has it, so there's nothing to swap back."

---

## 7. UI surface and gates

`components/admin/UseRawControl.tsx` is a UI surface under AGENTS.md invariant 8 and the ROUTING.md hard rule: implemented by Opus, and shipped only after **both** `/impeccable critique` and `/impeccable audit` pass, P0/P1 fixed or deferred via `DEFERRED.md`.

Pre-code mechanical checklist: em-dash ban in user-visible copy, apostrophe literals, 44px tap targets (`min-h-tap-min`), canonical type/token classes. No new color token, so no contrast meta-test.

### 7.1 Dimensional Invariants

**None introduced.** The change adds label/value rows to the existing list rendered by `parsedFields` (`components/admin/UseRawControl.tsx:99`) plus `DISABLED_REASON` / `RADIOGROUP_LABEL` entries.

| Parent → child relationship | Introduced? | Guarantee |
| --------------------------- | ----------- | --------- |
| (none) | No | N/A — no fixed-dimension parent added, no existing one gains a new flex/grid child |

Consequence: **no real-browser layout task is required.** Tailwind v4's non-default `align-items: stretch` cannot bite a change that adds no flex parent-child pair.

### 7.2 Transition Inventory

**No new states, no new edges.** States: `legacy-unavailable` / `disabled` / `pending` / resolvable (`components/admin/UseRawControl.tsx:50`, `components/admin/UseRawControl.tsx:77-80`). This spec adds new *values* to the existing `disabled` reason set and a new parsed *kind* — neither is a state.

| From → To | Treatment | Changed? |
| --------- | --------- | -------- |
| legacy-unavailable → disabled | instant — no animation needed | No |
| legacy-unavailable → pending | instant — no animation needed | No |
| legacy-unavailable → resolvable | instant — no animation needed | No |
| disabled → pending | instant — no animation needed | No |
| disabled → resolvable | instant — no animation needed | No |
| pending → resolvable | existing optimistic in-flight overlay (`components/admin/UseRawControl.tsx:79`) | No |

Compound: a refresh delivering an unresolvable version of the same in-scope warning while `inFlight` is set, already handled by guard-first ordering at `components/admin/UseRawControl.tsx:72-78` (Codex R8 F2). The new reasons enter through that existing branch and add no edge.

---

## 8. Test plan

TDD per task (invariant 1): failing test → minimal implementation → passing test → commit.

### 8.1 Emit + behavior tests

| Test | Input | Asserts |
| ---- | ----- | ------- |
| P1 fires | 2025-04 shape (no dashes, no literal "check out") | one `HOTEL_GUEST_SPLIT_AMBIGUOUS`, reasons `["titlecase-pairing-fallback"]` |
| **P1 stays quiet on explicit delimiters** | `Hyatt Place 123 Main St Check In: 5/1 Check Out: 5/2 Guests: Eric Weiss / John Smith` | **zero** guest warnings; names still `["Eric Weiss","John Smith"]` |
| **P2 fires on single-sample k** | `Hyatt Regency Eric - 110525 John Smith - 103316` | reasons contain `"learn-k-shape-disagreement"`. Catches R1 finding 1 — this input is a live mis-parse (`hotel_name:"Hyatt"`, `names:["Regency Eric",…]`) that the pre-repair predicate missed |
| P2 fires on `!consistent` | mixed base-word counts across ≥2 later guests | same reason |
| P2 quiet when corroborated | east-coast fixture (2 later guests, both 1 base word) | zero guest warnings |
| **P3(b) quiet on a correct split** | `Hotel 71 71 E Wacker Dr Chicago, IL 60601` | **zero** address warnings; split still `{name:"Hotel 71", address:"71 E Wacker Dr …"}`. Catches R1 finding 2 |
| **P3(b) fires on the corruption** | `Hotel 71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601` | one warning, reason `"multiple-street-candidates"`, `resolvable:true` |
| P3(a) fires | `Hyatt Place Chicago 71 Chicago, IL 60601` | reason `"address-shape-unsplit"`, `resolvable:false`, `"no-split-to-undo"` |
| **P3(b) undo is behaviorally applied** | emit P3(b), then run `applyUseRawDecisions` with a "use raw" decision | the resulting `hotelReservations[i].hotel_name` equals the full cleaned cell AND `hotel_address === null`. Catches R1 finding 4: a payload-only assertion passes even if the `hotel-name` branch in `applyReplacement` is missing or misrouted |
| **`blockRef.index` at a non-zero index** | structured parse where reservation #1 is a dash-only placeholder (skipped at `lib/parser/blocks/hotels.ts:486`) and #2 warns | emitted `index === 0`, and `applyUseRawDecisions` rewrites reservation #2 and **no other row**. Catches R1 finding 5: ordinal-vs-final-index drift |
| **Emission order** | 5 structured hotels, ambiguity on #1 | the guest ambiguity appears **before** `HOTEL_CARDINALITY_EXCEEDED` in `agg.warnings`, asserted by index not by code filter. Catches R1 finding 8 |
| Rank gate, inline | >`MAX_HOTELS` inline reservations, ambiguity on the last | zero warnings for the truncated row (R4) |

Existing tests that must pass **unchanged**: `tests/parser/blocks/hotels.ambiguity.test.ts:212` (over-cap hotel stays silent) and `tests/parser/blocks/hotels.ambiguity.test.ts:168` (at-cap boundary, guard is strictly `>`).

### 8.2 Negative / no-spam tests

- Each of the 8 quiet fixture shows (§9) parses with **zero** new warnings, extracted **by code** from `agg.warnings` so an unrelated warning cannot mask a regression.
- `"Four Seasons Fort Lauderdale"` (no ZIP, no number) → no address warning. Proves P3 is not "warn whenever address is null".
- A clean structured cell → exactly one warning path, no double-emit from the commit-point refactor.

### 8.3 Guard conditions

| Input | Behavior |
| ----- | -------- |
| `splitHotelNameAddress(null)` | `{name:null,address:null}`, no ambiguity (`lib/parser/blocks/hotels.ts:265`) |
| `combined` cleans to `""` | `{name:null,address:null}`, no ambiguity (`lib/parser/blocks/hotels.ts:271`) |
| Inline cell with zero guests | No guest warning; address predicate still evaluated |
| Reservation whose `hotel_name` is null at emit | `blockRef.name` key **omitted**, never `undefined` (`exactOptionalPropertyTypes`; `lib/parser/warnings.ts:234-241`) |
| Both P1 and P2 fire | ONE warning, `reasons` length 2 |
| P3(a) and P3(b) across two invocations on one reservation | First stash wins; exactly one address warning. **Not** mutually exclusive per reservation (§3.1) |

### 8.4 Full gates before push

`pnpm test` (full suite, not scoped), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm spec:lint`. Real CI green is a separate gate from local green.

---

## 9. Corpus expectations (normative golden)

Probe over all **10** fixture shows in `fixtures/shows/raw/` on 2026-07-25 at branch base `d62d620e8`. A test pins this table; changing it requires updating this section in the same commit. Fixture names are exact basenames minus `.md`.

| Fixture basename | Guest card | Address card | Why |
| ---------------- | ---------- | ------------ | --- |
| `2025-04-asset-mgmt-cfo-coo` | **Yes** (P1) | No | Pattern 3 produced `["Four Seasons","Chicago Eric","Jeffrey Justice"]` |
| `2025-05-redefining-fixed-income-private-credit` | **Yes** (P1) | No | Pattern 3; currently correct but fragile |
| `2024-05-east-coast-family-office` | No | No | learn-K with 2 corroborating later guests |
| `2025-03-dci-rpas-central` | No | No | Pattern 1 matched |
| `2025-06-ria-investment-forum` | No | No | Pattern 2 matched |
| `2025-10-fixed-income-trading-summit` | No | No | Structured, clean |
| `2025-10-consultants-roundtable` | No | No | No hotel reservations parsed |
| `2026-03-rpas-central-four-seasons` | No | No | Structured, clean |
| `2026-04-asset-mgmt-cfo-coo-waldorf` | No | No | Structured, clean |
| `2026-05-fintech-forum-cto-summit` | No | No | Structured, clean |

**Totals: 2 guest cards, 0 address cards across 10 shows.**

Zero address cards is expected and accepted (R7): every corpus hotel string yields exactly 1 street-phrase candidate (§3.1), and none is suffixless. P3 is forward-looking; its synthetic emit tests (§8.1) prove it works and the corpus proves it does not over-fire.

---

## 10. Numeric single-source

- `MAX_HOTELS` = **4** (`lib/parser/blocks/hotels.ts:47`)
- Fixture shows = **10**
- New message codes = **1**
- Predicates = **4** rows (P1, P2, P3a, P3b)
- New `resolvable:false` reasons = **2**
- New replacement kinds = **1** (`hotel-name`)
- Registration surfaces = **29** (§4 rows a–cc, of which 1 is an explicit N/A)
- Expected corpus cards = **2** guest, **0** address (§9)
- Gap-class counts after this change: `DATA_GAP_CODES` **34**, `ALL_PERSISTED_WARNING_CODES` **54**

---

## 11. Out of scope

- **Fixing** the 2025-04 mis-parse, or the `"Hyatt Regency Eric - …"` learn-K mis-parse found in R1. This spec makes both visible; changing the extraction is a separate change with its own corpus regression surface.
- Wiring `STREET_ADDRESS_ZIP_RE` into the split decision (R1). Exporting it for read-only predicate use (§4 row t) is NOT a behavior change.
- Persisting confirmation numbers (R2).
- Reintroducing a hand-edit path for `hotel_name`/`hotel_address` (R5).
- A distinct code for inline vs structured guest ambiguity (§3.2).
- Any change to the structured path's emit behavior beyond relocating its rank gate into `commitHotels`, with order preserved (§5.2).
