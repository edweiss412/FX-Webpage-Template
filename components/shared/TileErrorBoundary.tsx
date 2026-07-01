"use client";

/**
 * components/shared/TileErrorBoundary.tsx — client-side React ErrorBoundary
 * that catches descendant render-time errors so a single tile's runtime
 * failure shows a fallback while the rest of the page stays rendered.
 * Spec §12.1 / AC-9.3 / Task 9.2.
 *
 * Catches: errors thrown during descendant rendering, lifecycle methods,
 * or constructors. (React's componentDidCatch lifecycle.)
 *
 * DOES NOT catch: errors from event handlers, Promise rejections, async
 * setState. Those need handler-level try/catch that converts the error
 * into render state, OR a global error reporter (Sentry).
 *
 * Pairs with <TileServerFallback>: the server wrapper catches throws
 * during the Server Component render path; this boundary catches throws
 * that escape into the client rendering tree after hydration.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

import { captureBoundaryError } from "@/lib/observe/captureBoundaryError";

import { TileErrorFallback } from "./TileErrorFallback";

type TileErrorBoundaryProps = {
  children: ReactNode;
  /** Custom fallback element; defaults to <TileErrorFallback />. */
  fallback?: ReactNode;
  /** Optional identifier for log/Sentry tagging. */
  tileId?: string;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class TileErrorBoundary extends Component<TileErrorBoundaryProps, State> {
  override state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Sentry (tagged with tileId) + the app_events mirror, via the single guarded entry point.
    // This boundary is the per-tile leaf so the whole page survives a single tile crash.
    // info.componentStack is `string | null` → spread only when present (exactOptionalPropertyTypes).
    captureBoundaryError(error, "tile", {
      ...(info.componentStack ? { componentStack: info.componentStack } : {}),
      tileId: this.props.tileId ?? "unknown",
    });
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <TileErrorFallback />;
    }
    return this.props.children;
  }
}
