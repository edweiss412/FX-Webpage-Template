# Crew Show-Page Redesign — Phase 1 Implementation Plan (Overview)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read this overview first, then the per-phase files in order (`01` → `04`).

**Goal:** Replace the crew show page's flat 14-tile scroll with a URL-addressable six-section sub-nav (Today · Schedule · Venue · Travel · Crew · Gear + conditional Budget), re-skin the Right-Now hero across all 12 states, and re-source time anchors from `rooms` — built over the **unchanged** projection / gating / state-machine infrastructure (Approach B).

**Architecture:** A new `CrewShell` Server Component replaces `ShowBody` on both routes that mount it (crew `app/show/[slug]/[shareToken]/page.tsx` and admin preview-as `app/admin/show/[slug]/preview/[crewId]/page.tsx`). `CrewShell` reads `?s=<section>` server-side, renders one of six `*Section` Server Components (plus conditional Budget), and performs a section-independent **server-side** `upsertAdminAlert` projection-alert side-effect during render. New presentational primitives live under `components/crew/`. The only data changes are a dates-parser `loadIn` capture (into the existing `dates` jsonb — no DDL) and `buildRightNowContext` re-sourcing from `rooms`. One backward-compatible `upsert_admin_alert` function migration adds `failedKeys` union-merge + write-debounce.

**Tech Stack:** Next.js 16 App Router (RSC + client islands), TypeScript (strict, `exactOptionalPropertyTypes`), Tailwind v4 (`@theme` tokens, no `md` breakpoint — `min-[720px]` seam), framer-motion 12, Supabase (service-role projection + `admin_alerts` RPC), **Vitest** (unit/component, jsdom), **Playwright** (real-browser layout/nav/transition; `playwright.config.ts` 4 projects). Spec: `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-15-crew-page-redesign-phase1-design.md` (adversarial-approved R46).

---

## How to run tests (this repo uses Vitest, NOT Jest)

- **One unit/component test file:** `pnpm vitest run <path/to/test.ts>` (or `npx vitest run <path>`). A single test by name: `pnpm vitest run <path> -t "<test name>"`.
- **Watch a file while iterating:** `pnpm vitest <path>` (no `run`).
- **One Playwright spec:** `pnpm exec playwright test <path/to/spec.ts> --project=mobile-safari` (projects: `mobile-safari`, `desktop-chromium`, `dev-build`, `prod-build`).
- **Type check:** `pnpm tsc --noEmit` (or the repo's `pnpm typecheck` if present).
- Expected-output discipline: derive every expected value from the fixture, never hardcode (AGENTS.md anti-tautology rule).

---

## File Structure

### New files (created)

| Path | Responsibility |
| --- | --- |
| `app/show/[slug]/[shareToken]/_CrewShell.tsx` | Server Component replacing `_ShowBody`. Reads `activeSection`, renders Header → `CrewSubNav` → `ShowRealtimeBridge` → active `*Section` (Today leads with `RightNowHero`) → Footer; performs the §4.13 server-side projection-alert upsert; ports the fail-closed `MalformedProjectionError` guard + Footer report-prop contract. |
| `app/show/[slug]/[shareToken]/loading.tsx` | Route loading skeleton (Header band + `CrewSubNav` placeholder + empty section frame at `min-h-(--spacing-right-now-min-h)`); renders the 6 base tabs only — **never** the conditional Budget tab. |
| `lib/crew/resolveActiveSection.ts` | `resolveActiveSection(raw, { budgetVisible }): SectionId` — validates `?s=`, falls back to `today` for invalid/non-entitled. |
| `lib/crew/resolveKeyTimes.ts` | `resolveKeyTimes(show, rooms): KeyTimeAnchors` — deterministic GS-room selection + `dates.loadIn` precedence + embedded-sentinel guard. Shared by `KeyTimesStrip`, Schedule, and `buildRightNowContext`. |
| `lib/crew/selectPrimaryContact.ts` | `selectPrimaryContact(contacts): ContactRow \| null` — deterministic actionable-first primary contact for Today "Need something". |
| `components/crew/CrewSubNav.tsx` | `'use client'` — top tabs (`≥720px`) + bottom tab-bar (`<720px`), `router.push` preserving `gate`, `aria-current`. |
| `components/crew/CrewSectionTransition.tsx` | `'use client'` — wraps the server-rendered active section as `children`, keyed by section id, framer crossfade (`initial={false}`, reduced-motion-safe). |
| `components/crew/RightNowHero.tsx` | `'use client'` — `RightNowCard` re-skinned to the hero's 5 slots; owns the client clock + `selectRightNowState`; props `{ context }` only. |
| `components/crew/sections/{Today,Schedule,Venue,Travel,Crew,Gear,Budget}Section.tsx` | Server Components — the six sections + conditional Budget; consume `ShowForViewer` + viewer flags/restrictions. |
| `components/crew/primitives/{SectionCard,KeyValueRows,PersonRow,DayCard,KeyTimesStrip}.tsx` | Pure presentational primitives (props in, markup out). |
| `supabase/migrations/<ts>_upsert_admin_alert_failedkeys_merge.sql` | `create or replace` of `upsert_admin_alert` adding `failedKeys` union-merge + `lastCountedAt` debounce + `WHERE`-gated no-op (backward-compatible; §6 SQL). |
| `tests/db/upsert-admin-alert-dedup.test.ts` | Validation-backed RPC dedup test (runs against `TEST_DATABASE_URL`). |

### Modified files

| Path | Change |
| --- | --- |
| `app/show/[slug]/[shareToken]/page.tsx` | Widen `searchParams` to `{ gate?; s? }`; pass `activeSection` to `CrewShell`; preserve `s` (validated) + `gate` through the picker/sign-in/`gate=skip`/stale-cleanup redirect builders. Swap `ShowBody`→`CrewShell` on admin + resolved branches. |
| `app/admin/show/[slug]/preview/[crewId]/page.tsx` | Swap `ShowBody`→`CrewShell` (`:233`); read its own `?s=`. |
| `lib/parser/blocks/dates.ts` | `parseV2V4Dates` captures `row[4]` TIME for set/`travel_set` rows → `dates.loadIn`; `parseV1Dates` best-effort. |
| `lib/parser/types.ts` | `ShowRow.dates` gains `loadIn?: string \| null`. |
| `components/right-now/buildRightNowContext.ts` | New signature `{ show, dateRestriction, hotelReservations, rooms }` (drop `contacts`); Set/Show/Strike from `rooms` via `resolveKeyTimes`; drop `event_details` time reads. |
| `lib/data/getShowForViewer.ts` | `ShowForViewer.rooms` typed `ProjectedRoomRow[]` (`RoomRow & { id }`); `dates.loadIn` passes through (jsonb decode already generic). |
| `lib/adminAlerts/upsertAdminAlert.ts` | Add `TILE_PROJECTION_FETCH_FAILED` to the `AdminAlertCode` union. |
| `lib/messages/catalog.ts` | Add `TILE_PROJECTION_FETCH_FAILED` row (admin `helpfulContext`, `<sheet-name>`, no em-dash). |
| `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` | §12.4 prose row for `TILE_PROJECTION_FETCH_FAILED` (then `pnpm gen:spec-codes`). |
| `tests/components/tiles/_metaSentinelHidingContract.test.ts` | `listTileFiles()` (`:235-239`) extended to also walk `components/crew/` (sections + primitives). |
| `tests/messages/_metaAdminAlertCatalog.test.ts` | Register `TILE_PROJECTION_FETCH_FAILED` + its `CrewShell` producer; add registry⊆union assertion. |
| `tests/components/tiles/CardinalityCapBoundary.test.tsx` | Retarget the cap-boundary matrix to the new section/primitive components. |
| `tests/e2e/crew-page.spec.ts` | Replace today-band assertions with the §4.9 redesigned-layout invariants. |
| `scripts/help-screenshots.manifest.ts` | Add `crew-today-mobile`, `crew-gear-mobile`, `crew-schedule-mobile` entries (with `frozenClockInstant`). |

### Deleted (Phase 4, file-by-file — wp-20, only after the tile test suite is retargeted-and-green)

`components/tiles/{ShowStatus,Schedule,Venue,Lodging,Transport,Crew,Contacts,Diagrams,PackList,Notes,OpeningReel,AudioScope,VideoScope,LightingScope}Tile.tsx`, `app/show/[slug]/[shareToken]/_ShowBody.tsx`, `lib/show/selectTodayTiles.ts`. **KEEP:** `components/tiles/OpeningReelVideo.tsx` (media, reused by Gear — move to `components/crew/` if cleaner), all `lib/` `load*` data helpers, all `components/shared/` error infra (`WrappedTile`/`TileServerFallback`/`TileErrorBoundary`).

---

## Shared contracts (BINDING — every phase references these verbatim; do not re-derive)

```typescript
// lib/crew/resolveActiveSection.ts
export type SectionId = "today" | "schedule" | "venue" | "travel" | "crew" | "gear" | "budget";
export const BASE_SECTION_IDS = ["today", "schedule", "venue", "travel", "crew", "gear"] as const;
export function resolveActiveSection(
  raw: string | undefined,
  opts: { budgetVisible: boolean },
): SectionId; // invalid/absent → "today"; "budget" when !budgetVisible → "today"

// lib/crew/resolveKeyTimes.ts
import type { RoomRow, ShowRow } from "@/lib/parser/types";
export type ProjectedRoomRow = RoomRow & { id: string }; // ShowForViewer.rooms element type
export type KeyTimeAnchors = { set?: string; show?: string; strike?: string }; // present keys only
// Anchor absent when value empty OR contains a bare TBD/N/A/TBA token (e.g. "10/20 @ TBD").
// Set precedence: dates.loadIn (non-sentinel) ?? GS-room set_time ?? omit.
// GS selection: sort (kind rank gs<breakout<additional, normalized name, id), pick first; gs preferred.
export function resolveKeyTimes(
  show: Pick<ShowRow, "dates">,
  rooms: ProjectedRoomRow[] | null,
): KeyTimeAnchors;

// lib/crew/selectPrimaryContact.ts
import type { ContactRow } from "@/lib/parser/types";
export function selectPrimaryContact(contacts: ContactRow[]): ContactRow | null;
// prefers a contact with a non-sentinel phone/email; tie-break kind then name (sorted); none actionable → null.

// components/right-now/buildRightNowContext.ts  (MODIFIED signature)
export function buildRightNowContext(opts: {
  show: Pick<ShowRow, "dates" | "title" | "venue" | "event_details">;
  dateRestriction: DateRestriction;
  hotelReservations: HotelReservationRow[];
  rooms: ProjectedRoomRow[] | null; // NEW — replaces the dropped `contacts` param
}): RightNowContext;

// _CrewShell.tsx
export type CrewShellProps = {
  data: ShowForViewer;
  viewer: Viewer;            // { kind: "crew"|"admin"|"admin_preview"; crewMemberId? }
  showId: string;            // R7-HIGH: ShowRow has NO `id` — showId is a SEPARATE prop (as _ShowBody.tsx:74); used for upsertAdminAlert({showId}) + ShowRealtimeBridge + wrapped-block alerts. page.tsx passes result.showId; preview-as passes showLookup.id. NEVER `data.show.id` (doesn't exist) or null (null coalesces alerts across shows in the RPC conflict key).
  rawSection: string | undefined; // the UNVALIDATED `?s=` — CrewShell resolves it ITSELF (R2-HIGH-1)
  slug: string;
  shareToken?: string;       // crew route only; preview-as omits
  identityChip?: { name: string; role: string; shareToken: string } | null; // ported from ShowBody (_ShowBody.tsx:83-87) → Header; crew route derives from the resolved crew row, admin/preview pass null (R4-MEDIUM-2)
};
// CrewShell resolves the section AFTER it has the viewer context, so the gate and the
// section selection can NEVER diverge (single authority):
//   const ctx = resolveViewerContext(viewer, data);  // (inside the fail-closed try/catch)
//   const budgetVisible = financialsVisible(ctx.viewerFlags, ctx.isAdmin);
//   const activeSection = resolveActiveSection(rawSection, { budgetVisible });
// page.tsx / preview-as pass the RAW `s` (they do NOT pre-resolve activeSection, and do
// NOT pass budgetVisible:true). The redirect builders still allow-list `s` for deep-link
// preservation (carry a valid section id incl. "budget"); CrewShell does the entitlement
// fallback. This is the spec's single-predicate Budget gate (§4.1) across tab + URL + section.

// Each section: components/crew/sections/<Name>Section.tsx
// export function <Name>Section(props: { data: ShowForViewer; viewer: Viewer }): JSX.Element
// Reads viewer roleFlags/restrictions off data.crewMembers (resolved for the viewer) — NOT a separate prop.

// RightNowHero — components/crew/RightNowHero.tsx
// export function RightNowHero(props: { context: RightNowContext }): JSX.Element  (no `state` prop)

// Projection-alert context shape (server-side upsert in _CrewShell):
// upsertAdminAlert({ showId, code: "TILE_PROJECTION_FETCH_FAILED",
//   context: { sheet_name: data.show.title, tileId: "crew:projection-alert",
//              message: `${n} crew-page data sources failed to load: ${keys.join(", ")}`,
//              failedKeys: [...sorted] } })           // NO signature, NO viewerVersionToken
```

**Primitive prop contracts** (Phase 2 / `components/crew/primitives/`): `SectionCard {icon?, title?, action?, children}`; `KeyValueRows {rows: {k, v, sub?, icon?}[]}` (row omitted when `v` empty); `PersonRow {person: {name?, role?, fallbackLabel?, phone?, email?, notes?, you?, lead?, primary?}}` (name absent + phone/email present → render with `fallbackLabel`; `tel:`/`mailto:` only when actionable; `notes` via `shouldHideGenericOptional`); `DayCard {day, phase, today, meta?}`; `KeyTimesStrip {anchors: KeyTimeAnchors}` (omitted when all absent; partial → present rows only).

---

## Verified-facts digest (live-code, base `a2884c3f` — cite these; do NOT invent)

- **Crew route** `app/show/[slug]/[shareToken]/page.tsx`: `resolveShowPageAccess` 11-arm union (`:39`); renders `ShowBody` at `:129` (admin) + `:166` (resolved); `searchParams: Promise<{ gate?: string }>` awaited `:71`/`:74`. Dir files: `page.tsx`, `_ShowBody.tsx`, `_PickerInterstitial.tsx`, `_SignInOrSkipGate.tsx`, `_StaleCleanupAutoSubmit.tsx`, `not-found.tsx`. **No `loading.tsx`, no `_CrewShell` yet.**
- **`getShowForViewer`** (`lib/data/getShowForViewer.ts:199-200`) → `ShowForViewer` (`:94-197`): fields `show, crewMembers, hotelReservations, rooms, transportation, contacts, pullSheet, diagrams, openingReelHasVideo, lastSyncedAt, lastSyncStatus, tileErrors, financials?, viewerName, viewerVersionToken`. `Viewer` (`:80-83`) `{kind: "crew"|"admin"|"admin_preview"; crewMemberId?}`. `tileErrors: Record<string,string>` (`:168`) set: hotel `:350`, rooms `:378`, transportation `:412`, contacts `:455`, financials `:487` (financials only when `isLead`, gate `:479-507`, `isLead` `:232`). Service-role client `:200`. Rooms projected `:386-388`.
- **`_ShowBody.tsx`**: notes-tile catch-all `:410-420` (hotel/rooms/contacts ungated + transportation gated); `resolveViewerContext`→`MalformedProjectionError`→`<TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />` guard `:113-121`; per-block visual gates hotel `:189`, contacts `:224`, rooms (A/V/L) `:255`/`:273`/`:291`, transportation `:309`, financials `:372`; Footer report props `:509-540` (`reportSurfaceOverride`, `reportSurfaceIdOverride`, `reportAutocapture.crewPreview`, `lastSyncedAt`/`lastSyncStatus`); `buildRightNowContext` call `:122-127`; `ShowRealtimeBridge renderVersion={data.viewerVersionToken}` `:469`; `nowDate()` server clock `:133`.
- **State machine** `selectRightNowState(today, dates, viewerDateRestriction, options?)` (`lib/time/rightNow.ts:196-201`) → `RightNowState` (`:57-77`) 12 kinds: `viewer_unconfirmed, viewer_after_last_day, viewer_off_day, viewer_off_day_pre, pre_travel, travel_in_day, set_day, show_day_n {n,total,isLast}, travel_out_day, post_show, unknown, dateless`. `transitionTreatment(from,to)` (`lib/time/rightNowTransitions.ts:594-606`) → `crossfade-body|morph-to-last-good|instant|unreachable`; 66 pairs. `nowDate()` (`lib/time/now.ts:23-74`) honors `X-Screenshot-Frozen-Now`.
- **`buildRightNowContext`** (`components/right-now/buildRightNowContext.ts:63-103`) current sig `{show, dateRestriction, hotelReservations, contacts}` → `RightNowContext` (`:23-48`); reads `event_details.{call_time,load_in_time,strike_time,first_show_room}` (`:73-82`) — **all always-empty for real shows (7/7)**; `contacts` param unused. `RightNowCard` (`components/right-now/RightNowCard.tsx`) props `{context}` (`:337-339`), client clock `useState(()=>new Date())` (`:355-389`), `AnimatePresence mode="wait" initial={false}` (`:644`), `transitionTreatment` lookup `:481`, `lastGood`/`morph` `:445-452`.
- **Visibility** (`lib/visibility/scopeTiles.ts`): `audioScopeVisible` `:84-86`, `videoScopeVisible` `:95-97`, `lightingScopeVisible` `:112-114`, `financialsVisible(flags,isAdmin)` `:136-138` (`isAdmin||flags.includes("LEAD")`), `transportTileVisible({transportation,viewerName,isAdmin})` `:168-186`; `isPackListVisibleToday` (`lib/visibility/packList.ts:122-140`); `shouldHideGenericOptional(value)` (`lib/visibility/emptyState.ts:75`) hides `{"","TBD","N/A","TBA"}` (case-insensitive, trim).
- **Types** (`lib/parser/types.ts`): `ShowRow` `:82-113` (`dates {travelIn,set,showDays[],travelOut}` `:94-99`; `event_details: Record<string,string>`; `agenda_links {label, fileId?, url?}[]`); `RoomRow` `:130-147` (`kind: "gs"|"breakout"|"additional"`; `set_time/show_time/strike_time: string|null`); `ContactRow kind "venue"|"in_house_av"`; `RoleFlag` 18-19 values; `DateRestriction` `explicit|unknown_asterisk|none` `:10-13`.
- **Tiles** (`components/tiles/`, 16 files): `ShowStatusTile({show})` takes `Pick<ShowRow,"coi_status"|"venue"|"event_details">` `:79`; `FinancialsTile({financials,viewerFlags,isAdmin})` `:53`; `TransportTile({transportation,visible})` `:49`; `CrewTile({crewMembers})` `:60`; caps `CREW_INLINE_CAP=8` (`CrewTile:58`), `CONTACTS_INLINE_CAP=6` (`ContactsTile:54`), `SOURCE_CAP=8`+`TRUNCATE_AT=280` (`NotesTile:57-58`), `CASE_CAP=12` (`PackListTile:67`). `selectTodayTiles`/`filterVisibleTodayTiles` (`lib/show/selectTodayTiles.ts:22`/`:47`). `stripOpeningReelText` (`lib/visibility/openingReelText.ts:56`; DOM must never contain `https://`/`drive.google.com`/`docs.google.com`).
- **Admin alert**: `AdminAlertCode` union (`lib/adminAlerts/upsertAdminAlert.ts:3-34`) — **no `TILE_PROJECTION_FETCH_FAILED`** yet; `upsertAdminAlert(input: {showId: string|null; code: AdminAlertCode; context: Record<string,unknown>}): Promise<string|null>` (`:42-55`). Migration `supabase/migrations/20260505000000_upsert_admin_alert.sql` exists — fn `upsert_admin_alert(p_show_id uuid, p_code text, p_context jsonb) → uuid`, conflict key `(coalesce(show_id::text,''), code) where resolved_at is null` (`:15`), body `:14-19` plain upsert (occurrence_count + last_seen_at + context) — **NO failedKeys merge yet**. `catalog.ts`: `TILE_SERVER_RENDER_FAILED` `:1690-1702`, `DRIVE_FETCH_FAILED` `:57-68`, **no `TILE_PROJECTION_FETCH_FAILED`**. `gen:spec-codes` (package.json:21) → `lib/messages/__generated__/spec-codes.ts`; §12.4 in `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` ~`:3134`. `_metaAdminAlertCatalog.test.ts` (codes `:57-98`, write-sites `:100-264`). `x1-catalog-parity` = `tests/cross-cutting/codes.test.ts` (§12.4 parity `:80-102`). `_metaInfraContract.test.ts` exists; `getShowForViewer` NOT registered (it's a data projection, not an auth helper).
- **Tests/screenshots**: runner **vitest** (`pnpm vitest run <path>`); Playwright `playwright.config.ts` (4 projects). `_metaSentinelHidingContract.test.ts` `listTileFiles()` `:235-239` walks `components/tiles/` ONLY. `CardinalityCapBoundary.test.tsx` (caps). `tests/e2e/crew-page.spec.ts:167-233 & 403-499` real-browser equal-height (mobile-safari single-writer `:397`). `scripts/help-screenshots.manifest.ts:48-87` (4 admin entries, MOBILE 390×844, DESKTOP 1280×800, **no crew entry**); `capture-launch-args.ts` `CAPTURE_LAUNCH_ARGS`; `.github/workflows/screenshots-drift.yml` (Playwright `v1.59.1-jammy`). framer-motion `^12.38.0`; `components/layout/PageTransition.tsx` (route transitions, keyed on pathname); `lib/a11y/usePrefersReducedMotion.ts:24-34`. Tokens in `app/globals.css` `@theme`: `--spacing-right-now-min-h` 176px (`:170`), `--spacing-section-gap` 32px (`:151`), `--spacing-tap-min` 44px (`:141`), `--breakpoint-sm/lg/xl` (no `md`); `tests/styles/eyebrow-tracking.test.ts` bans inline `tracking-[…]`.

---

## Meta-test / structural-registry inventory (declared per AGENTS.md plan rule; each lands same-commit as the surface it pins)

1. **EXTEND `tests/components/tiles/_metaSentinelHidingContract.test.ts`** — `listTileFiles()` walk gains `components/crew/` (sections + primitives). **Same commit as the first crew component that reads a generic-optional field** (Phase 2 primitives). *Why:* the new sections read venue/contact/room/notes fields; without this the sentinel contract is silently unenforced.
2. **EXTEND `tests/messages/_metaAdminAlertCatalog.test.ts`** — register `TILE_PROJECTION_FETCH_FAILED` + its sole producer (`_CrewShell` server-side upsert); **add a registry⊆union assertion** (the meta-test currently only checks union⊆registry). Same commit as the four-part lockstep (Phase 2).
3. **`x1-catalog-parity` (`tests/cross-cutting/codes.test.ts`)** — enforces 3 of the 4 lockstep layers (master-spec §12.4 prose ↔ `gen:spec-codes` ↔ `catalog.ts`). The 4th (`AdminAlertCode` union) is enforced by the extended meta-test (#2). All four land in one commit (Phase 2).
4. **NEW `tests/db/upsert-admin-alert-dedup.test.ts`** — validation-backed RPC dedup/debounce proof (§6); the function migration must reach the validation project (surgical apply + `gen:schema-manifest`) — `validation-schema-parity` cannot catch function drift, so this is the only guard. Phase 2.
5. **Advisory-lock topology: N/A (declared).** Phase 1 adds **no** `pg_advisory*` surface — `admin_alerts` is not an advisory-lock table, and there is no table DDL (the `dates.loadIn` change is jsonb-only; the alert code is unconstrained `text`). `tests/auth/advisoryLockRpcDeadlock.test.ts` is untouched.
6. **PostgREST-DML-lockdown: N/A (declared).** No new RPC-gated table; no `RPC_GATED_TABLES` change.
7. **Supabase call-boundary (invariant 9):** the new `_CrewShell` `upsertAdminAlert` call site destructures `{ data, error }`, distinguishes returned- vs thrown-error, and fails quiet (a write fault never breaks the render). `getShowForViewer` is unchanged on this axis. Register the new write site in the relevant trust-domain/call-boundary audit if one walks `app/show/**`; otherwise carry an inline `// not-subject-to-meta: best-effort observability write, fail-quiet` note (decide at implementation by checking which audit, if any, covers the file).

---

## Phase map & execution order

Single milestone on `feat/crew-page-redesign`. Implement strictly in order; each phase is independently green before the next.

| Phase | File | Scope | §9 tests covered |
| --- | --- | --- | --- |
| **1. Parser + context** | `01-parser-context.md` | `dates.loadIn` capture; `buildRightNowContext` rooms-sourcing; `resolveKeyTimes`; `ProjectedRoomRow` projection passthrough; type changes. No UI. | 3, 4, 20 |
| **2. Shell + nav + alert** | `02-shell-nav-alert.md` | `_CrewShell`, `?s=` routing + redirect-preservation, `CrewSubNav`, `CrewSectionTransition`, primitives, `RightNowHero`; the server-side projection-alert upsert + `upsert_admin_alert` migration + the 4-part `TILE_PROJECTION_FETCH_FAILED` lockstep; meta-test extensions; `loading.tsx`; fail-closed guard; Footer report-prop port; preview-as route swap. | 1, 5, 6, 13, 16, 21, 22, 23, 28, 35, 36 |
| **3. Sections + Budget + Gear** | `03-sections-budget-gear.md` | The six `*Section`s + Budget; Gear emphasis; section + field empty states; field redistribution (ShowStatus → Header/Venue/Today/Gear); caps/truncation/URL-strip/PersonRow ports; `selectPrimaryContact`; Schedule DateRestriction privacy. | 2, 7, 8, 9, 10, 11, 17, 18, 24, 25, 26, 27, 30, 31, 32, 33, 34 |
| **4. Layout + transitions + screenshots + migration + close-out** | `04-layout-migration-closeout.md` | Playwright layout-dimensions (§4.9 verbatim); transition-audit (§4.10 verbatim); preview-as parity; prefetch-no-alert structural (test 36b); screenshots manifest + pinned-docker baselines; tile file-by-file migration + deletion (retarget tile tests green FIRST, then delete); impeccable dual-gate; adversarial review; real CI; merge. | 12, 13(rb), 14, 15, 19, 29, 36(b) |

> Test 36 splits: **36(a)** (fires on render) is Phase 2 Task 11; **36(b)** (does NOT fire on prefetch — structural) is Phase 4 Task 3. Test 22 splits: **22b** (hero client-clock freeze) Phase 2; **22a** (server `nowDate()` Schedule pin) Phase 3. Test 13 unit half (tab-click URL build) Phase 2; real-browser half Phase 4. Test 31 (`selectPrimaryContact` determinism) Phase 2 (where the helper is defined); consumed by Phase 3 Today.

**Mandatory cross-cutting tasks (AGENTS.md writing-plans additions):**
- **Layout-dimensions task** (Phase 4) — a real-browser Playwright assertion calling `getBoundingClientRect()` on every documented `data-testid`, asserting `child.height === parent.height` within 0.5px, with the **exact §4.9 invariant list** (7 invariants). jsdom is insufficient.
- **Transition-audit task** (Phase 4) — lists every `AnimatePresence`/ternary/conditional in the crew components, asserts each has `exit`/`initial`/`animate` (or is deliberately instant), tests compound transitions (theme-toggle-during-nav; re-enter Today). Body includes the **exact §4.10 transition inventory table**.
- **Anti-tautology:** assert against the data source (not the rendered container); clone-and-strip sibling nodes before label scans; derive expected values from fixture dimensions; every test states its concrete failure mode (the `_Catches:_` clause from §9).

**Commit discipline (invariant 6):** one commit per task, conventional-commits `feat(crew-page):` / `test(crew-page):` / `fix(crew-page):` / the `db`/`parser`/`messages` scope as appropriate; never batch tasks.

---

## Adversarial review (cross-model) — between self-review and execution handoff

After plan self-review, this plan goes to Codex adversarial review (iterate to APPROVE) before execution. Do not proceed to execution handoff without it.
