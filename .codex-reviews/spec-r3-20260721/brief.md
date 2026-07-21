# Adversarial spec review R3 (INLINED, no tools) — warning-card identity + placement

## Your role: REVIEWER ONLY. Surface findings only; do not propose patches. Do NOT invoke any nested review.

## CRITICAL: Do NOT use any tools. Reason ONLY from the text below and reply with prose.

## Fresh-eyes posture
Treat this spec as new. R1 (15 findings) and R2 (9 findings) already ran and were repaired; §12 summarizes. Do NOT re-check prior items mechanically — hunt for what both rounds missed and for defects the repairs introduced. Enumerate ALL instances of any finding class this round.

This is R3 of a convergent train (15→9→?). If the spec is sound, APPROVE — do not manufacture findings to justify the round. If genuine BLOCKING/HIGH issues remain, say so plainly.

## DO NOT RELITIGATE (ratified; §1.1)
1. Cut trailing instruction for the 3 unfixable codes. 2. Keep it for COLUMN/FIELD. 3. Instance copy replaces the generic line. 4. Under-row placement unconditional. 5. Not forced into AttentionItem. 6. Nesting = PR#532 deferral successor. 7. The pure-composer approach (autocorrectGuidance) is settled — challenge details only. 8. Duplicate same-name members: all cards under the first row (R2 resolution) — settled, challenge only if you can show it drops or double-renders a warning.

## VERIFIED CODE FACTS (given)
- canonicalCrewKey = name.trim().toLowerCase(). interpolate leaves an unresolved placeholder literal on screen.
- BulkIgnoreControls: chip iff `bulk` present; text "Ignore all N"; type in eyebrow; group.cards renders any node incl empty.
- extractRoleFlags: one call site (crew.ts:364), warnings consumed only via stampedRoleWarnings map.
- CREW_CAP=30. 13 emit sites (STAGE 1, ROLE 1, SECTION 1, COLUMN 2, FIELD 8).
- dougFacing lines: STAGE 1270, ROLE 1285, COLUMN 1299, SECTION 1412, FIELD 1426; non-crew templates carry _<sheet-name>_, crew ones _<crew-name>_.
- PR#532 cut the published Parse warnings panel to info rows; a warn-severity crew-scoped autocorrect warning renders in exactly ONE place.
- SectionId union: venue,event,crew,contacts,schedule,agenda,hotels,transport,rooms,diagrams,packlist,billing,warnings,report.

## WHERE I WANT PRESSURE
A. Any remaining internal contradiction, numeric/label/testid disagreement, or stale cross-reference.
B. §4 composer guard totality; §5-6 placement/bulk conservation across every mutation path; §9 transition completeness; §10 anti-tautology (does any test only prove "a function ran"?).
C. Anything a plan author would hit as underspecified: a prop/input whose null/empty behavior is unstated; an ordering or tie-break left implicit.

## OUTPUT
Per finding:
[SEVERITY: BLOCKING|HIGH|MEDIUM|LOW] <title>
Location / Claim / Reality / Impact
End with exactly: VERDICT: APPROVE | VERDICT: NEEDS-ATTENTION | VERDICT: BLOCKING

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
- **The instance line is COMPOSED by a pure function, matching the catalog's reviewed phrasing but not reusing the template.** The citation pass confirmed the target phrasing is already ratified: `dougFacing` carries a `_<crew-name>_` slot for both crew-scoped codes (`STAGE_WORD_AUTOCORRECTED` at `lib/messages/catalog.ts:1270`, `ROLE_TOKEN_AUTOCORRECTED` at `lib/messages/catalog.ts:1285`; see the §2.2 line map). Spec R1 then established that REUSING those templates is the wrong implementation path — the three non-crew templates carry a `_<sheet-name>_` slot the card cannot fill, and per-template string surgery couples the card to email/alert copy. So the card OWNS its composed line (`autocorrectGuidance`, §4.1) while its wording matches the ratified `dougFacing` phrasing. The original hand-written §4.1 strings and the intermediate template-reuse proposal are both RETIRED. See §4.1. (Citation pass 2026-07-21; spec review R1.)
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

`ROLE_TOKEN_AUTOCORRECTED` (`lib/messages/catalog.ts:1285`) and `SECTION_HEADER_AUTOCORRECTED` (`lib/messages/catalog.ts:1412`) carry the same sentence with the same dead end.

**Canonical `dougFacing` line map** (single source of truth; every other section cites through this):

| Code | `dougFacing` |
|---|---|
| `STAGE_WORD_AUTOCORRECTED` | `lib/messages/catalog.ts:1270` |
| `ROLE_TOKEN_AUTOCORRECTED` | `lib/messages/catalog.ts:1285` |
| `COLUMN_HEADER_AUTOCORRECTED` | `lib/messages/catalog.ts:1299` |
| `SECTION_HEADER_AUTOCORRECTED` | `lib/messages/catalog.ts:1412` |
| `FIELD_LABEL_AUTOCORRECTED` | `lib/messages/catalog.ts:1426` |

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

**There are THIRTEEN emit sites across the five codes, not five** (8 `FIELD_LABEL`, 2 `COLUMN_HEADER`, 1 each of the other three). A producer sweep (`rg 'code: "(STAGE_WORD|ROLE_TOKEN|SECTION_HEADER|COLUMN_HEADER|FIELD_LABEL)_AUTOCORRECTED"' lib`) is the authority; the count is stated here because an earlier draft of this spec listed one site per code and would have shipped six silently-unpopulated producers, each rendering a permanently generic card.

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

**No-escape proof for the ROLE stamp.** The reviewer's concern is that a `ROLE_TOKEN_AUTOCORRECTED` warning could reach a surface with `subject` still null. It cannot, and this is structural, not incidental:

- `extractRoleFlags` has EXACTLY ONE call site in the codebase (`lib/parser/blocks/crew.ts:364`; verified by `rg 'extractRoleFlags\(' lib`, one non-definition hit).
- Its `.warnings` array is consumed by EXACTLY ONE expression — the `stampedRoleWarnings` map at `lib/parser/blocks/crew.ts:367-373` — and only `stampedRoleWarnings` is pushed onward. `roleFlagResult.warnings` is never pushed raw.

So the emit-with-null and the stamp-the-name are not two points that could drift apart; they are one call followed immediately by its sole consumer. The `subject: null` state has no observable lifetime outside those two adjacent lines.

**This is nonetheless made a hard invariant, not left as prose.** The intermediate `subject: null` is a deliberate, momentary state, so §10 test 2 (the ROLE boundary assertion) asserts the STRONGER post-parse property: every `ROLE_TOKEN_AUTOCORRECTED` warning EXITING `parseCrewBlock` carries a non-null `subject`. A future refactor that added a second `extractRoleFlags` caller, or that pushed the raw warnings, would fail that assertion rather than silently ship generic cards. The emit-site `subject: null` is thus an implementation detail of one function, provable-complete at its single boundary.

`message` is unchanged at all thirteen sites.

**A missed producer is invisible at runtime** — the guard in §4.3 falls back to `helpfulContext`, so an unpopulated site renders exactly today's copy and no test fails unless one asserts otherwise. §10 test 10 is therefore a filesystem-walking meta-test, not a fixed list: it discovers every `code: "*_AUTOCORRECTED"` literal under `lib/parser/**` and asserts each emitted warning carries `autocorrect`. A NEW producer added later fails by default rather than silently degrading.

### 3.3 Persistence

The field rides the existing jsonb columns with no migration, exactly as `roleToken` and `resolution` do. A warning persisted before this change simply lacks the field and falls back per §4.3 — no backfill, no dual-read window.

## 4. Change 2: instance copy

### 4.1 A pure composer, not template reuse

The card must show the ACTUAL correction and, for the two crew-scoped codes, the crew member's name. The citation pass first proposed reusing the catalog `dougFacing` templates, which already carry the right phrasing. Reading all five templates verbatim (§2.2 line map) refuted that as the implementation path:

- Every non-crew template carries a `_<sheet-name>_` slot, not the "no subject" this spec assumed. `COLUMN_HEADER_AUTOCORRECTED.dougFacing` is "…column header on _<sheet-name>_'s crew table…"; `SECTION_HEADER` and `FIELD_LABEL` likewise. Reusing them would require sourcing a `sheet-name` param that the warning card does not have, and an unresolved slot renders a literal `<sheet-name>` on screen (`interpolate` returns the match, `lib/messages/lookup.ts:33`).
- Each of the five templates has a DIFFERENT fixed parenthetical anchor and a different trailing clause, so "swap the parenthetical, strip the suffix" is five distinct string surgeries on prose that two other surfaces (notify email, alert path) can edit at any time.

So the instance line is COMPOSED by a pure function from `autocorrect`, not lifted from a template. This honors the ratified decision (instance copy REPLACES the generic line) while owning its own copy instead of coupling to `dougFacing`. The composed phrasing MATCHES the reviewed `dougFacing` wording ("We read … in _<name>_'s role") so nothing novel reaches the operator; it simply is not the same string object.

`lib/messages/autocorrectGuidance.ts (new)` (new, pure, no I/O, client-safe):

```ts
export function autocorrectGuidance(
  code: string,
  autocorrect: { subject: string | null; corrections: { detected: string; corrected: string }[] } | undefined,
): string | null;  // null => caller falls back to catalog helpfulContext
```

It returns `null` (fall back) whenever the input cannot produce an honest, fully-attributed line; otherwise a plain-text string with NO emphasis markers.

### 4.2 Composition rules

**Correction phrase** from the surviving valid pairs (see §4.3 for which pairs survive):

- **One:** `'X' as 'Y'`
- **Two:** `'X' as 'Y' and 'P' as 'Q'`
- **Three:** `'X' as 'Y', 'P' as 'Q', and 'M' as 'N'` (serial comma, repo copy convention)
- **Four or more:** first three, then `, and N more`, where **N counts SURVIVING valid pairs only**: `N = validPairs.length - 3`. Truncation and the remainder count operate on the post-validation array, never the raw one, so a card can never read "and 2 more" when nothing remains.

**Per-code sentence template** (`<phrase>` = the correction phrase, `<subj>` = `subject`):

| Code | Composed line |
|---|---|
| `STAGE_WORD_AUTOCORRECTED` | `We read <phrase> in <subj>'s role.` |
| `ROLE_TOKEN_AUTOCORRECTED` | `We read <phrase> in <subj>'s cell.` |
| `SECTION_HEADER_AUTOCORRECTED` | `We read <phrase>.` |
| `COLUMN_HEADER_AUTOCORRECTED` | `We read <phrase>. Fix the header in the sheet if that guess is wrong.` |
| `FIELD_LABEL_AUTOCORRECTED` | `We read <phrase>. Fix the label in the sheet if that guess is wrong.` |

"role" vs "cell" matches each code's own `dougFacing` wording (stage words live in the role, a role token in its cell). The trailing "Fix the …" sentence appears for exactly the two label-correcting codes (ratified §1.1); the other three end after the phrase, the dead-end instruction cut.

**Possessive:** `<subj>'s` unconditionally, including names already ending in `s` (`Chris's`). This matches what `interpolate` would have produced substituting into the template's pre-baked `_<crew-name>_'s`, so it is the reviewed behavior, not an invented variant. One rule, pinned by §10 test 1.

Em-dash ban applies (AGENTS.md mechanical UI gate).

### 4.3 Guards

`autocorrectGuidance` returns `null` (caller renders catalog `helpfulContext`) in every case where a composed line would be dishonest, unattributed, or malformed. Because the fallback is always today's exact behavior, no guard can produce a blank card.

| Condition | Result |
|---|---|
| `autocorrect` absent (legacy persisted warning, or non-autocorrect code) | `null` → `helpfulContext` |
| `code` not one of the five | `null` → `helpfulContext` (defensive; unreachable by construction) |
| a pair whose `detected` OR `corrected` is empty/whitespace | that pair is DROPPED before composition |
| a pair whose TRIMMED `detected` equals its trimmed `corrected` | that pair is DROPPED — a `'Strike' as 'Strike'` self-correction is never shown (guards against a whitespace-only or no-op correction reaching the card) |
| zero pairs survive dropping | `null` → `helpfulContext` |
| crew-scoped code (`STAGE_WORD`, `ROLE_TOKEN`) with `subject` null/empty/whitespace | `null` → `helpfulContext` — a crew-scoped line with no name is exactly the generic card we are replacing, so generic is the honest fallback |
| non-crew code with any `subject` value | `subject` IGNORED; those templates take no name |

**Whitespace of surviving values:** `detected`/`corrected`/`subject` are used TRIMMED (leading/trailing removed) AND with interior whitespace runs collapsed to a single space, so a padded cell, a tab, or an embedded newline cannot break the sentence or the card layout. A single interior space is preserved (`Content Creation` stays two words); a tab, newline, or run of spaces becomes one space. This is `value.trim().replace(/\s+/g, " ")`, applied to `subject` and to both members of every surviving pair.

Values are plain text and are NEVER parsed as markup — see §4.4.

### 4.4 Where and how it renders

`warningCardCopyFields` (`components/admin/PerShowActionableWarnings.tsx:39`) calls `autocorrectGuidance(w.code, w.autocorrect)`. On a non-null result it returns a discriminated guidance value `{ kind: "instance", text }`; otherwise `{ kind: "catalog", markup: pick(entry?.helpfulContext) }`, i.e. today's value.

The render site at `components/admin/PerShowActionableWarnings.tsx:199-205` branches on `kind`:

- `instance` → rendered as a PLAIN TEXT node (`{text}`), NOT through `renderEmphasis`. The composed string contains no catalog emphasis markers, so there is nothing to parse; and because `subject`/`detected` are operator-sheet free text, running them through any markup parser is the exact injection defect (`renderEmphasis.tsx:61-74`, a prior Codex R1 MEDIUM). Emitting them as an opaque text node is injection-safe by construction: a member named `Foo *draft*` renders literally.
- `catalog` → rendered via `renderEmphasis` exactly as today, preserving the fallback's existing emphasis behavior.

`trigger` (the `?` popover, `triggerContext`) is untouched, and #532's `followUpCopy`, which composes into the POPOVER body rather than the inline guidance line (`components/admin/PerShowActionableWarnings.tsx:114`), is unaffected.

This removes the design's earlier "interpolation order" section: with a plain-text composed line there is no interpolation into a marked template at render time, so the ordering hazard does not arise. §10 test 9 still asserts the injection-safety property directly (a marker-bearing `subject` renders literally), because it is the invariant that matters regardless of mechanism.

## 5. Change 3: under-row placement

### 5.1 Which codes

Crew-scoped = `STAGE_WORD_AUTOCORRECTED` and `ROLE_TOKEN_AUTOCORRECTED`. These are the two whose `autocorrect.subject` is a crew member. The other three are document-scoped (`SECTION_HEADER_AUTOCORRECTED`), column-scoped (`COLUMN_HEADER_AUTOCORRECTED`, produced in crew and transport), and field-scoped (`FIELD_LABEL_AUTOCORRECTED`, produced in venue, client, event, ops, rooms, and transport). All three keep their existing section-group placement unchanged; none is crew-scoped.

The set is declared as one exported constant, `CREW_SCOPED_WARNING_CODES`, so the copy layer, the placement layer, and the tests read the same list.

### 5.2 Plumbing

A separate `warningsByCrewKey: Map<string, ReactNode[]>`, built alongside the existing section-warning model and threaded through `Step3SectionChromeContext` — the same context that already carries `crewAttention` to the row host (`components/admin/wizard/step3ReviewSections.tsx:1320`).

Keying uses `canonicalCrewKey(m.name || "")`, identical to the alert path (`components/admin/wizard/step3ReviewSections.tsx:1377`), so a member matches by the same rule for both stacks.

### 5.3 Row stack

At the row host, admin alert banners render FIRST, then warning cards. Rationale: alerts are `critical`/`notice` tone and can require a Confirm; warnings are advisory.

**Only ACTIVE warnings are eligible for under-row placement.** An IGNORED crew-scoped warning is not placed under a row; it remains in its section's existing `Ignored (N)` disclosure (`components/admin/showpage/sectionWarningExtras.tsx:130-146`), unchanged by this spec. This keeps the ignore lifecycle single-homed: ignoring an under-row card moves it OUT of the row and into that disclosure on the next render, exactly as ignoring any section card does today. `warningsByCrewKey` is built from the ACTIVE partition of the section-warning model only.

**Cap: 2 visible on the MERGED stack.** The remainder collapses into a native `<details>` reading `N more`, expanding IN PLACE. Native `<details>` matches the existing `Ignored (N)` idiom: chevron transform only, body instant, no `AnimatePresence`.

The cap counts the merged stack, not each kind separately: a member with 2 alerts and 1 warning shows 2 items and `1 more`. Alerts occupy the visible slots first (they sort first), so a member with 2+ alerts shows only alerts above the fold and every warning is inside the disclosure.

### 5.4 Structural no-drop

A crew-scoped ACTIVE warning is placed under a row when its `subject` matches a rendered row (see below). Otherwise it FALLS BACK to the section group as a real card:

- member beyond `CREW_CAP = 30` (`components/admin/wizard/step3ReviewSections.tsx:152`), so no row is rendered;
- `subject` matches no rendered row's canonical key;
- `subject` null/empty/whitespace (blank-name guard below).

Fallback mirrors `crewKeyRendered` for alerts (`lib/admin/sectionAttention.ts:122`).

**Conservation invariant (active):** every ACTIVE crew-scoped warning renders EXACTLY ONCE — under its row, or as a fallback card in the section group — never both, never neither. Ignored crew-scoped warnings render exactly once in the section's `Ignored (N)` disclosure. The two partitions are disjoint and each is conserved. §10 test 3 proves the active invariant by identity over a fixture where members exceed `CREW_CAP` (forcing fallback) AND a matched member coexists (forcing under-row), asserting against the MODEL's active list, not DOM node counts. §10 test 5b proves an ignored under-row card lands in the disclosure and nowhere else.

**Duplicate names: all cards under the first row, by construction.** `warningsByCrewKey` is keyed by `canonicalCrewKey(subject)`, so two members sharing a canonical name share ONE map entry — the model cannot associate one warning with the first row and another with the second, because both warnings carry the same `subject`. The earlier draft's "first hosts one, second falls back" split was therefore unrepresentable (R2 BLOCKING). The honest and representable rule: the FIRST rendered row with a given canonical key consumes ALL cards under that key; every later row with the same canonical name renders none. This matches the alert path's `consumedAttentionKeys` rule (`components/admin/wizard/step3ReviewSections.tsx:1379`) exactly, with no divergence.

Conservation still holds — each warning renders exactly once (all under the first matching row) — and the attribution is not misleading: the cards read "in `<name>`'s role", and when two members share a name that phrase is inherently ambiguous regardless of which row hosts the card. Nothing is dropped and nothing is duplicated. §10 test 11b asserts both same-name cards render under the first row, the second row is empty, and neither is dropped.

**Blank-name guard.** `canonicalCrewKey` is `name.trim().toLowerCase()` (`lib/admin/attentionItems.ts:223-225`), so an empty/whitespace name canonicalizes to the EMPTY STRING and every unnamed member collides on that one key. A crew-scoped warning whose `subject` is null/empty/whitespace is therefore NOT eligible for under-row placement: it falls back to the section group. Independent reasons: the empty key cannot identify a row, and §4.3 already returns the generic `helpfulContext` for a blank subject, so an under-row card there would be an unattributed generic card under an arbitrary row — worse than the group it came from. The empty string is never used as a `warningsByCrewKey` key. §10 test 11 pins it with a two-unnamed-member fixture.

## 6. Change 4: group nesting

### 6.1 Thread into the section body

Warning groups move from sibling-after-panel (`components/admin/review/ShowReviewSurface.tsx:1055`) to INSIDE the section body, threaded via `Step3SectionChromeContext` exactly as `parseNotes`, `diagramAttention`, and `reelAttention` already are (`components/admin/review/ShowReviewSurface.tsx:1020-1031`).

The extras wrapper's `border-t border-border pt-3` (`components/admin/showpage/sectionWarningExtras.tsx:127`) is deleted: containment now carries the hierarchy, so the full-bleed rule would double-signal.

**This applies to EVERY section's warning group, not just crew — so every section that renders extras today must consume the new context field, or its group silently disappears.** The affected sections are exactly those `renderSectionExtras` covers. §10 test 3b enumerates every section id that has an active warning group in a fixture and asserts each still renders its group after the sibling mount is deleted; a section renderer that forgets the context field fails it. This is the finding-9 no-drop gate and is NOT crew-specific.

### 6.2 Bulk-ignore: fallback cards in the slot, count over all instances

`BulkIgnoreControls` (`components/admin/BulkIgnoreControls.tsx:127-195`) already supports a group with `bulk` present and any `cards` node, including empty — the chip renders iff `bulk` is present (`BulkIgnoreControls.tsx:159`, `{bulk ? … : null}`), and the type context lives in the EYEBROW label, not the chip (the chip is `Ignore all N`, `BulkIgnoreControls.tsx:140-142`). So NO new "headless mode" is introduced; the crew-scoped group is an ordinary group whose `cards` slot is filtered.

For a crew-scoped code, let `N` = the count of ACTIVE instances of that code in the section (under-row PLUS fallback), and `fallbackCards` = the instances that fell back to the group (§5.4).

- **`cards` slot** = `fallbackCards` only (the under-row cards are not repeated here). Usually empty.
- **`bulk`** is present iff `N ≥ 2`, with `bulk.items` = ALL `N` active fingerprints, so the chip count is honest across both placements: `Ignore all N`. Bulk-ignore then ignores every instance of the code in the section by fingerprint, which clears BOTH the under-row cards and any fallback cards in one pass — the existing fingerprint semantics, unchanged.
- **Group emission:** the group is emitted iff `fallbackCards.length ≥ 1` OR `N ≥ 2`. So:
  - `N=1`, under a row → NOT emitted; the single card's own Ignore is the control (no `Ignore all 1`).
  - `N=1`, fallback → emitted with 1 card and NO chip.
  - `N≥2` → emitted with chip `Ignore all N`; `cards` shows only the fallback subset (possibly empty).

The eyebrow label is the code's existing group label (`model.activeGroups[].label`), unchanged. There is no per-code custom chip text; finding-14's `Ignore all 1` and zero-count cases cannot arise because the chip exists only at `N ≥ 2`.

§10 test 5 covers the scattered case (`N≥2`, empty `cards`, chip present, ignore clears under-row cards); §10 test 5c covers the mixed case (fallback card + under-row cards under one chip); §10 test 5d covers `N=1`-under-row emitting no group.

## 7. What does not change

- Every STAGED surface. All behavior here is published-only, gated by caller (the staged wizard passes no `renderSectionExtras`, `components/admin/review/ShowReviewSurface.tsx:184`), not by a mode branch inside a leaf.
- `lib/messages/catalog.ts` — no row edited, added, or removed.
- `§12.4` prose, `pnpm gen:spec-codes`, `lib/messages/__generated__/spec-codes.ts`.
- `triggerContext` popover copy and #531's coverage gate.
- `AttentionItem`, `ATTENTION_ROUTES`, `bucketAttention`, `deriveAttentionItems`, and every attention structural test.
- `ParseWarning.message` at all thirteen emit sites (§3.2).
- The eyebrow's type treatment.
- Any DB schema, migration, RPC, or advisory-lock path.

## 8. Dimensional invariants

The under-row stack is a flex parent whose children must fill it. Tailwind v4 does NOT default `.flex` to `align-items: stretch` (AGENTS.md), so each relationship is stated and browser-verified against a named `data-testid`.

Named test ids (added by this change): the stack container is `crew-warn-stack-<key>`, the disclosure is `crew-warn-more-<key>`, and each card keeps its existing `per-show-actionable-item`.

| Parent (testid) | Child (testid) | Asserted equality | Guaranteed by |
|---|---|---|---|
| `crew-warn-stack-<key>` | each `per-show-actionable-item` (warning card) | `child.width === parent.width` (content-box, both) | container `flex flex-col items-stretch` |
| `crew-warn-stack-<key>` | each `attention-banner-<alertId>` (alert child) | `child.width === parent.width` | `items-stretch` |
| `crew-warn-stack-<key>` | `crew-warn-more-<key>` | `child.width === parent.width` | `items-stretch` |
| `crew-warn-more-<key>` (open) | each disclosed child, warning OR alert | `child.width === parent.width` | body `flex flex-col items-stretch` |
| the crew row `<li>` inner content wrapper | `crew-warn-stack-<key>` | `stack.width === wrapper.contentWidth` (wrapper `clientWidth` minus its horizontal padding) | stack `w-full`, wrapper already `min-w-0 flex-1` (`step3ReviewSections.tsx:1350`) |

The stack is a MERGED alert+warning stack (§5.3), so both child kinds must fill it. Alerts already render through `attention-banner-<alertId>` in the existing under-row alert path; the invariant applies to them in the new shared container exactly as to warning cards, both above the fold and inside the open disclosure.

The fourth row measures the stack against the wrapper's CONTENT width (its `clientWidth` less left+right padding read from computed style), not the border-box, because `w-full` equals the content box of a padded parent. That distinction was underspecified before and is the one the reviewer flagged.

§10 test 6 asserts each row with `getBoundingClientRect()`/computed style in a real browser at ≤0.5px, at BOTH a mobile (375px) and a desktop (1280px) viewport, since the modal is mobile-first and `w-full` can hold at one width while an inner element overflows at another. jsdom is not accepted for these rows.

## 9. Transition inventory

The stack disclosure has THREE states, not two: **absent** (merged active count ≤ 2, no `<details>` rendered), **collapsed** (count ≥ 3, `<details>` closed), **expanded** (`<details>` open). Enumerating all three and the count-crossing transitions between them:

All three-state pairs are enumerated (3 states → 3 ordered pairs each direction, plus self-transitions):

| From | To | Trigger | Treatment |
|---|---|---|---|
| absent | collapsed | count crosses 2→3 (item added on live refresh) | disclosure mounts closed; chevron at 0°; instant (no `AnimatePresence`) |
| collapsed | absent | count crosses 3→2 (item ignored/resolved) | disclosure unmounts; the freed item joins the ≤2 visible; instant |
| collapsed | expanded | operator clicks the disclosure | chevron `rotate-90`; body appears instantly (native `<details>`) |
| expanded | collapsed | operator clicks again | chevron rotates back; body instant |
| absent | expanded | — | **IMPOSSIBLE**: expansion requires a rendered `<details>`, which exists only at count ≥ 3, i.e. never in the absent state. No treatment. |
| expanded | absent | count crosses 3→2 while open | disclosure unmounts; the two survivors promote to visible; no orphaned open node; instant |
| absent | absent | count changes within 0..2 | visible slots re-render in place; instant |
| collapsed | collapsed | count changes but stays ≥ 3, disclosure closed | closed body re-renders; chevron unchanged; instant |
| expanded | expanded | count changes but stays ≥ 3, disclosure open | see compound cases below |

Compound transitions (a mutation while the disclosure is OPEN, count stays ≥ 3 → `expanded→expanded`):

- A DISCLOSED card is ignored/resolved: it leaves in place, disclosure STAYS OPEN, hidden cards renumber. §10 test 4b.
- A VISIBLE (above-fold) card is ignored/resolved: a former hidden card PROMOTES to visible, disclosure stays open, `N more` decrements. §10 test 4d.
- An item is ADDED on live refresh (a re-sync surfaces a new warning/alert): it lands in the hidden set, `N more` increments, disclosure stays open, existing cards do not reorder above the fold. §10 test 4e.

`expanded→absent` (count crosses 3→2 while open) is the one compound case that changes disclosure state: §10 test 4c asserts no orphaned open `<details>` and no dropped card.

No `AnimatePresence` is introduced. Every transition is a native `<details>` toggle or an instant mount/unmount, so the inventory is complete and animation-free by construction.

## 10. Test plan

Anti-tautology applies throughout: expected values derive from FIXTURE data (correction arrays, member names, fixture dimensions), never hardcoded beside the assertion; where a test scans rendered DOM for a label it first removes sibling nodes that independently render it.

1. **Copy composition (unit, no DOM).** Every row of the §4.2 sentence table and every row of the §4.3 guard table. Expected phrase derives from the fixture's `corrections`; the possessive case includes a name ending in `s` (`Chris's`). Catches: a guard that returns a non-null line where it must fall back, a 4+ remainder computed on the raw rather than surviving pairs, a dropped/duplicated pair, a wrong per-code sentence, a kept trailing sentence on a strip-code or a stripped one on a keep-code.

2. **Emitter population (unit + boundary).** Each of the thirteen producers emits `autocorrect` with the right `subject` and pairs; `message` is byte-identical to a pre-change oracle captured by snapshotting each producer's output on the merge-base commit (not hand-transcribed). The ROLE stamp gets a dedicated boundary assertion: every `ROLE_TOKEN_AUTOCORRECTED` warning EXITING `parseCrewBlock` carries a non-null `subject` (§3.2 no-escape proof), so a second `extractRoleFlags` caller or a raw-push would fail.

3. **Active placement conservation (component).** Fixture with members exceeding `CREW_CAP` AND a matched member, so both fallback and under-row placement occur at once. Assert every ACTIVE crew-scoped warning appears exactly once by identity against the section MODEL's active list, not by counting DOM nodes in a container that renders both graphic and card. Failure mode caught: a warning that renders in both places, or in neither.

   3b. **All-section group no-drop (component).** Finding-9 gate. The expected section-id set is stated INDEPENDENTLY here so the test cannot derive it from the same routing it guards: `venue, event, crew, contacts, schedule, agenda, hotels, transport, rooms, diagrams, packlist, billing, report` (the `SectionId` union minus `warnings`, `lib/admin/step3SectionStatus.ts:6-20`; `warnings` is excluded because it is the panel itself, not an extras host). The fixture gives EACH of those sections one active warning group; after the sibling mount is deleted and groups thread through context, assert each of the named ids still renders its group exactly once. A hardcoded literal id list (not a value read from the model under change) is required, so a section dropped from BOTH production and model still fails the test.

4. **Cap behavior (component).** Merged counts of 1, 2, 3, 5; alerts occupy visible slots first; `N more` equals the hidden remainder; expanding reveals exactly the remainder and nothing duplicated.

   4b. **Compound: mutation while open, count stays ≥3 (component).** Ignore a disclosed card; assert the `<details>` stays open, chevron stays rotated, remainder renumbers, no card dropped.

   4c. **Compound: mutation while open crossing 3→2 (component).** Assert the disclosure unmounts, both survivors are visible, no orphaned open `<details>`, no card dropped.

   4d. **Compound: VISIBLE card ignored while open, count stays ≥3 (component).** A former hidden card promotes to visible, disclosure stays open, `N more` decrements by one, no card dropped or duplicated.

   4e. **Compound: item ADDED on live refresh while open (component).** A new warning/alert lands in the hidden set, `N more` increments, disclosure stays open, above-fold cards do not reorder.

5. **Bulk-ignore scattered case (component).** Crew-scoped code with `N≥2` all under rows: the section group renders eyebrow + `Ignore all N` chip with an EMPTY cards slot; clicking the chip ignores all N by fingerprint, clearing every under-row card in one pass AND asserting all N identities then appear EXACTLY ONCE in the section's `Ignored (N)` disclosure (post-bulk conservation, not just disappearance).

   5b. **Ignored under-row card lands once (component).** Ignore an under-row card; assert it appears in the section's `Ignored (N)` disclosure and NOT under the row, and is not double-counted.

   5c. **Bulk-ignore mixed case (component).** `N≥2` with one fallback card and the rest under rows: one chip reads `Ignore all N`, the fallback card shows in the group slot, and the chip clears both placements AND all N appear exactly once in the `Ignored (N)` disclosure afterward.

   5e. **Individual ignore crossing N=2→1 (component).** Two active instances of a crew-scoped code, both under rows; ignore one via its own card control. Assert the group header + `Ignore all N` chip DISAPPEAR (N now 1, below the emit threshold), the surviving card stays under its row, and the ignored one appears once in the `Ignored (N)` disclosure.

   5d. **N=1 under-row emits no group (component).** A single active crew-scoped warning matched to a row renders no section group header and no `Ignore all 1` chip; the card's own Ignore is the only control.

6. **Layout dimensions (real browser, Playwright).** The four §8 rows via `getBoundingClientRect()`/computed style at ≤0.5px, at 375px and 1280px. Hydrated harness — the disclosure is click-dependent, so a static layout harness cannot reach the expanded state.

7. **Staged parity (component).** Oracle = an `outerHTML` snapshot of each staged surface captured on the MERGE-BASE commit (`2a868b132`), not a hand-authored expectation. Surfaces: `StagedReviewCard`'s `per-show-actionable-item` list and its `section-warning-controls-<id>` blocks. Assert byte-identity of each against its merge-base snapshot. Additionally pin the EMPTY-WRAPPER contract: the new `crew-warn-stack-<key>` container is NOT rendered for a row with zero alerts and zero warnings (no empty wrapper, no stray test id), on BOTH staged and published surfaces — an empty wrapper would break staged byte-identity and add dead nodes to published rows.

8. **Registry/meta stability.** `tests/messages/warningCardCopyRegistry.ts` frozen strings still match the catalog (this spec edits no catalog row); #531's `_metaPopoverContextCoverage` still green; `bucketAttention` conservation still green.

9. **Injection safety (component).** Render with `subject` = `Foo *draft*` and a `detected` token containing `_`. Assert the composed instance line renders those characters LITERALLY (the line is a plain text node, §4.4) — no `<em>`/`<strong>` introduced by the param, no split markers. This is a differential guard: it fails if an implementer routes the composed line through `renderEmphasis`.

10. **Producer completeness (structural meta-test — the one this spec CREATES).** Filesystem-walk `lib/parser/**` for every `code: "<X>_AUTOCORRECTED"` literal and assert each producing site emits a warning carrying `autocorrect`; a new producer fails by default. Registry-with-inline-exemption style (`tests/log/_metaMutationSurfaceObservability.test.ts`). Exists because §3.2's failure mode is invisible: an unpopulated producer renders today's copy and breaks nothing else. The walk keys on the literal, so a producer that constructs the code by any non-literal means (alias, computed string, helper) is NOT discovered — that limitation is stated in the test so a future such producer is added deliberately, and `CREW_SCOPED_WARNING_CODES` classification is asserted here too so a miscategorized code cannot let production and tests agree.

11. **Blank-name collision (component).** Two members with empty/whitespace names, each carrying a crew-scoped warning. Assert neither renders under a row, both render as fallback cards in the section group, none dropped.

    11b. **Duplicate non-blank names (component).** Two rendered rows with the same canonical non-blank key, each with a crew-scoped warning. Assert the first row hosts its card, the second row's card falls back to the group (not silently dropped), and conservation holds.

## 11. Fan-out checklist

| Surface | Action |
|---|---|
| `lib/parser/types.ts` | add `autocorrect` optional |
| `lib/messages/autocorrectGuidance.ts (new)` | NEW pure composer (§4.1) |
| 13 emitter sites (§3.2) | populate; `message` unchanged |
| `components/admin/PerShowActionableWarnings.tsx` | instance-copy path in `warningCardCopyFields` |
| `lib/admin/sectionWarningModel.ts` | build `warningsByCrewKey` (active); partition crew-scoped fallback vs under-row; declare `CREW_SCOPED_WARNING_CODES` |
| `components/admin/wizard/step3ReviewSections.tsx` | row-stack host, cap, disclosure |
| `components/admin/review/ShowReviewSurface.tsx` | thread groups into section body |
| `components/admin/showpage/sectionWarningExtras.tsx` | delete wrapper `border-t` |
| `components/admin/BulkIgnoreControls.tsx` | crew-scoped group: `cards`=fallback subset, `bulk` counts all N (§6.2); no new mode |
| `tests/messages/warningCardCopyRegistry.ts` | verify unaffected |
| `tests/parser/_metaAutocorrectProducers.test.ts (new)` | NEW producer-completeness meta-test (§10.10) |
| impeccable critique + audit | invariant 8 (UI surface) |
| Playwright real-browser spec | §8 dimensional invariants |

## 12. Review history

- **Citation pass (2026-07-21, pre-draft):** corrected the ROLE emit-vs-stamp asymmetry (§3.2) and found the `dougFacing` crew-name slot.
- **Self-review (pre-R1):** found the 13-vs-5 producer miscount and the interpolation-order hazard.
- **Spec review R1 (Codex, inlined):** 15 findings, verdict BLOCKING. Resolved: producer-inventory coherence (§3.2, single count + line map); ROLE stamp no-escape proof (§3.2, single call site + boundary test); catalog line-ownership map (§2.2); the `dougFacing`-reuse fragility, resolved by pivoting to a pure composer (§4, `autocorrectGuidance`), which also eliminated the `_<sheet-name>_` gap, the cross-surface coupling, and the markup-injection hazard; truncation/`N` on surviving pairs (§4.2-4.3); the headless-vs-fallback placement contradiction (§6.2); conservation scoped to active/ignored (§5.3-5.4); all-section no-drop (§6.1); transition absent-state (§9); dimensional testids + viewport (§8); anti-tautology gaps and test renumber (§10).
- **Spec review R2 (Codex, inlined):** 9 findings, verdict BLOCKING (R1 15→R2 9, convergent). Resolved: the duplicate-name key-model impossibility (§5.4 — `warningsByCrewKey` keys by name, so same-name warnings share an entry; the split was unrepresentable, now all cards render under the FIRST matching row, conservation intact); post-bulk-ignore conservation into the `Ignored (N)` disclosure (§10.5/5c); the N=2→1 group-emission transition (§10.5e); composer guards for equal-value pairs and interior tab/newline whitespace (§4.3); the absent↔expanded transition pair and visible-card/add compound cases (§9, §10.4d/4e); alert children in the dimensional invariants (§8); an INDEPENDENT hardcoded section-id oracle for all-section no-drop (§10.3b); a merge-base snapshot oracle + empty-wrapper contract for staged parity (§10.7); a stale `§10 test 10`→`9` reference (§4.4).

**Meta-test inventory (writing-plans):** this milestone CREATES one structural meta-test — `tests/parser/_metaAutocorrectProducers.test.ts (new)` (§10.10, producer completeness). It EXTENDS none. The `bucketAttention` conservation test and `_metaPopoverContextCoverage` are asserted UNAFFECTED (§10.8), not extended.

## 13. Open questions

None. All ratified decisions are in §1.1; every R1 finding is resolved above.
