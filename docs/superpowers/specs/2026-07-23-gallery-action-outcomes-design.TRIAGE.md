# Gallery Action Outcomes — spec review triage record

## R1 dispatch record (2026-07-23 evening CDT)

Cross-model adversarial review could not be obtained. Ladder walked in full:

1. `codex-guard review` (repo-access brief): 3/3 attempts died `no_o_file` (exec exits 0, no output file — the known killed-exec wedge class). `spec-r1-out/result.json`: `status no_verdict, failureReason attempts_exhausted`.
2. Inlined rung (full spec text embedded, tools forbidden): same outcome (`spec-r1b-out`, no_verdict).
3. `codex-guard review --fallback --artifact` companion wedge rescue: killed mid-attempt-1 (`spec-r1c-out`).

Per the documented ladder (MEMORY: inlined-codex-death → self-certify rung after ×3 death), R1 was satisfied by a **self-certify enhanced review**: fresh-eyes pass over the full spec, every load-bearing contract claim re-verified against live code by hand.

## Self-certify findings (all repaired in the same commit)

- **F1 (MEDIUM, design gap): `actionOutcomes` data flow to the client was unstated.** Scenario catalog is server-side; closures must be built client-side. Repair: `GallerySwitcherScenario` gains a serializable `actionOutcomes` passthrough (precedent: per-scenario `shareToken`, `lib/dev/galleryModalTypes.ts:43`); spec §3.1 now states no function crosses the RSC boundary.
- **F2 (MEDIUM, design gap): `GalleryWriteGuard` mounts prop-less from the server page (`app/admin/dev/attention-gallery/page.tsx:51`), which cannot carry per-scenario scripts.** Repair: spec §3.2 now relocates the mount into the client switcher (keyed per scenario, single instance, page mount removed; scripts-absent behavior byte-identical).
- **F3 (LOW, citation): PublishedToggle popover cite tightened to the two render arms (141-149, 176-183).**
- **F4 (LOW, behavior note): `t2-act-resync-success` triggers `router.refresh()`; noted as harmless soft refresh in the roster.**

Verified-sound during the same pass (no change): `useActionState` arity compatibility of scripted closures; type-only `typeof` imports in the override context (erased, no server code in client bundle); `Promise.all` per-item branching order-independence for `bulkIgnore.partial` (client counts `r.ok`, order irrelevant); `show_not_found` lowercase code (`ArchiveShowButton.tsx:150`); channel-3 override signatures match the real action input/result unions.

## Plan review record

- Plan R1 (Codex, dispatch bec49549v): **BLOCKING, 10 findings** — all verified against live code, all real, all repaired across three commits (shaper-derived reachability via `shapeChangeFeed`/`deriveScenarioAttention`/`groupIgnorableByCode`; `ScenarioMount` child for hook placement; `NOOP_ACTIONS` export relocation; registry ripples `T2_REQUIRED_IDS`/`GROUP_LABELS`/tier-exclusivity/`isModalVisible`/page-test; cataloged-code discipline; derived test expectations; e2e non-egress recorder; Task 10 close-out pipeline; plan made fully self-contained).
- Plan R2: dispatched twice (plan-r2-out, plan-r2b-out) — both `no_verdict` (same killed-exec wedge as the spec rounds; R1's success shows the wedge is intermittent). Per the ladder, R2 closed by **self-certify enhanced review**: re-audited every R1 vector against the repaired plan (arities, deriver reuse, ripple coverage, hook placement, roster reachability vs validator, dangling-reference sweep to zero). No new defects found. The Stage-4 whole-diff review re-covers the implementation with fresh eyes.

## Standing

Spec status: APPROVED via self-certify rung (cross-model unavailable, ladder exhausted and recorded above). The whole-diff close-out review (Stage 4) re-covers this surface with fresh eyes; if Codex dispatch has recovered by then, the spec rides along in that review's scope.
