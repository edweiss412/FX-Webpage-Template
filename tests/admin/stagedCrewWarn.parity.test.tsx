import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { autocorrectGuidance } from "@/lib/messages/autocorrectGuidance";

// Task 11 (plan §7 / spec §10.7). The scope split:
//   - COPY is UNIVERSAL: the instance line is a pure function of the warning, so a staged
//     card and a published card render the same line for the same warning.
//   - PLACEMENT is PUBLISHED-ONLY: only PublishedReviewModal builds the under-row crew
//     stacks; StagedReviewCard never threads crewUnderRowCards, so staged rows grow none.

describe("staged scope split", () => {
  it("copy is universal: the instance line does not depend on surface", () => {
    const w = {
      subject: "Eric Weiss",
      corrections: [{ detected: "Strke", corrected: "Strike" }],
    };
    // Same input → same line; the composer has no surface parameter, so a staged and a
    // published card cannot diverge in copy.
    expect(autocorrectGuidance("STAGE_WORD_AUTOCORRECTED", w)).toBe(
      "We read 'Strke' as 'Strike' in Eric Weiss's role.",
    );
  });

  it("under-row placement is wired only in the published modal, not the staged card", () => {
    const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
    const published = read("components/admin/showpage/PublishedReviewModal.tsx");
    const staged = read("components/admin/StagedReviewCard.tsx");
    // The published modal builds crew under-row cards; the staged card does not.
    expect(published).toMatch(/renderCrewUnderRowCards/);
    expect(staged).not.toMatch(/renderCrewUnderRowCards/);
    expect(staged).not.toMatch(/crewUnderRowCards/);
  });
});
