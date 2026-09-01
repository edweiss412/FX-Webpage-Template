// @vitest-environment jsdom
/**
 * tests/components/admin/shareLinkCopyButtonRotate.test.tsx
 * (spec 2026-07-24-share-link-chrome-backlog-design §3.5)
 *
 * `ShareLinkCopyButton` gained two guards when the rotate cue landed, and
 * round-5 whole-diff review found them shipped with NO test — implemented and
 * repaired across three commits without the red-first row invariant 1 requires.
 * This file is that row, added late and said so plainly.
 *
 * Both guards exist because a rotate invalidates what the clipboard holds: the
 * OLD url is dead for the whole crew the moment the token changes, so a button
 * still reading "Copied" is asserting something false, two pixels from the cue
 * that just announced the change.
 *
 *   1. A rotate AFTER a completed copy must reset the label (render-phase, so no
 *      frame paints the stale confirmation).
 *   2. A rotate DURING an in-flight `writeText` must suppress the confirmation
 *      when the promise finally resolves. The render-phase reset cannot see this
 *      one — it already ran, with the new url, before the promise settled.
 *
 * Anti-tautology: assertions scope to the button's own testid and to the sr-only
 * announcer separately, so a passing label cannot stand in for a passing
 * announcement. Both guards were verified by removing them and watching exactly
 * one row red each, not by assuming it.
 *
 * SCOPE: guard 2's `useLayoutEffect` vs passive-`useEffect` choice for `urlRef`
 * is not discriminated HERE, and cannot be: catching it needs the promise to
 * settle between commit and passive effects, and RTL gives no hook for that —
 * `rerender` wraps its commit in `act()`, which flushes passive effects before
 * yielding to the microtask queue, so the passive write always lands first
 * (round-6 and round-10 review).
 *
 * `tests/e2e/share-link-flash.spec.ts` T-FLASH-COPY-RACE stalls a real
 * `writeText`, rotates, releases it, and reads the label ONCE. That row reds
 * with the COMPARISON removed, so the guard's existence is proven in a real
 * engine. Its TIMING is not proven there either: the row awaits the whole
 * rotate before releasing the promise, by which point a passive effect would
 * have updated `urlRef` too.
 *
 * The timing IS proven now, in
 * `tests/components/admin/shareLinkCopyButtonOrdering.test.tsx`, which drops
 * RTL entirely — no `act()`, and a bare `root.render` for the commit under test
 * — and releases the promise from a sibling layout effect ordered after the
 * button. That closed `SHARELINK-COPY-REF-ORDERING-PROOF`, whose un-defer
 * trigger asked for exactly that harness. The mutation is registered as
 * adversary `A39` in `scripts/share-link-flash-adversary-matrix.mjs`; it was
 * briefly a whitelisted "unproven survivor" there instead, and round-11 review
 * rejected that as laundering, since the whitelist carried no bidirectional
 * check and a later regression back to survival would still have passed.
 */
import { useLayoutEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ShareLinkCopyButton } from "@/app/admin/show/[slug]/ShareLinkCopyButton";

const OLD = "https://fxav.test/show/demo/OLDTOKEN";
const NEW = "https://fxav.test/show/demo/NEWTOKEN";

const button = () => screen.getByTestId("admin-current-share-link-copy-button");
const announce = () => screen.getByTestId("admin-current-share-link-copy-announce");

/** Install a clipboard whose `writeText` we can resolve on demand. */
function deferredClipboard() {
  let release: (() => void) | null = null;
  const writeText = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = () => resolve();
      }),
  );
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
  return { writeText, release: () => release?.() };
}

/**
 * Samples the button's label at LAYOUT time — after React commits the DOM, before
 * passive effects run.
 *
 * Without this the suite could not tell a render-phase reset from a passive
 * `useEffect([url])` one: RTL's `rerender` flushes effects before returning, so
 * both leave identical DOM by the time an assertion looks (round-6 review). The
 * difference is exactly one painted frame, and layout time is where it is
 * visible from jsdom.
 */
function LayoutProbe({ onSample }: { onSample: (label: string) => void }) {
  useLayoutEffect(() => {
    onSample(
      document.querySelector('[data-testid="admin-current-share-link-copy-button"]')?.textContent ??
        "",
    );
  });
  return null;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ShareLinkCopyButton across a rotate", () => {
  it("a completed copy stops claiming Copied once the url rotates", async () => {
    const { release } = deferredClipboard();
    const samples: string[] = [];
    const tree = (url: string) => (
      <>
        <ShareLinkCopyButton url={url} />
        <LayoutProbe onSample={(l) => samples.push(l)} />
      </>
    );
    const { rerender } = render(tree(OLD));

    fireEvent.click(button());
    await act(async () => {
      release();
    });
    await waitFor(() => expect(button().textContent).toBe("Copied"));
    // Non-vacuity: the announcer must ALSO be live, or the reset below could be
    // "proved" by a label that was never in the copied state to begin with.
    expect(announce().textContent).toBe("URL copied to clipboard");

    samples.length = 0;
    rerender(tree(NEW));

    // The FIRST layout sample after the rotate is the discriminating one. A
    // render-phase reset has already cleared `copied` by the time the DOM is
    // committed; a passive effect would leave "Copied" committed here and fix it
    // one frame later — invisible to the post-rerender assertions below.
    expect(samples[0]).toBe("Copy");
    expect(button().textContent).toBe("Copy");
    expect(announce().textContent).toBe("");
  });

  it("a copy still in flight when the url rotates never announces success", async () => {
    const { writeText, release } = deferredClipboard();
    const { rerender } = render(<ShareLinkCopyButton url={OLD} />);

    fireEvent.click(button());
    expect(writeText).toHaveBeenCalledWith(OLD);

    // The rotate lands while the clipboard write is still pending.
    rerender(<ShareLinkCopyButton url={NEW} />);
    await act(async () => {
      release();
    });

    // The promise resolved for a url the clipboard no longer usefully holds, so
    // the confirmation must be suppressed. Without the urlRef check in onClick
    // this reads "Copied" beside the NEW url — announcing success for a token
    // that is already dead.
    expect(button().textContent).toBe("Copy");
    expect(announce().textContent).toBe("");
  });

  it("a copy of the CURRENT url still confirms (the guard is not blanket suppression)", async () => {
    const { release } = deferredClipboard();
    render(<ShareLinkCopyButton url={NEW} />);

    fireEvent.click(button());
    await act(async () => {
      release();
    });

    // The mirror of the row above: if the guard suppressed every deferred
    // resolution rather than only stale ones, both rows would pass while the
    // button never confirmed anything.
    await waitFor(() => expect(button().textContent).toBe("Copied"));
    expect(announce().textContent).toBe("URL copied to clipboard");
  });
});
