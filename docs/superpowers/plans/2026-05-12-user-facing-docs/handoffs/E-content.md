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

- [ ] **Phase E — Content authoring** (`05-content.md`)
  - [ ] Task E.1 — `app/help/page.mdx` landing
  - [ ] Task E.2 — `app/help/getting-started/page.mdx` first-time setup
  - [ ] Task E.3 — `app/help/daily-rhythm/page.mdx` daily rhythm
  - [ ] Task E.4 — `app/help/whats-different/page.mdx` Sheets-vs-FXAV diff
  - [ ] Task E.5 — `app/help/admin/dashboard/page.mdx` reading the dashboard
  - [ ] Task E.6 — `app/help/admin/review-queues/page.mdx` + catalog backfill (review-queue codes)
  - [ ] Task E.7 — `app/help/admin/parse-warnings/page.mdx` + catalog backfill (parse-warning codes)
  - [ ] Task E.8 — `app/help/admin/per-show-panel/page.mdx`
  - [ ] Task E.9 — `app/help/admin/preview-as-crew/page.mdx`
  - [ ] Task E.10 — `app/help/admin/sharing-links/page.mdx`
  - [ ] Task E.11 — `app/help/admin/onboarding-wizard/page.mdx`
  - [ ] Task E.12 — `app/help/tour/page.mdx`
  - [ ] Task E.13 — `app/help/errors/page.tsx` (TSX) + live-catalog biconditional meta-test (closes B.4 deferral per r6)
  - [ ] Per-page impeccable §1.8 dual-gate — 13 pages, each via EXTERNAL fresh-subagent dispatch. Tracked in §8 / §9.
  - [ ] Phase-level adversarial review (Codex) — iterating until APPROVE; see §8 R-row table.
  - [ ] Phase E close-out gates green: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm test:e2e --project=mobile-safari`.
  - [ ] User review.

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

| Task | Page | Critique score | Audit score | Disposition commit(s) | Notes |
| --- | --- | --- | --- | --- | --- |
| E.1 | `/help` | | | | |
| E.2 | `/help/getting-started` | | | | |
| E.3 | `/help/daily-rhythm` | | | | |
| E.4 | `/help/whats-different` | | | | |
| E.5 | `/help/admin/dashboard` | | | | |
| E.6 | `/help/admin/review-queues` | | | | |
| E.7 | `/help/admin/parse-warnings` | | | | |
| E.8 | `/help/admin/per-show-panel` | | | | |
| E.9 | `/help/admin/preview-as-crew` | | | | |
| E.10 | `/help/admin/sharing-links` | | | | |
| E.11 | `/help/admin/onboarding-wizard` | | | | |
| E.12 | `/help/tour` | | | | |
| E.13 | `/help/errors` | | | | |

### §8.2 Adversarial review (Codex)

| Round | Date | Verdict | Findings (sev, summary) | Resolution commit | Notes |
| --- | --- | --- | --- | --- | --- |
| R1 | | | | | |
| ... | | | | | |
| Final | | APPROVE | — | — | Phase E ships |

---

## §9 Impeccable findings + dispositions (Phase E close-out)

Per-page critique + audit findings. Each row: which page, finding, severity, disposition (FIXED inline / DEFERRED to DEFERRED.md / BACKLOG / spec-amendment-required).

| Finding | Severity | Page / File:line | Disposition | Commit |
| --- | --- | --- | --- | --- |
| | CRITICAL / HIGH / MEDIUM / LOW | | FIXED / DEFERRED / BACKLOG | |

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
