# Spec — Group active Data-quality warnings by code (DQIGNORE-6)

**Date:** 2026-07-17
**Slug:** `dq-group-active-by-code`
**Deferred item resolved:** DQIGNORE-6 (`DEFERRED.md:217`) — P1 impeccable critique, deferred as a card-list restructure disproportionate to a P3-tier convenience feature; now triggered by an explicit "next Data-quality panel touch."
**Blast radius:** UI-only. No DB, no migrations, no advisory locks, no new mutation surface, no `§12.4` catalog rows.
**Routing:** UI → Opus + impeccable v3 (invariant 8 dual-gate applies).

---

## 1. Problem

On the per-show admin page (`app/admin/show/[slug]/page.tsx:927-963`) the bulk "Ignore all N" control (`components/admin/BulkIgnoreControls.tsx`) renders as a stack of buttons ABOVE the active warning-card list (`PerShowActionableWarnings`, `:937-963`). The cards a given button ignores are interleaved by code lower in the list, and the cards themselves do not repeat the code's type label. On a ~390px phone the operator (Doug) can arm + confirm "Ignore all 2 · Unrecognized row in sheet" without ever scrolling to the two cards it covers — a scope-legibility gap. The action is reversible (ignored warnings drop into the collapsible "Ignored (N)" subsection with Un-ignore), so this is a legibility fix, not a data-loss fix.

## 2. Solution (approved design — option C)

Render the **active** warning list as ordered **per-code groups**. Each group is:

1. **Eyebrow row** — a horizontal row: an uppercase, letter-spaced, plain-language **type label** (the same label source used today for the bulk button: catalog title via `messageFor`, else `DATA_GAP_CLASS_LABELS[code]`, else nothing — NEVER the raw §12.4 code, invariant 5) + a thin hairline rule filling the remaining width. For a **bulk-eligible** code (a code with ≥2 distinct-content active ignorable warnings, per `groupIgnorableByCode`), a right-aligned **"Ignore all N"** chip sits on that same row.
2. **Cards** — that code's active warning cards, rendered by the existing `PerShowActionableWarnings` markup + `renderItemControls` slot, visually unchanged (amber card skin, Report / Ignore / Use-raw / Recognize-role controls).
3. **Per-group notice** — the bulk action's partial-failure message renders BELOW that group's cards, bound to the group whose chip was tapped.

**Ordering (preserved from today):** groups appear in the order their codes first appear in the existing active list, which is digest-first (`UNKNOWN_SECTION_HEADER`, `BLOCK_DISAPPEARED`) then operator-actionable (`displayWarnings = [...dataQuality.digest, ...actionableItems]`, `page.tsx:432`). Within a group, warnings keep their existing stable order. No re-sort is introduced.

**Every active code gets an eyebrow** — including singletons and the non-ignorable `BLOCK_DISAPPEARED` (Report-only). Bulk-eligible codes additionally get the chip.

**Out of scope:** the collapsed **"Ignored (N)"** subsection (`page.tsx:966-1011`) stays flat/ungrouped — low-traffic, collapsed by default, no bulk affordance. The `/data-quality/ignore` route, `bulkIgnoreGroups` grouping semantics, the two-tap destructive recipe, and the ignore/un-ignore telemetry (DQIGNORE-4) are all unchanged.

## 3. Behavior preserved (no functional change)

All of the following move verbatim from the current `BulkIgnoreControls` into the widened component:

- **Two-tap arm → confirm** per chip: first tap arms (destructive recipe fill `ARMED_BTN`, `bg-warning-text` / `text-warning-bg`, spec `2026-07-16-destructive-confirm-pass` §4 G4), second tap fires `ignoreGroup`. 4s auto-revert (`ARM_REVERT_MS`).
- **Single-armed-across-panel invariant** (spec §4 G4): exactly one chip armed at a time via one shared `armedCode` + one shared timer; arming a different group re-arms it and silently reverts the previous. Entering `running` or `error` clears `armedCode`. This is why ALL chips must be owned by ONE client component (see §5).
- **Bulk POST fan-out:** one precise per-fingerprint `POST /api/admin/show/{slug}/data-quality/ignore` per distinct item; full success → reset to `idle` then `router.refresh()`; partial success → honest `Ignored X of N. Refresh to see the rest.` notice, no auto-refresh; total failure → `Couldn't ignore those warnings…`.
- **a11y:** `aria-busy` on the running chip; a persistent per-chip `role="status"` sr-only region announcing "Tap again to confirm." on arm; the armed count-span keeps `font-normal` (drops `text-text-subtle`) so it inherits the fill's `text-warning-bg`.
- **Disabled-while-running:** any chip `running` disables all chips (`state.kind === "running"`), and the idle-reset-before-refresh fix (DQIGNORE audit P1) that prevents sibling chips wedging disabled after a refresh.

## 4. Guard conditions (per prop / per state)

| Input / state | Behavior |
|---|---|
| `groups` empty (no active warnings) | Component renders `null`; the page's existing `activeActionable.length > 0 \|\| ignoredActionable.length > 0` gate (`page.tsx:891`) already governs whether the panel section renders at all. |
| A group with `label === null` (code is neither a catalog code nor a data-gap code) | Eyebrow renders WITHOUT a label text — just the hairline rule (never the raw code). The chip (if bulk-eligible) still renders "Ignore all N" with no `· label` suffix, matching today's `group.label ? … : null` behavior. |
| A group that is NOT bulk-eligible (`bulk === null`) | Eyebrow row renders label + rule only, no chip. Its cards render normally. Never armed/running (no chip to arm). |
| A single active warning under a code | Still gets its own eyebrow group (one card). No chip unless ≥2 distinct contents. |
| `BLOCK_DISAPPEARED` (no fingerprint → never ignorable) | Its own eyebrow group ("Removed block" label); cards are Report-only; never bulk-eligible. |
| Partial failure while another group is also present | Only the acting group shows its notice; sibling groups unaffected. `state` keys the notice by `code`. |
| All groups collapse to one code | Single eyebrow group + chip — degrades to essentially today's single-dominant-code case, now with an explicit type header. |

## 5. Architecture

**One client component owns the entire active grouped list + all shared client state.** Keeping the file name `components/admin/BulkIgnoreControls.tsx` (its exported role widens from "the stacked bulk buttons" to "the grouped active list with inline bulk headers") is a deliberate low-blast-radius choice: it preserves the destructive-confirm meta-registry row (`tests/styles/_metaDestructiveConfirm.test.ts:60`, index 0) and the spec `2026-07-16-destructive-confirm-pass` §4 G4 file citation without cross-spec churn. A top-of-file doc comment records the widened role. **Do not relitigate the name** — the naming tradeoff is settled in favor of registry/citation stability (§8).

### 5.1 Data boundary (server — `page.tsx`)

The page builds an ordered `ActiveWarningGroup[]` from `activeActionable`:

```ts
type ActiveWarningGroup = {
  code: string;
  label: string | null;              // reuse existing bulkGroupLabel(code): title | data-gap label | null
  bulk: BulkIgnoreGroupWithLabel | null; // present iff this code is in groupIgnorableByCode(activeActionable)
  cards: ReactNode;                  // pre-rendered <PerShowActionableWarnings items={groupItems} .../> for this code
};
```

- Grouping: a new pure helper `groupActiveByCode(activeActionable)` (in `lib/dataQuality/…`) partitions the already-ordered active list into per-code groups **preserving first-appearance order** (Map insertion order over the ordered input). It returns `{ code, items }[]`. This is distinct from `groupIgnorableByCode` (which keeps only bulk-eligible codes and dedupes to distinct contents); the two are joined at the page: a group is bulk-eligible iff its `code` matches a `groupIgnorableByCode` result.
- `label` reuses the existing `bulkGroupLabel` closure (`page.tsx:459-466`) — lifted to a citable helper if cleaner, else inlined.
- `cards` is a **pre-rendered server node** (`<PerShowActionableWarnings items={group.items} driveFileId=… renderItemControls=…/>`), passed as a slot prop into the client component. This is the supported RSC pattern (server components as props/children of a client component); the `renderItemControls` closure and its server-boundary controls (`DataQualityWarningControls`, `UseRawControlBoundary`, `RoleRecognizeControlBoundary`) render on the server and pass through untouched. No inline closure crosses the client boundary (memory: RSC server-action boundary — direct refs, never inline client closures).

### 5.2 Client component (`BulkIgnoreControls.tsx`, widened)

Props: `{ slug: string; groups: ActiveWarningGroup[] }`.

Owns the SAME client state as today — `state: idle | running{code} | error{code, copy}`, `armedCode: string | null`, one shared `armTimerRef`. Renders, for each group, a `<div>` wrapper containing: eyebrow row (label + rule + optional chip) → `{group.cards}` → optional per-group `error` notice. `null` when `groups` is empty. The chip's onClick/guard/`ignoreGroup` logic is byte-for-byte the current logic, keyed by `group.code` (already the key today), operating on `group.bulk` (the `BulkIgnoreGroupWithLabel` carrying `items`).

### 5.3 Dimensional invariants

The eyebrow row is a `flex items-center` row with a `flex-1` hairline rule and an intrinsic-width chip; there is **no fixed-height/width parent constraining flex/grid children to a computed dimension**. Therefore **no mandatory real-browser layout-dimensions task** (per the writing-plans rule, that task is required only for fixed-dimension parents). The plan states this N/A explicitly rather than silently omitting it. (The card interiors are unchanged from the already-gated `PerShowActionableWarnings`.)

### 5.4 Transition inventory

No NEW visual-state transitions are introduced. The chip's state set (idle ↔ armed ↔ running → error) and its treatments are exactly those ratified in `2026-07-16-destructive-confirm-pass` §4 (G4) and pinned by that milestone's per-guard jsdom tests; this change only relocates the chip from a top stack into a group header and preserves every class/transition. The eyebrow label + hairline rule are static (no state). The plan's transition-audit task asserts the relocated chip retains the arm/run/error morphs and the shared-armed re-arm behavior, and that the new eyebrow/rule elements are deliberately static.

## 6. Test plan & blast radius

**Affected existing tests (≈8 files):**
- `tests/components/admin/bulkIgnoreControls.test.tsx` — rewritten for the grouped render + inline chip + per-group error placement; the G4 two-tap / single-armed / running / partial-failure assertions are preserved (relocated).
- `tests/app/admin/perShowPage.test.tsx` — active-section structure assertions updated for grouped eyebrows.
- `tests/admin/perShowActionableKeyStability.test.tsx`, `tests/admin/perShowActionableRenderControls.test.tsx`, `tests/admin/perShowDataQualityActionable.test.tsx` — adapt to per-group `<ul>` scoping (active cards now render one `PerShowActionableWarnings` per group; queries scope per group or use `getAllByTestId`). The ignored-subsection assertions are unchanged (still one flat list).
- `tests/dataQuality/bulkIgnoreGroups.test.ts` — unchanged (grouping semantics untouched); a sibling `groupActiveByCode` test file is added.
- `tests/styles/_metaDestructiveConfirm.test.ts` — the `BulkIgnoreControls.tsx` index-0 morph row stays valid (armed recipe class unchanged, same file). Re-run after editing the scanned file (structural meta-tests are comment/line fragile).
- `tests/parser/parseWarningDeepLinkRender.test.tsx` — verify still green (renders `PerShowActionableWarnings`; unaffected by grouping wrapper).

**New tests:**
- `groupActiveByCode` unit test: first-appearance order preserved; digest-first order; singletons get their own group; distinct codes never merged; empty input → empty.
- Grouped-render test (pins DQIGNORE-6): every active code renders an eyebrow with its plain-language label (never the raw code); a bulk-eligible code's eyebrow carries the "Ignore all N" chip and its N matches the group's distinct-content count; a singleton/non-ignorable code's eyebrow has NO chip; the partial-failure notice renders inside the acting group (below its cards), not at panel top. Anti-tautology: assert the chip count against the fixture's distinct-content count (derived from fixture, not hardcoded), and scope the "raw code absent" assertion to the eyebrow subtree.

**Meta-test inventory (writing-plans mandate):**
- CREATES: none required. EXTENDS: none structurally — the destructive-confirm registry row is preserved (same file), not added. The grouped-render test is a plain render test, not a fails-by-default source-walker. No auth / DB-write / advisory-lock / admin-alert / tile-sentinel surface is touched, so no registry meta-test applies. Declared explicitly per the mandate.

**Advisory-lock topology:** N/A — no `pg_advisory*` code touched.

## 7. Invariant compliance

- **Inv. 1 (TDD):** every task test-first.
- **Inv. 5 (no raw codes in UI):** eyebrow label is the plain-language type via `messageFor` / `DATA_GAP_CLASS_LABELS`, `null` when neither — never the raw code. Grouped-render test asserts the raw code string is absent from the eyebrow.
- **Inv. 8 (impeccable dual-gate):** UI surface touched (`app/admin/show/[slug]/page.tsx`, `components/admin/BulkIgnoreControls.tsx`). `/impeccable critique` + `/impeccable audit` run on the diff before the whole-diff cross-model review; P0/P1 fixed or deferred via `DEFERRED.md`.
- **Inv. 10 (mutation-surface telemetry):** no new mutation surface — the ignore POST route (already `AUDITABLE_MUTATIONS`, DQIGNORE-4 `WARNING_IGNORED`) is unchanged; the client component only calls that existing route. No registry change.
- **Inv. 9 (Supabase call-boundary):** no new Supabase call site (client `fetch` to the existing route only).

## 8. Do-not-relitigate preempts (for the reviewer)

- **Component name `BulkIgnoreControls` widening to own the grouped list** — deliberate (§5); the alternative (rename → new file `GroupedActiveWarnings`) forces a `_metaDestructiveConfirm` registry-row swap AND a `2026-07-16-destructive-confirm-pass` §4 G4 file-citation edit for zero functional gain. Registry/citation stability wins. Not a finding.
- **Ignored (N) subsection stays flat** — explicit scope decision (§2); it is collapsed, low-traffic, and has no bulk affordance to group. Not a finding.
- **No real-browser layout-dimensions task** — no fixed-dimension parent (§5.3). Correctly N/A, stated not omitted.
- **Multiple `per-show-actionable-warnings` `<ul>`s in the active area** (one per group) — intended consequence of per-group rendering; the ignored area keeps a single flat list. Tests scope per group. Not a regression.
- **No new destructive-confirm behavior** — the two-tap recipe, single-armed invariant, and auto-revert are relocated verbatim from the ratified §4 G4, not redesigned. Not a finding.
