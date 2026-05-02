import { describe, it, expect } from "vitest";
import { resolveAlias, FIELD_ALIASES } from "@/lib/parser/aliases";

describe("resolveAlias", () => {
  describe("resolves known typos", () => {
    it("resolves Hotal Contact Info typo", () => {
      expect(resolveAlias("Hotal Contact Info")).toBe("venue.contact_info");
    });

    it("resolves DIagrams capitalization typo", () => {
      expect(resolveAlias("DIagrams")).toBe("details.diagrams");
    });

    it("resolves Virtaul Audience typo", () => {
      expect(resolveAlias("Virtaul Audience")).toBe("details.virtual_audience");
    });

    it("resolves Goosneck typo", () => {
      expect(resolveAlias("Goosneck")).toBe("details.gooseneck");
    });
  });

  describe("case-insensitive", () => {
    it("resolves lowercase po# to ops.po", () => {
      expect(resolveAlias("po#")).toBe("ops.po");
    });

    it("resolves uppercase PO# to ops.po", () => {
      expect(resolveAlias("PO#")).toBe("ops.po");
    });

    it("resolves mixed-case Hotel Contact Info", () => {
      expect(resolveAlias("hotel contact info")).toBe("venue.contact_info");
    });

    it("resolves DIAGRAMS all-caps", () => {
      expect(resolveAlias("DIAGRAMS")).toBe("details.diagrams");
    });
  });

  describe("trims whitespace", () => {
    it("trims leading and trailing spaces from PO#", () => {
      expect(resolveAlias("  PO#  ")).toBe("ops.po");
    });

    it("trims whitespace from known alias", () => {
      expect(resolveAlias("  Hotel Contact Info  ")).toBe("venue.contact_info");
    });
  });

  describe("returns null for unknown labels", () => {
    it("returns null for Sponsor Lounge Access", () => {
      expect(resolveAlias("Sponsor Lounge Access")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(resolveAlias("")).toBeNull();
    });

    it("returns null for unrecognized field", () => {
      expect(resolveAlias("Totally Unknown Field")).toBeNull();
    });
  });

  describe("FIELD_ALIASES structure", () => {
    it("has canonical keys", () => {
      expect(Object.keys(FIELD_ALIASES).length).toBeGreaterThan(0);
    });

    it("every canonical key has at least one alias", () => {
      for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
        expect(aliases.length, `${key} must have at least one alias`).toBeGreaterThan(0);
      }
    });
  });
});
