# Substitute adversarial spec re-review — field near-miss detector (round 2)

**Reviewer:** independent fresh-eyes Claude (substitute for cross-model Codex; recorded as a
substitute review, never as a cross-model APPROVE).
**Subject:** repair of round 1's 9 findings.
**Repair diff:** `git diff 8327d1433..448a0ae09` (spec + plan + r1 probe artifacts only).
**Repaired spec:** `docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md`
**New plan:** `docs/superpowers/plans/2026-08-15-field-near-miss-detector.md`
**Worktree:** `/Users/ericweiss/FX-worktrees/mutation-section-order` @ `448a0ae09`
**Role:** REVIEWER ONLY. No fixes proposed as commits; no nested reviews dispatched.

**FINDINGS: 7** (3 r1 findings not addressed, 4 introduced by the repair)
**VERDICT: BLOCKING**

Scope fences unchanged from r1: spec §1.1 items 1–8, the §3.1 calibrated rule and guards, the
§3.2 72-row baseline, §3.3 ledger 3-way semantics, and the wave amendment are ratified and not
relitigated. The §3.2 fenced guard rejections are not re-proposed. Consequence bound and
threat-model fence per the r1 header still apply: no finding below asks for a matcher or guard
tightening, and none rests on a hypothetical input — every one is settled by a probe against the
live tree or by an executable gate.

Probes written for this round (under `.claude/tmp/`, rerun with
`pnpm exec tsx --tsconfig tsconfig.json <file>`): `r2-probe-typo-regate.ts`, `r2-probe-rooms.ts`.

---

## Per-finding verdicts

| # | r1 finding | Verdict |
|---|---|---|
| F1 | `TYPO_NORMALIZED` second consumer / AC-N2 | **NOT ADDRESSED** |
| F2 | `block` / `blockRef.kind` contract | **ADDRESSED** |
| F3 | Copy lockstep incomplete | **ADDRESSED** (a, c, d verified; see N3) |
| F4 | §2.3 entity-decode site cannot deliver AC-N4 | **NOT ADDRESSED** |
| F5 | Ledger semantics ≠ baseline mechanism | **ADDRESSED** |
| F6 | §3.2 / §9 contradict the calibration | **NOT ADDRESSED** (§3.2 fixed, §9 not) |
| F7 | §9 "no regression" refuted | **ADDRESSED** |
| F8 | §1 attribution | **ADDRESSED** |
| F9 | Stale downstream comment | **ADDRESSED** |

---

## F1 — NOT ADDRESSED. The replacement gate is unsatisfiable by construction; AC-N8's positive direction cannot be written

The repair adds an explicit §2.1 disposition, which is what F1 asked for in form. The mechanism it
states does not work.

> "Its gate re-keys from the positional window to the STORE EVENT: emit iff the row's typo alias
> resolved to a `venue.*` canonical AND `parseVenue` stores that field from this row"

Both conjuncts are checkable, and their intersection is empty.

**Conjunct 1 — typo aliases resolving to `venue.*`.** `TYPO_ALIASES` has exactly four members
(`lib/parser/aliases.ts:142-147`). Probe (`r2-probe-typo-regate.ts`):

```
  "hotal contact info" -> venue.contact_info   isTypo=true
  "diagrams"           -> details.diagrams     isTypo=true
  "virtaul audience"   -> details.virtual_audience  isTypo=true
  "goosneck"           -> details.gooseneck    isTypo=true
```

Exactly one is `venue.*`: `venue.contact_info` (`aliases.ts:27`).

**Conjunct 2 — fields `parseVenue` stores.** `parseVenue` writes only `venue.name`,
`venue.address`, `venue.loading_dock`, `venue.google_link`, `venue.notes`
(`lib/parser/blocks/venue.ts:182-188`, `:225-234`, `:254-303`, result at `:324-330`). There is no
`venue.contact_info` branch anywhere in the file — `grep -n "contact_info" lib/parser/blocks/venue.ts`
returns nothing outside the header comment.

**Therefore the two conjuncts are never both true, on any input.** After the re-gate,
`TYPO_NORMALIZED` becomes permanently dead code. Consequences:

1. **The disposition is a silent retirement dressed as a preservation.** §2.1's heading says
   "re-gated, not orphaned". F1 named two wrong branches (keep the flag → artifact survives;
   delete the flag → silent un-gating). This is a third: the code is silently *never* emitted,
   which reverses the same prior review decision (`venue.ts:145-155`) from the opposite side, with
   no baseline delta, no catalog disposition, and no statement that a shipped info code is being
   retired.
2. **AC-N8's positive direction is unconstructible.** "a constructed typo venue-field row inside
   the venue block fires exactly once at the store" cannot be written without first adding a new
   `TYPO_ALIASES` member that maps to a field `parseVenue` stores — an unscoped vocabulary change.
   As written this is exactly the premise-false guard class AGENTS.md names
   (`BL-GUARD-PREMISE-REACHABILITY`, `docs/agents/writing-plans.md`): a discriminating condition
   that can never be true, so the assertion passes unconditionally and forever.
3. **AC-N8's census is a tautology.** "0 today, 0 after" is true, but 0-after follows from the gate
   being unreachable, not from the gate being correct. It pins nothing.

**Corpus scale, for the record (not a prescribed fix).** `Hotal Contact Info` appears in **10 of
the 17 fixtures** (probe output above). Today all 10 are silent because they sit outside the
positional window *and* resolve non-null, so they also skip the `UNKNOWN_FIELD` branch. Any gate
keyed on the `venue.*`-canonical conjunct alone would be row-local and swap-invariant but is a
**+10 emission delta**, not 0 — which is a baselineable, AC-able outcome, and is the measurement
§2.1 would need to state.

**Two smaller defects in the same paragraph.**

- **The swap-invariance claim does not hold for the store conjunct in general.** §2.1 says
  "content-keyed, so swap-invariant". The store event is guarded by first-wins predicates
  (`name === null`, `address === null`, … `venue.ts:182-188`, `:254-303`), so which of two
  competing rows stores is document-order dependent. Moot while the gate is unreachable; it
  becomes live the moment the store conjunct survives in any form.
- **The worked example attributes the silence to the wrong conjunct.** `Virtaul Audience` in a
  `DETAIL CHECKLIST` block is excluded by conjunct 1 (`details.virtual_audience`, not `venue.*`)
  before the store conjunct is ever consulted.

---

## F2 — ADDRESSED

§2.2 now carries a normative `block`/`blockRef.kind` mapping with all three consumers enumerated
and pinned, and AC-N9 makes the Stage/Storage anchoring executable. Verified against the tree:

- `BLOCKS` holds exactly `venue` and `details` (`lib/drive/unknownFieldAnchors.ts:24-27`);
  `resolveUnknownFieldCell` matches on kind equality (`:171-182`) and returns `null` on a falsy
  kind (`:176`).
- Today's `parseEvent` emission is `kind: "details"` (`lib/parser/blocks/event.ts:224-229`), so
  the mapping's `"details"` arm preserves anchorability for the four Stage/Storage rows exactly as
  AC-N9 requires.
- The "rows in non-anchor blocks resolve `null`, documented-safe" statement matches the scanner's
  actual coverage.

**Two disclosure gaps, recorded so a later round does not re-derive them (not blocking).**

1. Consequence (c) says the persisted `block` changes only "for the venue-window rows that leave
   the baseline anyway". The mapping also changes the 8 `parseEvent` rows — which *stay* in the
   baseline — from `"event_details"` (`event.ts:226`) to `"details"`. No live consumer keys on
   that value (`grep -rn rawUnrecognized lib app` → producer `lib/parser/warnings.ts:365`,
   pass-through `lib/parser/index.ts:810`, `app/admin/dev/actions.ts`, and a raw render at
   `app/admin/dev/page.tsx:304-309`), so this is understatement, not breakage. It also changes the
   `emitUnknownField` message text (`Unrecognized ${opts.block} row label`, `warnings.ts:360`),
   which Task 5 rewrites anyway.
2. The mapping's third arm ("otherwise the row's normalized physical block-opener label") states
   no behavior for a row whose block has no opener. The empty-string result is safe
   (`resolveUnknownFieldCell` early-returns `null`), but the guard condition is unstated —
   AGENTS.md's "guard conditions for every prop" rule.

---

## F3 — ADDRESSED (with one new self-consistency defect, filed as N3)

All four sub-points land, and every citation the repair introduces verifies:

- (a) The §12.4 prose edit is now named and ordered FIRST, with both locators correct:
  `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2897` is the `UNKNOWN_FIELD` dougFacing
  table row; `:3253` is the `helpfulContext` entry. Plan Task 5 Step 1 carries the same ordering.
- (b) The full copy surface is enumerated rather than 2 of 6 (see N3 for the count defect).
- (c) The citation error is corrected: `STAGE_WORD_AUTOCORRECTED` is indeed at
  `lib/messages/catalog.ts:1428-1443`, and the `UNKNOWN_FIELD` row at `:1307-1321`.
- (d) The interpolation surface is named (`lib/messages/lookup.ts:12-34`; `PLACEHOLDER_RE` at `:12`,
  `interpolate` through `:34`), with the unresolved-placeholder consequence stated and a plan step
  that forces the decision.

`tests/cross-cutting/codes.test.ts` does deep-match the four fields (`:78-91`); the spec's "81-96"
is r1's own range carried forward and is close enough to resolve.

---

## F4 — NOT ADDRESSED. All three replacement sites are refuted by probe; AC-N4 is still unreachable

The repair correctly removes `_sectionHeaderMatch.ts` and correctly names `rooms.ts` as the file.
The stated defect is wrong at every one of the three sites.

**Sites 2 and 3 are behavioral no-ops.** §2.3 says `isKnownSectionHeader` and
`canonicalSectionKind` must "decode entities before the exact/prefix check, closing the sequencing
gap where the raw `&#10;` text prefix-matched through `&`". Probe (`r2-probe-rooms.ts`):

```
  isKnownSectionHeader("ADDITIONAL ROOM&#10;Dimensions&#10;Floor") = true
  canonicalSectionKind(...)                                        = rooms
  isKnownSectionHeader(decoded)                                    = true
  canonicalSectionKind(decoded)                                    = rooms
```

Encoded and decoded inputs already produce identical results. There is no gap to close at
`knownSections.ts:202` or `sectionKind.ts:82` — the decode changes nothing observable.

**Site 1 is the right file but the wrong mechanism: `rooms.ts` already decodes and already
matches.** `parseAdditionalRoom` is at `lib/parser/blocks/rooms.ts:1463` (not `:535`, which is the
call site inside `parseRooms`). Its matcher is
`const re = /^\|\s*(ADDITIONAL\s+ROOM[^|]*?)\s*\|/m` (`rooms.ts:1471`) — `[^|]*?` matches the
encoded header verbatim — and the very next lines decode it:
`const rawHeader = m[1]!.replace(/&#10;/g, "\n")` (`rooms.ts:1478`). Adding entity-decoding to
"the col-0 it tests" is a no-op here too. (The regex is also not "defined near `rooms.ts:100-107`";
that range is the `SECTION_HEADER_TOKENS` doc comment explaining why rooms is `IMPORT_LINK_EXEMPT`.)

**The block is dropped for a different, deliberate reason.** Probe on the RPAS fixture:

```
### fixtures/shows/raw/2025-03-dci-rpas-central.md
  header cell: "ADDITIONAL ROOM&#10;Dimensions&#10;Floor"
  rooms kinds: gs:"General Session", breakout:"LASALLE B", breakout:"LASALLE A"
  additional rooms: []
```

The fixture block (`fixtures/shows/raw/2025-03-dci-rpas-central.md:321-327`) is an unfilled
template stub — placeholder header, empty value column on `Setup` / `Set Time` / `Show Time` /
`Strike Time` / `LED`. `parseAdditionalRoom` builds the room and then drops it at
`rooms.ts:1491`:

```ts
if (!roomHasContent(room) && isPlaceholderRoomName(room.name)) return null;
```

This is a documented anti-phantom contract, stated twice (`rooms.ts:714-724`: "an unfilled
template stub … has no fields, so it is dropped rather than added as an all-null room";
`rooms.ts:1488-1491`). The v4 path's `!col0.includes("&#10;")` exclusion (`rooms.ts:722`) is the
deliberate steer of encoded headers into this v2 fallback, not an oversight.

**Consequences.** AC-N4 as written ("the entity-decode repair makes the `ADDITIONAL ROOM` block
parse as `rooms.additional` payload") is not reachable by any decode, and reaching it means
reversing the anti-phantom contract to admit an all-null room — a product decision neither the
spec nor the plan acknowledges. §2.3's downstream claim ("after it, those 2 rows stop being
near-miss candidates (they resolve)") therefore does not hold either, which puts the §3.2
72-row arithmetic — computed on "post-repair state" — at risk of a 2-row miss. Plan Task 4 Step 3
does fail loudly on a count ≠ 72, so this surfaces rather than corrupts; it blocks the plan rather
than shipping wrong.

---

## F5 — ADDRESSED

§3.3 is now deletion-diff-equivalent and closes both divergences r1 named: gated fuzzy correction
is admitted explicitly (`gatedVocabCorrect`, live at `lib/parser/blocks/event.ts:200` and `:296` —
the spec's ":292-298" brackets the real call), and the resolved-but-not-written case is settled by
placing the mark at the write, after the `presence()`/sentinel filters. The derived cover is a
walk over the 11 `ParseAggregator`-taking modules plus an *executable* arbiter (the committed
72-row baseline equals the deletion-diff measurement), which satisfies the
class-sweep-to-a-derivation rule rather than re-listing two incidentally-found sites.
`transport.ts:217` verifies as the cited label regex.

Plan-side drift noted at N4-adjacent: Task 1's **Interfaces** block lists only the `event.ts`
exact branch, `contacts.ts`, and `transport.ts`, omitting `gatedVocabCorrect`; Task 1 Step 3 does
include it. The two halves of the same task disagree.

---

## F6 — NOT ADDRESSED (§3.2 repaired, §9 untouched)

The §3.2 half is fully fixed and now sums exactly: 7 + 25 + 15 + 21 + 2 + 1 + 1 = 72, with the 21
`Room Diagram`-in-`Timestamp` rows named, the 3 DETAILS-block `Room Diagram` rows identified as
the consumption-excluded ones, the `Notes` ×1 row pulled out of "and peers", and
`Details?`/`Contact`/`Contact:` explicitly declared suppressed and NOT in the baseline.

The §9 half — one of the two sites the finding named — is unchanged by the repair diff. Live text
at `docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md:141`:

> **Calibrated residual noise:** … plus question-form labels (`Details?`, `Diagrams?`).
> Conservative, surfaced, bounded by the committed baseline.

The repair makes the contradiction sharper rather than removing it: §3.2 now says in normative
text that `Details?` is suppressed by the adopted guard and absent from the baseline, while §9
still ships it as pinned residual in the same document.

---

## F7 — ADDRESSED

§9's bullet is split into the two categories the finding asked for, the loss is enumerated as four
named rows with the probe cited, both mechanics are stated correctly (`Cell Phone:` tokens
spanning two aliases; `ALT. E-mail:` defeated by the extra token), and the "no regression against
the pre-detector state" overclaim in the open-input-space bullet is corrected to scope the
no-regression claim to FUTURE shapes while pointing at the enumerated present-day loss. The fenced
guard variants stay fenced.

## F8 — ADDRESSED

§1 now states both emission sites with the 386/8 split, names `event.ts:225` as block-local rather
than positional, notes the 8 carry all four Stage/Storage true positives, and corrects the
narrowing audit's attribution inline while preserving its conclusion.

## F9 — ADDRESSED

§2.1 gains an explicit bullet for the `lib/drive/unknownFieldAnchors.ts:16` rationale comment, and
plan Task 4's **Files** list carries the same edit with the `BLOCKS` array explicitly unchanged.

---

## New breakage introduced by the repair diff

### N1 — Important. The new plan fails a live meta-test gate (invariant 8)

The plan declares both halves of the impeccable dual gate (Task 7 Step 1: `/impeccable critique` +
`/impeccable audit`) and carries no `impeccable-gate:` closeout marker
(`grep -n "impeccable-gate" docs/superpowers/plans/2026-08-15-field-near-miss-detector.md` → no
match). `tests/docs/_metaInvariant8Closeout.test.ts` is RED on the live tree as of this diff:

```
 Test Files  1 failed (1)
 Tests  1 failed | 13 passed (14)
- []
+ [ "2026-08-15-field-near-miss-detector.md: declares the invariant-8 dual gate but carries no
+   valid impeccable-gate marker line — add the marker (spec §3.3) or, for pre-guard history
+   only, a PRE_GUARD_DEBT row with a PR-body reason" ]
```

This is an executable gate failure attributable to the repair diff, not an opinion.

### N2 — Important. The plan file contains raw NUL bytes and is binary to git

`file docs/superpowers/plans/2026-08-15-field-near-miss-detector.md` → `data`. Four literal `\x00`
bytes at lines 47, 63, 74, 75 — the consumption-ledger key separator written as an actual NUL
rather than an escape. The diffstat records the plan as `Bin 0 -> 23679 bytes`, so the plan is
undiffable in `git diff` and in PR review, and every future edit to it renders as an opaque binary
blob. The four sites are self-consistent with each other, so the plan's own semantics are intact;
the cost is entirely reviewability.

### N3 — Low. "ALL SIX" copy strings, then seven are listed, and one of them is `null`

Spec §5 and plan Task 5 Step 1 both say "ALL SIX copy strings" / "ALL SIX catalog strings" and then
enumerate seven names: `title`, `dougFacing`, `crewFacing`, `followUp`, `helpfulContext`,
`triggerContext`, `longExplanation`. `crewFacing` is `null` on this row
(`lib/messages/catalog.ts:1313`) and `followUp` is a routing token ("Doug → optional Report"), not
framing copy — so the real count of framing strings is five. An implementer executing "ALL SIX"
against a seven-item list has no way to know which item is not meant to move.

### N4 — Low. Plan Task 2's code sketch contradicts §2.2's normative kind mapping

The elided emission comment in the Task 2 sketch says
`keep kind derived from the row's block as today`. "As today" is the behavior §2.2 replaces:
`venue.ts:314` hardcodes `kind: "venue"` for every row inside the positional window regardless of
its physical block. Task 4 Step 2 states the mapping correctly, so the two tasks disagree about
what Task 2 builds.

---

## Checked and found sound (recorded so a later round does not re-derive it)

- Every new spec citation introduced by the repair resolves except the two flagged in F4:
  `venue.ts:135` (TYPO_NORMALIZED emit), `venue.ts:145-155` (prior-decision comment),
  `venue.ts:156` (`FIELD_LABEL_AUTOCORRECTED`, correctly described as ungated and row-local-proven),
  `unknownFieldAnchors.ts:171-182`, `oracle.ts:61`, `catalog.ts:1307-1321`, `catalog.ts:1428-1443`,
  `lookup.ts:12-34`, master spec `:2897`/`:3253`, `knownSections.ts:202`, `sectionKind.ts:82`,
  `transport.ts:217`, `event.ts:200`.
- Plan citations spot-checked and sound: `warnings.ts:17-24` (`ParseAggregator` + `newAggregator`),
  `event.ts:186` (`CANONICAL_KEY_MAP` exact branch), `event.ts:222` (`toCanonicalKey` fallback),
  `contacts.ts:63-66` (`hasContactSignal`), `transport.ts:108` (`V2_SCHEDULE_LABELS`),
  `_helpers.ts:20`/`:65` (`parseTableRows`/`decodeEntities`), `registry.ts:329-334`
  (`ledgerClaimsCore` `GuardSurface` row, the shape the new row copies),
  `warningCardCopyRegistry.ts:232-233` (`UNKNOWN_FIELD` card copy).
- The `raw_unrecognized.block` value has no keyed consumer anywhere in `lib/` or `app/` — only a
  producer, a pass-through, and a raw admin render — so F2's consequence (c) understatement is
  safe in practice.
- AC-N7's enrollment shape still holds: `lib/parser/fieldNearMiss.ts` + two referring suites
  satisfies `GuardSurface`, and the plan's `broken` control (flip `DISTINCTIVENESS_MAX` to 0) is a
  real discriminator rather than a symbolic one.
- The plan's Task 4 Step 3 count reconciliation ("if the count differs from 72, STOP") is the
  mechanism that turns F4's unreachability into a loud failure rather than a silent baseline drift.

## Convergence note

Three r1 findings are open, and all three are settled by probe or by an executable gate, not by
argument: F1's gate has an empty satisfying set (four typo aliases, one `venue.*`, and no
`parseVenue` write for it); F4's three sites each behave identically before and after the proposed
decode; F6 is a grep of the live document. Of the four new items, N1 is a red test on the live
tree and N2 is `file(1)` output. No finding asks for a wider recognizer, a matcher change, or a
guard tightening, and none rests on a hypothetical input.

FINDINGS: 7
VERDICT: BLOCKING
