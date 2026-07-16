import { describe, expect, test } from "vitest";
import {
  ROLE_NORMALIZATIONS,
  MULTI_WORD_TOKENS,
  canonicalRoleToken,
  isBuiltInRoleToken,
} from "@/lib/parser/roleVocabulary";
import { extractRoleFlags } from "@/lib/parser/personalization";

describe("canonicalRoleToken", () => {
  test("trims and uppercases, preserves internal whitespace VERBATIM (spec §5.3)", () => {
    expect(canonicalRoleToken("  drone   op ")).toBe("DRONE   OP");
    expect(canonicalRoleToken("a1")).toBe("A1");
  });
});

describe("isBuiltInRoleToken — tie-to-emission matrix (spec §8.3)", () => {
  test("(a) every exact ROLE_NORMALIZATIONS key is built-in", () => {
    for (const key of Object.keys(ROLE_NORMALIZATIONS)) {
      expect(isBuiltInRoleToken(key), key).toBe(true);
    }
  });

  test("(b) repeated-internal-whitespace variants of SPACE-CONTAINING keys are built-in AND emit no UNKNOWN_ROLE_TOKEN", () => {
    for (const mwt of MULTI_WORD_TOKENS) {
      const variant = mwt.replace(/ /g, "   ");
      expect(isBuiltInRoleToken(variant), variant).toBe(true);
      const { warnings } = extractRoleFlags(variant);
      expect(warnings.filter((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toEqual([]);
    }
  });

  test("(c) ONLY is built-in (tokenizer skips it before lookup, personalization.ts:352)", () => {
    expect(isBuiltInRoleToken("ONLY")).toBe(true);
    const { warnings } = extractRoleFlags("ONLY");
    expect(warnings.filter((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toEqual([]);
  });

  test("a genuinely novel token is NOT built-in", () => {
    expect(isBuiltInRoleToken("DRONE OP")).toBe(false);
  });
});
