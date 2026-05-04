/**
 * Unit tests for the Section atom variant API (Task 4.13.distill —
 * Finding 2 close-out).
 *
 * Pure server-render via `renderToStaticMarkup` (matches the existing
 * KeyValue test pattern; vitest `environment: "node"` from
 * vitest.config.ts is sufficient).
 *
 * What we cover:
 *   - default variant === 'reference' renders body as <dl>.
 *   - variant 'primary' renders body as <div> by default.
 *   - variant 'people' renders body as <ul> by default.
 *   - explicit `bodyAs` overrides the variant default.
 *   - every variant preserves the §8.4 internal-overflow contract on
 *     the body wrapper (`max-h-tile-overflow
 *     overflow-y-auto`) — the load-bearing dimensional invariant.
 *   - every variant preserves Tailwind v4 stretch hygiene
 *     (`h-full min-h-tile-min-h`) on the outer wrapper.
 *   - `headingIcon` slot renders next to the heading when supplied
 *     (scope-tile differentiation, Finding 8).
 *   - `headingIcon` is absent from the rendered DOM when not supplied
 *     (legacy tiles with no icon stay structurally identical).
 *   - `VARIANT_BODY_DEFAULT` map exports the variant→element contract
 *     so consumers can rely on it when reading the source.
 *
 * Layout invariants (`getBoundingClientRect`) are verified separately
 * by tests/e2e/layout-dimensions.spec.ts; this file stops at semantic
 * + className-presence checks.
 */
import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Section, VARIANT_BODY_DEFAULT } from "@/components/atoms/Section";

describe("Section atom — variant API (Task 4.13.distill / Finding 2)", () => {
  test("default variant ('reference') renders body as <dl>", () => {
    const html = renderToStaticMarkup(
      <Section testId="t-default" heading="Default">
        <span>child</span>
      </Section>,
    );
    // The body element is <dl> for 'reference' (the default).
    expect(html).toMatch(/<dl[^>]*>/);
  });

  test("variant 'primary' renders body as <div> by default", () => {
    const html = renderToStaticMarkup(
      <Section testId="t-primary" heading="Schedule" variant="primary">
        <span>child</span>
      </Section>,
    );
    // 'primary' default body is <div>; <dl> MUST NOT appear because
    // the variant explicitly drops the description-list pattern.
    expect(html).not.toMatch(/<dl[^>]*>/);
  });

  test("variant 'people' renders body as <ul> by default", () => {
    const html = renderToStaticMarkup(
      <Section testId="t-people" heading="Crew" variant="people">
        <li>row</li>
      </Section>,
    );
    expect(html).toMatch(/<ul[^>]*>/);
    // Same anti-tautology check as 'primary' — 'people' MUST drop
    // <dl>; otherwise it's the reference shape with a relabel.
    expect(html).not.toMatch(/<dl[^>]*>/);
  });

  test("explicit bodyAs overrides the variant default", () => {
    // 'people' default is <ul>; override to <ol>.
    const html = renderToStaticMarkup(
      <Section
        testId="t-people-ol"
        heading="Crew"
        variant="people"
        bodyAs="ol"
      >
        <li>row</li>
      </Section>,
    );
    expect(html).toMatch(/<ol[^>]*>/);
    expect(html).not.toMatch(/<ul[^>]*>/);
  });

  test("every variant preserves the §8.4 internal-overflow contract on the body wrapper", () => {
    const variants = ["reference", "primary", "people"] as const;
    for (const v of variants) {
      const html = renderToStaticMarkup(
        <Section testId={`t-${v}`} heading={v} variant={v}>
          <span>child</span>
        </Section>,
      );
      // Both canonical Tailwind v4 utilities (named after the @theme
      // tokens via PR-19059 canonical-class shape) must appear inside
      // the rendered markup, on the body wrapper. We don't anchor the
      // assertion to the body element type since variants vary that;
      // we just require the §8.4 contract to be present somewhere.
      expect(
        html,
        `variant '${v}' missing max-h-tile-overflow`,
      ).toMatch(/\bmax-h-tile-overflow\b/);
      expect(html, `variant '${v}' missing overflow-y-auto`).toMatch(
        /overflow-y-auto/,
      );
    }
  });

  test("every variant preserves Tailwind v4 stretch hygiene on the outer wrapper", () => {
    const variants = ["reference", "primary", "people"] as const;
    for (const v of variants) {
      const html = renderToStaticMarkup(
        <Section testId={`t-${v}-h`} heading={v} variant={v}>
          <span>child</span>
        </Section>,
      );
      expect(html, `variant '${v}' missing h-full`).toMatch(/h-full/);
      expect(html, `variant '${v}' missing min-h-tile-min-h`).toMatch(
        /\bmin-h-tile-min-h\b/,
      );
    }
  });

  test("headingIcon renders inside the eyebrow row when supplied", () => {
    const html = renderToStaticMarkup(
      <Section
        testId="t-icon"
        heading="Audio"
        headingIcon={
          <svg
            data-testid="t-icon-svg"
            viewBox="0 0 24 24"
            width="14"
            height="14"
          />
        }
      >
        <span>child</span>
      </Section>,
    );
    // Both the icon and the heading text must appear, AND the icon
    // must precede the heading in source order so it reads to the
    // left of the eyebrow on the rendered surface.
    expect(html).toContain("data-testid=\"t-icon-svg\"");
    const iconIdx = html.indexOf("t-icon-svg");
    const headingIdx = html.indexOf("Audio");
    expect(iconIdx).toBeGreaterThan(-1);
    expect(headingIdx).toBeGreaterThan(-1);
    expect(iconIdx).toBeLessThan(headingIdx);
  });

  test("headingIcon is absent when not supplied (legacy tiles unchanged)", () => {
    const html = renderToStaticMarkup(
      <Section testId="t-no-icon" heading="Lodging">
        <span>child</span>
      </Section>,
    );
    // The heading-icon slot wraps icon + h2 in a flex row when an
    // icon is present. Without one, no such wrapper element should
    // appear — the <h2> is a direct child of the <header>.
    expect(html).not.toMatch(
      /<div class="flex items-center gap-1\.5">[\s\S]*?<h2/,
    );
  });

  test("VARIANT_BODY_DEFAULT exports the variant→element contract", () => {
    expect(VARIANT_BODY_DEFAULT).toEqual({
      reference: "dl",
      primary: "div",
      people: "ul",
    });
  });
});
