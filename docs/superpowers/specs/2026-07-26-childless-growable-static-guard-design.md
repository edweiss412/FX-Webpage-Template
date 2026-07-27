# Childless-growable static guard (BL-CHILDLESS-GROWABLE-STATIC-GUARD)

<!-- spec-lint: not-ui — tests-only structural guard; components/ and app/ citations are census data, no UI surface ships -->
<!-- spec-lint: ignore — bare BACKLOG.md means the repo-root file; docs/superpowers/plans/BACKLOG.md shadows the basename -->
**Date:** 2026-07-26 · **Status:** draft · **Backlog:** `BACKLOG.md:169` (entry) and `BACKLOG.md:183` (revival mandate) — together "the backlog entry" wherever this spec says so · **Prior art:** descope record at `docs/superpowers/specs/2026-07-25-section-header-rebuild-and-phantom-spacers.md:345` (§6)

A source-scanning structural guard that fails-by-default when a NEW childless, unpainted, growable flex item lands anywhere under `components/` or `app/`. The five phantom-spacer sites repaired by PR #605 are covered by two layout oracles (`tests/e2e/pusher-alignment.layout.spec.ts`, `tests/e2e/section-header-layout.layout.spec.ts`) and the phantom-gap probe mounts; none of those instruments sees a SIXTH site written tomorrow. This guard closes that gap.

## 1. Problem and mandate

The prior attempt (spec §6 above) burned three adversarial rounds without converging: its prose rule selected 27 candidates while its prototype selected 17, because "childless" and "growable" hide real static-analysis ambiguity (conditional-`null` children, painted growables, `style={{flex}}`). The backlog entry mandates the revival order: **write the walker first, run it over the live tree, and let the actual output define the rule** — an allowlist of accepted shapes, not a leak hunt. That census has now been run (§2); this spec is written from its output.

Design principle, inlined for cross-CLI reviewers (this is the lesson that converged PR #592's new-tab guard after three rounds of the opposite approach): a static guard over TSX that tries to *prove an element is broken* is unsound by construction — spreads, computed values, and imported identifiers make the bypass space unbounded. The sound inversion is a **shape allowlist**: every growable candidate must match one of a small set of approved shapes; everything unresolvable fails closed with a message naming the approved shapes. The false-positive cost (one exemption comment on a correct-but-unusual shape) is accepted explicitly; a false negative ships the exact bug class this guard exists to prevent.

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
|---|---|
| Revival starts from the prototype; census output defines the rule | the backlog entry (header cite) |
| Deliverable is an allowlist of accepted shapes, not a leak hunt | the backlog entry (header cite) |
| A painted hairline is an APPROVED SHAPE, never an exemption comment — an exemption on it would teach authors the shape is suspect | the backlog entry (header cite) |
| Conditional/dynamic children are ACCEPTED statically; runtime emptiness belongs to the phantom-gap probes, not this guard | §4 shape 1; descope record `docs/superpowers/specs/2026-07-25-section-header-rebuild-and-phantom-spacers.md:379` lists the runtime instruments |
| Fail-closed posture on partially-resolvable classNames (§3 note) is intentional; live cost measured at zero (§2) | This spec, ratified at design review 2026-07-26 (user approved census-first design + autonomous ship) |
| `ShowReviewModalSkeleton.tsx` keeps its `flex-1` Skeleton — documented as not-a-collapsing-pusher | `docs/superpowers/specs/2026-07-25-section-header-rebuild-and-phantom-spacers.md:40` (§1.1 item 7) |
| Guard is tests-only; no UI files change, so invariant-8 impeccable dual-gate does not attach | `AGENTS.md` rule 8 defines UI surface; `tests/**` is outside it |
| No §12.4 error codes, no migrations, no schema manifest | §9 |

## 2. Census — the empirical basis (single source of truth for all counts)

Methodology: a TypeScript-AST walker (same parse stack as `tests/styles/_newTabScan.ts`) was run 2026-07-26 over every `*.tsx` under `components/` and `app/` at commit `396416778` (current `origin/main`). It over-collected every JSX element with any growable signal, then categorized by children shape. `app/help/**/*.mdx` was grepped separately: zero growable tokens in any MDX file today.

| Children shape | Count | Disposition under this guard |
|---|---|---|
| Static JSX/text children | 47 | accepted (possibly-childed) |
| Dynamic expression children (`{children}`, `{x.map(…)}`) | 25 | accepted (possibly-childed) |
| Conditional children (`{cond && x}`, ternary with a null arm) | 1 | accepted (possibly-childed) |
| Childless + painted | 2 | approved shape: painted |
| Childless component tag | 2 | approved shape: component registry |
| **Childless + unpainted + DOM tag (the banned shape)** | **0** | **extinct since PR #605** |
| Total growable candidates | 77 | |

The six non-bulk sites, verified against the live tree:

- `components/admin/BulkIgnoreControls.tsx:199` — `<span aria-hidden className="hidden h-px min-w-6 flex-1 bg-border min-[480px]:block" />` — painted hairline.
- `components/admin/wizard/step3ReviewSections.tsx:2248` — `<span aria-hidden className="h-px min-w-4 flex-1 bg-border" />` — painted hairline.
- `components/admin/showpage/ShowReviewModalSkeleton.tsx:152` — `<Skeleton className="h-11 flex-1 rounded-sm" />` — component tag; `Skeleton` renders a painted `<div>` (`animate-pulse … bg-surface-sunken`, `components/layout/Skeleton.tsx:15`).
- `components/admin/telemetry/EventFilters.tsx:74` — `<FilterTextInput … className="… flex-1 …" />` — component tag; `FilterTextInput` renders an `<input>` (`components/admin/telemetry/EventFilters.tsx:20`), which paints (border + background) and is interactive.
- `components/crew/primitives/PersonRow.tsx:163` — `<div className="flex min-w-0 flex-1 flex-col gap-1">` with a ternary child whose branches render real content — possibly-childed.
- Additionally sized (not a candidate): 1 childless DOM element with a non-literal `style` prop and no growable token (`components/crew/primitives/DayCard.tsx:94`, a painted phase dot) — quantifies the style-indirection hole (§7) at effectively zero.

Zero live candidates use `style={{flex…}}`. Zero childless candidates have a dynamic className or a spread attribute. Therefore the guard lands green with **zero exemption comments and a two-row component registry**.

## 3. The banned shape

A JSX element is a **violation** iff ALL of the following hold:

1. **Growable.** After variant-prefix stripping (everything up to the last top-level colon character, bracket-aware so `[&>*]:` and `min-[480px]:` strip correctly), any statically-harvested className token is `flex-1`, `flex-auto`, `grow`, `grow-<n>` with integer n > 0, `grow-[<v>]` with `parseFloat(v) > 0`, or `flex-[<v>]` whose first `_`/space-separated segment parses to a number > 0. A variant prefix does NOT excuse the token: `max-sm:flex-1` grows at some viewport, so it is growable. OR: a `style` JSX attribute whose object literal has a `flex` or `flexGrow` property with a statically-resolvable value > 0 — and if the value under one of those keys is NOT statically resolvable, the element is treated as growable (fail closed).
2. **Statically childless.** Self-closing; or zero children after dropping whitespace-only `JsxText` (with or without line terminators — a lone space paints nothing) and empty `JsxExpression` nodes (`{/* comment */}`); or every remaining child is a `{null}` / `{undefined}` literal expression.
3. **Unpainted.** No statically-harvested className token (after variant-prefix stripping) matches: `bg-*` except `bg-transparent`/`bg-none`; `border` or `border-*` except `border-0`/`border-none`; `shadow`/`shadow-*` except `shadow-none`/`shadow-0`; `ring`/`ring-*` except `ring-none`/`ring-0`.
4. **Not registered.** For component tags (capitalized identifier or member expression), the tag name is not in the approved-components registry (§4 shape 3). DOM (lowercase) tags are never registered — they are judged on shapes 1–2 and the exemption comment only.
5. **Not exempted.** No `childless-growable-ok: <reason>` exemption comment binds to the element (§4 shape 4).

**Static harvesting** collects string-literal className values, no-substitution templates, the static parts of template expressions, string arguments (recursively, including through conditional branches, `&&`/`||`/`??` operands, parenthesized expressions, and object-literal keys) of any call expression (`cn`, `clsx`, `cva`, `[…].join`), and marks the className *partially opaque* when any non-static part exists. **Fail-closed note (the decision that killed the prior attempt, now resolved by census):** a growable, childless element whose statically-visible tokens include no paint IS a violation even if an unresolvable dynamic part might paint at runtime. Opacity does not launder a candidate. The census (§2) measures today's cost of this posture at zero sites; a future correct-but-unusual site pays one exemption comment.

**Elements the scanner cannot see are out of the banned set by construction** (growability invisible): className supplied entirely via spread or identifier with no static growable token, `style` supplied as an identifier (`style={spacerStyle}`). These are the documented residual holes (§7), covered by the runtime instruments — NOT reasons to widen this guard into unsoundness.

## 4. The allowlist

Every growable candidate must match one of four shapes:

1. **Possibly-childed.** Any static JSX/text child, or any expression child other than a bare `{null}`/`{undefined}` literal — including `{cond && x}`, ternaries, `{children}`, `{label}`, `{items.map(…)}`, and `{""}`. The guard does not evaluate expressions; deciding runtime emptiness statically is the undecidable question that produced the 27-vs-17 census split, and it is framed OUT of this guard. Runtime-empty growables are the phantom-gap probes' jurisdiction.
2. **Painted childless.** At least one static paint token per §3.3. Both live hairlines (§2) match. This is an approved shape precisely so that no exemption comment ever appears on a hairline (the backlog entry, header cite).
3. **Registered component.** Childless growable component tags must appear in `APPROVED_GROWABLE_COMPONENTS`, a registry in the scanner module with a reason and `file:line` citation per row. Ships with exactly two rows: `Skeleton` (renders a painted div, `components/layout/Skeleton.tsx:15`) and `FilterTextInput` (renders an `<input>`, `components/admin/telemetry/EventFilters.tsx:20`). A NEW childless growable component tag fails closed with a message naming the registry. Matching is by tag name, not import path — accepted imprecision, noted in §7.
4. **Exemption comment.** `childless-growable-ok: <non-empty reason>` in a comment, with the same mechanics as the new-tab guard's exemption (`tests/styles/_newTabScan.ts:49` and its position-binding at `tests/styles/_newTabScan.ts:2836`): reason text required after the marker (jsdoc decoration stripped), the exemption binds to the FIRST following candidate by position, and an UNUSED exemption is itself a test failure — dead exemptions may not accumulate.

<!-- spec-lint: ignore — deliverable file, created by this spec's implementation -->
## 5. Scanner module — `tests/styles/_childlessGrowableScan.ts`

Follows the `_newTabScan.ts` template: TypeScript compiler API parse (`ts.createSourceFile`, TSX script kind), directory walk matching the repo idiom in `tests/styles/_classScanUtils.ts`, MDX compiled to JSX via `@mdx-js/mdx` `compileSync` before scanning (same stack as `tests/styles/_newTabScan.ts`), and a `scanSource(source, fileName)` seam exported so synthetic self-tests can drive every accept/reject branch without touching the live tree.

Exports: `scanSource` (returns `{ violations, exemptions }` with positions, tag, matched tokens, and a `reason` discriminant per violation: `"unpainted-childless-dom"` | `"unregistered-component"` | `"opaque-style-grow"`), `walkLiveTree()` (files under `components/` + `app/`, extensions `.tsx` + `.mdx`), `APPROVED_GROWABLE_COMPONENTS`, and the growable/paint token predicates (so self-tests can probe them directly).

Line terminators: reuse the template's `LINE_TERMINATORS` class (`tests/styles/_newTabScan.ts:45`) — LF-only handling produced three separate findings on the #592 guard; do not re-derive that class.

<!-- spec-lint: ignore — deliverable file, created by this spec's implementation -->
## 6. Meta test — `tests/styles/_metaChildlessGrowable.test.ts`

Runs in the unit suite via the existing `tests/styles/**/*.test.{ts,tsx}` glob (`vitest.projects.ts:73`); no CI wiring changes.

1. **Live-tree gate:** walk `components/` + `app/`, assert zero violations. Failure message per violation: `file:line`, tag, offending token, and the three compliant escapes (add real children, add a static paint token / register the component with a reason, or `childless-growable-ok: <reason>`).
2. **Unused-exemption gate:** assert zero unused exemptions in the live tree.
3. **Registry hygiene:** assert every `APPROVED_GROWABLE_COMPONENTS` row has a non-empty reason, and assert the registry has no row whose tag no longer appears as a childless growable anywhere in the live tree (dead rows may not accumulate — same posture as the unused-exemption gate).
4. **Synthetic self-tests through `scanSource`** — live-tree coverage is NOT sufficient (the tree currently exercises zero violation branches). Minimum branch matrix, each as an accept AND a reject probe where both exist:
   - growable tokens: `flex-1`, `flex-auto`, `grow`, `grow-2`, `grow-[1.5]`, `flex-[2_1_0%]`; non-growable: `grow-0`, `flex-none`, `flex-initial`, `flex-[0_1_auto]`, `basis-40`, `shrink-0`
   - variant prefixes: `max-sm:flex-1` (growable), `min-[480px]:flex-1` (growable, bracket-aware strip), `[&>*]:flex-1` (growable)
   - childless forms: self-closing; empty element; whitespace-only text (with and without newline); `{/* comment */}`; `{null}`; `{undefined}`
   - childed forms: element child, text child, `{cond && x}`, ternary, `{children}`, `{""}`
   - paint: `bg-border` (painted), `bg-transparent` (unpainted), `border` (painted), `border-0` (unpainted), `ring-1` (painted), `shadow-none` (unpainted), variant-prefixed paint `hover:bg-accent` (painted — a hover-painted spacer is out of the banned set; accepted imprecision)
   - className composition: template literal with static growable part + dynamic tail (violation when unpainted — fail-closed probe); `cn("flex-1", dynamic)` (same); fully-dynamic className (no candidate — invisible)
   - style prop: `style={{ flexGrow: 1 }}` (violation when childless/unpainted), `style={{ flex: 1 }}`, `style={{ flexGrow: 0 }}` (not growable), `style={{ flexGrow: grow }}` (fail-closed violation, `opaque-style-grow`), `style={spacerStyle}` (invisible — no candidate)
   - components: unregistered childless growable component (violation `unregistered-component`); registered tag (accepted); registered tag WITH children (not a childless candidate; registry not consulted)
   - exemptions: exemption with reason (accepted); reasonless exemption (not an exemption); exemption binding to first-following candidate only; unused exemption (failure)
   - spread: childless growable DOM element with `{...props}` and no static paint (violation — spread does not launder)

Anti-tautology: every reject probe asserts the violation's `reason` discriminant and location, not just a count; every accept probe runs against a source that ALSO contains a known violation, so an accidentally-empty scan cannot pass it.

## 7. Residual holes — documented, not covered

| Hole | Why out of scope | Covering instrument |
|---|---|---|
| Growability via spread/identifier className or `style={ident}` | Invisible to static harvest; widening to "flag everything opaque" re-opens the unbounded-leak model | Phantom-gap probes + layout oracles (`tests/e2e/pusher-alignment.layout.spec.ts`, `tests/e2e/section-header-layout.layout.spec.ts`) |
| Runtime-empty children (`{cond && x}` rendering null, `{""}`) | Statically undecidable — the exact 27-vs-17 ambiguity; allowlist frames it out | Same runtime instruments; `empty:hidden` idiom where applied |
| Registry matches by tag NAME, not import identity | Resolving imports is a project-graph problem; two-row registry does not warrant it | Registry hygiene gate (§6.3) keeps rows minimal and cited |
| Hover/state-variant-only paint (`hover:bg-accent`) counts as painted | Distinguishing "paints at rest" from "paints on interaction" is an open-ended variant taxonomy | Accepted imprecision; zero live sites depend on it (§2) |

## 8. Acceptance criteria

<!-- spec-lint: ignore — deliverable files, created by this spec's implementation -->
1. `tests/styles/_childlessGrowableScan.ts` + `tests/styles/_metaChildlessGrowable.test.ts` land; `pnpm test` green.
2. Live-tree walk reports zero violations, zero exemption comments in the tree, registry exactly the two §4.3 rows.
3. Every §6.4 branch probe present and passing; reject probes assert reason + location.
4. Reverting any one of the five PR #605 pusher repairs (e.g. restoring the deleted `<span className="flex-1" />` from `docs/superpowers/specs/2026-07-25-section-header-rebuild-and-phantom-spacers.md:48`) makes the meta test fail — verified once manually during implementation, recorded in the PR body (negative-regression verification).
5. The backlog entry (header cite) graduated (moved to the archive section per repo convention) in the same PR.

## 9. Not in scope

- No UI files, no `DESIGN.md` change, no impeccable gate (tests-only diff; `AGENTS.md` rule 8 boundary).
- No §12.4 codes, no `lib/messages/catalog.ts` edit, no `pnpm gen:spec-codes`.
- No migrations; `pnpm gen:schema-manifest` and validation-project apply N/A.
- No change to the runtime phantom-gap probes or either layout oracle.
- No retro-fit of the guard onto `.ts` (non-TSX) files: JSX requires `.tsx` in this repo, and MDX is compiled in.
- Dimensional-invariants / transition-inventory sections: N/A — no component with modes, states, or fixed-dimension parents ships here (spec-self-review items acknowledged, not silently skipped).
