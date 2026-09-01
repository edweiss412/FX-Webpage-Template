// @vitest-environment jsdom
/**
 * tests/components/admin/shareLinkCopyButtonOrdering.test.tsx
 *
 * The ordering proof for `ShareLinkCopyButton`'s `urlRef` write, and the reason
 * `SHARELINK-COPY-REF-ORDERING-PROOF` could be graduated out of DEFERRED.md.
 *
 * WHAT WAS MISSING. `app/admin/show/[slug]/ShareLinkCopyButton.tsx:93` writes
 * `urlRef` in a LAYOUT effect, and the comment there says the layout phase is
 * load-bearing: with a passive `useEffect`, a clipboard promise settling between
 * commit and the passive flush compares against a stale url, the guard at `:107`
 * waves it through, and the button announces "Copied" beside a share token that
 * is already dead for the whole crew. `shareLinkCopyButtonRotate.test.tsx` proves
 * the guard EXISTS; `tests/e2e/share-link-flash.spec.ts` T-FLASH-COPY-RACE proves
 * it exists in a real engine. Neither proved the effect had to be LAYOUT: swapping
 * the hook for `useEffect` reddened nothing anywhere in the suite.
 *
 * WHY THE EARLIER ATTEMPTS LOST. Playwright cannot schedule a promise resolution
 * inside the commit-to-passive window at all. A jsdom probe releasing from a
 * sibling `useLayoutEffect` lost for a different reason: it ran under `act()`,
 * and `act()` flushes passive effects before yielding to the microtask queue, so
 * the passive write always landed first. RTL's `render` and `rerender` wrap every
 * commit in `act()`, which is why this file does not use RTL. That is the
 * mechanism, not an oversight.
 *
 * HOW THE WINDOW OPENS HERE. Four facts, in order:
 *
 *   1. Nothing here calls `act()`. That is the load-bearing fact and the whole
 *      of it: `act()` is what installs React's act queue, so a file that never
 *      calls it runs on the real scheduler. Probed on React 19.2.4 rather than
 *      assumed. `actQueue` is null before any `act()`; it is installed INSIDE
 *      `act()` even with `IS_REACT_ACT_ENVIRONMENT` false; and it stays null
 *      with the flag true and no `act()`. The flag is set false below for a
 *      different reason, given at that line, and it is NOT what opens this
 *      window.
 *   2. The commit under test is driven by a BARE `root.render`, never `flushSync`
 *      and never `act`. React renders and commits it in a scheduler task and
 *      schedules the passive flush as a separate task. (Which host callback the
 *      scheduler uses depends on the environment, and under Node it takes
 *      `setImmediate` rather than `MessageChannel`, which is why this file waits
 *      for the flush to be OBSERVED rather than for a fixed number of turns.
 *      `flushSync` DOES flush passive effects synchronously, so it is used for
 *      the initial mount and nowhere else.)
 *   3. `CommitProbe` is rendered AFTER the button. React runs layout effects in
 *      tree order, so the button's own `useLayoutEffect([url])` has already
 *      written `urlRef` by the time the probe's fires and settles the clipboard
 *      promise. The release therefore lands after the whole layout phase of that
 *      commit and before any of its passive phase.
 *   4. A settled promise resumes its continuations as microtasks, and microtasks
 *      drain before the next task. So the component's `await` resumes, and its
 *      captured-url guard runs, strictly before React's passive flush.
 *
 * That is the window. With the shipped LAYOUT effect the guard compares against
 * the new url and suppresses; with a passive one it compares against a url React
 * has not updated yet, and confirms a dead token.
 *
 * PREMISES. Every one of the four facts above that this file can observe is
 * asserted with `premiseHolds` before the assertion resting on it, because a
 * harness whose window silently closes passes forever while proving nothing. The
 * one thing a source mutation cannot express is the harness defeating itself, so
 * it is guarded here rather than by an adversary in the matrix.
 *
 * ROW IDS. Both cases are named `T-ORDER-STALE` and `T-ORDER-FRESH`, following
 * the `T-FLASH-*` convention the browser spec already uses. The ids are not
 * decoration: the adversary matrix records a rejected row by TITLE and discards
 * the suite path (`scripts/share-link-flash-adversary-matrix.mjs:984`), so a
 * title shared with another suite would let someone else's failure be read as
 * this file's coverage. Each id appears in exactly one file of `VITEST_SUITES`
 * and once within it, which is what makes an attribution to these rows sound.
 *
 * REGISTERED, NOT WHITELISTED. The layout-to-passive swap is adversary `A39` in
 * `scripts/share-link-flash-adversary-matrix.mjs`, and this file is in that
 * script's `VITEST_SUITES`. A bespoke `UNPROVEN_SURVIVORS` whitelist for this
 * exact gap existed once and round-11 review rejected it as laundering, because
 * it carried no bidirectional check: a regression back to survival would still
 * have passed. Registration is that missing check.
 */
import { useEffect, useLayoutEffect } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

import { ShareLinkCopyButton } from "@/app/admin/show/[slug]/ShareLinkCopyButton";
import { premiseHolds } from "@/tests/_shared/premise";

const OLD = "https://fxav.test/show/demo/OLDTOKEN";
const NEW = "https://fxav.test/show/demo/NEWTOKEN";

/** The two effect phases of one commit, in the order React runs them. */
type Phase = "layout" | "passive";

/**
 * Rendered AFTER `ShareLinkCopyButton`, so `onLayout` fires with the button's
 * own layout effect already run for this commit. `useLayoutEffect` and
 * `useEffect` carry no dependency array on purpose: every commit is observed,
 * including one whose url did not change.
 */
function CommitProbe({
  onPhase,
  onLayout,
}: {
  onPhase: (phase: Phase) => void;
  onLayout: () => void;
}) {
  useLayoutEffect(() => {
    onPhase("layout");
    onLayout();
  });
  useEffect(() => {
    onPhase("passive");
  });
  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let priorClipboard: PropertyDescriptor | undefined;
let priorActEnv: unknown;

const query = (testid: string) =>
  container?.querySelector(`[data-testid="${testid}"]`)?.textContent ?? null;

/** The button's own label, scoped to its testid and nothing else. */
const label = () => query("admin-current-share-link-copy-button");
/** The sr-only announcer, read separately so a label cannot stand in for it. */
const announce = () => query("admin-current-share-link-copy-announce");

beforeEach(() => {
  // This does NOT open the window; not calling `act()` does. What the flag
  // controls is the warning: with it true, React DOM reports every state update
  // made outside `act()`, and this file makes those deliberately. Setting it
  // false keeps a correct run quiet rather than drowned. Restored rather than
  // deleted, so a file that ran before this one gets its value back.
  priorActEnv = (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = false;
  // The DESCRIPTOR, not a boolean: restoring what was there beats guessing that
  // there was nothing, and jsdom may grow a clipboard of its own.
  priorClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
});

afterEach(() => {
  const live = root;
  if (live !== null) flushSync(() => live.unmount());
  root = null;
  container?.remove();
  container = null;
  if (priorClipboard === undefined) delete (navigator as { clipboard?: unknown }).clipboard;
  else Object.defineProperty(navigator, "clipboard", priorClipboard);
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = priorActEnv;
});

type Run = {
  /** Every observable event of the run, in the order it happened. */
  order: string[];
  /** The phases seen for the commit under test, sampled AT the release. */
  phasesAtRelease: readonly Phase[];
  /** Whether the probe reached the release at all. */
  released: boolean;
  /** The url the click captured, so a case cannot assert about the wrong copy. */
  requested: string | null;
};

/**
 * Stalls a copy of `firstUrl`, commits `secondUrl` without `act` or `flushSync`,
 * and settles the clipboard promise from inside that commit's layout phase.
 *
 * The two urls are parameters rather than constants because they are the
 * discriminating input: passing the same url twice exercises a commit that
 * rotates nothing, which is how the suppression case is told apart from blanket
 * suppression.
 */
async function copyThenCommit(firstUrl: string, secondUrl: string): Promise<Run> {
  const order: string[] = [];
  const phases: Phase[] = [];
  let phasesAtRelease: readonly Phase[] = [];
  let released = false;
  let armed = false;
  let requested: string | null = null;
  let settle: (() => void) | null = null;

  const writeText = (text: string) => {
    requested = text;
    const pending = new Promise<void>((resolve) => {
      settle = resolve;
    });
    // Registered before the component awaits the returned value, so this lands
    // at the HEAD of the microtask drain the release opens and the component's
    // own continuation resumes immediately after it. Recording it therefore
    // dates the whole drain, not just this callback.
    void pending.then(() => order.push("microtask"));
    return pending;
  };
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });

  const tree = (url: string) => (
    <>
      <ShareLinkCopyButton url={url} />
      <CommitProbe
        onPhase={(phase) => {
          phases.push(phase);
          order.push(phase);
        }}
        onLayout={() => {
          if (!armed || released) return;
          released = true;
          phasesAtRelease = [...phases];
          order.push("release");
          settle?.();
        }}
      />
    </>
  );

  // Locals, then the module-level handles the teardown needs. Reading through
  // the nullable module variables would leave every use one narrowing rule away
  // from a type error for no benefit.
  const host = document.createElement("div");
  document.body.appendChild(host);
  const reactRoot = createRoot(host);
  container = host;
  root = reactRoot;

  // Mount synchronously. `flushSync` flushes passive effects too, which is
  // exactly why it is confined to setup.
  flushSync(() => reactRoot.render(tree(firstUrl)));

  const button = host.querySelector<HTMLButtonElement>(
    '[data-testid="admin-current-share-link-copy-button"]',
  );
  if (button === null) throw new Error("the copy button did not render");
  button.click();

  // BOTH logs reset, and `order` is the one that matters. It is scanned with
  // `indexOf`, which finds the FIRST occurrence, and the MOUNT commit has
  // already logged a layout and a passive of its own. Left uncleared, the
  // ordering premise reads the mount's passive effect, finds it before the
  // microtask that has not happened yet, and fails on a window that is in fact
  // wide open. Every event scanned below must belong to the commit under test.
  order.length = 0;
  phases.length = 0;
  armed = true;
  // The commit under test. NOT flushSync, NOT act.
  reactRoot.render(tree(secondUrl));

  // Wait for the commit's passive flush rather than for a fixed number of turns:
  // a fixed count is a bound on React's scheduler that nothing here guarantees,
  // and it fails as a flake instead of as a premise. The loop is bounded so a
  // passive flush that never happens ends the test loudly, in `assertWindowOpened`,
  // rather than hanging.
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < 20 && !order.includes("passive"); i += 1) await tick();
  // Four more turns so any re-render the settled promise's state update scheduled
  // has rendered before the DOM is read.
  for (let i = 0; i < 4; i += 1) await tick();

  return { order, phasesAtRelease, released, requested };
}

/** The premises every case shares, asserted on that case's OWN run. */
function assertWindowOpened(run: Run, expectedRequest: string): void {
  premiseHolds(
    "the click captured the url this case is about, so the assertion is about the copy it names",
    run.requested === expectedRequest,
  );
  premiseHolds(
    "the probe reached the release, so a commit under test happened at all",
    run.released,
  );
  premiseHolds(
    "the release landed after the commit's layout phase and before any of its passive phase",
    run.phasesAtRelease.length === 1 && run.phasesAtRelease[0] === "layout",
  );
  const microtask = run.order.indexOf("microtask");
  const passive = run.order.indexOf("passive");
  // Both indices are proven present before they are compared: `indexOf` returns
  // -1 for an event that never happened, and -1 precedes every real index, so an
  // absent microtask would satisfy the ordering check it is supposed to fail.
  premiseHolds("the settled promise resumed its continuations", microtask >= 0);
  premiseHolds(
    "the commit's passive effects eventually ran, so the window closed rather than never opening",
    passive >= 0,
  );
  premiseHolds(
    "the microtask drain preceded the passive flush, which is the window itself",
    microtask < passive,
  );
}

describe("ShareLinkCopyButton, url rotated inside the commit-to-passive window", () => {
  it("T-ORDER-STALE suppresses a confirmation whose url the rotate has already killed", async () => {
    const run = await copyThenCommit(OLD, NEW);
    assertWindowOpened(run, OLD);

    // The proof. With the shipped LAYOUT effect the button's own layout pass has
    // already moved `urlRef` to NEW, so the guard sees a stale request and
    // returns. With a passive effect React has not written it yet, the guard
    // compares OLD against OLD, and the button confirms a token nobody can use.
    expect(label()).toBe("Copy");
    expect(announce()).toBe("");
  });

  it("T-ORDER-FRESH still confirms a copy the commit did not invalidate", async () => {
    const run = await copyThenCommit(OLD, OLD);
    assertWindowOpened(run, OLD);

    // The mirror. Without it the case above is satisfied by a harness that
    // suppresses everything it touches, and a guard rewritten to refuse every
    // deferred resolution would read as a pass.
    expect(label()).toBe("Copied");
    expect(announce()).toBe("URL copied to clipboard");
  });
});
