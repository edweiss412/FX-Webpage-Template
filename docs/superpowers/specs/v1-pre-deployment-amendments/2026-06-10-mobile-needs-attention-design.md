# Mobile "Needs attention" page + bottom-nav tab (#11) — design

**Date:** 2026-06-10
**Status:** Draft (pending self-review + cross-model adversarial review)
**Branch:** `spec/mobile-needs-attention`
**Origin:** M12.3 follow-up item **#11** — "mobile 'Needs attention' → own page + bottom-nav tab + 'Need review' card links there (FEATURE — needs spec; desktop unchanged)."
**Routing:** This milestone is ~all UI (`app/`, `components/`) plus a `lib/admin/` loader extraction → **implementer = Opus / Claude Code** (hard rule: UI is always Opus + impeccable v3). **Reviewer = Codex** (per-phase + whole-milestone adversarial review). No DB changes of any kind.

---

## 1. Summary

The admin's "Needs attention" inbox (pending ingestions / new sheets / changes-to-review) currently lives only inside the dashboard. On a phone it competes with the stat strip and shows table for vertical space. This milestone gives it a dedicated page at `/admin/needs-attention` that aggregates **admin alerts + the full inbox**, adds a third **mobile bottom-nav tab** with an unread-count badge, and collapses the mobile dashboard's inbox into a compact **summary card** that links to the page. Desktop navigation and the desktop dashboard are unchanged.

No new tables, columns, RPCs, or migrations. No new §12.4 error codes.

## 2. Resolved decisions (owner Q&A, 2026-06-10)

These are ratified; do not relitigate in review.

| # | Question | Decision |
|---|----------|----------|
| D-1 | Page scope | **Inbox + alerts** — the page is the single "everything that needs you" surface: active admin alerts on top, the full inbox below. (Cross-show MI-11 holds rollup stays deferred — see §11.) |
| D-2 | Desktop behavior of the route | **Render normally at any width.** Desktop nav simply doesn't link to it; no redirect, no width detection. |
| D-3 | Mobile dashboard treatment | **Option B — compact summary card.** At `<720px` the dashboard's full inbox is replaced by a one-row summary card (exact count + per-stream chips + chevron) linking to the page. At `≥720px` the dashboard keeps the full inbox exactly as today. |
| D-4 | Tab badge | **Badge = inbox `totalCount`** (failed + pending-sync items). Alerts do NOT increment it. Hidden at zero; display caps at `9+`. Server-fetched per navigation; no polling/realtime. |
| D-5 | Dashboard alert strip | **Keep in both places.** The dashboard banner stays exactly as today (mobile + desktop); the page repeats active alerts in its own section. Duplication is intentional. |

## 3. Current state (verified citations, 2026-06-10 @ `main`)

- **Inbox data assembly** lives inline in `fetchDashboardData` (`components/admin/Dashboard.tsx:101-103` signature; returns `DashboardData | { kind: "infra_error"; message: string }`): `pending_ingestions` bounded query `components/admin/Dashboard.tsx:328-343` (`.is("wizard_session_id", null)`, `.limit(RENDER_CAP + 1)`), ingestion head-count `:347-360`, `pending_syncs` bounded query `:364-381`, syncs head-count `:385-398`, existence lookup keyed on `drive_file_id` spanning all shows `:404-439`, `buildNeedsAttention(...)` call `:441-460`. Every Supabase await is wrapped per AGENTS.md invariant 9 (file header `Dashboard.tsx:15`); on `infra_error` the component renders an inline degraded block (`Dashboard.tsx:478` consume, `:498` copy "The admin database query failed. Refresh in a moment.").
- **Pure assembly:** `lib/admin/needsAttention.ts` — `RENDER_CAP = 20` (`:16`), `resolveIngestionCopy` (`:98`), `buildNeedsAttention(input: BuildNeedsAttentionInput): NeedsAttention` (`:131`); item union variants `pending_ingestion` / `first_seen` / `existing_staged` (`:56-82`); output `{ items, renderedCount, totalCount, overflowCount }` (`:84-89`).
- **Inbox UI:** `components/admin/NeedsAttentionInbox.tsx` — props `{ items, totalCount, renderedCount, overflowCount, now }` (`:17-24`), empty state `data-testid="admin-needs-attention-empty"` with copy "Nothing waiting on you." (`:127-133`), overflow note "+{overflowCount} more waiting. Clear some above to see the rest." `data-testid="needs-attention-more"` (`:144-146`).
- **Dashboard mounts:** `StatStrip` with `needReviewCount` (`Dashboard.tsx:516-522`; `components/admin/StatStrip.tsx:61` prop, renders "Need review" cell `:95-101`); `NeedsAttentionInbox` (`Dashboard.tsx:647-653`).
- **Alerts:** `components/admin/AlertBanner.tsx` is an async server component, no props; self-fetches `admin_alerts` (`:108-119`); degraded render `data-testid="admin-alert-banner-degraded"` (`:145-167`); renders null when no alerts. Mounted dashboard-only at `app/admin/page.tsx:107` (M12.3; contract comment `app/admin/page.tsx:90-96`). The dashboard-only contract is pinned by `tests/e2e/admin-banner.spec.ts:386` ("global banner present on /admin, absent on /admin/dev, /admin/settings, /admin/show/[slug]").
- **Nav:** `components/admin/nav/navConfig.ts` — `NavItem = { id: "dashboard" | "settings", label, short, href, Icon }` (`:4`), `NAV` two entries (`:6-9`), `NAV_BREAKPOINT_PX = 720` (`:11`), `OVERFLOW_THRESHOLD = 5` (`:12`), `shouldRenderOverflow` (`:14-16`), `isNavItemActive` (`:20-23`). `components/admin/nav/AdminNav.tsx` — desktop bar `hidden items-center gap-1 min-[720px]:flex` (`:64`), active styling desktop `:73-75`; mobile bar `fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface min-[720px]:hidden` (`:95-125`), tab = `<item.Icon className="size-5" />` + `<span>{item.short}</span>` (`:112-113`), testids `admin-bottom-tabs` (`:96`), `admin-bottom-tab-${item.id}` (`:106`), `admin-bottom-tab-more` (`:119`), mobile active `text-accent-on-bg` (`:108-110`).
- **Layout:** `app/admin/layout.tsx` — gate `requireAdminIdentity({ layer: "layout" })` (`:52-53`), main padding `pb-20 min-[720px]:pb-page-pad-desktop` (`:98`), `AdminNav` mount (`:100`), `PageTransition` wrap (`:112`). Sibling pages re-gate defensively (`app/admin/settings/page.tsx:29` imports `requireAdminIdentity` from `@/lib/auth/requireAdmin`).
- **Header:** `components/admin/nav/AdminPageHeader.tsx` props `{ title, sub?, subSlot?, titleAppendSlot?, crumb?, backHref?, rightSlot? }` (`:5-24`).
- **Skeletons/transitions:** `app/admin/loading.tsx:10-43` (dashboard skeleton), `components/layout/PageTransition.tsx:61-92` (pathname-keyed fade+rise, reduced-motion safe, `initial={false}` on first paint).
- **Screenshots manifest:** `scripts/help-screenshots.manifest.ts:48-79` — `dashboard-overview` (`:49-56`, `/admin`, desktop 1280×800, selector `[data-testid=admin-dashboard]`), `review-queues-empty-state` (`:57-70`, `/admin`, desktop 1280×800, selector `[data-testid=dashboard-inbox-col]`), `preview-as-crew-banner` (`:71-78`, mobile 390×844).
- **Band-sweep e2e:** `tests/e2e/admin-nav-layout-dimensions.spec.ts` — `WIDTHS = [600, 719, 720, 860, 1024, 1280]` (`:38`), signs in via `signInAs(page, ADMIN_FIXTURE)` (`:72-73`), bottom-tab geometry assertions (`:180-208` on `admin-bottom-tab-dashboard` etc.).
- **Tokens:** `app/globals.css` — `--spacing-tap-min: 44px` (`:141`), `--tracking-page-title: -0.02em` (`:138`).
- **Messages:** `lib/messages/lookup.ts` — `messageFor` (`:31`), `getDougFacing` (`:42`), `lookupHelpfulContext` (`:50`), `getRequiredDougFacing` (`:54`). Existing catalog rows reused: `ADMIN_ALERT_COUNT_FAILED` (`lib/messages/catalog.ts:1490-1498`), `ADMIN_ROUTE_LOAD_FAILED` (`:1500`).

## 4. Design

### 4.1 Loader extraction — `lib/admin/loadNeedsAttention.ts`

Move the needs-attention data block (`Dashboard.tsx:325-460`) verbatim into a new module:

```ts
// lib/admin/loadNeedsAttention.ts
export type LoadNeedsAttentionResult =
  | NeedsAttention                                  // from lib/admin/needsAttention.ts:84-89
  | { kind: "infra_error"; message: string };

// No-arg overload constructs the server client INTERNALLY and catches
// construction throws → typed infra_error (the lib/admin/alertCount.ts:11-17
// fetchUnresolvedAlertCount pattern). An optional injected client exists ONLY
// for fetchDashboardData (which already holds one) and for tests.
export async function loadNeedsAttention(
  opts: { cap: number; supabase?: SupabaseClient },
): Promise<LoadNeedsAttentionResult>;
```

When `opts.supabase` is omitted, `createSupabaseServerClient()` is awaited inside a try/catch and a throw returns `{ kind: "infra_error", message: "client construction failed: …" }` — a client-construction fault can therefore never escape the helper as an exception (R1 finding).

- Internally identical to today's block: two bounded queries (`.limit(cap + 1)`), two head-counts, existence lookup, `buildNeedsAttention`. Two deliberate deviations from "verbatim":
  - `cap` replaces the hardcoded `RENDER_CAP` in the queries and in `buildNeedsAttention`'s slice (thread `cap` through `BuildNeedsAttentionInput`; `RENDER_CAP` at `lib/admin/needsAttention.ts:16` remains the dashboard's value and the default).
  - **Count integrity (R2-F3):** the current block falls back from a null PostgREST head-count to the bounded row length (`q.count ?? ingestionRows.length` / `q.count ?? syncRows.length`). The loader instead treats a non-number `count` with no error as `{ kind: "infra_error" }` — same integrity stance as `lib/admin/alertCount.ts:29-31` — because the summary card and badge promise EXACT totals; a silent fallback to a capped row length would understate them. This intentionally changes dashboard behavior on the (integrity-violation) null-count path from "render understated totals" to "render the degraded block"; the well-formed-count path is byte-identical (parity test, §9).
- `fetchDashboardData` calls `loadNeedsAttention({ cap: RENDER_CAP, supabase })` (injecting the client it already constructed) and merges the result into `DashboardData` exactly as today; an `infra_error` from the loader propagates as `fetchDashboardData`'s existing `infra_error` return. **Parity requirement:** dashboard output is bit-identical for the same rows (pinned by regression test, §9).
- The page calls `loadNeedsAttention({ cap: PAGE_RENDER_CAP })` (no injected client — internal construction path) with `PAGE_RENDER_CAP = 100` (single named constant exported from `lib/admin/needsAttention.ts`; every other reference in code/tests derives from it).
- Supabase call-boundary discipline (invariant 9, R3-F2 — **mandatory, not optional**): the moved code already destructures `{ data, error }` and returns typed `infra_error`. BOTH new helpers (`loadNeedsAttention`, `loadNeedsAttentionCount`) get registry rows in `tests/admin/_metaInfraContract.test.ts` in the same commit that creates them — they are typed-result Supabase read helpers, squarely subject; no inline exemption is acceptable. Registry coverage includes grep-shape checks for every Supabase-derived await plus behavioral throw tests (client construction throw + each queried table's returned-error and thrown-await paths → `infra_error`).

### 4.2 Badge count helper — `lib/admin/needsAttentionCount.ts`

The badge needs only `totalCount`. Server-fetched at first paint, refreshed per soft navigation via a route handler (mechanism below):

```ts
export type NeedsAttentionCountResult =
  | { kind: "ok"; count: number }
  | { kind: "infra_error" };

export async function loadNeedsAttentionCount(): Promise<NeedsAttentionCountResult>;
```

- Mirrors `fetchUnresolvedAlertCount` (`lib/admin/alertCount.ts:11-36`) exactly: constructs `createSupabaseServerClient()` internally with construction throws caught → `infra_error`; the two existing head-count queries only (`Dashboard.tsx:347-360` + `:385-398` shapes, both `.is("wizard_session_id", null)`), summed; a non-number `count` with no error is an integrity failure → `infra_error`, never a clean zero (same rationale as `alertCount.ts:29-31`). No row fetches, no existence lookup.
- **Freshness mechanism (R2-F1):** App Router layouts do NOT re-render on soft navigations between sibling segments, so a layout-only fetch would go stale. Two-part design:
  1. **First paint:** `app/admin/layout.tsx` awaits `loadNeedsAttentionCount()` and passes `initialBadgeCount: number | null` to `AdminNav` (null on `infra_error`).
  2. **Per-navigation refresh:** `AdminNav` (already a client component) re-fetches on `usePathname()` change — skipping the initial mount, since the server already supplied it — from a new route handler `app/api/admin/needs-attention-count/route.ts`
  3. **Same-route mutation refresh (R4-F1):** the inbox's Retry/Discard actions call `router.refresh()` without a pathname change — but `router.refresh()` re-renders the layout server tree, so `initialBadgeCount` arrives as a NEW prop value. `AdminNav` must treat the prop as live, not mount-only: badge state syncs whenever `initialBadgeCount` changes (prop-change effect), in addition to the pathname-triggered refetch. Last-writer-wins between the two sources is acceptable (both originate from the same helper). Pinned by test 11b. (GET; gated by the same admin identity check as sibling `app/api/admin/**` routes; body `{ count: number }` on success, error status on `infra_error` — it calls `loadNeedsAttentionCount()` and never leaks raw codes). Any fetch/HTTP/parse failure → badge state set to `null` (hidden), never a thrown render error. The route handler is `app/api/**`, i.e. outside the UI-files-always-Opus surface definition but in-scope for this milestone.
- **Display posture (ratified):** badge renders only from a finite count `> 0`; on `infra_error`/fetch failure the badge is simply not rendered. This is a deliberate fail-quiet *display* decision for a navigation adornment — the fault is still a discriminable typed result at the helper boundary (invariant 9 satisfied; the same fault surfaces loudly on the dashboard/page through their own loaders). Review should not re-litigate fail-quiet here; the alternative (blocking nav chrome on a count query) is worse.
- Cost note: this adds two head-count queries to every admin server navigation. They are `count: "exact", head: true` on small, indexed, admin-only tables; acceptable for a single-admin tool.

### 4.3 The page — `app/admin/needs-attention/page.tsx`

Server component, structure mirroring `app/admin/page.tsx`:

1. Defensive gate: `requireAdminIdentity` (same import as `app/admin/settings/page.tsx:29`) — layout already gates, pages re-gate per convention.
2. `<AdminPageHeader title="Needs attention" sub="Everything waiting on you, across all shows." />`
3. `<AlertBanner />` mounted in its own `<div id="alerts">` exactly as `app/admin/page.tsx:107`. **This amends the M12.3 dashboard-only contract** to "dashboard + needs-attention page" (owner decision D-5). The contract test `tests/e2e/admin-banner.spec.ts:386` and the contract comments at `app/admin/page.tsx:90-96` / `app/admin/show/[slug]/page.tsx:13` update in the same commit. The banner still does NOT mount on settings / dev / per-show / staged routes.
4. Inbox section: `loadNeedsAttention({ cap: PAGE_RENDER_CAP })` — the page MUST NOT construct or inject its own Supabase client for this loader (internal-construction path is what contains construction throws, §4.1/R1) →
   - on `infra_error`: render the dashboard's established inline degraded block (copy pattern of `Dashboard.tsx:498` — catalog-free static copy, no raw codes; invariant 5 holds because no error code is rendered).
   - on success: `<NeedsAttentionInbox items totalCount renderedCount overflowCount now />` — the same component the dashboard uses, unchanged API (`NeedsAttentionInbox.tsx:17-24`). Empty state and "+N more" overflow note come free (`:127-133`, `:144-146`).
5. Page wrapper carries `data-testid="admin-needs-attention-page"`.
5b. **Trust-domain registry (R3-F1, mandatory):** both new routes register in `PROTECTED_ROUTES` (`lib/audit/trustDomains.ts:31`) in the same commit that creates them — `{ path: "app/admin/needs-attention/page.tsx", chain: ["requireAdmin"] }` and `{ path: "app/api/admin/needs-attention-count/route.ts", chain: ["requireAdmin"] }` (matching the existing `app/api/admin/**` rows, e.g. `trustDomains.ts:52-60`). The X.3 auth-chain audit walks `app/api` + `app/admin` live routes (`lib/audit/protectedRoutes.ts:43`) and fails on unlisted/unclassified routes; the registry row — not prose — is what structurally pins the admin boundary.
6. `app/admin/needs-attention/loading.tsx`: skeleton with header bar + 3 stacked list-row placeholders, following `app/admin/loading.tsx`'s silhouette approach. `PageTransition` applies automatically (it wraps all admin children at `app/admin/layout.tsx:112`).

The page fetches alerts (via `AlertBanner`'s self-fetch) and the inbox independently; a failure in one never blanks the other (AlertBanner already degrades internally to `admin-alert-banner-degraded`, `AlertBanner.tsx:145-167`).

### 4.4 Nav changes — `navConfig.ts` + `AdminNav.tsx`

```ts
// navConfig.ts
export type NavItem = {
  id: "dashboard" | "attention" | "settings";
  label: string; short: string; href: string;
  Icon: ComponentType<{ className?: string }>;   // existing Icon type, navConfig.ts:4
  mobileOnly?: true;                 // NEW: excluded from the desktop top bar
};
export const NAV: readonly NavItem[] = [
  { id: "dashboard", label: "Dashboard", short: "Home", href: "/admin", Icon: LayoutGrid },
  { id: "attention", label: "Needs attention", short: "Attention",
    href: "/admin/needs-attention", Icon: Inbox, mobileOnly: true },
  { id: "settings", label: "Settings", short: "Settings", href: "/admin/settings", Icon: Settings },
];
```

- **Desktop top bar** (`AdminNav.tsx:64` block): maps over `NAV.filter((i) => !i.mobileOnly)` — renders exactly today's two links. Desktop unchanged (D-2).
- **Mobile bottom bar** (`AdminNav.tsx:95-125` block): maps over all of `NAV` → three tabs, each still `flex-1` equal width. `shouldRenderOverflow(3)` stays false (threshold 5, `navConfig.ts:12`) — no "More" tab.
- **Active-state matrix** (`isNavItemActive`, `navConfig.ts:20-23`):
  - `settings` ← `pathname === "/admin/settings"` or `startsWith("/admin/settings/")` (unchanged)
  - `attention` ← `pathname === "/admin/needs-attention"` or `startsWith("/admin/needs-attention/")` (new)
  - `dashboard` ← everything else under `/admin` (the existing catch-all now also excludes needs-attention)
- **Badge:** rendered inside the attention tab only, when `badgeCount` is a finite integer `> 0`; text = `count > 9 ? "9+" : String(count)`; absolutely positioned over the icon's top-right (`absolute` chip, accent bg, white text, ~16px tall) so tab height is untouched. Accessible name: the tab link's `aria-label` becomes `` `Needs attention, ${count} item${s}` `` when badged, else "Needs attention". `AdminNav` gains an `initialBadgeCount?: number | null` prop supplied by the layout (`app/admin/layout.tsx:100` mount site; layout calls `loadNeedsAttentionCount` per §4.2) and keeps the live value in client state, refreshed on `usePathname()` change via the §4.2 route handler. `AdminNav` stays a client component; the initial count is plain serialized data.

### 4.5 Mobile dashboard swap — summary card

`Dashboard.tsx` (inside the existing inbox column, so the desktop capture selector `[data-testid=dashboard-inbox-col]` sees identical content):

- Full inbox block gets wrapped in a visibility wrapper that, at `≥720px`, **replicates the exact flex-item role the inbox node had as a direct child** of the stretched dashboard column — the inbox root is `flex h-full flex-col` (`NeedsAttentionInbox.tsx:137`) and relies on its parent for height, so the wrapper must pass that through (shape: `hidden min-[720px]:block min-[720px]:h-full` plus whatever grow/shrink/basis utilities the inbox node carried at its current slot — exact classes verified against the live DOM at plan time, R4-F2). Desktop parity is asserted, not assumed (dimensional invariant 4, §4.8).
- New sibling `<NeedsAttentionSummaryCard className="min-[720px]:hidden" …/>` — `components/admin/NeedsAttentionSummaryCard.tsx`:
  - Whole card is a single `<Link href="/admin/needs-attention">`, `min-h-tap-min` (44px), `data-testid="needs-attention-summary-card"`, card chrome matching sibling cards, chevron right-aligned and vertically centered (`flex items-center justify-between`).
  - **Items state** (`totalCount > 0`): headline "Needs attention · {totalCount}" + up to two chips with **exact** stream counts: "{ingestionTotal} couldn't process" (hidden when 0) and "{syncTotal} to review" (hidden when 0). These are the two head-count values, NOT per-variant counts of the rendered subset — exact at any scale, honoring the capped-list-honesty rule (a 3-way split by `first_seen`/`existing_staged` would require classifying beyond the cap, so it is deliberately NOT offered). The loader result therefore exposes `{ ingestionTotal, syncTotal }` alongside `totalCount` (added to `NeedsAttention` at `lib/admin/needsAttention.ts:84-89`; derived from the same head-counts already fetched — no new queries).
  - **Zero state** (`totalCount === 0`): quiet "All caught up" + muted "Nothing waiting on you." — the card stays rendered and tappable (it is mobile's only inbox entry point besides the tab).
  - This is the dashboard "Need review" card from the original #11 note; the StatStrip "Need review" stat cell (`StatStrip.tsx:95-101`) is unchanged.

### 4.6 Mode boundaries (which element renders where)

| Element | Mobile `<720px` | Desktop `≥720px` |
|---|---|---|
| Bottom tab bar (3 tabs + badge) | ✓ (`min-[720px]:hidden`, existing) | ✗ |
| Desktop top bar (2 links — no Attention) | ✗ | ✓ (`hidden min-[720px]:flex`, existing) |
| Dashboard: full `NeedsAttentionInbox` | ✗ (`hidden min-[720px]:block`) | ✓ |
| Dashboard: `NeedsAttentionSummaryCard` | ✓ (`min-[720px]:hidden`) | ✗ |
| Dashboard: `AlertBanner` | ✓ | ✓ (unchanged) |
| Page `/admin/needs-attention` (header + alerts + full inbox) | ✓ | ✓ (D-2; reachable by URL only) |
| Page: bottom padding clearing tab bar | ✓ (layout `pb-20`, existing `app/admin/layout.tsx:98`) | n/a |

Both dashboard inbox renders exist in the DOM at all widths (CSS-only switching — the same dual-render pattern `AdminNav` already uses at `:64`/`:95`). No JS width detection anywhere.

### 4.7 Guard conditions

| Input | null / absent | 0 | NaN / negative | large |
|---|---|---|---|---|
| badge count (`initialBadgeCount` prop / refreshed client state) | no badge | no badge | no badge (guard: `Number.isFinite(c) && c > 0`) | "9+" when `> 9` |
| `totalCount` (summary card) | — (loader guarantees number; `infra_error` short-circuits to dashboard degraded block before the card renders) | "All caught up" state | n/a (same guarantee) | headline shows exact number; chips show exact numbers |
| `ingestionTotal` / `syncTotal` chips | — | chip hidden | n/a | exact number |
| `items` (page) | — | existing empty state (`admin-needs-attention-empty`) | — | cap 100 + existing "+N more" note |
| Alerts (page) | section renders nothing (AlertBanner returns null) | — | — | banner's own stacking/collapse behavior, unchanged |

### 4.8 Dimensional invariants

Fixed-dimension parents with flex children (Tailwind v4 — no implicit `align-items: stretch`; every relationship explicit and Playwright-asserted):

1. Bottom tab bar: each of the THREE tabs spans full bar height (`self-stretch` per existing tab markup) and equal widths (`flex-1`); bar remains full-viewport-width, bottom-anchored. (Extends existing assertions at `tests/e2e/admin-nav-layout-dimensions.spec.ts:180-208` to the new tab.)
2. Badge must NOT change tab height: badge is absolutely positioned; assert tab heights with badge present == tab heights without (±0.5px).
3. Summary card: `min-h-tap-min` (≥44px) at all mobile widths in the band sweep; chevron vertically centered (`items-center` on the flex row → assert chevron rect vertically centered within card rect ±1px).
4. **Desktop inbox parity through the new wrapper (R4-F2):** at 1080/1280px, the inbox's bounding rect inside the wrapper equals the rect it had as a direct column child — concretely: wrapper height == column content height where the column previously stretched the inbox (`±0.5px`), and the M12.4 equal-height dashboard split (shows table column vs inbox column) still holds.

### 4.9 Transition inventory

All states on these surfaces are **server-rendered per navigation** — there is no client-side state toggling, no `AnimatePresence`, no conditional client render. Route-level animation is the existing `PageTransition` (fade+rise on post-mount navigations, `initial={false}` first paint, reduced-motion safe — `PageTransition.tsx:61-92`), which applies to the new page automatically.

| Transition | Treatment |
|---|---|
| badge hidden ↔ shown (count crosses 0) | instant — changes only on navigation (server render or route-handler refresh); no animation |
| badge n ↔ 9+ | instant — same |
| summary card items ↔ all-caught-up | instant — same |
| page alerts present ↔ absent | instant — same |
| page list ↔ empty state | instant — same |
| dashboard ↔ page route change | PageTransition (existing) |
| any of the above × reduced-motion | PageTransition already disables motion; everything else is instant by design |

Compound transitions: none possible — no two client-side animated states coexist on these surfaces.

### 4.10 Screenshots manifest + help

- Add manifest entry: key `needs-attention-mobile`, route `/admin/needs-attention`, viewport mobile 390×844, selector `[data-testid=admin-needs-attention-page]`, fixture + `frozenClockInstant` consistent with the existing entries (`scripts/help-screenshots.manifest.ts:48-79`). Baseline generated via the sanctioned pinned-docker amd64 procedure (byte-comparison gate discipline).
- `/help/admin/review-queues` MDX gains a short "On your phone" paragraph describing the tab + page and embeds the new screenshot (its test `tests/help/page-review-queues.test.tsx` extends accordingly).
- `dashboard-overview` + `review-queues-empty-state` are desktop captures; the summary card is `display:none` at 1280px so no visual drift is expected. If the screenshots-drift gate reds anyway, regenerate via the pinned procedure — do not hand-edit baselines.

### 4.11 Flag lifecycle

| Flag | Storage | Write path | Read path | Effect |
|---|---|---|---|---|
| `NavItem.mobileOnly` | `navConfig.ts` literal | build-time constant | `AdminNav` desktop-bar filter (§4.4) | item excluded from desktop top bar; mobile unaffected |

No env-gated features; no build-vs-runtime gates. No boolean config stored in DB.

## 5. Error handling summary

| Failure | Surface | Behavior |
|---|---|---|
| Inbox loader `infra_error` (page) | page | inline degraded block (Dashboard `:498` pattern); alerts section still renders |
| Inbox loader `infra_error` (dashboard) | dashboard | unchanged (existing degraded block; summary card not rendered) |
| Badge count `infra_error` (layout fetch) | bottom nav | badge hidden (`null` initial prop); typed at helper boundary; ratified D-4/§4.2 |
| Badge refresh fetch failure (route handler / network / parse) | bottom nav | badge state → `null` (hidden) until next successful fetch; never a thrown render error |
| Alerts fetch fault | page + dashboard | AlertBanner's own degraded row (`admin-alert-banner-degraded`), unchanged |

No raw error codes anywhere (invariant 5). No new catalog rows, so no §12.4 / `gen:spec-codes` / `catalog.ts` lockstep updates.

## 6. DB / migration matrices

**N/A — declared explicitly:** this milestone touches no tables, columns, CHECKs, enums, RPCs, triggers, or migrations. Tier×domain matrix, CHECK/enum migration matrix, validation-project apply, and schema-manifest regen are all out of scope. The `validation-schema-parity` gate is unaffected.

## 7. Watchpoints / do-not-relitigate (for review focus text)

1. **AlertBanner placement contract amended** dashboard-only → dashboard + needs-attention page (owner D-5). `tests/e2e/admin-banner.spec.ts:386` updates in the same commit. Still absent on settings/dev/per-show/staged.
2. **Badge fail-quiet display** with typed helper boundary is ratified (§4.2). Do not demand a loud nav-chrome error state.
3. **Desktop renders the route, no desktop nav link** (owner D-2). Not a bug; no redirect wanted.
4. **Alerts duplicated** on dashboard + page (owner D-5). Intentional.
5. **Two exact chips, not a three-way split** (§4.5) — capped-list honesty; the 3-chip mockup variant was superseded.
6. **Dual-render CSS switching** is the established pattern (`AdminNav.tsx:64`/`:95`); no JS width detection.
7. **`buildNeedsAttention` gains a cap parameter + two total fields** — additive; dashboard parity pinned by regression test.
8. **Badge freshness mechanism** = server-rendered initial count + `usePathname()`-triggered refetch from `app/api/admin/needs-attention-count` (§4.2, R2-F1). A layout-only fetch is known-stale (App Router layout semantics); do not propose moving the fetch back into the layout alone, and do not propose polling/realtime (out of scope §8).
9. **Null head-count ⇒ `infra_error`** (§4.1, R2-F3) is an intentional behavior change from the current `q.count ?? rows.length` fallback, matching `alertCount.ts:29-31`; the well-formed path is parity-pinned.

## 8. Out of scope

- Cross-show MI-11 holds rollup on this page (deferred at sync-feed milestone close; would need a new cross-show holds query).
- Realtime/polling badge updates; push notifications.
- Any desktop top-bar change; any crew-page nav change.
- Retry/Discard server-action changes (the inbox component is reused as-is; its actions already work wherever it mounts — verify, don't modify).
- Root `/` landing page (separate open item).

## 9. Testing

Unit/component (jsdom where layout isn't asserted):
1. **Loader parity regression** — `loadNeedsAttention` with `cap: 20` against fixture rows produces a `NeedsAttention` value whose pre-existing fields (`items`, `renderedCount`, `totalCount`, `overflowCount`) are identical to what the pre-extraction assembly produced (the two new total fields are additive); fixture-derived expectations, not hardcoded. *Failure mode caught: extraction silently changing ordering/classification/counts.*
2. **Cap threading** — fixtures with 25 sync rows: `cap: 20` yields `renderedCount 20 / overflowCount > 0`; `cap: 100` renders all 25. *Catches: cap not threaded through `buildNeedsAttention` slice or the `limit(cap+1)` queries.*
3. **Summary card states** — 0 → "All caught up" (link still present); n>0 → headline exact `totalCount`, chips show exact stream totals, zero-valued chip hidden. Anti-tautology: assertions scope to `[data-testid=needs-attention-summary-card]` only, after removing the sibling full-inbox node from the cloned tree (it renders overlapping labels). *Catches: chips counting the rendered subset instead of head-counts.*
4. **Badge logic** — `null`/`0`/`NaN`/`-1` → no badge node; `3` → "3"; `10` → "9+"; aria-label matrix; refresh-fetch rejection/non-OK/garbage-JSON → badge hidden, no thrown error. *Catches: NaN/negative/fetch-fault leaking into nav chrome.*
4b. **Null head-count integrity** (R2-F3) — head-count query mocked to return `count: null, error: null` with rows present → `loadNeedsAttention` returns `infra_error` (and `loadNeedsAttentionCount` likewise); never a success with row-length totals. *Catches: exact chips/badge silently degrading to capped row counts.*
5. **Active-state matrix** — `isNavItemActive` over `/admin`, `/admin/needs-attention`, `/admin/needs-attention/x`, `/admin/settings`, `/admin/show/abc`: exactly one active id each, dashboard NOT active on needs-attention paths. *Catches: catch-all double-active.*
6. **Desktop bar filter** — rendered `AdminNav` desktop bar contains exactly dashboard+settings links; mobile bar contains all three. Anti-tautology: query within `admin-nav-topbar` / `admin-bottom-tabs` containers respectively. *Catches: `mobileOnly` ignored.*
7. **Page degraded block** — loader mocked to `infra_error` → degraded copy renders, no raw code text in DOM, AlertBanner section still present. *Catches: page hard-crash on infra fault (invariant 5/9).*
7b. **Client-construction throw containment** (R1) — `createSupabaseServerClient` mocked to THROW: `loadNeedsAttentionCount()` resolves `{ kind: "infra_error" }` (never rejects; layout renders nav with no badge), and `loadNeedsAttention({ cap })` resolves `infra_error` (page renders the degraded block). *Catches: construction fault escaping the typed boundary and crashing the admin shell.*

Real-browser (Playwright, extends the existing band-sweep file pattern):
8. **Layout dimensions task** (§4.8 invariants verbatim, including invariant 4 desktop-inbox parity through the wrapper at 1080/1280): 3 tabs across `WIDTHS`, equal widths, full-bar heights, badge height-neutrality, summary-card ≥44px + chevron centering, at 600/719 the summary card is visible and the full inbox has zero client rect (and inversely at 720/1280). *Catches: Tailwind v4 stretch/collapse class bugs jsdom cannot see; wrapper silently breaking the desktop equal-height split.*
9. **Banner placement contract** — banner present on `/admin` AND `/admin/needs-attention`, absent on settings/dev/per-show (amended `admin-banner.spec.ts:386` test). *Catches: accidental layout-level mount.*
10. **Navigation flow** — at 390px: tap summary card → page renders inbox items; tap Attention tab from settings → page; badge text matches seeded pending counts. *Catches: wrong hrefs, badge fed by rendered-subset count.*
11. **Badge freshness across soft navigation** (R2-F1) — load `/admin`, then change seeded pending counts server-side, then client-side navigate (tab tap, no full reload) → badge reflects the new count. *Catches: layout-cached badge going stale because App Router layouts don't re-render on soft navigation.*
11b. **Badge freshness on same-route mutation** (R4-F1) — at 390px on the page (or dashboard), Retry/Discard a seeded pending item (pathname unchanged, `router.refresh()` path) → badge updates to the decremented count without any navigation. *Catches: badge state seeded mount-only from the initial prop and ignoring prop updates.*

Meta-test / structural-registry inventory (declared per plan rule; all MANDATORY, same-commit as the surface they pin):
- `tests/admin/_metaInfraContract.test.ts` — registry rows for `loadNeedsAttention` + `loadNeedsAttentionCount` (R3-F2; §4.1).
- `PROTECTED_ROUTES` in `lib/audit/trustDomains.ts:31` — rows for the new page + count route handler (R3-F1; §4.3.5b).
- Not touched (declared): sentinel-hiding, alert-catalog, advisory-lock, and DML-lockdown registries (no DB writes, no new alert codes, no locks).

## 10. Implementation shape (for writing-plans)

Single milestone, one branch, ~3 phases: (1) loader extraction + count helper + parity tests; (2) nav + badge + page + loading skeleton; (3) dashboard swap + summary card + e2e + manifest/help + impeccable dual-gate. UI throughout → Opus implements; Codex per-phase + whole-milestone adversarial review; real-CI green; merge. Impeccable v3 critique+audit (external attestation) required before close-out (invariant 8).

## 11. Deferred

- `BL-NEEDS-ATTENTION-HOLDS-ROLLUP` (BACKLOG candidate): surface pending MI-11 holds on this page once a cross-show holds read path exists.
