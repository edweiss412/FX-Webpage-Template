import { describe, expect, test } from "vitest";
import { configValid } from "@/lib/notify/config";

describe("configValid", () => {
  test("is valid only when provider key, from-address, and canonical origin are all present", () => {
    expect(
      configValid({
        RESEND_API_KEY: "resend-key",
        EMAIL_FROM: "FXAV <alerts@example.com>",
        NEXT_PUBLIC_SITE_ORIGIN: "https://fxav.example.com/admin",
      }),
    ).toEqual({ ok: true, origin: "https://fxav.example.com" });
  });

  test.each([
    [
      "RESEND_API_KEY missing",
      {
        EMAIL_FROM: "FXAV <alerts@example.com>",
        NEXT_PUBLIC_SITE_ORIGIN: "https://fxav.example.com",
      },
    ],
    [
      "EMAIL_FROM missing while RESEND_API_KEY is present",
      {
        RESEND_API_KEY: "resend-key",
        NEXT_PUBLIC_SITE_ORIGIN: "https://fxav.example.com",
      },
    ],
    [
      "canonical site origin missing",
      {
        RESEND_API_KEY: "resend-key",
        EMAIL_FROM: "FXAV <alerts@example.com>",
      },
    ],
    [
      "localhost origin is invalid",
      {
        RESEND_API_KEY: "resend-key",
        EMAIL_FROM: "FXAV <alerts@example.com>",
        NEXT_PUBLIC_SITE_ORIGIN: "http://localhost:3000",
      },
    ],
    [
      "malformed origin is invalid",
      {
        RESEND_API_KEY: "resend-key",
        EMAIL_FROM: "FXAV <alerts@example.com>",
        NEXT_PUBLIC_SITE_ORIGIN: "not a url",
      },
    ],
  ])("%s -> ok:false", (_label, env) => {
    expect(configValid(env)).toEqual({ ok: false });
  });
});
