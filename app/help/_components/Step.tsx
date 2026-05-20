// app/help/_components/Step.tsx
import type { ReactNode } from "react";

export function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="my-3 flex gap-3 items-start">
      <span
        className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-raised text-accent-on-bg border-2 border-accent font-bold text-base tabular-nums leading-none"
        aria-hidden="true"
      >
        {n}
      </span>
      <div className="pt-0.5 leading-relaxed">
        <span className="sr-only">Step {n}: </span>
        {children}
      </div>
    </div>
  );
}
