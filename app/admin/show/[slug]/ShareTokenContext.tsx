"use client";

/**
 * app/admin/show/[slug]/ShareTokenContext.tsx
 *
 * Client token cache shared by every crew-URL surface on the admin per-show page
 * (header chip, "Open crew page" link, share-link card). It lets this admin's own
 * rotate update all of them INSTANTLY (so the rotate-success banner no longer needs
 * to duplicate the URL), while a MONOTONIC EPOCH gate keeps the cache sound under
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

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type Ctx = { token: string | null; applyRotated: (token: string, epoch: number) => void };

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

  useEffect(() => {
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
  }, [initialToken, initialEpoch]);

  return (
    <ShareTokenContext.Provider value={{ token: state.token, applyRotated }}>
      {children}
    </ShareTokenContext.Provider>
  );
}

export function useShareToken(): Ctx {
  const ctx = useContext(ShareTokenContext);
  if (!ctx) throw new Error("useShareToken must be used within ShareTokenProvider");
  return ctx;
}
