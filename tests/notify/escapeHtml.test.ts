import { describe, expect, test } from "vitest";
import { escapeHtml, assertNoUnresolvedPlaceholder } from "@/lib/notify/templates/escapeHtml";

describe("escapeHtml", () => {
  test("escapes & < > \" '", () => {
    expect(escapeHtml(`<script>"&'`)).toBe("&lt;script&gt;&quot;&amp;&#39;");
  });
  test("leaves plain text untouched", () => {
    expect(escapeHtml("FXAV Spring Tour")).toBe("FXAV Spring Tour");
  });
});

describe("placeholder guard (runs on PLAIN-TEXT copy, §8)", () => {
  test("rejects an unresolved <sheet-name> token", () => {
    expect(() => assertNoUnresolvedPlaceholder("Sheet <sheet-name> is gone")).toThrow(/sheet-name/);
  });
  test("accepts fully-resolved plain text", () => {
    expect(() => assertNoUnresolvedPlaceholder("Sheet FXAV Spring Tour is gone")).not.toThrow();
  });
});
