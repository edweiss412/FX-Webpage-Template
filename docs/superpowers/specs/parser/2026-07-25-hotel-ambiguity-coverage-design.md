# Hotel ambiguity coverage (2026-07-25)

**Status:** Draft → self-review → adversarial review R1–R5 (all BLOCKING, all repaired) → R6 pending
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
| R8 | Inline guest warnings **always** ship `resolvable:false`, reason `"raw-not-guest-scoped"`. No exception. | This document, §6 |

**Amendments applied after adversarial review R1** (do not re-derive; these ARE the repairs):

- **R7 amended.** The original P3(b) predicate ("split happened and the resulting name contains a digit") was **wrong in both directions** and is withdrawn. Probe-verified: `"Hotel 71 71 E Wacker Dr Chicago, IL 60601"` splits **correctly** to name `"Hotel 71"` (the old predicate would warn on correct data and offer an undo that degrades it), while `"Hotel 71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601"` **corrupts** the name to `"Hotel"` yet contains no digit (the old predicate stayed silent). Replaced by the candidate-count predicate in §3.1 P3(b).
- **R8 amended, then restored (R2 finding 4).** An R1 repair briefly made P1 resolvable where Pattern 3's checkout strip "isolated" a guest region. R2 refuted it: the strip is positional, not semantic, so the region can contain note text, and accepting the fix would hide a crew member's lodging from their own page. R8 is back to a blanket `resolvable:false`, with a reason string that is true in every case (§6).
- **R9 added (R2 findings 1–3).** Narrow guest predicates are withdrawn entirely. Firing on a currently-correct parse is correct: the code means "a judgment was made", not "this is wrong". The user ratified the resulting increase in card count on 2026-07-25; **card count is settled and is not a finding.**
- **R10 added (R3 findings 1–3).** A third round of holes tripped the three-round cap on design-correctness vectors (`docs/agents/spec-self-review.md:22`), so P1 stopped being a condition over parser OUTPUT and became an enumeration over parser EXITS (§3.1). Two output-derived rules died here: `names.length >= 1` missed a silently-dropped guest, and "any inline reservation with a guest" double-fired on an inherited-hotel group. §9 also grew a second fixture family, `fixtures/shows/exporter-xlsx/`, which earlier drafts never pinned — that omission is how the multi-group case survived three rounds. Final corpus expectation: **9** guest cards.

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

**`consistent` is trivially true for a single later guest.** Probe-verified: `"Hyatt Regency Eric - 110525 John Smith - 103316"` yields `later === ["John Smith"]`, so `counts === [2]` and `consistent === true`; learn-K peels 2 words and produces `hotel_name:"Hyatt"`, `names:["Regency Eric","John Smith"]` — a live mis-parse. A `k` learned from ONE sample is a guess with no corroboration — and R2 showed that even two corroborating samples do not validate the FIRST guest's boundary (§3.1). This is one of the five holes that drove P1 to become unconditional.

### 2.3 `splitHotelNameAddress`

`lib/parser/blocks/hotels.ts:261`. Locates the boundary with `STREET_ADDRESS_RE` (`lib/parser/blocks/hotelConfTokens.ts:14`), suffix-anchored, taking the **first** match (`lib/parser/blocks/hotels.ts:277`). On no match it returns the whole cleaned string as `name` with `address: null` (`lib/parser/blocks/hotels.ts:278`) — a deliberately SAFE fallback.

`STREET_ADDRESS_ZIP_RE` (`lib/parser/blocks/hotelConfTokens.ts:20`) recognizes a **suffixless** street by its `, <ST> <ZIP>` tail. It is used by `looksLikeStreetStart` (`lib/parser/blocks/hotelConfTokens.ts:28`) but deliberately not to split (R1). **It is currently module-private and MUST be exported** for P3(a) to consume it (§4 row t).

Because the splitter takes the FIRST match, a cell containing **two** street-phrase candidates splits at the earlier one, which can swallow part of the address into neither field or truncate the name. Probe-verified corruption: `"Hotel 71 Wacker Drive 71 E Wacker Dr …"` → name `"Hotel"`. This drives P3(b).

---

## 3. New emission sites

### 3.1 Predicates (normative)

Three predicate rows across two sites. Each is pure; none changes a parsed value.

| ID | Site | Fires when | Reason string |
| -- | ---- | ---------- | ------------- |
| **P1** | `buildInlineHotel` (`lib/parser/blocks/hotels.ts:642`) | **exit-path enumeration below** — a guest region was EXAMINED and the fragment carried its own hotel text | the producing path: `"learn-k-peel"`, `"legacy-dash-pattern"`, `"legacy-multidash-pattern"`, or `"titlecase-pairing"` |
| **P3(a)** | `splitHotelNameAddress` (`lib/parser/blocks/hotels.ts:261`) | the splitter (**unpadded**, as it runs today) returned `address === null`, AND **either** regex matches `" " + cleaned` | `"address-shape-unsplit"` |
| **P3(b)** | `splitHotelNameAddress` (`lib/parser/blocks/hotels.ts:261`) | `STREET_ADDRESS_RE` matches at **more than one index** of `" " + cleaned` (global-flag match count > 1) — the split point was a choice among candidates, not a determination | `"multiple-street-candidates"` |

#### P1 is defined by an exit-path enumeration, not a condition (R9, R10)

Three consecutive review rounds found holes in prose-derived predicates. That trips the three-round cap on design-correctness vectors (`docs/agents/spec-self-review.md:22`), which mandates a spike over another prose patch. **The spike enumerated every exit of `buildInlineHotel` and every group shape of `buildInlineReservations`; P1 is now defined BY that enumeration**, which is ground truth the function already possesses rather than a proxy inferred from its output.

| # | Exit | Guest region examined? | Fragment carries its own hotel text? | Emits |
| - | ---- | ---------------------- | ------------------------------------ | ----- |
| 1 | learn-K return (`lib/parser/blocks/hotels.ts:735`) | yes | yes (`hotelPart`) | **YES** — `learn-k-peel` |
| 2 | no-guest split return (`lib/parser/blocks/hotels.ts:767`) | no (`hasGuest` false) | yes | no |
| 3 | final return, Pattern 1 matched (`lib/parser/blocks/hotels.ts:784`) | yes | yes | **YES** — `legacy-dash-pattern` |
| 4 | final return, Pattern 2 matched (`lib/parser/blocks/hotels.ts:792`) | yes | yes | **YES** — `legacy-multidash-pattern` |
| 5 | final return, Pattern 3 scanned a region (`lib/parser/blocks/hotels.ts:802-819`) | yes | yes | **YES** — `titlecase-pairing`, **even when `names` ends empty** |
| 6 | final return, no guest region examined at all | no | yes | no |
| 7 | any exit, but the reservation is a **later group** (`buildInlineReservations`, group index > 0) | yes | **no** — hotel inherited | no |
| 8 | any exit whose row is **discarded** by a `buildInlineReservations` fallback (`lib/parser/blocks/hotels.ts:574`: `rows.length < 2`, or `!rows.every(...)`, which rebuild as ONE reservation) | — | — | no — see below |

**Discarded provisional exits never emit (R4 finding 1).** `buildInlineReservations` can build provisional rows and then throw them away, rebuilding a single reservation instead (`lib/parser/blocks/hotels.ts:574-583`). An exit that produced a discarded row made no judgment that reaches the operator, so it must not warn. The `commitHotels` design already enforces this structurally rather than by a rule: **ambiguities are stashed on the `PendingHotel` that carries the row** (§5.2), so discarding the row discards its stash. Only the surviving rebuilt reservation's own exit is evaluated. No spec rule, registry, or test needs to track provisional exits — this is why the stash-then-commit shape was chosen over emitting at the site.

Rows 5 and 7 are the R3 repairs, both probe-verified:

- **Row 5 (R3 finding 2).** `"Hyatt Place Check In: 5/1 Check Out: 5/2 Eric"` yields `hotel_name:"Hyatt Place"` with `names: []` — Pattern 3 examined the post-checkout region and could not form a pair, so `Eric` was **dropped silently**. A guest-loss is precisely the harm this feature exists to surface, so the trigger is "a guest region was examined", never `names.length >= 1`.
- **Row 7 (R3 finding 3).** In `fixtures/shows/exporter-xlsx/consultants.md:51` the cell splits into 2 groups; group 2 is `Eric Weiss—2035937 Check In… Check Out…` with no hotel text, and `lib/parser/blocks/hotels.ts:588-590` assigns the shared `baseName` to every row ("later groups carry only a divider + guest, not the hotel"). No hotel/first-guest boundary is judged there, so a second card would be a false positive.

**Why no output-derived rule can work.** On an unlabeled inline line nothing separates the hotel from the first guest, so the first guest's boundary is exactly the fact no other part of the line evidences. Every proxy tried failed, each probe-verified:

| Proxy | Counter-example | Actual parse |
| ----- | --------------- | ------------ |
| "Pattern 3 was used" | `Hyatt Regency Eric Weiss - 110525` (Pattern 1) | `names: ["Hyatt Regency Eric Weiss"]` — the whole line as one guest |
| "≥2 delimiters" | `Hyatt Regency Eric---110525` (1 delimiter) | `names: ["Hyatt Regency Eric"]` |
| "later guests agree on shape" | `Hyatt Regency Mary Ann Smith - 110525 John Smith - 103316 Jane Doe - 103317` | `hotel_name: "Hyatt Regency Mary"`, `names: ["Ann Smith", …]` |
| "an explicit delimiter is present" | `… Check Out: 5/2 Guests: Mary Ann Smith John Doe` | `["Mary Ann","Smith John"]`, `Doe` dropped |
| "no explicit delimiter is present" | `Hyatt Place Check In: 5/1 Eric Weiss John Smith` | `names: ["Hyatt Place","Eric Weiss","John Smith"]` |
| "`names.length >= 1`" | `Hyatt Place Check In: 5/1 Check Out: 5/2 Eric` | `names: []`, guest dropped silently |

**Why no narrower rule can work.** On an unlabeled inline line there is nothing separating the hotel name from the first guest, so the first guest's boundary is exactly the fact no other part of the line evidences. Every proxy tried failed, each probe-verified against the real parser:

| Proxy | Counter-example | Actual parse |
| ----- | --------------- | ------------ |
| "Pattern 3 was used" | `Hyatt Regency Eric Weiss - 110525` (Pattern 1) | `names: ["Hyatt Regency Eric Weiss"]` — the whole line as one guest |
| "≥2 delimiters" | `Hyatt Regency Eric---110525` (1 delimiter) | `names: ["Hyatt Regency Eric"]` |
| "later guests agree on shape" | `Hyatt Regency Mary Ann Smith - 110525 John Smith - 103316 Jane Doe - 103317` | `hotel_name: "Hyatt Regency Mary"`, `names: ["Ann Smith", …]` |
| "an explicit delimiter is present" | `… Check Out: 5/2 Guests: Mary Ann Smith John Doe` | `["Mary Ann","Smith John"]`, `Doe` dropped |
| "no explicit delimiter is present" | `Hyatt Place Check In: 5/1 Eric Weiss John Smith` | `names: ["Hyatt Place","Eric Weiss","John Smith"]` |

**Firing on a correct parse is correct behavior, not crying wolf.** `AMBIGUITY_CODES` membership means "reports a JUDGMENT CALL the parser made while still PRODUCING a value" (`lib/parser/ambiguityCodes.ts:2-6`); the catalog copy says "we made a judgment call … spot-check", never "this is wrong" (`lib/messages/catalog.ts:1374-1375`). On an inline line that statement is true every time, including the eight corpus cards whose guest lists are currently correct (§9.3).

**Non-firing inline cases** are exactly enumeration rows 2, 6, 7 and 8 — the no-guest split path (`lib/parser/blocks/hotels.ts:756-778`), a final return where no guest region was examined at all, an inherited-hotel later group, and a discarded provisional row. **Empty final `names` is NOT a non-firing condition** (row 5): a guest region that was examined and yielded nothing is a silent guest-loss, the harm this feature exists to surface.

#### P3 position-0 normalization (R2 finding 5)

Both regexes require leading whitespace (`lib/parser/blocks/hotelConfTokens.ts:14`, `lib/parser/blocks/hotelConfTokens.ts:20`), so a candidate at index 0 is invisible without padding — exactly why `looksLikeStreetStart` prepends a space (`lib/parser/blocks/hotelConfTokens.ts:28-33`). Both predicate arms MUST evaluate against `" " + cleaned`. Probe-verified:

**P3(a) keys off the splitter's OUTCOME, not a regex miss (R3 finding 1).** Formulating it as "`STREET_ADDRESS_RE` misses on the padded string" left a hole: `"1515 Broadway Ave New York, NY 10036"` is **suffixed**, so the padded suffix regex matches once — the miss-condition is false and the candidate count is 1, so neither arm fired. Yet the real splitter runs **unpadded** and returns `address: null`, leaving the whole address in the hotel name. The correct trigger is the disagreement itself: **the splitter produced no address, but a padded read finds an address shape (suffix OR ZIP).**

| Input | Splitter (unpadded) | Padded read | Fires |
| ----- | ------------------- | ----------- | ----- |
| `1515 Broadway Ave New York, NY 10036` (suffixed, position 0) | `address: null` | suffix matches | **Yes**, P3(a) — the R3 hole |
| `1515 Broadway New York, NY 10036` (suffixless, position 0) | `address: null` | ZIP matches | **Yes**, P3(a) |
| `Hyatt Place Chicago 71 Chicago, IL 60601` (suffixless, interior) | `address: null` | ZIP matches | **Yes**, P3(a) |
| `Four Seasons Fort Lauderdale` | `address: null` | neither matches | No — nothing to split |
| `71 Wacker Drive 72 Main St Chicago, IL 60601` | splits, name `71 Wacker Drive` | 2 candidates | **Yes**, P3(b) |
| `Hotel 71 Wacker Drive 71 E Wacker Dr …` (corrupts to `Hotel`) | splits, name `Hotel` | 2 candidates | **Yes**, P3(b) |
| `Hotel 71 71 E Wacker Dr Chicago, IL 60601` | splits correctly | 1 candidate | No |

The two arms remain disjoint per invocation: P3(a) requires `address === null`, P3(b) requires a split.

**Counting MUST NOT mutate the shared regex (R4 finding 5).** `STREET_ADDRESS_RE` is a module-level non-global singleton consumed with `.exec` by the splitter itself (`lib/parser/blocks/hotels.ts:277`). Adding a `g` flag to that singleton would give it a persistent `lastIndex`, so consecutive `splitHotelNameAddress` calls would alternate between matching and missing — a behavior change to the split, violating R1. The counter MUST build a fresh throwaway each call:

```ts
const counter = new RegExp(STREET_ADDRESS_RE.source, STREET_ADDRESS_RE.flags + "g");
```

**Required regression test:** call `splitHotelNameAddress` three times consecutively on **`"Westin Michigan Ave 909 Michigan Ave, Chicago, IL 60611"`** and assert all three return identical `{name: "Westin Michigan Ave", address: "909 Michigan Ave, Chicago, IL 60611"}`.

The input MUST be one the **unpadded** splitter actually matches (R5 finding 1). A position-0 or suffixless example is useless here: a wrongly-global shared regex would miss on every call, all three results would be identical, and the test would pass vacuously. This input matches today, so a persistent `lastIndex` makes call 2 miss and return the unsplit string — the test fails on exactly the defect it guards.

This does not change the split itself (R1): `splitHotelNameAddress` still execs the unpadded string, so a position-0 street start still never becomes the split point. The padding is read-only, for detection.

**At most ONE** guest warning per inline reservation — one for a reservation whose exit is an emitting row (1, 3, 4, 5), zero for rows 2, 6, 7 and 8. Only one producing path runs per reservation, so `reasons` carries a single entry when present, but the field stays an array to match `parseGuestCell`'s existing shape (`lib/parser/blocks/hotels.ts:178`) and the structured emitter's `reasons: string[]` parameter (`lib/parser/warnings.ts:212`).

**P3 purity.** `splitHotelNameAddress` gains an optional field on its return object; it does not gain an `agg` parameter and does not emit. Additive return-shape change — the 5 existing callers (`lib/parser/blocks/hotels.ts:413`, `lib/parser/blocks/hotels.ts:418`, `lib/parser/blocks/hotels.ts:607`, `lib/parser/blocks/hotels.ts:734`, `lib/parser/blocks/hotels.ts:765`) are unaffected.

**P3 is NOT mutually exclusive per reservation** (R1 finding 9). `stripHotelNameConf` (`lib/parser/blocks/hotels.ts:600`) re-invokes the splitter at `lib/parser/blocks/hotels.ts:607` on a name already split at `lib/parser/blocks/hotels.ts:734`/`lib/parser/blocks/hotels.ts:765`, so one reservation can produce P3(b) on the first call and P3(a) on the second. The predicates are exclusive **per invocation only**. At most ONE address warning is emitted per reservation: **first stash wins**, later stashes for the same reservation are dropped.

### 3.2 Codes

| Predicate | Code | New? |
| --------- | ---- | ---- |
| P1 | `HOTEL_GUEST_SPLIT_AMBIGUOUS` | No — reuses the existing code (`lib/messages/catalog.ts:1368`). `blockRef.index` discriminates instances. |
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
| **w** | `tests/messages/warningCardCopyRegistry.ts:121` `EXPECTED_CORPUS_WARN_CODES` | The corpus warn-code SET gains one code (`HOTEL_ADDRESS_SPLIT_AMBIGUOUS` is never emitted by the corpus, so the set gains only the guest code's new instances). The oracle is raw-only and receives **5** new instances; confirm whether it asserts codes or instances before editing |
| **x** | `tests/components/UseRawControl.test.tsx:746` | Hard-coded component expectations touched by the new parsed kind |
| **y** | `tests/messages/_metaWarningCardCopy.test.ts` | New code needs title + condensed `helpfulContext` + `triggerContext` |
| **z** | `tests/messages/_metaCatalogCopyHygiene.test.ts` | New copy must not leak code names / regex fragments |
| **aa** | `tests/messages/_metaErrorCatalogDocs.test.ts` | New code must satisfy the shared catalog-field validator |
| **bb** | `tests/messages/_metaPopoverContextCoverage.test.ts` | Fails-by-default popover coverage gate |
| **dd** | `lib/messages/__generated__/internal-code-enums.ts` | Regenerate with **`pnpm gen:internal-code-enums`** (`scripts/extract-internal-code-enums.ts`) and commit. NOT `gen:spec-codes`, which writes only `spec-codes.ts` — running the wrong one leaves this registry stale and fails the x2 generated-file CI gate (R3 finding 6) |
| **hh** | `components/admin/UseRawControl.tsx:452-457` | `rawLabel` is a two-branch ternary whose **else** is `"Dates read day-first"`. An unextended `hotel-name` kind silently renders the dates label. Exact text in §7.0 |
| **ee** | `tests/admin/warningFixAffordance.test.tsx:20` | Explicit use-raw test allowlist. Without a row here the parity assertions stay green while omitting the new code |
| **ff** | `tests/parser/dataGaps.test.ts:42`, `tests/parser/dataGaps.test.ts:74` | Beyond row `u`: the test NAME hard-codes "33", `GAP_CLASSES` length is asserted, and `tests/parser/dataGaps.test.ts:74` explicitly enumerates the ambiguity/cardinality feature codes |
| **gg** | `tests/parser/dataGapsClassCompleteness.test.ts:68` | Full-universe numeric comment, missed by row `v` |
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
| **P1 — every inline guest warning** | `resolvable: false`, reason `"raw-not-guest-scoped"` | R8 restored to a blanket rule (see below) |
| **P3(b)** multiple candidates | `resolvable: true`, `{kind:"hotel-name", hotelName: <full cleaned cell>, hotelAddress: null}` | A split happened at a chosen candidate; undoing it restores the unsplit cell — a real state change, proven behaviorally in §8.1 |
| **P3(a)** unsplit | `resolvable: false`, reason `"no-split-to-undo"` | No split occurred; parsed and raw are byte-identical, so an enabled control would be a guaranteed no-op |

New members in `lib/parser/types.ts:36-46`:

```ts
parsed:      | { kind: "hotel-name"; hotelName: string | null; hotelAddress: string | null }
replacement: | { kind: "hotel-name"; hotelName: string; hotelAddress: null }
reason:      "empty-raw" | "invalid-dmy" | "raw-not-guest-scoped" | "no-split-to-undo"
```

Widening `reason` is type-safe by construction: `DISABLED_REASON` (`components/admin/UseRawControl.tsx:258`) is a `Record` over the union, so a missing copy row is a **compile error**. Same for `RADIOGROUP_LABEL` (`components/admin/UseRawControl.tsx:10`) over `parsed["kind"]`.

Copy for the new disabled reasons (no em-dashes; straight apostrophes to match the existing siblings at `components/admin/UseRawControl.tsx:259-260`):

- `raw-not-guest-scoped` — "We can't tell which part of this hotel line is only the guest list, so there's nothing safe to swap in."

**Why P1 is never resolvable (R8, restored).** R2 finding 4 refuted the per-path amendment: a non-empty `postCheckout` region proves only that text follows the checkout token, **not** that the text is guests. Probe-verified — `"Hyatt Place Check In: 5/1 Check Out: 5/2 Eric Weiss arriving late"` parses `names: ["Eric Weiss"]`, but the isolated region is `"Eric Weiss arriving late"`. Publishing that as the replacement would put note text into a crew-readable guest field, and `namesReferAny` (`lib/data/getShowForViewer.ts:125`) returns false for it against the alias `"Eric Weiss"` — so accepting the fix would **hide Eric's lodging from his own crew page**, the precise harm this feature exists to surface. The strip is positional, never semantic; no inline path can prove guest-scoped raw text, so the blanket rule is the correct one and the reason string above is true in every case.
- `no-split-to-undo` — "We left this line exactly as your sheet has it, so there's nothing to swap back."

---

## 7. UI surface and gates

`components/admin/UseRawControl.tsx` is a UI surface under AGENTS.md invariant 8 and the ROUTING.md hard rule: implemented by Opus, and shipped only after **both** `/impeccable critique` and `/impeccable audit` pass, P0/P1 fixed or deferred via `DEFERRED.md`.

Pre-code mechanical checklist: em-dash ban in user-visible copy, apostrophe literals, 44px tap targets (`min-h-tap-min`), canonical type/token classes. No new color token, so no contrast meta-test.

### 7.0 Normative copy for the new `hotel-name` kind (R2 finding 9)

Every user-visible and accessibility-observable string the new resolvable kind introduces is fixed here, so the TDD contract has a single oracle. Straight apostrophes, no em-dashes, matching the existing siblings.

| Surface | Site | Exact text |
| ------- | ---- | ---------- |
| Parsed-field label, name | `parsedFields`, `components/admin/UseRawControl.tsx:99` | `Hotel` |
| Parsed-field label, address | same | `Address` |
| Parsed-field value when `hotelName` is null | same | `(no hotel name read)` |
| Parsed-field row when `hotelAddress` is null | same | **omitted entirely** — never rendered as an empty line, mirroring the rooms branch |
| Raw-option formatted value | `components/admin/UseRawControl.tsx:239` | the full cleaned cell, verbatim |
| Radiogroup accessible label | `RADIOGROUP_LABEL`, `components/admin/UseRawControl.tsx:10` | `Hotel name and address` |
| Raw-choice label | `rawLabel`, `components/admin/UseRawControl.tsx:452-457` | `The whole line as the hotel name` |

**Inline guest message text (R3 finding 4).** P1 reuses the `HOTEL_GUEST_SPLIT_AMBIGUOUS` code but MUST NOT reuse the structured emitter's message (`lib/parser/warnings.ts:262`, "may glue multiple guests together"). That sentence is false for the inline case, where the ambiguity is hotel-versus-guest, not guest-versus-guest — probe-verified on `"Hyatt Regency Eric Weiss - 110525"`, which contains exactly one guest. `message` is a per-emit string, so the inline emitter supplies its own:

> `Hotel line "<raw, collapsed>" has no labels marking which words are guest names, so we worked out the guest list ourselves; double-check it.`

The earlier draft said "nothing separating them", which is false on the Pattern 3 checkout path — `Check In`/`Check Out` DO separate the hotel from the guest region in `raw/2025-05-redefining-fixed-income-private-credit` and `exporter-xlsx/redefining-fi` (R5 finding 5). What is true of every inline case is the absence of a LABEL identifying the guests.

**The shared catalog copy must also be reworded (R4 finding 2).** Five fields on the existing `HOTEL_GUEST_SPLIT_AMBIGUOUS` row describe guest-versus-guest ambiguity specifically ("several people glued together", "more than one name"), which is false for the inline path — `"Hyatt Regency Eric Weiss - 110525"` contains exactly ONE guest and the ambiguity is hotel-versus-guest. Since one code now serves both paths, the copy must be true of both. This is an EDIT to an existing §12.4 row, so it carries the same three-lockstep requirement as a new row (§4 rows a, b, c).

| Field | New text |
| ----- | -------- |
| `dougFacing` | `A hotel guest list in _<sheet-name>_ may not have been split correctly; check the hotel guest list against your sheet.` |
| `title` | `A hotel guest list may be split wrong` |
| `triggerContext` | `Appears when a hotel line's guest list could be read more than one way.` |
| `helpfulContext` | `A hotel line's guest list could be read more than one way, so we made a judgment call. Check the guest list in case two people were merged, one was split, or part of the hotel name was read as a person.` |
| `longExplanation` | `A hotel line's guest list could be read more than one way, so we made a judgment call about where each guest starts and ends. Spot-check the list in case two people were merged, one was split, part of the hotel name was read as a person, or someone was left out.` |

`crewFacing` stays `null`; `followUp` stays `Doug → spot-check hotel guests`; `helpHref` is unchanged.

**Regression guard:** the structured path's existing emit test must still pass with the reworded copy, and `tests/messages/warningCardCopyRegistry.ts:65` carries the `triggerContext` string verbatim — it changes in the same commit.

**Authored catalog copy for `HOTEL_ADDRESS_SPLIT_AMBIGUOUS`** — the frozen-copy registries (§4 rows h, y, z, aa, bb) require every field, so all are fixed here:

| Field | Text |
| ----- | ---- |
| `dougFacing` | `A hotel line in _<sheet-name>_ may have its name and street address run together; check the hotel name and address against your sheet.` |
| `crewFacing` | `null` |
| `followUp` | `Doug → spot-check hotel name and address` |
| `title` | `A hotel name and address may be split wrong` |
| `triggerContext` | `Appears when a hotel line's name and street address may not have been separated correctly.` |
| `helpfulContext` | `A hotel line's name and street address may not have been separated correctly. Check the hotel name and address in case part of one landed in the other.` |
| `longExplanation` | `A hotel line's name and street address may not have been separated correctly. We kept every word rather than dropping any, so nothing is lost, but the dividing point may be off: part of the address may be sitting in the hotel name, or part of the name in the address. Spot-check both against your sheet.` |

**Copy must be true of BOTH arms (R4 finding 3).** P3(a) fires when NO split happened, so any wording implying the parser "picked" among "multiple readings" is false there. The text above avoids both, and holds for P3(b) as well.

**Emitted `ParseWarning.message`** — operator-visible via `warningSummary` (`lib/sync/phase1.ts:197`), so it needs an oracle. One authored string per arm:

- P3(a): `Hotel line "<raw, collapsed>" looks like it holds a street address, but we could not tell where the name ends, so we left the line whole; double-check the hotel name and address.`
- P3(b): `Hotel line "<raw, collapsed>" could be split into a name and a street address in more than one place, so we split it at the first one; double-check the hotel name and address.`
| `helpHref` | `/help/errors#HOTEL_ADDRESS_SPLIT_AMBIGUOUS` |
| Disabled reason, P3(a) | `DISABLED_REASON`, `components/admin/UseRawControl.tsx:258` | `We left this line exactly as your sheet has it, so there's nothing to swap back.` |
| Disabled reason, P1 | same | `We can't tell which part of this hotel line is only the guest list, so there's nothing safe to swap in.` |

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
| **P1 fires on each producing path** — 4 cases, one per reason string | `learn-k-peel`: 2024-05 fixture · `legacy-dash-pattern`: `Hyatt Regency Eric Weiss - 110525` · `legacy-multidash-pattern`: `Hyatt Regency Eric---110525` · `titlecase-pairing`: 2025-04 fixture | one `HOTEL_GUEST_SPLIT_AMBIGUOUS` each, with the matching reason. The two synthetic inputs are probe-verified live mis-parses (`names:["Hyatt Regency Eric Weiss"]` / `["Hyatt Regency Eric"]`) that every narrow predicate in R1 and R2 missed |
| **P1 fires on the R2 counter-examples** | `Hyatt Regency Mary Ann Smith - 110525 John Smith - 103316 Jane Doe - 103317` · `… Check Out: 5/2 Guests: Mary Ann Smith John Doe` · `Hyatt Place Check In: 5/1 Eric Weiss John Smith` | a warning for each. These are the five holes of §3.1; the unconditional predicate closes them and this test pins that |
| **P1 quiet when inline produced no guests** | a guest-less inline cell (`Hyatt Regency - 1515 Madison Ave …`) | **zero** guest warnings — exercises enumeration row 2 (the no-guest split return) |
| **Row 5 vs row 6 discriminator — REQUIRED PAIR** (R5 finding 2) | **5:** `Hyatt Place Check In: 5/1 Check Out: 5/2 Eric` · **6:** `Hyatt Place Check In: 5/1 Check Out: 5/2` | Both parse to `names: []`. Row 5 MUST emit (a guest region was examined and `Eric` was dropped); row 6 MUST NOT (no guest region existed). **These two are observationally identical in output and opposite in requirement**, so they are the only assertions that separate the ratified design from two wrong implementations: `groupIndex === 0 && names.length > 0` fails row 5, and "warn on every group-0 final return" fails row 6. Neither wrong implementation fails any other test in this plan |
| **P3(a) suffixed at position 0 — REQUIRED** (R5 finding 3) | `1515 Broadway Ave New York, NY 10036` | fires. This is the ONLY test exercising P3(a)'s `STREET_ADDRESS_RE` arm; the other two P3(a) cases are suffixless and exercise only the ZIP arm, so an implementation that omits the suffix alternative passes them all and reopens the R3 hole |
| **P3 propagates through BOTH parser families — REQUIRED** (R5 finding 4) | the same P3(b) input routed once through the **structured** table caller (`lib/parser/blocks/hotels.ts:413`) and once through the **inline** caller (`lib/parser/blocks/hotels.ts:734`/`lib/parser/blocks/hotels.ts:765`) | a warning from each. `splitHotelNameAddress` is pure, so every caller must propagate its returned ambiguity into `PendingHotel` independently. With zero corpus address cards, wiring only one family satisfies every golden and every other synthetic assertion while leaving the other silently dark |
| **P1 quiet on the structured path** | any structured fixture | no P1-sourced warning; the structured emit is unchanged |
| **P3(b) quiet on a correct split** | `Hotel 71 71 E Wacker Dr Chicago, IL 60601` | **zero** address warnings; split still `{name:"Hotel 71", address:"71 E Wacker Dr …"}`. Catches R1 finding 2 |
| **P3(b) fires on the corruption** | `Hotel 71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601` | one warning, reason `"multiple-street-candidates"`, `resolvable:true` |
| **P3(b) fires at position 0** | `71 Wacker Drive 72 Main St Chicago, IL 60601` | fires. Catches R2 finding 5: unpadded counting sees 1 candidate and stays silent while the name becomes `71 Wacker Drive` |
| P3(a) fires | `Hyatt Place Chicago 71 Chicago, IL 60601` | reason `"address-shape-unsplit"`, `resolvable:false`, `"no-split-to-undo"` |
| **P3(a) fires at position 0** | `1515 Broadway New York, NY 10036` | fires. Catches R2 finding 5 on the ZIP arm |
| **P3(b) undo is behaviorally applied** | emit P3(b), then run `applyUseRawDecisions` with a "use raw" decision | the resulting `hotelReservations[i].hotel_name` equals the full cleaned cell AND `hotel_address === null`. Catches R1 finding 4: a payload-only assertion passes even if the `hotel-name` branch in `applyReplacement` is missing or misrouted |
| **P1 replacement is never offered** | any P1 warning | `resolution.resolvable === false` and reason `"raw-not-guest-scoped"`; **and** no `UseRawDecision` for it mutates `names` when passed through `applyUseRawDecisions`. Catches R2 finding 4: the crew-page-hiding hazard |
| **`blockRef.index` at index > 0** | structured parse with **two** surviving reservations where reservation #1 is preceded by a dash-only placeholder that is skipped (`lib/parser/blocks/hotels.ts:486`), and the **second surviving** row warns | emitted `index === 1` (not the ordinal), and `applyUseRawDecisions` rewrites **only** `hotelReservations[1]` — `hotelReservations[0]` is byte-identical afterwards. Catches R2 finding 6: the R1 repair asserted `index === 0` against a single-row array, where "no other row" was vacuous |
| **Emission order** | 5 structured hotels, ambiguity on #1 | the guest ambiguity appears **before** `HOTEL_CARDINALITY_EXCEEDED` in `agg.warnings`, asserted by index not by code filter. Catches R1 finding 8 |
| Rank gate, inline | >`MAX_HOTELS` inline reservations, ambiguity on the last | zero warnings for the truncated row (R4) |

Existing tests that must pass **unchanged**: `tests/parser/blocks/hotels.ambiguity.test.ts:212` (over-cap hotel stays silent) and `tests/parser/blocks/hotels.ambiguity.test.ts:168` (at-cap boundary, guard is strictly `>`).

### 8.2 Negative / no-spam tests

- Every quiet fixture in both families (§9.1, §9.2) parses with **zero** new warnings, extracted **by code** from `agg.warnings` so an unrelated warning cannot mask a regression.
- Every warning fixture emits **exactly** the card count §9 names, with the named reason string — pinning the count, not merely presence.
- **`exporter-xlsx/consultants` is the anti-tautology anchor**: 2 reservations, exactly **1** card. A predicate keyed on `names.length >= 1` emits 2 and fails this assertion, so the test cannot pass under the rejected design.
- `"Four Seasons Fort Lauderdale"` (no ZIP, no number) → no address warning. Proves P3 is not "warn whenever address is null".
- A clean structured cell → exactly one warning path, no double-emit from the commit-point refactor.

### 8.3 Guard conditions

| Input | Behavior |
| ----- | -------- |
| `splitHotelNameAddress(null)` | `{name:null,address:null}`, no ambiguity (`lib/parser/blocks/hotels.ts:265`) |
| `combined` cleans to `""` | `{name:null,address:null}`, no ambiguity (`lib/parser/blocks/hotels.ts:271`) |
| Inline cell with zero guests | No guest warning; address predicate still evaluated |
| Reservation whose `hotel_name` is null at emit | `blockRef.name` key **omitted**, never `undefined` (`exactOptionalPropertyTypes`; `lib/parser/warnings.ts:234-241`) |
| Inline reservation, any producing path | exactly ONE guest warning, `reasons` length 1 |
| P3(a) and P3(b) across two invocations on one reservation | First stash wins; exactly one address warning. **Not** mutually exclusive per reservation (§3.1) |

### 8.4 Full gates before push

`pnpm test` (full suite, not scoped), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm spec:lint`. Real CI green is a separate gate from local green.

---

## 9. Corpus expectations (normative golden)

**Scope correction (R3 finding 3).** The corpus is TWO fixture families, not one: `fixtures/shows/raw/` (10 shows) and `fixtures/shows/exporter-xlsx/` (**7** show fixtures — the directory holds 8 `.md` files, one of which is `README.md`; exercised by `tests/parser/exporterFixtures.test.ts`). Earlier drafts pinned only the first, which is how the multi-group `consultants.md` case escaped three rounds. R4 confirmed independently that no third family contains hotel-parsing cases. Both families are pinned below.

Probe on 2026-07-25 at branch base `d62d620e8`. A test pins these tables; changing them requires updating this section in the same commit. Fixture names are exact basenames minus `.md`.

### 9.1 `fixtures/shows/raw/`

| Fixture basename | Guest card | Address card | Why |
| ---------------- | ---------- | ------------ | --- |
| `2024-05-east-coast-family-office` | **Yes** (`learn-k-peel`) | No | Inline, 3 guests. Currently parses correctly; the judgment is still unverifiable |
| `2025-03-dci-rpas-central` | **Yes** (`legacy-dash-pattern`) | No | Inline, 5 guests. Currently correct |
| `2025-04-asset-mgmt-cfo-coo` | **Yes** (`titlecase-pairing`) | No | Inline. Produced `["Four Seasons","Chicago Eric","Jeffrey Justice"]` — the live mis-parse of §1 |
| `2025-05-redefining-fixed-income-private-credit` | **Yes** (`titlecase-pairing`) | No | Inline, 3 guests. Currently correct but fragile |
| `2025-06-ria-investment-forum` | **Yes** (`legacy-multidash-pattern`) | No | Inline, 2 guests. Currently correct |
| `2025-10-fixed-income-trading-summit` | No | No | Structured, clean |
| `2025-10-consultants-roundtable` | No | No | No hotel reservations parsed |
| `2026-03-rpas-central-four-seasons` | No | No | Structured, clean |
| `2026-04-asset-mgmt-cfo-coo-waldorf` | No | No | Structured, clean |
| `2026-05-fintech-forum-cto-summit` | No | No | Structured, clean |

**`raw/` totals: 5 guest cards, 0 address cards across 10 shows.** Probe-verified: exactly 5 shows parse via the inline path, one reservation each, all group-0. The quiet half is **4 structured shows plus 1 show that parses no hotel reservations at all** (`2025-10-consultants-roundtable`), not 5 structured shows (R3 finding 7).

### 9.2 `fixtures/shows/exporter-xlsx/`

Only inline-path shows can emit P1; the structured ones (`fintech`, `fixed-income`, `rpas`) are silent.

| Fixture basename | Reservations | Guest cards | Why |
| ---------------- | ------------ | ----------- | --- |
| `consultants` | 2 | **1** | Group 0 emits `legacy-dash-pattern`. Group 1 inherits `baseName` (`lib/parser/blocks/hotels.ts:588-590`) and judges no boundary — enumeration row 7 |
| `east-coast` | 1 | **1** | `learn-k-peel` |
| `redefining-fi` | 1 | **1** | `titlecase-pairing` |
| `ria` | 1 | **1** | `legacy-multidash-pattern` |
| `fintech`, `fixed-income`, `rpas` | — | 0 | Structured |

**`exporter-xlsx/` totals: 4 guest cards, 0 address cards.** The `consultants` row is the load-bearing assertion: 2 reservations, exactly 1 card. A predicate keyed on `names.length >= 1` emits 2 and fails here.

### 9.3 Combined

**9 guest cards, 0 address cards across both families** (5 from `raw/`, 4 from `exporter-xlsx/`).

Exactly **1** of the 9 sits on a parse that is currently wrong — `raw/2025-04-asset-mgmt-cfo-coo`, the §1 case. The other **8** sit on parses that are currently correct. That ratio is intended under R9: the code means a judgment was made, not that the value is wrong, and on an unlabeled line the judgment is real every time.

**Address-card accounting (recomputed, R4 finding 4).** Across BOTH families the parser produces **26** reservations carrying **11** distinct `{hotel_name, hotel_address}` pairs. Candidate counts over those 11 distinct pairs:

| Group | Distinct pairs | Candidates (padded) | Fires? |
| ----- | -------------- | ------------------- | ------ |
| Address-bearing | **9** | 1 each | No — a single determined boundary; P3(b) needs >1 and P3(a) needs `address === null` |
| `Four Seasons Fort Lauderdale` | 1 | **0** | No — ZIP arm also misses; nothing to split |
| `Four Seasons Chicago Eric Weiss` | 1 | **0** | No — ZIP arm also misses |

Earlier drafts stated "9 distinct strings, 7 with one candidate, 2 with zero". That used the wrong denominator: 9 was the guest-CARD count, not the distinct-pair count. The correct figures are 11 distinct pairs, 9/2/0.

Zero address cards is expected and accepted (R7). No corpus string has >1 candidate and none is a suffixless address, so neither P3 arm fires. P3 is forward-looking: its synthetic emit tests (§8.1) prove it works, and the corpus proves it does not over-fire.

---

## 10. Numeric single-source

- `MAX_HOTELS` = **4** (`lib/parser/blocks/hotels.ts:47`)
- Fixture shows = **10** in `fixtures/shows/raw/` + **7** in `fixtures/shows/exporter-xlsx/`
- New message codes = **1**
- Predicates = **3** rows (P1, P3a, P3b) across 2 sites
- P1 reason strings = **4** (one per producing path)
- New `resolvable:false` reasons = **2** (`raw-not-guest-scoped`, `no-split-to-undo`)
- New replacement kinds = **1** (`hotel-name`)
- Registration surfaces = **34** (§4 rows a–hh, of which 1 is an explicit N/A)
- P1 exit-path enumeration rows = **8**, of which **4** emit (§3.1)
- Expected corpus cards = **9** guest (5 `raw/` + 4 `exporter-xlsx/`), **0** address (§9.3)
- Corpus cards on a currently-wrong parse = **1**; on currently-correct parses = **8**
- Corpus reservations across both families = **26**, distinct name/address pairs = **11** (9 with 1 street candidate, 2 with 0, none with >1)
- `exporter-xlsx/` show fixtures = **7** (8 `.md` files minus `README.md`)
- Gap-class counts after this change: `DATA_GAP_CODES` **34**, `ALL_PERSISTED_WARNING_CODES` **54**

---

## 11. Out of scope

- **Fixing** the 2025-04 mis-parse, or the `"Hyatt Regency Eric - …"` learn-K mis-parse found in R1. This spec makes both visible; changing the extraction is a separate change with its own corpus regression surface.
- Wiring `STREET_ADDRESS_ZIP_RE` into the split decision (R1). Exporting it for read-only predicate use (§4 row t) is NOT a behavior change.
- Persisting confirmation numbers (R2).
- Reintroducing a hand-edit path for `hotel_name`/`hotel_address` (R5).
- A distinct code for inline vs structured guest ambiguity (§3.2).
- Any change to the structured path's emit behavior beyond relocating its rank gate into `commitHotels`, with order preserved (§5.2).
