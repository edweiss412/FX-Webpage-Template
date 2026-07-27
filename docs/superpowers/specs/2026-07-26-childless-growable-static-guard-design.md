# Childless-growable static guard (BL-CHILDLESS-GROWABLE-STATIC-GUARD)

<!-- spec-lint: not-ui — tests-only structural guard; components/ and app/ citations are census data, no UI surface ships -->
<!-- spec-lint: ignore — bare BACKLOG.md means the repo-root file; docs/superpowers/plans/BACKLOG.md shadows the basename -->
**Date:** 2026-07-26 · **Status:** draft (R1 repairs applied) · **Backlog:** `BACKLOG.md:169` (entry) and `BACKLOG.md:183` (revival mandate) — together "the backlog entry" wherever this spec says so · **Prior art:** descope record at `docs/superpowers/specs/2026-07-25-section-header-rebuild-and-phantom-spacers.md:345` (§6)

A source-scanning structural guard that fails-by-default when a NEW childless, unpainted, growable flex item lands anywhere under `components/` or `app/`. The five phantom-spacer sites repaired by PR #605 are covered by two layout oracles (`tests/e2e/pusher-alignment.layout.spec.ts`, `tests/e2e/section-header-layout.layout.spec.ts`) and the phantom-gap probe mounts; none of those instruments sees a SIXTH site written tomorrow. This guard closes that gap.

## 1. Problem and mandate

The prior attempt (spec §6 above) burned three adversarial rounds without converging: its prose rule selected 27 candidates while its prototype selected 17, because "childless" and "growable" hide real static-analysis ambiguity (conditional-`null` children, painted growables, `style={{flex}}`). The backlog entry mandates the revival order: **write the walker first, run it over the live tree, and let the actual output define the rule** — an allowlist of accepted shapes, not a leak hunt. That census has now been run twice (§2; the v2 rerun repaired a harvesting hole the R1 adversarial review found in v1), and this spec is written from its output.

Design principle, inlined for cross-CLI reviewers (this is the lesson that converged PR #592's new-tab guard after three rounds of the opposite approach): a static guard over TSX that tries to *prove an element is broken* is unsound by construction — spreads, computed values, and imported identifiers make the bypass space unbounded. The sound inversion is a **shape allowlist**: every growable candidate must match one of a small set of approved shapes; everything unresolvable fails closed with a message naming the approved shapes. The same inversion applies INSIDE each predicate: growability is "prove the grow factor is zero, else growable" (§3.1), and paint is an explicit token set, not a prefix family (§4.2). The false-positive cost (one exemption comment or one reviewed set/registry addition on a correct-but-unusual shape) is accepted explicitly; a false negative ships the exact bug class this guard exists to prevent.

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
|---|---|
| Revival starts from the prototype; census output defines the rule | the backlog entry (header cite) |
| Deliverable is an allowlist of accepted shapes, not a leak hunt | the backlog entry (header cite) |
| A painted hairline is an APPROVED SHAPE, never an exemption comment — an exemption on it would teach authors the shape is suspect | the backlog entry (header cite) |
| Conditional/dynamic children are ACCEPTED statically; runtime emptiness belongs to the phantom-gap probes, not this guard | §4 shape 1; descope record `docs/superpowers/specs/2026-07-25-section-header-rebuild-and-phantom-spacers.md:379` lists the runtime instruments |
| Fail-closed posture on partially-opaque classNames and unparseable visible flex values (§3 note) is intentional; live cost measured at zero (§2) | This spec, ratified at design review 2026-07-26 (user approved census-first design + autonomous ship) |
| Union-based paint harvesting across conditional branches is an ACCEPTED residual, probed and documented (§7 row 5) | This spec, R1 repair decision; both live conditional-paint sites paint in every branch (§2) |
| Component tags NEVER satisfy the painted shape — registry membership is the only component path (§4.3) | This spec, R1 finding 2 repair |
| `ShowReviewModalSkeleton.tsx` keeps its `flex-1` Skeleton — documented as not-a-collapsing-pusher | `docs/superpowers/specs/2026-07-25-section-header-rebuild-and-phantom-spacers.md:40` (§1.1 item 7) |
| Guard is tests-only; no UI files change, so invariant-8 impeccable dual-gate does not attach | `AGENTS.md` rule 8 defines UI surface; `tests/**` is outside it |
| No §12.4 error codes, no migrations, no schema manifest | §9 |

## 2. Census — the empirical basis (single source of truth for all counts)

Methodology: a TypeScript-AST walker (same parse stack as `tests/styles/_newTabScan.ts`) was run 2026-07-26 over every `*.tsx` under `components/` and `app/` at commit `396416778` (current `origin/main`). Version 2 of the walker — after the R1 adversarial review proved v1 failed to harvest `[…].join(" ")` array receivers — over-collects every JSX element with any growable signal under the §3 grammar, then categorizes by children shape. `app/help/**/*.mdx` was grepped separately: zero growable tokens in any MDX file today.

| Children shape | Count | Disposition under this guard |
|---|---|---|
| Static JSX/text children | 47 | accepted (possibly-childed) |
| Dynamic expression children (`{children}`, `{x.map(…)}`) | 19 | accepted (possibly-childed) |
| Conditional children (`{cond && x}`, any ternary child) | 7 | accepted (possibly-childed) |
| Childless DOM tag, painted | 4 | approved shape: painted |
| Childless component tag | 2 | approved shape: component registry |
| **Childless + unpainted (the banned shape)** | **0** | **extinct since PR #605** |
| Total growable candidates | 79 | |

The eight non-bulk sites, verified against the live tree:

- `components/admin/BulkIgnoreControls.tsx:199` — `<span aria-hidden className="hidden h-px min-w-6 flex-1 bg-border min-[480px]:block" />` — painted hairline.
- `components/admin/wizard/step3ReviewSections.tsx:2248` — `<span aria-hidden className="h-px min-w-4 flex-1 bg-border" />` — painted hairline.
- `components/admin/OnboardingWizard.tsx:196` — step connector `<span>`; className via `["h-px max-w-[60px] flex-1 rounded-full", isDone ? "bg-border-strong" : "bg-border"].join(" ")` — painted in both branches (the v1 harvesting miss).
- `components/crew/RightNowHero.tsx:549` — progress segment `<span>`; className via array-join with `"h-1.5 flex-1 rounded-pill"` and `active ? "border border-accent-edge bg-accent" : "bg-border"` — painted in both branches (the other v1 miss).
- `components/admin/showpage/ShowReviewModalSkeleton.tsx:152` — `<Skeleton className="h-11 flex-1 rounded-sm" />` — component tag; `Skeleton` renders a painted `<div>` (`animate-pulse … bg-surface-sunken`, `components/layout/Skeleton.tsx:15`).
- `components/admin/telemetry/EventFilters.tsx:74` — `<FilterTextInput … className="… flex-1 …" />` — component tag; `FilterTextInput` renders an `<input>` (`components/admin/telemetry/EventFilters.tsx:20`), which paints and is interactive. Its visible `border`/`bg-surface` className tokens do NOT classify it — component tags never take the painted path (§4.3).
- `components/crew/primitives/PersonRow.tsx:163` — `<div className="flex min-w-0 flex-1 flex-col gap-1">` with a ternary child whose branches render real content — possibly-childed.
- Additionally sized (not a candidate): `components/crew/primitives/DayCard.tsx:94` phase dot — its conditional `style` (`components/crew/primitives/DayCard.tsx:103`) resolves to an object literal with only `backgroundColor` in one branch and `undefined` in the other; no `flex`/`flexGrow` key in any branch, so it is not growable under §3.1.

The walker also reports every flex-family token it judged NOT growable, as a grammar-sanity check: `flex` ×828, `flex-col` ×466, `shrink-0` ×216, `flex-wrap` ×101, `flex-row` ×13, `flex-none` ×4, `flex-nowrap` ×3, `basis-0` ×3, `basis-full` ×3, `flex-col-reverse` ×1, `grow-0` ×1, `shrink` ×1 — all correct.

Zero live candidates are growable via `style`. Zero CHILDLESS candidates depend on fail-closed opacity (the two join-site classNames are partially opaque, but their statically-harvested tokens already decide both growability and paint). Therefore the guard lands green with **zero exemption comments, a two-row component registry, and a five-token paint set**.

## 3. The banned shape

A JSX element is a **violation** iff ALL of the following hold, evaluated in this order, with the FIRST matching reason as its discriminant: component tag not registered → `unregistered-component`; growable only via an opaque style value → `opaque-style-grow`; otherwise → `unpainted-childless-dom`.

1. **Growable — "prove the grow factor is zero, else growable."** Growability is decided over the statically-harvested className tokens (harvesting rules below) plus the `style` attribute (style rules below).
   **Token grammar.** Strip one leading or trailing important marker (the `!` character), then strip variant prefixes (everything up to the last colon character at zero bracket/paren depth, so `[&>*]:`, `min-[480px]:`, and `flex-(--x)` survive intact). Then:
   - Layout/basis/shrink tokens are outside the family: `flex`, `flex-row`, `flex-col`, `flex-row-reverse`, `flex-col-reverse`, `flex-wrap`, `flex-nowrap`, `flex-wrap-reverse`, `basis-*`, `shrink`, `shrink-*` — never growable.
   - Provably zero: `flex-none`, `flex-initial`, `grow-0`, `grow-[v]`/`flex-[v]` whose decided value parses to exactly 0.
   - Growable: `grow`, `flex-auto`, `flex-<n>` for numeric n > 0, fraction forms `flex-<a>/<b>` (positive), `grow-<n>` for n > 0, and — fail-closed — every remaining statically-visible flex-value form that cannot be proven zero: custom-property forms `flex-(--x)`/`grow-(--x)`, arbitrary values whose content does not `parseFloat` to a number (`grow-[calc(1)]`, `flex-[var(--x)]`), and arbitrary properties `[flex-grow:v]`/`[flex:v…]` with unparseable or positive v. For `flex-[v]` and `[flex:v…]`, the decided value is the first `_`/space-separated segment.
   - **Style attribute.** The `style` value is resolved through parentheses and conditional branches. An object literal contributes growability if a `flex`/`flexGrow` property (identifier or string-literal key) has a numeric or numeric-string value > 0; an unparseable value under one of those keys, a spread inside the object, or a computed key makes the element growable fail-closed (`opaque-style-grow`). A branch that is `null`/`undefined` contributes nothing. A style value that is an identifier, call, or member expression is INVISIBLE to the scan — residual hole (§7), not a candidate.
2. **Statically childless.** Self-closing; or zero children after dropping whitespace-only `JsxText` (with or without line terminators — a lone space paints nothing) and empty `JsxExpression` nodes (`{/* comment */}`); or every remaining child is a `{null}` / `{undefined}` literal expression.
3. **Unpainted** (evaluated for DOM tags only; component tags are decided solely by the registry, §4.3). No statically-harvested token (after important/variant stripping) is a member of the `PAINT_TOKENS` set (§4.2) — or a member IS present but so is a negator of that member's family (§4.2), in which case the element is conservatively unpainted.
4. **Not registered** (component tags — capitalized identifier or member expression — only). The tag name is not in `APPROVED_GROWABLE_COMPONENTS`.
5. **Not exempted.** No `childless-growable-ok: <reason>` exemption comment binds to the element (§4.4).

**Static harvesting** collects, recursively at EVERY level of the className expression (not only inside call arguments): string literals; no-substitution templates; the static parts of template expressions; array-literal elements; call-expression arguments AND the receiver expression of a property-access call (so `["h-px flex-1", cond ? "bg-a" : "bg-b"].join(" ")` harvests the array); both branches of conditional expressions; both operands of every binary operator (`&&`, `||`, `??`, `+`, and any other); parenthesized expressions; and object-literal keys (the clsx object form). Any non-static part encountered marks the className *partially opaque*. **Fail-closed note (the decision that killed the prior attempt, now resolved by census):** a growable, childless element whose statically-visible tokens include no `PAINT_TOKENS` member IS a violation even if an unresolvable dynamic part might paint at runtime. Opacity does not launder a candidate. The census (§2) measures today's cost of this posture at zero sites.

**Elements the scanner cannot see are out of the banned set by construction** (growability invisible): className supplied entirely via spread or identifier with no static growable token, `style` supplied as an identifier/call/member. These are the documented residual holes (§7), covered by the runtime instruments — NOT reasons to widen this guard into unsoundness.

## 4. The allowlist

Every growable candidate must match one of four shapes:

1. **Possibly-childed.** Any static JSX/text child, or any expression child other than a bare `{null}`/`{undefined}` literal — including `{cond && x}`, ternaries, `{children}`, `{label}`, `{items.map(…)}`, and `{""}`. The guard does not evaluate expressions; deciding runtime emptiness statically is the undecidable question that produced the 27-vs-17 census split, and it is framed OUT of this guard. Runtime-empty growables are the phantom-gap probes' jurisdiction.
2. **Painted childless (DOM tags only).** At least one statically-harvested token is in `PAINT_TOKENS`, an explicit exact-match set exported by the scanner and seeded from the census: `bg-border`, `bg-border-strong`, `bg-accent`, `border`, `border-accent-edge`. Membership is exact — no prefix families, so non-painting utilities (`bg-cover`, `bg-clip-*`, `border-transparent`, `border-solid`, `ring-inset`, `shadow-transparent`, …) can never satisfy it. A matched member is cancelled when a negator of its family is also present anywhere in the harvest: `bg-transparent`/`bg-none` (bg family), `border-0`/`border-none` (border family), `shadow-none`/`shadow-0` (shadow family), `ring-0`/`ring-none` (ring family) — cancellation is deliberately order-blind and conservative (a candidate carrying `border border-0` is treated as unpainted). Growing the set is a reviewed one-line change; a new paint token used by a legitimate new hairline fails the guard with a message naming the set, and the author adds the token in the same PR. This is an approved shape precisely so that no exemption comment ever appears on a hairline (the backlog entry, header cite).
3. **Registered component.** EVERY childless growable component tag must appear in `APPROVED_GROWABLE_COMPONENTS`, regardless of what className tokens are visible at the call site — a className is a prop, not a guarantee of what the component renders, so the painted shape never applies to component tags. Registry rows carry a reason and `file:line` citation. Ships with exactly two rows: `Skeleton` (renders a painted div, `components/layout/Skeleton.tsx:15`) and `FilterTextInput` (renders an `<input>`, `components/admin/telemetry/EventFilters.tsx:20`). A NEW childless growable component tag fails closed with a message naming the registry. Matching is by tag name (member-expression tags use the full dotted text); accepted imprecision, noted in §7.
4. **Exemption comment.** `childless-growable-ok: <non-empty reason>` in a comment, with the same mechanics as the new-tab guard's exemption: marker constant and reason-required parsing as at `tests/styles/_newTabScan.ts:49` (jsdoc decoration stripped), position-based binding to the FIRST following candidate with same-line/preceding-line adjacency as implemented at `tests/styles/_newTabScan.ts:2854`, and an UNUSED exemption is itself a test failure — dead exemptions may not accumulate. **TSX only:** exemption comments are NOT supported in MDX (§5 — compilation hoists comments away from their elements); an MDX growable that needs exempting is restructured or moved to a TSX component.

<!-- spec-lint: ignore — deliverable file, created by this spec's implementation -->
## 5. Scanner module — `tests/styles/_childlessGrowableScan.ts`

Follows the `_newTabScan.ts` template: TypeScript compiler API parse (`ts.createSourceFile`, TSX script kind), directory walk matching the repo idiom in `tests/styles/_classScanUtils.ts`, and a `scanSource(source, fileName)` seam exported so synthetic self-tests can drive every accept/reject branch without touching the live tree.

**MDX.** `.mdx` files are compiled to JSX via `@mdx-js/mdx` `compileSync` before scanning (same stack as `tests/styles/_newTabScan.ts:2445`). Two MDX-specific contract points, forced by compilation: (a) violation diagnostics in MDX report the source FILE with the compiled-output position explicitly labeled approximate — compiled positions do not map to author lines; (b) exemption comments are not honored in MDX (`compileSync` hoists adjacent comments into module boilerplate, so position-binding cannot see them) — the §6.4 matrix probes both behaviors. Zero MDX growables exist today (§2), so this contract is currently cost-free.

Exports: `scanSource` (returns `{ violations, exemptions }` with positions, tag, matched tokens, and the §3 reason discriminant per violation), `walkLiveTree()` (files under `components/` + `app/`, extensions `.tsx` + `.mdx`), `APPROVED_GROWABLE_COMPONENTS`, `PAINT_TOKENS`, and the growable/paint token predicates (so self-tests can probe them directly).

Line terminators: reuse the template's `LINE_TERMINATORS` class (`tests/styles/_newTabScan.ts:45`) — LF-only handling produced three separate findings on the #592 guard; do not re-derive that class.

<!-- spec-lint: ignore — deliverable file, created by this spec's implementation -->
## 6. Meta test — `tests/styles/_metaChildlessGrowable.test.ts`

Runs in the unit suite via the existing `tests/styles/**/*.test.{ts,tsx}` glob (`vitest.projects.ts:73`); no CI wiring changes.

1. **Live-tree gate:** walk `components/` + `app/`, assert zero violations. Failure message per violation: location, tag, offending token, and the compliant escapes (add real children; for a DOM tag add a `PAINT_TOKENS` member or extend the set in review; for a component tag add a registry row with a reason; or `childless-growable-ok: <reason>`).
2. **Unused-exemption gate:** assert zero unused exemptions in the live tree.
3. **Registry and set hygiene:** every `APPROVED_GROWABLE_COMPONENTS` row and every `PAINT_TOKENS` member must be LIVE — the registry row's tag appears as a childless growable component somewhere in the tree, and the paint token is the deciding member on at least one live painted-childless candidate. Dead rows/members may not accumulate (same posture as the unused-exemption gate). This gate is what keeps both sets census-honest — it fails if `FilterTextInput` stops being used childless-growable, or if a paint token outlives its last hairline.
4. **Synthetic self-tests through `scanSource`** — live-tree coverage is NOT sufficient (the tree currently exercises zero violation branches). Branch matrix, each an accept AND a reject probe where both exist:
   - growable: `flex-1`, `flex-2`, `flex-1/2`, `flex-auto`, `grow`, `grow-2`, `grow-[1.5]`, `flex-[2_1_0%]`, `!flex-1`, `flex-1!`, `grow-(--x)`, `flex-(--x)`, `grow-[calc(1)]`, `flex-[var(--x)]`, `[flex-grow:1]`, `[flex:1]`, `[flex:1_1_0%]`
   - not growable: `grow-0`, `grow-[0]`, `flex-none`, `flex-initial`, `flex-[0_1_auto]`, `[flex-grow:0]`, `flex`, `flex-row`, `flex-col`, `flex-wrap`, `basis-40`, `basis-full`, `shrink`, `shrink-0`
   - variant prefixes: `max-sm:flex-1`, `min-[480px]:flex-1` (bracket-aware strip), `[&>*]:flex-1`, `sm:grow-(--x)` (paren-aware strip)
   - childless forms: self-closing; empty element; whitespace-only text without newline; whitespace-only text with CR, with U+2028, and with U+2029 (pinning the shared `LINE_TERMINATORS` contract); `{/* comment */}`; `{null}`; `{undefined}`
   - childed forms: element child, text child, `{cond && x}`, ternary, `{children}`, `{""}`
   - harvesting: plain string; no-substitution template; template with static growable part + dynamic tail (violation when unpainted — fail-closed probe); `cn("flex-1", dynamic)` and nested calls; `["flex-1", cond ? "bg-border" : "bg-accent"].join(" ")` (the census-v1 miss — MUST be a probe); clsx object keys; `&&`, `||`, `??`, and `+` operands; parenthesized expression; fully-dynamic className (no candidate — invisible)
   - paint set: `bg-border` (painted), `bg-accent` (painted), token NOT in set but in a paint-looking family — `bg-cover`, `border-transparent`, `ring-2`, `shadow-sm` (all unpainted → violation); negators: `border border-0` (unpainted), `bg-border bg-transparent` (unpainted), `bg-none`, `border-none`, `shadow-none` and `shadow-0` cancelling a hypothetical set member, `ring-0`/`ring-none` likewise; variant-prefixed set member `min-[480px]:bg-border` (painted — the BulkIgnoreControls shape)
   - union-paint residual (accepted-limit probe): `["flex-1", cond ? "bg-border" : ""].join(" ")` — accepted although one branch is unpainted; the probe documents the §7 row-5 residual as a deliberate claim
   - style: `style={{ flexGrow: 1 }}` (violation when childless), `style={{ flex: 1 }}`, `style={{ flex: "1 1 0%" }}` (growable — numeric-string parse), `style={{ flexGrow: 0 }}` (not growable), `style={{ flexGrow: grow }}` (fail-closed, `opaque-style-grow`), `style={{ ...growStyle }}` (fail-closed), `style={cond ? { flexGrow: 1 } : undefined}` (growable via branch), `style={cond ? { backgroundColor: "x" } : undefined}` (not growable — the DayCard shape), `style={spacerStyle}` (invisible — no candidate)
   - components: unregistered childless growable component (violation `unregistered-component`); unregistered component WITH visible paint tokens `<Foo className="flex-1 bg-surface" />` (STILL a violation — paint never applies to components); registered tag (accepted); member-expression tag `<UI.Spacer className="flex-1" />` (violation, unregistered); registered tag WITH children (not a childless candidate; registry not consulted)
   - reason precedence: an unregistered component with an opaque style grow → `unregistered-component` (component check first); a DOM tag with opaque style grow and no paint → `opaque-style-grow`
   - exemptions: exemption with reason (accepted); reasonless exemption (not an exemption); jsdoc-decorated exemption (reason parsed through decoration); exemption binding to first-following candidate only (second candidate still fails); a COMPLIANT first candidate consuming the exemption (exemption unused → failure); marker text inside a string literal (not an exemption); unused exemption (failure)
   - MDX: compiled-MDX childless growable (violation, file-level diagnostic labeled approximate); compiled-MDX painted growable (accepted); MDX exemption comment adjacent to a violation (NOT honored — still a violation, pinning the §4.4 TSX-only contract)
   - spread: childless growable DOM element with `{...props}` and no static paint (violation — spread does not launder)

Anti-tautology: every reject probe asserts the violation's reason discriminant and location, not just a count; every accept probe runs against a source that ALSO contains a known violation, so an accidentally-empty scan cannot pass it. Concrete failure mode each self-test catches: a scanner edit that silently narrows harvesting (probe: the join-array shape v1 actually missed), widens paint (probe: `bg-cover`), or breaks exemption ownership (probe: consumed-by-compliant-candidate).

## 7. Residual holes — documented, not covered

| # | Hole | Why out of scope | Covering instrument |
|---|---|---|---|
| 1 | Growability via spread/identifier className, or `style` supplied as identifier/call/member | Invisible to static harvest; widening to "flag everything opaque" re-opens the unbounded-leak model | Phantom-gap probes + layout oracles (`tests/e2e/pusher-alignment.layout.spec.ts`, `tests/e2e/section-header-layout.layout.spec.ts`) |
| 2 | Runtime-empty children (`{cond && x}` rendering null, `{""}`) | Statically undecidable — the exact 27-vs-17 ambiguity; allowlist frames it out | Same runtime instruments; `empty:hidden` idiom where applied |
| 3 | Registry matches by tag NAME, not import identity | Resolving imports is a project-graph problem; two-row registry does not warrant it | Registry hygiene gate (§6.3) keeps rows minimal, cited, and live |
| 4 | Variant-prefixed or interaction-state paint (`min-[480px]:bg-border`, `hover:bg-accent`) counts as painted | Distinguishing "paints at rest in every state" from "paints conditionally" is an open-ended variant taxonomy | Accepted imprecision; the one live variant-prefixed site (`components/admin/BulkIgnoreControls.tsx:199`) is also `hidden` below 480px, so it occupies no space unpainted |
| 5 | Union-based paint across conditional branches: a candidate painted in ONE branch is accepted even if another branch paints nothing | Branch-sensitive harvest × paint × cancellation explodes the predicate; both live conditional-paint sites (§2: `OnboardingWizard.tsx:196`, `RightNowHero.tsx:549`) paint in EVERY branch | §6.4 accepted-limit probe records the claim; runtime instruments catch a one-branch-unpainted regression |
| 6 | MDX exemptions unsupported; MDX diagnostics positionally approximate | `compileSync` hoists comments and rewrites positions (§5) | Zero MDX growables live (§2); §6.4 MDX probes pin the contract |

## 8. Acceptance criteria

<!-- spec-lint: ignore — deliverable files, created by this spec's implementation -->
1. `tests/styles/_childlessGrowableScan.ts` + `tests/styles/_metaChildlessGrowable.test.ts` land; `pnpm test` green.
2. Live-tree walk reports zero violations, zero exemption comments in the tree, registry exactly the two §4.3 rows, paint set exactly the five §4.2 tokens.
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
