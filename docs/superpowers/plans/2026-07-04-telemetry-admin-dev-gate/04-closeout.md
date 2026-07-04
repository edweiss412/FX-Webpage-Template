# Phase P3 — Close-out (Tasks 11–14)

Whole-milestone gates. Per AGENTS.md the invariant-8 impeccable dual-gate runs on the UI diff BEFORE the cross-model adversarial review, and the adversarial-review task sits BETWEEN self-review and execution handoff.

---

### Task 11: Whole-milestone self-review + full audit-gate sweep

Implements spec §7. A fresh-eyes pass over the ENTIRE diff (both parts) — distinct from the per-task gates — catches cross-part composition bugs (e.g. a rename that left a §12.4 row stale, an advisory-lock regression from the re-created RPCs, a Part-A gate the inventory missed).

- [ ] **Step 1: Full suite** — `pnpm vitest run` (unit/integration) → all green. `pnpm typecheck` clean (vitest strips types — a TS error passes vitest but fails `next build`). `pnpm format:check` clean (`--no-verify` commits skipped the prettier hook).
- [ ] **Step 2: Targeted audit-gate sweep (spec §7)** — confirm each REQUIRED gate green:
  - `tests/cross-cutting/auth-chain-audit.test.ts` (x3-trust-domain: route rename + PROTECTED_ROUTES),
  - `tests/auth/developerGatingContract.test.ts` (enforcement-2 flip + enforcement-4 RPC-SQL guard + telemetry-dim/telemetry-page registry),
  - `tests/auth/advisoryLockRpcDeadlock.test.ts` (new migration registered),
  - `tests/db/validation-schema-parity.test.ts` (Part-B migration applied to validation),
  - `tests/cross-cutting/codes.test.ts` (x1 §12.4 lockstep, 2 rows),
  - `tests/admin/build-artifact-gate.test.ts` (telemetry present, dev-only trio absent),
  - `tests/cross-cutting/no-raw-codes.test.ts` (telemetry now crawled),
  - `tests/admin/dev-route-prod-classification.test.ts` (NEW structural guard),
  - `tests/db/postgrest-dml-lockdown.test.ts`, `tests/db/admin-mgmt-requires-developer.test.ts`, `tests/db/admin-mgmt-developer-concurrency.test.ts`.
- [ ] **Step 3: Invariant spot-checks** — grep the diff for regressions against the Global Constraints: no `public.is_developer()` in a roster-mutation actor path; `admin_emails` DML still REVOKE'd (no grant added); master spec not prettier'd; no new `.toLowerCase()`/`.trim()` in `lib/drive`/`lib/sync` without `// canonicalize-exempt`; the `observe` namespace untouched. Note results in the handoff §12.
- [ ] **Step 4: Real-browser layout/render confirmation (LIGHT — the move is render-unchanged).** Run the renamed real-browser spec `pnpm exec playwright test tests/e2e/telemetry-layout.spec.ts` (or the project's Playwright invocation) against `/admin/dev/telemetry` → the pre-existing observability layout invariants still hold (no new layout). **ALSO run `pnpm exec playwright test tests/e2e/developer-tier.spec.ts` (Codex plan-R3 — it holds the renamed "Telemetry" nav assertions from Task 8's sweep; the close-out must actually EXECUTE it, not just assume it, so a stale "Activity" assertion can't slip through).** Confirm the AdministratorsSection non-developer render (Task 6) via its jsdom test (already green) — no dimensional change, so no new real-browser layout task is warranted (per spec §7 + the UI reuses developer-tier-covered `viewerIsDeveloper` plumbing).
- [ ] **Step 5:** If any gate is red, fix under TDD in a new commit (do NOT amend a pushed commit; a fresh commit per fix). No commit if all green (this is a verification checkpoint).

---

### Task 12: Impeccable v3 dual-gate on the UI diff (invariant 8)

The UI surfaces this milestone: `components/admin/settings/AdministratorsSection.tsx` (management-control gating), `components/admin/nav/navConfig.ts` (nav label), the moved telemetry page + its `components/admin/telemetry/**`, and the settings Diagnostics link. Run BOTH `/impeccable critique` AND `/impeccable audit` on the affected diff with the canonical v3 preflight gates (PRODUCT.md → DESIGN.md → register → preflight signal). HIGH/CRITICAL findings are fixed OR explicitly deferred via a `DEFERRED.md` entry.

- [ ] **Step 1:** Run `/impeccable critique` on the UI diff → capture findings.
- [ ] **Step 2:** Run `/impeccable audit` on the UI diff → capture findings (external attestation; not self-attested).
- [ ] **Step 3:** Fix HIGH/CRITICAL or file `DEFERRED.md` entries; record findings + dispositions in the milestone handoff §12. This runs BEFORE the cross-model adversarial review.
- [ ] **Step 4:** Commit any fixes (`--no-verify`; conventional commits).

---

### Task 13: Adversarial review (cross-model) — MANDATORY, orchestrator-run

Per AGENTS.md, this task sits BETWEEN self-review (Task 11) and execution handoff (Task 14). The ORCHESTRATOR runs it (Codex, since the implementer is Claude). Do NOT proceed to handoff without an APPROVE.

- [ ] **Step 1:** Invoke the `adversarial-review` skill / `/codex:adversarial-review` on the whole diff with a fresh-eyes brief. Include an `EXPLICITLY DO NOT RELITIGATE` block citing the ratified contracts at `file:line`:
  - Naming stays mixed (admin route = `telemetry`, shared query core = `observe`) — spec §1/§2.2 (intentional, not an oversight).
  - Historical `docs/**-observability-*` left untouched — spec §1.
  - `/admin/dev/telemetry` is the DELIBERATE prod-available exception under `/admin/dev` — spec §2.1a (three prior rounds; the `dev-route-prod-classification` structural test pins it).
  - The §3.3 non-developer read-only else-branch + `RevokedRow` prop threading — 00-overview "Plan-of-record deviations" #1/#2 (faithful resolution of an implicit spec else-branch, not a redesign).
  - The §12.4 two-location edit (table row + helpfulContext appendix) — 00-overview deviation #3.
  - REVIEWER ONLY — reviewer does not fix; surfaces findings for a separate implementer dispatch.
- [ ] **Step 2:** Iterate until Codex APPROVE (no round budget for autonomous ship). Route findings via deferral discipline (land-now / DEFERRED.md / BACKLOG.md). Same-vector recurrence (3 rounds) triggers comprehensive re-analysis + structural defense in that round's repair commit (AGENTS.md).

---

### Task 14: Execution handoff → CI → merge → ff main

Per the AGENTS.md autonomous-ship pipeline. Both user-review gates (spec, plan) are WAIVED for this feature; stop only for a genuine unresolvable ambiguity.

- [ ] **Step 1: Push** the branch. Confirm `pnpm format:check` + `pnpm typecheck` ran (the `--no-verify` commits skipped the hook).
- [ ] **Step 2: Real CI green (separate gate from local).** `gh pr create`; watch with `gh pr checks <PR#> --watch` (pass the PR NUMBER, not a SHA — a SHA `--watch` exits 0 instantly = false green). Confirm `mergeStateStatus == CLEAN`. Watch specifically: `x1-catalog-parity`, `x3-trust-domain`, `validation-schema-parity`, `postgrest-dml-lockdown` (the 35s per-test timeout applies), `build-artifact-gate`, `no-raw-codes`, and the dev-gate-e2e workflow (the §2.1a e2e href narrowing). If a PR is behind base (DIRTY), rebase before relying on `pull_request` runs.
- [ ] **Step 3: Merge** — `gh pr merge --merge` (never squash). Then fast-forward local `main` and verify `git rev-list --left-right --count main...origin/main == "0  0"`.
- [ ] **Step 4: Handoff doc** — record the accepted-risk supersession (spec §3.4: admin-roster mutation is now developer-only; the developer-tier §14 "any admin can revoke any admin" §5.5 risk is CLOSED — a normal admin can neither add a rogue admin nor revoke a developer; self-revoke stays unconditionally forbidden so a lone developer cannot lock themselves out; re-seed on total lockout remains the migration bootstrap `edweiss412` is_developer=true). Record the impeccable findings/dispositions (§12) and the Codex APPROVE.
