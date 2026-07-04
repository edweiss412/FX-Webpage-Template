# Per-code action links in admin alert rows

**Status:** Draft (autonomous-ship pipeline, user review waived 2026-07-04)
**Scope:** UI + one new lib registry + structural meta-test. No DB change, no migration, no §12.4 catalog change, no new admin-alert codes.

## 1. Problem

Admin alert rows explain what happened (catalog `dougFacing` copy) and where to learn more (`HelpAffordance` help link), but never link to the place where the operator acts. Per-show alerts get a generic "Check it" → show page (`components/admin/AlertBanner.tsx:459-465`); global alerts get nothing but an inline Mark-resolved button (`components/admin/AlertBanner.tsx:481-484`). Concretely: `LIVE_ROW_CONFLICT` copy says "Resolve it from the dashboard" (`lib/messages/catalog.ts:1711-1712`) with nothing to click, and `REPORT_ORPHANED_LOST_LEASE` copy says "Click through to verify the issue closed" (`lib/messages/catalog.ts:2045-2046`) while the GitHub URL sits unused in the alert's `context.orphan_url` (`lib/reports/submit.ts:994-1003`).

## 2. Resolved decisions

1. **One registry module, `lib/adminAlerts/alertActions.ts`.** The registry is keyed by its own exact literal union, NOT by `AdminAlertCode`: three of the nine action codes (`REPORT_ORPHANED_LOST_LEASE`, `BRANCH_PROTECTION_DRIFT`, `BRANCH_PROTECTION_MONITOR_AUTH_FAILED`) are raw-SQL/script producers deliberately outside the `AdminAlertCode` union (`lib/adminAlerts/upsertAdminAlert.ts:3-36` ends at `WIZARD_SESSION_SUPERSEDED_RACE`; the exemption list `NON_UPSERT_ADMIN_ALERTS_PRODUCERS` at `tests/messages/_metaAdminAlertCatalog.test.ts:626-636` documents why). So: `ALERT_ACTION_CODES` const tuple of the 9 codes → `AlertActionCode` union → `Record<AlertActionCode, AlertActionBuilder>` (full `Record`, not `Partial` — a code added to the tuple without a builder fails typecheck). Runtime membership in the 42-code universe is pinned by the meta-test (§6.3).
2. **Exactly 9 codes get an action** (§4). Every other code is N/A with a stated reason (§5). No raise-site changes anywhere: `REPORT_ORPHANED_LOST_LEASE` already carries `orphan_url` + `orphan_issue_number` in context (`lib/reports/submit.ts:994-1003`), so the earlier idea of enriching that raise site is dead — the registry consumes what exists.
3. **Rendering split.** `PerShowAlertSection` renders the action link for its per-show rows. `AlertBanner` renders it **only for global rows** (`show_id === null`): per-show banner rows keep "Check it" as their single navigation (the action link appears after click-through, on the show page); adding both would duplicate navigation affordances in one slot.
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
- The module is plain shared code (no `"use client"`, no server-only imports) — `buildSheetDeepLink` already imports cleanly into both client and server components (`lib/sheet-links/buildSheetDeepLink.ts`, no directive; client importers include `components/admin/PerShowActionableWarnings.tsx:3`).

## 4. The 9 registry entries

| # | Code | Label | Href | External | Guards (all via `str`) |
|---|------|-------|------|----------|------------------------|
| 1 | `SHOW_FIRST_PUBLISHED` | `Go to Published toggle` | `/admin/show/${encodeURIComponent(slug)}#share-access` | no | `opts.slug` non-empty, else null |
| 2 | `PICKER_EPOCH_RESET` | `Go to Share & access` | same as #1 | no | same as #1 |
| 3 | `PICKER_SELECTION_RACE` | `Go to Share & access` | same as #1 | no | same as #1 |
| 4 | `ROLE_FLAGS_NOTICE` | `Open in Sheet` | `buildSheetDeepLink(drive_file_id)` | yes | `drive_file_id` string, else null (builder also null-guards: `lib/sheet-links/buildSheetDeepLink.ts`) |
| 5 | `LIVE_ROW_CONFLICT` | `Open in Sheet` / fallback `Open Drive folder` | `buildSheetDeepLink(drive_file_id)`; if `drive_file_id` absent, `driveFolderUrl(folder_id)` | yes | either field string; both absent → null |
| 6 | `WIZARD_SESSION_SUPERSEDED_RACE` | `Go to setup wizard` | `/admin/onboarding` | no | none (static route, `app/admin/onboarding/page.tsx` exists) |
| 7 | `REPORT_ORPHANED_LOST_LEASE` | `Open GitHub issue` | `context.orphan_url` verbatim | yes | string AND `startsWith("https://github.com/")`, else null (scheme allow-list — context is untyped JSON; never render an unvalidated string into `href`) |
| 8 | `BRANCH_PROTECTION_DRIFT` | `Open branch settings` | `https://github.com/${repo}/settings/branches` | yes | `repo` matches `/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/`, else null |
| 9 | `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` | `Open branch settings` | same as #8 | yes | same as #8 |

Context-field citations (verified at HEAD 9fe749a7):

- #1 target anchor: `<section … id="share-access">` at `app/admin/show/[slug]/page.tsx:750`; precedent fragment link at `:616`. `SHOW_FIRST_PUBLISHED` and `ROLE_FLAGS_NOTICE` are `severity: "info"` (`lib/messages/catalog.ts:952 region, :749`) and therefore excluded from AlertBanner's SELECT (`components/admin/AlertBanner.tsx:119-125` via `INFO_SEVERITY_CODES`) — they render only in `PerShowAlertSection`, where `slug` is a required prop (`components/admin/PerShowAlertSection.tsx:49-54`).
- #2 `lib/auth/picker/resetPickerEpoch.ts:31-36` (context: `show_id`, `new_epoch`, `admin_email_hash`) — no context field consumed; href needs only `slug`.
- #3 `lib/auth/picker/cleanupStaleEntry.ts:110-115` — same, no context field consumed.
- #4 `lib/sync/phase2.ts:426-430`: `context: { drive_file_id: args.driveFileId, changes: roleFlagChanges }`.
- #5 `lib/sync/runOnboardingScan.ts:834-842`: `context: { drive_file_id, file_name, folder_id, wizard_session_id, sqlstate, kind }`, raised with `showId: null` (global). `driveFolderUrl` at `lib/drive/driveFolderUrl.ts` already null-guards and `encodeURIComponent`s.
- #6 raise sites: `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts:543-552`, `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route.ts:158-167`, `…/staged/[wizardSessionId]/[driveFileId]/apply/route.ts:217-231`, and `app/api/admin/onboarding/manifest/[wizardSessionId]/[driveFileId]/ignore/route.ts:253-264`, all `showId: null`. Catalog copy tells the operator to "continue in the active wizard tab" (`lib/messages/catalog.ts:170-171`); the wizard lives at `/admin/onboarding`.
- #7 `lib/reports/submit.ts:984-1005`: context jsonb includes `orphan_url: newIssue.htmlUrl` and `orphan_issue_number: newIssue.issueNumber`. Global (`show_id` may be null).
- #8/#9 `scripts/verify-branch-protection.ts:300-330`: both contexts include `repo` (`owner/name` string), raised with `p_show_id: null`.

## 5. Coverage: every other code is N/A

- **All `class: "auto"` codes** (21, per the `ADMIN_ALERTS_LIFECYCLE` registry at `tests/messages/_metaAdminAlertCatalog.test.ts:312-484` — that registry is the single source of truth for the list; this spec deliberately does not re-enumerate it): N/A. Auto-resolution (PR #283) removes the row when the condition clears; an action link on a self-healing alert adds nothing.
- **`AMBIGUOUS_EMAIL_BINDING`**: remedy is fixing the duplicate binding in the source sheet's crew grid (Google-side edit); context carries the canonicalized `email` plus `crew_member_ids` (`lib/auth/validateGoogleSession.ts:40-46`) — no `drive_file_id`, so no sheet to link, and a `mailto:` on the ambiguous address is not a remediation affordance.
- **`OAUTH_IDENTITY_CLAIMED`**: awareness notice; no destination.
- **`CALLBACK_CLAIM_THREW`**: forensic notice; context is internal state; remedy is log investigation.
- **`PICKER_BOOTSTRAP_RPC_FAILED`**: infra failure; no destination.
- **`PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED`**: the failure IS that the slug didn't resolve to a show — linking to `/admin/show/<slug>` would deep-link a page that may not exist.
- **`REPORT_LOOKUP_INCONCLUSIVE` / `REPORT_DUPLICATE_LIVE_MATCHES` / `REPORT_OPEN_ORPHAN_LABEL`**: context is `{ idempotency_key, reason, code }` (`lib/reports/submit.ts:772-776`) — no URL. (When a `github_issue_url` exists, the code path returns success instead of raising: `:801-803`.)
- **`REPORT_LEASE_THRASHING`**: context `{ idempotency_key, depth }` (`lib/reports/submit.ts:851-854`) — no URL.
- **`STALE_ORPHAN_REPORT`**: reaper-side notice; context `{ report_id, idempotency_key, created_at, lease_holder }` (`app/api/cron/report-reaper/route.ts`, the INSERT after the DELETE). The row is reaped precisely because `github_issue_url IS NULL` (the DELETE predicate) — a linkable target cannot exist.
- **`TILE_SERVER_RENDER_FAILED`** (state-manual): remedy is tile-server ops; context `tileId` has no URL form. (Per-tile keying rework tracked as BL-ALERT-TILE-RENDER-PER-TILE-KEYING.)
- **`GITHUB_BOT_LOGIN_MISSING`** (deferred): remedy is setting a Vercel env var; no stable URL (org-specific dashboard).

Count check: 9 entries + 12 manual/deferred N/A = the 21 non-auto codes; 21 auto codes N/A by class; 42 total, matching `ADMIN_ALERTS_CODES` (`tests/messages/_metaAdminAlertCatalog.test.ts:57-100`).

## 6. Structural meta-test

`tests/messages/_metaAlertActionsContract.test.ts`, mirroring the parallel-registry pattern of `_metaAdminAlertCatalog.test.ts` (`test.each` + on-disk pattern assertions):

1. **Raise-site context fidelity.** A test-local table maps each registry code that consumes context fields to `{ file, pattern }`, where `pattern` is a **single bounded regex that anchors the code literal and the consumed field name(s) in one match** — the same `{ file, pattern }` row shape as `ADMIN_ALERTS_LIFECYCLE.resolveSites`. A bare "field name appears somewhere in the file" check is tautology-prone: `runOnboardingScan.ts` has a sibling `logSync` payload carrying `drive_file_id` a few lines above the alert raise (`lib/sync/runOnboardingScan.ts:824-829`), so a whole-file match would keep passing after the field is dropped from the alert context. Rows (exact regexes are plan-level detail; each MUST tie the field to that code's own raise expression, e.g. `/code:\s*"?LIVE_ROW_CONFLICT"?[\s\S]{0,300}?context:\s*\{[\s\S]{0,200}?drive_file_id:[\s\S]{0,200}?folder_id:/`):
   - #4 → `lib/sync/phase2.ts`, code literal then `context: { drive_file_id:` (raise at `:426-430`).
   - #5 → `lib/sync/runOnboardingScan.ts`, code literal then context block containing `drive_file_id:` and `folder_id:` (raise at `:834-842`).
   - #7 → `lib/reports/submit.ts`, `'REPORT_ORPHANED_LOST_LEASE'` SQL literal then `orphan_url:` within the bounded span (raise at `:984-1005`).
   - #8/#9 → `scripts/verify-branch-protection.ts` — here the `context` consts precede the `p_code:` literals (`:300-306` before `:309`; `:323` before `:326`), so these two patterns anchor context-then-code (`repo` field followed within a bounded span by the `p_code` literal).
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

- Internal links here are same-page fragment navigations (`/admin/show/<slug>#share-access` from `/admin/show/<slug>` is a same-document scroll — the path is identical, so the browser performs fragment navigation, no reload).

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
| `context.repo` | no link | no link | no link | regex fail → no link |
| `opts.slug` | internal-target builders → null (banner passes `showSlug ?? null`; per-show section always has slug) | `str`-style trim check → null | typed `string \| null` | `encodeURIComponent` at use |
| `alert.code` | unknown/unregistered → null | — | typed `string` | — |

## 8. Tests (all TDD, per task)

1. **`tests/adminAlerts/alertActions.test.ts`** — unit tests per builder: happy path (expected href derived from fixture field values, never hardcoded independently of the fixture), each guard row of §7.3 → null, unregistered code → null. Failure modes caught: URL template regression; guard bypass rendering `javascript:` or non-GitHub `orphan_url`.
2. **`tests/messages/_metaAlertActionsContract.test.ts`** — §6.
3. **`tests/components/admin/perShowAlertActionLink.test.tsx`** — jsdom + thenable-mock harness copied from `perShowAlertDataGaps.test.tsx` (mock shape at its `:14-37`). Cases: (a) `ROLE_FLAGS_NOTICE` row with `context.drive_file_id` renders the anchor with fixture-derived href, `target="_blank"`, `rel="noopener noreferrer"`; (b) same code without the field renders no `per-show-alert-action-*` node; (c) `SHOW_FIRST_PUBLISHED` renders the fragment href built from the fixture slug, no `target`. Anti-tautology: assertions query **within** the row's `per-show-alert-<id>` testid subtree, and expected hrefs are computed from the fixture's `drive_file_id`/slug values.
4. **`tests/components/admin/alertBannerActionLink.test.tsx`** — harness per `alertBannerDetailFailVisible.test.tsx`. Cases: (a) global `LIVE_ROW_CONFLICT` row with only `folder_id` renders `admin-alert-action-link` with the Drive-folder href (fallback path proven); (b) per-show non-info row with a registered code renders "Check it" and **no** `admin-alert-action-link` (rendering-split rule); (c) global row with an unregistered code renders no link. Failure modes: fallback regression; split-rule regression (double navigation affordances).
5. Existing suites that must stay green and are run in the affected-suite set: `tests/components/admin/_metaAlertBannerContract.test.ts`, `perShowAlertDataGaps/FailedKeys/Interpolation`, `tests/messages/` (the M8 namespace scanner — note the meta-test file lives in `tests/messages/`, so run the whole directory).

## 9. Out of scope

- A full alert-queue list page (`/admin#alerts` remains the single-newest banner + count chip).
- Action links for per-show rows inside the banner (decision #3).
- Deep-linking to controls finer than the `#share-access` section (no per-control anchors added).
- Context enrichment at any raise site (nothing needs it — decision #2).
- Auto-code action links.
- New §12.4 codes, catalog rows, or copy edits (labels are static UI chrome like "Check it", not code-driven copy — invariant 5 concerns catalog codes, none are added or rendered raw).

## 10. Watchpoints (do-not-relitigate preempts)

- **Labels are not §12.4 copy.** "Check it" (`AlertBanner.tsx:463`) and "Open in Sheet" (`PerShowActionableWarnings.tsx:100`) are the shipped precedents for static action-affordance labels outside the catalog. Precedent stands; do not demand catalog rows for the 7 labels.
- **`https://github.com/` prefix check on `orphan_url` is deliberate belt-and-suspenders**, not distrust of our own writers: context is `Record<string, unknown>` JSON written by service-role code, and the cheap allow-list makes "unvalidated string into href" structurally impossible. Same spirit as the §7.3 guards.
- **Banner shows one alert.** The `limit(1)` + queue-chip design is shipped M9-C4/M5-D3 behavior (`AlertBanner.tsx:126, :190-199`); this feature does not change it.
- **No impeccable-scope creep.** The visual delta is one quiet link per row in two existing components; invariant-8 critique+audit run on the diff at close-out.
- **`scripts/verify-branch-protection.ts` is not a UI file** and is not modified; it is cited only as the raise site for #8/#9 context fields.
