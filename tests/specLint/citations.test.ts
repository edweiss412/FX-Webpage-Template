import { describe, expect, it } from "vitest";
import { classifySpan } from "../../lib/specLint/citations";
import { CITATION_CASES } from "./citationCases";

describe("classifySpan — candidate domain + well-formedness (spec §4)", () => {
  it.each(CITATION_CASES.map((c) => [c.content, c] as const))(
    "classifies %j",
    (_label, c) => {
      expect(classifySpan(c.content)).toEqual(c.expected);
    },
  );
});
