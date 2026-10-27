import { describe, expect, test } from "vitest";
import {
  copyAtUrl,
  copyByShow,
  listCopies,
  planBeginSave,
  planCommit,
  planDeleteStatics,
  planEvict,
  planMarkEnded,
  planPurge,
  planRecordStatics,
  planTouchOpened,
  removedCopies,
  type PurgeScope,
  type StoreState,
  type StoredCopy,
} from "@/lib/offline/store";

// The plan functions, called directly. Every expected value is written from a
// spec 4.6 / 4.8 rule, never read back from the module. The same contract runs
// through the async SavedCopyStore API, over both the memory store and the
// IndexedDB adapter, in idbStore.test.ts.
//
// S(U) is the copy whose stored URL is U; C(X) is show X's one copy, wherever
// it was saved.

const SHOW_A = "3f2b8c1e-9d4a-4e6b-8a57-1c2d3e4f5a6b";
const SHOW_B = "9a7c1d20-5b3e-4f18-9c64-0e2b7a8d1f35";

/** Show A's link before a reset, its current link, and show B's link. */
const OLD_LINK = "/show/east-coast/tok-before-reset";
const NEW_LINK = "/show/east-coast/tok-current";
const B_LINK = "/show/rpas/tok-rpas";
const UNRELATED_LINK = "/show/nobody/tok-nobody";

const VIEWER_1 = "q3Xk-9_LmZpRt2VbYw0aGhJ4";
const VIEWER_2 = "Zp0-mN4_rTq8sWx2yB6cDe1F";

function copyOf(
  showId: string,
  url: string,
  viewer: string,
  ordinal: number,
  extra: Partial<StoredCopy> = {},
): StoredCopy {
  return {
    showId,
    url,
    html: `<html data-show="${showId}" data-viewer="${viewer}"></html>`,
    viewer,
    epoch: 3,
    savedAt: "2026-10-27T14:00:00.000Z",
    ordinal,
    assets: [`/api/asset/agenda/${showId}/file-1`],
    statics: ["/_next/static/chunks/main.js", "/fonts/inter.woff2"],
    endedAt: null,
    lastOpenedAt: 1_000,
    ...extra,
  };
}

function stateOf(generation: number, nextOrdinal: number, ...copies: StoredCopy[]): StoreState {
  return { generation, nextOrdinal, copies: new Map(copies.map((c) => [c.showId, c])) };
}

/** Starts a save the way the worker does: capture G and an ordinal from the state. */
function begin(state: StoreState) {
  return planBeginSave(state);
}

describe("planBeginSave", () => {
  test("captures the current generation and the next ordinal, and advances only the ordinal", () => {
    const state = stateOf(4, 7, copyOf(SHOW_A, OLD_LINK, VIEWER_1, 6));
    const { token, next } = planBeginSave(state);

    expect(token).toEqual({ generation: 4, ordinal: 7 });
    expect(next.nextOrdinal).toBe(8);
    expect(next.generation).toBe(4);
    expect(next.copies).toBe(state.copies);
    expect(state.nextOrdinal).toBe(7);
  });

  test("hands out strictly increasing ordinals across consecutive saves", () => {
    const first = planBeginSave(stateOf(0, 0));
    const second = planBeginSave(first.next);
    expect(second.token.ordinal).toBeGreaterThan(first.token.ordinal);
    expect(second.token.generation).toBe(first.token.generation);
  });
});

describe("planCommit", () => {
  test("commits a show's first save, stored under the token's ordinal", () => {
    const state = stateOf(2, 5);
    // The copy's own ordinal field is not the authority; the token is.
    const copy = copyOf(SHOW_A, NEW_LINK, VIEWER_1, 99);
    const { outcome, next } = planCommit(state, { generation: 2, ordinal: 4 }, copy);

    expect(outcome).toBe("committed");
    expect(next.copies.get(SHOW_A)).toEqual({ ...copy, ordinal: 4 });
    expect(next.generation).toBe(2);
    expect(next.nextOrdinal).toBe(5);
    expect(state.copies.size).toBe(0);
  });

  test.each([
    ["an older generation", 1],
    ["a newer generation", 3],
  ])("refuses a token from %s and changes nothing", (_label, generation) => {
    const state = stateOf(2, 5, copyOf(SHOW_A, OLD_LINK, VIEWER_1, 1));
    const { outcome, next } = planCommit(
      state,
      { generation, ordinal: 4 },
      copyOf(SHOW_A, NEW_LINK, VIEWER_2, 4),
    );

    expect(outcome).toBe("stale-generation");
    expect(next).toBe(state);
  });

  test.each([
    ["equal to", 3, "stale-ordinal"],
    ["below", 2, "stale-ordinal"],
    ["above", 4, "committed"],
  ] as const)("a token ordinal %s the stored copy's gives %s", (_label, tokenOrdinal, expected) => {
    const stored = copyOf(SHOW_A, OLD_LINK, VIEWER_1, 3);
    const state = stateOf(0, 9, stored);
    const { outcome, next } = planCommit(
      state,
      { generation: 0, ordinal: tokenOrdinal },
      copyOf(SHOW_A, OLD_LINK, VIEWER_2, tokenOrdinal),
    );

    expect(outcome).toBe(expected);
    expect(next.copies.get(SHOW_A)?.viewer).toBe(expected === "committed" ? VIEWER_2 : VIEWER_1);
    if (expected !== "committed") expect(next).toBe(state);
  });

  test("replaces the show's copy wherever it was saved, and leaves other shows' copies alone", () => {
    const other = copyOf(SHOW_B, B_LINK, VIEWER_1, 2);
    const state = stateOf(0, 9, copyOf(SHOW_A, OLD_LINK, VIEWER_1, 3), other);
    const { outcome, next } = planCommit(
      state,
      { generation: 0, ordinal: 4 },
      copyOf(SHOW_A, NEW_LINK, VIEWER_2, 4),
    );

    expect(outcome).toBe("committed");
    expect(copyAtUrl(next, OLD_LINK)).toBeNull();
    expect(copyAtUrl(next, NEW_LINK)?.viewer).toBe(VIEWER_2);
    expect(next.copies.size).toBe(2);
    expect(next.copies.get(SHOW_B)).toBe(other);
  });

  test("never leaves two copies at one URL: a newer save at an occupied URL displaces the copy there", () => {
    const state = stateOf(0, 9, copyOf(SHOW_A, NEW_LINK, VIEWER_1, 3));
    const { outcome, next } = planCommit(
      state,
      { generation: 0, ordinal: 4 },
      copyOf(SHOW_B, NEW_LINK, VIEWER_2, 4),
    );

    expect(outcome).toBe("committed");
    expect([...next.copies.keys()]).toEqual([SHOW_B]);
    expect(copyAtUrl(next, NEW_LINK)?.showId).toBe(SHOW_B);
  });

  test("an older save at a URL another show's newer copy holds is stale", () => {
    const state = stateOf(0, 9, copyOf(SHOW_A, NEW_LINK, VIEWER_1, 5));
    const { outcome, next } = planCommit(
      state,
      { generation: 0, ordinal: 4 },
      copyOf(SHOW_B, NEW_LINK, VIEWER_2, 4),
    );

    expect(outcome).toBe("stale-ordinal");
    expect(next).toBe(state);
  });
});

describe("planPurge", () => {
  const SCOPES: ReadonlyArray<readonly [string, PurgeScope]> = [
    ["the show holding a copy", { by: "show", showId: SHOW_A }],
    ["a show with no copy", { by: "show", showId: SHOW_B }],
    ["the URL holding a copy", { by: "url", url: OLD_LINK }],
    ["a URL with no copy", { by: "url", url: UNRELATED_LINK }],
    ["everything", { by: "all" }],
  ];

  test.each(SCOPES)(
    "a purge of %s advances the generation by one and leaves the ordinal",
    (_label, scope) => {
      const state = stateOf(6, 11, copyOf(SHOW_A, OLD_LINK, VIEWER_1, 3));
      const next = planPurge(state, scope);

      expect(next.generation).toBe(7);
      expect(next.nextOrdinal).toBe(11);
      expect(state.generation).toBe(6);
      expect(state.copies.has(SHOW_A)).toBe(true);
    },
  );

  test("a show purge removes the show's copy wherever it was saved and keeps other shows'", () => {
    const state = stateOf(
      0,
      9,
      copyOf(SHOW_A, OLD_LINK, VIEWER_1, 3),
      copyOf(SHOW_B, B_LINK, VIEWER_1, 4),
    );
    const next = planPurge(state, { by: "show", showId: SHOW_A });

    expect([...next.copies.keys()]).toEqual([SHOW_B]);
    expect(copyAtUrl(next, OLD_LINK)).toBeNull();
  });

  test("a url purge removes only the copy saved at that URL", () => {
    const state = stateOf(
      0,
      9,
      copyOf(SHOW_A, OLD_LINK, VIEWER_1, 3),
      copyOf(SHOW_B, B_LINK, VIEWER_1, 4),
    );
    const next = planPurge(state, { by: "url", url: OLD_LINK });

    expect([...next.copies.keys()]).toEqual([SHOW_B]);
  });

  test("a url purge at a new link leaves the same show's copy at an older link in place", () => {
    const old = copyOf(SHOW_A, OLD_LINK, VIEWER_1, 3);
    const next = planPurge(stateOf(0, 9, old), { by: "url", url: NEW_LINK });

    expect(copyAtUrl(next, OLD_LINK)).toBe(old);
    expect(copyByShow(next, SHOW_A)).toBe(old);
  });

  test("an all purge removes every copy", () => {
    const state = stateOf(
      0,
      9,
      copyOf(SHOW_A, OLD_LINK, VIEWER_1, 3),
      copyOf(SHOW_B, B_LINK, VIEWER_1, 4),
    );
    expect(planPurge(state, { by: "all" }).copies.size).toBe(0);
  });
});

describe("reads", () => {
  const a = copyOf(SHOW_A, OLD_LINK, VIEWER_1, 3);
  const b = copyOf(SHOW_B, B_LINK, VIEWER_1, 4);

  test("copyAtUrl finds S(U) only at the URL the copy was saved under", () => {
    const state = stateOf(0, 9, a, b);
    expect(copyAtUrl(state, OLD_LINK)).toBe(a);
    expect(copyAtUrl(state, B_LINK)).toBe(b);
    expect(copyAtUrl(state, NEW_LINK)).toBeNull();
  });

  test("copyByShow finds C(X) wherever it was saved", () => {
    const state = stateOf(0, 9, a);
    expect(copyByShow(state, SHOW_A)).toBe(a);
    expect(copyByShow(state, SHOW_B)).toBeNull();
  });

  test("listCopies returns every copy ordered by show id, not by insertion", () => {
    // B is inserted first; A's id sorts first.
    expect(listCopies(stateOf(0, 9, b, a))).toEqual([a, b]);
    expect(listCopies(stateOf(0, 9))).toEqual([]);
  });

  test("removedCopies names the copies one state has and the next does not, ordered by show id", () => {
    const before = stateOf(0, 9, b, a);
    expect(removedCopies(before, planPurge(before, { by: "all" }))).toEqual([a, b]);
    expect(removedCopies(before, planPurge(before, { by: "show", showId: SHOW_B }))).toEqual([b]);
    expect(removedCopies(before, planPurge(before, { by: "url", url: UNRELATED_LINK }))).toEqual(
      [],
    );
  });
});

describe("the ordering rule across purges (spec 4.6)", () => {
  const PURGES: ReadonlyArray<readonly [string, PurgeScope]> = [
    ["of the same show", { by: "show", showId: SHOW_A }],
    ["of another show", { by: "show", showId: SHOW_B }],
    ["of the copy's URL", { by: "url", url: OLD_LINK }],
    ["of a URL with no copy", { by: "url", url: UNRELATED_LINK }],
    ["of everything", { by: "all" }],
  ];

  test.each(PURGES)(
    "a first save begun before a purge %s never commits after it",
    (_label, scope) => {
      const { token, next } = begin(stateOf(0, 0));
      const purged = planPurge(next, scope);
      const { outcome, next: after } = planCommit(
        purged,
        token,
        copyOf(SHOW_A, NEW_LINK, VIEWER_2, token.ordinal),
      );

      expect(outcome).toBe("stale-generation");
      expect(after.copies.size).toBe(0);
    },
  );

  test.each(PURGES)(
    "a replacement save begun before a purge %s never commits after it",
    (_label, scope) => {
      const prior = copyOf(SHOW_A, OLD_LINK, VIEWER_1, 0);
      const { token, next } = begin(stateOf(0, 1, prior));
      const purged = planPurge(next, scope);
      const { outcome, next: after } = planCommit(
        purged,
        token,
        copyOf(SHOW_A, NEW_LINK, VIEWER_2, token.ordinal),
      );

      expect(outcome).toBe("stale-generation");
      // Whatever the purge left is what stays: the new viewer's page never lands.
      expect(after.copies).toBe(purged.copies);
      expect(copyByShow(after, SHOW_A)?.viewer ?? null).not.toBe(VIEWER_2);
    },
  );

  test("a save begun after a purge commits (the voided save is simply retried)", () => {
    const voided = begin(stateOf(0, 0));
    const purged = planPurge(voided.next, { by: "show", showId: SHOW_A });
    const retried = begin(purged);
    const { outcome, next } = planCommit(
      retried.next,
      retried.token,
      copyOf(SHOW_B, B_LINK, VIEWER_1, retried.token.ordinal),
    );

    expect(
      planCommit(purged, voided.token, copyOf(SHOW_B, B_LINK, VIEWER_1, voided.token.ordinal))
        .outcome,
    ).toBe("stale-generation");
    expect(outcome).toBe("committed");
    expect(copyByShow(next, SHOW_B)?.viewer).toBe(VIEWER_1);
  });

  test.each([
    ["the newer save finishes last", "newer-last"],
    ["the older save finishes last", "older-last"],
  ] as const)("two saves of one show keep the newer one when %s", (_label, order) => {
    const first = begin(stateOf(0, 0));
    const second = begin(first.next);
    const older = copyOf(SHOW_A, NEW_LINK, VIEWER_1, first.token.ordinal);
    const newer = copyOf(SHOW_A, NEW_LINK, VIEWER_2, second.token.ordinal);

    let state = second.next;
    const outcomes: string[] = [];
    const steps =
      order === "newer-last"
        ? ([
            [first.token, older],
            [second.token, newer],
          ] as const)
        : ([
            [second.token, newer],
            [first.token, older],
          ] as const);
    for (const [token, copy] of steps) {
      const result = planCommit(state, token, copy);
      outcomes.push(result.outcome);
      state = result.next;
    }

    expect(outcomes).toEqual(
      order === "newer-last" ? ["committed", "committed"] : ["committed", "stale-ordinal"],
    );
    expect(copyByShow(state, SHOW_A)?.viewer).toBe(VIEWER_2);
  });

  // The identity transitions of the spec 4.6 bracket table: a purge before the
  // transition starts, a save that starts with the old cookies, a purge after
  // the transition completes, then the save tries to commit.
  const BRACKETS: ReadonlyArray<readonly [string, PurgeScope]> = [
    ['"Not you? Switch person"', { by: "show", showId: SHOW_A }],
    ["/me sign-out", { by: "all" }],
    ["Google sign-in completing", { by: "all" }],
  ];
  const PRIORS: ReadonlyArray<readonly [string, StoredCopy[]]> = [
    ["the show's first save", []],
    ["a show with a previous viewer's copy", [copyOf(SHOW_A, OLD_LINK, VIEWER_1, 0)]],
  ];

  for (const [transition, scope] of BRACKETS) {
    test.each(PRIORS)(
      `the ${transition} bracket refuses a save that starts inside it, for %s`,
      (_label, prior) => {
        const firstPurge = planPurge(stateOf(0, 1, ...prior), scope);
        const { token, next } = begin(firstPurge);
        const secondPurge = planPurge(next, scope);
        const { outcome, next: after } = planCommit(
          secondPurge,
          token,
          copyOf(SHOW_A, NEW_LINK, VIEWER_1, token.ordinal),
        );

        expect(outcome).toBe("stale-generation");
        expect(copyByShow(after, SHOW_A)).toBeNull();
      },
    );
  }

  test("a url purge at a new link (the picker bootstrap) keeps the old-link copy but still voids an in-flight save", () => {
    const old = copyOf(SHOW_A, OLD_LINK, VIEWER_1, 0);
    const inFlight = begin(stateOf(0, 1, old));
    const purged = planPurge(inFlight.next, { by: "url", url: NEW_LINK });

    expect(copyAtUrl(purged, OLD_LINK)).toBe(old);
    expect(
      planCommit(purged, inFlight.token, copyOf(SHOW_A, NEW_LINK, VIEWER_2, inFlight.token.ordinal))
        .outcome,
    ).toBe("stale-generation");
  });
});

describe("non-identity updates (spec 4.4 step 1, 4.8)", () => {
  const stored = copyOf(SHOW_A, OLD_LINK, VIEWER_1, 3);
  const ref = { showId: SHOW_A, ordinal: 3 };
  /** The ref a caller would still hold after the show's copy was replaced by a newer save. */
  const staleRef = { showId: SHOW_A, ordinal: 2 };

  test("planMarkEnded marks the referenced copy once and reports only the transition", () => {
    const state = stateOf(5, 9, stored);
    const first = planMarkEnded(state, ref, 42_000);

    expect(first.marked).toBe(true);
    expect(copyByShow(first.next, SHOW_A)).toEqual({ ...stored, endedAt: 42_000 });
    expect(first.next.generation).toBe(5);

    const again = planMarkEnded(first.next, ref, 99_000);
    expect(again.marked).toBe(false);
    expect(again.next).toBe(first.next);
  });

  test.each([
    ["a copy replaced since it was read", stateOf(5, 9, stored), staleRef],
    ["a show with no copy", stateOf(5, 9), ref],
  ])("planMarkEnded leaves %s alone", (_label, state, target) => {
    const result = planMarkEnded(state, target, 42_000);
    expect(result.marked).toBe(false);
    expect(result.next).toBe(state);
  });

  test("planTouchOpened updates the referenced copy's lastOpenedAt and nothing else", () => {
    const state = stateOf(5, 9, stored);
    const next = planTouchOpened(state, ref, 7_000);

    expect(copyByShow(next, SHOW_A)).toEqual({ ...stored, lastOpenedAt: 7_000 });
    expect(next.generation).toBe(5);
    expect(next.nextOrdinal).toBe(9);
    expect(planTouchOpened(state, staleRef, 7_000)).toBe(state);
  });

  test("planEvict removes the referenced copy without advancing the generation", () => {
    const other = copyOf(SHOW_B, B_LINK, VIEWER_1, 4);
    const inFlight = begin(stateOf(5, 9, stored, other));
    const { evicted, next } = planEvict(inFlight.next, ref);

    expect(evicted).toBe(stored);
    expect([...next.copies.keys()]).toEqual([SHOW_B]);
    expect(next.generation).toBe(5);
    // Eviction is not an identity event: a save begun before it still commits.
    const commit = planCommit(
      next,
      inFlight.token,
      copyOf(SHOW_B, B_LINK, VIEWER_2, inFlight.token.ordinal),
    );
    expect(commit.outcome).toBe("committed");
    // Positive control: a purge in the same position voids it.
    expect(
      planCommit(
        planPurge(inFlight.next, { by: "url", url: UNRELATED_LINK }),
        inFlight.token,
        copyOf(SHOW_B, B_LINK, VIEWER_2, 9),
      ).outcome,
    ).toBe("stale-generation");
  });

  test("planEvict leaves a copy replaced since it was read", () => {
    const state = stateOf(5, 9, stored);
    const result = planEvict(state, staleRef);
    expect(result.evicted).toBeNull();
    expect(result.next).toBe(state);
  });
});

describe("the static index (spec 4.8)", () => {
  test("planRecordStatics stores each URL with the time it was stored, replacing an earlier time", () => {
    const index = new Map([["/_next/static/a.js", 100]]);
    const next = planRecordStatics(index, ["/_next/static/a.js", "/fonts/inter.woff2"], 500);

    expect(next).toEqual(
      new Map([
        ["/_next/static/a.js", 500],
        ["/fonts/inter.woff2", 500],
      ]),
    );
    expect(index.get("/_next/static/a.js")).toBe(100);
  });

  test("planDeleteStatics removes the named URLs and ignores unknown ones", () => {
    const index = new Map([
      ["/_next/static/a.js", 100],
      ["/fonts/inter.woff2", 200],
    ]);
    const next = planDeleteStatics(index, ["/_next/static/a.js", "/_next/static/never.js"]);

    expect(next).toEqual(new Map([["/fonts/inter.woff2", 200]]));
    expect(index.size).toBe(2);
  });
});
