// @vitest-environment jsdom
/**
 * admin-nav-badge-streaming Task 3 (spec §3.2/§3.3, AC-2/AC-3/AC-4/AC-6).
 *
 * The seam itself: the layout hands unresolved promises to the client tree,
 * AdminNav/NotifBell thread them to the hooks, and the pending shape renders
 * real nav chrome instead of blocking on two Supabase reads.
 *
 * Concrete failure modes caught:
 *  - the layout re-awaits a loader (silently restoring the barrier this arc
 *    removes — the badge counts would be correct and nobody would notice)
 *  - a loader that THROWS reaching the client as a rejected promise: React
 *    surfaces it as an unhandled rejection and the nav loses its chrome,
 *    instead of the ratified degradation (chip hidden / bell degraded)
 *  - the pending window rendering a 0, a NaN, or a degraded `!` before any
 *    value has arrived
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { stripCommentsForFile } from "@/tests/_shared/stripComments";

import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { AdminNav } from "@/components/admin/nav/AdminNav";
import type { BellCountResult } from "@/lib/admin/bellFeed";
import type { NeedsAttentionCountResult } from "@/lib/admin/needsAttentionCount";

let mockPathname = "/admin";
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

const fetchSpy = vi.fn();

beforeEach(() => {
  mockPathname = "/admin";
  fetchSpy.mockReset();
  fetchSpy.mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const REPO_ROOT = resolve(__dirname, "../../../..");
const LAYOUT_SRC = readFileSync(resolve(REPO_ROOT, "app/admin/layout.tsx"), "utf8");

/**
 * Source with comments removed — a rule about code must not read prose, and
 * this layout's prose is full of route globs (`/admin/*`) and the very
 * identifiers under test.
 *
 * Hand-rolled stripping is what got this wrong the first time: a naive
 * block-comment regex treated the `/*` inside `// … /admin/* additions …` as a
 * comment opener and swallowed 10 KB of real code, so every assertion below
 * passed or failed for a reason having nothing to do with the layout. The
 * shared module parses instead of pattern-matching, and
 * tests/cross-cutting/_metaStripCommentsSingleSource.test.ts forbids local
 * copies precisely so that class of bug lands once.
 */
const LAYOUT_PATH = "app/admin/layout.tsx";
const LAYOUT_CODE = stripCommentsForFile(LAYOUT_SRC, LAYOUT_PATH);

const never = <T,>(): Promise<T> => new Promise<T>(() => {});
const resolved = <T,>(value: T): Promise<T> => Promise.resolve(value);

describe("app/admin/layout.tsx — the badge reads are no longer awaited (AC-2)", () => {
  it("neither loader call expression is awaited, directly or inside a Promise.all", () => {
    // Both call sites still exist — the reads are ISSUED, just not awaited.
    expect(LAYOUT_CODE).toMatch(/loadBellUnseenCount\s*\(/);
    expect(LAYOUT_CODE).toMatch(/loadNeedsAttentionCount\s*\(/);

    expect(LAYOUT_CODE).not.toMatch(/await\s+loadBellUnseenCount\s*\(/);
    expect(LAYOUT_CODE).not.toMatch(/await\s+loadNeedsAttentionCount\s*\(/);
    // The barrier this arc removes was `await Promise.all([loadBell…, loadNeeds…])`.
    const awaitedGroups = LAYOUT_CODE.match(/await\s+Promise\.all\(\s*\[[\s\S]*?\]\s*\)/g) ?? [];
    for (const group of awaitedGroups) {
      expect(group).not.toMatch(/loadBellUnseenCount/);
      expect(group).not.toMatch(/loadNeedsAttentionCount/);
    }
  });

  it("both promises are wrapped so they can never reject, and are passed to AdminNav", () => {
    // Each loader call is followed by a `.catch` before its value is bound —
    // the executable half of this claim (that the caught value is the
    // discriminated infra_error, and that nothing rejects) lives in
    // tests/app/admin/layoutBadgePromiseWrappers.test.tsx, which runs the
    // layout. This row only pins that the wrap is at the CALL SITE, where a
    // reader of the layout can see it.
    expect(LAYOUT_CODE).toMatch(/loadBellUnseenCount\s*\([^)]*\)\s*\.catch\(/);
    expect(LAYOUT_CODE).toMatch(/loadNeedsAttentionCount\s*\(\s*\)\s*\.catch\(/);
    // …and the promises reach the client tree as props.
    expect(LAYOUT_CODE).toMatch(/bellCountPromise=\{bellCountPromise\}/);
    expect(LAYOUT_CODE).toMatch(/attentionCountPromise=\{attentionCountPromise\}/);
  });
});

describe("AdminNav — pending shape renders real chrome (AC-2, spec §3.3)", () => {
  it("renders nav chrome while BOTH promises are unresolved, with no badge and no degraded bell", () => {
    render(
      <AdminNav
        email="doug@example.com"
        bellCountPromise={never<BellCountResult>()}
        attentionCountPromise={never<NeedsAttentionCountResult>()}
      />,
    );
    // Chrome is present…
    expect(screen.getByTestId("admin-nav-topbar")).toBeInTheDocument();
    expect(screen.getByTestId("admin-bottom-tabs")).toBeInTheDocument();
    expect(screen.getByTestId("admin-nav-brand")).toBeInTheDocument();
    expect(screen.getByTestId("admin-user-avatar")).toBeInTheDocument();
    // …and the bell button renders in its NORMAL (not degraded) branch with no
    // count chip: "count unknown" is not "count zero" and is not "read failed".
    expect(screen.getByTestId("admin-notif-bell")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-notif-bell-degraded")).toBeNull();
    expect(screen.queryByTestId("admin-notif-badge")).toBeNull();
    expect(screen.queryByTestId("admin-attention-badge")).toBeNull();
  });
});

describe("AdminNav — seed result shapes reach the render gates (AC-3, AC-4)", () => {
  async function renderWithAttention(value: NeedsAttentionCountResult) {
    render(
      <AdminNav
        email="d@e.com"
        bellCountPromise={never<BellCountResult>()}
        attentionCountPromise={resolved(value)}
      />,
    );
  }

  it("attention seed 3 → badge shows 3", async () => {
    await renderWithAttention({ kind: "ok", count: 3 });
    await waitFor(() => expect(screen.getByTestId("admin-attention-badge")).toHaveTextContent("3"));
  });

  it("attention seed 12 → badge shows the 9+ cap", async () => {
    await renderWithAttention({ kind: "ok", count: 12 });
    await waitFor(() =>
      expect(screen.getByTestId("admin-attention-badge")).toHaveTextContent("9+"),
    );
  });

  it("attention seed 0 → badge stays hidden", async () => {
    await renderWithAttention({ kind: "ok", count: 0 });
    // Give the seed a chance to land, then assert the gate still hides it.
    await waitFor(() => expect(screen.getByTestId("admin-bottom-tabs")).toBeInTheDocument());
    await Promise.resolve();
    expect(screen.queryByTestId("admin-attention-badge")).toBeNull();
  });

  it("attention seed infra_error → badge stays hidden (fail-quiet D-4, no raw code in the UI)", async () => {
    await renderWithAttention({ kind: "infra_error" });
    await Promise.resolve();
    expect(screen.queryByTestId("admin-attention-badge")).toBeNull();
    expect(document.body.textContent).not.toMatch(/infra_error/i);
  });

  it("bell seed 4 → count chip 4; seed 15 → 9+; seed 0 → no chip", async () => {
    const { unmount } = render(
      <AdminNav
        email="d@e.com"
        bellCountPromise={resolved<BellCountResult>({ kind: "ok", count: 4 })}
        attentionCountPromise={never<NeedsAttentionCountResult>()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("admin-notif-badge")).toHaveTextContent("4"));
    unmount();

    const capped = render(
      <AdminNav
        email="d@e.com"
        bellCountPromise={resolved<BellCountResult>({ kind: "ok", count: 15 })}
        attentionCountPromise={never<NeedsAttentionCountResult>()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("admin-notif-badge")).toHaveTextContent("9+"));
    capped.unmount();

    render(
      <AdminNav
        email="d@e.com"
        bellCountPromise={resolved<BellCountResult>({ kind: "ok", count: 0 })}
        attentionCountPromise={never<NeedsAttentionCountResult>()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("admin-notif-bell")).toBeInTheDocument());
    await Promise.resolve();
    expect(screen.queryByTestId("admin-notif-badge")).toBeNull();
  });

  it("bell seed infra_error → the existing degraded `!` trigger (AC-6: catalog copy, no raw code)", async () => {
    render(
      <AdminNav
        email="d@e.com"
        bellCountPromise={resolved<BellCountResult>({ kind: "infra_error" })}
        attentionCountPromise={never<NeedsAttentionCountResult>()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("admin-notif-bell-degraded")).toBeInTheDocument(),
    );
    expect(document.body.textContent).not.toMatch(/ADMIN_ALERT_COUNT_FAILED/);
  });
});
