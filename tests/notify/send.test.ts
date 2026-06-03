import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const resendState = vi.hoisted(() => ({
  constructorArgs: [] as string[],
  send: vi.fn(),
}));

vi.mock("resend", () => ({
  // A regular function (NOT an arrow) so `new Resend(apiKey)` can construct it —
  // `new <arrow>` throws "… is not a constructor".
  Resend: vi.fn(function (this: unknown, apiKey: string) {
    resendState.constructorArgs.push(apiKey);
    return { emails: { send: resendState.send } };
  }),
}));

import { sendEmail, type SendArgs } from "@/lib/notify/send";

const args: SendArgs = {
  to: "doug@fxav.app",
  subject: "FXAV: test",
  html: "<p>Hello</p>",
  text: "Hello",
  idempotencyKey: "fxav:digest:abc",
};

function resendError(name: string, statusCode: number | null = 400) {
  return { name, statusCode, message: `resend ${name}` };
}

beforeEach(() => {
  resendState.constructorArgs = [];
  resendState.send.mockReset();
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("EMAIL_FROM", "FXAV <notify@fxav.app>");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sendEmail outcomes", () => {
  test("200 -> ok:true with messageId and sends the Idempotency-Key option", async () => {
    resendState.send.mockResolvedValue({ data: { id: "m1" }, error: null, headers: {} });

    await expect(sendEmail(args)).resolves.toEqual({ ok: true, messageId: "m1" });

    expect(resendState.constructorArgs).toEqual(["re_test"]);
    expect(resendState.send).toHaveBeenCalledWith(
      {
        from: "FXAV <notify@fxav.app>",
        to: "doug@fxav.app",
        subject: "FXAV: test",
        html: "<p>Hello</p>",
        text: "Hello",
      },
      { idempotencyKey: "fxav:digest:abc" },
    );
  });

  test("409 concurrent_idempotent_requests -> retry_later", async () => {
    resendState.send.mockResolvedValue({
      data: null,
      error: resendError("concurrent_idempotent_requests", 409),
      headers: {},
    });

    await expect(sendEmail(args)).resolves.toEqual({ ok: "retry_later" });
  });

  test("409 invalid_idempotent_request -> idempotency_conflict", async () => {
    resendState.send.mockResolvedValue({
      data: null,
      error: resendError("invalid_idempotent_request", 409),
      headers: {},
    });

    await expect(sendEmail(args)).resolves.toEqual({
      ok: false,
      kind: "idempotency_conflict",
    });
  });

  test.each(["invalid_idempotency_key", "application_error", "rate_limit_exceeded"])(
    "%s -> infra_error",
    async (name) => {
      resendState.send.mockResolvedValue({
        data: null,
        error: resendError(name),
        headers: {},
      });

      await expect(sendEmail(args)).resolves.toMatchObject({
        ok: false,
        kind: "infra_error",
      });
    },
  );

  test("a thrown SDK error is caught (never throws into the loop)", async () => {
    resendState.send.mockRejectedValue(new Error("network down"));

    await expect(sendEmail(args)).resolves.toEqual({
      ok: false,
      kind: "infra_error",
      message: "network down",
    });
  });

  test("missing provider env returns infra_error without calling Resend", async () => {
    vi.stubEnv("RESEND_API_KEY", "");

    await expect(sendEmail(args)).resolves.toEqual({
      ok: false,
      kind: "infra_error",
      message: "unconfigured",
    });
    expect(resendState.constructorArgs).toEqual([]);
    expect(resendState.send).not.toHaveBeenCalled();
  });
});
