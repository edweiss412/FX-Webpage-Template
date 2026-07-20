/**
 * Show-scoped alert copy (spec 2026-07-20-show-scoped-alert-copy-design).
 *
 * ORACLE POLICY: expected copy is a FROZEN LITERAL written here, never derived
 * from the catalog. The usual "derive, never hardcode" rule assumes the fixture
 * is input; here the catalog is the subject under test, so deriving would
 * compare the implementation with itself. A template edit is MEANT to fail
 * these tests (spec §8).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { safeDougFacingTemplate } from "@/lib/admin/attentionItems";

describe("authored show-scoped variants", () => {
  it("ROLE_FLAGS_NOTICE drops the location prefix", () => {
    expect(MESSAGE_CATALOG.ROLE_FLAGS_NOTICE.dougFacingShowScoped).toBe(
      "<role-changes><lead-hint>",
    );
  });

  it("PICKER_BOOTSTRAP_RPC_FAILED drops the prefix and the redundant same-show clause", () => {
    expect(MESSAGE_CATALOG.PICKER_BOOTSTRAP_RPC_FAILED.dougFacingShowScoped).toBe(
      "Google picker bootstrap couldn't claim the signed-in user's crew identity, and they saw a retry page. If it keeps happening, contact the developer.",
    );
  });

  it("OAUTH_IDENTITY_CLAIMED opens on the crew name", () => {
    expect(MESSAGE_CATALOG.OAUTH_IDENTITY_CLAIMED.dougFacingShowScoped).toBe(
      "<crew-name> was claimed through Google sign-in as <email>. Future picker attempts for that row will route through Google sign-in.",
    );
  });

  it("the two lowercase-opening codes deliberately have NO variant", () => {
    expect(MESSAGE_CATALOG.AMBIGUOUS_EMAIL_BINDING).not.toHaveProperty("dougFacingShowScoped");
    expect(MESSAGE_CATALOG.PICKER_SELECTION_RACE).not.toHaveProperty("dougFacingShowScoped");
  });

  it("global dougFacing is untouched for every adopting code", () => {
    expect(MESSAGE_CATALOG.ROLE_FLAGS_NOTICE.dougFacing).toBe(
      "In <sheet-name>, <role-changes><lead-hint>",
    );
  });
});

describe("safeDougFacingTemplate selects the show-scoped variant", () => {
  const params = {
    "role-changes": "Doug Larson was added with LEAD + V1.",
    "lead-hint": "",
    "sheet-name": "'II - RIA Investment Forum - Central 2025'",
  };

  it("returns the variant when one exists", () => {
    expect(safeDougFacingTemplate("ROLE_FLAGS_NOTICE", params)).toBe("<role-changes><lead-hint>");
  });

  it("falls back to dougFacing when no variant exists", () => {
    const p = {
      email: "a@b.com",
      "crew-row-count": "2 crew rows",
      "show-name": "'X'",
    };
    expect(safeDougFacingTemplate("AMBIGUOUS_EMAIL_BINDING", p)).toBe(
      MESSAGE_CATALOG.AMBIGUOUS_EMAIL_BINDING.dougFacing,
    );
  });

  it("returns null for an uncataloged code under the new selection branch", () => {
    expect(safeDougFacingTemplate("NOT_A_REAL_CODE", params)).toBeNull();
  });

  it("returns null when params leave a placeholder unresolved in the VARIANT", () => {
    // The guard must reject the SELECTED template, not the global one.
    expect(safeDougFacingTemplate("ROLE_FLAGS_NOTICE", undefined)).toBeNull();
  });

  it("returns a param-free variant unchanged even with undefined params", () => {
    // Anti-tautology pair with the test above: proves the guard rejects for the
    // right reason rather than rejecting everything.
    expect(safeDougFacingTemplate("PICKER_BOOTSTRAP_RPC_FAILED", undefined)).toBe(
      MESSAGE_CATALOG.PICKER_BOOTSTRAP_RPC_FAILED.dougFacingShowScoped,
    );
  });
});

/**
 * Extract the argument text of the first `deriveAlertMessageParams(...)` call
 * by walking to its matching close paren. A regex cannot do this: the call in
 * bellFeed.ts is multi-line, contains a nested `get(...)`, and sits inside an
 * object literal so it ends with ")," rather than ");".
 */
function allCallArgs(src: string): string[] {
  const needle = "deriveAlertMessageParams(";
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const one = callArgsAt(src, from, needle);
    if (!one) return out;
    out.push(one.args);
    from = one.end;
  }
}

function callArgsAt(
  src: string,
  from: number,
  needle: string,
): { args: string; end: number } | null {
  const start = src.indexOf(needle, from);
  if (start < 0) return null;
  let i = start + needle.length;
  let depth = 1;
  let inString: string | null = null;
  for (; i < src.length && depth > 0; i++) {
    const c = src[i]!;
    if (inString) {
      if (c === "\\") i++;
      else if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") inString = c;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
  }
  return depth === 0 ? { args: src.slice(start + needle.length, i - 1), end: i } : null;
}

describe("production callers pass the correct scope", () => {
  // The three callers are a closed set (spec §2), so pin each one's literal.
  // Unit tests exercise deriveAlertMessageParams directly, so without this a
  // caller could pass the wrong scope and every other gate would still pass:
  // typecheck proves an argument EXISTS, not that it is the right one.
  it.each([
    ["lib/adminAlerts/fetchPerShowAlerts.ts", '"show"'],
    ["lib/admin/bellFeed.ts", '"global"'],
    ["components/admin/telemetry/HealthAlertsPanel.tsx", '"global"'],
  ])("%s passes %s", (file, scope) => {
    // EVERY call in the file, not just the first (whole-diff review finding 2):
    // a correct first call could otherwise mask a second one with the wrong
    // scope, silently suppressing the bell's lead hint.
    const calls = allCallArgs(readFileSync(file, "utf8"));
    expect(calls.length, `${file} no longer calls deriveAlertMessageParams`).toBeGreaterThan(0);
    for (const args of calls) {
      // The scope must be the FINAL argument, not merely present somewhere in
      // the argument text: a comment or an earlier argument could satisfy that.
      const parts = args
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      expect(parts[parts.length - 1], `${file} passes the wrong scope`).toBe(scope);
    }
  });
});

describe("resolve-error copy is label-agnostic", () => {
  // NOTE: the component's GENERIC_ERROR fallback is asserted BEHAVIORALLY in
  // tests/components/admin/resolveLabelCrossProduct.test.tsx (it renders the
  // component and drives the real 500 path). A source scan here would pass on
  // an unused constant, so it is deliberately not repeated.
  //
  // FROZEN LITERALS, not pattern exclusions: asserting "does not match
  // /Mark resolved/" plus one substring lets materially wrong replacement copy
  // through, and the parity gate only proves the three artifacts agree with
  // EACH OTHER, not that the copy is right.
  // The label reference lives in helpfulContext (the "?" popover body) and
  // longExplanation (the help page), not dougFacing. Both are user-visible.
  it.each(["ADMIN_ALERT_NOT_FOUND", "ALERT_REQUIRES_SHOW_SCOPED_RESOLVE"])(
    "%s names no specific button label in any user-visible field",
    (code) => {
      const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG];
      for (const field of ["dougFacing", "helpfulContext", "longExplanation"] as const) {
        const copy = (entry as Record<string, unknown>)[field];
        if (typeof copy !== "string") continue;
        expect(copy, `${code}.${field} names the button label`).not.toMatch(/Mark resolved/);
      }
    },
  );

  it("ADMIN_ALERT_NOT_FOUND helpfulContext reads exactly the approved string", () => {
    expect(MESSAGE_CATALOG.ADMIN_ALERT_NOT_FOUND.helpfulContext).toBe(
      "When you tried to resolve that alert, the server looked it up by id and either didn't find it (already resolved + cleaned up, or never existed) or it belongs to a different show than the page you clicked from. Refresh the dashboard to see the current state.",
    );
  });

  it("ALERT_REQUIRES_SHOW_SCOPED_RESOLVE helpfulContext points at the action, not a label", () => {
    // Its longExplanation never named the label; helpfulContext did, and now
    // directs the reader by action ("resolve it there") instead.
    expect(MESSAGE_CATALOG.ALERT_REQUIRES_SHOW_SCOPED_RESOLVE.helpfulContext).toContain(
      "resolve it there",
    );
  });
});
