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
2. **Full sweep:** every generic code that identifies a concrete entity surfaces that entity (crew / show / sheet / count / reason), rendered on all three admin alert surfaces. Codes that are genuinely global carry an explicit "no per-entity identity" declaration — no fabricated entities, no silent gaps.

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
| D3a | CLI email posture | **Redact raw email by default; reveal via an intentional flag** (`--reveal-email` → `includePii`). The CLI still shows enriched non-PII identity (crew/show/sheet/reason) by default; only the email segment is withheld until the flag is passed. Keeps raw PII out of terminal / `--json` / pipes unless explicitly requested. |
| D4 | Architecture | **Approach A — centralized render-time resolver** (`describeAlert` + a per-code identity map + batched ID→name resolution). Producers change only where a value is not ID-resolvable. |

---

## 3. Architecture (Approach A)

Three cooperating units, each independently testable:

### 3.1 `lib/adminAlerts/alertIdentityMap.ts` — the per-code identity map (pure data)

A `const ALERT_IDENTITY_MAP` keyed by alert code. Each entry declares **how to identify that code's entity** as an ordered list of *segment producers*, each of which is one of:

- `{ kind: "showName" }` — resolve the row's `show_id` (or `context.drive_file_id`) to `shows.title`.
- `{ kind: "sheetName" }` — same resolution as `showName` but labelled "Sheet" (the Google Sheet title IS the show title; `shows.drive_file_id` is unique).
- `{ kind: "crewName", key }` — resolve `context[key]` (a `crew_member_id`) to `crew_members.name`.
- `{ kind: "contextField", key, label, format? }` — read a literal value already in `context` (`email`, `reason`, `channel_id`, `file_name`, `error_name`, `attempted_action`, `repo`, a count, etc.).
- `{ kind: "count", key, label }` — length of a `context[key]` array, or the numeric value.

An entry may also be `{ kind: "global" }` — an **explicit** declaration that the code has no per-entity identity (system-wide). This is a first-class value, not an omission, so the completeness meta-test (§8.3) can require every code to appear.

The map is the single authoring surface for "what identifies this alert." No copy is rewritten for the 36 generic codes; identity renders as a **separate detail line**, not interpolated into `dougFacing`.

**Entity-identity only — never diagnostics (invariant 5).** Segment producers surface **entity identifiers** (crew/show/sheet **names**, counts, safe descriptive tokens like a repo slug or a wizard action name) and the OAuth **email**. They MUST NOT surface raw error codes, SQLSTATEs, PostgREST codes, JS error-class names, or free-form error messages (`rpc_error_code`, `rpc_error_message`, `error_name`, `error_message`, `reason`) — those are diagnostics, not identity, and rendering them on the admin web UI would violate invariant 5 (no raw error codes in user-visible UI). A code whose only distinguishing context is a diagnostic (and whose show/sheet is not resolvable) is therefore `global`. Existing diagnostic rendering that predates this spec (e.g. `WATCH_CHANNEL_ORPHANED`'s `error_message` `<code>` block at `AlertBanner.tsx`) is untouched — it is not part of the identity line.

**Allowlisted context keys.** The only `context` keys the identity map is permitted to read are the curated set
`IDENTITY_CONTEXT_KEYS = { crew_member_id, stale_crew_member_id, show_id, drive_file_id, file_name, sheet_name, email, user_email, crew_member_ids, changes, repo, attempted_action }`.
This allowlist is the projection the observe read-core emits (§6.2, resolving F2) and the exhaustive input surface the unit tests enumerate. Adding a new segment source requires adding its key here (pinned by the §8.3 meta-test).

### 3.2 `lib/adminAlerts/resolveAlertIdentities.ts` — batched resolution (read-only DB)

`resolveAlertIdentities(rows, supabase): Promise<Map<alertId, AlertIdentity>>`:

1. Walk `rows`, consult `ALERT_IDENTITY_MAP[code]`, and collect the set of `crew_member_id`s, `drive_file_id`s, and `show_id`s that need name resolution.
2. Issue **at most three batched, bounded `.select().in(...).limit(...)` reads**: `crew_members(id,name,email)`, `shows(id,title,slug)`, `shows(drive_file_id,title,slug)`. Skip any query whose id-set is empty. (`crew_members.email` is fetched for the OAuth email legacy fallback — see below.)
3. For each row, run its segment producers against the resolved lookups + the row's own `context`, producing an `AlertIdentity`.

**OAuth email — legacy-row fallback (resolves F1).** The email segment's value is `context.user_email ?? resolvedCrewMember.email`. `claim_oauth_identity(p_email)` stamps a crew row precisely because its canonical email **equals** the signed-in user's canonical email, so the claimed row's `crew_members.email` **is** the OAuth email at claim time. New rows carry `user_email` authoritatively (robust against later crew-email edits); pre-change rows (which have only `crew_member_id` + `user_email_hash`) fall back to the resolved `crew_members.email` — so the alert in the motivating screenshot shows crew + email + show after ship **without** a re-raise or a data backfill. If both are absent/empty (crew row deleted), the email segment is dropped (guard §8.1). This fallback is scoped to `OAUTH_IDENTITY_CLAIMED` and `AMBIGUOUS_EMAIL_BINDING` (the only email-bearing identities).

```ts
type AlertIdentitySegment = { label: string | null; value: string; pii?: boolean };
type AlertIdentity = { segments: AlertIdentitySegment[]; global: boolean };
```

The email segment is tagged `pii: true` so a consumer can withhold it (the CLI default) without the resolver knowing about surface policy.

- **Read-only:** only `.select(...)`; the module never imports `lib/log`. (It is NOT under `lib/observe/query/**`, so it is not bound by that subtree's meta-test, but it follows the same discipline.)
- **Bounded:** every `.in()` read carries a `.limit()` (satisfies `_metaBoundedReads` discipline).
- **Supabase call-boundary (invariant 9):** every call destructures `{ data, error }`; a returned/thrown infra error degrades to "no identity resolved for the affected rows" (segments that could not resolve are dropped), never a throw that takes down the admin layout.

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
| 1 | AMBIGUOUS_EMAIL_BINDING | Show · email · "N crew rows" | →show, `ctx:email`(email-fallback), count `ctx:crew_member_ids` | none |
| 2 | **OAUTH_IDENTITY_CLAIMED** | Crew · email · Show | →crew `ctx:crew_member_id`, `ctx:user_email ?? crew.email`, →show | **add `user_email` (canonical)** |
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
| 15 | ROLE_FLAGS_NOTICE | Sheet · crew name(s) from `changes[].crew_name` (cap 3, "+N more") · "N role change(s)" | →show (via `ctx:drive_file_id`), `ctx:changes[].crew_name` (already present, `phase2.ts:125`), count `ctx:changes` | none |
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

- **SELECT change:** add `title` to the `shows(slug)` join → `shows(slug, title)`. (`show_id`, `context` already selected.)
- Call `resolveAlertIdentities([alert], supabase)` for the single top alert (limit 1 → ≤3 tiny reads). Build the `AlertIdentity`.
- **Collapsed view (the at-a-glance surface):** render the identity as a second line directly beneath the collapsed one-liner (`data-testid="admin-alert-identity"`), styled `text-sm text-text-subtle`, label muted / value `text-text-strong`. This is what makes the screenshot's banner answer "who / which show" without expanding.
- **Panel:** the same identity line also renders inside the expanded panel (above `helpful-context`) so the detail survives when collapsed truncation elides it.
- **Guard:** if `describeAlert` returns `null` (global code, or nothing resolved) → render no identity line (no empty element, no `undefined`).

### 6.2 `pnpm observe alerts` CLI (`lib/observe/query/alerts.ts` read-core + `scripts/observe.ts` adapter)

There is **no web alerts feed** — `/admin#alerts` scrolls to `AlertBanner`; `NotifBell` (`components/admin/nav/NotifBell.tsx`) renders only a count. `queryAlerts` has exactly one non-test consumer: `scripts/observe.ts` (the `pnpm observe alerts` terminal CLI). So this surface is developer-facing (Eric), not Doug-facing.

- **SELECT change:** add `context` to the read-core `SELECT` (currently omitted, `alerts.ts:8`), but **never return the raw jsonb** (resolves Codex F2 — `admin_alerts.context` is not redaction-guaranteed and holds arbitrary producer fields: error messages, URLs, ids, auth state).
- **Allowlisted identity projection in the read-core:** after fetching, `queryAlerts` projects each row's `context` down to `IDENTITY_CONTEXT_KEYS` (§3.1) — the exact curated keys the identity map consumes — and returns that as `identityContext`, dropping everything else. The `user_email`/`email` keys within the projection are additionally withheld unless `includePii` (default **false**) is set. So the read-core emits **only** entity-identity fields, and never raw email by default: safe for terminal output AND `--json`/pipes. `RawAlert`/`AlertRow` (`lib/observe/query/types.ts`) gain `identityContext` (the projected subset), NOT a raw `context`.
- **CLI adapter:** `scripts/observe.ts` gains a `--reveal-email` flag → passes `includePii: true` and prints a one-line stderr notice ("showing raw email — PII"). The adapter calls `resolveAlertIdentities` (fed the projected `identityContext`) + `describeAlert(identity, { includePii })` to render an identity line per alert (crew/show/sheet always; email only with the flag). Without the flag the email segment is absent because the read-core already withheld it.
- **Redaction posture change** — see §7.

### 6.3 `PerShowAlertSection` (`components/admin/PerShowAlertSection.tsx`)

- `context` already selected (`PerShowAlertSection.tsx:121`), `slug`/show known from props. Call `resolveAlertIdentities` (crew names still need resolution; show is already in scope but pass through the resolver uniformly).
- Render the identity line under each alert's copy (near the existing `failedKeys` / `data_gaps` sub-lines), `data-testid="per-show-alert-identity"`.

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
| Legacy `OAUTH_IDENTITY_CLAIMED` row (no `user_email` in context) | Email segment falls back to resolved `crew_members.email` (§3.2). If the crew row is also gone → email segment dropped; crew name (if resolvable) + show still render. |
| `context[key]` present but wrong type (non-string email, non-array count) | Segment dropped (defensive coercion, mirrors `readDataGapsDigest` at `PerShowAlertSection.tsx:62`). |
| Unknown/uncataloged `code` (DB string not in map) | Identity line suppressed (mirror `isMessageCode` guard at `AlertBanner.tsx`); never throw on the persistent admin layout. |
| Resolver DB read errors (infra fault) | Degrade to no identity for affected rows; alert copy still renders; never throw. |
| `global` code | Line suppressed by design. |
| Email present but empty string | Segment dropped. |

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
- **Legacy OAUTH row (Codex F1):** `context = { crew_member_id: X, user_email_hash: "…" }` (NO `user_email`), lookup `X→{ name:"Jane Doe", email:"jane@gmail.com" }` → email segment falls back to `crew.email` → identity still shows `Crew: Jane Doe · jane@gmail.com · Show: …`. A second case where the crew row is deleted → email + crew dropped, show still shown.
- **Invariant-5 raw-code suppression (Codex F3):** for `PICKER_BOOTSTRAP_RPC_FAILED`/`CALLBACK_CLAIM_THREW`/`WEBHOOK_TOKEN_INVALID` with `context` carrying `rpc_error_code: "42501"`, `error_name`, `reason` → the rendered identity contains **none** of those strings (assert `42501`/`PGRST`/error-class substrings absent).

### 9.2 `resolveAlertIdentities` — batching & guards

- Asserts ≤3 DB reads for a mixed batch; empty id-sets skip their query; infra error on one read degrades gracefully (other segments still resolve); each read is bounded (`.limit`).

### 9.3 Render tests

- **AlertBanner** (`tests/components/AlertBanner.test.tsx`, extend): with an `OAUTH_IDENTITY_CLAIMED` row + resolver stub, the collapsed banner renders `data-testid="admin-alert-identity"` containing crew name, email, show title; a `global` code renders no identity element; unknown code renders no identity element and does not throw.
- **PerShowAlertSection:** identity line renders per alert; clone-and-remove sibling nodes before scanning for a name to avoid self-satisfying assertions (anti-tautology rule).
- **CLI / read-core allowlist (Codex F2):** `queryAlerts` on a row whose `admin_alerts.context` carries an arbitrary non-identity field (e.g. `error_message: "secret"`, `orphan_url`) returns an `identityContext` containing ONLY `IDENTITY_CONTEXT_KEYS` — the arbitrary field is absent. Email withheld by default, present with `includePii: true`. `scripts/observe.ts` shows `describeAlert(…, { includePii:false })` per row (no email); `--reveal-email` shows it. A `--json` snapshot asserts no `user_email` and no non-allowlisted key by default.

### 9.4 No layout-dimensions / transition-audit tasks

The identity line is a normal text node in an existing flex/stack; no fixed-dimension parent with flex/grid children is introduced, and no new animated/multi-state component. (If implementation places the identity inside a fixed-height row, add the real-browser layout assertion per the writing-plans rule — decide at plan time.)

---

## 10. Files touched (projection)

**New:** `lib/adminAlerts/alertIdentityMap.ts`, `lib/adminAlerts/resolveAlertIdentities.ts`, `lib/adminAlerts/describeAlert.ts`, `tests/adminAlerts/_metaAlertIdentityMap.test.ts`, `tests/adminAlerts/describeAlert.test.ts`, `tests/adminAlerts/resolveAlertIdentities.test.ts`.

**Edited:** `app/auth/callback/route.ts` (one field), `components/admin/AlertBanner.tsx` (select `shows(slug,title)` + render identity), `components/admin/PerShowAlertSection.tsx` (render identity), `lib/observe/query/alerts.ts` (select context → allowlisted `identityContext` projection + `includePii` + comment), `lib/observe/query/types.ts` (`AlertRow.identityContext`, `AlertFilters.includePii`), `scripts/observe.ts` (`--reveal-email` flag + identity line), `AGENTS.md` (redaction posture + observe command table), `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (redaction amendment note), `tests/observe/queryAlerts.test.ts` (allowlist-projection + PII tests), possibly `tests/cross-cutting/email-canonicalization.test.ts` (only if the new field needs a fixture — expected: no change, guard already accepts canonicalized).

**No DDL. No migration. No new alert code. No advisory-lock change.**

---

## 11. Open questions

None blocking. The one contract tension (feed redaction) was resolved by D3 with the user's explicit acknowledgment that it weakens that posture; §7 records the mitigations.
