import { describe, expect, test } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/observe/scrubSentryEvent";

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
    } as ErrorEvent;
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
