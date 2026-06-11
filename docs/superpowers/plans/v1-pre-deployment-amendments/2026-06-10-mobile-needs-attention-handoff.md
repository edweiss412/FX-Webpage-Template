# Mobile "Needs attention" page + bottom-nav tab (#11) — close-out handoff

Milestone executed 2026-06-10 on branch `spec/mobile-needs-attention`. Spec adversarially APPROVED R7; plan APPROVED R4; implementation subagent-driven (Opus implements, two-stage review per task, Codex whole-milestone review per §13 below).

## 1. Scope shipped

- `lib/admin/loadNeedsAttention.ts` — extracted dashboard inbox assembly (cap-parameterized, typed `infra_error`, internal client construction, null-head-count integrity guard) + `lib/admin/needsAttention.ts` additive fields (`ingestionTotal`/`syncTotal`, `PAGE_RENDER_CAP = 100`)
- `lib/admin/needsAttentionCount.ts` + `app/api/admin/needs-attention-count/route.ts` — badge count helper + admin-gated GET
- Nav: third mobile tab (`attention`, `mobileOnly`), badge (9+ cap, aria-label count, height-neutral), `useNeedsAttentionBadge` (initial server prop + pathname refetch + prop-change sync + token/abort stale suppression)
- `app/admin/needs-attention/page.tsx` + `loading.tsx` — header + alerts + full inbox (cap 100); AlertBanner placement contract amended to dashboard + this page (D-5)
- `components/admin/NeedsAttentionSummaryCard.tsx` + Dashboard dual render at the 720px boundary (exact stream-total chips)
- Structural registries (same-commit): `PROTECTED_ROUTES` ×2, `tests/admin/_metaInfraContract.test.ts` ×2, `tests/admin/_metaBoundedReads.test.ts` loader row
- E2E: band-sweep extensions (4 dimensional invariants, 30/30) + `needs-attention-page.spec.ts` (nav flow + soft-nav + same-route badge freshness, 12/12)
- Help: review-queues "On your phone" section + `needs-attention-mobile` manifest entry + mobile baselines (pinned-docker amd64 capture)

## 6. Watchpoints / execution lessons

- **Local screenshot capture requires a fresh DB.** `pnpm db:seed` deletes only seed-prefixed rows (`supabase/seed.ts:521-528`); residue shows/pending rows from prior test runs render into `dashboard-overview`/`review-queues-empty-state` captures and break byte-parity with the CI baselines. Durable fix recorded: run the CI-equivalent fresh-DB prelude (cron-migration hold-aside → `supabase db reset --no-seed` → GUC via supabase_admin → `migration up --include-all` → `pnpm db:seed`) before every local capture.
- **Pre-existing, NOT this milestone:** the no-JS e2e test in `admin-banner.spec.ts` ("no-JS native summary") fails since M12.11 (`f2f7f7b4`) — `app/admin/loading.tsx` + suspense streaming requires JS to swap content. Filed as `BL-ADMIN-NOJS-LOADING-CONFLICT` in BACKLOG.md.
- **Prettier:** 5 touched code files carry pre-existing format drift at `main` (`app/admin/page.tsx`, `components/admin/Dashboard.tsx`, `lib/audit/trustDomains.ts`, `tests/admin/_metaInfraContract.test.ts`, `tests/e2e/admin-banner.spec.ts`); milestone hunks are prettier-clean, whole-file reformat deliberately avoided to keep review diffs scoped.
- A stale settings layout assertion in `admin-nav-layout-dimensions.spec.ts` (≤740px centered main, written 2026-06-01) was amended to the shipped M12.4-M12.6 contract (`w-full` + `max-w-3xl` left-aligned cards) — verified stale against `main` itself before amending.

## 12. Impeccable findings + dispositions (invariant 8)

Both gates run by EXTERNAL attestors (fresh Opus subagents; not the implementing session). v3 preflight gates passed in both.

**`/impeccable critique` — PASS** (0 CRITICAL/HIGH; design health ~31/40):

| #   | Sev    | Finding                                                                                                           | Disposition                                                                                                                                                                                                                                                                                                      |
| --- | ------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | MEDIUM | Empty `#alerts` slot doubles the header→inbox gap in the common no-alerts state (dead band, screenshot-confirmed) | **FIXED** @ `5ed13e69` (`empty:hidden` on the slot); mobile baselines regenerated @ `c1f2df58`                                                                                                                                                                                                                   |
| 2   | MEDIUM | Badge white-on-accent ≈2.3:1 at 12px (light mode)                                                                 | **DEFERRED → BACKLOG** `BL-ADMIN-BADGE-CONTRAST-TOKEN`: project-wide badge token pair (e.g. #C25E00 bg ≈4.9:1) applied to NotifBell + attention badge together; recipe is byte-identical to the shipped NotifBell badge and count is duplicated in the accessible name — consistency over per-surface divergence |
| 3   | LOW    | Summary-card zero state restates itself ("All caught up" + "Nothing waiting on you.")                             | **DEFERRED → BACKLOG** (fold into `BL-ADMIN-BADGE-CONTRAST-TOKEN` polish batch)                                                                                                                                                                                                                                  |
| 4   | LOW    | `badgeDisplay` computed `String(null)` outside the render gate (hygiene)                                          | **FIXED** @ `5ed13e69` (null-fold)                                                                                                                                                                                                                                                                               |

**`/impeccable audit` — PASS** (19/20; all 6 dimensions + fix-hunk re-attestation PASS):

| #   | Sev     | Finding                                                                                               | Disposition                                                                                                                            |
| --- | ------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | P3      | `app/admin/layout.tsx` awaits alert count then badge count serially; `Promise.all` saves a round-trip | **DEFERRED → BACKLOG** (same polish batch) — touching the invariant-8 surface post-attestation would reopen the gate fixpoint for a P3 |
| 2   | P3/info | Desktop direct-visit to the page activates no nav item                                                | **REJECTED with spec citation** — ratified D-2 (spec §2): desktop nav doesn't link to or own the route                                 |

**Gate-fixpoint status (plan step 14.3):** UI mutations after critique attestation = `5ed13e69` only; the audit attestor re-attested those exact hunks on the final diff (`c1f2df58`). No UI mutations after audit attestation. Fixpoint holds unless adversarial review forces further UI fixes (which would re-trigger both gates).

## 13. Adversarial review record

- **Spec:** Codex, 7 rounds → APPROVED R7 (R1 client-construction containment; R2 layout-staleness badge redesign + call-form + count-fallback; R3 PROTECTED_ROUTES + meta-test mandatory; R4 same-route refresh + wrapper parity; R5 stale-fetch token/abort; R6 loader-boundary totals pinning).
- **Plan:** Codex, 4 rounds → APPROVED R4 (R1 same-commit banner contract + \_metaBoundedReads + empty-state selectors + destructuring snippet; R2 per-table invariant-9 matrix + handoff §12 step; R3 impeccable/adversarial fixpoint guard).
- **Per-task:** every implementation task passed two-stage review (spec-compliance then code-quality) by fresh subagents; one quality nit fixed (parity assertions for the additive total fields, `87f020ce`).
- **Whole-milestone (Codex, fresh-eyes, branch vs main):** R1 → one MEDIUM (loader kept the pre-extraction `q.`-style reads; invariant-9 destructuring unpinned) → FIXED @ `fc4ac83e` (all 5 reads destructured + source-level structural pin with negative-regression proof + class-sweep clean). R2 → **APPROVE**, no material findings.
- **Gate fixpoint (plan 14.3):** post-attestation commits touch only `docs/`, `lib/admin/`, `tests/` — zero invariant-8 UI surfaces after the audit attestation at `c1f2df58`. Both gates + adversarial APPROVE hold simultaneously on the final diff.
