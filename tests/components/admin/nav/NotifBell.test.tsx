// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NotifBell } from "@/components/admin/nav/NotifBell";
import { getRequiredDougFacing } from "@/lib/messages/lookup";

afterEach(() => cleanup());

describe("NotifBell", () => {
  it("count 0 → link present, NO badge", () => {
    render(<NotifBell alertCount={{ kind: "ok", count: 0 }} />);
    expect(screen.getByTestId("admin-notif-bell")).toHaveAttribute("href", "/admin#alerts");
    expect(screen.queryByTestId("admin-notif-badge")).toBeNull();
  });
  it("count 7 → badge shows exact 7", () => {
    render(<NotifBell alertCount={{ kind: "ok", count: 7 }} />);
    expect(screen.getByTestId("admin-notif-badge")).toHaveTextContent("7");
  });
  it("count 9 → '9'; count 10 → '9+'; count 250 → '9+'", () => {
    const { rerender } = render(<NotifBell alertCount={{ kind: "ok", count: 9 }} />);
    expect(screen.getByTestId("admin-notif-badge")).toHaveTextContent("9");
    rerender(<NotifBell alertCount={{ kind: "ok", count: 10 }} />);
    expect(screen.getByTestId("admin-notif-badge")).toHaveTextContent("9+");
    rerender(<NotifBell alertCount={{ kind: "ok", count: 250 }} />);
    expect(screen.getByTestId("admin-notif-badge")).toHaveTextContent("9+");
  });
  it("infra_error → distinct degraded bell (NOT clean no-badge); cataloged accessible label", () => {
    render(<NotifBell alertCount={{ kind: "infra_error" }} />);
    expect(screen.getByTestId("admin-notif-bell-degraded")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-notif-badge")).toBeNull(); // not a numeric badge
    // anti-literal: label comes from the catalog, not a hardcoded string
    expect(screen.getByTestId("admin-notif-bell-degraded")).toHaveAccessibleName(
      getRequiredDougFacing("ADMIN_ALERT_COUNT_FAILED"),
    );
  });
});
