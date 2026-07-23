# Crew warning attachment — under-row placement for blockRef-crew warnings + in-card section groups

**Date:** 2026-07-23
**Status:** Draft
**Mode:** Autonomous ship (user approved at brainstorming gate)
**Prior specs extended:** `2026-07-21-warning-card-identity-placement` (under-row mechanism), `2026-07-22-warning-panel-polish` (seamless extras).

## 1. Problem

On the published show modal, the `FIELD_UNREADABLE` warning for John Redcorn's phone ("Phone or email we couldn't use" group) renders as a floating banner between the Crew card and the Contacts card. Two causes:

1. Under-row placement (`warningsByCrewKey`) is gated to exactly two codes — `STAGE_WORD_AUTOCORRECTED`, `ROLE_TOKEN_AUTOCORRECTED` (`lib/parser/autocorrectCodes.ts:10`) — keyed off `autocorrect.subject` (`lib/admin/sectionWarningModel.ts:126-135`). `FIELD_UNREADABLE` carries crew identity only in `blockRef` (`{ kind: "crew", name: "John Redcorn", index: 4 }`), so it never keys under a row. Captured telemetry confirms: `warningsByCrewKey: {}`.
2. The section warning group renders via `renderSectionExtras` at `components/admin/review/ShowReviewSurface.tsx:1140` — a sibling AFTER the section's chrome output, i.e. OUTSIDE the §5.2 panel card that `ModalSectionChrome` draws (`components/admin/wizard/step3ReviewSections.tsx:935-957`). Visually detached from the section it describes.

## 1.1 Resolved scope — do not relitigate

- **User chose "Both: A with B as fallback"** (AskUserQuestion, this session): under-row placement when the warning's crew name matches a rendered row; fallback group tucked inside the section card otherwise.
- **Fallback scope = all ROUTED non-warnings sections** (second AskUserQuestion answer resolved "All sections" — executable domain pinned R2-F1): the 11 warning-routing targets `venue, event, crew, contacts, schedule, agenda, hotels, transport, rooms, packlist, billing` (`KIND_TO_SECTION`, `lib/admin/step3SectionStatus.ts:22-45` — note `agenda: "agenda"` IS a routing target; the R2 review claim that it is not is refuted by that line). Excluded: `warnings` (sibling path, R1-F1), `report` (published render is null, `components/admin/review/sectionInclusion.ts:31-41`), `diagrams` (no routing target; nested sub-block under rooms).
- **No copy changes.** Warning `message` text, group label ("Phone or email we couldn't use"), and §12.4 catalog rows are untouched. The B-option mockup's "John Redcorn's phone…" rewording is NOT in scope (mockup shorthand only).
- **No DB, no RPC, no advisory locks, no telemetry-surface changes.** Pure client render placement. Invariants 2/3/9/10 have no new surface here.
- **Backward-compat keying for the 2 autocorrect codes:** they keep keying off `autocorrect.subject` ONLY (never `blockRef`), byte-identical to today (§2A; stale §4.1 ref fixed R3-F3). Ratified here to preempt "why not blockRef everywhere" relitigation.
- **Warnings section keeps sibling placement in BOTH states (R1-F1).** The warnings section's extras NEVER thread through the chrome — they keep today's sibling render (suppressed→seamless and non-suppressed alike, `ShowReviewSurface.tsx:1140-1142`, `sectionWarningExtras.tsx:226-230`). Rationale: threading only the non-suppressed state would reparent the extras subtree across Silent↔non-Silent transitions, remounting it and violating the pinned same-node contract on the Ignored `<details>` (`tests/components/admin/showpage/warningsPanelTransitions.test.tsx:315`) plus losing BulkIgnoreControls armed/error state and open Report modals. Only NON-warnings sections move inside the card, and those cards are never suppressed (`suppressPanelCard` is set only for `warnings`, `ShowReviewSurface.tsx:1063-1065`), so no element changes parent across MODAL UI STATE transitions. (The DATA-driven matched↔fallback move of an under-row card is a distinct, pre-existing transition — inventoried below, R2-F2.)
- **Staged wizard unchanged:** it passes no `renderSectionExtras` (`ShowReviewSurface.tsx:204`, "the staged wizard passes neither"), so the chrome change is inert there by construction.

## 2. Design

### A. Under-row placement for blockRef-crew warnings

New helper — single source for "which crew row does this warning belong under":

```ts
// lib/admin/crewRowKey.ts
import type { ParseWarning } from "@/lib/parser/types";
import { CREW_SCOPED_WARNING_CODES } from "@/lib/parser/autocorrectCodes";
import { canonicalCrewKey } from "@/lib/admin/attentionItems";
import { stripDayRestrictionParen } from "@/lib/parser/personalization";

/** Canonical crew-row key for under-row warning placement, or null when the
 *  warning carries no usable crew identity (falls back to the section group).
 *  - The 2 autocorrect codes key off `autocorrect.subject` ONLY (today's
 *    behavior, byte-identical; a blank subject falls back even if a crew
 *    blockRef exists).
 *  - Any OTHER code keys off `blockRef` when kind === "crew" and `name` is a
 *    non-blank string. blockRef.name is the RAW name cell (crew.ts:294 keeps
 *    it raw for deep-link anchoring), while the rendered roster name is the
 *    day-restriction-stripped displayName (crew.ts:336), so the raw name is
 *    passed through the SAME paren-ONLY strip before keying (R3-F1). */
export function crewRowKeyForWarning(w: ParseWarning): string | null {
  if (CREW_SCOPED_WARNING_CODES.has(w.code)) {
    const subject = w.autocorrect?.subject;
    if (typeof subject !== "string") return null;
    const key = canonicalCrewKey(subject);
    return key.length === 0 ? null : key;
  }
  const ref = w.blockRef;
  if (!ref || ref.kind !== "crew" || typeof ref.name !== "string") return null;
  const key = canonicalCrewKey(stripDayRestrictionParen(ref.name));
  return key.length === 0 ? null : key;
}
```

**`stripDayRestrictionParen` (R3-F1, single-source):** a new export from `lib/parser/personalization.ts` — `(cell: string) => cell.replace(PAREN_ONLY_PATTERN, "").trim()` — and `extractDayRestriction`'s existing strip sites (`personalization.ts:79`, `personalization.ts:85`, `personalization.ts:91`) are refactored to call it, so the display transform and the keying transform cannot drift. Parity holds for every corpus form: paren-ONLY in name cell strips identically on both paths; no marker is a no-op. The one divergence is the defensive DOUBLE_LOCATION branch (paren in BOTH cells, corpus-absent, `personalization.ts:71-80`): display keeps the name paren while the key strips it → mismatch → fallback-to-group placement (safe, conservative; documented accepted).

Call sites (both replace their inline keying, conservation stays exact):

- `lib/admin/sectionWarningModel.ts:126-135` — the `crewKeyMap` loop drops its `CREW_SCOPED_WARNING_CODES` gate + `autocorrect.subject` read; every active item with a non-null `crewRowKeyForWarning` is indexed. Map accumulation (prototype-safe) unchanged.
- `components/admin/showpage/sectionWarningExtras.tsx:170-191` — the group filter drops its `CREW_SCOPED_WARNING_CODES.has(g.code)` gates; per-item exclusion becomes `const k = crewRowKeyForWarning(it.warning); return !(k !== null && excludedKeys.has(k))`. The §6.2 orphan-eyebrow emission rule generalizes to `groupItems.length === 0 && !g.bulk` for ANY code (a group can only be emptied by this filter, so the condition is equivalent for the legacy codes and correct for the new ones).

Everything downstream is reused untouched: `renderCrewUnderRowCards` (`sectionWarningExtras.tsx:27`) already iterates `warningsByCrewKey` generically; the alert/warning merge (`mergeByCrewKey`, `ShowReviewSurface.tsx:159-165`), the row-host key lookup/consumption (`step3ReviewSections.tsx:1571-1577`), the 2-visible-card cap + "N more" (`CrewUnderRowStack`, `step3ReviewSections.tsx:1450-1462`) and per-card Report/Ignore + use-raw + recognize-role controls are code-agnostic. (Citations corrected R3-F2.)

### B. Section warning groups tucked inside the panel card (routed non-warnings sections)

`Step3SectionChrome` (`step3ReviewSections.tsx:437`) gains one optional field:

```ts
/** Crew-warning-attachment spec §2B: the section's warning extras node,
 *  rendered as the LAST child inside the §5.2 panel card (border-t seam)
 *  so warning groups sit within the card they describe. ABSENT when the
 *  section has no extras or is the warnings section (sibling path, §1.1)
 *  (exactOptionalPropertyTypes: present or ABSENT, never undefined). */
sectionExtras?: ReactNode;
```

(R1-F4: `step3ReviewSections.tsx` does not currently import the `ReactNode` type — the implementation adds `import type { ReactNode } from "react"` or uses `React.ReactNode`.)

- `ShowReviewSurface.tsx` (~1040-1142): compute `extrasNode = renderSectionExtras?.(s.id, data, …)` before the provider. For every section EXCEPT `warnings`, spread `...(extrasNode != null ? { sectionExtras: extrasNode } : {})` (nullish guard, R2-F3) into the chrome value and render nothing at the old sibling position. For `s.id === "warnings"`, keep today's sibling render in BOTH suppression states (§1.1 R1-F1 — no state-conditional reparenting).
- `ModalSectionChrome` (`step3ReviewSections.tsx:935-957`): render `chrome.sectionExtras` after `{children}` inside the `hasBody` div. The extras root already carries `mt-3 … border-t border-border pt-3` (`sectionWarningExtras.tsx:226-230`) which now reads as an in-card seam — no styling change required to the extras themselves.
- **Consumption guarantee (R1-F2, domain fixed R2-F1):** every routed non-warnings SectionId (the 11-target §1.1 list) renders its body through `ModalSectionChrome` (`BreakdownSection` per `step3ReviewSections.tsx:963-965`; agenda invokes `ModalSectionChrome` directly at `step3ReviewSections.tsx:3352-3357` — same consumption point). Pinned by the presence test (§5.4b): the full published surface renders with a warning routed to EACH of the 11 targets (fixture includes a non-empty `agendaBaseline` so the conditional agenda section mounts, `sectionInclusion.ts:27-29`), asserting each `section-warning-controls-<id>` node exists AND is a descendant of that section's panel card — a chrome-less host fails presence.
- **Empty-seam guard (R1-F3):** when the generalized filter empties EVERY active group of a section (all items moved under rows, no bulk chips) AND there are no ignored warnings, `buildSectionWarningExtras`'s callback returns `null` instead of the bordered `mt-3 border-t pt-3` wrapper — the seam block never renders with zero children. Condition evaluated on the POST-FILTER `activeGroups` array plus `ignoredWarnings.length`, not on the pre-filter model (which is non-empty by hypothesis). An ignored-only section still renders the wrapper (Ignored disclosure is real content).

### Guard conditions

- `blockRef` absent / `kind !== "crew"` / `name` absent / `name` blank after trim → helper returns null → item stays in the section group (fallback B). Exactly today's behavior for all such items.
- Crew name present but row not rendered (over-`CREW_CAP` slice or no roster match, `PublishedReviewModal.tsx:255-258`) → key not in `renderedKeys` → `renderCrewUnderRowCards` omits it (`sectionWarningExtras.tsx:42`) and the group filter keeps it (excludedKeys only contains rendered keys, `sectionWarningExtras.tsx:73-78`). Fallback B.
- `sectionExtras` prop guards (R2-F3): the threading guard is NULLISH (`extrasNode != null`), not truthiness. null/undefined factory return → field ABSENT (spread-omitted) → chrome renders exactly today's markup — zero-diff. Falsy-but-renderable values (`false`, `""`, `0`) would thread verbatim and render per React semantics, but are unreachable: `buildSectionWarningExtras`'s callback returns a JSX element or null only (`sectionWarningExtras.tsx:153-155` and `sectionWarningExtras.tsx:219`). Chrome renders `{chrome.sectionExtras}` directly.
- Duplicate crew names collapsing to one `canonicalCrewKey` → items bucket together under the FIRST rendered matching row (existing `consumedAttentionKeys` behavior, `step3ReviewSections.tsx:1571-1576`) — unchanged semantics.
- `warnings`/`report` sections: `warnings` always takes the sibling path (§1.1 R1-F1); `report` gets no routed warnings (not a parser region) — extras factory returns null for empty models (`sectionWarningExtras.tsx:155`).

### Producer sweep (R1, recorded so later rounds do not re-derive)

Complete production set of warnings carrying `blockRef.kind === "crew"` + `name`: the 2 subject-keyed autocorrect codes, plus `FIELD_UNREADABLE`, `UNKNOWN_STAGE_RESTRICTION`, `UNKNOWN_ROLE_TOKEN`, `UNKNOWN_DAY_RESTRICTION`. All four blockRef-keyed producers describe a specific crew row — under-row placement is correct for each; none uses the shape for a section-level summary. `UNKNOWN_ROLE_TOKEN` keeps its recognize-role control under the row (`renderCrewUnderRowCards` mounts the same `SectionWarningItemControls`).

### Transition inventory

No new visual states. Extras placement is static with the section render — instant, no animation — the extras subtree carries no transition/animation classes or motion props (`sectionWarningExtras.tsx:219-230` static class lists; citation corrected R3-F2). No element changes parent across modal UI state transitions: non-warnings extras are ALWAYS in-card, warnings extras are ALWAYS sibling (§1.1 R1-F1), so the Silent↔List/Elsewhere/Clean pairs and the compound parseNotes transitions are untouched — the pinned same-node `<details>` contract (`warningsPanelTransitions.test.tsx:315`) keeps passing unmodified.

**Matched↔fallback data transition (R2-F2, declared intentional):** when a live data refresh changes the roster (rename, reorder, `CREW_CAP` crossing), an under-row card's key can leave/enter `renderedCrewKeys`, moving the card between the row stack and the section group. This is a REMOUNT — component-local state below the card (pending ignore, ignore error, an open Report modal, use-raw/recognize-role in-flight state, `DataQualityWarningControls`, `ReportButton`) is discarded. Instant, no animation. **Pre-existing shipped behavior** for the 2 autocorrect codes since spec 2026-07-21 §5 — this spec extends the same semantics to the blockRef-keyed codes, not a new mechanism. Accepted because the transition fires only on a data refresh that may add/remove/reshape the warning itself; transient control state tied to a stale roster identity is correctly abandoned. Tested (§5.3b): jsdom rerender flips a key out of `renderedKeys` → card present in group and absent from row map (and inverse), both sides asserted on the same rerender.

### Dimensional invariants

One containment relationship: the extras block (`[data-testid^="section-warning-controls-"]`) must sit INSIDE the section panel card's border box. Guaranteed structurally (React child of the `hasBody` div). Verified with a real-browser `getBoundingClientRect()` containment assertion (card.top ≤ extras.top ∧ extras.bottom ≤ card.bottom ∧ same for x-axis, 0.5px tolerance) — jsdom is not sufficient for layout (project rule).

## 3. Flag lifecycle

No new flags/toggles. N/A.

## 4. Tier × domain matrix

No DB layer touched. All cells N/A — change is confined to: a NEW `crewRowKey` module under `lib/admin/` (§2A), `lib/parser/personalization.ts` (export + pure refactor of the paren-strip, R3-F1), `lib/admin/sectionWarningModel.ts` (keying), `components/admin/showpage/sectionWarningExtras.tsx` (filter + emission rule), `components/admin/wizard/step3ReviewSections.tsx` (chrome type + card child), `components/admin/review/ShowReviewSurface.tsx` (threading), tests.

## 5. Testing

1. **Helper unit tests** (a NEW crewRowKey test under `tests/admin/`): autocorrect code + subject → subject key; autocorrect code + blank/missing subject + crew blockRef → null (backward-compat pin); non-autocorrect code + crew blockRef name → key; **raw day-restriction name (R3-F1):** `"Calvin Saller (6/24 and 6/26 ONLY)"` → `"calvin saller"` (matches the stripped displayName); paren-only name (strips to empty) → null; kind ≠ crew → null; blank name → null; no blockRef → null. Plus a parity pin: `extractDayRestriction({nameCell, roleCell:""}).cleanedNameCell === stripDayRestrictionParen(nameCell)` over the corpus name forms (single-source refactor cannot drift).
2. **Model test** (extend existing sectionWarningModel coverage): a `FIELD_UNREADABLE` warning with crew blockRef lands in `warningsByCrewKey` under `canonicalCrewKey(name)`; conservation — the same item filtered from `activeGroups` render path only when its key is rendered.
3. **Extras conservation/emission tests** (extend existing extras tests): group emptied by under-row placement with no bulk → no group emitted (generalized §6.2); group with bulk (≥2 distinct snippets, `lib/dataQuality/bulkIgnoreGroups.ts:20-40`) keeps its chip with empty cards slot; unrendered-key item stays in group; **empty-seam guard (R1-F3)** — all groups emptied + no bulk + no ignored → callback returns null (no bordered wrapper); ignored-only → wrapper renders.
4. **Chrome containment** (jsdom structural): `sectionExtras` node renders inside the panel-card div when `hasBody`; ABSENT chrome field → byte-identical markup (snapshot or DOM-shape assertion); null factory return → field NOT threaded (key absent from chrome value, nullish guard R2-F3); warnings section keeps sibling placement in BOTH suppression states (R1-F1).
3b. **Matched↔fallback rerender test (R2-F2):** jsdom rerender flips a key out of (and back into) the rendered set; assert card in group ∧ absent from row map after the flip, and the inverse — both sides on the same rerender (conservation across the data transition).
4b. **Routed-sections presence test (R1-F2, domain per R2-F1):** render the full published surface with a routed warning for EACH of the 11 routing-target sections (helpers: `tests/helpers/publishedSurfaceProps.tsx`; fixture carries a non-empty `agendaBaseline` so agenda mounts); assert each `section-warning-controls-<id>` exists and `panelCard.contains(extras)` per section — pins that every host consumes the chrome field; a chrome-less host fails presence. `report`/`diagrams` excluded per §1.1.
5. **Real-browser layout assertion** (Playwright, per Dimensional invariants): rect containment of extras within the crew panel card on a published fixture with an unmatched-name warning (forces fallback B), and an under-row card beneath the matching row for a matched-name `FIELD_UNREADABLE` fixture.
6. **Meta-test inventory:** no structural registries touched — no new Supabase calls, mutations, §12.4 codes, or advisory locks. `tests/parser/_metaAutocorrectProducers.test.ts` pins `CREW_SCOPED_WARNING_CODES` equal to the 2 codes — untouched (the set's meaning narrows to "codes keyed by autocorrect.subject"; comment updated, membership unchanged).
7. **Impeccable dual-gate** (invariant 8): `/impeccable critique` + `/impeccable audit` on the affected diff (UI surface under `components/`).

## 6. Numeric sweep

Literals used: 2 autocorrect codes (matches `autocorrectCodes.ts:10-13`); 11 routed non-warnings sections (§1.1 list = distinct values of `KIND_TO_SECTION`, `step3SectionStatus.ts:22-45`, counted this session); 4 blockRef-keyed producer codes (§2 producer sweep); 2-visible-card row cap (existing, `sectionWarningExtras.tsx:43-45`); ≥2 bulk threshold (existing, `bulkIgnoreGroups.ts:37`); 0.5px layout tolerance (project rule); 0 new UI-state transition pairs + 1 declared data transition (matched↔fallback, pre-existing class). All cross-checked against cited lines this session.
