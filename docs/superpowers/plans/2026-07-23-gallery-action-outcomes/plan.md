# Gallery Action Outcomes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every action-outcome state (pending/error/refusal/partial/success on published-show-modal controls) demonstrable click-driven in the dev attention-gallery, per spec `docs/superpowers/specs/2026-07-23-gallery-action-outcomes-design.md`.

**Architecture:** Three-channel scripted layer. (1) A tier-2-only serializable `actionOutcomes` scenario field flows server page → client switcher; the switcher builds scripted closures replacing `NOOP_ACTIONS` members per scenario. (2) `GalleryWriteGuard` gains a `scripts` prop serving scripted JSON responses (or hanging) for fetch-based controls; its mount relocates from the server page into the switcher, keyed per scenario. (3) A null-default `DevActionOverrideContext` is consulted by the 3 direct-server-action-import controls; the switcher mounts the provider with scripted implementations.

**Tech Stack:** Next 16 / React 19, TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest + jsdom for unit, Playwright dev-build project (:3001) for e2e.

## Global Constraints

- Worktree: `/Users/ericweiss/FX-worktrees/gallery-action-outcomes`, branch `feat/gallery-action-outcomes`. All commits `--no-verify`.
- TDD per task: failing test → minimal implementation → green → commit (AGENTS.md invariant 1). Conventional commits (invariant 6).
- No new server actions, API routes, or DB surface. No advisory-lock code. No new Supabase call sites (invariants 2/9/10 untouched by construction).
- No raw error codes in user-visible UI (invariant 5) — this feature renders only through existing components, which already comply; scripted codes must be codes those components already map (spec §2 tables) or never-rendered synthetics (`GALLERY_SCRIPTED_FAIL`).
- `pending` outcome = never-resolving promise. No timers, no `Date.now()` in scenario data (fixed ISO literals only).
- Production behavior with no provider/scripts must be byte-identical (spec §3.6); Task 5 pins this with regression tests.
- UI gate: impeccable critique + audit on the affected diff before close-out review (invariant 8); Task 9.
- **Meta-test inventory (declared per writing-plans rule):** this milestone EXTENDS `tests/dev/attentionScenariosValidate.test.ts` (new field rules), `tests/dev/galleryModalTypes.test.ts` (passthrough field), and the e2e containment contract inside `tests/e2e/attention-modal-gallery.spec.ts` (`data-gallery-scripted-write` marker). No registry-class meta-test applies: no new Supabase call boundary, no new admin mutation surface, no new §12.4 code (spec §5 reason ratified).
- **Advisory-lock holder topology:** N/A — plan touches no `pg_advisory*` path.
- e2e harness readiness (mandatory rule): server boot = existing Playwright `dev-build` project (prod build with `ADMIN_DEV_PANEL_ENABLED`, port 3001, `playwright.config.ts` testMatch `/(admin-dev|attention-modal-gallery)\.spec\.ts/`); readiness gate = the spec file's existing scenario-selection helpers (jump-to-scenario + visible-modal assertion), never `networkidle`; no sampler/`locator.evaluate` call may outlive its element — all new assertions are auto-waiting locator expectations on elements that persist post-click.

## File Structure

- `lib/dev/attentionScenarios/types.ts` — add `ScenarioActionOutcomes` + `PropActionOutcome` types and the `actionOutcomes?` field.
- `lib/dev/attentionScenarios/validate.ts` — validation rules (tier-2-only, kind unions, no-op guard, okCount range, reachability).
- `lib/dev/galleryModalTypes.ts` — `GallerySwitcherScenario.actionOutcomes` passthrough.
- `app/admin/dev/attention-gallery/buildSwitcherScenarios.ts` — forward the field.
- `lib/dev/galleryActionScripts.ts` (new) — pure builders: `buildScriptedActions`, `buildFetchScripts`, `buildActionOverrides`.
- `components/admin/dev/GalleryWriteGuard.tsx` — `scripts` prop.
- `app/admin/dev/attention-gallery/page.tsx` — remove guard mount.
- `components/admin/dev/actionOverrideContext.tsx` (new) — context + hook.
- `components/admin/wizard/CrewRowActions.tsx`, `app/admin/show/[slug]/RotateShareTokenButton.tsx`, `app/admin/show/[slug]/PickerResetControl.tsx` — one call-site override read each.
- `components/admin/dev/AttentionModalSwitcher.tsx` — scripted closures, guard + provider mounts.
- `lib/dev/attentionScenarios/tier2.ts` — 15 `t2-act-*` scenarios; `lib/dev/galleryModalTypes.ts` `ScenarioGroupId` gains `"actions"`.
- Tests: `tests/dev/attentionScenariosValidate.test.ts`, `tests/dev/galleryModalTypes.test.ts`, `tests/dev/galleryActionScripts.test.ts` (new), `tests/components/dev/galleryWriteGuardScripts.test.tsx` (new — mirror existing guard test location if one exists; otherwise `tests/dev/`), `tests/components/actionOverrideDefaults.test.tsx` (new), `tests/e2e/attention-modal-gallery.spec.ts`.

Verified mount predicates (pre-draft pass, all live-code):

| Control | Mounts iff | Cite |
| --- | --- | --- |
| ReSyncButton | `!archived` | `components/admin/showpage/StatusStrip.tsx:300-303` |
| PublishedToggle | `!archived` (disabled on `finalizeOwned`) | `StatusStrip.tsx:189-202` |
| ArchiveShowButton / Rotate / PickerReset | ShareHub, absent when archived; rotate takes `isCrewLinkActive` = `published && !archived && url != null` | `ShareHub.tsx:223,548-558,616`; `StatusStrip.tsx:167` |
| PerShowAlertResolveButton | attention item in `AttentionBanner` | `components/admin/review/AttentionBanner.tsx` (import) |
| BulkIgnoreControls | active warning groups | `sectionWarningExtras.tsx:259` |
| CrewRowActions | crew row with `crewId` AND `actions` present | `step3ReviewSections.tsx:1648-1658,1523` |
| Mi11/Accept/Undo | feed entries (holds / pending / applied-undoable rows) | `ChangesFeed.tsx`, `ChangeFeedEntry.tsx` imports |

---

### Task 1: `actionOutcomes` schema + validator rules

**Files:**
- Modify: `lib/dev/attentionScenarios/types.ts` (after `landing`, ~line 181)
- Modify: `lib/dev/attentionScenarios/validate.ts` (inside `validateModalStateFields`)
- Test: `tests/dev/attentionScenariosValidate.test.ts`

**Interfaces — Produces:** exported types `PropActionOutcome`, `ScenarioActionOutcomes`; `AttentionScenario.actionOutcomes?: ScenarioActionOutcomes`; validator errors prefixed `actionOutcomes:`.

- [ ] **Step 1: failing tests** — append to `tests/dev/attentionScenariosValidate.test.ts` (reuse the file's existing `base`/`validateScenario` helpers; adapt names to the file's local convention on sight):

```ts
describe("actionOutcomes", () => {
  const t2 = (over: Partial<AttentionScenario>): AttentionScenario => ({
    id: "t2-x", tier: 2, label: "x", alerts: [], holds: [], ...over });

  it("rejects on non-tier-2", () => {
    const errs = validateScenario({ ...t2({}), tier: 1, actionOutcomes: { resync: { kind: "pending" } } } as AttentionScenario);
    expect(errs.some((e) => e.includes("actionOutcomes: tier 2 only"))).toBe(true);
  });
  it("rejects an empty object (no-op script)", () => {
    expect(validateScenario(t2({ actionOutcomes: {} }))).toContainEqual(
      expect.stringContaining("actionOutcomes: empty object is a no-op"));
  });
  it("rejects unknown keys", () => {
    expect(validateScenario(t2({ actionOutcomes: { typo: { kind: "pending" } } as never }))).toContainEqual(
      expect.stringContaining("actionOutcomes: unknown key typo"));
  });
  it("rejects bad kinds and blank codes", () => {
    expect(validateScenario(t2({ actionOutcomes: { setPublished: { kind: "nope" } } as never })))
      .toContainEqual(expect.stringContaining("actionOutcomes.setPublished"));
    expect(validateScenario(t2({ actionOutcomes: { setPublished: { kind: "error", code: " " } } })))
      .toContainEqual(expect.stringContaining("actionOutcomes.setPublished: error code must be non-blank"));
  });
  it("rejects resync error codes outside the route union", () => {
    expect(validateScenario(t2({ actionOutcomes: { resync: { kind: "error", code: "MADE_UP" } } as never })))
      .toContainEqual(expect.stringContaining("actionOutcomes.resync"));
  });
  it("rejects out-of-range bulkIgnore okCount and requires a bulk group", () => {
    const warnings = [w("ROOM_UNMATCHED"), w("ROOM_UNMATCHED")]; // file's existing warning factory
    expect(validateScenario(t2({ warnings, actionOutcomes: { bulkIgnore: { kind: "partial", okCount: 2 } } })))
      .toContainEqual(expect.stringContaining("okCount"));
    expect(validateScenario(t2({ actionOutcomes: { bulkIgnore: { kind: "fail" } } })))
      .toContainEqual(expect.stringContaining("actionOutcomes.bulkIgnore: needs a bulk-ignorable warning group"));
  });
  it("enforces reachability", () => {
    expect(validateScenario(t2({ actionOutcomes: { approve: { kind: "pending" } } })))
      .toContainEqual(expect.stringContaining("actionOutcomes.approve"));
    expect(validateScenario(t2({ fixture: { archived: true }, actionOutcomes: { resync: { kind: "pending" } } })))
      .toContainEqual(expect.stringContaining("actionOutcomes.resync: unreachable"));
    expect(validateScenario(t2({ actionOutcomes: { rotate: { kind: "error" } } })))
      .toContainEqual(expect.stringContaining("actionOutcomes.rotate"));
  });
  it("accepts a coherent script", () => {
    expect(validateScenario(t2({
      fixture: { share: { linkActive: true, crewEmails: 3 } },
      actionOutcomes: { rotate: { kind: "success" }, everyoneReset: { kind: "success" }, crewReset: { kind: "success" } },
    }))).toEqual([]);
  });
});
```

- [ ] **Step 2:** `pnpm vitest run tests/dev/attentionScenariosValidate.test.ts` — expect the new describe FAILs (field unknown).
- [ ] **Step 3: types** — in `types.ts` after `landing`:

```ts
  /** Tier 2 only - scripts the outcome each modal control's action resolves to.
   *  Click-driven: nothing fires on mount. Absent key = current default
   *  (NOOP success for prop closures; GalleryWriteGuard 403 for writes). */
  actionOutcomes?: ScenarioActionOutcomes;
```

and above `AttentionScenario`:

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

- [ ] **Step 4: validator** — in `validateModalStateFields`, after the `fixture` block:

```ts
  if (tier2Only(s.actionOutcomes !== undefined, "actionOutcomes")) {
    validateActionOutcomes(s, out);
  }
```

New function (same file, near the fixture validators). Kind allowlists as data; reachability per the verified mount-predicate table:

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
      } else if (key === "resync" && !RESYNC_ERROR_CODES.includes(code as never)) {
        out.push(`actionOutcomes.resync: code must be one of ${RESYNC_ERROR_CODES.join("/")}`);
      }
    }
    if (key === "resync" && kind === "shrink_held") {
      const detail = (v as { detail?: unknown }).detail;
      if (typeof detail !== "string" || detail.trim() === "") out.push("actionOutcomes.resync: shrink_held detail must be non-blank");
    }
  }
  // Reachability (spec §3.4): scripting a control that cannot mount is a hard error.
  const fx = s.fixture;
  const archived = fx?.archived === true;
  const holds = Array.isArray(s.holds) ? s.holds.length : 0;
  const changeLog = Array.isArray(s.changeLog) ? s.changeLog : [];
  const pendingRows = changeLog.filter((r) => r.status === "pending").length;
  const undoableApplied = changeLog.some(
    (r) => r.status === "applied" && r.individually_undoable &&
      (UNDOABLE_CHANGE_KINDS as readonly string[]).includes(r.change_kind));
  const bulkMax = maxSameCodeWarningCount(s); // helper below
  const req = (cond: boolean, key: string, why: string) => {
    if ((ao as Record<string, unknown>)[key] !== undefined && !cond) out.push(`actionOutcomes.${key}: unreachable - ${why}`);
  };
  req(holds > 0, "approve", "needs a pending mi11 hold");
  req(holds > 0, "reject", "needs a pending mi11 hold");
  req(pendingRows > 0, "accept", "needs a pending changeLog row");
  req(pendingRows > 0, "acceptAll", "needs a pending changeLog row");
  req(undoableApplied, "undo", "needs an applied individually-undoable crew-domain changeLog row");
  req((s.alerts?.length ?? 0) > 0, "resolve", "needs an attention alert row");
  req(bulkMax >= 2, "bulkIgnore", "needs a bulk-ignorable warning group");
  req(!archived && !(fx?.empty ?? []).includes("crew"), "crewReset", "needs non-archived crew rows");
  req(fx?.share?.linkActive === true, "rotate", "needs fixture.share.linkActive");
  req(fx?.share?.linkActive === true, "everyoneReset", "needs fixture.share.linkActive");
  req(!archived, "resync", "archived shows have no re-sync control");
  req(!archived && fx?.finalizeOwned !== true, "setPublished", "toggle absent/disabled");
  req(!archived, "archive", "already archived");
  const bi = ao.bulkIgnore;
  if (bi !== undefined && bi.kind === "partial") {
    if (!Number.isInteger(bi.okCount) || bi.okCount < 1 || bi.okCount >= bulkMax) {
      out.push(`actionOutcomes.bulkIgnore: okCount must be an integer in [1, ${Math.max(bulkMax - 1, 1)}]`);
    }
  }
}
```

`maxSameCodeWarningCount(s)`: count warnings by `code`, return the max count (0 when none). Import `UNDOABLE_CHANGE_KINDS` from `lib/sync/holds/types` (cite `lib/sync/holds/types.ts:46`). NOTE: implementer must verify at code time which warning-group predicate `sectionWarningExtras.tsx` actually uses for bulk chips (`ActiveWarningGroup` construction) and mirror it; ≥2 same-code active warnings is the verified minimum shape.

- [ ] **Step 5:** run the test file — all green. **Step 6:** `pnpm typecheck` (scoped is fine: `pnpm tsc --noEmit`). **Step 7: commit** `feat(admin): actionOutcomes scenario schema + validator (gallery class-6)`.

### Task 2: passthrough to the client switcher

**Files:**
- Modify: `lib/dev/galleryModalTypes.ts` (`GallerySwitcherScenario`, ~line 33-43)
- Modify: `app/admin/dev/attention-gallery/buildSwitcherScenarios.ts` (~line 138 push block)
- Test: `tests/dev/galleryModalTypes.test.ts` + `tests/dev/attentionScenariosIndex.test.ts`-style assertion in the buildSwitcherScenarios coverage (whichever file currently asserts `shareToken` passthrough — grep `shareToken` under `tests/` and extend the same file).

**Interfaces — Produces:** `GallerySwitcherScenario.actionOutcomes: ScenarioActionOutcomes | null`.

- [ ] **Step 1: failing test** — in the file that pins `shareToken` passthrough, add: a tier-2 scenario carrying `actionOutcomes` survives `partitionScenarios()` with the same object on the rendered entry; a scenario without it yields `null`.
- [ ] **Step 2:** run — FAIL. **Step 3:** add to `GallerySwitcherScenario`:

```ts
  /** Per-scenario action-outcome script (spec 2026-07-23 §3.1); null = all defaults. */
  actionOutcomes: ScenarioActionOutcomes | null;
```

(import type from `@/lib/dev/attentionScenarios/types` — confirm this import does not drag server-only code into the client graph; `types.ts` is already imported client-side via the existing types, cite the file's own header claim before relying on it). In `buildSwitcherScenarios.ts` push block: `actionOutcomes: s.actionOutcomes ?? null,`.
- [ ] **Step 4:** green. **Step 5: commit** `feat(admin): thread actionOutcomes to gallery switcher`.

### Task 3: pure script builders (`lib/dev/galleryActionScripts.ts`)

**Files:**
- Create: `lib/dev/galleryActionScripts.ts`
- Test: `tests/dev/galleryActionScripts.test.ts`

**Interfaces — Produces:**

```ts
export type ScriptedFetchResponse = { status: number; body: unknown } | "hang";
export type GalleryFetchScript = {
  key: "resync" | "resolve" | "bulkIgnore";
  method: "POST";
  pathPattern: RegExp;
  respond: (callIndex: number) => ScriptedFetchResponse;
};
export function buildScriptedActions(
  outcomes: ScenarioActionOutcomes | null,
  noop: Pick<PublishedReviewModalProps, ActionKeys>,
  pendingRowCount: number,
): Pick<PublishedReviewModalProps, ActionKeys>;
export function buildFetchScripts(outcomes: ScenarioActionOutcomes | null): GalleryFetchScript[];
export function buildActionOverrides(outcomes: ScenarioActionOutcomes | null): DevActionOverrides | null;
```

- [ ] **Step 1: failing tests** (behavioral, derived-not-hardcoded where counts exist):

```ts
const HANG_TIMEOUT = 50;
const never = (p: Promise<unknown>) =>
  Promise.race([p.then(() => "resolved"), new Promise((r) => setTimeout(() => r("hung"), HANG_TIMEOUT))]);

it("returns noop members for unscripted keys", () => {
  const acts = buildScriptedActions(null, NOOP, 0);
  expect(acts).toBe(NOOP); // null script returns the noop object identity
});
it("scripts channel-1 results contract-exact", async () => {
  const acts = buildScriptedActions({ setPublished: { kind: "error", code: "FINALIZE_OWNED_SHOW" },
    acceptAll: { kind: "success" }, archive: { kind: "not_found" } }, NOOP, 4);
  await expect(acts.setPublished(true)).resolves.toEqual({ ok: false, code: "FINALIZE_OWNED_SHOW" });
  await expect(acts.acceptAllAction()).resolves.toEqual({ ok: true, count: 4 }); // derived from pendingRowCount
  await expect(acts.archiveAction()).resolves.toEqual({ ok: false, code: "show_not_found" });
  expect(acts.undoAction).toBe(NOOP.undoAction);
});
it("pending closures never settle", async () => {
  const acts = buildScriptedActions({ undo: { kind: "pending" } }, NOOP, 0);
  await expect(never(acts.undoAction())).resolves.toBe("hung");
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

- [ ] **Step 2:** FAIL (module missing). **Step 3: implement.** Response mappings (spec §2/§3.2 envelopes, all cited there):
  - resync success → `200 { ok: true, result: { outcome: outcome ?? "applied" } }`; shrink → `200 { ok: true, result: { outcome: "shrink_held", detail, heldModifiedTime: "2026-06-29T00:00:00.000Z" } }`; error → status map `SYNC_INFRA_ERROR:500, PENDING_SYNC_NOT_FOUND:404, FINALIZE_OWNED_SHOW:409, SHOW_BUSY_RETRY:409`, body `{ ok: false, error: code }`; pending → `"hang"`.
  - resolve success → `200 { status: "resolved", id: "gallery-alert", resolved_at: "2026-07-01T00:00:00.000Z" }`; error → `500 { ok: false, code }`; pending → hang.
  - bulkIgnore partial → `idx < okCount ? 200 {status:"ignored"} : 500 {ok:false, code:"GALLERY_SCRIPTED_FAIL"}`; fail → always the 500 arm; pending → hang.
  - Path patterns: resync `/^\/api\/admin\/sync\//`; resolve `/^\/api\/admin\/show\/[^/]+\/alerts\/[^/]+\/resolve$/`; bulkIgnore `/\/data-quality\/ignore$/`.
  - Channel-1: build a shallow copy of `noop`, override scripted keys; `pending` closure = `() => new Promise<never>(() => {})`; `acceptAll` success `{ ok: true, count: pendingRowCount }`; `accept` success `{ ok: true, count: 1 }`; return `noop` identity when `outcomes` is null or scripts no channel-1 key.
  - Channel-3 success values: crewReset `{ ok: true, reset_at: "2026-07-01T12:00:00.000Z" }`; rotate `{ ok: true, new_share_token: "gallery-share-token-rotated", new_epoch: 2 }`; everyoneReset `{ ok: true, new_epoch: 2 }`; errors map to `PICKER_RESOLVER_LOOKUP_FAILED` (crewReset `not_found` → `PICKER_CREW_MEMBER_NOT_FOUND`); pending → never-resolving. Return `null` when no channel-3 key scripted.
- [ ] **Step 4:** green. **Step 5: commit** `feat(admin): gallery action-outcome script builders`.

### Task 4: `GalleryWriteGuard` scripts prop + mount relocation

**Files:**
- Modify: `components/admin/dev/GalleryWriteGuard.tsx`
- Modify: `app/admin/dev/attention-gallery/page.tsx` (remove `<GalleryWriteGuard />`, line 51, and its import)
- Modify: `components/admin/dev/AttentionModalSwitcher.tsx` (mount `<GalleryWriteGuard key={current.id} scripts={fetchScripts} />`)
- Test: new `tests/dev/galleryWriteGuardScripts.test.tsx` (jsdom; if an existing GalleryWriteGuard test file exists, extend it instead — grep first)

- [ ] **Step 1: failing test** — render `<GalleryWriteGuard scripts={[resyncShrinkScript]} />`; `await fetch("/api/admin/sync/x", { method: "POST" })` returns scripted 200 body and sets `data-gallery-scripted-write`; a non-matching `POST /api/other` still returns 403 `GALLERY_DISPLAY_ONLY` and sets `data-gallery-blocked-write`; GET passes through (spy original fetch); prop-less render behaves exactly as today (403 path only); a `"hang"` respond never settles (race pattern from Task 3).
- [ ] **Step 2:** FAIL. **Step 3: implement** — add `scripts?: readonly GalleryFetchScript[]` prop; inside the effect, keep the existing method/url helpers; before the 403 branch:

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

`counters` = `new Map<string, number>()` created per effect run; effect deps `[scripts]` so a scenario switch (new array) resets counts; guard keyed by scenario id in the switcher resets regardless.
- [ ] **Step 4:** switcher/page mounts: delete the page mount + import; in the switcher return, above `ShareTokenProvider`: `<GalleryWriteGuard key={current.id} scripts={fetchScripts} />` where `const fetchScripts = useMemo(() => buildFetchScripts(current.actionOutcomes), [current]);`. (Full switcher wiring lands in Task 6 — this task may land the mount with `scripts={undefined}` equivalent by passing `buildFetchScripts(current.actionOutcomes)` directly; both tasks touch the same file, keep the diff coherent.)
- [ ] **Step 5:** green + `pnpm tsc --noEmit`. **Step 6: commit** `feat(admin): scripted fetch responses in GalleryWriteGuard; switcher-owned mount`.

### Task 5: `DevActionOverrideContext` + 3 call sites + production-default pins

**Files:**
- Create: `components/admin/dev/actionOverrideContext.tsx`
- Modify: `components/admin/wizard/CrewRowActions.tsx:192`, `app/admin/show/[slug]/RotateShareTokenButton.tsx:155`, `app/admin/show/[slug]/PickerResetControl.tsx:159`
- Test: `tests/components/actionOverrideDefaults.test.tsx`

**Interfaces — Produces:** `DevActionOverrides` type, `DevActionOverrideContext`, `useDevActionOverride(key)`.

- [ ] **Step 1: failing tests** — for each component: `vi.mock` the lib action module; render the control with minimal props and NO provider; drive to confirm; assert the mocked real action was called with the component's own args. Then one provider-mounted case per component: provider supplies a `vi.fn` override; assert override called AND real mock NOT called. (Use the components' existing test files' render scaffolding if present — grep `CrewRowActions` under `tests/` first and extend in place; jsdom is sufficient, transitions flushed with the project's existing `act`/`waitFor` patterns.)
- [ ] **Step 2:** FAIL (hook missing). **Step 3: implement** the module:

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

Call-site edits (one line + one hook line each), e.g. CrewRowActions:

```ts
  const overrideReset = useDevActionOverride("resetCrewMemberSelection");
  // ...inside onConfirm:
  const r = await (overrideReset ?? resetCrewMemberSelection)({ showId, crewMemberId: crewId });
```

Same shape: `(overrideRotate ?? rotateShareToken)({ showId })`, `(overrideEpoch ?? resetPickerEpoch)({ showId })`.
- [ ] **Step 4:** green. **Step 5:** `pnpm build` sanity (type-only imports must not pull server code into the client graph — build catches RSC violations; memory: build-only catches). **Step 6: commit** `feat(admin): dev action override seam for picker controls (null-default, prod unchanged)`.

### Task 6: switcher integration (scripted closures + provider)

**Files:**
- Modify: `components/admin/dev/AttentionModalSwitcher.tsx`
- Test: `tests/dev/attentionModalSwitcherActions.test.tsx` (new, jsdom)

- [ ] **Step 1: failing test** — render the switcher with a two-scenario fixture: scenario A scripts `setPublished: { kind: "error", code: "PUBLISH_BLOCKED_PENDING_REVIEW" }`, scenario B unscripted. Assert: (a) modal receives a `setPublished` that resolves to the scripted refusal (invoke the prop via a mocked `PublishedReviewModal` capturing props — mock the modal module, do NOT render the real modal tree in jsdom); (b) scenario B's captured `setPublished` resolves `{ ok: true }`; (c) provider wraps the modal when channel-3 keys are scripted (capture via a probe child reading the context — render a real small probe through the mocked modal's children or assert `buildActionOverrides` wiring by capturing the context value with a test consumer).
- [ ] **Step 2:** FAIL. **Step 3: implement** — in the component body:

```ts
  const scripted = useMemo(() => {
    const pendingRows = 0; // replaced below if scenario carries changeLog
    const rows = (current.data.feed?.entries ?? []).filter((e) => /* pending predicate per feed entry shape */ false).length;
    return buildScriptedActions(current.actionOutcomes, NOOP_ACTIONS, rows || pendingRows);
  }, [current]);
  const overrides = useMemo(() => buildActionOverrides(current.actionOutcomes), [current]);
  const fetchScripts = useMemo(() => buildFetchScripts(current.actionOutcomes), [current]);
```

IMPLEMENTER NOTE (verified at plan time only to the shape level): derive `pendingRowCount` from the scenario's serialized feed entries on `current.data` — grep the `GalleryModalData.feed` entry shape (`shapeChangeFeed` output) at code time and count entries whose status is `pending`; do not hardcode. Mount:

```tsx
      <GalleryWriteGuard key={current.id} scripts={fetchScripts} />
      <DevActionOverrideContext.Provider value={overrides}>
        <ShareTokenProvider key={current.id} initialToken={current.shareToken ?? null} initialEpoch={0}>
          <PublishedReviewModal key={current.id} {...current.data} {...scripted} />
        </ShareTokenProvider>
      </DevActionOverrideContext.Provider>
```

(Provider mounts unconditionally with `overrides` possibly null — null value means hook returns undefined, defaults apply; simpler than conditional wrapping and keeps tree shape stable.)
- [ ] **Step 4:** green. **Step 5: commit** `feat(admin): switcher builds scripted closures + override provider per scenario`.

### Task 7: roster — `"actions"` group + 15 scenarios

**Files:**
- Modify: `lib/dev/galleryModalTypes.ts` (`ScenarioGroupId` + `GROUP_ORDER`, lines 96-110)
- Modify: `lib/dev/attentionScenarios/tier2.ts` (append scenarios; follow the file's existing `fixtureScenario`/literal style, e.g. `t2-share-link` at ~line 616)
- Test: existing `tests/dev/attentionScenariosTier2.test.ts` + `attentionScenariosIndex.test.ts` (validator-green over the full catalog is already asserted there; extend the per-group nav test for `"actions"`)

- [ ] **Step 1: failing test** — extend the tier2/index tests: catalog contains the 15 `t2-act-*` ids (list them literally); every one validates clean; group `"actions"` appears in `GROUP_ORDER` and the switcher nav partition.
- [ ] **Step 2:** FAIL. **Step 3: implement** — add `"actions"` to the union + `GROUP_ORDER` (after `"warnings"`). Append the roster per spec §3.5 (all `landing: "actions"` unless real alerts/holds/warnings force a derived group; keys per spec):

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
      holds: [mi11Hold()], changeLog: [pendingRow(), appliedUndoableRow()],
      actionOutcomes: { approve: { kind: "error", code: "MI11_GONE" }, reject: { kind: "error", code: "MI11_GONE" },
        accept: { kind: "error", code: "ACCEPT_NOT_FOUND" }, acceptAll: { kind: "error", code: "ACCEPT_NOT_FOUND" },
        undo: { kind: "error", code: "UNDO_NOT_FOUND" } } },
    { id: "t2-act-resolve-error", tier: 2, label: "Alert resolve: error", alerts: [alert(pickByDerivedClass("actionable"))],
      holds: [], actionOutcomes: { resolve: { kind: "error", code: "RESOLVE_INFRA" } } },
    { id: "t2-act-bulkignore-partial", tier: 2, label: "Bulk ignore: partial success", alerts: [], holds: [],
      warnings: [/* 3 same-code ignorable warnings via the file's warning factory */],
      actionOutcomes: { bulkIgnore: { kind: "partial", okCount: 2 } } },
    { id: "t2-act-bulkignore-fail", tier: 2, label: "Bulk ignore: total failure", alerts: [], holds: [],
      warnings: [/* 2 same-code */], actionOutcomes: { bulkIgnore: { kind: "fail" } } },
    { id: "t2-act-crewreset-notfound", tier: 2, label: "Crew reset: roster changed underneath", alerts: [], holds: [],
      landing: "actions", actionOutcomes: { crewReset: { kind: "not_found" } } },
    { id: "t2-act-share-errors", tier: 2, label: "Share hub: rotate + reset errors", alerts: [], holds: [],
      fixture: { share: { linkActive: true, crewEmails: 3 } }, landing: "actions",
      actionOutcomes: { rotate: { kind: "error" }, everyoneReset: { kind: "error" } } },
    { id: "t2-act-share-success", tier: 2, label: "Share hub: rotate/reset/crew-reset success", alerts: [], holds: [],
      fixture: { share: { linkActive: true, crewEmails: 3 } }, landing: "actions",
      actionOutcomes: { rotate: { kind: "success" }, everyoneReset: { kind: "success" }, crewReset: { kind: "success" } } },
    { id: "t2-act-pending", tier: 2, label: "In-flight: every control hangs", alerts: [], holds: [mi11Hold()],
      changeLog: [appliedUndoableRow()], fixture: { share: { linkActive: true, crewEmails: 3 } },
      actionOutcomes: { resync: { kind: "pending" }, setPublished: { kind: "pending" }, approve: { kind: "pending" },
        undo: { kind: "pending" }, crewReset: { kind: "pending" }, rotate: { kind: "pending" } } },
```

IMPLEMENTER NOTES: `mi11Hold()`, `pendingRow()`, `appliedUndoableRow()`, warning factories — reuse the file's existing helpers (grep `holds: [` and `changeLog:` in `tier2.ts` for the shipped #557 patterns; `change_kind` for the undoable row must be a `UNDOABLE_CHANGE_KINDS` member, e.g. `crew_added`). Error codes on channel-1 scripts render through each component's `ErrorExplainer` — codes must exist in `MESSAGE_CATALOG` or the component's generic arm must be the intent; verify each chosen code against `lib/messages/catalog.ts` at code time and swap to a cataloged code where the scenario's point is catalog copy (e.g. use real mi11/undo codes from the actions' own modules — grep `undoAction`/`approveAction` server implementations for their emitted codes).
- [ ] **Step 4:** green over the whole tier2 + validator + index suites. **Step 5: commit** `feat(admin): action-outcome scenario roster + actions nav group`.

### Task 8: e2e — click-driven assertions + containment marker

**Files:**
- Modify: `tests/e2e/attention-modal-gallery.spec.ts`

- [ ] **Step 1:** add tests (they fail against the pre-feature build only in the sense of missing scenarios; write, then run against the built app):
  - `t2-act-resync-error`: jump to scenario, click the Re-sync button, expect the error panel (scope to the panel container the component renders at `ReSyncButton.tsx:321`), expect `data-gallery-scripted-write` to contain `POST /api/admin/sync/`.
  - `t2-act-resync-shrink`: click, expect the confirm panel text `This re-sync would reduce the show:` and the scripted detail substring.
  - `t2-act-publish-refusal`: toggle, expect the refusal popover copy (catalog copy for `PUBLISH_BLOCKED_PENDING_REVIEW` — assert a distinctive substring, scoped to the toggle's popover region).
  - `t2-act-bulkignore-partial`: click the bulk chip + confirm, expect `Ignored 2 of 3. Refresh to see the rest.` (derive 2/3 from the scenario's okCount and warning count — import the scenario or duplicate the numbers with a comment tying them).
  - `t2-act-crewreset-notfound`: open a crew row ⋮, confirm reset, expect the not-found banner sentence.
  - `t2-act-share-success`: open share hub, rotate, expect the success banner + new-token surface.
  - `t2-act-pending`: click Re-sync, expect the busy label (`Syncing…`-class label per `ReSyncButton.tsx:314-317`) still present after a 500ms settle (`page.waitForTimeout(500)` then assert — bounded, not a poll).
  - Containment: extend the existing non-GET sweep assertion so every recorded write carries `data-gallery-scripted-write` OR `data-gallery-blocked-write`.
- [ ] **Step 2:** `pnpm exec playwright test tests/e2e/attention-modal-gallery.spec.ts --project=dev-build` — green. Harness notes: pre-boot per the file's own webServer config; kill only :3001 if stale (memory: never blanket-kill ports — Docker on :3000); `E2E_PORT`/`TEST_DATABASE_URL` loopback rules do not apply (no DB mutation in this spec file) but verify the file's header expectations before running.
- [ ] **Step 3: commit** `test(admin): e2e coverage for gallery action outcomes`.

### Task 9: docs, DEFERRED un-defer, gates

**Files:**
- Modify: `DEFERRED.md` (class-6 entry → resolved note pointing at the spec + PR)
- Modify: `docs/superpowers/specs/2026-07-23-gallery-action-outcomes-design.md` (Status: → implemented ref, optional)

- [ ] **Step 1:** rewrite the DEFERRED class-6 entry: keep the historical record, append "**Un-deferred 2026-07-23** by `docs/superpowers/specs/2026-07-23-gallery-action-outcomes-design.md` (this PR): all six surfaces plus rotate/everyone-reset/archive are click-demonstrable via the scripted-outcome layer."
- [ ] **Step 2: pre-push gates** (memory: full suite + typecheck + eslint + format before push): `pnpm tsc --noEmit && pnpm lint && pnpm format:check && pnpm test` — all green (note: env-bound/e2e suites are excluded from `pnpm test` by design).
- [ ] **Step 3: impeccable dual-gate** (invariant 8): `/impeccable critique` + `/impeccable audit` over the diff (UI files: switcher, guard, context, 3 production controls, roster). P0/P1 fixed or DEFERRED.md-deferred.
- [ ] **Step 4: commit** `docs(admin): un-defer modal-state-coverage class 6`.

## Self-Review (run before dispatch)

1. Spec coverage: §3.0→T1, §3.1→T3/T6, §3.2→T3/T4, §3.3→T3/T5, §3.4→T1, §3.5→T7, §3.6→T5 pins, §5 bullets→T1/T3/T4/T5/T6/T7 units, T8 e2e+containment, §6→T9. No gaps.
2. Placeholders: the bracketed `/* ... */` warning-factory slots in T7 and the `pendingRowCount` derivation in T6 are deliberate look-up-at-code-time notes with exact grep instructions, not TBDs; every other step carries concrete code.
3. Type consistency: `GalleryFetchScript`/`ScriptedFetchResponse`/`DevActionOverrides`/`ScenarioActionOutcomes` names match across T1/T3/T4/T5/T6.
