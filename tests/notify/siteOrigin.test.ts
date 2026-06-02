import { describe, expect, test } from "vitest";
import { resolveSiteOrigin } from "@/lib/notify/siteOrigin";

describe("resolveSiteOrigin", () => {
  test("valid absolute https origin", () => {
    expect(resolveSiteOrigin("https://crew.fxav.app")).toEqual({
      ok: true,
      origin: "https://crew.fxav.app",
    });
  });

  test.each([undefined, "", "   ", "not-a-url", "http://localhost:3000", "/admin"])(
    "rejects invalid/localhost origin %s",
    (raw) => {
      expect(resolveSiteOrigin(raw as string | undefined)).toEqual({ ok: false });
    },
  );
});
