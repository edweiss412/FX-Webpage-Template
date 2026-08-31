# SHARELINK-CUE-FOCUS-OBSCURED-1: the probe, and what it measured

Run 2026-08-31 on branch `fix/sharelink-cue-focus`, worktree base `47e9544e6`.
`DEFERRED.md` filed the row `Reachability: INFERRED, NOT PROBED` and named the
probe as the first scheduled step. This is that probe.

## The claim under test

The share hub's rotation cue scrolls `admin-current-share-link-row` into view
inside the popover's `overflow-y-auto` scroller (`components/admin/showpage/ShareHub.tsx:536-560`).
The URL row sits above the rotate control, so the row predicted that the scroll
pushes the just-activated rotate control, which still holds focus, below the
popover's visible band. That would be a WCAG 2.2 SC 2.4.11 Focus Not Obscured
(Minimum, AA) failure under the grey reading the row itself flagged.

## Verdict: REFUTED, on both engines and both viewports

After the cue's glide settles, `document.activeElement` is `<body>`. Nothing
inside the popover holds focus, so the cue cannot obscure a focused control.
When the idle rotate control does return, it renders fully inside the popover's
visible band, with zero clipping.

The refutation does not depend on which reading of 2.4.11 you take. There is no
focused element to obscure.

## How it was driven

A temporary case added to `tests/e2e/admin-lifecycle-layout.spec.ts`, inside the
existing `admin lifecycle layout dimensions` describe so it reuses that file's
`seedAutoPublishedShowWithUnpublishToken` seed (the crew-URL row renders only
when the link is live). Both runs:

```
BASELINE_SERVER_ONLY=1 pnpm heavy pnpm exec playwright test \
  tests/e2e/admin-lifecycle-layout.spec.ts \
  --project=mobile-safari -g "PROBE" --reporter=line
```

`BASELINE_SERVER_ONLY=1` is load-bearing. Without it Playwright also boots the
:3001-:3003 `pnpm build` servers, the run dies on `Timed out waiting 300000ms
from config.webServer`, and the killed build leaves
`app/admin/dev/*.disabled-by-build-gate` renamed aside in the working tree.

The Chromium repeat needed one temporary edit, reverted after the run:
`admin-lifecycle-layout` prepended to the `desktop-chromium` `testMatch`
alternation in `playwright.config.ts`.

Measurement discipline, so the reading is not manufactured by the harness:

- Both clicks go through `evaluate` (`el.focus(); el.click()`), never
  Playwright's `.click()`. Playwright's actionability scrolling would move the
  popover's scroller itself and could not then be told apart from the cue. The
  explicit `focus()` is what makes the reading faithful to the row's own
  premise, which is that the activated control still holds focus. A bare
  programmatic click moves no focus in either engine, and would have produced
  the `<body>` answer for a reason that says nothing about production.
- Rects are read with `getBoundingClientRect` and compared against the
  popover's own rect, never against hardcoded pixel positions.
- The glide is polled to a stable `scrollTop` across two reads 300ms apart
  before the final measurement, because the cue is `behavior: "smooth"` and
  anything captured synchronously is the pre-animation value.
- The operator is placed where the row says the bug lives, scrolled to the
  bottom of the popover, before arming.

## Measured, WebKit (mobile-safari, iPhone 14 device profile)

Popover band and the active element at each step. `visible` is the intersection
of the element's rect with the popover's client rect.

390x560, popover band `top 106, bottom 498`:

| step | scrollTop | document.activeElement | visible / height | rotate trigger rect |
| --- | --- | --- | --- | --- |
| before arm | 97 | `share-hub-popover` | 392 / 392 | 177.6 to 230.7, visible 53.1 |
| armed | 97 | `admin-rotate-share-token-cancel-button` | 44 / 44 | not rendered |
| just after confirm click | 97 | `BODY` | 392 / 1777.0 | not rendered |
| cue called | 35 | `BODY` | 392 / 1777.0 | not rendered |
| settled | 35 | `BODY` | 392 / 1777.0 | 239.6 to 292.7, visible 53.1 |

390x460, popover band `top 77, bottom 398`:

| step | scrollTop | document.activeElement | visible / height | rotate trigger rect |
| --- | --- | --- | --- | --- |
| before arm | 168 | `share-hub-popover` | 321 / 321 | 77.6 to 130.7, visible 53.1 |
| armed | 168 | `admin-rotate-share-token-cancel-button` | 44 / 44 | not rendered |
| just after confirm click | 168 | `BODY` | 321 / 1777.0 | not rendered |
| cue called | 89 | `BODY` | 321 / 1777.0 | not rendered |
| settled | 35 | `BODY` | 321 / 1777.0 | 210.6 to 263.7, visible 53.1 |

Both heights were swept because the row names 390x560 and the docked-geometry
repair measured `maxScrollTop` at 97 there against a URL-row bottom of 127
(`docs/superpowers/specs/ci/2026-08-26-lifecycle-popover-docked-geometry-repair.md`
§4). 390x460 is the tallest swept height where the popover overflows enough for
the cue to move anything, so it is the worst case for the row's claim. Both
refute it.

Rotate-trigger geometry at `settled`, the number the row's claim turns on:
`53.1` of `53.1` visible at both heights. The control is not clipped at all,
let alone pushed outside the band.

## The peer finding the probe turned up

Focus is dropped to `<body>` at the moment the rotation is confirmed, before any
scrolling happens. `scrollTop` is unchanged between `armed` and `just after
confirm click` in every run, so the cue is not the cause.

Mechanism, and it is not engine-specific: `onConfirmClick` sets
`ui = "resolving"`, which sets `disabled={isResolving}` on the very button the
operator just activated (`app/admin/show/[slug]/RotateShareTokenButton.tsx:179-182` and `app/admin/show/[slug]/RotateShareTokenButton.tsx:370-371`).
Disabling the focused element blurs it. Focus then never comes back, because the
C5 close-focus restore is gated on `restoreFocusRef`, and `restoreFocusRef` is
written only inside `closeConfirm()` (`app/admin/show/[slug]/RotateShareTokenButton.tsx:123-132`),
which is reached by Cancel and by the arm-expiry timer and never by the confirm
path. When `ui` returns to `idle` the confirm row unmounts, the idle rotate row
mounts, and nothing focuses it.

Confirmed on a keyboard-only journey in Chromium, which is where a keyboard
user actually lives:

| step | document.activeElement | visible / height |
| --- | --- | --- |
| trigger focused | `admin-rotate-share-token-button` | 53.1 / 53.1 |
| armed (component auto-focuses Cancel) | `admin-rotate-share-token-cancel-button` | 44 / 44 |
| Shift+Tab | `admin-rotate-share-token-confirm-button` | 44 / 44 |
| Enter | `BODY` | 321 / 1775.2 |
| settled | `BODY` | 321 / 1775.2 |
| control: same flow, Cancel instead of Confirm | `admin-rotate-share-token-button` | 53.1 / 53.1 |

The last row is the control that makes the reading a finding rather than an
observation. The identical journey ending in Cancel restores focus to the rotate
trigger, which is C5 working exactly as its spec says. Only the confirm path
loses it.

The WebKit keyboard run cannot reach the confirm button at all: `Shift+Tab` from
Cancel lands on `BODY`, because WebKit only tabs between buttons under macOS
Full Keyboard Access. That is a harness limit, not a product one, and it is why
the keyboard reading is quoted from Chromium.

Reachable consequence: an operator who confirms a rotation, by tap or by key,
is returned to the top of the document with no focus anywhere in the popover.
A keyboard or switch user has to tab back in from the start of the page. The
rotation itself is announced (`ROTATED_ACTIVE_ANNOUNCEMENT` through the admin
layout's live region), so the outcome is not silent, but the focus position is
lost.

This is a different defect from the one the row predicted, on a different
element, with a different cause, and it is out of this arc's fence. Recorded
here rather than filed.

## Reproducing it

The probe case is not committed. To re-run it, paste the body below into the
`admin lifecycle layout dimensions (real browser, §3.3)` describe in
`tests/e2e/admin-lifecycle-layout.spec.ts`, then run the command above.

```ts
for (const vh of [560, 460]) {
  test(`PROBE @ 390x${vh}: focus vs popover band after the rotation cue`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      const w = window as unknown as { __siv: Array<{ testid: string | null }> };
      w.__siv = [];
      const orig = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (this: Element, opts?: unknown) {
        const r = orig.call(this, opts as ScrollIntoViewOptions);
        w.__siv.push({ testid: this.getAttribute("data-testid") });
        return r;
      };
    });
    await page.setViewportSize({ width: 390, height: vh });
    const modal = await openShowReviewModal(page, published.slug, { timeoutMs: 30_000 });
    const popover = modal.getByTestId("share-hub-popover");
    await expect(async () => {
      await modal.getByTestId("share-hub-kebab").click();
      await expect(popover).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await expect(popover.getByTestId("admin-current-share-link-row")).toBeVisible();
    await popover.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const snap = async (label: string) =>
      popover.evaluate((el, lbl) => {
        const pr = el.getBoundingClientRect();
        const ae = document.activeElement as HTMLElement | null;
        const rot = el.querySelector(
          '[data-testid="admin-rotate-share-token-button"]',
        ) as HTMLElement | null;
        const band = (r: DOMRect | null) =>
          r === null
            ? null
            : {
                top: r.top,
                bottom: r.bottom,
                height: r.height,
                visibleHeight: Math.max(
                  0,
                  Math.min(r.bottom, pr.bottom) - Math.max(r.top, pr.top),
                ),
              };
        return {
          label: lbl,
          scrollTop: el.scrollTop,
          popover: { top: pr.top, bottom: pr.bottom },
          active: ae
            ? {
                tag: ae.tagName,
                testid: ae.getAttribute("data-testid"),
                insidePopover: el.contains(ae),
                rect: band(ae.getBoundingClientRect()),
              }
            : null,
          rotateTrigger: rot ? { rect: band(rot.getBoundingClientRect()) } : null,
        };
      }, label);
    const out: unknown[] = [];
    out.push(await snap("before-arm"));
    await popover.getByTestId("admin-rotate-share-token-button").evaluate((el: HTMLElement) => {
      el.focus();
      el.click();
    });
    const confirm = popover.getByTestId("admin-rotate-share-token-confirm-button");
    await expect(confirm).toBeVisible();
    out.push(await snap("armed"));
    await confirm.evaluate((el: HTMLElement) => {
      el.focus();
      el.click();
    });
    out.push(await snap("just-after-confirm-click"));
    await expect(async () => {
      const seen = await page.evaluate(
        () =>
          (window as never as { __siv: Array<{ testid: string | null }> }).__siv.filter(
            (c) => c.testid === "admin-current-share-link-row",
          ).length,
      );
      expect(seen).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 20_000 });
    out.push(await snap("cue-called"));
    let prev = -1;
    for (let i = 0; i < 20; i += 1) {
      const now = await popover.evaluate((el) => el.scrollTop);
      if (now === prev) break;
      prev = now;
      await page.waitForTimeout(300);
    }
    out.push(await snap("settled"));
    // eslint-disable-next-line no-console
    console.log(`PROBE-JSON-${vh} ${JSON.stringify(out)}`);
  });
}
```
