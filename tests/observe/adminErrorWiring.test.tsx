// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { getRequiredDougFacing } from "@/lib/messages/lookup";
const h = vi.hoisted(() => ({ captureBoundaryError: vi.fn() }));
vi.mock("@/lib/observe/captureBoundaryError", () => ({
  captureBoundaryError: h.captureBoundaryError,
}));
import AdminError from "@/app/admin/error";
import SettingsError from "@/app/admin/settings/error";
import AdminsError from "@/app/admin/settings/admins/error";
const { captureBoundaryError } = h;
afterEach(() => {
  cleanup();
  captureBoundaryError.mockReset();
});

const COPY = getRequiredDougFacing("ADMIN_ROUTE_LOAD_FAILED");
describe.each([
  ["admin", AdminError],
  ["settings", SettingsError],
  ["admins", AdminsError],
])("admin boundary %s", (_name, Boundary) => {
  test("captures with area=admin AND still renders ADMIN_ROUTE_LOAD_FAILED copy (no visual change)", () => {
    const err = Object.assign(new Error("x"), { digest: "d3" });
    render(<Boundary error={err} reset={vi.fn()} />);
    expect(captureBoundaryError).toHaveBeenCalledWith(err, "admin");
    expect(
      screen.getByText(new RegExp(COPY.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")),
    ).toBeInTheDocument();
  });
});
