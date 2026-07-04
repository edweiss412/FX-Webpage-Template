# Step-3 Review Modal Follow-ups (post-PR-#280) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the seven user-reported Step-3 review-modal follow-ups per the APPROVE'd spec `docs/superpowers/specs/2026-07-03-step3-modal-followups.md` (10 adversarial rounds; the spec is the canonical contract — this plan cites it as §A–§O and copies exact values; where plan and spec disagree, the spec wins). Items: A nav race + sliding indicator; B diagrams section + new admin-only staged-preview route; C footer Unpublish + demoted gate; D report-an-issue rail entry + report-API null-show loosening; E flag callouts + warning jump-links; F rooms notes separation; G rescan result overlay.

**Architecture:** One new read-only API route (`staged-diagram`, postgres.js deps-injected like the sibling onboarding routes — NO advisory lock, NO supabase-js); one new shared guard module (`lib/admin/stagedDiagramGuards.ts`) consumed by BOTH the route and the UI so "valid stub" can never disagree across surfaces; `step3SectionStatus` grows `warningsBySection` and `deriveSectionStatuses` is refactored to derive from it (byte-identical exported contract); the section registry gains `diagrams` (conditional) + `report` (unconditional, `hideDot`); `Step3ReviewModal` gains scroll-spy suppression refs, a single sliding rail indicator, jump/highlight machinery, and the Unpublish/demoted footer branches; `RescanSheetButton` gains an `overlay` result placement consumed only by the modal footer. Real-browser verification extends the two existing standalone Playwright specs + harnesses.

**Tech Stack:** Next 16 / React 19 client components + one Next API route handler, postgres.js (deps-injected), Tailwind v4 tokens (`app/globals.css`), lucide-react, Vitest 4 (jsdom opt-in per file), Playwright standalone config (`tests/e2e/standalone.config.ts`) + `pnpm dlx @tailwindcss/cli@4.2.4` / `pnpm dlx esbuild@0.28.0` harnesses.

## Global Constraints

- **TDD per task:** failing test → minimal implementation → pass → commit (`--no-verify`, conventional commits `<type>(<scope>): <summary>`, one task per commit). `--no-verify` skips the prettier hook — run `pnpm format:check` (and `prettier --write` the changed files) before push (Task 15).
- **UI files are Opus-owned** (`app/**` except `app/api/**`, `components/**`, `app/globals.css`, `DESIGN.md`) and impeccable-v3-gated (invariant 8, dual critique+audit in Task 15). The staged-diagram route (`app/api/**`) is NOT a UI surface.
- **No raw error codes in user-visible UI** (invariant 5); every failure copy routes through `lib/messages/lookup.ts` or an exported plain-English fallback constant.
- **No new §12.4 codes anywhere** (spec §B1/§N): reuse `ADMIN_FORBIDDEN`, `ADMIN_SESSION_LOOKUP_FAILED`, `REPORT_*`, `NETWORK_UNREACHABLE`. x1/x2 catalog gates are untouched.
- **Read-only route:** the staged-diagram route mutates nothing — plan-wide invariant 2 (advisory lock) is explicitly N/A (spec §B1). No `pg_advisory*` appears anywhere in this diff.
- **Named constants (spec §2 — single source of truth; every later mention references these):**

| Name | Value | Home |
|---|---|---|
| `NAV_SCROLL_SETTLE_TIMEOUT_MS` | 700 | exported from `Step3ReviewModal.tsx` |
| `NAV_SCROLL_SETTLE_EPSILON_PX` | 2 | exported from `Step3ReviewModal.tsx` |
| `INDICATOR_INSET_PX` | 12 | exported from `Step3ReviewModal.tsx` (matches the current `inset-y-3`) |
| `DIAGRAM_TILE_CAP` | 12 | exported from `step3ReviewSections.tsx` |
| `CALLOUT_MAX_ENTRIES` | 3 | exported from `step3ReviewSections.tsx` |
| `REPORT_MESSAGE_MAX_CHARS` | 2000 | exported from `step3ReviewSections.tsx` |
| `REPORT_PARSE_WARNINGS_CAP` | 50 | exported from `step3ReviewSections.tsx` |
| `WARNING_HIGHLIGHT_MS` | 1600 | exported from `Step3ReviewModal.tsx` |
| `STAGED_DIAGRAM_CACHE_SECONDS` | 300 | exported from the new route file |
| `STAGED_DIAGRAM_OBJECT_ID_MAX` | 256 | exported from the new route file |

- Interaction constants `NAV_SCROLL_SETTLE_TIMEOUT_MS`, `NAV_SCROLL_SETTLE_EPSILON_PX`, `WARNING_HIGHLIGHT_MS` get one-line entries in DESIGN.md §5.5 (Task 10; the section exists at DESIGN.md:246-253).
- **Test commands:** single file `pnpm test <path>`; full `pnpm test`; standalone e2e `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts <spec>` (equivalently `pnpm exec playwright test --config tests/e2e/standalone.config.ts <spec>`; both specs already match the config's `testMatch`, so no config edit is needed). jsdom tests start with `// @vitest-environment jsdom`.
- **Token fidelity note (verified against live tokens):** spec §B3/§E3/§F write the class `rounded-card`; no `--radius-card` token exists (`app/globals.css:181-184` defines only `--radius-sm|md|lg|pill`), so that utility would compile to nothing. The codebase's card radius is `rounded-md` (the §5.2 panel card, `step3ReviewSections.tsx:289`). This plan uses **`rounded-md`** wherever the spec says `rounded-card` — same intent, real utility, within spec §L's design-stage latitude. Do NOT invent a new token for this.
- **Transitions-test structural audit:** `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` walks every JSX conditional in `Step3ReviewModal.tsx` and asserts the curated conditional count (currently 8) plus a `§11: instant — deliberate` marker or an animation class per site. **Every task that adds/removes a JSX conditional in the modal (Tasks 8, 9, 10, 12) must update that curated count + markers in the same commit** or the suite goes red.
- **Anti-tautology (every test step):** scope DOM assertions to the element under test (`within(...)`, or clone + strip siblings that independently render the same label); derive expected values from fixture dimensions, never hardcode; every new test states the concrete failure mode it catches (copied from spec §K where given).
- **Copy is spec-verbatim** — including the report success line "Sent — thanks. The developer will take a look." (spec §D3; the spec is canonical over DESIGN.md's em-dash preference, plan-wide invariant 7).

## Meta-test inventory (declared — writing-plans mandatory)

- **Supabase call-boundary registry (`tests/auth/_metaInfraContract.test.ts` + `tests/reports/_metaInfraContract.test.ts`): N/A — no new supabase-js call sites.** The staged-diagram route uses the injectable postgres deps pattern like the sibling unapprove route's `queryOne` interface (`app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/unapprove/route.ts:23`) with the `defaultSql` module-pool pattern from `app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts:90-97`. The route carries `// not-subject-to-meta: postgres.js deps-injected read-only route, no supabase-js client (spec §B1)`. The report form's `fetch("/api/report")` is an internal Next API fetch — carries `// not-subject-to-meta: internal Next API fetch, not a Supabase client call`. If either meta-test flags a new pattern anyway, implementers add the inline `// not-subject-to-meta: <reason>` comment rather than a registry row.
- **Advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`): untouched** — the new route is read-only; no `pg_advisory*` anywhere in the diff; zero holders added or moved.
- **No-inline-email-normalization guard:** no new `.toLowerCase()`/`.trim()` in `lib/drive/**` or `lib/sync/**` (the guard also sweeps those trees for non-email case-folds). New `.trim()` calls land only in `components/**` and `lib/reports/submit.ts` (which already carries per-line `// canonicalize-exempt:` comments — preserve them when editing `showLine`).
- **§12.4 catalog (x1): unaffected** — zero catalog/spec-prose edits.
- **Existing structural tests this plan EXTENDS:** the transitions audit (`step3ReviewModal.transitions.test.tsx`, Tasks 10 + 13) and the registry-math suite (`step3ReviewSections.test.tsx`, Task 5). No new registries created.

## File Structure

| File | Action | Task |
| --- | --- | --- |
| `lib/admin/step3SectionStatus.ts` | Modify — `SectionId` +2, `warningsBySection`, refactored `deriveSectionStatuses` | 1 |
| `tests/admin/step3SectionStatus.test.ts` | Extend (existing tests pass UNMODIFIED) | 1 |
| `lib/admin/stagedDiagramGuards.ts` | Create — `isRenderableDiagramStub`, `isTrustedDiagramContentUrl` | 2 |
| `tests/admin/stagedDiagramGuards.test.ts` | Create | 2 |
| `app/api/admin/onboarding/staged-diagram/[wizardSessionId]/[driveFileId]/[objectId]/route.ts` | Create | 3 |
| `tests/api/staged-diagram-route.test.ts` | Create | 3 |
| `lib/reports/submit.ts` | Modify — `show_id: string \| null`, call-site guards, formatter null-hardening | 4 |
| `app/api/report/route.ts` | Modify — admin-only null `show_id` validation | 4 |
| `tests/reports/nullShow.test.ts` | Create (route + formatter + call-site-guard tests) | 4 |
| `components/admin/wizard/step3ReviewSections.tsx` | Modify — registry defs, `hideDot`, `DiagramsBreakdown`, `ReportIssueSection`, chrome context, callout, rooms inset, `NotPublishableNote` | 5,6,7,8,9,11 |
| `tests/components/admin/wizard/step3ReviewSections.test.tsx` | Extend — registry math 12/13/13/14, diagrams body | 5,6 |
| `tests/components/admin/wizard/step3ReportIssueSection.test.tsx` | Create | 7 |
| `components/admin/wizard/Step3ReviewModal.tsx` | Modify — footer branches, callout plumbing, jump/highlight, suppression, indicator, overlay placement | 8,9,10,12 |
| `tests/components/admin/wizard/Step3ReviewModal.test.tsx` | Extend — footer §K3, jump §K9, suppression §A2 | 8,9,10 |
| `components/admin/wizard/Step3SheetCard.tsx` | Modify — `NotPublishableNote` import swap only | 8 |
| `components/admin/RescanSheetButton.tsx` | Modify — `resultPlacement` prop | 12 |
| `tests/components/admin/RescanSheetButton.test.tsx` | Extend | 12 |
| `app/globals.css` | Modify — warning-flash keyframe, overlay pop-in hook | 9,12 |
| `DESIGN.md` | Modify — §5.5 three new constants | 10 |
| `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` | Extend — T6′ flip (Task 10), §H audit (Task 13) | 10,13 |
| `tests/e2e/_step3ReviewModalHarness.tsx`, `_step3ReviewModalLiveEntry.tsx` | Modify — diagrams/warnings fixtures, fetch stub | 14 |
| `tests/e2e/step3-review-modal.layout.spec.ts`, `.interactions.spec.ts` | Extend — §K11–§K15 | 14 |

**Shared fixture:** `tests/components/admin/wizard/_step3ReviewFixture.ts` already exports `buildParseResult(overrides)` / `stagedRow(pr, overrides)`; its default `diagrams` is `{ linkedFolder: null, embeddedImages: [], linkedFolderItems: [] }` (line 117) — diagram tests override via `prOverrides`.

---

### Task 1: Section-status foundation (spec §E2, §B2, §D2)

**Files:**
- Modify: `lib/admin/step3SectionStatus.ts`
- Extend: `tests/admin/step3SectionStatus.test.ts` — **append new `describe` blocks only; every existing test body stays byte-unmodified and must pass** (spec §E2's byte-identical contract).

**Interfaces (Produces):**
```ts
export type SectionId =
  | "venue" | "event" | "crew" | "contacts" | "schedule" | "agenda"
  | "hotels" | "transport" | "rooms" | "diagrams" | "packlist" | "billing"
  | "warnings" | "report";
export function warningsBySection(
  warnings: readonly ParseWarning[],
  renderedSections: ReadonlySet<SectionId>,
): ReadonlyMap<SectionId, readonly { warning: ParseWarning; index: number }[]>;
// deriveSectionStatuses: exported signature UNCHANGED, now derived from the map.
```

- [ ] **Step 1: failing tests.** New `describe("warningsBySection")` + `describe("deriveSectionStatuses derives from warningsBySection")`:
  - **Index fidelity:** input `[info(crew), warn(crew), info(rooms), warn(unknown_section)]` (build via the file's existing `warn(kind, severity)`-style helper) → map has `crew → [{index: 1}]` and `warnings → [{index: 3}]` — indices are positions in the FULL input array, info rows included (catches: helper indexing a warn-filtered copy, which would break `-warning-${i}` jump targets — the WarningsBreakdown list renders `-warning-${i}` over the same full array, `step3ReviewSections.tsx:1104`).
  - **Mapped/unmapped/info rules mirror today's `deriveSectionStatuses` (L48-60):** warn mapped + rendered → its section; warn mapped + NOT rendered → `warnings` bucket; warn unmapped → `warnings`; info-severity → absent from every value list.
  - **diagrams/report never flagged:** with `renderedSections` including `"diagrams"` and `"report"`, a warn with fabricated kind `"diagrams"` and one with kind `"report"` both land in the `warnings` bucket (`KIND_TO_SECTION` is UNCHANGED — no kind maps to either, spec §B2/§D2); assert the map NEVER has key `"diagrams"` or `"report"` (catches: someone "helpfully" adding a diagrams mapping, which would flag a section whose rail dot is contractually always ok-tone).
  - **No-false-All-clean property:** for a table of warning mixes, whenever ≥1 warn-severity warning exists, the union of the map's value-list lengths ≥ 1 AND `deriveSectionStatuses(...).flaggedCount ≥ 1` (catches: the refactor silently dropping a warn class).
  - **Derivation consistency:** for each mix, `deriveSectionStatuses(...).flagged` set-equals `new Set(warningsBySection(...).keys())` and `flaggedCount === keys.size` (catches: the two surfaces disagreeing — the exact bug §E2 exists to prevent).
- [ ] **Step 2:** `pnpm test tests/admin/step3SectionStatus.test.ts` → FAIL (no `warningsBySection` export).
- [ ] **Step 3: implementation.** Extend the union (insert `"diagrams"` after `"rooms"`, append `"report"` after `"warnings"` — order is cosmetic, membership is the contract); add the helper; refactor:

```ts
export function warningsBySection(
  warnings: readonly ParseWarning[],
  renderedSections: ReadonlySet<SectionId>,
): ReadonlyMap<SectionId, readonly { warning: ParseWarning; index: number }[]> {
  const map = new Map<SectionId, { warning: ParseWarning; index: number }[]>();
  warnings.forEach((warning, index) => {
    if (warning.severity !== "warn") return;
    const mapped = sectionForWarning(warning);
    const target: SectionId =
      mapped !== null && renderedSections.has(mapped) ? mapped : "warnings";
    const list = map.get(target);
    if (list) list.push({ warning, index });
    else map.set(target, [{ warning, index }]);
  });
  return map;
}

export function deriveSectionStatuses(
  warnings: readonly ParseWarning[],
  renderedSections: ReadonlySet<SectionId>,
): { flagged: ReadonlySet<SectionId>; flaggedCount: number } {
  // Derived from warningsBySection so the flag set and the callout map can
  // never disagree (spec §E2). Same rules as before: warn-severity only;
  // mapped→section when rendered, else the warnings bucket; unmapped→warnings.
  const flagged = new Set(warningsBySection(warnings, renderedSections).keys());
  return { flagged, flaggedCount: flagged.size };
}
```
`KIND_TO_SECTION` and `sectionForWarning` are byte-unchanged.
- [ ] **Step 4:** `pnpm test tests/admin/step3SectionStatus.test.ts` → PASS with ZERO edits to pre-existing test bodies (spot-check `git diff tests/admin/step3SectionStatus.test.ts` shows additions only). Also run `pnpm test tests/components/admin/wizard` (SectionId consumers still typecheck at runtime).
- [ ] **Step 5:** `git add -A && git commit --no-verify -m "feat(admin): warningsBySection helper + diagrams/report section ids (deriveSectionStatuses refactor)"`

### Task 2: Shared diagram stub predicate + URL trust boundary (spec §B1)

**Files:** Create `lib/admin/stagedDiagramGuards.ts`, `tests/admin/stagedDiagramGuards.test.ts`.

**Interfaces (Produces):**
```ts
export function isRenderableDiagramStub(x: unknown): x is EmbeddedImageStub;
export function isTrustedDiagramContentUrl(raw: string): boolean;
```

- [ ] **Step 1: failing tests** (node env). Predicate matrix (fields per spec §B1 exactly — the predicate covers EVERY field either consumer dereferences):
  - valid stub `{ sheetTab: "DIAGRAMS", objectId: "obj-1", mimeType: "image/png" }` → true; with `contentUrl: null` → true; with `contentUrl: "https://x"` → true; with `alt: "floor plan"` → true.
  - `null`, `"str"`, `42`, `[]` → false; `{ objectId: 123 }` → false; missing `mimeType` → false; missing `sheetTab` → false (required by the type, `lib/parser/types.ts:249`, and dereferenced by the UI alt fallback); `alt: 7` → false; `contentUrl: 5` → false; `contentUrl: undefined` (absent) → true.
  - Failure mode caught: client/route dereference of corrupt staged JSONB (`[object Object]` URLs, crash on `stub.sheetTab`).
  - URL trust matrix: `https://lh3.googleusercontent.com/a` → true; `https://docs.google.com/x` → true; `https://google.com/x` → true; `https://googleusercontent.com/x` → true; `http://lh3.googleusercontent.com/a` → false (https only); `https://evil.example/x` → false; **`https://google.com.evil.net/x` → false (suffix spoof — dot-boundary rule)**; `https://notgoogle.com/x` → false; `"::::"` (unparseable) → false. Failure mode: Drive bearer-token exfiltration to an attacker origin (SSRF class, spec §B1 "URL trust boundary").
- [ ] **Step 2:** run → FAIL (module not found).
- [ ] **Step 3: implementation** (client-safe — type-only import, no server imports; consumed by BOTH the Task-3 route and Task-6 `DiagramsBreakdown`):

```ts
// lib/admin/stagedDiagramGuards.ts
import type { EmbeddedImageStub } from "@/lib/parser/types";

/**
 * Element-level guard for UNTRUSTED persisted JSONB diagram stubs (spec §B1).
 * A stub is addressable/renderable only if every field either consumer
 * (staged-diagram route, DiagramsBreakdown) dereferences has the right shape:
 * objectId/mimeType/sheetTab string-required; alt absent-or-string;
 * contentUrl absent/null/string. The shared export exists so the two
 * surfaces can never disagree on what "valid stub" means.
 */
export function isRenderableDiagramStub(x: unknown): x is EmbeddedImageStub {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.objectId !== "string") return false;
  if (typeof o.mimeType !== "string") return false;
  if (typeof o.sheetTab !== "string") return false;
  if (o.alt !== undefined && typeof o.alt !== "string") return false;
  if (o.contentUrl !== undefined && o.contentUrl !== null && typeof o.contentUrl !== "string") {
    return false;
  }
  return true;
}

const TRUSTED_DIAGRAM_HOSTS = ["googleusercontent.com", "google.com"] as const;

/**
 * URL trust boundary (spec §B1, load-bearing): the snapshot fetch helper sends
 * the Drive BEARER TOKEN to whatever contentUrl says
 * (lib/sync/defaultSnapshotAssetsForApply.ts:60-66), and parse_result is
 * untrusted — so https-only + dot-boundary host suffix, never a bare
 * endsWith (suffix-spoofs like google.com.evil.net must fail).
 */
export function isTrustedDiagramContentUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const h = url.hostname.toLowerCase(); // canonicalize-exempt: URL host comparison, not email normalization.
  return TRUSTED_DIAGRAM_HOSTS.some((d) => h === d || h.endsWith("." + d));
}
```
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `feat(admin): shared staged-diagram stub predicate + contentUrl trust boundary`

### Task 3: Staged-diagram preview route (spec §B1, §K7)

**Files:** Create `app/api/admin/onboarding/staged-diagram/[wizardSessionId]/[driveFileId]/[objectId]/route.ts`, `tests/api/staged-diagram-route.test.ts`.

**Interfaces (Produces):**
```ts
export const STAGED_DIAGRAM_CACHE_SECONDS = 300;
export const STAGED_DIAGRAM_OBJECT_ID_MAX = 256;
export type StagedDiagramRouteDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  queryOne?: <T>(sqlText: string, params: unknown[]) => Promise<T | null>;
  fetchImageBytes?: (stub: EmbeddedImageStub) => Promise<SnapshotAssetBytes | null>;
};
export async function handleStagedDiagramGet(
  request: Request, context: RouteContext, routeDeps?: StagedDiagramRouteDeps,
): Promise<Response>;
export async function GET(request: Request, context: RouteContext): Promise<Response>;
```

- [ ] **Step 1: failing tests** (`tests/api/staged-diagram-route.test.ts`). Harness: deps-INJECTION (the `wizard-unapprove-route.test.ts:226-250` pattern — a `deps(overrides)` builder handing `requireAdminIdentity` / `queryOne: vi.fn()` / `fetchImageBytes: vi.fn()` straight to `handleStagedDiagramGet`), not `vi.mock` module graphs; the `tests/api/diagram-asset-route.test.ts` idiom of `params: Promise.resolve({...})` + per-test fixture mutation applies. Shared fixture pieces:

```ts
const WSID = "00000000-1111-4222-8333-444444444444";
const DFID = "drive-abc-123";
const validStub = {
  sheetTab: "DIAGRAMS", objectId: "obj-1", mimeType: "image/png",
  sheetsRevisionId: "rev-1", embeddedFingerprint: "fp", recovery_disposition: "normal",
  snapshotPath: null, contentUrl: "https://lh3.googleusercontent.com/img-1",
};
const parseResultWith = (images: unknown[]) => ({ diagrams: { embeddedImages: images, linkedFolderItems: [], linkedFolder: null } });
function get(objectId = "obj-1", wsid = WSID, dfid = DFID, overrides = {}) {
  return handleStagedDiagramGet(new Request(`https://x.test/api/admin/onboarding/staged-diagram/${wsid}/${dfid}/${encodeURIComponent(objectId)}`), { params: Promise.resolve({ wizardSessionId: wsid, driveFileId: dfid, objectId }) }, deps(overrides));
}
```
  Tests (spec §K7 verbatim; each names its failure mode):
  1. **Unauth 403:** `requireAdminIdentity` rejects with a plain error → 403, body `{ ok: false, code: "ADMIN_FORBIDDEN" }`, `queryOne` NOT called. Rejecting with `{ code: "ADMIN_SESSION_LOOKUP_FAILED" }` → 500 with that code. (Auth runs FIRST — session-guard bypass.)
  2. **Malformed `wizardSessionId`** (`"not-a-uuid"`) AND **malformed `driveFileId`** (`"a/b"`, and `""`) → 404 with ZERO `queryOne` calls (spy asserts `queryOne.mock.calls.length === 0`; a malformed UUID must be a controlled 404, never a Postgres invalid-UUID 500).
  3. **Malformed `objectId`** (`"a b"`, `""`, 257 chars — derive length from `STAGED_DIAGRAM_OBJECT_ID_MAX + 1`) → 400, zero `queryOne` calls.
  4. **Superseded/absent session:** `queryOne → null` → 404.
  5. **Unknown objectId:** valid row, no matching stub → 404, `fetchImageBytes` NOT called.
  6. **Hostile contentUrl fixtures** — `http://lh3.googleusercontent.com/x` (http scheme), `https://evil.example/x`, and the suffix-spoof `https://google.com.evil.net/x` — each → 404 with ZERO `fetchImageBytes` calls (spy asserts no token ever leaves).
  7. **Null contentUrl stub** → 404, zero Drive calls (spy).
  8. **Happy path, wrapped shape:** `fetchImageBytes → { bytes: new TextEncoder().encode("png-bytes"), sha256Base64Url: "s", md5Hex: "m" }` (the realistic `BoundedByteResult`, `lib/sync/boundedBytes.ts:11-15` — NOT a raw Uint8Array fixture; catches un-normalized union handling) → 200; body text `"png-bytes"`; EXACT headers: `content-type: image/png`, `x-content-type-options: nosniff`, `content-disposition: inline`, `cache-control: private, max-age=300` (assert via the exported `STAGED_DIAGRAM_CACHE_SECONDS`, not the literal), `content-length: "9"` (derive from the fixture bytes' `byteLength`).
  9. **Raw `Uint8Array` return** also served as 200 with matching `content-length`.
  10. **Helper THROWS** (`fetchImageBytes` rejects) → 404, not 500 (fail-soft posture lives at the route boundary — spec §B1: the helper RETHROWS non-timeout errors, `defaultSnapshotAssetsForApply.ts:60-77`).
  11. **Non-allowlisted mime:** stub `mimeType: "image/svg+xml"` → 404, zero fetches (inline-SVG XSS).
  12. **Malformed `parse_result` — container level:** `parse_result` as a JSON STRING (double-encode), `null`, `{}` (missing `diagrams`), `{ diagrams: { embeddedImages: "x" } }` (non-array) → each 404, never 500.
  13. **Malformed `parse_result` — element level:** `embeddedImages: [null]`, `[{ objectId: 123 }]`, `[{ ...validStub, contentUrl: 7 }]`, `[{ ...validStub, sheetTab: undefined }]` (missing sheetTab), `[{ ...validStub, alt: 7 }]` → each 404, never 500 (malformed elements are skipped during objectId matching — an unaddressable stub is a 404 like any unknown objectId).
- [ ] **Step 2:** run → FAIL (module not found).
- [ ] **Step 3: implementation:**

```ts
// app/api/admin/onboarding/staged-diagram/[wizardSessionId]/[driveFileId]/[objectId]/route.ts
import { NextResponse } from "next/server";
import postgres from "postgres";
import {
  isRenderableDiagramStub,
  isTrustedDiagramContentUrl,
} from "@/lib/admin/stagedDiagramGuards";
import { snapshotFetchEmbeddedImageBytesTimed } from "@/lib/sync/defaultSnapshotAssetsForApply";
import type { SnapshotAssetBytes } from "@/lib/sync/snapshotAssets";
import type { EmbeddedImageStub } from "@/lib/parser/types";

// Spec §B1 (2026-07-03-step3-modal-followups): admin-only, READ-ONLY preview
// of a staged embedded-diagram image. No shows row exists pre-finalize, so
// bytes are live-fetched from Drive via the snapshot pipeline's injectable
// helper; every failure (stale contentUrl, corrupt staged JSONB, unknown
// objectId, superseded session) is a fail-soft 404 the <img> onError
// placeholder absorbs. Advisory lock: N/A — read-only path (invariant 2
// applies to mutations only; spec §B1 declares this explicitly).
// not-subject-to-meta: postgres.js deps-injected read-only route, no
// supabase-js client (spec §B1).

export const STAGED_DIAGRAM_CACHE_SECONDS = 300;
export const STAGED_DIAGRAM_OBJECT_ID_MAX = 256;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DRIVE_FILE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const OBJECT_ID_PATTERN = new RegExp(`^[A-Za-z0-9_-]{1,${STAGED_DIAGRAM_OBJECT_ID_MAX}}$`);
const RASTER_MIME_ALLOWLIST = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export type StagedDiagramRouteDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  queryOne?: <T>(sqlText: string, params: unknown[]) => Promise<T | null>;
  fetchImageBytes?: (stub: EmbeddedImageStub) => Promise<SnapshotAssetBytes | null>;
};

type RouteContext = {
  params: Promise<{ wizardSessionId: string; driveFileId: string; objectId: string }>;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("staged-diagram route requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

let _pool: ReturnType<typeof postgres> | null = null;
function defaultQueryOne<T>(sqlText: string, params: unknown[]): Promise<T | null> {
  _pool ??= postgres(databaseUrl(), { prepare: false });
  return _pool.unsafe(sqlText, params as never[]).then((rows) => (rows[0] as T) ?? null);
}

async function defaultRequireAdminIdentity(): Promise<{ email: string }> {
  const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
  return await requireAdminIdentity();
}

function jsonError(status: number, code: string): Response {
  return NextResponse.json({ ok: false, code }, { status });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function handleStagedDiagramGet(
  _request: Request,
  context: RouteContext,
  routeDeps: StagedDiagramRouteDeps = {},
): Promise<Response> {
  const requireIdentity = routeDeps.requireAdminIdentity ?? defaultRequireAdminIdentity;
  const queryOne = routeDeps.queryOne ?? defaultQueryOne;
  const fetchImageBytes =
    routeDeps.fetchImageBytes ?? ((stub: EmbeddedImageStub) => snapshotFetchEmbeddedImageBytesTimed(stub));

  // Auth FIRST, mirroring the sibling unapprove route (unapprove/route.ts:127-133).
  try {
    await requireIdentity();
  } catch (error) {
    const code =
      typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") return jsonError(500, code as string);
    return jsonError(403, "ADMIN_FORBIDDEN");
  }

  const { wizardSessionId, driveFileId, objectId: rawObjectId } = await context.params;

  // Param validation — after auth, before any route-owned DB query (spec §B1).
  // Malformed wizardSessionId/driveFileId → controlled 404 (never a Postgres
  // invalid-UUID 500); malformed objectId → 400 (§K7 shapes).
  if (!UUID_PATTERN.test(wizardSessionId)) return jsonError(404, "NOT_FOUND");
  if (!DRIVE_FILE_ID_PATTERN.test(driveFileId)) return jsonError(404, "NOT_FOUND");
  let objectId: string;
  try {
    objectId = decodeURIComponent(rawObjectId);
  } catch {
    return jsonError(400, "BAD_REQUEST");
  }
  if (!OBJECT_ID_PATTERN.test(objectId)) return jsonError(400, "BAD_REQUEST");

  // Row lookup — mirrors the unapprove route's active-session guard
  // (unapprove/route.ts:80-92): pending_syncs.wizard_session_id +
  // app_settings.pending_wizard_session_id (there is NO
  // pending_wizard_session_id column on pending_syncs).
  const row = await queryOne<{ parse_result: unknown }>(
    `
      select parse_result
        from public.pending_syncs
       where drive_file_id = $1
         and wizard_session_id = $2::uuid
         and exists (
           select 1 from public.app_settings
            where id = 'default'
              and pending_wizard_session_id = $2::uuid
         )
    `,
    [driveFileId, wizardSessionId],
  );
  if (!row) return jsonError(404, "NOT_FOUND");

  // parse_result is UNTRUSTED JSONB (legacy double-encoded/corrupt rows exist —
  // lib/sync/applyStaged.ts:443-459). Container-level shape checks; any
  // malformed container → 404, never a 500.
  const pr = row.parse_result;
  if (!isPlainObject(pr)) return jsonError(404, "NOT_FOUND");
  const diagrams = pr.diagrams;
  if (!isPlainObject(diagrams)) return jsonError(404, "NOT_FOUND");
  const images = diagrams.embeddedImages;
  if (!Array.isArray(images)) return jsonError(404, "NOT_FOUND");

  // Element-level: malformed elements are skipped during matching (an
  // unaddressable stub is a 404 like any unknown objectId). First match wins.
  const stub = images.find(
    (el): el is EmbeddedImageStub => isRenderableDiagramStub(el) && el.objectId === objectId,
  );
  if (!stub) return jsonError(404, "NOT_FOUND");

  // Raster allowlist — no SVG (inline-SVG XSS), checked before any Drive call.
  if (!RASTER_MIME_ALLOWLIST.has(stub.mimeType)) return jsonError(404, "NOT_FOUND");

  // XLSX-media entries (contentUrl null) have no per-entry URL → 404, no Drive call.
  if (stub.contentUrl == null) return jsonError(404, "NOT_FOUND");
  // URL trust boundary (spec §B1): the helper sends the Drive bearer token to
  // this URL — untrusted string is NOT enough. Untrusted → 404, ZERO network calls.
  if (!isTrustedDiagramContentUrl(stub.contentUrl)) return jsonError(404, "NOT_FOUND");

  // Byte fetch: the helper returns null for non-ok/no-body/stall-timeout but
  // RETHROWS other errors (defaultSnapshotAssetsForApply.ts:60-77) — the route
  // maps ANY throw to 404 (fail-soft lives at the route boundary).
  let result: SnapshotAssetBytes | null;
  try {
    result = await fetchImageBytes(stub);
  } catch {
    result = null;
  }
  if (result === null) return jsonError(404, "NOT_FOUND");
  // Union normalization: Uint8Array | BoundedByteResult (lib/sync/snapshotAssets.ts:30).
  const payload = result instanceof Uint8Array ? result : result.bytes;

  return new Response(Buffer.from(payload), {
    status: 200,
    headers: {
      "Content-Type": stub.mimeType,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Cache-Control": `private, max-age=${STAGED_DIAGRAM_CACHE_SECONDS}`,
      "Content-Length": String(payload.byteLength),
    },
  });
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return await handleStagedDiagramGet(request, context);
}
```
  Note: `NOT_FOUND`/`BAD_REQUEST` body strings are HTTP-status discriminators for the JSON body, NOT §12.4 codes and NEVER rendered in UI (the consumer is an `<img>` whose `onError` shows the placeholder — spec §B1 sanctions JSON error bodies). If the x2 no-raw-codes scanner flags them, use `{ ok: false }` bodies instead — the tests assert status codes, not body strings.
- [ ] **Step 4:** `pnpm test tests/api/staged-diagram-route.test.ts` → PASS.
- [ ] **Step 5:** commit `feat(admin): staged-diagram preview route (read-only, trust-bounded, fail-soft 404)`

### Task 4: Report API null-show loosening (spec §D4, §K5, §K6)

**Files:** Modify `lib/reports/submit.ts`, `app/api/report/route.ts`; Create `tests/reports/nullShow.test.ts`.

- [ ] **Step 1: failing tests** (`tests/reports/nullShow.test.ts`). Two harness halves:
  - **Route validation (§K5)** — model on `tests/reports/auth.test.ts:1-80` (`vi.mock` of `resolvePickerSelection`/`requireAdmin`/`submitReport`, dynamic `POST` import, `NextRequest` builder):
    - `show_id: null` + `surface: "admin"` + admin auth OK → `submitReport` mock IS called (status passes through) — accepted.
    - `show_id: null` + `surface: "crew_footer"` → 400, `submitReport` NOT called, picker resolver NOT called (crew unchanged — catches: loosening leaking to crew).
    - `show_id: "not-a-uuid"` + admin → 400 (string still must be UUIDv4).
    - `show_id` ABSENT (undefined) + admin → 400 (only explicit `null` is loosened).
  - **Formatters + call-site guards (§K6)** — model on `tests/reports/showContext.test.ts` (its hoisted `supabaseMock` records every `from()` query; `githubMock.createIssue` captures `{title, body}`); reuse its mock topology:
    - **Call-site guard proof:** `submitReport(adminAuth, { ...body, show_id: null, surface: "admin", showTitle: "Staged Show", fieldRef: { kind: "wizard-step3", driveFileId: "drive-abc-123", wizardSessionId: WSID, driveFileName: "Sheet A", stagedShowTitle: "Staged Show" } })` → 201 AND `supabaseMock.queries` is `[]` — `readReportShowContext` was never called for a null show (BOTH call sites, `submit.ts:1035` expired-retry and `submit.ts:1039` normal, are guarded; catches: `{state:"missing"}` → "(deleted)" mislabel).
    - **Issue BODY assertions (both fixtures; assert the captured `githubMock.calls[0].body`, NOT the title — the title is always `Bug report: <surface>`, `submit.ts:471-484`, and stays that way):**
      (a) `showTitle: "Staged Show"` + `show_id: null` → body's `**Show:**` line contains `"Staged Show"`; body contains the fieldRef's `driveFileId` value (derive from the fixture object, not a restated literal); `expect(body).not.toMatch(/\bnull\b/)`; `expect(body).not.toContain("(deleted)")`.
      (b) `showTitle: null, showSlug: null, show_id: null` → `**Show:**` line contains the terminal fallback `"staged wizard sheet (no show record)"`; same no-`null`-literal + no-"(deleted)" assertions; `**Summary:**` line does not contain `"null"` (issueSummaryLine hardening).
    - **`buildCrewIssueBody` null-hardening (pure unit, direct import):** crew body built with `show_id: null`, no showContext, `showSlug: null` → the `Reported by` line contains the fallback family string, never a `null` literal (the crew ROUTE still forbids null, but the exported formatter must not rely on a caller-side invariant once the type widens).
- [ ] **Step 2:** run → FAIL (typecheck of the fixture alone fails until `show_id` widens; route test fails on 400).
- [ ] **Step 3: implementation.**
  - `lib/reports/submit.ts:23`: `show_id: string | null;` (keep `showTitle?` at :24 as-is).
  - `app/api/report/route.ts:32-40` (`readRequestBody`):
```ts
async function readRequestBody(req: Request): Promise<RequestBody | null> {
  try {
    const body = (await req.json()) as Partial<RequestBody>;
    if (!isUuidV4(body.idempotency_key)) return null;
    if (body.show_id === null) {
      // Spec §D4: staged wizard rows have no shows record — null is allowed
      // ONLY for the admin surface; crew always has a show (unchanged 400).
      if (body.surface !== "admin") return null;
    } else if (!isUuidV4(body.show_id)) {
      return null;
    }
    return body as RequestBody;
  } catch {
    return null;
  }
}
```
  - `submit.ts` call sites — `readReportShowContext` stays `(showId: string)` (do NOT widen it or route null through it):
```ts
// submit.ts:1034-1039 becomes:
if (reservation.state === "expired_pending_recovery") {
  const showContext = body.show_id == null ? undefined : await readReportShowContext(body.show_id);
  return await expiredLeaseRetry(postgresAdapter(sql), auth, body, showContext);
}
const showContext = body.show_id == null ? undefined : await readReportShowContext(body.show_id);
```
    (`showContext?: ReportShowContextInput` is already optional on every formatter — `undefined` flows through unchanged.)
  - `showLine` (`submit.ts:263-270`) null-hardening — preserve the existing `// canonicalize-exempt:` comments on the two `.trim()` lines:
```ts
function showLine(body: RequestBody): string {
  const title = body.showTitle?.trim(); // canonicalize-exempt: report title formatting, not email normalization.
  const slug = body.showSlug?.trim(); // canonicalize-exempt: report slug formatting, not email normalization.
  const idSuffix = body.show_id != null ? ` — ${body.show_id}` : "";
  if (title && slug) return `${title} (\`${slug}\`)${idSuffix}`;
  if (title) return `${title}${idSuffix}`;
  if (slug) return `\`${slug}\`${idSuffix}`;
  return body.show_id ?? "staged wizard sheet (no show record)";
}
```
  - `showContextLine` (`submit.ts:278-283`) gains the FIRST branch:
```ts
function showContextLine(body: RequestBody, showContext?: ReportShowContextInput): string {
  // Spec §D4: a staged wizard report has no shows record — take the staged
  // fallback path, NEVER the "(deleted)" missing-show label.
  if (body.show_id == null) return showLine(body);
  const show = foundShowContext(showContext);
  if (show) return `${show.title} (${show.slug})`;
  if (showContext && "state" in showContext && showContext.state === "missing") return "(deleted)";
  return showLine(body);
}
```
  - `issueSummaryLine` (`submit.ts:361-393`): already show_id-free (it reads only `body.showTitle` via `pickString`, which the §D3 payload feeds; the null-null terminal falls to `` `${pickString(body.surface) ?? "report"} report` ``) — no code change expected; the §K6 fixture (b) test PINS this.
  - `buildCrewIssueBody` (`submit.ts:447`): `` `crew member of \`${show?.slug ?? body.showSlug ?? body.show_id ?? "staged wizard sheet (no show record)"}\` `` (same fallback family).
  - **Typecheck-driven sweep:** `rg -n 'show_id' lib/reports/` and widen every internal pass-through param that now receives `string | null` (verified consumer inventory: `handleTailUpdateMiss`'s trailing `body.show_id` arg at `submit.ts:1062` — widen its param to `string | null`; `acquireReportLease`/`ReportLeaseDb` already take `showId: string | null`, `lib/reports/leaseProtocol.ts:10`; the `admin_alerts` upsert already coalesces, `submit.ts:645-647`). postgres.js nullable-bind discipline: the value is always an explicit `null` (never `undefined`) because validation requires the field present.
- [ ] **Step 4:** `pnpm test tests/reports/ && pnpm typecheck` → PASS (the reports suite hits the local DB — run from the main checkout env contract if `TEST_DATABASE_URL`-dependent tests complain; see `feedback_validation_creds_in_main_env_local`).
- [ ] **Step 5:** commit `feat(report): admin surface accepts show_id null for staged wizard rows (formatters null-hardened)`

### Task 5: Registry entries — diagrams + report defs (spec §B2, §D2, §K2)

**Files:** Modify `components/admin/wizard/step3ReviewSections.tsx` (registry + `Step3SectionDef`), `components/admin/wizard/Step3ReviewModal.tsx` (`hideDot` consumption in BOTH navs); Extend `tests/components/admin/wizard/step3ReviewSections.test.tsx`.

- [ ] **Step 1: failing tests.** Read the current registry-math assertions FIRST (`step3ReviewSections.test.tsx:237` "11 defs without an agenda baseline; 12 with", `:225` group list, `:267` railCount subset) — this task UPDATES them per spec §B2 (the sanctioned exception to "existing tests unmodified"):
  - **Counts 12/13/13/14:** base defs (no agenda, no diagrams) = **12** (report is unconditional); +agenda = 13; +diagrams = 13; both = 14. Diagrams fixtures: `prOverrides.diagrams = { linkedFolder: null, embeddedImages: [validStub], linkedFolderItems: [] }` (and a folder-only variant `{ linkedFolder: { driveFolderId: "f1", driveFolderUrl: "https://drive.google.com/drive/folders/f1" }, embeddedImages: [], linkedFolderItems: [] }`). Update `EXPECTED_NO_AGENDA`/`EXPECTED_WITH_AGENDA` id arrays: `diagrams` sits **after `rooms`, before `packlist`**; `report` is ALWAYS last (after `warnings`).
  - **Presence gate:** diagrams def present iff `d.pr.diagrams != null && (linkedFolder != null || embeddedImages.length > 0 || linkedFolderItems.length > 0)`; absent for the fixture default (all-empty) and for `pr.diagrams` deleted (catches: conditional-insert breaking rail order / badge-section disagreement).
  - **`hideDot` only on report:** exactly one def has `hideDot === true` and its id is `"report"`; every other def's `hideDot` is undefined.
  - **railCount:** diagrams railCount is a function returning `embeddedImages.length + linkedFolderItems.length` (derive from fixture lengths) when that sum > 0, and `null` for the folder-only fixture; report railCount `null`. Update the COUNTED-subset test (`:267`) accordingly.
  - **Labels/groups:** `diagrams → { label: "Diagrams", group: "Gear" }`, `report → { label: "Report an issue", group: "Checks" }` (extend the `LABELS`/`GROUPS` maps).
  - **Modal nav dots (jsdom, render `Step3ReviewModal`):** the report rail item and report chip item contain NO status-dot span (`within(item)` query for the `bg-status-*` class finds nothing), while e.g. the warnings item still has one; diagrams item dot is ALWAYS `bg-status-positive` even with a warn present whose fabricated kind is `"diagrams"` (Task 1 contract, rendered — catches: `dotToneClass` regression).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implementation.**
  - `Step3SectionDef` gains `hideDot?: true;` (exactOptionalPropertyTypes: present-`true` or ABSENT — never `hideDot: undefined`).
  - In `step3Sections(d)` (`step3ReviewSections.tsx:1621-1742`), after the `rooms` def and before `packlist`:
```tsx
const dg = d.pr.diagrams;
const diagramCount = arr(dg?.embeddedImages).length + arr(dg?.linkedFolderItems).length;
if (dg != null && (dg.linkedFolder != null || diagramCount > 0)) {
  defs.push({
    id: "diagrams",
    label: "Diagrams",
    group: "Gear",
    Icon: Images, // lucide glyph — design-stage-tunable under impeccable (spec §L)
    railCount:
      diagramCount > 0
        ? (s) => arr(s.pr.diagrams?.embeddedImages).length + arr(s.pr.diagrams?.linkedFolderItems).length
        : null, // folder-link-only → no rail count (spec §B2)
    render: (s) => (
      <DiagramsBreakdown dfid={s.dfid} wizardSessionId={s.wizardSessionId} diagrams={s.pr.diagrams} />
    ),
  });
}
```
    and as the LAST def (after `warnings`):
```tsx
{
  id: "report",
  label: "Report an issue",
  group: "Checks",
  Icon: MessageSquareWarning, // design-stage-tunable (spec §L)
  railCount: null,
  hideDot: true, // spec §D2 — the only section without a status dot
  render: (s) => <ReportIssueSection data={s} />,
},
```
    This task lands MINIMAL interim bodies so each commit is green: `DiagramsBreakdown` renders its `BreakdownSection` shell with header count only (Task 6 fills grid/folder/guards), `ReportIssueSection` renders the shell with the explainer line only (Task 7 fills the form). Both carry `// Task 6/7 (this plan) completes this body` comments; the shells already use the final testids (`-section-diagrams`, `-section-report`) so Task 5's nav tests hold. (`Images`, `MessageSquareWarning` verified present in the installed lucide-react.)
  - `Step3ReviewModal.tsx`: in the rail item (after the railCount span, L689-692) and the chip item (L727-730), wrap the dot span: `{s.hideDot ? null : (<span aria-hidden="true" className={...dotToneClass(s.id)} />)}` with a `{/* §11: instant — deliberate (dot presence follows the static registry definition) */}` marker (transitions-test conditional count +2 — update the curated list in the same commit).
- [ ] **Step 4:** `pnpm test tests/components/admin/wizard/step3ReviewSections.test.tsx tests/components/admin/wizard/Step3ReviewModal.test.tsx tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` → PASS.
- [ ] **Step 5:** commit `feat(admin): diagrams + report section registry entries (hideDot rail contract, counts 12/13/13/14)`

### Task 6: DiagramsBreakdown body (spec §B3, §K8)

**Files:** Modify `components/admin/wizard/step3ReviewSections.tsx`; Extend `tests/components/admin/wizard/step3ReviewSections.test.tsx` (new jsdom describe).

- [ ] **Step 1: failing tests** (render `DiagramsBreakdown` directly with fixture data; ALL queries scoped `within(getByTestId(".. -section-diagrams"))`):
  - **Cap + overflow:** fixture with `DIAGRAM_TILE_CAP + 3` valid stubs (build in a loop — derive every expectation from the array length, never the literal 15) → exactly `DIAGRAM_TILE_CAP` `-diagram-tile-*` tiles + note text `` `+${stubs.length - DIAGRAM_TILE_CAP} more — all images are snapshotted when the show publishes.` `` (catches: unbounded grid blowing up the pane).
  - **Null-contentUrl tile:** stub with `contentUrl: null` renders the placeholder ("Preview unavailable") with NO `<img>` element inside that tile (scoped query — catches: an `<img src>` fetch attempt for an unfetchable stub).
  - **Folder-only:** `linkedFolder` set, zero images → `-diagram-folder-link` anchor with `target="_blank"` + `rel="noopener noreferrer"`, NO grid; with `linkedFolderItems.length = 2` → "2 files" text (derive from fixture).
  - **Hostile folder URL:** `driveFolderUrl: "https://evil.example/drive/folders/x"` → counts text rendered, NO `<a>` in the body (catches: unvalidated href).
  - **http upgrade:** `driveFolderUrl: "http://drive.google.com/drive/folders/f1"` → anchor rendered with href starting `https://drive.google.com/` (the exact-host constraint makes the upgrade safe — spec §B3; `FOLDER_URL_RE` accepts `https?://`, `lib/parser/diagrams.ts:27`).
  - **Malformed-element fixture (spec §K8 verbatim):** `embeddedImages: [null, { objectId: 123 }, { objectId: "x", mimeType: "image/png", contentUrl: null } /* missing sheetTab */, { ...validStub, alt: 7 }, validStub]` → exactly ONE tile, header count renders "(1)", no crash, no `[object Object]`/`undefined` substring anywhere in the container HTML (catches: client-side dereference of corrupt staged JSON incl. the alt-fallback `sheetTab` read).
  - **Alt fallback:** valid stub without `alt` → `img[alt="Diagram from DIAGRAMS"]` (derive from the fixture's `sheetTab`).
  - **Tile URL shape:** first tile's img `src` equals `` `/api/admin/onboarding/staged-diagram/${wizardSessionId}/${dfid}/${encodeURIComponent(stub.objectId)}` `` — derive from the fixture stub, and use an objectId needing encoding is NOT possible (charset is URL-safe) so plain equality is fine.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implementation** (in `step3ReviewSections.tsx`; imports `isRenderableDiagramStub` from `@/lib/admin/stagedDiagramGuards`, `useState` already imported in the file's agenda block):

```tsx
export const DIAGRAM_TILE_CAP = 12;

/** Folder-row href revalidation (spec §B3): parse + exact-host drive.google.com
 *  + https/http only, http upgraded to https. Anything else → no link. */
function trustedDriveFolderHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.hostname !== "drive.google.com") return null;
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.protocol === "http:") url.protocol = "https:";
  return url.toString();
}

/** One thumbnail tile — raw <img> + onError placeholder, mirroring the crew
 *  Gallery pattern (components/diagrams/Gallery.tsx:130-144; raw <img> is a
 *  documented revert — next/image drops cookies). */
function DiagramTile({ src, alt, testId, hasContentUrl }: {
  src: string; alt: string; testId: string; hasContentUrl: boolean;
}) {
  const [failed, setFailed] = useState(!hasContentUrl);
  if (failed) {
    return (
      <span
        data-testid={testId}
        className="grid aspect-[4/3] w-full place-items-center gap-1 rounded-md border border-border bg-surface-sunken text-center"
      >
        <ImageOff aria-hidden="true" className="size-4 text-text-subtle" />
        <span className="text-xs text-text-subtle">Preview unavailable</span>
      </span>
    );
  }
  return (
    <a href={src} target="_blank" rel="noreferrer" data-testid={testId} className="block">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="aspect-[4/3] w-full rounded-md border border-border bg-surface-sunken object-cover"
      />
    </a>
  );
}

export function DiagramsBreakdown({ dfid, wizardSessionId, diagrams }: {
  dfid: string;
  wizardSessionId: string;
  diagrams: ParseResult["diagrams"] | null | undefined;
}) {
  // Element-level guard mirrors the route (§B1): the SAME shared predicate
  // filters before ANY dereference — invalid elements excluded from tiles,
  // counts, and cap math.
  const stubs = arr(diagrams?.embeddedImages).filter(isRenderableDiagramStub);
  const folderItems = arr(diagrams?.linkedFolderItems);
  const folderHref = diagrams?.linkedFolder
    ? trustedDriveFolderHref((diagrams.linkedFolder as { driveFolderUrl?: unknown }).driveFolderUrl)
    : null;
  const hasFolder = diagrams?.linkedFolder != null;
  const shown = stubs.slice(0, DIAGRAM_TILE_CAP);
  const extra = stubs.length - shown.length;
  const summaryParts: string[] = [];
  if (stubs.length > 0) summaryParts.push(`${stubs.length} embedded image${stubs.length === 1 ? "" : "s"}`);
  if (folderItems.length > 0) summaryParts.push(`${folderItems.length} folder file${folderItems.length === 1 ? "" : "s"}`);
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-section-diagrams`}
      label="Diagrams"
      count={stubs.length + folderItems.length}
    >
      {summaryParts.length > 0 ? (
        <p className="text-xs text-text-subtle">{summaryParts.join(" · ")}</p>
      ) : null}
      {shown.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {shown.map((stub, i) => (
            <DiagramTile
              key={`${stub.objectId}-${i}`}
              testId={`wizard-step3-card-${dfid}-diagram-tile-${i}`}
              src={`/api/admin/onboarding/staged-diagram/${wizardSessionId}/${dfid}/${encodeURIComponent(stub.objectId)}`}
              alt={stub.alt ?? `Diagram from ${stub.sheetTab}`}
              hasContentUrl={stub.contentUrl != null}
            />
          ))}
        </div>
      ) : null}
      {extra > 0 ? (
        <p className="text-xs text-text-subtle">
          +{extra} more — all images are snapshotted when the show publishes.
        </p>
      ) : null}
      {hasFolder ? (
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-text">
          {folderHref !== null ? (
            <a
              data-testid={`wizard-step3-card-${dfid}-diagram-folder-link`}
              href={folderHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-tap-min items-center gap-1 font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              Open diagrams folder in Drive <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
          ) : null}
          {folderItems.length > 0 ? (
            <span className="text-text-subtle">{folderItems.length} files</span>
          ) : null}
        </p>
      ) : null}
    </BreakdownSection>
  );
}
```
  (Add `Images`, `ImageOff`, and — Task 5 — `MessageSquareWarning` to the file's lucide import. Guards recap per spec §B3: `pr.diagrams` null → registry gate already excludes the section; all-empty → not rendered; images empty + folder present → folder row only, no grid. Linked-folder items get NO thumbnails — out of scope, spec §M.)
- [ ] **Step 4:** run new + `pnpm test tests/components/step3SheetCard.test.tsx` (card unaffected) → PASS.
- [ ] **Step 5:** commit `feat(admin): diagrams section body (guarded thumbnail grid + revalidated folder link)`

### Task 7: ReportIssueSection + getActiveSection plumbing (spec §D3, §D3a, §K4)

**Files:** Modify `components/admin/wizard/step3ReviewSections.tsx` (chrome context + `ReportIssueSection`), `components/admin/wizard/Step3ReviewModal.tsx` (provider value + activeRef); Create `tests/components/admin/wizard/step3ReportIssueSection.test.tsx`.

- [ ] **Step 1: failing tests** (jsdom; `vi.stubGlobal("fetch", fetchMock)`; sessionStorage cleared in `beforeEach`; render `ReportIssueSection` inside a `Step3SectionChromeContext.Provider` with a controllable `getActiveSection` mock, plus one full-modal integration case). Each test names its failure mode (spec §K4):
  - **Payload shape (assert against the mocked fetch BODY, not the DOM):** fill textarea, submit → exactly one POST to `/api/report`; `JSON.parse(fetchMock.mock.calls[0][1].body)` deep-matches the §D3 payload: `surface: "admin"`, `show_id: null`, `showTitle` = fixture `row.stagedShowTitle` (and the `row.driveFileName` fallback in a second fixture, and `null` when both absent), `showSlug: null`, `message` = trimmed draft, `reporterUrl: window.location.href`, `userAgent: navigator.userAgent`, `parseWarnings` length = `Math.min(fixtureWarnings.length, REPORT_PARSE_WARNINGS_CAP)` with a 55-warning fixture proving the 50 cap (derive from the constant), `fieldRef` = `{ kind: "wizard-step3", driveFileId, wizardSessionId, driveFileName, stagedShowTitle }` from the fixture row, `idempotency_key` a UUID.
  - **viewerVisibleSection follows a pre-submit active change (anti-hardcode):** full-modal case — render `Step3ReviewModal`, click the `crew` rail item (sets shared `active`; jsdom-safe — `handleNavClick` sets state before the `scrollTo` guard), then fill + submit the report form → posted `viewerVisibleSection === "crew"` (a hardcoded `"report"` MUST fail). Provider-level case: swap the mock's return between renders, submit → follows.
  - **Outside the chrome context:** render bare (no provider) → payload OMITS `viewerVisibleSection` (`expect(parsed).not.toHaveProperty("viewerVisibleSection")` — exactOptional discipline).
  - **Key persistence across failed→retry:** first submit responds 500 `{ ok: false }` → status shows `REPORT_GENERIC_ERROR_COPY`... wait, 500-no-code maps to `REPORT_PIPELINE_FAILED` first (assert its dougFacing if non-null, else the generic constant — DERIVE from the catalog import, don't restate); sessionStorage key `"fxav-report-attempt-wizard-" + wizardSessionId + "-" + driveFileId` still holds the minted UUID; second submit reuses the SAME `idempotency_key` (compare the two fetch bodies — catches: key churn making duplicates unlinkable).
  - **Rotation on success:** 201 `{ ok: true, status: "created" }` → status "Sent — thanks. The developer will take a look.", textarea cleared, sessionStorage key REMOVED; a third submit mints a DIFFERENT key. Duplicate/recovered: 200 `{ ok: true, status: "duplicate" }` counts as success (same rotation).
  - **410 horizon:** `{ status: 410, code: "REPORT_HORIZON_EXPIRED" }` → key rotated + status shows that code's dougFacing copy (derive via `messageFor`).
  - **429 rate limit:** `{ status: 429, code: "REPORT_RATE_LIMITED_ADMIN" }` → status text equals `messageFor("REPORT_RATE_LIMITED_ADMIN").dougFacing` (`lib/messages/catalog.ts:1476-1488`) and NEVER contains the literal string `"REPORT_RATE_LIMITED_ADMIN"` (raw-code leak).
  - **dougFacing-null code → generic fallback:** `{ status: 500, code: "ADMIN_SESSION_LOOKUP_FAILED" }` (catalog entry has `dougFacing: null`, `lib/messages/catalog.ts:2213-2215`, reachable via `app/api/report/route.ts:114-124`) → status equals `REPORT_GENERIC_ERROR_COPY`, and `-report-status` textContent is non-empty after trim (empty-status leak — the load-bearing guard).
  - **Network throw:** fetch rejects → copy resolves for `NETWORK_UNREACHABLE` through the same rule.
  - **Disabled states:** submit disabled while draft is empty-after-trim (`"   "`), and while pending (`aria-busy`); status pending text "Sending…"; `role="status"` + `aria-live="polite"` on `-report-status`; label wired via `htmlFor`; `maxLength` attribute equals `REPORT_MESSAGE_MAX_CHARS`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implementation.**
  - `Step3SectionChrome` type gains `getActiveSection?: () => SectionId;` (optional — existing provider mounts stay valid; ABSENT, never `undefined`).
  - `Step3ReviewModal.tsx`: `const activeRef = useRef(active); useEffect(() => { activeRef.current = active; }, [active]);` and `const getActiveSection = useCallback((): SectionId => activeRef.current, []);` — stable identity for a stale-free read at submit time, NOT render optimization (spec §D3a; the provider keeps passing a fresh inline object each render, unchanged). Provider value becomes `{ Icon: s.Icon, label: s.label, flagged: flagged.has(s.id), getActiveSection }`.
  - `ReportIssueSection` in `step3ReviewSections.tsx` (constants exported from this file per §2):
```tsx
export const REPORT_MESSAGE_MAX_CHARS = 2000;
export const REPORT_PARSE_WARNINGS_CAP = 50;
/** Rendered whenever a failure code resolves to no usable dougFacing copy —
 *  the status line is never empty and never a raw code (invariant 5). */
export const REPORT_GENERIC_ERROR_COPY = "Couldn't send the report. Try again in a moment.";

type ReportSectionStatus =
  | { kind: "idle" } | { kind: "pending" } | { kind: "success" }
  | { kind: "error"; copy: string };

function reportAttemptStorageKey(wizardSessionId: string, driveFileId: string): string {
  // Scoped to wizard session AND drive file (spec §D3): a later wizard session
  // for the same file is a DIFFERENT report and must not be swallowed as a
  // duplicate of a stale attempt (mirrors ReportModal's surfaceId-validated
  // reuse, components/shared/ReportModal.tsx:110-133; rotate-on-success :327).
  return `fxav-report-attempt-wizard-${wizardSessionId}-${driveFileId}`;
}

function mintOrReuseAttemptKey(storageKey: string): string {
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const minted = crypto.randomUUID();
    window.sessionStorage.setItem(storageKey, minted);
    return minted;
  } catch {
    return crypto.randomUUID(); // storage unavailable — still send, just unlinkable
  }
}

function rotateAttemptKey(storageKey: string): void {
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    /* storage unavailable — nothing persisted to rotate */
  }
}

/** Single resolution rule for EVERY failure (spec §D3): cataloged dougFacing
 *  if non-null/non-empty after trim, else the exported generic fallback. */
function reportErrorCopy(code: string | null): string {
  if (code !== null && isMessageCode(code)) {
    const copy = messageFor(code as MessageCode).dougFacing;
    if (copy != null && copy.trim().length > 0) return copy;
  }
  return REPORT_GENERIC_ERROR_COPY;
}

export function ReportIssueSection({ data }: { data: SectionData }) {
  const { dfid, wizardSessionId, row, warnings } = data;
  const chrome = useContext(Step3SectionChromeContext);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<ReportSectionStatus>({ kind: "idle" });
  const textareaId = useId();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (message.length === 0 || status.kind === "pending") return;
    setStatus({ kind: "pending" });
    const storageKey = reportAttemptStorageKey(wizardSessionId, dfid);
    const idempotency_key = mintOrReuseAttemptKey(storageKey);
    const payload = {
      surface: "admin",
      show_id: null,
      showTitle: row.stagedShowTitle ?? row.driveFileName ?? null,
      showSlug: null,
      idempotency_key,
      message,
      reporterUrl: window.location.href,
      ...(chrome?.getActiveSection ? { viewerVisibleSection: chrome.getActiveSection() } : {}),
      userAgent: navigator.userAgent,
      parseWarnings: warnings.slice(0, REPORT_PARSE_WARNINGS_CAP),
      fieldRef: {
        kind: "wizard-step3",
        driveFileId: dfid,
        wizardSessionId,
        driveFileName: row.driveFileName ?? null,
        stagedShowTitle: row.stagedShowTitle ?? null,
      },
    };
    try {
      // not-subject-to-meta: internal Next API fetch, not a Supabase client call
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      let parsed: { ok?: boolean; code?: string } = {};
      try {
        parsed = (await res.json()) as typeof parsed;
      } catch {
        parsed = {};
      }
      if (res.ok && parsed.ok === true) {
        // created / duplicate / recovered all count as success (spec §D3).
        rotateAttemptKey(storageKey);
        setDraft("");
        setStatus({ kind: "success" });
        return;
      }
      if (res.status === 410 && parsed.code === "REPORT_HORIZON_EXPIRED") {
        rotateAttemptKey(storageKey); // terminal — a retry is a NEW report
        setStatus({ kind: "error", copy: reportErrorCopy("REPORT_HORIZON_EXPIRED") });
        return;
      }
      const code = parsed.code ?? (res.status >= 500 ? "REPORT_PIPELINE_FAILED" : null);
      setStatus({ kind: "error", copy: reportErrorCopy(code) });
    } catch {
      setStatus({ kind: "error", copy: reportErrorCopy("NETWORK_UNREACHABLE") });
    }
  }

  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-section-report`}
      label="Report an issue"
      count={null}
    >
      <p className="text-sm text-text-subtle">
        Spotted something wrong or missing that the checks above didn&rsquo;t flag? Send it to
        the developer.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label htmlFor={textareaId} className="text-sm font-medium text-text-strong">
          What&rsquo;s wrong or missing?
        </label>
        <textarea
          id={textareaId}
          data-testid={`wizard-step3-card-${dfid}-report-textarea`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={REPORT_MESSAGE_MAX_CHARS}
          rows={3}
          className="w-full rounded-sm border border-border bg-bg p-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            data-testid={`wizard-step3-card-${dfid}-report-submit`}
            disabled={draft.trim().length === 0 || status.kind === "pending"}
            aria-busy={status.kind === "pending" || undefined}
            className="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm bg-accent px-4 text-sm font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            Send report
          </button>
          <span
            data-testid={`wizard-step3-card-${dfid}-report-status`}
            role="status"
            aria-live="polite"
            className={`min-w-0 text-sm ${status.kind === "error" ? "font-medium text-warning-text" : "text-text-subtle"}`}
          >
            {/* §D3 status line — instant text swaps (spec §H N7) */}
            {status.kind === "pending"
              ? "Sending…"
              : status.kind === "success"
                ? "Sent — thanks. The developer will take a look."
                : status.kind === "error"
                  ? status.copy
                  : ""}
          </span>
        </div>
      </form>
    </BreakdownSection>
  );
}
```
    (Add `useContext`/`useId` to the react import if absent; `isMessageCode`/`messageFor`/`MessageCode` are already imported in this file for `reviewWarningTitle`. Modal unmount mid-flight is fire-and-forget by construction — the key persists; a retry after reopen is a duplicate → success, spec §D3 guards. Draft persistence: mount-local only, spec-accepted.)
- [ ] **Step 4:** `pnpm test tests/components/admin/wizard/step3ReportIssueSection.test.tsx tests/components/admin/wizard/Step3ReviewModal.test.tsx` → PASS.
- [ ] **Step 5:** commit `feat(admin): report-an-issue section (idempotent submit, copy-only status) + getActiveSection plumbing`

### Task 8: Footer — Unpublish + demoted gate (spec §C2, §C3, §K3)

**Files:** Modify `components/admin/wizard/Step3ReviewModal.tsx`, `components/admin/wizard/step3ReviewSections.tsx` (shared `NotPublishableNote`), `components/admin/wizard/Step3SheetCard.tsx` (import swap); Extend `tests/components/admin/wizard/Step3ReviewModal.test.tsx`.

- [ ] **Step 1: failing tests.** First `rg -n 'onRequestSetChecked' tests/components/admin/wizard/Step3ReviewModal.test.tsx` — the sibling-plan Task 4 assertion "publish click calls with EXACTLY true in BOTH the unchecked and the checked state" is SUPERSEDED by spec §C2: update its checked-state half; the unchecked-state half stays. New tests — every footer assertion runs `within(getByTestId("…-review-footer"))`, and any copy also rendered by a sibling (none is in the modal-only render, but keep the scoping anyway per the anti-tautology rule):
  - **Checked → Unpublish:** `checked=true` → primary button label "Unpublish", NO Check icon inside it; click → `onRequestSetChecked` called with EXACTLY `false`.
  - **Success stays open:** deferred promise resolves `true` → `onClose` NOT called; button re-enabled (publishState back to idle); rerender with `checked=false` (the card's settlement flips the prop) → slot swaps to "Publish this show" (instant — no animation class change).
  - **Failure path:** resolves `false` → the EXISTING error affordance renders — same element/copy as the publish error path, `Step3ReviewModal.tsx:804-808`: `role="status"` note "Couldn't update the publish selection. Try again." (catches: unpublish wired to `true`, close-on-unpublish).
  - **Pending:** while deferred → label "Removing…", `disabled`, `aria-busy` (rapid double-click guard: second click fires no second `onRequestSetChecked` call).
  - **Demoted gate:** `data.row.lastFinalizeFailureCode = "DRIVE_FETCH_FAILED"` (via `stagedRow(pr, { lastFinalizeFailureCode: ... })`), `isDirtyRescan=false` → footer contains NO `-review-publish` button, DOES contain the NotPublishableNote copy "This sheet needs attention before it can be published." (within footer), AND RescanSheetButton ("Re-scan this sheet") still renders (catches: the pre-existing demoted-footer gap resurfacing).
  - **Branch order:** `lastFinalizeFailureCode = "RESCAN_REVIEW_REQUIRED"` + `isDirtyRescan=true` → the DIRTY branch renders (review-required note + reapply link, unchanged) — dirty takes precedence over demoted (dirty is a demotion subtype, spec §C3).
  - **Unchecked publish path unchanged:** `checked=false` → "Publish this show", click → `onRequestSetChecked(true)`, resolve `true` → `onClose` once.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implementation.**
  - **Extract `NotPublishableNote`** from `Step3SheetCard.tsx:214-224` into `step3ReviewSections.tsx` (the card already imports from that module; the modal does too — no new edge, no cycle). Copy reused VERBATIM; add an optional testId so the card render stays byte-identical while the modal instance is distinguishable:
```tsx
export function NotPublishableNote({ dfid, testId }: { dfid: string; testId?: string }) {
  return (
    <div
      data-testid={testId ?? `wizard-step3-card-${dfid}-not-publishable`}
      className="flex items-start gap-2 rounded-md border border-border-strong bg-warning-bg p-tile-pad text-warning-text"
    >
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p className="text-sm font-medium">This sheet needs attention before it can be published.</p>
    </div>
  );
}
```
    Delete the card-local copy; the card imports it (its call sites pass no `testId` → unchanged output; run the card suites to prove it).
  - **Modal:** derive `const isFinalizeDemoted = data.row.lastFinalizeFailureCode != null;` (no new prop — `Step3Row.lastFinalizeFailureCode`, `Step3Review.tsx:100`; `SectionData.row`, `step3ReviewSections.tsx:1580`). Unpublish handler beside `handlePublish` (L448-461):
```tsx
// Unpublish (spec §C2): request false, stay open on success — the checked
// prop flips via the card's settlement (§9.2 waiter queue, untouched), so
// the slot swaps to "Publish this show" (instant, §H N5).
async function handleUnpublish() {
  setPublishState("pending");
  let ok = false;
  try {
    ok = await onRequestSetChecked(false);
  } catch {
    ok = false;
  }
  if (ok) {
    setPublishState("idle");
    return;
  }
  setPublishState("error"); // same affordance as the publish failure path (L804-808)
}
```
    Footer non-dirty branch (L793-833) becomes three-way — `isDirtyRescan` (L774-792) unchanged and first; then:
```tsx
) : isFinalizeDemoted ? (
  /* §11: instant — deliberate (demoted slot follows server truth; spec §C2) */
  <>
    <div className="min-w-0 flex-1">
      <NotPublishableNote dfid={dfid} testId={`wizard-step3-card-${dfid}-review-not-publishable`} />
    </div>
    <RescanSheetButton driveFileId={dfid} wizardSessionId={wizardSessionId} />
  </>
) : (
  <>
    {/* existing note + error-note + RescanSheetButton stay */}
    {checked ? (
      <button
        type="button"
        data-testid={`wizard-step3-card-${dfid}-review-publish`}
        onClick={handleUnpublish}
        disabled={publishState === "pending"}
        aria-busy={publishState === "pending" || undefined}
        className="inline-flex min-h-tap-min flex-1 items-center justify-center gap-2 rounded-sm border border-border-strong bg-surface px-4 text-sm font-semibold whitespace-nowrap text-text transition-colors duration-fast hover:bg-surface-sunken disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:flex-none"
      >
        {/* quiet/secondary treatment, no Check icon (spec §C2); exact
            weights design-stage-tunable under impeccable */}
        {publishState === "pending" ? "Removing…" : "Unpublish"}
      </button>
    ) : (
      /* the existing accent publish button, labels "Publish this show" /
         "Selecting…" — handlePublish + publishLabel logic unchanged for
         the unchecked state */
    )}
  </>
)
```
    Reuse the SAME `-review-publish` testid for the primary slot in both states (existing tests key on it; the label discriminates). `publishLabel` (L463-468) simplifies to the unchecked pair (`"Selecting…"` / `"Publish this show"`) since the checked branch now owns its labels. The card's sr-only live region (`Step3SheetCard.tsx:523-530`) announces unpublish settlement exactly as the checkbox path — `requestSetChecked` (card L298-321) already handles `next=false`; no new announcement surface. Unpublish while a rescan overlay is visible: independent, both allowed (Task 12 keeps them decoupled).
  - **Transitions audit:** this adds JSX conditionals to the modal — update the curated conditional list/count in `step3ReviewModal.transitions.test.tsx` and add `§11: instant — deliberate` markers on the new demoted/unpublish ternaries in the same commit.
- [ ] **Step 4:** `pnpm test tests/components/admin/wizard tests/components/step3SheetCard.test.tsx tests/components/step3SheetCard.bookends.test.tsx tests/components/step3SheetCard.transitions.test.tsx` → PASS.
- [ ] **Step 5:** commit `feat(admin): footer unpublish + finalize-demoted gate (shared NotPublishableNote)`

### Task 9: Callouts + jump-links + highlight (spec §E3, §E4, §K9)

**Files:** Modify `components/admin/wizard/step3ReviewSections.tsx` (chrome props + callout + `data-warning-index`), `components/admin/wizard/Step3ReviewModal.tsx` (plumbing + jump + highlight), `app/globals.css`; Extend `tests/components/admin/wizard/Step3ReviewModal.test.tsx`.

- [ ] **Step 1: failing tests** (jsdom, fake timers where noted; render the full modal; queries scoped to the section panel / callout testid):
  - **Callout renders for a flagged section, capped:** fixture with `CALLOUT_MAX_ENTRIES + 2` warn-severity `crew`-kind warnings → `-section-crew-flag-callout` exists as the FIRST child inside the crew panel card, shows exactly `CALLOUT_MAX_ENTRIES` title rows + the overflow line `` `+${total - CALLOUT_MAX_ENTRIES} more in Parse warnings` `` (derive both from the fixture length — catches: unbounded callout).
  - **Warnings section renders NO callout:** unmapped warn flags `warnings`; assert `-section-warnings-flag-callout` absent (circular-callout guard).
  - **Titles are hardened:** a fixture warning whose `message` is the token-shaped `"OPENING_REEL_UNREADABLE"` → the callout row (scoped `within(callout)`) shows the generic fallback "A parse issue was recorded for this sheet." and NEVER the raw token (`reviewWarningTitle` transitivity, spec §E3).
  - **Jump:** click a callout row's "View details" → `aria-current` moves to the warnings rail item (within rail); the target `li` (located via `data-warning-index="${index}"`, index derived from the clicked entry) has attribute `data-step3-warning-flash`; after `vi.advanceTimersByTime(WARNING_HIGHLIGHT_MS)` the attribute is GONE (timer hygiene). Assert NO `id` attribute was added anywhere inside either nav or on the li (twin-nav id ban, spec §E4).
  - **One highlight at a time:** jump to index A, then immediately jump to index B → A's attribute removed, only B carries it; unmount mid-highlight → no timer errors after `vi.runAllTimers()` (teardown clears).
  - **"+N more" targets the section top:** click it → `aria-current` moves to warnings; NO `data-step3-warning-flash` anywhere (plain §A2 nav-click semantics).
  - (Stub `scroller.scrollTo` — jsdom lacks it; the jump path shares `handleNavClick`'s guard style.)
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implementation.**
  - `WarningsBreakdown` li (`step3ReviewSections.tsx:1102-1106`) gains `data-warning-index={i}` (same full-array `i` as the `-warning-${i}` testid — the Task-1 index contract).
  - `Step3SectionChrome` gains optional `calloutEntries?: readonly { warning: ParseWarning; index: number }[];` and `onJumpToWarning?: (index: number | null) => void;` (`null` = the "+N more" section-top jump). `ModalSectionChrome` renders the callout as the FIRST child inside the panel card div (before `{children}`); `BreakdownSection` outside the provider renders nothing new (page/test mounts unchanged):
```tsx
export const CALLOUT_MAX_ENTRIES = 3;

function SectionFlagCallout({ dfid, sectionId, entries, onJump }: {
  dfid: string;
  sectionId: SectionId;
  entries: readonly { warning: ParseWarning; index: number }[];
  onJump: (index: number | null) => void;
}) {
  const shown = entries.slice(0, CALLOUT_MAX_ENTRIES);
  const extra = entries.length - shown.length;
  return (
    <div
      data-testid={`wizard-step3-card-${dfid}-section-${sectionId}-flag-callout`}
      className="flex flex-col gap-1 rounded-md border border-border-strong bg-warning-bg px-3 py-2 text-xs text-warning-text"
    >
      {shown.map(({ warning, index }) => {
        const title = reviewWarningTitle(warning); // §8 hardening applies transitively
        return (
          <div key={index} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="min-w-0 wrap-break-word font-medium">{title}</span>
            <button
              type="button"
              onClick={() => onJump(index)}
              className="inline-flex min-h-tap-min items-center font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              View details<span className="sr-only"> for {title}</span>
            </button>
          </div>
        );
      })}
      {extra > 0 ? (
        <button
          type="button"
          onClick={() => onJump(null)}
          className="inline-flex min-h-tap-min items-center self-start font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          +{extra} more in Parse warnings
        </button>
      ) : null}
    </div>
  );
}
```
    In `ModalSectionChrome`, inside the panel-card div, first child: `{chrome.calloutEntries && chrome.calloutEntries.length > 0 && chrome.onJumpToWarning ? (<SectionFlagCallout … entries={chrome.calloutEntries} onJump={chrome.onJumpToWarning} />) : null}` — static with section render, no mount animation (§H N2).
  - **Modal plumbing** (`Step3ReviewModal.tsx`): compute once alongside the existing derivation (L142-145): `const bySection = useMemo(() => warningsBySection(data.warnings, new Set(sections.map((s) => s.id))), [sections, data.warnings]);` (import from `@/lib/admin/step3SectionStatus`). Provider value adds, for every section EXCEPT `warnings`: `...(s.id !== "warnings" && bySection.has(s.id) ? { calloutEntries: bySection.get(s.id)!, onJumpToWarning: jumpToWarning } : {})` (exactOptional discipline — absent, not undefined).
  - **Jump + highlight** (spec §E4; the suppression call becomes real in Task 10 — this task lands `jumpToWarning` calling the plain `handleNavClick`-style scroll, and Task 10 threads `beginSuppressedScroll` through BOTH paths; note the ordering explicitly in the code comment):
```tsx
export const WARNING_HIGHLIGHT_MS = 1600;
const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const highlightedElRef = useRef<HTMLElement | null>(null);

function clearWarningHighlight() {
  if (highlightTimerRef.current !== null) {
    clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = null;
  }
  highlightedElRef.current?.removeAttribute("data-step3-warning-flash");
  highlightedElRef.current = null;
}

function jumpToWarning(index: number | null) {
  if (index === null) {
    handleNavClick("warnings"); // "+N more": plain nav-click semantics, no highlight
    return;
  }
  setActive("warnings");
  const scroller = contentRef.current;
  // Container-scoped attribute query — NO id attributes (twin-nav rule §9.4).
  const target = scroller?.querySelector<HTMLElement>(`[data-warning-index="${index}"]`);
  if (scroller && target && typeof scroller.scrollTo === "function") {
    // Task 10 threads beginSuppressedScroll(scroller, top) through here so a
    // jump engages the same §A2 suppression as a rail click.
    scroller.scrollTo({ top: Math.max(0, sectionTopFor(scroller, target) - 8) });
  }
  clearWarningHighlight(); // one highlight at a time
  if (target) {
    target.setAttribute("data-step3-warning-flash", "");
    highlightedElRef.current = target;
    highlightTimerRef.current = setTimeout(clearWarningHighlight, WARNING_HIGHLIGHT_MS);
  }
}

useEffect(() => clearWarningHighlight, []); // unmount hygiene (§H compound)
```
  - **`app/globals.css`** — append next to the existing `[data-step3-review-*]` block (L620-642); the 1600ms literal must equal `WARNING_HIGHLIGHT_MS` (the transitions test pins the pairing, Task 13):
```css
/* Step-3 review modal: one-shot warning-row highlight after a callout jump
   (spec 2026-07-03 §E4). Motion-safe: background fade over WARNING_HIGHLIGHT_MS
   (1600ms — keep in sync with Step3ReviewModal.tsx). Reduced motion: steady
   tint, removed with the attribute. */
@keyframes step3-warning-flash {
  from {
    background-color: var(--color-warning-bg);
  }
  to {
    background-color: transparent;
  }
}
[data-step3-warning-flash] {
  animation: step3-warning-flash 1600ms ease-out;
}
@media (prefers-reduced-motion: reduce) {
  [data-step3-warning-flash] {
    animation: none;
    background-color: var(--color-warning-bg);
  }
}
```
  - **Transitions audit:** callout conditional lives in `step3ReviewSections.tsx` (outside the modal-source scan); the modal gains no new JSX conditionals here besides the provider spread — verify the curated count still matches; add markers if the scan flags anything.
- [ ] **Step 4:** run the modal + sections + transitions suites → PASS.
- [ ] **Step 5:** commit `feat(admin): per-section flag callouts + warning jump-links with one-shot highlight`

### Task 10: Nav race suppression + sliding indicator (spec §A2, §A3, §A4)

**Files:** Modify `components/admin/wizard/Step3ReviewModal.tsx`, `DESIGN.md`; Extend `tests/components/admin/wizard/Step3ReviewModal.test.tsx` AND `step3ReviewModal.transitions.test.tsx` (T6 → T6′ flip lands HERE — the old "indicator no-slide" pin at its `describe` (line 228) would go red the moment the indicator slides; Task 13 extends the audit further).

- [ ] **Step 1: failing tests.**
  - **Suppression (jsdom, fake timers; stub `requestAnimationFrame` to synchronous, `Object.defineProperty` the content pane's `scrollTop`/`scrollHeight`/`clientHeight`, stub `scrollTo`):**
    - Click a far rail item → `aria-current` on the clicked item immediately; then dispatch `scroll` events with INTERMEDIATE `scrollTop` values → `aria-current` NEVER visits any id other than {pre-click, clicked} (§H N1 — the reported flicker).
    - **Settled release:** set `scrollTop` within `NAV_SCROLL_SETTLE_EPSILON_PX` of the clamped target, dispatch `scroll` → the spy falls through to normal derivation on the SAME frame.
    - **Bottom-clamp release:** target beyond max scroll; set `scrollTop + clientHeight >= scrollHeight - 1`, dispatch → released.
    - **Timeout release:** `vi.advanceTimersByTime(NAV_SCROLL_SETTLE_TIMEOUT_MS)` then a scroll at an unrelated position → spy re-derives (covers zero-event/interrupted glides).
    - **User-input release:** dispatch `wheel` (and separately `touchstart`, `pointerdown`) on the scroller mid-suppression → next scroll re-derives instantly.
    - **Pre-scroll immediate release:** scroller already within epsilon of the target BEFORE `scrollTo` → suppression never engages (no scroll event will fire; a subsequent scroll re-derives).
    - **Replace-not-queue:** second nav click mid-suppression → target replaced, timeout restarted (advance old-timeout-minus-1ms, click, advance again → still suppressed until the NEW timeout).
    - **Unmount:** unmount mid-suppression → no timer leaks (`vi.runAllTimers()` throws nothing); listeners removed.
    - `activeSectionFor` (exported, L85-101) is byte-UNCHANGED — existing pure-rule tests pass unmodified.
  - **Indicator (jsdom with `getBoundingClientRect` stubbed to non-zero geometry per rail button):** exactly ONE indicator element, `aria-hidden="true"`, FIRST child of the rail `<nav>`; per-item conditional spans GONE (no `inset-y-3` span inside any rail item); indicator inline style has `transform: translateY(<y>px)` and `height: <h>px` where `h = btnRect.height − 2·INDICATOR_INSET_PX` (derive from the stubbed rects); after the first measure has painted, the class list contains `transition-[transform,height] duration-fast ease-out-quart motion-reduce:transition-none`; on FIRST mount (before the enable tick) it does NOT (no slide-in from 0). Unmeasurable geometry (rects all 0) → indicator hidden (null render).
  - **T6′ flip (transitions test, replacing the T6 describe at line 228):** the shared indicator carries the transition classes above and is `aria-hidden`; rail/chip BUTTONS still carry only `transition-colors duration-fast` (no transform transitions on items — spec §A4).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implementation.**
  - Constants (exported, beside the existing block at L59-76): `NAV_SCROLL_SETTLE_TIMEOUT_MS = 700`, `NAV_SCROLL_SETTLE_EPSILON_PX = 2`, `INDICATOR_INSET_PX = 12` (matches the retired `inset-y-3`).
  - **Suppression refs + helpers:**
```tsx
const spySuppressedRef = useRef(false);
const spyTargetTopRef = useRef<number | null>(null);
const spySettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

function releaseSpySuppression() {
  spySuppressedRef.current = false;
  spyTargetTopRef.current = null;
  if (spySettleTimerRef.current !== null) {
    clearTimeout(spySettleTimerRef.current);
    spySettleTimerRef.current = null;
  }
}

/** §A2: clamp the target, hold the spy until settle/clamp/timeout/user-input.
 *  Already-at-target → release immediately (no scroll event will fire).
 *  A second call replaces the target and restarts the timeout (no queuing). */
function beginSuppressedScroll(scroller: HTMLElement, targetTop: number): number {
  const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const clamped = Math.min(Math.max(0, targetTop), maxTop);
  if (Math.abs(scroller.scrollTop - clamped) <= NAV_SCROLL_SETTLE_EPSILON_PX) {
    releaseSpySuppression();
    return clamped;
  }
  spySuppressedRef.current = true;
  spyTargetTopRef.current = clamped;
  if (spySettleTimerRef.current !== null) clearTimeout(spySettleTimerRef.current);
  spySettleTimerRef.current = setTimeout(releaseSpySuppression, NAV_SCROLL_SETTLE_TIMEOUT_MS);
  return clamped;
}
```
    `handleNavClick` (L171-177) becomes: `setActive(id)`; guard; `const top = beginSuppressedScroll(scroller, sectionTopFor(scroller, target) - 8); scroller.scrollTo({ top });`. Task 9's `jumpToWarning` threads the same call (replace its plain `scrollTo` line). The clicked id stays `active` for the whole suppressed window on BOTH navs (shared state — no flicker on the chip rail either).
  - **Scroll-spy `evaluate()` (L192-216):** insert before the derivation:
```tsx
if (spySuppressedRef.current) {
  const targetTop = spyTargetTopRef.current;
  const settled =
    targetTop !== null && Math.abs(el.scrollTop - targetTop) <= NAV_SCROLL_SETTLE_EPSILON_PX;
  const bottomClamped = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
  if (settled || bottomClamped) releaseSpySuppression(); // fall through same frame
  else return; // hold active constant (§H N1)
}
```
    In the same effect, add three passive listeners alongside `scroll` (L217): `wheel`, `touchstart`, `pointerdown` → `releaseSpySuppression` (manual interaction cancels the override instantly). Teardown removes all three + clears the settle timer (refs only — unmount safe).
  - **Sliding indicator (desktop rail only):** add `relative` to the rail `<nav>` class (L637); register per-item refs `railItemRefs = useRef(new Map<SectionId, HTMLButtonElement>())` on rail buttons (ref callback set/delete, same idiom as `sectionElsRef`); DELETE the per-item conditional span (L664-669) and its `§11 T6` marker. First child of the nav:
```tsx
{railIndicator !== null ? (
  <span
    aria-hidden="true"
    data-testid={`wizard-step3-card-${dfid}-review-rail-indicator`}
    className={`absolute left-0 top-0 w-1 rounded-r-pill bg-accent ${
      indicatorTransitionsOn
        ? "transition-[transform,height] duration-fast ease-out-quart motion-reduce:transition-none"
        : ""
    }`}
    style={{ transform: `translateY(${railIndicator.y}px)`, height: `${railIndicator.h}px` }}
  />
) : null}
```
    Measurement:
```tsx
const [railIndicator, setRailIndicator] = useState<{ y: number; h: number } | null>(null);
const [indicatorTransitionsOn, setIndicatorTransitionsOn] = useState(false);
const hasMeasuredRef = useRef(false);
const railRef = useRef<HTMLElement | null>(null);

useLayoutEffect(() => {
  const nav = railRef.current;
  const btn = railItemRefs.current.get(active);
  if (!nav || !btn) {
    setRailIndicator(null); // hidden until the next successful measure (§A3 guard)
    return;
  }
  const navRect = nav.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  if (btnRect.height === 0 && navRect.height === 0) {
    setRailIndicator(null); // unmeasurable (jsdom / display:none) → hidden
    return;
  }
  // Container-relative technique, NOT offsetTop (same contract as
  // sectionTopFor, L110-116; parent-spec §6.3a).
  const y = btnRect.top - navRect.top + nav.scrollTop + INDICATOR_INSET_PX;
  const h = btnRect.height - 2 * INDICATOR_INSET_PX;
  setRailIndicator({ y, h });
  if (!hasMeasuredRef.current) {
    hasMeasuredRef.current = true;
    // First paint lands WITHOUT transition classes; enable on the next frame
    // so the indicator never slides in from translateY(0) on mount (§A3).
    const raf = requestAnimationFrame(() => setIndicatorTransitionsOn(true));
    return () => cancelAnimationFrame(raf);
  }
}, [active, sections]);
```
    (`ease-out-quart` is a real utility — `--ease-out-quart` lives in the `@theme` motion block, `app/globals.css:192`. The height transition animates an absolutely-positioned overlay — out of flow, exempt from the §5.4 layout-property ban, per spec §A3. `aria-current` on buttons unchanged, L657 — the indicator is decorative. Mobile chip rail visually unchanged; race fix applies via shared `active`. No chip auto-scroll — out of scope, spec §M.)
  - **DESIGN.md §5.5** — append to the constants list (after the `DRAG_SLOP_PX` line, before the `---`):
```markdown
- `NAV_SCROLL_SETTLE_TIMEOUT_MS = 700` — review-modal nav click / warning jump: fallback release of the scroll-spy suppression when a programmatic glide never settles.
- `NAV_SCROLL_SETTLE_EPSILON_PX = 2` — settle tolerance (px) that releases the nav-click scroll-spy suppression.
- `WARNING_HIGHLIGHT_MS = 1600` — one-shot warning-row highlight duration after a callout jump-link (paired with the `step3-warning-flash` keyframe in `app/globals.css`).
```
  - **Transitions audit:** update the curated conditional list (indicator ternary carries transition classes; deleted per-item span removed from the list); T6 describe rewritten as T6′.
- [ ] **Step 4:** run modal + transitions suites; `pnpm test tests/components/admin/wizard` → PASS.
- [ ] **Step 5:** commit `feat(admin): scroll-spy suppression on nav clicks + sliding rail indicator`

### Task 11: Rooms notes separation (spec §F)

**Files:** Modify `components/admin/wizard/step3ReviewSections.tsx` (`RoomsBreakdown`, L794-814); Extend `tests/components/admin/wizard/step3ReviewSections.test.tsx`.

- [ ] **Step 1: failing tests** (jsdom, render `RoomsBreakdown` with a fixture room carrying ≥2 `ROOM_DETAIL_FIELDS` values):
  - The detail `<ul>` KEEPS testid `wizard-step3-card-${dfid}-room-0-detail` and now sits INSIDE an inset container whose class list contains `rounded-md`, `bg-surface-sunken`, `px-3`, `py-2` (query: `getByTestId(...).closest(".bg-surface-sunken")` non-null — catches: notes still visually merged into the gear grid).
  - An eyebrow element with text "Room notes" precedes the `<ul>` INSIDE that container (scoped `within(container)`).
  - The `<ul>` class list no longer contains `pl-7`; label spans carry `font-medium text-text-strong`, values render in `text-text` (assert on the li's span classes).
  - The gear-scope grid is UNCHANGED: `-room-0-scope` class string byte-equals the current `mt-1.5 flex flex-col gap-1 text-xs text-text-subtle` (pin it — catches: accidental restyle of the sibling grid, L768-793).
  - No side-stripe: no `border-l` class anywhere in the rooms body HTML (absolute ban, spec §F).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implementation** — replace the detail-list return (L802-813) with:
```tsx
return detail.length > 0 ? (
  <div className="mt-2 rounded-md bg-surface-sunken px-3 py-2">
    <p className={EYEBROW_CLASS} style={EYEBROW_STYLE}>
      Room notes
    </p>
    <ul
      data-testid={`wizard-step3-card-${dfid}-room-${i}-detail`}
      className="mt-1 flex flex-col gap-0.5 text-xs text-text"
    >
      {detail.map((d) => (
        <li key={d.label} className="wrap-break-word">
          <span className="font-medium text-text-strong">{d.label}:</span> {d.value}
        </li>
      ))}
    </ul>
  </div>
) : null;
```
    (`rounded-md` per the Global-Constraints token-fidelity note; AA contrast holds — `text-text`/`text-text-strong` on `bg-surface-sunken` are existing paired tokens. Exact spacing/weights tunable at design stage under impeccable within these constraints, spec §F.)
- [ ] **Step 4:** run sections suite + the three `step3SheetCard*` suites (they pin `-room-${i}-detail` presence) → PASS.
- [ ] **Step 5:** commit `feat(admin): rooms notes inset separation (Room notes eyebrow, no side-stripe)`

### Task 12: Rescan result overlay (spec §G)

**Files:** Modify `components/admin/RescanSheetButton.tsx`, `components/admin/wizard/Step3ReviewModal.tsx` (footer call site L809 + the Task-8 demoted branch's instance), `app/globals.css`; Extend `tests/components/admin/RescanSheetButton.test.tsx` and `Step3ReviewModal.test.tsx`.

- [ ] **Step 1: failing tests** (extend `tests/components/admin/RescanSheetButton.test.tsx` — it already mocks `next/navigation` + fetch and clicks through result branches):
  - **Default byte-parity:** render with NO `resultPlacement`, drive a result → the result element's `className` byte-equals the CURRENT stacked strings (pin both branches: coded `flex flex-col gap-1 rounded-sm border border-border-strong bg-warning-bg p-3 text-sm text-warning-text` and info `rounded-sm border border-border bg-info-bg px-3 py-2 text-sm text-text-strong`, `RescanSheetButton.tsx:133-137`), NO dismiss button, root wrapper class stays `flex flex-col gap-2` (catches: the two card call sites, `Step3SheetCard.tsx:347,555`, drifting — they pass no prop and must stay byte-identical).
  - **Overlay placement:** `resultPlacement="overlay"` → root wrapper class contains `relative`; the result element keeps `role="status"` + `aria-live="polite"` + its tone classes AND additionally `absolute bottom-full right-0 mb-2 z-10 w-max max-w-[min(20rem,80vw)]` + `shadow-(--shadow-tile)` + the `data-rescan-overlay-result` animation hook (catches: result back in flow → footer growth).
  - **Dismiss:** overlay result shows a button `aria-label="Dismiss"`; click → result removed (instant exit); the dismiss button has a ≥44px class (`size-tap-min`).
  - **Modal footer passes overlay:** in `Step3ReviewModal.test.tsx`, drive a rescan result inside the modal → the result element within the footer carries `data-rescan-overlay-result` (catches: footer call site left stacked).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implementation.**
  - `RescanSheetButtonProps` gains `resultPlacement?: "stacked" | "overlay";` with `const placement = resultPlacement ?? "stacked";`. Root div: `className={placement === "overlay" ? "relative flex flex-col gap-2" : "flex flex-col gap-2"}`. Result block (L128-142): keep the existing tone classes; when overlay, append `absolute bottom-full right-0 mb-2 z-10 w-max max-w-[min(20rem,80vw)] shadow-(--shadow-tile)` and set `data-rescan-overlay-result=""`; add inside it (overlay only):
```tsx
{placement === "overlay" ? (
  <button
    type="button"
    aria-label="Dismiss"
    onClick={() => setResult(null)}
    className="absolute -right-2 -top-2 inline-flex size-tap-min items-center justify-center rounded-pill text-text-subtle hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
  >
    <X aria-hidden="true" className="size-4" />
  </button>
) : null}
```
    (import `X` from lucide-react; adjust padding so copy doesn't underlap the button — design-stage-tunable). Stacked behavior unchanged: persists until the next click (L94 `setResult(null)` on click), no dismiss, no auto-dismiss anywhere (it's a status message).
  - `app/globals.css` — beside the Task-9 block; reuses the EXISTING `step3-details-pop-in` keyframes (L632-635) at `--duration-fast`, reduced-motion → none (spec §G "fast pop-in reusing the existing --duration-fast pattern"):
```css
[data-rescan-overlay-result] {
  animation: step3-details-pop-in var(--duration-fast) var(--ease-out-quart);
}
@media (prefers-reduced-motion: reduce) {
  [data-rescan-overlay-result] {
    animation: none;
  }
}
```
  - Modal footer (L809 and the Task-8 demoted branch): `<RescanSheetButton driveFileId={dfid} wizardSessionId={wizardSessionId} resultPlacement="overlay" />`. Mode boundaries: identical markup in sheet/popup/two-pane; `max-w-[min(20rem,80vw)]` keeps phones inside the viewport (spec §G).
  - Transitions audit: the dismiss-button conditional lives in `RescanSheetButton.tsx` (outside the modal scan); the overlay result carries the animation attribute — no modal-source count change expected; verify.
- [ ] **Step 4:** run RescanSheetButton + modal suites → PASS.
- [ ] **Step 5:** commit `feat(admin): rescan result overlay placement (constant footer height, dismissible)`

### Task 13: Transition audit — dedicated (spec §H, §K10)

**Files:** Extend `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx`.

The FULL spec §H inventory this task pins (verbatim — every row gets an explicit assertion or a documented "instant — deliberate" source-marker check):

| # | Transition | Treatment |
|---|---|---|
| T6′ | Rail indicator item→item (any pair) | slides — `transform`+`height`, `--duration-fast` `--ease-out-quart`; `motion-reduce`: instant. REPLACES T6's "no-slide" pin. First mount: positioned without transition. |
| N1 | `active` during suppressed programmatic scroll | held constant (no intermediate values) — behavioral, tested |
| N2 | Callout presence | static with section render — no mount animation |
| N3 | Warning highlight | one-shot background fade, `WARNING_HIGHLIGHT_MS`; reduced-motion: steady tint, removed with attribute |
| N4 | Rescan overlay result appear / disappear | fast pop-in (`--duration-fast`) / instant; reduced-motion: none |
| N5 | Publish ↔ Unpublish ↔ Removing… ↔ NotPublishable slot swaps | instant (matches existing footer-swap rows) |
| N6 | Diagram tile img load / error→placeholder | browser default / instant |
| N7 | Report status idle→pending→success/error | instant text swaps in aria-live region |

Compound transitions (spec §H): jump-link clicked during an in-flight nav glide → suppression target replaced, timer restarted (§A2); drag-dismiss or unmount during highlight/suppression → timers cleared in effect teardown; unpublish resolves while rescan overlay is open → independent (footer slot swaps under the overlay); report pending while modal closed → fire-and-forget with persisted idempotency key (§D3); checked flips (external settlement) while suppressed scroll in flight → footer swap is instant and does not touch nav state.

- [ ] **Step 1: failing/extending tests.**
  - **Source-marker audit refresh:** re-enumerate EVERY `AnimatePresence` (none — this codebase uses CSS hooks), ternary render, and `&&`/`? :` conditional in `Step3ReviewModal.tsx` after Tasks 5–12; update the curated list + total count; assert each site carries an animation/transition class or the `§11: instant — deliberate` marker (new sites: hideDot dots ×2, indicator ternary, demoted branch, unpublish/publish ternary, error note [existing]).
  - **T6′** (landed in Task 10 — re-assert here as the table row): indicator classes + `aria-hidden`; buttons `transition-colors duration-fast` only.
  - **N1:** behavioral suppression test exists (Task 10) — add the table-row assertion referencing it (one aria-current sampling case in THIS file so the audit is self-contained).
  - **N2:** callout root has NO animation/transition class in its className (static with render).
  - **N3:** `GLOBALS_CSS` (the file already reads it) contains the `step3-warning-flash` keyframe, an `animation: step3-warning-flash 1600ms` rule, a `prefers-reduced-motion` override with `animation: none` + steady `background-color`; AND `MODAL_SRC` contains `WARNING_HIGHLIGHT_MS = 1600` (drift-guard pairing, same pattern as `DURATION_NORMAL_FALLBACK_MS`).
  - **N4:** `GLOBALS_CSS` contains `[data-rescan-overlay-result]` with `var(--duration-fast)` + a reduced-motion `animation: none` override; the rendered overlay result element carries the attribute; dismissal removes the node synchronously (instant exit — assert removal within the same `act`).
  - **N5:** render checked → rerender unchecked → footer label swaps with no animation class change on the button; demoted rerender swaps to NotPublishableNote instantly (no transition classes on the note).
  - **N6:** fire `error` on a tile `<img>` → placeholder replaces it synchronously; neither carries animation classes.
  - **N7:** drive report status idle→pending→error → text swaps in the same `role="status"` element, no animation classes.
  - **Compounds (jsdom-feasible):** (a) nav click, then jump-link mid-suppression → `spySettleTimer` restarted (advance old remainder → still suppressed; advance new full timeout → released) and only the LAST target releases on settle; (b) unmount during active highlight + active suppression → `vi.runAllTimers()` fires nothing, no attribute-removal errors; (c) rerender `checked` flip while suppressed → footer label swaps AND suppression state unaffected (next intermediate scroll still held).
- [ ] **Step 2–4:** run → fix any missing markers/classes → PASS (`pnpm test tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx`).
- [ ] **Step 5:** commit `test(admin): transition audit for step-3 modal follow-ups (§H inventory + compounds)`

### Task 14: Real-browser e2e — layout + interactions (spec §I, §K11–§K15)

**Files:** Modify `tests/e2e/_step3ReviewModalHarness.tsx`, `tests/e2e/_step3ReviewModalLiveEntry.tsx`; Extend `tests/e2e/step3-review-modal.layout.spec.ts`, `tests/e2e/step3-review-modal.interactions.spec.ts`. (No `standalone.config.ts` change — both specs already match its `testMatch`.)

**Babel-JSX trap (read the harness headers first):** Playwright's transform rewrites JSX in every spec-imported `.tsx` — specs must NOT import the harness/component. The layout spec shells out to `node_modules/.bin/tsx` running `_step3ReviewModalHarness.tsx` (static markup JSON); the interactions spec bundles `_step3ReviewModalLiveEntry.tsx` via `pnpm dlx esbuild@0.28.0 --bundle --format=iife --jsx=automatic`; CSS compiles via `pnpm dlx @tailwindcss/cli@4.2.4` with `@source` pointing at the rendered harness HTML (`step3-review-modal.layout.spec.ts:123-135`). The harness stubs `AppRouterContext`.

**Dimensional invariants (spec §I, verbatim — the real-browser contract of this task):**
- Modal footer height with `resultPlacement="overlay"`: `footer.getBoundingClientRect().height` identical (±0.5px) before and after a rescan result renders (real-browser assertion; jsdom insufficient).
- Diagram grid: tiles never overflow the detail pane (no horizontal scroll in the scroller: `scroller.scrollWidth <= scroller.clientWidth`); tile aspect enforced by `aspect-[4/3]`.
- Rail indicator: `height = activeButton.height − 2·INDICATOR_INSET_PX`, `y` aligns to the active button (±0.5px) after any nav click settles.

- [ ] **Step 1: harness updates.**
  - `_step3ReviewModalHarness.tsx` `buildSectionData`: default fixture gains (a) a diagrams object with `DIAGRAM_TILE_CAP + 3` valid stubs, ALL `contentUrl: null` (placeholder tiles — zero network, deterministic geometry, exercises the grid past the cap for §K15) + a `linkedFolder` with an `https://drive.google.com/...` URL, and (b) ≥1 warn-severity `crew`-kind warning + `CALLOUT_MAX_ENTRIES + 1` more so a callout with a "View details" row AND an overflow row render (§K13). Duplicate the tile-count constant locally with a comment (the harness may import component constants — it is itself tsx-subprocess/esbuild-compiled, never spec-imported).
  - `_step3ReviewModalLiveEntry.tsx`: add a `window.fetch` stub INTERCEPTING ONLY `/api/admin/onboarding/rescan-sheet` → 200 `{ ok: true, status: "updated", needsReview: false, changed: true }` (deterministic overlay result; everything else passes through/throws loudly).
- [ ] **Step 2: extend `step3-review-modal.layout.spec.ts` (static):**
  - **§K15 diagrams grid:** at 390 / 800 / 1280 — `scroller.scrollWidth <= scroller.clientWidth` (scoped to `-review-content`) with the > cap fixture; every visible `-diagram-tile-*` width ≤ content width; tile count on screen = `DIAGRAM_TILE_CAP` (derive: fixture length is cap+3, note text says "+3 more").
  - Existing per-section width invariant now sweeps the two NEW sections automatically (`-review-section-diagrams`, `-review-section-report`) — confirm no assertion exemptions needed; tap-target audit adds the report submit button + a callout "View details" button + the folder link (≥44px height each).
- [ ] **Step 3: extend `step3-review-modal.interactions.spec.ts` (live):**
  - **§K11 nav race (frame-sampled):** in a NEW `test.describe` WITHOUT the file's `prefers-reduced-motion: reduce` emulation (reduced motion collapses `motion-safe:scroll-smooth` — the glide, and therefore the race, only exists with motion enabled). At 1280: record pre-click `aria-current` id; click the LAST rail item; `page.evaluate` a rAF loop collecting the aria-current id each frame until `scrollTop` is stable across 5 frames (cap ~2s); assert the observed id set ⊆ {pre-click id, clicked id} (catches: the reported flicker). Then: click a far item and dispatch a `wheel` event mid-glide → within a few frames aria-current changes to a scroll-derived id ≠ the clicked id (spy resumes on user input).
  - **§K12 indicator:** same non-reduced describe — after click + settle, `indicator.getBoundingClientRect()`: `height === activeButton.height − 2·INDICATOR_INSET_PX` (±0.5) and `top === activeButton.top + INDICATOR_INSET_PX` (±0.5) (the §I alignment restated in viewport coordinates); `getComputedStyle(indicator).transitionProperty` contains `transform` (catches: transition classes stripped or mis-scoped).
  - **§K13 jump + highlight lifecycle:** click a callout "View details" → the target `li[data-warning-index]` rect lies within the scroller's viewport rect; attribute `data-step3-warning-flash` present; poll until gone within `WARNING_HIGHLIGHT_MS + 1000` slack (catches: timer never firing / wrong target).
  - **§K14 footer no-shift:** measure `footer.getBoundingClientRect().height`; click "Re-scan this sheet" (the live-entry fetch stub answers); await the overlay result visible (`[data-rescan-overlay-result]`); re-measure → equal ±0.5px; overlay's rect bottom ≤ footer rect top (it floats ABOVE, out of flow); click `aria-label="Dismiss"` → overlay gone.
  - Duplicate the needed constants as spec-literals in the spec file (`INDICATOR_INSET_PX = 12`, `WARNING_HIGHLIGHT_MS = 1600`, `DIAGRAM_TILE_CAP = 12`) with the file's existing "deliberately NOT imported — the SPEC is the source of truth" comment pattern.
- [ ] **Step 4:** `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/step3-review-modal.layout.spec.ts tests/e2e/step3-review-modal.interactions.spec.ts` → iterate to PASS.
- [ ] **Step 5:** commit `test(admin): real-browser gates — nav race, indicator alignment, jump highlight, overlay no-shift, diagrams grid`

### Task 15: Full-suite gate + hygiene

- [ ] **Step 1:** `pnpm test` (FULL unit suite) + both standalone e2e specs + `pnpm typecheck` + `pnpm lint`. Expected fallout classes to fix (commit as `fix(admin)/fix(report): …`):
  - **exactOptionalPropertyTypes shape breaks:** `RequestBody.show_id` widening and `Step3SectionDef.hideDot`/`Step3SectionChrome.getActiveSection` additions can break exact `toEqual` fixtures elsewhere — the repo treats `?:` as ABSENT, not `undefined`: never write `field: undefined`, use conditional spreads (run the full suite, not just touched files — see `feedback_optional_field_exactoptional_and_shape_sweep`).
  - **`_metaInfraContract` catch-window / registry flags:** if the reports meta-test or auth meta-test flags the edited `submit.ts` regions, add `// not-subject-to-meta: <reason>` inline comments per the Meta-test inventory above.
  - **vitest-passes/typecheck-fails:** `pnpm typecheck` is mandatory before push (vitest strips types; `tx.unsafe` is `unknown[]`).
- [ ] **Step 2: grep sweeps (all must be clean):**
  - `rg -n ' id=' components/admin/wizard/Step3ReviewModal.tsx` → no `id` attributes inside either nav (the existing no-duplicate-id sweep re-verifies at runtime; `useId` on the h2 is outside the navs).
  - `rg -n 'border-l-2|border-l-4|border-l ' components/admin/wizard/step3ReviewSections.tsx components/admin/wizard/Step3ReviewModal.tsx` → empty (side-stripe ban).
  - `rg -n 'rounded-card' components/ app/` → empty (token-fidelity note — the class doesn't exist).
  - 44px tap targets: every NEW interactive element carries `min-h-tap-min`/`size-tap-min` (`rg -n '<button|<a ' components/admin/wizard/step3ReviewSections.tsx` and eyeball the Task 6/7/9 additions; the e2e tap audit is the enforcement).
  - `rg -n 'toLowerCase\(\)|trim\(\)' lib/drive lib/sync` diff vs main → no additions.
  - `pnpm test:audit:x1-catalog-parity` unaffected (zero catalog edits).
- [ ] **Step 3: format:** `pnpm format:check`; `prettier --write` any offenders (NEVER the master spec) — `--no-verify` commits skipped the hook.
- [ ] **Step 4: impeccable dual gate (invariant 8):** `/impeccable critique` AND `/impeccable audit` on the affected UI diff (`components/admin/wizard/*`, `components/admin/RescanSheetButton.tsx`, `app/globals.css`, `DESIGN.md`) with canonical v3 preflight gates; HIGH/CRITICAL findings fixed or DEFERRED.md-logged. Record findings + dispositions in this plan dir (`impeccable.md`). This runs BEFORE cross-model review.
- [ ] **Step 5:** commit any gate fixes (`fix(admin): impeccable dispositions — step3 modal follow-ups`).

---

## Self-review (writing-plans checklist — run inline before adversarial review)

- **Pre-draft code-verification pass: DONE.** Every named API verified against the live worktree before drafting: unapprove deps/`queryOne` (`unapprove/route.ts:22-32`, test-injection at `wizard-unapprove-route.test.ts:226-250`); `defaultSql` pool pattern (`extract-agenda/.../route.ts:90-97`); `snapshotFetchEmbeddedImageBytesTimed(entry, deps)` → `Promise<SnapshotAssetBytes | null>` (`defaultSnapshotAssetsForApply.ts:39-47`); `SnapshotAssetBytes = Uint8Array | BoundedByteResult` (`snapshotAssets.ts:30`; `boundedBytes.ts:11-15`); `requireAdminIdentity` at `lib/auth/requireAdmin.ts:279`; report route validation (`route.ts:32-40`), call sites (`submit.ts:1035,1039`), formatters (`submit.ts:263-283,361-393,437-469,471-484`); `handleTailUpdateMiss` show_id arg (`submit.ts:1056-1063`); ReportModal mint/rotate precedent (`ReportModal.tsx:110-139,327`); registry shape + `SectionData` (`step3ReviewSections.tsx:1577-1742`), chrome context (`:242-250`), rooms detail (`:794-814`), warnings li (`:1102-1106`), `reviewWarningTitle` (`:1044-1058`); modal internals (`Step3ReviewModal.tsx:59-76,85-116,171-223,441-468,637-699,741,769-834`); `Step3Row.stagedShowTitle/lastFinalizeFailureCode` (`Step3Review.tsx:78-100`); RescanSheetButton result block (`:128-142`); registry-math tests (`step3ReviewSections.test.tsx:225-287`); transitions-test structure incl. the curated-count audit; e2e harness/spec mechanics (tsx subprocess, esbuild dlx, tailwind dlx, reduced-motion caveat); catalog rows (`REPORT_RATE_LIMITED_ADMIN:1476`, `ADMIN_SESSION_LOOKUP_FAILED dougFacing:null:2213`, `NETWORK_UNREACHABLE:1686`, `REPORT_HORIZON_EXPIRED:2479`); lucide `Images`/`ImageOff`/`MessageSquareWarning` present; package.json scripts (`typecheck`, `format:check`, `test`); standalone config testMatch already covers both specs. **One live-token deviation found and resolved explicitly:** spec's `rounded-card` has no token (`--radius-*` = sm/md/lg/pill) → mapped to `rounded-md` (documented in Global Constraints; flag for the adversarial reviewer rather than silently ignoring).
- **Spec coverage sweep:** §A1-A4 → T10, T13(T6′/N1), T14(K11/K12); §B0-B1 → T2, T3; §B2 → T5; §B3 → T6, T14(K15); §C1-C3 → T8, T14 tap audit; §D1-D3a → T7; §D4 → T4; §E2 → T1; §E3-E4 → T9, T13(N2/N3), T14(K13); §F → T11; §G → T12, T13(N4), T14(K14); §H → T13 (full table verbatim + compounds); §I → T14 (verbatim list); §J → tap-target sweeps T14/T15, aria assertions T7/T8/T9/T12; §K1-K15 → mapped 1:1 to Tasks 1,5,8,7,4,4,3,6,9,13,14,14,14,14,14; §L → design-stage notes in T5/T6/T8/T11; §M honored (no chip auto-scroll, no lightbox, no draft persistence); §N do-not-relitigate contracts untouched (settlement §9.2, twin-nav rules, motion-safe CSS scroll, raw `<img>`, fail-soft helper posture, 10/hour quota, no new codes).
- **Numeric sweep (spec §O anchor):** 700 / 2 / 12(inset) / 12(cap) / 3 / 2000 / 50 / 1600 / 300 / 256 appear in this plan only via the §2 constants table + named references; registry counts 12/13/13/14; quota 10/hour cited not chosen.
- **Layout-dimensions task present:** T14, real browser, spec §I list verbatim, ±0.5px, `getBoundingClientRect` on documented testids (jsdom explicitly declared insufficient).
- **Transition-audit task present:** T13, full §H table verbatim, every conditional classified, compounds tested; plus the standing curated-count rule threaded through Tasks 5/8/9/10/12.
- **Anti-tautology:** encoded per task (scoped queries, fixture-derived expectations, named failure modes from §K).
- **Meta-test inventory:** declared above (N/A-with-reasons + extends-only).
- **Advisory-lock topology:** N/A declared (read-only route; zero `pg_advisory*` in diff).
- **Interim-state honesty:** Task 5 lands registry defs with minimal shell bodies completed by Tasks 6/7 — each commit is green and the staging is documented in the task body (not a hidden placeholder).

## Adversarial review (cross-model) — MANDATORY before execution handoff

- [ ] Invoke the `adversarial-review` skill on THIS plan (Codex reviews; fresh-eyes; REVIEWER ONLY — reviewer never fixes). Iterate to APPROVE with no round budget (autonomous-ship pipeline). Class-sweep every finding before patching the named instance. Pre-load the reviewer with the do-not-relitigate list (spec §N) plus: the `rounded-card`→`rounded-md` token-fidelity mapping (verified against `app/globals.css:181-184`), the Task-5 shell-body staging, and the spec-verbatim em-dash copy (spec canonical over DESIGN.md, invariant 7).

## Execution handoff

Subagent-driven (superpowers:subagent-driven-development), one task per subagent dispatch, in order 1→15 (Tasks 1–4 are mutually independent and may run in parallel worktree-free since they touch disjoint files; Tasks 5+ are sequential on `step3ReviewSections.tsx`/`Step3ReviewModal.tsx`). Every dispatch includes: the task body verbatim, the Global Constraints block, the transitions-test curated-count rule, and output rules ("Final response under 2000 characters. List outcomes, not process."). All UI tasks are Opus-owned. After Task 15: whole-diff Codex adversarial review (fresh-eyes, REVIEWER ONLY) → APPROVE; push; PR; real CI green (`gh pr checks <PR#> --watch`, `mergeStateStatus == CLEAN`); `gh pr merge --merge`; fast-forward local main (`git rev-list --left-right --count main...origin/main` → `0 0`).
