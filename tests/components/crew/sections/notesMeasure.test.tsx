// @vitest-environment jsdom
/**
 * tests/components/crew/sections/notesMeasure.test.tsx
 *
 * At the 1440px page width a full-width note ran about 150 characters a line, past
 * DESIGN.md's 65 to 75 character measure for body text (invariant-8 gate on
 * feat/crew-page-width-1440, critique A and the audit). Show notes and venue notes
 * cap their text at 75ch; the card around them still fills the column.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("note text keeps a readable measure", () => {
  it.each([
    ["show notes", "components/crew/sections/HomeSection.tsx", 3],
    ["venue notes", "components/crew/sections/VenueSection.tsx", 1],
  ])("%s cap their text at 75ch", (_name, file, count) => {
    const source = readFileSync(file, "utf8");
    expect(source.match(/max-w-\[75ch\]/g)?.length ?? 0).toBe(count);
  });
});
