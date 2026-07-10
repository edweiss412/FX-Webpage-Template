// tests/parser/fuzz/shape.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSheet, type ParsedSheet } from "@/lib/parser";
import { assertParsedSheetShape } from "./shape";

const FIXTURE_PATH = "fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md";

describe("assertParsedSheetShape", () => {
  it("passes for a real parseSheet() output (Task 2 case a)", () => {
    const markdown = readFileSync(FIXTURE_PATH, "utf8");
    const parsed: ParsedSheet = parseSheet(markdown, "f.md");
    expect(() => assertParsedSheetShape(parsed)).not.toThrow();
  });

  it("throws mentioning the missing field when warnings is absent (Task 2 case b)", () => {
    const markdown = readFileSync(FIXTURE_PATH, "utf8");
    const parsed: ParsedSheet = parseSheet(markdown, "f.md");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { warnings, ...rest } = parsed;
    expect(() => assertParsedSheetShape(rest)).toThrow(/warnings/);
  });

  it("throws mentioning the violated field when a warning entry has an empty code (Task 2 case c)", () => {
    const markdown = readFileSync(FIXTURE_PATH, "utf8");
    const parsed: ParsedSheet = parseSheet(markdown, "f.md");
    const mutated: ParsedSheet = {
      ...parsed,
      warnings: [
        { ...parsed.warnings[0], code: "", severity: "warn", message: "x" },
        ...parsed.warnings.slice(1),
      ],
    };
    expect(() => assertParsedSheetShape(mutated)).toThrow(/code/);
  });

  it("throws for a hand-built object with a missing required field", () => {
    const bare = { show: {} };
    expect(() => assertParsedSheetShape(bare)).toThrow(/crewMembers/);
  });

  it("accepts a minimal hand-built valid ParsedSheet-shaped object", () => {
    const minimal: ParsedSheet = {
      show: {} as ParsedSheet["show"],
      crewMembers: [],
      hotelReservations: [],
      rooms: [],
      transportation: null,
      contacts: [],
      pullSheet: null,
      diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
      openingReel: null,
      raw_unrecognized: [],
      warnings: [],
      archivedPullSheetTabs: [],
      hardErrors: [],
    };
    expect(() => assertParsedSheetShape(minimal)).not.toThrow();
  });
});
