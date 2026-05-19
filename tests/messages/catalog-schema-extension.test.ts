import { describe, it, expect, expectTypeOf } from "vitest";
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";

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
