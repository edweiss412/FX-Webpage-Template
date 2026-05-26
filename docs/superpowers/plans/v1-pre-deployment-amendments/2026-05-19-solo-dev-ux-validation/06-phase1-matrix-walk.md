# Phase 1 — Matrix walk + 4 journeys + cold-start pass

> Per spec §3, §4, §5, §6, §7.1. Estimate: 10–30 hours pure exercise (10–30 cells/hour rate range per spec §3.4; ≈650–850 cells total).
>
> **This phase is NOT TDD.** The work product is the dev's exercise + a triage list. No automated test suite covers the walk. The only required output is the MATRIX-INVENTORY.md (plan-time, this phase's first task) + the eventual SIGN-OFF.md (final phase).

---

### Task 1.0: EXTEND MATRIX-INVENTORY.md with bands A–E (band F slice already exists from Phase 0.E.0; MERGE not OVERWRITE)

**Files:**
- Modify: `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/MATRIX-INVENTORY.md` (R2 amendment — was "create"; Phase 0.E.0 already authored band F slice)

Per spec §4.1.1. This task EXTENDS the existing MATRIX-INVENTORY.md (which already contains the band F report-pipeline rows + dispositions committed in Phase 0.E.0) with bands A through E from 6 derivation sources (the 7th — band F report-pipeline — is already complete). Every candidate row dispositioned INCLUDED / EXCLUDED / BAND-OVERLAP. No silent drops. **CRITICAL: do NOT overwrite the band F section.** Append bands A–E rows; preserve every band F row + its committed disposition.

- [ ] **Step 1: Walk master spec heading inventory.** Use `grep -n "^##\\|^###" docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` to enumerate every section heading. For each heading that names a UI surface (Active Shows panel, /admin dashboard, RightNowCard, etc.), generate one candidate matrix row. Disposition each row: INCLUDED (most surfaces) / EXCLUDED with reason (e.g., "spec section is non-UI internals") / BAND-OVERLAP with another row.

- [ ] **Step 2: Walk master spec spec-id anchors** (`<!-- spec-id: ... -->`) and AC-X.Y references. Each spec-id anchored to a UI surface → one row.

- [ ] **Step 3: Walk M11 spec page inventory.** All 13 `/help/...` routes per `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.md` §4. Each → one row.

- [ ] **Step 4: Walk live route inventory:** `find app -name "page.tsx" -o -name "layout.tsx"`. Disposition every route not excluded by §4.3 (e.g., `/admin/dev/*` per `scripts/with-admin-dev-flag.mjs` is EXCLUDED).

- [ ] **Step 5: Walk catalog inventory:** parse `lib/messages/catalog.ts`; one row per entry with `dougFacing != null` OR `crewFacing != null`. Group by rendering surface (admin pages render admin-facing; crew pages render crew-facing; both render via band B/E composition).

- [ ] **Step 6: Band F report-pipeline outcomes — ALREADY DONE in Phase 0.E.0.** Skip this source in Task 1.0; the dispositions are already committed. Verify the band F section still exists with all rows + dispositions by `grep -c "band F\|F-OUTCOME\|REPORT_" MATRIX-INVENTORY.md` after this task's edits. If band F section is missing, REVERT the file from the Phase 0.E.0 commit and re-extend.

- [ ] **Step 7: Walk §9.0.1 affordance matrix** from M11 §5.6 (the 13+ affordances enumerated by `data-testid`). Each → one row.

- [ ] **Step 8: For every candidate row, assign:**
  - **Surface band** (A/B/C/D/E/F per spec §4.2)
  - **Persona scope** (which personas of 1-8 reach this surface — subset, not full crossproduct)
  - **Mode × viewport sub-checks** (default: 4 — light × dark × mobile × desktop)
  - **Real-iPhone status** (yes if persona 5/6/7/8 + curated subset per §3.1; else emulated)
  - **Coverage class** (FULL / PAIRWISE / SMOKE-SAMPLE per §3.4 axis-applicability policy)
  - **Disposition** (INCLUDED / EXCLUDED w/ reason / BAND-OVERLAP w/ link)

- [ ] **Step 9: Verify the band F section is intact + commit the EXTENDED file:**

```bash
# Pre-flight: confirm band F rows survived the edits
grep -c "band F\|F-OUTCOME\|REPORT_" docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/MATRIX-INVENTORY.md
# (Should be ≥ Phase 0.E.0's original row count.)

git add docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/MATRIX-INVENTORY.md
git commit -m "$(cat <<'EOF'
docs(m12): MATRIX-INVENTORY.md extended with bands A-E per spec §4.1.1

Band F (report-pipeline outcomes) was authored in Phase 0.E.0 and is
preserved verbatim. This commit adds bands A (admin) + B (crew) + C
(auth) + D (M11 /help) + E (cross-cutting affordances) from 6
derivation sources (master spec headings + spec-IDs + M11 pages +
routes + catalog + §9.0.1 affordance matrix). Every candidate
dispositioned (INCLUDED / EXCLUDED / BAND-OVERLAP). Coverage class +
persona × surface mapping set per §3.4 axis-applicability policy.

R2 amendment: this task extends rather than overwrites the file.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**MATRIX-INVENTORY.md is frozen as of this commit.** The matrix walk references it; no per-cell updates during Phase 1 are written back.

---

### Task 1.1: Walk-session gate before the initial sweep

Per spec §3.3 step 5 + invariant 10 (M12-specific).

- [ ] **Step 1: Run** `pnpm validation:check-seed --combo all`. Expect exit 0 with "OK: seed matches today (combos: ...)".
- [ ] **Step 2: If exit 1:** run `pnpm validation:reseed --combo all` then re-run check-seed. Repeat until exit 0.
- [ ] **Step 3: NO commit.** Walk-session gate is procedural, not artifactual.

---

### Task 1.2: Initial sweep — matrix walk (band-by-band, persona-by-persona)

Time budget: ≈10-20 hours over 1-3 calendar days. Default-up triage per spec §7.1.

- [ ] **Step 1: Walk band A (admin surfaces) per persona 2 + 3:**
  - Persona 2 (Doug as admin, steady state): `/admin` dashboard, all panels; `/admin/show/[slug]` per-show panel (includes the M11.5 `CurrentShareLinkPanel` + `ShareLinkCopyButton` + `RotateShareTokenButton` + `ResetPickerEpochButton` admin affordances — exercise each in light + dark + both viewports during this band-A pass; the destructive actions also get walked in J3 but their resting-state UX is band-A's responsibility); `/admin/show/staged/[stagedId]`; preview routes.
  - Persona 3 (Doug as admin, onboarding cold start): the onboarding wizard from a freshly-seeded "no shows" state.
  - For each cell: light + dark mode × mobile + desktop viewport. Note any visual or functional finding. Default-up triage.
  - **Picker-shaped Playwright .skip ambient note (per M11.5-PLAYWRIGHT-HELPERS deferral trigger):** while walking band-A admin surfaces, if the dev's local `pnpm test:e2e` happens to be run, the 4 `.skip` picker-shaped e2e scenarios in `tests/e2e/picker-flow.spec.ts` (signed-in identity helper / pickIdentity / mintShareLink helper shapes) can be un-skipped + ported opportunistically. NOT a discrete task here — just ambient context per M11.5 deferral §B continuation report.

- [ ] **Step 2: Walk band B (crew surfaces) per personas 5 + 6 + 7 + 8** with §3.2 role variants and §3.3 R-combos sampled per §3.4 coverage policy (post-2026-05-26 picker-pivot rebase — "signed-link" persona descriptions are historical; the v1 access path is share-link + picker):
  - Persona 5 (picker-LEAD): all 6 LEAD-baseline tile renderings × R1 baseline; access via `/show/<slug>/<shareToken>/` + skip-pick `alias_5a_lead`.
  - Persona 6 (picker-non-LEAD): each of the 6 non-LEAD role variants × the §3.4.1 11-pair selection; access via skip-pick the relevant 6a–6f alias.
  - Persona 7 (Google-OAuth crew, fresh + return): subset on crew page + `/me`; sign-in path resolves to crew row via `claim_oauth_identity` + lazy-mint picker cookie.
  - Persona 8 (`/me` cross-show identity): the cross-show list surface; reads tokenized URLs via `my_share_tokens_for_email()` RPC.
  - Real-iPhone curated subset per §3.1 for personas 5/6/7/8.

- [ ] **Step 3: Walk band C (auth surfaces) per persona 1 + relevant signed-in personas (post-pivot picker render arms — see spec §4.2 band C):**
  - Anonymous → `<SignInOrSkipGate>` Mode A (`no_auth/first_contact` arm) on `/show/<slug>/<shareToken>/`; 401/403/redirect-to-sign-in on admin routes; /help routes are public.
  - Stale picker cookie + `picker_epoch` bumped → `epoch_stale` arm + `PICKER_EPOCH_STALE_BANNER` (J3 leg (b) overlap).
  - Picker cookie's crew_member_id removed from roster → `removed_from_roster` arm + `PICKER_REMOVED_FROM_ROSTER_BANNER`.
  - Identity_invalidated/claimed_after_pick (J3 leg (c) step 3 desktop-no-Google-session overlap; reachable via `resolvePickerSelection.ts:110-120` when validateGoogleSession returns plain `continue` and falls through to the picker resolver) → picker re-render + `PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER`. Note: iPhone post-claim from page-route hits `needs_picker_bootstrap` (resolveShowPageAccess.ts:204-208) BEFORE the claim arm, NOT `claimed_after_pick` — see spec §5.3 leg (c) step 2.
  - Identity_invalidated/session_mismatch — **wire arm only**; structurally unreachable from the page-route (resolveShowPageAccess forecloses both preconditions per spec §5.3 leg (c) closing disclosure). Reachable only via API-route callers (`app/api/show/[slug]/version`, `app/api/realtime/subscriber-token`, `app/api/report`, `validatePickerAssetSession`); same banner as `claimed_after_pick` per `page.tsx:241-246` (H8 two-reasons doc-guard contract enforced as documentation invariant).
  - Share-token rotated, old URL reload → `showUnavailable()` envelope + `PICKER_SHOW_UNAVAILABLE` per M11.5 R2 (J3 leg (a) overlap).
  - Google-session matches no crew row for the show → `no_auth/google_mismatch` arm = `<SignInOrSkipGate>` Mode B "signed in as someone else" (TERMINAL per P-R27 Fix-1; closes shared-device identity-leak vector).
  - `validateNextParam` slug-only rejection (forged OAuth `?next=/show/<slug>` without token segment) → H2 allowlist denies it; routing-time reject, not a journey leg.
  - Sign-out.

- [ ] **Step 4: Walk band D (M11 /help surfaces) per persona 2:** all 13 pages + `/help/errors` catalog-driven rendering + RefAnchor + Screenshot light/dark switching.

- [ ] **Step 5: Walk band E (cross-cutting affordances):** every `?` tooltip / "Learn more →" link per M11 §5.6 affordance matrix (testids walked).

- [ ] **Step 6: Walk band F (report-pipeline) per disposition:** if INCLUDED-via-harness, run `pnpm validation:report-fixtures --outcome <each>` and walk the resulting UI surface. If EXCLUDED-rely-on-structural, skip.

- [ ] **Step 7: For each finding,** record in informal working notes (spec §8.1 — no required artifact format). Classify per spec §7.1 default-up rubric: MUST-FIX (would damage Doug's first impression OR prevent him from doing his job) / SHOULD-FIX / NICE-TO-FIX.

- [ ] **Step 8: NO commit.** The walk is procedural.

---

### Task 1.3: Walk-session gate before each journey (J1-J4)

Per spec §3.3 step 5. Before each journey:

- [ ] Run `pnpm validation:check-seed --combo all`. If stale, re-seed.
- [ ] Run J1, then check-seed again, then J2, then check-seed, etc.

---

### Task 1.4: J1 — Cold-start admin via /help

Per spec §5.1.

- [ ] **Step 1: Fresh browser profile** (incognito or new identity; no cookies, no autofill).
- [ ] **Step 2: Open the deployed `*.vercel.app` production URL.**
- [ ] **Step 3: Sign in via Google.** Land on `/admin`.
- [ ] **Step 4: From `/admin`, follow the "Take the tour" link** into `/help`. Read `/help/getting-started` and `/help/daily-rhythm`. **Use ONLY /help as the map** — do not navigate by dev memory.
- [ ] **Step 5: Drop a fixture sheet into the watched folder.**
- [ ] **Step 6: Wait one cron interval.** Observe first-seen auto-publish per master spec amendment 9.
- [ ] **Step 7: Open the resulting preview link.** Crew page renders.
- [ ] **Step 8: Read the share URL from `/admin/show/<slug>` (`CurrentShareLinkPanel`).** This is the URL Doug would share to the group thread. Confirm clicking `ShareLinkCopyButton` copies to clipboard.
- [ ] **Step 9: Note any cold-start friction:** every moment the dev had to use dev-memory because /help was unclear is a finding.

Run J1 twice — once light + desktop, once dark + mobile.

---

### Task 1.5: J2 — Pending-sync triage

Per spec §5.2.

- [ ] **Step 1: Edit a published fixture sheet** to trigger MI-6 (crew shrinkage) — delete a crew row.
- [ ] **Step 2: Edit the same or a different sheet** to trigger MI-11 (email change) — change an email.
- [ ] **Step 3: Wait one cron interval + push-debounce window.**
- [ ] **Step 4: Open `/admin`** → see AlertBanner + staged-review card.
- [ ] **Step 5: Open `/admin/show/[slug]`** → drill into staged change.
- [ ] **Step 6: Exercise Apply path on one staging.** Confirm Apply propagates to the crew page and to existing picker-cookie sessions (refresh the iPhone's picked view to verify the change is visible; the Realtime broadcast on `show:<showId>:invalidation` should advance `viewer_version_token` and trigger client-side refetch even without manual reload, but a refresh is a deterministic verification).
- [ ] **Step 7: Exercise Discard path on the other.** Confirm Discard leaves prior state intact.

Run J2 twice — once light + desktop, once dark + mobile.

---

### Task 1.6: J3 — Share-link + picker crew end-to-end (real device leg; three-leg per spec §5.3)

Per spec §5.3 (post-2026-05-26 picker-pivot rebase — three legs replace the prior expired/revoked/query-compromise structure; auth source is the picker pivot spec, NOT master spec §7).

**Baseline preamble (run once before all three legs):**

- [ ] Sign in as admin on production Vercel deployment. Open `/admin/show/<R1-slug>`. Read the share URL from `CurrentShareLinkPanel`; click `ShareLinkCopyButton`. Open URL on real iPhone Safari → `<SignInOrSkipGate>` Mode A → "Skip and pick your name" → tap `alias_5a_lead` row → `_ShowBody` renders. Confirm LEAD content (financials visible) + Audio + Video + Lighting scope tiles all visible (LEAD unlocks all three per `lib/visibility/scopeTiles.ts`).

- [ ] Verify a non-LEAD identity: from the iPhone tap "Not you?" in the page chrome → back to picker → tap `alias_6a_a1` → `_ShowBody` renders. Verify role-hiding: financials hidden, Audio scope tile visible (A1 has audio scope; V1/L1 hidden). Restore the LEAD pick (Not you? → tap `alias_5a_lead`) before proceeding to leg (a).

**Leg (a) — Share-token rotation (M11.5 R2 PICKER_SHOW_UNAVAILABLE close-out):**

- [ ] **Step 1: On desktop:** click `RotateShareTokenButton` on `/admin/show/<R1-slug>`. Confirm two-tap. Observe `CurrentShareLinkPanel` shows the NEW URL (invokes `rotate_show_share_token` RPC — atomically rotates `show_share_tokens.share_token` + bumps `shows.picker_epoch += 1` under per-show advisory lock).
- [ ] **Step 2: On iPhone:** reload the OLD URL. Expect: `showUnavailable()` envelope renders `PICKER_SHOW_UNAVAILABLE` with crew-facing copy + admin help link (NOT a generic 404).
- [ ] **Step 3: Copy the new URL on desktop → share to iPhone → open. Expect: `<SignInOrSkipGate>` Mode A first (no cookie entry for this new share-token's show resolution OR `epoch_stale` banner if the picker_epoch bumped invalidates the prior cookie entry). Skip → pick `alias_5a_lead` → `_ShowBody` renders.

**Leg (b) — Picker-epoch reset (epoch_stale cascade):**

- [ ] **Step 1: On desktop:** click `ResetPickerEpochButton`. Confirm two-tap. Observe admin alert: `PICKER_EPOCH_RESET` should be emitted (per P-R26 email-bearing alert code with `admin_email_hash` context) — check via `/admin` AlertBanner OR the live `admin_alerts` table.
- [ ] **Step 2: On iPhone** (previously holding the post-leg-(a) cookie): reload the SAME URL. Expect: `epoch_stale` per `lib/auth/picker/resolvePickerSelection.ts:88-90` — the cookie's `e` is now two-stale (rotation in leg (a) bumped `shows.picker_epoch += 1` atomically; this reset bumped it again). The epoch check fires BEFORE roster / claim / session-email checks (NOT `identity_invalidated/session_mismatch` — that arm requires `sessionEmail` non-null AND `rowEmail !== sessionEmail`, neither precondition holds here). Route handler at `app/show/[slug]/[shareToken]/page.tsx:227-260` maps `epoch_stale` → `PICKER_EPOCH_STALE_BANNER` + auto-submitting `<StaleCleanupAutoSubmit>`.
- [ ] **Step 3: Re-pick `alias_5a_lead`** → fresh `selectIdentity` writes a cookie with the new `e` matching `shows.picker_epoch` → `_ShowBody` renders.

**Leg (c) — OAuth-claim identity-exclusivity (H8 two-reasons doc-guard; 5 steps post-2026-05-26 R8 repair):**

This is the load-bearing identity-exclusivity walk. It requires (i) a Google account whose email matches `alias_5a_lead`'s fixture email (the dev controls fixture emails — `validation+5a@example.com` is the convention), AND (ii) a separate "Bob" Google account whose email matches NEITHER `alias_5a_lead`'s NOR `alias_6a_a1`'s fixture emails (step 4 precondition for the Mode-B walk).

**Resolver-arm ordering matters.** Per `lib/auth/picker/resolveShowPageAccess.ts:170-212`, the page-route calls `validateGoogleSession` BEFORE `resolvePickerSelection`. The Google-success branch at lines 179-209 returns `needs_picker_bootstrap` for any cookie-mismatch / unclaimed-row / cookie-pre-dates-claim sub-state (lines 188, 197, 204-208). The `GOOGLE_NO_CREW_MATCH` branch at lines 176-178 returns `no_auth/google_mismatch` TERMINAL. `resolvePickerSelection.ts:88-143` (epoch → roster → claim → sessionEmail) is reached at line 212 ONLY when no active Google session exists. `session_mismatch` at line 122-143 of the picker resolver is therefore structurally unreachable from the page-route (see spec §5.3 leg (c) closing disclosure — reachable only via API-route callers). Fixture verification (spec §3.3 picker-fixture lockstep contract): a fresh `--combo all` reseed initializes every `crew_members.claimed_via_oauth_at = NULL`; the step-2 claim stamps ONLY rows whose `crew_members.email` matches `alias_5a_lead`'s fixture email, so `alias_6a_a1.claimed_via_oauth_at` remains NULL throughout leg (c).

- [ ] **Step 1: Set up two-device state.** iPhone still has `alias_5a_lead` cookie from leg (b). On the **desktop**, open a fresh incognito Safari profile, load the SAME share URL → Mode-A → Skip → pick `alias_5a_lead`. Both devices now have entries for `alias_5a_lead.id`. Verify both render `_ShowBody`.
- [ ] **Step 2: On iPhone:** sign in via Google using a Google account whose email matches the `alias_5a_lead` fixture's `crew_members.email`. Flow: tap "Sign in" in `<SignInOrSkipGate>` or navigate to `/auth/sign-in?next=<URL>` → Google consent → `/auth/callback/route.ts` invokes `claim_oauth_identity(canonical(email))` RPC (stamps `claimed_via_oauth_at = now()` on every matching `crew_members` row, under per-show advisory locks). Callback DOES NOT mint a picker cookie (R41-R6 lazy-mint). Redirects to `next` (the tokenized show URL). Expect: page-route resolver (`resolveShowPageAccess.ts:170-212`) — `validateGoogleSession` returns `success`; cookie's `id` matches `google.viewer.crewMemberId`; `crewClaimRow.claimed_via_oauth_at !== null`; cookie's `t` from leg (b) step 3 is pre-claim, so `entry.t <= claimEpochMillis`. **Per `resolveShowPageAccess.ts:204-208`, the resolver returns `needs_picker_bootstrap`** (validateGoogleSession-success branch fires BEFORE resolvePickerSelection; `claimed_after_pick` is NOT reachable from this path — that arm requires no active Google session). Page redirects to `/api/auth/picker-bootstrap?next=<URL>&t=<intentToken>`; bootstrap mints a NEW picker cookie with `t = result.mint_safe_t_millis` (DB-side, strictly > `claimed_via_oauth_at`); 302 back → `_ShowBody` renders directly. **User never sees the picker interstitial.** The visible signal that the claim succeeded is the `OAUTH_IDENTITY_CLAIMED` admin alert (verified at step 5). User-perceived flow: "signed in → bootstrap auto-redirect → page renders" per Resolved Decision 17.
- [ ] **Step 3: Cross-device claim propagation (`claimed_after_pick` observation).** On the **desktop** (still holding the pre-claim `alias_5a_lead` cookie from step 1; **no active Google session on this desktop browser**): reload the SAME URL. Expect: page-route's `validateGoogleSession` returns plain `continue` (no Google session) → does not match GOOGLE_NO_CREW_MATCH or success branches → falls through to `resolvePickerSelection` at line 212. Picker resolver hits the claim arm at line 110-120 FIRST — cookie has `id: <alias_5a_lead.id>`, `crewRow.claimed_via_oauth_at !== null` (claim from step 2 is global), cookie's `t` from step 1 < `claim_epoch_millis` → returns `identity_invalidated/reason='claimed_after_pick'` (the session-email arm at line 122 is unreachable because `sessionEmail` is null without a Supabase Auth session). Route handler maps to `PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER`. Confirm `alias_5a_lead`'s row is visually disabled in the desktop's picker too (OAuth claim is global across devices). **Pick `alias_6a_a1` (non-LEAD, OAuth-UNCLAIMED)** → `selectIdentity` writes a fresh cookie entry for `alias_6a_a1.id` → `_ShowBody` renders as A1 viewer (role-hiding: financials hidden, A1 scope tile visible). Desktop cookie now holds the UNCLAIMED alternate identity for step 4.
- [ ] **Step 4: Shared-device identity-leak vector defense (`no_auth/google_mismatch` Mode B).** On the desktop (cookie now holds `alias_6a_a1.id` from step 3), sign in to Google as the "Bob" account — its email matches NEITHER `alias_5a_lead`'s NOR `alias_6a_a1`'s `crew_members.email` (any non-fixture Gmail address works; "Bob picked up Alice's device" composition). After OAuth callback redirects back to the tokenized URL: resolver fires. Expect: page-route's `validateGoogleSession(req, {showId})` checks Bob's email against `crew_members` for this show — Bob has no matching crew row → returns `continue` with `code: 'GOOGLE_NO_CREW_MATCH'`. **Per `resolveShowPageAccess.ts:176-178`, the resolver returns `no_auth` with `reason: 'google_mismatch'`** (TERMINAL — does NOT fall through to the cookie/picker path; the shared-device identity-leak vector defense ratified in P-R27 closes here). The dev sees `<SignInOrSkipGate>` Mode B "signed in as someone else" copy with a "sign out and try again" affordance, NOT the picker. `resolvePickerSelection` is NEVER called on this path; `alias_6a_a1`'s cookie is irrelevant to the outcome. Sign out of Google on the desktop → reload → no Google session → `validateGoogleSession` returns plain `continue` → falls through to `resolvePickerSelection` → cookie has `alias_6a_a1.id`, `claimed_via_oauth_at IS NULL`, `sessionEmail` is null → `resolved` arm → `_ShowBody` renders as A1 viewer. Confirms the shared-device-leak vector is blocked at the page-route's TERMINAL Mode-B short-circuit (NOT `session_mismatch` at the picker resolver — that arm is API-route-only reachable per spec §5.3 leg (c) closing disclosure).
- [ ] **Step 5: Verify the admin-alerts trail:** open the desktop's admin session, check AlertBanner. Expect `OAUTH_IDENTITY_CLAIMED` row from leg (c) step 2 with the canonical-email hash context per P-R26.

**Per-leg working notes:** the dev keeps an informal bug-list per spec §5.5. The destructive admin actions (Rotate / Reset) are admin-UX surfaces — note any UX seams (button-label confusion, two-tap timing, copy clarity, AlertBanner row rendering) for triage per §7.1.

- [ ] **Step 6: NO commit.** Notes go in working notes.

---

### Task 1.7: J4 — Preview-as-crew double-check

Per spec §5.4.

- [ ] **Step 1: Pick a LEAD crew member from R1** (use `pnpm validation:resolve-alias R1 alias_5a_lead` to get the crew_id).
- [ ] **Step 2: Navigate to `/admin/show/<slug>/preview/<crew-id>`.**
- [ ] **Step 3: Verify the sticky preview banner renders** (per master spec §9.3).
- [ ] **Step 4: Verify the previewed crew content** matches what crew actually see in J3 (cross-reference role-hiding behavior).
- [ ] **Step 5: Verify "Learn more →" links do NOT appear** inside the previewed crew content (per M11 r10 admin-context boundary).
- [ ] **Step 6: Verify the sticky banner's `?` icon DOES emit its help link** (admin-context affordance).
- [ ] **Step 7: Repeat for an A1 crew member** (`alias_6a_a1`) — verify role-hiding sentinels match J3 step 3.

---

### Task 1.8: Cold-start pass (24h cooldown discipline)

Per spec §6.

- [ ] **Step 1: Confirm at least 24h has elapsed** since the dev's last code-touch on M12 surfaces (or M0-M10 surfaces). If not, wait.
- [ ] **Step 2: Open a fresh browser profile** (incognito or new identity).
- [ ] **Step 3: Open the deployed `*.vercel.app` production URL.**
- [ ] **Step 4: Sign in via Google.**
- [ ] **Step 5: Navigate ONLY by following /help instructions** — do not use dev memory. Follow `/help/getting-started` → `/help/daily-rhythm` → `/help/tour`.
- [ ] **Step 6: Note friction:**
  - Where /help doesn't match the product
  - Surfaces the dev leans on dev-memory because /help is unclear
  - Moments where Doug, arriving cold, would stop and ask "what now?"
  - Catches of self-shortcutting ("I know it's at /admin/show/staged/<id>")
- [ ] **Step 7: NO commit.** Findings go in working notes.

---

### Task 1.9: Triage all findings into MUST / SHOULD / NICE

Per spec §7.1.

- [ ] **Step 1: Compile working-notes findings** into a flat list.
- [ ] **Step 2: For each finding, apply the rubric:**
  - MUST-FIX: Would damage Doug's first impression OR prevent him from doing his job. First-impression = first 5 minutes of normal use. Confidence-shake test.
  - SHOULD-FIX: Friction Doug would notice over repeated use but wouldn't damage first impression.
  - NICE-TO-FIX: Dev-only polish.
- [ ] **Step 3: Default-up bias:** when in doubt, classify UP (MUST > SHOULD > NICE).
- [ ] **Step 4: NO commit.** Triage lives in working notes; the SIGN-OFF.md paragraph (final phase) references the final list.

---

### Task 1.10: Phase 1 close → iteration loop (Phase 7 — renamed from 8 in 2026-05-26 rebase)

If MUST-FIX list is non-empty, proceed to `07-iteration-and-final-sweep.md`. If MUST-FIX is empty after the initial sweep (unlikely but possible), proceed directly to "final sweep + sign-off" sections of Phase 7.

---

## Phase 1 failure modes

- **Walk-session gate fails repeatedly.** Re-seed is failing — return to Phase 0.C to diagnose.
- **The matrix is overwhelmingly large.** Honor the §3.4 coverage policy (FULL / PAIRWISE / SMOKE-SAMPLE per axis). MATRIX-INVENTORY.md's per-row coverage class is the canonical guidance.
- **A finding is ambiguous between MUST and SHOULD.** Default-up. If still unclear, ask: "would Doug's confidence in the product be shaken by this?" Yes → MUST.
- **The dev catches themselves shortcutting during cold-start.** That IS the finding. Note it; don't excuse it.
