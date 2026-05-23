// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MDXProvider } from "@mdx-js/react";
import { useMDXComponents } from "@/mdx-components";

const src = readFileSync(
  join(process.cwd(), "app/help/admin/review-queues/page.mdx"),
  "utf8",
);

describe("/help/admin/review-queues (E.6)", () => {
  it("renders without throwing through the real MDX pipeline (E.5 precedent — MDXProvider load-bearing for Screenshot / Callout / etc.)", async () => {
    const Mod = await import("@/app/help/admin/review-queues/page.mdx");
    const Page = Mod.default;
    const components = useMDXComponents({});
    expect(() =>
      render(
        <MDXProvider components={components}>
          <Page />
        </MDXProvider>,
      ),
    ).not.toThrow();
  });

  it("renders the canonical H1 into the DOM (catches MDX compiler/component-map regression where source has H1 but rendered output drops it)", async () => {
    const Mod = await import("@/app/help/admin/review-queues/page.mdx");
    const Page = Mod.default;
    const components = useMDXComponents({});
    const { container } = render(
      <MDXProvider components={components}>
        <Page />
      </MDXProvider>,
    );
    const h1 = within(container).getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Review queues");
  });

  it("has the canonical H1", () => {
    expect(src).toMatch(/^# Review queues\b/m);
  });

  it("has plain h2 section anchors matching §5.6 matrix fragments (D.5/r6 — kebab non-catalog anchors are plain h2, not RefAnchor)", () => {
    expect(src).toMatch(/<h2[^>]*id=["']first-seen["']/);
    expect(src).toMatch(/<h2[^>]*id=["']re-stage["']/);
  });

  it("does NOT use RefAnchor for these section anchors (catalog-code-only per D.5)", () => {
    expect(src).not.toMatch(/<RefAnchor\s+id=["']first-seen["']/);
    expect(src).not.toMatch(/<RefAnchor\s+id=["']re-stage["']/);
  });

  it("includes a Phase D warning Callout about Discard (content brief — irreversible-only-in-staged-sense warning)", () => {
    expect(src).toMatch(/<Callout\s+type=["']warning["']/);
  });

  it("includes the empty pending-queue Screenshot per Phase F review R2", () => {
    expect(src).toMatch(
      /<Screenshot\s+name=["']review-queues-empty-state["']/,
    );
    expect(src).toContain("No sheets are waiting in the captured state");
  });

  it("does NOT reference <ScreenshotPlaceholder> (v1 ships real screenshots — Phase H.4 lint enforces)", () => {
    expect(src).not.toContain("<ScreenshotPlaceholder");
  });

  it("contains no em-dashes (DESIGN.md §9 absolute ban)", () => {
    expect(src).not.toMatch(/—/);
  });

  it("contains no raw catalog error codes in body copy (AGENTS.md §1.5)", () => {
    // Allow no SCREAMING_SNAKE_CASE multi-word tokens anywhere in the source.
    // Catalog codes like FIRST_SEEN_REVIEW / ONBOARDING_SCAN_REVIEW /
    // STAGED_PARSE_RESTAGED_INLINE / MISSING_REVIEWER_CHOICE / SYNC_INFRA_ERROR
    // must not leak into copy. Kebab-case section ids (first-seen, re-stage)
    // are exempt because they are lowercase.
    expect(src).not.toMatch(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/);
  });

  it("does NOT carry the pre-amendment-9 obsolete first-seen wording (Codex R8 regression — clean first-seen sheets auto-publish; only review-rule trips and onboarding-scan first-seen stage)", () => {
    // Amendment 9 (spec §5.2 / §9.1.1 / triggered-review-items table):
    // live-folder first-seen sheets passing MI-1..MI-14 auto-apply; only
    // MI-trip first-seen and onboarding-scan first-seen route through
    // this queue. Pin against drift back to the pre-amendment "everything
    // stages until Apply" framing.
    //
    // I.2 R15 amendment (2026-05-23): the original Amendment 9 framing
    // referenced a "24h unpublish-undo email" as part of the auto-publish
    // path. R15 finding 1 surfaced that no email-send infrastructure ships
    // in v1 (no sendgrid / resend / nodemailer / SMTP), and the
    // SHOW_FIRST_PUBLISHED catalog entry's `(signed-link)` placeholder is
    // unrendered — info-severity is filtered by AlertBanner and /help/
    // errors filters info from its catalog enumeration. The positive
    // "must reference 24-hour" assertion is therefore dropped to align
    // with the R13 user-direction discipline ("describe only what's
    // shipped"). Per AGENTS.md, M11 docs continue to describe the
    // current shipped model in flight; the safety-net surface re-opens
    // when (a) email delivery ships, or (b) the picker model post-M11
    // takes over and the unpublish discipline is reframed.
    expect(src).not.toMatch(/need(?:s)? your blessing/i);
    expect(src).not.toMatch(/nothing here goes to crew until you apply/i);
    expect(src).not.toMatch(/nothing goes to crew until apply/i);
  });
});
