# Manual-resolve affordance reflects true auto-resolvability

**Date:** 2026-07-04 · **Status:** Draft
**Master spec:** `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §4.6 (alert workflow), §12.4 (codes)
**Supersedes (partial):** `docs/superpowers/specs/2026-07-03-admin-alert-auto-resolution.md` §3 — the three `DEFER` rows and their §2 deferral rationale (see §7 below).

## 1. Problem

The admin-alert **auto-resolution** feature (`2026-07-03-admin-alert-auto-resolution.md`, Implemented) made
21 state-based codes resolve themselves when the system observes recovery, but **deliberately left
every manual "Mark resolved" button untouched** (that spec §2 lines 39-41, §4 line 290). The
classification it produced — each code tagged `class: "auto" | "event-manual" |
"state-manual-justified" | "deferred"` — lives **only** in the test registry
`tests/messages/_metaAdminAlertCatalog.test.ts:264-269`, so no runtime surface can read it.

Consequence, observed live on validation (`/admin/dev/telemetry#health`): the `EMAIL_NOT_CONFIGURED`
health alert shows a "Mark resolved" button, but that code is `class: "auto"` — the notify-cron
reconciler re-raises it every run while the email env is unset (`lib/notify/detect/emailDeliveryFailed.ts:305-311`)
and auto-resolves it the moment the env is configured. The button is a **misleading no-op**: clicking it
resolves the row, the next cron tick re-raises it (the observed 709 occurrences), and the operator is
led to believe they "fixed" a config problem they did not touch.

The developer health panel is the visible instance, but the same gap exists on Doug's per-show surface
(`components/admin/PerShowAlertSection.tsx:322`), which suppresses the button **only** for
`isInboxRouted()` codes — leaving every *other* `class: "auto"` doug-audience code (e.g.
`SHOW_UNPUBLISHED`, `REEL_DRIFTED`) showing a button that self-clears.

This feature closes the gap two ways: (A) make the manual-resolve affordance reflect a code's true
resolution class everywhere it renders, and (B) finish auto-resolution for the last three
`deferred` config-state codes so **no** `admin_alerts` code both self-clears *and* offers a manual button.

## 2. Design principle

The `2026-07-03` spec ratified **state vs event**: a code whose condition is a persistent,
code-observable STATE auto-resolves at recovery; a code recording a one-shot EVENT stays
manual-acknowledge per master §4.6. This spec adds the **UI corollary**:

> The manual-resolve affordance is offered **iff** a code is manual-class. For an auto-class code the
> UI shows a read-only "clears automatically" note instead, and the manual-resolve entry points
> **reject** the code fail-closed. Manual resolve is "a deliberate acknowledgment, not an undo"
> (master §4.6) — an auto-class code has nothing to acknowledge; the system owns its lifecycle.

The classification is promoted from test-only to a runtime catalog field so every consumer derives from
one source, exactly as `audience`/`healthWeight` were promoted in the alert-audience-split work
(`lib/messages/catalog.ts:17,19`; derived sets in `lib/adminAlerts/audience.ts`).

## 3. Resolution metadata (the enabler)

### 3.1 Catalog field

Add to `MessageCatalogEntry` (`lib/messages/catalog.ts:1`):

```ts
/**
 * Resolution class (alert-resolve-truthing §3). "auto" = the system resolves this
 * code itself at recovery (a manual button would be a misleading no-op); "manual" =
 * one-shot acknowledgment, manual resolve is the disposition (master §4.6). Absent
 * on non-`admin_alerts` codes (crew/inbox/report copy that never becomes an alert row).
 */
resolution?: "auto" | "manual";
```

Every one of the **42** `admin_alerts` registry codes
(`tests/messages/_metaAdminAlertCatalog.test.ts:57`) carries `resolution`. Non-alert catalog codes
(crew-facing tile copy, report inbox strings, etc.) leave it absent — they never reach a resolve surface.

**Class collapse** (test registry 4-way → runtime 2-way): `auto → "auto"`; `event-manual`,
`state-manual-justified`, `deferred → "manual"`. After Part B (§6) the three `deferred` rows become
`auto`, so the final mapping is: **`auto` (24 codes) → suppress button**; **`manual` (18 codes) → keep button**.

### 3.2 Derived set + predicate

In `lib/adminAlerts/audience.ts` (beside `HEALTH_CODES`, mirroring its module-load derivation):

```ts
/** Every `resolution: "auto"` code — self-resolving; the manual button is suppressed. */
export const AUTO_RESOLVING_CODES: string[] = entries
  .filter((entry) => entry.resolution === "auto")
  .map((entry) => entry.code);

const AUTO_RESOLVING_SET = new Set(AUTO_RESOLVING_CODES);

/** True iff a code self-resolves. UNKNOWN/uncataloged codes → false (fail-VISIBLE: the
 * manual button still renders, so an unrecognized actionable alert is never silently
 * hidden). Mirrors the exclusion-not-allowlist posture of DOUG_EXCLUDED_CODES. */
export function isAutoResolving(code: string): boolean {
  return AUTO_RESOLVING_SET.has(code);
}
```

**Guard condition — unknown code:** `isAutoResolving("SOMETHING_NEW")` returns `false`. Default = manual
= button shown = fail-visible. An uncataloged or future code is never silently stripped of its resolve
affordance; worst case is a no-op click, never a hidden actionable alert.

### 3.3 Relationship to `isInboxRouted`

`INBOX_ROUTED_CODES` (`SHEET_UNAVAILABLE`, `PARSE_ERROR_LAST_GOOD`, `DRIVE_FETCH_FAILED`) are a
**subset** of `AUTO_RESOLVING_CODES` with *extra* semantics (Needs-Attention inclusion, no-Dismiss UX
guard — `lib/messages/adminSurface.ts:6-8`). `isInboxRouted` is **retained unchanged**; it keeps its
bespoke per-show copy ("Clears automatically once the sheet is back or re-parses",
`PerShowAlertSection.tsx:331`). `isAutoResolving` becomes the **button-suppression predicate**
(the broader gate); inbox-routed codes satisfy both and keep their specific note.

## 4. Part A — the affordance reflects the class

### 4.1 `HealthAlertsPanel.tsx` (developer telemetry surface)

At `components/admin/telemetry/HealthAlertsPanel.tsx:142`, replace the unconditional
`<HealthAlertResolveButton alertId={row.id} />` with:

```tsx
{isAutoResolving(row.code) ? (
  <p
    data-testid={`health-alert-autoclear-${row.id}`}
    className="text-xs text-text-subtle"
  >
    {autoResolveNote(row.code)}
  </p>
) : (
  <HealthAlertResolveButton alertId={row.id} />
)}
```

`row.code` is already in scope (`HealthAlertRowItem` line 67 reads `row.code`).

### 4.2 `PerShowAlertSection.tsx` (Doug per-show surface)

At `PerShowAlertSection.tsx:322`, broaden the suppression condition from `isInboxRouted(alert.code)` to
`isAutoResolving(alert.code)` (superset). Inbox-routed codes keep their existing bespoke copy; other
auto codes render the generic `autoResolveNote`. Concretely, the ternary becomes three-way:

```tsx
{isInboxRouted(alert.code) ? (
  <p data-testid={`per-show-alert-autoclear-${alert.id}`} className="text-xs text-text-subtle">
    Clears automatically once the sheet is back or re-parses.
  </p>
) : isAutoResolving(alert.code) ? (
  <p data-testid={`per-show-alert-autoclear-${alert.id}`} className="text-xs text-text-subtle">
    {autoResolveNote(alert.code)}
  </p>
) : (
  <PerShowAlertResolveButton alertId={alert.id} slug={slug} />
)}
```

The `data-testid` is identical in both auto arms (the surface's existing autoclear testid) so existing
DOM contracts and the read-only test at `tests/components/admin/perShowAlertReadOnly.test.tsx` extend
naturally.

### 4.3 The note copy — `autoResolveNote(code)`

A small pure helper in `lib/adminAlerts/audience.ts` (colocated with the predicate). To avoid inventing
24 bespoke strings, it returns a per-code hint when a code has one, else a well-worded generic line:

```ts
export function autoResolveNote(code: string): string {
  return AUTO_RESOLVE_NOTES[code] ?? "Clears automatically when the system detects recovery — no action needed here.";
}
```

`AUTO_RESOLVE_NOTES` seeds only the codes whose "when" is meaningfully specific and operator-useful
(exact set finalized in the plan; at minimum `EMAIL_NOT_CONFIGURED` → "Clears automatically once email
notifications are configured on the deployment.", `EMAIL_DELIVERY_FAILED` → "…once deliveries recover.",
`GITHUB_BOT_LOGIN_MISSING` → "…once GITHUB_BOT_LOGIN is set on the deployment."). Every other auto code
falls back to the generic line. **Invariant 5 holds:** the note is human copy, never a raw code string;
`autoResolveNote` is pure (no DB, no interpolation of untrusted context) so no placeholder-leak path exists.

### 4.4 Dimensional invariants & transition inventory

- **Dimensional invariants:** the button→note swap occurs inside the row's existing
  `flex flex-col gap-2` column (HealthAlertsPanel `HealthAlertRowItem` `<li>` line 80-82;
  PerShowAlertSection `<li>` line 259). Both the `<button>` and the replacement `<p>` are `self-start`
  flow children of a `flex-col` parent with no fixed height — **no fixed-dimension parent → child
  stretch invariant is introduced or affected.** No Playwright layout assertion is required by this
  change (jsdom render assertions suffice for presence/absence). This is stated explicitly to satisfy
  the writing-plans layout-task gate: the gate is **N/A** here because no fixed-dimension parent
  contains these children.
- **Transition inventory:** a code's `resolution` class is **static** — it cannot change at runtime for
  a given row. The button-vs-note choice is therefore a per-render constant, not a state transition.
  There is **no `AnimatePresence`, no crossfade, no compound transition** — the affordance is chosen
  once at render and never animates between button and note. Declared: **instant, no animation needed.**

## 5. Part A.2 — fail-closed guard on manual-resolve entry points

Every **user-initiated** manual-resolve door rejects `isAutoResolving(code)` fail-closed, mirroring the
existing inbox-routed rejection in the internal helper (`lib/adminAlerts/resolveAdminAlert.ts:10-16`) and
the existing `HEALTH_CODES` rejection in the dev door (`app/admin/actions.ts:224`). Each door **already
fetches `code`** before writing, so the guard is a one-line addition at an existing lookup point:

| Door | File:line | Existing lookup | Guard added |
|---|---|---|---|
| Dev health resolve action | `app/admin/actions.ts:221-224` | `code` fetched; `HEALTH_CODES` guard | add `if (isAutoResolving(code)) return;` before write |
| Admin resolve action | `app/admin/actions.ts:46` (`resolveAdminAlertFormAction`) | fetches `code` | same, before write |
| Global resolve route | `app/api/admin/admin-alerts/[id]/resolve/route.ts` | fetches `code` | reject auto code (404/no-op parity with not-found) |
| Per-show resolve route | `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts` | fetches `code` | same |

**Additive coverage (not redundant):** all four doors already reject `HEALTH_CODES`
(`actions.ts:224`; global route `:117`; per-show route `:124`; `resolveAdminAlertFormAction` via the
audience-split "3 legacy resolve surfaces reject HEALTH_CODES" change), and the per-show route already
rejects `isInboxRouted` (`:130`). The new `isAutoResolving` guard's *net-new* coverage is therefore the
**auto-class doug-audience** codes that are neither health nor inbox-routed — `SHOW_UNPUBLISHED`,
`REEL_DRIFTED`, `OPENING_REEL_PERMISSION_DENIED`, `OPENING_REEL_NOT_VIDEO`, `EMBEDDED_ASSET_DRIFTED`,
`ASSET_RECOVERY_BYTES_EXCEEDED`, `EMBEDDED_RECOVERY_REQUIRES_RESTAGE` — which today are manually
resolvable through the Doug doors despite self-clearing. The three existing rejection checks are
**orthogonal, not nested**, and all are retained: `HEALTH_CODES` rejection is **audience**-based (Doug
doors resolve no health code at all, including *event*-class health like `PICKER_BOOTSTRAP_RPC_FAILED`,
so it is NOT a subset of auto); `isInboxRouted` is the pre-existing per-show auto-clear subset; and the
new `isAutoResolving` is **resolution-class**-based. They partially overlap but none subsumes another —
adding `isAutoResolving` alongside them widens rejection to exactly the auto doug codes above without
weakening the audience or inbox guards. No existing check is removed.

Rejection semantics match each door's existing "not resolvable here" branch: an idempotent no-op
(no write, no revalidate, no success log) for the server actions; the route's existing forbidden/not-found
shape for the HTTP routes (exact status finalized in the plan against each route's current contract).

**CRITICAL asymmetry (single most important implementation constraint):** the guard lives **only** at
the user-initiated manual layer. The **internal** `resolveAdminAlert` / `resolveAdminAlerts` helpers
(`lib/adminAlerts/resolveAdminAlert.ts`) stay **permissive for auto codes** — the notify-cron email
detector calls `resolveAdminAlert({ showId: null, code: "EMAIL_NOT_CONFIGURED" })`
(`emailDeliveryFailed.ts:309`, via its `resolve` dep) to auto-resolve, and `EMAIL_NOT_CONFIGURED` is an
auto code. Adding a blanket auto-code block to `resolveAdminAlert` would break every reconciler. The
existing `assertNotInboxRouted` guard there is *narrower* (inbox-routed only, which use a different
`recoveryResolution` path) and is **left unchanged**. This is app-surface defense-in-depth, **not** a
DB-hard boundary — consistent with the ratified `BL-HEALTH-RESOLVE-DB-LOCKDOWN` posture
(`project_alert_audience_split` §6.7): admin/Doug are trusted, not adversaries; a direct PostgREST PATCH
by a non-dev admin remains possible and is accepted.

## 6. Part B — finish the three deferred resolvers (`deferred → auto`)

Each becomes `class: "auto"` with a real recovery-observation point. All three set `resolved_at = now()`
and leave `resolved_by` NULL (system-resolved convention, `resolveAdminAlert.ts:18`).

### 6.1 `GITHUB_BOT_LOGIN_MISSING` — dual surface

Condition: the `GITHUB_BOT_LOGIN` env var is unset (a pure **presence** check — NOT a live GitHub probe;
the `2026-07-03` spec §3 line 94 conflated presence with validity). Raised at
`lib/reports/submit.ts:783`. Two resolve surfaces (both requested):

1. **Notify-cron config reconciler (primary self-healer).** In `lib/notify/runNotify.ts` (which already
   evaluates `configValid()` at lines 210/234/374), after config evaluation resolve the **global**
   (`show_id = null`) alert when `process.env.GITHUB_BOT_LOGIN` is a non-empty string. Resolve-on-recovery
   only — the cron does **not** raise this code (raising stays in the report path, which is where the
   degradation is actually observed). This self-heals even with zero report traffic. Env read goes through
   the existing notify config module (`lib/notify/config.ts`) so it is dependency-injectable for tests.
2. **Opportunistic report-submit resolve.** In `lib/reports/submit.ts`, on any submit that proceeds with
   the bot login **configured** (i.e. does not hit the `BOT_LOGIN_MISSING` branch at :782), resolve the
   global alert. Native to the M8 pipeline; clears promptly under traffic.

Both call the internal `resolveAdminAlert` helper (permissive for this non-inbox-routed auto code, §5).

### 6.2 `BRANCH_PROTECTION_DRIFT` — resolve-on-clean

Raised at `scripts/verify-branch-protection.ts:326` when drift is detected. The script already runs
recurrently in CI (`.github/workflows/x-audits.yml`) with a service-role Supabase client (used for the
`upsert_admin_alert` RPC at :70) and already computes the no-drift outcome. Add: on a run that completes
with **no drift**, resolve the open `BRANCH_PROTECTION_DRIFT` (`show_id = null`) row. Resolution uses the
script's existing service-role client, guarded by the same `localSupabaseReason` skip that already gates
the upsert (`:63`) — so resolve is symmetric with raise (no-op when creds unavailable).

### 6.3 `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` — resolve-on-auth-success

Raised at `scripts/verify-branch-protection.ts:266,286,309` when the monitor cannot authenticate. Add: on
a run where auth **succeeds** (a token resolves and the protection query returns), resolve the open
`BRANCH_PROTECTION_MONITOR_AUTH_FAILED` row. Same client/skip as §6.2. Because a run that reaches the
drift check *has* authenticated, auth-success resolution and drift resolution co-occur on a clean run;
the plan sequences both resolves in the success path.

**Resolve mechanism in the CI script:** the script is standalone (not a Next.js runtime). It resolves via
the same service-role client with a direct `admin_alerts` update (`.update({ resolved_at }).eq("code", …)
.is("resolved_at", null).is("show_id", null)`) — mirroring `resolveAdminAlert`'s filter shape — OR a small
`resolve_admin_alert` RPC if one is preferred for symmetry (decided in the plan). Service-role bypasses
RLS; no new grant is needed.

## 7. Registry, spec, and count updates

- **`tests/messages/_metaAdminAlertCatalog.test.ts`:** reclassify the three codes from their current
  `deferred` (registry array `tests/messages/_metaAdminAlertCatalog.test.ts:440-442`) to `class: "auto"`
  with their new `resolveSites` (§6). The meta-test already asserts every `auto` code has ≥1 resolve
  site — the new sites satisfy it. The current `ClassifiedCode` union (`:266-269`) already admits
  `class: "auto"` with a required non-empty `resolveSites` tuple, so no type change is needed.
- **New catalog-parity assertion:** the meta-test additionally asserts, for all 42 codes, that
  `MESSAGE_CATALOG[code].resolution === (registryClass === "auto" ? "auto" : "manual")`. This makes the
  test registry the source of truth for the fine class and the catalog the runtime projection, and fails
  CI if a future code's `resolution` drifts from its declared class.
- **`docs/superpowers/specs/2026-07-03-admin-alert-auto-resolution.md`:** update §3 (the three rows move
  out of `DEFER` into auto with their resolve mechanisms), update the §2/§3 counts, and add a note that
  this `2026-07-04` spec supersedes its `DEFER` disposition for these three. **Numeric sweep (before → after):**
  precedent-AUTO 7 (unchanged); NEW 14 → **17** (the 3 join); EVENT 18 (unchanged); DEFER 3 → **0**;
  total 42 (unchanged). Runtime resolution partition: `auto` = 7 + 17 = **24**; `manual` = 17
  event-manual + 1 state-manual-justified (`TILE_SERVER_RENDER_FAILED`) = **18**. 24 + 18 = 42. ✓
  These are the only numeric literals introduced; every downstream reference cites this partition.

## 8. Flag lifecycle — `resolution`

| Field | Storage | Write path | Read paths | Effect on output |
|---|---|---|---|---|
| `MessageCatalogEntry.resolution` | static catalog literal (`lib/messages/catalog.ts`) | authored per code; meta-test pins it to the registry class | `AUTO_RESOLVING_CODES`/`isAutoResolving` (`lib/adminAlerts/audience.ts`); consumed by HealthAlertsPanel §4.1, PerShowAlertSection §4.2, the four manual-resolve doors §5 | `auto` → button suppressed + auto-clear note + manual-resolve rejected; `manual`/absent → button rendered + manual resolve permitted |

No zombie flag: every value is written (per code), read (predicate + doors), and has a concrete output effect.

## 9. Guard conditions (prop/input sweep)

- **`row.code`/`alert.code` unknown or not in catalog:** `isAutoResolving` → `false` → button renders
  (fail-visible). Existing unknown-code copy fallbacks (HealthAlertsPanel line 87-88 "A system-health
  item needs attention."; PerShowAlertSection line 269) are unaffected.
- **`autoResolveNote(unknownCode)`:** returns the generic line (map miss → fallback). Never throws,
  never returns a raw code.
- **Auto code with a resolve route hit anyway (stale tab, crafted POST):** guard §5 → idempotent no-op /
  route's not-found shape. No write, no revalidate.
- **Empty/NaN not applicable:** `code` is always a non-empty string from the row; the doors already
  early-return on a missing row (`actions.ts:220`).

## 10. Testing (failure modes each test catches)

- **`isAutoResolving` set membership** — catches a code mis-tagged `manual` that should self-clear
  (the original bug). Derives the expected set from the catalog, not a hardcoded list.
- **HealthAlertsPanel render** — an auto code renders `health-alert-autoclear-*` and **no**
  `health-alert-resolve-*`; a manual code renders the button and **no** autoclear note. Catches a
  regression that re-adds the unconditional button. Scope the query to the row under test (clone-and-strip
  sibling rows) per the anti-tautology rule.
- **PerShowAlertSection render** — a non-inbox auto code (`SHOW_UNPUBLISHED`) now renders the autoclear
  note, not the button; an inbox code keeps its bespoke sheet copy; a manual code keeps the button.
- **Manual-resolve rejection** — each of the four doors, given an auto code, performs **no** UPDATE
  (assert zero-row / no write) and the correct no-op/forbidden shape; given a manual code, still resolves.
  Catches the guard being placed too broadly (blocking manual codes) or too narrowly.
- **Internal-helper permissiveness (regression pin)** — `resolveAdminAlert({ code: "EMAIL_NOT_CONFIGURED" })`
  still succeeds (the email-detector path). Catches the §5 asymmetry being violated.
- **Three resolvers** — cron resolves `GITHUB_BOT_LOGIN_MISSING` when `GITHUB_BOT_LOGIN` set (and does
  **not** raise it); submit resolves it on configured success; the branch-protection script resolves both
  `BRANCH_PROTECTION_*` on a clean/authed run (mocked service-role client) and does **not** resolve when
  drift/auth-fail persists.
- **Meta-test parity** — `catalog.resolution` matches registry class for all 42 codes; every `auto`
  code has ≥1 resolve site. Catches drift when a future code is added without a class.

## 11. Out of scope

- DB-hard lockdown of the resolve path (revoke `admin_alerts` UPDATE + SECURITY DEFINER resolve RPCs) —
  remains `BL-HEALTH-RESOLVE-DB-LOCKDOWN`. This spec is app-surface only (§5).
- Redesigning `TILE_SERVER_RENDER_FAILED` to a per-tile keyed row so it could auto-resolve — stays
  `state-manual-justified` (BACKLOG, per `2026-07-03` §3 line 76). It keeps its manual button correctly.
- Any change to `isInboxRouted` semantics or the Needs-Attention inbox.
- No schema / RLS / advisory-lock / migration changes. Catalog metadata + UI + resolver wiring only.

## 12. UI quality gate

HealthAlertsPanel and PerShowAlertSection are UI surfaces (`components/**`). Invariant 8 applies:
`/impeccable critique` + `/impeccable audit` on the affected diff, HIGH/CRITICAL fixed or `DEFERRED.md`,
before the whole-diff Codex review.
