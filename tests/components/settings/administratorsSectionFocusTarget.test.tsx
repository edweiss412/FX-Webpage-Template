// @vitest-environment jsdom
/**
 * AC-3 and AC-8 — the revoke-SUCCESS focus target.
 *
 * A successful revoke removes the row by revalidation, so the trigger the
 * operator pressed is gone and there is nothing to restore focus to. The
 * ratified target is the section heading (bl-orch 2026-08-31): it is the only
 * candidate that exists unconditionally after the unmount — every next-row or
 * adjacent-control scheme dies on the last-row case, which is also why the
 * last-admin-revoked case needs no target of its own — and it reorients a
 * screen-reader user by naming where they are.
 *
 * The heading under test is the LIVE one. `AdministratorsSection` renders a
 * second `#admin-settings-admins-heading` inside its list-failed early return,
 * and two drafts of the plan pointed at that one by mistake, so each assertion
 * here renders the OK result and takes the heading from that tree.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { AdministratorsSection } from "@/components/admin/settings/AdministratorsSection";
import type { AdminEmailRow } from "@/lib/data/adminEmails";

const row = (email: string): AdminEmailRow => ({
  email,
  added_by: null,
  added_at: "2026-08-01T00:00:00.000Z",
  revoked_by: null,
  revoked_at: null,
  note: null,
  is_developer: false,
});

const renderLive = () =>
  render(
    <AdministratorsSection
      result={{ kind: "ok", rows: [row("actor@example.com"), row("peer@example.com")] }}
      actorCanonicalEmail="actor@example.com"
      now={new Date("2026-08-31T00:00:00.000Z")}
    />,
  );

describe("the administrators heading is a programmatic focus target", () => {
  it("premise: the LIVE section renders, not the list-failed early return", () => {
    // Without this, every assertion below could be reading the error-path
    // heading, which is a different element with the same id.
    renderLive();
    expect(screen.getByTestId("admin-active-list")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-allowlist-error")).toBeNull();
  });

  it("renders tabIndex -1 so it can receive programmatic focus", () => {
    renderLive();
    const heading = document.getElementById("admin-settings-admins-heading");
    expect(heading, "the live heading must exist").not.toBeNull();
    expect(heading).toHaveAttribute("tabindex", "-1");
  });

  it("is focusable in fact, not merely by attribute", () => {
    // The attribute is the mechanism; this is the behaviour. An element with a
    // stale or overridden tabindex would pass the assertion above and fail here.
    renderLive();
    const heading = document.getElementById("admin-settings-admins-heading") as HTMLElement;
    heading.focus();
    expect(heading).toHaveFocus();
  });

  it("does not become a tab stop", () => {
    // -1 and not 0: the heading is a programmatic target, and putting a heading
    // into the tab ring would change keyboard navigation for every operator.
    renderLive();
    const heading = document.getElementById("admin-settings-admins-heading") as HTMLElement;
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(heading.getAttribute("tabindex")).not.toBe("0");
  });
});
