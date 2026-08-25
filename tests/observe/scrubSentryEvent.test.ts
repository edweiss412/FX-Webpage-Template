import { describe, expect, test } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/observe/scrubSentryEvent";
import { premiseHolds } from "../_shared/premise";

describe("scrubSentryEvent (finding C12: share-token + email scrubbing)", () => {
  test("replaces the shareToken 3rd path segment in request.url, preserves slug + query", () => {
    const ev = {
      request: {
        url: "https://crew.fxav.app/show/east-coast/AbC123secretToken?s=budget&gate=skip",
      },
    } as ErrorEvent;
    const out = scrubSentryEvent(ev);
    expect(out.request!.url).toBe(
      "https://crew.fxav.app/show/east-coast/[shareToken-redacted]?s=budget&gate=skip",
    );
    expect(out.request!.url).not.toContain("AbC123secretToken");
  });

  test("redacts crew emails in event.message and scrubs token+email in exception values", () => {
    const ev = {
      message: "render failed for jane.crew@example.com",
      exception: { values: [{ value: "Error resolving /show/rpas/TOKENXYZ for bob@fxav.net" }] },
    } as ErrorEvent;
    const out = scrubSentryEvent(ev);
    expect(out.message).toBe("render failed for [email-redacted]");
    expect(out.exception!.values![0]!.value).toBe(
      "Error resolving /show/rpas/[shareToken-redacted] for [email-redacted]",
    );
  });

  test("scrubs transaction names and breadcrumb data URLs", () => {
    const ev = {
      transaction: "GET /show/rpas/LiveTok99",
      breadcrumbs: [{ category: "navigation", data: { url: "/show/rpas/LiveTok99?s=schedule" } }],
    } as unknown as ErrorEvent;
    const out = scrubSentryEvent(ev);
    expect(out.transaction).toBe("GET /show/rpas/[shareToken-redacted]");
    expect((out.breadcrumbs![0]!.data as { url: string }).url).toBe(
      "/show/rpas/[shareToken-redacted]?s=schedule",
    );
  });

  test("returns the same event object (in-place) and no-ops when there is nothing to scrub", () => {
    const ev = { level: "error" } as ErrorEvent;
    expect(scrubSentryEvent(ev)).toBe(ev);
  });
});

describe("the slug survives the scrub as a CAPTURE, not as a `$1` in a replacement string", () => {
  // Every case here states, on its OWN input, that a substitution actually happened before
  // asserting what it produced. Measured while planning this repair: of ten candidate fixtures,
  // TWO were indistinguishable between the correct form and a blind wrap — "no show url here at
  // all" and "/show/only-slug/" — because SHOW_TOKEN_RE simply never matches them, so every
  // variant returns the input unchanged and the case proves nothing. A premise proven on some
  // other case is not a premise for this one.
  const cases: [string, string][] = [
    ["query string", "https://fxav.test/show/demo/tok?s=1"],
    ["fragment", "https://fxav.test/show/demo/tok#frag"],
    ["embedded in prose", "see https://fxav.test/show/demo/tok and then more"],
    ["two urls in one string", "/show/a/tok1 and /show/b/tok2"],
    ["$ inside the slug", "https://fxav.test/show/de$mo/tok"],
  ];

  for (const [label, url] of cases) {
    test(`${label}: the slug is carried through, the token is not`, () => {
      const out = scrubSentryEvent({ request: { url } } as ErrorEvent).request?.url ?? "";
      premiseHolds(`${label}: the scrub actually substituted something`, out !== url);
      expect(out).not.toContain("tok");
      expect(out).not.toContain("$1");
      expect(out).toContain("/show/");
    });
  }
});
