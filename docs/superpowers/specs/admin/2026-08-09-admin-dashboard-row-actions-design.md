# Admin dashboard row actions — design

**Date:** 2026-08-09 · **Ledger:** `BL-ADMIN-DASHBOARD-ROW-ACTIONS` (BACKLOG.md) · **Branch:** `feat/admin-dashboard-row-actions`

## §0 Summary

Surface the four master-spec §9.1 per-row actions — Open · Preview as · Re-sync · Archive — on the dashboard's Active-shows rows, via `ShowsTable`'s existing `rowAction` slot. **Pure UI surfacing:** every mutation this feature triggers already ships, is already advisory-locked, and is already telemetry-registered. No migration, no new RPC, no new mutation surface, no new lock holder.

The backlog entry predates M12.2 and is stale on three counts, corrected here: (a) the row renderer is `components/admin/ShowsTable.tsx` (no component named ActiveShowsPanel exists in the tree); (b) Archive shipped in full in M12.2 Phase B2 — `public.archive_show(uuid)` RPC with in-RPC advisory lock (`supabase/migrations/20260601000000_b2_show_lifecycle.sql`, `pg_advisory_xact_lock(hashtext('show:' || v_drive))`), server action `app/admin/show/[slug]/_actions/archive.ts` (`archiveShowAction`), registered in `AUDITABLE_MUTATIONS` (the archive rows in `tests/log/_auditableMutations.ts`); (c) `shows` carries BOTH `archived boolean` (legacy filter column, 3 live `.eq("archived", false)` sites) and `archived_at timestamptz` (B2 lifecycle) — no schema work is needed or performed.

## §1 Resolved scope — do not relitigate

1. **No new mutation surface (invariant 10).** Re-sync reuses `POST /api/admin/sync/[slug]` (`app/api/admin/sync/[slug]/route.ts`, `logAdminOutcome({ code: "SHOW_SYNCED_MANUAL" })`, registered in `tests/log/_auditableMutations.ts`); Archive reuses `archiveShowAction` (registered in the same file's archive rows). The dashboard adds CALLERS of registered surfaces, which requires no registry rows — the registry keys on the surface, not the call site.
2. **No new advisory-lock holder (invariant 2).** Sync's lock is JS-side (`lib/sync/runManualSyncForShow.ts` injects `withShowLock`); archive's is in-RPC (`archive_show`). Both single-holder topologies are shipped and pinned; this feature adds zero lock code. The plan restates the two holders verbatim as its invariant-2 enumeration.
3. **Held/Publishing rows hide Re-sync, Archive, and Preview-as** — HARD CONSTRAINT from master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§9.1 region, "dashboard MUST hide" sentence; the actions row itself is the `| Actions | Open · Preview as · Re-sync · Archive |` table line). The server side already enforces — the sync route via HTTP 409, the archive action via its typed `LifecycleResult` code (`FINALIZE_OWNED_SHOW` both ways); the UI hides rather than disables. The existing Held/"Publishing…" pill (M12.2 `finalizeOwned` split) IS the required static badge — this spec does not add a second one.
4. **Threat/UX fence:** actions are admin-only surfaces behind the admin layout; no crew-facing change. The archived-bucket rows (`ArchivedShowRow`, which already carries Unarchive) are OUT of scope — this feature touches the active-segment table only.
5. **Reuse the shipped action contracts unchanged.** No BEHAVIOR change to `archiveShowAction`, the sync route, `archive_show`, `ReSyncButton`, or `ArchiveShowButton` — their observable contracts (pinned by their existing tests, which must pass unmodified) are frozen. Behavior-preserving EXTRACTION of shared logic/copy out of the two buttons into shared modules IS permitted and preferred over duplication (spec R2 F7 resolved this way: the §3.4/§3.4a extraction directions and this fence now agree — refactor yes, semantics no).
6. **The existing `rowAction` slot POSITION is the mount point, but not via a function prop across the server boundary** (spec R2 F1: `Dashboard.tsx` is an async Server Component and `ShowsTable.tsx` is `"use client"` — a `rowAction={(row) => ...}` render function is a non-serializable prop and cannot cross that boundary). Mechanism: `ShowsTable` gains `showRowActions?: boolean`; when set, it imports and renders `<ShowRowActions row={row} />` itself at the existing slot position (`data-testid` `shows-row-action-<slug>`, sibling of the row `<Link>` — interactive control inside an anchor is invalid HTML, per the comment at the site). The `rowAction` function prop remains for CLIENT callers and is untouched; the Dashboard passes the boolean.

## §2 Current state (live-code citations, verified 2026-08-09 by investigator + direct greps)

- Row renderer: `components/admin/ShowsTable.tsx` (~678 lines), props at `components/admin/ShowsTable.tsx:40-61` incl. `rowAction?: (row: ActiveShowRow) => ReactNode`; row render `components/admin/ShowsTable.tsx:518-636`; whole row wrapped in `<Link href={openHref(row.slug)}>` at `components/admin/ShowsTable.tsx:528`; rowAction slot `components/admin/ShowsTable.tsx:627-634`. Mounted at `components/admin/Dashboard.tsx` (ShowsTable JSX, no `rowAction` passed today).
- `ActiveShowRow` (`lib/admin/showDisplay.ts:21`): `id, slug, title, showDateStart/End, crewCount, lastSyncedAt/Status, lastCheckedAt, published, isLive, finalizeOwned, archivedAt, dataGaps?, rosterShift?, …` — carries a crew COUNT, not a crew list.
- Re-sync: `components/admin/ReSyncButton.tsx` POSTs `/api/admin/sync/${slug}`; handler `app/api/admin/sync/[slug]/route.ts` (requireAdmin + requireAdminIdentity, post-commit `logAdminOutcome`).
- Archive: `components/admin/ArchiveShowButton.tsx` mounted in `components/admin/showpage/ShareHub.tsx`; calls `archiveShowAction` (`app/admin/show/[slug]/_actions/archive.ts`); RPC `archive_show` at `supabase/migrations/20260601000000_b2_show_lifecycle.sql` (in-RPC lock, `is_admin()` gate, idempotent re-read, `FINALIZE_OWNED_SHOW` raise).
- Preview-as: route `app/admin/show/[slug]/preview/[crewId]/page.tsx` exists; in-app links come from `components/admin/wizard/CrewRowActions.tsx`, which the published-show review surface also mounts (`step3ReviewSections.tsx` mounts CrewRowActions for published shows, reachable from the dashboard modal — spec R3 F3 corrected an earlier 'only the wizard links it' claim). The DASHBOARD ROW has no Preview-as affordance today; that is the gap this feature closes.
- Help: `app/help/admin/dashboard/page.mdx` — no four-action list; its "You archive from a show’s own page…" sentence becomes stale-by-omission when the dashboard gains Archive.
- Master spec §9.1: actions table row + the published=false hide rule (§1.3 above).

## §3 Design

### 3.1 Component

New client component `components/admin/ShowRowActions.tsx`, rendered by `ShowsTable` itself when Dashboard sets `showRowActions` on the ACTIVE bucket's ShowsTable only (§1.6 — the server/client boundary forbids a render-function prop).

Rendered affordance: a single kebab (⋮) menu button per row — `min-h-tap-min`/`min-w-tap-min` tap target, `aria-label` "Actions for <title>", `aria-haspopup="menu"`, `aria-expanded` — opening an ARIA menu whose pattern PRECEDENT is `components/admin/wizard/CrewRowActions.tsx` — the repo's real kebab menu, which implements `role="menu"`/`role="menuitem"`, initial focus into the menu, ArrowUp/ArrowDown/Home/End navigation, Escape-to-close with trigger focus restore, and Tab-out closing (spec R2 F3; `AppHealthPopover.tsx` is an `aria-modal` dialog and is NOT the pattern). ShowRowActions reuses that keyboard/role contract, including for the Preview-as submenu (submenu opens with ArrowRight/Enter, closes with ArrowLeft/Escape back to its parent item; the plan enumerates against CrewRowActions' key-handler regions). One button, because the row is dense and mobile-first; four inline buttons per row fail the tap-target grid on 390px.

**Positioning/collision contract (spec R4 F1):** `ShowsTable`'s row container clips (`overflow-hidden` on the rows wrapper), so an absolutely-positioned in-row panel is unreachable on bottom/edge rows. The menu (and every expanding surface it hosts: submenu, Archive confirm, held/error panels) renders in a PORTAL to `document.body`, anchored to its trigger, flipping vertically when the anchor is in the lower viewport region so the panel stays fully on-screen; it closes on WINDOW scroll and on row unmount (the §3.5 compound rows). (Plan R3 F3 corrected the scroll target: the rows wrapper is `overflow-hidden` but height-unconstrained — excess rows scroll the DOCUMENT, not the table — so the dismiss trigger is window scroll.) The plan names the concrete portal/anchor primitive after checking whether the repo already ships one (BellPanel / modal shells are candidates); absent a reusable one, a minimal anchored-portal is part of this arc.

Menu items (44px rows, icons + labels, canonical tokens):

| Item | Published row | Held/Publishing row | Behavior |
| --- | --- | --- | --- |
| Open | ✓ | ✓ | `<Link>` using the SAME `openHref(row.slug)` helper the row Link uses (`useShowModalNav` builds the parameter-preserving admin-dashboard modal URL with a show query parameter; `/admin/show/[slug]` is only a legacy redirect — spec R2 F6) |
| Preview as… | ✓ (disabled when no crew) | HIDDEN | submenu/section listing crew members → `/admin/show/[slug]/preview/[crewId]` |
| Re-sync | ✓ | HIDDEN | POST `/api/admin/sync/${slug}`; pending state in the menu item; result surfaced per §3.4 — INCLUDING the two-phase `shrink_held` decision flow (§3.4a) |
| Archive | ✓ | HIDDEN | two-step confirm inside the menu (item → confirm row), then `archiveShowAction(row.slug)` — the shipped action takes a SLUG and resolves it internally via `resolveShowBySlug` (spec R1 F1; passing `row.id` would return `show_not_found` without archiving) |

Guard conditions: `crewCount === 0` or missing crew list → "Preview as…" renders disabled with helper text "No crew on this show yet." `row.title === null` → aria-label falls back to the slug. Any action while a previous action is pending → menu items disabled (single in-flight action per row).

### 3.2 Preview-as crew source

`ActiveShowRow` gains OPTIONAL `crew?: { id: string; name: string | null }[]`. The dashboard loader (`fetchDashboardData` — the same code that computes `crewCount`; plan cites exact lines) populates it for active PUBLISHED rows from the identical `crew_members` query it already issues, widened from a count to `id, name` (bounded: active shows only). Producers that omit the field change nothing — `ShowsTable` passes the row through; only `ShowRowActions` reads it (mirrors the `dataGaps?` optional-field precedent). **Cap:** the submenu lists at most 12 crew, then a "… and N more (open the show)" item using the same `openHref(row.slug)` modal URL as Open (cap/truncation rule; a 40-person crew must not render a 40-item submenu). Name `null` renders the established unnamed-crew fallback used by the wizard roster (plan verifies the exact string).

### 3.3 Published=false and race behavior

UI: `row.published === false` → menu contains Open only (§1.3). No second badge — the existing pill communicates state.
Race (row flips to finalize-owned after render, admin fires Re-sync/Archive): the sync ROUTE returns HTTP 409 with `FINALIZE_OWNED_SHOW`; the archive SERVER ACTION returns a typed `LifecycleResult` carrying the same code — a server action has no HTTP status (spec R1 F4). Either way the UI surfaces the catalog copy for `FINALIZE_OWNED_SHOW` via `lib/messages/lookup.ts` (invariant 5 — no raw codes). No optimistic UI: rows re-render from the server refresh after action completion (`router.refresh()`, matching `ReSyncButton`'s established completion contract; plan verifies).

### 3.4 Result surfacing

Re-sync and Archive reuse the semantics their per-show buttons established: pending spinner in place, success → `router.refresh()` (row's sync cell / bucket updates), failure → inline error line inside the menu region, failure announcement following the shipped button reference patterns — `role="alert"` (ReSyncButton wraps it in a `role="group"`; ArchiveShowButton renders it directly on all failure branches; plan R4 F5 aligned this text, which earlier said role="status"). The menu stays open on failure (the admin reads the error), closes on success.

Error copy resolution (spec R1 F3): catalog-coded outcomes read `lib/messages/lookup.ts`; the two NON-catalog archive sentinels — `show_not_found` and `infra_error` (`app/admin/show/[slug]/_actions/shared.ts`) — get the same generic-copy branches `ArchiveShowButton.tsx` ships (its explicit handling outside the catalog is the reference; the plan reuses its exact strings or extracts them to a shared constant). An empty error region is a bug by specification: every reachable failure value renders SOME copy.

### 3.4a Re-sync `shrink_held` decision (spec R1 F2)

The sync route can return `ok: true` with a `shrink_held` decision payload (`detail` + `heldModifiedTime`) instead of a plain success. `ReSyncButton` keeps that decision open and performs a SECOND, version-bound POST when the admin accepts the reduced version. The dashboard menu item mirrors that contract, not a generic success close:

- plain success → close + refresh (one POST total);
- `shrink_held` → the menu region swaps to the held prompt (same copy contract as `ReSyncButton`'s held state). Accept is a TIER-2 DESTRUCTIVE action per DESIGN.md's classification of shrink acceptance and gets the full §3.8 treatment — consequence prose, inverted-amber confirm recipe, initial focus on the safe control, cancel focus restoration (`ReSyncButton.tsx` implements the reference at its safe-focus/restoration/inverted-amber regions, spec R2 F2). Accept then issues the second version-bound POST (carrying `heldModifiedTime`); Keep dismisses with no further request;
- treating `shrink_held` as success (closing while the old version is silently retained) is specified as WRONG — it is the exact silent-outcome class the consequence bound forbids.

The plan enumerates the held-flow branch at `components/admin/ReSyncButton.tsx:148-196` and either extracts the request/decision logic into a shared hook or reimplements it against the same route contract with the same tests — extraction preferred; duplication requires justification in the plan body.

### 3.5 Transition inventory (component states)

States: closed / open / open+pending / open+error / confirm-step (Archive). Pairs:

| Transition | Treatment |
| --- | --- |
| closed → open | popover pattern default (instant or ≤150ms fade per the popover primitive; whatever `AppHealthPopover` does — consistency wins) |
| open → closed (dismiss/success) | same as primitive |
| open → open+pending | instant swap of item content to spinner; other items disable |
| open+pending → open+error | instant; the error line appears in a `role="group"` naming an inner `role="alert"` message node — the shipped `ReSyncButton.tsx:280-287` reference; the alert role IS the announcement. (Aligned with §3.4 per plan R4 F5, which corrected an earlier `role="status"` here; a node cannot carry both roles, and §3.4 is the ratified one.) |
| open+pending → closed (success) | close after `router.refresh()` resolves |
| open → confirm-step (Archive) | instant in-place swap of the Archive row; initial focus lands on the SAFE control (Cancel) per the destructive-action contract |
| confirm-step → open (cancel) | instant; focus restores to the Archive item (cancel focus restoration per DESIGN.md destructive contract) |
| open+pending → held-decision (Re-sync `shrink_held`) | instant swap to the held prompt (§3.4a); other items stay disabled |
| held-decision → open+pending (Accept, second POST) | instant; pending spinner returns |
| held-decision → open (Keep) | instant dismiss, no request |
| compound: row unmounts (bucket flip after archive) while menu open | the portal closes via its row-unmount subscription (§3.1 positioning contract) — no orphaned portal; asserted |
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
- **AC-4** Re-sync's plain path fires exactly one POST to `/api/admin/sync/[slug]`; the `shrink_held` path renders the held prompt, Accept carries the §3.8 tier-2 destructive treatment and fires the second version-bound POST ONLY on Accept (asserted: zero further requests on Keep); pending disables sibling items; every reachable sync failure renders catalog copy for its UPPERCASE route code (no raw code, no empty error region — negative assertions included); success refreshes.
- **AC-5** Archive requires the in-menu confirm step implementing the §3.8 destructive contract (consequence prose naming the show, inverted-amber recipe + style-registry entry, initial focus on the safe control, cancel focus restoration); cancel restores; confirm calls `archiveShowAction(row.slug)` once; the two lowercase non-catalog sentinels `show_not_found` and `infra_error` each render their `ArchiveShowButton` generic-copy branch (asserted per sentinel; empty error region is a failing assertion), and `FINALIZE_OWNED_SHOW` in the typed result renders catalog copy; success moves the row out of the active bucket on refresh.
- **AC-6** `FINALIZE_OWNED_SHOW` — arriving as HTTP 409 from the sync route or inside the archive action's typed result — renders the catalog message (anti-tautology: asserted against the catalog entry text from `lib/messages/catalog.ts`, not a hardcoded copy of it).
- **AC-7** Tap targets: menu trigger and every item ≥44px (`min-h-tap-min` companions; RTL class assertions suffice — no fixed-dimension invariant). Keyboard/ARIA contract per §3.1's CrewRowActions precedent, each asserted: `role="menu"`/`role="menuitem"`, focus moves into the menu on open, ArrowUp/ArrowDown wrap, Home/End jump, Escape closes and restores trigger focus, Tab closes, submenu opens on ArrowRight/Enter and closes to its parent item on ArrowLeft/Escape. GEOMETRY (real browser, not jsdom — spec R4 F1): with enough rows to scroll, the LAST row's open menu (and its submenu and Archive confirm) is fully within the viewport (`getBoundingClientRect` containment), and the menu closes on window scroll.
- **AC-8** Help page documents the four actions + Held rule; archive sentence names both paths.
- **AC-9** Impeccable dual-gate (`/impeccable critique` + `/impeccable audit`) run on the diff; P0/P1 fixed or DEFERRED.md'd; closeout carries the `impeccable-gate:` marker line.
- **AC-10** Full suite + real CI green; whole-diff cross-model review APPROVE.

### 3.8 Destructive-action contract (spec R1 F5)

The Archive confirm step implements the DESIGN.md destructive-action rules (the `DESIGN.md` §~478-497 block; `components/admin/ArchiveShowButton.tsx` is the shipped reference at its confirm/focus regions): consequence prose that names the show being archived, the inverted-amber confirm recipe with its style-registry entry, initial focus on the safe (Cancel) control when the confirm appears, and focus restoration to the invoking control on cancel. These are ACs, not suggestions (AC-5).

## §6 Documented limits

1. **Open duplicates the row Link** (same `openHref` target). Deliberate: §9.1 documents Open as an explicit action; the duplicate affordance costs one menu row and removes the "the row is secretly a link" discoverability gap.
2. **Crew list staleness.** `row.crew` is loader-time data; a roster change after dashboard render shows a stale submenu until refresh. The preview page itself re-validates the crewId — a stale click lands on the preview route's own guard, never a wrong crew page.
3. **Menu closes on background refresh** (§3.5 compound row). Cosmetic; accepted.
4. **Archived bucket unchanged** (§1.4).

## §7 Out of scope

- Any schema/RPC/lock/telemetry change (§1.1, §1.2, none needed).
- Per-show page and wizard action surfaces (§1.5).
- `ArchivedShowRow` / Unarchive (§1.4).
- Bulk actions, multi-select, keyboard-shortcut palette — not in §9.1.
- The `.eq("archived", false)` legacy-column consolidation (`archived` vs `archived_at`) — pre-existing, tracked elsewhere if at all; this spec only RECORDS the dual-column fact.
