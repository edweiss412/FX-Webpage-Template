# Plan — copy and dead-code sweep

**Spec:** `docs/superpowers/specs/2026-08-02-copy-deadcode-sweep-design.md` (canonical; this plan implements it and does not override it).
**Branch:** `chore/copy-deadcode-sweep` (worktree off `origin/main` at `c29d3eb68`).
**Preflight:** RUN, not skipped. `pnpm install` + `pnpm worktree:link-env` + `pnpm preflight` all green at Stage 0 (`preflight: env ✓ local DB ✓`). This branch touches app code and tests, so the docs-only skip does not apply.

impeccable-gate: critique=RAN audit=RAN p0=1 p1=2 dispositions=recorded

Both halves ran on this branch's diff, with the canonical v3 setup gates (context load of PRODUCT.md + DESIGN.md, then the product register reference). Findings and dispositions are in §12. The counts are the critique's; the audit returned zero P0 and zero P1. This is the RAN form, not `N/A`: the branch edits a file under `components/` and a file under `app/` outside `app/api/**`, which is the invariant-8 UI-surface definition (spec §1.1 item 1).

## Meta-test inventory

**CREATES one guard, in two files** — the layer split the repo already uses for `tests/docs/_invariant8Closeout.ts` + `tests/docs/_metaInvariant8Closeout.test.ts`:

- `tests/components/_orphanedComponents.ts` — the pure core (tree walk, production-importer predicate, `orphansOf`) plus the `ORPHAN_ALLOWLIST` ledger. Not a test file, so `PARALLEL_TEST_GLOBS` does not pick it up as one.
- `tests/components/_metaOrphanedComponents.test.ts` — the guard itself (spec §3.3), plus cases proving mutation families (a) through (e). Auto-included by `PARALLEL_TEST_GLOBS` in `vitest.projects.ts` (`tests/components/**/*.test.{ts,tsx}`), so no config-wiring task is needed. Verified against the config, not assumed.

Splitting the core out is what makes families (a) through (d) provable: each is exercised against `orphansOf` with a synthetic map, so the proof does not depend on the real tree happening to contain an instance. Family (e) needs real files on disk instead, because it asserts properties of TypeScript's own resolver.

**EXTENDS four existing registries:**

- `tests/messages/popoverContextCopy.test.ts` — one `FROZEN` row's bytes (Task 1's RED).
- `tests/messages/_metaEmphasisRenderContract.test.ts` — remove the `SAFE_PLAINTEXT_REGISTRY` row for the deleted component. Forced by that file's own stale-entry guard, which filters on `!existsSync(...)`.
- `tests/help/page-per-show-panel.test.tsx` — two new prose assertions (Task 3's RED).
- `tests/docs/_metaDeferralLedgerGraduation.test.ts` — three `{ id, provenance }` rows in `BACKLOG_GRADUATED` (Task 4).
- `tests/docs/_metaLedgerReferentialIntegrity.test.ts` — **activated, not edited.** It fails on any `BL-` id cited by a doc but defined in no ledger, so the spec naming two new ids turned it red immediately. Surfaced at spec review R2; the entries were filed in `40d73a2ef` and the guard is green. Declared here because an activated guard the plan does not name is exactly the omission that makes a red suite look like a surprise.

**Declared not applicable:** Supabase call-boundary (`tests/auth/_metaInfraContract.test.ts`) — no Supabase call is added. Advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`) — no `pg_advisory*` surface is touched, so the invariant-2 holder enumeration is vacuous. Mutation-surface observability (`tests/log/_metaMutationSurfaceObservability.test.ts`) — no route handler and no `"use server"` action is added, changed, or deleted. Admin-alert catalog completeness (`tests/messages/_metaAdminAlertCatalog.test.ts`) — no code is added or removed from the catalog; one existing row's copy changes, which that meta-test does not pin.

---

## Task 1 — `ROLE_FLAGS_NOTICE` helpfulContext (single lockstep commit)

**Failure mode the RED catches:** the catalog string, the §12.4 source of truth, the generated codes, the frozen oracle, and the hand-maintained mirror drifting apart — which is exactly what "three-way lockstep in ONE commit" exists to prevent, and which the `x1-catalog-parity` CI gate turns into a merge block for three of the five surfaces and detects on none of the other two.

### 1.1 RED

Edit the `ROLE_FLAGS_NOTICE` entry of `FROZEN` in `tests/messages/popoverContextCopy.test.ts` to the NEW string (spec §2.1 "After"). Run:

```
pnpm vitest run tests/messages/popoverContextCopy.test.ts
```

Expected: FAIL, because the catalog still holds the old bytes. Record the failure output. Do not proceed until it is red for that reason and not another.

### 1.2 GREEN — all in ONE commit

Apply, in this order:

1. **Master spec §12.4 appendix.** In `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`, the `ROLE_FLAGS_NOTICE:` line inside the YAML fence under the machine-parseable §12.4 helpfulContext appendix anchor. Delete the three words ` and admin access` so the clause reads `the roles that unlock internal financials, and every change is logged.` The generator parses one line per code with no wrapping (`scripts/extract-spec-codes.ts`), so the edit must stay on one line and stay double-quoted.
2. **Regen.** `pnpm gen:spec-codes`. Confirm the only diff in `lib/messages/__generated__/spec-codes.ts` is that one string.
3. **Runtime catalog.** `lib/messages/catalog.ts`, `ROLE_FLAGS_NOTICE`: the same deletion in `helpfulContext`, AND — per spec §2.3a — delete the parenthetical `(and, for LEAD, the admin/ops surface)` from `longExplanation`, leaving "which grant access to internal financials". `longExplanation` has no §12.4 mirror (the x1 gate compares `dougFacing`, `crewFacing`, `followUp`, `helpfulContext` only), so it needs no spec-side edit — it rides this commit because it is the same false claim.
4. **Explainer mirror.** `docs/alerts/admin-alert-system-explainer.html`, the `ROLE_FLAGS_NOTICE` row: BOTH occurrences of the helpfulContext string. The `<p>` inside `<details class="cx-help">` takes it verbatim; the row's `data-text` attribute is a lowercased search index and takes the lowercased form.
5. **Companion comment** (spec §2.5). `lib/visibility/scopeTiles.ts`, the `financialsVisible` line of the module header comment: `admin OR LEAD` becomes `admin OR LEAD OR FINANCIALS`. Do NOT touch the `capabilityTransitions` predicate list; it is already filed as `BL-LEAD-CAPABILITY-PROSE-STALE`.

### 1.3 Verify

```
pnpm vitest run tests/messages/popoverContextCopy.test.ts
pnpm test:audit:x1-catalog-parity
rg -n "unlock internal financials and admin access" lib app components tests docs/alerts docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md
rg -n "admin OR LEAD" lib app components | rg -v "OR FINANCIALS"
rg -n "admin/ops surface" lib app components
```

Expected: both test commands green; all three greps return zero hits. The third is not redundant: it is the ONLY check on the `longExplanation` correction, which `x1-catalog-parity` does not compare and which the existing copy test only asserts non-null (spec review R6 finding 3). Remaining hits of the old string in the three historical `alert-popover-context` documents and in BACKLOG/plan/spec text describing this fix are ratified (spec §1.1 item 12) and are outside the paths listed above.

**Commit** (one, all five surfaces plus the comment): `fix(messages): ROLE_FLAGS_NOTICE helpfulContext no longer over-grants FINANCIALS`. Verify with `git show --stat` that all of them are in it.

### 1.4 Post-commit cleanliness

```
pnpm gen:spec-codes && git diff --exit-code lib/messages/__generated__/spec-codes.ts
```

Expected: exit 0. This check belongs AFTER the commit and nowhere else — run before it, the regenerated file is legitimately dirty in the working tree and `--exit-code` is nonzero for a correct implementation (spec review R7 finding 3). What it proves is that the committed generated file is exactly what the generator produces from the committed spec.

---

## Task 2 — delete the orphaned ParsePanel behind a class guard

**Failure mode the RED catches:** a component with no production importer sitting in the tree indefinitely, and — more importantly — the NEXT one doing the same. A test that only asserted "this specific file is gone" would prove nothing about the class; the guard is filesystem-walked so a new orphan fails by default.

### 2.1 RED — write the guard first

Create the pure core `tests/components/_orphanedComponents.ts` and the guard `tests/components/_metaOrphanedComponents.test.ts`:

- Walk `components/**` for `.ts`/`.tsx` files (filesystem walk, never a lexical list).
- A file's **production importers** are files under `app/`, `components/`, or `lib/`, excluding itself, that import it *as TypeScript parses and resolves the import*. Do not hand-roll either half — spec §3.2 records fourteen escapes over seven review rounds against successive home-made rules, the last two against a compiler scanner rather than the parser. Take module specifiers from the AST (`ts.createSourceFile`, then the `moduleSpecifier` of import/export declarations, the external-module reference of an `import =`, the literal argument of a dynamic `import()` call, and the argument of an `import()` type) and resolve each with `ts.resolveModuleName`, passing options from `ts.getParsedCommandLineOfConfigFile` and the per-site mode from `ts.getModeForUsageLocation`. Drop `isExternalLibraryImport` results and self-imports. Measured: 3427 edges, 0.8s, census 6 of 192 — identical to every earlier rule's census, so the deletion does not hinge on this choice.
- Assert: every walked file with zero production importers appears in `ORPHAN_ALLOWLIST`, each row carrying `{ file, reason, backlog }`.
- Prove mutation families (a) through (d) of spec §3.3 against synthetic inputs, so each proof stands whether or not the real tree contains an instance: (a) a new orphan with no row; (b) an allowlist row whose file no longer exists; (c) the last production importer dropping its import; (d) an allowlist row for a file that DOES have importers.
- Prove family (e), resolution fidelity, against real fixture files in a temp directory (created and cleaned up by the test), because these are properties of the compiler rather than of a synthetic map: two components sharing a basename; a same-stem .ts/.tsx pair; a file beside a same-named directory index; a substituted-extension specifier; an import that appears only in a comment; an import spelled inside a string literal; a dynamic-import call spelled as JSX text; a namespace re-export. Each asserts the guard agrees with TypeScript. They are regression tests against anyone reintroducing a home-made rule or swapping the parser for a scanner, not defects the current design can exhibit.
- Seed `ORPHAN_ALLOWLIST` with exactly the five peers from spec §3.2, each citing `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS`: `components/admin/PerShowCrewSection.tsx`, `components/admin/ResolveAlertButton.tsx`, `components/admin/RunFinalCASButton.tsx`, `components/right-now/RightNowCard.tsx`, `components/shared/WrappedTile.tsx`. **ParsePanel is NOT in the allowlist** — that is what makes this red.

Run `pnpm vitest run tests/components/_metaOrphanedComponents.test.ts`. Expected: FAIL naming the ParsePanel path. Record the output.

Typecheck the file against the repo's strict tsconfig before proceeding (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` are on): `pnpm typecheck`.

### 2.2 GREEN — the deletion

1. Delete the component file at components/admin/ParsePanel.tsx (prose path, per spec §1.1 item 10).
2. Delete tests/components/ParsePanel.test.tsx (all four of its tests target the deleted component).
3. In `tests/components/admin/parsePanelComposition.test.tsx`, delete only the ParsePanel test. Its sibling `WarningsBreakdown` test, and the file itself, stay.
4. Delete tests/components/admin/__snapshots__/parsePanelComposition.test.tsx.snap outright: measured, it holds exactly one entry, and that entry belongs to the test being removed. The entry pins `StagedReviewCard`'s surrounding chrome (article, header, empty state, action row). `tests/components/admin/stagedCardBaseline.test.tsx` does NOT cover that — it snapshots the inner `per-show-actionable-item` cards and their popovers — so this deletion would lose real coverage. Whole-diff review R4 established that; the earlier claim here that the chrome was covered elsewhere was wrong. The outer pin is therefore REHOMED to the component's own test, `tests/components/StagedReviewCard.test.tsx`, rather than dropped.
5. Remove the components/admin/ParsePanel.tsx row from `SAFE_PLAINTEXT_REGISTRY` in `tests/messages/_metaEmphasisRenderContract.test.ts`.
6. Correct the two stale header comments, both measured:
   - `components/admin/StagedReviewCard.tsx` header currently reads "Mounts inside `<ParsePanel>` on the per-show admin page (`app/admin/show/[slug]/page.tsx`)" — wrong on both counts. Its live mount is `app/admin/show/staged/[stagedId]/page.tsx`.
   - `components/admin/ChangesFeed.tsx` header currently justifies its hard-coded English empty state as "mirrors ParsePanel's empty-state rationale", a pointer into a file that will not exist. State the rationale directly instead of citing it.

Leave untouched: `app/admin/dev/page.tsx` (its own local symbol of the same name), `tests/components/admin/parse-panel-affordance.test.tsx` (imports `StagedReviewCard`; the name appears only in a `describe` string), `tests/e2e/admin-parse-panel.spec.ts` (route-level; three other files reference it).

### 2.3 Verify

```
pnpm vitest run tests/components/_metaOrphanedComponents.test.ts
pnpm vitest run tests/messages/_metaEmphasisRenderContract.test.ts tests/components/admin/parsePanelComposition.test.tsx
rg -n "ParsePanel" app components lib
pnpm typecheck
pnpm lint
```

Expected: the guard is green; the registry meta-test is green; the only `ParsePanel` hits under `app`/`components`/`lib` are the `app/admin/dev/page.tsx` local symbol; typecheck and lint clean (no dangling import). Confirm vitest reports no obsolete snapshot for `parsePanelComposition`.

**Commit:** `refactor(admin): delete orphaned ParsePanel and guard the zero-production-importer class`

---

## Task 3 — help prose: name the Share link button

**Failure mode the RED catches:** help text that describes a control the product removed, which sends Doug looking for a button that is not there. A test asserting only "the page still renders" would not catch it; these assertions key on the retired term and on the replacement.

### 3.1 RED

Add to `tests/help/page-per-show-panel.test.tsx`:

- the page source contains no `copy-link` (case-insensitive);
- the page source names the `**Share link**` button in the status-strip bullet.

Run `pnpm vitest run tests/help/page-per-show-panel.test.tsx`. Expected: FAIL on both. Record the output.

### 3.2 GREEN

In `app/help/admin/per-show-panel/page.mdx`, apply the two rewrites verbatim from spec §4.2 (line 7's status-strip inventory, line 30's Re-sync placement). Change nothing else on the page; lines 11 and 65 are already correct and are the internal consistency check on the new wording.

### 3.3 Verify

```
pnpm vitest run tests/help/
rg -in "copy-link" app/help/admin/per-show-panel/page.mdx
git status --porcelain public/help/screenshots/
```

Expected: the whole help suite green — specifically `_metaUiLabelCrosswalk` (because `**Share link**` is a real rendered label in `components/admin/showpage/ShareHub.tsx`, so no new row in `tests/help/_uiLabelExceptions.ts` is needed), the em-dash and raw-code bans in `page-per-show-panel`, `sheetChangesCopy`, and `forbidden-prose-registry`; zero `copy-link` hits; and **no change under `public/help/screenshots/`**. If a WebP appears there, stop: do not commit it and do not re-capture locally (spec §1.1 item 6 — local capture on this arm64 host would overwrite the x64-Linux baseline).

**Commit:** `fix(help): per-show panel prose names the Share link button, not the retired copy-link`

---

## Task 4 — ledger graduation

**Failure mode the RED catches:** an entry recorded as graduated that was never actually archived, or archived without the provenance that ties it to the branch that closed it — a ledger that says "done" while the open queue still carries the row. Spec review R3 caught this task ordering the archive move BEFORE the registry rows, which mutates three tracked documents with no failing test in front of them (AGENTS.md invariant 1). The order below is inverted from that draft for exactly this reason.

### 4.1 RED — the registry rows first

Append three `{ id, provenance: "chore/copy-deadcode-sweep" }` rows to `BACKLOG_GRADUATED` in `tests/docs/_metaDeferralLedgerGraduation.test.ts` — one each for `BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT`, `BL-ADMIN-PARSEPANEL-ORPHANED`, and `BL-HELP-STRIP-COPYLINK-STALE` — with a comment block above them naming the branch and what shipped, matching the existing convention.

```
pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts
```

Expected: FAIL. That file's per-id cases assert each registered id resolves to an archive section carrying its provenance string, and none of the three is archived yet. Record the failure output and confirm it names all three ids.

### 4.2 GREEN — the archive move

1. Move all three entries out of BACKLOG.md's open queue into `BACKLOG-archive.md`, each under a `## <ID> — RESOLVED (2026-08-02, chore/copy-deadcode-sweep)` heading with the original entry body preserved beneath it (the established archive shape).
2. Prepend this pass to BACKLOG.md's "Last reconciled" header line.

Not part of this task: the two new OPEN entries (`BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS`, `BL-LEAD-CAPABILITY-PROSE-STALE`) were already filed at spec time — `tests/docs/_metaLedgerReferentialIntegrity.test.ts` fails on a `BL-` id cited by a doc but defined in no ledger, so the moment the spec named them, filing was forced. Confirm both still resolve; add nothing.

### 4.3 Verify

`pnpm vitest run tests/docs/` green (graduation ledger, referential integrity, closeout markers, README indexes).

**Commit:** `docs(backlog): graduate the three entries this branch closes`

---

## Task 5 — full local gate

```
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm spec:lint docs/superpowers/specs/2026-08-02-copy-deadcode-sweep-design.md
pnpm spec:lint docs/superpowers/plans/2026-08-02-copy-deadcode-sweep.md
```

All green; both `spec:lint` runs at 0 hard. Note: before Task 2 lands, this plan lints at **4 hard**, all `CITATION_FILE_MISSING` on the two guard files this plan creates (two citations each). They self-resolve the moment Task 2 commits, and are the reason the target above is stated for Task 5 rather than for the plan's first commit. Fix-forward in the owning task's style (test first) if anything is red; do not paper over with a skip.

---

## Task 6 — the invariant-8 UI quality gate (both halves) — DONE

`/impeccable critique` and `/impeccable audit` both ran on the branch diff, each with the canonical v3 setup gates. Critique ran dual-agent (design review and detector isolated from each other until synthesis), scored **25/40**, and returned 1 P0, 2 P1, 1 P2, 1 P3; its snapshot is at `.impeccable/critique/`. Audit scored **17/20 (Good)** with 0 P0, 0 P1, 1 P2, 6 P3.

Every P0 and P1 was FIXED, not deferred, so no `DEFERRED.md` entry was needed. See §12.

The gate earned its place here, which is worth recording: this was expected to be a formality on a two-line prose fix, and it found that three MORE claims on the same page had been invalidated by the same share-hub consolidation — including one that sent Doug to the wrong half of the panel, and one that described the only route back from an archived show as a dead end. That is the chartered bug's own class, found by the gate rather than by the sweep.

---

## Task 7 — whole-diff adversarial review, CI, merge

1. Whole-diff Codex review to APPROVE. Per AGENTS.md, prefer split tight-scope reviews over one whole-diff dispatch if the diff has grown; here it is three small surfaces plus a guard, so one dispatch with the file list inlined is appropriate. Brief carries: REVIEWER ONLY, fresh-eyes posture, the do-not-relitigate list from spec §1.1, and the guard's **five** declared mutation families (a) through (e) as the closure set. The list shrank across spec reviews R6 and R7 rather than grew: replacing the home-made resolver with the compiler's parser and resolver collapsed every resolution-defect family into one regression family.
2. Push, open the PR.
3. **Real CI green** — not local-green. Expect `help-affordances` and `screenshots-drift` to fire (both path-filter on `app/**`); `screenshots-drift` re-captures and diffs `public/help/screenshots/`, and must pass with no byte change.
4. `gh pr merge --merge`.
5. Fast-forward local `main`; the run ends only when `git rev-list --left-right --count main...origin/main` reports `0  0`.

---

## 12. Close-out — invariant-8 gate findings and dispositions

**Critique** — dual-agent, 25/40, target `app/help/admin/per-show-panel/page.mdx`. Its snapshot is written under `.impeccable/`, which `.gitignore` excludes, so the table below is the tracked record rather than a pointer to one. The deterministic detector returned zero findings; browser overlays were not produced (no dev server, and booting Next.js to render a prose-only page was not justified), so static evidence stood in: 249 help tests green, all 9 links resolve, no skipped heading levels, 28 bold labels crosswalk-clean, zero em-dashes, zero raw error codes.

**Audit** — 17/20 (Good). Accessibility 3, Performance 3, Theming 4, Responsive 4, Anti-patterns 3. Verified for this diff: the ParsePanel deletion leaves no dangling import and no rendered surface (the dev page's same-named local function is unrelated); the new guard is test-only and reaches no app bundle; nothing under `public/help/screenshots/` changed.

| # | Gate | Tier | Finding | Disposition |
| - | ---- | ---- | ------- | ----------- |
| 1 | critique | P0 | "Archiving is a row in the Overview section" was false; archive moved into the share hub's Show section | **FIXED** — now names the **Share link** panel, under **Show**, matching the dashboard help page, which already documented it correctly |
| 2 | critique | P1 | The primary button has three lifecycle labels; the page named only "Share link" | **FIXED** — the sentence now names "Share link · paused" and "Show actions" |
| 3 | critique | P1 | "Archived shows show no share controls at all" described the only recovery path as a dead end | **FIXED** — now says the panel holds **Unarchive**, which lives nowhere else |
| 4 | critique | P2 | The strip inventory this branch rewrote still omitted Re-sync and the kebab | **FIXED** — inventory matches `StatusStrip` DOM order |
| 5 | audit | P2 | A bare **⋮** glyph named no control; the real one announces "More show actions" | **FIXED** — reads "The **⋮** button next to it opens the same panel", mirroring the phrasing already shipped on the dashboard help page |
| 6 | audit | P3 | Re-sync's placement was stated twice after fix 4 | **FIXED** — the inventory owns the placement; the Sync-health bullet now describes the section instead of restating it |
| 7 | audit | P3 | The rewritten bullet ran to five items plus a trailing clause | **FIXED** — split into two sentences |
| 8 | critique | P3 | Bullet order does not match section order; only 2 of 5 bullets link out | **DEFERRED** — pre-existing structure, untouched by this branch, and a reorganization rather than a correction |
| 9 | audit | P3 | One markdown `##` among four explicit `<h2 id>`; it renders with no anchor id | **DEFERRED** — pre-existing; nothing links to it, so it is inert |
| 10 | audit | P3 | `[Jump](#changes-feed)` is non-descriptive link text (WCAG 2.4.4) | **DEFERRED** — pre-existing |
| 11 | audit | P3 | The `crew-preview-links` anchor id no longer matches its heading | **DEFERRED** — pre-existing; an anchor-resolver test pins the id, so renaming it is its own change |
| 12 | audit | P3 | `force-dynamic` + an auth round-trip on every help view | **DEFERRED** — pre-existing and deliberate |

Every P0 and P1 was fixed, so no `DEFERRED.md` entry is required (that mechanism covers deferred P0/P1 only). The five deferred rows are all P3, all pre-existing, and none is touched by this diff.

**Systemic note for a future pass:** the audit found the bare `⋮` glyph used as a control name across five help pages with no consistent pairing to the real accessible names. That is one repo-wide copy pass, not five per-page edits, and it is out of scope here.

---

## 13. Note on this branch's history

The commits on this branch are a **rebuild**, and the record should say so rather than let a linear history imply a linear process.

The work happened in a different order. The invariant-8 gate ran mid-branch and surfaced four help-copy corrections; those were committed, and their assertions followed in a later commit. The same held for the resolver's per-site resolution mode, whose end-to-end pin arrived after the code. Whole-diff review R3 called that what it is: an invariant-1 violation, which AGENTS.md classifies P0 regardless of test status. Post-hoc red verification does not satisfy "never write implementation before the test."

The owner's disposition was to rewrite. The branch was rebuilt linearly off `origin/main` as **six commits — four that carry implementation, plus two docs-only** (the spec/plan pair and this history note). Each of the four carries its tests with the implementation they pin, and each was verified red-then-green **before** it was committed:

| Commit | RED | GREEN |
| ------ | --- | ----- |
| `fix(messages)` | the frozen oracle at the corrected string, against the unchanged catalog | the five lockstep surfaces |
| `refactor(admin)` | the guard, naming ParsePanel | the deletion |
| `fix(help)` | all six assertions, against the shipped page | the corrected copy |
| `docs(backlog)` | three registry rows, none archived | the archive move |

The final tree is byte-identical to the tree that was reviewed (`git diff` between them was empty before the branch pointer moved). What changed is the order of the record, not the content.

Two things this does NOT claim. The rebuild does not make the original process compliant; it makes the shipped history compliant, and this section exists so that distinction is not lost. And the four help corrections still originated from a gate rather than from a plan task — the honest reading is that the gate found work the sweep missed, which is the gate doing its job, not the plan anticipating it.
