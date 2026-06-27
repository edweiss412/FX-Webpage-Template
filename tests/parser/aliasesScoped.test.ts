import { describe, it, expect } from "vitest";
import { resolveAliasScoped } from "@/lib/parser/aliases";

describe("resolveAliasScoped", () => {
  it("exact in-scope alias → corrected:false", () => {
    // 'Venue Address' is an exact alias of venue.address
    expect(resolveAliasScoped("Venue Address", "venue.")).toEqual({
      canonical: "venue.address",
      corrected: false,
    });
  });
  it("exact OUT-of-scope alias → null (never borrows another block's canonical)", () => {
    // 'Client Contact' is an exact alias of client.contact — NOT a venue field
    expect(resolveAliasScoped("Client Contact", "venue.")).toBeNull();
  });
  it("fuzzy in-scope near-miss → corrected:true", () => {
    // 'Venue Adress' (deletion) is Damerau 1 from the in-scope alias 'Venue Address'
    expect(resolveAliasScoped("Venue Adress", "venue.")).toEqual({
      canonical: "venue.address",
      corrected: true,
    });
  });
  it("a short (<5) near-miss is NOT fuzzed (minLen)", () => {
    expect(resolveAliasScoped("Note", "venue.")).toBeNull();
  });
  it("an unrelated label → null", () => {
    expect(resolveAliasScoped("Completely Unrelated Thing", "venue.")).toBeNull();
  });
});
