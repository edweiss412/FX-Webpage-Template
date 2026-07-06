# Phase 6 — Layout + transition audit + impeccable gate (spec §7, §8, inv. 8)

Verify the folded modal + footer render correctly across breakpoints and states, then run the mandatory UI-quality dual-gate before Stage-4 cross-model review.

---

### Task 6.1: Real-browser layout assertion (spec §8; AGENTS.md writing-plans layout rule)

The folded modal + footer reuse existing layout components; no NEW fixed-dimension parent is introduced, but row-status badges are added to the grid and the footer gains checkpoint modes. jsdom is insufficient — assert real layout.

**Files:**
- Create: `tests/e2e/step3-unified-layout.spec.ts`

- [ ] **Step 1: Write the failing test** (Playwright) — render the unified Step-3 at mobile (390px) + desktop (1280px):
  - the footer center reserves its min-height (`[data-testid="wizard-step3-footer-center"]` `getBoundingClientRect().height >= 48` per `min-h-12`);
  - opening the modal on a re-apply row shows the resolution footer (Approve & apply / Re-scan / Ignore) with no horizontal overflow (`document.documentElement.scrollWidth <= clientWidth + 0.5`);
  - row-status badges are present in the grid.
  Use the project's e2e harness pattern (self-deriving seed, per feedback_self_deriving_e2e). Pin the runner env per feedback_byte_comparison_ci_gates if any screenshot is captured (prefer non-screenshot getBoundingClientRect assertions).

- [ ] **Step 2: Run — verify fail / then pass** (`pnpm test:e2e tests/e2e/step3-unified-layout.spec.ts` or the repo's e2e command).

- [ ] **Step 3: Commit**
```bash
git add tests/e2e/step3-unified-layout.spec.ts
git commit --no-verify -m "test(admin): real-browser layout assertion for unified Step-3 (spec §8)"
```

---

### Task 6.2: Transition audit (spec §7 Transition Inventory)

The modal has `AnimatePresence`/CSS-driven enter/exit and the footer swaps idle→tracking→terminal + Publish/Resume/Finish. Audit every conditional render for correct enter/exit or deliberate-instant, and test the compound case (modal mutation blocked while a run is active — already covered by Task 2.4, re-assert as a transition).

**Files:**
- Create/extend: `tests/components/admin/wizard/Step3TransitionAudit.test.tsx`

- [ ] **Step 1: Write the test** — enumerate each `AnimatePresence`/ternary/`{cond && …}` in `Step3ReviewModal` + `Step3ReviewWithFinalize` footer; assert each has `exit`/`initial`/`animate` or is deliberately instant (spec §7 table):
  - Ready→In-progress→Live/Held badge crossfade;
  - Needs-review → modal open (dialog enter);
  - modal → Ready/Live/Held on Approve success (close + refresh);
  - pre-finalize→mid-finalize→batches-complete footer swap;
  - compound: ALL modal mutators disabled while `run.isRunning` (re-assert from Task 2.4 as the spec §7 compound row).

- [ ] **Step 2: Run — verify pass.** - [ ] **Step 3: Typecheck.**

- [ ] **Step 4: Commit**
```bash
git add tests/components/admin/wizard/Step3TransitionAudit.test.tsx
git commit --no-verify -m "test(admin): transition audit for folded modal + checkpoint footer (spec §7)"
```

---

### Task 6.3: Impeccable dual-gate (AGENTS.md invariant 8) — MANDATORY before Stage-4 review

The diff is UI-heavy (files under `app/` non-api + `components/`). Run BOTH `/impeccable critique` AND `/impeccable audit` on the affected diff. HIGH/CRITICAL findings fixed or deferred via `DEFERRED.md`. This is a manual gate, not an automated test.

- [ ] **Step 1** — Run `/impeccable critique` on the Step-3 diff (`Step3Review`, `Step3ReviewModal`, `Step3ReviewWithFinalize`, `Step3SheetCard`, row badges, footer). Preflight gates: PRODUCT.md / DESIGN.md / register / signal.
- [ ] **Step 2** — Run `/impeccable audit` on the same diff (a11y, responsive, perf).
- [ ] **Step 3** — Fix every HIGH/CRITICAL, or record an explicit `DEFERRED.md` entry with rationale. Record findings + dispositions in the milestone handoff/§12 per invariant 8.
- [ ] **Step 4: Commit** any impeccable fixes.
```bash
git add -A
git commit --no-verify -m "fix(admin): impeccable critique+audit findings on consolidated Step-3 (inv. 8)"
```

---

## Stage-4 close-out (handled by /ship-feature, not a plan task)

After Phase 6: whole-diff Codex adversarial review → APPROVE; push; real CI green; `gh pr merge --merge`; fast-forward local `main` (`git rev-list --left-right --count main...origin/main` == `0  0`); update MEMORY. Pre-push checklist: `pnpm tsc --noEmit` + `pnpm lint` + `pnpm format:check` + full `pnpm test` (feedback: typecheck/lint/format/full-suite all bypassed by `--no-verify`).
