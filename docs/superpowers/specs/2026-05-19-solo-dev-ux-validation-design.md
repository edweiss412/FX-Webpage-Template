# FXAV Solo-Dev UX Validation — Design Spec

**Spec date:** 2026-05-19
**Working title:** Milestone 12 — Solo-dev UX validation
**Status:** Draft (pending user review, then adversarial review)
**Milestone dependency:** M12 starts only after **M11** (user-facing docs at `/help`) closes. `/help` is load-bearing on the validation track (see §10).
**Sibling specs:**
- Master crew-pages spec: [`docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md`](./2026-04-30-fxav-crew-pages-design.md)
- M11 user-facing docs: [`docs/superpowers/specs/2026-05-12-user-facing-docs-design.md`](./2026-05-12-user-facing-docs-design.md)

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

| Combo | date_restriction | stage_restriction | Day-of-walk |
|---|---|---|---|
| R1 | `none` | `none` | Set day |
| R2 | `explicit` (today included) | `none` | Set day |
| R3 | `explicit` (today excluded) | `none` | Set day → expect `viewer_off_day` |
| R4 | `unknown_asterisk` | `none` | Any day → expect `viewer_unconfirmed` |
| R5 | `explicit` (today before first assigned day) | `none` | Pre-show day → expect `viewer_off_day_pre` |
| R6 | `explicit` (today after last assigned day) | `none` | Post-show day → expect `viewer_after_last_day` |
| R7 | `none` | `explicit ["Load In","Set"]` | Set day vs strike day | (set-day pack-list visible; strike-day pack-list hidden) |
| R8 | `none` | `explicit ["Load Out","Strike"]` | Strike day | (pack-list visible only on strike) |

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
| Invocation | `pnpm validation:reseed [--combo <R1\|R2\|R3\|R4\|R5\|R6\|R7\|R8\|SW-PRE_TRAVEL\|SW-TRAVEL_IN\|SW-SHOW_1\|SW-SHOW_N\|SW-POST_SHOW\|all>]` |
| Default behavior | `--combo all` — materializes all 8 R-combos + 5 show-wide states' fixtures with date columns aligned to today's local date |
| Idempotency | Re-running with the same args on the same day is a no-op. Re-running with a different date updates every fixture's date columns. |
| Storage of `validation_seed_date` stamp | New table `validation_state` (single row): `last_seed_date DATE NOT NULL, combos_materialized TEXT[] NOT NULL, seeded_by TEXT NOT NULL`. The script writes to this table at the end of a successful seed. |
| Verification command | `pnpm validation:check-seed` returns exit 0 if `last_seed_date = today` AND `combos_materialized` covers what the next walk needs; returns exit 1 otherwise. The dev runs this at the start of every walk session per §3.3 step 5 above. |
| Owned fixture mappings | One fixture per R-combo + one fixture per show-wide state, materialized in the prod Supabase. The script holds the canonical mapping table inline (R-combo or state → `{showName, date_restriction, stage_restriction, dates.travelIn, dates.travelOut, expected_today_state}`). |
| Plan-time deliverable | The M12 plan's Phase 0 includes a sub-task that authors `scripts/validation-reseed.ts` + the `validation_state` migration BEFORE any matrix walk. Phase 0 smoke test 5 verifies the script's correctness end-to-end. |

This contract closes the Codex R5 F1 finding: re-seed mechanism is no longer hand-wavy; it's a concrete plan-time deliverable with named path, CLI, idempotency contract, storage schema, and verification command.

### 3.3.1 Right Now show-wide state inventory (orthogonal to restriction)

Master spec §8 names additional Right Now card states that are show-wide (independent of viewer restriction): `pre_travel`, `travel_in_day`, `show_day_N` (N = 1, 2, 3...), `post_show`. These are not covered by R1–R8 (which focus on viewer-restriction states). The matrix exercises each show-wide state at least once with restriction = `none`:

| Show-wide state | Fixture configuration | When walked |
|---|---|---|
| `pre_travel` | Today is more than 1 day before fixture's `dates.travelIn` | Pre-show day (data-engineered) |
| `travel_in_day` | Today = fixture's `dates.travelIn` (the day before set day) | Travel-in day |
| `show_day_1` | Today = first day of fixture's show dates | First show day |
| `show_day_N` (N≥2) | Today = an interior show day | Mid-show day |
| `post_show` | Today is after fixture's `dates.travelOut` | Post-show day |

Show-wide states are walked once each (SMOKE-SAMPLE per §3.4) for the LEAD persona on the Right Now card surface. Combined with R1–R8 viewer-restriction states, the Right Now card has 8 + 5 = 13 day-state walks per persona. MATRIX-INVENTORY.md dispositions each state explicitly so future readers see why it was included.

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
| **Restriction combo (R1–R8)** | SMOKE-SAMPLE on most surfaces; SMOKE-SAMPLE with explicit pair selection with role on Right Now / schedule / pack-list | Restriction combos affect Right Now state, schedule filtering, and pack-list visibility. Each combo exercised ONCE on each of those three tiles with LEAD role. Role-restriction interaction sampled per §3.4.1. |
| **Real-device-vs-emulated** | SMOKE-SAMPLE | Real iPhone only for the curated subset named in §3.1 (Right Now, schedule, signed-link redemption, sign-in, expired-link, revoked-link, `/me`) for personas 5/6/7/8. Other cells emulate. |

**Bounded estimate:**

- Surface × persona × mode × viewport (base matrix): ≈ N_surfaces × 8 personas × 4 mode-combos, BUT bounded by applicability — most surfaces apply to 1–3 personas. Practical estimate: ~200–400 cells.
- Role variant × crew-page tiles × mode (orthogonal pass): 9 variants × ~6 tiles × 4 mode-combos ≈ 216 cells.
- Restriction combo × restriction-sensitive tiles × mode (orthogonal pass): 8 combos × 3 tiles × 4 mode-combos = 96 cells.
- Pairwise role × restriction on Right Now: 8 pairs × 4 mode-combos = 32 cells.
- Real-device pass on curated subset: ~10 cells × 4 personas × 1 mode-combo ≈ 40 cells.

**Total upper-bound estimate: ≈ 600–800 cells.** Walking this at a coarse rate of ~10–30 cells/hour (the range reflects per-cell variance: a quick visual confirmation runs faster, a real-iPhone leg or a cold-start step runs slower; triage time per finding adds further variance) = roughly 20–80 hours of pure exercise. Spread across the iteration loop with fix cycles, a realistic milestone duration is **3–8 weeks**, not 2–4 weeks (R4 revision — earlier estimate was optimistic).

**MATRIX-INVENTORY.md records coverage class per row.** Every row's coverage class (FULL / PAIRWISE / SMOKE-SAMPLE) is set in the plan-time derivation per §4.1.1. The dev's exercise walks each row at the coverage level specified.

### 3.4.1 Role × restriction pair-selection rule (R4 amendment — replaces "pairwise" misnomer)

Earlier drafts called role × restriction "PAIRWISE" but specified only ~8 pairs, which is sampling not pairwise (true pairwise of 9 role × 8 restriction = 72 pairs). The corrected classification: this is **SMOKE-SAMPLE with explicit pair selection**, not pairwise. The selection rule:

| Pair # | Role variant | Restriction combo | What this pair catches |
|---|---|---|---|
| 1 | 5a (`["LEAD"]`) | R1 (`none`/`none`/set day) | Baseline LEAD + no restriction; sanity check |
| 2 | 5b (`["LEAD","A1"]`) | R2 (`explicit` today included) | Compound LEAD + audio scope tile with date restriction matching |
| 3 | 5c (`["BO","LEAD"]`) | R7 (`none`/`["Load In","Set"]`/set day) | Compound LEAD + backstage with set-day-only stage restriction |
| 4 | 6a (`["A1"]`) | R3 (`explicit` today excluded) | Audio scope tile + off-day → no scope tile shown |
| 5 | 6b (`["V1"]`) | R4 (`unknown_asterisk`) | Video scope + asterisk-unconfirmed; check both don't double-trigger |
| 6 | 6c (`["L1"]`) | R5 (pre-show day) | Lighting scope + pre-show state |
| 7 | 6d (`["BO"]`) | R6 (post-show day) | No-scope crew + after-last-day state |
| 8 | 6e (`["A1","L1"]`) | R8 (`none`/`["Load Out","Strike"]`/strike day) | Compound scope + strike-day-only stage restriction |
| 9 | 6f (`[]`) | R1 (`none`/`none`/set day) | Empty-flags edge case + no restriction |

This sampling rule covers each role variant (9) at least once AND each restriction combo (8) at least once, plus one extra (the 9th pair pairs an empty-flags case with the baseline R1 for negative-test coverage). It does NOT cover all 72 pairs — the cross-coverage gaps are accepted with the rationale that: (a) role and restriction are largely orthogonal (role gates which tiles render; restriction gates which days/stages those tiles render on); (b) the 9 pairs hit every value on each axis at least once, so axis-individual bugs surface; (c) cross-axis interaction bugs that *only* manifest at a specific (role, restriction) pair outside the 9 are accepted as a known coverage gap.

If the dev encounters an unexpected behavior during the 9-pair walk that suggests cross-axis interaction, the spec authorizes the dev to expand to additional pairs at their discretion (the working bug-list, not a formal requirement). MATRIX-INVENTORY.md records the 9 pairs explicitly.

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
| **B. Crew surfaces** | `/show/[slug]/p` (signed-link fragment-token path — `#t=<jwt>` per master spec §7; the `?t=` / `?token=` query-token form is a separate auth-compromise surface tested under band C). `/show/[slug]` (Google-sign-in path). `/me` (cross-show signed-in identity surface — master spec §7.3, uses `validateGoogleIdentity` not `validateGoogleSession`). Every documented tile (Right Now, schedule, hotel, transport, crew, contacts, diagrams gallery, etc.) with empty / loading / error states. Role-filter sentinel-hiding per role per §3.2 sub-variants. Crew footer "Something looks wrong?" report-modal entry (per master spec §13.1 surface 4) — submission states covered in band F. |
| **C. Auth surfaces** | Google sign-in (fresh + return sessions exercised separately). Sign-out. Signed-link redemption (fragment-token canonical path). Expired-link surface. Revoked-link surface. "Not on crew list" surface. 401 / 403 paths. **Query-token compromise path** — hitting `/show/<slug>?t=…` (the non-canonical query form) MUST trigger the compromise/revoke path per master spec §7; this is a negative-auth surface that gets its own row. |
| **D. Help surfaces (M11)** | All 13 `/help` pages + the catalog-driven `/help/errors` page + `<RefAnchor>` rendering + `<Screenshot>` light/dark variant switching. |
| **E. Cross-cutting affordances** | Every `?` tooltip / "Learn more →" link from §9.0.1 surface affordance matrix (M11 §5.6). Every catalog-driven error message rendered through `messageFor()` — **both admin-facing AND crew-facing** (an earlier draft restricted this band to `/admin/*` only; corrected per Codex R1 P0 — crew-facing catalog-driven messages like `LINK_EXPIRED`, "not on crew list", and rate-limit copy are equally in scope). AlertBanner row rendering for each non-info-severity admin catalog code. |
| **F. Report-pipeline surfaces (M8)** | Master spec §13.1 enumerates 4 report entry points (admin parse-panel button, preview/banner button, crew footer "Something looks wrong?" modal, and the §13 admin surfaces); each is a surface in the matrix. Submission outcome surfaces also walked: success confirmation, in-flight idempotency (`IDEMPOTENCY_IN_FLIGHT`), rate-limit hit (429 for admin and crew), GitHub-lookup-inconclusive (502), lease-expired (`REPORT_HORIZON_EXPIRED` 410), `REPORT_ORPHANED_LOST_LEASE`. Each outcome is a catalog-driven UI state and validated end-to-end against the report-pipeline contract from master spec §13.2.3 amendments. |

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

### 5.3 J3 — Signed-link crew end-to-end (real device leg)

Generate a signed link from admin. The canonical URL form is `/show/<slug>/p#t=<jwt>` (master spec §7 — fragment token; Vercel does NOT log fragments, so this is the safe form). Open the canonical URL on the dev's real iPhone (not Playwright) in Safari. Browse every documented tile. Verify role-hiding for at least one non-LEAD scope variant (e.g., A1) per §3.2. Verify LEAD role sees full content including `shows_internal.financials`. Test expired-link path (manually expire via admin tooling or wait for TTL). Test revoked-link path (admin revokes; old link 401s with "not on crew list" surface).

**Additionally — query-token compromise leg.** Take a valid fragment token, rewrite the URL to the non-canonical query form `/show/<slug>?t=<jwt>`, and confirm the compromise path triggers per master spec §7 (token revoked, "compromise detected" surface). This is a negative-auth test that exercises band C's compromise row.

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
| Supabase JS `.from()` calls | `rg -n "\\.from\\(['\\\"]<table_name>['\\\"]\\)" app/ lib/ components/` | Direct table reads from JS layer |
| Supabase JS `.rpc()` calls (if migration adds/changes an RPC) | `rg -n "\\.rpc\\(['\\\"]<rpc_name>['\\\"]\\)" app/ lib/ components/` | Direct RPC consumers |
| Server-side SQL string references | `rg -n "<table_name>" app/api/ lib/db/ supabase/migrations/ supabase/functions/` | Raw SQL queries, migration cross-references, edge function refs |
| Generated TypeScript types | `rg -n "<TableNameInPascalCase>" lib/types/ supabase/types/` | Type-only references in TS that imply usage |
| Helper wrappers | `rg -n "<table_name>" lib/data/ lib/auth/ lib/sync/` | Domain-helper wrappers around the table |
| Test fixtures | `rg -n "<table_name>" tests/ fixtures/` | Test suites that depend on the table — these are non-validation-walk consumers but flag them for awareness |

Every match from rows 1–5 is mapped to a MATRIX-INVENTORY row (or flagged as EXCLUDED if it's an internal-only path that doesn't render UI). Row 6 (tests) is informational.

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

Phase 0 stands up the infrastructure the exercise runs against. Phase 1 (the exercise proper) does not start until Phase 0 verifies.

### 9.1 Components to stand up

| Component | Detail |
|---|---|
| **Supabase prod project** | Distinct from the dev project. All migrations applied via `supabase db push` (or equivalent). Seeded with a representative fixture set — NOT Doug's real data; sanitized derivatives or repo fixtures only. |
| **Drive service account (prod-tier)** | A separate service account from the dev one. Its own watched folder. Populated with the same fixture sheets as the seed (so cron paths line up). |
| **Vercel project** | Linked to the repo's `main` branch (or chosen branch). **Production-target deployment** (NOT preview) — Vercel Cron Jobs run only on production deployments per [Vercel Cron Jobs docs](https://vercel.com/docs/cron-jobs). **No custom domain; no DNS.** The `*.vercel.app` URL of the production deployment is the dev's working URL for the entire validation. R3 amendment: an earlier draft said "preview deployment"; corrected — preview deployments do not run cron and would falsify smoke test 3. |
| **Env vars** | All required vars set in the Vercel project: Supabase URL / anon key / service key, Drive service account JSON, GitHub OAuth for the M8 report pipeline, any per-environment flags. |
| **CI gates** | The full CI gate set active against the preview build. Each gate verified to actually fire — by deliberately tripping one (e.g., a known structural-test regression in a throwaway branch) and confirming the gate blocks the deploy. |
| **Alert paths** | `admin_alerts` table populates correctly under fixture-induced events. AlertBanner renders correctly from real rows in the prod Supabase. (Push is BACKLOG; alert path here is dashboard-only.) |

### 9.2 Phase 0 exit criterion

Phase 0 closes when **all five** smoke tests pass — only after all five does Phase 1 start. A seeded DB alone is not sufficient evidence the prod-equivalent stack is wired end-to-end; each smoke test exercises a distinct integration axis.

1. **Admin sign-in.** The dev signs in via Google to the deployed production URL (`*.vercel.app`, no custom domain) and lands as admin on `/admin`. Verifies: Supabase auth + admin role-check + RLS read path.
2. **Signed-link real-iPhone render.** A signed link generated from `/admin` on the production URL (canonical `/show/<slug>/p#t=<jwt>` form per master spec §7), opened on the dev's real iPhone in Safari, renders a fixture crew page correctly. Verifies: signed-link mint + redeem + crew-page render against real prod Supabase data.
3. **Cron + Drive integration.** A fixture sheet placed in the prod-tier Drive watched folder is detected by the cron path (Vercel Cron → fetch from Drive service account → parse → propagate) within one cron interval. The new show appears in `/admin` Active Shows panel. Verifies: cron schedule firing + Drive service-account credentials + parser end-to-end + DB write under per-show advisory lock.
4. **Admin alert write + AlertBanner render.** A fixture-induced staging event (e.g., editing the seeded fixture to trigger MI-6 crew shrinkage) causes a row to land in `admin_alerts` AND the AlertBanner on `/admin` renders that row on a fresh page load. Verifies: write path to `admin_alerts` + AlertBanner read query + crew-page propagation behavior end-to-end.
5. **Wall-clock + fixture-data clock control.** Seed a fixture into the prod Supabase with `date_restriction.days = [<a date that is NOT today>]` and a known `dates.travelIn/travelOut` window that includes today. Generate a signed-link, open on the Vercel `*.vercel.app` production URL, and confirm the Right Now card renders `viewer_off_day` copy (per master spec §8 line 2413). Verifies: the production stack reads wall-clock + fixture data correctly without test-auth bypass; the §3.3 wall-clock approach is genuinely available.

Phase 0 closes when **all five** smoke tests pass — only after all five does Phase 1 start. Failing any of the five re-opens Phase 0. (R5 amendment: the wording previously said "all four" in one place and "all five" in another, contradicting itself; this paragraph is the authoritative count — five.)

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
| Tier × domain matrix | N/A | No DB-touching change. |
| CHECK / enum migration | N/A | No DB constraint change. |
| Flag lifecycle | N/A | No new boolean config field. |
| Pay-engine grain | N/A | No pay-engine touch. |
| Self-consistency sweep | Applied | Numeric claims cross-checked: 4 journeys (§5.1–§5.4), **8 personas (§3 table — expanded R1 to add `/me` cross-show as persona 8)**, **6 surface bands (§4.2 A–F — band F report-pipeline added R1)**, **9 role sub-variants (§3.2 — 3 LEAD + 6 non-LEAD; LEAD compounds added R2)**, **8 viewer-restriction combinations (§3.3 R1–R8 — added R2)**, **5 show-wide Right Now states (§3.3.1 — added R4)**, **9 role×restriction sampled pairs (§3.4.1 — added R4)**, **7 matrix-derivation sources (§4.1.1 — added R2)**, **3 coverage classes (§3.4 FULL/PAIRWISE/SMOKE-SAMPLE — added R3)**, **5 Phase 0 smoke tests (§9.2 — R3 added smoke test 5; R5 corrected one stale "all four" wording)**, **6 transitive-consumer file classes (§7.2.2 — added R4; catalog, auth, design tokens, components, single-page, schema; R5 normalized stale "5" claim)**, **6-vector schema-migration enumeration recipe (§7.2.2.1 — added R5)**, 13 /help pages (per M11 §4), MUST/SHOULD/NICE triage tiers (§7.1), 24h cooldown (§6), ≥2 cold-start runs (§6 + §7.2 step 7). |
| Disagreement-loop preempt | Applied | §11.2 ("intentionally absent") names the "no artifact" decision as deliberate, with rationale, so reviewers don't relitigate it. §1.5 names "no real-user testing" as deliberate, with rationale. §2 enumerates explicit deferrals so reviewers don't surface them as gaps. |
| Build-vs-runtime gate explicitness | Applies | Phase 0 §9 names the build target (Vercel `*.vercel.app` production deployment, no custom domain); §9.2 names the runtime smoke tests that gate Phase 1 (real Google sign-in + real iPhone signed-link render). The seven CI gates in §9.1 are build-time gates; the alert path is a runtime path. |

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
