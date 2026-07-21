# Adversarial spec review (INLINED, no tools) — warning-card identity + placement

## Your role: REVIEWER ONLY
Do not fix issues or propose patches as commits. Surface findings only.

## CRITICAL EXECUTION CONSTRAINT
Do NOT use any tools. Do NOT read files, run shell commands, or search the repo.
Everything you need is inlined below. Reason ONLY from this text and reply with prose.
Do NOT invoke any nested review command.

## Context
Admin published-show modal. Five `*_AUTOCORRECTED` parse-warning codes render a
generic per-code catalog line. The card names no crew member, quotes a FIXED
example instead of the real correction, and for three codes ends with an
instruction that has no reachable action (the matcher re-corrects any intentional
spelling on the next sync).

## DO NOT RELITIGATE (ratified by the user 2026-07-20)
1. Cutting the trailing instruction for the 3 unfixable codes (not rewriting it).
2. Keeping the fix instruction for COLUMN_HEADER / FIELD_LABEL (a label rename does escape the matcher).
3. Instance copy REPLACES the generic line (not rendered alongside).
4. Under-row placement is unconditional, NOT gated on instance count.
5. ParseWarnings are NOT forced into the AttentionItem union.
6. The nesting change is the successor to PR #532's explicitly named deferral.
Arguing these is out of scope and will be discarded.

## VERIFIED CODE FACTS (I checked these; treat as given)
- `canonicalCrewKey(name) => name.trim().toLowerCase()` — lib/admin/attentionItems.ts:223-225.
- `interpolate` leaves an UNRESOLVED placeholder intact (returns the literal match) — lib/messages/lookup.ts:33.
- `renderCatalogEmphasis(template, params)` parses emphasis on the RAW template, THEN
  substitutes params into text nodes, so param values are never parsed as markup —
  components/messages/renderEmphasis.tsx:61-96.
- `CREW_CAP = 30` — components/admin/wizard/step3ReviewSections.tsx:152.
- 13 emit sites across the 5 codes (FIELD_LABEL has 7, COLUMN_HEADER has 2).
- `extractRoleFlags` is pure and never receives the crew name, so ROLE_TOKEN_AUTOCORRECTED
  cannot populate `subject` at its emit site.
- PR #532 (merged) cut the published Parse warnings panel to info-severity rows only,
  so a warn-severity crew-scoped autocorrect warning now renders in exactly ONE place.

## WHERE I WANT PRESSURE
A. §4.1 dougFacing reuse — newest, least-reviewed decision. Rendering a template that
   notify-email and the alert path also consume, on a THIRD surface. Sound or a trap?
   The spec strips a trailing sentence by exact suffix match and swaps a parenthetical.
B. §3.2 two-mechanism population (emit-site vs stamp-site) — can a warning escape the stamp?
C. §5 placement conservation — exactly once, under-row or group, never both/neither.
D. §10 test plan — anti-tautology. Which defect class does it NOT catch?
E. Any internal contradiction or unspecified guard condition.

## OUTPUT FORMAT
For each finding:
[SEVERITY: BLOCKING|HIGH|MEDIUM|LOW] <title>
Location: <section>
Claim: <what the spec says>
Reality/Risk: <the problem>
Impact: <concrete defect or wasted round>

Enumerate ALL instances of each finding class in THIS round; a vector dripped one
instance per round is a review defect. If a section is sound, say so briefly.

End with exactly one line:
VERDICT: APPROVE   or   VERDICT: NEEDS-ATTENTION   or   VERDICT: BLOCKING

---
# SPEC UNDER REVIEW
# Warning card identity and placement — design

**Date:** 2026-07-21
**Status:** Draft for autonomous ship.
**Base:** `origin/main` @ `2a868b132` — post-#531 (popover `helpfulContext` copy + coverage gate), post-#532 (warning-surface trim).
**Supersedes:** nothing. Changes what an autocorrect warning card SAYS and WHERE it renders. Adds no route, no table, no `§12.4` row.

---

## 1. Summary

An autocorrect warning card tells the operator that a word was silently rewritten. Today it names neither the word nor the person, and for three of the five codes it ends with an instruction that has no reachable action.

Four changes, one shape: the card should state what actually happened, next to whoever it happened to.

1. **`ParseWarning` gains a structured `autocorrect` field**, so the surface reads what was corrected instead of re-deriving it from prose.
2. **The five autocorrect codes render instance copy** — the real words, and the crew member's name where one exists — replacing the generic catalog line.
3. **The two crew-scoped codes render under their crew member's row**, not in a code group below the roster.
4. **Warning groups nest inside their section body** instead of mounting as a sibling after the panel, so a group stops reading as a peer of the section.

No DB change, no migration, no advisory-lock path, no new user-visible code, no `pnpm gen:spec-codes` run.

## 1.1 Resolved scope — do not relitigate

Each decision below is ratified by the user (2026-07-20, brainstorming gate) or established by the citation pass on this base. Verify the citation; do not re-derive.

- **The second sentence is CUT, not rewritten, for the three unfixable codes.** `STAGE_WORD_AUTOCORRECTED`, `ROLE_TOKEN_AUTOCORRECTED`, and `SECTION_HEADER_AUTOCORRECTED` all match against a CLOSED vocabulary (`normalizeStageWords`, `lib/parser/personalization.ts:196`; `gatedVocabCorrect` via `lib/parser/sectionHeaderNormalize.ts:67`), so re-typing the intended spelling is re-corrected on the next sync. There is no sheet edit to instruct. The card's existing Report and Ignore controls are the actions. Option C of three considered; A ("Report it") and B ("correct the cell, or Report") were rejected as copy that explains visible buttons. (User decision, 2026-07-20.)
- **`COLUMN_HEADER_AUTOCORRECTED` and `FIELD_LABEL_AUTOCORRECTED` KEEP their fix instruction.** They correct a LABEL, not a vocabulary token; renaming the header or row label in the sheet genuinely escapes the matcher. Cutting their guidance too was considered and rejected — it would discard working advice for symmetry. (User decision, 2026-07-20.)
- **Instance copy REPLACES the generic guidance line; it is not added alongside it.** Rendering both would state one fact twice and make the operator read the vague version first. The catalog `helpfulContext` survives as the FALLBACK string only. (User decision, 2026-07-20; option B of three.)
- **The instance copy REUSES the catalog's existing `dougFacing` template; it does not author new strings for the crew-scoped codes.** The citation pass established that `dougFacing` already carries a `_<crew-name>_` slot for both crew-scoped codes (`lib/messages/catalog.ts:1271`, `lib/messages/catalog.ts:1285`) and that `interpolate` already resolves that param in production (`lib/adminAlerts/deriveMessageParams.ts:323`). The original design's hand-written strings were a reinvention of ratified copy and are RETIRED. See §4.1. (Citation pass, 2026-07-21.)
- **Crew-scoped cards render under the row ALWAYS, regardless of instance count.** The N=1-under-row / N≥2-grouped rule was explicitly considered and REJECTED: placement would flip on a count the operator cannot see, so a card would relocate when a coworker's sheet row gained an unrelated typo. (User decision, 2026-07-20.)
- **`ParseWarning.autocorrect` is a structured field. Nothing parses `message`.** `message` stays byte-identical for logs and telemetry. This mirrors the two existing additive optionals, `roleToken` (`lib/parser/types.ts:66`) and `resolution` (`lib/parser/types.ts:76`) — both jsonb-persisted, both absence-discriminates, neither requiring a migration.
- **NO `§12.4` catalog row edit and NO `pnpm gen:spec-codes` run.** The instance line is a NEW render path in the card component. Catalog `helpfulContext` is unchanged and remains the fallback, so the `x1-catalog-parity` gate and #531's `_metaPopoverContextCoverage` gate (`tests/messages/_metaPopoverContextCoverage.test.ts`) both stay green by construction. `triggerContext` popover copy is untouched.
- **ParseWarnings are NOT forced into `AttentionItem`.** Its `alert` variant requires a real `AttentionAlertPayload` with an `alertId`, and the discriminated union at `lib/admin/attentionItems.ts:73-77` exists precisely to make a payload-less alert item a compile error. Crew-scoped warning cards travel in a SEPARATE map. Attention routing, `bucketAttention`, and their structural tests are untouched by this change.
- **§4 is the deferral #532 named.** `docs/superpowers/specs/2026-07-20-warning-surface-trim-design.md` §1.1 records "the unmapped-warn ordering wart is accepted, not fixed… Reordering extras above the body is a separate change to a shared surface used by both mounts. Out of scope." This spec is that separate change. It is not a contradiction of #532; it is its named successor.
- **The eyebrow's TYPE treatment is unchanged.** The defect is nesting depth, not typography. `uppercase tracking-eyebrow text-text-subtle` (`components/admin/BulkIgnoreControls.tsx:154`) reads as top-level only because the group sits at the same depth as the nav rail's section labels. Fixing containment fixes the read; restyling the type as well was considered and rejected as treating the symptom.

## 2. Problem

### 2.1 The card names no one

`STAGE_WORD_AUTOCORRECTED` fires when a work-phase word in a crew role cell is within one edit of the stage vocabulary. `normalizeStageWords` (`lib/parser/personalization.ts:196`) splits the cell on `/` and `-`, and rewrites any near-miss segment, gated on ≥2 stage-ish tokens and ≥1 exact anchor.

The emitter already knows everything the operator needs. At `lib/parser/blocks/crew.ts:342` both `displayName` and `stageNorm.corrections` are in scope, and the corrections are joined into `message`:

```
Read likely-misspelled stage word(s) 'Strke' as 'Strike' in role cell: 'Load In/Set/Strke/Load Out - A1'
```

That string never reaches the operator. `PerShowActionableWarnings` renders the CATALOG copy (`components/admin/PerShowActionableWarnings.tsx:97`, `warningCardCopyFields`), which is per-code and therefore generic:

> A stage word in this crew member's role looked misspelled, so we used the closest real one (like 'Strke' as 'Strike'). Update the sheet if the spelling was intentional.

"this crew member" names nobody. On a three-person roster the operator cannot tell whether the card is about Carl, Doug, or Eric without opening the sheet — and the example in the copy, `'Strke' as 'Strike'`, is a fixed illustration in the catalog string, not the actual correction. When the real correction happens to differ, the card shows an example of a different typo than the one it is reporting.

### 2.2 The instruction has no action

"Update the sheet if the spelling was intentional" describes a condition and names no operation. Following it literally — re-typing the same intentional word — produces the same correction on the next sync, because the matcher is unchanged. The escapes that actually exist are: spell a different real stage word; use a token in `ROLE_NORMALIZATIONS`, which is role-excluded and never rewritten (`lib/parser/personalization.ts:211`); or use a word ≥2 edits from every vocabulary member. None is expressible as an instruction on a card.

`ROLE_TOKEN_AUTOCORRECTED` (`lib/messages/catalog.ts:1271`) and `SECTION_HEADER_AUTOCORRECTED` (`lib/messages/catalog.ts:1398`) carry the same sentence with the same dead end.

Two sibling codes do NOT have this problem, and their copy already shows the right shape: `COLUMN_HEADER_AUTOCORRECTED` (`lib/messages/catalog.ts:1285`) and `FIELD_LABEL_AUTOCORRECTED` (`lib/messages/catalog.ts:1412`) say "Fix the header/label in the sheet if that guess is wrong", which is actionable because a label rename is not a vocabulary lookup.

### 2.3 The card is not near its subject

The crew section renders its roster, then — below the roster's bordered card — a code group with an eyebrow reading `AUTO-CORRECTED A MISSPELLED STAGE WORD`.

Three cues place that group at the top level:

- the extras wrapper is `mt-3 flex flex-col gap-3 border-t border-border pt-3` (`components/admin/showpage/sectionWarningExtras.tsx:127`) — a full-bleed rule, the page's strongest "new section" signal;
- the eyebrow is `text-xs font-semibold uppercase tracking-eyebrow text-text-subtle` (`components/admin/BulkIgnoreControls.tsx:154`) plus a `h-px flex-1 bg-border` rule (`components/admin/BulkIgnoreControls.tsx:159`), byte-identical treatment to the nav rail's THE SHOW / PEOPLE / SCHEDULE / LOGISTICS / GEAR labels;
- it mounts OUTSIDE the roster's bordered container, as a sibling of the section body (`components/admin/review/ShowReviewSurface.tsx:1055` invokes extras after `s.render(data)`).

Meanwhile the modal already solves exactly this problem for admin alerts: `Doug Larson was added with LEAD.` renders directly under Doug's row, via `crewAttention.byCrewKey` (`components/admin/wizard/step3ReviewSections.tsx:1376`). Two mechanisms for one job, and the warning half got the worse one.

### 2.4 Why this matters more after #532

Before #532 a warn-severity warning rendered twice: once as a section card, once in the Parse warnings panel. After #532 the published panel lists info-severity rows only (`lib/admin/visibleWarningRows.ts:21`), so a crew-scoped autocorrect warning now renders in EXACTLY ONE place — its section card. The card is no longer one of two chances to communicate; it is the only one.

## 3. Change 1: the `autocorrect` field

### 3.1 Shape

`lib/parser/types.ts` — `ParseWarning` gains:

```ts
// The correction an autocorrect code performed, structured so a surface can
// state it without parsing `message`. ALWAYS set by every producer of the five
// autocorrect codes when a correction occurred; ABSENT on every other code (absence
// discriminates). `subject` names the entity the correction happened TO: the
// crew member for crew-scoped codes, null where the correction is not
// person-scoped (section header, column header, field label).
// jsonb-persisted on shows_internal.parse_warnings and pending_syncs.parse_result.
// Additive, backward-compatible, no migration (mirrors `roleToken`, `resolution`).
autocorrect?: {
  subject: string | null;
  corrections: { detected: string; corrected: string }[];
};
```

`corrections` is non-empty whenever the field is present: an emitter that corrected nothing omits the field entirely, so `autocorrect?.corrections.length` is never `0`. The invariant is asserted in tests rather than encoded in the type, matching how `roleToken`'s always-set-on-one-code contract is handled.

### 3.2 Emitter sites — two mechanisms, not one

The design's original blanket rule ("populate at the emit site") does not survive the citation pass. `extractRoleFlags` is a PURE function receiving only `roleCell` — the crew member's name is not in scope there. `ROLE_TOKEN_AUTOCORRECTED` must therefore be populated where the existing `blockRef` stamp already happens.

**There are ELEVEN emit sites across the five codes, not five.** A producer sweep (`rg 'code: "(STAGE_WORD|ROLE_TOKEN|SECTION_HEADER|COLUMN_HEADER|FIELD_LABEL)_AUTOCORRECTED"' lib`) is the authority; the count is stated here because an earlier draft of this spec listed one site per code and would have shipped six silently-unpopulated producers, each rendering a permanently generic card.

| # | Code | Site | `subject` | Mechanism |
|---|---|---|---|---|
| 1 | `STAGE_WORD_AUTOCORRECTED` | `lib/parser/blocks/crew.ts:345` | `displayName` | emit-site, both values in scope |
| 2 | `ROLE_TOKEN_AUTOCORRECTED` | emit `lib/parser/personalization.ts:340`; **`subject` stamped at `lib/parser/blocks/crew.ts:367-372`** | `displayName` | stamp-site, name not in scope at emit |
| 3 | `SECTION_HEADER_AUTOCORRECTED` | `lib/parser/sectionHeaderNormalize.ts:128` | `null` | emit-site |
| 4 | `COLUMN_HEADER_AUTOCORRECTED` | `lib/parser/blocks/crew.ts:148` | `null` | emit-site |
| 5 | `COLUMN_HEADER_AUTOCORRECTED` | `lib/parser/blocks/transport.ts:596` | `null` | emit-site |
| 6 | `FIELD_LABEL_AUTOCORRECTED` | `lib/parser/blocks/venue.ts:159` | `null` | emit-site |
| 7 | `FIELD_LABEL_AUTOCORRECTED` | `lib/parser/blocks/client.ts:200` | `null` | emit-site |
| 8 | `FIELD_LABEL_AUTOCORRECTED` | `lib/parser/blocks/client.ts:348` | `null` | emit-site |
| 9 | `FIELD_LABEL_AUTOCORRECTED` | `lib/parser/blocks/event.ts:246` | `null` | emit-site |
| 10 | `FIELD_LABEL_AUTOCORRECTED` | `lib/parser/blocks/event.ts:352` | `null` | emit-site |
| 11 | `FIELD_LABEL_AUTOCORRECTED` | `lib/parser/blocks/ops.ts:154` | `null` | emit-site |
| 12 | `FIELD_LABEL_AUTOCORRECTED` | `lib/parser/blocks/rooms.ts:870` | `null` | emit-site |
| 13 | `FIELD_LABEL_AUTOCORRECTED` | `lib/parser/blocks/transport.ts:430` | `null` | emit-site |

Row 2's stamp extends the existing `stampedRoleWarnings` map, which already rewrites `ROLE_TOKEN_AUTOCORRECTED` to attach `blockRef`. It adds `autocorrect.subject` in the same pass: the emitter sets `corrections` with `subject: null`, and the stamp fills the name.

`message` is unchanged at all thirteen sites.

**A missed producer is invisible at runtime** — the guard in §4.3 falls back to `helpfulContext`, so an unpopulated site renders exactly today's copy and no test fails unless one asserts otherwise. §10 test 11 is therefore a filesystem-walking meta-test, not a fixed list: it discovers every `code: "*_AUTOCORRECTED"` literal under `lib/parser/**` and asserts each emitted warning carries `autocorrect`. A NEW producer added later fails by default rather than silently degrading.

### 3.3 Persistence

The field rides the existing jsonb columns with no migration, exactly as `roleToken` and `resolution` do. A warning persisted before this change simply lacks the field and falls back per §4.3 — no backfill, no dual-read window.

## 4. Change 2: instance copy

### 4.1 The copy already exists; the card is not wired to it

The citation pass found that this spec's original §4.1 strings independently reinvented copy the catalog ALREADY carries. `STAGE_WORD_AUTOCORRECTED.dougFacing` (`lib/messages/catalog.ts:1271`) reads:

> We read a likely-misspelled stage word in _<crew-name>_'s role (for example 'Strke' as 'Strike') and used the corrected version, so their schedule still reads correctly. If it was intentional, update the sheet.

`ROLE_TOKEN_AUTOCORRECTED.dougFacing` (`lib/messages/catalog.ts:1285`) has the same shape. Both carry a live `_<crew-name>_` interpolation slot, and `interpolate` (`lib/messages/lookup.ts:20-36`) is production machinery already resolving that exact param on the alert path (`lib/adminAlerts/deriveMessageParams.ts:323`).

The warning card never reaches any of it: it renders `helpfulContext` (`components/admin/PerShowActionableWarnings.tsx:97`), the one field with no slot. So a ratified, crew-name-aware sentence sits in the catalog unused while the card shows the generic one.

**Therefore this spec does NOT author new copy for the two crew-scoped codes.** It renders the EXISTING `dougFacing` template with real params. This is strictly smaller than the original design, reuses copy that already passed catalog review, and keeps one string per code instead of two that can drift.

Two deltas from the raw `dougFacing` text:

- **The trailing "If it was intentional, update the sheet." sentence is STRIPPED** for the three unfixable codes, per the §1.1 ratified decision. Stripping is by exact suffix match against the catalog string, asserted in tests, so a catalog reword fails loudly instead of silently leaving the dead-end sentence on screen.
- **The parenthetical "(for example 'Strke' as 'Strike')" is REPLACED** by the actual corrections from `autocorrect.corrections`. A fixed example is misleading when the real correction differs.

### 4.2 Params and composition

| Code | Template source | `crew-name` | Trailing sentence |
|---|---|---|---|
| `STAGE_WORD_AUTOCORRECTED` | `dougFacing` | `autocorrect.subject` | stripped |
| `ROLE_TOKEN_AUTOCORRECTED` | `dougFacing` | `autocorrect.subject` | stripped |
| `SECTION_HEADER_AUTOCORRECTED` | `dougFacing` | n/a | stripped |
| `COLUMN_HEADER_AUTOCORRECTED` | `dougFacing` | n/a | KEPT |
| `FIELD_LABEL_AUTOCORRECTED` | `dougFacing` | n/a | KEPT |

Correction-list composition, substituted into the parenthetical:

- **One:** `'X' as 'Y'`.
- **Two:** `'X' as 'Y' and 'P' as 'Q'`.
- **Three:** `'X' as 'Y', 'P' as 'Q', and 'M' as 'N'` (serial comma, matching repo copy convention).
- **Four or more:** first three, then `, and N more` where N = `corrections.length - 3`.

The possessive is the catalog's, not this spec's: the template already writes `_<crew-name>_'s role`, so `interpolate` substituting `Chris` yields `Chris's role` with no possessive helper needed. That removes the design's invented apostrophe rule entirely.

Em-dash ban applies (AGENTS.md mechanical UI gate). `renderEmphasis` already handles the `_..._` markers on this surface (`components/admin/PerShowActionableWarnings.tsx:204`), so the markers render as emphasis rather than literal underscores.

### 4.3 Guards

Every guard degrades to CURRENT behavior — the catalog `helpfulContext` line — so no state renders a blank card.

| Condition | Result |
|---|---|
| `autocorrect` absent (legacy persisted warning, or non-autocorrect code) | catalog `helpfulContext` |
| `autocorrect.corrections` empty | catalog `helpfulContext` |
| `subject` null or blank, crew-scoped code | catalog `helpfulContext` (never a template with an unresolved `_<crew-name>_` slot on screen) |
| `detected` or `corrected` empty/whitespace | that PAIR is skipped; if no pairs survive, catalog `helpfulContext` |
| trailing-sentence suffix not found where §4.2 expects a strip | catalog `helpfulContext`, and the meta-test in §10.9 FAILS |
| code not one of the five | catalog `helpfulContext` (unreachable by construction; defensive) |

The `subject`-missing row matters because `interpolate` leaves an unresolved placeholder INTACT rather than blanking it (`lib/messages/lookup.ts:33` returns `match` when the param is absent). Rendering the template without a resolved name would put a literal `<crew-name>` on screen, so the guard falls back to `helpfulContext` instead.

The renderer is a pure function of the warning, so every row above is a unit test with no DOM.

### 4.4 Where it renders

`warningCardCopyFields` (`components/admin/PerShowActionableWarnings.tsx:39`) gains the instance path. It returns the TEMPLATE plus its params, NOT a pre-interpolated string — see §4.5 for why that distinction is load-bearing. When `autocorrect` is unusable it returns today's `pick(entry?.helpfulContext)` unchanged.

`trigger` (the `?` popover, `triggerContext`) is untouched, and #532's `followUpCopy`, which composes into the POPOVER body rather than the inline guidance line (`components/admin/PerShowActionableWarnings.tsx:114`), is unaffected. The inline `guidance` slot at `components/admin/PerShowActionableWarnings.tsx:199-205` renders the result with no structural change.

### 4.5 Interpolation order is load-bearing (do not pre-interpolate)

The guidance line MUST render through `renderCatalogEmphasis(template, params)` (`components/messages/renderEmphasis.tsx:75`), NOT through `renderEmphasis(interpolate(template, params))`.

`renderCatalogEmphasis` parses emphasis markers on the RAW template first, then substitutes params into the resulting text nodes, so a param value is opaque text that is byte-preserved and never parsed as markup. Its doc comment records the defect this ordering exists to prevent: a value containing marker characters is otherwise consumed as emphasis and splits the catalog-authored marker pair (logged there as a prior Codex R1 MEDIUM).

This is not hypothetical for THIS feature. `autocorrect.subject` is a crew member's name read from the operator's spreadsheet, and `detected` is by definition a malformed token from that same sheet. Both are attacker-adjacent-shaped free text flowing into a `_<crew-name>_` slot inside an emphasis-marked template. A member named `Foo *draft*`, or a detected token containing an underscore, would corrupt the rendered line under the wrong ordering.

The correction pairs substituted into the parenthetical are subject to the same rule: they are params, not template text.

`renderCatalogEmphasis` is already the established call for this on other surfaces, so this is conformance with an existing contract rather than a new mechanism. §10 test 10 pins it with a marker-bearing name fixture.

## 5. Change 3: under-row placement

### 5.1 Which codes

Crew-scoped = `STAGE_WORD_AUTOCORRECTED` and `ROLE_TOKEN_AUTOCORRECTED`. These are the two whose `autocorrect.subject` is a crew member. The other three are column-, document-, and venue-scoped respectively and keep their section-group placement unchanged.

The set is declared as one exported constant, `CREW_SCOPED_WARNING_CODES`, so the copy layer, the placement layer, and the tests read the same list.

### 5.2 Plumbing

A separate `warningsByCrewKey: Map<string, ReactNode[]>`, built alongside the existing section-warning model and threaded through `Step3SectionChromeContext` — the same context that already carries `crewAttention` to the row host (`components/admin/wizard/step3ReviewSections.tsx:1320`).

Keying uses `canonicalCrewKey(m.name || "")`, identical to the alert path (`components/admin/wizard/step3ReviewSections.tsx:1377`), so a member matches by the same rule for both stacks.

### 5.3 Row stack

At the row host, admin alert banners render FIRST, then warning cards. Rationale: alerts are `critical`/`notice` tone and can require a Confirm; warnings are advisory.

**Cap: 2 visible on the MERGED stack.** The remainder collapses into a native `<details>` reading `N more`, expanding IN PLACE. Native `<details>` matches the existing `Ignored (N)` disclosure idiom (`components/admin/showpage/sectionWarningExtras.tsx:130-146`) — chevron transform only, body instant, no `AnimatePresence`, so §9's transition inventory stays trivial.

The cap counts the merged stack, not each kind separately: a member with 2 alerts and 1 warning shows 2 items and `1 more`.

### 5.4 Structural no-drop

A crew-scoped warning whose member is NOT rendered — beyond `CREW_CAP = 30` (`components/admin/wizard/step3ReviewSections.tsx:152`), or whose canonical key matches no rendered row — falls back to the section code group. This mirrors `crewKeyRendered` for alerts (`lib/admin/sectionAttention.ts:122`).

The conservation invariant: **every crew-scoped warning renders exactly once — under its row, or in the group, never both and never neither.** §9 test 3 proves it by identity over a fixture where members exceed `CREW_CAP`.

Duplicate-name handling matches the alert path's `consumedAttentionKeys` rule (`components/admin/wizard/step3ReviewSections.tsx:1379`): the FIRST row with a given canonical key consumes that key's cards; a second row with the same canonical name renders none. This is pre-existing behavior for alerts and is adopted verbatim rather than redesigned.

**Blank-name guard.** `canonicalCrewKey` is `name.trim().toLowerCase()` (`lib/admin/attentionItems.ts:223-225`), so a member with an empty or whitespace-only name canonicalizes to the EMPTY STRING, and every unnamed member collides on that one key. Under the inherited `consumedAttentionKeys` rule the first unnamed row would consume the cards belonging to all of them.

This spec does NOT inherit that. A crew-scoped warning whose `autocorrect.subject` is null, empty, or whitespace-only is NOT eligible for under-row placement at all: it routes to the section group via the §5.4 fallback. Two independent reasons: the empty key cannot identify a row, and §4.3 already falls back to `helpfulContext` for a blank subject, so an under-row card there would be an unattributed generic card sitting under an arbitrary member's row — worse than the group placement it came from.

The empty string is therefore never used as a `warningsByCrewKey` key. §10 test 12 pins it with a two-unnamed-member fixture.

## 6. Change 4: group nesting

### 6.1 Thread into the section body

Warning groups move from sibling-after-panel (`components/admin/review/ShowReviewSurface.tsx:1055`) to INSIDE the section body, threaded via `Step3SectionChromeContext` exactly as `parseNotes`, `diagramAttention`, and `reelAttention` already are (`components/admin/review/ShowReviewSurface.tsx:1020-1031`).

The extras wrapper's `border-t border-border pt-3` (`components/admin/showpage/sectionWarningExtras.tsx:127`) is deleted — containment now carries the hierarchy, so the full-bleed rule would double-signal.

This applies to EVERY section's warning group, not just crew.

### 6.2 Bulk-ignore split

`BulkIgnoreControls` (`components/admin/BulkIgnoreControls.tsx:127-190`) currently renders the eyebrow, the chip, and the group's cards together. For crew-scoped codes the cards now live under rows, so the component gains a **headless mode**: eyebrow and chip render at section level with an empty `cards` slot.

The chip label names the scatter so the operator knows what it will hit — `Ignore all 3 stage-word corrections` rather than a bare `Ignore all 3` next to no visible cards.

Ignoring from the chip must clear the under-row cards in the same pass; the fingerprint set the chip acts on is unchanged, so this follows from existing behavior provided the under-row cards read the same active/ignored partition. §9 test 5 pins it.

## 7. What does not change

- Every STAGED surface. All behavior here is published-only, gated by caller (the staged wizard passes no `renderSectionExtras`, `components/admin/review/ShowReviewSurface.tsx:184`), not by a mode branch inside a leaf.
- `lib/messages/catalog.ts` — no row edited, added, or removed.
- `§12.4` prose, `pnpm gen:spec-codes`, `lib/messages/__generated__/spec-codes.ts`.
- `triggerContext` popover copy and #531's coverage gate.
- `AttentionItem`, `ATTENTION_ROUTES`, `bucketAttention`, `deriveAttentionItems`, and every attention structural test.
- `ParseWarning.message` at all five emit sites.
- The eyebrow's type treatment.
- Any DB schema, migration, RPC, or advisory-lock path.

## 8. Dimensional invariants

The under-row stack introduces a flex parent with children that must fill it. Tailwind v4 does NOT default `.flex` to `align-items: stretch` (AGENTS.md), so each relationship is stated and browser-verified.

| Parent | Child | Relationship | Guaranteed by |
|---|---|---|---|
| row stack container | each card (`per-show-actionable-item`) | child width === parent width | `flex flex-col` + `items-stretch` explicit |
| row stack container | `<details>` disclosure | child width === parent width | `items-stretch` explicit |
| `<details>` body | each collapsed card | child width === parent width | `flex flex-col` + `items-stretch` explicit |
| crew row `<li>` | row stack container | container width === row content width | `w-full` explicit |

§9 test 6 asserts each with `getBoundingClientRect()` in a real browser at ≤0.5px tolerance. jsdom is insufficient and is not accepted for these four rows.

## 9. Transition inventory

The stack has two visual states: collapsed (cap applied) and expanded (`<details>` open).

| From | To | Treatment |
|---|---|---|
| collapsed | expanded | chevron `rotate-90` transform; body appears instantly (native `<details>`) |
| expanded | collapsed | chevron rotates back; body disappears instantly |

Compound: a card RESOLVED while the disclosure is open swaps in place and the disclosure stays open — resolution does not re-collapse the stack. No `AnimatePresence` is introduced by this change.

## 10. Test plan

Anti-tautology applies throughout: expected strings derive from FIXTURE corrections, never hardcoded next to the assertion.

1. **Copy composition (unit, no DOM).** Every row of the §4.2 table and every row of the §4.3 guard table. Expected strings derive from the fixture's `corrections` array and from `MESSAGE_CATALOG[code].dougFacing`, never hardcoded beside the assertion. Catches: a guard that renders a blank card, a 4+ join that drops the count, an unresolved `<crew-name>` reaching the screen.

9. **Trailing-strip fidelity (meta).** For each of the three strip-codes, assert the exact suffix this spec strips is PRESENT in the live catalog `dougFacing`. This is the tripwire for §4.1's second delta: if a future catalog reword changes that sentence, the strip silently no-ops and the dead-end instruction returns to the card. Fails loudly instead.

10. **Marker-bearing param safety (component).** Render the card with `subject` = `Foo *draft*` and with a `detected` token containing an underscore. Assert the catalog's own emphasis structure is intact and the param text appears byte-identical inside it. This is the §4.5 regression test: it FAILS under `renderEmphasis(interpolate(...))` and passes under `renderCatalogEmphasis(template, params)`, so it pins the ordering rather than merely exercising it.

11. **Producer completeness (structural meta-test).** Filesystem-walk `lib/parser/**` for every `code: "<X>_AUTOCORRECTED"` literal, and assert each producing site emits a warning carrying `autocorrect`. Fails by default when a NEW producer is added. This is the one meta-test this spec CREATES (writing-plans meta-test inventory). It exists because §3.2's failure mode is invisible: an unpopulated producer renders today's copy and breaks no other test. Registry-with-inline-exemption style, matching `tests/log/_metaMutationSurfaceObservability.test.ts`: a site legitimately outside scope carries an inline justification rather than being silently absent.
2. **Emitter population (unit, per code).** All five codes populate `autocorrect` with the right `subject` and the right pairs. Includes the §3.2 row-2 mechanism specifically: assert `ROLE_TOKEN_AUTOCORRECTED` arrives at the section model WITH `subject` set, proving the stamp ran — a test at `personalization.ts` alone would pass with `subject` permanently null. Also asserts `message` is byte-identical to pre-change output at all thirteen sites.
3. **Placement conservation (component).** Over a fixture whose members exceed `CREW_CAP`: every crew-scoped warning renders exactly once, under its row or in the group. Assert by warning identity against the MODEL, not by counting DOM nodes in a container that renders both.
4. **Cap behavior (component).** 1, 2, 3, and 5 merged items; alerts-before-warnings ordering; `N more` count correct; expansion reveals exactly the remainder.
5. **Bulk-ignore headless mode (component).** Chip renders at section level with no cards beside it; acting on it clears the under-row cards for that code in the same pass.
6. **Layout dimensions (real browser, Playwright).** The four §8 rows via `getBoundingClientRect()`, ≤0.5px. Runs against a hydrated harness — the stack's disclosure is click-dependent, so a static layout harness cannot cover it.
7. **Staged parity (component).** Staged surfaces byte-identical: `StagedReviewCard` cards unchanged.
8. **Registry/meta.** `tests/messages/warningCardCopyRegistry.ts` frozen strings still match the catalog (unchanged by this spec — the instance path does not touch catalog rows); #531's `_metaPopoverContextCoverage` still green; `bucketAttention` conservation still green.

12. **Blank-name collision (component).** A fixture with TWO members whose names are empty/whitespace, each carrying a crew-scoped warning. Assert neither renders under a row, both render in the section group, and no card is dropped. Catches the §5.4 empty-key collision that the inherited `consumedAttentionKeys` rule would otherwise produce.


## 11. Fan-out checklist

| Surface | Action |
|---|---|
| `lib/parser/types.ts` | add `autocorrect` optional |
| 13 emitter sites (§3.2) | populate; `message` unchanged |
| `components/admin/PerShowActionableWarnings.tsx` | instance-copy path in `warningCardCopyFields` |
| `lib/admin/sectionWarningModel.ts` | partition crew-scoped codes out of the group |
| `components/admin/wizard/step3ReviewSections.tsx` | row-stack host, cap, disclosure |
| `components/admin/review/ShowReviewSurface.tsx` | thread groups into section body |
| `components/admin/showpage/sectionWarningExtras.tsx` | delete wrapper `border-t` |
| `components/admin/BulkIgnoreControls.tsx` | headless mode + chip label |
| `tests/messages/warningCardCopyRegistry.ts` | verify unaffected |
| impeccable critique + audit | invariant 8 (UI surface) |
| Playwright real-browser spec | §8 dimensional invariants |

## 12. Open questions

None. All five design decisions are ratified in §1.1; the citation pass corrected §3.2 row 2 before drafting.
