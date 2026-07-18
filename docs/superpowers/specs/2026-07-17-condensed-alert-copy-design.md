# Condensed inline-context admin alert copy — design

**Date:** 2026-07-17
**Status:** Approved design (user). Cross-model adversarial review UNAVAILABLE this round: `codex exec` v0.142.5→v0.144.5 dies mid-run on a models-cache TTL-renewal parse bug (5 attempts, 2026-07-17); per the documented fallback ladder this spec ran an extended structural self-review instead (render-surface leak audit §6, meta-test collision sweep §7), the cross-model gate is deferred to the whole-diff review stage, and real CI remains the hard gate.
**Scope:** Admin alert copy condensation: fold at-a-glance identity into the alert message text, drop the separate identity chip for converted codes, add actionable links. Bell panel + per-show alert cards only.

## 1. Problem

The bell notification for `ROLE_FLAGS_NOTICE` (screenshot 2026-07-17) renders:

- Generic fallback title "Notification" (catalog `title` is `null` — `lib/messages/catalog.ts:866`, fallback at `components/admin/BellPanel.tsx:95`).
- A 32-word generic `dougFacing` that names no entity (`lib/messages/catalog.ts:872`).
- A separate bordered identity chip ("Sheet: II - RIA Investment Forum – Central 2025 · Crew: Doug Larson · 1 role change") from `describeAlert(entry.identity)` (`BellPanel.tsx:195-208`).
- A 102-word `helpfulContext` behind a chevron.

The reader wants one sentence: *"In 'II - RIA Investment Forum', Doug Larson's role changed from A1 to A1 + LEAD."* The same identity-in-a-box-below-generic-copy pattern repeats across ~12 other codes (audit §6).

## 2. Resolved decisions (user, 2026-07-17)

| # | Decision |
|---|----------|
| D1 | Scope = **bell panel + per-show alert cards**. Telemetry `HealthAlertsPanel` and `pnpm observe` CLI keep current rendering. |
| D2 | Multi-change rendering = **per-change lines, cap 3**, then `+N more — see show page`. Single change reads as one sentence. |
| D3 | `ROLE_FLAGS_NOTICE.helpfulContext` → **null** (chevron disappears; `BellPanel.tsx:395-403` already hides the caret when null). Bell action row gains a leading internal **"Review in show page"** link; **"Open in Sheet" stays second**. |
| D4 | Mechanism = **read-time derived params**: catalog templates with `<placeholder>` tokens; a shared helper derives params per entry from raw `context` + the already-resolved identity. No producer/context schema change, no DB migration, works for pre-existing rows (identity resolves at read time from `drive_file_id`/`show_id` — `lib/adminAlerts/resolveAlertIdentities.ts:230-245`). |

## 3. ROLE_FLAGS_NOTICE (exemplar)

### 3.1 Catalog changes (`lib/messages/catalog.ts:866`)

- `title`: `null` → `"Role change applied"`.
- `dougFacing` → template:

  ```
  In <sheet-name>, <role-changes><lead-hint>
  ```

- `helpfulContext` → `null`.
- `severity` stays `info`; `audience` unchanged.

### 3.2 Derived params (owned by the shared helper, §4)

| Param | Derivation | Fallback |
|---|---|---|
| `sheet-name` | Resolved identity "Sheet" segment value (`resolveAlertIdentities.ts` show title), wrapped in straight single quotes (`'` U+0027, not smart quotes — copy-hygiene-safe): `'II - RIA Investment Forum – Central 2025'` | `this sheet` (unquoted) when segment missing/unresolved |
| `role-changes` | From `context.changes` (`lib/sync/phase2.ts:156-159` shape `{crew_name, prior_flags, new_flags}[]`), formatted per §3.3 | `a crew member's role flags changed — see the show page.` when `changes` missing/empty/malformed |
| `lead-hint` | `" Lead changes must be confirmed in the show page."` (leading space) when any change entry has LEAD membership differing between `prior_flags` and `new_flags`; else `""` | `""` |

Every param is **always resolvable** (fallback phrases guarantee full interpolation), so converted codes never hit the unresolved-placeholder fallback path; that guard (§4.3) stays as a safety net only.

### 3.3 `role-changes` formatting

Flags joined with ` + ` (e.g. `A1 + LEAD`). Per `changes.length`:

- **1 change**, prior and new both non-empty:
  `Doug Larson's role changed from A1 to A1 + LEAD.`
- **1 change**, `prior_flags: []` (arm b, new member — `phase2.ts:293-299`):
  `Doug Larson was added with LEAD.`
- **1 change**, `new_flags: []` (arm c, removed member — `phase2.ts:320-330`):
  `Doug Larson (LEAD) was removed from the crew.`
- **N > 1 changes:** header + bullet lines (newlines; render sites get `whitespace-pre-line`, §4.4), capped at 3 lines:

  ```
  3 role changes:
  • Doug Larson: A1 → A1 + LEAD
  • Jane Doe: added with FINANCIALS
  • Sam Roe: LEAD → (removed)
  ```

  With >3: first 3 lines then `+N more — see show page.`

Guard conditions: a change entry with missing/non-string `crew_name` or non-array flags is skipped; if all entries are malformed the whole param falls back (§3.2). Empty-string crew name renders the entry skipped. Flags arrays are rendered verbatim (no re-ordering); empty-after-filter treated as `[]`.

### 3.4 Actions (bell only)

`lib/adminAlerts/alertActions.ts` today maps `ROLE_FLAGS_NOTICE: openSheet` (`alertActions.ts:85`, builder at `:57-60`, shape `{label, href, external}`). Change: action production becomes an ordered **list**:

- `[0]` `{ label: "Review in show page", href: "/admin/show/<slug>", external: false }` — only when `opts.slug` present (`resolveAlertAction` already receives `{slug}` — `alertActions.ts:129-136`).
- `[1]` existing `openSheet` (unchanged).

**Caller inventory (salvaged Codex R1 finding — the resolver has more consumers than the bell):** `resolveAlertAction` is called by `lib/admin/bellFeed.ts:125` AND `components/admin/telemetry/HealthAlertsPanel.tsx:78`, with pins in `tests/messages/_metaAlertActionsContract.test.ts`, `tests/adminAlerts/alertActions.test.ts`, `tests/components/healthAlertsPanel.test.tsx`. To avoid a cross-surface signature break, **`resolveAlertAction` keeps its current single-link signature unchanged**; a new `resolveAlertActions(code, context, opts): AlertActionLink[]` (list, ordered) is added and used by the bell feed only — for `ROLE_FLAGS_NOTICE` it returns `[showPage, openSheet]`, for every other code `[resolveAlertAction(...)]`-equivalent (0 or 1 element). `HealthAlertsPanel` is untouched. `BellEntry.action` (`lib/admin/bellFeed.ts:27-47`) becomes `actions: AlertActionLink[]` (empty array when none); `BellPanel.ActionCell` (`BellPanel.tsx:244-296`) renders the list in order with existing `LINK_CTA` styling. Other codes' single actions become one-element lists — no per-code behavior change. `_metaAlertActionsContract` extends to pin the list resolver's delegation. The per-show card renders **no** show-page link (it lives on that page); its existing action handling is unchanged.

### 3.5 Identity chip

Suppressed for this code in both surfaces (§5). The message now carries sheet + crew + change count.

## 4. Mechanism

### 4.1 Shared helper

New `lib/adminAlerts/deriveMessageParams.ts`:

```ts
export function deriveAlertMessageParams(
  code: string,
  context: Record<string, unknown> | null,
  identity: AlertIdentity | null,
): MessageParams
```

Returns `context` scalars (current behavior — non-scalar values ignored by `interpolate`, `lib/messages/lookup.ts:20-36`) merged with:

- `sheet-name` / `show-name`: from the resolved identity's `Sheet`/`Show`-labelled segment (`describeAlert.ts` segment shape `{label, value}`, `resolveAlertIdentities.ts:143-151`), typographic-quoted; fallback `this sheet` / `this show`.
- Code-specific derivations (currently only `ROLE_FLAGS_NOTICE`: `role-changes`, `lead-hint` per §3).

Pure function, no I/O — identity resolution already happened at both call sites.

### 4.2 Call sites

- **Bell feed** (`lib/admin/bellFeed.ts:241-254`): after `resolveAlertIdentities`, attach `messageParams: deriveAlertMessageParams(code, context, identity)` to each `BellEntry`. `BellPanel` passes `entry.messageParams` (falling back to `entry.context` only if absent — transitional safety) to `renderCatalogEmphasis`.
- **Per-show section** (`components/admin/PerShowAlertSection.tsx:296, 338-343`): same helper output replaces the raw `alert.context` params passed to `safeDougFacingTemplate` + `renderCatalogEmphasis`.
- **Telemetry health panel** (`components/admin/telemetry/HealthAlertsPanel.tsx:73` — currently passes raw `row.context`): passes `deriveAlertMessageParams(row.code, row.context, null)` instead. **Load-bearing (self-review finding R1):** all 12 sweep codes are `audience: "health"` (`lib/adminAlerts/audience.ts:14-16` derives `HEALTH_CODES` from the catalog), so they ALL render on this panel, which has no identity resolution — without this call, `<show-name>`/`<sheet-name>` would leak as literal tokens there. The identity-less call yields the fallback phrases ("this show"/"this sheet"), which read no worse than today's generic copy. No chip/layout change on this surface; param plumbing only.

### 4.3 Unresolved-placeholder guard

Per-show already has `safeDougFacingTemplate` (`PerShowAlertSection.tsx:106-117`, regex at `:35`). Bell gains the same guard: if the interpolated message still matches `/<[a-zA-Z_][a-zA-Z0-9_-]*>/`, render **no message line** and do **not** suppress the identity chip (fallback = today's layout: title + chip). Since §3.2 params always resolve, this path is defense-in-depth only.

### 4.4 Multi-line rendering

Message spans get `whitespace-pre-line` (`BellPanel.tsx:407` message span; per-show equivalent). `renderCatalogEmphasis` passes `\n` through as text (`components/messages/renderEmphasis.tsx` — text nodes byte-preserved); HTML collapses it without the class.

### 4.5 Chip suppression declaration

`export const INLINE_IDENTITY_CODES: ReadonlySet<string>` in `lib/adminAlerts/alertIdentityMap.ts` — the codes whose dougFacing template carries identity inline. `BellPanel.IdentityChip` and the per-show `identityText` render (`PerShowAlertSection.tsx:398`) return null for member codes **only when the message rendered** (interpolation succeeded); on the §4.3 guard path the chip renders as today, so identity is never lost. Meta-test (§7) pins membership ↔ template placeholder presence.

## 5. Chip-suppression rule

A code joins `INLINE_IDENTITY_CODES` iff its `dougFacing` template references at least one identity-bearing placeholder (`<sheet-name>`, `<show-name>`, `<repo>`, `<file-name>`, `<role-changes>`). All §6 converted codes + `ROLE_FLAGS_NOTICE` join. Non-member codes keep chips untouched.

## 6. Class sweep (12 codes)

Audit (2026-07-17, live extraction): beyond the exemplar, 12 segment-bearing codes have generic dougFacing that never names the entity — identity only in the chip (13 converted codes total including `ROLE_FLAGS_NOTICE`). All get identity woven inline + chip suppression. `title`s keep current values (all non-null except ROLE_FLAGS_NOTICE); `helpfulContext` unchanged for sweep codes (only ROLE_FLAGS_NOTICE drops it, D3).

Params: `<show-name>`/`<sheet-name>` derived (§4.1); `<repo>`, `<file-name>`, `<attempted-action>` interpolate from existing raw context keys (identity map `contextField` keys — `lib/adminAlerts/alertIdentityMap.ts:265-282`).

| Code (catalog line) | New dougFacing |
|---|---|
| REPORT_ORPHANED_LOST_LEASE (2404) | `A duplicate bug-report issue for <show-name> was auto-closed during a retry race. Click through to verify it closed correctly. If this recurs, increase the lease window.` |
| REPORT_LOOKUP_INCONCLUSIVE (2895) | `We couldn't confirm whether a report for <show-name> went through. Try again in a few minutes.` |
| REPORT_DUPLICATE_LIVE_MATCHES (2863) | `Multiple live GitHub issues match one report for <show-name>. Recovery is paused until Eric reviews the duplicates.` |
| REPORT_OPEN_ORPHAN_LABEL (2914) | `An open GitHub issue for <show-name> carries the orphan-cleanup label. Eric needs to re-close it or remove the label.` |
| REPORT_LEASE_THRASHING (2440) | `Bug-report processing is thrashing on <show-name> — retries are racing against leases. This usually means the lease window needs tuning.` |
| STALE_ORPHAN_REPORT (3083) | `A stale bug-report reservation for <show-name> expired before it could create a GitHub issue. No action needed unless it repeats.` |
| PENDING_SNAPSHOT_PROMOTE_STUCK (2053) | `A diagram snapshot promotion for <show-name> has been stuck for more than 15 minutes. Eric needs to run the snapshot-promote repair tool before cleanup can finish.` |
| PENDING_SNAPSHOT_ROLLBACK_STUCK (2071) | `A diagram snapshot rollback for <sheet-name> stalled after moving some assets. Eric needs to run the snapshot-rollback repair tool before cleanup can finish.` |
| EMAIL_DELIVERY_FAILED (2307) | `A notification email for <show-name> couldn't be sent. We'll keep retrying automatically; if it persists, the developer will check the email provider setup.` |
| WIZARD_SESSION_SUPERSEDED_RACE (261) | `A leftover wizard action (<attempted-action>) for <file-name> was safely cancelled before it could change the new wizard's state. Continue in the active wizard tab.` |
| BRANCH_PROTECTION_DRIFT (2089) | `Branch protection on <repo> no longer matches the X.6 contract. Restore the required checks and review settings before merging.` |
| BRANCH_PROTECTION_MONITOR_AUTH_FAILED (2107) | `Branch-protection monitoring for <repo> cannot authenticate with GitHub. Rotate the GH App token or PAT within 24 hours.` |

**Other render surfaces (leak audit, 2026-07-17, cross-checked against salvaged Codex R1 narrative):** the help/errors page renders `title` + `code` + `longExplanation` only — `dougFacing` is used solely in its renderability predicate, never rendered (`app/help/errors/page.tsx:26,95`), so no placeholder can leak there. `pnpm observe codes` prints raw catalog templates offline — established behavior for existing placeholder codes (`SHEET_UNAVAILABLE`, `lib/messages/catalog.ts:122-136`), dev-facing, acceptable. `ErrorExplainer` (`components/messages/ErrorExplainer.tsx:88`) accepts params from callers and none of the 13 codes flow through it without context. `needsAttention.ts` / `sectionWarningModel.ts` do not consume these codes. The telemetry health panel is handled in §4.2.

Fallback phrasing note: `EMAIL_DELIVERY_FAILED` fires with no `show_id` sometimes (identity map surfaces the segment only when present — `alertIdentityMap.ts:173-177`); fallback reads `A notification email for this show couldn't be sent.` — acceptable degradation, pinned in tests. Same pattern for every derived param. `<repo>`/`<file-name>`/`<attempted-action>` come straight from producer context; if absent the guard (§4.3) restores today's layout (generic copy impossible here since the template would be partially unresolved → message line dropped, chip shown).

## 7. Lockstep + test surface

**§12.4 lockstep (per catalog edit, same commit):** master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4 prose rows (lines 2809-3083 per code, extraction 2026-07-17) + `pnpm gen:spec-codes` regen + `lib/messages/catalog.ts`. Gate: `pnpm test:audit:x1-catalog-parity` (`tests/cross-cutting/codes.test.ts`, wired in `.github/workflows/x-audits.yml:74`).

**Meta-test inventory (declared per AGENTS.md writing-plans rule):**

- EXTENDS `tests/messages/_metaAlertActionsContract.test.ts` — action list shape change (§3.4).
- CREATES inline-identity meta-test: every `INLINE_IDENTITY_CODES` member's catalog `dougFacing` contains ≥1 identity placeholder; every catalog `dougFacing` containing `<sheet-name>`/`<show-name>`/`<role-changes>` for a segment-bearing code is a member (bidirectional).
- EXTENDS bell feed/panel tests (actions array, messageParams, chip suppression, whitespace-pre-line class, guard fallback).
- EXTENDS per-show section tests (derived params, chip suppression, guard fallback).
- Unit tests for `deriveAlertMessageParams`: all §3.3 arms, cap boundary (3, 4), malformed changes (missing name, non-array flags, empty array, non-array `changes`), lead-hint condition (gain, loss, FINANCIALS-only → no hint), quote fallbacks.
- EXTENDS `tests/components/healthAlertsPanel.test.tsx`: for each converted code, rendering with empty context produces no unresolved `<placeholder>` in the DOM (fallback-phrase path).
- Existing pins to sweep at plan time: `tests/admin/roleFlagsNoticeReclassify.test.ts`, `tests/adminAlerts/alertActions.test.ts`, `tests/adminAlerts/alertIdentityMatrix.test.ts`, `tests/components/PerShowAlertSection.test.tsx`, `tests/admin/healthAlerts.test.ts` — plus D7 banned-vocabulary check (`tests/messages/_metaCatalogCopyHygiene.test.ts:122`) against the new ROLE_FLAGS_NOTICE title/template.
- `_metaCatalogCopyHygiene.test.ts` / `_metaEmphasisRenderContract.test.ts`: verify unaffected or extend if placeholder copy trips them (checked at plan time).

**Other invariants:** no DB change; no advisory-lock surface; no new mutation surface (invariant 10 N/A); no raw codes in UI (invariant 5 — fallback title/copy paths preserve it); UI diff → impeccable v3 critique + audit dual-gate before close-out (invariant 8).

## 8. Out of scope

- `pnpm observe alerts` CLI and telemetry `HealthAlertsPanel` rendering (keep `describeAlert` output).
- `helpfulContext` rewrites for sweep codes.
- Producer/context schema changes; backfills.
- Crew-facing copy (`crewFacing`) — untouched.

## 9. Transition/dimensional notes

Chip removal is instant (no exit animation — chip is server-render-static per entry, never toggles within a mount). No fixed-dimension parent/child relationships change; the message span grows naturally in the scroll container. Multi-line messages rely on `whitespace-pre-line` only (no layout component change). Caret removal for ROLE_FLAGS_NOTICE follows the existing null-helpfulContext path (`BellPanel.tsx:395`), already instant.
