# Flow 8 self-serve trio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Flow-8 audit items 8.1 (picker hardening + persistent affordance) and 8.2 (fail-closed viewer resolution + guided re-pick), and ship a defensive regression pin for transport visibility (8.4 audit item deferred to 8.3).

**Architecture:** Three surfaces. (1) A pure `sanitizePickerRoster` helper applied inside `loadRoster` (single sanitize chokepoint) + a persistent "can't find your name" affordance rendered in both picker modes. (2) A fail-closed `resolveViewerContext` (throws `UnmatchedViewerError` instead of `{none}` whole-show), plus a three-point guided-re-pick in `page.tsx`'s `resolved` case (`CrewMemberNotInShowError` typed throw, post-projection guard, render backstop) that disambiguates crew-removed from show-deleted via `loadShowAvailability`. (3) Transport regression tests over the already-shipped `namesRefer` fuzzy matcher.

**Tech Stack:** Next.js 16 Server Components, React 19, Supabase (service-role reads), Vitest + @testing-library/react (jsdom), TypeScript.

**Spec:** `docs/superpowers/specs/2026-07-09-flow8-self-serve-trio.md` (Codex-APPROVED, 14 rounds). Cite it for any rationale.

## Global Constraints

- **Invariant 1 (TDD per task):** failing test → minimal impl → green → commit. Never impl before its test.
- **Invariant 5 (no raw codes in UI):** all user-visible copy routes through `lib/messages/lookup.ts` `messageFor(code).crewFacing`.
- **Invariant 6 (commit per task):** conventional commits (`<type>(<scope>): <summary>`); one task ↔ one commit; `--no-verify` (worktree shares the main hook).
- **Invariant 7 (spec canonical):** the new §12.4 row lands in the same commit as the `catalog.ts` row + regenerated `spec-codes.ts`.
- **Invariant 8 (impeccable dual-gate):** 8.1 touches `_PickerInterstitial.tsx` → `/impeccable critique` + `/impeccable audit` before close-out; HIGH/CRITICAL fixed or `DEFERRED.md`.
- **Invariant 9 (Supabase call-boundary):** `loadShowAvailability` destructures `{ data, error }`; infra fault → `TerminalFailure` (fail-closed); inline `// not-subject-to-meta:` reason (page.tsx-local read, mirrors `loadRoster`).
- **New §12.4 code = crew-facing only:** `PICKER_NAME_NOT_LISTED` is NOT an admin_alert / internal / help-family code. Four lockstep edits: §12.4 prose + `pnpm gen:spec-codes` + `catalog.ts` + `picker-codes.test.ts`. Run full `tests/messages/` + `tests/cross-cutting/codes.test.ts` before push.
- **Meta-test inventory:** EXTENDS `tests/messages/picker-codes.test.ts`. CREATES none. `loadShowAvailability` is NOT a `_metaInfraContract` member (that registry scans `lib/auth/**`; this is `page.tsx`-local, like `loadRoster`).
- **No new migration, no advisory-lock surface, no new admin_alert code, no new mutation/telemetry surface.**
- Worktree: `.claude/worktrees/flow8-self-serve-trio`, branch `feat/flow8-self-serve-trio`. All paths below are worktree-relative. Run tests with `pnpm vitest run <path>`.

---

## File structure

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `lib/auth/picker/sanitizePickerRoster.ts` | Create | Pure roster transform (sentinel-guard + id-dedup) |
| `tests/auth/picker/sanitizePickerRoster.test.ts` | Create | Table-driven helper unit tests |
| `app/show/[slug]/[shareToken]/page.tsx` | Modify | `loadRoster` sanitize wrap; `loadShowAvailability`; `renderPickerRepick`; `renderRacedCrewMiss`; resolved-case Point A/B wiring; stale-arm refactor |
| `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx` | Modify | Persistent `PICKER_NAME_NOT_LISTED` affordance (both modes) |
| `lib/data/viewerContext.ts` | Modify | `UnmatchedViewerError` + fail-closed limb |
| `app/show/[slug]/[shareToken]/_CrewShell.tsx` | Modify | Catch `UnmatchedViewerError` → `TerminalFailure` (no retryHref) |
| `lib/data/getShowForViewer.ts` | Modify | `CrewMemberNotInShowError` at the `:301` crew-miss throw |
| `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` | Modify | §12.4 `PICKER_NAME_NOT_LISTED` row |
| `lib/messages/catalog.ts` | Modify | `PICKER_NAME_NOT_LISTED` entry |
| `lib/messages/__generated__/spec-codes.ts` | Regenerate | via `pnpm gen:spec-codes` |
| `tests/messages/picker-codes.test.ts` | Modify | add `PICKER_NAME_NOT_LISTED` to `PICKER_MESSAGE_CODES` |
| `tests/data/viewerContext.test.ts` | Modify | fail-closed throw + admin unchanged |
| `tests/data/getShowForViewer.test.ts` | Modify | typed-throw + back-compat |
| `tests/show/flow8Repick.test.tsx` | Create | route-level Point A/B / cascade / stale-arm / back-compat |
| `tests/show/pickerAffordance.test.tsx` | Create | `_PickerInterstitial` affordance both modes; `loadRoster` boundary |
| `tests/visibility/transportTileVisibleRegression.test.ts` | Create | 8.4 defensive fuzzy-tolerance pin + known-gap fixture |

`BACKLOG.md` → `BL-TRANSPORT-ID-RESOLUTION` is **already added** (landed with the spec commit); no plan task re-creates it. Task 7 references it.

---

### Task 1: `sanitizePickerRoster` pure helper + `loadRoster` wrap

**Files:**
- Create: `lib/auth/picker/sanitizePickerRoster.ts`
- Create: `tests/auth/picker/sanitizePickerRoster.test.ts`
- Modify: `app/show/[slug]/[shareToken]/page.tsx` (`loadRoster` return, `:59-68`)

**Interfaces:**
- Consumes: `shouldHideGenericOptional` from `@/lib/visibility/emptyState` (`:79`, normalizes `value.trim().toUpperCase()` against `GENERIC_OPTIONAL_HIDE`).
- Produces: `export function sanitizePickerRoster<T extends { id: string; name: string }>(roster: readonly T[]): T[]` — drops sentinel-named rows, collapses duplicate ids (first-wins, order preserved). Used by `loadRoster`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/auth/picker/sanitizePickerRoster.test.ts
import { describe, expect, test } from "vitest";
import { sanitizePickerRoster } from "@/lib/auth/picker/sanitizePickerRoster";

const row = (id: string, name: string) => ({ id, name, role: "A1", role_flags: [], claimed_via_oauth_at: null });

describe("sanitizePickerRoster", () => {
  test("drops sentinel-named rows (each GENERIC_OPTIONAL_HIDE token, any case, trimmed)", () => {
    const raw = [row("1", "Doug Larson"), row("2", "TBD"), row("3", "n/a"), row("4", "  TBA "), row("5", "-"), row("6", "—"), row("7", "")];
    expect(sanitizePickerRoster(raw).map((r) => r.id)).toEqual(["1"]);
  });

  test("collapses duplicate ids first-wins, preserves order", () => {
    const raw = [row("a", "Alice"), row("b", "Bob"), row("a", "Alice Again")];
    const out = sanitizePickerRoster(raw);
    expect(out.map((r) => r.id)).toEqual(["a", "b"]);
    expect(out[0]!.name).toBe("Alice"); // first occurrence wins
  });

  test("keeps same-name different-id rows (never dedups by name)", () => {
    const raw = [row("1", "John Smith"), row("2", "John Smith")];
    expect(sanitizePickerRoster(raw).map((r) => r.id)).toEqual(["1", "2"]);
  });

  test("empty in → empty out; all-sentinel in → empty out", () => {
    expect(sanitizePickerRoster([])).toEqual([]);
    expect(sanitizePickerRoster([row("1", "TBD"), row("2", "   ")])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/auth/picker/sanitizePickerRoster.test.ts`
Expected: FAIL — "Cannot find module '@/lib/auth/picker/sanitizePickerRoster'".

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/auth/picker/sanitizePickerRoster.ts
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

/**
 * Flow 8.1 (spec §4.2 / D3 / D4 / D6): the single roster-sanitize chokepoint.
 * `loadRoster` wraps its Supabase read in this so EVERY picker render path
 * (no_auth/gate-skip, all stale arms, renderPickerRepick) gets sanitized rows.
 *   1. Sentinel-guard: drop rows whose `name` is a generic sentinel
 *      (`shouldHideGenericOptional` — "" TBD N/A TBA - —, case/whitespace-insensitive).
 *   2. Dedup by `id` ONLY (first-wins, order preserved). Same-name/different-id
 *      rows are BOTH kept — collapsing by name would hide a real second person.
 */
export function sanitizePickerRoster<T extends { id: string; name: string }>(
  roster: readonly T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of roster) {
    if (shouldHideGenericOptional(r.name)) continue; // canonicalize-exempt: roster name sentinel check, not an email
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/auth/picker/sanitizePickerRoster.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the FAILING `loadRoster` boundary route test (BEFORE wiring — TDD for the wiring)**

This is the load-bearing proof that raw rows are sanitized on the common `no_auth` first-contact picker path (which renders directly from `loadRoster`, not `renderPickerRepick`). It MUST be written and fail before the wiring in Step 6.

```tsx
// tests/show/loadRosterSanitizeBoundary.test.tsx
// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/picker/showPageChainRequest", () => ({ buildShowPageChainRequest: vi.fn(async () => new Request("http://internal/")) }));
vi.mock("@/lib/auth/picker/resolveShowPageAccess", () => ({ resolveShowPageAccess: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServiceRoleClient: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }), redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }) }));

import ShowPage from "@/app/show/[slug]/[shareToken]/page";
import { resolveShowPageAccess } from "@/lib/auth/picker/resolveShowPageAccess";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

describe("loadRoster sanitize boundary (no_auth first-contact path)", () => {
  test("raw roster with a sentinel name + duplicate id renders only the sanitized row", async () => {
    (resolveShowPageAccess as any).mockResolvedValue({ kind: "no_auth", reason: "first_contact", showId: "sid" });
    const rawRows = [
      { id: "1", name: "TBD", role: "A1", role_flags: [], claimed_via_oauth_at: null },
      { id: "2", name: "Doug Larson", role: "A1", role_flags: [], claimed_via_oauth_at: null },
      { id: "2", name: "Doug dup", role: "A1", role_flags: [], claimed_via_oauth_at: null },
    ];
    const q: any = { select: () => q, eq: () => q, order: () => Promise.resolve({ data: rawRows, error: null }) };
    (createSupabaseServiceRoleClient as any).mockReturnValue({ from: () => q });

    const ui = await ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({ gate: "skip" }) });
    const { container } = render(ui);
    const rows = container.querySelectorAll('[data-testid="picker-roster-row"]');
    expect(rows.length).toBe(1); // "TBD" dropped, duplicate id "2" collapsed → one row
    expect(rows[0]?.textContent).toContain("Doug Larson");
  });
});
```

- [ ] **Step 6: Run to verify it fails, then wire `loadRoster`**

Run: `pnpm vitest run tests/show/loadRosterSanitizeBoundary.test.tsx`
Expected: FAIL — renders 3 rows (raw, unsanitized) because `loadRoster` returns raw rows.

Then in `app/show/[slug]/[shareToken]/page.tsx`, add the import near the other `@/lib/auth/picker` imports and change `loadRoster`'s return (`:67`):

```ts
import { sanitizePickerRoster } from "@/lib/auth/picker/sanitizePickerRoster";
// …
  if (error) throw new Error("roster lookup failed");
  return sanitizePickerRoster((data ?? []) as RosterRow[]);
```

- [ ] **Step 7: Run both tests + typecheck**

Run: `pnpm vitest run tests/auth/picker/sanitizePickerRoster.test.ts tests/show/loadRosterSanitizeBoundary.test.tsx && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: both PASS (boundary now renders 1 row); tsc clean.

- [ ] **Step 8: Commit**

```bash
git add lib/auth/picker/sanitizePickerRoster.ts tests/auth/picker/sanitizePickerRoster.test.ts tests/show/loadRosterSanitizeBoundary.test.tsx "app/show/[slug]/[shareToken]/page.tsx"
git commit --no-verify -m "feat(auth): sanitizePickerRoster (sentinel-guard + id-dedup) wired into loadRoster + first-contact boundary proof"
```

---

### Task 2: `PICKER_NAME_NOT_LISTED` catalog code (4-way lockstep)

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 table, after the `PICKER_SHOW_UNAVAILABLE` row `:3051`)
- Modify: `lib/messages/catalog.ts` (after the `PICKER_SHOW_UNAVAILABLE` entry `:3073-3083`)
- Regenerate: `lib/messages/__generated__/spec-codes.ts`
- Modify: `tests/messages/picker-codes.test.ts` (`PICKER_MESSAGE_CODES`, `:11-27`)

**Interfaces:**
- Produces: message code `"PICKER_NAME_NOT_LISTED"` resolvable via `messageFor("PICKER_NAME_NOT_LISTED").crewFacing`.

- [ ] **Step 1: Add the failing test row first**

In `tests/messages/picker-codes.test.ts`, add `"PICKER_NAME_NOT_LISTED",` to the `PICKER_MESSAGE_CODES` array (after `"PICKER_EMPTY_ROSTER",`).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/messages/picker-codes.test.ts`
Expected: FAIL — `PICKER_NAME_NOT_LISTED live catalog row` / `generated spec-code row` undefined (and a TS error that the literal is not assignable to `MessageCode` — expected until the catalog row lands).

- [ ] **Step 3: Add the §12.4 master-spec row**

In `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`, immediately after the `PICKER_SHOW_UNAVAILABLE` row (`:3051`), insert (columns are `| code | description | dougFacing | crewFacing | followUp |`; use `—` em-dash for the empty dougFacing cell — NEVER prettier this file):

```
| `PICKER_NAME_NOT_LISTED` | Flow 8.1 — persistent picker affordance for a crew member who does not see their name; routes them back to the link sender. | — | "Don't see your name? Ask the person who shared this link to add you." | Crew → ask the link sender |
```

- [ ] **Step 4: Add the `catalog.ts` entry**

In `lib/messages/catalog.ts`, after the `PICKER_SHOW_UNAVAILABLE` entry (mirror `PICKER_EMPTY_ROSTER`'s shape exactly):

```ts
  PICKER_NAME_NOT_LISTED: {
    code: "PICKER_NAME_NOT_LISTED",
    dougFacing: null,
    crewFacing: "Don't see your name? Ask the person who shared this link to add you.",
    followUp: "Crew → ask the link sender",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
```

- [ ] **Step 5: Regenerate spec-codes + run gates**

Run:
```bash
pnpm gen:spec-codes
pnpm vitest run tests/messages/picker-codes.test.ts tests/cross-cutting/codes.test.ts tests/cross-cutting/extract-spec-codes.test.ts
```
Expected: `spec-codes.ts` now contains `PICKER_NAME_NOT_LISTED`; all three suites PASS.

- [ ] **Step 6: Full messages sweep + commit**

Run: `pnpm vitest run tests/messages/ && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: PASS; tsc clean.

```bash
git add docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/catalog.ts lib/messages/__generated__/spec-codes.ts tests/messages/picker-codes.test.ts
git commit --no-verify -m "feat(messages): PICKER_NAME_NOT_LISTED catalog code (§12.4 + catalog + spec-codes + picker-codes)"
```

---

### Task 3: Persistent affordance in `_PickerInterstitial.tsx` (both modes)

**Files:**
- Modify: `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx` (after the roster region, before the `staleCleanupHint` mount `:220`)
- Create: `tests/show/pickerAffordance.test.tsx`

**Interfaces:**
- Consumes: `messageFor` (already imported), the new `PICKER_NAME_NOT_LISTED` code from Task 2.
- Produces: a `data-testid="picker-name-not-listed"` element rendered UNCONDITIONALLY (both empty and non-empty roster modes).

- [ ] **Step 1: Write the failing render test**

```tsx
// tests/show/pickerAffordance.test.tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { PickerInterstitial } from "@/app/show/[slug]/[shareToken]/_PickerInterstitial";
import { messageFor } from "@/lib/messages/lookup";

const base = { slug: "s", shareToken: "t", showId: "sid", banner: null, staleCleanupHint: null } as const;
const affordance = messageFor("PICKER_NAME_NOT_LISTED").crewFacing;
const roster = [{ id: "1", name: "Doug Larson", role: "A1", role_flags: [], claimed_via_oauth_at: null }];

describe("picker missing-name affordance (both modes)", () => {
  test("non-empty roster shows the affordance", () => {
    render(<PickerInterstitial {...base} roster={roster} />);
    expect(screen.getByTestId("picker-name-not-listed")).toHaveTextContent(affordance!);
  });

  test("empty roster shows the affordance alongside PICKER_EMPTY_ROSTER copy", () => {
    render(<PickerInterstitial {...base} roster={[]} />);
    expect(screen.getByTestId("picker-name-not-listed")).toHaveTextContent(affordance!);
    expect(screen.getByTestId("picker-roster-empty")).toHaveTextContent(
      messageFor("PICKER_EMPTY_ROSTER").crewFacing!,
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/show/pickerAffordance.test.tsx`
Expected: FAIL — `Unable to find an element by: [data-testid="picker-name-not-listed"]`.

- [ ] **Step 3: Render the affordance unconditionally**

In `_PickerInterstitial.tsx`, insert BETWEEN the roster `{roster.length === 0 ? (…) : (…)}` block (ends `:218`) and the `{staleCleanupHint && (…)}` block (`:220`):

```tsx
        <p
          data-testid="picker-name-not-listed"
          className="text-center text-xs text-text-subtle"
        >
          {messageFor("PICKER_NAME_NOT_LISTED").crewFacing}
        </p>
```

(Uses existing tokens `text-center text-xs text-text-subtle`; no new `@theme` block.)

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/show/pickerAffordance.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: clean.

```bash
git add "app/show/[slug]/[shareToken]/_PickerInterstitial.tsx" tests/show/pickerAffordance.test.tsx
git commit --no-verify -m "feat(crew-page): persistent PICKER_NAME_NOT_LISTED affordance in both picker modes"
```

---

### Task 4: `UnmatchedViewerError` fail-closed backstop (8.2 Point C)

**Files:**
- Modify: `lib/data/viewerContext.ts` (new error class + `:125-141` branch)
- Modify: `app/show/[slug]/[shareToken]/_CrewShell.tsx` (`:211-219` catch)
- Modify: `tests/data/viewerContext.test.ts`

**Interfaces:**
- Produces: `export class UnmatchedViewerError extends Error` (sibling of `MalformedProjectionError`). `resolveViewerContext` throws it for a `crew`/`admin_preview` viewer whose id is absent from a well-formed `crewMembers` array. `admin` viewer unchanged (`{none}` + `SCOPE_TILE_UNLOCKING_FLAGS`).

- [ ] **Step 1: INVERT the existing contradictory test + add the admin-unchanged assertion**

`tests/data/viewerContext.test.ts:130-145` currently asserts the OLD fail-open (`crew viewer with no matching row → falls back to none restrictions`). That contract is exactly what 8.2 reverses, so **REPLACE that test in place** (do not add a duplicate — the suite would otherwise contradict itself and never reach green). Add `UnmatchedViewerError` to the existing `import { resolveViewerContext, … } from "@/lib/data/viewerContext"` at the top of the file. Replace the `:130-145` test body with:

```ts
  test("crew viewer with no matching row in a well-formed array THROWS UnmatchedViewerError (8.2: was the {none} whole-show fail-open)", () => {
    const viewer: Viewer = { kind: "crew", crewMemberId: "crew-missing" };
    const data = makeData([crewRowAlice]); // well-formed array, id absent
    expect(() => resolveViewerContext(viewer, data)).toThrow(UnmatchedViewerError);
  });
```

Then ADD (new test, keeps the admin limb pinned):

```ts
  test("admin viewer with an empty well-formed array still returns {none} + all-flags (unchanged)", () => {
    const ctx = resolveViewerContext({ kind: "admin" } as Viewer, makeData([]));
    expect(ctx.dateRestriction).toEqual({ kind: "none" });
    expect(ctx.viewerFlags).toEqual([...SCOPE_TILE_UNLOCKING_FLAGS]);
    expect(ctx.isAdmin).toBe(true);
  });
```

> `makeData`, `crewRowAlice`, `Viewer`, and `SCOPE_TILE_UNLOCKING_FLAGS` are already imported/defined in this test file (see `:60-92`). Do NOT redefine them. Also grep the rest of the file for any OTHER assertion of the old none-fallback for an unmatched *crew/admin_preview* viewer and invert those too (the admin-viewer none case at `:87-92` stays — that limb is unchanged).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/data/viewerContext.test.ts`
Expected: FAIL — `UnmatchedViewerError` is not exported / not thrown (current code returns `{none}`).

- [ ] **Step 3: Add the error class + fail-closed limb**

In `lib/data/viewerContext.ts`, add after `MalformedProjectionError` (`:74`):

```ts
/**
 * Thrown when a crew/admin_preview viewer's id has NO matching row in a
 * WELL-FORMED crewMembers array (Flow 8.2 / spec §4.1 Point C). The original
 * code fell open to `{ kind: "none" }` = whole-show visibility; this fails
 * CLOSED instead. _CrewShell catches it and renders the route's infra arm.
 * Admin viewers never reach this (they take the isAdmin limb).
 */
export class UnmatchedViewerError extends Error {
  constructor(viewerKind: string, crewMemberId: string) {
    super(`No crew_members row matches viewer id '${crewMemberId}' for viewer kind '${viewerKind}' in a well-formed projection`);
    this.name = "UnmatchedViewerError";
  }
}
```

Then replace the `viewerCrew`/restriction derivation (`:125-141`) so the crew/admin_preview unmatched case throws instead of falling to `{none}`:

```ts
  if (viewer.kind === "crew" || viewer.kind === "admin_preview") {
    const viewerCrew = data.crewMembers.find((c) => c.id === viewer.crewMemberId) ?? null;
    if (!viewerCrew) {
      // Fail CLOSED (was `{ kind: "none" }` = whole-show fail-open). Spec §4.1 Point C.
      throw new UnmatchedViewerError(viewer.kind, viewer.crewMemberId);
    }
    return {
      viewerCrew,
      dateRestriction: viewerCrew.dateRestriction,
      stageRestriction: viewerCrew.stageRestriction,
      viewerFlags: viewerCrew.roleFlags,
      viewerName: viewerCrew.name,
      isAdmin,
    };
  }
  // admin viewer: whole-show is legitimate.
  return {
    viewerCrew: null,
    dateRestriction: { kind: "none" },
    stageRestriction: { kind: "none" },
    viewerFlags: [...SCOPE_TILE_UNLOCKING_FLAGS],
    viewerName: null,
    isAdmin,
  };
```

- [ ] **Step 4: Run the helper test to verify it passes**

Run: `pnpm vitest run tests/data/viewerContext.test.ts`
Expected: PASS (helper now throws / admin unchanged).

- [ ] **Step 5: Write the FAILING `_CrewShell` catch test (TDD for the backstop catch)**

The `UnmatchedViewerError` catch is reachable on the **admin-preview** route (the crew route's Point B guard pre-empts it), so pin it by rendering `CrewShell` directly with an `admin_preview` viewer whose id is absent from a well-formed `crewMembers` array. Mirror the existing `tests/show/resolvedArmCrewMembersGuard.test.tsx` harness (read it first for the exact mock set + how it renders `CrewShell`). Create `tests/show/crewShellUnmatchedViewer.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import CrewShell from "@/app/show/[slug]/[shareToken]/_CrewShell"; // use the actual export (default or named — confirm)
import type { ShowForViewer } from "@/lib/data/getShowForViewer";

// Minimal well-formed projection whose crewMembers OMITS the viewer id.
const data = { /* fill per ShowForViewer shape used by resolvedArmCrewMembersGuard; crewMembers: [{ id: "other", … }] */ } as unknown as ShowForViewer;

describe("_CrewShell backstop: UnmatchedViewerError → TerminalFailure (no retryHref)", () => {
  test("admin_preview viewer absent from a well-formed array renders terminal-failure without a retry link", async () => {
    const ui = await CrewShell({ data, viewer: { kind: "admin_preview", crewMemberId: "missing" }, showId: "sid", rawSection: undefined, slug: "s", shareToken: undefined as any, identityChip: null } as any);
    const { container } = render(ui);
    expect(container.querySelector('[data-testid="terminal-failure"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="terminal-failure-retry"]')).toBeNull(); // NO retryHref
  });
});
```

> Read `resolvedArmCrewMembersGuard.test.tsx` for the exact `CrewShell` invocation/props + the `ShowForViewer` fixture shape, and copy them; the block above is a scaffold, not final. Confirm `CrewShell`'s export form and prop names before finalizing.

- [ ] **Step 6: Run to verify it fails, then add the `_CrewShell` catch**

Run: `pnpm vitest run tests/show/crewShellUnmatchedViewer.test.tsx`
Expected: FAIL — `UnmatchedViewerError` propagates uncaught (no `terminal-failure`), because `_CrewShell` does not yet catch it.

Then in `app/show/[slug]/[shareToken]/_CrewShell.tsx`, extend the existing catch (`:214-218`) and import:

```tsx
  } catch (err) {
    if (err instanceof MalformedProjectionError || err instanceof UnmatchedViewerError) {
      return <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />;
    }
    throw err;
  }
```

Add `UnmatchedViewerError` to the existing `import { MalformedProjectionError, … } from "@/lib/data/viewerContext"` (`:65`).

- [ ] **Step 7: Run all + typecheck**

Run: `pnpm vitest run tests/data/viewerContext.test.ts tests/show/crewShellUnmatchedViewer.test.tsx tests/show/resolvedArmCrewMembersGuard.test.tsx && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: PASS (backstop catches; malformed-projection guard unaffected); tsc clean. (No retryHref — route-agnostic for the shareToken-less admin-preview caller, spec §4.1.)

- [ ] **Step 8: Commit**

```bash
git add lib/data/viewerContext.ts "app/show/[slug]/[shareToken]/_CrewShell.tsx" tests/data/viewerContext.test.ts tests/show/crewShellUnmatchedViewer.test.tsx
git commit --no-verify -m "fix(crew-page): resolveViewerContext fails closed (UnmatchedViewerError) + _CrewShell backstop catch"
```

---

### Task 5: `CrewMemberNotInShowError` typed throw at the crew-miss (8.2 Point A error type)

**Files:**
- Modify: `lib/data/getShowForViewer.ts` (`:301` crew-miss throw only)
- Modify: `tests/data/getShowForViewer.test.ts`

**Interfaces:**
- Produces: `export class CrewMemberNotInShowError extends Error` whose `.message` is the literal `"PICKER_CREW_MEMBER_WRONG_SHOW"` (back-compat). Thrown ONLY at the `:301` crew id+show lookup miss. Sites `:317`/`:321` (show deleted / unpublished) stay plain `new Error("PICKER_CREW_MEMBER_WRONG_SHOW")`.

- [ ] **Step 1: Write the failing test**

Add to `tests/data/getShowForViewer.test.ts` (uses the existing `seedShow`/`seedCrew` DB harness):

```ts
import { getShowForViewer, CrewMemberNotInShowError } from "@/lib/data/getShowForViewer";

test("crew-row miss throws CrewMemberNotInShowError with the WRONG_SHOW message preserved", async () => {
  const showA = await seedShow({ title: "A" });
  const aliceId = await seedCrew({ showId: showA, name: "Alice", roleFlags: ["A1"] });
  const showB = await seedShow({ title: "B" });
  await seedCrew({ showId: showB, name: "Bob", roleFlags: ["A1"] });
  const err = await getShowForViewer(showB, { kind: "crew", crewMemberId: aliceId }).catch((e) => e);
  expect(err).toBeInstanceOf(CrewMemberNotInShowError);
  expect((err as Error).message).toBe("PICKER_CREW_MEMBER_WRONG_SHOW");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/data/getShowForViewer.test.ts -t "CrewMemberNotInShowError"`
Expected: FAIL — not exported / thrown as plain `Error`.

- [ ] **Step 3: Add the class + throw it at `:301` only**

In `lib/data/getShowForViewer.ts`, add near the top exports:

```ts
/**
 * Flow 8.2 (spec §4.1 Point A): the crew id+show lookup miss (`:301`). Distinct
 * SUBCLASS so page.tsx can `instanceof`-route the resolved-case race to a guided
 * re-pick, while `.message` stays "PICKER_CREW_MEMBER_WRONG_SHOW" so message-based
 * consumers (admin-preview notFound, throw-assert tests) are UNCHANGED. Sites
 * :317/:321 (show deleted/unpublished) keep plain Error — different destination.
 */
export class CrewMemberNotInShowError extends Error {
  constructor() {
    super("PICKER_CREW_MEMBER_WRONG_SHOW");
    this.name = "CrewMemberNotInShowError";
  }
}
```

Change ONLY the `:301` throw (the `if (!lookup.data)` branch inside `needsCrewLookup`):

```ts
    if (!lookup.data) {
      throw new CrewMemberNotInShowError();
    }
```

Leave `:317` and `:321` as `throw new Error("PICKER_CREW_MEMBER_WRONG_SHOW");` unchanged.

- [ ] **Step 4: Verify pass + back-compat suite**

Run: `pnpm vitest run tests/data/getShowForViewer.test.ts tests/data/show-page-role-spoof.test.ts`
Expected: PASS — the new test AND the existing `:243`/`:260` `.rejects.toThrow("PICKER_CREW_MEMBER_WRONG_SHOW")` (message-substring match still holds) AND `show-page-role-spoof.test.ts:48` (source still contains the literal at `:317`/`:321`).

- [ ] **Step 5: Commit**

```bash
git add lib/data/getShowForViewer.ts tests/data/getShowForViewer.test.ts
git commit --no-verify -m "fix(crew-page): typed CrewMemberNotInShowError at crew-miss (message preserved for back-compat)"
```

---

### Task 6: 8.2 primary — `loadShowAvailability` + `renderPickerRepick` + `renderRacedCrewMiss` + Point A/B wiring + stale-arm refactor

> Tasks 6 and 7 are **merged** (invariant 1 needs a red-first proof for the new helpers, which only exists once Point A/B are wired). The RED-first tests are the Point A/B **re-pick** + **cascade** route cases: pre-implementation the `resolved` case sends `CrewMemberNotInShowError` to `TerminalFailure` (catch-all) and renders `CrewShell` for a returned projection, so every "expect `PickerInterstitial` / expect `notFound()`" assertion FAILS first. The two stale-arm cases are regression companions (green before; must stay green — they go red only if the extraction drops a catch/hint).

**Files:**
- Modify: `app/show/[slug]/[shareToken]/page.tsx` (three module-scope helpers; refactor the stale-arm block `:233-263`; rewrite the `resolved` case `:152-189`)
- Create/Modify: `tests/show/flow8Repick.test.tsx`

**Interfaces:**
- Consumes: `CrewMemberNotInShowError` (Task 5), existing `loadRoster`, `PickerInterstitial`, `TerminalFailure`, `staleBannerFor`, `createSupabaseServiceRoleClient`, `notFound` (from `next/navigation`).
- Produces (all module-private in `page.tsx`):
  - `async function loadShowAvailability(showId: string): Promise<"available" | "unavailable">` — reads `shows(published, archived)`; `{data,error}` discipline; on Supabase error THROWS; missing/archived/`published !== true` → `"unavailable"`.
  - `async function renderPickerRepick(args: { showId: string; slug: string; shareToken: string; s: string | undefined; banner: PickerInterstitialBannerCode; staleCleanupHint: { expectedEpoch: number; expectedCrewMemberId: string } | null }): Promise<JSX.Element>` — `try { roster = await loadRoster(showId) } catch { return <TerminalFailure … retryHref/> }`, else `<PickerInterstitial …/>`. Never re-throws.
  - `async function renderRacedCrewMiss(args: { showId; slug; shareToken; s }): Promise<JSX.Element>` — catches ONLY the `loadShowAvailability` read (→ `TerminalFailure`); OUTSIDE that catch: `"unavailable"` → `notFound()`, else `renderPickerRepick({ …, banner: "PICKER_REMOVED_FROM_ROSTER_BANNER", staleCleanupHint: null })`.

- [ ] **Step 1: Write the shared harness + the two stale-arm regression companions**

Write in `tests/show/flow8Repick.test.tsx` (shared mock harness + both stale-arm regression companions; the Point A/B / cascade / infra / roster-fail / negative cases are added in Step 2):

```tsx
// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/picker/showPageChainRequest", () => ({ buildShowPageChainRequest: vi.fn(async () => new Request("http://internal/")) }));
vi.mock("@/lib/auth/picker/resolveShowPageAccess", () => ({ resolveShowPageAccess: vi.fn() }));
vi.mock("@/lib/data/getShowForViewer", async (orig) => ({ ...(await orig()), getShowForViewer: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServiceRoleClient: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }), redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }) }));

import ShowPage from "@/app/show/[slug]/[shareToken]/page";
import { resolveShowPageAccess } from "@/lib/auth/picker/resolveShowPageAccess";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

function mockRosterClient(rows: unknown[]) {
  const q: any = { select: () => q, eq: () => q, order: () => Promise.resolve({ data: rows, error: null }) };
  (createSupabaseServiceRoleClient as any).mockReturnValue({ from: () => q });
}
function mockRosterError() {
  const q: any = { select: () => q, eq: () => q, order: () => Promise.resolve({ data: null, error: { message: "roster boom" } }) };
  (createSupabaseServiceRoleClient as any).mockReturnValue({ from: () => q });
}
const removedAccess = { kind: "removed_from_roster", showId: "sid", expectedEpoch: 3, expectedCrewMemberId: "cm1" };

test("removed_from_roster arm still mounts StaleCleanupAutoSubmit after the renderPickerRepick refactor", async () => {
  (resolveShowPageAccess as any).mockResolvedValue(removedAccess);
  mockRosterClient([{ id: "cm1", name: "Doug", role: "A1", role_flags: [], claimed_via_oauth_at: null }]);
  const { container } = render(await ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) }));
  expect(container.querySelector('[data-testid="stale-cleanup-auto-submit"]')).not.toBeNull();
});

test("renderPickerRepick refactor-guard: removed_from_roster with a roster-read error still yields TerminalFailure, not a thrown render", async () => {
  (resolveShowPageAccess as any).mockResolvedValue(removedAccess);
  mockRosterError();
  const { container } = render(await ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) }));
  expect(container.querySelector('[data-testid="terminal-failure"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="picker-interstitial-root"]')).toBeNull();
});
```

> Before writing, confirm the `StaleCleanupAutoSubmit` root `data-testid` (`stale-cleanup-auto-submit`, verified) and `TerminalFailure`'s (`terminal-failure`, verified). Both refactor-guards are GREEN before Step 4 (the stale arm's inline catch) and MUST stay green after — an extraction that drops `renderPickerRepick`'s catch turns the second one red.

- [ ] **Step 2: Add the Point A/B / cascade / infra / roster-fail / negative tests (same file)**

Continue `tests/show/flow8Repick.test.tsx` with these cases (the RED-first proofs — the re-pick + cascade cases fail against the current `resolved` case):

```tsx
import { getShowForViewer, CrewMemberNotInShowError } from "@/lib/data/getShowForViewer";
import { notFound } from "next/navigation";
import { messageFor } from "@/lib/messages/lookup";

function availabilityClient(showRow: { published: boolean; archived: boolean } | null, rosterRows: unknown[] = []) {
  (createSupabaseServiceRoleClient as any).mockReturnValue({
    from: (table: string) => {
      if (table === "shows") return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: showRow, error: null }) }) }) };
      const q: any = { select: () => q, eq: () => q, order: () => Promise.resolve({ data: rosterRows, error: null }) };
      return q;
    },
  });
}
const resolvedAccess = { kind: "resolved", showId: "sid", crewMemberId: "cm1" };

test("Point A: CrewMemberNotInShowError + available show → PickerInterstitial re-pick w/ REMOVED_FROM_ROSTER banner, not TerminalFailure", async () => {
  (resolveShowPageAccess as any).mockResolvedValue(resolvedAccess);
  (getShowForViewer as any).mockRejectedValue(new CrewMemberNotInShowError());
  availabilityClient({ published: true, archived: false }, [{ id: "cmX", name: "Someone", role: "A1", role_flags: [], claimed_via_oauth_at: null }]);
  const { container } = render(await ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) }));
  expect(container.querySelector('[data-testid="picker-interstitial-root"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="terminal-failure"]')).toBeNull();
  // Pin the guided banner — spec requires PICKER_REMOVED_FROM_ROSTER_BANNER (not null / wrong banner).
  expect(container.querySelector('[data-testid="picker-banner"]')?.textContent).toContain(
    messageFor("PICKER_REMOVED_FROM_ROSTER_BANNER").crewFacing!,
  );
});

test("Point A: CrewMemberNotInShowError + deleted show (cascade) → notFound(), not picker", async () => {
  (resolveShowPageAccess as any).mockResolvedValue(resolvedAccess);
  (getShowForViewer as any).mockRejectedValue(new CrewMemberNotInShowError());
  availabilityClient(null);
  await expect(ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
});

test("Point B: well-formed projection missing the resolved id + available → re-pick w/ REMOVED_FROM_ROSTER banner", async () => {
  (resolveShowPageAccess as any).mockResolvedValue(resolvedAccess);
  (getShowForViewer as any).mockResolvedValue({ crewMembers: [{ id: "other", name: "X" }] });
  availabilityClient({ published: true, archived: false }, [{ id: "other", name: "X", role: "A1", role_flags: [], claimed_via_oauth_at: null }]);
  const { container } = render(await ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) }));
  expect(container.querySelector('[data-testid="picker-interstitial-root"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="picker-banner"]')?.textContent).toContain(
    messageFor("PICKER_REMOVED_FROM_ROSTER_BANNER").crewFacing!,
  );
});

test("Point B: projection missing id + deleted show (cascade) → notFound(), not picker", async () => {
  (resolveShowPageAccess as any).mockResolvedValue(resolvedAccess);
  (getShowForViewer as any).mockResolvedValue({ crewMembers: [{ id: "other", name: "X" }] });
  availabilityClient(null); // show gone
  await expect(ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
});

test("Point B: projection missing id + unpublished show → notFound()", async () => {
  (resolveShowPageAccess as any).mockResolvedValue(resolvedAccess);
  (getShowForViewer as any).mockResolvedValue({ crewMembers: [{ id: "other", name: "X" }] });
  availabilityClient({ published: false, archived: false });
  await expect(ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
});

test("availability read infra error (Point A) → TerminalFailure, notFound NOT swallowed elsewhere", async () => {
  (resolveShowPageAccess as any).mockResolvedValue(resolvedAccess);
  (getShowForViewer as any).mockRejectedValue(new CrewMemberNotInShowError());
  // shows read returns a Supabase { error } → loadShowAvailability throws → caught INSIDE renderRacedCrewMiss.
  (createSupabaseServiceRoleClient as any).mockReturnValue({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: "boom" } }) }) }) }),
  });
  const { container } = render(await ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) }));
  expect(container.querySelector('[data-testid="terminal-failure"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="picker-interstitial-root"]')).toBeNull();
});

test("renderPickerRepick roster-load failure (available show, crew_members read errors) → TerminalFailure, NOT a thrown render", async () => {
  (resolveShowPageAccess as any).mockResolvedValue(resolvedAccess);
  (getShowForViewer as any).mockRejectedValue(new CrewMemberNotInShowError()); // Point A → renderRacedCrewMiss → renderPickerRepick
  // shows read: available; crew_members read: Supabase error → loadRoster throws → renderPickerRepick's OWN catch → TerminalFailure.
  (createSupabaseServiceRoleClient as any).mockReturnValue({
    from: (table: string) => {
      if (table === "shows") return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { published: true, archived: false }, error: null }) }) }) };
      const q: any = { select: () => q, eq: () => q, order: () => Promise.resolve({ data: null, error: { message: "roster boom" } }) };
      return q;
    },
  });
  const { container } = render(await ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) }));
  expect(container.querySelector('[data-testid="terminal-failure"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="picker-interstitial-root"]')).toBeNull();
});

test("negative: generic getShowForViewer error → TerminalFailure, not re-pick", async () => {
  (resolveShowPageAccess as any).mockResolvedValue(resolvedAccess);
  (getShowForViewer as any).mockRejectedValue(new Error("PICKER_CREW_MEMBER_WRONG_SHOW")); // plain Error = :317/:321 shape
  const { container } = render(await ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) }));
  expect(container.querySelector('[data-testid="terminal-failure"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="picker-interstitial-root"]')).toBeNull();
});
```

> `loadRoster` throws (`new Error("roster lookup failed")`) when the crew_members read returns `{ error }` — so this exercises `renderPickerRepick`'s own `try/catch`. An implementation that drops that catch fails here (the throw escapes to Next's generic boundary instead of `terminal-failure`).

This covers the full matrix for **both** points: Point A {available→picker, deleted→notFound, infra→TerminalFailure} and Point B {available→picker, deleted→notFound, unpublished→notFound}. The infra case also pins the round-1 fix — `notFound()` is not swallowed because `renderRacedCrewMiss` catches only the availability read, not the `notFound()`.

> Confirm `TerminalFailure`'s root `data-testid` (`components/auth/TerminalFailure.tsx`) and `PickerInterstitial`'s (`picker-interstitial-root`, verified) before running; adjust selectors to the real ids.

- [ ] **Step 3: Run to verify the RED cases fail (and the stale-arm guards still pass)**

Run: `pnpm vitest run tests/show/flow8Repick.test.tsx`
Expected: the Point A/B + cascade + infra + roster-fail cases FAIL (current `resolved` case renders `CrewShell` or catches every error as a generic `TerminalFailure`; no `renderRacedCrewMiss` exists yet). The two Step-1 stale-arm refactor-guards still PASS (green-before — they pin the pre-existing inline stale-arm behavior the refactor must preserve; they are NOT the red-first proof for this task, the Point A/B cases are). The `negative` case may already pass (plain `Error` already routes to `TerminalFailure`); that's fine — it is a guard against over-catching.

- [ ] **Step 4: Add the three helpers (`loadShowAvailability` + `renderPickerRepick` + `renderRacedCrewMiss`)**

In `page.tsx`, add module-scope helpers (near `loadRoster`). Import `PickerInterstitialBannerCode` type from `./_PickerInterstitial`; `createSupabaseServiceRoleClient` is already imported (used by `loadRoster`), and `notFound` is already imported from `next/navigation` (used by `archived`/`show_unavailable`):

```tsx
async function loadShowAvailability(showId: string): Promise<"available" | "unavailable"> {
  const supabase = createSupabaseServiceRoleClient();
  // not-subject-to-meta: page.tsx-local read; {data,error} + fail-closed; covered by route tests (mirrors loadRoster)
  const { data, error } = await supabase
    .from("shows")
    .select("published, archived")
    .eq("id", showId)
    .maybeSingle();
  if (error) throw new Error("show availability lookup failed");
  if (!data || data.archived === true || data.published !== true) return "unavailable";
  return "available";
}

async function renderPickerRepick(args: {
  showId: string; slug: string; shareToken: string; s: string | undefined;
  banner: PickerInterstitialBannerCode;
  staleCleanupHint: { expectedEpoch: number; expectedCrewMemberId: string } | null;
}): Promise<JSX.Element> {
  let roster;
  try {
    roster = await loadRoster(args.showId);
  } catch {
    return <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" retryHref={`/show/${args.slug}/${args.shareToken}`} />;
  }
  return (
    <PickerInterstitial
      slug={args.slug} shareToken={args.shareToken} showId={args.showId}
      roster={roster} banner={args.banner} staleCleanupHint={args.staleCleanupHint} s={args.s}
    />
  );
}

// CRITICAL: notFound() throws a Next navigation sentinel (NEXT_NOT_FOUND) — it MUST NOT sit inside a
// try/catch that would convert it to a TerminalFailure. The availability-read try/catch is scoped to
// the READ ONLY; notFound() and renderPickerRepick run OUTSIDE it, and callers invoke this helper with
// NO surrounding catch.
async function renderRacedCrewMiss(args: { showId: string; slug: string; shareToken: string; s: string | undefined }): Promise<JSX.Element> {
  let availability: "available" | "unavailable";
  try {
    availability = await loadShowAvailability(args.showId);
  } catch {
    // ONLY the infra read is caught here — fail-closed to TerminalFailure.
    return <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" retryHref={`/show/${args.slug}/${args.shareToken}`} />;
  }
  // Outside the catch: notFound() throws NEXT_NOT_FOUND and MUST propagate to Next.
  if (availability === "unavailable") notFound(); // show-deleted cascade → show_unavailable semantics (page.tsx:102-106)
  return renderPickerRepick({ ...args, banner: "PICKER_REMOVED_FROM_ROSTER_BANNER", staleCleanupHint: null });
}
```

- [ ] **Step 5: Refactor the stale-arm block to `renderPickerRepick`, then rewrite the `resolved` case (Point A/B wiring)**

Replace the `case "epoch_stale" | … | "identity_invalidated"` body (`:233-263`) with a call to the shared helper (this is what the Step-1 refactor-guards protect — the `staleCleanupHint` must survive the extraction):

```tsx
    case "epoch_stale":
    case "removed_from_roster":
    case "selection_reset":
    case "identity_invalidated":
      return renderPickerRepick({
        showId: result.showId, slug, shareToken, s: allowlistedS,
        banner: staleBannerFor(result.kind),
        staleCleanupHint: { expectedEpoch: result.expectedEpoch, expectedCrewMemberId: result.expectedCrewMemberId },
      });
```

Then rewrite the `resolved` case (`:152-189`) — note NO try/catch wraps `renderRacedCrewMiss` (it handles its own infra read; its `notFound()` must escape):

```tsx
    case "resolved": {
      const viewer: Viewer = { kind: "crew", crewMemberId: result.crewMemberId };
      let data;
      try {
        data = await getShowForViewer(result.showId, viewer);
      } catch (err) {
        // Point A: crew-row miss (raced removal OR show-delete cascade) → guided re-pick after
        // re-validating show availability (renderRacedCrewMiss owns its own infra catch + notFound()).
        // Any other error (infra, :317/:321) → TerminalFailure.
        if (err instanceof CrewMemberNotInShowError) {
          return renderRacedCrewMiss({ showId: result.showId, slug, shareToken, s: allowlistedS });
        }
        return <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" retryHref={`/show/${slug}/${shareToken}`} />;
      }
      // Point B: well-formed projection missing the resolved id → same guided re-pick (NO wrapping catch).
      if (Array.isArray(data.crewMembers) && !data.crewMembers.find((c) => c.id === result.crewMemberId)) {
        return renderRacedCrewMiss({ showId: result.showId, slug, shareToken, s: allowlistedS });
      }
      const crew = data.crewMembers?.find((c) => c.id === result.crewMemberId);
      return (
        <CrewShell
          data={data} viewer={viewer} showId={result.showId} rawSection={s}
          slug={slug} shareToken={shareToken}
          identityChip={crew ? { name: crew.name, role: crew.role, shareToken } : null}
        />
      );
    }
```

Add `CrewMemberNotInShowError` to the `@/lib/data/getShowForViewer` import.

- [ ] **Step 6: Run tests + typecheck + build**

Run: `pnpm vitest run tests/show/flow8Repick.test.tsx tests/show/resolvedArmCrewMembersGuard.test.tsx tests/show/pageSelectionResetBanner.test.ts && pnpm exec tsc --noEmit -p tsconfig.json && pnpm build`
Expected: all PASS — the RED Point A/B/cascade/infra/roster-fail cases now go green; the Step-1 stale-arm guards stay green (hint preserved); the pre-existing malformed-projection guard and selection-reset banner test stay green; tsc clean; `pnpm build` succeeds (Server Component action/prop wiring — RSC boundary check per the repo's build-before-push rule).

- [ ] **Step 7: Commit**

```bash
git add "app/show/[slug]/[shareToken]/page.tsx" tests/show/flow8Repick.test.tsx
git commit --no-verify -m "feat(crew-page): guided re-pick for unmatched-crew race — loadShowAvailability + renderPickerRepick + renderRacedCrewMiss (Point A/B + show-cascade disambiguation; stale arms reuse it)"
```

---

### Task 7: Transport regression pin (8.4 defensive) + warm-cache bound test

**Files:**
- Create: `tests/visibility/transportTileVisibleRegression.test.ts`
- Create: `tests/data/getShowForViewerCacheStaleness.test.ts` (or extend an existing `getShowForViewer.cache.test.ts` if the harness fits)

**Interfaces:** none new — tests over existing `transportTileVisible` (`lib/visibility/scopeTiles.ts:177`) and the cache behavior.

- [ ] **Step 1: Write the transport regression tests**

```ts
// tests/visibility/transportTileVisibleRegression.test.ts
import { describe, expect, test } from "vitest";
import { transportTileVisible } from "@/lib/visibility/scopeTiles";

const t = (over: Partial<any> = {}) => ({ driver_name: null, schedule: [], ...over } as any);

describe("transportTileVisible fuzzy-tolerance regression pin (8.4 defensive — audited hard-mis-parse NOT closed, BL-TRANSPORT-ID-RESOLUTION)", () => {
  test.each([
    ["first-name/prefix", "Doug", "Doug Larson"],
    ["legal-vs-nick surname", "Douglas Larson", "Doug Larson"],
    ["case/trim", "  doug larson ", "Doug Larson"],
  ])("driver %s → visible", (_label, driver, viewer) => {
    expect(transportTileVisible({ transportation: t({ driver_name: driver }), viewerName: viewer, isAdmin: false })).toBe(true);
  });

  test("assigned-names surname match → visible", () => {
    expect(transportTileVisible({ transportation: t({ schedule: [{ assigned_names: ["Bill Werner"] }] }), viewerName: "William Werner", isAdmin: false })).toBe(true);
  });

  test("negative controls", () => {
    expect(transportTileVisible({ transportation: t({ driver_name: "Jane Smith" }), viewerName: "Doug Larson", isAdmin: false })).toBe(false);
    expect(transportTileVisible({ transportation: t({ driver_name: "Doug" }), viewerName: "", isAdmin: false })).toBe(false);
    expect(transportTileVisible({ transportation: null, viewerName: "Doug", isAdmin: false })).toBe(false);
    expect(transportTileVisible({ transportation: t({}), viewerName: null, isAdmin: true })).toBe(true);
  });

  test("KNOWN GAP (BL-TRANSPORT-ID-RESOLUTION): a merged-cell overflow that shifts the surname token is NOT visible — documents the residual deferred to 8.3, does not assert closure. Verified against live namesRefer: 'Doug Larson Loadout' vs 'Doug Larson' → false (the multi-token rule compares last tokens 'loadout' vs 'larson').", () => {
    expect(transportTileVisible({ transportation: t({ driver_name: "Doug Larson Loadout" }), viewerName: "Doug Larson", isAdmin: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify (these pin CURRENT behavior; expect PASS immediately)**

Run: `pnpm vitest run tests/visibility/transportTileVisibleRegression.test.ts`
Expected: PASS (regression pin — no production change). If the known-gap case unexpectedly returns `true`, `namesRefer` is more tolerant than assumed; adjust the fixture to a genuinely non-matching garble and note it.

- [ ] **Step 3: Write the warm-cache bound test (8.2)**

Read `tests/data/getShowForViewer.cache.test.ts` first to reuse its cache-warming harness. Add a test asserting: a stale cache hit whose `crewMembers` still contains the resolved id resolves (via `resolveViewerContext`) to **that matched row's restrictions** — NOT the `{none}` whole-show limb — proving Point C's unmatched-id property is cache-independent. Do NOT assert the stale entitlement is otherwise "current" (documented out-of-scope residual, spec §4.1 point 4). If the existing cache harness cannot express this cleanly, assert the narrower unit fact via `resolveViewerContext` directly (matched id present → returns that row's restriction, never `{none}`), and add a comment citing spec §4.1 points 1+4.

- [ ] **Step 4: Run + commit**

Run: `pnpm vitest run tests/visibility/transportTileVisibleRegression.test.ts tests/data/getShowForViewerCacheStaleness.test.ts`
Expected: PASS.

```bash
git add tests/visibility/transportTileVisibleRegression.test.ts tests/data/getShowForViewerCacheStaleness.test.ts
git commit --no-verify -m "test(crew-page): transport fuzzy-tolerance regression pin (8.4 defensive) + 8.2 warm-cache bound"
```

---

### Task 8: full-suite gate + impeccable dual-gate

**Files:**
- Modify: `DEFERRED.md` (only if impeccable surfaces a deferred HIGH/CRITICAL)

(The `loadRoster` sanitize-boundary route test lives in Task 1, Step 5 — failing-first, per TDD invariant 1. This task is gates only.)

- [ ] **Step 1: Full-suite + quality gates**

Run:
```bash
pnpm vitest run
pnpm exec tsc --noEmit -p tsconfig.json
pnpm build
pnpm format:check
pnpm lint
```
Expected: all green. (Full suite per the repo's "scoped gates miss regressions" rule; `format:check` + `lint` because `--no-verify` bypassed the hook; `build` for the RSC boundary.)

- [ ] **Step 2: Impeccable dual-gate (invariant 8 — 8.1 touched `_PickerInterstitial.tsx`)**

Run `/impeccable critique` then `/impeccable audit` on the picker diff (`_PickerInterstitial.tsx`). Fix HIGH/CRITICAL inline, or record a `DEFERRED.md` entry with rationale. Findings + dispositions go in the milestone handoff §12.

- [ ] **Step 3: Commit (only if impeccable produced a DEFERRED.md disposition; otherwise no commit — the gates are verification, not changes)**

```bash
# only if DEFERRED.md changed:
git add DEFERRED.md
git commit --no-verify -m "docs(crew-page): impeccable dual-gate dispositions for the picker affordance diff"
```

---

## Self-review notes (author)

- **Spec coverage:** 8.1 sanitize (T1) + code (T2) + affordance both modes (T3) + boundary proof (T8); 8.2 Point C (T4) + Point A type (T5) + primary A/B + cascade + stale-arm refactor, all three helpers in one red-first task (T6, merged ex-T6/T7) + warm-cache bound (T7); 8.4 defensive pin + known-gap (T7); BACKLOG row (pre-added). Every §4/§5 item maps to a task.
- **Type consistency:** `CrewMemberNotInShowError` (T5) consumed in T6; `UnmatchedViewerError` (T4); `renderPickerRepick`/`loadShowAvailability`/`renderRacedCrewMiss` all defined and consumed within T6; `PICKER_NAME_NOT_LISTED` (T2) consumed in T3.
- **Verification-before-claim:** several tasks note "confirm the real `data-testid`/precondition before running" — those are live-code checks the implementer performs, not placeholders.
- **Meta/CI:** §12.4 lockstep (T2) + full-suite/tsc/build/format/lint (T8) + impeccable (T8).
