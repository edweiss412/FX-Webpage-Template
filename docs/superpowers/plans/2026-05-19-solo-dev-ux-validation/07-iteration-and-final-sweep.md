# Phase 1 iteration loop + final sweep + sign-off

> Per spec §7.2 + §7.2.1 + §7.2.2 + §7.2.2.1 + §7.3 + §8. Estimate: 5–30 hours over multiple iterations.
>
> Goal: fix MUST-FIX → targeted re-exercise → loop until empty → final full sweep → sign-off.

---

### Task 2.1: Iteration cycle — for each MUST-FIX finding

Per spec §7.2. Run this cycle for each MUST-FIX finding until the list is empty.

For each MUST-FIX:

- [ ] **Step 1: Identify the fix scope.** Which files need to change? Which spec section governs?
- [ ] **Step 2: Apply project invariant 8 (impeccable v3 UI gate) if the fix touches UI** — `/impeccable critique` + `/impeccable audit` on the diff before commit.
- [ ] **Step 3: Apply project invariant 9 (Supabase call-boundary discipline)** if the fix touches a Supabase helper — register in `_metaInfraContract.test.ts` if new helper.
- [ ] **Step 4: Write the fix in TDD style** (failing test → minimal implementation → passing test → commit).
- [ ] **Step 5: Apply §7.2.2 + §7.2.2.1 consumer-enumeration rule.** Before targeted re-exercise:
  - For catalog / auth / design-token / component / single-page / schema-migration changes, run the appropriate grep recipe per the table.
  - For schema migrations specifically, run the §7.2.2.1 8-vector recipe (Supabase JS `.from()` literal + schema-qualified + non-literal + `.rpc()` + server-side SQL + generated types + helper-by-import-grep + test fixtures).
  - Map every match to MATRIX-INVENTORY rows.
- [ ] **Step 6: If >25% of MATRIX-INVENTORY rows match the consumer enumeration,** auto-escalate to a FULL SWEEP instead of targeted re-exercise (per spec §7.2.2 escalation rule).
- [ ] **Step 7: Otherwise, targeted re-exercise:** walk the matched rows + any journey that crosses them.
- [ ] **Step 8: Re-triage findings from the re-exercise.** New MUST-FIX → repeat cycle. New SHOULD-FIX → working list.

---

### Task 2.2: Walk-session gate before each targeted re-exercise

Per spec §3.3 step 5.

- [ ] Run `pnpm validation:check-seed` before each re-exercise session. Re-seed if stale.

---

### Task 2.3: Loop until working MUST-FIX list is empty

- [ ] **Step 1: After every fix iteration, re-evaluate the working MUST-FIX list.**
- [ ] **Step 2: When the list is empty, proceed to the final sweep (Task 2.4).**

---

### Task 2.4: Final full sweep (24h cooldown discipline)

Per spec §7.2 step 7.

- [ ] **Step 1: Wait at least 24h** since the last fix-touch on M12 surfaces. The cooldown reduces "I just stared at this; everything looks normal" blindness.
- [ ] **Step 2: Walk-session gate.** Run `pnpm validation:check-seed --combo all`. Reseed if stale.
- [ ] **Step 3: Re-walk the full matrix** per Phase 1 Task 1.2 — every band, every persona, every applicable role × restriction sample.
- [ ] **Step 4: Re-run all 4 journeys** (J1, J2, J3 with all 3 negative-auth legs, J4) — once light + desktop, once dark + mobile.
- [ ] **Step 5: Re-run the cold-start pass** (Phase 1 Task 1.8) — fresh browser profile, /help-as-map.
- [ ] **Step 6: Triage any new findings.** If the final sweep surfaces ANY new MUST-FIX, return to Task 2.1 (iteration cycle) and repeat. Sign-off is gated on a CLEAN final sweep — ZERO new MUST-FIX (per spec §7.2 step 7).

---

### Task 2.5: Disposition SHOULD-FIX + NICE-FIX (per spec §7.3)

Per spec §7.3 + memory `feedback_deferral_discipline.md`.

For each remaining SHOULD-FIX or NICE-FIX:

- [ ] **Step 1: Determine the routing:**
  - Has a concrete trigger or planned milestone home → `DEFERRED.md` of an existing plan, or this milestone's `DEFERRED.md`
  - Speculative, no home, no trigger → root `BACKLOG.md`
  - Accepted as a known limitation (intentional choice) → one-sentence note in SIGN-OFF.md appendix
- [ ] **Step 2: Add to the appropriate file.** Capture the reason for the routing decision.
- [ ] **Step 3: NICE-FIX items not worth keeping** can be silently discarded; the working list is informal.

---

### Task 2.6: Author SIGN-OFF.md

**Files:**
- Create: `docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/SIGN-OFF.md`

Per spec §8.1. The single required exercise artifact. One paragraph (or short list) containing:

- [ ] **Step 1: Explicit assertion that the full matrix was walked.**
- [ ] **Step 2: Explicit assertion that all four journeys (J1–J4) were run end-to-end,** including the real-iPhone leg of J3 and all three negative-auth sub-legs.
- [ ] **Step 3: Explicit assertion that the cold-start pass ran at least twice** with cooldown discipline (initial sweep + final sweep).
- [ ] **Step 4: Explicit assertion that MUST-FIX is empty at sign-off time.**
- [ ] **Step 5: Reference where SHOULD-FIX / NICE-FIX items were routed** (DEFERRED.md / BACKLOG.md / accepted-as-known-limitations).
- [ ] **Step 6: The subjective dev sign-off in the dev's own words:** "I would be proud to show this to Doug" or a personally-meaningful equivalent. **This sentence is load-bearing.** If the dev wouldn't write it, the milestone is not done.
- [ ] **Step 7: (Optional) Anything to flag to a future reader** — themselves on a future milestone; a reviewer; Doug at handover.
- [ ] **Step 8: If Phase 0 budget-gate was tripped** (per spec §9.0), record the chosen recovery option (1/2/3) and (if 2 or 3) the user approval reference.

Skeleton:

```markdown
# M12 Solo-Dev UX Validation — Sign-Off

**Date:** YYYY-MM-DD

**Assertion 1 — Matrix walked.** I walked the full matrix per
MATRIX-INVENTORY.md. ≈<N> cells exercised across <K> sessions.

**Assertion 2 — Journeys completed.** J1 (cold-start admin via /help),
J2 (pending-sync triage), J3 (signed-link real-iPhone, including
expired/revoked/query-compromise negative-auth legs), J4 (preview-as-
crew double-check) all run end-to-end on both light+desktop and
dark+mobile. J3's real-iPhone leg ran on my physical iPhone <model>.

**Assertion 3 — Cold-start pass.** Ran 2+ times with 24h+ cooldown:
once during initial sweep, once during final sweep.

**Assertion 4 — MUST-FIX empty.** Final sweep produced zero new
MUST-FIX findings.

**Routing of remaining findings:**
- SHOULD-FIX → `DEFERRED.md` entries: <list> | `BACKLOG.md` entries: <list>
- NICE-FIX → `BACKLOG.md` entries: <list>, or discarded as polish-only
- Accepted as known limitations: <list with one-sentence reasons>

**Phase 0 budget-gate disposition** (if tripped):
- [N/A — Phase 0 closed within 10 days]
- OR: Option <1|2|3> taken. <If 2 or 3: user approval reference quote.>

**Subjective sign-off:**

> I would be proud to show this to Doug.
>
> — <dev>
```

- [ ] **Step 9: Commit:**

```bash
git add docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/SIGN-OFF.md
git commit -m "$(cat <<'EOF'
signoff(m12): sign off on M12 solo-dev UX validation

Matrix walked. J1-J4 + cold-start pass × 2 all complete. MUST-FIX
empty. Subjective gate: I would be proud to show this to Doug.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.7: M12 close-out

- [ ] **Step 1: Update `docs/superpowers/plans/README.md`** to mark M12 closed.
- [ ] **Step 2: Update the top-level project status** in CLAUDE.md / AGENTS.md / README if applicable.
- [ ] **Step 3: Update `BACKLOG.md`** with any newly-promoted items (post-walk SHOULD-FIX entries that need a real spec/plan cycle).
- [ ] **Step 4: The v1-launch milestone** (M13 — distinct from M12) becomes the next gate. Per spec §1.5, Doug's first use of the product is the v1-launch milestone, which consumes M12's sign-off as a prerequisite.

---

### Task 2.8: Re-open condition (per spec §8.2)

If between sign-off and the v1-launch milestone the dev encounters a MUST-FIX they missed, M12 re-opens.

- [ ] **Step 1: Document the re-open** as an appendix to `SIGN-OFF.md`:

```markdown
## Re-open <YYYY-MM-DD>

**Triggering finding:** <description>

**Fix:** <commit ref>

**Re-exercise:** <surfaces walked>

**Updated sign-off:** I would still be proud to show this to Doug.

— <dev>
```

- [ ] **Step 2: Re-commit SIGN-OFF.md** with the appendix.

---

## Phase 8 failure modes

- **The final sweep keeps surfacing new MUST-FIX.** Each iteration introduces new issues. Possible causes: (a) targeted re-exercise scope is too narrow — escalate to full sweep more often; (b) the fix is introducing regressions — slow down, review the fix more carefully; (c) the matrix coverage was too thin in initial sweep — accept that the M12 budget is non-trivial.
- **The dev cannot write the subjective sign-off sentence.** The milestone is NOT done. Continue iteration. The sentence's purpose is to force a confidence check that a bug-list cannot.
- **Phase 0 budget-gate options 2/3 are needed.** Surface the decision to the user; do not take it unilaterally. Per spec §9.0 R25 amendment.
