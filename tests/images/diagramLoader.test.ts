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
import { diagramAssetUrl, hasVariantTier, makeDiagramLoader } from "@/lib/images/diagramLoader";
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

describe("makeDiagramLoader — a ladder row that names the ORIGINAL", () => {
  // A well-formed row can name the original key itself. It survives every §4
  // guard, so it lands in the served ladder and becomes selectable at whatever
  // widths clamp to it — and then the loader serves the very original the zoom
  // gate exists to withhold, while `hasVariantTier` has already promised a
  // caller there was something smaller to retreat to.
  const MIXED = [
    { width: 256, key: `${key}@256.webp` },
    { width: 1024, key },
  ];

  test("the original-naming row is never selected, at any width the loader can be asked", () => {
    premiseHolds(
      "the fixture really does name the original in a row the §4 guards accept",
      MIXED.some((row) => row.key === key) && MIXED.some((row) => row.key !== key),
    );
    // 512 and 1024 clamp UP to the 1024 row; 3840 is above the ladder and takes
    // the largest. All three selected the original before this rule existed.
    for (const width of [64, 256, 300, 512, 1024, 3840]) {
      expect(load(width, { variants: MIXED }), `width ${width}`).not.toBe(ORIGINAL_URL);
    }
  });

  test("every width falls to the one genuinely smaller tier", () => {
    for (const width of [64, 512, 3840]) {
      expect(load(width, { variants: MIXED })).toBe(urlFor(256));
    }
  });

  test("hasVariantTier agrees with what the loader will actually serve", () => {
    // The predicate and the selection are one derivation, so they cannot drift:
    // whenever it answers true, no width resolves to the original.
    expect(hasVariantTier(MIXED, key)).toBe(true);
    // …and a ladder whose ONLY row names the original leaves nothing to serve.
    expect(hasVariantTier([{ width: 256, key }], key)).toBe(false);
    expect(load(512, { variants: [{ width: 256, key }] })).toBe(ORIGINAL_URL);
  });

  test("a row naming the original does not prop up an otherwise-empty ladder", () => {
    // Rejecting the row must not leave a zero-row ladder claiming a tier.
    expect(hasVariantTier([{ width: 256, key }, null, { width: 0, key: "x" }], key)).toBe(false);
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

describe("makeDiagramLoader — unsafe keys are never selected", () => {
  // A key outside the minted shape is REJECTED rather than encoded and emitted.
  // Encoding alone was not enough: the route decodes before matching, and the
  // matched path is then normalized by Storage — `v?x.webp` signs `.../v`. The
  // loader and the route now share one predicate, so a key the route will not
  // authorize can never be the URL the loader picks.
  const HOSTILE = [
    "nested/v.webp",
    "v?x.webp",
    "v#x.webp",
    "a/../b.webp",
    "a%2Fb.webp",
    "v\\x.webp",
    "v\tx.webp",
    "v\nx.webp",
    "..",
    ".",
    "a b.webp",
  ];

  test.each(HOSTILE)("a hostile key %j is skipped in favour of a safe sibling", (key) => {
    const url = load(200, {
      variants: [
        { width: 256, key },
        { width: 512, key: `${key.length}-safe@512.webp` },
      ],
    });

    // Width ordering would otherwise have PREFERRED the hostile 256 row. Compare
    // the emitted SEGMENT, not a substring: a hostile key like "." appears inside
    // every URL as an ordinary character.
    const emittedKey = decodeURIComponent(url.slice(url.lastIndexOf("/") + 1));
    expect(emittedKey).not.toBe(key);
    expect(url).toBe(`/api/asset/diagram/${showId}/${rev}/${key.length}-safe@512.webp`);
  });

  test.each(HOSTILE)("a hostile key %j alone falls back to the original", (key) => {
    expect(load(256, { variants: [{ width: 256, key }] })).toBe(ORIGINAL_URL);
  });

  test("the two keys in the collision reproduction can no longer address each other", () => {
    // `v?x.webp` truncating to `v` was the original defect; now neither is served.
    expect(load(256, { variants: [{ width: 256, key: "v?x.webp" }] })).toBe(ORIGINAL_URL);
    // `v` alone IS a legal object name, and stays servable.
    expect(load(256, { variants: [{ width: 256, key: "v" }] })).toBe(
      `/api/asset/diagram/${showId}/${rev}/v`,
    );
  });

  test("a Slides object id with a colon is legitimate and stays servable", () => {
    // Google Slides object ids permit `:` after the first character, so a key
    // built from one must NOT be rejected — a false negative here 410s a
    // correctly generated variant.
    const key = "embedded-shape:diagram-1.png@512.webp";
    expect(load(512, { variants: [{ width: 512, key }] })).toBe(
      `/api/asset/diagram/${showId}/${rev}/${key}`,
    );
  });

  test("the ordinary @<width>.webp key stays literally readable", () => {
    expect(load(512)).toContain("@512.webp");
  });
});
