// @vitest-environment jsdom
//
// developer-tier Task 18c (spec §13 Transition Inventory + AGENTS.md
// transition-audit) — the DeveloperToggleButton transition + compound-state
// audit.
//
// Transition inventory (spec §13):
//   | off → pending → on      | promote          | switch slides; disabled while pending |
//   | on → pending → off      | demote           | switch slides; disabled while pending |
//   | pending → off/on revert | error result     | revert optimistic; inline cataloged copy |
//   | any → locked            | actor's own row  | instant — static locked indicator |
//   | (hidden) → visible      | viewer is dev    | instant — control absent server-side for non-dev |
//   Compound: toggle row A while row B is mid-pending — independent useActionState.
//
// This suite (1) source-enumerates every conditional/ternary render + asserts the
// transitions are CSS-class-driven (no AnimatePresence / JS animation, so mount/
// unmount is deliberately instant), and (2) drives the behavioral transitions in
// jsdom with per-row deferred actions.
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { AdministratorsSection } from "@/components/admin/settings/AdministratorsSection";
import { getRequiredDougFacing } from "@/lib/messages/lookup";
import type { AdminEmailRow } from "@/lib/data/adminEmails";
import type { EmbeddedAdminEmailsResult } from "@/lib/admin/embeddedAdminEmails";
import type { SetDeveloperActionResult } from "@/app/admin/settings/admins/developerActions";

// Per-email deferred action controller: each submit registers a resolver keyed
// by its FormData `email`, so a test can hold row A pending while resolving row B
// (the compound-independence proof). This can ONLY pass if each row owns its own
// useActionState — a shared reducer would couple the two.
const ctl = vi.hoisted(() => ({
  resolvers: new Map<string, (r: SetDeveloperActionResult) => void>(),
  calls: [] as { email: string; is_developer: string }[],
}));
vi.mock("@/app/admin/settings/admins/developerActions", () => ({
  setDeveloperAction: (_prev: unknown, formData: FormData) => {
    const email = String(formData.get("email"));
    ctl.calls.push({ email, is_developer: String(formData.get("is_developer")) });
    return new Promise<SetDeveloperActionResult>((resolve) => {
      ctl.resolvers.set(email, resolve);
    });
  },
}));

vi.mock("@/app/admin/settings/admins/AddAdminForm", () => ({
  AddAdminForm: () => <div data-testid="mock-add-admin-form" />,
}));
vi.mock("@/app/admin/settings/admins/RevokeRowButton", () => ({
  RevokeRowButton: ({ email }: { email: string }) => (
    <button data-testid="mock-revoke-button" data-email={email}>
      Revoke
    </button>
  ),
}));
vi.mock("@/app/admin/settings/admins/ReAddRowButton", () => ({
  ReAddRowButton: ({ email }: { email: string }) => <button data-email={email}>Re-add</button>,
}));

const NOW = new Date("2026-06-01T12:00:00.000Z");
const ADMIN_SRC = readFileSync("components/admin/settings/AdministratorsSection.tsx", "utf8");
const TOGGLE_SRC = readFileSync("components/admin/settings/DeveloperToggleButton.tsx", "utf8");

function row(overrides: Partial<AdminEmailRow> & { email: string }): AdminEmailRow {
  return {
    email: overrides.email,
    added_by: overrides.added_by ?? "someone@example.com",
    added_at: overrides.added_at ?? "2026-05-01T00:00:00.000Z",
    revoked_by: overrides.revoked_by ?? null,
    revoked_at: overrides.revoked_at ?? null,
    note: overrides.note ?? null,
    is_developer: overrides.is_developer ?? false,
  };
}
function ok(rows: AdminEmailRow[]): EmbeddedAdminEmailsResult {
  return { kind: "ok", rows };
}
function rowByEmail(email: string): HTMLElement {
  return screen
    .getAllByTestId("admin-allowlist-row")
    .find((el) => el.getAttribute("data-row-email") === email)!;
}
function toggleIn(email: string): HTMLElement {
  return within(rowByEmail(email)).getByTestId("developer-toggle");
}
function renderDevView(rows: AdminEmailRow[], actor = "alice@example.com") {
  return render(
    <AdministratorsSection
      result={ok(rows)}
      actorCanonicalEmail={actor}
      now={NOW}
      viewerIsDeveloper={true}
    />,
  );
}

beforeEach(() => {
  ctl.resolvers.clear();
  ctl.calls = [];
});
afterEach(() => cleanup());

describe("DeveloperToggle transition audit (Task 18c)", () => {
  // ---- (1) static enumeration of every conditional render --------------------
  it("transitions are CSS-class-driven — no AnimatePresence / framer-motion (mount is instant)", () => {
    expect(TOGGLE_SRC).not.toMatch(/AnimatePresence|framer-motion|motion\./);
    // The slide is a CSS transition on the track/thumb, not a JS animation.
    expect(TOGGLE_SRC).toMatch(/transition-colors/);
    expect(TOGGLE_SRC).toMatch(/transition-transform/);
  });

  it("enumerates the conditional renders: optimistic display, pending-suppressed error, locked branch, dev-gated row block", () => {
    // Optimistic display + pending-suppressed error copy (interactive).
    expect(TOGGLE_SRC).toMatch(/isPending \? !checked : checked/);
    expect(TOGGLE_SRC).toMatch(/isPending \? null : errorCopyFor/);
    // Error copy is a ternary, rendered only when non-null.
    expect(TOGGLE_SRC).toMatch(/errorCopy \?/);
    // Locked branch returns a distinct static component (no hooks/action).
    expect(TOGGLE_SRC).toMatch(/if \(locked\) return <LockedDeveloperIndicator/);
    // The whole control is server-gated behind a ternary in AdminRow (instant —
    // absent for non-developers, no client transition).
    expect(ADMIN_SRC).toMatch(/viewerIsDeveloper \?/);
  });

  it("locked (actor) branch is static — no form submit, aria-disabled indicator", () => {
    renderDevView([
      row({ email: "alice@example.com", is_developer: true }),
      row({ email: "bob@example.com", is_developer: false }),
    ]);
    const self = toggleIn("alice@example.com");
    expect(self).toBeDisabled();
    expect(self.getAttribute("aria-disabled")).toBe("true");
    // No enclosing <form> on the locked variant (nothing to submit).
    expect(self.closest("form")).toBeNull();
    // Clicking it dispatches no action.
    fireEvent.click(self);
    expect(ctl.calls).toHaveLength(0);
  });

  it("(hidden → visible) is server-side: viewerIsDeveloper=false renders NO toggle (no client transition)", () => {
    render(
      <AdministratorsSection
        result={ok([row({ email: "alice@example.com" }), row({ email: "bob@example.com" })])}
        actorCanonicalEmail="alice@example.com"
        now={NOW}
        viewerIsDeveloper={false}
      />,
    );
    expect(screen.queryByTestId("developer-toggle")).toBeNull();
  });

  // ---- (2) behavioral transitions --------------------------------------------
  it("off → pending → on: disabled + aria-busy during flight, optimistic target shown", async () => {
    renderDevView([
      row({ email: "alice@example.com", is_developer: true }),
      row({ email: "bob@example.com", is_developer: false }), // off
    ]);
    const bob = toggleIn("bob@example.com");
    expect(bob.getAttribute("aria-checked")).toBe("false");

    await act(async () => {
      fireEvent.click(bob);
    });
    // Pending: disabled, aria-busy, switch shows the OPTIMISTIC target (on).
    const pending = toggleIn("bob@example.com");
    expect(pending).toBeDisabled();
    expect(pending.getAttribute("aria-busy")).toBe("true");
    expect(pending.getAttribute("aria-checked")).toBe("true");

    // Resolve ok → no longer pending (re-enabled), no error copy.
    await act(async () => {
      ctl.resolvers.get("bob@example.com")!({
        kind: "ok",
        email: "bob@example.com",
        isDeveloper: true,
      });
    });
    await waitFor(() => expect(toggleIn("bob@example.com")).not.toBeDisabled());
    expect(
      within(rowByEmail("bob@example.com")).queryByTestId("developer-toggle-error"),
    ).toBeNull();
  });

  it("pending → revert: an infra_error reverts the optimistic state AND shows cataloged copy", async () => {
    renderDevView([
      row({ email: "alice@example.com", is_developer: true }),
      row({ email: "bob@example.com", is_developer: false }), // off
    ]);
    await act(async () => {
      fireEvent.click(toggleIn("bob@example.com"));
    });
    expect(toggleIn("bob@example.com").getAttribute("aria-checked")).toBe("true"); // optimistic

    await act(async () => {
      ctl.resolvers.get("bob@example.com")!({ kind: "infra_error" });
    });

    const copy = getRequiredDougFacing("ADMIN_EMAIL_WRITE_FAILED");
    const bobRow = rowByEmail("bob@example.com");
    await waitFor(() => {
      // Reverted to the server-truth OFF state …
      expect(within(bobRow).getByTestId("developer-toggle").getAttribute("aria-checked")).toBe(
        "false",
      );
      // … and the cataloged copy is shown (invariant 5).
      expect(within(bobRow).getByTestId("developer-toggle-error").textContent ?? "").toContain(
        copy,
      );
    });
    expect(within(bobRow).getByTestId("developer-toggle")).not.toBeDisabled();
  });

  it("compound: toggling row A while row B is mid-pending leaves B's pending state intact (independent useActionState)", async () => {
    renderDevView([
      row({ email: "alice@example.com", is_developer: true }), // actor (locked)
      row({ email: "bob@example.com", is_developer: false }),
      row({ email: "carol@example.com", is_developer: false }),
    ]);

    // Put row B (bob) mid-pending: disabled + optimistic ON.
    await act(async () => {
      fireEvent.click(toggleIn("bob@example.com"));
    });
    expect(toggleIn("bob@example.com")).toBeDisabled();
    expect(toggleIn("bob@example.com").getAttribute("aria-checked")).toBe("true");

    // Now toggle row A (carol) WHILE B is still pending. B's state must be intact:
    // dispatching A does not reset/couple B — the proof that each AdminRow owns
    // its OWN useActionState (a shared reducer would collapse them into one flag).
    await act(async () => {
      fireEvent.click(toggleIn("carol@example.com"));
    });
    // B intact (still pending + optimistic), A now independently pending.
    expect(toggleIn("bob@example.com")).toBeDisabled();
    expect(toggleIn("bob@example.com").getAttribute("aria-checked")).toBe("true");
    expect(toggleIn("carol@example.com")).toBeDisabled();
    expect(toggleIn("carol@example.com").getAttribute("aria-checked")).toBe("true");

    // Each dispatched exactly once, with its OWN flipped payload (no cross-talk).
    expect(ctl.calls).toEqual([
      { email: "bob@example.com", is_developer: "true" },
      { email: "carol@example.com", is_developer: "true" },
    ]);
  });

  it("React-19 dispatch safety: the submit switch does not synchronously self-disable in its own onClick", () => {
    renderDevView([
      row({ email: "alice@example.com", is_developer: true }),
      row({ email: "bob@example.com", is_developer: false }),
    ]);
    const bob = toggleIn("bob@example.com");
    // Not disabled at rest; no inline onClick disabling (disable is driven by
    // useActionState.isPending, not a synchronous onClick — the B1 revoke-hang lesson).
    expect(bob).not.toBeDisabled();
    expect((bob.getAttribute("onclick") ?? "").toLowerCase()).not.toContain("disabled");
  });
});
