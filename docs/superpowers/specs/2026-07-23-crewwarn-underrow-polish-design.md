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

| Relationship | Guarantee |
|---|---|
| indent wrapper width == stack width | wrapper is a block-level flex child of an `items-stretch` column |
| warning card width == stack width − 24px | `pl-6` on the wrapper; card fills the wrapper (block `<ul>` at `components/admin/PerShowActionableWarnings.tsx:107`) |
| banner width == stack width | banner node has no wrapper (per-kind rule) |
| "N more" summary width == stack width | summary is stack chrome, unwrapped (`components/admin/wizard/step3ReviewSections.tsx:1498`) |
| hidden (disclosed) warning card width == stack width − 24px | hidden nodes carry the same wrapper; disclosure body is `items-stretch` (`components/admin/wizard/step3ReviewSections.tsx:1505`) |

Real-browser assertions land in the plan's layout task (jsdom computes no layout).

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

Condensed changes exactly two things:

1. **Inline guidance:** rendered only when `resolveGuidance` returns `kind: "instance"` (`PerShowActionableWarnings.tsx:58-65`). Catalog markup (`kind: "catalog"`) does NOT render inline.
2. **Popover composition** becomes (with `guidance` = the catalog `helpfulContext` markup, `context` = `triggerContext`, `followUp` as today — all already normalized to `string | null` by `warningCardCopyFields` / the `followUp` ternary):

   - `popoverBody = guidance ?? context ?? followUp`
   - `afterBodyText = joined remainder`: the non-null members of `[context, followUp]` when `guidance !== null`, else `followUp` when `context !== null`, else `null`. Two survivors join with a single space into one paragraph (both are complete sentences from the §4.2 table).

   Note `guidance` here is always the CATALOG value (`warningCardCopyFields(entry).guidance`), never instance text — instance text stays inline (Resolved Decision 3), so nothing plain ever enters `renderEmphasis` via `buildHelpPopoverBody` (`compactAlertHelp.tsx:80`) or the `afterBodyText` hop (`compactAlertHelp.tsx:139-140`).

### Popover guard table (condensed; total over each input's domain)

`guidance` (catalog), `context`, `followUp` each ∈ {present, absent} — 8 rows:

| guidance | context | followUp | popoverBody | afterBodyText | `?` renders |
|---|---|---|---|---|---|
| ✓ | ✓ | ✓ | guidance | context + " " + followUp | yes |
| ✓ | ✓ | — | guidance | context | yes |
| ✓ | — | ✓ | guidance | followUp | yes |
| ✓ | — | — | guidance | null | yes |
| — | ✓ | ✓ | context | followUp | yes (== full mode) |
| — | ✓ | — | context | null | yes (== full mode) |
| — | — | ✓ | followUp | null | yes (== full mode) |
| — | — | — | null | null | no trigger (`PerShowActionableWarnings.tsx:241`) |

Today's under-row call site passes no `followUpCopy` (`sectionWarningExtras.tsx:47-64` constructs the element without it), so the followUp column is exercised only if a future caller combines `condensed` with `followUpCopy` — the table makes that composition defined rather than emergent.

Instance-guidance interplay: `resolveGuidance` returns `instance` XOR `catalog` (`PerShowActionableWarnings.tsx:58-65` — instance short-circuits). When instance guidance exists, the catalog `helpfulContext` is ALREADY unreachable in full mode; condensed mode is identical there (inline instance line; popover = context chain). No information is lost relative to full mode in any row.

### Mode boundaries

| Surface | Variant | Elements |
|---|---|---|
| Under-row card (published modal crew section) | condensed | title; instance guidance if any; `?` popover per table above; detail band; controls band |
| Section group / fallback card (published) | full | unchanged (title; inline guidance; popover = context, after = followUp) |
| Ignored list (published) | full, `tone="muted"` | unchanged |
| StagedReviewCard | full | unchanged (no `renderItemControls`, no `followUpCopy` — as today) |

### Guard conditions

- All four copy fields absent (defensive producer): condensed card = title + detail/controls bands only, no `?` — same as full mode today (row 8).
- `condensed` + `tone="muted"`: not a shipped combination (ignored list is never under-row); rendering is still defined — the two props are orthogonal (tone touches skin classes only: `components/admin/PerShowActionableWarnings.tsx:102-105`, `components/admin/PerShowActionableWarnings.tsx:225`, `components/admin/PerShowActionableWarnings.tsx:233`).
- Empty `items`: unchanged early return (`PerShowActionableWarnings.tsx:94`).

## §4 Cap fixture (CAP-FIXTURE-1)

### Harness

`tests/e2e/_publishedReviewModalHarness.tsx`:

- `HarnessStateOverrides` (`tests/e2e/_publishedReviewModalHarness.tsx:242`) gains `withCappedCrewWarnings?: boolean`.
- New fixture builder: 3 warnings whose raw `blockRef.name` all strip to the rendered "Crew Member A" roster row, following the existing fixture pattern (`crewWarningFixtures()`, `tests/e2e/_publishedReviewModalHarness.tsx:258` — raw name `"Crew Member A (5/3 ONLY)"`). Three distinct FIELD_UNREADABLE warnings (phone / email / distinct third cell) with distinct `message` + `rawSnippet` values so warning-identity dedup keeps all three. The unmatched "Ghost Crew" warning is retained so the capped page also keeps the fallback-group state visible.
- New JSON page in the CLI entry (`tests/e2e/_publishedReviewModalHarness.tsx:361-380`): `crewWarningsCapped: renderModalHtml(HARNESS_ALERT_COUNT, { withCappedCrewWarnings: true })`.
- Layout spec (`tests/e2e/published-review-modal.layout.spec.ts:124-135`) writes a crewwarningscapped page alongside the existing generated pages.

### Assertions (new layout test block)

At 1280 and 390 (both viewports; the cap state has never been LOOKED at — the point of the finding):

- Stack for "crew member a" contains exactly **2** visible warning cards; the third is inside a closed `details` (`crew-warn-more-<key>`, `step3ReviewSections.tsx:1492`) whose summary text is "1 more".
- Summary tap target ≥ 44px (`min-h-tap-min`, `components/admin/wizard/step3ReviewSections.tsx:1498`).
- Indent invariants from §2 hold for both visible cards (card width == stack width − 24px, within 0.5px).
- Native `<details>` open state (no JS needed in the static harness): after `summary.click()`, the third card is visible and carries the same indent.

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

1. Unit (jsdom): condensed rendering rules — catalog guidance absent inline, popover body/after per the 8-row table (assert against `data-testid="per-show-actionable-guidance"` absence + HoverHelp props via the existing test seams); instance line still inline when autocorrect present; full-mode surfaces byte-unchanged (snapshot or targeted queries on the group call site).
2. Unit: `renderCrewUnderRowCards` node shape — each node's outermost element carries `pl-6`; node count == warning count (cap granularity preserved).
3. Real-browser layout: §2 invariants + §4 assertions (extends `published-review-modal.layout.spec.ts`).
4. Existing suites expected to hold without edits: containment T5 block (tolerates indent — `stack.x >= card.x − TOL`), conservation tests, parity tests (instance line untouched).

Anti-tautology: expected widths derive from measured stack width minus the 24px constant, never hardcoded card widths; the condensed-popover test asserts the POPOVER receives the catalog string while the CARD body does not contain it (clone tree, strip popover, then query).

## §7 Out of scope

- `CREWWARN-INCARD-MOBILE-EYEBROW-1` (BulkIgnoreControls) — separate trigger, untouched.
- Any published-show-alerts §5.4 banner change (Resolved Decision 2).
- Catalog copy edits (Resolved Decision 4).
- `CrewUnderRowStack` container class changes — none needed.

## §8 Close-out bookkeeping

On merge: move the three DEFERRED.md entries to DEFERRED-archive.md with resolution notes (per DEFERRED.md header contract), update the "Last reconciled" line, and record impeccable dual-gate findings + dispositions in the milestone handoff/close-out notes for this branch.
