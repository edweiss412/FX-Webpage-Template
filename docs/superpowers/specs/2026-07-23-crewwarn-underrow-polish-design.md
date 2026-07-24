# Crew warning under-row polish — indent binding, condensed copy, cap fixture

Date: 2026-07-23
Status: draft (autonomous-ship pipeline; user gates waived per AGENTS.md checkpoint, approved 2026-07-23)
Findings addressed (DEFERRED.md, 2026-07-23 reconcile):

- `CREWWARN-UNDERROW-INDENT-1` — [P1, partially fixed] under-row warning card binds to its member by spacing only (DEFERRED.md:11)
- `CREWWARN-UNDERROW-COPY-CONDENSE-1` — [P2] under-row card repeats the group card's full generic copy (DEFERRED.md:17)
- `CREWWARN-CAP-FIXTURE-1` — [P3] no visual fixture for the 3-warnings-one-member cap state (DEFERRED.md:29)

Explicitly NOT addressed: `CREWWARN-INCARD-MOBILE-EYEBROW-1` (DEFERRED.md:23) — its fix lands in shared `BulkIgnoreControls`, whose other call sites reflow; stays deferred on its own trigger.

Un-defer triggers satisfied: this bundle touches `CrewUnderRowStack`'s layout surface (triggers for INDENT-1 and CAP-FIXTURE-1) and the warning-card copy rendering layer (trigger for COPY-CONDENSE-1).

User decisions ratified 2026-07-23 against the phone-width mockup artifact (Claude artifact 9118f9bc-e130-44d5-87c5-3b5772249ebc): **Option A-lite (24px half indent, warning cards only)** for Choice 1; **Condensed** for Choice 2.

## §1.1 Resolved scope — do not relitigate

| # | Decision | Ratification |
|---|----------|--------------|
| 1 | Warning cards indent **24px**; the full 52px name-column indent was REJECTED by the user for mobile wrap cost (guidance sentence went 2→3 lines at 338px usable width). Do not propose 52px. | User selection of the A-lite option (24px half indent), 2026-07-23, against the phone-width mockup |
| 2 | **Per-kind layout, not indent-for-both.** Attention alert banners keep full stack width — their card-with-attached-banner full-width shape is the ratified published-show-alerts §5.4 mock (DEFERRED.md:13 records this constraint; banner markup at `components/admin/review/AttentionBanner.tsx:222-248`). The published-show-alerts spec is NOT amended. | DEFERRED.md:13 + user selection of A-lite (banners-full-width variant) |
| 3 | Condensed under-row cards move only the **catalog** guidance into the `?` popover. **Instance** (autocorrect-composed) guidance lines stay inline: they are per-warning unique — not the duplicated generic copy the finding names — and the staged-parity contract pins "copy is universal: the instance line does not depend on surface" (`tests/admin/stagedCrewWarn.parity.test.tsx:13`). Moving instance text into the popover would also route plain text through `renderEmphasis` (`components/admin/compactAlertHelp.tsx:80`), violating the §4.4 plain-text rule (`components/admin/PerShowActionableWarnings.tsx:227`). | This spec; parity test cite; warning-card-identity-placement §4.4 |
| 4 | **No catalog or §12.4 edits.** `WARNING_CARD_COPY_CODES` and `EXPECTED_TRIGGER_CONTEXT` (`tests/messages/warningCardCopyRegistry.ts:4` and `tests/messages/warningCardCopyRegistry.ts:46`) pin catalog STRINGS byte-for-byte; this change moves render location only and touches no authored copy. The three-lockstep rule (AGENTS.md §12.4) is not triggered. | Registry read 2026-07-23; `tests/messages/_metaWarningCardCopy.test.ts:79` pins bytes, not placement |
| 5 | The group/fallback card and the staged `StagedReviewCard` surface keep **full copy** — condensed rendering is exclusive to under-row placement in the published modal. | Finding text (DEFERRED.md:19: "under a member's row the who/where is already carried by placement") |
| 6 | The spacing asymmetry half of INDENT-1 (hosting `<li>` `pt-1 pb-2`, `components/admin/wizard/step3ReviewSections.tsx:1671`) already shipped and is unchanged here. | DEFERRED.md:13 "Fixed in the branch" |
| 7 | The "N more" disclosure summary row keeps full stack width (it is stack chrome, not a warning card). Hidden warning cards inside the open disclosure carry the same 24px indent as visible ones. | This spec §2 |

## §2 Indent binding (INDENT-1)

### Mechanism

`renderCrewUnderRowCards` (`components/admin/showpage/sectionWarningExtras.tsx:26`) wraps **each** warning-card node in an indent wrapper:

```tsx
out.set(
  key,
  items.map((it, i) => (
    <div key={`crew-warn-${key}-${i}`} className="pl-6">
      <PerShowActionableWarnings ... />
    </div>
  )),
);
```

- `pl-6` = 24px (Tailwind spacing scale, 6 × 4px). Chosen over `pl-13` (52px = avatar `size-10` 40px + `gap-3` 12px, `components/atoms/Avatar.tsx:79` + `components/admin/wizard/step3ReviewSections.tsx:1672`) per Resolved Decision 1.
- The `key` moves from `PerShowActionableWarnings` to the wrapper `div` (outermost element of the node).
- One wrapper **per node**, not one wrapper around all nodes: the host stack caps at 2 VISIBLE CARDS with per-node granularity (`components/admin/showpage/sectionWarningExtras.tsx:42-44`; `CrewUnderRowStack` CAP at `components/admin/wizard/step3ReviewSections.tsx:1481`). A single wrapper would collapse the cap and the "N more" count to wrapper granularity (the exact regression the whole-diff HIGH caught when the nodes were first built).
- `AttentionBanner` nodes and the `CrewUnderRowStack` container are untouched — banners keep full width (Resolved Decision 2), and the stack keeps `mt-2 flex w-full flex-col items-stretch gap-2` (`components/admin/wizard/step3ReviewSections.tsx:1487`).

### Dimensional invariants

Parent: `[data-testid="crew-warn-stack-<key>"]` (w-full, items-stretch — Tailwind v4 does not default `align-items: stretch`; the existing class list already carries `items-stretch`).

Every parent→child hop in both subtrees is stated (R1-F5 — a mid-chain regression must not be maskable by end-to-end passes):

Visible subtree — stack → wrapper → `<ul>` → `<li>` → card:

| Relationship | Guarantee |
|---|---|
| indent wrapper width == stack width | wrapper is a block-level flex child of an `items-stretch` column (`components/admin/wizard/step3ReviewSections.tsx:1487`) |
| card `<ul>` width == wrapper width − 24px | `pl-6` on the wrapper; the `<ul>` is a block-level child filling the wrapper's content box (`components/admin/PerShowActionableWarnings.tsx:107`) |
| card `<li>` width == `<ul>` width | `<li>` is a flex child of the `<ul>`'s `flex flex-col` — cross-axis behavior identical to today's full-width cards (same element, same classes) |
| banner width == stack width | banner node has no wrapper (per-kind rule) |

Disclosure subtree — stack → `<details>` → summary / body `<div>` → wrapper → card:

| Relationship | Guarantee |
|---|---|
| `<details>` width == stack width | `<details>` is a flex child of the `items-stretch` stack (`components/admin/wizard/step3ReviewSections.tsx:1491-1493`) |
| "N more" summary width == `<details>` width | summary is a block-level flex child of the `<details>`' `flex flex-col items-stretch` (`components/admin/wizard/step3ReviewSections.tsx:1493` and `components/admin/wizard/step3ReviewSections.tsx:1498`) |
| disclosure body `<div>` width == `<details>` width | same `items-stretch` parent (`components/admin/wizard/step3ReviewSections.tsx:1505`) |
| hidden indent wrapper width == disclosure body width | wrapper is a block-level flex child of the body's `items-stretch` column (`components/admin/wizard/step3ReviewSections.tsx:1505`) |
| hidden card `<ul>` width == hidden wrapper width − 24px | same `pl-6` wrapper as visible nodes (Resolved Decision 7) |

Real-browser assertions land in the plan's layout task (jsdom computes no layout) and cover BOTH subtrees hop by hop, not only the end-to-end card-vs-stack delta.

### Guard conditions

- `items.length === 0` for a key: unchanged — the key is skipped (`sectionWarningExtras.tsx:41`), no empty wrapper renders.
- A member with banners only (no warnings): stack renders banners full width; no wrapper appears.
- A member with warnings only: all nodes indented; the stack itself still spans full width (invariant above), so the asymmetric-spacing binding (`pt-1 pb-2` host) is unchanged.

## §3 Condensed under-row copy (COPY-CONDENSE-1)

### Surface split

`PerShowActionableWarnings` gains one optional prop:

```ts
/** Under-row placement (published modal §5 only): the catalog guidance line moves
 *  into the `?` popover; instance (autocorrect) guidance stays inline. Group,
 *  fallback, and staged surfaces omit this and render full copy unchanged. */
condensed?: boolean;
```

Callers:

- `renderCrewUnderRowCards` (`sectionWarningExtras.tsx:48`) passes `condensed`.
- The group/fallback call site (`sectionWarningExtras.tsx:212`), the ignored list (`sectionWarningExtras.tsx:276`), and `StagedReviewCard` pass nothing — byte-identical renders (Resolved Decision 5).

### Rendering rules (condensed)

Baseline (full) behavior for reference — `components/admin/PerShowActionableWarnings.tsx:114-148`: title; inline guidance = instance text (plain) else catalog `helpfulContext` markup; popover body = `triggerContext ?? followUp`; `afterBodyText` = `followUp` when `triggerContext` present.

Condensed changes exactly two things. Define `movedGuidance` = the catalog markup that full mode would have rendered inline — i.e. `resolveGuidance(entry, w).kind === "catalog" ? markup : null` (`PerShowActionableWarnings.tsx:58-65`). For instance-kind warnings `movedGuidance` is null BY DEFINITION (the instance line short-circuits and the catalog `helpfulContext` was already unreachable in full mode; R1-F1) — condensed relocates exactly what full mode showed inline, never more.

1. **Inline guidance:** rendered only when `resolveGuidance` returns `kind: "instance"` (`PerShowActionableWarnings.tsx:58-65`). Catalog markup (`kind: "catalog"`) does NOT render inline.
2. **Popover composition** (with `context` = `triggerContext`, `followUp` as today — all normalized to `string | null` by `warningCardCopyFields` / the `followUp` ternary):

   - `popoverBody` = the non-null members of `[movedGuidance, context]` joined with a single space (both are complete sentences from the §4.2 table); when both are null, `followUp`; when that is also null, `null` (no trigger).
   - `afterBodyText` = `followUp` when `movedGuidance ?? context` is non-null, else `null` — the SAME slot `followUp` occupies in full mode.

   The moved guidance goes into the popover BODY, never into `afterBodyText`: `HoverHelp` keeps only the primary body in the `aria-describedby` run and renders `afterBodyText` as supplementary content outside it (`components/admin/HoverHelp.tsx:481-498`, `components/admin/HoverHelp.tsx:580-581`; pinned by `tests/components/admin/perShowActionableFollowUp.test.tsx:41-53`). With the join, the condensed accessible description is a superset of full mode's (`movedGuidance + " " + context` vs `context`); parking `context` in `afterBodyText` would instead DROP it from the description (R1-F2).

   `movedGuidance` is always the CATALOG value, never instance text — instance text stays inline (Resolved Decision 3), so nothing plain ever enters `renderEmphasis` via `buildHelpPopoverBody` (`compactAlertHelp.tsx:80`) or the `afterBodyText` hop (`compactAlertHelp.tsx:139-140`).

### Popover guard table (condensed; total over each input's domain)

`movedGuidance` (g), `context` (c), `followUp` (f) each ∈ {present, absent} — 8 rows:

| g | c | f | popoverBody | afterBodyText | `?` renders |
|---|---|---|---|---|---|
| ✓ | ✓ | ✓ | g + " " + c | f | yes |
| ✓ | ✓ | — | g + " " + c | null | yes |
| ✓ | — | ✓ | g | f | yes |
| ✓ | — | — | g | null | yes |
| — | ✓ | ✓ | c | f | yes (== full mode) |
| — | ✓ | — | c | null | yes (== full mode) |
| — | — | ✓ | f | null | yes (== full mode) |
| — | — | — | null | null | no trigger (`PerShowActionableWarnings.tsx:241`) |

Today's under-row call site passes no `followUpCopy` (`sectionWarningExtras.tsx:47-64` constructs the element without it), so the f column is exercised only if a future caller combines `condensed` with `followUpCopy` — the table makes that composition defined rather than emergent, and f keeps its full-mode slot (`afterBodyText`) in every row where it is not the sole content.

Instance-kind warnings always land in rows 5-8 (g null by definition), so their condensed popover is byte-identical to full mode — consistent with the staged-parity contract (Resolved Decision 3). The accessible description never loses content relative to full mode in any row: rows 1-4 are supersets, rows 5-8 are identical.

### Mode boundaries

| Surface | Variant | Elements |
|---|---|---|
| Under-row card (published modal crew section) | condensed | title; instance guidance if any; `?` popover per table above; detail band; controls band |
| Section group / fallback card (published) | full | unchanged (title; inline guidance; popover = context, after = followUp) |
| Ignored list (published) | full, `tone="muted"` | unchanged |
| StagedReviewCard | full | unchanged (no `renderItemControls`, no `followUpCopy` — as today) |

### Guard conditions

- All four copy fields absent (defensive producer): condensed card = title + detail/controls bands only, no `?` — same as full mode today (row 8).
- **`condensed` truthiness (R1-F6):** rendering switches on `condensed === true`. `condensed={false}` and omission are IDENTICAL (full mode); the prop type is `condensed?: boolean` and under `exactOptionalPropertyTypes` callers omit it rather than passing `undefined`. The test plan covers `false` explicitly.
- `condensed` + `tone="muted"`: not a shipped combination (ignored list is never under-row); rendering is still defined — the two props are orthogonal (tone touches skin classes only: `components/admin/PerShowActionableWarnings.tsx:102-105`, `components/admin/PerShowActionableWarnings.tsx:225`, `components/admin/PerShowActionableWarnings.tsx:233`).
- Empty `items`: unchanged early return (`PerShowActionableWarnings.tsx:94`).

## §4 Cap fixture (CAP-FIXTURE-1)

### Harness

`tests/e2e/_publishedReviewModalHarness.tsx`:

- `HarnessStateOverrides` (`tests/e2e/_publishedReviewModalHarness.tsx:242`) gains `withCappedCrewWarnings?: boolean`.
- New fixture builder: 3 warnings whose raw `blockRef.name` all strip to the rendered "Crew Member A" roster row, following the existing fixture pattern (`crewWarningFixtures()`, `tests/e2e/_publishedReviewModalHarness.tsx:258` — raw name `"Crew Member A (5/3 ONLY)"`). Three FIELD_UNREADABLE warnings (phone / email / distinct third cell) with **distinct `blockRef.index` values and, where anchored, distinct resolved A1 cells** — the keys the LIVE data boundary actually deduplicates on: `operatorActionableWarnings` dedups by (code, resolved A1) and folds `blockRef.index` into the key for FIELD_UNREADABLE only (`lib/parser/dataGaps.ts:409-435`). `message`/`rawSnippet` never participate in dedup (R1-F4). The harness path (`buildSectionWarningModel`) performs no dedup of its own, so key-distinctness here is LIVE-fidelity (the same three warnings would survive the real boundary), not a harness-survival trick. The unmatched "Ghost Crew" warning is retained so the capped page also keeps the fallback-group state visible.
- **Mixed-stack coverage (R1-F3):** the capped page ALSO seeds ONE crew-keyed attention item for the same member (via the existing `attentionItems` override, `tests/e2e/_publishedReviewModalHarness.tsx:247`, item shape per `harnessAttentionItems`, `tests/e2e/_publishedReviewModalHarness.tsx:56-80`, with `crewKey: "crew member a"` and a crew-routed section). Production merges banners FIRST, then warning nodes (`components/admin/review/ShowReviewSurface.tsx:161-168`), and the host slices the MERGED list at 2 (`components/admin/wizard/step3ReviewSections.tsx:1481-1483`) — so banners consume cap slots, and the page renders the composition the per-kind rule ratifies: visible = [full-width banner, indented warning #1]; hidden = [warning #2, warning #3] behind "2 more". The plain 3-warnings-no-banner cap state (2 visible warnings + "1 more") is covered as a jsdom unit case (node granularity), not a second harness page.
- New JSON page in the CLI entry (`tests/e2e/_publishedReviewModalHarness.tsx:361-380`): `crewWarningsCapped: renderModalHtml(HARNESS_ALERT_COUNT, { withCappedCrewWarnings: true })` where the override also injects the crew-keyed attention item.
- Layout spec (`tests/e2e/published-review-modal.layout.spec.ts:124-135`) writes a crewwarningscapped page alongside the existing generated pages.

### Assertions (new layout test block)

At 1280 and 390 (both viewports; the cap state has never been LOOKED at — the point of the finding):

- Stack for "crew member a" contains exactly **2** visible cap slots: one attention banner and one warning card; the remaining two warnings are inside a closed `details` (`crew-warn-more-<key>`, `step3ReviewSections.tsx:1492`) whose summary text is "2 more".
- Per-kind widths in ONE stack: banner width == stack width; visible warning card width == stack width − 24px (within 0.5px) — the ratified mixed composition, measured.
- Summary tap target ≥ 44px (`min-h-tap-min`, `components/admin/wizard/step3ReviewSections.tsx:1498`).
- Full §2 hop-by-hop chain for both subtrees (visible + disclosure).
- Native `<details>` open state (no JS needed in the static harness): after `summary.click()`, both hidden cards are visible and carry the same indent.

Visual pass: the capped page joins the impeccable critique/audit screenshot set for this branch (invariant 8) — that is the "actually LOOK at it" close of the finding.

## §5 Transition inventory

No new visual states are introduced; the condensed/full split is static per surface, and the indent is static geometry.

| Pair | Treatment |
|---|---|
| details closed ↔ open ("N more") | existing: chevron `transition-transform group-open:rotate-90` only; body instant (`step3ReviewSections.tsx:1500-1505`) — unchanged |
| card active ↔ ignored (list move) | existing surfaces, unchanged (cards re-render between lists; instant) |
| matched ↔ fallback placement (data transition) | existing behavior pinned by `crewWarningAttachment.test.tsx:238` — a moved card changes variant (condensed ↔ full) with the move; instant, no animation (it is a list-to-list remount) |

Compound: opening "N more" while a sibling card's Report modal is open — unaffected (disclosure is native, no AnimatePresence in this tree).

## §6 Test plan (summary — plan expands per TDD)

1. Unit (jsdom): condensed rendering rules — catalog guidance absent inline, popover body/after per the 8-row table (assert against `data-testid="per-show-actionable-guidance"` absence + the described element's text content via the `perShowActionableFollowUp` seams — the accessible description must CONTAIN the moved guidance and the trigger context, per §3's superset claim); instance line still inline when autocorrect present; `condensed={false}` identical to omission (R1-F6); full-mode surfaces byte-unchanged (targeted queries on the group call site).
2. Unit: `renderCrewUnderRowCards` node shape — each node's outermost element carries `pl-6`; node count == warning count (cap granularity preserved). Plain cap state at node granularity: 3 warning nodes, no banner → visible slice 2, "1 more" (the no-banner counterpart of §4's harness page).
3. Real-browser layout: §2 hop-by-hop invariants (both subtrees) + §4 mixed-stack assertions (extends `published-review-modal.layout.spec.ts`).
4. Existing suites expected to hold without edits: containment T5 block (tolerates indent — `stack.x >= card.x − TOL`), conservation tests, parity tests (instance line untouched).

Anti-tautology: expected widths derive from measured stack width minus the 24px constant, never hardcoded card widths; the condensed-popover test asserts the POPOVER receives the catalog string while the CARD body does not contain it (clone tree, strip popover, then query).

## §7 Out of scope

- `CREWWARN-INCARD-MOBILE-EYEBROW-1` (BulkIgnoreControls) — separate trigger, untouched.
- Any published-show-alerts §5.4 banner change (Resolved Decision 2).
- Catalog copy edits (Resolved Decision 4).
- `CrewUnderRowStack` container class changes — none needed.

## §8 Close-out bookkeeping

On merge: move the three DEFERRED.md entries to DEFERRED-archive.md with resolution notes (per DEFERRED.md header contract), update the "Last reconciled" line, and record impeccable dual-gate findings + dispositions in the milestone handoff/close-out notes for this branch.
