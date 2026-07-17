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

> **Reconciliation note (2026-07-17):** during this branch's build, sibling PR
> #422 (`fix/destruct-harmonize`) merged to `main` and shipped **DESTRUCT-3**
> (the all-success bulk-undo sr-only `role=status`) with the identical
> persistent-region pattern this spec's §4 describes, plus **MOBILEPARITY-1**
> (strip heading `text-sm`→`text-base`). On merging `origin/main`, this branch
> adopted #422's canonical DESTRUCT-3 (testid `auto-applied-bulk-undo-status-*`)
> and dropped its own duplicate; **the delivered scope of THIS branch is
> COLLAPSE-2 (§1), COLLAPSE-1 (§2), and REDESIGN-2 (§3)**. §4 (DESTRUCT-3) is
> retained below for the design record but is satisfied upstream; this branch
> only adds a singular-copy test not present in #422.

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
  label,
  children,
}: {
  open: boolean;
  // Stable DOM id — the trigger's aria-controls target. Placed on the REGION
  // element itself (the overflow-hidden grid item), which is always mounted, so
  // aria-controls resolves directly to the labeled region (not a generic
  // wrapper) in both states.
  id: string;
  // Accessible name for the disclosed region.
  label: string;
  children: ReactNode;
}) {
  return (
    // Outer grid = the height-morph TRACK only (no id, no role): its single row
    // track animates 0fr → 1fr, sizing the region grid-item's box height.
    <div
      className={`grid transition-[grid-template-rows] duration-normal ease-out motion-reduce:transition-none ${
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      }`}
    >
      {/* The region IS the grid item. In the 0fr track its border-box height is
          clamped to 0 and overflow-hidden clips the (natural-height) children —
          so getBoundingClientRect() on THIS element reports 0 closed / >0 open.
          inert removes the collapsed region from BOTH tab order and the AT tree
          (React 19 boolean `inert`), matching the WAI accordion `hidden`
          behavior while still permitting the morph. */}
      <div
        id={id}
        data-testid={id}
        role="region"
        aria-label={label}
        className="overflow-hidden"
        inert={open ? undefined : true}
      >
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
  `showId` / a literal). It is placed on the **region grid-item** (the
  `overflow-hidden` element) as both its `id` and its `data-testid` — NOT on the
  outer grid track (which carries no id/role). Tests query the region via
  `getByTestId(id)`; `aria-controls` on the trigger points at the same `id`.
- `children` empty → the region renders an empty (height-0) box; benign.
- **Parent-gap caveat (usage contract):** the outer morph track is ALWAYS a
  rendered element (0-height when closed), so a parent that uses flex/grid `gap`
  to separate the panel from its siblings will keep that gap visible when the
  panel is collapsed (a ~12px phantom below the header). Consumers MUST NOT rely
  on parent `gap` to space the panel; put the open-state separation INSIDE the
  panel (a `pt-*` wrapper on the children, which `overflow-hidden` clips to 0
  when closed). `GroupSection` is unaffected (its `<li>` has no `gap`); the two
  gapped consumers (§1.3 B, C) apply the inside-spacing fix.

### 1.3 Consumer conversions

Each consumer's trigger `<button>` changes `aria-controls={open ? ID : undefined}`
→ `aria-controls={ID}` (unconditional — the target now always exists). In every
consumer the former hand-rolled `<div id role="region" aria-label …>` wrapper is
**removed**; its `id`/`role`/`aria-label`/`data-testid` are subsumed by
`CollapsePanel` (passed via `id`+`label`). Only the wrapper's *inner* markup
(the actual panel contents) becomes `CollapsePanel`'s `children` — do NOT nest a
second region wrapper or re-declare the id/testid inside.

**A. `RecentAutoAppliedStrip.tsx` `GroupSection`** (`:321-410`). Replace
`{open ? (<div id={panelId} role="region" …>…</div>) : null}` with:

```tsx
<CollapsePanel open={open} id={panelId} label={`Auto-applied changes for ${group.showName}`}>
  {/* bulk-actions row, confirm sub-panel, bulk-undo alert, rows <ul> — unchanged */}
</CollapsePanel>
```

- `panelId` (`auto-applied-panel-${group.showId}`, `:207`) + the existing
  `role="region"` + `aria-label` now live on `CollapsePanel`'s region grid-item
  (via `id` + `label`); the former hand-rolled `<div id={panelId} role="region"
  aria-label=…>` wrapper is removed (its role/label/id/testid are subsumed).
- Trigger `aria-controls={open ? panelId : undefined}` (`:292`) →
  `aria-controls={panelId}` (unconditional; the region id is always mounted).
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
<CollapsePanel open={open} id="ignored-sheets-panel" label="Ignored sheets list">
  <div className="pt-3">{children}</div>
</CollapsePanel>
```

- The former `<div id="ignored-sheets-panel" role="region" aria-label="Ignored
  sheets list">` wrapper is removed; `id`/`role`/`aria-label`/`data-testid`
  are subsumed by `CollapsePanel`'s region grid-item.
- Trigger `aria-controls={open ? "ignored-sheets-panel" : undefined}` (`:63`) →
  `aria-controls="ignored-sheets-panel"`.
- **Parent-gap fix:** remove `gap-3` from the section wrapper (`:49`,
  `flex w-full max-w-4xl flex-col gap-3` → `flex w-full max-w-4xl flex-col`); the
  open-state separation moves inside the panel via the `pt-3` child wrapper
  (clipped when closed). The section has exactly two children (the header row +
  the panel), so dropping the section gap changes no other spacing.

**C. `AddAdminDisclosure.tsx`** (`:64-68`). Replace
`{open ? (<div id="admin-settings-add-admin" …><AddAdminForm/></div>) : null}` with:

```tsx
<CollapsePanel open={open} id="admin-settings-add-admin" label="Add administrator form">
  <div className="flex flex-col gap-3 pt-3">
    <AddAdminForm />
  </div>
</CollapsePanel>
```

- `AddAdminTrigger` `aria-controls="admin-settings-add-admin"` (`:29`) is
  already unconditional (predates this change) — the target now genuinely
  always exists, closing a latent dangling-idref-when-closed nit.
- **Parent-gap fix:** remove `gap-3` from the card (`:61`,
  `flex flex-col gap-3 rounded-md border border-border bg-surface p-4` →
  `flex flex-col rounded-md border border-border bg-surface p-4`). The card's two
  children are `{list}` and the panel; the `pt-3` inside the CollapsePanel child
  provides the open-state separation from the list and is clipped by
  `overflow-hidden` when closed (no phantom gap). Correction to the earlier
  claim: a 0-height morph child DOES still incur a flex `gap` from its sibling —
  that is exactly why the card `gap-3` is removed rather than kept.
  `AddAdminForm`'s inputs are `inert` when closed.

### 1.4 Dimensional invariants

The morph introduces no fixed-height parent with flex/grid children requiring a
`getBoundingClientRect` parity assertion (Tailwind-v4 `align-items` rule). The
one dimensional contract is behavioral: **the region grid-item `#${id}` (the
`overflow-hidden` element carrying `role="region"`) must report
`getBoundingClientRect().height === 0` when closed and `> 0` when open.** This
is the correct assertion target — it is the grid item sized by the `0fr`/`1fr`
track, not the natural-height children it clips (which retain their own height
inside the clip). Verified by a real-browser toggle assertion (see §6 Testing),
not jsdom (jsdom computes no layout).

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
// Typed string[] (not an inferred literal tuple) so `.includes(r.changeKind)`
// with the plain `string` changeKind is type-clean under strict TS.
const KIND_ORDER: string[] = ["crew_removed", "crew_renamed", "crew_added", "field_changed", "crew_email_changed"];
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

### 2.1b Header flex invariant (320px overflow guard)

The collapsed header is a flex row: `chevron` (`shrink-0`) · **show-name span**
(`min-w-0 flex-1 wrap-break-word`, `:308`) · **dot cluster** (`shrink-0`, added
here) · **count badge** (`shrink-0`, `:314`). The dot cluster and count MUST
stay `shrink-0` and the show-name span MUST keep `min-w-0 flex-1` — so at 320px
the show name is the only element that shrinks/wraps and the dots+count never
force horizontal overflow. This invariant is why the cluster is capped at
`MAX_DOTS` (§2.2) and inserted between the flex-1 name and the shrink-0 count,
not appended after the count. Verified by the impeccable real-browser pass at
390px (invariant 8) and the header-order unit assertion (§6.3).

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
- **The dots are a non-authoritative triage preview, not a safety mechanism.**
  A sighted color-vision-limited operator may not distinguish the dots' hues,
  so the collapsed cluster is NOT claimed to convey per-kind identity to that
  user by color alone — it degrades gracefully to "this group has N distinct
  kinds" (the dot *count* is still visible) plus the full names via `aria-label`
  for AT. The claim is deliberately scoped: dots accelerate sighted triage; they
  are not the authoritative kind signal. **Safety is carried by the interaction
  model, not the dots:** every disposition control (Accept, Accept-all, Undo,
  Undo-all) lives inside the disclosed panel (`:328-408`), so an operator
  physically cannot Accept/Undo a change — destructive `crew_removed` included —
  without first expanding the group and seeing the per-row `KindPill` "Removed"
  (color + uppercase text + line-through diff, §DiffBlock `:123-135`). The dots
  never gate an action; they only hint which group to open first. This closes
  the COLLAPSE-1 deferral's stated concern (a destructive change is invisible
  *until expand*) without overstating colorblind parity for the preview.

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

**DOM placement (unchanged, pinned):** this single conditional block replaces the
existing failure-only block **in its current position** — after the
`confirming ? (<div …confirm…>) : null` block (`:353-391`) and before the rows
`<ul>` (`:404-408`). The success/failure node is thus always BELOW the confirm
panel slot and ABOVE the row list, whether or not `confirming` is open. No JSX is
reordered; only the ternary's `else` arm changes from `null` to the sr-only
success `<p>`. A reopened confirm (`confirming` true again) renders its panel
above this block as before.

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
- **Post-revalidate lifecycle (one-shot, accepted):** `role="status"` announces
  on content *change*, so the announcement fires once when the node appears.
  After `undoFromDashboardAction`'s revalidate re-renders the strip: if the
  group's undone rows were its only rows, the whole `GroupSection` unmounts and
  the sr-only node goes with it; if the group also holds non-undoable rows
  (`field_changed`/`crew_email_changed`), the group persists and the identical
  sr-only node lingers — but an unchanged live-region node does NOT re-announce,
  and the next "Undo all" open clears it (`:343`). No re-announcement, no visible
  artifact. We deliberately do NOT add a rows-changed `useEffect` reset (an extra
  hook for a silent, already-announced node is unwarranted). Named here per the
  lifecycle-completeness rule.

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
   - `open` → outer track has `grid-rows-[1fr]`; region grid-item (`getByTestId(id)`)
     NOT `inert`, carries `id` + `role="region"` + `aria-label={label}`.
   - closed → outer track has `grid-rows-[0fr]`; region grid-item `inert` (assert
     the attribute present; jsdom reflects the boolean `inert` prop).
   - children render in both states (always mounted — assert a child testid is in
     the DOM when closed, inside the inert region).
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
   toggling a `CollapsePanel` consumer changes the **region grid-item's**
   (`#${id}`, the `overflow-hidden role="region"` element)
   `getBoundingClientRect().height` from `0` (closed) to `>0` (open) **at settled
   state**. **Wait mechanism (mandatory — avoids mid-transition flake):** run the
   probe page under `page.emulateMedia({ reducedMotion: "reduce" })` so
   `--duration-normal` collapses to `0ms` (`globals.css:400-410`) and the toggle
   is instantaneous — the height read is deterministic (no interpolation window).
   Assert `=== 0` closed, then click, then assert `> 0` open. (Do NOT sleep-and-hope
   in animated mode; the animated `transition` *property* is asserted separately,
   statically, in the transition-audit Task, §6.7.) This is the jsdom-can't-verify assertion the
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
8. **The region IS the morph grid-item** (§1.1, R1 fix). `id` + `role="region"`
   + `aria-label` sit on the `overflow-hidden` grid item (always mounted, `inert`
   when closed), so `aria-controls` resolves directly to the labeled region and
   the real-browser height assertion targets `#${id}` (0 closed / >0 open). The
   outer `grid` div is a bare morph track (no id/role). Do not relitigate
   "button controls a generic wrapper" — resolved.
9. **Kind dots are non-authoritative triage sugar** (§2.2, R1 fix). Safety is
   the interaction model (all disposition controls live in the disclosed panel;
   you must expand to Accept/Undo, seeing the per-row "Removed" pill). The dots
   are NOT claimed to convey per-kind identity to colorblind sighted users by
   hue; the spec scopes the claim. Do not relitigate the color channel — the
   dots gate no action.

---

## §8 — Files

- **Create:** `components/admin/CollapsePanel.tsx`; `tests/components/admin/CollapsePanel.test.tsx`; real-browser morph harness/spec.
- **Modify:** `components/admin/RecentAutoAppliedStrip.tsx` (CollapsePanel adoption, kind dots, singleton flatten, SR success); `components/admin/IgnoredSheetsDisclosure.tsx`; `components/admin/settings/AddAdminDisclosure.tsx`; their test files.
- **Regen (close-out):** `public/help/screenshots/*` for any captured route whose settled appearance changes — dashboard (collapsed-header dots, flatter singleton) and `needs-attention-mobile` (strip present there). Morph animation itself does not drift settled-state bytes; the collapsed-header dots do. Regen from the pinned Docker image, native-amd64, per byte-comparison discipline.
- **Docs:** `DEFERRED.md` (mark the four RESOLVED; log any new impeccable P2/P3 deferrals).
