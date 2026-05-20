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

- [x] **Phase D — MDX components** (`04-components.md`) — STATUS: implementation + impeccable §1.8 dual-gates complete; awaiting Codex APPROVE; final SHA recorded on approval
  - [x] Task D.1 — `<Callout type>` component (`b220041` + impeccable-fix `293e0e9`)
  - [x] Task D.2 — `<Step n>` component (`97ae6f2` + fix-1 `8ed74eb` + fix-2 `3ee35e1`)
  - [x] Task D.3 — `<ScreenshotPlaceholder>` draft scaffold (`87ee73f` + em-dash fix `d9fcc07`)
  - [x] Task D.4 — `<Screenshot name>` production component (`6e26bf7`)
  - [x] Task D.5 — `<RefAnchor id>` component (`d57f147` + 3-HIGH fix `ddb66b1` + Codex R1 as-guard fix `5f508ad`)
  - [x] Task D.6 — `<TipFromSheets>` component (`9ed66de` + pre-flagged fix `c580074`)
  - [x] Task D.7 — Register all six in `mdx-components.tsx` (`4ee6892`)
  - [x] Structural meta-test `tests/styles/_metaDesignTokenPairs.test.ts` (same-vector recurrence trigger, `7d2929b`)
  - [x] Per-component impeccable §1.8 dual-gate — 6 visual components, each via EXTERNAL fresh-subagent dispatch. ALL PASSES (see §8 convergence log).
  - [x] Phase-close cumulative impeccable §1.8 dual-gate — PASSES 31/32 + 20/20 (see §8).
  - [x] Phase-level adversarial review (Codex) — iterating until APPROVE; see §8 R-row table for the per-round verdicts and resolutions. Severity strictly non-increasing across rounds; each finding NEW vector (not finding re-litigation).
  - [x] Final gates green: `pnpm test` 3687/3692 pass + 5 skipped + 0 failed; `pnpm lint` clean; `pnpm typecheck` clean; `pnpm test:e2e --project=mobile-safari` 85/236 pass + 151 skipped + 0 failed (after re-run of 2 documented sub-pixel-jitter flakes per Phase A watchpoint #11).

Other phases: A done at `e911078`; B done at `cd14865`; C done at `6c7e6de`; E–I tracked in their own per-phase handoffs.

---

## §3 Spec sections in scope (Phase D only)

- **§3** — MDX pipeline contract (`@next/mdx` registration via `mdx-components.tsx`; Phase A scaffolded the empty export, D.7 extends it).
- **§5** — Component shape definitions for each of the six components (`<Callout>`, `<Step>`, `<ScreenshotPlaceholder>`, `<Screenshot>`, `<RefAnchor>`, `<TipFromSheets>`).
- **§6.2** — Per-component visual / palette / icon / role specifications.
- **§6.3** — Defensive guards (Callout unknown `type` → defaults to `note`; Screenshot empty `name` → build-fail; RefAnchor id regex `^(MI-\d+[a-z]?_)?[A-Z][A-Z0-9_]*$` — spec §6.3 r15 amendment for MI-class catalog codes per commit `504b533`; RefAnchor `as` prop union `"h2" | "h3"` + runtime guard per commit `5f508ad`).
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
| AC-11.14 | PASS | `<Callout>` renders with note/warning/tip variants; unknown type defaults to note (spec §6.3 guard). Final SHA `293e0e9` (impeccable-driven Tip-contrast + side-stripe fixes). |
| AC-11.15 | PASS | `<Step>` renders numbered procedural steps with tabular figures. Final SHA `3ee35e1` (Phase A R2 pattern: bg-surface-raised + text-accent-on-bg + border-accent). |
| AC-11.16 | PASS | `<ScreenshotPlaceholder>` renders a labeled empty box for draft authoring; lint-prohibited in shipped v1 MDX (enforcement is Phase H.4). Final SHA `d9fcc07` (em-dash → colon). |
| AC-11.17 | PASS | Conventional-commits `feat(help):` for implementations / `fix(help):` for impeccable-driven fixes / `test(styles):` for the meta-test. One commit per task / one commit per fix per AGENTS.md §1.6. |
| AC-11.18 | PARTIAL | `<Screenshot>` renders `<picture>` with light + dark sources at `/help/screenshots/<name>-{light,dark}.webp`. Full manifest-driven contract is Phase F. SHA `6e26bf7`. |
| AC-11.19 | PASS | `<RefAnchor>` renders heading + click-to-copy link affordance with real `navigator.clipboard.writeText()` handler per spec §6.2 (Codex R2 fix `1e45e5d`); `id` matches catalog-code regex `^(MI-\d+[a-z]?_)?[A-Z][A-Z0-9_]*$` (spec §6.3 r15 amendment, Codex R3 fix `504b533`) or throws at render. Defaults to h2; opt-in `as="h3"` for `/help/errors` per-code listings with runtime guard for MDX callers (Codex R1 fix `5f508ad`). Final D.5 SHA `504b533`. |
| AC-11.20 | PASS | `<TipFromSheets>` renders adoption-track aside with distinct "From Sheets" eyebrow. Final SHA `c580074` (preemptive side-stripe + contrast fix). |
| AC-11.21 | PASS | `mdx-components.tsx` registers all six components so `.mdx` files reference them by name without per-file imports. SHA `4ee6892`. |

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
| AGENTS.md §1.5 | **No raw error codes in user-visible UI.** | **ACTIVE — STRUCTURAL.** `<RefAnchor id>` accepts catalog-code-shaped ids (`^(MI-\d+[a-z]?_)?[A-Z][A-Z0-9_]*$` per spec §6.3 r15 amendment, Codex R3 fix `504b533`) for `/help/errors` per-code section anchors, but the rendered TEXT is the cataloged `title` / `longExplanation` from Phase B's schema extension, NOT the raw code in copy. The id is a DOM anchor, not user-visible body copy. Phase E.13 wires the rendered text; Phase D ships the structural component. No raw `err.code` rendered in any new JSX. |
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

7. **RefAnchor id regex throw (D.5 build-time invariant — broadened in R3).** The component throws synchronously when `id` does not match `^(MI-\d+[a-z]?_)?[A-Z][A-Z0-9_]*$`. **r15 amendment (commit `504b533`, Codex R3):** original strict regex `^[A-Z][A-Z0-9_]*$` rejected ~30 MI-class catalog codes (`MI-1_VERSION_DETECTION_FAILED`, `MI-5a_DUPLICATE_CREW_NAME`, etc.) that Phase E.13 will render via `<RefAnchor id={entry.code} as="h3">`. Broadened to cover both standard SCREAMING_SNAKE and MI-class grammars. **Watchpoint:** the test asserts both positive cases (real catalog codes) AND negative cases (`bad-id`, `123_NUMERIC_LEAD`) throw. React 19's strict mode + concurrent rendering can mask sync throws in some test configurations; verify the throw fires in the unit-render path (jsdom-environment is sync, no concurrent batching). **r14 amendment (commit `5f508ad`, Codex R1):** added `as`-prop runtime guard (sync throw if not `h2`/`h3`) because MDX call sites are not typechecked.

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

Format: per-round row appended at the bottom. Round 1 anchored at Phase D base SHA `023d312`. Per memory `feedback_adversarial_review_full_milestone_scope.md`, every round anchors to phase-base (not previous-round fix-base) to keep full-Phase-D scope.

### Phase D close-implementation + fix-commit log

| Task | SHA | Title |
| --- | --- | --- |
| D.1 implementation | `b220041` | `feat(help): Callout component (note/warning/tip) (Task D.1)` |
| D.1 impeccable-R1 fix | `293e0e9` | `fix(help): D.1 Callout — Tip-variant contrast (CRITICAL) + side-stripe ban (HIGH) per impeccable §1.8` |
| D.2 implementation | `97ae6f2` | `feat(help): Step component for numbered procedures (Task D.2)` |
| D.2 impeccable-R1 fix (insufficient — math error) | `8ed74eb` | `fix(help): D.2 Step — accent-bg contrast floor (HIGH) per impeccable §1.8` |
| D.2 impeccable-R2 fix (Phase A R2 pattern) | `3ee35e1` | `fix(help): D.2 Step — drop bg-accent+text-accent-text (2.34:1 fails WCAG); use bg-surface-raised+text-accent-on-bg+border-accent per Phase A R2 precedent` |
| D.3 implementation | `87ee73f` | `feat(help): ScreenshotPlaceholder draft component (Task D.3)` |
| D.3 impeccable em-dash fix | `d9fcc07` | `fix(help): D.3 ScreenshotPlaceholder — em-dash → colon (DESIGN.md L247 absolute ban) per impeccable §1.8` |
| D.4 implementation | `6e26bf7` | `feat(help): Screenshot production component with <picture> + dark source; prop is name (not React-reserved key) (Task D.4)` |
| D.5 implementation | `d57f147` | `feat(help): RefAnchor with click-to-copy link icon + id regex validation (Task D.5)` |
| D.5 impeccable 3-HIGH fix | `ddb66b1` | `fix(help): D.5 RefAnchor — copy-link text-text-subtle→text-text (HIGH), add focus-visible (HIGH), expand to 44px tap target (HIGH) per impeccable §1.8` |
| D.5 Codex R2 fix | `1e45e5d` | `fix(help): D.5 RefAnchor — implement copy-to-clipboard onClick handler per spec §6.2 aria-label contract (Codex R2 MEDIUM)` |
| D.5 Codex R3 fix | `504b533` | `fix(help): D.5 RefAnchor — broaden id regex to accept MI-class catalog codes (Codex R3 MEDIUM; Phase E.13 unblocker)` |
| D.5 Codex R4 fix | `c68e2e8` | `docs(handoff,spec): D.5 RefAnchor — spec §6.3 r15 amendment + handoff canonical-trail sync per Codex R4 MEDIUM` |
| D.5 Codex R5 fix (plan-body sync) | `1584486` | `docs(plan): D-components.md plan body synced to final implementation per Codex R5 MEDIUM` |
| D.5 Codex R5 follow-on doc-sweep | `f620522` | `docs(plans): final stale-regex sweep — 05-content.md + handoff §5 invariant` |
| D.5 Codex R6 fix (handoff R5 row + forward-looking §12) | `ab854c4` | `docs(handoff): R6 trail-update — populate R5 row + add R6 row + forward-looking sign-off` |
| D.5 Codex R7 fix (this commit — exhaustive sweep) | TBD | `docs(handoff): R7 exhaustive sweep — §2 top-level status + §13 meta-test inventory + clear all remaining round-pinned language` |
| D.6 implementation | `9ed66de` | `feat(help): TipFromSheets adoption-track aside component (Task D.6)` |
| D.6 preemptive fix | `c580074` | `fix(help): D.6 TipFromSheets — drop border-l-4 side-stripe (HIGH, DESIGN.md L242) + eyebrow text-accent-text→text-text-strong (CRITICAL contrast) per impeccable §1.8 pre-flag` |
| D.7 registration | `4ee6892` | `feat(help): register all six MDX components in mdx-components.tsx (Task D.7)` |
| Structural meta-test | `7d2929b` | `test(styles): _metaDesignTokenPairs structural meta-test for side-stripe + accent-text + text-subtle bans (Phase D same-vector recurrence trigger)` |
| Codex R1 RefAnchor as-guard fix | `5f508ad` | `fix(help): D.5 RefAnchor — runtime guard for 'as' prop (MDX callers aren't typechecked) per Codex R1 HIGH` |

### Per-component external impeccable §1.8 dual-gate runs

| Component | Cumulative diff | Critique | Audit | Verdict | Findings → Resolution |
| --- | --- | --- | --- | --- | --- |
| D.1 Callout R1 | `b220041^..b220041` | 22/32 (C+) | 11/20 (NEEDS-ATTN) | NEEDS-ATTN | CRITICAL Tip-contrast + HIGH side-stripe + 2 LOW accepts → fix `293e0e9` |
| D.1 Callout R2 (re-attest) | `b220041^..293e0e9` | **32/32 (A)** | **20/20 (A)** | **PASSES** | CRITICAL + HIGH resolved; 0 new findings → §1.8 CLOSED |
| D.2 Step R1 | `97ae6f2^..97ae6f2` | 26/32 (B+) | 18/20 (A−) | NEEDS-ATTN | HIGH accent-bg sub-floor → fix `8ed74eb` |
| D.2 Step R2 (re-attest) | `97ae6f2^..8ed74eb` | 22/32 (B) | 12/20 (C) | NEEDS-ATTN | HIGH **NOT** resolved (DESIGN.md L33's "4.07:1" claim is a math error; actual `#ff8c1a×#ffffff` = 2.34:1; size/weight shifts threshold not contrast) → fix `3ee35e1` (Phase A R2 pattern) |
| D.2 Step R3 (re-attest) | `97ae6f2^..3ee35e1` | **30/32 (A−)** | **19/20 (A)** | **PASSES** | New pair `bg-surface-raised×text-accent-on-bg` = 4.29:1 light / 8.30:1 dark → §1.8 CLOSED |
| D.3 ScreenshotPlaceholder R1 | `87ee73f^..87ee73f` | 27/32 (Good) | 19/20 (A) | PASS-W-FIX | LOW em-dash U+2014 (DESIGN.md L247) → fix `d9fcc07` |
| D.3 R2 (re-attest) | `87ee73f^..d9fcc07` | **40/40 (ceiling)** | **20/20 (A)** | **PASSES** | em-dash resolved; 0 new findings → §1.8 CLOSED |
| D.4 Screenshot R1 | `6e26bf7^..6e26bf7` | **30/32 (A)** | **19/20 (A)** | **PASSES** | 0 findings → §1.8 CLOSED on first attest |
| D.5 RefAnchor R1 | `d57f147^..d57f147` | 4/32 findings | 3/20 findings | NEEDS-ATTN | 3 HIGH: text-text-subtle on action target + no focus-visible + tap target <44px; 1 MEDIUM emoji→BACKLOG → fix `ddb66b1` |
| D.5 R2 (re-attest) | `d57f147^..ddb66b1` | **30/32 (A−)** | **20/20 (A)** | **PASSES** | All 3 HIGH resolved; 0 new findings → §1.8 CLOSED |
| D.6 TipFromSheets R1 (cumulative initial+fix) | `d57f147^..c580074` | **32/32 (A)** | **20/20 (A)** | **PASSES** | Pre-flagged HIGH side-stripe + CRITICAL eyebrow-contrast resolved preemptively; eyebrow contrast 15.98:1 light / 14.95:1 dark (AAA) → §1.8 CLOSED |
| Phase-close cumulative | `023d312..7d2929b` | **31/32 (A)** | **20/20 (A)** | **PASSES** | 1 LOW (rounded-md vs rounded micro-drift between message-blocks and media-containers) ACCEPT-as-is per semantic distinction; D.7 wiring confirmed (spread-then-override; 6 names match exports verbatim); meta-test structural defense scoped correctly. |

### Adversarial review (Codex cross-CLI)

| Round | Date | Verdict | Findings (sev, summary) | Resolution commit | Notes |
| --- | --- | --- | --- | --- | --- |
| R1 Codex adversarial | 2026-05-19 | **needs-attention** at `7d2929b` | HIGH × 2: (1) handoff §8 + §9 convergence log/dispositions still TBD — no audit trail for the 8 dual-gates; (2) RefAnchor `as` prop has no runtime guard so MDX callers (not typechecked) could pass `as="h4"` and render an h4 silently | (1) handoff update (this commit); (2) `5f508ad` runtime guard + regression test | Job `review-mpdj6ez6-j708g0`; whole-diff fresh-eyes review; both findings are LEGITIMATE structural gaps (not finding re-litigation) |
| R2 Codex adversarial | 2026-05-19 | **needs-attention** at `d267955` | MEDIUM × 1: RefAnchor advertises "Copy link to this section" aria-label + spec §6.2 "click-to-copy link icon" but implementation was plain `<a href="#id">` with no clipboard handler — would ship a deceptive affordance | `1e45e5d` adds `"use client"` + `navigator.clipboard.writeText()` onClick handler (try/catch graceful degrade) + regression test mocking the clipboard API | Job `review-mpdjftt3-1anten`; new vector (not finding re-litigation); spec-vs-implementation gap from plan body |
| D.5 R3 external impeccable re-attest (clipboard mutation) | 2026-05-19 | **PASSES** at `1e45e5d` | 0 new findings; visual surface byte-identical to PASSES baseline `ddb66b1`; R2 MEDIUM resolved (aria-label↔behavior alignment) | — | External fresh subagent; Critique 32/32, Audit 20/20 |
| R3 Codex adversarial | 2026-05-19 | **needs-attention** at `1e45e5d` | MEDIUM × 1: RefAnchor regex `^[A-Z][A-Z0-9_]*$` rejected real Doug-facing catalog codes (`MI-1_VERSION_DETECTION_FAILED`, `MI-5a_DUPLICATE_CREW_NAME`) — Phase E.13 would throw at render | `504b533` regex broadened to `^(MI-\d+[a-z]?_)?[A-Z][A-Z0-9_]*$`; positive-case test added covering both grammars; negative cases still throw | Job `review-mpdjnifg-ifgtgb`; new vector (different from R1/R2); orchestrator pre-fix grep confirmed live catalog has ~30 MI-class codes |
| R4 Codex adversarial | 2026-05-19 | **needs-attention** at `504b533` | MEDIUM × 1: R3 regex fix landed in code but spec §6.3 line 415 still cited even stricter `/^[A-Z_]+$/` (no digits at all); handoff §6 watchpoint #7 + §3 + AC-11.19 still showed old regex; multiple "R2 pending" stale references | (this commit) spec §6.3 r15 amendment + handoff §3 / §4 / §6 watchpoint #7 / §8 / §12 canonical-trail sync | Job `review-mpdju8zf-5wxx2r`; legitimate doc-vs-code drift finding; per AGENTS.md §1.7 spec amended directly (correction, not silent override — old regex rejected live catalog data) |
| R5 Codex adversarial | 2026-05-19 | **needs-attention** at `c68e2e8` | MEDIUM × 1: plan body `04-components.md` still contained pre-fix code snippets that would reintroduce R1-R4 defects if a future Phase E replay trusted them | `1584486` plan-body synced to FINAL converged code with inline annotations + CLOSED-status banner; `f620522` follow-on doc-sweep for 05-content.md + §5 invariant table | Job `review-mpdk1ojo-bhw410`; same vector as R4 (doc/code drift) but different file scope (plan body vs handoff/spec) |
| R6 Codex adversarial | 2026-05-19 | **needs-attention** at `f620522` | MEDIUM × 1: handoff §8 R5 row still TBD; §12/§2 still said "R1→R4 / R5 pending" — trail-staleness gap (same vector as R4+R5; 3rd same-vector instance triggered comprehensive doc-sweep + forward-looking sign-off language as structural defense) | (this commit) §8 R5 row populated + R6 row added + §2 + §12 rewritten with forward-looking iteration language | Job `review-mpdkcp2n-s2k3db`; same-vector recurrence rule applied — structural defense ships in this commit |
| R7 Codex adversarial | 2026-05-19 | **needs-attention** at `ab854c4` | MEDIUM × 2: (1) §2 top-level Phase D status still pinned "STATUS IN PROGRESS (final SHA pending Codex R2)"; (2) §13 meta-test inventory still said "Phase D CREATES: none expected" despite `7d2929b` landing `_metaDesignTokenPairs.test.ts` | (this commit) §2 top-level status rewritten to round-neutral language; §13 fully rewritten to declare the meta-test as CREATED + describe enforced scope; exhaustive grep-sweep across the handoff to clear ALL remaining stale-round language | Job `review-mpdkgtlm-yyh0r6`; same vector as R4/R5/R6 (4th consecutive doc-drift round); per `feedback_same_vector_recurrence_triggers_comprehensive_reanalysis.md` — comprehensive re-analysis performed (full-handoff grep sweep + structural defense reinforcement) |
| R8 Codex adversarial | TBD | TBD | TBD | — | base = `023d312`; pending after R7 comprehensive sweep lands |

---

## §9 Impeccable findings + dispositions (Phase D)

Per AGENTS.md §1.8 + memories `feedback_impeccable_critique_not_authoritative_vs_spec.md` + `feedback_impeccable_external_attestation_required.md`. Each row corresponds to a per-component external dual-gate run.

| Component | Finding | Severity | File:line | Disposition | Spec-check (if copy rewrite) | Commit / Home |
| --- | --- | --- | --- | --- | --- | --- |
| D.1 Callout R1 | Tip-variant `bg-stale-tint × text-accent-text` = 1.05:1 light / 1.5:1 dark (catastrophic AA fail) | **CRITICAL** | `Callout.tsx:21-23` | **FIXED** — swap to `text-text-strong` (17.5:1 light / 14.9:1 dark, AAA) | No copy rewrite | `293e0e9` |
| D.1 Callout R1 | `border-l-4` violates DESIGN.md L242 side-stripe ban (Phase A R2 precedent at `30dafe8`) | **HIGH** | `Callout.tsx:42` | **FIXED** — `border-l-4` → `border` (1px full perimeter; ≤1px compliant) | No copy rewrite | `293e0e9` |
| D.1 Callout R1 | Template-literal class concat | MEDIUM | `Callout.tsx:42` | **ACCEPT-as-is** — tokens are static const map, JIT-extractable | n/a | n/a |
| D.1 Callout R1 | Unicode glyphs `ℹ ⚠ ✓` vs lucide-react | LOW | `Callout.tsx:69,77,85` | **BACKLOG** — bundle with D.5 emoji migration | n/a | BACKLOG candidate |
| D.1 Callout R1 | Dual `role="note"` (note + tip variants) | LOW | `Callout.tsx` | **ACCEPT-as-is** — both semantically advisory | n/a | n/a |
| D.2 Step R1 | `bg-accent text-accent-text text-sm font-semibold` strict DESIGN.md L33 violation (badge below ≥14pt-bold floor) | **HIGH** | `Step.tsx:8` | **FIXED** (via R2/R3 chain) — initial fix `8ed74eb` insufficient (math error in L33's "4.07:1"); final fix `3ee35e1` adopts Phase A R2 pattern: `bg-surface-raised text-accent-on-bg border-2 border-accent font-bold text-base` (light 4.29:1 / dark 8.30:1) | No copy rewrite | `3ee35e1` |
| D.2 Step R1 | Fixed `h-7 w-7` tight for ≥3-digit step numbers | LOW | `Step.tsx:7` | **ACCEPT-as-is** — Phase E adoption-track/onboarding-wizard scope is ≤9 steps per plan | n/a | n/a |
| D.3 ScreenshotPlaceholder R1 | Em-dash U+2014 in "Screenshot pending — {alt}" violates DESIGN.md L247 absolute ban | LOW | `ScreenshotPlaceholder.tsx:22` | **FIXED** — em-dash → colon ("Screenshot pending: {alt}") | Tests use case-insensitive regex `/screenshot pending/i`; colon doesn't break match | `d9fcc07` |
| D.4 Screenshot R1 | — | — | — | **NO FINDINGS** — first-attest PASSES at 30/32 + 19/20 | n/a | n/a |
| D.5 RefAnchor R1 | `text-text-subtle` on copy-link action target — DESIGN.md L27 ban (Phase A R1 precedent at `370298f`) | **HIGH** | `RefAnchor.tsx:34` | **FIXED** — `text-text-subtle` → `text-text` (16.5:1 light / 14.8:1 dark, AAA) | n/a | `ddb66b1` |
| D.5 RefAnchor R1 | No `focus-visible` / `group-focus-within` reveal — keyboard users see no affordance | **HIGH** | `RefAnchor.tsx:34` | **FIXED** — added `group-focus-within:opacity-100 focus-visible:opacity-100` (WCAG 2.4.7) | n/a | `ddb66b1` |
| D.5 RefAnchor R1 | Tap target below 44px floor (DESIGN.md `--spacing-tap-min`) | **HIGH** | `RefAnchor.tsx:34` | **FIXED** — added `inline-flex h-11 w-11 -my-2 items-center justify-center rounded` (44×44px hit area with `-my-2` baseline compensation) | n/a | `ddb66b1` |
| D.5 RefAnchor R1 | Emoji 🔗 vs lucide `Link2` | MEDIUM | `RefAnchor.tsx:36` | **BACKLOG** — bundle with D.1 glyph migration | n/a | BACKLOG candidate |
| D.5 RefAnchor R1 (Codex) | `as` prop runtime guard missing — MDX callers (not typechecked) could silently render h4 | **HIGH** | `RefAnchor.tsx:22-29` | **FIXED** — added `VALID_AS` Set + synchronous throw if `as` ∉ {h2, h3}; regression test added | n/a | `5f508ad` |
| D.6 TipFromSheets R1 (cumulative) | `border-l-4 border-accent` side-stripe ban (3rd Phase D instance — triggered meta-test) | **HIGH** | `TipFromSheets.tsx:5` | **FIXED** preemptively — `border-l-4` → `border` (1px full perimeter) | n/a | `c580074` |
| D.6 TipFromSheets R1 (cumulative) | Eyebrow `text-accent-text × bg-info-bg` = 1.05:1 light / 1.13:1 dark (catastrophic) | **CRITICAL** | `TipFromSheets.tsx:6` | **FIXED** preemptively — eyebrow `text-accent-text` → `text-text-strong` (15.98:1 light / 14.95:1 dark, AAA) | n/a | `c580074` |
| Phase-close cumulative | `rounded-md` vs `rounded` micro-drift between message-blocks and media-containers | LOW | cross-component | **ACCEPT-as-is** — semantic distinction (message-blocks `-md`, media containers bare); not a defect | n/a | n/a |

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

- [x] Implementer (Opus / Claude Code): 2026-05-19 — current HEAD is the latest Codex-iteration fix commit (see §8 R-row chain for the SHA at this round); final close-out SHA recorded here once Codex APPROVE lands.
- [x] External impeccable dual-gate APPROVED per-component (D.1, D.2, D.3, D.4, D.5, D.6) on 2026-05-19 — see §8 per-component-impeccable table. Phase-close cumulative (covers D.7 wiring + meta-test): PASSES 31/32 + 20/20. D.5 R3 re-attest after clipboard mutation: PASSES 32/32 + 20/20.
- [ ] Reviewer (Codex cross-CLI) APPROVE on __ date __ — Iterating R1→R(N) until APPROVE; see §8 for the full per-round table with verdicts, findings, and resolution commits. Each round to date has surfaced a NEW vector (not finding re-litigation). Forward-looking sign-off language adopted in R6 as the structural defense against trail-staleness recurrence.
- [ ] User review: __ date __

Phase D marked **closed** in `ROUTING.md` upon Codex APPROVE.

## §13 Meta-test inventory

Per AGENTS.md writing-plans additions: declare which structural meta-tests this phase CREATES or EXTENDS.

**Phase D CREATES — `tests/styles/_metaDesignTokenPairs.test.ts`** (commit `7d2929b`). Triggered by the 3+ same-vector recurrence rule (`feedback_same_vector_recurrence_triggers_comprehensive_reanalysis.md`): Phase A R2 Sidebar side-stripe (fixed) + Phase D D.1 Callout side-stripe (fixed at `293e0e9`) + Phase D D.6 TipFromSheets side-stripe (fixed at `c580074`) = 3 instances of the side-stripe class. The meta-test is a Node-environment Vitest file with three sub-scans across `app/help/_components/*.tsx`:

1. **Side-stripe ban (DESIGN.md L242):** asserts no `border-(l|r|t|b)-[2-9]|\d{2,}|\[` pattern (allows `border-l` / `border-r` 1px form; bans ≥2px directional borders).
2. **`text-accent-text` only on `bg-accent`:** asserts every className containing `text-accent-text` also contains `bg-accent` on the same line (catches the D.1 Tip-variant + D.6 eyebrow class that paired accent-text with bg-stale-tint and bg-info-bg).
3. **`text-text-subtle` not on action targets:** asserts every className containing `text-text-subtle` does NOT appear on the same line as `href=`, `onClick`, `<a `, `<button`, or `<Link` (catches the D.5 RefAnchor + Phase A R1 Sidebar pre-fix class).

Each sub-scan was red-via-temp-violation verified at commit time (3 distinct violations introduced + reverted; see commit `7d2929b` body). Scope is `app/help/_components/` only; pre-existing violations elsewhere in `components/` are out of scope (BACKLOG candidate for project-wide sweep).

**Phase D EXTENDS:** none. (The Phase D meta-test is a NEW structural defense, not an extension of an existing registry. Existing registries — `tests/auth/_metaInfraContract.test.ts`, `tests/components/tiles/_metaSentinelHidingContract.test.ts`, `tests/messages/_metaAdminAlertCatalog.test.ts`, `tests/auth/advisoryLockRpcDeadlock.test.ts`, `tests/admin/no-inline-email-normalization.test.ts` — were N/A for Phase D scope.)

**Forward-pointer for Phase E+:** when a Phase E content brief introduces a NEW DESIGN.md absolute-ban class (e.g., a 4th token-pair pattern), extend `_metaDesignTokenPairs.test.ts` with an additional `it()` sub-scan rather than per-instance whack-a-mole. Project-wide sweep (`components/**` outside `app/help/`) is a BACKLOG candidate when the Phase A R1 + cross-cutting precedent codes are touched again.

## §14 Phase D meta-observations (populated at close-out)

TBD. Track meta-observations from Phase D's review iterations worth carrying forward to Phase E and beyond.
