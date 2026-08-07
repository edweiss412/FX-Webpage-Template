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
      // Scan the whole JSX ELEMENT, not one line. The testid, the role and the
      // className sit on three separate lines in every one of these files, so a
      // per-line scan could never see a transition class added to the className
      // line — the audit would pass while the exact edit it exists to forbid
      // shipped. transition-colors on the BUTTON is pre-existing and unrelated,
      // so only elements carrying a live-region role or a -result testid count.
      for (const element of src.split(/<(?=[A-Za-z])/)) {
        const isRegionOrResult = /role="(log|status)"|-result"/.test(element);
        if (isRegionOrResult && /transition-|animate-|duration-/.test(element)) {
          offenders.push(`${rel}: ${element.split("\n")[0]?.trim() ?? element.slice(0, 60)}`);
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

  it("the failure card appears with NO transition class on its wrapper", async () => {
    // Must assert on the FAILING branch. Asserting the idle className only ever
    // sees "sr-only", so the test could never observe the class the failure
    // state actually applies.
    const undoAction = vi.fn().mockResolvedValue({ ok: false, code: "UNDO_SUPERSEDED" });
    render(<UndoChangeButton changeLogId="cl-1" undoAction={undoAction} />);
    const result = screen.getByTestId("change-feed-undo-result");
    expect(result.className).toBe("sr-only"); // idle
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /undo this change/i }));
    });
    expect(result.className).not.toBe("sr-only"); // the failing branch really rendered
    expect(result.className).not.toMatch(/transition|animate|duration/);
  });

  it("the per-element scan CATCHES a planted transition on the failure className", () => {
    // Proves the scanner change above. The mutant puts the class on the same
    // line the real className occupies, three lines from the role attribute —
    // the shape a per-line scan silently passed.
    const planted = [
      "<div",
      '  data-testid="change-feed-undo-result"',
      '  role="status"',
      '  className={failing ? "rounded-sm transition-opacity duration-fast" : "sr-only"}',
      ">",
    ].join("\n");
    const offenders: string[] = [];
    for (const element of planted.split(/<(?=[A-Za-z])/)) {
      if (
        /role="(log|status)"|-result"/.test(element) &&
        /transition-|animate-|duration-/.test(element)
      ) {
        offenders.push(element);
      }
    }
    expect(offenders).toHaveLength(1);
  });

  it("row 6 compound: a failure card appearing does not disturb a pending announcement", async () => {
    // The inventory's compound row. Two independent regions, one status and one
    // log; neither may clear or reorder the other.
    const undoAction = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, code: "UNDO_SUPERSEDED" });
    render(
      <AdminAnnounceProvider testId="admin-undo-status" label="Status updates">
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
