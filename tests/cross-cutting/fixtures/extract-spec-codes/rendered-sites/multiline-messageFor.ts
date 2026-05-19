import { messageFor } from "@/lib/messages/lookup";

export function renderedMessage(): string | null {
  return messageFor(
    "SHOW_VERSION_AUTH_FAILED",
    {
      fieldOne: "This object is intentionally long enough to exceed the old 160-character scan window.",
      fieldTwo: "The extractor still needs to see the chained Doug-facing access.",
      fieldThree: "A fragile regex would miss this render site and allow missing helpfulContext.",
    },
  ).dougFacing;
}
