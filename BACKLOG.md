# BACKLOG

Speculative / lower-priority hardening items. "Might do" — not blocking, no concrete near-term trigger. (Contrast `DEFERRED.md`: "will do, concrete trigger".)

**This file is the OPEN queue only.** Resolved / shipped / superseded entries live in **[BACKLOG-archive.md](./BACKLOG-archive.md)** with full provenance — grep by id, ids are unchanged. When an item below ships, move its whole entry there rather than annotating it resolved in place; otherwise this queue silently turns into a changelog.

Last reconciled: 2026-08-02 — `test/agenda-fold-seeded-e2e` graduated `BL-AGENDA-FOLD-NO-SEEDED-E2E` (the per-viewer agenda day fold exercised through the REAL crew page: seeded `agenda_links` + two complementary date-restricted viewers, each an email-matched Google session against its own seeded show, plus an unrestricted admin control in `stage-restricted-crew-schedule.spec.ts`, wired into `crew-e2e.yml` under desktop-chromium behind a run-command wiring guard) and `BL-AGENDA-A11Y-WEBKIT-COVERAGE` (grep-scoped `standalone-webkit-a11y` project resolving exactly one test, structurally pinned, plus webkit installs and a regenerated baseline). Prior: 2026-08-02 — docs/citation-rot-financials-vocab graduated BL-DANGLING-CITATIONS-RETIRED-WORKFLOW (15 dangling citations to the seven retired e2e workflows rendered as prose across 10 docs, class-swept per the AGENTS.md bug-shape rule; spec:lint target-class findings now zero tree-wide) and BL-MASTERSPEC-FINANCIALS-VOCAB (14 master-spec financials-entitlement claims reconciled to LEAD ∪ FINANCIALS ∪ admin, line-count-neutral; 4 seed exclusions + 8 window-probe non-claims ratified in docs/superpowers/specs/2026-08-02-docs-hygiene-citation-rot-financials-vocab-design.md; specs README line-count note corrected), and filed BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT (§12.4 copy over-grant, deferred to the next §12.4 copy pass). Prior: 2026-08-01 — feat/card-copy-parity-sync-job-names graduated BL-CARD-COPY-HELPFULCONTEXT-PARITY (§4.2 helpfulContext frozen for all 44 rows after reconciling rows 12/29 to the shipped catalog) and BL-SYNC-JOB-FOUR-NAMES (one name: "Auto sync" — catalog x6 codes with §12.4 lockstep, runSummary label, explainer mirror; StagedReviewCard badge unchanged). Prior: 2026-08-01 — `fix/announce-a11y-pass` graduated the two Cluster A announcement rows (`BL-DESTRUCT-ARM-STATE-ANNOUNCEMENTS`, `BL-SHAREHUB-REMOTE-ROTATE-ANNOUNCE`): arm-expiry announcements on all 11 `ARM_REVERT_MS` surfaces (shared `ARM_EXPIRED_ANNOUNCEMENT`, dispatch-entry clears, per-group keying on bulk ignore, StagedReviewCard Apply-disarm fix, T4/T4a/T5 guards) and the ShareHub remote-rotation live region (seed-diff `remoteTokenChanges` counter, mirror-the-cue predicate). Prior: 2026-08-01 — `test/ledger-guard-mdast-rewrite` graduated `BL-LEDGER-GUARD-MDAST-REWRITE` (the graduation tripwire ported onto the remark/mdast walker at `tests/docs/_ledgerMdast.ts`; the owner-split r22–r41 hardening restored from snapshot `a1cfce98d` with a two-row reconcile; the three r41 findings closed by probe — the split's follow-up branch is retired). Prior same day: `fix/focus-ring-a11y-pass` graduated the five Cluster A mechanical rows (`BL-FOCUS-RING-CONTRAST`, `BL-PICKER-ROW-RING-OFFSET-BACKDROP`, `BL-IGNORED-SUMMARY-TAP-TARGET`, `BL-DEV-SWITCHER-BAR-MOBILE-WIDTH`, `BL-BARE-TRANSITION-NO-DURATION-CLASS`) — light focus-ring `#E06000`, info-bg nudge, tree-wide offset sweep + structural guard, default-duration alias, tap floor, switcher width. The two announcement rows (`BL-DESTRUCT-ARM-STATE-ANNOUNCEMENTS`, `BL-SHAREHUB-REMOTE-ROTATE-ANNOUNCE`) stay OPEN for the follow-up spec. Prior: 2026-08-01 — `fix/judgment-chip-newtab-suffix` (PR #640) graduated `BL-HEADER-JUDGMENT-CHIP-CONTRAST` (border-strong outline, owner-ratified Option A) and `BL-NEWTAB-DOUBLE-ANNOUNCE-USER-DATA` (`stripNewTabSuffix` value-position dedup at the three interpolated labels). Prior: 2026-07-31 — `BL-HARNESS-RESOLVER-POLICY` + `BL-HARNESS-PACKLIST-SERVER-GRAPH` graduated on `feat/ci-dark-directive-resolver` (PR-C of the ci-dark descoped close-out: shared `"use server"` directive plugin — a parse-based, throw-on-call resolver — consolidated across both harness bundlers, and `packlist-rescan-recovery` returned to the standalone config under it). Prior: 2026-07-31 — `BL-CI-VITEST-EXCLUSION-COVERAGE` graduated on `feat/ci-dark-vitest-exclusion` (PR-B of the ci-dark descoped close-out: ENV_BOUND_COVERAGE_REGISTRY + run-excluded execution oracle; test-auth-gate returned to unit-suite). Prior: 2026-07-27 (merged passes) — `BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC` + `BL-CI-ENV-DEPENDENT-CONFIG-NARROWING` graduated on `feat/ci-dark-descoped-guards` (spec-registration detector + post-run baseline comparator), and `BL-DURATION-TOKENS-EMIT-NO-CSS` graduated on `fix/duration-tokens-emit-no-css` (shipped, alias approach; residual gap filed as `BL-BARE-TRANSITION-NO-DURATION-CLASS`). Same day: three entries that had shipped but were annotated terminal in place graduated: `BL-E2E-LIFECYCLE-INACTIVE-NOTICE-RETIRED` (PR #615, `feat/ci-lifecycle-gallery`), `BL-HEADER-PROBE-RESIDUAL-VACUITY` (PR #617, `test/header-probe-residual-closure`; its one live follow-up now rides `BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT`), and `BL-AGENDA-PERDAY-VIEWER-FILTER` (PR #610, `feat/agenda-perday-viewer-fold`). Also corrected in place: `BL-HEADER-FONT-FALLBACK-WRAP`'s "no `next/font` import anywhere" claim was wrong at filing — the crew show layout has imported Inter since 2026-05-03; the admin tree is what loads nothing. `BL-CI-STALE-BRANCH-PROTECTION-COMMENT` stays deliberately (sub-entry of a still-open parent; rationale in the entry). The graduation meta-test now also rejects terminal HEADINGS and SHIPPED status lines — the shapes this pass caught slipping past it. Prior: 2026-07-26 — `BL-CHILDLESS-GROWABLE-STATIC-GUARD` graduated on `feat/childless-growable-static-guard`; 2026-07-25 — the three phantom-gap items plus 7 terminal-status entries; 2026-07-24 — 30 entries. Prior mainline reconciliation (merged into this branch 2026-07-31): 2026-07-31 (`feat/sheet-icon-link-affordance-class` close-out, over the 2026-07-27 three-parallel-pass merge base) — mainline #628 graduated three in-place-terminal entries (`BL-E2E-LIFECYCLE-INACTIVE-NOTICE-RETIRED` PR #615, `BL-HEADER-PROBE-RESIDUAL-VACUITY` PR #617 — its one live follow-up rides `BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT` — and `BL-AGENDA-PERDAY-VIEWER-FILTER` PR #610), corrected `BL-HEADER-FONT-FALLBACK-WRAP`'s "no `next/font` import anywhere" claim, kept `BL-CI-STALE-BRANCH-PROTECTION-COMMENT` deliberately, and hardened the graduation meta-test against terminal HEADINGS and SHIPPED status lines. `fix/duration-tokens-emit-no-css` graduated `BL-DURATION-TOKENS-EMIT-NO-CSS` (alias approach; residual gap filed as `BL-BARE-TRANSITION-NO-DURATION-CLASS`). `feat/ci-dark-descoped-guards` graduated `BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC` and `BL-CI-ENV-DEPENDENT-CONFIG-NARROWING`. `feat/sheet-icon-link-affordance-class` independently graduated the same three plus its own closure `BL-HEADER-LINK-AFFORDANCE-CLASS`, widening the meta-test to heading-suffix and opening-line spellings (SUPERSEDED/DONE in the terminal set); the merge deduplicated the double-graduated archive copies and reverted this branch's graduation of `BL-CI-STALE-BRANCH-PROTECTION-COMMENT` per #628's deliberate keep. Same branch, at close-out: `BL-HEADER-PILL-LINK-TOUCH-BUFFER` and `BL-HEADER-SUBBLOCK-HIERARCHY-WIDE` graduated — both resolved by the feature itself (asymmetric-overlay 2px pill buffer; linkless sub-block floor drop at every width). NOTE (2026-07-31 split, owner-directed): nineteen adversarial-review rounds of additional guard hardening (ledger container/normalization/field lanes; containment extension/symlink/URL/anchor censuses) were split OUT of the shipping PR to `test/guard-hardening-followup` (snapshot at `a1cfce98d`), chartered under `BL-LEDGER-GUARD-MDAST-REWRITE`. Prior: 2026-07-26 — `BL-CHILDLESS-GROWABLE-STATIC-GUARD`; 2026-07-25 — the three phantom-gap items plus 7 terminal-status entries; 2026-07-24 — 30 entries. Prior: 2026-08-01 — `fix/focus-ring-a11y-pass` graduated the five Cluster A mechanical rows (`BL-FOCUS-RING-CONTRAST`, `BL-PICKER-ROW-RING-OFFSET-BACKDROP`, `BL-IGNORED-SUMMARY-TAP-TARGET`, `BL-DEV-SWITCHER-BAR-MOBILE-WIDTH`, `BL-BARE-TRANSITION-NO-DURATION-CLASS`) — light focus-ring `#E06000`, info-bg nudge, tree-wide offset sweep + structural guard, default-duration alias, tap floor, switcher width. The two announcement rows (`BL-DESTRUCT-ARM-STATE-ANNOUNCEMENTS`, `BL-SHAREHUB-REMOTE-ROTATE-ANNOUNCE`) stay OPEN for the follow-up spec. Prior: 2026-08-01 — `fix/judgment-chip-newtab-suffix` (PR #640) graduated `BL-HEADER-JUDGMENT-CHIP-CONTRAST` (border-strong outline, owner-ratified Option A) and `BL-NEWTAB-DOUBLE-ANNOUNCE-USER-DATA` (`stripNewTabSuffix` value-position dedup at the three interpolated labels). Prior: 2026-07-31 — `BL-HARNESS-RESOLVER-POLICY` + `BL-HARNESS-PACKLIST-SERVER-GRAPH` graduated on `feat/ci-dark-directive-resolver` (PR-C of the ci-dark descoped close-out: shared `"use server"` directive plugin — a parse-based, throw-on-call resolver — consolidated across both harness bundlers, and `packlist-rescan-recovery` returned to the standalone config under it). Prior: 2026-07-31 — `BL-CI-VITEST-EXCLUSION-COVERAGE` graduated on `feat/ci-dark-vitest-exclusion` (PR-B of the ci-dark descoped close-out: ENV_BOUND_COVERAGE_REGISTRY + run-excluded execution oracle; test-auth-gate returned to unit-suite). Prior: 2026-07-27 (merged passes) — `BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC` + `BL-CI-ENV-DEPENDENT-CONFIG-NARROWING` graduated on `feat/ci-dark-descoped-guards` (spec-registration detector + post-run baseline comparator), and `BL-DURATION-TOKENS-EMIT-NO-CSS` graduated on `fix/duration-tokens-emit-no-css` (shipped, alias approach; residual gap filed as `BL-BARE-TRANSITION-NO-DURATION-CLASS`). Same day: three entries that had shipped but were annotated terminal in place graduated: `BL-E2E-LIFECYCLE-INACTIVE-NOTICE-RETIRED` (PR #615, `feat/ci-lifecycle-gallery`), `BL-HEADER-PROBE-RESIDUAL-VACUITY` (PR #617, `test/header-probe-residual-closure`; its one live follow-up now rides `BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT`), and `BL-AGENDA-PERDAY-VIEWER-FILTER` (PR #610, `feat/agenda-perday-viewer-fold`). Also corrected in place: `BL-HEADER-FONT-FALLBACK-WRAP`'s "no `next/font` import anywhere" claim was wrong at filing — the crew show layout has imported Inter since 2026-05-03; the admin tree is what loads nothing. `BL-CI-STALE-BRANCH-PROTECTION-COMMENT` stays deliberately (sub-entry of a still-open parent; rationale in the entry). The graduation meta-test now also rejects terminal HEADINGS and SHIPPED status lines — the shapes this pass caught slipping past it. Prior: 2026-07-26 — `BL-CHILDLESS-GROWABLE-STATIC-GUARD` graduated on `feat/childless-growable-static-guard`; 2026-07-25 — the three phantom-gap items plus 7 terminal-status entries; 2026-07-24 — 30 entries. Prior mainline reconciliation (merged into this branch 2026-07-31): 2026-07-31 (`feat/sheet-icon-link-affordance-class` close-out, over the 2026-07-27 three-parallel-pass merge base) — mainline #628 graduated three in-place-terminal entries (`BL-E2E-LIFECYCLE-INACTIVE-NOTICE-RETIRED` PR #615, `BL-HEADER-PROBE-RESIDUAL-VACUITY` PR #617 — its one live follow-up rides `BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT` — and `BL-AGENDA-PERDAY-VIEWER-FILTER` PR #610), corrected `BL-HEADER-FONT-FALLBACK-WRAP`'s "no `next/font` import anywhere" claim, kept `BL-CI-STALE-BRANCH-PROTECTION-COMMENT` deliberately, and hardened the graduation meta-test against terminal HEADINGS and SHIPPED status lines. `fix/duration-tokens-emit-no-css` graduated `BL-DURATION-TOKENS-EMIT-NO-CSS` (alias approach; residual gap filed as `BL-BARE-TRANSITION-NO-DURATION-CLASS`). `feat/ci-dark-descoped-guards` graduated `BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC` and `BL-CI-ENV-DEPENDENT-CONFIG-NARROWING`. `feat/sheet-icon-link-affordance-class` independently graduated the same three plus its own closure `BL-HEADER-LINK-AFFORDANCE-CLASS`, widening the meta-test to heading-suffix and opening-line spellings (SUPERSEDED/DONE in the terminal set); the merge deduplicated the double-graduated archive copies and reverted this branch's graduation of `BL-CI-STALE-BRANCH-PROTECTION-COMMENT` per #628's deliberate keep. Same branch, at close-out: `BL-HEADER-PILL-LINK-TOUCH-BUFFER` and `BL-HEADER-SUBBLOCK-HIERARCHY-WIDE` graduated — both resolved by the feature itself (asymmetric-overlay 2px pill buffer; linkless sub-block floor drop at every width). NOTE (2026-07-31 split, owner-directed): nineteen adversarial-review rounds of additional guard hardening (ledger container/normalization/field lanes; containment extension/symlink/URL/anchor censuses) were split OUT of the shipping PR to `test/guard-hardening-followup` (snapshot at `a1cfce98d`), chartered under `BL-LEDGER-GUARD-MDAST-REWRITE`. Prior: 2026-07-26 — `BL-CHILDLESS-GROWABLE-STATIC-GUARD`; 2026-07-25 — the three phantom-gap items plus 7 terminal-status entries; 2026-07-24 — 30 entries. Prior: 2026-08-01 — feat/card-copy-parity-sync-job-names graduated BL-CARD-COPY-HELPFULCONTEXT-PARITY (§4.2 helpfulContext frozen for all 44 rows after reconciling rows 12/29 to the shipped catalog) and BL-SYNC-JOB-FOUR-NAMES (one name: "Auto sync" — catalog x6 codes with §12.4 lockstep, runSummary label, explainer mirror; StagedReviewCard badge unchanged). Prior: 2026-08-01 — `fix/announce-a11y-pass` graduated the two Cluster A announcement rows (`BL-DESTRUCT-ARM-STATE-ANNOUNCEMENTS`, `BL-SHAREHUB-REMOTE-ROTATE-ANNOUNCE`): arm-expiry announcements on all 11 `ARM_REVERT_MS` surfaces (shared `ARM_EXPIRED_ANNOUNCEMENT`, dispatch-entry clears, per-group keying on bulk ignore, StagedReviewCard Apply-disarm fix, T4/T4a/T5 guards) and the ShareHub remote-rotation live region (seed-diff `remoteTokenChanges` counter, mirror-the-cue predicate). Prior: 2026-08-01 — `test/ledger-guard-mdast-rewrite` graduated `BL-LEDGER-GUARD-MDAST-REWRITE` (the graduation tripwire ported onto the remark/mdast walker at `tests/docs/_ledgerMdast.ts`; the owner-split r22–r41 hardening restored from snapshot `a1cfce98d` with a two-row reconcile; the three r41 findings closed by probe — the split's follow-up branch is retired). Prior same day: `fix/focus-ring-a11y-pass` graduated the five Cluster A mechanical rows (`BL-FOCUS-RING-CONTRAST`, `BL-PICKER-ROW-RING-OFFSET-BACKDROP`, `BL-IGNORED-SUMMARY-TAP-TARGET`, `BL-DEV-SWITCHER-BAR-MOBILE-WIDTH`, `BL-BARE-TRANSITION-NO-DURATION-CLASS`) — light focus-ring `#E06000`, info-bg nudge, tree-wide offset sweep + structural guard, default-duration alias, tap floor, switcher width. The two announcement rows (`BL-DESTRUCT-ARM-STATE-ANNOUNCEMENTS`, `BL-SHAREHUB-REMOTE-ROTATE-ANNOUNCE`) stay OPEN for the follow-up spec. Prior: 2026-08-01 — `fix/judgment-chip-newtab-suffix` (PR #640) graduated `BL-HEADER-JUDGMENT-CHIP-CONTRAST` (border-strong outline, owner-ratified Option A) and `BL-NEWTAB-DOUBLE-ANNOUNCE-USER-DATA` (`stripNewTabSuffix` value-position dedup at the three interpolated labels). Prior: 2026-07-31 — `BL-HARNESS-RESOLVER-POLICY` + `BL-HARNESS-PACKLIST-SERVER-GRAPH` graduated on `feat/ci-dark-directive-resolver` (PR-C of the ci-dark descoped close-out: shared `"use server"` directive plugin — a parse-based, throw-on-call resolver — consolidated across both harness bundlers, and `packlist-rescan-recovery` returned to the standalone config under it). Prior: 2026-07-31 — `BL-CI-VITEST-EXCLUSION-COVERAGE` graduated on `feat/ci-dark-vitest-exclusion` (PR-B of the ci-dark descoped close-out: ENV_BOUND_COVERAGE_REGISTRY + run-excluded execution oracle; test-auth-gate returned to unit-suite). Prior: 2026-07-27 (merged passes) — `BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC` + `BL-CI-ENV-DEPENDENT-CONFIG-NARROWING` graduated on `feat/ci-dark-descoped-guards` (spec-registration detector + post-run baseline comparator), and `BL-DURATION-TOKENS-EMIT-NO-CSS` graduated on `fix/duration-tokens-emit-no-css` (shipped, alias approach; residual gap filed as `BL-BARE-TRANSITION-NO-DURATION-CLASS`). Same day: three entries that had shipped but were annotated terminal in place graduated: `BL-E2E-LIFECYCLE-INACTIVE-NOTICE-RETIRED` (PR #615, `feat/ci-lifecycle-gallery`), `BL-HEADER-PROBE-RESIDUAL-VACUITY` (PR #617, `test/header-probe-residual-closure`; its one live follow-up now rides `BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT`), and `BL-AGENDA-PERDAY-VIEWER-FILTER` (PR #610, `feat/agenda-perday-viewer-fold`). Also corrected in place: `BL-HEADER-FONT-FALLBACK-WRAP`'s "no `next/font` import anywhere" claim was wrong at filing — the crew show layout has imported Inter since 2026-05-03; the admin tree is what loads nothing. `BL-CI-STALE-BRANCH-PROTECTION-COMMENT` stays deliberately (sub-entry of a still-open parent; rationale in the entry). The graduation meta-test now also rejects terminal HEADINGS and SHIPPED status lines — the shapes this pass caught slipping past it. Prior: 2026-07-26 — `BL-CHILDLESS-GROWABLE-STATIC-GUARD` graduated on `feat/childless-growable-static-guard`; 2026-07-25 — the three phantom-gap items plus 7 terminal-status entries; 2026-07-24 — 30 entries. Prior mainline reconciliation (merged into this branch 2026-07-31): 2026-07-31 (`feat/sheet-icon-link-affordance-class` close-out, over the 2026-07-27 three-parallel-pass merge base) — mainline #628 graduated three in-place-terminal entries (`BL-E2E-LIFECYCLE-INACTIVE-NOTICE-RETIRED` PR #615, `BL-HEADER-PROBE-RESIDUAL-VACUITY` PR #617 — its one live follow-up rides `BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT` — and `BL-AGENDA-PERDAY-VIEWER-FILTER` PR #610), corrected `BL-HEADER-FONT-FALLBACK-WRAP`'s "no `next/font` import anywhere" claim, kept `BL-CI-STALE-BRANCH-PROTECTION-COMMENT` deliberately, and hardened the graduation meta-test against terminal HEADINGS and SHIPPED status lines. `fix/duration-tokens-emit-no-css` graduated `BL-DURATION-TOKENS-EMIT-NO-CSS` (alias approach; residual gap filed as `BL-BARE-TRANSITION-NO-DURATION-CLASS`). `feat/ci-dark-descoped-guards` graduated `BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC` and `BL-CI-ENV-DEPENDENT-CONFIG-NARROWING`. `feat/sheet-icon-link-affordance-class` independently graduated the same three plus its own closure `BL-HEADER-LINK-AFFORDANCE-CLASS`, widening the meta-test to heading-suffix and opening-line spellings (SUPERSEDED/DONE in the terminal set); the merge deduplicated the double-graduated archive copies and reverted this branch's graduation of `BL-CI-STALE-BRANCH-PROTECTION-COMMENT` per #628's deliberate keep. Same branch, at close-out: `BL-HEADER-PILL-LINK-TOUCH-BUFFER` and `BL-HEADER-SUBBLOCK-HIERARCHY-WIDE` graduated — both resolved by the feature itself (asymmetric-overlay 2px pill buffer; linkless sub-block floor drop at every width). NOTE (2026-07-31 split, owner-directed): nineteen adversarial-review rounds of additional guard hardening (ledger container/normalization/field lanes; containment extension/symlink/URL/anchor censuses) were split OUT of the shipping PR to `test/guard-hardening-followup` (snapshot at `a1cfce98d`), chartered under `BL-LEDGER-GUARD-MDAST-REWRITE`. Prior: 2026-07-26 — `BL-CHILDLESS-GROWABLE-STATIC-GUARD`; 2026-07-25 — the three phantom-gap items plus 7 terminal-status entries; 2026-07-24 — 30 entries. Prior: 2026-08-01 — `fix/focus-ring-a11y-pass` graduated the five Cluster A mechanical rows (`BL-FOCUS-RING-CONTRAST`, `BL-PICKER-ROW-RING-OFFSET-BACKDROP`, `BL-IGNORED-SUMMARY-TAP-TARGET`, `BL-DEV-SWITCHER-BAR-MOBILE-WIDTH`, `BL-BARE-TRANSITION-NO-DURATION-CLASS`) — light focus-ring `#E06000`, info-bg nudge, tree-wide offset sweep + structural guard, default-duration alias, tap floor, switcher width. The two announcement rows (`BL-DESTRUCT-ARM-STATE-ANNOUNCEMENTS`, `BL-SHAREHUB-REMOTE-ROTATE-ANNOUNCE`) stay OPEN for the follow-up spec. Prior: 2026-08-01 — `fix/judgment-chip-newtab-suffix` (PR #640) graduated `BL-HEADER-JUDGMENT-CHIP-CONTRAST` (border-strong outline, owner-ratified Option A) and `BL-NEWTAB-DOUBLE-ANNOUNCE-USER-DATA` (`stripNewTabSuffix` value-position dedup at the three interpolated labels). Prior: 2026-07-31 — `BL-HARNESS-RESOLVER-POLICY` + `BL-HARNESS-PACKLIST-SERVER-GRAPH` graduated on `feat/ci-dark-directive-resolver` (PR-C of the ci-dark descoped close-out: shared `"use server"` directive plugin — a parse-based, throw-on-call resolver — consolidated across both harness bundlers, and `packlist-rescan-recovery` returned to the standalone config under it). Prior: 2026-07-31 — `BL-CI-VITEST-EXCLUSION-COVERAGE` graduated on `feat/ci-dark-vitest-exclusion` (PR-B of the ci-dark descoped close-out: ENV_BOUND_COVERAGE_REGISTRY + run-excluded execution oracle; test-auth-gate returned to unit-suite). Prior: 2026-07-27 (merged passes) — `BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC` + `BL-CI-ENV-DEPENDENT-CONFIG-NARROWING` graduated on `feat/ci-dark-descoped-guards` (spec-registration detector + post-run baseline comparator), and `BL-DURATION-TOKENS-EMIT-NO-CSS` graduated on `fix/duration-tokens-emit-no-css` (shipped, alias approach; residual gap filed as `BL-BARE-TRANSITION-NO-DURATION-CLASS`). Same day: three entries that had shipped but were annotated terminal in place graduated: `BL-E2E-LIFECYCLE-INACTIVE-NOTICE-RETIRED` (PR #615, `feat/ci-lifecycle-gallery`), `BL-HEADER-PROBE-RESIDUAL-VACUITY` (PR #617, `test/header-probe-residual-closure`; its one live follow-up now rides `BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT`), and `BL-AGENDA-PERDAY-VIEWER-FILTER` (PR #610, `feat/agenda-perday-viewer-fold`). Also corrected in place: `BL-HEADER-FONT-FALLBACK-WRAP`'s "no `next/font` import anywhere" claim was wrong at filing — the crew show layout has imported Inter since 2026-05-03; the admin tree is what loads nothing. `BL-CI-STALE-BRANCH-PROTECTION-COMMENT` stays deliberately (sub-entry of a still-open parent; rationale in the entry). The graduation meta-test now also rejects terminal HEADINGS and SHIPPED status lines — the shapes this pass caught slipping past it. Prior: 2026-07-26 — `BL-CHILDLESS-GROWABLE-STATIC-GUARD` graduated on `feat/childless-growable-static-guard`; 2026-07-25 — the three phantom-gap items plus 7 terminal-status entries; 2026-07-24 — 30 entries. Prior mainline reconciliation (merged into this branch 2026-07-31): 2026-07-31 (`feat/sheet-icon-link-affordance-class` close-out, over the 2026-07-27 three-parallel-pass merge base) — mainline #628 graduated three in-place-terminal entries (`BL-E2E-LIFECYCLE-INACTIVE-NOTICE-RETIRED` PR #615, `BL-HEADER-PROBE-RESIDUAL-VACUITY` PR #617 — its one live follow-up rides `BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT` — and `BL-AGENDA-PERDAY-VIEWER-FILTER` PR #610), corrected `BL-HEADER-FONT-FALLBACK-WRAP`'s "no `next/font` import anywhere" claim, kept `BL-CI-STALE-BRANCH-PROTECTION-COMMENT` deliberately, and hardened the graduation meta-test against terminal HEADINGS and SHIPPED status lines. `fix/duration-tokens-emit-no-css` graduated `BL-DURATION-TOKENS-EMIT-NO-CSS` (alias approach; residual gap filed as `BL-BARE-TRANSITION-NO-DURATION-CLASS`). `feat/ci-dark-descoped-guards` graduated `BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC` and `BL-CI-ENV-DEPENDENT-CONFIG-NARROWING`. `feat/sheet-icon-link-affordance-class` independently graduated the same three plus its own closure `BL-HEADER-LINK-AFFORDANCE-CLASS`, widening the meta-test to heading-suffix and opening-line spellings (SUPERSEDED/DONE in the terminal set); the merge deduplicated the double-graduated archive copies and reverted this branch's graduation of `BL-CI-STALE-BRANCH-PROTECTION-COMMENT` per #628's deliberate keep. Same branch, at close-out: `BL-HEADER-PILL-LINK-TOUCH-BUFFER` and `BL-HEADER-SUBBLOCK-HIERARCHY-WIDE` graduated — both resolved by the feature itself (asymmetric-overlay 2px pill buffer; linkless sub-block floor drop at every width). NOTE (2026-07-31 split, owner-directed): nineteen adversarial-review rounds of additional guard hardening (ledger container/normalization/field lanes; containment extension/symlink/URL/anchor censuses) were split OUT of the shipping PR to `test/guard-hardening-followup` (snapshot at `a1cfce98d`), chartered under `BL-LEDGER-GUARD-MDAST-REWRITE`. Prior: 2026-07-26 — `BL-CHILDLESS-GROWABLE-STATIC-GUARD`; 2026-07-25 — the three phantom-gap items plus 7 terminal-status entries; 2026-07-24 — 30 entries.

---

## BL-ADOPTION-PIN-REACHABILITY-BLIND — the shared-helper adoption guard cannot prove LIVE-PATH use

Surfaced by cross-model review of `fix/admin-popover-overlay-cluster` (2026-08-02, PR #658),
across three rounds of probes against the shipped guard.

`tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts` pins that each consumer
imports the shared helper, CALLS it (resolved through the TypeScript type checker, not by
name), declares no local copy by name or by shape, and — for coalescer rows — cancels the
instance it schedules. Rules (i)-(viii) are nonetheless **reachability-blind by
construction**: none of them connects the imported helper's RESULT to live behaviour. Two
evasion families were demonstrated, the second surviving a round of tightening:

1. **Executed decoy.** `createRafCoalescer(() => {}).cancel()` on a throwaway instance,
   while a private class handles every real `schedule()`/`cancel()`:

   ```text
   MUTANT HoverHelp executes sharedDecoy create+cancel, but all live
   schedule/cancel behavior uses PrivateCoalescer
   SHIPPED_GUARD_RESULTS 23 passed, 0 failed
   ```

2. **Discarded result.** Call `useFitWithinClip(...)`, drop the returned ref, attach a
   private callback to the node instead:

   ```text
   MUTANT PublishedToggle voids shared ref and attaches a private 1px-cap callback
   SHIPPED_GUARD_RESULTS 23 passed, 0 failed
   ```

Affects all five consumers: `ShareHub`, `HoverHelp`, `PublishedToggle`, `AttentionMenu`,
`ReSyncButton`.

**Accepted, not open.** Closing this statically means dataflow/reachability analysis, which
is not what a meta-test should carry, and two rounds of rule-tightening each invited a new
shape (the per-instance whack-a-mole the class-sweep discipline warns about). The guard's
header states the limit and names the per-consumer BEHAVIOURAL tests that do catch a fork —
`ReSyncButton.test.tsx` "overlay is capped to the room left inside a clipping ancestor",
`PublishedToggle.test.tsx` "the banner is capped against the clip ancestor",
`attentionMenu.test.tsx`'s capped-scroller case, the two HoverHelp suites, and
shareHubVisualViewport's T-S8/T-S9. The wiring layer and the behaviour layer are meant to be
read together; neither is sufficient alone.

**Filed here because a code comment is not a ledger.** The limit was documented at the guard
(discoverable once you are already reading it) but not where someone greps for known
weaknesses. Its sibling gap `BL-POPOVER-REGISTRY-PER-FILE-AND-TAILWIND-ONLY` went to this
file; this one should have too.

**Only act on this if** a consumer is found to have behaviourally forked despite a green
guard, or the behavioural backstops above are removed or narrowed — the latter is the real
risk, since deleting one silently converts this accepted limit into an uncovered gap.

## BL-POPOVER-REGISTRY-PER-FILE-AND-TAILWIND-ONLY — the anchored-scroller registry is fail-by-default per FILE, and only for the Tailwind idiom

Surfaced by cross-model review of `fix/admin-popover-overlay-cluster` (2026-08-02),
with live probes against the shipped guard. PRE-EXISTING: the cluster tightened the
`fit-within-clip` import assertion and added rows, but did not introduce either gap.

`tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts` compares a set
of detected FILES against the registry's file rows, and `looksLikeAnchoredScroller`
matches Tailwind class idiom in the source text. Two consequences:

1. **Per-file, not per-overlay.** A second, undispositioned overlay added to an
   already-registered file leaves the detected file set unchanged, so the guard stays
   green. Reviewer probe: appending an `UndispositionedSecondOverlay` with
   `className="absolute top-full overflow-y-auto"` to `ShareHub.tsx` gave
   `SUMMARY 15/15 passed; undispositioned overlay appended in already-registered file=true`.
   The same escape exists in all seven registered files.
2. **Tailwind-only recognition.** An overlay written with inline styles
   (`style={{ position: "absolute", top: "100%", overflowY: "auto" }}`) is genuinely an
   anchored scroller but is not detected at all. Reviewer probe:
   `CLASSIFIER inline-style mutant => false` and `SUMMARY 15/15 shipped guard cases passed`.

So a new unsafe overlay can ship undispositioned despite the guard's stated
fail-by-default contract. Fix shape: key the registry by OVERLAY (a stable per-element
marker such as a testid or a declared symbol) rather than by file, and widen the
classifier to computed/inline positioning as well as the class idiom — or state the
limit explicitly in the registry header so the contract stops over-promising.

Not fixed in the cluster that surfaced it: closing it means re-keying an existing
registry and re-dispositioning seven files, which is its own change with its own
review surface.

## BL-CI-OVERLAP-BOOT-WITH-SETUP — run the Supabase boot concurrently with pnpm install (specced, not built)

**Status:** OPEN — spec complete and probe-backed on `chore/ci-overlap-boot-with-setup`; NOT implemented, NOT merged. Read this before restarting: eight adversarial rounds are already sunk into it.

The last unexploited lever on unit-suite wall clock is the ~101s of per-leg FIXED overhead (leg-median; per-leg 89-108s on run 29741812457), of which ~70s is the Supabase boot and ~16s is `pnpm install`. They share no data but run sequentially, so overlapping them should reclaim up to ~16s per leg — roughly 6.5% of a 245s leg.

**What is already established, and is worth keeping:**

- **Probe (run 29743206592, real CI).** A process detached in one step DOES survive into later steps on a GitHub-hosted runner, and a filesystem status marker it publishes IS visible to a later step's shell (worker started 12:42:09, observed 12:42:49, status 7 written and read). `echo N > file` produced 0 empty reads in 400 create/read races. These are durable runner facts.
- **The final design is one step, not a cross-step protocol:** background the bootstrap, capture the PID, run `pnpm install --frozen-lockfile` in the foreground, `wait` on the PID, under `set -euo pipefail`. Native `wait` on a real child makes it fail-closed with no sentinel, no deadline arithmetic, and live log streaming. Adversarial review confirmed this success path correct and the overlap real.
- **Accepted non-goal:** if the install fails, the still-running bootstrap holds the step's stdout pipe and delays the failure report (typically ~70s; the only hard bound is the job's `timeout-minutes: 20`). Correct cleanup needs process-group termination plus a join plus PID-reuse care, and must not interrupt the bootstrap's held-aside-migration restore trap — a large surface for a rare path.

**Why it stopped.** Eight spec rounds without reaching implementation, on a ≤16s gain, with the correctness surface still expanding each round. The final round also caught a factual error in the spec's own write-surface audit: it claimed `pnpm-workspace.yaml`'s `allowBuilds` contained only `@sentry/cli`, when it contains five keys (`@sentry/cli`, `esbuild`, `sharp`, `unrs-resolver` enabled; `simple-git-hooks` deliberately false). The disjointness premise — that concurrent install writes never touch `supabase/` — is probably still true, but it has no audited basis until someone checks those four build scripts.

**If revisited:** start from the single-step design (skip rounds 1-4, which died on a cross-step protocol), redo the write-surface audit against all of `allowBuilds`, and decide up front whether ~16s justifies the failure-path tradeoff. A larger adjacent lever is the boot itself: a pre-baked Postgres image would remove the ~14s schema-init + migration phase, at the cost of a publish pipeline and a staleness contract.

**Provenance:** lifted to `main` 2026-08-01 from `chore/ci-overlap-boot-with-setup`, which was never opened as a PR; the branch remains the source of the underlying spec.

## BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT — promote the visual gate into branch protection's required set after soak

**Status:** OPEN · **Severity:** low · **Class:** CI wiring · **Filed:** 2026-07-27 (reconciliation — the one live follow-up carried out of `BL-HEADER-PROBE-RESIDUAL-VACUITY` when it graduated to `BACKLOG-archive.md`)

`section-header-visual` (`.github/workflows/section-header-visual.yml`) runs as an unfiltered PR gate, but it is NOT in branch protection's required-context set, so a red run is a visible failing check that does not block merge at the GitHub layer. Deliberate at ship time: the spec ratifies promotion as a follow-up after observed-green runs, not part of that branch (`docs/superpowers/specs/2026-07-26-header-probe-residual-closure-design.md` §1.1). Same class as the required-set note in `BL-E2E-LIFECYCLE-SPECS-CI-DARK`: an owner GitHub-settings action, not repo code — the live required set held twelve contexts when last measured (2026-07-26). **Trigger:** observed-green soak of `section-header-visual` on merged PRs, then the owner adds the context.

## BL-HEADER-FONT-FALLBACK-WRAP — the admin tree loads no Inter, so a bare-Linux client gets a much wider fallback

**Filed:** 2026-07-26 (branch `feat/section-header-rebuild-phantom-spacers`, surfaced by real CI). **Class:** typography robustness. **Effort:** S (load the font) or M (make the affected rows font-independent).

`app/globals.css` sets `--font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Helvetica Neue", sans-serif`, and **nothing on the admin tree loads Inter** — no `@font-face` rule, no `next/font` import under `app/admin/` or the root layout. (CORRECTED 2026-07-27, reconciliation: the original claim "no `next/font` import anywhere" was wrong at filing — `app/show/[slug]/layout.tsx:31-37` has imported Inter via `next/font/google` since `8f4ad9c12`, 2026-05-03. That import defines `--font-inter` on the crew page shell, but nothing consumes `var(--font-inter)`, and `--font-sans` names the literal family `"Inter"`, which `next/font`'s hashed `@font-face` family name does not obviously satisfy — whether crew pages actually render Inter is UNVERIFIED; browser-check it when picking this up. The CI measurement below was on the admin-modal harness, which the crew import does not touch.) Every named entry after it is a system face, so a client with none of them (Chrome on a bare Linux install, which is what a GitHub Actions runner is) falls through to generic `sans-serif` and gets DejaVu Sans. DejaVu is substantially wider than SF Pro.

Measured consequence: the event-detail group title "Wardrobe & key moments" fills the 240px narrowest real row unaided under DejaVu, so it wraps to two lines (33.59px vs 16.8px) where SF Pro leaves 22.94px of room for the decorative rule beside it. The `min-w-4` floor that is free on every targeted device is not free there.

**This is narrow, not theoretical.** Every device the product actually targets resolves an earlier entry in the stack — iOS/macOS `-apple-system`, Android `ui-sans-serif`, Windows `Segoe UI` — so no crew member or admin sees the DejaVu rendering. It is reachable only on a desktop Linux browser lacking all six named faces.

**Work, either of:** (a) self-host the intended face and add an `@font-face` (or a `next/font` import — the crew layout's is the template, but note it must actually be BOUND to `--font-sans`, which the existing one is not), which makes every measurement in this repo font-deterministic and retires a whole class of local-vs-CI divergence; or (b) leave the stack alone and make the affected rows font-independent — `whitespace-nowrap` plus truncation on the closed-set group titles, so a wide fallback shortens the label instead of adding a line.

**Do not "fix" this by widening the tolerance in `tests/e2e/section-header-layout.layout.spec.ts`.** That test pins its own font to the Arial / Liberation Sans metric-compatible pair for exactly one measurement, deliberately and with the reason in a comment, so the floor assertion reads the same on macOS, Windows and the Ubuntu runner. Relaxing it instead would hide this entry's finding.

## Descoped from the CI-dark coverage cluster (2026-07-26) — read before re-attempting any of these

Four items landed here when the cluster descoped them — **designed, built, and measured**, then
descoped after four cross-model review rounds (37 accepted findings, none disputed) on branch
`feat/ci-dark-coverage`. The owner chose to ship the provably-sound subset rather than keep
iterating. One of the four, `BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC`, shipped 2026-07-27 on
`feat/ci-dark-descoped-guards` (with the separately-filed ceiling item
`BL-CI-ENV-DEPENDENT-CONFIG-NARROWING`) and graduated to
[BACKLOG-archive.md](./BACKLOG-archive.md), followed by `BL-CI-VITEST-EXCLUSION-COVERAGE` on `feat/ci-dark-vitest-exclusion` (2026-07-31, PR-B: the runner-as-oracle registry) and `BL-PG-CRON-PER-CASE-QUERY-ATTRIBUTION` on `test/pg-cron-mechanism-sabotage-probe` (2026-08-01, mechanism-sabotage probes); the one below remains open.

**Do not re-derive this analysis.** Each entry records what was tried and the measurement that
killed it. The reason each is open is that the obvious approach was implemented and shown not to
work, not that nobody thought about it. Full write-up with metafile traces and per-entry bundle
sizes: `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md` §10.

### BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE — a fast server action can leave the Published toggle stuck pending on WebKit

**Status:** OPEN · **Severity:** MEDIUM (real-user exposure unquantified; measured 7/10 in a CI loop) · **Class:** upstream framework defect, product exposure · **Filed:** 2026-07-26 (BL-E2E-LIFECYCLE-TRANSITIONS-ROUNDTRIP-FLAKE measurement work)

**Measured, not theorized** (CI run 30233337644 retry1 trace + baseline loop 30235889083, 7/10 samples): `setShowPublishedAction` POSTs, the server commits and responds 200 `{ok:true}` in ~230ms with the re-rendered `published:false` tree in the response body, the page stays responsive — and the `PublishedToggle` switch sits `disabled aria-busy="true"` with the OLD `aria-checked` indefinitely. `await setPublished(...)` inside the form action never resolves, so `useFormStatus().pending` never clears and `router.refresh()` is never reached. React never commits the applied tree (React 19 replay-loss class; nearest public report vercel/next.js discussion 88767). Vendored React is identical through next 16.2.12 (`19.3.0-canary-3f0b9e61-20260317`), so no patch-bump fix exists today.

**User-visible shape if it bites in production:** an admin flips Published on mobile Safari, the switch greys out and spins forever; the mutation HAS committed (crew link state is already flipped). A reload shows truth. All observations so far are Playwright WebKit under CI; not yet reproduced in desktop Chromium or a real handheld Safari — quantifying that is the first step if this is picked up.

**Watch signals:** `[wedge-recovery]` lines in the lifecycle-transitions e2e output (tier=nudge/reload counts per run), and admin reports of a stuck Published switch. **Candidate mitigations if real-user reports arrive:** a client-side watchdog in `PublishedToggle.formAction` (`Promise.race` the action against a generous timeout, then `router.refresh()` — the mutation is NOT retried, only the read is), or an upstream React/Next bump once the replay fix ships in a stable vendored canary.

### BL-CI-STALE-BRANCH-PROTECTION-COMMENT — one-line docs fix — ✅ RESOLVED (2026-07-26, PR2 of the CI-dark cluster)

**Resolved.** The comment is corrected in `tests/ci/_metaE2eWorkflowCoverage.test.ts`, and the same stale claim was swept from this file's `BL-E2E-LIFECYCLE-SPECS-CI-DARK` entry — it appeared in two places, not one. Kept here rather than graduated to the archive because it is a sub-entry of a still-open parent section, not a standalone item. Original text below for provenance.

`tests/ci/_metaE2eWorkflowCoverage.test.ts:11` states branch protection "deliberately requires ONLY
the `quality` context". Measured live 2026-07-26: `main` requires **twelve** contexts (`quality`,
`unit-suite`, `x1`–`x6`, `validation-schema-parity`, `affordance-matrix-parity`,
`postgrest-dml-lockdown`, `traceability-audit`), and `scripts/generate-traceability.ts` resolves a
third, different list of eight. Any reasoning that treats the repo's e2e jobs as "the only required
check is quality" is wrong — notably, edits to `unit-suite` DO touch a merge-blocking context.

## BL-CI-PARALLEL-DB-FALLBACK-AUDIT — re-run the closed-port protocol across the parallel project

**Status:** OPEN, raised by adversarial review of PR #517 (finding 2).

The `unit-suite-nodb` job proves that no parallel-project file FAILS without a database. That is weaker than "touches no database": a test that swallows a connection error, skips on unavailability, returns early from a setup hook, or takes an untaken conditional DB path will pass while exercising a FALLBACK rather than the DB-backed behavior it was written to check. The no-DB job repeats that same observation every PR, so it shares the blind spot — it is a regression detector, not a proof.

The stronger protocol already exists and was used for the original 2026-06-23 partition: point every Supabase endpoint at a CLOSED PORT rather than simply omitting the database. A refused connection surfaces swallowed-error paths that an absent server does not.

**Work:** re-run that closed-port protocol across all ~691 current parallel-project files, and compare per-file assertion COUNTS against a run with the database present. A file whose assertion count drops is silently degrading. Any found either move to serial or get an explicit note saying the fallback path is what is under test.

## BL-CI-RECLASSIFY-PARALLEL-STABILITY — revive the serial→parallel reclassification only with a concurrency-stability + clean-wall proof

**Filed:** 2026-07-20 (arc SHELVED). **Class:** CI perf. **Effort:** L (structural stability + multi-run measurement).

The DB-free serial→parallel reclassification (PR #528, closed unmerged) is correctness-verified but was shelved: moving ~527 files into the parallel project raises per-shard concurrency, and timing-sensitive moved files (e.g. `tests/admin/_metaInfraContract.test.ts`) starve past the 5s test timeout under CI load — candidate CI run 1 green, run 2 red on identical code. A required gate cannot flake, and the class is load-dependent (not fully enumerable up front). The wall-clock win was also unproven (~17s in contention-noisy samples, under the spec's 30s gate). Seventh lever this program has rejected on the local-passes-CI-fails pattern.

**Reusable asset:** the DB-touch probe + static `DB_BINDING_SIGNALS` matcher (branches `spike/db-touch-instrumentation`, `perf/ci-reclassify-db-free-serial`). Retrospective: `docs/superpowers/specs/ci/2026-07-20-serial-parallel-reclassification-retrospective.md`.

**Do NOT re-attempt the move without, in this order:** (1) solve criterion-3 at CI scale structurally — cap the parallel project's per-leg worker concurrency (`poolOptions.maxWorkers`) or raise the parallel `testTimeout` — and prove stability across ≥5 consecutive green CI runs; (2) demonstrate a clean ≥30s wall win with sequential, non-contending measurements (one CI run at a time). Absent both, the correctness tooling can stand alone (e.g. a nightly DB-drift audit) without the move.

**Status:** open (shelved).

---

## BL-MODAL-REALTIME-UPDATED-CUE — freshness cue near the published modal's action clusters

**Filed:** 2026-07-24 (retroactive — deferred in PR #505's body 2026-07-20, never filed) · **Class:** UI refinement · **Effort:** S

Impeccable P3 from `admin-modal-realtime-refresh`: an optional "updated just now" cue near the modal's action clusters, so a realtime-driven change is attributable rather than appearing as content silently shifting under the cursor. Deferred as a future refinement — the spec ratifies the silent-by-design posture, so nothing requires it.

**Un-defer signal (weak, hence backlog not DEFERRED.md):** a user reporting that modal content changed without explanation. Note the tension with the ratified posture — adding a cue is a spec decision, not a polish pass.

**Status:** open.

## BL-REALTIME-BROADCAST-FRAME-DROP-WATCH — ~9% local broadcast-frame loss on a healthy socket

**Filed:** 2026-07-24 (retroactive — recorded in PR #505's residuals 2026-07-20, never filed) · **Class:** observability watch item · **Effort:** S (read CI history) to M (if real)

PR #505 measured local realtime silently dropping ~9% of broadcast frames on an otherwise healthy socket; absorbed by CI runner retries and explicitly NOT a code defect of that diff. Filed as a watch item so the observation is not lost: if the drop rate is an artifact of the local stack it should disappear against validation/prod, and if it does not, subscriber code that assumes every broadcast arrives needs a reconcile-on-focus fallback.

**Work:** sample the realtime-dependent e2e/CI history for retry frequency before deciding whether there is anything to fix.

**Status:** open (watch).

## BL-MUTATION-LEDGER-AUTOCORRECT-DRIFT — refresh known-holes fingerprints after parser autocorrect field (2026-07-22)

The `autocorrect` field populated at all 13 parser producers (`7295d794c`, merged via the
warning-card-identity-placement chain, PR #543-era) changes parse output for corpus fixtures whose
mutated cells produce autocorrect-bearing warnings, so the redacted parse-output fingerprints in
`tests/parser/mutation/knownHoles.ts` drift. Nightly run 29907734946 (2026-07-22): DRIFTED
fingerprint rows across 7 shards — SAME siteIds, fingerprint-only, zero NEW siteIds, zero fixed
holes — the benign class per the 2026-07-09 triage discipline (see BL-MUTATION-LEDGER-ROLETOKEN-DRIFT
and BL-MUTATION-LEDGER-REFRESH-AMBIGUITY in `BACKLOG-archive.md` for the identical prior instances and
their resolution mechanics). The nightly `mutation-harness`
workflow is non-required and path-filtered to `tests/parser/mutation/**`, so it gates no PR.
**Refresh:** `VITEST_INCLUDE_MUTATION_HARNESS=1 COLLECT_MUTATION_ALARMS=<dir> pnpm exec vitest run
--project mutation`, then surgical re-bless via `reconcileLedger` (drift bucket only). Trigger: the
next mutation-file-touching PR or the next post-merge nightly triage.

---

## BL-PG-CRON-COVERAGE-UNRUN — the live pg-cron introspection suite runs in no CI workflow

**Status:** PARTIALLY CLOSED 2026-07-26 (PR3 of the CI-dark coverage cluster) · **Severity:** medium · **Surfaced:** 2026-07-25, whole-diff review round 17

**What closed.** The suite now runs in `unit-suite-db` (removed from `ENV_BOUND_EXCLUDES`, which applied only under `VITEST_EXCLUDE_ENV_BOUND=1` — so it ran locally and was dark in CI only), and against the persistent validation project via the new `pg-cron-validation-parity` job in `x-audits.yml`. Under CI an unreachable `psql` now throws instead of skipping, and a live-case counter refuses a run where zero live cases executed — measured before: exit 0 with "2 passed | 6 skipped", asserting nothing.

**What stays open:** the per-job smoke-test residue (spec §9). The target-binding ceiling this entry used to inherit closed 2026-07-27: the connected cluster's `system_identifier` is now pinned and re-proven by a DO guard on every query's own connection (`feat/driveid-guard-cluster`, `docs/superpowers/specs/data-quality/2026-07-26-driveid-guard-cluster-design.md` §3.1) — a DSN substring check proves nothing, and no longer has to.

**Original text (SUPERSEDED 2026-07-26 — the exclusion and the "nothing runs it" finding are both fixed; see the status note above):**

`tests/cross-cutting/pg-cron-coverage.test.ts` is the only test that introspects the live `cron.job` table — job set, schedules, `active` flags, the pg_net extension, the vault secret. It was excluded from `unit-suite` via `ENV_BOUND_EXCLUDES` (`vitest.projects.ts`), and the comment there said it "runs against the validation project (like validation-schema-parity)". **Nothing ran it.** `pnpm test:audit:x6-pg-cron-pivot` runs four different files, and no other workflow references it; `grep -rl pg-cron-coverage .github/workflows/` returns only the `unit-suite.yml` comment that explains the exclusion.

So every assertion in it is dead in CI, including the `active=true` gate that exists specifically because a disabled job would otherwise satisfy the name/schedule/command checks.

**Fix:** give it a job in `x-audits.yml` with `PG_CRON_COVERAGE_TARGET=validation` and `TEST_DATABASE_URL` pointing at the validation project, alongside `validation-schema-parity` which already has that shape. Then correct the stale comment in `unit-suite.yml`.

**Wiring it up is necessary but not sufficient** (whole-diff R18). Every assertion this suite makes about `cron.job.command` is text matching: PostgreSQL resolves the OUTER `cron.schedule` call but stores the command body verbatim, comments included. A job whose `net.http_get(...)` is commented out, followed by an executable `select 1;`, satisfies the route check, the `net.http_get(` check and the exactly-one-timeout check while issuing no request — and `active=true` does not help, because the job runs, it just does nothing. Proving a job actually fires needs a smoke test per job; only the sync path has one today. Track that with this entry rather than by adding more text assertions.

## BL-WATCH-PROMOTION-ACTIVATION-RACE — a folder switch racing a subscriber can leave one stale active channel

**Status:** OPEN · **Severity:** low (bounded to one lease; no data loss) · **Surfaced:** 2026-07-26, watch-renewal-lifecycle spec rounds 2-5

`promoteSettings` supersedes the prior folder's `active` channels and orphans its `pending` ones inside the settings-swap transaction, and `activatePending` refuses a zero-row activation. That closes every window where the pending row exists when promotion runs. It does NOT close the window where a subscriber reads the old configured folder, promotion commits, and the subscriber then inserts and activates its pending row — nor the one where the subscriber commits its activation while promotion is still uncommitted, since under READ COMMITTED it reads the previous committed folder.

Three review rounds tried to close this with an `app_settings` predicate inside `activatePending`; each attempt failed for a different reason, the last being that an ordinary subquery cannot see an uncommitted promotion. **A correct fix requires serialization** between the promotion transaction and concurrent subscribers — an advisory lock on the settings row, or `select … for update` — which collides with the ratified "no advisory locks on any watch surface" constraint (that constraint exists because a second holder on this hashkey is the M5-R20 nested-holder class). So this is a lock-topology change and needs its own design.

**Bounded, not open-ended:** refresh renews only the configured folder and renews nothing when the folder read fails, so a stale row is never renewed under any branch. It dies at its own `expires_at` within `WATCH_TTL_MS`, is reaped to `expired`, and is GC'd. Worst case is up to 24h of webhook deliveries for a folder nobody watches — the same class that was PERMANENT before that work landed.

**Amends AC-6.18**, which is otherwise absolute. Design context: `docs/superpowers/specs/observability/2026-07-26-watch-renewal-lifecycle-design.md` §3.2.4.

## BL-SERVER-ACTION-ORIGIN-GATE — same-origin gate for the crew guest Server Action

**Status:** OPEN · **Severity:** low (logout CSRF; no read, no escalation) · **Surfaced:** `fix/picker-flow-app-bugs` review rounds 1-3 (2026-07-25), descoped rather than guessed at

`clearIdentityAndSkip` (`lib/auth/picker/clearIdentity.ts`) is an exported Server Action that ends the Supabase session on the calling browser and deletes one picker entry from the `__Host-fxav_picker` envelope. It relies on Next's built-in Server Action origin validation, which rejects a mismatched `Origin` but **permits a request that carries no `Origin` header at all**. So a cross-site POST arriving without that header is not refused by anything the app adds.

**The residual, sized.** An attacker who forces the call signs the victim's browser out of this app on that device and removes one supplied show id from their picker envelope. There is no response data returned to the caller, no privilege gained, and no cross-account effect — with `scope: "local"` it does not even touch the victim's other devices. It is logout CSRF, in an app whose sign-out is a visible button. That is why it was filed rather than treated as blocking.

**Why it is not already fixed.** A hand-rolled gate was specified twice and failed review both times. The route-handler precedent (`app/auth/sign-out/route.ts:78-87`) reads `request.nextUrl.origin`, which a Server Action has no equivalent of, so the action must compose the expected origin from headers — `x-forwarded-proto`, `x-forwarded-host`, `host`. That is only sound behind a **trusted proxy** whose overwrite behavior this repo has never established; where a proxy forwards client-supplied values, a spoofed `Origin` plus `x-forwarded-host` pair passes the check. Three consecutive review rounds on one design-correctness vector triggered the prose cap in `docs/agents/spec-self-review.md`: descope, do not patch a fourth time.

**Open decision, and the trigger:** establish the trusted-proxy policy (which headers are authoritative in each deployment, and whether the platform overwrites them), then gate every destructive Server Action on it — not just this one. Pick this up on the next auth security pass, or sooner if a Server Action lands whose forced invocation would do more than log someone out. Reasoning in `docs/superpowers/specs/2026-07-24-picker-flow-app-bugs.md` §4.3a.

---

## BL-PICKER-CLAIMED-ROW-PENDING-STATE — no pending affordance on the claimed-row sign-in control

**Status:** OPEN · **Severity:** low-medium (re-tap risk on venue wifi) · **Surfaced:** impeccable critique of `fix/picker-flow-app-bugs` (2026-07-25), P2

Tapping a claimed roster row (`app/show/[slug]/[shareToken]/_PickerInterstitial.tsx`) is a full GET to `/auth/sign-in` and then on to Google — three or more hops with the row visually inert the whole time. On ballroom wifi a crew member will tap it again. Every other mutating control in the admin surfaces uses `useFormStatus` for this (10+ components), and master spec §16.6 ratifies the "Confirming…" pending idiom.

Not a regression: the control had no pending state before the hidden-input fix either. Deferred rather than folded into that branch because the row is currently rendered by a Server Component, so a pending state needs a new client boundary — a real change to the picker's component topology, not a class tweak. **Fix (when prioritized):** extract the claimed-row control into a client component using `useFormStatus`, matching the disabled + label-swap recipe the admin surfaces already use. Trigger: next crew-page UX pass, or a report of double-tap sign-in loops.

---

## BL-E2E-COVERAGE-SCANNER-EXCLUSION-FILTERS — audit other workflows now that paths-ignore counts as a filter

**Status:** OPEN · **Severity:** low · **Surfaced:** `fix/picker-flow-app-bugs` review round 5 (2026-07-25)

`tests/ci/_workflowCoverageScan.ts` classified a workflow as PR-blocking-capable unless it had a `pull_request.paths` filter, and matched only that spelling — so any workflow using `paths-ignore` was treated as running on every PR when it does not. This branch fixed the matcher (`paths(-ignore)?`) and added a self-test, and re-categorised the two crew-e2e specs as `PATH_GATED_BY_EXCLUSION`.

**What remains:** no other workflow in `.github/workflows/` used `paths-ignore` at the time of the fix, so nothing else changed category. Re-run the audit if one adopts it, and check whether any spec's allowlist row (or absence of one) became inaccurate. **Trigger:** the next workflow that adds a `paths-ignore` filter.

---

## BL-TELEMETRY-FALLBACK-RETRY — the scheduled-job health fallback states the cause but offers no retry

**Status:** OPEN · **Severity:** low (developer-tier surface) · **Surfaced:** #601 impeccable critique (2026-07-25), P1 partially addressed

`app/admin/dev/telemetry/page.tsx:84` now reads "Couldn't load scheduled-job health right now. The jobs are probably still running." — the second sentence landed in the #601 follow-up because the critique was right that the old one-liner named neither a cause nor a recourse at the moment Doug's stress is highest. What it still lacks is the recourse half: there is no retry control, so the only way to re-read is a full page reload.

**Fix (when prioritized):** a retry affordance on the fallback, consistent with `AutoRefreshControl`'s manual-refresh icon-button already on this page (spec §7.1) rather than a new idiom. **Trigger:** the next telemetry pass, or a report of the readout failing in practice.

---

## BL-PARSER-VENUE-TYPO-GENERATOR-SEED-FLAKE — a venue field-alias generator case fails on some seeds

**Status:** OPEN · **Severity:** low · **Surfaced:** full-suite run during `fix/picker-flow-app-bugs` close-out (2026-07-25)

`tests/parser/blocks/venue.test.ts` → `parseVenue — field-label typo recovery (FIELD_LABEL_AUTOCORRECTED)` → `generator: single-edit typos of venue field aliases (≥5 chars) recover` failed inside a whole-suite run, then passed 3/3 whole-file runs (56/56 each) and passed when isolated with `-t`. The generator constructs single-edit typos, so the input set varies per run: some edit lands on a string the recovery does not accept, and the case only fails when that edit is generated.

**Not caused by the branch that found it:** `fix/picker-flow-app-bugs` touches no file under `tests/parser/` or `lib/parser/`, and the test is a pure unit test with no DB coupling.

**What remains:** make the case deterministic or make the recovery cover the edit. Either seed the generator and pin the seed, so a failure is reproducible and a fix is provable, or enumerate the edit classes explicitly instead of sampling. Then decide whether the failing edit is a genuine gap in `FIELD_LABEL_AUTOCORRECTED` recovery — a seed that fails is evidence about the parser, not only about the test. **Reproduce with:** repeated whole-file runs (`pnpm exec vitest run tests/parser/blocks/venue.test.ts`) until it trips; a single run is likely to pass.

**Caveat on the sighting:** the run that caught it was on a box at load 34+ with a sibling session's vitest running, where many unrelated files failed on 5s timeouts. This case is listed separately from that noise because it failed with a substantive assertion rather than a timeout, and because it also failed in a scoped 3-file run.

---

## BL-PICKER-CLEANUP-REVALIDATE-QUERY-VARIANT — `cleanupStaleEntry` revalidates a path the picker is rarely on

**Status:** OPEN · **Severity:** low · **Surfaced:** class-sweep of the `?gate=skip` revalidate defect (2026-07-25)

`lib/auth/picker/cleanupStaleEntry.ts:107` calls `revalidatePath('/show/<slug>/<shareToken>')`. `revalidatePath` takes a path and ignores the query string, and the picker is commonly reached at `?gate=skip`, so that variant's entry is not invalidated. This is the same defect fixed in `_PickerInterstitial`'s select-identity form action, where a roster tap set the cookie and then re-served the picker, leaving the person exactly where they were until a reload.

**Why it is low here, not the same severity.** The intended screen after a stale-entry cleanup IS the picker, so the user is already looking at the right thing — unlike the select case, where the intended screen was the resolved show. `_StaleCleanupAutoSubmit`'s effect has an empty dependency array, so a stale render cannot re-submit in a loop. The worst observable outcome is a cleared stale-entry hint lingering until the next navigation.

**Why it was not fixed alongside the select case:** the fix there is verified by a prod-build e2e (`CI=1` picker-flow, the guest case). The stale path has no equivalent, and shipping an unverified change to a second Server Action to claim a complete sweep would be worse than recording the instance. The comment in `_StaleCleanupAutoSubmit.tsx` now states the caveat rather than the old claim that the user "sees the fresh picker on next render."

**What remains:** decide whether the cleanup action should redirect to the canonical URL like the select action now does, and write a prod-build e2e for one of `epoch_stale | removed_from_roster | identity_invalidated` first so the change is provable. **Trigger:** the next change to the stale-cleanup path, or any report of a stale hint persisting.

---

## BL-DEV-GATE-GALLERY-SPEC-ROT — `attention-modal-gallery.spec.ts` runs nowhere but a dispatch-only gate, and has rotted

> **PARTIAL 2026-07-26 (PR4 of the CI-dark cluster).** `dev-gate-e2e.yml` now carries a DAILY schedule alongside `workflow_dispatch`, so a break is bounded to 24h instead of until someone remembers to dispatch. The ambiguous `getByText(String(n))` locator is FIXED (each count asserted on its own paragraph). The Escape assertion is deliberately UNCHANGED pending a reproduction — the product path was traced and is intact, and weakening an unreproduced assertion is how a real regression gets papered over. Still open because a schedule is not PR-blocking-capable, so the spec keeps its allowlist row.

**Status:** OPEN · **Severity:** medium · **Surfaced:** `fix/picker-flow-app-bugs` Task 13 close-out (2026-07-25)

`tests/e2e/attention-modal-gallery.spec.ts` runs only under the `dev-build` Playwright project (`playwright.config.ts:92`), and `dev-build` runs only in `dev-gate-e2e.yml`, which is `workflow_dispatch`-only. No PR ever triggers it. Its last green run was **2026-07-02**; the only other run since was a failure on 2026-06-22. Dispatching it during this branch's close-out failed two assertions:

- `:398` — `controls.getByText(String(GLOBAL.length), { exact: false })` raises a strict-mode violation, resolving to 2 elements. The substring match means any element in the controls bar containing that digit qualifies.
- `:265` — `await expect(attentionMenu).toHaveCount(0)` after `Escape` times out; the menu does not close the way the spec expects.

**Not caused by the branch that found it.** `fix/picker-flow-app-bugs` touches no file under `components/` or `app/admin/`, and its only `playwright.config.ts` edits are to the `mobile-safari` and `desktop-chromium` matchers — `dev-build` is untouched. Two commits that landed on `main` _after_ the gate's last green run change exactly what these assertions read: `432d8ef06 feat(admin-dev): exclude global-scope tier-1 scenarios from the gallery switcher` (the global-scope set the `:398` count is derived from) and `f4c4bf493 feat(admin): merge the attention panel's three groups into two` (the menu at `:265`). 793 commits touched `components/admin/` in that window.

This is the dark-spec class already recorded for this repo (`feedback_dark_spec_in_unrun_project_rots`, #486): a spec nothing runs stops describing the product, and the cost lands on whoever next dispatches the gate.

**What remains:** two decisions, in order. (1) Repair both assertions against the current UI — the count needs an exact/scoped match rather than a substring, and the menu-close assertion needs to match the post-merge panel behavior. (2) Decide whether the gallery spec belongs in a gate no PR runs at all. If its value is the built `ADMIN_DEV_PANEL_ENABLED=true` artifact, that is a reason for a dedicated project, not a reason to be unreachable; if it can run on the `:3000` baseline, move it somewhere PR CI executes. **Trigger:** the next `dev-gate-e2e.yml` dispatch, which will fail on this until it is fixed.

---

## BL-KNOWN-SECTIONS-WALKER — real auto-drift enforcement for the known-section-header registry

**Status:** OPEN · **Severity:** low (defense-in-depth; today's guard is a hand-maintained pin) · **Class:** TEST-ENFORCEMENT GAP

`tests/parser/_metaKnownSectionsRegistry.test.ts` is documented as a drift guard that keeps `KNOWN_SECTION_HEADERS` (`lib/parser/knownSections.ts`) from falling behind the block parsers, but it only asserts a **hardcoded** `REQUIRED_HEADERS` list ⊆ `KNOWN_SECTION_HEADERS`. Both lists are hand-maintained, so a new block parser whose header is registered in NEITHER list passes CI green and its rows would false-positive `UNKNOWN_SECTION_HEADER`. The docstrings in both files were corrected (audit idx87) to describe the real, narrower guarantee (catches an accidental DELETION of a registered header; does NOT detect a genuinely-new unregistered header).

**Why not fixed now:** a robust, low-false-positive walker over `lib/parser/blocks/*.ts` is not cheaply achievable without a parser refactor. Header detection is heterogeneous — plain uppercase literals (`col0Upper === "VENUE"`), lowercase literals (`label === "hotel stays"`), and **regexes** whose matched header is computed, not a literal (`event.ts` `EVENT_DETAILS_HEADER_RE`, `hotels.ts` `/^HOTEL\s+RESERVATIONS?$/`, `rooms.ts` `gsFieldRe`) — and only `dress.ts`/`client.ts` import from `knownSections.ts`. The block-parser sources are also dense with intentional non-header uppercase literals ("NAME", "PHONE", "LED", "TRAVEL", "FRIDAY", "II", "N/A", warning codes), so a naive "every uppercase literal must be registered" walker would need a large hand-maintained exclusion list — the same drift-prone artifact this would replace.

**Fix (when prioritized):** route ALL section-header detection through a single shared, introspectable constant/helper (e.g. a per-parser exported `SECTION_HEADERS` const the parsers match against), then have the meta-test import each parser's constant and assert it ⊆ `KNOWN_SECTION_HEADERS`. Add a proof test that an unregistered header fails. This closes the class structurally instead of by hand-maintained parallel lists.

---

## BL-NULLCODE-STAMP-BATCH-2 residuals (2026-07-03)

Deferred out of the forensic code-stamping batch (`docs/superpowers/specs/observability/2026-07-03-nullcode-forensic-batch2-design.md` §9) — separate user-facing / alerting surfaces beyond the pure log-code enrichment.

**Heading caveat:** only the first two items (`BL-SCAN-SSE-BODY-NULL-CODE`, `BL-PICKER-TAMPER-ADMIN-ALERT`) actually came out of that batch. The rest accreted under this heading afterwards from unrelated 2026-07-04+ work (agenda visibility, quiet-link a11y, alert-link e2e, health-resolve lockdown, Step-3 impeccable) and are grouped here by filing date, not by subject. Read each item on its own; the heading is not a topic.

**Sweep status (2026-07-24/25).** Every item below was re-verified against live code, and citations that had rotted were corrected in place — several were badly stale (`AlertBanner.tsx` deleted, `PerShowAlertSection.tsx` deleted, a 9-code registry that is now 20, line numbers shifted). One item closed as obsolete (`BL-WATCH-ERROR-MESSAGE-RAW-DIAGNOSTIC`, since graduated to `BACKLOG-archive.md`). **Four** cross-model review rounds then caught further errors in the sweep itself, so treat the corrected text as verified but not sacred. The misses: a `grep -l` that matched a comment instead of a consumer; a nonexistent `shows.last_error_message`; a literal-attribute census that undercounted a dynamically-spread family by four; a "no live render exists" claim contradicted by an existing seeded e2e path; several citations pointing at an import, comment, JSDoc, or projection string rather than the executable binding; a component path copied from a review without resolving its directory; and a route prescription naming three renderers where the same section had already established four. **When picking up any item here, re-verify its citations before acting on them** — that is the whole lesson of this section. Working order for the rest: ~~PR2 `BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y`~~ (CLOSED, PR #592), ~~PR3 `BL-AGENDA-PERDAY-VIEWER-FILTER`~~ (CLOSED, PR #610), ~~PR4 `BL-SCAN-SSE-BODY-NULL-CODE`~~ (CLOSED, PR #621), ~~PR5 `BL-PICKER-TAMPER-ADMIN-ALERT`~~ (CLOSED, PR #623), ~~PR6 `BL-ALERT-ACTION-LINKS-E2E`~~ (CLOSED, PR #624 — the residual-sweep working order is COMPLETE). `BL-HEALTH-RESOLVE-DB-LOCKDOWN` stays an accepted risk, deliberately and not by omission. `BL-STEP3-IMPECCABLE-LIVE-RENDER` was unscheduled here and SHIPPED 2026-08-02 on `test/step3-live-render-cluster` (graduated to `BACKLOG-archive.md`).

### BL-AGENDA-PROSE-SECOND-DAY — a day label can name a second day in free prose

**Status:** OPEN — known limit, accepted in PR #610 review R6 · **Severity:** very low · **Class:** FEATURE REACH

`isAmbiguousLabel` (`lib/crew/agendaViewerDays.ts`) fires on SPECIFIC day-shaped signals — a second
date, a second weekday, a `Day N` count, a plural span, a spoken ordinal — judged by both count and
position. It does not require the rest of the label to be recognised, so free prose passes. Verified
still true at PR #610 close-out, after the rule was rewritten three times:

    "Tuesday, May 5, 2026 and the following day"   folds as a plain May 5 row
    "Tuesday, May 5, 2026 plus the next day"       folds
    "Tuesday, May 5, 2026 (two-day block)"         folds

A viewer assigned May 6 loses that row if a separate May 6 row exists.

**Why not closed.** A true whitelist — accepting only a remainder the code can parse — would reject
every heading carrying a venue, track, or session name, which is most real headings. Review R6
measured the over-fire side of that trade directly: month PREFIXES matched Marriott, Marketing,
Junior, Novel, Decision, Augusta and Octagon, which would have disabled folding for whole
extractions. The rule is deliberately positioned as the strictest thing that does not break ordinary
labels.

**Closed already, mechanically** — eleven distinct forms across rounds R2-R10, listed so nobody
re-reports one as new: a second full date; a second weekday name; an ordinal ("the 6th"); a
month-day without a year ("/ May 6"); the same month-day in two years, in ANY pairing of shapes;
slash, ISO and day-first dates; two ordinal-position phrases ("Day 1 / Day 2"); a plural day span
("Days 1-2"); the `Sat` abbreviation; and every one of those in LEADING position as well as
trailing. What remains is prose that names a day without any of those tokens.

**Fix (when prioritized):** only worth it if real corpus labels ever carry this prose. Check the
6-PDF corpus first; today every label there is a clean single date.

### BL-PICKER-BOOTSTRAP-NEXT-QUERY-REJECTED — a `next` carrying a query string fails the bootstrap

**Status:** OPEN — measured on `test/agenda-fold-seeded-e2e` (2026-08-02) · **Severity:** low · **Class:** AUTH UX

A Google session that matches a crew row with no picker-cookie entry yet resolves to
`needs_picker_bootstrap` and redirects through `/api/auth/picker-bootstrap`. When the `next` it
carries has a query string — e.g. the deep link `/show/<slug>/<token>?s=schedule`, which is exactly
what a crew member gets from a section link — the handler does not land back on the show and renders
"Sign-in unavailable / Sign-in landed somewhere we don't recognize." Measured on BOTH engines
(Chromium and WebKit), so it is not a cookie-storage artifact: the bare URL bootstraps fine and the
same URL with `?s=schedule` does not.

**Blast radius today.** First contact only, and only on a deep link: once the cookie exists the
query rides along normally. A crew member who hits it can recover by opening the bare show link, so
the effect is a confusing dead end rather than lost access.

**Worked around, not fixed, in e2e.** `stage-restricted-crew-schedule.spec.ts` bootstraps on the
bare URL and re-navigates with `?s=schedule`. That documents the limit; it does not close it.

**Fix (when prioritized):** decide whether the bootstrap should preserve the `next` query (probably)
or strip it and redirect to the canonical show URL, then pin the chosen behavior with a route test
covering a query-bearing `next`.

### BL-AGENDA-PERLINK-COMPLETENESS — date-partitioned multi-PDF agendas never fold

**Status:** OPEN — surfaced by PR #610 review R5 (MEDIUM) · **Severity:** low · **Class:** FEATURE REACH

`visibleAgendaDaysForViewer` requires ONE link to locate EVERY date the viewer is assigned before it
will fold anything (`located.size === R.size`, with `R` the show-wide viewer date set). When a show
publishes several agenda PDFs partitioned by date — link A covering May 5+7, link B covering May 6+8,
viewer assigned May 5+6 — each link locates one of two and both fail open. Folding is therefore
systematically disabled for that shape even though each link's own rows are completely identifiable.

**Deliberately not changed in #610.** Completeness is show-wide precisely because loosening it is what
produced six separate fold-the-viewer's-day defects across five review rounds. Narrowing it to "this
link's own rows are identifiable AND it located at least one viewer date" is probably the right rule,
but it re-opens that class and belongs in a change that can carry its own adversarial pass. The
current behaviour is SAFE — it fails open — so the cost is a missing improvement, not a wrong page.

**Fix (when prioritized):** per-link completeness, with the invariant search in
`tests/agenda/agendaViewerDaysInvariant.test.ts` extended to multi-link fixtures first, so the
loosening is measured against the property before it ships.

### BL-AGENDA-POSITIONAL-DAYSET-FALLBACK — the day-set matcher has no positional fallback

**Status:** OPEN — deliberate omission, ratified in-spec · **Severity:** very low · **Class:** FEATURE COMPLETENESS

`lib/crew/agendaViewerDays.ts` fails open when labels do not parse, rather than mirroring
`agendaSessionsForToday`'s four-condition positional fallback. Deliberate: the trigger (`!someDateParsed`)
does not occur in the 6-PDF corpus, and folding on positional index means folding in the state of least
knowledge. Full reasoning ratified at
`docs/superpowers/specs/2026-07-26-agenda-perday-viewer-fold.md` §3 under "RATIFIED AMENDMENT".

**Revisit if** the corpus gains documents with purely positional day labels ("Day 1" / "Day 2") AND a
viewer reports seeing the whole show expanded when they expected their day marked.

### BL-HEALTH-RESOLVE-DB-LOCKDOWN — DB-enforce developer-only health-alert resolution

**Status:** OPEN — ACCEPTED RISK, deliberately not scheduled (re-affirmed 2026-07-24) · **Severity:** low · **Class:** SECURITY / DEFENSE-IN-DEPTH

**Re-verified 2026-07-24:** the grant is still live — `supabase/migrations/20260501002000_rls_policies.sql:147` reads `grant select, insert, update, delete on table public.admin_alerts to anon, authenticated;`. The acceptance below is unchanged, and this item was explicitly reviewed and left open during the 2026-07-24 residual sweep rather than overlooked. Do not re-raise it as a finding on an unrelated diff; it closes only as part of `BL-ADMIN-POSTGREST-DML-LOCKDOWN`.

alert-audience-split (spec §6.7) makes health-alert resolution developer-gated at every PRODUCT surface (the dev-gated `resolveHealthAlertFormAction` plus HEALTH_CODES rejects on the three legacy user-facing resolve surfaces: `resolveAdminAlertFormAction`, `app/api/admin/admin-alerts/[id]/resolve`, `app/api/admin/show/[slug]/alerts/[id]/resolve`). This is app-surface defense-in-depth + UI coherence, NOT a DB-enforced trust boundary: `admin_alerts` still GRANTs UPDATE to `authenticated` and its RLS policy allows any `public.is_admin()` caller to update rows (`supabase/migrations/20260501002000_rls_policies.sql`), so a non-developer admin could in principle `PATCH admin_alerts.resolved_at` directly through PostgREST, bypassing the app layer. We ACCEPT this (Doug is the trusted business owner, not an adversary; role filtering is UX not security). **Fix (when prioritized):** revoke direct `admin_alerts` UPDATE from `authenticated`/`anon` and route ALL resolution — doug alerts included — through `SECURITY DEFINER` RPCs with an `is_developer()` check for health codes. Materially larger, whole-resolve-path change; deferred as a cross-reference of the broader `BL-ADMIN-POSTGREST-DML-LOCKDOWN` admin_alerts-class DML lockdown item.

### BL-PREPARE-INTERNAL-FAULT-KIND — a third fault kind for post-parse internal helpers

**Status:** OPEN (2026-07-25) · **Severity:** low · **Class:** TELEMETRY GRANULARITY

`PrepareOnboardingFileError` has two kinds, `drive_fetch` and `parse`, and the post-parse internal helpers (`finalizeArchivedTabs`, `reconcileIncludedTab`, `discardAndRerun`'s fix-up, `applyRoleTokenMappings`) currently fall to `drive_fetch` — today's unchanged behavior. Neither code is right for them: a bug in the role-mapping overlay is not a Drive failure, and it is not something Doug fixes by editing his sheet either, so `STAGED_PARSE_FAILED` ("fix its structure", `warn` severity) would be a new wrong instruction. **Fix (when prioritized):** a third `internal` kind mapped to a code that tells the operator to contact the developer, with the finalize severity staying `error`. Needs a new §12.4 row and the full four-gate CI fan-out, which is why it was not folded into the batch that surfaced it.

### BL-CRON-WORKBOOK-FAULT-CODE — a corrupt workbook on the cron path reports SYNC_FILE_FAILED

**Status:** OPEN (2026-07-25) · **Severity:** low · **Class:** TELEMETRY GRANULARITY

The cron sync path also synthesizes workbooks (`lib/sync/runScheduledCronSync.ts:3118,3144`). A throw at either site escapes `prepareProcessOneFile` and is caught by the outer per-file loop (`:3915-3925`), which records `outcome: "parse_error"` with `classifySyncFailure(error)` — typically `SYNC_FILE_FAILED`. So it is already parse-family rather than Drive-family (unlike the onboarding paths this batch fixed), and the open question is narrower: should a corrupt workbook there report `PARSE_ERROR_LAST_GOOD`, whose copy tells Doug the latest edit did not parse and the previous version is still live? **Fix (when prioritized):** key on the `WorkbookSynthesisError` type this batch introduced. Deferred because it changes a live crew-visible sync contract and belongs in its own spec.

### BL-ROOM-DIMS-ONLY-NOVEL-HEADER — parse a dims-only novel breakout header (no DAY-range)

**Status:** OPEN · **Severity:** low · **Class:** PARSER COVERAGE

The parser-anchor-de-literalization PR (spec `docs/superpowers/specs/2026-07-05-parser-anchor-deliteralization.md`, audit finding #6) de-literalizes the v1 breakout-room loop from the two literal names `MABEL`/`LAUDERDALE` to any `NAME + trailing DAY-range` header, so a future differently-named DAY-range breakout (`GRAND BALLROOM DAY 1 & 2`) now parses. A dims-ONLY header with NO DAY-range (`SALON ABCD&#10;60' x 45'`, `MERIDIAN HALL&#10;50' x 30'`) is deliberately **out of scope** (spec §2 "Descoped", adversarial-review R31 f1): it is structurally identical to a dims-bearing ASSET/equipment row (`PROJECTION SCREEN&#10;5' x 9'`, `4' X 8' RISER`), so a name-blind admit gate cannot tell a novel dims-only room from an asset — 14 adversarial rounds confirmed every dims-based admit/evidence/ownership gate reopened asset fabrication or field theft. origin/main never parsed this shape, so it is NOT a regression, and a blanket data-gap signal is rejected (it would fire on every gear row = noise). **Fix (when prioritized):** parse a dims-only room only under a POSITIVE room-context signal the sheets actually carry — a `BREAKOUT`/room-section header above the row, or an explicit room label — NOT a dims token. Add fixtures with a real dims-only room inside a room section and assert it parses without any asset row (dims-bearing gear elsewhere on the sheet) becoming a room.

**Update (2026-07-06, spec `docs/superpowers/specs/2026-07-06-bo-venue-header-anchor.md`):** partially addressed by the BO-venue-header anchor — a dims-only header sitting above a **`BO` field block** now parses, anchored on the field block (not the dims token), so no asset is fabricated. The remaining unaddressed sub-case is a dims-only header with **no** field block of any kind (a bare `NAME&#10;dims` cell), which stays out of scope (indistinguishable from an asset without an anchor).

---

### BL-MUTATION-HARNESS-OPEN-HOLES — parser silent-fragility classes pinned by the mutation harness

**Status:** OPEN (2026-07-06, feat/mutation-harness) · **Severity:** medium · **Class:** PARSER ROBUSTNESS

The rec-5 mutation-testing harness (`tests/parser/mutationHarness.test.ts`, nightly workflow) pins **7,885 day-1 silent holes** — mutants whose parse changed with no compensating signal (`SILENT_WRONG` / `SILENT_SIGNAL_LOSS`), recorded in `tests/parser/mutation/knownHoles.ts`. Each hole's `finding` field maps its operator class to the audit finding it exercises (`OPERATOR_FINDING_MAP`), so a ledger failure is triageable by operator. Documented-finding classes: **`header-typo` → audit #5** (short-header typo intolerance, `sectionHeaderNormalize.ts:16,66`); **`blank-row:inject` / `blank-row:remove` → audit #10** (blank-row block segmentation, `exportSheetToMarkdown.ts:104`). The remaining operator classes are silent-fragility surfaces the audit did not enumerate as a numbered finding; each is tracked as a backlog sub-item below and its holes shrink when that class is hardened:

- **`BL-MUTATION-REF-SUB`** — a body cell rewritten to the literal `#REF!` (a real broken-reference export artifact, present in 3/7 live shows) is absorbed into the parse with no signal. Value-corruption class.
- **`BL-MUTATION-UNICODE`** — a zero-width non-joiner (U+200C) injected into a cell value is silently retained (the fintech live ZWNJ shape). Invisible-character class.
- **`BL-MUTATION-COLUMN-SHIFT`** — a spurious leading empty column shifts a section's row grid with no signal (the East Coast column-shifted outlier). Layout-shift class.
- **`BL-MUTATION-MERGED-CELL`** — deleting one interior pipe (how a merged cell exports) fuses two adjacent cells silently. Cell-fusion class.
- **`BL-MUTATION-SECTION-ORDER`** — reordering two adjacent top-level blocks silently reorders the parser's output arrays (the parser preserves source order). **Order-sensitivity discovered by the harness on 2026-07-06** (58 `SILENT_WRONG` + 24 `SILENT_SIGNAL_LOSS` across the corpus); section-reorder was reclassified cosmetic → corrupting as a result.

**Ratchet:** the ledger is a shrink-only baseline. When a downstream fix hardens one of these classes, the corresponding holes become `staleRows` and the nightly harness fails until they are removed from `knownHoles.ts` — turning each parser-robustness fix into a measurable ledger reduction. Do NOT grow the ledger silently; a NEW hole (regression) fails the harness as `newAlarms`.

---

### BL-EXPORT-BLANK-ROW-SEGMENTATION — blank-row block segmentation fuses/splits sections silently (audit #10)

**Status:** PARTIALLY CLOSED (2026-07-27, `fix/export-blank-row-segmentation` — spec `docs/superpowers/specs/2026-07-27-export-blank-row-segmentation.md`) · **Severity:** medium · **Class:** EXPORT/PARSER ROBUSTNESS

**Partial closure (2026-07-27):** two of the three spec'd fix directions shipped. (b) **Header-aware segmentation** — `splitBlocks` now starts a new block at a mid-block row whose first non-blank cell is an uppercase known section header (`isMidBlockSectionStart`, `lib/parser/knownSections.ts`; `CLIENT` excluded on corpus evidence), closing the FUSE case structurally for uppercase-known headers with corpus-verified zero output drift (`tests/drive/round-trip-fixture.test.ts` byte-equality + archived-tab fingerprint golden). (c) **Crew-scoped orphan detection** — a new warn-severity `ORPHANED_CREW_ROWS` ParseWarning (operator card + crew-region deep link) fires when a table block's first row carries a crew-role cell (≥2 distinct Load In / Load Out / Strike / Set tokens on one line) with no section header — the SPLIT case for crew rosters, at 0 corpus false positives and 29/29 simulated-split recall (ratcheted by `tests/parser/orphanedCrewRowsCorpus.test.ts`). **The backlog entry's generic orphan-block rule ("no recognizable header adjacent to a recognized section") was probed and REFUTED: 30 false positives on the live corpus** (GEAR-tab gear lists under room headers, INFO free-text blocks, PULL SHEET title rows) — blocks starting with non-header rows are normal sheet layout. **Residuals (still open):** splits of non-crew sections (hotel/transport/details tails have no corpus-clean discriminator); fuses onto mixed-case or unknown headers; crew rows carrying fewer than two role tokens on one line of one cell (including role cells authored with literal pipes, which the parser's cell split decomposes); and the mutation harness cannot observe the exporter-level fuse fix (it mutates exported markdown, never the grid), so `blank-row:remove` ledger holes remain by construction.

`splitBlocks` (`lib/drive/exportSheetToMarkdown.ts:127-144`) segments the sheet grid into blocks using fully-blank rows as the **only** delimiter. Two failure modes, both silent: (a) a stray value in a spacer row (normal authoring noise — a forgotten cell, a note typed into the gap) **fuses** two adjacent sections into one block, so the downstream parser attributes one section's rows to another; (b) a blank row inserted mid-section **splits** one section into two blocks, orphaning the tail rows from their header. Neither emits a signal — mis-grouped sections flow into the parser as plausible structure. The 2026-07-07 e2e audit re-verified this unchanged; the 2026-07-10 re-rating (§10) left it as the only numbered finding with zero movement (2 fixed, 2 partial, 1 by-design). The mutation harness pins the blast radius (`blank-row:inject` / `blank-row:remove` holes in `knownHoles.ts`, mapped via `OPERATOR_FINDING_MAP` — see BL-MUTATION-HARNESS-OPEN-HOLES above) but detection-in-tests is not detection-at-runtime. **Fix directions (pick at spec time):** (a) near-blank-row heuristic — a row with exactly one short non-blank cell adjacent to blank rows emits a warn-severity `ParseWarning` instead of fusing; (b) section-header-aware segmentation — a row matching a `KNOWN_SECTION_HEADERS` shape mid-block starts a new block (closes the fuse case structurally); (c) orphan-block detection — a block with no recognizable header row adjacent to a recognized section warns as a probable split. Any fix hardens a mutation-harness class → the corresponding ledger holes become `staleRows` per the ratchet above. Trigger to promote: a live show where a spacer-row stray value or mid-section blank row mis-groups data with no operator signal.

---

### BL-TRANSPORT-ID-RESOLUTION — id-based transport visibility + no-match admin warning (deferred from Flow 8.4 to 8.3)

**Status:** PARTIALLY CLOSED (2026-07-09, Flow 8.4 PR #374) · **Severity:** medium · **Class:** CREW VISIBILITY / ENRICH

**Partial closure (Flow 8.4, PR #374 — `docs/superpowers/specs/2026-07-09-flow8.4-transport-assignee-warning.md`):** the **enrich-time no-match admin warning** shipped. `lib/sync/enrichTransportAssignees.ts` emits one admin-only aggregate data-gap warning (`TRAVEL_TRANSPORT_NAME_UNMATCHED`, `gateExempt: true`) when a transport driver/assignee name references a crew member who would not see their own tile — turning silent invisibility into a staged-review data-quality signal. **Still deferred to 8.3:** id-persistence + id-based visibility matching (a crew `id` does not exist at enrich time — the uuid is DB-assigned at APPLY via `gen_random_uuid()`, `initial_public_schema.sql:32` — so resolve-to-id-and-persist is architecturally infeasible in the enrich pass; 8.3 must move it to an apply-time step). The regression pins below also remain for 8.3, which changes the `transportTileVisible` predicate.

The Flow-8 audit item 8.4 (`docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` §Flow 8) asks that a transport name mis-parse cannot hide a driver's own itinerary. `transportTileVisible` (`lib/visibility/scopeTiles.ts:177-202`) matches assigned crew by **fuzzy name** (`namesRefer`, `lib/data/nameMatch.ts`), which closes the common variance (nickname / legal-name / case / trim / prefix) but NOT a **hard** mis-parse (a merged-cell overflow that shifts the surname token, e.g. a driver stored as `"Doug Larson Loadout"` — the adjacent column fused onto the name — vs roster `"Doug Larson"`; verified `namesRefer` returns false because the multi-token rule compares last tokens `"loadout"`≠`"larson"`). In that case the driver silently does not see their own ground-transport block. Flow 8.4 (PR #374, see Partial closure above) now emits an **admin-visible no-match warning** for this case, so it is no longer _silent_ — but the driver still does not see their tile until the operator fixes the name, because id-based visibility matching remains deferred to 8.3.

**Deferred defensive regression pins (moved out of `flow8-self-serve-trio` at plan-review Round-11; land red-first in 8.3):** pin `transportTileVisible`'s _current_ fuzzy tolerance against name-parse-variance regression — driver `"Doug"` vs viewer `"Doug Larson"` → visible (prefix); `"Douglas Larson"` vs `"Doug Larson"` → visible (surname); assigned-names `["Bill Werner"]` vs `"William Werner"` → visible; case/trim `"  doug larson "` → visible; negative controls (`"Jane Smith"` → not visible, empty/`null` → not visible, admin → visible when transportation exists); and the **known-gap fixture** driver `"Doug Larson Loadout"` vs `"Doug Larson"` → **not visible** (verified live: multi-token rule compares last tokens `"loadout"`≠`"larson"`, `nameMatch.ts:50-53`). These were removed from the milestone because a green-only regression-pin task conflicts with plan-wide invariant 1 (non-negotiable red-first per task); they belong red-first in 8.3, which changes this exact predicate.

**Fix (deferred to the 8.3 venue-timezone / enrich spec, same enrich domain + admin-warning machinery):** at enrich time, resolve free-text `driver_name` / `assigned_names` → `crew_member` ids against the show roster, persist the resolved id set on the transportation legs / driver, match viewer visibility by id (robust to any later render-time name garble), and emit an admin-visible alert when an assigned name resolves to **no** roster member (turns silent invisibility into a data-quality signal — parallels 8.3's ET-default admin warning). Add fixtures with a hard-mis-parsed driver name and assert the driver's own transport becomes visible via id resolution AND that the no-match name raises the admin warning. Interim crew recourse until this lands: the Flow-8.1 picker "Don't see your name?" affordance.

---

## Crew-page share-link chrome (2026-07-14, share-link-instant-rotate-dedup)

## Share hub follow-ups (2026-07-25, share-link-chrome-backlog)

### BL-HELP-STRIP-COPYLINK-STALE — help prose still describes the retired strip copy-link

**Status:** OPEN (2026-07-25) · **Severity:** low · **Class:** DOCS

Two claims in `app/help/admin/per-show-panel/page.mdx` describe a status-strip copy-link that the share-hub consolidation removed: `:7` lists it among the strip's contents, and `:30` places the Re-sync button "between the sync line and the copy-link button". Both are user-visible and both are wrong.

Pre-existing debt from `docs/superpowers/specs/2026-07-20-share-hub-design.md:104`, not from the milestone that surfaced it, and deliberately out of scope there: correcting shipped user copy pulls in the help screenshot surface (`help-affordances`, `screenshots-drift`), which a code-comment sweep should not. Trigger: the next help pass, which can own the regeneration.

## BL-STAGED-IDENTITYLINK-RENAME-IDENTITY — dashboard staged apply treats identity-link renames as remove+add

**Filed:** 2026-07-17 (role-flags-notice-lead-only-doug §2.5) · **Class:** sync (staged identity application) · **Effort:** M (staged-core threading + double-apply analysis)

The dashboard staged-apply path (`applyStagedCore`) applies an identity-linked rename (MI-12/13/14) as **remove-old + add-new** by ratified contract (R33-2, `applyStagedCore.ts:552`; passes zero `identityLinkRenames`), so crew identity (id/oauth link) is NOT preserved across a rename on that path. The capability AUDIT is already complete (arm (c) audits the removed old identity's loss + arm (b) the added new identity's grant, path-independent), so this is NOT an audit gap. If identity-PRESERVATION on the staged path is ever wanted, thread `identityLinkRenames` through `applyStagedCore` (compute via `computeIdentityLinkRenames` from the staged `triggeredReviewItems`) — but resolve the double-apply / R33-2-override risk first. Trigger: a report of a staged rename losing a crew member's oauth link.

## BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT — §12.4 ROLE_FLAGS_NOTICE copy says FINANCIALS unlocks admin access

**Filed:** 2026-08-02 (docs/citation-rot-financials-vocab, spec review R2 finding 3) · **Class:** docs/copy (§12.4 catalog) · **Severity:** low · **Effort:** S

Master spec §12.4 `ROLE_FLAGS_NOTICE` helpfulContext (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3356`) reads "This fires only for LEAD or FINANCIALS, the roles that unlock internal financials and admin access". FINANCIALS unlocks the `financials` column only ("Nothing else", the Effect row of `docs/superpowers/specs/admin/2026-07-15-extend-role-scope-vocab.md`); LEAD alone additionally grants the admin/ops surface, stated correctly at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1627`. Explanatory copy only, so no access is actually granted, but it is Doug-visible text. Fix requires the §12.4 three-way lockstep in ONE commit (spec §12.4 prose edit + `pnpm gen:spec-codes` regen + `lib/messages/catalog.ts` row) and touches the frozen helpfulContext byte-parity contract (BL-CARD-COPY-HELPFULCONTEXT-PARITY, graduated 2026-08-01) — re-freeze parity after the edit. Trigger: next §12.4 copy pass.

## BL-ADMIN-PARSEPANEL-ORPHANED — ParsePanel/StagedReviewCard live-scope mount orphaned

Since the show-page→modal pivot (#476) nothing imports `components/admin/ParsePanel.tsx` (its per-show mount was deleted; whole-parse review was deliberately dropped from published shows in 65d5be75a in favor of MI-11 holds in the Changes feed). `StagedReviewCard` remains live in the onboarding wizard; the live-scope `ParsePanel` wrapper is dead code. Surfaced during published-show-alerts (2026-07-19, spec §14). **Fix (when prioritized):** delete ParsePanel or re-home it explicitly; sweep `tests/e2e/_metaEmphasisRenderContract` style registries on removal.

## BL-RESYNC-REGRESSED-JUMP-LINK — the alert's "open the parse panel" pointer is prose, not an affordance

**Status:** OPEN · **Severity:** LOW-MEDIUM (discoverability) · **Class:** UX — surfaced by the correction-loop de-duplication (#516, 2026-07-20)

`RESYNC_QUALITY_REGRESSED`'s body ends "…open the parse panel to see what degraded and fix the sheet." That sentence is the ONLY thing routing Doug from the alert to the Parse warnings panel, and it is plain prose: no link, no jump control.

This pointer became load-bearing in #516. Before that change, the Overview section rendered the correction-loop instruction ("Fixed it in the sheet? … then re-sync.") directly under the alert, so a reader who never scrolled still got the how-to-fix. #516 removed that copy as a duplicate — correctly, since the Parse warnings panel renders the same sentence on a strictly wider condition — which means the alert's prose pointer is now the whole bridge between "something degraded" and "here is how to fix it".

**Why this is NOT a code fix:** master spec §12.4 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2801`) ratifies "No action link." for this row. Adding a jump affordance contradicts a ratified contract, so it needs a spec amendment first, not a patch. Do not "just add a link" in a UI PR.

**Options to weigh at spec time:** (a) amend the §12.4 row to permit a section-jump action link (note the row's `resolution:"auto"` posture — the link would be navigational, not resolving, which is a different affordance class than the action links other rows carry); (b) leave the alert alone and instead make the rail's "Parse warnings" section carry the attention dot the alert implies, so the route is visible in the nav rather than in prose; (c) accept the prose pointer as sufficient given the rail is always visible in the modal.

**Trigger:** next milestone touching §12.4 alert rows, the attention surface, or `CompactAlertCard` affordances.

## BL-E2E-LIFECYCLE-SPECS-CI-DARK — admin-lifecycle e2e specs are matched by playwright projects but invoked by no workflow

> **UPDATE 2026-07-26 (PR4 of the CI-dark cluster).** `admin-lifecycle-transitions.spec.ts` stays allowlisted, but for a materially different reason than before: its two DETERMINISTIC breaks are fixed (a retired-testid assertion that failed every run, and a compound case the ShareHub backdrop made unreachable) and the pre-hydration swallow is repaired. It went from failing every run to one flaky case, measured 4/5 locally with one real-CI failure on the round-trip. Not wired, per spec §6.1's five-consecutive-greens acceptance and its pre-ratified fallback. Tracked as `BL-E2E-LIFECYCLE-TRANSITIONS-ROUNDTRIP-FLAKE`. The rest of this umbrella is the ~60 app-dependent specs needing a dev server and seeded database, deliberately out of the cluster's ratified scope.
>
> **UPDATE 2026-07-27 (`fix/lifecycle-transitions-roundtrip-flake`).** The round-trip flake is fixed and `admin-lifecycle-transitions.spec.ts` is WIRED — `lifecycle-layout-e2e.yml` runs it on every `pull_request`, five consecutive green normal-dispatch runs met spec §6.1 / AC-6, and its allowlist row is deleted. `BL-E2E-LIFECYCLE-TRANSITIONS-ROUNDTRIP-FLAKE` graduated to `BACKLOG-archive.md`. This umbrella's remaining scope is unchanged: the ~60 app-dependent specs.

**Status:** OPEN · **Severity:** MEDIUM (dark regression coverage) · **Class:** CI wiring — surfaced by the archive-row-menu-idiom spec R11 adversarial round (2026-07-24).

**PARTIAL 2026-07-26 (PR2 of the CI-dark coverage cluster).** The umbrella shrank substantially: 30 allowlist rows citing this item are gone, because `standalone-e2e.yml` now runs the whole standalone config unfiltered on every PR. 60 rows remain, all app-dependent specs that need a dev server and a seeded database — deliberately out of the cluster's ratified scope. `admin-lifecycle-transitions` specifically was PR4's subject and closed on 2026-07-27 (five consecutive greens, see the UPDATE above).

`tests/e2e/admin-lifecycle-layout.spec.ts` and `tests/e2e/admin-lifecycle-transitions.spec.ts` appear in the `mobile-safari` project `testMatch` (`playwright.config.ts`), but every e2e workflow runs an explicit spec list and none names them — they run nowhere in CI. The archive-row-menu-idiom branch wires the LAYOUT spec (new `lifecycle-layout-e2e.yml`, since it carries that feature's load-bearing assertions); the TRANSITIONS spec remains dark. **Fix (when prioritized):** add `admin-lifecycle-transitions.spec.ts` to the same workflow (or its own) after fixing its local flake class — the 2026-07-24 flake audit (archive-row branch) measured: static source-guard red since 2026-07-20 (fixed on that branch via the ArchiveShowButton transition-opacity carve-out mirroring PublishedToggle's), plus 3 pre-hydration click-swallow failures (hub kebab open x2, published toggle x1) whose failing cases move between runs; the layout spec's toPass hydration-retry is the template. The structural guard for the class (workflow-coverage meta-test with a reasoned allowlist) SHIPPED with the archive-row-menu-idiom branch (spec §6 item 6); un-wiring work here is now just moving this spec off that allowlist by adding it to a workflow. Related owner decision (R18), **corrected 2026-07-26**: the claim that branch protection requires only the `quality` context is STALE — measured, the live required set holds TWELVE contexts. The e2e jobs are advisory not because one context is required, but because none of them is in that set. Promoting e2e jobs into it so a red e2e blocks merge at the GitHub layer remains an owner GitHub-settings action, not repo code; until then enforcement is the pipeline's all-checks-green procedural gate. Measurement: `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md` §2.5.

**New instance observed 2026-07-26** (destruct-thumb-order PR #604): the LAYOUT spec — the one this row records as stabilized by the `toPass` hydration retry — failed once in `lifecycle-layout-e2e` on `mobile-safari`, at the archive-confirm popover assertions (`tests/e2e/admin-lifecycle-layout.spec.ts:411` `scrollIntoView(confirm) must have been called`, and `:538` armed body within the clip rect), 24 passed / 1 failed. Confirmed a flake, not a regression: the failing commit touched only `tests/e2e/pendingDiscardReal.layout.spec.ts`, which that workflow does not run, the two commits before it passed, and a re-run of the identical tree went green. So the hydration retry does NOT cover the popover-placement path — the growth-then-replace measurement takes a fixed `waitForTimeout(300)` rather than retrying to a condition, which is the likely remaining gap. **Fix shape:** replace that fixed wait with a `toPass` block around the armed measurement, same template as the rest of the spec.

## BL-RESOLVE-INTENT-WRONG-VERB — two event-shaped alerts render "Mark resolved" where "Confirm" is correct

**Status:** OPEN · **Severity:** LOW (copy defect, no functional impact) · **Class:** admin copy / lifecycle contract

`SHOW_FIRST_PUBLISHED` ("<sheet> is now live for crew…") and `PICKER_EPOCH_RESET` (whose own help text reads "Nothing to fix; this is a record of the reset") are both recorded as `intent: "resolve"` in `RESOLVE_INTENTS` (`lib/adminAlerts/resolveActionLabel.ts:58`, `:60`), so their button reads "Mark resolved". By the module's own rule (`lib/adminAlerts/resolveActionLabel.ts:9-12`) both are `confirm`: a deliberate thing that already happened, not a fault to clear. Visible in the notification bell; both codes are excluded from the per-show attention index, so the show modal is unaffected.

**Why it was not fixed in the attention-index change (2026-07-24).** `tests/adminAlerts/_metaResolveIntentLifecycle.test.ts` defense 5c reads the intent baseline from **`origin/main`** and asserts every historical `(code, intent)` pair still resolves identically (`tests/adminAlerts/_metaResolveIntentLifecycle.test.ts:118-124`). Both codes are `resolve` in that baseline (19 rows). Updating the in-tree baseline and the approved-confirm list does not satisfy the gate, because it compares against main's copy. Intent is append-only by design, and the test states the rationale: "rows already in admin_alerts still render it" — a persisted alert row resolves its label at render time, so flipping an intent retroactively relabels every open row of that code.

**What fixing it requires.** A ratified amendment to the append-only contract, deciding that a retroactive relabel is acceptable when the original intent was simply wrong, plus the mechanism to express that (an exception list the history gate honours, or a versioned baseline). That is a contract change with its own blast radius, not a copy edit. Analysis recorded in `docs/superpowers/specs/2026-07-24-attention-index-consolidation.md` §2.6.
