# Handoff — M11 Phase A: Foundation (Tasks A.1–A.7)

**Status:** IN PROGRESS — handoff authored 2026-05-19.

**Handed off:** 2026-05-19 by Eric Weiss (orchestrator session "Orchestrator — M11").
**Implementer:** Opus 4.7 / Claude Code via `superpowers:subagent-driven-development` (per AGENTS.md "UI work is always Opus" hard rule + ROUTING.md per-phase "all-Opus" for Phase A).
**Adversarial reviewer:** GPT-5.5 / Codex CLI via `/codex:adversarial-review --background --base <phase-A-base-SHA>` (cross-CLI per ROUTING.md reviewer-pairing logic).
**Plan file:** `docs/superpowers/plans/2026-05-12-user-facing-docs/01-foundation.md` (Tasks A.1–A.7).

> Phase A is the foundation phase. It unblocks every later phase; it depends on M10 close-out only (per AC-11.22). No M11-internal dependencies.

> **Single-implementer phase. No §A/§B split. No pin-stops.** All seven tasks (A.1–A.7) ship in one continuous TDD-disciplined sequence inside this session.

---

## §1 Session metadata

- **Session date(s):** 2026-05-19 (start) — close-out date TBD.
- **Implementer:** Opus 4.7 / Claude Code (orchestrator + fresh subagent per task via `superpowers:subagent-driven-development`).
- **Reviewer:** Codex (cross-CLI) via `/codex:adversarial-review`.
- **Base branch:** `main` at commit `2090dc2` (head of `main` at handoff authoring; X.1 catalog-parity converged at R3 APPROVE).
- **Plan version:** `docs/superpowers/plans/2026-05-12-user-facing-docs/` r1 (commit `977dc78` — rename M12 → M11 + retire fictional M11 ops-hardening slot, 2026-05-19).
- **Spec version:** `docs/superpowers/specs/2026-05-12-user-facing-docs-design.md` r14 (current HEAD). Spec amendments through 2026-05-19 confirmed integrated in §12.4 (per X.1 close-out at `2090dc2`). Phase A consumes the catalog read-only; Phase B (subsequent) extends the schema.

---

## §2 Phase completed in this session

- [x] **Phase A — Foundation** (`01-foundation.md`) — **CLOSED 2026-05-19 at SHA `e911078`**
  - [x] Task A.1 — `@next/mdx` pipeline + `pageExtensions` (`8bc5235`)
  - [x] Task A.2 — `app/help/layout.tsx` with `requireAdmin` + `AdminInfraError` catch (`8d0f5b1` + `169a19f` review fix)
  - [x] Task A.3 — `_nav.ts` registry (`50455b1`)
  - [x] Task A.4 — `<Sidebar>` component (`8d52e1d` + `2072b5b` review fix)
  - [x] Task A.5 — `<Header>` component (`271bb22`)
  - [x] Task A.6 — `<Breadcrumb>` + chrome composition in `layout.tsx` (`6d35cf5`)
  - [x] Task A.7 — Nav-consistency meta-test (`tests/help/_metaNavSync.test.ts`) + 12 stub pages (TDD-green) (`0274a63`)
  - [x] Codex R1 token-discipline fixes (`370298f`)
  - [x] R1 follow-up side-stripe ban fix (`30dafe8`)
  - [x] Codex R2 disclosure-semantic restructure (`aa7b249`)
  - [x] Project-infra flake fix #1 e2e snapshot hydration barrier (`6afc409`)
  - [x] Project-infra flake fix #2 attempt 1 pagination (`4add98d` — kept; signInAs.ts portion is useful for Playwright)
  - [x] Project-infra flake fix #2 attempt 2 actual root cause via `vi.importActual` (`e911078`)

Other phases (B–I) are tracked in their own per-phase handoffs.

---

## §3 Spec sections in scope (Phase A only)

- **§3.2** — Pipeline choice (`@next/mdx` native pipeline, no third-party docs framework).
- **§3.3** — Routing posture + underscore-prefix App Router convention for `_nav.ts` / `_components/`.
- **§3.4** — Rendering posture (dynamic, RSC chunks; not static prerender).
- **§3.5** — Auth gating (`requireAdmin` per request; `AdminInfraError` catch arm).
- **§4.1–§4.3** — Content inventory; nav group structure ("Get started", "The admin surface", "Reference"); 13 v1 pages.
- **§6.1** — Page chrome: sidebar (mobile-collapse under 768 px), header (theme toggle + back-to-admin), breadcrumb derived from `_nav.ts`.
- **§7.1 test #5** — Nav-consistency meta-test (bidirectional `_nav.ts` ↔ filesystem).
- **§13** — Acceptance criteria addressed in §4 below.

Out of scope for Phase A (deferred to later phases):
- `MessageCatalogEntry` schema extension (Phase B — catalog reads in Phase A consume the existing read-only shape).
- `lib/time/now.ts` (Phase C).
- MDX components beyond the empty `useMDXComponents` shell (Phase D).
- Page content for the 12 non-landing pages (Phase E — A.7 ships single-line stubs only so the meta-test lands green).
- Screenshot harness (Phase F), affordance retrofit (Phase G), auth-integration tests (Phase H), close-out (Phase I).

---

## §4 Acceptance criteria

Only the AC rows Phase A scaffolds or fully satisfies are listed. Other AC-11.* rows are out of Phase A scope.

| AC | Phase A status | Notes |
| --- | --- | --- |
| AC-11.1 | PARTIAL — scaffolded | 13 page files exist on disk after A.7 (1 fully-implemented landing placeholder + 12 stubs). Phase E fills content; Phase A delivers the compile-target shape. |
| AC-11.2 | PASS | `app/help/layout.tsx` calls `requireAdmin()` per request (mirrors `app/admin/layout.tsx:47-71`). Unauthenticated → `forbidden()` 403 surface. Full Playwright auth-gate test is Phase H Task H.2; A.2 ships the smoke test. |
| AC-11.3 | PASS | `<Sidebar>` renders on every `/help/*` page via layout composition; current page highlighted via `aria-current="page"`; mobile collapse via `<details>` disclosure under 768 px. |
| AC-11.4 | PASS | `<Header>` renders the existing `components/layout/ThemeToggle` (verified live at handoff authoring — file exists at that path). Theme respects `prefers-color-scheme` via the existing toggle's localStorage flow. |
| AC-11.5 | DEFERRED — Phase B | `MessageCatalogEntry` schema extension is Phase B scope. |
| AC-11.6 | DEFERRED — Phase B / Phase E | Predicate-aligned biconditional landed in Phase B + verified in E.13. |
| AC-11.12 | PARTIAL — test #5 only | Phase A delivers `_metaNavSync` (test #5). Tests 1–10 + 12 + 13 + 14 + 15 + 16 + 17 + 18 are owned by later phases. |
| AC-11.17 | PASS | Conventional-commits `<type>(help): <summary>` format for every Phase A commit (Phase A invariants #2 + AGENTS.md §1.6). |
| AC-11.22 | PASS (sequencing) | M10 closed at SHA `9b34d30` per `../2026-04-30-fxav-crew-pages-design/handoffs/M10-onboarding.md:1`. Phase A starts post-M10. |
| AC-11.23 | PASS | `/help/*` renders dynamically — auth gate runs per request. Test #3 (Phase H) verifies; A.2 smoke test pins the static-vs-dynamic shape via `export const dynamic = "force-dynamic"`. |
| AC-11.24 | PASS | `app/help/layout.tsx` catches `AdminInfraError` and renders the cataloged 500-class fallback chain `entry.dougFacing ?? entry.crewFacing ?? "Please try again in a moment."` matching `app/admin/layout.tsx:58-60`. Live `ADMIN_SESSION_LOOKUP_FAILED` entry's `dougFacing: null` resolves to `crewFacing`. |
| AC-11.31 | PASS | `app/help/layout.tsx` exports `export const dynamic = "force-dynamic"` explicitly (verified by A.2 smoke test). |

ACs NOT addressed by Phase A: AC-11.5–AC-11.11 (B/E), AC-11.13 (I — impeccable close-out per page is Phase I; Phase A close-out runs impeccable on the Phase-A surface only), AC-11.14–AC-11.21 (D/F), AC-11.25–AC-11.30 (D/F/G), AC-11.32–AC-11.39 (C/F/G/H).

---

## §5 Plan-wide invariants — applicability to Phase A

These are AGENTS.md's 9 invariants layered with M11's per-plan additions (`00-overview.md` "Plan-wide invariants").

| # | Invariant | Phase A applicability |
| --- | --- | --- |
| AGENTS.md §1.1 | **TDD per task.** | **ACTIVE.** Every A.1–A.7 task: failing test → minimal implementation → passing test → commit. The plan body specifies the failing test before the implementation in every task. |
| AGENTS.md §1.2 | **Per-show advisory lock.** | **N/A for Phase A.** Phase A does not mutate `shows` / `crew_members` / `crew_member_auth` / `pending_syncs` / `pending_ingestions`. No `pg_*advisory*_lock` callers introduced. |
| AGENTS.md §1.3 | **Email canonicalization at every boundary.** | **N/A for Phase A.** No raw email handling. |
| AGENTS.md §1.4 | **No global sync cursor.** | **N/A for Phase A.** |
| AGENTS.md §1.5 | **No raw error codes in user-visible UI.** | **READ-ONLY ACTIVE.** A.2's AdminInfraError catch uses `messageFor(err.code as never).dougFacing ?? crewFacing ?? "Please try again in a moment."` — the catalog accessor, not the raw `err.code`. The visible text is the cataloged copy. No new catalog entries; Phase B extends the schema. |
| AGENTS.md §1.6 | **Commit per task.** | **ACTIVE.** Conventional-commits `feat(help): <summary>` (or `test(help):` for A.7's meta-test). Never batch multiple A.* tasks into one commit. |
| AGENTS.md §1.7 | **Spec is canonical.** | **ACTIVE.** No ratified amendments for M11. Any disagreement between A.1–A.7 task body and spec → open a question, do not silently fix. |
| AGENTS.md §1.8 | **impeccable v3 critique + audit dual-gate.** | **ACTIVE — fires at Phase A close-out.** Phase A's UI surface (`app/help/layout.tsx`, `app/help/_components/{Sidebar,Header,Breadcrumb}.tsx`, `mdx-components.tsx`, `app/help/page.mdx`) runs through `/impeccable critique` AND `/impeccable audit` in an **EXTERNAL** fresh-subagent dispatch (NOT same-session self-attestation, per memory `feedback_impeccable_external_attestation_required.md` — M9 R10/R11/R16/R17 lesson). HIGH/P0/P1 findings fixed inline OR routed to `DEFERRED.md` / `BACKLOG.md` per `feedback_deferral_discipline.md`. Any copy-rewriting disposition is spec-checked against §3.4 / §3.5 / §4.1–§4.3 / §6.1 before commit (memory `feedback_impeccable_critique_not_authoritative_vs_spec.md` — M8 R2 M2 lesson). |
| AGENTS.md §1.9 | **Supabase call-boundary discipline.** | **NO NEW SURFACE in Phase A.** A.2's only Supabase touch is through the existing `requireAdmin()` helper, which is already registered in `tests/auth/_metaInfraContract.test.ts`. Phase A confirms registration is unchanged; no new registry row required. |
| M11 plan-wide #4 | **No raw error codes in user-visible UI** (AGENTS.md #5 echo). | Same as AGENTS.md §1.5 above — fully active for A.2's AdminInfraError branch. |
| M11 plan-wide #5 | **impeccable v3 UI gate** (AGENTS.md #8 echo). | Same as AGENTS.md §1.8 above — fires at Phase A close-out. |
| M11 plan-wide #7 | **`MessageCatalogEntry` additive extension.** | **N/A for Phase A.** Phase B is the implementer. |
| M11 plan-wide #8 | **Catalog-master-spec alignment.** | **N/A for Phase A.** Phase B Task B.3 is the implementer; X.1 catalog-parity audit closed at `2090dc2` is the upstream baseline. |
| M11 plan-wide #9 | **`lib/time/now.ts` is the only server-side render-time source.** | **N/A for Phase A.** Phase C creates the utility. Phase A's layout uses no `Date.now()` / `new Date()` in render paths. |
| M11 plan-wide #10 | **§5.6 affordance matrix is the §9.0.1 retrofit contract.** | **N/A for Phase A.** Phase G is the implementer. |

---

## §6 Watchpoints (class-vectors carried forward)

Per AGENTS.md "Same-vector recurrence" + Disagreement-loop preempt rules. These are pre-loaded BEFORE adversarial review fires so the reviewer is anchored on prior-incident context, not discovering it round-N.

1. **`requireAdmin` + `AdminInfraError` chain — composition gotcha.** M10 R3 (admin-precedence finding) established that `requireAdmin` distinguishes auth-negative (forbidden) from infra-fault (AdminInfraError) per `lib/auth/requireAdmin.ts:28-46`. The catch arm in `app/help/layout.tsx` must (a) only catch `AdminInfraError` and rethrow other errors so Next's navigation control flow propagates (notFound / forbidden carry `NEXT_HTTP_ERROR_FALLBACK` digests); (b) render the cataloged fallback chain `entry.dougFacing ?? entry.crewFacing ?? "Please try again in a moment."` exactly matching `app/admin/layout.tsx:55-71`; (c) NOT render the raw `err.code` (AGENTS.md §1.5). Phase A's A.2 task body specifies the exact 47-71-equivalent shape; the smoke test at `tests/help/auth-stub.test.ts` asserts the source contains `requireAdmin` AND `AdminInfraError` literals (compile-time guard); the full behavior test is Phase H Task H.2.

2. **Multi-state state machine class** (M9 C3 Bootstrap retry semantics — 16 rounds). M9 burned ~16 review rounds on auth-flow + Bootstrap retry transitions because the spec transition inventory was incomplete; M11's plan-wide invariant #5 (impeccable v3 gate) is the cross-check. Phase A has fewer states than M9 C3 (effectively two: authed-admin and AdminInfraError-stub; unauth/crew are handled by `requireAdmin()`'s `forbidden()` throw, which Next renders to a 403). The smoke test in A.2 + Phase H Task H.2's full Playwright cover the matrix. Watch for: a third path silently introduced (e.g., a custom `notFound()` arm in the catch) — that's a transition not in the inventory. Stay disciplined: only catch `AdminInfraError`; rethrow everything else.

3. **impeccable v3 critique disposition rewrites are NOT authoritative against the spec** (M8 R2 M2 — `feedback_impeccable_critique_not_authoritative_vs_spec.md`). If the Phase A external `/impeccable critique` returns dispositions that rewrite UI strings (page headings, breadcrumb labels, the "Back to admin →" link text, sidebar group titles, the AdminInfraError fallback "Try again" link), GREP the spec §3.4 / §3.5 / §4.1–§4.3 / §6.1 for the surface BEFORE shipping the rewrite. Critique knows UX; it does not know product contracts. M8 §13.1 was the precedent (channel-boundary inversion shipped via a critique disposition).

4. **impeccable v3 dual-gate requires EXTERNAL attestation** (M9 R10/R11/R16/R17 — `feedback_impeccable_external_attestation_required.md`). Both `/impeccable critique` and `/impeccable audit` for Phase A close-out must run in a fresh subagent dispatch (or direct user invocation), NOT in the same orchestrator/implementer session that wrote the UI. Self-attestation = §1.8 failure. Every post-review UI mutation also re-triggers the dual-gate.

5. **Deferral discipline — three buckets** (`feedback_deferral_discipline.md`). Small mechanical fixes that surface during impeccable / adversarial review LAND NOW inside Phase A (default for <~30 lines, no milestone-significant abstraction). Items blocked on planned future milestones → `DEFERRED.md`. Speculative items with no scheduled home → `BACKLOG.md` (no aspirational milestone names). Phase A's `/impeccable` is likely to recommend `defer-to-harden` for stylistic nits — scrutinize each one; ship most.

6. **Tailwind v4 `.flex` does NOT default to `align-items: stretch`** (`feedback_tailwind_v4_flex_items_stretch.md` — referenced in user CLAUDE.md). If Phase A's chrome composition has any fixed-dimension parent with flex/grid children, the dimensional invariant must be explicit (`items-stretch`, `h-full`, `self-stretch`, explicit `style={{height:...}}`). The current A.6 layout uses `md:flex md:gap-6` which is NOT a fixed-dimension parent — Sidebar and main are independently sized, so no stretch dependency. Watch if any task adds a fixed-height container.

7. **echo append newline trap** (`feedback_echo_append_newline_trap.md`). If any Phase A step needs to append to `.gitignore` or a similar text file, use `printf '\n%s\n'`, never `echo "X" >> file`. M0 R1 + M4 R7 shipped malformed gitignore entries this way. No anticipated Phase A appends, but flag if one materializes.

8. **vitest env discipline.** The repo's vitest default is `environment: "node"`. React DOM tests for the chrome components (A.4 / A.5 / A.6) MUST start with `// @vitest-environment jsdom` AND import `vi` explicitly (the plan body cites this as r2 finding 1 + the explicit `vi` import as r3 finding 2). Mocking `next/navigation`'s `usePathname` requires `vi.hoisted` to lift the mock function above `vi.mock`'s hoisting (r3 finding 2 — the plan body covers this). Implementer subagents inherit this from the plan body verbatim; no extra effort required from the controller.

9. **Build-gated routes are never fallback targets** (`feedback_build_gated_routes_never_fallback_target.md` — M9 R12-R13). The A.2 AdminInfraError fallback link points to `/admin`, which is unconditional. Watch any future redesign that proposes a fallback URL like `/admin/dev` (build-gated by `scripts/with-admin-dev-flag.mjs`). For Phase A: `/admin` is the only escape link and is unconditional in production builds.

10. **`echo >> .gitignore` and `printf` append discipline.** None expected in Phase A — but pnpm/git untracked file additions go through `git add <files>` (specific paths, not `git add -A` / `.`).

11. **Pre-flight flakes observed at HEAD `2090dc2` (X.1 close-out)** — recorded so they're not mistaken for Phase A regressions.
    - **`tests/admin/test-auth-gate.test.ts` Layer 2 (HTTP positive-path) × 2 tests** — first vitest run returned 410 (Gone) instead of 200 for fresh-user creates (`edweiss412@gmail.com` admin + `crew-non-admin@fxav.test` non-admin). Both tests pre-clean via `admin.auth.admin.deleteUser`, so the residue must be in a paired table (likely `admin_emails`) that the pre-clean doesn't sweep. Isolated re-run of `pnpm test` was green. Treat as DB-state-leak between vitest workers.
    - **`tests/auth/advisoryLockRpcDeadlock.test.ts`** — first vitest run hit `ENOENT` on `app/admin/dev/actions.ts` (file exists on disk; cwd was the repo root). Likely a transient FS race with another worker (vitest config has `fileParallelism: false`, but `readFileSync` from the meta-test still raced under load). Re-run green.
    - **`tests/e2e/empty-state-reachability.spec.ts:179 category 3 LodgingTile-absent`** — first Playwright run reported a 1481-pixel diff (ratio 0.01 = 1% of `tile-grid` element). Re-run with the same baseline + same commit passed. WebServer logs showed an incidental hydration drift on `<RightNowCard data-prefers-reduced-motion>` (`"unknown"` → `"false"`), but RightNowCard is outside the `tile-grid` testid, so unrelated to the captured pixels. No commits since the May-17 baseline touch `components/show/`, `components/atoms/`, or `app/show/[slug]/page.tsx`. X.1 catalog text changes (ASCII → Unicode `→` / `—`) do not surface in the LEAD-not-on-reservation render path. Treat as sub-pixel antialiasing / font / timing variance.
    - **Implication for Phase A close-out stop conditions:** if any of these three flakes re-surfaces on a Phase A pre-close run, re-run the failing gate **once** to confirm flake vs persistence before treating as a Phase A regression. Phase A's deliverable does not touch any code reachable from these three tests' surfaces — `app/help/*`, `mdx-components.tsx`, and `next.config.ts` are the only surfaces; none feed into crew-page rendering, the test-auth gate, or the advisory-lock RPC matrix.

12. **Task A.1 robustness watchpoint (code-quality reviewer surfaced 2026-05-19)**: `tests/help/_mdx-pipeline.test.ts:12` dynamic-imports `@/next.config`, which evaluates `withMDX(nextConfig)` (a `createMDX({})` call from `@next/mdx@16.2.6`) at module-eval time. Empirically passes (`pnpm test tests/help/_mdx-pipeline.test.ts` → 2/2 in 106ms at SHA `8bc5235`). The reviewer flagged this as Important (85% confidence) because the wrapped-config import depends on `@next/mdx` having a side-effect-free init path under Vitest. **Disposition:** the plan body specifies this exact test shape (rounds 1–3 of plan self-review settled on this assertion mechanism). AGENTS.md §1.7 (spec is canonical) — refactoring the test or splitting the config export to dodge the dynamic import would diverge from the canonical plan without amendment. Forward-pointer: if this test ever starts flaking on CI, the fix is to read `pageExtensions` from a pre-`withMDX` raw object, which would also need a plan amendment. Re-open if the test fails on any future run.

13. **X.2 parallel-session cross-talk in the working tree.** The user's prompt notes that X.2 (no-raw-codes audit, Codex-routed) runs in a separate session against the same checkout. Observed at Phase A start: untracked `tests/cross-cutting/no-raw-codes.test.ts`, `tests/e2e/no-raw-codes.spec.ts`, `tests/cross-cutting/fixtures/no-raw-codes/`, plus a post-A.1 `ts-morph@^28.0.0` dev-dep added by X.2 to `package.json` after A.1's commit landed. **Discipline for Phase A subagents:** use `git add <specific-paths>` (never `git add -A` / `.`), and verify with `git show --stat HEAD` post-commit that the diff contains only Phase A surface files. `pnpm typecheck` will surface X.2-related errors in untracked files — those are X.2's responsibility, not Phase A's. The spec reviewer for A.1 already encountered this and correctly scoped errors to X.2.

---

## §7 Test commands

```bash
# Unit + integration (vitest):
pnpm test

# Phase A targeted runs:
pnpm test tests/help/_mdx-pipeline.test.ts                # A.1
pnpm test tests/help/auth-stub.test.ts                     # A.2
pnpm test tests/help/_nav-shape.test.ts                    # A.3
pnpm test tests/help/sidebar.test.tsx                      # A.4
pnpm test tests/help/header.test.tsx                       # A.5
pnpm test tests/help/breadcrumb.test.tsx                   # A.6
pnpm test tests/help/_metaNavSync.test.ts                  # A.7

# Lint:
pnpm lint

# Typecheck:
pnpm typecheck

# E2E (Playwright) — mobile profile:
pnpm test:e2e --project=mobile-safari
```

Pre-flight: all four green at base SHA `2090dc2`.
Post-close-out: all four green at Phase A final SHA + Phase A test files included.

---

## §8 Convergence log (adversarial review + impeccable)

Format: per-round row appended at the bottom. Round 1's "previous SHA" is the Phase A close-implementation SHA (i.e., the SHA at which all A.1–A.7 commits land — `0274a63`).

Phase A close-implementation commits (A.1–A.7):

| Task | SHA | Title |
| --- | --- | --- |
| A.1 | `8bc5235` | `feat(help): wire @next/mdx pipeline + pageExtensions + @types/mdx (Task A.1)` |
| A.2 | `8d0f5b1` | `feat(help): create /help layout with requireAdmin + AdminInfraError catch (Task A.2)` |
| A.2 review fix | `169a19f` | `test(help): tighten auth-stub assertions to call-site regexes (Task A.2 review)` |
| A.3 | `50455b1` | `feat(help): _nav.ts registry with 13 v1 pages (Task A.3)` |
| A.4 | `8d52e1d` | `feat(help): Sidebar component with mobile-collapse + aria-current highlight (Task A.4)` |
| A.4 review fix | `2072b5b` | `fix(help): suppress <details> disclosure marker on Sidebar (Task A.4 review)` |
| A.5 | `271bb22` | `feat(help): Header component with brand + back-to-admin link (Task A.5)` |
| A.6 | `6d35cf5` | `feat(help): Breadcrumb component + chrome composition in /help layout (Task A.6)` |
| A.7 | `0274a63` | `test(help): _metaNavSync meta-test + 12 page stubs (Task A.7 — TDD green)` |

Two-stage review (spec compliance + code quality) APPROVED on every task.

| Round | Date | Verdict | Findings (sev, summary) | Resolution commit | Notes |
| --- | --- | --- | --- | --- | --- |
| Impeccable §1.8 dual-gate R1 (external) | 2026-05-19 | **PASSES** (initial attest at `0274a63`) | MEDIUM (Sidebar `<details>` desktop ARIA — DEFERRED at this round), LOW × 4 (3 ACCEPT-as-is + 1 DEFERRED-to-Phase-E for stubs), P3 × 2 (skip-link DEFERRED-to-harden + MDX passthrough ACCEPT-as-is) | — | Fresh subagent (`agentId a82c8d1f01ce140f2`); critique 23/32 Good, audit 19/20 Excellent. NOTE: did NOT catch the two DESIGN.md token-pair violations Codex R1 surfaced — meta-gap watchpoint added |
| R1 Codex adversarial | 2026-05-19 | **needs-attention** | MEDIUM × 2: (1) Sidebar accent-text below DESIGN.md 14pt-bold floor + `text-text-subtle` misuse on action targets (Sidebar/Header/Breadcrumb); (2) no-raw-codes-audit excludes MDX | (1) `370298f` Phase A; (2) DEFERRED.md M11-A-D3 → X.2 | Job `review-mpd6425l-l613hp`; verified Codex claims against DESIGN.md lines 27 + 33 |
| Impeccable §1.8 dual-gate R2 (external) | 2026-05-19 | **BLOCKED** at `370298f` | HIGH × 1: side-stripe absolute ban violation (DESIGN.md line 242) introduced by the R1 fix's `border-l-2 border-accent` rail pattern — orchestrator-prescription error | `30dafe8` (drop side-stripe; rely on `bg-surface-raised text-text-strong font-semibold` for active differentiation) | Fresh subagent (`agentId a314e8a63e100dfc6`); also flagged MEDIUM (no hover on active link — accepted as deliberate per persistent-bg-as-visual-equivalent prescription) |
| R2 Codex adversarial | 2026-05-19 | **needs-attention** at `30dafe8` | MEDIUM × 1: Sidebar desktop `<details>` semantic-vs-visual divergence (the watchpoint formerly DEFERRED — Codex cites AC-11.3 + spec §6.1 as binding desktop = normal nav, not closed-disclosure-with-hidden-toggle) | `aa7b249` (restructure: `<details>` → `useState`/`useId` + `<button aria-expanded aria-controls>` + plain `<div>`; desktop has zero disclosure-widget semantics, mobile has button-controlled disclosure) | Job `review-mpd6twd0-foreground` (after 2 background attempts crashed mid-run); per `feedback_iterate_until_convergence.md` adversarial verdict overrides DEFERRED disposition when spec-cited |
| Impeccable §1.8 dual-gate R3 (external) | 2026-05-19 | **PASSES** at `aa7b249` | — | — | Fresh subagent (`agentId aa2a488f3817b9d77`); critique zero P0/P1, audit 20/20 Excellent; Codex R2 MEDIUM cleanly resolved |
| R3 Codex adversarial | 2026-05-19 | **APPROVE** at `aa7b249` | — | — | Job foreground (`bvk0ofnjh`); "No material findings. Phase A ACs remain intact, no raw error codes in new JSX." |
| Final stop-condition verification at `aa7b249` | 2026-05-19 | **PARTIAL** (Phase A surface 100% green; project-level test-isolation flakes on non-Phase-A surfaces) | typecheck ✅; lint ✅; vitest ⚠️ 2 persistent failures in `tests/admin/test-auth-gate.test.ts` Layer 2 (DB-residue test-isolation flake; `admin.auth.admin.deleteUser` pre-clean leaks paired tables; pre-existed Phase A — Phase A's 53 new test files shifted vitest sequential order, exposing the latent flake more consistently); e2e mobile-safari ⚠️ 2 snapshot pixel jitters in `tests/e2e/empty-state-reachability.spec.ts` (M3 crew-page surface, NOT Phase A; cleared on isolated re-run 4/4) | — | Both flakes documented in §6 watchpoints #11 + new entries in DEFERRED.md (M11-A-D4 + M11-A-D5) routing to project-infra follow-up |
| Project-infra flake fix #1 (e2e snapshot) | 2026-05-19 | RESOLVED at `6afc409` | sub-pixel layout/font jitter on `tile-grid` screenshot from Next.js dev-build module-cache state warmed by earlier specs | `6afc409` — `fix(tests): add hydration + fonts barrier to empty-state-reachability cat 2+3 (project-infra M11-A-D5)`. 3-line barrier (`waitForLoadState("networkidle")` + `data-prefers-reduced-motion` post-hydration wait + `document.fonts.ready`) before each of the 2 failing `toHaveScreenshot` calls. Verified: `pnpm test:e2e --project=mobile-safari` → 85 passed / 151 skipped / 0 failed |
| Project-infra flake fix #2 attempt 1 (auth-gate, wrong root-cause) | 2026-05-19 | DID NOT CONVERGE | initial investigator hypothesized pagination ceiling (`listUsers({page:1, perPage:200})` only checks page 1) — fix applied at `4add98d` added paginate-until-exhausted loops + companion patch to `tests/e2e/helpers/signInAs.ts` | `4add98d` kept (the signInAs.ts pagination IS useful for Playwright e2e use against real Supabase); but full vitest re-run still showed `expected 410 to be 200` Layer 2 failures because the patched pre-clean was operating on STUBBED data | — |
| Project-infra flake fix #2 attempt 2 (auth-gate, actual root-cause) | 2026-05-19 | RESOLVED at `e911078` | deeper investigation (`agentId a0a16c195da111dcf`) found the actual root cause: `vi.mock("@supabase/supabase-js")` at the top of `tests/admin/test-auth-gate.test.ts` GLOBALLY stubs the Supabase module for Layer 1's unit assertions; Layer 2's pre-clean imports `admin` from `tests/e2e/helpers/supabaseAdmin.ts` whose `createClient` is the STUBBED version, so `listUsers` returns `[]` and the pagination loop exits without finding the fixture user; the live dev-build server (separate Node process, real Supabase) returns 410 because the residue is still there | `e911078` — `fix(tests): use vi.importActual for test-auth-gate Layer 2 pre-clean admin client (project-infra M11-A-D4 root cause)`. Added `beforeAll` that uses `vi.importActual` to build a `realAdmin` client bypassing the file's `vi.mock`; swapped Layer 2's two pre-clean loops to use `realAdmin` instead of `admin`. Layer 1 mocked-client assertions unchanged. Verified: full `pnpm test` → 257 files / 3455 passed / 5 skipped / **0 failed** |
| **Final stop-condition verification at `e911078`** | 2026-05-19 | **PASSES** all 4 gates | typecheck ✅; lint ✅; vitest 3455/3460 passed / 5 skipped / **0 failed** ✅; e2e mobile-safari 85/236 passed / 151 skipped / **0 failed** ✅ | — | Phase A officially closed; Phase B unblocked. Final convergence path: 7 commits A.1–A.7 + 5 review/flake-fix commits = 12 commits total spanning `0274a63..e911078` |

---

## §9 Impeccable findings + dispositions (Phase A close-out)

Per AGENTS.md §1.8 + memory `feedback_impeccable_critique_not_authoritative_vs_spec.md` + `feedback_impeccable_external_attestation_required.md`. Both commands run EXTERNALLY (fresh subagent dispatch — `agentId a82c8d1f01ce140f2`) on 2026-05-19 against the Phase A close-implementation diff `2090dc2..0274a63`.

### External dual-gate scores

- `/impeccable critique` — 23/32 applicable Nielsen heuristics (**Good**)
- `/impeccable audit` — 19/20 (**Excellent**)
- **Verdict: PASSES §1.8 dual-gate.** Zero CRITICAL. Zero HIGH unresolved.

### Dispositions

| Finding | Severity | File:line | Disposition | Spec-check (if copy rewrite) | Commit / Home |
| --- | --- | --- | --- | --- | --- |
| Sidebar `<details>` semantic-vs-visual divergence on desktop (AT may announce as collapsed) | MEDIUM / P2 | `app/help/_components/Sidebar.tsx:25-34` | DEFERRED → [`DEFERRED.md#m11-a-d1`](../DEFERRED.md) | §6.1 (no desktop-semantics constraint); spec NOT violated | Phase B re-eval; trigger = next Sidebar touch |
| "Help unavailable" heading copy | LOW | `app/help/layout.tsx:30` | ACCEPT-as-is | §3.5 mandates verbatim-mirror of `app/admin/layout.tsx:56` "Admin session unavailable" | n/a |
| "Back to admin →" link copy + Unicode arrow | LOW | `app/help/_components/Header.tsx:19` | ACCEPT-as-is | X.1 catalog-parity convention (`->` → `→` Unicode normalization); destination `/admin` unconditional (NOT build-gated per `feedback_build_gated_routes_never_fallback_target.md`) | n/a |
| Stub MDX pages render only `<h1>` (12 files) | LOW | 11 `.mdx` + `app/help/errors/page.tsx` | DEFERRED → planned scope | Spec §4.1–§4.3 owns the content; Phase E.1–E.13 replaces each stub in place | Phase E (planned) |
| Breadcrumb "Help" segment is self-link on root `/help` | LOW / P3 | `app/help/_components/Breadcrumb.tsx:13-14` | ACCEPT-as-is | No spec contract on root breadcrumb shape; Doug-the-admin will not be confused | n/a (or 1-line opportunistic fix at next Breadcrumb touch) |
| No skip-link to main content from chrome | P3 polish | `app/help/layout.tsx:46-57` | DEFERRED → [`DEFERRED.md#m11-a-d2`](../DEFERRED.md) | No spec citation; WCAG 2.4.1 polish | Phase I `/impeccable harden` pass |
| `mdx-components.tsx` passthrough is identity (Phase A scaffold) | P3 | `mdx-components.tsx:11-16` | ACCEPT-as-is | Phase D Task D.7 registers Callout / Step / Screenshot / RefAnchor / TipFromSheets per spec | Phase D (planned) |

### Token-discipline + anti-pattern notes

- 100% design tokens used (`bg-accent`, `text-accent-text`, `text-text-strong/subtle`, `surface-raised`, `border`, `p-page-pad-{mobile,desktop}`, `section-gap`, `tap-min` — all verified live in `app/globals.css` `@theme`).
- Zero hex literals, zero arbitrary values.
- No anti-patterns (no gradient text, no glassmorphism, no hero-metric template, no card-grid, no side-stripe borders, no nested cards, no em dashes in shipped UI strings, no `#000`/`#fff`).
- `"use client"` boundary used only where needed (Sidebar + Breadcrumb for `usePathname`); Header is server (ThemeToggle carries its own internal client boundary).
- Mirror-the-admin-layout discipline: AdminInfraError branch structurally identical to `app/admin/layout.tsx:47-71`.

Disposition legend: **FIXED** (commit SHA), **DEFERRED** (link to `DEFERRED.md` — concrete trigger / scheduled phase home), **BACKLOG** (link to `docs/superpowers/plans/BACKLOG.md` — speculative, no scheduled home), **ACCEPT-as-is** (spec-cited or AGENTS.md-cited rationale + Doug-the-admin v1 impact assessment).

---

## §10 Performance & bundle impact

Phase A adds dependencies `@next/mdx`, `@mdx-js/loader`, `@mdx-js/react`, and dev `@types/mdx`. Capture baseline at pre-flight and delta at close-out:

- Pre-flight `pnpm install` size: TBD
- Post-A.1 `pnpm install` size delta: TBD
- `next build` bundle size delta: TBD
- Per-route static analysis (if available): TBD

---

## §11 Linked content deferred / phantom-target audit

Per `feedback_deferral_discipline.md`. Phase A is not expected to defer anything; if items surface, route per the three-bucket discipline:

- **Land-now:** small mechanical fix, <~30 LOC, no milestone-significant abstraction.
- **DEFERRED.md (per-plan):** blocked on planned future M11 phase (B / C / D / E / F / G / H / I) with concrete trigger.
- **BACKLOG.md (project-wide):** speculative, no scheduled home, no concrete trigger. Aspirational milestone names are NOT real homes.

Initial expected deferrals from Phase A: **none**. Phase E owns the 12 page-content backfills (the A.7 stubs become Phase-E edit-in-place targets — that's planned scope, not a deferral).

---

## §12 Sign-off

- [x] Implementer (Opus / Claude Code): 2026-05-19 — final SHA `e911078`
- [x] External impeccable dual-gate APPROVED on 2026-05-19 — R1 at `0274a63` (subagent `a82c8d1f01ce140f2`), R2 at `370298f` (subagent `a314e8a63e100dfc6`), R3 at `aa7b249` (subagent `aa2a488f3817b9d77`); final audit 20/20 Excellent at `aa7b249`
- [x] Reviewer (Codex cross-CLI) APPROVE on 2026-05-19 — R1 needs-attention (`review-mpd6425l-l613hp`), R2 needs-attention (`review-mpd6twd0-foreground`), R3 APPROVE (`bvk0ofnjh`)
- [ ] User review: __ date __

Phase A marked **closed**. Phase B (catalog extension) unblocked.

## §13 Project-infra debt closed in Phase A close-out

Two project-level test-isolation flakes that surfaced during Phase A close-out verification (NOT caused by Phase A but exposed by it via vitest sequential-file ordering changes from new tests/help/ files):

- **M11-A-D4** (auth-gate Layer 2 mock leakage) — RESOLVED at `e911078`. Original DEFERRED entry preserved for the convergence record. Root cause: `vi.mock("@supabase/supabase-js")` leaked into Layer 2's pre-clean; fix uses `vi.importActual` to instantiate a real admin client just for Layer 2.
- **M11-A-D5** (e2e tile-grid hydration jitter) — RESOLVED at `6afc409`. Original DEFERRED entry preserved. Root cause: Next.js dev-build first-paint timing varies under module-cache warmth; fix adds an explicit hydration + fonts barrier before the 2 failing screenshot assertions.

Both DEFERRED entries (M11-A-D4 + M11-A-D5) MARKED RESOLVED in `DEFERRED.md` with the resolution commits.

## §14 Phase A meta-observations carried forward to Phase B

Three meta-observations from Phase A's review iterations worth recording for future phases:

1. **Impeccable v3 token-discipline does NOT natively catch DESIGN.md contrast-pair rules or absolute-ban rules** (e.g., the >1px side-stripe ban on line 242, the ≥14pt-bold floor for accent-text on accent-bg on line 33, the "never used for action targets" on text-text-subtle on line 27). v3 verifies "uses tokens" + "no hardcoded hex" but not pair-compatibility. The Phase A R1 + R2 fix rounds caught these only after Codex adversarial review. Preventive measure for Phase B+: add a pre-attestation grep checklist to the orchestrator's UI close-out instructions:
   - `rg "text-text-subtle.*(?:<a|<button|<Link|href|onClick)" app/help` → catches subtle-on-action
   - `rg "bg-accent.*text-accent-text" app/help` → narrow to `text-(sm|xs)` matches
   - `rg "border-(l|r)-[2-9]|border-(l|r)-\[" app/help` → catches side-stripe ban
   - Promote to a structural meta-test (`tests/styles/_metaDesignTokenPairs.test.ts`) if a third same-vector finding lands.

2. **Codex companion `--background` mode can crash mid-run after firing one command** — observed twice on Phase A R2 attempts (jobs `review-mpd6dpqh-5kmstq` and `review-mpd6rqqc-t8u334` both died after 1 command, log frozen at 418 bytes; PID gone but status JSON kept reporting "running"). Foreground `--wait` mode worked on the 3rd retry. Add to Monitor scripts: detect PID-death (not just file-size stall) as a terminal condition (already integrated). If the companion repeatedly crashes in `--background` for a given session, fall back to `--wait` foreground after the 2nd consecutive crash rather than continuing to retry background.

3. **AGENTS.md §1.8 every-UI-mutation-re-triggers-the-gate rule held up under stress** — Phase A had 3 UI-mutating fix commits (370298f, 30dafe8, aa7b249), each re-triggered an external impeccable dual-gate, each gate caught real issues (token-pair violation in R1, side-stripe regression in R2, no new issues in R3). Self-attestation at any point would have shipped one of the two intermediate DESIGN.md violations. Memory `feedback_impeccable_external_attestation_required.md` continues to be load-bearing; do not weaken.
