// tests/parser/mutation/fixtures.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { FIXTURES } from "./fixtures";

describe("fixture registry parity (Codex R9)", () => {
  it("registry equals the committed .md set (minus README) in both dirs", () => {
    const md = (dir: string) =>
      readdirSync(dir)
        .filter((f) => f.endsWith(".md") && f !== "README.md")
        .sort();
    const expected = [
      ...md("fixtures/shows/exporter-xlsx").map((f) => `fixtures/shows/exporter-xlsx/${f}`),
      ...md("fixtures/shows/raw").map((f) => `fixtures/shows/raw/${f}`),
    ].sort();
    expect(FIXTURES.map((f) => f.path).sort()).toEqual(expected);
  });
  it("has 17 entries (7 xlsx + 10 raw)", () => {
    expect(FIXTURES.filter((f) => f.family === "xlsx")).toHaveLength(7);
    expect(FIXTURES.filter((f) => f.family === "raw")).toHaveLength(10);
  });
});
