import { describe, expect, it } from "vitest";
import { buildCardReportContext } from "@/lib/crew/cardReportContext";
import type { Viewer } from "@/lib/data/getShowForViewer";

describe("buildCardReportContext", () => {
  it("crew viewer → crew surface, crew-card scope, no extra context", () => {
    const viewer: Viewer = { kind: "crew", crewMemberId: "c1" };
    expect(buildCardReportContext(viewer, "Jo", "A1")).toEqual({
      surface: "crew",
      surfaceIdScope: "crew-card",
      extraContext: {},
    });
  });

  it("admin_preview → admin surface, crewMember-scoped surfaceIdScope, crewPreview context", () => {
    const viewer: Viewer = { kind: "admin_preview", crewMemberId: "c9" };
    expect(buildCardReportContext(viewer, "Jo Preview", "V1")).toEqual({
      surface: "admin",
      surfaceIdScope: "admin-preview-card-c9",
      extraContext: { crewPreview: { crewMemberId: "c9", name: "Jo Preview", role: "V1" } },
    });
  });

  it("distinct previewed crew members get distinct surfaceIdScopes (no cross-viewer draft/idempotency leak)", () => {
    // Regression guard: without the crewMemberId in the scope, switching the
    // previewed viewer on the same card/show would resume a stale draft and
    // submit it tagged with the NEW viewer's crewPreview.
    const a = buildCardReportContext({ kind: "admin_preview", crewMemberId: "cA" }, "A", "A1");
    const b = buildCardReportContext({ kind: "admin_preview", crewMemberId: "cB" }, "B", "B1");
    expect(a.surfaceIdScope).not.toBe(b.surfaceIdScope);
  });

  it("plain admin viewer falls into the crew branch (matches the footer's only-preview special-case)", () => {
    const viewer: Viewer = { kind: "admin" };
    expect(buildCardReportContext(viewer, null, null).surface).toBe("crew");
  });
});
