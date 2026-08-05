// The fixture's own coverage: one test per vantage.
//
// These live in a SPEC, not inside `helpers/fontFidelityFixture.ts`. That module
// is imported by all 32 callers, so `test()` calls in its body would register
// four extra cases in every one of them -- 128 duplicated tests, each running
// against whatever document that caller happened to render.
//
// EACH TEST PINS ONE MECHANISM, and the mechanisms are not redundant: removing
// any one turns exactly one of these red. That was measured while building the
// prototype, not assumed, and it is why the fixture carries three vantages
// rather than the one that looks sufficient.
import { expect, observations, resetObservations, test } from "./helpers/fontFidelityFixture";

test.beforeEach(() => {
  resetObservations();
});

test("a reused page reports EVERY document, not only the last", async ({ page }) => {
  // Close-only inspection sees 1 of N. Six source bodies across two callers
  // expand to nine tests rendering 84 documents on reused pages; close-only saw
  // nine. Each document also hides a DESCENDANT with its own family, because an
  // earlier walk reported getComputedStyle(document.body) and would have passed
  // an Inter body with an Arial child.
  for (const name of ["AAA", "BBB", "CCC"]) {
    await page.setContent(
      `<style>body{font-family:"${name}",serif}</style><p>${name}</p>` +
        `<span style="font-family:'${name}_CHILD',serif">child</span>`,
    );
  }
  const seen = observations()
    .flatMap((o) => o.families)
    .join(" | ");
  expect(seen, "the first document was observed").toContain("AAA");
  expect(seen, "the second document was observed").toContain("BBB");
  expect(seen, "the walk reaches descendants, not just body").toContain("AAA_CHILD");
});

test("a browser-originated navigation reports the OUTGOING document", async ({ page }) => {
  // Wrapping goto/setContent/reload cannot see this: the click is a link
  // activation, so nothing programmatic runs. Only the in-page pagehide
  // listener observes it.
  await page.route("http://x.test/first", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<style>body{font-family:"OUTGOING_IMPOSTOR",serif}</style><a id="go" href="/next">go</a><p>d</p>`,
    }),
  );
  await page.route("http://x.test/next", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<style>body{font-family:"CLEAN",serif}</style><p>c</p>`,
    }),
  );
  await page.goto("http://x.test/first");
  await page.click("#go");
  await page.waitForLoadState("load");
  // FILTERED TO `pagehide`, which is the whole claim. `page.goto` is wrapped, so
  // post-navigate already recorded the outgoing document before the click — an
  // unfiltered search finds OUTGOING_IMPOSTOR whether or not the pagehide
  // listener works at all, and this row was passing on that (Codex R3 BLOCKING).
  await expect
    .poll(() =>
      observations()
        .filter((o) => o.via === "pagehide")
        .flatMap((o) => o.families)
        .join(" | "),
    )
    .toContain("OUTGOING_IMPOSTOR");
});

test("a caller-owned context that closes ITSELF is still reported", async ({ browser }) => {
  // agendaScheduleLayout requests { browser }, builds two contexts of its own
  // and closes BOTH before teardown. An after-test hook on `page` would inspect
  // a blank default page and report green while two real documents went
  // unchecked.
  //
  // The context comes from the WRAPPED browser fixture, so everything observed
  // here is the fixture's own behaviour. An earlier prototype hand-installed the
  // binding and pushed its own result, which bypassed the fixture rather than
  // testing it.
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const owned = await ctx.newPage();
  await owned.setContent(
    `<style>body{font-family:"OWNED_OUTER",serif}</style><p>o</p>` +
      `<span style="font-family:'OWNED_CHILD',serif">x</span>`,
  );
  await ctx.close();
  const seen = observations()
    .flatMap((o) => o.families)
    .join(" | ");
  expect(seen, "the caller-owned document was observed").toContain("OWNED_OUTER");
  expect(seen, "a descendant cannot hide behind its root").toContain("OWNED_CHILD");
});

test("shadow-root and frame text are BOTH observed", async ({ page }) => {
  // A TreeWalker does not cross a shadow boundary, and a page is not its
  // frames. Both were invisible to every vantage until the walk descended into
  // open roots and the sweep enumerated page.frames() rather than just pages.
  await page.route("http://y.test/outer", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<style>body{font-family:"OUTER",serif}</style><div id="host"></div>
             <iframe src="/inner"></iframe>
             <script>document.getElementById("host").attachShadow({mode:"open"})
               .innerHTML = '<span style="font-family:SHADOW_WRONG,serif">s</span>';</script>`,
    }),
  );
  await page.route("http://y.test/inner", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<style>body{font-family:"FRAME_WRONG",serif}</style><p>f</p>`,
    }),
  );
  await page.goto("http://y.test/outer");
  await page.waitForLoadState("load");
  await page.close();
  const seen = observations()
    .flatMap((o) => o.families)
    .join(" | ");
  expect(seen, "an OPEN shadow root is walked").toContain("SHADOW_WRONG");
  expect(seen, "a child frame document is walked").toContain("FRAME_WRONG");
});

test("the OBSERVED face set is populated, not merely searched for offenders", async ({ page }) => {
  // Codex R2 HIGH. `enforce()` scans observed faces for UNEXPECTED families, so
  // an empty observed set passes — and before this row, nothing anywhere
  // asserted `.faces` was ever non-empty. A serialization or API regression that
  // made the face query return nothing would have silenced the entire guard
  // while every harness test stayed green.
  //
  // This is the observed-side premise, and it is deliberately paired with the
  // allowed-side premise inside `enforce()`: one proves the accept-set is real,
  // this one proves there is something to compare against it.
  // The face is INTER, the one the toolchain legitimately emits. A probe family
  // here would (correctly) trip `enforce()` and this row would be asserting the
  // failure path instead of the premise.
  await page.setContent(
    `<style>@font-face{font-family:"Inter";src:local("Arial")}` +
      `body{font-family:"Inter",serif}</style><p>probe</p>`,
  );
  const faces = observations().flatMap((o) => o.faces);
  expect(
    faces,
    "no observation carried a registered face — the face query is returning nothing, and the " +
      "impostor check that reads it is therefore vacuous",
  ).toContain("Inter");
});
