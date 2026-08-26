// @vitest-environment jsdom
// SCRATCH PROBE — after a signal-driven N -> F, is the NEW clip ancestor observed?
// Run against BOTH the current hook and the proposed one to settle whether this
// is pre-existing or introduced.
import { beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { useFitWithinClip } from "@/components/admin/useFitWithinClip";

const DECLARED_CAP = 384;
let frames: FrameRequestCallback[] = [];
const flush = () => { const q = frames; frames = []; for (const cb of q) cb(0); };
type Obs = { cb: ResizeObserverCallback; targets: string[]; live: boolean };
let observers: Obs[] = [];
let clipBottom = 560;
let diagnostics = 0;

function Harness({ clips }: { clips: boolean }) {
  const fit = useFitWithinClip("k");
  return (
    <div data-testid="outer" data-clips={clips ? "true" : undefined}>
      <div data-testid="inner"><div data-testid="fitted" ref={fit} /></div>
    </div>
  );
}
const cap = () => (document.querySelector('[data-testid="fitted"]') as HTMLElement).style.maxHeight;

beforeEach(() => {
  frames = []; observers = []; clipBottom = 560; diagnostics = 0;
  vi.spyOn(console, "debug").mockImplementation(() => { diagnostics += 1; });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => { frames.push(cb); return frames.length; });
  vi.stubGlobal("cancelAnimationFrame", (): void => {});
  vi.stubGlobal("ResizeObserver", class {
    private rec: Obs;
    constructor(cb: ResizeObserverCallback) { this.rec = { cb, targets: [], live: true }; observers.push(this.rec); }
    observe(t: Element) { this.rec.targets.push((t as HTMLElement).dataset?.["testid"] ?? "?"); }
    unobserve() {}
    disconnect() { this.rec.live = false; }
  });
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
    const d = (el as HTMLElement).dataset; const id = d?.["testid"] ?? "?";
    const clips = d?.["clips"] === "true";
    return { overflowX: clips ? "clip" : "visible", overflowY: clips ? "clip" : "visible",
      maxHeight: id === "fitted" ? `${DECLARED_CAP}px` : "none" } as unknown as CSSStyleDeclaration;
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const id = (this as HTMLElement).dataset?.["testid"];
    const bottom = id === "fitted" ? 330 : clipBottom;
    return { left:0,right:300,width:300,top:230,bottom,height:bottom-230,x:0,y:230,toJSON:()=>"" } as DOMRect;
  });
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    get() { return (this as HTMLElement).parentElement; }, configurable: true,
  });
});

const live = () => observers.filter((o) => o.live);
const say = (l: string, extra = "") =>
  // eslint-disable-next-line no-console
  console.log(`STALE ${l} cap="${cap()}" liveObservers=${live().length} targets=${JSON.stringify(live().map(o=>o.targets))} ${extra}`);

test("N->F leaves the new clip ancestor observed?", () => {
  const v = render(<Harness clips={false} />);
  say("ATTACH_UNCLIPPED");
  v.rerender(<Harness clips />);
  say("RERENDER_NOW_CLIPS");
  fireEvent(window, new Event("resize")); flush();
  say("AFTER_SIGNAL");

  // Now resize ONLY the newly-clipping ancestor. If it is observed, its callback
  // exists and delivering it re-measures; if not, nothing is delivered.
  clipBottom = 460;
  const delivered = live().filter((o) => o.targets.includes("outer")).length;
  for (const o of live()) if (o.targets.includes("outer")) o.cb([], {} as ResizeObserver);
  flush();
  say("NEW_CLIP_RESIZE", `deliverable=${delivered} expectedCap="222px" diagnostics=${diagnostics}`);
  v.unmount();
  expect(1).toBe(-1); // force the log to print
});

test("force", () => { expect(1).toBe(-1); });
