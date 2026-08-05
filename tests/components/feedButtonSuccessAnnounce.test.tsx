// @vitest-environment jsdom
//
// BL-FEED-BUTTON-SUCCESS-ANNOUNCE — the success half of the feed-button
// announce channel (spec 2026-08-04-backlog-convergence-design §4.5 item 2).
//
// `feat/sync-feed-undo-announce` (PR #694) gave all three feed action buttons an
// always-mounted `role="status"` result node, so a FAILURE is announced as a
// text change inside a live region. Success stayed silent on two of the three:
// Undo announces via `undoneAnnouncement`, while Accept and the Mi-11 gate's
// Approve/Reject do nothing a screen-reader user can hear — the row simply
// changes underneath them on the next revalidation. That asymmetry is the entry.
//
// The ratified copy is the generic verb form mirroring Undo's settled grammar:
// "Change accepted" / "Change approved" / "Change rejected", with NO row name in
// the utterance (§4.5 item 2).
//
// ANTI-TAUTOLOGY. Two traps this suite is built to avoid:
//   1. A global `getByText(/change accepted/i)` passes if ANY node in the tree
//      says it — including the button's own label or an error panel. Every
//      assertion here is scoped INSIDE the announce region by testid, and the
//      region is the real `AdminAnnounceProvider` one, not a stub.
//   2. Asserting only that `announce` was called proves the wiring, not the
//      words, and a wrong string still passes. The assertions are on the text
//      that reaches the live region, and the exact string is pinned.
// Each success case is paired with its failure case, because a component that
// announced unconditionally would satisfy the success half alone.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AcceptChangeButton } from "@/components/admin/AcceptChangeButton";
import { AdminAnnounceProvider } from "@/components/admin/AdminAnnounceProvider";
import { Mi11GateActions } from "@/components/admin/Mi11GateActions";

afterEach(cleanup);

const REGION = "feed-announce-test-region";

function mount(ui: React.ReactNode) {
  return render(
    <AdminAnnounceProvider testId={REGION} label="Change feed status">
      {ui}
    </AdminAnnounceProvider>,
  );
}

/** Everything the live region says, and nothing any sibling says. */
function announced(): string {
  return screen.getByTestId(REGION).textContent ?? "";
}

async function click(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

describe("Accept", () => {
  it('announces "Change accepted" on {ok:true}, in the live region and nowhere else', async () => {
    const acceptAction = vi.fn().mockResolvedValue({ ok: true, count: 1 });
    mount(<AcceptChangeButton acceptAction={acceptAction} hiddenFields={{ showId: "s1" }} />);
    await click(/accept/i);

    await waitFor(() => expect(announced()).toContain("Change accepted"));
    // The utterance names no row: the entry is generic by ratification, so a
    // future "Change accepted: Alice Chen" is a copy regression, not an upgrade.
    expect(announced()).toBe("Change accepted");
    // And it is the REGION saying it, not the button. Strip the region from a
    // clone and the words must be gone from the rest of the tree entirely.
    const rest = document.body.cloneNode(true) as HTMLElement;
    rest.querySelector(`[data-testid="${REGION}"]`)?.remove();
    expect(rest.textContent).not.toMatch(/change accepted/i);
  });

  it("stays silent on a typed failure, so the announcement means what it says", async () => {
    const acceptAction = vi.fn().mockResolvedValue({ ok: false, code: "SYNC_INFRA_ERROR" });
    mount(<AcceptChangeButton acceptAction={acceptAction} hiddenFields={{ showId: "s1" }} />);
    await click(/accept/i);

    // The failure path still surfaces its own copy — this is not a regression of
    // PR #694 — but the SUCCESS sentence must be absent.
    await waitFor(() => {
      expect(
        within(screen.getByTestId("change-feed-accept-result")).getByTestId(
          "error-explainer-message",
        ),
      ).toBeInTheDocument();
    });
    expect(announced()).not.toMatch(/change accepted/i);
    expect(announced()).toBe("");
  });
});

describe("Mi-11 gate", () => {
  const gateProps = {
    holdId: "h1",
    disposition: { kind: "removal", name: "Alice Chen" } as never,
    baseModifiedTime: "2026-08-04T00:00:00Z",
  };

  it('announces "Change approved" on approve success and nothing on reject', async () => {
    const approveAction = vi.fn().mockResolvedValue({ ok: true });
    const rejectAction = vi.fn().mockResolvedValue({ ok: true });
    mount(
      <Mi11GateActions {...gateProps} approveAction={approveAction} rejectAction={rejectAction} />,
    );
    await click(/approve/i);

    await waitFor(() => expect(announced()).toContain("Change approved"));
    // Exactly the approve sentence: a shared handler that announced both verbs
    // would pass a `toContain` on either one.
    expect(announced()).toBe("Change approved");
    expect(announced()).not.toMatch(/rejected/i);
    // The disposition carries a name, and the utterance must not.
    expect(announced()).not.toMatch(/alice/i);
  });

  it('announces "Change rejected" on reject success, distinct from approve', async () => {
    const approveAction = vi.fn().mockResolvedValue({ ok: true });
    const rejectAction = vi.fn().mockResolvedValue({ ok: true });
    mount(
      <Mi11GateActions {...gateProps} approveAction={approveAction} rejectAction={rejectAction} />,
    );
    await click(/reject/i);

    await waitFor(() => expect(announced()).toContain("Change rejected"));
    expect(announced()).toBe("Change rejected");
    expect(announced()).not.toMatch(/approved/i);
  });

  it("stays silent when the gate action fails", async () => {
    const approveAction = vi.fn().mockResolvedValue({ ok: false, code: "SYNC_INFRA_ERROR" });
    const rejectAction = vi.fn().mockResolvedValue({ ok: true });
    mount(
      <Mi11GateActions {...gateProps} approveAction={approveAction} rejectAction={rejectAction} />,
    );
    await click(/approve/i);

    await waitFor(() => expect(approveAction).toHaveBeenCalled());
    expect(announced()).toBe("");
  });

  it("announces each of two sequential successes, so a repeat is not swallowed", async () => {
    // The channel is append-shaped precisely because an identical text swap may
    // not re-announce (announceLog.tsx). Approve then reject is two distinct
    // sentences; the region must hold both, in order.
    const approveAction = vi.fn().mockResolvedValue({ ok: true });
    const rejectAction = vi.fn().mockResolvedValue({ ok: true });
    mount(
      <Mi11GateActions {...gateProps} approveAction={approveAction} rejectAction={rejectAction} />,
    );
    await click(/approve/i);
    await waitFor(() => expect(announced()).toContain("Change approved"));
    await click(/reject/i);
    await waitFor(() => expect(announced()).toContain("Change rejected"));

    const region = screen.getByTestId(REGION);
    expect(region.childElementCount).toBe(2);
    expect(region.textContent).toBe("Change approvedChange rejected");
  });
});
