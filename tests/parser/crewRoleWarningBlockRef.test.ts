import { describe, it, expect } from "vitest";
import { parseCrew } from "@/lib/parser/blocks/crew";
import { newAggregator } from "@/lib/parser/warnings";

// New-template CREW table with an unrecognized role token ("WIDGETMASTER").
const NEW_TPL = [
  "| CREW | NAME | ROLE | PHONE |",
  "| --- | --- | --- | --- |",
  "|  | Jane Doe | - WIDGETMASTER | 555-1212 |",
].join("\n");

// Old TECH template: name+schedule+role merged in col 0; "WIDGETMASTER" unknown.
const TECH_TPL = [
  "| TECH | PHONE | ARRIVAL | DEPARTURE |",
  "| --- | --- | --- | --- |",
  "| John Smith - WIDGETMASTER | 555-2323 |  |  |",
].join("\n");

// Triple-asterisk day restriction with no explicit days → UNKNOWN_DAY_RESTRICTION.
const TRIPLE = [
  "| CREW | NAME | ROLE | PHONE |",
  "| --- | --- | --- | --- |",
  "|  | Amy Lane | - LEAD*** | 555-3434 |",
].join("\n");

function roleWarnings(markdown: string, version: "v1" | "v2" | "v4") {
  const agg = newAggregator();
  parseCrew(markdown, version, agg);
  return agg.warnings;
}

describe("crew-role warnings carry blockRef.name", () => {
  it("UNKNOWN_ROLE_TOKEN (new template) carries blockRef {kind:'crew', name:<NAME cell>}", () => {
    const w = roleWarnings(NEW_TPL, "v4").find((x) => x.code === "UNKNOWN_ROLE_TOKEN");
    expect(w?.blockRef).toMatchObject({ kind: "crew", index: 0, name: "Jane Doe" });
  });

  it("UNKNOWN_ROLE_TOKEN (old TECH template) carries blockRef.name = extracted name segment", () => {
    const w = roleWarnings(TECH_TPL, "v1").find((x) => x.code === "UNKNOWN_ROLE_TOKEN");
    expect(w?.blockRef).toMatchObject({ kind: "crew", index: 0, name: "John Smith" });
  });

  it("UNKNOWN_DAY_RESTRICTION carries blockRef.name", () => {
    const w = roleWarnings(TRIPLE, "v4").find((x) => x.code === "UNKNOWN_DAY_RESTRICTION");
    expect(w?.blockRef).toMatchObject({ kind: "crew", index: 0, name: "Amy Lane" });
  });
});
