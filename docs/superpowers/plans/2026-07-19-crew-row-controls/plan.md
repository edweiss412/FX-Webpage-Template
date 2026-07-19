# Crew Row Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-row three-dot action menu (Preview as / Reset name picker with confirm popover + panel banner) on the published review modal's Crew section; PickerResetControl slims to everyone-only.

**Architecture:** New client component `CrewRowActions` (trigger + menu popover + confirm popover, backdrop-simple close, APG menu keyboard) mounted per eligible row by `CrewBreakdown`, which owns single-open state + the panel-top outcome banner pair. Icons stay inline in `CrewBreakdown` untouched. Spec: `docs/superpowers/specs/2026-07-19-crew-row-controls.md` (adversarially APPROVED R7) — it is the contract; this plan implements it.

**Tech Stack:** Next.js 16 / React, Tailwind v4 tokens, lucide-react, Vitest + RTL (jsdom), Playwright live e2e.

## Global Constraints

- Spec is canonical; §10 deviations are ratified. No new §12.4 codes; outcome copy admin-authored inline with `// not-subject:M5-D8` comments (mirror `PickerResetControl.tsx:161-166`).
- Numbers (spec §11): 44/32px hit/visual · `ARM_REVERT_MS = 4_000` · `SUCCESS_DISMISS_MS = 5_000` · backdrop `z-20`, popovers `z-30` · menu `min-w-52` · confirm `w-[268px]` · menu/confirm offset `top-[calc(100%+6px)]`.
- Tokens only, no hex. Entrance = `route-enter` (reduced-motion-guarded, `app/globals.css:511-523`). All popover copy concise; long copy only in panel banner.
- Testids (spec): `crew-row-menu-button-${crewId}`, `crew-row-menu-${crewId}`, `admin-show-preview-as-link-${crewId}` (preserved), `crew-row-reset-item-${crewId}`, `crew-row-reset-confirm-${crewId}`, `crew-row-reset-cancel`, `crew-row-reset-confirm-go`, `crew-row-reset-ok`, `crew-row-reset-error`, `crew-row-backdrop-${crewId}`.
- Commit per task, `--no-verify` (worktree), conventional commits.
- **Meta-test inventory (declared):** EXTENDS `tests/styles/_metaDestructiveConfirm.test.ts` (new registry row for `CrewRowActions.tsx`). NOT extended, with reasons: mutation-surface observability (no new server action/route; both actions already registered `tests/log/_auditableMutations.ts:264-278` + behavior-proved `tests/log/adminOutcomeBehavior.test.ts:1370-1389`); Supabase call-boundary `_metaInfraContract` (no new Supabase call site — `resetCrewMemberSelection` already registered at `tests/auth/_metaInfraContract.test.ts:227`); sentinel-hiding (no optional-text sentinel surface); advisory-lock topology (no `pg_advisory*` in diff); no-inline-email-normalization (no email parsing — mailto uses stored value as today).
- **Advisory-lock holder topology:** N/A — diff contains no lock-holding code path (client-only + docs + tests).
- **Layout-dimensions mandate** → Task 3's real-browser assertions implement spec §6b. **Transition-audit mandate** → Task 1 Step 6 audits every conditional render against spec §6 (12-pair table); no `AnimatePresence` is introduced (entrances via `route-enter`, exits instant — each pair explicitly declared in spec §6).

## File Structure

- Create: `components/admin/wizard/CrewRowActions.tsx` (client; trigger + popovers only)
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (CrewBreakdown 1233-1325 + crew registry def 3501-3521)
- Modify: `app/admin/show/[slug]/PickerResetControl.tsx` (slim to everyone-only)
- Create: `tests/components/admin/wizard/crewRowActions.test.tsx`
- Modify: `tests/admin/pickerResetControl.test.tsx` (rewrite), `tests/app/admin/showReviewModalLoader.test.tsx`, `tests/components/admin/showpage/sectionWarningControls.test.tsx`, `tests/styles/_metaDestructiveConfirm.test.ts`
- Create: `tests/e2e/published-review-modal.crew-actions.spec.ts`
- Modify: `playwright.config.ts` (desktop-chromium testMatch), `.github/workflows/published-modal-e2e.yml` (paths + run command)
- Modify: `app/help/admin/per-show-panel/page.mdx`, `app/help/admin/preview-as-crew/page.mdx`

---

### Task 0: Author the real-browser spec RED (TDD gate for Tasks 1+3)

**Files:**
- Create: `tests/e2e/published-review-modal.crew-actions.spec.ts` (full content in Task 3 Step 1 — write it NOW, verbatim)
- Modify: `playwright.config.ts:70`, `.github/workflows/published-modal-e2e.yml` (wiring per Task 3 Step 2 — do it NOW)

- [ ] **Step 1:** Write the spec file exactly as given in Task 3 Step 1, and apply the CI wiring exactly as given in Task 3 Step 2.
- [ ] **Step 2: Run to verify RED** (real-browser gate fails before any implementation exists):

Run: `pnpm exec playwright test --project=desktop-chromium tests/e2e/published-review-modal.crew-actions.spec.ts`
Expected: FAIL — every test times out on `crew-row-menu-button-*` (no trigger rendered yet).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit --no-verify -m "test(admin): RED crew-row menu e2e — dimensions, stacking, scroll-edge, reset round-trip + CI wiring"
```

---

### Task 1: CrewRowActions + CrewBreakdown wiring + unit tests

**Files:**
- Create: `components/admin/wizard/CrewRowActions.tsx`
- Modify: `components/admin/wizard/step3ReviewSections.tsx:1233-1325` (CrewBreakdown), `:3501-3521` (crew registry def)
- Test: `tests/components/admin/wizard/crewRowActions.test.tsx` (new), `tests/app/admin/showReviewModalLoader.test.tsx`, `tests/components/admin/showpage/sectionWarningControls.test.tsx`, `tests/styles/_metaDestructiveConfirm.test.ts`

**Interfaces:**
- Consumes: `resetCrewMemberSelection({ showId, crewMemberId })` (`lib/auth/picker/resetCrewMemberSelection.ts:52`), `hasContent` (`step3ReviewSections.tsx:207`), `isPublished` (`components/admin/review/sectionData.ts:172`).
- Produces:
  ```ts
  // components/admin/wizard/CrewRowActions.tsx
  export type CrewRowOutcome = { kind: "ok" | "error"; message: string };
  export function CrewRowActions(props: {
    crewId: string; name: string; showId: string; slug: string;
    open: boolean;
    onOpenChange: (next: boolean) => void;
    onOutcome: (o: CrewRowOutcome | null) => void; // null = clear (new confirm arming)
  }): JSX.Element;
  // CrewBreakdown prop change (step3ReviewSections.tsx):
  //   previewAs?: {...}  →  actions?: { showId: string; slug: string; enabled: boolean; crewIds: readonly string[] }
  ```

- [ ] **Step 1: Write the failing unit tests** — `tests/components/admin/wizard/crewRowActions.test.tsx`. Render subject is `CrewBreakdown` (spec §8). Full file:

```tsx
// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/crewRowActions.test.tsx
 * Spec: docs/superpowers/specs/2026-07-19-crew-row-controls.md §4, §5, §6, §8.
 * Subject is CrewBreakdown (owns single-open state + banners, mounts CrewRowActions).
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CrewBreakdown } from "@/components/admin/wizard/step3ReviewSections";
import type { CrewMemberRow } from "@/lib/parser/types";

const resetMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/picker/resetCrewMemberSelection", () => ({
  resetCrewMemberSelection: resetMock,
}));
// next/link renders an <a>; next/navigation not needed (Link only).

const member = (name: string, phone: string | null, email: string | null): CrewMemberRow => ({
  name,
  email,
  phone,
  role: "BO",
  role_flags: [],
  date_restriction: { kind: "none" } as CrewMemberRow["date_restriction"],
  stage_restriction: { kind: "none" } as CrewMemberRow["stage_restriction"],
  flight_info: null,
});

const MEMBERS = [member("Alex Rodrigues", "5125550101", "alex@x.test"), member("Kari Rose", null, null)];
const CREW_IDS = ["c1111111-1111-4111-8111-111111111111", "c2222222-2222-4222-8222-222222222222"];
const ACTIONS = {
  showId: "11111111-2222-4333-8444-555555555555",
  slug: "test-show",
  enabled: true,
  crewIds: CREW_IDS,
};

function renderCrew(actions: typeof ACTIONS | undefined = ACTIONS, members = MEMBERS) {
  return render(<CrewBreakdown dfid="df-1" members={members} {...(actions ? { actions } : {})} />);
}
const trigger = (id: string) => screen.getByTestId(`crew-row-menu-button-${id}`);
const menu = (id: string) => screen.queryByTestId(`crew-row-menu-${id}`);
const confirm = (id: string) => screen.queryByTestId(`crew-row-reset-confirm-${id}`);

beforeEach(() => {
  resetMock.mockReset();
});
afterEach(cleanup);

describe("mount gating (spec §4.1, §5)", () => {
  it("staged / no-actions render has NO trigger and keeps the concrete committed icon DOM", () => {
    const { container } = renderCrew(undefined);
    expect(container.querySelector("button[aria-haspopup]")).toBeNull();
    // Concrete committed shape (step3ReviewSections.tsx:1283-1305), fixture-derived hrefs:
    const call = screen.getByLabelText("Call Alex Rodrigues");
    expect(call.getAttribute("href")).toBe("tel:5125550101");
    expect(call.className).toMatch(/\bsize-tap-min\b/);
    expect(call.querySelector("span")?.className).toMatch(/\bsize-8\b/);
    const mail = screen.getByLabelText("Email Alex Rodrigues");
    expect(mail.getAttribute("href")).toBe("mailto:alex@x.test");
    // No preview pill anywhere (moved into menu):
    expect(screen.queryByTestId(`admin-show-preview-as-link-${CREW_IDS[0]}`)).toBeNull();
    // No banner infrastructure in ineligible mode (byte-identity):
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
  it("empty crew renders only the empty state — no banner infrastructure even when enabled", () => {
    const { container } = renderCrew({ ...ACTIONS, crewIds: [] }, []);
    expect(screen.getByText("No crew parsed.")).toBeTruthy();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
  it("enabled:false renders no trigger", () => {
    const { container } = renderCrew({ ...ACTIONS, enabled: false });
    expect(container.querySelector("button[aria-haspopup]")).toBeNull();
  });
  it("empty crewId gap renders no trigger for that row only", () => {
    renderCrew({ ...ACTIONS, crewIds: [CREW_IDS[0], ""] });
    expect(trigger(CREW_IDS[0])).toBeTruthy();
    expect(screen.queryByTestId(`crew-row-menu-button-`)).toBeNull();
  });
});

describe("menu open/close + keyboard (spec §4.2)", () => {
  it("opens with first menuitem focused; ArrowDown/ArrowUp cycle; Home/End jump", async () => {
    renderCrew();
    fireEvent.click(trigger(CREW_IDS[0]));
    const m = menu(CREW_IDS[0])!;
    const items = Array.from(m.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(items.length).toBe(2); // Preview as + Reset name picker
    await vi.waitFor(() => expect(items[0]).toHaveFocus());
    fireEvent.keyDown(m, { key: "ArrowDown" });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(m, { key: "ArrowDown" }); // cycles
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(m, { key: "ArrowUp" }); // cycles back
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(m, { key: "Home" });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(m, { key: "End" });
    expect(items[1]).toHaveFocus();
  });
  it("Preview as is a real link to the preview route with the preserved testid", () => {
    renderCrew();
    fireEvent.click(trigger(CREW_IDS[0]));
    const link = screen.getByTestId(`admin-show-preview-as-link-${CREW_IDS[0]}`);
    expect(link.getAttribute("role")).toBe("menuitem");
    expect(link.getAttribute("href")).toBe(`/admin/show/test-show/preview/${CREW_IDS[0]}`);
  });
  it("menu has a role=separator divider", () => {
    renderCrew();
    fireEvent.click(trigger(CREW_IDS[0]));
    expect(menu(CREW_IDS[0])!.querySelector('[role="separator"]')).toBeTruthy();
  });
  it("Escape closes and restores focus to the trigger", async () => {
    renderCrew();
    fireEvent.click(trigger(CREW_IDS[0]));
    fireEvent.keyDown(menu(CREW_IDS[0])!, { key: "Escape" });
    expect(menu(CREW_IDS[0])).toBeNull();
    await vi.waitFor(() => expect(trigger(CREW_IDS[0])).toHaveFocus());
  });
  it("Tab closes the menu (focus proceeds from trigger)", () => {
    renderCrew();
    fireEvent.click(trigger(CREW_IDS[0]));
    fireEvent.keyDown(menu(CREW_IDS[0])!, { key: "Tab" });
    expect(menu(CREW_IDS[0])).toBeNull();
  });
  it("backdrop click closes without reopening; single-open across rows", () => {
    renderCrew();
    fireEvent.click(trigger(CREW_IDS[0]));
    expect(menu(CREW_IDS[0])).toBeTruthy();
    // Backdrop covers everything incl. row B's trigger — a click closes only.
    fireEvent.click(screen.getByTestId(`crew-row-backdrop-${CREW_IDS[0]}`));
    expect(menu(CREW_IDS[0])).toBeNull();
    // Second click opens row B; row A stays closed (single openCrewId).
    fireEvent.click(trigger(CREW_IDS[1]));
    expect(menu(CREW_IDS[1])).toBeTruthy();
    expect(menu(CREW_IDS[0])).toBeNull();
  });
  it("Space activates the focused menuitem (Preview-as Link closes the menu); Enter opens the confirm from Reset", async () => {
    renderCrew();
    fireEvent.click(trigger(CREW_IDS[0]));
    const m = menu(CREW_IDS[0])!;
    const items = Array.from(m.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    await vi.waitFor(() => expect(items[0]).toHaveFocus());
    fireEvent.keyDown(m, { key: " " }); // Space on the Link — no native activation, handler clicks
    expect(menu(CREW_IDS[0])).toBeNull();
    fireEvent.click(trigger(CREW_IDS[0]));
    const m2 = menu(CREW_IDS[0])!;
    const items2 = Array.from(m2.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    items2[1]!.focus();
    fireEvent.keyDown(m2, { key: "Enter" });
    expect(confirm(CREW_IDS[0])).toBeTruthy();
  });
  it("aria-expanded tracks open state", () => {
    renderCrew();
    expect(trigger(CREW_IDS[0]).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger(CREW_IDS[0]));
    expect(trigger(CREW_IDS[0]).getAttribute("aria-expanded")).toBe("true");
  });
});

describe("confirm flow (spec §4.3, §4.4, §4.5, §6)", () => {
  function openConfirm(id = CREW_IDS[0]) {
    fireEvent.click(trigger(id));
    fireEvent.click(screen.getByTestId(`crew-row-reset-item-${id}`));
  }
  it("Reset name picker swaps menu → confirm; Cancel focused (C3); warning wraps; CTA described by warning", async () => {
    renderCrew();
    openConfirm();
    expect(menu(CREW_IDS[0])).toBeNull();
    const c = confirm(CREW_IDS[0])!;
    expect(c.textContent).toContain("Alex Rodrigues will choose their name again on their next visit.");
    const warning = c.querySelector("p[id]")!;
    expect(warning.className).toMatch(/\bwrap-break-word\b/);
    const go = screen.getByTestId("crew-row-reset-confirm-go");
    expect(go.getAttribute("aria-describedby")).toBe(warning.id);
    await vi.waitFor(() => expect(screen.getByTestId("crew-row-reset-cancel")).toHaveFocus());
  });
  it("confirm Tab is a 2-stop trap Cancel ⇄ Confirm (never behind the backdrop)", async () => {
    renderCrew();
    openConfirm();
    const c = confirm(CREW_IDS[0])!;
    const cancel = screen.getByTestId("crew-row-reset-cancel");
    const go = screen.getByTestId("crew-row-reset-confirm-go");
    await vi.waitFor(() => expect(cancel).toHaveFocus());
    fireEvent.keyDown(c, { key: "Tab" });
    expect(go).toHaveFocus();
    fireEvent.keyDown(c, { key: "Tab", shiftKey: true });
    expect(cancel).toHaveFocus();
  });
  it("Cancel closes fully (not back to menu) and restores trigger focus (C5)", async () => {
    renderCrew();
    openConfirm();
    fireEvent.click(screen.getByTestId("crew-row-reset-cancel"));
    expect(confirm(CREW_IDS[0])).toBeNull();
    expect(menu(CREW_IDS[0])).toBeNull();
    await vi.waitFor(() => expect(trigger(CREW_IDS[0])).toHaveFocus());
  });
  it("auto-revert closes the confirm after 4s and a stale Confirm cannot fire the action", () => {
    vi.useFakeTimers();
    try {
      renderCrew();
      openConfirm();
      const go = screen.getByTestId("crew-row-reset-confirm-go");
      act(() => vi.advanceTimersByTime(4_000));
      expect(confirm(CREW_IDS[0])).toBeNull();
      fireEvent.click(go); // detached node — must not fire
      expect(resetMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it("Confirm calls the action with fixture-derived ids, shows resolving UI, then success banner + sr-only announce", async () => {
    let resolve!: (v: unknown) => void;
    resetMock.mockReturnValue(new Promise((r) => (resolve = r)));
    renderCrew();
    openConfirm();
    fireEvent.click(screen.getByTestId("crew-row-reset-confirm-go"));
    // anti-tautology: expected ids come from the fixture, not literals repeated in the component
    expect(resetMock).toHaveBeenCalledWith({ showId: ACTIONS.showId, crewMemberId: ACTIONS.crewIds[0] });
    const go = screen.getByTestId("crew-row-reset-confirm-go") as HTMLButtonElement;
    await vi.waitFor(() => expect(go.disabled).toBe(true));
    expect(go.textContent).toContain("Resetting…");
    expect(go.getAttribute("aria-busy")).toBe("true");
    expect((screen.getByTestId("crew-row-reset-cancel") as HTMLButtonElement).disabled).toBe(true);
    // Close paths inert while resolving — Esc, backdrop click, auto-revert timer:
    fireEvent.keyDown(confirm(CREW_IDS[0])!, { key: "Escape" });
    expect(confirm(CREW_IDS[0])).toBeTruthy();
    fireEvent.click(screen.getByTestId(`crew-row-backdrop-${CREW_IDS[0]}`));
    expect(confirm(CREW_IDS[0])).toBeTruthy();
    // (Auto-revert timer was cleared on Confirm — advancing time must not close.)
    vi.useFakeTimers();
    try {
      act(() => vi.advanceTimersByTime(4_000));
      expect(confirm(CREW_IDS[0])).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
    resolve({ ok: true });
    await vi.waitFor(() => expect(confirm(CREW_IDS[0])).toBeNull());
    expect(screen.getByTestId("crew-row-reset-ok").textContent).toContain(
      "Reset Alex Rodrigues. They'll pick again next visit.",
    );
    const region = document.querySelector('[role="status"][aria-live="polite"]')!;
    expect(region.textContent).toContain("Reset Alex Rodrigues. They'll pick again next visit.");
  });
  it("PICKER_CREW_MEMBER_NOT_FOUND shows the roster-stale error; other failures the generic error; errors persist", async () => {
    resetMock.mockResolvedValue({ ok: false, code: "PICKER_CREW_MEMBER_NOT_FOUND" });
    renderCrew();
    openConfirm();
    fireEvent.click(screen.getByTestId("crew-row-reset-confirm-go"));
    await vi.waitFor(() =>
      expect(screen.getByTestId("crew-row-reset-error").textContent).toMatch(/no longer on the roster/),
    );
    expect(screen.getByTestId("crew-row-reset-error").getAttribute("role")).toBe("alert");
    // generic path
    resetMock.mockResolvedValue({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
    openConfirm(CREW_IDS[1]);
    fireEvent.click(screen.getByTestId("crew-row-reset-confirm-go"));
    await vi.waitFor(() =>
      expect(screen.getByTestId("crew-row-reset-error").textContent).toMatch(/Couldn't reset the picker/),
    );
  });
  it("success banner auto-dismisses after 5s (fake timers)", async () => {
    // Fake timers from the START so the banner's setTimeout lands on the fake
    // clock (switching after scheduling would leave a real 5s timer untouched).
    resetMock.mockResolvedValue({ ok: true });
    vi.useFakeTimers();
    try {
      renderCrew();
      openConfirm();
      fireEvent.click(screen.getByTestId("crew-row-reset-confirm-go"));
      // Flush the resolved action promise (microtasks) on the fake clock.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByTestId("crew-row-reset-ok")).toBeTruthy();
      act(() => vi.advanceTimersByTime(5_000));
      expect(screen.queryByTestId("crew-row-reset-ok")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it("arming a new confirm clears a prior outcome immediately", async () => {
    resetMock.mockResolvedValue({ ok: true });
    renderCrew();
    openConfirm();
    fireEvent.click(screen.getByTestId("crew-row-reset-confirm-go"));
    await vi.waitFor(() => expect(screen.getByTestId("crew-row-reset-ok")).toBeTruthy());
    openConfirm(CREW_IDS[1]);
    expect(screen.queryByTestId("crew-row-reset-ok")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/ericweiss/FX-worktrees/crew-row-controls && pnpm vitest run tests/components/admin/wizard/crewRowActions.test.tsx`
Expected: FAIL — `CrewBreakdown` has no `actions` prop / `crew-row-menu-button-*` not found.

- [ ] **Step 3: Implement `components/admin/wizard/CrewRowActions.tsx`** (complete file):

```tsx
"use client";

/**
 * components/admin/wizard/CrewRowActions.tsx (crew-row-controls 2026-07-19)
 *
 * Per-row action cluster for the published review modal's Crew section: a
 * three-dot trigger anchoring a menu popover (Preview as / Reset name picker)
 * and a destructive confirm popover. Spec:
 * docs/superpowers/specs/2026-07-19-crew-row-controls.md (§4, §6, §6b).
 *
 * Ownership split: the PARENT (CrewBreakdown) owns single-open state and the
 * panel-top outcome banners; this component owns mode (menu/confirm/resolving),
 * timers, and focus. Mounted ONLY for eligible rows (published && !archived
 * with a persisted crew id) — the parent gates, this component assumes
 * eligibility (spec §7).
 *
 * Close semantics are backdrop-simple (UserMenu idiom, spec §10.7): while open,
 * a fixed z-20 backdrop covers everything including triggers; any outside
 * click closes only. Esc restores trigger focus; backdrop click does not.
 */

import Link from "next/link";
import { EllipsisVertical, Eye, RefreshCw } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition, type KeyboardEvent } from "react";

import { resetCrewMemberSelection } from "@/lib/auth/picker/resetCrewMemberSelection";

// Armed-state auto-revert — harmonized 4s across destructive surfaces
// (DESTRUCT-2; mirrors app/admin/show/[slug]/PickerResetControl.tsx:29).
const ARM_REVERT_MS = 4_000;

export type CrewRowOutcome = { kind: "ok" | "error"; message: string };

export function CrewRowActions({
  crewId,
  name,
  showId,
  slug,
  open,
  onOpenChange,
  onOutcome,
}: {
  crewId: string;
  name: string;
  showId: string;
  slug: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** null clears a prior outcome (fires when a new confirm arms — spec §4.5). */
  onOutcome: (o: CrewRowOutcome | null) => void;
}) {
  const [mode, setMode] = useState<"menu" | "confirm" | "resolving">("menu");
  const [isPending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmGoRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const autoRevertRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningId = useId();
  const resolving = mode === "resolving" || isPending;

  const clearAutoRevert = () => {
    if (autoRevertRef.current !== null) {
      clearTimeout(autoRevertRef.current);
      autoRevertRef.current = null;
    }
  };
  useEffect(() => () => clearAutoRevert(), []);

  // Parent-driven close (or settle): reset to menu so the next open starts clean.
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode("menu");
      clearAutoRevert();
    }
  }, [open]);

  // Open focus: menu → first menuitem (APG); confirm → Cancel (C3).
  useEffect(() => {
    if (!open) return;
    if (mode === "menu") {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    } else if (mode === "confirm") {
      cancelRef.current?.focus();
    }
  }, [open, mode]);

  // Scroll-edge visibility (spec §4.2): popovers near the modal scroller's
  // bottom edge open off-screen; nearest-scroll them into view on mount.
  useEffect(() => {
    if (!open) return;
    const el = mode === "menu" ? menuRef.current : confirmRef.current;
    // Guarded: jsdom does not implement scrollIntoView (unit tests would throw).
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
  }, [open, mode]);

  const closeFully = (restoreFocus: boolean) => {
    clearAutoRevert();
    onOpenChange(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      closeFully(true);
    } else if (e.key === "Tab") {
      // APG menu-button: Tab closes; focusing the trigger BEFORE the default
      // Tab action lets focus proceed in document order from the trigger.
      triggerRef.current?.focus();
      closeFully(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1 + items.length) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      // Space does not natively activate an <a>; route both through click so
      // Preview-as (Link) and Reset (button) behave identically (spec §4.2).
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.click();
    }
  };

  const onConfirmKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (resolving) {
      // Close paths + focus escape are inert while resolving (spec §6).
      if (e.key === "Escape" || e.key === "Tab") e.preventDefault();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeFully(true);
    } else if (e.key === "Tab") {
      // 2-stop trap: focus can never land behind the backdrop (spec §4.3).
      e.preventDefault();
      (document.activeElement === cancelRef.current ? confirmGoRef.current : cancelRef.current)?.focus();
    }
  };

  const enterConfirm = () => {
    clearAutoRevert();
    onOutcome(null); // arming a new confirm clears any prior banner (spec §4.5)
    setMode("confirm");
    // Timer is cleared by Cancel/Esc/Confirm/parent-close, so firing here can
    // only mean the confirm is still armed — full close, restore focus (C5).
    autoRevertRef.current = setTimeout(() => closeFully(true), ARM_REVERT_MS);
  };

  const onConfirm = () => {
    clearAutoRevert();
    setMode("resolving");
    // not-subject:M5-D8 — outcome copy (success AND error) is admin-authored inline BY DESIGN;
    // the picker message catalog is crew-oriented and would misattribute an admin reset. No raw
    // error CODE is ever rendered (codes map to these sentences here). Mirrors
    // app/admin/show/[slug]/PickerResetControl.tsx:161-166; no new §12.4 codes.
    startTransition(async () => {
      const r = await resetCrewMemberSelection({ showId, crewMemberId: crewId });
      if (r.ok) {
        onOutcome({ kind: "ok", message: `Reset ${name}. They'll pick again next visit.` });
      } else if (r.code === "PICKER_CREW_MEMBER_NOT_FOUND") {
        onOutcome({
          kind: "error",
          message:
            "That crew member is no longer on the roster, so there's nothing to reset. Refresh to see the current roster.",
        });
      } else {
        onOutcome({ kind: "error", message: "Couldn't reset the picker. Please try again." });
      }
      onOpenChange(false);
    });
  };

  const menuItemClass =
    "flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-[13px] font-medium text-text hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none";

  return (
    <span className="relative flex shrink-0 items-center">
      {open && (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          data-testid={`crew-row-backdrop-${crewId}`}
          onClick={() => {
            if (!resolving) closeFully(false);
          }}
          className="fixed inset-0 z-20 cursor-default"
        />
      )}

      <button
        type="button"
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More actions for ${name}`}
        data-testid={`crew-row-menu-button-${crewId}`}
        onClick={() => onOpenChange(true)}
        className="inline-flex size-tap-min items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <span
          className={
            open
              ? "grid size-8 place-items-center rounded-sm border border-border-strong bg-surface-sunken text-text-strong transition-colors duration-fast"
              : "grid size-8 place-items-center rounded-sm border border-border text-text-subtle transition-colors duration-fast"
          }
        >
          <EllipsisVertical aria-hidden="true" className="size-4" />
        </span>
      </button>

      {open && mode === "menu" && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${name}`}
          data-testid={`crew-row-menu-${crewId}`}
          onKeyDown={onMenuKeyDown}
          className="route-enter absolute right-0 top-[calc(100%+6px)] z-30 min-w-52 rounded-md border border-border bg-surface-raised p-1.5 shadow-lg"
        >
          <Link
            role="menuitem"
            tabIndex={-1}
            data-testid={`admin-show-preview-as-link-${crewId}`}
            href={`/admin/show/${encodeURIComponent(slug)}/preview/${encodeURIComponent(crewId)}`}
            onClick={() => closeFully(false)}
            className={menuItemClass}
          >
            <Eye aria-hidden="true" className="size-4 shrink-0 text-text-subtle" />
            <span>
              Preview as<span className="sr-only"> {name}</span>
            </span>
          </Link>
          <div role="separator" className="mx-1.5 my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            data-testid={`crew-row-reset-item-${crewId}`}
            onClick={enterConfirm}
            className={menuItemClass}
          >
            <RefreshCw aria-hidden="true" className="size-4 shrink-0 text-text-subtle" />
            Reset name picker
          </button>
        </div>
      )}

      {open && (mode === "confirm" || mode === "resolving") && (
        <div
          ref={confirmRef}
          role="group"
          aria-label="Confirm resetting this crew member's picker selection"
          data-testid={`crew-row-reset-confirm-${crewId}`}
          onKeyDown={onConfirmKeyDown}
          className="route-enter absolute right-0 top-[calc(100%+6px)] z-30 w-[268px] rounded-md border border-border bg-surface-raised p-3.5 shadow-lg"
        >
          <p className="wrap-break-word text-[13px] font-semibold text-text-strong">
            Reset name picker
          </p>
          {/* not-subject:M5-D8 — admin-authored inline warning copy (see onConfirm rationale). */}
          <p id={warningId} className="mt-0.5 mb-3 wrap-break-word text-xs leading-relaxed text-text-subtle">
            {name} will choose their name again on their next visit.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              ref={cancelRef}
              disabled={resolving}
              data-testid="crew-row-reset-cancel"
              onClick={() => closeFully(true)}
              className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border bg-surface px-3.5 text-[13px] text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              ref={confirmGoRef}
              disabled={resolving}
              aria-busy={resolving}
              aria-describedby={warningId}
              data-testid="crew-row-reset-confirm-go"
              onClick={onConfirm}
              className="inline-flex min-h-tap-min items-center justify-center rounded-sm bg-warning-text px-3.5 text-[13px] font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resolving ? "Resetting…" : "Confirm reset"}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
```

- [ ] **Step 4: Wire `CrewBreakdown`** (`step3ReviewSections.tsx:1233-1325`). Replace the `previewAs` prop with `actions`, add state + banners, remove the Preview pill, mount `CrewRowActions`. Replacement for the whole function:

```tsx
export function CrewBreakdown({
  dfid,
  members,
  actions,
}: {
  dfid: string | null;
  members: CrewMemberRow[];
  /** Published-mode row actions (spec §3.2): folds the published && !archived gate
   *  (`enabled`); `crewIds` is index-aligned with `members` (adapter's single crew
   *  sort). Absent in staged mode → byte-identical to the pre-change render. */
  actions?: { showId: string; slug: string; enabled: boolean; crewIds: readonly string[] };
}) {
  const shown = members.slice(0, CREW_CAP);
  const note = overflowNote(members.length, CREW_CAP, "people");
  // Single-open menu + panel-top outcome banner (spec §4.2/§4.5). State exists
  // in every mode but banners/menus only MOUNT when actions?.enabled.
  const [openCrewId, setOpenCrewId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<CrewRowOutcome | null>(null);
  // Success auto-dismiss (5s — mirrors PickerResetControl.tsx:31); errors persist.
  useEffect(() => {
    if (outcome?.kind !== "ok") return;
    const t = setTimeout(() => setOutcome(null), 5_000);
    return () => clearTimeout(t);
  }, [outcome]);
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-crew`}
      label="Crew"
      count={members.length}
    >
      {actions?.enabled && members.length > 0 ? (
        <>
          {/* PCR-1 banner pair (PickerResetControl.tsx:199-238): persistent sr-only
              polite region announces success; visible banners are decorative/alert.
              Gated on non-empty crew too — an empty section renders ONLY
              "No crew parsed." with no banner state (spec §5). */}
          <div className="sr-only" role="status" aria-live="polite">
            {outcome?.kind === "ok" ? outcome.message : ""}
          </div>
          {outcome?.kind === "ok" && (
            <p
              data-testid="crew-row-reset-ok"
              aria-hidden="true"
              className="rounded-sm bg-surface-raised px-2 py-1 text-sm wrap-break-word text-text-strong"
            >
              <span aria-hidden="true" className="mr-1 font-semibold text-accent-on-bg">
                ✓
              </span>
              {outcome.message}
            </p>
          )}
          {outcome?.kind === "error" && (
            <p
              data-testid="crew-row-reset-error"
              role="alert"
              className="rounded-sm bg-warning-bg px-2 py-1 text-sm wrap-break-word text-warning-text"
            >
              {outcome.message}
            </p>
          )}
        </>
      ) : null}
      {members.length === 0 ? (
        <p className="text-sm text-text-subtle">No crew parsed.</p>
      ) : (
        <ul className="flex flex-col">
          {shown.map((m, i) => {
            const partial = partialAttendanceLabel(m.date_restriction, { humanize: false });
            const name = m.name || "Unnamed";
            const subline = [m.role, partial].filter((x): x is string => hasContent(x)).join(" · ");
            // Spec §4.1: trigger mounts only for eligible rows with a persisted id.
            const crewId = actions?.enabled ? (actions.crewIds[i] ?? "") : "";
            return (
              <Fragment key={`${m.name}-${i}`}>
                <li className="flex items-center gap-3 py-1">
                  <Avatar name={m.name || null} />
                  <span className="min-w-0 flex-1">
                    <span className="block wrap-break-word text-sm font-medium text-text-strong">
                      {name}
                    </span>
                    {subline ? (
                      <span className="block wrap-break-word text-xs text-text-subtle">
                        {subline}
                      </span>
                    ) : null}
                  </span>
                  {/* §8 exact anchor DOM: the INTERACTIVE <a> is the 44×44
                    border box (`size-tap-min`); the bordered 32px square is a
                    nested NON-interactive visual. Adjacent anchors sit flush
                    (no gap, no negative margins) so hit areas never overlap;
                    the centered visuals leave a natural 12px gutter. */}
                  <span className="flex shrink-0 items-center">
                    {hasContent(m.phone) ? (
                      <a
                        href={`tel:${m.phone}`}
                        aria-label={`Call ${name}`}
                        className="inline-flex size-tap-min items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                      >
                        <span className="grid size-8 place-items-center rounded-sm border border-border text-text-subtle">
                          <Phone aria-hidden="true" className="size-4" />
                        </span>
                      </a>
                    ) : null}
                    {hasContent(m.email) ? (
                      <a
                        href={`mailto:${m.email}`}
                        aria-label={`Email ${name}`}
                        className="inline-flex size-tap-min items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                      >
                        <span className="grid size-8 place-items-center rounded-sm border border-border text-text-subtle">
                          <Mail aria-hidden="true" className="size-4" />
                        </span>
                      </a>
                    ) : null}
                  </span>
                  {crewId ? (
                    <CrewRowActions
                      crewId={crewId}
                      name={name}
                      showId={actions!.showId}
                      slug={actions!.slug}
                      open={openCrewId === crewId}
                      onOpenChange={(next) => setOpenCrewId(next ? crewId : null)}
                      onOutcome={setOutcome}
                    />
                  ) : null}
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}
      {note ? <p className="text-xs text-text-subtle">{note}</p> : null}
    </BreakdownSection>
  );
}
```

Imports to add at the top of `step3ReviewSections.tsx`: `import { CrewRowActions, type CrewRowOutcome } from "@/components/admin/wizard/CrewRowActions";` (and `useEffect` if not already imported — it is, via React import cluster; verify). Registry crew def (`:3509-3521`) becomes:

```tsx
      render: (s) =>
        isPublished(s) ? (
          <CrewBreakdown
            dfid={s.driveFileId}
            members={s.crewMembers}
            actions={{
              showId: s.showId,
              slug: s.slug,
              enabled: s.published && !s.archived,
              crewIds: (s.previewRoster ?? []).map((r) => r.id),
            }}
          />
        ) : (
          <CrewBreakdown dfid={s.driveFileId} members={s.crewMembers} />
        ),
```

- [ ] **Step 5: Update the three pinning tests.**
  - `tests/styles/_metaDestructiveConfirm.test.ts`: after the PickerResetControl row (`:98`) add:
    ```ts
    R("components/admin/wizard/CrewRowActions.tsx", 0, "panel", "crew-row-reset-confirm-go"),
    ```
  - `tests/app/admin/showReviewModalLoader.test.tsx` + `tests/components/admin/showpage/sectionWarningControls.test.tsx`: mechanical transform, one shape. Every PRESENCE assertion
    ```tsx
    const link1 = screen.getByTestId(`admin-show-preview-as-link-${CREW_ID_1}`);
    ```
    becomes
    ```tsx
    fireEvent.click(screen.getByTestId(`crew-row-menu-button-${CREW_ID_1}`));
    const link1 = screen.getByTestId(`admin-show-preview-as-link-${CREW_ID_1}`);
    ```
    (import `fireEvent` from RTL if absent; close the menu afterwards with `fireEvent.keyDown(link1, { key: "Escape" })` only if a later assertion in the same test opens a DIFFERENT row's menu). Every ABSENCE assertion
    ```tsx
    expect(screen.queryByTestId(`admin-show-preview-as-link-${CREW_ID_1}`)).toBeNull();
    ```
    gains a sibling line
    ```tsx
    expect(screen.queryByTestId(`crew-row-menu-button-${CREW_ID_1}`)).toBeNull();
    ```
    All other assertions stay byte-identical.

- [ ] **Step 6: Transition audit (spec §6, mandatory).** Enumerate every conditional render in `CrewRowActions.tsx` + banner block in `CrewBreakdown` and check each against the spec §6 12-pair table: `open && mode==="menu"` (route-enter in / instant out), `open && (confirm||resolving)` (route-enter in / instant out; confirm→resolving is an in-place prop change — same mount, no re-animation because the conditional does not remount between those modes), backdrop (instant), banners (instant). No `AnimatePresence` anywhere. Record the audit as a comment block in the test file header.

- [ ] **Step 7: Run tests**

Run: `pnpm vitest run tests/components/admin/wizard/crewRowActions.test.tsx tests/app/admin/showReviewModalLoader.test.tsx tests/components/admin/showpage/sectionWarningControls.test.tsx tests/components/admin/wizard/noOverrideRows.test.tsx tests/styles/_metaDestructiveConfirm.test.ts`
Expected: PASS (noOverrideRows unchanged — staged render byte-identical).

- [ ] **Step 8: Commit**

```bash
git add -A && git commit --no-verify -m "feat(admin): per-row crew action menu — Preview as + Reset name picker with confirm popover"
```

---

### Task 2: Slim PickerResetControl to everyone-only

**Files:**
- Modify: `app/admin/show/[slug]/PickerResetControl.tsx`
- Test: `tests/admin/pickerResetControl.test.tsx` (rewrite in place)

**Interfaces:**
- Consumes: `resetPickerEpoch({ showId })` (`lib/auth/picker/resetPickerEpoch.ts`).
- Produces: `PickerResetControl({ showId, crew }: { showId: string; crew: PickerResetCrewRow[] })` — signature UNCHANGED (`app/admin/_showReviewModal.tsx:362` call site untouched); `PickerResetCrewRow` export retained.

- [ ] **Step 1: Rewrite the test file** to the everyone-only surface. Full replacement for `tests/admin/pickerResetControl.test.tsx`:

```tsx
// @vitest-environment jsdom
/**
 * tests/admin/pickerResetControl.test.tsx — everyone-only surface
 * (crew-row-controls spec §4.6; per-member reset moved to the crew row menu).
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PickerResetControl } from "@/app/admin/show/[slug]/PickerResetControl";

const epochMock = vi.hoisted(() => vi.fn());
const memberMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/picker/resetPickerEpoch", () => ({ resetPickerEpoch: epochMock }));
vi.mock("@/lib/auth/picker/resetCrewMemberSelection", () => ({
  resetCrewMemberSelection: memberMock,
}));

const SHOW_ID = "11111111-2222-4333-8444-555555555555";
const CREW = [
  { id: "c1111111-1111-4111-8111-111111111111", name: "Alice", role: "A1" },
  { id: "c2222222-2222-4222-8222-222222222222", name: "Bob", role: "BO" },
];

beforeEach(() => {
  epochMock.mockReset();
  memberMock.mockReset();
});
afterEach(cleanup);

const allBtn = () => screen.getByTestId("picker-reset-all-button") as HTMLButtonElement;
const confirmGo = () => screen.getByTestId("picker-reset-confirm-button") as HTMLButtonElement;
const cancelBtn = () => screen.getByTestId("picker-reset-cancel-button") as HTMLButtonElement;

describe("PickerResetControl (everyone-only)", () => {
  it("renders heading, description, and NO per-member surface", () => {
    render(<PickerResetControl showId={SHOW_ID} crew={CREW} />);
    expect(screen.getByRole("heading", { name: "Reset everyone's pick" })).toBeTruthy();
    expect(
      screen.getByText("Make everyone pick their name again on their next visit."),
    ).toBeTruthy();
    expect(screen.queryByTestId("picker-reset-member-select")).toBeNull();
    expect(screen.queryByTestId("picker-reset-member-button")).toBeNull();
  });

  it("empty roster: description swaps and the trigger is disabled", () => {
    render(<PickerResetControl showId={SHOW_ID} crew={[]} />);
    expect(screen.getByText("No crew to reset yet.")).toBeTruthy();
    expect(allBtn().disabled).toBe(true);
  });

  it("trigger arms the confirm row with the everyone warning; Cancel focused (C3); C5 restores trigger focus", async () => {
    render(<PickerResetControl showId={SHOW_ID} crew={CREW} />);
    fireEvent.click(allBtn());
    expect(screen.getByTestId("picker-reset-confirm-row")).toBeTruthy();
    expect(
      screen.getByText("Every device's picker re-prompts on next visit."),
    ).toBeTruthy();
    await vi.waitFor(() => expect(cancelBtn()).toHaveFocus());
    fireEvent.click(cancelBtn());
    expect(screen.queryByTestId("picker-reset-confirm-row")).toBeNull();
    await vi.waitFor(() => expect(allBtn()).toHaveFocus());
  });

  it("4s auto-revert closes the confirm; stale Confirm cannot fire; member action NEVER called", () => {
    vi.useFakeTimers();
    try {
      render(<PickerResetControl showId={SHOW_ID} crew={CREW} />);
      fireEvent.click(allBtn());
      const go = confirmGo();
      act(() => vi.advanceTimersByTime(4_000));
      expect(screen.queryByTestId("picker-reset-confirm-row")).toBeNull();
      fireEvent.click(go);
      expect(epochMock).not.toHaveBeenCalled();
      expect(memberMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("confirm calls resetPickerEpoch({showId}); success banner + sr-only announce", async () => {
    epochMock.mockResolvedValue({ ok: true, epoch: 2 });
    render(<PickerResetControl showId={SHOW_ID} crew={CREW} />);
    fireEvent.click(allBtn());
    fireEvent.click(confirmGo());
    expect(epochMock).toHaveBeenCalledWith({ showId: SHOW_ID });
    await vi.waitFor(() =>
      expect(screen.getByTestId("picker-reset-ok").textContent).toContain(
        "Everyone will pick again on their next visit.",
      ),
    );
    const region = document.querySelector('[role="status"][aria-live="polite"]')!;
    expect(region.textContent).toContain("Everyone will pick again on their next visit.");
    expect(memberMock).not.toHaveBeenCalled();
  });

  it("failure shows the persistent error banner", async () => {
    epochMock.mockResolvedValue({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
    render(<PickerResetControl showId={SHOW_ID} crew={CREW} />);
    fireEvent.click(allBtn());
    fireEvent.click(confirmGo());
    await vi.waitFor(() =>
      expect(screen.getByTestId("picker-reset-error").textContent).toMatch(
        /Couldn't reset the picker/,
      ),
    );
    expect(screen.getByTestId("picker-reset-error").getAttribute("role")).toBe("alert");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/admin/pickerResetControl.test.tsx`
Expected: FAIL (member select still present, old heading).

- [ ] **Step 3: Slim the component.** Full replacement for `app/admin/show/[slug]/PickerResetControl.tsx`:

```tsx
"use client";

/**
 * app/admin/show/[slug]/PickerResetControl.tsx (everyone-only, 2026-07-19)
 *
 * Admin control on the per-show Share & access panel: reset EVERYONE's picker
 * selection (global epoch bump via resetPickerEpoch). Per-member reset moved to
 * the crew section's row menu (CrewRowActions — crew-row-controls spec §4.6);
 * this control keeps the two-tap idle → confirm → resolving pattern, tokens,
 * a11y contract, and every picker-reset-* testid.
 *
 * Correctness nudge, not access control: reset members return to the ungated
 * picker and can re-pick the same name. Revocation stays with Rotate
 * share-token / roster removal.
 */

import { RefreshCw } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { resetPickerEpoch } from "@/lib/auth/picker/resetPickerEpoch";

// Armed-state auto-revert window — harmonized 4s across every destructive
// surface (spec §4; DESTRUCT-2). Shared naming idiom: ARM_REVERT_MS.
const ARM_REVERT_MS = 4_000;
/** PCR-1 (d): how long a success banner lingers before it auto-dismisses. */
const SUCCESS_DISMISS_MS = 5_000;

export type PickerResetCrewRow = { id: string; name: string; role: string | null };

type UiState = "idle" | "confirm" | "resolving";
type Outcome = { kind: "ok"; message: string } | { kind: "error"; message: string } | null;

export function PickerResetControl({
  showId,
  crew,
}: {
  showId: string;
  crew: PickerResetCrewRow[];
}) {
  const hasCrew = crew.length > 0;
  const [ui, setUi] = useState<UiState>("idle");
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [isPending, startTransition] = useTransition();
  const autoRevertRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descId = useId();
  const warningId = useId();
  // Destructive-confirm pass F4 (spec §6): C3 open-focus + C5 close-focus refs.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRowRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef(false);

  const clearAutoRevert = () => {
    if (autoRevertRef.current !== null) {
      clearTimeout(autoRevertRef.current);
      autoRevertRef.current = null;
    }
  };
  useEffect(() => () => clearAutoRevert(), []);

  function closeConfirm() {
    // used ONLY by cancel onClick and the auto-revert timer callback — never submit/result paths
    if (confirmRowRef.current) {
      restoreFocusRef.current = confirmRowRef.current.contains(document.activeElement);
    }
    setUi((prev) => (prev === "confirm" ? "idle" : prev));
  }

  // C3 (open focus): the confirm row mounts with the SAFE control focused.
  useEffect(() => {
    if (ui === "confirm") cancelRef.current?.focus();
  }, [ui]);

  // C5 (close focus), single-shot consumption.
  useEffect(() => {
    if (ui === "idle" && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      triggerRef.current?.focus();
    }
  }, [ui]);

  // Snap back to idle when the transition settles so the outcome banner anchors next to the row.
  useEffect(() => {
    if (!isPending && outcome !== null && ui === "resolving") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUi("idle");
    }
  }, [isPending, outcome, ui]);

  // PCR-1 (d): auto-dismiss the SUCCESS banner; errors persist.
  useEffect(() => {
    if (outcome?.kind !== "ok") return;
    const t = setTimeout(() => setOutcome(null), SUCCESS_DISMISS_MS);
    return () => clearTimeout(t);
  }, [outcome]);

  const isResolving = ui === "resolving" || isPending;

  const enterConfirm = () => {
    clearAutoRevert();
    setOutcome(null);
    setUi("confirm");
    autoRevertRef.current = setTimeout(() => {
      closeConfirm();
    }, ARM_REVERT_MS);
  };

  const onCancel = () => {
    clearAutoRevert();
    closeConfirm();
  };

  const onConfirm = () => {
    clearAutoRevert();
    setUi("resolving");
    // not-subject:M5-D8 — outcome copy is admin-authored inline BY DESIGN (spec §6.2): the
    // picker message catalog is crew-oriented and would misattribute an admin reset. No raw
    // error CODE is ever rendered (codes are mapped to these sentences here).
    startTransition(async () => {
      const r = await resetPickerEpoch({ showId });
      // not-subject:M5-D8 — admin-authored inline copy (see rationale above).
      setOutcome(
        r.ok
          ? { kind: "ok", message: "Everyone will pick again on their next visit." }
          : { kind: "error", message: "Couldn't reset the picker. Please try again." },
      );
    });
  };

  const banners = (
    <>
      {/* PCR-1 (a): persistent, visually-hidden polite live region (see prior
          revision's rationale — real element, not display:contents). */}
      <div className="sr-only" role="status" aria-live="polite">
        {outcome?.kind === "ok" ? outcome.message : ""}
      </div>
      {ui === "idle" && outcome?.kind === "ok" && (
        <p
          data-testid="picker-reset-ok"
          aria-hidden="true"
          className="rounded-sm bg-surface-raised px-2 py-1 text-sm text-text-strong"
        >
          <span aria-hidden="true" className="mr-1 font-semibold text-accent-on-bg">
            ✓
          </span>
          {outcome.message}
        </p>
      )}
      {ui === "idle" && outcome?.kind === "error" && (
        <p
          data-testid="picker-reset-error"
          role="alert"
          className="rounded-sm bg-warning-bg px-2 py-1 text-sm text-warning-text"
        >
          {outcome.message}
        </p>
      )}
    </>
  );

  const inConfirm = ui === "confirm" || ui === "resolving";

  return (
    <div className="flex flex-col gap-2 py-3" data-testid="picker-reset-control">
      <div className="min-w-0">
        {/* PCR-1 (b): heading so the control is reachable in the SR heading outline. */}
        <h4 className="text-sm font-medium text-text-strong">Reset everyone&rsquo;s pick</h4>
        <p id={descId} className="text-xs text-text-subtle">
          {hasCrew
            ? "Make everyone pick their name again on their next visit."
            : "No crew to reset yet."}
        </p>
      </div>

      {inConfirm ? (
        <div
          ref={confirmRowRef}
          data-testid="picker-reset-confirm-row"
          role="group"
          aria-label="Confirm resetting picker selections for everyone on this show"
          className="flex flex-col gap-2"
        >
          <p id={warningId} className="text-xs text-text-subtle">
            Every device&rsquo;s picker re-prompts on next visit.
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={isResolving}
              aria-busy={isResolving}
              aria-describedby={warningId}
              data-testid="picker-reset-confirm-button"
              className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-warning-text px-4 py-2 font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isResolving ? "Resetting…" : "Confirm reset"}
            </button>
            <button
              type="button"
              ref={cancelRef}
              onClick={onCancel}
              disabled={isResolving}
              data-testid="picker-reset-cancel-button"
              className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm border border-border bg-surface px-4 py-2 text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          ref={triggerRef}
          onClick={enterConfirm}
          disabled={!hasCrew}
          data-testid="picker-reset-all-button"
          className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center gap-1.5 self-start rounded-sm border border-border-strong bg-surface px-3 text-sm font-semibold text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw aria-hidden="true" size={14} />
          Reset everyone&rsquo;s pick
        </button>
      )}

      {banners}
    </div>
  );
}
```

Deletions vs the old file: `Scope` type + `scope` state, `memberLabel` (nothing else imports it — verified by grep), member `<select>` + label + `onSelectChange`, per-member Reset button, the `resetCrewMemberSelection` import and outcome branches, `selectedId`/`selectedRow`/`selectedLabel`.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/admin/pickerResetControl.test.tsx tests/styles/_metaDestructiveConfirm.test.ts`
Expected: PASS (registry row for PickerResetControl still valid — confirm CTA recipe unchanged).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit --no-verify -m "refactor(admin): PickerResetControl slims to everyone-only — per-member reset lives in the crew row menu"
```

---

### Task 3: Real-browser spec GREEN (authored RED in Task 0)

**Files:**
- Create: `tests/e2e/published-review-modal.crew-actions.spec.ts`
- Modify: `playwright.config.ts:70` (desktop-chromium testMatch), `.github/workflows/published-modal-e2e.yml` (paths `:35-52`, run command `:126`)

**Interfaces:**
- Consumes: `signInAs`/`signOut` (`tests/e2e/helpers/signInAs.ts`), `ADMIN_FIXTURE` (`tests/e2e/helpers/fixtures.ts`), `seedShowWithCrew`/`deleteSeededShow` (`tests/e2e/helpers/seedShowWithCrew.ts:106`), `settleDashboardAdminState` (`tests/e2e/helpers/dashboardState.ts`), the modal-open pattern from `published-review-modal.interactions.spec.ts:95-112`.

- [ ] **Step 1: Spec content** (authored in Task 0; reproduced here as the canonical text — full file; TOL 0.5):

```ts
/**
 * tests/e2e/published-review-modal.crew-actions.spec.ts (crew-row-controls)
 *
 * LIVE real-browser gate for the crew-row action menu inside the published
 * review modal (spec §6b + §8). Static harnesses cannot open popovers
 * (renderToStaticMarkup hides client-only mounts), so geometry AND
 * interaction assertions all live here against the real app.
 */
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { seedShowWithCrew, deleteSeededShow, type SeededShow } from "./helpers/seedShowWithCrew";
import { settleDashboardAdminState } from "./helpers/dashboardState";

const TOL = 0.5;
const LONG_NAME = "X".repeat(120);

let show: SeededShow;
let restoreDashboardState: (() => Promise<void>) | null = null;

test.beforeAll(async () => {
  // Modal mounts only on the SETTLED dashboard branch — same pattern as
  // published-review-modal.deeplink.spec.ts:71-75.
  restoreDashboardState = await settleDashboardAdminState();
  show = await seedShowWithCrew({
    crew: [
      { name: "Alex Rodrigues", role: "V1" },
      { name: "Bea Ortiz", role: "A1" },
      { name: LONG_NAME, role: "BO" },
    ],
  });
});
test.afterAll(async () => {
  if (show) await deleteSeededShow(show.driveFileId);
  if (restoreDashboardState) await restoreDashboardState();
});

const BASE = "published-show-review";
const MODAL_ANY = `[data-testid="${BASE}-modal"]`;
// LOADED modal only (skeleton twin renders no title node) — see
// published-review-modal.interactions.spec.ts:50-63.
const MODAL = `${MODAL_ANY}:has([data-testid="${BASE}-title"])`;

async function openModal(page: Page) {
  await signInAs(page, ADMIN_FIXTURE);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/admin?show=${show.slug}`);
  // Mirror published-review-modal.interactions.spec.ts:104-120 — loaded frame
  // visible, skeleton twin gone, and the shell's effect-driven initial focus
  // landed (proves the passive-effect flush; synthetic gestures before that
  // are silently lost).
  await expect(page.locator(MODAL)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(MODAL_ANY)).toHaveCount(1);
  await expect
    .poll(
      () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.testid),
      { message: "loaded modal's effect flush completed (initial focus applied)" },
    )
    .toBe(`${BASE}-close`);
}

function rowTrigger(page: Page, crewId: string) {
  return page.getByTestId(`crew-row-menu-button-${crewId}`);
}

test.afterEach(async ({ page }) => {
  await signOut(page);
});

test("dimensional invariants: trigger 44×44 with 32×32 centered visual; menu flush right, 6px below cluster", async ({ page }) => {
  await openModal(page);
  const crewId = show.crew[0].id;
  const trigger = rowTrigger(page, crewId);
  await trigger.scrollIntoViewIfNeeded();
  const tb = (await trigger.boundingBox())!;
  expect(tb.width).toBeGreaterThanOrEqual(44 - TOL);
  expect(tb.height).toBeGreaterThanOrEqual(44 - TOL);
  const vb = (await trigger.locator("span").first().boundingBox())!;
  expect(Math.abs(vb.width - 32)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(vb.height - 32)).toBeLessThanOrEqual(TOL);
  // centered within the hit box
  expect(Math.abs(vb.x + vb.width / 2 - (tb.x + tb.width / 2))).toBeLessThanOrEqual(1);
  await trigger.click();
  const menu = page.getByTestId(`crew-row-menu-${crewId}`);
  await expect(menu).toBeVisible();
  const mb = (await menu.boundingBox())!;
  const cluster = (await trigger.locator("xpath=..").boundingBox())!; // relative wrapper
  expect(Math.abs(mb.x + mb.width - (cluster.x + cluster.width))).toBeLessThanOrEqual(TOL);
  expect(Math.abs(mb.y - (cluster.y + cluster.height + 6))).toBeLessThanOrEqual(TOL);
  // Containment: menu fully inside the modal scroller's visible box AND the viewport.
  const scroller = page.locator('[data-testid$="-review-content"]').first();
  const sb = (await scroller.boundingBox())!;
  expect(mb.y).toBeGreaterThanOrEqual(sb.y - TOL);
  expect(mb.y + mb.height).toBeLessThanOrEqual(sb.y + sb.height + TOL);
  const vp = page.viewportSize()!;
  expect(mb.x).toBeGreaterThanOrEqual(-TOL);
  expect(mb.x + mb.width).toBeLessThanOrEqual(vp.width + TOL);
  // Z-order: elementFromPoint at the menu's center resolves inside the menu
  // (viewport coords — reference_playwright_elementfrompoint_viewport_coords).
  const centerHit = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid^="crew-row-menu-"]') !== null,
    [mb.x + mb.width / 2, mb.y + mb.height / 2] as const,
  );
  expect(centerHit).toBe(true);
});

test("stacking contract: open-trigger click hits the backdrop and closes; second click reopens; other-row trigger also closes only", async ({ page }) => {
  await openModal(page);
  const [a, b] = [show.crew[0].id, show.crew[1].id];
  await rowTrigger(page, a).scrollIntoViewIfNeeded();
  await rowTrigger(page, a).click();
  await expect(page.getByTestId(`crew-row-menu-${a}`)).toBeVisible();
  // elementFromPoint at the trigger's center resolves to the backdrop
  const tb = (await rowTrigger(page, a).boundingBox())!;
  const topEl = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.getAttribute("data-testid") ?? "",
    [tb.x + tb.width / 2, tb.y + tb.height / 2] as const,
  );
  expect(topEl).toBe(`crew-row-backdrop-${a}`);
  await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await expect(page.getByTestId(`crew-row-menu-${a}`)).toHaveCount(0);
  await rowTrigger(page, a).click(); // second click reopens
  await expect(page.getByTestId(`crew-row-menu-${a}`)).toBeVisible();
  // clicking row B's trigger (under the backdrop) closes only
  const bb = (await rowTrigger(page, b).boundingBox())!;
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await expect(page.getByTestId(`crew-row-menu-${a}`)).toHaveCount(0);
  await expect(page.getByTestId(`crew-row-menu-${b}`)).toHaveCount(0);
});

test("Esc closes and restores focus to the trigger; backdrop click does not restore", async ({ page }) => {
  await openModal(page);
  const crewId = show.crew[0].id;
  await rowTrigger(page, crewId).scrollIntoViewIfNeeded();
  await rowTrigger(page, crewId).click();
  // first menuitem receives focus (poll — effect flush)
  await expect(page.getByTestId(`admin-show-preview-as-link-${crewId}`)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId(`crew-row-menu-${crewId}`)).toHaveCount(0);
  await expect(rowTrigger(page, crewId)).toBeFocused();
  // Backdrop-click branch: closes WITHOUT restoring trigger focus (spec §4.2).
  await rowTrigger(page, crewId).click();
  await expect(page.getByTestId(`crew-row-menu-${crewId}`)).toBeVisible();
  const panel = page.locator("[data-review-modal-panel]");
  const pb = (await panel.boundingBox())!;
  await page.mouse.click(pb.x + 8, pb.y + 8); // far corner — lands on the backdrop
  await expect(page.getByTestId(`crew-row-menu-${crewId}`)).toHaveCount(0);
  const focusedIsTrigger = await page.evaluate(
    (sel) => document.activeElement === document.querySelector(sel),
    `[data-testid="crew-row-menu-button-${crewId}"]`,
  );
  expect(focusedIsTrigger).toBe(false);
});

test("scroll-edge: popover forced to open past the scrollport bottom is scrolled into view (scrollTop increases) and confirm is clickable", async ({ page }) => {
  await openModal(page);
  const lastId = show.crew[show.crew.length - 1].id;
  const scroller = page.locator('[data-testid$="-review-content"]').first();
  const triggerSel = `[data-testid="crew-row-menu-button-${lastId}"]`;
  await rowTrigger(page, lastId).scrollIntoViewIfNeeded();
  // PRECONDITION (anti-tautology): position the trigger ~20px above the
  // scroller's bottom edge so a downward popover CANNOT fit without the
  // mount-time scrollIntoView. Assert the forced geometry before opening.
  await scroller.evaluate((s, tSel) => {
    const t = document.querySelector(tSel)!;
    const sr = s.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    s.scrollTop += tr.bottom - sr.top - s.clientHeight + 20;
  }, triggerSel);
  const preTb = (await rowTrigger(page, lastId).boundingBox())!;
  const preSb = (await scroller.boundingBox())!;
  const spaceBelow = preSb.y + preSb.height - (preTb.y + preTb.height);
  expect(spaceBelow).toBeLessThanOrEqual(60); // menu needs ~110px — must overflow
  const scrollTop0 = await scroller.evaluate((s) => s.scrollTop);
  await rowTrigger(page, lastId).click();
  const menu = page.getByTestId(`crew-row-menu-${lastId}`);
  await expect(menu).toBeVisible();
  // scrollIntoView(block:nearest) must have scrolled the scroller down…
  const scrollTop1 = await scroller.evaluate((s) => s.scrollTop);
  expect(scrollTop1).toBeGreaterThan(scrollTop0);
  // …and the popover must now be fully inside the scrollport.
  const sb = (await scroller.boundingBox())!;
  const mb = (await menu.boundingBox())!;
  expect(mb.y).toBeGreaterThanOrEqual(sb.y - TOL);
  expect(mb.y + mb.height).toBeLessThanOrEqual(sb.y + sb.height + TOL);
  await page.getByTestId(`crew-row-reset-item-${lastId}`).click();
  const confirm = page.getByTestId(`crew-row-reset-confirm-${lastId}`);
  await expect(confirm).toBeVisible();
  const cb = (await confirm.boundingBox())!;
  expect(cb.y + cb.height).toBeLessThanOrEqual(sb.y + sb.height + TOL);
  // long unbroken name wraps: no horizontal overflow, width pinned 268
  expect(Math.abs(cb.width - 268)).toBeLessThanOrEqual(TOL);
  const overflow = await confirm.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // z-order: confirm CTA is genuinely clickable (elementFromPoint resolves inside it)
  const goBox = (await page.getByTestId("crew-row-reset-confirm-go").boundingBox())!;
  const onTop = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el ? (el.closest('[data-testid^="crew-row-reset-confirm-"]') ? "confirm" : el.tagName) : "none";
    },
    [goBox.x + goBox.width / 2, goBox.y + goBox.height / 2] as const,
  );
  expect(onTop).toBe("confirm");
  // Cancel (do not actually reset in this test)
  await page.getByTestId("crew-row-reset-cancel").click();
  await expect(confirm).toHaveCount(0);
});

test("Preview as navigates to the impersonated preview route", async ({ page }) => {
  await openModal(page);
  const crewId = show.crew[0].id;
  await rowTrigger(page, crewId).scrollIntoViewIfNeeded();
  await rowTrigger(page, crewId).click();
  await page.getByTestId(`admin-show-preview-as-link-${crewId}`).click();
  await page.waitForURL(`**/admin/show/${show.slug}/preview/${crewId}`);
});

test("confirm reset round-trips: success banner appears at the panel top", async ({ page }) => {
  await openModal(page);
  const crewId = show.crew[1].id;
  await rowTrigger(page, crewId).scrollIntoViewIfNeeded();
  await rowTrigger(page, crewId).click();
  await page.getByTestId(`crew-row-reset-item-${crewId}`).click();
  await page.getByTestId("crew-row-reset-confirm-go").click();
  await expect(page.getByTestId("crew-row-reset-ok")).toContainText(
    "Reset Bea Ortiz. They'll pick again next visit.",
  );
  await expect(page.getByTestId(`crew-row-reset-confirm-${crewId}`)).toHaveCount(0);
});
```

- [ ] **Step 2: CI wiring** (applied in Task 0; verify it matches):
  - `playwright.config.ts` desktop-chromium testMatch: extend the alternation with `published-review-modal\.crew-actions` (alongside the existing `published-review-modal\.*` entries).
  - `.github/workflows/published-modal-e2e.yml`: add to `paths:`: `"tests/e2e/published-review-modal.crew-actions.spec.ts"`, `"components/admin/wizard/step3ReviewSections.tsx"`, `"components/admin/wizard/CrewRowActions.tsx"`; append `tests/e2e/published-review-modal.crew-actions.spec.ts` to the run command at `:126`.

- [ ] **Step 3: Run locally — now GREEN** (lsof-check :3000 for a sibling dev server first, per known lesson):

Run: `pnpm exec playwright test --project=desktop-chromium tests/e2e/published-review-modal.crew-actions.spec.ts`
Expected: all tests PASS (they were RED in Task 0; Tasks 1-2 made them pass).

- [ ] **Step 4: Commit** (only if the spec needed fixes against real behavior)

```bash
git add -A && git commit --no-verify -m "test(admin): crew-row menu e2e green — adjustments from real-browser run"
```

---

### Task 4: Help copy

**Files:**
- Modify: `app/help/admin/per-show-panel/page.mdx:9,55-67`, `app/help/admin/preview-as-crew/page.mdx:5`

- [ ] **Step 1: Edit copy.**
  - `per-show-panel/page.mdx:9`: "The crew roster (each row has a **Preview as** link)" → "The crew roster (each row has a **⋮ menu** with **Preview as** and **Reset name picker**)".
  - `per-show-panel/page.mdx:57`: "Each crew member parsed from the sheet gets a row with a **Preview as** button; tapping a row drops you" → "Each crew member parsed from the sheet gets a row; **Preview as** lives in the row's **⋮ menu**, and tapping it drops you".
  - `per-show-panel/page.mdx:65`: "and a **Reset name picker** control (reset one crew member's pick, or everyone's)" → "and a **Reset everyone's pick** control (reset one crew member instead from that row's **⋮ menu** in the crew section)".
  - `preview-as-crew/page.mdx:5`: "and the **Preview as** action drops you onto their crew page" → "and the **Preview as** action in the row's **⋮ menu** drops you onto their crew page".
- [ ] **Step 2: Verify no stale references**: `rg -n "Preview as. link|Preview as. button" app/help` → no hits. Then run the help e2e explicitly (h1s unchanged, but the spec walks these pages): `pnpm exec playwright test --project=mobile-safari tests/e2e/help-pages.spec.ts` → PASS.
- [ ] **Step 3: Commit**

```bash
git add -A && git commit --no-verify -m "docs(admin): help copy — crew row ⋮ menu owns Preview as + Reset name picker"
```

---

### Task 5: Full local gates (no commit unless fixes needed)

- [ ] `pnpm test` (full suite — scoped runs miss registry fan-out)
- [ ] `pnpm typecheck` (vitest strips types)
- [ ] `pnpm lint` (canonical Tailwind class order)
- [ ] `pnpm format:check` (`--no-verify` bypassed prettier)
- [ ] `pnpm build` (RSC boundary / client-import checks only surface at build)
- [ ] E2e re-run: `pnpm exec playwright test --project=desktop-chromium tests/e2e/published-review-modal.crew-actions.spec.ts tests/e2e/published-review-modal.interactions.spec.ts`
Expected: all green. Fix-and-commit any failures (`fix(admin): …`).

---

## Post-plan pipeline (ship-feature stages, not plan tasks)

Invariant-8 impeccable dual gate (`/impeccable critique` + `/impeccable audit` on the diff, P0/P1 fixed or DEFERRED.md) → whole-diff Codex adversarial review to APPROVE → push, PR, real CI green → `gh pr merge --merge` → ff local main.
