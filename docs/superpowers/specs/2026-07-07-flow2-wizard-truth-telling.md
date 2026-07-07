# Spec — Flow 2: Review-Wizard Truth-Telling (S-batch)

**Date:** 2026-07-07
**Slug:** `flow2-wizard-truth-telling`
**Source:** `docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` §6 Flow 2, items 2.2 / 2.3 / 2.4.
**Scope owner:** Opus / Claude Code (UI surface — invariant 8 + ROUTING "UI always Opus").

## 1. Problem

The Step-3 review wizard is "excellent at flagging what the parser *knows* went wrong … but plausible-but-wrong values render as-if-correct with zero confidence signal; `raw_unrecognized[]` is visible only on `/admin/dev`" and "'N ready to publish' implies verified; readiness = absence-of-known-warning only" (audit Flow 2 verdict, grade C+). This spec ships the three S-effort items that make the wizard tell the truth about what it did and did **not** understand. It does **not** attempt the structural P0-2 fix (per-field provenance / side-by-side snippet, audit item 2.1) — that is deferred to its own arc (audit §6 cross-flow note).

Three independent units, one PR, TDD + separate commit each.

---

## 2. Unit A — Honest readiness copy (audit 2.4)

### A.1 Current behavior

`renderSummary(sheetCount, readyCount, needsLookCount)` at `components/admin/wizard/Step3Review.tsx:838-886` composes the header summary line. Current clean-row copy asserts verification:

- all-clean plural: `All {readyCount} are ready to publish.`
- all-clean singular: `It's ready to publish.`
- mixed: `{readyCount} ready to publish, {look clause}`

`readyCount` = clean rows with no "needs a look" flag; `needsLookCount` = clean rows flagged. Both are computed at `Step3Review.tsx:927-929` (`readyCount = publishRows.filter(r => !rowNeedsLook(r)).length`). **"Ready to publish" over-claims:** a clean row means only "no known warning," never "verified correct against the sheet."

### A.2 New behavior

Reframe the clean-row clauses from a verification claim to a "no issues detected — spot-check" nudge, and make the summary honestly account for **every counted sheet that still needs Doug's forward action** (ready + needs-look + blocking). `renderSummary` gains a `blockingCount` parameter (already computed at the call site: `blockingCount = blockingRows.length`, `Step3Review.tsx:930`); its new signature is `renderSummary(sheetCount, readyCount, needsLookCount, blockingCount)`, called at `:1258`.

**Count definitions** (reviewer MEDIUM, round 3): `cleanCount = readyCount + needsLookCount` — the clean (staged/applied) rows, EXCLUDING blocking and set-aside rows. This mirrors the existing `renderSummary` local (`Step3Review.tsx:842`). TAIL keys on `cleanCount > 0` (there is at least one publishable row); all-blocking (`cleanCount === 0 && blockingCount > 0`) and all-set-aside (`cleanCount === 0 && blockingCount === 0`) both suppress TAIL.

Two reusable phrase helpers (grammar, fixes reviewer LOW): `looksClean(n)` = `n === 1 ? "1 looks clean" : "{n} look clean"`; `giveLook(n)` = `n === 1 ? "give it a quick look" : "give them a quick look"`.

Canonical copy (single source of truth; §A.3 tests assert exactly these normalized `textContent` forms). The line is composed as **HEAD + readiness-clause + attention-pointer + TAIL**:

| Segment | Condition | Rendered text |
|---|---|---|
| HEAD | always | `{sheetCount} sheet{s} parsed from your Drive folder.` |
| ALL-READY | `needsLookCount === 0 && blockingCount === 0 && readyCount > 0` | ` We didn't spot any issues — {giveLook(readyCount)} against your sheet before you publish.` |
| SOME-READY | `needsLookCount === 0 && blockingCount > 0 && readyCount > 0` | ` {looksClean(readyCount)} — {giveLook(readyCount)} before you publish.` |
| MIXED | `needsLookCount > 0 && readyCount > 0` | ` {looksClean(readyCount)}, {needsLookCount} need{s} a quick look before {they go\|it goes} live.` |
| NEEDSLOOK-ONLY | `needsLookCount > 0 && readyCount === 0` | ` {needsLookCount} need{s} a quick look before {they go\|it goes} live.` |
| ATTENTION-POINTER | `blockingCount > 0` (appended after the readiness clause, before TAIL) | ` {blockingCount} need{s} your attention below.` |
| TAIL | `cleanCount > 0` | ` Nothing publishes until you say so.` |

Composition edge cases:
- `readyCount === 0 && needsLookCount === 0 && blockingCount > 0` (all blocking): HEAD + ATTENTION-POINTER only, no readiness clause, no TAIL.
- `readyCount === 0 && needsLookCount === 0 && blockingCount === 0` (everything set-aside/skipped): HEAD only.

**Honesty gate (fixes reviewer HIGH-1, both rounds):** the unscoped "We didn't spot any issues" fires ONLY in ALL-READY (`needsLookCount === 0 && blockingCount === 0`) — i.e. no clean sheet is flagged AND no sheet is blocking. Any blocking sheet forces SOME-READY/MIXED/NEEDSLOOK scoping PLUS the ATTENTION-POINTER, so the summary always accounts for ready + needs-look + blocking and never implies a blocking sheet is clean. **Set-aside rows (permanent-ignore / defer-until-modified) are deliberately NOT enumerated** in the summary: Doug already dispositioned them, and they render in their own de-emphasized sections below (`Step3Review.tsx:931-933`); the TAIL ("Nothing publishes until you say so") covers them. This is why the gate keys on `blockingCount`, not `readyCount === sheetCount` (`sheetCount` includes set-aside rows, which must not force the scoped wording).

Pluralization rules: `sheet{s}` → `s` when `sheetCount !== 1`; `need{s}` (needs-look clause) → `needs` when `needsLookCount === 1` else `need`; `{they go|it goes}` → `it goes` when `needsLookCount === 1` else `they go`; `need{s}` (ATTENTION-POINTER) → `needs` when `blockingCount === 1` else `need`.

**Presentation-only emphasis** (unchanged pattern): bold counts via `<b className="font-semibold text-text-strong">`; the needs-look clause keeps `text-warning-text`. Normalized `textContent` (single-spaced, per existing test normalization) equals the plaintext above — emphasis MUST NOT change textContent.

### A.3 Guard conditions

- `sheetCount === 0`: `renderSummary` is only called with the visible-row partition; `cleanCount === 0` yields head-only. A zero-sheet folder is handled upstream (empty state), not here. Behavior: head renders `0 sheets parsed from your Drive folder.` with no readiness clause. (No change from today.)
- `readyCount === 0 && needsLookCount === 0 && blockingCount === 0` (all set-aside/skipped): HEAD only, no tail.
- `readyCount === 0 && needsLookCount === 0 && blockingCount > 0` (all blocking): HEAD + ATTENTION-POINTER, no tail.
- `blockingCount > 0` with any clean rows: readiness clause is scoped (SOME-READY/MIXED/NEEDSLOOK) and the ATTENTION-POINTER always appends — the unscoped "we didn't spot any issues" is unreachable (reviewer HIGH-1).
- Negative / NaN counts: not reachable — all four counts are `Array.filter(...).length`. No guard added.

### A.4 Descoped

Audit 2.4's second half — "distinguish 'no crew found in the sheet' vs 'we couldn't read the crew section'" — is **DESCOPED**. Verified: the crew block emits no section-missing/unreadable warning (`lib/parser/blocks/crew.ts` emits only `COLUMN_HEADER_AUTOCORRECTED`, `STAGE_WORD_AUTOCORRECTED`, `UNKNOWN_DAY_RESTRICTION`); only CLIENT/DATES carry empty-vs-unreadable codes (`lib/messages/catalog.ts:699,709`). The distinction is not derivable without a new parser signal (scope creep into `lib/parser`). Deferred.

---

## 3. Unit B — Warning re-routing (audit 2.3)

### B.1 Current behavior

`sectionForWarning(w)` at `lib/admin/step3SectionStatus.ts:68-72` returns `KIND_TO_SECTION[w.blockRef?.kind] ?? null`. `warningsBySection` (`:74-88`) routes a warning to its mapped section **iff** that section is in `renderedSections`, else to the generic `"warnings"` bucket; a `null` mapping always lands in `"warnings"`.

**Live-code survey (verified this session):** every warn-severity ParseWarning kind emitted by `lib/parser/**` already maps through `KIND_TO_SECTION` — `crew`, `travel`, `transportation`, `rooms`, `pull_sheet`, `venue`, `details`, `contacts`, `client`, `dates`, `financials`, and the `SECTION_HEADER_AUTOCORRECTED` kinds (`CANON_TO_REGION` = {`transportation`,`details`,`crew`} at `sectionHeaderNormalize.ts:28-34`, all mapped). The **sole** warn code that returns `null` from `sectionForWarning` is `UNKNOWN_SECTION_HEADER` (`emitUnknownSection`, `lib/parser/warnings.ts:106-114`), which sets `blockRef.kind = "unknown_section"` and carries the offending header text in `rawSnippet` (no `blockRef.name`).

So the routing gap is narrow and precise: an unrecognized section header that is a **whole-header synonym/rename** of a known section ("STAFF" for crew, "LODGING" for hotels, "LOCATION" for venue) is a warn-severity signal that always falls to the generic bucket even though the header clearly *intends* a section Doug is looking at. (Typo'd or multi-word-garbled headers like "Hotal Contact Info" are NOT in scope for Unit B — an edit-distance typo is the parser autocorrect layer's job, not a synonym router's; §B.2 explains why.)

### B.2 New behavior

Add a **synonym-based best-guess resolver** for `UNKNOWN_SECTION_HEADER` warnings (only): when `sectionForWarning` returns `null` AND the warning is `UNKNOWN_SECTION_HEADER`, attempt to resolve a section from the header text via a curated synonym vocabulary; route there only if a synonym matches **and** the section is rendered; otherwise keep the current generic-bucket behavior.

**Why a synonym map, NOT the parser's canonicalizer (design rationale, reviewer MEDIUM-4):** a header emits `UNKNOWN_SECTION_HEADER` after failing the parser's Damerau autocorrect tolerance — a header the canonicalizer *could* match within edit-distance would (in the common case) have been rewritten to `SECTION_HEADER_AUTOCORRECTED` (which already maps via `CANON_TO_REGION`) and not reached this path. So reusing the same edit-distance canonicalizer would add little: it targets the same typo class the parser already handled. The gap Unit B targets is a *different* class — **renamed sections** (audit Flow 5 P1-5, live-probe): `STAFF`, `LODGING`, `LOCATION` are *synonyms*, not typos, of known sections; edit-distance can't catch a synonym, a curated map can. This is a design-choice rationale, not a proof that the canonicalizer is a strict no-op on every conceivable input — Unit B does not depend on that absolute claim, only on synonyms and typos being different classes needing different matchers.

- The resolver lives in `lib/admin/` (NOT `lib/parser` — no parser touch, no Codex-owned surface). It holds a small curated map of uppercased synonym → `SectionId`, seeded from the audit's live-probe rename list. **Canonical `SectionId` values** are exactly the `SectionId` union at `lib/admin/step3SectionStatus.ts:4-18` (`venue | event | crew | contacts | schedule | agenda | hotels | transport | rooms | diagrams | packlist | billing | warnings | report`). `hotels` (lodging reservations) and `rooms` (venue breakout rooms / gear scope) are **distinct** sections; a lodging synonym maps to `hotels`, never `rooms` (reviewer HIGH-2, round 2). Every map value MUST be a member of that union (a compile-time `Record<string, SectionId>` enforces it). Initial seed (plan enumerates/finalizes):
  - `STAFF`, `PERSONNEL` → `crew`
  - `LODGING`, `ACCOMMODATION`, `ACCOMMODATIONS`, `HOTEL INFO` → `hotels`
  - `LOCATION`, `VENUE INFO` → `venue`
  - (`TECH`, `CREW`, `TRANSPORTATION`, etc. are already in the parser's `CANON_TO_REGION`/vocab → they autocorrect and never reach here; they are NOT in this map.)
- **Match rule (EXACT normalized equality only — reviewer MEDIUM, round 3):** normalize `warning.rawSnippet` (uppercase, collapse internal whitespace to single spaces, trim, strip trailing punctuation) and route ONLY if the normalized header **equals** a synonym key in full. A renamed section header *is* the whole header (`STAFF`, `LODGING`, `HOTEL INFO`) — so containment is unnecessary and harmful: a "contains" rule would misroute contextual/negated headers (`CLIENT HOTEL INFO`, `NO HOTEL INFO`, `OLD VENUE INFO`, `PREVIOUS LOCATION`) to a plausible-but-wrong section, exactly the confident-wrong-value class this batch is trying to reduce. Multi-word keys (`HOTEL INFO`, `VENUE INFO`) still match when they ARE the whole header. A foreign header (`SHIPPING`, `CATERING`, `CREDENTIALS`) or a contextual phrase containing a synonym → no exact match → `null` → generic bucket. The map is a **closed allowlist**; a header routes only if it exactly equals a known rename.
- **Rendered gate preserved:** even a matched guess routes to the guessed section only if `renderedSections.has(guess)`; else generic bucket. (Identical rule to mapped warnings today — so a synonym for a section this sheet doesn't render still lands in the warnings bucket.)
- **Routing-only, not parsing:** the guessed section's rows are still genuinely unparsed (that is why the warning exists). Unit B moves only the *flag* onto the section card Doug most likely associates the header with; it never claims the section parsed. The flag copy remains the `UNKNOWN_SECTION_HEADER` message.

`sectionForWarning`'s existing signature stays; the synonym best-guess is an internal extension gated on `code === "UNKNOWN_SECTION_HEADER"`. `warningsBySection` / `deriveSectionStatuses` consume the result unchanged (the flag set and the callout map stay derived from one function — the §E2 single-source invariant).

### B.3 Guard conditions

- `w.blockRef` absent OR `w.blockRef.kind` present-and-mapped: unchanged path (mapped or generic per today's rules). Best-guess is reached ONLY for `code === "UNKNOWN_SECTION_HEADER"`.
- `w.rawSnippet` null/empty: no guess possible → generic bucket.
- No synonym-map entry matches the normalized header (foreign header): generic bucket.
- Matched guess whose section is not rendered for this sheet: generic bucket.
- Non-warn severity: the synonym best-guess branch inside `sectionForWarning` is entered only when **`w.severity === "warn"` AND `w.code === "UNKNOWN_SECTION_HEADER"`** — a local, self-contained guard checking severity directly, NOT relying on the emitter's convention (reviewer MEDIUM, round 2). So even a malformed/hand-built `{ code: "UNKNOWN_SECTION_HEADER", severity: "error" }` passed to `sectionForWarning` directly (it is exported and unit-tested) cannot reach the synonym map. `warningsBySection`'s existing `severity !== "warn"` early-return (`:80`) is a redundant outer gate, not the sole one.

### B.4 Anti-tautology test posture

Tests assert these cases, all as `UNKNOWN_SECTION_HEADER` warnings:

1. **Correct-mapping per seed entry (reviewer HIGH-2 — independent oracle).** For EACH seed entry, a case pinning the expected `SectionId` as an **independent hardcoded literal**, NOT read back from the map under test: `"STAFF" → "crew"`, `"LODGING" → "hotels"`, `"LOCATION" → "venue"`, etc. A per-entry literal table in the test proves the map's *values* are correct (a `LODGING → venue` bug fails here), not merely that routing is non-empty. Deriving expected from the map would let a wrong map pass — forbidden.
2. **Negative controls** — headers that MUST land in the `warnings` bucket: a fully foreign header (`"SHIPPING"`), AND (reviewer MEDIUM, round 3) contextual/negated phrases that *contain* a synonym but are not a rename (`"CLIENT HOTEL INFO"`, `"NO HOTEL INFO"`, `"OLD VENUE INFO"`). These prove exact-match (not containment) and the closed-allowlist gate.
3. **Rendered gate** — a mapped rename whose section is NOT in `renderedSections` (`"LODGING"` when hotels isn't rendered → `warnings` bucket).
4. **Not-reached-for-typos (reviewer MEDIUM-4 + round-3 LOW — parser-generated, exact fixture pinned).** Feed a concrete within-tolerance typo header through the actual parser (`parseSheet`/exporter path) and assert the emitted warning is `SECTION_HEADER_AUTOCORRECTED` with the expected mapped `blockRef.kind` — never `UNKNOWN_SECTION_HEADER`. **Pin the exact fixture:** candidate `TRANSPORTATON` (one deletion from `TRANSPORTATION`) → expect code `SECTION_HEADER_AUTOCORRECTED`, `blockRef.kind = "transportation"`. The plan MUST confirm this exact header is within the parser's Damerau tolerance against live code before locking it in; if it is not, substitute a verified within-tolerance typo (do NOT rewrite the assertion to make an arbitrary typo pass). Must use a parser-generated warning, never a hand-built `ParseWarning` literal.

The per-entry literals (case 1) plus the negative + rendered-gate controls (cases 2–3) ensure no assertion can pass by blanket-routing or by a wrong map.

---

## 4. Unit C — "Content we couldn't read" callout (audit 2.2)

### C.1 Current behavior

`raw_unrecognized` (`{ block: string; key: string; value: string }[]`, `lib/parser/types.ts:388,418`) is populated by `emitUnknownField` (`lib/parser/warnings.ts:124-140`) for every row whose label resolved to no known field inside a block scope. It **already reaches the wizard**: `OnboardingWizard.tsx:545` coerces `parseResult` from the `pending_syncs.parse_result` jsonb (raw_unrecognized included), and `:619` assigns it to `Step3Row.parseResult`. Today it is rendered **only** on `/admin/dev` (`app/admin/dev/page.tsx`); the wizard drops it on the floor.

### C.2 New behavior

Render a **"Content we couldn't read"** callout inside the per-sheet review body (the same surface that renders section flags — `Step3ReviewModal` / `step3ReviewSections.tsx`), reading `row.parseResult.raw_unrecognized`.

- **Placement:** a dedicated callout in the review body, visually consistent with the existing warning/flag chrome (reuse the section-flag callout styling; do NOT invent a new visual language). It sits alongside the section list, not inside a specific parsed section.
- **Header:** `Content we couldn't read ({n})` where `n = raw_unrecognized.length`. Plain-language subtitle: `These rows were in your sheet but didn't match anything we know how to read. They aren't published — check whether they matter.`
- **Body:** collapsible (collapsed by default). Expanded → rows grouped by `block`, each block a labeled group; each row shows `key` and `value` as a `label | value` pair using the same neutral row treatment as `/admin/dev`. `block` is a raw parser scope name (e.g. `hotels`, `event_details`) — render it title-cased via the existing block-label map if one exists, else as-is (no fabricated mapping).
- **No raw error codes** (invariant 5): the callout shows sheet content (`key`/`value`/`block`), never a parser code. `raw_unrecognized` carries no codes, so this is satisfied by construction; the header/subtitle copy is static prose.
- **Escaped-text rendering only (reviewer MEDIUM, round 3):** `key`, `value`, and any raw-`block` fallback are arbitrary persisted spreadsheet content and MUST be rendered as React text children (auto-escaped) — NEVER via `dangerouslySetInnerHTML`, and never interpreted as HTML/markdown. This closes the same malformed-jsonb boundary as §C.3 against weird/hostile sheet text (embedded `<script>`, angle brackets, control chars). A test asserts a callout row containing HTML-like text renders it literally, not as markup.

### C.3 Guard conditions (per the global "guard conditions for every prop" rule)

Because `raw_unrecognized` is coerced from persisted `jsonb` (§C.1), type-level guarantees are NOT enough — the render path fail-closes on malformed data (reviewer MEDIUM-5). A single **sanitizer** normalizes the raw value to a clean `{block,key,value}[]` before any rendering:

- `row.parseResult == null` (non-staged row): callout not rendered.
- `row.parseResult.raw_unrecognized` absent/`undefined` OR **`null`** OR **not an array** (older/malformed persisted jsonb): coalesce to `[]` → callout not rendered. Never throws.
- **Per-entry validation (strict `typeof`, not coercion — reviewer MEDIUM, round 2):** an element is KEPT only if it is a non-null plain object whose `key` is a `typeof === "string"` with non-whitespace content. `null`, arrays, primitives, and objects with a non-string or empty/whitespace `key` are **dropped** — never string-coerced (coercion would render `"null"`, `"[object Object]"`, `"undefined"` noise instead of failing closed). For a kept element: `block` is used only if `typeof === "string"` and non-whitespace, else the `Other` bucket; `value` is used only if `typeof === "string"`, else treated as empty (`—` placeholder). The header count `n` reflects the SANITIZED length (post-drop), so the count never over-promises rows the UI can't show.
- `sanitized.length === 0` (empty, or everything dropped): callout not rendered (no "0 items" chrome).
- Kept entry with empty (`""`) or non-string `value`: render `key` with an em-dash placeholder (`{key} | —`), never a blank that reads as "we lost it."
- Kept entry with empty/whitespace or non-string `block`: grouped under an `Other` bucket label rather than an empty group header.

### C.4 Cap / truncation (per the global cap rule)

`raw_unrecognized` is unbounded in principle (a garbage tab could produce hundreds of rows). Cap the **expanded** list at **50 rows total** across all groups; beyond that, render `+{n − 50} more not shown` as the final line. The header count `n` always reflects the true **sanitized** total (§C.3), never the capped count. Collapsed state always shows only the header + count.

**Ordering (reviewer MEDIUM-6 — deterministic):** the sanitized entries keep their original `raw_unrecognized` array order (the parser's emission order). Groups are formed by first-appearance of each `block` in that order (stable), and rows within a group keep emission order. The "first 50" are therefore the first 50 sanitized entries in emission order — stable across renders and reproducible in tests. No sorting by block name, key, or value.

### C.5 Transition inventory

The callout has two states: **collapsed** and **expanded**. One transition pair:

| From → To | Treatment |
|---|---|
| collapsed → expanded | Follow the existing collapsible-section pattern already used in the review body (same disclosure animation/instant behavior as sibling collapsibles). If sibling collapsibles are instant, this is instant; match them — do NOT introduce a bespoke animation. |
| expanded → collapsed | Same as above, reversed. |

No compound transitions (the callout's state is independent of card/modal open state; it resets to collapsed on each modal open, matching sibling disclosure defaults).

### C.6 Dimensional invariants

The callout is flow-content (auto height, full container width) inside the scrollable review body — no fixed-dimension parent, no flex/grid child needing an explicit stretch. **No Dimensional Invariants section required** (no fixed-height parent). If implementation places it in a fixed-height row, that introduces the invariant and the plan MUST add the real-browser layout assertion; the design does not.

---

## 5. Cross-cutting

### 5.1 Invariants

- **Invariant 5 (no raw error codes in UI):** Units A/C render only prose + sheet content; Unit C surfaces `key`/`value`/`block` (sheet data), never codes. No `lib/messages/lookup.ts` change needed (no new user-facing code).
- **Invariant 8 (impeccable dual-gate):** Units A and C touch `components/admin/wizard/**` (UI surface). `/impeccable critique` + `/impeccable audit` run on the A+C diff before cross-model review; HIGH/CRITICAL fixed or `DEFERRED.md`-deferred. Unit B (`lib/admin/step3SectionStatus.ts`) is not a UI surface (pure lib) — no impeccable gate for B alone, but it ships in the same PR.
- **Invariant 10 (mutation-surface telemetry):** No mutation surface added. Units A/B are pure render/derivation; Unit C is read-only render. No route handler, no `"use server"` action, no DB write. N/A — no registry row needed.
- **No DB / no advisory locks / no migrations / no new §12.4 codes.** Tier×domain matrix, CHECK/enum matrix, advisory-lock topology, validation-schema-parity: all N/A (no DB touch).

### 5.2 Meta-test inventory

- **No new meta-test created or extended.** None of the registries (Supabase call-boundary `_metaInfraContract`, sentinel-hiding, admin-alert catalog, advisory-lock topology, no-inline-email, mutation-surface observability) is touched: no Supabase call site, no tile sentinel, no admin alert, no lock, no email normalization, no mutation surface. Declared explicitly per the writing-plans meta-test-inventory rule. Existing `tests/admin/step3SectionStatus.test.ts` and `tests/components/admin/wizard/Step3Review.test.tsx` are extended (not meta-tests).

### 5.3 Files touched (all verified live this session)

| Unit | File | Change |
|---|---|---|
| A | `components/admin/wizard/Step3Review.tsx` (`renderSummary`:841, call site :1258) | Copy reframe + new `blockingCount` param; compose HEAD + clause + ATTENTION-POINTER + TAIL per §A.2 |
| A | `tests/components/admin/wizard/Step3Review.test.tsx` (:154,163,175,185,195) | Update pinned strings to §A.2 canonical copy; ADD cases covering ATTENTION-POINTER (a blocking row present) and the `looksClean(1)` singular grammar — a blocking-present render exercises the branch the round-2 fix added |
| B | `lib/admin/step3SectionStatus.ts` (`sectionForWarning`, :68-72) | Call new synonym resolver when `sectionForWarning` returns null AND `code === "UNKNOWN_SECTION_HEADER"` |
| B | `lib/admin/sectionSynonymGuess.ts` (NEW) | Curated closed-allowlist synonym→`SectionId` map + normalized-header match. No `lib/parser` touch |
| B | `tests/admin/step3SectionStatus.test.ts` | Rename-match + negative-control (foreign) + rendered-gate + not-reached-for-autocorrectable cases |
| C | `components/admin/wizard/step3ReviewSections.tsx` and/or `Step3ReviewModal.tsx` | New "Content we couldn't read" callout (exact host confirmed at plan time) |
| C | `tests/components/admin/wizard/` (new/extended) | Guard conditions (null/non-array/null-entry/empty-key/non-string), grouping + Other bucket, 50-row cap + emission order, collapse↔expand, **reset-to-collapsed on modal reopen** (reviewer LOW, round 3 — §C.5), and **HTML-like text renders literally** (escaped, §C.2) |

### 5.4 Out of scope (do not relitigate)

- Per-field provenance / raw-snippet side-by-side (audit 2.1) — separate arc, deferred by design (audit §6 cross-flow note).
- The `renderedSections`-fallback leakage for *mapped* warnings whose section isn't rendered — pre-existing behavior, intentionally unchanged (Unit B touches only `null`-mapped `UNKNOWN_SECTION_HEADER`). Widening it risks routing a warning to a section with no home.
- Empty-vs-unreadable crew distinction (audit 2.4 half) — descoped, §A.4, no derivable signal.
- Autocorrect codes in the dashboard chip / regression gate (audit 2.2-adjacent Flow 6 item 6.3) — different flow, out of this batch.

---

## 6. Done-when

A plausible-but-wrong parse is *more* detectable in the wizard than today: (A) the summary no longer tells Doug a clean sheet is "ready to publish" (verified), it tells him to spot-check; (B) an unrecognized-but-intended section header's flag appears on the section Doug is looking at when confidently guessable, else in the warnings bucket; (C) everything the parser captured but couldn't understand (`raw_unrecognized`) is visible in the wizard, grouped and capped, instead of only on `/admin/dev`. No new DB surface, no new user-facing codes, no mutation surface. Impeccable dual-gate green on A+C; cross-model APPROVE on the whole diff; real CI green.
