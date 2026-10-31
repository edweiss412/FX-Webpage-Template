"use client";

/**
 * components/crew/CrewQuickFacts.tsx — the home's quick facts block (crew page
 * redesign spec §4.5, §7, §8 invariant 3, §9.3, §9.4).
 *
 * Up to four small tiles, built on the server by `buildQuickFacts`
 * (lib/crew/quickFacts.ts), so the props carry only what this viewer may see
 * (plan harness rule "Client props"). The block and its heading are omitted
 * when no fact resolves (§9.3); no empty-state copy.
 *
 * Layout: a 2-column grid, `items-stretch`, every tile `h-full`, so tiles in a
 * row share a height. One tile spans both columns; of three, the third does.
 * Values wrap to at most 3 lines (`line-clamp-3`); the full text is in the
 * section the fact comes from. Every value is `select-text`, so press-and-hold
 * copying works when the clipboard does not.
 *
 * Copy: `navigator.clipboard.writeText`. The toast lives in a polite live region
 * that stays mounted for as long as the block does, so only its TEXT changes
 * (tests/components/_metaLiveRegionMounting.test.ts, shape 1). A success says
 * "Copied" for `COPY_FEEDBACK_RESET_MS` (2 s); a failure (no clipboard API,
 * permission denied, insecure context) gives the §9.3 instruction for
 * `COPY_FAILED_TOAST_MS`, as long as search's failure toast, because it is an
 * instruction rather than a confirmation. A second copy replaces the first and
 * restarts the hold.
 *
 * Motion (spec §7): the toast fades and rises 4px in at `--duration-fast`, holds,
 * and fades out at `--duration-fast`; the fade's end clears the text, so the
 * next "Copied" is a change the region announces. Both keyframes are
 * `motion-safe`, and under reduced motion the hold's end hides the toast at
 * once, since no fade runs to end it.
 *
 * The block is outside search coverage (`data-search-skip`): every fact repeats
 * a line its own section renders, which is where search takes the reader.
 */

import { CheckIcon, CopyIcon, MailIcon, MessageSquareIcon, PhoneIcon } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";

import {
  BedIcon,
  CarIcon,
  DockIcon,
  MapPinIcon,
  PhoneIcon as ContactIcon,
  ShirtIcon,
  WifiIcon,
} from "@/components/crew/icons/sectionIcons";
import { NewTabHint } from "@/components/shared/NewTabHint";
import { usePrefersReducedMotion } from "@/lib/a11y/usePrefersReducedMotion";
import type { QuickFact, QuickFactAction, QuickFactId, QuickFactLine } from "@/lib/crew/quickFacts";
import { COPY_FAILED_TOAST_MS, COPY_FEEDBACK_RESET_MS } from "@/lib/ui/copyFeedback";
import { cn } from "@/lib/ui/cn";

/** Spec §9.1. */
const COPIED = "Copied";
/** Spec §9.3. */
const COPY_FAILED = "Couldn't copy. Press and hold the text to copy it.";

const ICON: Record<QuickFactId, ComponentType<{ className?: string }>> = {
  wifi: WifiIcon,
  hotel: BedIcon,
  dock: DockIcon,
  contact: ContactIcon,
  parking: CarIcon,
  dressCode: ShirtIcon,
  address: MapPinIcon,
};

type ContactAction = Extract<QuickFactAction, { kind: "call" | "text" | "email" }>;

/** Each contact link's verb: its accessible name is the verb and the contact (spec §9.4). */
const CONTACT_VERB: Record<ContactAction["kind"], string> = {
  call: "Call",
  text: "Text",
  email: "Email",
};

type ToastPhase = "idle" | "shown" | "leaving";
type Toast = { seq: number; text: string; copied: boolean; phase: ToastPhase };

const IDLE: Toast = { seq: 0, text: "", copied: false, phase: "idle" };

/** Tiles that span both columns: a lone tile, and the third of three. */
function spans(index: number, count: number): boolean {
  return count === 1 || (count === 3 && index === 2);
}

/** A tile's call, text and email links. */
function contactLinks(fact: QuickFact): ContactAction[] {
  return fact.actions.filter(
    (a): a is ContactAction => a.kind === "call" || a.kind === "text" || a.kind === "email",
  );
}

/**
 * Tiles that span both columns while the grid is narrower than
 * `--container-quick-pair` (UI-gate re-run P3-3 / critique N3). A half-width
 * tile there cannot hold three 44px actions on one row, so a tile with all three
 * spans; so does any half-width tile that would then sit alone on its row, found
 * by walking the two-column flow. Every tile that spans anyway still does.
 */
function narrowSpans(facts: readonly QuickFact[]): boolean[] {
  const span = facts.map((fact, i) => spans(i, facts.length) || contactLinks(fact).length >= 3);
  let open = -1; // a half-width tile waiting for its row's second column
  span.forEach((full, i) => {
    if (!full) {
      open = open < 0 ? i : -1;
      return;
    }
    if (open >= 0) span[open] = true;
    open = -1;
  });
  if (open >= 0) span[open] = true;
  return span;
}

/**
 * The Who to call tile's call, text and email links: PersonRow's icon-only 44px
 * action (components/crew/primitives/PersonRow.tsx `ACTION_CLASS`), so one
 * product has one contact affordance, and its `border-text-faint` outline holds
 * the control-outline contrast floor (DESIGN.md §1.2a).
 */
const ICON_LINK = cn(
  "inline-flex size-tap-min min-h-tap-min shrink-0 items-center justify-center",
  "rounded-[11px] border border-text-faint bg-surface text-text",
  "transition-colors duration-fast",
  "hover:bg-surface-sunken hover:text-accent-on-bg",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
);

export function CrewQuickFacts({ facts }: { facts: readonly QuickFact[] }) {
  const reduced = usePrefersReducedMotion() === true;
  const [toast, setToast] = useState<Toast>(IDLE);
  const seqRef = useRef(0);
  const toastRef = useRef<HTMLParagraphElement | null>(null);

  // The hold: a toast that is shown starts leaving when its window ends. Two
  // calls, each with a named delay, so the timing inventory resolves both
  // (DESIGN.md §5.5).
  useEffect(() => {
    if (toast.phase !== "shown") return;
    const end = () =>
      setToast((t) => (t.seq !== toast.seq ? t : reduced ? IDLE : { ...t, phase: "leaving" }));
    const timer = toast.copied
      ? window.setTimeout(end, COPY_FEEDBACK_RESET_MS)
      : window.setTimeout(end, COPY_FAILED_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast.phase, toast.seq, toast.copied, reduced]);

  // The fade-out's end clears the toast, so the next message is a change the
  // region announces. A native listener rather than `onAnimationEnd`, so the
  // event is the browser's own `animationend` whatever React's vendor mapping.
  useEffect(() => {
    const el = toastRef.current;
    if (toast.phase !== "leaving" || el === null) return;
    const done = () => setToast((t) => (t.seq === toast.seq ? IDLE : t));
    el.addEventListener("animationend", done);
    return () => el.removeEventListener("animationend", done);
  }, [toast.phase, toast.seq]);

  if (facts.length === 0) return null;
  const narrow = narrowSpans(facts);

  const show = (text: string, copied: boolean) => {
    seqRef.current += 1;
    setToast({ seq: seqRef.current, text, copied, phase: "shown" });
  };

  const copy = (value: string) => {
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clipboard?.writeText) {
      show(COPY_FAILED, false);
      return;
    }
    clipboard.writeText(value).then(
      () => show(COPIED, true),
      () => show(COPY_FAILED, false),
    );
  };

  return (
    <section
      data-testid="crew-quick-facts"
      aria-labelledby="crew-quick-facts-heading"
      data-search-skip=""
      className="flex flex-col gap-3"
    >
      <h3 id="crew-quick-facts-heading" className="text-base font-semibold text-text-strong">
        Quick facts
      </h3>
      {/* The grid's own width decides the narrow spans, so the wrapper is its
          container; the section is not one, since containment would make it the
          containing block of the fixed toast below. */}
      <div className="@container/facts">
        <ul data-testid="crew-quick-facts-grid" className="grid grid-cols-2 items-stretch gap-3">
          {facts.map((fact, index) => (
            <li
              key={fact.id}
              data-testid="crew-quick-fact"
              data-fact={fact.id}
              className={cn(
                "h-full min-w-0",
                spans(index, facts.length)
                  ? "col-span-2"
                  : narrow[index] && "@max-quick-pair/facts:col-span-2",
              )}
            >
              <Tile fact={fact} onCopy={copy} />
            </li>
          ))}
        </ul>
      </div>
      <div
        data-testid="crew-quick-facts-status"
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-banner flex justify-center px-4"
      >
        <p
          ref={toastRef}
          data-testid="crew-quick-facts-toast"
          data-state={toast.phase}
          className={cn(
            "flex min-h-10 items-center gap-2 rounded-pill bg-text px-4 py-2 text-sm font-semibold text-bg shadow-popover",
            toast.phase === "idle" && "hidden",
            toast.phase === "shown" &&
              "motion-safe:animate-[crew-toast-in_var(--duration-fast)_var(--ease-out-quart)]",
            toast.phase === "leaving" &&
              "motion-safe:animate-[crew-toast-out_var(--duration-fast)_var(--ease-out-quart)_forwards]",
          )}
        >
          {toast.copied && toast.phase !== "idle" ? (
            <CheckIcon aria-hidden="true" className="size-4 shrink-0" />
          ) : null}
          {toast.text}
        </p>
      </div>
    </section>
  );
}

function Tile({ fact, onCopy }: { fact: QuickFact; onCopy: (value: string) => void }) {
  const Icon = ICON[fact.id];
  const copyAction = fact.actions.find(
    (a): a is Extract<QuickFactAction, { kind: "copy" }> => a.kind === "copy",
  );
  // The copy button sits on the line it copies; when no line is the copied value
  // (a split Wi-Fi with no password copies the raw text), it gets its own row.
  const copyLine = copyAction ? fact.lines.findIndex((l) => l.text === copyAction.value) : -1;
  const links = contactLinks(fact);
  const directions = fact.actions.find(
    (a): a is Extract<QuickFactAction, { kind: "directions" }> => a.kind === "directions",
  );
  const name = fact.lines[0]?.text ?? fact.label;

  return (
    <div className="flex h-full min-w-0 flex-col gap-2 rounded-md border border-border bg-surface p-3 shadow-tile">
      <p className="flex min-w-0 items-center gap-1.5 text-text-subtle">
        <Icon className="size-4 shrink-0" />
        <span
          data-testid="crew-quick-fact-label"
          className="min-w-0 text-xs font-medium uppercase tracking-eyebrow"
        >
          {fact.label}
        </span>
      </p>
      {fact.lines.map((line, i) =>
        i === copyLine && copyAction ? (
          <CopyRow
            key={i}
            line={line}
            label={copyAction.label}
            onCopy={() => onCopy(copyAction.value)}
          />
        ) : (
          <Line key={i} line={line} primary={i === 0} />
        ),
      )}
      {copyAction && copyLine < 0 ? (
        <div className="mt-auto flex justify-end">
          <CopyButton label={copyAction.label} onCopy={() => onCopy(copyAction.value)} />
        </div>
      ) : null}
      {/* Call, text and email share one row at every width: three 44px
          targets with 6px gaps take 144px, and where a half-width tile is
          narrower than that the tile spans both columns (`narrowSpans`). */}
      {links.length > 0 ? (
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {links.map((a) => (
            <a
              key={a.kind}
              href={a.href}
              aria-label={`${CONTACT_VERB[a.kind]} ${name}`}
              className={ICON_LINK}
            >
              {a.kind === "call" ? (
                <PhoneIcon aria-hidden="true" className="size-4" />
              ) : a.kind === "text" ? (
                <MessageSquareIcon aria-hidden="true" className="size-4" />
              ) : (
                <MailIcon aria-hidden="true" className="size-4" />
              )}
            </a>
          ))}
        </div>
      ) : null}
      {directions ? (
        <a
          href={directions.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto inline-flex min-h-tap-min items-center self-start text-sm font-semibold text-accent-on-bg underline-offset-4 transition-colors duration-fast hover:underline"
        >
          Directions <NewTabHint />
        </a>
      ) : null}
    </div>
  );
}

function Line({ line, primary }: { line: QuickFactLine; primary: boolean }) {
  return (
    <div data-line="" className="flex min-w-0 flex-col">
      {line.label !== undefined ? (
        <span className="text-xs text-text-subtle">{line.label}</span>
      ) : null}
      <span
        data-testid="crew-quick-fact-value"
        className={cn(
          "line-clamp-3 select-text wrap-break-word",
          primary ? "text-sm/snug font-semibold text-text-strong" : "text-sm/snug text-text",
        )}
      >
        {line.text}
      </span>
    </div>
  );
}

function CopyRow({
  line,
  label,
  onCopy,
}: {
  line: QuickFactLine;
  label: string;
  onCopy: () => void;
}) {
  return (
    <div
      data-line=""
      className="mt-auto flex min-w-0 items-center gap-1 rounded-sm bg-surface-sunken pl-3"
    >
      <span className="flex min-w-0 flex-1 flex-col py-1.5">
        {line.label !== undefined ? (
          <span className="text-xs text-text-subtle">{line.label}</span>
        ) : null}
        <span
          data-testid="crew-quick-fact-value"
          className="code-value line-clamp-3 select-text break-all text-sm/snug font-semibold text-text-strong"
        >
          {line.text}
        </span>
      </span>
      <CopyButton label={label} onCopy={onCopy} />
    </div>
  );
}

function CopyButton({ label, onCopy }: { label: string; onCopy: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onCopy}
      className="inline-flex size-tap-min shrink-0 items-center justify-center rounded-sm text-text transition-colors duration-fast hover:text-accent-on-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset"
    >
      <CopyIcon aria-hidden="true" className="size-4" />
    </button>
  );
}
