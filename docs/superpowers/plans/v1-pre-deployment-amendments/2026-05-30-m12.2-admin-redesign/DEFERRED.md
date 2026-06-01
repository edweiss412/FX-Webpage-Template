# DEFERRED — M12.2 admin redesign (B1 + later sub-milestones)

Per-plan deferrals: items that WILL be done with a concrete trigger (distinct from BACKLOG.md, which is speculative/project-wide). See `[[feedback_deferral_discipline]]`.

## Open

### B1-D1 — Per-show `<AdminPageHeader>` density at the 720px flex-row boundary

**Status:** Open. **Trigger:** live measurement during the M12 UX-validation walk (or the next per-show eyeball) of `/admin/show/[slug]` with a long show title at viewports straddling 720px.

**Source:** M12.2 B1 impeccable v3 dual-gate (critique, P2), 2026-06-01 (external subagent attestation).
**Description:** The per-show header renders the `text-2xl` title + Published/Archived pill + the full crew-link chip (label + share code + copy button) in one `AdminPageHeader` flex row. On a long show title at the desktop/mobile boundary these may compete for horizontal space. The Task 9.1 real-browser layout-dimensions sweep asserts no horizontal overflow and no track collapse across `[600,719,720,860,1024,1280]` at the seeded fixture's title length, so there is no *measured* overflow today — but a longer real-world title was not exercised. Matches the Phase-A title-collapse memory pattern: **measure before prescribing a breakpoint/wrap fix** (`[[feedback_layout_gate_band_sweep_and_constant_width_heuristic]]`).
**Resolution (when triggered):** if a long title competes, wrap the chip below the title at the boundary (or truncate the title with a tooltip) — token-only, verified by extending the Task 9.1 sweep with a long-title fixture. Do NOT introduce a global `md` breakpoint.

### B1-D2 — `SYNC_STATUS_UNKNOWN` cataloged copy is latent (helper carries the code; panel renders the generic line)

**Status:** Open (spec-internal tension; needs an owner design call). **Trigger:** the next DriveConnectionPanel iteration, or when a per-show sync-state help affordance / `<ErrorExplainer>` is added to the settings Drive panel.

**Source:** M12.2 B1 whole-milestone fresh-eyes pass (MEDIUM), 2026-06-01.
**Description:** `fetchDriveConnectionHealth()` correctly classifies the `sync_unknown` tier and carries `code: "SYNC_STATUS_UNKNOWN"` on the warn result (used + pinned by `tests/admin/driveConnectionHealth.test.ts` case n). But `DriveConnectionPanel.deriveStatusLine` renders the GENERIC reason-based line for `sync_*`/`stale_*`/`sync_unknown` ("Syncing, but {attentionCount} show(s) need attention") **per spec §3.1's explicit status-line mapping**, and never reads `health.code`. So `SYNC_STATUS_UNKNOWN`'s dougFacing ("A show's sync state isn't recognized; the developer should take a look.") is unreachable in the UI — the only one of the 5 new B1 codes with no live render path. This is a SPEC tension, not an impl bug: §3.1 both (a) says the helper "carries the catalog code" and (b) prescribes a generic status line for the `sync_unknown` group. The implementation faithfully followed (b). Per invariant 7 (spec canonical), this was NOT silently changed.
**Resolution (when triggered):** owner decides — either (i) surface `SYNC_STATUS_UNKNOWN`'s specific developer-attention copy for the `sync_unknown` reason (a ratified §3.1 status-line amendment, since `sync_unknown` is a developer-attention state distinct from routine staleness), wired via `getRequiredDougFacing(health.code)` + a `validateRenderedHelpfulContext` render path; or (ii) accept the generic line and document `health.code` as a typed-classification field (not a render source), keeping `SYNC_STATUS_UNKNOWN` for the helper's tier identity + tests. The §12.4 parity gate is satisfied either way (the row is cataloged); no gate is currently failing.

### B1-D3 — Dashboard infra-error double-header

**Status:** Open (LOW; pre-existing Phase A behavior surfaced by the new shared header). **Trigger:** next dashboard polish pass, or if the doubled header is observed during a real dashboard infra-fault.

**Source:** M12.2 B1 whole-milestone fresh-eyes pass (LOW), 2026-06-01.
**Description:** When `fetchDashboardData()` returns `infra_error`, `Dashboard` renders its own error `<main>` (with an "Admin" eyebrow + "We could not load your dashboard" heading) while `DashboardWithHeader` (`app/admin/page.tsx`) has already rendered `<AdminPageHeader title="Dashboard">` above it — so the infra-error case stacks two header blocks. Pre-existing Phase A behavior; B1's shared `AdminPageHeader` makes it visible. Not a B1 regression (the steady-state Dashboard title was correctly removed; this is only the infra-error branch).
**Resolution (when triggered):** suppress the `AdminPageHeader` (or its eyebrow) in the dashboard infra-error branch, OR drop the error block's redundant eyebrow so only one header renders.

### B1-D4 — Dev-gate 3-build Playwright e2e has no CI workflow

**Status:** Open. **Trigger:** next CI-hardening pass, or before relying on the dev-panel build gate as a release blocker.

**Source:** M12.2 B1 close-out (orchestrator), 2026-06-01.
**Description:** The `dev-build` / `prod-build` / `prod-runtime-flip` Playwright projects (`tests/e2e/admin-dev.spec.ts`) verify the build-vs-runtime contract end-to-end, but NO `.github/workflows/*` runs them (only `screenshots-drift.yml` uses Playwright, for captures). They cannot run reliably locally either: Playwright starts all 4-5 webServers at once, each doing `pnpm build` serialized on the shared dev-flag lock, and the 4th build exceeds `acquireLockWithRetry`'s 240s wait. The B1 lock-location fix (B1 §12.2 #3) removed the distDir-clean deletion RACE, but not the 4-serialized-builds timeout. The contract is currently pinned by unit/structural tests (`build-artifact-gate.test.ts`, `devSpecNonEmpty.test.ts`, `withAdminDevFlagLockLocation.test.ts`, `withAdminDevFlagDevPanelPresent.test.ts`) — not the 3-build integration e2e.
**Resolution (when triggered):** add a `workflow_dispatch` (+ optionally PR) CI job that runs the three dev-gate projects on a native-amd64 runner (mirror `screenshots-drift.yml`'s supabase+GUC setup), and/or bump the `acquireLockWithRetry` timeout / run the projects sequentially so the serialized builds fit. Then mark plan Task 8.4 Steps 3-4 + the "Real CI green (dev-gate)" exit criterion satisfied.
