/**
 * `11-11`: the console's own string table, mirroring `ago-widget/src/i18n/strings.ts`'s shape
 * exactly - a flat interface, not a framework, the same "small string table" call `11-10` already
 * made and proved out in production. This item's own scope is the shell only (`AppShell`,
 * `OperatorShell`'s nav, `TenancySwitcher`, the public-demo notice); `11-12`/`11-13` extend this same
 * interface for the operator workspace and the site-configuration screens rather than starting a
 * second table.
 *
 * Interpolated values (a site id's first eight characters, `{n}` counts) are composed at the call
 * site with a plain template literal against a fixed fragment here, never a function stored in the
 * table - the identical choice `ago-widget`'s own table made for its numeric/data interpolations.
 */
export interface ConsoleStrings {
  skipToContent: string;
  /** The default header subtitle, shown wherever a caller does not pass `AppShell`'s own `tagline`
   * prop - `CenteredShell`'s pre-auth/loading screens, and the operator's own messaging tab
   * (`OperatorShell` passes this one explicitly there too, so the two never drift). */
  operatorConsoleTagline: string;
  /** `OperatorShell`'s tenant-management tabs (`/admin`, `/settings/widget`,
   * `/settings/auto-reply`) - found live: even the platform owner, on their own operator seat,
   * should read "client console" there and "operator console" on the messaging tab, the same
   * distinction an ordinary operator sees. Route-driven, not identity-driven. */
  consoleTaglineClient: string;
  /** `OwnerSitesPage`'s own header, always read from the fixed `en` table - `/owner` renders in
   * English regardless of any signed-in identity's tenant locale (11-11's settled design call). */
  consoleTaglineOwner: string;
  navSectionsAriaLabel: string;
  navConversations: string;
  navAllConversations: string;
  navWidgetAppearance: string;
  navOfflineAutoReply: string;
  /** `18-03`: `site:configure`-gated, sits beside `navWidgetAppearance`/`navOfflineAutoReply` in
   * `consoleNav.ts` - the same permission group, one more tenant self-service screen. */
  navCannedResponses: string;
  /** `18-04`: same permission group, sits beside `navCannedResponses` in `consoleNav.ts` - the tag
   * vocabulary's own management surface (`/settings/tags`, `TagsPage`). */
  navTags: string;
  navPlatformSites: string;
  /** `16-02`: gated on `site:erase`, deliberately separate from the `site:configure` block above -
   * the backlog item's own scope note ("a single boolean that destroys a business is a plausible case
   * for its own [permission]"). */
  navDeleteAccount: string;
  /** `13-04`: `site:configure`-gated, sits beside `navWidgetAppearance`/`navOfflineAutoReply` in
   * `consoleNav.ts` - the same permission group, one more tenant self-service screen. */
  navBilling: string;
  signOut: string;
  /** The `title` attribute on the operator's own site-id badge - "Site id", not the badge's visible
   * text (`siteIdPrefix` below). */
  siteIdTooltip: string;
  /** The badge's visible text is `${siteIdPrefix} ${id.slice(0, 8)}` - "site 12345678"/
   * "сайт 12345678". */
  siteIdPrefix: string;
  tenancySwitcherLabel: string;
  activeSiteAriaLabel: string;
  /** `${unnamedSite} (${id.slice(0, 8)})` - the same disambiguated fallback
   * `TenancySwitcher`'s own remarks describe, one language at a time. */
  unnamedSite: string;
  publicDemoNoticeSharedLogin: string;
  publicDemoNoticePlatformOwner: string;

  // Dark-theme reversal of `adr/0030` point 4 - `ThemeToggle` (`src/design/ThemeToggle.tsx`),
  // rendered in `ShellIdentity` beside sign-out, the same three-state (system/light/dark) shape
  // `src/design/theme.ts`'s `ThemeChoice` declares.
  themeToggleLabel: string;
  themeToggleAriaLabel: string;
  themeOptionSystem: string;
  themeOptionLight: string;
  themeOptionDark: string;

  // `11-12`: the operator workspace - the queue, the open conversation, the composer, connection
  // state, alerts and shortcuts. Extends the same interface `11-11` opened rather than starting a
  // second table, per this item's own scope.

  /** Shared across every "N minutes/hours ago" reading in the workspace - composed as
   * `${elapsed} ${agoSuffix}`, the same fixed-fragment convention `siteIdPrefix` already uses. */
  agoSuffix: string;

  // ConversationList - the queue.
  queueAssignedTitle: string;
  queueAssignedNote: string;
  queueAssignedLoadingLabel: string;
  queueAssignedEmpty: string;
  /** The badge on a row assigned during this session and not yet opened. */
  queueNewBadge: string;
  /** The visually-hidden unread count suffix - `${count} ${queueUnreadMessageOne|Other}`. */
  queueUnreadMessageOne: string;
  queueUnreadMessageOther: string;
  /** `${queueConversationStartedTitle} ${absolute} — ${elapsedWords} ${agoSuffix}`, an assigned row's
   * `title`. Reused by `VisitorPanel`'s "Conversation started" fact - identical phrase, one field. */
  queueConversationStartedTitle: string;
  /** `${queueOpenLabel} ${elapsed}`, an assigned row's visible time. */
  queueOpenLabel: string;
  queueStartUnknown: string;
  /** The "Waiting" section heading, an individual row's visible time label, and `VisitorPanel`'s
   * `conversation.state === "Waiting"` badge text - one field, one English word, everywhere it
   * appears. */
  queueWaitingTitle: string;
  /** `${queueWaitingNotePrefix} ${seconds} ${queueWaitingNoteSuffix}`. */
  queueWaitingNotePrefix: string;
  queueWaitingNoteSuffix: string;
  queueWaitingEmpty: string;
  queueWaitingLoadingLabel: string;
  /** `${queueWaitingSinceTitle} ${absolute} — ${elapsedWords}` - a waiting row's `title`. No
   * `agoSuffix` here: the source string this mirrors never had one either. */
  queueWaitingSinceTitle: string;
  queueWaitingSinceUnknown: string;

  // Thread - the open conversation.
  threadLoadingOlder: string;
  threadLoadOlderButton: string;
  threadAriaLabel: string;
  /** `${absolute} · ${threadMessageNumberLabel}${sequence}` - lowercase, mid-sentence. */
  threadMessageNumberLabel: string;
  /** `${threadMessageNumberOnlyLabel}${sequence}` - capitalised, sentence-initial, used when a
   * message carries no timestamp. */
  threadMessageNumberOnlyLabel: string;
  threadNoTimestamp: string;
  /** `MessageDto.authorKind`'s three values, rendered as the group's author label. */
  threadAuthorVisitor: string;
  threadAuthorOperator: string;
  threadAuthorSystem: string;

  // Composer.
  /** `${composerUploadingLabel} ${fileName} — ${percent}%`. */
  composerUploadingLabel: string;
  composerAttachedBadge: string;
  composerRemoveButton: string;
  composerTooManyFiles: string;
  composerPlaceholder: string;
  composerAriaLabel: string;
  composerAttachAriaLabel: string;
  composerAttachButton: string;
  composerSendButton: string;
  composerHint: string;

  // NoConversationSelected - the empty state.
  emptyStateAriaLabel: string;
  emptyStateTitle: string;
  emptyStateBody: string;

  // VisitorPanel.
  visitorPanelTitle: string;
  visitorPresenceUnknown: string;
  visitorOnline: string;
  visitorOffline: string;
  /** `ConversationSummaryDto.state`'s other two values - `"Waiting"` reuses `queueWaitingTitle`. */
  conversationStateAssigned: string;
  conversationStateClosed: string;
  visitorIdLabel: string;
  visitorNotInQueue: string;
  visitorConversationStartedUnknown: string;
  visitorSiteLabel: string;
  visitorSiteNotKnown: string;
  visitorConversationLabel: string;
  visitorPanelNote: string;

  // VisitorHistoryPanel - `18-07`.
  visitorHistoryTitle: string;
  visitorHistoryLoadingLabel: string;
  visitorHistoryEmpty: string;
  visitorHistoryError: string;
  visitorHistoryStartedLabel: string;
  visitorHistoryClosedLabel: string;
  visitorHistoryStillOpen: string;
  visitorHistoryNoPreview: string;
  visitorHistoryOpenLabel: string;
  visitorHistoryDialogLoadingLabel: string;
  visitorHistoryDialogError: string;

  // CloseConversationButton.
  closeConversationButton: string;
  closeConversationDialogTitle: string;
  cancelButton: string;
  closeTryAgainButton: string;
  closeItButton: string;
  closeConversationDialogBody: string;

  // closeOutcome.ts - what a failed close says. A pure function's strings, not a component's, so
  // `closeOutcomeFor` takes a `ConsoleStrings` parameter defaulted to `en` rather than calling
  // `useStrings()` itself - it has no hook context, being called from an event handler, not render.
  closeOutcomeNetworkError: string;
  closeOutcomeAlreadyClosed: string;
  closeOutcomeConcurrencyConflict: string;
  closeOutcomeNotFound: string;
  closeOutcomeReassigned: string;
  closeOutcomeNoPermission: string;

  // AlertSettings.
  alertSettingsIntro: string;
  alertSettingsBlockedDenied: string;
  alertSettingsBlockedUnsupported: string;
  alertSettingsDesktopLabel: string;
  alertSettingsPermissionHintDefault: string;
  alertSettingsPermissionHintGranted: string;
  alertSettingsSoundLabel: string;
  alertSettingsSoundHint: string;

  // useAlerts.ts / alerts.ts - desktop notification title and body. `alertTextFor` is a pure
  // function like `closeOutcomeFor` above, for the same reason (called from a hub push handler, not
  // a render), so it also takes a defaulted `ConsoleStrings` parameter.
  alertAssignedTitle: string;
  /** `${alertWhoUnknown} is waiting for you.` becomes `${alertWhoUnknown} ${alertAssignedBody}`. */
  alertAssignedBody: string;
  alertMessageTitle: string;
  alertMessageBody: string;
  /** The notification body's subject when no visitor id is known yet - `ConversationAssignedDto`
   * carries none. `${alertVisitorPrefix} ${id.slice(0, 8)}` when one is known. */
  alertWhoUnknown: string;
  alertVisitorPrefix: string;

  // ShortcutsDialog / shortcuts.ts.
  shortcutsDialogTitle: string;
  shortcutsCloseButton: string;
  shortcutsIntro: string;
  shortcutNextConversation: string;
  shortcutPreviousConversation: string;
  shortcutFocusComposer: string;
  shortcutCloseThread: string;
  shortcutShowHelp: string;
  /** The composer's own keyboard contract, restated below the shortcut list - four fragments around
   * three `<kbd>` elements the strings never carry, so the key names (`Enter`, `Shift`, `Esc`) never
   * need translating. */
  shortcutsHintIntro: string;
  shortcutsHintSends: string;
  shortcutsHintNewLine: string;
  shortcutsHintClears: string;

  // WorkspaceLayout.
  workspaceHiddenHeading: string;
  /** Both the rail's aria-label and its visible heading - the same word either way. */
  workspaceConversationsLabel: string;
  /** Both the rail's "Alerts" button and the dialog it opens. */
  workspaceAlertsLabel: string;
  workspaceShortcutsButton: string;
  workspaceQueueLoadError: string;
  workspaceNewAssignmentAnnouncement: string;
  workspaceDoneButton: string;

  // linkStatus.ts - the connection-state indicator. `linkStatusOf` is a third pure function taking a
  // defaulted `ConsoleStrings` (called from `ConnectionStateBadge` and `WorkspaceLayout`, both of
  // which do hold a strings value from `useStrings()` and pass it through explicitly).
  linkLiveLabel: string;
  linkLiveDetail: string;
  linkConnectingLabel: string;
  linkConnectingDetail: string;
  linkReconnectingLabel: string;
  linkReconnectingDetail: string;
  linkDrainingLabel: string;
  linkDrainingDetail: string;
  linkDisconnectedLabel: string;
  linkDisconnectedDetail: string;
  /** Visually-hidden prefix before the connection badge's word, e.g. "Operator hub: Live". */
  connectionBadgeAriaPrefix: string;

  // ConversationPage.
  conversationBackLink: string;
  /** `${conversationWithPrefix} ${visitorId.slice(0, 8)}` when a conversation is known. */
  conversationWithPrefix: string;
  conversationTitleFallback: string;
  conversationWaitingForHub: string;
  conversationClosedTitle: string;
  conversationClosedBody: string;
  conversationSendFailedTitle: string;
  conversationRetryButton: string;
  conversationLoadingAttachment: string;
  conversationAttachmentDeleted: string;
  conversationAttachmentUnavailable: string;
  /** `${conversationDownloadAttachmentLabel} (${contentType})`. */
  conversationDownloadAttachmentLabel: string;
  conversationAttachmentThumbnailAlt: string;
  conversationDeleteAttachmentButton: string;
  conversationUploadFailed: string;

  // `11-13`: the last three `site:configure`-gated screens - `AdminConversationsPage` (`/admin`),
  // `WidgetConfigPage` (`/settings/widget`), `OfflineAutoReplyPage` (`/settings/auto-reply`). Page
  // titles reuse `navAllConversations`/`navWidgetAppearance`/`navOfflineAutoReply` above rather than
  // duplicating the same word into a second field - the identical "one field, one word, everywhere it
  // appears" convention `queueWaitingTitle`'s own doc comment already states. Text that is byte-for-byte
  // identical across all three screens (the permission-check spinner, the "Back to queue" link, the
  // save button, and the success alert on the two forms) is likewise one field, not three.

  siteConfigCheckingPermissions: string;
  siteConfigBackToQueue: string;
  siteConfigSaveButton: string;
  siteConfigSavingButton: string;
  siteConfigSavedAlert: string;

  // AdminConversationsPage - `COLUMNS` moved from a module-level constant into a `useMemo` keyed on
  // `strings`, the same "constant outside the component becomes a function of strings" move `11-12`
  // already made for `shortcutDescription`/`closeOutcomeFor`/`linkStatusOf`, because a plain object
  // literal built outside a component cannot call `useStrings()`.
  adminColumnVisitor: string;
  adminColumnState: string;
  adminColumnOperator: string;
  adminUnassigned: string;
  adminColumnStarted: string;
  adminColumnUnread: string;
  adminLoadError: string;
  adminLoadingLabel: string;
  adminForbidden: string;
  /** `${adminDescriptionPrefix} ${seconds} ${adminDescriptionSuffix}` - the poll-interval sentence
   * under the page heading. Fixed-fragment composition, the same convention `queueWaitingNotePrefix`/
   * `Suffix` already use for an interpolated count. */
  adminDescriptionPrefix: string;
  adminDescriptionSuffix: string;
  adminEmpty: string;
  adminTableCaption: string;
  /** `16-02`: the row-actions column header - present only when the signed-in operator holds
   * `conversation:erase` (`AdminConversationsPage`'s own `buildColumns`), so an operator without it
   * never sees an all-empty column. */
  adminColumnActions: string;
  /** Shown once at least one row in this list has actually been confirmed erased (the poll's own
   * `"erased"` outcome, never the optimistic click) - `16-02`'s own Done-when: "the console must not
   * claim it is done before it is." */
  adminConversationErasedNotice: string;

  // WidgetConfigPage.
  widgetLoadError: string;
  widgetSubmitError: string;
  widgetForbidden: string;
  widgetDescription: string;
  widgetLoadingLabel: string;
  widgetPanelTitle: string;
  widgetColorFieldLabel: string;
  widgetColorFieldDescription: string;
  widgetColorPreviewTitle: string;
  widgetColorValidation: string;
  widgetPositionFieldLabel: string;
  /** `POSITION_LABELS`' two values - moved from a module-level `Record` into a function of `strings`
   * for the same reason `adminColumnVisitor`'s group above was moved. `WidgetLocale`'s own
   * `LOCALE_LABELS` is the one label map in this screen this item does not touch (11-13's own scope). */
  widgetPositionBottomRight: string;
  widgetPositionBottomLeft: string;
  widgetLanguageFieldLabel: string;
  /** `16-04`: a second panel on the same screen, same terms every field above already uses - the
   * tenant's own sentence about who processes what a visitor is about to write, and a link to their
   * own policy. Both optional; the widget renders nothing when both are empty (never an AGO-authored
   * default - `Ago.Chat.Domain.WidgetConfig`'s own remarks). */
  widgetNoticePanelTitle: string;
  widgetNoticeTextFieldLabel: string;
  widgetNoticeTextFieldDescription: string;
  widgetNoticeTextPlaceholder: string;
  widgetNoticeUrlFieldLabel: string;
  widgetNoticeUrlFieldDescription: string;
  widgetNoticeUrlValidation: string;

  // OfflineAutoReplyPage.
  autoReplyForbidden: string;
  autoReplyDescription: string;
  autoReplyLoadingLabel: string;
  autoReplyLoadError: string;
  autoReplySubmitError: string;
  autoReplyPanelTitle: string;
  autoReplyEnabledLabel: string;
  autoReplyDefaultFieldLabel: string;
  autoReplyDefaultFieldDescription: string;
  autoReplyDefaultPlaceholder: string;
  autoReplyRulesLegend: string;
  autoReplyRulesIntro: string;
  /** `${autoReplyKeywordLabelPrefix} ${index + 1}` - a rule row's two field labels, one per row. */
  autoReplyKeywordLabelPrefix: string;
  autoReplyKeywordPlaceholder: string;
  autoReplyReplyLabelPrefix: string;
  autoReplyReplyPlaceholder: string;
  autoReplyRemoveButton: string;
  /** `${autoReplyRemoveButtonAriaPrefix} ${index + 1}` - the same row-numbering composition as the
   * two label prefixes above, for the button's own accessible name. */
  autoReplyRemoveButtonAriaPrefix: string;

  // offlineAutoReplyValidation.ts - `validateDraft` is a pure function like `closeOutcomeFor`/
  // `shortcutDescription`, so it takes a `strings: ConsoleStrings = en` parameter rather than calling
  // `useStrings()` itself (it runs from a submit handler, not a render).
  autoReplyValidationNeedsDefault: string;
  autoReplyValidationDefaultTooLongPrefix: string;
  autoReplyValidationDefaultTooLongSuffix: string;
  autoReplyValidationTooManyRulesPrefix: string;
  autoReplyValidationTooManyRulesSuffix: string;
  autoReplyValidationKeywordRequired: string;
  autoReplyValidationReplyRequiredPrefix: string;
  autoReplyValidationReplyRequiredSuffix: string;
  autoReplyValidationKeywordTooLongPrefix: string;
  autoReplyValidationKeywordTooLongSuffix: string;
  autoReplyValidationReplyTooLongPrefix: string;
  autoReplyValidationReplyTooLongSuffix: string;

  // `18-03`: CannedResponsesPage - the same list-editor shape `OfflineAutoReplyPage` established just
  // above (one blank row to type into, dropped on save), reused for a genuinely different concept -
  // see `CannedResponse`'s own doc comment (`ago-chat`) for why this is not that page's rules reused.
  cannedResponsesForbidden: string;
  cannedResponsesDescription: string;
  cannedResponsesLoadingLabel: string;
  cannedResponsesLoadError: string;
  cannedResponsesSubmitError: string;
  cannedResponsesPanelTitle: string;
  cannedResponsesListLegend: string;
  cannedResponsesListIntro: string;
  /** `${cannedResponsesTitleLabelPrefix} ${index + 1}` - a response row's two field labels, one per
   * row, the same composition `autoReplyKeywordLabelPrefix` uses. */
  cannedResponsesTitleLabelPrefix: string;
  cannedResponsesTitlePlaceholder: string;
  cannedResponsesBodyLabelPrefix: string;
  cannedResponsesBodyPlaceholder: string;
  cannedResponsesRemoveButton: string;
  /** `${cannedResponsesRemoveButtonAriaPrefix} ${index + 1}` - the row-numbering composition
   * `autoReplyRemoveButtonAriaPrefix` uses, for this button's own accessible name. */
  cannedResponsesRemoveButtonAriaPrefix: string;

  // cannedResponsesValidation.ts - the same "pure function, `strings: ConsoleStrings = en` parameter"
  // shape `offlineAutoReplyValidation.ts` uses, for the identical reason (runs from a submit handler).
  cannedResponsesValidationTitleRequired: string;
  cannedResponsesValidationBodyRequiredPrefix: string;
  cannedResponsesValidationBodyRequiredSuffix: string;
  cannedResponsesValidationTitleTooLongPrefix: string;
  cannedResponsesValidationTitleTooLongSuffix: string;
  cannedResponsesValidationBodyTooLongPrefix: string;
  cannedResponsesValidationBodyTooLongSuffix: string;
  cannedResponsesValidationTooManyPrefix: string;
  cannedResponsesValidationTooManySuffix: string;

  // Composer's canned-response picker (`18-03`). Shown only when the site has at least one canned
  // response to offer - see `Composer.tsx`'s own remarks for why advertising an empty feature is
  // worse than saying nothing.
  composerCannedResponsesAvailableHint: string;

  // `19-01`: the composer's "Suggest a reply" control - populates the draft, never sends it
  // (`replyDraftApi.ts`'s own remarks on the trust boundary this stays behind).
  composerSuggestReplyButton: string;
  composerSuggestReplyGenerating: string;
  replyDraftRateLimitedError: string;
  replyDraftUnavailableError: string;
  replyDraftFailedError: string;

  // `18-04`: TagsPage - the tag vocabulary's own management surface, `site:configure`-gated like
  // CannedResponsesPage right above it.
  tagsForbidden: string;
  tagsDescription: string;
  tagsLoadingLabel: string;
  tagsLoadError: string;
  tagsCreateError: string;
  tagsRenameError: string;
  tagsDeleteError: string;
  tagsPanelTitle: string;
  tagsEmpty: string;
  tagsNameLabel: string;
  tagsSaveButton: string;
  tagsCancelButton: string;
  tagsRenameButton: string;
  tagsDeleteButton: string;
  tagsNewNameLabel: string;
  tagsNewNamePlaceholder: string;
  tagsCreatingButton: string;
  tagsCreateButton: string;

  // `18-04`: ConversationTagsPanel - the per-conversation half (applying an existing tag, not
  // managing the vocabulary above).
  tagsSectionTitle: string;
  tagsNoneApplied: string;
  tagsApplyError: string;
  tagsRemoveError: string;
  tagsApplyLabel: string;
  tagsApplyPlaceholder: string;
  tagsApplyButton: string;
  /** `${tagsRemoveButtonAriaPrefix} ${tag.name}` - the applied-tag badge's own remove button. */
  tagsRemoveButtonAriaPrefix: string;

  // `19-02`: the AI-applied-tag marker - `ConversationTagsPanel`'s own visible trust signal
  // (`adr/0078`'s kind 2 Done-when), never colour alone.
  tagsAiAppliedMarker: string;
  /** `${tagsAiAppliedAriaPrefix} ${tag.name}` - read by a screen reader in place of the marker's own
   * bare text, the same `aria-label` shape `tagsRemoveButtonAriaPrefix` already uses. */
  tagsAiAppliedAriaPrefix: string;

  // `18-04`: the workspace rail's own queue filter, and the identical control on
  // `AdminConversationsPage` - both reuse this pair rather than each declaring its own.
  workspaceTagFilterLabel: string;
  workspaceTagFilterAll: string;

  // `14-12`/`adr/0079`: ChannelIdentitiesPanel - verified channel-identity linking/unlinking. See
  // that component's own doc comment for why the generated relay instruction itself is not one of
  // these (deliberately unlocalized, matching the backend's own hardcoded reply text).
  channelIdentitiesSectionTitle: string;
  channelIdentitiesLoadingLabel: string;
  channelIdentitiesLoadError: string;
  channelIdentitiesNone: string;
  channelIdentitiesLinkKindLabel: string;
  channelIdentitiesLinkButton: string;
  channelIdentitiesRequestLinkError: string;
  channelIdentitiesUnlinkButton: string;
  channelIdentitiesUnlinkError: string;
  /** `${channelIdentitiesCodeGeneratedPrefix} ${kind}: ${code}` - the success message shown after a
   * link request is generated. */
  channelIdentitiesCodeGeneratedPrefix: string;

  // `18-04`: ConversationNotesPanel - internal, operator-only notes on a conversation. Never
  // reachable by a visitor, by construction (`ago-chat`'s `INoteRepository`'s own remarks) - this
  // panel is the console's only reader/writer of that data.
  notesTitle: string;
  notesVisitorCannotSeeNote: string;
  notesLoadingLabel: string;
  notesLoadError: string;
  notesEmpty: string;
  notesAddPlaceholder: string;
  notesAddingButton: string;
  notesAddButton: string;
  notesAddError: string;
  composerCannedResponsesListAriaLabel: string;
  composerCannedResponsesNoMatch: string;
  composerCannedResponsesInsertHint: string;

  // `16-02`: EraseConversationButton, the row-action in `AdminConversationsPage` that erases one
  // conversation on the visitor's own request. Modeled on `CloseConversationButton`'s own strings
  // above - "hidden, not disabled" gate, a real confirmation for an irreversible action - but this
  // one's confirm click starts an async Worker job rather than finishing synchronously, so it adds an
  // in-progress label the close button never needed.
  eraseConversationButton: string;
  eraseConversationDialogTitle: string;
  eraseConversationDialogBody: string;
  eraseConversationConfirmButton: string;
  /** Replaces the button once the `202 Accepted` is back and this row's own poll has started - `cancelButton`
   * is reused for the dialog's own Cancel action, the same "one field, one word" convention
   * `closeItButton`'s neighbours already follow. */
  eraseConversationErasingLabel: string;
  eraseConversationSubmitError: string;

  // `16-02`: AccountDeletionPage - `/settings/delete-account`, the tenant's own account-and-everything-
  // in-it deletion. Gated on `site:erase`, not `site:configure` (`consoleNav.ts`'s own remarks).
  accountDeletionTitle: string;
  accountDeletionDescription: string;
  accountDeletionForbidden: string;
  accountDeletionPanelTitle: string;
  accountDeletionWarningBody: string;
  accountDeletionButton: string;
  accountDeletionDialogTitle: string;
  accountDeletionDialogBody: string;
  accountDeletionConfirmButton: string;
  accountDeletionSubmitError: string;
  /** Rendered once the `202 Accepted` is back - a persistent state (`16-02`'s own Done-when: "the
   * console must not claim it is done before it is"), replacing the panel entirely rather than
   * sitting beside a now-meaningless "Delete this account" button. */
  accountDeletionInProgressTitle: string;
  accountDeletionInProgressBody: string;

  // `18-01`: SearchConversationsPage (`/search`) - site-wide full-text search, gated on
  // `site:configure` the same way `AdminConversationsPage`/`WidgetConfigPage` already are, so it reuses
  // their `siteConfig*`/`adminForbidden`-shaped strings rather than duplicating "checking
  // permissions"/"back to queue". `navSearch` sits beside `navAllConversations` in `consoleNav.ts`.
  navSearch: string;
  searchPageDescription: string;
  /** Shown once, always - not only on an empty result - because it is a property of what this search
   * covers, not a diagnosis of one query. `13-06` (retention archive) has not shipped, so today it
   * only ever means "outside the range shown below"; the wording says that without naming `13-06`. */
  searchArchiveNote: string;
  searchPhraseFieldLabel: string;
  searchPhrasePlaceholder: string;
  searchFromFieldLabel: string;
  searchToFieldLabel: string;
  searchButton: string;
  /** `${searchRangeLabel} ${fromDate} – ${toDate}` - the effective, server-echoed range, per this
   * item's own Done-when ("the bound is visible, not silent"). */
  searchRangeLabel: string;
  searchForbiddenError: string;
  searchInvalidQueryError: string;
  searchLoadError: string;
  searchLoadingLabel: string;
  searchEmpty: string;
  /** The link text on an `Assigned` hit - real click-through, attempted (`ConversationPage`'s own
   * `?at=` handling), not guaranteed to succeed (`searchConversations`'s own doc comment). */
  searchOpenLabel: string;
  /** A `Waiting` hit's own inline note, replacing a link entirely - opening one here would silently
   * *claim* it (`AssignTo`'s only non-no-op path), which a read-only search must never do as a side
   * effect of a click. */
  searchWaitingNote: string;
  /** A `Closed` hit's own inline note - nobody can rejoin a closed conversation through the hub, ever
   * (`Conversation.AssignTo`), so this is a structural fact, not a permission gap. */
  searchClosedNote: string;
  searchLoadMoreButton: string;
  searchLoadingMoreLabel: string;

  // ConversationPage's own `?at=<sequence>` handling (`18-01`) - what shows while the console is
  // paging backward looking for a search hit's own message, and what shows when the join a search
  // click attempted fails outright.
  conversationLocatingMessageLabel: string;
  /** Deliberately one message for every join failure, not three - `searchConversations`'s own doc
   * comment is why this console cannot reliably tell "assigned to someone else" apart from "closed"
   * apart from "the hub connection dropped mid-invoke": `HubException` carries only a string, no
   * error code (`ConversationsEndpoints.cs`'s REST calls get RFC 7807 `type`s; `OperatorHub`'s hub
   * methods do not), and guessing from that string's wording would be more likely to mislead than one
   * honest "could not open" sentence naming the real possibilities. */
  conversationOpenFailed: string;

  // `13-04`: BillingPage - `/settings/billing`, gated on `site:configure` like `WidgetConfigPage`/
  // `OfflineAutoReplyPage`/`AdminConversationsPage`, reusing `siteConfigCheckingPermissions`/
  // `siteConfigBackToQueue` the same way those screens already do rather than duplicating them.
  billingTitle: string;
  billingDescription: string;
  billingForbidden: string;
  billingLoadError: string;
  billingLoadingLabel: string;

  billingPanelTitle: string;
  billingTierLabel: string;
  billingSeatsUsedLabel: string;
  billingSeatLimitLabel: string;

  /** Shown while `latestSubscription.status === "Pending"` - the screen's own honest "payment
   * submitted, confirmation pending" state, polled via `usePollUntilCheckoutSettled` rather than
   * ever claimed done off the ЮKassa redirect alone. */
  billingPendingTitle: string;
  billingPendingBody: string;
  /** ЮKassa declined the payment (the webhook's own `payment.canceled`/failure outcome) - a settled,
   * non-`"Pending"` state, never shown as success. */
  billingFailedTitle: string;
  billingFailedBody: string;
  /** `decisions/0006`: a recurring re-charge failed; the paid tier's entitlements stay exactly as
   * they are while daily retries run for up to a week - this is a warning, not an outage. */
  billingPastDueTitle: string;
  billingPastDueBody: string;

  /** Trailing interpolation - `${billingCancelRequestedBody} ${date}.`, the same "fixed label, one
   * value appended" shape `searchRangeLabel`'s own doc comment already establishes for this
   * codebase's other date-carrying string. */
  billingCancelRequestedTitle: string;
  billingCancelRequestedBody: string;
  /** Trailing interpolation - `${billingPendingDowngradeBody} ${seats} (${tier}).` */
  billingPendingDowngradeTitle: string;
  billingPendingDowngradeBody: string;

  billingSeatCountFieldLabel: string;
  billingSeatCountFieldDescription: string;
  billingSubscribeButton: string;
  billingSubscribingButton: string;
  billingChangeSeatsButton: string;
  billingChangingSeatsButton: string;
  billingCheckoutError: string;
  billingSeatChangeError: string;
  /** Trailing interpolation - `${billingUpgradeSuccessBody} ₽${amount} · ${tier}, ${seats}.` The only
   * one-off confirmation this screen shows for a write: the charged amount is not otherwise visible
   * anywhere once the page reflects the new tier, unlike a downgrade or a cancellation, both of which
   * this screen shows entirely through persistent state (`billingPendingDowngradeBody`/
   * `billingCancelRequestedBody` above) rather than a second, redundant toast. */
  billingUpgradeSuccessTitle: string;
  billingUpgradeSuccessBody: string;

  billingCancelButton: string;
  billingCancelDialogTitle: string;
  billingCancelDialogBody: string;
  billingCancelConfirmButton: string;
  billingCancelError: string;

  // `18-08`: OperatorAnalyticsPage (`/analytics`) - the site owner's own basic self-service report,
  // gated on `site:configure` the same way `SearchConversationsPage`/`AdminConversationsPage` already
  // are, so it reuses their "checking permissions"/"back to queue" shape rather than duplicating it.
  // `navAnalytics` sits beside `navSearch`/`navAllConversations` in `consoleNav.ts`.
  navAnalytics: string;
  analyticsPageDescription: string;
  analyticsFromFieldLabel: string;
  analyticsToFieldLabel: string;
  analyticsApplyButton: string;
  /** `${analyticsRangeLabel} ${fromDate} – ${toDate}` - the effective, server-echoed range, the same
   * "the bound is visible, not silent" shape `searchRangeLabel`'s own doc comment already establishes
   * (`GetOperatorAnalyticsForSiteHandler`'s own default window is never assumed client-side). */
  analyticsRangeLabel: string;
  analyticsForbiddenError: string;
  /** `Analytics.InvalidRange` - the caller's own `from`/`to` failed `from < to`, the one validation
   * `GetOperatorAnalyticsForSiteHandler` does before reaching the read store. */
  analyticsInvalidRangeError: string;
  analyticsLoadError: string;
  analyticsLoadingLabel: string;
  /** Shown when `overall.conversationCount` is `0` - a real, honest state (`OperatorAnalyticsReadStore`'s
   * own remarks: `GROUPING SETS` over zero rows returns zero rows, substituted with an explicit zero
   * bucket), not a loading or error state. */
  analyticsEmpty: string;
  analyticsChannelColumn: string;
  analyticsConversationCountColumn: string;
  analyticsAverageFirstResponseColumn: string;
  /** `18-13`: how long a conversation takes from start to close, averaged - a different question from
   * `analyticsAverageFirstResponseColumn`'s "how fast did someone pick this up", shown as its own
   * column rather than folded into that one. Rendered with the same `formatDurationSeconds` helper and
   * the same `analyticsNoResponsesValue` em dash for a bucket where nothing has closed yet. */
  analyticsAverageDurationColumn: string;
  analyticsMissedCountColumn: string;
  /** The table's own first row, before the per-channel breakdown - every conversation in the window,
   * regardless of channel (`OperatorAnalyticsResult.Overall`, `ago-chat`). */
  analyticsOverallRowLabel: string;
  /** Shown in the average-first-response column when a bucket's own value is `null` - no conversation
   * in it ever received an operator reply, so there is nothing to average
   * (`OperatorAnalyticsBucket.AverageFirstResponseSeconds`'s own remarks: never zero, never inflated).
   * An em dash, not "0s" or "N/A" - `0s` would read as "answered instantly", which is the one thing
   * this value must never imply here. */
  analyticsNoResponsesValue: string;
  /** The four `Ago.Chat.Domain.ChannelKind` members' own display labels, plus `Widget` for a visitor
   * with no external channel identity at all (`IOperatorAnalyticsReadStore`'s own remarks) - the wire
   * value is the CLR member name, never shown to an operator unlabelled. */
  analyticsChannelWidget: string;
  analyticsChannelSms: string;
  analyticsChannelMax: string;
  analyticsChannelTelegram: string;
  analyticsChannelWhatsApp: string;

  // `18-09`: the per-operator breakdown, a second table below the overall/per-channel one - a
  // different dimension over the same three numbers, not a second report (`OperatorAnalyticsPage`'s
  // own doc comment argues why a second table rather than a second page).
  analyticsByOperatorHeading: string;
  analyticsOperatorColumn: string;
  /** Shown instead of the per-operator table when the report has conversations but none of them
   * attribute to any operator (a possible, if unusual, real state - `IOperatorAnalyticsReadStore`'s
   * own remarks on why a conversation closed while still `Waiting` attributes to nobody) - distinct
   * from `analyticsEmpty`, which means the whole report is empty. */
  analyticsByOperatorEmpty: string;

  // `18-10`: ConversationOutcomePanel - what an operator says one conversation led to. Three real,
  // settable values plus the unset default's own display label.
  outcomeSectionTitle: string;
  outcomeLoadingLabel: string;
  outcomeLoadError: string;
  outcomeSetError: string;
  outcomeUnset: string;
  outcomeConverted: string;
  outcomeNotConverted: string;
  outcomeFollowUpNeeded: string;
  /** Shown under the outcome control itself, not only on the report that reads it back -
   * `Ago.Chat.Domain.ConversationOutcome`'s own remarks on why this framing has to travel with the
   * value, not live only in one document. */
  outcomeNotAVerifiedSaleNote: string;

  // `18-10`: ConversionReportPage (`/analytics/conversion`) - the site owner's own conversion report,
  // a second, separate report from `/analytics` rather than a third table bolted onto it
  // (`OperatorAnalyticsPage`'s own doc comment on why a third, unrelated concept earns its own page).
  // Gated on `site:configure`, the same shape `analyticsForbiddenError`/`analyticsInvalidRangeError`
  // above already establish for its sibling report - this reuses those two rather than declaring a
  // near-duplicate pair.
  navConversionReport: string;
  conversionReportPageDescription: string;
  /** The report's own headline honesty statement - rendered prominently, not in fine print, per this
   * item's own crux: a conversion rate built from operator-reported outcomes is real and useful, and
   * it is not the same claim as "N% of chats resulted in a verified sale." */
  conversionReportNotAVerifiedSaleBanner: string;
  conversionReportFromFieldLabel: string;
  conversionReportToFieldLabel: string;
  conversionReportApplyButton: string;
  conversionReportRangeLabel: string;
  conversionReportLoadingLabel: string;
  conversionReportEmpty: string;
  /** The three date-range presets the backlog item names by name - calendar month, previous calendar
   * month, last 30 days (`../time/rangePresets.ts`). */
  conversionReportPresetThisMonth: string;
  conversionReportPresetLastMonth: string;
  conversionReportPresetLast30Days: string;
  conversionReportConvertedColumn: string;
  conversionReportNotConvertedColumn: string;
  conversionReportFollowUpNeededColumn: string;
  /** How much of this bucket has no recorded outcome at all - rendered next to the rate, not buried,
   * so a thin-coverage rate never reads as more authoritative than it is
   * (`ConversionBucketDto.unsetCount`'s own remarks). */
  conversionReportUnsetColumn: string;
  conversionReportRateColumn: string;
  /** Shown in the rate column when a bucket's own `conversionRate` is `null` - nothing has been
   * recorded either way yet, so there is nothing to compute a rate from. An em dash, the same "never a
   * misleading zero" convention `analyticsNoResponsesValue` already establishes for an analogous
   * null. */
  conversionReportNoDataValue: string;
  conversionReportOverallRowLabel: string;
  conversionReportByOperatorHeading: string;
  conversionReportOperatorColumn: string;
  conversionReportByOperatorEmpty: string;

  // `18-14`: BookingFlowConversionPage (`/analytics/booking-flow`) - the console's own small,
  // visually distinct block for the chat-to-booking conversion report, deliberately not folded into
  // `/analytics`'s own table (`analyticsPageDescription` and this page share the `site:configure`
  // gate but nothing else - see the page's own doc comment for why they stay two pages). `navBookingFlow`
  // sits beside `navAnalytics` in `consoleNav.ts`.
  navBookingFlow: string;
  bookingFlowPageDescription: string;
  /** The load-bearing sentence this whole item exists to ship: a closed booking-flow task is not the
   * same fact as a confirmed booking (`Ago.Chat.Application.Abstractions.IModuleFlowReadStore`'s own
   * remarks, `ago-chat`, have the full reasoning - a visitor can abandon the flow, an operator can
   * close the conversation mid-step, or the flow can finish with every slot declined, and all three
   * close the underlying task identically to a real booking). Rendered directly beside the two
   * numbers, not only in this file's own comments - the backlog item's own Done-when requires the
   * caveat live in the text a site owner actually reads. */
  bookingFlowCaveat: string;
  bookingFlowFromFieldLabel: string;
  bookingFlowToFieldLabel: string;
  bookingFlowApplyButton: string;
  /** Same `${bookingFlowRangeLabel} ${fromDate} – ${toDate}` shape as `analyticsRangeLabel` - the
   * effective, server-echoed range, never the raw values still sitting in the two date inputs. */
  bookingFlowRangeLabel: string;
  bookingFlowForbiddenError: string;
  /** `ModuleFlow.InvalidRange` - the caller's own `from`/`to` failed `from < to`, the one validation
   * `GetModuleFlowReportForSiteHandler` does before reaching the read store. A distinct string from
   * `analyticsInvalidRangeError`/`conversionReportInvalidRangeError` because this report is a
   * distinct error code server-side (`ConversationErrors.ModuleFlowInvalidRange`'s own remarks on
   * why). */
  bookingFlowInvalidRangeError: string;
  bookingFlowLoadError: string;
  bookingFlowLoadingLabel: string;
  /** Never "Bookings started" - "started a booking flow" is the honest claim
   * (`BookingFlowReportResponse.FlowsStarted`'s own remarks, `ago-chat`). */
  bookingFlowStartedLabel: string;
  /** Never "Bookings confirmed"/"Converted" - "flow closed" is the honest claim
   * (`BookingFlowReportResponse.FlowsClosed`'s own remarks, `ago-chat`). */
  bookingFlowClosedLabel: string;
  /** Shown when `flowsStarted` is `0` for the reported window - a real, honest state (nobody opened
   * the booking flow in this range), not a loading or error state, the same "an empty report is not a
   * failure" shape `analyticsEmpty` already establishes for `/analytics`. */
  bookingFlowEmpty: string;
}
