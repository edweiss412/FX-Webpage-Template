// tests/images/diagramLoader.test.ts
//
// The next/image loader for private diagram assets (spec §6).
//
// Failure modes these rows catch: falling through to the ORIGINAL above the
// ladder (the waste this pipeline exists to remove — with sizes="100vw" Next
// asks for widths up to 3840, so an above-max→original rule would serve a 3x
// phone the original), serving a clamped variant to the zoomable active slide,
// trusting a malformed manifest row, and constructing variant keys client-side
// instead of passing manifest data through.

import { describe, expect, test } from "vitest";
import { diagramAssetUrl, makeDiagramLoader } from "@/lib/images/diagramLoader";
import { diagramAssetKeyFromPath } from "@/lib/data/diagrams";
import { premise, premiseHolds } from "@/tests/_shared/premise";

const showId = "11111111-1111-4111-8111-111111111111";
const rev = "22222222-2222-4222-8222-222222222222";
const key = "embedded-obj-1.png";

const LADDER = [256, 512, 1024] as const;
const variants = LADDER.map((width) => ({ width, key: `${key}@${width}.webp` }));

const ORIGINAL_URL = `/api/asset/diagram/${showId}/${rev}/${key}`;

function load(width: number, overrides: Partial<Parameters<typeof makeDiagramLoader>[0]> = {}) {
  const loader = makeDiagramLoader({ showId, rev, key, variants, ...overrides });
  return loader({ src: key, width, quality: 75 });
}

function urlFor(variantWidth: number): string {
  return `/api/asset/diagram/${showId}/${rev}/${key}@${variantWidth}.webp`;
}

describe("makeDiagramLoader — clamping", () => {
  test("an exact tier request returns that tier", () => {
    for (const width of LADDER) {
      expect(load(width)).toBe(urlFor(width));
    }
  });

  test("a between-tier request snaps UP to the smallest tier that covers it", () => {
    premiseHolds("the probe widths fall strictly between ladder tiers", 300 > 256 && 300 < 512);
    expect(load(300)).toBe(urlFor(512));
    expect(load(513)).toBe(urlFor(1024));
  });

  test("a request below the smallest tier still gets the smallest tier", () => {
    premiseHolds("the probe width is below the smallest tier", 64 < LADDER[0]);
    expect(load(64)).toBe(urlFor(256));
  });

  test("a request ABOVE the ladder returns the LARGEST variant, never the original", () => {
    const largest = Math.max(...LADDER);
    // Without this premise the row would prove nothing: an in-ladder width is
    // answered by ordinary snapping, and the above-ladder rule never runs.
    premise("the probe width exceeds the largest ladder tier", 3840, largest);

    expect(load(3840)).toBe(urlFor(largest));
    expect(load(1080)).toBe(urlFor(largest));
    expect(load(3840)).not.toBe(ORIGINAL_URL);
  });
});

describe("makeDiagramLoader — original tier", () => {
  test("pinOriginal returns the original at EVERY width, including below-ladder", () => {
    for (const width of [16, 256, 512, 1024, 3840]) {
      expect(load(width, { pinOriginal: true })).toBe(ORIGINAL_URL);
    }
  });

  test("absent, empty, and non-array variants all fall back to the original", () => {
    for (const value of [undefined, [], null, "not-an-array", { width: 512, key: "x" }, 42]) {
      expect(load(512, { variants: value })).toBe(ORIGINAL_URL);
    }
  });

  test("a variants array whose every row is malformed falls back to the original", () => {
    expect(load(512, { variants: [null, "nope", { width: 0, key: "a" }] })).toBe(ORIGINAL_URL);
  });
});

describe("makeDiagramLoader — §4 guards, row by row", () => {
  // Each row pairs ONE malformed entry with one valid entry, so a loader that
  // threw, or that discarded the whole field on a single bad row, both fail.
  const MALFORMED: Array<[string, unknown]> = [
    ["null", null],
    ["a non-object", "nope"],
    ["a missing width", { key: `${key}@512.webp` }],
    ["a NaN width", { width: Number.NaN, key: `${key}@512.webp` }],
    ["an Infinity width", { width: Number.POSITIVE_INFINITY, key: `${key}@512.webp` }],
    ["a zero width", { width: 0, key: `${key}@512.webp` }],
    ["a negative width", { width: -512, key: `${key}@512.webp` }],
    ["a non-numeric width", { width: "512", key: `${key}@512.webp` }],
    ["an empty-string key", { width: 512, key: "" }],
    ["a non-string key", { width: 512, key: 512 }],
    ["a missing key", { width: 512 }],
  ];

  test.each(MALFORMED)("%s row is skipped, the valid sibling still serves", (_label, row) => {
    const url = load(200, { variants: [row, { width: 256, key: `${key}@256.webp` }] });

    expect(url).toBe(urlFor(256));
  });
});

describe("makeDiagramLoader — URL construction", () => {
  test("the original URL round-trips the key derived from a snapshotPath", () => {
    const snapshotPath = `diagram-snapshots/shows/${showId}/${rev}/${key}`;
    const derived = diagramAssetKeyFromPath(snapshotPath, "fallback");

    premiseHolds("the derived key is the last path segment, not the whole path", derived === key);
    expect(diagramAssetUrl(showId, rev, derived)).toBe(ORIGINAL_URL);
    expect(load(4000, { pinOriginal: true })).toBe(diagramAssetUrl(showId, rev, derived));
  });

  test("variant URLs use the manifest key verbatim — the client never builds one", () => {
    // A manifest whose key does not follow the @<width>.webp convention still
    // resolves: keys are data, not a recognizer.
    const odd = [{ width: 512, key: "totally-unconventional-name" }];

    expect(load(512, { variants: odd })).toBe(
      `/api/asset/diagram/${showId}/${rev}/totally-unconventional-name`,
    );
  });

  test("the quality argument is ignored — encoding is fixed at ingest", () => {
    const loader = makeDiagramLoader({ showId, rev, key, variants });

    expect(loader({ src: key, width: 512, quality: 10 })).toBe(
      loader({ src: key, width: 512, quality: 100 }),
    );
  });
});

describe("makeDiagramLoader — key encoding", () => {
  // A manifest key becomes ONE URL path segment. Unencoded, a key containing a
  // path or query delimiter is reinterpreted by URL parsing and route matching —
  // and the dangerous case is not the 404: `v?x.webp` truncates to `v`, which can
  // silently select and sign a DIFFERENT listed object.
  const HOSTILE: Array<[string, string]> = [
    ["a slash", "nested/v.webp"],
    ["a query delimiter", "v?x.webp"],
    ["a fragment delimiter", "v#x.webp"],
    ["a traversal pair", "a/../b.webp"],
    ["a percent escape", "a%2Fb.webp"],
    ["a backslash", "v\\x.webp"],
    ["a tab", "v\tx.webp"],
    ["a newline", "v\nx.webp"],
    ["a bare dot-dot", ".."],
  ];

  test.each(HOSTILE)("%s survives as ONE segment that decodes back to the key", (_label, key) => {
    const url = makeDiagramLoader({
      showId,
      rev,
      key: "orig.png",
      variants: [{ width: 256, key }],
    })({ src: "orig.png", width: 256 });

    const segments = url.split("/");
    premiseHolds("the URL kept its fixed prefix shape", segments.length === 7);
    const last = segments[6]!;
    // Exactly one segment, and it means exactly the key the manifest listed.
    expect(decodeURIComponent(last)).toBe(key);
    expect(last).not.toContain("/");
    expect(last).not.toContain("?");
    expect(last).not.toContain("#");
  });

  test("two keys that differ only past a delimiter cannot collide", () => {
    // The reviewer's reproduction: requesting `v?x.webp` selected and signed `v`.
    const collide = makeDiagramLoader({
      showId,
      rev,
      key: "orig.png",
      variants: [{ width: 256, key: "v?x.webp" }],
    })({ src: "orig.png", width: 256 });
    const plain = makeDiagramLoader({
      showId,
      rev,
      key: "orig.png",
      variants: [{ width: 256, key: "v" }],
    })({ src: "orig.png", width: 256 });

    expect(collide).not.toBe(plain);
  });

  test("the ordinary @<width>.webp key stays literally readable", () => {
    // `@` is legal in a path segment; encoding it would churn every URL, the e2e
    // network gate, and anything an operator greps for.
    expect(load(512)).toContain("@512.webp");
  });
});
