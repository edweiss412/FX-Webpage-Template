# Step-3 Modal Follow-ups Batch 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four shipped Step-3 review-modal defects per `docs/superpowers/specs/2026-07-04-step3-modal-followups-b2.md` (the spec; canonical): XLSX-media diagram previews (§A), footer pending-label inversion (§B), rescan false-positive copy (§C), report-form progressive disclosure (§D).

**Architecture:** No DB/migration/advisory-lock/§12.4 changes. One shared-predicate module extension (`lib/admin/stagedDiagramGuards.ts`), one route fetch-path extension, one response-shape field (`demoted`), three `components/` edits. All UI tasks are Opus-owned (routing rule); impeccable dual gate runs at close-out.

**Tech stack:** Next.js 16 route handler, postgres.js deps-injection, vitest + jsdom (@testing-library/react), fflate-based xlsx fixture.

## Global Constraints

- TDD per task: failing test → minimal implementation → green → commit (`--no-verify`; run `pnpm format:check` before push).
- Copy strings verbatim from spec §1: S1 `No changes found. This sheet still needs your review before publishing.` · S2 `Write a report`. No em dashes anywhere.
- The "changed" rescan sentence stays byte-identical: `Updated. This sheet changed and needs your review before publishing.`
- Spec §N do-not-relitigate list binds every task and reviewer.
- **Meta-test inventory: none created or extended.** Rationale: no new Supabase client call sites (route is postgres.js deps-injected with its existing `// not-subject-to-meta` comment at `route.ts:18-19`, preserved); no advisory-lock surface touched (`rescanWizardSheet` change is return-shape only, inside the existing lock topology); no admin-alert codes; no sentinel-hiding surfaces. After edits under `components/admin` + the route, re-run `pnpm vitest run tests/admin tests/auth/advisoryLockRpcDeadlock.test.ts` (structural meta-tests are comment/format-fragile).
- Response-shape sweep (spec §C): adding `demoted` breaks every exact `toEqual` on `RescanResult`/route bodies. Known sites: `tests/onboarding/rescanWizardSheet.db.test.ts:360,401,428,569,619`, `tests/onboarding/rescanWizardSheetFlowB.db.test.ts` (grep), `tests/api/rescanSheetRoute.test.ts:96-115`. Sweep procedure: `rg 'status: "updated", needsReview' tests/ lib/` and update every hit in the same commit as Task 5.
- `.db.test.ts` files need the local Supabase stack (worktree `.env.local` has no `TEST_DATABASE_URL`, so `postgresql://postgres:postgres@127.0.0.1:54322/postgres` is used). Run `pnpm db:seed` first if a db test fails on missing schema.

---

### Task 1: Shared guards — media-field shape checks + `hasStagedPreviewSource`

**Files:** Modify `lib/admin/stagedDiagramGuards.ts`; Test `tests/admin/stagedDiagramGuards.test.ts`.
**Interfaces produced:** `hasStagedPreviewSource(stub: EmbeddedImageStub): boolean` (spec §A2 code block verbatim); `isRenderableDiagramStub` additionally rejects non-string `mediaPartName` and non-(absent|null|string) `embeddedFingerprint`.

- [ ] **Step 1: failing tests** — extend `tests/admin/stagedDiagramGuards.test.ts` (spec T-A4):

```ts
describe("isRenderableDiagramStub — media fields", () => {
  const base = { objectId: "o", mimeType: "image/png", sheetTab: "T" };
  test.each([
    [{ ...base }, true], // both absent
    [{ ...base, mediaPartName: "xl/media/image1.png", embeddedFingerprint: "fp" }, true],
    [{ ...base, embeddedFingerprint: null }, true],
    [{ ...base, mediaPartName: 7 }, false],
    [{ ...base, embeddedFingerprint: 7 }, false],
    [{ ...base, mediaPartName: { evil: true } }, false],
  ])("shape %#", (stub, ok) => expect(isRenderableDiagramStub(stub)).toBe(ok));
});

describe("hasStagedPreviewSource", () => {
  const base = { objectId: "o", mimeType: "image/png", sheetTab: "T" } as never;
  test.each([
    [{ ...base, contentUrl: "https://lh3.googleusercontent.com/x" }, true],
    [{ ...base, contentUrl: null, mediaPartName: "xl/media/image1.png", embeddedFingerprint: "fp" }, true],
    [{ ...base, contentUrl: null, mediaPartName: "xl/media/image1.png", embeddedFingerprint: null }, false], // restage-only
    [{ ...base, contentUrl: null, embeddedFingerprint: "fp" }, false], // no part name
    [{ ...base, contentUrl: null }, false],
  ])("source %#", (stub, ok) => expect(hasStagedPreviewSource(stub)).toBe(ok));
});
```

Failure modes caught: route/tile disagreeing on servability; unguarded JSONB dereference of `mediaPartName`/`embeddedFingerprint`.

- [ ] **Step 2:** `pnpm vitest run tests/admin/stagedDiagramGuards.test.ts` → FAIL (`hasStagedPreviewSource` not exported; malformed media fields accepted).
- [ ] **Step 3: implement** — in `isRenderableDiagramStub`, after the `contentUrl` check (`stagedDiagramGuards.ts:18-20`), add:

```ts
  if (o.mediaPartName !== undefined && typeof o.mediaPartName !== "string") return false;
  if (
    o.embeddedFingerprint !== undefined &&
    o.embeddedFingerprint !== null &&
    typeof o.embeddedFingerprint !== "string"
  ) {
    return false;
  }
```

Then append the `hasStagedPreviewSource` export exactly as spec §A2.

- [ ] **Step 4:** re-run → PASS. Also `pnpm vitest run tests/api/staged-diagram-route.test.ts tests/components/admin/wizard/step3ReviewSections.test.tsx` (consumers must stay green — their fixtures use string/absent media fields).
- [ ] **Step 5:** commit `feat(admin): staged-diagram guards accept media-addressable stubs (hasStagedPreviewSource)`

### Task 2: Route — serve XLSX-media stubs

**Files:** Modify `app/api/admin/onboarding/staged-diagram/[wizardSessionId]/[driveFileId]/[objectId]/route.ts`; Modify `tests/api/staged-diagram-route.test.ts`; Create `tests/api/staged-diagram-route.defaultDeps.test.ts`.
**Interfaces:** Consumes Task 1's `hasStagedPreviewSource`. Produces `StagedDiagramRouteDeps.fetchImageBytes: (stub: EmbeddedImageStub, ctx: { driveFileId: string }) => Promise<SnapshotAssetBytes | null>` and named export `defaultStagedDiagramFetchImageBytes` (same signature).

- [ ] **Step 1: failing tests (injection harness, spec T-A1/T-A2)** — in `tests/api/staged-diagram-route.test.ts` (existing vi.mock-free deps-injection harness; keep it that way):
  - media stub `{ ...validStub, contentUrl: null, mediaPartName: "xl/media/image1.png", embeddedFingerprint: "fp" }` → 200; body bytes = mock result; `fetchImageBytesMock` called once with `(stub, { driveFileId: DFID })`.
  - media stub with `embeddedFingerprint: null` → 404, ZERO `fetchImageBytes` calls.
  - media stub with no `mediaPartName` → 404, ZERO calls.
  - media stub, mock resolves `null` → 404; mock rejects → 404.
  - existing untrusted-contentUrl tests stay green byte-unchanged (ZERO fetches).
  - update the harness's `fetchImageBytesMock` type to the new two-arg signature (mechanical).
  Failure modes: the shipped 404-all-media bug; restage-only stubs served; fail-soft regression.
- [ ] **Step 2:** run → FAIL (route 404s at the `contentUrl == null` gate).
- [ ] **Step 3: failing test (default path, spec T-A3)** — NEW FILE `tests/api/staged-diagram-route.defaultDeps.test.ts` (separate file so the injection harness stays vi.mock-free). Pattern precedent `tests/sync/snapshotAssetsXlsxMedia.test.ts:7-37`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { extractEmbeddedObjects } from "@/lib/drive/embeddedObjects";
import { sha256Base64Url } from "@/lib/crypto/sha256";

const sampleXlsx = (): ArrayBuffer => {
  const b = readFileSync(new URL("../fixtures/diagrams/embedded-sample.xlsx", import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const { fetchCurrentSheetXlsxBytes } = vi.hoisted(() => ({ fetchCurrentSheetXlsxBytes: vi.fn() }));
vi.mock("@/lib/drive/fetch", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  fetchCurrentSheetXlsxBytes,
}));
vi.mock("@/lib/drive/client", () => ({ getDriveClient: () => ({}), getDriveAccessToken: async () => "t" }));

test("default fetcher serves DIAGRAMS media bytes for the route-param driveFileId", async () => {
  const { defaultStagedDiagramFetchImageBytes } = await import(
    "@/app/api/admin/onboarding/staged-diagram/[wizardSessionId]/[driveFileId]/[objectId]/route"
  );
  fetchCurrentSheetXlsxBytes.mockResolvedValue(sampleXlsx());
  const ex = extractEmbeddedObjects(sampleXlsx());
  const obj = ex.objectsByTab.get("DIAGRAMS")![0]!;
  const bytes = ex.bytesByObjectId.get(obj.objectId)!;
  const stub = {
    sheetTab: "DIAGRAMS", objectId: obj.objectId, mimeType: "image/png",
    contentUrl: null, mediaPartName: obj.mediaPartName,
    sheetsRevisionId: "rev-1", embeddedFingerprint: sha256Base64Url(bytes),
    recovery_disposition: "normal" as const, snapshotPath: null,
  };
  const result = await defaultStagedDiagramFetchImageBytes(stub, { driveFileId: "df-123" });
  expect(fetchCurrentSheetXlsxBytes).toHaveBeenCalledWith("df-123", expect.anything());
  expect(result).toBeInstanceOf(Uint8Array);
  expect(sha256Base64Url(result as Uint8Array)).toBe(stub.embeddedFingerprint);
});
```

(`EmbeddedObject.mediaPartName: string` is exposed — `lib/drive/embeddedObjects.ts:26-30` — so `obj.mediaPartName` is valid as written.)
Failure mode: the second shipped bug — default path never wires `fetchXlsxBytes`, so media stubs return null.

- [ ] **Step 4:** run → FAIL (`defaultStagedDiagramFetchImageBytes` not exported).
- [ ] **Step 5: implement** — in the route module:

```ts
import { fetchCurrentSheetXlsxBytes } from "@/lib/drive/fetch";
import { hasStagedPreviewSource, /* existing imports */ } from "@/lib/admin/stagedDiagramGuards";

export function defaultStagedDiagramFetchImageBytes(
  stub: EmbeddedImageStub,
  ctx: { driveFileId: string },
): Promise<SnapshotAssetBytes | null> {
  return snapshotFetchEmbeddedImageBytesTimed(stub, {
    fetchXlsxBytes: () => fetchCurrentSheetXlsxBytes(ctx.driveFileId, {}),
  });
}
```

`StagedDiagramRouteDeps.fetchImageBytes` gets the two-arg signature; the default binding becomes `routeDeps.fetchImageBytes ?? defaultStagedDiagramFetchImageBytes`. Replace `route.ts:147-148` with:

```ts
  if (stub.contentUrl == null) {
    // XLSX-media entry: addressable only via mediaPartName + non-null fingerprint
    // (spec §A2 hasStagedPreviewSource); the helper re-fetches the current export
    // for the VALIDATED route-param driveFileId — no JSONB-derived URL is fetched
    // (spec §A3 trust boundary).
    if (!hasStagedPreviewSource(stub)) return jsonError(404);
  } else if (!isTrustedDiagramContentUrl(stub.contentUrl)) {
    return jsonError(404);
  }
```

and pass `(stub, { driveFileId })` at the call site (`route.ts:158`).

- [ ] **Step 6:** `pnpm vitest run tests/api/staged-diagram-route.test.ts tests/api/staged-diagram-route.defaultDeps.test.ts` → PASS.
- [ ] **Step 7:** commit `feat(admin): staged-diagram route serves XLSX-media stubs via current-export fingerprint fetch`

### Task 3: Tile gating — `hasPreviewSource`

**Files:** Modify `components/admin/wizard/step3ReviewSections.tsx:1771-1819,1863-1873`; Test `tests/components/admin/wizard/step3ReviewSections.test.tsx`.
**Interfaces:** Consumes Task 1's `hasStagedPreviewSource`.

- [ ] **Step 1: failing tests (spec T-A5)** — media stub (`contentUrl: null`, `mediaPartName`, string fingerprint) renders the `<img>` inside the tile testid (`wizard-step3-card-<dfid>-diagram-tile-0`), NOT the "Preview unavailable" span; `embeddedFingerprint: null` stub renders the placeholder; both count in the summary line ("2 embedded images"). Query scoped to the tile testid (anti-tautology).
- [ ] **Step 2:** run → FAIL (media stub gets placeholder).
- [ ] **Step 3: implement** — rename `DiagramTile` prop `hasContentUrl` → `hasPreviewSource` (initializer `useState(!hasPreviewSource)`); `DiagramsBreakdown` passes `hasPreviewSource={hasStagedPreviewSource(stub)}` (replacing `stub.contentUrl != null` at `:1872`); update the existing `hasContentUrl`-related tests (mechanical rename).
- [ ] **Step 4:** `pnpm vitest run tests/components/admin/wizard/step3ReviewSections.test.tsx` → PASS.
- [ ] **Step 5:** commit `fix(admin): diagram tiles mount previews for media-addressable stubs`

### Task 4: Footer pending-op slot

**Files:** Modify `components/admin/wizard/Step3ReviewModal.tsx:145,164,683-718,1122-1146`; Test `tests/components/admin/wizard/Step3ReviewModal.test.tsx`.

- [ ] **Step 1: failing tests (spec T-B1/T-B2)** — stateful wrapper per spec §T:

```tsx
function OptimisticHarness(props: { initialChecked: boolean; deferred: { promise: Promise<boolean>; resolve: (v: boolean) => void } }) {
  const [checked, setChecked] = useState(props.initialChecked);
  return (
    <Step3ReviewModal
      {...defaultModalProps /* derive from the file's existing renderModal helper (Step3ReviewModal.test.tsx:122) — extract its default props or add an override-taking variant */}
      checked={checked}
      onRequestSetChecked={(next) => {
        setChecked(next); // the card's optimistic flip (Step3SheetCard.tsx:289-292)
        return props.deferred.promise;
      }}
    />
  );
}
```

  - publish: `initialChecked=false`, click `…-review-publish` → assert (while unresolved) label "Selecting…" AND `className` contains `bg-accent`; resolve `true` → `onClose` called.
  - unpublish: `initialChecked=true`, click → label "Removing…" AND `className` contains `border-border-strong` (quiet recipe), NOT `bg-accent`; resolve `true` → label becomes "Publish this show".
  - T-B2: publish deferred resolves `false` → error note visible, label back to "Publish this show", button enabled.
  - Rework the existing static-prop pending assertions at `:624-635` and `:717-724` into this harness (supersede, don't duplicate).
  These MUST FAIL against current code (renders the flipped branch's label). State the observed failing label in the test name if helpful.
- [ ] **Step 2:** run → FAIL with "Removing…" where "Selecting…" expected (and vice versa).
- [ ] **Step 3: implement** — `type PublishState = "idle" | "error" | { pending: "publish" | "unpublish" }` (`:145`); `handlePublish` sets `setPublishState({ pending: "publish" })`, `handleUnpublish` `{ pending: "unpublish" }`; derive:

```ts
  const pendingOp = typeof publishState === "object" ? publishState.pending : null;
  const isPending = pendingOp !== null;
  const showCheckedSlot = pendingOp !== null ? pendingOp === "unpublish" : checked;
```

Branch at `:1122` uses `showCheckedSlot`; both buttons use `disabled={isPending}` / `aria-busy={isPending || undefined}`; labels: `publishLabel = pendingOp === "publish" ? "Selecting…" : "Publish this show"` and checked-slot `{pendingOp === "unpublish" ? "Removing…" : "Unpublish"}`; error note condition stays `publishState === "error"`. Every `publishState === "pending"` comparison in the file updates (grep the file — includes any scroll/drag guards if present).
- [ ] **Step 4:** `pnpm vitest run tests/components/admin/wizard/Step3ReviewModal.test.tsx tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` → PASS.
- [ ] **Step 5:** commit `fix(admin): footer publish slot follows the operation in flight, not the optimistic checked flip`

### Task 5: `demoted` discriminator plumbing

**Files:** Modify `lib/onboarding/rescanWizardSheet.ts:28-29,398,431,445`, `app/api/admin/onboarding/rescan-sheet/route.ts:33-41`; Tests `tests/onboarding/rescanWizardSheet.db.test.ts`, `tests/onboarding/rescanWizardSheetFlowB.db.test.ts`, `tests/api/rescanSheetRoute.test.ts`.

- [ ] **Step 1: failing tests (spec T-C1/T-C2)** — extend the existing `toEqual` shapes: dirty-branch test expects `demoted: true` (`:401,428` cases and the corrupt-prior case `:569`); clean re-stamp `:360` and clean-unapproved `:619` expect `demoted: false`; route test asserts `mapResult` forwards `demoted`. Run the Global-Constraints sweep (`rg 'status: "updated", needsReview' tests/ lib/`) and update EVERY hit including Flow-B.
- [ ] **Step 2:** run `pnpm vitest run tests/onboarding tests/api/rescanSheetRoute.test.ts` → FAIL (missing field).
- [ ] **Step 3: implement** — `RescanResult` updated arm gains `demoted: boolean`; returns: `:398` `demoted: true`; `:431` and `:445` `demoted: false`; `mapResult` forwards it.
- [ ] **Step 4:** re-run → PASS. Requires local Supabase (see Global Constraints).
- [ ] **Step 5:** commit `feat(onboarding): rescan result carries a demoted discriminator`

### Task 6: Rescan button copy truth table

**Files:** Modify `components/admin/RescanSheetButton.tsx:48-94`; Test `tests/components/admin/RescanSheetButton.test.tsx`.

- [ ] **Step 1: failing tests (spec T-C3)** — parameterized over spec §C3 rows 1-4: `{demoted:true,changed:true|false}` and `{demoted:false,changed:true}` → the byte-identical "changed" sentence; `{demoted:false,changed:false}` → S1 verbatim. `!needsReview` rows re-asserted unchanged. Update the existing `:110-120` case (it stubs no `demoted`) to the new shape.
- [ ] **Step 2:** run → FAIL (S1 never rendered).
- [ ] **Step 3: implement** — `RescanResponse` ok-arm gains `demoted: boolean`; `resultFor` needsReview branch per spec §C2 code block verbatim.
- [ ] **Step 4:** `pnpm vitest run tests/components/admin/RescanSheetButton.test.tsx` → PASS. Confirm S1 contains no em dash/typographic apostrophe (M5-D8/emphasis scanners: `pnpm vitest run tests/messages tests/cross-cutting` at Task 9 covers).
- [ ] **Step 5:** commit `fix(admin): rescan result copy distinguishes unchanged-but-unapproved from changed`

### Task 7: Report-an-issue progressive disclosure

**Files:** Modify `components/admin/wizard/step3ReviewSections.tsx:1968-2092`; Test `tests/components/admin/wizard/step3ReviewSections.test.tsx`.

- [ ] **Step 1: failing tests (spec T-D1/T-D3)** —
  - default: toggle button (`wizard-step3-card-<dfid>-report-toggle`, accessible name "Write a report") present with `aria-expanded="false"`; textarea testid ABSENT.
  - click toggle → form present, `aria-expanded="true"`, textarea focused (`await waitFor(() => expect(textarea).toHaveFocus())`).
  - type draft → collapse → re-expand → textarea value preserved.
  - T-D3(a): mock fetch success → submit → status "Sent — thanks. The developer will take a look." → collapse → re-expand → status line still shows it.
  - T-D3(b): deferred fetch → submit → collapse while pending → resolve success → re-expand → success status rendered; sessionStorage attempt key removed (rotate-on-success observable via `window.sessionStorage.getItem(...) === null`).
- [ ] **Step 2:** run → FAIL (no toggle; form always mounted).
- [ ] **Step 3: implement** — `const [expanded, setExpanded] = useState(false);` + `const formId = useId();` + a focus effect or ref-callback that focuses the textarea when `expanded` flips true. Toggle button between the intro `<p>` and the form: quiet secondary recipe (copy the submit button's classes `:2069`), `aria-expanded={expanded}`, `aria-controls={formId}`, onClick `setExpanded((v) => !v)`. Wrap the existing `<form>` in `{expanded ? (<form id={formId} …existing…>) : null}`. `draft`/`status`/`handleSubmit` stay OUTSIDE the conditional (component-level state — T-D3 pins this). No other form changes.
- [ ] **Step 4:** `pnpm vitest run tests/components/admin/wizard/step3ReviewSections.test.tsx` → PASS (T-D2: expand-first updates to existing report tests, mechanical).
- [ ] **Step 5:** commit `feat(admin): report-an-issue form collapses behind a disclosure trigger`

### Task 8: Transition audit (spec §B3 + §D2 inventories)

**Files:** read-only audit of `Step3ReviewModal.tsx` footer + `ReportIssueSection`; assertions land in Task 4/7 test files if gaps found.

- [ ] **Step 1:** list every conditional render touched by this branch: footer slot ternary (`showCheckedSlot`), error-note conditional, disclosure `{expanded ? … : null}`. For each, confirm the treatment matches the spec inventory (ALL pairs instant-by-design; no `AnimatePresence`/exit props needed — the modal's existing animated surfaces are untouched).
- [ ] **Step 2:** confirm compound coverage exists: checked-settlement-during-pending (T-B1's harness IS this compound), error-note + new-op (T-B2), collapse-during-pending (T-D3b). If any is missing from the written tests, add it in the corresponding test file now.
- [ ] **Step 3:** run `pnpm vitest run tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` → PASS (existing §11 transition-contract pins unaffected).
- [ ] **Step 4:** commit only if Step 2 added tests: `test(admin): transition-audit gap coverage for footer slot / report disclosure`

### Task 9: Close-out verification

- [ ] **Step 1:** `pnpm vitest run` (FULL suite — response-shape sweep + scanner tests: `tests/messages`, `tests/cross-cutting/noRawDriveHostsInCrewSurface.test.ts` (route imports live in `lib/`/`app/api`, components stay literal-free), `tests/admin` meta-tests).
- [ ] **Step 2:** `pnpm typecheck` (vitest strips types; `next build`/quality-tsc does not).
- [ ] **Step 3:** `pnpm format:check` (fix with prettier --write on changed files only; NEVER the master spec).
- [ ] **Step 4:** real-browser gate: `pnpm test:e2e` step3-review-modal suites (existing §K11-§K15 must stay green; no new e2e per spec §T — jsdom covers the label swap).
- [ ] **Step 5:** commit any stragglers per-task; then impeccable dual gate (`/impeccable critique` + `/impeccable audit` on the diff) → whole-diff Codex review (Stage 4).
