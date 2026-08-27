/**
 * The scanner core's positive control. Eighteen cases, fourteen expecting a report.
 *
 * Every case is a string literal here, so the core is exercised as a function of
 * text and is immune to both the disk and the module graph. Cases needing symbol or
 * type resolution run through a STUB resolver whose answers this file controls, so
 * the core's own branching is under test rather than the checker's — the checker is
 * exercised separately by the premises in _metaInfraEmitCover.test.ts.
 *
 * Each report case asserts the reported REASON, not merely that something was
 * reported: a core that reported everything for the wrong cause would pass a
 * weaker assertion and fails these.
 */
import { describe, expect, test } from "vitest";
import ts from "typescript";
import { scanSourceFile, type Resolver, type Site } from "./infraEmitScan";

/** Answers the core cannot derive from text, controlled per case. */
function stub(over: Partial<Resolver> = {}): Resolver {
  return {
    isConstAlias: (id) => id.text === "FAIL" || id.text === "INFRA_ERROR",
    calleeOrigin: () => ({ inCover: true, origin: "imported" }),
    isObjectPayload: (expr) => {
      // The stub stands in for the type checker: anything spelled like a flattening
      // is a scalar. The REAL predicate is a positive object-type test; its fidelity
      // is measured against a live checker in the emit-payload probe.
      const t = expr.getText();
      return !/\.message\b|^String\(|^`|^"|^'|^\d/.test(t) && t !== "flat";
    },
    typeMentionsInfra: () => false,
    callProducedInCover: () => null,
    ...over,
  };
}

function scan(src: string, over: Partial<Resolver> = {}): Site[] {
  const sf = ts.createSourceFile("case.ts", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return scanSourceFile(sf, stub(over));
}
const only = (src: string, over: Partial<Resolver> = {}): Site => {
  const s = scan(src, over);
  expect(s, `expected exactly one site, got ${s.length}`).toHaveLength(1);
  return s[0]!;
};
const reason = (s: Site): string =>
  s.verdict.kind === "reported" ? s.verdict.reason : `NOT-REPORTED(${s.verdict.kind})`;

const RET = `return { kind: "infra_error", message: m };`;

describe("infraEmitScan — reported cases", () => {
  test("a dark returned-error arm", () => {
    expect(reason(only(`function f(){ if (error) { ${RET} } }`))).toBe("no-emit");
  });

  test("log.* with a message but no code — a SHOUTY message is not a code", () => {
    expect(
      reason(
        only(`function f(){ if (error) { log.error("SOMETHING_FAILED", { source: s }); ${RET} } }`),
      ),
    ).toBe("emit-without-code");
  });

  test("code present, no error field — categorised but empty", () => {
    expect(reason(only(`function f(){ if (error) { log.error("m", { code: C }); ${RET} } }`))).toBe(
      "emit-without-payload",
    );
  });

  test("error: error.message — the flattened payload", () => {
    expect(
      reason(
        only(
          `function f(){ if (error) { log.error("m", { code: C, error: error.message }); ${RET} } }`,
        ),
      ),
    ).toBe("emit-payload-not-object");
  });

  test("a bare identifier aliased to a scalar", () => {
    expect(
      reason(
        only(
          `function f(){ if (error) { const flat = error.message; log.error("m", { code: C, error: flat }); ${RET} } }`,
        ),
      ),
    ).toBe("emit-payload-not-object");
  });

  test("error: String(raw) — same rule, different spelling", () => {
    expect(
      reason(
        only(
          `function f(){ if (error) { log.error("m", { code: C, error: String(error) }); ${RET} } }`,
        ),
      ),
    ).toBe("emit-payload-not-object");
  });

  test("error: a template literal", () => {
    expect(
      reason(
        only(
          `function f(){ if (error) { log.error("m", { code: C, error: \`\${error.code}\` }); ${RET} } }`,
        ),
      ),
    ).toBe("emit-payload-not-object");
  });

  test("error: a numeric status — a scalar that is not a string", () => {
    expect(
      reason(
        only(`function f(){ if (error) { log.error("m", { code: C, error: 403 }); ${RET} } }`),
      ),
    ).toBe("emit-payload-not-object");
  });

  test("an emit lexically AFTER the return is unreachable", () => {
    expect(
      reason(only(`function f(){ if (error) { ${RET} log.error("m", { code: C, error }); } }`)),
    ).toBe("emit-after-return");
  });

  test("an emit inside a nested closure does not run on this path", () => {
    expect(
      reason(
        only(
          `function f(){ if (error) { const g = () => log.error("m", { code: C, error }); ${RET} } }`,
        ),
      ),
    ).toBe("emit-in-nested-function");
  });

  test("a propagation guard whose return is in the ELSE arm creates the fault locally", () => {
    expect(
      reason(
        only(
          `function f(){ if (sub.kind === "infra_error") { return { kind: "ok" }; } else { ${RET} } }`,
        ),
      ),
    ).toBe("propagation-else-arm");
  });

  test("a propagation callee declared outside the cover", () => {
    expect(
      reason(
        only(`function f(){ if (sub.kind === "infra_error") { ${RET} } }`, {
          calleeOrigin: () => ({ inCover: false, origin: "imported" }),
        }),
      ),
    ).toBe("propagation-callee-outside-cover");
  });

  test("an UNRESOLVABLE propagation-shaped guard still demands its own emit", () => {
    expect(
      reason(
        only(`function f(){ if (sub.kind === "infra_error") { ${RET} } }`, {
          calleeOrigin: () => null,
        }),
      ),
    ).toBe("no-emit");
  });

  test("log.debug is NOT a satisfying sink — it never persists", () => {
    // lib/log/logger.ts refuses to persist a debug record unconditionally, even
    // with a code. An earlier version accepted debug, which let a loader pass this
    // guard while leaving no app_events row — the exact outcome the bound forbids.
    // The reason is `no-emit` rather than a level-specific one: debug is not
    // matched as a sink at all, so from the guard's view no qualifying emit
    // exists. Deliberately not given its own Reason variant — nothing in
    // lib/admin uses log.debug on an infra path, and the enum is already nine
    // values wide.
    expect(
      reason(only(`function f(){ if (error) { log.debug("m", { code: C, error }); ${RET} } }`)),
    ).toBe("no-emit");
  });

  test("a non-equality guard is NOT propagation, even from an in-cover callee", () => {
    // `if (count > 5)` is ordinary business logic returning a locally created
    // fault. An earlier version accepted any binary test whose left side was an
    // identifier, so this was exempted and left dark.
    expect(
      reason(
        only(`function f(){ if (count > 5) { ${RET} } }`, {
          calleeOrigin: () => ({ inCover: true, origin: "local" }),
        }),
      ),
    ).toBe("no-emit");
  });

  test("an equality guard against a NON-nullish value is NOT propagation", () => {
    expect(
      reason(
        only(`function f(){ if (rows.length === 0) { ${RET} } }`, {
          calleeOrigin: () => ({ inCover: true, origin: "local" }),
        }),
      ),
    ).toBe("no-emit");
  });

  test("a kind guard against a DIFFERENT kind is NOT propagation", () => {
    expect(
      reason(
        only(`function f(){ if (sub.kind === "not_found") { ${RET} } }`, {
          calleeOrigin: () => ({ inCover: true, origin: "local" }),
        }),
      ),
    ).toBe("no-emit");
  });

  test("logAdminOutcome is not a sink here — no lib/admin read calls it", () => {
    expect(
      reason(only(`function f(){ if (error) { logAdminOutcome({ code: C, error }); ${RET} } }`)),
    ).toBe("no-emit");
  });
});

describe("infraEmitScan — satisfied and exempt cases", () => {
  test("log.error with a code and an object payload", () => {
    const s = only(`function f(){ if (error) { log.error("m", { code: C, error }); ${RET} } }`);
    expect(s.verdict.kind).toBe("satisfied");
  });

  test("an alias bound to the object itself", () => {
    const s = only(
      `function f(){ if (error) { const err = error; log.error("m", { code: C, error: err }); ${RET} } }`,
    );
    expect(s.verdict.kind).toBe("satisfied");
  });

  test("a propagation guard, consequent, callee IMPORTED from inside the cover", () => {
    const s = only(`function f(){ if (sub.kind === "infra_error") { ${RET} } }`, {
      calleeOrigin: () => ({ inCover: true, origin: "imported" }),
    });
    expect(s.verdict).toEqual({ kind: "exempt-propagation", origin: "imported" });
  });

  test("an `=== undefined` guard is propagation too — the other nullish sentinel", () => {
    const s = only(`function f(){ if (row === undefined) { ${RET} } }`, {
      calleeOrigin: () => ({ inCover: true, origin: "local" }),
    });
    expect(s.verdict).toEqual({ kind: "exempt-propagation", origin: "local" });
  });

  test("a null guard over a value from a cover callee is propagation too", () => {
    // lib/admin/driveConnectionHealth.ts has fifteen of these: a helper swallows
    // the Supabase error and returns null. Emitting at BOTH layers would write two
    // app_events rows for one fault, which is what the exemption prevents. The
    // helper is where the fault arrives and where it is recorded.
    const s = only(`function f(){ if (count === null) { ${RET} } }`, {
      calleeOrigin: () => ({ inCover: true, origin: "local" }),
    });
    expect(s.verdict).toEqual({ kind: "exempt-propagation", origin: "local" });
  });

  test("a guard the resolver cannot trace falls through to the emit check", () => {
    // The generalisation diverts ONLY on a positive resolution. An unresolvable
    // subject — a catch binding, a locally destructured `{ error }` — is an
    // ordinary arrival and must carry its own record, so it lands on the emit
    // search rather than on a propagation verdict.
    const s = only(`function f(){ if (count === null) { ${RET} } }`, {
      calleeOrigin: () => null,
    });
    expect(reason(s)).toBe("no-emit");
  });

  test("...and it is SATISFIED when that arrival does carry an emit", () => {
    const s = only(
      `function f(){ if (error || typeof count !== "number") { log.error("m", { code: C, error }); ${RET} } }`,
      { calleeOrigin: () => null },
    );
    expect(s.verdict.kind).toBe("satisfied");
  });

  test("a propagation guard, consequent, callee declared LOCALLY inside the cover", () => {
    // runBellPipeline (lib/admin/bellFeed.ts:191) is the live witness. An
    // imported-only rule reports this and its "repair" is a duplicate emit.
    const s = only(`function f(){ if (sub.kind === "infra_error") { ${RET} } }`, {
      calleeOrigin: () => ({ inCover: true, origin: "local" }),
    });
    expect(s.verdict).toEqual({ kind: "exempt-propagation", origin: "local" });
  });
});

describe("infraEmitScan — the population accept-set", () => {
  test("a const alias is in the population and carries its shape", () => {
    const s = only(`function f(){ if (error) { return FAIL; } }`);
    expect(s.shape).toBe("const-alias");
  });

  test("an unmodelled shape whose type mentions the arm is REPORTED, not skipped", () => {
    const s = only(`function f(){ if (error) { return makeFail(); } }`, {
      typeMentionsInfra: () => true,
    });
    expect(s.shape).toBe("unclassified");
    expect(reason(s)).toBe("unclassifiable-construction");
  });

  test("a return the accept-set rejects and whose type does not mention the arm is not a site", () => {
    expect(scan(`function f(){ return { kind: "ok" }; }`)).toHaveLength(0);
  });

  test("a call-produced value is the callee's responsibility when the callee is in the cover", () => {
    // driveConnectionHealth's eleven `return warn(...)` sites: the helper is declared
    // to return the whole union and constructs only the warn arm. Reporting them is
    // the type-mention over-collection; allow-listing them would be a case list.
    const s = only(`function f(){ return warn(a, b); }`, {
      typeMentionsInfra: () => true,
      callProducedInCover: () => ({ origin: "local" }),
    });
    expect(s.verdict).toEqual({ kind: "exempt-propagation", origin: "local" });
  });

  test("a call-produced value whose callee is OUTSIDE the cover is still reported", () => {
    const s = only(`function f(){ return farAway(); }`, {
      typeMentionsInfra: () => true,
      callProducedInCover: () => null,
    });
    expect(reason(s)).toBe("unclassifiable-construction");
  });
});
