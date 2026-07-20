/**
 * Defenses 1-3 (spec 2026-07-20-show-scoped-alert-copy-design §7).
 *
 * Each fails because something is ABSENT or RENDERS wrong, never because a
 * predicate guessed. An earlier design used a runtime classifier to decide
 * which templates could drop their location prefix; a total classifier answers
 * for every new template and so can never fail by default. Classification is
 * authored into the catalog instead, and these tests police the authoring.
 */
import { describe, it, expect } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { interpolate, PLACEHOLDER_RE } from "@/lib/messages/lookup";

const PREFIX_RE = /^In <(sheet-name|show-name)>, /;

/** Templates that keep a literal location prefix, with the reason. */
const PREFIX_EXEMPT: Record<string, string> = {
  AMBIGUOUS_EMAIL_BINDING:
    "remainder opens with <email>, a lowercase value; rewording is spec B copy work",
  PICKER_SELECTION_RACE:
    "remainder opens 'a stale picker selection', lowercase; rewording is spec B copy work",
};

/** Frozen pairs. Editing a global string fails here, naming its variant. */
const PAIRED: Record<string, { global: string; show: string }> = {
  ROLE_FLAGS_NOTICE: {
    global: "In <sheet-name>, <role-changes><lead-hint>",
    show: "<role-changes><lead-hint>",
  },
  PICKER_BOOTSTRAP_RPC_FAILED: {
    global:
      "In <show-name>, Google picker bootstrap couldn't claim the signed-in user's crew identity, and they saw a retry page. If it keeps happening for the same show, contact the developer.",
    show: "Google picker bootstrap couldn't claim the signed-in user's crew identity, and they saw a retry page. If it keeps happening, contact the developer.",
  },
  OAUTH_IDENTITY_CLAIMED: {
    global:
      "In <show-name>, <crew-name> was claimed through Google sign-in as <email>. Future picker attempts for that row will route through Google sign-in.",
    show: "<crew-name> was claimed through Google sign-in as <email>. Future picker attempts for that row will route through Google sign-in.",
  },
};

type Entry = { dougFacing: string | null; dougFacingShowScoped?: string };
const entries = Object.entries(MESSAGE_CATALOG) as [string, Entry][];

describe("defense 1: no un-declared prefixed template", () => {
  it("every literal-prefixed template either declares a variant or is exempt", () => {
    const undeclared = entries
      .filter(([, e]) => typeof e.dougFacing === "string" && PREFIX_RE.test(e.dougFacing))
      .filter(([code, e]) => e.dougFacingShowScoped === undefined && !(code in PREFIX_EXEMPT))
      .map(([code]) => code);
    expect(undeclared, "add dougFacingShowScoped or a PREFIX_EXEMPT reason").toEqual([]);
  });

  it("every exempt row carries a written reason", () => {
    for (const [code, reason] of Object.entries(PREFIX_EXEMPT)) {
      expect(reason.length, `${code} exemption needs a real reason`).toBeGreaterThan(20);
    }
  });

  it("every exempt code still exists and still carries the prefix", () => {
    // Otherwise an exemption outlives the template it excuses.
    for (const code of Object.keys(PREFIX_EXEMPT)) {
      const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG] as Entry | undefined;
      expect(entry, `${code} is exempt but no longer in the catalog`).toBeDefined();
      expect(PREFIX_RE.test(entry!.dougFacing ?? ""), `${code} no longer needs its exemption`).toBe(
        true,
      );
    }
  });
});

describe("defense 2: variants are valid as RENDERED output", () => {
  // Worst-case fixture: every conditionally-empty token at its emptiest legal
  // value. A template-level non-empty check is vacuous, since "<lead-hint>"
  // passes it and renders to nothing.
  const worstCase = {
    "role-changes": "a crew member's role flags changed; see the show page.",
    "lead-hint": "",
    "crew-name": "someone",
    email: "unknown",
    "show-name": "this show",
    "sheet-name": "this sheet",
  };

  for (const [code, e] of entries) {
    if (e.dougFacingShowScoped === undefined) continue;

    it(`${code} renders non-empty with no leaked placeholder`, () => {
      const rendered = interpolate(e.dougFacingShowScoped!, worstCase) ?? "";
      expect(rendered.trim().length, `${code} variant renders empty`).toBeGreaterThan(0);
      // PLACEHOLDER_RE carries /g, so .test() is stateful via lastIndex and can
      // false-negative on a later call. Match instead.
      expect(rendered.match(PLACEHOLDER_RE), `${code} leaked a placeholder`).toBeNull();
    });

    it(`${code} variant does not itself open with the location prefix`, () => {
      expect(PREFIX_RE.test(e.dougFacingShowScoped!)).toBe(false);
    });

    it(`${code} variant introduces no token the global template lacks`, () => {
      const tokens = (s: string) => new Set(s.match(PLACEHOLDER_RE) ?? []); // match, never test
      const globalTokens = tokens(e.dougFacing ?? "");
      const extra = [...tokens(e.dougFacingShowScoped!)].filter((t) => !globalTokens.has(t));
      expect(extra, `${code} variant adds tokens the derive layer may not populate`).toEqual([]);
    });
  }
});

describe("defense 3: paired-string drift", () => {
  it("the frozen fixture covers EXACTLY the codes defining a variant", () => {
    const declaring = entries
      .filter(([, e]) => e.dougFacingShowScoped !== undefined)
      .map(([c]) => c)
      .sort();
    expect(Object.keys(PAIRED).sort()).toEqual(declaring);
  });

  for (const [code, pair] of Object.entries(PAIRED)) {
    it(`${code} both strings match the frozen pair`, () => {
      const e = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG] as Entry;
      // If this fails on the global string, READ THE SHOW VARIANT before
      // re-blessing. Coupling the two is the entire point of the pairing.
      expect(e.dougFacing).toBe(pair.global);
      expect(e.dougFacingShowScoped).toBe(pair.show);
    });
  }
});
