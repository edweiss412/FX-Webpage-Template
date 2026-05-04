/**
 * tests/_helpers/showViewerFixtures.ts (M4 Task 4.16 — Minor 7 dedup)
 *
 * Centralized type + factory helpers for the 5-arm `ShowViewer` union used by
 * `lib/auth/resolveShowViewer.ts`. Both route tests
 * (`tests/api/realtime/subscriber-token.test.ts` and
 * `tests/api/show-version.test.ts`) previously inlined the same union literal.
 * That duplication was a Minor finding from the Task 4.16 Checkpoint A code-
 * quality review — adding a 6th arm in the future would require touching
 * every redeclaration site, and a stale copy would mask compile errors.
 *
 * The factory shape mirrors the runtime contract emitted by
 * `lib/auth/resolveShowViewer.ts`. The full union (including denied /
 * forbidden) is the type used to type the `vi.hoisted` mock state; the
 * factories cover only the success arms because tests construct denied /
 * forbidden inline with literal kinds.
 */

export type ShowViewerFixture =
  | { kind: "admin"; email: string; show_id: string }
  | { kind: "crew_link"; show_id: string; crew_member_id: string }
  | {
      kind: "crew_google";
      email: string;
      show_id: string;
      crew_member_id: string;
    }
  | { kind: "denied"; reason: string }
  | {
      kind: "forbidden";
      reason: string;
      show_id: string;
      email?: string;
    };

export function mockAdminViewer(
  showId: string,
  email = "edweiss412@gmail.com",
): Extract<ShowViewerFixture, { kind: "admin" }> {
  return { kind: "admin", email, show_id: showId };
}

export function mockCrewLinkViewer(
  showId: string,
  crewMemberId: string,
): Extract<ShowViewerFixture, { kind: "crew_link" }> {
  return { kind: "crew_link", show_id: showId, crew_member_id: crewMemberId };
}

export function mockCrewGoogleViewer(
  showId: string,
  crewMemberId: string,
  email = "alice@fxav.test",
): Extract<ShowViewerFixture, { kind: "crew_google" }> {
  return {
    kind: "crew_google",
    email,
    show_id: showId,
    crew_member_id: crewMemberId,
  };
}
