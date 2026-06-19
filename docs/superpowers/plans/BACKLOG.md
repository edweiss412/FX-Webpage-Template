# Possible Future Work (Backlog)

Speculative work items that **may** become real milestones if and when they're scoped and planned. **Not** currently scheduled work.

## What goes here vs DEFERRED.md

- **`DEFERRED.md`** (per-plan) — work that WILL be done. Has a concrete trigger (e.g., "when seed is next touched") OR is blocked on a planned future milestone (e.g., M11 X.\* cross-cutting audit). Every entry has a scheduled or trigger-based home.
- **`BACKLOG.md`** (this file, project-wide) — work that MIGHT be done. No spec, no plan tree, no scheduled milestone, no concrete trigger beyond "if we decide to pursue it." Entries here may never be picked up; that's acceptable. They're captured so the ideas aren't lost, not promised.

The deferred-vs-backlog distinction was codified after the M2-D4 phantom-constraint post-mortem + the M11 mislabeling on 2026-05-19. See memory `feedback_deferral_discipline.md`.

## Promotion path

When a backlog item becomes real work:

1. **Spec it.** Author a spec file at `docs/superpowers/specs/<date>-<name>-design.md`. Run brainstorming + adversarial review per the standard cycle.
2. **Plan it.** Author a plan tree at `docs/superpowers/plans/<date>-<name>/` with phase files + HANDOFF-TEMPLATE + ROUTING.
3. **Number it.** Assign a milestone number that picks up where the sequence ends (M11 next after the current M0–M10 + M11 user-facing-docs slot).
4. **Migrate.** Move the entry from this file to a "Promoted" section (below) with the planned-milestone's name + spec/plan links.
5. **Update `docs/superpowers/plans/README.md`** catalog to list the new milestone.

Promotion is a real decision — same gate as any other milestone (brainstorming + spec self-review + adversarial review + planning + adversarial review). Don't promote casually.

---

## Open backlog (not yet promoted)

### BL-OPS-LOG — Structured operator-log sink + producer wiring

**Origin:** Consolidates four DEFERRED entries from the FXAV crew-pages plan that all blocked on the same nonexistent infrastructure: M5-D9 (OAuth callback structured operator-log), M5-D10 (Redeem-link structured operator-log), M5-D11 (Sign-out teardown structured operator-log), M10-D-PHASE1-1 (ONBOARDING_OPERATOR_ERROR durable notification via Sentry + admin-visible banner).

**Scope (combined from the four originating entries):**

- A `lib/operatorLog/` module that writes structured operator-facing log entries to a durable sink. Sink design TBD — candidates: Supabase table, Sentry, or hybrid (Sentry for high-signal incidents + a Supabase audit table for everything else).
- Producer call sites for:
  - `app/auth/callback/route.ts` — emit `OAUTH_REDIRECT_INVALID` + `OAUTH_STATE_INVALID` alongside the redirect query codes.
  - `app/api/auth/redeem-link/route.ts` — emit every redeem-link failure code (`CSRF_DENIED`, `CSRF_NONCE_EXPIRED`, `CSRF_KEY_ROTATED`, `LINK_REDEEM_KEY_ROTATED`, `SESSION_NOT_FOUND`, `LINK_NO_CREW_MATCH`, `LINK_VERSION_MISMATCH`, `LINK_REVOKED_FLOOR`, `LINK_REVOKED_SURGICAL`, `ADMIN_SESSION_LOOKUP_FAILED`).
  - `app/auth/sign-out/route.ts` — emit on `deleteSession()` and Supabase `signOut()` failures.
  - Onboarding wizard `ONBOARDING_OPERATOR_ERROR` producer (per M10 Phase 1 R1).
- Admin-visible banner integration so Doug sees the most recent operator-log entries (without having to leave the dashboard).

**Why backlog, not deferred:** The work is real and motivated, but: (a) no spec or plan exists; (b) the sink design needs a brainstorming session (Supabase vs Sentry vs hybrid); (c) no scheduled milestone exists to absorb it; (d) several of the producer surfaces work acceptably today via inline `console.error` or `admin_alerts` UPSERT — operator visibility is degraded, not absent. Picking this up requires first scoping the milestone (spec + plan), not just implementing the producer wiring.

**Promotion prerequisite:** brainstorming session on sink design (Supabase audit table vs Sentry vs hybrid + retention + admin-banner integration shape).

### BL-PUSH-NOTIFICATIONS — Email-primary operator push surface

**Origin:** DEFERRED entry M6-D1 (Push notification surface, operator-facing). Filed 2026-05-09 following ratification of plan amendments 7 + 8 on the FXAV crew-pages plan. Design memo lives at `2026-04-30-fxav-crew-pages-v1/notification-design-memo.md`; Doug-validation questions consolidated at `2026-04-30-fxav-crew-pages-v1/doug-validation-questions.md` (§4 channels/timing, §5 feedback/communication).

**Scope:** The v1 spec currently has zero push surface. Every staging event (FIRST_SEEN_REVIEW, MI-6..MI-14, MI-1..MI-5b hard fails on existing shows) is functionally invisible to Doug until he visits the dashboard. The MI staging system is calibrated for an operator who isn't watching for it. A push surface — email primary; SMS/webhook optional — would close the loop.

Design memo captures six load-bearing principles: push-not-pull, severity tiering, push-debounce, coalescing, quiet success, two-way feedback. Concrete sketch includes schema additions, route shapes, integration with the existing M8 report pipeline, and action-token signing for one-click acknowledgements.

**Why backlog, not deferred:** Three independent prerequisites: (a) the design memo needs ratification via spec amendment + brainstorming; (b) Doug-validation questions need real answers from Doug's first-show workflow; (c) email-provider integration (Resend / Postmark / SES) requires a vendor decision + account setup + secrets management. Spec amendment + dedicated milestone plan, not a sub-milestone task. The notification-design-memo notes that MI-8/MI-8b modtime-stability debounce (ratified in plan amendment 7) becomes redundant once push-debounce lands — both achieve the same anti-spam UX outcome from different layers, so push-debounce might retire MI-8/MI-8b infrastructure.

**Promotion prerequisite:** Doug-workflow observation from a live v1 deployment (need real data on which staging events Doug actually misses) + email-provider integration decision + spec amendment formalizing the notification design memo.

### BL-RLS-COVERAGE-CROSSCUTTING — Promote M9 C9 admin-RLS runtime probe to a cross-cutting meta-test

**Origin:** Surfaced 2026-05-19 during the X.5 seed-handoff drafting. AC-X.5 in spec §17.2 body specifies email canonicalization (matches plan Task X.5), but AC-X.6's required-checks list names the X.5 gate `x5-rls-coverage` — an internal spec inconsistency. The drift will be surfaced by X.5 (in its convergence log) + audited by X.6 (cross-cutting parity assertion). This BACKLOG entry tracks the deferred decision about whether to promote the M9 C9-era `tests/db/admin-rls-runtime.test.ts` runtime probe to a cross-cutting meta-test under a new AC.

**Scope:** M9 C9 shipped `tests/db/admin-rls-runtime.test.ts` covering all 21 §4.3 admin-only tables × behavioral SELECT + structural qual/with_check predicate-equivalence. It runs under the existing `tests/db/` test suite, no dedicated CI check name. Promotion would mean:

- Relocate / extend to `tests/cross-cutting/rls-coverage.test.ts` under the X.\* lineage pattern (regression fixtures, audit-derives-from-spec, CI gate exposure).
- Add a dedicated CI gate name (e.g., `x7-rls-coverage` if X.5/X.6 keep their existing assignments, or absorb into an X.5 reframing).
- Author a spec amendment defining the new AC (placement TBD — new AC-X.7, or reframing AC-X.5 to split email-canon + RLS-coverage into two ACs).

**Why backlog, not deferred:** The M9 C9 probe works today; behaviorally there's no coverage gap. Promotion is polish work (move from per-domain test to cross-cutting meta-test for discoverability + CI gate naming consistency). Promotion requires (a) a spec amendment decision about AC placement, (b) a ROUTING.md decision about whether the new AC gets a check name, (c) a brainstorming session to confirm the promotion is worth the spec churn vs leaving the probe in `tests/db/`.

**Promotion prerequisite:** spec amendment defining the new AC, OR a decision to reframe AC-X.5/X.6 to absorb RLS coverage. Either path is a real spec-amendment cycle with adversarial review, not a casual edit.

### BL-PRIVATE-IMAGE-PIPELINE — Migrate diagrams gallery to `next/image` with auth-preserving pipeline

**Origin:** DEFERRED entry M7-D3 (Diagrams gallery `<img>` → `next/image`). Re-deferred at M9 C6b 2026-05-13 after an in-cluster attempt failed P0 (auth cookies don't forward through `/_next/image`; private Cache-Control rewritten to public, breaking revocation propagation).

**Scope:** Migrate `components/diagrams/Gallery.tsx` and `components/diagrams/GalleryLightbox.tsx` from `<img>` to `next/image` to gain LCP optimization on the mobile crew page. Currently they use `<img loading="lazy" decoding="async">` as the manual equivalent — works correctly but doesn't get Next's `/_next/image` optimizer benefits.

Asset URLs are proxied through `/api/asset/diagram/...` which returns auth-checked bytes with `private, max-age=0, must-revalidate`. The `next/image` optimizer would either need to bypass the auth proxy OR add a second redirect layer — neither is straightforward.

**Why backlog, not deferred:** The in-cluster M9 attempt failed P0 because the obvious paths (declare proxy origin as `next.config.ts` remote pattern; let `/_next/image` proxy through it) break the auth + cache contract. The right fix requires a private-image-pipeline design — custom loader + transform service, OR signed-URL CDN, OR architectural decision to accept the LCP cost of un-optimized images. Each path is a multi-day brainstorming session.

**Promotion prerequisite:** Private-image-pipeline brainstorming (custom loader vs signed-URL CDN vs accept-the-cost). May fold into a broader "v1.5 perf-and-polish" milestone rather than standalone.

### BL-COPY-SHARE-LINK — Admin "Copy share link" affordance on per-show panel crew section

**Origin:** Split from M11-E-D1 (HIGH) on 2026-05-20 during the M9 close-out spec-vs-shipped audit. M9.5 (`handoffs/M9.5-signed-link-controls.md`) carries the v1-blocking "Issue new link" + "Revoke all links" subset; this entry carries the post-v1 convenience affordance.

**Scope:** Add a "Copy share link" button to the per-show panel crew section that copies the canonical signed-link URL (with `#t=` fragment, never `?t=` per spec §7.2 lines 1953 + 1991) to the clipboard. The button MUST be hidden when the crew row is in the no-live-link state (`current_token_version === revoked_below_version`) per spec line 1100. Mint the URL by signing a JWT with the row's `current_token_version` via the existing `signLinkJwt()` in `lib/auth/jwt.ts`.

Open design questions:

- **Mint at click vs mint at render.** Mint-at-render exposes the JWT in the rendered HTML (a leak vector if the page is screenshotted or the DOM is logged). Mint-at-click avoids that but requires a Server Action round-trip and a brief "Copying…" state. Recommend mint-at-click for parity with the Revoke confirm two-tap UX.
- **Visual feedback.** Standard pattern: button label flips to "Copied!" for 2s after success. Catalog-routed via `messageFor()` (no raw string) per AGENTS.md §1.5.
- **Mobile clipboard API.** `navigator.clipboard.writeText` requires HTTPS + transient user activation. Both already satisfied on the admin surface; no fallback needed.

**Why backlog, not deferred:** No v1 ops gap. Doug can manually construct the URL today (or copy from the address bar after testing the link himself). The affordance is a convenience-shortcut, not a recovery path. No concrete trigger date; promotion depends on FXAV operator feedback (Doug surfaces friction with the manual workflow) OR a broader "admin UX polish" milestone.

**Promotion prerequisite:** Either (a) FXAV feedback flags the workflow as a real friction point, OR (b) a v1.x admin-UX polish milestone bundles this with the other BL-ADMIN-\* entries.

### BL-ADMIN-DASHBOARD-ROW-ACTIONS — ActiveShowsPanel row-action shortcuts

**Origin:** M11-E-D3 (MEDIUM) filed 2026-05-20. M11 user-facing-docs `/help/admin/dashboard` documents per-row actions `Open`, `Preview as`, `Re-sync`, `Archive` on the Active Shows panel per master spec §9.1. Shipped `components/admin/ActiveShowsPanel.tsx` renders show title + crew count + sync-status only; no row-level action affordances.

**Scope:** Add the four documented row actions to `ActiveShowsPanel.tsx`:

- `Open` — link to `/admin/show/[slug]`. Already navigable via the show-title link; this would expose it as an explicit action with consistent affordance treatment.
- `Preview as` — link to `/admin/show/[slug]/preview/[crewId]` (M10 Phase 3 §B preview-as flow). Already routable; this exposes it as a row action.
- `Re-sync` — POST to the manual-sync route. Functional equivalent exists at `/admin/show/[slug]` via `<ReSyncButton>`; this is a dashboard-level shortcut.
- `Archive` — likely needs a new SECURITY DEFINER RPC for soft-delete (`shows.archived_at`). Spec §9.1 mentions archiving but the column doesn't exist yet; promotion may require a small schema migration.

**Why backlog, not deferred:** None of the four shortcuts close a functional ops gap — Doug can already accomplish all four actions by drilling into the per-show page (`Re-sync` directly; the others by navigation). This is pure surfacing/convenience. `Archive` is the only one with a schema implication; the others are pure UI work.

**Promotion prerequisite:** Either (a) FXAV operator feedback surfaces dashboard-level friction (Doug actively wants to triage multiple shows from the dashboard without drilling in), OR (b) a v1.x admin-UX polish milestone. `Archive` may need a separate spec amendment if `shows.archived_at` semantics need definition (idempotency, side effects on `crew_member_auth`, etc.).

### BL-X5-INTROSPECTION-GAP — Eight widened X.5 canonical-email CHECKs have no `tests/db` introspection rows

**Origin:** Surfaced 2026-05-21 during the M9.5 Phase 1-2 pin-stop triage. Codex's Task 3 class-sweep (commit `6d61229`) updated the three `tests/db` assertions that existed (`crew_members`, `transportation`, `contacts`) to pin the widened CHECK contract (`email IS NULL OR (email = lower(trim(email)) AND email <> '')`). Eight other tables had their canonical-email CHECKs widened in X.5 but have **no** corresponding `tests/db` introspection-test row: `sync_audit`, `app_settings`, `deferred_ingestions`, `admin_alerts`, `reports`, `report_rate_limits`, `pending_syncs`, `shows_pending_changes`.

**Scope:** For each of the 8 tables, decide whether to (a) add an introspection-test row pinning the widened CHECK, (b) confirm the CHECK is covered at a different layer (RPC-behavior test, migration-apply test) such that introspection rows aren't warranted, or (c) absorb the coverage into a single cross-cutting `tests/cross-cutting/email-canonicalization.test.ts` parity assertion that walks every table whose canonical CHECK was widened.

**Why backlog, not deferred:** The widening contract is correct and live in the schema; this is a coverage-completeness gap, not a behavioral bug. Picking it up requires a small design call (per-table rows vs cross-cutting parity), and the right home may be the existing `tests/cross-cutting/validation-tooling-tz-pin.test.ts` lineage (post-M12-R5 structural defenses) rather than scattered `tests/db` rows.

**Promotion prerequisite:** Either (a) a future X.\* cross-cutting touch surfaces the gap (e.g., a follow-on widening that introspects all canonical CHECKs at once), OR (b) explicit decision to add a parity meta-test under `tests/cross-cutting/`. Either path is small (under half a day) once scoped — but neither is in-scope for any currently planned milestone.

### BL-ADMIN-POSTGREST-DML-LOCKDOWN — Revoke table-level DML on remaining admin-only tables so SECURITY DEFINER RPCs are the sole mutation gate

**Partial closure (2026-06-18, crew-page redesign Phase 2 spec R16-HIGH):** the **`shows_internal`** portion is being closed by Phase 2 — the AGENDA `run_of_show` spec adds a `revoke insert,update,delete on public.shows_internal from anon,authenticated` migration + a `RPC_GATED_TABLES` registry row (`tests/db/postgrest-dml-lockdown.test.ts:124`), making the locked service-role sync the single serialized writer (the read-modify-merge would otherwise race an unlocked admin PostgREST write). Verified the only writer is the service-role sync (`runScheduledCronSync.ts:1278`); no authenticated app code mutates the table, so the REVOKE is functionally inert. This locks down `financials`/`parse_warnings`/`raw_unrecognized` on the same table as a side effect (intended). The REMAINING scope below is the OTHER admin-only tables.

**Origin:** Surfaced 2026-05-21 during M9.5 adversarial review R5+R6 (HIGH). The new `revoke_all_links` and `issue_new_link` RPCs correctly held the per-show advisory lock + did the active-roster `EXISTS` gate inside the RPC body, but `crew_member_auth` and `crew_members` retained `INSERT`/`UPDATE`/`DELETE` for the `authenticated` role — meaning any authenticated caller could bypass the RPC entirely by calling the table directly via PostgREST's `from('<table>').insert/update/delete` builder. M9.5 closed the hole for the two tables it touched (REVOKE migration + structural meta-test pinning the invariant). The same vector exists for every other admin-only table whose intended mutation gate is a SECURITY DEFINER RPC but whose DML grants were never explicitly revoked.

**Scope (audit at promotion time, not from this snapshot):** candidates surfaced during R7 prep included `shows`, `pending_syncs`, `pending_ingestions`, `sync_audit`. The actual list MUST derive from the live spec §4.3 admin-only-tables enumeration AT promotion time (per `feedback_audit_derives_from_spec_not_handoff.md`), not from this BACKLOG snapshot — admin-only tables have been amended multiple times (e.g., X.3 caught §4.3 going from 19→21 tables post-handoff). The promotion plan must:

- Walk every admin-only table from spec §4.3 at audit time.
- For each table, determine whether its intended mutation gate is (a) a SECURITY DEFINER RPC (lockdown needed), (b) admin-only RLS with no service-role bypass needed (lockdown also reasonable as defense-in-depth), or (c) intentionally writable by some non-service role (NOT a lockdown candidate; document why).
- For (a) and (b) candidates: ship a `REVOKE INSERT, UPDATE, DELETE ON <table> FROM authenticated` migration + extend the structural meta-test from M9.5 R5+R6 to pin the invariant. The meta-test pattern is the load-bearing defense; a one-line `GRANT` in a future migration silently re-opens the hole without it.
- Audit: write a runtime probe that derives the candidate list from §4.3 + the SECURITY DEFINER function inventory, asserts each candidate table has the expected REVOKEs, and surfaces named diffs.

**Why backlog, not deferred:** The exposure is real but not actively exploited (the M9.5 holes were caught at adversarial review, not in production), and the FXAV product surface is small — `authenticated` callers who could bypass the RPC are FXAV admins or signed-in crew members, not arbitrary internet users. No concrete trigger exists. Picking it up is genuine security-hardening polish; it requires a spec amendment ratifying the "all admin-only-table mutations flow through SECURITY DEFINER RPCs" contract OR a brainstorming session to define the gate-classification matrix table-by-table. Not in-scope for any currently planned milestone.

**Promotion prerequisite:** Either (a) FXAV ops feedback or a security review surfaces an actual exposure path that warrants the work, OR (b) a v1.x security-hardening milestone bundles this with related lockdown work (e.g., RLS-coverage promotion under BL-RLS-COVERAGE-CROSSCUTTING). The structural meta-test pattern shipped at M9.5 R5+R6 is the template; extend the existing meta-test, don't write a parallel one.

**Cross-references:**

- Memory: `feedback_postgrest_dml_lockdown_for_rpc_gated_tables.md` documents the bug class + the planning-time checklist.
- M9.5 R5+R6 commits (full SHAs in M9.5 §13 convergence log).
- Related backlog: `BL-RLS-COVERAGE-CROSSCUTTING` covers the row-level half of the contract; this entry covers the statement-level half. A future v1.x security milestone may bundle both.

### BL-ADMIN-PER-SHOW-HISTORY — Sync-health-history + parse-warnings-history sections on per-show panel

**Origin:** M11-E-D4 (MEDIUM) filed 2026-05-20. M11 `/help/admin/per-show-panel` documents per-spec §9.2 a "sync health" section (last 5 sync attempts) and a dedicated parse-warnings history section. Shipped `app/admin/show/[slug]/page.tsx` renders `PerShowAlertSection` + `ReSyncButton` + `ParsePanel` + `HelpTooltip` only; no historical-aggregate views.

**Scope:** Add two new sections to `app/admin/show/[slug]/page.tsx`:

- **Sync health (last 5)** — render the most recent 5 sync attempts for the show with timestamp + outcome (success / partial / hard-fail) + (if failed) the canonical error code. Data source TBD: most likely a new `sync_history` table OR a derived view over existing `pending_syncs` + `shows.last_seen_modified_time` change events. Either path requires schema work.
- **Parse warnings (history)** — distinct from the live `ParsePanel` view (which shows currently-blocked-on-warnings pending_syncs rows), this would show the historical aggregate of parse warnings emitted by previous sync attempts. Data source: extend `shows_internal.parse_warnings` to be append-only history OR query `pending_syncs` history.

Both surfaces need a schema decision (new table vs derived view vs append-only column) before implementation.

**Why backlog, not deferred:** No v1 ops gap. Doug has `admin_alerts` for high-signal failure notification (active and surfaced above the page chrome); historical-aggregate diagnostics are observability polish, not ops requirement. Both sections need schema/data-model work that's outside small mechanical fix scope.

**Promotion prerequisite:** Either (a) FXAV operator feedback surfaces "I can't tell if sync has been silently failing" pattern (real observability gap), OR (b) a v1.x admin-UX or admin-observability milestone bundles this with BL-OPS-LOG. The data-model question (new table vs derived view vs append-only column) needs a brainstorming session.

### BL-HELP-NON-SHOW-REPORT-SURFACE — Non-show-scoped recurrence-report surface for `/help/errors`

**Origin:** M11-I-D-1 (MEDIUM) filed 2026-05-22 during Phase I Codex R1 adversarial review.

**Symptom:** AC-11.11 (M11 spec line 695) says the `/help/errors` trailing CTA points to "the bug-report flow (per §4.3)". Master-spec §13.1 defines four bug-report surfaces, all show-scoped. There is no surface defined for a non-show-scoped recurrence report — "I keep seeing code X across my show portfolio."

**Scope of a real fix (if/when promoted):**

- **Surface design.** A 5th non-show-scoped report surface. Most likely a `<ReportRecurrenceButton>` per `/help/errors` catalog entry, opening a modal that captures `{code, free-text, optional contact}`. Possibly an admin triage view that aggregates recurrence reports by code.
- **API + storage.** Either extend `/api/report` to accept `showId: null` + a `recurrenceCode: string`, OR add `/api/report-recurrence` as a sibling endpoint. New `report_recurrences` table OR extend `reports` schema. Decision needed.
- **M8 contract impact.** ReportButton's existing show-scoped contract is hardened (~30 rounds of adversarial review). Extending requires a careful pass — the existing four surfaces must continue working unchanged.
- **Admin triage UX.** If recurrences are useful signal, Doug or Eric want a view that aggregates them. Adds an admin dashboard surface.
- **Catalog wiring.** §12.4 catalog rows would gain optional fields linking each code to its recurrence-report history.

Speculative scope: 1-2 weeks of milestone-shape work (design pass + impl + tests + adversarial review).

**Why backlog, not deferred:** No concrete trigger yet. v1 ships with `mailto:` (M11-I-D-1 in the M11 plan tree's DEFERRED.md) — that path works, just lacks idempotency / catalog labeling / GitHub routing of the four §13.1 surfaces. Whether Doug actually NEEDS a richer non-show-scoped flow is unknown until operators use the docs. Master-spec §13.1 was hardened without anyone identifying this surface as needed; not yet clear it's a real product gap rather than a spec-AC oversight.

**Promotion prerequisite:** EITHER (a) FXAV operator feedback flags the mailto-vs-modal divergence as real friction ("I want to report this without opening my mail client"), OR (b) a future milestone introduces a non-show-scoped report surface for any other reason (e.g., crew-side feedback that isn't per-show), and `/help/errors` adopts it as a sibling, OR (c) master-spec §13.1 gets revisited to add a fifth surface (which would itself need to ratify the AC-11.11 contract).

**Promotion mechanics:** Promote with companion M11-I-D-1 deferral re-open: amend AC-11.11 spec line to point at the new surface, swap `app/help/errors/page.tsx:45-49` mailto for the new component, run cross-CLI adversarial review on the §13.1 contract extension.

---

### BL-WIZARD-SESSION-CAS-TURNOVER-RACE — Wizard defer/ignore can still commit after the active wizard is superseded

**Origin:** Surfaced 11+ times across R41 spec + plan adversarial review rounds (2026-05-23 through 2026-05-24) by Codex on `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts:297-302`. Most recently P-R8 [high]. Dispositioned each time as OUT-OF-SCOPE for the R41 crew-auth pivot because the affected file is M-series onboarding code, not crew-auth code. Filing here so future R41-pivot adversarial-review rounds can cite this BACKLOG entry instead of re-surfacing the same finding.

**Symptom:** `transitionManifestRow` checks `app_settings.pending_wizard_session_id` only at the manifest UPDATE step. After that succeeds, the handler performs the deferral upsert (line ~301) and pending-ingestion delete (line ~302) without holding or re-checking the `app_settings` row. Under READ COMMITTED, a concurrent finalize/new-scan transaction can supersede or clear the active wizard between the manifest UPDATE and the subsequent two mutations; the stale request can still commit a deferral and delete the pending row while returning 200. This is exactly the class the CAS is meant to prevent.

**Scope of a real fix (if/when promoted):**

- **Lock-then-act protocol.** Either (a) `SELECT pending_wizard_session_id FROM app_settings ... FOR UPDATE` inside the same transaction as the manifest UPDATE + deferral upsert + pending-ingestion delete, or (b) collapse all three mutations into a single SECURITY DEFINER RPC that takes the session-id as an arg and CHECKs it against `app_settings.pending_wizard_session_id` in one statement per mutation. Option (b) matches the M5 advisory-lock topology pattern used elsewhere in this codebase.
- **Regression test.** Flip `pending_wizard_session_id` between the manifest UPDATE and the deferral upsert (e.g., via a `pg_advisory_xact_lock` + concurrent transaction harness), assert no deferral or delete commits, and assert the route returns a typed `WIZARD_SESSION_SUPERSEDED` failure.
- **Audit trail.** If the race is detected, emit an `admin_alerts` row with the superseded vs current session-ids so operators can correlate.

**Why backlog, not deferred:** This is an M-series onboarding wizard bug, not an FXAV crew-auth pivot bug. The R41 pivot does not touch this file. No M-series milestone is currently scheduled. Promoting requires a host milestone — most naturally an "M-onboarding-fixups" milestone scoped to known onboarding-flow races, OR a return to the M-series plan tree once R41 ships.

**Promotion prerequisite:** EITHER (a) Doug or Eric observes a real wizard-session-turnover race in production (an orphaned deferral row, a phantom delete), OR (b) an unrelated onboarding milestone re-opens this file and a class-sweep audit lands the fix as part of the broader change, OR (c) the M-onboarding-fixups milestone is scheduled.

**Promotion mechanics:** Add the lock-then-act RPC or `FOR UPDATE` patch as the lead task in the host milestone; pin via a structural meta-test that all three mutations occur in one transaction holding `app_settings` for update.

---

### BL-PICKER-LOCK-ICON-LUCIDIFY — replace U+1F512 emoji with lucide-react Lock in PickerInterstitial

**Filed:** 2026-05-24 from M11.5 §B impeccable v3 attestation (Unit 1 — picker chain audit P2).

**Description:** `_PickerInterstitial.tsx:171` renders the claimed-row lock indicator as the U+1F512 emoji (🔒). The inline comment explicitly justifies the choice as a 16px glyph matching the type rhythm. Audit flagged cross-platform inconsistency: iOS Safari renders Apple Color Emoji, Android Chrome renders Noto, desktop varies. Crew on Android may see a heavier glyph than design intends.

**Why backlog, not deferred:** DESIGN.md §8 ratifies lucide-react for icons, so the structural answer is `<Lock size={16} aria-hidden="true" />` with `aria-label` migrating to the parent span. But the inline rationale is defensible — the lock is the only visual cue paired with the `data-claimed="true"` row treatment, not load-bearing. Picking this up requires a visual regression screenshot pass across iOS Safari + Android Chrome + desktop to confirm the lucide swap is an improvement, not a regression. Speculative until cross-platform screenshots ship.

**Promotion prerequisite:** EITHER (a) cross-platform visual regression suite lands and shows the emoji glyph as a real friction point, OR (b) M11 screenshots set is extended to include the picker page and a lucide swap is part of a broader claimed-row treatment iteration.

**Promotion mechanics:** Trivial swap once accepted: `<Lock size={16} aria-hidden="true" />` + thread the existing `aria-label="IDENTITY_DEACTIVATED_LOCK_HINT" lookup` to the parent `<span>`.

---

### BL-IDENTITYCHIP-SUB390-COLLISION — IdentityChip + page title collision audit at 320px

**Filed:** 2026-05-24 from M11.5 §B impeccable v3 attestation (Unit 3 — post-pick header chrome critique P3).

**Description:** Header.tsx places the IdentityChip as the right-slot when present. The title column gets `min-w-0 flex-1`; the chip column gets `shrink-0 self-start`. At 320px viewport (sub-target), the title + chip could collide depending on title length + chip's name+role string length.

**Why backlog, not deferred:** 390px is the documented mobile primary target (PRODUCT.md "Indoor corporate event environments ... Devices are personal phones (Safari/Chrome, ~390px)"). 320px is out of spec. Crew on a 320px phone would see fold-down behavior or text truncation — annoying but not broken.

**Promotion prerequisite:** EITHER (a) Doug or a crew lead reports a 320px collision in the wild, OR (b) the project's mobile primary target widens to include sub-390px viewports.

**Promotion mechanics:** Likely solution is to allow the right slot to wrap below the title at narrow widths (`flex-col sm:flex-row` on the parent). Test pin via Playwright `setViewportSize({ width: 320 })` boundingbox assertion.

---

### BL-IDENTITYCHIP-SR-SEPARATOR — `<name> · <role>` separator SR experience polish

**Filed:** 2026-05-24 from M11.5 §B impeccable v3 attestation (Unit 3 — post-pick header chrome audit P3).

**Description:** IdentityChip renders `<name>` + `·` separator + `<role>` as flat siblings inside a single span. The `·` is `aria-hidden="true"` so SRs don't announce the punctuation, but they read "Eric Weiss Lead A2" as a flat phrase rather than "Eric Weiss, Lead A2" (proper pause). A `aria-label="Eric Weiss, Lead A2"` on the parent span (or wrapping in a comma-separated visually-hidden duplicate) would tighten the experience.

**Why backlog, not deferred:** The current SR behavior is acceptable per WCAG (no ambiguous content, no missing context). The polish is genuinely speculative — depends on whether SR users complain about the run-on phrasing.

**Promotion prerequisite:** EITHER (a) an a11y audit pass picks it up as part of a broader SR-experience review, OR (b) a crew member reports the issue.

**Promotion mechanics:** Add `aria-label={`${name}, ${role}`}` to the parent `<span>` and visually-hide the middle dot separator. ~3-line edit.

---

### BL-TERMINAL-FAILURE-ICON — visual failure cue beyond muted gray

**Filed:** 2026-05-24 from M11.5 §B impeccable v3 attestation (Unit 2 — TerminalFailure critique LOW).

**Description:** `<TerminalFailure>` uses the muted text-text-strong / text-text-subtle palette and renders as a centered max-w-md block. DESIGN.md §1 correctly bans red/green as primary semantic colors, but the surface has no iconography or shape signal that this IS a failure render. A neutral icon (e.g., lucide-react `AlertCircle` or `CloudOff`) above the h1 would improve glance-ability without violating the color-blind floor.

**Why backlog, not deferred:** The surface is rare in production — only renders on infra-error paths. Crew will encounter it at most a few times per quarter. Adding an icon is a glanceability nicety, not a recovery affordance gap (the new retryHref already closes that).

**Promotion prerequisite:** EITHER (a) a polish pass picks it up as part of a broader auth-surface visual update, OR (b) production telemetry shows TerminalFailure is rendering often enough that glanceability becomes load-bearing.

**Promotion mechanics:** Add an icon (lucide-react `AlertCircle`) above the h1, sized at `--icon-lg` (32px), in `text-text-subtle`. ~5-line edit.

### BL-RATE-LIMIT-SNAPSHOT-DURABILITY — DB-backed snapshot store for rate-limit fixture seed/restore

**Filed:** 2026-05-28 from M12 Phase 0.E close-out §6 finding 3 (R9 durability residual).

**Description:** The `validation:report-fixtures` rate-limit-admin / rate-limit-crew outcomes persist their pre-seed `(prior_count, recorded_hour_bucket, identity)` snapshot to a file-backed store at `.validation-state/rate-limit-{admin,crew}-snapshot.json` (gitignored) so cleanup can restore the exact pre-seed bucket state. A crash in the narrow window **between the rate-limit seed-commit (DB write) and the snapshot-file rewrite** leaves the snapshot stale — cleanup would then restore the wrong count (or the refuse-existing-snapshot guard blocks re-seed until manual file removal). The R-series ratified this as a **zero-impact bound** under the file-backed-only strategy: the window is sub-second, the blast radius is one validation-Supabase rate-limit bucket, and the R43 F39 refuse-existing-snapshot guard + `--force-overwrite-snapshot` escape hatch + unlink-on-cleanup semantics bound the failure to "operator re-runs cleanup with the force flag." No production data is ever at risk (validation Supabase only).

**Why backlog, not deferred:** Fully closing the crash-window requires authorizing a **DB-side snapshot table** so the snapshot write shares the same transaction as the seed-commit (atomic seed+snapshot). That's a **scope expansion beyond M12**: `validation_state` cannot be the backend (its `CHECK (key = 'validation_seed')` singleton constraint rejects any other key, and the table is RLS-locked + REVOKE-locked per R17), so closing this means a new migration adding a dedicated snapshot table + its RLS/REVOKE posture + RPC-gating registry row (per the postgrest-dml-lockdown class-wide invariant) + the harness rewrite to write snapshot-in-transaction. None of that is scoped or planned. The file-backed strategy is the ratified M12 design; this entry exists only so the idea isn't lost if rate-limit fixtures ever prove flaky in practice.

**Promotion prerequisite:** EITHER (a) observed real flakiness from the crash-window during Phase 1 walks or future validation runs, OR (b) a broader validation-tooling-durability milestone that justifies the new snapshot table + its full lockdown posture. Absent either, the file-backed bound stands.

---

### BL-TWO-WAY-SHEET-SYNC — Write corrections back to the source Google Sheet

**Filed:** 2026-06-08, during the "sync changes feed + identity-only gate" brainstorming (`docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-08-sync-changes-feed-identity-gate-design.md`). Surfaced when evaluating whether **undo** could write the old value back to the sheet to keep app and sheet consistent (instead of the chosen "revert + per-entity hold" approach).

**Description:** Today the app is strictly one-directional — Doug's Google Sheet is the source of truth, the app reflects it. A two-way-sync feature would let an admin correction made in the app (e.g. an undo, or a future inline edit) write back into the source sheet, so the sheet and the live pages stay consistent without the app having to "hold/override" the sheet's value across syncs. It would obviate the per-entity `sync_holds` override mechanism for the undo path (the conflict simply wouldn't exist if the sheet were corrected too).

**Why backlog, not deferred — three hard walls (all verified 2026-06-08):**

- **Read-only OAuth scopes.** The app uses `auth/drive.readonly` + `auth/spreadsheets.readonly` (`lib/drive/client.ts`). Write-back needs `auth/spreadsheets` (write) + re-consent + **edit** access to Doug's sheets — a real permission/security/trust escalation.
- **No source-cell provenance.** The parser abstracts the messy human sheet into structured `parse_result` and discards cell/row/range coordinates (`lib/parser/types.ts` `CrewMemberRow` etc. carry no provenance). Writing "Bob" back to "the name cell" requires a reverse field→cell mapping the parser doesn't retain — a significant parser change, brittle against merged cells/formulas/free-form layout.
- **Inverts the product model + new hazards.** "App edits Doug's source data" flips the one-directional trust model and introduces formatting-clobber risk, concurrent-edit races with Doug, and a modified-time feedback loop (app writes → sheet mtime advances → sync re-triggers; needs app-origin-write guards).

**Promotion prerequisite:** Doug (or the operator) explicitly wants genuine two-way sync (e.g. "fixing it in the app should fix my sheet"). It's its own project — scope expansion (write scope + consent), a parser change to retain cell provenance, conflict/feedback-loop handling, and a trust/relationship decision about the app editing source-of-truth sheets. The chosen v1 reconciliation (human fixes the sheet; the app holds the overridden item steady until then) keeps the app in its read-only lane; this entry exists only so the idea isn't lost.

---

### BL-NON-CREW-UNDO — Undo for non-crew feed rows (section shrinkage / field degradation / asset drift)

**Filed:** 2026-06-10 from the shipped "sync changes feed + identity-only gate" milestone (PR #19, `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-08-sync-changes-feed-identity-gate-design.md` §1 non-goals / §7 / finding F6).

**Description:** v1 undo covers **crew-identity** changes only (`crew_added` / `crew_removed` / `crew_renamed`). Non-crew auto-applied changes — MI-7 section shrinkage, MI-8/8b/8c field degradation, asset drift (DIAGRAMS\_\*/REEL_DRIFT) — render as **notification-only** feed rows (`action='none'`, null `before_image`, "edit the sheet to change this" pointer). This entry would extend per-item undo to those rows.

**Why backlog, not deferred — F6 showed it's "not cheap" + no committed trigger:** the undo restore path needs the **pre-apply state** in `before_image`, but the Phase-2 snapshot (`applyShowSnapshot` → `previousCrewMembers`, `lib/sync/runScheduledCronSync.ts:913-932,1088-1100`) captures **prior crew rows ONLY**. It does NOT snapshot prior hotel/room/contact rows, show fields, diagrams, or reel state. Backing non-crew undo requires **widening that prior-state capture** per domain (a real Phase-2 change), plus a domain-specific restore in `undo_change` and the feed's undoable predicate. The approved scope call (#9) was "crew-identity undo first, non-crew only if cheap"; F6 determined non-crew is not cheap.

**Technical home + promotion prerequisite:** widen `applyShowSnapshot`/`before_image` to capture the relevant prior non-crew rows → add the domain to `undo_change`'s direction handling + the feed's `isCrewDomainChangeKind`-style predicate (it currently single-sources `{crew_added,crew_removed,crew_renamed}`). Promote when an operator explicitly wants to undo a non-crew change in-app (rather than re-editing the sheet), and the capture-widening cost is judged worth it.

---

### BL-SYNC-FEED-UI-POLISH — impeccable v3 LOW/no-harm follow-ups (changes-feed UI)

**Filed:** 2026-06-10 from the Phase-6 impeccable v3 dual-gate (gate PASSED; zero HIGH after the Approve-button accent fix; these are LOW / no-user-harm, no concrete trigger — mirrors the BL-B2UI-\* pattern).

- **BL-SYNCFEED-UI-1** — `UndoChangeButton`: post-submit success relies on page revalidation flipping the row to `undone`; consider an `aria-live` region announcing undo success (the failure path already surfaces via `ErrorExplainer`).
- **BL-SYNCFEED-UI-2** — `ChangeFeedBadge`: `title` tooltips are hover-only (desktop); acceptable since the visible text label already carries meaning (color-blind floor met) — only act if touch-discoverability is raised.
- **BL-SYNCFEED-UI-3** — `Disposition` test fixtures pass `{disposition:'removal', name:…}` where the canonical union has no `name` on `removal` (off-type but harmless at runtime; `dispositionName` returns null for removal). Tighten the fixtures if/when the `Disposition` type is hardened.

### BL-EM-DASH-POLICY — Resolve the DESIGN.md §9 em-dash ban vs. shipped usage

**Filed:** 2026-06-13 from the Doug/crew copy audit. Owner decision (2026-06-13): **defer for future consideration after a full review** — do NOT sweep now.

**The conflict:** `DESIGN.md` §9 (and the global `~/.claude/CLAUDE.md` Copy rule) state "No em dashes. Use commas, colons, semicolons, periods, parentheses. Also not `--`." But shipped copy uses em dashes widely and the rule has never been enforced:

- **§12.4 catalog** (`lib/messages/catalog.ts` + the spec §12.4 prose): dozens of `dougFacing`/`crewFacing`/`helpfulContext`/`longExplanation` rows contain `—` (e.g. `SYNC_DELAYED_SEVERE` "Push or cron is stalled — check the dashboard.").
- **Help MDX** (`app/help/**`): 25+ instances across multiple pages.
- **Components**: test-pinned strings include em dashes, e.g. `"Held — not published"` (pinned in `tests/components/admin/ShowsTable.test.tsx`, `tests/app/admin/perShowPage.test.tsx`) and the archive-confirm copy `"Confirm archive — crew links stop working now…"` (pinned in `tests/components/admin/ArchiveShowButton.test.tsx`).

**Two coherent resolutions (pick one during the full review):**

1. **Ratify reality (recommended).** Amend DESIGN.md §9 to permit em dashes in prose copy (optionally keep the ban for headings/eyebrow labels, or drop it entirely). One-line doc change, zero code/test churn. The ban appears inherited from the impeccable skill's defaults rather than chosen for this product; the shipped copy reads well.
2. **Enforce the ban.** A repo-wide sweep replacing every `—` with commas/periods/parentheses. This touches the §12.4 three-way lockstep across dozens of rows (spec prose + `gen:spec-codes` regen + `catalog.ts`), multiple test pins, help MDX, and possibly screenshot baselines if any captured surface renders a dash. Multi-hour, high-churn, and it relitigates copy that passed many M12 adversarial rounds.

**Why backlog, not deferred:** no spec, no plan, no scheduled milestone, no concrete trigger beyond "if/when the owner runs the full copy-voice review." If resolution (2) is ever chosen it should be its own scoped task (lockstep + test-pin updates + a structural guard, e.g. a meta-test banning `—` in `lib/messages/catalog.ts` and `app/help/**`), authored after the §9 decision is made.

**Promotion prerequisite:** owner decision on resolution (1) vs (2). (1) is a trivial DESIGN.md edit, not really a milestone; (2) needs a scoped task with the lockstep + meta-test.

---

## BL-LINT-DEBT-PREEXISTING — ~90 pre-existing eslint errors in unrelated files

**Filed:** 2026-05-31 from M12.2 Phase A close-out.

**Description:** During M12.2 Phase A close-out, `pnpm lint` surfaced ~90 eslint errors across files unrelated to
the M12.2 diff (changed-files lint was clean; the milestone shipped green). These pre-date Phase A and are not a
Phase-A regression. Flagged by the implementer, not fixed (out of scope for a UI reskin).

**Why backlog, not deferred:** no single plan/milestone owns "repo-wide lint debt"; the errors span unrelated
subsystems and fixing them is speculative cleanup with no concrete trigger. A fix would touch code outside any
active milestone's scope.

**Promotion prerequisite:** EITHER (a) a CI lint gate is tightened to fail on these (forcing a cleanup pass), OR
(b) a dedicated repo-hygiene/tech-debt milestone is scoped. Until then, changed-files-lint-clean is the standing
bar (matches the existing per-task discipline). Capture the exact error list at promotion via `pnpm lint`.

---

### BL-CREW-SHEET-TEMPLATE-V2 — Standardized downloadable show-spec template to capture redesign-required fields

**Filed:** 2026-06-15, during the crew-show-page redesign audit (Claude Design handoff bundle `fxav-crew-pages`; design source at `/tmp/design_extract/...` ephemeral, intent recorded in milestone memory). Owner is considering a **downloadable, standardized sheet template** Doug (and future operators) would fill in, so the richer crew-page surfaces have a reliable source instead of depending on organic per-show sheet conventions.

**Context — why this exists:** The redesign assumes a data-rich show page (live run-of-show timeline, call/doors stat strip, full travel itinerary, structured venue/wifi). An audit of **all 7 distinct real sheets** in the `fxav-test-shows` Drive folder (FinTech CTO Summit, Consultants Roundtable, + the 5 other `II -` shows; the `VB##`/`DRILL` sheets are same-size test copies of Consultants Roundtable) showed the organic sheets **do not reliably carry** much of what the design wants. The chosen v1 reconciliation is **Blend**: build on reliably-present data, render honest empty states for the variable fields, drop the truly-absent mock stats. This BACKLOG entry captures the fields a v2 standardized template could promote from "absent / unreliable" to "reliably present," making the full-fidelity design viable.

**Scope — candidate fields for the v2 template (each tagged with its current source reality, verified across the 7 real sheets):**

- **Crew CALL TIME** (labeled) — GENUINELY ABSENT in every sheet today; only Load-in/Set times exist. A template field would make the design's "call" stat real instead of a Load-in remap.
- **DOORS time** (labeled) — GENUINELY ABSENT; only "Registration" prose appears. Template field needed for the doors stat.
- **Hotel room-type** — ABSENT everywhere.
- **Hotel check-in / check-out TIME-of-day** — ABSENT everywhere (only calendar DATES are ever present).
- **Reliably-FILLED AGENDA tab (run-of-show titles/rooms)** — **CORRECTION (2026-06-18, live gsheets-MCP verification):** the earlier "empty in all 7 sheets" claim was WRONG. The AGENDA run-of-show **IS filled in production** for locked shows (verified filled in East Coast + RIA; empty auto-time-skeleton in the not-yet-locked others). **The AGENDA-title PARSER is now SCHEDULED v1 work** — see the Phase-2 spec `specs/v1-pre-deployment-amendments/2026-06-17-crew-page-redesign-phase2-agenda.md` (banner-anchored `parseAgenda` + `shows_internal.run_of_show` + Schedule enrichment). What remains for the **v2 TEMPLATE** is only **standardizing the SOURCE** so the parser has less to fail-soft around: prompt Doug to fill the title cells consistently, a stable banner/column layout, and discrete cells — i.e. making a frequently-but-inconsistently-filled grid uniformly clean. The parser ships in Phase 2; the template just improves source reliability.
- **Per-crew FLIGHT details** (flight #, airport, arrive/depart time) — the AGENDA NAME/ARRIVAL/FLIGHT# columns are blank scaffolding; INFO-level flight data was filled in **exactly 1 of 7** sheets (East Coast SFO). `crew_members.flight_info` is already parsed (`lib/parser/types.ts:71`, `blocks/crew.ts:248`) but usually null and not projected to the crew page. A template field standardizes this.
- **Crew Wi-Fi SSID + password** — reliable in only 2 of 7 (others say "Wifi from Encore" / speed-note only). Already captured as raw free-text under `event_details.internet` (`lib/parser/blocks/event.ts:71`). A template field with discrete SSID/PW cells would make it structured + reliable.
- **Venue street address + loading dock** — present in the older INFO layout, **blank in the newer compact template**. Standardize so it's always filled.
- **Room-within-venue name** — lives in EVENT DETAILS / section headers, not a clean field.
- **Key contacts (client / venue / in-house AV) phone + email** — filled on the older template, blank on the newer compact one; the CONTACTS-tab NUMBER column is always empty. Standardize required contact fields.
- **Parking detail** — present in ~4 of 5; standardize.

**Why backlog, not deferred:** This is a likely-v2 product direction (a downloadable STANDARDIZED TEMPLATE), not committed v1 work. It requires (a) a template-design pass (what the downloadable sheet looks like, how Doug adopts it, migration from organic sheets), (b) a product decision about mandating a template vs tolerating organic sheets, and (c) parser changes to read any **genuinely-new** structured fields the template adds (labeled Call/Doors, hotel room-type/check-in-out time-of-day, discrete Wi-Fi SSID/PW, etc.). **NOTE:** the **AGENDA run-of-show parser is NOT part of this backlog** — it is scheduled v1 work (Phase-2 spec, see the corrected AGENDA bullet above); this entry covers only the TEMPLATE-standardization of the source + the fields that are genuinely absent today. The v1 Blend reconciliation ships without any of it; the design drops/empty-states the genuinely-unreliable fields and parses the AGENDA run-of-show where present. No spec/plan/milestone **for the template** (the AGENDA parser does have one — Phase 2).

**Promotion prerequisite:** EITHER (a) owner decides to formalize the downloadable template as a real v2 feature (template design + adoption plan), OR (b) the v1 redesign ships and operator feedback shows the empty-state surfaces (timeline, wifi, flights, contacts) are a real friction point worth closing at the source. Promotion starts with a brainstorming session on the template shape + the parser contract for any new structured tabs (the AGENDA run-of-show grid contract is already partially mapped in the redesign milestone's deep-read notes).

### BL-CREW-FIELD-ENRICHMENT — Surface already-captured-but-unprojected crew-page fields (flights, Wi-Fi SSID/PW split, room-within-venue)

**Filed:** 2026-06-18, during the crew-page redesign Phase 2 spec adversarial review (R16-MEDIUM). The Phase-1 spec's prose originally lumped several field-enrichments into "Phase 2," but the Phase-2 spec was scoped to **AGENDA run-of-show only**. To single-source the phase boundary (so an implementer can't read Phase-1 as promising Travel-flight work that Phase-2 doesn't deliver), these three field-enrichments are split out here and the Phase-1 references were corrected to point at this item.

**Distinction from `BL-CREW-SHEET-TEMPLATE-V2`:** that entry is about a NEW standardized *source* sheet (making genuinely-absent fields reliably present). THIS entry is about *surfacing fields that the organic sheets already carry* (and the parser already captures or trivially could) but the projection/UI never exposes — no new source needed, just projection + UI + tests.

**Scope (each upgrades a Phase-1 section/empty-state in place):**

- **Per-crew flight surfacing.** `crew_members.flight_info` is already parsed (`lib/parser/types.ts:71`, `lib/parser/blocks/crew.ts:248`) but is **not** in the `ShowForViewer` projection and renders no UI. Add: the projection field, the Travel-section "flights" block (gated like ground transport — only the assigned crew member / admin sees their own flight PII), and a non-null flight test. Filled in ~1 of 7 organic sheets today, so it ships behind an honest empty state.
- **Wi-Fi SSID/PW structured split.** Phase 1 shows the raw `event_details.internet` string in Venue (raw display IS in scope and ships in v1). This item adds a structured SSID/PW parse so the two render as discrete labeled fields. Reliable in only 2 of 7 organic sheets — fail-soft to the raw string when unsplittable.
- **Room-within-venue name** structured capture (lives in EVENT DETAILS / section headers today, not a clean field).

**Why backlog, not deferred:** no committed v1 trigger; these are honest-empty-state enrichments, not gaps that block launch (Phase 1 + Phase 2 ship complete without them). Each needs a small spec/plan (projection + UI + gating + tests). The flight block in particular needs a trust-boundary decision (per-crew flight PII visibility) mirroring `transportTileVisible`.

**Promotion prerequisite:** owner prioritization OR post-launch operator feedback that a specific field (most likely flights) is a real friction point. Promotion starts with a brainstorming session per field (the flight trust boundary is the load-bearing design question).

### BL-CREW-AGENDA-ADMIN-CLEAR — Admin affordance to manually clear a run-of-show (low-priority convenience)

**Filed:** 2026-06-18, crew-page redesign Phase 2 spec adversarial review (R17 → re-scoped R21 → re-scoped again R22). **Re-scoped at R22 (do NOT treat as load-bearing):** the Phase-2 data-retention rule settled on **CONFIRMED-ONLY** (Phase-2 spec D-2 / §4.4 invariants 2-3 / watchpoint 12) — the crew see a day's run-of-show **iff the latest sync confirmed it**; **every** non-confirmed shape (read-empty, unresolved block, OR unlocatable grid) auto-coarsens to the anchor strip on the next sync with the matching admin warning. So **any** intentional removal — blank titles, deleted tab, broken header, changed template — self-resolves via sync; there is **no** lingering-stale crew exposure to remediate (that was the R17/R21 preserve-and-show stance, which R22 closed structurally).

**What's actually left for this item (narrow):** a convenience affordance only — an admin wanting to clear a run-of-show **without** blanking the source sheet (e.g. retract a wrongly-published agenda while leaving the sheet intact). That is a rare workflow; the normal path (blank the sheet → next sync clears) covers intentional removal.

**Scope (if promoted):** an admin affordance on the per-show panel (`app/admin/show/[slug]/`) to clear `shows_internal.run_of_show` (whole-column, or per-day) via a SECURITY DEFINER RPC under the per-show advisory lock (the Phase-2 R16 lockdown REVOKEs anon/authenticated DML on `shows_internal`, so the RPC is the only non-sync write surface).

**Why backlog, not deferred:** no committed v1 trigger; crew-facing stale exposure is **already prevented** by the read-empty auto-clear (R21), so this is purely an admin convenience, not a correctness gap. Lowest priority.

**Promotion prerequisite:** post-launch operator request to retract an agenda without editing the sheet, OR a broader per-show agenda-management pass.

---

### BL-LIBDATA-SUPABASE-CALL-BOUNDARY-METATEST — Structural meta-test for `lib/data` Supabase call-boundary discipline

**Filed:** 2026-06-19, crew-page redesign Phase 2 Task 02.5 (`getShowForViewer.runOfShow` projection).

**Context:** Invariant 9 (Supabase call-boundary discipline) requires every Supabase call site to EITHER carry a structural-meta-test registry row OR an inline `// not-subject-to-meta: <reason>` waiver. The auth-domain meta-test `tests/auth/_metaInfraContract.test.ts` only walks `lib/auth` / `app/auth` / `app/api/auth` / `app/api/show` (orphan scan at `:258-259`), so `lib/data` reads are outside its scan. Task 02.5's new `shows_internal.run_of_show` read in `lib/data/getShowForViewer.ts` discharged invariant 9 via the inline-waiver branch (the verbatim comment immediately above the `.select("run_of_show")` read), backed by behavioral returned-error + thrown-exception fail-soft tests. That is the in-scope discharge; this entry tracks the structural follow-up.

**Scope (if promoted):** an analogous registry-style meta-test (mirroring `_metaInfraContract`'s pattern) that walks `lib/data/**` and asserts every Supabase `.from(...)`/`.rpc(...)` call either (a) destructures `{ data, error }` and distinguishes returned-error from thrown-exception, or (b) carries an inline `// not-subject-to-meta:` waiver. `getShowForViewer.ts` already has multiple such reads (hotel/rooms/transportation/contacts/financials/run_of_show) — the meta-test would pin them all and gate future `lib/data` reads at CI time.

**Why backlog, not deferred:** the inline-waiver discharge is the complete in-scope answer for Phase 2; the structural meta-test is a hardening generalization with no committed v1 trigger. The behavioral fail-soft tests already enforce the boundary per-read; the meta-test would convert that to a class-wide CI guard.

**Promotion prerequisite:** Either (a) a second `lib/data` Supabase read lands without a waiver (real drift), OR (b) a v1.x security-hardening milestone bundles this with the related lockdown / call-boundary entries (`BL-ADMIN-POSTGREST-DML-LOCKDOWN`, `BL-RLS-COVERAGE-CROSSCUTTING`). Extend the `_metaInfraContract` pattern, don't write a parallel scanner.

---

## Promoted (was backlog, now scheduled)

_(empty — no items have been promoted yet)_

---

## Items considered for backlog but NOT included

These were on the deferred-vs-backlog audit list (2026-05-19) but determined to be genuine deferrals, not speculative future work. They stay in their plan's DEFERRED.md:

- **M2-D3** (`transportation.show_id` single-row uniqueness) — concrete trigger ("real multi-driver fixture surfaces"); spec question with a clear answer mechanism.
- **M2-D5** (seed hardcoded restage filename) — has a clear technical home ("next seed touch") even if the trigger hasn't fired.
- **M4-D1** (parser canonical-key probe) — clear technical home ("M1 follow-up touch OR cross-cutting key-canonicalization task").
- **M5-D7** (accent button atom) — concrete trigger (4th accent button variant materializes; YAGNI gate).
- **M9-D-C6c-1** (pinch-zoom discoverability hint) — declined with concrete re-open trigger ("FXAV crew explicitly identifies pinch-discovery friction").

## M12.2 B2 UI polish (impeccable v3 dual-gate deferrals, 2026-06-02)

Speculative finish polish from the B2 UI external impeccable attestation (gate PASSED, zero HIGH/P0/P1; these are LOW/P3 with no user-facing harm, no concrete trigger). Dispositions also in the B2 handoff §12.

- **BACKLOG-B2UI-1** — `DashboardBucketSegmentedControl`: disabled "Archived (0)" segment can read as clickable-but-dead on first encounter; consider `title="No archived shows"`.
- **BACKLOG-B2UI-2** — `ArchiveShowButton`: two `min-w-[18rem]` arbitrary literals; tokenize (sibling of the shipped `--spacing-confirm-box`) or accept the one-off button-pair width.
- **BACKLOG-B2UI-3** — `ArchiveShowButton`: armed confirm button's `hover:bg-warning-bg` equals its resting bg (no hover feedback); add a distinct `hover` token.

## BL-ADMIN-BADGE-CONTRAST-TOKEN — badge token pair + nav polish batch

Filed 2026-06-10 (mobile needs-attention milestone impeccable dispositions). Project-wide badge token pair (accent-bg badges are ~2.3:1 white-on-#FF8C1A at 12px; e.g. #C25E00 bg ≈4.9:1 AA) applied to BOTH `NotifBell` and the attention-tab badge in the same change. Fold in two P3/LOW polish items from the same gate run: summary-card zero-state copy redundancy (`NeedsAttentionSummaryCard` "All caught up" + "Nothing waiting on you." say the same thing) and `app/admin/layout.tsx` serial `fetchUnresolvedAlertCount` → `loadNeedsAttentionCount` awaits (Promise.all saves a round-trip per admin render). Technical home: `app/globals.css` @theme token pair + the two badge components + layout. No trigger; speculative polish.

## BL-ADMIN-NOJS-LOADING-CONFLICT — no-JS contract vs loading.tsx streaming

Filed 2026-06-10 (discovered during mobile needs-attention T5 e2e run; pre-existing since M12.11 `f2f7f7b4`). The `admin-banner.spec.ts` "no-JS native summary" e2e fails on main: with `javaScriptEnabled:false` the admin dashboard never leaves the `app/admin/loading.tsx` skeleton because React streams suspense content into a hidden div swapped by an inline `$RC()` script that needs JS. No CI workflow runs Playwright, so it went unnoticed. Structurally: the no-JS banner contract and instant loading skeletons are incompatible as shipped. Options when picked up: drop the no-JS contract test, gate loading.tsx behind JS detection (not really possible server-side), or accept skeleton-only no-JS rendering and retarget the test. Technical home: `tests/e2e/admin-banner.spec.ts:261` + `app/admin/loading.tsx`.

## BL-NEEDS-ATTENTION-DARK-CAPTURE-FLAKE — nondeterministic dark-mode screenshot baseline — **RESOLVED 2026-06-11 (PR #22, 709d4b6a)**

**Resolved** the same day it was filed, by the deferred-easy-wins PR #22 drift-gate investigation (which hit the same flake 3/3 on its own runs and root-caused it). Diagnosis matched this entry's "when picked up" plan: a new artifact-upload-on-failure step in `screenshots-drift.yml` made the failing bytes downloadable; pixel-diff showed 253 px at max channel delta 6/255 (sub-perceptual raster jitter, full-width band y136-254) — **runner-class bimodality**, not a UI change: loaded `pull_request` runners rendered ±LSB differently than idle `workflow_dispatch`/local runners (signature: drift gate failed while `screenshots-regen` reported "no baseline changes" on identical content). Fixes shipped in PR #22: (a) `waitForQuiescence` gains `document.fonts.ready` + double-rAF paint settle (M11-A-D5 recipe); (b) raster-path launch flags `--disable-gpu --disable-partial-raster --force-color-profile=srgb` via shared `scripts/capture-launch-args.ts`, consumed by `captureAll()`'s own `chromium.launch` AND both Playwright configs (Codex R2/R3 caught two launch paths the flags weren't reaching); (c) the dark baseline regenerated from CI's own bytes via the sanctioned `screenshots-regen` dispatch (`683df34a`); (d) the artifact upload stays, so any future drift is diagnosable. Drift gate green on the re-baselined head under a loaded PR runner. Memory: `feedback_screenshot_capture_runner_bimodality.md` (Opus-internal). Original entry retained below for the record.

_Original entry:_ Filed 2026-06-11. `needs-attention-mobile-dark.webp` is bimodally nondeterministic in CI's drift capture: PR #20 passed first-try, PR #21 failed → rerun passed, PR #23 failed → rerun (this entry filed while pending). Light variant has never flaked. The drift gate is starting to cry wolf — every unrelated PR pays a rerun. When picked up: diff the two CI byte-variants (download artifacts from a failing + passing run) to identify the unstable pixels (suspects: dark-mode font rasterization on the empty-state card, AlertBanner async settle, missing `expectStableMs`/`waitFor` on the manifest entry — `scripts/help-screenshots.manifest.ts` `needs-attention-mobile` has neither while the capture runner supports both); then either stabilize the capture (waitFor + expectStableMs) or, if the instability is encoder-level, regenerate the dark baseline from CI's own modal bytes and add a retry-compare to the drift job. Technical home: `scripts/help-screenshots.manifest.ts` + the drift workflow.

## BL-PROJECTION-ALERT-VIEWER-INDEPENDENT-PROBE — true viewer-independent financials/lead-only alerting — **filed 2026-06-17 (crew-page redesign Phase 1 spec R44)**

The Phase 1 crew-page projection alert (`TILE_PROJECTION_FETCH_FAILED`, §4.13 of `specs/v1-pre-deployment-amendments/2026-06-15-crew-page-redesign-phase1-design.md`) records, per render, the `tileErrors` keys that render observed, and the dedup RPC union-merges across renders. Because `getShowForViewer` skips the `shows_internal` query unless `isLead` (`lib/data/getShowForViewer.ts:473-505`), a **non-lead render cannot observe a `financials` fetch failure** — so a `financials`/lead-only-domain outage with **non-lead-only crew-page traffic** is not alerted until a lead/admin renders. This is the **accepted v1 contract** ("union-by-accumulation"), and it is **not a regression** — today's `financials` alert already comes from the lead-gated `FinancialsTile` fallback. If true per-render viewer-independence is later wanted: add a **status-only admin-observability probe** that records each domain's fetch success/failure on every render **without returning the gated data to non-leads** (e.g. a service-role fetch-status check, or surfacing the failure through the data-sync path), and test it through the real projection path. Out of scope for v1; admins also have the dashboard's independent infra signals (drive-health, sync alerts). Technical home: `lib/data/getShowForViewer.ts` + the §4.13 projection-alert contract.
## BL-DIAGRAMS-EMBEDDED-SOURCE — embedded-image diagrams need a feasible source

Filed 2026-06-12 (production-bug fix `fix/sheets-drawings-fields-mask`). The cron adapter's `listSpreadsheetSheets` originally projected `sheets(...,drawings(objectId,imageProperties(...),embeddedObject(...)))` — but the Sheets v4 `Sheet` schema defines **no `drawings` field**, so the live API rejected every `spreadsheets.get` with 400 INVALID_ARGUMENT and every cron full re-parse of a real show failed as `SYNC_FILE_FAILED`. The fix narrowed the mask to `sheets(properties(title))` and the adapter now always returns `embeddedObjects: []`; `extractEmbeddedImages` degrades honestly (`DIAGRAMS_EMBEDDED_NONE_FOUND` warning / linked-folder fallback), and the linked-folder path remains the only working diagrams source. Net: floating images embedded directly in the DIAGRAMS tab are **unreachable** — Sheets v4 cannot enumerate drawings/floating images via any read API. Candidate when picked up: extract images from the XLSX export the sync already fetches (see `synthesizeMarkdownFromXlsx` / `lib/drive/fetch.ts` — xlsx media parts carry embedded images), mapping them into the existing `SpreadsheetEmbeddedObject` contract; alternatives (Drawings API, Apps Script shim) are heavier. Technical home: `lib/sync/runScheduledCronSync.ts` `defaultDriveClient.listSpreadsheetSheets` + `lib/sync/enrichWithDrivePins.ts` `extractEmbeddedImages`; contract pinned by `tests/sync/defaultDriveClientSheetsFieldsMask.test.ts` + the live smoke `tests/sync/realSheetsListSpreadsheetSheetsSmoke.test.ts`. No trigger — the linked-folder fallback covers Doug's workflow today; promote only if embedded-in-tab diagrams become a real operator need.
