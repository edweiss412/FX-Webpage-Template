# Phase 6 — Visibility UI (Tasks 14–18) — Opus-owned

Invariant 8 (impeccable v3 dual-gate) applies to every file under `components/` and `app/` (non-api) touched here; the dual-gate runs at close-out (Task 22) before the whole-diff Codex review.

---

### Task 14: `DevToolsRow` runtime `isDeveloper` prop

Spec §6 row 4. `components/admin/settings/DevToolsRow.tsx:22` (`if (!DEV_PANEL_PRESENT) return null;`, props `{ icon?: ReactNode } = {}`).

**Files:** Modify `components/admin/settings/DevToolsRow.tsx`; Modify `tests/components/settings/DevToolsRow.test.tsx` (or create).

- [ ] **Step 1: Failing test** — with `DEV_PANEL_PRESENT` mocked true: `<DevToolsRow isDeveloper={false} />` renders null; `<DevToolsRow isDeveloper={true} />` renders the row. With `DEV_PANEL_PRESENT` false: renders null regardless of `isDeveloper`.

- [ ] **Step 2: Fails → Step 3: implement** — add `isDeveloper?: boolean` to props; guard `if (!DEV_PANEL_PRESENT || !isDeveloper) return null;`.

- [ ] **Step 4: green → Step 5: commit**

```bash
git add components/admin/settings/DevToolsRow.tsx tests/components/settings/DevToolsRow.test.tsx
git commit --no-verify -m "feat(admin): DevToolsRow runtime isDeveloper gate"
```

---

### Task 15: Nav — `developerOnly` flag + `AdminNav` filter + layout wiring

Spec §6 row 8. `components/admin/nav/navConfig.ts`: `NavItem` type (`:4-14`), observability entry (`:43-50`). `components/admin/nav/AdminNav.tsx`: `NAV.filter(!desktopOnly)` (`:45`), `NAV.filter(!mobileOnly)` (`:80`). `app/admin/layout.tsx` renders `AdminNav` and holds the admin identity.

**Files:** Modify `navConfig.ts`, `AdminNav.tsx`, `app/admin/layout.tsx`; Create `tests/components/nav/AdminNav-developer.test.tsx`.

- [ ] **Step 1: Failing test** — render `AdminNav` with `viewerIsDeveloper={false}` → the `observability` (Activity) item is absent from BOTH the mobile and desktop lists; with `viewerIsDeveloper={true}` → present (subject to existing mobile/desktop rules). Non-`developerOnly` items are unaffected either way.

- [ ] **Step 2: Fails → Step 3: implement**
  - `NavItem` type: add `developerOnly?: true;`.
  - observability entry: add `developerOnly: true`.
  - `AdminNav`: accept a new prop `viewerIsDeveloper: boolean`; add `.filter((item) => !item.developerOnly || viewerIsDeveloper)` to BOTH the mobile (`:45`) and desktop (`:80`) filter chains.
  - `app/admin/layout.tsx`: compute `const viewerIsDeveloper = await isCurrentUserDeveloper();` (import from `@/lib/auth/requireDeveloper`) — run it in parallel with the existing identity read (`Promise.all`) — and pass `viewerIsDeveloper` to `<AdminNav>`.

- [ ] **Step 4: green → Step 5: commit**

```bash
git add components/admin/nav app/admin/layout.tsx tests/components/nav/AdminNav-developer.test.tsx
git commit --no-verify -m "feat(admin): hide developer-only nav items from normal admins"
```

---

### Task 16: Settings page — gate Maintenance + Diagnostics; pass `isDeveloper`

Spec §6 "Settings page net effect". `app/admin/settings/page.tsx`: `requireAdminIdentity():79`, Maintenance section `:224-271` (`data-testid="admin-settings-maintenance-section"`), Diagnostics `:277-311`, `DevToolsRow` `:215`, and it renders `AdministratorsSection` (`:141-145` region).

**Files:** Modify `app/admin/settings/page.tsx`; Create `tests/app/admin/settings-developer-visibility.test.tsx`.

- [ ] **Step 1: Failing test** — mock `isCurrentUserDeveloper`:
  - `false` → the page does NOT render the Maintenance section (`admin-settings-maintenance-section` absent) NOR the Diagnostics section (`admin-settings-diagnostics-section` absent); `DevToolsRow` gets `isDeveloper={false}`; `AdministratorsSection` gets `viewerIsDeveloper={false}`.
  - `true` → both sections render; flags passed `true`.

- [ ] **Step 2: Fails → Step 3: implement**
  - Add `const isDeveloper = await isCurrentUserDeveloper();` to the page's existing `Promise.all` read batch (parallel with `getSettingsPageFlags`/`fetchDriveConnectionHealth`/`fetchEmbeddedAdminEmails`).
  - Wrap the Maintenance `<section>` (`:224`) and Diagnostics `<section>` (`:277`) in `{isDeveloper && ( … )}`.
  - `<DevToolsRow icon={…} isDeveloper={isDeveloper} />`.
  - `<AdministratorsSection … viewerIsDeveloper={isDeveloper} />`.

- [ ] **Step 4: green → Step 5: commit**

```bash
git add app/admin/settings/page.tsx tests/app/admin/settings-developer-visibility.test.tsx
git commit --no-verify -m "feat(admin): gate settings Maintenance/Diagnostics + dev tools on isDeveloper"
```

---

### Task 17: Administrators deep-link page — thread `viewerIsDeveloper`

Spec §6 "Administrators deep-link page" (R6). `app/admin/settings/admins/page.tsx` renders `AdministratorsSection` with `result`/`actorCanonicalEmail`/`now` (no `viewerIsDeveloper`); `requireAdminIdentity()` at `AdminsPage`.

**Files:** Modify `app/admin/settings/admins/page.tsx`; Create `tests/app/admin/admins-page-developer.test.tsx`.

- [ ] **Step 1: Failing test** — mock `isCurrentUserDeveloper`; assert `AdministratorsSection` receives `viewerIsDeveloper` matching the mock on the deep-link page (both `true` and `false` cases).

- [ ] **Step 2: Fails → Step 3: implement** — compute `const viewerIsDeveloper = await isCurrentUserDeveloper();` after `requireAdminIdentity()` and pass it into `<AdministratorsSection … viewerIsDeveloper={viewerIsDeveloper} />`.

- [ ] **Step 4: green → Step 5: commit**

```bash
git add app/admin/settings/admins/page.tsx tests/app/admin/admins-page-developer.test.tsx
git commit --no-verify -m "feat(admin): thread viewerIsDeveloper on Administrators deep-link page"
```

---

### Task 18: `AdministratorsSection` + `DeveloperToggleButton` (the toggle)

Spec §7 (component). `AdministratorsSection.tsx`: props `{ result, actorCanonicalEmail, now }` (`:32-40`); `AdminRow` sub-component (`:145`, `{ row, isActor, now }`) renders email, added-line, note, "You" badge, and `{isActor ? null : <RevokeRowButton .../>}` (`:175`); `RevokedRow` (`:180`). `AdminEmailRow` now has `is_developer` (Task 7).

**Files:** Modify `components/admin/settings/AdministratorsSection.tsx`; Create `components/admin/settings/DeveloperToggleButton.tsx`; Create `tests/components/settings/AdministratorsSection-developer.test.tsx`.

**Transition Inventory (spec §13) — DeveloperToggleButton states:** `off`, `on`, `pending` (optimistic, action in flight), `locked` (actor's own row). Each `AdminRow` owns its own `useActionState`, so compound transitions (toggle A while B pending) are independent.

- [ ] **Step 1: Failing test** —
  - `viewerIsDeveloper={false}` → NO developer control or badge on any row (Doug's view unchanged);
  - `viewerIsDeveloper={true}`, non-actor row → an interactive `DeveloperToggleButton` reflecting `row.is_developer`;
  - `viewerIsDeveloper={true}`, actor's own row (`isActor`) → a **locked** developer indicator (not an actionable toggle; you cannot demote yourself);
  - toggling a non-actor row invokes `setDeveloperAction` with `email` + `is_developer` flipped;
  - on `{kind:"self_developer_demote_forbidden"}` / `{kind:"infra_error"}` results, the row renders `getDougFacing("SELF_DEVELOPER_DEMOTE_FORBIDDEN")` / `getDougFacing("ADMIN_EMAIL_WRITE_FAILED")` inline (invariant 5, no raw codes).

- [ ] **Step 2: Fails → Step 3: implement**
  - `DeveloperToggleButton.tsx` (`"use client"`): a switch styled to match the existing toggle controls (mirror `NotifyToggle`'s switch classes; ≥ `min-h-tap-min` tap target); bound to `setDeveloperAction` via `useActionState`; optimistic `pending` disabled state; renders inline cataloged copy via `getDougFacing` on error results; a `locked` (disabled) variant for the actor's own row.
  - `AdministratorsSection`: add `viewerIsDeveloper: boolean` to props (default `false`); thread into `AdminRow`; in `AdminRow`, after the existing controls, render `{viewerIsDeveloper ? (isActor ? <DeveloperToggleButton locked checked={row.is_developer} /> : <DeveloperToggleButton email={row.email} checked={row.is_developer} />) : null}`.

- [ ] **Step 4: green → Step 5: commit**

```bash
git add components/admin/settings/AdministratorsSection.tsx components/admin/settings/DeveloperToggleButton.tsx tests/components/settings/AdministratorsSection-developer.test.tsx
git commit --no-verify -m "feat(admin): per-row Developer toggle in Administrators (developer-gated)"
```

---

### Task 18b: Layout-dimensions assertion (real browser)

Spec §13 Dimensional Invariants (Tailwind v4 has no default `items-stretch`). jsdom is insufficient.

**Files:** Create `tests/e2e/developer-toggle-layout.spec.ts` (Playwright) OR a chrome-devtools `evaluate_script` step against a rendered harness.

- [ ] **Step 1: Write the assertion** — render `AdministratorsSection` (developer view, ≥1 non-actor row) in a real browser; `getBoundingClientRect()` on the `DeveloperToggleButton`'s tap target (`data-testid="developer-toggle"`) and assert (a) `height >= 44` and `width >= 44` (min tap), (b) the toggle's row height equals the sibling controls' row height within 0.5px (no collapse). Use the standalone real-browser harness pattern (tailwind CLI + static HTML + Playwright `getComputedStyle`/`getBoundingClientRect`) from `tests/e2e/` if present.

- [ ] **Step 2: run → green → Step 3: commit**

```bash
git add tests/e2e/developer-toggle-layout.spec.ts
git commit --no-verify -m "test(admin): real-browser layout invariants for Developer toggle"
```

---

### Task 18c: Transition audit

Spec §13 Transition Inventory + AGENTS.md transition-audit task.

**Files:** Create `tests/components/settings/DeveloperToggle-transitions.test.tsx`.

- [ ] **Step 1: Write** — enumerate every conditional/ternary render in `DeveloperToggleButton` + the `AdminRow` toggle block; assert: off→pending→on and on→pending→off disable during pending; error result reverts optimistic state and shows cataloged copy; `locked` (actor) is instant/static; the whole control is absent (server-side) for `viewerIsDeveloper=false` (no client transition). **Compound:** toggling row A while row B is mid-pending leaves B's state intact (independent `useActionState`).

- [ ] **Step 2: green → Step 3: commit**

```bash
git add tests/components/settings/DeveloperToggle-transitions.test.tsx
git commit --no-verify -m "test(admin): Developer toggle transition + compound-state audit"
```
