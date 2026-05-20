# Phase 1 — Matrix walk + 4 journeys + cold-start pass

> Per spec §3, §4, §5, §6, §7.1. Estimate: 10–30 hours pure exercise (10–30 cells/hour rate range per spec §3.4; ≈650–850 cells total).
>
> **This phase is NOT TDD.** The work product is the dev's exercise + a triage list. No automated test suite covers the walk. The only required output is the MATRIX-INVENTORY.md (plan-time, this phase's first task) + the eventual SIGN-OFF.md (final phase).

---

### Task 1.0: EXTEND MATRIX-INVENTORY.md with bands A–E (band F slice already exists from Phase 0.E.0; MERGE not OVERWRITE)

**Files:**
- Modify: `docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/MATRIX-INVENTORY.md` (R2 amendment — was "create"; Phase 0.E.0 already authored band F slice)

Per spec §4.1.1. This task EXTENDS the existing MATRIX-INVENTORY.md (which already contains the band F report-pipeline rows + dispositions committed in Phase 0.E.0) with bands A through E from 6 derivation sources (the 7th — band F report-pipeline — is already complete). Every candidate row dispositioned INCLUDED / EXCLUDED / BAND-OVERLAP. No silent drops. **CRITICAL: do NOT overwrite the band F section.** Append bands A–E rows; preserve every band F row + its committed disposition.

- [ ] **Step 1: Walk master spec heading inventory.** Use `grep -n "^##\\|^###" docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` to enumerate every section heading. For each heading that names a UI surface (Active Shows panel, /admin dashboard, RightNowCard, etc.), generate one candidate matrix row. Disposition each row: INCLUDED (most surfaces) / EXCLUDED with reason (e.g., "spec section is non-UI internals") / BAND-OVERLAP with another row.

- [ ] **Step 2: Walk master spec spec-id anchors** (`<!-- spec-id: ... -->`) and AC-X.Y references. Each spec-id anchored to a UI surface → one row.

- [ ] **Step 3: Walk M11 spec page inventory.** All 13 `/help/...` routes per `docs/superpowers/specs/2026-05-12-user-facing-docs-design.md` §4. Each → one row.

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
grep -c "band F\|F-OUTCOME\|REPORT_" docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/MATRIX-INVENTORY.md
# (Should be ≥ Phase 0.E.0's original row count.)

git add docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/MATRIX-INVENTORY.md
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
  - Persona 2 (Doug as admin, steady state): `/admin` dashboard, all panels; `/admin/show/[slug]` per-show panel; `/admin/show/staged/[stagedId]`; preview routes.
  - Persona 3 (Doug as admin, onboarding cold start): the onboarding wizard from a freshly-seeded "no shows" state.
  - For each cell: light + dark mode × mobile + desktop viewport. Note any visual or functional finding. Default-up triage.

- [ ] **Step 2: Walk band B (crew surfaces) per personas 5 + 6 + 7 + 8** with §3.2 role variants and §3.3 R-combos sampled per §3.4 coverage policy:
  - Persona 5 (signed-link LEAD): all 6 LEAD-baseline tile renderings × R1 baseline.
  - Persona 6 (signed-link non-LEAD): each of the 6 non-LEAD role variants × the §3.4.1 11-pair selection.
  - Persona 7 (Google-OAuth crew, fresh + return): subset on crew page + `/me`.
  - Persona 8 (`/me` cross-show identity): the cross-show list surface.
  - Real-iPhone curated subset per §3.1 for personas 5/6/7/8.

- [ ] **Step 3: Walk band C (auth surfaces) per persona 1 + relevant signed-in personas:**
  - Anonymous → 401/403/redirect-to-sign-in per surface (admin routes, crew routes, /help).
  - Signed-link expired (J3 expired-link leg overlap).
  - Signed-link revoked (J3 revoked-link leg overlap — use `alias_5a_lead_for_revoke`).
  - Query-token compromise (J3 query-compromise leg overlap — use `alias_5a_lead_for_query_compromise`).
  - "Not on crew list" surface.
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
- [ ] **Step 8: Generate a signed link from `/admin`.**
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
- [ ] **Step 6: Exercise Apply path on one staging.** Confirm Apply propagates to crew page and to existing signed-link sessions (open a fresh signed link to verify).
- [ ] **Step 7: Exercise Discard path on the other.** Confirm Discard leaves prior state intact.

Run J2 twice — once light + desktop, once dark + mobile.

---

### Task 1.6: J3 — Signed-link crew end-to-end (real device leg)

Per spec §5.3 R20/R22.

- [ ] **Step 1: Mint a 15-minute valid baseline link** for `alias_5a_lead` (NOT alias_5a_lead_for_revoke).

```bash
URL=$(pnpm -s validation:mint-link --combo R1 --alias alias_5a_lead --expires-in 900 | jq -r .url)
```

- [ ] **Step 2: Open on real iPhone Safari** within 15 min. Browse every documented tile. Note tile rendering correctness.

- [ ] **Step 3: Generate a SECOND signed link for a non-LEAD scope variant** (e.g., A1 via `alias_6a_a1`). Open on iPhone. Verify role-hiding: financials hidden, scope tile (Audio) visible.

- [ ] **Step 4: Test expired-link path:**

```bash
URL=$(pnpm -s validation:mint-link --combo R1 --alias alias_5a_lead --expires-in -3600 | jq -r .url)
```

Open on iPhone. Expect LINK_EXPIRED 401 surface.

- [ ] **Step 5: Test revoked-link path (uses DEDICATED alias):**

```bash
URL=$(pnpm -s validation:mint-link --combo R1 --alias alias_5a_lead_for_revoke --expires-in 900 | jq -r .url)
pnpm validation:revoke-link "$URL"
```

Open the URL on iPhone. Expect "not on crew list" 401 surface per master spec §7.

- [ ] **Step 6: Test query-token compromise leg (uses DEDICATED alias):**

```bash
URL=$(pnpm -s validation:mint-link --combo R1 --alias alias_5a_lead_for_query_compromise --expires-in 900 | jq -r .url)
# Rewrite the URL to the compromised query-token form:
COMPROMISED=$(echo "$URL" | sed 's|/p#t=|/p?t=|')
```

Open the compromised URL on iPhone. Expect master spec §7 compromise path: `leaked_query_token` revocation + 401 surface.

- [ ] **Step 7: NO commit.** Notes go in working notes.

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

### Task 1.10: Phase 1 close → iteration loop (Phase 8)

If MUST-FIX list is non-empty, proceed to `08-iteration-and-final-sweep.md`. If MUST-FIX is empty after the initial sweep (unlikely but possible), proceed directly to "final sweep + sign-off" sections of Phase 8.

---

## Phase 1 failure modes

- **Walk-session gate fails repeatedly.** Re-seed is failing — return to Phase 0.C to diagnose.
- **The matrix is overwhelmingly large.** Honor the §3.4 coverage policy (FULL / PAIRWISE / SMOKE-SAMPLE per axis). MATRIX-INVENTORY.md's per-row coverage class is the canonical guidance.
- **A finding is ambiguous between MUST and SHOULD.** Default-up. If still unclear, ask: "would Doug's confidence in the product be shaken by this?" Yes → MUST.
- **The dev catches themselves shortcutting during cold-start.** That IS the finding. Note it; don't excuse it.
