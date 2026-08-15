"use client";
// Multi-hold disclosure for the needs-attention identity_hold card (spec §7).
// Owns ONLY open/closed state; summaries arrive as server-rendered children
// (IgnoredSheetsDisclosure composition). Caps live in lib/admin/identityHolds
// (server-safe; a client-module export would be unreadable from the server inbox).
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { CollapsePanel } from "@/components/admin/CollapsePanel";

export function IdentityHoldDisclosure({
  showId,
  title,
  slug,
  count,
  children,
}: {
  showId: string;
  title: string | null;
  slug: string;
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = `identity-hold-panel-${showId}`;
  const verb = open ? "Hide" : "Show";
  const forShow = title ? `${title} (${slug})` : slug;
  return (
    // No gap utility here: CollapsePanel's zero-height closed track would keep a
    // parent gap visible (CollapsePanel.tsx:22-25); open-state spacing is the pt-3
    // wrapper below (IgnoredSheetsDisclosure.tsx:100-104 precedent).
    <div className="flex flex-col">
      <button
        type="button"
        data-testid={`identity-hold-toggle-${showId}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${verb} details for ${count} held changes for ${forShow}`}
        onClick={() => setOpen((v) => !v)}
        // ring-offset-surface, NOT the IgnoredSheetsDisclosure precedent's
        // ring-offset-bg: that disclosure sits on the page background, this one
        // sits inside a bg-surface card, and DESIGN.md section 15 requires the
        // offset to match the surrounding container. The card's own footer link
        // (reviewLinkClass) already offsets to surface.
        className="group flex min-h-tap-min items-center gap-2 rounded-sm text-left text-sm text-text transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        <ChevronRight
          aria-hidden="true"
          className={`size-4 shrink-0 transition-transform duration-fast ${open ? "rotate-90" : ""}`}
        />
        <span>{verb} details</span>
      </button>
      {/* region={false}: this card repeats per show (20 dashboard / 100 page cap);
          CollapsePanel mandates the landmark opt-out for many-panel callers
          (CollapsePanel.tsx:40-47; RecentAutoAppliedStrip precedent). */}
      <CollapsePanel
        open={open}
        id={panelId}
        region={false}
        label={title ? `Held changes for ${title} (${slug})` : `Held changes for ${slug}`}
      >
        <div className="flex flex-col gap-1 pt-3">{children}</div>
      </CollapsePanel>
    </div>
  );
}
