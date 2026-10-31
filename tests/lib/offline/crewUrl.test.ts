import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { premise } from "@/tests/_shared/premise";
import {
  NON_CREW_SEGMENTS,
  classifyRequest,
  crewPath,
  type FetchKind,
  type RequestFacts,
} from "@/lib/offline/crewUrl";

const SHOW_DIR = join(process.cwd(), "app", "show", "[slug]");
const ORIGIN = "https://crew.example";

/** Every static (non-bracketed) directory beside [shareToken], read from disk. */
function staticSiblings(): string[] {
  return readdirSync(SHOW_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("["))
    .map((e) => e.name)
    .sort();
}

function facts(overrides: Partial<RequestFacts> & { path: string }): RequestFacts {
  const { path, ...rest } = overrides;
  return {
    method: "GET",
    mode: "navigate",
    url: `${ORIGIN}${path}`,
    rscHeader: null,
    ...rest,
  };
}

describe("crew URL exclusion is derived from the route tree", () => {
  test("every static sibling of [shareToken] is excluded, and nothing else is", () => {
    const siblings = staticSiblings();
    premise("static siblings under app/show/[slug]/", siblings.length, 0);
    expect([...NON_CREW_SEGMENTS].sort()).toEqual(siblings);
    for (const name of siblings) {
      expect(crewPath(`/show/some-slug/${name}`), name).toBeNull();
      expect(classifyRequest(facts({ path: `/show/some-slug/${name}` }), ORIGIN), name).toBe(
        "ignore",
      );
    }
  });

  test("a token-shaped second segment is a crew URL", () => {
    expect(crewPath("/show/some-slug/0a1b2c")).toBe("/show/some-slug/0a1b2c");
  });
});

describe("crewPath", () => {
  test.each([
    ["/show/s/t?x=1", "/show/s/t"],
    ["/show/s/t?", "/show/s/t"],
    ["/show/s/t#frag", "/show/s/t"],
  ])("drops the query and fragment: %s", (input, expected) => {
    expect(crewPath(input)).toBe(expected);
  });

  test.each([
    ["trailing slash", "/show/s/t/"],
    ["slug only", "/show/s"],
    ["slug only, trailing slash", "/show/s/"],
    ["extra segment", "/show/s/t/x"],
    ["empty slug", "/show//t"],
    ["empty token", "/show/s/"],
    ["wrong root", "/shows/s/t"],
    ["no leading show", "/s/t"],
    ["root", "/"],
    ["empty string", ""],
    ["excluded sibling with query", "/show/s/unpublish?x=1"],
  ])("is not a crew URL: %s", (_name, input) => {
    expect(crewPath(input)).toBeNull();
  });
});

describe("classifyRequest", () => {
  const rows: Array<[string, RequestFacts, FetchKind]> = [
    ["GET navigation to a crew URL", facts({ path: "/show/s/t" }), "crew-nav"],
    ["query string does not change the class", facts({ path: "/show/s/t?utm=1&x=2" }), "crew-nav"],
    [
      "crew URL with a trailing slash is left to Next's 308",
      facts({ path: "/show/s/t/" }),
      "ignore",
    ],
    ["/show/s/unpublish", facts({ path: "/show/s/unpublish" }), "ignore"],
    ["slug-only path", facts({ path: "/show/s" }), "ignore"],
    ["path below the token", facts({ path: "/show/s/t/x" }), "ignore"],
    ["_rsc query on a crew navigation", facts({ path: "/show/s/t?_rsc=abc12" }), "ignore"],
    ["RSC header on a crew navigation", facts({ path: "/show/s/t", rscHeader: "1" }), "ignore"],
    ["_rsc query among other parameters", facts({ path: "/show/s/t?a=1&_rsc=zz" }), "ignore"],
    [
      "RSC header on a bracketed path",
      facts({ path: "/auth/sign-out", method: "POST", rscHeader: "1" }),
      "ignore",
    ],
    [
      "RSC header of 0 does not make an RSC request",
      facts({ path: "/show/s/t", rscHeader: "0" }),
      "crew-nav",
    ],
    ["non-navigation GET to a crew URL", facts({ path: "/show/s/t", mode: "cors" }), "ignore"],
    ["POST navigation to a crew URL", facts({ path: "/show/s/t", method: "POST" }), "ignore"],
    ["GET navigation to /auth/sign-out", facts({ path: "/auth/sign-out" }), "bracket-nav"],
    [
      "POST navigation to /auth/sign-out",
      facts({ path: "/auth/sign-out", method: "POST" }),
      "bracket-nav",
    ],
    [
      "GET navigation to /auth/callback with a code",
      facts({ path: "/auth/callback?code=abc&state=xyz" }),
      "bracket-nav",
    ],
    [
      "POST navigation to /auth/callback",
      facts({ path: "/auth/callback", method: "POST" }),
      "bracket-nav",
    ],
    [
      "non-navigation POST to /auth/sign-out",
      facts({ path: "/auth/sign-out", method: "POST", mode: "cors" }),
      "ignore",
    ],
    [
      "/auth/sign-out with a trailing slash is left to Next's 308",
      facts({ path: "/auth/sign-out/" }),
      "ignore",
    ],
    ["/auth/sign-in", facts({ path: "/auth/sign-in" }), "ignore"],
    [
      "picker bootstrap is not bracketed (navigation)",
      facts({ path: "/api/auth/picker-bootstrap" }),
      "ignore",
    ],
    [
      "picker bootstrap is not bracketed (POST navigation)",
      facts({ path: "/api/auth/picker-bootstrap", method: "POST" }),
      "ignore",
    ],
    [
      "picker bootstrap is not bracketed (subresource fetch)",
      facts({ path: "/api/auth/picker-bootstrap", mode: "cors" }),
      "ignore",
    ],
    [
      "GET /_next/static chunk",
      facts({ path: "/_next/static/chunks/app-1a2b3c.js", mode: "no-cors" }),
      "static",
    ],
    [
      "GET /fonts file",
      facts({ path: "/fonts/InterVariable-latin.d5549562.woff2", mode: "cors" }),
      "static",
    ],
    [
      "POST under /_next/static",
      facts({ path: "/_next/static/chunks/a.js", method: "POST", mode: "cors" }),
      "ignore",
    ],
    [
      "a path that only starts with the fonts prefix text",
      facts({ path: "/fontsx/a.woff2", mode: "cors" }),
      "ignore",
    ],
    [
      "GET diagram asset",
      facts({ path: "/api/asset/diagram/show-1/3/key.png", mode: "no-cors" }),
      "asset",
    ],
    [
      "GET agenda asset",
      facts({ path: "/api/asset/agenda/show-1/doc-1", mode: "no-cors" }),
      "asset",
    ],
    [
      "POST to a diagram asset",
      facts({ path: "/api/asset/diagram/show-1/3/key.png", method: "POST", mode: "cors" }),
      "ignore",
    ],
    [
      "reel assets are not in the worker's scope",
      facts({ path: "/api/asset/reel/show-1", mode: "no-cors" }),
      "ignore",
    ],
    [
      "cross-origin crew URL",
      { ...facts({ path: "/show/s/t" }), url: "https://other.example/show/s/t" },
      "ignore",
    ],
    [
      "cross-origin static asset",
      {
        ...facts({ path: "/", mode: "no-cors" }),
        url: "https://cdn.example/_next/static/a.js",
      },
      "ignore",
    ],
    [
      "same host on a different scheme",
      { ...facts({ path: "/show/s/t" }), url: "http://crew.example/show/s/t" },
      "ignore",
    ],
    ["an unparseable URL", { ...facts({ path: "/" }), url: "not a url" }, "ignore"],
    [
      "non-navigation POST (Server Action) on a crew page",
      facts({ path: "/show/s/t", method: "POST", mode: "cors" }),
      "ignore",
    ],
    ["/admin", facts({ path: "/admin" }), "ignore"],
    ["POST /api/report", facts({ path: "/api/report", method: "POST", mode: "cors" }), "ignore"],
    ["the site root", facts({ path: "/" }), "ignore"],
  ];

  test.each(rows)("%s", (_name, input, expected) => {
    expect(classifyRequest(input, ORIGIN)).toBe(expected);
  });
});
