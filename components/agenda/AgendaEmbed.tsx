"use client";
/**
 * components/agenda/AgendaEmbed.tsx — M7 Task 7.9 / AC-7.1.
 *
 * Crew-facing agenda PDF embed. Renders an "Open agenda" affordance in
 * the DiagramsTile body whenever the show has at least one
 * `agenda_links` entry carrying a Drive `fileId`. Tapping opens an
 * in-page sheet that loads the PDF inline via PDF.js (react-pdf),
 * sourced from the M7 proxy route `/api/asset/agenda/<show>/<fileId>`.
 *
 * The proxy route binds `[id]` to `shows.agenda_links[*].fileId` so a
 * leaked URL can never proxy arbitrary Drive content (see
 * `app/api/asset/agenda/[show]/[id]/route.ts`). Non-PDF MIMEs return
 * 410 from the route — the sheet's `<AgendaPdfViewer>` surfaces a
 * graceful retry/"Open in Drive" fallback when the PDF can't load.
 *
 * Crew DOM hygiene: the AgendaEmbed never carries a raw Drive/Docs
 * host substring. The proxy URL is what every byte fetch references;
 * the sheet itself renders the file id only inside the
 * `/api/asset/agenda/` path, never as a Drive host.
 *
 * Multi-doc (spec §4.6): one "View agenda" affordance per `agenda_links`
 * entry that carries a Drive `fileId`. The per-doc badge is the
 * `AGENDA LINK` suffix ("· RFI" / "· PCF") via `agendaDisplayLabel`; a
 * bare `AGENDA` label has no badge. Each affordance opens its own
 * `AgendaSheet`. url-only entries (no parsed fileId) have no affordance.
 */
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { FileText, X } from "lucide-react";

import { useDialogFocus } from "@/lib/a11y/dialogFocus";
import { agendaDisplayLabel } from "@/lib/agenda/agendaLabel";

// Defer pdfjs entirely until the sheet opens. Without `next/dynamic`,
// importing AgendaPdfViewer at module top would pull `react-pdf` +
// `pdfjs-dist` (~200kB gz total) into the crew-page chunk even for
// shows that have no agenda. `ssr: false` keeps the worker URL setup
// off the server-render path.
const AgendaPdfViewer = dynamic(
  () => import("@/components/agenda/AgendaPdfViewer").then((m) => m.AgendaPdfViewer),
  {
    ssr: false,
    loading: () => (
      <div role="status" aria-live="polite" className="py-8 text-sm text-text-subtle">
        Loading agenda…
      </div>
    ),
  },
);

export type AgendaLink = {
  label?: string;
  fileId?: string;
  url?: string;
};

type AgendaEmbedProps = {
  showId: string;
  agendaLinks: AgendaLink[];
};

export function AgendaEmbed({ showId, agendaLinks }: AgendaEmbedProps) {
  // Which doc's sheet is open (by fileId); null = all closed. A single
  // sheet is open at a time, so one fileId is sufficient state.
  const [openFileId, setOpenFileId] = useState<string | null>(null);

  // Multi-doc (§4.6): one affordance per entry that carries a Drive
  // fileId. url-only entries (no parsed fileId) have no affordance — the
  // proxy route can't bind to them.
  const docs = agendaLinks.filter((link) => link.fileId);
  if (docs.length === 0) return null;

  const openDoc = docs.find((d) => d.fileId === openFileId) ?? null;
  const openBadge = openDoc?.label ? agendaDisplayLabel(openDoc.label) : null;

  return (
    <div data-testid="agenda-embed" className="flex flex-wrap gap-2">
      {docs.map((link) => {
        const fileId = link.fileId as string;
        const badge = link.label ? agendaDisplayLabel(link.label) : null;
        return (
          <button
            key={fileId}
            type="button"
            onClick={() => setOpenFileId(fileId)}
            className="inline-flex min-h-tap-min items-center gap-2 self-start rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm font-medium text-text-strong shadow-(--shadow-tile) hover:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <FileText aria-hidden="true" className="size-4 text-accent-on-bg" />
            View agenda
            {badge ? <span className="text-text-subtle">· {badge}</span> : null}
          </button>
        );
      })}
      {openDoc ? (
        <AgendaSheet
          src={`/api/asset/agenda/${showId}/${openDoc.fileId as string}`}
          label={openBadge ?? "Agenda"}
          onClose={() => setOpenFileId(null)}
        />
      ) : null}
    </div>
  );
}

function AgendaSheet({ src, label, onClose }: { src: string; label: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useDialogFocus(dialogRef, closeRef);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${label} agenda`}
      data-testid="agenda-sheet"
      data-pdf-src={src}
      className="fixed inset-0 z-50 flex flex-col bg-bg"
    >
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText aria-hidden="true" className="size-4 text-accent-on-bg" />
          <span className="text-sm font-semibold text-text-strong">{label}</span>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close agenda"
          className="inline-flex size-11 items-center justify-center rounded-pill text-text-strong hover:bg-surface-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <X aria-hidden="true" className="size-6" />
        </button>
      </header>
      <div className="flex flex-1 justify-center overflow-y-auto bg-surface-sunken py-4">
        <AgendaPdfViewer src={src} />
      </div>
    </div>
  );
}
