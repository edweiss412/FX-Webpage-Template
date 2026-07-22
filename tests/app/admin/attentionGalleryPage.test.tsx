/**
 * tests/app/admin/attentionGalleryPage.test.tsx
 * (plan 2026-07-21-attention-modal-switcher-gallery Task 7)
 *
 * The rewritten server route. Proves the auth chokepoint runs FIRST (before any
 * partition work), that a denied developer short-circuits before partitioning,
 * and that the props handed to the client switcher are serializable (no function
 * leaks the Flight boundary) and carry scenarios/excluded/initialId. The write
 * guard is present.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ReactElement } from "react";

const calls: string[] = [];

vi.mock("@/lib/auth/requireDeveloper", () => ({
  requireDeveloper: vi.fn(async () => {
    calls.push("requireDeveloper");
  }),
}));

const RENDERED = [
  { id: "a", tier: 1 as const, label: "A", codes: ["A"], data: { title: "A" } },
  { id: "b", tier: 2 as const, label: "B", codes: ["B"], data: { title: "B" } },
];
const EXCLUDED = [{ id: "x", label: "X", reason: "cut" as const }];

vi.mock("@/app/admin/dev/attention-gallery/buildSwitcherScenarios", () => ({
  partitionScenarios: vi.fn(() => {
    calls.push("partitionScenarios");
    return { rendered: RENDERED, excluded: EXCLUDED };
  }),
  resolveInitialScenario: vi.fn((raw: unknown) => (raw === "b" ? "b" : null)),
}));

import AttentionGalleryPage from "@/app/admin/dev/attention-gallery/page";
import { requireDeveloper } from "@/lib/auth/requireDeveloper";
import { partitionScenarios } from "@/app/admin/dev/attention-gallery/buildSwitcherScenarios";

/** Depth-first search the element tree for the first node whose type has `name`. */
function findByName(node: unknown, name: string): ReactElement | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const c of node) {
      const hit = findByName(c, name);
      if (hit) return hit;
    }
    return null;
  }
  const el = node as ReactElement & { type?: unknown; props?: Record<string, unknown> };
  const t: unknown = el.type;
  const typeName =
    typeof t === "function"
      ? ((t as { name?: string; displayName?: string }).name ??
        (t as { name?: string; displayName?: string }).displayName)
      : undefined;
  if (typeName === name) return el;
  const children = (el.props as { children?: unknown } | undefined)?.children;
  return findByName(children, name);
}

afterEach(() => {
  vi.clearAllMocks();
});
beforeEach(() => {
  calls.length = 0;
});

describe("AttentionGalleryPage (server route)", () => {
  test("requireDeveloper runs BEFORE partitionScenarios", async () => {
    await AttentionGalleryPage({ searchParams: Promise.resolve({}) });
    expect(calls).toEqual(["requireDeveloper", "partitionScenarios"]);
  });

  test("a denied developer short-circuits: partitionScenarios is never called", async () => {
    vi.mocked(requireDeveloper).mockRejectedValueOnce(new Error("forbidden"));
    await expect(AttentionGalleryPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "forbidden",
    );
    expect(partitionScenarios).not.toHaveBeenCalled();
  });

  test("switcher gets serializable scenarios/excluded/initialId; write guard present", async () => {
    const tree = await AttentionGalleryPage({
      searchParams: Promise.resolve({ scenario: "b" }),
    });
    const guard = findByName(tree, "GalleryWriteGuard");
    expect(guard, "GalleryWriteGuard must be rendered").not.toBeNull();

    const switcher = findByName(tree, "AttentionModalSwitcher");
    expect(switcher, "AttentionModalSwitcher must be rendered").not.toBeNull();
    const props = switcher!.props as {
      scenarios: unknown;
      excluded: unknown;
      initialId: unknown;
    };
    expect(props.scenarios).toEqual(RENDERED);
    expect(props.excluded).toEqual(EXCLUDED);
    expect(props.initialId).toBe("b");
    // No function leaks the Flight boundary — the whole prop bag clones.
    expect(() => structuredClone(props)).not.toThrow();
  });

  test("an unknown ?scenario resolves to null (switcher starts at index 0)", async () => {
    const tree = await AttentionGalleryPage({
      searchParams: Promise.resolve({ scenario: "nope" }),
    });
    const switcher = findByName(tree, "AttentionModalSwitcher");
    expect((switcher!.props as { initialId: unknown }).initialId).toBeNull();
  });
});
