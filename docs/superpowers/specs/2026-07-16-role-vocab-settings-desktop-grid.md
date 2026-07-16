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
| Section container width | 760px card in a ≥760px viewport (:182) | page `main` bumped `max-w-2xl` → `max-w-3xl` (768px). **Ratified deviation:** 768px ≠ the mock's 760px — `max-w-3xl` is the nearest existing scale token and matches the sibling settings root (`app/admin/settings/page.tsx:142`); a `max-w-[760px]` arbitrary would break sibling parity for an 8px delta. Width math: `main` is border-box with `px-tile-pad` = 20px/side (`app/globals.css:169`), so at ≥808px viewports the row content width is 768 − 40 = **728px**; the mock card's own content width is 760 − 48 = 712px — same ballpark, grid identical. In the 760–807px viewport window `main` is viewport-wide (cap not yet reached) and the grid still fits (≥720px content). |
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
  - token `span` → `min-[760px]:col-start-1 min-[760px]:row-start-1 min-[760px]:truncate` (150px column; overflow-long tokens truncate at desktop only, full value in an unconditional `title` attribute present at all widths; mobile always shows the full token)
  - meta `span` → `min-[760px]:col-start-3 min-[760px]:row-start-1`
  - chips container (view mode) → `min-[760px]:col-start-2 min-[760px]:row-start-1`
  - actions container (view mode) → `min-[760px]:col-start-4 min-[760px]:row-start-1`
- Full-width sub-rows at ≥760px via `min-[760px]:col-span-4` (they occupy row 2+ automatically): the `savedConfirm` status (`:177-185`), the edit panel (`:189-273`), the confirm panel (`:276-310`).
- Edit/confirm mode note: at ≥760px, when `mode !== "view"` the chips + actions cells are not rendered (existing conditional), so row 1 holds token + meta and the panel spans the full width beneath — approved design ("edit/confirm panel spans full width below the one-line row").
- Edit-label swap inside the SAME button (`:170-172`): the button gains `aria-label={COPY.EDIT_LABEL}` and its content becomes two `aria-hidden="true"` spans — `<span aria-hidden="true" className="min-[760px]:hidden">{COPY.EDIT_LABEL}</span>` + `<span aria-hidden="true" className="hidden min-[760px]:inline">{COPY.EDIT_LABEL_SHORT}</span>`. One button, one handler; only the visible label changes.
- `page.tsx:30`: `max-w-2xl` → `max-w-3xl`.
- `RolesSettingsView.tsx` is unchanged (list `ul`, empty state, error state already width-fluid). Empty and error states simply widen with the container.

### Accessible-name contract (Edit button)

The button's accessible name is CONSTANT at every breakpoint: `EDIT_LABEL` ("Edit what they see"), supplied by the explicit `aria-label` (which wins over content per acc-name precedence). Rationale: (a) the existing component suite locates the button via `getByRole("button", { name: COPY.EDIT_LABEL })` (`tests/components/roleMappingSettingsRows.test.tsx:149` et al.) — without the aria-label, jsdom (no Tailwind CSS, both spans rendered) would compute the CONCATENATED name and break every one of those queries; the aria-label keeps the whole existing suite green unmodified in jsdom AND real browsers; (b) screen-reader users get the descriptive label at all widths. WCAG 2.5.3 (label-in-name) holds at desktop because the visible label "Edit" is a prefix of the accessible name "Edit what they see". The VISIBLE label swap is asserted in e2e via span visibility (`toBeVisible()` on the short span / `toBeHidden()` on the long span at 1280, inverse at 390), NOT via accessible name.

### Flag lifecycle — `EDIT_LABEL_SHORT`

| storage | write path | read path | effect |
| --- | --- | --- | --- |
| `components/admin/roleRecognizeCopy.ts` const | n/a (static copy) | desktop label span in `RoleMappingRow` view actions | visible Edit-button label at ≥760px |

Not a zombie flag: read path + visible effect both exist in this diff.

### Guard conditions

- **Empty grants:** dashed "Standard page only" chip renders in the chips cell — same as mobile (`RoleMappingRow.tsx:145-151`).
- **Many chips / narrow 1fr cell:** chips wrap within the `1fr` cell; the grid row grows taller. Acceptable — the mock's "one line each" is the nominal 1-2 chip case; no truncation of chips.
- **Long token (> 150px):** truncates with ellipsis at desktop (`min-[760px]:truncate`); never truncates on mobile. The `title` attribute carries the full token at ALL widths unconditionally (a `title` cannot vary by breakpoint; it is harmless on mobile where the text is fully visible).
- **`notice`/`savedConfirm` present:** full-width sub-row beneath the grid row (col-span-4), identical copy/roles as mobile.
- **Zero rows / infra_error:** unchanged branches in `RolesSettingsView.tsx:41-56`; only wider.

### Dimensional invariants (≥760px, view mode)

Parent: the `<li>` grid row. Children relationships, each guaranteed by a stated class:

1. token, chips, meta, actions cells all occupy grid row 1 → `row-start-1` on all four (+ explicit `col-start-*`); vertical centering via `min-[760px]:items-center` on the `<li>`.
2. Token column is exactly 150px → `grid-cols-[150px_1fr_auto_auto]`; token span `truncate` keeps content inside it.
3. Actions cell right edge sits at the row's content right edge (right-aligned) → last `auto` column + `1fr` chips column absorbing slack.
4. Panels/status sub-rows span the full content width → `min-[760px]:col-span-4`.
5. Below 760px the stacked card LAYOUT is identical to today (no base/non-prefixed class changes; the only DOM change visible to mobile is the Edit label moving into an `aria-hidden` span rendering the identical string — not byte-identical DOM, identical rendered layout).

All verified in a real browser (Playwright `getBoundingClientRect()`, ±0.5px) — this project's Tailwind v4 does not default `.flex` to `align-items: stretch`, and jsdom computes no layout.

### Transition inventory

States: `view` / `edit` / `confirm` (unchanged machine, `RoleMappingRow.tsx:63`). Pairs (N=3 → 3 pairs, plus breakpoint axis):

| Transition | Treatment |
| --- | --- |
| view → edit | existing `popIn` keyframe on the panel (`:54-55`) — unchanged |
| edit → view | instant (existing) — unchanged |
| view → confirm | existing `popIn` — unchanged |
| confirm → view | instant (existing) — unchanged |
| edit ↔ confirm | unreachable directly (must pass through view): `startEdit`/`startConfirm` are invoked only by the two view-mode buttons, which render only inside the `mode === "view"` branch (`RoleMappingRow.tsx:142-176`); the edit/confirm panels' only exits are `back()` → view (`:93-96`) or a successful action → view (`:114-117`, `:126`) — unchanged |
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
   - Edit button carries `aria-label={COPY.EDIT_LABEL}` and renders BOTH `aria-hidden` label spans (`EDIT_LABEL` with `min-[760px]:hidden`, `EDIT_LABEL_SHORT` with `hidden min-[760px]:inline`) inside ONE button wired to the same handler — asserted as EXACTLY ONE element matching `getByRole("button", { name: COPY.EDIT_LABEL })` per row (a duplicated visible-but-aria-hidden subtree would fail the single-button count); existing `getByRole("button", { name: COPY.EDIT_LABEL })` queries keep passing (aria-label supplies the constant accessible name — §4 contract).
   - Existing suite (view/edit/remove/state-isolation) stays green — the DOM restructure must not change semantics. Concrete failure mode caught: an accidental duplicate Edit button (two-subtree approach) would break single-button queries and double-fire handlers.
2. **Real-browser layout (new `tests/e2e/roles-settings-layout.spec.ts`, desktop-chromium project):** seed 3 `role_token_mappings` rows via the service-role helper (`tests/e2e/helpers/supabaseAdmin.ts`) mirroring the mock triple (2 grants / financial grant / empty grants — every fixture row is nominal one-line: ≤2 chips, so AC-1's compact single-line case is proven directly, chip-wrap growth is the guard case not the fixture case), `signInAs(ADMIN_FIXTURE)`, visit `/admin/settings/roles`. **Seed hygiene (global table):** in `beforeAll`, snapshot ALL existing `role_token_mappings` rows, delete them, insert the 3 fixture rows; in `afterAll`, delete the fixture rows and re-insert the snapshot verbatim — the table leaves the spec as found (row order is irrelevant: the table has a text PK and the page orders by `decided_at desc`; the guarantee assumes no concurrent external writer during the spec window, which holds — Playwright runs `workers: 1` (`playwright.config.ts:35`) and CI DBs are fresh; this protects local runs). Every helper call follows invariant-9 destructure-and-throw. Seed rows must satisfy the table CHECKs (`supabase/migrations/20260716000000_role_token_mappings.sql:4-18`): `token` uppercase/trimmed ≤64 chars, `grants ⊆ {A1,V1,L1,FINANCIALS}`, `decided_by` canonical lowercase email. Service-role writes are in-grant (`:27`).
   - **1280×900:** per row — token/chips/meta/actions cells vertically centered on one grid row (rect centers within ±0.5px of each other); token cell width 150±0.5px; actions cell right edge within ±1px of the row's CONTENT right edge, defined precisely as `liRect.right − borderRightWidth − paddingRight` read from `getComputedStyle(li)` (rects are border-box; padding at ≥760px is 14px but the assertion derives it from computed style, never hardcodes); `main` rect width 768±1px (proves the `max-w-3xl` bump). Expected values derived from measured rects and the two spec literals (150px column, 768px cap) — never from sibling hardcodes.
   - **390×900:** stacked layout — chips container top ≥ token bottom, actions top ≥ chips bottom (vertical order proof); long-label span `toBeVisible()`, short-label span `toBeHidden()`. At 1280 the inverse span-visibility pair (visible-label swap per §4's accessible-name contract; the button's accessible name is constant, so both viewports also `getByRole("button", { name: COPY.EDIT_LABEL })`).
   - **Registration:** the new spec filename MUST be added to the `desktop-chromium` `testMatch` alternation (`playwright.config.ts:70-71`) — the project matches an explicit filename list, so an unregistered spec silently never runs (known local-green/CI-dark class).
   - **Anti-tautology:** the one-line assertion compares cell rects to EACH OTHER (geometry), not to a snapshot of the classes that produce them; the 390px assertions prove the mobile card did not regress (would fail if the base classes were altered rather than the `min-[760px]:` additions).
   - **Edit-open at 1280:** click Edit (desktop label), assert panel width within ±1px of the `li` content width (col-span-4 proof) and the checkbox set renders — compound state × breakpoint.
3. **Copy hygiene:** `tests/messages/_metaCatalogCopyHygiene.test.ts` already sweeps every `roleRecognizeCopy` export and the three settings component files — `EDIT_LABEL_SHORT` and the new spans are inside its net automatically.

### Meta-test inventory

None created or extended. Reason: no new Supabase call boundary in app code (the only new Supabase calls live in the e2e seed helper, test-scope, which follows invariant-9 destructure-and-throw but is not a `lib/` helper subject to `tests/auth/_metaInfraContract.test.ts`); no advisory locks; no admin-alert codes; no sentinel-hiding text; no email normalization.

### Mutation-surface instrumentation

No new mutation surface: no new route handlers, no new server actions (existing `updateRoleTokenMapping`/`deleteRoleTokenMapping` untouched and already registered).

## 7. Acceptance criteria

- AC-1: at ≥760px viewport, each mapping row renders as one grid line `150px | chips | meta | actions` with right-aligned actions and short "Edit" label. Testable form: the §6.2 geometry assertions. Mock fidelity is a REVIEW obligation, not a byte-equality test: the invariant-8 impeccable run must side-by-side the rendered page against the mock's Desktop width section and flag divergences.
- AC-2: below 760px, the shipped stacked card layout is unchanged. Guaranteed by construction (no base/non-prefixed class is edited; the only mobile DOM change is the Edit label moving into a span that renders the identical string) and proven by: the 390px e2e assertions (stacked order + only the long-label span visible) + every EXISTING assertion in the component suite remaining green unmodified (the file itself gains additive assertions per §6.1 — no existing assertion is edited or deleted).
- AC-3: edit/confirm/saved/notice sub-rows span the full row width at both layouts; all existing behavioral tests pass unmodified except where the spec adds assertions.
- AC-4: page container is `max-w-3xl`.
- AC-5: real-browser layout spec green in CI (desktop-chromium project); invariant-8 impeccable critique + audit both run on the diff with P0/P1 fixed or DEFERRED.md-logged.
