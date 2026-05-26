**Status: COMPLETED 2026-05-19.** Adversarial review converged at R1 APPROVE on SHA `a5bd9b7` — Codex's implementation passed Opus review on the first round, no fix cycles required. M10 advisory raw-code grep retired in same commit range; X.1 R3 residual #1 (artifact-name collision pattern) fully closed via canonical X.* naming convention. See "Convergence log" below.

# Handoff — X.2: No raw error codes in user-visible UI (AC-X.2)

**Handed off:** 2026-05-19 by Eric Weiss
**Implementer:** GPT-5.5 / Codex CLI (per ROUTING.md "X.\* — Cross-cutting" row — backend audit, no UI surface).
**Adversarial reviewer:** Opus 4.7 / Claude Code (reviewer-pairing logic — Codex implements → Opus reviews; per ROUTING.md "Reviewer pairing logic" + memory `feedback_iterate_until_convergence.md` + the X.1 R2 lesson — Opus reviewer caught 2 P0 findings Codex's same-model self-review missed).
**Plan file:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/11-cross-cutting.md` — Task X.2 only (lines 175–429).

> X.2 is the second of six cross-cutting audit tasks (X.1–X.6). No §A/§B split — pure backend test/audit infrastructure (ts-morph AST walker + Playwright DOM-property crawl + generated manifest + regression fixtures + CI workflow). UI hard rule N/A — no file under `app/` (outside `app/api/**`), `components/`, or design tokens is mutated.

> **X.2 retires M10's advisory raw-code grep.** Per M10 close-out R3 finding F1 (`handoffs/M10-onboarding.md:766`), M10 found that a naïve raw-code static-grep gate matched false positives in `components/admin/StagedReviewCard.tsx` and `components/admin/wizard/Step2Verify.tsx` (discriminated-union types, switch cases, `lookupDougFacing()` / `<HelpAffordance>` / `<ErrorExplainer>` wrappers, catalog-enum arrays, `setError(Code)?()` setters, comments). M10 relaxed its gate to ADVISORY with a documented exemption list and explicitly routed the structural replacement to "M11" — that's X.2's surface. When X.2's AST audit ships APPROVED, the advisory grep is retired in the same commit range. Tests for the codes legitimately referenced in those wrapper sites stay green; only **rendered-raw** codes fail.

> **X.2 catches the bug class X.1 cannot.** X.1 enforces three-way parity (spec ↔ catalog ↔ scenario) but says nothing about whether a code that has Doug-facing copy in the catalog is ACTUALLY rendered to a user when the spec says it's admin-log-only. M10 close-out R3 finding B/I HIGH (`handoffs/M10-onboarding.md:778`) is the canonical example: `<Step2Verify>` rendered the admin-log-only `WIZARD_SESSION_SUPERSEDED_DURING_SCAN` code to Doug because the catalog had Doug-facing copy (drift the X.1 audit would not catch — X.1 only verifies catalog deep-compares the spec, not that the spec/catalog agreement reflects intent). X.2's audit at the **render** surface — anchored on the forbidden-set including ACTIVE + RETIRED + INTERNAL_CODE_ENUMS — catches the structural class of bug.

> **Same-model self-review pattern (X.1 R2 lesson).** X.1's R1 (Codex self-review) closed 6 findings but missed 2 P0 + 4 minor; R2 (Opus reviewer) surfaced them. Expect the same on X.2 — the forbidden-set extends to internal status codes, the AST discrimination rules are subtle, and the DOM-property crawl interacts with React's controlled-component semantics. The R2 convergence cycle should be assumed at planning time, not treated as a surprise.

---

## 1. Spec sections in scope

Exhaustive, not representative.

- **§12.4** — User-facing message catalog. X.2 consumes `SPEC_CODES` + `RETIRED_CODES` from the X.1-shipped manifest at `lib/messages/__generated__/spec-codes.ts` as part of the forbidden-set. X.2 does NOT mutate §12.4 or the catalog; it asserts no `[A-Z_]+`-shaped catalog identifier reaches user-visible rendered output.
- **§17.2 (AC-X.2, AC-X.6)** — AC-X.2 names the audit shape; AC-X.6 names the required CI status check `x2-no-raw-codes` verbatim.
- **§13.1** — Report channel boundaries. Not directly parsed, but a Doug-facing copy substring that contains a raw `REPORT_*` code would inappropriately reveal the channel boundary; M8 R2 M2 is the canonical example of a spec-faithful copy regression. X.2 catches the substring-leak class structurally.
- **§4.1 / §6.8 / §9.0 / §10** — sources of the INTERNAL_CODE_ENUMS forbidden-set extension:
  - `parse_warnings[].code` enum (defined in `lib/parser/types.ts`, emitted by `lib/parser/blocks/**`).
  - `shows.last_sync_status` enum values (`ok`, `drive_error`, `sheet_unavailable`, `parse_error`, `pending_review`).
  - `pending_ingestions.last_error_code` values (`MI-1_*` through `MI-14_*`, `DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE`, etc., per spec §6.8 invariant enum).
  - `admin_alerts.code` values that may not yet be promoted to §12.4 (catch-all guard).
- **AGENTS.md §1.5** — "No raw error codes in user-visible UI." X.2 IS the canonical audit. Replaces "trust me" enforcement with structural enforcement.

## 2. Acceptance criteria

**Primary AC (verbatim from spec §17.2):**

- **AC-X.2** — **No raw error codes in user-visible surfaces — AST audit + DOM property crawl.** Static analysis covers ACTIVE and RETIRED codes across `components/**/*.tsx` AND user-visible attribute values (`aria-label`, `title`, `alt`, `placeholder`, `value`); JSXAttribute-aware AST analysis (NOT regex over text). **Plus a runtime Playwright crawl** that reads each rendered surface's live DOM property values (`inputElement.value`, `<select>.selectedOptions[i].text`, `contenteditable` regions' `innerText`, shadow-DOM children) — not just `textContent`. A code present in any of these emit-points fails the audit.

**Task-internal sub-criteria (from plan Task X.2, `11-cross-cutting.md:175-429`):**

- **Forbidden-set is the union of three sources:** `SPEC_CODES.keys` + `RETIRED_CODES.keys` (both from X.1 manifest at `lib/messages/__generated__/spec-codes.ts`) + `INTERNAL_CODE_ENUMS.keys` (new committed manifest at `lib/messages/__generated__/internal-code-enums.ts`, extracted from typed enum sources via a new generator script). The internal-enum manifest covers `parse_warnings.code`, `shows.last_sync_status`, `pending_ingestions.last_error_code` MI-N_* values, and `admin_alerts.code` values not yet promoted to §12.4.
- **Substring-leak min length:** `SUBSTRING_LEAK_MIN_LENGTH = 4`. Tokens shorter than 4 chars (`ok`, etc.) are excluded from runtime substring scans (false-positive risk too high) but remain enforced via the AST audit's exact-match check on JSX text/attr nodes.
- **Static-analysis audit** at `tests/cross-cutting/no-raw-codes.test.ts` (the file name that matches the spec §17.2 CI check `x2-no-raw-codes`). Uses `ts-morph` to walk every `.tsx` under `app/**/*.tsx` (excluding `app/api/**`) and `components/**/*.tsx`. Per JSX node type:
  - **JsxText** — every forbidden code (full or substring) in any JSX text node fails.
  - **JsxAttribute** — string-literal initializers (`title="LINK_REVOKED_FLOOR"`) AND expression initializers (`alt={'CODE'}`, `placeholder={`...${code}...`}`). Walk every `StringLiteral` + `NoSubstitutionTemplateLiteral` inside the expression. Variable references caught by Playwright crawl as backstop.
- **Playwright runtime audit** at `tests/e2e/no-raw-codes.spec.ts` (the e2e suffix routes through the project's Playwright config; the static audit is the CI gate, the Playwright run is supplementary coverage per AC-X.2 "Plus a runtime Playwright crawl"). Crawls every fixture-seeded route + admin route + asset 410/401 surface. Three crawl phases per element:
  - **1a textContent** — every element's textContent + every child's.
  - **1b user-visible attributes** — `aria-label`, `title`, `alt`, `placeholder`, `value`, `aria-description`, `aria-roledescription`.
  - **1c live DOM properties** — `inputElement.value`, `textarea.value`, `select.selectedOptions[0].text`, `select.selectedOptions[0].value`, `contenteditable.textContent`. This is the controlled-component coverage that 1a + 1b miss.
- **Discrimination rules (the M10 R3 F1 false-positive list).** A literal code-string in any of the following positions is **non-rendered** and MUST NOT fail the AST audit:
  - **Function-call first-argument literals to catalog routers:** `messageFor('CODE')`, `getDougFacing('CODE')`, `getCrewFacing('CODE')`, `lookupHelpfulContext('CODE')`, `copyForCode('CODE')` (and any other helper in `lib/messages/`), `setError('CODE')`, `<ErrorExplainer code="CODE" />`, `<HelpAffordance code="CODE" />`. These are the routing layer; they ARE the catalog binding.
  - **Discriminated-union type literals:** `type X = { kind: 'LINK_REVOKED_FLOOR' | ... }`.
  - **Switch / case labels:** `case 'LINK_REVOKED_FLOOR':`.
  - **Object-key string literals when the key is the discriminator field:** `{ code: 'CODE' }` where `code` is the discriminator (covered by Step 1a in the plan).
  - **Array-of-codes literals:** `const ACTIVE_CODES = ['CODE1', 'CODE2', ...]` (catalog enumeration).
  - **Comments:** `// CODE` / `/* CODE */`. AST-aware walks already skip comments; the discrimination is automatic but flag if the implementer uses naïve grep.
  - **`data-testid` attribute values** — debug-only, never rendered to users. NOT in the `USER_VISIBLE_ATTRS` list.
- **Regression fixtures** at `tests/cross-cutting/fixtures/no-raw-codes/`:
  - `bad-jsx-text-raw-code.tsx` — `<span>LINK_REVOKED_FLOOR</span>`. AST audit MUST fail.
  - `bad-jsx-attr-string-literal.tsx` — `<input title="LINK_REVOKED_FLOOR" />`. AST audit MUST fail.
  - `bad-jsx-attr-expression.tsx` — `<input title={'LINK_REVOKED_FLOOR'} />`. AST audit MUST fail.
  - `bad-jsx-attr-template-literal.tsx` — `<input title={\`Error: ${'LINK_REVOKED_FLOOR'}\`} />`. AST audit MUST fail.
  - `bad-internal-enum-leak.tsx` — `<span>{parseWarning.code}</span>` where the variable resolves to `UNKNOWN_FIELD`. AST audit catches the variable reference NO; Playwright crawl MUST catch the rendered string.
  - `bad-controlled-textarea.tsx` / `bad-controlled-select.tsx` / `bad-controlled-input.tsx` / `bad-contenteditable.tsx` — per plan Task X.2 Step 1c (Fix 5 regression-test fixtures). Each tests that the live-DOM-property crawl catches what `textContent` + `getAttribute` miss.
  - `good-via-messageFor.tsx` — `<span>{messageFor('LINK_REVOKED_FLOOR').crewFacing}</span>`. Both audits MUST pass (the literal `'LINK_REVOKED_FLOOR'` is the messageFor first-argument; the rendered text is the catalog copy, never the raw code).
  - `good-via-error-explainer.tsx` — `<ErrorExplainer code="LINK_REVOKED_FLOOR" />`. Both audits MUST pass.
  - `good-discriminated-union.tsx` — `type R = { kind: 'LINK_REVOKED_FLOOR' | 'OTHER' }`. AST audit MUST pass (type position, not rendered).
  - `good-switch-case.tsx` — `case 'LINK_REVOKED_FLOOR':`. AST audit MUST pass.
  - `good-data-testid.tsx` — `<button data-testid="LINK_REVOKED_FLOOR-action">`. Both audits MUST pass (testid is debug-only).
  - `good-noncontrolled-input.tsx` — `<input defaultValue="placeholder text" />`. All three Playwright phases MUST NOT flag.
- **CI workflow** exposes the static audit as a status check named `x2-no-raw-codes` verbatim per spec §17.2 named-check list. Audit artifact upload follows the pattern X.1 established (the workflow file `.github/workflows/x-audits.yml` already exists; X.2 extends it with a new job — see watchpoint 7 below for the artifact-name collision pattern flagged at X.1 R3 close-out).
- **Internal-enum manifest regeneration** is idempotent: `pnpm gen:internal-code-enums` (new script name TBD) against current `lib/parser/types.ts` + `lib/parser/invariants.ts` + `lib/sync/applyParseResult.ts` + other typed enum sources produces a byte-identical `lib/messages/__generated__/internal-code-enums.ts`. CI verifies via `git diff --exit-code` after running the script.

## 3. Spec amendments in scope

Of the three ratified §13.2.3 amendments (per `00-overview.md` and `AGENTS.md`):

- [x] Amendment 1 — `listForRepo` recovery contract — **N/A — M8-only.**
- [x] Amendment 2 — `created_at` horizon + lease-expired reaper predicate — **N/A — M8-only.**
- [x] Amendment 3 — `lease_holder` ownership protocol — **N/A — M8-only.**

No other spec amendments apply directly to X.2. The 2026-05-12 AGENDA amendment, 2026-05-14 admin-allowlist amendment, and 2026-05-19 §12.4 catalog cleanup amendment are inputs to the X.1-shipped `SPEC_CODES`/`RETIRED_CODES` manifest that X.2 consumes — X.2 does not re-process them.

## 4. Pre-handoff state

- [x] **Previous milestones committed**: M0..M10 closed. X.1 closed at SHA `2090dc2` (`docs(handoff): X.1 catalog parity converged at R3 APPROVE 2026-05-19`). Current `git rev-parse --short HEAD` at handoff authoring is `2090dc2` (assuming clean tree). Working tree clean.
- [x] **Pre-flight tests passing in isolation** (verified during implementation):
  - `pnpm lint` exits 0 (the four pre-existing M7 `<img>` warnings carry forward; X.2 does not change that count).
  - `pnpm typecheck` exits 0.
  - `pnpm test` exits 0.
  - `pnpm test:audit:x1-catalog-parity` exits 0 (X.1's gate must still be green; X.2 builds on its manifest).
  - `pnpm verify:spec-amendment` exits 0.
- [x] **Specific files present from prior milestones**:
  - `lib/messages/__generated__/spec-codes.ts` (X.1-shipped; canonical `SPEC_CODES` + `RETIRED_CODES` manifest with `{retiredIn, replacedBy, variant?}` retired-row shape). X.2 IMPORTS this.
  - `lib/messages/lookup.ts` — exports `messageFor`, `getDougFacing`, `getCrewFacing`, `lookupHelpfulContext`. **No `copyForCode` function exists** (M10 R3 references `copyForCode` in a planning note, but the actual API is `messageFor` + `getDougFacing`/`getCrewFacing`). The catalog-router function-name allowlist in the discrimination rules MUST match the actual exports (`messageFor`, `getDougFacing`, `getCrewFacing`, `lookupHelpfulContext`); if `copyForCode` is added later it goes on the list, but X.2 does not introduce it.
  - `lib/messages/__internal__/walkSourceFiles.ts` (X.1-shipped at R2 fix). X.2 reuses this for the AST walk root resolution; do NOT duplicate.
  - `tests/messages/no-inline-error-strings.test.ts` (M9 C7 / M5-D8). The existing inline-literal-copy meta-test. X.2 is **orthogonal**: M5-D8 catches `setError("Something failed")` (literal English copy); X.2 catches `setError("LINK_REVOKED_FLOOR")` (literal code-shape). Both stay green after X.2 ships.
  - `lib/parser/types.ts` — defines `parse_warnings[].code` typed enum (X.2's generator extracts from here).
  - `lib/parser/invariants.ts` + `lib/sync/applyParseResult.ts` — write `pending_ingestions.last_error_code` values (X.2's generator unions them in).
  - `.github/workflows/x-audits.yml` — X.1 already shipped this; X.2 extends with a new job (`x2-no-raw-codes`).
- [x] **NEW X.2 deliverables**:
  - `scripts/extract-internal-code-enums.ts` — generator for the internal-enum manifest.
  - `lib/messages/__generated__/internal-code-enums.ts` — committed manifest.
  - `tests/cross-cutting/no-raw-codes.test.ts` — the AST audit (CI gate name `x2-no-raw-codes`).
  - `tests/e2e/no-raw-codes.spec.ts` — the Playwright DOM-property crawl.
  - `tests/cross-cutting/fixtures/no-raw-codes/` — the 11 fixtures enumerated in §2 above.
  - `package.json` script entries: `gen:internal-code-enums`, `test:audit:x2-no-raw-codes` (or whatever pattern matches the X.1 `test:audit:x1-catalog-parity` convention).
  - `.github/workflows/x-audits.yml` job extension exposing the `x2-no-raw-codes` status check.
- [x] **DEFERRED.md** — no X.2 sub-items pre-listed at handoff. The audit surfaced no rendered-raw-code production findings requiring a UI fix or deferral.

## 5. Plan-wide invariants that apply (from AGENTS.md §1)

- [x] **TDD per task** (invariant 1) — always. Each fixture is failing-test-first.
- [ ] **Per-show advisory lock** (invariant 2) — **N/A.**
- [ ] **Email canonicalization** (invariant 3) — **N/A.**
- [ ] **No global cursor** (invariant 4) — **N/A.**
- [x] **No raw error codes in user-visible UI** (invariant 5) — **X.2 IS the canonical structural audit for this invariant.** Replaces M10's advisory grep. The Step2Verify R3 finding (`handoffs/M10-onboarding.md:778`) is the canonical bug class X.2's render-site audit catches.
- [x] **Commit per task** (invariant 6) — always. Conventional-commits: `<type>(<scope>): <summary>`. Suggested scopes: `messages`, `cross-cutting`, `scripts`, `test`. Example commits:
  - `scripts(messages): bootstrap internal-code-enums extractor (Task X.2 Step 0)`
  - `feat(messages): commit __generated__/internal-code-enums.ts manifest (Task X.2 Step 0)`
  - `test(cross-cutting): AST audit + JSXAttribute walker (Task X.2 Step 2)`
  - `test(cross-cutting): regression fixtures for no-raw-codes audit (Task X.2 Step 2)`
  - `test(cross-cutting): Playwright DOM-property crawl (Task X.2 Step 1)`
  - `ci(audits): wire x2-no-raw-codes as PR-required status check`
  - `chore(messages): retire M10 advisory raw-code grep; X.2 ships structural replacement`
- [x] **Spec is canonical** (invariant 7) — if the audit surfaces a code that legitimately must render raw (no current case in scope, but flag if found), open a spec question; do NOT silently allowlist.
- [ ] **UI quality gate / impeccable dual-gate** (invariant 8) — **N/A — no UI surface.** X.2 touches `scripts/`, `lib/messages/__generated__/`, `tests/cross-cutting/`, `tests/e2e/`, `.github/workflows/`, `package.json`. No file under `app/` (outside `app/api/**`), `components/`, design tokens.
- [x] **Supabase call-boundary discipline** (invariant 9) — N/A for X.2's own code (audit makes no Supabase calls). If the audit surfaces a render site whose error path also has a Supabase call-boundary violation, route the fix to the owning milestone (M5/M10); do not absorb into X.2.

## 6. Watchpoints from prior adversarial review

Pulled forward from X.1 R1–R3 (especially R2 Opus findings) + M10 close-out R3 (the advisory-grep false-positive list) + M9 C7 (inline-error consolidation patterns).

1. **Code-shape-based class-sweep, NOT name-list-based** (memory `feedback_class_sweep_must_be_code_shape_not_name_list.md`; X.1 R2 P0-1 was a vacuous-test class from this root). The AST walker MUST walk every `.tsx` under `app/` (excluding `app/api/**`) and `components/**` via the shared `walkSourceFiles` helper. The Playwright crawler MUST iterate every fixture-seeded route + admin route + asset 410/401 surface — not a hardcoded URL list. If a future page is added under `app/some-new-feature/page.tsx`, the audit must catch it automatically. Reuse the X.1 shared walker at `lib/messages/__internal__/walkSourceFiles.ts` — do NOT introduce a third walker.
2. **Discrimination is the entire correctness story.** Per M10 R3 F1, a naïve grep over `[A-Z_]{4,}` catches the routing layer (`messageFor('CODE')`), discriminated-union types, switch cases, catalog-enum arrays, comments — all of which are legitimate non-rendered references. The AST audit MUST use `ts-morph` (the standard at this project per the plan Step 2 body) and discriminate by AST node position (JsxText / JsxAttribute / not function-call-first-arg / not switch-case-label / etc.). A test that fires false positives on `<ErrorExplainer code="LINK_REVOKED_FLOOR" />` is broken; the catalog-router function-name allowlist (`messageFor`, `getDougFacing`, `getCrewFacing`, `lookupHelpfulContext`, `setError`, plus the JSX wrapper components `<ErrorExplainer>`, `<HelpAffordance>`) is part of the contract.
3. **Anti-tautology** (CLAUDE.md writing-plans + AGENTS.md additions). Each bad fixture must contain a real failure mode, not a contrived test-only string. `bad-controlled-textarea.tsx` per plan Step 1c (Fix 5) is the canonical real-failure shape: a controlled input where React owns `.value` via the property setter; `textContent` + `getAttribute('value')` both miss it; only the live-DOM-property read catches it. If the fixture's failure path is too obvious to be a regression risk (e.g., `<span>LINK_REVOKED_FLOOR</span>` is fine, but if every bad fixture is just literal JSX text, the audit's discrimination layer is undertested), add at least one fixture per discrimination class that pairs a good twin against a bad twin (good: `<span>{messageFor('CODE').crewFacing}</span>`; bad: `<span>{'CODE'}</span>`).
4. **Internal-enum manifest extraction is fragile.** The plan Step 1 references "auto-extracted from `lib/parser/invariants.ts` and `lib/sync/applyParseResult.ts`" but does not specify the AST shape the extractor walks. Bound the extractor explicitly: walk every `last_error_code: '<VALUE>'` literal assignment in `lib/sync/` + every typed string-literal enum member in `lib/parser/types.ts`; emit each as an `INTERNAL_CODE_ENUMS` entry with a `source: '<provenance>'` field. The extractor's contract: a new MI-N_* enum member added to `lib/parser/types.ts` AND emitted by a parser/sync write MUST appear in the regenerated manifest within the same PR, or CI fails. Test with a regression fixture that adds a synthetic enum member and confirms the audit catches the missing manifest entry.
5. **X.1 R2 P0-2 collision pattern.** X.1 found that codes existing in BOTH `SPEC_CODES` (active canonical) and `RETIRED_CODES` (variant) needed disambiguation. X.2 may face a related issue: a code appearing in BOTH `SPEC_CODES` (catalog) and `INTERNAL_CODE_ENUMS` (parse_warnings + last_sync_status) — e.g., `SHEET_UNAVAILABLE` is a `shows.last_sync_status` value AND a `§12.4` catalog code. The forbidden-set should dedupe by key (`new Set([...catalog, ...retired, ...internal])`), and the audit's diagnostic message must name the provenance (`leaked code SHEET_UNAVAILABLE from {catalog,last_sync_status}`) so the fix path is clear.
6. **Substring vs exact-match boundary** (plan Step 1c + Step 2 body). Runtime crawl uses substring detection with `SUBSTRING_LEAK_MIN_LENGTH = 4`. AST audit uses exact-match on JSX text/attr nodes AND substring on template-literal contents. The two boundaries do different work; document why each is right. A common over-fitting risk: the AST audit doing substring on every StringLiteral catches false positives in non-rendered string constants (e.g., `const ALLOWED_KIND = 'LINK_REVOKED_FLOOR' as const` inside a discriminator-mapping function). Discrimination by AST position is more important than substring/exact-match here.
7. **CI artifact-name collision pattern** (X.1 R3 residual). X.1 R3 flagged that the workflow artifact name `x1-catalog-parity` may collide with future X.2–X.5 jobs in the same workflow file. **X.2's job MUST use a unique artifact name** — suggested: `x2-no-raw-codes-${{ github.run_attempt }}-${{ github.job }}` or just `x2-no-raw-codes-artifacts`. The X.2 implementer should also propose the canonical pattern X.3–X.5 will follow (the X.2 handoff is the right venue to codify it), and ideally rename X.1's artifact at the same time so the pattern is consistent before the gate goes PR-required.
8. **FIRST_SEEN_REVIEW allowlist registry trigger** (X.1 R3 residual). X.1's allowlist at `tests/cross-cutting/codes.test.ts:13-18` is currently a one-entry hardcoded list (`FIRST_SEEN_REVIEW`). X.1 R3 said "migrate to a co-located registry when count > 3." X.2 will likely add 0–N entries to a similar allowlist for legitimately-non-rendered code references that don't match the AST discrimination rules (none expected at planning time, but flag if found during execution). If X.2's allowlist count + X.1's allowlist count exceeds 3, **migrate both to a shared registry** at `lib/messages/__internal__/displayAllowlist.ts` (or similar); otherwise keep them per-test.
9. **Verify findings against the actual call site before patching** (memory `feedback_verify_review_findings_against_external_api_spec.md`). When adversarial review surfaces a finding, read the JSX surface verbatim and confirm the raw-code reference is genuinely rendered (vs. routed through a wrapper). X.1 R2 verified each P0 disposition by reading code, not by trusting Codex's self-report — X.2 reviewer should do the same.
10. **Deferral discipline** (memory `feedback_deferral_discipline.md`). Small mechanical fixes the audit surfaces (a `<span>{rawCode}</span>` that should be `<span>{messageFor(rawCode).crewFacing}</span>`) land in X.2's scope as fix commits. They do NOT route to DEFERRED.md or BACKLOG.md and do NOT wait for the owning milestone to re-open. The only deferral candidate is a finding that requires a spec amendment (e.g., spec §12.4 missing a code that the audit proves is rendered) — those land before X.2 closes.
11. **Same-vector recurrence rule** (memory `feedback_same_vector_recurrence_triggers_comprehensive_reanalysis.md`). If 3+ adversarial-review rounds in a row surface findings on the same vector (e.g., "discrimination rule misses a new wrapper component"), pause per-instance patching and ship a structural defensive layer (a registry-shaped allowlist, a generalized AST predicate). Don't whack-a-mole.

## 7. Test commands

- **X.2 AST audit:** `pnpm test tests/cross-cutting/no-raw-codes.test.ts` — runs the ts-morph static analysis + regression fixtures. The CI status check name `x2-no-raw-codes` is the verbatim spec §17.2 named-check.
- **X.2 Playwright crawl:** `pnpm test:e2e tests/e2e/no-raw-codes.spec.ts` (or whatever Playwright invocation the project standardizes — the existing `pnpm test:e2e --project=mobile-safari` is the canonical M-series e2e invocation; X.2 may need a separate project or merge into the existing one).
- **Internal-enum manifest idempotency:** `pnpm gen:internal-code-enums && git diff --exit-code lib/messages/__generated__/internal-code-enums.ts`.
- **X.1 gate remains green:** `pnpm test:audit:x1-catalog-parity` (X.2 must not regress X.1).
- **Existing M5-D8 meta-test remains green:** `pnpm test tests/messages/no-inline-error-strings.test.ts`.
- **Type + lint + full test gate (final):** `pnpm typecheck && pnpm lint && pnpm test` exits 0; no new warnings.
- **CI workflow check:** `.github/workflows/x-audits.yml` exposes a job named `x2-no-raw-codes` verbatim; runs on `pull_request` + `push` to `main`; uploads artifact with unique name per watchpoint 7.

## 8. Exit criteria

- [x] All sub-steps in `11-cross-cutting.md` Task X.2 (Steps 1–3) checked off.
- [x] AC-X.2 has at least one passing test asserting each named surface (AST text + AST attr-literal + AST attr-expression + Playwright textContent + Playwright getAttribute + Playwright live-DOM property).
- [x] `lib/messages/__generated__/internal-code-enums.ts` is committed; `pnpm gen:internal-code-enums && git diff --exit-code` passes; CI regenerate is byte-identical.
- [x] All 11 regression fixtures under `tests/cross-cutting/fixtures/no-raw-codes/` exist (4 controlled-component + 1 internal-enum + 1 attr-template + 1 attr-string + 1 attr-expression + 1 jsx-text + good-via-messageFor + good-via-error-explainer + good-discriminated-union + good-switch-case + good-data-testid + good-noncontrolled-input — the count may shift; the contract is "every discrimination class has a paired good+bad twin").
- [x] AST audit's discrimination layer correctly handles the M10 R3 F1 false-positive list (catalog routers, discriminated-union types, switch cases, catalog-enum arrays, comments, `data-testid`). Negative-regression verification per memory `feedback_negative_regression_verification.md`: temporarily remove the discrimination rule and confirm the audit fires on a known-good site (e.g., `<ErrorExplainer code="LINK_REVOKED_FLOOR" />`); restore the rule and confirm the audit goes green.
- [x] Playwright crawl catches the four controlled-component fixtures (textarea / select / input / contenteditable) AND passes on `good-noncontrolled-input.tsx`.
- [x] M10's advisory raw-code grep gate is retired in the same commit range that ships the X.2 AST audit. Search `handoffs/M10-onboarding.md` for "advisory" + scan for any `tests/messages/_metaNoRawCodesInUI.test.ts` placeholder reference; remove or update.
- [x] CI exposes `x2-no-raw-codes` verbatim. Spot-check `.github/workflows/x-audits.yml`. Artifact name is unique per watchpoint 7; X.2 codifies the pattern X.3–X.5 will follow.
- [x] X.1 residuals (artifact-name collision + FIRST_SEEN_REVIEW allowlist registry) dispositioned per §11 below.
- [x] `pnpm typecheck && pnpm lint && pnpm test` exits 0 with no new warnings (the four pre-existing lint warnings carry forward).
- [x] No new `// TODO` or `// FIXME` lines.
- [x] Adversarial review converged to APPROVE on R1 (Opus reviewer at `a5bd9b7`, base `271bb22`). Codex's first delivery passed cross-model review on the first round — no fix cycles required. Discrimination correctness verified by hand-walk of the AST scoping for catalog routers, wrapper components, switch cases, discriminated-union types, data-testid attributes, and catalog-enum arrays. See Convergence log §"Adversarial review".
- [x] All commits follow `<type>(<scope>): <summary>` format with one logical task per commit.
- [x] Convergence log at the bottom of this file is filled in.

## 9. Sandbox / git protocol

- [x] **Codex CLI with relaxed sandbox** — verified working through X.1. Commits run in-session.
- **Invocation discipline (memory `feedback_codex_exec_needs_stdin_closed.md`):** every `codex exec` invocation must close stdin (`< /dev/null`); monitor worker CPU% — 0.0% for 2+ minutes signals a stdin hang.

## 10. Adversarial review handoff

1. Implementer (Codex) summarizes deliverables, AC sub-criteria satisfied, and any spec ↔ rendered-UI drift findings the audit surfaced (with fix-commit SHAs).
2. Adversarial reviewer (Opus / Claude Code) invoked via the canonical `/codex:adversarial-review` slash command per memory `feedback_adversarial_review_canonical_invocation.md`. Suggested invocation:
   ```
   /codex:adversarial-review --background --base 2090dc2 "X.2 no-raw-codes audit (single-implementer Codex backend) — see handoff §6 watchpoints + §8 exit criteria. Focus on discrimination correctness (M10 R3 F1 false-positive class) and internal-enum manifest provenance."
   ```
3. Reviewer iterates with implementer until convergence (memory `feedback_iterate_until_convergence.md` — keep iterating until APPROVE; round-3 cap is for finding-disagreement loops, NOT for halting when each round surfaces NEW bugs).
4. Per-round routing: X.2 is single-implementer Codex; almost every finding is Codex's. Exceptions surface to orchestrator: spec amendments (none expected), M10 advisory-grep retirement coordination (already in scope per §8).
5. Class-sweep before patching (memory `feedback_class_sweep_before_patch.md`): when review surfaces a single missed render site, grep all sibling files for the same shape before patching only the named site.
6. Convergence is logged at the bottom of this file.

## 11. Cross-milestone dependencies

- **X.2 retires M10's advisory raw-code grep.** Per `handoffs/M10-onboarding.md:766` (R3 F1 resolution), M10 documented: "Structural replacement (`tests/messages/_metaNoRawCodesInUI.test.ts` AST walk) scoped to M11 — when shipped, the advisory grep retires." X.2 IS that structural replacement (the M10 path-name placeholder is approximate; X.2's actual path is `tests/cross-cutting/no-raw-codes.test.ts`). The advisory grep retirement lands in the X.2 commit range as a final cleanup commit (see §5 commit example).
- **X.1's manifest is the input.** X.2 imports `SPEC_CODES` + `RETIRED_CODES` from `lib/messages/__generated__/spec-codes.ts` (X.1-shipped). X.1 R3 closed APPROVED at `c0d8d04`. X.2 does not re-process §12.4.
- **M11 Phase A runs in parallel.** M11 Phase A is all-Opus UI work (the `/help` MDX components per `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-12-user-facing-docs/00-overview.md`). X.2 is all-Codex backend audit. Different surfaces (M11 touches `app/help/**`, `components/help/**`; X.2 touches `scripts/`, `tests/`, `.github/workflows/`). Coordinate ONLY if Phase A's MDX components emit any user-visible code-shaped string at render time — unlikely, since the components consume `messageFor` at render sites. If Phase A's `<HelpAffordance>` or similar wrapper component lands during X.2's review cycle, X.2's discrimination rules MUST add the new wrapper to the catalog-router function-name allowlist; coordinate at handoff time.
- **X.1 residuals dispositioned in X.2 scope:**
  1. **Artifact-name collision pattern.** X.1's workflow uses artifact name `x1-catalog-parity`. X.2 must use a unique name. **Disposition: land in X.2 scope.** X.2 codifies the canonical pattern (suggested: `<job-name>-artifacts-${{ github.run_attempt }}` or `<job-name>-${{ github.run_id }}-${{ github.job }}`); X.2 ALSO renames X.1's artifact at the same time so the pattern is consistent before the X.* gate goes PR-required. Single workflow commit: `ci(audits): standardize X.* artifact naming pattern (X.1 R3 residual)`.
  2. **FIRST_SEEN_REVIEW allowlist registry migration trigger.** X.1's allowlist is one entry at `tests/cross-cutting/codes.test.ts:13-18`. X.1 R3 said "migrate to a co-located registry when count > 3." X.2 will introduce its own allowlist for non-rendered code references (if any survive the discrimination layer). **Disposition: defer the migration until trigger fires.** If X.2's combined allowlist count (X.1's `FIRST_SEEN_REVIEW` + any X.2 entries) exceeds 3, X.2 migrates both to `lib/messages/__internal__/displayAllowlist.ts` in the same commit range. If the combined count stays ≤ 3, leave the migration for X.3 or whichever X.* task triggers the threshold. The trigger condition is reproducible (count > 3); X.2 does not need to migrate preemptively.
- **X.3+ are independent of X.2.** X.3 (auth-chain trust-domain audit) covers a different surface. X.4 (no global cursor) covers a different surface. X.5 (RLS coverage) + X.6 (traceability matrix) different surfaces. X.2 does not block any of them; the X.* gate is enforced once X.6's `verify-branch-protection-status` ships.

## 12. Impeccable evaluation (UI quality gate — AGENTS.md §1 invariant 8)

**N/A — no UI surface.** X.2 ships scripts, generated TypeScript manifests, Vitest meta-tests, Playwright e2e specs, and a CI workflow extension. No file under `app/` (outside `app/api/**`), `components/`, `app/globals.css`, `DESIGN.md`, `tailwind.config.*`. The dual `/impeccable critique` + `/impeccable audit` gate does not apply.

## 13. Meta-test inventory (AGENTS.md writing-plans rule)

Declared at handoff time per memory `feedback_meta_test_at_plan_time_not_round_n.md`.

- [ ] **Supabase call-boundary discipline** — **N/A.** X.2's own code makes no Supabase calls. If the audit surfaces a render site whose owning module also has a §1.9 violation, route to the owning milestone.
- [ ] **Sentinel hiding in optional text** — **N/A.** X.2 doesn't render.
- [ ] **`admin_alerts` catalog completeness** — **N/A.** X.2 audits rendering, not catalog producer registry.
- [ ] **Advisory-lock topology** — **N/A.**
- [ ] **No-inline-email-normalization** — **N/A.**
- [x] **CREATE: no-raw-codes AST audit** (`tests/cross-cutting/no-raw-codes.test.ts`) — ts-morph JSXText + JSXAttribute walker with the catalog-router function-name allowlist + discriminated-union/switch-case/data-testid discrimination rules. Concrete failure mode: a `<span>{rawCode}</span>` mutation where `rawCode` resolves to a `SPEC_CODES`/`RETIRED_CODES`/`INTERNAL_CODE_ENUMS` member is detected at static-analysis time; a `<ErrorExplainer code="LINK_REVOKED_FLOOR" />` is NOT flagged (legitimate routing).
- [x] **CREATE: no-raw-codes Playwright crawl** (`tests/e2e/no-raw-codes.spec.ts`) — runtime DOM-property crawl with the 1a textContent + 1b user-visible attributes + 1c live-DOM-property phases. Concrete failure mode: a controlled `<textarea value={rawCode}>` where the rendered HTML `value` attribute is never written; only `inputElement.value` catches it.
- [x] **CREATE: regression fixtures** (`tests/cross-cutting/fixtures/no-raw-codes/`) — 11 paired-twin fixtures per §2 above.
- [x] **CREATE: internal-code-enums extractor** (`scripts/extract-internal-code-enums.ts`) + **CREATE: manifest** (`lib/messages/__generated__/internal-code-enums.ts`) — committed; regenerated by CI; consumed by both the AST audit and the Playwright crawl.
- [x] **EXTEND (or coordinate-with): tests/messages/no-inline-error-strings.test.ts** — the existing M5-D8 meta-test catches inline English copy (`setError("Something failed")`). X.2 catches inline code-shape (`setError("LINK_REVOKED_FLOOR")`). They MUST stay orthogonal — X.2 does NOT subsume or duplicate it. Verified green during X.2 implementation.

---

## Convergence log

### Implementation ready for adversarial review

- **2026-05-19, Codex implementation.** Added `scripts/extract-internal-code-enums.ts`, committed `lib/messages/__generated__/internal-code-enums.ts`, and extended the shared `walkSourceFiles` helper with extension filtering so X.2 did not introduce a third walker.
- **AST audit:** `tests/cross-cutting/no-raw-codes.test.ts` + `tests/cross-cutting/no-raw-codes-audit.ts` walk `app/**/*.tsx` (excluding `app/api/**`) and `components/**/*.tsx` using ts-morph. Concrete failure modes pinned by fixtures: raw JSX text, raw visible/non-router JSX attributes, expression attributes, template-literal attributes, and internal-code provenance in diagnostics. Good fixtures pin `messageFor`, `<ErrorExplainer code>`, `<HelpAffordance code>`, type/switch/code-array/control-flow comparisons, `data-testid`, and non-code inputs as non-rendered/non-user surfaces.
- **Runtime crawl:** `tests/e2e/no-raw-codes.spec.ts` discovers runtime fixtures by directory walk and static app routes by `app/**/page.tsx` shape. It scans textContent, user-visible attributes, live DOM properties for input/textarea/select/contenteditable, and shadow DOM descendants. Negative regression: replacing `input.value` with an empty string caused `bad-controlled-input.html` to fail because only textContent leaks remained; restoring `input.value` returned the crawl to green.
- **Negative-regression discrimination checks:** temporarily disabling `messageFor` discrimination failed `good-via-messageFor.tsx` and real `messageFor(... ?? "CODE")` call sites; disabling wrapper-component discrimination failed `good-via-error-explainer.tsx`; disabling `data-testid` discrimination failed `good-data-testid.tsx`; disabling comparison-literal discrimination failed the `result?.kind === "ok"` admin-settings control-flow site. Each rule was restored and `pnpm test tests/cross-cutting/no-raw-codes.test.ts` returned green.
- **M10 advisory grep retired:** M10 handoff §5/§7 now names X.2's structural AST + DOM-property gates instead of the advisory prefix grep. No production rendered-raw-code findings were surfaced by the audit, so no UI fixes or deferrals were required.
- **X.1 residuals:** X.1 and X.2 artifacts now use the canonical unique pattern `<job-name>-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.job }}`. X.2 introduced no literal allowlist entries; combined FIRST_SEEN_REVIEW/X.2 allowlist count remains 1, so the shared display allowlist migration trigger did not fire.
- **Verification at implementation close:** `pnpm test:audit:x1-catalog-parity && pnpm gen:internal-code-enums && git diff --exit-code lib/messages/__generated__/internal-code-enums.ts && pnpm test:audit:x2-no-raw-codes && pnpm gen:spec-codes && git diff --exit-code lib/messages/__generated__/spec-codes.ts && pnpm test && pnpm lint && pnpm typecheck` exited 0. Totals: X.1 audit 42/42, X.2 audit 17/17, full Vitest 3421 passed / 5 skipped, lint 0 errors / 4 pre-existing warnings, typecheck clean. `pnpm verify:spec-amendment` exited 0. `.github/workflows/x-audits.yml` parsed with Ruby YAML.

### Adversarial review

- **R1 (2026-05-19, Opus reviewer at `a5bd9b7`, base `271bb22`): APPROVE on first round.** Reviewer walked the AST discrimination logic by hand for multiple fixture pairs and confirmed: (1) catalog-router first-arg literals (`messageFor`, `getDougFacing`, `getCrewFacing`, `lookupHelpfulContext`, `setError`) correctly excluded via JsxAttribute-ancestor scoping; (2) wrapper-component-code-attr (`<ErrorExplainer code=>`, `<HelpAffordance code=>`) correctly excluded; (3) switch-case + discriminated-union + binary-equality literals correctly never visited because `auditJsxExpression` only walks descendants of `JsxExpression` nodes, not function-body `SwitchStatement`/`BinaryExpression` siblings; (4) `data-testid` not in `USER_VISIBLE_ATTRS`; (5) catalog-enum arrays in module scope never reached; (6) forbidden-set dedup names provenance in diagnostics; (7) manifest byte-stable + sorted (mirrors X.1 R2 F6 fix shape); (8) workflow exposes `x2-no-raw-codes` verbatim AND retroactively renamed X.1's artifact to the canonical pattern `<job-name>-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.job }}` — X.1 R3 residual #1 fully closed; (9) Playwright crawl exercises `input.value` / `textarea.value` / `select.selectedOptions[0].value` / `contenteditable.textContent` / shadow-DOM walk; (10) route discovery code-shape-based via `app/**/page.tsx` glob with proper excludes (`app/api/`, `app/admin/dev/`, dynamic `[...]` segments); (11) negative-regression verifications match memory `feedback_negative_regression_verification.md` protocol shape. Strongest residual concern (non-blocking, flagged for X.3+ watchpoints): substring matching on long internal-enum tokens (`parse_error`, `drive_error`, `sheet_unavailable`, `pending_review`) could false-positive on future JSX-position literals like `'parse_error_recovery'`. Zero current production false positives; AST-scoping rule contains blast radius; audit failure mode is loud + named (operator can rename the surrounding value). Worth flagging if a future long internal token gets introduced near a JSX render path.

**Converged at R1 on 2026-05-19** with verdict APPROVE. CI status check `x2-no-raw-codes` exposed verbatim per spec §17.2. M10 advisory raw-code grep retired; structural replacement is live. X.1 R3 residual #1 (artifact-name collision pattern) fully closed via the canonical X.* artifact naming convention. X.1 R3 residual #2 (FIRST_SEEN_REVIEW allowlist registry migration trigger) did not fire — combined count remains 1; defer until count > 3 trigger fires.
