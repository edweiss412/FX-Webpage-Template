# Finalize Blocker Row Show-Title Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Label every publish-blocker row by the parsed show title instead of the opaque `drive_file_id`.

**Architecture:** A defensive `parsedShowTitle(unknown): string | null` helper derives the title (decoding legacy double-encoded `parse_result`, never throwing). Each route attaches an optional `display_name` to its per-row failure entries at the **single** point it collects them into the response (`perRow.push` / the `shadowResults` loop) — never per-return, so a new failure branch is covered by construction. Three components render `display_name ?? drive_file_id`, dropping the id from the visible label while keeping it as the React key / reapply test-id / `RescanSheetButton` prop.

**Tech Stack:** Next.js 16 API routes, postgres.js, React 19, Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-29-finalize-blocker-show-title.md` (Codex-approved, 2 rounds).

## Global Constraints

- **No new §12.4 message code, no migration, no new route, no advisory-lock change.** `display_name` is data, not a code (invariant 5 unaffected — it carries a human title or the id, never a code).
- **Single choke point per route.** `display_name` is set ONLY at `finalize/route.ts:1068` (`perRow.push`) and the `finalize-cas/route.ts:710-717` `shadowResults` loop — never at an individual failure `return`.
- **The helper never throws.** It runs on the failure path; corrupt/legacy/empty input collapses to `null`.
- **Drop the id from DISPLAY only.** React `key`s, `data-testid={…-reapply-${…drive_file_id}}`, and `RescanSheetButton driveFileId` are unchanged.
- **TDD per task; commit per task** (`<type>(<scope>): <summary>`, `--no-verify` in this worktree).
- **UI is Opus + invariant 8:** `/impeccable critique` + `/impeccable audit` on the three component diffs before cross-model review (Task 5).

## Meta-test inventory

**None created or extended.** This change adds no §12.4 code (no `_metaAdminAlertCatalog`/codes-parity), no Supabase call boundary (no `_metaInfraContract`), no advisory lock (no `advisoryLockRpcDeadlock`), no new RPC-gated table (no PostgREST-DML lockdown), no tile sentinel (no `_metaSentinelHiding`). It adds a data field + a render swap. Declared explicitly per the writing-plans meta-test-inventory rule.

## Advisory-lock topology

N/A — no `pg_advisory*` surface is touched. The `finalize-cas` `shadowResults` loop already runs inside the route's existing lock order; this change adds no lock acquisition.

## File Structure

- Create: `lib/onboarding/blockerDisplayName.ts` — the `parsedShowTitle` helper (one responsibility: derive a show title or null).
- Modify: `app/api/admin/onboarding/finalize-cas/route.ts` — `ShadowApplyResult` failure variant + `shadowResults` loop enrichment + `syntheticFileMeta` reuse.
- Modify: `app/api/admin/onboarding/finalize/route.ts` — `PerRowResult` failure variant + `perRow.push` enrichment + import.
- Modify: `components/admin/FinalizeButton.tsx`, `components/admin/RunFinalCASButton.tsx`, `components/admin/ResumeFinalizeButton.tsx` — per-row entry type + render swap.
- Update: `DEFERRED.md` — mark RESCAN-1 resolved.

---

### Task 1: `parsedShowTitle` helper

**Files:**
- Create: `lib/onboarding/blockerDisplayName.ts`
- Test: `tests/onboarding/blockerDisplayName.test.ts`

**Interfaces:**
- Produces: `parsedShowTitle(pr: ParseResult | unknown): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// tests/onboarding/blockerDisplayName.test.ts
import { describe, it, expect } from "vitest";
import { parsedShowTitle } from "@/lib/onboarding/blockerDisplayName";

describe("parsedShowTitle", () => {
  it("returns the title for a real ParseResult-shaped object", () => {
    expect(parsedShowTitle({ show: { title: "Consultants Roundtable" } })).toBe(
      "Consultants Roundtable",
    );
  });

  it("decodes a legacy double-encoded JSON string and returns the title", () => {
    const encoded = JSON.stringify({ show: { title: "East Coast 2025" } });
    expect(parsedShowTitle(encoded)).toBe("East Coast 2025");
  });

  it.each([
    ["missing show", { crew: [] }],
    ["empty show", { show: {} }],
    ["empty-string title", { show: { title: "" } }],
    ["whitespace title", { show: { title: "   " } }],
    ["non-string title", { show: { title: 42 } }],
    ["non-JSON string", "1N1PKmhcvLAn"],
    ["null", null],
    ["undefined", undefined],
  ])("returns null and does not throw for %s", (_label, input) => {
    expect(() => parsedShowTitle(input)).not.toThrow();
    expect(parsedShowTitle(input)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/onboarding/blockerDisplayName.test.ts`
Expected: FAIL — cannot resolve `@/lib/onboarding/blockerDisplayName`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/onboarding/blockerDisplayName.ts
import type { ParseResult } from "@/lib/parser/types";

/**
 * The show title for a per-row blocker label, or null when none is derivable.
 *
 * Runs on the FAILURE path, where a row may carry a corrupt / legacy / double-
 * encoded `parse_result` jsonb — so it accepts `unknown` and NEVER throws: it
 * decodes a JSON-string shape (asParseResult, lib/db/coerceJsonbObject.ts:133,
 * decodes the same legacy double-encoding) and otherwise degrades to null.
 * Empty / whitespace titles collapse to null so they never reach the wire.
 */
export function parsedShowTitle(pr: ParseResult | unknown): string | null {
  let obj: unknown = pr;
  if (typeof obj === "string") {
    try {
      obj = JSON.parse(obj);
    } catch {
      return null;
    }
  }
  const title = (obj as { show?: { title?: unknown } } | null | undefined)?.show?.title;
  return typeof title === "string" && title.trim() !== "" ? title : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/onboarding/blockerDisplayName.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/onboarding/blockerDisplayName.ts tests/onboarding/blockerDisplayName.test.ts
git commit --no-verify -m "feat(onboarding): parsedShowTitle helper for blocker-row labels"
```

---

### Task 2: finalize-cas (Phase D) per-row `display_name`

**Files:**
- Modify: `app/api/admin/onboarding/finalize-cas/route.ts` (`ShadowApplyResult` L63-69, `shadowResults` loop L710-717, `syntheticFileMeta` L334)
- Test: `tests/onboarding/finalizeCasFullApply.db.test.ts` (extend existing blocked-row assertions)

**Interfaces:**
- Consumes: `parsedShowTitle` (Task 1); `parseShadowPayloadForApply` (already imported, `finalize-cas/route.ts:6`).
- Produces: `per_row[i].display_name?: string` on blocked Phase-D rows.

- [ ] **Step 1: Write the failing test** — extend the existing test `"(b) equality preflight REPLACES the <= gate"` in `finalizeCasFullApply.db.test.ts` (~L386-410). It already drives a 409 where `rows[0]` is the blocked `drive-cas-2` row and asserts `rows[0]!.code).toBe("STAGED_PARSE_OUTDATED_AT_PHASE_D")` (L408). This is a **parse-OK** blocker (its shadow payload `makeParse("Cas Two", …)` parses cleanly — unlike `drive-cas-3`, which is `STAGED_REVIEW_ITEMS_CORRUPT` and would correctly **omit** the `display_name` property — see the parse-failure assertion below). The shadow payload's `show.title` is the FIRST arg to `makeParse` (= `"Cas Two"`, NOT the `seedLiveShow` title `"Cas Two Live"`). Hoist that title to a `const CAS2_SHADOW_TITLE = "Cas Two"` used both in the `makeParse(CAS2_SHADOW_TITLE, …)` call and the assertion. Add `display_name?: string` to the `PerRow` type (L281: `type PerRow = { drive_file_id: string; code: string; disposition?: string }`). Add immediately after the L408 `code` assertion:

```ts
expect(rows[0]!.display_name).toBe(CAS2_SHADOW_TITLE);
```

Also cover the spec's **parse-failure** case (display_name absent): in the existing test `"(c) corrupt/missing items payload is REFUSED per-row…"` (~L431), where `drive-cas-3` blocks with `STAGED_REVIEW_ITEMS_CORRUPT` (assertion at L463-465), add — this row's payload is not cleanly parse-OK, so the route must NOT bake in a name (the client falls back to the id):

```ts
expect(rows.find((r) => r.drive_file_id === "drive-cas-3")!).not.toHaveProperty("display_name");
```

(`not.toHaveProperty` — not `toBeUndefined()` — because the contract is the property is **absent**, per `exactOptionalPropertyTypes`; `toBeUndefined()` would also pass a buggy present-`undefined`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --fileParallelism=false tests/onboarding/finalizeCasFullApply.db.test.ts`
Expected: the `drive-cas-2` `display_name` assertion FAILS (absent, route does not set it yet). The `drive-cas-3` `not.toHaveProperty` passes already — it guards against a future impl baking the id in; its fail-first proof is the Step-5 revert (an impl that set `display_name: result.drive_file_id` would make it red).

- [ ] **Step 3: Write minimal implementation** — three edits in `finalize-cas/route.ts`:

(a) Add `display_name` to the `ShadowApplyResult` FAILURE variant (the second union member, L63-69):

```ts
  | {
      drive_file_id: string;
      code:
        | "STAGED_PARSE_OUTDATED_AT_PHASE_D"
        | "STAGED_REVIEW_ITEMS_CORRUPT"
        | "STAGED_PARSE_RESULT_CORRUPT"
        | typeof SHOW_ARCHIVED_IMMUTABLE;
      display_name?: string;
    };
```

(b) Enrich at the single `shadowResults` collection loop (L710-717). Re-parse the shadow payload only on the blocked path:

```ts
  const shadowResults: ShadowApplyResult[] = [];
  for (const row of await readShadowRows(tx, wizardSessionId)) {
    const result = await deps.withRowTx(row.drive_file_id, (rowTx, pipelineTx) =>
      applyShadow(rowTx, pipelineTx, row, affectedShowIds),
    );
    if (result.code === "OK") {
      shadowResults.push(result);
      continue;
    }
    const parsed = parseShadowPayloadForApply(row.payload);
    const title = parsed.ok ? parsedShowTitle(parsed.parseResult) : null;
    // exactOptionalPropertyTypes (tsconfig.json): `display_name?: string` rejects a
    // present `undefined`, so ADD the property only when a real title exists; a blocked
    // row without a title is pushed WITHOUT it (the client falls back to the id).
    shadowResults.push(title ? { ...result, display_name: title } : result);
  }
```

(c) Reuse the helper in `syntheticFileMeta` (L334), replacing the inline coalesce:

```ts
    name: parsedShowTitle(parsed.parseResult) ?? row.drive_file_id,
```

Add the import near the existing onboarding imports:

```ts
import { parsedShowTitle } from "@/lib/onboarding/blockerDisplayName";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --fileParallelism=false tests/onboarding/finalizeCasFullApply.db.test.ts`
Expected: PASS. Then `npx tsc --noEmit` clean.

- [ ] **Step 5: Negative-regression check + commit** — temporarily revert edit (b) to `shadowResults.push(result)` and confirm the new assertion goes red; restore. Then:

```bash
git add app/api/admin/onboarding/finalize-cas/route.ts tests/onboarding/finalizeCasFullApply.db.test.ts
git commit --no-verify -m "feat(onboarding): finalize-cas blocker rows carry display_name (show title)"
```

---

### Task 3: finalize (Phase B) per-row `display_name`

**Files:**
- Modify: `app/api/admin/onboarding/finalize/route.ts` (`PerRowResult` L121-132, `perRow.push` L1068, imports L1-11)
- Test: `tests/onboarding/finalize.test.ts` (mocked DB — no real DB needed)

**Interfaces:**
- Consumes: `parsedShowTitle` (Task 1); `row.parse_result` (`PendingFinalizeRow`, L100).
- Produces: `per_row[i].display_name?: string` on blocked Phase-B rows.

- [ ] **Step 1: Write the failing test** — `finalize.test.ts` already asserts a per_row entry with `code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE"` (L476-479) for the mocked approved row `first-seen-1`. The mocked approved row's `parse_result` is built by the local `parseResult(title)` helper (L41-44, shape `{ show: { title, … }, … }`) and the row at L335 uses `parseResult(\`Show ${driveFileId}\`)` — so for `first-seen-1` the title is already `"Show first-seen-1"`. Derive the expected from that builder (do not retype the literal — e.g. `const FS1_TITLE = \`Show first-seen-1\`` matching the L335 template), then assert:

```ts
const failed = body.per_row.find((r: { drive_file_id: string }) => r.drive_file_id === "first-seen-1");
expect(failed.code).toBe("STAGED_PARSE_REVISION_RACE_DURING_FINALIZE");
expect(failed.display_name).toBe(FS1_TITLE);
```

Also add a second case: a mocked approved row built with an EMPTY show title (call `parseResult("")` for that row, or set `parse_result.show.title = ""`) that blocks with a failure code; assert its per_row entry has **no** `display_name` property — `expect(failed).not.toHaveProperty("display_name")` (empty title → helper returns null → property omitted, not `undefined`-valued).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/onboarding/finalize.test.ts`
Expected: FAIL — `display_name` undefined on the failure entry.

- [ ] **Step 3: Write minimal implementation** — two edits in `finalize/route.ts`:

(a) Add `display_name` to the `PerRowResult` FAILURE variant (L121-132):

```ts
  | {
      drive_file_id: string;
      wizard_session_id: string;
      code:
        | typeof STAGED_PARSE_REVISION_RACE_DURING_FINALIZE
        | typeof STAGED_PARSE_SOURCE_OUT_OF_SCOPE
        | typeof WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED
        | typeof WIZARD_SESSION_SUPERSEDED
        | typeof STAGED_REVIEW_ITEMS_CORRUPT
        | "DRIVE_FETCH_FAILED";
      re_apply_url: string;
      display_name?: string;
    };
```

(b) Enrich at the single `perRow.push` collection point (L1068). Replace `perRow.push(result);` with:

```ts
        // Narrow `result` to the failure variant BEFORE spreading (a bare ternary leaves
        // `result` as the full union — the OK variant has no display_name, so
        // {...okVariant, display_name} is not assignable under exactOptionalPropertyTypes).
        if (result.code === OK_CODE) {
          perRow.push(result);
        } else {
          const displayTitle = parsedShowTitle(row.parse_result);
          perRow.push(displayTitle ? { ...result, display_name: displayTitle } : result);
        }
```

Add the import (after L11 `import type { ParseResult … }`):

```ts
import { parsedShowTitle } from "@/lib/onboarding/blockerDisplayName";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/onboarding/finalize.test.ts` → PASS. Then `npx tsc --noEmit` clean.

- [ ] **Step 5: Negative-regression + commit** — revert (b) to `perRow.push(result);`, confirm the assertion goes red, restore. Then:

```bash
git add app/api/admin/onboarding/finalize/route.ts tests/onboarding/finalize.test.ts
git commit --no-verify -m "feat(onboarding): finalize Phase-B blocker rows carry display_name (show title)"
```

---

### Task 4: render the title in all three blocker components

**Files:**
- Modify: `components/admin/FinalizeButton.tsx` (`PerRowFailure` L46, `CasPerRowEntry` L73, render L281 + L310)
- Modify: `components/admin/RunFinalCASButton.tsx` (`CasPerRowEntry` L30, render L121)
- Modify: `components/admin/ResumeFinalizeButton.tsx` (`PerRowFailure` L28, render L136)
- Test: `tests/components/admin/FinalizeButton.test.tsx`, `tests/components/admin/RunFinalCASButton.test.tsx`, `tests/components/admin/FinalizeReentry.test.tsx`

**Interfaces:**
- Consumes: the `display_name?: string` wire field from Tasks 2-3.

- [ ] **Step 1: Write the failing tests** — cover all **four** render sites (FinalizeButton has TWO lists). Each gets a title case + a fallback case:
  - `tests/components/admin/FinalizeButton.test.tsx` — **both** the `wizard-finalize-race-row` list (Phase B `PerRowFailure`, render L281) **and** the `wizard-finalize-cas-per-row` list (Phase D `CasPerRowEntry`, render L310). Drive each via the existing test's `fetch` mock: a `/finalize` response with `per_row: [PerRowFailure fixture]` and an `all_batches_complete` that routes to the race-row render; a `/finalize-cas` 409 with `per_row: [CasPerRowEntry fixture]` for the cas list.
  - `tests/components/admin/RunFinalCASButton.test.tsx` — the `cas_per_row` list (render L121).
  - `tests/components/admin/FinalizeReentry.test.tsx` — the `ResumeFinalizeButton` `race_row` list (render L136).

  Use a distinct opaque id + title per fixture, e.g. `{ drive_file_id: "1AbC_opaque_id", code: "STAGED_PARSE_OUTDATED_AT_PHASE_D", display_name: "Consultants Roundtable" }` (entry shape per component). Assertions:

```ts
// (1) the title is shown as the row label
expect(screen.getByText("Consultants Roundtable")).toBeInTheDocument();

// (2) the raw id is NOT the row label — scope to THIS list by its container
// test-id (a component may render two lists), clone it, strip the id-bearing
// reapply / RescanSheetButton subtrees (their data-testid + driveFileId still
// hold the id), then assert the id text is absent from what remains.
// listTestId = "wizard-finalize-race-row" | "wizard-finalize-cas-per-row" |
//   "resume-finalize-..." | the RunFinalCAS list container — per the site under test.
const list = screen.getByTestId(listTestId).cloneNode(true) as HTMLElement;
list
  .querySelectorAll("[data-testid*='reapply'], [data-testid*='rescan']")
  .forEach((n) => n.remove());
expect(list.textContent).not.toContain("1AbC_opaque_id");

// (3) fallback: a fixture that OMITS display_name shows the id
// (render a second fixture { drive_file_id: "1AbC_opaque_id", code } — NO display_name key,
//  since exactOptionalPropertyTypes rejects a present `undefined` — and assert
//  getByText("1AbC_opaque_id"))
```

Drive each component into its blocked state the way its existing tests do (mock `fetch` to return `{ ok: false, code, per_row: [fixture] }` and trigger the publish/resume action; mirror the existing `FinalizeButton.test.tsx` / `FinalizeReentry.test.tsx` setup).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/admin/FinalizeButton.test.tsx tests/components/admin/RunFinalCASButton.test.tsx tests/components/admin/FinalizeReentry.test.tsx`
Expected: FAIL — components still render `{…drive_file_id}`, so `getByText(title)` misses and the id is present in the label.

- [ ] **Step 3: Write minimal implementation** — in each component:

Add `display_name?: string` to the per-row entry type:
- `FinalizeButton.tsx` `PerRowFailure` (L46) and `CasPerRowEntry` (L73)
- `RunFinalCASButton.tsx` `CasPerRowEntry` (L30)
- `ResumeFinalizeButton.tsx` `PerRowFailure` (L28)

Swap the four render sites (keep `key`, `data-testid`, `RescanSheetButton driveFileId` unchanged):
- `FinalizeButton.tsx:281` → `<span className="font-medium">{failure.display_name ?? failure.drive_file_id}</span>`
- `FinalizeButton.tsx:310` → `<span className="font-medium">{row.display_name ?? row.drive_file_id}</span>`
- `RunFinalCASButton.tsx:121` → `<span className="font-medium">{row.display_name ?? row.drive_file_id}</span>`
- `ResumeFinalizeButton.tsx:136` → `<span className="font-medium">{failure.display_name ?? failure.drive_file_id}</span>`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/admin/FinalizeButton.test.tsx tests/components/admin/RunFinalCASButton.test.tsx tests/components/admin/FinalizeReentry.test.tsx`
Expected: PASS. Then `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add components/admin/FinalizeButton.tsx components/admin/RunFinalCASButton.tsx components/admin/ResumeFinalizeButton.tsx tests/components/admin/FinalizeButton.test.tsx tests/components/admin/RunFinalCASButton.test.tsx tests/components/admin/FinalizeReentry.test.tsx
git commit --no-verify -m "feat(admin): blocker rows show the parsed show title, not the drive_file_id"
```

---

### Task 5: resolve RESCAN-1 + verification + impeccable gate

**Files:**
- Modify: `DEFERRED.md` (RESCAN-1 → resolved)

- [ ] **Step 1: Mark RESCAN-1 resolved** — under the RESCAN-1 heading (`DEFERRED.md:176`), add a `**Resolved (PR <n>, 2026-06-29):**` line noting all three blocker components now render `display_name ?? drive_file_id` sourced from the parsed show title via `lib/onboarding/blockerDisplayName.ts`. Do not delete the entry (audit trail).

- [ ] **Step 2: Empty-title regression grep** — confirm no existing finalize-cas test asserts `syntheticFileMeta`'s `name` with an empty-string title (the helper's empty→id change is safe):

```bash
rg -n "syntheticFileMeta|name:.*\"\"|show.*title.*''" tests/onboarding/finalizeCas*.test.ts
```
Expected: no assertion on an empty-title `name`. If one exists, update it to expect the id.

- [ ] **Step 3: Full local verification** (CI-equivalent, serialized DB tests):

```bash
FILES="app/api/admin/onboarding/finalize/route.ts app/api/admin/onboarding/finalize-cas/route.ts lib/onboarding/blockerDisplayName.ts components/admin/FinalizeButton.tsx components/admin/RunFinalCASButton.tsx components/admin/ResumeFinalizeButton.tsx tests/onboarding/blockerDisplayName.test.ts tests/onboarding/finalizeCasFullApply.db.test.ts tests/onboarding/finalize.test.ts tests/components/admin/FinalizeButton.test.tsx tests/components/admin/RunFinalCASButton.test.tsx tests/components/admin/FinalizeReentry.test.tsx"
npx tsc --noEmit
npx eslint $FILES
npx prettier --check $FILES
VITEST_EXCLUDE_ENV_BOUND=1 npx vitest run
```
Expected: tsc/eslint/prettier clean; suite green except pre-existing local-DB-pollution failures (`validation-schema-parity` / drive-keyed audit re: `agenda_extract_leases` — confirm via "no committed migration creates it", not introduced here).

- [ ] **Step 4: Impeccable UI gate (invariant 8)** — run `/impeccable critique` AND `/impeccable audit` on the three component diffs (`FinalizeButton.tsx`, `RunFinalCASButton.tsx`, `ResumeFinalizeButton.tsx`). External attestation (fresh subagent, not self-attested). Fix HIGH/CRITICAL or defer via `DEFERRED.md` before cross-model review. Record findings + dispositions in the close-out.

- [ ] **Step 5: Commit**

```bash
git add DEFERRED.md
git commit --no-verify -m "docs(deferred): resolve RESCAN-1 (blocker rows now show the show title)"
```

---

## Self-Review

**1. Spec coverage:** helper (Task 1 ↔ spec §Shared helper); finalize-cas choke point + syntheticFileMeta (Task 2 ↔ §Single-choke-point, finalize-cas); finalize choke point (Task 3 ↔ Phase B); three components / four sites (Task 4 ↔ §UI render); DEFERRED + impeccable + invariants (Task 5 ↔ §Invariants). All spec test items (1 helper, 2-4 routes, 5 components, 6 empty-title grep, 7 negative-regression) are placed. No gaps.

**2. Placeholder scan:** no TBD/TODO; every code step shows the exact code; the DB-test step cites the exact sibling assertion site (L463) + hoisted-const pattern rather than "similar to".

**3. Type consistency:** `parsedShowTitle(pr: ParseResult | unknown): string | null` is identical across Tasks 1-3; `display_name?: string` is the field name in every type (`ShadowApplyResult`, `PerRowResult`, `CasPerRowEntry`, `PerRowFailure`) and every render site; the choke-point guards use `result.code === OK_CODE` (finalize) / `result.code === "OK"` (finalize-cas) matching each route's existing OK sentinel.

## Adversarial review (cross-model)

After self-review, invoke the cross-model adversarial review (Codex) on this plan; iterate until APPROVE; then execution handoff.
