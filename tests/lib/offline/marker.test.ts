import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { markerAttributes, readMarker, type Marker, type SaveMarker } from "@/lib/offline/marker";

const SHOW = "3f2b8c1e-9d4a-4e6b-8a57-1c2d3e4f5a6b";
const OTHER_SHOW = "9a7c1d20-5b3e-4f18-9c64-0e2b7a8d1f35";
const VIEWER = "q3Xk-9_LmZpRt2VbYw0aGhJ4";

/** Characters React escapes (quote, ampersand, apostrophe, angle brackets), and literal entity text that a sequential decoder would corrupt. */
const ENTITY_STRESS_ASSET = `/api/asset/diagram/a&quot;b'c"d<e>f&amp;g`;

const SAVE: SaveMarker = {
  disposition: "save",
  showId: SHOW,
  renderedAt: "2026-10-27T06:03:26.123Z",
  epoch: 4,
  viewer: VIEWER,
  assets: ["/api/asset/diagram/abc?v=1&w=2", "/api/asset/agenda/xyz", ENTITY_STRESS_ASSET],
};

/** The page's own serialization: React renders the attribute map the page spreads onto <template>. */
function render(attrs: Record<string, string>): string {
  return renderToStaticMarkup(createElement("template", attrs));
}

function renderMarker(marker: Marker): string {
  return render(markerAttributes(marker));
}

const valid = (marker: Marker) => ({ kind: "valid", marker });
const invalid = (showId: string | null) => ({ kind: "invalid", showId });
const ABSENT = { kind: "absent" };

function without(attrs: Record<string, string>, key: string): Record<string, string> {
  return Object.fromEntries(Object.entries(attrs).filter(([name]) => name !== key));
}

describe("markerAttributes", () => {
  test("save carries every field the worker needs and nothing else", () => {
    expect(markerAttributes(SAVE)).toStrictEqual({
      id: "fxav-saved-copy",
      "data-v": "3",
      "data-disposition": "save",
      "data-show-id": SHOW,
      "data-rendered-at": "2026-10-27T06:03:26.123Z",
      "data-epoch": "4",
      "data-viewer": VIEWER,
      "data-assets": JSON.stringify(SAVE.assets),
    });
  });

  test("keep carries the show and the viewer", () => {
    expect(markerAttributes({ disposition: "keep", showId: SHOW, viewer: VIEWER })).toStrictEqual({
      id: "fxav-saved-copy",
      "data-v": "3",
      "data-disposition": "keep",
      "data-show-id": SHOW,
      "data-viewer": VIEWER,
    });
  });

  test.each(["hold", "check", "purge"] as const)(
    "%s names its show when it has one and omits the attribute when it does not",
    (disposition) => {
      expect(markerAttributes({ disposition, showId: SHOW })).toStrictEqual({
        id: "fxav-saved-copy",
        "data-v": "3",
        "data-disposition": disposition,
        "data-show-id": SHOW,
      });
      expect(markerAttributes({ disposition, showId: null })).toStrictEqual({
        id: "fxav-saved-copy",
        "data-v": "3",
        "data-disposition": disposition,
      });
    },
  );
});

describe("round trip through React's own serialization", () => {
  const ROUND_TRIPS: Array<[string, Marker]> = [
    ["save", SAVE],
    ["save with no assets", { ...SAVE, assets: [] }],
    ["save at epoch zero", { ...SAVE, epoch: 0 }],
    ["keep", { disposition: "keep", showId: SHOW, viewer: VIEWER }],
    ["hold naming a show", { disposition: "hold", showId: SHOW }],
    ["hold with no show", { disposition: "hold", showId: null }],
    ["check naming a show", { disposition: "check", showId: SHOW }],
    ["check with no show", { disposition: "check", showId: null }],
    ["purge naming a show", { disposition: "purge", showId: SHOW }],
    ["purge with no show", { disposition: "purge", showId: null }],
  ];

  test("premise: the cases cover all five dispositions", () => {
    const covered = [...new Set(ROUND_TRIPS.map(([, marker]) => marker.disposition))].sort();
    premiseHolds(
      "round trips cover save, keep, hold, check and purge",
      covered.join(",") === "check,hold,keep,purge,save",
    );
  });

  test.each(ROUND_TRIPS)("%s", (_label, marker) => {
    expect(readMarker(renderMarker(marker))).toStrictEqual(valid(marker));
  });

  test("entity-escaped data-assets survive, including literal entity text", () => {
    const html = renderMarker(SAVE);
    // The reader is only tested against React's escaping if React actually escaped something.
    premiseHolds(
      "React escaped quotes and ampersands in data-assets",
      html.includes("&quot;") && html.includes("&amp;") && html.includes("&#x27;"),
    );
    premiseHolds(
      "the literal text &quot; reached the page as &amp;quot;",
      html.includes("&amp;quot;"),
    );
    expect(readMarker(html)).toStrictEqual(valid(SAVE));
  });
});

describe("which element is the marker", () => {
  const REAL: Marker = {
    disposition: "save",
    showId: SHOW,
    renderedAt: SAVE.renderedAt,
    epoch: 7,
    viewer: VIEWER,
    assets: [],
  };
  const real = () => renderMarker(REAL);
  const fakeAttrs = `id="fxav-saved-copy" data-v="3" data-disposition="purge" data-show-id="${OTHER_SHOW}"`;
  const flightRow = `2:${JSON.stringify(["$", "template", null, { id: "fxav-saved-copy", "data-v": "3", "data-disposition": "purge", "data-show-id": OTHER_SHOW }])}\n`;

  const NOT_THE_MARKER: Array<[string, string]> = [
    [
      "an RSC flight payload",
      `<script>self.__next_f.push(${JSON.stringify([1, flightRow])})</script>`,
    ],
    [
      "a literal tag in a script string",
      `<script>var t='<template ${fakeAttrs}></template>';</script>`,
    ],
    [
      "a literal tag in a style block",
      `<style>.x::after{content:'<template ${fakeAttrs}>'}</style>`,
    ],
    ["an HTML comment", `<!-- <template ${fakeAttrs}></template> -->`],
    [
      "another element's attribute value",
      `<div data-note='<template ${fakeAttrs}></template>'></div>`,
    ],
    [
      "escaped text",
      `<p>${renderToStaticMarkup(createElement("span", null, `<template ${fakeAttrs}></template>`))}</p>`,
    ],
    [
      "a template whose id merely starts with the marker id",
      `<template id="fxav-saved-copy-2" ${fakeAttrs.replace('id="fxav-saved-copy" ', "")}></template>`,
    ],
    [
      "a template that names the id in another attribute",
      `<template data-id="fxav-saved-copy" data-note="id=fxav-saved-copy"></template>`,
    ],
    ["a non-template element with the marker id", `<div ${fakeAttrs}></div>`],
  ];

  test.each(NOT_THE_MARKER)("%s alone is no marker", (_label, decoy) => {
    premiseHolds("the decoy carries the marker id text", decoy.includes("fxav-saved-copy"));
    expect(readMarker(`<html><body>${decoy}</body></html>`)).toStrictEqual(ABSENT);
  });

  test.each(NOT_THE_MARKER)("%s before the real marker is ignored", (_label, decoy) => {
    expect(
      readMarker(`<html><body>${decoy}<main>page</main>${real()}</body></html>`),
    ).toStrictEqual(valid(REAL));
  });

  test("two markers in one body: the first wins, in either order", () => {
    const purge = renderMarker({ disposition: "purge", showId: OTHER_SHOW });
    expect(readMarker(`<body>${purge}${real()}</body>`)).toStrictEqual(
      valid({ disposition: "purge", showId: OTHER_SHOW }),
    );
    expect(readMarker(`<body>${real()}${purge}</body>`)).toStrictEqual(valid(REAL));
  });

  test("an invalid first marker is not rescued by a valid second one", () => {
    const bad = render({ ...markerAttributes(REAL), "data-v": "2" });
    expect(readMarker(`<body>${bad}${real()}</body>`)).toStrictEqual(invalid(SHOW));
  });

  test("the marker inside a streamed hidden segment, after the skeleton, is found", () => {
    const html =
      `<!DOCTYPE html><html><head><title>Show</title></head><body>` +
      `<!--$?--><template id="B:0"></template><div class="skeleton">Loading</div><!--/$-->` +
      `<script>$RC=function(b,c){};</script>` +
      `<div hidden id="S:0">${real()}<main>page</main></div>` +
      `<script>$RC("B:0","S:0")</script></body></html>`;
    // The skeleton alone (a Suspense placeholder template, no marker yet) is not a marker.
    expect(readMarker(html.slice(0, html.indexOf('<div hidden id="S:0">')))).toStrictEqual(ABSENT);
    premiseHolds(
      "the marker sits after the skeleton, inside the hidden segment",
      html.indexOf('id="S:0"') < html.indexOf("fxav-saved-copy") &&
        html.indexOf('id="B:0"') < html.indexOf('id="S:0"'),
    );
    expect(readMarker(html)).toStrictEqual(valid(REAL));
  });

  test("HTML spellings React does not emit are read the same way", () => {
    const keep: Marker = { disposition: "keep", showId: SHOW, viewer: VIEWER };
    const spellings: Array<[string, string]> = [
      [
        "single quotes",
        `<template id='fxav-saved-copy' data-v='3' data-disposition='keep' data-show-id='${SHOW}' data-viewer='${VIEWER}'></template>`,
      ],
      [
        "unquoted values",
        `<template id=fxav-saved-copy data-v=3 data-disposition=keep data-show-id=${SHOW} data-viewer=${VIEWER}></template>`,
      ],
      [
        "newlines between attributes",
        `<template\n  id="fxav-saved-copy"\n  data-v="3"\n\tdata-disposition="keep"\n  data-show-id="${SHOW}"\n  data-viewer="${VIEWER}"\n></template>`,
      ],
      [
        "upper-case names",
        `<TEMPLATE ID="fxav-saved-copy" DATA-V="3" DATA-DISPOSITION="keep" DATA-SHOW-ID="${SHOW}" DATA-VIEWER="${VIEWER}"></TEMPLATE>`,
      ],
      [
        "a self-closing tag",
        `<template id="fxav-saved-copy" data-v="3" data-disposition="keep" data-show-id="${SHOW}" data-viewer="${VIEWER}" />`,
      ],
    ];
    for (const [label, html] of spellings) {
      expect(readMarker(html), label).toStrictEqual(valid(keep));
    }
  });

  test("a repeated attribute keeps its first value, as in HTML", () => {
    const html = `<template id="fxav-saved-copy" data-v="3" data-disposition="purge" data-disposition="hold" data-show-id="${SHOW}" data-show-id="${OTHER_SHOW}"></template>`;
    expect(readMarker(html)).toStrictEqual(valid({ disposition: "purge", showId: SHOW }));
  });

  test("no marker, an empty body and an id-less template are absent", () => {
    expect(readMarker("")).toStrictEqual(ABSENT);
    expect(readMarker("<html><body><main>page</main></body></html>")).toStrictEqual(ABSENT);
    expect(readMarker("<template><p>x</p></template>")).toStrictEqual(ABSENT);
  });

  test("tag names that are also Object properties do not break the scan", () => {
    const props = ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"];
    const before = props.map((name) => `<${name} id="x"></${name}>`).join("");
    expect(readMarker(`<body>${before}${real()}</body>`)).toStrictEqual(valid(REAL));
    expect(readMarker(`<body>${before}</body>`)).toStrictEqual(ABSENT);
  });

  test("a truncated or garbled tag is absent and never throws", () => {
    const garbage = [
      `<template id="fxav-saved-copy" data-v="3" data-disposition="pur`,
      `<template id="fxav-saved-copy" data-v="3"`,
      "<template id=",
      "<template",
      "<",
      "<<<<>>>>",
      "<!--",
      "<script>",
      "\u0000�<\u0001>",
    ];
    for (const html of garbage) {
      expect(() => readMarker(html), html).not.toThrow();
      expect(readMarker(html), html).toStrictEqual(ABSENT);
    }
  });
});

describe("entity decoding", () => {
  const tag = (viewer: string) =>
    `<template id="fxav-saved-copy" data-v="3" data-disposition="keep" data-show-id="${SHOW}" data-viewer="${viewer}"></template>`;
  const viewerOf = (html: string) => {
    const read = readMarker(html);
    return read.kind === "valid" && read.marker.disposition === "keep" ? read.marker.viewer : read;
  };

  test("decodes the six entities React and the platform emit", () => {
    expect(viewerOf(tag("a&#39;b&#x27;c&quot;d&amp;e&lt;f&gt;g"))).toBe(`a'b'c"d&e<f>g`);
  });

  test("decodes in one pass: an escaped entity stays literal text", () => {
    expect(viewerOf(tag("&amp;quot;"))).toBe("&quot;");
    expect(viewerOf(tag("&amp;amp;"))).toBe("&amp;");
    expect(viewerOf(tag("&amp;lt;"))).toBe("&lt;");
    expect(viewerOf(tag("&amp;#39;"))).toBe("&#39;");
  });
});

describe("fails closed", () => {
  const baseline = () => markerAttributes(SAVE);
  const SAVE_REQUIRED = [
    "data-show-id",
    "data-rendered-at",
    "data-epoch",
    "data-viewer",
    "data-assets",
  ];
  const read = (attrs: Record<string, string>) => readMarker(render(attrs));

  test("control: the baseline every case below deviates from by one attribute reads valid", () => {
    const fixed = ["id", "data-v", "data-disposition"];
    expect(Object.keys(baseline()).filter((key) => !fixed.includes(key))).toStrictEqual(
      SAVE_REQUIRED,
    );
    premise("a save marker has five required attributes", SAVE_REQUIRED.length, 4);
    expect(read(baseline())).toStrictEqual(valid(SAVE));
  });

  test.each(["2", "4", "", "03", "3.0"])("unknown data-v %j is invalid", (version) => {
    expect(read({ ...baseline(), "data-v": version })).toStrictEqual(invalid(SHOW));
  });

  test("a missing data-v is invalid", () => {
    expect(read(without(baseline(), "data-v"))).toStrictEqual(invalid(SHOW));
  });

  test.each(["frozen", "SAVE", "Save", "save ", "", "save,keep"])(
    "unknown disposition %j is invalid",
    (disposition) => {
      expect(read({ ...baseline(), "data-disposition": disposition })).toStrictEqual(invalid(SHOW));
    },
  );

  test("a missing disposition is invalid", () => {
    expect(read(without(baseline(), "data-disposition"))).toStrictEqual(invalid(SHOW));
  });

  test("a missing id is no marker at all", () => {
    expect(read(without(baseline(), "id"))).toStrictEqual(ABSENT);
  });

  test.each(SAVE_REQUIRED)("a save marker missing %s is invalid", (key) => {
    expect(read(without(baseline(), key))).toStrictEqual(
      invalid(key === "data-show-id" ? null : SHOW),
    );
  });

  test.each(SAVE_REQUIRED)("a save marker with an empty %s is invalid", (key) => {
    expect(read({ ...baseline(), [key]: "" })).toStrictEqual(
      invalid(key === "data-show-id" ? null : SHOW),
    );
  });

  test.each([
    "yesterday",
    "2026-10-27",
    "2026-10-27 06:03:26Z",
    "2026-10-27T06:03:26",
    "2026-10-27T06:03:26+02:00",
    "2026-10-27T06:03:26+00:00",
    "2026-10-27T06:03:26.123+00:00",
    "1793081006123",
    "2026-13-01T00:00:00Z",
    "2026-02-30T00:00:00Z",
    "2026-10-27T24:00:00Z",
    "2026-10-27T06:03:26.123Zjunk",
  ])("data-rendered-at %j is invalid", (value) => {
    expect(read({ ...baseline(), "data-rendered-at": value })).toStrictEqual(invalid(SHOW));
  });

  test.each(["2026-10-27T06:03:26Z", "2026-10-27T06:03:26.1Z", "2026-02-28T23:59:59.999Z"])(
    "data-rendered-at %j is valid",
    (value) => {
      expect(read({ ...baseline(), "data-rendered-at": value })).toStrictEqual(
        valid({ ...SAVE, renderedAt: value }),
      );
    },
  );

  test.each([
    "1.5",
    "-1",
    "abc",
    "1e3",
    "0x10",
    " 3",
    "3 ",
    "03",
    "NaN",
    "Infinity",
    "99999999999999999999",
  ])("data-epoch %j is invalid", (value) => {
    expect(read({ ...baseline(), "data-epoch": value })).toStrictEqual(invalid(SHOW));
  });

  test.each(["0", "1", "4", "9007199254740991"])("data-epoch %j is valid", (value) => {
    expect(read({ ...baseline(), "data-epoch": value })).toStrictEqual(
      valid({ ...SAVE, epoch: Number(value) }),
    );
  });

  test.each([
    "not json",
    "{}",
    "null",
    JSON.stringify("/api/asset/diagram/a"),
    JSON.stringify({ 0: "/api/asset/diagram/a" }),
    JSON.stringify([1]),
    JSON.stringify([null]),
    JSON.stringify([["/api/asset/diagram/a"]]),
    JSON.stringify([""]),
    JSON.stringify(["https://evil.example/api/asset/diagram/a"]),
    JSON.stringify(["//evil.example/api/asset/diagram/a"]),
    JSON.stringify(["/api/asset"]),
    JSON.stringify(["/api/assets/diagram/a"]),
    JSON.stringify(["/api/other/diagram/a"]),
    JSON.stringify(["api/asset/diagram/a"]),
    JSON.stringify(["/api/asset/../../secret"]),
    JSON.stringify(["/api/asset/%2e%2e/secret"]),
    JSON.stringify(["/api/asset/..\\..\\secret"]),
    JSON.stringify(["/api/asset/diagram/a", "/elsewhere/b"]),
  ])("data-assets %s is invalid", (value) => {
    expect(read({ ...baseline(), "data-assets": value })).toStrictEqual(invalid(SHOW));
  });

  test("keep without a show or without a viewer is invalid", () => {
    const keep = markerAttributes({ disposition: "keep", showId: SHOW, viewer: VIEWER });
    premiseHolds("the keep baseline reads valid", readMarker(render(keep)).kind === "valid");
    expect(read(without(keep, "data-show-id"))).toStrictEqual(invalid(null));
    expect(read(without(keep, "data-viewer"))).toStrictEqual(invalid(SHOW));
    expect(read({ ...keep, "data-viewer": "" })).toStrictEqual(invalid(SHOW));
  });

  describe("an invalid marker keeps the show id only when it has UUID shape", () => {
    test("a well-formed id is kept", () => {
      expect(read({ ...baseline(), "data-v": "9", "data-show-id": OTHER_SHOW })).toStrictEqual(
        invalid(OTHER_SHOW),
      );
    });

    test.each([
      "not-a-uuid",
      "",
      SHOW.toUpperCase(),
      ` ${SHOW}`,
      `${SHOW}0`,
      SHOW.slice(0, -1),
      SHOW.replace(/-/g, ""),
      `${SHOW}"><script>`,
    ])("%j is not kept", (showId) => {
      expect(read({ ...baseline(), "data-v": "9", "data-show-id": showId })).toStrictEqual(
        invalid(null),
      );
    });
  });
});
