# Handoff — M11 Phase E: Content authoring (Tasks E.1–E.13)

**Status:** IN PROGRESS — handoff authored 2026-05-19.

**Handed off:** 2026-05-19 by Eric Weiss (orchestrator session "Orchestrator — M11").
**Implementer:** Opus 4.7 / Claude Code via `superpowers:subagent-driven-development` (per AGENTS.md "UI work is always Opus" hard rule + ROUTING.md row "E — Content authoring" all-Opus; `.mdx` content + `.tsx` page authoring are UI surfaces).
**Adversarial reviewer:** GPT-5.5 / Codex CLI via `/codex:adversarial-review --background --base 3eb73ad` (cross-CLI per ROUTING.md reviewer-pairing logic; base is Phase D close-out commit so the diff covers exactly Phase E + the orthogonal M12 brainstorm spec landing at `a8cf603`).
**Plan file:** `docs/superpowers/plans/2026-05-12-user-facing-docs/05-content.md` (Tasks E.1–E.13).

> Phase E is **single-implementer**. No §A/§B split. No pin-stops. All thirteen tasks (E.1 → E.13) ship in one continuous TDD-disciplined sequence inside this orchestrator session via fresh-subagent-per-task dispatch.
> Phase E is **heavy content authoring**. AGENTS.md §1.8 impeccable v3 dual-gate fires **per page** (13 separate per-page dual-gates), with EXTERNAL attestation each time per memory `feedback_impeccable_external_attestation_required.md`.
> Phase E is the **highest-risk surface for raw-error-code leakage** (invariant #5). Every error reference MUST route through `messageFor(code)` or `<RefAnchor id={code}>` — NEVER a hardcoded `LINK_VERSION_MISMATCH`-shape literal in MDX body copy.

---

## §1 Session metadata

- **Session date(s):** 2026-05-19 (start) — close-out date TBD.
- **Implementer:** Opus 4.7 / Claude Code (orchestrator + fresh subagent per task via `superpowers:subagent-driven-development`).
- **Reviewer:** Codex (cross-CLI) via `/codex:adversarial-review`.
- **Base branch:** `main` at commit `3eb73ad` (Phase D close-out sign-off; `a8cf603` is an orthogonal M12 spec brainstorm landed after Phase D and does not interact with Phase E content).
- **Plan version:** `docs/superpowers/plans/2026-05-12-user-facing-docs/` r1. Plan body 05-content.md is r7-converged (per the inline r-markers throughout: r1 grep-only smoke → r2 real-render skeleton + canonical helpHref `/help/errors#CODE` + explicit TDD; r3 finalized real-render skeleton for all pages + biconditional filter import; r4 stub-replacement vs create-file alignment; r5 RefAnchor kebab-case retreat; r6 matrix-fragment alignment; r7 plain-h2 smoke-test alignment).
- **Spec version:** `docs/superpowers/specs/2026-05-12-user-facing-docs-design.md` r14 (with r15 RefAnchor regex broadening landed during Phase D). Phase E consumes §3 (MDX pipeline contract), §4 (per-page content inventory), §5.1 (catalog schema — read-only consume except E.6/E.7 catalog backfill), §5.6 (affordance matrix — section-anchor IDs referenced by `?` tooltips), §6 (component shapes — consume Phase D's six components), §12.4 (catalog as live source for E.7 + E.13).

---

## §2 Phase progress

- [x] **Phase E — Content authoring** (`05-content.md`) — all 13 tasks shipped; adversarial review in flight.
  - [x] Task E.1 — `app/help/page.mdx` landing — SHA `4ec5051` (page `e8b750f` + fix `4ec5051`)
  - [x] Task E.2 — `app/help/getting-started/page.mdx` — SHA `56aa41a` (page `18af10c` + fix `56aa41a`)
  - [x] Task E.3 — `app/help/daily-rhythm/page.mdx` — SHA `aa3f6e6` (no fix needed; PASS both gates)
  - [x] Task E.4 — `app/help/whats-different/page.mdx` — SHA `960de49` (no fix needed; PASS both gates)
  - [x] Task E.5 — `app/help/admin/dashboard/page.mdx` — SHA `08bfc12` (no fix needed; PASS both gates)
  - [x] Task E.6 — `app/help/admin/review-queues/page.mdx` + catalog backfill (6 codes) — SHA `515a03e` (page `d8b661f` + fix `515a03e`)
  - [x] Task E.7 — `app/help/admin/parse-warnings/page.mdx` + catalog backfill (1 code: PARSE_ERROR_LAST_GOOD; live catalog scope) — SHA `24f4c6d`
  - [x] Task E.8 — `app/help/admin/per-show-panel/page.mdx` — SHA `33bddfe` (no fix needed; PASS both gates)
  - [x] Task E.9 — `app/help/admin/preview-as-crew/page.mdx` — SHA `d45688d` (page `02eba7b` + fix `d45688d`)
  - [x] Task E.10 — `app/help/admin/sharing-links/page.mdx` — SHA `2201fd4` (polish-tier critique findings deferred per `feedback_deferral_discipline.md`)
  - [x] Task E.11 — `app/help/admin/onboarding-wizard/page.mdx` — SHA `18bfdb4` (page `df5d2eb` + fix `18bfdb4`)
  - [x] Task E.12 — `app/help/tour/page.mdx` — SHA `e6373c0` (no fix needed; PASS both gates)
  - [x] Task E.13 — `app/help/errors/page.tsx` (TSX) + live-catalog biconditional meta-test (closes B.4 deferral per r6) — SHA `7c4c4ee` (page `b90e718` + em-dash/typecheck fix `2d7f130` + P1 CTA fix `7c4c4ee`). 124 catalog entries backfilled.
  - [x] Per-page impeccable §1.8 dual-gate — 13 pages, each via EXTERNAL fresh-subagent dispatch. See §8.1 score table.
  - [ ] Phase-level adversarial review (Codex) — job `review-mpe2jo12-gvsbxz` against base `3eb73ad`; awaiting verdict.
  - [x] Phase E close-out gates green: `pnpm test` 3800/3805 + 5 skipped; `pnpm lint` 0 errors + 6 pre-existing warnings; `pnpm typecheck` clean; `pnpm test:e2e --project=mobile-safari` exit 0.
  - [ ] User review.

**Infra commits in scope (Phase E plan-gap remediation):**
- `f1526fe` — `infra(help): register @mdx-js/rollup for Vitest real-render MDX assertions`. Plan body's r2/r3 fix mandates `await import("@/app/help/<slug>/page")` to compile MDX in tests; vitest had no MDX loader; this wires `@mdx-js/rollup` + `resolve.extensions` `.mdx`. Production unchanged.
- `3095179` — `infra(help): mdx.d.ts ambient declaration + explicit .mdx in test imports`. After f1526fe, `tsc --noEmit` reported TS2307 for every `.mdx` import because TypeScript can't traverse Vite's extension list. Added `mdx.d.ts` ambient module declaration + explicit `.mdx` suffix on test dynamic-import specifiers.
- `662fb9b` — `chore(help): canonicalize Tailwind classes in Phase D components`. Surfaced by Phase E close-out gate as pre-existing lint debt in 3 Phase D files (`RefAnchor.tsx`, `Step.tsx`, `TipFromSheets.tsx`). Mechanical canonicalization (`h-N w-N` → `size-N`, `leading-relaxed text-sm` → `text-sm/relaxed`). Rendered output byte-identical.

Other phases: A done at `e911078`; B done at `cd14865`; C done at `6c7e6de`; D done at `08d6546` (close-out commit `3eb73ad`); F–I tracked in their own per-phase handoffs.

---

## §3 Spec sections in scope (Phase E only)

- **§3** — MDX pipeline contract (read-only consume; Phase A established the loader, Phase D the components).
- **§4** — Content inventory (v1): §4.1 adoption track (E.1–E.4), §4.2 capability reference (E.5–E.11), §4.3 tour + errors (E.12–E.13). The per-page content scope in §4 is authoritative; do NOT improvise additions or deletions without a spec amendment (plan-body-as-prescription anti-pattern from Phase D §14 #2).
- **§5.1** — `MessageCatalogEntry` schema (read-only structurally; E.6/E.7/E.13 populate `title`/`longExplanation`/`helpHref` cells for codes covered by their respective pages — values added; field schema unchanged).
- **§5.4** — Slug-stability invariant (`/help/errors#CODE` is the canonical anchor target; Phase E pages MUST NOT rename or alias).
- **§5.6** — Affordance matrix kebab-case section fragments (Phase E pages render these as plain `<h2 id="kebab-case">`, NOT `<RefAnchor>`; D.5 r15 regex restricts `<RefAnchor>` to catalog-code shape).
- **§6.2** — Component shapes (consume Phase D output; do not modify component contracts — if a content task surfaces a component-shape need, escalate as a Phase D follow-up, not a silent component edit).
- **§6.3** — Component guards (consume; `<RefAnchor id>` regex + `as` prop union must be honored exactly).
- **§12.4** — Catalog as live source for E.7 (parse-warnings) and E.13 (errors). E.13 ships the live biconditional meta-test that fails until every E.5–E.11 backfill lands.

Out of scope for Phase E (deferred to later phases):
- Screenshot manifest + actual WebPs on disk (Phase F.6/F.7/F.8/F.10). E.5 + E.6 + E.9 author `<Screenshot name="...">` references in MDX; the WebPs ship in Phase F.
- Affordance retrofit + `Learn more →` link wiring in `/admin/*` calling new affordances (Phase G).
- Auth-integration Playwright tests (Phase H).
- Phase-level impeccable v3 dual-gate over the full M11 surface (Phase I.1).

---

## §4 Acceptance criteria

Only AC rows Phase E satisfies, partially satisfies, or scaffolds for downstream phases.

| AC | Phase E target | Notes |
| --- | --- | --- |
| AC-11.1 | PARTIAL | All 13 pages render non-empty content at runtime. (Build-time MDX compilation is Phase A; static-vs-dynamic build contract is unchanged.) |
| AC-11.6 | PASS (via E.13 live biconditional) | E.6/E.7/E.13 backfill `title` / `longExplanation` / `helpHref` for every Doug-facing entry per the AC-11.6 predicate. E.13 adds the live biconditional assertion that closes the B.4 deferral. |
| AC-11.7 | PASS | Every `helpHref` (canonical target `/help/errors#<CODE>` per r2 fix) resolves to a real `<RefAnchor id={CODE}>` rendered by `app/help/errors/page.tsx` (E.13). |
| AC-11.10 | SCAFFOLD | `/help/tour` exists (E.12). The dashboard footer's `Take the tour →` retrofit lives in Phase G. |
| AC-11.11 | PASS | `/help/errors` (E.13) iterates the catalog, renders one anchored section per AC-11.6-predicate entry, with `title` heading, `longExplanation` body, and trailing "If this keeps happening, tell Eric →" CTA per AC-11.11 r10 correction (NOT a self-linking `Learn more →`). |
| AC-11.13 | PASS (per page) | Every Phase E page passes external `/impeccable critique` + `/impeccable audit` (per invariant #8). 13 separate per-page gates; the phase-level cumulative gate runs at Phase I.1. |
| AC-11.14 | PASS | No `<ScreenshotPlaceholder>` references on any shipped E page (each page-specific smoke test asserts absence). Phase H.4 lint enforces project-wide. |
| AC-11.17 | PASS | Conventional-commits `feat(help):` per page implementation; `fix(help):` for impeccable-driven fixes; `feat(help):` + catalog suffix for E.6/E.7/E.13 catalog backfills. One commit per task / one commit per fix per AGENTS.md §1.6. |

ACs NOT addressed by Phase E: AC-11.2–AC-11.5 (A/B), AC-11.8–AC-11.9 (G), AC-11.12 (cross-phase aggregate; per-page tests land here, full enumeration count assertion is phase F/G/H), AC-11.15–AC-11.16 (F), AC-11.18–AC-11.22 (F), AC-11.23–AC-11.24 (A), AC-11.25–AC-11.30 (F/G), AC-11.31–AC-11.39 (C/F/G/H).

---

## §5 Plan-wide invariants — applicability to Phase E

These are AGENTS.md's 9 invariants layered with M11's per-plan additions.

| # | Invariant | Phase E applicability |
| --- | --- | --- |
| AGENTS.md §1.1 | **TDD per task.** | **ACTIVE.** Every E.1–E.13 task: failing test (real-render + content-shape grep) → page authoring → passing test → commit. The plan body's r2/r3 fix mandated real-render assertions because grep-only smokes let runtime-broken MDX ship green. |
| AGENTS.md §1.2 | **Per-show advisory lock.** | **N/A for Phase E.** No DB-touching code. |
| AGENTS.md §1.3 | **Email canonicalization at every boundary.** | **N/A for Phase E.** No email handling. |
| AGENTS.md §1.4 | **No global sync cursor.** | **N/A for Phase E.** |
| AGENTS.md §1.5 | **No raw error codes in user-visible UI.** | **ACTIVE — CRITICAL.** Phase E is the highest-risk surface for raw codes leaking into body copy. Every error reference in any MDX file MUST route through `messageFor(code)` (which returns the Doug-facing copy) OR `<RefAnchor id={code}>` (which renders the catalog `title` and is a stable anchor — the id is a DOM attribute, not visible body copy). NEVER write raw `LINK_VERSION_MISMATCH` or similar in MDX prose. The /help/errors page (E.13) renders the code as an anchor `id`, with the visible heading being `entry.title`. Per-page smoke tests should grep for raw-code shapes if the page references catalog entries inline; the structural defense is the existing `tests/messages/no-raw-codes-in-jsx.test.ts` family. |
| AGENTS.md §1.6 | **Commit per task.** | **ACTIVE.** Conventional-commits `feat(help): <summary>` per the plan body's per-task commit message. Never batch multiple E.* tasks into one commit. Catalog backfill commits ride with their owning page task (E.6/E.7/E.13). |
| AGENTS.md §1.7 | **Spec is canonical.** | **ACTIVE — HIGHEST PHASE-E RISK.** Memory `feedback_impeccable_critique_not_authoritative_vs_spec.md` is the controlling precedent. Every critique-proposed copy rewrite MUST be spec-checked against §4 (per-page scope) + §6 (voice/style) BEFORE landing. M8 R2 M2 shipped a §13.1 channel-boundary inversion this way; content authoring is *the* highest-risk surface for this class because there are 13 pages × dozens of copy decisions each. If `/impeccable critique` proposes a rewrite that contradicts §4's per-page scope, the spec wins — open an amendment question instead of silently shipping the rewrite. |
| AGENTS.md §1.8 | **impeccable v3 critique + audit dual-gate.** | **ACTIVE — FIRES PER PAGE.** 13 pages, each ships only after EXTERNAL `/impeccable critique` AND `/impeccable audit` pass on the per-page diff. HIGH/P0/P1 fixed inline OR routed per `feedback_deferral_discipline.md`. Spec-check any copy-rewriting disposition per the §1.7 row above. Self-attest is invalid (M9 lesson via `feedback_impeccable_external_attestation_required.md`). |
| AGENTS.md §1.9 | **Supabase call-boundary discipline.** | **N/A for Phase E.** No new Supabase call sites. (E.13 reads `MESSAGE_CATALOG` which is a static export.) |
| M11 plan-wide #4 | **No raw error codes in user-visible UI** (AGENTS.md #5 echo). | Same as §1.5 above — CRITICAL. |
| M11 plan-wide #5 | **impeccable v3 UI gate** (AGENTS.md #8 echo). | Same as §1.8 above — fires per page. |
| M11 plan-wide #7 | **`MessageCatalogEntry` additive extension.** | **READ-ONLY structurally in Phase E; populated by E.6/E.7/E.13.** Phase E writes values into the new fields Phase B added. The biconditional contract (E.13 closes B.4's deferral) asserts every Doug-facing entry has all three fields non-null. |
| M11 plan-wide #8 | **Catalog-master-spec alignment.** | **N/A for Phase E.** Closed in Phase B. |
| M11 plan-wide #9 | **`lib/time/now.ts` is the only server-side render-time source.** | **N/A for Phase E.** No new `new Date()` / `Date.now()` call sites in content pages. (If a page wants to display "current date," route through `nowDate()` — but none of the 13 v1 pages require this; the content is timeless.) |
| M11 plan-wide #10 | **§5.6 affordance matrix is the §9.0.1 retrofit contract.** | **Phase E provides the anchor targets** (`<h2 id="...">` and `<RefAnchor id="...">` on the documented pages); Phase G provides the affordance retrofit on the source admin surfaces. Phase E MUST honor §5.6's anchor-id values verbatim (kebab-case for non-catalog anchors, SCREAMING_SNAKE/MI-class for catalog codes). |

---

## §6 Watchpoints (class-vectors carried forward)

Per AGENTS.md "Same-vector recurrence" + Disagreement-loop preempt rules. Pre-loaded BEFORE adversarial review fires so the reviewer is anchored on prior-incident context, not discovering it round-N.

1. **CRITICAL — Spec-vs-critique tension on copy rewrites (M8 R2 M2 precedent).** `/impeccable critique` and `/impeccable polish` know UX, but they do NOT know the FXAV product contract. When critique proposes a copy rewrite — especially anything touching channel boundaries ("call out to crew" vs "show in crew's page"), action labels (Apply / Discard / Issue new link), or operator-vs-crew distinctions — spec-check against §4 (per-page scope) + §6 (voice) BEFORE committing. The disposition pattern: critique flags a phrase; orchestrator (or implementer) greps the spec for the phrase or its conceptual cousin; if the spec uses different wording for a reason, ship the spec wording and document the critique-vs-spec choice in §9. M8 R2 M2 shipped a channel-boundary inversion exactly this way.

2. **HIGH — Raw-code leakage into MDX body copy (AGENTS.md §1.5 / invariant #5).** Phase E is the highest-density surface in M11 for this class. Every error reference must route through `messageFor()` OR `<RefAnchor>`. Watch especially: E.6 (review-queues thematic page references parse-warning codes by name when discussing flow), E.7 (per-code RefAnchor sections — the id is the code; the heading is the title), E.13 (the errors page itself — code is the id, title is the heading). If a smoke-test ever asserts a raw code string appears in rendered text, that's a structural defense violation — the test should assert `entry.title` instead.

3. **HIGH — Plan-body-as-prescription anti-pattern (Phase D §14 #2).** Plan-body code/copy snippets are *templates*, not contracts. The plan body 05-content.md ships sample MDX for each page; implementers may need to adapt prose to PRODUCT.md tone OR to converged Phase D component APIs. If a plan-body snippet contradicts a Phase D component contract (e.g., uses `<Screenshot key>` instead of `<Screenshot name>`), the component contract wins — the plan body is r7-converged but Phase D landed its own r15 spec amendment that postdates parts of 05-content.md. Trust spec §6.2/§6.3 + the actual component files over the plan-body snippet when they conflict.

4. **MEDIUM — Process-drift sub-class of same-vector recurrence (Phase D §14 #3).** The orchestrator's handoff updates can drift across rounds; the structural defense is single-source-of-truth via the §8 R-row table. Phase E orchestrator: when updating this handoff after each round, reference §8 R-rows rather than restating round status elsewhere. Round-neutral language wins over round-pinned restatement.

5. **MEDIUM — DESIGN.md L33 math error (Phase D §14 #1, cross-cutting BACKLOG).** Not Phase E scope. Phase E introduces NO new tokens. If a page authoring task surfaces a contrast concern (e.g., a Callout/Step inside body copy that looks low-contrast), the disposition is: follow the Phase A R2 / Phase D R2 pattern locally on the page, do NOT modify the global token. The cross-cutting sweep is an explicit BACKLOG candidate per `feedback_deferral_discipline.md`.

6. **MEDIUM — Same-vector watchdog on copy classes.** Per `feedback_same_vector_recurrence_triggers_comprehensive_reanalysis.md`: if 3+ consecutive page tasks surface the same copy-class finding (e.g., "imperative voice missing on action steps", "ambiguous channel-boundary phrase", "section heading doesn't match §4 inventory"), STOP per-page patching and brainstorm a structural defensive layer: a style-guide enforcement test, a voice-consistency lint, or a `feedback_meta_contract_test_for_recurring_bug_class.md` style structural meta-test. Phase C's R3-R7 burnt 5 rounds before catching same-vector; ideal trigger is n=3.

7. **MEDIUM — Tour link consistency (E.12 ↔ E.5–E.11).** `/help/tour` (E.12) must link to every admin-reference page (E.5–E.11). If a section heading or page title changes during impeccable-driven copy adjustment on any of E.5–E.11, the tour page paragraph for that surface should track it. Smoke-test for E.12 should assert presence of all seven `/help/admin/*` link targets; copy-text mismatch is OK (different surfaces; tour can paraphrase) but the destination URL set is contract.

8. **MEDIUM — Catalog backfill ordering (E.6/E.7 land before E.13).** E.13 ships the LIVE biconditional meta-test that fails until every Doug-facing entry has `title` / `longExplanation` / `helpHref` non-null. E.6 backfills review-queues codes, E.7 backfills parse-warning codes. E.13 is the consolidation step — any backfill gap surfaced at E.13 time gets fixed in the E.13 commit (per the r6 fix in 05-content.md Step 5/6). If E.13 reveals a code that should have been backfilled in E.6/E.7 but wasn't, that's normal; fix in E.13. If E.13 reveals a code that NO Phase E page covers, that's spec drift — investigate.

9. **MEDIUM — Phase D §14 forward-pointer recurrence.** The structural defenses Phase D shipped (single-source-of-truth §8 R-row table, `_metaDesignTokenPairs.test.ts` for token pairs) should not silently regress. Phase E's authoring is downstream of those structures; do not modify them without explicit sign-off. If a Phase E component-usage pattern surfaces a need for a new token-pair scan rule, that's a meta-test extension, not a meta-test edit.

10. **LOW — Mobile-safari pre-flight sub-pixel jitter (Phase D / Phase A watchpoint #11).** Two e2e tests have shown 1-px crew-page sm:grid-cols-2 + LodgingTile-absent flakes that clear on re-run. If pre-flight or post-commit e2e fires a failure on those specific assertions, re-run before treating as a regression.

11. **LOW — `<Screenshot name="...">` references will fail Phase F drift gate until the WebPs land.** Phase E.5/E.6/E.9 reference screenshots that don't exist yet. The plan body acknowledges this; per Step 7 of the shared pattern, use `<ScreenshotPlaceholder>` ONLY if the underlying admin surface doesn't exist yet (it does for all M3/M9/M10 surfaces). Phase F.11 converts placeholders to real `<Screenshot>` references. **Disposition for Phase E:** ship `<Screenshot name="...">` references for surfaces that exist; Phase F authors the actual WebPs. The per-page smoke test should assert `<ScreenshotPlaceholder>` is absent (AC-11.14 contract), but `<Screenshot name="...">` is allowed even when the WebP isn't on disk yet (the screenshot-coverage test #8 fires in Phase F, not Phase E).

12. **LOW — Aspirational milestone deferrals (BACKLOG vs DEFERRED discipline).** Per `feedback_deferral_discipline.md`: if a Phase E impeccable finding is dispositioned "defer," route to DEFERRED.md only if it has a concrete trigger or scheduled home (e.g., Phase F.11 placeholder conversion); otherwise BACKLOG.md. Do not name a phantom future milestone ("M11.1 polish pass") that doesn't exist.

---

## §7 Test commands

```bash
# Unit + integration (vitest):
pnpm test

# Phase E targeted runs (after each task):
pnpm test tests/help/page-<slug>.test.tsx

# Catalog biconditional (E.13):
pnpm test tests/messages/_metaErrorCatalogDocs.test.ts

# Lint:
pnpm lint

# Typecheck:
pnpm typecheck

# E2E (Playwright) — mobile profile:
pnpm test:e2e --project=mobile-safari
```

Expected: all green at session close.

---

## §8 Convergence log (per-page impeccable + adversarial review)

### §8.1 Per-page impeccable §1.8 dual-gates (external attestation each)

Every page ran external fresh-subagent critique + external fresh-subagent audit per AGENTS.md §1.8 + memory `feedback_impeccable_external_attestation_required.md`. Scores below are POST-FIX where applicable.

| Task | Page | Critique | Audit | Fix commit | Notes |
| --- | --- | --- | --- | --- | --- |
| E.1 | `/help` | 33/40 NEEDS_FIX → PASS post-fix | 17/20 NEEDS_FIX → PASS post-fix | `4ec5051` | 1 HIGH comma splice + 1 HIGH bullet colon-space + a11y polish |
| E.2 | `/help/getting-started` | 36/40 NEEDS_FIX → PASS post-fix | 19/20 PASS | `56aa41a` | 1 HIGH comma splice + P2 link-to-/admin + P3 "Doug-facing" jargon |
| E.3 | `/help/daily-rhythm` | 91/100 PASS | 18/20 PASS | (none) | 1 LOW polish observation, non-blocking |
| E.4 | `/help/whats-different` | 35/40 PASS | 20/20 PASS | (none) | clean |
| E.5 | `/help/admin/dashboard` | 36/40 PASS | 20/20 PASS | (none) | 2 minor copy nits non-blocking |
| E.6 | `/help/admin/review-queues` + 6-code catalog backfill | 35/40 NEEDS_FIX → PASS post-fix | 19/20 PASS | `515a03e` | P3 panel-name drift + master-spec citation drop; 2 SPEC_CHECK on catalog titles spec-checked against existing dougFacing voice — kept as-is per memory `feedback_impeccable_critique_not_authoritative_vs_spec.md` |
| E.7 | `/help/admin/parse-warnings` + 1-code catalog backfill | 36/40 PASS | 19/20 PASS | (none) | 1 LOW redundancy; plan body's "largest content task" expectation didn't match live catalog (only PARSE_ERROR_LAST_GOOD matches `/^(WARN_\|PARSE_)/` predicate) — contract-correct |
| E.8 | `/help/admin/per-show-panel` | 37/40 PASS | 19/20 PASS | (none) | 2 P2 minor copy observations non-blocking |
| E.9 | `/help/admin/preview-as-crew` | 33/40 PASS w/3 polish items → PASS post-fix | 19/20 PASS | `d45688d` | P2 banner role-pill description + P3 jargon "redacted"→"hidden" + cross-link to per-show-panel |
| E.10 | `/help/admin/sharing-links` | 35/40 PASS w/polish items deferred | 20/20 PASS | (none) | 1 P2 "no-live-link state" undefined term + 2 P3; deferred per `feedback_deferral_discipline.md` — speculative, no concrete trigger |
| E.11 | `/help/admin/onboarding-wizard` | 36/40 PASS w/3 P2 → PASS post-fix | 20/20 PASS | `18bfdb4` | Step component consistency + Callout warning for Eric-side credential failure; P2 screenshot deferred to Phase F (manifest entry coordination needed) |
| E.12 | `/help/tour` | 37/40 PASS w/2 P3 polish | 20/20 PASS | (none) | 2 P3 (rhythm monotony + back/next link) deferred to /impeccable polish |
| E.13 | `/help/errors` TSX + live biconditional + 124-entry catalog backfill | 34/40 PASS | 18/20 NEEDS_FIX → PASS post-fix | `7c4c4ee` | P1 broken CTA `/admin/bug-report` route absent → swapped to `mailto:edweiss412@gmail.com`; 2 LOW SPEC_CHECK on pre-existing dougFacing voice (out of scope) |

**Phase-close cumulative impeccable §1.8 dual-gate:** every page either PASS or NEEDS_FIX-then-fixed. 13/13 external attestations completed. Zero CRITICAL findings phase-wide. Same-vector recurrence rule applied to comma splices (E.1 + E.2 HIGH, E.3 onward clean — vector converged at n=2; no n=3 trigger fired). No structural defensive layer required.

### §8.2 Adversarial review (Codex)

| Round | Date | Verdict | Findings (sev, summary) | Resolution commit | Notes |
| --- | --- | --- | --- | --- | --- |
| R1 | 2026-05-20 | NEEDS_FIX | 1 HIGH (handoff §8/§9 evidence gap blocking AGENTS.md §1.8 invariant) + 1 MEDIUM (/help/tour:37 advertises non-existent "batch-send to the full roster" capability) | (in progress) tour edit + this §8.1/§8.2/§9 backfill | Job `review-mpe2jo12-gvsbxz`, 2m36s, scope branch diff vs base `3eb73ad`. R1 finding #1 (HIGH) is process-invariant — handoff lacked per-page gate evidence at review time. R1 finding #2 (MEDIUM) is content-vs-implementation drift — tour over-promised sharing capability vs E.10 reality. |
| R2 | 2026-05-20 | NEEDS_ATTENTION | 1 MEDIUM (parse-warning catalog helpHref violates spec §5.6 carve-out — should be `/help/admin/parse-warnings#` not `/help/errors#`) + 1 MEDIUM (tour over-promises row-level review queue + clear/ignore parse-warning controls) | `18f61a1` | Job `review-mpe3a7ge-w1hfvv`. R2 finding #1: spec §5.6 has TWO matrix rows for `messageFor(code).helpHref` — parse-warning-row → `/help/admin/parse-warnings#` (specific) + template-family row → `/help/errors#` (default). Plan body's "ALL helpHref → /help/errors" simplification missed the carve-out. Fixed by changing PARSE_ERROR_LAST_GOOD helpHref + adding target-class meta-test. R2 finding #2: same content-drift class as R1 (tour over-promised capability). Rewrote both paragraphs to match E.6/E.7 page contracts + added negative-assertion tests pinning the no-row-level + no-clear-warning wording. |
| R3 | 2026-05-20 | NEEDS_ATTENTION (spec-vs-shipped) | 2 HIGH content-vs-implementation drift: (a) `/help/getting-started:9-14` summarizes the wizard but doesn't enumerate folder-URL verify + first-sheets review + Finalize; (b) `/help/admin/sharing-links` documents M9-spec-canonical signed-link controls (`Issue first link`, `Issue new link`, `Revoke all links`, `Copy share link`) that have zero matches in shipped `app/` + `components/` code | `[cross-link commit pending]` | Job `review-mpe3klwn-8krkpq`. CRITICAL CONTEXT: grep confirms the four sharing-link control labels are documented extensively in the FXAV master spec at lines 239, 241, 374, 1091, 1100, 1110, 1953, 1959, 1971, 1975, but absent from `app/` + `components/`. M9 was scoped to ship these per spec §7.2 + §5.2; the implementation gap is M9's deferred work, not Phase E's. Disposition per user decision (option 1 of AskUserQuestion): **docs follow spec (AGENTS.md §1.7 spec-canonical); M9 gap is M9's bug**. Both findings logged in DEFERRED.md as M11-E-D1 + M11-E-D2 with concrete M9 re-open triggers. E.2 cross-link to `/help/admin/onboarding-wizard` added inline to mitigate R3 finding #1's "skips required steps" reading without rewriting page scope. Per memory `feedback_iterate_until_convergence.md` round-3 cap: if R4 surfaces these same disagreements, declare structural convergence reached. |
| R4 | 2026-05-20 | NEEDS_ATTENTION | 1 MEDIUM (broken `/help/admin/per-show-panel#crew-preview-links` fragment — Markdown `## Crew preview links` heading not autoIDed under vanilla @next/mdx; recommends explicit-anchor + structural anchor-resolver meta-test) | `da6ba94` | Job `review-mpe5jtr0-h6zf3y`. **R3 dispositions ACCEPTED** by R4 (no relitigation). New MEDIUM is a different vector (anchor target integrity, not content drift). Fix converted `## Crew preview links` to `<h2 id="crew-preview-links">` + added `tests/help/anchor-resolver.test.ts` meta-test walking every `/help/<path>#<fragment>` link and asserting destination has explicit `<h2 id>` or `<RefAnchor id>` (skipping `/help/errors` dynamic catalog iteration). **CAVEAT:** retrospective analysis of R2/R3/R4 grep verbs confirms these rounds were SCOPED to prior-round findings (mpe3a7ge: `batch-send|admin/bug-report|title:null`; mpe3klwn: `parse-warning|§5.6`; mpe5jtr0: `bbbf1ab|/help/admin/per-show-panel`), NOT fresh-eyes whole-diff. My R2-R4 focus-text prompts violated `feedback_review_prompt_fresh_eyes_first.md` by leading with "Verify R<N> fixes landed at <SHA>" — narrowing the reviewer. The bugs they DID find are real; absence-of-findings on un-explored surfaces is NOT evidence of phase health. R5 was reframed with proper fresh-eyes lead. |
| R5 | 2026-05-20 | NEEDS_ATTENTION | 2 MEDIUM spec-vs-shipped (same class as R3): (a) `/help/admin/dashboard` documents Active Shows row actions `Open`/`Preview as`/`Re-sync`/`Archive` that grep confirms ABSENT from `components/admin/ActiveShowsPanel.tsx`; (b) `/help/admin/per-show-panel` documents sync-health-last-5 + parse-warnings sections that grep confirms ABSENT from `app/admin/show/[slug]/page.tsx` | (in progress) | Job `review-mpe62f71-vivuid`. **First proper fresh-eyes round since R1** (validated via the new PreToolUse hook `~/.claude/hooks/check-codex-adversarial-review-fresh-eyes.sh` + audit log at `.codex-adversarial-review-audit.log`). Same class as R3 M11-E-D1/D2 — surfaced ONLY because R5 was properly framed; R2/R3/R4 scoping missed them. Dispositioned per the R3 user decision pattern: docs follow spec (AGENTS.md §1.7 spec-canonical); M9 implementation gap is M9's bug. Logged as M11-E-D3 + M11-E-D4 in DEFERRED.md with concrete M9 re-open triggers. PATTERN CONFIRMED: R3 (D1/D2) + R5 (D3/D4) = 4 instances of spec-vs-shipped drift across 2 fresh-eyes rounds. Per memory `feedback_same_vector_recurrence_triggers_comprehensive_reanalysis.md`, the right structural defense is a meta-test that crosswalks UI labels referenced in `app/help/**/*.mdx` to production source code — flagged as BACKLOG / Phase H candidate, not in Phase E scope. |
| R6 | 2026-05-20 | NEEDS_ATTENTION (Phase F dependency) | 1 MEDIUM: 3 `<Screenshot name="X">` references on `/help/admin/{dashboard, review-queues, preview-as-crew}` pages resolve to `/help/screenshots/X-{light,dark}.webp` URLs absent from disk (Phase F hasn't shipped yet); production build between Phase E close and Phase F close would render broken images | (current) | Job `review-mpe89vuh-kp757m`. Second proper fresh-eyes round (after R5). Per AGENTS.md §1.7 + the existing R3/R5 disposition pattern, this is Phase F's responsibility per plan body line 56-57 + spec §3.6 + AC-11.18/19/20/25/26. Dispositioned as M11-E-D5 with the M9-precedent re-open trigger pattern. **Structural defense landed in this commit:** `tests/help/_metaScreenshotAssetExistence.test.ts` enumerates every `<Screenshot name="X">` reference + auto-activates when `public/help/screenshots/` gains a `.webp`. Production deployment of Phase E should wait for Phase F.10 to populate the WebPs. |
| R7 | 2026-05-20 | NEEDS_ATTENTION | 1 MEDIUM: my own just-landed `tests/help/_metaScreenshotAssetExistence.test.ts` line-by-line scanner missed multi-line `<Screenshot\n  name="X"\n />` JSX (2 of 3 current references silently dropped — `dashboard-overview` + `review-queues-side-by-side`). Phase F unlock would pass with broken coverage. | `678e014` | Job `review-mpe8v745-kt2u7v`. Embarrassing-but-correct catch. Fix: switch to whole-file `matchAll` with `[\s\S]*?` between tag opener and name= attribute (multi-line aware); compute 1-indexed line numbers from match index. Added regression assertion that collector finds all 3 current references by name (dashboard-overview / review-queues-side-by-side / preview-as-crew-banner). Verified RED → GREEN for that specific case. |
| R8 | 2026-05-20 | NEEDS_ATTENTION | 2 MEDIUM, both docs-diverge-from-spec (NOT deferrable): (a) first-seen review docs across review-queues + dashboard + getting-started + tour use obsolete "everything stages until Apply" model — master spec amendment 9 says clean first-seen sheets auto-publish; only MI/review-triggered or hard failures stage; (b) dashboard advertises "Open in Drive" action absent from `PendingPanelRetryButton`+`PendingPanelDiscardButtons` (actual shipped actions: "Retry now", "Defer until modified", "Permanently ignore"); crosswalk false-positive let "Open in Drive" pass because the literal string matched an unrelated comment in AgendaEmbed | `64e0976` | Job `review-mpe94e6v-5cqk8e`. Real bugs Phase E owned. Fixed: (1) rewrote first-seen flow paragraphs across 4 pages per amendment 9 (clean → auto-publish, MI/review-triggered → stage, hard fail → Retry/Defer/Permanently-ignore); (2) corrected dashboard pending-panel section to shipped actions + normalized case for 2 production-button labels (`Review and Apply`→`Review and apply` per PendingPanel.tsx:125; `Re-run Setup`→`Re-run setup` per settings/page.tsx:69,87); (3) hardened crosswalk to strip `//` line comments + `/* */` block comments from production source before substring matching. Regression assertions pin both wording classes. |
| R9 | 2026-05-20 | NEEDS_ATTENTION (out-of-scope for Phase E) | 1 MEDIUM on M12 plan: `docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/02-phase0-validation-state.md:77-84` proposes a failing-first test that queries `information_schema.columns` via PostgREST `.from()`, which never resolves (PostgREST doesn't expose `information_schema` as a REST table; existing project tests use `psql` over `TEST_DATABASE_URL` for this). | (N/A — M12 territory) | Job `review-mpe9n49e-bu6sl0`. Finding is REAL but belongs to M12 (solo-dev UX validation), not Phase E. M12 has its own active R-cycle (`09cfd70` → `35ccbd6` covers R1-R5); the M12 owner picks up this R9-equivalent finding for the next M12 plan-repair commit. Phase E's diff happens to overlap because M12 plan documents were authored after Phase D close-out `3eb73ad`. **Phase E own-surface verdict: zero new drift surfaced by R9. All known Phase E findings are either fixed in commits R1/R2/R5/R6/R7/R8 or dispositioned in DEFERRED.md M11-E-D1..D5 with concrete re-open triggers. Structural defense suite (4 meta-tests) is in place.** Phase E is ready for close-out + sign-off pending user review. |

---

## §9 Impeccable findings + dispositions (Phase E close-out)

Per-page critique + audit findings. Severity per impeccable v3 rubric (CRITICAL > HIGH/P1 > MEDIUM/P2 > LOW/P3). Dispositions follow `feedback_deferral_discipline.md`: land-now (FIXED), DEFERRED.md (concrete trigger), BACKLOG.md (speculative), spec-amendment.

### FIXED inline (HIGH + P1 + a11y P2)

| Finding | Severity | Page / File:line | Disposition | Commit |
| --- | --- | --- | --- | --- |
| Comma splice in Callout body | HIGH | `app/help/page.mdx:8` | FIXED — semicolon swap | `4ec5051` |
| Bullet `**[Link →](url)** : description` space-colon-space separator (a11y) | HIGH | `app/help/page.mdx:13-15` | FIXED — period split, no colon | `4ec5051` |
| Dense Callout with 4 inline links + parenthetical numbering | MEDIUM | `app/help/page.mdx:8` | FIXED — broke into shorter sentences | `4ec5051` |
| Test MDXProvider wrapper comment mismatch | MEDIUM | `tests/help/page-landing.test.tsx:14-19` | FIXED — verified wrapper IS load-bearing; updated comment | `4ec5051` |
| Added rendered-DOM H1 assertion (catches MDX compile regression) | LOW (audit recommendation) | `tests/help/page-landing.test.tsx` | FIXED — `getByRole("heading", { level: 1 })` | `4ec5051` |
| Comma splice "Unshare the folder, then re-share it" | HIGH | `app/help/getting-started/page.mdx:29` | FIXED — replaced "then" connective with "and" | `56aa41a` |
| Missing comma after introductory subordinate clause | MEDIUM | `app/help/getting-started/page.mdx:14` | FIXED — added comma | `56aa41a` |
| Bare `/admin` code spans never link to the route | MEDIUM P2 (audit) | `app/help/getting-started/page.mdx:6,10` | FIXED — wrapped first `/admin` mention in Markdown link | `56aa41a` |
| "Doug-facing parse warnings" leaks internal proper-noun | LOW P3 | `app/help/getting-started/page.mdx:28` | FIXED — dropped "Doug-facing" qualifier | `56aa41a` |
| Panel-name drift (hyphenated vs unhyphenated form) | LOW P3 | `app/help/admin/review-queues/page.mdx:16,31` | FIXED — unhyphenated bold form throughout | `515a03e` |
| Master-spec citation leaks to Doug-facing copy | LOW P3 | `app/help/admin/review-queues/page.mdx:33` | FIXED — dropped citation | `515a03e` |
| Banner description omits role-pill UI element | MEDIUM P2 | `app/help/admin/preview-as-crew/page.mdx:9` | FIXED — expanded enumeration | `d45688d` |
| Jargon "redacted fields" vs adjacent "hidden fields" header | LOW P3 | `app/help/admin/preview-as-crew/page.mdx` | FIXED — "redacted" → "hidden" | `d45688d` |
| Missing cross-link to per-show-panel#crew-preview-links | LOW P3 | `app/help/admin/preview-as-crew/page.mdx` intro | FIXED — added cross-link | `d45688d` |
| Step component inconsistency (Step 1 uses `<Step>`, Steps 2/3 use bullets) | MEDIUM P2 | `app/help/admin/onboarding-wizard/page.mdx` | FIXED — wrapped Step 2 + Step 3 action sequences | `18bfdb4` |
| No `<Callout type="warning">` for Eric-side credential failure | MEDIUM P2 | `app/help/admin/onboarding-wizard/page.mdx` | FIXED — Callout wraps the "not your problem" failure mode | `18bfdb4` |
| 32 em-dashes in 124-entry catalog backfill `longExplanation` strings (DESIGN.md L247 violation; user-visible on `/help/errors`) | HIGH | `lib/messages/catalog.ts` (newly-added fields only) | FIXED — case-by-case period/comma/colon/semicolon/parens replacement preserving meaning | `2d7f130` |
| Typecheck error `Property 'severity' does not exist` (TypeScript can't narrow union with no-severity variants) | HIGH | `tests/help/page-parse-warnings.test.tsx:25` | FIXED — `as MessageCatalogEntry[]` cast (E.13 precedent) | `2d7f130` |
| `/admin/bug-report` route absent — trailing CTA broken on 124 sections | P1 | `app/help/errors/page.tsx:46` | FIXED — swapped to `mailto:edweiss412@gmail.com` with prefilled subject | `7c4c4ee` |
| Pre-existing Phase D Tailwind canonicalization debt | LINT ERROR | `app/help/_components/{RefAnchor,Step,TipFromSheets}.tsx` | FIXED — `h-N w-N` → `size-N`, `leading-relaxed text-sm` → `text-sm/relaxed` (rendered output byte-identical) | `662fb9b` |
| /help/tour:37 advertises non-existent "batch-send to the full roster" sharing capability | MEDIUM (Codex R1) | `app/help/tour/page.mdx:37` | FIXED — rewrote to match E.10 sharing-links reality (one-by-one copy + paste + issue new) | (current; pre-R2 commit) |
| Handoff §8/§9 lacked per-page gate evidence at Codex R1 review time | HIGH (Codex R1) | `docs/superpowers/plans/2026-05-12-user-facing-docs/handoffs/E-content.md` | FIXED — §8.1 + §8.2 + §9 backfilled with all 13 pages' scores + commits + dispositions | (current; pre-R2 commit) |

### DEFERRED (concrete trigger or scheduled home)

| Finding | Severity | Page / File | Trigger / Home |
| --- | --- | --- | --- |
| `<Screenshot name="onboarding-step-3-rows">` for E.11 Step 3 | MEDIUM P2 (E.11 critique) | `app/help/admin/onboarding-wizard/page.mdx` | **Trigger:** Phase F.6/F.7 manifest entry coordination — adding the WebP reference without a corresponding Phase F manifest row would trip Phase F's drift gate. The page renders correctly without the screenshot today; Phase F manifest expansion will include this surface. |
| **M11-E-D1:** `/help/admin/sharing-links` documents M9-spec-canonical signed-link controls (`Issue first link`, `Issue new link`, `Revoke all links`, `Copy share link`) that grep of `app/` + `components/` confirms have NEVER been implemented in shipped code | HIGH (Codex R3) | `app/help/admin/sharing-links/page.mdx` | **Trigger:** M9 ships the four signed-link control labels per FXAV master spec §7.2 + §5.2. Phase E docs follow spec (AGENTS.md §1.7 spec-canonical); when M9 catches up, docs already match. See DEFERRED.md M11-E-D1 for full rationale + spec citations. |
| **M11-E-D2:** `/help/getting-started` summarizes the wizard rather than enumerating folder-URL verify + first-sheets review + Finalize | HIGH (Codex R3) | `app/help/getting-started/page.mdx:9-14` | **Trigger:** TRIAGED — short-narrative scope is intentional per spec §4.1 / §4.2 and the plan body content brief; the detailed wizard reference lives on `/help/admin/onboarding-wizard` (E.11). Mitigation: inline cross-link added at `app/help/getting-started/page.mdx:3` pointing to `/help/admin/onboarding-wizard` for the complete wizard (folder-URL verify + Finalize). Re-open trigger if R4 critique persists. |
| **M11-E-D3:** `/help/admin/dashboard` documents Active Shows row actions (`Open`, `Preview as`, `Re-sync`, `Archive`) absent from shipped `components/admin/ActiveShowsPanel.tsx` | MEDIUM (Codex R5 fresh-eyes) | `app/help/admin/dashboard/page.mdx` Active Shows section | **Trigger:** M9 ships the four row-action labels per master-spec §9.1. Same disposition pattern as M11-E-D1 — docs follow spec (AGENTS.md §1.7); M9 gap is M9's bug. See DEFERRED.md M11-E-D3. |
| **M11-E-D4:** `/help/admin/per-show-panel` documents sync-health-last-5 + parse-warnings sections absent from shipped `app/admin/show/[slug]/page.tsx` | MEDIUM (Codex R5 fresh-eyes) | `app/help/admin/per-show-panel/page.mdx` Sync health + Parse warnings sections | **Trigger:** M9 ships sync-health-history + parse-warnings-history sections per master-spec §9.2. Same disposition pattern as D1/D3. See DEFERRED.md M11-E-D4. |
| **M11-E-D5:** 3 `<Screenshot name="X">` references resolve to `/help/screenshots/X-{light,dark}.webp` URLs absent on disk until Phase F ships the harness + assets | MEDIUM (Codex R6 fresh-eyes) | `app/help/admin/dashboard/page.mdx:5`, `app/help/admin/review-queues/page.mdx:7`, `app/help/admin/preview-as-crew/page.mdx:5` | **Trigger:** Phase F.10 populates `public/help/screenshots/` with `dashboard-overview`, `review-queues-side-by-side`, `preview-as-crew-banner` WebPs. **Structural defense:** `tests/help/_metaScreenshotAssetExistence.test.ts` enumerates every reference + auto-activates the moment Phase F creates the directory. **Production-deploy guidance:** wait for Phase F.10 to land before exposing Phase E to admins, OR temporarily convert the 3 references to `<ScreenshotPlaceholder>` per plan body line 57 (and accept the per-page placeholder-ban assertion failure as expected during the interval). See DEFERRED.md M11-E-D5. |

### BACKLOG (speculative, no concrete trigger)

| Finding | Severity | Page / File | Rationale |
| --- | --- | --- | --- |
| DESIGN.md L33 contrast math error (`#ff8c1a × #ffffff` claimed 4.07:1, actually 2.34:1) | MEDIUM | `DESIGN.md:33` | Cross-cutting BACKLOG candidate from Phase D §14 #1. Affects every existing `bg-accent text-accent-text` instance project-wide (Bootstrap.tsx, settings, RevokeRowButton, et al.). Phase E did NOT introduce new instances. |
| Voice consistency / passive-vs-active drift in pre-existing catalog `dougFacing` strings | LOW (E.13 critique sample-check) | `lib/messages/catalog.ts` | Several pre-existing strings (`STAGED_PARSE_FAILED`, `SYNC_FILE_FAILED`, `SYNC_INFRA_ERROR`) use passive voice vs dominant active. Out of E.13's scope per pre-existing-em-dashes precedent. Future copy-pass candidate when there's product-owner appetite. |
| "no-live-link state" undefined term used 3× in E.10 | LOW P2 (E.10 critique) | `app/help/admin/sharing-links/page.mdx` | Polish-tier; reader infers from context. No concrete fix trigger. |
| E.10 "If you fix something in the sheet…" register drift to imperative within declarative section | LOW P3 (E.10 critique) | `app/help/admin/sharing-links/page.mdx` | Polish-tier; subtle, defer to `/impeccable polish` pass. |
| E.10 dense intro final sentence | LOW P3 (E.10 critique) | `app/help/admin/sharing-links/page.mdx` | Polish-tier; cite §5 list. |
| E.11 Step 3 paragraph density | LOW P3 (E.11 critique) | `app/help/admin/onboarding-wizard/page.mdx` | Polish-tier; H3 sub-sectioning. |
| E.12 rhythm monotony (7 identical H2+paragraph+link blocks) | LOW P3 (E.12 critique) | `app/help/tour/page.mdx` | Polish-tier; could group into "Daily / Setup surfaces" sub-banners or add inline "you'll spend most of your time here" tag. |
| E.12 no back-to-index / next-page affordance in body | LOW P3 (E.12 critique) | `app/help/tour/page.mdx` | Polish-tier; may already be provided by `app/help/layout.tsx`. Verify before adding. |
| E.13 `<RefAnchor>` is client-side; page renders 124 client islands | LOW P3 (E.13 audit) | `app/help/_components/RefAnchor.tsx` + `app/help/errors/page.tsx` | Hydration optimization candidate: refactor to event-delegation pattern on `<article>` root. Cross-cutting Phase D follow-up, not Phase E scope. |
| E.13 trailing CTA repeats 124× | LOW P3 (E.13 audit) | `app/help/errors/page.tsx` | Move to single page-footer note. Polish-tier; spec contract requires CTA exist, not per-entry. |
| E.13 HTML-entity decode in test is reasonable mitigation, could be refactored to `getByRole('heading', {name})` | LOW P2 (E.13 audit) | `tests/help/page-errors.test.tsx:67-72` | Test-rigor polish; current mitigation acceptable. |

### Spec-amendment / spec-canonical (no action)

| Finding | Severity | Page / File | Disposition |
| --- | --- | --- | --- |
| `MISSING_REVIEWER_CHOICE.title` "A review item was skipped" reads user-blaming | SPEC_CHECK 1 (E.6 critique) | `lib/messages/catalog.ts` | KEEP AS-IS. Mirrors existing `dougFacing` voice ("looks like one was skipped"); established voice per memory `feedback_impeccable_critique_not_authoritative_vs_spec.md`. |
| `DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE.title` "Diagrams couldn't be safely captured" implies security gate | SPEC_CHECK 2 (E.6 critique) | `lib/messages/catalog.ts` | KEEP AS-IS. Verbatim from existing `dougFacing` "diagrams couldn't be safely captured"; established voice. |
| "HTTP error" jargon at line 852 of catalog (DIAGRAMS-tab image fetch) | LOW SPEC_CHECK (E.13 critique) | `lib/messages/catalog.ts:~852` (longExplanation field) | OUT OF SCOPE. Pre-existing helpfulContext content surfaced when E.13 backfilled longExplanation; flagged for future product-owner pass. |

---

## §10 Performance & bundle impact

Phase E adds 12 `.mdx` pages + 1 `.tsx` page under `app/help/*`. Per AC-11.1 / §3.4, MDX compiles to RSC chunks at build time; no static prerender. Expected bundle delta:
- 13 new RSC chunks (one per page)
- No new dependencies
- `app/help/errors/page.tsx` iterates `MESSAGE_CATALOG` server-side; renders ~30+ sections (catalog-size-dependent). No client JS.

Phase I close-out captures the actual `next build` delta; Phase E does not.

---

## §11 Linked content deferred

- Crew-facing pages (`/help/crew/*`) — phase 2; not in M11 scope per spec §1.1.
- Phase F WebP screenshots — Phase E ships `<Screenshot name="...">` references; the WebPs land in F.6/F.7/F.8/F.10.
- Phase G affordance retrofit — Phase E provides the anchor targets; Phase G wires the `Learn more →` links and `?` tooltips on `/admin/*`.
- DESIGN.md L33 math error cross-cutting sweep — BACKLOG (Phase D §14 #1).

---

## §12 Sign-off

- [ ] Implementer (Opus / Claude Code): __ date __
- [ ] Reviewer (Codex cross-CLI): APPROVE on date __
- [ ] User review (solo dev opens `pnpm dev`, clicks through every /help/* page, confirms each renders + reads cleanly + cross-links work): __ date __

Phase E marked **closed** in `ROUTING.md` once all three are checked.

---

## §13 Meta-test inventory (created or extended in Phase E)

Per AGENTS.md "Meta-test inventory" mandate.

| Test file | Status | Purpose | Phase E action |
| --- | --- | --- | --- |
| `tests/help/page-<slug>.test.tsx` (×13) | CREATE | Per-page real-render + content-shape smokes. Each page's task creates its own. | CREATE per task |
| `tests/messages/_metaErrorCatalogDocs.test.ts` | EXTEND | B.4 shipped forced-fixture coverage with the biconditional deferred. E.13 ADDS the LIVE-catalog biconditional assertion (per r6 fix in 05-content.md Step 5). | EXTEND in E.13 |
| `tests/help/nav-consistency.test.ts` | EXTEND (auto) | Phase A's scaffold; passes once all 13 pages are non-stub. | Passes naturally as E.1-E.13 land |
| (potential) `tests/help/voice-consistency.test.ts` | CREATE-IF-TRIGGERED | Structural defense if 3+ pages surface same copy-class finding (§6 watchpoint #6). Pattern: TypeScript AST or regex sweep across `app/help/**/*.mdx` for known voice violations (e.g., passive on action-step Step components, em-dashes in titles, raw error codes in body). | DEFER unless triggered |
| (potential) `tests/messages/_metaCatalogFieldShape.test.ts` | NOT-IN-PHASE-E | Catalog field-shape contracts already covered by B.4 forced fixtures + E.13 live biconditional. No new meta-test required absent a new finding class. | None applies |

Note: "None applies because <reason>" is acceptable per AGENTS.md meta-test-inventory rule. The potential voice-consistency test above is conditional on the same-vector watchdog firing during Phase E execution; if no copy class hits n=3, we do not create it.

---

## §14 Phase E meta-observations (populated at close-out)

To be filled in at Phase E sign-off with class-vectors worth carrying forward to Phase F and beyond. Anticipated candidates (revise at close):

1. _(to populate)_ — Any copy-class same-vector trigger and the structural defense shipped.
2. _(to populate)_ — Spec-vs-critique disposition pattern observations from per-page dual-gates.
3. _(to populate)_ — Any Phase D component-contract ambiguity surfaced during MDX usage (informing Phase D follow-up or D-handoff §14 retrofit).
