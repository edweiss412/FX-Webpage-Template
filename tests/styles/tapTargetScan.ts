/**
 * tests/styles/tapTargetScan.ts
 *
 * The D3 tap-height scan (spec §5): every in-scope interactive element is
 * either CLEAR — a >= 44px height floor is unconditionally reachable from its
 * className, with no defeater anywhere in it — or UNCLASSIFIED, which the suite
 * fails on unless a census row names it.
 *
 * WHAT IT CLAIMS: the HEIGHT floor, and only that (spec §5.1). Width is
 * content-driven at most legitimately-sized controls, and a static width demand
 * would push essentially the whole corpus into the census, so the guard would
 * pin nothing. Width stays with the real-browser rect oracles
 * (`tests/e2e/tap-target-floor.layout.spec.ts`), which measure both dimensions
 * on production routes.
 *
 * Every judgement it makes comes from `interactiveScanCore` — same corpus, same
 * in-scope predicate, same resolver as the subtle-policy guard.
 */
import {
  defeaterPresent,
  heightFloorSatisfied,
  scanInteractiveElements,
} from "./interactiveScanCore";

export type TapVerdict = {
  file: string;
  line: number;
  tag: string;
  state: "clear" | "unclassified";
};

export function scanTapTargets(rootDir: string): TapVerdict[] {
  return scanInteractiveElements(rootDir).map((el) => ({
    file: el.file,
    line: el.line,
    tag: el.tag,
    // `heightFloorSatisfied` already refuses on a defeater; the second call is
    // the claim written out, not a second condition — an element that carries a
    // defeater is UNCLASSIFIED even if a floor token is also present.
    state: heightFloorSatisfied(el) && !defeaterPresent(el) ? "clear" : "unclassified",
  }));
}
