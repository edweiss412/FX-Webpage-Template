/**
 * Unit tests for the KeyValue atom (M4 Task 4.4 shared atoms commit).
 *
 * Pure server-render assertion via `renderToStaticMarkup` — no jsdom
 * required, so this fits inside the existing vitest `environment: "node"`
 * config without changes (vitest.config.ts:7).
 *
 * What we cover here (M4 Task 4.4 acceptance):
 *   - label + value both render when supplied
 *   - missing value (null/undefined/whitespace) emits the canonical
 *     "Doug hasn't filled this in yet" placeholder per spec §8.3.
 *     The canonical string is hard-coded into the EmptyState atom that
 *     KeyValue delegates to (a future Task 4.14 refactor will route
 *     through `lib/messages/lookup.ts`; M4 baseline is the literal).
 *   - phone-style values render as a `tel:` link with the digits-only
 *     href so the dialer opens cleanly even when display formatting
 *     varies. Display label keeps original formatting.
 *
 * Layout assertions (`getBoundingClientRect()` invariants per §8.4) are
 * Task 4.13's job — those need a real browser; this file deliberately
 * stops at semantic + presence checks.
 */
import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KeyValue } from "@/components/atoms/KeyValue";

describe("KeyValue atom", () => {
  test("renders label + value when both supplied", () => {
    const html = renderToStaticMarkup(
      <KeyValue label="Hotel" value="Waldorf Astoria" />,
    );
    expect(html).toContain("Hotel");
    expect(html).toContain("Waldorf Astoria");
    // Semantic structure: <dt>label</dt><dd>value</dd>.
    expect(html).toMatch(/<dt[^>]*>[\s\S]*?Hotel/);
    expect(html).toMatch(/<dd[^>]*>[\s\S]*?Waldorf Astoria/);
  });

  test("renders the canonical empty-state placeholder when value is null", () => {
    const html = renderToStaticMarkup(
      <KeyValue label="Confirmation" value={null} />,
    );
    expect(html).toContain("Confirmation");
    // Spec §8.3 — required-field-missing inside a rendered tile renders
    // the canonical "Doug hasn't filled this in yet" placeholder. The
    // apostrophe is HTML-encoded by renderToStaticMarkup.
    expect(html).toContain("Doug hasn&#x27;t filled this in yet");
  });

  test("renders the canonical empty-state placeholder when value is undefined", () => {
    const html = renderToStaticMarkup(
      <KeyValue label="Notes" value={undefined} />,
    );
    expect(html).toContain("Doug hasn&#x27;t filled this in yet");
  });

  test("renders empty-state placeholder when value is whitespace-only string", () => {
    const html = renderToStaticMarkup(<KeyValue label="Notes" value="   " />);
    expect(html).toContain("Doug hasn&#x27;t filled this in yet");
  });

  test("phone-style value renders as tel: anchor with digits-only href", () => {
    const html = renderToStaticMarkup(
      <KeyValue label="Phone" value="508-404-4496" linkAs="tel" />,
    );
    // Display keeps the formatted source; href strips non-digits.
    expect(html).toContain("508-404-4496");
    expect(html).toMatch(/href="tel:5084044496"/);
  });

  test("email-style value renders as mailto: anchor", () => {
    const html = renderToStaticMarkup(
      <KeyValue label="Email" value="edweiss412@gmail.com" linkAs="mailto" />,
    );
    expect(html).toMatch(/href="mailto:edweiss412@gmail\.com"/);
  });

  test("anchor tap targets carry the spacing-tap-min utility", () => {
    const html = renderToStaticMarkup(
      <KeyValue label="Phone" value="508-404-4496" linkAs="tel" />,
    );
    // §3 spacing token — every interactive anchor has the 44px floor
    // applied via the tap-min token. The class is rendered into the
    // anchor's className for the e2e Playwright tap-target audit.
    expect(html).toMatch(/min-h-\(--spacing-tap-min\)/);
  });
});
