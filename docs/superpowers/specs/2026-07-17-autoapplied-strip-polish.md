# Auto-applied-strip polish batch — Design Spec

**Date:** 2026-07-17
**Branch:** `feat/autoapplied-strip-polish`
**Status:** Draft → self-review → Codex adversarial-review → APPROVE

## Purpose

Close four deferred polish items on the admin "Recently auto-applied" strip
(`components/admin/RecentAutoAppliedStrip.tsx`) plus the sibling in-flow
disclosure family. All four were dispositioned in `DEFERRED.md`; this batch
picks them up deliberately (user-ratified 2026-07-17). **UI-only — no DB, no
advisory-lock surface, no `§12.4` error-code catalog change.**

| ID | Prio | One line |
|----|------|----------|
| COLLAPSE-2 | P2 | Disclosure panels mount/unmount instantly; chevron animates but content does not. Introduce a shared height-morph primitive and converge the cited disclosure family. |
| COLLAPSE-1 | P2 | Collapsed group header hides the change kind; a destructive "Removed" is invisible until expand. Add a per-kind hint to the collapsed header. |
| REDESIGN-2 | P2 | A singleton group renders a bordered change-card inside the group card (card-in-card). Flatten the inner card chrome for the one-row case. |
| DESTRUCT-3 | P3 | All-success bulk undo gives screen-reader users no confirmation. Add an `sr-only role="status"`. |

### Out of scope (stay deferred, with cause)

- **AUTOAPPLIED-REDESIGN-1** (P3) — real-browser button-width distribution assertion. The half/full split is a CSS-grid `1fr` invariant, pinned in jsdom; a Playwright pixel harness is disproportionate. `BL-AUTOAPPLIED-CARD-LAYOUT-E2E`.
- **AUTOAPPLIED-REDESIGN-3** (P2) — naming the changed field in `field_changed` / `crew_email_changed` summaries requires the structured field before/after DB write-path arc explicitly excluded from the strip's read-only scope. `BL-AUTOAPPLIED-FIELD-STRUCTURED-DIFF`.
- **MOBILEPARITY-1/-2** — ratified/noted; unchanged here.
- **Overlay/popover disclosures** (`BellPanel`, `NotifBell`, `UserMenu`, `HelpSheet`, `HoverHelp`, `AppHealthIndicator`, `FinalizeButton`/`CleanupAbandonedFinalizeButton` confirms, `step3ReviewSections` sheets) are `position:absolute`/`fixed` overlays that render *over* content, not in-flow disclosures that push content down — a distinct pattern outside the COLLAPSE-2 deferral's cited family. Not converted.
- **`EventRow`** (`components/admin/telemetry/EventRow.tsx`) is a telemetry-console row-detail expander (`role="button"` div, `{open && …}` at `:116`), not one of the two in-flow section disclosures the COLLAPSE-2 deferral names (`IgnoredSheetsDisclosure`, `AddAdminDisclosure`). It is a valid future `CollapsePanel` adopter but is **not** in this batch's family. This is a deliberate scope boundary — see §7 do-not-relitigate.

---

## §1 — CollapsePanel primitive (COLLAPSE-2)

### 1.1 Mechanism

New client component `components/admin/CollapsePanel.tsx`. Canonical CSS-grid
height-morph: an always-mounted outer `grid` whose `grid-template-rows`
transitions `0fr → 1fr`, with an `overflow-hidden` inner wrapper. Content
**stays mounted in both states** (required — you cannot animate the height of
an element that unmounts).

```tsx
"use client";
import { type ReactNode } from "react";

export function CollapsePanel({
  open,
  id,
  children,
}: {
  open: boolean;
  // Stable DOM id — the trigger's aria-controls target. Always resolvable now
  // that the panel is always mounted (no more conditional idref).
  id: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      data-testid={`${id}-morph`}
      className={`grid transition-[grid-template-rows] duration-normal ease-out motion-reduce:transition-none ${
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      }`}
    >
      {/* overflow-hidden clips the content while the row track is 0fr; inert
          removes the collapsed subtree from BOTH the tab order and the AT tree
          (React 19 boolean `inert`), so collapsed form controls are never
          focusable or announced. */}
      <div className="overflow-hidden" inert={open ? undefined : true}>
        {children}
      </div>
    </div>
  );
}
```

**Reduced motion:** `--duration-normal` collapses to `0ms` under
`prefers-reduced-motion: reduce` (`app/globals.css:400-410`) so the token-based
transition is instant for free; the explicit `motion-reduce:transition-none`
is a belt-and-braces guarantee for the `grid-template-rows` property
specifically (the token collapse already zeroes it, but a `transition-none`
also removes the property from the transition list so no interpolation is
scheduled at all). DESIGN.md lists "accordion expand" at `duration-normal`
(`app/globals.css:403`), which this matches.

### 1.2 Guard conditions

- `open` toggles the row track and `inert`. No other state.
- `id` MUST be unique per rendered panel (consumers already namespace by
  `showId` / a literal); it is both the outer element id and the `-morph`
  testid stem.
- `children` empty → the morph wrapper renders an empty (height-0) box; benign.

### 1.3 Consumer conversions

Each consumer's trigger `<button>` changes `aria-controls={open ? ID : undefined}`
→ `aria-controls={ID}` (unconditional — the target now always exists). The
former conditionally-mounted panel body becomes `CollapsePanel`'s child, keeping
its own `role`/`aria-label`/`data-testid`.

**A. `RecentAutoAppliedStrip.tsx` `GroupSection`** (`:321-410`). Replace
`{open ? (<div id={panelId} …>…</div>) : null}` with:

```tsx
<CollapsePanel open={open} id={panelId}>
  <div role="region" aria-label={`Auto-applied changes for ${group.showName}`}>
    {/* bulk-actions row, confirm sub-panel, bulk-undo alert, rows <ul> — unchanged */}
  </div>
</CollapsePanel>
```

- `panelId` (`auto-applied-panel-${group.showId}`, `:207`) moves to
  `CollapsePanel`'s outer id; the inner region keeps `data-testid={panelId}` but
  drops its own `id` (id is now on the morph wrapper, the aria-controls target).
- Trigger `aria-controls={open ? panelId : undefined}` (`:292`) →
  `aria-controls={panelId}`.
- **State persistence across collapse (deliberate):** because the panel is now
  always mounted, `confirming` / `bulkUndoOutcome` state persists if the group
  is collapsed mid-confirm and re-expanded. This is consistent with the
  always-mounted model and harmless (the subtree is `inert` while collapsed).
  We do NOT auto-reset confirm state on collapse (no `useEffect` on `open`).
  A group collapsed while its confirm panel is open re-opens with the confirm
  still shown — acceptable; the destructive action still requires the explicit
  confirm-go press.
- **Focus:** the existing `restoreFocusToToggle` / `confirmUndoAll` focus logic
  (`:229-267`) is unaffected — the toggle (`toggleRef`) lives in the header
  OUTSIDE `CollapsePanel`, so collapsing never `inert`s the element that
  receives restored focus.

**B. `IgnoredSheetsDisclosure.tsx`** (`:97-106`). Replace
`{open ? (<div id="ignored-sheets-panel" …>{children}</div>) : null}` with:

```tsx
<CollapsePanel open={open} id="ignored-sheets-panel">
  <div role="region" aria-label="Ignored sheets list">{children}</div>
</CollapsePanel>
```

- Panel `id="ignored-sheets-panel"` → moves to the morph wrapper; inner region
  keeps `data-testid="ignored-sheets-panel"`.
- Trigger `aria-controls={open ? "ignored-sheets-panel" : undefined}` (`:63`) →
  `aria-controls="ignored-sheets-panel"`.

**C. `AddAdminDisclosure.tsx`** (`:64-68`). Replace
`{open ? (<div id="admin-settings-add-admin" …><AddAdminForm/></div>) : null}` with:

```tsx
<CollapsePanel open={open} id="admin-settings-add-admin">
  <div className="flex flex-col gap-3 pt-3">
    <AddAdminForm />
  </div>
</CollapsePanel>
```

- `AddAdminTrigger` `aria-controls="admin-settings-add-admin"` (`:29`) is
  already unconditional (predates this change) — the target now genuinely
  always exists, closing a latent dangling-idref-when-closed nit.
- The `pt-3` replaces the parent card's `gap-3` contribution that the old
  conditional sibling relied on (a height-0 morph child contributes no gap, so
  the top padding moves inside the morphed subtree to preserve spacing when
  open). `AddAdminForm`'s inputs are `inert` when closed.

### 1.4 Dimensional invariants

The morph introduces no fixed-height parent with flex/grid children requiring a
`getBoundingClientRect` parity assertion (Tailwind-v4 `align-items` rule). The
one dimensional contract is behavioral: **the inner content's rendered height
must be >0 when open and 0 when closed** — verified by a real-browser toggle
assertion (see §6 Testing), not jsdom (jsdom computes no layout).

### 1.5 Transition Inventory

`CollapsePanel` has 2 states → 1 pair. The strip's `GroupSection` composes it
with independent instant sub-states. Full inventory (every relevant state pair):

| Surface | From → To | Treatment |
|---|---|---|
| CollapsePanel (all 3 consumers) | collapsed ↔ expanded | **Animated** — `grid-template-rows 0fr↔1fr` over `--duration-normal` (220ms), `ease-out`; reduced-motion → instant (token 0ms + `motion-reduce:transition-none`). **This is the change** (was instant mount/unmount). |
| Strip header chevron | collapsed ↔ expanded | Animated — `rotate-90` over `--duration-fast` (existing, unchanged). |
| Strip confirm sub-panel | closed ↔ open | Instant — deliberate mount/unmount inside the morphed panel (unchanged; a nested morph would double-animate on expand). |
| Strip bulk-undo failure alert | absent ↔ present | Instant — `role="alert"` appears immediately (unchanged). |
| Strip bulk-undo success status | absent ↔ present | Instant, `sr-only` (no visual transition; announced via `role="status"`). New (§4). |
| Kind-dot cluster | n/a | No state transition — a static header element rendered identically open/closed (§2.3). |

**Compound transition:** collapsing a group while its confirm sub-panel is open
— the outer panel row-track animates `1fr→0fr` while the confirm markup (still
mounted, now `inert`) rides along inside `overflow-hidden`. No second animation
fires on the confirm panel; state persists (§1.3 A). Verified in the
transition-audit task (§6.7).

---

## §2 — Collapsed-header kind hint (COLLAPSE-1)

### 2.1 What renders

In `GroupSection`'s collapsed header (`:284-318`), between the show-name span
(`:308-310`) and the count badge (`:311-317`), add a non-interactive
**kind-dot cluster**: one colored dot per **distinct** `changeKind` present in
`group.rows`, in a stable kind order, reusing the existing `KIND_PILL[kind].dot`
color token (`:55-81`). The cluster carries an `aria-label` naming the kinds so
a screen reader hears "Added, Removed" rather than decorative dots.

```tsx
<KindDotCluster rows={group.rows} />
```

```tsx
// Distinct kinds in the group, in KIND_ORDER, each a colored dot. Non-interactive.
const KIND_ORDER = ["crew_removed", "crew_renamed", "crew_added", "field_changed", "crew_email_changed"];
const MAX_DOTS = 4;

function KindDotCluster({ rows }: { rows: AutoAppliedRow[] }) {
  const present = KIND_ORDER.filter((k) => rows.some((r) => r.changeKind === k));
  // Unknown/unlisted kinds collapse to the neutral fallback dot, deduped as one.
  const hasUnknown = rows.some((r) => !KIND_ORDER.includes(r.changeKind));
  const kinds = hasUnknown ? [...present, "__fallback__"] : present;
  if (kinds.length === 0) return null;
  const shown = kinds.slice(0, MAX_DOTS);
  const overflow = kinds.length - shown.length;
  const labelFor = (k: string) => (KIND_PILL[k]?.label ?? FALLBACK_PILL.label);
  const names = kinds.map(labelFor).join(", ");
  return (
    <span
      data-testid="auto-applied-kind-dots"
      className="flex shrink-0 items-center gap-1"
      aria-label={`Change kinds: ${names}`}
    >
      {shown.map((k) => (
        <span
          key={k}
          aria-hidden="true"
          className={`size-2 rounded-full ${KIND_PILL[k]?.dot ?? FALLBACK_PILL.dot}`}
        />
      ))}
      {overflow > 0 ? (
        <span aria-hidden="true" className="text-xs font-semibold text-text-subtle">
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}
```

### 2.2 Guard conditions & caps

- **Empty rows** → `kinds.length === 0` → renders nothing. (A group always has
  ≥1 row in practice — `loadRecentAutoApplied` only creates a group on first
  push, `:187-190` — but the guard is explicit.)
- **Distinct kinds only** — five known kinds + one deduped fallback → max 6
  possible; capped at `MAX_DOTS = 4` with a `+N` overflow marker so the header
  stays compact on a 320px phone. (Realistically ≤3 distinct kinds co-occur.)
- **Unknown kind** — any `changeKind` outside `KIND_ORDER` maps to the single
  neutral fallback dot (never leaks the raw enum — invariant 5), deduped to one
  regardless of how many unknown rows exist.
- **Color is not the only channel** — the `aria-label` names every kind; the
  dots are a sighted-glance accelerant, not the sole signal (the count badge
  and, on expand, the per-row `KindPill` carry the full information).

### 2.3 Mode boundary

The dot cluster renders **only in the collapsed-or-expanded group header** (it
is part of the always-visible trigger row). It does not appear inside the
disclosed panel (the panel already shows per-row `KindPill`s). It renders
identically whether the group is open or closed — it is a header element, not a
collapsed-only element — so no open/closed divergence to reconcile.

---

## §3 — Singleton flatten (REDESIGN-2)

### 3.1 What changes

`StripRow` (`:140-181`) currently always wraps its content in a bordered card:
`className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3"`
(`:155`). For a **one-row group**, this bordered card sits inside the group
card's `bg-surface` panel → card-in-card. Add a `flatten` prop; when set, drop
the card chrome (`rounded-md border border-border bg-surface p-3`) so the single
row reads as panel content, not a nested card:

```tsx
function StripRow({ row, group, actions, flatten = false }: {
  row: AutoAppliedRow; group: AutoAppliedGroup; actions: RecentAutoAppliedStripActions; flatten?: boolean;
}) {
  return (
    <li
      data-testid={`auto-applied-row-${row.id}`}
      className={flatten ? "flex flex-col gap-2" : "flex flex-col gap-2 rounded-md border border-border bg-surface p-3"}
    >
      {/* unchanged */}
    </li>
  );
}
```

Set at the call site (`:404-407`):

```tsx
const flatten = group.rows.length === 1;
// …
{group.rows.map((row) => (
  <StripRow key={row.id} row={row} group={group} actions={actions} flatten={flatten} />
))}
```

### 3.2 Boundaries & rationale

- **Header + bulk-actions row stay** for the singleton (the COLLAPSE-2/REDESIGN-2
  deferral notes the show-name + count + Accept-all/Undo-all header is
  load-bearing even for one row). Only the redundant **inner** card chrome
  drops. This is the minimal divergence from the approved mock — the group is
  still a full card; the singleton row inside it just stops being a second card.
- **Multi-row unchanged** — `flatten` is `false` for `rows.length > 1`, so every
  row keeps its per-row card (they genuinely group).
- **Guard:** `flatten` defaults `false`; only `rows.length === 1` sets it.
  `rows.length === 0` is unreachable (see §2.2) and would render an empty `<ul>`.

---

## §4 — SR all-success status (DESTRUCT-3)

### 4.1 What changes

`confirmUndoAll` (`:236-267`) currently sets `bulkUndoOutcome` to
`failed > 0 ? {failed,total} : null` (`:265`) — an all-success undo writes
`null`, so the failure-only alert (`:393-402`) never renders and SR users get no
completion signal (the strip only self-heals visually via revalidate).

Change: **always** write `{ failed, total }`; branch the render:

```tsx
setBulkUndoOutcome({ failed, total });   // was: failed > 0 ? {…} : null
```

```tsx
{bulkUndoOutcome && bulkUndoOutcome.failed > 0 ? (
  <p role="alert" data-testid={`auto-applied-bulk-undo-alert-${group.showId}`} …>
    Couldn&apos;t undo {bulkUndoOutcome.failed} of {bulkUndoOutcome.total} changes. …
  </p>
) : bulkUndoOutcome && bulkUndoOutcome.total > 0 ? (
  <p
    role="status"
    data-testid={`auto-applied-bulk-undo-success-${group.showId}`}
    className="sr-only"
  >
    Undid all {bulkUndoOutcome.total} {bulkUndoOutcome.total === 1 ? "change" : "changes"}.
  </p>
) : null}
```

### 4.2 Guard conditions & lifecycle

- **Open clears:** the "Undo all" trigger sets `setBulkUndoOutcome(null)`
  (`:343`) — an in-progress open shows no stale status. Unchanged.
- **`total === 0`** — never announced (the success branch guards `total > 0`).
  Unreachable in practice (`Undo all` only renders when `undoableCount > 0`,
  `:338`) but explicit.
- **Failure precedence** — `failed > 0` wins; a mixed outcome shows the visible
  warning alert, not the success status (no double announcement).
- **Visual:** success is `sr-only` (no visible banner) — the strip's own row
  removal on revalidate is the sighted confirmation, matching the ratified
  "failure-only visible alert" decision (spec `2026-07-16-destructive-confirm-pass`
  §6 F2). This adds only the missing SR-parity announcement.
- `role="status"` (polite live region) is correct for a non-error completion;
  the failure path keeps `role="alert"` (assertive).

---

## §5 — Flag / prop lifecycle

| Prop / flag | Storage | Write path | Read path | Effect |
|---|---|---|---|---|
| `CollapsePanel.open` | consumer `useState` | trigger `onClick` | `grid-rows` class + `inert` | animates height, toggles AT visibility |
| `StripRow.flatten` | derived (`rows.length === 1`) | call site `:404` | `<li>` className ternary | drops inner card chrome for singletons |
| `bulkUndoOutcome` | `GroupSection` `useState` | `confirmUndoAll` / open-clear | two render branches (§4.1) | visible failure alert OR sr-only success |

No new persisted/config flags; nothing crosses a server boundary. No zombie flags.

---

## §6 — Testing

TDD per task. Unit (jsdom, Vitest + Testing Library) unless noted.

1. **CollapsePanel unit** (`tests/components/admin/CollapsePanel.test.tsx`, new):
   - `open` → outer has `grid-rows-[1fr]`, inner NOT `inert`.
   - closed → outer has `grid-rows-[0fr]`, inner `inert` (assert the attribute
     present; jsdom reflects the boolean `inert` prop).
   - outer carries `id` + `${id}-morph` testid; children render in both states
     (always mounted — assert a child testid is in the DOM when closed).
2. **Disclosure conversions** (extend existing tests):
   - `RecentAutoAppliedStrip.test.tsx`: collapsed group → panel content is
     present in DOM but `inert`; toggle `aria-controls` is unconditional; the
     confirm/outcome state survives a collapse→expand cycle (new assertion).
   - `IgnoredSheetsDisclosure` / `AddAdminDisclosure` tests: assert content is
     always mounted (present when closed) + `inert` when closed; `aria-controls`
     unconditional. **These replace prior "not in the document when closed"
     assertions** — those are now false by design (always-mounted morph). This
     is the expected test-contract change, called out per the transition-audit
     rule.
3. **Kind-dot cluster** (`RecentAutoAppliedStrip.test.tsx`):
   - group with `crew_added` + `crew_removed` → two dots, `aria-label` contains
     "Added" and "Removed"; dot order is `crew_removed` before `crew_added`
     (KIND_ORDER). Assert against the group's rows (data source), not a container
     that also renders per-row pills (anti-tautology).
   - unknown `changeKind` → single fallback dot, label "Change", raw enum absent.
   - >4 distinct kinds → 4 dots + `+N` marker.
   - empty rows (constructed fixture) → renders nothing.
4. **Singleton flatten** (`RecentAutoAppliedStrip.test.tsx`):
   - one-row group → `auto-applied-row-*` `<li>` className lacks `border`
     (flattened); two-row group → each row `<li>` retains `border` (carded).
     Derive the expectation from `rows.length`, not a hardcoded class list.
5. **SR success status** (`RecentAutoAppliedStrip.test.tsx`):
   - all-success bulk undo → `auto-applied-bulk-undo-success-*` present,
     `role="status"`, `sr-only`, text "Undid all N changes"; failure alert
     ABSENT. Concrete failure mode caught: the current code sets `null` on
     success, so this asserts the branch actually flipped.
   - partial failure → failure alert present, success status ABSENT (precedence).
   - `total === 1` → "change" (singular) copy.
6. **Real-browser morph** (`tests/e2e/collapsePanelMorph.spec.ts` OR a standalone
   esbuild+Playwright harness per the committed real-browser harness pattern):
   toggling a `CollapsePanel` consumer changes the inner content's
   `getBoundingClientRect().height` from `0` (closed) to `>0` (open) within
   0.5px tolerance at settled state. This is the jsdom-can't-verify assertion the
   morph introduces; scoped to the mechanism, not per-consumer.
7. **Transition-audit task** (per project writing-plans rule): enumerate the
   `CollapsePanel` states (collapsed/expanded — 1 pair), assert the single
   transition has the `grid-template-rows` animation (not instant) + a
   `prefers-reduced-motion` instant fallback; enumerate the strip's remaining
   conditional blocks (confirm panel, bulk alert/success, chevron rotate) and
   confirm each is deliberately instant or animated as documented. Include the
   compound case: collapsing a group while its confirm sub-panel is open (state
   persists, subtree `inert`).

### Meta-test inventory

- **Creates:** none. `CollapsePanel` is a leaf primitive; no registry-style
  structural meta-test governs the disclosure family today.
- **Extends:** none of the structural registries (Supabase call-boundary,
  admin-alert catalog, advisory-lock topology, no-inline-email, mutation-surface
  observability) — this batch touches no Supabase call, no email, no mutation
  surface, no DB. Declared explicitly per the writing-plans meta-test-inventory
  rule: **"None applies because the change is presentational-only (client
  components + a CSS morph) with no data, auth, DB, or telemetry surface."**

---

## §7 — Do-not-relitigate (adversarial-review pre-load)

Cite these to preempt round-N churn:

1. **Family boundary = the two named siblings + the strip.** The COLLAPSE-2
   deferral (`DEFERRED.md`, "Auto-applied collapsible groups" §, AUTOAPPLIED-COLLAPSE-2)
   names exactly `IgnoredSheetsDisclosure` and `AddAdminDisclosure` as the
   identical instant-mount siblings. `EventRow` (telemetry row expander) and the
   overlay/popover disclosures are a different pattern and are explicitly out of
   scope (§ Out of scope). Converging the three cited in-flow disclosures closes
   the deferral's "animate only one = divergence" objection; it does not obligate
   converting every `aria-expanded` in the tree.
2. **Always-mounted panels are required, not a leak.** A height-morph cannot
   animate an unmounting element; `inert`-when-closed removes the collapsed
   subtree from tab order + AT tree, so no hidden focusable/announced content
   escapes. This is the standard CSS-grid accordion pattern.
3. **Confirm/outcome state persists across collapse — deliberate** (§1.3 A). The
   subtree is `inert` while collapsed; the destructive action still requires an
   explicit confirm-go press. Not a bug.
4. **Kind dots are an accelerant, not the sole channel** (§2.2). Color is
   backed by the `aria-label` naming every kind; the count badge and per-row
   pills carry full information. Not a color-only-signal violation.
5. **Singleton flatten keeps the header + bulk row** (§3.2). Only the redundant
   inner card chrome drops; the group is still a full card, matching the mock's
   "single-row group is a full card" intent. The deferral's "header is
   load-bearing" note is honored.
6. **SR success is `sr-only`, failure stays visible** (§4.2). This preserves the
   ratified "failure-only visible alert" decision (`2026-07-16-destructive-confirm-pass`
   §6 F2) and adds only the missing SR-parity announcement — it does not add a
   visible success banner.
7. **Impeccable dual-gate (invariant 8) runs at Stage 4** on the UI diff
   (`RecentAutoAppliedStrip`, `IgnoredSheetsDisclosure`, `AddAdminDisclosure`,
   `CollapsePanel`, any `globals.css` touch). P0/P1 fixed or DEFERRED-logged.

---

## §8 — Files

- **Create:** `components/admin/CollapsePanel.tsx`; `tests/components/admin/CollapsePanel.test.tsx`; real-browser morph harness/spec.
- **Modify:** `components/admin/RecentAutoAppliedStrip.tsx` (CollapsePanel adoption, kind dots, singleton flatten, SR success); `components/admin/IgnoredSheetsDisclosure.tsx`; `components/admin/settings/AddAdminDisclosure.tsx`; their test files.
- **Regen (close-out):** `public/help/screenshots/*` for any captured route whose settled appearance changes — dashboard (collapsed-header dots, flatter singleton) and `needs-attention-mobile` (strip present there). Morph animation itself does not drift settled-state bytes; the collapsed-header dots do. Regen from the pinned Docker image, native-amd64, per byte-comparison discipline.
- **Docs:** `DEFERRED.md` (mark the four RESOLVED; log any new impeccable P2/P3 deferrals).
