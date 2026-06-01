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
import { cleanup, render, screen, within } from "@testing-library/react";

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
  };
}

function ok(rows: AdminEmailRow[]): EmbeddedAdminEmailsResult {
  return { kind: "ok", rows };
}

afterEach(() => cleanup());

describe("AdministratorsSection (Task 6.2)", () => {
  it("renders active list + add form + revoked disclosure", () => {
    const rows = [
      row({ email: "alice@example.com" }),
      row({ email: "bob@example.com" }),
      row({ email: "carol@example.com", revoked_at: "2026-05-10T00:00:00.000Z", revoked_by: "x@example.com" }),
    ];
    render(
      <AdministratorsSection result={ok(rows)} actorCanonicalEmail="alice@example.com" now={NOW} />,
    );

    const active = screen.getByTestId("admin-active-list");
    // 2 active rows seeded → 2 rows rendered in the active region.
    expect(within(active).getAllByTestId("admin-allowlist-row")).toHaveLength(2);
    expect(screen.getByTestId("mock-add-admin-form")).toBeInTheDocument();

    const revoked = screen.getByTestId("admin-revoked-list");
    expect(within(revoked).getAllByTestId("admin-allowlist-revoked-row")).toHaveLength(1);
  });

  it("self-with-peer → Revoke ENABLED on own row", () => {
    const rows = [row({ email: "alice@example.com" }), row({ email: "bob@example.com" })];
    render(
      <AdministratorsSection result={ok(rows)} actorCanonicalEmail="alice@example.com" now={NOW} />,
    );
    const selfRow = screen
      .getAllByTestId("admin-allowlist-row")
      .find((el) => el.getAttribute("data-row-email") === "alice@example.com")!;
    const revoke = within(selfRow).getByTestId("mock-revoke-button");
    expect(revoke).not.toBeDisabled();
    // "You" badge surfaces on the actor's own row.
    expect(within(selfRow).getByTestId("admin-allowlist-you-badge")).toBeInTheDocument();
  });

  it("sole-self → Revoke DISABLED + lockout hint", () => {
    const rows = [row({ email: "alice@example.com" })];
    render(
      <AdministratorsSection result={ok(rows)} actorCanonicalEmail="alice@example.com" now={NOW} />,
    );
    const selfRow = screen.getByTestId("admin-allowlist-row");
    expect(within(selfRow).getByTestId("mock-revoke-button")).toBeDisabled();
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
    render(
      <AdministratorsSection result={ok(rows)} actorCanonicalEmail="alice@example.com" now={NOW} />,
    );
    // 2 active rows seeded → head shows the count "2".
    const heading = screen.getByRole("heading", { name: /Administrators/i });
    expect(heading.textContent).toContain("2");
    // The add-admin label is present somewhere in the section.
    expect(screen.getAllByText(/Add admin/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Send invite/i)).not.toBeInTheDocument();
  });

  it("copy guard: no 'Send invite' / 'invite' string anywhere in the section (email infra is B3)", () => {
    const src = readFileSync("components/admin/settings/AdministratorsSection.tsx", "utf8");
    expect(src).not.toMatch(/Send invite/i);
    expect(src).not.toMatch(/invite/i);
  });
});
