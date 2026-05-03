# Handoff — M4: Crew page tiles

**Handed off:** 2026-05-03 by Eric Weiss
**Implementer:** Opus 4.7 / Claude Code (this session, via `superpowers:subagent-driven-development`) — **all 16 tasks** per ROUTING.md hard-rule "every UI file is Opus territory"
**Adversarial reviewer:** GPT-5.5 / Codex (per ROUTING.md M4 row)
**Plan file:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/03-04-tiles.md` (Tasks 4.1–4.16; lines 175–836). Tasks 3.1–3.2 are M3 — closed, out of scope.

---

## 1. Spec sections in scope

Plan §M4 cites: `Spec context: §8 entire section, §17.1 milestone 4.` In practice every M4 task brushes one or more of:

- **§7.3** — `/admin/**` and `/show/[slug]` route auth + searchParams contract; identity-only `?crew=<crewMemberId>` mock; `?role=` ignored.
- **§7.4** — `getShowForViewer` shape + role re-derivation invariant (no caller-supplied `role_flags`; `crew_members` lookup binds id AND show_id).
- **§8.1** — Tile catalog: Lodging, Venue, Schedule, AudioScope, VideoScope, LightingScope, Transport, ShowStatus, Financials, PackList, Notes, Crew, Contacts. Empty-state discipline. Canonical `SCOPE_TILE_VISIBILITY_RULE`. Pack-list visibility on `{Set, Strike, Load Out}` (NOT Load In).
- **§8.2** — RightNowCard state machine (12 states) + transition contract.
- **§8.3** — Empty-state discipline: required missing → "Doug hasn't filled this in yet"; optional missing → omit; whole-tile-missing → don't render, grid reflows.
- **§8.4** — Dimensional invariants: RightNow full-width at 390/1024/1200; tile grid 2/3/4 cols + first-row equal-height (`align-items: stretch` — Tailwind v4 NON-default); tile `min-h-24` (96px); 240px overflow rule + show-more disclosure; footer sticky-vs-flow.
- **§10** — Opening reel URL-strip render contract (crew DOM MUST NEVER contain `https://` or `drive.google.com`/`docs.google.com` substrings). M4 ships URL-stripped text only — NO `<video>` element until M7 Task 7.6.
- **§11** — `crew_members` projection contract (`role_flags`, `name`, `email`, `phone`, `stage_restriction`, `date_restriction`).
- **§15** — Demo wording: open page on phone, see Direction B with empty-state discipline.
- **§17.1** — Per-milestone acceptance criteria: AC-4.1..AC-4.12 at spec lines `:3366-3377`.
- **§4.4** — `coi_status` is on `shows` (public to all crew, not internal).
- **§5.2 / §6.7 / §6.6** — `transportation.schedule[*].assigned_names[]` end-to-end contract; `stage_restriction` discriminator (`{kind:'none'} | {kind:'explicit', stages:WorkPhase[]}`); `date_restriction` discriminator (`{kind:'none'} | {kind:'explicit', days:Date[]} | {kind:'unknown_asterisk'}`).
- **§6.10** — `pull_sheet` JSONB shape; soft `PULL_SHEET_PARSE_PARTIAL`/`PULL_SHEET_AMBIGUOUS_FORMAT` warnings; MI-8c stage-on-collapse.
- **§6.11.1** — Reel pin columns (`opening_reel_drive_file_id`, `opening_reel_drive_modified_time`, `opening_reel_head_revision_id`, `opening_reel_mime_type`) — read by AC-4.5 / AC-7.25, written by §6.11 enrichment (M6/M7).
- **§12.4** — Error-code catalog. **No raw error codes in user-visible UI** — all routed through `lib/messages/lookup.ts` (cross-cutting deliverable; create the minimal lookup as part of M4 if not yet shipped).
- **§4.3** — `crew_member_auth` is admin-only; not directly readable from crew page subscriptions (load-bearing for Task 4.16's Broadcast transport choice).
- **§4.1** — `transportation.driver_name` field; `TransportScheduleEntry` shape including `assigned_names`.

## 2. Acceptance criteria

Verbatim from spec §17.1 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md:3366-3377`):

- **AC-4.1** — `/show/<slug>?crew=<seeded-A1-crewMemberId>` renders Lodging, Venue, Schedule, AudioScope, Crew, Contacts, ShowStatus (with COI). NO Financials. Identity-only mock; `?role=` explicitly ignored.
- **AC-4.2** — `/show/<slug>?crew=<seeded-LEAD-crewMemberId>` adds FinancialsTile. COI status appears in ShowStatus tile in BOTH renders.
- **AC-4.3** — RightNowCard renders correct state for synthesized "today is Show Day 1" fixture, including viewer-aware states (`viewer_off_day`, `viewer_after_last_day`, `viewer_unconfirmed`).
- **AC-4.4** — Full §8.4 dimensional invariants (5 invariants, real-browser Playwright assertion via `getBoundingClientRect()` + `getComputedStyle()`).
- **AC-4.5** — Empty-state discipline (per-field). `Opening Reel = TBD` → no line. `YES`/`MAYBE`/`N/A`/`TBA`/`BACKUP ONLY` → render "Opening reel: <value>". Mixed `YES - <drive-url>` → URL-stripped "Opening reel: YES". Pure-URL cell → no line at M4. **Crew DOM must NOT contain `https://` or `drive.google.com` substrings.** **At M4 NO `<video>` element renders** — `/api/asset/reel/<show>` ships in M7 Task 7.6.
- **AC-4.6** — Schedule tile for `unknown_asterisk` crew renders "days unconfirmed" + NO per-day schedule.
- **AC-4.7** — Parser populates `pull_sheet` for `2024-05-east-coast-family-office.md` and `2025-05-redefining-fixed-income-private-credit.md`; NULL for the other 8 raw fixtures. (Parser side already shipped in M1; M4 verifies the column flows through `getShowForViewer` to PackListTile.)
- **AC-4.8** — PackListTile renders on set day for unrestricted-crew viewer when `pull_sheet IS NOT NULL`; renders on strike day; absent on show days.
- **AC-4.9** — PackListTile absent for shows whose sheet has no PULL SHEET tab.
- **AC-4.10** — PackListTile absent on set day for crew with `stage_restriction.stages = ["Load Out", "Strike"]`; renders on strike day for same crew.
- **AC-4.11** — `PULL_SHEET_PARSE_PARTIAL` and `PULL_SHEET_AMBIGUOUS_FORMAT` surface in admin parse panel without blocking sync; affected rows render with raw snippet on crew page.
- **AC-4.12** — MI-8c pull-sheet preservation: prior 6 cases vs new 0 (full collapse) → stages, NOT auto-applied. Same for halved case-count or label drop. Soft per-row partial warnings continue to auto-apply.

## 3. Spec amendments in scope

All three §13.2.3 ratified amendments are M8-only; **none apply to M4**:

- [ ] Amendment 1 — listForRepo recovery contract — **N/A — only M8.**
- [ ] Amendment 2 — created_at horizon + lease-expired reaper predicate — **N/A — only M8.**
- [ ] Amendment 3 — `lease_holder` ownership protocol — **N/A — only M8.**

(M2 already provisioned the `reports` `lease_holder` column inline; M4 does not touch the report pipeline. Amendments 4 (drop v3) and 5 (v4 single-marker) are parser concerns from M1 — applies indirectly only via the seed fixtures the tile tests consume.)

## 4. Pre-handoff state

- [x] **Previous milestones committed**: M0, M1, M2, M3 closed. Current `git log` head at handoff authoring is `ef94896 docs(handoff): record M3 adversarial review convergence (8 rounds, approved)`. Working tree clean.
- [x] **Pre-flight tests passing in isolation**: `pnpm lint` and `pnpm typecheck` exit 0. `pnpm test` exits 0 with 909 vitest tests passing across 35 files (+5 skipped opportunistic-positive HTTP cases, expected per M3 convergence). `pnpm test:e2e --project=mobile-safari` exits 0. **Important pre-flight artifact**: running vitest concurrently with Playwright spuriously un-skips the Layer 2 `tests/admin/test-auth-gate.test.ts` HTTP positive-path tests (Playwright's dev-build webServer makes the test-auth endpoint reachable, so `describe.skipIf(!isReachable)` admits them; vitest's runs of the createUser pre-clean don't always succeed, leading to 410 from the create-only gate). **Always run `pnpm test` standalone** when validating M4 baseline; don't parallelize with Playwright.
- [x] **Specific files present**:
  - [x] `PRODUCT.md` at repo root (established at `848fd4f`).
  - [x] M1 parser modules: `lib/parser/index.ts`, `lib/parser/types.ts`, `lib/parser/diagrams.ts`, `lib/email/canonicalize.ts`, `lib/invariants/runInvariants.ts`.
  - [x] M2 schema: 3 migrations in `supabase/migrations/2026050100*`. `crew_members.role_flags`, `transportation.schedule` JSONB, `shows.opening_reel_*` columns, `shows.coi_status`, `shows_internal.financials`, `shows.schedule_phases` etc. all defined.
  - [x] M2 seed: `supabase/seed.ts` loads the 10-fixture corpus.
  - [x] M3 dev panel: `app/admin/dev/page.tsx`, `app/admin/dev/actions.ts`, `dev` schema clone migration `supabase/migrations/20260502000000_dev_schema_clone.sql`.
  - [x] `playwright.config.ts` projects: `mobile-safari`, `desktop-chromium`, `dev-build`, `prod-build`, `prod-runtime-flip`.
  - [x] `lib/auth/requireAdmin.ts` (M3) — interface stable; M5 will replace the body.
  - [x] `tests/e2e/helpers/signInAs.ts`, `ADMIN_FIXTURE`, `NON_ADMIN_CREW_FIXTURE` (M3 minimal stubs; M5 replaces with real OAuth).
  - [ ] **`DESIGN.md` does NOT exist.** Task 4.1 creates it.
  - [ ] **`lib/data/getShowForViewer.ts` does NOT exist.** Task 4.3.
  - [ ] **`lib/visibility/scopeTiles.ts` does NOT exist.** Task 4.6.
  - [ ] **`lib/visibility/emptyState.ts` and `lib/visibility/openingReelText.ts` do NOT exist.** Task 4.14.
  - [ ] **`lib/time/rightNow.ts`, `lib/realtime/subscribeToShow.ts`, `lib/realtime/showInvalidation.ts`, `lib/auth/resolveShowViewer.ts` do NOT exist.** Tasks 4.11 / 4.16.
  - [ ] **`lib/messages/lookup.ts` does NOT exist.** This is X.* cross-cutting territory but the §17.1 invariant ("no raw error codes in user-visible UI") activates the moment crew-page tiles render error states. **M4 must ship a minimal `lib/messages/lookup.ts`** with at least the codes any M4 tile/empty-state/AC-4.5 path renders (`LINK_NO_CREW_MATCH`, `OPENING_REEL_NOT_VIDEO`, soft warning copy for `PULL_SHEET_PARSE_PARTIAL` / `PULL_SHEET_AMBIGUOUS_FORMAT`, MI-8c review-pending copy for AC-4.11/4.12). X.6 later expands it.
- [x] **Specific env vars set in `.env.local`**: M2/M3 vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_DEV_PANEL_ENABLED`, `TEST_AUTH_SECRET`, `ENABLE_TEST_AUTH`) all present. M4 introduces `SUPABASE_JWT_SECRET` (server-only, used by Task 4.16's Broadcast JWT mint) and `SUPABASE_REALTIME_ISS` (issuer claim for Realtime JWTs). Document the additions in `.env.local.example` when Task 4.16 lands.
- [x] **Database migrations applied**: all M2 + M3 migrations applied to local Supabase. Task 4.16 introduces a new migration adding `crew_member_auth.last_changed_at` + `crew_members.last_changed_at` columns, two UPDATE triggers, and the `viewer_version_token(show_id uuid) returns text` SECURITY-DEFINER helper. Apply via `pnpm dlx supabase db reset && pnpm db:seed`.

If any required pre-flight command fails, do NOT start the next M4 task. Stop and report.

## 5. Plan-wide invariants that apply (from AGENTS.md §1)

Tick each + confirm test coverage:

- [x] **TDD per task** (always applies). Every task: failing test → minimal implementation → passing test → commit. Self-review runs after.
- [x] **Per-show advisory lock** — **N/A for M4 read paths**. M4 is overwhelmingly READ-only; no tile or component mutates `shows`/`crew_members`/`crew_member_auth`/`pending_*`. **EXCEPTION**: Task 4.16's Phase-2 `publishShowInvalidation(tx, showId)` helper runs INSIDE existing Phase-2 commit transactions (Tasks 6.5/6.11/etc. — those mutate `shows` and already hold the per-show advisory lock; the helper inherits, doesn't take a fresh lock). The helper itself is a `pg_notify` only; no direct table mutation occurs in M4 code. The UPDATE triggers Task 4.16 introduces fire on existing `crew_member_auth` / `crew_members` mutations from M5/M6 (which take their own locks). M4 does NOT add a new lock-taking code path.
- [x] **Email canonicalization at boundary** — applies indirectly. `getShowForViewer` (Task 4.3) does NOT take an email parameter. `lib/auth/resolveShowViewer.ts` (Task 4.16) reads cookie/session-derived emails — those flow through the existing `validateLinkSession` / `validateGoogleSession` / `isAdminSession` helpers which already canonicalize at their boundaries. **M4 must NOT introduce any new inline `.toLowerCase()` / `.trim()` on email strings** — every email comparison routes through `lib/email/canonicalize.ts`. Static guard in tests (M3 already shipped `tests/admin/no-inline-email-normalization.test.ts`); add a similar grep guard for any new auth-touching M4 file.
- [x] **No global cursor** — applies. M4 has no sync code, but the §3.2/§5.2 prohibition is in effect. Verification: `! rg "lastPollAt" lib app supabase tests` returns zero matches at M4 close. (M3 already passed this.)
- [x] **No raw error codes in user-visible UI** — **fully active for M4**. Every tile, empty-state placeholder, and toast/banner that renders user-facing text must route through `lib/messages/lookup.ts`. The dev panel exemption (M3) does NOT extend to crew-page renderings. Test command: a regression spec that scans the crew-page DOM for `MI-`/`PULL_SHEET_`/`LINK_`/`OPENING_REEL_`/`SHOW_REALTIME_`/etc. literal strings and fails if any are found — exception: `data-testid` attributes and `<!-- comments -->` are excluded from the scan since they're invisible to users.
- [x] **Commit per task** — applies. AGENTS.md §1.6: `<type>(<scope>): <summary>` (e.g., `feat(crew-page): LodgingTile`, `feat(data): getShowForViewer`, `feat(realtime): ShowRealtimeBridge`, `chore(design): establish DESIGN.md tokens for crew page UI`). Don't batch tiles. Don't use bare `crew-page:`. M3 set `feat(admin):` / `test(sync):` / `feat(db):` precedent — match it.

## 6. Watchpoints from prior adversarial review

M4 has not yet been implemented; no prior convergence log exists. Watchpoints below are derived from M0/M1/M2/M3 convergence logs + the global CLAUDE.md / AGENTS.md additions, filtered for M4-applicable failure modes.

1. **Tailwind v4 align-items default.** This project's Tailwind v4 does NOT default `.flex` to `align-items: stretch`. **Every fixed-dimension parent → flex/grid child stretch relationship MUST be explicit** (`items-stretch`, `h-full`, `self-stretch`, or inline style). Per `memory/feedback_tailwind_v4_flex_items_stretch.md`. Each tile's "Dimensional Invariants" section in §8.4 is the source of truth — don't compress.

2. **Layout-dimensions Playwright assertion is mandatory** (Task 4.13, AGENTS.md §4). Every component with a fixed-dimension parent containing flex/grid children gets a real-browser assertion via `getBoundingClientRect()` at every documented `data-testid`. **Jest + jsdom is NOT sufficient** — jsdom doesn't compute real layout, so layout-collapse bugs pass unit tests. AC-4.4 enumerates all 5 §8.4 invariants; the test must exercise every one.

3. **Transition Inventory enumeration is mandatory for stateful components** (Task 4.12, AGENTS.md §4). RightNowCard has 12 §8.2 states ⇒ 66 ordered pairs. Each pair gets either an explicit animation (`crossfade-body`/`morph-to-last-good`) or `instant — no animation needed` or `unreachable — assert never triggered`. Compound transitions (state A changes while state B is mid-animation) are required — these produce the subtlest bugs.

4. **Error states route through `lib/messages/lookup.ts`** (§12.4, AGENTS.md §1.5). No raw error codes in crew DOM. The `lib/messages/lookup.ts` module itself doesn't yet exist — Task 4.14 (or whichever M4 task first surfaces an error) must ship a minimal version.

5. **Identity-only mock; `?role=` is ignored.** Every M4 page/route extracts ONLY `?crew=<crewMemberId>` and `?as=admin` from `searchParams` — `?role=` ignored even if present. Regression test `tests/e2e/role-spoof.spec.ts` (Task 4.2) asserts `?role=lead` cannot unlock financials. **`getShowForViewer` (Task 4.3) MUST NOT accept caller-supplied `role_flags` / `viewerRole`** — static-analysis test asserts the function signature.

6. **Cross-show binding fail-closed.** `getShowForViewer` lookup binds BOTH `id` AND `show_id` against `crew_members`. A `crewMemberId` from a different show throws `LINK_NO_CREW_MATCH` (§7.2.2 step 5; spec §12.4). Cross-show seed regression test mandatory.

7. **Canonical SCOPE_TILE_VISIBILITY_RULE** (Task 4.6, §8.1). Single source of truth at `lib/visibility/scopeTiles.ts`: `audioScopeVisible = hasA1 || hasLead`, `videoScopeVisible = hasV1 || hasLead`, `lightingScopeVisible = hasL1` (LEAD intentionally excluded). NO ad-hoc inline `viewerRole === 'LEAD'` checks anywhere. Task 4.12's transition matrix imports the predicates — no inline rule restatement.

8. **End-to-end `assigned_names` contract** (Task 4.7). The field flows parser → seed → persistence (Phase-2 JSONB write) → `getShowForViewer` projection → TransportTile predicate. Layer-spanning fixture test required: any layer that strips it silently breaks branch-2 visibility. The `getShowForViewer` projection regression test (Task 4.3) is the upstream check; the TransportTile end-to-end test (Task 4.7) is the downstream check.

9. **Pack-list timezone derivation** (Task 4.9). Today's WorkPhase set comes from `ShowRow.schedule_phases[isoDate]` keyed in the SHOW'S local timezone via `formatInTimeZone(today, tz, 'yyyy-MM-dd')` — NOT UTC. `today.toISOString().slice(0,10)` would give crew near midnight in non-UTC zones the wrong key. `PACK_LIST_VISIBLE_PHASES = {Set, Strike, Load Out}` — Load In is excluded per spec §8.1.

10. **Opening-reel URL-strip render contract** (Task 4.14, §10). Crew DOM MUST NEVER contain `https://` or `drive.google.com`/`docs.google.com` substrings for any opening-reel fixture, AT ANY MILESTONE. M4 ships URL-stripped text only — NO `<video>` element. `/api/asset/reel/<show>` is created in M7 Task 7.6; rendering `<video src=/api/asset/reel/...>` from M4 would 404. Regression assertion: `await expect(page.locator('main').textContent()).not.toContain('https://')` AND `await expect(page.locator('video[src*="/api/asset/reel/"]')).toHaveCount(0)`.

11. **Realtime transport choice** (Task 4.16). `postgres_changes` filtered streams CANNOT be authenticated for redeemed-link viewers (no Supabase Auth session) and RLS denies subscriptions to `crew_member_auth` regardless. **The transport is a single server-owned Realtime Broadcast topic** `show:<showId>:invalidation`, gated by a custom-issued JWT minted from the `__Host-fxav_session` cookie. Any reintroduction of `postgres_changes` is a regression.

12. **Composite `viewer_version_token`** (Task 4.16). `GREATEST(shows.last_synced_at, MAX crew_member_auth.last_changed_at, MAX crew_members.last_changed_at)` — auth-only mutations (Issue New Link, role_flags edits without paired `UPDATE shows`) must bump the token, otherwise the (T0,T1) catch-up race false-positive-cleans. DDL for the `last_changed_at` columns + UPDATE triggers + helper lives in this milestone's new migration.

13. **DESIGN.md is the gate.** Task 4.1 must complete and commit BEFORE any subsequent tile task can dispatch — every tile uses tokens that DESIGN.md defines (color, typography, spacing, motion timings). Dispatching 4.2+ before 4.1 lands risks token churn.

14. **Anti-tautology rule for tests** (CLAUDE.md / AGENTS.md). When asserting that a tile renders a label, first clone the DOM and remove sibling elements that independently render the same label. Pack-list tests must cover the timezone-edge case (crew near midnight in non-UTC zones). RightNowCard tests must exercise EVERY §8.2 state — `viewer_off_day_pre` and `dateless` cannot be omitted.

15. **Pre-draft code-verification pass.** Before naming any file/function/field/component prop in test scaffolding, grep against the live codebase. M2 schema already defines column names; M1 parser type names already exist. Don't invent. M3 added `signInAs` / `ADMIN_FIXTURE` / `NON_ADMIN_CREW_FIXTURE` / `requireAdmin()` / dev schema; reuse, don't reinvent.

16. **Self-consistency sweep.** At M4 close: `! rg "viewerRole|role_flags\s*:\s*[A-Z]" lib/data lib/visibility components` should match the static-analysis tests; `! rg "https://drive\.google\.com|drive\.google\.com" tests/fixtures` may match (fixtures intentionally contain raw URLs to exercise the URL-strip pipeline) but `! rg "drive\.google\.com" components app/show` MUST NOT match (renderers strip).

## 7. Test commands

- **Pre-flight and final gate**: `pnpm test && pnpm lint && pnpm typecheck`. Do NOT parallelize `pnpm test` with Playwright — see §4 note about Layer 2 HTTP test un-skipping.
- **Vitest unit / data tests**: `pnpm test tests/data/getShowForViewer.test.ts`, `pnpm test tests/time/rightNow.test.ts`, `pnpm test tests/visibility/`, `pnpm test tests/realtime/`.
- **Playwright e2e (mobile-safari, primary)**: `pnpm test:e2e --project=mobile-safari`.
- **Layout-dimensions test (mandatory, AC-4.4)**: `pnpm test:e2e tests/e2e/layout-dimensions.spec.ts --project=mobile-safari` AND `--project=desktop-chromium` (need both viewports to cover 390/1024/1200).
- **Transition-audit test (mandatory, Task 4.12)**: `pnpm test:e2e tests/e2e/right-now-transitions.spec.ts`.
- **Role-spoof regression**: `pnpm test:e2e tests/e2e/role-spoof.spec.ts`.
- **Realtime live-sync test (Task 4.16)**: `pnpm test:e2e tests/e2e/apply-driven-refresh.spec.ts`.
- **DB schema introspection regression** (M2 baseline): `pnpm test tests/db/`.
- **Supabase reset + seed** (full reset including new M4 Task 4.16 migration): `pnpm dlx supabase db reset && pnpm db:seed`.

## 8. Exit criteria

- [ ] Tasks 4.1–4.16 in `03-04-tiles.md` (lines 175–836) all checked off.
- [ ] All AC-4.1..AC-4.12 each have at least one passing assertion.
- [ ] `DESIGN.md` exists at repo root with a documented token surface (colors light+dark, type scale, spacing scale, radii, motion timings).
- [ ] `app/show/[slug]/page.tsx` and `app/show/[slug]/layout.tsx` exist; identity-only mock implemented; `?role=` ignored.
- [ ] `lib/data/getShowForViewer.ts` exists with the `Viewer` discriminated union (`crew | admin | admin_preview`), id+show_id-bound crew lookup, fresh role re-derivation, `LINK_NO_CREW_MATCH` cross-show throw, transportation projection preserving `assigned_names`.
- [ ] All tile components present in `components/tiles/`: Lodging, Venue, Crew, Contacts, Schedule, AudioScope, VideoScope, LightingScope, Transport, ShowStatus, Financials, PackList, Notes.
- [ ] `components/right-now/RightNowCard.tsx` + `lib/time/rightNow.ts` (state machine).
- [ ] `lib/visibility/scopeTiles.ts` (canonical SCOPE_TILE_VISIBILITY_RULE).
- [ ] `lib/visibility/emptyState.ts` + `lib/visibility/openingReelText.ts` (URL-strip).
- [ ] `lib/messages/lookup.ts` minimal version with M4-required codes.
- [ ] `components/realtime/ShowRealtimeBridge.tsx` + `lib/realtime/subscribeToShow.ts` + `lib/realtime/showInvalidation.ts` + `lib/auth/resolveShowViewer.ts` + `app/api/realtime/subscriber-token/route.ts` + `app/api/show/[slug]/version/route.ts`.
- [ ] New migration adding `crew_member_auth.last_changed_at`, `crew_members.last_changed_at`, two UPDATE triggers, `viewer_version_token(uuid) returns text` helper.
- [ ] Layout-dimensions Playwright spec exists and exercises all 5 §8.4 invariants at 390/1024/1200.
- [ ] Transition-audit spec covers all 66 RightNowCard pairs + capability-flip + transport-branch + ≥6 compound transitions.
- [ ] `pnpm test && pnpm lint && pnpm typecheck` exits 0 (vitest run standalone, not parallel with Playwright).
- [ ] `pnpm test:e2e --project=mobile-safari` exits 0; `pnpm test:e2e --project=desktop-chromium` exits 0 (for layout-dimensions at 1024+1200).
- [ ] `pnpm test:e2e tests/e2e/role-spoof.spec.ts` passes.
- [ ] `! rg "lastPollAt" lib app supabase tests` returns zero matches.
- [ ] `! rg "drive\.google\.com|docs\.google\.com" components app/show` returns zero matches (fixtures excluded).
- [ ] No `<video>` element renders against `/api/asset/reel/` at M4 (asset route ships M7).
- [ ] `! rg "viewerRole" lib app components` returns zero matches (canonical predicates only).
- [ ] All commits follow `<type>(<scope>): <summary>` format. Per AGENTS.md §1.6.
- [ ] Working tree is clean except for intentionally uncommitted handoff convergence-log updates left for the adversarial reviewer.
- [ ] Adversarial review (per `superpowers:adversarial-review` with GPT-5.5 / Codex per ROUTING.md) ran to convergence — recorded below.

## 9. Sandbox / git protocol

- [x] **Claude Code:** commits run in-session, no sandbox issue. Use `git add <specific files>` (NOT `git add -A`), then `git commit -m "feat(...): <summary>"` per AGENTS.md §1.6.
- [ ] **Codex CLI:** N/A — implementer is Claude Code per ROUTING.md M4 row + UI hard rule.

## 10. Adversarial review handoff

After Tasks 4.1–4.16 are committed:

1. Implementer (this session, via subagent-driven-development) summarizes what was built and confirms each per-task checklist is `- [x]`.
2. The adversarial reviewer (GPT-5.5 / Codex per ROUTING.md) is invoked via `superpowers:adversarial-review`. Inputs: §8 + §10 + §11 + §17.1 of the spec, the M4 plan section (`03-04-tiles.md` lines 175–836), this handoff, and the diff `git diff <M4-base-SHA>..HEAD -- 'app/show/**' 'app/api/realtime/**' 'app/api/show/**' 'components/**' 'lib/data/**' 'lib/visibility/**' 'lib/time/**' 'lib/realtime/**' 'lib/auth/resolveShowViewer.ts' 'lib/messages/**' 'tests/e2e/**' 'tests/data/**' 'tests/visibility/**' 'tests/time/**' 'tests/realtime/**' 'supabase/migrations/2026050300*' 'DESIGN.md' 'app/globals.css' 'tailwind.config.ts'`.
3. Reviewer iterates with implementer until convergence (no new issues raised in a round) or until ambiguity requires a human decision. Round cap: 3 (per skill); user-authorized overtime if findings are concrete-fixable rather than substantive disagreements (M0/M1/M2/M3 precedent — M3 took 8 rounds; M4's UI surface is broader and dimensional-invariant + transition-pair checklists are the #1 source of post-implementation animation bugs per CLAUDE.md, so 5–10 rounds is realistic; don't get discouraged).
4. Convergence is logged at the bottom of this file.

## 11. Cross-milestone dependencies

The plan text for M4 names a few items that touch milestone boundaries; implementer must surface each as a question to the orchestrator before writing implementation code if disposition is unclear. Recommended dispositions follow.

**(a) `lib/messages/lookup.ts`** — referenced by §17.1 invariant ("no raw error codes in UI") and required by M4 tile/empty-state surfaces. The full module is X.* cross-cutting.

> **Recommended disposition:** Create a minimal `lib/messages/lookup.ts` as part of the first M4 task that needs it (likely Task 4.4 or Task 4.14). Include only the codes M4 surfaces in user-visible UI: `LINK_NO_CREW_MATCH`, `OPENING_REEL_NOT_VIDEO`, `PULL_SHEET_PARSE_PARTIAL`, `PULL_SHEET_AMBIGUOUS_FORMAT`, MI-8c review-pending copy, `SHOW_REALTIME_BROADCAST_AUTH_FAILED`, `SHOW_REALTIME_CROSS_SHOW_FORBIDDEN`, `SHOW_VERSION_CROSS_SHOW_FORBIDDEN`. Operator-facing dev-panel codes (M3) remain raw per the existing exemption. X.6 expands the catalog later.

**(b) Phase-2 `applyStaged` write paths** — Task 4.16 adds `publishShowInvalidation(tx, showId)` calls inside Phase-2 commit transactions, but the Phase-2 commit code itself ships in M6 (Tasks 6.5 / 6.11).

> **Recommended disposition:** Task 4.16 ships the helper module and its tests, plus the SQL DDL (columns + triggers + helper function) AND wires `publishShowInvalidation` into any Phase-2-shaped code path that currently exists (M3's `dev_phase1_stage` is Phase-1-only, so it does NOT call the helper). M6's tasks then call `publishShowInvalidation(tx, showId)` from `applyParseResult` / `applyStagedParse` / etc. The DB UPDATE triggers on `crew_member_auth` / `crew_members` fire automatically the moment those rows mutate (M5 / M6) — no additional M5/M6 code needed beyond the existing UPDATE statements they already emit. This keeps the M4 propagation contract honest: every Phase-2 commit invalidates, regardless of which milestone authored the commit code.

**(c) `applyStaged` seed harness for Task 4.12 step 4b end-to-end live-sync test** — referenced in plan as "the test uses the `applyStaged` seed harness from Task 2.4 with a synthetic `transportation` UPDATE."

> **Recommended disposition:** M2 Task 2.4 shipped a basic seed harness; verify the harness can perform a synthetic Phase-2 UPDATE on `transportation` from the test setup. If not, extend the harness in this milestone to support the synthetic Apply path (NOT a raw SQL bypass — must use the same code path production sync uses, scoped through the dev schema where appropriate, to keep the parity claim honest).

**(d) Real Supabase Realtime Broadcast mock for tests** — the live-sync test (Task 4.12 step 4b + Task 4.16 step 1) requires a Realtime Broadcast mock to fire after a synthetic Phase-2 commit. Polling fallback is explicitly forbidden.

> **Recommended disposition:** Use Supabase's `@supabase/realtime-js` test utilities OR mock the underlying WebSocket transport with `vi.mock`. The mock must (a) admit the JWT minted by `/api/realtime/subscriber-token`, (b) deliver Broadcast payloads to subscribed clients, (c) fire `system.reconnected` / `system.disconnected` events on demand. If the mock surface gets large, factor into `tests/realtime/mockBroadcast.ts` so all M4+M5+M6 Realtime tests share one harness.

---

## Convergence log

_(empty — adversarial review is post-implementation; record results here after Codex review converges)_
