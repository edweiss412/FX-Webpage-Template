import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import {
  markerAttributes,
  readMarker,
  readNavigationMarker,
  type Marker,
  type SaveMarker,
} from "@/lib/offline/marker";

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

// --- The worker's navigation read: a streamed not-found (fix-task-25 D1) ----------
//
// FIXTURES: tests/lib/offline/fixtures/crew-not-found-streamed.html and
// crew-page-streamed.html are production response bodies, trimmed. Captured from
// commit e1b2bae5b:
//   1. Build:  CI=1 JWT_SIGNING_SECRET=… ADMIN_DEV_PANEL_ENABLED=true ENABLE_TEST_AUTH=true
//                TEST_AUTH_SECRET=… DATABASE_URL=<loopback> TEST_DATABASE_URL=<loopback>
//                pnpm heavy pnpm build   (the crew-e2e webServer's build, playwright.config.ts)
//   2. Serve:  the same env, `pnpm start -H 127.0.0.1 -p 3418`, outside the heavy wrapper.
//   3. Seed the LOOPBACK database with seedShowWithCrew (one crew member), pick that member
//      in Chromium with service workers blocked, then read each document's body from
//      `page.goto(...)`: the crew page at the show's link, and `/show/<slug>/<64 zeros>`
//      (a post-stream notFound(): HTTP 200, no marker element). The seed was deleted after.
//   4. Trim: the head's chunk <script src> tags dropped from both; from the crew page,
//      the payload pushes after the first and the footer segment dropped. Every share
//      token replaced by 0123456789abcdef x4 (the zero token kept) and the viewer key by
//      `fixture-viewer-key`. Nothing else is edited: the hidden segments, the payload's
//      first push (with the not-found tree every crew page carries as a fallback prop),
//      the digest's flight row and React's $RX instruction are as the server sent them.
// An archived show's old link answered the same bytes as the zero token, ids aside.

const STREAMED_NOT_FOUND = readFileSync(
  join(process.cwd(), "tests", "lib", "offline", "fixtures", "crew-not-found-streamed.html"),
  "utf8",
);
const STREAMED_CREW_PAGE = readFileSync(
  join(process.cwd(), "tests", "lib", "offline", "fixtures", "crew-page-streamed.html"),
  "utf8",
);

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Next 16's digest for notFound(), spelled out here rather than read from the module. */
const NOT_FOUND_DIGEST_TEXT = "NEXT_HTTP_ERROR_FALLBACK;404";

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

/** The crew page's marker element, cut out by a plain pattern, not by the module's tokenizer. */
const CREW_PAGE_MARKER = /<template id="fxav-saved-copy"[^>]*><\/template>/;

describe("readNavigationMarker", () => {
  test("a streamed not-found page reads as the not-found page's check, naming no show", () => {
    premiseHolds(
      "the body has no marker element, so readMarker alone reads it absent",
      !CREW_PAGE_MARKER.test(STREAMED_NOT_FOUND) &&
        readMarker(STREAMED_NOT_FOUND).kind === "absent",
    );
    // The digest twice: the payload's error row and React's client-render instruction.
    premise(
      "the body carries Next's not-found digest",
      occurrences(STREAMED_NOT_FOUND, NOT_FOUND_DIGEST_TEXT),
      1,
    );
    expect(readNavigationMarker(STREAMED_NOT_FOUND)).toStrictEqual(
      valid({ disposition: "check", showId: null }),
    );
  });

  test("a crew page reads as its own save marker", () => {
    const showId = /data-show-id="([^"]+)"/.exec(STREAMED_CREW_PAGE)?.[1];
    premiseHolds("the fixture names its show", showId !== undefined && UUID_SHAPE.test(showId));
    premiseHolds(
      "the crew page carries no not-found digest",
      occurrences(STREAMED_CREW_PAGE, NOT_FOUND_DIGEST_TEXT) === 0,
    );
    const read = readNavigationMarker(STREAMED_CREW_PAGE);
    expect(read.kind).toBe("valid");
    expect(read.kind === "valid" ? read.marker : null).toMatchObject({
      disposition: "save",
      showId,
      viewer: "fixture-viewer-key",
    });
  });

  test("a marker element wins over a not-found digest in the same body", () => {
    // The crew page with the not-found page's $RX instruction appended: the
    // fallback reads only a body with no marker element.
    const both = STREAMED_CREW_PAGE.replace(
      "</body>",
      `<script>$RX("B:0","${NOT_FOUND_DIGEST_TEXT}")</script></body>`,
    );
    premise("the digest is in the body", occurrences(both, NOT_FOUND_DIGEST_TEXT), 0);
    expect(readNavigationMarker(both)).toStrictEqual(readMarker(STREAMED_CREW_PAGE));
    expect(readNavigationMarker(both)).toMatchObject({ marker: { disposition: "save" } });
  });

  test("a crew page with its marker element removed is absent: the payload's not-found tree does not count", () => {
    const bare = STREAMED_CREW_PAGE.replace(CREW_PAGE_MARKER, "");
    premiseHolds("the marker element was removed", !CREW_PAGE_MARKER.test(bare));
    // Every crew page's payload carries the not-found boundary's tree as a fallback
    // prop, check marker props and test id included.
    premise("the not-found tree is in the payload", occurrences(bare, "crew-not-found-root"), 0);
    premise(
      "its check props are in the payload",
      occurrences(bare, String.raw`\"disposition\":\"check\"`),
      0,
    );
    expect(readNavigationMarker(bare)).toStrictEqual(ABSENT);
  });

  test("another HTTP fallback or an uncaught error's digest is not the not-found page", () => {
    const forbidden = STREAMED_NOT_FOUND.replaceAll(
      NOT_FOUND_DIGEST_TEXT,
      "NEXT_HTTP_ERROR_FALLBACK;403",
    );
    const thrown = STREAMED_NOT_FOUND.replaceAll(NOT_FOUND_DIGEST_TEXT, "2738812345");
    for (const [label, body] of [
      ["forbidden()", forbidden],
      ["an uncaught error (error.tsx)", thrown],
    ] as const) {
      premiseHolds(`${label}: no not-found digest left`, !body.includes(NOT_FOUND_DIGEST_TEXT));
      expect(readNavigationMarker(body), label).toStrictEqual(ABSENT);
    }
  });

  test("an unrelated page with no marker is absent", () => {
    const html =
      `<!DOCTYPE html><html lang="en"><head><title>Sign in</title></head>` +
      `<body><main data-testid="sign-in-page"><h1>Sign in</h1></main></body></html>`;
    expect(readNavigationMarker(html)).toStrictEqual(ABSENT);
    expect(readNavigationMarker("")).toStrictEqual(ABSENT);
  });
});
