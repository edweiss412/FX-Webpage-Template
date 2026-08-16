/**
 * tests/auth/sameOriginServerAction.test.ts
 *
 * The §3.3 truth table of the same-origin Server Action gate, one row per
 * `{sec-fetch-site} × {origin}` combination
 * (docs/superpowers/specs/2026-08-15-auth-picker-hardening-design.md §3.3).
 *
 * Anti-tautology: the PRECEDENCE rows pin both directions of "sec-fetch-site
 * wins over origin". A naive `origin === site` fallback consulted first would
 * wrongly ALLOW `cross-site` + matching origin; an implementation that lets a
 * mismatching Origin override the Fetch-Metadata verdict would wrongly REJECT
 * `same-origin` + mismatching origin. Both shapes fail here.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ts from "typescript";
import { premiseHolds } from "../_shared/premise";

const headerMap = new Map<string, string>();

/**
 * `headers()` throws outside a request scope. The gate treats that as ALLOW
 * (spec §7 documented limit), so the suite has to be able to produce the
 * throw — a mock that only ever resolves cannot reach the branch at all.
 */
const headersControl = vi.hoisted(() => ({ throws: false }));
vi.mock("next/headers", () => ({
  headers: async () => {
    if (headersControl.throws) throw new Error("headers() outside a request scope");
    return { get: (k: string) => headerMap.get(k.toLowerCase()) ?? null };
  },
}));

/**
 * A passthrough by default, so every truth-table row still exercises the REAL
 * `resolveSiteOrigin` against `vi.stubEnv`. The toggle exists for one case: a
 * fault raised OUTSIDE `headers()` must still propagate, which is what makes
 * the catch above scoped rather than a swallow.
 */
const siteOriginControl = vi.hoisted(() => ({ throws: false }));
vi.mock("@/lib/notify/siteOrigin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notify/siteOrigin")>();
  return {
    ...actual,
    resolveSiteOrigin: (raw?: string | undefined) => {
      if (siteOriginControl.throws) throw new Error("site-origin resolution fault");
      return actual.resolveSiteOrigin(raw);
    },
  };
});

const SITE_ORIGIN_FAULT = "site-origin resolution fault";
const FORBIDDEN_INTERRUPT = "NEXT_HTTP_ERROR_FALLBACK;403";

/** Mirrors the real `forbidden()`, which returns `never` by throwing. */
const forbiddenSpy = vi.hoisted(() =>
  vi.fn((): never => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;403");
  }),
);
vi.mock("next/navigation", () => ({ forbidden: forbiddenSpy }));

const logMock = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("@/lib/log", () => ({ log: logMock }));

import {
  assertSameOriginServerAction,
  isSameOriginServerAction,
  rejectCrossOriginNeutral,
  rejectCrossOriginPicker,
  rejectCrossOriginVoid,
} from "@/lib/auth/sameOriginServerAction";

const SITE = "https://crew.example.com";
beforeEach(() => {
  headerMap.clear();
  headersControl.throws = false;
  siteOriginControl.throws = false;
  forbiddenSpy.mockClear();
  logMock.warn.mockClear();
  vi.stubEnv("NEXT_PUBLIC_SITE_ORIGIN", SITE);
});

const EVIL = "https://evil.example.com";

/**
 * The COMPLETE cross-product: 5 `sec-fetch-site` states × 3 `origin` states.
 *
 * Enumerated in full rather than sampled, because a partial table is a hole the
 * shape of the omitted cells. Round 1 of the diff review demonstrated exactly
 * that: an earlier 11-row table omitted four cells, and a mutant that read
 * "when Fetch Metadata is present but the Origin MISMATCHES, allow" passed
 * every committed row while allowing `cross-site` + an attacker Origin — the
 * precise CSRF request this gate exists to refuse.
 *
 * Expectations are written per cell by hand, never derived from the same rule
 * the implementation applies; a table computed from the rule would only prove
 * the rule agrees with itself.
 */
const SFS_STATES = ["same-origin", "none", "same-site", "cross-site", null] as const;
const ORIGIN_STATES = [SITE, EVIL, null] as const;

const cases: Array<[string, Record<string, string>, boolean]> = [
  // sec-fetch-site WINS whenever present. Its verdict is identical across all
  // three origin states, which is what these first twelve rows pin.
  ["same-origin + matching origin", { "sec-fetch-site": "same-origin", origin: SITE }, true],
  ["same-origin + MISMATCHING origin", { "sec-fetch-site": "same-origin", origin: EVIL }, true],
  ["same-origin + no origin", { "sec-fetch-site": "same-origin" }, true],

  ["none + matching origin", { "sec-fetch-site": "none", origin: SITE }, true],
  ["none + MISMATCHING origin", { "sec-fetch-site": "none", origin: EVIL }, true],
  ["none + no origin", { "sec-fetch-site": "none" }, true],

  ["same-site + matching origin", { "sec-fetch-site": "same-site", origin: SITE }, false],
  ["same-site + MISMATCHING origin", { "sec-fetch-site": "same-site", origin: EVIL }, false],
  ["same-site + no origin", { "sec-fetch-site": "same-site" }, false],

  // The filed bypass and its neighbours. `cross-site` is refused on every
  // origin state, including the attacker-supplied one.
  ["cross-site + matching origin", { "sec-fetch-site": "cross-site", origin: SITE }, false],
  ["cross-site + MISMATCHING origin", { "sec-fetch-site": "cross-site", origin: EVIL }, false],
  ["cross-site + no origin (the documented bypass)", { "sec-fetch-site": "cross-site" }, false],

  // The Origin fallback is consulted ONLY when sec-fetch-site is absent.
  ["no sfs + matching origin", { origin: SITE }, true],
  ["no sfs + MISMATCHING origin", { origin: EVIL }, false],
  ["no sfs + no origin (documented limit: framework default preserved)", {}, true],
];

describe("isSameOriginServerAction", () => {
  it("enumerates the COMPLETE sec-fetch-site x origin cross-product", () => {
    // A derived cover, not a hand-counted one: the assertion is against the
    // cross-product itself, so a cell added to either axis fails here until the
    // table grows to match, rather than silently going untested.
    const expectedKeys = new Set(
      SFS_STATES.flatMap((s) => ORIGIN_STATES.map((o) => `${String(s)}|${String(o)}`)),
    );
    const actualKeys = new Set(
      cases.map(([, h]) => `${h["sec-fetch-site"] ?? "null"}|${h["origin"] ?? "null"}`),
    );
    expect(actualKeys).toEqual(expectedKeys);
    expect(cases.length).toBe(expectedKeys.size);
  });

  it.each(cases)("%s", async (_label, hdrs, expected) => {
    // no-premise: the environment IS the fixture. Each row CONSTRUCTS its own
    // header set and the site origin is a stubbed constant, so there is no
    // ambient condition that could leave the assertion unable to reach its
    // boundary — the inputs and the environment are the same thing.
    for (const [k, v] of Object.entries(hdrs)) headerMap.set(k, v);
    expect(await isSameOriginServerAction()).toBe(expected);
  });

  it("rejects an Origin fallback when the site origin is unresolvable (no sfs, blank env)", async () => {
    // resolveSiteOrigin returns { ok: false } for blank/localhost, so the fallback
    // has no trusted constant to compare against and must NOT allow. An
    // implementation that ignored `site.ok` would allow any Origin here.
    // no-premise: the blank env IS the fixture. This case exists to drive
    // `site.ok === false`, which it sets itself; nothing ambient gates it.
    vi.stubEnv("NEXT_PUBLIC_SITE_ORIGIN", "");
    headerMap.set("origin", SITE);
    expect(await isSameOriginServerAction()).toBe(false);
  });

  it("ALLOWS when there is no request scope at all (headers() throws)", async () => {
    // Spec §7 documented limit: a thrown headers() means there is no inbound
    // HTTP request — a direct server-side invocation, a suite calling the
    // action as a function. No browser, so no victim cookies, so no CSRF
    // surface. An attacker cannot induce this state from the network.
    // no-premise: the thrown `headers()` IS the fixture — the case sets the
    // toggle it depends on, so the branch is reached by construction.
    headersControl.throws = true;
    expect(await isSameOriginServerAction()).toBe(true);
  });

  it("PROPAGATES a fault raised outside headers() — the catch is scoped, not a swallow", async () => {
    // The negative sibling of the row above, and the reason it is not
    // sufficient on its own: widening the try to the whole function body would
    // satisfy that row while turning every internal fault into a silent ALLOW.
    headerMap.set("origin", SITE);
    premiseHolds(
      "resolveSiteOrigin is reached only when sec-fetch-site is absent AND origin is present",
      headerMap.get("sec-fetch-site") === undefined && headerMap.get("origin") === SITE,
    );
    siteOriginControl.throws = true;
    await expect(isSameOriginServerAction()).rejects.toThrow(SITE_ORIGIN_FAULT);
  });
});

/**
 * The four designated refusal exports (spec §3.6). The accept-sets in
 * tests/auth/_metaServerActionOriginGate.test.ts resolve a refusal BY NAME
 * against this closed set rather than by analysing whatever function an author
 * put in the return position, so these four bodies are the only place the
 * refusal behaviour is established. Each case asserts the returned value AND
 * the emit: a silent-refusal regression and a dark-refusal regression fail
 * different assertions.
 */
describe("the designated refusal exports", () => {
  const crossSite = (): void => {
    // Derived from the truth table's own reject rows, never an ad-hoc header
    // set: `cross-site` refuses on every origin state, the filed bypass
    // included.
    headerMap.set("sec-fetch-site", "cross-site");
  };

  describe("assertSameOriginServerAction", () => {
    it("emits AND interrupts with forbidden() on a cross-origin request", async () => {
      crossSite();
      premiseHolds(
        "the header set this case installs is one the truth table REJECTS, or the refusal branch is never entered",
        cases.some(
          ([, hdrs, expected]) =>
            expected === false && hdrs["sec-fetch-site"] === headerMap.get("sec-fetch-site"),
        ),
      );
      await expect(assertSameOriginServerAction("x", "y")).rejects.toThrow(FORBIDDEN_INTERRUPT);
      expect(logMock.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          code: "SERVER_ACTION_ORIGIN_REJECTED",
          action: "x",
          source: "y",
        }),
      );
      expect(forbiddenSpy).toHaveBeenCalledTimes(1);
    });

    it("resolves silently on a same-origin request — no emit, no interrupt", async () => {
      headerMap.set("sec-fetch-site", "same-origin");
      premiseHolds(
        "the header set this case installs is one the truth table ALLOWS, or 'no emit' passes for the wrong reason",
        cases.some(
          ([, hdrs, expected]) =>
            expected === true && hdrs["sec-fetch-site"] === headerMap.get("sec-fetch-site"),
        ),
      );
      await expect(assertSameOriginServerAction("x", "y")).resolves.toBeUndefined();
      expect(logMock.warn).not.toHaveBeenCalled();
      expect(forbiddenSpy).not.toHaveBeenCalled();
    });
  });

  it("rejectCrossOriginPicker returns the catalogued picker refusal and emits", () => {
    expect(rejectCrossOriginPicker("a")).toEqual({ ok: false, code: "PICKER_INVALID_INPUT" });
    expect(logMock.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        code: "PICKER_ORIGIN_REJECTED",
        source: "auth.picker.sameOriginGate",
        action: "a",
      }),
    );
  });

  it("rejectCrossOriginNeutral returns the confirm page's own neutral state and emits", () => {
    expect(rejectCrossOriginNeutral("b")).toEqual({ status: "neutral" });
    expect(logMock.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        code: "SERVER_ACTION_ORIGIN_REJECTED",
        action: "b",
      }),
    );
  });

  it("rejectCrossOriginVoid resolves undefined and emits", async () => {
    await expect(rejectCrossOriginVoid("c")).resolves.toBeUndefined();
    expect(logMock.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        code: "PICKER_ORIGIN_REJECTED",
        source: "auth.picker.sameOriginGate",
        action: "c",
      }),
    );
  });
});

/**
 * TWO STRUCTURAL PROPERTIES OF THE GATE MODULE, pinned executably rather than
 * in prose. Both were load-bearing claims that only a comment carried.
 */
describe("gate-module invariants", () => {
  const MODULE_PATH = "lib/auth/sameOriginServerAction.ts";
  const source = readFileSync(MODULE_PATH, "utf8");
  const sf = ts.createSourceFile(MODULE_PATH, source, ts.ScriptTarget.Latest, true);

  it("reads ONLY non-forwardable request signals — the gate is proxy-independent", () => {
    // A DERIVED cover, not a denylist. It collects every header name the module
    // actually reads and asserts the whole SET, so it fails on any new read at
    // all — including a forwardable one nobody thought to ban. `x-forwarded-host`
    // and `host` are rewritten by every proxy in the path, so a gate built on
    // them inherits that proxy's behaviour; `sec-fetch-site` is a forbidden
    // request header page JavaScript cannot set, and `origin` is only ever
    // compared against a build-time constant.
    const read = new Set<string>();
    const visit = (n: ts.Node): void => {
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.name.text === "get"
      ) {
        const arg = n.arguments[0];
        if (arg && ts.isStringLiteral(arg)) read.add(arg.text);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    expect([...read].sort()).toEqual(["origin", "sec-fetch-site"]);
  });

  it("every designated refusal export emits a code-carrying warn — no dark refusal", async () => {
    // Fail-by-default: the export list is DERIVED from the module rather than
    // typed out here, so a fifth refusal export added later is covered the
    // moment it lands. Invariant 10's rule is that no mutation surface is
    // silently dark, and a refusal branch that returns without emitting is
    // exactly that.
    const mod: Record<string, unknown> = await import("@/lib/auth/sameOriginServerAction");
    const refusalExports = Object.keys(mod)
      .filter((name) => name.startsWith("rejectCrossOrigin"))
      .sort();
    premiseHolds(
      "the module exports at least one rejectCrossOrigin* helper, or this assertion ranges over nothing",
      refusalExports.length > 0,
    );

    for (const name of refusalExports) {
      logMock.warn.mockClear();
      const fn = mod[name] as (action: string) => unknown;
      await fn(`probe_${name}`);
      const call = logMock.warn.mock.calls.at(-1);
      expect(call, `${name} emitted nothing — a dark refusal branch`).toBeDefined();
      const fields = call?.[1] as Record<string, unknown> | undefined;
      expect(typeof fields?.code, `${name} emitted no code`).toBe("string");
      expect(String(fields?.code), `${name}'s code is not a durable SHOUTY literal`).toMatch(
        /^[A-Z][A-Z0-9_]+$/,
      );
      expect(fields?.action, `${name} did not attribute the emit to its caller`).toBe(
        `probe_${name}`,
      );
      // No secret rides the emit: the field set is closed to the three the
      // forensic query needs.
      expect(Object.keys(fields ?? {}).sort()).toEqual(["action", "code", "source"]);
    }

    // The throwing member of the set carries the same contract on its own
    // refusal branch, which cannot be reached the same way.
    logMock.warn.mockClear();
    headerMap.set("sec-fetch-site", "cross-site");
    await expect(assertSameOriginServerAction("probe_assert", "probe_source")).rejects.toThrow(
      FORBIDDEN_INTERRUPT,
    );
    const assertFields = logMock.warn.mock.calls.at(-1)?.[1] as Record<string, unknown> | undefined;
    expect(Object.keys(assertFields ?? {}).sort()).toEqual(["action", "code", "source"]);
  });
});
