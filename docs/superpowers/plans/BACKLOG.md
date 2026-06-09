# Possible Future Work (Backlog)

Speculative work items that **may** become real milestones if and when they're scoped and planned. **Not** currently scheduled work.

## What goes here vs DEFERRED.md

- **`DEFERRED.md`** (per-plan) — work that WILL be done. Has a concrete trigger (e.g., "when seed is next touched") OR is blocked on a planned future milestone (e.g., M11 X.* cross-cutting audit). Every entry has a scheduled or trigger-based home.
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

- Relocate / extend to `tests/cross-cutting/rls-coverage.test.ts` under the X.* lineage pattern (regression fixtures, audit-derives-from-spec, CI gate exposure).
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

**Promotion prerequisite:** Either (a) FXAV feedback flags the workflow as a real friction point, OR (b) a v1.x admin-UX polish milestone bundles this with the other BL-ADMIN-* entries.

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

**Promotion prerequisite:** Either (a) a future X.* cross-cutting touch surfaces the gap (e.g., a follow-on widening that introspects all canonical CHECKs at once), OR (b) explicit decision to add a parity meta-test under `tests/cross-cutting/`. Either path is small (under half a day) once scoped — but neither is in-scope for any currently planned milestone.

### BL-ADMIN-POSTGREST-DML-LOCKDOWN — Revoke table-level DML on remaining admin-only tables so SECURITY DEFINER RPCs are the sole mutation gate

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

**Description:** IdentityChip renders `<name>` + ` · ` separator + `<role>` as flat siblings inside a single span. The `·` is `aria-hidden="true"` so SRs don't announce the punctuation, but they read "Eric Weiss Lead A2" as a flat phrase rather than "Eric Weiss, Lead A2" (proper pause). A `aria-label="Eric Weiss, Lead A2"` on the parent span (or wrapping in a comma-separated visually-hidden duplicate) would tighten the experience.

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

**Filed:** 2026-06-08, during the "sync changes feed + identity-only gate" brainstorming (`docs/superpowers/specs/2026-06-08-sync-changes-feed-identity-gate-design.md`). Surfaced when evaluating whether **undo** could write the old value back to the sheet to keep app and sheet consistent (instead of the chosen "revert + per-entity hold" approach).

**Description:** Today the app is strictly one-directional — Doug's Google Sheet is the source of truth, the app reflects it. A two-way-sync feature would let an admin correction made in the app (e.g. an undo, or a future inline edit) write back into the source sheet, so the sheet and the live pages stay consistent without the app having to "hold/override" the sheet's value across syncs. It would obviate the per-entity `sync_holds` override mechanism for the undo path (the conflict simply wouldn't exist if the sheet were corrected too).

**Why backlog, not deferred — three hard walls (all verified 2026-06-08):**
- **Read-only OAuth scopes.** The app uses `auth/drive.readonly` + `auth/spreadsheets.readonly` (`lib/drive/client.ts`). Write-back needs `auth/spreadsheets` (write) + re-consent + **edit** access to Doug's sheets — a real permission/security/trust escalation.
- **No source-cell provenance.** The parser abstracts the messy human sheet into structured `parse_result` and discards cell/row/range coordinates (`lib/parser/types.ts` `CrewMemberRow` etc. carry no provenance). Writing "Bob" back to "the name cell" requires a reverse field→cell mapping the parser doesn't retain — a significant parser change, brittle against merged cells/formulas/free-form layout.
- **Inverts the product model + new hazards.** "App edits Doug's source data" flips the one-directional trust model and introduces formatting-clobber risk, concurrent-edit races with Doug, and a modified-time feedback loop (app writes → sheet mtime advances → sync re-triggers; needs app-origin-write guards).

**Promotion prerequisite:** Doug (or the operator) explicitly wants genuine two-way sync (e.g. "fixing it in the app should fix my sheet"). It's its own project — scope expansion (write scope + consent), a parser change to retain cell provenance, conflict/feedback-loop handling, and a trust/relationship decision about the app editing source-of-truth sheets. The chosen v1 reconciliation (human fixes the sheet; the app holds the overridden item steady until then) keeps the app in its read-only lane; this entry exists only so the idea isn't lost.

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
