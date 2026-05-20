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

- **Custom domain / DNS / public launch.** This milestone uses a `*.vercel.app` preview URL throughout. Domain + launch is a separate follow-on milestone (v1 launch).
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
| 5 | Signed-link crew — LEAD role | Fresh `?token=…` URL, role=LEAD | Full content visible; no role-hiding |
| 6 | Signed-link crew — A1 / non-LEAD role | Fresh `?token=…` URL, role≠LEAD | Role-filter sentinels active |
| 7 | Google-signed-in crew | Google OAuth path (not signed-link) | Same crew-page surface, different session origin |

**Persona 3 vs 2** is split because the UX changes shape (wizard vs steady state). **Personas 5 and 6** share the surface column for `/show/[slug]/p` but get separate matrix rows so role-hiding is exercised explicitly per role.

### 3.1 Sub-dimensions per matrix cell

Each persona × surface cell is exercised in *both* color modes AND *both* viewports — not separate matrix rows; sub-checks inside the cell.

| Sub-check | Required for every cell | Notes |
|---|---|---|
| Light mode | Yes | Per DESIGN.md AAA contrast floor |
| Dark mode | Yes | Per DESIGN.md sunlit-loading-dock-vs-dim-backstage parity |
| Mobile 390px viewport | Yes | Primary viewport per PRODUCT.md |
| Desktop ≥1024px viewport | Yes | Per DESIGN.md `--bp-lg` |
| Real iPhone Safari (Vercel preview URL) | Only for crew-facing surfaces (personas 5/6/7) on a curated subset of cells | The dev's actual phone; not Playwright |

The "curated subset" for real-iPhone is enumerated at plan-writing time; defaults are the Right Now card, the schedule tile, signed-link redemption, sign-in flow, expired-link path.

---

## 4. Surface inventory

### 4.1 Inventory source

The canonical source of "every documented surface" is the master spec (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md`) + the M11 spec (`docs/superpowers/specs/2026-05-12-user-facing-docs-design.md`). The implementation plan's first task walks both specs and produces the matrix's row inventory. This spec does NOT pre-enumerate every row, because the source has hundreds of references and would rot; the plan-time walk is authoritative.

### 4.2 Surface bands (high-level categorization)

| Band | Contents (representative; plan-time walk is authoritative) |
|---|---|
| **A. Admin surfaces** | `/admin` dashboard (Active Shows panel, pending-ingestion panel, restage panel, footer "Take the tour", AlertBanner). `/admin/show/[slug]` (sync health, parse-warnings, crew preview links, staged-review cards). `/admin/show/staged/[stagedId]` (first-seen review). `/admin/show/[slug]/preview/[crew-id]` (impersonation banner + previewed crew content). Onboarding wizard steps. Theme toggle, header, footer. |
| **B. Crew surfaces** | `/show/[slug]/p` (signed-link path). `/show/[slug]` (Google-sign-in path). Every documented tile (Right Now, schedule, hotel, transport, crew, contacts, diagrams gallery, etc.) with empty / loading / error states. Role-filter sentinel-hiding per role. |
| **C. Auth surfaces** | Google sign-in. Sign-out. Signed-link redemption. Expired-link surface. Revoked-link surface. "Not on crew list" surface. 401 / 403 paths. |
| **D. Help surfaces (M11)** | All 13 `/help` pages + the catalog-driven `/help/errors` page + `<RefAnchor>` rendering + `<Screenshot>` light/dark variant switching. |
| **E. Cross-cutting affordances** | Every `?` tooltip / "Learn more →" link from §9.0.1 surface affordance matrix (M11 §5.6). Every catalog-driven error message rendered through `messageFor()` in `/admin/*`. AlertBanner row rendering for each non-info-severity catalog code. |

### 4.3 Excluded surfaces

- Build-flagged routes (`/admin/dev/*` per `scripts/with-admin-dev-flag.mjs`) — not in the preview build.
- Any internal-only routes that do not render in the preview build.
- Phase-2 (post-v1) surfaces named in the M11 spec as deferred (`/help/crew/*` etc.).

---

## 5. Journey scripts (the composition test)

Four end-to-end journeys; each crosses multiple surfaces and catches the cross-surface seams the matrix's per-cell pass cannot. Each journey is run at least twice — once in light + desktop, once in dark + mobile.

### 5.1 J1 — Cold-start admin via /help

Fresh browser profile, deployed preview URL. Sign in via Google. Land on `/admin`. From `/admin`, follow the "Take the tour" link into `/help`. Read `/help/getting-started` and `/help/daily-rhythm`. Use only the /help docs as the map — *do not navigate by dev memory*. Drop a fixture sheet into the watched folder. See cron pick it up (or wait the cron interval). See first-seen auto-publish per master-spec amendment 9. Open the preview link, see crew page render. Generate a signed link.

### 5.2 J2 — Pending-sync triage

Edit a published sheet to trigger MI staging events. Pick MI-6 (crew shrinkage) and MI-11 (email change) as the two highest-stakes classes — separate stagings, not bundled. Wait for cron + push-debounce window. Open dashboard; see AlertBanner + staged-review card. Open `/admin/show/[slug]`, drill into staged change. Exercise the **Apply** path on one staging AND the **Discard** path on the other. Confirm Apply propagates to the crew page and to existing signed-link sessions. Confirm Discard leaves prior state intact.

### 5.3 J3 — Signed-link crew end-to-end (real device leg)

Generate a signed link from admin. Open it on the dev's real iPhone (not Playwright) in Safari. Browse every documented tile. Verify role-hiding for A1 role (generate a second link for an A1 crew member if needed). Verify LEAD role sees full content. Test expired-link path (manually expire via admin tooling or wait for TTL). Test revoked-link path (admin revokes; old link 401s with "not on crew list" surface).

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
| **MUST-FIX** | Would damage Doug's first impression OR prevent him from doing his job. | 500 / 404 on a documented path. Broken Google sign-in. Broken signed-link redemption. Dashboard empty for a real show. A documented tile completely missing or unreadable. The first surface Doug lands on (dashboard, wizard step 1) reads as obviously-prototype. Tap target &lt;44px on a critical CTA. Light-mode body-text contrast below the DESIGN.md direct-sunlight floor (7:1). Cross-surface inconsistency that changes meaning between two surfaces describing the same show. |
| **SHOULD-FIX** | Friction Doug would notice over repeated use but wouldn't damage first impression. | Error copy unclear-but-recoverable. Tile spacing off on a rare overflow case. Dark-mode contrast borderline-AA on a non-critical element. Transition jerky on a non-critical surface. A surface visibly less polished than its neighbors but not prototype-y. |
| **NICE-TO-FIX** | Dev-only polish; below the threshold any user would notice. | 1px alignment quirks. Subtle typography inconsistency requiring a developer's eye. Sub-optimal animation easing on micro-interactions. Minor aria-label naming inconsistencies. |

### 7.2 Iteration loop (step-by-step)

```
1. Phase 0 (§9) verifies. Phase 1 starts.
2. Initial sweep — walk full matrix; run J1–J4; run cold-start pass.
3. Triage every finding per §7.1, default-up.
4. Fix pass — address all MUST-FIX. UI-touching fixes run the project's
   invariant 8 (impeccable critique + audit external attestation).
   Conventional-commits style per task.
5. Targeted re-exercise — re-walk surfaces touched by the fixes;
   re-run any journey that crosses them.
6. Loop 3–5 until MUST-FIX list is empty.
7. Final full sweep — re-walk full matrix; re-run J1–J4; re-run
   cold-start pass after another 24h cooldown.
8. Disposition SHOULD / NICE per §7.3.
9. Sign-off (§8).
```

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
| **Vercel project** | Linked to the repo's `main` branch (or chosen branch). Preview deployments configured. **No custom domain; no DNS.** The `*.vercel.app` URL is the dev's working URL for the entire validation. |
| **Env vars** | All required vars set in the Vercel project: Supabase URL / anon key / service key, Drive service account JSON, GitHub OAuth for the M8 report pipeline, any per-environment flags. |
| **CI gates** | The full CI gate set active against the preview build. Each gate verified to actually fire — by deliberately tripping one (e.g., a known structural-test regression in a throwaway branch) and confirming the gate blocks the deploy. |
| **Alert paths** | `admin_alerts` table populates correctly under fixture-induced events. AlertBanner renders correctly from real rows in the prod Supabase. (Push is BACKLOG; alert path here is dashboard-only.) |

### 9.2 Phase 0 exit criterion

Phase 0 closes when **both** smoke tests pass:

1. The dev signs in via Google to the deployed preview URL and lands as admin on `/admin`.
2. A signed link generated from `/admin` on the preview URL, opened on the dev's real iPhone in Safari, renders a fixture crew page correctly.

Passing both gates the start of Phase 1. Failing either re-opens Phase 0.

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

The implementation plan must NOT add structural artifacts that contradict the "no artifact" decision. Specifically:

- The plan does NOT require per-cell check-marks in a committed matrix file.
- The plan does NOT require per-surface screenshots in a committed folder.
- The plan does NOT require session recordings.

The plan MAY suggest informal working tools (a personal bug-list file, a personal matrix-tracker spreadsheet) — but cannot promote any of them to a required milestone output. The sign-off paragraph (§8.1) is the only required output.

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
| Self-consistency sweep | Applied | Numeric claims cross-checked: 4 journeys (§5.1–§5.4), 7 personas (§3 table), 5 surface bands (§4.2), 13 /help pages (per M11 §4), MUST/SHOULD/NICE triage tiers (§7.1), 24h cooldown (§6), >=2 cold-start runs (§6 + §7.2 step 7). |
| Disagreement-loop preempt | Applied | §11.2 ("intentionally absent") names the "no artifact" decision as deliberate, with rationale, so reviewers don't relitigate it. §1.5 names "no real-user testing" as deliberate, with rationale. §2 enumerates explicit deferrals so reviewers don't surface them as gaps. |
| Build-vs-runtime gate explicitness | Applies | Phase 0 §9 names the build target (Vercel preview deployment); §9.2 names the runtime smoke tests that gate Phase 1 (real Google sign-in + real iPhone signed-link render). The seven CI gates in §9.1 are build-time gates; the alert path is a runtime path. |

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

None at spec-write time. Spec is ready for adversarial review.
