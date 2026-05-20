# Handoff — M11 Phase D: MDX components (Tasks D.1–D.7)

**Status:** IN PROGRESS — handoff authored 2026-05-20.

**Handed off:** 2026-05-20 by Eric Weiss (orchestrator session "Orchestrator — M11").
**Implementer:** Opus 4.7 / Claude Code via `superpowers:subagent-driven-development` (per AGENTS.md "UI work is always Opus" hard rule + ROUTING.md row "D — MDX components" all-Opus).
**Adversarial reviewer:** GPT-5.5 / Codex CLI via `/codex:adversarial-review --background --base 023d312` (cross-CLI per ROUTING.md reviewer-pairing logic; mirrors Phase A's Opus-implementer / Codex-reviewer pairing).
**Plan file:** `docs/superpowers/plans/2026-05-12-user-facing-docs/04-components.md` (Tasks D.1–D.7).

> Phase D is **single-implementer**. No §A/§B split. No pin-stops. All seven tasks (D.1 → D.7) ship in one continuous TDD-disciplined sequence inside this orchestrator session via fresh-subagent-per-task dispatch.
> Phase D is **heavy UI**. AGENTS.md §1.8 impeccable v3 dual-gate fires **per component** (six visual components + one wiring task), with EXTERNAL attestation each time per memory `feedback_impeccable_external_attestation_required.md`. The wiring task (D.7) carries no visual surface — its impeccable gate fires at phase close-out together with the cumulative diff.

---

## §1 Session metadata

- **Session date(s):** 2026-05-20 (start) — close-out date TBD.
- **Implementer:** Opus 4.7 / Claude Code (orchestrator + fresh subagent per task via `superpowers:subagent-driven-development`).
- **Reviewer:** Codex (cross-CLI) via `/codex:adversarial-review`.
- **Base branch:** `main` at commit `023d312` (head of `main` at handoff authoring; X.6 R2 APPROVE complexity-hypothesis confirmed; Phase C closed at `6c7e6de`; Phase B closed at `cd14865`; Phase A closed at `e911078`).
- **Plan version:** `docs/superpowers/plans/2026-05-12-user-facing-docs/` r1 (commit `977dc78` — M12 → M11 rename, 2026-05-19). Plan body 04-components.md is r2-converged (r1 used `<Screenshot key>`; r2 renamed prop to `name` to dodge React-reserved-`key` strip; r3-r5 added empty-`name` build-fail + RefAnchor `as` prop for /help/errors h3 usage).
- **Spec version:** `docs/superpowers/specs/2026-05-12-user-facing-docs-design.md` r14 (current HEAD per Phase A handoff §1). Phase D consumes §3 (MDX pipeline contract), §5 (component shapes), §6 (Components section), §7.1 test #10 (`<picture>` contract — full assertion is Phase F.6, D.4 ships the minimal unit shape).

---

## §2 Phase progress

- [ ] **Phase D — MDX components** (`04-components.md`) — STATUS PENDING
  - [ ] Task D.1 — `<Callout type>` component
  - [ ] Task D.2 — `<Step n>` component
  - [ ] Task D.3 — `<ScreenshotPlaceholder>` draft scaffold
  - [ ] Task D.4 — `<Screenshot name>` production component
  - [ ] Task D.5 — `<RefAnchor id>` component
  - [ ] Task D.6 — `<TipFromSheets>` component
  - [ ] Task D.7 — Register all six in `mdx-components.tsx`
  - [ ] Per-component impeccable §1.8 dual-gate (6 visual components × 2 commands = 12 external attestations)
  - [ ] Phase-level adversarial review (Codex)
  - [ ] Final gates green (`pnpm test && pnpm lint && pnpm typecheck && pnpm test:e2e --project=mobile-safari`)

Other phases: A done at `e911078`; B done at `cd14865`; C done at `6c7e6de`; E–I tracked in their own per-phase handoffs.

---

## §3 Spec sections in scope (Phase D only)

- **§3** — MDX pipeline contract (`@next/mdx` registration via `mdx-components.tsx`; Phase A scaffolded the empty export, D.7 extends it).
- **§5** — Component shape definitions for each of the six components (`<Callout>`, `<Step>`, `<ScreenshotPlaceholder>`, `<Screenshot>`, `<RefAnchor>`, `<TipFromSheets>`).
- **§6.2** — Per-component visual / palette / icon / role specifications.
- **§6.3** — Defensive guards (Callout unknown `type` → defaults to `note`; Screenshot empty `name` → build-fail; RefAnchor id regex `^[A-Z][A-Z0-9_]*$`).
- **§7.1 test #10** — `<picture>` contract for `<Screenshot>` (D.4 ships the minimal unit assertion; the full coverage + manifest meta-test land in Phase F).

Out of scope for Phase D (deferred to later phases):
- Page content using these components (Phase E.1–E.13).
- Screenshot manifest + actual WebPs on disk (Phase F.6/F.7/F.8/F.10).
- Affordance retrofit in `/admin/*` calling new affordances that link into help (Phase G).
- Auth-integration Playwright tests (Phase H).
- Phase-level impeccable v3 dual-gate over the full M11 surface (Phase I.1).

---

## §4 Acceptance criteria

Only AC rows Phase D scaffolds or fully satisfies are listed.

| AC | Phase D target | Notes |
| --- | --- | --- |
| AC-11.14 | PASS | `<Callout>` renders with note/warning/tip variants; unknown type defaults to note (spec §6.3 guard). |
| AC-11.15 | PASS | `<Step>` renders numbered procedural steps with tabular figures. |
| AC-11.16 | PASS | `<ScreenshotPlaceholder>` renders a labeled empty box for draft authoring; lint-prohibited in shipped v1 MDX (enforcement is Phase H.4). |
| AC-11.17 | PASS | Conventional-commits `feat(help): …` per AGENTS.md §1.6 (one commit per task). |
| AC-11.18 | PARTIAL | `<Screenshot>` renders `<picture>` with light + dark sources at `/help/screenshots/<name>-{light,dark}.webp`. Full manifest-driven contract is Phase F. |
| AC-11.19 | PASS | `<RefAnchor>` renders heading + click-to-copy link affordance; `id` matches catalog-code regex `^[A-Z][A-Z0-9_]*$` or throws at render. Defaults to h2; opt-in `as="h3"` for `/help/errors` per-code listings. |
| AC-11.20 | PASS | `<TipFromSheets>` renders adoption-track aside with distinct "From Sheets" eyebrow. |
| AC-11.21 | PASS | `mdx-components.tsx` registers all six components so `.mdx` files reference them by name without per-file imports. |

ACs NOT addressed by Phase D: AC-11.1–AC-11.13 (A/B/E), AC-11.22–AC-11.24 + AC-11.31 (A — already PASS), AC-11.25–AC-11.30 (F/G), AC-11.32–AC-11.39 (C/F/G/H). AC-11.5/AC-11.6/AC-11.11/AC-11.35 closed in Phase B.

---

## §5 Plan-wide invariants — applicability to Phase D

These are AGENTS.md's 9 invariants layered with M11's per-plan additions.

| # | Invariant | Phase D applicability |
| --- | --- | --- |
| AGENTS.md §1.1 | **TDD per task.** | **ACTIVE.** Every D.1–D.7 task: failing test → minimal implementation → passing test → commit. The plan body specifies the failing test before the implementation in every task. |
| AGENTS.md §1.2 | **Per-show advisory lock.** | **N/A for Phase D.** No DB-touching code. |
| AGENTS.md §1.3 | **Email canonicalization at every boundary.** | **N/A for Phase D.** No email handling. |
| AGENTS.md §1.4 | **No global sync cursor.** | **N/A for Phase D.** |
| AGENTS.md §1.5 | **No raw error codes in user-visible UI.** | **ACTIVE — STRUCTURAL.** `<RefAnchor id>` accepts catalog-code-shaped ids (`^[A-Z][A-Z0-9_]*$`) for `/help/errors` per-code section anchors, but the rendered TEXT is the cataloged `title` / `longExplanation` from Phase B's schema extension, NOT the raw code in copy. The id is a DOM anchor, not user-visible body copy. Phase E.13 wires the rendered text; Phase D ships the structural component. No raw `err.code` rendered in any new JSX. |
| AGENTS.md §1.6 | **Commit per task.** | **ACTIVE.** Conventional-commits `feat(help): <summary>` per the plan body's per-task commit message. Never batch multiple D.* tasks into one commit. |
| AGENTS.md §1.7 | **Spec is canonical.** | **ACTIVE.** Any disagreement between plan body and spec → open a question, do not silently fix. The plan body 04-components.md is itself r5-converged; trust it. |
| AGENTS.md §1.8 | **impeccable v3 critique + audit dual-gate.** | **ACTIVE — FIRES PER COMPONENT.** Six visual components, each ships only after EXTERNAL `/impeccable critique` AND `/impeccable audit` pass on the per-component diff. Wiring task D.7 carries no new visual surface; its dual-gate runs together with the phase-close cumulative diff. HIGH/P0/P1 fixed inline OR routed per `feedback_deferral_discipline.md`. Spec-check any copy-rewriting disposition per memory `feedback_impeccable_critique_not_authoritative_vs_spec.md`. |
| AGENTS.md §1.9 | **Supabase call-boundary discipline.** | **N/A for Phase D.** No new Supabase call sites. |
| M11 plan-wide #4 | **No raw error codes in user-visible UI** (AGENTS.md #5 echo). | Same as §1.5 above. |
| M11 plan-wide #5 | **impeccable v3 UI gate** (AGENTS.md #8 echo). | Same as §1.8 above — fires per component. |
| M11 plan-wide #7 | **`MessageCatalogEntry` additive extension.** | **READ-ONLY in Phase D.** `<RefAnchor>` will eventually be consumed by `/help/errors` to render per-entry sections (Phase E.13). Phase D ships the component; Phase E reads `title` / `longExplanation` / `helpHref`. |
| M11 plan-wide #8 | **Catalog-master-spec alignment.** | **N/A for Phase D.** Closed in Phase B. |
| M11 plan-wide #9 | **`lib/time/now.ts` is the only server-side render-time source.** | **N/A for Phase D.** None of the six MDX components reads server time. (Phase F's screenshot harness consumes `nowDate()` for `X-Screenshot-Frozen-Now`; Phase D's `<Screenshot>` is a pure renderer over manifest keys.) |
| M11 plan-wide #10 | **§5.6 affordance matrix is the §9.0.1 retrofit contract.** | **N/A for Phase D.** Phase G is the implementer. |

---

## §6 Watchpoints (class-vectors carried forward)

Per AGENTS.md "Same-vector recurrence" + Disagreement-loop preempt rules. Pre-loaded BEFORE adversarial review fires so the reviewer is anchored on prior-incident context, not discovering it round-N.

1. **DESIGN.md absolute side-stripe ban (line 242): "No side-stripe borders > 1px on cards or tiles."** The plan body for D.1 `<Callout>` and D.6 `<TipFromSheets>` uses `border-l-4`. Phase A R1/R2 (Codex round) caught this exact pattern on Sidebar's active-link rail and required removal (commit `30dafe8`). **Disposition for Phase D:** the plan body 04-components.md is r5-converged and AGENTS.md §1.7 declares spec canonical; implementers ship the plan body verbatim, then the per-component external impeccable dual-gate surfaces the violation, then we fix in-phase. Pre-load Codex on this so it does not treat the eventual fix-commit as scope drift. **If the same-vector finding occurs on a third component (Callout + TipFromSheets are 2; any third triggers `feedback_same_vector_recurrence_triggers_comprehensive_reanalysis.md`), ship a structural defensive layer** — e.g., extend the (DEFERRED, Phase-A §14.1 sketched) `tests/styles/_metaDesignTokenPairs.test.ts` grep meta-test rather than per-instance whack-a-mole.

2. **DESIGN.md accent-text-on-accent-bg ≥14pt-bold floor (line 33).** The plan body for D.2 `<Step>` uses `bg-accent text-accent-text font-semibold text-sm`. `text-sm` is 0.875rem ≈ 14px — below the 14pt (≈18.66px ≈ `text-lg`) floor, and `font-semibold` (600) is not strictly bold (700). Same-vector with Phase A R1 (Sidebar `text-accent-text text-sm` on accent-bg pill). **Disposition:** implementers ship plan body verbatim; per-component dual-gate catches; in-phase fix follows. The compact 7×7px numeric badge in the Step component is a tight visual constraint — fix may need a DESIGN.md "≥14pt-bold floor exemption for ≤2-character numeric badges" amendment OR a switch to non-accent palette. The orchestrator surfaces this question if the impeccable gate flags it. Spec-check rationale: spec §6.2 for Step says "numbered procedural step" but does NOT pin a specific token combination; this is a DESIGN.md contrast contract, not a spec contract, so DESIGN.md wins per AGENTS.md token-discipline rules.

3. **`text-text-subtle` on action targets ban (DESIGN.md line 27 — Phase A R1 finding).** The plan body for D.5 `<RefAnchor>` renders the copy-link affordance as `<a href="#X" className="text-text-subtle ...">`. The anchor is an action target (it is a copyable link). Same vector as Phase A R1 Sidebar/Header/Breadcrumb misuse. **Disposition:** same pattern — plan body verbatim, per-component dual-gate catches, in-phase fix follows.

4. **React-reserved `key` attribute trap (D.4 plan body §r2 fix per D-r1 finding 1 — CRITICAL).** The plan body for `<Screenshot>` already corrected to `name` after the r1 draft used `key` (React strips `key` before props arrive — every page would have rendered `/help/screenshots/undefined-light.webp`). **Disposition:** the regression-guard test in D.4 Step 1 asserts `expect(html).not.toContain("undefined")` — implementers must keep this assertion intact through any subsequent refactor. **Codex watchpoint:** if a future round suggests "rename `name` back to `key` for ergonomic parity with React reconciler keys," that suggestion is wrong — escalate.

5. **Empty-name → build-fail invariant (D.4 plan body §r4 fix per D-r3 finding 2).** Spec §6.3 documents `<Screenshot name="">` must throw. Plan body throws synchronously inside the component body. Two assertions in the unit test pin this — empty-string and whitespace-only. **Watchpoint:** if implementers add a `?? ""` fallback to `name` or move the validation behind a `useEffect`, the build-fail invariant is broken. Hold the line.

6. **RefAnchor `as` prop for `/help/errors` per-code h3 listings (D.5 plan body §r5 fix per D-r4 finding 1).** Plan body supports `as="h2"` (default, Phase E section-heading usage) and `as="h3"` (Phase E.13 per-code listings under an h2 page heading). **Watchpoint:** if an implementer drops the union type and uses raw `string`, the heading-level discipline weakens. Hold the union.

7. **RefAnchor id regex throw (D.5 build-time invariant).** The component throws synchronously when `id` does not match `^[A-Z][A-Z0-9_]*$`. **Watchpoint:** the test asserts `expect(() => render(...)).toThrow()`. React 19's strict mode + concurrent rendering can mask sync throws in some test configurations; verify the throw fires in the unit-render path (jsdom-environment is sync, no concurrent batching).

8. **vitest env discipline.** Phase A's watchpoint #8 — React DOM tests start with `// @vitest-environment jsdom` AND import `vi` explicitly. The plan body for D.1–D.7 already includes both directives. Implementer subagents inherit verbatim.

9. **Impeccable v3 critique disposition rewrites are NOT authoritative against the spec** (M8 R2 M2 — `feedback_impeccable_critique_not_authoritative_vs_spec.md`). If any external `/impeccable critique` returns dispositions that rewrite component copy (Callout icon characters, "Screenshot pending — …" placeholder text, "From Sheets" eyebrow text, "Copy link to this section" aria-label), GREP spec §6.2 and §5 component shapes BEFORE shipping the rewrite. M8 §13.1 was the precedent (channel-boundary inversion shipped via a critique disposition).

10. **Impeccable v3 dual-gate requires EXTERNAL attestation** (M9 R10/R11/R16/R17 — `feedback_impeccable_external_attestation_required.md`). Every per-component dual-gate runs in a fresh subagent dispatch (`Agent` tool with the impeccable skill loaded), NOT in the same orchestrator/implementer session that wrote the UI. Self-attestation = §1.8 failure. Every post-review UI mutation also re-triggers the dual-gate for the affected component.

11. **Deferral discipline — three buckets** (`feedback_deferral_discipline.md`). Small mechanical fixes that surface during impeccable / adversarial review LAND NOW inside Phase D (default for <~30 lines, no milestone-significant abstraction). Items blocked on planned future phases (E/F/G/H/I) → `DEFERRED.md`. Speculative items with no scheduled home → `BACKLOG.md`.

12. **Tailwind v4 `.flex` does NOT default to `align-items: stretch`** (`feedback_tailwind_v4_flex_items_stretch.md`). The plan body has several flex containers:
    - `Callout`: `flex gap-3` (icon + body) — no fixed-height parent; OK.
    - `Step`: `flex gap-3 items-start` (number + body) — `items-start` explicit; OK.
    - `RefAnchor`: heading `flex items-center gap-2` — explicit `items-center`; OK.
    No fixed-dimension parent in Phase D's surface, so no dimensional-invariants Playwright assertion required. **Watchpoint:** if any in-phase fix introduces a fixed-dimension parent, ADD the Playwright assertion per AGENTS.md writing-plans additions.

13. **`echo >> .gitignore` and `printf` append discipline.** None expected in Phase D — but pnpm/git untracked file additions go through `git add <specific-paths>` (never `git add -A` / `.`).

14. **Phase D pre-flight flakes carried forward from Phase A close-out.** Both resolved at `e911078` (auth-gate mock leak via `vi.importActual`) and `6afc409` (e2e snapshot hydration barrier). If either re-surfaces during Phase D close-out gates, treat as project-infra regression and investigate independently of Phase D scope.

15. **X.6 parallel-session cross-talk.** X.6 (Codex-routed verifier-script audit) re-opened to R3 at `851b03d` then closed at `023d312`. At Phase D start, working tree is clean (`git status` clean per orchestrator pre-flight). No anticipated X.* parallel sessions during Phase D, but if one materializes, use `git add <specific-paths>` per Phase A watchpoint #13.

---

## §7 Test commands

```bash
# Unit + integration (vitest):
pnpm test

# Phase D targeted runs:
pnpm test tests/help/callout.test.tsx                   # D.1
pnpm test tests/help/step.test.tsx                      # D.2
pnpm test tests/help/screenshot-placeholder.test.tsx    # D.3
pnpm test tests/help/screenshot.test.tsx                # D.4
pnpm test tests/help/ref-anchor.test.tsx                # D.5
pnpm test tests/help/tip-from-sheets.test.tsx           # D.6
pnpm test tests/help/mdx-components-registration.test.ts # D.7

# Lint:
pnpm lint

# Typecheck:
pnpm typecheck

# E2E (Playwright) — mobile profile:
pnpm test:e2e --project=mobile-safari
```

Pre-flight: all four green at base SHA `023d312`.
Post-close-out: all four green at Phase D final SHA + Phase D test files included.

---

## §8 Convergence log (adversarial review + impeccable)

Format: per-round row appended at the bottom. Round 1's "previous SHA" is the Phase D close-implementation SHA (the SHA at which all D.1–D.7 commits land).

Phase D close-implementation commits (D.1–D.7): TBD.

| Task | SHA | Title |
| --- | --- | --- |
| D.1 | TBD | `feat(help): Callout component (note/warning/tip) (Task D.1)` |
| D.2 | TBD | `feat(help): Step component for numbered procedures (Task D.2)` |
| D.3 | TBD | `feat(help): ScreenshotPlaceholder draft component (Task D.3)` |
| D.4 | TBD | `feat(help): Screenshot production component with <picture> + dark source; prop is name (not React-reserved key) (Task D.4)` |
| D.5 | TBD | `feat(help): RefAnchor with click-to-copy link icon + id regex validation (Task D.5)` |
| D.6 | TBD | `feat(help): TipFromSheets adoption-track aside component (Task D.6)` |
| D.7 | TBD | `feat(help): register all six MDX components in mdx-components.tsx (Task D.7)` |

| Round | Date | Verdict | Findings (sev, summary) | Resolution commit | Notes |
| --- | --- | --- | --- | --- | --- |
| Per-component impeccable §1.8 dual-gate D.1 | TBD | TBD | TBD | TBD | external attestation |
| Per-component impeccable §1.8 dual-gate D.2 | TBD | TBD | TBD | TBD | external attestation |
| Per-component impeccable §1.8 dual-gate D.3 | TBD | TBD | TBD | TBD | external attestation |
| Per-component impeccable §1.8 dual-gate D.4 | TBD | TBD | TBD | TBD | external attestation |
| Per-component impeccable §1.8 dual-gate D.5 | TBD | TBD | TBD | TBD | external attestation |
| Per-component impeccable §1.8 dual-gate D.6 | TBD | TBD | TBD | TBD | external attestation |
| Per-component impeccable §1.8 dual-gate D.7 + phase close | TBD | TBD | TBD | TBD | covers wiring + cumulative |
| R1 Codex adversarial | TBD | TBD | TBD | TBD | base = `023d312` (Phase D base) |

---

## §9 Impeccable findings + dispositions (Phase D)

Per AGENTS.md §1.8 + memories `feedback_impeccable_critique_not_authoritative_vs_spec.md` + `feedback_impeccable_external_attestation_required.md`. Each row corresponds to a per-component external dual-gate run.

| Component | Finding | Severity | File:line | Disposition | Spec-check (if copy rewrite) | Commit / Home |
| --- | --- | --- | --- | --- | --- | --- |
| TBD | | | | | | |

---

## §10 Performance & bundle impact

Phase D adds ~400 LOC of new code (six components + tests + registration). No new npm deps.

- Pre-flight `pnpm install` size: unchanged from `023d312`
- Post-Phase D bundle size delta: TBD
- Per-route static analysis (if available): TBD

---

## §11 Linked content deferred / phantom-target audit

Per `feedback_deferral_discipline.md`. Initial expected deferrals from Phase D: **none**. Phase E owns the content using these components; Phase F owns the screenshot manifest backing `<Screenshot>`.

If any items surface during Phase D execution, route per the three-bucket discipline:
- **Land-now:** small mechanical fix, <~30 LOC, no milestone-significant abstraction.
- **DEFERRED.md (per-plan):** blocked on planned future M11 phase (E / F / G / H / I) with concrete trigger.
- **BACKLOG.md (project-wide):** speculative, no scheduled home, no concrete trigger. Aspirational milestone names are NOT real homes.

---

## §12 Sign-off

- [ ] Implementer (Opus / Claude Code): __ date __ — final SHA __
- [ ] External impeccable dual-gate APPROVED per-component (D.1, D.2, D.3, D.4, D.5, D.6) + phase-close cumulative (covers D.7 wiring) on __ date __
- [ ] Reviewer (Codex cross-CLI) APPROVE on __ date __
- [ ] User review: __ date __

Phase D marked **closed** in `ROUTING.md`.

## §13 Meta-test inventory

Per AGENTS.md writing-plans additions: declare which structural meta-tests this phase CREATES or EXTENDS.

**Phase D CREATES:** none expected. The six per-component unit tests + the D.7 registration test ARE the surface tests; they are not structural meta-tests (they assert behavior of specific files, not invariants across a registry).

**Phase D EXTENDS:** none expected.

**Phase D candidate registrations** (if a same-vector recurrence triggers a structural defensive layer per watchpoint #1):
- `tests/styles/_metaDesignTokenPairs.test.ts` — DEFERRED candidate from Phase A §14.1 sketch. If a third same-vector finding lands on the side-stripe class OR the accent-text-on-accent-bg class OR the text-subtle-on-action class during Phase D adversarial review, promote that meta-test to landed code in Phase D and add it to this registry.

**Justification for not pre-creating the meta-test in Phase D:** the `feedback_meta_contract_test_for_recurring_bug_class.md` rule fires after **3+ consecutive review rounds** of the same vector. Phase A surfaced 2 instances (side-stripe + text-subtle-on-actions). Phase D plan body has 2 anticipated instances of side-stripe (Callout + TipFromSheets) and 1 anticipated instance of accent-text-on-accent-bg (Step) and 1 anticipated instance of text-subtle-on-action (RefAnchor copy-link). If all four surface in adversarial review, the side-stripe class will be at 4 instances total (across Phase A + Phase D) — that crosses the threshold and the meta-test lands in Phase D. If only some surface, the threshold may not be crossed yet, in which case the meta-test remains deferred per `feedback_deferral_discipline.md`.

## §14 Phase D meta-observations (populated at close-out)

TBD. Track meta-observations from Phase D's review iterations worth carrying forward to Phase E and beyond.
