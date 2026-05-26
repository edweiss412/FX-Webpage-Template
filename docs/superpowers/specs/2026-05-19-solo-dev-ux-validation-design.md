# FXAV Solo-Dev UX Validation — Design Spec

**Spec date:** 2026-05-19 (amended 2026-05-26 — see §15.26 picker-pivot rebase)
**Working title:** Milestone 12 — Solo-dev UX validation
**Status:** Amended for M11.5 picker-pivot rebase (2026-05-26); pending adversarial-review R6 onward
**Milestone dependency:** M12 starts only after **M11** (user-facing docs at `/help`) closes. `/help` is load-bearing on the validation track (see §10). M11.5 (crew auth pivot to share-link + identity picker) is a *prior* milestone that closed 2026-05-25 at HEAD `b4b2c38`; this spec is rebased onto that closed milestone — see §15.26.
**Sibling specs:**
- Master crew-pages spec: [`docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md`](./2026-04-30-fxav-crew-pages-design.md)
- M11 user-facing docs: [`docs/superpowers/specs/2026-05-12-user-facing-docs-design.md`](./2026-05-12-user-facing-docs-design.md)
- **M11.5 crew auth pivot** (auth model for M12, canonical for v1 on every §5.2 / §7.2 / §7.2.1–3 / §9.2 surface that touched signed links): [`docs/superpowers/specs/2026-05-23-crew-auth-pivot-show-link-picker.md`](./2026-05-23-crew-auth-pivot-show-link-picker.md). The M11.5 close-out delta-list at [`docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/handoffs/M11.5-delta-for-m12.md`](../plans/2026-04-30-fxav-crew-pages-design/handoffs/M11.5-delta-for-m12.md) is the authoritative diff source for the rebase.

> **Ratified amendment (2026-05-26) — M11.5 picker-pivot rebase.** This spec was drafted 2026-05-19 against the pre-M11.5 per-crew signed-link auth model. M11.5 closed 2026-05-25 with a ratified pivot to one share-token per show + identity picker + optional Google-OAuth claim. Every M12 reference to per-crew signed links, `crew_member_auth`, `validateLinkSession`, `signLinkJwt`, `JWT_SIGNING_SECRET`, `/show/[slug]/p#t=<jwt>`, `revoked_links` validation usage, `LINK_*` catalog codes, `alias_5a_lead_for_revoke`, `alias_5a_lead_for_query_compromise` is replaced by the picker-pivot equivalent (tokenized URL form `/show/<slug>/<shareToken>/`, picker-cookie identity selection, `show_share_tokens` admin RPCs). The rebase is documented in §15.26 with class-sweep verification; the M11.5 delta-list is the rebase source-of-truth. The rebase inherits the M11.5 do-not-relitigate block (delta §6) verbatim; reviewers MUST NOT relitigate any of those contracts in M12 amendment review rounds.

---

## 1. Goal & scope

### 1.1 Goal

A solo-dev gate where the developer personally exercises every surface in the FXAV crew-pages product before any real user (Doug, real crew) touches it. Closure = dev sign-off that MUST-FIX is empty AND the dev would be proud to show Doug.

### 1.2 Why now

M0–M10 + X.1–X.6 closed in the master plan; M11 (`/help`) closes immediately before M12 starts. The code is implementation-complete, the audits are complete, the docs exist. The remaining gap is the one structural defenses cannot cover: **a human has not used the product end-to-end in a real browser**. The existing review layers — code review, adversarial review, impeccable v3 critique + audit, structural meta-tests, dimensional-invariant Playwright assertions — all simulate or formalize. None of them substitute for the dev personally walking through the product as it will be experienced.

### 1.3 Audience cut

This milestone is **solo-dev only**. Doug, real crew, and any other real user are explicitly excluded — pulling them in defeats the relationship-protection rationale (see §1.5). Doug's first use of the product is the *next* milestone (v1 launch); this one is the dev's pre-launch gate.

### 1.4 What this milestone catches that prior layers don't

Four bug-classes the dev-in-a-real-browser pass is shaped to surface, and which automated layers structurally cannot:

1. **Composition / cross-surface friction.** Each surface passed its review in isolation; the end-to-end journey across surfaces has rough seams that per-surface review is structurally blind to.
2. **Craft gap.** Heuristic-pass UI (impeccable APPROVED) that still feels prototype-y to a human eye. This is a quieter cousin of impeccable, not a re-do of impeccable.
3. **Real-device behavior.** Playwright at 390px viewport is not the same as actual iPhone Safari (notch, virtual keyboard, momentum scroll, autofill, share-sheet, real-OS dark-mode toggle).
4. **Reality-of-data / cold-start unfamiliarity.** Fixtures are sanitized; the dev knows the map. Bugs that only surface against unfamiliar data, or against the dev pretending not to know where everything is.

All four are load-bearing — the validation modes (matrix, journeys, cold-start) are shaped to cover one bug-class each.

### 1.5 Why solo-dev and not real-user testing

Doug is the stakeholder, not the QA team. He's busy with his existing PM role. If he touches an early version and hits friction, **the working relationship is what gets damaged — not the bug fix.** The dev's job in M12 is to put the product in a state where Doug's first use of it is a clean experience. M12 is the gate that protects the working-relationship asset.

This is also why the milestone is *not* extended to include Doug-data, Doug-feedback, or any third-party touch. The post-M12 v1-launch milestone is where real users enter.

---

## 2. Out of scope (explicit deferrals)

- **Custom domain / DNS / public launch.** This milestone uses a `*.vercel.app` production deployment URL (no custom domain) throughout. Domain + launch is a separate follow-on milestone (v1 launch).
- **Doug, real crew, or any third-party touching the product.** Per §1.5.
- **Push notifications, outbound email, SMS.** Tracked in `BACKLOG.md` (BL-PUSH-NOTIFICATIONS). Alert paths in M12 are dashboard-only.
- **New product features.** M12 fixes what's there; it does not extend the product.
- **Extending the impeccable v3 framework.** Craft validation through *human eyes* is the new mode; the framework is unchanged.
- **Code review / adversarial review of UI code.** M0–M10 + X.* + M11 already covered that. M12 doesn't re-review code; it exercises the product.
- **Build-flagged routes** (e.g., `/admin/dev/*` per `scripts/with-admin-dev-flag.mjs`). They are not in the preview build and therefore not validated.
- **Multi-admin support.** Spec currently assumes a single admin. Per the master spec deferral.

---

## 3. Persona inventory ("the hats")

The matrix is **personas × surfaces**. The full persona inventory:

> **Rebase note (2026-05-26 picker-pivot, per §15.26).** Personas 5 + 6 below were originally described as "Signed-link crew — LEAD" / "Signed-link crew — non-LEAD scope variants." Post-M11.5 picker pivot, the access path is the share-link + picker (`/show/<slug>/<shareToken>/` + skip-pick identity), and persona 5 + 6 should be read as "picker-LEAD" / "picker-non-LEAD." The auth-state column's signed-link URLs are historical context; the actual flow uses the share URL from `CurrentShareLinkPanel` → iPhone Safari → `<SignInOrSkipGate>` Mode A skip → picker → identity tap. Persona 7 (Google-OAuth crew) gains an optional identity-claim path via the picker's lazy-mint bootstrap per Resolved Decision 17 of the picker pivot spec.

| # | Persona | Auth state | Distinguishing surface concern |
|---|---|---|---|
| 1 | Anonymous / unauthenticated | No session | Clean 401 / 403 / redirect-to-sign-in per surface |
| 2 | Doug as admin — steady state | Signed in via Google, admin-role confirmed, watched folder populated, active shows present | Default `/admin` arrival; AlertBanner; staged-review cards |
| 3 | Doug as admin — onboarding cold start | Signed in, watched folder NOT yet pointed | Onboarding wizard surfaces (M10) |
| 4 | Admin previewing as crew | Admin session, `/admin/show/<slug>/preview/<crew-id>` path | Impersonation banner composed with crew-page content; role-filter applied |
| 5 | Signed-link crew — LEAD role | Fresh `/show/<slug>/p#t=<jwt>` (fragment token; master spec §7), role_flags includes `LEAD` | Full content visible including `shows_internal.financials`; no role-hiding |
| 6 | Signed-link crew — non-LEAD scope variants | Fresh `/show/<slug>/p#t=<jwt>`, role_flags excludes `LEAD` | Role-filter sentinels active. **Multiple sub-variants exercised** — see §3.2 for the role-variant inventory. |
| 7 | Google-signed-in crew (fresh + return) | Google OAuth path on `/show/[slug]` (NOT signed-link). Validates `validateGoogleSession` for show-bound surfaces AND `validateGoogleIdentity` for `/me` (master spec line 2266 — separate validators). | Same crew-page surface, different session origin. Fresh OAuth and return OAuth sessions exercised separately because the first-sign-in chrome differs from the subsequent-visit chrome. |
| 8 | Signed-in identity cross-show — `/me` | Google OAuth session with no show binding | The cross-show "which shows do I belong to" surface (master spec §7.3). Distinct from persona 7 because the validator is different and the surface is not show-scoped. |

**Persona 3 vs 2** is split because the UX changes shape (wizard vs steady state). **Personas 5 and 6** share the surface column for `/show/[slug]/p` but get separate matrix rows so role-hiding is exercised explicitly. **Persona 7** is split into fresh vs return OAuth sub-cases — the first-sign-in chrome (consent screen, fresh session establishment) differs from return-visit chrome and exercises different code paths. **Persona 8** is a distinct surface (`/me`) that uses a different validator (`validateGoogleIdentity`, not `validateGoogleSession`) per master spec line 2266; the audit allowlist X.3 explicitly enforces the separation, so this surface must be exercised independently.

### 3.2 Non-LEAD role-variant inventory (Persona 6 sub-cases)

Master spec §6.6 (lines 1417–1420) enumerates the canonical role_flags vocabulary: `LEAD`, `A1`, `A2`, `V1`, `L1`, `BO`, `GS`, `ONLY`, `CAM_OP`, `GAV`, `FLOATER`, `FLOOR`, `STREAM`, `PTZ`, `LED`, `SHOW_CALLER`, `GREEN_ROOM`, `OWNER`, `CONTENT_CREATION`. **LEAD is the only auth-bearing flag** — it gates `shows_internal.financials` visibility. The rest are department / scope-tile designators (line 1561 amendment 8): they don't change auth, but they DO change which scope-tiles render on the crew page (per plan tasks 4.6 / 4.12 capability predicates).

Persona 5 (LEAD) and persona 6 (non-LEAD) are therefore not single rows each but families. The plan exercises **at minimum the following sub-variants** across both:

| Sub-variant | role_flags fixture | What this catches |
|---|---|---|
| 5a — Pure LEAD | `["LEAD"]` | LEAD financial visibility; no scope-tile coupling |
| 5b — Compound LEAD + audio | `["LEAD","A1"]` | Compound LEAD+scope (master spec §6.6 line 1418 explicit example `LEAD / A1`). Validates that LEAD financials AND A1 scope tile coexist correctly. |
| 5c — Compound LEAD + backstage | `["BO","LEAD"]` | Compound LEAD+BO (master spec line 1418 `BO - LEAD` example). Validates non-A1 LEAD compound. |
| 6a — Audio scope | `["A1"]` | Audio scope-tile visibility (A1/A2 collapse via `hasA1` predicate) |
| 6b — Video scope | `["V1"]` | Video scope-tile visibility |
| 6c — Lighting scope | `["L1"]` | Lighting scope-tile visibility (`hasL1` predicate) |
| 6d — Backstage-only / no scope | `["BO"]` | The non-LEAD with no scope-specific tile — confirms the no-tile case renders cleanly without empty-state crashes |
| 6e — Compound non-LEAD | `["A1","L1"]` or `["GS","A1"]` | Compound atomic-flag rendering; both scope tiles visible |
| 6f — Unrecognized role / `[]` | `[]` (no flags) | The empty-flags edge case; confirms the page does not crash or expose financials |

The plan walks each 5a–5c + 6a–6f variant for the crew page and for preview-as-crew (persona 4 with each role variant). Real-iPhone exercise (§3.1) is required for 5b + 6a + 6d + 6f as the highest-leverage sample; the rest are exercised on Vercel `*.vercel.app` production URL in desktop + emulated mobile.

### 3.3 Date and stage restriction axes (orthogonal to role)

Master spec §6.6 + §8 establish that `date_restriction` and `stage_restriction` are independent of `role_flags` and drive Right Now card state, schedule tile filtering, and pack-list tile visibility. These are validation-significant axes the role-only matrix would miss.

| Axis | Variants the plan exercises | Surfaces that change |
|---|---|---|
| `date_restriction.kind` | `none` (default), `explicit` with subset of show days, `unknown_asterisk` (parsed from `ONLY***`) | Right Now card state (`viewer_unconfirmed`, `viewer_off_day`, `viewer_off_day_pre`, `viewer_after_last_day` per master spec §8 lines 2411–2414); schedule tile filtering (master spec §8 lines 2372–...) |
| `stage_restriction.kind` | `none` (default), `explicit` with `["Load In", "Set"]` (set-only), `explicit` with `["Load Out", "Strike"]` (strike-only), `explicit` with all four stages (the `ONLY` flag with no subset) | Pack-list tile per-day visibility (master spec §8 line 2395) |
| Today vs assigned-day | Today inside explicit days, today outside explicit days, today before first assigned day, today after last assigned day | Right Now card precedence rule "viewer date_restriction always takes precedence over show-wide state" (master spec line 2405) |

The plan exercises at minimum the following restriction combinations across crew personas (5/6/7) and preview persona 4:

| Combo | date_restriction | stage_restriction | Day-of-walk | Expected outcome |
|---|---|---|---|---|
| R1 | `none` | `none` | Set day | All tiles render with no role/restriction filter; pack-list visible (set day) |
| R2 | `explicit` (today included) | `none` | Set day | Schedule shows assigned days; Right Now shows assigned-day state; pack-list visible |
| R3 | `explicit` (today excluded) | `none` | Set day → `viewer_off_day` | Right Now card renders `viewer_off_day` copy. **Pack-list VISIBLE** (R24 corrected from earlier draft — dateRestriction affects only Right Now + Schedule per live code; pack-list visibility is governed by `stage_restriction` + day-phase only, per master spec line 2395. Date restriction does NOT hide the pack-list tile). Scope tiles: role-only (none in this fixture since R3 uses LEAD-baseline). |
| R4 | `unknown_asterisk` | `none` | Any day → `viewer_unconfirmed` | Right Now card renders `viewer_unconfirmed` copy regardless of show-wide state |
| R5 | `explicit` (today before first assigned day) | `none` | Pre-show day → `viewer_off_day_pre` | Right Now card renders pre-first-assignment copy with day countdown |
| R6 | `explicit` (today after last assigned day) | `none` | Post-show day → `viewer_after_last_day` | Right Now card renders "assignment complete" copy |
| R7a (R8 amendment — split from R7) | `none` | `explicit ["Load In","Set"]` | Set day | Pack-list VISIBLE; Right Now shows set-day state |
| R7b (R8 amendment — split from R7) | `none` | `explicit ["Load In","Set"]` | Strike day | Pack-list HIDDEN (stage filter excludes strike); Right Now shows strike-day state |
| R8a (R8 amendment — split from R8) | `none` | `explicit ["Load Out","Strike"]` | Strike day | Pack-list VISIBLE; Right Now shows strike-day state |
| R8b (R8 amendment — split from R8) | `none` | `explicit ["Load Out","Strike"]` | Set day | Pack-list HIDDEN (stage filter excludes set day); Right Now shows set-day state |

**R8 amendment rationale.** Earlier R7 / R8 each compressed two distinct day-walks into a single row, but the re-seed contract materializes ONE fixture per combo with one expected `today` state. A single fixture/walk can satisfy only one side. To prove pack-list visibility behavior on both set-day-only and strike-day-only restrictions, R7 splits into R7a (set-day-visible) + R7b (strike-day-hidden), and R8 splits into R8a (strike-day-visible) + R8b (set-day-hidden). Total combos: 8 → 10 (R1–R6 + R7a + R7b + R8a + R8b).

The day-of-walk uses **wall-clock + fixture-data engineering**, NOT the M11 `X-Screenshot-Frozen-Now` header. Rationale: that header is gated by `ENABLE_TEST_AUTH=true` + `TEST_AUTH_SECRET` per M11 §3.6.2; the prod-equivalent Phase 0 stack does NOT enable `ENABLE_TEST_AUTH` (security risk in production-target deployment per master spec §7 + M11 spec hardening). Therefore clock control on the validation stack uses the wall-clock-as-truth approach:

1. **Fixture-data calendar alignment.** The plan engineers each restriction-combo fixture's `dates.travelIn / dates.travelOut / date_restriction.days` relative to the dev's intended walk day. E.g., for R3 (today excluded from explicit days), the fixture is seeded with `date_restriction.days = ["<yesterday>", "<tomorrow>"]` and `today` becomes the off-day naturally. For R5 (pre-show), the fixture's `dates.travelIn` is two days in the future. For R6 (post-show), the fixture's `dates.travelOut` is yesterday.
2. **Re-seeding between walks (cheap).** When the dev's walk day changes (e.g., the validation milestone spans multiple real days), the plan provides a re-seed script that adjusts fixture dates relative to `now()`. The script is idempotent and re-runnable.
3. **No code path changes.** This approach changes data, not code. The application reads `now()` from `lib/time/now.ts` which in production returns the real system clock. No test-auth bypass; no production-unsafe headers.
4. **Phase 0 verification.** Phase 0 smoke test 5 (added in R3) verifies the re-seed mechanism by setting a fixture to `viewer_off_day` state and confirming the Right Now card renders the off-day copy. This proves the data-engineering approach actually drives the state transitions before Phase 1 starts.

5. **Walk-session gate (added R4, contract specified R5).** Before every walk session — initial sweep (§7.2 step 2), targeted re-exercise (§7.2 step 5), or final sweep (§7.2 step 7) — the dev MUST run the re-seed script (or verify the seed-date stamp matches the current local date). Stale fixtures block walk progression.

**Re-seed script contract (R5 amendment).** The script and its CLI contract are concrete deliverables, not plan-time TBDs:

| Aspect | Contract |
|---|---|
| Script path | `scripts/validation-reseed.ts` (TypeScript, executed via `tsx`) |
| Invocation | `pnpm validation:reseed [--combo <R1\|R2\|R3\|R4\|R5\|R6\|R7a\|R7b\|R8a\|R8b\|SW-PRE_TRAVEL\|SW-TRAVEL_IN\|SW-SHOW_1\|SW-SHOW_INTERIOR\|SW-SHOW_LAST\|SW-POST_SHOW\|all>]` |
| Default behavior | `--combo all` — materializes all **16 combos**: 10 R-combos (R1–R6 + R7a/R7b/R8a/R8b after R8 split) + 6 show-wide states (SW-PRE_TRAVEL / SW-TRAVEL_IN / SW-SHOW_1 / SW-SHOW_INTERIOR / SW-SHOW_LAST / SW-POST_SHOW after R11 split) with date columns aligned to today's local date. `pnpm validation:check-seed --combo all` requires all 16 combo names present in `combos_materialized` to return exit 0. |
| Target selection (R9 amendment + R11 correction) | Script requires the prod-equivalent Supabase target — NOT local. Reads **three** required env vars (aligned with repo convention from `.env.local.example:5` which uses `SUPABASE_SECRET_KEY` not `SERVICE_KEY`): **`VALIDATION_SUPABASE_URL`** + **`VALIDATION_SUPABASE_SECRET_KEY`** + **`VALIDATION_SUPABASE_PROJECT_REF`**. All three are mandatory; missing any aborts. If `VALIDATION_SUPABASE_URL` matches `localhost`, `127.0.0.1`, or `::1` the script aborts unless `--allow-local-override` is passed (intentional override gate; not used during M12 walks). Phase 0 sub-task adds all three to the dev's local `.env.local` AND extends `.env.local.example` with each as a documented placeholder. The Supabase project ref is stamped in `validation_state.seeded_supabase_project_ref` (added in §3.3.2 DDL) so check-seed can verify target consistency (`check-seed` fails if `seeded_supabase_project_ref != $VALIDATION_SUPABASE_PROJECT_REF`). |
| Idempotency | Re-running with the same args on the same day is a no-op. Re-running with a different date updates every fixture's date columns. **R18 clarification: `--combo <single>` is UPSERT-ONLY for the target combo and its associated alias_map entries — it does NOT touch other combos' fixtures, crew_members, or alias_map keys. To re-seed everything from scratch use `--combo all`.** |
| Storage of `validation_seed_date` stamp | New table `validation_state` (single row), admin-only per §3.3.2 below. Schema specified in §3.3.2. The script writes to this table at the end of a successful seed. |
| Verification command | `pnpm validation:check-seed` returns exit 0 if `last_seed_date = today` AND `combos_materialized` covers what the next walk needs; returns exit 1 otherwise. The dev runs this at the start of every walk session per §3.3 step 5 above. |
| Owned fixture mappings (rebased 2026-05-26 for M11.5 picker pivot) | One fixture per R-combo + one fixture per show-wide state. The canonical mapping table inline: R-combo or state → `{showName, date_restriction, stage_restriction, dates, expected_today_state, crew_members: [{alias, name, email, role_flags}]}`. **Crew-member contract per fixture (post-M11.5 rebase):** every R-combo fixture seeds **9 crew_members** — one per role-variant alias enumerated in §3.2:

- **9 role-variant aliases** per §3.2: `alias_5a_lead`, `alias_5b_lead_a1`, `alias_5c_bo_lead`, `alias_6a_a1`, `alias_6b_v1`, `alias_6c_l1`, `alias_6d_bo`, `alias_6e_a1_l1`, `alias_6f_empty`

Each crew_member carries the role_flags per §3.2. Predictable emails: `validation+5a@example.com`, `validation+5b-lead-a1@example.com`, etc. Restriction combos (date / stage) apply to ALL 9 crew_members. **Show-wide state fixtures** seed only the LEAD crew_member (5a) — show-wide states are LEAD-only per §3.3.1.

**Pre-M11.5 historical note.** Earlier R22/R23 spec rounds added `alias_5a_lead_for_revoke` (10th) + `alias_5a_lead_for_query_compromise` (11th) to isolate the J3 signed-link revoke + query-token-compromise legs from the baseline alias. The 2026-05-26 picker-pivot rebase retires both — the picker pivot's destructive admin actions (share-token rotation + picker-epoch reset) are inherently fixture-clean (rotation invalidates ALL devices for the show; epoch reset invalidates ALL cookies for the show), so there is no surgical-revocation poisoning vector to defend against. The two J3-isolation aliases are deleted from the seed contract; J3's OAuth-claim leg (c) reuses the baseline `alias_5a_lead` + `alias_6a_a1` (the `claimed_via_oauth_at` stamp is reversible only by re-syncing the fixture sheet to recreate the `crew_members.id`, which `--combo all` does deterministically — the next `--combo all` after an OAuth-claim walk re-creates the affected rows with fresh ids and null `claimed_via_oauth_at`, restoring the baseline).

**Total alias_map leaf entries (post-pivot rebase):** 10 R-combos × 9 aliases + 6 SW-states × 1 alias = **96 aliases**.

**Picker-fixture lockstep contract (replaces the retired crew_member_auth UPSERT contract).** The picker resolver's eligibility check (`resolvePickerSelection` → `crew_members.email IS NOT NULL` + valid for the show) requires that every seeded crew_member has a non-null canonical email present. The re-seed script MUST:

- For every R-combo fixture: write **9** `crew_members` rows with `email`, `name`, `role_flags`, and the implicit canonical-email derivation handled by the existing email-canonicalization helper (`lib/email/canonicalize.ts` is the only function permitted to touch raw emails before they enter the system — AGENTS.md invariant 3).
- For every SW-state fixture: 1 `crew_members` row (LEAD only).
- The `show_share_tokens.share_token` row is auto-created by the existing `shows_create_share_token_after_insert` trigger when the `shows` row is inserted (per migration `20260523000002_show_share_tokens.sql`); the re-seed script does NOT write `show_share_tokens` directly. If a fixture's show row already exists (re-seed after first apply), the trigger's `ON CONFLICT (show_id) DO NOTHING` clause preserves the existing share_token (so the dev's bookmarked URL stays valid across re-seeds; `--combo all` does NOT rotate the share-token unless the dev explicitly does so via `RotateShareTokenButton`).
- `crew_members.claimed_via_oauth_at` is **NOT** seeded as non-null by re-seed — it is null at fixture creation, allowing every seeded identity to be picker-selectable by default. J3 leg (c)'s OAuth-claim walk stamps it via the live `claim_oauth_identity` RPC during the walk; subsequent `--combo all` re-creates the rows with fresh ids and null `claimed_via_oauth_at`, restoring the baseline.
- The mutation is performed inside the per-show advisory lock (`pg_advisory_xact_lock(hashtext('show:' || drive_file_id))`) per project invariant 2.

**Cleanup contract (replaces the retired `revoked_links WHERE revoked_reason LIKE 'validation:%'` cleanup).** Post-pivot, there are no `revoked_links` rows to clean (the table was dropped at M11.5 G3 cutover per `20260523000099_cutover_drop_m9_5.sql`). The picker pivot's equivalent invalidation surfaces are:

- **`shows.picker_epoch`** — bumped by `reset_picker_epoch_atomic` during J3 leg (b). Subsequent re-seed has no need to "reset" picker_epoch back to a baseline because every fixture device's `__Host-fxav_picker` cookie is naturally stale (cookie's `e` < current `picker_epoch`) and re-picks on next visit. The re-seed script does NOT touch `shows.picker_epoch`; epoch values monotonically increase across the milestone's lifetime.
- **`crew_members.claimed_via_oauth_at`** — stamped by `claim_oauth_identity` during J3 leg (c). `--combo all` is the structural reset: re-seeding the affected R-combo with fresh `crew_members.id` values creates new rows with `claimed_via_oauth_at IS NULL`, restoring the bypass-picker selectability for those identities on every device. Devices holding stale cookies for the old crew_member_id receive `removed_from_roster` from the resolver on next visit (cookie's `id` no longer matches an active row) and re-pick from the new roster.
- **Picker cookie cleanup (per-device).** Walks between J3 legs leave the dev's iPhone + desktop carrying `__Host-fxav_picker` envelopes with entries the next walk doesn't expect. The dev SHOULD clear browser cookies before any walk where a clean first-contact state is required (`<SignInOrSkipGate>` Mode A); otherwise the resolver will resolve the cookie's stored identity and skip the gate. No CLI mechanism is needed — Safari's per-site clear is one tap on the dev's iPhone.

**check-seed predicates.** Beyond the 5 predicates in §3.3.2, check-seed fails additionally if (f) for any alias in `alias_map`, `crew_members` is missing the matching row OR has `email IS NULL` OR has the row but it's no longer eligible (e.g., `archived = true` on the show), OR (g) the show's `show_share_tokens.share_token` row is missing (sentinel for "trigger fired correctly on insert"). Predicates (h)+ from the retired `revoked_links` contract are deleted.

**J3/J4 alias-resolution contract (post-pivot).** J3's picker walk needs `crew_members.id` (for the dev to identify which row to tap in the picker by name) and `crew_members.email` (for J3 leg (c) — the dev Googles-signs-in using a Google account whose email matches one of the seeded fixtures; the picker pivot's identity-exclusivity contract triggers on email match). J4's preview-as-crew walks `/admin/show/<slug>/preview/<crew-id>` directly by `crew_member_id`. Both consumers read `alias_map` from `validation_state` and resolve combo+alias → `{crew_member_id, email}`. The aliases let the dev address fixtures by stable name rather than UUID hunting.

**Alias-map storage (post-pivot rebase).** The re-seed script writes `alias_map` as a JSONB object into the `validation_state` singleton row. The map is combo-scoped (nested) so each R-combo's aliases don't collide:

```json
{
  "R1":  {
    "alias_5a_lead": "<uuid>", "alias_5b_lead_a1": "<uuid>", "alias_5c_bo_lead": "<uuid>",
    "alias_6a_a1": "<uuid>",   "alias_6b_v1": "<uuid>",      "alias_6c_l1": "<uuid>",
    "alias_6d_bo": "<uuid>",   "alias_6e_a1_l1": "<uuid>",   "alias_6f_empty": "<uuid>"
  },
  "R2":  { ...9 alias keys... },
  ...
  "R8b": { ...9 alias keys... },
  "SW-PRE_TRAVEL":   { "alias_5a_lead": "<uuid>" },
  "SW-TRAVEL_IN":    { "alias_5a_lead": "<uuid>" },
  "SW-SHOW_1":       { "alias_5a_lead": "<uuid>" },
  "SW-SHOW_INTERIOR":{ "alias_5a_lead": "<uuid>" },
  "SW-SHOW_LAST":    { "alias_5a_lead": "<uuid>" },
  "SW-POST_SHOW":    { "alias_5a_lead": "<uuid>" }
}
```

Each R-combo key (R1–R6 + R7a/R7b/R8a/R8b — 10 combos) carries **9 alias entries** (the role variants from §3.2). Each SW-* key (6 states) carries 1 alias entry (LEAD only). **Total alias entries: 10 × 9 + 6 × 1 = 96 aliases.**

The dev's wrapper command `pnpm validation:resolve-alias <combo> <alias>` reads the nested map and prints the resolved UUID. `check-seed` fails if (a) `alias_map` is missing any of the 10 R-combo keys, (b) any R-combo key is missing any of the **9** alias entries, (c) any SW-* key is missing `alias_5a_lead`. Total required keys: 10 + 6 = 16 combo-level; total required leaf entries: 96. |
| Plan-time deliverable | The M12 plan's Phase 0 includes a sub-task that authors `scripts/validation-reseed.ts` + the `validation_state` migration BEFORE any matrix walk. Phase 0 smoke test 5 verifies the script's correctness end-to-end. |

This contract closes the Codex R5 F1 finding: re-seed mechanism is no longer hand-wavy; it's a concrete plan-time deliverable with named path, CLI, idempotency contract, storage schema, and verification command.

### 3.3.2 `validation_state` table — DB-touching deliverable (R6 amendment)

The `validation_state` table introduced by §3.3 step 5 is a DB-touching deliverable in M12 and is subject to the master spec's admin-only / RLS / migration discipline. R6 surfaced that §12 had marked Tier × domain and CHECK/enum as N/A — that was correct when the spec did not introduce DB changes; it is no longer correct now that `validation_state` exists.

**Schema:**

```sql
-- Singleton-enforced via fixed primary key (R7 amendment — earlier draft used
-- a random UUID PK which permitted multiple rows; check-seed semantics would
-- have been ambiguous against multi-row state).
-- Idempotency: CREATE TABLE IF NOT EXISTS + ADD CONSTRAINT IF NOT EXISTS pattern
-- per AGENTS.md apply-twice rule (R11 corrected — earlier draft used plain
-- CREATE TABLE which would fail on second apply).
CREATE TABLE IF NOT EXISTS public.validation_state (
  key                              text PRIMARY KEY CHECK (key = 'validation_seed'),
  last_seed_date                   date NOT NULL,
  combos_materialized              text[] NOT NULL,
  alias_map                        jsonb NOT NULL DEFAULT '{}'::jsonb,   -- R12 amendment — alias→crew_id map for J3/J4 link generation
  seeded_by                        text NOT NULL,                         -- script user/process identity
  seeded_supabase_project_ref      text NOT NULL,                         -- R9 amendment — verifies target consistency
  seeded_at                        timestamptz NOT NULL DEFAULT now()
);

-- R12 amendment — CHECK constraint uses drop-and-recreate inside DO block.
-- The R11 duplicate_object pattern was apply-twice safe ONLY for an unchanged
-- constraint; if the enum list changes (e.g., new combo added in a future
-- milestone), apply-twice would silently leave the old constraint in place,
-- causing the script to fail at INSERT time or to write a combo the DB
-- doesn't accept. DROP IF EXISTS + ADD ensures the constraint always reflects
-- the current enum list.
DO $$
BEGIN
  ALTER TABLE public.validation_state
    DROP CONSTRAINT IF EXISTS validation_state_combos_check;
  ALTER TABLE public.validation_state
    ADD CONSTRAINT validation_state_combos_check CHECK (
      combos_materialized <@ ARRAY[
        'R1','R2','R3','R4','R5','R6','R7a','R7b','R8a','R8b',
        'SW-PRE_TRAVEL','SW-TRAVEL_IN','SW-SHOW_1','SW-SHOW_INTERIOR','SW-SHOW_LAST','SW-POST_SHOW'
      ]
    );
END $$;

-- R12 amendment + R16 drift-repair — alias_map is schema-evolution-safe.
-- ADD COLUMN IF NOT EXISTS handles the missing-column case. R16 adds explicit
-- normalization of type/nullability/default so an early-draft column with
-- different shape gets corrected rather than left in place.
ALTER TABLE public.validation_state
  ADD COLUMN IF NOT EXISTS alias_map jsonb NOT NULL DEFAULT '{}'::jsonb;

-- R16 drift repair — if an early manual run created alias_map with the wrong
-- type/nullability/default, normalize it. Each ALTER is idempotent.
ALTER TABLE public.validation_state
  ALTER COLUMN alias_map SET DEFAULT '{}'::jsonb;
ALTER TABLE public.validation_state
  ALTER COLUMN alias_map SET NOT NULL;

-- R16 type-drift fail-loud — if column type isn't jsonb, fail with a clear
-- diagnostic rather than silently mis-behaving downstream.
DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'validation_state'
      AND column_name = 'alias_map';
  IF col_type IS NULL THEN
    RAISE EXCEPTION 'validation_state.alias_map column missing after ADD COLUMN — investigate';
  END IF;
  IF col_type <> 'jsonb' THEN
    RAISE EXCEPTION 'validation_state.alias_map has wrong type % (expected jsonb) — manual corrective migration required', col_type;
  END IF;
END $$;

-- Admin-only per master spec §4.3 pattern (R9 amendment + R10 correction —
-- DDL now mirrors the canonical admin-only policy/grant shape from
-- supabase/migrations/20260501002000_rls_policies.sql: schema-qualified
-- public.is_admin(), TO anon AND authenticated, with explicit table grants
-- BEFORE enabling RLS).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.validation_state TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.validation_state TO service_role;
ALTER TABLE public.validation_state ENABLE ROW LEVEL SECURITY;

-- R15 amendment — DROP POLICY IF EXISTS folded inline so the primary DDL
-- block is the ONLY canonical migration body (no separate amendment snippet
-- that an implementer could miss). Apply-twice safe.
DROP POLICY IF EXISTS admin_only ON public.validation_state;
CREATE POLICY admin_only ON public.validation_state
  FOR ALL
  TO anon, authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- The validation script runs under the service role (which bypasses RLS), so
-- this admin_only policy does not block the script's writes. The policy
-- satisfies the §4.3 admin-only contract: non-admin Supabase sessions are
-- denied across all four verbs. Admin reads (e.g., a future audit UI) work
-- because they're admin-authenticated.
```

**Migration idempotency at a glance.** The DDL block above is the canonical and complete migration body. Every statement is apply-twice safe: `CREATE TABLE IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT` (drift-safe per R12), `ADD COLUMN IF NOT EXISTS` (alias_map idempotency), inherently-idempotent `GRANT`s, and `DROP POLICY IF EXISTS + CREATE POLICY` (R15 fold-in). No standalone amendment snippets — implementers apply the block as-is.

**Master-spec discipline mapping (per AGENTS.md project-scoped additions):**

| Dimension | Treatment |
|---|---|
| Tier × domain | Admin-only (operational tooling). Should be added to the master spec's §4.3 admin-only tables list at the moment this migration lands. |
| CHECK constraint | `validation_state_combos_check` enumerates the allowed combo names (10 R-combos after R8 split: R1–R6 + R7a/R7b/R8a/R8b, plus 6 show-wide states after R11 split: SW-PRE_TRAVEL / SW-TRAVEL_IN / SW-SHOW_1 / SW-SHOW_INTERIOR / SW-SHOW_LAST / SW-POST_SHOW). Adding a new combo requires migrating the CHECK constraint (using the R12 DROP+ADD drift-safe pattern) AND extending the script's mapping table in lockstep. |
| Migration idempotency | The DDL block above uses `CREATE TABLE IF NOT EXISTS` for the table, `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` (R12 amendment — drift-safe; the R11 duplicate_object pattern only handled "constraint already present" but didn't migrate enum drift), and `ADD COLUMN IF NOT EXISTS` for the alias_map column. Apply-twice safe AND enum-drift safe per AGENTS.md. |
| RLS | Enabled with `admin_only FOR ALL` policy (R9 amendment — matches master spec §4.3 contract for all admin-only tables; service role bypasses RLS so the script writes work; admin session reads work for any future audit UI; non-admin sessions denied across all 4 verbs as AC-2.5 requires). |
| Supabase call-boundary | Script's `{ data, error }` destructure is mandatory per AGENTS.md invariant 9. The check-seed command uses `select`'s error branch to distinguish "table not present" (Phase 0 incomplete) from "table empty / stale" (re-seed required). |
| Meta-test | If a `tests/db/` test enumerates admin-only tables, `validation_state` is added to that registry per the AGENTS.md meta-test inventory rule. The M12 plan declares this in its meta-test inventory section. |

**Singleton write semantics.** The re-seed script writes the singleton via `INSERT INTO validation_state (key, ...) VALUES ('validation_seed', ...) ON CONFLICT (key) DO UPDATE SET ...` (upsert). The `validation:check-seed` command reads exactly the `key = 'validation_seed'` row and fails if (a) zero rows, (b) `last_seed_date != current_date`, (c) `combos_materialized` doesn't cover the combos needed by the next walk (16 combos for `--combo all`), (d) `seeded_supabase_project_ref != $VALIDATION_SUPABASE_PROJECT_REF` (R9 amendment — target-consistency), OR (e) `alias_map` does not satisfy the §3.3 alias-map storage predicate (see §3.3 for the canonical count — currently **9 alias entries per R-combo × 10 R-combos + 1 alias per SW-state × 6 = 96 total leaves** post-2026-05-26 picker-pivot rebase; predicate cross-references §3.3 rather than restating the value, so future count drift updates only §3.3). See §3.3 for the canonical alias-map contract.

**Plan-time deliverable — atomic with master-spec amendment (R7+R8 amendment; 2026-05-26 picker-pivot rebase per (α) + footnote per (γ) hybrid).** The M12 plan's Phase 0 sub-task that authors the re-seed script ALSO authors the `validation_state` migration AND atomically updates the master spec + admin-tables registry + every hardcoded baseline.

**Live-count vs nominal-prose dual mode.** As of M11.5 close-out (`b4b2c38`), the master spec's §4.3 prose nominally lists **21** admin-only tables but the live `scripts/generate-admin-tables.ts:31-34` hard-codes a `removedByPickerPivot` filter that drops `crew_member_auth`, `revoked_links`, `link_sessions`, `bootstrap_nonces` → `lib/audit/admin-tables.generated.ts` emits **17** tables. The master-spec body was deliberately NOT amended during the M11.5 picker pivot (supersession-by-picker-spec posture; see picker-pivot spec header block). This M12 amendment inherits that posture per user 2026-05-26 decision (option α + footnote per γ; option β master-spec body cleanup deferred to a future milestone that re-touches master-spec text). The atomic checklist below has TWO count tracks: **master-spec prose track** (21 → 22 nominal) and **live-code track** (17 → 18 actual, generator output + tests). The §4.3 footnote (step 3a) documents the drift explicitly so future readers can reconcile the two without re-deriving M11.5's filter.

Specifically the same Phase 0 commit/PR MUST include:

1. **Migration** creating `validation_state` (DDL above).
2. **Script + package.json wiring** — `scripts/validation-reseed.ts` + the `pnpm validation:reseed` + `pnpm validation:check-seed` entries in `package.json` scripts.
3. **Master spec §4.3 amendment (THREE edits — picker-pivot rebase)** —
   - **§4.3 bullet list (prose track)** — `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` **line 610** (verified live 2026-05-26): the bullet listing 21 admin-only tables grows to 22 with `validation_state` appended in alphabetical position (between `sync_audit` and the existing `wizard_finalize_checkpoints` is incorrect — `validation_state` is alphabetically AFTER `sync_audit`; final position determined at edit time against the live alphabetical sort of the post-amendment list). The trailing `(**21 tables**...)` parenthetical updates to `(**22 tables**...)`. The 4 M11.5-dropped tables (`crew_member_auth`, `revoked_links`, `link_sessions`, `bootstrap_nonces`) STAY in the prose list per user 2026-05-26 supersession-posture ratification.
   - **§4.3 footnote (NEW — picker-pivot drift documentation)** — add a footnote at the END of §4.3 (after the prose paragraph) reading: *"**Note (M11.5 supersession + M12 amendment 2026-05-26):** This list reflects the pre-M11.5 nominal baseline; live `ADMIN_TABLES.length = 18 = (22 listed here) − 4 dropped by the M11.5 picker pivot` (`crew_member_auth`, `revoked_links`, `link_sessions`, `bootstrap_nonces`). The dropped tables are filtered structurally by `scripts/generate-admin-tables.ts`'s `removedByPickerPivot` array. Master-spec prose preserved per M11.5's deliberate supersession-via-picker-spec posture; a future milestone may collapse the prose to live count, but M12 does not."* This footnote is load-bearing — it documents the drift explicitly so future adversarial reviewers see the count math without re-deriving the M11.5 pivot.
   - **§4.1 schema section — `create table validation_state` definition**: the master spec's §4.1 schema section MUST gain a matching `create table validation_state` definition (place it as the last CREATE TABLE block before §4.2 at the current line 596, so all existing block line numbers stay stable). **The live generator `scripts/generate-admin-tables.ts:31-34` filters extracted §4.3 names to tables with a matching `create table ...` in master spec; without the master-spec CREATE TABLE block, regenerating `lib/audit/admin-tables.generated.ts` (step 5 below) silently drops `validation_state` and the X.3/X.6 parity tests fail.** The master-spec CREATE TABLE block mirrors the §3.3.2 DDL (sans the `IF NOT EXISTS` and `DO $$` blocks — master spec uses simple `create table` form per the existing pattern).
4. **Master spec AC-2.5 amendment** — `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` **line 3536** (verified live 2026-05-26): the per-table list grows to include `validation_state`; the **21 tables × 4 verbs = 84 assertions** literal updates to **22 tables × 4 verbs = 88 assertions** (prose track). Add a one-line cross-reference footnote: *"Count reflects the §4.3 nominal prose baseline; live `ADMIN_TABLES.length = 18` per §4.3 footnote (M11.5 picker-pivot filter drops 4)."* — the cross-reference makes the count math auditable for future reviewers.
5. **Admin-tables generator regen** — `scripts/generate-admin-tables.ts` is the generator (verified live; line 43 emits `ADMIN_TABLES`). Re-run the generator so `lib/audit/admin-tables.generated.ts` includes `validation_state`. The generator reads §4.3 — step 3's master spec edit drives step 5's regen. Expected post-regen state: `ADMIN_TABLES.length = 18` (17 prior + `validation_state`); the 4 M11.5-dropped tables remain filtered by `removedByPickerPivot`.
6. **Hardcoded test-baseline updates** (live track; verified against live HEAD `b4b2c38`):
   - `tests/db/admin-rls-runtime.test.ts` — **4 references** on lines 4, 21, 111, 112 (NOT the M12 pre-rebase claim of "7 references on lines 4 / 9 / 21 / 111 / 112 / 213 / 218" — the M11.5 G3 cutover changed the count baseline from 21 → 17, and the test header comments are the only places carrying the literal): line 4 (`Runtime RLS behavioral-parity probe for the 17 admin-gated tables`), line 21 (`Class A only (17 tables after the M11.5 G3 cutover; ...)`), line 111 (`derived table count matches the 17 admin_only FOR ALL tables`), line 112 (`expect(CLASS_A_TABLES).toHaveLength(17);`). Update each `17` → `18`.
   - `tests/db/admin-rls-runtime.baseline.json` — regenerated to include the `validation_state` row × 4 verbs.
   - `tests/db/rls.test.ts` — **DROPPED**: file does not exist post-M11.5 (likely never existed, or was retired in M11.5 G1). M12 plan's prior task pointing at it is dropped, not rewritten.
   - `tests/cross-cutting/auth.test.ts` — **DROPPED**: file does not exist; no `ADMIN_TABLES` literal-list expectation exists in any test (the registry is consumed structurally via the generated import, not via per-element literal). M12 plan's prior task pointing at it is dropped, not rewritten.
7. **Plan meta-test inventory hook** — the M12 plan's HANDOFF-TEMPLATE §13 declares `tests/db/admin-rls-runtime.test.ts` as **EXTENDED** in this milestone (not created — it exists). This satisfies the AGENTS.md meta-test inventory rule. The prior plan references to `tests/db/rls.test.ts` + `tests/cross-cutting/auth.test.ts` are dropped per step 6.

**Atomicity gate.** Phase 0 does NOT close until X.3 / X.6 / admin-table tests pass against the updated master spec + regenerated `lib/audit/admin-tables.generated.ts` + updated test baselines. Specifically the gate requires:

- `pnpm vitest run tests/db/admin-rls-runtime.test.ts` passes (18-table assertion + 18-table parity).
- `traceability-audit` CI gate passes against the updated master spec (§4.3 prose-track parity to AC-2.5 to PROTECTED_SINKS) — note that PROTECTED_SINKS auto-regenerates from §4.3 via the live `removedByPickerPivot` filter, so PROTECTED_SINKS will have 18 entries even though §4.3 prose lists 22.
- `x3-trust-domain` CI gate passes (PROTECTED_SINKS auto-regenerates from §4.3 + picker-pivot filter; the trust-domain audit verifies the regeneration ran).

The migration cannot land alone — it ships as part of the atomic Phase 0 close-out commit (or commit series in a single PR). This closes Codex R7 F3 and R8 F2: the master-spec amendment is a MUST with verified live deltas, not a soft follow-up.

Impeccable v3 doesn't apply — this is a DB migration, not UI — but the project's CHECK-constraint review discipline + the AGENTS.md project-scoped Tier × domain matrix + cross-document amendment discipline DO apply. Phase 0 smoke test 5 verifies the migration applied cleanly + RLS posture is correct + the singleton invariant is enforced (test: attempt to insert a second row → fail with PK constraint violation).

### 3.3.1 Right Now show-wide state inventory (orthogonal to restriction)

Master spec §8 names additional Right Now card states that are show-wide (independent of viewer restriction): `pre_travel`, `travel_in_day`, `show_day_N` (N = 1, 2, 3...), `post_show`. These are not covered by R1–R6 + R7a/R7b/R8a/R8b (which focus on viewer-restriction states). The matrix exercises each show-wide state at least once with restriction = `none`:

| Show-wide state | Fixture configuration | When walked |
|---|---|---|
| `pre_travel` | Today is more than 1 day before fixture's `dates.travelIn` | Pre-show day (data-engineered) |
| `travel_in_day` | Today = fixture's `dates.travelIn` (the day before set day) | Travel-in day |
| `show_day_1` (first show day) | Today = first day of fixture's show dates; fixture has ≥3 show days | First show day |
| `show_day_interior` (R11 amendment — was `show_day_N`) | Today = an interior show day (≥ day 2, < last day); fixture has ≥3 show days | Mid-show day |
| `show_day_last` (R11 amendment — new) | Today = LAST day of fixture's show dates; isLast = true; expect Strike copy per master spec §8 | Last show day |
| `post_show` | Today is after fixture's `dates.travelOut` | Post-show day |

**R11 amendment.** Earlier draft compressed all interior + last show days into `show_day_N` (N≥2). But master spec §8 has a distinct render branch for the LAST show day with Strike copy added when `isLast = true`. Splitting into `show_day_interior` + `show_day_last` ensures both code paths get walked. Total show-wide states: 5 → 6.

Show-wide states are walked once each (SMOKE-SAMPLE per §3.4) for the LEAD persona on the Right Now card surface. Combined with the 10 viewer-restriction combos (R1–R6 + R7a/R7b/R8a/R8b after R8 split), the Right Now card has **10 + 6 = 16 day-state walks** per persona (R11 amendment — was 15 before the show_day_interior/show_day_last split). MATRIX-INVENTORY.md dispositions each state explicitly so future readers see why it was included.

### 3.4 Axis applicability + sampling policy (bounded matrix)

After R1+R2 expansion, the validation has multiple axes: persona (8), surface (variable per band), role variant (9), restriction combo (8), color mode (2), viewport (2), real-device-vs-emulated (2 — but only for crew personas). Cross-multiplying every axis would produce thousands of cells; a solo dev cannot walk that in finite time. The spec defines per-axis coverage policy to keep the walk bounded.

**Three coverage classes:**

| Class | Policy | When applied |
|---|---|---|
| **FULL** | Every value on this axis × every value on the partner axis (Cartesian) | Mandatory axes whose values interact non-trivially |
| **PAIRWISE** | Every PAIR of axis-values appears at least once, but full Cartesian is not required (covering array) | Axes that interact but exhaustive crossing is impractical |
| **SMOKE-SAMPLE** | A representative subset of axis-values (the values the plan judges highest-leverage) | Axes whose interaction with others is low-risk OR redundantly covered by a partner axis |

**Per-axis policy for the M12 matrix:**

| Axis | Policy | Detail |
|---|---|---|
| **Surface × Persona** | FULL (within applicability — see below) | Every surface × every persona that can reach it. Anonymous reaches only auth-error surfaces; admin reaches admin surfaces; signed-link crew reaches crew surfaces. Out-of-domain combinations (e.g., anonymous × admin dashboard) are dispositioned EXCLUDED in MATRIX-INVENTORY.md. |
| **Color mode (light/dark)** | FULL | Both modes per cell — non-negotiable per DESIGN.md. |
| **Viewport (mobile/desktop)** | FULL | Both viewports per cell. |
| **Role variant (5a–5c + 6a–6f)** | SMOKE-SAMPLE on most surfaces; SMOKE-SAMPLE with explicit pair selection on Right Now / schedule / pack-list | Role variants affect crew-page tile visibility specifically. The matrix exercises each role variant ONCE on the crew page surface (one walk per variant = 9 cells). Role × restriction interaction is SAMPLED (not full pairwise) — see §3.4.1 for the explicit pair-selection rule. Role variants are NOT crossed with admin surfaces, /help, or report surfaces (those don't change by crew role). |
| **Restriction combo (R1–R6 + R7a/R7b + R8a/R8b — 10 total after R8 split)** | SMOKE-SAMPLE on most surfaces; SMOKE-SAMPLE with explicit pair selection with role on Right Now / schedule / pack-list | Restriction combos affect Right Now state, schedule filtering, and pack-list visibility. Each combo exercised ONCE on each of those three tiles with LEAD role. Role-restriction interaction sampled per §3.4.1. |
| **Real-device-vs-emulated** | SMOKE-SAMPLE | Real iPhone only for the curated subset named in §3.1 (Right Now, schedule, signed-link redemption, sign-in, expired-link, revoked-link, `/me`) for personas 5/6/7/8. Other cells emulate. |

**Bounded estimate:**

- Surface × persona × mode × viewport (base matrix): ≈ N_surfaces × 8 personas × 4 mode-combos, BUT bounded by applicability — most surfaces apply to 1–3 personas. Practical estimate: ~200–400 cells.
- Role variant × crew-page tiles × mode (orthogonal pass): 9 variants × ~6 tiles × 4 mode-combos ≈ 216 cells.
- Restriction combo × restriction-sensitive tiles × mode (orthogonal pass): **10 combos × 3 tiles × 4 mode-combos = 120 cells** (was 96 before R8 split).
- Sampled role × restriction on Right Now: **11 pairs × 4 mode-combos = 44 cells** (the 11-pair selection per §3.4.1; R10 added pairs 10 and 11 to cover R7b and R8b).
- Real-device pass on curated subset: ~10 cells × 4 personas × 1 mode-combo ≈ 40 cells.

**Total upper-bound estimate: ≈ 650–850 cells** (R9 amendment — was 600–800 before R8 split added 24 cells; +24 from restriction-tile expansion + role-pair refinement). Walking this at a coarse rate of ~10–30 cells/hour (the range reflects per-cell variance: a quick visual confirmation runs faster, a real-iPhone leg or a cold-start step runs slower; triage time per finding adds further variance) = roughly 20–80 hours of pure exercise. Spread across the iteration loop with fix cycles, a realistic milestone duration is **3–8 weeks**, not 2–4 weeks (R4 revision — earlier estimate was optimistic).

**MATRIX-INVENTORY.md records coverage class per row.** Every row's coverage class (FULL / PAIRWISE / SMOKE-SAMPLE) is set in the plan-time derivation per §4.1.1. The dev's exercise walks each row at the coverage level specified.

### 3.4.1 Role × restriction pair-selection rule (R4 amendment — replaces "pairwise" misnomer)

Earlier drafts called role × restriction "PAIRWISE" but specified only ~8 pairs, which is sampling not pairwise (true pairwise of 9 role × 8 restriction = 72 pairs). The corrected classification: this is **SMOKE-SAMPLE with explicit pair selection**, not pairwise. The selection rule:

| Pair # | Role variant | Restriction combo | What this pair catches | Expected outcome (R18 amendment) |
|---|---|---|---|---|
| 1 | 5a (`["LEAD"]`) | R1 (`none`/`none`/set day) | Baseline LEAD + no restriction; sanity check | Right Now: show-wide set-day state. **Audio + Video + Lighting scope tiles: ALL VISIBLE** (R20 corrected — `lib/visibility/scopeTiles.ts` makes LEAD unlock all three: each predicate checks `flags.includes('LEAD')`). Pack-list: visible (set day, no stage restriction). Financials (shows_internal): visible (LEAD). |
| 2 | 5b (`["LEAD","A1"]`) | R2 (`explicit` today included) | Compound LEAD + audio scope tile with date restriction matching | Right Now: show-wide set-day state. **Audio + Video + Lighting scope tiles: ALL VISIBLE** (LEAD alone unlocks all three; A1 is redundant for visibility). Pack-list: visible. Financials: visible. |
| 3 | 5c (`["BO","LEAD"]`) | R7a (`none`/`["Load In","Set"]`/set day → visible) | Compound LEAD + backstage with set-day-only stage restriction; pack-list visible | Right Now: set-day state. **Audio + Video + Lighting scope tiles: ALL VISIBLE** (R20 corrected — LEAD unlocks all scope tiles; BO has no effect on scope visibility). Pack-list: VISIBLE (today within stage restriction). Financials: visible. |
| 4 | 6a (`["A1"]`) | R3 (`explicit` today excluded, set day) | Audio scope tile + off-day; verifies date filter affects Right Now but NOT scope tiles | Right Now: `viewer_off_day` copy (per master spec §8 line 2413). **Audio scope tile: VISIBLE** (R19 corrected — `audioScopeVisible(viewerFlags)` is role-only per `lib/visibility/scopeTiles.ts`; dateRestriction only affects Right Now + Schedule, NOT scope tiles). Pack-list: visible (set day, no stage restriction; master spec line 2395 — pack-list visible on set/strike/travel-out days). Financials: hidden (non-LEAD). |
| 5 | 6b (`["V1"]`) | R4 (`unknown_asterisk`, set day) | Video scope + asterisk-unconfirmed; check scope tile stays visible while Right Now is overridden | Right Now: `viewer_unconfirmed` copy (master spec §8 line 2411 — takes precedence over show-wide state). **Video scope tile: VISIBLE** (R19 corrected — `videoScopeVisible` is role-only). Pack-list: visible (set day). Financials: hidden. |
| 6 | 6c (`["L1"]`) | R5 (pre-show day) | Lighting scope + pre-show state; verifies scope tile renders before show begins | Right Now: `viewer_off_day_pre` copy with "first day: X" countdown (master spec §8 line 2414). **Lighting scope tile: VISIBLE** (R19 corrected — role-only). Pack-list: hidden (pre-show day is NOT a set/strike/travel-out day per master spec line 2395). Financials: hidden. |
| 7 | 6d (`["BO"]`) | R6 (post-show day) | No-scope crew + after-last-day state | Right Now: `viewer_after_last_day` copy (master spec §8 line 2412). **No scope tiles render — BO has no A1/V1/L1 flag, so scope-tile predicates return false** (NOT because post-show suppresses tiles, but because BO doesn't have a scope role). Pack-list: hidden (post-show day is past travel-out). Financials: hidden. |
| 8 | 6e (`["A1","L1"]`) | R8a (`none`/`["Load Out","Strike"]`/strike day → visible) | Compound scope + strike-day-only stage restriction; pack-list visible | Right Now: strike-day show-wide state (or show_day_last if today = last show day). Audio + Lighting scope tiles BOTH visible. Pack-list: VISIBLE (today within stage restriction). Financials: hidden. |
| 9 | 6f (`[]`) | R1 (`none`/`none`/set day) | Empty-flags edge case + no restriction | Right Now: show-wide set-day state. No scope tiles render. Pack-list: visible (no stage restriction). Financials: hidden. Page does not crash on empty role_flags. |
| 10 (R10 amendment) | 6f (`[]`) | R7b (`none`/`["Load In","Set"]`/strike day → pack-list hidden) | Empty-flags + opposite-day stage restriction; confirms pack-list correctly hidden when stage filter excludes today's day even on the no-tile crew | Right Now: strike-day show-wide state. No scope tiles. Pack-list: HIDDEN (stage filter excludes strike day). Financials: hidden. |
| 11 (R10 amendment) | 5a (`["LEAD"]`) | R8b (`none`/`["Load Out","Strike"]`/set day → pack-list hidden) | Pure LEAD + opposite-day stage restriction; confirms financials still render AND scope tiles visible but pack-list hidden when stage filter excludes today | Right Now: set-day show-wide state. **Audio + Video + Lighting scope tiles: ALL VISIBLE** (R20 corrected — LEAD unlocks all three regardless of stage restriction; stage filter only affects pack-list per master spec line 2395). Pack-list: HIDDEN (stage filter excludes set day). Financials: VISIBLE (LEAD; pack-list hidden does not gate financials). |

This sampling rule covers each role variant (9) at least once AND each of the 10 restriction combos (R1–R6 + R7a + R7b + R8a + R8b) at least once. **R10 amendment: earlier R9-corrected text claimed coverage of "each restriction combo (8) at least once" — that became false after R8's R7/R8 split. Adding pair 10 (covers R7b) and pair 11 (covers R8b) restores the "each restriction at least once" invariant.** Total 11 pairs.

It does NOT cover all 9 × 10 = 90 possible pairs — the cross-coverage gaps are accepted with the rationale that: (a) role and restriction are largely orthogonal (role gates which tiles render; restriction gates which days/stages those tiles render on); (b) the 11 pairs hit every value on each axis at least once, so axis-individual bugs surface; (c) cross-axis interaction bugs that *only* manifest at a specific (role, restriction) pair outside the 11 are accepted as a known coverage gap.

If the dev encounters an unexpected behavior during the 11-pair walk that suggests cross-axis interaction, the spec authorizes the dev to expand to additional pairs at their discretion (the working bug-list, not a formal requirement). MATRIX-INVENTORY.md records the 11 pairs explicitly.

### 3.1 Sub-dimensions per matrix cell

Each persona × surface cell is exercised in *both* color modes AND *both* viewports — not separate matrix rows; sub-checks inside the cell.

| Sub-check | Required for every cell | Notes |
|---|---|---|
| Light mode | Yes | Per DESIGN.md AAA contrast floor |
| Dark mode | Yes | Per DESIGN.md sunlit-loading-dock-vs-dim-backstage parity |
| Mobile 390px viewport | Yes | Primary viewport per PRODUCT.md |
| Desktop ≥1024px viewport | Yes | Per DESIGN.md `--bp-lg` |
| Real iPhone Safari (Vercel `*.vercel.app` production URL) | Only for crew-facing surfaces (personas 5/6/7/8) on a curated subset of cells | The dev's actual phone; not Playwright |

The "curated subset" for real-iPhone is enumerated at plan-writing time; defaults are the Right Now card, the schedule tile, signed-link redemption (fragment-token form), sign-in flow, expired-link path, revoked-link path, and the `/me` cross-show list.

---

## 4. Surface inventory

### 4.1 Inventory source

The canonical source of "every documented surface" is the master spec (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md`) + the M11 spec (`docs/superpowers/specs/2026-05-12-user-facing-docs-design.md`). This spec does NOT pre-enumerate every row, because the source has hundreds of references and would rot; the plan-time derivation is authoritative — and the derivation itself is structurally required (§4.1.1), not delegated.

### 4.1.1 Matrix-inventory derivation (mandatory plan-time task)

The M12 plan's **first task** generates a matrix-inventory file at `docs/superpowers/plans/<date>-solo-dev-ux-validation/MATRIX-INVENTORY.md`. The file is a PLAN-time artifact (one-shot derivation, not the per-cell exercise tracking the §8 "no artifact" rule rules out). Its purpose is to make "the matrix" structurally enumerable rather than informally delegated.

**Required derivation sources** — every candidate matrix row must trace back to at least one of:

| Source | What to walk | Output rows |
|---|---|---|
| Master spec heading inventory | Every `##` and `###` heading in `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` that names a UI surface | One row per heading naming a surface |
| Master spec spec-id anchors | Every spec-ID (AC-X.Y, MI-N, §-references with UI content) | One row per spec-ID with an associated UI surface |
| M11 spec page inventory | Every `/help/...` route enumerated in M11 §4 (the 13 pages) + the catalog-driven `/help/errors` rows | One row per `/help/...` route AND one row per catalog-driven error section |
| Route inventory | Every `app/**/page.tsx` and `app/**/layout.tsx` not excluded by §4.3 | One row per route |
| Catalog inventory | Every entry in `lib/messages/catalog.ts` with `dougFacing != null` OR `crewFacing != null` (admin AND crew per band E broadening) | One row per catalog code, grouped by rendering surface |
| Report-pipeline outcomes | Every outcome state per master spec §13.2 (success, in-flight idempotency, rate-limit, lookup-inconclusive, lease-expired, horizon-expired, orphaned-lost-lease) | One row per outcome |
| §9.0.1 affordance matrix | Every row in M11 §5.6 affordance matrix | One row per affordance with its target |

**Disposition discipline.** Every candidate row produced by the derivation lands in MATRIX-INVENTORY.md with one of three dispositions:

- `INCLUDED` — exercised in matrix walk. Mapped to one of bands A–F.
- `EXCLUDED — <reason>` — explicitly out of scope. Reason cites §4.3 exclusion or a fresh reason added in the derivation.
- `BAND-OVERLAP — <other row id>` — captured by another included row; cross-link to that row.

No candidate row may be silently dropped. The plan's task close-out asserts that every candidate from each source is dispositioned.

**Why this is in the spec and not just left to plan judgement.** The R1+R2 review identified that "plan-time walk is authoritative" was too informal — a free-form walk can silently miss hard-to-notice surfaces (stale states, asset routes, diagnostic outcomes, spec-id-only surfaces). Structurally requiring the derivation against explicit sources, with every candidate row dispositioned, makes the matrix's completeness inspectable rather than assumed. This mirrors the X.6 traceability pattern from the master plan.

### 4.2 Surface bands (high-level categorization)

| Band | Contents (representative; plan-time walk is authoritative) |
|---|---|
| **A. Admin surfaces** | `/admin` dashboard (Active Shows panel, pending-ingestion panel, restage panel, footer "Take the tour", AlertBanner). `/admin/show/[slug]` (sync health, parse-warnings, crew preview links, staged-review cards). `/admin/show/staged/[stagedId]` (first-seen review). `/admin/show/[slug]/preview/[crew-id]` (impersonation banner + previewed crew content). Onboarding wizard steps. Theme toggle, header, footer. |
| **B. Crew surfaces** | `/show/[slug]/[shareToken]/` (the tokenized share-link path — picker-pivot canonical form per [`2026-05-23-crew-auth-pivot-show-link-picker.md`](./2026-05-23-crew-auth-pivot-show-link-picker.md) Resolved Decisions 1–2; the slug-only `/show/[slug]` path is **not a valid route** post-pivot — Next's file-system layer 404s on it, and `lib/auth/validateNextParam.ts` rejects it from OAuth `?next=` parameters via the allowlist regex `^/(show/[a-z0-9-]+/[0-9a-f]{64}|admin(/.*)?|me(/.*)?)$/`). `/me` (cross-show signed-in identity surface, preserved per picker-pivot Resolved Decision 15; reads tokenized URLs from `my_share_tokens_for_email()` SECURITY DEFINER RPC; uses `validateGoogleSession` for `/me` per the M11.5 §10.1 allowlist — `validateGoogleIdentity` was retired at M11.5 G1). Every documented tile (Right Now, schedule, hotel, transport, crew, contacts, diagrams gallery, etc.) with empty / loading / error states. Role-filter sentinel-hiding per role per §3.2 sub-variants. Crew footer "Something looks wrong?" report-modal entry (per master spec §13.1 surface 4) — submission states covered in band F. |
| **C. Auth surfaces** | Google sign-in (fresh + return sessions exercised separately; the `validateGoogleSession`-resolves-crew-row arm of the page-route auth chain per picker-pivot §4.1 step 4). Sign-out (`/auth/sign-out/route.ts` — the FIFTH R41-R41 cookie-mutator that emits `Max-Age=0` to clear `__Host-fxav_picker`). **Picker render arms (5 picker-rendering states of the 11-arm `resolveShowPageAccess` union):** (i) `no_auth/first_contact` — `<SignInOrSkipGate>` Mode A (no admin, no Google session, no cookie); (ii) `no_auth/google_mismatch` — `<SignInOrSkipGate>` Mode B "signed in as someone else" (TERMINAL per picker-pivot §4.1 step 4(e); does **NOT** fall through to cookie path, closes the shared-device identity-leak vector ratified in P-R27); (iii) `epoch_stale` — picker re-render with `PICKER_EPOCH_STALE_BANNER` (cookie's `e` < `shows.picker_epoch` after admin reset); (iv) `removed_from_roster` — picker re-render with `PICKER_REMOVED_FROM_ROSTER_BANNER`; (v) `identity_invalidated` (single wire arm carrying both reasons `'claimed_after_pick'` AND `'session_mismatch'` per P-R29/P-R30 Fix-1) — picker re-render with `PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER` + auto-submitting `<StaleCleanupAutoSubmit>`. **Share-token rotation surface** — admin clicks `RotateShareTokenButton` → iPhone reloads old URL → `showUnavailable()` emits `PICKER_SHOW_UNAVAILABLE` per M11.5 R2 close-out. **Picker-epoch reset surface** — admin clicks `ResetPickerEpochButton` → iPhone reloads same URL → `identity_invalidated/session_mismatch` cascade. **Negative-auth rejection rows:** `validateNextParam` slug-only rejection (a forged OAuth `?next=/show/<slug>` without the token segment must be rejected by the H2 allowlist; not a journey leg, a routing-time reject); 401 / 403 paths from `/api/asset/*` + `/api/realtime/subscriber-token` + `/api/show/[slug]/version` + `/api/report` when the picker cookie is missing or `identity_invalidated`. |
| **D. Help surfaces (M11)** | All 13 `/help` pages + the catalog-driven `/help/errors` page + `<RefAnchor>` rendering + `<Screenshot>` light/dark variant switching. |
| **E. Cross-cutting affordances** | Every `?` tooltip / "Learn more →" link from §9.0.1 surface affordance matrix (M11 §5.6). Every catalog-driven error message rendered through `messageFor()` — **both admin-facing AND crew-facing** (an earlier draft restricted this band to `/admin/*` only; corrected per Codex R1 P0 — crew-facing catalog-driven messages like `LINK_EXPIRED`, "not on crew list", and rate-limit copy are equally in scope). AlertBanner row rendering for each non-info-severity admin catalog code. |
| **F. Report-pipeline surfaces (M8)** | Master spec §13.1 enumerates 4 report entry points (admin parse-panel button, preview/banner button, crew footer "Something looks wrong?" modal, and the §13 admin surfaces); each is a surface in the matrix. Submission outcome surfaces also walked: success confirmation, in-flight idempotency (`IDEMPOTENCY_IN_FLIGHT`), rate-limit hit (429 for admin and crew). **R14 amendment for materializability (R15 corrected):** the deep-failure outcomes (GitHub-lookup-inconclusive 502, `REPORT_HORIZON_EXPIRED` 410, `REPORT_ORPHANED_LOST_LEASE`) require GitHub API faults / lease-timing races not deterministically reproducible against a live prod-equivalent stack without a fault-injection harness. Each is dispositioned in MATRIX-INVENTORY.md as either:<br/><br/>**(a) INCLUDED-via-harness** — Phase 0 sub-task adds a fault-injection harness `scripts/validation-report-fixtures.ts` that materializes the named failure state in the `reports` table (the only v1 admin-only table in this domain — verified per master spec §4.3) by writing row shapes per master spec §13.2.3 contracts. R15 amendment: an earlier draft listed `feedback_inbox` as a target table, but `feedback_inbox` is BACKLOG-only (`BL-PUSH-NOTIFICATIONS` notification-design-memo), not in v1 schema; harness targets ONLY `reports`. If a future milestone adds `feedback_inbox` to v1, the harness contract is extended in that milestone's plan.<br/><br/>**(b) EXCLUDED-rely-on-structural** — for outcomes where the UI rendering is identical to a simpler outcome already covered, the row is dispositioned EXCLUDED with a cite to the structural test that already pins the contract (e.g., `tests/report/orphaned-lease.test.ts`). The plan picks per-row at plan-writing time. Default is (a) — harness-materialized — for any outcome whose UI state is not otherwise covered. |

### 4.3 Excluded surfaces

- Build-flagged routes (`/admin/dev/*` per `scripts/with-admin-dev-flag.mjs`) — not in the preview build.
- Any internal-only routes that do not render in the preview build.
- Phase-2 (post-v1) surfaces named in the M11 spec as deferred (`/help/crew/*` etc.).

---

## 5. Journey scripts (the composition test)

Four end-to-end journeys; each crosses multiple surfaces and catches the cross-surface seams the matrix's per-cell pass cannot. Each journey is run at least twice — once in light + desktop, once in dark + mobile.

### 5.1 J1 — Cold-start admin via /help

Fresh browser profile, deployed production URL (`*.vercel.app`, no custom domain). Sign in via Google. Land on `/admin`. From `/admin`, follow the "Take the tour" link into `/help`. Read `/help/getting-started` and `/help/daily-rhythm`. Use only the /help docs as the map — *do not navigate by dev memory*. Drop a fixture sheet into the watched folder. See cron pick it up (or wait the cron interval). See first-seen auto-publish per master-spec amendment 9. Open the crew preview link, see crew page render. Generate a signed link.

### 5.2 J2 — Pending-sync triage

Edit a published sheet to trigger MI staging events. Pick MI-6 (crew shrinkage) and MI-11 (email change) as the two highest-stakes classes — separate stagings, not bundled. Wait for cron + push-debounce window. Open dashboard; see AlertBanner + staged-review card. Open `/admin/show/[slug]`, drill into staged change. Exercise the **Apply** path on one staging AND the **Discard** path on the other. Confirm Apply propagates to the crew page and to existing signed-link sessions. Confirm Discard leaves prior state intact.

### 5.3 J3 — Share-link + picker crew end-to-end (real device leg)

J3 walks the picker-pivot auth surfaces post-M11.5 end-to-end on the dev's real iPhone (not Playwright) in Safari. Per the user's 2026-05-26 dispatch decision (option `(d)` comprehensive), J3 has **three legs** that together exercise the M11.5 close-out's three destructive admin actions + the OAuth-claim identity-exclusivity contract. **The journey's auth source is the picker pivot spec** [`2026-05-23-crew-auth-pivot-show-link-picker.md`](./2026-05-23-crew-auth-pivot-show-link-picker.md), not master spec §7 (which still describes the retired signed-link model). **No CLI commands appear in J3 steps** — every destructive action is taken through the M11.5 admin UI (Phase 0.D tooling was deleted per amendment); the dev reads the share URL from `CurrentShareLinkPanel`, clicks `RotateShareTokenButton` / `ResetPickerEpochButton`, and exercises the OAuth-claim path through the live Google sign-in flow.

**Pre-walk fixture preparation.** The dev runs `pnpm validation:reseed --combo R1` + `pnpm validation:check-seed --combo R1` to confirm the R1 combo's fixture crew has `auth_email_canonical` rows populated. The fixture LEAD identity (`alias_5a_lead`) is the J3 walking persona for legs (a) + (b); leg (c) additionally uses `alias_6a_a1` for the "OAuth-claim race against another device" sub-step. No dedicated J3-isolation aliases are needed (the picker-pivot rotation + epoch reset mechanisms are inherently fixture-clean: rotation invalidates ALL devices on that show; epoch reset invalidates ALL cookies for that show).

**Walking baseline (preamble to every leg).** Sign in as admin on the production Vercel deployment → open `/admin/show/<R1-slug>` → read the canonical URL displayed by `CurrentShareLinkPanel` (form: `https://<deploy>.vercel.app/show/<slug>/<64-hex-shareToken>/`); the dev clicks `ShareLinkCopyButton` to copy it to the clipboard, then opens it on the iPhone. The iPhone hits the `<SignInOrSkipGate>` Mode A first-contact surface; the dev taps "Skip and pick your name" → renders the picker interstitial → the dev taps the row for `alias_5a_lead` (a LEAD identity, OAuth-unclaimed) → `selectIdentity` Server Action mints `__Host-fxav_picker` with the entry for this show → `_ShowBody` renders. The dev confirms LEAD content (financials tile visible) and Audio + Video + Lighting scope tiles all visible (LEAD unlocks all three unconditionally per `lib/visibility/scopeTiles.ts`). This baseline is the J3 entrance; every leg below picks up from this state.

**Leg (a) — Share-token rotation invalidates the share URL.**

| Step | Action | Expected outcome |
|---|---|---|
| 1 | On the dev's desktop admin session: click `RotateShareTokenButton` on `/admin/show/<R1-slug>`. Confirm the two-tap. | The button shows the new URL via `CurrentShareLinkPanel` (which calls `loadShowShareToken` → `admin_read_share_token` RPC); old share-token is now unbound in `show_share_tokens` table (rotated atomically via `rotate_show_share_token` RPC with `picker_epoch += 1` in the same transaction). |
| 2 | On the iPhone: reload the OLD URL (the one the dev pasted earlier, with the pre-rotation 64-hex token). | The page-route resolver's `resolveShowFromSlugAndToken(slug, oldShareToken)` returns `not_found` (the share-token segment no longer matches any row in `show_share_tokens` for this show). Page emits `showUnavailable()` per M11.5 R2 close-out → renders the `PICKER_SHOW_UNAVAILABLE` envelope (crew-facing copy + admin help link). |
| 3 | On the desktop: click `ShareLinkCopyButton` to copy the NEW URL; share to the iPhone (out-of-band — Messages, AirDrop, etc.). On the iPhone: open the NEW URL. | The iPhone hits Mode-A `<SignInOrSkipGate>` again (the iPhone's `__Host-fxav_picker` envelope still has an entry for this show, but `e: <oldEpoch>` does NOT match the new `picker_epoch`; resolver returns `epoch_stale` → picker re-renders with `PICKER_EPOCH_STALE_BANNER`). The dev re-picks `alias_5a_lead`; `selectIdentity` writes a fresh cookie entry; `_ShowBody` renders. |

**Leg (b) — Picker-epoch reset invalidates every cookie for this show.**

| Step | Action | Expected outcome |
|---|---|---|
| 1 | On the desktop: click `ResetPickerEpochButton` on `/admin/show/<R1-slug>`. Confirm the two-tap. | `resetPickerEpoch` invokes `reset_picker_epoch_atomic` RPC (cookie-bound client + `requireAdminIdentity()` per P-R19/P-R20); `shows.picker_epoch += 1` under the per-show advisory lock; `picker_epoch_bumped_at = clock_timestamp()`; `publish_show_invalidation` fires Realtime broadcast on `show:<showId>:invalidation` atomically with COMMIT. Admin sees the toast confirmation. |
| 2 | On the iPhone (which previously held a valid post-rotation cookie from leg (a) step 3): reload the SAME URL. | Resolver compares cookie's `e` to the new `shows.picker_epoch` (now bumped twice — once by `rotate_show_share_token` in leg (a) and once by `reset_picker_epoch_atomic` here). The epoch check at `lib/auth/picker/resolvePickerSelection.ts:88-90` fires **before** the roster / claim / session-email checks, so the cookie's stale `e` returns `epoch_stale` (NOT `identity_invalidated/session_mismatch` — that arm requires `sessionEmail` non-null and `rowEmail !== sessionEmail`, neither precondition holds here). The page-route handler at `app/show/[slug]/[shareToken]/page.tsx:227-260` maps `epoch_stale` → `PICKER_EPOCH_STALE_BANNER` + auto-submitting `<StaleCleanupAutoSubmit>` (compare-and-delete the stale entry). |
| 3 | The dev re-picks `alias_5a_lead`. | Fresh `selectIdentity` writes a cookie with the new `e` matching `shows.picker_epoch`; `_ShowBody` renders. |

**Leg (c) — OAuth-claim path exercises the H8 two-reasons `identity_invalidated` contract.**

The OAuth-claim mechanism is the picker-pivot's identity-exclusivity contract: once a user signs in with Google, their email matches a crew row, `claim_oauth_identity` stamps `crew_members.claimed_via_oauth_at` (global across all shows for that email), and that row is permanently deactivated in the bypass picker for every device. The expected outcomes below exercise both `identity_invalidated` reasons (`claimed_after_pick` + `session_mismatch`) through one walk. **Resolver-arm ordering matters:** per `lib/auth/picker/resolvePickerSelection.ts:88-143`, the resolver checks epoch (line 88-90) → roster (line 106-108) → claim (line 110-120, fires only if `crewRow.claimed_via_oauth_at !== null`) → sessionEmail (line 122-143, fires only if `sessionEmail` non-null AND `rowEmail !== sessionEmail`). Reaching the `session_mismatch` arm therefore requires (i) cookie's crew row UNCLAIMED, AND (ii) an active Google session whose email does not match the cookie row's email. Steps 4 + 5 below set up these preconditions in sequence.

**Fixture precondition** (verified against spec §3.3 picker-fixture lockstep contract): a fresh `--combo all` reseed initializes every `crew_members` row with `claimed_via_oauth_at = NULL`. The claim in step 2 stamps ONLY rows whose `crew_members.email` matches `alias_5a_lead`'s fixture email; `alias_6a_a1`'s `crew_members.email` is a distinct fixture address, so `alias_6a_a1.claimed_via_oauth_at` remains NULL throughout leg (c). No dedicated isolation alias is needed — `alias_6a_a1`'s baseline UNCLAIMED state is the precondition for step 5's `session_mismatch` arm.

| Step | Action | Expected outcome |
|---|---|---|
| 1 | **Setup:** in the iPhone (post-leg-(b) state, `alias_5a_lead` picked), the dev confirms `_ShowBody` renders. **Switch to the desktop**, open a fresh browser profile (incognito) so the desktop is a "different device" — load the SAME tokenized URL. Pick `alias_5a_lead` in the desktop's picker. | Desktop has a `__Host-fxav_picker` entry for this show with `id: <alias_5a_lead's crew_member_id>`; iPhone has the same identity in its cookie. Both devices render `_ShowBody`. |
| 2 | **The OAuth claim** — on the iPhone, sign in via Google using a Google account whose email matches `alias_5a_lead`'s `crew_members.email` (the dev controls the fixture email; this is the bypass-pick-then-claim scenario). The OAuth flow: iPhone → `/auth/sign-in` → Google consent → `/auth/callback/route.ts` → invokes `claim_oauth_identity(email)` RPC which stamps `claimed_via_oauth_at = now()` on every matching `crew_members` row (under per-show advisory locks); callback DOES NOT mint a picker cookie (R41-R6 — cookies mint lazily on next show visit via picker-bootstrap). The iPhone redirects to `next` (the tokenized show URL). | iPhone's page-route resolver: cookie has `id: <alias_5a_lead.id>`; Google session matches `alias_5a_lead`'s email; `crewRow.claimed_via_oauth_at !== null`; cookie's `t` is from leg (b) step 3 (pre-claim), so `entry.t <= claimEpochMillis`. Resolver returns `identity_invalidated` with `reason: 'claimed_after_pick'` per `resolvePickerSelection.ts:110-120`; route handler maps to `PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER`. **The picker shows `alias_5a_lead`'s row as visually disabled** (per picker-pivot Resolved Decision 15 — `claimed_via_oauth_at` is non-null). Tapping the disabled row redirects to `/auth/sign-in?next=<URL>` rather than minting a cookie. |
| 3 | On the iPhone (Google session for `alias_5a_lead`'s email still active): just reload the URL — the typical-user path. | Auth chain detects: Google session matches `alias_5a_lead`'s row, `claimed_via_oauth_at IS NOT NULL`, cookie mismatched. Resolver returns `needs_picker_bootstrap` with an intent token; page redirects to `/api/auth/picker-bootstrap?next=<URL>&t=<intentToken>`. Bootstrap mints a NEW picker cookie with `t = result.mint_safe_t_millis` (DB-side, strictly greater than `claimed_via_oauth_at`); 302 back to the URL; `_ShowBody` renders. iPhone is now "signed in, picker skipped" per Resolved Decision 17. |
| 4 | **Cross-device claim propagation (second `claimed_after_pick` observation).** Switch to the desktop (still holding the pre-claim `alias_5a_lead` cookie from step 1; **no Google session on this desktop browser**). Reload the same tokenized URL. | Desktop resolver: cookie has `id: <alias_5a_lead.id>`; `crewRow.claimed_via_oauth_at !== null` (claim from step 2 is global); cookie's `t` from step 1 < `claim_epoch_millis`. Per `resolvePickerSelection.ts:110-120`, the claim arm fires first — resolver returns `identity_invalidated` with `reason: 'claimed_after_pick'` (NOT `session_mismatch`; the session-email arm at line 122 is unreachable without an active Google session). Route handler maps to `PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER`. The dev confirms: `alias_5a_lead`'s row is visually disabled in the desktop's picker (OAuth claim is global; every device sees this identity as claimed). **Pick `alias_6a_a1` (a non-LEAD, OAuth-UNCLAIMED identity) instead** → `selectIdentity` writes a fresh cookie entry for `alias_6a_a1.id`; `_ShowBody` renders as A1 viewer. Desktop's cookie now holds the UNCLAIMED-row precondition for step 5. |
| 5 | **Genuine `session_mismatch` setup (the shared-device-leak vector).** On the desktop (cookie now holds `alias_6a_a1.id` from step 4), sign in to Google using **a different Google account — call it Bob — whose email matches NEITHER `alias_5a_lead`'s NOR `alias_6a_a1`'s `crew_members.email`** (any non-fixture Gmail address works; this is the "Bob picked up Alice's device" composition). After OAuth callback redirects back to the tokenized URL: resolve fires. | Desktop resolver: cookie has `id: <alias_6a_a1.id>` (entry's epoch matches `shows.picker_epoch`, so the epoch arm at line 88-90 does NOT fire). `crewRow.claimed_via_oauth_at IS NULL` (alias_6a_a1 was never claimed; the step-2 claim targeted only `alias_5a_lead`'s email), so the claim arm at line 110-120 is skipped. `sessionEmail` is Bob's email, `rowEmail` is `alias_6a_a1`'s fixture email → `rowEmail !== sessionEmail` → `resolvePickerSelection.ts:122-143` returns `identity_invalidated` with `reason: 'session_mismatch'`. Route handler maps to `PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER` (both `identity_invalidated` reasons collapse to the same banner per `app/show/[slug]/[shareToken]/page.tsx:241-246`; this is intentional — the user-visible copy does not need to differentiate, the contract is enforced by structural meta-test `tests/cross-cutting/identity-invalidated-two-reasons-doc-guard.test.ts`). Sign out of Google on the desktop → reload → cookie still has `alias_6a_a1`, no `sessionEmail`, no claim → `resolved` arm → `_ShowBody` renders as A1 viewer. Confirms `session_mismatch` is transient (resolves when the mismatched Google session ends) and that the shared-device leak vector is correctly blocked at the resolver layer. |

This leg exercises: (i) `OAUTH_IDENTITY_CLAIMED` emission per P-R8 Fix-3 / P-R20 Fix-2 isolation (step 2); (ii) the H8 doc-guard's two-reasons contract by hitting BOTH `claimed_after_pick` (iPhone step 2 + desktop step 4) AND `session_mismatch` (desktop step 5) with concrete resolver-arm-ordering preconditions, not prose hand-wave; (iii) the picker's visually-disabled-row rendering for OAuth-claimed identities (step 2 + step 4); (iv) the lazy-mint picker-bootstrap path (step 3 — Resolved Decision 17, login skips the picker via the bootstrap redirect chain); (v) the cross-device claim-propagation surface (step 4 confirms the claim from step 2 is globally visible without per-device action); (vi) the shared-device-leak vector defense (step 5 — Bob's Google session cannot view the show via Alice's cookie even when the cookie row is itself eligible).

**Per-leg close-out.** After each leg, the dev confirms the M11.5 admin alerts surface (`/admin` AlertBanner) carries the appropriate code (`PICKER_EPOCH_RESET` for leg (b); `OAUTH_IDENTITY_CLAIMED` for leg (c) per the P-R26 email-posture matrix — 3 email-bearing + 3 email-less alert codes). Leg (a) does not emit an admin alert (rotation is the routine admin action; no alert code defined).

**What this catches that the matrix walk does not.** The picker-pivot's three-leg destructive cascade is a cross-surface composition (admin button → DB mutation → Realtime broadcast → cookie invalidation → page-route resolver branch → picker re-render → identity re-selection). Per-cell matrix walking exercises each surface in isolation but not the full chain. J3 is the journey that catches "the destructive action works, but the recovery UX has a seam." It also catches the dev's own UX intuition about the M11.5 admin surface (do the button labels read correctly under load? does the new URL panel update without a manual reload? does the rotation feel safe or scary?) — questions the local impeccable v3 attestation cannot ground.

### 5.4 J4 — Preview-as-crew double-check

`/admin/show/[slug]/preview/[crew-id]` for both a LEAD crew member and an A1 crew member. Verify role-filter sentinels match what crew actually see in J3 (cross-reference). Verify "Learn more →" links do NOT appear inside the previewed crew content (per M11 r10 admin-context boundary). Verify the sticky banner's `?` icon DOES emit its help link.

### 5.5 Per-journey close-out

At each journey's end, the dev mentally notes findings into a working bug-list. The working bug-list is informal — not a required artifact (per §8). It exists so the dev does not lose track during multi-day iteration.

### 5.6 Why four journeys (and not more)

The four journeys are deliberately scoped to cover the cross-surface composition surfaces that the matrix's per-cell pass is blind to. Additional candidate journeys (onboarding-wizard-only, sign-out / sign-back-in, alert handling, catalog error scrolling) are *either* sub-paths of the four above (e.g., onboarding wizard is the opening of J1's cold-start), *or* are already covered by matrix per-cell walking with no additional cross-surface seam (e.g., sign-out is a single-surface action, not a journey). Adding more journeys would dilute the cross-surface focus and risk turning the journey set into a second matrix. Reviewers proposing additional journeys should first demonstrate which cross-surface seam the proposed journey crosses that J1–J4 do not.

---

## 6. Cold-start pass mechanics

A structured pass to surface the unfamiliarity / normalization bug-class.

| Rule | Detail |
|---|---|
| Cooldown | At least 24h after the dev's last code-touch on the product surfaces. Cooldown reduces "I just stared at this; everything looks normal" blindness. |
| Fresh browser profile | Incognito or new browser identity. No cookies, no autofill, no saved sessions. |
| /help as the map | The dev navigates only by what /help (specifically `/help/getting-started` → `/help/daily-rhythm` → `/help/tour`) instructs. *No navigation by dev memory.* |
| What to notice | Friction where /help doesn't match the product. Surfaces where the dev still leans on dev-memory because /help is unclear. Moments where Doug, arriving cold, would stop and ask "what now?" |
| Shortcut catches | If the dev catches themselves shortcutting ("I know it's actually at /admin/show/staged/&lt;id&gt;, let me just click there"), that's a finding — the docs failed for Doug, even if the surface worked. |
| Cadence | Once per major fix iteration, not after every small fix. The cooldown matters more than the count. |

The cold-start pass is run at least twice across the milestone: once in the initial sweep (§7.2 step 2) and once in the final sweep (§7.2 step 7). Additional runs are at the dev's discretion based on what the iteration loop surfaces.

---

## 7. Triage rubric + iteration loop

### 7.1 Triage rubric (formal)

A finding is classified at the moment the dev encounters it. **Borderline cases default UP** — when in doubt, MUST > SHOULD > NICE. The bias prevents "SHOULD-FIX in disguise" failures.

| Tier | Definition | Example findings |
|---|---|---|
| **MUST-FIX** | Would damage Doug's first impression OR prevent him from doing his job. **First impression = the first surface Doug lands on AND any surface he reaches within the first 5 minutes of normal use.** | 500 / 404 on a documented path. Broken Google sign-in. Broken signed-link redemption. Dashboard empty for a real show. A documented tile completely missing or unreadable. The first surface Doug lands on (dashboard, wizard step 1) reads as obviously-prototype. **A surface deeper into the journey (e.g., per-show panel, staged-review card) reads as so obviously-prototype that Doug's confidence in the product would be shaken** — even though it's not the first-landing surface. Tap target &lt;44px on a critical CTA. Light-mode body-text contrast below the DESIGN.md direct-sunlight floor (7:1). Cross-surface inconsistency that changes meaning between two surfaces describing the same show. |
| **SHOULD-FIX** | Friction Doug would notice over repeated use but wouldn't damage first impression OR shake confidence. | Error copy unclear-but-recoverable. Tile spacing off on a rare overflow case. Dark-mode contrast borderline-AA on a non-critical element. Transition jerky on a non-critical surface. A surface visibly less polished than its neighbors but not prototype-y enough to shake confidence. A deep surface (one Doug reaches only after sustained use) that reads as mildly prototype-y without confidence-shake. |
| **NICE-TO-FIX** | Dev-only polish; below the threshold any user would notice. | 1px alignment quirks. Subtle typography inconsistency requiring a developer's eye. Sub-optimal animation easing on micro-interactions. Minor aria-label naming inconsistencies. |

**Boundary clarification (per Codex R1 P1).** "Prototype-y look on a non-load-bearing surface" was ambiguous in an earlier draft. The corrected rule: the test is *would Doug's confidence in the product be shaken if he encountered this?* That puts the boundary at confidence, not at surface-depth. A deeply-nested surface that looks bad enough to shake confidence is MUST. A non-first-landing surface that looks less polished but doesn't shake confidence is SHOULD. The default-up bias still applies — when the dev cannot decide if a finding shakes confidence or not, it goes MUST.

### 7.2 Iteration loop (step-by-step)

```
1. Phase 0 (§9) verifies. Phase 1 starts.
2. Initial sweep — walk full matrix; run J1–J4; run cold-start pass.
3. Triage every finding per §7.1, default-up.
4. Fix pass — address all MUST-FIX. UI-touching fixes run the project's
   invariant 8 (impeccable critique + audit external attestation).
   Conventional-commits style per task.
5. Targeted re-exercise — re-walk surfaces touched by the fixes;
   re-run any journey that crosses them. "Touched by fixes" means: any
   file under app/, components/, or app/globals.css edited by the fix
   PR, plus any band-E catalog-driven affordance whose copy or helpHref
   was modified, plus any surface that consumes a touched band-E entry
   (transitive consumer expansion — see §7.2.1 below).
6. Loop 3–5 until the working MUST-FIX list is empty after each
   re-exercise.
7. Final full sweep — re-walk full matrix; re-run J1–J4; re-run
   cold-start pass after another 24h cooldown.
   If the final sweep surfaces ANY new MUST-FIX (e.g., a regression
   introduced by a fix, a normalization-blind miss that surfaced
   only after the cooldown), return to step 3. The final sweep must
   produce ZERO new MUST-FIX before disposition/sign-off proceeds.
   Sign-off is gated on a clean final sweep, not on arbitrary
   completion of step 7's walk.
8. Disposition SHOULD / NICE per §7.3.
9. Sign-off (§8).
```

#### 7.2.1 "Touched by fixes" — transitive consumer expansion

A fix to a band-E catalog-driven affordance (e.g., `messageFor('LINK_EXPIRED').dougFacing` copy change) propagates to every consumer surface in band B or band F. The re-exercise scope therefore includes:

- Direct: every file the fix PR modified.
- Transitive: every surface that imports / consumes the changed export.
- Cross-band composition: if J1–J4 cross any of the touched surfaces, the affected journey is re-run in full.

#### 7.2.2 Consumer-enumeration rule (R4 amendment)

"Transitive consumer" is concrete: every fix that touches a shared file MUST produce a written consumer inventory before targeted re-exercise begins. The dev runs the inventory step as part of every fix PR's close-out, BEFORE step 5 of the iteration loop. The inventory is informal (a section in the dev's working notes; not a required milestone artifact per §11.3), but the *step* of producing it IS required:

| Touched file class | Required enumeration | Re-exercise expansion |
|---|---|---|
| `lib/messages/catalog.ts` or `lib/messages/lookup.ts` (`messageFor`) entry change | Grep every TSX/TS file under `app/` and `components/` for the catalog code name. Cross-reference each match to a MATRIX-INVENTORY row. | Every matched MATRIX-INVENTORY row gets re-walked. If matches span ≥3 bands, escalate to full-band re-exercise for those bands. |
| `lib/auth/*` change (validateGoogleSession, validateGoogleIdentity, validateLinkSession, requireAdmin) | List every route file under `app/` that imports the changed validator. | Every listed route gets re-walked. |
| `app/globals.css` or `tailwind.config.*` design-token change | All surfaces consuming the changed token, identified by grep. | The change re-runs the impeccable v3 critique + audit on every affected UI surface (invariant 8), then matrix re-exercise on those surfaces. |
| Component file under `components/` change | Grep for `import.*<ComponentName>` across `app/` and `components/`. | Every importer route gets re-walked. |
| Single-page change (e.g., a fix to a single `app/admin/<route>/page.tsx`) | Direct only. | The single surface gets re-walked. |
| Schema migration / Supabase migration | Multi-vector grep recipe (R5 amendment — see §7.2.2.1 below for the full enumeration recipe). Plus a Phase 0 smoke re-run if the migration touches `admin_alerts`, `shows`, or any §4.3 admin-only table. | Listed routes from the multi-vector grep + smoke. |

**Escalation rule.** If the enumeration's matched-row count exceeds 25% of MATRIX-INVENTORY's total row count, the re-exercise auto-expands to a full sweep instead of targeted re-exercise. Rationale: targeted re-exercise of half the matrix isn't materially cheaper than a full sweep, and full sweep catches regressions in unmatched rows that the dev might have miscategorized. Note that catalog and auth changes will routinely cross this threshold (catalog drives many surfaces; auth gates most routes); the rule is intentionally biased toward full sweep in those cases — the dev's time is not the constraint, the milestone's correctness is.

This rule prevents the "targeted re-exercise misses a transitively-affected surface" failure mode named in Codex R1 P0 (originally a class-sweep finding) and Codex R4 F4.

#### 7.2.2.1 Schema-migration consumer-enumeration recipe (R5 amendment)

Schema migrations affect more vectors than file-import grep can find. The recipe is a multi-vector sweep, run in this order, with results unioned into the consumer list:

| Vector | Search command (template) | What it catches |
|---|---|---|
| Supabase JS `.from()` literal calls | `rg -n "\\.from\\(['\\\"]<table_name>['\\\"]\\)" app/ lib/ components/` | Direct table reads with literal string |
| Supabase JS `.from()` schema-qualified calls | `rg -n "\\.from\\(['\\\"][a-z_]+\\.<table_name>['\\\"]\\)" app/ lib/ components/` | Schema-qualified forms like `.from('public.shows')` |
| Supabase JS `.from()` non-literal calls (template literals, variables) | `rg -n "\\.from\\(\`" app/ lib/ components/` AND `rg -n "\\.from\\([a-zA-Z_]" app/ lib/ components/` | Catches `.from(\`prefix_${dyn}\`)`, `.from(tableName)`, `.from(buildTableName())`. Each non-literal match MUST be manually classified — does the dynamic value resolve to the affected table? If undetermined, treat as affected (default-up bias). |
| Supabase JS `.rpc()` calls (if migration adds/changes an RPC) | `rg -n "\\.rpc\\(['\\\"]<rpc_name>['\\\"]\\)" app/ lib/ components/` | Direct RPC consumers |
| Server-side SQL string references | `rg -n "<table_name>" app/api/ lib/db/ supabase/migrations/ supabase/functions/` | Raw SQL queries, migration cross-references, edge function refs |
| Generated TypeScript types | `rg -n "<TableNameInPascalCase>" lib/types/ supabase/types/` | Type-only references in TS that imply usage |
| Helper wrappers — by import-grep | `rg -n "from ['\\\"]lib/data/<helper-or-domain>" app/ lib/ components/` for known domain helpers (e.g., `lib/data/getShowForViewer`, `lib/data/getCrewMember`); also `rg -n "<TableNameCamelCase>|<helper_name>" lib/data/ lib/auth/ lib/sync/` | Helper-wrapper call sites that don't mention the raw table name. Includes `getShowsByOwner()`, `loadCrewMembers()`-style wrappers. |
| Test fixtures | `rg -n "<table_name>" tests/ fixtures/` | Test suites that depend on the table — these are non-validation-walk consumers but flag them for awareness |

Every match from rows 1–7 is mapped to a MATRIX-INVENTORY row (or flagged as EXCLUDED if it's an internal-only path that doesn't render UI). Row 8 (tests) is informational. **Non-literal matches from row 3 are treated as affected unless the dev can prove the dynamic value never resolves to the affected table** — this is the default-up bias applied at the recipe level.

**Worked example.** A migration adds a column to the `shows` table:

1. `rg -n "\\.from\\(['\\\"]shows['\\\"]\\)" app/ lib/ components/` returns N read sites in admin pages, sync helpers, crew page renderers.
2. `rg -n "shows" app/api/ lib/db/ supabase/migrations/` returns the migration itself + admin RPC callers.
3. `rg -n "ShowsRow" lib/types/` returns type-import sites.
4. The dev maps each match: admin page → MATRIX-INVENTORY row IDs A-DASHBOARD, A-PER-SHOW, etc.; crew renderers → B-* rows; etc.
5. Union of rows → re-exercise scope.
6. If count > 25% of total MATRIX-INVENTORY rows → auto-escalate to full sweep per the rule above.

The recipe is intentionally explicit — without it, "list every read-side route" devolves into hand-wavy dev judgement, which is the failure mode Codex R5 F2 named.

### 7.3 Disposition rules (SHOULD / NICE routing)

Per memory `feedback_deferral_discipline.md`:

| Disposition | Destination | Trigger |
|---|---|---|
| Will be done, has concrete trigger or planned milestone home | `DEFERRED.md` of an existing plan, OR the M12 plan's own `DEFERRED.md` | Concrete trigger named |
| Speculative, no home, no trigger, might never be done | `BACKLOG.md` | No trigger; speculative |
| Accepted as a known limitation (intentional design choice) | One-sentence note in the M12 sign-off doc | Reasoned acceptance |

NICE-FIX items are typically routed to BACKLOG.md or discarded if not worth keeping. Aspirational milestone names that don't exist (e.g., "M13 polish" when M13 isn't planned) are NOT real homes — per memory, items belong in BACKLOG.

---

## 8. Exit gate + sign-off

### 8.1 The single required artifact

**One paragraph**, committed to `docs/superpowers/plans/<date>-solo-dev-ux-validation/SIGN-OFF.md` (the plan tree for this milestone; date and exact directory name resolved at plan-writing time, matching the project convention of `<YYYY-MM-DD>-<topic>/`). The paragraph must contain:

1. Explicit assertion that the full matrix was walked.
2. Explicit assertion that all four journeys (J1–J4) were run end-to-end, including the real-iPhone leg of J3.
3. Explicit assertion that the cold-start pass ran at least twice with cooldown discipline.
4. Explicit assertion that MUST-FIX is empty at sign-off time.
5. Reference to where SHOULD-FIX and NICE-TO-FIX items were routed (per §7.3).
6. The subjective dev sign-off in the dev's own words: "I would be proud to show this to Doug" or a personally-meaningful equivalent. **This sentence is load-bearing.** If the dev would not write it, the milestone is not done.
7. (Optional) Anything the dev wants to flag to a future reader (themselves, a reviewer, Doug at handover).

Everything else (per-cell working notes, per-surface screenshots, the working bug-list during iteration) is informal working state — useful for the dev, not required for the milestone's evidence trail.

### 8.2 Re-opening conditions

If between sign-off and the v1-launch milestone the dev encounters a MUST-FIX they missed, M12 re-opens. This is not a failure — it is the structural defense against "I signed off and then noticed." The re-open is recorded as an appendix to `SIGN-OFF.md`; the cycle iterates one more time (fix → targeted re-exercise → updated sign-off).

---

## 9. Phase 0 — prod-equivalent infra setup

### 9.0 Phase 0 scope, ordering, and budget gate (R23 amendment)

Phase 0 has expanded substantially across R5–R22 (validation tooling: 6 CLIs + DB migration + master spec amendments + test baselines). R23 recognized that Phase 0 alone could consume the same 3-8 week budget §3.4 estimates for the whole milestone if left unsequenced. This section establishes Phase 0 task ordering and a budget gate so the bulk of M12's time goes to Phase 1's actual walk, not Phase 0's tooling build.

**Phase 0 canonical task order:**

| # | Task | Estimate | Blocks the next task? |
|---|---|---|---|
| 0.A | Stand up Vercel project (production-target, no custom domain), Supabase prod project, Drive service account + watched folder. Set VALIDATION_* env vars in Vercel + locally. | 0.5–1 day | Yes — every later task needs the infrastructure. |
| 0.B | Author + apply `validation_state` migration atomically with master spec §4.3 amendment, §4.1 CREATE TABLE block, admin-tables generator regen, test baseline updates per §3.3.2 step 6. | 0.5–1 day | Yes — re-seed depends on the table. |
| 0.C | Author `scripts/validation-reseed.ts` + `validation:check-seed` + `validation:resolve-alias`. Run reseed --combo all + check-seed against the prod-equivalent stack. | 1–2 days | Yes — fixtures must exist before mint/revoke/smoke 6. |
| 0.D | Author `scripts/validation-mint-link.ts` + `validation:revoke-link`. Implement the three-env-var mapping (§5.3) and the query-compromise / revoke alias isolation per §3.3 + R22/R23. | 0.5–1 day | Required for smoke 6. |
| 0.E | Author `scripts/validation-report-fixtures.ts`. | 0.5 day | **R24: BLOCKING Phase 1 unless MATRIX-INVENTORY.md pre-dispositions every "deep" report-pipeline outcome (lookup-inconclusive, lease-expired, horizon-expired, orphaned-lost-lease) as `EXCLUDED-rely-on-structural` per §4.2 band F. Default is INCLUDED-via-harness, so by default this task IS blocking. To unblock without authoring the harness, the dev MUST commit a MATRIX-INVENTORY.md with every deep-outcome row dispositioned EXCLUDED + cite to the structural test that pins each contract.** Add Phase 0 smoke test 7 (new): run `pnpm validation:report-fixtures --outcome lookup-inconclusive` and verify the report-failure UI row renders. If the dev chooses the EXCLUDED-rely-on-structural path, smoke 7 is skipped. |
| 0.F | Run all Phase 0 smoke tests per §9.2 — that's smokes 1–6 always, PLUS smoke 7 if Band F deep report outcomes use INCLUDED-via-harness disposition (the default). Smoke 7 is skipped only when MATRIX-INVENTORY pre-dispositions every deep outcome as EXCLUDED-rely-on-structural. | 0.5–1 day | Yes — passes gate Phase 1. |

**Total Phase 0 estimate: 3.5–6.5 days.** Phase 0 should not exceed 1.5 weeks; if it does, the dev should pause and reduce tooling scope rather than continue.

**Phase 0 budget gate (R23 amendment; R25 governance refinement).** If Phase 0 has not closed within 10 calendar days of starting (excluding standard infrastructure-provisioning latency — Supabase project creation, Drive service account approval, Vercel project setup), the dev MUST stop and surface a decision:

1. **Defer non-essential validation tooling.** `validation:report-fixtures` is the most-deferrable item — if MATRIX-INVENTORY.md pre-dispositions every deep report-pipeline outcome as EXCLUDED-rely-on-structural per §4.2 band F, the harness can be skipped and Band F validates only success / in-flight / rate-limit via real walks. **Authorization level: dev-unilateral** — the dev can take this option without external approval because it does not change the milestone shape, only the harness scope, and is structurally constrained by the MATRIX-INVENTORY.md disposition requirement.
2. **Split Phase 0 into its own prerequisite milestone.** Re-number the validation work as "M12a — Validation tooling" and the exercise as "M12b — Walk". Both stay under the v1-launch umbrella but each has its own close-out and budget. **Authorization level: REQUIRES user/orchestrator approval (R25).** Splitting milestones changes the authorized milestone shape; the dev cannot take this option unilaterally. The decision needs an explicit `/` invocation or comparable user statement before the dev proceeds.
3. **Re-scope the walk.** If tooling is genuinely consuming the budget AND options 1+2 don't unblock, the walk's coverage policy (§3.4) can be tightened — fewer R-combos, fewer role variants, fewer journeys. **Authorization level: REQUIRES user/orchestrator approval (R25).** This is the LAST-resort lever because it weakens the validation gate's purpose; the user has set the gate's strength as the load-bearing protection for the working-relationship asset (§1.5), so loosening it is the user's call.

**Recording.** If option 1 is taken, the SIGN-OFF.md appendix records the dev's disposition decision. If option 2 or 3 is taken, the SIGN-OFF.md appendix records the user's approval (with quote/reference) AND the resulting scope change. The appendix is not the authorization mechanism for options 2/3 — it's the audit trail of an authorization that already happened upstream.



Phase 0 stands up the infrastructure the exercise runs against. Phase 1 (the exercise proper) does not start until Phase 0 verifies.

### 9.1 Components to stand up

| Component | Detail |
|---|---|
| **Supabase prod project** | Distinct from the dev project. All migrations applied via `supabase db push` (or equivalent). Seeded with a representative fixture set — NOT Doug's real data; sanitized derivatives or repo fixtures only. |
| **Drive service account (prod-tier)** | A separate service account from the dev one. Its own watched folder. Populated with the same fixture sheets as the seed (so cron paths line up). |
| **Vercel project** | Linked to the repo's `main` branch (or chosen branch). **Production-target deployment** (NOT preview) — Vercel Cron Jobs run only on production deployments per [Vercel Cron Jobs docs](https://vercel.com/docs/cron-jobs). **No custom domain; no DNS.** The `*.vercel.app` URL of the production deployment is the dev's working URL for the entire validation. R3 amendment: an earlier draft said "preview deployment"; corrected — preview deployments do not run cron and would falsify smoke test 3. |
| **Env vars** | All required vars set in the Vercel project: Supabase URL / anon key / service key, Drive service account JSON, GitHub OAuth for the M8 report pipeline, any per-environment flags. |
| **CI gates** | The seven canonical CI gates from `.github/workflows/x-audits.yml` (per master spec X.* lineage) are required-blocking on the branch used for the production-target Vercel deployment. Each is verified to fire — by deliberately tripping one (e.g., a known structural-test regression in a throwaway branch) and confirming the gate blocks. Phase 0 verifies branch-protection has all seven set as required checks. The seven gates are enumerated in §9.1.1 below. |
| **Alert paths** | `admin_alerts` table populates correctly under fixture-induced events. AlertBanner renders correctly from real rows in the prod Supabase. (Push is BACKLOG; alert path here is dashboard-only.) |

### 9.1.1 Canonical CI gate inventory (R6 amendment)

The "seven CI gates" referenced in §9.1 are concrete jobs in `.github/workflows/x-audits.yml`. Each is independently required-blocking on the branch protection rule for the branch used by the production-target Vercel deployment. Phase 0 verifies each is required and each fires correctly:

| # | Gate (CI job name) | Purpose | Scope |
|---|---|---|---|
| 1 | `traceability-audit` | X.6 traceability: every AC-X.Y has a check + every check links to an AC | PR + main |
| 2 | `x1-catalog-parity` | X.1 catalog parity: master spec §12.4 ↔ `lib/messages/catalog.ts` | PR + main |
| 3 | `x2-no-raw-codes` | X.2 invariant 5: no raw error codes in user-visible UI | PR + main |
| 4 | `x3-trust-domain` | X.3 trust-domain audit: validator chains correct per route | PR + main |
| 5 | `x4-no-global-cursor` | X.4 no global sync cursor: per-show modtime model preserved | PR + main |
| 6 | `x5-email-canonicalization` | X.5 email canonicalization at every boundary | PR + main |
| 7 | `verify-branch-protection-status` | Required-blocking PR check: reads the latest privileged `verify-branch-protection` artifact and asserts it ran recently AND succeeded. This is the gate that actually blocks merges. | PR (required-blocking) |

**Companion job (NOT the required gate, R7 amendment).** `verify-branch-protection` is the privileged producer job that runs on push/schedule and writes the branch-protection drift report. It is NOT a required PR check (privileged jobs cannot block PRs in this repo's setup). The PR-required gate is `verify-branch-protection-status` (gate #7 above), which reads the most-recent privileged-run artifact and fails if it's missing or stale. Earlier drafts of this spec named `verify-branch-protection` as the required gate; corrected per Codex R7 F1 — that contradicted master spec AC-X.6 which explicitly designates the `-status` reader as the merge-blocking check.

Phase 0 sub-task: confirm the production-target Vercel deployment branch has all seven set as required-blocking checks in the GitHub branch-protection rule. The privileged `verify-branch-protection` push/scheduled job is verified to be writing artifacts that the `-status` reader can consume (no producer-side breakage that would silently mask a drift).

### 9.1.2 Validation tooling reference (R17 amendment; rebased 2026-05-26 for picker pivot — single authoritative source)

Every validation command introduced by M12 is enumerated below with its full contract. Other sections of this spec reference these commands by name; this table is the source of truth for CLI args, env vars, target DB, output, idempotency, and exit codes. Implementers of the M12 plan use this section as the man-page for the tooling.

**Rebase note (2026-05-26).** The 2026-05-26 amendment deleted Phase 0.D entirely (`scripts/validation-mint-link.ts` + `scripts/validation-revoke-link.ts`) — those tools wrapped the retired M9.5 signed-link surface (`signLinkJwt` + `revoked_links` INSERT) which was deleted at M11.5 G3 cutover. The picker pivot's destructive admin actions (rotation + epoch reset) are exercised through the M11.5 admin UI (`CurrentShareLinkPanel` + `ShareLinkCopyButton` + `RotateShareTokenButton` + `ResetPickerEpochButton`); J3 walks the admin UI directly without CLI parity. The remaining 4 commands cover fixture seed-state + report-pipeline outcome materialization.

| Command | Script path | CLI args | Required env vars | Target DB | Stdout contract | Stderr / exit codes | Idempotency |
|---|---|---|---|---|---|---|---|
| `pnpm validation:reseed` | `scripts/validation-reseed.ts` | `[--combo <R1\|...\|R8b\|SW-PRE_TRAVEL\|...\|SW-POST_SHOW\|all>] [--allow-local-override]` | `VALIDATION_SUPABASE_URL`, `VALIDATION_SUPABASE_SECRET_KEY`, `VALIDATION_SUPABASE_PROJECT_REF` | Prod-equivalent Supabase (rejects localhost unless `--allow-local-override`) | Final line: `seeded <N> combos at <ISO timestamp>` | Exit 0 on success; exit 1 on env error / target validation / DB write failure. Stderr lines start with `[validation-reseed] `. | **`--combo <single>` is UPSERT-ONLY:** only the target combo's fixtures/crew_members/alias_map entries are touched; other combos preserved. **`--combo all` is full-replace.** Re-running with same args on same day = no-op; different date updates per-fixture date columns + bumps `last_seed_date`. |
| `pnpm validation:check-seed` | `scripts/validation-check-seed.ts` | `[--combo <single combo or 'all'>]` | Same three env vars | Same | Exit-0 prints `OK: seed matches today (combos: ...)`; exit-1 prints diagnostic enumerating failed predicate (zero rows / stale date / missing combos / project_ref mismatch / missing aliases / show_share_tokens row missing) | Exit 0 = ready to walk; exit 1 = block walks until reseed runs. | Pure read; idempotent |
| `pnpm validation:resolve-alias` | `scripts/validation-resolve-alias.ts` | `<combo> <alias>` (positional; e.g. `R7b alias_5a_lead`) | Same three env vars | Same | Stdout = bare UUID on success | Exit 0 + UUID printed; exit 1 + diagnostic if combo or alias missing from alias_map | Pure read |
| `pnpm validation:report-fixtures` | `scripts/validation-report-fixtures.ts` | `--outcome <success\|in-flight\|rate-limit-admin\|rate-limit-crew\|lookup-inconclusive\|lease-expired\|horizon-expired\|orphaned-lost-lease>` | Same three env vars | INSERTs / UPDATEs the `reports` table directly via service role to materialize each outcome's row shape per master spec §13.2.3 | Stdout = `materialized <outcome> report row <id>` | Exit 0 on success; exit 1 if outcome name unknown or DB write fails | Each invocation inserts a new row; clean-up via separate `--cleanup` flag (idempotent delete-by-tag) |

**Sequencing note.** The canonical Phase 0 sequence is: reseed → check-seed → (smoke 1) admin sign-in → (smoke 2) share-link + picker iPhone smoke → (smoke 3) cron → (smoke 4) admin_alerts → (smoke 5) clock control → (smoke 6) share-link + picker round-trip (with Rotate sub-smoke) per §9.2. The reference table above is the contract surface; §9.2 is the smoke-sequence-and-prerequisite source. **No mint-link or revoke-link command exists post-amendment** — the picker-pivot's authoritative share URL is read from `CurrentShareLinkPanel` in the admin UI; revocation is achieved via `RotateShareTokenButton` (URL-wide rotation) or `ResetPickerEpochButton` (cookie-wide invalidation), both admin-UI surfaces.

### 9.2 Phase 0 exit criterion

Phase 0 closes when **all required Phase 0 smoke tests pass** — only then does Phase 1 start. The required smoke set is: **smokes 1–6 always required, PLUS smoke 7 when Band F deep report outcomes default to INCLUDED-via-harness** (the default — see §4.2 band F + §9.0 task 0.E). Smoke 7 is skipped only when MATRIX-INVENTORY.md pre-dispositions every deep outcome as EXCLUDED-rely-on-structural with structural-test cites. A seeded DB alone is not sufficient evidence the prod-equivalent stack is wired end-to-end; each smoke exercises a distinct integration axis.

1. **Admin sign-in.** The dev signs in via Google to the deployed production URL (`*.vercel.app`, no custom domain) and lands as admin on `/admin`. Verifies: Supabase auth + admin role-check + RLS read path.
2. **Share-link + picker real-iPhone render.** The dev opens `/admin/show/<R1-slug>` on the deployed production URL, reads the canonical share URL from `CurrentShareLinkPanel` (form: `https://<deploy>.vercel.app/show/<slug>/<64-hex-shareToken>/`), copies it via `ShareLinkCopyButton`, and opens it on the dev's real iPhone in Safari. The iPhone hits the `<SignInOrSkipGate>` Mode A first-contact surface; the dev taps "Skip and pick your name" → picker interstitial → taps an `alias_5a_lead` row → `selectIdentity` writes `__Host-fxav_picker` → `_ShowBody` renders a fixture crew page correctly. Verifies: share-token resolve (`resolveShowFromSlugAndToken`) + picker cookie mint (`selectIdentity` Server Action) + page-route resolver `resolved` arm + crew-page render against real prod Supabase data.
3. **Cron + Drive integration.** A fixture sheet placed in the prod-tier Drive watched folder is detected by the cron path (Vercel Cron → fetch from Drive service account → parse → propagate) within one cron interval. The new show appears in `/admin` Active Shows panel. Verifies: cron schedule firing + Drive service-account credentials + parser end-to-end + DB write under per-show advisory lock.
4. **Admin alert write + AlertBanner render.** A fixture-induced staging event (e.g., editing the seeded fixture to trigger MI-6 crew shrinkage) causes a row to land in `admin_alerts` AND the AlertBanner on `/admin` renders that row on a fresh page load. Verifies: write path to `admin_alerts` + AlertBanner read query + crew-page propagation behavior end-to-end.
5. **Wall-clock + fixture-data clock control.** Seed a fixture into the prod Supabase with `date_restriction.days = [<a date that is NOT today>]` and a known `dates.travelIn/travelOut` window that includes today. Open the share URL from `CurrentShareLinkPanel` on the Vercel `*.vercel.app` production URL, complete the `<SignInOrSkipGate>` skip + picker pick (any eligible alias for the seeded R-combo), and confirm the Right Now card renders `viewer_off_day` copy (per master spec §8 line 2413). Verifies: the production stack reads wall-clock + fixture data correctly without test-auth bypass; the §3.3 wall-clock approach is genuinely available; the picker-pivot's `_ShowBody` render path consumes `date_restriction.days` correctly under real prod Supabase data.
6. **Share-link + picker round-trip with Rotate sub-smoke (R15 amendment; R16 hardened; 2026-05-26 rebased for picker pivot).** **Prerequisite (R16):** before smoke 6 runs, the dev MUST first run `pnpm validation:reseed --combo R1` followed by `pnpm validation:check-seed --combo R1`. This ensures `validation_state.alias_map` carries the R1 entry, the R1 fixture's crew_members exist with non-null `auth_email_canonical`, and the auto-created `show_share_tokens` row is present for the R1 show. **Smoke 6 procedure:** (a) on the deployed production URL, open `/admin/show/<R1-slug>`; read the canonical share URL from `CurrentShareLinkPanel`; copy via `ShareLinkCopyButton`; share to the dev's real iPhone out-of-band (Messages / AirDrop). (b) On the iPhone in Safari: open the URL; `<SignInOrSkipGate>` Mode A; tap "Skip and pick your name"; tap an `alias_5a_lead` row; `_ShowBody` renders. (c) **Rotate sub-smoke:** on the desktop, click `RotateShareTokenButton` on `/admin/show/<R1-slug>` (confirm two-tap). On the iPhone, reload the OLD URL → page emits `showUnavailable()` per M11.5 R2 → renders `PICKER_SHOW_UNAVAILABLE` envelope. Copy the NEW URL via `ShareLinkCopyButton`, share to iPhone, open NEW URL → picker re-renders with `PICKER_EPOCH_STALE_BANNER` (since `rotate_show_share_token` bumps `picker_epoch += 1` atomically) → re-pick `alias_5a_lead` → `_ShowBody` renders. Verifies: (i) `show_share_tokens` resolver path is genuinely available end-to-end (token mint by `shows_create_share_token_after_insert` trigger → read by `loadShowShareToken` / `admin_read_share_token` RPC → consumed by `resolveShowFromSlugAndToken` in the route handler); (ii) the M11.5 rotation invalidates the old URL deterministically (no JWT-replay window — token presence on `show_share_tokens` is the gate); (iii) the admin UI is the canonical share-link interface (no CLI parity — Phase 0.D was deleted per amendment). If smoke 6 fails, the failure-isolation procedure is: (a) re-run `validation:check-seed --combo R1` to rule out seed staleness (it asserts `show_share_tokens` row presence as the auto-trigger sentinel per spec §3.3 check-seed predicates), (b) confirm `RotateShareTokenButton` was clicked under an admin session (`requireAdminIdentity()` gate per P-R19/P-R20), (c) confirm the iPhone's Safari is not caching the old URL response (use the URL bar reload, not the swipe-down refresh which can serve from BFCache).

Phase 0 closes when all required smoke tests pass per the §9.2 conditional gate (smokes 1–6 always + smoke 7 conditional on Band F harness disposition). Failing any required smoke re-opens Phase 0. (R15: smokes 1→5→6 evolved; R24/R25: smoke 7 added conditionally.)

**Smoke test 7 (conditional, R24).** If Band F deep report outcomes default to INCLUDED-via-harness, run `pnpm validation:report-fixtures --outcome lookup-inconclusive` and verify the report-failure UI row renders correctly. Skipped only when MATRIX-INVENTORY.md pre-dispositions every deep outcome as EXCLUDED-rely-on-structural.

The class-sweep here mirrors the Codex R1 P1 and R3 P1 findings: a seeded DB can satisfy a browser-only smoke test while the cron/alert plumbing is broken OR the clock-control mechanism is broken, and Phase 1 would only catch that days later when J2 (pending-sync triage) or R3-R6 restriction-combo walks try to exercise it.

---

## 10. M11 interaction + dependency

M11 ships first (per the resolved timing decision). M12 has a **hard prerequisite on M11 close-out** — Phase 0 cannot start until M11 is signed off and `/help` pages are live in `main`.

| Aspect | Treatment |
|---|---|
| `/help` pages in the matrix | All 13 pages are validation surfaces (surface band D in §4.2). |
| `/help` in the cold-start pass | `/help` is the load-bearing navigation map (per §6). |
| Bugs found in `/help` during M12 | Fixed *here*, not punted to a reopened M11. Fix commits land in the M12 plan-execution sequence. If a /help bug is severe enough that M11 should re-open, that is its own decision; the default is fix-here. |
| /help-side fixes for product friction | If the cold-start pass surfaces a product friction whose cleanest fix is a /help paragraph (rather than a UI change), the fix is a doc edit. Same M12 workflow. |

---

## 11. Structural defense — and what's intentionally absent

### 11.1 What this milestone keeps from project discipline

The M12 spec and plan go through the project's full standard discipline:

1. Brainstorming (this document is the output of brainstorming).
2. Spec self-review (§12).
3. **Mandatory cross-CLI adversarial review on the spec** (Codex critique → convergence loop).
4. User approval of the spec.
5. Plan writing.
6. Plan self-review.
7. **Mandatory cross-CLI adversarial review on the plan.**
8. User approval of the plan.
9. Execution.

The cross-CLI review is especially useful on the spec because the spec defines the matrix's source-of-truth. Codex can catch surfaces missed, persona inventory gaps, journey-script blind spots, rubric ambiguities — all of which the dev would otherwise carry into execution.

### 11.2 What's intentionally absent

**Structural defense at execution time.** Per the artifact decision (§8 — pure dev sign-off), the *exercise output* (per-cell findings, per-surface notes, screenshots, recordings) is not a milestone artifact and therefore not adversarially reviewable. This is a deliberate departure from M0–M10 discipline.

The load-bearing safety mechanism for the exercise output is **dev honesty about the sign-off paragraph**. If the dev writes "I have walked the matrix" and they have not, no structural defense will catch it. The spec acknowledges this as the trust axis of the milestone:

- The matrix walk's completeness rests on the dev. Working notes are recommended but not required.
- The cold-start cooldown discipline rests on the dev. No timestamp gate.
- The triage classifications rest on the dev. No second-pair eyeballs other than the dev's own re-read.

This is acceptable because:

1. The dev IS the audience being protected (the working relationship with Doug is the asset; the dev has direct incentive to be honest with themselves).
2. The matrix *inventory* is structurally defined by the spec (so "what to walk" is not ambiguous).
3. The re-open conditions (§8.2) provide a graceful escape if the dev later realizes they missed something.

### 11.3 Implication for the M12 plan

The implementation plan must NOT add structural artifacts that contradict the "no artifact" decision for the EXERCISE OUTPUT. Specifically:

- The plan does NOT require per-cell check-marks in a committed matrix file.
- The plan does NOT require per-surface screenshots in a committed folder.
- The plan does NOT require session recordings.

The plan MAY suggest informal working tools (a personal bug-list file, a personal matrix-tracker spreadsheet) — but cannot promote any of them to a required milestone output. The sign-off paragraph (§8.1) is the only required EXERCISE output.

### 11.3.1 Distinction: PLAN-time artifacts vs EXERCISE-time artifacts

The "no artifact" rule scopes the exercise's per-cell outputs. It does NOT prohibit plan-time enumeration artifacts that are one-shot, generated before the exercise begins, and not updated during the exercise. The matrix-inventory file (§4.1.1) is the canonical example: it's a derivation of WHAT to walk, produced at plan-time, frozen before Phase 1. It does not become an evidence trail of the dev's walk; it's the definition of the walk.

| Artifact class | Allowed? | Examples |
|---|---|---|
| **Plan-time derivation** (one-shot, frozen before Phase 1) | ✅ Required | `MATRIX-INVENTORY.md` (§4.1.1) |
| **Exercise-time per-cell tracking** (updated during the walk) | ❌ Prohibited | Per-cell check-marks, per-cell screenshots, session recordings |
| **Informal dev working state** (the dev's private notes during iteration) | ➖ Allowed but not required | Personal bug-list, personal matrix-tracker spreadsheet — at the dev's discretion |
| **Sign-off paragraph** (single required EXERCISE output) | ✅ Required (single artifact) | `SIGN-OFF.md` paragraph per §8.1 |

The distinction is meaningful: plan-time artifacts define the *contract* of the milestone (what to walk); exercise-time artifacts would define the *audit trail* of the exercise (which cells the dev visited). The "no artifact" rule applies only to the latter.

---

## 12. Spec self-review check (per AGENTS.md)

This section is the inline self-review per the project's spec-self-review checklist. It is part of the spec, not a separate document, so future readers can trace which checks were applied and why.

| Check | Applies here? | Disposition |
|---|---|---|
| Guard conditions for every prop | N/A | No React components introduced by this spec. |
| Mode boundaries | Applies | §3.1 sub-dimensions table enumerates light/dark × mobile/desktop × real-iPhone-or-not explicitly per cell. |
| Cap / truncation behavior | N/A | No bounded lists; no rendering of unbounded data. |
| Rendered vs conceptual | Applies | §8.1 explicitly names the *one* rendered artifact (the SIGN-OFF.md paragraph) and §11.3 explicitly lists what is NOT rendered. Working notes are explicitly conceptual / informal. |
| Dimensional invariants | N/A | No fixed-dimension parents in this spec. |
| Transition inventory | N/A | No multi-state UI components introduced. |
| Existing-code citations | Applies | Spec cites master spec by section, M11 spec by section, file paths (`scripts/with-admin-dev-flag.mjs`, `lib/messages/lookup.ts`), and memory entries (`feedback_deferral_discipline.md`) where load-bearing. |
| Tier × domain matrix | Applies (R6 + R10 amendments) | `validation_state` table is admin-only operational tooling — Tier × domain treatment in §3.3.2: admin-only RLS via `public.is_admin()` + `admin_only FOR ALL TO anon, authenticated` policy + explicit grants (matches canonical pattern from `supabase/migrations/20260501002000_rls_policies.sql`). Atomically added to master spec §4.3 admin-only list per atomic-commit rule in §3.3.2. Read/write paths: re-seed script (write, service-role), check-seed command (read, service-role), admin sessions (read/write via policy), no v1 UI read path. |
| CHECK / enum migration | Applies (R6 + R10 + R11 + R12 amendments) | `validation_state_combos_check` CHECK constraint enumerates the 10 R-combos (R1–R6 + R7a/R7b/R8a/R8b after R8 split) + 6 show-wide state combo names (R11 added SW-SHOW_LAST). New combo additions require migrating CHECK + extending the script mapping in lockstep. Migration uses `CREATE TABLE IF NOT EXISTS` + `DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT` (R12 drift-safe drop-and-recreate pattern) + `DROP POLICY IF EXISTS + CREATE POLICY` (R14/R15 policy idempotency) + `ADD COLUMN IF NOT EXISTS` + post-add drift-repair `ALTER COLUMN SET DEFAULT/NOT NULL` + type-drift fail-loud (R16). Apply-twice safe AND enum-drift safe per AGENTS.md. |
| Flag lifecycle | N/A | No new boolean config field. |
| Pay-engine grain | N/A | No pay-engine touch. |
| Self-consistency sweep | Applied | Numeric claims cross-checked: 4 journeys (§5.1–§5.4), **8 personas (§3 table — expanded R1 to add `/me` cross-show as persona 8)**, **6 surface bands (§4.2 A–F — band F report-pipeline added R1)**, **9 role sub-variants (§3.2 — 3 LEAD + 6 non-LEAD; LEAD compounds added R2)**, **10 viewer-restriction combinations (§3.3 R1–R6 + R7a/R7b + R8a/R8b — R8 split R7 and R8 each into a/b sub-combos for set-vs-strike day coverage; R9 swept body references that still said "8 combos" / "R1–R8")**, **16 day-state walks per persona** (10 R-combos + 6 show-wide; §3.3.1 — R8 split bumped 13→15; R11 added SW-SHOW_LAST bumping to 16), **6 show-wide Right Now states (§3.3.1 — added R4; R11 split show_day_N into show_day_interior + show_day_last after Codex caught the isLast Strike-copy branch)**, **11 role×restriction sampled pairs (§3.4.1 — added R4; R10 expanded from 9 to 11 to cover R7b and R8b after R8 split)**, **120 restriction-tile cells + 44 role-pair cells** (§3.4 estimates — R9 corrected from 96/32; R10 corrected role-pair from 36 to 44 after R7b/R8b pairs added), **650–850 total upper-bound cells** (§3.4 — corrected R9 from 600–800), **7 matrix-derivation sources (§4.1.1 — added R2)**, **3 coverage classes (§3.4 FULL/PAIRWISE/SMOKE-SAMPLE — added R3)**, **6 Phase 0 smoke tests (§9.2 — R3 added smoke test 5 clock control; R15 added smoke test 6 mint-redeem round-trip; R5 corrected one stale "all four" wording)**, **6 transitive-consumer file classes (§7.2.2 — added R4; catalog, auth, design tokens, components, single-page, schema; R5 normalized stale "5" claim)**, **8-vector schema-migration enumeration recipe (§7.2.2.1 — added R5; R6 expanded from 6 to 8 vectors)**, **7 canonical CI gates (§9.1.1 — added R6; R7 corrected gate #7 name to `verify-branch-protection-status`)**, **22 admin-only tables after `validation_state` lands (§3.3.2 — R8 verified live deltas: master spec §4.3 line 605 21→22; AC-2.5 line 3489 21→22 / 84→88)**, **validation_state RLS = admin_only FOR ALL (R9 correction)**, **dedicated VALIDATION_SUPABASE_* env vars for target-selection (R9 addition)**, 13 /help pages (per M11 §4), MUST/SHOULD/NICE triage tiers (§7.1), 24h cooldown (§6), ≥2 cold-start runs (§6 + §7.2 step 7). |
| Disagreement-loop preempt | Applied | §11.2 ("intentionally absent") names the "no artifact" decision as deliberate, with rationale, so reviewers don't relitigate it. §1.5 names "no real-user testing" as deliberate, with rationale. §2 enumerates explicit deferrals so reviewers don't surface them as gaps. |
| Build-vs-runtime gate explicitness | Applies | Phase 0 §9 names the build target (Vercel `*.vercel.app` production deployment, no custom domain); §9.2 names the six runtime smoke tests that gate Phase 1 (R15 added the mint-redeem round-trip as smoke #6). The seven CI gates (§9.1.1) are PR-time + main-branch build-time gates; the alert path is a runtime path. R6 amendment: stale "preview build" wording corrected to "production deployment" in this row. |

---

## 13. Resolved decisions (brainstorming audit trail)

| Decision | Resolution | Rationale |
|---|---|---|
| Bug-class scope | All four (composition, craft, real-device, cold-start) | Each automated layer is structurally blind to a different class; covering only one would leave others uncaught. |
| Prod-readiness axis | Prod-equivalent infra, no real domain | Validates the prod *wiring* (real Supabase, real Drive, real Vercel) without the prod *exposure* (custom domain, DNS, public URL). Domain + launch becomes a follow-on milestone with its own gate. |
| Exercise shape | Hybrid: matrix + 2–4 journeys + cold-start | Matrix is the completeness floor (blind to composition); journeys are the composition test (blind to orphan surfaces); cold-start is the unfamiliarity test (blind to everything else). Each mode covers a class the others cannot. |
| M11 timing | M11 first, then M12 | `/help` becomes load-bearing for the cold-start pass and a band in the matrix. Validation stress-tests M11 as a side-effect. |
| Exit criterion | MUST-FIX empty + dev subjective sign-off | Objective list catches structurally; subjective gate catches "would Doug's first impression be damaged?" which a bug list cannot. |
| Artifact shape | Pure dev sign-off (single paragraph), no formal matrix-walked record / screenshots / recordings | Deliberate departure from M0–M10 structural-defense discipline. The trust axis is acknowledged explicitly in §11.2. |

---

## 14. Open questions

None at spec-write time post-R1. Spec is ready for adversarial review round 2.

---

## 15. Adversarial-review audit trail

### 15.1 Round 1 (Codex `019e43be-eee4-79f3-aaca-425df0feb746`, 2026-05-19)

Verdict: `needs-attention`. Five findings, all accepted as legitimate and addressed in this revision.

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — Signed-link persona used query token `?token=` instead of canonical fragment `/show/<slug>/p#t=<jwt>` per master spec §7 | P0 / critical | Fixed. All references corrected to fragment form. Negative-auth surface added for the query-token compromise path. | §3 personas 5/6, §4.2 bands B/C, §5.3 J3, §3.1 sub-checks |
| F2 — Surface bands did not enumerate M8 report-pipeline surfaces (admin parse-panel report button, preview/banner report button, crew footer "Something looks wrong?" modal, submission success/failure, rate-limit, lookup-inconclusive, lease-expired states) | P0 / high | Fixed. New band F added for report-pipeline surfaces. Crew footer report-modal entry also added to band B. Band E broadened from `/admin/*` only to admin AND crew catalog-driven messages (class-sweep). | §4.2 bands B / E / F |
| F3 — Iteration loop step 7 (final full sweep) did not loop back if a new MUST-FIX surfaced; sign-off could proceed with a known blocker | P0 / high | Fixed. Step 7 now requires zero new MUST-FIX before disposition/sign-off proceeds. New §7.2.1 defines "touched by fixes" with transitive consumer expansion. | §7.2, §7.2.1 |
| F4 — Persona inventory collapsed multiple role/auth states (LEAD vs A1/A2/V1/L1/BO/etc.; Google fresh vs return; `/me` cross-show surface missing) | P1 / medium | Fixed. Persona inventory expanded from 7 to 8 (added `/me` as persona 8). Persona 7 split into fresh + return sub-cases. New §3.2 enumerates 6 non-LEAD scope sub-variants (6a–6f) the plan must exercise. | §3 table, §3.2 new |
| F5 — Phase 0 exit criterion (2 smoke tests: admin sign-in + signed-link render) did not prove cron, Drive-watched-folder visibility, `admin_alerts` write, or AlertBanner read end-to-end | P1 / medium | Fixed. Phase 0 exit expanded to 4 smoke tests covering admin sign-in, signed-link real-iPhone render, cron + Drive integration, and admin-alert write + AlertBanner render. | §9.2 |

**Class-sweep additions made during R1 repair (beyond the named findings):**

- **Boundary clarification on triage rubric** (§7.1) — added per Codex's secondary concern about "prototype-y on a non-load-bearing surface" being ambiguous. The corrected rule anchors on *confidence-shake*, not surface-depth.
- **Band E broadening** (§4.2) — Codex named the report-surface miss; the class-sweep revealed band E was scoped to `/admin/*` catalog messages and missed crew-facing catalog messages (e.g., `LINK_EXPIRED`). Broadened to cover both.
- **`/me` page added** — Codex's F4 mentioned Google fresh-vs-return; the class-sweep revealed the master spec line 2266 `/me` cross-show surface uses a different validator (`validateGoogleIdentity` vs `validateGoogleSession`) and is not show-bound, making it a structurally distinct surface absent from the original draft. Added as persona 8 + surface row in band B.

### 15.2 Round 2 (Codex `019e43c6-7021-7011-aa0c-3a459d93840c`, 2026-05-19)

Verdict: `needs-attention`. Two P1 findings, both accepted and addressed.

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — Surface inventory delegation too informal: §4.1 said "plan-time walk is authoritative" but did not require an enumerable derivation method, risking silent omissions of hard-to-notice surfaces (stale states, asset routes, diagnostic outcomes, spec-id-only surfaces) | P1 / high | Fixed. New §4.1.1 mandates the M12 plan's first task generate a `MATRIX-INVENTORY.md` file derived from 7 explicit sources (master headings, master spec-IDs, M11 pages, route inventory, catalog inventory, report-pipeline outcomes, §9.0.1 affordance matrix). Every candidate row dispositioned INCLUDED / EXCLUDED / BAND-OVERLAP with reasoning. New §11.3.1 distinguishes plan-time derivation artifacts (allowed) from exercise-time per-cell tracking (prohibited). | §4.1 + new §4.1.1, new §11.3.1 |
| F2 — Role matrix collapsed LEAD into a single generic row; missed compound LEAD+scope (e.g., `LEAD / A1` per master spec §6.6 line 1418) and date/stage restriction axes (master spec lines 2372/2395/2405–2414) | P1 / high | Fixed. §3.2 expanded from 6 non-LEAD variants to 9 total (3 LEAD compounds 5a–5c + 6 non-LEAD 6a–6f). New §3.3 enumerates 8 restriction combinations (R1–R8) crossing date_restriction × stage_restriction × today-vs-assigned-day. Right Now card state inventory cited (`viewer_unconfirmed`, `viewer_off_day`, `viewer_off_day_pre`, `viewer_after_last_day`). | §3.2, new §3.3 |

**Class-sweep additions during R2 repair:**

- **Real-iPhone sample expansion** (§3.1) — added 5b (LEAD compound) to the iPhone-required subset alongside 6a / 6d / 6f. Compound-LEAD on real iPhone catches the financials+scope-tile composition on the device class that matters most.
- **Day-of-walk control mechanism** (§3.3) — initially cited M11's `X-Screenshot-Frozen-Now` header pattern as a reusable mechanism; **R3 amendment retracted this** — that header requires `ENABLE_TEST_AUTH` which is production-unsafe. The corrected mechanism is wall-clock + fixture-data engineering (§3.3 R3-amended).

### 15.3 Round 3 (Codex `019e43cb-3d40-7130-8bf4-35f13a377d32`, 2026-05-19)

Verdict: `needs-attention`. Three findings (1 P0 critical Vercel-Cron fact, 2 P1 matrix-bounds + clock-control). All accepted and addressed.

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — Phase 0 used Vercel preview deployment, but Vercel Cron Jobs run only on production deployments per Vercel docs; smoke test 3 (cron + Drive integration) would be impossible to run on a preview | P0 / critical | Fixed. §9.1 Vercel project row corrected to "production-target deployment" with `*.vercel.app` URL (no custom domain). All "preview URL" / "preview deployment" references throughout the spec swept and replaced with "production URL" / "production deployment" where they referred to the validation stack. (Persona 4 "admin previewing as crew" wording unchanged — different sense of "preview".) | §2 out-of-scope, §3.1 sub-checks, §3.2 closing paragraph, §5.1 J1, §9.1 Vercel row, §12 self-review build-vs-runtime |
| F2 — Expanded matrix had no bounded crossing rule; 9 role × 8 restriction × N surface × 4 mode could explode to 1000+ cells with no policy for sampling vs full crossing | P1 / high | Fixed. New §3.4 "Axis applicability + sampling policy" defines three coverage classes (FULL / PAIRWISE / SMOKE-SAMPLE) and assigns a policy per axis. Bounded estimate ≈ 600–800 cells (20–30 exercise hours; realistic 2–4 week milestone). MATRIX-INVENTORY.md (§4.1.1) now records coverage class per row. | New §3.4 |
| F3 — §3.3 clock-control mechanism cited M11's `X-Screenshot-Frozen-Now` header, but that header is gated by `ENABLE_TEST_AUTH` which is production-unsafe; the prod-equivalent Phase 0 stack cannot enable it | P1 / high | Fixed. §3.3 rewritten to use **wall-clock + fixture-data engineering** instead of the header. Re-seed script aligns fixture dates relative to `now()`. No code-path bypass. Phase 0 smoke test 5 (new) verifies the re-seed mechanism produces the expected `viewer_off_day` state before Phase 1. | §3.3 (rewritten clock mechanism), §9.2 (added smoke test 5) |

**Class-sweep additions during R3 repair:**

- **Production vs preview terminology sweep** — fixed every "preview URL / preview deployment" reference for the validation stack. Persona 4 "admin previewing as crew" is a different sense (impersonation preview), not a Vercel preview deployment, and was deliberately not touched.
- **Phase 0 smoke test count** updated to 5 (was 4 after R1).

### 15.4 Round 4 (Codex `019e43d0-669b-7f40-9852-6a81cbccc0f3`, 2026-05-19)

Verdict: `needs-attention`. Four findings (2 P1, 2 P2). All accepted and addressed.

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — Multi-day wall-clock walks can use stale fixture dates: iteration loop didn't require re-seed before each walk session | P1 / high | Fixed. New §3.3 step 5 "Walk-session gate" requires the dev run the re-seed script (or verify the `validation_seed_date` stamp matches today) BEFORE every initial walk, targeted re-exercise, or final sweep. Stale fixtures block progression. | §3.3 |
| F2 — Role × restriction labeled "PAIRWISE" but specified only 8 pairs, which is sampling not pairwise (true pairwise = 72 pairs) | P1 / high | Fixed. Relabeled as **SMOKE-SAMPLE with explicit pair selection**. New §3.4.1 enumerates 9 specific pairs covering each role variant and each restriction at least once, with explicit acceptance of the cross-coverage gap. | §3.4 (terminology), new §3.4.1 |
| F3 — Right Now state coverage omitted show-wide states (`pre_travel`, `travel_in_day`, `show_day_N`, `post_show`); R1–R8 only covered viewer-restriction states | P2 / medium | Fixed. New §3.3.1 "Right Now show-wide state inventory" enumerates 5 show-wide states walked once each (LEAD + restriction `none`). Combined with R1–R8, Right Now card has 13 day-state walks per persona. | New §3.3.1 |
| F4 — §7.2.1 transitive consumer expansion didn't define how to enumerate consumers; "every surface that imports the change" was hand-wavy | P2 / medium | Fixed. New §7.2.2 "Consumer-enumeration rule" defines a per-touched-file-class enumeration table (catalog, auth, design tokens, components, schema). Required grep step before targeted re-exercise. Auto-escalate to full sweep if >25% of MATRIX-INVENTORY rows match. | New §7.2.2 |

**Class-sweep additions during R4 repair:**

- **Time-budget hedging** (§3.4 estimate) — earlier draft said "2–4 weeks". R4 widened to 3–8 weeks with explicit per-cell rate range (10–30 cells/hour). The optimistic earlier number was not justified by per-step costs (cooldown, real-iPhone IO, mode-switching, triage time).
- **Show-wide state inventory cross-link** (§3.3.1) — added explicit MATRIX-INVENTORY disposition rule for show-wide states so the §4.1.1 derivation captures them.

### 15.5 Round 5 (Codex `019e43d4-c820-7e43-8733-cf9d37a54308`, 2026-05-19)

Verdict: `needs-attention`. Three findings (2 P1, 1 P2). All accepted and addressed.

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — Walk-session gate depended on an undefined re-seed script: no path, CLI contract, storage schema, or owned fixture mappings | P1 / high | Fixed. §3.3 step 5 now specifies the re-seed contract concretely: script path `scripts/validation-reseed.ts`, CLI `pnpm validation:reseed [--combo …]`, storage schema (`validation_state` table), verification command `pnpm validation:check-seed`. Authoring the script is a plan-time deliverable in Phase 0; smoke test 5 verifies it. | §3.3 step 5 |
| F2 — Schema-migration consumer enumeration in §7.2.2 was not actionable; "every read-side route" gave no discovery mechanism for `.from()` / `.rpc()` / SQL strings / generated types / helpers | P1 / high | Fixed. New §7.2.2.1 specifies a 6-vector grep recipe with template commands and a worked example. Every match unions into the consumer list and maps to MATRIX-INVENTORY rows. | §7.2.2 (schema row), new §7.2.2.1 |
| F3 — Stale gate counts: §9.2 said "all four" in one place and "all five" in another (contradiction); §12 self-review claimed "5 transitive-consumer file classes" but §7.2.2 table has 6 rows | P2 / medium | Fixed. §9.2 normalized to "all five" in both places. §12 self-review updated to "6 transitive-consumer file classes". | §9.2 (both wording instances), §12 numeric self-check |

**Class-sweep additions during R5 repair:**

- **Escalation-rule rationale** (§7.2.2) — added an explicit note that catalog/auth changes will routinely exceed the 25% threshold, and the rule intentionally biases toward full sweep in those cases. This was implicit before; making it explicit clarifies that the escalation is a feature, not a degenerate case.

### 15.6 Round 6 (Codex `019e43d8-90b9-72d0-b725-70344dca190b`, 2026-05-19)

Verdict: `needs-attention`. Three findings (1 P1, 2 P2). All accepted and addressed.

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — `validation_state` new prod table introduced by R5 bypassed master spec's DB-touching discipline (RLS, admin-only classification, CHECK idempotency, meta-test inventory). §12 had marked Tier × domain and CHECK/enum as N/A — correct before R5, stale after. | P1 / high | Fixed. New §3.3.2 specifies the table's schema with admin-only RLS (default-deny + service-role bypass), CHECK constraint enumerating allowed combo names, apply-twice idempotency pattern, Supabase call-boundary expectation, and meta-test registry inclusion. §12 Tier × domain and CHECK/enum rows updated from N/A to "Applies". | §3.3 stamp row, new §3.3.2, §12 self-review (2 rows) |
| F2 — §7.2.2.1 schema-migration grep recipe used literal-string matching only; missed `.from('public.shows')` schema-qualified forms, template-literal `.from(\`...\`)`, dynamic `.from(varName)`, and helper-wrappers whose call sites don't mention the raw table name | P2 / medium | Fixed. Recipe expanded from 6 vectors to 8: added schema-qualified literal match, non-literal call detection (with manual classification), and helper-by-import-grep. Non-literal matches are treated as affected unless dev proves otherwise (default-up bias at recipe level). | §7.2.2.1 (vectors expanded) |
| F3 — Spec referenced "the seven CI gates" but never enumerated them; §12 said "preview build" (stale) and §9.1 said "full CI gate set" without names; Phase 0 had no way to verify each gate is required-blocking | P2 / medium | Fixed. New §9.1.1 enumerates the 7 canonical CI gates by job name from `.github/workflows/x-audits.yml` (`traceability-audit`, `x1-catalog-parity`, `x2-no-raw-codes`, `x3-trust-domain`, `x4-no-global-cursor`, `x5-email-canonicalization`, `verify-branch-protection`). Phase 0 verifies each is required-blocking on the deployment branch. §12 build-vs-runtime row corrected from "preview build" to "production deployment". | §9.1 (CI gates row), new §9.1.1, §12 self-review build-vs-runtime |

**Class-sweep additions during R6 repair:**

- **§4.3 admin-only tables forward-ref** (§3.3.2) — noted that `validation_state` should be added to master spec §4.3 admin-only tables list when the migration lands. **R7 amendment: this was upgraded from "should add" to MUST and atomic with the migration; see §15.7 below.**
- **Meta-test inventory hook** (§3.3.2) — noted that if any future `tests/db/` test enumerates admin-only tables (per memory `feedback_meta_test_at_plan_time_not_round_n`), `validation_state` is added to that registry. **R7 amendment: upgraded to atomic-update requirement.**

### 15.7 Round 7 (Codex `019e43dd-7688-7433-9eb6-b626e589997a`, 2026-05-19)

Verdict: `needs-attention`. Three P1 findings, all factual corrections. All accepted and addressed.

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — §9.1.1 named `verify-branch-protection` as the 7th required-blocking CI gate. That contradicts master spec AC-X.6 — the PR-required gate is `verify-branch-protection-status` (the reader). `verify-branch-protection` (the privileged producer) runs only on push/schedule and CANNOT be a required PR check in this repo's setup. | P1 / high | Fixed. Gate #7 swapped to `verify-branch-protection-status`. Added explicit "Companion job (NOT the required gate)" note describing the privileged producer's role. Phase 0 sub-task updated to verify the producer is writing artifacts the reader consumes. | §9.1.1 |
| F2 — `validation_state` DDL used random UUID PK, permitting multiple rows. Singleton semantics from §3.3 walk-session gate were therefore unenforced; multi-row state would make `validation:check-seed` ambiguous and break the walk-session gate's correctness. | P1 / high | Fixed. DDL changed to `key text PRIMARY KEY CHECK (key = 'validation_seed')`. Singleton write semantics specified explicitly: re-seed script uses `INSERT … ON CONFLICT (key) DO UPDATE`; check-seed reads the singleton row, fails if missing or stale. | §3.3.2 DDL block, new "Singleton write semantics" paragraph |
| F3 — §3.3.2 said `validation_state` "should be added" to master spec §4.3 admin-only list "when the migration lands" — optional/soft language, but repo derives ADMIN_TABLES from §4.3 and AC-2.5 requires full parity. Soft language let the migration land alone, opening a drift window before the registry caught up. | P1 / high | Fixed. Hardened from "should add" to "MUST, atomic with the migration". The same Phase 0 commit (or single PR) MUST include the migration + script + master-spec §4.3 amendment + `lib/audit/admin-tables.generated.ts` regen + AC-2.5 update if needed + meta-test registry update. Atomicity gate: Phase 0 doesn't close until X.3 / X.6 / admin-table tests pass against the updated master + regenerated registry. | §3.3.2 "Plan-time deliverable" paragraph (rewritten as atomic) |

**Class-sweep additions during R7 repair:**

- **CI gate role differentiation** (§9.1.1) — added the "Companion job" explanation to clarify the producer/reader pattern. This is master-spec X.6 contract; the M12 spec previously elided it.
- **Cross-document amendment authority** (§3.3.2) — implicit clarification that M12 has authority to amend master spec for an M12-introduced table. This was unstated; making it explicit removes ambiguity about whether the M12 plan can edit master spec.

### 15.8 Round 8 (Codex `019e43dd-7688-7433-9eb6-b626e589997a` thread reused, 2026-05-19)

Verdict: `needs-attention`. Two findings (1 P1, 1 P2). All accepted and addressed.

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — §3.3 R7 / R8 each compressed two distinct day-walks into a single row (e.g., "Set day vs strike day"), but the re-seed contract materializes ONE fixture per combo with ONE expected `today` state. A single fixture/walk could only satisfy one side; the milestone could pass without proving pack-list visibility on the opposite day. | P1 / high | Fixed. R7 split into R7a (set-day visible) + R7b (strike-day hidden); R8 split into R8a (strike-day visible) + R8b (set-day hidden). Total combos 8 → 10. Re-seed combo enum updated (`'R7a','R7b','R8a','R8b'` replace `'R7','R8'`). §3.3.2 CHECK constraint enum updated. §3.4.1 pair 3 references R7a; pair 8 references R8a. New "Expected outcome" column added to the R-table. | §3.3 R-combo table (split + Expected column), §3.3.2 DDL (CHECK enum), §3.3 step 5 invocation enum, §3.4.1 9-pair selection (pairs 3 & 8) |
| F2 — §3.3.2 atomic-update language was still soft ("should add" / "if AC-2.5 has a literal count"), but live verification confirms master spec §4.3 line 605 has literal "21 tables" AND AC-2.5 line 3489 has literal "21 tables × 4 verbs = 84 assertions" AND tests/db/rls.test.ts:163-164 + tests/db/admin-rls-runtime.test.ts (7 references) + tests/cross-cutting/auth.test.ts:203 all hardcode 21 or the explicit ADMIN_TABLES list | P2 / medium | Fixed. Atomic checklist replaced soft language with concrete edits at verified line numbers. 21 → 22 deltas specified. 84 → 88 assertion-count delta specified. Test files enumerated by path. Atomicity gate strengthened with named test commands and named CI gates. | §3.3.2 "Plan-time deliverable" (rewritten with concrete line refs), §3.3.2 "Atomicity gate" (enumerated test names) |

**Class-sweep additions during R8 repair:**

- **Expected outcome column** (§3.3) — added to the R-combo table as a structural improvement (R8 F1 also surfaced that R1–R6 had implicit expected outcomes; making them explicit removes interpretation gaps).
- **Hardcoded-baseline inventory** (§3.3.2 step 6) — enumerated every hardcoded count in the live test suite that needs updating in lockstep with the migration. Future admin-only table additions in any milestone should follow the same enumeration pattern.

### 15.9 Round 9 (Codex `019e43dd-7688-...` thread reused — 2026-05-19)

Verdict: `needs-attention`. Three findings (2 P1, 1 P2). All accepted and addressed.

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — `validation_state` RLS posture contradicted the §4.3 admin-table contract. Spec said "RLS enabled, no policies, service-role-only" but the atomic checklist adds the table to §4.3 and the existing admin-table tests (`tests/db/rls.test.ts`, `tests/db/admin-rls-runtime.test.ts`) assert `admin_only FOR ALL` policy for every admin-only table. Following the DDL fails the updated tests; adding admin policy violates the service-role-only posture. Internal contradiction. | P1 / high | Fixed. DDL now includes `CREATE POLICY admin_only FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin())`. Service role bypasses RLS so script writes still work; admin reads work; non-admin sessions denied per AC-2.5 (matching every other admin-only table's pattern). | §3.3.2 DDL block, §3.3.2 RLS discipline-mapping row |
| F2 — Re-seed / check-seed could pass against local Supabase while the walk uses the prod-equivalent Vercel deployment. Default `SUPABASE_URL=http://127.0.0.1:54321` would let script seed local DB, check-seed pass locally, but prod Supabase be stale or unseeded. | P1 / high | Fixed. Re-seed contract now requires dedicated `VALIDATION_SUPABASE_URL` + `VALIDATION_SUPABASE_SERVICE_KEY` env vars (distinct from local). Localhost/`127.0.0.1`/`::1` rejected unless `--allow-local-override`. New column `seeded_supabase_project_ref` stamped on every seed. `check-seed` verifies project_ref matches `$VALIDATION_SUPABASE_PROJECT_REF` env. | §3.3 step 5 "Target selection" row (new), §3.3.2 DDL (new column), §3.3.2 check-seed semantics |
| F3 — R7/R8 split (R8 F1) left stale "8 R-combos" / "R1–R8" / "8+5=13" / "96 cells" / "32 cells" / "8 combos" references across the body | P2 / medium | Fixed. Swept: §3.3.2 CHECK row (8→10 combos), §3.3.1 R-band reference (R1–R8 → R1–R6 + R7a/R7b/R8a/R8b), §3.3.1 total walks (8+5=13 → 10+5=15), §3.4 axis policy row (R1–R8 → 10 total), §3.4 cell estimates (96 → 120; 32 → 36 using 9-pair selection), total upper-bound estimate (600-800 → 650-850 cells). Audit-trail references to R1–R8 and "8 pairs" left intact as historical context. | §3.3.2, §3.3.1, §3.4, §3.4 estimates |

**Class-sweep additions during R9 repair:**

- **Cell estimate correction** — earlier estimate "8 pairs × 4 = 32 cells" was already stale even before R8 (the §3.4.1 9-pair selection landed in R4). R9 sweep caught this latent error too.

### 15.10 Round 10 (Codex `019e43ec-2e13-7fa0-bc92-36a49b2faa2e`, 2026-05-19)

Verdict: `needs-attention`. Three findings (1 P1, 2 P2). All accepted and addressed.

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — `validation_state` DDL didn't match the repo's canonical admin-only policy/grant shape. Live migrations use `public.is_admin()` (schema-qualified), `TO anon, authenticated` (both roles), and explicit grants BEFORE enabling RLS. My DDL used unqualified `is_admin()`, `TO authenticated` only, and no grants — would fail structural test regex in `rls.test.ts` and block admin reads. | P1 / high | Fixed. DDL rewritten to mirror `supabase/migrations/20260501002000_rls_policies.sql` pattern: grant SELECT/INSERT/UPDATE/DELETE to anon + authenticated; grant ALL PRIVILEGES to service_role; enable RLS; `CREATE POLICY admin_only ... FOR ALL TO anon, authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())`. | §3.3.2 DDL block |
| F2 — §3.4.1 still claimed the 9 sampled pairs cover "each restriction combo at least once" — but R8 split bumped combo count from 8 to 10, and the pair list never picked up R7b or R8b. So R7b and R8b had no role-restriction pair coverage. | P2 / medium | Fixed. Added pair 10 (6f × R7b — empty flags × set-day stage on strike day) and pair 11 (5a × R8b — pure LEAD × strike-day stage on set day). Selection now covers all 10 restriction combos. Total pairs 9 → 11. Cell estimate 36 → 44. | §3.4.1 (added 2 pairs, updated rationale), §3.4 estimates |
| F3 — §12 self-review still said `validation_state` was "default-deny, service-role-only" (R9 corrected the body but not the self-review) and CHECK had "8 R-combos + 5 show-wide" (R8 corrected the body but not the self-review). | P2 / medium | Fixed. §12 Tier × domain and CHECK/enum rows rewritten to match repaired body: admin-only RLS via `public.is_admin()`, 10 R-combos (R1–R6 + R7a/R7b/R8a/R8b). | §12 self-review (2 rows) |

**Class-sweep additions during R10 repair:**

- **DDL canonical-pattern citation** — referenced `supabase/migrations/20260501002000_rls_policies.sql` line numbers as the canonical pattern. Future admin-only tables should cite the same canonical migration so DDL drift is structurally caught.
- **Self-review staleness audit** — R10 surfaced that the §12 numeric self-review claims can lag behind body changes if not swept per round. The audit-trail discipline is now: every round's class-sweep includes a §12 staleness sweep. Future rounds: explicitly include "§12 numeric sweep" in the round's class-sweep checklist.

### 15.11 Round 11 (Codex `019e43ec-2e13-7fa0-bc92-36a49b2faa2e` thread reused, 2026-05-19)

Verdict: `needs-attention`. Four findings (2 P1, 2 P2). All accepted and addressed.

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — Re-seed contract didn't materialize crew_members for the 9 role variants. §3.3 mapping had only restriction-axis fields; §3.2/§3.4 required all role variants walked; §5.3/§5.4 J3/J4 required LEAD + A1 signed/preview links. A plan implementer could satisfy the written re-seed contract and have no deterministic crew_ids for role-variant walks. | P1 / high | Fixed. Re-seed mapping extended to require **9 crew_members per R-combo fixture**, one per role variant 5a–5c + 6a–6f, with stable aliases (`alias_5a_lead`, ..., `alias_6f_empty`) and predictable emails. J3/J4 signed/preview-link generation contract added: dev resolves aliases to crew_ids via `validation-aliases.json` (or stamped into validation_state). Show-wide states seed only LEAD (5a) per §3.3.1. | §3.3 step 5 "Owned fixture mappings" row + new J3/J4 paragraph |
| F2 — Migration idempotency prose said "CREATE TABLE IF NOT EXISTS + DO/duplicate_object guard" but the actual DDL SQL block used plain `CREATE TABLE` with inline CHECK. Second apply would fail; contradicted AGENTS.md apply-twice invariant. | P1 / high | Fixed. DDL block rewritten to use `CREATE TABLE IF NOT EXISTS public.validation_state (...)` (no inline CHECK) + separate `ALTER TABLE ... ADD CONSTRAINT validation_state_combos_check ...` inside `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL END $$`. Migration idempotency self-review row updated to match the new DDL shape. | §3.3.2 DDL block, §3.3.2 "Migration idempotency" row |
| F3 — Show-wide states walked `show_day_1` and `show_day_N` (interior) but missed `show_day_last` — master spec §8 has a distinct render branch with Strike copy when `isLast = true`. Last-day Right Now copy would never be validated. | P2 / medium | Fixed. SW-SHOW_N renamed to SW-SHOW_INTERIOR; new SW-SHOW_LAST added. Show-wide states 5 → 6. R-band day-state walks 10+5=15 → 10+6=16. CHECK constraint enum + invocation enum updated. | §3.3.1 (table + total), §3.3.2 DDL CHECK enum, §3.3 step 5 invocation enum |
| F4 — Validation Supabase env vars incomplete and naming-drifted: `VALIDATION_SUPABASE_SERVICE_KEY` didn't match repo's `SUPABASE_SECRET_KEY` convention (`.env.local.example:5`); `VALIDATION_SUPABASE_PROJECT_REF` referenced by check-seed but not listed as required. | P2 / medium | Fixed. Three required env vars enumerated together: `VALIDATION_SUPABASE_URL` + `VALIDATION_SUPABASE_SECRET_KEY` (aligned to repo convention) + `VALIDATION_SUPABASE_PROJECT_REF`. All three mandatory; Phase 0 extends `.env.local.example` to document them. | §3.3 step 5 "Target selection" row |

**Class-sweep additions during R11 repair:**

- **`.env.local.example` extension noted** — Phase 0 sub-task must extend `.env.local.example` to document the three validation env vars. Future devs cloning the repo for M12 work see the required vars in the example file rather than discovering them in the spec.
- **Alias-resolution side-output** (§3.3 owned-fixture-mappings) — re-seed script outputs `validation-aliases.json` or stamps into validation_state. (R12 amendment: alternative retracted; DB-backed `alias_map` jsonb column is the single canonical mechanism.)

### 15.12 Round 12 (Codex `019e43f5-96b9-7de1-835c-72caaf6585c4`, 2026-05-19)

Verdict: `needs-attention`. Three findings (2 P1, 1 P2). All accepted and addressed.

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — `--combo all` invocation still said "10 R-combos + 5 show-wide fixtures" after R11 added SW-SHOW_LAST making it 6 show-wide; the last-show-day Strike-copy branch could be silently skipped during seed | P1 / high | Fixed. Default-behavior row updated: "all 16 combos: 10 R-combos + 6 show-wide states" with the 6 SW combo names listed inline. `check-seed --combo all` now requires all 16 combo names. | §3.3 step 5 "Default behavior" row |
| F2 — CHECK constraint idempotency used `DO $$ ... duplicate_object ... END $$` which masks enum-drift. If a future combo adds, apply-twice would silently leave the old constraint in place; new combo would fail INSERT or be silently absent | P1 / high | Fixed. CHECK constraint now uses `DROP CONSTRAINT IF EXISTS validation_state_combos_check` followed by `ADD CONSTRAINT ... CHECK (...)` inside a `DO $$ ... END $$` block. Always re-creates with the current enum list. Drift-safe. | §3.3.2 DDL block |
| F3 — Alias-map storage allowed EITHER `validation-aliases.json` OR a validation_state side-column, but no column existed in the schema. Plan implementer would either invent unreviewed DDL or have ambiguous file-vs-DB lifecycle semantics. | P2 / medium | Fixed. DB-backed mechanism committed: `alias_map jsonb NOT NULL DEFAULT '{}'::jsonb` column added to validation_state DDL with `ADD COLUMN IF NOT EXISTS` idempotency. `pnpm validation:resolve-alias <alias>` resolves UUIDs from the column. check-seed validates all 9 required alias keys per R-combo. File-based alternative explicitly retracted. | §3.3.2 DDL (new alias_map column), §3.3 J3/J4 paragraph (file-alt retracted), §3.3.2 check-seed (added alias_map validation) |

**Class-sweep additions during R12 repair:**

- **Enum-drift discipline** — the CHECK constraint pattern (`DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT`) is the canonical drift-safe pattern, distinct from the `duplicate_object` pattern used for table creation where the constraint definition doesn't change. Future admin-only tables with CHECK enums that may grow should use this drop-and-recreate pattern.
- **Single-mechanism rule for alias storage** — picking DB-backed over file-backed eliminates the "either-or" ambiguity that lets implementers diverge. This is a general principle: spec contracts should not offer choices that produce incompatible plan implementations.

### 15.13 Round 13 (Codex `019e43...` thread reused, 2026-05-19)

Verdict: `needs-attention`. Two P1 findings. All accepted and addressed.

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — Flat `alias_map` couldn't address per-combo crew fixtures. Each R-combo seeds 9 crew_members but a flat map `{alias_5a_lead: uuid, ...}` only has 9 keys total — `alias_5a_lead` for R1 would collide with `alias_5a_lead` for R7b. Either later seeds overwrote earlier, or implementer seeded only 9 total violating the per-combo contract. J3/J4 + role-restriction pairs could silently use wrong crew_ids. | P1 / high | Fixed. Alias map made **combo-scoped (nested)**: `{R1: {alias_5a_lead: uuid, ...}, R2: {...}, ..., SW-SHOW_LAST: {alias_5a_lead: uuid}}`. Total leaf entries: 10×9 + 6×1 = 96 aliases. `pnpm validation:resolve-alias <combo> <alias>` now takes a combo arg. check-seed validates: (a) all 10 R-combo keys present, (b) each R-combo has all 9 alias entries, (c) each SW-* key has `alias_5a_lead`. | §3.3 J3/J4 alias-map paragraph (nested shape), check-seed semantics |
| F2 — Atomic-checklist step 3 amended only master spec §4.3 bullet list, but live generator `scripts/generate-admin-tables.ts:31-34` filters §4.3 names to tables with matching `create table ...` blocks in master spec. Without adding `create table validation_state` to the master spec schema section, the regenerated `admin-tables.generated.ts` silently drops `validation_state` and X.3/X.6 parity fails. | P1 / high | Fixed. Step 3 now requires TWO master spec edits: (a) §4.3 bullet list (was already there), AND (b) master spec §4.1 schema section gains `create table validation_state` definition matching the §3.3.2 DDL minus the IF NOT EXISTS / DO blocks. Without (b) the generator can't pick up the new table even with §4.3 amended. | §3.3.2 step 3 (split into two edits) |

**Class-sweep additions during R13 repair:**

- **Generator-implementation cross-reference** — `scripts/generate-admin-tables.ts:31-34` was the source-of-truth verification. The spec's atomic checklist now matches the generator's actual contract, not just its stated purpose. Future admin-only table additions should verify against the live generator code, not the spec wording about how the generator works.

### 15.14 Round 14 (Codex 2026-05-19)

Verdict: `needs-attention`. Three P1 findings. All accepted and addressed.

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — Band F required report-pipeline failure outcomes (lookup-inconclusive, lease-expired, horizon-expired, orphaned-lost-lease) but provided no fault-injection harness for the prod-equivalent stack. These outcomes require GitHub API faults / lease-timing races that don't naturally occur during a walk. Plan could only validate happy-path + rate-limit. | P1 / high | Fixed. Band F row split: outcomes get dispositioned (a) INCLUDED-via-harness with new `scripts/validation-report-fixtures.ts` materializing each failure-state row directly via service role (UI rendering exercised without real GitHub fault), OR (b) EXCLUDED-rely-on-structural with cite to the structural test that pins the contract. Plan picks per-row. Default is harness-materialized. | §4.2 band F row (substantially rewritten) |
| F2 — `CREATE POLICY admin_only` was unconditional in the DDL. Apply-twice would fail with duplicate_object on the policy creation, despite the DDL block's comment claiming apply-twice safety. | P1 / high | Fixed. Added explicit `DROP POLICY IF EXISTS admin_only ON public.validation_state;` before `CREATE POLICY ...` (pattern verified in `supabase/migrations/` for re-applied policies). GRANT statements are inherently idempotent so no DROP guard added there. Migration-idempotency prose updated. | §3.3.2 DDL block, §3.3.2 idempotency row |
| F3 — J3 expired-link leg said "manually expire via admin tooling or wait for TTL" — but TTL is 90 days; waiting is impractical. No fixture contract for materializing pre-expired or revoked links. The expired-link surface and revoked-link surface would be unvalidated. | P1 / high | Fixed. New `pnpm validation:mint-link --combo <combo> --alias <alias> --expires-in <s>` command (negative s mints already-expired JWT) + `pnpm validation:revoke-link <link_session_id>` (sets revoked_at via service role). check-seed verifies at least one expired + one revoked link_session exists before J3 expired/revoked legs run. | §5.3 J3 (expired-link / revoked-link contract added) |

**Class-sweep additions during R14 repair:**

- **Apply-twice policy idempotency** — a general rule emerged: CREATE POLICY in the DDL must use the `DROP POLICY IF EXISTS + CREATE POLICY` pattern when the migration may be reapplied. Future admin-only table migrations should follow this pattern.
- **Fault-injection harness as a fixture pattern** — for outcomes that depend on transient/error states the live stack can't deterministically produce, the canonical approach is a service-role harness that materializes the failure-state row shape directly. This is a general pattern; `scripts/validation-report-fixtures.ts` is its first instance.

### 15.15 Round 15 (Codex 2026-05-19)

Verdict: `needs-attention`. Three P1 findings. All accepted and addressed.

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — Report fixture harness named `feedback_inbox` as a target table, but `feedback_inbox` is BACKLOG-only (per BL-PUSH-NOTIFICATIONS), not a v1 admin-only table. Harness would fail on INSERT or implementer would invent unreviewed table outside admin-only contract. | P1 / high | Fixed. Band F harness narrowed to target ONLY `reports` (the v1 admin-only table). Explicit note that future `feedback_inbox` extension is out of scope for M12 and would be handled by the milestone that adds the table. | §4.2 band F |
| F2 — DDL block still contained bare `CREATE POLICY admin_only ...` despite the R14 "amendment snippet" added later — implementers copying the primary block would hit duplicate_object on second apply. R14's fix lived in a separate snippet, leaving the primary block contradicted. | P1 / high | Fixed. Folded `DROP POLICY IF EXISTS admin_only ON public.validation_state;` directly into the primary DDL block immediately before `CREATE POLICY`. Removed the standalone R14 "amendment" snippet so there's ONE canonical migration body. Added "Migration idempotency at a glance" summary listing every apply-twice safe construct in the block. | §3.3.2 DDL block (folded), §3.3.2 idempotency summary added |
| F3 — `validation:mint-link` had no signing-key contract. Live signer uses `JWT_SIGNING_SECRET` + `app_settings.active_signing_key_id`. Without these in the validation tooling, locally-minted JWTs would not validate against the Vercel runtime — J3 expired/revoked legs would appear to work locally but silently fail during the walk. | P1 / high | Fixed. New "Signing-key contract for validation tooling" paragraph in §5.3 J3: required env var `VALIDATION_JWT_SIGNING_SECRET` (Phase 0 syncs from Vercel), active signing key id read from prod-equivalent Supabase at mint time. New Phase 0 smoke test 6: mint-redeem round-trip on real iPhone to prove the contract works end-to-end. Phase 0 closure incremented from 5 → 6 smoke tests. | §5.3 J3 (signing-key contract), §9.2 (smoke test 6 added; both "all five" wordings normalized to "all six") |

**Class-sweep additions during R15 repair:**

- **One-canonical-DDL-block rule** — separate "amendment snippets" after the main DDL block invite implementer drift. The R14 separate snippet was technically correct but easily missed; folding into the main block prevents this class. Future DDL amendments should rewrite the main block, not append.
- **Local-to-Vercel secret-sync acknowledgement** — `VALIDATION_JWT_SIGNING_SECRET` must equal Vercel's `JWT_SIGNING_SECRET`. Phase 0 sub-task explicitly: "dev copies the Vercel env var into local .env.local". Future validation-tooling commands signing or verifying against prod runtime should follow this sync pattern.

### 15.16 Round 16 (Codex `019e4406-1d4a-7033-b052-631acc0f2b96`, 2026-05-19)

Verdict: `needs-attention`. Five findings (3 P1, 2 P2). All accepted and addressed.

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — Smoke 6 mint-redeem assumed seed/alias_map already in place but Phase 0 closure didn't require `validation:reseed --combo R1` + `check-seed` before smoke 6 ran. Partial Phase 0 re-runs could fail smoke 6 from stale alias state, misdiagnosed as signing-key issue. | P1 / high | Fixed. Smoke 6 prerequisite explicit: dev MUST run `validation:reseed --combo R1` + `validation:check-seed --combo R1` immediately before minting. Failure-isolation procedure added (check-seed → env-var → re-mint). | §9.2 smoke 6 (R16-hardened) |
| F2 — `VALIDATION_JWT_SIGNING_SECRET` contract said "must equal the Vercel project's JWT_SIGNING_SECRET" without naming the environment scope. Vercel stores separate values per Production/Preview/Development; wrong-scope copy would silently fail the round-trip. | P1 / medium | Fixed. Contract explicit: "the Vercel **Production** environment scope" of the project backing the production deployment (not Preview or Development). `.env.local.example` documentation note added. | §5.3 signing-key contract |
| F3 — Mint-redeem smoke 6 used a 60-second TTL; J3 expired link used `-60`. Both make the gate flaky under local-vs-Vercel clock skew + human delay + QR/share friction. | P1 / medium | Fixed. Valid TTL widened from 60s → 900s (15 min); expired TTL from -60s → -3600s (1 hour past). Tolerance margin absorbs typical NTP drift + share-flow delay. | §9.2 smoke 6 (TTL = 900); §5.3 expired-link command (-3600) |
| F4 — `ADD COLUMN IF NOT EXISTS` for `alias_map` handled missing-column case only. If an early manual run created the column with wrong type/default/nullability, the migration silently left bad shape; later tooling assuming `jsonb NOT NULL DEFAULT '{}'::jsonb` would misbehave. | P2 / medium | Fixed. Drift repair added: `ALTER COLUMN alias_map SET DEFAULT '{}'::jsonb` + `SET NOT NULL` (both idempotent), AND a `DO $$ ... RAISE EXCEPTION IF data_type <> 'jsonb' END $$` block that fails loudly on type-drift with a clear "manual corrective migration required" message. | §3.3.2 DDL alias_map block |
| F5 — §12 self-review still said "5 show-wide states", "5 Phase 0 smoke tests", "five runtime smoke tests", and stale "duplicate_object" idempotency mention — all of which conflicted with the body's repaired state after R11/R12/R15. | P2 / low | Fixed. Sweep applied: CHECK row → "6 show-wide states", smoke-test count → 6, idempotency description → "DROP CONSTRAINT IF EXISTS + ADD" (drift-safe), build-vs-runtime row → "six runtime smoke tests". §3.3.2 CHECK row also updated. | §3.3.2 CHECK row, §12 CHECK/enum row, §12 build-vs-runtime row, §12 numeric self-check |

**Class-sweep additions during R16 repair:**

- **Smoke-test prerequisite explicitness** — when a smoke test depends on script-managed state, the prerequisite invocation MUST be in the smoke's own paragraph (not implied from earlier smokes). Phase 0 re-runs from a partial-failure state must be deterministic.
- **Drift-repair-not-just-IF-NOT-EXISTS** — when a DDL block needs to be apply-twice safe AGAINST EVOLVED STATE (not just "first apply vs re-apply with same schema"), the pattern is `ADD COLUMN IF NOT EXISTS` + explicit `ALTER COLUMN ... SET ...` for each invariant + fail-loud type check. The R12 `ADD COLUMN IF NOT EXISTS` alone wasn't enough.

### 15.17 Round 17 (Codex `019e440a-96ba-7c51-9be6-ad0a4cd40f4e`, 2026-05-19)

Verdict: `needs-attention`. Two P1 findings (down from 5 in R16 — convergence signal).

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — Validation tooling CLI contracts scattered across §3.3 / §5.3 / §9.2 with partial detail per command; plan implementer would have to reconstruct CLI args, env vars, exit codes from prose. `resolve-alias`, `report-fixtures`, `mint-link`, `revoke-link` lacked full man-page-style coverage. | P1 / high | Fixed. New §9.1.2 "Validation tooling reference" — single authoritative table with every command: script path, CLI args, required env vars, target DB, stdout contract, stderr/exit codes, idempotency. Other sections defer to §9.1.2 for command contracts. | New §9.1.2 |
| F2 — Smoke 6 TTL contradiction: §5.3 row line 493 still said `--expires-in 60` (60 seconds) while §9.2 smoke 6 (after R16 widening) said `--expires-in 900` (15 minutes). Plan implementer following §5.3 alone would reintroduce the exact flaky 60-second smoke R16 fixed. | P1 / medium | Fixed. §5.3 row 493 updated to `--expires-in 900` matching §9.2 + an explicit "§9.2 is the canonical source" pointer to prevent future TTL drift between sections. | §5.3 signing-key contract Phase 0 smoke row |

**Class-sweep additions during R17 repair:**

- **Single-source-of-truth pattern for repeated values** — TTL values (and similar magic numbers like cooldown duration, smoke test count, etc.) that appear in multiple sections should be specified ONCE with other sections pointing back. This prevents the R16-R17 drift where a value was updated in one section but missed in another.
- **CLI tooling deserves a man-page section** — scattered command details across journey/contract sections invite drift and reconstruction work. §9.1.2 sets the pattern for future M12 tooling additions.

### 15.18 Round 18 (Codex 2026-05-19)

Verdict: `needs-attention`. Three findings (2 P1, 1 P2). All accepted and addressed.

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — Smoke 6's `validation:reseed --combo R1` prerequisite could be destructive: §9.1.2 didn't specify whether single-combo reseed PRESERVES or REPLACES other combos. A destructive implementation could pass Phase 0 with only R1 materialized; Phase 1 starts with R2-R8b/SW missing. | P1 / high | Fixed. §9.1.2 reseed-row idempotency contract clarified: **`--combo <single>` is UPSERT-ONLY** (touches only the target combo and its alias_map entries; other combos preserved). `--combo all` is full-replace. §3.3 idempotency row also updated. | §9.1.2 reseed-row idempotency col, §3.3 idempotency row |
| F2 — J3 revoked-link path was unexecutable from the §9.1.2 CLI: mint-link emitted only bare URL but revoke-link required positional `link_session_id` UUID with no documented way to extract id from URL/JWT. §5.3 commands also omitted `--expires-in` (required per §9.1.2). | P1 / high | Fixed. mint-link stdout now structured JSON: `{"link_session_id", "url", "expires_at"}`. revoke-link accepts either UUID or full URL (parses JWT/jti claim). §5.3 commands updated to include `--expires-in 900` (valid baseline) and use the JSON-piped mint flow (`URL=$(... | jq -r .url); validation:revoke-link "$URL"`). | §9.1.2 mint-link/revoke-link rows, §5.3 J3 commands table |
| F3 — §3.4.1 11-pair table had a "what this catches" column but no "Expected outcome" column, unlike §3.3 R-combos. A dev could complete the walk while accepting wrong role/restriction composition because expected state was implicit. | P2 / medium | Fixed. Added explicit "Expected outcome" column to all 11 pairs naming the required Right Now state/copy, scope-tile visibility per pair, pack-list visibility, and financials visibility. | §3.4.1 pair table (added column) |

**Class-sweep additions during R18 repair:**

- **UPSERT-vs-REPLACE semantics must be explicit for partial-args** — any CLI flag that takes a subset selector (`--combo R1`) must specify whether it preserves or replaces the unselected state. Implicit destructive-replace is a footgun.
- **Structured stdout for downstream consumption** — when one CLI command's output feeds another (mint → revoke), the output should be structured (JSON), not bare. Future validation tooling chains follow this pattern.

### 15.19 Round 19 (Codex 2026-05-19)

Verdict: `needs-attention`. Two P1 findings — both critical factual errors against live code.

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — §3.4.1 expected outcomes for pairs 4–6 incorrectly claimed dateRestriction suppressed scope tiles (A1/V1/L1). Live code: `audioScopeVisible(viewerFlags)`, `videoScopeVisible(viewerFlags)` in `lib/visibility/scopeTiles.ts` are role-only; dateRestriction only feeds Right Now + Schedule. Pack-list is gated by `stageRestriction` + current phase (set/strike/travel-out day per master spec line 2395), NOT dateRestriction. M12 would have flagged correct product behavior as a UX failure. | P1 / high | Fixed. Pairs 4–7 rewritten: scope tiles stay VISIBLE in off-day / unconfirmed / pre-show cases (role-only); only Right Now copy changes per dateRestriction. Pack-list visibility follows stageRestriction + day-phase, not dateRestriction. Pair 7 clarifies BO has no scope tile because of role, not post-show. | §3.4.1 pairs 4–7 |
| F2 — §9.1.2 mint-link / revoke-link contract depended on nonexistent JWT/schema fields. R18 said mint-link emits `link_session_id` and revoke-link extracts JWT `jti` claim then UPDATEs `link_sessions.revoked_at`. Live: `lib/auth/jwt.ts` `signLinkJwt()` sets no jti; `link_sessions` PK is `token text` with no `id` or `revoked_at` column; revocation goes through `revoked_links (show_id, crew_name, token_version, revoked_at)` INSERT. M12's revoked-link leg was structurally unimplementable. | P1 / high | Fixed. mint-link JSON output now: `{token, url, expires_at, show_id, crew_name, jwt_token_version}` — the keys revoke-link needs. revoke-link parses URL → fragment token → `link_sessions WHERE token=$token` lookup → `(show_id, crew_name, jwt_token_version)` → INSERT into `revoked_links` (PK `(show_id, crew_name, token_version)`). Does NOT touch link_sessions (no revoked_at column there). | §9.1.2 mint-link + revoke-link rows, §5.3 revoked-link command |

**Class-sweep additions during R19 repair:**

- **Live-code factual verification per round** — R18's expected-outcome column referenced "date filter overrides scope tiles" without verifying against `lib/visibility/scopeTiles.ts`. R19 caught it because Codex grepped the live code. Future rounds adding factual claims about runtime behavior MUST grep the live code to verify. Same for R18's JWT claims and R10's RLS DDL.
- **Schema-derived API contracts** — `link_sessions` PK is `token`, `revoked_links` PK is composite tuple — these are load-bearing for the revocation contract. The validation tooling must match the live schema's column layout, not invented columns. Live migrations are the source of truth.

### 15.20 Round 20 (Codex 2026-05-19)

Verdict: `needs-attention`. Three findings (2 P1, 1 P2). All critical factual fixes.

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — §9.1.2 mint/revoke-link still confused JWTs with link_sessions tokens. R19 said mint-link INSERTs link_sessions and emits its token PK; revoke-link looks up link_sessions by JWT. Live flow (verified in `app/api/auth/redeem-link/route.ts:344-351`): redemption verifies JWT → mints fresh `randomUUID()` opaque session token → `mint_link_session_if_active_kid_matches` INSERTs link_sessions. JWT ≠ link_sessions.token; no session row exists before redemption. R19's contract was unimplementable. | P1 / high | Fixed. mint-link calls `signLinkJwt()` directly with NO link_sessions INSERT. Emits JSON with JWT payload fields: `{url, expires_at, show_id, crew_name, jwt_token_version, signing_kid}`. revoke-link verifies + decodes the JWT to obtain the payload, INSERTs into revoked_links directly. The dev's revoke command operates BEFORE any redemption — no link_sessions row exists yet. | §9.1.2 mint-link + revoke-link rows |
| F2 — §3.4.1 pair table's pure-LEAD pairs (1, 3, 11) said Audio/Video/Lighting scope tiles HIDDEN. Live `lib/visibility/scopeTiles.ts`: each predicate checks `flags.includes('LEAD')` — LEAD unlocks ALL three scope tiles. `tests/visibility/scopeTiles.test.ts` pins this. M12 would have flagged correct LEAD UI as a defect. | P1 / high | Fixed. Pairs 1, 2, 3, 11 expected outcomes updated: LEAD unlocks Audio + Video + Lighting scope tiles unconditionally; the variant just confirms LEAD's blanket scope visibility (compound flags like LEAD+A1, BO+LEAD are redundant for scope-tile visibility purposes). | §3.4.1 pairs 1, 2, 3, 11 |
| F3 — §9.1.2 report-fixtures `--outcome` enum was missing `lease-expired`, but §4.1.1 + R14 audit trail required it as a matrix row. Plan implementer using the man-page CLI could not materialize lease-expired and would silently miss the row. | P2 / medium | Fixed. Added `lease-expired` to the `--outcome` enum. Either harness materializes it via service-role INSERT, or matrix-inventory dispositions it EXCLUDED-rely-on-structural per §4.2 band F. | §9.1.2 report-fixtures row |

**Class-sweep additions during R20 repair:**

- **Two-token architecture for signed-links** — the codebase uses two distinct tokens: the JWT (signed by mint-link, carried in URL fragment) and the opaque session token (minted by redemption with `randomUUID()`, stored as `link_sessions.token` PK). Validation tooling that operates BEFORE redemption (e.g., revoke before the dev clicks the link) cannot reference link_sessions.token. The contract uses JWT payload fields throughout.
- **LEAD scope-tile invariant** — LEAD unlocks ALL three scope tiles. Future role-related specs MUST acknowledge this. Don't say "LEAD with no A1 hides audio" — LEAD overrides A1's role-gating.

### 15.21 Round 21 (Codex 2026-05-19)

Verdict: `needs-attention`. Three P1 findings. All accepted and addressed.

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — §5.3 still had stale references to link_sessions for mint/revoke/check-seed despite R20 correcting §9.1.2 to JWT-only contract. "mint-link materializes pre-expired link sessions" and "check-seed verifies expired/revoked link_session rows" contradicted the two-token architecture. Implementer following §5.3 could not create the revoked-link fixture; J3 could miss negative-auth surfaces. | P1 / high | Fixed. §5.3 "Expired-link fixture contract" rewrites to align with two-token architecture: mint-link emits a JWT (not a link_sessions row); revoked_links INSERT is the durable artifact. check-seed validates FIXTURE prerequisites (crew_members, crew_member_auth, alias_map) — not pre-existing link_sessions. | §5.3 expired-link fixture + "mint-link/revoke-link plan-time deliverable" paragraph |
| F2 — mint-link specified `VALIDATION_JWT_SIGNING_SECRET` as the required env var AND said it "calls signLinkJwt directly", but live `lib/auth/jwt.ts:42` `getSigningSecret()` reads `process.env.JWT_SIGNING_SECRET`. As written: smoke 6 either fails despite VALIDATION_JWT_SIGNING_SECRET being present, OR signs with a stale local JWT_SIGNING_SECRET giving false Production-secret diagnosis. | P1 / high | Fixed. §5.3 env-var row adds explicit implementation contract: validation-mint-link.ts MUST either (a) at process start, assert process.env.JWT_SIGNING_SECRET is undefined or equals VALIDATION_JWT_SIGNING_SECRET then set it for the process; OR (b) spawn signLinkJwt in a child process with env mapping. Mismatched secrets abort. Phase 0 sub-test exercises this env mapping. | §5.3 signing-key contract env-var row |
| F3 — Re-seed's owned-fixture mapping required crew_members but NOT crew_member_auth rows. Live redemption rejects with `LINK_VERSION_MISMATCH` if `crew_member_auth` is missing or mismatch. check-seed could pass with no auth row; first mint/redeem fails. Inter-command dependency not captured. | P1 / high | Fixed. New paragraph in §3.3 owned-fixture-mapping row: re-seed UPSERTs `crew_member_auth` for every seeded crew_member (9 per R-combo, 1 per SW). Initial `current_token_version = 1`; UPSERT preserves if already set (so revoke-link's version bump survives re-seed). Per-show advisory lock per project invariant 2. check-seed gains predicates (f) auth row present per alias and (g) current_token_version non-null. | §3.3 owned-fixture-mappings row (new crew_member_auth paragraph) |

**Class-sweep additions during R21 repair:**

- **Inter-table FK contracts must be in the seed contract** — crew_member_auth is keyed by (show_id, crew_name), not by crew_members.id. The seed contract must enumerate ALL tables touched by the live runtime path, not just the obvious ones. Future fixture additions: trace every read path of the surface being validated and enumerate every table the path touches.
- **Env-var indirection for direct-call wrappers** — when a CLI calls a runtime function (signLinkJwt) that reads process.env directly, the env-var mapping must be specified explicitly (not implicit). Same applies to any other process.env reads in lib/.

### 15.22 Round 22 (Codex 2026-05-19)

Verdict: `needs-attention`. Three P1 findings. All accepted and addressed.

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — mint-link only mapped `JWT_SIGNING_SECRET` from VALIDATION_, but signLinkJwt's `active_signing_key_id` lookup goes through `createSupabaseServiceRoleClient()` which reads `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (not VALIDATION_). So the CLI could sign with Production JWT secret but read kid from local Supabase, producing a JWT with stale/wrong kid that smoke 6 would fail unhelpfully. | P1 / high | Fixed. §5.3 env-var row updated to require ALL THREE env vars mapped (JWT_SIGNING_SECRET + SUPABASE_URL + SUPABASE_SECRET_KEY) from their VALIDATION_ variants in the signing process. Phase 0 sub-test intentionally diverges SUPABASE_URL and confirms abort. | §5.3 env-var row (now requires 3 mappings) |
| F2 — §5.3 revoked-link command still said "revoke-link parses the `#t=<token>` fragment to look up `link_sessions.token`" — exact opposite of R20's two-token correction. mint-link's "token / jwt_token_version fields" output language also stale. Implementer following §5.3 builds an unexecutable fixture. | P1 / high | Fixed. §5.3 revoked-link command parenthetical rewritten to match R20 §9.1.2 contract: verify + decode JWT directly, INSERT revoked_links from payload. No link_sessions.token references; no `token` JSON field. | §5.3 revoked-link command row |
| F3 — Revoked-link surgical revocation poisoned the baseline control: both J3 commands used alias_5a_lead's same token_version 1. revoke INSERTs revoked_links (R1.show_id, "alias_5a_lead", 1, ...) → subsequent baseline mint of same alias produces JWT with token_version 1 → redemption denied because revoked_links matches. Control fails on second run. | P1 / high | Fixed. New dedicated alias `alias_5a_lead_for_revoke` (separate LEAD identity for the revoke leg). Seed contract bumped from 9 → 10 crew_members per R-combo (+ the dedicated revoke alias). revoke-link tags `revoked_reason = 'validation:j3-revoked-link-leg'`. Re-seed DELETEs `revoked_links WHERE revoked_reason LIKE 'validation:%'` so baseline stays clean across re-runs. check-seed gains predicate (h) — fails if baseline alias has matching validation-tagged revoked_links row. | §5.3 revoked + baseline rows, §3.3 owned-fixture-mappings (10 not 9; cleanup), §3.3.2 check-seed predicates |

**Class-sweep additions during R22 repair:**

- **Process-env indirection covers ALL transitively-read vars** — not just the obvious primary one. signLinkJwt reads JWT_SIGNING_SECRET; its caller (createSupabaseServiceRoleClient) reads SUPABASE_URL + SUPABASE_SECRET_KEY. CLI tooling that wraps direct-call lib functions must map every transitive process.env read. Future tooling: trace the full read graph.
- **Surgical revocation has fixture-isolation implications** — the live revoked_links contract is keyed by (show_id, crew_name, token_version). Any fixture that uses the same key tuple as a tested-revocation will be permanently denied. Separate aliases (or version bumps) are required when the SAME test step both revokes AND tests positive behavior.
- **Validation-tagged cleanup pattern** — `revoked_reason = 'validation:%'` lets re-seed selectively clean only validation-induced state without affecting other rows. Future validation-tooling INSERTs should follow this tagging convention.

### 15.23 Round 23 (Codex 2026-05-19)

Verdict: `needs-attention`. Three findings (2 P1, 1 P2). All accepted and addressed.

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — R22 added `alias_5a_lead_for_revoke` to §5.3 but didn't promote it into the §3.3 seed contract or §3.3.2 check-seed. mint-link would fail unresolvable for the dedicated alias. | P1 / high | Fixed. Seed contract bumped from 10→11 crew_members per R-combo (9 role variants + revoke-test + query-compromise-test aliases). alias_map leaf count 96→116. Crew_member_auth row count per R-combo: 9→11. check-seed predicates updated. | §3.3 crew-member contract paragraph, §3.3 alias_map total, §3.3 crew_member_auth lockstep |
| F2 — Query-token compromise leg (J3) inserts `revoked_links` rows tagged `revoked_reason = 'leaked_query_token'` AND raises `revoked_below_version` on `crew_member_auth`. R22's validation-tagged cleanup wouldn't catch this; the baseline alias would be permanently poisoned across re-seeds. | P1 / high | Fixed. New dedicated `alias_5a_lead_for_query_compromise` alias (R23 — 11th per R-combo). Re-seed STRUCTURALLY resets this alias's state: DELETEs ALL revoked_links matching its (show_id, crew_name) regardless of reason, AND bumps current_token_version + zeros revoked_below_version. This alias is the ONLY one subject to structural reset — others stay protected. | §3.3 crew-member contract, §3.3 cleanup contract (new R23 paragraph) |
| F3 — Phase 0 had ballooned to a multi-week implementation project (6 CLIs + migration + master spec amendments + test updates) without ordering or budget gate. The 3-8 week milestone budget could be consumed entirely by Phase 0 with no Phase 1 walk. | P2 / medium | Fixed. New §9.0 specifies canonical Phase 0 task order (0.A–0.F, 3.5-6.5 days total), a 10-calendar-day budget gate, and three documented options if the gate trips: defer report-fixtures harness / split Phase 0 into M12a tooling milestone / re-scope walk coverage. Decision recorded in SIGN-OFF.md appendix. | New §9.0 |

**Class-sweep additions during R23 repair:**

- **Multi-test-leg fixture isolation requires N aliases per test, not just N+1** — when a test step writes durable state (revoked_links, raised revoked_below_version), the alias for that step must be unique to that step AND have a cleanup contract specific to its mutation. R22's revoke + R23's query-compromise are TWO separate negative-auth surfaces, each needing its own alias.
- **Phase 0 sizing discipline** — when tooling deliverables accumulate during spec rounds, the spec must explicitly say what's negotiable. Without §9.0's "defer / split / re-scope" decision matrix, the dev would have no way to recover from a Phase 0 overrun without ad-hoc judgement.

### 15.24 Round 24 (Codex 2026-05-19)

Verdict: `needs-attention`. Three findings (2 P1, 1 P2).

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — alias_map JSON example + check-seed still said "9 aliases per R-combo, 96 leaves total" after R23 added two J3-isolation aliases bringing the count to 11/116. Implementer following the JSON example could omit the J3 aliases while check-seed passed; J3 legs unresolvable. | P1 / high | Fixed. JSON example expanded to show 11 keys per R-combo with explicit comments marking the two R22/R23 J3-isolation entries. Leaf-count corrected from 96 to 116. check-seed predicate (b) updated from "9 alias entries" to "11 alias entries". | §3.3 alias-map storage paragraph (JSON + count + check-seed) |
| F2 — §3.3 R-combo table R3 still said "pack-list NOT visible (date filter overrides)" — same factual error R19 caught in §3.4.1 pair 4. dateRestriction affects only Right Now + Schedule per `lib/visibility/scopeTiles.ts`; pack-list is stage/phase gated per master spec line 2395. | P1 / high | Fixed. R3 expected outcome rewritten: pack-list VISIBLE on set day with stage_restriction=none; date restriction does not hide pack-list. Cross-reference to live code + master spec line. | §3.3 R-combo table R3 row |
| F3 — Phase 0 task 0.E (validation-report-fixtures) was labeled "Not strictly blocking smoke tests 1-6", but band F defaults to INCLUDED-via-harness — needing the harness. Phase 0 could close on 6 smokes WITHOUT the harness, then Phase 1 would have band F's deep report outcomes unwalkable. | P2 / medium | Fixed. 0.E now BLOCKING by default. To unblock, dev MUST commit MATRIX-INVENTORY.md with every deep-outcome row dispositioned EXCLUDED-rely-on-structural + cite each pinning structural test. New Phase 0 smoke test 7: run `validation:report-fixtures --outcome lookup-inconclusive` and verify UI renders. Smoke 7 is skipped if EXCLUDED path is taken. | §9.0 task 0.E row |

**Class-sweep additions during R24 repair:**

- **Alias-map JSON synced with crew-member contract** — JSON examples MUST be updated whenever the seed contract count changes. R24 caught this because R22/R23 updated the crew-member count but the JSON example stayed at 9.
- **§3.3 R-combo table cross-checked against §3.4.1 pair table** — both tables describe the same restriction-behavior contracts; they must stay in sync. R3's pack-list was correct in §3.4.1 (R19 fix) but stale in §3.3 (R-combos table). Future spec edits to one MUST sweep the other.
- **Default-INCLUDED-with-harness implies blocking** — Phase 0 task ordering for tooling tasks must align with the Band's default. Band F default = INCLUDED-via-harness ⇒ harness must exist before Phase 1.

### 15.25 Round 25 (Codex 2026-05-19) — FINAL ROUND per user authorization

Verdict: `needs-attention`. Three findings (2 P1, 1 P2). All accepted and addressed. Per the user's R0 prompt ("up to 25 rounds of adversarial review for the spec if no approval received by then; afterwards skip the user spec review and move right to writing the plan"), this is the LAST adversarial pass on the spec; remaining findings closed here.

| Finding | Severity | Disposition | Section(s) modified |
|---|---|---|---|
| F1 — §9.2 Phase 0 closure still said "all six smoke tests" but R24 added smoke 7 (conditional on Band F harness disposition). Implementer following §9.2 could close Phase 0 without smoke 7, leaving Band F deep outcomes unwalkable. | P1 / high | Fixed. §9.2 closure rewritten as conditional gate: "smokes 1–6 always required, PLUS smoke 7 when Band F deep outcomes default to INCLUDED-via-harness" (skipped only with full EXCLUDED-rely-on-structural pre-disposition). §9.0 task 0.F updated to match. Smoke 7's body added to §9.2 numbered list. | §9.2 closure paragraph + new smoke 7 body, §9.0 task 0.F |
| F2 — §3.3.2 singleton write semantics predicate (e) still said "alias_map missing any of the 9 required alias keys" — stale after R22/R23/R24's 11/116 update. Implementer following §3.3.2's check-seed predicates (rather than §3.3's canonical alias-map storage section) would seed only 9 aliases, breaking J3 legs. | P1 / high | Fixed. Predicate (e) rewritten to defer to §3.3's canonical alias-map storage contract (11 per R-combo × 10 + 1 per SW-state × 6 = 116 total leaves). Cross-references §3.3 explicitly to prevent future count drift. | §3.3.2 singleton write semantics predicate (e) |
| F3 — §9.0 budget-gate options 2/3 (split Phase 0 / re-scope walk) said the dev "MUST stop and decide" — language implied unilateral authority. Splitting milestones changes the authorized milestone shape; re-scoping weakens the load-bearing validation gate. Both require user/orchestrator approval, not dev unilateral decision. | P2 / medium | Fixed. Each option now carries an explicit "Authorization level" tag: option 1 = dev-unilateral (structurally constrained by MATRIX-INVENTORY); options 2 + 3 = REQUIRES user/orchestrator approval before the dev proceeds. SIGN-OFF.md appendix records the approved decision (audit trail), not authorizes it (authorization happens upstream). | §9.0 budget gate paragraph |

**Spec status post-R25.** The spec has gone through 25 rounds of cross-CLI adversarial review per the user's R0 authorization. Codex did not return APPROVE on round 25, but per the user's authorization the spec proceeds to plan-writing regardless of verdict. The remaining R25 findings have been patched in this commit. The plan-writing milestone (M12 plan + its own up-to-40-round adversarial review) starts next.

**Class-sweep additions during R25 repair:**

- **Conditional smoke-test gate must be in the closure paragraph, not just the task table** — §9.0 0.F was correct; §9.2 closure was stale. Closure paragraphs are what plan-writers read for the gate definition; task tables are what plan-writers read for sequencing. Both must reflect the same contract.
- **Predicate (e) in §3.3.2 must defer to canonical section** — when a predicate's numeric value can change in another section (here §3.3's 9→11→11/116), the predicate should cross-reference rather than restate the value. Cross-reference prevents future stale-count drift.
- **Authorization levels for governance-affecting options** — when a "the dev decides" instruction would change the milestone's authorized shape, the spec must distinguish dev-unilateral options from user-approval-required options. SIGN-OFF.md is the audit trail, not the authorization mechanism.

### 15.26 Amendment R0 (M11.5 picker-pivot rebase — 2026-05-26)

**Posture.** This is a structural amendment, not a review round. It rebases the spec (drafted 2026-05-19 against the pre-M11.5 per-crew signed-link auth model) onto the picker-pivot world ratified at the M11.5 close-out (`b4b2c38`, 2026-05-25). The amendment session was authored by an Opus 4.7 implementer per the orchestrator's scope ratification, with the user's `(d)` decision on J3 baked in. The full milestone handoff lives at [`docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/handoffs/M12-solo-dev-ux-validation.md`](../plans/2026-04-30-fxav-crew-pages-design/handoffs/M12-solo-dev-ux-validation.md) (project convention: single milestone handoff in the master plan's handoffs dir, mirroring `M11.5-crew-auth-pivot.md`; round-by-round audit lives inline in that doc's Convergence log). Post-amendment, the spec proceeds to fresh cross-CLI adversarial review at R6 (= amendment R1); the R1–R25 rounds in §15.1–§15.25 are pre-rebase audit trail and remain readable as historical context.

**Authoritative rebase source.** [`M11.5-delta-for-m12.md`](../plans/2026-04-30-fxav-crew-pages-design/handoffs/M11.5-delta-for-m12.md) — six sections (changed contracts / retired routes / new admin surfaces / new env vars / new structural meta-tests / inherited do-not-relitigate). The M11.5 close-out's 11 do-not-relitigate dispositions (delta §6) are inherited verbatim by this amendment and any subsequent review round.

**Sections rewritten in the rebase.** §4.2 surface bands B + C (picker render arms replace signed-link redemption + query-token compromise rows); §5.3 J3 (three-leg picker walk: share-token rotation, picker-epoch reset, OAuth-claim — per user's option `(d)` decision); §3.3 owned-fixture mappings (drop `crew_member_auth` UPSERT + revoke/query-compromise aliases; add picker-fixture setup via `auth_email_canonical` + automatic `show_share_tokens.share_token` creation trigger); §9.1.2 validation-tooling reference (drop mint-link + revoke-link rows; keep reseed / check-seed / resolve-alias / report-fixtures; Phase 0.D deleted per user decision — the admin UI's `CurrentShareLinkPanel` + `RotateShareTokenButton` + `ResetPickerEpochButton` is the canonical interface and CLI parity adds no value); §3.3.2 atomic master-spec amendment (count delta and footnote per the (α + footnote hybrid) decision below); §15.26 (this section).

**Master-spec amendment decision (α + footnote hybrid; user-ratified 2026-05-26).** Three options were on the table during amendment kickoff:
- **(α)** Naïve bump 21→22 in §4.3 prose / 84→88 in AC-2.5, leaving the 4 M9.5 tables still listed in the master spec body (matches M11.5's deliberate supersession-by-picker-spec posture).
- **(β)** Honest count with lockstep cleanup — drop the 4 M9.5 tables from master §4.3 + §4.1 + AC-2.5; final count 17 → 18; rebases master spec onto M11.5 reality.
- **(γ)** Document-as-stale — leave master count at 21; surface drift via a footnote.

User selected **(α) + a footnote per (γ)** — bump 21→22 + add `validation_state` alphabetically + add a footnote at §4.3 bottom explicitly documenting that the live `ADMIN_TABLES.length = 18 = (22 listed) − 4 dropped by the M11.5 picker pivot` filtered structurally by `scripts/generate-admin-tables.ts`. Master-spec body cleanup is deferred per project memory `project_post_m11_deployment_path` ("locked deployment path") — M11.5's supersession-by-picker-spec posture is ratified and M12 does not relitigate it. The AC-2.5 amendment (84 → 88) carries a one-line cross-reference back to the §4.3 footnote so the count math is auditable for future reviewers.

**Tooling Phase 0.D decision (β — delete).** Phase 0.D (validation CLI tooling for signed-link mint/revoke/print-share-url) is deleted entirely. The M11.5 admin UI is the canonical share-link interface; the dev IS the admin for every walk session; CLI parity for a one-time share-URL read is pure parallelism, not value-add. Phase files renumbered: old `05` → new `04`; old `06` → new `05`; old `07` → new `06`; old `08` → new `07`. Plan-wide invariant 7 (three-env-var mapping for signing) deleted with no replacement — picker env vars (`HASH_FOR_LOG_PEPPER`, `PICKER_COOKIE_SIGNING_KEY`) are runtime-only on the deployed stack; no validation CLI consumes them.

**Carry-overs folded into amendment scope.** Three M11.5 close-out deferral entries (`M11.5-IMP-1` reassurance-footer catalog code; `M11.5-IMP-2` picker-show-strip with resolver shape extension; `M11.5-IMP-4` DESIGN.md §1.2 contrast amendments for picker color pairs) are folded into the M12 plan tree as Phase 0.A.1 / Phase 0.A.2 / Phase 0.A.3 sub-tasks per dispatch brief §3.C. The DEFERRED.md entries are marked "Resolved at M12 amendment SHA `<hash>`" in the amendment's final commit. The other two M11.5 deferrals (`M11.5-IMP-3` `/me` TerminalFailure dedup; `M11.5-IMP-5` admin Reset/Rotate UX polish) stay in DEFERRED.md with their existing triggers — they will surface naturally during Phase 1 walks if M12 touches the relevant surfaces.

**Stale-citation corrections during M11.5 rebase.** Per dispatch brief Q3 + user direction (silent rewrite where the live path exists; drop where it doesn't):

- Master-spec line citations refreshed: §4.3 prose `line 605` → **`line 610`** (+5 drift since 2026-05-19 draft); AC-2.5 `line 3489` → **`line 3536`** (+47 drift).
- `tests/db/rls.test.ts` references: the file does not exist (probably pre-pivot). Every M12 cite is rewritten to point at `tests/db/admin-rls-runtime.test.ts` (the only live equivalent) which carries the count assertion at line 112 (`expect(CLASS_A_TABLES).toHaveLength(17)` — to become `18` post-amendment).
- `tests/cross-cutting/auth.test.ts` references: the file does not exist either (and no `ADMIN_TABLES` literal-list assertion exists in any current test). The M12 plan tasks pointing at it are dropped, not rewritten — per Q3 "if it doesn't exist, drop the task; don't invent a citation." `ADMIN_TABLES` is consumed structurally via the generated `lib/audit/admin-tables.generated.ts` import; no per-element literal expectation needs maintenance.
- `tests/db/admin-rls-runtime.test.ts` count-reference inventory: the M12 plan claimed "7 references on lines 4 / 9 / 21 / 111 / 112 / 213 / 218." Live state has **4 references** (at lines 4, 21, 111, 112) carrying the literal `17`. Lines 9 / 213 / 218 hold unrelated text. The plan's sed-recipe is rewritten to the 4 live refs.
- Class-sweep on amendment vocabulary: pre-amendment baseline 187 hits across 12 files (71 in spec). Post-amendment residual: see the milestone handoff's Convergence log (R6 row). Acceptable residuals: (a) §15.x audit-trail entries that name the retired vocabulary as part of historical findings (e.g., §15.21–§15.25's references to `alias_5a_lead_for_revoke`, `signLinkJwt`, `revoked_links` in the round-N findings tables are historical record); (b) the §3.3 owned-fixture-mapping "Pre-M11.5 historical note" paragraph that explains the rebase; (c) the §3 persona-inventory rebase note; (d) plan-tree rebase-note paragraphs in `00-overview.md`'s disagreement-loop preempt table (RETIRED rows), `01-phase0-infra.md`'s env-var contract note, `02-phase0-validation-state.md`'s rebase-corrections table, `04-phase0-tooling-report.md`'s validation-tag cleanup analogy. `03-phase0-tooling-reseed.md` was inline-rewritten in commit 13 (residual hits 29 → 0); `04-phase0-tooling-link.md` was deleted entirely (Phase 0.D deletion). R6 surfaced two HIGH live-operational-prose hits the initial class-sweep missed (§9.2 smokes 2/5/6 + J1/J2 prose); R7 repair pending.

**Why this is an amendment and not a 26th review round.** Per user R0 authorization carried forward from §15.25 (and the milestone handoff's §4 do-not-relitigate item 23), the spec proceeded to plan-writing after R25 without formal APPROVE. The 26th adversarial round was structurally not the convergence path — the picker pivot ratified between R25 (2026-05-19) and M11.5 close-out (2026-05-25) changed the rebase target. The amendment is the resolution; review resumes at R6 (= post-rebase R1) against the rebased spec + plan. R6 audit lives inline in the milestone handoff's Convergence log.
