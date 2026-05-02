# FXAV Crew Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js + Supabase web app that turns Doug Larson's per-show Google Sheets into per-crew-member, mobile-first webpages, with sub-second sync via Drive push notifications, role-based field hiding, signed-link sharing, and a full admin/onboarding/bug-report surface — implementing the spec at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md`.

**Architecture:** Next.js 16 App Router on Vercel; Supabase Postgres for data, Auth for crew login, Realtime for push-to-viewer; Drive `files.watch` push + 5-min cron reconciliation; two-phase sync (parse + invariant check, then destructive snapshot replacement under per-show advisory lock); JWT-bearing signed links exchanged for HTTP-only session cookies; LEAD-only fields physically isolated in `shows_internal` with three layers of defense; diagram images snapshotted into Supabase Storage at every Apply with revision-versioned URLs; bug reports go to GitHub Issues via reserve-then-call idempotency.

**Tech Stack:**

- Next.js 16 (App Router, Server Components, Server Actions) on Vercel
- Supabase (Postgres + Auth + Realtime + Storage)
- Tailwind v4 + tokens established by the impeccable v3 design-context flow (`PRODUCT.md` strategic + `DESIGN.md` visual)
- `googleapis` Node SDK with service-account JWT
- `@octokit/rest` for GitHub Issues
- Vitest (parser, unit) + Playwright (e2e + dimensional invariants)
- Sentry, Vercel Analytics

---

## How to use this plan

1. **Spec is canonical, with two ratified amendments documented below.** Every task references a spec section like `§5.2` or an acceptance criterion like `AC-6.13`. When a task and the spec disagree on anything OTHER than the amendments below, the spec wins — open a question, do not silently fix it in the plan.

   **Ratified plan amendments to spec:**
   1. **§13.2.3 recovery lookup** — the spec specifies eventually-consistent code search via `octokit.rest.search.issuesAndPullRequests({q: '"<idempotency_key>" repo:<repo> in:body'})`. Adversarial-review rounds 6 + 10 demonstrated this is unsafe: GitHub's code-search index can lag tens of seconds, producing false-negative misses that drive `createIssue` and open duplicate issues. **The plan's Tasks 8.3d/8.3e supersede §13.2.3 on this single mechanism.** Revised contract:
      - Recovery uses `octokit.rest.issues.listForRepo({creator: GITHUB_BOT_LOGIN, since: <T-24h>, state: 'all'})` — the list endpoint is immediately consistent with create writes (unlike code search).
      - Body marker `<!-- fxav-report-id: <key> -->` is retained as the per-issue identifier; the plan scans page bodies for the marker client-side.
      - `since` filters by **last-updated** time, not create-time, so the plan additionally filters returned issues by `issue.created_at >= <T-24h>` client-side to enforce the 24h create-time horizon.
      - `LookupInconclusive` (pagination errors / config-missing / unexpected shapes) returns 502 to the client and never authorizes `createIssue`.
   2. **Spec §13.2.3 retention horizon and reaper predicate** — the spec at §13.2.3 specifies the daily reaper deletes rows where `github_issue_url IS NULL AND processing_lease_until < now - interval '24 hours'` (a lease-time predicate). Round 12 surfaced that this misaligns with the `expiredLeaseRetry` row-age horizon (a retry refreshing the lease 23 hours into life would push lease past 24h before reaper sees it). The plan ratifies a 24-hour `reports.created_at` horizon, BUT **the retry path and reaper path use slightly different combined predicates** to fence the boundary safely:
      - **`expiredLeaseRetry`**: rejects rows whose `created_at < now - interval '24 hours'` (returns 410 `REPORT_HORIZON_EXPIRED`, does NOT call `createIssue`). Lease-claim UPDATE additionally requires `created_at >= now - interval '24 hours'` to fence the boundary at the serialized step.
      - **8.3f reaper**: deletes rows where `github_issue_url IS NULL AND created_at < now - interval '24 hours' AND processing_lease_until < now`. The third clause prevents the reaper from removing a row a retry actively holds — race fix. **A row whose `created_at` is past 24h but whose lease is still live is preserved by the reaper**; it becomes reapable only after the lease expires (or is naturally released by a tail UPDATE). With this combined predicate the reaper and the retry path can never both attempt to act on the same row, eliminating the boundary race.
        Aligning both gates on `reports.created_at` plus the lease-expired check on the reaper side eliminates the contradiction, the lease-vs-creation-time mismatch, AND the in-flight-retry race.

   3. **`lease_holder` ownership protocol** — the spec's §13.2.3 shows a bare `UPDATE reports SET github_issue_url = $url WHERE id = $reportId` tail update. Round 8 demonstrated this allows duplicate GitHub issues when a slow original worker completes its `createIssue` after a retry has reclaimed the lease. The plan ratifies an additional `lease_holder uuid` column on `reports`, stamped at reservation, rotated on every lease re-acquisition, and required (`AND lease_holder = $myToken`) on every URL-writing tail UPDATE. A 0-row tail UPDATE triggers orphan cleanup (close GH issue with state_reason `not_planned`, add `fxav-orphan-lost-lease` label, INSERT `admin_alerts` `REPORT_ORPHANED_LOST_LEASE`). If the row has been reaped, the re-SELECT returns null and the route returns 410 `REPORT_HORIZON_EXPIRED`.

   **All three amendments are PATCHED INTO THE SPEC FILE** (rounds 24–40 of the convergence loop): `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` §13.2.3 was rewritten with the listForRepo+findIssueByMarker recovery contract, the `created_at`+lease-expired reaper predicate, the lease_holder ownership protocol with case A/B/C/Reaped 0-row tail disambiguation, and the orphan-cleanup atomic single-call. §4.1 reports-table schema declares `lease_holder uuid`, `idempotency_key`, and `processing_lease_until` inline. §14.3 env-var table includes `GITHUB_BOT_LOGIN`. The `LookupInconclusive` discriminator codes (`BOT_LOGIN_MISSING`, `PAGINATION_ERROR`, `PAGINATION_BOUND`, `SHAPE_ERROR`, `DUPLICATE_LIVE_MATCHES`, `OPEN_ISSUE_WITH_ORPHAN_LABEL`) and their per-show vs global admin_alerts mappings are documented in §13.2.3. The reserved-label provenance (`fxav-app:report`) is documented as the recovery scan filter. Task 8.3g is now a **verification-only task**: an implementer runs `scripts/verify-spec-amendment-3.sh` (authored inline in the task) to assert the patched spec satisfies every invariant before M8 begins. 4. **Spec §6.4 — drop v3 from the version registry.** The spec at §6.4 lines 1361–1367 declares v3's marker as `block:GEAR INVENTORY`, but no fixture in `fixtures/shows/raw/*.md` contains "GEAR INVENTORY" (verified via `grep -i "gear inventory" fixtures/shows/raw/*.md`). M1 Task 1.3 surfaced this during version-detection implementation. Investigation showed every non-v4 fixture contains the v2 marker (`Hotel Contact Info` or its typo `Hotal Contact Info`); v3 has no corpus representation and no structural distinction from v2 beyond per-fixture table-format quirks. **The plan's parser implementation (Task 1.3 onward) treats versions as `'v1' | 'v2' | 'v4'` — v3 is removed from the type union, the version registry, and all detection logic.** v1 remains as the fallback for any sheet that matches neither v2 nor v4 markers. If a real v3 sheet surfaces later, it can be re-introduced cleanly per spec §6.4's "Adding `v5` = adding one entry" design — but until then, encoding a phantom version pollutes the type system and creates untestable code paths.

2. **TDD is mandatory.** Every task starts with a failing test, then the minimal implementation, then a passing test, then a commit. Skipping the failing-test step means the test isn't actually covering what it claims.
3. **Commit per task.** Commit messages take the form `feat(<area>): <one-line summary>` or `test(<area>): ...` — area names are `parser`, `db`, `sync`, `auth`, `crew-page`, `admin`, `report`, `onboarding`, `assets`, `infra`.
4. **Per-show advisory lock is non-negotiable.** Every code path that mutates `shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, or `pending_ingestions` runs inside `pg_try_advisory_xact_lock(hashtext('show:' || drive_file_id))` (cron path) or `pg_advisory_xact_lock(...)` (admin/blocking path). Tests assert the lock is held.
5. **Email canonicalization at every boundary.** `lib/email/canonicalize.ts` is the only function that should touch raw emails before they enter the system. The schema-level CHECK is the safety net, not the primary mechanism.
6. **No global cursor.** Per spec §3.2 / §5.2 / AC-X.4, no source file references `lastPollAt`. Each show is tracked via `shows.last_seen_modified_time`.
7. **No raw error codes in user-visible UI.** §12.4 is the catalog. The UI reads codes through `lib/messages/lookup.ts` which returns the appropriate copy.

---

## File structure

The plan creates files in roughly the order below. This list is the source of truth for "where does X live" — when in doubt, the spec section in parens is canonical.

```
app/
  layout.tsx
  page.tsx # marketing landing
  auth/sign-in/page.tsx # Supabase Google OAuth (§7.1)
  me/page.tsx # signed-in user's show list
  show/[slug]/page.tsx # crew page, signed-in (§7.3, §8)
  show/[slug]/p/page.tsx # crew page, signed-link bootstrap (§7.2)
  admin/page.tsx # dashboard (§9.1, §9.0)
  admin/dev/page.tsx # M3-only fixture-upload tester (§15 M3)
  admin/show/[slug]/page.tsx # per-show parse panel (§9.2)
  admin/show/[slug]/preview/[crewId]/page.tsx # impersonation (§9.3)
  api/auth/redeem-link/route.ts # JWT → cookie exchange (§7.2)
  api/cron/sync/route.ts # 5-min cron (§5.1)
  api/cron/keepalive/route.ts # daily Supabase ping (§5.1)
  api/cron/refresh-watch/route.ts # hourly watch renewal (§5.5.1)
  api/cron/gc-watch/route.ts # hourly GC (§5.5.6)
  api/cron/diagram-gc/route.ts # hourly diagram blob GC (§6.11)
  api/cron/asset-recovery/route.ts # snapshot recovery (§5.2)
  api/drive/webhook/route.ts # Drive push handler (§5.5.2)
  api/asset/diagram/[show]/[rev]/[key]/route.ts # diagram bytes (§7.3)
  api/asset/reel/[show]/route.ts # opening reel (§7.3)
  api/report/route.ts # bug report endpoint (§13.2.3)
  api/admin/sync/[slug]/route.ts # manual re-sync action (§5.2)
  api/admin/onboarding/scan/route.ts # wizard step-2 scan (§9.0)
  api/admin/onboarding/finalize/route.ts # wizard exit promotion (§4.5)
  api/admin/staged/[fileId]/apply/route.ts # Apply staged parse (§6.8.1)
  api/admin/staged/[fileId]/discard/route.ts # Discard variants (§6.8.1)
  api/admin/snapshot-rollback/[id]/repair/route.ts # : stuck-rollback admin repair (§6.11 / Task 7.8)

components/
  layout/{Header,Footer}.tsx
  right-now/RightNowCard.tsx # state machine (§8.2)
  tiles/
    LodgingTile.tsx VenueTile.tsx ScheduleTile.tsx
    AudioScopeTile.tsx VideoScopeTile.tsx LightingScopeTile.tsx
    CrewTile.tsx ContactsTile.tsx TransportTile.tsx
    ShowStatusTile.tsx FinancialsTile.tsx PackListTile.tsx NotesTile.tsx
  shared/{KeyValue,Section,EmptyState,ContextBadge,StaleFooter}.tsx
  admin/
    ShowsList.tsx ParsePanel.tsx StagedReviewCard.tsx ReportButton.tsx
    OnboardingWizard.tsx PendingPanel.tsx AlertBanner.tsx

lib/
  parser/
    index.ts # parseSheet(markdown): ParseResult
    types.ts # ParseResult, ParseWarning, etc.
    schema.ts # version detection (§6.4)
    aliases.ts # field-alias config (§6.4)
    versions/v1.ts v2.ts v3.ts v4.ts # per-version field maps
    blocks/{client,venue,dates,crew,hotels,rooms,transport,contacts,event,ops}.ts
    pull-sheet.ts # §6.10
    diagrams.ts # §6.11 (uses Sheets API)
    opening-reel.ts # §6.11.1 substring extractor
    personalization.ts # §6.6 day/stage/role flags
    invariants.ts # §6.8 MI-1..MI-14
    slug.ts # §6.9
  email/canonicalize.ts # §4.1.1
  drive/
    client.ts # service-account auth
    list.ts # files.list paginated
    fetch.ts # files.export / files.get
    watch.ts # files.watch / channels.stop
  sync/
    runScheduledCronSync.ts # §5.2 entry
    runOnboardingScan.ts # §5.2 onboarding entry
    runManualSyncForShow.ts # §5.2 manual entry
    runPushSyncForShow.ts # §5.5 push entry
    perFileProcessor.ts # the shared per-file path
    phase1.ts # parse + invariant gate
    phase2.ts # destructive transaction
    snapshotAssets.ts # §6.11 download → Storage
    assetRecovery.ts # §5.2 asset_recovery mode
  auth/
    jwt.ts # signed-link sign/verify
    validateLinkSession.ts # §7.2.2 12-step validator
    validateGoogleSession.ts # §7.2.2 Google validator (show-bound)
    validateGoogleIdentity.ts # §7.2.2 cross-show identity-only validator
    requireAdmin.ts
    isAdminSession.ts # shared admin-precedence predicate (§4.3 / Task 5.7 / X.3)
    cookies.ts # shared __Host-fxav_session set/clear helper
    constants.ts # cookie names, TTLs
  supabase/
    server.ts # service-role + RLS clients
    client.ts # browser client
    realtime.ts
  github/
    issues.ts # @octokit/rest wrapper
  data/
    getShowForViewer.ts # role-aware fetcher (§7.4)
    listShowsForCrew.ts
  messages/
    catalog.ts # §12.4 — every code → message
    lookup.ts
  reports/
    submit.ts # reserve-then-call (§13.2.3)
    rateLimit.ts
  time/
    rightNow.ts # state machine selector (§8.2)
    relative.ts # "12 min ago" formatting

supabase/
  migrations/
    20260501T0000_initial_schema.sql
    20260501T0100_rls_policies.sql
    .. # one migration per logical schema bump
  seed.ts # loads fixtures into local DB

fixtures/ # already exists, not modified
docs/superpowers/specs/.. # already exists, not modified
docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/ # this plan directory

tests/
  parser/ # vitest, one file per block
  invariants/ # MI-1..MI-14 cases
  sync/ # phase1, phase2, locks
  auth/ # validateLinkSession, validateGoogleSession
  reports/ # idempotency, lease, recovery
  e2e/ # playwright
    crew-page.spec.ts
    layout-dimensions.spec.ts # AC-4.4, see Task 4.13
    transition-audit.spec.ts # Right Now state transitions
    auth-flows.spec.ts
    onboarding.spec.ts
    cross-cutting.spec.ts # AC-X.1..X.6

.env.local.example
package.json pnpm-lock.yaml tsconfig.json
.eslintrc.json .prettierrc
playwright.config.ts vitest.config.ts
next.config.mjs tailwind.config.ts postcss.config.mjs
```

---
