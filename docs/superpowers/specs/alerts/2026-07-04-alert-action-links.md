# Per-code action links in admin alert rows

**Status:** Draft (autonomous-ship pipeline, user review waived 2026-07-04)
**Scope:** UI + one new lib registry + structural meta-test. No DB change, no migration, no §12.4 catalog change, no new admin-alert codes.

## 1. Problem

Admin alert rows explain what happened (catalog `dougFacing` copy) and where to learn more (`HelpAffordance` help link), but never link to the place where the operator acts. Per-show alerts get a generic "Check it" → show page (`components/admin/AlertBanner.tsx:459-465`); global alerts get an inline Mark-resolved button (`components/admin/AlertBanner.tsx:481-484`) — or, for the watch alert only, a Retry form (`:467-474`, `isWatchAlert` at `:228`) — but never a navigation affordance. Concretely: `LIVE_ROW_CONFLICT` copy says "Resolve it from the dashboard" (`lib/messages/catalog.ts:1711-1712`) with nothing to click, and `REPORT_ORPHANED_LOST_LEASE` copy says "Click through to verify the issue closed" (`lib/messages/catalog.ts:2045-2046`) while the GitHub URL sits unused in the alert's `context.orphan_url` (`lib/reports/submit.ts:994-1003`).

## 2. Resolved decisions

1. **One registry module, `lib/adminAlerts/alertActions.ts`.** The registry is keyed by its own exact literal union, NOT by `AdminAlertCode`: three of the nine action codes (`REPORT_ORPHANED_LOST_LEASE`, `BRANCH_PROTECTION_DRIFT`, `BRANCH_PROTECTION_MONITOR_AUTH_FAILED`) are raw-SQL/script producers deliberately outside the `AdminAlertCode` union (`lib/adminAlerts/upsertAdminAlert.ts:3-36` ends at `WIZARD_SESSION_SUPERSEDED_RACE`; the exemption list `NON_UPSERT_ADMIN_ALERTS_PRODUCERS` at `tests/messages/_metaAdminAlertCatalog.test.ts:626-636` documents why). So: `ALERT_ACTION_CODES` const tuple of the 9 codes → `AlertActionCode` union → `Record<AlertActionCode, AlertActionBuilder>` (full `Record`, not `Partial` — a code added to the tuple without a builder fails typecheck). Runtime membership in the 42-code universe is pinned by the meta-test (§6.3).
2. **Exactly 9 codes get an action** (§4). Every other code is N/A with a stated reason (§5). No raise-site changes anywhere: `REPORT_ORPHANED_LOST_LEASE` already carries `orphan_url` + `orphan_issue_number` in context (`lib/reports/submit.ts:994-1003`), so the earlier idea of enriching that raise site is dead — the registry consumes what exists.
3. **Rendering split.** `PerShowAlertSection` renders the action link for its per-show rows. `AlertBanner` renders it **only for global rows** (`show_id === null`): per-show banner rows keep "Check it" as their single navigation (the action link appears after click-through, on the show page); adding both would duplicate navigation affordances in one slot. A code whose scope is data-dependent (`REPORT_ORPHANED_LOST_LEASE`, §4 #7) renders its link on whichever surface matches the row's actual `show_id` — the split strands no registered code on either surface.
4. **Plain `<a>` uniformly** (the banner's "Check it" precedent, `components/admin/AlertBanner.tsx:459-465`). External links add `target="_blank" rel="noopener noreferrer"` and a trailing `<span aria-hidden="true">↗</span>` (the `PerShowActionableWarnings` precedent, `components/admin/PerShowActionableWarnings.tsx:94-102`). Internal links get no icon and no `target`.
5. **Builder returns the whole action or null.** `AlertActionLink = { label: string; href: string; external: boolean }`. One code can pick different targets from different context shapes (LIVE_ROW_CONFLICT: sheet when `drive_file_id` present, Drive folder fallback when only `folder_id`), so the label lives in the return value, not in a static field.
6. **Fail-quiet guards.** Any missing, non-string, empty, or malformed context field → builder returns `null` → no link renders. Pre-registry rows (raised before a context field existed) degrade to today's behavior. No error states, no placeholder copy.
7. **Structural meta-test** `tests/messages/_metaAlertActionsContract.test.ts` pins registry↔raise-site fidelity and registry↔target fidelity on disk (§6). This is the meta-test-inventory entry for this feature; no existing registry meta-test is extended.

## 3. Registry API

```ts
// lib/adminAlerts/alertActions.ts

export const ALERT_ACTION_CODES = [
  "SHOW_FIRST_PUBLISHED",
  "PICKER_EPOCH_RESET",
  "PICKER_SELECTION_RACE",
  "ROLE_FLAGS_NOTICE",
  "LIVE_ROW_CONFLICT",
  "WIZARD_SESSION_SUPERSEDED_RACE",
  "REPORT_ORPHANED_LOST_LEASE",
  "BRANCH_PROTECTION_DRIFT",
  "BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
] as const;
export type AlertActionCode = (typeof ALERT_ACTION_CODES)[number];

export type AlertActionLink = { label: string; href: string; external: boolean };

export type AlertActionBuilder = (
  context: Record<string, unknown> | null,
  opts: { slug: string | null },
) => AlertActionLink | null;

export const ALERT_ACTIONS: Record<AlertActionCode, AlertActionBuilder>;

export function resolveAlertAction(
  code: string,
  context: Record<string, unknown> | null,
  opts: { slug: string | null },
): AlertActionLink | null;
```

- `resolveAlertAction` is the only symbol components call: unknown code → `null`; registered code → the builder's result. `code: string` (not the union) because both components carry `code` as `string` in their row types (`components/admin/PerShowAlertSection.tsx:42-47`, `components/admin/AlertBanner.tsx:46-59`); internally it narrows via `ALERT_ACTION_CODES.includes(code)` (or an equivalent `Set`) before indexing the `Record`.
- A module-private helper `str(context, key): string | null` returns `context[key]` only when `typeof === "string"` and non-empty after `.trim()`, else `null`. Every context read goes through it — `context` is untyped JSON (`Record<string, unknown> | null` in both row types), and passing a non-string into a URL template must be impossible.
- The module is plain shared code (no `"use client"`, no server-only imports) — `buildSheetDeepLink` already imports cleanly into both client and server components (`lib/sheet-links/buildSheetDeepLink.ts`, no directive; client precedent: `components/admin/wizard/Step3SheetCard.tsx:1` is `"use client"` and imports it at `:44`; server precedent: `components/admin/PerShowActionableWarnings.tsx:3`).

## 4. The 9 registry entries

> **Post-ship amendments (registry grew past the original 9).** Two codes were
> added after this spec shipped; the enforced source of truth is the parity
> meta-test (`tests/messages/_metaAlertActionsContract.test.ts`), not this table:
> `RESYNC_SHRINK_HELD` (re-sync quality gate audit #3 → `Review & re-sync`,
> slug-dependent `#resync` fragment) and `ONBOARDING_SHEET_UNREADABLE`
> (setup-scan hard-fail folder alert → `Open Drive folder`,
> `driveFolderUrl(context.folder_id)`, fail-quiet; PR #414 hybrid-lifecycle
> follow-up so the "sheets couldn't be read" card links to the folder to fix).

| # | Code | Label | Href | External | Guards (all via `str`) |
|---|------|-------|------|----------|------------------------|
| 1 | `SHOW_FIRST_PUBLISHED` | `Go to Published toggle` | `/admin/show/${encodeURIComponent(slug)}#share-access` | no | `opts.slug` non-empty, else null |
| 2 | `PICKER_EPOCH_RESET` | `Go to Share & access` | same as #1 | no | same as #1 |
| 3 | `PICKER_SELECTION_RACE` | `Go to Share & access` | same as #1 | no | same as #1 |
| 4 | `ROLE_FLAGS_NOTICE` | `Open in Sheet` | `buildSheetDeepLink(drive_file_id)` | yes | `drive_file_id` string, else null (builder also null-guards: `lib/sheet-links/buildSheetDeepLink.ts`) |
| 5 | `LIVE_ROW_CONFLICT` | `Open in Sheet` / fallback `Open Drive folder` | `buildSheetDeepLink(drive_file_id)`; if `drive_file_id` absent, `driveFolderUrl(folder_id)` | yes | either field string; both absent → null |
| 6 | `WIZARD_SESSION_SUPERSEDED_RACE` | `Go to setup wizard` | `/admin/onboarding` | no | none (static route, `app/admin/onboarding/page.tsx` exists) |
| 7 | `REPORT_ORPHANED_LOST_LEASE` | `Open GitHub issue` | `context.orphan_url` verbatim | yes | string AND `startsWith("https://github.com/")`, else null (scheme allow-list — context is untyped JSON; never render an unvalidated string into `href`) |
| 8 | `BRANCH_PROTECTION_DRIFT` | `Open branch settings` | `https://github.com/${repo}/settings/branches` | yes | `repo` splits on `/` into exactly two segments: owner matches `/^[A-Za-z0-9-]+$/` (GitHub owner charset — no dots), repo-name matches `/^[A-Za-z0-9_.-]+$/` AND is not `.` or `..` (dot segments URL-normalize away from the intended path), AND the whole value is not the producer's missing-env placeholder literal `"owner/repo"` (`scripts/verify-branch-protection.ts:49-50` defaults `GITHUB_REPOSITORY` to it). Else null |
| 9 | `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` | `Open branch settings` | same as #8 | yes | same as #8 |

Context-field citations (verified at HEAD 9fe749a7):

- #1 target anchor: `<section … id="share-access">` at `app/admin/show/[slug]/page.tsx:750`; precedent fragment link at `:616`. `SHOW_FIRST_PUBLISHED` and `ROLE_FLAGS_NOTICE` are `severity: "info"` (`lib/messages/catalog.ts:950, :749`) and therefore excluded from AlertBanner's SELECT (`components/admin/AlertBanner.tsx:119-125` via `INFO_SEVERITY_CODES`) — they render only in `PerShowAlertSection`, where `slug` is a required prop (`components/admin/PerShowAlertSection.tsx:49-54`).
- #2 `lib/auth/picker/resetPickerEpoch.ts:31-36` (context: `show_id`, `new_epoch`, `admin_email_hash`) — no context field consumed; href needs only `slug`.
- #3 `lib/auth/picker/cleanupStaleEntry.ts:110-115` — same, no context field consumed.
- #4 two-hop raise: the notice object is constructed in `lib/sync/phase2.ts:422-431` (`context: { drive_file_id: args.driveFileId, changes: roleFlagChanges }`) and persisted by `upsertAdminAlert(result.roleFlagsNotice)` at **two** write boundaries — the cron path `lib/sync/runScheduledCronSync.ts:1982` (inside `emitDeferredRoleFlagsNotice`, `:1976-1983`, invoked at `:2393`) and the staged-apply path `lib/sync/applyStaged.ts:1898-1901`. The constructor is where `drive_file_id` enters the context; the meta-test pins the constructor and both write boundaries (§6.1).
- #5 `lib/sync/runOnboardingScan.ts:834-842`: `context: { drive_file_id, file_name, folder_id, wizard_session_id, sqlstate, kind }`, raised with `showId: null` (global). `driveFolderUrl` at `lib/drive/driveFolderUrl.ts` already null-guards and `encodeURIComponent`s.
- #6 raise sites: `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts:543-552`, `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route.ts:158-167`, `…/staged/[wizardSessionId]/[driveFileId]/apply/route.ts:217-231`, and `app/api/admin/onboarding/manifest/[wizardSessionId]/[driveFileId]/ignore/route.ts:253-264`, all `showId: null`. Catalog copy tells the operator to "continue in the active wizard tab" (`lib/messages/catalog.ts:170-171`); the wizard lives at `/admin/onboarding`.
- #7 `lib/reports/submit.ts:984-1005`: context jsonb includes `orphan_url: newIssue.htmlUrl` and `orphan_issue_number: newIssue.issueNumber`. **Scope is data-dependent**: the INSERT uses `row?.show_id ?? fallbackShowId` (`lib/reports/submit.ts:992-994`), so the row is show-scoped whenever a report row or fallback show exists and global only when neither does. Both surfaces are covered by design: a global instance renders its "Open GitHub issue" link in the banner (§7.2); a show-scoped instance renders it in `PerShowAlertSection` (§7.1 calls `resolveAlertAction` for every per-show row — the banner's "Check it" click-through lands the operator on the row with the link). The rendering split (decision #3) therefore does not strand any of the 9 codes.
- #8/#9 `scripts/verify-branch-protection.ts`: `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` has **three** producer branches — missing owner/repo/token (`:256-268`), legacy-endpoint 401/403 (`:276-288`), rulesets 401/403 (`:299-311`) — and `BRANCH_PROTECTION_DRIFT` one (`:322-330`). All four contexts include `repo` (`owner/name` string from `repoFromEnv`); all raised with `p_show_id: null`. A malformed env value (empty, missing the `/`, wrong charset, or a dot-segment like `owner/..` that would URL-normalize away from the intended path) fails the builder's segment guard → no link, per §4 #8 and §7.3.

## 5. Coverage: every other code is N/A

- **All `class: "auto"` codes** (21, per the `ADMIN_ALERTS_LIFECYCLE` registry at `tests/messages/_metaAdminAlertCatalog.test.ts:312-484` — that registry is the single source of truth for the list; this spec deliberately does not re-enumerate it): N/A. Auto-resolution (PR #283) removes the row when the condition clears; an action link on a self-healing alert adds nothing.
- **`AMBIGUOUS_EMAIL_BINDING`**: remedy is fixing the duplicate binding in the source sheet's crew grid (Google-side edit); context carries the canonicalized `email` plus `crew_member_ids` (`lib/auth/validateGoogleSession.ts:40-46`) — no `drive_file_id`, so no sheet to link, and a `mailto:` on the ambiguous address is not a remediation affordance.
- **`OAUTH_IDENTITY_CLAIMED`**: awareness notice; context `{ crew_member_id, show_id, claimed_at_millis, user_email_hash }` (`app/auth/callback/route.ts:133-142`) — internal ids and a hash, no destination.
- **`CALLBACK_CLAIM_THREW`**: forensic notice; context `{ error_name }` only (`app/auth/callback/route.ts:162-166`); remedy is log investigation.
- **`PICKER_BOOTSTRAP_RPC_FAILED`**: infra failure; context `{ attempted_email_hash, rpc_error_code, rpc_error_message, route }` (`app/api/auth/picker-bootstrap/route.ts:95-104`) — no destination.
- **`PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED`**: raised only when the `resolve_show_by_slug_and_token` RPC returns an error or throws (`app/api/auth/picker-bootstrap/route.ts:163-174`) — an infra failure, not a bad slug (the no-match path returns `PICKER_INVALID_SHARE_TOKEN` without raising this alert, `:176`). Context carries `slug` (`:75-80`), but the remedy is log/infra investigation; at raise time the resolve itself failed, so whether `/admin/show/<slug>` is a live destination is unknown. No link.
- **`REPORT_LOOKUP_INCONCLUSIVE` / `REPORT_DUPLICATE_LIVE_MATCHES` / `REPORT_OPEN_ORPHAN_LABEL`**: base context is `{ idempotency_key, reason, code }` (`lib/reports/submit.ts:772-776`); the state-gated helper can persist the same codes with `raced_back: true` (`:742-745`) or `raced_back_twice: true` (`:754-760`) spread on top — booleans, still nothing linkable. (When a `github_issue_url` exists, the code path returns success instead of raising: `:801-803`.)
- **`REPORT_LEASE_THRASHING`**: context `{ idempotency_key, depth }` (`lib/reports/submit.ts:851-854`), same `raced_back`/`raced_back_twice` supersets via the state-gated helper — no URL.
- **`STALE_ORPHAN_REPORT`**: reaper-side notice; context `{ report_id, idempotency_key, created_at, lease_holder }` (`app/api/cron/report-reaper/route.ts:72-88`). The row is reaped precisely because `github_issue_url IS NULL` (DELETE predicate at `:58-64`) — a linkable target cannot exist.
- **`TILE_SERVER_RENDER_FAILED`** (state-manual): remedy is tile-server ops; producers write `tileId` and render-failure fields with no URL form (`components/shared/TileServerFallback.tsx:86-96`, `components/crew/WrappedSection.tsx:95-102`). (Per-tile keying rework tracked as BL-ALERT-TILE-RENDER-PER-TILE-KEYING.)
- **`GITHUB_BOT_LOGIN_MISSING`** (deferred): raised with context `{ idempotency_key, reason, code }` (`lib/reports/submit.ts:772-780`); remedy is setting a Vercel env var — no stable URL (org-specific dashboard).

Count check: 9 entries + 12 manual/deferred N/A = the 21 non-auto codes; 21 auto codes N/A by class; 42 total, matching `ADMIN_ALERTS_CODES` (`tests/messages/_metaAdminAlertCatalog.test.ts:57-100`).

## 6. Structural meta-test

`tests/messages/_metaAlertActionsContract.test.ts`, mirroring the parallel-registry pattern of `_metaAdminAlertCatalog.test.ts` (`test.each` + on-disk pattern assertions):

1. **Raise-site fidelity (context fields AND scope).** A test-local table maps each registry code that consumes context fields — plus the three slug-dependent codes, whose pinned property is show-scoping rather than a field — to `{ file, pattern }`, where `pattern` is a **single bounded regex that anchors the code literal and the consumed field name(s) in one match** — the same `{ file, pattern }` row shape as `ADMIN_ALERTS_LIFECYCLE.resolveSites`. A bare "field name appears somewhere in the file" check is tautology-prone: `runOnboardingScan.ts` has a sibling `logSync` payload carrying `drive_file_id` a few lines above the alert raise (`lib/sync/runOnboardingScan.ts:824-829`), so a whole-file match would keep passing after the field is dropped from the alert context. Rows (exact regexes are plan-level detail; each MUST tie the field to that code's own raise expression, e.g. `/code:\s*"?LIVE_ROW_CONFLICT"?[\s\S]{0,300}?context:\s*\{[\s\S]{0,200}?drive_file_id:[\s\S]{0,200}?folder_id:/`):
   - #4 → **three rows** for the two-hop raise: `lib/sync/phase2.ts`, code literal then `context: { drive_file_id:` (constructor at `:422-431`); AND `lib/sync/runScheduledCronSync.ts` (`:1976-1982`) AND `lib/sync/applyStaged.ts` (`:1898-1901`), each with a pattern anchoring `upsertAdminAlert(` applied to `roleFlagsNotice` — the first pins where the field enters the context, the other two pin that the constructed object still reaches BOTH live persist calls (cron and staged-apply).
   - #5 → `lib/sync/runOnboardingScan.ts`, code literal then context block containing `drive_file_id:` and `folder_id:` (raise at `:834-842`).
   - #7 → `lib/reports/submit.ts`, `'REPORT_ORPHANED_LOST_LEASE'` SQL literal then `orphan_url:` within the bounded span (raise at `:984-1005`).
   - #8/#9 → `scripts/verify-branch-protection.ts` — here the `context` consts precede the `p_code:` literals, so these patterns anchor context-then-code (`repo` field followed within a bounded span by the `p_code` literal). `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` has three producer branches (`:256-268`, `:276-288`, `:299-311`); the meta-test asserts the anchored pattern matches **three times** for that code (a `matchAll` count, not a boolean), so dropping `repo` from any one branch fails even while the other two still match. `BRANCH_PROTECTION_DRIFT` (`:322-330`) asserts one match.
   - #1/#2/#3 → **show-scoping pins** for the slug-dependent codes (they consume no context field, but their links render only because the rows are show-scoped — a producer refactor to `showId: null` would silently kill the link since a global row has no slug): `lib/sync/runScheduledCronSync.ts` pattern anchoring `showId: args.result.showId` then `code: "SHOW_FIRST_PUBLISHED"` (`:2017-2019`); `lib/auth/picker/resetPickerEpoch.ts` anchoring `showId: input.showId` then `code: "PICKER_EPOCH_RESET"` (`:29-31`); `lib/auth/picker/cleanupStaleEntry.ts` anchoring `showId: input.showId` then `code: "PICKER_SELECTION_RACE"` (`:108-110`). Concrete failure mode: a scope regression at any of these three raise sites makes `resolveAlertAction` return null in production while fixture-slug unit tests stay green.
   Concrete failure mode caught: a raise-site refactor renames or drops `drive_file_id` from the alert context (even while a sibling log payload keeps the name) and the action link silently stops rendering forever.
2. **Target fidelity.** Asserts `id="share-access"` exists in `app/admin/show/[slug]/page.tsx` (codes #1–#3's anchor) and `app/admin/onboarding/page.tsx` exists on disk (code #6's route). Concrete failure mode: anchor rename or route move turns three action links into scroll-to-nowhere.
3. **Registry↔spec parity + universe membership.** Asserts `Object.keys(ALERT_ACTIONS).sort()` equals exactly the 9 codes in §4, AND that every key is a member of the 42-code `ADMIN_ALERTS_CODES` universe — parsed from the `tests/messages/_metaAdminAlertCatalog.test.ts` source the way that file's own tests parse `upsertAdminAlert.ts` (do NOT `import` the sibling test module; importing a file whose top level calls `test()` would re-register its tests). Concrete failure modes: a later PR adds an entry without spec/meta-test review, drops one silently, or registers a typo'd code that no raise site ever produces.

Guard behavior (null context, `{}`, wrong-typed fields, malformed `orphan_url`/`repo`) is unit-tested in `tests/adminAlerts/alertActions.test.ts` (§8), not in the meta-test.

## 7. Rendering

### 7.1 `PerShowAlertSection` (per-show rows)

- Call `resolveAlertAction(alert.code, alert.context, { slug })` per row (`slug` prop, `components/admin/PerShowAlertSection.tsx:49-54`).
- When non-null, render the link **directly after `HelpAffordance`** (`:248-251`), before the `failedKeys`/`dataGapsDigest` sub-lines, as:

```tsx
<a
  href={action.href}
  data-testid={`per-show-alert-action-${alert.id}`}
  {...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
  className="self-start text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
>
  {action.label}
  {action.external ? <span aria-hidden="true"> ↗</span> : null}
</a>
```

Class list copies the established quiet-link affordance at `components/admin/PerShowActionableWarnings.tsx:98` minus its local `linkOffsetClass`. The row is a `flex flex-col gap-2` `<li>` (`PerShowAlertSection.tsx:231-238`); `self-start` keeps the hit target text-width. No fixed-dimension parent → no dimensional-invariants section needed. Rows are static server-rendered content; the link is present or absent per row at render time → no transition inventory (matches the existing "instant, no animation" posture of the data-gaps sub-line, `PerShowAlertSection.tsx:261-263` comment).

- Internal links here are standard anchor navigations. From a bare `/admin/show/<slug>` URL the href is a same-document fragment scroll. From the banner click-through entry (`/admin/show/<slug>?alert_id=…`, `components/admin/AlertBanner.tsx:459-461`) the href drops the query string, so the browser performs a normal navigation and then scrolls to the fragment on load — the `?alert_id` highlight ring is cleared by that navigation, which is acceptable: the operator has left the alert row for the remediation control, and the browser Back button restores the highlighted state.

### 7.2 `AlertBanner` (global rows only)

- Compute `resolveAlertAction(alert.code, alert.context, { slug: showSlug })` (row fields at `components/admin/AlertBanner.tsx:46-59`; `context` is in the SELECT at `:117`).
- Render **only when `!isPerShowAlert && !isWatchAlert`** and the action is non-null, inside the existing action slot `div[data-testid="admin-alert-action"]` (`:454`), as a sibling **before** the Mark-resolved `<form>` (`:481-484`). The slot is `flex flex-wrap justify-end gap-2`; the slot-integrity rule (nothing splits `ResolveAlertButton` from its form or drops the hidden id input — comment at `:475-480`) is untouched by a preceding sibling; `tests/components/admin/_metaAlertBannerContract.test.ts` must stay green.
- Markup matches "Check it"'s bordered style (`:459-465`) with `data-testid="admin-alert-action-link"`, plus the external `target`/`rel`/`↗` treatment from §7.1 when `action.external`.
- Per-show rows: unchanged ("Check it" only). Watch rows: unchanged (Retry form). Degraded and empty banner states: unchanged.

### 7.3 Guard-condition table (spec self-review requirement)

| Input | null/absent | empty string | wrong type | malformed |
|---|---|---|---|---|
| `alert.context` | builders needing context → null → no link | n/a | row types force `Record<string,unknown> \| null` | n/a |
| `context.drive_file_id`/`folder_id` | null → (for #5) try fallback, else no link | `str` → null | `str` → null | bogus id yields a well-formed but 404 Google URL — accepted, same posture as `PerShowActionableWarnings` |
| `context.orphan_url` | no link | no link | no link | non-`https://github.com/` prefix → no link |
| `context.repo` | no link | no link | no link | segment-guard fail (§4 #8: wrong segment count, bad charset, `.`/`..` repo-name, or the `"owner/repo"` placeholder) → no link |
| `opts.slug` | internal-target builders → null (banner passes `showSlug ?? null`; per-show section always has slug) | `str`-style trim check → null | typed `string \| null` | `encodeURIComponent` at use |
| `alert.code` | unknown/unregistered → null | — | typed `string` | — |

## 8. Tests (all TDD, per task)

1. **`tests/adminAlerts/alertActions.test.ts`** — unit tests per builder: happy path (expected href derived from fixture field values, never hardcoded independently of the fixture), each guard row of §7.3 → null, unregistered code → null. Failure modes caught: URL template regression; guard bypass rendering `javascript:` or non-GitHub `orphan_url`; dot-segment `repo` values (`owner/..`, `owner/.`, `./repo`) producing a normalized-away GitHub path, and the placeholder literal `"owner/repo"` producing a syntactically valid but wrong target — each of those four literals must be an explicit null-case fixture.
2. **`tests/messages/_metaAlertActionsContract.test.ts`** — §6.
3. **`tests/components/admin/perShowAlertActionLink.test.tsx`** — jsdom + thenable-mock harness copied from `perShowAlertDataGaps.test.tsx` (mock shape at its `:14-37`). Cases: (a) `ROLE_FLAGS_NOTICE` row with `context.drive_file_id` renders the anchor with fixture-derived href, `target="_blank"`, `rel="noopener noreferrer"`; (b) same code without the field renders no `per-show-alert-action-*` node; (c) `SHOW_FIRST_PUBLISHED` renders the fragment href built from the fixture slug, no `target`; (d) show-scoped `REPORT_ORPHANED_LOST_LEASE` row with a fixture `https://github.com/...` `orphan_url` renders the "Open GitHub issue" anchor with that exact href (the §4 #7 show-scoped branch), and the same row with `orphan_url: "javascript:alert(1)"` renders **no** action anchor. Anti-tautology: assertions query **within** the row's `per-show-alert-<id>` testid subtree, and expected hrefs are computed from the fixture's `drive_file_id`/slug/`orphan_url` values.
4. **`tests/components/admin/alertBannerActionLink.test.tsx`** — harness per `alertBannerDetailFailVisible.test.tsx`. Cases: (a) global `LIVE_ROW_CONFLICT` row with only `folder_id` renders `admin-alert-action-link` with the Drive-folder href (fallback path proven); (b) per-show non-info row with a registered code renders "Check it" and **no** `admin-alert-action-link` (rendering-split rule); (c) global row with an unregistered code renders no link; (d) global `REPORT_ORPHANED_LOST_LEASE` row with a valid fixture `orphan_url` renders the link with that exact href, and with `orphan_url: "javascript:alert(1)"` (or an `http://github.com/` downgrade) renders **no** `admin-alert-action-link` anchor anywhere in the banner. Failure modes: fallback regression; split-rule regression (double navigation affordances); a component path that bypasses `resolveAlertAction` and renders `context.orphan_url` verbatim into `href` — case (d) fails against the rendered DOM even if the builder unit tests pass.
5. Existing suites that must stay green and are run in the affected-suite set: `tests/components/admin/_metaAlertBannerContract.test.ts`, `perShowAlertDataGaps/FailedKeys/Interpolation`, `tests/messages/` (the M8 namespace scanner — note the meta-test file lives in `tests/messages/`, so run the whole directory).

## 9. Out of scope

- A full alert-queue list page (`/admin#alerts` remains the single-newest banner + count chip).
- Action links for per-show rows inside the banner (decision #3).
- Deep-linking to controls finer than the `#share-access` section (no per-control anchors added).
- Context enrichment at any raise site (nothing needs it — decision #2).
- Auto-code action links.
- New §12.4 codes, catalog rows, or copy edits (labels are static UI chrome like "Check it", not code-driven copy — invariant 5 concerns catalog codes, none are added or rendered raw).

## 10. Watchpoints (do-not-relitigate preempts)

- **Labels are not §12.4 copy.** "Check it" (`components/admin/AlertBanner.tsx:464`) and "Open in Sheet" (`components/admin/PerShowActionableWarnings.tsx:100`) are the shipped precedents for static action-affordance labels outside the catalog. Precedent stands; do not demand catalog rows for the 7 labels.
- **`https://github.com/` prefix check on `orphan_url` is deliberate belt-and-suspenders**, not distrust of our own writers: context is `Record<string, unknown>` JSON written by service-role code, and the cheap allow-list makes "unvalidated string into href" structurally impossible. Same spirit as the §7.3 guards.
- **Banner shows one alert.** The `limit(1)` + queue-chip design is shipped M9-C4/M5-D3 behavior (`AlertBanner.tsx:126, :190-199`); this feature does not change it.
- **No impeccable-scope creep.** The visual delta is one quiet link per row in two existing components; invariant-8 critique+audit run on the diff at close-out.
- **`scripts/verify-branch-protection.ts` is not a UI file** and is not modified; it is cited only as the raise site for #8/#9 context fields.
