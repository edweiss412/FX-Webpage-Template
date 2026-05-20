// app/help/_components/TipFromSheets.tsx
import type { ReactNode } from "react";

export function TipFromSheets({ children }: { children: ReactNode }) {
  return (
    <aside className="my-4 rounded-md border border-accent bg-info-bg px-4 py-3">
      <span className="block text-xs uppercase tracking-wider font-bold text-text-strong mb-1">
        From Sheets
      </span>
      <div className="leading-relaxed text-sm">{children}</div>
    </aside>
  );
}
