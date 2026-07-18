# CALLOUT-PREVIEW-ACTION-CUE-1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relabel the demoted `SectionFlagCallout` per-entry jump button from the passive "View details" to an actionability-aware, destination-naming label — "Fix in Parse warnings" only where the destination renders a fix control, else "Review in Parse warnings".

**Architecture:** A new pure predicate `warningOffersFix` (reusing the live `deriveUseRawControlState` + the role-token gate) decides per-warning fixability. The callout producer (`ShowReviewSurface`) tags each entry with an optional `offersFix` boolean; the presentational `SectionFlagCallout` picks the label from `variant` + `offersFix`. A parity meta-test pins the predicate to the two control boundaries' render gates.

**Tech Stack:** Next.js 16, React, TypeScript, Vitest + Testing Library (unit/component), Playwright (e2e). Spec: `docs/superpowers/specs/2026-07-18-callout-preview-action-cue.md`.

## Global Constraints

- **TDD per task:** failing test → minimal implementation → passing test → commit. Never implementation before its test.
- **Commit per task**, conventional-commits (`<type>(<scope>): <summary>`); `--no-verify` (shared lint-staged hook lives in the main checkout).
- **No em dash** in copy (DESIGN.md:328). Labels: `Fix in Parse warnings`, `Review in Parse warnings` (exact strings).
- **No raw error codes in UI** (invariant 5) — these are static button labels, compliant.
- **Invariant 8 (UI quality gate):** UI is touched → `/impeccable critique` AND `/impeccable audit` on the diff (Task 4) before the whole-diff cross-model review; P0/P1 fixed or deferred.
- **sr-only suffix** " for {title}" is preserved after every jump label (unique accessible name per warning). Test matchers use anchored prefix regex `/^(?:Fix|Review) in Parse warnings/`, never exact-string equality.
- **Meta-test inventory:** CREATES the `warningOffersFix` ↔ boundary parity meta-test (`tests/admin/warningFixAffordance.test.tsx`). No advisory-lock surface (`pg_advisory*` untouched) — topology N/A. No Supabase call boundary, admin_alert code, or §12.4 catalog row.

---

### Task 1: `warningOffersFix` predicate + unit + parity meta-test

**Files:**
- Create: `lib/admin/warningFixAffordance.ts`
- Test: `tests/admin/warningFixAffordance.test.tsx`

**Interfaces:**
- Consumes: `deriveUseRawControlState` (`components/admin/UseRawControl.tsx:65`), `ParseWarning` (`@/lib/parser/types`), `UseRawDecision` (`@/lib/sync/useRawOverlay`).
- Produces: `export function warningOffersFix(warning: Pick<ParseWarning, "code" | "resolution" | "roleToken">, decision: UseRawDecision | undefined): boolean`.

- [ ] **Step 1: Write the failing unit + parity test**

```tsx
// tests/admin/warningFixAffordance.test.tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { ParseWarning, UseRawResolution } from "@/lib/parser/types";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";
import { deriveUseRawControlState } from "@/components/admin/UseRawControl";
import { RoleRecognizeControlBoundary } from "@/components/admin/RoleRecognizeControlBoundary";
import { warningOffersFix } from "@/lib/admin/warningFixAffordance";

// RoleRecognizeControlBoundary imports three "use server" action modules at
// module level; mock them so jsdom never touches server-only deps. We only
// exercise its self-hide (null) gate, which runs BEFORE any action is called.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/admin/show/[slug]/_actions/roleToken", () => ({ mapRoleToken: vi.fn() }));
vi.mock("@/app/admin/onboarding/_actions/roleTokenStaged", () => ({ mapRoleTokenStaged: vi.fn() }));
vi.mock("@/app/admin/settings/_actions/roleTokenMappings", () => ({ updateRoleTokenMapping: vi.fn() }));

const IN_SCOPE = [
  "ROOM_HEADER_SPLIT_AMBIGUOUS",
  "HOTEL_GUEST_SPLIT_AMBIGUOUS",
  "DATE_ORDER_SUGGESTS_DMY",
] as const;

function resolvable(): Extract<UseRawResolution, { resolvable: true }> {
  return {
    resolvable: true,
    contentHash: "hash-1",
    parsed: { kind: "rooms", name: "Grand Ballroom", dimensions: "40x60", floor: "2" },
    replacement: { kind: "rooms", name: "Salon A", dimensions: null, floor: null },
  };
}

describe("warningOffersFix — role branch", () => {
  it("true for UNKNOWN_ROLE_TOKEN with a non-empty token", () => {
    expect(
      warningOffersFix({ code: "UNKNOWN_ROLE_TOKEN", roleToken: "STROBE_TECH" } as ParseWarning, undefined),
    ).toBe(true);
  });
  it("false for UNKNOWN_ROLE_TOKEN with empty / whitespace token", () => {
    for (const roleToken of ["", "   "]) {
      expect(
        warningOffersFix({ code: "UNKNOWN_ROLE_TOKEN", roleToken } as ParseWarning, undefined),
      ).toBe(false);
    }
  });
});

describe("warningOffersFix — use-raw branch", () => {
  it("true for each in-scope resolvable code (no decision, and with a persisted decision)", () => {
    const decided: UseRawDecision = { code: "ROOM_HEADER_SPLIT_AMBIGUOUS", contentHash: "hash-1", target: { kind: "rooms" }, preference: "raw", applied: true, decidedAt: "2026-01-01T00:00:00Z", decidedBy: "tester" };
    for (const code of IN_SCOPE) {
      const w = { code, resolution: resolvable() } as ParseWarning;
      expect(warningOffersFix(w, undefined)).toBe(true);
      expect(warningOffersFix(w, code === decided.code ? decided : undefined)).toBe(true);
    }
  });
  it("false for in-scope but legacy-unavailable (no resolution) and disabled (resolvable:false)", () => {
    for (const code of IN_SCOPE) {
      expect(warningOffersFix({ code } as ParseWarning, undefined)).toBe(false); // no resolution
      expect(
        warningOffersFix({ code, resolution: { resolvable: false, reason: "empty-raw" } } as ParseWarning, undefined),
      ).toBe(false);
    }
  });
  it("false for out-of-scope code (SOME_CODE)", () => {
    expect(warningOffersFix({ code: "SOME_CODE" } as ParseWarning, undefined)).toBe(false);
  });
});

// Parity meta-test: predicate's use-raw verdict stays in lockstep with the
// control's actual render gate (deriveUseRawControlState interactive states).
describe("warningOffersFix ↔ deriveUseRawControlState parity (drift guard)", () => {
  const NON_INTERACTIVE = new Set([null, "legacy-unavailable", "disabled"]);
  it("use-raw branch equals 'derive state is interactive' across code × resolution × decision", () => {
    const codes = [...IN_SCOPE, "SOME_CODE"];
    const resolutions: (UseRawResolution | undefined)[] = [
      undefined,
      { resolvable: false, reason: "empty-raw" },
      resolvable(),
    ];
    const decisions: (UseRawDecision | undefined)[] = [
      undefined,
      { code: "ROOM_HEADER_SPLIT_AMBIGUOUS", contentHash: "hash-1", target: { kind: "rooms" }, preference: "raw", applied: true, decidedAt: "2026-01-01T00:00:00Z", decidedBy: "tester" },
    ];
    for (const code of codes)
      for (const resolution of resolutions)
        for (const decision of decisions) {
          const w = { code, ...(resolution ? { resolution } : {}) } as ParseWarning;
          const st = deriveUseRawControlState(w, decision, false);
          const interactive = !NON_INTERACTIVE.has(st);
          // role branch does not apply to these codes, so predicate === use-raw verdict
          expect(warningOffersFix(w, decision)).toBe(interactive);
        }
  });
});

// Parity meta-test (role branch): predicate's role verdict stays in lockstep
// with RoleRecognizeControlBoundary's LIVE self-hide gate — rendered, not
// re-derived (a re-derivation would be tautological). Spec §9.
describe("warningOffersFix ↔ RoleRecognizeControlBoundary parity (drift guard)", () => {
  const cases: { label: string; warning: ParseWarning }[] = [
    { label: "non-role code", warning: { severity: "warn", code: "SOME_CODE", message: "", blockRef: { kind: "crew" } } },
    { label: "role code, absent token", warning: { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "", blockRef: { kind: "crew" } } },
    { label: "role code, empty token", warning: { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", roleToken: "", message: "", blockRef: { kind: "crew" } } },
    { label: "role code, whitespace token", warning: { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", roleToken: "   ", message: "", blockRef: { kind: "crew" } } },
    { label: "role code, real token", warning: { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", roleToken: "STROBE_TECH", message: "", blockRef: { kind: "crew" } } },
  ];
  it.each(cases)("$label: predicate role verdict === boundary renders non-null", ({ warning }) => {
    const { container } = render(
      <RoleRecognizeControlBoundary surface="wizard" wizardSessionId="s" driveFileId="d" warning={warning} />,
    );
    const boundaryRenders = container.firstChild !== null;
    // For a non-role code the use-raw branch is also false (SOME_CODE out of scope),
    // so warningOffersFix === boundaryRenders holds for every case here.
    expect(warningOffersFix(warning, undefined)).toBe(boundaryRenders);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/ericweiss/fxav-worktrees/callout-cue && pnpm vitest run tests/admin/warningFixAffordance.test.tsx`
Expected: FAIL — `warningOffersFix` not exported / module missing.

- [ ] **Step 3: Write the minimal implementation**

```ts
// lib/admin/warningFixAffordance.ts
import { deriveUseRawControlState } from "@/components/admin/UseRawControl";
import type { ParseWarning } from "@/lib/parser/types";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";

/**
 * Whether the SOLE actionable site (WarningsBreakdown) would render an
 * interactive fix control for this warning — used to pick the callout jump
 * label ("Fix in Parse warnings" vs "Review in Parse warnings").
 *
 * Drift-proof: the use-raw branch reuses the SAME `deriveUseRawControlState`
 * the control renders from (no duplicated IN_SCOPE set); the role branch
 * mirrors `RoleRecognizeControlBoundary`'s `token.length === 0 → null` gate.
 * `tests/admin/warningFixAffordance.test.tsx` pins both to the live gates.
 */
export function warningOffersFix(
  warning: Pick<ParseWarning, "code" | "resolution" | "roleToken">,
  decision: UseRawDecision | undefined,
): boolean {
  if (warning.code === "UNKNOWN_ROLE_TOKEN" && (warning.roleToken ?? "").trim().length > 0) {
    return true;
  }
  const state = deriveUseRawControlState(warning, decision, false);
  return state !== null && state !== "legacy-unavailable" && state !== "disabled";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /Users/ericweiss/fxav-worktrees/callout-cue && pnpm vitest run tests/admin/warningFixAffordance.test.tsx`
Expected: PASS (all describes). If the `UseRawDecision`/`UseRawResolution` shapes differ from the fixtures above, adjust the fixtures to the live types (`@/lib/sync/useRawOverlay`, `@/lib/parser/types`) — do NOT loosen the predicate.

- [ ] **Step 5: Typecheck the new module + test**

Run: `cd /Users/ericweiss/fxav-worktrees/callout-cue && pnpm typecheck`
Expected: no new errors. Fix fixture typings if any surface (the `as ParseWarning`/`as unknown as` casts are deliberate for malformed-shape cases).

- [ ] **Step 6: Commit**

```bash
git add lib/admin/warningFixAffordance.ts tests/admin/warningFixAffordance.test.tsx
git commit --no-verify -m "feat(admin): warningOffersFix predicate + boundary parity meta-test"
```

---

### Task 2: Actionability-aware label — producer tag + presentational picker + modal tests

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (entry type `:463`, `SectionFlagCallout` prop `:533` + label `:588`, comments `:540,593`)
- Modify: `components/admin/review/ShowReviewSurface.tsx` (`:835` producer tag; imports)
- Test: `tests/components/admin/wizard/Step3ReviewModal.test.tsx` (locator `:1882,2377,2393,2491,2534` + title `:2480` + NEW semantic tests)

**Interfaces:**
- Consumes: `warningOffersFix` (Task 1); `findUseRawDecision` (`step3ReviewSections.tsx:506`); `isStaged` (`components/admin/review/sectionData.ts:168`).
- Produces: entry type `{ warning: ParseWarning; index: number; offersFix?: boolean }`; jump label string `Fix in Parse warnings` | `Review in Parse warnings`.

- [ ] **Step 1: Write the failing semantic tests**

Add to `tests/components/admin/wizard/Step3ReviewModal.test.tsx` (near the Task-9 callout describe). Fixtures derive the label from real actionability through the producer:

```ts
describe("Step3ReviewModal — callout jump label (CALLOUT-PREVIEW-ACTION-CUE-1)", () => {
  function roleWarning(kind: string): ParseWarning {
    return { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "", blockRef: { kind }, roleToken: "STROBE_TECH" };
  }
  function calloutTid(sectionId: string): string {
    return `wizard-step3-card-${DFID}-section-${sectionId}-flag-callout`;
  }

  test("flagged + fixable (UNKNOWN_ROLE_TOKEN + token) → 'Fix in Parse warnings'", () => {
    const d = sectionData({ warnings: [roleWarning("crew")] });
    const { q } = renderModal({ d });
    const callout = q.getByTestId(calloutTid("crew"));
    expect(within(callout).getByRole("button", { name: /^Fix in Parse warnings\b/ })).toBeTruthy();
    expect(within(callout).queryByRole("button", { name: /^Review in Parse warnings\b/ })).toBeNull();
  });

  test("flagged + NON-fixable (SOME_CODE) → 'Review in Parse warnings' (no blanket Fix)", () => {
    const d = sectionData({ warnings: [warning("crew")] });
    const { q } = renderModal({ d });
    const callout = q.getByTestId(calloutTid("crew"));
    expect(within(callout).getByRole("button", { name: /^Review in Parse warnings\b/ })).toBeTruthy();
    expect(within(callout).queryByRole("button", { name: /^Fix in Parse warnings\b/ })).toBeNull();
  });

  test("judgment variant → 'Review in Parse warnings' (calm, even if technically fixable)", () => {
    const d = sectionData({ warnings: [judgmentWarning("rooms")] });
    const { q } = renderModal({ d });
    const callout = q.getByTestId(calloutTid("rooms"));
    expect(within(callout).getByRole("button", { name: /^Review in Parse warnings\b/ })).toBeTruthy();
  });

  test("visible label excludes the sr-only suffix", () => {
    const d = sectionData({ warnings: [roleWarning("crew")] });
    const { q } = renderModal({ d });
    const btn = within(q.getByTestId(calloutTid("crew"))).getByRole("button", { name: /^Fix in Parse warnings\b/ });
    const clone = btn.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".sr-only").forEach((n) => n.remove());
    expect(clone.textContent).toBe("Fix in Parse warnings");
  });
});
```

- [ ] **Step 2: Update the existing locator matchers in the same file**

Replace every `{ name: /View details/ }` at `:1882,2377,2393,2491,2534` with `{ name: /^(?:Fix|Review) in Parse warnings/ }`, and reword the test title at `:2480` from "jump: click 'View details' →" to "jump: click the callout jump button →". These fixtures are `warning("crew")`/`crewWarnings` (SOME_CODE, non-fixable) so they render `Review`; the anchored `(?:Fix|Review)` locator is actionability-agnostic and future-proof.

- [ ] **Step 3: Run to verify the new + edited tests fail**

Run: `cd /Users/ericweiss/fxav-worktrees/callout-cue && pnpm vitest run tests/components/admin/wizard/Step3ReviewModal.test.tsx`
Expected: FAIL — button still labelled "View details"; new `/^Fix.../` and `/^Review.../` matchers find nothing.

- [ ] **Step 4: Widen the entry type (optional `offersFix`)**

In `components/admin/wizard/step3ReviewSections.tsx`, the chrome `calloutEntries` type (`:463`) and the `SectionFlagCallout` `entries` prop (`:533`):

```ts
// :463 (Step3SectionChrome)
calloutEntries?: readonly { warning: ParseWarning; index: number; offersFix?: boolean }[];
```
```ts
// :533 (SectionFlagCallout props)
entries: readonly { warning: ParseWarning; index: number; offersFix?: boolean }[];
```

- [ ] **Step 5: Replace the label with the actionability-aware picker**

In `SectionFlagCallout`, destructure `offersFix` in the `shown.map` and pick the label. Replace the button text at `:588`:

```tsx
{shown.map(({ warning, index, offersFix }, k) => {
  const title = reviewWarningTitle(warning);
  const fieldLabel = fieldLabelFor(warning.blockRef?.field);
  // CALLOUT-PREVIEW-ACTION-CUE-1: name the action + destination. "Fix" only
  // where the sole actionable site (WarningsBreakdown) renders a fix control
  // for THIS warning; judgment stays calm ("Review") by contract.
  const jumpLabel =
    isJudgment || offersFix !== true ? "Review in Parse warnings" : "Fix in Parse warnings";
  return (
    /* …unchanged wrapper… */
      <button
        type="button"
        onClick={() => onJump(index)}
        className="inline-flex min-h-tap-min items-center font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        {jumpLabel}<span className="sr-only"> for {title}</span>
      </button>
  );
})}
```

Also update the two stale comments at `:540` and `:593` to say the callout is a preview whose jump reads "Fix/Review in Parse warnings" (not "View details").

- [ ] **Step 6: Tag entries with `offersFix` at the producer**

In `components/admin/review/ShowReviewSurface.tsx`, add imports and map the entries at `:835`:

```ts
// imports
import { warningOffersFix } from "@/lib/admin/warningFixAffordance";
import { findUseRawDecision } from "@/components/admin/wizard/step3ReviewSections";
```
```tsx
// :835 — inside the isStaged(data)-gated spread
...(s.id !== "warnings" && bySection.has(s.id) && isStaged(data)
  ? {
      calloutEntries: bySection.get(s.id)!.map((e) => ({
        ...e,
        offersFix: warningOffersFix(e.warning, findUseRawDecision(e.warning, data.useRawDecisions)),
      })),
      onJumpToWarning: jumpToWarning,
    }
  : {}),
```

`data.useRawDecisions` is available because the spread is gated on `isStaged(data)` (narrows `data` to `StagedSectionData`). If TS does not narrow inside the object literal, bind `const decisions = isStaged(data) ? data.useRawDecisions : [];` above and use `decisions`.

- [ ] **Step 7: Run the modal tests to green**

Run: `cd /Users/ericweiss/fxav-worktrees/callout-cue && pnpm vitest run tests/components/admin/wizard/Step3ReviewModal.test.tsx`
Expected: PASS (new semantic + updated locator tests).

- [ ] **Step 8: Typecheck**

Run: `cd /Users/ericweiss/fxav-worktrees/callout-cue && pnpm typecheck`
Expected: no new errors (esp. the producer narrowing + the optional `offersFix`).

- [ ] **Step 9: Commit**

```bash
git add components/admin/wizard/step3ReviewSections.tsx components/admin/review/ShowReviewSurface.tsx tests/components/admin/wizard/Step3ReviewModal.test.tsx
git commit --no-verify -m "feat(crew-page): actionability-aware callout jump label"
```

---

### Task 3: Migrate remaining "View details" call sites + repo-wide sweep gate

**Files:**
- Modify: `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` (`:885,917,946`)
- Modify: `tests/components/admin/wizard/warningsBreakdownControls.test.tsx` (`:325,329,419,423`)
- Modify: `tests/e2e/step3-review-modal.interactions.spec.ts` (`:607,613,619`)
- Modify: `tests/e2e/step3-review-modal.layout.spec.ts` (`:39,411,420`)
- Modify: `tests/e2e/_step3ReviewModalHarness.tsx` (`:53,54` comments)

**Interfaces:** none new — this task only migrates locators/assertions/comments to the labels produced by Task 2.

- [ ] **Step 1: Update the component-test locators**

- `step3ReviewModal.transitions.test.tsx:885,917,946` — `{ name: /View details/ }` → `{ name: /^(?:Fix|Review) in Parse warnings/ }`.
- `warningsBreakdownControls.test.tsx:329,423` — `getByText(/View details/)` → `getByText(/^Review in Parse warnings/)` (these fixtures omit `offersFix` → `Review`). Update the adjacent comments `:325,419` accordingly.

- [ ] **Step 2: Update the e2e specs**

- `interactions.spec.ts:607` test title "callout View details jumps…" → "callout jump button jumps…"; `:613` comment "3 'View details' rows" → "3 'Review in Parse warnings' rows" (harness code `HARNESS_CREW_WARNING` is non-fixable → `Review`); `:619` `getByRole("button", { name: /View details/ })` → `{ name: /^(?:Fix|Review) in Parse warnings/ }`.
- `layout.spec.ts:39,411` comments; `:420` band label `"callout View details"` → `"callout jump"` (keep it a stable band identifier, no label text).
- `_step3ReviewModalHarness.tsx:53,54` doc-comments → the new label wording.

- [ ] **Step 3: Run the affected component suites**

Run: `cd /Users/ericweiss/fxav-worktrees/callout-cue && pnpm vitest run tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx tests/components/admin/wizard/warningsBreakdownControls.test.tsx`
Expected: PASS.

- [ ] **Step 4: Run the e2e specs (env-bound; run explicitly)**

Run: `cd /Users/ericweiss/fxav-worktrees/callout-cue && pnpm test:e2e step3-review-modal.interactions step3-review-modal.layout` (or the repo's canonical Playwright invocation — check `package.json` scripts; e2e is excluded from `pnpm test`).
Expected: PASS. If the runner name differs, use the documented e2e command; do not skip — these assert the live label.

- [ ] **Step 5: Repo-wide sweep gate (must be zero)**

Run: `cd /Users/ericweiss/fxav-worktrees/callout-cue && rg "View details" components/ app/ tests/`
Expected: **no output** (zero hits). Docs are deliberately excluded (historical references in specs/DEFERRED are intentional).

- [ ] **Step 6: Commit**

```bash
git add tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx tests/components/admin/wizard/warningsBreakdownControls.test.tsx tests/e2e/step3-review-modal.interactions.spec.ts tests/e2e/step3-review-modal.layout.spec.ts tests/e2e/_step3ReviewModalHarness.tsx
git commit --no-verify -m "test(crew-page): migrate callout jump-label call sites off 'View details'"
```

---

### Task 4: UI quality gate (impeccable dual-gate, invariant 8)

**Files:** none (evaluation gate). The affected UI surface is `SectionFlagCallout` in `components/admin/wizard/step3ReviewSections.tsx`.

- [ ] **Step 1: Run `/impeccable critique`** on the diff, following the v3 setup gates (`context.mjs` load: PRODUCT.md + DESIGN.md → register reference read). Focus: does the new label read as action-forward without over-alarming the calm judgment tone; is "Fix" only shown where a fix exists (visibility-of-status, the exact heuristic that filed this item at 2/4).
- [ ] **Step 2: Run `/impeccable audit`** on the same diff.
- [ ] **Step 3:** Record findings + dispositions in the milestone handoff/notes. Fix any P0/P1; defer P2/P3 via `DEFERRED.md` with a trigger. Do NOT proceed to close-out with an open P0/P1.
- [ ] **Step 4: Commit** any impeccable-driven fixes (`fix(crew-page): …`), or note "no changes — critique + audit clean" if none.

---

### Task 5: Close-out — DEFERRED reconcile + full verification

**Files:**
- Modify: `DEFERRED.md` (remove the CALLOUT-PREVIEW-ACTION-CUE-1 entry `:13-17`)
- Modify: `DEFERRED-archive.md` (append the resolved entry with provenance)
- Modify: `BACKLOG.md` (reconcile the resolved twin `BL-USE-RAW-CALLOUT-PREVIEW-DEMOTION` follow-on reference if present)

- [ ] **Step 1: Move the DEFERRED entry to the archive**

Cut the `### CALLOUT-PREVIEW-ACTION-CUE-1 …` block from `DEFERRED.md` and paste into `DEFERRED-archive.md` with a resolution line: `✅ RESOLVED 2026-07-18 — feat/callout-preview-action-cue (spec + plan 2026-07-18-callout-preview-action-cue). Variant+actionability label: flagged+offersFix→"Fix in Parse warnings", else/judgment→"Review in Parse warnings". warningOffersFix predicate + parity meta-test.` Grep `BACKLOG.md` for `BL-USE-RAW-CALLOUT-PREVIEW-DEMOTION` and note this follow-on as resolved (do not fabricate a BL id — verify it exists first).

- [ ] **Step 2: Full pre-push verification (green ≠ green — run all gates)**

Run each; all must pass:
```bash
cd /Users/ericweiss/fxav-worktrees/callout-cue
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test          # full unit/component suite (NOT scoped) — catches cross-file regressions
```
Then the env-bound/e2e suites excluded from `pnpm test` (the two specs from Task 3 at minimum). Report the actual output of each; if any fails, fix before proceeding.

- [ ] **Step 3: Commit close-out**

```bash
git add DEFERRED.md DEFERRED-archive.md BACKLOG.md
git commit --no-verify -m "docs(plan): close CALLOUT-PREVIEW-ACTION-CUE-1"
```

---

## Post-plan (ship pipeline, not TDD tasks)

- **Whole-diff cross-model adversarial review** (Codex, fresh-eyes, REVIEWER ONLY) → APPROVE; triage findings via deferral discipline.
- **Push → real CI green** (not just local) → `gh pr merge --merge` → fast-forward local `main`; verify `git rev-list --left-right --count main...origin/main` == `0  0`.

## Self-Review (completed inline)

- **Spec coverage:** §2/§2.2/§2.3 → Tasks 1-2; §4 guards → Task 2 (optional/undefined→Review) + Task 1 (decision-undefined→still Fix); §7 test matrix → Tasks 1-3; §8 files → Tasks 1-5; §9 meta-test → Task 1; invariant 8 → Task 4; close-out → Task 5. No gaps.
- **Layout/transition tasks:** spec §5/§6 declare NO dimensional or animation change (text swap inside an existing `min-h-tap-min` button). The existing e2e `layout.spec.ts` band-sweep already asserts the callout button's geometry and is re-run in Task 3; no new browser layout task is warranted. Stated explicitly per the writing-plans additions.
- **Anti-tautology:** semantic tests (Task 2) drive real actionability THROUGH the producer (`renderModal` → `ShowReviewSurface`), so a producer that fails to set `offersFix` fails the `Fix` test; the parity meta-test (Task 1) catches boundary drift. Fixtures derive labels from code taxonomy, not hardcoded.
- **Placeholder scan:** no TBD/TODO; every code step shows real code.
- **Type consistency:** `warningOffersFix` signature, `offersFix?: boolean` entry field, and the label strings are identical across Tasks 1-3.
