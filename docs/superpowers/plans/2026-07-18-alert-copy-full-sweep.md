# Alert Copy Full Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give all 45 admin alert codes concise inline-context copy, replace the bell longform chevron with a show-page nav link, and migrate longform content to /help/errors.

**Architecture:** Copy + params are catalog/`deriveAlertMessageParams` work (spec §3, §6 table is the binding copy source); rendering changes are confined to BellPanel (chevron rework) and PerShowAlertSection (help-block deletion); help-page migration fills `longExplanation`/`helpHref` and relaxes `isRenderable`. Structural meta-tests invert the helpfulContext contract for admin codes and pin template↔param coverage.

**Tech Stack:** Next.js 16, vitest, existing catalog/lookup/identity plumbing.

**Spec:** `docs/superpowers/specs/2026-07-18-alert-copy-full-sweep-design.md` (committed in this worktree). Its **§6 per-code table is the SINGLE SOURCE OF TRUTH for every new dougFacing, longExplanation, title, inline_member flag, and param**. Task briefs below cite §6 batches instead of duplicating 45 rows; implementers MUST read the spec section named in their task and use those values verbatim.

## Global Constraints

- §12.4 three-way lockstep per copy commit: master spec prose (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`) + `pnpm gen:spec-codes` regen (`lib/messages/__generated__/spec-codes.ts`) + `lib/messages/catalog.ts`, same commit. Gate: `pnpm test:audit:x1-catalog-parity`.
- NEVER run prettier on the master spec. Edit only the exact cells/lines named.
- Straight single quotes U+0027 in all copy; bare `<token>` placeholders (wrapper-check allowlist imports INLINE_IDENTITY_CODES).
- Invariant 5: no raw codes/unresolved placeholders reach UI in any branch.
- The 13 PR-469-condensed dougFacing strings are kept VERBATIM (spec §6 marks them); those rows change only helpfulContext/longExplanation/helpHref (+title where §6 says).
- Verify at every task: `npx tsc --noEmit` 0 errors; prettier --write touched files BEFORE committing (commits use `--no-verify`).
- Conventional commits (`feat(messages):`, `test(adminAlerts):`, `fix(admin):`, `docs:`).

---

### Task 1: deriveAlertMessageParams — identity-segment mapping + new fallback params

**Files:**
- Modify: `lib/adminAlerts/deriveMessageParams.ts` (mapping at :31-39 and :134-165)
- Test: `tests/adminAlerts/deriveMessageParams.test.ts` (extend)

**Interfaces:**
- Consumes: `AlertIdentity` (`lib/adminAlerts/identityTypes.ts:60` — `{segments: {label: string|null; value: string; pii?: boolean}[]; global: boolean}`).
- Produces: `deriveAlertMessageParams(code, context, identity)` additionally resolves params `crew-name`, `email`, `crew-row-count`, `failed-sheet-names`, `crew-count`, `show-date` with priority identity > context > fallback. Fallbacks (spec §3): crew-name "a crew member", email "an email address", crew-row-count "two or more crew rows", failed-sheet-names "some sheets", crew-count "some", show-date "an upcoming date".

- [ ] **Step 1: Write failing tests** — extend the existing priority-chain describe block with, for EACH new param: (a) identity-supplied wins (build an identity whose segment carries the value: label "Crew" → crew-name; a label-less segment whose value looks like an email (`value.includes("@")`) → email; the Sheet-labeled contextField segment for ONBOARDING_SHEET_UNREADABLE (`alertIdentityMap.ts:138-139`) → failed-sheet-names); (b) context key wins when identity lacks the segment (`crew_name`, `email`, `crew_row_count`, `failed_sheet_names`, `crew_count`, `show_date` — underscore keys, hyphen-normalized by interpolate); (c) both absent → the exact fallback phrase above. Derive expected values from the fixtures, never hardcode duplicates of production strings except the fallback phrases themselves.

```ts
// shape example (repeat per param):
it("crew-name: identity Crew segment wins over conflicting context", () => {
  const identity = { global: false, segments: [{ label: "Crew", value: "Doug Larson" }] };
  const p = deriveAlertMessageParams("OAUTH_IDENTITY_CLAIMED", { crew_name: "Wrong Name" }, identity);
  expect(p["crew-name"]).toBe("'Doug Larson'");
});
it("crew-name: context wins when identity null", () => {
  expect(deriveAlertMessageParams("OAUTH_IDENTITY_CLAIMED", { crew_name: "Ann" }, null)["crew-name"]).toBe("Ann");
});
it("crew-name: fallback when both absent", () => {
  expect(deriveAlertMessageParams("OAUTH_IDENTITY_CLAIMED", null, null)["crew-name"]).toBe("a crew member");
});
```

- [ ] **Step 2:** `npx vitest run tests/adminAlerts/deriveMessageParams.test.ts` → new tests FAIL.
- [ ] **Step 3: Implement** — resolved identity segments arrive LABEL-LOSSY (`resolveAlertIdentities.ts:295-298` emits `{label: null, value}` for count/email segments), so label-based mapping cannot work for them. Instead import `ALERT_IDENTITY_MAP` from `lib/adminAlerts/alertIdentityMap.ts` and map POSITIONALLY: for the given code, walk its declared `SegmentSpec[]` alongside `identity.segments` (same order — verify by reading `resolveAlertIdentities`' segment construction before coding; if order isn't guaranteed, match by spec kind + label where present and by shape (`value.includes("@")`) as tiebreaker) and derive the param name from the spec kind: `sheetName`→`sheet-name`, `showName`→`show-name`, `crewName`→`crew-name`, `email`→`email`, `count`→its per-code param (`crew-row-count` for AMBIGUOUS_EMAIL_BINDING), `contextField`→its per-code param (`failed-sheet-names` for ONBOARDING_SHEET_UNREADABLE). Reuse `resolveNamedParam` (identity-quoted > context > fallback) for every mapped param; counts render unquoted (numeric phrase, not a name — quote only name-like kinds sheetName/showName/crewName). `crew-count`/`show-date` (SHOW_FIRST_PUBLISHED) have no identity segments — plain `context ?? fallback`. Respect pii: when a segment is `pii: true`, emit the fallback phrase, never the raw value (grep existing pii handling in `resolveAlertIdentities` first and mirror it).
- [ ] **Step 4:** targeted run PASS + `npx vitest run tests/adminAlerts/` all green.
- [ ] **Step 5:** `git add -A && git commit --no-verify -m "feat(admin): identity-segment param mapping — crew/email/count/sheet-list params with always-resolving fallbacks"`

### Task 2: Catalog copy batch A (§6.a — 13 codes) + §12.4 lockstep

**Files:**
- Modify: `lib/messages/catalog.ts` (the 13 batch-A code entries), `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 dougFacing cells + helpfulContext appendix lines within the yaml fence at ~:3107), `lib/messages/__generated__/spec-codes.ts` (regen)
- Test: `tests/messages/fullSweepCopy.test.ts` (create)

**Interfaces:**
- Consumes: spec §6.a rows (READ THE SPEC — values verbatim).
- Produces: 13 catalog entries with new dougFacing (except ROLE_FLAGS_NOTICE + WIZARD_SESSION_SUPERSEDED_RACE kept verbatim), `helpfulContext: null`, filled `longExplanation` + `helpHref: "/help/errors#<CODE>"`, titles per §6.a.

- [ ] **Step 1: Failing test** — create `tests/messages/fullSweepCopy.test.ts` with a data-driven block: for each batch-A code, assert `helpfulContext === null`, `longExplanation` non-null, `helpHref === "/help/errors#<CODE>"`, `title` non-null, and dougFacing `toContain` one distinctive §6.a substring (e.g. its identity token or lead phrase — pick from the spec rows; do NOT duplicate full strings, x1 parity pins those).
- [ ] **Step 2:** run → FAIL (helpfulContext currently non-null).
- [ ] **Step 3: Apply §6.a to catalog.ts** — for each code: swap dougFacing (where §6.a changes it), null helpfulContext, add longExplanation + helpHref + title per row. Then edit the master spec: replace each code's §12.4 dougFacing cell with the same string; DELETE each code's helpfulContext appendix line inside the yaml fence. Run `pnpm gen:spec-codes`; commit regenerated spec-codes.ts in the SAME commit. NOTE: `scripts/extract-spec-codes.ts:85` still has the single-code exemption — if the generator fails on the newly-nulled codes, add the batch codes to `INLINE_CONTEXT_CODES_WITHOUT_HELPFUL_CONTEXT` as an interim measure (Task 6 replaces the set with the structural rule; leave a `// interim — replaced in Task 6` comment).
- [ ] **Step 4:** `npx vitest run tests/messages/fullSweepCopy.test.ts && pnpm test:audit:x1-catalog-parity` → PASS. Expect interim reds ONLY in: catalog.test.ts helpfulContext-coverage (exemption list not yet inverted — Task 6), `_metaAdminAlertCatalog` placeholder guard for newly-templated codes (Task 5 registers), `_metaErrorCatalogDocs` title rule (Task 6), and `_metaInlineIdentityContract` (newly tokenized segment-bearing rows not yet in the registry — Task 5 closes). Record exact counts in report.
- [ ] **Step 5:** `git commit --no-verify -m "feat(messages): full-sweep copy batch A — picker/auth/onboarding inline-context copy + help-page migration"`

### Task 3: Catalog copy batch B (§6.b — 15 codes) + §12.4 lockstep

**Files:** Modify `lib/messages/catalog.ts` (15 batch-B entries), master spec §12.4 (dougFacing cells + appendix line deletions for the 15), `lib/messages/__generated__/spec-codes.ts` (regen). Test: extend `tests/messages/fullSweepCopy.test.ts` (batch-B block).

- [ ] **Step 1: Failing test** — add the batch-B data-driven block to `tests/messages/fullSweepCopy.test.ts` (same assertions as Task 2 Step 1: helpfulContext null, longExplanation non-null, helpHref `/help/errors#<CODE>`, title non-null, one distinctive §6.b dougFacing substring per code).
- [ ] **Step 2:** `npx vitest run tests/messages/fullSweepCopy.test.ts` → batch-B block FAILS.
- [ ] **Step 3:** Apply spec §6.b rows verbatim to catalog.ts (dougFacing swaps, helpfulContext null, longExplanation/helpHref/title adds); edit master spec §12.4 cells + delete the 15 appendix helpfulContext lines; `pnpm gen:spec-codes`; add batch codes to the interim generator set if it trips (Task 6 replaces it).
- [ ] **Step 4:** `npx vitest run tests/messages/fullSweepCopy.test.ts && pnpm test:audit:x1-catalog-parity` → PASS; record interim-red counts (same four known suites as Task 2).
- [ ] **Step 5:** `git add -A && git commit --no-verify -m "feat(messages): full-sweep copy batch B — sync/drive/assets/reel inline-context copy + help-page migration"`

### Task 4: Catalog copy batch C (§6.c — 17 codes) + §12.4 lockstep

**Files:** Modify `lib/messages/catalog.ts` (17 batch-C entries), master spec §12.4 (cells + appendix deletions for the 17), `lib/messages/__generated__/spec-codes.ts` (regen). Test: extend `tests/messages/fullSweepCopy.test.ts` (batch-C block).

- [ ] **Step 1: Failing test** — batch-C block, same assertions; additionally assert `messageFor("SHOW_FIRST_PUBLISHED").title === "Show published"`.
- [ ] **Step 2:** run → batch-C block FAILS.
- [ ] **Step 3:** Apply §6.c rows verbatim. The 11 verbatim-keep rows (EMAIL_DELIVERY_FAILED, PENDING_SNAPSHOT_PROMOTE_STUCK, PENDING_SNAPSHOT_ROLLBACK_STUCK, REPORT_ORPHANED_LOST_LEASE, REPORT_LOOKUP_INCONCLUSIVE, REPORT_DUPLICATE_LIVE_MATCHES, REPORT_OPEN_ORPHAN_LABEL, REPORT_LEASE_THRASHING, STALE_ORPHAN_REPORT, BRANCH_PROTECTION_DRIFT, BRANCH_PROTECTION_MONITOR_AUTH_FAILED) keep dougFacing byte-identical — change only helpfulContext/longExplanation/helpHref (+SHOW_FIRST_PUBLISHED title). §12.4 lockstep + gen:spec-codes as in Task 2/3.
- [ ] **Step 4:** targeted + x1 parity PASS; record interim reds.
- [ ] **Step 5:** `git add -A && git commit --no-verify -m "feat(messages): full-sweep copy batch C — show/email/report/tile/branch inline-context copy + help-page migration"`

### Task 5: Registries — INLINE_IDENTITY_CODES 30 + INTERPOLATED registration + stale header fix

**Files:**
- Modify: `lib/adminAlerts/alertIdentityMap.ts` (`INLINE_IDENTITY_CODES` :293-307 grows to the 30 §6 `inline_member: yes` codes; fix the stale ":53-54 header comment (claims 47 codes / 18 global; actual 45 / 15)")
- Modify: `tests/messages/_metaAdminAlertCatalog.test.ts` (INTERPOLATED_DOUG_FACING_CODES ~:584 — replace the hand-list's inline-code rows with a spread of `INLINE_IDENTITY_CODES` + keep the pre-existing non-inline legacy rows; keep the per-row comment discipline with one block comment citing read-time derivation)
- Test: `tests/adminAlerts/_metaInlineIdentityContract.test.ts` — its identity-token inventory at :14 recognizes only `<sheet-name>`, `<show-name>`, `<repo>`, `<file-name>`, `<role-changes>`; EXTEND it with the sweep's new identity tokens (`<crew-name>`, `<email>`, `<crew-row-count>`, `<failed-sheet-names>`) or, better, derive the inventory from the Task 1 mapping table export so the two can't drift; update the pinned set size to 30.

- [ ] Steps: failing-test-first on the bidirectional meta-test (it should FAIL after Tasks 2-4 because templates now carry tokens for codes missing from the registry — run it, confirm the exact missing-code list matches §6's inline_member rows, then grow the registry), INTERPOLATED spread, header-comment fix, `npx vitest run tests/adminAlerts/ tests/messages/_metaAdminAlertCatalog.test.ts` (placeholder-guard reds close here), commit `feat(admin): grow INLINE_IDENTITY_CODES to 30 full-sweep codes; register interpolated producers`.

### Task 6: Contract inversions + coverage meta-test

**Files:**
- Modify: `tests/messages/catalog.test.ts` (:223-246): replace the helpfulContext×dougFacing coverage pair + exemption list with: every `ADMIN_ALERTS_CODES` member (import from `tests/messages/adminAlertsRegistry.ts`) MUST have `helpfulContext: null` AND non-null `title`; non-admin codes keep the old both-non-null / both-null rules.
- Modify: `tests/messages/_metaErrorCatalogDocs.test.ts`: delete `NON_PREDICATE_TITLE_EXEMPT_ROWS`; all 45 admin codes are now predicate entries (title+longExplanation+helpHref non-null) — adjust the classification so the §5.2 loop passes.
- Modify: `lib/messages/catalogDocsValidator.ts:5-7` — the SHARED renderable/predicate helper still excludes `severity === "info"`; drop that clause here (this is the single source both `_metaErrorCatalogDocs` and `app/help/errors/page.tsx` consume — Task 9 then needs no separate isRenderable edit if the page imports this helper; verify with grep and update Task 9 accordingly in your report).
- Modify: `scripts/extract-spec-codes.ts:85`: replace `INLINE_CONTEXT_CODES_WITHOUT_HELPFUL_CONTEXT` hand-set with a structural rule — read `tests/messages/adminAlertsRegistry.ts` (fs read + regex, matching how the script already parses spec files) and exempt every admin alert code from the appendix-helpfulContext requirement; remove interim Task-2-4 set entries.
- Create: `tests/adminAlerts/_metaAdminTemplateCoverage.test.ts`: walk ALL `ADMIN_ALERTS_CODES` × dougFacing templates; assert `deriveAlertMessageParams(code, null, null)` fully resolves every `<token>` (same interpolate path as `_metaHealthTemplateCoverage`; keep that test or fold it in — if folded, delete the old file in the same commit).

- [ ] Steps: TDD each contract (run → observe current failure mode → implement → green), then `pnpm gen:spec-codes` still green, `npx vitest run tests/messages/ tests/adminAlerts/` FULLY green (all interim reds from Tasks 2-5 closed), commit `test(messages): invert helpfulContext contract for admin codes; all-admin template coverage meta-test`.

### Task 7: BellPanel chevron rework + pinned test rewrites

**Files:**
- Modify: `components/admin/BellPanel.tsx` (caret :412-420, expansion/context box :431-441, `rowHelpfulContext` :117-121, row structure :382-428)
- Modify: `lib/adminAlerts/alertActions.ts` (:151-160 — delete the ROLE_FLAGS_NOTICE special case in `resolveAlertActions`; function now returns `single ? [single] : []` for every code)
- Tests: `tests/components/bellPanelRedesign.test.tsx` (:220-291 caret/orphan blocks), `tests/components/bellPanelDeferrals.test.tsx` (:125-165), `tests/components/bellPanelActions.test.tsx` (:279-304), `tests/e2e/bell-panel-layout.spec.ts` (:97-107, :344-346), `tests/adminAlerts/alertActions.test.ts` (ROLE_FLAGS_NOTICE list rows)

**Contract (spec §4.1):**
- Chevron renders iff `entry.slug !== null`: `<a data-testid={`bell-caret-${alertId}`} href={`/admin/show/${encodeURIComponent(entry.slug)}`} aria-label="Open show page">` with the existing ChevronRight glyph, positioned top-right as a SIBLING of the full-row toggle `<button>` (NEVER nested inside it — nested-interactive a11y). Follow the ActionCell link styling vocabulary (`LINK_CTA`, min-h-tap-min, focus ring).
- Expansion state, context box (`bell-context-*`), `rowHelpfulContext` helper: deleted. Full-row toggle keeps mark-read only.
- Chip suppression logic unchanged (registry grew in Task 5).
- Health rows on the DEVELOPER bell render the same chevron rule (slug null for most health rows → no chevron) — add one developer-bell health-row test.

- [ ] Steps: rewrite failing tests first (caret = link iff slug, href/aria-label exact, no `bell-context-*` in DOM ever, caret absent when slug null, ROLE_FLAGS_NOTICE actions = sheet link only, mark-read toggle unaffected by caret click — use fireEvent on each separately), run → FAIL, implement, run all four bell test files + `npx vitest run tests/components/ tests/adminAlerts/`, e2e spec rewrite (chevron nav assertions; run if the harness is available locally, else mark for CI), commit `feat(admin): bell chevron is show-page nav; longform expansion removed`.

### Task 8: PerShowAlertSection help-block deletion

**Files:** Modify `components/admin/PerShowAlertSection.tsx` (:348-356 always-visible help block + its data plumbing); Test `tests/components/PerShowAlertSection.test.tsx` + `tests/components/admin/perShowAlert*.test.tsx` (grep all four for `per-show-alert-help`).

- [ ] Steps: failing tests (no `per-show-alert-help-*` testid ever renders; card body ends with actions row), implement deletion, full `npx vitest run tests/components/`, commit `feat(admin): per-show alert cards drop always-visible help block (content moved to /help/errors)`.

### Task 9: Help page — isRenderable + families

**Files:** Modify `app/help/errors/page.tsx` (:23-31 drop `severity !== "info"` clause), `app/help/errors/_families.ts` (add prefixes so all 45 codes classify out of "Other" — run the grouping test to enumerate gaps); Tests: `tests/help/errors-grouping.test.tsx` (+ its family fixtures), extend `tests/messages/fullSweepCopy.test.ts` with an all-45 renderable assertion (`isRenderable`-shape check: title/longExplanation/helpHref non-null).

- [ ] Steps: failing test (all 45 renderable + zero of the 45 in "Other" family), implement, `npx vitest run tests/help/ tests/messages/fullSweepCopy.test.ts`, ALSO `pnpm gen:internal-code-enums` + commit regenerated manifest if changed (x2 gate), commit `feat(help): all admin alert codes renderable on /help/errors with family grouping`.

### Task 10: Full gates + impeccable dual-gate + ship

- [ ] `VITEST_EXCLUDE_ENV_BOUND=1 npx vitest run` (full suite green — structural source-scanning meta-tests walk lib/adminAlerts; fix per each test's error instruction, never by weakening)
- [ ] `pnpm typecheck`; `git diff --name-only origin/main...HEAD | grep -E '\.tsx?$' | xargs pnpm exec eslint`; `pnpm format:check`
- [ ] Impeccable v3 dual-gate (`/impeccable critique` + `/impeccable audit` on the BellPanel/PerShowAlertSection/help-page diff, canonical setup gates; P0/P1 fixed or DEFERRED.md)
- [ ] Whole-diff cross-model review (codex exec, read-only, backgrounded, `-o` verdict file, stdin closed; REVIEWER ONLY + do-not-relitigate block; on repeated silent death: documented fallback — task-review trail + dual-gate + real CI hard gate, noted in PR body)
- [ ] Push `feat/alert-copy-full-sweep`; `gh pr create` (body: summary, spec link, review trail, deferrals); CI via Monitor poll with ≥10-check guard + terminal fail count; `mergeStateStatus == CLEAN`; `gh pr merge --merge`; verify MERGED; fast-forward local main (`git merge --ff-only origin/main` FROM THE MAIN CHECKOUT, verify `rev-list --left-right --count main...origin/main` = `0 0`); `git worktree remove` from OUTSIDE the worktree; delete branch.

## Meta-test inventory (declared)

- CREATES: `tests/messages/fullSweepCopy.test.ts`, `tests/adminAlerts/_metaAdminTemplateCoverage.test.ts`.
- EXTENDS/INVERTS: `catalog.test.ts` helpfulContext coverage, `_metaErrorCatalogDocs` predicate rule, `_metaInlineIdentityContract`, `_metaAdminAlertCatalog` INTERPOLATED registry, `errors-grouping`, bell test quartet.
- N/A: advisory locks (no `pg_advisory*` surface), Supabase call-boundary registry (no new call sites — feed/panels reuse existing reads), mutation-surface observability (no new mutation surface).

## Adversarial review (cross-model)

After plan self-review: codex exec review of this plan (same fallback ladder). Then execution handoff to subagent-driven-development.
