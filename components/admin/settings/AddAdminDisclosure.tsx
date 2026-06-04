"use client";

/**
 * components/admin/settings/AddAdminDisclosure.tsx (M12.3 items 12c/12d)
 *
 * Client disclosure island for the Administrators section. Renders the
 * "Add admin" trigger button (placed in the section heading row, OUTSIDE the
 * card) and, when expanded, the AddAdminForm below the active list. The form
 * is HIDDEN until the trigger is pressed (design parity with settings2.png).
 *
 * State is purely local UI (open/closed); it carries no server contract — the
 * AddAdminForm still owns its own useActionState write path. We intentionally
 * use a controlled boolean rather than native <details> so the trigger can sit
 * in the heading row while the disclosed form renders lower in the section
 * (the summary/content of <details> must be siblings).
 */
import { useState } from "react";
import { Plus } from "lucide-react";

import { AddAdminForm } from "@/app/admin/settings/admins/AddAdminForm";

export function AddAdminTrigger({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      data-testid="admin-add-admin-trigger"
      aria-expanded={open}
      aria-controls="admin-settings-add-admin"
      onClick={onToggle}
      className="inline-flex min-h-tap-min items-center justify-center gap-1.5 self-start rounded-sm bg-accent px-4 text-sm font-semibold text-accent-text shadow-(--shadow-tile) transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
    >
      <Plus aria-hidden="true" className="size-4 shrink-0" />
      Add admin
    </button>
  );
}

/**
 * Wraps the heading-row trigger and the disclosed form in one client island so
 * a single open/closed state drives both. `heading` and `list` are rendered by
 * the server section and passed through as children-by-slot so the count logic
 * stays server-side.
 */
export function AddAdminDisclosure({
  heading,
  list,
}: {
  heading: React.ReactNode;
  list: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        {heading}
        <AddAdminTrigger open={open} onToggle={() => setOpen((v) => !v)} />
      </header>

      <div
        data-testid="admin-settings-admins-card"
        className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4"
      >
        {list}
        {open ? (
          <div id="admin-settings-add-admin" className="flex flex-col gap-3">
            <AddAdminForm />
          </div>
        ) : null}
      </div>
    </>
  );
}
