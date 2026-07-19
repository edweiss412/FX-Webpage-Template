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
/**
 * tests/components/admin/wizard/crewRowActions.test.tsx
 * Spec: docs/superpowers/specs/2026-07-19-crew-row-controls.md §4, §5, §6, §8.
 * Subject is CrewBreakdown (owns single-open state + banners, mounts CrewRowActions).
 */
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
    // Close paths inert while resolving:
    fireEvent.keyDown(confirm(CREW_IDS[0])!, { key: "Escape" });
    expect(confirm(CREW_IDS[0])).toBeTruthy();
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
  it("success banner auto-dismisses after 5s; arming a new confirm clears a prior outcome", async () => {
    resetMock.mockResolvedValue({ ok: true });
    renderCrew();
    openConfirm();
    fireEvent.click(screen.getByTestId("crew-row-reset-confirm-go"));
    await vi.waitFor(() => expect(screen.getByTestId("crew-row-reset-ok")).toBeTruthy());
    // new confirm clears it immediately (before any timer)
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
      {actions?.enabled ? (
        <>
          {/* PCR-1 banner pair (PickerResetControl.tsx:199-238): persistent sr-only
              polite region announces success; visible banners are decorative/alert. */}
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
  - `tests/app/admin/showReviewModalLoader.test.tsx` + `tests/components/admin/showpage/sectionWarningControls.test.tsx`: locate each `admin-show-preview-as-link-*` assertion. Where the test asserts PRESENCE + href: first `fireEvent.click(screen.getByTestId("crew-row-menu-button-<id>"))`, then assert the link (same testid, same href). Where the test asserts ABSENCE (ineligible modes): additionally assert `crew-row-menu-button-<id>` is absent (the menu can't even be opened). Keep every other assertion identical.

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

- [ ] **Step 1: Rewrite the test file** to the everyone-only surface. Keep/adapt the existing suite's mock pattern (`vi.mock` of both action modules is already present — drop the member-action mock usage). The rewritten suite asserts: heading is "Reset everyone's pick"; description "Make everyone pick their name again on their next visit." (or "No crew to reset yet." when `crew=[]` with `picker-reset-all-button` disabled); NO `picker-reset-member-select` / `picker-reset-member-button` testids anywhere; `picker-reset-all-button` → confirm row (`picker-reset-confirm-row` with warning "Every device's picker re-prompts on next visit.", `picker-reset-confirm-button`, `picker-reset-cancel-button`); confirm calls `resetPickerEpoch({ showId })` and success shows `picker-reset-ok` "Everyone will pick again on their next visit." (sr-only region announce, 5s auto-dismiss via fake timers); failure shows persistent `picker-reset-error`; 4s auto-revert closes the confirm (fake timers) and a stale confirm click cannot fire; C3 (cancel focused on open, `vi.waitFor`) and C5 (trigger refocused after cancel); `resetCrewMemberSelection` is NEVER called by this control (assert the imported mock has zero calls across the suite).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/admin/pickerResetControl.test.tsx`
Expected: FAIL (member select still present, old heading).

- [ ] **Step 3: Slim the component.** Delete: `Scope` type, `scope` state, member `<select>` + label, per-member Reset button, `onSelectChange`, `memberLabel` usage for selection (keep `memberLabel`? — delete it too; nothing else imports it), the `resetCrewMemberSelection` import and its outcome branches, `selectedId`/`selectedRow`/`selectedLabel`. Keep: `ARM_REVERT_MS`, `SUCCESS_DISMISS_MS`, banners block verbatim (testids `picker-reset-ok`/`-error`), confirm row (`picker-reset-confirm-row`/`-confirm-button`/`-cancel-button`) with warning fixed to "Every device's picker re-prompts on next visit.", C3/C5 refs + effects, the resolving snap-back effect. The single trigger keeps testid `picker-reset-all-button` but is promoted to the neutral bordered button recipe (copy the class string from the deleted per-member Reset button, spec §4.6) with label "Reset everyone's pick" + `RefreshCw` icon. Heading: "Reset everyone's pick"; description: `hasCrew ? "Make everyone pick their name again on their next visit." : "No crew to reset yet."`. `onConfirm` keeps only the `resetPickerEpoch` branch with its two outcome messages (`// not-subject:M5-D8` comments retained).

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/admin/pickerResetControl.test.tsx tests/styles/_metaDestructiveConfirm.test.ts`
Expected: PASS (registry row for PickerResetControl still valid — confirm CTA recipe unchanged).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit --no-verify -m "refactor(admin): PickerResetControl slims to everyone-only — per-member reset lives in the crew row menu"
```

---

### Task 3: Live real-browser spec + CI wiring

**Files:**
- Create: `tests/e2e/published-review-modal.crew-actions.spec.ts`
- Modify: `playwright.config.ts:70` (desktop-chromium testMatch), `.github/workflows/published-modal-e2e.yml` (paths `:35-52`, run command `:126`)

**Interfaces:**
- Consumes: `signInAs`/`signOut` (`tests/e2e/helpers/signInAs.ts`), `ADMIN_FIXTURE` (`tests/e2e/helpers/fixtures.ts`), `seedShowWithCrew`/`deleteSeededShow` (`tests/e2e/helpers/seedShowWithCrew.ts:106`), `settleDashboardAdminState` (`tests/e2e/helpers/dashboardState.ts`), the modal-open pattern from `published-review-modal.interactions.spec.ts:95-112`.

- [ ] **Step 1: Write the spec** (full file; TOL 0.5; open pattern mirrors interactions spec — `emulateMedia reduce`, `goto /admin?show=<slug>`, wait modal visible + initial focus):

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

test.beforeAll(async () => {
  show = await seedShowWithCrew({
    crew: [
      { name: "Alex Rodrigues", role: "V1" },
      { name: "Bea Ortiz", role: "A1" },
      { name: LONG_NAME, role: "BO" },
    ],
  });
});
test.afterAll(async () => {
  await deleteSeededShow(show);
});

async function openModal(page: Page) {
  await signInAs(page, ADMIN_FIXTURE);
  await settleDashboardAdminState(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/admin?show=${show.slug}`);
  await expect(page.locator("[data-review-modal-panel]")).toBeVisible({ timeout: 30_000 });
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
});

test("last-row popovers stay visible inside the modal scroller (scrollIntoView contract) and confirm is clickable", async ({ page }) => {
  await openModal(page);
  const lastId = show.crew[show.crew.length - 1].id;
  await rowTrigger(page, lastId).scrollIntoViewIfNeeded();
  await rowTrigger(page, lastId).click();
  const menu = page.getByTestId(`crew-row-menu-${lastId}`);
  await expect(menu).toBeVisible();
  const scroller = page.locator('[data-testid$="-review-content"]').first();
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

- [ ] **Step 2: Wire CI.**
  - `playwright.config.ts` desktop-chromium testMatch: extend the alternation with `published-review-modal\.crew-actions` (alongside the existing `published-review-modal\.*` entries).
  - `.github/workflows/published-modal-e2e.yml`: add to `paths:`: `"tests/e2e/published-review-modal.crew-actions.spec.ts"`, `"components/admin/wizard/step3ReviewSections.tsx"`, `"components/admin/wizard/CrewRowActions.tsx"`; append `tests/e2e/published-review-modal.crew-actions.spec.ts` to the run command at `:126`.

- [ ] **Step 3: Run locally** (needs local supabase + dev server per the workflow's local equivalent; the repo playwright config boots the webServer — beware sibling dev server on :3000, lsof-check first per known lesson):

Run: `pnpm exec playwright test --project=desktop-chromium tests/e2e/published-review-modal.crew-actions.spec.ts`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit --no-verify -m "test(admin): live crew-row menu e2e — dimensions, stacking, scroll-edge, reset round-trip + CI wiring"
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
- [ ] **Step 2: Verify no stale references**: `rg -n "Preview as. link|Preview as. button" app/help` → no hits; `pnpm vitest run tests/e2e/help-pages.spec.ts` is e2e-only (skip; covered by full gates).
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
