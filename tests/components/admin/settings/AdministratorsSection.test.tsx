// @vitest-environment jsdom
// M12.2 Phase B1 Task 6.2 — AdministratorsSection extraction.
//
// AdministratorsSection is the presentational server component shared by
// /admin/settings/admins (deep link) and the embedded /admin/settings body.
// It receives the typed { result, actorCanonicalEmail, now } and renders the
// active list + add form + revoked disclosure, OR — on result.kind ===
// "infra_error" — the in-section cataloged ADMIN_EMAIL_LIST_FAILED copy (NOT a
// thrown boundary). Self-revoke policy: Revoke renders on the actor's own row,
// disabled ONLY when isOnlyActiveAdmin && isActor.
//
// Expectations are derived from the seeded result.rows, never from output.
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { AdministratorsSection } from "@/components/admin/settings/AdministratorsSection";
import { getRequiredDougFacing } from "@/lib/messages/lookup";
import type { AdminEmailRow } from "@/lib/data/adminEmails";
import type { EmbeddedAdminEmailsResult } from "@/lib/admin/embeddedAdminEmails";

// The client islands are mocked to stable markers so the section's own
// structure (lists, head, error) is what's under test.
vi.mock("@/app/admin/settings/admins/AddAdminForm", () => ({
  AddAdminForm: () => <div data-testid="mock-add-admin-form" />,
}));
vi.mock("@/app/admin/settings/admins/RevokeRowButton", () => ({
  RevokeRowButton: ({ email, disabled }: { email: string; disabled: boolean }) => (
    <button data-testid="mock-revoke-button" data-email={email} disabled={disabled}>
      Revoke
    </button>
  ),
}));
vi.mock("@/app/admin/settings/admins/ReAddRowButton", () => ({
  ReAddRowButton: ({ email }: { email: string }) => (
    <button data-testid="mock-readd-button" data-email={email}>
      Re-add
    </button>
  ),
}));

const NOW = new Date("2026-06-01T12:00:00.000Z");

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

afterEach(() => cleanup());

/** Portaled popover body (hoverhelp-smart-position §4.1): resolve via the
 * root wrapper's aria-owns — the body is no longer a wrapper descendant. */
function ownedBody(root: HTMLElement): HTMLElement {
  const id = root.getAttribute("aria-owns");
  if (!id) throw new Error("affordance root missing aria-owns");
  const body = document.getElementById(id);
  if (!body) throw new Error("aria-owns target not in document");
  return body;
}

describe("AdministratorsSection (Task 6.2)", () => {
  it("renders active list + revoked disclosure; add form hidden until 'Add admin' pressed (M12.3 item 12d)", () => {
    const rows = [
      row({ email: "alice@example.com" }),
      row({ email: "bob@example.com" }),
      row({
        email: "carol@example.com",
        revoked_at: "2026-05-10T00:00:00.000Z",
        revoked_by: "x@example.com",
      }),
    ];
    // Part B §3.3: Add/Revoke/Re-add are developer-only, so this management-view
    // test renders as a developer (the affordances it asserts live only there;
    // the read-only-default view is covered in AdministratorsSection-developer.test.tsx).
    render(
      <AdministratorsSection
        result={ok(rows)}
        actorCanonicalEmail="alice@example.com"
        now={NOW}
        viewerIsDeveloper={true}
      />,
    );

    const active = screen.getByTestId("admin-active-list");
    // 2 active rows seeded → 2 rows rendered in the active region.
    expect(within(active).getAllByTestId("admin-allowlist-row")).toHaveLength(2);

    // Disclosure: the add-form region is present-but-inert initially (always-mounted
    // height-morph), and becomes active after the trigger.
    const addRegion = screen.getByTestId("admin-settings-add-admin");
    expect(addRegion).toHaveAttribute("inert");
    expect(screen.getByTestId("mock-add-admin-form")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("admin-add-admin-trigger"));
    expect(addRegion).not.toHaveAttribute("inert");

    const revoked = screen.getByTestId("admin-revoked-list");
    expect(within(revoked).getAllByTestId("admin-allowlist-revoked-row")).toHaveLength(1);
  });

  it("self-with-peer → NO Revoke control on own row (can never revoke yourself); peer row keeps Revoke", () => {
    const rows = [row({ email: "alice@example.com" }), row({ email: "bob@example.com" })];
    // Part B §3.3: peer Revoke is developer-only — render as a developer (as a
    // non-developer the peer-Revoke assertion would be vacuous).
    render(
      <AdministratorsSection
        result={ok(rows)}
        actorCanonicalEmail="alice@example.com"
        now={NOW}
        viewerIsDeveloper={true}
      />,
    );
    const selfRow = screen
      .getAllByTestId("admin-allowlist-row")
      .find((el) => el.getAttribute("data-row-email") === "alice@example.com")!;
    // M12.5: the Revoke control is OMITTED entirely on the actor's own row.
    expect(within(selfRow).queryByTestId("mock-revoke-button")).toBeNull();
    // "You" badge still surfaces on the actor's own row.
    expect(within(selfRow).getByTestId("admin-allowlist-you-badge")).toBeInTheDocument();

    // A peer (non-actor) row keeps its Revoke (enabled).
    const peerRow = screen
      .getAllByTestId("admin-allowlist-row")
      .find((el) => el.getAttribute("data-row-email") === "bob@example.com")!;
    const peerBtn = within(peerRow).getByTestId("mock-revoke-button");
    expect(peerBtn).not.toBeDisabled();
  });

  it("sole-self → NO Revoke control (can't remove the only admin / yourself)", () => {
    const rows = [row({ email: "alice@example.com" })];
    // Part B §3.3: render as a developer so "no Revoke on the sole self row"
    // proves the self-revoke omission specifically (not just that non-developers
    // see no Revoke — which would be vacuously true).
    render(
      <AdministratorsSection
        result={ok(rows)}
        actorCanonicalEmail="alice@example.com"
        now={NOW}
        viewerIsDeveloper={true}
      />,
    );
    const selfRow = screen.getByTestId("admin-allowlist-row");
    expect(within(selfRow).queryByTestId("mock-revoke-button")).toBeNull();
  });

  it("infra_error result → in-section cataloged error (ADMIN_EMAIL_LIST_FAILED), NOT a thrown boundary", () => {
    render(
      <AdministratorsSection
        result={{ kind: "infra_error" }}
        actorCanonicalEmail="alice@example.com"
        now={NOW}
      />,
    );
    const err = screen.getByTestId("admin-allowlist-error");
    expect(err.getAttribute("role")).toBe("alert");
    expect(err.textContent).toContain(getRequiredDougFacing("ADMIN_EMAIL_LIST_FAILED"));
    // No active list rendered in the error state.
    expect(screen.queryByTestId("admin-active-list")).not.toBeInTheDocument();
  });

  it("Section head shows admin count + 'Add admin' (NOT 'Send invite')", () => {
    const rows = [row({ email: "alice@example.com" }), row({ email: "bob@example.com" })];
    // Part B §3.3: the 'Add admin' affordance is developer-only — render as a developer.
    render(
      <AdministratorsSection
        result={ok(rows)}
        actorCanonicalEmail="alice@example.com"
        now={NOW}
        viewerIsDeveloper={true}
      />,
    );
    // 2 active rows seeded → head shows the count "2".
    const heading = screen.getByRole("heading", { name: /Administrators/i });
    expect(heading.textContent).toContain("2");
    // The add-admin label is present somewhere in the section.
    expect(screen.getAllByText(/Add admin/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Send invite/i)).not.toBeInTheDocument();
  });

  // M12.12 matrix row 11 — failure mode caught: a settings redesign drops the
  // header HoverHelp (or its learnMore deep link) → the matrix root testid or
  // the hidden help-link href vanishes; pinned at unit speed instead of via
  // the e2e affordance walker.
  it("Administrators header help carries matrix root testid + settings#administrators link (row 11)", () => {
    const rows = [row({ email: "alice@example.com" })];
    render(
      <AdministratorsSection result={ok(rows)} actorCanonicalEmail="alice@example.com" now={NOW} />,
    );
    const root = screen.getByTestId("help-affordance--settings-administrators--tooltip");
    expect(within(ownedBody(root)).getByRole("link", { hidden: true })).toHaveAttribute(
      "href",
      "/help/admin/settings#administrators",
    );
  });

  it("copy guard: no 'Send invite' / 'invite' string anywhere in the section (email infra is B3)", () => {
    const src = readFileSync("components/admin/settings/AdministratorsSection.tsx", "utf8");
    expect(src).not.toMatch(/Send invite/i);
    expect(src).not.toMatch(/invite/i);
  });
});
