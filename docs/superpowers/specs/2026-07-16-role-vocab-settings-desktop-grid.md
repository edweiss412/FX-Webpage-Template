# Roles settings — desktop one-line grid rows (BL-ROLE-VOCAB-SETTINGS-DESKTOP-GRID)

**Date:** 2026-07-16 · **Status:** draft · **Scope:** UI-only (Opus, invariant-8 dual-gate)
**Origin:** `BACKLOG.md:21-25` (BL-ROLE-VOCAB-SETTINGS-DESKTOP-GRID) ← `DEFERRED.md:555-559` (ROLE-VOCAB-1, impeccable critique P2 on PR #396).
**Parent spec:** `docs/superpowers/specs/2026-07-15-extend-role-scope-vocab.md` §8.2 (settings page). This spec changes LAYOUT only; every behavior, string-flow, and state-machine contract of the parent spec stays in force.

## 1. Problem

`/admin/settings/roles` renders the stacked mobile card at every viewport (`app/admin/settings/roles/RoleMappingRow.tsx:132-186`, page capped `max-w-2xl` at `app/admin/settings/roles/page.tsx:30`). The committed mock (`docs/superpowers/specs/2026-07-15-extend-role-scope-vocab-mock/Roles You've Added.dc.html:179-226`, "Desktop width" section) specifies a compact one-line grid row at desktop width — a density win for Doug's desk context. The desktop variant was deferred out of PR #396 (DEFERRED ROLE-VOCAB-1); user has now explicitly invoked the backlog item.

## 2. Mock contract (single source of truth for the desktop look)

From the mock's Desktop width section (`Roles You've Added.dc.html:181-223`) — the implementation MUST be compared against this file during impeccable review:

| Property | Mock value (line) | Tailwind mapping |
| --- | --- | --- |
| Section container width | 760px card in a ≥760px viewport (:182) | page `main` bumped `max-w-2xl` → `max-w-3xl` (768px; sibling settings root already uses `max-w-3xl`, `app/admin/settings/page.tsx:142`) |
| Row display | `grid; grid-template-columns:150px 1fr auto auto; align-items:center; gap:16px` (:189) | `min-[760px]:grid min-[760px]:grid-cols-[150px_1fr_auto_auto] min-[760px]:items-center min-[760px]:gap-x-4` |
| Row padding | `8px 14px` (:189) | `min-[760px]:px-3.5 min-[760px]:py-2` (mobile keeps `p-3`) |
| Cell order | token · chips · meta · actions (:190-199) | explicit `col-start` placement (see §4) |
| Token | 14px semibold (:190) | existing classes unchanged |
| Chips cell | `flex; flex-wrap; gap:6px` (:191) | existing `flex flex-wrap gap-1.5` unchanged |
| Meta | 11px, `white-space:nowrap` (:195) | existing `whitespace-nowrap text-[11px]` unchanged |
| Actions | right-aligned (emerges from `1fr` chips column), `gap:8px` (:196) | existing `gap-2`; right alignment from grid |
| Edit label | short "Edit" (:197) | re-add `EDIT_LABEL_SHORT = "Edit"` (deleted in PR #396 per flag-lifecycle rule; prior value verified at commit `2cd3a3e75` `components/admin/roleRecognizeCopy.ts:65`); mobile keeps `EDIT_LABEL = "Edit what they see"` (`components/admin/roleRecognizeCopy.ts:64`) |
| Remove label | "Remove", ghost/underline (:198) | unchanged (`roleRecognizeCopy.ts:69`) |
| Row chrome | white card, 1px border, 6px radius (:189) | existing `rounded-md border border-border bg-surface` unchanged |
| List gap | 10px between rows (:188) | existing `gap-2.5` unchanged |

The mock's three example rows (multi-chip, financial chip, empty-grants dashed "Standard page only" chip) all use the SAME grid; no per-variant layout.

## 3. Breakpoint

`min-[760px]:` arbitrary variant, matching the mock's 760px card exactly. This project deliberately has **no global `md:` breakpoint** (`app/globals.css:222-231` — adding one would silently activate dormant `md:` classes in 4 files). Precedent for the arbitrary-variant switch: admin Dashboard `min-[720px]:hidden` / `hidden min-[720px]:flex` (`components/admin/Dashboard.tsx:721-725`).

## 4. Design — single-DOM responsive branch in `RoleMappingRow`

No new component; no duplicated interactive subtree (a second Edit/Remove pair or a duplicated edit panel would double the state surface and drift). One DOM, two layouts:

- The `<li>` (`RoleMappingRow.tsx:133-136`) keeps `flex flex-col gap-2 ... p-3` for mobile and adds `min-[760px]:grid min-[760px]:grid-cols-[150px_1fr_auto_auto] min-[760px]:items-center min-[760px]:gap-x-4 min-[760px]:gap-y-2 min-[760px]:px-3.5 min-[760px]:py-2`.
- The mobile header wrapper (`RoleMappingRow.tsx:137`, token + meta on one baseline row) gets `min-[760px]:contents` so at ≥760px it dissolves and the token/meta spans become direct grid items. (`display:contents` is safe here: plain layout `div`, no ARIA role — the known a11y hazard is roles/live-regions on `display:contents` elements, none present.)
- Explicit cell placement at ≥760px (DOM order is token, meta, chips, actions — column order differs, so placement is explicit, all `row-start-1`):
  - token `span` → `min-[760px]:col-start-1 min-[760px]:row-start-1 min-[760px]:truncate` (150px column; overflow-long tokens truncate at desktop only, full value in `title` attribute; mobile always shows the full token)
  - meta `span` → `min-[760px]:col-start-3 min-[760px]:row-start-1`
  - chips container (view mode) → `min-[760px]:col-start-2 min-[760px]:row-start-1`
  - actions container (view mode) → `min-[760px]:col-start-4 min-[760px]:row-start-1`
- Full-width sub-rows at ≥760px via `min-[760px]:col-span-4` (they occupy row 2+ automatically): the `savedConfirm` status (`:177-185`), the edit panel (`:189-273`), the confirm panel (`:276-310`).
- Edit/confirm mode note: at ≥760px, when `mode !== "view"` the chips + actions cells are not rendered (existing conditional), so row 1 holds token + meta and the panel spans the full width beneath — approved design ("edit/confirm panel spans full width below the one-line row").
- Edit-label swap inside the SAME button (`:170-172`): two spans, `<span className="min-[760px]:hidden">{COPY.EDIT_LABEL}</span>` + `<span className="hidden min-[760px]:inline">{COPY.EDIT_LABEL_SHORT}</span>`. One button, one handler; only the visible label changes.
- `page.tsx:30`: `max-w-2xl` → `max-w-3xl`.
- `RolesSettingsView.tsx` is unchanged except no change at all is expected (list `ul`, empty state, error state already width-fluid). Empty and error states simply widen with the container.

### Flag lifecycle — `EDIT_LABEL_SHORT`

| storage | write path | read path | effect |
| --- | --- | --- | --- |
| `components/admin/roleRecognizeCopy.ts` const | n/a (static copy) | desktop label span in `RoleMappingRow` view actions | visible Edit-button label at ≥760px |

Not a zombie flag: read path + visible effect both exist in this diff.

### Guard conditions

- **Empty grants:** dashed "Standard page only" chip renders in the chips cell — same as mobile (`RoleMappingRow.tsx:145-151`).
- **Many chips / narrow 1fr cell:** chips wrap within the `1fr` cell; the grid row grows taller. Acceptable — the mock's "one line each" is the nominal 1-2 chip case; no truncation of chips.
- **Long token (> 150px):** truncates with ellipsis at desktop (`min-[760px]:truncate` + `title`); never truncates on mobile.
- **`notice`/`savedConfirm` present:** full-width sub-row beneath the grid row (col-span-4), identical copy/roles as mobile.
- **Zero rows / infra_error:** unchanged branches in `RolesSettingsView.tsx:41-56`; only wider.

### Dimensional invariants (≥760px, view mode)

Parent: the `<li>` grid row. Children relationships, each guaranteed by a stated class:

1. token, chips, meta, actions cells all occupy grid row 1 → `row-start-1` on all four (+ explicit `col-start-*`); vertical centering via `min-[760px]:items-center` on the `<li>`.
2. Token column is exactly 150px → `grid-cols-[150px_1fr_auto_auto]`; token span `truncate` keeps content inside it.
3. Actions cell right edge sits at the row's content right edge (right-aligned) → last `auto` column + `1fr` chips column absorbing slack.
4. Panels/status sub-rows span the full content width → `min-[760px]:col-span-4`.
5. Below 760px the stacked card layout is byte-identical to today (no base-class changes).

All verified in a real browser (Playwright `getBoundingClientRect()`, ±0.5px) — this project's Tailwind v4 does not default `.flex` to `align-items: stretch`, and jsdom computes no layout.

### Transition inventory

States: `view` / `edit` / `confirm` (unchanged machine, `RoleMappingRow.tsx:63`). Pairs (N=3 → 3 pairs, plus breakpoint axis):

| Transition | Treatment |
| --- | --- |
| view → edit | existing `popIn` keyframe on the panel (`:54-55`) — unchanged |
| edit → view | instant (existing) — unchanged |
| view → confirm | existing `popIn` — unchanged |
| confirm → view | instant (existing) — unchanged |
| edit ↔ confirm | unreachable directly (must pass through view) — unchanged |
| <760px ↔ ≥760px (resize) | instant CSS re-layout, no animation, no state loss (pure media-variant classes; React state untouched) |
| Compound: resize while edit/confirm open | panel is full-width in both layouts (mobile: block flow; desktop: col-span-4); mode + checkbox state persist across the breakpoint |
| Compound: resize while `savedConfirm`/`notice` visible | same — full-width sub-row in both layouts |

## 5. Out of scope

- `BL-ROLE-VOCAB-STAGING-OVERLAY` (wizard rescan overlay, DEFERRED ROLE-VOCAB-2) — untouched.
- Any change to actions, server code, DB, telemetry, copy other than re-adding `EDIT_LABEL_SHORT`.
- Recognize-control (`components/admin/RoleRecognizeControl.tsx`) — untouched.
- The mock's mobile/interactive sections — already shipped; only the "Desktop width" section is being implemented.

## 6. Tests

1. **Component (jsdom, extend `tests/components/roleMappingSettingsRows.test.tsx`):**
   - Edit button renders BOTH label spans (`EDIT_LABEL` mobile-visible, `EDIT_LABEL_SHORT` desktop-visible) inside ONE button wired to the same handler; existing `getByText(COPY.EDIT_LABEL)`-style queries keep passing (span still present).
   - Existing suite (view/edit/remove/state-isolation) stays green — the DOM restructure must not change semantics. Concrete failure mode caught: an accidental duplicate Edit button (two-subtree approach) would break single-button queries and double-fire handlers.
2. **Real-browser layout (new `tests/e2e/roles-settings-layout.spec.ts`, desktop-chromium project):** seed 3 `role_token_mappings` rows via the service-role helper (`tests/e2e/helpers/supabaseAdmin.ts`) mirroring the mock triple (2 grants / financial grant / empty grants), `signInAs(ADMIN_FIXTURE)`, visit `/admin/settings/roles`. Clear the table before seed and after the spec (global table; invariant-9 destructure-and-throw in the seed helper). Seed rows must satisfy the table CHECKs (`supabase/migrations/20260716000000_role_token_mappings.sql:4-18`): `token` uppercase/trimmed ≤64 chars, `grants ⊆ {A1,V1,L1,FINANCIALS}`, `decided_by` canonical lowercase email. Service-role writes are in-grant (`:27`).
   - **1280×900:** per row — token/chips/meta/actions cells vertically centered on one grid row (rect centers within ±0.5px of each other); token cell width 150±0.5px; actions cell right edge within ±1px of `li` content right edge; `main` container width ≈ 768px (proves the `max-w-3xl` bump). Expected values derived from measured rects and the two spec literals (150px column, 768px cap) — never from sibling hardcodes.
   - **390×900:** stacked layout — chips container top ≥ token bottom, actions top ≥ chips bottom (vertical order proof); Edit button accessible label is `EDIT_LABEL` (long).
   - **Anti-tautology:** the one-line assertion compares cell rects to EACH OTHER (geometry), not to a snapshot of the classes that produce them; the 390px assertions prove the mobile card did not regress (would fail if the base classes were altered rather than the `min-[760px]:` additions).
   - **Edit-open at 1280:** click Edit (desktop label), assert panel width within ±1px of the `li` content width (col-span-4 proof) and the checkbox set renders — compound state × breakpoint.
3. **Copy hygiene:** `tests/messages/_metaCatalogCopyHygiene.test.ts` already sweeps every `roleRecognizeCopy` export and the three settings component files — `EDIT_LABEL_SHORT` and the new spans are inside its net automatically.

### Meta-test inventory

None created or extended. Reason: no new Supabase call boundary in app code (the only new Supabase calls live in the e2e seed helper, test-scope, which follows invariant-9 destructure-and-throw but is not a `lib/` helper subject to `tests/auth/_metaInfraContract.test.ts`); no advisory locks; no admin-alert codes; no sentinel-hiding text; no email normalization.

### Mutation-surface instrumentation

No new mutation surface: no new route handlers, no new server actions (existing `updateRoleTokenMapping`/`deleteRoleTokenMapping` untouched and already registered).

## 7. Acceptance criteria

- AC-1: at ≥760px viewport, each mapping row renders as one grid line `150px | chips | meta | actions` with right-aligned actions and short "Edit" label — matching the mock section byte-for-visual (impeccable review compares against the mock file directly).
- AC-2: below 760px, the shipped stacked card is pixel-unchanged (base classes untouched; only `min-[760px]:` classes added).
- AC-3: edit/confirm/saved/notice sub-rows span the full row width at both layouts; all existing behavioral tests pass unmodified except where the spec adds assertions.
- AC-4: page container is `max-w-3xl`.
- AC-5: real-browser layout spec green in CI (desktop-chromium project); invariant-8 impeccable critique + audit both run on the diff with P0/P1 fixed or DEFERRED.md-logged.
