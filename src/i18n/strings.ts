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
  navPlatformSites: string;
  /** `16-02`: gated on `site:erase`, deliberately separate from the `site:configure` block above -
   * the backlog item's own scope note ("a single boolean that destroys a business is a plausible case
   * for its own [permission]"). */
  navDeleteAccount: string;
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
}
