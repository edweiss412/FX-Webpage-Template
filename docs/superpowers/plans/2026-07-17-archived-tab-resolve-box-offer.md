# Archived-tab Offer in the Step-3 Resolve Box — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the archived-tab pull-sheet accept offer inside the Step-3 "Resolve before publishing" box, and make that box appear whenever a pending archived-tab decision exists.

**Architecture:** Extract the existing archived-tab offer cluster (`ArchivedTabOffer`, `ArchivedTabIncludedNote`, the `postPullSheetOverride` helper, its copy/classname constants) plus a new pure `deriveArchivedOffers` from `step3ReviewSections.tsx` into a shared client module `components/admin/wizard/archivedTabOffer.tsx`. `PackListBreakdown` re-imports them (behavior unchanged). `Step3ReviewModal` imports the offer + derivation, decouples the box render gate from `resolution`, and renders the offer with `showDismiss={false}`. No server/DB/route change — reuses the existing `/api/admin/onboarding/pull-sheet-override` route.

**Tech Stack:** Next.js 16 (App Router, client components), React, Vitest + Testing Library (jsdom), Tailwind v4.

Spec: `docs/superpowers/specs/2026-07-17-archived-tab-resolve-box-offer.md` (Codex-APPROVED, 3 rounds).

## Global Constraints

- **UI surface → invariant 8 (impeccable dual-gate).** `/impeccable critique` AND `/impeccable audit` on the diff before whole-diff review; P0/P1 fixed or `DEFERRED.md`. UI is Opus-owned.
- **No raw error codes in UI (invariant 5).** Reuse the existing `ARCHIVED_TAB_ERROR` fallback copy verbatim; no new `§12.4` code, no catalog fan-out.
- **No new mutation surface (invariant 10 N/A).** Reuse the existing, already-instrumented `pull-sheet-override` route. Do not add a route handler or `"use server"` action.
- **Parity invariant.** The box's offer set MUST equal Pack-list's — both call the one extracted `deriveArchivedOffers`. Never fork the derivation.
- **DESIGN.md copy rules.** No em dashes in user copy (existing components already comply; do not introduce any).
- **Commit per task**, conventional-commits (`<type>(<scope>): <summary>`), `--no-verify` (shared hooks live in the main checkout).

## Meta-test inventory (declared)

- **CREATES / EXTENDS:** none. This is component render-wiring + a pure-function extraction. No registry (auth boundary, admin-alert catalog, advisory-lock topology, no-inline-email, mutation-surface observability) is touched.
- **Verified non-interference (pre-draft):** `tests/components/admin/wizard/_metaStep3FreezeContract.test.ts` scans only `<RescanSheetButton>` JSX (no archived offer added → unaffected). `tests/styles/_metaBgAccentInventory.test.ts` scans the exact `bg-accent` token; the offer uses `bg-info-bg`/`bg-warning-bg` and this change adds no `bg-accent`, so `Step3ReviewModal.tsx` occurrences 0,1 are unchanged.

## File Structure

- **Create** `components/admin/wizard/archivedTabOffer.tsx` — `"use client"`. Owns: `ARCHIVED_TAB_BTN`, `ARCHIVED_TAB_GHOST_BTN`, `ARCHIVED_TAB_ERROR`, `postPullSheetOverride`, `ArchivedTabOffer` (now with a discriminated `showDismiss` prop + optional `testId`), `ArchivedTabIncludedNote`, and the new pure `deriveArchivedOffers`.
- **Modify** `components/admin/wizard/step3ReviewSections.tsx` — delete the moved cluster; import from the new module; `PackListBreakdown` uses `deriveArchivedOffers` for its `includedTab`/`offers`.
- **Modify** `components/admin/wizard/Step3ReviewModal.tsx` — box render gate `resolution || hasPendingArchivedOffer`; render `deriveArchivedOffers(...).offers` with `showDismiss={false}` + resolution-scoped `testId`; footer stays `resolution`-gated.
- **Tests**: `tests/components/admin/wizard/archivedTabOffer.derive.test.ts` (new, pure fn); `tests/components/admin/wizard/Step3ReviewModalResolution.test.tsx` (extend — box offer render/behavior); `tests/components/admin/wizard/packListBreakdownStates.test.tsx` (must stay green — regression).

---

### Task 1: `deriveArchivedOffers` pure function (new module skeleton)

**Files:**
- Create: `components/admin/wizard/archivedTabOffer.tsx`
- Test: `tests/components/admin/wizard/archivedTabOffer.derive.test.ts`

**Interfaces:**
- Produces: `deriveArchivedOffers(tabs: ArchivedPullSheetTab[], staged: boolean): { overrideActive: boolean; includedTab: ArchivedPullSheetTab | null; offers: ArchivedPullSheetTab[] }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/components/admin/wizard/archivedTabOffer.derive.test.ts
import { describe, expect, it } from "vitest";
import { deriveArchivedOffers } from "@/components/admin/wizard/archivedTabOffer";
import type { ArchivedPullSheetTab } from "@/lib/drive/exportSheetToMarkdown";

const tab = (over: Partial<ArchivedPullSheetTab> = {}): ArchivedPullSheetTab => ({
  tabName: "OLD gear",
  headerPreviews: ["CASE A"],
  fingerprint: "fp1",
  included: false,
  contentChangedSinceAccept: false,
  ...over,
});

describe("deriveArchivedOffers", () => {
  it("offers every non-included tab when staged and no override active", () => {
    const t1 = tab({ tabName: "OLD gear" });
    const t2 = tab({ tabName: "OLD gear 2", fingerprint: "fp2" });
    const r = deriveArchivedOffers([t1, t2], true);
    expect(r.overrideActive).toBe(false);
    expect(r.includedTab).toBeNull();
    expect(r.offers).toEqual([t1, t2]);
  });

  it("suppresses all offers when any tab is included (single-override contract)", () => {
    const inc = tab({ tabName: "OLD gear", included: true });
    const pend = tab({ tabName: "OLD gear 2", fingerprint: "fp2" });
    const r = deriveArchivedOffers([inc, pend], true);
    expect(r.overrideActive).toBe(true);
    expect(r.includedTab).toBe(inc);
    expect(r.offers).toEqual([]);
  });

  it("returns no offers and no includedTab when not staged", () => {
    const r = deriveArchivedOffers([tab({ included: true }), tab()], false);
    expect(r.includedTab).toBeNull();
    expect(r.offers).toEqual([]);
  });

  it("empty tabs → empty offers", () => {
    expect(deriveArchivedOffers([], true).offers).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ericweiss/fxav-wt-archived-tab-resolve-box && pnpm vitest run tests/components/admin/wizard/archivedTabOffer.derive.test.ts`
Expected: FAIL — cannot resolve `@/components/admin/wizard/archivedTabOffer`.

- [ ] **Step 3: Create the module with the pure function**

```tsx
// components/admin/wizard/archivedTabOffer.tsx
"use client";

import type { ArchivedPullSheetTab } from "@/lib/drive/exportSheetToMarkdown";

/**
 * Pure S-state derivation for archived-tab pull-sheet offers (spec §4.2), the
 * SINGLE source shared by PackListBreakdown and the Step-3 Resolve box. Mirrors
 * the former inline `step3ReviewSections.tsx` derivation verbatim so both
 * surfaces show exactly the same offer set (parity invariant).
 *
 *  - overrideActive: some tab is already included (an active override).
 *  - includedTab: that included tab (staged only), else null.
 *  - offers: non-included tabs when staged AND no override active; the active
 *    override suppresses all offers (only one override at a time, RPC-enforced).
 */
export function deriveArchivedOffers(
  tabs: ArchivedPullSheetTab[],
  staged: boolean,
): { overrideActive: boolean; includedTab: ArchivedPullSheetTab | null; offers: ArchivedPullSheetTab[] } {
  const overrideActive = tabs.some((t) => t.included);
  const includedTab = staged ? (tabs.find((t) => t.included) ?? null) : null;
  const offers = staged && !overrideActive ? tabs.filter((t) => !t.included) : [];
  return { overrideActive, includedTab, offers };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/admin/wizard/archivedTabOffer.derive.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/admin/wizard/archivedTabOffer.tsx tests/components/admin/wizard/archivedTabOffer.derive.test.ts
git commit --no-verify -m "feat(admin): add deriveArchivedOffers pure helper for archived-tab offers"
```

---

### Task 2: Move the offer cluster into the module; add `showDismiss`; rewire Pack-list

**Files:**
- Modify: `components/admin/wizard/archivedTabOffer.tsx` (add the moved cluster)
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (delete cluster lines `2085-2279`; import from module; `PackListBreakdown` uses `deriveArchivedOffers`)
- Test: `tests/components/admin/wizard/packListBreakdownStates.test.tsx` (regression — must stay green)

**Interfaces:**
- Produces:
  - `ArchivedTabOffer(props)` where `props = { dfid: string | null; wizardSessionId: string; tab: ArchivedPullSheetTab; testId?: string } & ({ showDismiss?: true; onDismissFocus: () => void } | { showDismiss: false; onDismissFocus?: never })`. Default `showDismiss` is `true` (renders "Keep skipped"); `false` renders accept-only. `testId` defaults to `pack-list-archived-offer-${dfid}-${tab.tabName}`.
  - `ArchivedTabIncludedNote({ dfid, wizardSessionId, tab })` — unchanged behavior.
  - `postPullSheetOverride(body): Promise<{ ok: boolean; refresh: boolean }>` — unchanged.

- [ ] **Step 1: Write the failing regression test guard (parity of the `showDismiss` default)**

Add to `tests/components/admin/wizard/packListBreakdownStates.test.tsx` a test asserting the Pack-list offer still renders "Keep skipped" (proving the default `showDismiss` stays `true` after extraction). If the file already asserts this, extend the nearest describe:

```tsx
import { render, screen } from "@testing-library/react";
// ...existing imports/fixtures for PackListBreakdown with one non-included archived tab...

it("pack-list offer keeps its 'Keep skipped' dismiss (default showDismiss)", () => {
  render(/* <PackListBreakdown ... one pending archived tab, staged /> */);
  expect(screen.getByRole("button", { name: "Keep skipped" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Use this show’s gear" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it passes today (pre-move baseline) then will be re-run after the move**

Run: `pnpm vitest run tests/components/admin/wizard/packListBreakdownStates.test.tsx`
Expected: PASS now (behavior exists inline). This is the regression anchor for the move.

- [ ] **Step 3: Move the cluster into `archivedTabOffer.tsx`**

Append to `components/admin/wizard/archivedTabOffer.tsx` (below `deriveArchivedOffers`), moving verbatim from `step3ReviewSections.tsx:2085-2279`, with the two prop changes on `ArchivedTabOffer`:

```tsx
import { useRouter } from "next/navigation";
import { useState } from "react";
```

(Add these imports at the top of the module, after the type import.)

```tsx
const ARCHIVED_TAB_BTN =
  "inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
const ARCHIVED_TAB_GHOST_BTN =
  "inline-flex min-h-tap-min items-center justify-center rounded-sm border border-transparent px-4 text-sm font-medium text-text transition-colors duration-fast hover:text-text-strong disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

export async function postPullSheetOverride(
  body: unknown,
): Promise<{ ok: boolean; refresh: boolean }> {
  const response = await fetch("/api/admin/onboarding/pull-sheet-override", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, refresh: response.ok || response.status === 409 };
}

// not-subject:M5-D8 — friendly fallback copy, not a §12.4-coded message.
const ARCHIVED_TAB_ERROR =
  "That didn’t go through. Refresh and try again, or contact the developer if it keeps happening.";

type ArchivedTabOfferProps = {
  dfid: string | null;
  wizardSessionId: string;
  tab: ArchivedPullSheetTab;
  /** Distinct test id per surface (box vs pack-list). Defaults to the pack-list id. */
  testId?: string;
} & (
  | { showDismiss?: true; onDismissFocus: () => void }
  | { showDismiss: false; onDismissFocus?: never }
);

/** S2 offer / S4 re-confirm. Accept POSTs the row-state-CAS body (no active
 *  override → expectedOverrideSnapshot null). When `showDismiss` is false the
 *  local "Keep skipped" dismiss is omitted (the Resolve box uses this so its
 *  archived region is a pure function of server offers — spec §4.5b). */
export function ArchivedTabOffer(props: ArchivedTabOfferProps) {
  const { dfid, wizardSessionId, tab, testId } = props;
  const showDismiss = props.showDismiss !== false;
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (dismissed) return null;

  async function accept() {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const { refresh } = await postPullSheetOverride({
        driveFileId: dfid,
        wizardSessionId,
        tabName: tab.tabName,
        expectedFingerprint: tab.fingerprint,
        expectedOverrideSnapshot: null,
      });
      if (refresh) {
        router.refresh();
        return;
      }
      setError(ARCHIVED_TAB_ERROR);
    } catch {
      setError(ARCHIVED_TAB_ERROR);
    } finally {
      setPending(false);
    }
  }

  const changed = tab.contentChangedSinceAccept;
  const cardTone = changed
    ? "border-border-strong bg-warning-bg text-warning-text"
    : "border-border bg-info-bg text-text-strong";

  return (
    <div
      data-testid={testId ?? `pack-list-archived-offer-${dfid}-${tab.tabName}`}
      className={`flex flex-col gap-2 rounded-sm border p-3 text-sm ${cardTone}`}
    >
      <p className="font-medium">
        {changed
          ? `The archived tab ‘${tab.tabName}’ changed. Re-confirm before it publishes.`
          : `Found a pull sheet on archived tab ‘${tab.tabName}’.`}
      </p>
      <ul className="flex flex-col gap-0.5 text-xs">
        {tab.headerPreviews.map((preview, i) => (
          <li key={`${tab.tabName}-preview-${i}`} className="wrap-break-word">
            Case {i + 1} header reads ‘{preview.trim() ? preview : "(no header text)"}’.
          </li>
        ))}
      </ul>
      <p>If this is this show’s gear, include it; otherwise leave it skipped.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={accept}
          disabled={pending}
          aria-busy={pending}
          className={ARCHIVED_TAB_BTN}
        >
          {pending ? "Including…" : "Use this show’s gear"}
        </button>
        {showDismiss ? (
          <button
            type="button"
            onClick={() => {
              props.onDismissFocus?.();
              setDismissed(true);
            }}
            disabled={pending}
            className={ARCHIVED_TAB_GHOST_BTN}
          >
            Keep skipped
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="status" aria-live="polite">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** S3: the "included from archived tab" note + Revoke. */
export function ArchivedTabIncludedNote({
  dfid,
  wizardSessionId,
  tab,
}: {
  dfid: string | null;
  wizardSessionId: string;
  tab: ArchivedPullSheetTab;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const { refresh } = await postPullSheetOverride({
        driveFileId: dfid,
        wizardSessionId,
        tabName: null,
        expectedOverrideSnapshot: { tabName: tab.tabName, fingerprint: tab.fingerprint },
      });
      if (refresh) {
        router.refresh();
        return;
      }
      setError(ARCHIVED_TAB_ERROR);
    } catch {
      setError(ARCHIVED_TAB_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border bg-info-bg px-3 py-2 text-sm text-text-strong">
      <p className="wrap-break-word min-w-0 flex-1">Included from archived tab ‘{tab.tabName}’.</p>
      <button
        type="button"
        onClick={revoke}
        disabled={pending}
        aria-busy={pending}
        className={ARCHIVED_TAB_BTN}
      >
        {pending ? "Revoking…" : "Revoke"}
      </button>
      {error ? (
        <p role="status" aria-live="polite" className="basis-full">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Delete the moved code from `step3ReviewSections.tsx` and import from the module**

Remove `step3ReviewSections.tsx:2085-2279` (the two constants, `postPullSheetOverride`, `ARCHIVED_TAB_ERROR`, `ArchivedTabOffer`, `ArchivedTabIncludedNote`). Add near the top imports:

```tsx
import {
  ArchivedTabOffer,
  ArchivedTabIncludedNote,
  deriveArchivedOffers,
} from "@/components/admin/wizard/archivedTabOffer";
```

In `PackListBreakdown`, replace the two inline derivation lines with the shared helper:

```tsx
const { includedTab, offers } = deriveArchivedOffers(archivedPullSheetTabs, staged);
```

(Keep `const staged = wizardSessionId != null;` and `overrideActive` prop usage as-is; `overrideActive` is still passed in by the section def and used for the `includedTab && wizardSessionId != null` render guard. `deriveArchivedOffers` recomputes `overrideActive` internally but the render guard already uses the prop — leave that untouched to keep the diff minimal.)

If `ArchivedPullSheetTab` is now imported only for types elsewhere in the file, keep its existing import. Do NOT remove `useRouter`/`useState` imports from `step3ReviewSections.tsx` unless a post-edit `pnpm lint` flags them unused (other components in that file use them).

- [ ] **Step 5: Run the regression + typecheck + lint**

Run: `pnpm vitest run tests/components/admin/wizard/packListBreakdownStates.test.tsx tests/components/admin/wizard/step3ReviewSections.test.tsx`
Expected: PASS (Pack-list behavior identical; "Keep skipped" still present).

Run: `pnpm tsc --noEmit 2>&1 | head -20`
Expected: no errors in the two touched files.

Run: `pnpm eslint components/admin/wizard/archivedTabOffer.tsx components/admin/wizard/step3ReviewSections.tsx`
Expected: clean (fix any now-unused import it flags).

- [ ] **Step 6: Commit**

```bash
git add components/admin/wizard/archivedTabOffer.tsx components/admin/wizard/step3ReviewSections.tsx tests/components/admin/wizard/packListBreakdownStates.test.tsx
git commit --no-verify -m "refactor(admin): extract archived-tab offer cluster to shared module + showDismiss"
```

---

### Task 3: Wire the offer into the Step-3 Resolve box

**Files:**
- Modify: `components/admin/wizard/Step3ReviewModal.tsx` (box render gate + offer render)
- Test: `tests/components/admin/wizard/Step3ReviewModalResolution.test.tsx` (extend)

**Interfaces:**
- Consumes: `deriveArchivedOffers`, `ArchivedTabOffer` from `@/components/admin/wizard/archivedTabOffer`; `data.archivedPullSheetTabs`, `data.driveFileId`, `data.wizardSessionId` (already on `StagedSectionData`).

- [ ] **Step 1: Write the failing box tests**

Extend `tests/components/admin/wizard/Step3ReviewModalResolution.test.tsx`. Use the file's existing `renderModal`/fixture helpers; the snippets below show the assertions (adapt to the file's fixture builder — a `data` with one non-included archived tab, `wizardSessionId` set, and `resolution` undefined unless stated).

```tsx
import { render, screen, within } from "@testing-library/react";

const archivedTab = {
  tabName: "OLD gear",
  headerPreviews: ["CASE A"],
  fingerprint: "fp1",
  included: false,
  contentChangedSinceAccept: false,
};

// 1. Box appears on a clean staged row (no resolution) when an offer is pending.
it("renders the Resolve box with the accept offer on a clean row with a pending archived tab", () => {
  renderModal({ resolution: undefined, archivedPullSheetTabs: [archivedTab] });
  const box = screen.getByLabelText("Resolve before publishing");
  expect(
    within(box).getByRole("button", { name: "Use this show’s gear" }),
  ).toBeInTheDocument();
});

// 2. Box offer has NO "Keep skipped" (showDismiss=false → no empty-box path).
it("box offer omits the 'Keep skipped' dismiss", () => {
  renderModal({ resolution: undefined, archivedPullSheetTabs: [archivedTab] });
  const box = screen.getByLabelText("Resolve before publishing");
  expect(within(box).queryByRole("button", { name: "Keep skipped" })).toBeNull();
});

// 3. Re-apply footer is ABSENT on an archived-only row (footer decoupling, §4.4).
it("does not render the re-apply Approve/Ignore footer on an archived-only row", () => {
  renderModal({ resolution: undefined, archivedPullSheetTabs: [archivedTab] });
  expect(screen.queryByRole("button", { name: /Approve & apply|Ignore/ })).toBeNull();
});

// 4. No box offer when an override is already accepted.
it("shows no box offer when the archived override is already accepted", () => {
  renderModal({ resolution: undefined, archivedPullSheetTabs: [{ ...archivedTab, included: true }] });
  expect(screen.queryByLabelText("Resolve before publishing")).toBeNull();
});

// 5. Accept POSTs the CAS body.
it("box accept POSTs the override with expectedOverrideSnapshot null", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ ok: true, status: "override_set" }), { status: 200 }),
  );
  renderModal({ resolution: undefined, archivedPullSheetTabs: [archivedTab] });
  const box = screen.getByLabelText("Resolve before publishing");
  await userEvent.click(within(box).getByRole("button", { name: "Use this show’s gear" }));
  expect(fetchSpy).toHaveBeenCalledWith(
    "/api/admin/onboarding/pull-sheet-override",
    expect.objectContaining({ method: "POST" }),
  );
  const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
  expect(body).toMatchObject({
    tabName: "OLD gear",
    expectedFingerprint: "fp1",
    expectedOverrideSnapshot: null,
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/components/admin/wizard/Step3ReviewModalResolution.test.tsx`
Expected: FAIL — box not rendered on a clean row / accept button absent.

- [ ] **Step 3: Implement the box wiring in `Step3ReviewModal.tsx`**

Add the import near the other `@/components/admin/wizard/...` imports:

```tsx
import { ArchivedTabOffer, deriveArchivedOffers } from "@/components/admin/wizard/archivedTabOffer";
```

After `const { dfid, wizardSessionId } = data;` (line 152), add:

```tsx
// Archived-tab pending offers (spec §4.2/§4.3) — the box appears for these even
// when there is no blocked re-apply resolution. Same derivation as Pack-list.
const archivedOffers = deriveArchivedOffers(data.archivedPullSheetTabs, wizardSessionId != null).offers;
const hasPendingArchivedOffer = archivedOffers.length > 0;
```

Change the box section gate. Locate the resolution `<section>` (currently `{resolution ? ( <section ...> ... </section> ) : null}` around line 725) and change the guard to `resolution || hasPendingArchivedOffer`. Inside the section, gate the re-apply body on `resolution` and append the archived offers. The section becomes:

```tsx
{resolution || hasPendingArchivedOffer ? (
  <section
    data-testid={`wizard-step3-card-${dfid}-review-resolution`}
    aria-label="Resolve before publishing"
    className="flex min-w-0 flex-col gap-4 rounded-md border border-border bg-surface-sunken p-tile-pad"
  >
    <h3 className="text-sm font-semibold text-text-strong">Resolve before publishing</h3>
    {resolution ? (
      reviewItemsCorrupt ? (
        <p
          data-testid={`wizard-step3-card-${dfid}-review-resolution-corrupt`}
          className="text-sm text-warning-text"
        >
          We couldn&apos;t read the review details for this sheet. Re-scan it, or set it
          aside for this setup.
        </p>
      ) : (
        resolutionItems.map((item) => {
          /* ...existing tier-1/2/3 render, UNCHANGED... */
        })
      )
    ) : null}
    {archivedOffers.map((tab) => (
      <ArchivedTabOffer
        key={tab.tabName}
        dfid={data.driveFileId}
        wizardSessionId={wizardSessionId}
        tab={tab}
        showDismiss={false}
        testId={`wizard-step3-card-${dfid}-review-resolution-archived-${tab.tabName}`}
      />
    ))}
  </section>
) : null}
```

Leave the footer branch (`{resolution ? ( <re-apply footer> ) : ( <normal footer> )}`) EXACTLY as-is — do not touch it. This is the §4.4 decoupling: an archived-only row has `resolution === undefined`, so the normal footer renders.

- [ ] **Step 4: Run the box tests + the existing resolution/transition tests**

Run: `pnpm vitest run tests/components/admin/wizard/Step3ReviewModalResolution.test.tsx tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx tests/components/admin/wizard/Step3ReviewModal.test.tsx`
Expected: PASS (new box tests + no regression in existing resolution/transition/modal tests).

- [ ] **Step 5: Transition-audit check (spec §8)**

Confirm no animation props were introduced: the box section and the offer render synchronously with no `AnimatePresence`/`motion`/`initial`/`animate`/`exit`. Grep the modal diff:

Run: `git diff components/admin/wizard/Step3ReviewModal.tsx | grep -nE "AnimatePresence|initial=|animate=|exit=|motion\." || echo "no animation props added (instant — matches §8)"`
Expected: prints the "no animation props" line.

- [ ] **Step 6: Typecheck + lint**

Run: `pnpm tsc --noEmit 2>&1 | head -20`
Run: `pnpm eslint components/admin/wizard/Step3ReviewModal.tsx`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add components/admin/wizard/Step3ReviewModal.tsx tests/components/admin/wizard/Step3ReviewModalResolution.test.tsx
git commit --no-verify -m "feat(admin): surface archived-tab accept offer in the Step-3 Resolve box"
```

---

### Task 4: Full-suite gate + impeccable dual-gate (close-out, no code unless a gate fails)

**Files:** none by default (fixes only if a gate fails).

- [ ] **Step 1: Coexistence sanity (both entry points present)**

Confirm a fixture where both the Resolve box and the Pack-list section render shows the accept affordance in both (box via `wizard-step3-card-…-review-resolution-archived-…`, Pack-list via `pack-list-archived-offer-…`). Add this assertion to `Step3ReviewModalResolution.test.tsx` if the file renders the full modal (Pack-list section included); otherwise note it is covered structurally by Tasks 2+3 sharing one component. Do not force a brittle full-modal render if the existing harness does not support it — the parity invariant (one derivation) already guarantees identical offer sets.

- [ ] **Step 2: Run the full unit suite**

Run: `pnpm test 2>&1 | tail -30`
Expected: green. NOTE: pre-existing stale-shared-local-DB failures (lifecycle-guard / admin-alert / dashboard DB tests) may appear and are environmental, not from this diff — confirm any failure is DB-env by checking it fails identically on `origin/main`, and rely on CI's fresh DB as arbiter. This diff touches no DB.

- [ ] **Step 3: impeccable dual-gate (invariant 8)**

Run `/impeccable critique` then `/impeccable audit` on the diff (`git diff origin/main`). Both with the v3 setup gates (context.mjs load → register reference read). Fix P0/P1 findings or record a `DEFERRED.md` entry. Record findings + dispositions for the handoff.

- [ ] **Step 4: format:check**

Run: `pnpm format:check 2>&1 | tail -5`
Expected: clean (run `pnpm format` + amend the relevant task commit if not).

---

## Self-review notes (author)

- **Spec coverage:** §4.1 (Task 3 data), §4.2 (Task 1+2 extraction/parity), §4.3 (Task 3 gate + testid), §4.4 (Task 3 Step 3 footer untouched + Task 3 test 3), §4.5 (no disabled prop — nothing added), §4.5b (Task 2 `showDismiss` + Task 3 test 2), §4.6 (no focus prop in box), §4.7 (route CAS — no code, cited), §5/§6 (Task 3 tests 1/3/4 + Task 1 derive tests), §8 (Task 3 Step 5 transition-audit), §9 (Task 3 tests), §10 (meta-test inventory declared).
- **Anti-tautology:** box assertions scope via `within(getByLabelText("Resolve before publishing"))` so a Pack-list offer cannot satisfy a box assertion; the accept-payload test derives `tabName`/`fingerprint` from the fixture tab, not hardcoded constants divorced from the fixture.
- **Type consistency:** `deriveArchivedOffers` signature identical across Task 1 (def), Task 2 (Pack-list consumer), Task 3 (box consumer). `ArchivedTabOffer` discriminated prop shape defined once in Task 2, consumed in Task 3 with `showDismiss={false}` (no `onDismissFocus`).
- **Layout-dimensions task:** N/A — no fixed-dimension parent (spec §7).
