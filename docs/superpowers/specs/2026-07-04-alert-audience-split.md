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
2. **`audience` is the single filter field.** `AlertBanner`, `alertCount`, and
   `PerShowAlertSection` filter to `audience === "doug"` (keeping the existing
   `severity: "info"` exclusion where present). The health rollup reads
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
| `SHOW_FIRST_PUBLISHED` | info confirmation (already `severity:"info"`) |
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
| `audience` | `MESSAGE_CATALOG[code].audience` (`lib/messages/catalog.ts`) | hand-authored per code + meta-test enforced | `AlertBanner`, `alertCount`, `PerShowAlertSection` (exclude non-doug); `healthRollup` (select health) | routes a code to the amber banner vs the health indicator |
| `healthWeight` | `MESSAGE_CATALOG[code].healthWeight` | hand-authored for `health` codes only | `healthRollup` worst-active reducer | indicator color red (`degraded`) vs amber (`notice`) |
| `dougSummary` | `MESSAGE_CATALOG[code].dougSummary` | hand-authored for `health` codes only | health popover (`AppHealthPopover`) via a typed accessor | the plain-language line Doug reads |

No zombie flags: every field written for the 42 codes is read by at least one surface;
the meta-test asserts presence + that non-`health` codes do **not** carry `healthWeight`/
`dougSummary` (keeps `doug` rows clean).

## 5. Surfaces (enumeration — every admin_alerts presentation reader)

| Surface | File | Change |
|---|---|---|
| Global banner | `components/admin/AlertBanner.tsx:116-127` | add `audience:"doug"` exclusion to the existing `.not("code","in",…)` info filter |
| Bell count | `lib/admin/alertCount.ts:19-27` | same exclusion so the bell counts only `doug` alerts |
| Per-show section | `components/admin/PerShowAlertSection.tsx:119-122` | filter fetched rows to `doug` (client-side filter on the small per-show result set, or `.not(...in...)` on the query) |
| Digest email | `lib/notify/runNotify.ts:105-109` | **no change** (already 3-code Doug allowlist) |
| Escalation logic | `lib/drive/watchEscalation.ts` | **no change** (`WATCH_CHANNEL_ORPHANED` stays doug) |
| Dev CLI / observe | `lib/observe/query/alerts.ts` | **no change** (dev tool, shows all) |
| **NEW** health rollup | `lib/admin/healthRollup.ts` | reads unresolved `health` rows → worst-active `HealthStatus` |
| **NEW** nav indicator | `components/admin/nav/AppHealthIndicator.tsx` | escalating dot beside `NotifBell` (`AdminNav.tsx:114`) |
| **NEW** dashboard breakdown + popover | `components/admin/AppHealthPanel.tsx` | fuller breakdown on `/admin`; Doug popover vs dev deep-link |

### 5.1 Threading the rollup

`app/admin/layout.tsx:145-146` already `Promise.all([fetchUnresolvedAlertCount(), needsAttentionCount()])`
and passes `alertCount` into `AdminNav` (`:165`). Add `fetchHealthRollup()` to that
`Promise.all` and pass a `healthRollup` prop into `AdminNav` (client component,
`AdminNav.tsx:1`), which renders `<AppHealthIndicator rollup={…} isDeveloper={…} />`
beside `<NotifBell>`. `isCurrentUserDeveloper()` (`lib/auth/requireDeveloper.ts:258`,
`Promise<boolean>` fail-to-false) is resolved in the layout (server) and threaded down —
it drives ONLY presentation (Doug popover vs dev deep-link), never access (the rows are
already admin-gated).

## 6. Component contracts

### 6.1 `HealthStatus` type (`lib/admin/healthRollup.ts`)

```ts
export type HealthStatus =
  | { kind: "ok" }                                    // zero unresolved health alerts → green
  | { kind: "notice"; count: number }                 // ≥1, worst is notice → amber
  | { kind: "degraded"; count: number }               // ≥1 degraded → red
  | { kind: "infra_error" };                          // rollup read itself failed
```

`fetchHealthRollup()` mirrors `fetchUnresolvedAlertCount` (`lib/admin/alertCount.ts`):
construct client in try/catch → returns `{kind:"infra_error"}` on throw; destructure
`{ data, error }` (invariant 9); a non-array `data` with no error → `infra_error`
(integrity failure, not silent green). It selects `id, code` of unresolved rows whose
code is in the `health` set (computed from `MESSAGE_CATALOG` at module load, like
`INFO_SEVERITY_CODES`), then reduces to the worst `healthWeight`. `count` = number of
unresolved health rows.

### 6.2 Guard conditions

- `rollup.kind === "infra_error"` → indicator renders a **neutral "status unknown"** dot
  (idle hue) + tooltip "Couldn't check system health right now." Never green (would hide a
  broken read) and never red (would false-alarm).
- `count === 0` path only reachable as `kind:"ok"`.
- Unknown / uncataloged `code` in a health row → excluded from the health set (cannot
  happen for the 42, but the reducer is defensive: a code with `audience:"health"` but
  missing `healthWeight` is treated as `notice` AND flagged by the meta-test at build/CI).
- `dougSummary` missing for a health row → the popover omits that line (never renders
  `undefined`/raw code); meta-test forbids this for the 42.
- Popover with `count > 0` but every `dougSummary` deduped to empty → fallback single line
  "Some background systems need attention. The developer has been notified."

### 6.3 Indicator (nav dot) — `AppHealthIndicator`

- Icon: `Activity` (lucide) — distinct from `NotifBell`'s `Bell`.
- Color+label pairing (never color-only — the §1 color-blind floor, per `StatusIndicator`):
  the dot has an `aria-label`/`title` naming the state ("System health: needs attention").
- Hues from status tokens (`StatusIndicator.tsx:18-24`): red = `bg-status-warn` (project's
  strongest status hue; there is no separate "danger" token — see §11 note), amber =
  a distinct lower-emphasis treatment, green = `bg-status-positive`, unknown = `bg-status-idle`.
- `min-h-tap-min min-w-tap-min` (44px tap target), matching `NotifBell`.
- **Doug** (`isDeveloper === false`): the indicator is a `<button>` that opens the popover
  (§6.4). **Developer** (`isDeveloper === true`): it is a `<Link href="/admin/observability">`.

### 6.4 Doug popover — `AppHealthPopover`

- Bottom-sheet on mobile / anchored popover on desktop (reuse the responsive
  modal/sheet pattern already in the codebase; `useDialogFocus` + scrim).
- Title: "System status". Body: one plain-language line per **distinct** `dougSummary`
  among unresolved health alerts, **capped at 4 lines** with a "+N more background items"
  overflow note (cap prevents unbounded growth). A closing reassurance line: "The developer
  has been notified — no action needed from you."
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

- **CREATE** `tests/messages/_metaAlertAudienceContract.test.ts` (mirrors
  `_metaAdminAlertCatalog.test.ts`): for every `ADMIN_ALERTS_CODES` entry — asserts
  `audience ∈ {"doug","health"}`; `health` codes declare `healthWeight ∈ {"degraded","notice"}`
  AND a non-empty `dougSummary`; `doug` codes carry NEITHER `healthWeight` NOR `dougSummary`;
  the doug/health partition counts are 16/26; the degraded/notice split is 16/10. New codes
  cannot land without declaring audience.
- **EXTEND** `_metaAdminAlertCatalog.test.ts` if needed so the two registries stay set-equal.
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

- No change to how alerts are **raised** or **resolved** (producers, auto-resolution
  lifecycle from PR #283 untouched).
- No new alert codes.
- No DB migration; no RLS change.
- Realtime/live push of the indicator (it updates on normal admin navigation /
  server re-render, like the bell).
- Reworking `/admin/observability` beyond it already being the dev deep-link target
  (it lists app_events + cron health today; surfacing per-code alert rows there is a
  possible future enhancement, filed to BACKLOG if the reviewer wants it).

## 13. Acceptance criteria

- AC1: A `health`-audience unresolved alert never appears in `AlertBanner`, the `NotifBell`
  count, or `PerShowAlertSection`.
- AC2: A `doug`-audience unresolved alert appears in `AlertBanner` exactly as today.
- AC3: With ≥1 unresolved `degraded` health alert, the nav indicator is red; with only
  `notice`, amber; with none, green; on rollup infra_error, neutral "unknown".
- AC4: Doug (non-developer) clicking the indicator sees the plain-language popover
  (catalog `dougSummary` lines, capped at 4 + overflow note, no raw codes, no action
  controls). A developer clicking it lands on `/admin/observability`.
- AC5: The nav indicator is 44×44, vertically centered against `NotifBell` within 0.5px
  (real-browser assertion).
- AC6: `_metaAlertAudienceContract` fails if any admin-alert code lacks `audience`, or a
  health code lacks `healthWeight`/`dougSummary`, or a doug code carries them.
- AC7: No raw error code string reaches the DOM on any surface (invariant 5).
- AC8: All new Supabase reads destructure `{ data, error }` and surface infra faults as
  typed results (invariant 9).

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
