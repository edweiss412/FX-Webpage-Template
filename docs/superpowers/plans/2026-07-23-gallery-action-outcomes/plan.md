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
- [ ] **Step 3: types** — in `types.ts`, above `AttentionScenario`:

```ts
export type PropActionOutcome =
  | { kind: "success" }
  | { kind: "error"; code: string }
  | { kind: "pending" };

export const RESYNC_ERROR_CODES = [
  "SYNC_INFRA_ERROR", "PENDING_SYNC_NOT_FOUND", "FINALIZE_OWNED_SHOW", "SHOW_BUSY_RETRY",
] as const;

export type ScenarioActionOutcomes = {
  setPublished?: PropActionOutcome;
  archive?: PropActionOutcome | { kind: "not_found" };
  undo?: PropActionOutcome;
  accept?: PropActionOutcome;
  acceptAll?: PropActionOutcome;
  approve?: PropActionOutcome;
  reject?: PropActionOutcome;
  resync?:
    | { kind: "success"; outcome?: "applied" | "stage" | "skipped" | "asset_recovery" }
    | { kind: "shrink_held"; detail: string }
    | { kind: "error"; code: (typeof RESYNC_ERROR_CODES)[number] }
    | { kind: "pending" };
  resolve?: { kind: "success" } | { kind: "error"; code: string } | { kind: "pending" };
  bulkIgnore?: { kind: "partial"; okCount: number } | { kind: "fail" } | { kind: "pending" };
  crewReset?: { kind: "success" } | { kind: "not_found" } | { kind: "error" } | { kind: "pending" };
  rotate?: { kind: "success" } | { kind: "error" } | { kind: "pending" };
  everyoneReset?: { kind: "success" } | { kind: "error" } | { kind: "pending" };
};
```

and after `landing` (~line 181):

```ts
  /** Tier 2 only - scripts the outcome each modal control's action resolves to.
   *  Click-driven: nothing fires on mount. Absent key = current default
   *  (NOOP success for prop closures; GalleryWriteGuard 403 for writes). */
  actionOutcomes?: ScenarioActionOutcomes;
```
- [ ] **Step 4: validator.** `validate.ts` imports: `RESYNC_ERROR_CODES` (VALUE import from `./types`), `shapeChangeFeed` from `@/lib/sync/feed/shapeChangeFeed`, `groupIgnorableByCode` from `@/lib/dataQuality/bulkIgnoreGroups`, `deriveScenarioAttention` from `./..` (wherever validate already imports it — it does for the PARSE_ERROR check; reuse). Kind-allowlist walk:

```ts
const ACTION_OUTCOME_KINDS: Record<string, ReadonlySet<string>> = {
  setPublished: new Set(["success", "error", "pending"]),
  archive: new Set(["success", "error", "pending", "not_found"]),
  undo: new Set(["success", "error", "pending"]),
  accept: new Set(["success", "error", "pending"]),
  acceptAll: new Set(["success", "error", "pending"]),
  approve: new Set(["success", "error", "pending"]),
  reject: new Set(["success", "error", "pending"]),
  resync: new Set(["success", "shrink_held", "error", "pending"]),
  resolve: new Set(["success", "error", "pending"]),
  bulkIgnore: new Set(["partial", "fail", "pending"]),
  crewReset: new Set(["success", "not_found", "error", "pending"]),
  rotate: new Set(["success", "error", "pending"]),
  everyoneReset: new Set(["success", "error", "pending"]),
};

function validateActionOutcomes(s: AttentionScenario, out: string[]): void {
  const ao = s.actionOutcomes;
  if (!isPlainObject(ao)) { out.push("actionOutcomes: must be a plain object"); return; }
  const keys = Object.keys(ao);
  if (keys.length === 0) { out.push("actionOutcomes: empty object is a no-op"); return; }
  for (const key of keys) {
    const allowed = ACTION_OUTCOME_KINDS[key];
    if (allowed === undefined) { out.push(`actionOutcomes: unknown key ${key}`); continue; }
    const v = (ao as Record<string, unknown>)[key];
    if (!isPlainObject(v) || typeof (v as { kind?: unknown }).kind !== "string" || !allowed.has((v as { kind: string }).kind)) {
      out.push(`actionOutcomes.${key}: kind must be one of ${[...allowed].join("/")}`);
      continue;
    }
    const kind = (v as { kind: string }).kind;
    if (kind === "error" && key !== "crewReset" && key !== "rotate" && key !== "everyoneReset") {
      const code = (v as { code?: unknown }).code;
      if (typeof code !== "string" || code.trim() === "") {
        out.push(`actionOutcomes.${key}: error code must be non-blank`);
      } else if (key === "resync" && !(RESYNC_ERROR_CODES as readonly string[]).includes(code)) {
        out.push(`actionOutcomes.resync: code must be one of ${RESYNC_ERROR_CODES.join("/")}`);
      }
    }
    if (key === "resync" && kind === "shrink_held") {
      const detail = (v as { detail?: unknown }).detail;
      if (typeof detail !== "string" || detail.trim() === "") out.push("actionOutcomes.resync: shrink_held detail must be non-blank");
    }
  }
  validateActionOutcomeReachability(s, ao as ScenarioActionOutcomes, out);
}
```

Wire-in inside `validateModalStateFields`, after the `fixture` block: `if (tier2Only(s.actionOutcomes !== undefined, "actionOutcomes")) validateActionOutcomes(s, out);`. Reachability via PRODUCTION derivers:

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
  - Hang race, fetch-script sequencing, resync status map, channel-3 unions:

```ts
const HANG_TIMEOUT = 50;
const never = (p: Promise<unknown>) =>
  Promise.race([p.then(() => "resolved"), new Promise((r) => setTimeout(() => r("hung"), HANG_TIMEOUT))]);

it("pending closures never settle", async () => {
  const acts = buildScriptedActions({ undo: { kind: "pending" } }, 0);
  await expect(never(acts.undoAction(null, new FormData()))).resolves.toBe("hung");
});
it("builds fetch scripts with sequenced bulk-ignore", () => {
  const scripts = buildFetchScripts({ bulkIgnore: { kind: "partial", okCount: 2 },
    resync: { kind: "shrink_held", detail: "2 crew removed" } });
  const bulk = scripts.find((s) => s.key === "bulkIgnore")!;
  expect(bulk.respond(0)).toEqual({ status: 200, body: { status: "ignored" } });
  expect(bulk.respond(1)).toEqual({ status: 200, body: { status: "ignored" } });
  expect(bulk.respond(2)).toEqual({ status: 500, body: { ok: false, code: "GALLERY_SCRIPTED_FAIL" } });
  const resync = scripts.find((s) => s.key === "resync")!;
  expect(resync.pathPattern.test("/api/admin/sync/gallery-show")).toBe(true);
  expect(resync.respond(0)).toEqual({ status: 200, body: { ok: true,
    result: { outcome: "shrink_held", detail: "2 crew removed", heldModifiedTime: "2026-06-29T00:00:00.000Z" } } });
});
it("maps resync error codes to route statuses", () => {
  const s = buildFetchScripts({ resync: { kind: "error", code: "PENDING_SYNC_NOT_FOUND" } })[0]!;
  expect(s.respond(0)).toEqual({ status: 404, body: { ok: false, error: "PENDING_SYNC_NOT_FOUND" } });
});
it("builds channel-3 overrides matching the real result unions", async () => {
  const o = buildActionOverrides({ crewReset: { kind: "not_found" }, rotate: { kind: "success" } })!;
  await expect(o.resetCrewMemberSelection!({ showId: "x", crewMemberId: "y" }))
    .resolves.toEqual({ ok: false, code: "PICKER_CREW_MEMBER_NOT_FOUND" });
  await expect(o.rotateShareToken!({ showId: "x" }))
    .resolves.toEqual({ ok: true, new_share_token: "gallery-share-token-rotated", new_epoch: 2 });
  expect(o.resetPickerEpoch).toBeUndefined();
  expect(buildActionOverrides(null)).toBeNull();
});
```

  (Failure modes: a settled pending closure; unsequenced bulk responses; wrong status mapping; override shape drifting from the real result unions.)
- [ ] **Step 2:** FAIL. **Step 3: implement.** Signature `buildScriptedActions(outcomes: ScenarioActionOutcomes | null, acceptableCount: number)`. Response mappings (spec §2/§3.2 envelopes):
  - resync success → `200 { ok: true, result: { outcome: outcome ?? "applied" } }`; shrink → `200 { ok: true, result: { outcome: "shrink_held", detail, heldModifiedTime: "2026-06-29T00:00:00.000Z" } }`; error → status map `SYNC_INFRA_ERROR:500, PENDING_SYNC_NOT_FOUND:404, FINALIZE_OWNED_SHOW:409, SHOW_BUSY_RETRY:409`, body `{ ok: false, error: code }`; pending → `"hang"`.
  - resolve success → `200 { status: "resolved", id: "gallery-alert", resolved_at: "2026-07-01T00:00:00.000Z" }`; error → `500 { ok: false, code }`; pending → hang.
  - bulkIgnore partial → `idx < okCount ? 200 { status: "ignored" } : 500 { ok: false, code: "GALLERY_SCRIPTED_FAIL" }` (synthetic code, never rendered — client branches on `r.ok`, `BulkIgnoreControls.tsx:100`); fail → always the 500 arm; pending → hang.
  - Path patterns: resync `/^\/api\/admin\/sync\//`; resolve `/^\/api\/admin\/show\/[^/]+\/alerts\/[^/]+\/resolve$/`; bulkIgnore `/\/data-quality\/ignore$/`.
  - Channel-1: shallow copy of `NOOP_ACTIONS`, override scripted keys with closures matching each prop's exact signature; `pending` = `() => new Promise<never>(() => {})`; `setPublished` error → `{ ok: false, code }`; `archive` `not_found` → `{ ok: false, code: "show_not_found" }`; `accept` success `{ ok: true, count: 1 }`; `acceptAll` success `{ ok: true, count: acceptableCount }`; return `NOOP_ACTIONS` identity when nothing channel-1 is scripted.
  - Channel-3 (`buildActionOverrides`): crewReset success `{ ok: true, reset_at: "2026-07-01T12:00:00.000Z" }`, not_found → `{ ok: false, code: "PICKER_CREW_MEMBER_NOT_FOUND" }`, error → `{ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" }`; rotate success `{ ok: true, new_share_token: "gallery-share-token-rotated", new_epoch: 2 }`, error → `PICKER_RESOLVER_LOOKUP_FAILED`; everyoneReset success `{ ok: true, new_epoch: 2 }`, error → same code; pending → never-resolving; return `null` when no channel-3 key scripted. **Step 4:** green + switcher still compiles with the import swap. **Step 5: commit** `feat(admin): gallery action-outcome script builders; export NOOP_ACTIONS`.

### Task 4: guard `scripts` prop + mount relocation + page-test ripple

**Files:** Modify `components/admin/dev/GalleryWriteGuard.tsx`, `app/admin/dev/attention-gallery/page.tsx` (remove mount+import), `tests/app/admin/attentionGalleryPage.test.tsx:83-89` (guard-present assertion moves to the switcher test — assert the page does NOT render it and the switcher DOES). Test: extend the existing guard test file if one exists (grep `GalleryWriteGuard` under `tests/` first), else create `tests/dev/galleryWriteGuardScripts.test.tsx`.

- [ ] **Step 1: failing test** — render `<GalleryWriteGuard scripts={[shrinkScript]} />` (build via `buildFetchScripts`); `await fetch("/api/admin/sync/x", { method: "POST" })` returns the scripted 200 body and sets `data-gallery-scripted-write`; non-matching `POST /api/other` still 403 `GALLERY_DISPLAY_ONLY` + `data-gallery-blocked-write`; GET passes through (spy original fetch); prop-less render behaves byte-identically to today (403 path only); a `"hang"` respond never settles (race pattern from Task 3).
- [ ] **Step 2:** FAIL. **Step 3: implement** — add `scripts?: readonly GalleryFetchScript[]`; inside the effect, `const counters = new Map<string, number>()` per effect run, deps `[scripts]`; before the 403 branch:

```ts
      const path = url.replace(/^https?:\/\/[^/]+/, "");
      const script = scripts?.find((sc) => sc.method === method && sc.pathPattern.test(path));
      if (script) {
        const n = counters.get(script.key) ?? 0;
        counters.set(script.key, n + 1);
        document.documentElement.setAttribute("data-gallery-scripted-write", `${method} ${path}`);
        const r = script.respond(n);
        if (r === "hang") return new Promise<Response>(() => {});
        return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
      }
```

- [ ] **Step 4:** remove the page mount + import (`page.tsx:32,51`); update `tests/app/admin/attentionGalleryPage.test.tsx:83-89` in the SAME commit: page does NOT render the guard; guard presence is asserted at the switcher level (Task 6's `ScenarioMount` renders it — until Task 6 lands, pin presence via the guard test file's direct render so the suite stays green at this commit boundary).
- [ ] **Step 5:** green + `pnpm tsc --noEmit`.
- [ ] **Commit** `feat(admin): scripted fetch responses in GalleryWriteGuard; page mount removed`.

### Task 5: override context + call sites + production pins

**Files:** Create `components/admin/dev/actionOverrideContext.tsx`; modify `components/admin/wizard/CrewRowActions.tsx:192`, `app/admin/show/[slug]/RotateShareTokenButton.tsx:155`, `app/admin/show/[slug]/PickerResetControl.tsx:159`. Test `tests/components/actionOverrideDefaults.test.tsx`.

- [ ] **Step 1: failing tests** — per component: `vi.mock` the lib action module; render with minimal props and NO provider; drive to confirm; assert the mocked REAL action called with the component's own args (pins prod-default). Then one provider-mounted case each: provider supplies a `vi.fn` override; assert override called AND real mock NOT called. Reuse each component's existing test scaffolding (grep `CrewRowActions` under `tests/` first); jsdom + the project's `act`/`waitFor` transition-flush patterns.
- [ ] **Step 2:** FAIL. **Step 3: implement:**

```tsx
"use client";
// Null-default override seam for the 3 modal controls that call server actions
// by direct import (spec 2026-07-23 §3.3). Production never mounts the
// provider; the hook then returns undefined and callers use the real import.
import { createContext, useContext } from "react";
import type { resetCrewMemberSelection } from "@/lib/auth/picker/resetCrewMemberSelection";
import type { rotateShareToken } from "@/lib/auth/picker/rotateShareToken";
import type { resetPickerEpoch } from "@/lib/auth/picker/resetPickerEpoch";

export type DevActionOverrides = {
  resetCrewMemberSelection?: typeof resetCrewMemberSelection;
  rotateShareToken?: typeof rotateShareToken;
  resetPickerEpoch?: typeof resetPickerEpoch;
};

export const DevActionOverrideContext = createContext<DevActionOverrides | null>(null);

export function useDevActionOverride<K extends keyof DevActionOverrides>(key: K): DevActionOverrides[K] {
  return useContext(DevActionOverrideContext)?.[key];
}
```

Call sites (one hook line + one wrap each): `const overrideReset = useDevActionOverride("resetCrewMemberSelection");` then `const r = await (overrideReset ?? resetCrewMemberSelection)({ showId, crewMemberId: crewId });`; same shape `(overrideRotate ?? rotateShareToken)({ showId })` and `(overrideEpoch ?? resetPickerEpoch)({ showId })`.
- [ ] **Step 4:** green. **Step 5:** `pnpm build` sanity (type-only imports must not pull server code into the client graph; build catches RSC violations). **Step 6: commit** `feat(admin): dev action override seam for picker controls`.

### Task 6: switcher integration via `ScenarioMount` child (R1-F4 fix)

**Files:** Modify `components/admin/dev/AttentionModalSwitcher.tsx`. Test `tests/dev/attentionModalSwitcherActions.test.tsx` (new; mock `PublishedReviewModal` module, capture props).

- [ ] **Step 1: failing test** — render the switcher with a two-scenario fixture: scenario A scripts `setPublished: { kind: "error", code: "PUBLISH_BLOCKED_PENDING_REVIEW" }`, scenario B unscripted. Mock the `PublishedReviewModal` module (do NOT render the real modal tree in jsdom) and capture its props. Assert: (a) scenario A's captured `setPublished` resolves the scripted refusal; (b) after switching, scenario B's captured `setPublished` IS `NOOP_ACTIONS.setPublished` (identity); (c) a probe consumer of `DevActionOverrideContext` rendered inside sees the built overrides when channel-3 keys are scripted and `null` otherwise; (d) `GalleryWriteGuard` is rendered with the scenario's fetch scripts (mock it too and capture props). Failure modes: scripts leaking across scenarios; provider never mounted; guard mount lost in the relocation.
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
- [ ] **Step 2:** FAIL. **Step 3: roster.** Use the FILE's real factories: `hold(entityKey)` (line 238) for mi11 holds; `logRow(minute, over)` (line 409) for changeLog rows. Feed-bearing rows must satisfy the SHAPER arms: acceptable row = `logRow(1, { source: "auto_apply", status: "applied", acknowledged_at: null })`; undo row = `logRow(2, { status: "applied", individually_undoable: true, change_kind: "crew_added" })` (a `UNDOABLE_CHANGE_KINDS` member, `lib/sync/holds/types.ts:46`) — confirm `logRow` defaults at code time and override every arm-relevant column explicitly. Warnings for bulk scenarios: 3 (partial) / 2 (fail) same-code DISTINCT-`rawSnippet` ignorable warnings via the file's warning helpers (grep tier2.ts for its ParseWarning construction; distinct snippets are REQUIRED or the group collapses to size 1). Resolve scenario alert: `alert(pickByDerivedClass("actionable"))` (helper at tier2.ts:150-173). **Error codes: every channel-1 scripted code MUST exist in `MESSAGE_CATALOG`** (R1-F6): before writing each, `grep -n "<CODE>" lib/messages/catalog.ts`; source candidates from the real action implementations (grep the server actions wired into `app/admin/_showReviewModal.tsx` for their emitted `{ ok: false, code }` values — e.g. `UNDO_NOT_FOUND` is cataloged); if an action's real codes are all cataloged, pick one per control; NEVER invent a code for a channel-1 script (blank `ErrorExplainer`). `t2-act-publish-generic` uses `"infra_error"` DELIBERATELY (uncataloged-by-design generic arm, `PublishedToggle.tsx:116` non-member → `genericError`, no ErrorExplainer on that arm — verify arm renders copy without catalog at code time). Full roster (15; codes marked `<CATALOG>` are chosen at code time from the real actions' emitted cataloged codes per the grep discipline above):

```ts
    // ── Action outcomes (spec 2026-07-23, class-6 un-deferral) ──────────────
    { id: "t2-act-resync-error", tier: 2, label: "Re-sync: infra error", alerts: [], holds: [],
      landing: "actions", actionOutcomes: { resync: { kind: "error", code: "SYNC_INFRA_ERROR" } } },
    { id: "t2-act-resync-shrink", tier: 2, label: "Re-sync: shrink held for confirmation", alerts: [], holds: [],
      landing: "actions", actionOutcomes: { resync: { kind: "shrink_held", detail: "2 crew members removed" } } },
    { id: "t2-act-resync-success", tier: 2, label: "Re-sync: success", alerts: [], holds: [],
      landing: "actions", actionOutcomes: { resync: { kind: "success" } } },
    { id: "t2-act-publish-refusal", tier: 2, label: "Publish toggle: known refusal", alerts: [], holds: [],
      landing: "actions", actionOutcomes: { setPublished: { kind: "error", code: "PUBLISH_BLOCKED_PENDING_REVIEW" } } },
    { id: "t2-act-publish-generic", tier: 2, label: "Publish toggle: generic error", alerts: [], holds: [],
      landing: "actions", actionOutcomes: { setPublished: { kind: "error", code: "infra_error" } } },
    { id: "t2-act-archive-refusal", tier: 2, label: "Archive: finalize-owned refusal", alerts: [], holds: [],
      fixture: { finalizeOwned: true }, landing: "actions",
      actionOutcomes: { archive: { kind: "error", code: "FINALIZE_OWNED_SHOW" } } },
    { id: "t2-act-archive-notfound", tier: 2, label: "Archive: show since deleted", alerts: [], holds: [],
      landing: "actions", actionOutcomes: { archive: { kind: "not_found" } } },
    { id: "t2-act-feed-errors", tier: 2, label: "Changes feed: every action errors", alerts: [],
      holds: [hold("Casey Brooks")],
      changeLog: [
        logRow(1, { source: "auto_apply", status: "applied", acknowledged_at: null }),          // acceptable arm
        logRow(2, { status: "applied", individually_undoable: true, change_kind: "crew_added" }), // undo arm
      ],
      actionOutcomes: { approve: { kind: "error", code: "<CATALOG>" }, reject: { kind: "error", code: "<CATALOG>" },
        accept: { kind: "error", code: "<CATALOG>" }, acceptAll: { kind: "error", code: "<CATALOG>" },
        undo: { kind: "error", code: "UNDO_NOT_FOUND" } } },
    { id: "t2-act-resolve-error", tier: 2, label: "Alert resolve: error",
      alerts: [alert(pickByDerivedClass("actionable"))], holds: [],
      actionOutcomes: { resolve: { kind: "error", code: "RESOLVE_INFRA" } } }, // generic-fallback arm by intent
    { id: "t2-act-bulkignore-partial", tier: 2, label: "Bulk ignore: partial success", alerts: [], holds: [],
      warnings: [/* 3 same-code DISTINCT-rawSnippet ignorable warnings via the file's warning helper */],
      actionOutcomes: { bulkIgnore: { kind: "partial", okCount: 2 } } },
    { id: "t2-act-bulkignore-fail", tier: 2, label: "Bulk ignore: total failure", alerts: [], holds: [],
      warnings: [/* 2 same-code DISTINCT-rawSnippet */], actionOutcomes: { bulkIgnore: { kind: "fail" } } },
    { id: "t2-act-crewreset-notfound", tier: 2, label: "Crew reset: roster changed underneath", alerts: [], holds: [],
      landing: "actions", actionOutcomes: { crewReset: { kind: "not_found" } } },
    { id: "t2-act-share-errors", tier: 2, label: "Share hub: rotate + reset errors", alerts: [], holds: [],
      fixture: { share: { linkActive: true, crewEmails: 3 } }, landing: "actions",
      actionOutcomes: { rotate: { kind: "error" }, everyoneReset: { kind: "error" } } },
    { id: "t2-act-share-success", tier: 2, label: "Share hub: rotate/reset/crew-reset success", alerts: [], holds: [],
      fixture: { share: { linkActive: true, crewEmails: 3 } }, landing: "actions",
      actionOutcomes: { rotate: { kind: "success" }, everyoneReset: { kind: "success" }, crewReset: { kind: "success" } } },
    { id: "t2-act-pending", tier: 2, label: "In-flight: every control hangs", alerts: [],
      holds: [hold("Riley Sloane")],
      changeLog: [logRow(3, { status: "applied", individually_undoable: true, change_kind: "crew_added" })],
      fixture: { share: { linkActive: true, crewEmails: 3 } },
      actionOutcomes: { resync: { kind: "pending" }, setPublished: { kind: "pending" }, approve: { kind: "pending" },
        undo: { kind: "pending" }, crewReset: { kind: "pending" }, rotate: { kind: "pending" } } },
```

The two bracketed warning arrays are the ONLY authoring slots left to code time, constrained fully: same `code`, distinct `rawSnippet` each, ignorable per `groupIgnorableByCode`, constructed with the file's existing ParseWarning helper (grep `warnings:` in `tier2.ts` for the pattern; a wrong construction fails Task 1's reachability validator, which is the guard).
- [ ] **Step 4:** green across `tests/dev`. **Step 5: commit** `feat(admin): action-outcome scenario roster + actions nav group + registry ripples`.

### Task 8: e2e — click-driven outcomes + network-negative containment (R1-F7b/F8 fixes)

**Files:** Modify `tests/e2e/attention-modal-gallery.spec.ts`.

- [ ] **Step 1:** scenarios under test IMPORT their numbers: grep `tier2.ts` for its exported catalog accessor and derive okCount/groupSize from the scenario object — no duplicated literals. Per-scenario assertions (each names its failure mode):
  - `t2-act-resync-error`: jump to scenario (existing helpers), click Re-sync, expect the error panel scoped to its container (`ReSyncButton.tsx:321` region) with NON-EMPTY catalog copy; `data-gallery-scripted-write` contains `POST /api/admin/sync/`.
  - `t2-act-resync-shrink`: click, expect confirm-panel text `This re-sync would reduce the show:` + the scripted detail substring (`ReSyncButton.tsx:368`).
  - `t2-act-publish-refusal`: toggle, expect refusal-popover catalog copy substring scoped to the toggle's popover region.
  - `t2-act-bulkignore-partial`: click bulk chip + confirm, expect `Ignored ${okCount} of ${groupSize}. Refresh to see the rest.` with both numbers derived from the imported scenario.
  - `t2-act-crewreset-notfound`: open crew ⋮, confirm reset, expect the not-found banner sentence (`CrewRowActions.tsx:196-200` copy).
  - `t2-act-share-success`: open share hub, rotate, expect success banner + rotated-token surface.
  - `t2-act-pending`: click Re-sync, `page.waitForTimeout(500)`, busy label still present (`ReSyncButton.tsx:314-317`) — bounded settle, not a poll.
  - EVERY scripted-endpoint test: `page.on("request")` recorder (pattern at `attention-modal-gallery.spec.ts:191-295`) asserting ZERO requests to `/api/admin/sync/`, alert-resolve, or `/data-quality/ignore` reach the network — the HTML marker proves the scripted branch ran; the recorder proves non-egress; both are asserted (spec §5).
  - Containment sweep: extend the existing non-GET sweep so every recorded write carries `data-gallery-scripted-write` OR `data-gallery-blocked-write`.
  - Outcome-copy assertions assert NON-EMPTY rendered copy (kills blank-ErrorExplainer) and scope to the outcome region (clone-and-strip if the label renders elsewhere too).
- [ ] **Step 2:** run dev-build project green. **Step 3: commit** `test(admin): e2e coverage for gallery action outcomes`.

### Task 9: docs + DEFERRED un-defer

**Files:** Modify `DEFERRED.md` (class-6 entry, lines 117-129).

- [ ] **Step 1:** keep the historical entry, append: `**Un-deferred 2026-07-23** by docs/superpowers/specs/2026-07-23-gallery-action-outcomes-design.md (this PR): all six surfaces plus rotate/everyone-reset/archive are click-demonstrable via the scripted-outcome layer.`
- [ ] **Step 2: pre-push gates** — `pnpm tsc --noEmit && pnpm lint && pnpm format:check && pnpm test` all green (env-bound/e2e suites are excluded from `pnpm test` by design; e2e ran in Task 8).
- [ ] **Step 3: commit** `docs(admin): un-defer modal-state-coverage class 6`.

### Task 10: gates + close-out pipeline (R1-F10 fix)

- [ ] **Step 1: impeccable dual-gate with canonical v3 setup** (invariant 8, exact contract): `context.mjs` context load (PRODUCT.md + DESIGN.md) → register reference read → `/impeccable critique` then `/impeccable audit` over the affected diff (switcher, guard, context module, 3 production controls, roster/nav). P0/P1 fixed or DEFERRED.md-deferred. Findings + dispositions recorded in `docs/superpowers/plans/2026-07-23-gallery-action-outcomes/CLOSEOUT.md` §Impeccable (the plan-dir stand-in for a milestone handoff §12).
- [ ] **Step 2: whole-diff cross-model adversarial review** (fresh-eyes, REVIEWER ONLY, split tight-scope briefs if the diff is large — AGENTS.md default for big diffs) → iterate to APPROVE, no round budget; ladder per the spec TRIAGE record if Codex wedges again. Triage per deferral discipline into CLOSEOUT.md.
- [ ] **Step 3: ship.** Push; open PR (merge-commit convention; PR body ends with the standard generated-with footer). Real CI green on GitHub Actions (reconcile DIRTY/no-checks states; empty check-suite → empty-commit retrigger per #557 memory). `gh pr merge --merge` in the same turn CI goes green.
- [ ] **Step 4: sync + release.** `git -C /Users/ericweiss/FX-Webpage-Template pull --ff-only && git -C /Users/ericweiss/FX-Webpage-Template rev-list --left-right --count main...origin/main` == `0  0`; set ship-state `stage: "done"`; `CronDelete` the marker's `cronJobId`.

## Self-Review (post-R1)

1. Spec coverage: unchanged map + §5 containment now has network-negative proof (T8); close-out stages present (T10).
2. Every R1 finding has a named fix: F1→T1/T3/T6/T7 acceptable-predicate + shaper reuse; F2→T1 deriver reuse + corrected table; F3→T3 arities/NOOP export, T1 `warn` reuse + value import, T7 GROUP_LABELS + real factories; F4→T6 ScenarioMount; F5→T2 factory+isModalVisible, T4 page test, T7 T2_REQUIRED_IDS + tier-exclusivity; F6→T7 catalog-verified codes + T8 non-empty-copy; F7→T3 derived count, T8 imported scenario numbers; F8→T8 request recorder; F9→facts inlined above (remaining code-time verifications are named greps with cited anchors, not open questions); F10→T10.
3. Type consistency: `buildScriptedActions(outcomes, acceptableCount)` consistent T3/T6; `GalleryFetchScript` T3/T4/T6; `NOOP_ACTIONS` import direction T3→switcher.
