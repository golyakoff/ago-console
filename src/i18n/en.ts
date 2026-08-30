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
  navCannedResponses: "Canned responses",
  navTags: "Tags",
  navPlatformSites: "Platform sites",
  navDeleteAccount: "Delete account",
  navBilling: "Billing",
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

  themeToggleLabel: "Theme",
  themeToggleAriaLabel: "Colour theme",
  themeOptionSystem: "Match system",
  themeOptionLight: "Light",
  themeOptionDark: "Dark",

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
    "This is everything the platform knows about a visitor today. Their current page and referrer " +
    "are not collected yet. Earlier conversations appear below when this visitor has been recognized " +
    "on a channel such as MAX, Telegram or SMS.",

  visitorHistoryTitle: "Previous conversations",
  visitorHistoryLoadingLabel: "Loading previous conversations…",
  visitorHistoryEmpty: "No prior conversations with this visitor yet.",
  visitorHistoryError: "Could not load this visitor's previous conversations.",
  visitorHistoryStartedLabel: "Started",
  visitorHistoryClosedLabel: "Closed",
  visitorHistoryStillOpen: "Still open",
  visitorHistoryNoPreview: "No messages",
  visitorHistoryOpenLabel: "Open",
  visitorHistoryDialogLoadingLabel: "Loading conversation…",
  visitorHistoryDialogError: "Could not load this conversation.",

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

  siteConfigCheckingPermissions: "Checking your permissions…",
  siteConfigBackToQueue: "Back to queue",
  siteConfigSaveButton: "Save",
  siteConfigSavingButton: "Saving…",
  siteConfigSavedAlert: "Saved.",

  adminColumnVisitor: "Visitor",
  adminColumnState: "State",
  adminColumnOperator: "Assigned operator",
  adminUnassigned: "Unassigned",
  adminColumnStarted: "Started",
  adminColumnUnread: "Unread",
  adminLoadError: "Failed to load conversations.",
  adminLoadingLabel: "Loading conversations…",
  adminForbidden: "You do not have permission to view every conversation for this site.",
  adminDescriptionPrefix: "Every conversation for this site (newest first, read-only, refreshed every",
  adminDescriptionSuffix: "seconds).",
  adminEmpty: "No conversations yet.",
  adminTableCaption: "Every conversation for this site, newest first.",
  adminColumnActions: "Actions",
  adminConversationErasedNotice: "The conversation has been erased.",

  widgetLoadError: "Failed to load the widget configuration.",
  widgetSubmitError: "Failed to save the widget configuration.",
  widgetForbidden: "You do not have permission to configure this site's widget.",
  widgetDescription:
    "Changes here take effect the next time a visitor's page loads the widget. A visitor who already " +
    "has the widget open on their page will not see the new color, position, or language until they " +
    "reload it.",
  widgetLoadingLabel: "Loading the widget configuration…",
  widgetPanelTitle: "Launcher",
  widgetColorFieldLabel: "Primary color (hex, optional)",
  widgetColorFieldDescription: "Leave empty to use the widget's own built-in default.",
  widgetColorPreviewTitle: "Preview",
  widgetColorValidation: "Color must look like a hex value, e.g. #2F6FED.",
  widgetPositionFieldLabel: "Launcher position",
  widgetPositionBottomRight: "Bottom right",
  widgetPositionBottomLeft: "Bottom left",
  widgetLanguageFieldLabel: "Widget language",
  widgetNoticePanelTitle: "Processing notice",
  widgetNoticeTextFieldLabel: "Notice text (optional)",
  widgetNoticeTextFieldDescription:
    "Shown to a visitor before they type anything. This is your own sentence about how you handle " +
    "what they write - AGO does not write it for you, and leaving it empty shows no notice at all.",
  widgetNoticeTextPlaceholder: "We use your messages to answer your questions.",
  widgetNoticeUrlFieldLabel: "Notice link (optional)",
  widgetNoticeUrlFieldDescription: "A link to your own policy page. Must start with https://.",
  widgetNoticeUrlValidation: "The link must be an absolute https:// URL.",

  autoReplyForbidden: "You do not have permission to configure this site's offline auto-reply.",
  autoReplyDescription:
    "When this is on and nobody on your team is online, a visitor's first message gets an automatic " +
    "reply instead of silence. It never replies while someone is online - a colleague who is simply " +
    "busy still counts as online - and it never replies to a conversation somebody has already picked " +
    "up.",
  autoReplyLoadingLabel: "Loading the offline auto-reply…",
  autoReplyLoadError: "Failed to load the offline auto-reply.",
  autoReplySubmitError: "Failed to save the offline auto-reply.",
  autoReplyPanelTitle: "Replies while you are away",
  autoReplyEnabledLabel: "Reply automatically when nobody is online",
  autoReplyDefaultFieldLabel: "Default reply",
  autoReplyDefaultFieldDescription: "Sent when no keyword below matches. This is what most visitors will see.",
  autoReplyDefaultPlaceholder: "Thanks for writing - we are closed right now and will reply in the morning.",
  autoReplyRulesLegend: "Keyword rules",
  autoReplyRulesIntro:
    "If the visitor's message contains a keyword, that rule's reply is sent instead of the default. " +
    "The first matching rule wins, so put the more specific ones first. Leave a row blank to drop it.",
  autoReplyKeywordLabelPrefix: "Keyword",
  autoReplyKeywordPlaceholder: "refund",
  autoReplyReplyLabelPrefix: "Reply",
  autoReplyReplyPlaceholder: "Refunds take three working days.",
  autoReplyRemoveButton: "Remove",
  autoReplyRemoveButtonAriaPrefix: "Remove keyword rule",

  autoReplyValidationNeedsDefault: "An enabled auto-reply needs something to say - fill in the default reply.",
  autoReplyValidationDefaultTooLongPrefix: "The default reply cannot exceed",
  autoReplyValidationDefaultTooLongSuffix: "characters.",
  autoReplyValidationTooManyRulesPrefix: "A site cannot have more than",
  autoReplyValidationTooManyRulesSuffix: "keyword rules.",
  autoReplyValidationKeywordRequired: "A keyword rule needs a keyword.",
  autoReplyValidationReplyRequiredPrefix: 'The rule for "',
  autoReplyValidationReplyRequiredSuffix: '" needs a reply.',
  autoReplyValidationKeywordTooLongPrefix: "A keyword cannot exceed",
  autoReplyValidationKeywordTooLongSuffix: "characters.",
  autoReplyValidationReplyTooLongPrefix: "A reply cannot exceed",
  autoReplyValidationReplyTooLongSuffix: "characters.",

  cannedResponsesForbidden: "You do not have permission to configure this site's canned responses.",
  cannedResponsesDescription:
    "Prepared answers your team can insert into a reply instead of typing them again. Type \"/\" in " +
    "the composer to browse them without touching the mouse.",
  cannedResponsesLoadingLabel: "Loading canned responses…",
  cannedResponsesLoadError: "Failed to load the canned responses.",
  cannedResponsesSubmitError: "Failed to save the canned responses.",
  cannedResponsesPanelTitle: "Prepared answers",
  cannedResponsesListLegend: "Responses",
  cannedResponsesListIntro:
    "Each one needs a short title to find it by, and the text that gets inserted into the composer. " +
    "Leave a row blank to drop it.",
  cannedResponsesTitleLabelPrefix: "Title",
  cannedResponsesTitlePlaceholder: "Refund policy",
  cannedResponsesBodyLabelPrefix: "Text",
  cannedResponsesBodyPlaceholder: "Refunds take three working days once the item is back with us.",
  cannedResponsesRemoveButton: "Remove",
  cannedResponsesRemoveButtonAriaPrefix: "Remove canned response",

  cannedResponsesValidationTitleRequired: "A canned response needs a title.",
  cannedResponsesValidationBodyRequiredPrefix: 'The response titled "',
  cannedResponsesValidationBodyRequiredSuffix: '" needs text.',
  cannedResponsesValidationTitleTooLongPrefix: "A title cannot exceed",
  cannedResponsesValidationTitleTooLongSuffix: "characters.",
  cannedResponsesValidationBodyTooLongPrefix: "The response text cannot exceed",
  cannedResponsesValidationBodyTooLongSuffix: "characters.",
  cannedResponsesValidationTooManyPrefix: "A site cannot have more than",
  cannedResponsesValidationTooManySuffix: "canned responses.",

  composerCannedResponsesAvailableHint: "Type / to insert a canned response",

  composerSuggestReplyButton: "Suggest a reply",
  composerSuggestReplyGenerating: "Generating a suggestion…",
  replyDraftRateLimitedError: "Too many AI suggestions requested — try again in a moment.",
  replyDraftUnavailableError: "The AI suggestion is temporarily unavailable.",
  replyDraftFailedError: "Could not generate a suggestion.",
  composerCannedResponsesListAriaLabel: "Canned responses",
  composerCannedResponsesNoMatch: "No canned response matches.",
  composerCannedResponsesInsertHint: "↑↓ to choose · Enter to insert · Esc to cancel",

  tagsForbidden: "You do not have permission to manage tags for this site.",
  tagsDescription: "Labels you can attach to conversations, and use later to filter or count them.",
  tagsLoadingLabel: "Loading tags…",
  tagsLoadError: "Failed to load the tags.",
  tagsCreateError: "Failed to create the tag.",
  tagsRenameError: "Failed to rename the tag.",
  tagsDeleteError: "Failed to delete the tag.",
  tagsPanelTitle: "Tags",
  tagsEmpty: "No tags yet.",
  tagsNameLabel: "Name",
  tagsSaveButton: "Save",
  tagsCancelButton: "Cancel",
  tagsRenameButton: "Rename",
  tagsDeleteButton: "Delete",
  tagsNewNameLabel: "New tag",
  tagsNewNamePlaceholder: "e.g. VIP",
  tagsCreatingButton: "Creating…",
  tagsCreateButton: "Create tag",

  tagsSectionTitle: "Tags",
  tagsNoneApplied: "No tags applied.",
  tagsApplyError: "Failed to apply the tag.",
  tagsRemoveError: "Failed to remove the tag.",
  tagsApplyLabel: "Apply a tag",
  tagsApplyPlaceholder: "Choose a tag…",
  tagsApplyButton: "Apply",
  tagsRemoveButtonAriaPrefix: "Remove tag",

  tagsAiAppliedMarker: "AI",
  tagsAiAppliedAriaPrefix: "AI-applied tag",

  workspaceTagFilterLabel: "Filter by tag",
  workspaceTagFilterAll: "All tags",

  channelIdentitiesSectionTitle: "Linked channels",
  channelIdentitiesLoadingLabel: "Loading linked channels…",
  channelIdentitiesLoadError: "Failed to load linked channels.",
  channelIdentitiesNone: "No channels linked yet.",
  channelIdentitiesLinkKindLabel: "Channel to link",
  channelIdentitiesLinkButton: "Generate code",
  channelIdentitiesRequestLinkError: "Failed to generate a link code.",
  channelIdentitiesUnlinkButton: "Unlink",
  channelIdentitiesUnlinkError: "Failed to unlink.",
  channelIdentitiesPreferredBadge: "Preferred",
  channelIdentitiesPreferButton: "Prefer",
  channelIdentitiesClearPreferenceButton: "Clear",
  channelIdentitiesPreferError: "Failed to set the preferred channel.",
  channelIdentitiesCodeGeneratedPrefix: "Code generated for",

  contactDetailsSectionTitle: "Unverified contact details",
  contactDetailsCaption: "Recorded by an operator - never used to contact the visitor automatically.",
  contactDetailsLoadingLabel: "Loading contact details…",
  contactDetailsLoadError: "Failed to load contact details.",
  contactDetailsEmpty: "No contact details recorded yet.",
  contactDetailsKindLabel: "Kind",
  contactDetailsValuePlaceholder: "Phone number, email, or other detail",
  contactDetailsRecordButton: "Record",
  contactDetailsRecordingButton: "Recording…",
  contactDetailsRecordError: "Failed to record the contact detail.",
  contactDetailsDeleteButton: "Delete",
  contactDetailsDeleteError: "Failed to delete.",

  notesTitle: "Notes",
  notesVisitorCannotSeeNote: "The visitor never sees these.",
  notesLoadingLabel: "Loading notes…",
  notesLoadError: "Failed to load the notes.",
  notesEmpty: "No notes yet.",
  notesAddPlaceholder: "Add a note for the team…",
  notesAddingButton: "Adding…",
  notesAddButton: "Add note",
  notesAddError: "Failed to add the note.",

  eraseConversationButton: "Erase",
  eraseConversationDialogTitle: "Erase this conversation?",
  eraseConversationDialogBody:
    "This removes the conversation, its messages and any attachments from every store that holds " +
    "them. It cannot be undone, and there is no confirmation beyond this one.",
  eraseConversationConfirmButton: "Erase it",
  eraseConversationErasingLabel: "Erasing…",
  eraseConversationSubmitError: "Failed to start erasing this conversation.",

  accountDeletionTitle: "Delete account",
  accountDeletionDescription: "Permanently delete this account and everything in it.",
  accountDeletionForbidden: "You do not have permission to delete this account.",
  accountDeletionPanelTitle: "Delete this account",
  accountDeletionWarningBody:
    "This deletes every conversation, message and attachment, the site's own configuration, its " +
    "operators, and their sign-in accounts. It cannot be undone, and there is no confirmation " +
    "beyond this one.",
  accountDeletionButton: "Delete this account",
  accountDeletionDialogTitle: "Delete this account?",
  accountDeletionDialogBody:
    "This permanently deletes the account and everything in it. It cannot be undone, and there is " +
    "no confirmation beyond this one.",
  accountDeletionConfirmButton: "Delete it",
  accountDeletionSubmitError: "Failed to start deleting this account.",
  accountDeletionInProgressTitle: "Deletion in progress",
  accountDeletionInProgressBody:
    "The account is being deleted. This can take a while - do not close this page. You will be " +
    "signed out automatically once it is done.",

  navSearch: "Search",
  searchPageDescription:
    "Full-text search across every conversation on this site. Results are newest first - this is " +
    "plain word matching, not a relevance ranking.",
  searchArchiveNote:
    "Only the date range shown below is searched. A conversation older than it may still exist but " +
    "is not reachable from here.",
  searchPhraseFieldLabel: "Search phrase",
  searchPhrasePlaceholder: "refund, tracking number, cancel…",
  searchFromFieldLabel: "From (optional)",
  searchToFieldLabel: "To (optional)",
  searchButton: "Search",
  searchRangeLabel: "Searching",
  searchForbiddenError: "You do not have permission to search this site's conversations.",
  searchInvalidQueryError: "Enter a search phrase.",
  searchLoadError: "Failed to search conversations.",
  searchLoadingLabel: "Searching…",
  searchEmpty: "No matches in this range.",
  searchOpenLabel: "Open →",
  searchWaitingNote: "Unclaimed — assign it from the queue to open it.",
  searchClosedNote: "Closed — a closed conversation cannot be reopened as a live thread.",
  searchLoadMoreButton: "Load more",
  searchLoadingMoreLabel: "Loading more…",

  conversationLocatingMessageLabel: "Locating the message…",
  conversationOpenFailed:
    "This conversation could not be opened here. It may be assigned to another operator, already " +
    "closed, or the connection may have dropped - try again from the search results or the queue.",

  billingTitle: "Billing",
  billingDescription: "Your site's current tier, seat usage, and subscription.",
  billingForbidden: "You do not have permission to view this site's billing.",
  billingLoadError: "Failed to load billing status.",
  billingLoadingLabel: "Loading billing status…",

  billingPanelTitle: "Subscription",
  billingTierLabel: "Tier",
  billingSeatsUsedLabel: "Seats used",
  billingSeatLimitLabel: "Seat limit",

  billingPendingTitle: "Confirming payment",
  billingPendingBody:
    "Your payment was submitted to ЮKassa and is waiting for confirmation. This page will update " +
    "automatically once it is confirmed - this is not yet a completed subscription.",
  billingFailedTitle: "Payment declined",
  billingFailedBody: "ЮKassa declined this payment. No charge was made - you can try again below.",
  billingPastDueTitle: "Payment retry in progress",
  billingPastDueBody:
    "A recurring charge failed. Your current tier and seats stay exactly as they are while retries " +
    "run for up to a week; seat changes are unavailable until the retry succeeds.",

  billingCancelRequestedTitle: "Subscription ending",
  billingCancelRequestedBody: "Auto-renewal is off. Your paid tier stays active, with no further charges, until",
  billingPendingDowngradeTitle: "Seat change scheduled",
  billingPendingDowngradeBody: "At your next renewal your seat count will change to",

  billingSeatCountFieldLabel: "Seat count",
  billingSeatCountFieldDescription: "2-100 seats. The exact price band is confirmed by the server.",
  billingSubscribeButton: "Subscribe",
  billingSubscribingButton: "Redirecting to ЮKassa…",
  billingChangeSeatsButton: "Change seat count",
  billingChangingSeatsButton: "Submitting…",
  billingCheckoutError: "Failed to start checkout.",
  billingSeatChangeError: "Failed to change the seat count.",
  billingUpgradeSuccessTitle: "Upgraded",
  billingUpgradeSuccessBody: "Charged",

  billingCancelButton: "Cancel subscription",
  billingCancelDialogTitle: "Cancel this subscription?",
  billingCancelDialogBody:
    "Your paid tier will keep running until the end of the period you already paid for, then drop " +
    "to the free tier. No refund is given for the remaining time.",
  billingCancelConfirmButton: "Cancel subscription",
  billingCancelError: "Failed to cancel the subscription.",

  navAnalytics: "Analytics",
  analyticsPageDescription:
    "How your site is doing: conversation volume, average time to first reply, and conversations " +
    "that never got one, overall and by channel.",
  analyticsFromFieldLabel: "From (optional)",
  analyticsToFieldLabel: "To (optional)",
  analyticsApplyButton: "Apply",
  analyticsRangeLabel: "Showing",
  analyticsForbiddenError: "You do not have permission to view this site's analytics.",
  analyticsInvalidRangeError: "The start of the range must be before its end.",
  analyticsLoadError: "Failed to load analytics.",
  analyticsLoadingLabel: "Loading analytics…",
  analyticsEmpty: "No conversations in this range.",
  analyticsChannelColumn: "Channel",
  analyticsConversationCountColumn: "Conversations",
  analyticsAverageFirstResponseColumn: "Avg. first response",
  analyticsAverageDurationColumn: "Avg. duration",
  analyticsMissedCountColumn: "Missed",
  analyticsOverallRowLabel: "All channels",
  analyticsNoResponsesValue: "—",
  analyticsChannelWidget: "Widget",
  analyticsChannelSms: "SMS",
  analyticsChannelMax: "MAX",
  analyticsChannelTelegram: "Telegram",
  analyticsChannelWhatsApp: "WhatsApp",

  analyticsByOperatorHeading: "By operator",
  analyticsOperatorColumn: "Operator",
  analyticsByOperatorEmpty: "No conversations attribute to an operator in this range.",

  analyticsByReferrerHeading: "By referrer",
  analyticsReferrerColumn: "Referrer",
  analyticsByReferrerEmpty: "No conversations in this range.",
  analyticsDirectReferrerLabel: "Direct",
  analyticsByCampaignHeading: "By campaign",
  analyticsCampaignColumn: "Campaign",
  analyticsByCampaignEmpty: "No conversations in this range carry a campaign tag.",
  analyticsTrafficSourceNote: "What the visitor's browser reported - not a fact AGO Chat has independently verified.",

  outcomeSectionTitle: "Outcome",
  outcomeLoadingLabel: "Loading outcome…",
  outcomeLoadError: "Could not load this conversation's outcome.",
  outcomeSetError: "Could not record this outcome.",
  outcomeUnset: "Not recorded",
  outcomeConverted: "Converted",
  outcomeNotConverted: "Not converted",
  outcomeFollowUpNeeded: "Follow-up needed",
  outcomeNotAVerifiedSaleNote: "Recorded by the operator - not a sale AGO Chat has independently verified.",

  navConversionReport: "Conversion",
  conversionReportPageDescription: "How much benefit this business is getting from its conversations, as operators have recorded it.",
  conversionReportNotAVerifiedSaleBanner:
    "This rate is built from what operators recorded, not from a verified sale or order - it is a real, useful number, but it is not the same claim as \"N% of chats resulted in a verified sale.\"",
  conversionReportFromFieldLabel: "From",
  conversionReportToFieldLabel: "To",
  conversionReportApplyButton: "Apply",
  conversionReportRangeLabel: "Reporting on",
  conversionReportLoadingLabel: "Loading conversion report…",
  conversionReportEmpty: "No conversations in this range.",
  conversionReportPresetThisMonth: "This month",
  conversionReportPresetLastMonth: "Last month",
  conversionReportPresetLast30Days: "Last 30 days",
  conversionReportConvertedColumn: "Converted",
  conversionReportNotConvertedColumn: "Not converted",
  conversionReportFollowUpNeededColumn: "Follow-up needed",
  conversionReportUnsetColumn: "Not recorded",
  conversionReportRateColumn: "Conversion rate",
  conversionReportNoDataValue: "—",
  conversionReportOverallRowLabel: "Whole site",
  conversionReportByOperatorHeading: "By operator",
  conversionReportOperatorColumn: "Operator",
  conversionReportByOperatorEmpty: "No recorded outcomes attribute to an operator in this range.",

  navTagBreakdown: "Tag report",
  tagBreakdownPageDescription: "What these conversations are actually about, by tag.",
  tagBreakdownFromFieldLabel: "From",
  tagBreakdownToFieldLabel: "To",
  tagBreakdownApplyButton: "Apply",
  tagBreakdownRangeLabel: "Reporting on",
  tagBreakdownLoadingLabel: "Loading tag breakdown…",
  tagBreakdownEmpty: "No conversations in this range.",
  tagBreakdownPresetThisMonth: "This month",
  tagBreakdownPresetLastMonth: "Last month",
  tagBreakdownPresetLast30Days: "Last 30 days",
  tagBreakdownCoverageBanner: "Tagged",
  tagBreakdownCoverageUnknown: "No conversations in this range to compute tagging coverage from.",
  tagBreakdownTagColumn: "Tag",
  tagBreakdownConversationCountColumn: "Conversations",
  tagBreakdownMultiTagNote:
    "A conversation with more than one tag counts once per tag it holds, so this column will not sum " +
    "to the total conversation count above - that is expected, not an error.",
  tagBreakdownConvertedColumn: "Converted",
  tagBreakdownNotConvertedColumn: "Not converted",
  tagBreakdownRateColumn: "Conversion rate",
  tagBreakdownNoDataValue: "—",
  tagBreakdownByTagEmpty: "No conversation in this range carries a tag.",

  navBookingFlow: "Booking flow",
  bookingFlowPageDescription:
    "How many conversations started your booking flow, and how many of those flows closed.",
  bookingFlowCaveat:
    "A closed flow is not the same as a confirmed booking - a visitor can abandon it, an operator " +
    "can close the conversation mid-step, or it can finish with every offered time declined. This " +
    "counts flows that closed, not bookings that were made.",
  bookingFlowFromFieldLabel: "From (optional)",
  bookingFlowToFieldLabel: "To (optional)",
  bookingFlowApplyButton: "Apply",
  bookingFlowRangeLabel: "Showing",
  bookingFlowForbiddenError: "You do not have permission to view this site's booking flow report.",
  bookingFlowInvalidRangeError: "The start of the range must be before its end.",
  bookingFlowLoadError: "Failed to load the booking flow report.",
  bookingFlowLoadingLabel: "Loading the booking flow report…",
  bookingFlowStartedLabel: "Booking flows started",
  bookingFlowClosedLabel: "Flows closed",
  bookingFlowEmpty: "No booking flow was started in this range.",
};
