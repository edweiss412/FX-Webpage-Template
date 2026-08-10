# Plan — admin nav badge streaming (promise-as-prop, hooks own pending state)

**Spec:** `docs/superpowers/specs/nav-perf/2026-08-09-admin-nav-badge-suspense-design.md` (converged R4-repaired; round record `docs/review-rounds/feat/admin-nav-badge-suspense/7e04cd6f04e9.md`) · **Branch:** `feat/admin-nav-badge-suspense` · **Ledger:** `BL-ADMIN-NAV-BADGE-SUSPENSE-STREAMING`

Implementer: Opus / Claude Code (UI surface: `app/admin/layout.tsx`, `components/admin/nav/**`). Impeccable dual-gate applies (invariant 8); closeout carries `impeccable-gate:` marker.

## Meta-test inventory (mandatory declaration)

CREATES: none. EXTENDS: none. None applies because: no Supabase call site is added or moved (the two loaders are called unchanged, just not awaited in the layout); no mutation surface, no admin alert, no tile rendering changes. The invariant-9 posture of both loaders is already discharged at their definitions.

## Pre-draft verification pass (run 2026-08-09; investigator + direct reads, cited in the spec §2)

Layout barriers + onboarding early-return (`app/admin/layout.tsx` ~:77-181), AdminNav props/hook (`components/admin/nav/AdminNav.tsx` :44-71, render gate :205-230), `useNeedsAttentionBadge` (:16-58, prop-sync :23-33, pathname :35-55), `useBellBadge` (post-zero demotion :66-76,122-159 per review probes; degraded mapping :58-62,100-104), `NotifBell` (trigger branch :32-62), loaders (`lib/admin/needsAttentionCount.ts:12-96`, `lib/admin/bellFeed.ts:343-350`). Contract tests that MUST keep passing unmodified: `tests/components/admin/nav` bell/attention suites (`notifBell.test.tsx`, `AdminNav.test.tsx`, `useBellBadge.test.tsx` — implementer confirms exact paths at Task 0).

## Task 0 — SPIKE (mandatory, before any implementation task; spec §3.5)

Throwaway probe in this worktree (deleted before the PR): a `force-dynamic` layout passes an artificially-slow promise prop to a client component consuming it via `.then` in an effect. Prove in `next dev` AND `next build && next start`: (a) chrome flushes before resolution (streaming holds), (b) no hydration error/double-fetch, (c) a navigation issued before resolution still fires the pathname refetch. Paste the measurements into this plan file as an amendment commit. If streaming does NOT hold: adopt the recorded fallback (client-side first-fetch seeding), amend spec §3.2 by one commit, and continue — the task structure below is unchanged either way (the seed SOURCE changes; the virgin-state rule and interleavings do not).

<!-- tasks: depth=2 -->

## Task 1 — onboarding branch stops paying badge reads

<!-- task: red=`pnpm vitest run tests/components/admin/nav tests/app/admin` ac=AC-1 -->

RED: a new test renders/executes the layout's onboarding path with both loaders spied and asserts ZERO calls — fails against current `app/admin/layout.tsx` (both loaders are called before the early return). Implement the reorder (early-return decision before the reads are issued). Existing onboarding UI tests unchanged and green.

## Task 2 — hooks gain the async-seed arm (virgin-state rule)

<!-- task: red=`pnpm vitest run tests/components/admin/nav` ac=AC-3,AC-4,AC-5 -->

RED first: the AC-5 interleaving suite (one named test per spec §3.2 table row, BOTH hooks where applicable) written against the CURRENT hooks with a promise-seed harness — fails because neither hook accepts a promise seed. Implement: `useNeedsAttentionBadge` and `useBellBadge` accept the promise-seed input (promise-identity-keyed effect; `hasCommittedRef` set on every commit path; virgin-state ingestion only; attention drop / bell demote when non-virgin; bell `infra_error` → degraded). Every pre-existing hook test passes UNMODIFIED (the observable contracts are frozen — spec §1.2); the seed arm is additive. Anti-tautology: each interleaving test derives its expected paint from the interleaving's WINNING source value, never from the seed value; the navigate-then-seed case asserts the seed value is ABSENT from the DOM.

## Task 3 — layout passes promises; AdminNav/NotifBell wire the seam

<!-- task: red=`pnpm vitest run tests/components/admin/nav tests/app/admin` ac=AC-2,AC-6 -->

RED: source-scan test asserting `app/admin/layout.tsx` does not `await` either loader call expression + a rendering test with a never-resolving promise asserting nav chrome testids render (pending shapes: no attention chip, bell button without count, not degraded). Implement: layout issues wrapped never-rejecting promises (`.catch(() => ({ kind: "infra_error" as const }))`), passes them as props; `AdminNav`/`NotifBell` thread them to the hooks. `router.refresh` supersession (P1/P2) tests from Task 2's suite now exercised through the real components.

<!-- tasks: end -->

## Close-out (not a TDD task)

Impeccable dual-gate (`/impeccable critique` + `/impeccable audit`) on the diff — the visual delta is timing-only, but the gate is the contract for any `components/` change; P0/P1 fixed or DEFERRED.md'd; §12/closeout carries `impeccable-gate: run — see findings table`. Full ladder: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`. Whole-diff codex review (fresh-eyes; REVIEWER ONLY; consequence bound: every badge state is handled correctly OR signaled by the designed degradation — a count renders correctly, or the badge stays hidden / bell degrades, never a stale paint, never an unhandled rejection, never silently wrong; fence: accidental lifecycle mistakes on an admin-only surface; convergence: the AC-5 interleaving suite is the mechanical closure — a new interleaving finding is admissible only with a concrete ordering the suite misses). Push → real CI green (12 required contexts) → invariant-12 marker off in last commit → merge → main sync `0  0` (AC-7, AC-8).

## Invariant checklist

- Invariant 1 (TDD): Tasks 1-3 each carry a corpus/production RED (current layout calls loaders on onboarding path; current hooks reject promise seeds; current layout awaits).
- Invariants 2/10: N/A — no locks, no mutation surfaces.
- Invariant 5: no raw codes — failure renders hidden chip / degraded bell (ratified postures).
- Invariant 8: dual-gate in close-out.
- Invariant 9: loaders unchanged at their call boundaries.
- Invariant 12: marker off in the PR's last commit.
- AC map (spec §4): AC-1 Task 1 · AC-2 Task 3 · AC-3/AC-4/AC-5 Task 2 (+ Task 3 integration) · AC-6 Task 3 · AC-7/AC-8 Close-out.
