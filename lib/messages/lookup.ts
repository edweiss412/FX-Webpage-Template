import {
  MESSAGE_CATALOG,
  type MessageCode,
  type MessageCatalogEntry,
} from "@/lib/messages/catalog";

export { MESSAGE_CATALOG, type MessageCode, type MessageCatalogEntry };

export type MessageParams = Record<string, string | number | boolean | null | undefined>;

export function messageFor(code: MessageCode, params?: MessageParams): MessageCatalogEntry {
  void params;
  return MESSAGE_CATALOG[code];
}
