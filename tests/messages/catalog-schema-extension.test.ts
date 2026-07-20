import { beforeAll, describe, it, expect, expectTypeOf } from "vitest";
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";
import { extractAdminLogOnlyCodes, CARD_SURFACED_LOG_ONLY } from "@/scripts/extract-admin-log-only-codes";

describe("MessageCatalogEntry M11 extension", () => {
  it("type declares title, longExplanation, helpHref as `string | null`", () => {
    expectTypeOf<MessageCatalogEntry["title"]>().toEqualTypeOf<string | null>();
    expectTypeOf<MessageCatalogEntry["longExplanation"]>().toEqualTypeOf<string | null>();
    expectTypeOf<MessageCatalogEntry["helpHref"]>().toEqualTypeOf<string | null>();
  });

  it("every live catalog entry has the three new fields present (initially null)", () => {
    for (const [code, entry] of Object.entries(MESSAGE_CATALOG)) {
      expect(entry, `${code} missing title field`).toHaveProperty("title");
      expect(entry, `${code} missing longExplanation field`).toHaveProperty("longExplanation");
      expect(entry, `${code} missing helpHref field`).toHaveProperty("helpHref");
    }
  });
});

describe("Catalog alignment with master-spec admin-log-only contract (Task B.3 hard gate)", () => {
  let derivedCodes: string[] = [];

  beforeAll(async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const masterSpec = readFileSync(
      join(process.cwd(), "docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md"),
      "utf8",
    );
    derivedCodes = extractAdminLogOnlyCodes(masterSpec);
  });

  it("derives a non-empty set (sanity check)", () => {
    expect(derivedCodes.length).toBeGreaterThan(10);
  });

  it("every derived code exists in MESSAGE_CATALOG (no missing-from-catalog drift)", () => {
    const missing = derivedCodes.filter(
      (code) => !(code in (MESSAGE_CATALOG as Record<string, unknown>)),
    );
    expect(missing, `derived but missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("every derived code has all six user-facing fields null", () => {
    const violations: string[] = [];
    for (const code of derivedCodes) {
      const entry = (MESSAGE_CATALOG as Record<string, Partial<MessageCatalogEntry>>)[code];
      if (!entry) continue;
      const nullFields = CARD_SURFACED_LOG_ONLY.has(code)
        ? // Card-surfaced carve-out (spec 2026-07-20-warning-card-copy-restore §3.1):
          // title/helpfulContext are required non-null and pinned elsewhere.
          (["dougFacing", "crewFacing", "longExplanation", "helpHref"] as const)
        : (["dougFacing", "crewFacing", "helpfulContext", "title", "longExplanation", "helpHref"] as const);
      for (const field of nullFields) {
        if (entry[field] !== null) {
          violations.push(`${code}.${field} = ${JSON.stringify(entry[field])} (expected null)`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
