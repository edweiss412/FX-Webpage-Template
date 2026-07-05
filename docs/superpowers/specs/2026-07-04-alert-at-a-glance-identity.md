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
2. **Full sweep:** every generic code that identifies a concrete entity surfaces that entity (crew / show / sheet / count), rendered on **the surfaces where that code actually appears** (see the surface-scope note below). Identity is entity names/counts only — never diagnostic strings like `reason`/error messages/codes (§3.1, invariant 5). Codes that are genuinely global carry an explicit "no per-entity identity" declaration — no fabricated entities, no silent gaps.

**Surface scope — info-severity codes are per-show + CLI only (resolves Codex F11).** `AlertBanner` deliberately excludes `severity:"info"` codes via `INFO_SEVERITY_CODES` (`AlertBanner.tsx:71-73`, derived from catalog `severity:"info"` entries; pinned by existing banner tests). The two info-severity entity-bearing codes — `ROLE_FLAGS_NOTICE` (catalog:749) and `SHOW_FIRST_PUBLISHED` (catalog:950, already-SPECIFIC) — **never reach the banner and this spec does not change that**. Their identity renders on `PerShowAlertSection` and the `pnpm observe alerts` CLI only. "All three surfaces" therefore means "all surfaces on which the code is eligible to render." No banner info-exclusion contract or test is modified.

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

**Entity-identity only — never diagnostics (invariant 5).** Segment producers surface **entity identifiers** (crew/show/sheet **names**, counts, safe descriptive tokens like a repo slug or a wizard action name) and the OAuth **email**. They MUST NOT surface raw error codes, SQLSTATEs, PostgREST codes, JS error-class names, or free-form error messages (`rpc_error_code`, `rpc_error_message`, `error_name`, `error_message`, `reason`) — those are diagnostics, not identity, and rendering them on the admin web UI would violate invariant 5 (no raw error codes in user-visible UI). A code whose only distinguishing context is a diagnostic (and whose show/sheet is not resolvable) is therefore `global`. The §9.1 tests prove the identity line can never emit any of these diagnostic fields.

**Pre-existing watch diagnostic — explicit deferral, not a silent carve-out (Codex F17).** The existing `WATCH_CHANNEL_ORPHANED` `error_message` `<code>` block (`AlertBanner.tsx:239-240,423-429`) renders a free-form provider/infra error string verbatim. It **predates this spec**, is a deliberate infra-diagnostic affordance for an infra-only alert (Eric-facing; the copy escalates to support), and is **not** part of the identity line this spec adds. Because this PR is UI-owned and edits the same banner, we do NOT carve it out silently: it is recorded as `BL-WATCH-ERROR-MESSAGE-RAW-DIAGNOSTIC` in `BACKLOG.md` (evaluate whether the watch detail should become a cataloged/sanitized status class) and, if the invariant-8 dual-gate flags it on the diff, dispositioned as an explicit deferral in the handoff. This spec neither extends nor removes that block; it only guarantees the new identity work adds no further diagnostic exposure.

**Sanitized identity projection (`projectIdentityContext`).** The identity map never reads raw `context`. A pure function `projectIdentityContext(rawContext, { includePii }): IdentityContext` sanitizes the arbitrary producer jsonb into a **curated, scalar-only** shape and is applied at **every** surface (web AND CLI) before resolution — so the identity map has one uniform input contract and no raw/composite field ever reaches a renderer or the CLI. The output shape (`IDENTITY_CONTEXT_KEYS`):

```
IdentityContext = {
  // (A) RESOLUTION IDS — shape-VALIDATED, NEVER sanitized, used only server-side
  //     by resolveAlertIdentities for lookups; NOT rendered and NOT serialized
  //     into CLI/--json output.
  resolution: {
    crew_member_id?, stale_crew_member_id?, show_id?,  // must match a UUID regex, else dropped
    drive_file_id?,                                    // must match Drive-ID charset [A-Za-z0-9_-]{10,200}, else dropped
  },
  // (B) DISPLAY STRINGS — passed through sanitizeIdentityString (control/format
  //     strip, redact, cap); these are what render and serialize.
  display: {
    file_name?, sheet_name?, repo?, attempted_action?,  // attempted_action also enum-constrained
    role_change_crew_names?: string[],                  // DERIVED from changes[].crew_name (cap 3) — never raw `changes`
    email?, user_email?,                                // PII — present ONLY when includePii
  },
  // (C) DERIVED COUNTS — numbers, no sanitization needed.
  counts: { role_change_count?: number, crew_member_count?: number },
}
```

**Resolution IDs are validated, not sanitized (resolves Codex F23).** `crew_member_id`/`stale_crew_member_id`/`show_id`/`drive_file_id` are internal lookup keys. They MUST NOT go through `sanitizeIdentityString` — the token redactor would turn a real base64-like `drive_file_id` (or a hex-run inside an id) into `[redacted-token]` and silently break every `→show`/`→sheet`/`→crew` segment. Instead each is **shape-validated** against its expected pattern (UUID for the `*_id` UUIDs; Drive-ID charset `[A-Za-z0-9_-]{10,200}` for `drive_file_id`); a value that fails validation is dropped (the lookup simply finds nothing — no corruption, no injection). Resolution IDs are consumed by `resolveAlertIdentities` server-side and are **never** part of the rendered `AlertIdentity` nor the CLI `--json` output — so they can't leak and can't be mangled.

**`IdentityContext` is internal; the serialized shape is distinct (resolves Codex F24).** `IdentityContext` (with its `resolution` group) is the projection's **internal** output, consumed only by `resolveAlertIdentities` on the server. It is NEVER what leaves the read-core. The read-core/CLI serialize a separate `SerializedAlertIdentity` type — the resolved `AlertIdentity` display segments (already-sanitized display strings + resolved names) plus group-(C) counts — which **structurally has no `resolution` field and no id-shaped keys**. The §8.3 meta-test pins this: the serialized/`--json` object must contain no `resolution`, no raw `context`, and none of `drive_file_id`/`crew_member_id`/`stale_crew_member_id`, nor a `context`-derived `show_id` (the alert **row's own** top-level `show_id`/`showId` column is unaffected — it predates this PR and is the alert's scope, not a context projection). So an implementation cannot satisfy the guard while returning `identityContext.resolution.*`.

- **Composite keys are sanitized, not passed through** (resolves Codex F5): `changes: Array<{crew_name, prior_flags, new_flags}>` (`phase2.ts:120-126`) is reduced to `role_change_crew_names` + `role_change_count` — the `prior_flags`/`new_flags` deltas NEVER leave `projectIdentityContext`. `crew_member_ids: string[]` becomes `crew_member_count`. Any key not in the output shape (`error_message`, `orphan_url`, `rpc_error_code`, `reason`, ids, hashes, `failedKeys`, `data_gaps`, …) is dropped.
- **Every DISPLAY string is sanitized, not just gated (resolves Codex F19).** An allowlisted key name is not a safety guarantee — a producer-controlled `file_name`/`sheet_name`/`repo`/`crew_name` can itself contain an email, a token, a customer name, a newline, or a copied provider diagnostic. `projectIdentityContext` therefore passes **every group-(B) display string** (and every element of `role_change_crew_names`) through a `sanitizeIdentityString`. (Group-(A) resolution IDs are validated instead — see above — and group-(C) counts are numbers.) The step order is load-bearing (resolves Codex F22 — capping before redacting could truncate a boundary-straddling token to a sub-threshold prefix that escapes the redactor):
  1. Coerce to string; strip **all Unicode control and format characters** — C0/C1 controls incl. newlines/tabs, bidi overrides (U+202A–U+202E, U+2066–U+2069), and zero-width/format chars (U+200B–U+200D, U+FEFF) — so neither the CLI terminal nor a web line can be spoofed by hidden reordering/zero-width injection, and a token cannot be visually split to dodge the redactor; collapse runs of whitespace.
  2. **Redact secrets on the FULL, un-capped string** — token-like substrings (hex/base64 runs ≥ 24 chars) → `[redacted-token]` **always** (any `includePii`; `--reveal-email` must never expose them, Codex F21); email-like substrings (`\S+@\S+`) → `[redacted-email]` when `includePii` is false. Redaction runs over the original length so a token straddling the cap boundary is still matched and replaced whole.
  3. **Then length-cap to 120 chars** (truncate + `…`). Because redaction already ran, truncation can only clip already-`[redacted-*]` placeholder text or benign characters, never a live secret prefix.
  4. `attempted_action` is separately constrained to the known wizard-action enum (the `WizardSessionSupersededRollbackError` `attemptedAction` value set); an out-of-enum value is dropped, so this field can never carry free-form text (enum values are short, so ordering is moot for it).
- **`includePii` gates email and only email:** the dedicated `email`/`user_email` fields (withheld entirely when false) AND in-string email substrings (step 2). Token redaction, control/format strip, length-cap, and the action enum are **always on** and unaffected by the flag. Web passes `true`; the CLI defaults `false`, `--reveal-email` sets `true`.
- **The dedicated email field is itself sanitized** when present (control/format-strip + length-cap + token-redact via `sanitizeIdentityString`), just not email-self-redacted (it IS the email). So even a revealed email can't carry a control char or an embedded token.
- **`sanitizeIdentityString` is the single chokepoint** for **every rendered string** — both group-(B) projected display strings AND every resolved DB name (`crew_members.name`, `shows.title`, §3.2, Codex F25). The §8.3 redaction meta-test asserts no display string bypasses it and that group-(A) resolution IDs never appear in serialized CLI/`--json` output; the resolver unit test proves resolved names are sanitized. Structurally: segments are only ever constructed from `sanitizeIdentityString(...)` output — a helper (`makeSegment`) is the sole segment constructor and always sanitizes, so no code path can emit an unsanitized string.
- This is the projection the observe read-core emits (§6.2, resolving F2) and the exhaustive input surface the unit tests enumerate. Adding a new segment source requires extending `IdentityContext` + `projectIdentityContext` (pinned by the §8.3 meta-test).

### 3.2 `lib/adminAlerts/resolveAlertIdentities.ts` — batched resolution (read-only DB)

`resolveAlertIdentities(rows, supabase): Promise<AlertIdentitiesResult>` where `AlertIdentitiesResult = { kind: "ok"; identities: Map<alertId, AlertIdentity> } | { kind: "infra_error"; identities: Map<alertId, AlertIdentity> }` (resolves Codex F9 — infra faults are a **discriminable** typed result per invariant 9, never silently indistinguishable from "no identity"). On an infra fault the partial `identities` map is still returned (rows whose reads succeeded resolve; the rest are absent) AND `kind: "infra_error"` signals the degraded state so callers can log it. Each input row carries `{ id, code, show_id, occurrence_count, identityContext }` where `identityContext` is the **already-projected** sanitized shape (§3.1) — resolution never sees raw context.

1. Walk `rows`, consult `ALERT_IDENTITY_MAP[code]`, and collect the set of `crew_member_id`s, `drive_file_id`s, and `show_id`s (from each row's `identityContext.resolution` group — validated IDs, §3.1) that need name resolution. Display strings come from `identityContext.display`; counts from `identityContext.counts`.
2. Issue **at most three batched, bounded `.select().in(...).limit(...)` reads**: `crew_members(id,show_id,name)`, `shows(id,title,slug)`, `shows(drive_file_id,title,slug)`. Skip any query whose id-set is empty. (`crew_members.show_id` is fetched for the show-scoping check below.)
3. For each row, run its segment producers against the resolved lookups + the row's projected `identityContext`, producing an `AlertIdentity`. **Every resolved DB name (`crew_members.name`, `shows.title`) is passed through `sanitizeIdentityString` with the same `includePii` policy before becoming a segment value (resolves Codex F25)** — these names originate from Google Sheets (crew names, sheet/show titles) and are just as untrusted as producer `context`; without this, a crew name or show title containing an email, long token, newline, or bidi/control char would bypass §7's "every surviving string is sanitized" guarantee and leak through the CLI/`--json` and web identity lines. So sanitization covers BOTH projected display strings (§3.1) AND resolved names (here) — the two sources of every rendered string. If the code is not `global`, ≥1 entity segment was produced, and `row.occurrence_count > 1`, append a final disclosure segment `{ label: null, value: "(most recent of N)" }` (§6.4a).

**Effective show.** A row's effective show is resolved in precedence order: `row.show_id` (the column) → `identityContext.resolution.show_id` (used by `PICKER_BOOTSTRAP_RPC_FAILED`, whose row is null-scoped, §5b) → the show resolved from `identityContext.resolution.drive_file_id`. The `→show`/`→sheet` segments and the crew show-scoping check below both use this effective show.

**Show-scoped crew resolution (resolves Codex F7).** A crew segment (name) is emitted **only when the resolved crew row's `show_id` equals the alert's effective show**. A `crew_member_id`/`stale_crew_member_id` that points at a different show (stale, malformed, or producer-bugged context) yields **no** crew segment, preventing a wrong-show crew name from being attributed to the alert. This is the concrete mechanism behind the §8.1 "cross-show id → segment dropped" guard. (The OAuth email is never sourced from the crew row — §5 — so there is no cross-show email-leak vector. Crew-bearing codes all set `row.show_id`, so `identityContext.show_id` never widens their scope check.)

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
| 3 | PICKER_BOOTSTRAP_RPC_FAILED | Show | →show (via `identityContext.show_id`) | **add `show_id: targetShowId` to `context`** at `emitClaimFailure` (row stays null-scoped — no lifecycle change; route.ts:93/192/197, `targetShowId` non-null past the route.ts:176 guard) |
| 4 | PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED | **global** (justified) | — | none — see note |
| 5 | CALLBACK_CLAIM_THREW | **global** (`show_id` null; only `error_name` diagnostic in ctx) | — | none |
| 6 | PICKER_SELECTION_RACE | Show · Crew (stale) | →show, →crew `ctx:stale_crew_member_id` | none |
| 7 | PICKER_EPOCH_RESET | Show | →show | none |
| 8 | ASSET_RECOVERY_BYTES_EXCEEDED | Sheet | →show | none |
| 9 | ASSET_RECOVERY_REVISION_DRIFT | Sheet | →show | none |
| 10 | ASSET_RECOVERY_DRIFT_COOLDOWN | Sheet | →show | none |
| 11 | WATCH_CHANNEL_ORPHANED | **global** (justified) | — | none — see note (`watch.ts:193` writes `showId:null`; context has `watched_folder_id`/`channel_id`/`error_*` only — folder-scoped, no resolvable show/sheet; existing `error_message` `<code>` block unchanged) |
| 12 | WEBHOOK_TOKEN_INVALID | **global** (only `channel_id`/`reason` diagnostics; sheet not resolvable) | — | none |
| 13 | EMBEDDED_RECOVERY_REQUIRES_RESTAGE | Sheet | →show (via `ctx:drive_file_id`) | none |
| 14 | LIVE_ROW_CONFLICT | Sheet `file_name` | `ctx:file_name` | none |
| 15 | ROLE_FLAGS_NOTICE | Sheet · crew name(s) (cap 3, "+N more") · "N role change(s)" — **info-severity: per-show + CLI only, NOT banner** | →show (via `drive_file_id`), `role_change_crew_names` + `role_change_count` (derived from `changes[].crew_name` by the projection — raw flag deltas dropped) | none |
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
| 42 | WIZARD_SESSION_SUPERSEDED_RACE | Sheet `file_name` · action `attempted_action` | `ctx:file_name` (durable), `ctx:attempted_action` | **add `file_name` to context at all 4 emitters** via the shared error context (the onboarding sheet is a transient `pending_ingestions` row with no `shows` mapping, so render-time show lookup can't resolve it) |

**Producer changes required: three alert codes** (resolves Codex F13 + F18 + F20) —
1. `OAUTH_IDENTITY_CLAIMED` (`app/auth/callback/route.ts`) gains `user_email` (§5a).
2. `PICKER_BOOTSTRAP_RPC_FAILED` (`app/api/auth/picker-bootstrap/route.ts`) — add `show_id: targetShowId` to the **`context`** object (NOT the `showId` column — row stays null-scoped, §5b) so `→show` resolves via `identityContext.show_id`, no lifecycle change.
3. `WIZARD_SESSION_SUPERSEDED_RACE` — **all four** emitters (retry route:543, staged-apply route:219, staged-discard route:158, manifest-ignore route:255) write `showId: null` and no sheet name; the sheet is a transient `pending_ingestions` row. Add a sanitized `file_name` at all four via the shared error context — §5c.

Every other identifier is ID-resolvable at render time or already in `context`. This is still the Approach-A payoff: three alert codes get a producer edit (the wizard one threaded through one shared error-context field to reach all four emitters) + one identity-map file + one resolver — not scattered edits across all 42 codes.

**PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED stays `global` (justified, Codex F13).** This alert fires precisely because the share-token URL **could not be resolved to a show** — so no show entity exists to name. The `context.slug` is the raw, unresolved URL fragment, not a resolvable entity identifier; rendering it would present an unresolved token as if it were a show. Intentionally out of scope: a failed resolution has no entity. (`rpc_error_code`/`rpc_error_message` remain diagnostics, excluded by §3.1.)

**Codes classified `global` (identity line suppressed), 13 total:** the three truly system-wide (19 SYNC_STALLED, 21 EMAIL_NOT_CONFIGURED, 33 GITHUB_BOT_LOGIN_MISSING); the four folder-/diagnostic-scoped with no resolvable per-show entity (4 PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED, 5 CALLBACK_CLAIM_THREW, 11 WATCH_CHANNEL_ORPHANED, 12 WEBHOOK_TOKEN_INVALID); and the six already-SPECIFIC-in-copy (17, 18, 22, 23, 38, 39) whose entity is already interpolated into the copy so the identity line adds nothing. **13 global entries, 29 with an identity segment, 42 total.** (Numeric-sweep anchor — the §8.3 meta-test enforces every code is present as either `global` or with ≥1 segment.)

**Already-SPECIFIC codes** (17, 18, 22, 23, 38, 39): declared `global` in the identity map (their entity is already interpolated into `dougFacing`; the identity line must never restate the copy — §6.4). The completeness meta-test still requires their presence.

---

## 5. Raise-site changes — two producer edits

### 5a. `OAUTH_IDENTITY_CLAIMED` — add raw email

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

### 5b. `PICKER_BOOTSTRAP_RPC_FAILED` — resolvable show identity, no lifecycle change (resolves Codex F13 + F14)

`emitClaimFailure` (`app/api/auth/picker-bootstrap/route.ts:93`) is only called (route.ts:192, 197) *after* the `if (!targetShowId) return htmlResponse(...)` guard at route.ts:176, so `targetShowId` (resolved at route.ts:171) is a non-null show id in scope. Add a `showId` parameter to `emitClaimFailure`, thread `targetShowId` through at both call sites, and add **`show_id: targetShowId` to the `context` object** — the `upsertAdminAlert` `showId` argument **stays `null`**.

**Why context, not the column (Codex F14):** the unresolved-alert unique index is `(coalesce(show_id,''), code)`. Promoting the row from null-scoped to show-scoped would (a) strand any existing null-scoped `PICKER_BOOTSTRAP_RPC_FAILED` rows (they'd never coalesce with the new show-scoped ones), and (b) fan failures out per show instead of incrementing one queue row — a lifecycle change that the non-goals forbid and that would need a migration/cleanup. Writing the show id into `context.show_id` instead keeps the row null-scoped: **coalescing, occurrence-count, and resolution semantics are byte-for-byte unchanged**, while the identity resolver reads `identityContext.show_id` to render the show. TDD: a test asserts the emitted row keeps `show_id (column) === null` AND `context.show_id === targetShowId`, and that the rendered identity shows the resolved show title.

### 5c. `WIZARD_SESSION_SUPERSEDED_RACE` — capture the sheet name at raise time, all four emitters (resolves Codex F18 + F20)

This alert has **four** emission sites, each catching the shared `WizardSessionSupersededRollbackError` and writing `showId: null` + `{ attempted_action, superseded_session_id, current_session_id, pending_ingestion_id, drive_file_id }` with **no sheet name**:

| Emitter | `attempted_action` | emit site |
|---|---|---|
| retry | `retry` | `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts:543` |
| staged apply | `apply` | `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route.ts:219` |
| staged discard | `discard` | `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route.ts:158` |
| manifest ignore | `permanent_ignore` | `app/api/admin/onboarding/manifest/[wizardSessionId]/[driveFileId]/ignore/route.ts:255` |

The referenced sheet is a **transient `pending_ingestions` row** — it may be promoted/deleted before Doug reads the alert, so render-time `pending_ingestions(drive_file_id → drive_file_name)` resolution is unreliable and there is no `shows` row either. Capture the name **at raise time via the shared error context** (one change reaches all four): add a `driveFileName` field to `WizardSessionSupersededRollbackError.context` (`lib/sync/wizardSessionRollback.ts:1-3`) and populate it at **every** throw site, then set `file_name: error.context.driveFileName` in **all four** emissions. The throw sites (resolves Codex F26 — the retry route has LOCAL throws beyond `retrySingleFile`):
- `lib/sync/applyStaged.ts:1152/1182/1681`
- `lib/sync/discardStaged.ts:470/487`
- `lib/sync/retrySingleFile.ts:182` (the `retry` action path)
- **the retry route's local `rollbackContext`** (`app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts:472-476`, feeding the throws at :479/:493/:504 for the manifest-transition / deferral / delete branches) — add `driveFileName: current.row.drive_file_name` there (the `PendingIngestionRow` already carries `drive_file_name`), which covers all three local throws at once
- the manifest-ignore route's throws (`.../ignore/route.ts:225/239`) The identity map reads the allowlisted, sanitized `file_name` scalar directly (no resolution). Guard: any throw site where the name isn't in scope omits it → that alert renders `attempted_action` only (no crash). TDD: producer tests for **all four** emitters assert the emitted context carries a sanitized `file_name` (or explicitly omits it when unavailable), with a case where no `shows` row exists (proving resolution never depends on `shows`).

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
- **Allowlisted identity projection in the read-core:** after fetching, `queryAlerts` runs `projectIdentityContext` (§3.1) on each row's `context`, then resolves display via `resolveAlertIdentities`. What the CLI serializes (table + `--json`) is the **rendered `AlertIdentity` display segments + resolved names**, plus the group-(C) counts — **never** the group-(A) resolution IDs (internal-only, Codex F23) and never the raw `context`. Group-(B) display strings are already sanitized; `email`/`user_email` withheld unless `includePii` (default **false**). So the read-core emits only sanitized entity-identity display, safe for terminal AND `--json`/pipes. `RawAlert`/`AlertRow` (`lib/observe/query/types.ts`) carry the resolved identity, not a raw `context`.
- **Single resolution owner = the read-core (resolves Codex F27).** `queryAlerts` is the ONLY layer that runs `projectIdentityContext` + `resolveAlertIdentities`; it returns each row's fully-resolved, already-sanitized `AlertRow.identity: SerializedAlertIdentity` and **nothing else** derived from `context` — no `identityContext`, no `resolution` group, no raw `context`, no context-derived IDs. `includePii` (from the flag) is passed **into** `queryAlerts` so resolution/serialization happens once, PII-correct, at that single owner.
- **CLI adapter is format-only:** `scripts/observe.ts` gains a `--reveal-email` flag → passes `includePii: true` to `queryAlerts` and prints a one-line stderr notice ("showing raw email — PII"). It does NOT resolve or sanitize; it only calls `describeAlert(row.identity)` (or reads the pre-built segments) to print the line. Without the flag the email segment is already absent (the read-core withheld it).
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

**Redaction-guaranteed-by-default strengthened, not weakened:** `queryAlerts` previously returned no context at all; it now returns an allowlisted identity projection (a **known, curated** subset), never the raw jsonb — arbitrary producer fields never reach the CLI. Every surviving string is sanitized: control-stripped, length-capped, action-enum-constrained, and **token-like substrings are always redacted** (never revealed by any flag — §3.1 rule 3, Codex F21). Email is the *single* opt-in: the dedicated email field and in-string email substrings are gated by `includePii`/`--reveal-email` (§3.1 rule 4), and that flag exposes email and nothing else — tokens/secrets stay redacted even with `--reveal-email`. `queryChangeLog` image exclusions unchanged.

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
- **CREATE `tests/observe/_metaAlertsRedactionContract.test.ts`** (resolves Codex F15) — a structural guard pinning the new `queryAlerts` redaction boundary, since selecting `admin_alerts.context` reverses a hard privacy convention and example-level tests won't stop a `AlertRow.context = rawContext` regression. It asserts: (a) **no context-derived IDs or raw context in serialized output (Codex F24)** — `queryAlerts`'s returned object (and its `--json` form) contains no `resolution` key, no raw `context`, and none of `drive_file_id`/`crew_member_id`/`stale_crew_member_id` nor a `context`-derived `show_id`; the returned identity is the `SerializedAlertIdentity` display shape only (the alert row's own top-level `showId` column is exempt — it is the alert's scope, not a context projection); (b) `projectIdentityContext` + `resolveAlertIdentities` are the only path from `admin_alerts` `context` to a returned field, and the internal `IdentityContext` (with `resolution`) is never serialized; (c) email display keys appear ONLY when `includePii` is set; (d) **in-string PII/secrets scrubbed (Codex F19 + F21 + F22)** — a default `queryAlerts` over a row whose `file_name`/`sheet_name`/`repo`/`changes[].crew_name` contains an email or long token substring returns those fields with the substring redacted; token substrings stay redacted even with `includePii: true` (only email is revealed); redaction runs before length-cap (a boundary-straddling token is fully redacted); every display string is free of Unicode control/format/bidi chars and ≤120 chars. The meta-test iterates the projection's **display** string-field set so a newly added display string that skips `sanitizeIdentityString` fails CI (the structural closure for this vector). Pattern: source-scan `alerts.ts` for a raw `context` passthrough (mirrors the existing `_metaReadOnlyQueryCore` source-scan style) + behavioral assertions with planted arbitrary/PII-bearing context.
- **EXTEND** `tests/messages/_metaAdminAlertCatalog.test.ts` awareness only if needed (the existing `INTERPOLATED_DOUG_FACING_CODES` gate is unaffected — we add no new copy placeholders except possibly none).
- **Supabase call-boundary:** register `resolveAlertIdentities` reads in the applicable meta-test or annotate `// not-subject-to-meta: read-only identity resolution, no mutation`.

---

## 9. Testing strategy

### 9.1 `describeAlert` / identity-map unit matrix (`lib/adminAlerts`)

A **code × context** table test. For each of the 42 codes, feed a `context` fixture and assert the produced `AlertIdentity`. **Fixtures must mirror the real producer's context shape** (resolves the broader Codex F16 point) — each non-`global` entry's fixture uses the exact keys its raise site actually writes (e.g. `ROLE_FLAGS_NOTICE` → `{ drive_file_id, changes:[{crew_name,prior_flags,new_flags}] }` per `phase2.ts`; `PICKER_BOOTSTRAP_RPC_FAILED` → `{ show_id, attempted_email_hash, rpc_error_code, rpc_error_message, route }` per `picker-bootstrap/route.ts`), never a synthetic `drive_file_id` a producer never emits. A helper cross-checks that every key a producer fixture relies on is one the identity map reads, so a code marked entity-bearing but whose producer writes no resolvable field fails the test (the WATCH_CHANNEL_ORPHANED trap).
- **Anti-tautology:** derive expected names from the fixture (`crew_members.name`, `shows.title` in a seeded map), never hardcode a name the formatter could echo by accident. Assert against the resolved-lookup fixture, not the rendered container.
- **Concrete failure modes each case catches:** missing context key → segment dropped; unresolvable id → segment dropped; global code → `null`; already-in-copy code → suppressed/complement only; wrong-type value → dropped.
- **OAUTH_IDENTITY_CLAIMED end-to-end:** `context = { crew_member_id: X, show_id: Y, user_email: "jane@gmail.com" }` + a lookup fixture where `X→"Jane Doe"`, `Y→"II — FinTech…"` → `describeAlert` = `"Crew: Jane Doe · jane@gmail.com · Show: II — FinTech…"`.
- **Legacy OAUTH row (Codex F1 + F10):** `context = { crew_member_id: X, user_email_hash: "…" }` (NO `user_email`) → identity shows `Crew: Jane Doe · Show: …` with **no email segment** (assert no `@` / no `crew_members.email` value appears). New-row case with `user_email` present → email segment renders.
- **Invariant-5 raw-code suppression (Codex F3):** for `PICKER_BOOTSTRAP_RPC_FAILED`/`CALLBACK_CLAIM_THREW`/`WEBHOOK_TOKEN_INVALID` with `context` carrying `rpc_error_code: "42501"`, `error_name`, `reason` → the rendered identity contains **none** of those strings (assert `42501`/`PGRST`/error-class substrings absent).
- **Nested-field sanitization (Codex F5):** `projectIdentityContext` on `ROLE_FLAGS_NOTICE` context `{ drive_file_id, changes: [{crew_name:"Jane", prior_flags:["X"], new_flags:["Y"]}] }` → output has `role_change_crew_names: ["Jane"]` + `role_change_count: 1` and **no** `changes`, `prior_flags`, or `new_flags` key; a planted `error_message`/`orphan_url` under any code is absent from the projection.
- **String-field sanitization (Codex F19):** `projectIdentityContext({ file_name: "budget jane@x.com <ctrl>\n  x".padEnd(300,"z") }, { includePii:false })` → the returned `file_name` has the email redacted to `[redacted-email]`, no control chars/newlines, length ≤120. `attempted_action: "totally-freeform"` (not in the wizard enum) → dropped; a valid enum value survives.
- **Flag scope = email only (Codex F21):** a `file_name` containing both an email AND a 40-char hex token → with `includePii:false` **both** are redacted; with `includePii:true` (i.e. `--reveal-email`) the **email is revealed but the token is STILL `[redacted-token]`**. Proves the reveal flag's consent surface is exactly email, never secrets.
- **Redact-before-cap ordering (Codex F22):** a string with benign text padding a 40-char hex token so the token **starts before and crosses the 120-char cap** → the token is fully `[redacted-token]` (never a truncated prefix), then capped; plus threshold cases: a 23-char hex run is NOT redacted, a 24-char run IS. Asserts no live secret prefix ever survives truncation.
- **Resolved DB names sanitized (Codex F25):** a resolver lookup where `crew_members.name`/`shows.title` contains an email, a 40-char token, a newline, and a bidi char → the rendered segment has them stripped/redacted per policy: default CLI redacts the email; `--reveal-email` reveals the email but still redacts the token and strips control/bidi; web (`includePii:true`) shows the email but is control/bidi-free and token-redacted. Proves resolved names go through the same `sanitizeIdentityString` as projected display strings.
- **Resolution IDs validated, not sanitized (Codex F23):** a real Google Drive `drive_file_id` (long base64-like, e.g. `1N1PKmhcvLAn5UwHLn4Rplm1yeVeYMvwfL3eOzB4McnY`) in `identityContext.resolution` is passed through UNCHANGED and **resolves its show** (the token redactor never touches it); a malformed `drive_file_id` (fails the charset/length shape) is dropped → segment absent, no `[redacted-token]` corruption. A UUID `show_id`/`crew_member_id` likewise survives and resolves. The CLI `--json` snapshot asserts the `resolution` IDs are **absent** from serialized output (internal-only).
- **Coalescing disclosure (Codex F4):** an `OAUTH_IDENTITY_CLAIMED` row with `occurrence_count: 2` renders the latest crew/email/show + a "(most recent of 2)" segment; the same code with `occurrence_count: 1` has no disclosure segment; a `global` code with `occurrence_count: 5` shows no identity line at all.
- **Picker-bootstrap show identity, no lifecycle change (Codex F13 + F14):** a test on `emitClaimFailure` asserts the emitted `PICKER_BOOTSTRAP_RPC_FAILED` row keeps the `show_id` **column** `null` (unchanged coalescing) AND carries `context.show_id === targetShowId`, so its `→show` identity resolves via `identityContext.show_id`; `PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED` remains `global` by the §4 justification.
- **Wizard race sheet name at raise time (Codex F18 + F20 + F26):** producer tests for **all four** `WIZARD_SESSION_SUPERSEDED_RACE` emitters assert the emitted context carries a sanitized `file_name` (via `error.context.driveFileName`); **for the retry route, exercise each rollback branch** — the shared `retrySingleFile` throw AND the local throws at route.ts:479/493/504 (manifest-transition / deferral / delete) — each carrying `file_name`. A resolver/describe test with that context and **no `shows` row** still renders `Sheet <file_name> · <attempted_action>`. A structural check enumerates the emitter set so a future 5th emitter is caught.

### 9.2 `resolveAlertIdentities` — batching & guards

- Asserts ≤3 DB reads for a mixed batch; empty id-sets skip their query; infra error on one read degrades gracefully (other segments still resolve); each read is bounded (`.limit`).
- **Show-scoped crew resolution (Codex F7):** a row with `show_id: A` and `identityContext.crew_member_id` pointing at a crew row whose `show_id: B` → crew segment suppressed (assert the other-show name does NOT appear); the matching-show case renders it.
- **Infra-fault discriminability (Codex F9):** a resolver DB read that returns an error → result is `{ kind: "infra_error" }` (not `"ok"`); a read that throws → also `{ kind: "infra_error" }`; both still return a (possibly empty/partial) `identities` map. A clean run → `{ kind: "ok" }`.

### 9.3 Render tests

- **AlertBanner** (`tests/components/AlertBanner.test.tsx`, extend): with an `OAUTH_IDENTITY_CLAIMED` row + resolver stub, the collapsed banner renders `data-testid="admin-alert-identity"` containing crew name, email, show title; a `global` code renders no identity element; unknown code renders no identity element and does not throw.
- **PerShowAlertSection:** identity line renders per alert; clone-and-remove sibling nodes before scanning for a name to avoid self-satisfying assertions (anti-tautology rule). **Show-only code with no `drive_file_id` (Codex F6):** an `EMAIL_DELIVERY_FAILED`/`PENDING_SNAPSHOT_PROMOTE_STUCK` alert on a show page renders the show-name identity segment (proving the parent `showId` was injected — it would be blank if not).
- **CLI / read-core serialized shape (Codex F2 + F27):** `queryAlerts` on a row whose `admin_alerts.context` carries an arbitrary non-identity field (e.g. `error_message: "secret"`, `orphan_url`) returns only `AlertRow.identity` as a `SerializedAlertIdentity` (display segments + counts) — asserted to contain **no** `identityContext`, no `resolution`, no raw `context`, no context-derived IDs (`drive_file_id`/`crew_member_id`/`stale_crew_member_id`/context-`show_id`), and not the arbitrary field. Email segment withheld by default, present with `includePii: true`. `scripts/observe.ts` (format-only) prints the pre-serialized identity; `--reveal-email` passes `includePii` to `queryAlerts`. A `--json` snapshot asserts the whole serialized object exposes none of the above by default.

### 9.4 Real-browser layout task for the AlertBanner identity line (mandatory — resolves Codex F12)

The collapsed banner row is a **constrained grid/flex** layout (`min-h-tap-min`, icon/summary/action alignment, the `col-span-full` panel invariant — `AlertBanner.tsx:380+`). Adding an identity line beneath the collapsed one-liner changes row height, wrapping, and icon/action alignment — a class jsdom cannot evaluate (per this project's Tailwind-v4-no-default-`items-stretch` and layout-gate discipline). A **Playwright** task must, with an identity line present, at **mobile (375px) and desktop (≥1024px)** widths, for both **collapsed and expanded** states:
- assert the identity element (`data-testid="admin-alert-identity"`) is visible, does not overlap or overflow the banner, and wraps rather than clipping;
- assert the first-row icon + summary + "Check it"/action alignment is preserved (the identity line sits below the summary, not colliding with the action cell);
- assert the `+N more` chip and raised-at row remain correctly placed.

jsdom render tests (§9.3) verify content/presence; this task verifies the geometry. No transition-audit task is needed (the identity line is static — no animated/multi-state component; it appears/absent with the alert, an instant server re-render).

---

## 10. Files touched (projection)

**New:** `lib/adminAlerts/alertIdentityMap.ts`, `lib/adminAlerts/projectIdentityContext.ts` (sanitizer), `lib/adminAlerts/resolveAlertIdentities.ts`, `lib/adminAlerts/describeAlert.ts`, `tests/adminAlerts/_metaAlertIdentityMap.test.ts`, `tests/observe/_metaAlertsRedactionContract.test.ts` (F15 structural guard), `tests/adminAlerts/projectIdentityContext.test.ts`, `tests/adminAlerts/describeAlert.test.ts`, `tests/adminAlerts/resolveAlertIdentities.test.ts`.

**Edited:** `app/auth/callback/route.ts` (one field), `app/api/auth/picker-bootstrap/route.ts` (add `context.show_id` in `emitClaimFailure`), the shared `WizardSessionSupersededRollbackError` context (`lib/sync/wizardSessionRollback.ts`, add `driveFileName`) + its throw sites (`lib/sync/applyStaged.ts`, `lib/sync/discardStaged.ts`, `lib/sync/retrySingleFile.ts`) + all four `WIZARD_SESSION_SUPERSEDED_RACE` emitters (retry, staged-apply, staged-discard, manifest-ignore routes — add `file_name`), `BACKLOG.md` (BL-WATCH-ERROR-MESSAGE-RAW-DIAGNOSTIC), `components/admin/AlertBanner.tsx` (select `shows(slug,title)` + `occurrence_count` + render identity), `components/admin/PerShowAlertSection.tsx` (inject parent `showId`, select `occurrence_count`, render identity), `lib/observe/query/alerts.ts` (select context → allowlisted `identityContext` projection + `includePii` + comment), `lib/observe/query/types.ts` (`AlertRow.identity: SerializedAlertIdentity` — display segments + counts, NO resolution IDs; `AlertFilters.includePii`), `scripts/observe.ts` (`--reveal-email` flag + identity line), `AGENTS.md` (redaction posture + observe command table), `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (redaction amendment note), `tests/observe/queryAlerts.test.ts` (allowlist-projection + PII tests), possibly `tests/cross-cutting/email-canonicalization.test.ts` (only if the new field needs a fixture — expected: no change, guard already accepts canonicalized).

**No DDL. No migration. No new alert code. No advisory-lock change.**

---

## 11. Open questions

None blocking. The one contract tension (feed redaction) was resolved by D3 with the user's explicit acknowledgment that it weakens that posture; §7 records the mitigations.
