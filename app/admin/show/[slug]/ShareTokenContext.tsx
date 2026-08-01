"use client";

/**
 * app/admin/show/[slug]/ShareTokenContext.tsx
 *
 * Client token cache for the crew-URL surface on the admin per-show page: the
 * ShareHub popover's crew-link row. (It once fanned out to a header chip, an
 * "Open crew page" link and a share-link card; the card was removed when the hub
 * absorbed it and the other two were deleted as orphans.) It lets this admin's own
 * rotate update the URL INSTANTLY (so the rotate-success banner no longer needs
 * to duplicate it), while a MONOTONIC EPOCH gate keeps the cache sound under
 * any ordering of server refreshes / rotations.
 *
 * `epoch` = shows.picker_epoch, bumped by every token rotation (rotate / archive /
 * unarchive / reset). "Accept iff serverEpoch >= held epoch" is total and
 * order-independent, so:
 *   - a stale in-flight router.refresh() (started with the OLD token, resolves late)
 *     carries a lower epoch and is rejected — no revert to a dead link;
 *   - a genuinely newer token (another admin's rotation, or a lifecycle rotation)
 *     carries a higher epoch and is accepted — no staleness regression vs the
 *     server-rendered status quo.
 * Token + epoch are read from ONE atomic DB snapshot (loadShowShareToken →
 * admin_read_share_token), and the rotate result carries its own atomic new_epoch,
 * so the (token, epoch) pair is never mismatched. See the design spec §3.0/§3.2.
 *
 * The caller keys this provider by show.id so an App Router client navigation
 * between shows remounts it (fresh seed) rather than leaking one show's token into
 * another show's URL.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type Ctx = {
  token: string | null;
  applyRotated: (token: string, epoch: number) => void;
  /** Monotone count of SEED-driven token changes — a rotation this browser did
   *  NOT apply locally (another admin's rotate, a lifecycle rotation). A local
   *  rotate goes through applyRotated first, so its follow-up seed carries an
   *  equal token and never counts. Non-null-to-non-null changes only (spec
   *  2026-08-01-announce-a11y-pass §4.1). */
  remoteTokenChanges: number;
};

const ShareTokenContext = createContext<Ctx | null>(null);

export function ShareTokenProvider({
  initialToken,
  initialEpoch,
  children,
}: {
  initialToken: string | null;
  initialEpoch: number;
  children: ReactNode;
}) {
  const [state, setState] = useState({ token: initialToken, epoch: initialEpoch });

  const applyRotated = useCallback(
    (token: string, epoch: number) => setState((p) => (epoch >= p.epoch ? { token, epoch } : p)),
    [],
  );

  // Reconcile a new server seed (a router.refresh bringing a fresh token/epoch)
  // through the SAME monotonic-epoch gate — done DURING render (the React-blessed
  // "adjust state when a prop changes" pattern) rather than in an effect, so there
  // is no extra commit/flash and no cascading-render lint hazard. `seed` records
  // the last server pair we reconciled; a change to either prop fires the gate once.
  const [seed, setSeed] = useState({ token: initialToken, epoch: initialEpoch });
  const [remoteTokenChanges, setRemoteTokenChanges] = useState(0);
  if (seed.token !== initialToken || seed.epoch !== initialEpoch) {
    setSeed({ token: initialToken, epoch: initialEpoch });
    // Remote-change bump (spec 2026-08-01-announce-a11y-pass §4.1): the seed
    // gate runs ONCE per server seed (the `seed` record de-dupes StrictMode /
    // re-render replays), so this counts each accepted non-null-to-non-null
    // token CHANGE exactly once. Reads this render's `state` — the same pair
    // the accept gate below compares against. Outside the setState updater
    // (updaters must stay pure).
    if (
      initialEpoch >= state.epoch &&
      state.token !== null &&
      initialToken !== null &&
      initialToken !== state.token
    ) {
      setRemoteTokenChanges((n) => n + 1);
    }
    setState((p) => {
      if (initialEpoch < p.epoch) return p; // stale refresh — reject
      if (initialToken === null) {
        // Server reports no token at this (>= held) epoch. If the epoch STRICTLY
        // advanced, the null is authoritative (show went ineligible / token genuinely
        // absent) → fail closed. If SAME epoch, it is a transient read fault on the
        // current generation (a real rotation would have advanced the epoch) → keep.
        return initialEpoch > p.epoch ? { token: null, epoch: initialEpoch } : p;
      }
      return { token: initialToken, epoch: initialEpoch };
    });
  }

  // Stable value ref so consumers only re-render when the token itself changes
  // (applyRotated is already stable). Without this, every provider render hands
  // them a fresh object and re-renders them all.
  const value = useMemo<Ctx>(
    () => ({ token: state.token, applyRotated, remoteTokenChanges }),
    [state.token, applyRotated, remoteTokenChanges],
  );

  return <ShareTokenContext.Provider value={value}>{children}</ShareTokenContext.Provider>;
}

export function useShareToken(): Ctx {
  const ctx = useContext(ShareTokenContext);
  if (!ctx) throw new Error("useShareToken must be used within ShareTokenProvider");
  return ctx;
}
