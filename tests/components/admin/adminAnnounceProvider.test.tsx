// @vitest-environment jsdom
//
// Task 6 — AdminAnnounceProvider (spec §3.5).
//
// The provider owns a channel whose region must survive every branch below it.
// Six review rounds established that any owner below a data-dependent branch has
// its region node REPLACED on the success it announces, so these assertions are
// about node identity, not text.
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen } from "@testing-library/react";
import { useContext } from "react";
import { describe, expect, it } from "vitest";
import { AdminAnnounceProvider } from "@/components/admin/AdminAnnounceProvider";
import { UndoAnnounceContext } from "@/components/admin/undoAnnounceContext";

/** A consumer buried arbitrarily deep, to prove context reaches descendants. */
function DeepConsumer({ message }: { message: string }) {
  const { announce } = useContext(UndoAnnounceContext);
  return (
    <button type="button" onClick={() => announce(message)}>
      announce
    </button>
  );
}

const LAYOUT = { testId: "admin-undo-status", label: "Status updates" } as const;

describe("AdminAnnounceProvider", () => {
  it("renders its region as the FIRST child, before children", () => {
    // Catches: the region drifting to a position whose sibling index can change.
    // A stable index is what stops React re-creating the node across branches.
    const { container } = render(
      <AdminAnnounceProvider {...LAYOUT}>
        <div data-testid="page">page</div>
      </AdminAnnounceProvider>,
    );
    const kids = Array.from(container.children) as HTMLElement[];
    expect(kids[0]?.getAttribute("data-testid")).toBe("admin-undo-status");
    expect(kids[1]?.getAttribute("data-testid")).toBe("page");
  });

  it("delivers announcements from a deeply nested consumer", () => {
    render(
      <AdminAnnounceProvider {...LAYOUT}>
        <div>
          <section>
            <DeepConsumer message={'Undone. "Crew member Alice Chen removed" no longer applies.'} />
          </section>
        </div>
      </AdminAnnounceProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "announce" }).click();
    });
    expect(screen.getByTestId("admin-undo-status")).toHaveTextContent(
      'Undone. "Crew member Alice Chen removed" no longer applies.',
    );
  });

  it("keeps the SAME region node when children are swapped wholesale", () => {
    // This is the Dashboard.tsx:565 shape: an infra result returns an entirely
    // different tree. Under every per-surface owner tried in review, that
    // replaced the region. Under the provider it must not.
    const { rerender } = render(
      <AdminAnnounceProvider {...LAYOUT}>
        <div data-testid="tree-a">A</div>
      </AdminAnnounceProvider>,
    );
    const before = screen.getByTestId("admin-undo-status");
    act(() => {
      screen.getByTestId("tree-a");
    });
    rerender(
      <AdminAnnounceProvider {...LAYOUT}>
        <main data-testid="tree-b">
          <p>completely different</p>
        </main>
      </AdminAnnounceProvider>,
    );
    expect(screen.getByTestId("admin-undo-status")).toBe(before);
    expect(screen.queryByTestId("tree-a")).toBeNull();
    expect(screen.getByTestId("tree-b")).toBeInTheDocument();
  });

  it("retains an announcement across a wholesale children swap", () => {
    // The announcement must outlive the branch change, not merely the node.
    const { rerender } = render(
      <AdminAnnounceProvider {...LAYOUT}>
        <DeepConsumer message={'Undone. "Crew member Bo Ray removed" no longer applies.'} />
      </AdminAnnounceProvider>,
    );
    const before = screen.getByTestId("admin-undo-status");
    act(() => {
      screen.getByRole("button", { name: "announce" }).click();
    });
    rerender(
      <AdminAnnounceProvider {...LAYOUT}>
        <div data-testid="tree-b">gone</div>
      </AdminAnnounceProvider>,
    );
    expect(screen.getByTestId("admin-undo-status")).toBe(before);
    expect(before).toHaveTextContent('Undone. "Crew member Bo Ray removed" no longer applies.');
  });

  it("takes testId and label as props rather than hard-coding them", () => {
    // ReviewModalShell has THREE render sites and derives every testid from
    // testIdBase; a hard-coded id would put one identifier on three regions.
    render(
      <AdminAnnounceProvider
        testId="show-review-modal-undo-status"
        label="Status updates in this dialog"
      >
        <span>x</span>
      </AdminAnnounceProvider>,
    );
    const el = screen.getByTestId("show-review-modal-undo-status");
    expect(el.getAttribute("aria-label")).toBe("Status updates in this dialog");
    expect(el.getAttribute("role")).toBe("log");
  });

  it("resolves a nested provider to the INNER channel only", () => {
    // The two-channel design: a consumer inside a dialog announces into the
    // dialog's region, and the layout region must stay empty. Nothing decides
    // this — React context resolves to the nearest provider.
    render(
      <AdminAnnounceProvider {...LAYOUT}>
        <AdminAnnounceProvider testId="dialog-undo-status" label="Status updates in this dialog">
          <DeepConsumer message={'Undone. "Crew member Cy Ng removed" no longer applies.'} />
        </AdminAnnounceProvider>
      </AdminAnnounceProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "announce" }).click();
    });
    expect(screen.getByTestId("dialog-undo-status")).toHaveTextContent(
      'Undone. "Crew member Cy Ng removed" no longer applies.',
    );
    expect(screen.getByTestId("admin-undo-status")).toHaveTextContent("");
  });
});

describe("the announce log's accessible name — PRODUCTION call sites", () => {
  // BL-CHANNEL-ANNOUNCER-RESIDUAL-ROLE-STATUS, the accessible-name half. The log
  // used to be named for undo alone, and the channel had already outgrown that
  // before this arc — it carries saved-role and sync-pause announcements — while
  // this arc widens it further with a load failure and a re-sync summary. A
  // region a screen-reader user navigates to by name should not misdescribe what
  // they will hear in it.
  //
  // READ FROM DISK, deliberately. Every other case in this file passes its OWN
  // `label` prop, so a fixture-level assertion proves nothing about what
  // production actually renders — it would pass against unrenamed sources. These
  // four are the real call sites; the assertion is green only when they rename.
  const read = (p: string) => readFileSync(join(__dirname, "..", "..", "..", p), "utf8");

  it("app/admin/layout.tsx labels all THREE providers 'Status updates'", () => {
    const src = read("app/admin/layout.tsx");
    expect(src.match(/label="Status updates"/g) ?? []).toHaveLength(3);
    // The old name must be GONE, not merely outnumbered: a partial rename that
    // left one provider behind would satisfy a count-only assertion only by
    // luck, and would give a screen-reader user two differently-named logs for
    // one channel.
    expect(src).not.toContain('label="Undo updates"');
  });

  it("ReviewModalShell labels the dialog log 'Status updates in this dialog'", () => {
    const src = read("components/admin/review/ReviewModalShell.tsx");
    expect(src).toContain('label="Status updates in this dialog"');
    expect(src).not.toContain('label="Undo updates in this dialog"');
  });
});
