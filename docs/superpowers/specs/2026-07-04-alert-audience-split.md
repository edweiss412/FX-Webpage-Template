# Spec — Split admin alerts by audience + app-health indicator

**Date:** 2026-07-04
**Slug:** `alert-audience-split`
**Status:** Draft (autonomous ship)
**Author:** Opus / Claude Code

## 1. Problem

Every unresolved `admin_alerts` row (except `severity: "info"` ones) is surfaced to
**any** admin through `AlertBanner`, the `NotifBell` count, and the per-show
`PerShowAlertSection`. After the developer-tier work (PR #286), ~26 of the 42 alert
codes are things Doug (the non-technical show producer) cannot act on — internal RPC
faults, GitHub/report-pipeline states, branch-protection drift, snapshot-repair stuck
states whose remediation tool is now behind `/admin/dev/*` (which Doug can no longer
open). These pollute Doug's amber banner and, worse, some tell him to "run the repair
tool" he can't see.

We split alerts by **audience**:

- **`doug`** — a real-world action only Doug can take (re-share a sheet, fix a cell,
  republish). Stays in the amber `AlertBanner` / bell / per-show section.
- **`health`** — an app-health / developer concern. Removed from Doug's amber surfaces,
  but **not made invisible**: it rolls up into a single **app-health indicator** that
  escalates green → amber → red by worst-active severity. Doug clicks it for a
  plain-language "system status" summary; a developer clicks it to deep-link into the
  already-dev-gated `/admin/observability` feed.

Nothing goes dark. Doug keeps an ambient, honest health read without an actionable-noise
amber alarm.

## 2. Resolved decisions

1. **Metadata lives in the catalog**, mirroring the existing `severity` precedent
   (`lib/messages/catalog.ts:3` — `severity?: "info" | "warning"`, filtered by
   `AlertBanner`/`alertCount`). Three new optional fields on `MessageCatalogEntry`
   (`lib/messages/catalog.ts:1`):
   - `audience?: "doug" | "health"`
   - `healthWeight?: "degraded" | "notice"`
   - `dougSummary?: string | null` — plain-language, reassuring, **non-actionable** copy
     for the health popover, distinct from the developer-facing `dougFacing`/`followUp`.
   All three are **optional on the type** (the type is shared by ~200 non-alert codes),
   but a new structural meta-test makes them **mandatory for the 42 admin-alert codes**.
2. **`audience` drives filtering via EXCLUSION of the known health set — never a
   `doug`-allowlist.** This is critical: `admin_alerts.code` is an unconstrained runtime
   string (`AlertBanner.tsx:249` guards unknown/retired codes), so a strict
   `audience === "doug"` allowlist would drop any legacy / deploy-skewed / uncataloged row
   from BOTH the Doug surfaces AND the health rollup → invisible (R2 finding 2). Instead,
   exactly mirroring the existing `INFO_SEVERITY_CODES` mechanism:
   - **Doug surfaces** (`AlertBanner`, `alertCount`, `PerShowAlertSection`) exclude the
     computed **`HEALTH_CODES`** set (union with the existing info-severity exclusion where
     present). An **unknown/uncataloged code is neither info nor health → it stays
     fail-visible to Doug** (the safe default; matches how info exclusion leaves unknowns
     visible today).
   - **The health rollup** reads only the `HEALTH_CODES` set (`.in("code", HEALTH_CODES)`).
     Unknown codes are NOT in the set → excluded from the rollup (they are already
     fail-visible on the Doug surfaces, so they are not lost).
   `HEALTH_CODES` is computed from `MESSAGE_CATALOG` at module load (like
   `INFO_SEVERITY_CODES`, `AlertBanner.tsx:71-73`): the codes whose entry has
   `audience === "health"`.
3. **The digest (`lib/notify/runNotify.ts:105-109`) needs no change** — it already reads
   an explicit 3-code Doug allowlist (`DRIVE_FETCH_FAILED`, `PARSE_ERROR_LAST_GOOD`,
   `SHEET_UNAVAILABLE` — all `doug`-audience), not a broad unresolved read.
4. **No DB / schema / RLS change, no advisory locks.** `admin_alerts` SELECT is already
   admin-gated (developer ⟹ admin), so both Doug and developers can read the rows; the
   only difference is presentational (which click-target + which copy). Audience is code
   metadata, not a column.
5. **`WATCH_CHANNEL_ORPHANED` stays `audience: "doug"`** but is demoted from amber
   urgency — see §7. It self-heals hourly and has a working Retry button; hiding it would
   drop the Retry affordance.
6. **Worst-active escalation.** The indicator color is the max severity over unresolved
   `health` alerts: any `degraded` → red; else any `notice` → amber; else → green.
7. **`dougSummary` is grouped, not per-row.** The popover shows at most a small set of
   plain-language lines (deduped by `dougSummary` text), capped — see §6.4 — never a raw
   per-alert dump.

## 3. Audience & health-weight assignment (numeric sweep: 42 = 16 doug + 26 health)

### 3.1 `audience: "doug"` (16)

| Code | Real-world Doug action |
|---|---|
| `SHEET_UNAVAILABLE` | re-share sheet |
| `DRIVE_FETCH_FAILED` | check share / Retry |
| `PARSE_ERROR_LAST_GOOD` | fix sheet |
| `AMBIGUOUS_EMAIL_BINDING` | fix duplicate email in sheet |
| `EMBEDDED_RECOVERY_REQUIRES_RESTAGE` | save sheet to advance version |
| `OPENING_REEL_PERMISSION_DENIED` | re-share / replace reel link |
| `OPENING_REEL_NOT_VIDEO` | replace reel link |
| `REEL_DRIFTED` | re-edit sheet |
| `EMBEDDED_ASSET_DRIFTED` | re-edit sheet |
| `ASSET_RECOVERY_BYTES_EXCEEDED` | trim gallery |
| `SHOW_FIRST_PUBLISHED` | info confirmation — `audience:"doug"` BUT `severity:"info"`, so it stays excluded from the amber banner/count by the **pre-existing** info rule (see AC2) |
| `SHOW_UNPUBLISHED` | republish when ready |
| `LIVE_ROW_CONFLICT` | resolve live row from dashboard |
| `PICKER_EPOCH_RESET` | re-share show link if needed |
| `SYNC_STALLED` | check Drive connection / re-run setup |
| `WATCH_CHANNEL_ORPHANED` | Retry (demoted; auto-heals) |

### 3.2 `audience: "health"` (26) with `healthWeight`

**`degraded` (red) — genuine degradation (16):**
`PENDING_SNAPSHOT_PROMOTE_STUCK`, `PENDING_SNAPSHOT_ROLLBACK_STUCK`,
`PENDING_SNAPSHOT_DELETE_STUCK`, `WEBHOOK_TOKEN_INVALID`, `GITHUB_BOT_LOGIN_MISSING`,
`REPORT_DUPLICATE_LIVE_MATCHES`, `REPORT_OPEN_ORPHAN_LABEL`, `REPORT_LEASE_THRASHING`,
`BRANCH_PROTECTION_DRIFT`, `BRANCH_PROTECTION_MONITOR_AUTH_FAILED`, `EMAIL_NOT_CONFIGURED`,
`EMAIL_DELIVERY_FAILED`, `TILE_SERVER_RENDER_FAILED`, `TILE_PROJECTION_FETCH_FAILED`,
`PICKER_BOOTSTRAP_RPC_FAILED`, `PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED`.

**`notice` (amber-or-lower) — benign, auto-healing / audit (10):**
`PICKER_SELECTION_RACE`, `ASSET_RECOVERY_REVISION_DRIFT`, `ASSET_RECOVERY_DRIFT_COOLDOWN`,
`WIZARD_SESSION_SUPERSEDED_RACE`, `OAUTH_IDENTITY_CLAIMED`, `ROLE_FLAGS_NOTICE`,
`CALLBACK_CLAIM_THREW`, `REPORT_ORPHANED_LOST_LEASE`, `REPORT_LOOKUP_INCONCLUSIVE`,
`STALE_ORPHAN_REPORT`.

> Rationale for the four originally-ambiguous "notice" placements:
> `CALLBACK_CLAIM_THREW` auto-retries on next visit; `REPORT_ORPHANED_LOST_LEASE` and
> `STALE_ORPHAN_REPORT` are auto-closed / "no user action needed"; `REPORT_LOOKUP_INCONCLUSIVE`
> is crew-retriable. None represents a standing broken subsystem, so they do not push
> the dot red.

Counts cross-check: 16 doug + (16 degraded + 10 notice) health = 16 + 26 = **42** =
`ADMIN_ALERTS_CODES.length` (`tests/messages/_metaAdminAlertCatalog.test.ts:57-100`).

## 4. Flag lifecycle table

| Field | Storage | Write path | Read path | Effect on output |
|---|---|---|---|---|
| `audience` | `MESSAGE_CATALOG[code].audience` (`lib/messages/catalog.ts`) | hand-authored per code + meta-test enforced | Doug surfaces **exclude** `HEALTH_CODES` (unknowns stay visible); `healthRollup` selects `HEALTH_CODES` | routes a code to the amber banner vs the health indicator; unknown codes stay Doug-visible |
| `healthWeight` | `MESSAGE_CATALOG[code].healthWeight` | hand-authored for `health` codes only | `healthRollup` worst-active reducer | indicator color red (`degraded`) vs amber (`notice`) |
| `dougSummary` | `MESSAGE_CATALOG[code].dougSummary` | hand-authored for `health` codes only | health popover (`AppHealthPopover`) via a typed accessor | the plain-language line Doug reads |

No zombie flags: every field written for the 42 codes is read by at least one surface;
the meta-test asserts presence + that non-`health` codes do **not** carry `healthWeight`/
`dougSummary` (keeps `doug` rows clean).

## 5. Surfaces (enumeration — every admin_alerts presentation reader)

| Surface | File | Change |
|---|---|---|
| Global banner | `components/admin/AlertBanner.tsx:116-127` | **exclude** `HEALTH_CODES` (∪ existing info exclusion) via the existing `.not("code","in",…)`; unknown codes stay visible |
| Bell count | `lib/admin/alertCount.ts:19-27` | same `HEALTH_CODES` exclusion so the bell counts only doug + unknown rows |
| Per-show section | `components/admin/PerShowAlertSection.tsx:119-122` | exclude `HEALTH_CODES` (`.not(...in...)` on the query; unknown per-show codes stay visible) |
| Digest email | `lib/notify/runNotify.ts:105-109` | **no change** (already 3-code Doug allowlist) |
| Escalation logic | `lib/drive/watchEscalation.ts` | **no change** (`WATCH_CHANNEL_ORPHANED` stays doug) |
| Dev CLI / observe | `lib/observe/query/alerts.ts` | **no change** (dev tool, shows all) |
| **NEW** health rollup | `lib/admin/healthRollup.ts` | `.in("code", HEALTH_CODES)` on unresolved rows → worst-active `HealthStatus` |
| **NEW** nav indicator | `components/admin/nav/AppHealthIndicator.tsx` | escalating dot beside `NotifBell` (`AdminNav.tsx:114`) |
| **NEW** dashboard breakdown + popover | `components/admin/AppHealthPanel.tsx` | fuller breakdown on `/admin`; Doug popover vs dev deep-link |
| **NEW** developer detail | `app/admin/observability/page.tsx` + `components/admin/observability/HealthAlertsPanel.tsx` | dev-gated unresolved-health-alert detail list (§6.6) — the real target of the developer deep-link |

### 5.1 Threading the rollup

`app/admin/layout.tsx:145-146` already `Promise.all([fetchUnresolvedAlertCount(), needsAttentionCount()])`
and passes `alertCount` into `AdminNav` (`:165`). Add `fetchHealthRollup()` to that
`Promise.all` and pass a `healthRollup` prop into `AdminNav` (client component,
`AdminNav.tsx:1`), which renders `<AppHealthIndicator rollup={…} isDeveloper={…} />`
beside `<NotifBell>`. `isCurrentUserDeveloper()` (`lib/auth/requireDeveloper.ts:258`,
`Promise<boolean>` fail-to-false) is resolved in the layout (server) and threaded down —
it drives ONLY presentation (Doug popover vs dev deep-link), never access (the rows are
already admin-gated).

The **dashboard `AppHealthPanel`** (rendered inside the `/admin` page, not the layout)
does NOT receive the layout's rollup — a layout cannot pass props into page `children`
(R5 finding 2). It performs its own `fetchHealthRollup()` read in `app/admin/page.tsx` and
resolves `isCurrentUserDeveloper()` there. Two independent reads through one helper; both
pinned by `_metaInfraContract` (§10).

## 6. Component contracts

### 6.1 `HealthStatus` type (`lib/admin/healthRollup.ts`)

The rollup MUST carry the popover payload (the deduped summary lines), not just a
worst-weight scalar — otherwise the client popover has no way to render specific lines and
degrades to a generic message even when specific alerts exist (R1 finding 1).

```ts
export type HealthSummaryLine = { text: string; count: number };  // one distinct dougSummary
export type HealthStatus =
  | { kind: "ok" }                                    // zero unresolved health alerts → green
  | {
      kind: "notice" | "degraded";                    // worst-active weight → amber | red
      count: number;                                  // total unresolved health rows
      summaries: HealthSummaryLine[];                 // deduped dougSummary lines, capped (§6.4)
      overflowCount: number;                          // distinct summaries beyond the cap
    }
  | { kind: "infra_error" };                          // rollup read itself failed
```

`fetchHealthRollup()` mirrors `fetchUnresolvedAlertCount` (`lib/admin/alertCount.ts`):
construct client in try/catch → returns `{kind:"infra_error"}` on throw; destructure
`{ data, error }` (invariant 9); a non-array `data` with no error → `infra_error`
(integrity failure, not silent green). It selects `id, code` of unresolved rows whose
code is in the `health` set (computed from `MESSAGE_CATALOG` at module load, like
`INFO_SEVERITY_CODES`), then:

1. `count` = number of unresolved health rows.
2. worst `healthWeight` over the rows → `kind` (`degraded` if any degraded, else `notice`).
3. `summaries` = map each row's `code` → its catalog `dougSummary`, dedupe by text
   (accumulating a per-text `count`), sort **degraded-weighted texts first** then by count
   desc, then cap at `POPOVER_SUMMARY_CAP` (4). `overflowCount` = distinct-summary count
   minus what remains after the cap.

The payload feeds `AppHealthIndicator` (uses `kind`/`count`), the popover (uses
`summaries`/`overflowCount`), and the dashboard `AppHealthPanel`. **Data path (R5 finding
2):** a Next layout cannot pass arbitrary props into its page `children`, so:
- the **nav indicator** gets the rollup from `app/admin/layout.tsx`'s existing `Promise.all`
  (threaded through `AdminNav`);
- the **dashboard `AppHealthPanel`** performs **its own pinned `fetchHealthRollup()` read**
  in `app/admin/page.tsx` (a server component).
Both call the SAME registered helper (`lib/admin/healthRollup.ts`) — two cheap reads, not
one shared object. This is an explicit, accepted second read (not "no second fetch"); it
avoids an unstated client provider. Each read is independently pinned by the
`_metaInfraContract` registry row (§10).

### 6.2 Guard conditions

- `rollup.kind === "infra_error"` → indicator renders a **neutral "status unknown"** dot
  (idle hue) + tooltip "Couldn't check system health right now." Never green (would hide a
  broken read) and never red (would false-alarm).
- `count === 0` path only reachable as `kind:"ok"`.
- Unknown / uncataloged `code` on ANY admin_alerts row → NOT in `HEALTH_CODES`, so it is
  **excluded from the rollup** AND (being neither info nor health) **stays fail-visible on
  the Doug surfaces** (banner/count/per-show). This is the safe default (§2 decision 2) —
  an unknown code never disappears from every surface at once.
- A code with `audience:"health"` but missing `healthWeight` → treated as `notice` by the
  reducer AND flagged by the meta-test at build/CI (cannot land).
- `dougSummary` missing for a health row → the popover omits that line (never renders
  `undefined`/raw code); meta-test forbids this for the 42.
- Popover with `count > 0` but every `dougSummary` deduped to empty → fallback single line
  "Some background systems need attention. No action needed from you — this is visible in
  system health for the developer." (No false "has been notified" claim — see §6.4.)

### 6.3 Indicator (nav dot) — `AppHealthIndicator`

- Icon: `Activity` (lucide) — distinct from `NotifBell`'s `Bell`.
- Color+label pairing (never color-only — the §1 color-blind floor, per `StatusIndicator`):
  the dot has an `aria-label`/`title` naming the state ("System health: needs attention").
- Hues from status tokens (`StatusIndicator.tsx:18-24`): red = `bg-status-warn` (project's
  strongest status hue; there is no separate "danger" token — see §11 note), amber =
  a distinct lower-emphasis treatment, green = `bg-status-positive`, unknown = `bg-status-idle`.
- `min-h-tap-min min-w-tap-min` (44px tap target), matching `NotifBell`.
- **Doug** (`isDeveloper === false`): the indicator is a `<button>` that opens the popover
  (§6.4). **Developer** (`isDeveloper === true`): it is a
  `<Link href="/admin/observability#health">` targeting the `HealthAlertsPanel` (§6.6).

### 6.4 Doug popover — `AppHealthPopover`

- Bottom-sheet on mobile / anchored popover on desktop (reuse the responsive
  modal/sheet pattern already in the codebase; `useDialogFocus` + scrim).
- Title: "System status". Body: one plain-language line per **distinct** `dougSummary`
  among unresolved health alerts (from `HealthStatus.summaries`), **capped at
  `POPOVER_SUMMARY_CAP` = 4 lines** with a "+`overflowCount` more background items"
  overflow note (cap prevents unbounded growth). A closing reassurance line that is
  **literally true** given no outbound notification path exists in this feature:
  **"No action needed from you — the developer can see this in system health."**
  (R1 finding 2: the earlier "the developer has been notified" wording was a false claim —
  this feature adds only a passive health surface, not an outbound alert to the developer.
  Do not reintroduce "notified" phrasing unless a real notification path is added.)
- No resolve/action controls (health items are non-Doug-actionable by definition).
- All copy is catalog-sourced (`dougSummary`) through a typed accessor — invariant 5
  (no raw codes in the DOM).

### 6.5 Dashboard breakdown — `AppHealthPanel`

- Rendered on `/admin` near the header (a `StatusIndicator`-style row), below `AlertBanner`
  inside the existing `<div id="alerts">` region or as a sibling status strip.
- Shows the same worst-active state as the nav dot, with the count and (for developers) a
  "View details →" link to `/admin/observability`; for Doug, the same popover trigger.
- Green/clean state: renders a quiet "All systems normal" `StatusIndicator` (positive hue)
  — this surface is allowed to show the healthy state explicitly (unlike the banner, which
  is invisible when clean), because it is the ambient health read.

### 6.6 Developer detail — `HealthAlertsPanel` on `/admin/observability` (R2 finding 1)

The developer deep-link MUST land on a surface that actually shows the underlying health
alerts — otherwise "nothing goes dark" is violated for the person who can act. This brings
a scoped health-alert detail list **into scope** on the already-`requireDeveloper`-gated
`/admin/observability` page (`page.tsx:20` `requireDeveloperIdentity()`).

- `HealthAlertsPanel` renders ABOVE the existing cron-health/event-timeline content
  (a new section; the page keeps `CronHealthHeader` + `EventTimeline`).
- Loads unresolved `admin_alerts` rows whose `code ∈ HEALTH_CODES`, ordered `raised_at`
  desc, capped (e.g. 50 rows, honest "+N more" note beyond the cap). Typed read: destructure
  `{ data, error }`; a returned/thrown error → a cataloged degraded panel (invariant 9),
  never a silent empty.
- Per row: the alert **title/copy via `lib/messages/lookup.ts`** (dev-facing `dougFacing`
  + `followUp`; NO raw code string in the DOM — invariant 5; unknown-code guard like
  `AlertBanner`), the `healthWeight` chip (degraded/notice), a **show link** when
  `show_id` is set (`/admin/show/<slug>`), `raised_at` (relative + absolute title), and
  `occurrence_count`.
- Each row carries a **Resolve** affordance backed by ONE NEW **dev-gated Server Action**
  `resolveHealthAlertFormAction` (`app/admin/actions.ts`). Reusing the existing resolve
  paths is wrong on two counts (R5 findings 1 + 3):
  - **Authorization (R5 finding 1):** `resolveAdminAlertFormAction` gates only
    `requireAdmin()` (`app/admin/actions.ts:43`) and the per-show route only
    `requireAdminIdentity()` — so a **non-developer admin** (Doug) who obtained a health
    alert id could resolve a developer-owned health alert directly, hiding degradation from
    the developer. The new action gates **`requireDeveloper()`** (mutation-authorized, not
    just page-visible) and additionally verifies the target row's `code ∈ HEALTH_CODES`
    before writing (a developer cannot use it to resolve a `doug` alert through the wrong
    door). Direct-POST tests assert a non-developer is denied and `resolved_at` is
    unchanged, for both a global and a show-scoped health alert.
  - **Navigation (R5 finding 3):** the per-show route
    (`app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts`) returns **JSON**, so a plain
    `<form action="/api/…">` would navigate the developer to a raw JSON document. A Server
    Action instead revalidates in place (`revalidatePath("/admin/observability")`) and
    stays on `#health`. `PerShowAlertResolveButton.tsx:42-63` shows the alternative
    (client `fetch` + `router.refresh()`); the Server Action is simpler and avoids the
    JSON-nav trap entirely.
  - **Both global and show-scoped** health rows resolve through this one action: because it
    is developer-authorized and code-verified, it resolves `WHERE id = $1 AND resolved_at
    IS NULL` (no `show_id` predicate needed), so there is no dead-control split.
  - **Call-boundary contract (R8 finding 2), mirroring `resolveAdminAlertFormAction`
    (`app/admin/actions.ts:63`, which carries `// not-subject-to-meta: server action with
    no typed-result contract` + the "propagation IS the contract" rule):** the new action
    carries the SAME inline `not-subject-to-meta` waiver. The **code lookup** destructures
    `{ data, error }`; the **UPDATE** destructures `{ error }` and checks affected rows.
    Construction/select/update **returned-errors AND throws must NOT `revalidatePath` as
    success and must NOT log a success outcome** — they throw to the error boundary
    (mirrors `actions.ts:127` I1: a failed UPDATE never revalidates). On genuine success it
    fires the post-commit `logAdminOutcome` breadcrumb (same pattern as the existing
    resolve action) and `revalidatePath("/admin/observability")`. A no-row/already-resolved
    UPDATE is an idempotent no-op (no false success outcome).
- Deep-link anchor: `/admin/observability#health` so the indicator link scrolls to the
  panel; the panel wrapper has `id="health"` + a stable `data-testid`. Clicking Resolve
  stays on `#health` (Server Action revalidate), removes the resolved row, and never
  renders raw JSON (browser test).
- Empty state: "No open system-health alerts." (quiet, not an error).

Because this reuses the resolve action, no new RPC / DML surface is introduced (no
PostgREST-lockdown obligation).

### 6.7 Closing the legacy resolve bypass (R7 finding)

Adding `resolveHealthAlertFormAction` gates the PANEL's button, but the pre-existing
admin-gated resolve surfaces still resolve any row by id with no code check — so a
non-developer admin with a health alert id could resolve a developer-owned health alert
through an old endpoint, exactly the failure mode §6.6 says must be prevented. To make
"health resolution is developer-only" a **true invariant** (not just the panel's affordance),
every pre-existing user-facing resolve surface must **categorically reject rows whose
`code ∈ HEALTH_CODES`** — health rows resolve ONLY through `resolveHealthAlertFormAction`.

The three surfaces to guard (each already reads or can cheaply read the target row's code):

1. `resolveAdminAlertFormAction` (`app/admin/actions.ts:43`) — Server Action, `requireAdmin`,
   global-only. Add: fetch the row's `code`; if `∈ HEALTH_CODES`, deny (no-op — do NOT
   revalidate a false success; optional forensic log) and leave `resolved_at` null.
2. `app/api/admin/admin-alerts/[id]/resolve/route.ts` — the unified route that already
   `SELECT`s `a.id, a.show_id, s.slug, a.resolved_at` (`:103-105`) and branches on
   `row.show_id`. Add `a.code` to that SELECT and reject when `∈ HEALTH_CODES` (e.g. a
   403/`{ok:false}` response), `resolved_at` unchanged.
3. `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts` — show-scoped route
   (`route.ts:109` selects `id, show_id, resolved_at`). Add `code` to the select and reject
   `HEALTH_CODES`.

This does NOT touch the internal `resolveAdminAlert()` helper
(`lib/adminAlerts/resolveAdminAlert.ts`) used by the PR #283 **auto-resolution** system —
auto-resolvers legitimately resolve health codes programmatically and do not go through
these user-facing endpoints. The guard is only on the three human-triggered surfaces.

**Structural guard:** a meta-test (`tests/admin/healthResolveGuard` or an extension of
`developerGatingContract`) pins that (a) the three legacy surfaces reject `HEALTH_CODES`,
and (b) `resolveHealthAlertFormAction` is the sole health-resolve entry point. Direct-POST
tests: a non-developer admin cannot resolve a global OR show-scoped health alert through
any legacy surface (`resolved_at` stays null); a `doug` alert still resolves through them
unchanged.

## 7. `WATCH_CHANNEL_ORPHANED` demotion

Stays `audience:"doug"` (keeps the Retry button in `AlertBanner`), but its catalog copy is
reworded to drop amber-urgency framing (it already says "Shows still sync automatically
every few minutes"). No new severity field is introduced; the demotion is copy-only +
the existing watch panel treatment (`AlertBanner.tsx:416-440`). **This is the one Doug code
whose spec change is copy, not routing.** Any `dougFacing` edit here obeys the
§12.4-catalog-parity three-way lockstep (spec §12.4 prose + `pnpm gen:spec-codes` +
`lib/messages/catalog.ts`) — see §10.

## 8. Dimensional invariants (Tailwind v4 — no default `flex` `items-stretch`)

The nav is a fixed-height bar (`AdminNav`). Every child in the action cluster must center
in it:

| Parent → child | Guarantee |
|---|---|
| nav action cluster → `AppHealthIndicator` | `inline-flex items-center justify-center min-h-tap-min min-w-tap-min` (matches `NotifBell.tsx:34`) — the icon box is 44×44 and vertically centered |
| indicator button → dot + icon | `items-center gap-2` (mirrors `StatusIndicator.tsx:32`) |
| popover panel → line list | list items are `block`; no fixed-height parent with flex children (no stretch dependency) |

A real-browser (Playwright) assertion (§9, Task L) checks the nav indicator's
`getBoundingClientRect().height` equals the `NotifBell`'s within 0.5px, and both are
vertically centered in the nav bar.

## 9. Transition inventory

States of the indicator: **ok / notice / degraded / unknown** (4). Transitions between any
two are **instant** — the value is recomputed server-side each render; there is no
client-side animated morph. Explicitly:

| From → To | Treatment |
|---|---|
| ok ↔ notice ↔ degraded ↔ unknown (all 6 pairs, both directions) | instant — no animation (SSR re-render) |
| popover closed → open | the shared sheet/popover pattern's standard enter (scrim fade + panel slide/scale); disabled under `prefers-reduced-motion` |
| popover open → closed | standard exit |

Compound: toggling the indicator open while a background re-render changes the rollup —
the popover reads the same server-rendered snapshot it opened with; a rollup change lands
on the next full render (no mid-open mutation). No `AnimatePresence` on the dot itself.

## 10. Meta-tests & CI touchpoints

- **EXTEND** `tests/admin/_metaInfraContract.test.ts` (invariant 9 — the registry where
  `fetchUnresolvedAlertCount` is already pinned at `:244`): add registry rows for the two
  NEW Supabase read surfaces — `fetchHealthRollup` (`lib/admin/healthRollup.ts`) and the
  `HealthAlertsPanel` unresolved-alert loader (`app/admin/observability/page.tsx` or its
  loader module). Each row asserts the same call-boundary contract as `alertCount`:
  construction throw → `infra_error`; returned `{error}` → `infra_error`; awaited throw →
  `infra_error`; non-array `data` with no error (integrity failure) → `infra_error` (never
  silent green/empty). Without these rows the destructure-`{data,error}` discipline (AC8)
  is not structurally pinned and can regress silently. (No `not-subject-to-meta` waiver —
  both are genuine infra reads.)
- **CREATE** `tests/messages/_metaAlertAudienceContract.test.ts` (mirrors
  `_metaAdminAlertCatalog.test.ts`): for every `ADMIN_ALERTS_CODES` entry — asserts
  `audience ∈ {"doug","health"}`; `health` codes declare `healthWeight ∈ {"degraded","notice"}`
  AND a non-empty `dougSummary`; `doug` codes carry NEITHER `healthWeight` NOR `dougSummary`;
  the doug/health partition counts are 16/26; the degraded/notice split is 16/10. New codes
  cannot land without declaring audience.
- **EXTEND** `_metaAdminAlertCatalog.test.ts` if needed so the two registries stay set-equal.
- **CREATE/EXTEND** a health-resolve-guard structural test (§6.7): pins that the three
  pre-existing resolve surfaces reject `HEALTH_CODES` and that `resolveHealthAlertFormAction`
  is the sole health-resolve entry point (may extend `developerGatingContract.test.ts`).
- **`resolveHealthAlertFormAction` call-boundary (R8 finding 2):** it is a Server Action
  with the SAME posture as `resolveAdminAlertFormAction` (`app/admin/actions.ts:63`) — so it
  carries an inline `// not-subject-to-meta: server action with no typed-result contract`
  waiver, and the throw-to-boundary "propagation IS the contract" behavior (§6.6) is
  asserted by AC11/AC11b behavioral tests (code lookup + update; error/throw ⇒ no
  revalidate-as-success, no success outcome; success ⇒ resolve + revalidate). No read
  registry row (it is a mutation, not a typed-result read), matching the existing sibling.
- **VERIFY at plan time** whether `resolveHealthAlertFormAction` must register in
  `tests/admin/_metaAdminOutcomeContract.test.ts` — the existing resolve actions emit a
  post-commit `logAdminOutcome` breadcrumb; if the new action reuses/introduces an outcome
  `code`, follow the same registry discipline (forensic codes are §12.4-free, registry-only).
  Its `requireDeveloper` producer path is already covered by the `_metaInfraContract`
  requireDeveloper registration.
- If any `dougFacing` prose changes (only `WATCH_CHANNEL_ORPHANED`, §7): the §12.4
  three-way lockstep — master spec §12.4 prose + `pnpm gen:spec-codes`
  (`lib/messages/__generated__/spec-codes.ts`) + `lib/messages/catalog.ts` — all in the
  same commit, or the `x1-catalog-parity` gate fails. `dougSummary` is **new copy, not a
  §12.4 rendered-code field**, so it is catalog-only (no spec-codes regen) — but confirm
  the catalog docs validator / codes-coverage scanners do not treat `dougSummary` as a
  §12.4 rendered string (it is a new field, invisible to the existing scanners which key
  on `dougFacing`/`crewFacing`). **Verified in plan pre-draft pass.**
- Never `prettier --write` the master spec (mangles §12.4 cells).

## 11. Design tokens

Existing status tokens (`StatusIndicator.tsx`): `status-live/positive/review/warn/idle`.
There is no dedicated `danger`/red token beyond `warn`. Options for the plan:
(a) map degraded→`status-warn` and notice→a lower-emphasis amber derived from `warning-bg`;
(b) introduce a `status-degraded` `@theme` token in `app/globals.css`. **Decision:** prefer
(a) to avoid a token-system change in this feature (invariant 8 UI-token discipline); if the
critique/audit finds warn↔notice indistinguishable, add the token in the plan as a scoped
follow-up. The plan's impeccable dual-gate adjudicates this.

## 12. Out of scope

- No change to how alerts are **raised** or **auto-resolved** — producers and the PR #283
  auto-resolution lifecycle (internal `resolveAdminAlert()` helper) are untouched. **But
  user-facing resolution IS in scope:** health alerts resolve only via the new dev-gated
  `resolveHealthAlertFormAction` (§6.6), and the three pre-existing user-facing resolve
  surfaces are guarded to reject `HEALTH_CODES` (§6.7). `doug`-alert resolution is unchanged.
- No new alert codes.
- No DB migration; no RLS change.
- Realtime/live push of the indicator (it updates on normal admin navigation /
  server re-render, like the bell).
- Reworking `/admin/observability`'s existing app_events + cron-health content. This
  feature ADDS a `HealthAlertsPanel` (§6.6) above that content but does not touch it.

## 13. Acceptance criteria

- AC1: A `health`-audience unresolved alert never appears in `AlertBanner`, the `NotifBell`
  count, or `PerShowAlertSection`.
- AC2: A **non-info** `doug`-audience unresolved alert appears in `AlertBanner` exactly as
  today. The exclusion is `INFO_SEVERITY_CODES ∪ HEALTH_CODES`, so the one `doug`+`info`
  code (`SHOW_FIRST_PUBLISHED`) stays excluded from the amber banner/count by the
  **pre-existing info rule** (not by the new audience rule) — a specific assertion pins
  `SHOW_FIRST_PUBLISHED` as banner-excluded. Tests that iterate "all doug codes appear in
  the banner" MUST scope to non-info doug codes.
- AC3: With ≥1 unresolved `degraded` health alert, the nav indicator is red; with only
  `notice`, amber; with none, green; on rollup infra_error, neutral "unknown".
- AC4: Doug (non-developer) clicking the indicator sees the plain-language popover
  (catalog `dougSummary` lines, capped at 4 + overflow note, no raw codes, no action
  controls). A developer clicking it lands on `/admin/observability`.
- AC4b: Seeding **multiple distinct** health codes with distinct `dougSummary` text
  renders each deduped line with its per-text count, in worst-weight-first order, and a
  "+N more background items" note when distinct summaries exceed `POPOVER_SUMMARY_CAP` (4)
  — asserted against `HealthStatus.summaries`/`overflowCount` (the data source), NOT by
  scraping a container that also renders sibling copy (anti-tautology). Seeding two rows of
  the SAME code collapses to one line with `count: 2`.
- AC4c: The popover closing line reads "No action needed from you — the developer can see
  this in system health." and never contains the word "notified" (no false outbound-alert
  claim).
- AC5: The nav indicator is 44×44, vertically centered against `NotifBell` within 0.5px
  (real-browser assertion).
- AC6: `_metaAlertAudienceContract` fails if any admin-alert code lacks `audience`, or a
  health code lacks `healthWeight`/`dougSummary`, or a doug code carries them.
- AC7: No raw error code string reaches the DOM on any surface (invariant 5).
- AC8: All new Supabase reads destructure `{ data, error }` and surface infra faults as
  typed results (invariant 9).
- AC9: A developer at `/admin/observability` sees the `HealthAlertsPanel` listing each
  unresolved health alert with its lookup-rendered copy (no raw code), `healthWeight` chip,
  show link (when `show_id` set), `raised_at`, `occurrence_count`, and a working Resolve
  control. **Resolve goes through the single dev-gated `resolveHealthAlertFormAction` for
  BOTH global and show-scoped rows** (§6.6) — NOT `resolveAdminAlertFormAction` and NOT the
  per-show JSON route (both admin-only + the JSON route navigates away). A test seeds a
  show-scoped health alert, resolves it from the panel via that action, and asserts the row
  is resolved AND drops out of the health rollup. The developer indicator link targets
  `/admin/observability#health`.
- AC10: An **uncataloged** `admin_alerts.code` (neither info nor health) remains visible in
  `AlertBanner`, is counted by `alertCount`, appears in `PerShowAlertSection` (if
  show-scoped), and is **absent** from the health rollup — proving the exclusion-not-allowlist
  contract (§2 decision 2). Tests seed such a row for all four surfaces.
- AC11: `resolveHealthAlertFormAction` requires **developer** identity: a non-developer
  admin invoking it directly (global AND show-scoped health alert) is denied and
  `resolved_at` stays null. A developer resolving a health alert (global or show-scoped)
  clears it and it drops from the rollup. Attempting to resolve a `doug`-audience code
  through this action is rejected (`code ∉ HEALTH_CODES`).
- AC11b: The legacy resolve bypass is closed (§6.7): a non-developer admin (or any caller)
  invoking each of the three pre-existing resolve surfaces (`resolveAdminAlertFormAction`,
  `/api/admin/admin-alerts/[id]/resolve`, `/api/admin/show/[slug]/alerts/[id]/resolve`) on a
  health-code row (global AND show-scoped) is rejected and `resolved_at` stays null; a
  `doug`-code row still resolves through those surfaces unchanged; the auto-resolution
  helper `resolveAdminAlert()` still resolves health codes programmatically. A structural
  meta-test pins that health codes resolve only via `resolveHealthAlertFormAction`.
- AC12: `/admin` renders the `AppHealthPanel` from seeded health rows (its own pinned
  `fetchHealthRollup()` read), not only the nav dot. Clicking a show-scoped health alert's
  Resolve control on `/admin/observability#health` stays on `#health`, removes the row, and
  never renders raw JSON.

## 14. Watchpoints (disagreement-loop preempts — do not relitigate)

- **Metadata in the catalog, not a separate registry.** Chosen to mirror the existing
  `severity` field (`lib/messages/catalog.ts:3`) which `AlertBanner`/`alertCount` already
  filter on identically. One source of truth for all per-code attributes; the meta-test
  enforces coverage. This is a settled decision, not an oversight of the `alertActions.ts`
  registry pattern.
- **Rollup `infra_error` → neutral "unknown", not green or red.** Deliberate fail-safe:
  green would hide a broken read (the `alertCount.ts` integrity-failure precedent), red
  would false-alarm. This is the intended posture (mirrors `fetchUnresolvedAlertCount`'s
  `infra_error` handling), not fail-open vs fail-closed ambiguity.
- **`WATCH_CHANNEL_ORPHANED` stays `doug`.** Intentional (§7) — it has a working Retry
  affordance and self-heals; only its copy is demoted. Not a misclassification.
- **Per-show health alerts surface only via the global indicator**, not
  `PerShowAlertSection`. Intended: a per-show `health` alert (e.g. a show-scoped
  `TILE_PROJECTION_FETCH_FAILED`) rolls into the global rollup (which reads all unresolved
  health rows regardless of `show_id`); it is not lost, just not shown in Doug's per-show
  section. Accepted scope decision.
- **Third count query per admin render.** `fetchHealthRollup()` is added to the existing
  `Promise.all` in `app/admin/layout.tsx:145` alongside `fetchUnresolvedAlertCount` +
  `needsAttentionCount`; it is a single lightweight select of `id,code` for unresolved
  health rows (same shape as the bell count). No per-render regression beyond one more
  parallel read already inside the existing batch.
- **`isCurrentUserDeveloper` drives presentation only.** The rows are already admin-gated
  in RLS (developer ⟹ admin); the developer check picks popover-vs-deep-link, never
  access. Not a security boundary — do not treat it as one (`requireDeveloper.ts:258`
  is explicitly `not-subject-to-meta: visibility-only`).
- **No DB / CHECK / enum / advisory-lock surface.** Tier×domain and CHECK-migration
  matrices are **N/A** — this is catalog-metadata + presentation only.
- **Exclusion, not allowlist (R2).** Doug surfaces `.not("code","in", INFO ∪ HEALTH)`;
  unknown codes stay Doug-visible. The rollup `.in("code", HEALTH)`. This is the settled
  fail-visible posture — do not "simplify" to a doug-allowlist (it would hide unknowns).
- **Developer detail is IN scope (R2).** `HealthAlertsPanel` on `/admin/observability`
  (§6.6) is the real deep-link target with per-row lookup copy + Resolve. The deep-link is
  not hollow. Resolution uses the NEW dev-gated `resolveHealthAlertFormAction` (§6.6), and
  the legacy resolve surfaces are guarded to reject health codes (§6.7) — NOT a reuse of
  the existing admin-gated paths. No new RPC or table (no PostgREST-DML-lockdown surface):
  the action UPDATEs `admin_alerts` via the RLS-gated client, same as today's resolve action.
- **Health resolve is ONE dev-gated action, no global/show-scoped split (R3→R5).** An
  earlier draft split resolution by `show_id` across two existing admin-gated paths; R5
  superseded that — the single `resolveHealthAlertFormAction` (`requireDeveloper` +
  `code ∈ HEALTH_CODES`) resolves BOTH by id. The old paths
  (`resolveAdminAlertFormAction`, `POST /api/admin/show/<slug>/alerts/<id>/resolve`) are
  NOT valid health-alert resolve paths (admin-only authz + JSON-nav). Do not reintroduce them.
- **Exclusion union is `INFO_SEVERITY_CODES ∪ HEALTH_CODES` (R4).** `SHOW_FIRST_PUBLISHED`
  is `doug`+`info`; it stays banner-excluded by the pre-existing info rule, NOT the audience
  rule. AC2's "doug appears in banner" is scoped to non-info doug codes. Not a contradiction.
- **New reads pinned by `_metaInfraContract` (R4).** `fetchHealthRollup` + the
  `HealthAlertsPanel` loader get registry rows in `tests/admin/_metaInfraContract.test.ts`
  (invariant 9), same as `fetchUnresolvedAlertCount:244`. No waiver.
- **Health resolve is dev-gated at the mutation, not just the page (R5).** ONE new Server
  Action `resolveHealthAlertFormAction` (`requireDeveloper()` + `code ∈ HEALTH_CODES`
  verify) handles both global and show-scoped health rows. It exists BECAUSE the shared
  `resolveAdminAlertFormAction` (requireAdmin, global-only) and the per-show JSON route
  (requireAdminIdentity, JSON response) are both wrong for health rows (authz + JSON-nav).
  Do not "simplify" back to reusing them. Settled.
- **Two rollup reads is intended (R5).** Nav gets the layout read; dashboard panel does its
  own `fetchHealthRollup()` — a layout can't prop-thread into page children. Both cheap,
  both `_metaInfraContract`-pinned. Not a "no-second-fetch" violation.
