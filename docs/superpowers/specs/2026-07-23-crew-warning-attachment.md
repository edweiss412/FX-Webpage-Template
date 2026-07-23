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
- **Fallback scope = ALL sections** (second AskUserQuestion answer), not crew-only. Every section's warning extras move inside that section's panel card.
- **No copy changes.** Warning `message` text, group label ("Phone or email we couldn't use"), and §12.4 catalog rows are untouched. The B-option mockup's "John Redcorn's phone…" rewording is NOT in scope (mockup shorthand only).
- **No DB, no RPC, no advisory locks, no telemetry-surface changes.** Pure client render placement. Invariants 2/3/9/10 have no new surface here.
- **Backward-compat keying for the 2 autocorrect codes:** they keep keying off `autocorrect.subject` ONLY (never `blockRef`), byte-identical to today (§4.1). Ratified here to preempt "why not blockRef everywhere" relitigation.
- **Warnings-section Silent/seamless path unchanged:** when `suppressPanelCard` is set there is no card to tuck into; extras keep today's placement + seamless styling (`ShowReviewSurface.tsx:1140-1142`, `sectionWarningExtras.tsx:226-230`).
- **Staged wizard unchanged:** it passes no `renderSectionExtras` (`ShowReviewSurface.tsx:204`, "the staged wizard passes neither"), so the chrome change is inert there by construction.

## 2. Design

### A. Under-row placement for blockRef-crew warnings

New helper — single source for "which crew row does this warning belong under":

```ts
// lib/admin/crewRowKey.ts
import type { ParseWarning } from "@/lib/parser/types";
import { CREW_SCOPED_WARNING_CODES } from "@/lib/parser/autocorrectCodes";
import { canonicalCrewKey } from "@/lib/admin/attentionItems";

/** Canonical crew-row key for under-row warning placement, or null when the
 *  warning carries no usable crew identity (falls back to the section group).
 *  - The 2 autocorrect codes key off `autocorrect.subject` ONLY (today's
 *    behavior, byte-identical; a blank subject falls back even if a crew
 *    blockRef exists).
 *  - Any OTHER code keys off `blockRef` when kind === "crew" and `name` is a
 *    non-blank string. */
export function crewRowKeyForWarning(w: ParseWarning): string | null {
  if (CREW_SCOPED_WARNING_CODES.has(w.code)) {
    const subject = w.autocorrect?.subject;
    if (typeof subject !== "string") return null;
    const key = canonicalCrewKey(subject);
    return key.length === 0 ? null : key;
  }
  const ref = w.blockRef;
  if (!ref || ref.kind !== "crew" || typeof ref.name !== "string") return null;
  const key = canonicalCrewKey(ref.name);
  return key.length === 0 ? null : key;
}
```

Call sites (both replace their inline keying, conservation stays exact):

- `lib/admin/sectionWarningModel.ts:126-135` — the `crewKeyMap` loop drops its `CREW_SCOPED_WARNING_CODES` gate + `autocorrect.subject` read; every active item with a non-null `crewRowKeyForWarning` is indexed. Map accumulation (prototype-safe) unchanged.
- `components/admin/showpage/sectionWarningExtras.tsx:170-191` — the group filter drops its `CREW_SCOPED_WARNING_CODES.has(g.code)` gates; per-item exclusion becomes `const k = crewRowKeyForWarning(it.warning); return !(k !== null && excludedKeys.has(k))`. The §6.2 orphan-eyebrow emission rule generalizes to `groupItems.length === 0 && !g.bulk` for ANY code (a group can only be emptied by this filter, so the condition is equivalent for the legacy codes and correct for the new ones).

Everything downstream is reused untouched: `renderCrewUnderRowCards` (`sectionWarningExtras.tsx:27`) already iterates `warningsByCrewKey` generically; the row host merge + 2-visible-card cap + "N more" (`step3ReviewSections.tsx:1571-1577`, `sectionWarningExtras.tsx:43-45` comment) and per-card Report/Ignore + use-raw + recognize-role controls are code-agnostic.

### B. Section warning groups tucked inside the panel card (all sections)

`Step3SectionChrome` (`step3ReviewSections.tsx:437`) gains one optional field:

```ts
/** Crew-warning-attachment spec §2B: the section's warning extras node,
 *  rendered as the LAST child inside the §5.2 panel card (border-t seam)
 *  so warning groups sit within the card they describe. ABSENT when the
 *  section has no extras or its panel card is suppressed
 *  (exactOptionalPropertyTypes: present or ABSENT, never undefined). */
sectionExtras?: ReactNode;
```

- `ShowReviewSurface.tsx` (~1040-1142): compute `extrasNode = renderSectionExtras?.(s.id, data, …)` before the provider. When the section's panel card is NOT suppressed, spread `...(extrasNode ? { sectionExtras: extrasNode } : {})` into the chrome value and render nothing at the old sibling position. When suppressed (`s.id === "warnings" && suppressWarningsPanelCard`), keep today's sibling render with `seamless: true` — unchanged.
- `ModalSectionChrome` (`step3ReviewSections.tsx:935-957`): render `chrome.sectionExtras` after `{children}` inside the `hasBody` div. The extras root already carries `mt-3 … border-t border-border pt-3` (`sectionWarningExtras.tsx:226-230`) which now reads as an in-card seam — no styling change required to the extras themselves.
- **Consumption guarantee:** every SectionId that can carry routed warnings renders its body through `ModalSectionChrome` (all parsed sections use `BreakdownSection`/chrome per `step3ReviewSections.tsx:963-965`; the `warnings` section is the suppress-path exception handled above). The plan's test task pins this with a containment assertion (§5) so a future chrome-less section cannot silently drop its extras.

### Guard conditions

- `blockRef` absent / `kind !== "crew"` / `name` absent / `name` blank after trim → helper returns null → item stays in the section group (fallback B). Exactly today's behavior for all such items.
- Crew name present but row not rendered (over-`CREW_CAP` slice or no roster match, `PublishedReviewModal.tsx:255-258`) → key not in `renderedKeys` → `renderCrewUnderRowCards` omits it (`sectionWarningExtras.tsx:42`) and the group filter keeps it (excludedKeys only contains rendered keys, `sectionWarningExtras.tsx:73-78`). Fallback B.
- `sectionExtras` ABSENT (no warnings, or staged mode) → chrome renders exactly today's markup — zero-diff.
- Duplicate crew names collapsing to one `canonicalCrewKey` → items bucket together under the FIRST rendered matching row (existing `consumedAttentionKeys` behavior, `step3ReviewSections.tsx:1571-1576`) — unchanged semantics.
- `warnings`/`report` sections: `warnings` is the suppress path; `report` gets no routed warnings (not a parser region) — extras factory returns null for empty models (`sectionWarningExtras.tsx:155`).

### Transition inventory

No new visual states. Extras placement is static with the section render — instant, no animation (same posture as the existing extras: the `ShowReviewSurface.tsx:1153` instant-deliberate posture). Under-row cards inherit the existing row-host mount behavior (no new transitions). N(N−1)/2 = 0 new pairs.

### Dimensional invariants

One containment relationship: the extras block (`[data-testid^="section-warning-controls-"]`) must sit INSIDE the section panel card's border box. Guaranteed structurally (React child of the `hasBody` div). Verified with a real-browser `getBoundingClientRect()` containment assertion (card.top ≤ extras.top ∧ extras.bottom ≤ card.bottom ∧ same for x-axis, 0.5px tolerance) — jsdom is not sufficient for layout (project rule).

## 3. Flag lifecycle

No new flags/toggles. N/A.

## 4. Tier × domain matrix

No DB layer touched. All cells N/A — change is confined to: a NEW `crewRowKey` module under `lib/admin/` (§2A), `lib/admin/sectionWarningModel.ts` (keying), `components/admin/showpage/sectionWarningExtras.tsx` (filter + emission rule), `components/admin/wizard/step3ReviewSections.tsx` (chrome type + card child), `components/admin/review/ShowReviewSurface.tsx` (threading), tests.

## 5. Testing

1. **Helper unit tests** (a NEW crewRowKey test under `tests/admin/`): autocorrect code + subject → subject key; autocorrect code + blank/missing subject + crew blockRef → null (backward-compat pin); non-autocorrect code + crew blockRef name → key; kind ≠ crew → null; blank name → null; no blockRef → null.
2. **Model test** (extend existing sectionWarningModel coverage): a `FIELD_UNREADABLE` warning with crew blockRef lands in `warningsByCrewKey` under `canonicalCrewKey(name)`; conservation — the same item filtered from `activeGroups` render path only when its key is rendered.
3. **Extras conservation/emission tests** (extend existing extras tests): group emptied by under-row placement with no bulk → no group emitted (generalized §6.2); group with bulk (≥2 distinct snippets, `lib/dataQuality/bulkIgnoreGroups.ts:20-40`) keeps its chip with empty cards slot; unrendered-key item stays in group.
4. **Chrome containment** (jsdom structural): `sectionExtras` node renders inside the panel-card div when `hasBody`; ABSENT chrome field → byte-identical markup (snapshot or DOM-shape assertion); suppressed-card warnings section keeps sibling placement.
5. **Real-browser layout assertion** (Playwright, per Dimensional invariants): rect containment of extras within the crew panel card on a published fixture with an unmatched-name warning (forces fallback B), and an under-row card beneath the matching row for a matched-name `FIELD_UNREADABLE` fixture.
6. **Meta-test inventory:** no structural registries touched — no new Supabase calls, mutations, §12.4 codes, or advisory locks. `tests/parser/_metaAutocorrectProducers.test.ts` pins `CREW_SCOPED_WARNING_CODES` equal to the 2 codes — untouched (the set's meaning narrows to "codes keyed by autocorrect.subject"; comment updated, membership unchanged).
7. **Impeccable dual-gate** (invariant 8): `/impeccable critique` + `/impeccable audit` on the affected diff (UI surface under `components/`).

## 6. Numeric sweep

Literals used: 2 autocorrect codes (matches `autocorrectCodes.ts:10-13`); 2-visible-card row cap (existing, `sectionWarningExtras.tsx:43-45`); ≥2 bulk threshold (existing, `bulkIgnoreGroups.ts:37`); 0.5px layout tolerance (project rule); 0 new transition pairs. All cross-checked against cited lines this session.
