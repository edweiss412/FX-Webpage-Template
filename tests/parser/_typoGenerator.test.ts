import { describe, it, expect } from "vitest";
import { singleEditNeighbors, unambiguousTypos } from "@/tests/parser/_typoGenerator";

describe("singleEditNeighbors", () => {
  it("includes a deletion, a substitution, and an adjacent transposition", () => {
    const n = singleEditNeighbors("SET");
    expect(n).toContain("ET"); // deletion of S
    expect(n).toContain("EST"); // transpose S,E
    expect(n.every((x) => x !== "SET")).toBe(true); // never the original
  });
});

describe("unambiguousTypos", () => {
  it("drops neighbors that collide with another vocab member or tie", () => {
    // 'AB'/'AC' are distance-1 peers; a neighbor equal to a member or tying is dropped
    const typos = unambiguousTypos("AB", ["AB", "AC"], { minLen: 0 });
    expect(typos).not.toContain("AC"); // exact other member
    expect(typos).not.toContain("AD"); // ties AB & AC
    expect(typos.length).toBeGreaterThan(0); // e.g. 'ABB'/'ZB' survive
  });
});
