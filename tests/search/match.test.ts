import { describe, expect, it } from "vitest";
import type { SectionId } from "@/lib/crew/resolveActiveSection";
import { damerauLevenshtein } from "@/lib/parser/fuzzyMatch";
import { prepareIndex, searchIndex } from "@/lib/search/match";
import type { SearchEntry, SearchHit, SearchResult } from "@/lib/search/types";
import { buildEntries, entryWhere, FIXTURE_INDEX } from "./_fixtureIndex";

const fixture = prepareIndex(FIXTURE_INDEX);

function hits(result: SearchResult): SearchHit[] {
  return result.sections.flatMap((s) => s.rows);
}
function ids(result: SearchResult): string[] {
  return hits(result).map((h) => h.entry.id);
}
function topId(result: SearchResult): string | undefined {
  return result.sections[0]?.rows[0]?.entry.id;
}
function hitFor(result: SearchResult, entry: SearchEntry): SearchHit | undefined {
  return hits(result).find((h) => h.entry.id === entry.id);
}

type Line = {
  section?: SectionId;
  group?: string;
  label?: string | null;
  value: string;
  context?: readonly string[];
};
/** A small ad-hoc index for rules the show-shaped fixture cannot isolate. */
function adHoc(...lines: Line[]) {
  const index = {
    entries: buildEntries(
      lines.map((l) => ({
        section: l.section ?? "venue",
        region: "test",
        group: l.group ?? "Notes",
        label: l.label ?? null,
        value: l.value,
        ...(l.context ? { context: l.context } : {}),
      })),
    ),
  };
  return { index, prepared: prepareIndex(index) };
}
const EMPTY: SearchResult = { total: 0, sections: [] };

describe("stop words (spec §5.2)", () => {
  it("drops stop words from the query", () => {
    expect(searchIndex(fixture, "where is the dock")).toEqual(searchIndex(fixture, "dock"));
  });

  it("keeps the tokens when every token is a stop word", () => {
    const { index, prepared } = adHoc({ value: "The Who" }, { value: "Front door" });
    expect(ids(searchIndex(prepared, "the who"))).toEqual([index.entries[0]!.id]);
    // The same entry is not a hit once a real word sits beside the stop words.
    expect(searchIndex(prepared, "where is the door").total).toBe(1);
    expect(ids(searchIndex(prepared, "where is the door"))).toEqual([index.entries[1]!.id]);
  });
});

describe("2-character floor (spec §5.2)", () => {
  it.each(["", " ", "a", " - ", "é", "B."])("runs no match for %j", (query) => {
    expect(searchIndex(fixture, query)).toEqual(EMPTY);
  });

  it("runs a match at 2 normalized characters", () => {
    const { prepared } = adHoc({ value: "PO" });
    expect(searchIndex(prepared, "po").total).toBe(1);
  });
});

describe("AND across query tokens (spec §5.2)", () => {
  it("requires every token to match somewhere in the entry", () => {
    expect(searchIndex(fixture, "wifi").total).toBeGreaterThan(0);
    expect(searchIndex(fixture, "dock").total).toBeGreaterThan(0);
    expect(searchIndex(fixture, "wifi dock")).toEqual(EMPTY);
  });

  it("lets different tokens match different fields", () => {
    const video = entryWhere({ group: "Video", label: "Grand Ballroom" });
    expect(ids(searchIndex(fixture, "ballroom video"))).toEqual([video.id]);
  });
});

describe("match kinds and weights (spec §5.3)", () => {
  const score = (value: string, query: string) => {
    const { prepared } = adHoc({ value });
    return hits(searchIndex(prepared, query))[0]?.score ?? null;
  };

  it("exact weighs 1.0", () => {
    expect(score("dock", "dock")).toBeCloseTo(1.0);
  });
  it("prefix weighs 0.8", () => {
    expect(score("loading", "lo")).toBeCloseTo(0.8);
  });
  it("alias weighs 0.7", () => {
    expect(score("freight", "dock")).toBeCloseTo(0.7);
  });
  it("fuzzy weighs 0.5", () => {
    expect(score("dock", "dcok")).toBeCloseTo(0.5);
  });
  it("takes the first kind that applies, not a sum of kinds or of repeats", () => {
    // "dock" is exact here AND an alias of "loading dock"; exact wins alone.
    expect(score("loading dock", "dock")).toBeCloseTo(1.0);
    expect(score("dock dock", "dock")).toBeCloseTo(1.0);
  });
  it("sums the best match of each query token", () => {
    expect(score("loading dock", "dock lo")).toBeCloseTo(1.8);
  });

  it("matches a 1-character token by exact only", () => {
    const { index, prepared } = adHoc({ value: "Ballroom A" }, { value: "Ballroom B" });
    expect(ids(searchIndex(prepared, "ballroom b"))).toEqual([index.entries[1]!.id]);
    // No prefix for one character: "b" does not reach "ballroom".
    expect(score("Ballroom", "ballroom b")).toBeNull();
  });

  it("matches an alias token by exact equality only", () => {
    // "Internet" gains the alias token "wifi"; a typo of it is not an alias hit.
    const hardline = entryWhere({ value: "Internet hardline at front of house" });
    expect(hitFor(searchIndex(fixture, "wifi"), hardline)).toBeDefined();
    expect(hitFor(searchIndex(fixture, "wfii"), hardline)).toBeUndefined();
    expect(hitFor(searchIndex(fixture, "wif"), hardline)).toBeUndefined();
  });
});

describe("fuzzy length thresholds (spec §5.3)", () => {
  // Each case states its own premise: the edit distance it relies on.
  it.each([
    // [query, entry token, distance, matches]
    ["dck", "dock", 1, false], // length 3: never fuzzy
    ["dcok", "dock", 1, true], // length 4: distance 1
    ["dxxk", "dock", 2, false], // length 4: not distance 2
    ["loadign", "loading", 1, true], // length 7: distance 1
    ["laodign", "loading", 2, false], // length 7: not distance 2
    ["lavailer", "lavalier", 1, true], // length 8: distance 1
    ["lavailre", "lavalier", 2, true], // length 8: distance 2
    ["lvaailre", "lavalier", 3, false], // length 8: not distance 3
  ] as const)("%s vs %s (distance %i) matches: %s", (query, token, distance, matches) => {
    expect(damerauLevenshtein(query, token)).toBe(distance);
    expect(token.startsWith(query)).toBe(false);
    const { prepared } = adHoc({ value: token });
    const result = searchIndex(prepared, query);
    expect(result.total).toBe(matches ? 1 : 0);
    if (matches) expect(hits(result)[0]!.score).toBeCloseTo(0.5);
  });
});

describe("alias expansion (spec §5.4)", () => {
  const hardline = entryWhere({ value: "Internet hardline at front of house" });

  it("reaches a word through its group and quotes the display span", () => {
    const hit = hitFor(searchIndex(fixture, "wifi"), hardline);
    expect(hit?.aliasNote).toBe("Internet");
    expect(hit?.score).toBeCloseTo(0.7);
  });

  it("expands a phrase member only when its tokens are consecutive", () => {
    const hit = hitFor(searchIndex(fixture, "foh"), hardline);
    expect(hit?.aliasNote).toBe("front of house");
    const { prepared } = adHoc({ value: "front porch of the house" });
    expect(searchIndex(prepared, "foh")).toEqual(EMPTY);
  });

  it("adds every OTHER member's tokens, including a phrase member's", () => {
    const { prepared } = adHoc({ value: "Freight elevator to the ballroom" });
    const hit = hits(searchIndex(prepared, "loading dock"))[0];
    expect(hit?.score).toBeCloseTo(1.4);
    expect(hit?.aliasNote).toBe("Freight");
  });

  it("expands from any field, quoting the field the span came from", () => {
    const { prepared } = adHoc({ group: "Notes", label: "Internet", value: "Cat6 at the desk" });
    expect(hits(searchIndex(prepared, "wifi"))[0]?.aliasNote).toBe("Internet");
  });

  it("names the earliest alias source when several apply", () => {
    const { prepared } = adHoc({ value: "Network drop and internet hardline" });
    // Both "Network" and "internet" are Wi-Fi members; "ssid" reaches either.
    expect(hits(searchIndex(prepared, "ssid"))[0]?.aliasNote).toBe("Network");
  });
});

describe("aliasNote (spec §5.6)", () => {
  it("is null when the token matched a displayed field exactly", () => {
    const network = entryWhere({ label: "Wi-Fi network" });
    expect(hitFor(searchIndex(fixture, "wifi"), network)?.aliasNote).toBeNull();
  });

  it("is null when any other query token matched a displayed field", () => {
    const hardline = entryWhere({ value: "Internet hardline at front of house" });
    const hit = hitFor(searchIndex(fixture, "hardline wifi"), hardline);
    expect(hit).toBeDefined();
    expect(hit?.aliasNote).toBeNull();
  });

  it("is null when the other token matched by prefix or fuzzily", () => {
    const { prepared } = adHoc({ value: "Internet hardline" });
    expect(hits(searchIndex(prepared, "wifi hard"))[0]?.aliasNote).toBeNull();
    expect(hits(searchIndex(prepared, "wifi hardlnie"))[0]?.aliasNote).toBeNull();
  });

  it("is set when the only other match is in context", () => {
    const { prepared } = adHoc({ value: "Internet hardline", context: ["Tuesday"] });
    const hit = hits(searchIndex(prepared, "tuesday wifi"))[0];
    expect(hit?.aliasNote).toBe("Internet");
  });

  it("is null when the word itself sits in context: an entry gains OTHER members only", () => {
    // "internet" in context is an exact context match, not an alias match.
    const { prepared } = adHoc({ value: "Hardline", context: ["Internet"] });
    const hit = hits(searchIndex(prepared, "internet"))[0];
    expect(hit?.score).toBeCloseTo(0.6);
    expect(hit?.aliasNote).toBeNull();
  });

  it("is null for a hit with no alias match at all", () => {
    const { prepared } = adHoc({ value: "Hardline", context: ["Tuesday"] });
    expect(hits(searchIndex(prepared, "tuesday"))[0]?.aliasNote).toBeNull();
  });
});

describe("field weights (spec §5.5)", () => {
  it("weighs group and context at 0.6, so they sort below label and value", () => {
    const { index, prepared } = adHoc(
      { group: "Dock", value: "North entrance" },
      { group: "Notes", value: "North", context: ["Dock"] },
      { group: "Notes", label: "Dock", value: "North" },
      { group: "Notes", value: "Dock north" },
    );
    const [inGroup, inContext, inLabel, inValue] = index.entries;
    const rows = hits(searchIndex(prepared, "dock"));
    expect(rows.map((h) => h.entry.id)).toEqual([
      inLabel!.id,
      inValue!.id,
      inGroup!.id,
      inContext!.id,
    ]);
    expect(rows.map((h) => Number(h.score.toFixed(2)))).toEqual([1, 1, 0.6, 0.6]);
  });
});

describe("repeat removal (spec §5.5)", () => {
  it("drops a Today hit whose twin in another section is also a hit", () => {
    const venueAddress = entryWhere({ section: "venue", label: "Address" });
    const result = searchIndex(fixture, "michigan");
    expect(ids(result)).toEqual([venueAddress.id]);
    expect(result.total).toBe(1);
    expect(result.sections.map((s) => s.section)).toEqual(["venue"]);
  });

  it("drops the Today Crew call twin of the Schedule day line", () => {
    const scheduleCall = entryWhere({ section: "schedule", label: "Crew call" });
    expect(ids(searchIndex(fixture, "crew call"))).toEqual([scheduleCall.id]);
  });

  it("keeps a Today line with no twin elsewhere", () => {
    const roomNote = entryWhere({ section: "today", label: "Salon A" });
    const result = searchIndex(fixture, "door sticks");
    expect(ids(result)).toEqual([roomNote.id]);
    expect(result.sections.map((s) => s.section)).toEqual(["today"]);
  });

  it("keeps the Today line when its twin is not a hit for this query", () => {
    const { index, prepared } = adHoc(
      { section: "today", group: "Tonight", label: "Hotel", value: "Hyatt" },
      { section: "travel", group: "Hotels", label: "Hotel", value: "Hyatt" },
    );
    const [today, travel] = index.entries;
    expect(ids(searchIndex(prepared, "tonight"))).toEqual([today!.id]);
    expect(ids(searchIndex(prepared, "hyatt"))).toEqual([travel!.id]);
  });

  it("compares after trimming and collapsing whitespace only", () => {
    const { index, prepared } = adHoc(
      { section: "today", label: " Doug  Larson ", value: "Producer\n" },
      { section: "crew", label: "Doug Larson", value: "Producer" },
    );
    expect(ids(searchIndex(prepared, "producer"))).toEqual([index.entries[1]!.id]);
  });

  it.each([
    ["case", "doug larson", "Producer"],
    ["punctuation", "Doug Larson", "Producer."],
    ["a missing label", null, "Producer"],
  ] as const)("keeps both lines when they differ in %s", (_what, label, value) => {
    const { prepared } = adHoc(
      { section: "today", label, value },
      { section: "crew", label: "Doug Larson", value: "Producer" },
    );
    const result = searchIndex(prepared, "producer");
    expect(result.total).toBe(2);
    expect(result.sections.map((s) => s.section)).toEqual(["today", "crew"]);
  });

  it("never drops a Today line because of another Today line", () => {
    const { prepared } = adHoc(
      { section: "today", group: "Tonight", value: "Hyatt" },
      { section: "today", group: "Where", value: "Hyatt" },
    );
    expect(searchIndex(prepared, "hyatt").total).toBe(2);
  });

  it("never drops a line outside Today", () => {
    const tbd = searchIndex(fixture, "tbd");
    expect(ids(tbd)).toEqual([
      entryWhere({ group: "Lighting", label: "Salon A" }).id,
      entryWhere({ group: "Lighting", label: "Salon B" }).id,
    ]);
  });
});

describe("order (spec §5.5)", () => {
  it("sorts rows by score and keeps render order on ties", () => {
    const { index, prepared } = adHoc(
      { value: "Dock door B" },
      { value: "Rear dock", context: ["Stage door"] },
      { label: "Dock", value: "Dock door A" },
    );
    const [b, rear, a] = index.entries;
    // a matches "dock" in its label AND its value: still 1.0 for that token, so
    // the three tie and keep render order.
    expect(ids(searchIndex(prepared, "dock"))).toEqual([b!.id, rear!.id, a!.id]);
    // The rear dock finds "door" only in context (1.6): it drops below a (2.0)
    // although it renders first.
    expect(ids(searchIndex(prepared, "dock door"))).toEqual([b!.id, a!.id, rear!.id]);
  });

  it("sorts sections by their best row, ties in section order", () => {
    // venue and gear tie at 2.0 and keep section order; schedule matches only
    // through context (1.2) and sorts after both despite coming first.
    const result = searchIndex(fixture, "grand ballroom");
    expect(result.sections.map((s) => s.section)).toEqual(["venue", "gear", "schedule"]);
    const best = result.sections.map((s) => Number(s.rows[0]!.score.toFixed(2)));
    expect(best).toEqual([2, 2, 1.2]);
  });

  it("uses [...BASE_SECTION_IDS, budget] for ties, budget last", () => {
    const { prepared } = adHoc(
      { section: "budget", value: "Dock fee" },
      { section: "gear", value: "Dock cart" },
      { section: "today", value: "Dock open" },
      { section: "travel", value: "Dock pickup" },
    );
    const sections = searchIndex(prepared, "dock").sections.map((s) => s.section);
    expect(sections).toEqual(["today", "travel", "gear", "budget"]);
  });

  it("counts every row it returns in total", () => {
    const result = searchIndex(fixture, "chicago");
    expect(result.total).toBe(hits(result).length);
    expect(result.sections.map((s) => s.section)).toEqual(["venue", "travel"]);
  });

  it("returns only sections with hits, and nothing for an empty index", () => {
    expect(searchIndex(fixture, "zzzz")).toEqual(EMPTY);
    expect(searchIndex(prepareIndex({ entries: [] }), "dock")).toEqual(EMPTY);
  });
});

describe("highlight ranges (spec §5.6, §6.4)", () => {
  const password = entryWhere({ label: "Wi-Fi password" });

  it("covers exactly the matched tokens' display spans", () => {
    const hit = hitFor(searchIndex(fixture, "wifi password"), password);
    expect(hit?.ranges).toEqual({
      group: [],
      label: [
        { start: 0, end: 5 },
        { start: 6, end: 14 },
      ],
      value: [],
    });
  });

  it("never crosses a token boundary it did not match", () => {
    const hit = hitFor(searchIndex(fixture, "wifi"), password);
    expect(hit?.ranges.label).toEqual([{ start: 0, end: 5 }]);
  });

  it("highlights the whole token on a prefix or fuzzy match", () => {
    expect(hitFor(searchIndex(fixture, "pass"), password)?.ranges.label).toEqual([
      { start: 6, end: 14 },
    ]);
    expect(hitFor(searchIndex(fixture, "wfii"), password)?.ranges.label).toEqual([
      { start: 0, end: 5 },
    ]);
  });

  it("highlights a group match", () => {
    const video = entryWhere({ group: "Video", label: "Grand Ballroom" });
    const hit = hitFor(searchIndex(fixture, "ballroom video"), video);
    expect(hit?.ranges.group).toEqual([{ start: 0, end: 5 }]);
    expect(hit?.ranges.label).toEqual([{ start: 6, end: 14 }]);
  });

  it("highlights the alias source span, derived from the display text", () => {
    const hardline = entryWhere({ value: "Internet hardline at front of house" });
    const phrase = "front of house";
    const start = hardline.value.indexOf(phrase);
    expect(hitFor(searchIndex(fixture, "foh"), hardline)?.ranges.value).toEqual([
      { start, end: start + phrase.length },
    ]);
    expect(hitFor(searchIndex(fixture, "wifi"), hardline)?.ranges.value).toEqual([
      { start: 0, end: "Internet".length },
    ]);
  });

  it("highlights matched words, not the alias span, when the token matched a displayed word", () => {
    // "Loading dock" is itself a Dock-group phrase, so "dock" is ALSO an alias
    // token spanning "Loading dock". "Loading" did not match; it stays plain.
    const dock = entryWhere({ label: "Dock" });
    const hit = hitFor(searchIndex(fixture, "dock"), dock);
    const start = dock.value.indexOf("dock");
    expect(hit?.ranges.label).toEqual([{ start: 0, end: 4 }]);
    expect(hit?.ranges.value).toEqual([{ start, end: start + 4 }]);
  });

  it("carries no highlight for a context-only match", () => {
    const checkIn = entryWhere({ label: "Check-in" });
    const hit = hitFor(searchIndex(fixture, "regency"), checkIn);
    expect(hit?.ranges).toEqual({ group: [], label: [], value: [] });
  });
});

describe("purity (spec §5)", () => {
  it("gives the same result for the same index and query, without mutating either", () => {
    const snapshot = JSON.stringify(FIXTURE_INDEX);
    const first = searchIndex(fixture, "wifi password");
    const second = searchIndex(fixture, "wifi password");
    expect(second).toEqual(first);
    expect(JSON.stringify(FIXTURE_INDEX)).toBe(snapshot);
  });
});

describe("realistic queries over the fixture (spec §11.3)", () => {
  it.each([
    ["wifi", { label: "Wi-Fi network" }],
    ["wfii", { label: "Wi-Fi network" }],
    ["internet", { value: "Internet hardline at front of house" }],
    ["wi-fi password", { label: "Wi-Fi password" }],
    ["dock", { label: "Dock" }],
    ["loading", { label: "Dock" }],
    ["ballroom video", { group: "Video", label: "Grand Ballroom" }],
    ["foh", { group: "Audio", label: "Grand Ballroom" }],
    ["mics", { group: "Audio", label: "Grand Ballroom" }],
    ["client laptop", { group: "Keynote requirements" }],
    ["projection", { group: "Video", label: "Grand Ballroom" }],
    ["parking", { label: "Parking" }],
    ["hotel confirmation", { group: "Hotels", label: "Confirmation" }],
    ["strike", { group: "Run of show" }],
  ] as const)("%j finds %j first", (query, match) => {
    expect(topId(searchIndex(fixture, query))).toBe(entryWhere(match).id);
  });
});
