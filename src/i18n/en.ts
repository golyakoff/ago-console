import type { ConsoleStrings } from "./strings.js";

/** The console's own built-in language - unchanged text from before this item existed, so a site
 * with no locale set (every existing tenant) renders identically to before `11-11`. */
export const en: ConsoleStrings = {
  skipToContent: "Skip to content",
  operatorConsoleTagline: "Operator console",
  navSectionsAriaLabel: "Console sections",
  navConversations: "Conversations",
  navAllConversations: "All conversations",
  navWidgetAppearance: "Widget appearance",
  navOfflineAutoReply: "Offline auto-reply",
  navPlatformSites: "Platform sites",
  signOut: "Sign out",
  siteIdTooltip: "Site id",
  siteIdPrefix: "site",
  tenancySwitcherLabel: "Site",
  activeSiteAriaLabel: "Active site",
  unnamedSite: "Unnamed",
  publicDemoNoticeSharedLogin:
    "This is a public demo console. Its login is published on the demo pages, so anyone can sign " +
    "in here - every conversation in it was typed by a stranger, who was told you can read it. Do " +
    "not type anything real.",
  publicDemoNoticePlatformOwner:
    "This is a public demo console. You are signed in as the platform owner - your own login is " +
    "published nowhere, but the demo operator login is, so anyone can sign in here as one. Every " +
    "conversation in it was typed by a stranger, who was told an operator can read it. Do not " +
    "type anything real.",
};
