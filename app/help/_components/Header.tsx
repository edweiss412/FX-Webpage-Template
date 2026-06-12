import Link from "next/link";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-border py-4 mb-6">
      <Link
        href="/help"
        data-testid="help-header-brand"
        className="inline-flex min-h-tap-min items-center px-2 -mx-2 font-semibold text-text-strong"
      >
        FXAV Help
      </Link>
      <div className="flex items-center gap-4">
        {/* r2 — round-1 finding 2: ThemeToggle is REQUIRED per AC-11.4.
            The component lives at components/layout/ThemeToggle.tsx
            (verified at plan-write time via `find components -name ThemeToggle`). */}
        <ThemeToggle />
        {/* aria-label drops the decorative "→" from the accessible name
            without splitting the text run (flex drops the space between
            split items — byte-level screenshot drift). */}
        <Link
          href="/admin"
          aria-label="Back to admin"
          className="text-sm text-text hover:text-text-strong underline underline-offset-2 min-h-tap-min flex items-center"
        >
          Back to admin →
        </Link>
      </div>
    </header>
  );
}
