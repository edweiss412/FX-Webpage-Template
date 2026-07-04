# Spec — At-a-glance identity on admin alerts

**Date:** 2026-07-04
**Slug:** `alert-at-a-glance-identity`
**Status:** Draft (autonomous ship; spec + plan user-review gates waived)
**Owner surface:** UI (Opus-only, invariant 8 applies)

---

## 1. Problem

The admin dashboard alert **"A crew identity was claimed through Google sign-in."** (`OAUTH_IDENTITY_CLAIMED`, `lib/messages/catalog.ts:2908`) renders only static catalog copy. An operator reading it cannot tell **which crew member** was claimed, **which Google account** claimed it, or **for which show** — even though the raise site already writes `crew_member_id`, `show_id`, and a `user_email_hash` into `admin_alerts.context`. The banner never displays those fields because the catalog copy has no `<placeholder>` tokens.

This is not unique to that one code. A full sweep of the admin-alert catalog found that **only 6 of 42 codes surface any entity** (all via a `<sheet-name>` interpolation); the other **36 are generic**, despite nearly all of them already carrying identifying data in `context` (`drive_file_id`, `crew_member_id`, `file_name`, `channel_id`, `reason`, counts, etc.).

### Goal

1. **Immediate:** `OAUTH_IDENTITY_CLAIMED` shows crew member name + OAuth email (raw canonical) + show title, at a glance.
2. **Full sweep:** every generic code that identifies a concrete entity surfaces that entity (crew / show / sheet / count), rendered on all three admin alert surfaces. Identity is entity names/counts only — never diagnostic strings like `reason`/error messages/codes (§3.1, invariant 5). Codes that are genuinely global carry an explicit "no per-entity identity" declaration — no fabricated entities, no silent gaps.

### Non-goals

- No redesign of the alert banner layout, panel, or per-show section beyond adding an identity line.
- No change to alert **lifecycle** (raise / resolve / auto-resolution) — see `project_alert_auto_resolution`.
- No change to alert **action links** (`lib/adminAlerts/alertActions.ts`) — orthogonal.
- No new alert **codes**. (No §12.4 catalog-code additions; the copy text of existing rows is unchanged except where a placeholder is deliberately added — see §6.)

---

## 2. Resolved decisions (from brainstorming)

| # | Decision | Value |
|---|----------|-------|
| D1 | OAuth email posture | **Show raw canonical email** in the alert (deliberate PII carve-out; admin-only surfaces). |
| D2 | Sweep scope | **Full sweep — all 36 generic codes.** |
| D3 | Surfaces | **Two web surfaces + the CLI.** There is **no multi-row web alerts feed** — `/admin#alerts` is a scroll anchor to `AlertBanner`, `NotifBell` is a count only. The web surfaces are `AlertBanner` (dashboard + needs-attention) and `PerShowAlertSection` (per-show); both already read `context` → full identity incl. raw email. The "third surface" is the `pnpm observe alerts` **developer CLI** (`queryAlerts` read-core). |
| D3a | CLI email posture | **Redact raw email by default; reveal via an intentional flag** (`--reveal-email` → `includePii`). The CLI still shows enriched non-PII identity (crew/show/sheet) by default; only the email segment is withheld until the flag is passed. Keeps raw PII out of terminal / `--json` / pipes unless explicitly requested. |
| D4 | Architecture | **Approach A — centralized render-time resolver** (`describeAlert` + a per-code identity map + batched ID→name resolution). Producers change only where a value is not ID-resolvable. |

---

## 3. Architecture (Approach A)

Three cooperating units, each independently testable:

### 3.1 `lib/adminAlerts/alertIdentityMap.ts` — the per-code identity map (pure data)

A `const ALERT_IDENTITY_MAP` keyed by alert code. Each entry declares **how to identify that code's entity** as an ordered list of *segment producers*, each of which is one of:

- `{ kind: "showName" }` — resolve the row's `show_id` (or `context.drive_file_id`) to `shows.title`.
- `{ kind: "sheetName" }` — same resolution as `showName` but labelled "Sheet" (the Google Sheet title IS the show title; `shows.drive_file_id` is unique).
- `{ kind: "crewName", key }` — resolve `context[key]` (a `crew_member_id`) to `crew_members.name`.
- `{ kind: "contextField", key, label, format? }` — read a safe literal value already in the projected context (`file_name`, `sheet_name`, `attempted_action`, `repo`). Restricted to the allowlisted scalar fields below; diagnostic keys (`reason`, `error_name`, `rpc_error_code`, error messages) are NOT permitted (§3.1 "Entity-identity only").
- `{ kind: "count", key, label }` — length of a `context[key]` array, or the numeric value.

An entry may also be `{ kind: "global" }` — an **explicit** declaration that the code has no per-entity identity (system-wide). This is a first-class value, not an omission, so the completeness meta-test (§8.3) can require every code to appear.

The map is the single authoring surface for "what identifies this alert." No copy is rewritten for the 36 generic codes; identity renders as a **separate detail line**, not interpolated into `dougFacing`.

**Entity-identity only — never diagnostics (invariant 5).** Segment producers surface **entity identifiers** (crew/show/sheet **names**, counts, safe descriptive tokens like a repo slug or a wizard action name) and the OAuth **email**. They MUST NOT surface raw error codes, SQLSTATEs, PostgREST codes, JS error-class names, or free-form error messages (`rpc_error_code`, `rpc_error_message`, `error_name`, `error_message`, `reason`) — those are diagnostics, not identity, and rendering them on the admin web UI would violate invariant 5 (no raw error codes in user-visible UI). A code whose only distinguishing context is a diagnostic (and whose show/sheet is not resolvable) is therefore `global`. Existing diagnostic rendering that predates this spec (e.g. `WATCH_CHANNEL_ORPHANED`'s `error_message` `<code>` block at `AlertBanner.tsx`) is untouched — it is not part of the identity line.

**Sanitized identity projection (`projectIdentityContext`).** The identity map never reads raw `context`. A pure function `projectIdentityContext(rawContext, { includePii }): IdentityContext` sanitizes the arbitrary producer jsonb into a **curated, scalar-only** shape and is applied at **every** surface (web AND CLI) before resolution — so the identity map has one uniform input contract and no raw/composite field ever reaches a renderer or the CLI. The output shape (`IDENTITY_CONTEXT_KEYS`):

```
IdentityContext = {
  crew_member_id?, stale_crew_member_id?, show_id?, drive_file_id?,  // UUIDs — for name resolution (not sensitive)
  file_name?, sheet_name?,          // sheet titles (strings)
  repo?, attempted_action?,         // safe descriptive tokens (strings)
  email?, user_email?,              // PII — present ONLY when includePii
  role_change_crew_names?: string[],// DERIVED from changes[].crew_name (cap 3) — NEVER the raw `changes` objects
  role_change_count?: number,       // DERIVED from changes.length
  crew_member_count?: number,       // DERIVED from crew_member_ids.length
}
```

- **Composite keys are sanitized, not passed through** (resolves Codex F5): `changes: Array<{crew_name, prior_flags, new_flags}>` (`phase2.ts:120-126`) is reduced to `role_change_crew_names` + `role_change_count` — the `prior_flags`/`new_flags` deltas NEVER leave `projectIdentityContext`. `crew_member_ids: string[]` becomes `crew_member_count`. Any key not in the output shape (`error_message`, `orphan_url`, `rpc_error_code`, `reason`, ids, hashes, `failedKeys`, `data_gaps`, …) is dropped.
- **`includePii`** gates the `email`/`user_email` fields only. Web passes `true`; the CLI defaults `false`.
- This is the projection the observe read-core emits (§6.2, resolving F2) and the exhaustive input surface the unit tests enumerate. Adding a new segment source requires extending `IdentityContext` + `projectIdentityContext` (pinned by the §8.3 meta-test).

### 3.2 `lib/adminAlerts/resolveAlertIdentities.ts` — batched resolution (read-only DB)

`resolveAlertIdentities(rows, supabase): Promise<AlertIdentitiesResult>` where `AlertIdentitiesResult = { kind: "ok"; identities: Map<alertId, AlertIdentity> } | { kind: "infra_error"; identities: Map<alertId, AlertIdentity> }` (resolves Codex F9 — infra faults are a **discriminable** typed result per invariant 9, never silently indistinguishable from "no identity"). On an infra fault the partial `identities` map is still returned (rows whose reads succeeded resolve; the rest are absent) AND `kind: "infra_error"` signals the degraded state so callers can log it. Each input row carries `{ id, code, show_id, occurrence_count, identityContext }` where `identityContext` is the **already-projected** sanitized shape (§3.1) — resolution never sees raw context.

1. Walk `rows`, consult `ALERT_IDENTITY_MAP[code]`, and collect the set of `crew_member_id`s, `drive_file_id`s, and `show_id`s that need name resolution.
2. Issue **at most three batched, bounded `.select().in(...).limit(...)` reads**: `crew_members(id,show_id,name)`, `shows(id,title,slug)`, `shows(drive_file_id,title,slug)`. Skip any query whose id-set is empty. (`crew_members.show_id` is fetched for the show-scoping check below.)
3. For each row, run its segment producers against the resolved lookups + the row's projected `identityContext`, producing an `AlertIdentity`. If the code is not `global`, ≥1 entity segment was produced, and `row.occurrence_count > 1`, append a final disclosure segment `{ label: null, value: "(most recent of N)" }` (§6.4a).

**Show-scoped crew resolution (resolves Codex F7).** A crew segment (name) is emitted **only when the resolved crew row's `show_id` equals the alert's effective show** — `row.show_id`, or the show resolved from `identityContext.drive_file_id` when `row.show_id` is null. A `crew_member_id`/`stale_crew_member_id` that points at a different show (stale, malformed, or producer-bugged context) yields **no** crew segment, preventing a wrong-show crew name from being attributed to the alert. This is the concrete mechanism behind the §8.1 "cross-show id → segment dropped" guard. (The OAuth email is never sourced from the crew row — §5 — so there is no cross-show email-leak vector.)

**OAuth email — authoritative source only, no misleading fallback (resolves Codex F1 + F10).** The email segment is rendered ONLY from an email that authoritatively records the signing-in account:
- `OAUTH_IDENTITY_CLAIMED` → `context.user_email` (the canonical OAuth email, added by this spec's one producer edit). **Legacy pre-change rows have no `user_email`** — only a `user_email_hash` — and the raw OAuth email was never persisted, so it **cannot** be truthfully recovered. Those rows render crew name + show and **omit** the email segment. We deliberately do NOT substitute `crew_members.email`: crew email is a mutable field that merely *happened* to match at claim time, and presenting it as "the Google account that signed in" would be a PII misstatement if the crew row was edited after the claim (Codex F10). Consequence: the specific alert in the motivating screenshot (a legacy row) shows crew + show but not email; every claim raised **after** ship shows the full crew + email + show. This is the honest ceiling given legacy rows stored only a hash.
- `AMBIGUOUS_EMAIL_BINDING` → `context.email` (the canonical email already written by its producer, `validateGoogleSession.ts`). Authoritative; no fallback needed.

If the email source is absent/empty, the email segment is simply dropped (guard §8.1); other segments still render.

```ts
type AlertIdentitySegment = { label: string | null; value: string; pii?: boolean };
type AlertIdentity = { segments: AlertIdentitySegment[]; global: boolean };
```

The email segment is tagged `pii: true` so a consumer can withhold it (the CLI default) without the resolver knowing about surface policy.

- **Read-only:** only `.select(...)`; the resolver module itself does not import `lib/log` (the *callers* log the `infra_error` kind with proper surface context — §6). (It is NOT under `lib/observe/query/**`, so it is not bound by that subtree's meta-test, but it follows the same read-only discipline.)
- **Bounded:** every `.in()` read carries a `.limit()` (satisfies `_metaBoundedReads` discipline).
- **Supabase call-boundary (invariant 9):** every call destructures `{ data, error }`; a **returned** error and a **thrown** error are both caught and mapped to `kind: "infra_error"` (discriminable), never a silent success. The resolver never throws out to the admin layout. Registered in the applicable call-boundary meta-test (§8.3).

### 3.3 `describeAlert(identity, opts?): string | null` — formatting (pure)

`describeAlert(identity, { includePii = true } = {})`. Drops `pii`-tagged segments when `includePii` is false, then joins the remaining segments into a compact one-line string (`"Crew: Jane Doe · jane@gmail.com · Show: II — FinTech Forum CTO Summit 2026"`). Returns `null` when `global` is true, or when no segment survives (empty, or all remaining were PII-withheld). Surfaces may also consume the structured `AlertIdentity` directly for richer styling (label muted, value emphasized) — `describeAlert` is the plain-text convenience for the CLI row and for tests. No DB access, no I/O.

### 3.4 Data flow

```
alert row(s) ──▶ ALERT_IDENTITY_MAP[code] ──▶ resolveAlertIdentities (≤3 batched reads)
                                                        │
                                                        ▼
                                    AlertIdentity{segments[], global}   (each segment tagged pii?: true for email)
                                                        │
                       ┌────────────────────────────────┼────────────────────────────────┐
                       ▼                                 ▼                                 ▼
                AlertBanner (1 row)          PerShowAlertSection (per-show)     pnpm observe alerts CLI (≤100 rows)
                describeAlert(…, pii:true)   describeAlert(…, pii:true)         describeAlert(…, pii: --reveal-email)
                identity under collapsed     identity under each alert's copy   identity line per row; email withheld
                summary + panel                                                 unless flag; context PII-scrubbed in read-core
```

`describeAlert(identity, { includePii })` drops any segment tagged `pii: true` (currently only the email segment) when `includePii` is false. Web surfaces pass `includePii: true`; the CLI defaults to `false` and flips it on `--reveal-email`.

---

## 4. The identity map — full 42-code matrix

Legend — **Source:** `ctx:key` = literal in `context`; `→show` = resolve `show_id`/`drive_file_id`→`shows.title`; `→crew` = resolve `crew_member_id`→`crew_members.name`. **Producer change** = a value that must be added to `context` at the raise site because it is neither ID-resolvable nor already present.

| # | Code | Identity segments (ordered) | Source | Producer change |
|---|------|------------------------------|--------|-----------------|
| 1 | AMBIGUOUS_EMAIL_BINDING | Show · email · "N crew rows" | →show, `email`(email-fallback), `crew_member_count` | none |
| 2 | **OAUTH_IDENTITY_CLAIMED** | Crew · email (new rows) · Show | →crew `crew_member_id`, `user_email` (authoritative only; legacy rows omit email), →show | **add `user_email` (canonical)** |
| 3 | PICKER_BOOTSTRAP_RPC_FAILED | Show (if `show_id` present) | →show | none |
| 4 | PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED | **global** (show unresolved by definition; only diagnostic in ctx) | — | none |
| 5 | CALLBACK_CLAIM_THREW | **global** (`show_id` null; only `error_name` diagnostic in ctx) | — | none |
| 6 | PICKER_SELECTION_RACE | Show · Crew (stale) | →show, →crew `ctx:stale_crew_member_id` | none |
| 7 | PICKER_EPOCH_RESET | Show | →show | none |
| 8 | ASSET_RECOVERY_BYTES_EXCEEDED | Sheet | →show | none |
| 9 | ASSET_RECOVERY_REVISION_DRIFT | Sheet | →show | none |
| 10 | ASSET_RECOVERY_DRIFT_COOLDOWN | Sheet | →show | none |
| 11 | WATCH_CHANNEL_ORPHANED | Sheet | →show | none (existing `error_message` `<code>` block unchanged, NOT part of identity) |
| 12 | WEBHOOK_TOKEN_INVALID | **global** (only `channel_id`/`reason` diagnostics; sheet not resolvable) | — | none |
| 13 | EMBEDDED_RECOVERY_REQUIRES_RESTAGE | Sheet | →show (via `ctx:drive_file_id`) | none |
| 14 | LIVE_ROW_CONFLICT | Sheet `file_name` | `ctx:file_name` | none |
| 15 | ROLE_FLAGS_NOTICE | Sheet · crew name(s) (cap 3, "+N more") · "N role change(s)" | →show (via `drive_file_id`), `role_change_crew_names` + `role_change_count` (derived from `changes[].crew_name` by the projection — raw flag deltas dropped) | none |
| 16 | DRIVE_FETCH_FAILED | Sheet `sheet_name` | `ctx:sheet_name` | none |
| 17 | PARSE_ERROR_LAST_GOOD | *(already SPECIFIC — sheet in copy)* | n/a — global entry (no added segment) | none |
| 18 | SHEET_UNAVAILABLE | *(already SPECIFIC — sheet in copy)* | n/a — global entry | none |
| 19 | SYNC_STALLED | **global** | — | none |
| 20 | EMAIL_DELIVERY_FAILED | Show (if present) | →show | none (surface only if `show_id` present) |
| 21 | EMAIL_NOT_CONFIGURED | **global** | — | none |
| 22 | SHOW_FIRST_PUBLISHED | *(already SPECIFIC — sheet/crew/date in copy; info-severity)* | n/a — global entry | none |
| 23 | SHOW_UNPUBLISHED | *(already SPECIFIC — sheet in copy)* | n/a — global entry | none |
| 24 | PENDING_SNAPSHOT_PROMOTE_STUCK | Show | →show | none |
| 25 | PENDING_SNAPSHOT_ROLLBACK_STUCK | Sheet | →show (via `ctx:drive_file_id`) | none |
| 26 | PENDING_SNAPSHOT_DELETE_STUCK | Show | →show | none |
| 27 | OPENING_REEL_PERMISSION_DENIED | Sheet | →show (via `ctx:drive_file_id`) | none |
| 28 | OPENING_REEL_NOT_VIDEO | Sheet | →show (via `ctx:drive_file_id`) | none |
| 29 | REEL_DRIFTED | Sheet | →show (via `ctx:drive_file_id`) | none |
| 30 | EMBEDDED_ASSET_DRIFTED | Sheet | →show (via `ctx:drive_file_id`) | none |
| 31 | REPORT_ORPHANED_LOST_LEASE | Show | →show | none (`orphan_url` is already the action link, not identity) |
| 32 | REPORT_LOOKUP_INCONCLUSIVE | Show | →show | none |
| 33 | GITHUB_BOT_LOGIN_MISSING | **global** | — | none |
| 34 | REPORT_DUPLICATE_LIVE_MATCHES | Show | →show | none |
| 35 | REPORT_OPEN_ORPHAN_LABEL | Show | →show | none |
| 36 | REPORT_LEASE_THRASHING | Show | →show | none |
| 37 | STALE_ORPHAN_REPORT | Show (if resolvable) | →show | none (`report_id` is an id, not identity) |
| 38 | TILE_SERVER_RENDER_FAILED | *(already SPECIFIC — sheet in copy)* | n/a — global entry | none |
| 39 | TILE_PROJECTION_FETCH_FAILED | *(already SPECIFIC — sheet in copy)* | n/a — global entry | none |
| 40 | BRANCH_PROTECTION_DRIFT | repo `repo` | `ctx:repo` | none |
| 41 | BRANCH_PROTECTION_MONITOR_AUTH_FAILED | repo `repo` | `ctx:repo` | none |
| 42 | WIZARD_SESSION_SUPERSEDED_RACE | Sheet · action `attempted_action` | →show (via `ctx:drive_file_id`), `ctx:attempted_action` | none |

**Producer changes required: exactly one** — `OAUTH_IDENTITY_CLAIMED` gains `user_email`. Every other identifier is either ID-resolvable at render time or already in `context`. This is the payoff of Approach A: the sweep costs one identity-map file + one resolver + one producer edit, not scattered raise-site edits.

**Codes classified `global` (identity line suppressed), 12 total:** the three truly system-wide (19 SYNC_STALLED, 21 EMAIL_NOT_CONFIGURED, 33 GITHUB_BOT_LOGIN_MISSING); the three diagnostic-only with no resolvable entity (4 PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED, 5 CALLBACK_CLAIM_THREW, 12 WEBHOOK_TOKEN_INVALID); and the six already-SPECIFIC-in-copy (17, 18, 22, 23, 38, 39) whose entity is already interpolated into the copy so the identity line adds nothing. **12 global entries, 30 with an identity segment, 42 total.** (Numeric-sweep anchor — the §8.3 meta-test enforces every code is present as either `global` or with ≥1 segment.)

**Already-SPECIFIC codes** (17, 18, 22, 23, 38, 39): declared `global` in the identity map (their entity is already interpolated into `dougFacing`; the identity line must never restate the copy — §6.4). The completeness meta-test still requires their presence.

---

## 5. Raise-site change — `OAUTH_IDENTITY_CLAIMED` (the one producer edit)

`app/auth/callback/route.ts:134` currently writes:

```ts
context: {
  crew_member_id: row.crew_member_id,
  show_id: row.show_id,
  claimed_at_millis: row.claimed_at_millis,
  user_email_hash: hashForLog(canonicalEmail),
},
```

Add `user_email: canonicalEmail`. **Keep `user_email_hash`** (logs/forensics still reference the hash; the raw email is additive for the admin surface).

- `canonicalEmail` is `canonicalize(userResult.user?.email)` (`route.ts:92`) — already canonicalized, satisfying **invariant 3** (email canonicalization at every boundary). The raw string never enters `context` un-canonicalized.
- **Email-canonicalization guard (invariant 3 safety net):** `tests/cross-cutting/email-canonicalization.test.ts:243` scans for raw (non-canonical) email fields in `admin_alerts.context` JSONB and rejects them; the `good-canonicalized-jsonb-context` fixture passes. The new field is populated from the already-canonicalized `canonicalEmail`, so it must satisfy the guard. **Implementation task:** run this meta-test after the edit; if the Layer-6 scanner flags `user_email`, adjust so the field provably derives from `canonicalize()` at the boundary (it already does). This is a guard interaction, not a new mechanism.

---

## 6. Rendering

### 6.1 `AlertBanner` (`components/admin/AlertBanner.tsx`)

- **SELECT change:** add `title` to the `shows(slug)` join → `shows(slug, title)`, and add `occurrence_count` (`show_id`, `context` already selected).
- Apply `projectIdentityContext(alert.context, { includePii: true })` (web is admin-only → PII allowed), then call `resolveAlertIdentities([{ ...alert, identityContext }], supabase)` for the single top alert (limit 1 → ≤3 tiny reads). Build the `AlertIdentity`.
- **Collapsed view (the at-a-glance surface):** render the identity as a second line directly beneath the collapsed one-liner (`data-testid="admin-alert-identity"`), styled `text-sm text-text-subtle`, label muted / value `text-text-strong`. This is what makes the screenshot's banner answer "who / which show" without expanding.
- **Panel:** the same identity line also renders inside the expanded panel (above `helpful-context`) so the detail survives when collapsed truncation elides it.
- **Infra-fault handling (Codex F9):** if `resolveAlertIdentities` returns `kind: "infra_error"`, the banner renders any partial identity that resolved, keeps the alert copy fully intact, and logs the degraded read via `lib/log` (the caller, not the resolver, logs — with `source`/`code` context). The banner never crashes or hides the alert on a resolver fault.
- **Guard:** if `describeAlert` returns `null` (global code, or nothing resolved) → render no identity line (no empty element, no `undefined`).

### 6.2 `pnpm observe alerts` CLI (`lib/observe/query/alerts.ts` read-core + `scripts/observe.ts` adapter)

There is **no web alerts feed** — `/admin#alerts` scrolls to `AlertBanner`; `NotifBell` (`components/admin/nav/NotifBell.tsx`) renders only a count. `queryAlerts` has exactly one non-test consumer: `scripts/observe.ts` (the `pnpm observe alerts` terminal CLI). So this surface is developer-facing (Eric), not Doug-facing.

- **SELECT change:** add `context` to the read-core `SELECT` (currently omitted, `alerts.ts:8`), but **never return the raw jsonb** (resolves Codex F2 — `admin_alerts.context` is not redaction-guaranteed and holds arbitrary producer fields: error messages, URLs, ids, auth state).
- **Allowlisted identity projection in the read-core:** after fetching, `queryAlerts` projects each row's `context` down to `IDENTITY_CONTEXT_KEYS` (§3.1) — the exact curated keys the identity map consumes — and returns that as `identityContext`, dropping everything else. The `user_email`/`email` keys within the projection are additionally withheld unless `includePii` (default **false**) is set. So the read-core emits **only** entity-identity fields, and never raw email by default: safe for terminal output AND `--json`/pipes. `RawAlert`/`AlertRow` (`lib/observe/query/types.ts`) gain `identityContext` (the projected subset), NOT a raw `context`.
- **CLI adapter:** `scripts/observe.ts` gains a `--reveal-email` flag → passes `includePii: true` and prints a one-line stderr notice ("showing raw email — PII"). The adapter calls `resolveAlertIdentities` (fed the projected `identityContext`) + `describeAlert(identity, { includePii })` to render an identity line per alert (crew/show/sheet always; email only with the flag). Without the flag the email segment is absent because the read-core already withheld it.
- **Redaction posture change** — see §7.

### 6.3 `PerShowAlertSection` (`components/admin/PerShowAlertSection.tsx`)

- `context` already selected (`PerShowAlertSection.tsx:121`); the fetch (`id, code, context, raised_at`) must also select `occurrence_count`. **Every alert on this page belongs to the section's show, so inject the parent `showId` prop as each resolver row's `show_id`** (resolves Codex F6) — the per-show query is scoped by `showId` but does not itself return the column, and §3.2 requires `show_id` for `→show` segments and for the crew show-scoping check. Without injection, show-only codes (`EMAIL_DELIVERY_FAILED`, `PENDING_SNAPSHOT_PROMOTE_STUCK`, report alerts) with no `drive_file_id` would drop their show segment and render no identity here. Then apply `projectIdentityContext(context, { includePii: true })` and `resolveAlertIdentities`.
- Render the identity line under each alert's copy (near the existing `failedKeys` / `data_gaps` sub-lines), `data-testid="per-show-alert-identity"`.

### 6.4a Coalescing / recurrence semantics for entity-bearing alerts (resolves Codex F4)

`admin_alerts` keeps **one unresolved row per `(coalesce(show_id,''), code)`** (partial unique index, `20260501001000_internal_and_admin.sql:279`), and `upsert_admin_alert` overwrites `context = p_context` while incrementing `occurrence_count` for every non-`failedKeys` producer (verified in `20260505000000_upsert_admin_alert.sql`). So if two crew members claim identities for the **same show** before Doug resolves the alert, they collapse into one row whose stored `context` reflects only the **latest** claim, with `occurrence_count = 2`.

**Contract (no lifecycle/RPC change):** the identity line renders the **latest** sighting's entity (that is what `context` holds), and when a row's `occurrence_count > 1` it appends a muted disclosure segment **"(most recent of N)"**. A coalesced multi-entity row is therefore never presented as a single definitive identity — the operator sees "the most recent claim was Jane Doe · jane@… · Show X, and there were N claims." This is honest and proportionate for an informational, low-frequency alert; enumerating every coalesced claim would require a bounded-array merge in the RPC (out of scope, and a read-modify-write race on the un-locked admin_alerts write path). The disclosure is applied by `describeAlert`/the surfaces uniformly for **any** entity-bearing code with `occurrence_count > 1` (not OAuth-specific). `global` codes never show it.

### 6.4 Interaction with already-interpolated copy

For the 6 codes whose `dougFacing` already interpolates an entity (17 `PARSE_ERROR_LAST_GOOD`, 18 `SHEET_UNAVAILABLE`, 22 `SHOW_FIRST_PUBLISHED`, 23 `SHOW_UNPUBLISHED`, 38 `TILE_SERVER_RENDER_FAILED`, 39 `TILE_PROJECTION_FETCH_FAILED`), the identity map entry is `{ kind: "global" }` → no identity line. Their entity is already in the copy; the rule is **the identity line never restates what the copy already says.** (These stay in the map so the §8.3 completeness meta-test passes.)

---

## 7. Redaction-posture contract change (deliberate)

The read-core comment (`lib/observe/query/alerts.ts:4-6`) states context is "intentionally NOT selected — not redaction-guaranteed (unlike app_events.context). Spec §3.3 / §5." AGENTS.md "Telemetry access → Redaction posture" states "`queryAlerts` never selects `admin_alerts.context`." D3/D3a refine this: `queryAlerts` now **selects** `context` (to enrich CLI identity) but **scrubs email keys by default**, so it stays redaction-guaranteed by default; the raw email is opt-in via `includePii` / `--reveal-email`.

**Updates landing in this PR:**
1. `lib/observe/query/alerts.ts` — select `context`, project to `IDENTITY_CONTEXT_KEYS` as `identityContext`, withhold email unless `includePii`; replace the NOTE comment with the new posture (selects context but returns only an allowlisted identity projection; raw jsonb never leaves the read-core; email opt-in).
2. `AGENTS.md` "Telemetry access → Redaction posture" bullet — amend to: `queryAlerts` selects `admin_alerts.context` but returns **only** an allowlisted identity projection (never the raw jsonb); the `user_email`/`email` fields within it are withheld unless `includePii` is set (via the `--reveal-email` CLI flag); `queryChangeLog` image exclusions unchanged. Also add `--reveal-email` to the `alerts` row of the AGENTS.md observe command table.
3. Master spec §3.3/§5 redaction note (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`) — add an amendment line recording the projection + email carve-out (invariant 7: spec is canonical; changes are recorded, not silent). **Never run prettier on the master spec** (`feedback_never_prettier_the_master_spec`).
4. `tests/observe/queryAlerts.test.ts` — extend: default query returns only `IDENTITY_CONTEXT_KEYS` (a planted arbitrary field like `error_message` is absent); email withheld by default, present with `includePii: true`; non-email identity keys always present.

**Redaction-guaranteed-by-default strengthened, not weakened:** `queryAlerts` previously returned no context at all; it now returns an allowlisted identity projection (a **known, curated** subset), never the raw jsonb — arbitrary producer fields never reach the CLI. Raw email is the single opt-in field. `queryChangeLog` image exclusions unchanged.

---

## 8. Guard conditions & invariants

### 8.1 Guard conditions (every render path)

| Condition | Behavior |
|-----------|----------|
| `context` is `null`/`{}` | Identity line suppressed; copy renders unchanged. |
| A referenced id (`crew_member_id`, `drive_file_id`, `show_id`) resolves to no row (deleted, cross-show) | That segment is dropped; remaining segments still render. If none resolve → line suppressed. |
| Legacy `OAUTH_IDENTITY_CLAIMED` row (no `user_email` in context) | Email segment **omitted** (raw OAuth email was never persisted; `crew_members.email` is NOT substituted — §3.2/§5, Codex F10). Crew name (if resolvable) + show still render. |
| Resolver returns `kind: "infra_error"` | Callers render whatever partial identities resolved, keep the alert copy intact, and **log** the degraded read (invariant 9); never a silent disappearance mistaken for "no entity". |
| `context[key]` present but wrong type (non-string email, non-array count) | Segment dropped (defensive coercion, mirrors `readDataGapsDigest` at `PerShowAlertSection.tsx:62`). |
| Unknown/uncataloged `code` (DB string not in map) | Identity line suppressed (mirror `isMessageCode` guard at `AlertBanner.tsx`); never throw on the persistent admin layout. |
| Resolver DB read errors (infra fault) | Degrade to no identity for affected rows; alert copy still renders; never throw. |
| `global` code | Line suppressed by design. |
| Email present but empty string | Segment dropped. |
| Coalesced row (`occurrence_count > 1`, entity-bearing) | Latest entity rendered + muted "(most recent of N)" disclosure appended (§6.4a). Never for `global` codes. |
| Composite context key (`changes`, `crew_member_ids`) | Sanitized to scalar derived fields by `projectIdentityContext`; raw objects/deltas never reach a renderer or the CLI (§3.1). |

### 8.2 Plan-wide invariants touched

- **Invariant 3 (email canonicalization):** the one raw-email field is populated from `canonicalize()` output; guard meta-test re-run (§5).
- **Invariant 5 (no raw error codes in UI):** identity segments render entity **names/counts/safe tokens only** — never a MessageCode, SQLSTATE, PostgREST code, JS error-class name, or free-form error message. The allowlist `IDENTITY_CONTEXT_KEYS` (§3.1) deliberately EXCLUDES `rpc_error_code`, `rpc_error_message`, `error_name`, `error_message`, `reason` — so a raw DB code cannot reach a rendered identity segment by construction (resolves Codex F3). A test asserts codes like `42501`/`PGRST116` never appear in a rendered admin identity line.
- **Invariant 8 (UI quality gate):** banner + per-show + feed renderer are UI → `/impeccable critique` AND `/impeccable audit` on the diff before Codex; HIGH/CRITICAL fixed or `DEFERRED.md`.
- **Invariant 9 (Supabase call-boundary):** `resolveAlertIdentities` destructures `{ data, error }`, distinguishes infra faults, registers in the relevant meta-test OR carries an inline `// not-subject-to-meta` justification.
- **No advisory-lock paths touched** (render + one context field); **no DDL** (email rides existing `context jsonb`); **no new RPC-gated table.**

### 8.3 Meta-tests (inventory)

- **CREATE `tests/adminAlerts/_metaAlertIdentityMap.test.ts`:** assert `ALERT_IDENTITY_MAP` has an entry for **every** code in `ADMIN_ALERTS_CODES` (the 42-code registry at `tests/messages/_metaAdminAlertCatalog.test.ts:57`), and that every entry is either `global` or has ≥1 segment producer. This is the completeness guard that makes "full sweep" durable — a new alert code fails CI until its identity (or explicit `global`) is declared.
- **EXTEND** `tests/messages/_metaAdminAlertCatalog.test.ts` awareness only if needed (the existing `INTERPOLATED_DOUG_FACING_CODES` gate is unaffected — we add no new copy placeholders except possibly none).
- **Supabase call-boundary:** register `resolveAlertIdentities` reads in the applicable meta-test or annotate `// not-subject-to-meta: read-only identity resolution, no mutation`.

---

## 9. Testing strategy

### 9.1 `describeAlert` / identity-map unit matrix (`lib/adminAlerts`)

A **code × context** table test. For each of the 42 codes, feed a representative `context` fixture and assert the produced `AlertIdentity`:
- **Anti-tautology:** derive expected names from the fixture (`crew_members.name`, `shows.title` in a seeded map), never hardcode a name the formatter could echo by accident. Assert against the resolved-lookup fixture, not the rendered container.
- **Concrete failure modes each case catches:** missing context key → segment dropped; unresolvable id → segment dropped; global code → `null`; already-in-copy code → suppressed/complement only; wrong-type value → dropped.
- **OAUTH_IDENTITY_CLAIMED end-to-end:** `context = { crew_member_id: X, show_id: Y, user_email: "jane@gmail.com" }` + a lookup fixture where `X→"Jane Doe"`, `Y→"II — FinTech…"` → `describeAlert` = `"Crew: Jane Doe · jane@gmail.com · Show: II — FinTech…"`.
- **Legacy OAUTH row (Codex F1 + F10):** `context = { crew_member_id: X, user_email_hash: "…" }` (NO `user_email`) → identity shows `Crew: Jane Doe · Show: …` with **no email segment** (assert no `@` / no `crew_members.email` value appears). New-row case with `user_email` present → email segment renders.
- **Invariant-5 raw-code suppression (Codex F3):** for `PICKER_BOOTSTRAP_RPC_FAILED`/`CALLBACK_CLAIM_THREW`/`WEBHOOK_TOKEN_INVALID` with `context` carrying `rpc_error_code: "42501"`, `error_name`, `reason` → the rendered identity contains **none** of those strings (assert `42501`/`PGRST`/error-class substrings absent).
- **Nested-field sanitization (Codex F5):** `projectIdentityContext` on `ROLE_FLAGS_NOTICE` context `{ drive_file_id, changes: [{crew_name:"Jane", prior_flags:["X"], new_flags:["Y"]}] }` → output has `role_change_crew_names: ["Jane"]` + `role_change_count: 1` and **no** `changes`, `prior_flags`, or `new_flags` key; a planted `error_message`/`orphan_url` under any code is absent from the projection.
- **Coalescing disclosure (Codex F4):** an `OAUTH_IDENTITY_CLAIMED` row with `occurrence_count: 2` renders the latest crew/email/show + a "(most recent of 2)" segment; the same code with `occurrence_count: 1` has no disclosure segment; a `global` code with `occurrence_count: 5` shows no identity line at all.

### 9.2 `resolveAlertIdentities` — batching & guards

- Asserts ≤3 DB reads for a mixed batch; empty id-sets skip their query; infra error on one read degrades gracefully (other segments still resolve); each read is bounded (`.limit`).
- **Show-scoped crew resolution (Codex F7):** a row with `show_id: A` and `identityContext.crew_member_id` pointing at a crew row whose `show_id: B` → crew segment suppressed (assert the other-show name does NOT appear); the matching-show case renders it.
- **Infra-fault discriminability (Codex F9):** a resolver DB read that returns an error → result is `{ kind: "infra_error" }` (not `"ok"`); a read that throws → also `{ kind: "infra_error" }`; both still return a (possibly empty/partial) `identities` map. A clean run → `{ kind: "ok" }`.

### 9.3 Render tests

- **AlertBanner** (`tests/components/AlertBanner.test.tsx`, extend): with an `OAUTH_IDENTITY_CLAIMED` row + resolver stub, the collapsed banner renders `data-testid="admin-alert-identity"` containing crew name, email, show title; a `global` code renders no identity element; unknown code renders no identity element and does not throw.
- **PerShowAlertSection:** identity line renders per alert; clone-and-remove sibling nodes before scanning for a name to avoid self-satisfying assertions (anti-tautology rule). **Show-only code with no `drive_file_id` (Codex F6):** an `EMAIL_DELIVERY_FAILED`/`PENDING_SNAPSHOT_PROMOTE_STUCK` alert on a show page renders the show-name identity segment (proving the parent `showId` was injected — it would be blank if not).
- **CLI / read-core allowlist (Codex F2):** `queryAlerts` on a row whose `admin_alerts.context` carries an arbitrary non-identity field (e.g. `error_message: "secret"`, `orphan_url`) returns an `identityContext` containing ONLY `IDENTITY_CONTEXT_KEYS` — the arbitrary field is absent. Email withheld by default, present with `includePii: true`. `scripts/observe.ts` shows `describeAlert(…, { includePii:false })` per row (no email); `--reveal-email` shows it. A `--json` snapshot asserts no `user_email` and no non-allowlisted key by default.

### 9.4 No layout-dimensions / transition-audit tasks

The identity line is a normal text node in an existing flex/stack; no fixed-dimension parent with flex/grid children is introduced, and no new animated/multi-state component. (If implementation places the identity inside a fixed-height row, add the real-browser layout assertion per the writing-plans rule — decide at plan time.)

---

## 10. Files touched (projection)

**New:** `lib/adminAlerts/alertIdentityMap.ts`, `lib/adminAlerts/projectIdentityContext.ts` (sanitizer), `lib/adminAlerts/resolveAlertIdentities.ts`, `lib/adminAlerts/describeAlert.ts`, `tests/adminAlerts/_metaAlertIdentityMap.test.ts`, `tests/adminAlerts/projectIdentityContext.test.ts`, `tests/adminAlerts/describeAlert.test.ts`, `tests/adminAlerts/resolveAlertIdentities.test.ts`.

**Edited:** `app/auth/callback/route.ts` (one field), `components/admin/AlertBanner.tsx` (select `shows(slug,title)` + render identity), `components/admin/PerShowAlertSection.tsx` (render identity), `lib/observe/query/alerts.ts` (select context → allowlisted `identityContext` projection + `includePii` + comment), `lib/observe/query/types.ts` (`AlertRow.identityContext`, `AlertFilters.includePii`), `scripts/observe.ts` (`--reveal-email` flag + identity line), `AGENTS.md` (redaction posture + observe command table), `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (redaction amendment note), `tests/observe/queryAlerts.test.ts` (allowlist-projection + PII tests), possibly `tests/cross-cutting/email-canonicalization.test.ts` (only if the new field needs a fixture — expected: no change, guard already accepts canonicalized).

**No DDL. No migration. No new alert code. No advisory-lock change.**

---

## 11. Open questions

None blocking. The one contract tension (feed redaction) was resolved by D3 with the user's explicit acknowledgment that it weakens that posture; §7 records the mitigations.
