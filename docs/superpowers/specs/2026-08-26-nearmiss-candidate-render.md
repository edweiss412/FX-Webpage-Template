# Near-miss candidate render: show Doug the suggestion the detector already computed

**Row:** `BL-NEARMISS-CANDIDATE-RENDER` (`BACKLOG.md:657`, filed 2026-08-15 off `feat/mutation-section-order` as impeccable dual-gate finding F1's deferred half, class-sweep exception (c)).
**Branch:** `feat/nearmiss-surface`. **Base:** `b30413cf5`.
**Scope:** phase 1 of the arc. `BL-TYPO-NORMALIZED-V4-VENUE-SHAPE` is a separate phase behind a pending product decision and is not specified here.

---

## 1. The problem, as three measured numbers

Re-probed on this branch's base.

**65 of 65.** Every row of the committed emission baseline carries a non-empty `candidate`. Asserted outright at `tests/parser/fieldNearMissBaseline.test.ts:221`, as `expect(actual.filter((r) => r.candidate === "")).toEqual([])`, with `EXPECTED_TOTAL = 65` at `tests/parser/fieldNearMissBaseline.test.ts:41`. The baseline is not a fixture of hand-authored literals: `emissionsOf` runs `parseSheet` from `@/lib/parser` over the 17 committed sheets named in `tests/parser/mutation/fixtures.ts`. So the suggestion is not sparse or best-effort. It exists on every live emission.

**Zero.** No surface reads it:

```
$ grep -rn '\.candidate\b' components/ app/
(no matches)
```

The detector attaches it structurally at `lib/parser/warnings.ts:427` (`if (opts.candidate !== undefined) warning.candidate = opts.candidate;`), it is jsonb-persisted on `shows_internal.parse_warnings` and `pending_syncs.parse_result` (`lib/parser/types.ts:113-125`), and it dies at the render boundary.

**Seven.** Live copy sites carrying an invented worked example, `'Stage'` for `'Stage Size'`, which exists only because there was nothing real to point at. The example lives in exactly two authored strings, and every site is a copy of one of them, so the count is derived rather than kept by hand:

```
$ grep -rn -e "like 'Stage' for 'Stage Size'" -e "labeled 'Stage' where we show" \
    --exclude-dir=node_modules --exclude-dir=.git . | wc -l
11
$ ... | grep -v '^docs/superpowers/plans/' \
      | grep -v '^docs/superpowers/specs/2026-08-26-nearmiss-candidate-render.md' | wc -l
7
```

Both numbers are printed so the subtraction is visible: 11 occurrences, 4 excluded, 7 live. The two exclusions are records rather than copy that ships. `docs/superpowers/plans/2026-08-15-field-near-miss-detector.md:296` is a dated execution record and is never corrected; this spec accounts for the other three, quoting the string once in the command above and twice in the before/after diff at §6.2.

`BACKLOG.md:661` needs no exclusion and matches neither pattern: it describes the example rather than reproducing it. That is worth knowing before trusting the number, because a reader who expects the archived row to be in the total will look for an exclusion that is not there.

The seven that DO ship or gate: `tests/messages/warningCardCopyRegistry.ts:166` and `tests/messages/warningCardCopyRegistry.ts:261`, `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:147`, `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3255`, `lib/messages/__generated__/spec-codes.ts:1557`, `lib/messages/catalog.ts:1346` and `lib/messages/catalog.ts:1351`.

So the product statement is small and exact. Doug is asked to act on a near-miss, the system knows what it nearly matched, and the screen does not say.

---

## 1.1 Resolved scope, do not relitigate

| # | Decision | Ratification |
|---|---|---|
| R1 | `candidate` needs no migration. It is jsonb-persisted additively, mirroring `roleToken`, `resolution`, and `autocorrect`. A column would duplicate the payload. | `lib/parser/types.ts:121-124` |
| R2 | `NoteWarningCard` renders no candidate. `UNKNOWN_FIELD` is warn-severity and a member of `OPERATOR_ACTIONABLE_ANCHORED` (`lib/parser/dataGaps.ts:413`); the note surface is the info-severity one and carries no mutate controls. Its only exposure to this change is the shared catalog copy. | `components/admin/NoteWarningCard.tsx:44-47`, `lib/parser/dataGaps.ts:406-431` |
| R3 | `rawSnippet`'s `w.code === "UNKNOWN_FIELD"` gate on the per-show surface stays exactly as narrow as it is. It is a ratified defense against other anchored codes writing a raw markdown row into the row-label band (audit idx46/#217). This spec does not widen it and does not copy it. | `components/admin/PerShowActionableWarnings.tsx:194-201` |
| R4 | The existing `Sheet row` band is the design precedent for the per-show surface. Reproducing its grammar is deliberate consistency. Re-deriving a new visual language for the line beside it is out of scope. | `components/admin/PerShowActionableWarnings.tsx:260-275` |
| R5 | The band-label class `text-[10px] font-semibold tracking-wider … uppercase` is the shipped detail-band eyebrow idiom at five sites across three components (`PerShowActionableWarnings.tsx` ×2, `AttentionBanner.tsx`, `HealthAlertsPanel.tsx` ×2). This spec consumes it unchanged. Replacing it with a token is a separate design decision about five existing sites, not about this one. | grep `text-\[10px\] font-semibold tracking-wider` over `components/` |
| R6 | The §12.4 three-way lockstep is a FLOOR, not the whole obligation. `UNKNOWN_FIELD` is also enrolled in the warning-card copy registry, so it has more sites. Both statements are true; neither supersedes the other. | AGENTS.md "§12.4 catalog row edits require three lockstep updates"; `tests/messages/warningCardCopyRegistry.ts:35` |
| R7 | The shared catalog copy names the CLASS; the rendered band names the INSTANCE. The copy does not promise that a suggestion is on the card. See §6.1 for why this is forced rather than chosen. | §6.1 |
| R8 | The dev attention gallery's synthetic `UNKNOWN_FIELD` (`lib/dev/attentionScenarios/tier2.ts:604-612`) is left carrying no `candidate`. It is a live rendering of the absent case, and changing it would move gallery capture output for no product gain. | `lib/dev/attentionScenarios/tier2.ts:604-612` |
| R10 | `present()` (`components/admin/CompactAlertCard.tsx:47`) is NOT changed. Its contract is explicitly "the adapter normalizes", and `tests/components/admin/compactAlertCard.test.tsx:78-90` deliberately asserts the band RENDERS for `0`, `NaN`, and `[]`, over a comment that states the rule outright: "Adapters normalize 0/NaN/[] to null themselves". The collapse in §3.3 therefore belongs in the adapter, which is where this spec puts it. |
| R9 | This arc files no new `BL-`/`DEF-` row of any facing (Eric's directive, 2026-08-25). A peer defect is repaired in this PR or recorded as a documented limit on the surface that owns it. Do not propose a ledger row. | arc brief, 2026-08-26-arc-nearmiss (untracked, held by bl-orch) |

---

## 2. The carrier, and what it guarantees

`ParseWarning.candidate?: string` (`lib/parser/types.ts:125`) is the RAW spelling of the VOCABULARY label the row's label nearly matched. Two properties are load-bearing for everything below.

**It is never sheet content.** The vocabulary is built from a closed static list of `FIELD_ALIASES` values, `SECTION_HEADER_TOKEN_SETS`, and `LABEL_TO_KIND_KEYS` (`lib/parser/fieldNearMiss.ts:107-111`), and the emitted candidate is `match.entry.raw`, an entry from that map (`lib/parser/fieldNearMiss.ts:258`). The sheet-controlled string on this warning is `rawSnippet` (`${key} | ${value}`, `lib/parser/warnings.ts:425`), which already renders today through the same helpers on both surfaces.

**Absence discriminates.** The key is omitted, never set to `undefined` (`exactOptionalPropertyTypes`), so a warning with no candidate is byte-identical to a pre-detector emission.

**There is exactly one producer, and it always supplies a candidate.** `emitUnknownField` has a single call site in `lib/`, `lib/parser/fieldNearMiss.ts:258`, and it passes `candidate: match.entry.raw` unconditionally. The no-candidate arm of `emitUnknownField`'s message ternary (`lib/parser/warnings.ts:421-423`) is therefore unreachable from today's parser. That does NOT make the absent case hypothetical. See §5.

---

## 3. Render surface A: the per-show actionable card

`components/admin/PerShowActionableWarnings.tsx`.

### 3.1 Placement

A second band in the card's existing detail band, beside `Sheet row`:

```
┌──────────────────────────────────────────────┐
│ ! Row we couldn't match                      │
│   Rename this row in your sheet so it …      │
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
│ SHEET ROW  Addres         LOOKS LIKE  VENUE ADDRESS │
├──────────────────────────────────────────────┤
│ Open in Sheet ↗                    [Report] [Ignore] │
└──────────────────────────────────────────────┘
```

The container is already built for exactly this: `CompactAlertCard`'s detail band is `flex flex-wrap items-center gap-x-4 gap-y-1` (`components/admin/CompactAlertCard.tsx:116-122`), so two sibling spans sit side by side and wrap to a second line on a narrow viewport with no new layout code.

### 3.2 Markup

Reproduces the `Sheet row` band's grammar exactly (R4), with its own testids:

```tsx
const candidateBand: ReactNode = candidate ? (
  <span className="inline-flex items-center gap-1.5" data-testid="per-show-actionable-candidate">
    <span className="text-[10px] font-semibold tracking-wider text-warning-text uppercase">
      Looks like
    </span>
    <span className="font-mono text-xs text-text" data-testid="per-show-actionable-candidate-value">
      {candidate}
    </span>
  </span>
) : null;
```

`Looks like` is the eyebrow because it is the word the emitted message already uses (`; looks like '<candidate>'`, `lib/parser/warnings.ts:423`), and because it is honestly weaker than a claim of certainty. The value is mono, matching `Sheet row`'s value: both are exact strings the operator is meant to compare character by character.

### 3.3 The composition guard, the one non-obvious part

The card takes ONE `detailBand` slot, and today the per-show surface passes `detailBand ?? fieldBand` (`components/admin/PerShowActionableWarnings.tsx:346`). Composing two bands into that slot has a trap:

`present()` (`components/admin/CompactAlertCard.tsx:47`) returns `slot !== null && slot !== undefined && slot !== false && slot !== ""`. **A JSX fragment whose children are all `null` is an object, so `present()` returns true for it.** Wrapping unconditionally would render an empty dashed-border band on every card with no detail content. That is a visible regression on codes that are not `UNKNOWN_FIELD`.

So the composition collapses to `null` when both parts are absent, and to the single part when only one is present:

```tsx
const detail = detailBand ?? fieldBand;
const combinedDetail: ReactNode =
  detail && candidateBand ? (
    <>
      {detail}
      {candidateBand}
    </>
  ) : (detail ?? candidateBand);
```

Total over the four input states, stated as a table because this is the assertion §7.1 pins:

| `detail` | `candidateBand` | slot receives | band renders |
|---|---|---|---|
| null | null | `null` | nothing, exactly today's output |
| non-null | null | `detail` | one band, exactly today's output |
| null | non-null | `candidateBand` | one band |
| non-null | non-null | fragment of both | two bands, wrapping |

Row 1 and row 2 being byte-identical to today is the regression contract for every non-`UNKNOWN_FIELD` card on this surface.

---

## 4. Render surface B: the wizard step-3 row

`components/admin/wizard/step3ReviewSections.tsx`, the per-warning `<li>` opening at `components/admin/wizard/step3ReviewSections.tsx:3060`.

### 4.1 Placement and mode boundary

Directly under the existing row-label line (the IIFE at `components/admin/wizard/step3ReviewSections.tsx:3096-3114`), as a sibling in the same `flex min-w-0 flex-1 flex-col gap-0.5` column (`components/admin/wizard/step3ReviewSections.tsx:3082`).

**The two surfaces render the same fact in different grammars, deliberately.** The per-show card is a banded card with an eyebrow idiom; step 3 is a flat list whose row label is plain `text-xs text-text-subtle` with no eyebrow at all (`components/admin/wizard/step3ReviewSections.tsx:3107`). Giving only the candidate line an eyebrow there would make the suggestion typographically louder than the row it belongs to. So:

| Surface | Row label | Candidate |
|---|---|---|
| Per-show card | eyebrow band `SHEET ROW` + mono value | eyebrow band `LOOKS LIKE` + mono value |
| Wizard step 3 | plain `text-xs text-text-subtle` line | plain `text-xs text-text-subtle` line, prose lead-in + mono value |

Both carry the same information grammar (a label naming the fact, then the exact string in mono). Only the type ramp differs, matching the surface each sits on.

### 4.2 Markup

```tsx
{(() => {
  const candidate = candidateLabel(w);
  return candidate ? (
    <span
      data-testid={`wizard-step3-card-${dfid}-warning-${i}-candidate`}
      className="wrap-break-word text-xs text-text-subtle"
    >
      Looks like <span className="font-mono text-text">{candidate}</span>
    </span>
  ) : null;
})()}
```

No `w.code` gate. The guard is on the FIELD, and the field is set on no other code (§2), so gating on the code as well would be a second predicate that can only ever agree with the first.

---

## 5. The guard, stated over its whole input domain

One rule, one implementation, both call sites. This spec adds one new module, lib/parser/candidateLabel.ts:

```ts
export function candidateLabel(warning: { candidate?: unknown }): string | null {
  const v = warning.candidate;
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}
```

It takes `unknown` because the jsonb boundary is unvalidated: a warning read back from `shows_internal.parse_warnings` is whatever was written, and TypeScript's `string` there is a claim, not a check. This is the same rule the shipped `usable` helper applies to `blockRef.name`, `rawSnippet`, and `blockRef.field` on this surface (`components/admin/PerShowActionableWarnings.tsx:204-206`).

**Accept-set, keyed on type and not on spelling.** Accepted: a string with at least one non-whitespace character, rendered trimmed. Everything else renders nothing:

| Input | Reaches the component how | Renders |
|---|---|---|
| `"VENUE ADDRESS"` | every current emission | the band |
| `"  VENUE ADDRESS  "` | jsonb round-trip of a padded write | the band, trimmed |
| key absent | legacy persisted rows; the dev gallery's synthetic warning (`lib/dev/attentionScenarios/tier2.ts:604-612`) | nothing |
| `undefined` | a hand-built warning in a test or fixture | nothing |
| `null` | jsonb null | nothing |
| `""` / `"   "` | a vocabulary entry with an empty raw spelling | nothing |
| `42`, `{}`, `[]` | jsonb of a non-string | nothing |

**Why the absent case is not hypothetical.** Two live sources, and this is why the render is guarded rather than assumed:

1. **Legacy persistence.** Every `UNKNOWN_FIELD` written to `shows_internal.parse_warnings` before the detector landed on 2026-08-15 has no `candidate` key. Those rows drain as each show re-syncs and its warnings are rewritten, but nothing in the system says every show has re-synced.
2. **The dev attention gallery.** `spreadWarning` (`lib/dev/attentionScenarios/tier2.ts:604-612`) builds an `UNKNOWN_FIELD` with no `candidate` today and keeps doing so (R8). It renders through the same component.

In both, the card degrades to exactly today's output: one band, or no band, no empty divider, no placeholder, and no copy referring to a suggestion that is not there.

---

## 6. Copy: retargeting off the invented example

### 6.1 What the copy may say, and why it is narrower than it looks

The obvious retarget is to point Doug at the band: "matches the closest row we found, shown on this card." **That is not available**, and the reason is the same reason the candidate was made a structured field in the first place.

The catalog string is per-CODE. The band is per-WARNING. So a string that promises the band is wrong on exactly the cards §5 enumerates. Being wrong there is the same copy-behavior mismatch this row exists to close, pointed the other way. `longExplanation` makes it sharper still: it renders on `/help/errors` (`app/help/errors/page.tsx:108`), a page with no card on it at all.

So the division is the one the field's own design already made: **the copy carries the class, the band carries the instance.** The copy stops inventing an example, and stops there. The card shows the real one.

That is also what closes the row's stated defect. The invented pair is wrong not because it is an example but because it names a row that is not Doug's. 'Stage Size' is the wrong suggestion for nearly every emission §1 counts. Deleting it, with the real suggestion now on screen, is the whole repair.

### 6.2 The strings

`helpfulContext`, current then new:

```
- Rename this row in your sheet so it matches the row we show. It nearly matches one now (like 'Stage' for 'Stage Size'), which is why it isn't showing on the crew page. Report flags it to us; Ignore hides this notice.
+ Rename this row in your sheet so it matches the row we show. It nearly matches one now, which is why it isn't showing on the crew page. Report flags it to us; Ignore hides this notice.
```

`longExplanation`, current then new:

```
- A row in your sheet is labeled close to a row we show, but not close enough for us to read it as that row, so it isn't showing on the crew page: a row labeled 'Stage' where we show 'Stage Size', for example. Rename it in the sheet and it will show the next time this show checks its sheet. We don't rename it for you, because the row you meant would be a guess.
+ A row in your sheet is labeled close to a row we show, but not close enough for us to read it as that row, so it isn't showing on the crew page. When we can tell which row you meant, the notice names it. Rename it in the sheet and it will show the next time this show checks its sheet. We don't rename it for you, because the row you meant would be a guess.
```

The `longExplanation` replacement is a conditional, not a hedge: "when we can tell which row you meant" is a true statement of §5's guard, and it is the sentence that tells a Doug reading the help page what the new band on the card is.

`dougFacing`, `crewFacing`, `followUp`, `triggerContext`, and `title` are unchanged. They carry no invented example.

### 6.3 The lockstep, derived from the gates that read each site

Not an enumerated list to maintain by hand. Each row below names the gate that would red if the site were missed, which is what makes the set complete:

| # | Site | Field | Gate that catches a miss |
|---|---|---|---|
| 1 | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3255` (§12.4 YAML appendix) | `helpfulContext` | `x1-catalog-parity` via the regen in row 2 |
| 2 | `lib/messages/__generated__/spec-codes.ts` via `pnpm gen:spec-codes` | `helpfulContext` | `tests/cross-cutting/codes.test.ts:87-90` compares catalog to §12.4 |
| 3 | `lib/messages/catalog.ts:1346` | `helpfulContext` | same as row 2 |
| 4 | `lib/messages/catalog.ts:1351` | `longExplanation` | `EXPECTED_LONG_EXPLANATION` only, since §12.4 has no such column and x1 does not compare it |
| 5 | `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:147` (§4.2, the `UNKNOWN_FIELD` entry) | `helpfulContext` | `tests/messages/_metaWarningCardCopy.test.ts:99-121`, read FROM the document and byte-compared |
| 6 | `tests/messages/warningCardCopyRegistry.ts:261` and `tests/messages/warningCardCopyRegistry.ts:166` | `helpfulContext`, `longExplanation` | `tests/messages/_metaWarningCardCopy.test.ts` frozen-fixture cases |

The §12.4 TABLE row at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2898` is NOT in this set. Its columns are `Code | Where it surfaces | Doug-facing message | Crew-facing message | Follow-up` (header at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2773`), with no `helpfulContext` column, and `dougFacing`/`followUp` do not change. `scripts/extract-spec-codes.ts` reads the table for `dougFacing`/`crewFacing`/`followUp` and the YAML appendix for `helpfulContext`, joining them; editing the appendix alone regenerates `helpfulContext` correctly, and the table row must merely continue to exist.

**Constraints every new string clears**, all mechanically checked:

- No em dash, and none of the banned vocabulary `pars(e|er|ed|ing)|token|extractor|positional|canonical(ize)|structured|ingest(ion)|fallback|enum|RPC|payload|metadata|variant|null|(un)parseable`, case-insensitive, over `title`/`helpfulContext`/`triggerContext` (`tests/messages/_metaWarningCardCopy.test.ts:41-47`).
- `helpfulContext` ≤ 300 characters (`tests/messages/_metaWarningCardCopy.test.ts:64`); `triggerContext` ≤ 160 (`tests/messages/_metaWarningCardCopy.test.ts:69`).
- No `|` character anywhere in a string that lands in the §4.2 markdown table. The gate splits that row on `|` and reads cells by index (`tests/messages/_metaWarningCardCopy.test.ts:113-117`).

### 6.4 The catalog comment block

`lib/messages/catalog.ts:1324-1339` currently records, as fact, that "the matched candidate is computed and attached but NOTHING renders it" and that "Rendering it is filed as `BL-NEARMISS-CANDIDATE-RENDER`; until it ships, the copy names only what is on screen." Both sentences become false in the same commit that makes them false. The block is rewritten to state what is then true: the candidate renders on both operator surfaces, the copy carries the class because the string is per-code, and the F4/F5 dispositions it also records are unchanged. A comment that survives its own repair is the next reviewer's finding.

---

## 7. Guards

Every guard below states a premise it can fail on, and is written before its implementation (invariant 1).

### 7.1 The composition guard, in `tests/admin/perShowActionableWarnings*.test.ts`

Pins §3.3's four-row table on the real component:

- A warning WITH a candidate renders `per-show-actionable-candidate-value` with the candidate's text, AND still renders `per-show-actionable-row-label-value`. Both bands, one card.
- A warning WITHOUT the key renders no `per-show-actionable-candidate`, and the card's remaining output is unchanged.
- **A code with neither a row label nor a candidate renders NO `compact-alert-detail-band` at all.** This is the assertion that catches the fragment trap, and it fails on the naive implementation. Its premise is executable: the case asserts first that the chosen warning reaches the component and renders a card, so a fixture that silently rendered nothing could not pass it vacuously.

This extends coverage that already exists rather than duplicating it. The surface's absence assertions today are `tests/admin/perShowDataQualityActionable.test.tsx:112` (`queryByTestId("per-show-actionable-row-label")` null on a `PULL_SHEET_PARSE_PARTIAL` pipe row) and `tests/components/perShowActionableWarnings.fieldBand.test.tsx:69` (six absent-`field` cases). The empty-fragment case is covered NOWHERE today. `tests/components/admin/compactAlertCard.test.tsx:25-32` tests `null | undefined | false | ""` and nothing else, which is precisely why the naive implementation would ship green.

One existing assertion must keep passing unchanged: `tests/components/perShowActionableWarnings.fieldBand.test.tsx:191-194` pins that the row-label band and the field band are mutually exclusive. They stay so, because `rawLabel` is gated on `UNKNOWN_FIELD` (`components/admin/PerShowActionableWarnings.tsx:200`) and `fieldRaw` on `FIELD_UNREADABLE` (`components/admin/PerShowActionableWarnings.tsx:210`), so no warning produces both. The candidate band pairs only with the row-label band, never with the field band, for the same reason: `candidate` is set on no code but `UNKNOWN_FIELD` (§2).

### 7.2 The guard's own domain, in a new tests/parser/candidateLabel.test.ts

`candidateLabel` over §5's whole table, including the non-string jsonb cases, which is the discriminating condition a `string | null` signature cannot express.

### 7.3 Fixture derivation, not a hardcoded string

Both component suites read one new shared helper, tests/_shared/nearMissWarning.ts, which runs a committed fixture from `tests/parser/mutation/fixtures.ts` through `parseSheet`, takes the first `UNKNOWN_FIELD` warning, and returns that warning plus a copy with the `candidate` key deleted. Assertions compare the rendered text against **that warning's own `candidate`**, never a literal.

Two reasons this is not ceremony. A hardcoded `"VENUE ADDRESS"` would keep passing if the §3.1 tie-break changed, so it would assert the test author's memory rather than the detector's behavior. And the present and absent cases then come from ONE source differing in exactly the field under test, which is what makes the pair a controlled comparison instead of two unrelated fixtures.

Precedent: `tests/components/admin/showpage/unreadCalloutRemoved.test.tsx:23` and `tests/components/admin/showpage/unreadCalloutRemoved.test.tsx:139-160` are the one existing component test pinning its harness against the real producer (`emitUnknownField`, `newAggregator`). Every other warning fixture in `tests/` is a hand-authored literal, which is why the helper is worth having rather than inlining the derivation twice.

### 7.4 Step-3 parity, in `tests/admin/wizard/step3*`

The same three cases against `wizard-step3-card-${dfid}-warning-${i}-candidate`, reading the same shared helper. Same shape, same PR: two render surfaces are one class, and if the guard shape is right on one it is the same shape on the other.

Worth knowing before writing them: the step-3 row-label testid at `components/admin/wizard/step3ReviewSections.tsx:3106` has ZERO assertions anywhere in `tests/`. Its only coverage is by visible text at `tests/components/step3SheetCard.test.tsx:819-820`. So these are the first testid-keyed assertions on that row, and they cannot be modelled on an existing one.

### 7.5 Real-browser verification

No e2e spec asserts any band on either surface today, so this is new coverage on existing seeding paths rather than a new harness.

| Surface | Spec | Route | How a candidate-bearing warning gets there |
|---|---|---|---|
| Per-show card | `tests/e2e/warning-panel-polish.spec.ts` | `/admin?show=<slug>` via `openShowReviewModal` | It already seeds `shows_internal.parse_warnings` directly (`tests/e2e/warning-panel-polish.spec.ts:65-71`, warning literals at `tests/e2e/warning-panel-polish.spec.ts:33-54`). One of those gains a `candidate`; a second `UNKNOWN_FIELD` without one is the absent case in the same render. |
| Wizard step 3 | `tests/e2e/admin-parse-panel.spec.ts` | `/admin/show/staged/${staged_id}` | It already seeds a `parse_result` (today with no warnings). It gains the same pair. |

Both are real app routes reading real persisted rows, which is what makes them evidence for AC-1 and AC-2 rather than a re-run of the unit assertions in a browser. The narrow-viewport wrap in §9 is asserted here too, since jsdom computes no layout.

`tests/e2e/compact-alert-card-layout.spec.ts` also renders this component in a standalone esbuild harness with an `UNKNOWN_FIELD` (`tests/e2e/_compactAlertCardLiveEntry.tsx:116-121`). It is deliberately NOT extended: it exists to measure the card shell's layout, and adding product assertions to it would put this spec's regression surface in a file whose subject is something else.

---

## 8. Documented limits

Each is a conservative degrade with no silent corruption, so each is recorded here rather than filed (R9).

1. **A legacy warning shows no suggestion.** A pre-detector persisted `UNKNOWN_FIELD` renders today's card exactly. It resolves itself when the show next syncs. The copy does not promise otherwise (§6.1). *Re-file trigger:* a report of a card whose copy names a suggestion the card does not show.
2. **The band shows the label, not the diff.** It names the vocabulary entry that matched; it does not highlight which characters differ from Doug's label. Deliberate: the two strings sit adjacent in the same band for exactly that comparison, and a character diff on a two-word label is decoration.
3. **One candidate, not a ranked list.** `emitUnknownField` takes a single `candidate` and the detector supplies the §3.1 tie-break winner (`lib/parser/fieldNearMiss.ts:258`). Showing runners-up would need a carrier that does not exist. *Re-file trigger:* a measured case where the tie-break winner is the wrong suggestion often enough to matter.
4. **The wizard step-3 row label is ungated on `w.code`** (`components/admin/wizard/step3ReviewSections.tsx:3103`), where the per-show surface gates it on `UNKNOWN_FIELD` (R3). Pre-existing, untouched by this spec, and reported as an unfixed peer in the PR body rather than widened or narrowed under a spec that is not about it.

---

## 9. Dimensional invariants

No fixed-dimension parent is introduced. The per-show band's parent is `CompactAlertCard`'s detail band (`flex flex-wrap items-center gap-x-4 gap-y-1 … px-3 py-1.5`, `components/admin/CompactAlertCard.tsx:118-119`), which is content-height, no `min-h`, no `h-full` relationship to assert. The new span is `inline-flex items-center`, matching its sibling exactly. The wizard line's parent is `flex min-w-0 flex-1 flex-col gap-0.5` (`components/admin/wizard/step3ReviewSections.tsx:3082`), also content-height.

The one dimensional behavior worth stating: on a narrow viewport the two per-show bands wrap to separate lines via the parent's existing `flex-wrap` and `gap-y-1`. No new class achieves this; it is the container's shipped behavior, and §7.5 verifies it in a real browser at a narrow width rather than asserting it in jsdom.

---

## 10. Transition inventory

The band has two states, present and absent, and they are a function of the warning's data. Nothing toggles them within a mounted card: the per-show list is a server component and the wizard list re-renders from a new parse.

| From | To | Treatment |
|---|---|---|
| absent | present | instant, no animation. The state changes only across a re-parse, where the whole card list is replaced. |
| present | absent | instant, same reason. |

Compound: a card whose Ignore/Report control is mid-transition never changes candidate state, because the controls mutate a decision record and not the warning's fields.

---

## 11. Acceptance criteria

- **AC-1** On a show whose parse emits `UNKNOWN_FIELD`, every near-miss card on the per-show surface names its matched suggestion. 0 → all of them; 65 of 65 on the committed corpus, since `tests/parser/fieldNearMissBaseline.test.ts:221` already proves every emission carries one.
- **AC-2** The same on the wizard step-3 row.
- **AC-3** A warning with no `candidate` renders today's card byte-for-byte, and a card with neither a row label nor a candidate renders no detail band at all.
- **AC-4** Live copy strings pointing Doug at a row he does not have: 7 → 0, counted by §1's command verbatim, including its three exclusions. The number is stored as that command and not as a literal anywhere else, because a count of occurrences of a string is invalidated by the document that discusses the string.

- **AC-5** All twelve required CI checks green, `x1-catalog-parity` among them.
- **AC-6** Both bands verified rendered in a real browser, not only in jsdom.
- **AC-7** `/impeccable critique` and `/impeccable audit` both pass on the diff, P0 and P1 fixed in-branch.

---

## 12. Out of scope

- `BL-TYPO-NORMALIZED-V4-VENUE-SHAPE`, phase 2, behind a pending product decision.
- Widening or narrowing either surface's row-label gate (R3, limit 4).
- Any change to `NoteWarningCard`'s rendering (R2).
- A design-token replacement for the shipped band eyebrow class (R5).
- Any new dev-gallery scenario (R8).
