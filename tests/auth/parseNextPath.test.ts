import { describe, expect, test } from "vitest";
import { parseNextPath } from "@/app/api/auth/picker-bootstrap/route";

const TOKEN = "a1b2c3d4e5f6789012345678901234567890abcdef0123456789abcdef012345";
const BASE = `/show/sample-show/${TOKEN}`;

/**
 * The grammar pin for SHOW_NEXT_RE, tested DIRECTLY rather than through the route.
 *
 * A route-level test cannot pin this anchor. `validateNextParamDetailed` runs
 * first (`app/api/auth/picker-bootstrap/route.ts:147-151`) and its
 * `ALLOWED_NEXT_RE` (`lib/auth/validateNextParam.ts:18`) is independently
 * `$`-anchored, so it rejects a trailing segment before `parseNextPath` ever
 * executes. Settling mutant, recorded in this task's commit message: delete the
 * `$` from SHOW_NEXT_RE only — the first case below fails while the whole
 * route-level suite stays green.
 */
describe("parseNextPath grammar", () => {
  test("a trailing path segment is rejected (kills the anchor mutant)", () => {
    expect(parseNextPath(`${BASE}/extra`)).toBeNull();
  });

  test("the query is split off, and the token never carries query text", () => {
    expect(parseNextPath(`${BASE}?s=schedule`)).toEqual({
      slug: "sample-show",
      shareToken: TOKEN,
    });
  });

  test("a bare tokenized crew path parses", () => {
    expect(parseNextPath(BASE)).toEqual({ slug: "sample-show", shareToken: TOKEN });
  });

  test("uppercase in the slug is rejected — case grammar is unchanged", () => {
    expect(parseNextPath(`/show/Sample-Show/${TOKEN}`)).toBeNull();
  });

  test("a short token is rejected — length grammar is unchanged", () => {
    expect(parseNextPath(`/show/sample-show/${TOKEN.slice(0, 63)}`)).toBeNull();
  });

  test("an empty query still parses", () => {
    expect(parseNextPath(`${BASE}?`)).toEqual({ slug: "sample-show", shareToken: TOKEN });
  });
});
