// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/crewRowActions.test.tsx
 * Spec: docs/superpowers/specs/2026-07-19-crew-row-controls.md §4, §5, §6, §8.
 * Subject is CrewBreakdown (owns single-open state + banners, mounts CrewRowActions).
 *
 * Transition audit (spec §6, plan Task 1 Step 6) — every conditional render in
 * CrewRowActions.tsx + the banner block in CrewBreakdown, checked against the
 * spec's 12-pair table:
 *   - `open && mode==="menu"` → route-enter on mount, instant unmount.
 *   - `open && (mode==="confirm" || mode==="resolving")` → route-enter on mount,
 *     instant unmount; confirm→resolving is an in-place prop change (the SAME
 *     conditional stays truthy, so the popover does not remount/re-animate).
 *   - backdrop `open && …` → instant both ways.
 *   - banners (`outcome?.kind` branches) → instant both ways.
 *   - No AnimatePresence anywhere in this module.
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

const MEMBERS = [
  member("Alex Rodrigues", "5125550101", "alex@x.test"),
  member("Kari Rose", null, null),
];
// Tuple type — indexing stays defined under noUncheckedIndexedAccess.
const CREW_IDS = [
  "c1111111-1111-4111-8111-111111111111",
  "c2222222-2222-4222-8222-222222222222",
] as const;
const [ID_A, ID_B] = CREW_IDS;
type CrewActions = { showId: string; slug: string; enabled: boolean; crewIds: readonly string[] };
const ACTIONS: CrewActions = {
  showId: "11111111-2222-4333-8444-555555555555",
  slug: "test-show",
  enabled: true,
  crewIds: CREW_IDS,
};

// `null` = explicitly ABSENT actions (staged mode); omitting the arg = default enabled.
function renderCrew(actions: CrewActions | null = ACTIONS, members = MEMBERS) {
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
    const { container } = renderCrew(null);
    expect(container.querySelector("button[aria-haspopup]")).toBeNull();
    // Concrete committed shape (step3ReviewSections.tsx:1283-1305), fixture-derived hrefs:
    const call = screen.getByLabelText("Call Alex Rodrigues");
    expect(call.getAttribute("href")).toBe("tel:5125550101");
    expect(call.className).toMatch(/\bsize-tap-min\b/);
    expect(call.querySelector("span")?.className).toMatch(/\bsize-8\b/);
    const mail = screen.getByLabelText("Email Alex Rodrigues");
    expect(mail.getAttribute("href")).toBe("mailto:alex@x.test");
    // No preview pill anywhere (moved into menu):
    expect(screen.queryByTestId(`admin-show-preview-as-link-${ID_A}`)).toBeNull();
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
    renderCrew({ ...ACTIONS, crewIds: [ID_A, ""] });
    expect(trigger(ID_A)).toBeTruthy();
    expect(screen.queryByTestId(`crew-row-menu-button-`)).toBeNull();
  });
});

describe("menu open/close + keyboard (spec §4.2)", () => {
  it("opens with first menuitem focused; ArrowDown/ArrowUp cycle; Home/End jump", async () => {
    renderCrew();
    fireEvent.click(trigger(ID_A));
    const m = menu(ID_A)!;
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
    fireEvent.click(trigger(ID_A));
    const link = screen.getByTestId(`admin-show-preview-as-link-${ID_A}`);
    expect(link.getAttribute("role")).toBe("menuitem");
    expect(link.getAttribute("href")).toBe(`/admin/show/test-show/preview/${ID_A}`);
  });
  it("menu has a role=separator divider", () => {
    renderCrew();
    fireEvent.click(trigger(ID_A));
    expect(menu(ID_A)!.querySelector('[role="separator"]')).toBeTruthy();
  });
  it("Escape closes, restores trigger focus, and never reaches document listeners (shell-close guard)", async () => {
    const docSpy = vi.fn();
    document.addEventListener("keydown", docSpy);
    try {
      renderCrew();
      fireEvent.click(trigger(ID_A));
      fireEvent.keyDown(menu(ID_A)!, { key: "Escape" });
      expect(menu(ID_A)).toBeNull();
      await vi.waitFor(() => expect(trigger(ID_A)).toHaveFocus());
      // stopPropagation kept the Escape from bubbling to document (the modal
      // shell's close listener lives there — ReviewModalShell.tsx:238-243).
      expect(docSpy).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", docSpy);
    }
  });
  it("Tab closes the menu (focus proceeds from trigger)", () => {
    renderCrew();
    fireEvent.click(trigger(ID_A));
    fireEvent.keyDown(menu(ID_A)!, { key: "Tab" });
    expect(menu(ID_A)).toBeNull();
  });
  it("backdrop click closes without reopening; single-open across rows", () => {
    renderCrew();
    fireEvent.click(trigger(ID_A));
    expect(menu(ID_A)).toBeTruthy();
    // Backdrop covers everything incl. row B's trigger — a click closes only.
    fireEvent.click(screen.getByTestId(`crew-row-backdrop-${ID_A}`));
    expect(menu(ID_A)).toBeNull();
    // Second click opens row B; row A stays closed (single openCrewId).
    fireEvent.click(trigger(ID_B));
    expect(menu(ID_B)).toBeTruthy();
    expect(menu(ID_A)).toBeNull();
  });
  it("Space activates the focused menuitem (Preview-as Link closes the menu); Enter opens the confirm from Reset", async () => {
    renderCrew();
    fireEvent.click(trigger(ID_A));
    const m = menu(ID_A)!;
    const items = Array.from(m.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    await vi.waitFor(() => expect(items[0]).toHaveFocus());
    fireEvent.keyDown(m, { key: " " }); // Space on the Link — no native activation, handler clicks
    expect(menu(ID_A)).toBeNull();
    fireEvent.click(trigger(ID_A));
    const m2 = menu(ID_A)!;
    const items2 = Array.from(m2.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    items2[1]!.focus();
    fireEvent.keyDown(m2, { key: "Enter" });
    expect(confirm(ID_A)).toBeTruthy();
  });
  it("aria-expanded tracks open state", () => {
    renderCrew();
    expect(trigger(ID_A).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger(ID_A));
    expect(trigger(ID_A).getAttribute("aria-expanded")).toBe("true");
  });
});

describe("confirm flow (spec §4.3, §4.4, §4.5, §6)", () => {
  function openConfirm(id: string = ID_A) {
    fireEvent.click(trigger(id));
    fireEvent.click(screen.getByTestId(`crew-row-reset-item-${id}`));
  }
  it("Reset name picker swaps menu → confirm; Cancel focused (C3); warning wraps; CTA described by warning", async () => {
    renderCrew();
    openConfirm();
    expect(menu(ID_A)).toBeNull();
    const c = confirm(ID_A)!;
    expect(c.textContent).toContain(
      "Alex Rodrigues will choose their name again on their next visit.",
    );
    const warning = c.querySelector("p[id]")!;
    expect(warning.className).toMatch(/\bwrap-break-word\b/);
    const go = screen.getByTestId("crew-row-reset-confirm-go");
    expect(go.getAttribute("aria-describedby")).toBe(warning.id);
    await vi.waitFor(() => expect(screen.getByTestId("crew-row-reset-cancel")).toHaveFocus());
  });
  it("confirm Tab is a 2-stop trap Cancel ⇄ Confirm (never behind the backdrop)", async () => {
    renderCrew();
    openConfirm();
    const c = confirm(ID_A)!;
    const cancel = screen.getByTestId("crew-row-reset-cancel");
    const go = screen.getByTestId("crew-row-reset-confirm-go");
    await vi.waitFor(() => expect(cancel).toHaveFocus());
    fireEvent.keyDown(c, { key: "Tab" });
    expect(go).toHaveFocus();
    fireEvent.keyDown(c, { key: "Tab", shiftKey: true });
    expect(cancel).toHaveFocus();
  });
  it("active-confirm Escape closes fully and never reaches document listeners", async () => {
    const docSpy = vi.fn();
    document.addEventListener("keydown", docSpy);
    try {
      renderCrew();
      openConfirm();
      fireEvent.keyDown(confirm(ID_A)!, { key: "Escape" });
      expect(confirm(ID_A)).toBeNull();
      expect(docSpy).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", docSpy);
    }
  });
  it("Cancel closes fully (not back to menu) and restores trigger focus (C5)", async () => {
    renderCrew();
    openConfirm();
    fireEvent.click(screen.getByTestId("crew-row-reset-cancel"));
    expect(confirm(ID_A)).toBeNull();
    expect(menu(ID_A)).toBeNull();
    await vi.waitFor(() => expect(trigger(ID_A)).toHaveFocus());
  });
  it("auto-revert closes the confirm after 4s and a stale Confirm cannot fire the action", () => {
    vi.useFakeTimers();
    try {
      renderCrew();
      openConfirm();
      const go = screen.getByTestId("crew-row-reset-confirm-go");
      act(() => vi.advanceTimersByTime(4_000));
      expect(confirm(ID_A)).toBeNull();
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
    expect(resetMock).toHaveBeenCalledWith({ showId: ACTIONS.showId, crewMemberId: ID_A });
    const go = screen.getByTestId("crew-row-reset-confirm-go") as HTMLButtonElement;
    await vi.waitFor(() => expect(go.disabled).toBe(true));
    expect(go.textContent).toContain("Resetting…");
    expect(go.getAttribute("aria-busy")).toBe("true");
    expect((screen.getByTestId("crew-row-reset-cancel") as HTMLButtonElement).disabled).toBe(true);
    // Resolving focus lands on the popover CONTAINER (buttons are disabled;
    // focus on <body> would let Escape bypass onConfirmKeyDown entirely).
    await vi.waitFor(() => expect(confirm(ID_A)).toHaveFocus());
    // Close paths inert while resolving — Esc fired from the REAL focused
    // element (also never bubbling to the shell's document listener),
    // backdrop click, auto-revert timer:
    const docSpy = vi.fn();
    document.addEventListener("keydown", docSpy);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    document.removeEventListener("keydown", docSpy);
    expect(confirm(ID_A)).toBeTruthy();
    expect(docSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId(`crew-row-backdrop-${ID_A}`));
    expect(confirm(ID_A)).toBeTruthy();
    // (Auto-revert timer was cleared on Confirm — advancing time must not close.)
    vi.useFakeTimers();
    try {
      act(() => vi.advanceTimersByTime(4_000));
      expect(confirm(ID_A)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
    resolve({ ok: true });
    await vi.waitFor(() => expect(confirm(ID_A)).toBeNull());
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
      expect(screen.getByTestId("crew-row-reset-error").textContent).toMatch(
        /no longer on the roster/,
      ),
    );
    expect(screen.getByTestId("crew-row-reset-error").getAttribute("role")).toBe("alert");
    // generic path
    resetMock.mockResolvedValue({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
    openConfirm(ID_B);
    fireEvent.click(screen.getByTestId("crew-row-reset-confirm-go"));
    await vi.waitFor(() =>
      expect(screen.getByTestId("crew-row-reset-error").textContent).toMatch(
        /Couldn't reset the picker/,
      ),
    );
  });
  it("a THROWN action settles to the generic error banner (no stranded resolving popover)", async () => {
    resetMock.mockRejectedValue(new Error("network death"));
    renderCrew();
    openConfirm();
    fireEvent.click(screen.getByTestId("crew-row-reset-confirm-go"));
    await vi.waitFor(() => expect(confirm(ID_A)).toBeNull());
    expect(screen.getByTestId("crew-row-reset-error").textContent).toMatch(
      /Couldn't reset the picker/,
    );
  });
  it("error banner persists past the 5s success-dismiss window", async () => {
    resetMock.mockResolvedValue({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
    vi.useFakeTimers();
    try {
      renderCrew();
      openConfirm();
      fireEvent.click(screen.getByTestId("crew-row-reset-confirm-go"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByTestId("crew-row-reset-error")).toBeTruthy();
      act(() => vi.advanceTimersByTime(6_000));
      expect(screen.getByTestId("crew-row-reset-error")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
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
    openConfirm(ID_B);
    expect(screen.queryByTestId("crew-row-reset-ok")).toBeNull();
  });
});
