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
 * Crew DOM hygiene: the AgendaEmbed never carries a `drive.google.com`
 * substring. The proxy URL is what every byte fetch references; the
 * sheet itself renders the file id only inside the `/api/asset/agenda/`
 * path, never as a Drive host.
 *
 * Multi-doc support is a v2 candidate. v1 surfaces the FIRST agenda
 * link with a fileId; remaining links (e.g., a separate Drive folder
 * with appendices) wait for M9 polish.
 */
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { FileText, X } from "lucide-react";

// Defer pdfjs entirely until the sheet opens. Without `next/dynamic`,
// importing AgendaPdfViewer at module top would pull `react-pdf` +
// `pdfjs-dist` (~200kB gz total) into the crew-page chunk even for
// shows that have no agenda. `ssr: false` keeps the worker URL setup
// off the server-render path.
const AgendaPdfViewer = dynamic(
  () => import("@/components/agenda/AgendaPdfViewer").then((m) => m.AgendaPdfViewer),
  {
    ssr: false,
    loading: () => <div className="py-8 text-sm text-text-subtle">Loading agenda…</div>,
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
  const [open, setOpen] = useState(false);

  // v1: surface the FIRST agenda_links entry that carries a Drive
  // fileId. Links with only a free-text `url` (no parsed fileId) fall
  // out of v1 — the proxy route can't bind to them. M9 polish: tabbed
  // multi-doc viewer + external-link fallback for url-only entries.
  const primary = agendaLinks.find((link) => link.fileId);
  if (!primary) return null;
  const fileId = primary.fileId as string;

  const pdfSrc = `/api/asset/agenda/${showId}/${fileId}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 self-start rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm font-medium text-text-strong shadow-(--shadow-tile) hover:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <FileText aria-hidden="true" className="size-4 text-accent-on-bg" />
        Open agenda
        {primary.label ? (
          <span className="text-text-subtle">— {primary.label}</span>
        ) : null}
      </button>
      {open ? (
        <AgendaSheet
          src={pdfSrc}
          label={primary.label ?? "Agenda"}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function AgendaSheet({
  src,
  label,
  onClose,
}: {
  src: string;
  label: string;
  onClose: () => void;
}) {
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
      role="dialog"
      aria-modal="true"
      aria-label={`${label} — agenda`}
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
