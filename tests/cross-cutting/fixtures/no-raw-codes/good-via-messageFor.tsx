import { messageFor } from "@/lib/messages/lookup";

export function GoodViaMessageFor() {
  return <span>{messageFor("SHEET_UNAVAILABLE").crewFacing}</span>;
}
