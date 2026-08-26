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

**Seven.** Live copy sites carrying an UNREPRESENTATIVE worked example, `'Stage'` for `'Stage Size'`. Probed, because the backlog row calls it invented and it is not: that pair occurs twice in the committed baseline (`tests/parser/__fixtures__/fieldNearMiss.baseline.json`), 6th of the 10 distinct pairs across 65 emissions. It is real and it is wrong for 63 of them, which is a sharper defect than a fabrication would be, since a reader has no way to tell one case in thirty-three from the general rule. The example lives in exactly two authored strings, and every site is a copy of one of them, so the count is derived rather than kept by hand:

```
$ grep -rn -e "like 'Stage' for 'Stage Size'" -e "labeled 'Stage' where we show" \
    --exclude-dir=node_modules --exclude-dir=.git . | sed 's|^\./||' > /tmp/hits
$ wc -l < /tmp/hits
11
$ grep -v '^docs/superpowers/plans/' /tmp/hits \
  | grep -v '^docs/superpowers/specs/2026-08-26-nearmiss-candidate-render.md' | wc -l
7
```

The `sed` is load-bearing and was added after round 1 found the command did not reproduce. Some grep builds prefix every path with a dot and a slash for a search rooted at the current directory, and others do not; the author's printed bare paths and the reviewer's did not, so the anchored exclusions matched for one of them and silently for neither of the other's lines. Normalising the prefix makes the number the same on both.

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
| null | null | `null` | nothing, exactly today's structure |
| non-null | null | `detail` | one band, exactly today's structure |
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

### 4.3 The gate the sibling surface already has, applied here

Found while enumerating this row's render paths, probed, and repaired in this PR rather than recorded, because no class-sweep deferral exception applies to it.

**Read this before judging it against R3, which fences the opposite operation.** R3 says the per-show surface's `w.code === "UNKNOWN_FIELD"` gate is not to be WIDENED. This applies that same gate to the second surface, which is the opposite direction: it narrows what step 3 shows, to what the per-show surface already shows.

The defect. `components/admin/wizard/step3ReviewSections.tsx:3103` computes `labelFromRawSnippet(w.rawSnippet)` with no code gate. Only `UNKNOWN_FIELD` writes `rawSnippet` in the `<label> | <value>` shape; `lib/parser/pull-sheet.ts:252` and `lib/parser/pull-sheet.ts:343` set it to a RAW pipe-delimited markdown row. So a `PULL_SHEET_*` warning renders its first cell as a fake field label.

It is reachable, not hypothetical. `lib/admin/visibleWarningRows.ts:18-22` filters warn-severity rows out only when `routedWarningsRenderElsewhere` is true, which is the PUBLISHED surface's gate. On the wizard the argument is false and every warning passes through, `PULL_SHEET_*` included.

This is precisely the defect audit idx46/#217 fixed on the per-show surface (`components/admin/PerShowActionableWarnings.tsx:194-201`). That fix landed on one of the two surfaces. This is the other half of a class sweep somebody stopped halfway, and "same defect, different file" is named in AGENTS.md as never sufficient grounds to defer.

Verified safe before proposing it: the only existing assertions on that label are `tests/components/step3SheetCard.test.tsx:805-821`, for "Floor Plan" and "GS Podium Type", and both of those warnings are `UNKNOWN_FIELD`. The gate does not touch them.


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

In both, the card degrades to today's STRUCTURE: one band, or no band, no empty divider, no placeholder. Its TEXT is not today's text, and deliberately so: §6.2 rewrites four shared copy fields precisely because today's text asserts a near-miss that never happened on these cards. Saying "unchanged" here would put the spec at odds with AC-3 and would invite a regression test that freezes the false copy in place.

---

## 6. Copy: two claims the card could not keep

The copy carries two problems, not one. §6.1 is the worked example that holds for 2 of 65 emissions. §6.2 is the assertion, in four separate fields, that a near-miss occurred at all, which is false on every candidate-less card. Both are repaired in one commit because they are edits to the same strings.

### 6.1 What the copy may say, and why it is narrower than it looks

The obvious retarget is to point Doug at the band: "matches the closest row we found, shown on this card." **That is not available**, and the reason is the same reason the candidate was made a structured field in the first place.

The measurement settles it before the reasoning does. The 65 committed emissions carry 10 distinct candidates, and the largest single pair is 15 of 65:

```
15  'Room Diagram' -> 'DETAILS/ROOM DIAGRAM'
15  'Backdrop'     -> 'Backdrop / Scenic'
 9  'Address:'     -> 'VENUE ADDRESS'
 9  'Phone:'       -> 'Client Phone'
 9  'E-mail:'      -> 'Client Email'
 2  'Stage'        -> 'Stage Size'
 2  'Storage'      -> 'Equipment Storage'
 2  'Speaker'      -> 'Virtual Speaker'
 1  'Diagrams?'    -> 'DIagrams'
 1  'Client:/Contact:' -> 'Client Contact'
```

Derived from `tests/parser/__fixtures__/fieldNearMiss.baseline.json`, which
`tests/parser/fieldNearMissBaseline.test.ts` regenerates from the real parser. **No per-code string can name a representative instance, because there is no representative instance.** Swapping `'Stage'` for the most common pair would be wrong for 50 of 65 rather than 63, which is not a repair.

Two structural reasons a pointer at the card also fails. The catalog string is per-CODE and the band is per-WARNING, so a string that promises the band is wrong on exactly the cards §5 enumerates. Being wrong there is the same copy-behavior mismatch this row exists to close, pointed the other way. `longExplanation` makes it sharper still: it renders on `/help/errors` (`app/help/errors/page.tsx:108`), a page with no card on it at all.

So the division is the one the field's own design already made: **the copy carries the class, the band carries the instance.** The example goes; the card shows the real one.

That closes the half of the row's defect that is about the example. The pair is wrong not because it is fabricated, which it is not, but because it names a row that is not Doug's in 63 of 65 emissions. §6.2 is the other half, and it was not in the row at all.

### 6.2 A second defect in the same class, found by sweeping it

Round-1 review raised that the new `helpfulContext` still says "It nearly matches one now" while a candidate-less card is on screen. That is right, and the sweep found the class is wider than the two strings the finding named.

**Probed, because the claim turns on what the OLD emitter fired on.** Before the detector landed, `emitUnknownField` had two call sites and neither passed a candidate. Both are gone from the current tree, so this is a citation into history rather than into the file: `git grep -n 'emitUnknownField(' 9f9b0ef06^ -- lib` returns them in blocks/event.ts and blocks/venue.ts, where the detector's single call site now stands (`lib/parser/fieldNearMiss.ts:258`). It fired on ANY unrecognized label in those blocks. So a legacy persisted `UNKNOWN_FIELD` is a genuinely unknown label that never near-matched anything, and every string asserting a near-miss occurred is FALSE on exactly the cards §5 enumerates.

The class is "a copy field that asserts a near-miss happened". Swept over all seven fields on the catalog row, not over the two the finding named:

| Field | Asserts a near-miss? | Disposition |
|---|---|---|
| `dougFacing` | yes, "It nearly matches one now" | rewritten |
| `helpfulContext` | yes, "It nearly matches one now" | rewritten |
| `triggerContext` | yes, "nearly matches a row we know how to show" | rewritten |
| `longExplanation` | yes, "labeled close to a row we show" | rewritten |
| `title` | no, "Row we couldn't match" is true either way | unchanged |
| `followUp` | no | unchanged |
| `crewFacing` | `null` | unchanged |

`dougFacing` and `triggerContext` were NOT in the finding. They carry the identical claim, so repairing only the named two would have left the class open and the next round would have found them.

### 6.3 The strings

Each is true whether or not the card shows a suggestion. The near-miss framing that the 2026-08-15 arc deliberately introduced is not reverted; it moves from an unconditional assertion into a conditional that names what is on screen, which is where the band can honour it.

`dougFacing`:

```
- Rename the row labeled _<key>_ in _<sheet-name>_ so it matches the row we show. It nearly matches one now, which is why it isn't showing on the crew page.
+ Rename the row labeled _<key>_ in _<sheet-name>_ so it matches the row we show. It isn't showing on the crew page because the label doesn't match one we read. When we can tell which row you meant, the notice names it.
```

`helpfulContext`:

```
- Rename this row in your sheet so it matches the row we show. It nearly matches one now (like 'Stage' for 'Stage Size'), which is why it isn't showing on the crew page. Report flags it to us; Ignore hides this notice.
+ Rename this row in your sheet so it matches the row we show. It isn't showing on the crew page because the label doesn't match one we read. When we can tell which row you meant, this card names it. Report flags it to us; Ignore hides this notice.
```

`triggerContext`:

```
- Appears when a row's label nearly matches a row we know how to show, but doesn't match it exactly.
+ Appears when a row's label doesn't exactly match a row we know how to show.
```

`longExplanation`:

```
- A row in your sheet is labeled close to a row we show, but not close enough for us to read it as that row, so it isn't showing on the crew page: a row labeled 'Stage' where we show 'Stage Size', for example. Rename it in the sheet and it will show the next time this show checks its sheet. We don't rename it for you, because the row you meant would be a guess.
+ A row in your sheet is labeled something we don't read as one of the rows we show, so it isn't showing on the crew page. When we can tell which row you meant, the notice names it. Rename it in the sheet and it will show the next time this show checks its sheet. We don't rename it for you, because the row you meant would be a guess.
```

"When we can tell which row you meant" is a conditional, not a hedge: it is a true statement of §5's guard, and it is the sentence that tells a Doug reading the help page what the band on the card is. `title`, `followUp`, and `crewFacing` are unchanged.

### 6.4 The lockstep, derived from the gates that read each site

Not an enumerated list to maintain by hand. Each row names the gate that would red if the site were missed, which is what makes the set complete. §6.2's sweep moved `dougFacing` and `triggerContext` into scope, so the §12.4 TABLE row is now in this set where an earlier draft of this spec said it was not:

| # | Site | Field | Gate that catches a miss |
|---|---|---|---|
| 1 | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2898` (§12.4 table row) | `dougFacing` | `tests/cross-cutting/codes.test.ts:78-80` via the regen in row 3 |
| 2 | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3255` (§12.4 YAML appendix) | `helpfulContext` | `x1-catalog-parity` via the regen in row 3 |
| 3 | `lib/messages/__generated__/spec-codes.ts` via `pnpm gen:spec-codes` | `dougFacing`, `helpfulContext` | `tests/cross-cutting/codes.test.ts:87-90` compares catalog to §12.4 |
| 4 | `lib/messages/catalog.ts:1341` | `dougFacing` | same as row 3 |
| 5 | `lib/messages/catalog.ts:1345` | `helpfulContext` | same as row 3 |
| 6 | `lib/messages/catalog.ts:1347` | `triggerContext` | `tests/messages/_metaWarningCardCopy.test.ts:99-121` and `EXPECTED_TRIGGER_CONTEXT` |
| 7 | `lib/messages/catalog.ts:1350` | `longExplanation` | `EXPECTED_LONG_EXPLANATION` only, since §12.4 has no such column and x1 does not compare it |
| 8 | `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:147` (§4.2, the `UNKNOWN_FIELD` entry) | `helpfulContext`, `triggerContext` | `tests/messages/_metaWarningCardCopy.test.ts:99-121`, read FROM the document and byte-compared |
| 9 | `tests/messages/warningCardCopyRegistry.ts:102`, `tests/messages/warningCardCopyRegistry.ts:166`, `tests/messages/warningCardCopyRegistry.ts:261` | `triggerContext`, `longExplanation`, `helpfulContext` | `tests/messages/_metaWarningCardCopy.test.ts` frozen-fixture cases |

`scripts/extract-spec-codes.ts` reads the §12.4 table for `dougFacing`/`crewFacing`/`followUp` and the YAML appendix for `helpfulContext`, joining them, so rows 1 and 2 are both regen inputs and neither substitutes for the other. The table's columns are `Code | Where it surfaces | Doug-facing message | Crew-facing message | Follow-up` (header at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2773`).

**Constraints every new string clears**, all mechanically checked:

- No em dash, and none of the banned vocabulary `pars(e|er|ed|ing)|token|extractor|positional|canonical(ize)|structured|ingest(ion)|fallback|enum|RPC|payload|metadata|variant|null|(un)parseable`, case-insensitive, over `title`/`helpfulContext`/`triggerContext` (`tests/messages/_metaWarningCardCopy.test.ts:41-47`).
- `helpfulContext` ≤ 300 characters (`tests/messages/_metaWarningCardCopy.test.ts:64`); `triggerContext` ≤ 160 (`tests/messages/_metaWarningCardCopy.test.ts:69`).
- No `|` character anywhere in a string that lands in the §4.2 markdown table. The gate splits that row on `|` and reads cells by index (`tests/messages/_metaWarningCardCopy.test.ts:113-117`).

### 6.5 The catalog comment block

`lib/messages/catalog.ts:1324-1339` currently records, as fact, that "the matched candidate is computed and attached but NOTHING renders it" and that "Rendering it is filed as `BL-NEARMISS-CANDIDATE-RENDER`; until it ships, the copy names only what is on screen." Both sentences become false in the same commit that makes them false. The block is rewritten to state what is then true: the candidate renders on both operator surfaces, the copy carries the class because the string is per-code, and the F4/F5 dispositions it also records are unchanged. A comment that survives its own repair is the next reviewer's finding.

---

## 7. Guards

Every guard below states a premise it can fail on, and is written before its implementation (invariant 1).

### 7.1 The composition guard, in `tests/admin/perShowActionableWarnings*.test.ts`

Pins §3.3's four-row table on the real component:

- A warning WITH a candidate renders `per-show-actionable-candidate-value` with the candidate's text, AND still renders `per-show-actionable-row-label-value`. Both bands, one card.
- A warning WITHOUT the key renders no `per-show-actionable-candidate`, and the card's remaining STRUCTURE is unchanged: same row-label band, same controls, same deep link. The assertion is on the rendered elements, never on the card's text, because §6.2 moves the text on purpose. A test that pinned the text here would freeze the copy this spec is repairing.
- **A code with neither a row label nor a candidate renders NO `compact-alert-detail-band` at all.** This is the assertion that catches the fragment trap, and it fails on the naive implementation. Its premise is executable: the case asserts first that the chosen warning reaches the component and renders a card, so a fixture that silently rendered nothing could not pass it vacuously.

This extends coverage that already exists rather than duplicating it. The surface's absence assertions today are `tests/admin/perShowDataQualityActionable.test.tsx:112` (`queryByTestId("per-show-actionable-row-label")` null on a `PULL_SHEET_PARSE_PARTIAL` pipe row) and `tests/components/perShowActionableWarnings.fieldBand.test.tsx:69` (six absent-`field` cases). The empty-fragment case is covered NOWHERE today. `tests/components/admin/compactAlertCard.test.tsx:25-32` tests `null | undefined | false | ""` and nothing else, which is precisely why the naive implementation would ship green.

One existing assertion must keep passing unchanged: `tests/components/perShowActionableWarnings.fieldBand.test.tsx:191-194` pins that the row-label band and the field band are mutually exclusive. They stay so, because `rawLabel` is gated on `UNKNOWN_FIELD` (`components/admin/PerShowActionableWarnings.tsx:200`) and `fieldRaw` on `FIELD_UNREADABLE` (`components/admin/PerShowActionableWarnings.tsx:210`), so no warning produces both. The candidate band pairs only with the row-label band, never with the field band, for the same reason: `candidate` is set on no code but `UNKNOWN_FIELD` (§2).

### 7.2 The guard's own domain, in a new tests/parser/candidateLabel.test.ts

`candidateLabel` over §5's whole table, including the non-string jsonb cases, which is the discriminating condition a `string | null` signature cannot express.

### 7.3 Fixture derivation, not a hardcoded string

Both component suites read one new shared helper, tests/_shared/nearMissWarning.ts. It runs a committed fixture from `tests/parser/mutation/fixtures.ts` through `parseSheet`, takes the first `UNKNOWN_FIELD` warning, and returns a PAIR. Assertions compare the rendered text against **that warning's own `candidate`**, never a literal: a hardcoded `"VENUE ADDRESS"` would keep passing if the §3.1 tie-break changed, so it would assert the test author's memory rather than the detector's behavior.

**Both halves of the pair come from the producer, and this was probed rather than reasoned.** The obvious construction is to copy the real warning and `delete` its `candidate` key. That copy is not what a legacy row looks like:

```
real     message: "Unrecognized client row label: 'Address:'; looks like 'VENUE ADDRESS'"
deleted  message: "Unrecognized client row label: 'Address:'; looks like 'VENUE ADDRESS'"
emitted  message: "Unrecognized client row label: 'Address:'"
```

`emitUnknownField` builds the message from a two-arm ternary on the candidate (`lib/parser/warnings.ts:421-423`), so a real candidate-less emission carries no "looks like" clause while the key-deleted copy keeps one. The helper therefore takes the real warning's key and value and calls `emitUnknownField` TWICE, once passing `candidate` and once omitting it. Probed equivalent on everything else: same `rawSnippet`, same `blockRef`, and the absent one has no `candidate` key at all.

That stale clause does not render today, which was checked rather than assumed: both surfaces prefer the catalog title over `.message` (`components/admin/PerShowActionableWarnings.tsx:139` and `lib/admin/reviewWarningTitle.ts`), and `UNKNOWN_FIELD` has one. So this is fixture fidelity, not a live defect. It still matters, because AC-3 is the claim that no string on a candidate-less card asserts a near-miss, and a fixture carrying that exact claim in one of its fields is the wrong instrument for proving it.

Precedent: `tests/components/admin/showpage/unreadCalloutRemoved.test.tsx:23` and `tests/components/admin/showpage/unreadCalloutRemoved.test.tsx:139-160` are the one existing component test pinning its harness against the real producer (`emitUnknownField`, `newAggregator`). Every other warning fixture in `tests/` is a hand-authored literal, which is why the helper is worth having rather than inlining the derivation twice.

### 7.4 Step-3 parity, in `tests/admin/wizard/step3*`

The same three cases against `wizard-step3-card-${dfid}-warning-${i}-candidate`, reading the same shared helper. Same shape, same PR: two render surfaces are one class, and if the guard shape is right on one it is the same shape on the other.

Worth knowing before writing them: the step-3 row-label testid at `components/admin/wizard/step3ReviewSections.tsx:3106` has ZERO assertions anywhere in `tests/`. Its only coverage is by visible text at `tests/components/step3SheetCard.test.tsx:819-820`.

### 7.4a The AC-8 guard, which none of the above provides

§7.4's cases are keyed on the candidate testid with `UNKNOWN_FIELD` fixtures, so every one of them passes on today's ungated expression. AC-8 needs its own case or it has no guard at all, and invariant 1 is not satisfied by a test that cannot go red:

- A `PULL_SHEET_PARSE_PARTIAL` warning whose `rawSnippet` is a raw pipe row renders NO `wizard-step3-card-${dfid}-warning-${i}-label`. This FAILS today, because `labelFromRawSnippet` runs ungated at `components/admin/wizard/step3ReviewSections.tsx:3103` and returns the first cell.
- An `UNKNOWN_FIELD` in the SAME render keeps its label. Without this, a gate that suppressed every label would pass, which is the tautology the first assertion invites.

Neither existing suite covers it: `tests/components/step3SheetCard.test.tsx:797-821` asserts only that `UNKNOWN_FIELD` rows keep their labels, and the PULL-sheet absence case at `tests/admin/perShowDataQualityActionable.test.tsx:112` is against `PerShowActionableWarnings`, the surface that already has the gate. So these are the first testid-keyed assertions on that row, and they cannot be modelled on an existing one.

### 7.5 Real-browser verification

No e2e spec asserts any band on either surface today, so this is new coverage on existing seeding paths rather than a new harness.

**The two surfaces need different paths, and the reason is a trim gate rather than convenience.** `WarningsBreakdown` computes `visibleWarningRows(warnings, routedWarningsRenderElsewhere)` where the flag comes from React context (`components/admin/wizard/step3ReviewSections.tsx:2907-2908`), and `visibleWarningRows` drops every warn-severity row when it is true (`lib/admin/visibleWarningRows.ts:18-22`). On a published surface it IS true (`components/admin/review/ShowReviewSurface.tsx:271-272`), because those rows already render as actionable section extras. `UNKNOWN_FIELD` is warn-severity, so on `/admin?show=<slug>` it reaches `PerShowActionableWarnings` and is trimmed OUT of the step-3 panel.

Round 2 caught the consequence: an earlier draft assigned `/admin/show/staged/${stagedId}` to surface B, and that route renders `StagedReviewCard` (`app/admin/show/staged/[stagedId]/page.tsx:281`), which renders `PerShowActionableWarnings` (`components/admin/StagedReviewCard.tsx:534`). It never mounts the wizard line at all, so the evidence would have been for surface A twice.

| Surface | Spec | What renders it | How a candidate-bearing warning gets there |
|---|---|---|---|
| Per-show card | `tests/e2e/warning-panel-polish.spec.ts` | `/admin?show=<slug>` via `openShowReviewModal`, section extras | It already seeds `shows_internal.parse_warnings` directly (`tests/e2e/warning-panel-polish.spec.ts:65-71`, warning literals at `tests/e2e/warning-panel-polish.spec.ts:33-54`), and one of those literals is already an `UNKNOWN_FIELD` with no `candidate`, so the absent case is there for free. A fourth entry carrying one gives both states in one render. |
| Wizard step 3 | `tests/e2e/step3-review-modal.interactions.spec.ts` via `tests/e2e/_step3ReviewModalHarness.tsx` | the harness mounts the real step-3 modal in a real browser | The harness's only warning today is `HARNESS_CREW_WARNING` (`tests/e2e/_step3ReviewModalHarness.tsx:90`), which carries no `rawSnippet`. It gains an `UNKNOWN_FIELD` with a candidate, one without, and one `PULL_SHEET_PARSE_PARTIAL` for AC-8. |

Surface B uses the harness rather than an app route because the trim gate means no PUBLISHED route lists a warn row in that panel, and the only mount where the flag is false is the onboarding wizard, which a spec would have to drive through a full folder-scan flow to reach step 3. The harness mounts the real component in a real browser with real props, which is what AC-6 asks for; what it does not exercise is the route wiring, and this PR does not change the route wiring.

The narrow-viewport wrap from §9 is asserted on surface A, where the two bands sit in one flex container. jsdom computes no layout, so it cannot be asserted anywhere else.

`tests/e2e/compact-alert-card-layout.spec.ts` also renders this component in a standalone esbuild harness with an `UNKNOWN_FIELD` (`tests/e2e/_compactAlertCardLiveEntry.tsx:116-121`). It is deliberately NOT extended: it exists to measure the card shell's layout, and adding product assertions to it would put this spec's regression surface in a file whose subject is something else.

---

## 8. Documented limits

Each is a conservative degrade with no silent corruption, so each is recorded here rather than filed (R9).

1. **A legacy warning shows no suggestion.** A pre-detector persisted `UNKNOWN_FIELD` renders the card with no candidate band. It resolves itself when the show next syncs, since a sync rewrites `parse_warnings` and the current producer always supplies a candidate. After §6.2 no string on that card promises a suggestion or asserts a near-miss, so what remains is an absence rather than a contradiction. *Re-file trigger:* a report of a card whose copy names a suggestion the card does not show.
2. **The band shows the label, not the diff.** It names the vocabulary entry that matched; it does not highlight which characters differ from Doug's label. Deliberate: the two strings sit adjacent in the same band for exactly that comparison, and a character diff on a two-word label is decoration.
3. **One candidate, not a ranked list.** `emitUnknownField` takes a single `candidate` and the detector supplies the §3.1 tie-break winner (`lib/parser/fieldNearMiss.ts:258`). Showing runners-up would need a carrier that does not exist. *Re-file trigger:* a measured case where the tie-break winner is the wrong suggestion often enough to matter.

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
- **AC-3** A warning with no `candidate` renders no candidate band, and no string on that card asserts a near-miss occurred. Deliberately NOT "byte-for-byte identical to today": §6 changes the shared copy, so a candidate-less card's text moves too, and it moves precisely because today's text is false there. What is byte-identical is the card's STRUCTURE: same bands, same controls, same deep link. A card with neither a row label nor a candidate renders no detail band at all.
- **AC-4** Live copy strings pointing Doug at a row he does not have: 7 → 0, counted by §1's command verbatim, including its two path exclusions. The number is stored as that command and not as a literal anywhere else, because a count of occurrences of a string is invalidated by the document that discusses the string.

- **AC-5** All twelve required CI checks green, `x1-catalog-parity` among them.
- **AC-6** Both renders verified in a real browser, not only in jsdom: the band on surface A and the line on surface B. They are different treatments (§4.1), so "both bands" would be wrong about surface B.
- **AC-7** `/impeccable critique` and `/impeccable audit` both pass on the diff, P0 and P1 fixed in-branch.
- **AC-8** A `PULL_SHEET_*` warning on the wizard step-3 list renders no row label, where today it renders its `rawSnippet`'s first cell as a fake one. An `UNKNOWN_FIELD` in the same render keeps its label.

---

## 12. Out of scope

- `BL-TYPO-NORMALIZED-V4-VENUE-SHAPE`, phase 2, behind a pending product decision.
- Widening either surface's row-label gate beyond `UNKNOWN_FIELD` (R3). §4.3 applies the existing gate to the second surface, which is the opposite operation.
- Any change to `NoteWarningCard`'s rendering (R2).
- A design-token replacement for the shipped band eyebrow class (R5).
- Any new dev-gallery scenario (R8).
