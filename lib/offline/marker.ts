/**
 * The saved-copy marker (spec 4.3): the one element every crew-route page
 * renders and the service worker reads, from the complete body, before it
 * chooses what to serve.
 *
 * Pure and dependency-free: the worker bundle imports this file, the server
 * spreads `markerAttributes` onto a `<template>`, and Vitest imports the same
 * source.
 *
 * The reader fails closed. A marker it cannot fully validate is `invalid` and
 * a body with no marker is `absent`; the worker acts on both as `purge`. It
 * never throws, whatever the body holds. The worker's own navigation read,
 * `readNavigationMarker`, adds one exception: the not-found page streamed after
 * its shell, which has no marker element, reads as that page's `check`.
 */

export const MARKER_ID = "fxav-saved-copy";
export const MARKER_VERSION = "3";

export type SaveMarker = {
  disposition: "save";
  showId: string;
  renderedAt: string;
  epoch: number;
  viewer: string;
  assets: readonly string[];
};
export type KeepMarker = { disposition: "keep"; showId: string; viewer: string };
export type BareMarker = { disposition: "hold" | "check" | "purge"; showId: string | null };
export type Marker = SaveMarker | KeepMarker | BareMarker;

/** What the worker read from a complete body. "absent" and "invalid" both act as purge. */
export type MarkerRead =
  | { kind: "valid"; marker: Marker }
  | { kind: "invalid"; showId: string | null }
  | { kind: "absent" };

/** The attributes of the marker's `<template>` element, in the order they are written. */
export function markerAttributes(marker: Marker): Record<string, string> {
  const base = {
    id: MARKER_ID,
    "data-v": MARKER_VERSION,
    "data-disposition": marker.disposition,
  };
  switch (marker.disposition) {
    case "save":
      return {
        ...base,
        "data-show-id": marker.showId,
        "data-rendered-at": marker.renderedAt,
        "data-epoch": String(marker.epoch),
        "data-viewer": marker.viewer,
        "data-assets": JSON.stringify(marker.assets),
      };
    case "keep":
      return { ...base, "data-show-id": marker.showId, "data-viewer": marker.viewer };
    default:
      return marker.showId === null ? base : { ...base, "data-show-id": marker.showId };
  }
}

/** The first marker element in `html`; see `MarkerRead` for what each answer means. */
export function readMarker(html: string): MarkerRead {
  const attributes = findMarkerAttributes(html);
  if (attributes === null) return { kind: "absent" };
  const marker = parseMarker(attributes);
  if (marker !== null) return { kind: "valid", marker };
  // The purge can still name the show when the id is well formed.
  const showId = attributes.get("data-show-id");
  return { kind: "invalid", showId: showId !== undefined && UUID.test(showId) ? showId : null };
}

/**
 * Next's digest for `notFound()`: `${HTTP_ERROR_FALLBACK_ERROR_CODE};404`
 * (next/dist/client/components/not-found.js:25, the code from
 * next/dist/client/components/http-access-fallback/http-access-fallback.js:41).
 *
 * Why the worker looks for it. The crew route has a `loading.tsx`, so its
 * documents stream. When the page calls `notFound()` after the shell has gone
 * out, the server can no longer render the not-found page into the HTML. It
 * answers HTTP 200 with the loading skeleton, an empty hidden segment and the
 * RSC payload, and the client renders `not-found.tsx` from that payload. Its
 * `check` marker (spec 4.3) then exists only as props inside the payload, never
 * as an element, so `readMarker` finds nothing. What the body does carry is
 * this digest, twice: the payload's error row (`E{"digest":…}`) and React's
 * instruction to render the boundary on the client (`$RX("B:0",…)`). Probed
 * against the production build (fix-task-25 D1). Every crew page's payload also
 * carries the not-found tree, as the layout's fallback prop, so the tree is no
 * signal; the digest appears in no other crew page.
 *
 * Fail-closed: if a later Next spells the digest differently, the body reads
 * `absent` again and the worker purges by URL. A copy is then lost at an
 * archive it should survive (R3), never kept past one it should not. The e2e
 * cases that would turn red are crew-offline.spec.ts 3, 4, 13 and 15.
 */
export const NEXT_NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404";

/**
 * The worker's read of a navigation response it has buffered whole (spec 4.4
 * step 3): `readMarker`, except that a body with no marker element that carries
 * Next's not-found digest is the not-found page streamed after its shell, and
 * reads as that page's marker: `check`, naming no show. A marker element always
 * wins. Only the worker reads bodies this way; every other reader keeps
 * `readMarker`.
 */
export function readNavigationMarker(html: string): MarkerRead {
  const read = readMarker(html);
  if (read.kind !== "absent" || !html.includes(NEXT_NOT_FOUND_DIGEST)) return read;
  return { kind: "valid", marker: { disposition: "check", showId: null } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const EPOCH = /^(?:0|[1-9]\d*)$/;
const ASSET_PREFIX = "/api/asset/";
const ASSET_BASE = "https://assets.invalid";

function nonEmpty(value: string | undefined): string | undefined {
  return value === "" ? undefined : value;
}

function parseMarker(attributes: ReadonlyMap<string, string>): Marker | null {
  if (attributes.get("data-v") !== MARKER_VERSION) return null;
  const disposition = attributes.get("data-disposition");
  const showId = nonEmpty(attributes.get("data-show-id"));
  const viewer = nonEmpty(attributes.get("data-viewer"));

  if (disposition === "hold" || disposition === "check" || disposition === "purge") {
    return { disposition, showId: showId ?? null };
  }
  if (disposition === "keep") {
    return showId === undefined || viewer === undefined ? null : { disposition, showId, viewer };
  }
  if (disposition === "save") {
    const renderedAt = attributes.get("data-rendered-at");
    const epoch = parseEpoch(attributes.get("data-epoch"));
    const assets = parseAssets(attributes.get("data-assets"));
    if (
      showId === undefined ||
      viewer === undefined ||
      renderedAt === undefined ||
      !isIsoUtc(renderedAt) ||
      epoch === null ||
      assets === null
    ) {
      return null;
    }
    return { disposition, showId, renderedAt, epoch, viewer, assets };
  }
  return null;
}

/**
 * An ISO 8601 UTC timestamp that names a real instant: the shape a `save`
 * marker's `data-rendered-at` must have. The saved-copy status route reads its
 * `saved` parameter, which is that same value, with this one check.
 */
export function isIsoUtc(value: string): boolean {
  if (!ISO_UTC.test(value)) return false;
  const time = Date.parse(value);
  // Date.parse rolls February 30 over to March and 24:00 over to the next day;
  // a real timestamp survives a round trip through toISOString.
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 19) === value.slice(0, 19);
}

function parseEpoch(value: string | undefined): number | null {
  if (value === undefined || !EPOCH.test(value)) return null;
  const epoch = Number(value);
  return Number.isSafeInteger(epoch) ? epoch : null;
}

function parseAssets(value: string | undefined): readonly string[] | null {
  if (value === undefined) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  return Array.isArray(parsed) && parsed.every(isAssetPath) ? parsed : null;
}

function isAssetPath(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith(ASSET_PREFIX)) return false;
  try {
    // Resolving collapses "..", "%2e%2e" and backslashes, so a path cannot climb out of the prefix.
    return new URL(value, ASSET_BASE).pathname.startsWith(ASSET_PREFIX);
  } catch {
    return false;
  }
}

// --- Finding the element -----------------------------------------------------
//
// A small tokenizer, not a pattern over the whole body. The body also holds the
// RSC flight payload, which spells the marker out as JSON (`"id":"fxav-saved-copy"`),
// and a bare search for the id would take that for the element. So the scan walks
// start tags the way a browser would: attribute values are quote-aware, and
// comments, scripts and styles are skipped, because nothing inside them is an element.

const TAG_NAME = /<([a-zA-Z][^\s/>]*)/y;
const ATTRIBUTE = /[\s/]*(?:(>)|([^\s/>][^\s/>=]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?)/y;
/** A Map, not an object: a `<constructor>` tag must not find an inherited property. */
const RAW_TEXT_END = new Map<string, RegExp>([
  ["script", /<\/script/gi],
  ["style", /<\/style/gi],
]);
const ENTITIES: ReadonlyMap<string, string> = new Map([
  ["&quot;", '"'],
  ["&amp;", "&"],
  ["&#x27;", "'"],
  ["&#39;", "'"],
  ["&lt;", "<"],
  ["&gt;", ">"],
]);

/** One pass, so `&amp;quot;` decodes to the text `&quot;`, not to a quote. */
function decodeEntities(value: string): string {
  return value.replace(
    /&(?:quot|amp|#x27|#39|lt|gt);/g,
    (entity) => ENTITIES.get(entity) ?? entity,
  );
}

/** The attributes of the tag whose name ends at `from`, or null when the tag never closes. */
function parseAttributes(
  html: string,
  from: number,
): { attributes: Map<string, string>; end: number } | null {
  const attributes = new Map<string, string>();
  let at = from;
  for (;;) {
    ATTRIBUTE.lastIndex = at;
    const match = ATTRIBUTE.exec(html);
    if (match === null) return null;
    at = ATTRIBUTE.lastIndex;
    if (match[1] !== undefined) return { attributes, end: at };
    const name = (match[2] ?? "").toLowerCase();
    // As in HTML, the first of two same-named attributes wins.
    if (!attributes.has(name)) {
      attributes.set(name, decodeEntities(match[3] ?? match[4] ?? match[5] ?? ""));
    }
  }
}

/**
 * One start tag the scan walked past: its lower-cased name, its decoded
 * attributes, and `end`, the offset just past its closing `>`.
 */
export type StartTag = { name: string; attributes: ReadonlyMap<string, string>; end: number };

/**
 * Every start tag in `html`, in document order, the way the tokenizer above
 * walks them: comments, script bodies and style bodies are skipped, so text
 * inside them is never taken for an element. Ends quietly at a comment, a tag or
 * a script or style body that never closes. Shared by the marker reader, the
 * completeness scan (completeness.ts) and the head injection (inject.ts), so they
 * cannot disagree about what is an element.
 */
export function* startTags(html: string): Generator<StartTag, void, undefined> {
  let at = 0;
  for (;;) {
    at = html.indexOf("<", at);
    if (at === -1) return;

    if (html.startsWith("<!--", at)) {
      // From at + 2, so the empty comments `<!-->` and `<!--->` end where a browser ends them.
      const end = html.indexOf("-->", at + 2);
      if (end === -1) return;
      at = end + 3;
      continue;
    }

    TAG_NAME.lastIndex = at;
    const name = TAG_NAME.exec(html);
    if (name === null) {
      at += 1;
      continue;
    }
    const tag = parseAttributes(html, TAG_NAME.lastIndex);
    if (tag === null) return;
    at = tag.end;

    const tagName = (name[1] ?? "").toLowerCase();
    yield { name: tagName, attributes: tag.attributes, end: tag.end };

    const rawTextEnd = RAW_TEXT_END.get(tagName);
    if (rawTextEnd !== undefined) {
      rawTextEnd.lastIndex = at;
      const close = rawTextEnd.exec(html);
      if (close === null) return;
      at = close.index;
    }
  }
}

/** The attributes of the first `<template id="fxav-saved-copy">` element, or null when there is none. */
function findMarkerAttributes(html: string): ReadonlyMap<string, string> | null {
  for (const tag of startTags(html)) {
    if (tag.name === "template" && tag.attributes.get("id") === MARKER_ID) return tag.attributes;
  }
  return null;
}
