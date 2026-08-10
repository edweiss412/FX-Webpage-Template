# Admin dashboard row actions — design

**Date:** 2026-08-09 · **Ledger:** `BL-ADMIN-DASHBOARD-ROW-ACTIONS` (BACKLOG.md) · **Branch:** `feat/admin-dashboard-row-actions`

## §0 Summary

Surface the four master-spec §9.1 per-row actions — Open · Preview as · Re-sync · Archive — on the dashboard's Active-shows rows, via `ShowsTable`'s existing `rowAction` slot. **Pure UI surfacing:** every mutation this feature triggers already ships, is already advisory-locked, and is already telemetry-registered. No migration, no new RPC, no new mutation surface, no new lock holder.

The backlog entry predates M12.2 and is stale on three counts, corrected here: (a) the row renderer is `components/admin/ShowsTable.tsx` (no component named ActiveShowsPanel exists in the tree); (b) Archive shipped in full in M12.2 Phase B2 — `public.archive_show(uuid)` RPC with in-RPC advisory lock (`supabase/migrations/20260601000000_b2_show_lifecycle.sql`, `pg_advisory_xact_lock(hashtext('show:' || v_drive))`), server action `app/admin/show/[slug]/_actions/archive.ts` (`archiveShowAction`), registered in `AUDITABLE_MUTATIONS` (the archive rows in `tests/log/_auditableMutations.ts`); (c) `shows` carries BOTH `archived boolean` (legacy filter column, 3 live `.eq("archived", false)` sites) and `archived_at timestamptz` (B2 lifecycle) — no schema work is needed or performed.

## §1 Resolved scope — do not relitigate

1. **No new mutation surface (invariant 10).** Re-sync reuses `POST /api/admin/sync/[slug]` (`app/api/admin/sync/[slug]/route.ts`, `logAdminOutcome({ code: "SHOW_SYNCED_MANUAL" })`, registered in `tests/log/_auditableMutations.ts`); Archive reuses `archiveShowAction` (registered in the same file's archive rows). The dashboard adds CALLERS of registered surfaces, which requires no registry rows — the registry keys on the surface, not the call site.
2. **No new advisory-lock holder (invariant 2).** Sync's lock is JS-side (`lib/sync/runManualSyncForShow.ts` injects `withShowLock`); archive's is in-RPC (`archive_show`). Both single-holder topologies are shipped and pinned; this feature adds zero lock code. The plan restates the two holders verbatim as its invariant-2 enumeration.
3. **Held/Publishing rows hide Re-sync, Archive, and Preview-as** — HARD CONSTRAINT from master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§9.1 region, "dashboard MUST hide" sentence; the actions row itself is the `| Actions | Open · Preview as · Re-sync · Archive |` table line). The server side already enforces via 409 `FINALIZE_OWNED_SHOW`; the UI hides rather than disables. The existing Held/"Publishing…" pill (M12.2 `finalizeOwned` split) IS the required static badge — this spec does not add a second one.
4. **Threat/UX fence:** actions are admin-only surfaces behind the admin layout; no crew-facing change. The archived-bucket rows (`ArchivedShowRow`, which already carries Unarchive) are OUT of scope — this feature touches the active-segment table only.
5. **Reuse the shipped action contracts unchanged.** No edits to `archiveShowAction`, the sync route, `archive_show`, or `ReSyncButton`/`ArchiveShowButton` (the per-show page keeps them). The dashboard gets a NEW compact row-level component that calls the same contracts.
6. **`rowAction` slot is the mount mechanism.** `ShowsTable.tsx` renders `rowAction(row)` as a SIBLING of the row `<Link>` (`data-testid` `shows-row-action-<slug>`; comment at the site: interactive control inside an anchor is invalid HTML). The Dashboard mount currently passes no `rowAction`, so the slot is free; the slot's single-node contract is unchanged.

## §2 Current state (live-code citations, verified 2026-08-09 by investigator + direct greps)

- Row renderer: `components/admin/ShowsTable.tsx` (~678 lines), props at `components/admin/ShowsTable.tsx:40-61` incl. `rowAction?: (row: ActiveShowRow) => ReactNode`; row render `components/admin/ShowsTable.tsx:518-636`; whole row wrapped in `<Link href={openHref(row.slug)}>` at `components/admin/ShowsTable.tsx:528`; rowAction slot `components/admin/ShowsTable.tsx:627-634`. Mounted at `components/admin/Dashboard.tsx` (ShowsTable JSX, no `rowAction` passed today).
- `ActiveShowRow` (`lib/admin/showDisplay.ts:21`): `id, slug, title, showDateStart/End, crewCount, lastSyncedAt/Status, lastCheckedAt, published, isLive, finalizeOwned, archivedAt, dataGaps?, rosterShift?, …` — carries a crew COUNT, not a crew list.
- Re-sync: `components/admin/ReSyncButton.tsx` POSTs `/api/admin/sync/${slug}`; handler `app/api/admin/sync/[slug]/route.ts` (requireAdmin + requireAdminIdentity, post-commit `logAdminOutcome`).
- Archive: `components/admin/ArchiveShowButton.tsx` mounted in `components/admin/showpage/ShareHub.tsx`; calls `archiveShowAction` (`app/admin/show/[slug]/_actions/archive.ts`); RPC `archive_show` at `supabase/migrations/20260601000000_b2_show_lifecycle.sql` (in-RPC lock, `is_admin()` gate, idempotent re-read, `FINALIZE_OWNED_SHOW` raise).
- Preview-as: route `app/admin/show/[slug]/preview/[crewId]/page.tsx` exists; the ONLY in-app link is the wizard's `components/admin/wizard/CrewRowActions.tsx` — neither the dashboard nor the per-show admin page links it.
- Help: `app/help/admin/dashboard/page.mdx` — no four-action list; its "You archive from a show’s own page…" sentence becomes stale-by-omission when the dashboard gains Archive.
- Master spec §9.1: actions table row + the published=false hide rule (§1.3 above).

## §3 Design

### 3.1 Component

New client component `components/admin/ShowRowActions.tsx`, mounted by `Dashboard.tsx` via `rowAction={(row) => <ShowRowActions row={row} />}` on the ACTIVE bucket's ShowsTable only.

Rendered affordance: a single kebab (⋮) menu button per row — `min-h-tap-min`/`min-w-tap-min` tap target, `aria-label` "Actions for <title>", `aria-haspopup="menu"`, `aria-expanded` — opening a popover menu (same popover pattern family as `components/admin/AppHealthPopover.tsx`; the plan names the concrete primitive after reading it). One button, because the row is dense and mobile-first; four inline buttons per row fail the tap-target grid on 390px.

Menu items (44px rows, icons + labels, canonical tokens):

| Item | Published row | Held/Publishing row | Behavior |
| --- | --- | --- | --- |
| Open | ✓ | ✓ | `<Link href>` to `/admin/show/[slug]` (same target as the row Link; explicit affordance per §9.1) |
| Preview as… | ✓ (disabled when no crew) | HIDDEN | submenu/section listing crew members → `/admin/show/[slug]/preview/[crewId]` |
| Re-sync | ✓ | HIDDEN | POST `/api/admin/sync/${slug}`; pending state in the menu item; result surfaced per §3.4 |
| Archive | ✓ | HIDDEN | two-step confirm inside the menu (item → confirm row), then `archiveShowAction(showId)` |

Guard conditions: `crewCount === 0` or missing crew list → "Preview as…" renders disabled with helper text "No crew on this show yet." `row.title === null` → aria-label falls back to the slug. Any action while a previous action is pending → menu items disabled (single in-flight action per row).

### 3.2 Preview-as crew source

`ActiveShowRow` gains OPTIONAL `crew?: { id: string; name: string | null }[]`. The dashboard loader (`fetchDashboardData` — the same code that computes `crewCount`; plan cites exact lines) populates it for active PUBLISHED rows from the identical `crew_members` query it already issues, widened from a count to `id, name` (bounded: active shows only). Producers that omit the field change nothing — `ShowsTable` passes the row through; only `ShowRowActions` reads it (mirrors the `dataGaps?` optional-field precedent). **Cap:** the submenu lists at most 12 crew, then a "… and N more (open the show)" item linking to `/admin/show/[slug]` (cap/truncation rule; a 40-person crew must not render a 40-item submenu). Name `null` renders the established unnamed-crew fallback used by the wizard roster (plan verifies the exact string).

### 3.3 Published=false and race behavior

UI: `row.published === false` → menu contains Open only (§1.3). No second badge — the existing pill communicates state.
Race (row flips to finalize-owned after render, admin fires Re-sync/Archive): the server returns 409 `FINALIZE_OWNED_SHOW`; the UI surfaces the catalog copy for that code via `lib/messages/lookup.ts` (invariant 5 — no raw codes). No optimistic UI: rows re-render from the server refresh after action completion (`router.refresh()`, matching `ReSyncButton`'s established completion contract; plan verifies).

### 3.4 Result surfacing

Re-sync and Archive reuse the semantics their per-show buttons established: pending spinner in place, success → `router.refresh()` (row's sync cell / bucket updates), failure → inline error line inside the menu region reading catalog copy by code, `role="status"` announcement (a11y announce pattern per the feed-buttons precedent; the plan runs the announce-region checklist). The menu stays open on failure (the admin reads the error), closes on success.

### 3.5 Transition inventory (component states)

States: closed / open / open+pending / open+error / confirm-step (Archive). Pairs:

| Transition | Treatment |
| --- | --- |
| closed → open | popover pattern default (instant or ≤150ms fade per the popover primitive; whatever `AppHealthPopover` does — consistency wins) |
| open → closed (dismiss/success) | same as primitive |
| open → open+pending | instant swap of item content to spinner; other items disable |
| open+pending → open+error | instant; error line appears, `role="status"` announces |
| open+pending → closed (success) | close after `router.refresh()` resolves |
| open → confirm-step (Archive) | instant in-place swap of the Archive row |
| confirm-step → open (cancel) | instant |
| compound: row unmounts (bucket flip after archive) while menu open | menu unmounts with row — acceptable, the action that caused it succeeded; no orphaned portal (plan asserts the popover is row-scoped, not body-portal, OR is dismissed before refresh) |
| compound: server refresh re-renders row while menu open (background revalidate) | menu closes (row identity re-mounts) — accepted; noted so the e2e doesn't flake on it |

### 3.6 Help doc

`app/help/admin/dashboard/page.mdx`: add a short "Row actions (⋮)" paragraph documenting the four actions and the Held-rows rule; rewrite the archive sentence to name both paths (dashboard ⋮ menu, and the show page's existing button). **Fan-out check (plan task):** if the help-screenshot manifest captures `/admin` or `/help/admin/dashboard`, the screenshot baseline regenerates FROM the pinned Docker image (byte-gate discipline; never from the dev host; restore committed WebPs after any local verification run).

### 3.7 Dimensional invariants

None introduced: the rowAction slot is an auto-height sibling block below the row Link (existing bordered container), and the menu is content-sized. No fixed-dimension parent gains flex children. Declared explicitly per the self-review rule.

## §4 Instrumentation & lock audit (invariants 10 + 2)

| Action | Surface invoked | Registry state | Lock holder |
| --- | --- | --- | --- |
| Open | navigation only | N/A — no mutation | N/A |
| Preview as | navigation only (preview page has its own gates) | N/A — no mutation | N/A |
| Re-sync | `POST app/api/admin/sync/[slug]/route.ts` | already in `AUDITABLE_MUTATIONS` (`SHOW_SYNCED_MANUAL`) | JS-side `withShowLock` via `lib/sync/runManualSyncForShow.ts` (single holder, unchanged) |
| Archive | `archiveShowAction` → `archive_show` RPC | already in `AUDITABLE_MUTATIONS` (archive rows) | in-RPC `pg_advisory_xact_lock` (single holder, unchanged) |

New code in this feature performs ZERO Supabase calls except the widened crew read inside the existing dashboard loader query (a read, subject to invariant 9's destructure-or-waiver at its existing call site — the plan carries the registry/meta-test disposition for the widened select).

## §5 Acceptance criteria

- **AC-1** Active published rows render the ⋮ menu with all four items; `data-testid` per item (`row-action-open|preview|resync|archive-<slug>`).
- **AC-2** Held/Publishing rows (`published === false`) render Open only — asserted for both `finalizeOwned` values (the pill differs; the menu rule doesn't).
- **AC-3** Preview-as lists crew from `row.crew`, caps at 12 + overflow link, disables on empty, and each item links `/admin/show/[slug]/preview/[crewId]`.
- **AC-4** Re-sync fires exactly one POST to `/api/admin/sync/[slug]`; pending disables sibling items; failure renders catalog copy (no raw code anywhere in the DOM — negative assertion included); success refreshes.
- **AC-5** Archive requires the in-menu confirm step; cancel restores; confirm calls `archiveShowAction` once; success moves the row out of the active bucket on refresh.
- **AC-6** 409 `FINALIZE_OWNED_SHOW` from either mutation renders the catalog message (anti-tautology: asserted against the catalog entry text from `lib/messages/catalog.ts`, not a hardcoded copy of it).
- **AC-7** Tap targets: menu trigger and every item ≥44px (`min-h-tap-min` companions); real-browser assertion not required (no fixed-dimension invariant), RTL class assertions suffice per the mechanical checklist.
- **AC-8** Help page documents the four actions + Held rule; archive sentence names both paths.
- **AC-9** Impeccable dual-gate (`/impeccable critique` + `/impeccable audit`) run on the diff; P0/P1 fixed or DEFERRED.md'd; closeout carries the `impeccable-gate:` marker line.
- **AC-10** Full suite + real CI green; whole-diff cross-model review APPROVE.

## §6 Documented limits

1. **Open duplicates the row Link.** Deliberate: §9.1 documents Open as an explicit action; the duplicate affordance costs one menu row and removes the "the row is secretly a link" discoverability gap.
2. **Crew list staleness.** `row.crew` is loader-time data; a roster change after dashboard render shows a stale submenu until refresh. The preview page itself re-validates the crewId — a stale click lands on the preview route's own guard, never a wrong crew page.
3. **Menu closes on background refresh** (§3.5 compound row). Cosmetic; accepted.
4. **Archived bucket unchanged** (§1.4).

## §7 Out of scope

- Any schema/RPC/lock/telemetry change (§1.1, §1.2, none needed).
- Per-show page and wizard action surfaces (§1.5).
- `ArchivedShowRow` / Unarchive (§1.4).
- Bulk actions, multi-select, keyboard-shortcut palette — not in §9.1.
- The `.eq("archived", false)` legacy-column consolidation (`archived` vs `archived_at`) — pre-existing, tracked elsewhere if at all; this spec only RECORDS the dual-column fact.
