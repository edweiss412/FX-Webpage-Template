/**
 * components/crew/WrappedSection.tsx — per-block render-throw containment for
 * the crew §9 sections. The SYNCHRONOUS analog of <WrappedTile> /
 * <TileServerFallback>. Crew-redesign Task 9 (R11-HIGH-1 / §4.13 / wp-13).
 *
 * WHY A SYNCHRONOUS WRAPPER (not <WrappedTile> directly):
 *   The crew sections (components/crew/sections/*Section.tsx) are SYNCHRONOUS
 *   Server Components — they receive an already-loaded `data: ShowForViewer`
 *   and run synchronous throwable transforms (diagrams build, transport
 *   projection, scope aggregation, notes aggregation + hero context build,
 *   schedule day aggregation, crew roster map, budget rows). <WrappedTile>
 *   composes the ASYNC <TileServerFallback> (it `await`s a `load()` and only
 *   then `render`s), so it cannot be embedded inside a synchronous section and
 *   resolved by a synchronous render — and the existing section tests render
 *   each section synchronously and assert inner `data-testid`s immediately.
 *   <WrappedSection> keeps the SAME containment + admin-alert contract but runs
 *   it synchronously so it composes inside the sections without changing the
 *   normal-render DOM those tests assert.
 *
 * H2 "DIRECT INVOCATION" CONTRACT (mirrors TileServerFallback.tsx:8-17):
 *   The throwable block is passed as a `render: () => ReactNode` FUNCTION and
 *   INVOKED inside this component's own try/catch. It MUST NOT be passed as
 *   already-evaluated `children` — a synchronous throw while the PARENT
 *   evaluates the child JSX happens BEFORE this boundary runs and escapes it
 *   (the M9 Codex round-1 H2 bug, applied to the synchronous case). All
 *   throwing work (the transform that can throw) lives inside `render`.
 *
 * ON THROW:
 *   - records the tileId and the thrown message in the per-request ledger;
 *   - returns the <TileErrorFallback> element (identical fallback to the tiles)
 *     so the rest of the section keeps rendering. Crew see only the inline
 *     fallback (no raw error code — invariant 5).
 *
 * THIS COMPONENT NO LONGER WRITES THE ALERT OR THE LOG. Both moved to
 * `lib/crew/sweepTileRenderAlerts.ts`, which `_CrewShell` schedules via
 * next/server `after()`. Two reasons, and neither is stylistic:
 *   1. Resolution must be keyed on the (tile, observer) pair, and only the shell
 *      knows the observer, so the write had to move to a layer that does.
 *   2. This surface is synchronous and cannot await. `lib/log` persists to
 *      app_events asynchronously, so a log fired here could be dropped by a
 *      serverless freeze — losing the durable evidence that makes a spurious
 *      auto-resolve survivable. The sweep runs post-response and awaits it.
 *
 * Synchronous Server Component (no `'use client'`, no `async`).
 */
import type { ReactElement, ReactNode } from "react";

import { TileErrorFallback } from "@/components/shared/TileErrorFallback";
import { type TileRenderLedger } from "@/lib/crew/tileRenderLedger";

type WrappedSectionProps = {
  /**
   * Stable crew-namespaced identifier — `crew:<section>:<block>`. Stamped into
   * admin_alerts.context.tileId so the dashboard can tell blocks apart.
   */
  tileId: string;
  /**
   * Show id. Retained on the contract because every call site threads it and it
   * identifies the tile's show, but this component no longer writes the alert,
   * so it is not read here: the sweep takes `showId` from the shell.
   */
  showId?: string | null;
  /**
   * Show title (sheet name). Same status as `showId`: retained on the contract,
   * not read here. `context.sheet_name` is stamped by the sweep from
   * `data.show.title`, which is the same value by construction.
   */
  sheetName?: string | null;
  /**
   * Per-request ledger this section records into. REQUIRED so a section cannot
   * be mounted without one. The topology meta-test additionally bounds WHERE a
   * section may be constructed, which is what actually guarantees the ledger
   * reaching the sweep: a caller could otherwise type-safely pass a throwaway.
   */
  ledger: TileRenderLedger;
  /**
   * The throwable block. INVOKED inside try/catch (see the H2 contract above);
   * must be a function, NOT pre-evaluated `children`.
   */
  render: () => ReactNode;
  /** Optional custom fallback element. Defaults to <TileErrorFallback />. */
  fallback?: ReactElement;
};

export function WrappedSection({
  tileId,
  ledger,
  render,
  fallback,
}: WrappedSectionProps): ReactNode {
  try {
    // INSIDE the try, deliberately. This component's whole contract is that it
    // cannot throw past its own boundary; recording outside would let a bad
    // ledger escape as a TypeError and take the page to error.tsx instead of
    // rendering the inline fallback. Ordering is safe: cleanTileIds is
    // `attempted` minus `failed`, and the sweep iterates `failed` separately.
    ledger.attempted.add(tileId);
    return render();
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    ledger.failed.set(tileId, err.message);
    return fallback ?? <TileErrorFallback />;
  }
}
