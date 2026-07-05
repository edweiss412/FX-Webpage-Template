# Bell Notification Center — Design Spec

**Date:** 2026-07-05
**Status:** Draft (autonomous-ship approved; user spec/plan review gates waived per AGENTS.md checkpoint)
**Branch:** `feat/bell-notification-center` (worktree off `origin/main` @ `b4ddeb94`)

---

## 1. Summary

Convert the admin nav's `NotifBell` (`components/admin/nav/NotifBell.tsx` — today a dumb `<Link href="/admin#alerts">` with a count badge) into a notification center: a bell-anchored panel where admin alerts land as a feed with a **read/unread axis distinct from resolved**, resolved alerts visible as history, tier-scoped audience, per-(show, code) grouping, and realtime badge updates. The dashboard `AlertBanner` retires; the bell becomes the global alert surface. The two bucket-C trap codes (`BRANCH_PROTECTION_DRIFT`, `BRANCH_PROTECTION_MONITOR_AUTH_FAILED`) convert to `resolution: "auto"` with a real re-detect resolver, so nothing in the bell is a manual-resolve-with-no-re-detection trap.

### Non-goals

- No crew-facing changes (admin-only surface).
- No changes to `PerShowAlertSection` (stays as the contextual show-scoped surface) or `AppHealthIndicator` (stays as the escalating severity dot).
- No changes to the needs-attention inbox or its badge; inbox-routed codes stay out of the bell (§6.3).
- No GC of `admin_alert_reads` in v1 (bounded: ≤ alerts × admins at this team size; revisit if `admin_emails` grows).
- No realtime delivery of alert *content* — realtime is a contentless invalidation ping only (§5).

## 2. Resolved decisions (user-ratified 2026-07-05)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Bell audience | **Tier-scoped**: doug-visible codes for every admin; `audience: "health"` codes additionally for developers only |
| D2 | Read-state scope | **Per-admin**, keyed on canonical email (parity with `resolved_by`, the only actor key plumbed app-side — `requireAdminIdentity()` returns `{ email }`, `lib/auth/requireAdmin.ts:279`) |
| D3 | Read gesture | **Hybrid**: opening the panel clears the numeric badge (per-admin `opened_at` watermark); rows keep an unread dot until individually expanded/clicked (per-row read marks) |
| D4 | History window | **Dev-tunable**: `app_settings.bell_history_days` (default 30) + `app_settings.bell_feed_cap` (default 50), adjustable from a developer-only control (§9) |
| D5 | Grouping | **Collapse per (show_id, code)**: one feed entry per key; latest row is the entry; occurrence chip aggregates repeats (§6.2) |
| D6 | Bucket-C fix | **In scope**: both `BRANCH_PROTECTION_*` codes → `resolution: "auto"` + re-detect resolver in `scripts/verify-branch-protection.ts` (§10) |
| D7 | Liveness | **Supabase realtime push** — contentless ping on a private `admin:alerts` broadcast channel; client refetches on ping (Approach A, ratified over payload-carrying alternatives on redaction grounds) |
| D8 | Consolidation | **Bell replaces AlertBanner** (dashboard + needs-attention mounts removed); per-show section and AppHealthIndicator stay |
| D9 | Pipeline | Autonomous to merged PR (AGENTS.md gate answered "Yes") |

## 3. Data model

### 3.1 New table: `admin_alert_reads` (per-row read marks, D2/D3)

```sql
create table public.admin_alert_reads (
  alert_id uuid not null references public.admin_alerts(id) on delete cascade,
  admin_email text not null,
  read_at timestamptz not null default now(),
  primary key (alert_id, admin_email),
  constraint admin_alert_reads_email_canonical
    check (admin_email = lower(btrim(admin_email)))
);
```

- Email canonicalization at the boundary (invariant 3): the write path passes `requireAdminIdentity().email` (already canonical); the CHECK is the schema safety net, mirroring `app_settings_watched_folder_set_by_email_canonical` (`supabase/migrations/20260520000911_add_email_canonical_checks.sql:22`).
- **Unread semantics**: entry row is unread for viewer V iff no `admin_alert_reads` row for (`latest_row.id`, V) **or** `read_at < latest_row.last_seen_at`. A re-bump (`upsert_admin_alert` conflict arm sets `last_seen_at = now()`, `supabase/migrations/20260505000000_upsert_admin_alert.sql` conflict `do update set last_seen_at = now(), occurrence_count = +1`) therefore re-unreads; a resolve→re-raise mints a fresh row id (partial unique index `admin_alerts_one_unresolved_idx` on `(coalesce(show_id::text,''), code) WHERE resolved_at is null`, `supabase/migrations/20260501001000_internal_and_admin.sql:279`) and is unread by absence.
- Marking read is a **snapshot-stamped upsert**: `/bell/read` carries the entry's `activityAt` as rendered (`{ alertId, seenActivityAt }`), and the upsert stamps `read_at = seenActivityAt` monotonically (`on conflict (alert_id, admin_email) do update set read_at = greatest(admin_alert_reads.read_at, excluded.read_at)`). Never `now()`: if the row re-bumped between the feed snapshot and the click, `last_seen_at > seenActivityAt = read_at`, so the newer occurrence the viewer hasn't seen **stays unread** (adversarial R4 finding 1; same snapshot-safety principle as the §3.2 watermark). `seenActivityAt` is rejected 400 if absent, non-ISO, or > now()+60s.

### 3.2 New table: `admin_bell_state` (badge watermark, D3)

```sql
create table public.admin_bell_state (
  admin_email text primary key,
  opened_at timestamptz not null default now(),
  constraint admin_bell_state_email_canonical
    check (admin_email = lower(btrim(admin_email)))
);
```

- Badge count = number of feed entries (post-grouping, post-audience-scope) whose `activity_at > opened_at` (no row ⇒ `-infinity`, i.e. everything counts). `activity_at = greatest(latest_row.raised_at, latest_row.last_seen_at)`. `resolved_at` deliberately does **not** feed `activity_at` — resolving is not a notification and must not re-badge.
- **Snapshot-safe watermark**: the watermark never advances past the feed snapshot the viewer was shown (within-snapshot no-loss; the cap boundary is separately defined and accepted in §6.4). `seenThrough` is computed **inside `get_bell_feed_rows` itself** — the RPC returns `now()` (the transaction timestamp of the very snapshot the rows were read from) as a column, and the feed route passes it through. Same-snapshot capture means it can neither postdate a row the snapshot missed (post-snapshot commits carry later timestamps on the same DB clock) nor predate a row the snapshot rendered (a rendered row's `activityAt` was written by a transaction that committed before this snapshot, hence ≤ its `now()`), so opening acknowledges exactly the rendered snapshot — no post-open re-badge of rows the viewer just saw, and no absorption of rows they didn't (adversarial R9 finding 1 refinement of the R2 fix). The client's subsequent `/bell/open` POST carries that `seenThrough`, and the upsert stamps it **monotonically**: `on conflict (admin_email) do update set opened_at = greatest(admin_bell_state.opened_at, excluded.opened_at)`, and the insert/update value is the client-supplied `seenThrough`, rejected with 400 if absent, non-ISO, or in the future (small skew tolerance ≤60s). An alert raised between the feed snapshot and the open POST therefore stays `activity_at > opened_at` and re-badges on the next count refresh — it can never be silently absorbed by the open gesture. (Race identified in adversarial review R2; ratified fix.)

### 3.3 Access control for both new tables

All access — reads **and** writes — flows only through server routes using the service-role client; the browser never touches these tables via PostgREST. Per the PostgREST-DML-lockdown discipline (AGENTS.md "PostgREST DML lockdown for RPC-gated tables") and going one step further because the rows expose per-admin behavior (who read what, when): `revoke all on <table> from anon, authenticated;` (SELECT included) in the same migration that creates each table, plus RLS enabled with **no policies** for client roles. An admin must not be able to query another admin's watermarks or read marks directly; the feed route only ever returns the *viewer's own* read state folded into entries. A structural meta-test pins the full REVOKE (§16), and a route test asserts a direct authenticated PostgREST `select` on each table is refused (§17).

### 3.4 `app_settings` columns (D4)

`app_settings` is the existing singleton config row (`id = 'default'`, `constraint app_settings_singleton check (id = 'default')`, `supabase/migrations/20260501001000_internal_and_admin.sql:232-247`). Add:

```sql
alter table public.app_settings
  add column if not exists bell_history_days integer not null default 30,
  add column if not exists bell_feed_cap integer not null default 50;
alter table public.app_settings
  drop constraint if exists app_settings_bell_history_days_range,
  add constraint app_settings_bell_history_days_range check (bell_history_days between 1 and 365),
  drop constraint if exists app_settings_bell_feed_cap_range,
  add constraint app_settings_bell_feed_cap_range check (bell_feed_cap between 10 and 200);
```

**Developer-gate scope, stated precisely:** the `/bell/config` route's `requireDeveloperIdentity` gate is a product-surface gate. `app_settings` pre-dates this feature with UPDATE granted to `authenticated` under the `is_admin()` RLS policy, so a non-developer admin could in principle PATCH these columns directly through PostgREST — the same accepted class as every existing `app_settings` column and as `BACKLOG.md:216` (`BL-HEALTH-RESOLVE-DB-LOCKDOWN` / the broader `BL-ADMIN-POSTGREST-DML-LOCKDOWN` class): Doug is the trusted business owner, not an adversary, and the worst-case outcome is a benign display-window change bounded by the CHECKs. DB-enforced developer gating for `app_settings` is explicitly deferred to that backlog class, not silently omitted.

Apply-twice idempotent: column creation and named-CHECK recreation are separate statements (above) so a reapply against existing columns still recreates the constraints — the established form (AGENTS.md CHECK/enum matrix item d; live precedent `supabase/migrations/20260520000911_add_email_canonical_checks.sql:12-25`).

### 3.5 Migration checklist (validation parity)

Every migration in this feature follows the post-migration checklist (AGENTS.md "Every migration must reach the validation project"): local apply + tests → `pnpm gen:schema-manifest` (commit regenerated manifest) → surgical apply to validation (`psql "$TEST_DATABASE_URL" -f ...` from the MAIN checkout's `.env.local`, per memory) → `notify pgrst, 'reload schema'`. The `validation-schema-parity` CI job enforces both layers.

## 4. API surface

All four routes are admin API routes under `app/api/admin/alerts/bell/`, following the `needs-attention-count` contract exactly (`app/api/admin/needs-attention-count/route.ts:8-22`): `requireAdminIdentity()` guard, `AdminInfraError → 503 {error:"unavailable"}`, `forbidden()/notFound()` control flow propagates, `Cache-Control: no-store`, `dynamic = "force-dynamic"`.

| Route | Method | Auth | Effect | Response |
|-------|--------|------|--------|----------|
| `/api/admin/alerts/bell/feed` | GET | admin | none (read) | `{ entries: BellEntry[], unseenCount: number, truncated: boolean, historyDays: number, feedCap: number, seenThrough: string }` (`historyDays`/`feedCap` echo the live config so the truncation row and dev footer render authoritative values; `seenThrough` per §3.2) |
| `/api/admin/alerts/bell/count` | GET | admin | none (read) | `{ count: number }` (unseen-entry count only; cheap badge refresh) |
| `/api/admin/alerts/bell/open` | POST `{ seenThrough }` | admin | monotonic upsert `admin_bell_state.opened_at = greatest(existing, seenThrough)` (§3.2) | `{ ok: true }` |
| `/api/admin/alerts/bell/read` | POST `{ alertId, seenActivityAt }` | admin | monotonic upsert `admin_alert_reads.read_at = greatest(existing, seenActivityAt)` for (alertId, viewer) (§3.1) | `{ ok: true }` |
| `/api/admin/alerts/bell/config` | POST `{ historyDays, feedCap }` | **developer** (`requireDeveloperIdentity`, `lib/auth/requireDeveloper.ts`) | update `app_settings` columns (server-side validation against the CHECK ranges; out-of-range → 400, §12) | `{ ok: true, historyDays, feedCap }` |

- `read` validates `alertId` is a UUID and (fail-closed) that the alert exists and is visible to the viewer's tier before upserting; unknown/invisible id → 404, never a write.
- **Invariant 10 (admin mutation observability)**: the three mutating routes (`open`, `read`, `config`) are admin mutations under `app/api/admin/**` and therefore each get an `AUDITABLE_MUTATIONS` registry row (`tests/log/_auditableMutations.ts`, keyed `{ file, fn: "POST", code }`) with post-commit `logAdminOutcome` success emits — forensic codes `BELL_OPENED`, `BELL_READ_MARKED`, `BELL_CONFIG_UPDATED` (§12.4-scanner-exempt via the adminOutcome registry) — plus executable success-branch behavioral proof in `tests/log/adminOutcomeBehavior.test.ts` (sink-spy records only after the committed-success branch). The `token` mint route (§5.3) performs no state change: it gets an explicit `ADMIN_SURFACE_EXEMPTIONS` row (`tests/log/mutationSurface/exemptions.ts`, "verified read-only accessor"). The discovery meta-test `tests/log/_metaMutationSurfaceObservability.test.ts` is filesystem-walked, so all four rows are mandatory, not optional.
- Every Supabase call in these routes destructures `{ data, error }` and registers in the infra-contract meta-test or carries `// not-subject-to-meta` (invariant 9; §16).
- Failures of `open`/`read` on the client are **fail-quiet** (badge/dot simply doesn't update; retried on next gesture) with server-side forensic logging via the established `logAdminOutcome` post-commit pattern (scanner-exempt via `tests/admin/_metaAdminOutcomeContract` — plan verifies registration shape).
- New admin routes are added to the TRUST_DOMAINS / route-registry gates as required (memory: "new admin route → TRUST_DOMAINS"; plan enumerates the exact registries by running the relevant meta-tests).

## 5. Realtime (D7)

Mirrors the established show-invalidation pattern end to end.

### 5.1 DB publish

New statement-level trigger on `admin_alerts` (INSERT and UPDATE), SECURITY DEFINER function mirroring `publish_show_invalidation_after_statement()` (`supabase/migrations/20260504000000_realtime_private_channel_authorization.sql:50-77`):

```sql
perform realtime.send('{}'::jsonb, 'changed', 'admin:alerts', true);
```

- **Contentless by design**: the payload carries no alert data, so the `projectIdentityContext → resolveAlertIdentities` sanitizer chokepoint (`lib/adminAlerts/projectIdentityContext.ts`, `lib/adminAlerts/resolveAlertIdentities.ts`; redaction posture per AGENTS.md telemetry section) remains the sole owner of what reaches a browser. This was the deciding argument for Approach A over payload-carrying realtime.
- Statement-level with a single send per statement (no per-row loop needed — the signal is binary).
- `revoke all on function ... from public, anon, authenticated` (same lockdown as the show publisher, `20260504000000:76`).

### 5.2 Authorization

New SELECT policy on `realtime.messages` alongside the existing show policy (`fxav_show_invalidation_subscriber_select`, `20260504000000:152-167`):

```sql
create policy fxav_admin_bell_subscriber_select
  on realtime.messages for select to authenticated
  using (
    topic = 'admin:alerts'
    and (current_setting('request.jwt.claims', true)::jsonb ->> 'viewer_kind') = 'admin'
  );
```

The existing policy is topic-anchored to `^show:<uuid>:invalidation$` and unaffected. No INSERT policy exists on `realtime.messages` (client publish stays fenced).

### 5.3 Token mint

New route `POST /api/admin/alerts/bell/token` (admin-gated, sibling of the routes in §4) minting the same JWT shape as `/api/realtime/subscriber-token` (`app/api/realtime/subscriber-token/route.ts:34-56`): HS256 against `SUPABASE_JWT_SECRET` (≥32-byte check), `iss = SUPABASE_REALTIME_ISS`, `role: 'authenticated'`, `viewer_kind: 'admin'`, `sub: '<admin>'`, `exp` +5 min, **no `show_id` claim** (the bell policy doesn't need one). Missing env → 500, no leak — same contract as the existing mint. POST for the same non-cacheability rationale documented there.

### 5.4 Client

`NotifBell` becomes a client component (it already sits inside the `"use client"` `AdminNav`, `components/admin/nav/AdminNav.tsx:135-142`). A `useBellBadge` hook composes:

1. **Initial server prop** — layout-provided unseen count (§7.1).
2. **Prop sync + pathname refetch** — exactly the `useNeedsAttentionBadge` race-safe pattern (`components/admin/nav/useNeedsAttentionBadge.ts`): monotonic token, abort in-flight, fault → keep last-known count (bell) rather than hide.
3. **Realtime ping** — on mount, fetch a token from §5.3, `supabase.realtime.setAuth(jwt)`, subscribe to private channel `admin:alerts` (`config: { private: true, broadcast: { self: false } }`, mirroring `lib/realtime/subscribeToShow.ts`), and on `changed` refetch `/bell/count` (and the feed too, if the panel is open). Token expiry/channel error → tear down and re-mint once; on repeated failure degrade silently to mode 2 (realtime is an enhancement, never load-bearing).

## 6. Feed semantics (grain & contract)

### 6.1 Source read — entry grain, one read-only RPC (adversarial R5 restructure)

Capping raw resolution events before grouping would let one flappy key consume the whole cap and starve distinct history entries (R5 finding 1). The source read is therefore defined **at entry grain in SQL**: a read-only SECURITY DEFINER function `get_bell_feed_rows(p_history_days int, p_cap int, p_excluded_codes text[])` (execute REVOKEd from `public, anon, authenticated`, granted to `service_role` only — same lockdown form as `upsert_admin_alert`, `supabase/migrations/20260505000000_upsert_admin_alert.sql`), called from the feed/count routes via the service-role client. Internally:

- **Active arm**: all `resolved_at is null` rows — already entry-grain, guaranteed by the partial unique index — ordered by `greatest(raised_at, last_seen_at) desc`, `limit p_cap`.
- **History arm**: `distinct on (coalesce(show_id::text,''), code)` over rows with `resolved_at >= now() - p_history_days`, keeping the latest resolution per key (`order by key, resolved_at desc`), excluding keys present in the active arm (their history folds into the active entry's occurrence sum instead), ordered by `resolved_at desc`, `limit p_cap`.
- **Occurrence aggregate**: one CTE computes, per key, `resolved_occurrence_sum = sum(occurrence_count)` over resolved rows inside the window; returned as a column on both arms.
- Returns one row per entry: latest-row fields (`id, code, show_id, context, occurrence_count, raised_at, last_seen_at, resolved_at`), `slug` (join `shows`), `resolved_occurrence_sum`, `is_active`, plus `arm_hit_cap` flags so the route can set `truncated` without a second read, and `seen_through` (`now()` — the snapshot's transaction timestamp, §3.2) on every row.
- Audience scoping happens **inside the RPC, before the caps**: the route derives the viewer-appropriate exclusion set from the catalog-derived TS constants (§6.3) and passes it as the third argument (`code <> all(p_excluded_codes)` applied in both arms **inside** the CTEs, before each arm's `limit p_cap` — a SQL test fails if filtering moves after either cap). The route passes exactly the §6.3 sets: non-developer → `HEALTH_CODES ∪ INBOX_ROUTED_CODES`; developer → `INBOX_ROUTED_CODES` (inbox-routed codes stay out of *every* tier's bell — the needs-attention inbox owns them). An empty array excludes nothing and has **no current caller** (reserved; nothing in this feature passes it); NULL is rejected (the function raises rather than silently skipping the filter). The §17 audience-matrix test pins that a developer feed never contains an inbox-routed code. Scoping after the cap would let a dev-only health flood starve Doug's feed; passing the set in keeps the catalog-derived TS constants the single source of truth (no SQL copy of the code lists to drift).

| Unit | Grain | Contract |
|------|-------|----------|
| `get_bell_feed_rows` RPC | **one row per (show_id ?? '', code)** — both arms | entry-grain rows ≤ 2×p_cap, occurrence sums over the window, internal LIMITs (bounded-by-construction; §16) |
| `shapeBellEntries()` (pure TS) | one `BellEntry` per RPC row | merges arms, computes `occurrences` (§6.2), truncates to `feedCap` entries total (active first), sets `truncated` from `arm_hit_cap` ∪ TS truncation |
| feed route | one response per viewer | entries + viewer-relative `unread` flags + `unseenCount` + `seenThrough` |

### 6.2 `BellEntry` shape

```ts
type BellEntry = {
  alertId: string;          // latest row id (read-mark key)
  code: string;
  showId: string | null;
  slug: string | null;      // from shows(slug) embed
  state: "active" | "history";      // any unresolved row → active
  activityAt: string;       // greatest(raised_at, last_seen_at) of latest row
  resolvedAt: string | null;        // latest row's resolved_at (history only)
  occurrences: number;      // active: latest row's occurrence_count + resolved_occurrence_sum (window); history: resolved_occurrence_sum
  unread: boolean;          // §3.1 rule, viewer-relative
  identity: SerializedAlertIdentity | null;  // via the §5.1 chokepoint, includePii: true (admin web surface)
  isAutoResolving: boolean; // lib/adminAlerts/audience.ts:isAutoResolving
  autoResolveNote: string | null;   // audience.ts:autoResolveNote when isAutoResolving
  action: { href: string; label: string; external: boolean } | null; // lib/adminAlerts/alertActions.ts:resolveAlertAction
  isHealth: boolean;        // audience === "health" (dev-only rows)
};
```

Copy is derived exclusively through `lib/messages/lookup.ts` (`getRequiredDougFacing` / `messageFor`; invariant 5 — no raw codes; admin surface renders dougFacing only). Uncataloged codes: the feed **includes** them (fail-visible, exclusion-not-allowlist per `lib/messages/adminSurface.ts:36-40`) but the row renders via `isMessageCode` guard with the generic fallback the banner uses today (plan cites the exact fallback; `lookup.ts` throws on unknown codes so the guard is mandatory).

### 6.3 Audience scoping (D1)

- **Every admin**: exclude `HEALTH_CODES` (`lib/adminAlerts/audience.ts:14-16`) and `INBOX_ROUTED_CODES` (`lib/messages/adminSurface.ts:22-24` — SHEET_UNAVAILABLE / PARSE_ERROR_LAST_GOOD live in the needs-attention inbox with their own badge; including them would double-count and violate their auto-clear-only contract).
- **Developers** (`viewerIsDeveloper`, threaded from `app/admin/layout.tsx` exactly as today): additionally include `HEALTH_CODES`.
- **Info-severity codes are included for everyone** — deliberate change vs the banner/count exclusion (`DOUG_SURFACE_EXCLUDED_CODES` unions `INFO_SEVERITY_CODES`, `lib/messages/adminSurface.ts:41-43`): info codes are precisely the one-shot "X happened" notices (bucket A) that a notification feed exists for. The needs-attention badge and health rollup are untouched.
- Scoping runs **server-side in the feed/count routes** — the bell endpoints never *return* rows outside the viewer's tier, and the `read` endpoint refuses to write for invisible ids (§4). **Scope boundary, stated precisely:** this is product-surface routing, not a DB trust boundary. `admin_alerts` itself still GRANTs SELECT/UPDATE to any `is_admin()` caller via PostgREST — a pre-existing, **ratified acceptance** (`BACKLOG.md:216` `BL-HEALTH-RESOLVE-DB-LOCKDOWN`: "Doug is the trusted business owner, not an adversary; role filtering is UX not security"), unchanged by this feature and out of scope here. The bell's *new* tables are held to the stricter full-lockdown standard (§3.3) because they are new surface with no legacy consumers.

### 6.4 Badge count

`unseenCount` = entries (post-scope, post-group) with `activityAt > viewer.opened_at`, computed over the **same capped snapshot the feed renders** — `/bell/count` runs the identical pipeline (scope → group → cap) so badge and panel can never disagree. **Cap-limited by definition (accepted lossy boundary, adversarial R4 finding 2 disposition):** entries pushed beyond `bell_feed_cap` by newer activity leave both the badge and the panel together; the truncation row (§7.3) is the signal that more exist, and the feed is activity-ordered so anything dropped is by construction older than everything counted. `/bell/open` likewise acknowledges the snapshot window, not "everything ever" — §3.2's no-loss guarantee is scoped to the rendered snapshot, and a §17 test pins the boundary (a beyond-cap unseen entry is neither counted nor absorbed permanently: its next re-bump re-enters the window unread). This **replaces** `fetchUnresolvedAlertCount` (`lib/admin/alertCount.ts`) as the bell's number; `AlertCountResult`'s `infra_error` arm maps to the existing degraded bell rendering (`NotifBell` degraded branch keeps its `ADMIN_ALERT_COUNT_FAILED` copy). `fetchUnresolvedAlertCount` itself is deleted with the banner if no other consumer remains (plan greps; the layout is its only current consumer besides the banner).

## 7. UI

### 7.1 Bell + badge

The bell mounts in **both admin chrome variants** — `AdminNav`'s action cluster keeps its order (AppHealthIndicator · bell · ThemeToggle · UserMenu, `AdminNav.tsx:135-142`), and `OnboardingTopBar` (the first-run chrome the layout renders instead of AdminNav, `app/admin/layout.tsx:146`) gains the same bell beside its existing `AppHealthIndicator` (`components/admin/nav/OnboardingTopBar.tsx:71`), with identical count/panel/realtime behavior — one shared component, no onboarding fork. Without this, retiring the banner would leave first-run onboarding with no non-health alert surface (adversarial R8 finding). The layout's onboarding branch passes the same initial-count prop it computes for the main branch (`app/admin/layout.tsx:161`). The bell button preserves today's testids and a11y contract (`admin-notif-bell`, `admin-notif-badge`, degraded `admin-notif-bell-degraded` with `!` chip; count display caps at `9+`; badge hidden at 0 — `NotifBell.tsx`) but becomes `<button aria-haspopup="dialog" aria-expanded>` instead of a Link. The layout passes the initial unseen count (computed server-side alongside the existing `healthRollup`/`needsAttentionCount` fetches in `app/admin/layout.tsx`).

### 7.2 Panel

Clone of the `AppHealthPopover` shell (`components/admin/AppHealthPopover.tsx`): `role="dialog" aria-modal`, `useDialogFocus` trap/restore (`lib/a11y/dialogFocus.ts`), Esc + scrim close, bottom-sheet mobile → centered/near-anchored desktop (`fixed inset-0 z-50 flex items-end justify-center sm:items-center`, panel `w-full max-w-[420px] rounded-t-md sm:rounded-md bg-surface shadow-tile motion-safe:animate-[sheet-rise…]`). DESIGN.md's anti-modal rule is satisfied the same way AppHealthPopover already justifies it: a bell popover is a transient, user-summoned, single-tap-dismissed overlay (dropdown-class), not a workflow modal; on mobile it uses the ratified responsive sheet pattern.

Opening the panel: fetch `/bell/feed`, render, then POST `/bell/open` with the response's `seenThrough` (§3.2 — the watermark advances only to the snapshot the viewer actually saw, so an alert landing mid-open re-badges rather than being absorbed). The numeric badge zeroes immediately client-side; a later `/bell/count` refresh restores any post-snapshot arrivals.

### 7.3 Rows

Two sections in one scrollable list (panel body `max-h-[70vh] overflow-y-auto` mobile / `max-h-[480px]` desktop):

- **Active** (`state: "active"`): full-intensity list rows — unread dot (when `unread`), catalog `title`, dougFacing line, identity line (`SerializedAlertIdentity` segments, same renderer as the banner), occurrence chip (`×N` when `occurrences > 1`, `rounded-sm` badge), relative time from `activityAt`, and an action row:
  - manual + non-health → **Resolve** button posting to the existing routes (global `app/api/admin/admin-alerts/[id]/resolve/route.ts` — door order 403 HEALTH → 409 auto → 400 show-scoped → 200 preserved; show-scoped rows post to `/api/admin/show/[slug]/alerts/[id]/resolve` via the entry's `slug`, matching `PerShowAlertSection`'s rule that per-show alerts never use the global route).
  - auto → no button; `autoResolveNote` in `text-text-subtle`.
  - health (dev view) → no inline resolve (the global route 403s health codes by design); deep-link "View in telemetry" to `/admin/dev/telemetry#health`, matching the AppHealthIndicator dev affordance.
  - action link chip when `action` non-null (`resolveAlertAction` registry).
  - **Carry-over**: `WATCH_CHANNEL_ORPHANED`'s Retry affordance (today a banner form posting `retryWatchSubscriptionFormAction`, `components/admin/AlertBanner.tsx:34`) moves onto its bell row — the banner's removal must not orphan it.
- **History** (`state: "history"`): dimmed rows (`text-text-subtle`, no unread dot, no resolve), "Resolved <relative time>" line, grouped under a "History (last N days)" subheader using the configured window.
- **Empty state**: `bg-surface-sunken` panel body, "You're all caught up." + subline noting history window.
- **Error state**: feed fetch failed → panel body renders the new `ALERT_BELL_FEED_FAILED` catalog copy (§11) with a Retry button; badge falls back to last-known.
- **Truncation** (`truncated: true`): terminal row "Showing the first {cap} — older items are in telemetry" (dev) / "…older items age out" (non-dev).
- Clicking/expanding a row (rows expand to show `helpfulContext`, mirroring the banner's ErrorExplainer disclosure) POSTs `/bell/read` with the entry's rendered `activityAt` as `seenActivityAt` (§3.1) and clears its dot optimistically.

### 7.4 Dev footer (D4)

`viewerIsDeveloper` only: a compact footer row "Window: {historyDays}d · Cap: {feedCap}" with an inline edit (two number inputs + Save → `/bell/config`). Hidden entirely for non-devs.

## 8. AlertBanner retirement (D8)

- Remove `<AlertBanner />` mounts from `app/admin/page.tsx:113` and the needs-attention page (the component's own doc comment names both mounts: "dashboard + /admin/needs-attention only", `app/admin/page.tsx:93`).
- Delete `components/admin/AlertBanner.tsx`, `AlertBannerRouteBoundary`, and their tests **after** confirming every affordance has a bell home: resolve forms → §7.3; Retry → §7.3 carry-over; the `#alerts` anchor target and `NotifBell`'s `href="/admin#alerts"` disappear together.
- `resolveAdminAlertFormAction` (`app/admin/actions.ts`) is retained only if the bell reuses it as a server action; otherwise the bell posts to the fetch routes and the action is removed with the banner (plan greps remaining consumers; needs-attention/per-show surfaces have their own wiring).
- Class-sweep at removal time: grep for `AlertBanner`, `#alerts`, `BANNER_EXCLUDED_CODES` consumers, and update `lib/messages/adminSurface.ts` doc comments that name the banner as a consumer (`adminSurface.ts:4-9`) — stale docs are an adversarial-review magnet.

## 9. Bucket-C conversion (D6)

1. **Catalog**: `BRANCH_PROTECTION_DRIFT` (`lib/messages/catalog.ts:1866`) and `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` (`catalog.ts:1884`) flip `resolution: "manual"` → `"auto"`. Add both to `AUTO_RESOLVE_NOTES` (`lib/adminAlerts/audience.ts:70-79`), e.g. "Clears automatically the next time the branch-protection monitor verifies the settings." / "…the next time the monitor authenticates successfully."
2. **§12.4 lockstep**: if the master-spec §12.4 rows encode resolution semantics for these codes, the three lockstep updates land in one commit (spec prose + `pnpm gen:spec-codes` + `catalog.ts`) per AGENTS.md; if §12.4 doesn't carry the field, only the catalog changes (plan verifies which, via `tests/messages/codes.test.ts` x1 parity).
3. **Re-detect resolver** in `scripts/verify-branch-protection.ts` (raise sites: auth failure → `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` at `:266/:286/:309`; drift → `BRANCH_PROTECTION_DRIFT`; clean path currently only writes the ok report):
   - auth succeeded (any branch past the auth gates) → resolve open `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` (global scope).
   - `ok: true` → additionally resolve open `BRANCH_PROTECTION_DRIFT`.
   - Resolver mirrors `emitAlert`'s tolerance (`ADMIN_ALERT_SKIP_PREFIX` console path, local/unset `SUPABASE_URL` guard via `localSupabaseReason`) — a failed resolve degrades to a logged no-op; JSON report + exit code stay authoritative. Direct service-role UPDATE in the script (same client it already holds), scoped `code + show_id is null + resolved_at is null`, matching the `resolveBotLoginAlertRow` template (`lib/reports/botLoginAlert.ts:46-77`) including the typed-infra-fault posture where the meta-test registry demands it.
   - Effect on UI is automatic: `isAutoResolving` derives from the catalog, so the 409 door on the resolve routes and the suppressed button + note on every surface (per-show, health panel, bell) light up with zero per-surface code.
   - Cadence note: the monitor runs on the Monday cron + main pushes (`.github/workflows/x-audits.yml:8-9`), so auto-clear latency is up to a week; the note copy says "next time the monitor runs", and this latency is accepted (preempt: do not relitigate — the alternative, keeping manual resolution, is the trap this change removes).

## 10. Security & privacy posture

- Feed/count/read/open/config/token routes: `requireAdminIdentity` (config: `requireDeveloperIdentity`); service-role clients only inside route handlers; both new tables REVOKEd from `anon`/`authenticated` for DML (§3.3).
- Identity display: every entry's `context` passes through `projectIdentityContext → resolveAlertIdentities` server-side; the browser receives only `SerializedAlertIdentity` (`lib/adminAlerts/identityTypes.ts:69`). `includePii: true` (admin web surface carve-out, same as banner/per-show/health panel). Token-shaped substrings always redacted.
- Realtime: contentless ping; private channel; RLS policy admits only `viewer_kind: 'admin'` JWTs on the exact topic `admin:alerts`; mint requires an authenticated admin session; no INSERT policy on `realtime.messages`.
- `read` endpoint validates visibility before writing (§4) so a non-dev admin cannot probe health-alert ids by marking them read.

## 11. Message catalog changes

| Code | Change | Lockstep |
|------|--------|----------|
| `ALERT_BELL_FEED_FAILED` | **New** — bell panel feed-fetch failure copy ("We couldn't load your notifications…" + Retry) | Full new-code path: §12.4 row + `pnpm gen:spec-codes` + `catalog.ts` in one commit, plus the four extra CI touchpoints (x2 `gen:internal-code-enums`, help `_families`, TRUST_DOMAINS if help route, full suite) per memory `new §12.4 code = 4 more CI gates` |
| `ADMIN_ALERT_COUNT_FAILED` | Reused as-is for degraded badge (existing `NotifBell` copy) | none |
| `BRANCH_PROTECTION_*` ×2 | `resolution` flip (§9) | §12.4 lockstep only if the prose encodes resolution (§9.2) |

No other codes. `open`/`read` failures are fail-quiet client-side and log server-side via `logAdminOutcome` (scanner-exempt registry), so they mint **no** user-visible codes.

## 12. Guard conditions

| Input | null/absent | 0/empty | invalid |
|-------|-------------|---------|---------|
| initial badge count prop | badge hidden, bell renders | badge hidden | non-finite → hidden (mirrors `AdminNav.tsx` mobile-badge guard) |
| `AlertCountResult.kind === "infra_error"` | — | — | degraded bell (`!` chip), panel still openable; feed route is authoritative once open |
| feed `entries` | error state (§7.3) | empty state (§7.3) | — |
| `entry.slug` | global row → global resolve route; no show link | — | — |
| `entry.identity` | identity line omitted | segments empty → omitted | — |
| `entry.action` | no action chip | — | — |
| `autoResolveNote` when `isAutoResolving` | generic fallback line (audience.ts:84 guarantees non-null) | — | — |
| `occurrences` | — | ≤1 → no chip | non-number → no chip |
| `historyDays`/`feedCap` config input | reject 400 | reject 400 | non-integer / out of CHECK range → reject 400 with field-level message (no silent clamp; response mirrors the CHECK bounds so the dev control can render them) |
| uncataloged `code` in a row | `isMessageCode` guard → generic fallback copy, no throw (§6.2) | — | — |
| realtime token mint failure / channel error | silent degrade to pathname-refetch mode (§5.4) | — | — |
| `open` body `seenThrough` | reject 400 (no write) | reject 400 | non-ISO or > now()+60s → 400; older than existing watermark → 200 no-op (monotonic guard) |
| `read` body `seenActivityAt` | reject 400 (no write) | reject 400 | non-ISO or > now()+60s → 400; older than existing read mark → 200 no-op (monotonic guard) |
| `opened_at` missing (first ever open) | everything unseen (−infinity watermark) | — | — |

## 13. Transition inventory

States: panel closed (C), panel open (O), badge n>0 (B+), badge 0 (B0), badge degraded (B!), row unread (U), row read (R), row active (A), row history (H), feed loading (L), feed error (E), feed empty (Z).

| Transition | Treatment |
|------------|-----------|
| C→O / O→C | AppHealthPopover's existing `sheet-rise` motion-safe animation / instant close (mirrors clone source; `motion-reduce:animate-none`) |
| B+→B0 (panel opened) | instant (badge unmounts; no count-down animation) |
| B0→B+ (ping/refetch) | instant mount — no pulse in v1 (declared: instant, no animation needed) |
| B+→B+ (count change) | instant text swap |
| any→B! / B!→any | instant swap of badge variant |
| U→R (row clicked) | dot fades `duration-fast`; optimistic, no layout shift (dot occupies fixed slot) |
| A→H (resolved while open) | **no live re-sort**: feed is a snapshot; entry updates only on next open/refetch. Declared: instant on refetch, no cross-section animation |
| L→(feed rendered) / L→E / L→Z | instant swap (spinner → content), no crossfade |
| E→L (retry) | instant |
| row collapsed→expanded (helpfulContext disclosure) | height auto-expand, same treatment as the banner's ErrorExplainer disclosure today |
| **Compound**: ping arrives while panel open | feed refetches in place; newly-arrived rows mount unread at top, no reflow animation (declared instant). Badge reflects the refetched snapshot's `unseenCount` — post-snapshot arrivals may re-badge until the viewer's next open stamps a newer `seenThrough` (§3.2 consistency) |
| **Compound**: resolve clicked while a read POST is in flight | independent endpoints; row moves to resolved rendering on route 200 via refetch; read mark upsert is idempotent either way |
| **Compound**: dev edits config while feed open | Save → refetch feed with new window; instant re-render |

All N-state pairs not listed are unreachable (e.g., E and Z are exclusive terminal render states of one fetch) — declared explicitly rather than animated.

## 14. Dimensional invariants

The panel has no fixed-dimension parent with flex/grid children that must fill it: rows are natural-height list items in a scrollable column (`overflow-y-auto` with `max-h`). **Declared: no dimensional invariants beyond** (a) the badge slot: unread dot occupies a fixed `size-2` slot whether visible or not (guards the U→R no-layout-shift claim), and (b) panel width `w-full max-w-[420px]` — both verified with the standard real-browser Playwright assertion per the writing-plans rule (the plan's layout-dimensions task covers exactly these two).

## 15. Flag lifecycle

| Flag/field | Storage | Write path | Read path | Effect |
|------------|---------|-----------|-----------|--------|
| `bell_history_days` | `app_settings` | `/bell/config` (dev) | feed route | resolved-window bound + history subheader copy + truncation copy |
| `bell_feed_cap` | `app_settings` | `/bell/config` (dev) | feed route | query limits + entry truncation + truncation row |
| `admin_bell_state.opened_at` | new table | `/bell/open` (client-supplied `seenThrough`, monotonic greatest-wins, §3.2) | feed+count routes | badge watermark |
| `admin_alert_reads.read_at` | new table | `/bell/read` (client-supplied `seenActivityAt`, monotonic greatest-wins, §3.1) | feed route | per-row unread dot |
| `resolution` (2 codes) | catalog | this change (static) | `isAutoResolving`/409 door/UI suppression | converts trap codes to auto |

No zombie flags: every row above has all four columns filled.

## 16. Meta-test inventory (declared per AGENTS.md)

| Registry | Action |
|----------|--------|
| `tests/admin/_metaBoundedReads.test.ts` | the feed read moves into `get_bell_feed_rows` (internal `limit p_cap` per arm, bounded by construction — a SQL test pins both LIMITs); any remaining direct `.from("admin_alerts")` read this feature adds still registers here |
| `tests/admin/_metaInfraContract.test.ts` / `tests/auth/_metaInfraContract.test.ts` | every new Supabase call site registers or carries `// not-subject-to-meta` |
| `tests/admin/_metaManualResolveRegistry.test.ts` | bell registers as a manual-resolve surface (inbox-routed refusal is structural — those codes never enter the feed, but the registry pins it) |
| `tests/messages/_metaAdminAlertCatalog.test.ts` | unchanged (no new producer codes) — `ALERT_BELL_FEED_FAILED` is UI-only, not an `upsert` code; declared N/A with this reason |
| **New**: DML-lockdown meta-test rows | `admin_alert_reads`, `admin_bell_state` pinned fully REVOKEd — SELECT included, per §3.3 (extend the existing postgrest-dml-lockdown suite) |
| `tests/log/_metaMutationSurfaceObservability.test.ts` + `tests/log/_auditableMutations.ts` | three `AUDITABLE_MUTATIONS` rows (`open`/`read`/`config`) + one `ADMIN_SURFACE_EXEMPTIONS` row (`token`) per §4 |
| `tests/log/adminOutcomeBehavior.test.ts` | executable success-branch proof for `BELL_OPENED` / `BELL_READ_MARKED` / `BELL_CONFIG_UPDATED` |
| `tests/observe/_metaReadOnlyQueryCore.test.ts` | N/A — no `lib/observe/query/**` changes |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | N/A — no `pg_advisory*` surface touched (bell tables are not in the invariant-2 mutate set) |
| `tests/reports/_metaInfraContract.test.ts` | N/A — `scripts/verify-branch-protection.ts` is not in `META_SOURCE_FILES` (`tests/reports/_metaInfraContract.test.ts:102-110`). The §9 resolver's new UPDATE call instead carries the same inline `// not-subject-to-meta: <reason>` exemption as the file's existing RPC call (`scripts/verify-branch-protection.ts:69` precedent) AND still honors invariant 9 substantively: full `{ data, error }` destructure inside try/catch, both boundaries degrading to the tolerated skip-log path (§9.3) |

## 17. Testing strategy

- **Unit + SQL**: `get_bell_feed_rows` entry-grain guarantees — **starvation regression**: many resolved rows for one flappy key collapse to one entry and do NOT displace other distinct history entries (R5 finding 1); occurrence sums cover the whole window; active-arm keys excluded from the history arm; `p_excluded_codes` filters before the cap (a health flood doesn't starve a non-dev feed). `shapeBellEntries` (arm merge, occurrence math, truncation flag, activity ordering, state assignment); unread derivation (absence / stale `read_at` / re-bump / re-raise); **read race**: a row re-bumped between feed snapshot and click stays unread after the read POST (read stamps `seenActivityAt`, not now()); **cap boundary**: with unseen entries beyond `bell_feed_cap`, count and feed agree, open doesn't permanently absorb the dropped entry, and its re-bump re-enters unread (§6.4); audience scoping matrix (non-dev vs dev × health/inbox/info/uncataloged codes — derive expectations from catalog-derived sets, never hardcoded code lists, so catalog edits don't rot the test); badge watermark arithmetic incl. no-row viewer; **watermark race**: an alert raised between the feed snapshot (`seenThrough`) and the open POST remains unseen after open (derive the interleaving from fixture timestamps, not sleeps); monotonic no-regress when a stale `seenThrough` arrives after a newer one.
- **Route tests**: auth guards (non-admin 403/404 contract, config non-dev), `read` visibility fail-closed (non-dev marking a health alert id → 404, no row written), bounded-read registration, no-store headers, config 400-rejection bounds agree with the SQL CHECK ranges (derive both from one shared constant), and a direct authenticated PostgREST `select` on `admin_alert_reads` / `admin_bell_state` is refused (§3.3 full lockdown). A non-default configured `bell_feed_cap` propagates into the feed response's `feedCap` and renders in the truncation row + dev footer (R2 finding 2).
- **Anti-tautology**: assertions about what the panel shows scope their extraction to the panel subtree with sibling surfaces (AppHealthIndicator, per-show section) removed from the cloned DOM; badge-count tests assert against the feed fixture's computed unseen set, not against a count the component also renders. Concrete failure modes stated per test in the plan.
- **Real-browser (Playwright)**: panel open/close + focus trap; unread dot fixed-slot no-layout-shift; badge slot; the §14 assertions.
- **Onboarding chrome**: a test renders the onboarding branch (`OnboardingTopBar`) and proves the bell (count badge + openable panel with non-health alerts) is present after AlertBanner removal (R8 finding).
- **Realtime**: unit-test the subscribe helper with a faked client (template: `tests/realtime/subscribeToShow.test.ts` DI pattern); trigger + policy covered by a pgTAP-style or SQL smoke assertion consistent with how `20260504000000` was tested (plan verifies precedent; mocked-only review is insufficient per AGENTS.md — include one live local-stack probe task exercising insert→ping→refetch).
- **Resolver**: `verify-branch-protection` ok-path resolves both codes; auth-ok-drift path resolves only AUTH_FAILED; Supabase-unreachable path no-ops with the skip log (mirrors existing emitAlert tests).
- **Impeccable dual-gate** (invariant 8): `/impeccable critique` + `/impeccable audit` on the UI diff before adversarial review.

## 18. Watchpoints / do-not-relitigate (reviewer preload)

- **Realtime-as-ping (no payload)** is a ratified user decision (D7 + Approach A) on redaction grounds — do not propose payload-carrying `postgres_changes`.
- **Info codes in the bell** is a deliberate D1-adjacent decision (§6.3) — the banner's info exclusion is not a contract for the bell; the banner is being retired.
- **Health codes stay resolve-less in the bell** — the 403 HEALTH door on the global resolve route (`app/api/admin/admin-alerts/[id]/resolve/route.ts:80` door order) is upstream ratified (PR #312); the bell links out instead.
- **Weekly auto-clear latency for BRANCH_PROTECTION_*** (§9) is accepted; the alternative is the premature-resolve trap.
- **No `admin_alert_reads` GC in v1** (§1 non-goals).
- **`AppHealthIndicator` stays separate** (D8) — do not propose folding it into the bell.
- **DB-level tier enforcement on `admin_alerts` / `app_settings` is a ratified deferral** — `BACKLOG.md:216` (`BL-HEALTH-RESOLVE-DB-LOCKDOWN`, ACCEPTED: "Doug is the trusted business owner, not an adversary; role filtering is UX not security") and the broader `BL-ADMIN-POSTGREST-DML-LOCKDOWN` class it cross-references. The bell changes neither table's grants and adds no new PostgREST exposure (its own new tables ARE fully locked down, §3.3). Do not relitigate the pre-existing grants as a blocker for this feature (adversarial R3 findings 1–2 disposition).
- Existing placeholders/contracts: inbox-routed codes' auto-clear-only rule (`lib/adminAlerts/resolveAdminAlert.ts:10-16`); fail-visible uncataloged-code posture (`lib/messages/adminSurface.ts:36-40`).
