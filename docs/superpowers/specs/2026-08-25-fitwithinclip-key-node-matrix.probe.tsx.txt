// @vitest-environment jsdom
// SCRATCH PROBE — the FULL cross product, generated rather than listed, so a
// missing cell is impossible by construction. Spec review R10 found the matrix
// stated over the wrong variable; R11 found a cell missing from the list.
import { beforeEach, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
import { useCallback } from "react";
import { useFitWithinClip } from "@/components/admin/useFitWithinClip";

const DECLARED_CAP = 384;
let log: string[] = [];

function Harness({ show, k }: { show: boolean; k: string }) {
  const fit = useFitWithinClip(k);
  const wrapped = useCallback(
    (node: HTMLElement | null) => {
      if (node === null) return;
      log.push("attach");
      const cleanup = fit(node) as (() => void) | undefined;
      return () => { log.push("cleanup"); cleanup?.(); };
    },
    [fit],
  );
  return (
    <div data-testid="outer" data-clips="true">
      <div data-testid="inner">{show ? <div data-testid="fitted" ref={wrapped} /> : null}</div>
    </div>
  );
}

beforeEach(() => {
  log = [];
  vi.stubGlobal("requestAnimationFrame", (): number => 1);
  vi.stubGlobal("cancelAnimationFrame", (): void => {});
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
    const d = (el as HTMLElement).dataset; const id = d?.["testid"] ?? "?";
    const clips = d?.["clips"] === "true";
    return { overflowX: clips ? "clip" : "visible", overflowY: clips ? "clip" : "visible",
      maxHeight: id === "fitted" ? `${DECLARED_CAP}px` : "none" } as unknown as CSSStyleDeclaration;
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if ((this as HTMLElement).dataset?.["testid"] === "fitted") log.push("apply");
    return { left:0,right:300,width:300,top:230,bottom:560,height:330,x:0,y:230,toJSON:()=>"" } as DOMRect;
  });
});

test("FULL MATRIX", () => {
  const KEY = [false, true] as const;      // did reapplyKey change
  const FROM = [false, true] as const;     // node present before
  const TO = [false, true] as const;       // node present after
  let cells = 0;
  for (const keyChanged of KEY) {
    for (const from of FROM) {
      for (const to of TO) {
        log = [];
        const v = render(<Harness show={from} k="k1" />);
        log = [];
        v.rerender(<Harness show={to} k={keyChanged ? "k2" : "k1"} />);
        const move = from === to ? (from ? "stays-present" : "stays-absent") : from ? "disappears" : "appears";
        // eslint-disable-next-line no-console
        console.log(`MX key=${keyChanged ? "CHANGED  " : "unchanged"} node=${move.padEnd(13)} ${JSON.stringify(log)}`);
        cells += 1;
        v.unmount();
      }
    }
  }
  // eslint-disable-next-line no-console
  console.log(`MX CELLS=${cells} (2 key x 2 from x 2 to = 8, complete by construction)`);
  expect(cells).toBe(-1);
});
