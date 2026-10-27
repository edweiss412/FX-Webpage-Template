import { describe, expect, test } from "vitest";
import { premise } from "@/tests/_shared/premise";
import type { Marker, MarkerRead } from "@/lib/offline/marker";
import type { StoredCopy } from "@/lib/offline/store";
import {
  CONTINUATION_MS,
  NAV_BUDGET_MS,
  STATUS_TIMEOUT_MS,
  decideCheckOutcome,
  decideEndedFetch,
  decideEndedStep1,
  decideNoResponse,
  decideStep3,
  type CheckDecision,
  type CompleteResponse,
  type EndedFetch,
  type EndedStep1,
  type FetchResult,
  type NoResponseDecision,
  type NoResponseReason,
  type SavedView,
  type StatusOutcome,
  type Step3,
} from "@/lib/offline/navigation";

// Every expected value below is written from a spec 4.4 row, never read back
// from the module. S(U) is the copy whose stored URL is the request path U;
// C(X) is show X's one copy, wherever it was saved.

/** The request path U, an older link of the same show (before a reset), and another show's link. */
const U = "/show/east-coast/tok-current";
const OLD_LINK = "/show/east-coast/tok-before-reset";
const OTHER_LINK = "/show/rpas/tok-rpas";

const SHOW = "3f2b8c1e-9d4a-4e6b-8a57-1c2d3e4f5a6b";
const OTHER_SHOW = "9a7c1d20-5b3e-4f18-9c64-0e2b7a8d1f35";
const VIEWER = "q3Xk-9_LmZpRt2VbYw0aGhJ4";
const OTHER_VIEWER = "Zp0-mN4_rTq8sWx2yB6cDe1F";

function copy(showId: string, url: string, viewer: string): StoredCopy {
  return {
    showId,
    url,
    html: `<html><body>${showId} saved at ${url}</body></html>`,
    viewer,
    epoch: 3,
    savedAt: "2026-10-26T15:00:00.000Z",
    ordinal: 1,
    assets: [],
    statics: [],
    endedAt: null,
    lastOpenedAt: 0,
  };
}

/** The store as a navigation to `url` sees it: S(U) by stored URL, C(X) by show. */
function view(url: string, ...copies: StoredCopy[]): SavedView {
  const shows = new Set(copies.map((c) => c.showId));
  const urls = new Set(copies.map((c) => c.url));
  if (shows.size !== copies.length || urls.size !== copies.length) {
    throw new Error("fixture: the store holds one copy per show and at most one copy per URL");
  }
  return {
    atUrl: copies.find((c) => c.url === url) ?? null,
    byShow: new Map(copies.map((c) => [c.showId, c])),
  };
}

/** This viewer's copy of the show, saved at U. */
const MINE_AT_U = copy(SHOW, U, VIEWER);
/** A different viewer's copy of the show, saved at U. */
const THEIRS_AT_U = copy(SHOW, U, OTHER_VIEWER);
/** This viewer's copy of the show, saved under the older link. */
const MINE_AT_OLD = copy(SHOW, OLD_LINK, VIEWER);
/** A different viewer's copy of the show, saved under the older link. */
const THEIRS_AT_OLD = copy(SHOW, OLD_LINK, OTHER_VIEWER);
/** Another show's copy stored at U, carrying the same viewer string as the marker. */
const OTHER_SHOW_AT_U = copy(OTHER_SHOW, U, VIEWER);
/** Another show's copy at its own link. */
const OTHER_SHOW_ELSEWHERE = copy(OTHER_SHOW, OTHER_LINK, OTHER_VIEWER);

// Marker readings, written out: these tables decide on the reading, not on HTML.
const valid = (marker: Marker): MarkerRead => ({ kind: "valid", marker });
const save = (showId: string, viewer: string): MarkerRead =>
  valid({
    disposition: "save",
    showId,
    renderedAt: "2026-10-27T06:03:26.123Z",
    epoch: 4,
    viewer,
    assets: [],
  });
const keep = (showId: string, viewer: string): MarkerRead =>
  valid({ disposition: "keep", showId, viewer });
const hold = (showId: string | null): MarkerRead => valid({ disposition: "hold", showId });
const check = (showId: string | null): MarkerRead => valid({ disposition: "check", showId });
const purge = (showId: string | null): MarkerRead => valid({ disposition: "purge", showId });
const invalid = (showId: string | null): MarkerRead => ({ kind: "invalid", showId });
const ABSENT: MarkerRead = { kind: "absent" };

const page = (marker: MarkerRead, status = 200): CompleteResponse => ({
  kind: "body",
  status,
  marker,
});
const REDIRECT: CompleteResponse = { kind: "opaque-redirect" };

const NETWORK_COMMIT: Step3 = { serve: "network", then: "commit" };
const NETWORK_NONE: Step3 = { serve: "network", then: "none" };
const SAVED_SERVER_ERROR: Step3 = { serve: "saved", mode: "server-error" };
const ASK_STATUS: Step3 = { serve: "ask-status" };
const purgeShow = (showId: string): Step3 => ({
  serve: "network",
  then: "purge",
  scope: { by: "show", showId },
});
const purgeUrl = (url: string): Step3 => ({
  serve: "network",
  then: "purge",
  scope: { by: "url", url },
});

test("the budgets are the spec's: 8 s to complete, 60 s of continuation, 5 s for the status route", () => {
  expect(NAV_BUDGET_MS).toBe(8_000);
  expect(CONTINUATION_MS).toBe(60_000);
  expect(STATUS_TIMEOUT_MS).toBe(5_000);
});

type Step3Row = {
  name: string;
  url?: string;
  response: CompleteResponse;
  saved: SavedView;
  expected: Step3;
};

describe("step 3: a complete response in time", () => {
  const rows: Step3Row[] = [
    // save | either | the network response | commit as the copy of the marker's show
    {
      name: "save, nothing stored: serve the network response and commit it",
      response: page(save(SHOW, VIEWER)),
      saved: view(U),
      expected: NETWORK_COMMIT,
    },
    {
      name: "save, S(U) is this viewer's copy: commit the fresh page over it",
      response: page(save(SHOW, VIEWER)),
      saved: view(U, MINE_AT_U),
      expected: NETWORK_COMMIT,
    },
    {
      name: "save, C(show) is a different viewer's copy under the older link: commit, replacing it",
      response: page(save(SHOW, VIEWER)),
      saved: view(U, THEIRS_AT_OLD),
      expected: NETWORK_COMMIT,
    },
    {
      name: "save, S(U) holds another show's copy: commit",
      response: page(save(SHOW, VIEWER)),
      saved: view(U, OTHER_SHOW_AT_U),
      expected: NETWORK_COMMIT,
    },

    // keep | yes, for the marker's show and viewer | S(U) in server-error mode | none
    {
      name: "keep, S(U) is the marker's show and viewer: serve S(U) in server-error mode",
      response: page(keep(SHOW, VIEWER)),
      saved: view(U, MINE_AT_U),
      expected: SAVED_SERVER_ERROR,
    },
    {
      name: "keep, S(U) is the marker's show and viewer, another show stored elsewhere: still S(U)",
      response: page(keep(SHOW, VIEWER)),
      saved: view(U, MINE_AT_U, OTHER_SHOW_ELSEWHERE),
      expected: SAVED_SERVER_ERROR,
    },

    // keep | C(show) exists, at U or any other link, for a different viewer | network | purge C(show)
    {
      name: "keep, C(show) is at U for a different viewer: serve the network response, purge the show",
      response: page(keep(SHOW, VIEWER)),
      saved: view(U, THEIRS_AT_U),
      expected: purgeShow(SHOW),
    },
    {
      name: "keep, C(show) is under the older link for a different viewer: purge the show",
      response: page(keep(SHOW, VIEWER)),
      saved: view(U, THEIRS_AT_OLD),
      expected: purgeShow(SHOW),
    },
    {
      name: "keep, C(show) is under the older link for a different viewer while S(U) holds another show: purge the marker's show",
      response: page(keep(SHOW, VIEWER)),
      saved: view(U, OTHER_SHOW_AT_U, THEIRS_AT_OLD),
      expected: purgeShow(SHOW),
    },

    // keep | otherwise | the network response | none
    {
      name: "keep, no copy of the show anywhere: serve the network response",
      response: page(keep(SHOW, VIEWER)),
      saved: view(U),
      expected: NETWORK_NONE,
    },
    {
      name: "keep, no copy of the show, another show's copy elsewhere: serve the network response",
      response: page(keep(SHOW, VIEWER)),
      saved: view(U, OTHER_SHOW_ELSEWHERE),
      expected: NETWORK_NONE,
    },
    {
      name: "keep, S(U) holds another show's copy with the marker's viewer string: not served, nothing purged",
      response: page(keep(SHOW, VIEWER)),
      saved: view(U, OTHER_SHOW_AT_U),
      expected: NETWORK_NONE,
    },
    {
      name: "keep, this viewer's copy lives under the older link only: not served at U, not purged",
      response: page(keep(SHOW, VIEWER)),
      saved: view(U, MINE_AT_OLD),
      expected: NETWORK_NONE,
    },
    {
      name: "keep, S(U) holds another show and this viewer's copy lives under the older link: network, nothing purged",
      response: page(keep(SHOW, VIEWER)),
      saved: view(U, OTHER_SHOW_AT_U, MINE_AT_OLD),
      expected: NETWORK_NONE,
    },

    // hold | either | the network response | none
    {
      name: "hold, S(U) exists: serve the network response",
      response: page(hold(SHOW)),
      saved: view(U, MINE_AT_U),
      expected: NETWORK_NONE,
    },
    {
      name: "hold, nothing stored: serve the network response",
      response: page(hold(null)),
      saved: view(U),
      expected: NETWORK_NONE,
    },
    {
      name: "hold, C(show) is a different viewer's copy under the older link: nothing purged",
      response: page(hold(SHOW)),
      saved: view(U, THEIRS_AT_OLD),
      expected: NETWORK_NONE,
    },
    {
      name: "hold at status 500 (the route's error.tsx), S(U) exists: the marker decides, network",
      response: page(hold(null), 500),
      saved: view(U, MINE_AT_U),
      expected: NETWORK_NONE,
    },

    // check | yes | ask the status route ; check | no | the network response | none
    {
      name: "check, S(U) exists: ask the status route",
      response: page(check(null), 404),
      saved: view(U, MINE_AT_U),
      expected: ASK_STATUS,
    },
    {
      name: "check, nothing stored: serve the network response",
      response: page(check(null), 404),
      saved: view(U),
      expected: NETWORK_NONE,
    },
    {
      name: "check, the show's copy lives under another link only: serve the network response",
      response: page(check(null), 404),
      saved: view(U, MINE_AT_OLD),
      expected: NETWORK_NONE,
    },

    // purge | either | the network response | purge C(show) when the marker names a show; otherwise S(U)
    {
      name: "purge naming the show, S(U) is its copy: purge the show",
      response: page(purge(SHOW)),
      saved: view(U, MINE_AT_U),
      expected: purgeShow(SHOW),
    },
    {
      name: "purge naming the show, its copy lives under the older link: purge the show",
      response: page(purge(SHOW)),
      saved: view(U, MINE_AT_OLD),
      expected: purgeShow(SHOW),
    },
    {
      name: "purge naming the show, no copy of it anywhere: the purge still runs",
      response: page(purge(SHOW)),
      saved: view(U),
      expected: purgeShow(SHOW),
    },
    {
      name: "purge naming the show while S(U) holds another show: purge the named show",
      response: page(purge(SHOW)),
      saved: view(U, OTHER_SHOW_AT_U),
      expected: purgeShow(SHOW),
    },
    {
      name: "purge with no show, S(U) exists: purge the copy at U",
      response: page(purge(null)),
      saved: view(U, MINE_AT_U),
      expected: purgeUrl(U),
    },
    {
      name: "purge with no show, nothing at U: the purge of U still runs",
      response: page(purge(null)),
      saved: view(U, MINE_AT_OLD),
      expected: purgeUrl(U),
    },
    {
      name: "purge with no show on a navigation to the older link: purge that link",
      url: OLD_LINK,
      response: page(purge(null)),
      saved: view(OLD_LINK, MINE_AT_OLD),
      expected: purgeUrl(OLD_LINK),
    },
    {
      name: "purge naming the show at status 500: the marker decides, purge the show",
      response: page(purge(SHOW), 500),
      saved: view(U, MINE_AT_U),
      expected: purgeShow(SHOW),
    },

    // treated as purge: an invalid marker
    {
      name: "invalid marker with a show id: purge the show",
      response: page(invalid(SHOW)),
      saved: view(U, MINE_AT_OLD),
      expected: purgeShow(SHOW),
    },
    {
      name: "invalid marker with a show id while S(U) holds another show: purge the named show",
      response: page(invalid(SHOW)),
      saved: view(U, OTHER_SHOW_AT_U),
      expected: purgeShow(SHOW),
    },
    {
      name: "invalid marker with no show id: purge the copy at U",
      response: page(invalid(null)),
      saved: view(U, MINE_AT_U),
      expected: purgeUrl(U),
    },
    {
      name: "invalid marker at status 503: a marker is present, so it is purge, not a platform error",
      response: page(invalid(SHOW), 503),
      saved: view(U, MINE_AT_U),
      expected: purgeShow(SHOW),
    },

    // treated as purge: no marker, status below 500
    {
      name: "no marker at status 200 (a streamed redirect()), S(U) exists: purge the copy at U",
      response: page(ABSENT, 200),
      saved: view(U, MINE_AT_U),
      expected: purgeUrl(U),
    },
    {
      name: "no marker at status 200, the show's copy lives under the older link: purge U only",
      response: page(ABSENT, 200),
      saved: view(U, MINE_AT_OLD),
      expected: purgeUrl(U),
    },
    {
      name: "no marker at status 499: purge the copy at U",
      response: page(ABSENT, 499),
      saved: view(U, MINE_AT_U),
      expected: purgeUrl(U),
    },

    // no marker, status 500 or above: S(U) in server-error mode when it exists (Q2: any content type)
    {
      name: "no marker at status 500, S(U) exists: serve S(U) in server-error mode",
      response: page(ABSENT, 500),
      saved: view(U, MINE_AT_U),
      expected: SAVED_SERVER_ERROR,
    },
    {
      name: "no marker at status 503, S(U) is a different viewer's copy: serve S(U) in server-error mode",
      response: page(ABSENT, 503),
      saved: view(U, THEIRS_AT_U),
      expected: SAVED_SERVER_ERROR,
    },
    {
      name: "no marker at status 500, nothing stored: serve the network response",
      response: page(ABSENT, 500),
      saved: view(U),
      expected: NETWORK_NONE,
    },
    {
      name: "no marker at status 502, the show's copy lives under the older link: network, nothing purged",
      response: page(ABSENT, 502),
      saved: view(U, MINE_AT_OLD),
      expected: NETWORK_NONE,
    },

    // an opaque redirect is served and changes nothing
    {
      name: "opaque redirect, S(U) exists: serve it, change nothing",
      response: REDIRECT,
      saved: view(U, MINE_AT_U),
      expected: NETWORK_NONE,
    },
    {
      name: "opaque redirect, nothing stored: serve it, change nothing",
      response: REDIRECT,
      saved: view(U),
      expected: NETWORK_NONE,
    },
  ];

  test.each(rows)("$name", ({ url = U, response, saved, expected }) => {
    expect(decideStep3(url, response, saved)).toStrictEqual(expected);
  });
});

describe("serving uses S(U), purging uses C(X): a sweep over every marker and store layout", () => {
  const readings: MarkerRead[] = [
    save(SHOW, VIEWER),
    save(SHOW, OTHER_VIEWER),
    keep(SHOW, VIEWER),
    keep(SHOW, OTHER_VIEWER),
    keep(OTHER_SHOW, VIEWER),
    hold(SHOW),
    hold(null),
    check(null),
    purge(SHOW),
    purge(OTHER_SHOW),
    purge(null),
    invalid(SHOW),
    invalid(null),
    ABSENT,
  ];
  const responses: CompleteResponse[] = [
    REDIRECT,
    ...readings.flatMap((reading) => [200, 404, 499, 500, 503].map((s) => page(reading, s))),
  ];
  const layouts: SavedView[] = [
    view(U),
    view(U, MINE_AT_U),
    view(U, THEIRS_AT_U),
    view(U, MINE_AT_OLD),
    view(U, THEIRS_AT_OLD),
    view(U, OTHER_SHOW_AT_U),
    view(U, OTHER_SHOW_ELSEWHERE),
    view(U, OTHER_SHOW_AT_U, MINE_AT_OLD),
    view(U, OTHER_SHOW_AT_U, THEIRS_AT_OLD),
    view(U, MINE_AT_U, OTHER_SHOW_ELSEWHERE),
  ];

  const namedShow = (reading: MarkerRead): string | null =>
    reading.kind === "valid"
      ? reading.marker.showId
      : reading.kind === "invalid"
        ? reading.showId
        : null;

  test("a copy is served or checked only when it is S(U); a keep serves it only for its show and viewer; a show purge names the marker's show", () => {
    // The tempting collapse: no S(U), but C(marker's show) holds the marker's own viewer elsewhere.
    let collapseCases = 0;
    let servedSaved = 0;
    let showPurges = 0;
    for (const response of responses) {
      for (const saved of layouts) {
        const reading = response.kind === "body" ? response.marker : null;
        const keepMarker =
          reading?.kind === "valid" && reading.marker.disposition === "keep"
            ? reading.marker
            : null;
        if (
          keepMarker !== null &&
          saved.atUrl === null &&
          saved.byShow.get(keepMarker.showId)?.viewer === keepMarker.viewer
        ) {
          collapseCases += 1;
        }

        const decision = decideStep3(U, response, saved);
        if (decision.serve === "saved" || decision.serve === "ask-status") {
          servedSaved += 1;
          expect(saved.atUrl).not.toBeNull();
        }
        if (decision.serve === "saved" && keepMarker !== null) {
          expect(saved.atUrl?.showId).toBe(keepMarker.showId);
          expect(saved.atUrl?.viewer).toBe(keepMarker.viewer);
        }
        if (decision.serve === "network" && decision.then === "purge") {
          if (decision.scope.by === "show") {
            showPurges += 1;
            expect(reading).not.toBeNull();
            expect(decision.scope.showId).toBe(reading === null ? null : namedShow(reading));
          } else {
            expect(decision.scope).toStrictEqual({ by: "url", url: U });
          }
        }
      }
    }
    premise(
      "layouts where a keep's show and viewer match a copy at another link only",
      collapseCases,
      0,
    );
    premise("decisions that serve or check a saved copy", servedSaved, 0);
    premise("decisions that purge by show", showPurges, 0);
  });

  test("with no response, a copy is served only when it is S(U)", () => {
    let servedSaved = 0;
    let elsewhereOnly = 0;
    for (const reason of ["network-error", "timeout"] as const) {
      for (const saved of layouts) {
        if (saved.atUrl === null && saved.byShow.size > 0) elsewhereOnly += 1;
        const decision = decideNoResponse(reason, saved);
        if (decision.serve === "saved") {
          servedSaved += 1;
          expect(saved.atUrl).not.toBeNull();
        }
      }
    }
    premise("layouts with copies stored, none at U", elsewhereOnly, 0);
    premise("decisions that serve a saved copy", servedSaved, 0);
  });
});

describe("check marker, after the status route answers", () => {
  const expected: Record<StatusOutcome, CheckDecision> = {
    ended: { serve: "saved", mode: "ended", then: "mark-ended" },
    gone: { serve: "network", then: "purge", scope: { by: "show", showId: SHOW } },
    "no-verdict": { serve: "network", then: "none" },
    "no-answer": { serve: "network", then: "none" },
  };

  test.each(Object.entries(expected) as [StatusOutcome, CheckDecision][])(
    "%s",
    (outcome, decision) => {
      expect(decideCheckOutcome(outcome, MINE_AT_U)).toStrictEqual(decision);
    },
  );

  test("gone purges the show of the copy that was checked", () => {
    const otherAtU = copy(OTHER_SHOW, U, OTHER_VIEWER);
    expect(decideCheckOutcome("gone", otherAtU)).toStrictEqual({
      serve: "network",
      then: "purge",
      scope: { by: "show", showId: OTHER_SHOW },
    });
  });
});

describe("step 1: S(U) is marked ended", () => {
  const ENDED_AT_U: StoredCopy = { ...MINE_AT_U, endedAt: Date.parse("2026-10-27T02:00:00.000Z") };

  const expected: Record<StatusOutcome, EndedStep1> = {
    ended: { next: "serve-saved", mode: "ended" },
    gone: { next: "step-2", purge: { by: "show", showId: SHOW } },
    "no-answer": { next: "serve-saved", mode: "ended" },
    "no-verdict": { next: "fetch-keep" },
  };

  test.each(Object.entries(expected) as [StatusOutcome, EndedStep1][])(
    "%s",
    (outcome, decision) => {
      expect(decideEndedStep1(outcome, ENDED_AT_U)).toStrictEqual(decision);
    },
  );

  test("gone purges the show of the ended copy before step 2", () => {
    const otherEnded: StoredCopy = { ...copy(OTHER_SHOW, U, OTHER_VIEWER), endedAt: 1 };
    expect(decideEndedStep1("gone", otherEnded)).toStrictEqual({
      next: "step-2",
      purge: { by: "show", showId: OTHER_SHOW },
    });
  });
});

describe("step 1 server error: the page fetch under the step 2 budget, S(U) kept", () => {
  const AS_IS: EndedFetch = { serve: "network", then: "none" };
  const ENDED: EndedFetch = { serve: "saved", mode: "ended" };
  const complete = (response: CompleteResponse): FetchResult => ({ kind: "complete", response });
  const none = (reason: NoResponseReason): FetchResult => ({ kind: "no-response", reason });

  const rows: { name: string; result: FetchResult; expected: EndedFetch }[] = [
    {
      name: "a check marker changes nothing",
      result: complete(page(check(null), 404)),
      expected: AS_IS,
    },
    {
      name: "a purge marker naming the show changes nothing",
      result: complete(page(purge(SHOW))),
      expected: AS_IS,
    },
    {
      name: "a purge marker with no show changes nothing",
      result: complete(page(purge(null))),
      expected: AS_IS,
    },
    {
      name: "an invalid marker changes nothing",
      result: complete(page(invalid(SHOW))),
      expected: AS_IS,
    },
    {
      name: "a save marker is served, not committed",
      result: complete(page(save(SHOW, VIEWER))),
      expected: AS_IS,
    },
    {
      name: "a keep marker is served as is",
      result: complete(page(keep(SHOW, VIEWER))),
      expected: AS_IS,
    },
    {
      name: "a hold marker is served as is",
      result: complete(page(hold(null), 500)),
      expected: AS_IS,
    },
    {
      name: "no marker at status 200 is served as is",
      result: complete(page(ABSENT)),
      expected: AS_IS,
    },
    {
      name: "no marker at status 503 is served as is",
      result: complete(page(ABSENT, 503)),
      expected: AS_IS,
    },
    { name: "an opaque redirect is served as is", result: complete(REDIRECT), expected: AS_IS },
    {
      name: "a network error serves S(U) in ended mode",
      result: none("network-error"),
      expected: ENDED,
    },
    { name: "a timeout serves S(U) in ended mode", result: none("timeout"), expected: ENDED },
  ];

  test.each(rows)("$name", ({ result, expected }) => {
    expect(decideEndedFetch(result)).toStrictEqual(expected);
  });
});

describe("steps 4 and 5: no complete response", () => {
  const rows: {
    name: string;
    reason: NoResponseReason;
    saved: SavedView;
    expected: NoResponseDecision;
  }[] = [
    {
      name: "network error, S(U) exists: serve it in offline mode",
      reason: "network-error",
      saved: view(U, MINE_AT_U),
      expected: { serve: "saved", mode: "offline" },
    },
    {
      name: "network error, nothing stored: the not-saved page",
      reason: "network-error",
      saved: view(U),
      expected: { serve: "not-saved" },
    },
    {
      name: "network error, the show's copy lives under the older link: the not-saved page",
      reason: "network-error",
      saved: view(U, MINE_AT_OLD),
      expected: { serve: "not-saved" },
    },
    {
      name: "8 s pass, S(U) exists: serve it in slow mode and let the fetch run on for 60 s",
      reason: "timeout",
      saved: view(U, MINE_AT_U),
      expected: { serve: "saved", mode: "slow", continueForMs: 60_000 },
    },
    {
      name: "8 s pass, nothing stored: keep waiting for the network",
      reason: "timeout",
      saved: view(U),
      expected: { serve: "wait" },
    },
    {
      name: "8 s pass, the show's copy lives under the older link: keep waiting",
      reason: "timeout",
      saved: view(U, MINE_AT_OLD),
      expected: { serve: "wait" },
    },
  ];

  test.each(rows)("$name", ({ reason, saved, expected }) => {
    expect(decideNoResponse(reason, saved)).toStrictEqual(expected);
  });
});

describe("shared decisions cannot be changed by a caller", () => {
  // Several rows return one shared object. A caller that wrote to it would change
  // the answer every later navigation gets, so the shared objects are frozen.
  const hold: CompleteResponse = {
    kind: "body",
    status: 200,
    marker: { kind: "valid", marker: { disposition: "hold", showId: null } },
  };
  const platformError: CompleteResponse = { kind: "body", status: 502, marker: { kind: "absent" } };

  test.each([
    ["the network-and-nothing-else row", () => decideStep3(U, hold, view(U))],
    ["the server-error row", () => decideStep3(U, platformError, view(U, MINE_AT_U))],
  ])("%s is frozen", (_label, decide) => {
    const first = decide();
    expect(Object.isFrozen(first)).toBe(true);
    expect(() => {
      (first as { serve: string }).serve = "saved";
    }).toThrow(TypeError);
    expect(decide()).toStrictEqual(first);
  });
});
