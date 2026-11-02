/**
 * components/show-panels/MiniAvatar.tsx
 *
 * Small identity chip shared by the Hotels (guest chips) and Transport
 * (driver / load-out) bodies. Moved here from
 * components/admin/wizard/step3ReviewSections.tsx with those bodies (crew page
 * redesign PR B plan Task 8); the admin file has no other caller. Reuses the
 * crew identity palette (`avatarColor`) + `deriveInitials` so a person's swatch
 * is stable across every surface (DESIGN.md §1.4 identity-avatar exception).
 * `aria-hidden` because the decorated name is always rendered as live text
 * beside it. `sizeClass` carries the diameter + text size. `ringed` keeps the
 * 2px surface ring; the Hotels chip drops it because its avatar sits inside a
 * bordered pill rather than beside bare text.
 *
 * Server-safe and hook-free (the show-panels boundary,
 * tests/components/show-panels/_metaShowPanelsBoundary.test.ts).
 */
import { deriveInitials } from "@/components/atoms/Avatar";
import { avatarColor } from "@/lib/crew/avatarColor";
import { cn } from "@/lib/ui/cn";

export function MiniAvatar({
  name,
  sizeClass,
  testId,
  ringed = true,
}: {
  name: string;
  sizeClass: string;
  testId?: string;
  ringed?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      data-testid={testId}
      style={{ backgroundColor: avatarColor(name) }}
      className={cn(
        "grid shrink-0 place-items-center rounded-pill font-semibold text-white",
        ringed && "border-2 border-surface",
        sizeClass,
      )}
    >
      {deriveInitials(name)}
    </span>
  );
}
