// tests/log/sanitize.test.ts
import { describe, expect, test } from "vitest";
import { redactEmails, sanitizeContext } from "@/lib/log/sanitize";

describe("redactEmails", () => {
  test("redacts emails anywhere in a string", () => {
    expect(redactEmails("contact alice@example.com now")).toBe("contact [email-redacted] now");
    expect(redactEmails("a@b.co and c.d+x@sub.example.org")).toBe("[email-redacted] and [email-redacted]");
  });
  test("leaves non-emails alone", () => {
    expect(redactEmails("no address here @ all")).toBe("no address here @ all");
  });
});

describe("sanitizeContext", () => {
  test("redacts emails in message and nested context", () => {
    const { message, context } = sanitizeContext("from bob@corp.io", {
      a: { b: ["x", "deep eve@corp.io"] },
    });
    expect(message).toBe("from [email-redacted]");
    expect((context.a as { b: string[] }).b[1]).toBe("deep [email-redacted]");
  });
  test("makes circular structures JSON-safe", () => {
    const node: Record<string, unknown> = { name: "n" };
    node.self = node;
    const { context } = sanitizeContext("m", { node });
    expect((context.node as { self: unknown }).self).toBe("[Circular]");
  });
  test("drops functions/undefined and stringifies BigInt / non-finite", () => {
    const { context } = sanitizeContext("m", {
      fn: () => 1,
      u: undefined,
      big: 10n,
      nan: Number.NaN,
      keep: "ok",
    });
    expect(context).not.toHaveProperty("fn");
    expect(context).not.toHaveProperty("u");
    expect(context.big).toBe("10");
    expect(context.nan).toBe("NaN");
    expect(context.keep).toBe("ok");
  });
  test("a sibling repeat (diamond) is NOT marked circular", () => {
    const shared = { v: 1 };
    const { context } = sanitizeContext("m", { a: shared, b: shared });
    expect(context.a).toEqual({ v: 1 });
    expect(context.b).toEqual({ v: 1 });
  });
});
