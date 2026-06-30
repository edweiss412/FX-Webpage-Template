// @vitest-environment jsdom
/**
 * tests/components/StaleCleanupAutoSubmit.test.tsx (M11.5 §B Task C3)
 *
 * Pins the public contract of the picker tree's ONLY client component
 * (spec §4.7 R25). It mounts an invisible form with five hidden inputs
 * carrying the stale cookie entry's identifying tuple, then auto-submits
 * on mount via useEffect so the cookie cleanup races no further user
 * interaction.
 *
 * The Server Action target (cleanupStaleEntry) is server-only and cannot
 * run in jsdom; we stub HTMLFormElement.prototype.requestSubmit to verify
 * the auto-submit fires without invoking the action body.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { StaleCleanupAutoSubmit } from "@/app/show/[slug]/[shareToken]/_StaleCleanupAutoSubmit";

afterEach(cleanup);

describe("<StaleCleanupAutoSubmit>", () => {
  const baseProps = {
    slug: "sample-show",
    shareToken: "a".repeat(64),
    showId: "11111111-1111-1111-1111-111111111111",
    expectedEpoch: 3,
    expectedCrewMemberId: "22222222-2222-2222-2222-222222222222",
  };

  test("renders a form carrying all five hidden inputs from props", () => {
    const { container } = render(<StaleCleanupAutoSubmit {...baseProps} />);
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    const fieldOf = (name: string) =>
      (form!.querySelector(`input[name="${name}"]`) as HTMLInputElement | null)?.value;
    expect(fieldOf("slug")).toBe(baseProps.slug);
    expect(fieldOf("shareToken")).toBe(baseProps.shareToken);
    expect(fieldOf("showId")).toBe(baseProps.showId);
    expect(fieldOf("expectedEpoch")).toBe(String(baseProps.expectedEpoch));
    expect(fieldOf("expectedCrewMemberId")).toBe(baseProps.expectedCrewMemberId);
  });

  test("auto-submits the form on mount via useEffect (R25)", () => {
    const requestSubmitSpy = vi
      .spyOn(HTMLFormElement.prototype, "requestSubmit")
      .mockImplementation(() => {});
    render(<StaleCleanupAutoSubmit {...baseProps} />);
    expect(requestSubmitSpy).toHaveBeenCalledTimes(1);
    requestSubmitSpy.mockRestore();
  });

  test("form is visually hidden (sr-only) so the user doesn't see it", () => {
    const { container } = render(<StaleCleanupAutoSubmit {...baseProps} />);
    const form = container.querySelector("form");
    expect(form?.className).toContain("sr-only");
  });
});

describe("only-use-client-in-picker-tree static grep (R25)", () => {
  test("no UNSANCTIONED 'use client' islands in app/show/[slug]/[shareToken]/ (StaleCleanupAutoSubmit + error.tsx exempt)", () => {
    const dir = join(process.cwd(), "app", "show", "[slug]", "[shareToken]");
    // Sanctioned client files: the picker auto-submit island, and error.tsx — a React error
    // boundary, which MUST be a Client Component (Phase 3 crew boundary).
    const SANCTIONED = new Set(["_StaleCleanupAutoSubmit.tsx", "error.tsx"]);
    const offenders: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!/\.tsx?$/.test(entry.name)) continue;
      const source = readFileSync(join(dir, entry.name), "utf8");
      const head = source.slice(0, 200);
      if (/^['"]use client['"]/.test(head.trim()) || /\n['"]use client['"]/.test(head)) {
        if (!SANCTIONED.has(entry.name)) {
          offenders.push(entry.name);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
