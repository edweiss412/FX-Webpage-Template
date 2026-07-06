# Alert resolve-truthing — Close-out record

Standalone feature (no milestone handoff doc), so the invariant-8 impeccable dispositions live here.

**Feature:** manual-resolve button reflects true auto-resolvability + finish the `GITHUB_BOT_LOGIN_MISSING` auto-resolver.
**Branch:** `feat/alert-resolve-truthing` (rebased onto `origin/main`).
**Spec:** `docs/superpowers/specs/alerts/2026-07-04-alert-resolve-truthing.md` (APPROVED, 3 Codex rounds).
**Plan:** `docs/superpowers/plans/alerts/2026-07-04-alert-resolve-truthing/plan.md` (APPROVED, 6 Codex rounds).

## Test posture (Task 9 Step 1-2)

- `pnpm typecheck` — 0 errors.
- `pnpm format:check` — clean (repo-wide).
- `pnpm vitest run` — **6 failed / 11162 passed / 34 skipped**. All 6 failures are **pre-existing live-DB-integration** tests that require a fully-seeded local Supabase this worktree lacks, verified identical at the pre-work baseline and untouched by this diff (which adds zero schema/migration/RPC/cron): `tests/cross-cutting/email-canonicalization.test.ts` (1, "live project AC-X.5 audit layers"), `tests/cross-cutting/pg-cron-coverage.test.ts` (2, `cron.job` table contents), `tests/admin/test-auth-gate.test.ts` (3, Layer-2 HTTP session integration). Real CI provisions these and is the authoritative gate.
- Meta-test fragility sweep (`tests/messages/ tests/admin/ tests/adminAlerts/`): all structural meta-tests green (`_metaAdminAlertCatalog` incl. the new resolution-parity + manual-copy guards, `_metaManualResolveRegistry` broadened to `isAutoResolving`, `_metaInfraContract`, the new `resolveAutoCodeGuard`), except the same 3 pre-existing `test-auth-gate` env failures.
- The real-browser Playwright layout spec (`tests/e2e/alert-banner-autoresolve-layout.spec.ts`) is structurally identical to the CI-proven `alert-identity-banner-layout.spec.ts` and registered in both projects; it cannot render the AlertBanner locally because the locally-minted test-auth JWT does not satisfy the banner's RLS SELECT (the CI-proven identity control fails locally the same way). Authoritative validation is real CI (per AGENTS.md "local≠CI is its own gate").

## Impeccable dual-gate (invariant 8)

**Run date:** 2026-07-05. **Surfaces:** the three UI files this feature changed — `components/admin/AlertBanner.tsx`, `components/admin/PerShowAlertSection.tsx`, `components/admin/telemetry/HealthAlertsPanel.tsx`. Both gates were run as **external, isolated assessments** (independent sub-agents + the bundled deterministic detector), not self-attested. Register: **product** (admin dashboard). Preflight: context=pass (PRODUCT.md/DESIGN.md loaded) · product=pass · command_reference=pass · register=product.

### `/impeccable critique` — AI-slop **PASS**, Nielsen **36/40**

- **Assessment B (deterministic detector, `npx impeccable --json`):** `[]` — zero findings across all three files.
- **Assessment A (LLM design review):** AI-slop PASS; heuristic total 36/40; **P0: none · P1: none**.
  - **[P2] Cross-surface note type-size parity** — the banner auto-clear note lacked an explicit `text-xs` while the per-show/health notes carry it. **Disposition: FIXED in this commit** (`AlertBanner.tsx` note → `basis-full text-xs text-text-subtle`; it already inherited `text-xs` from the footer container, so this is code-level consistency, harmless-redundant per the audit).
  - **[P2] Collapsed-banner note placement** — the auto-clear note lives in the expanded `<details>` panel, so the collapsed banner shows no affordance where the button was. **Disposition: NOT A DEFECT — intentional, ratified design.** Spec §4.5 specifies the note is expanded-panel-only *by design*: the collapsed banner shows the message + Details caret and deliberately renders **no** action affordance for a non-watch auto code (honest — no misleading button). The real-browser Playwright spec asserts the note is genuinely visible only after opening the panel. Do-not-relitigate.
  - **[P3] `text-text-subtle` contrast / "No action is needed here." copy** — the note is secondary copy (the full alert message renders above it), `text-text-subtle` is the established subtle-status token used identically by the sibling notes; both reviewers judged it acceptable. Copy left as-is (brand-voice nit only). No change.

### `/impeccable audit` — **20/20 (EXCEPTIONAL)**, anti-patterns **PASS**

Accessibility 4 · Performance 4 · Responsive 4 · Theming 4 · Anti-Patterns 4. **P0: none · P1: none · P2: none.** Verified: the swap from `<button>`-in-`<form>` to a non-interactive `<p>` is a clean semantic change (no ARIA/heading regression); tokens only (`text-text-subtle`, `text-xs`), no hard-coded color, light+dark safe; `text-xs` note wraps at 390px with no overflow and no touch-target obligation (non-interactive); **no em dashes** in any of the 5 per-code notes or the generic fallback in `lib/adminAlerts/audience.ts`; no side-stripe borders or AI-slop tells; fail-visible design (unknown/uncataloged codes keep the manual button) honors invariant 5.
  - **[P3] Redundant `text-xs`** — the banner note repeats `text-xs` already present on its parent footer. Harmless; kept for robustness if the parent changes. No change.

### Invariant-8 verdict

Zero HIGH/CRITICAL (P0/P1) across both gates. The single actionable P2 was fixed in-commit; the second P2 is a ratified spec-§4.5 design decision (documented above, no `DEFERRED.md` entry required since no HIGH/CRITICAL was deferred). This record lands **before** the Stage-4 whole-diff cross-model review.
