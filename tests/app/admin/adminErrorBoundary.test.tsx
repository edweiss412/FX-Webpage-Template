// @vitest-environment jsdom
/**
 * tests/app/admin/adminErrorBoundary.test.tsx (M12.2 B1 Task 2.1)
 *
 * Pins the admin client error boundaries + the §2.7 boundary topology.
 *
 * All admin error.tsx boundaries render the SAME fixed
 * ADMIN_ROUTE_LOAD_FAILED Doug copy — NOT err.code (error.tsx files are
 * client components; Next serializes errors as Error & { digest }, so a
 * thrown `.code` is unreliable in production).
 *
 * Concrete failure mode caught: a boundary that reads error.code
 * (undefined after serialization) and renders blank/wrong-audience copy;
 * a future admin route added without boundary coverage; the admins
 * boundary accidentally NOT repointed to the generic code.
 */
import "@testing-library/jest-dom/vitest";
import { existsSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AdminError from "@/app/admin/error";
import AdminSettingsError from "@/app/admin/settings/error";
import AdminAdminsError from "@/app/admin/settings/admins/error";
import { getRequiredDougFacing } from "@/lib/messages/lookup";

// Next serializes thrown errors as Error & { digest } — no .code survives.
const realErr = () => Object.assign(new Error("x"), { digest: "d" });

afterEach(() => {
  cleanup();
});

describe("admin client error boundaries", () => {
  it("catch-all boundary renders fixed ADMIN_ROUTE_LOAD_FAILED Doug copy (not err.code)", () => {
    render(<AdminError error={realErr()} reset={() => {}} />);
    expect(
      screen.getByText(getRequiredDougFacing("ADMIN_ROUTE_LOAD_FAILED")),
    ).toBeInTheDocument();
  });

  it("settings boundary renders the same fixed code", () => {
    render(<AdminSettingsError error={realErr()} reset={() => {}} />);
    expect(
      screen.getByText(getRequiredDougFacing("ADMIN_ROUTE_LOAD_FAILED")),
    ).toBeInTheDocument();
  });

  it("admins boundary renders ADMIN_ROUTE_LOAD_FAILED (REPOINTED — it now only catches route/session faults; list-read is handled in-section)", () => {
    render(<AdminAdminsError error={realErr()} reset={() => {}} />);
    expect(
      screen.getByText(getRequiredDougFacing("ADMIN_ROUTE_LOAD_FAILED")),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(getRequiredDougFacing("ADMIN_EMAIL_LIST_FAILED")),
    ).toBeNull();
  });

  it("§2.7 topology: catch-all + settings exist; staged/preview/onboarding/show have NO closer error.tsx (inherit the catch-all)", () => {
    expect(existsSync("app/admin/error.tsx")).toBe(true);
    expect(existsSync("app/admin/settings/error.tsx")).toBe(true);
    for (const seg of [
      "app/admin/show/[slug]/error.tsx",
      "app/admin/show/staged/[stagedId]/error.tsx",
      "app/admin/show/[slug]/preview/[crewId]/error.tsx",
      "app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/error.tsx",
    ]) {
      expect(existsSync(seg), `${seg} should NOT exist (inherits the catch-all)`).toBe(
        false,
      );
    }
  });
});
