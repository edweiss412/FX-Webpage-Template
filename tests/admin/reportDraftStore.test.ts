// @vitest-environment jsdom
/**
 * tests/admin/reportDraftStore.test.ts
 *
 * The direct suite for `lib/admin/reportDraftStore.ts`, and the deciding suite
 * for its source-mutation row. It exists because four rounds of cross-model
 * review could not close one axis by argument: "could a test be weaker than it
 * reads". Seven of that arc's fourteen findings were that class, and the last
 * of them landed in a test written the round before to close the same class.
 * A mutation score over a closed operator set is the same claim made decidable,
 * so these assertions are written to KILL mutants, not to describe behaviour.
 *
 * Anti-tautology throughout: every expectation is derived from the exported cap
 * or from the fixture, never restated as a literal, and every boundary is
 * asserted on BOTH sides so an off-by-one has nowhere to hide.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  capDraft,
  clearStoredDraftIfUnchanged,
  readStoredDraft,
  REPORT_MESSAGE_MAX_CHARS,
  reportDraftStorageKey,
  writeStoredDraft,
} from "@/lib/admin/reportDraftStore";

const KEY = "k";

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

/** Distinct characters, so truncation cannot be confused with filler. */
function distinct(n: number): string {
  return Array.from({ length: n }, (_, i) => String.fromCharCode(97 + (i % 26))).join("");
}

describe("reportDraftStorageKey", () => {
  test("scopes by BOTH segments, and neither alone", () => {
    const a = reportDraftStorageKey("s1", "f1");
    expect(a).toBe("fxav-report-draft-wizard-s1-f1");
    // Changing either segment must change the key: a mutant dropping one from
    // the template still produces a plausible string, and only this catches it.
    expect(reportDraftStorageKey("s2", "f1")).not.toBe(a);
    expect(reportDraftStorageKey("s1", "f2")).not.toBe(a);
    // And the two segments are not interchangeable.
    expect(reportDraftStorageKey("f1", "s1")).not.toBe(a);
  });

  test("is distinct from the attempt key that shares its shape", () => {
    expect(reportDraftStorageKey("s", "f")).not.toBe(`fxav-report-attempt-wizard-s-f`);
  });
});

describe("capDraft", () => {
  test("returns short input unchanged, including at exactly the cap", () => {
    const short = distinct(10);
    expect(capDraft(short)).toBe(short);
    const exact = distinct(REPORT_MESSAGE_MAX_CHARS);
    // The boundary from below: `<=` mutated to `<` would re-slice this.
    expect(capDraft(exact)).toBe(exact);
    expect(capDraft(exact).length).toBe(REPORT_MESSAGE_MAX_CHARS);
  });

  test("truncates from the FRONT at one past the cap", () => {
    const over = distinct(REPORT_MESSAGE_MAX_CHARS + 1);
    const got = capDraft(over);
    expect(got.length).toBe(REPORT_MESSAGE_MAX_CHARS);
    expect(got).toBe(over.slice(0, REPORT_MESSAGE_MAX_CHARS));
    // Last kept character, derived: an off-by-one in the slice moves it.
    expect(got[got.length - 1]).toBe(over[REPORT_MESSAGE_MAX_CHARS - 1]);
  });

  test("never emits an unpaired surrogate at the boundary", () => {
    const emoji = "😀"; // one code point, two UTF-16 code units
    const stored = "a".repeat(REPORT_MESSAGE_MAX_CHARS - 1) + emoji;
    const got = capDraft(stored);
    // One SHORT of the cap: the half character is dropped, not kept.
    expect(got.length).toBe(REPORT_MESSAGE_MAX_CHARS - 1);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(got)).toBe(
      false,
    );
  });

  test("keeps a WHOLE astral character that fits inside the cap", () => {
    // The complement of the case above, and the one a too-eager surrogate check
    // breaks: here the pair is entirely within the cap and must survive.
    const emoji = "😀";
    const stored = "a".repeat(REPORT_MESSAGE_MAX_CHARS - 2) + emoji;
    const got = capDraft(stored);
    expect(got.length).toBe(REPORT_MESSAGE_MAX_CHARS);
    expect(got.endsWith(emoji)).toBe(true);
  });

  test("does not trim a LOW surrogate, which is only ever a paired tail here", () => {
    // Guards the bound direction: widening the check to 0xDFFF would strip the
    // second half of a pair that fits, corrupting text the cap should keep.
    const got = capDraft("a".repeat(REPORT_MESSAGE_MAX_CHARS - 2) + "😀");
    expect(got.charCodeAt(got.length - 1)).toBeGreaterThanOrEqual(0xdc00);
  });
});

describe("readStoredDraft", () => {
  test("absent and empty both read as the empty string", () => {
    expect(readStoredDraft(KEY)).toBe("");
    window.sessionStorage.setItem(KEY, "");
    expect(readStoredDraft(KEY)).toBe("");
  });

  test("returns the stored value, capped", () => {
    const short = distinct(5);
    window.sessionStorage.setItem(KEY, short);
    expect(readStoredDraft(KEY)).toBe(short);

    const over = distinct(REPORT_MESSAGE_MAX_CHARS + 7);
    window.sessionStorage.setItem(KEY, over);
    expect(readStoredDraft(KEY)).toBe(capDraft(over));
    expect(readStoredDraft(KEY).length).toBe(REPORT_MESSAGE_MAX_CHARS);
  });

  test("reads the key it was GIVEN", () => {
    window.sessionStorage.setItem("other", "wrong");
    window.sessionStorage.setItem(KEY, "right");
    expect(readStoredDraft(KEY)).toBe("right");
  });

  test("a throwing accessor yields '' rather than throwing", () => {
    const d = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    try {
      expect(readStoredDraft(KEY)).toBe("");
    } finally {
      if (d) Object.defineProperty(window, "sessionStorage", d);
    }
  });
});

describe("writeStoredDraft", () => {
  test("stores a non-empty value verbatim, uncapped", () => {
    const over = distinct(REPORT_MESSAGE_MAX_CHARS + 3);
    writeStoredDraft(KEY, over);
    // Deliberately NOT capped on write — the documented invariant. Asserting it
    // pins the limit rather than leaving it to prose.
    expect(window.sessionStorage.getItem(KEY)).toBe(over);
  });

  test("an empty value REMOVES the key rather than storing an empty string", () => {
    window.sessionStorage.setItem(KEY, "prior");
    writeStoredDraft(KEY, "");
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  test("a failing write drops a stale prefix instead of leaving it", () => {
    window.sessionStorage.setItem(KEY, "older shorter");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    writeStoredDraft(KEY, "newer longer text");
    // The stale prefix is the danger: restored later it reads as complete.
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  test("survives a store where removal ALSO throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(() => writeStoredDraft(KEY, "x")).not.toThrow();
  });
});

describe("clearStoredDraftIfUnchanged", () => {
  test("clears when the store still holds what was sent", () => {
    window.sessionStorage.setItem(KEY, "sent");
    clearStoredDraftIfUnchanged(KEY, "sent");
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  test("does NOT clear when a newer value has replaced it", () => {
    window.sessionStorage.setItem(KEY, "newer");
    clearStoredDraftIfUnchanged(KEY, "sent");
    expect(window.sessionStorage.getItem(KEY)).toBe("newer");
  });

  test("compares through the cap, so an over-length stored value still matches", () => {
    const over = distinct(REPORT_MESSAGE_MAX_CHARS + 12);
    window.sessionStorage.setItem(KEY, over);
    // What the component holds in state is the CAPPED value.
    clearStoredDraftIfUnchanged(KEY, capDraft(over));
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  test("compares UNTRIMMED, so whitespace is not silently equal", () => {
    window.sessionStorage.setItem(KEY, "  padded  ");
    clearStoredDraftIfUnchanged(KEY, "padded");
    expect(window.sessionStorage.getItem(KEY)).toBe("  padded  ");
  });

  test("an absent key with a non-empty expectation clears nothing and does not throw", () => {
    expect(() => clearStoredDraftIfUnchanged(KEY, "sent")).not.toThrow();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  test("a throwing accessor is survived", () => {
    const d = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    try {
      expect(() => clearStoredDraftIfUnchanged(KEY, "sent")).not.toThrow();
    } finally {
      if (d) Object.defineProperty(window, "sessionStorage", d);
    }
  });
});
