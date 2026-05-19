import { messageFor } from "@/lib/messages/lookup";

export function GoodViaMessageFor() {
  return <span>{messageFor("LINK_REVOKED_FLOOR").crewFacing}</span>;
}
