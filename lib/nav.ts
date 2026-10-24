export type SegmentTab = "inbox" | "sent" | "settings";

export interface NavItem {
  href: string;
  label: string;
  tab: SegmentTab;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Inbox", tab: "inbox" },
  { href: "/sent", label: "Sent", tab: "sent" },
  { href: "/settings", label: "Settings", tab: "settings" },
] as const;
