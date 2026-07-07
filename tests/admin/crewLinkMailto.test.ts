/**
 * tests/admin/crewLinkMailto.test.ts
 *
 * Pins the mailto builder contract (spec 2026-07-07-flow5-rotate-disclosure-mailto §2.2):
 * shape filter (adversarial R5), dedupe, BCC encoding, deterministic chunking under
 * MAX_MAILTO_HREF_CHARS (R1), unconditional cap via title ladder (R4), [] floor.
 * Failure modes caught: corrupted/injected recipients, silent recipient drops,
 * over-cap hrefs from unbounded titles, affordance rendered with zero recipients.
 */
import { describe, expect, test } from "vitest";

import {
  buildCrewLinkMailtos,
  MAILTO_TITLE_MAX_CHARS,
  MAX_MAILTO_HREF_CHARS,
} from "@/app/admin/show/[slug]/crewLinkMailto";

const URL = "https://crew.fxav.show/show/sample-show/" + "a".repeat(64);
const TITLE = "RPAS Central";

function bccOf(href: string): string {
  const m = href.match(/^mailto:\?bcc=([^&]*)&/);
  expect(m, `href missing bcc: ${href.slice(0, 80)}`).not.toBeNull();
  return m![1]!;
}
function recipientsOf(href: string): string[] {
  return bccOf(href).split(",").map(decodeURIComponent);
}

describe("buildCrewLinkMailtos — filter + dedupe (R5 shape validator)", () => {
  test("empty input → []", () => {
    expect(buildCrewLinkMailtos({ emails: [], url: URL, showTitle: TITLE })).toEqual([]);
  });

  test("all-invalid input → []", () => {
    expect(
      buildCrewLinkMailtos({ emails: ["", "   ", "no-at-sign.com"], url: URL, showTitle: TITLE }),
    ).toEqual([]);
  });

  test.each([
    ["space", "a b@example.com"],
    ["comma", "a,b@example.com"],
    ["CR", "a\rb@example.com"],
    ["LF", "a\nb@example.com"],
    ["question mark", "a?b@example.com"],
    ["ampersand", "a&b@example.com"],
    ["double quote", 'a"b@example.com'],
    ["angle bracket", "a<b@example.com"],
    ["no TLD", "a@localhost"],
    ["over 254 chars", `${"a".repeat(250)}@example.com`],
  ])("rejects %s", (_label, bad) => {
    const out = buildCrewLinkMailtos({
      emails: [bad, "good@example.com"],
      url: URL,
      showTitle: TITLE,
    });
    expect(out).toHaveLength(1);
    expect(recipientsOf(out[0]!.href)).toEqual(["good@example.com"]);
  });

  test("local-part % survives the filter and appears only as %25 in the href", () => {
    const out = buildCrewLinkMailtos({
      emails: ["oc%to@example.com"],
      url: URL,
      showTitle: TITLE,
    });
    expect(out).toHaveLength(1);
    expect(bccOf(out[0]!.href)).toBe("oc%25to%40example.com");
  });

  test("dedupes exact duplicates preserving first-seen order", () => {
    const out = buildCrewLinkMailtos({
      emails: ["b@example.com", "a@example.com", "b@example.com"],
      url: URL,
      showTitle: TITLE,
    });
    expect(recipientsOf(out[0]!.href)).toEqual(["b@example.com", "a@example.com"]);
  });
});

describe("buildCrewLinkMailtos — subject/body encoding", () => {
  test("non-blank title in subject and body; body carries the raw URL exactly once", () => {
    const out = buildCrewLinkMailtos({
      emails: ["a@example.com"],
      url: URL,
      showTitle: TITLE,
    });
    const href = out[0]!.href;
    const subject = decodeURIComponent(href.match(/&subject=([^&]*)/)![1]!);
    const body = decodeURIComponent(href.match(/&body=([^&]*)$/)![1]!);
    expect(subject).toBe(`Crew link — ${TITLE}`);
    expect(body).toBe(
      `Here's the link to your crew page for ${TITLE}:\n\n${URL}\n\nOpen it and pick your name to see your schedule.`,
    );
    expect(body.split(URL)).toHaveLength(2);
  });

  test("blank title → fallback subject, body drops the 'for' fragment", () => {
    const out = buildCrewLinkMailtos({ emails: ["a@example.com"], url: URL, showTitle: "  " });
    const href = out[0]!.href;
    const subject = decodeURIComponent(href.match(/&subject=([^&]*)/)![1]!);
    const body = decodeURIComponent(href.match(/&body=([^&]*)$/)![1]!);
    expect(subject).toBe("Crew link");
    expect(body.startsWith("Here's the link to your crew page:\n\n")).toBe(true);
  });
});

describe("buildCrewLinkMailtos — chunking (R1) and title budget (R4)", () => {
  // Long-but-valid addresses derived so batch boundaries come from the exported
  // constant, never a hardcoded magic count (anti-tautology rule).
  const longAddress = (i: number) => `${"a".repeat(60)}${String(i).padStart(4, "0")}@example.com`;
  const bigRoster = Array.from({ length: 60 }, (_, i) => longAddress(i));

  test("typical roster (40 × ~25 chars) yields exactly one batch", () => {
    const roster = Array.from({ length: 40 }, (_, i) => `crew${String(i).padStart(3, "0")}@example.com`);
    const out = buildCrewLinkMailtos({ emails: roster, url: URL, showTitle: TITLE });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ batch: 1, batchCount: 1 });
    expect(recipientsOf(out[0]!.href)).toEqual(roster);
  });

  test("threshold-crossing roster: >1 batch, every href ≤ cap, every recipient in exactly one batch, consistent batch/batchCount", () => {
    const out = buildCrewLinkMailtos({ emails: bigRoster, url: URL, showTitle: TITLE });
    expect(out.length).toBeGreaterThan(1);
    const seen: string[] = [];
    out.forEach((m, i) => {
      expect(m.href.length).toBeLessThanOrEqual(MAX_MAILTO_HREF_CHARS);
      expect(m.batch).toBe(i + 1);
      expect(m.batchCount).toBe(out.length);
      seen.push(...recipientsOf(m.href));
    });
    expect(seen).toEqual(bigRoster); // complete, in order, no dupes across batches
  });

  test("overlong title is truncated with … in subject AND body; hrefs stay ≤ cap; zero recipients dropped", () => {
    const hugeTitle = "T".repeat(MAILTO_TITLE_MAX_CHARS * 4);
    const out = buildCrewLinkMailtos({ emails: bigRoster, url: URL, showTitle: hugeTitle });
    expect(out.length).toBeGreaterThan(0);
    const truncated = `${"T".repeat(MAILTO_TITLE_MAX_CHARS)}…`;
    const collected: string[] = [];
    for (const m of out) {
      expect(m.href.length).toBeLessThanOrEqual(MAX_MAILTO_HREF_CHARS);
      const subject = decodeURIComponent(m.href.match(/&subject=([^&]*)/)![1]!);
      const body = decodeURIComponent(m.href.match(/&body=([^&]*)$/)![1]!);
      expect(subject).toBe(`Crew link — ${truncated}`);
      expect(body).toContain(` for ${truncated}:`);
      collected.push(...recipientsOf(m.href));
    }
    expect(collected).toEqual(bigRoster);
  });

  test("non-BMP code point AT the truncation boundary: no throw, code-point-safe cut, hrefs ≤ cap (plan R1)", () => {
    // The 80th code point is an emoji (2 code units). A code-UNIT slice(0, 80)
    // would cut the surrogate pair in half and crash encodeURIComponent; a
    // code-POINT slice keeps it whole. Mostly-ASCII so the truncated-title rung
    // stays under the cap and the truncation itself is observable.
    const mixedTitle = `${"T".repeat(MAILTO_TITLE_MAX_CHARS - 1)}😀${"T".repeat(40)}`;
    const out = buildCrewLinkMailtos({ emails: ["a@example.com"], url: URL, showTitle: mixedTitle });
    expect(out).toHaveLength(1);
    expect(out[0]!.href.length).toBeLessThanOrEqual(MAX_MAILTO_HREF_CHARS);
    const subject = decodeURIComponent(out[0]!.href.match(/&subject=([^&]*)/)![1]!);
    expect(subject).toBe(`Crew link — ${"T".repeat(MAILTO_TITLE_MAX_CHARS - 1)}😀…`);
  });

  // Plan adversarial R2 — the MIDDLE ladder rung: truncated title still blows the
  // cap (80 emoji encode to ~12 chars each, ~2000 chars across subject+body), but
  // the blank-title rebuild fits. An implementation that skips the blank rung and
  // returns [] must fail here.
  test("blank-title fallback rung: heavy truncated title exceeds cap, blank title succeeds with all recipients", () => {
    const heavyTitle = "😀".repeat(MAILTO_TITLE_MAX_CHARS + 20);
    const roster = ["a@example.com", "b@example.com", "c@example.com"];
    const out = buildCrewLinkMailtos({ emails: roster, url: URL, showTitle: heavyTitle });
    expect(out.length).toBeGreaterThan(0);
    const collected: string[] = [];
    for (const m of out) {
      expect(m.href.length).toBeLessThanOrEqual(MAX_MAILTO_HREF_CHARS);
      const subject = decodeURIComponent(m.href.match(/&subject=([^&]*)/)![1]!);
      const body = decodeURIComponent(m.href.match(/&body=([^&]*)$/)![1]!);
      expect(subject).toBe("Crew link");
      expect(body.startsWith("Here's the link to your crew page:\n\n")).toBe(true);
      collected.push(...recipientsOf(m.href));
    }
    expect(collected).toEqual(roster);
  });

  test("lone-surrogate title input: no URIError, surrogate replaced with U+FFFD (plan R1)", () => {
    const out = buildCrewLinkMailtos({
      emails: ["a@example.com"],
      url: URL,
      showTitle: "bad\uD800title",
    });
    expect(out).toHaveLength(1);
    const subject = decodeURIComponent(out[0]!.href.match(/&subject=([^&]*)/)![1]!);
    expect(subject).toBe("Crew link — bad\uFFFDtitle");
  });

  test("pathological url that cannot fit one blank-title recipient under the cap → []", () => {
    const monsterUrl = `https://crew.fxav.show/show/x/${"a".repeat(MAX_MAILTO_HREF_CHARS)}`;
    const out = buildCrewLinkMailtos({
      emails: ["a@example.com"],
      url: monsterUrl,
      showTitle: TITLE,
    });
    expect(out).toEqual([]);
  });
});
