# Copy and dead-code sweep — §12.4 role-flags over-grant, orphaned ParsePanel, stale help prose

**Date:** 2026-08-02
**Branch:** `chore/copy-deadcode-sweep`
**Backlog items:** `BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT`, `BL-ADMIN-PARSEPANEL-ORPHANED`, `BL-HELP-STRIP-COPYLINK-STALE` (all three in BACKLOG.md, open queue).
**Class:** copy + dead-code. One §12.4 catalog row (three-way lockstep), one component deletion, two lines of help prose. No DB, no migration, no advisory lock, no RPC.
**UI surface:** YES. components/admin/ParsePanel.tsx and `app/help/admin/per-show-panel/page.mdx` are both UI surfaces under AGENTS.md invariant 8 ("any file under `app/` except `app/api/**`, any file under `components/`"). The impeccable dual-gate applies; see §1.1 item 1.
**Verification ground truth:** every string, line anchor, and count below was measured live on this branch's merge-base (`c29d3eb68`), not copied from the backlog entries. Two backlog claims were stale and are corrected in §1.1 items 5 and 6.

---

## 1. Scope

Three independent fixes, one branch. They share no code; they share a class (shipped text or shipped code that no longer matches reality) and a merge-base.

1. **Item 1 — `ROLE_FLAGS_NOTICE` helpfulContext claims a grant that does not exist.** The §12.4 copy tells Doug that LEAD or FINANCIALS unlock "internal financials and admin access". Probed (§2.2): **neither** grants admin access — the admin tree gates on admin identity (`is_admin()` reads the JWT role claim and the `admin_emails` table, never `role_flags`). The backlog entry frames this as FINANCIALS being over-credited with a grant LEAD has; that framing is half right and is corrected here. Fix is a three-word deletion landed through the §12.4 three-way lockstep in ONE commit, plus a frozen byte-parity oracle, the hand-maintained explainer mirror, and the same row's `longExplanation`, which repeats the claim.
2. **Item 2 — the ParsePanel component is orphaned.** Nothing in `app/`, `components/`, or `lib/` imports it; its only importers are two test files that exist to test it. Delete it, remove its registry row, and ship a structural guard so the class (a component with zero production importers) cannot grow silently again.
3. **Item 3 — help prose describes a control that was removed.** Two lines of `app/help/admin/per-show-panel/page.mdx` describe a status-strip copy-link that the share-hub consolidation deleted. Rewrite both to name what the strip actually renders.

### 1.1 Resolved scope — do not relitigate

1. **The impeccable dual-gate RUNS; the marker is not `N/A`.** Invariant 8's UI-surface definition (AGENTS.md, invariant 8) is a path test with no file-extension carve-out, and this branch touches both halves of it: a file under `components/` (item 2) and a file under `app/` outside `app/api/**` (item 3). The prior docs-hygiene spec already ratified the same reading for this exact MDX file when it DEFERRED item 3 for precisely this reason (docs/superpowers/specs/2026-08-02-docs-hygiene-citation-rot-financials-vocab-design.md §1.1 item 1: "a UI surface per AGENTS.md invariant 8, requiring the impeccable dual-gate"). Deferring on that ground and then claiming `N/A` on the same file would be incoherent. Measured: no help-MDX-only precedent exists in `docs/superpowers/plans/**` — every existing `impeccable-gate: N/A` line sits on a genuinely non-UI unit. The critique and audit will have little to say about a deletion and a two-line prose fix; running them anyway is the invariant, and a low-finding gate run is a cheap outcome, not a wasted one.
2. **Item 1 is a copy correction, not an access change.** No entitlement logic moves. The runtime is the authority and it does not change: `lib/visibility/scopeTiles.ts` (`financialsVisible = isAdmin || flags.includes("LEAD") || flags.includes("FINANCIALS")`), `lib/data/getShowForViewer.ts` (`isLead = isAdmin || derivedFlags.includes("LEAD")`; `financialsEntitled = isLead || derivedFlags.includes("FINANCIALS")`), and `is_admin()` in `supabase/migrations/20260514000000_admin_emails_runtime_mutable.sql`, which consults no flag at all.
3. **The round-0 draft's proposed replacement was WRONG and is recorded as such, not quietly swapped.** It read `(and, for LEAD, admin access)`, mirroring the row's `longExplanation`. Spec review R1 refuted it by probe and the refutation reproduced (§2.2): the `longExplanation` clause it mirrored is itself false, which is why §2.3a now fixes that too. Recorded here so a later round does not re-propose the parenthetical as an improvement.
4. **Item 2 deletes rather than re-homes.** The backlog entry offers "delete ParsePanel or re-home it explicitly". Measured, there is nothing to re-home to: whole-parse review was deliberately dropped from published shows (`65d5be75a`) in favor of MI-11 holds in the Changes feed, and `StagedReviewCard` — the only thing ParsePanel wrapped — is independently live in the onboarding wizard at `app/admin/show/staged/[stagedId]/page.tsx`, with eight test importers of its own at merge-base, six of which survive this branch (`git grep -l '@/components/admin/StagedReviewCard' c29d3eb68 -- tests | wc -l` → 8, minus the two ParsePanel test files this branch removes). Re-homing would mean inventing a mount the product deliberately removed.
5. **Backlog claim corrected: the registry to sweep is `tests/messages/_metaEmphasisRenderContract.test.ts`, not a `tests/e2e/` file.** The entry says "sweep `tests/e2e/_metaEmphasisRenderContract` style registries on removal". Measured: no file matching `tests/e2e/_metaEmphasisRenderContract*` exists. The real registry is `tests/messages/_metaEmphasisRenderContract.test.ts`, whose ParsePanel row exists only because the component carries a comment containing `messageFor()`. Its stale-entry guard asserts every registered path still exists, so the deletion turns that test RED until the row goes — the row removal is forced, not optional.
6. **Backlog claim corrected: item 3 forces NO screenshot regeneration.** The entry predicts "correcting shipped user copy pulls in the help screenshot surface (`help-affordances`, `screenshots-drift`), which a code-comment sweep should not". Measured: `app/help/admin/per-show-panel/page.mdx` contains zero `<Screenshot` tags and has no key in `scripts/help-screenshots.manifest.ts`, and no test ties help MDX prose to WebP bytes or filenames. Both workflows still FIRE (their path filters are `app/**` and `app/help/**`), but `screenshots-drift` re-captures and diffs `public/help/screenshots/`, and prose on an unscreenshotted page changes no captured pixel. **No WebP is regenerated on this branch, and none is captured locally** — the AGENTS.md byte-comparison discipline (pinned Docker image, `--platform linux/amd64`) is therefore not exercised here. If a drift job unexpectedly goes red, that is a finding to diagnose, not a license to re-capture from this arm64 host.
7. **The class sweep for item 2 was run, and its peers are filed, not fixed.** AGENTS.md requires sweeping the bug SHAPE. The shape is "component file with zero production importers" and it was probed tree-wide (§3.2): six instances, of which ParsePanel is the only one chartered by a backlog entry. The other five are filed as a new backlog row with the probe output attached. Deleting five more components on a copy-sweep branch would be unbounded scope with five independent product questions inside it (whether each surface is retired or merely unmounted). What this branch DOES ship is the structural guard that makes the class visible and non-growable (§3.3) — the AGENTS.md structural-defense calibration ("if the class is already nameable at FIRST occurrence, ship the structural defense in the FIRST repair commit").
8. **`app/admin/dev/page.tsx` has its own local `function ParsePanel` — untouched, and not an instance.** It is a distinct symbol declared and used inside that dev page, with no import of the deleted component. It is a name collision, not a reference.
9. **`tests/e2e/admin-parse-panel.spec.ts` stays.** It is a route-level spec that imports no component; three other files reference it (`playwright.config.ts`, `tests/ci/_metaE2eWorkflowCoverage.test.ts`, `tests/help/walker-routes.test.ts`). Deleting it would break those and is outside the entry's charter.
10. **The deleted component's path is rendered as PROSE in this spec and its plan, from round 0.** `spec:lint` (`scripts/spec-lint.ts`) parses a backticked path with a file extension as a citation and hard-fails `CITATION_FILE_MISSING` when the target is gone. Citing the file this branch deletes would mint exactly the dangling-citation debt that `BL-DANGLING-CITATIONS-RETIRED-WORKFLOW` was just closed to remove. Prose form is the pre-emptive fix, not an oversight, and it applies only to paths this branch deletes.
11. **No master-spec-patches entry, and no new §12.4 row.** Item 1 edits an existing row's helpfulContext to match semantics already ratified by `docs/superpowers/specs/admin/2026-07-15-extend-role-scope-vocab.md`. The patch-doc convention (`docs/superpowers/specs/README.md`) is for edits that change contract content; this reconciles copy to a contract that did not move.
12. **The historical design docs that quote the old string are NOT edited.** `docs/superpowers/specs/2026-07-20-alert-popover-context-design.md`, its plan, and its `docs/superpowers/specs/2026-07-20-alert-popover-context-copy-now-vs-proposed.html` companion quote the copy as it stood when they shipped. Rewriting shipped design history has negative value and is the same anti-pattern the citation-rot spec settled for fenced command blocks. The hand-maintained explainer mirror IS edited, because it is a live reference artifact, not a historical record (§2.3).
13. **The master spec's own "admin/ops surface" claim is FILED, not fixed here.** `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` MI-9 ends its capability parenthetical with "LEAD additionally grants the admin/ops surface" — the same claim §2.2 refutes. It is not Doug-visible, and unlike a copy string it is a contract statement about what a capability flag confers; changing that is a ratification act, and the claim may encode intent rather than a stale description. **Census, corrected at spec review R2** (the round-0 draft claimed "exactly two sites tree-wide", which was wrong): the phrase occurs at ten places outside this spec and its plan, dispositioned as — 1 production string, `lib/messages/catalog.ts` `longExplanation`, FIXED here (§2.3a); 1 contract statement, master spec MI-9, FILED; 4 in BACKLOG.md (the `BL-ROLEFLAGS-…` entry quoting the defect, which archives with it, plus three lines of the new `BL-LEAD-CAPABILITY-PROSE-STALE` entry, which are the filing); and 4 in historical design records that quote the copy as it stood when they shipped (`docs/superpowers/specs/2026-07-18-alert-copy-full-sweep-design.md` twice, `docs/superpowers/specs/2026-08-02-docs-hygiene-citation-rot-financials-vocab-design.md`, and its plan). The four historical records are left alone on the same reasoning as item 12 — they are history, not claims in force. After this branch, **no production code and no rendered copy** contains the phrase. It goes in the new backlog row with the probe attached so the next pass settles it instead of re-deriving it. This branch's rule is the one it applies to `capabilityTransitions` in §2.5: fix what is unambiguously self-contradictory, file what needs a contract decision.
14. **The corrected copy does not name LEAD's real extra capability.** LEAD widens the scope tiles (`lib/visibility/scopeTiles.ts`, the audio/video/lighting predicates). Adding that to a short helpfulContext would trade one over-claim for a longer sentence about something that is not why the alert is worth confirming. Reasoned in §2.2; not a phrasing question to reopen.

---

## 2. Item 1 — `ROLE_FLAGS_NOTICE` helpfulContext

### 2.1 The string

**Before (the byte-identical string at all five sites below):**

> This fires only for LEAD or FINANCIALS, the roles that unlock internal financials and admin access, and every change is logged. Nothing to do unless it was a mistake; if so, correct it in the sheet or role mapping.

**After:**

> This fires only for LEAD or FINANCIALS, the roles that unlock internal financials, and every change is logged. Nothing to do unless it was a mistake; if so, correct it in the sheet or role mapping.

The edit deletes three words: ` and admin access`. Everything else is byte-identical. No em dash, no typographic apostrophe, no character outside the existing copy's repertoire.

### 2.2 Why the old string is wrong — and why the first repair attempt was also wrong

The backlog entry frames this as a mis-attribution: FINANCIALS is credited with a grant that only LEAD has. That framing is half right, and this spec's round-0 draft inherited it, proposing `(and, for LEAD, admin access)`. Spec review R1 refuted that by probe, and re-probing confirms it:

```
$ rg -n 'create or replace function public.is_admin' -A 14 supabase/migrations/20260514000000_admin_emails_runtime_mutable.sql
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
      or exists (select 1 from public.admin_emails ae
                  where ae.email = public.auth_email_canonical() and ae.revoked_at is null);
```

`is_admin()` reads the JWT role claim and the `admin_emails` table. It never looks at `role_flags`. The admin tree gates on admin identity (`requireAdminIdentity`), not on a flag. Sweeping every production use of the flag confirms there is no second path:

```
$ rg -n '"LEAD"' lib app components        # parser/fixture hits elided
lib/visibility/scopeTiles.ts:86,97,114     # audio / video / lighting scope tiles
lib/visibility/scopeTiles.ts:141           # financialsVisible
lib/data/getShowForViewer.ts:375,380       # isLead → financialsEntitled
components/crew/sections/CrewSection.tsx:203, app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:171   # a "Lead" chip
```

So **neither role grants admin access**. LEAD unlocks financials and widens the scope tiles; FINANCIALS unlocks financials alone. The defect is not a mis-attributed grant, it is a **non-existent** grant asserted for both roles, and the correct repair is to delete the claim rather than re-attribute it. Explanatory copy only, so no access was ever granted in error, but it is Doug-visible in the alert popover and on the errors help page.

The corrected sentence deliberately does not substitute LEAD's real extra (the wider scope tiles). helpfulContext is the short form; the alert is about a capability change worth confirming, and "unlocks internal financials" is the part that makes it worth confirming. The row's `longExplanation` is where detail belongs, and §2.3a fixes its copy of the same false claim.

### 2.3a The same false claim in the row's `longExplanation`

`lib/messages/catalog.ts`, `ROLE_FLAGS_NOTICE.longExplanation`, reads "which grant access to internal financials (and, for LEAD, the admin/ops surface)". Same claim, same row, also Doug-visible (it renders on `/help/errors`). Delete the parenthetical, leaving "which grant access to internal financials".

This field is NOT part of the §12.4 lockstep — `tests/cross-cutting/codes.test.ts` compares `dougFacing`, `crewFacing`, `followUp`, and `helpfulContext` against the generated spec rows, and `longExplanation` appears in none of them, so §12.4 has no mirror of it to keep in step. It rides the same commit because it is the same defect.

### 2.3 Lockstep surfaces (all in ONE commit)

The AGENTS.md §12.4 rule names three surfaces. Measured, this row has five: a frozen byte-parity oracle and a hand-maintained mirror hold the same string:

| # | Surface | Anchor | Why it must move in the same commit |
|---|---------|--------|-------------------------------------|
| 1 | Master spec §12.4 helpfulContext appendix | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`, the `ROLE_FLAGS_NOTICE:` line in the YAML fence under the machine-parseable §12.4 helpfulContext appendix anchor comment | Source of truth the generator reads. |
| 2 | Generated codes | `lib/messages/__generated__/spec-codes.ts`, `ROLE_FLAGS_NOTICE.helpfulContext` | Regenerated by `pnpm gen:spec-codes`; never hand-edited. |
| 3 | Runtime catalog | `lib/messages/catalog.ts`, `ROLE_FLAGS_NOTICE.helpfulContext` (and, per §2.3a, `.longExplanation`) | What actually renders. |
| 4 | Frozen popover-copy oracle | `tests/messages/popoverContextCopy.test.ts`, the `ROLE_FLAGS_NOTICE` entry of `FROZEN` | Byte-parity contract from `BL-CARD-COPY-HELPFULCONTEXT-PARITY` (graduated 2026-08-01). Hardcodes the string; goes RED on any change. This is the re-freeze the backlog entry demands. |
| 5 | Explainer mirror | `docs/alerts/admin-alert-system-explainer.html`, the `ROLE_FLAGS_NOTICE` row: its lowercased `data-text` search attribute and its `<p>` inside `<details class="cx-help">` | Hand-maintained (no generator, no test). The `card-copy-parity-sync-job-names` graduation established "explainer mirror" as part of this lockstep. Both occurrences in the row change; the `data-text` copy is lowercased. |

`tests/cross-cutting/codes.test.ts` (the `x1-catalog-parity` gate) compares the runtime catalog against the generated §12.4 rows, so surfaces 1 through 3 drifting apart fails CI. Surfaces 4 and 5 have no cross-check between them and the others; they are enumerated here because that is the only thing preventing them from being forgotten.

### 2.4 Surfaces deliberately NOT touched

`tests/messages/roleFlagsNoticeCopy.test.ts` and `tests/messages/fullSweepCopy.test.ts` assert only `not.toBeNull()` on this field. `tests/messages/warningCardCopyRegistry.ts` and its meta-test cover `WARNING_CARD_COPY_CODES`, which does not contain `ROLE_FLAGS_NOTICE`. `app/help/errors/page.tsx` renders from the catalog, so it inherits the fix. `tests/cross-cutting/extract-spec-codes.test.ts` is fixture-based.

### 2.5 Companion code-comment fix (found by the item-1 class sweep)

Sweeping the shape "prose that restates the financials entitlement" across `lib/`, `app/`, and `components/` (`rg -ni "financials" -g '*.ts' -g '*.tsx' lib app components | rg -i "lead" | rg -v FINANCIALS`) turned up two more restatements, of which one is unambiguously stale and one is not:

- **IN SCOPE — `lib/visibility/scopeTiles.ts`, the `financialsVisible` line of the module header comment**, reads `financialsVisible → admin OR LEAD`. The function it describes, ~100 lines below in the same file, returns `isAdmin || flags.includes("LEAD") || flags.includes("FINANCIALS")`, and the same file's `financialsEntitled` note already says `admin || LEAD || FINANCIALS` correctly. The file contradicts itself, and this spec cites that function as the authority for item 1's correction, so leaving its header stale would undercut the fix. Correct it to `admin OR LEAD OR FINANCIALS`. One comment line, no behavior.
- **FILED, NOT FIXED — `lib/visibility/capabilityTransitions.ts`, the `financialsVisible = isAdmin || LEAD (LEAD-or-admin)` line of its predicate list.** That module's flip matrix is built around `hasLead` and may not model a FINANCIALS flag at all, in which case the line is an accurate description of the matrix's own simplification rather than a false claim about entitlement. Determining which it is means reading the matrix contract, not editing a comment, so it is filed as `BL-LEAD-CAPABILITY-PROSE-STALE` (§3.2) alongside the master spec's MI-9 admin/ops claim, which is the same class. Guessing here is how a one-line "fix" desynchronizes a matrix from its documentation.

Three other hits are already correct and stay: `lib/data/getShowForViewer.ts` (both the module header and the JOIN-gate comment continue "or a FINANCIALS mapping grant") and the `financialsEntitled` note in `lib/visibility/scopeTiles.ts`.

### 2.6 Acceptance (item 1)

1. `pnpm gen:spec-codes` produces a clean tree (the regenerated file is committed, and re-running it after commit yields no diff).
2. `pnpm test:audit:x1-catalog-parity` passes.
3. `vitest run tests/messages/popoverContextCopy.test.ts` passes, and its `FROZEN` count assertion is unchanged (the row count does not move; only one row's bytes do).
4. `rg -n "unlock internal financials and admin access" lib app components tests docs/alerts docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` returns zero hits. Hits remaining in the three historical `alert-popover-context` documents and in the BACKLOG/plan/spec text describing this fix are expected and ratified by §1.1 item 12.
5. All five surfaces in §2.3 are in one commit, verified by `git show --stat` on that commit. The §2.3a `longExplanation` fix and the §2.5 companion comment fix ride the same commit; all three are the same defect, and splitting them would leave a live contradiction of the fix in a separate commit.
6. `rg -n "admin OR LEAD" lib app components | rg -v "OR FINANCIALS"` returns zero hits. The bare `admin OR LEAD` grep is NOT the check: the corrected string contains that substring, so it can never reach zero and would fail on a correct implementation (spec review R3 finding 3).
7. `rg -n "admin/ops surface" lib app components` returns zero hits. The remaining master-spec instance is deliberate and filed (§1.1 item 13).

---

## 3. Item 2 — the orphaned ParsePanel component

### 3.1 Blast radius (measured)

The component is 84 lines at components/admin/ParsePanel.tsx (prose path per §1.1 item 10). It exports a props type and the component, and imports only `StagedReviewCard` and its `StagedRow` type. Deleting it orphans no module, because `StagedReviewCard` keeps one production importer and, of its eight test importers at merge-base, the six that are not the two ParsePanel test files this branch removes.

Bare-string `ParsePanel` across `app/`, `components/`, `lib/`, `tests/`, `scripts/`, `fixtures/`, `supabase/` at merge-base: **26 matching lines, 29 occurrences** (`git grep -n` vs `git grep -o`; the round-0 draft reported the line count as an occurrence count, corrected at spec review R1). Exactly two are imports, and both are tests that exist to test the component:

| Site | Disposition |
|------|-------------|
| tests/components/ParsePanel.test.tsx | Delete the file. All four of its tests test the deleted component. |
| `tests/components/admin/parsePanelComposition.test.tsx` | Delete the ParsePanel test only. The file's other test covers `WarningsBreakdown` and survives; the file, its name, and its remaining test stay. |
| tests/components/admin/__snapshots__/parsePanelComposition.test.tsx.snap | Remove the obsolete snapshot entry (delete the file if that entry is its only content). |
| `tests/messages/_metaEmphasisRenderContract.test.ts` | Remove the ParsePanel registry row. Its stale-entry guard asserts every registered path exists, so this is forced by the deletion, not optional. |
| `components/admin/StagedReviewCard.tsx` header comment | Correct: it claims a mount on `app/admin/show/[slug]/page.tsx` that no longer imports it. |
| `components/admin/ChangesFeed.tsx` header comment | Correct the ParsePanel reference the same way. |
| `app/admin/dev/page.tsx` | Untouched — different local symbol (§1.1 item 8). |
| `tests/components/admin/parse-panel-affordance.test.tsx` | Untouched — imports `StagedReviewCard`; "parse panel" appears only in a `describe` string. |
| `tests/e2e/admin-parse-panel.spec.ts` | Untouched (§1.1 item 9). |
| Docs (36 files, 93 matching lines at merge-base; re-measured at spec review R1) | Untouched. Historical plans and specs; none is a citation to the file path in `spec:lint` terms except where already prose. |

No dead-export detector exists in this repo (no knip, ts-prune, depcheck, madge, or unimported in `package.json` or `eslint.config.mjs`), and no shard-balance guard names the file.

### 3.2 Class sweep (probe, run at spec time)

Shape swept: **a file under `components/` that no file under `app/`, `components/`, or `lib/` imports.** The probe walks every `.ts`/`.tsx` under `components/` (192 files) and, for each production source, extracts every static `from "…"` and dynamic `import("…")` specifier, **asks TypeScript for the edge and for the target.** The guard parses each source with `ts.createSourceFile` and takes its module specifiers from the syntax tree — the `moduleSpecifier` of an import or export declaration, the external-module reference of an `import =`, the literal argument of a dynamic `import()` call, and the argument of an `import()` type — then resolves each with `ts.resolveModuleName`, passing the options from `ts.getParsedCommandLineOfConfigFile` and the per-site mode from `ts.getModeForUsageLocation`. Results flagged `isExternalLibraryImport` are dropped, as is a self-import. Measured: 3427 edges across `app/`, `components/`, and `lib/`, resolved in 0.8s.

**Reading edges off the AST rather than scanning text is not a detail.** Two cheaper approaches were tried and each was refuted by a live mutant during review. A regex scanner counts an import that exists only inside a comment or a string literal. `ts.preProcessFile` is better but is still a scanner, not a parser: it reports `import("@/components/admin/ParsePanel")` appearing as ordinary JSX *text* as though it were a dynamic import — a false green, since a genuinely orphaned component then reads as imported — and it drops the per-site resolution mode, so an `import ... with { "resolution-mode": "require" }` can resolve to a different local file than the compiler picks. It also misses `export * as ns from` and `export type * as ns from`, which are real module edges. The AST has all of them, and `ts.getModeForUsageLocation` takes the mode from the site itself. Probed: the JSX-text case yields zero AST edges where the scanner yielded one, and each namespace re-export form yields exactly one.

**This design is where a seven-round vector ended.** Reviews R1 through R7 produced fourteen live mutants against successively better home-made resolution rules — basename matching, extensionless comparison across several candidates, a substituted-extension specifier, a directory manifest, the declaration/JS/JSX/JSON candidates that `allowJs` and `resolveJsonModule` admit, `paths` / `moduleSuffixes` / `allowArbitraryExtensions`, an `extends` clause smuggling options past a raw-config assertion, and finally the two scanner defects above. The rule was always the defect: any imitation of module resolution is a second implementation that drifts from the first. Asking the compiler for both halves — which edges exist, and what each resolves to — removes the class rather than the instances.

Result, on merge-base `c29d3eb68`, under the corrected path-resolved rule: **6 of 192** — the same six the basename rule found, so the census below is unchanged by the repair; only the guard's precision is.

| File | Disposition |
|------|-------------|
| components/admin/ParsePanel.tsx | Deleted by this branch (chartered by `BL-ADMIN-PARSEPANEL-ORPHANED`). |
| `components/admin/PerShowCrewSection.tsx` | Filed. Zero references of any kind outside itself. |
| `components/admin/ResolveAlertButton.tsx` | Filed. Referenced only in other components' comments as a pattern exemplar. |
| `components/admin/RunFinalCASButton.tsx` | Filed. Referenced only in an `AccentButton` comment. |
| `components/right-now/RightNowCard.tsx` | Filed. Referenced only in comments; a crew-surface question, not a sweep. |
| `components/shared/WrappedTile.tsx` | Filed. Referenced only in sibling comments; also the sole hit of a zero-importer-including-tests probe. |

The five peers are filed as one new backlog row, `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS`, carrying this table and the probe definition, and naming the guard's `ORPHAN_ALLOWLIST` as its live ledger — work the entry by emptying that list.

This branch files a second row, `BL-LEAD-CAPABILITY-PROSE-STALE`, for its other two deliberate non-fixes, which are one class rather than two one-offs: **prose asserting a capability the flag does not confer.** Its two instances are the `capabilityTransitions` predicate list (§2.5) and the master spec's MI-9 "LEAD additionally grants the admin/ops surface" (§1.1 item 13). Neither is a component and neither is a copy string: each is a written claim about what a capability flag confers, so settling it means reading the contract it belongs to (the flip matrix, and MI-9's ratification history) and deciding whether the claim is stale or is describing intent. That is why they are filed rather than swept, and it is a different question from the orphan-component dispositions above: those turn on whether a surface is retired or merely unmounted, a test that has no meaning for a sentence. Both carry the §2.2 probe so the next pass settles them without re-deriving it.

### 3.3 Structural guard (the class defense)

A new meta-test walks `components/**` and asserts that every file with zero production importers appears in an explicit, reasoned allowlist. Seeded with the five peers above; ParsePanel is absent, so the guard is RED before the deletion and GREEN after. Properties it must have:

- **Filesystem-walked, not a lexical file list** — a new orphan fails by default (AGENTS.md registry discipline: static discovery so a NEW surface fails-by-default).
- **Production-importer definition matches §3.2 exactly**, including full module-path resolution — importers are files under `app/`, `components/`, or `lib/`; a file does not import itself; a specifier is compared by resolved path, never by basename.
- **Allowlist rows carry a reason string and a backlog reference**, so the allowlist is a debt ledger, not a mute button.
- **Mutation families it must catch,** declared up front as the closure set (AGENTS.md mutation-family rule): (a) a NEW orphaned component added without an allowlist row; (b) an allowlist row whose file no longer exists (stale row); (c) a component that becomes orphaned when its last production importer is deleted; (d) an allowlist row for a file that DOES have production importers (a row that should have been retired); (e) **resolution fidelity** — the cases that escaped seven rounds of home-made rules, kept as regression tests so nobody reintroduces one: two components sharing a basename; a same-stem .ts/.tsx pair; a file beside a same-named directory index; a substituted-extension specifier; an import that exists only in a comment or a string literal; a dynamic-import call spelled as JSX text; a namespace re-export. A reviewer-proposed sixth family is admissible only with a live escaping mutant demonstrated against the shipped guard.
- **Family (e) is satisfied by construction, and tested anyway.** Every case is a property of TypeScript's parser and resolver rather than of code in this repo, so the guard cannot regress on them without someone replacing the compiler calls. The tests exist to make that replacement fail loudly, and they are cheap.
- **The assumptions that remain, stated rather than pinned.** Four, all conservative in the false-alarm direction: a dynamic `import(variable)` has no literal specifier and so yields no edge, meaning it cannot rescue a component (it would read as orphaned, remedied by an allowlist row); a CommonJS `require()` call is likewise not an edge, which costs nothing in an ESM project but is an assumption rather than a proof; MDX files are not scanned, because — measured — no MDX file under `app/` carries an import statement; and package-internal resolution is out of scope, since `isExternalLibraryImport` results are dropped by design. None of the four can hide an orphan.

### 3.4 Executable spike (run at spec time, not described)

This project's spec discipline says that when a design-correctness vector survives three adversarial rounds, the comprehensive re-analysis IS the spike (`docs/agents/spec-self-review.md`, the three-round cap). This one survived seven. Three successive implementations were built and run against the real tree; the third is the design above.

```
home-made resolver (R4-era rule, all pins applied):
  census 6 of 192, pins clean - then R5 found 3 more escapes, R6 a 4th

compiler resolver, scanner edges (ts.preProcessFile + ts.resolveModuleName):
  imports 3427, census 6 of 192, 0.4s
  comment-only import counted: false     import-in-string counted: false
  - then R7 found 2 more: JSX text read as a dynamic import; per-site
    resolution-mode dropped; plus two namespace re-export forms missed

compiler parser + resolver (AST edges + ts.getModeForUsageLocation):
  AST module edges 3427, census 6 of 192, 0.8s
  JSX-text pseudo-import edges: 0   (the scanner reported 1)
  export {X} from / export * from / export * as ns / export type * as: 1 edge each
  import type ... with resolution-mode: 1 edge, mode taken from the site
```

All three agree on the census, which is the reassuring part: the six components are orphaned under every reading, so the item-2 deletion and the five filed peers never depended on this decision. What each step bought was a shorter list of things that could be wrong, and the last one leaves none a mutant has reached.

The spike is not the deliverable; Task 2 of the plan ships this logic as the guard, and its tests are where the cases live permanently.

### 3.5 Acceptance (item 2)

1. The guard test is RED on merge-base and GREEN after the deletion, demonstrated by running it at both points.
2. `rg -n "ParsePanel" app components lib` returns only the `app/admin/dev/page.tsx` local symbol.
3. `pnpm test` is green, including `tests/messages/_metaEmphasisRenderContract.test.ts` and `tests/components/admin/parsePanelComposition.test.tsx`.
4. `vitest run` reports no obsolete snapshots for `parsePanelComposition`.
5. `pnpm typecheck` and `pnpm lint` are green (no unresolved import left behind).

---

## 4. Item 3 — stale help prose

### 4.1 What the strip actually renders

`components/admin/showpage/StatusStrip.tsx`, in DOM order: archived badge, publish toggle (`PublishedToggle`), Live badge ("Live now"), the sync line (synced/edited age), `ReSyncButton` (idle label "Re-sync"), then the share-hub group rendering `ShareHub`. **There is no copy-link in the strip.** The component's own comment records the change: "'Copy' until the hub absorbed the standalone copy-link." Copy now lives only inside the hub popover (`ShareHub.tsx`, `ShareLinkCopyButton`), whose trigger is labelled "Share link" when published, "Share link · paused" when not, and "Show actions" when archived. The removal is ratified at `docs/superpowers/specs/2026-07-20-share-hub-design.md` §8 ("Removed: ... StatusStrip copy-link render + its copyUrl derivation ...").

### 4.2 The two edits

**Line 7, before:**

> - **Status strip.** Right under the title: the publish toggle, the Live badge when the show is running, the sync status, and the copy-link for the crew URL.

**Line 7, after:**

> - **Status strip.** Right under the title: the publish toggle, the Live badge when the show is running, the sync status, and the **Share link** button for the crew URL.

**Line 30, before:**

> The **Re-sync** button sits in the status strip, between the sync line and the copy-link button. It makes the app read the sheet again right now, instead of waiting for the next scheduled poll. Use it when:

**Line 30, after:**

> The **Re-sync** button sits in the status strip, between the sync line and the **Share link** button. It makes the app read the sheet again right now, instead of waiting for the next scheduled poll. Use it when:

The new ordering claim is measured, not assumed: in `StatusStrip.tsx` the sync line renders before `ReSyncButton`, which renders before the share-hub group.

### 4.3 Constraints the new prose satisfies

- `**Share link**` is a real rendered label (`ShareHub.tsx`), so `tests/help/_metaUiLabelCrosswalk.test.ts` (every bold label must exist verbatim in `app/**` non-help or `components/**`, or be exempted in `tests/help/_uiLabelExceptions.ts`) passes without a new exception row. An invented label would fail this gate.
- No em dash is introduced (`tests/help/page-per-show-panel.test.tsx` bans them on this page).
- No raw ALL_CAPS error code is introduced (same file).
- The phrase "changes feed" is not written loosely (`tests/help/sheetChangesCopy.test.ts` bans it outside "Sheet changes feed").
- Neither banned phrasing from `tests/help/forbidden-prose-registry.test.ts` is introduced.
- The strings `tests/help/help-prose-pages.test.ts` pins on this page ("The panel's main parts:" and the Step-1 string) are untouched.
- Line 11 ("The status strip's quiet sync line, with **Re-sync** beside it in the same strip") and line 65 (the Share link panel inventory) are already correct and stay as they are — they are the internal consistency check on the new wording.

### 4.4 Acceptance (item 3)

1. `grep -in "copy-link" app/help/admin/per-show-panel/page.mdx` returns zero hits.
2. `vitest run tests/help/` is green, `_metaUiLabelCrosswalk` included, with no new row in `tests/help/_uiLabelExceptions.ts`.
3. No file under `public/help/screenshots/` changes (§1.1 item 6).
4. The `help-affordances` and `screenshots-drift` CI jobs fire and pass on the PR.

---

## 5. Out of scope

- The five orphaned-component peers in §3.2 — filed as `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS`.
- Any change to entitlement logic in `lib/visibility/scopeTiles.ts` or `lib/data/getShowForViewer.ts`. Item 1 is copy, and its §2.5 companion is a comment.
- The `capabilityTransitions` predicate-list line (§2.5) and the master spec's MI-9 admin/ops claim (§1.1 item 13) — both filed as `BL-LEAD-CAPABILITY-PROSE-STALE` rather than guessed at.
- A tree-wide code-comment sweep of financials-entitlement vocabulary. `BL-MASTERSPEC-FINANCIALS-VOCAB` reconciled the master spec and graduated on 2026-08-02; the code-comment residue is what §2.5 measured, and it is two lines, one of which this branch fixes.
- The three historical `alert-popover-context` documents quoting the old string (§1.1 item 12).
- `tests/e2e/admin-parse-panel.spec.ts` and the route it exercises (§1.1 item 9).
- Regenerating any help screenshot (§1.1 item 6).
- Wiring `spec:lint` into CI; it remains unwired, as the citation-rot spec recorded.
- The pre-existing "status strip" vs "status band" wording inconsistency between page.mdx lines 7 and 65. Both are comprehensible and neither is false; harmonizing them is a copy-voice question, not a correctness fix, and widening an in-review diff for it is the drip-feed anti-pattern.

## 6. Testing / verification posture

Every item ships TDD, with the failing test written first:

- **Item 1** — the RED is `tests/messages/popoverContextCopy.test.ts`: update its `FROZEN` row to the new bytes and it fails against the unchanged catalog. The lockstep edit turns it green together with `pnpm test:audit:x1-catalog-parity`.
- **Item 2** — the RED is the new orphaned-component guard (§3.3), which fails on merge-base because ParsePanel is orphaned and unallowlisted. The deletion turns it green. The registry stale-entry guard in `tests/messages/_metaEmphasisRenderContract.test.ts` is a second, independent gate on the same commit.
- **Item 3** — the RED is a new assertion in `tests/help/page-per-show-panel.test.tsx` that the page names the Share link button and contains no "copy-link" string. The prose edit turns it green.

Repo-wide gates run pre-push: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm spec:lint` on this spec and its plan (target: 0 hard findings on both).

**Ledger graduation** (convention measured at `tests/docs/_metaDeferralLedgerGraduation.test.ts`): all three entries MOVE from BACKLOG.md's open queue into `BACKLOG-archive.md` under a `## <ID> — RESOLVED (2026-08-02, chore/copy-deadcode-sweep)` heading preserving the original entry body; a `{ id, provenance: "chore/copy-deadcode-sweep" }` row is appended to `BACKLOG_GRADUATED` for each; BACKLOG.md's "Last reconciled" header line gains this pass. Both new OPEN rows (`BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS`, `BL-LEAD-CAPABILITY-PROSE-STALE`) were already filed at spec time — `tests/docs/_metaLedgerReferentialIntegrity.test.ts` fails on a `BL-` id cited by a doc but defined in no ledger, so naming them forced it.

**Invariant-8 marker.** The plan unit carries `impeccable-gate: critique=<RAN|RAN-DEGRADED> audit=<RAN|RAN-DEGRADED> p0=<int> p1=<int> dispositions=<recorded|none>` with real values, per §1.1 item 1 — not the `N/A` form. Findings and dispositions go in the plan's §12.

## 7. Dimensional Invariants

N/A. No layout changes: item 1 edits a string rendered inside an existing popover, item 2 deletes an unmounted component, item 3 edits prose in an MDX page. No fixed-dimension parent gains or loses a child.

## 8. Transition Inventory

N/A. No component gains, loses, or changes a visual state. The deleted component had states, but it is unmounted — removing it removes no reachable transition.

## 9. Documented limits

- The §2.3 lockstep table is a measured census of surfaces holding this string TODAY. Surfaces 4 and 5 are pinned by no cross-check; a future surface that hardcodes a helpfulContext string will not be caught by any gate, only by the same grep this spec's §2.6 item 4 runs. Generalizing that grep into a meta-test is not in scope.
- **Barrels are followed one hop, and that is the guard's one real blind spot.** A re-export (`export * from`, `export * as ns from`, `export type * as ns from`) is a module edge in the AST, so a component reached only through a barrel counts as imported — pinned by a fidelity case. What the guard does NOT do is walk the chain transitively to ask whether the re-exported symbol is ever *used*. A barrel that re-exports a component nothing consumes still rescues it. **The bound depends on where the barrel lives, and only one arm of it is safe:** a barrel under `components/` is itself a candidate, so an unused one is reported orphaned and the chain unravels; a barrel under `app/` or `lib/` is scanned as an importer but is never a candidate, so it can rescue a dead component while neither file is ever reported. That second arm is a genuine false GREEN and it is accepted rather than closed — closing it means whole-program dead-symbol analysis, which is a different tool. It is recorded here so nobody reads the guard as proving the absence of dead components.
- **The false-GREEN question, and how it was actually settled.** The round-0 draft claimed the guard could not produce a false green; seven review rounds produced fourteen live counterexamples, each against a different home-made resolution rule, and the last two against a compiler *scanner* rather than the parser. The claim is not restated in that form, and neither is the pinned-input argument that replaced it — both were properties of implementations the guard no longer has. What holds now is narrower and structural: the guard reports a component as imported exactly when TypeScript's own parser finds a module edge and TypeScript's own resolver lands it on that file. A false green therefore cannot come from resolution disagreeing with the compiler. It can still come from the question being narrower than "is this code dead": an unused re-export through a barrel outside `components/` is a real edge, so the guard counts it, and the component stays hidden (see the barrel limit above). The residual assumptions in §3.3 all fail the other way, toward a false orphan that an allowlist row remedies.
- Item 3 corrects the two claims the backlog entry names. It is not a full audit of that page against the live component tree; other claims on the page were spot-checked (lines 11 and 65 are correct) but not exhaustively verified.

## 10. Review log

- **Round 0 (draft):** backlog claims 5 and 6 corrected against the live tree before any review round; the item-2 class sweep run at draft time with its probe output in §3.2 rather than described as future work.
- **R1 — NEEDS-ATTENTION, 3 findings, all ACCEPTED, none refuted.**
  - **F1 (HIGH) — the replacement copy preserved an unsupported "admin access" claim.** Accepted and reproduced independently: `is_admin()` consults the JWT role claim and `admin_emails` only, and a tree-wide sweep of the flag finds financials, scope tiles, and a "Lead" chip — no admin path. The repair is a deletion, not a re-attribution (§2.1, §2.2), and it widened to the row's `longExplanation` (§2.3a) and to filing the master spec's copy of the claim (§1.1 item 13). The R1 class sweep claimed "exactly two sites tree-wide"; R2 refuted that count and it is corrected in §1.1 item 13 with a full disposition of all ten.
  - **F2 (HIGH) — basename matching lets a genuine orphan read as imported.** Accepted with the reviewer's live mutant. The guard now resolves specifiers to module paths (§3.2), family (e) pins the collision (§3.3), the census was re-run under the corrected rule and is unchanged at 6 of 192, and §9's "cannot produce a false green" claim is withdrawn rather than re-asserted.
  - **F3 (LOW) — three census figures were wrong.** Accepted and re-measured: 26 matching lines / 29 occurrences (the draft reported lines as occurrences); docs 36 files / 93 lines, not 37 / 98; `StagedReviewCard` has 8 test importers at merge-base, 6 surviving, not 7.
- **R2 — NEEDS-ATTENTION, 5 findings, all ACCEPTED, none refuted.**
  - **F1 (HIGH) — path resolution still permitted false greens.** Two live mutants: a same-stem `.ts`/`.tsx` pair, and a file alongside a same-named directory index. Comparing an extensionless path against every plausible candidate marked all of them imported when the compiler loads exactly one. The rule now resolves to a single candidate in TypeScript precedence order (§3.2) and family (f) pins it (§3.3). Probed: the tree has zero instances of either collision today, so the census is unchanged.
  - **F2 (HIGH) — the artifacts activated an undeclared, already-red ledger guard.** Correct: naming two not-yet-filed `BL-` ids turned `tests/docs/_metaLedgerReferentialIntegrity.test.ts` red. Both entries were filed in `40d73a2ef` (created during the review), and the plan's meta-test inventory now names that guard instead of omitting it.
  - **F3 (MEDIUM) — the "exactly two sites tree-wide" census was false.** Correct; there are ten outside this spec and its plan. Every one is now enumerated and dispositioned in §1.1 item 13.
  - **F4 (LOW) — orphan-component rationale leaked into the `BL-LEAD-CAPABILITY-PROSE-STALE` filing.** Correct; "retired or merely unmounted" is the wrong test for a prose claim. Rewritten in §3.2.
  - **F5 (LOW) — the plan's whole-diff review brief still said four mutation families.** Correct; it would have under-scoped the closure review. Now six.
  - Reviewer-confirmed and not to be re-derived: the corrected helpfulContext and `longExplanation` wording is runtime-supported; the helpfulContext census is five live files / six occurrences (the explainer holds two) with no sixth surface; all corrected counts reproduce exactly; the path-based census reproduces at 6 of 192; all three REDs are genuinely red; the invariant-8 marker lifecycle is sound.
- **R3 — BLOCKING, 6 findings, all ACCEPTED, none refuted.**
  - **F1 (P0) — Task 4 mutated three tracked documents with no failing test in front of them**, violating invariant 1. Correct: the draft archived first and registered second, and the graduation guard only checks ids already registered. The task is inverted — registry rows first (RED, because none of the three is archived yet), archive move second (GREEN).
  - **F2 (HIGH) — the single-candidate resolver still had two escapes** under `moduleResolution: "bundler"`: a `.jsx` specifier resolving to a `.tsx` file, and a directory package manifest's `main` field. Accepted with both mutants. Rather than reimplement bundler resolution for cases with zero live instances, the guard now PINS both assumptions and fails loudly if either breaks (family (g), §3.3). Probed: zero aliased/relative `.jsx`-family specifiers, zero package manifests under `components/`.
  - **F3 (HIGH) — the acceptance grep could never pass.** `rg -n "admin OR LEAD"` matches the corrected string `admin OR LEAD OR FINANCIALS`, so a correct implementation would fail its own check. Now filtered through `rg -v "OR FINANCIALS"` (§2.6 item 6).
  - **F4 (MEDIUM) — two stale numbers survived R2's re-measurement**: §3.1 still said seven surviving `StagedReviewCard` test importers (six), and the plan still said 2 hard pre-Task-2 lint findings (four). Both corrected.
  - **F5 (LOW) — the R2 F4 repair left its rejected rationale in the closing sentence.** Removed.
  - **F6 (LOW) — filing chronology stale in three places** (spec §5, plan Task 4 heading and commit message) after the entries moved to spec-time filing. All three corrected.
  - Reviewer-confirmed and not to be re-derived: §1.1 item 13's ten-site census is exact and every disposition matches; the collision probes reproduce (192 files, zero same-stem, zero component index modules, zero component-local manifests); Task 1's single commit satisfies the AGENTS.md §12.4 lockstep; every named file, symbol, script, and vitest wiring exists; the three feature REDs are genuinely red.
- **R4 — NEEDS-ATTENTION, 2 findings, both ACCEPTED, none refuted.**
  - **F1 (HIGH) — family (g)'s first form did not close the class.** Four more live mutants (a Foo.d.ts, Foo.js, or Foo.jsx beside a Foo directory holding index.tsx; a Foo.json beside a Foo.json.tsx), all passing the original specifier-only pins, because `allowJs` and `resolveJsonModule` widen TypeScript's candidate list. The pin was generalized from specifier shape to **file shape plus specifier shape** (§3.3): no file under the scanned roots may carry an unmodelled module extension. Probed: those roots hold 583 `.ts`, 244 `.tsx`, 13 `.mdx`, one `.css`, one `.ico`, and nothing else, so every R4 mutant is now unconstructible rather than undetected, and the R3 directory-manifest mutant is subsumed (a manifest is a `.json`). The resolver also now takes an exact path hit before the candidate list.
  - **F2 (LOW) — two plan references still carried the pre-(g) family count**, one of them the whole-diff review brief, which would have under-scoped the closure review. Both now say seven, (a) through (g).
  - Reviewer-confirmed and not to be re-derived: Task 4's RED is genuine and fails naming all three ids; the census remains 192 files; ParsePanel is 84 lines; its snapshot file holds exactly one entry; every named file, script, and vitest wiring exists; the R3 acceptance-grep and lint-count corrections are present.
- **R5 — NEEDS-ATTENTION, 2 findings, both ACCEPTED, none refuted.**
  - **F1 (HIGH) — the two shape pins did not cover compiler configuration.** Three conforming mutants (repointing the `@/*` alias, adding `moduleSuffixes`, enabling `allowArbitraryExtensions`) passed both pins and still mis-resolved. Accepted, and the response ends the enumeration rather than extending it: module resolution consumes exactly three inputs — compiler options, files on disk, specifier text — so family (g) now pins all three, and every escape found across R3, R4, and R5 violates one of them (§3.3). The compiler-option pin reads tsconfig.json directly; its current values were measured, not assumed. §9's false-green limit is rewritten around the pinned-input argument instead of the withdrawn absolute claim.
  - **F2 (LOW) — four statements still called every family a synthetic-map proof** after R4 made family (g) real-tree-only, including a self-contradicting sentence in the plan. All four corrected.
  - Also landed this round, unprompted by a finding: **§3.4, an executable spike.** Three consecutive rounds on one vector is where this project's spec discipline says to stop patching prose and build it, so the specified rule was implemented and run against the real tree and against the nine file-set mutants from R2 through R4. Result: census unchanged at 6 of 192, both shape pins clean, the three modelled mutants reported correctly, the six unmodelled ones refused by a pin before resolution runs.
  - Reviewer-confirmed and not to be re-derived: the merge-base extension census reproduces exactly (583 .ts, 244 .tsx, 13 .mdx, 1 .css, 1 .ico), so the R4 mutants do violate the file pin; both plan family counts are correct; spec lints 0 hard and the plan's 4 hard are exactly the two not-yet-created guard files; every named file, symbol, script, and vitest wiring exists; the ParsePanel measurements reproduce.
- **R6 — NEEDS-ATTENTION, 3 findings, all ACCEPTED, none refuted.**
  - **F1 (HIGH) — the compiler-option pin read the config file instead of resolving it.** A mutant that keeps every raw tsconfig.json assertion but adds an `extends` clause inherits `moduleSuffixes` from the base config and hides a genuine orphan; both files stay .tsx and both specifiers pass the specifier pin. Accepted: the pin now calls `ts.getParsedCommandLineOfConfigFile` and asserts on EFFECTIVE options, which collapses `extends` chains before the assertion sees them. Verified against TypeScript 5.9.3 — all five effective values hold and the config has no `extends`. The same finding also caught the plan promising three assertions in its inventory while Task 2 specified only two; Task 2 now carries all three.
  - **F2 (LOW) — the spike's coverage claim and the escape count were both loose.** "Every mutant from R2 through R5" overstated a harness that exercises nine file-set cases and cannot express a config mutant, and "nine in total" undercounted the twelve escapes the log itself enumerates. Both corrected to say exactly what is covered and by which pin.
  - **F3 (MEDIUM) — Task 1's verification could pass with the `longExplanation` fix missing.** Correct and worth the catch: `x1-catalog-parity` does not compare that field and the existing copy test only asserts non-null, so the acceptance grep in §2.6 item 7 was the only check on it and the plan had omitted it from Task 1.3. Added, with a note saying why it is not redundant.
  - Reviewer-confirmed and not to be re-derived: the component census reproduces at 192 and the extension census exactly; ParsePanel has exactly two importers, both tests, and one snapshot entry; the stale help text is at lines 7 and 30 with the correct Share-link inventory at 65; the five peer entries and two new OPEN rows resolve; the Task 4 ledger RED mechanism matches the live tests; spec lints 0 hard and the plan's 4 hard are the two future guard files.
- **After R6 — the vector started being closed by changing the design, not by another repair.** R6's repairs (effective compiler options, spike scope, the missing `longExplanation` check) all landed. But five of six rounds had found an escape in whatever resolution rule the spec proposed (R7 then found two more against the first replacement), which is well past this project's three-round cap on design-correctness vectors. The rule was the defect: any hand-rolled resolver is a second implementation of module resolution that drifts from the first, so the escape list had no reason to stop growing. The guard now calls `ts.preProcessFile` and `ts.resolveModuleName` (§3.2), which deletes the candidate list, all three pins, the extension sets, and the regex scanner — and, measured, produces the identical census while also retiring two hazards no round had raised (an import that exists only in a comment, and one spelled inside a string literal, both of which a regex scanner counts). Families (e), (f), and (g) collapse into a single resolution-fidelity regression family, which R7's cases then joined. Recorded at length because the round economy, not the code, is the lesson: the first three rounds should have triggered the design change that rounds six and seven did.
- **R7 — NEEDS-ATTENTION, 4 findings, all ACCEPTED, none refuted.**
  - **F1 (HIGH) — the compiler resolver was right but the compiler SCANNER was not.** Two live mutants: `ts.preProcessFile` reports `import("...")` occurring as ordinary JSX text as a dynamic import (a false green — an orphan reads as imported), and it drops the per-site resolution mode, so an import carrying `{"resolution-mode":"require"}` can land on a different local file than the compiler picks. Accepted, and closed the same way the resolver was: take edges from the AST rather than a scan, and take the mode from the site with `ts.getModeForUsageLocation` (§3.2). Probed: the JSX-text case yields zero AST edges where the scanner yielded one.
  - **F2 (MEDIUM) — the residual-assumption list was incomplete and one limit was mischaracterized.** Ordinary barrel re-exports ARE detected, so "does not follow barrel chains" was wrong; what the scanner actually missed was `export * as ns from` and `export type * as ns from`. The AST design detects both (probed: one edge each), and the assumption list is rewritten to four correctly-signed items, adding CommonJS `require()`.
  - **F3 (MEDIUM) — Task 1's regen check could not be green where the plan put it.** `git diff --exit-code` on the generated file necessarily fails between the edit and the commit. Moved to its own post-commit step with a note on why it belongs there and nowhere else.
  - **F4 (LOW) — four current-design counts were stale** after the R6 design change ("two compiler APIs" for three, "five of six rounds", "four families" for three, "at spec review R6"). All corrected.
  - Reviewer-confirmed and not to be re-derived: the algorithm reproduces exactly 3427 imports and 6 of 192 components, precisely ParsePanel plus the five filed peers, so the deletion decision stands; no current source uses the resolution-mode, namespace-export, or `import defer` forms; the three then-stated assumptions were individually signed correctly; TypeScript 5.9.3 exposes every named API and the effective config parses with zero errors; Task 1.3 carries the R6 grep.
  - Reviewer-confirmed at R1 and not to be re-derived: the §2.3 lockstep census has no sixth live surface; ParsePanel has zero production importers and exactly two test importers; the class sweep independently reproduces at 6 of 192; the snapshot file holds only the obsolete entry; StatusStrip order is sync line, Re-sync, ShareHub; `Share link` has a real production match for the label crosswalk; all three stated REDs are genuinely red; the dual gate must run; the screenshot claim holds.
