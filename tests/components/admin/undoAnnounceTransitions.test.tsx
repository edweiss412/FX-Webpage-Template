// @vitest-environment jsdom
//
// Task 13 — transition audit against spec §10.2's six-row inventory.
//
// Every state change this feature introduces is deliberately INSTANT. The one
// that matters is the failure card: an error card that fades in delays the
// assistive-technology announcement behind a transition, so the inventory
// forbids it. This audit is what stops someone "improving" it later.
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminAnnounceProvider } from "@/components/admin/AdminAnnounceProvider";
import { UndoChangeButton } from "@/components/admin/UndoChangeButton";

afterEach(cleanup);

const ROOT = join(__dirname, "..", "..", "..");
const TOUCHED = [
  "components/admin/announceLog.tsx",
  "components/admin/AdminAnnounceProvider.tsx",
  "components/admin/UndoChangeButton.tsx",
  "components/admin/AcceptChangeButton.tsx",
  "components/admin/Mi11GateActions.tsx",
];

const srcOf = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("transition audit (spec §10.2)", () => {
  it("no animation is introduced on any surface this feature touches", () => {
    // Rows 1-3 of the inventory: the failure wrapper's three transitions are all
    // declared instant. An animated error card delays the announcement.
    const offenders: string[] = [];
    for (const rel of TOUCHED) {
      const src = srcOf(rel);
      // transition-colors on the BUTTON is pre-existing and unrelated to the
      // announcement path; only the result wrapper and the regions are audited.
      for (const line of src.split("\n")) {
        const isRegionOrResult = /role="(log|status)"|-result"/.test(line);
        if (isRegionOrResult && /transition-|animate-|duration-/.test(line)) {
          offenders.push(`${rel}: ${line.trim()}`);
        }
      }
      if (/AnimatePresence/.test(src)) offenders.push(`${rel}: AnimatePresence`);
    }
    expect(offenders, "announcement surfaces must be instant").toEqual([]);
  });

  it("the announce regions carry no transition classes at all", () => {
    // Rows 4-5: sr-only additions and cap removals are invisible by
    // construction, so any transition class on them is dead weight at best.
    const src = srcOf("components/admin/announceLog.tsx");
    expect(src).not.toMatch(/transition-|animate-|duration-|ease-/);
  });

  it("the failure card appears with NO transition class on its wrapper", () => {
    const undoAction = vi.fn().mockResolvedValue({ ok: false, code: "UNDO_SUPERSEDED" });
    render(<UndoChangeButton changeLogId="cl-1" undoAction={undoAction} />);
    const result = screen.getByTestId("change-feed-undo-result");
    expect(result.className).not.toMatch(/transition|animate|duration/);
  });

  it("row 6 compound: a failure card appearing does not disturb a pending announcement", async () => {
    // The inventory's compound row. Two independent regions, one status and one
    // log; neither may clear or reorder the other.
    const undoAction = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, code: "UNDO_SUPERSEDED" });
    render(
      <AdminAnnounceProvider testId="admin-undo-status" label="Undo updates">
        <UndoChangeButton
          changeLogId="cl-1"
          undoAction={undoAction}
          announceLabel="Crew member Alice Chen removed"
        />
      </AdminAnnounceProvider>,
    );
    const region = screen.getByTestId("admin-undo-status");

    await act(async () => {
      fireEvent.click(screen.getByTestId("change-feed-undo"));
    });
    expect(region).toHaveTextContent('Undone. "Crew member Alice Chen removed" no longer applies.');

    // Second submit fails: the status card fills, and the log region must keep
    // the earlier announcement untouched.
    await act(async () => {
      fireEvent.click(screen.getByTestId("change-feed-undo"));
    });
    expect(screen.getByTestId("change-feed-undo-result")).not.toHaveTextContent("");
    expect(region).toHaveTextContent('Undone. "Crew member Alice Chen removed" no longer applies.');
    expect(Array.from(region.children)).toHaveLength(1);
  });
});
