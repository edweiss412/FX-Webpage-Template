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
});
