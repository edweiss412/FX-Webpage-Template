# Deferred Items Log

Non-blocking findings from milestone adversarial reviews that were intentionally deferred rather than fixed in-milestone. Each item names a suggested home milestone where it should be picked up. **This is not a TODO list to clear automatically** — every entry has context for why it was deferred and where the right place to address it is.

When picking up a deferred item:

1. Move it from "Open" to "In progress" with the milestone it landed in.
2. Resolve it in that milestone's handoff doc convergence log.
3. Update the row to "Resolved" with the commit SHA + milestone reference.

**De facto practice (codified post-M9):** small-scope items resolved in the same milestone they were deferred under MAY stay physically in the `## Open` section with `— **RESOLVED <date>**` suffixed to the heading + a Status: Resolved bullet. The single source of truth for "is this open?" is the heading suffix, NOT section placement. This matches the existing M6-D12 / M7-D4 / M9-D-C1-2 / M9-D-C9-1 / M9-D-C4-1 / M2-D2 / M2-D1 pattern. Larger items that resolved in a DIFFERENT milestone (e.g., M6-D12 which closed in M6.5 coda) move to `## Resolved`. Grep `RESOLVED` to find every resolved entry regardless of section.

---

## Open

### M10-D-PHASE3-1 — `/api/report` auth precedence (admin preview reports can downgrade to crew)

**Source:** M10 §B Phase 3 adversarial review, Codex R6 (commit `259fb6f`).
**Description:** `app/api/report/route.ts` accepts a valid link / Google session before it checks `requireAdminIdentity`, so an admin previewing a show in a browser that ALSO carries a valid crew session for the same show submits the "Report this view" POST with `auth.kind === "crew"` despite the client setting `surface: "admin"` + `crewPreview` autocapture. `submitReport` then builds the crew issue body, omits `crewPreview`, labels it `reporter:crew`, and withholds the GitHub URL from the admin's modal. The Phase 3 §B client surfaces are correct (the override + autocapture are wired through both PreviewBanner and Footer); the downgrade happens server-side at the auth-ordering boundary.
**Why deferred:** `app/api/report/route.ts` is §A territory per AGENTS.md §1.8 — Phase 3 §B owns components/ and app/ except app/api/. The fix is to give admin identity precedence on `surface === "admin"` POSTs (or unconditionally prefer `requireAdminIdentity` when it succeeds), then add a regression covering the mixed-session case. This belongs in §A's M10 admin-report-surface tasks rather than a §B retrofit.
**Suggested home:** §A picks up alongside any future preview/report touch in M10 close-out OR M11 ops-hardening. Add a route-level test: `surface === "admin"` + `validateLinkSession` returns success + `requireAdminIdentity` returns success → asserted `submitReport` receives `{ kind: "admin" }` with `crewPreview` intact.

### M10-D-PHASE2-1 — Cluster I-5 impersonation / preview-as

**Source:** M10 §B Phase 2 implementation, 2026-05-18 critical-path-first delivery decision.
**Description:** Cluster I-5 per plan §M10 Task 10.8: `app/admin/show/[slug]/preview/[crewId]/page.tsx` Server Component preview-as + `components/admin/PreviewBanner.tsx` sticky banner + a third `Viewer` kind (`'admin_preview'`) on the locked `getShowForViewer` signature. Phase 2 ships the wizard end-to-end (Step 2 verify + Step 3 review + finalize loop + finalize re-entry) plus the post-onboarding Dashboard (active shows + pending panel + per-show alerts), all of which are on Doug's critical path. Preview-as is admin tooling that Doug does NOT need to complete first-onboarding or steady-state operation.
**Why deferred:** The "third Viewer kind" requires extending `getShowForViewer` in `lib/` — §A territory. The full preview surface also requires rendering the crew-page view from an admin identity, which crosses M4 (crew-page) and M5 (auth) abstractions. Phase 2's scope was already dominated by the wizard finalize loop + re-entry dispatcher; preview-as was triaged out.
**Suggested home:** Phase 3 (after the rest of M10 §B closes). Implementation steps: (a) §A extends `getShowForViewer` with `admin_preview` Viewer kind (Pin-3 contract); (b) §B authors the preview page + banner.

### M10-D-PHASE2-2 — Cluster I-6 help / tour / ErrorExplainer + helpfulContext fill-in

**Source:** Same as M10-D-PHASE2-1.
**Description:** Cluster I-6 per plan §M10 Task 10.9 + §9.0.1: `components/admin/HelpTooltip.tsx` + `components/admin/Tour.tsx` + `components/admin/ErrorExplainer.tsx` (the latter already exists at `components/messages/ErrorExplainer.tsx` from M5/M7 — would be extended for admin surfaces). Plus `helpfulContext` fill-in for any M10 catalog codes that don't already have one.
**Why deferred:** Help/tour/ErrorExplainer are quality-of-life polish — they don't block the operator's onboarding or steady-state flow. Every M10-§B-emitted code already has Doug-facing copy via `messageFor()` (AGENTS.md §1.5 invariant holds without this cluster). The "Take the tour" affordance per spec §9.0.1 is post-onboarding polish.
**Suggested home:** Phase 3. Implementation includes: (a) `helpfulContext` audit pass of M10 catalog codes; (b) `<HelpTooltip />` mounted next to every section header on the dashboard + per-show page; (c) `<Tour />` linked from the dashboard footer; (d) Resolve M10-D-PHASE1-1 (ONBOARDING_OPERATOR_ERROR durable notification — Sentry + admin-visible banner wiring) at the same time since the admin_alerts producer surface gets touched.

### M10-D-PHASE1-1 — ONBOARDING_OPERATOR_ERROR durable notification (Sentry + admin-visible banner)

**Source:** M10 §B Phase 1 cross-model adversarial review (Codex R1, 2026-05-17). Single MEDIUM finding routed against the §B Phase 1 wizard cluster.
**Description:** The wizard's operator-error fallback path (`components/admin/OnboardingWizard.tsx` `OperatorErrorBlock`) renders the §12.4 `ONBOARDING_OPERATOR_ERROR` Doug-facing copy whenever `GOOGLE_SERVICE_ACCOUNT_JSON` is missing, malformed, or lacks `client_email`. Spec §9.0 step 2 reserves a paired Sentry alert + admin-visible banner for the operator-error path (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md:2486-2489`). Phase 1 ships the inline Doug-facing surface only — no Sentry call, no `admin_alerts` row, no admin-visible banner producer. Phase 1's catalog entry was softened in R1 so the Doug-facing copy ("Please contact the developer to fix this") does not falsely claim notification was sent; the durable notification path is the deferral.
**Why deferred:** The Phase 1 surface is the wizard step-1 / env-broken edge case (a server-side configuration regression — Doug never causes it). Wiring the durable notification path requires (a) an `admin_alerts` upsert producer keyed on `ONBOARDING_OPERATOR_ERROR` with the existing single-active-row-per-code idempotency pattern, (b) an entry in `tests/messages/_metaAdminAlertCatalog.test.ts` registering the new producer, (c) a Sentry/Bug-pipeline call site, (d) AlertBanner visibility on `/admin/settings` so Eric sees the alert when he comes back. (a) + (b) cleanly belong with the rest of the M10 admin-alerts producer work landing in Phase 2 / Phase 3 (alongside the FinalizeInProgress / Dashboard surfaces). (c) + (d) reuse existing M8 / M9 infrastructure — small scope but cleaner to land in one commit with (a) + (b).
**Suggested home:** M10 Phase 2 (paired with `<FinalizeInProgress>` and the cleanup-abandoned-finalize affordance, both of which need `admin_alerts` producers as well) OR M10 Phase 3 (paired with the Dashboard `AdminAlertsBanner` so the banner-visibility wiring lands in one commit). Either is appropriate — pick whichever phase opens the admin_alerts producer surface first.

### M6-D1 — Push notification surface (operator-facing)

**Source:** Conversation thread 2026-05-09 following ratification of plan amendments 7 + 8 (MI-8/MI-8b debounce, MI-9 LEAD-bit narrowing). Triggered by the observation that the spec's MI staging system requires Doug to check the dashboard to discover staged events, but Doug's natural surface is Drive — not the dashboard.
**Description:** The spec currently has zero push surface. Every staging event (FIRST_SEEN_REVIEW, MI-6..MI-14, MI-1..MI-5b hard fails on existing shows) is functionally invisible to Doug until he visits the dashboard. The MI staging system is calibrated for an operator who isn't watching for it. A push surface (email primary; SMS/webhook optional) is required to close the loop. Design memo: [`notification-design-memo.md`](./notification-design-memo.md) — captures six load-bearing principles (push-not-pull, severity tiering, push-debounce, coalescing, quiet success, two-way feedback), a concrete design sketch with schema additions and route shapes, and integration with the existing M8 report pipeline. Doug-validation questions consolidated in [`doug-validation-questions.md`](./doug-validation-questions.md) (§4 channels/timing, §5 feedback/communication, plus §1–§3 covering the workflow questions the push design depends on).
**Why deferred:** Out of M6–M10 scope; the core sync + admin + onboarding surfaces need to stabilize first. Push depends on a real email-provider integration (Resend / Postmark / SES) and on Doug's actual workflow being observed, not assumed. The design memo also notes that the MI-8/MI-8b modtime-stability debounce ratified in plan amendment 7 becomes redundant once push-debounce lands — both achieve the same anti-spam UX outcome from different layers.
**Suggested home:** New milestone (M11+ or post-v1) once core sync + admin surfaces stabilize. Spec amendment + dedicated milestone plan rather than retrofit into an existing milestone — the surface is too cross-cutting (schema, routes, email provider, report-pipeline integration, action-token signing) for a sub-milestone task.

### M2-D1 — Hardcoded admin allow-list rotation — **RESOLVED 2026-05-17**

**Status:** **Resolved.** Shipped via M9 Cluster C9 (commits `e060766` through `c8281a9` covering the full convergence loop; final commits `4e438b0` + `72af2f1` for the impeccable critique+audit polish; spec integration in `f669e18`). Ratified spec amendment at `docs/superpowers/specs/amendments/2026-05-14-admin-allowlist-runtime-mutable.md` retires the migration-hardcoded array + zombie `ADMIN_EMAILS` env var; replaces with `public.admin_emails` table + two atomic SECURITY DEFINER RPCs (`upsert_admin_email_rpc` + `revoke_admin_email_rpc`) holding `pg_advisory_xact_lock` + `/admin/settings/admins` CRUD UI. JWT-role override arm preserved verbatim. SELECT-only grant + `for select` policy for authenticated; mutations route exclusively through the RPCs which enforce `is_admin()` + last-admin-lockout + email-shape validation. Canonical spec §14.3 row retired with cross-reference; 00-overview.md ratified-amendments index updated. Eleven adversarial-review rounds + impeccable dual-gate + final-review whole-M9 R1/R2 all closed.

**Source:** M2 adversarial review, Round 1 advisory note.
**Original description:** admin allow-list HARDCODED IN A POSTGRES MIGRATION (`supabase/migrations/20260501002000_rls_policies.sql:23-37`); no rotation procedure, audit trail, or in-product UX. Only path was "edit migration, deploy."

### M2-D2 — Static-vs-runtime breadth for the 21 admin-table RLS matrix — **RESOLVED 2026-05-17**

**Status:** **Resolved.** `tests/db/admin-rls-runtime.test.ts` shipped with `tests/db/admin-rls-runtime.baseline.json` (M9 final-review R2 fix; R3 strengthening at `69d4c6f`). Probe DERIVES the Class A admin_only FOR ALL table list from `pg_policies` at runtime (so a future migration that adds a 22nd table automatically enters the matrix). Per-table gates: BEHAVIORAL admin/non-admin SELECT + STRUCTURAL qual ILIKE '%is_admin()%' + with_check ILIKE '%is_admin()%' + cmd=ALL + qual=with_check predicate-equivalence. Closes the M2-D2 worry — a future migration that silently drops or weakens an admin policy trips EITHER the SELECT-returns-0 behavioral OR the structural-predicate-equivalence assertion on the affected table OR the baseline-mismatch gate. INSERT/UPDATE/DELETE verbs are NOT directly probed (see Coverage paragraph below for the rationale).

**Coverage (post-R3 strengthening at commit `69d4c6f`):**
- BEHAVIORAL: 21 tables × 2 roles × SELECT verb = 42 assertions (admin sees rows without RLS denial; non-admin gets 0 rows).
- STRUCTURAL: 21 tables × 2 gates (qual+with_check + cmd=ALL + qual=with_check predicate-equivalence) = 63 cells across 3 test.each blocks.
- META: 1 derived-count assertion + 1 baseline-equality assertion = 65 total cells.
- The v1 R2 probe attempted per-table DEFAULT VALUES INSERT but false-passed when NOT NULL constraints fired before RLS (caught by R3). R3 replaced the INSERT behavioral with structural pinning of qual + with_check + their equivalence — for FOR ALL admin_only policies one predicate gates every verb, so structural-equivalence + the SELECT behavioral proves the write paths are gated without needing per-table INSERT payload fixtures.
- admin_emails is excluded (it has its own FOR SELECT policy under C9's SELECT-only grant pattern, exhaustively covered in `tests/db/admin-emails.test.ts`).
- Class B (crew-readable `admin_insert`/`admin_update`/`admin_delete`) is out of scope for this probe — exercising the crew-session-bound SELECT branch requires fixture infrastructure not yet built; the existing `tests/db/rls.test.ts` text-based policy audit mitigates that gap.

**Source:** M2 adversarial review, Round 1 advisory note. Pulled into C9 at Task 9.C9.0.5 per M9-polish handoff §A.9.C9.0.5; surfaced AGAIN at M9 final-review R2 as the missing artifact. Built in the same session.

### M2-D3 — `transportation.show_id` single-row uniqueness model

**Source:** M2 adversarial review, Round 1 advisory note
**Description:** Schema treats `(show_id)` as the unique key on `transportation`, allowing only one transport row per show. Spec §4 / parser output supports a single transport block per show, but production-shaped sheets sometimes carry multiple drivers/vehicles per show.
**Why deferred:** Matches current spec + parser. Changing it requires a spec amendment, not a fix-in-place. Until a real fixture demands multi-driver, the constraint is intentional.
**Suggested home:** Treat as a spec question. If/when a fixture surfaces with multi-driver, open a brainstorming session for a spec amendment, then schema-bump in a new migration (NOT an edit of the M2 file).

### M2-D4 — Missing introspection pin for `crew_members_show_id_name_key`

**Source:** M2 adversarial review, Round 1 advisory note
**Description:** The `crew_members_show_id_name_key` named unique constraint exists in the migration but is not asserted by name in `tests/db/schema-introspection.test.ts`. Other named constraints in the same table are pinned.
**Why deferred:** Cosmetic — the constraint is in place and functions correctly; it's just missing from the introspection allow-list. Unlikely to drift in isolation.
**Suggested home:** Fold into the next M2-touching change (e.g., when M5/M6 add code that depends on the constraint). One-line test addition.

### M2-D5 — Seed's hardcoded restage fixture filename

**Source:** M2 adversarial review, Round 1 advisory note
**Description:** `supabase/seed.ts` hardcodes a specific raw-fixture filename for the restage scenario rather than deriving it from `fixtures/shows/raw/`. If that fixture is renamed or replaced, seed silently breaks.
**Why deferred:** Works against today's fixture set. The general fix (glob + filter) is mild refactoring that's easier to do alongside the next seed change rather than in isolation.
**Suggested home:** Whenever seed is next touched (likely during M4 tile development when a new fixture variant is needed for testing).

### M4-D1 — ShowStatusTile event_details key probing should route through parser canonical-key authority

**Source:** M4 catch-up code-quality review, 2026-05-03 Important Minor 2
**Description:** `components/tiles/ShowStatusTile.tsx` probes for the dress-code value across stringly-typed key candidates `["dress_code", "dress code", "dress", "attire"]`. Tile should consume the canonical key only; parser should expose a `CANONICAL_KEY_MAP` (or similar) that decides the variant collapse upstream.
**Why deferred:** Crosses into M1-parser territory. Out of M4 catch-up scope; the tile-side variant-tolerant probe is acceptable until the parser exposes canonical keys.
**Suggested home:** M1 follow-up touch OR a cross-cutting key-canonicalization task. When picked up, simplify the tile to read `event_details.dress_code` only, parser-side guarantees the canonical form.

### M4-D2 — Tile reorder by persona urgency — **RESOLVED 2026-05-17 via M9 Cluster C1**

**Status:** Resolved. Shipped in M9 Cluster C1 (Crew-page IA redesign). See `handoffs/M9-polish.md` §Convergence log → Cluster C1 (R8 APPROVE). TODAY-band promotion + visibility-aware filter + sm:grid-cols-2 stretch test landed across the 4 C1 commits documented in the handoff.

**Source (original):**

**Source:** M4 catch-up `/impeccable critique`, 2026-05-03 (Finding 1 HIGH)
**Description:** Tile mount order in `app/show/[slug]/page.tsx` is parser-output order (Lodging→Venue→Crew→Contacts→Schedule→Audio→Video→Lighting→Transport→ShowStatus→Financials→PackList→Notes). Crew on the venue floor scans top-to-bottom; the answer to "what's my call time" (ScheduleTile + relevant scope tile) sits buried 5+ tiles in. PackListTile (set/strike-day primary answer) renders 12th.
**Why deferred:** Reorder is a UX/IA judgment call that benefits from a proper `/impeccable shape` session — the canonical v3 flow we skipped on this milestone. Doing it under M4 close-out pressure would risk a parser-order-to-persona-order refactor without the design context.
**Suggested home:** M9 polish with explicit `/impeccable shape <crew page reorder>` session before crafting. Group tiles by Today / Logistics / People / Reference, OR introduce a "Today" cluster that promotes 1-2 today-relevant tiles above the general grid.

### M4-D3 — Header weight competes with RightNowCard for the page hero — **RESOLVED 2026-05-17 via M9 Cluster C1**

**Status:** Resolved in M9 Cluster C1 (commit `c68a60b` per handoff convergence log R2 row: "Header eyebrow gated on truthy client_label").

**Source (original):**

**Source:** M4 catch-up `/impeccable critique`, 2026-05-03 (Finding 5 MEDIUM)
**Description:** `components/layout/Header.tsx` show title is `text-2xl sm:text-3xl font-bold` — same scale as the RightNowCard lead. The eyebrow `client_label` is the same `text-xs uppercase` as every tile heading. Result: header competes visually with both the hero card and the tile grid; nothing dominates.
**Why deferred:** Visual-rebalance call that benefits from a `/impeccable shape` session.
**Suggested home:** M9 polish. Either shrink the header (smaller title, condense to a sticky-thin bar) so the RightNowCard wins the page's primary moment unambiguously, OR commit to header-as-context (smaller title, drop the orange hairline which fights the RightNowCard's accent dot for the eye).

### M4-D4 — RightNowCard data-\* test attribute relocation — **RESOLVED 2026-05-17 via M9 Cluster C1**

**Status:** Resolved in M9 Cluster C1 (commit `9c5b98a` in recent log: "relocate RightNowCard debug attributes off AT-traversed p (M4-D4)").

**Source (original):**

**Source:** M4 catch-up `/impeccable critique`, 2026-05-03 (Finding 6 MEDIUM)
**Description:** `components/right-now/RightNowCard.tsx` carries 3 `data-*` test attributes (`data-state`, `data-rendered-state`, `data-treatment`) on a screen-reader-traversed `<p>`. Over-instrumented for a hero element.
**Why deferred:** Relocation requires updating the e2e tests that read these attributes (transition matrix, AC-4.3 tests). Mechanical but non-trivial; safer to do alongside the broader M9 polish pass.
**Suggested home:** M9 polish. Move test-only attributes onto a sibling `<span data-testid="right-now-debug" hidden>` outside the AT tree. Update e2e tests at the same time.

### M4-D5 — `--tracking-eyebrow` token consolidation — **RESOLVED 2026-05-17 via M9 Cluster C2**

**Status:** Resolved in M9 Cluster C2 (Tokens). See `handoffs/M9-polish.md` §Convergence log → Cluster C2 (R4 APPROVE).

**Source (original):**

**Source:** M4 catch-up `/impeccable critique`, 2026-05-03 (Finding 7 LOW)
**Description:** Five different `tracking-[...]` values for uppercase eyebrows across Section + KeyValue + Header + RightNowCard + Footer (`0.12em` / `0.14em` / `0.18em` / `0.22em` / inline arbitrary values). Token-discipline contract violation — inline arbitrary values where a named token would unify the spec.
**Why deferred:** LOW finding; cosmetic. Easy to do but not blocking anything.
**Suggested home:** M9 polish. Add `--tracking-eyebrow` (and maybe `-eyebrow-strong`) to `app/globals.css` `@theme`, document in DESIGN.md §2, replace the 5 inline values.

### M4-D6 — `tests/e2e/crew-page.spec.ts:118` desktop-chromium viewport bug — **RESOLVED 2026-05-17 via M9 Cluster C1**

**Status:** Resolved in M9 Cluster C1 (commit `fe16928` per recent git log: "pin mobile viewport for tile-grid 2-col assertion (M4-D6)").

**Source (original):**

**Source:** Task 4.13 spec compliance review, 2026-05-03 (pre-existing failure flagged)
**Description:** Task 4.2's `crew-page.spec.ts:118` test asserts 2-col grid without `setViewportSize(390, ...)`. On `desktop-chromium` (1280×800 default) the grid renders 4 cols, so the assertion fails. Pre-existing failure introduced at commit `c518006` (predates Task 4.13). The current `playwright.config.ts` testMatch may be excluding it from `desktop-chromium` — verify.
**Why deferred:** Not introduced by Task 4.13; pre-existing. Minor scope.
**Suggested home:** Next M4-touching change OR M9 polish. Either add `await page.setViewportSize({ width: 390, height: 667 })` at the top of the test, OR scope the test's testMatch to `mobile-safari` only.

### M5-D1 — /me page lacks "what's next" anchor — **RESOLVED 2026-05-17 via M9 Cluster C3**

**Status:** Resolved in M9 Cluster C3 (Auth flow + /me page + Bootstrap). See `handoffs/M9-polish.md` §Convergence log → Cluster C3 (R16 APPROVE). 16-round convergence covered the partition logic (active/upcoming/past/undated), chip-anchor sorting, ISO-date gate, calendar-impossible date rejection. Final commit `6114abc`.

**Source (original):**

**Source:** M5 §B `/impeccable critique`, 2026-05-04 (Finding C1, P0)
**Description:** `app/me/page.tsx` renders shows as an identical card grid (DESIGN.md anti-pattern: "no identical card grids"). Crew member with multiple shows must visually scan every card to find the one happening today/tomorrow. The most-soonest show should be visually emphasized (larger card, "Tomorrow" / "In 3 days" relative-time chip) and the rest grouped under "Upcoming" / "Past" headers.
**Why deferred:** UX/IA judgment call best handled in a dedicated `/impeccable shape /me page reorder with what's-next anchor` session, not under M5 close-out pressure. Spec §7.3 says `/me` lists shows; visual hierarchy across the list is M9 polish territory.
**Suggested home:** M9 polish.

### M5-D2 — Bootstrap shell has no liveness signal or timeout — **RESOLVED 2026-05-17 via M9 Cluster C3**

**Status:** Resolved in M9 Cluster C3 (Bootstrap retry race + StrictMode + signal-aware fetch + 6s still_working flip + Retry button). Final commit `6114abc`.

**Source (original):**

**Source:** M5 §B `/impeccable critique`, 2026-05-04 (Finding C2, P0)
**Description:** `app/show/[slug]/p/Bootstrap.tsx` "Connecting…" state has no animated indicator and no timeout. On slow venue Wi-Fi, frozen and working states look identical. User stares at static text for 2-8 seconds with no feedback. No retry mechanism if the bootstrap mint or redeem-link POST stalls.
**Why deferred:** Animation choice + timeout-with-retry UX is best designed in a `/impeccable animate` + `/impeccable shape` session, not bolted on under M5 close-out. The §A redeem-link route is correct; this is a pure §B presentation polish.
**Suggested home:** M9 polish. Consider: animated dot per `--duration-normal` + 6s timeout flipping to "Still working… [Retry]" intermediate state.

### M5-D3 — AlertBanner shows only top alert, no queue depth, no Resolve confirmation — **RESOLVED 2026-05-17 via M9 Cluster C4**

**Status:** Resolved in M9 Cluster C4 (queue chip + two-tap Resolve + raised_at relative time). See `handoffs/M9-polish.md` §Convergence log → Cluster C4 (R3 APPROVE). Final commit `b6e4cc1`. The useFormStatus hardening follow-up (M9-D-C4-1) also resolved in commit `c195747`.

**Source (original):**

**Source:** M5 §B `/impeccable critique`, 2026-05-04 (Finding C3, P1)
**Description:** `components/admin/AlertBanner.tsx` SELECTs `LIMIT 1` and shows only the topmost unresolved alert. Doug has no signal that more alerts are queued. Resolve button has no confirmation step — accidental tap on a P0 alert (REPORT_ORPHANED_LOST_LEASE etc.) silently resolves without undo. Also missing `raised_at` display ("Raised 14 minutes ago").
**Why deferred:** Banner UX (queue badge, two-tap confirm, raised_at format) is shape work that benefits from a `/impeccable shape components/admin/AlertBanner.tsx` session. M5 ships the catalog wiring + RLS + Server Action correctly; the visual polish around queue depth and confirmation is M9 territory.
**Suggested home:** M9 polish.

### M5-D4 — Sign-in page lacks FXAV brand mark and Google G icon — **RESOLVED 2026-05-17 via M9 Cluster C5**

**Status:** Resolved in M9 Cluster C5 (Sign-in brand). See `handoffs/M9-polish.md` §Convergence log → Cluster C5 (R4 APPROVE — closed via FXAV wordmark sourced from fxav.net + official Google sign-in-button SVG from Google's signin-assets.zip; no hand-recreation; brand-compliant).

**Source (original):**

**Source:** M5 §B `/impeccable critique`, 2026-05-04 (Finding C4, P1)
**Description:** `app/auth/sign-in/page.tsx` has no FXAV wordmark above the headline. `SignInButton.tsx` has text-only "Sign in with Google" with no Google G SVG. Trust signal missing on the highest-stakes form on the site (where users hand over Google credentials). Also violates Google's official Sign-In button brand guidelines.
**Why deferred:** Requires brand asset sourcing (FXAV wordmark; Google's official G SVG download). Better handled in a coordinated polish pass with proper assets + Google brand-guide conformance, not under M5 close-out.
**Suggested home:** M9 polish.

### M5-D5 — Help/recovery copy assumes Doug is reachable (P2) — **RESOLVED 2026-05-17 via M9 Cluster C3**

**Status:** Resolved in M9 Cluster C3 (sign-in error block placement above secondary path + View show list affordance per R8 disposition; brief §5.3 deviation documented in JSX comment per user authorization).

**Source (original):**

**Source:** M5 §B `/impeccable critique`, 2026-05-04 (Finding C5, P2 — non-blocking, recorded for completeness)
**Description:** Bootstrap.tsx error path and SignInButton inline error both fall back to "Try again" or "ask Doug." Doug-on-stage cannot be reached. Self-serve fallbacks ("Sign in with Google instead" link from bootstrap error; "Go to my shows" link from no-fragment state; "View show list" secondary path on sign-in) would let crew members recover without Doug.
**Why deferred:** P2 — copy iteration is best handled with `/impeccable clarify` after the structural shape work in M5-D1 / M5-D2 lands.
**Suggested home:** M9 polish, after M5-D1 / M5-D2.

### M5-D6 — Audit-pass minor findings batched (P2-P3) — **RESOLVED 2026-05-17 via M9 Cluster C8**

**Status:** Resolved in M9 Cluster C8 (A11y batch). See `handoffs/M9-polish.md` §Convergence log → Cluster C8 (R3 APPROVE).

**Source (original):**

**Source:** M5 §B `/impeccable audit`, 2026-05-04 (Findings P2 #3, P2 #5, P2 #7, P3 #2, P3 #3 — batched)
**Description:** Five small audit findings deferred:

1. `<details>` UA marker not styled / no `list-style: none` reset (`components/messages/ErrorExplainer.tsx:93-98`).
2. SignInButton inline error not associated with button via `aria-describedby` (`app/auth/sign-in/SignInButton.tsx:118-145`).
3. AlertBanner `role="status" aria-live="polite"` on SSR-only region — comment-documented; consider `aria-atomic="true"` for future client-injection.
4. Bootstrap connecting state has no `aria-live` for state transitions.
5. Sign-in page `<header>` lacks `aria-labelledby` (only matters when multiple `<header>` elements stack).
   **Why deferred:** All P2/P3. Low-impact a11y polish that benefits from a coordinated pass rather than scattered fixes.
   **Suggested home:** M9 polish.

### M5-D7 — Accent button drift across §B surfaces (Systemic)

**Source:** M5 §B `/impeccable audit`, 2026-05-04 (Patterns & Systemic Issues #1)
**Description:** SignInButton, AlertBanner Resolve, /me sign-out — three "accent button" variants across §B with diverging className composition. SignInButton has the canonical pattern (transition-colors, focus-ring-offset, disabled treatment). AlertBanner Resolve was aligned in commit `1678000`; the systemic concern remains: there's no shared `<AccentButton>` atom. Future button surfaces will continue to diverge.
**Why deferred:** Atom extraction is M6+ territory (when M6's UI components introduce a 4th button variant, the case for extraction will be clear). Premature extraction at 3 variants is YAGNI.
**Suggested home:** M6 or first M-task that introduces a 4th accent button variant.

### M5-D8 — Inline error copy duplication; no catalog routing (Systemic) — **RESOLVED 2026-05-17 via M9 Cluster C7**

**Status:** Resolved in M9 Cluster C7 (Inline-error consolidation). See `handoffs/M9-polish.md` §Convergence log → Cluster C7 (R3 APPROVE).

**Source (original):**

**Source:** M5 §B `/impeccable audit`, 2026-05-04 (Patterns & Systemic Issues #2)
**Description:** SignInButton (`app/auth/sign-in/SignInButton.tsx:139-141`) and Bootstrap (`app/show/[slug]/p/Bootstrap.tsx:96-99`) both hand-code generic operator-friendly copy with no routing through `lib/messages/lookup.ts`. As §A's catalog grows (`BOOTSTRAP_NETWORK_ERROR`, `OAUTH_INITIATE_FAILED` candidates), these strings should route through ErrorExplainer.
**Why deferred:** §A coordination ask. §A would add the catalog entries; §B would swap the inline strings for ErrorExplainer renders. Not a §B-internal fix.
**Suggested home:** Coordinate with §A in M6 or whenever the catalog next gets touched.

### M5-D9 — OAuth callback structured operator-log entries

**Source:** M5 adversarial review (2026-05-04, round 1, MEDIUM)
**Description:** app/auth/callback/route.ts emits OAUTH_REDIRECT_INVALID and OAUTH_STATE_INVALID only as redirect query codes (lines 32-50). Spec AC-5.14 requires the matching structured operator-log entry for invalid next, missing/expired PKCE state, and exchange failures so redirect tampering and state-mixup failures are visible to operators independent of the affected user.
**Why deferred:** The structured operator-log sink does not yet exist — per CF-PIN-3, operator-log writes are scheduled for M6/M8 alongside the sink itself. Producing entries now would require either a stub sink or a write to admin_alerts that doesn't match the spec's eventual shape. M5 §A close-out captured this as carry-forward.
**Suggested home:** M11 ops-hardening. M8 kickoff verified M6 / M6.5 / M7 did not land `lib/operatorLog/`, and M8 chose not to introduce the sink because §13.2.3 report-pipeline lease/recovery work is already the milestone's convergence risk; landing operator-log storage plus auth-route producers would double the review surface. When picking up: add the OAUTH_REDIRECT_INVALID and OAUTH_STATE_INVALID emit calls in callback/route.ts:32-50 alongside the sink, with regression tests covering invalid next, missing PKCE, and exchange failure paths.

### M5-D10 — Redeem-link structured operator-log entries

**Source:** M5 round-4 adversarial review (2026-05-04, §B finding, MEDIUM)
**Description:** `app/api/auth/redeem-link/route.ts` emits redeem-link failure producer codes only as JSON responses: `CSRF_DENIED`, `CSRF_NONCE_EXPIRED`, `CSRF_KEY_ROTATED`, `LINK_REDEEM_KEY_ROTATED`, `SESSION_NOT_FOUND`, `LINK_NO_CREW_MATCH`, `LINK_VERSION_MISMATCH`, `LINK_REVOKED_FLOOR`, `LINK_REVOKED_SURGICAL`, and `ADMIN_SESSION_LOOKUP_FAILED`. These cover replay/body-cookie mismatch, bootstrap nonce expiry, signing-key rotation, leaked/tampered JWTs, cross-show JWT attempts, missing crew bindings, version drift, floor/surgical revocations, and infrastructure failures. Operators need a structured sink independent of the affected user's browser response.
**Why deferred:** The structured operator-log sink does not yet exist — per CF-PIN-3, operator-log writes are scheduled for M6/M8 alongside the sink itself. Producing entries now would require either a stub sink or an `admin_alerts` write that does not match the spec's eventual operator-log shape.
**Suggested home:** M11 ops-hardening. M8 kickoff verified M6 / M6.5 / M7 did not land `lib/operatorLog/`, and M8 chose not to introduce the sink because §13.2.3 report-pipeline lease/recovery work is already the milestone's convergence risk; landing operator-log storage plus redeem-link producers would double the review surface. When picking up: add emit calls in `app/api/auth/redeem-link/route.ts` for every producer code listed above, with tests for replay, key rotation, nonce expiry, no-crew/version/revocation outcomes, and `ADMIN_SESSION_LOOKUP_FAILED` infrastructure paths.

### M5-D11 — Sign-out teardown failure structured operator-log producers

**Source:** M5 round-10 adversarial review (2026-05-04, §B finding, MEDIUM)
**Description:** `app/auth/sign-out/route.ts` logs `deleteSession()` and Supabase `signOut()` failures via `console.error` only and returns 500 ADMIN_SESSION_LOOKUP_FAILED with cookies preserved (R10 #2 fail-loud contract — security-correct: lets the user retry instead of seeing a fake-success while a copied cookie/token remains server-side valid). But the failure has no durable operator trail — if the user closes the browser without retrying, the partial-teardown state disappears into ephemeral logs. Operators need a structured sink to detect sign-out teardown failures (real signals of suspected-compromise sign-outs that didn't fully revoke).
**Why deferred:** The structured operator-log sink does not yet exist — same reason as M5-D9 / M5-D10. Producing entries now would require either a stub sink or a write to `admin_alerts` that doesn't match the spec's eventual shape.
**Suggested home:** M11 ops-hardening. M8 kickoff verified M6 / M6.5 / M7 did not land `lib/operatorLog/`, and M8 chose not to introduce the sink because §13.2.3 report-pipeline lease/recovery work is already the milestone's convergence risk; landing operator-log storage plus sign-out producers would double the review surface. When picking up: add emit calls in `app/auth/sign-out/route.ts` for the two failure branches (link_sessions delete error, Supabase signOut error), with regression tests asserting an operator-log entry is written before the 500 response.

### M7-D1 — Gallery + agenda lightbox entry/exit motion — **RESOLVED 2026-05-17 via M9 Cluster C6**

**Status:** Resolved in M9 Cluster C6 (Lightbox motion). See `handoffs/M9-polish.md` §Convergence log → Cluster C6 (R3 APPROVE).

**Source (original):**

**Source:** M7 Task 7.9 §12 `/impeccable critique`, 2026-05-11 (round 1)
**Description:** Wrap `GalleryLightbox` and `AgendaSheet` openings in a `framer-motion` `AnimatePresence` transition: opacity 0→1 and `scale: 0.96 → 1` enter / reverse exit. Duration consumes `--duration-normal` (220ms) and easing consumes `--ease-out-quart` from DESIGN.md §5. Gate motion via `prefers-reduced-motion` so the existing `app/globals.css` reduction sets duration to 0ms.
**Why deferred:** Shipping the lightbox + sheet without an entry crossfade is a perceptible "first-pass implementation" tell against native phone galleries (Apple Photos / Google Photos both use a brief shared-element scale). v1 ships functional + accessible (focus trap, page counter, swipe carries information about position) but the polish moment is M9's job to land alongside the other motion-touch tasks. AC-7.1 / AC-7.2 / AC-7.7 do not require entry motion; M7 close was not blocked.
**Suggested home:** M9 polish.

### M7-D2 — AgendaPdfViewer error states routed through messageFor — **RESOLVED 2026-05-17 via M9 Cluster C6**

**Status:** Resolved in M9 Cluster C6 (Lightbox + sentinel + error routing). The new §12.4 catalog rows AGENDA_GONE_FOR_CREW + AGENDA_UNAUTHENTICATED (ratified spec amendment `2026-05-12-catalog-agenda-codes.md`) are consumed by `components/agenda/AgendaPdfViewer.tsx`. See `handoffs/M9-polish.md` §Convergence log → Cluster C6 (R3 APPROVE).

**Source (original):**

**Source:** M7 Task 7.9 §12 `/impeccable audit`, 2026-05-11 (Finding G.3)
**Description:** Replace the single "couldn't open the agenda right now" copy in `components/agenda/AgendaPdfViewer.tsx` with a `messageFor(...)` lookup so 410 / 401 / 500 surface distinct crew-facing copy (per AGENTS.md §1.5 — no raw error codes, but also: distinct user-facing messages should map to distinct catalog entries). Inspect `react-pdf`'s `onLoadError` payload to derive an HTTP status hint. If `react-pdf` doesn't expose status, run a HEAD fetch against the proxy URL first and route on its status. Add new §12.4 catalog rows where needed: `AGENDA_GONE_FOR_CREW` (410) and `AGENDA_UNAUTHENTICATED` (401) with crew-facing copy that suggests reopening Doug's link.
**Why deferred:** v1 collapses every PDF load failure to a single retry-able message. The retry-able framing is correct for transient infra faults but wrong for permanent 410 (file removed / non-PDF / drift) where retrying spins. The fix needs new catalog rows and the X.1 spec extractor parity test pinned, which is more scope than the M7 close-out could absorb. AC-7.1 closes at M7 — the proxy route + inline embed works; only the failure-state copy is deferred.
**Suggested home:** M9 polish OR earlier if a §12.4 catalog row for crew-facing PDF errors lands.

### M7-D3 — Diagrams gallery `<img>` → `next/image` — **RE-DEFERRED at M9 C6b (2026-05-13); BLOCKED on private-image-pipeline design**

**Status:** **Open / Re-deferred.** R5 correction: M7-D3 was incorrectly marked RESOLVED in the R4 sweep (commit `d22ea75`). The actual status is RE-DEFERRED at M9 C6b. M9 C6b attempted the next/image migration (commit `d433c32`); Codex adversarial review returned BLOCK with a P0 finding (cookie-forwarding + Cache-Control rewrite — see "M9 close-out update (2026-05-13)" paragraph below). The migration was REVERTED at commit `22623ad`. Live code still uses raw `<img>` in `components/diagrams/Gallery.tsx` and `GalleryLightbox.tsx` with lint suppressions. Adoption requires either (a) a custom Next.js image loader that forwards cookies AND preserves private caching, or (b) a different image pipeline entirely. The C6b commits DID close one adjacent item — runtime `<img onError>` fallback for 4xx/5xx routing to the existing unavailable placeholder (P1 of C6b round-1 review).

**Suggested home:** Future milestone with a private-image-pipeline brainstorming session (NOT M9; the in-cluster attempt failed P0).

**Source (original):**

**Source:** M7 Task 7.9 §12 `/impeccable audit`, 2026-05-11 (`@next/next/no-img-element` lint warnings)
**Description:** Migrate `components/diagrams/Gallery.tsx` and `components/diagrams/GalleryLightbox.tsx` from `<img>` to `next/image`. Asset URLs are proxied through `/api/asset/diagram/...` which already returns auth-checked bytes with `private, max-age=0, must-revalidate` — `next/image`'s `/_next/image` optimizer would either need to bypass the auth proxy OR add a second redirect layer. Most likely path: declare the proxy origin as a `next.config.ts` remote pattern (same origin) and let `next/image` proxy through it; verify the resulting Cache-Control is still `private` so revocation propagates.
**Why deferred:** The current `<img loading="lazy" decoding="async">` is the manual equivalent and works fine on the mobile crew page (390px, single column at the right density). The lint warning is informational, not a ban. The `next/image` migration needs a careful interaction-test against the proxy's auth + cache contract — too much scope for the close-out. AC-7.4 closes at M7 — the bytes go through the proxy route, no Drive URL leaks; the LCP optimization is the only deferral.

**M9 close-out update (2026-05-13):** M7-D3 STAYS DEFERRED. M9 C6b attempted the migration (commit d433c32) and Codex adversarial review returned BLOCK with a P0 finding: `/_next/image` does NOT forward the user's auth cookies to the upstream `/api/asset/diagram/...` route (server-side fetch under a different request context — every request authenticates as anonymous and gets 401/403); AND `/_next/image` rewrites the proxy's `Cache-Control: private, max-age=0, must-revalidate` to public-cache headers, violating §6 watchpoint 12. Reverted at commit 22623ad. Adoption requires either (a) a custom Next.js image loader that forwards cookies AND preserves private caching, or (b) a different image pipeline entirely. The C6b commits DID close two adjacent items: runtime `<img onError>` fallback in both Gallery + GalleryLightbox so 4xx/5xx at load time routes to the existing unavailable placeholder (P1 of the C6b round-1 review). The lint-suppression rationale comment captures the contract.

**Suggested home:** Future milestone with a private-image-pipeline brainstorming session.

### M7-D4 — Pinch-zoom inside lightbox figures — RESOLVED 2026-05-13 (M9 C6c)

**Source:** M7 Task 7.9 §12 `/impeccable critique`, 2026-05-11 (LD persona red flag)
**Description:** Add `react-zoom-pan-pinch` (or equivalent) inside each `<figure>` of `GalleryLightbox.tsx` so a crew member can pinch-zoom a diagram for detail (truss positions, stage plot dimensions). Embla's swipe gesture must be temporarily disabled while a zoom is in flight; restore on pinch-end. Verify gesture priority: pinch wins over swipe when two fingers are down; single-finger swipe still navigates between images.
**Resolution (M9 C6c, 2026-05-13):** Shipped via `react-zoom-pan-pinch@4.0.3`. Single-finger pan when zoomed; Embla `watchDrag` gated on `wasZoomedRef` boundary; chevrons auto-reset zoom. Reset chip absolutely-positioned inside the relative image container so the figure does not reflow on mount. 28 jsdom unit tests + impeccable critique + audit dual gate passed. See shape brief `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/shape-sessions/2026-05-13-pinch-zoom-lightbox.md` and handoff §12 for the convergence log. Real-device iOS smoke is the remaining manual verification per shape brief §14.

### M9-D-C1-2 — Next 16 + Turbopack `next/font/google` dev-mode fetch hang — RESOLVED 2026-05-14 (Next 16.2.4 upgrade)

**Resolution:** Bumped `next` from 16.0.0 → 16.2.4 in commit `889347a`. Next.js 16.2.4 included PR #92713 (reqwest v0.13.2) which resolved the upstream Turbopack font-fetch issue (#91653 / #92671). Worktree smoke-test confirmed: `/show/[slug]` renders in 1.7s cold compile / 37-84ms warm under `pnpm dev` with admin auth (vs. 180s+ hang on 16.0.0). The MS_ONLY env-guard was removed from `playwright.config.ts` and the run-sequence comment in `tests/e2e/crew-page.spec.ts` was simplified — the layout-invariant suite now runs under the default `pnpm exec playwright test` command path with no manual pre-build required. All 3 layout-invariant Playwright tests pass under the standard webserver-spawn flow (1.0min total including the other 3 webservers building).



**Source:** M9 C1 R3+R4 e2e implementation, 2026-05-14. Discovered while wiring the active layout-invariants suite and its sm:>=640px companion.
**Description:** `pnpm dev` (Next 16 + Turbopack default bundler) hangs the first request to any route whose layout imports `next/font/google` Inter — `app/show/[slug]/layout.tsx:31` is the trigger for the crew page. Reproducer:
1. Start the dev server.
2. Authenticate via `/api/test-auth/set-session` (admin email).
3. Curl `/show/<slug>` with the admin cookies.
4. The dev server holds 8 ESTABLISHED HTTPS connections to `fonts.gstatic.com` (and 1 to `fonts.googleapis.com`) and never sends a render response. The fonts URLs themselves are reachable in <100ms via direct curl from the same shell, so the network is fine — Next 16's font-fetch path (or its Turbopack integration) drops the responses on the floor.

This is the same class of bug tracked upstream:
- vercel/next.js#78472 — "Error while requesting resource" with `next/font/google` using `next dev --turbopack`
- vercel/next.js#71618 — Google fonts not bundled in Next.js 15 turbopack dev builds
- vercel/next.js#92671 — `next/font/google` fails to build on 16.2.3 — Turbopack font resolution broken

**Historical workaround (no longer required as of commit 889347a):** while pinned to Next.js 16.0.0, the C1 R3+R4 e2e suites required a manually pre-built production server with an `MS_ONLY=1` env-guard on `playwright.config.ts` to elide the other webservers. That workaround has been removed; the suite now runs under the default `pnpm exec playwright test` command path. See the resolution note above for the verification timing.

### M9-D-C6c-1 — Pinch discoverability hint (declined HIGH from C6c critique)

**Source:** M9 C6c `/impeccable critique`, 2026-05-13 (HIGH-1 finding from the LLM design review)
**Description:** Reviewer flagged the absence of a first-time discoverability hint for pinch-zoom on the lightbox. Suggested mitigations: a one-shot subtle chip ("Pinch to zoom · double-tap to reset") that fades out after 2s on first open per session, OR a persistent low-contrast hint in the header alongside "Diagrams · N of M".
**Why deferred (accepted residual risk, AGENTS.md invariant 8):** Pinch-zoom is a gesture-universal convention on mobile (iOS Photos, every consumer image viewer teaches it culturally). Mobile crew members will instinctively try pinch on any photographic image. The "stuck while zoomed" failure mode the hint primarily protects against is already handled by the Reset chip (which is visible by definition when scale > 1, the only state where the user could be stuck). Adding a persistent hint chip would compete for header chrome real-estate against the page indicator (1 of N) and the close button on a 390px viewport; a session-scoped one-shot hint adds localStorage state machinery and an additional dismiss interaction surface. No user-research signal that discoverability is an actual barrier on this surface. Recommendation revisits if FXAV venue-floor crew feedback explicitly identifies pinch-discovery friction in a future round.
**Suggested home:** Re-open when there is a real-user data point. Currently no scheduled milestone.

### M9-D-C4-1 — `useFormStatus` hardening for Resolve failure path — **RESOLVED 2026-05-17 (impeccable gate re-run 2026-05-17 via M9 final-review R10)**

**Status:** **Resolved.** `components/admin/ResolveAlertButton.tsx` refactored to derive the "Resolving…" / disabled-controls state from `useFormStatus().pending` instead of a local `ui="resolving"` flag.

**Impeccable dual-gate (re-run post-c195747 per AGENTS.md invariant 8, M9 final-review R10):**

| Gate | Score | Detector | Verdict |
|---|---|---|---|
| `/impeccable critique` | 33/40 Nielsen (+3 vs prior C4 baseline of 30/40 — useFormStatus is a net win on H1 Visibility, H5 Error Prevention, H9 Error Recovery) | `[]` | Clean. No CRITICAL/P0/P1. |
| `/impeccable audit` | 19/20 (Excellent) | `[]` | Same as prior C4 baseline. |

**c195747 critique dispositions (2 findings; both DEFERRED with rationale):**

- **P2 — Double-tap window between pending=false and banner re-mount on happy path.** When `revalidatePath` fires, there's a brief window where Confirm re-enables before the server re-render swaps the banner; Doug could double-tap Confirm against an already-resolved row. **DEFERRED** — the Server Action is idempotent (the `WHERE resolved_at IS NULL AND show_id IS NULL` guard at `app/admin/actions.ts:80-86` makes the second UPDATE a no-op). Not destructive. A `useActionState` migration could close this window but adds complexity for a benign no-op race. Re-open if a real-world double-tap surfaces a visible UX glitch.
- **P3 — No live-region announcement on pending→idle failure transition.** Doug glancing away mid-show wouldn't hear that a failed submit silently re-enabled. **DEFERRED** — the parent banner's `role="status" aria-live="polite"` covers the alert's content; explicit failure-announcement would require a visually-hidden span toggled by a derived `failureTransition` state. Re-open if Doug-on-phone feedback shows the silent re-enable is missed in practice.

**Mechanism:** Removed the `"resolving"` UiState entirely. The retained `idle | confirm` states are local, but pending submission lifecycle is owned by the parent `<form action={resolveAdminAlertFormAction}>` via a small `ConfirmRow` child component (required because `useFormStatus` must be called from a descendant of the form, not the form itself). When pending=true the Confirm button shows "Resolving…" + disabled + aria-busy; when the action returns (success OR failure), pending naturally flips back to false. On happy path the page revalidates and the banner re-mounts as before; on failure path Doug now sees Confirm + Cancel re-enabled without needing to reload.

**Regression test added:** `tests/components/ResolveAlertButton.test.tsx` — new case `"M9-D-C4-1: pending flips back to false on action failure → Confirm + Cancel re-enabled (no stuck Resolving…)"` uses a controlled async action that rejects mid-flight; asserts the disabled controls re-enable + label reverts to "Confirm resolve" after the failed submission. The existing `confirm → resolving` case was also rewritten to use a real `<form action={fn}>` with a controlled promise so useFormStatus has an actual submission lifecycle to track.

**Source:** M9 C4 R3 adversarial review (Codex), 2026-05-15 — MEDIUM finding from APPROVE verdict.

### M9-D-dead-admin-href — Sweep `/admin` dead-href class — **RESOLVED 2026-05-17 via M9 final-review R12 + R13 + R14 + R15**

**Status:** **Resolved.** Four review rounds converged the dead-href class:
- R12/R13 caught that `href="/admin"` 404'd because the route tree had no `app/admin/page.tsx` — retargeted all UI links to `/admin/dev`.
- R14 caught the same class in the auth-redirect default `DEFAULT_AUTH_NEXT_PATH = "/admin"` and `ALLOWED_NEXT_RE` — retargeted to `/admin/dev`.
- **R15** caught that `/admin/dev` is itself build-gated out of production via `scripts/with-admin-dev-flag.mjs` (ADMIN_DEV_PANEL_ENABLED env var unset = `/admin/dev/page.tsx` renamed away). The `/admin/dev` fallback would 404 in prod the same way `/admin` did before.

**R15 final resolution:**
- Created `app/admin/page.tsx` — an always-built admin landing page with links to available admin sub-pages (Administrators settings + Dev parse panel when ADMIN_DEV_PANEL_ENABLED). Section anchored as `id="alerts"` so the AlertBanner queue chip's `#alerts` fragment lands meaningfully (the layout's AlertBanner renders above this).
- All four UI links + DEFAULT_AUTH_NEXT_PATH + ALLOWED_NEXT_RE restored to `/admin`.

| File | Source | Final R15 Fix |
|---|---|---|
| `app/admin/settings/admins/error.tsx:88` | R11 | `/admin` (Back to admin) |
| `components/admin/AlertBanner.tsx:188` | M9 C4 commit `eaf9fe9` | `/admin#alerts` |
| `app/admin/layout.tsx:62` | pre-M9 commit `1a777ea` | `/admin` (Try again) |
| `app/admin/show/[slug]/page.tsx:130` | pre-M9 commit `098b820` | `/admin` (← Admin home) |
| `lib/auth/validateNextParam.ts:DEFAULT_AUTH_NEXT_PATH` | M5 sign-in flow | `/admin` (production-safe landing now exists) |

**Defense going forward:** route-reachability tests in:
- `tests/components/admins-error-boundary.test.tsx` asserts `app/admin/page.tsx` exists.
- `tests/components/AlertBanner.test.tsx` asserts `app/admin/page.tsx` exists.

If a future refactor moves `app/admin/page.tsx`, both gates trip before the dead-link reaches production.

### M9-D-error-tsx-1 — `app/admin/settings/admins/error.tsx` post-R1 impeccable dispositions — **RESOLVED 2026-05-17 via M9 final-review R11**

**Status:** **Resolved.** Impeccable dual-gate ran on the R1-added `error.tsx` route-segment error boundary per AGENTS.md invariant 8 (R11 finding caught the missed gate from R1 commit `f669e18`).

| Gate | Score | Detector | Findings |
|---|---|---|---|
| `/impeccable critique` | mixed (4-heuristic targeted): H1=2 (improved to 3 post-fix), H9=3, H6=3, H10=1 → improved to ~2-3 post-fix | `[]` | 1 P1 + 2 P2 + 1 P3 — all fixed except P3 (deferred). |
| `/impeccable audit` | mirrored prior C9 baseline (token discipline + 44×44 tap targets preserved) | `[]` | No CRITICAL/HIGH. |

**R11 c195747-style polish dispositions on `error.tsx`:**
- **P1 — Retry-loop trap.** No fallback if Retry keeps failing on a persistent infra fault. **FIXED** (R11 first commit, **R12 retargeted**): added "Back to admin dev" `Link` to `/admin/dev`. R11 originally targeted `/admin` which 404'd because the route tree has no `app/admin/page.tsx`; R12 caught the dead-end and retargeted to `/admin/dev` (the only `/admin/*` page that doesn't depend on `admin_emails` and therefore can't re-fail the same way). New route-reachability test asserts `app/admin/dev/page.tsx` exists so a future refactor that moves the page breaks the test before silently breaking the escape Link.
- **P2 — Retry button no pending state.** `reset()` is sync-fire-and-forget but the segment re-render is async; user got no signal the tap registered. **FIXED:** wrapped `reset()` in `useTransition()`; button shows "Retrying…" + `disabled` + `aria-busy="true"` during the transition.
- **P2 — No escalation/help line.** Catalog message alone didn't tell Doug what to do if retry fails twice. **FIXED:** added a `text-sm` sub-line: "If this keeps happening, the server-side log has the stack — check Supabase health or page the on-call admin." (Non-catalog UX text per invariant 5; no error code surfaced.)
- **P3 — Decorative `<h1>Administrators</h1>` header eats vertical space when the page hasn't loaded.** **DEFERRED:** the consistent page-title chrome preserves Doug's sense of place when the route segment re-mounts on Retry. Re-open if a future user-research signal shows the title is misleading mid-failure.

**Tests:** 7 cases in `tests/components/admins-error-boundary.test.tsx` cover catalog message render, defense-in-depth coverage for unknown throws, Retry wiring, role="alert" contract, the new "Back to admin" Link, the Retry idle-state contract, and the escalation sub-line presence.

### M9-D-9.3-1 — AC-9.2 empty-state reachability e2e spec is `test.describe.skip` pending auth-fixture migration — **RESOLVED 2026-05-17**

**Status:** **Resolved.** Migration shipped in the same session as the deferral. `tests/e2e/empty-state-reachability.spec.ts` is now `test.describe()` (no skip); all 4 §8.3 scenarios pass and have committed screenshot baselines at `tests/e2e/empty-state-reachability.spec.ts-snapshots/`.

**Migration changes:**
- `tests/e2e/empty-state-reachability.spec.ts`: dropped `test.describe.skip` → `test.describe`. `beforeAll` now creates a per-suite `crew_members` row tied to `NON_ADMIN_CREW_FIXTURE.email` with `role_flags=['LEAD']` so categories 1/2/4 see a LEAD viewer; category 3 stays valid because the test crew is NOT on any seed `hotel_reservations` row. `beforeEach` calls `signInAs(NON_ADMIN_CREW_FIXTURE)` per-test. `afterAll` deletes the crew row + restores show state.
- Dropped all `?crew=${s.leadCrewId}` query params from `goto()` calls (the retired query-mock); the route resolves crew identity from auth cookies → canonical email → crew_members lookup.
- Snapshot type pruned to remove `leadCrewId` field (no longer needed).
- `playwright.config.ts` testMatch regex extended to include `empty-state-reachability` (previously only matched `empty-state.spec.ts` exactly).
- One DOM contract assertion fixed: the spec's "Doug hasn't filled this in yet" copy was hypothetical; actual `VenueTile.tsx:70` copy is "Venue details haven't been added yet." — corrected.

**Verification:** ran `pnpm test:e2e tests/e2e/empty-state-reachability.spec.ts --project=mobile-safari` twice — first run generated baselines via `--update-snapshots`; second run vs baselines passed 4/4 in 5.6 minutes.

**Source:** M9 final-review R8 (Codex), 2026-05-17 — HIGH finding.

### M9-D-C9-1 — `/impeccable critique` + `/impeccable audit` dual gate pending on `/admin/settings/admins` UI — **RESOLVED 2026-05-17**

**Status:** **Resolved.** Both impeccable gates closed cleanly on the C9 UI surfaces (`app/admin/settings/admins/page.tsx`, `AddAdminForm.tsx`, `RevokeRowButton.tsx`, `ReAddRowButton.tsx`). All dispositions:

| Gate | Score | Verdict | Findings + dispositions |
|---|---|---|---|
| `/impeccable critique` | 30/40 Nielsen, detector `[]` | Solid — ship after P1 fixes | 2 P1 + 2 P2 + 1 P3, all FIXED in commit `4e438b0` (lockout error placement; success confirmation + form reset; one-tap re-add affordance on RevokedRow; "You" pill + meta-line typography; re-add cancel result reset via formKey bump) |
| `/impeccable audit` | 19/20 Excellent, detector `[]` | Excellent (minor polish) | 1 P2 + 1 P3, both FIXED in follow-up commit (this entry): P2 "You" pill contrast (`text-[10px]` on `bg-accent` = 4.07:1 fails WCAG 1.4.3 for small text — swapped to neutral high-contrast pill `border border-border bg-surface-raised text-text-strong text-xs`); P3 disabled-Revoke `title` tooltip → visible inline hint with `aria-describedby` (mobile devices don't surface `title`; screen readers often ignore `title` on disabled buttons) |

Both passes ran with the canonical v3 preflight gates (PRODUCT.md ✓, DESIGN.md ✓, command_reference ✓, shape not-required, image-gate skipped:critique-evaluate-only, mutation closed→open for fixes). Detector returned `[]` (zero pattern matches) on both passes. No new tokens introduced (brief §11 anti-goal preserved).

**Source:** M9 C9 R10 adversarial review (Codex), 2026-05-17 — CRITICAL finding (process gate).
**Resolution path traversed:** User ran `/impeccable critique` → 5 findings dispositioned in commit `4e438b0`. User ran `/impeccable audit` on patched code → 2 findings dispositioned in follow-up commit. M9 C9 is now structurally + technically + process-gate complete.

### M7-D5 — Sentinel-hiding helper for diagrams + agenda emptiness — **RESOLVED 2026-05-17 via M9 Cluster C6**

**Status:** Resolved in M9 Cluster C6 (sentinel hiding consolidation). See `handoffs/M9-polish.md` §Convergence log → Cluster C6 (R3 APPROVE).

**Source (original):**

**Source:** M7 Task 7.9 §12 `/impeccable audit`, 2026-05-11 (Finding G.5)
**Description:** Add `shouldHideDiagrams(diagrams, agendaLinks)` to `lib/visibility/emptyState.ts` so the §8.3 generic-optional sentinel-hiding contract has a single source of truth for diagram-tile emptiness. Register the new helper in `tests/components/tiles/_metaSentinelHidingContract.test.ts` so the meta-contract walks DiagramsTile alongside the other sentinel-bearing tiles.
**Why deferred:** DiagramsTile currently uses inline boolean checks (`items.length > 0`, `agendaLinks.some((link) => Boolean(link.fileId))`). Both are MEDIA-presence checks, not text-sentinel checks — they don't pattern-match the existing `shouldHideGenericOptional` (which hides "TBD" / "N/A" / "TBA"). The audit flagged this as a §1.9 meta-test coverage gap rather than a bug. v1 works correctly; the helper extraction is a discipline polish. AC-7.2 + AC-7.7 close at M7 — DiagramsTile returns null on whole-tile-missing per §8.3 already.
**Suggested home:** M9 polish.

---

## Resolved

### M6-D12 — Amendment 9 first-seen auto-publish + 24h unpublish undo

**Status:** **Resolved at SHA `badbb15` (M6.5 coda — Amendment 9 first-seen auto-publish + 24h unpublish undo)**. Cross-model adversarial review APPROVED. M6 amended AC-6.11 now satisfied.

**Source:** M6 §A adversarial review round 3, 2026-05-09
**Description:** Retire live-path `FIRST_SEEN_REVIEW` emission for first-seen sheets in `cron`, `push`, and `manual` modes. Auto-apply first-seen live sheets when MI-1..MI-14 all pass; continue hard-failing MI-1..MI-5b to `pending_ingestions` and staging MI-6..MI-14 trips with the specific MI sentinel. Add `shows.unpublish_token` and `shows.unpublish_token_expires_at`. Emit `SHOW_FIRST_PUBLISHED` after auto-publish. Implement `POST /api/show/[slug]/unpublish?token=...` with token consumed, expired, and success branches; emit `SHOW_UNPUBLISHED` and revoke affected links on success. Keep onboarding-scan first-seen sheets in explicit-review mode with `ONBOARDING_SCAN_REVIEW`.
**Resolution:** Shipped in M6.5 coda (see `handoffs/M6.5-amendment-9.md`). Schema columns added with paired-NULL CHECK; live-path FIRST_SEEN_REVIEW retired and replaced with `auto_publish_ready` branch in Phase1Result; auto-publish wired through phase2 under the per-show advisory lock with 24h undo token, SHOW_FIRST_PUBLISHED emission, and Realtime broadcast invalidation; POST /api/show/[slug]/unpublish route handles success/expired/consumed/not-found branches with idempotent re-attempt + link revocation + SHOW_UNPUBLISHED emission. Onboarding-scan ONBOARDING_SCAN_REVIEW preserved per the exception. Meta-test registries (Supabase call-boundary, advisory-lock single-holder, admin_alert catalog) extended.

### M2-D6 — App-side advisory-lock helper shape deferred to consumer milestones

**Status:** **Resolved at SHA `dc68471` (M5 Pin-2 extension #2 — `feat(auth): add show advisory lock helper`)**. A Git commit cannot contain its own final SHA without changing that SHA, so this row was authored in the same commit that ships `lib/db/advisoryLock.ts` with a reference-by-name; the SHA is backfilled here in a follow-up orchestrator commit.

**Source:** M2 adversarial review, Round 1 advisory note
**Description:** Plan-wide invariant §1.2 mandates per-show advisory locks on every code path that mutates `shows` / `crew_members` / `crew_member_auth` / `pending_syncs` / `pending_ingestions`, with tests asserting the lock is held. M2 ships the schema that supports this; the actual helper and the lock-held tests live with the code paths that hold the lock (M5 auth, M6 sync).
**Resolution:** Added `lib/db/advisoryLock.ts` with `withShowAdvisoryLock(showId, mode, fn)` where `mode ∈ { 'try' | 'block' }`. The lock key is derived from `hashtext('show:' || shows.drive_file_id)` per spec §1.2, and `tests/db/advisory-lock.test.ts` asserts a competing transaction cannot acquire the same advisory key while the callback runs.
