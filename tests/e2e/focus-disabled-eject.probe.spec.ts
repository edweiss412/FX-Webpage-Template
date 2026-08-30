/**
 * tests/e2e/focus-disabled-eject.probe.spec.ts
 *
 * Probe P1 — settles spec §1.4 row U-1 for
 * docs/superpowers/specs/2026-08-29-diagram-failure-retry-design.md.
 *
 * THE CLAIM. Setting the native `disabled` attribute on a button that currently
 * holds focus ejects focus to `<body>`, while `aria-disabled="true"` does not.
 * Spec §7.1 rests on this: the retry control is pressed BY the focused element,
 * so a native `disabled` on entering the in-flight state would drop focus
 * exactly where the focus amendment exists to keep it.
 *
 * WHY A STANDALONE FIXTURE. U-1 is a claim about a focused `<button>` gaining an
 * attribute. It has nothing to do with diagrams, `next/image`, or this feature,
 * so probing it against the shipped control would have made the probe depend on
 * the code it is supposed to inform. Plan round 1 found that circularity; this
 * file is the repair.
 *
 * BOTH ARMS RUN, and that is the point. An `aria-disabled`-only probe would go
 * green while establishing nothing about whether the hazard is real, and the
 * hazard is the whole reason spec §7.1 rejects the obvious implementation.
 *
 * Prior evidence, not proof: components/admin/RecentAutoAppliedStrip.tsx:371-380
 * records this behaviour for a different control on a different surface.
 */
import { expect, test } from "@playwright/test";

const FIXTURE = `<!doctype html>
<html><body>
  <button id="native">native</button>
  <button id="aria">aria</button>
</body></html>`;

test.beforeEach(async ({ page }) => {
  await page.setContent(FIXTURE);
});

test("native `disabled` on the FOCUSED button ejects focus to body", async ({ page }) => {
  await page.focus("#native");
  // PREMISE: the assertion below is about what happens to focus that is ON the
  // button. If focus never landed there, "focus is on body afterwards" is
  // trivially true and the case proves nothing.
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("native");

  await page.evaluate(() => {
    (document.getElementById("native") as HTMLButtonElement).disabled = true;
  });

  const after = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
  expect(after, "native disabled ejected focus off the button").toBe("body");
});

test("`aria-disabled` on the FOCUSED button keeps focus where it is", async ({ page }) => {
  await page.focus("#aria");
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("aria");

  await page.evaluate(() => {
    document.getElementById("aria")!.setAttribute("aria-disabled", "true");
  });

  const after = await page.evaluate(() => document.activeElement?.id);
  expect(after, "aria-disabled left focus on the button").toBe("aria");
});
