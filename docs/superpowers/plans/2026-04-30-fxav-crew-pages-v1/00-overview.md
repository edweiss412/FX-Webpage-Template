# FXAV Crew Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Sibling plan:** [M11 — User-Facing Docs](../2026-05-12-user-facing-docs/) builds the in-app `/help` wiki for Doug. M11 depends on M10 (already closed) and is **independent of X.\***; the two can run in parallel or sequentially. Shared file surface: only `lib/messages/catalog.ts` (X.1 catalog parity audit ↔ M11 Phase B catalog extension) — coordinate ordering. See [`../README.md`](../README.md) for the full plan catalog. Speculative post-v1 work lives in [`../BACKLOG.md`](../BACKLOG.md), not DEFERRED.

**Goal:** Build a Next.js + Supabase web app that turns Doug Larson's per-show Google Sheets into per-crew-member, mobile-first webpages, with sub-second sync via Drive push notifications, role-based field hiding, signed-link sharing, and a full admin/onboarding/bug-report surface — implementing the spec at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`.

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

1. **Spec is canonical, with eleven ratified plan amendments AND two ratified spec amendments documented below.** Every task references a spec section like `§5.2` or an acceptance criterion like `AC-6.13`. When a task and the spec disagree on anything OTHER than the amendments below, the spec wins — open a question, do not silently fix it in the plan.

   **Ratified spec amendments (in `docs/superpowers/specs/master-spec-patches/`):**
   - **§12.4 AGENDA_* crew-facing catalog rows** _(2026-05-12, ratified at SHA `ac905da` after R1–R4 cross-CLI review; integrated into spec body by Task 9.0.A1)_. Adds `AGENDA_GONE_FOR_CREW` (410/403) and `AGENDA_UNAUTHENTICATED` (401) crew-only display codes covering the `AgendaPdfViewer` proxy's error states. See `docs/superpowers/specs/master-spec-patches/2026-05-12-catalog-agenda-codes.md`. M7-D2 (`components/agenda/AgendaPdfViewer.tsx` routing to these codes) is the consumer; Task 9.M7-D2's TDD checklist owns the exhaustive status→code coverage.
   - **§14.3 admin allow-list mechanism: runtime-mutable** _(2026-05-14, ratified through M9 C9 cross-CLI review R1–R11; integrated into spec body — §14.3 `ADMIN_EMAILS` row retired with cross-reference, §6.x is_admin() helper updated)_. Retires the migration-hardcoded `array['dlarson@fxav.net','edweiss412@gmail.com']` literal inside `public.is_admin()` and the unused `ADMIN_EMAILS` env var. Replaces with a runtime-mutable `public.admin_emails` table + atomic SECURITY DEFINER RPCs (`upsert_admin_email_rpc` + `revoke_admin_email_rpc`) + `/admin/settings/admins` CRUD UI. JWT-role override arm (`app_metadata.role = 'admin'`) preserved verbatim. RLS posture: SELECT-only grant + `for select` policy for authenticated; mutations route exclusively through the RPCs which enforce `is_admin()` + advisory-locked atomicity + last-admin-lockout + email-shape validation. See `docs/superpowers/specs/master-spec-patches/2026-05-14-admin-allowlist-runtime-mutable.md` for the full authoritative shape including the R1/R6/R7 refinements.

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

   3. **`lease_holder` ownership protocol** _(patched into spec §13.2.3, §4.1, §14.3)_ — the
      spec's §13.2.3 shows a bare tail UPDATE without a `lease_holder` guard. Round 8
      demonstrated this allows duplicate GitHub issues when a slow original worker completes
      `createIssue` after a retry reclaimed the lease. The plan ratifies `lease_holder uuid` on
      `reports`, stamped at reservation, rotated on re-acquisition, required on every tail
      UPDATE. A 0-row tail triggers orphan cleanup; a reaped row returns 410. **PATCHED** into
      §13.2.3 (rounds 24–40): listForRepo+findIssueByMarker recovery, `created_at`+lease-expired
      reaper predicate, lease_holder case A/B/C disambiguation, orphan-cleanup atomic call.
      §4.1 schema includes `lease_holder uuid`, `idempotency_key`, `processing_lease_until`.
      §14.3 includes `GITHUB_BOT_LOGIN`. Task 8.3g is a **verification-only task** that runs
      `scripts/verify-spec-amendment-3.sh` before M8.
   4. **Spec §6.4 — drop v3 from the version registry** _(patched into spec §6.4; MI-1 updated
      to `{v1,v2,v4}`)_ — the spec at §6.4 lines 1361–1367 declares v3's marker as
      `block:GEAR INVENTORY`, but no corpus fixture contains "GEAR INVENTORY" (verified via
      `grep -i "gear inventory" fixtures/shows/raw/*.md`). Every non-v4 fixture has the v2
      marker ("Hotel Contact Info" / typo "Hotal Contact Info"); v3 has no corpus
      representation. **Parser (Task 1.3 onward) treats versions as `'v1' | 'v2' | 'v4'`.**
      v1 is the fallback for sheets with no v2/v4 markers. If a genuine v3 sheet surfaces, it
      can be re-introduced per §6.4's extensibility note.
   5. **Spec §6.4 — v4 single-marker simplification** _(patched into spec §6.4 v4 entry)_ —
      the spec declared v4's `requires` as `["row:Contact Office", "block:MAIN/SECONDARY"]`
      (AND-of-two). The literal string "MAIN/SECONDARY" appears in none of the 10 corpus
      fixtures (`grep -i "MAIN/SECONDARY" fixtures/shows/raw/*.md` returns zero hits). The
      pattern `MAIN | SECONDARY` (adjacent table columns) appears in only 2 of 4 v4 fixtures;
      the other 2 v4 fixtures have no MAIN/SECONDARY at all. Strict AND-of-two detection would
      produce a 50% false-negative rate. **Parser treats v4 as `row:Contact Office`
      SINGLE-marker (100% reliable); MAIN/SECONDARY is documentation-only.** Re-introduce as
      `v4-strict` if a future sub-variant requires it.
   6. **Spec §5.2 / §5.3 — Sheets revision binding falls back to modifiedTime CAS** _(applies
      to M6 onward; ratified at M6 Pin-stop 1.5 — 2026-05-09)_. The spec at §5.2 / §5.3
      specifies markdown export "preferred via `revisions.export` when supported" with
      `binding.headRevisionId` as the authoritative pin token. Three Drive / Sheets API facts
      verified against current Google docs (2026-05-09) collectively close the door for
      Workspace-native files:
      - **`files.get(... headRevisionId, md5Checksum ...)`** — Drive API v3 docs: _"Output
        only. The ID of the file's head revision. This is currently only available for files
        with binary content in Google Drive."_ Google Sheets are Workspace-native, not binary;
        both fields return `null` regardless of permission level. **No Editor / Owner upgrade
        path changes this.**
      - **`drive.revisions.list`** — structurally empty for Workspace-native files. Sheets
        revisions live in Sheets-internal storage that the Drive `revisions` resource does
        not surface.
      - **Sheets API v4** — `spreadsheets.get`, `spreadsheets.values.get`, and
        `spreadsheets.values.batchGet` accept no revision-id parameter; all three always read
        HEAD.

      **The plan ratifies modifiedTime CAS as the permanent binding contract for the
      spreadsheet:** `fetchSheetAsMarkdownAtRevision` treats `revisionId` as
      `metadata.headRevisionId ?? metadata.modifiedTime`; xlsx bytes are fetched only after
      verifying the captured token still matches; metadata is re-read after the byte fetch and
      again before the Phase-1/Phase-2 transaction; any mismatch raises
      `STAGED_PARSE_REVISION_RACE`. **Per-asset binding for embedded images and linked-folder
      Drive files is unaffected** — those targets are binary files and the spec §6.11
      `(headRevisionId, md5Checksum)` / `(sheetsRevisionId, embeddedFingerprint)` immutable-pin
      contracts apply to them in full. Spreadsheet binding = modtime CAS; per-asset binary
      binding = full revision pinning. M6 Pin-stop 1.5 contract block (handoff §0) carries the
      production fetch primitive; M6 §6 watchpoint 10 carries the spreadsheet-vs-binary-asset
      asymmetry.

   7. **Spec §6.8 MI-8 / MI-8b — empty/cleared-field collapse requires modtime-stable debounce**
      _(applies to M6 onward; ratified 2026-05-09)_. The spec at §6.8 lines 1550 (MI-8) and 1551
      (MI-8b) stages on any prior-non-empty → new-empty transition for financial fields (PO#,
      Proposal, Invoice, Invoice Notes) and on any `coi_status` delta, without qualification. Two
      timing facts about Google Drive's exposure of native Sheets edits drive this amendment:
      - **Drive `files.get(modifiedTime)` for Workspace-native files** (Sheets, Docs, Slides)
        refreshes on a ~3-minute aggregation/batching cadence — the first edit on a quiescent
        file fires a push notification within seconds, but subsequent edits in the same active
        session coalesce into the next ~3-min batch (community-confirmed across
        `googleapis/google-api-go-client#444` and ~5y of consistent reports; not documented by
        Google but no official rebuttal).
      - **Mid-edit Doug behavior** — clearing a cell and retyping a corrected value within
        seconds — commits the cleared cell on Enter/click-away, fires an autosave, and on a
        previously-quiescent file fires a push notification carrying the empty-cell state within
        seconds. The corrected value, committed 5–30s later, coalesces into the next ~3-min
        batch. Without a debounce, the empty-state push triggers MI-8/MI-8b staging before the
        corrected value arrives.

      **The plan ratifies a modtime-stability debounce on MI-8 and MI-8b only, gated to automated
      trigger modes:** Phase 1's MI-8 and MI-8b checks fire only when
      `now() - file.modifiedTime ≥ MI8_DEBOUNCE_MS` (constant in `lib/sync/constants.ts`, value
      `240_000` = 4 min — Drive's documented batching floor is ~180s, +60s safety margin). If
      `file.modifiedTime` is younger than the threshold AND MI-8 or MI-8b would otherwise trip,
      `runPhase1` returns `{ outcome: 'defer', reason: 'mi8_modtime_unstable' }` (or
      `'mi8b_modtime_unstable'`) and the orchestrator skips this file for this run; the 5-min
      cron tick (§5.1, strictly greater than `MI8_DEBOUNCE_MS`) re-evaluates against the
      then-current modtime and content, by which time Drive's batching window has flushed and
      the corrected value is visible. The debounce applies to **automated trigger modes only** —
      `mode='cron'`, `mode='push'`, `mode='recovery'`, `mode='asset_recovery'`. **Manual and
      onboarding modes** (`mode='manual'`, `mode='onboarding'`) bypass the debounce because an
      explicit operator-triggered sync that catches an empty-cell transient should stage
      normally so the operator can review and either approve or wait. All other invariants
      (MI-1..MI-5b, MI-6, MI-7, MI-7b, MI-8c, MI-9, MI-11..MI-14) evaluate immediately in all
      modes — only MI-8 (financial-field collapse) and MI-8b (COI delta) are debounce-gated,
      because those are the only invariants whose trip is plausibly a mid-edit transient on a
      single cell. MI-8c (pull-sheet structural collapse) is NOT debounce-gated: structural
      sheet-shape changes are not cleared-and-retyped in seconds.

      Tests: (a) `mode='cron'`, `modifiedTime = now - 60s`, parse trips MI-8 → returns `defer`
      and writes nothing; (b) `mode='cron'`, `modifiedTime = now - 300s`, same parse → MI-8
      stages normally; (c) same matrix for MI-8b COI deltas; (d) `mode='manual'`,
      `modifiedTime = now - 10s`, MI-8 trip → stages immediately (debounce bypassed);
      (e) `mode='cron'`, MI-8c trip with `modifiedTime = now - 10s` → stages immediately
      (debounce does not apply to MI-8c).

   8. **Spec §6.8 MI-9 — narrowed to capability-affecting flag changes (LEAD bit)**
      _(applies to M6 onward; ratified 2026-05-09)_. The spec at §6.8 lines 1553 / 1558 stages
      on **any** `role_flags` delta for an existing crew member, with the rationale "role gates
      server-side data filtering." Three of the four §6.8 worked examples exercise the LEAD bit
      specifically (LEAD-loss, LEAD-gain, additive non-LEAD); the fourth is a department change
      (`A1` → `V1`). LEAD toggles are auth-sensitive: LEAD grants access to the internal ops
      surface and `shows_internal` financials. Department-designation changes (`A1` ↔ `V1`,
      `L1` ↔ `L2`, additive `BO`/`SHOP`/etc.) only change which scope tile the crew member sees
      on their own page — a self-visible UI tweak, not a capability or auth event. Staging both
      classes uniformly produces operator friction on routine department reassignments without a
      corresponding security or correctness benefit.

      **The plan ratifies a narrowed MI-9:** Phase 1's MI-9 check stages **only** when the
      LEAD-bit set membership differs between `prior.role_flags` and `new.role_flags`
      (i.e., `prior.includes('LEAD') !== new.includes('LEAD')`). All other `role_flags` deltas
      auto-apply via Phase 2 UPSERT and emit a `ROLE_FLAGS_NOTICE` entry to `admin_alerts` at
      **`info` severity** (visible in the alert feed but does not contribute to the dashboard's
      action-required count or banner) so the change is auditable without blocking propagation.
      **MI-10** (the LEAD-toggle documentation safety net) is now the canonical implementation
      predicate, and MI-9 is implemented as `MI-10 || false` — i.e., MI-9 and MI-10 collapse
      into a single LEAD-bit check. The §12.4 catalog gains `ROLE_FLAGS_NOTICE` (info severity,
      no reviewer action) alongside `MI-9_ROLE_FLAGS_DELTA` (which is now reserved for the
      LEAD-bit subset).

      Tests: (a) `['A1']` → `['LEAD','A1']` stages with `MI-9_ROLE_FLAGS_DELTA` (LEAD-bit
      changed); (b) `['LEAD','A1']` → `['LEAD','V1']` auto-applies and emits info-severity
      `ROLE_FLAGS_NOTICE` (LEAD-bit unchanged, department changed); (c) `['A1']` →
      `['A1','BO']` auto-applies and emits info-severity `ROLE_FLAGS_NOTICE` (additive
      non-LEAD); (d) `['LEAD','A1']` → `['A1']` stages with `MI-9_ROLE_FLAGS_DELTA` (LEAD-bit
      lost). The §6.8 derivation table and §12.4 catalog are patched in the spec to reflect the
      narrowing. The `tests/messages/_metaAdminAlertCatalog.test.ts` registry (per AGENTS.md
      §13 meta-test inventory) gains the `ROLE_FLAGS_NOTICE` row.

   9. **Spec §5.2 / §6.8 — FIRST_SEEN_REVIEW becomes auto-publish with 24h email-undo**
      _(applies to M6 onward; ratified 2026-05-09)_. The spec at §5.2 step 3 routes ALL
      first-seen sheets to `pending_syncs` with a `FIRST_SEEN_REVIEW` sentinel, requiring a
      dashboard Apply click before the show goes live for crew. Doug-validation §7.1
      (`doug-validation-questions.md`, answered 2026-05-09 by Doug) confirms his preferred
      workflow is "frictionless if no issues — sheets should go live the moment I drag them in.
      The folder IS the publish gate." The dashboard-Apply gate adds a step Doug doesn't
      naturally take (his surface is Drive, not the dashboard) and forces him to remember to
      check a surface he doesn't visit.

      **The plan ratifies a new first-seen routing precedence:**

      1. **First-seen + MI-1..MI-5b hard fail** → UPSERT `pending_ingestions`, no auto-apply
         (unchanged from current spec). The sheet is not parseable enough to publish.
      2. **First-seen + MI-1..MI-5b pass + MI-6..MI-14 trip** → stage with the relevant MI
         sentinel (e.g., `MI-6_CREW_SHRINKAGE`) — NOT with a `FIRST_SEEN_REVIEW` sentinel
         (unchanged routing, but the FIRST_SEEN_REVIEW sentinel is no longer composed in).
         These code paths already handle suspicious changes; first-seen status doesn't add
         meaningful information once an MI invariant has tripped.
      3. **First-seen + ALL MI-1..MI-14 pass** → **auto-apply via Phase 2** (NEW; replaces the
         prior FIRST_SEEN_REVIEW staging path). Show goes live immediately. A new
         `SHOW_FIRST_PUBLISHED` event lands in `admin_alerts` (info severity) AND fires a
         tier-1 confirmation push (per future push-notification milestone — see
         `notification-design-memo.md`) carrying a 24h unpublish-undo button.

      **24h unpublish-undo contract.** Auto-publish is paired with an undo window so the
      "wrong-folder mistake" failure mode (Doug accidentally drags an unrelated show sheet into
      the watched folder) is recoverable without dashboard archaeology:

      - On Phase 2 auto-apply for a first-seen sheet, write `shows.unpublish_token uuid` (random
        UUID v4) AND `shows.unpublish_token_expires_at = now() + interval '24 hours'`. Token is
        single-use; consumed on first redemption.
      - The confirmation email contains a signed unpublish link
        (`POST /api/show/[slug]/unpublish?token=<uuid>`). Endpoint validates: token matches the
        stored row, token has not expired, token has not been consumed. On success: archives
        the show (`shows.archived_at = now()`), revokes any signed `link_sessions` issued in
        the 24h window for this show (`UPDATE link_sessions SET revoked_at = now() WHERE
        show_id = $1 AND issued_at >= shows.created_at`), consumes the token (clears
        `unpublish_token`), and emits a `SHOW_UNPUBLISHED` admin_alerts row.
      - After 24h OR after first consumption, the unpublish path is closed; further wrong-publish
        recovery requires going through the standard admin archive flow.
      - **Wrong-folder mistake recovery cost** = clicking one button in an email Doug already
        opened to read the confirmation. No dashboard navigation, no archive workflow knowledge
        needed.

      **ONBOARDING_SCAN_REVIEW unchanged.** Wizard-discovery first-seen (`mode='onboarding_scan'`)
      keeps its stage-for-approval semantic. The wizard is explicitly a "review what's in the
      folder before activating" flow; auto-applying the wizard's discovered sheets would
      contradict the wizard's reason for existing. The two first-seen pathways are now
      semantically distinct: deliberate folder-drop → auto-apply with undo; wizard scan → stage
      for explicit confirmation.

      **`FIRST_SEEN_REVIEW` code is retired.** No code path emits it under the new routing. The
      §12.4 catalog row is replaced with a `~~FIRST_SEEN_REVIEW~~` retired row pointing at
      `SHOW_FIRST_PUBLISHED` (the new info-severity confirmation) for migration context. The
      `triggered_review_items` enum drops `FIRST_SEEN_REVIEW`; new code `SHOW_FIRST_PUBLISHED`
      lands in the `admin_alerts` catalog (NOT in `triggered_review_items` — there's nothing to
      review, just a "this happened" record). Tests in M6 Task 6.4 are updated: the
      first-seen-MI-pass scenario asserts auto-apply (Phase 2 ran, `shows` row exists,
      `unpublish_token` is non-null with 24h expiry) instead of asserting `pending_syncs` row
      with `FIRST_SEEN_REVIEW` sentinel.

      **Schema additions** (will land in whichever migration ships amendment 9 implementation,
      likely M6 or a small standalone migration): `ALTER TABLE shows ADD COLUMN unpublish_token
      uuid`, `ALTER TABLE shows ADD COLUMN unpublish_token_expires_at timestamptz`. Both NULL
      after first consumption / expiry / for shows that never had auto-publish (e.g., wizard-
      promoted shows, manual admin creates).

      Tests: (a) first-seen + MI-1 fail → `pending_ingestions` UPSERT (regression — unchanged);
      (b) first-seen + MI-6 trip → `pending_syncs` row with `MI-6_CREW_SHRINKAGE` (NOT
      `FIRST_SEEN_REVIEW`); (c) first-seen + all MI pass → Phase 2 auto-apply, `shows` row
      exists, `unpublish_token IS NOT NULL`, `SHOW_FIRST_PUBLISHED` admin_alerts row exists,
      `pending_syncs` row does NOT exist; (d) `POST /api/show/[slug]/unpublish` with valid
      token → show archived, `link_sessions` revoked, token consumed; (e) repeat call with
      consumed token → 400 with `UNPUBLISH_TOKEN_CONSUMED`; (f) call after 24h → 400 with
      `UNPUBLISH_TOKEN_EXPIRED`; (g) onboarding-scan first-seen + all MI pass → still stages
      with `ONBOARDING_SCAN_REVIEW` (regression that the two pathways stay distinct).

   10. **Spec §9.1 / §9.2 — M12.2 Phase A admin IA reskin + admin-visibility compliance**
       _(ratified 2026-05-31; spawned by the M12 UX-validation walk; spec
       `docs/superpowers/specs/2026-05-31-m12.2-phase-a-admin-dashboard-per-show-design.md`, converged via
       32-round cross-model adversarial review)_. The spec at §9.1 specifies a flat active-shows list dashboard
       and §9.2 a flat stacked per-show page. The walk found these damage Doug's "dashboard = overview" /
       per-show command-surface experience. **The M12.2 Phase A plan supersedes §9.1/§9.2 on layout/IA only:**
       (a) §9.1 flat list → **stat strip (Active / Live now / Need review / Crew total) + dense shows table ⟷
       needs-attention inbox**; (b) §9.2 flat sections → **two-col Crew ⟷ Share&access (rotate/reset folded into
       the share panel) + sync-as-footer + status pill + header share-link chip**. The crew share/picker model
       follows the 2026-05-23 picker-pivot amendment (`v1-pre-deployment-amendments/2026-05-23-crew-auth-pivot-show-link-picker.md`),
       NOT the stale signed-link spec. **Admin-visibility COMPLIANCE (not a supersession):** the current
       `fetchDashboardData` `published = true` filter is an implementation bug vs the master spec's `shows.published`
       note (line ~186 of the master spec: "admin read paths … do NOT [scope to published] — admin needs to see
       in-flight finalize rows with a yellow 'publishing…' badge"). Phase A fixes it: the dashboard shows
       `archived = false` rows (published AND in-flight), unpublished rows carry a "Publishing…" badge, and
       `isLive`/`liveCount` require `published`. **Out of Phase A (→ Phase B):** persistent nav, settings, the
       archived dashboard bucket + archive/unarchive action, and the server-side rotate/reset + archived
       apply/discard mutation guards (spec §16 DEF-1/DEF-2 — pre-existing backend gaps, deferred with concrete
       triggers + Phase-A UI mitigations). No DB writes / no migrations land in Phase A.

   11. **Spec §9.1 / §9.2 — M12.2 Phase B1 admin nav shell + settings shell**
       _(ratified 2026-05-31; second half of the owner's "Milestone B" per `.validation-local/design-admin/RECONCILIATION.md §E`;
       spec `docs/superpowers/specs/2026-05-31-m12.2-phase-b1-admin-nav-settings-design.md`, converged via cross-model
       adversarial review)_. The master spec §9 describes a chrome-less admin section (a static "Admin" header + the
       global AlertBanner, `app/admin/layout.tsx`). **The M12.2 Phase B1 plan supersedes §9.1/§9.2 on
       navigation/chrome + settings layout only:** (a) a **persistent nav shell** wrapping every `/admin/*` route —
       desktop top bar (brand + Admin badge + Dashboard/Settings nav + NotifBell + dark toggle + UserMenu) + mobile
       top bar + bottom tab bar + per-route page header/breadcrumbs (`<AdminPageHeader>`, page-owned data); (b) a
       **settings shell** at `/admin/settings` — read-only Drive-connection health panel + embedded Administrators
       (with the revoke-hang fix) + a build-gated Developer-tools row. The crew share/picker model on these surfaces
       follows the 2026-05-23 picker-pivot amendment, NOT the stale signed-link spec. **Out of B1 (→ B2 / B3):** the
       two settings "Preferences" toggles are backend subsystems, not chrome — auto-publish-clean-first-seen → **B2**
       (show lifecycle, with archive/unarchive + unpublish/undo + spec §16 DEF-1/2/3 guards); alert-me-about-sync-problems
       → **B3** (email-delivery subsystem). B1 adds **no DB writes** (settings is read-only health + the existing
       allowlist RPCs); its only DB-adjacent change is the §12.4 `ADMIN_EMAIL_LIST_FAILED` `helpfulContext` edit
       (surface-neutral copy for the embedded admin-list, three-lockstep).

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
    20260501000000_initial_schema.sql
    20260501010000_rls_policies.sql
    .. # one migration per logical schema bump
  seed.ts # loads fixtures into local DB

fixtures/ # already exists, not modified
docs/superpowers/specs/.. # already exists, not modified
docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/ # this plan directory

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
