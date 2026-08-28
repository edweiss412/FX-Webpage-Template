/**
 * Contract tests for lib/popover/naturalSize.ts (spec §4.2). jsdom computes no
 * layout, so the browser's clamp behavior is NOT testable here; that lives in
 * the real-browser e2e case (spec §5.1). These pin the helper's contract:
 * clear-then-restore of inline caps, scroll snapshot/restore, conditional
 * writes, exception safety, and the heightAtWidth probe.
 */
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { withNaturalSize } from "@/lib/popover/naturalSize";
import { premiseHolds } from "../_shared/premise";

function box(): HTMLElement {
  const el = document.createElement("div");
  el.style.maxHeight = "200px";
  el.style.maxWidth = "300px";
  document.body.appendChild(el);
  return el;
}

describe("withNaturalSize", () => {
  it("clears both caps for the measurement and restores them on return", () => {
    const el = box();
    let during: { mh: string; mw: string } | null = null;
    const out = withNaturalSize(el, () => {
      during = { mh: el.style.maxHeight, mw: el.style.maxWidth };
      return 42;
    });
    expect(out).toBe(42);
    expect(during).toEqual({ mh: "", mw: "" });
    expect(el.style.maxHeight).toBe("200px");
    expect(el.style.maxWidth).toBe("300px");
  });

  it("restores caps when the measure callback throws", () => {
    const el = box();
    expect(() =>
      withNaturalSize(el, () => {
        throw new Error("measurement failed");
      }),
    ).toThrow("measurement failed");
    expect(el.style.maxHeight).toBe("200px");
    expect(el.style.maxWidth).toBe("300px");
  });

  it("restores a clamped scrollTop and scrollLeft after the caps return", () => {
    const el = box();
    el.scrollTop = 150;
    el.scrollLeft = 30;
    withNaturalSize(el, () => {
      // jsdom does not clamp on layout (it has none); simulate the browser's
      // clamp so the restore path is exercised.
      el.scrollTop = 0;
      el.scrollLeft = 0;
    });
    expect(el.scrollTop).toBe(150);
    expect(el.scrollLeft).toBe(30);
  });

  it("does not write scroll offsets that never moved", () => {
    const el = box();
    el.scrollTop = 80;
    const writes: number[] = [];
    let value = 80;
    Object.defineProperty(el, "scrollTop", {
      configurable: true,
      get: () => value,
      set: (v: number) => {
        writes.push(v);
        value = v;
      },
    });
    try {
      withNaturalSize(el, () => undefined);
      expect(writes, "no scrollTop write when the measurement never moved it").toEqual([]);
    } finally {
      Reflect.deleteProperty(el, "scrollTop");
    }
  });

  it("heightAtWidth constrains, measures, and clears the probe width", () => {
    const el = box();
    const seen: string[] = [];
    const spy = vi.spyOn(el, "getBoundingClientRect").mockImplementation(() => {
      seen.push(el.style.maxWidth);
      return { height: 111 } as DOMRect;
    });
    const h = withNaturalSize(el, (probe) => probe.heightAtWidth(240));
    expect(h).toBe(111);
    expect(seen).toEqual(["240px"]);
    expect(el.style.maxWidth).toBe("300px");
    spy.mockRestore();
  });

  it("the probe is inert after withNaturalSize returns (R1 F2)", () => {
    const el = box();
    let escaped: ((w: number) => number) | null = null;
    withNaturalSize(el, (probe) => {
      escaped = probe.heightAtWidth;
      return 0;
    });
    expect(() => escaped!(120)).toThrow("escaped");
    expect(el.style.maxWidth).toBe("300px");
  });

  it("heightAtWidth clears its probe width even when the measurement throws (R1 F2)", () => {
    const el = box();
    const spy = vi.spyOn(el, "getBoundingClientRect").mockImplementation(() => {
      throw new Error("detached");
    });
    withNaturalSize(el, (probe) => {
      expect(() => probe.heightAtWidth(120)).toThrow("detached");
      // caught INSIDE the callback: continued measurement must not see 120px
      expect(el.style.maxWidth).toBe("");
      return 0;
    });
    expect(el.style.maxWidth).toBe("300px");
    spy.mockRestore();
  });

  it("throws synchronously on a thenable return (R2 F1: SyncOnly union escape)", () => {
    const el = box();
    expect(() => withNaturalSize(el, () => Promise.resolve(1) as unknown as number)).toThrow(
      "must be synchronous",
    );
    expect(el.style.maxHeight).toBe("200px");
    expect(el.style.maxWidth).toBe("300px");
  });

  it("rejects async callbacks at the type level (R1 F2)", () => {
    const el = box();
    // @ts-expect-error promise-returning callbacks are rejected (SyncOnly)
    const call = () => withNaturalSize(el, async () => 1);
    void call;
  });

  /**
   * INV-F / AC-6 (BL-POPOVER-PLACEMENT-PATH-REDUNDANT-MEASURES site 2).
   *
   * The helper restores the scroll offsets by comparing the live value against
   * the held one (lib/popover/naturalSize.ts:70-71). Both comparisons READ the
   * element after the cap-restore WRITES two lines above, so both force a
   * synchronous layout — and on an unscrolled panel both are provably no-ops,
   * because ZERO IS ALWAYS INSIDE THE SCROLL RANGE: clearing a cap only reduces
   * overflow, which shrinks the range, and an element with no overflow reports
   * exactly 0.
   *
   * NOT "clamping only moves downward", which an earlier draft of this comment
   * said and which is false for `scrollLeft` under `direction: rtl` — there the
   * range runs from negative up to 0, so 0 is its MAXIMUM and a clamp moves
   * UPWARD toward it. The production comment and the spec use the range-shrink
   * argument; this comment now matches them (diff review R1 finding 3).
   *
   * That is the whole claim, and it is an ORDER rather than a timing: jsdom
   * computes no layout, so "this read forces a reflow" is not observable here.
   * What is observable exactly is which reads happen and when, which is the
   * property the repair changes.
   */
  it("does not read the scroll offsets after the cap restore when both are zero", () => {
    const el = box();
    const trace: string[] = [];
    Object.defineProperty(el, "scrollTop", {
      configurable: true,
      get: () => {
        trace.push("get scrollTop");
        return 0;
      },
      set: () => trace.push("set scrollTop"),
    });
    Object.defineProperty(el, "scrollLeft", {
      configurable: true,
      get: () => {
        trace.push("get scrollLeft");
        return 0;
      },
      set: () => trace.push("set scrollLeft"),
    });
    // The cap writes are what make a following scroll read a forced layout, so
    // they are traced too — the assertion is about ORDER, and an order needs
    // both kinds of event in one sequence.
    const realStyle = el.style;
    const styleProxy = new Proxy(realStyle, {
      set(t, prop, value) {
        if (prop === "maxWidth" || prop === "maxHeight") trace.push(`write style.${String(prop)}`);
        return Reflect.set(t, prop, value);
      },
      get(t, prop) {
        const v = Reflect.get(t, prop);
        return typeof v === "function" ? (v as (...a: never[]) => unknown).bind(t) : v;
      },
    });
    Object.defineProperty(el, "style", { configurable: true, get: () => styleProxy });

    withNaturalSize(el, () => 1);

    const lastCapWrite = trace.lastIndexOf("write style.maxHeight");
    // PREMISE (own inputs): the last `maxHeight` write must be the RESTORE, not
    // the clear. `lastCapWrite >= 0` alone proves only that some write happened,
    // which the clear satisfies on its own — diff review R1 finding 1. The
    // helper writes each cap exactly twice, clear then restore, so requiring
    // BOTH writes and taking the last one pins the restore specifically.
    const capWrites = trace.filter((t) => t === "write style.maxHeight").length;
    premiseHolds(`the helper cleared AND restored maxHeight (saw ${capWrites})`, capWrites === 2);
    premiseHolds(
      "the restore is the last cap write",
      lastCapWrite === trace.lastIndexOf("write style.maxHeight"),
    );
    // PREMISE (own inputs): it must have read the held offsets up front, or the
    // instrumentation is not attached to the property the helper actually uses
    // and this case would pass against an element it never touched.
    premiseHolds("the helper read the held offsets first", trace.indexOf("get scrollTop") === 0);

    const after = trace.slice(lastCapWrite + 1).filter((t) => t.startsWith("get scroll"));
    expect(after, "no scroll offset is read after the cap restore").toEqual([]);
  });

  /**
   * The MIXED case: one offset held at zero, the other not. The two guards are
   * independent `if`s, so this is the case that would break if they were ever
   * merged into one condition — a single `heldScrollTop !== 0 && heldScrollLeft
   * !== 0` gate would skip the restore of a genuinely scrolled `scrollLeft`
   * whenever `scrollTop` happened to be zero, which is silent data loss on a
   * horizontally scrolled panel.
   *
   * Neither existing case covers it: the merged restore case
   * (tests/components/naturalSize.test.ts:45) scrolls BOTH, and the new INV-F
   * case holds both at zero.
   */
  it("restores a scrolled offset while skipping the zero one", () => {
    const el = box();
    const reads: string[] = [];
    const writes: string[] = [];
    let top = 0;
    let left = 90;
    Object.defineProperty(el, "scrollTop", {
      configurable: true,
      get: () => {
        reads.push("scrollTop");
        return top;
      },
      set: (v: number) => {
        writes.push("set scrollTop");
        top = v;
      },
    });
    Object.defineProperty(el, "scrollLeft", {
      configurable: true,
      get: () => {
        reads.push("scrollLeft");
        return left;
      },
      set: (v: number) => {
        writes.push("set scrollLeft");
        left = v;
      },
    });

    withNaturalSize(el, () => {
      // The clamp the cap-clear would cause in a real engine, modelled: only the
      // scrolled offset has anywhere to be clamped to.
      left = 0;
      return 1;
    });

    // PREMISE (own inputs): the measurement must actually have MOVED the scrolled
    // offset, or "it was restored" is a claim about a no-op.
    //
    // `reads.length > 0` did NOT establish that — the two held-snapshot reads at
    // the top of the helper satisfy it before the callback runs, so deleting the
    // fixture's `left = 0` left every assertion below green (diff review R1
    // finding 1). The observable that actually discriminates is the WRITE: the
    // helper writes an offset back only when it differs from the held value, so
    // a `set scrollLeft` in the trace is the restore having been necessary.
    premiseHolds(
      `the measurement clamped the scrolled offset (trace: ${writes.join(",") || "none"})`,
      writes.includes("set scrollLeft"),
    );

    expect(left, "the non-zero offset is restored").toBe(90);
    expect(top, "the zero offset is untouched").toBe(0);
    // And the zero one is never READ after the restore writes, which is the
    // property that would regress if the two guards were merged.
    const restoreReads = reads.slice(2);
    expect(restoreReads, "only the non-zero offset is read during the restore").toEqual([
      "scrollLeft",
    ]);
  });
});
