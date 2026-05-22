import { describe, expect, it } from "vitest";
import { shouldEmitLearnMore } from "@/lib/messages/renderer-gate";

describe("shouldEmitLearnMore (Phase G.2 - spec section 5.2 preview exception)", () => {
  it("admin route + helpHref present emits the link", () => {
    expect(
      shouldEmitLearnMore({
        route: "/admin/show/rpas-central-2026",
        helpHref: "/help/errors#SYNC_INFRA_ERROR",
      }),
    ).toBe(true);
  });

  it("help-admin route + helpHref present emits the link", () => {
    expect(
      shouldEmitLearnMore({
        route: "/help/admin/dashboard",
        helpHref: "/help/admin/parse-warnings#PARSE_ERROR_LAST_GOOD",
      }),
    ).toBe(true);
  });

  it("crew route suppresses the link even with helpHref", () => {
    expect(
      shouldEmitLearnMore({
        route: "/show/rpas-central-2026",
        helpHref: "/help/errors#SYNC_INFRA_ERROR",
      }),
    ).toBe(false);
  });

  it("preview-as-crew route suppresses the link even with helpHref", () => {
    expect(
      shouldEmitLearnMore({
        route: "/admin/show/rpas-central-2026/preview/eric-weiss",
        helpHref: "/help/errors#SYNC_INFRA_ERROR",
      }),
    ).toBe(false);
  });

  it("admin route + null helpHref suppresses the link", () => {
    expect(
      shouldEmitLearnMore({
        route: "/admin",
        helpHref: null,
      }),
    ).toBe(false);
  });

  it("non-admin /admin-prefixed route suppresses the link defensively", () => {
    expect(
      shouldEmitLearnMore({
        route: "/admins/spoof",
        helpHref: "/help/errors#SYNC_INFRA_ERROR",
      }),
    ).toBe(false);
  });
});
