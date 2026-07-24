# Gallery Action Outcomes Implementation Plan (R1-repaired)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every action-outcome state (pending/error/refusal/partial/success on published-show-modal controls) demonstrable click-driven in the dev attention-gallery, per spec `docs/superpowers/specs/2026-07-23-gallery-action-outcomes-design.md`.

**Architecture:** Three-channel scripted layer. (1) Tier-2-only serializable `actionOutcomes` flows server page → client switcher; scripted closures replace `NOOP_ACTIONS` members per scenario. (2) `GalleryWriteGuard` gains a `scripts` prop (scripted JSON or hang); mount relocates into the switcher. (3) Null-default `DevActionOverrideContext` consulted by the 3 direct-import controls. **Reachability validation reuses the production derivers** — `shapeChangeFeed` (accept/undo arms), `deriveScenarioAttention` (actionable resolve), `groupIgnorableByCode` (bulk chips) — never re-derived predicates.

**Tech Stack:** Next 16 / React 19, TS strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest + jsdom, Playwright dev-build (:3001).

## Global Constraints

- Worktree `/Users/ericweiss/FX-worktrees/gallery-action-outcomes`, branch `feat/gallery-action-outcomes`; commits `--no-verify`, conventional style, one task per commit.
- TDD per task. No new server actions/routes/DB surface; invariants 2/9/10 untouched by construction; invariant 5 honored by rendering only through existing components with cataloged codes (Task 7 verifies each scripted code against `lib/messages/catalog.ts`; `ErrorExplainer` returns `null` on unknown codes — `components/messages/ErrorExplainer.tsx:69-93` — so an uncataloged code is a blank-panel bug, pinned by e2e non-empty-copy assertions).
- `pending` = never-resolving promise. Fixed ISO literals only; no `Date.now()`.
- Production-default behavior byte-identical with no provider/scripts (Task 5/4 pins).
- **Meta-test inventory:** EXTENDS `tests/dev/attentionScenariosValidate.test.ts`, `tests/dev/attentionScenariosTier2.test.ts` (`T2_REQUIRED_IDS` set-equality), `tests/dev/attentionScenariosIndex.test.ts` (tier-exclusivity field list + catalog-wide validation), `tests/dev/galleryModalTypes.test.ts`, `tests/components/admin/dev/attentionModalSwitcher.test.tsx`, `tests/app/admin/attentionGalleryPage.test.tsx`, e2e containment in `tests/e2e/attention-modal-gallery.spec.ts`. No registry-class meta-test applies (spec §5 reason). **Advisory locks:** N/A.
- e2e harness: dev-build project (:3001, testMatch already covers the spec file); readiness via the file's existing scenario-jump + modal-visible helpers, never `networkidle`; auto-waiting locator assertions only; kill only :3001 if stale (never blanket-kill — Docker on :3000).

## File Structure

As R0, plus ripples: `lib/dev/galleryActionScripts.ts` now also owns the exported `NOOP_ACTIONS` (moved from the switcher, which imports it back); `app/admin/dev/attention-gallery/buildSwitcherScenarios.ts` `isModalVisible` gains the `actionOutcomes` carrier arm; `lib/dev/galleryModalTypes.ts` `GROUP_LABELS` gains `actions`; `lib/dev/attentionScenarios/tier2.ts` `T2_REQUIRED_IDS` gains the 15 ids.

Verified mount predicates (R1-corrected, all live-code):

| Control | Mounts iff | Cite |
| --- | --- | --- |
| ReSyncButton | `!archived` | `StatusStrip.tsx:300-303` |
| PublishedToggle | `!archived`; disabled on `finalizeOwned` | `StatusStrip.tsx:189-202` |
| ShareHub | unconditional (`StatusStrip.tsx:306-327`); rotate/reset live in it; `linkActive = published && !archived && url != null` (`ShareHub.tsx:223`) | — |
| ArchiveShowButton | ShareHub non-archived arm (`ShareHub.tsx:616` region) | verify arm at code time |
| Accept / Accept-all | feed entry `acceptable` = `source === "auto_apply" && status === "applied" && acknowledged_at == null` | `lib/sync/feed/shapeChangeFeed.ts:57-59` |
| Undo | `status === "applied" && isCrewDomainChangeKind(change_kind) && individually_undoable === true` | `shapeChangeFeed.ts:63-69` |
| Mi11 approve/reject | pending hold rows | `ChangesFeed.tsx` hold entries |
| PerShowAlertResolveButton | ACTIONABLE derived attention item | `deriveScenarioAttention` + `AttentionBanner.tsx` |
| BulkIgnoreControls | `groupIgnorableByCode` yields a group (≥2 DISTINCT-content active ignorable warnings same code) | `lib/dataQuality/bulkIgnoreGroups.ts:8-38` |
| CrewRowActions | published mode + row `crewId` + `actions` enabled + aligned non-empty `previewRoster` (over-cap crew volumes clear it) | `step3ReviewSections.tsx:1523,1550,1593-1658`; `publishedModalFixture.ts:576-581` |

---

### Task 1: `actionOutcomes` schema + validator (production-deriver reachability)

**Files:** Modify `lib/dev/attentionScenarios/types.ts`, `lib/dev/attentionScenarios/validate.ts`. Test `tests/dev/attentionScenariosValidate.test.ts`.

**Interfaces — Produces:** `PropActionOutcome`, `RESYNC_ERROR_CODES`, `ScenarioActionOutcomes`, `AttentionScenario.actionOutcomes?`; validator errors prefixed `actionOutcomes:`.

- [ ] **Step 1: failing tests.** Append a `describe("actionOutcomes")` to `tests/dev/attentionScenariosValidate.test.ts`, reusing THAT FILE's local scenario/warning factories (the warning factory is block-local `warn` near lines 563-580 — reuse or hoist it; do NOT invent `w()`). Cases (concrete failure mode each):
  - tier-1 carrier → `actionOutcomes: tier 2 only` (catches silent tier leak);
  - `{}` → `empty object is a no-op` (catches dead scenario);
  - unknown key → `unknown key typo` (catches typos);
  - bad kind / blank error code / out-of-union resync code → per-key messages (catches invalid scripts);
  - `approve` with no holds → `unreachable` (catches dead script);
  - `accept` with a changeLog row that is `pending` (NOT acceptable — acceptable requires `source:"auto_apply", status:"applied", acknowledged_at:null`, `shapeChangeFeed.ts:57-59`) → `unreachable` (pins the R1-F1 class: status-pending is the WRONG predicate);
  - `undo` with an acceptable-but-not-undoable row (`change_kind: "use_raw_stale"`) → `unreachable`;
  - `resolve` with a non-actionable alert (pick code via the file's derived-class helpers or a `self_heal` code) → `unreachable`;
  - `bulkIgnore` with 2 IDENTICAL-content warnings (same code + same rawSnippet → one fingerprint → group size 1, `bulkIgnoreGroups.ts` doc) → `unreachable`, and with 3-distinct-content group `okCount: 3` → okCount range error;
  - `crewReset` with `fixture: { volumes: { crew: 40 } }` (over-cap clears previewRoster, `publishedModalFixture.ts:576-581`) → `unreachable`;
  - `rotate` without `share.linkActive` → `unreachable`;
  - coherent script (share fixture + rotate/everyoneReset/crewReset) → `[]`.
- [ ] **Step 2:** run file — new describe FAILs.
- [ ] **Step 3: types** — as R0 (`PropActionOutcome`, `RESYNC_ERROR_CODES` const array, `ScenarioActionOutcomes`, field docblock). Unchanged from R0 text.
- [ ] **Step 4: validator.** `validate.ts` imports: `RESYNC_ERROR_CODES` (VALUE import from `./types`), `shapeChangeFeed` from `@/lib/sync/feed/shapeChangeFeed`, `groupIgnorableByCode` from `@/lib/dataQuality/bulkIgnoreGroups`, `deriveScenarioAttention` from `./..` (wherever validate already imports it — it does for the PARSE_ERROR check; reuse). Kind-allowlist walk as R0 (`ACTION_OUTCOME_KINDS`). Reachability via PRODUCTION derivers:

```ts
function validateActionOutcomeReachability(s: AttentionScenario, ao: ScenarioActionOutcomes, out: string[]): void {
  const fx = s.fixture;
  const archived = fx?.archived === true;
  // Feed arms from the REAL shaper - zero drift (R1-F1/F2 structural fix).
  const shaped = shapeChangeFeed(toShaperRows(s.changeLog ?? []), []);
  const acceptableCount = shaped.filter((e) => e.acceptable).length;
  const hasUndo = shaped.some((e) => e.action === "undo");
  const holds = Array.isArray(s.holds) ? s.holds.length : 0;
  const actionable = deriveScenarioAttention(s).some((it) => it.actionable);
  const activeWarnings = activeWarningsAfterIgnores(s); // warnings minus ignoreWarningIndexes targets
  const groups = groupIgnorableByCode(activeWarnings);
  const maxGroup = groups.reduce((m, g) => Math.max(m, g.items.length), 0);
  const crewReachable = !archived && fx?.published !== false &&
    !(fx?.empty ?? []).includes("crew") && fx?.volumes?.crew === undefined;
  const req = (cond: boolean, key: keyof ScenarioActionOutcomes, why: string) => {
    if (ao[key] !== undefined && !cond) out.push(`actionOutcomes.${String(key)}: unreachable - ${why}`);
  };
  req(holds > 0, "approve", "needs a pending mi11 hold");
  req(holds > 0, "reject", "needs a pending mi11 hold");
  req(acceptableCount > 0, "accept", "needs an acceptable feed entry (auto_apply/applied/unacknowledged)");
  req(acceptableCount > 0, "acceptAll", "needs an acceptable feed entry");
  req(hasUndo, "undo", "needs an undo-armed feed entry (applied crew-domain individually_undoable)");
  req(actionable, "resolve", "needs an ACTIONABLE derived attention item");
  req(maxGroup >= 2, "bulkIgnore", "needs a bulk-ignorable group (>=2 distinct-content same-code active warnings)");
  req(crewReachable, "crewReset", "needs published, non-archived, non-empty, non-overcap crew");
  req(fx?.share?.linkActive === true, "rotate", "needs fixture.share.linkActive");
  req(fx?.share?.linkActive === true, "everyoneReset", "needs fixture.share.linkActive");
  req(!archived, "resync", "archived shows have no re-sync control");
  req(!archived && fx?.finalizeOwned !== true, "setPublished", "toggle absent/disabled");
  req(!archived, "archive", "already archived");
  const bi = ao.bulkIgnore;
  if (bi !== undefined && bi.kind === "partial" && (!Number.isInteger(bi.okCount) || bi.okCount < 1 || bi.okCount >= maxGroup)) {
    out.push(`actionOutcomes.bulkIgnore: okCount must be an integer in [1, ${Math.max(maxGroup - 1, 1)}]`);
  }
}
```

  `toShaperRows`: adapt `ScenarioChangeLogRow[]` to the shaper's `ChangeLogRow` input (synthesize `id` like the modal-data builder does — grep how `buildScenarioModalData` feeds `shapeChangeFeed` and reuse the same adapter; if one exists, import it instead of writing a second). `activeWarningsAfterIgnores`: filter `s.warnings` by `ignoreWarningIndexes` — if `validateIgnoreIndexes`/modal-data builder already computes this, reuse; else 4-line local. `deriveScenarioAttention` import must not create a cycle — `validate.ts` and `deriveScenarioAttention` both live under `lib/dev/`; if a cycle appears, take the derived-actionable check via a lazy `import()`-free helper param following the file's existing pattern for derived checks (verify at code time; the validator test suite will catch a cycle as a load error).
- [ ] **Step 5:** green. `pnpm tsc --noEmit`. **Step 6: commit** `feat(admin): actionOutcomes schema + production-deriver reachability validation`.

### Task 2: passthrough + type ripples

**Files:** Modify `lib/dev/galleryModalTypes.ts`, `app/admin/dev/attention-gallery/buildSwitcherScenarios.ts`, `tests/components/admin/dev/attentionModalSwitcher.test.tsx` (scenario factory at lines 60-75 gains `actionOutcomes: null`). Test: `tests/dev/galleryModalTypes.test.ts` + the file currently pinning `shareToken` passthrough.

- [ ] **Step 1: failing test** — tier-2 scenario carrying `actionOutcomes` survives `partitionScenarios()` verbatim on the rendered entry; absent → `null`. Also: a scenario whose ONLY state is `actionOutcomes` (plus `landing`) is NOT excluded — `isModalVisible` recognizes it (R1-F5e: without this, a scripted-only scenario is silently dropped).
- [ ] **Step 2:** FAIL. **Step 3:** add `actionOutcomes: ScenarioActionOutcomes | null;` to `GallerySwitcherScenario`; forward in `buildSwitcherScenarios.ts` push (`actionOutcomes: s.actionOutcomes ?? null,`); add `s.actionOutcomes !== undefined ||` arm to `isModalVisible` (`buildSwitcherScenarios.ts:45-54`); update the switcher-test factory. **Step 4:** green; run the WHOLE `tests/dev` + `tests/components/admin/dev` folders (ripple check). **Step 5: commit** `feat(admin): thread actionOutcomes to gallery switcher`.

### Task 3: pure builders + relocated `NOOP_ACTIONS`

**Files:** Create `lib/dev/galleryActionScripts.ts`; modify `components/admin/dev/AttentionModalSwitcher.tsx` (delete local `NOOP_ACTIONS`, import from the new module). Test `tests/dev/galleryActionScripts.test.ts`.

**Interfaces — Produces:** `NOOP_ACTIONS` (moved verbatim, exported, same `satisfies Pick<PublishedReviewModalProps, ActionKeys>`); `ScriptedFetchResponse`; `GalleryFetchScript`; `buildScriptedActions(outcomes, acceptableCount)`; `buildFetchScripts(outcomes)`; `buildActionOverrides(outcomes)`.

- [ ] **Step 1: failing tests.** As R0 with these corrections (R1-F3/F7):
  - Import `NOOP_ACTIONS` from the new module (it is now exported; never import from the switcher).
  - Call actions with their REAL arities from the prop types (`ChangesFeed.tsx:20-33` — `useActionState`-driven actions take `(prevState, formData)`): `acts.acceptAllAction(null, new FormData())`, `acts.undoAction(null, new FormData())`; `setPublished(true)`; `archiveAction()` per its own prop type — copy each signature from `PublishedReviewModalProps` at code time; the `satisfies` pin makes a wrong arity a compile error, which IS the test's compile-time half.
  - Derived count (no literal-in-literal-out): `const ACCEPTABLE = 4; const acts = buildScriptedActions({ acceptAll: { kind: "success" } }, ACCEPTABLE); await expect(acts.acceptAllAction(null, new FormData())).resolves.toEqual({ ok: true, count: ACCEPTABLE });` — failure mode: builder hardcoding a count.
  - Hang race, fetch-script sequencing, resync status map, channel-3 unions: as R0 (bulk `respond(0..2)` table, `heldModifiedTime` fixed literal, `PICKER_*` codes).
- [ ] **Step 2:** FAIL. **Step 3: implement** — mappings exactly as R0 §Task 3 Step 3; signature `buildScriptedActions(outcomes: ScenarioActionOutcomes | null, acceptableCount: number)` (rename from `pendingRowCount`; semantic = shaped acceptable entries); `accept` success `{ ok: true, count: 1 }`; return `NOOP_ACTIONS` identity when nothing channel-1 is scripted. **Step 4:** green + switcher still compiles with the import swap. **Step 5: commit** `feat(admin): gallery action-outcome script builders; export NOOP_ACTIONS`.

### Task 4: guard `scripts` prop + mount relocation + page-test ripple

**Files:** Modify `components/admin/dev/GalleryWriteGuard.tsx`, `app/admin/dev/attention-gallery/page.tsx` (remove mount+import), `tests/app/admin/attentionGalleryPage.test.tsx:83-89` (guard-present assertion moves to the switcher test — assert the page does NOT render it and the switcher DOES). Test: extend the existing guard test file if one exists (grep `GalleryWriteGuard` under `tests/` first), else create `tests/dev/galleryWriteGuardScripts.test.tsx`.

- [ ] Steps as R0 Task 4 (scripted-match branch code unchanged), PLUS: prop-less render byte-identical assertion; page test updated in the SAME commit (R1-F5b). Switcher mount lands in Task 6 — this task's switcher change is only the import-site compile fix from Task 3 if sequencing requires; keep page test red-green within this task by asserting via the temporary direct mount in the guard test file, and the page-level absence.
- [ ] **Commit** `feat(admin): scripted fetch responses in GalleryWriteGuard; page mount removed`.

### Task 5: override context + call sites + production pins

Unchanged from R0 Task 5 (module code, 3 one-line call sites, no-provider regression tests mocking the lib modules, provider-mounted override tests, `pnpm build` RSC sanity). **Commit** `feat(admin): dev action override seam for picker controls`.

### Task 6: switcher integration via `ScenarioMount` child (R1-F4 fix)

**Files:** Modify `components/admin/dev/AttentionModalSwitcher.tsx`. Test `tests/dev/attentionModalSwitcherActions.test.tsx` (new; mock `PublishedReviewModal` module, capture props).

- [ ] **Step 1: failing test** — as R0 Task 6 Step 1 (scripted refusal captured on A; NOOP identity on B; context value visible to a probe consumer; guard mounted with scripts).
- [ ] **Step 2:** FAIL. **Step 3: implement** — hooks CANNOT sit after the existing `total === 0` early return (`AttentionModalSwitcher.tsx:133-137`), and hoisting them makes `current` `| undefined` under `noUncheckedIndexedAccess`. Extract a child rendered only when a scenario exists; hooks live in the child, unconditional:

```tsx
function ScenarioMount({ scenario }: { scenario: GallerySwitcherScenario }) {
  const acceptableCount = useMemo(
    () => countAcceptableEntries(scenario), [scenario]); // from data.feed shaped entries - grep GalleryModalData.feed entry shape (shapeChangeFeed output carries `acceptable`) and count e.acceptable; NEVER re-derive the predicate
  const scripted = useMemo(() => buildScriptedActions(scenario.actionOutcomes, acceptableCount), [scenario, acceptableCount]);
  const overrides = useMemo(() => buildActionOverrides(scenario.actionOutcomes), [scenario]);
  const fetchScripts = useMemo(() => buildFetchScripts(scenario.actionOutcomes), [scenario]);
  return (
    <>
      <GalleryWriteGuard key={scenario.id} scripts={fetchScripts} />
      <DevActionOverrideContext.Provider value={overrides}>
        <ShareTokenProvider key={scenario.id} initialToken={scenario.shareToken ?? null} initialEpoch={0}>
          <PublishedReviewModal key={scenario.id} {...scenario.data} {...scripted} />
        </ShareTokenProvider>
      </DevActionOverrideContext.Provider>
    </>
  );
}
```

  Parent return swaps the provider+modal block for `<ScenarioMount scenario={current} />` (after the early return, `current` is definite). Keep the existing provider-keying comment in place on the child.
- [ ] **Step 4:** green (+ whole `tests/components/admin/dev` folder). **Step 5: commit** `feat(admin): ScenarioMount builds scripted closures + override provider per scenario`.

### Task 7: roster + group + registry ripples (R1-F3f/F5c/F6 fixes)

**Files:** Modify `lib/dev/galleryModalTypes.ts` (`ScenarioGroupId`, `GROUP_ORDER`, **`GROUP_LABELS` gains `actions: "Action outcomes"`** — `Record<ScenarioGroupId, string>` at lines 117-126 otherwise fails to compile), `lib/dev/attentionScenarios/tier2.ts` (**`T2_REQUIRED_IDS` at lines 40-98 gains all 15 ids** — exact set-equality test `attentionScenariosTier2.test.ts:110-118`), `tests/dev/attentionScenariosIndex.test.ts:112-125` (tier-exclusivity field enumeration gains `actionOutcomes`). Tests: those three files.

- [ ] **Step 1: failing tests** — 15 ids in `T2_REQUIRED_IDS` + catalog; `"actions"` in `GROUP_ORDER`/`GROUP_LABELS`; tier-exclusivity walker covers `actionOutcomes`; every roster scenario validates `[]` clean (the index test's whole-catalog validation covers this once entries exist).
- [ ] **Step 2:** FAIL. **Step 3: roster.** Use the FILE's real factories: `hold(entityKey)` (line 238) for mi11 holds; `logRow(minute, over)` (line 409) for changeLog rows. Feed-bearing rows must satisfy the SHAPER arms: acceptable row = `logRow(1, { source: "auto_apply", status: "applied", acknowledged_at: null })`; undo row = `logRow(2, { status: "applied", individually_undoable: true, change_kind: "crew_added" })` (a `UNDOABLE_CHANGE_KINDS` member, `lib/sync/holds/types.ts:46`) — confirm `logRow` defaults at code time and override every arm-relevant column explicitly. Warnings for bulk scenarios: 3 (partial) / 2 (fail) same-code DISTINCT-`rawSnippet` ignorable warnings via the file's warning helpers (grep tier2.ts for its ParseWarning construction; distinct snippets are REQUIRED or the group collapses to size 1). Resolve scenario alert: `alert(pickByDerivedClass("actionable"))` (helper at tier2.ts:150-173). **Error codes: every channel-1 scripted code MUST exist in `MESSAGE_CATALOG`** (R1-F6): before writing each, `grep -n "<CODE>" lib/messages/catalog.ts`; source candidates from the real action implementations (grep the server actions wired into `app/admin/_showReviewModal.tsx` for their emitted `{ ok: false, code }` values — e.g. `UNDO_NOT_FOUND` is cataloged); if an action's real codes are all cataloged, pick one per control; NEVER invent a code for a channel-1 script (blank `ErrorExplainer`). `t2-act-publish-generic` uses `"infra_error"` DELIBERATELY (uncataloged-by-design generic arm, `PublishedToggle.tsx:116` non-member → `genericError`, no ErrorExplainer on that arm — verify arm renders copy without catalog at code time). Scenario list otherwise as R0 §Task 7 (15 ids, labels, fixtures, landing) with `t2-act-feed-errors` rows swapped to the shaper-arm rows above.
- [ ] **Step 4:** green across `tests/dev`. **Step 5: commit** `feat(admin): action-outcome scenario roster + actions nav group + registry ripples`.

### Task 8: e2e — click-driven outcomes + network-negative containment (R1-F7b/F8 fixes)

**Files:** Modify `tests/e2e/attention-modal-gallery.spec.ts`.

- [ ] **Step 1:** scenarios under test IMPORT their numbers: `import { TIER2_SCENARIOS } from "@/lib/dev/attentionScenarios/tier2"` (or the exported accessor the file provides — grep; the point is okCount/groupSize derive from the scenario object, no duplicated literals). Assertions as R0 Task 8 plus, in EVERY scripted-endpoint test, a `page.on("request")` recorder (pattern already in the file at lines 191-295) asserting ZERO requests to `/api/admin/sync/`, `/alerts/`-resolve, and `/data-quality/ignore` reach the network (scripted branch intercepts before dispatch; `data-gallery-scripted-write` alone proves the branch ran, not non-egress — both asserted). Outcome-copy assertions must assert NON-EMPTY rendered copy (kills the blank-ErrorExplainer failure mode) and scope to the outcome region (clone-and-strip if the label also renders elsewhere).
- [ ] **Step 2:** run dev-build project green. **Step 3: commit** `test(admin): e2e coverage for gallery action outcomes`.

### Task 9: docs + DEFERRED un-defer

As R0 Task 9 Steps 1-2 (DEFERRED rewrite; pre-push gates `pnpm tsc --noEmit && pnpm lint && pnpm format:check && pnpm test`). **Commit** `docs(admin): un-defer modal-state-coverage class 6`.

### Task 10: gates + close-out pipeline (R1-F10 fix)

- [ ] **Step 1: impeccable dual-gate with canonical v3 setup** (invariant 8, exact contract): `context.mjs` context load (PRODUCT.md + DESIGN.md) → register reference read → `/impeccable critique` then `/impeccable audit` over the affected diff (switcher, guard, context module, 3 production controls, roster/nav). P0/P1 fixed or DEFERRED.md-deferred. Findings + dispositions recorded in `docs/superpowers/plans/2026-07-23-gallery-action-outcomes/CLOSEOUT.md` §Impeccable (the plan-dir stand-in for a milestone handoff §12).
- [ ] **Step 2: whole-diff cross-model adversarial review** (fresh-eyes, REVIEWER ONLY, split tight-scope briefs if the diff is large — AGENTS.md default for big diffs) → iterate to APPROVE, no round budget; ladder per the spec TRIAGE record if Codex wedges again. Triage per deferral discipline into CLOSEOUT.md.
- [ ] **Step 3: ship.** Push; open PR (merge-commit convention; PR body ends with the standard generated-with footer). Real CI green on GitHub Actions (reconcile DIRTY/no-checks states; empty check-suite → empty-commit retrigger per #557 memory). `gh pr merge --merge` in the same turn CI goes green.
- [ ] **Step 4: sync + release.** `git -C /Users/ericweiss/FX-Webpage-Template pull --ff-only && git -C /Users/ericweiss/FX-Webpage-Template rev-list --left-right --count main...origin/main` == `0  0`; set ship-state `stage: "done"`; `CronDelete` the marker's `cronJobId`.

## Self-Review (post-R1)

1. Spec coverage: unchanged map + §5 containment now has network-negative proof (T8); close-out stages present (T10).
2. Every R1 finding has a named fix: F1→T1/T3/T6/T7 acceptable-predicate + shaper reuse; F2→T1 deriver reuse + corrected table; F3→T3 arities/NOOP export, T1 `warn` reuse + value import, T7 GROUP_LABELS + real factories; F4→T6 ScenarioMount; F5→T2 factory+isModalVisible, T4 page test, T7 T2_REQUIRED_IDS + tier-exclusivity; F6→T7 catalog-verified codes + T8 non-empty-copy; F7→T3 derived count, T8 imported scenario numbers; F8→T8 request recorder; F9→facts inlined above (remaining code-time verifications are named greps with cited anchors, not open questions); F10→T10.
3. Type consistency: `buildScriptedActions(outcomes, acceptableCount)` consistent T3/T6; `GalleryFetchScript` T3/T4/T6; `NOOP_ACTIONS` import direction T3→switcher.
