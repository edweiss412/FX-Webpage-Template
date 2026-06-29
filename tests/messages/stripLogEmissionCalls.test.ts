import { describe, expect, test } from "vitest";
import { stripLogEmissionCalls } from "@/lib/messages/__internal__/stripLogEmissionCalls";

const CODE_RE = /\bcode:\s*["'`]([A-Z][A-Z_]+)["'`]/g;
function codes(src: string): string[] {
  return [...stripLogEmissionCalls(src).matchAll(CODE_RE)].map((m) => m[1]!);
}

describe("stripLogEmissionCalls", () => {
  test("removes a multi-line log.error call (its code: is gone)", () => {
    const src = `
      await log.error("admin emails infra failure", {
        source: "data/adminEmails",
        code: "ADMIN_EMAILS_INFRA",
      });
    `;
    expect(codes(src)).toEqual([]);
  });

  test("preserves a real producer code: outside any log call", () => {
    const src = `
      await log.warn("x", { source: "s" });
      return jsonError(res, { code: "REAL_PRODUCER_CODE" });
    `;
    expect(codes(src)).toEqual(["REAL_PRODUCER_CODE"]);
  });

  test("a string containing parens/braces inside the log call does not break matching", () => {
    const src = `log.info("weird ) } ( { msg", { source: "s", code: "LOG_ONLY" }); const x = { code: "KEPT" };`;
    expect(codes(src)).toEqual(["KEPT"]);
  });

  test("a template literal with \${} inside the log call is handled", () => {
    const src =
      "log.error(`oops ${foo({ a: 1 })} done`, { source: \"s\", code: \"LOG_TPL\" }); const y = { code: \"ALSO_KEPT\" };";
    expect(codes(src)).toEqual(["ALSO_KEPT"]);
  });

  test("all four levels are stripped; console.* and other calls are untouched", () => {
    const src = `
      log.debug("d", { code: "D" });
      log.info("i", { code: "I" });
      log.warn("w", { code: "W" });
      log.error("e", { code: "E" });
      console.error("c", { code: "CONSOLE_KEPT" });
    `;
    expect(codes(src)).toEqual(["CONSOLE_KEPT"]);
  });

  test("non-log source passes through unchanged", () => {
    const src = `const a = upsertAdminAlert({ code: "KEEP_ME" });`;
    expect(stripLogEmissionCalls(src)).toBe(src);
    expect(codes(src)).toEqual(["KEEP_ME"]);
  });

  test("nested object/call inside the log args is fully removed", () => {
    const src = `log.error("m", { source: "s", code: "OUTER", extra: build({ code: "INNER" }) }); keep({ code: "SURVIVOR" });`;
    expect(codes(src)).toEqual(["SURVIVOR"]);
  });
});
