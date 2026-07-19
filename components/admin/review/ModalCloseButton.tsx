"use client";

import { X } from "lucide-react";
import { forwardRef } from "react";
import { useReviewModalClose } from "./ReviewModalShell";

/** Shared modal X. Lives in each consumer's `header` slot, which the shell
 *  renders INSIDE its close provider — so the context resolves here even
 *  though a hook call in the consumer's own body would not (spec §3.1a). */
export const ModalCloseButton = forwardRef<HTMLButtonElement, { testId: string }>(
  function ModalCloseButton({ testId }, ref) {
    const requestClose = useReviewModalClose();
    return (
      <button
        ref={ref}
        type="button"
        data-testid={testId}
        aria-label="Close"
        onClick={requestClose}
        className="-mr-1 inline-flex size-tap-min shrink-0 items-center justify-center rounded-sm text-text-subtle transition-colors duration-fast hover:bg-surface-sunken hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        <X aria-hidden="true" className="size-5" />
      </button>
    );
  },
);
