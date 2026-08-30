/** @vitest-environment jsdom */
/**
 * The "Draft restored" note (spec 2026-08-30 §3.2-§3.6).
 *
 * Tests the component directly rather than through the modal. That is not a
 * shortcut: the note HAS to be a component, because Step3ReviewModal renders
 * ReviewModalShell and AdminAnnounceProvider lives inside that shell, so a
 * useContext call in the modal's own body would read the admin-layout channel
 * instead of the dialog-local one. Being a component is what makes it testable
 * standalone, and the standalone test is what makes AC-10 structural.
 */
import { render, screen, act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UndoAnnounceContext } from "@/components/admin/undoAnnounceContext";
import {
  ANNOUNCE_DELAY_MS,
  DRAFT_RESTORED_NOTE,
  DRAFT_RESTORED_NOTE_MS,
  DraftRestoredNote,
} from "@/components/admin/wizard/DraftRestoredNote";
import { REPORT_MESSAGE_MAX_CHARS, reportDraftStorageKey } from "@/lib/admin/reportDraftStore";

import { STEP3_FIXTURE_DFID as DFID, STEP3_FIXTURE_WSID as WSID } from "./_step3ReviewFixture";

const KEY = reportDraftStorageKey(WSID, DFID);
const NOTE = `wizard-step3-card-${DFID}-draft-restored-note`;

function mount(announce = vi.fn()) {
  const utils = render(
    <UndoAnnounceContext.Provider value={{ announce }}>
      <DraftRestoredNote dfid={DFID} wizardSessionId={WSID} />
    </UndoAnnounceContext.Provider>,
  );
  return { announce, ...utils };
}

describe("DraftRestoredNote (spec §3.2-§3.6)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.sessionStorage.clear();
  });

  it("premise: the key under test is the one the component reads", () => {
    expect(KEY).toBe(`fxav-report-draft-wizard-${WSID}-${DFID}`);
  });

  it("renders when a non-empty draft was restored (AC-8)", () => {
    window.sessionStorage.setItem(KEY, "half a sentence");
    mount();
    expect(screen.getByTestId(NOTE)).toBeTruthy();
  });

  it.each([
    ["absent key", null],
    ["empty string", ""],
    ["whitespace only", "   \n\t "],
  ])("does not render for %s (AC-9)", (_label, value) => {
    if (value !== null) window.sessionStorage.setItem(KEY, value);
    mount();
    expect(screen.queryByTestId(NOTE)).toBeNull();
  });

  it.each([
    ["one character", "x"],
    ["at the cap", "x".repeat(REPORT_MESSAGE_MAX_CHARS)],
  ])("renders for %s (AC-9)", (_label, value) => {
    window.sessionStorage.setItem(KEY, value);
    mount();
    expect(screen.getByTestId(NOTE)).toBeTruthy();
  });

  it("never appears after mount, however the store changes (AC-10)", () => {
    const { rerender } = mount();
    expect(screen.queryByTestId(NOTE)).toBeNull();
    act(() => {
      window.sessionStorage.setItem(KEY, "typed after opening");
      vi.advanceTimersByTime(1000);
    });
    // A rerender is the strongest form of this: an implementation that re-reads
    // the store on render, or that is driven by the textarea's onChange, shows
    // the note here. One that reads only in its mount initializer cannot.
    rerender(
      <UndoAnnounceContext.Provider value={{ announce: vi.fn() }}>
        <DraftRestoredNote dfid={DFID} wizardSessionId={WSID} />
      </UndoAnnounceContext.Provider>,
    );
    expect(screen.queryByTestId(NOTE), "the note is a restore signal, not a draft signal").toBeNull();
  });

  it("dismisses on its own timer and not before (AC-15)", () => {
    window.sessionStorage.setItem(KEY, "half a sentence");
    mount();
    act(() => void vi.advanceTimersByTime(DRAFT_RESTORED_NOTE_MS - 1));
    expect(screen.queryByTestId(NOTE), "still up one tick early").toBeTruthy();
    act(() => void vi.advanceTimersByTime(2));
    expect(screen.queryByTestId(NOTE), "gone one tick late").toBeNull();
  });

  it.each([
    ["cleared", () => window.sessionStorage.removeItem(KEY)],
    ["submitted and the key removed", () => window.sessionStorage.removeItem(KEY)],
    ["edited to something else", () => window.sessionStorage.setItem(KEY, "different")],
  ])("stays accurate and still dismisses on its timer when the draft is %s (AC-18)", (_l, mutate) => {
    window.sessionStorage.setItem(KEY, "half a sentence");
    mount();
    const before = screen.getByTestId(NOTE).textContent;
    act(() => {
      mutate();
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId(NOTE).textContent, "copy describes the restore, not the draft now").toBe(
      before,
    );
    act(() => void vi.advanceTimersByTime(DRAFT_RESTORED_NOTE_MS - 999));
    expect(screen.queryByTestId(NOTE), "its own timer still owns the dismissal").toBeNull();
  });

  it("copy is past tense, so nothing the operator does can falsify it (AC-18)", () => {
    // Not a denylist of three phrasings: the copy must not make ANY
    // present-tense claim about the draft's current state, so the assertion is
    // that it contains no present-tense verb pointing at the draft.
    expect(DRAFT_RESTORED_NOTE).toMatch(/restored/i);
    expect(
      DRAFT_RESTORED_NOTE,
      "no present-tense claim about the draft (it can be cleared inside the window)",
    ).not.toMatch(/\b(is|are|remains|remain|stays|sits|waits|awaits)\b/i);
  });

  it("announces once per mount, only with a draft, matching the visible copy (AC-13)", () => {
    window.sessionStorage.setItem(KEY, "half a sentence");
    const first = mount();
    // Deliberately delayed off the dialog-open announcement, so nothing has
    // been said yet at mount.
    expect(first.announce, "held back at mount").not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(ANNOUNCE_DELAY_MS));
    expect(first.announce).toHaveBeenCalledTimes(1);
    expect(first.announce.mock.calls[0]![0]).toBe(screen.getByTestId(NOTE).textContent);
    // Not "once ever": advancing past the dismissal must not announce again.
    act(() => void vi.advanceTimersByTime(DRAFT_RESTORED_NOTE_MS + 1000));
    expect(first.announce, "no second announcement on dismissal").toHaveBeenCalledTimes(1);
    cleanup();

    // A fresh mount WITH a draft announces again: this is per-mount, not once
    // per module. A module-global "announced already" flag fails here.
    const second = mount();
    act(() => void vi.advanceTimersByTime(ANNOUNCE_DELAY_MS));
    expect(second.announce, "a second mount with a draft announces again").toHaveBeenCalledTimes(1);
    cleanup();

    window.sessionStorage.clear();
    const third = mount();
    act(() => void vi.advanceTimersByTime(ANNOUNCE_DELAY_MS + 1000));
    expect(third.announce, "no draft, no announcement").not.toHaveBeenCalled();
  });

  it("copy holds the mechanical rules", () => {
    window.sessionStorage.setItem(KEY, "half a sentence");
    mount();
    const text = screen.getByTestId(NOTE).textContent ?? "";
    expect(text, "no em dash in user-visible copy").not.toMatch(/[—–]/);
    expect(text, "no apostrophe").not.toMatch(/['’]/);
    expect(text, "names the destination section").toContain("Report an issue");
  });

  it("is decorative in the DOM; the announcement carries it (AC-12)", () => {
    window.sessionStorage.setItem(KEY, "half a sentence");
    mount();
    const el = screen.getByTestId(NOTE);
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.getAttribute("role"), "conditionally mounted, so never a live region").toBeNull();
    expect(el.getAttribute("aria-live")).toBeNull();
  });

  it("renders nothing when the store is unreadable", () => {
    const spy = vi.spyOn(window.sessionStorage, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    mount();
    expect(screen.queryByTestId(NOTE), "degrades to no note, never a crash").toBeNull();
    spy.mockRestore();
  });
});
