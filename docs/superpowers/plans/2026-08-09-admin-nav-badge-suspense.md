# Plan — admin nav badge streaming (promise-as-prop, hooks own pending state)

**Spec:** `docs/superpowers/specs/nav-perf/2026-08-09-admin-nav-badge-suspense-design.md` (converged R4-repaired; round record `docs/review-rounds/feat/admin-nav-badge-suspense/7e04cd6f04e9.md`) · **Branch:** `feat/admin-nav-badge-suspense` · **Ledger:** `BL-ADMIN-NAV-BADGE-SUSPENSE-STREAMING`

Implementer: Opus / Claude Code (UI surface: `app/admin/layout.tsx`, `components/admin/nav/**`). Impeccable dual-gate applies (invariant 8); closeout carries `impeccable-gate:` marker.

## Meta-test inventory (mandatory declaration)

CREATES: none. EXTENDS: none. None applies because: no Supabase call site is added or moved (the two loaders are called unchanged, just not awaited in the layout); no mutation surface, no admin alert, no tile rendering changes. The invariant-9 posture of both loaders is already discharged at their definitions.

## Pre-draft verification pass (run 2026-08-09; investigator + direct reads, cited in the spec §2)

Layout barriers + onboarding early-return (`app/admin/layout.tsx` ~:77-181), AdminNav props/hook (`components/admin/nav/AdminNav.tsx` :44-71, render gate :205-230), `useNeedsAttentionBadge` (:16-58, prop-sync :23-33, pathname :35-55), `useBellBadge` (post-zero demotion :66-76,122-159 per review probes; degraded mapping :58-62,100-104), `NotifBell` (trigger branch :32-62), loaders (`lib/admin/needsAttentionCount.ts:12-96`, `lib/admin/bellFeed.ts:343-350`). Contract tests that MUST keep passing unmodified (paths verified, plan R1 F3): `tests/components/notifBell.test.tsx`, `tests/components/useBellBadge.test.tsx`, `tests/components/admin/nav/AdminNav.test.tsx`.

## Task 0 — SPIKE (mandatory, before any implementation task; spec §3.5)

Throwaway probe in this worktree (deleted before the PR): a `force-dynamic` layout passes an artificially-slow promise prop to a client component consuming it via `.then` in an effect. Prove in `next dev` AND `next build && next start`: (a) chrome flushes before resolution (streaming holds), (b) the client thenable RESOLVES when the RSC payload arrives — the `.then` callback observably fires with the loader's value after the artificial delay (plan R1 F1), (c) no hydration error/double-fetch, (d) a navigation issued before resolution still fires the pathname refetch. Paste the measurements into this plan file as an amendment commit. The spike FAILS CLOSED on ANY of the four properties (plan R2 F2) — a failed thenable delivery, a hydration error/double-fetch, or a broken pre-resolution navigation each triggers the fallback exactly as a failed flush does. Fallback (client-side first-fetch seeding), honestly stated (plan R2 F3 — it is NOT a source-swap): the hooks gain NO async-seed arm at all; the layout stops awaiting and passes nothing; each hook mounts in the pending shape and issues its own first fetch through its EXISTING commit paths (the token gates already govern it — `useNeedsAttentionBadge.ts:35-55`, `useBellBadge.ts:82-107`). Under fallback, Task 2 SHRINKS to: pending-shape rendering + first-fetch population + the interleaving subset that exists without promises (navigate-during-first-fetch, zeroNow-during-first-fetch); every promise-specific case (P1/P2 supersession, virgin-state seed drop/demote) is N/A and the spec is amended by one commit to record the reduced state machine. Task 3's layout half shrinks to not-awaiting + pending-shape assertions.

### Task 0 result — RATIFIED (run 2026-08-09, Next 16.3.0 / React 19.2.4)

All four properties hold in `next dev` AND `next build && next start`. The streaming half proceeds as specified; the fallback is NOT taken.

Probe: `app/spike-promise/{layout,page,other/page}.tsx` + `components/spike/SpikeConsumer.tsx` (a `force-dynamic` layout passing a promise resolving after an artificial 2500ms delay to a client component consuming it via `.then` in a promise-identity-keyed effect), driven headless by `spike-drive.mjs`. All five files are throwaway and deleted before the PR.

| Property | `next dev` | `next build && next start` |
| --- | --- | --- |
| (a) chrome flushes before resolution | chrome marker on the wire at **96ms**, resolved value at **2578ms**, stream end 2579ms; in-browser chrome visible at **222ms** with the count still `PENDING` | chrome marker at **2202ms**, value at **4502ms** (gap **2300ms** ≈ the artificial delay; the absolute figure carries first-request warm-up); in-browser chrome visible at **717ms**, count `PENDING` |
| (b) the client thenable RESOLVES with the loader's value | `.then` fired with `count: 7` at **2578ms** | fired with `count: 7` at **3308ms** |
| (c) no hydration error / no double-fetch | 0 hydration errors, 0 page errors, `.then` callback fired exactly **1×** (React StrictMode's dev double-mount invalidated the first subscription, as the identity guard intends) | 0 hydration errors, 0 page errors, exactly **1×** |
| (d) navigation issued BEFORE resolution still fires the pathname refetch | refetch counter **1**, instance id unchanged (**no remount**), count still `PENDING` at nav time | refetch counter **1**, instance id unchanged, count still `PENDING` at nav time |

Two measurement artifacts worth recording, because each produced a false reading first:

1. **The dev server 403s subresources whose `Origin` is `127.0.0.1`** (Next 16's dev cross-origin check; `localhost` is accepted). The first dev run showed `resolves: 0` and a permanently `PENDING` count — not a framework property, just an unhydrated page: every `/_next/static/chunks/*.js` had returned 403. Drive dev probes at `http://localhost`.
2. **A click on a `<Link>` before hydration is a native full-document navigation**, not a client-side one — it remounts the tree, so `lastPathRef` initializes on the destination and the pathname effect correctly does not fire. The first (d) reading (`refetches: 0`) measured that, not the property. The probe now gates the click on a hydration marker, and the instance id distinguishes "effect fired" from "component remounted" for good.

<!-- tasks: depth=2 -->

## Task 1 — onboarding branch stops paying badge reads

<!-- task: red=`pnpm vitest run tests/components/admin/nav tests/app/admin` ac=AC-1 -->

RED: a new test renders/executes the layout's onboarding path with both loaders spied and asserts ZERO calls — fails against current `app/admin/layout.tsx` (both loaders are called before the early return). Implement the reorder (early-return decision before the reads are issued). Existing onboarding UI tests unchanged and green.

## Task 2 — hooks gain the async-seed arm (virgin-state rule)

<!-- task: red=`pnpm vitest run tests/components/notifBell.test.tsx tests/components/useBellBadge.test.tsx tests/components/admin/nav` ac=AC-3,AC-4,AC-5 -->

RED first: the AC-5 interleaving suite (one named test per spec §3.2 table row, BOTH hooks where applicable) PLUS the seed result-shape cases (plan R2 F5: promise resolving `infra_error` → hidden chip / degraded bell; resolving 0 → hidden; resolving >9 → the 9+ cap — the frozen `AdminNav.test.tsx` matrix covers synchronous props only, so the promise-result boundary needs its own rows) PLUS the transition-audit EXTENSION (plan R2 F1/F6: `tests/components/admin/nav/transitionAudit.test.tsx` ALREADY exists asserting current transitions instant — this task EXTENDS it RED-first with the new pending-state rows, which fail because the pending shape does not exist yet; the spec §3.7 inventory table is embedded verbatim below). All written against the CURRENT hooks with a promise-seed harness — failing because neither hook accepts a promise seed. Implement: `useNeedsAttentionBadge` and `useBellBadge` accept the promise-seed input (promise-identity-keyed effect; `hasCommittedRef` set on every commit path; virgin-state ingestion only; attention drop / bell demote when non-virgin; bell `infra_error` → degraded). Every pre-existing hook test passes UNMODIFIED (the observable contracts are frozen — spec §1.2); the seed arm is additive. Anti-tautology: each interleaving test derives its expected paint from the interleaving's WINNING source value, never from the seed value; the navigate-then-seed case asserts the seed value is ABSENT from the DOM.

## Task 3 — layout passes promises; AdminNav/NotifBell wire the seam

<!-- task: red=`pnpm vitest run tests/components/notifBell.test.tsx tests/components/useBellBadge.test.tsx tests/components/admin/nav tests/app/admin` ac=AC-2,AC-6 -->

RED: source-scan test asserting `app/admin/layout.tsx` does not `await` either loader call expression + a rendering test with a never-resolving promise asserting nav chrome testids render (pending shapes: no attention chip, bell button without count, not degraded) + LOADER-REJECTION cases for BOTH loaders (plan R4 F1): a promise that REJECTS must reach the hooks as `{ kind: "infra_error" }` via the layout's `.catch` wrappers — attention chip hidden, bell degraded; the RED fails while the wrappers are absent, and a wrapper-deletion mutant is recorded in the commit (the no-unhandled-rejection consequence bound's executable half). Implement: layout issues wrapped never-rejecting promises (`.catch(() => ({ kind: "infra_error" as const }))`), passes them as props; `AdminNav`/`NotifBell` thread them to the hooks. `router.refresh` supersession (P1/P2) tests from Task 2's suite now exercised through the real components. **CLS deliverable (plan R1 F4 revised per R2 F4 — no mid-flight delay hook exists for direct server calls):** extend `tests/e2e/admin-nav-layout-dimensions.spec.ts` using its ESTABLISHED mechanism (DB-state change across reloads, the :580-623 pattern): capture nav sibling `getBoundingClientRect` positions with the badge HIDDEN (zero attention items) and again with the badge VISIBLE (seeded items), assert every sibling position identical (0.5px tolerance) — additive-chip-no-shift proven without simulating latency. Boot/readiness per that spec's ACTUAL harness (plan R3 F2): sign-in setup then the server-rendered topbar-visibility gate (its :220-234 region) — it has no row-hydration helper, and none is claimed. Run wiring (plan R3 F1): the Playwright invocation `pnpm exec playwright test tests/e2e/admin-nav-layout-dimensions.spec.ts` is part of THIS task's red/green loop and of the close-out ladder; `admin-layout-e2e.yml` already path-filters this spec and fires on the PR (not one of the 12 required contexts — the close-out treats its green run as a gate anyway and links the run in the PR body).

### Spec §3.7 Transition Inventory (embedded verbatim for the Task-2 audit extension)

| Transition | Treatment |
| --- | --- |
| pending to hidden | instant, and visually identical for the attention chip: both render nothing |
| pending to visible | instant appearance on seed resolution; no animation (chip is additive, no shift) |
| pending to degraded (bell, infra_error) | instant; the existing `!` trigger recipe, unchanged |
| visible to hidden (refetch lands 0 / fail-quiet null) | instant, existing hook behavior, unchanged |
| hidden to visible (refetch lands > 0) | instant, existing hook behavior, unchanged |
| compound: pathname refetch fires while the seed promise is still pending | fully specified in the §3.2 interleaving table: the refetch commits and bumps the token; the late seed is discarded; asserted in AC-5's integration tests |
| compound: layout re-render mid-stream (router.refresh) | new promise props arrive; the older subscription is INVALIDATED at that instant (promise-identity guard); only the newest promise's resolution reaches `ingestPropValue` |
| compound: P1 pending, P2 arrives, P1 resolves first | P1's value is ignored (invalidated subscription); pending shape persists until P2 resolves or a refetch lands (spec R3 F2; test required, AC-5) |
| compound: P2 arrives and HANGS after P1 invalidated | pending shape persists; next pathname refetch repopulates; no wedge, no stale paint |
| compound: refresh promise pending, bell opened + zeroed, restoring fetch commits 0, THEN refresh promise resolves with the pre-open count | the resolved value is DEMOTED to a fresh fetch by the bell's post-zero prop contract — the stale pre-open count is never painted (spec R2 F1; test required, AC-5) |

<!-- tasks: end -->

## Close-out (not a TDD task)

Impeccable dual-gate with the CANONICAL v3 setup sequence (plan R1 F6): the skill's context loader (PRODUCT.md + DESIGN.md) → the register reference read → `/impeccable critique` → `/impeccable audit` on the diff; P0/P1 fixed or DEFERRED.md'd; findings + dispositions recorded in the §12 section below. At close-out the implementer writes the machine-valid marker as a STANDALONE line in §12 per the parser grammar (plan R1 F7): `impeccable-gate: critique=RAN audit=RAN p0=<...> p1=<...> dispositions=<...>` — exact field values per `tests/docs/_invariant8Closeout.ts`; no marker line exists until then (an invalid placeholder fails the parser). Full ladder: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm exec playwright test tests/e2e/admin-nav-layout-dimensions.spec.ts` (the CLS deliverable — plan R3 F1). Whole-diff codex review (fresh-eyes; REVIEWER ONLY; consequence bound: every badge state is handled correctly OR signaled by the designed degradation — a count renders correctly, or the badge stays hidden / bell degrades, never a stale paint, never an unhandled rejection, never silently wrong; fence: accidental lifecycle mistakes on an admin-only surface; convergence: the AC-5 interleaving suite is the mechanical closure — a new interleaving finding is admissible only with a concrete ordering the suite misses). Push → real CI green (12 required contexts) → invariant-12 marker off in last commit → merge → main sync `0  0` (AC-7, AC-8).

## §12 Impeccable closeout

Both halves ran on the branch diff (`app/admin/layout.tsx`, `components/admin/nav/**`) with the canonical v3 setup: `context.mjs` (PRODUCT.md + DESIGN.md) → `reference/product.md` (this is app chrome — design SERVES the product).

**critique** — dual-agent per the command's hard invariant (A: design review, B: detector + mechanical-invariant evidence), not degraded. Design Health 30/40. Deterministic detector: `detect.mjs --json components/admin/nav app/admin/layout.tsx` → exit 0, `[]`, clean. The pre-code mechanical sweep passed every rule and mostly by vacuity, which is the honest reading: this diff adds no JSX text, no interactive element, no className and no color, so em-dash/apostrophe/44px-tap/token-class have nothing to bite on. The one non-vacuous pass is invariant 5 — `infra_error` appears only as a discriminant in state logic (`layout.tsx`, `useBellBadge.ts`), never in a rendered node.

**audit** — technical pass over the same diff (a11y, perf, responsive, error/edge states, React correctness). Verified positives worth recording so a later reviewer does not re-derive them: promise identity is stable across same-payload re-renders (no subscribe churn); no double fetch on mount including the StrictMode replay; both badge chips are absolutely positioned at every breakpoint, so arrival cannot shift layout at any width; the degraded bell's name still comes from `lib/messages/lookup.ts`.

| # | Finding | Tier | Disposition |
| --- | --- | --- | --- |
| 1 | A non-virgin attention seed was DROPPED, so a same-route `router.refresh` left the badge on the page-load count — stale exactly when an admin resolves an item (audit) | P1 | **FIXED in-branch** (`cea501f06`). Both hooks now demote to a fresh fetch; spec §3.2.1 ratifies the amendment over §3.2's drop clause; RED pinned by the "router.refresh path" case. |
| 2 | Badge accessible names flip after first paint ("Notifications" → "Notifications: N unseen"; "Needs attention" → "Needs attention, N items") with nothing announcing the change (critique P1 / audit P2 — raised independently by both halves) | P1 | **DEFERRED** — `DEFERRED.md` › `NAV-BADGE-ARRIVAL-ANNOUNCE-1`, reason (a): whether the global nav should announce at all is a product decision about chatter on a venue floor, not an implementation detail. Bounded: purpose is always conveyed; only the count is late, and it is restored on next focus. |
| 3 | No pending affordance — the pending window is visually identical to a count of zero (critique) | P1 | **RATIFIED, not deferred.** Spec §3.3 ("no spinner anywhere") and documented limit §5.1 ("No skeleton, because a skeleton for a maybe-hidden chip advertises noise") already decided this. Per the ledger filing bar, a decided limit belongs in the owning surface's limits record, not the open queue. |
| 4 | The pending window has no stated time budget under degraded connectivity (critique) | P2 | **RATIFIED** — covered by documented limit §5.1; the failure posture is unchanged and the first pathname refetch repopulates. |
| 5 | Pending vs. true-zero is unrepresented for the attention chip (critique) | P3 | **RATIFIED** — same limit; the hidden-unless-finite-gt-0 render gate is a frozen contract (spec §1.3). |
| 6 | Every non-virgin bell seed resolution costs one extra client fetch (audit) | P3 | **ACCEPTED** — the ratified cost of the bell's stale-value posture (spec §3.2), now also paid by the attention badge per §3.2.1. |

impeccable-gate: critique=RAN audit=RAN p0=0 p1=2 dispositions=recorded

## Invariant checklist

- Invariant 1 (TDD): Tasks 1-3 each carry a corpus/production RED (current layout calls loaders on onboarding path; current hooks reject promise seeds; current layout awaits).
- Invariants 2/10: N/A — no locks, no mutation surfaces.
- Invariant 5: no raw codes — failure renders hidden chip / degraded bell (ratified postures).
- Invariant 8: dual-gate in close-out.
- Invariant 9: loaders unchanged at their call boundaries.
- Invariant 12: marker off in the PR's last commit.
- AC map (spec §4): AC-1 Task 1 · AC-2 Task 3 (incl. CLS e2e) · AC-3/AC-4/AC-5 Task 2 (incl. the audit extension + seed result-shape rows; Task 3 integration) · AC-6 Task 3 · AC-7/AC-8 Close-out (+§12).
