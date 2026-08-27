import type { ConsoleStrings } from "./strings.js";

/** The console's own built-in language - unchanged text from before this item existed, so a site
 * with no locale set (every existing tenant) renders identically to before `11-11`. */
export const en: ConsoleStrings = {
  skipToContent: "Skip to content",
  operatorConsoleTagline: "Operator console",
  consoleTaglineClient: "Client console",
  consoleTaglineOwner: "Platform owner console",
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

  agoSuffix: "ago",

  queueAssignedTitle: "Assigned to me",
  queueAssignedNote: "Live — a new assignment appears without a refresh.",
  queueAssignedLoadingLabel: "Loading your assigned conversations…",
  queueAssignedEmpty: "Nothing assigned yet. New conversations arrive here automatically.",
  queueNewBadge: "New",
  queueUnreadMessageOne: "unread message",
  queueUnreadMessageOther: "unread messages",
  queueConversationStartedTitle: "Conversation started",
  queueOpenLabel: "Open",
  queueStartUnknown: "Start time unknown",
  queueWaitingTitle: "Waiting",
  queueWaitingNotePrefix: "Read-only — conversations are assigned automatically, never claimed here. Refreshed every",
  queueWaitingNoteSuffix: "seconds.",
  queueWaitingEmpty: "Nothing waiting.",
  queueWaitingLoadingLabel: "Loading the waiting list…",
  queueWaitingSinceTitle: "Waiting since",
  queueWaitingSinceUnknown: "Waiting since an unknown time",

  threadLoadingOlder: "Loading…",
  threadLoadOlderButton: "Load older messages",
  threadAriaLabel: "Message thread",
  threadMessageNumberLabel: "message #",
  threadMessageNumberOnlyLabel: "Message #",
  threadNoTimestamp: "no timestamp",
  threadAuthorVisitor: "Visitor",
  threadAuthorOperator: "Operator",
  threadAuthorSystem: "System",

  composerUploadingLabel: "Uploading",
  composerAttachedBadge: "Attached",
  composerRemoveButton: "Remove",
  composerTooManyFiles: "Only the first file was attached — messages carry one attachment each.",
  composerPlaceholder: "Write a reply — Enter to send, Shift+Enter for a new line",
  composerAriaLabel: "Message to send",
  composerAttachAriaLabel: "Attach a file",
  composerAttachButton: "Attach",
  composerSendButton: "Send",
  composerHint: "Enter sends · Shift+Enter starts a new line · Escape clears · drop or paste a file to attach",

  emptyStateAriaLabel: "No conversation open",
  emptyStateTitle: "Pick a conversation",
  emptyStateBody:
    "Choose one of the conversations assigned to you on the left. New ones are assigned to you " +
    "automatically as visitors start chatting — nothing here needs claiming.",

  visitorPanelTitle: "Visitor",
  visitorPresenceUnknown: "Presence unknown",
  visitorOnline: "Online",
  visitorOffline: "Offline",
  conversationStateAssigned: "Assigned",
  conversationStateClosed: "Closed",
  visitorIdLabel: "Visitor id",
  visitorNotInQueue: "Not in your queue",
  visitorConversationStartedUnknown: "Unknown",
  visitorSiteLabel: "Site",
  visitorSiteNotKnown: "Not known yet",
  visitorConversationLabel: "Conversation",
  visitorPanelNote:
    "This is everything the platform knows about a visitor today. Their current page, referrer and " +
    "earlier conversations are not collected yet.",

  closeConversationButton: "Close conversation",
  closeConversationDialogTitle: "Close this conversation?",
  cancelButton: "Cancel",
  closeTryAgainButton: "Try again",
  closeItButton: "Close it",
  closeConversationDialogBody:
    "The visitor’s chat ends and this conversation cannot be reopened. Closing it also frees " +
    "your capacity, so you may be assigned a new conversation straight away.",

  closeOutcomeNetworkError: "The console could not reach the server. Check your connection and try again.",
  closeOutcomeAlreadyClosed: "This conversation has already been closed.",
  closeOutcomeConcurrencyConflict: "Someone else was changing this conversation at the same moment. Try closing it again.",
  closeOutcomeNotFound: "This conversation no longer exists.",
  closeOutcomeReassigned: "This conversation is no longer assigned to you — someone else has taken it.",
  closeOutcomeNoPermission: "You do not have permission to close conversations for this site.",

  alertSettingsIntro:
    "Both are off until you turn them on, and neither fires for the conversation you already have " +
    "open on a visible tab.",
  alertSettingsBlockedDenied:
    "Your browser is blocking notifications for this site. The console cannot ask again — turn " +
    "them back on in the browser’s own site settings, then reload this page. The sound below works " +
    "regardless.",
  alertSettingsBlockedUnsupported:
    "This browser does not offer desktop notifications on this page. The sound below works regardless.",
  alertSettingsDesktopLabel: "Desktop notifications",
  alertSettingsPermissionHintDefault: "Turning this on asks the browser for permission.",
  alertSettingsPermissionHintGranted: "A card when a conversation needs you. Never the message text.",
  alertSettingsSoundLabel: "Sound",
  alertSettingsSoundHint: "A short chime. Needs no permission.",

  alertAssignedTitle: "New conversation assigned",
  alertAssignedBody: "is waiting for you.",
  alertMessageTitle: "New message",
  alertMessageBody: "sent a message.",
  alertWhoUnknown: "A visitor",
  alertVisitorPrefix: "Visitor",

  shortcutsDialogTitle: "Keyboard shortcuts",
  shortcutsCloseButton: "Close",
  shortcutsIntro:
    "These work anywhere in the workspace except while you are typing — the composer, and any " +
    "other text field, keep every key to themselves.",
  shortcutNextConversation: "Move to the next conversation assigned to you",
  shortcutPreviousConversation: "Move to the previous one",
  shortcutFocusComposer: "Put the cursor in the composer",
  shortcutCloseThread: "Close the open thread and go back to the list",
  shortcutShowHelp: "Show this list",
  shortcutsHintIntro: "Inside the composer:",
  shortcutsHintSends: "sends,",
  shortcutsHintNewLine: "starts a new line,",
  shortcutsHintClears: "clears the draft.",

  workspaceHiddenHeading: "Operator workspace",
  workspaceConversationsLabel: "Conversations",
  workspaceAlertsLabel: "Alerts",
  workspaceShortcutsButton: "Shortcuts",
  workspaceQueueLoadError: "Failed to load the queue.",
  workspaceNewAssignmentAnnouncement: "A new conversation was assigned to you.",
  workspaceDoneButton: "Done",

  linkLiveLabel: "Live",
  linkLiveDetail: "Connected to the operator hub. New messages arrive without a refresh.",
  linkConnectingLabel: "Connecting…",
  linkConnectingDetail: "Opening the operator hub connection.",
  linkReconnectingLabel: "Reconnecting…",
  linkReconnectingDetail:
    "The connection dropped and is being retried with backoff. Messages sent right now will fail " +
    "and can be retried; nothing sent to you while you are away is lost - the reconnect resumes " +
    "from your last received message.",
  linkDrainingLabel: "Server restarting",
  linkDrainingDetail:
    "The server asked this console to reconnect before it shuts down. You are still connected and " +
    "can still send; expect a brief reconnect shortly.",
  linkDisconnectedLabel: "Offline",
  linkDisconnectedDetail:
    "Not connected to the operator hub. Messages you send will fail until the connection returns. " +
    "Reloading rarely helps - if this persists, the browser console carries the reason the " +
    "connection was refused (5-18).",
  connectionBadgeAriaPrefix: "Operator hub:",

  conversationBackLink: "← Conversations",
  conversationWithPrefix: "Conversation with",
  conversationTitleFallback: "Conversation",
  conversationWaitingForHub: "Waiting for the operator hub before this thread can load or send.",
  conversationClosedTitle: "This conversation is closed",
  conversationClosedBody:
    "Your capacity has been released, so a new conversation may be assigned to you at any moment. " +
    "The transcript above stays readable.",
  conversationSendFailedTitle: "Send failed or is unconfirmed",
  conversationRetryButton: "Retry",
  conversationLoadingAttachment: "Loading attachment…",
  conversationAttachmentDeleted: "Attachment deleted",
  conversationAttachmentUnavailable: "Attachment unavailable",
  conversationDownloadAttachmentLabel: "Download attachment",
  conversationAttachmentThumbnailAlt: "Attachment thumbnail",
  conversationDeleteAttachmentButton: "Delete attachment",
  conversationUploadFailed: "Upload failed.",
};
