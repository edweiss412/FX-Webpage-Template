# Plan — Hotel ambiguity coverage

**Spec:** `docs/superpowers/specs/parser/2026-07-25-hotel-ambiguity-coverage-design.md` (canonical; §-refs below point there)
**Branch:** `feat/hotel-ambiguity-coverage`
**Implementer:** Opus / Claude Code (invariant: UI work is never delegated — `components/admin/UseRawControl.tsx` is in scope)

---

## 0. Why this plan exists in this shape

The spec ran **9 adversarial rounds / 69 findings**, all verified against live code, none refuted. Two vectors never closed in prose:

- **copy truth** — a string asserts something about the algorithm; some reachable input falsifies it;
- **test-oracle discrimination** — a wrong implementation passes the specified tests.

Per `docs/agents/spec-self-review.md:22` a vector surviving three rounds converges structurally, not by more prose. For the oracle vector the structural convergence is **executable tests**: a test either fails against a wrong implementation or it does not, and running it answers the question that reading cannot. The user ratified moving to plan + TDD on 2026-07-25.

**Consequence for every task below:** the failing test is written FIRST and must be demonstrated to fail **for the stated reason** before implementation. Several spec findings were "this test passes even when the implementation is wrong" — so each task names the wrong implementation its test kills.

---

## 1. Meta-test inventory (mandatory declaration)

| Meta-test | Created / Extended | What it pins |
| --------- | ------------------ | ------------ |
| `tests/parser/_metaTransformSitesWalker.test.ts` | **Extended** | `REQUIRED_DECLARATIONS["hotels.ts"]` gains `HOTEL_ADDRESS_SPLIT_AMBIGUOUS`; both `deferred:BL-` exempts flip to `code` entries (spec §4 rows k, l) |
| **New** — `tests/parser/_metaSplitHotelNameAddressPropagation` **.test.ts** (created by T4) | **Created** | Source-scans every `splitHotelNameAddress(` call site in `lib/parser/blocks/hotels.ts` and asserts each destructures the ambiguity field and passes it into a stash. Fails-by-default for a new call site. This exists because the inline-no-guest × P3(a) cell is **not behaviorally observable** (spec §3.1 / §8.1) |
| `tests/parser/ambiguityCodes.test.ts` | **Extended** | New code in the expected sorted list; `AMBIGUITY_CODES ⊆ GAP_CLASSES` still holds |
| `tests/messages/_metaWarningCardCopy.test.ts`, `_metaCatalogCopyHygiene`, `_metaErrorCatalogDocs`, `_metaPopoverContextCoverage` | **Extended by data** | New catalog row must satisfy all four; no code change expected, but each is run and named in the task |
| `tests/parser/dataGapsClassCompleteness.test.ts`, `tests/parser/dataGaps.test.ts` | **Extended** | Hard-coded gap-class counts 33→34 and 53→54, plus the test names and comments that embed them |
| `tests/admin/step3Buckets.test.ts` | **Extended** | Exact-map assertion over `FIELD_LABELS` gains `address` |

**Advisory-lock topology:** N/A — this change touches no `pg_advisory*` surface, no RPC, no migration. Declared explicitly per the mandatory rule.
**Layout-dimensions task:** N/A — spec §7.1 records no fixed-dimension parent and no new flex/grid parent-child pair.
**Transition-audit task:** N/A — spec §7.2 records no new state and no new edge; the change adds values to an existing `disabled` reason set.

---

## 2. CI wiring

`BASE_INCLUDE = ["tests/**/*.test.ts", "tests/**/*.test.tsx"]` (`vitest.projects.ts:34`), so **every new test file is auto-discovered** — no `testMatch` entry and no workflow path-filter row is required. Verified, not assumed. `tests/messages/**` runs in the parallel project (`vitest.projects.ts:67`); `tests/parser/**` runs serial. No new e2e spec, so no workflow coverage row.

---

## 3. Task order and rationale

Ordered so each task's test can fail for its own reason. Registration (T5) lands before the emitters (T6) because an emitter referencing an unregistered code fails the orphan-code gate for the wrong reason.

### T1 — `splitHotelNameAddress` gains a pure ambiguity signal

**Test first.** a new `hotels.addressAmbiguity` test file under `tests/parser/blocks/`:

- P3(a) fires: `Hyatt Place Chicago 71 Chicago, IL 60601`, `1515 Broadway New York, NY 10036`, and **`1515 Broadway Ave New York, NY 10036`** (the suffixed position-0 case — the ONLY test exercising the `STREET_ADDRESS_RE` arm; without it an implementation omitting that alternative passes everything else, spec §8.1).
- P3(b) fires: `Hotel 71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601`, `71 Wacker Drive 72 Main St Chicago, IL 60601`.
- Neither fires: `Hotel 71 71 E Wacker Dr Chicago, IL 60601`, `Four Seasons Fort Lauderdale`, and all 7 address-bearing corpus strings.
- **R1 guard on every case above:** the returned `{name, address}` is byte-identical to today's. `71 Wacker Drive 72 Main St …` must still yield `{name: "71 Wacker Drive", address: "72 Main St Chicago, IL 60601"}` — the UNPADDED read.
- **Consecutive-call regression:** three successive calls on `Westin Michigan Ave 909 Michigan Ave, Chicago, IL 60611` return identical results. This input MUST be one the unpadded splitter matches; a position-0 input would miss on every call and pass vacuously (spec §3.1).

**Implementation.** Add an optional third field to the return object. Detection evaluates `" " + cleaned`; the split itself keeps exec'ing the unpadded string (R1). Counting builds a fresh `new RegExp(STREET_ADDRESS_RE.source, STREET_ADDRESS_RE.flags + "g")` per call — **never** add `g` to the shared singleton, whose persistent `lastIndex` would make consecutive splitter calls alternate. Export `STREET_ADDRESS_ZIP_RE` (spec §4 row t).

**Kills:** an implementation that counts on the padded string and also splits there; one that adds `g` to the singleton; one that omits the suffix arm of P3(a).

### T2 — `commitHotels` single commit point

**Test first.** Extend `tests/parser/blocks/hotels.ambiguity.test.ts`:

- The two existing assertions (`tests/parser/blocks/hotels.ambiguity.test.ts:212` over-cap silence, `tests/parser/blocks/hotels.ambiguity.test.ts:168` at-cap boundary) pass **unchanged**.
- **Multi-reservation emission order:** over-cap parse, two surviving reservations each carrying an ambiguity → exact `agg.warnings` sequence is ambiguity(index 0), ambiguity(index 1), `HOTEL_CARDINALITY_EXCEEDED`. Asserted by position, not by code filter.
- **`blockRef.index` > 0:** two surviving reservations preceded by a skipped dash-only placeholder; the second warns with `index === 1`, and `applyUseRawDecisions` rewrites **only** `hotelReservations[1]` — index 0 byte-identical afterwards.

**Implementation.** Introduce `PendingHotel`/`HotelAmbiguity`; `commitHotels` replaces `cap()` and absorbs the emit loop inlined in `parseHotelTable`. All three producers return `PendingHotel[]`. Order: all surviving-reservation ambiguities, THEN cardinality (spec §5.2). A discarded provisional row discards its stash — that is why the stash rides on `PendingHotel` rather than emitting at the site (spec §3.1 row 8).

**Kills:** cardinality-first; ambiguity#1/cardinality/ambiguity#2 interleaving; `ordinal`-based indexing; emitting for a cap-truncated row.

### T3 — inline guest predicate (exit enumeration)

**Test first.** a new `hotels.inlineGuestAmbiguity` test file under `tests/parser/blocks/`:

- **The row 5 / row 6 discriminator pair** — `Hyatt Place Check In: 5/1 Check Out: 5/2 Eric` (MUST emit) vs `Hyatt Place Check In: 5/1 Check Out: 5/2` (MUST NOT). Both parse to `names: []`. This pair is the whole point: `groupIndex === 0 && names.length > 0` fails the first, "warn on every group-0 final return" fails the second, and **neither wrong implementation fails any other test in this plan.**
- One case per emitting enumeration row (1, 3, 4, 5), each asserting `reasons === ["inline-boundary-judgment"]`. The Pattern-2 case must be one Pattern 1 cannot claim first — Pattern 1 requires two capitalized words before the dash (`lib/parser/blocks/hotels.ts:784`).
- The R2/R3 counter-examples all emit: `Hyatt Regency Eric Weiss - 110525`, `Hyatt Regency Mary Ann Smith - 110525 John Smith - 103316 Jane Doe - 103317`, `… Check Out: 5/2 Guests: Mary Ann Smith John Doe`, `Hyatt Place Check In: 5/1 Eric Weiss John Smith`.
- Non-firing: the no-guest split path; the structured path.
- **`exporter-xlsx/consultants` — 2 reservations, exactly 1 card.** The anti-tautology anchor: a `names.length >= 1` predicate emits 2 and fails here.

**Kills:** every output-derived predicate the spec rejected across R2 and R3.

### T4 — address stash propagation, all callers

**Test first.** 9 behavioral cells (5 callers × P3(b), 4 × P3(a) — the inline-no-guest × P3(a) cell is not observable), **plus** the new source-scanning meta-test from §1.

**Implementation.** Each of the 5 call sites (`lib/parser/blocks/hotels.ts:413`, `lib/parser/blocks/hotels.ts:418`, `lib/parser/blocks/hotels.ts:607`, `lib/parser/blocks/hotels.ts:734`, `lib/parser/blocks/hotels.ts:765`) destructures the ambiguity and stashes it. First stash wins per reservation.

**Test also:** first-stash-wins pinned by CONTENT — on `71 Wacker Drive 72 Main St Chicago, IL 60601` the survivor is the **P3(b)** one (`reason`, `resolvable: true`, and the first invocation's `rawSnippet`). A last-stash-wins implementation satisfies a count-only oracle while downgrading a resolvable card to a disabled one.

### T5 — code registration (spec §4, 36 rows)

Single commit, because the three-lockstep gate (`x1-catalog-parity`) fails if any part drifts. Includes: master spec §12.4 new row AND the edit to the existing guest row; `pnpm gen:spec-codes`; **`pnpm gen:internal-code-enums`** (a different generator — running only the first leaves `internal-code-enums.ts` stale and fails the x2 gate); `catalog.ts` new row with all **9** keys including `code`; `AMBIGUITY_CODES`; `GAP_CLASSES` new row + the EDITED existing label; `FIELD_LABELS.address`; every hard-coded count (33→34, 53→54) and the test names and comments embedding them.

**Test first:** the count assertions and `ambiguityCodes.test.ts` list, which fail before the registration lands.

### T6 — emitters

`emitInlineGuestAmbiguity` and `emitHotelAddressSplitAmbiguity` in `lib/parser/warnings.ts`.

**Test first — full envelope on every emit:** `severity === "warn"`; `blockRef.kind === "hotels"`; `field` `"guests"`/`"address"`; `name` present when resolved and the KEY OMITTED when not (`exactOptionalPropertyTypes`); `rawSnippet` exact; and the byte-for-byte message (C1–C3).

**The P0 oracle:** `Hotel #9999 71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601 Eric Weiss - 110525 John Smith - 103316` → `replacement.hotelName` contains no confirmation token, and `applyUseRawDecisions` leaves `hotel_name` free of `#9999`. Every other P3(b) case uses a conf-free cell, so an unstripped implementation passes them all and still leaks into a crew-readable field.

**`contentHash`:** equals `contentHashForRawSnippet(rawSnippet)` computed independently in the test; two snippets differing **after collapsing** hash differently. Do NOT assert that any two different raw strings differ — the function hashes the collapsed form by design.

**`parsed` payload:** cross-checked against the actual reservation, not against the warning.

### T7 — types + overlay

`lib/parser/types.ts` gains the `hotel-name` `parsed`/`replacement` variants and the two new `resolvable:false` reasons; `USE_RAW_CODES` gains the code (without it `IN_SCOPE` excludes it and persisted decisions are dropped); `applyReplacement` gains the branch.

**Test first:** the undo behavioral test — emit P3(b), run `applyUseRawDecisions`, assert `hotel_name` equals the conf-stripped cleaned cell and `hotel_address === null`. A payload-only assertion passes even when the branch is missing.

### T8 — UI (`components/admin/UseRawControl.tsx`)

`IN_SCOPE` (`components/admin/UseRawControl.tsx:54`), `RADIOGROUP_LABEL` (`components/admin/UseRawControl.tsx:10`, exhaustive `Record` → compile error until added), `parsedFields` (`components/admin/UseRawControl.tsx:99`), `rawLabel` (`components/admin/UseRawControl.tsx:452-457`, whose else-branch would otherwise render the dates label), `DISABLED_REASON` (`components/admin/UseRawControl.tsx:258`), and `segmentRawReading` (`components/admin/UseRawControl.tsx:187`) returning TWO segments so the boundary is marked as structural splits are.

**Pre-code mechanical checklist** (run BEFORE writing, per the retrospective rule): em-dash ban in user-visible copy, apostrophe literals, 44px tap targets, canonical type/token classes. No new color token → no contrast meta-test.

**Test first:** byte-for-byte assertions for every §7.0 row (C1–C22), each compared against a **string literal in the test**, never an import of the value under test.

### T9 — corpus goldens

Both fixture families (spec §9): 5 cards from `raw/`, 4 from `exporter-xlsx/`, 0 address cards, with `consultants` at 2 reservations / 1 card. Quiet fixtures assert **zero** new warnings extracted by code.

### T10 — close the deferrals

Flip both `TRANSFORM_SITES` exempts to `code` entries, delete both BACKLOG rows and the now-empty section heading, extend `REQUIRED_DECLARATIONS`. **One commit** — the walker asserts every `deferred:BL-` ref resolves in BACKLOG.md, so flipping without deleting leaves dead rows and deleting without flipping fails the walker.

### T11 — remaining registry tests

`EXPECTED_CORPUS_WARN_CODES` (`tests/messages/warningCardCopyRegistry.ts:121`), `tests/admin/warningFixAffordance.test.tsx:20`, `tests/components/UseRawControl.test.tsx:746`, `tests/admin/step3Buckets.test.ts:180`.

### T12 — UI quality gate

`/impeccable critique` AND `/impeccable audit` on the UI diff, both with the canonical v3 setup gates. P0/P1 fixed or explicitly deferred via `DEFERRED.md`. Findings and dispositions recorded before close-out.

---

## 4. Checklist

1. T1 … T12 above, TDD per task, one conventional commit each
2. Self-review (numeric sweep + citation pass over this plan)
3. **Adversarial review (cross-model)** — Codex, to APPROVE
4. Full gates: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`
5. Whole-diff cross-model review to APPROVE
6. Push → **real CI green** (a separate gate from local green)
7. `gh pr merge --merge` → fast-forward local `main` → verify `git rev-list --left-right --count main...origin/main` is `0  0`

## 5. Snippet-typecheck note

Every code snippet embedded above is prose-level (type names and call shapes), not paste-ready test bodies — deliberately, because the repo's strict tsconfig (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) makes paste-time compile errors a known round-burner. Each task's real test body is typechecked as part of that task's red step, before its implementation is written.
