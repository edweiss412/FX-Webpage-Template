// @vitest-environment jsdom
//
// developer-tier Task 18 (spec §7) — the per-row Developer toggle inside
// AdministratorsSection, developer-gated.
//
// Contracts pinned (concrete failure modes):
//   - viewerIsDeveloper=false → NO developer control or badge on ANY row
//     (Doug's list is byte-identical to today).
//   - viewerIsDeveloper=true, NON-actor row → an interactive DeveloperToggleButton
//     whose aria-checked reflects row.is_developer.
//   - viewerIsDeveloper=true, ACTOR row → a LOCKED developer indicator (disabled;
//     you cannot demote yourself), NOT an actionable toggle.
//   - toggling a non-actor row invokes setDeveloperAction with the row email and
//     is_developer FLIPPED.
//   - a self_developer_demote_forbidden / infra_error result renders the cataloged
//     getDougFacing copy inline (invariant 5 — never a raw code).
//
// Expectations derive from the seeded rows + the live catalog, never from output.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { AdministratorsSection } from "@/components/admin/settings/AdministratorsSection";
import { getRequiredDougFacing } from "@/lib/messages/lookup";
import type { AdminEmailRow } from "@/lib/data/adminEmails";
import type { EmbeddedAdminEmailsResult } from "@/lib/admin/embeddedAdminEmails";
import type { SetDeveloperActionResult } from "@/app/admin/settings/admins/developerActions";

// Mock the developer server action; each test controls its resolved value and
// inspects the FormData it received (email + is_developer flip).
const action = vi.hoisted(() => ({
  fn: vi.fn(),
}));
vi.mock("@/app/admin/settings/admins/developerActions", () => ({
  setDeveloperAction: action.fn,
}));

// Client islands unrelated to the toggle are mocked to stable markers.
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

function rowByEmail(email: string): HTMLElement {
  return screen
    .getAllByTestId("admin-allowlist-row")
    .find((el) => el.getAttribute("data-row-email") === email)!;
}

beforeEach(() => {
  action.fn.mockReset();
  action.fn.mockResolvedValue({ kind: "ok", email: "x", isDeveloper: true });
});
afterEach(() => cleanup());

describe("AdministratorsSection — Developer toggle (Task 18)", () => {
  it("viewerIsDeveloper=false → NO developer toggle on any row (Doug's view unchanged)", () => {
    const rows = [row({ email: "alice@example.com" }), row({ email: "bob@example.com" })];
    render(
      <AdministratorsSection
        result={ok(rows)}
        actorCanonicalEmail="alice@example.com"
        now={NOW}
        viewerIsDeveloper={false}
      />,
    );
    expect(screen.queryByTestId("developer-toggle")).toBeNull();
  });

  it("viewerIsDeveloper omitted → NO developer toggle (safe default)", () => {
    const rows = [row({ email: "alice@example.com" })];
    render(
      <AdministratorsSection result={ok(rows)} actorCanonicalEmail="alice@example.com" now={NOW} />,
    );
    expect(screen.queryByTestId("developer-toggle")).toBeNull();
  });

  it("developer viewer → non-actor row gets an interactive toggle reflecting is_developer", () => {
    const rows = [
      row({ email: "alice@example.com", is_developer: true }), // actor
      row({ email: "bob@example.com", is_developer: false }),
      row({ email: "carol@example.com", is_developer: true }),
    ];
    render(
      <AdministratorsSection
        result={ok(rows)}
        actorCanonicalEmail="alice@example.com"
        now={NOW}
        viewerIsDeveloper={true}
      />,
    );

    const bob = within(rowByEmail("bob@example.com")).getByTestId("developer-toggle");
    expect(bob.getAttribute("role")).toBe("switch");
    expect(bob.getAttribute("aria-checked")).toBe("false");
    expect(bob).not.toBeDisabled();

    const carol = within(rowByEmail("carol@example.com")).getByTestId("developer-toggle");
    expect(carol.getAttribute("aria-checked")).toBe("true");
    expect(carol).not.toBeDisabled();
  });

  it("developer viewer → ACTOR's own row is a LOCKED indicator (disabled, not actionable)", () => {
    const rows = [
      row({ email: "alice@example.com", is_developer: true }),
      row({ email: "bob@example.com", is_developer: false }),
    ];
    render(
      <AdministratorsSection
        result={ok(rows)}
        actorCanonicalEmail="alice@example.com"
        now={NOW}
        viewerIsDeveloper={true}
      />,
    );
    const self = within(rowByEmail("alice@example.com")).getByTestId("developer-toggle");
    expect(self.getAttribute("role")).toBe("switch");
    expect(self.getAttribute("aria-checked")).toBe("true");
    // Locked: disabled + reports it cannot be actuated.
    expect(self).toBeDisabled();
  });

  it("toggling a non-actor row invokes setDeveloperAction with email + is_developer FLIPPED", async () => {
    const rows = [
      row({ email: "alice@example.com", is_developer: true }),
      row({ email: "bob@example.com", is_developer: false }),
    ];
    render(
      <AdministratorsSection
        result={ok(rows)}
        actorCanonicalEmail="alice@example.com"
        now={NOW}
        viewerIsDeveloper={true}
      />,
    );
    const bobToggle = within(rowByEmail("bob@example.com")).getByTestId("developer-toggle");
    await act(async () => {
      fireEvent.click(bobToggle);
    });
    await waitFor(() => expect(action.fn).toHaveBeenCalledTimes(1));
    const formData = action.fn.mock.calls[0]![1] as FormData;
    expect(formData.get("email")).toBe("bob@example.com");
    // bob.is_developer=false → flipped target is "true".
    expect(formData.get("is_developer")).toBe("true");
  });

  it("self_developer_demote_forbidden result → inline cataloged copy (no raw code)", async () => {
    action.fn.mockResolvedValue({
      kind: "self_developer_demote_forbidden",
      email: "bob@example.com",
    } satisfies SetDeveloperActionResult);
    const rows = [
      row({ email: "alice@example.com", is_developer: true }),
      row({ email: "bob@example.com", is_developer: true }),
    ];
    render(
      <AdministratorsSection
        result={ok(rows)}
        actorCanonicalEmail="alice@example.com"
        now={NOW}
        viewerIsDeveloper={true}
      />,
    );
    const bobRow = rowByEmail("bob@example.com");
    await act(async () => {
      fireEvent.click(within(bobRow).getByTestId("developer-toggle"));
    });
    const copy = getRequiredDougFacing("SELF_DEVELOPER_DEMOTE_FORBIDDEN");
    await waitFor(() => {
      expect(within(bobRow).getByTestId("developer-toggle-error").textContent ?? "").toContain(
        copy,
      );
    });
  });

  it("infra_error result → inline ADMIN_EMAIL_WRITE_FAILED copy", async () => {
    action.fn.mockResolvedValue({ kind: "infra_error" } satisfies SetDeveloperActionResult);
    const rows = [
      row({ email: "alice@example.com", is_developer: true }),
      row({ email: "bob@example.com", is_developer: false }),
    ];
    render(
      <AdministratorsSection
        result={ok(rows)}
        actorCanonicalEmail="alice@example.com"
        now={NOW}
        viewerIsDeveloper={true}
      />,
    );
    const bobRow = rowByEmail("bob@example.com");
    await act(async () => {
      fireEvent.click(within(bobRow).getByTestId("developer-toggle"));
    });
    const copy = getRequiredDougFacing("ADMIN_EMAIL_WRITE_FAILED");
    await waitFor(() => {
      expect(within(bobRow).getByTestId("developer-toggle-error").textContent ?? "").toContain(
        copy,
      );
    });
  });
});

// Part B §3.3 — admin-roster MANAGEMENT (Add / Revoke / Re-add) is developer-only.
// Non-developers keep the read-only list but see NO management affordance.
//
// Concrete failure mode this pins: a non-developer admin currently sees the
// Add trigger, per-row Revoke, and Re-add controls — a privilege-surface leak
// (they can POST-reach the now-developer-gated Server Actions from the UI).
//
// Anti-tautology: expected active/revoked/non-actor counts are DERIVED from the
// fixture `rows`, never hardcoded — the test works across any fixture shape.
describe("AdministratorsSection — management controls gated on developer (Part B §3.3)", () => {
  const ACTOR = "alice@example.com";
  const fixtureRows = [
    row({ email: ACTOR }), // actor, active
    row({ email: "bob@example.com" }), // non-actor, active
    row({
      email: "carol@example.com",
      revoked_at: "2026-05-15T00:00:00.000Z",
      revoked_by: ACTOR,
    }), // revoked
  ];
  const result = ok(fixtureRows);
  const activeCount = fixtureRows.filter((r) => r.revoked_at === null).length;
  const revokedCount = fixtureRows.filter((r) => r.revoked_at !== null).length;
  const nonActorActiveCount = fixtureRows.filter(
    (r) => r.revoked_at === null && r.email !== ACTOR,
  ).length;

  it("viewerIsDeveloper=false → read-only list, NO Add/Revoke/Re-add controls", () => {
    render(
      <AdministratorsSection
        result={result}
        actorCanonicalEmail={ACTOR}
        now={NOW}
        viewerIsDeveloper={false}
      />,
    );
    // No management affordances anywhere.
    expect(screen.queryByTestId("admin-add-admin-trigger")).toBeNull();
    expect(screen.queryByTestId("mock-revoke-button")).toBeNull();
    expect(screen.queryByTestId("mock-readd-button")).toBeNull();

    // But the read-only list IS present, byte-for-byte the same information.
    expect(screen.getByTestId("admin-settings-admins-card")).not.toBeNull();
    expect(screen.getAllByTestId("admin-allowlist-row")).toHaveLength(activeCount);
    expect(within(rowByEmail(ACTOR)).getByTestId("admin-allowlist-you-badge")).not.toBeNull();
    expect(screen.getByTestId("admin-revoked-list")).not.toBeNull();
    expect(screen.getAllByTestId("admin-allowlist-revoked-row")).toHaveLength(revokedCount);
  });

  it("viewerIsDeveloper=true → Add trigger + non-actor Revoke + Re-add controls all render", () => {
    render(
      <AdministratorsSection
        result={result}
        actorCanonicalEmail={ACTOR}
        now={NOW}
        viewerIsDeveloper={true}
      />,
    );
    expect(screen.getByTestId("admin-add-admin-trigger")).not.toBeNull();
    // Revoke renders for every non-actor active row; never on the actor's own row.
    expect(screen.getAllByTestId("mock-revoke-button")).toHaveLength(nonActorActiveCount);
    expect(within(rowByEmail(ACTOR)).queryByTestId("mock-revoke-button")).toBeNull();
    // Re-add renders for every revoked row.
    expect(screen.getAllByTestId("mock-readd-button")).toHaveLength(revokedCount);
  });
});

// DEVTIER-1 — the Administrators-heading HoverHelp names what the Developer
// toggle grants, and ONLY for developers (spec 2026-07-17-devtier-toggle-help).
// GRANT_COPY must equal the developer-arm string in AdministratorsSection.tsx
// verbatim (single source of truth); the clauses pin the blast radius so a
// shortened sentence can't silently drop a privilege (anti-tautology).
const GRANT_COPY =
  "The Developer toggle gives that admin the same developer access you have, including managing admins (add, revoke, re-add, promote) and the Telemetry, Maintenance, Diagnostics, and Developer tools areas.";
const GRANT_CLAUSES = [
  "managing admins",
  "add, revoke, re-add, promote",
  "Telemetry",
  "Maintenance",
  "Diagnostics",
  "Developer tools",
];

describe("AdministratorsSection — DEVTIER-1 developer-toggle help copy", () => {
  it("developer viewer → heading help names the full toggle grant (every clause)", () => {
    render(
      <AdministratorsSection
        result={ok([row({ email: "alice@example.com" })])}
        actorCanonicalEmail="me@example.com"
        now={NOW}
        viewerIsDeveloper={true}
      />,
    );
    const body = screen.getByTestId("admins-help-body");
    const text = body.textContent ?? "";
    expect(text).toContain(GRANT_COPY);
    for (const clause of GRANT_CLAUSES) {
      expect(text).toContain(clause);
    }
  });

  it("non-developer viewer → grant copy (and every clause) ABSENT; non-developer copy present", () => {
    render(
      <AdministratorsSection
        result={ok([row({ email: "alice@example.com" })])}
        actorCanonicalEmail="me@example.com"
        now={NOW}
        viewerIsDeveloper={false}
      />,
    );
    const body = screen.getByTestId("admins-help-body");
    const text = body.textContent ?? "";
    expect(text).not.toContain(GRANT_COPY);
    for (const clause of GRANT_CLAUSES) {
      expect(text).not.toContain(clause);
    }
    expect(text).toContain("Roster changes are managed by a developer");
  });
});
