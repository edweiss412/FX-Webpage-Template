# Crew Row Controls — per-row action menu (2026-07-19)

Owner decision (this session, 2026-07-19): approved for autonomous ship. Design mock ratified by
the user in claude.ai/design project `37c93072-6ae5-4c2d-9340-31163318c932` (file "Crew Row
Controls.dc.html"); verbatim snapshot committed at
`docs/superpowers/specs/2026-07-19-crew-row-controls-mock/crew-row-controls.dc.html`. The mock is
the visual reference; THIS document is the behavioral contract. Where they conflict, this document
wins (deviations are listed in §10).

## 1. What & why

The published-show review modal's Crew section currently shows, per row: avatar, name, subline,
call icon, email icon, and a visible "Preview as" pill link
(`components/admin/wizard/step3ReviewSections.tsx:1233-1325`). Per-member picker reset lives in a
separate Share & access control with a member `<select>`
(`app/admin/show/[slug]/PickerResetControl.tsx`). Doug has to context-switch panels to reset the
person he is looking at.

This feature moves per-member actions onto the row itself behind a three-dot "More actions" menu:

- **Preview as** — navigates to the existing preview route (menu item, replaces the visible pill).
- **Reset name picker** — in-place confirm popover → `resetCrewMemberSelection` → outcome banner
  at the top of the Crew panel.
- Call + email quick icons **stay in the row** (owner decision; mock's `showQuickCall=true`
  default, email kept beyond the mock).
- `PickerResetControl` slims to everyone-only (member select + per-member Reset removed;
  "Reset everyone's pick" stays).

## 2. Current state (live-code citations)

| Fact | Citation |
| --- | --- |
| `CrewBreakdown({ dfid, members, previewAs })`; `previewAs?: { slug: string; enabled: boolean; crewIds: readonly string[] }` | `components/admin/wizard/step3ReviewSections.tsx:1233-1243` |
| Row DOM: 44×44 interactive anchor wrapping 32px bordered visual, adjacent anchors flush | `components/admin/wizard/step3ReviewSections.tsx:1278-1305` |
| "Preview as" pill: `data-testid="admin-show-preview-as-link-${previewCrewId}"`, href `/admin/show/${slug}/preview/${crewId}` | `components/admin/wizard/step3ReviewSections.tsx:1307-1315` |
| Crew registry def forks published (`previewAs` from `s.previewRoster`) vs staged (no prop) | `components/admin/wizard/step3ReviewSections.tsx:3501-3521` |
| `PublishedSectionData` carries `showId`, `slug`, `archived`, `published`, `previewRoster?: {id,name}[]` (index-aligned with `crewMembers`) | `components/admin/review/sectionData.ts:71-82` |
| `previewRoster` built by adapter from single crew sort | `components/admin/review/publishedAdapter.ts:77` |
| Roster over `CREW_ROSTER_READ_CAP` blanks `previewRoster` (affordances hidden, rows still render) | `app/admin/_showReviewModal.tsx:314-320` |
| `CrewMemberRow` has `name`, `email: string \| null`, `phone: string \| null`, `role` | `lib/parser/types.ts:144-153` |
| `resetCrewMemberSelection(input: { showId: string; crewMemberId: string })` server action, `requireAdminIdentity`-gated; result `{ok:true,...} \| {ok:false, code}` incl. `PICKER_CREW_MEMBER_NOT_FOUND` | `lib/auth/picker/resetCrewMemberSelection.ts:52-58`, usage `app/admin/show/[slug]/PickerResetControl.tsx:178-195` |
| `resetPickerEpoch({ showId })` server action (reset-everyone) | `app/admin/show/[slug]/PickerResetControl.tsx:25,169` |
| `ARM_REVERT_MS = 4_000` (DESTRUCT-2 harmonized), `SUCCESS_DISMISS_MS = 5_000` | `app/admin/show/[slug]/PickerResetControl.tsx:29-31` |
| Confirm focus contract: C3 open-focus on Cancel, C5 close-focus back to trigger | `app/admin/show/[slug]/PickerResetControl.tsx:94-108` |
| Outcome banner pattern: persistent sr-only `role="status"` live region + decorative `aria-hidden` visible banner; errors `role="alert"`, never auto-dismissed | `app/admin/show/[slug]/PickerResetControl.tsx:199-238` |
| Admin-authored inline outcome copy carve-out (`not-subject:M5-D8`), no new §12.4 codes | `app/admin/show/[slug]/PickerResetControl.tsx:161-166` |
| Popover idiom: backdrop `<button aria-hidden tabIndex={-1}>` fixed inset-0 + `role="menu"` panel `route-enter` entrance | `components/admin/nav/UserMenu.tsx:63-79` |
| `route-enter` keyframes with `prefers-reduced-motion` guard | `app/globals.css:511-523` |
| Destructive-confirm CTA recipe (`bg-warning-text` + `text-warning-bg`) is registry-pinned | `tests/styles/_metaDestructiveConfirm.test.ts:98` (registry), matcher `tests/styles/_metaDestructiveConfirm.test.ts:112-113` |
| Modal serialization gate: reset affordances must not serialize for read-only shows; RPC is lifecycle-agnostic (`BL-RPC-RESET-SELECTION-LIFECYCLE-GUARD`) | `app/admin/_showReviewModal.tsx:341-362` |
| Preview route exists | `app/admin/show/[slug]/preview/[crewId]/page.tsx` |
| Avatar atom | `components/atoms/Avatar.tsx` (imported at `step3ReviewSections.tsx:128`) |

Existing tests that pin the current DOM (must be updated, not deleted):
`tests/admin/pickerResetControl.test.tsx`, `tests/app/admin/showReviewModalLoader.test.tsx`
(preview-as testid), `tests/components/admin/showpage/sectionWarningControls.test.tsx` (preview-as
testid), `tests/components/admin/wizard/noOverrideRows.test.tsx:19,37-40` (CrewBreakdown render),
`tests/styles/_metaDestructiveConfirm.test.ts:98`. Help copy:
`app/help/admin/per-show-panel/page.mdx:9,55-67`, `app/help/admin/preview-as-crew/page.mdx:5`.
No `tests/e2e/*` spec references `preview-as-link`, `breakdown-crew`, or `picker-reset` testids
(verified by grep 2026-07-19).

## 3. Scope

**In scope**

1. New client component `components/admin/wizard/CrewRowActions.tsx`: the per-row action cluster
   (call icon, email icon, three-dot trigger, menu popover, confirm popover).
2. `CrewBreakdown` published-mode wiring: replace `previewAs` prop with
   `actions?: { showId: string; slug: string; enabled: boolean; crewIds: readonly string[] }`;
   hold the single-open-menu state + outcome banner state; render the banner at panel top.
3. Registry crew def passes `showId`/`slug` from `PublishedSectionData`
   (`step3ReviewSections.tsx:3510-3517`).
4. `PickerResetControl` slimmed to everyone-only.
5. Test updates + new tests (§8), destructive-confirm registry row, help-copy updates (§9).

**Out of scope**

- Staged mode: byte-identical render (no menu, no icons change — staged rows today already render
  call/email icons and no preview pill; that exact DOM is preserved).
- Relocating "Reset everyone's pick" out of Share & access.
- `ResetPickerEpochButton.tsx` (already superseded by PickerResetControl; untouched).
- Any DB/RPC/migration change. Both server actions exist and are already
  observability-registered; no new mutation surface is created (client call sites only).
- The mock's `dotsOrientation`/`showQuickCall` knobs are **mock-explorer affordances, not
  shipped flags** (see §7 flag table). Shipped behavior is fixed: vertical dots, quick icons on.

## 4. Behavior contract

### 4.1 Row anatomy (published mode, `actions.enabled && crewIds[i]` non-empty)

Left→right: `Avatar` · name/subline block (unchanged) · action cluster
(`relative flex shrink-0 items-center`):

1. **Call icon** — unchanged from today (`tel:` anchor, 44×44 hit, 32px visual) when
   `hasContent(m.phone)`.
2. **Email icon** — unchanged (`mailto:`) when `hasContent(m.email)`.
3. **Three-dot trigger** — `<button type="button" aria-haspopup="menu" aria-expanded={open}
   aria-label={"More actions for " + name}>`, 44×44 hit area wrapping a 32px bordered visual
   (same idiom as siblings), `data-testid="crew-row-menu-button-${crewId}"`. Dots are the
   lucide `EllipsisVertical` glyph (vertical — owner decision). Open state: visual flips to
   `bg-surface-sunken`, `border-border-strong`, `text-text-strong` (mock's open tint).

Rows WITHOUT a persisted crew id (`crewIds[i]` empty — e.g. roster over cap, or id gap) and all
staged rows render **no trigger** (call/email icons only — exactly today's DOM).

### 4.2 Menu popover

- Anchored `absolute top-[calc(100%+6px)] right-0 z-30 min-w-52` inside the cluster's `relative`
  wrapper; `rounded-md border border-border bg-surface-raised p-1.5 shadow-lg route-enter`;
  `role="menu"`, `data-testid="crew-row-menu-${crewId}"`.
- Items (each `role="menuitem"`, full-width, 13px/medium, `hover:bg-surface-sunken`, icon 16px
  `text-text-subtle`):
  1. **Preview as** — `<Link>` to
     `/admin/show/${encodeURIComponent(slug)}/preview/${encodeURIComponent(crewId)}`, keeps
     `data-testid="admin-show-preview-as-link-${crewId}"` (test/help continuity). Eye icon.
     Clicking closes the menu (navigation proceeds).
  2. divider (`h-px bg-border mx-1.5 my-1`)
  3. **Reset name picker** — button, RefreshCw icon → confirm popover (4.3).
- One menu open across the whole section (single `openCrewId` state in `CrewBreakdown`).
  Toggling another row's trigger closes the first and opens the second.
- Close paths: trigger re-click; outside click (fixed-inset backdrop button,
  `aria-hidden tabIndex={-1}`, `z-20`, UserMenu idiom); `Escape` (keydown on cluster); menu-item
  activation. Esc/outside-click/trigger-toggle restore focus to that row's trigger.

### 4.3 Confirm popover (destructive confirm)

- Replaces the menu in the same anchored position (`w-[268px]` panel, same border/bg/shadow/
  `route-enter`); `role="group"` with `aria-label="Confirm resetting this crew member's picker
  selection"`; `data-testid="crew-row-reset-confirm-${crewId}"`.
- Content: heading "Reset name picker" (13px semibold), warning
  `"${name} will choose their name again on their next visit."` (12px `text-text-subtle`,
  id wired to `aria-describedby` on the CTA), actions right-aligned:
  **Cancel** (neutral: `border border-border bg-surface`) and **Confirm reset**
  (`bg-warning-text text-warning-bg` — the pinned destructive recipe; requires a new
  `_metaDestructiveConfirm` registry row for `CrewRowActions.tsx`).
- Focus: opens with **Cancel** focused (C3); Cancel/auto-revert restores focus to the row trigger
  (C5). Confirm-resolve path does not restore (outcome banner announces; matches
  PickerResetControl's restore-only-on-cancel semantics, `PickerResetControl.tsx:81-108`).
- Auto-revert: **4s** (`ARM_REVERT_MS` harmonization, DESTRUCT-2) — timer from confirm-open;
  fires → popover closes fully (back to closed, NOT back to menu). Any of Cancel / outside click /
  Esc also closes fully. Deviation from mock noted in §10.
- Confirm → `resolving`: both buttons `disabled` + CTA `aria-busy`, label "Resetting…";
  on settle the popover closes and the outcome banner renders.

### 4.4 Server call & outcomes

`resetCrewMemberSelection({ showId, crewMemberId })` inside `useTransition`. Outcome copy is
admin-authored inline (same `not-subject:M5-D8` rationale + comment as
`PickerResetControl.tsx:161-166`; **no new §12.4 codes**):

- ok → `` `Reset ${name}. They'll pick again next visit.` ``
- `PICKER_CREW_MEMBER_NOT_FOUND` → "That crew member is no longer on the roster, so there's
  nothing to reset. Refresh to see the current roster."
- any other non-ok → "Couldn't reset the picker. Please try again."

### 4.5 Outcome banner (panel-top toast)

Rendered by `CrewBreakdown` above the `<ul>`, PCR-1 pattern verbatim
(`PickerResetControl.tsx:199-238`):

- Persistent sr-only `role="status" aria-live="polite"` region (success text only).
- Visible success banner `aria-hidden="true"`, `data-testid="crew-row-reset-ok"`
  (`bg-surface-raised` row, accent ✓, 13px) — auto-dismisses after **5s** (`SUCCESS_DISMISS_MS`).
- Error banner `role="alert"`, `data-testid="crew-row-reset-error"`
  (`bg-warning-bg text-warning-text`) — persists until replaced or section unmounts.
- Starting a new confirm clears any prior outcome (mirror `enterConfirm`,
  `PickerResetControl.tsx:133-141`).

### 4.6 Slimmed `PickerResetControl`

- Remove: `Scope` type + `scope` state, member `<select>`, per-member Reset button,
  `resetCrewMemberSelection` import, member-outcome branches, `onSelectChange` compound guard.
- Keep (testids unchanged): heading (now always "Reset everyone's pick"), description copy
  becomes "Make everyone pick their name again on their next visit." / empty-roster
  "No crew to reset yet."; `picker-reset-all-button` trigger (styling may promote from underline
  link to the neutral bordered button since it is now the control's only action);
  `picker-reset-confirm-row`/`-confirm-button`/`-cancel-button` two-tap confirm with 4s
  auto-revert + C3/C5 focus; `picker-reset-ok`/`picker-reset-error` banners + sr-only region.
- Props: keep `{ showId, crew }` (crew drives `hasCrew` disable) — call-site in
  `app/admin/_showReviewModal.tsx:362` unchanged.

## 5. Guard conditions (every prop/input)

| Input | null/empty/edge | Renders |
| --- | --- | --- |
| `actions` absent (staged) | — | Today's exact row DOM (call/email icons only). Byte-identical. |
| `actions.enabled === false` (archived/unpublished) | — | No trigger, no preview item anywhere; icons only. |
| `actions.crewIds[i]` empty string / index gap (`?? ""`) | roster blanked over cap, adapter gap | No trigger for that row; icons only. |
| `m.phone` null/blank | `hasContent` guard | No call icon (unchanged). |
| `m.email` null/blank | `hasContent` guard | No email icon (unchanged). |
| `m.name` empty | existing `name \|\| "Unnamed"` | aria-labels + warning copy use "Unnamed". |
| `members` empty | — | "No crew parsed." (unchanged); no banner state. |
| `members.length > CREW_CAP` | existing cap | Overflow note unchanged; menus only on shown rows. |
| Reset while member deleted server-side | `PICKER_CREW_MEMBER_NOT_FOUND` | Error banner (4.4). |
| Unmount mid-timer (modal closes) | — | All timers cleared in effect cleanup; no setState-after-unmount. |

## 6. Mode boundaries & transition inventory

Modes: **staged** (no cluster changes at all) vs **published** (cluster per 4.1). Shared between
modes: avatar, name/subline, call/email icons, cap/overflow note, empty state.

Per-row control state machine: `closed` → `menu` → `confirm` → (`resolving`) → `closed`, plus
section-level `outcome` banner. Pairs (N=3 visual states + banner):

| From → To | Treatment |
| --- | --- |
| closed → menu | `route-enter` entrance (reduced-motion guarded). |
| menu → closed | Instant unmount — no exit animation (matches UserMenu; AnimatePresence not used in this module). |
| menu → confirm | Menu unmounts, confirm mounts with `route-enter`. Instant swap otherwise. |
| confirm → closed (cancel/Esc/outside/auto-revert/settle) | Instant unmount. |
| confirm → menu | **Unreachable** — cancel closes fully (§4.3); no back-navigation. |
| closed → confirm | Unreachable (confirm only via menu). |
| banner show/hide | Instant mount/unmount (matches PCR banners). |

Compound transitions:

- Open row B's menu while row A's menu/confirm open → A closes fully (state is single
  `openCrewId`+`mode`), B's menu enters. A's auto-revert timer cleared.
- Trigger re-click while confirm open → full close (toggle semantics), timer cleared.
- Auto-revert fires while `resolving` → no-op (functional guard: only `confirm` → closed, mirror
  `PickerResetControl.tsx:88-89`).
- Success banner visible while a new menu opens → banner stays (independent state) but a new
  confirm-open clears it (§4.5).
- Section unmount (modal dismiss) mid-anything → cleanup clears both timers.

## 7. Flag lifecycle table

| Flag | Storage | Write path | Read path | Effect |
| --- | --- | --- | --- | --- |
| mock `dotsOrientation` | none (not shipped) | — | — | Fixed: vertical dots. Not a prop. |
| mock `showQuickCall` | none (not shipped) | — | — | Fixed: quick icons always render (with per-field guards). No "Call/Email" menu items ship (they existed in the mock only for the quick-call-off variant). |
| `actions.enabled` | derived per render (`published && !archived`) | registry def `step3ReviewSections.tsx:3515` | `CrewRowActions` render gate | Hides trigger + preview item on read-only shows (serialization-gate parity §2). |

No zombie flags introduced.

## 8. Testing

Unit (RTL, jsdom — behavior only, no layout claims):

- `tests/components/admin/wizard/crewRowActions.test.tsx` (new): menu open/close paths (trigger
  toggle, outside click, Esc, item activation); single-open across rows; confirm flow happy path
  (mock `resetCrewMemberSelection` module) asserting the **action was called with
  `{showId, crewMemberId}` from fixture-derived ids** (anti-tautology: expected id comes from the
  fixture's `crewIds[i]`, not a hardcoded literal); `PICKER_CREW_MEMBER_NOT_FOUND` → error banner
  text; generic failure → generic banner; 4s auto-revert (fake timers) closes confirm and a
  post-revert Confirm click cannot fire the action (concrete failure mode: stale confirm firing);
  C3/C5 focus (`vi.waitFor` per async-focus lesson); sr-only region receives success text; new
  confirm clears prior outcome; no-trigger render for `enabled:false` / empty crewId / staged
  (assert DOM equality of the cluster against a no-`actions` render — pins byte-identical claim).
- `tests/admin/pickerResetControl.test.tsx`: rewrite to everyone-only surface (select/member
  branches deleted; all/confirm/cancel/banners/focus retained).
- `tests/app/admin/showReviewModalLoader.test.tsx` + `tests/components/admin/showpage/sectionWarningControls.test.tsx`:
  preview-as assertions now open the row menu first, then assert
  `admin-show-preview-as-link-*` href unchanged.
- `tests/components/admin/wizard/noOverrideRows.test.tsx`: unchanged expectation, re-run.

Structural/meta:

- `tests/styles/_metaDestructiveConfirm.test.ts`: add
  `R("components/admin/wizard/CrewRowActions.tsx", 0, "panel", "crew-row-reset-confirm-go")`
  row (index 0 — the file contains exactly one recipe line).
- Meta-test inventory declaration: destructive-confirm registry (extended); mutation-surface
  observability (NOT extended — no new server action / route; `resetCrewMemberSelection` +
  `resetPickerEpoch` already covered); Supabase call-boundary registry (N/A — no new Supabase
  call site); sentinel-hiding (N/A); advisory-lock topology (N/A — no `pg_advisory*` in diff).

Real-browser (Playwright, extends `tests/e2e/_publishedReviewModalHarness.tsx` +
`published-review-modal.interactions.spec.ts` or a sibling spec):

- Menu popover opens inside the modal without being clipped: `getBoundingClientRect()` of
  `crew-row-menu-*` fully within viewport and intersecting the modal scroll container's visible
  box; z-order above adjacent rows (elementFromPoint on menu center resolves to a menu
  descendant — viewport coords per `reference_playwright_elementfrompoint_viewport_coords`).
- Trigger hit area: `crew-row-menu-button-*` bounding box ≥ 44×44 (±0.5px).
- Esc + outside-click close with focus restored to trigger (real focus, not jsdom).
- Confirm CTA visible + clickable within the modal (no overflow clipping at the last visible row:
  run the assertion on the LAST crew row, where `top: calc(100%+6px)` is most likely to clip).

## 9. Docs & copy

- `app/help/admin/per-show-panel/page.mdx:9` ("each row has a **Preview as** link") and `:55-67`
  (Preview-as section + "Reset name picker" description) updated: row actions live under the
  row's **⋮ menu** (Preview as, Reset name picker); Share & access retains **Reset everyone's
  pick** only.
- `app/help/admin/preview-as-crew/page.mdx:5`: "the **Preview as** action" → reached via the
  row's ⋮ menu.
- No screenshot regeneration in this PR: help screenshots are byte-pinned to the x64 CI capture
  environment; copy edits here do not reference new imagery. If the screenshots-drift job flags
  affected shots, defer regeneration to the standard drift workflow (non-required check).

## 10. Deviations from the mock (ratified here)

1. Email icon kept in the row (owner decision; mock omitted it).
2. Confirm popover auto-reverts after 4s (DESTRUCT-2 harmonization; mock had no auto-revert).
3. Cancel closes fully rather than returning to the menu (matches two-tap idiom everywhere else;
   mock's `cancelReset` returned to `mode:"menu"` but with the menu unmounted the visual result
   was ALSO closed-with-overlay; full close is the strictly cleaner state machine).
4. "Preview as" is a real `<Link>` navigation; the mock's toast-on-preview was simulation only.
5. Menu entrance uses the project's `route-enter` (reduced-motion-guarded) instead of the mock's
   bespoke `crewMenuPop`; open-state tint via tokens instead of hex.
6. Reset outcome renders as the panel-top banner pair (sr-only + visible, PCR-1) rather than a
   bare visual toast — a11y parity with the existing control.

## 11. Numeric sweep (single sources)

44/32 px hit/visual (row idiom, §2 row 2) · 4s `ARM_REVERT_MS` · 5s `SUCCESS_DISMISS_MS` ·
`CREW_CAP` unchanged · z-order: backdrop `z-20`, popovers `z-30` (mock parity; UserMenu uses
10/20 in the nav — different stacking context, no conflict) · menu `min-w-52` (208px) · confirm
`w-[268px]`. Each appears once above; no other section restates them.
