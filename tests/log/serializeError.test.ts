// tests/log/serializeError.test.ts
import { describe, expect, test } from "vitest";
import { serializeError } from "@/lib/log/serializeError";

describe("serializeError", () => {
  test("Error → {name,message,stack}", () => {
    const e = new TypeError("boom");
    const out = serializeError(e) as { name: string; message: string; stack?: string };
    expect(out.name).toBe("TypeError");
    expect(out.message).toBe("boom");
    expect(typeof out.stack).toBe("string");
  });
  test("non-Error values → String(value)", () => {
    expect(serializeError("oops")).toBe("oops");
    expect(serializeError(42)).toBe("42");
    expect(serializeError(null)).toBe("null");
    expect(serializeError(undefined)).toBe("undefined");
    expect(serializeError({ a: 1 })).toBe("[object Object]");
  });
});
