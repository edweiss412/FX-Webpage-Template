// @vitest-environment jsdom
/**
 * tests/components/admin/PendingPanel-awaiting-approval.test.tsx
 * (M12.2 Phase B2 Task 8.2 — spec §4.3, AC-B2.9)
 *
 * First-seen staged rows (the OFF-path `pending_syncs` rows carrying the reused
 * FIRST_SEEN_REVIEW sentinel) must render the SHOW_AWAITING_PUBLISH_APPROVAL
 * catalog copy via messageFor() — NOT the old hard-coded "First-time review
 * needed" string (invariant 5: no raw codes / catalog-driven copy).
 *
 * Two such rows render TWO distinct inbox entries (keyed per staged_id, no
 * collapse).
 *
 * Anti-tautology (MANDATORY): the approval copy is also rendered by the help
 * tooltip body and could in principle be rendered by a sibling pending-ingestion
 * row (if its error code mapped to the same catalog entry). Before asserting the
 * copy, we CLONE the rendered tree and REMOVE every sibling that can
 * independently render that label (the help-tooltip affordance + all
 * pending-ingestion <li>s), so a broken impl (one that dropped the per-row copy)
 * cannot pass because an unrelated sibling happened to render the text.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

import { PendingPanel } from "@/components/admin/PendingPanel";
import { messageFor } from "@/lib/messages/lookup";

const APPROVAL_COPY = messageFor("SHOW_AWAITING_PUBLISH_APPROVAL").dougFacing as string;

afterEach(() => {
  cleanup();
});

function firstSeen(stagedId: string, title: string) {
  return {
    stagedId,
    driveFileId: `file-${stagedId}`,
    candidateTitle: title,
    stagedModifiedTime: "2026-06-01T12:00:00.000Z",
  };
}

describe("PendingPanel — SHOW_AWAITING_PUBLISH_APPROVAL copy for first-seen rows (Task 8.2)", () => {
  it("renders the catalog approval copy on each first-seen row (not the old hard-coded string)", () => {
    const { container } = render(
      <PendingPanel
        pendingIngestions={[]}
        firstSeenStaged={[firstSeen("s1", "Spamalot")]}
      />,
    );
    const row = container.querySelector(
      '[data-testid="admin-pending-first-seen-s1"]',
    ) as HTMLElement;
    expect(row).not.toBeNull();
    // Scope the assertion to the ROW itself (not the whole panel) so the
    // help-tooltip body can't satisfy it.
    expect(row.textContent ?? "").toContain(APPROVAL_COPY);
    // The retired hard-coded string must be gone.
    expect(row.textContent ?? "").not.toContain("First-time review needed");
  });

  it("two first-seen rows render two distinct inbox entries with the copy (no collapse)", () => {
    const { container } = render(
      <PendingPanel
        pendingIngestions={[
          {
            id: "ing-1",
            driveFileId: "file-ing-1",
            driveFileName: "Broken Sheet",
            firstSeenAt: "2026-06-01T10:00:00.000Z",
            attemptCount: 2,
            errorCode: "PARSE_FAILED",
            errorMessage: "We could not parse this sheet.",
          },
        ]}
        firstSeenStaged={[firstSeen("s1", "Spamalot"), firstSeen("s2", "Cats")]}
      />,
    );

    // Anti-tautology: clone the tree and REMOVE every sibling that can
    // independently render the approval copy — the help tooltip + all
    // pending-ingestion rows — so the assertion can only be satisfied by the
    // first-seen rows themselves.
    const clone = container.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll(
        '[data-testid^="help-affordance"], [data-testid^="admin-pending-ingestion-"]',
      )
      .forEach((el) => el.remove());
    // Also strip the help-tooltip content region by its labelled control if present.
    clone
      .querySelectorAll('[aria-label^="Help:"]')
      .forEach((el) => el.parentElement?.remove());

    const cloneText = clone.textContent ?? "";
    const occurrences = cloneText.split(APPROVAL_COPY).length - 1;
    expect(occurrences).toBe(2);

    // Each row is independently present (per staged_id, no collapse).
    const s1 = clone.querySelector('[data-testid="admin-pending-first-seen-s1"]');
    const s2 = clone.querySelector('[data-testid="admin-pending-first-seen-s2"]');
    expect(s1).not.toBeNull();
    expect(s2).not.toBeNull();
    expect((s1 as HTMLElement).textContent ?? "").toContain(APPROVAL_COPY);
    expect((s2 as HTMLElement).textContent ?? "").toContain(APPROVAL_COPY);
  });
});
