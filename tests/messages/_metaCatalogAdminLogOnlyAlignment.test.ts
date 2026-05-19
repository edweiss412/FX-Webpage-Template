import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";
import { extractAdminLogOnlyCodes } from "@/scripts/extract-admin-log-only-codes";

describe("Catalog ↔ master-spec admin-log-only alignment (test #17)", () => {
  const masterSpec = readFileSync(
    join(process.cwd(), "docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md"),
    "utf8",
  );
  const derivedCodes = extractAdminLogOnlyCodes(masterSpec);

  it("derives a non-empty set", () => {
    expect(derivedCodes.length).toBeGreaterThan(0);
  });

  for (const code of derivedCodes) {
    it(`${code}: live catalog entry exists AND has all 6 user-facing fields null`, () => {
      const entry = (MESSAGE_CATALOG as Record<string, MessageCatalogEntry | undefined>)[code];
      expect(
        entry,
        `${code} present in master spec but missing from live catalog — B.3 must add a null stub`,
      ).toBeDefined();
      if (!entry) throw new Error(`${code} missing from live catalog`);
      expect(entry.dougFacing, `${code}.dougFacing should be null per master-spec admin-log-only`).toBeNull();
      expect(entry.crewFacing, `${code}.crewFacing should be null`).toBeNull();
      expect(entry.helpfulContext, `${code}.helpfulContext should be null`).toBeNull();
      expect(entry.title, `${code}.title should be null`).toBeNull();
      expect(entry.longExplanation, `${code}.longExplanation should be null`).toBeNull();
      expect(entry.helpHref, `${code}.helpHref should be null`).toBeNull();
    });
  }
});
