# Manual-resolve affordance reflects true auto-resolvability

**Date:** 2026-07-04 · **Status:** Draft
**Master spec:** `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §4.6 (alert workflow), §12.4 (codes)
**Supersedes (partial):** `docs/superpowers/specs/2026-07-03-admin-alert-auto-resolution.md` §3 — the `GITHUB_BOT_LOGIN_MISSING` `DEFER` row only (the two `BRANCH_PROTECTION_*` `DEFER` rows are retained; see §6.3, §7).

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
resolution class **everywhere it renders** (`HealthAlertsPanel`, `PerShowAlertSection`, **and the Doug
`AlertBanner`** — R1 F1), and (B) finish auto-resolution for the one `deferred` config-state code with a
live recurrence — `GITHUB_BOT_LOGIN_MISSING`. The two `BRANCH_PROTECTION_*` codes stay `deferred`: their
detector job is disabled (`if: false`, solo-dev variant, §6.3), so they correctly *keep* their manual
button — a code that cannot self-clear should not be told it will. Net invariant after this feature:
**no `resolution: "auto"` code offers a manual resolve button, and no `manual`/`deferred` code is
stripped of one.**

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
`state-manual-justified`, `deferred → "manual"`. After Part B (§6) exactly one `deferred` row
(`GITHUB_BOT_LOGIN_MISSING`) becomes `auto`; the two `BRANCH_PROTECTION_*` rows stay `deferred → "manual"`.
Final mapping: **`resolution: "auto"` (22 codes) → suppress button**; **`resolution: "manual"` (20 codes,
incl. the 2 deferred) → keep button**.

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

`INBOX_ROUTED_CODES` is **exactly** `PARSE_ERROR_LAST_GOOD` + `SHEET_UNAVAILABLE` (pinned by the
meta-test at `tests/messages/_metaAdminAlertCatalog.test.ts:650-651`; `DRIVE_FETCH_FAILED` is auto but
NOT inbox-routed — it has no `adminSurface: "inbox"`, `lib/messages/catalog.ts:80-93`). These two are a
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

### 4.3 `AlertBanner.tsx` (Doug global banner)

The global alert banner (`components/admin/AlertBanner.tsx`, renders the single top global alert;
`alert.code` at line 222, health codes already excluded from this Doug surface) renders manual
`resolveAdminAlertFormAction` forms in two branches, gated on `isAutoResolving(alert.code)`.

**Layout constraint (R2 F3 — critical).** The banner is a **constrained grid**
(`grid-cols-[minmax(0,1fr)_fit-content(55%)]`, `AlertBanner.tsx:318`). The **right** cell
(`col-start-2`, `data-testid=admin-alert-action`, `flex flex-wrap justify-end`, `:454`) is
`fit-content(55%)` — a compact action column. Dropping a multi-word auto-clear `<p>` into it would blow
out the column width and mobile wrapping. Therefore the auto-clear note is **NOT** placed in the action
cell. It renders in the **left** column (`minmax(0,1fr)`, flexible), appended to the existing footer row
(`mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-text-subtle`, `:435`, which already
holds "Raised …" + "+N more"), as a `text-xs text-text-subtle` `<p data-testid="admin-alert-autoclear">`.
The action cell for an auto code renders **nothing** (non-watch) or **only the Retry form** (watch).

- **Non-watch global resolve form** (`:493`): when `isAutoResolving(alert.code)` → the action cell
  renders nothing, and the auto-clear note appears in the left-column footer. Net-new coverage:
  `SYNC_STALLED` (global, auto, doug — `lib/notify/detect/stall.ts:15-17`; `catalog.ts:2038-2051`).
- **Watch-alert dismiss form** (`:424-432`, in the expanded left-column `<details>` panel):
  `WATCH_CHANNEL_ORPHANED` is auto (`catalog.ts:277-290`; reconciled by watch —
  `lib/drive/watch.ts:658,692,720`). When `isAutoResolving(alert.code)` → suppress the **dismiss** form
  and render the auto-clear note in its place (left column, low layout risk). **The Retry form in the
  action cell (`:484-485`, `retryWatchSubscriptionFormAction` + `RetryWatchButton`) is KEPT** — a safe
  idempotent re-subscribe action (not a manual resolve), the operator's way to *drive* recovery, after
  which the watch reconcile auto-resolves the row. Watch-orphaned banner shows: Retry (action cell) +
  auto-clear note (left column).

Guard condition: an unknown/uncataloged banner code → `isAutoResolving` false → the existing resolve
form renders (fail-visible, unchanged). `alert.code` is already read at `AlertBanner.tsx:222,251`.

### 4.4 The note copy — `autoResolveNote(code)`

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
`GITHUB_BOT_LOGIN_MISSING` → "…once GITHUB_BOT_LOGIN is set on the deployment.", `SYNC_STALLED` → "…once
the sync heartbeat recovers.", `WATCH_CHANNEL_ORPHANED` → "…once the Drive watch channel re-subscribes
(use Retry to trigger it now)."). Every other auto code falls back to the generic line. **Invariant 5 holds:** the note is human copy, never a raw code string;
`autoResolveNote` is pure (no DB, no interpolation of untrusted context) so no placeholder-leak path exists.

### 4.5 Dimensional invariants & transition inventory

- **Dimensional invariants:**
  - *HealthAlertsPanel* (`<li>` `flex flex-col`, line 80-82) and *PerShowAlertSection* (`<li>`
    `flex flex-col`, line 259): the button→note swap is between `self-start` flow children of a
    no-fixed-height `flex-col` parent — no fixed-dimension parent → child stretch invariant. jsdom
    presence/absence assertions suffice; **layout gate N/A** for these two.
  - *AlertBanner* (R2 F3 + R-plan H4): the banner **is** a constrained grid (`fit-content(55%)` action
    column, `:318`). The auto-clear note is placed in the flexible **left** column (§4.3), never the
    action cell, precisely to avoid perturbing the constrained column. **The left-column footer (`:435`)
    lives inside the `data-testid="admin-alert-panel"` block, which is `display:none` until the
    `<details>` is opened** (pure-CSS `details:not([open]) ~ [admin-alert-panel]` sibling rule). The
    auto-clear note is therefore **expanded-panel-only**: in the default collapsed banner a non-watch
    auto code shows *no* action affordance at all (the action cell renders nothing — honest, no
    misleading button), and the note becomes visible when the operator opens "Details". Because a real
    constrained-dimension parent is involved, the writing-plans layout-task gate **APPLIES to
    AlertBanner**, and — critically — the assertion must run against the **opened** panel (a collapsed
    `display:none` note has a zero rect, so a non-overlap check in the collapsed state is tautological).
    The real-browser (Playwright) assertion renders the banner for `SYNC_STALLED` and
    `WATCH_CHANNEL_ORPHANED`, **opens the `<details>` (sets `open` / clicks the summary)**, and at mobile
    (360px) and desktop widths asserts (a) the note is genuinely visible — `getBoundingClientRect()`
    width and height are both `> 0`; (b) `section.scrollWidth <= section.clientWidth` (no horizontal
    overflow); and (c) the auto-clear note's bounding rect does not overlap the action cell's.
- **Transition inventory:** a code's `resolution` class is **static** — it cannot change at runtime for
  a given row. The button-vs-note choice is therefore a per-render constant, not a state transition.
  There is **no `AnimatePresence`, no crossfade, no compound transition** — the affordance is chosen
  once at render and never animates between button and note. Declared: **instant, no animation needed.**

### 4.6 Manual-class copy must not promise auto-clear (R2 F5)

A `resolution: "manual"` code's own operator copy must not tell Doug it will auto-resolve — otherwise the
kept manual button and the copy contradict each other (AlertBanner renders `helpfulContext` for the
selected alert, `AlertBanner.tsx:395`). Exactly **one** existing code violates this:
`AMBIGUOUS_EMAIL_BINDING` (registry class `event-manual`, `_metaAdminAlertCatalog.test.ts:421`) whose
`helpfulContext` (`lib/messages/catalog.ts:54`; master §12.4 prose line 3091) and `longExplanation`
(`catalog.ts:57`) say the alert "will clear automatically on the next sync." That promise is **false and
contradicts the master spec itself**: §4.6 (line 937) + §12.4 (line 2322) specify this row "cannot be
dismissed without clicking through to the affected show and confirming resolution" — i.e. **manual**. No
code path auto-resolves it (it is in no resolver set).

Fix: rewrite the two copy fragments to drop the auto-clear promise and align with the §4.6 manual-confirm
behavior (e.g. "…correct the duplicate in your sheet, then mark this alert resolved from the show's
page."). This is a **§12.4 lockstep edit** (AGENTS.md "§12.4 catalog row edits require three lockstep
updates"): (a) master-spec prose (`2026-04-30-…md` line 3091 helpfulContext block; the §12.4 table row at
line 2780 already carries no auto-clear promise, so it is unchanged), (b) `pnpm gen:spec-codes` →
`lib/messages/__generated__/spec-codes.ts`, (c) `lib/messages/catalog.ts:54,57`. **Do NOT run prettier on
the master spec** (`feedback_never_prettier_the_master_spec` — it mangles §12.4 cells → x1 divergence);
edit the single prose line surgically. Verify the `x1-catalog-parity` gate stays green after regen.

**Structural guard (meta-test):** add an assertion (in `_metaAdminAlertCatalog.test.ts` or a sibling)
that no `resolution: "manual"` code's `dougFacing` / `helpfulContext` / `longExplanation` contains
auto-clear language (`/clears? automatically|clear on the next sync|auto-?clear/i`), with an explicit
empty exemption list (any future exemption must be justified inline). This catches the class, not just the
instance — a future manual code that promises auto-clear fails CI.

## 5. Part A.2 — fail-closed guard on manual-resolve entry points

Every **user-initiated** manual-resolve door rejects `isAutoResolving(code)` fail-closed, mirroring the
existing inbox-routed rejection in the internal helper (`lib/adminAlerts/resolveAdminAlert.ts:10-16`) and
the existing `HEALTH_CODES` rejection in the dev door (`app/admin/actions.ts:224`). Each door **already
fetches `code`** before writing, so the guard is a one-line addition at an existing lookup point:

| Door | File:line | Existing guard(s) | Guard added |
|---|---|---|---|
| Dev **health** resolve action (`resolveHealthAlertFormAction`) | `app/admin/actions.ts:221-224` | health-**only**: rejects NON-health (`if (!HEALTH_CODES.includes(code)) return`) — does NOT reject health | add `if (isAutoResolving(code)) return;` before write, so an auto-class **health** code (e.g. `EMAIL_NOT_CONFIGURED`) is rejected while manual-class health codes stay resolvable |
| Admin resolve action (`resolveAdminAlertFormAction`) | `app/admin/actions.ts:46` | rejects `HEALTH_CODES` (audience-split) | add `if (isAutoResolving(code)) return;` before write |
| Global resolve route | `app/api/admin/admin-alerts/[id]/resolve/route.ts:117` | rejects `HEALTH_CODES` | reject auto code with the same structural shape as its `HEALTH_CODES` branch (leave `resolved_at` unchanged, no §12.4 code) |
| Per-show resolve route | `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts:124,130` | rejects `HEALTH_CODES` + `isInboxRouted` | add auto-code rejection alongside, same shape |

**Additive coverage (not redundant).** The three *doug* doors already reject `HEALTH_CODES`
(`resolveAdminAlertFormAction`; global route `:117`; per-show route `:124` — the audience-split "3 legacy
resolve surfaces reject HEALTH_CODES" change), and the per-show route already rejects `isInboxRouted`
(`:130`). The **dev health** door is the opposite — health-**only** (`actions.ts:224` rejects
non-health), so for it the new guard's coverage is the auto-class **health** codes (`EMAIL_NOT_CONFIGURED`,
`EMAIL_DELIVERY_FAILED`, the snapshot/tile/webhook/asset auto health codes). For the three doug doors,
the new `isAutoResolving` guard's *net-new* coverage is the **auto-class doug-audience** codes that are
neither health nor inbox-routed — `SHOW_UNPUBLISHED`,
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

## 6. Part B — finish `GITHUB_BOT_LOGIN_MISSING` (deferred → auto); branch-protection stays deferred

Only **`GITHUB_BOT_LOGIN_MISSING`** gains a resolver and moves to `class: "auto"`. The two
`BRANCH_PROTECTION_*` codes **stay `class: "deferred"`** (§6.3) — their detector job is disabled, so an
auto-resolver would be dead code. Resolution sets `resolved_at = now()`, `resolved_by` NULL (system
convention). **No new RPC, no schema change** (§11).

**Resolver topology (R2 F1 — critical).** `GITHUB_BOT_LOGIN_MISSING` is a **registered NON_UPSERT
producer** (`tests/messages/_metaAdminAlertCatalog.test.ts:585-587`) — raised by a **raw** SQL insert in
the report pipeline (`lib/reports/submit.ts:783`, `upsertAdminAlert(db, null, …)` — the report-local raw
writer, NOT the JS RPC `upsertAdminAlert({…})`). It is deliberately **excluded** from the `AdminAlertCode`
union (`lib/adminAlerts/upsertAdminAlert.ts:3-35`), and that exclusion is meta-test-pinned. Therefore the
resolver **must NOT** go through the `AdminAlertCode`-typed `resolveAdminAlert`
(`lib/adminAlerts/resolveAdminAlert.ts:20`, `code: AdminAlertCode`) — that would not typecheck and would
force a union-widening the meta-test forbids. Instead this code is resolved by a **raw** resolver
mirroring its raw producer, in each backend's native transaction machinery (the same "resolve via the
mechanism native to its transaction machinery" principle as `2026-07-03` §4).

### 6.1 The observation is an explicit env-presence read (NOT "generic submit success")

Condition: `GITHUB_BOT_LOGIN` is unset — a pure **presence** check (the `2026-07-03` spec §3 line 94
conflated presence with validity). Raised at `lib/reports/submit.ts:783` only when the report lookup path
reads the env and finds it missing (`error.code === "BOT_LOGIN_MISSING"`). Crucially, the env is read
**only** inside `findIssueByMarker` (`lib/github/issues.ts:260-264`), reached via `reconcileBeforeCreate`
on the expired-lease recovery path (`submit.ts:559-563,877-882`); a normal create
(`submit.ts:929-956`; `createIssue` `issues.ts:156-180`) never touches it. So **"a submit succeeded" does
NOT prove the env is configured** (R1 F2). Resolution is therefore gated on an **explicit non-empty read
of `GITHUB_BOT_LOGIN`**, via one shared presence predicate so both call sites are identical and a
false-close is impossible:

```ts
// lib/reports/botLoginAlert.ts (new)
export function botLoginConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return typeof env.GITHUB_BOT_LOGIN === "string" && env.GITHUB_BOT_LOGIN.trim() !== "";
}
```

The predicate is pure and env-injectable for tests. The **resolve action** is backend-specific (below),
because the code is a raw NON_UPSERT producer with no typed-helper entry.

### 6.2 Two call sites (both requested)

Both first check `botLoginConfigured(env)` and no-op (issue **no** DB statement) when the env is unset.

1. **Notify-cron (primary self-healer).** `lib/notify/runNotify.ts` gains a new injectable dep
   `resolveBotLoginAlert?: () => Promise<void>` on `NotifyDeps` (`:58-69`, `:71-80`), defaulting to a
   thin function that, when `botLoginConfigured(process.env)`, resolves the global row via the
   **service-role Supabase client** with a **direct `admin_alerts` update** —
   `.from("admin_alerts").update({ resolved_at }).eq("code", "GITHUB_BOT_LOGIN_MISSING").is("show_id",
   null).is("resolved_at", null).select("id")` — a plain string code column filter (no `AdminAlertCode`
   type gate). It is invoked once per notify run after the existing config evaluation, does **not** read
   `lib/notify/config.ts` (which only checks the three email envs `RESEND_API_KEY` / `EMAIL_FROM` /
   `NEXT_PUBLIC_SITE_ORIGIN`, `:6-11` — R1 F4), and does **not** raise the code. Self-heals with zero
   report traffic. **Invariant-9:** the update destructures `{ data, error }`; a returned/thrown error is
   surfaced as a typed/logged fault (matching `runNotify`'s existing fault posture), never a silent
   success; this resolver is registered in the notify call-boundary meta-test (or carries an inline
   `// not-subject-to-meta` with reason, per the plan).
2. **Opportunistic report-submit resolve — FAIL-OPEN (R2 F4).** `lib/reports/submit.ts`, on the submit
   success path (after the report row + issue URL are durably written, `submit.ts:1063`), when
   `botLoginConfigured(process.env)`, resolves the global row via a **raw `db` SQL UPDATE** (postgres.js,
   the same `db` handle that raised it) — `update admin_alerts set resolved_at = now() where code =
   'GITHUB_BOT_LOGIN_MISSING' and show_id is null and resolved_at is null`. This resolve is
   **best-effort/fail-open**: it is wrapped so a resolve failure is caught + logged and **never** turns
   the already-durably-successful submit into a `ReportSubmitInfraError` (`submit.ts:1090`). A durable
   report success must not be reported as failure because a cosmetic alert-resolve lost a race. Because
   the helper re-reads the env explicitly, it resolves iff `GITHUB_BOT_LOGIN` is actually present —
   regardless of whether that submit exercised the recovery lookup — so the R1 F2 false-close is
   structurally impossible; and the R2 F4 fail-open posture is proven by a test that forces the resolve
   UPDATE to throw and asserts the submit still returns success.

### 6.3 `BRANCH_PROTECTION_*` remain deferred (detector disabled)

`scripts/verify-branch-protection.ts` is **not run in CI**: both its workflow jobs are `if: false`
(`.github/workflows/x-audits.yml:443` and `:474`, "X6-D-1: solo-dev variant — branch protection removed,
no team workflow"; re-enable triggers in `DEFERRED.md §X6-D-1`). With no recurrent observation point, an
auto-resolver would be dead code, and reclassifying to `auto` would be dishonest metadata (the code could
never actually resolve). Both `BRANCH_PROTECTION_DRIFT` and `BRANCH_PROTECTION_MONITOR_AUTH_FAILED`
therefore **remain `class: "deferred"`** and keep their manual button (they are health-degraded, so that
affordance renders on the HealthAlertsPanel; because they are deferred/not-auto, §4.1 keeps the button
correctly). A `DEFERRED.md` note records that if the X6-D-1 job is re-enabled, the resolve-on-clean step
(success branch `verify-branch-protection.ts:334-337`, the script's existing service-role client `:70`,
guarded by the `localSupabaseReason` skip `:63`) reclassifies them — built then, not now.

## 7. Registry, spec, and count updates

- **`tests/messages/_metaAdminAlertCatalog.test.ts`:** reclassify **only** `GITHUB_BOT_LOGIN_MISSING`
  from `deferred` (registry array `:440`) to `class: "auto"` with its new `resolveSites` (§6.2). The two
  `BRANCH_PROTECTION_*` rows (`:441-442`) stay `class: "deferred"` (§6.3). The meta-test already asserts
  every `auto` code has ≥1 resolve site — the new sites satisfy it. The current `ClassifiedCode` union
  (`:266-269`) already admits `class: "auto"` with a required non-empty `resolveSites` tuple, so no type
  change is needed.
- **New catalog-parity assertion:** the meta-test additionally asserts, for all 42 codes, that
  `MESSAGE_CATALOG[code].resolution === (registryClass === "auto" ? "auto" : "manual")`. This makes the
  test registry the source of truth for the fine class and the catalog the runtime projection, and fails
  CI if a future code's `resolution` drifts from its declared class.
- **`docs/superpowers/specs/2026-07-03-admin-alert-auto-resolution.md`:** update §3 (the
  `GITHUB_BOT_LOGIN_MISSING` row moves out of `DEFER` into auto with its resolve mechanism), update the
  §2/§3 counts, and note that this `2026-07-04` spec supersedes its `DEFER` disposition for that one code
  (the two `BRANCH_PROTECTION_*` rows stay `DEFER`, unchanged). **Numeric sweep (before → after):**
  precedent-AUTO 7 (unchanged); NEW 14 → **15** (`GITHUB_BOT_LOGIN_MISSING` joins); EVENT 18 (unchanged);
  DEFER 3 → **2** (`BRANCH_PROTECTION_DRIFT`, `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` remain); total 42
  (unchanged). Runtime resolution partition: `resolution: "auto"` = 7 + 15 = **22**; `resolution:
  "manual"` = 18 (EVENT bucket: 17 event-manual + 1 state-manual-justified `TILE_SERVER_RENDER_FAILED`) +
  2 deferred = **20**. 22 + 20 = 42. ✓ These are the only numeric literals introduced; every downstream
  reference cites this partition.

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
- **AlertBanner render (R1 F1)** — `SYNC_STALLED` (global non-watch auto) renders the autoclear note,
  not the resolve form; `WATCH_CHANNEL_ORPHANED` (watch auto) renders the note **and keeps the Retry
  form** but drops the dismiss form; a manual global code still renders its resolve form. Scope each
  assertion to the banner's action region (clone-and-strip) per the anti-tautology rule.
- **Manual-resolve rejection** — each of the four doors, given an auto code, performs **no** UPDATE
  (assert zero-row / no write) and the correct no-op/forbidden shape; given a manual code, still resolves.
  Catches the guard being placed too broadly (blocking manual codes) or too narrowly.
- **Internal-helper permissiveness (regression pin)** — `resolveAdminAlert({ code: "EMAIL_NOT_CONFIGURED" })`
  still succeeds (the email-detector path). Catches the §5 asymmetry being violated.
- **Bot-login resolver (R1 F2/F4)** — `botLoginConfigured` returns true only for a non-empty
  `GITHUB_BOT_LOGIN`; `resolveBotLoginAlertIfConfigured` resolves iff configured and issues **no** Supabase
  call when unset; the notify-cron dep invokes it once per run and does **not** raise the code; the submit
  call site resolves on a configured success and — critically — does **not** false-close when the env is
  unset even though the submit succeeded (the R1 F2 regression pin: run a mock submit success with
  `GITHUB_BOT_LOGIN` unset and assert no resolve fires).
- **Meta-test parity** — `catalog.resolution` matches registry class for all 42 codes; every `auto`
  code has ≥1 resolve site. Catches drift when a future code is added without a class.
- **Manual-copy guard (R2 F5)** — no `resolution: "manual"` code's `dougFacing`/`helpfulContext`/
  `longExplanation` contains auto-clear language (empty exemption list). Regression test that the
  corrected `AMBIGUOUS_EMAIL_BINDING` copy passes and its pre-edit copy would have failed.

## 11. Out of scope

- DB-hard lockdown of the resolve path (revoke `admin_alerts` UPDATE + SECURITY DEFINER resolve RPCs) —
  remains `BL-HEALTH-RESOLVE-DB-LOCKDOWN`. This spec is app-surface only (§5).
- Redesigning `TILE_SERVER_RENDER_FAILED` to a per-tile keyed row so it could auto-resolve — stays
  `state-manual-justified` (BACKLOG, per `2026-07-03` §3 line 76). It keeps its manual button correctly.
- Auto-resolvers for `BRANCH_PROTECTION_DRIFT` / `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` — their detector
  is disabled (`if: false`, DEFERRED.md §X6-D-1); they stay `class: "deferred"` and keep their manual
  button (§6.3). A `DEFERRED.md` note records the re-enable path.
- Any change to `isInboxRouted` semantics or the Needs-Attention inbox.
- No schema / RLS / advisory-lock / migration changes. Catalog metadata + UI + resolver wiring only.

## 12. UI quality gate

`HealthAlertsPanel`, `PerShowAlertSection`, **and `AlertBanner`** (R2 F2) are UI surfaces
(`components/**`). Invariant 8 applies to **all three**: `/impeccable critique` + `/impeccable audit` on
the affected diff, HIGH/CRITICAL fixed or `DEFERRED.md`, before the whole-diff Codex review. AlertBanner
additionally carries the real-browser layout assertion of §4.5.
