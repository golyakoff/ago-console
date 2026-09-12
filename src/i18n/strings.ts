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
  navSectionsAriaLabel: string;
  /** `11-14`: the accessible name of `AppShell`'s hamburger control - visible only below the
   * mobile breakpoint, and icon-only even there (`.ago-shell__menu-icon` carries no text), so this
   * is the one thing a screen-reader user is told about it beyond its role. */
  navOpenMenu: string;
  /** `23-41`: `RenderErrorBoundary.tsx`'s own `RenderErrorAlert` - the one fallback rendered at every
   * one of its three mount points (`main.tsx`, `AppShell`/`CenteredShell`, `OperatorShell`'s
   * `<Outlet />`) when a descendant throws during render instead of blanking the whole console. */
  renderErrorTitle: string;
  /** Says what is actually known (a shape mismatch, not "an unexpected error") and stays true
   * whether this fired at the root or around one routed screen - see `RenderErrorBoundary.tsx`'s own
   * doc comment for why the wording deliberately claims nothing about scope. */
  renderErrorMessage: string;
  renderErrorRetryButton: string;
  /** `23-31`: the "Диалоги" section's own header text - also reused, unchanged, as this section's
   * accordion label in `consoleNav.ts`. */
  navConversations: string;
  /** `23-31`: the item within "Диалоги" for the operator's own queue (`/`) - distinct from
   * `navConversations` above, which now names the *section*, not this one entry. Before this item
   * the two were the same string ("Conversations"/"Диалоги"), because the route sat at the nav's top
   * level with no section wrapping it. */
  navMyConversations: string;
  navAllConversations: string;
  /** `23-31`: renamed from "Widget appearance"/"Внешний вид виджета" - the "Каналы" section's own
   * naming rule (`docs/backlog/23-31-*.md`'s "One naming rule" addendum) names every entry for the
   * channel it is, and "Внешний вид" stopped reading as "whose appearance" once it sat beside "Бот
   * MAX"/"Бот Telegram" rather than under its own "Виджет на сайте" subheading. */
  navWidgetAppearance: string;
  /** `10-06`: sits beside `navWidgetAppearance` in `consoleNav.ts`, one position earlier - installing
   * the widget is the step a tenant needs *before* appearance is worth touching (the backlog item's
   * own Open Questions leans this way: "installing first means she sees her own shop with a
   * default-looking widget, which may be the better first impression"). */
  navInstallWidget: string;
  navOfflineAutoReply: string;
  /** `18-03`: `site:configure`-gated, sits beside `navWidgetAppearance`/`navOfflineAutoReply` in
   * `consoleNav.ts` - the same permission group, one more tenant self-service screen. */
  navCannedResponses: string;
  /** `18-04`: same permission group, sits beside `navCannedResponses` in `consoleNav.ts` - the tag
   * vocabulary's own management surface (`/automation/tags`, `TagsPage`). */
  navTags: string;
  navPlatformSites: string;
  /** `16-02`: gated on `site:erase`, deliberately separate from the `site:configure` block above -
   * the backlog item's own scope note ("a single boolean that destroys a business is a plausible case
   * for its own [permission]"). */
  navDeleteAccount: string;
  /** `13-04`: `site:configure`-gated, sits beside `navWidgetAppearance`/`navOfflineAutoReply` in
   * `consoleNav.ts` - the same permission group, one more tenant self-service screen. */
  navBilling: string;
  /** `23-22`: gated on `site:manage_operators` - its own, separate permission group in
   * `consoleNav.ts`, deliberately not folded into the `site:configure` block above (an operator who
   * may reconfigure the widget must not, by that alone, manage who else works here - the same
   * separation `navDeleteAccount`'s own `site:erase` gate already draws for a different dedicated
   * permission). `23-31`: renamed from "Team"/"Команда" to "Employees"/"Сотрудники" - "Team" is now
   * the *section* name (`navSectionTeam`), which also holds the reserved "Team chat" place, and this
   * entry is one item inside it, not the section itself. */
  navOperatorsTeam: string;
  // --- `23-31`: the seven accordion section headers. Three reuse an existing label unchanged
  // (`navConversations`, `navAnalytics`, both already the exact section name) - only the four with no
  // existing flat-nav equivalent get a new key here. ---
  /** The section header - "Записи"/"Bookings" as of `25-50` (was "Календарь"/"Calendar"; the section
   * is not a calendar view, it is the tenant's own bookings) - distinct from any one calendar
   * screen's own title. */
  navSectionCalendar: string;
  /** The "Команда" section header - distinct from `navOperatorsTeam` (one item inside it). */
  navSectionTeam: string;
  /** The "Каналы" section header. */
  navSectionChannels: string;
  /** The "Автоматизация" section header. */
  navSectionAutomation: string;
  /** The "Администрирование" section header. */
  navSectionAdmin: string;
  /** `23-31`: the services dictionary, carved out of `/calendar/setup` onto its own screen
   * (`/calendar/services`) - `CalendarSetupPage`'s own doc comment on the split. */
  navCalendarServices: string;
  /** `23-34` gave this a real screen (`CalendarBookingsPage`, `/calendar/bookings`) - the
   * confirmed-bookings list, next to `navCalendarQueue`'s own unconfirmed one. `25-50`: relabelled
   * "Утверждённые"/"Confirmed" (was "Записи"/"Bookings"), freed by `navSectionCalendar` taking that
   * word for the section itself. */
  navCalendarBookings: string;
  /** `23-31`: a reserved place - one chat for the whole tenant's team, no screen yet. */
  navTeamChat: string;
  /** `23-31`: a reserved place - the MAX channel has an adapter since `14-02` but no console screen. */
  navChannelsMax: string;
  /** `23-31` drew this as a reserved place; `23-36` gives it a real screen (`TelegramChannelPage`,
   * `/channels/telegram`) - the section header label for that route in `consoleNav.ts`. */
  navChannelsTelegram: string;
  /** `23-31`: a reserved place for VK/Avito/WhatsApp/email - four adapters, no screen for any of
   * them. */
  navChannelsOther: string;
  /** `23-31`: a reserved place - the AI-suggestion module has no screen yet. */
  navAutomationAiSuggestions: string;
  /** `23-31`: a reserved place - the AI-auto-reply module has not been built at all. */
  navAutomationAiAutoReply: string;
  /** `23-31`: `/settings/products` finally gets a nav entry, moved to `/account/products` - `23-25`
   * built the route and screen but left the label unset, deliberately, pending this item's own
   * placement decision (`consoleNav.ts`'s old comment on the line this key replaces). */
  navAccountProducts: string;
  /** `23-31`: a reserved place - `24-02` built the publish mechanism, no screen reads it back yet. */
  navAccountDocuments: string;
  /** `23-31`: the small badge on a `reserved` nav entry (`AppShellNavItem.reserved`) - a place held
   * for a screen that does not exist yet, never a working link. */
  navComingSoonLabel: string;
  /** `23-31`/`adr/0129`: the small badge on a `muted` nav entry under the *replaced* muting rule -
   * muted now means "this identity could buy the module itself", so the badge names that rather than
   * naming a colleague who could grant it (the old `navLockedLabel`, deleted with this item - nothing
   * in the new rule is ever muted for a reason a badge reading "locked" would describe honestly). */
  navBuyableLabel: string;
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

  // `343`: `time/format.ts`'s own locale fields. That file's exported functions take
  // `strings: ConsoleStrings` as a parameter (defaulted to `en`) rather than reading a module-level
  // constant or calling `useStrings()` itself - see that file's own header for why. Every real call
  // site already holds a `strings` value from its own `useStrings()`, so this costs one more argument
  // per call, not a new hook or a second string table to keep in sync with this one.

  /** The BCP-47 tag every `Intl.DateTimeFormat` call in `time/format.ts` renders with -
   * `date-and-time.md` rule 5's rendering locale. The 24-hour clock and day-before-month order are
   * fixed in code (`hourCycle: "h23"`, explicit field order) and do not move with this - only weekday
   * names, month names and connective words like "at" do (`format.test.ts` proves both halves against
   * real `Intl` output). */
  dateIntlLocale: string;
  /** `formatDayLabel`'s two near-instant branches - `Intl` has no "Today"/"Yesterday" concept of its
   * own, so these are literal strings composed alongside its own weekday/date rendering rather than
   * anything `Intl` returns. */
  dateToday: string;
  dateYesterday: string;
  /** `formatElapsed`'s floor and `formatElapsedWords`'s floor - under a minute reads as one of these,
   * never `0m`/`0 minutes` (`date-and-time.md`: rounding towards the past). */
  elapsedJustNow: string;
  elapsedLessThanMinute: string;
  /** `${n} ${elapsedMinuteOne|elapsedMinuteOther}` - the same binary singular/plural convention
   * `queueUnreadMessageOne`/`Other` above already uses, not full Russian plural grammar (a count of
   * 2-4 reads with the "Other" form here exactly as it does there - a deliberate, existing
   * simplification this item keeps rather than replaces). */
  elapsedMinuteOne: string;
  elapsedMinuteOther: string;
  elapsedHourOne: string;
  elapsedHourOther: string;
  elapsedDayOne: string;
  elapsedDayOther: string;

  // ConversationList - the queue.
  queueAssignedTitle: string;
  queueAssignedNote: string;
  queueAssignedLoadingLabel: string;
  queueAssignedEmpty: string;
  queueEmptyInstallPrompt: string;
  queueEmptyInstallLink: string;
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
  /** `${queueWaitingNotePrefix} ${seconds} ${queueWaitingNoteSuffix}`. `23-04`: reworded from
   * "Read-only" now that a row here is a real link (`ConversationList`'s own doc comment) - the poll
   * cadence this composes is still true and still worth stating, but "never claimed here" is not. */
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
  /** `23-10`: the button that appears beside a message once the operator has selected text inside
   * it - clicking it pre-fills `ContactDetailsPanel`'s own draft with exactly what was selected. */
  threadPromoteToContactButton: string;
  /** `23-19`: a persistent caption above the thread, shown for every conversation - not only channel
   * ones - so the *absence* of a delivery badge on a widget conversation is never mistaken for a
   * failure (`flows.md` 4.5's own "must not be made to interpret a delivery status that means
   * something only to an engineer", read the other way: silence must not read as a status either). */
  threadDeliveryScopeNote: string;
  /** The badge on an operator's own message once its channel send succeeded - plain wording, never
   * the wire enum member (`ChannelDeliveryDto.status === "Delivered"`) shown verbatim. */
  threadDeliveryDeliveredBadge: string;
  /** The badge on an operator's own message once its channel send was refused
   * (`ChannelDeliveryDto.status === "Refused"`) - paired with the provider's own detail in the
   * badge's `title`, prefixed by `threadDeliveryReasonPrefix`. */
  threadDeliveryNotDeliveredBadge: string;
  /** `${threadDeliveryReasonPrefix} ${failureReason}` - the refused badge's own `title`. The
   * provider's own free-text reason is not translated (it is not this console's own vocabulary to
   * translate, the same "relayed, not authored" posture `ChannelIdentitiesPanel`'s link-instruction
   * text already takes for a different provider-facing string), only this prefix is. */
  threadDeliveryReasonPrefix: string;

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
  /** `23-04`: no longer says "nothing here needs claiming" - a waiting row in the rail this empty
   * state sits beside is a real, clickable take now (`ConversationList`'s own doc comment). */
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

  // AttachmentUploadGrantToggle (`23-78`).
  attachmentUploadGrantButton: string;
  attachmentUploadRevokeButton: string;
  attachmentUploadGrantToggleError: string;
  attachmentUploadGrantedByOperatorNote: string;
  attachmentUploadGrantedByDefaultNote: string;

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

  // `23-20`: AwayControl - deliberately distinct from ConnectionStateBadge above (that is the
  // *connection*; this is the operator's own deliberate choice). Every string names what the act
  // does to a visitor, not just "Away"/"Online" - a label alone repeats the problem the item exists
  // to fix, in a smaller font. See AwayControl's own doc comment for why this is not a twelfth
  // adr/0030 component.
  /** The button shown while online - clicking it goes away. */
  workspaceAwayGoAwayButton: string;
  /** Its title/tooltip - said before the operator clicks, not just after. */
  workspaceAwayGoAwayDetail: string;
  /** The button shown while away - clicking it comes back online. */
  workspaceAwayComeBackButton: string;
  workspaceAwayComeBackDetail: string;
  /** A persistent, visible sentence (an Alert, not a tooltip) while away - the effect is happening
   * right now, not merely on the next click, so it must not be hidden behind a hover. */
  workspaceAwayActiveNotice: string;
  /** The toggle's own fallback error - same "message if it's an Error, else this" convention every
   * other load/save error in this codebase uses. */
  workspaceAwayToggleError: string;

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
   * `conversation:erase` and/or (`23-04`) `conversation:assign` (`AdminConversationsPage`'s own
   * `buildColumns`), so an operator with neither never sees an all-empty column. */
  adminColumnActions: string;
  /** Shown once at least one row in this list has actually been confirmed erased (the poll's own
   * `"erased"` outcome, never the optimistic click) - `16-02`'s own Done-when: "the console must not
   * claim it is done before it is." */
  adminConversationErasedNotice: string;

  // ClaimConversationButton (`23-04`) - shared by AdminConversationsPage's own row action and
  // SearchConversationsPage's own per-hit action, the same "one component, two pages" shape
  // EraseConversationButton already establishes for AdminConversationsPage alone.
  claimConversationButton: string;
  claimConversationSubmittingLabel: string;
  claimConversationSubmitError: string;

  // WidgetConfigPage.
  widgetLoadError: string;
  widgetSubmitError: string;
  widgetForbidden: string;
  widgetDescription: string;
  widgetLoadingLabel: string;
  widgetPanelTitle: string;
  /** `23-108`: `Site.WidgetConfig.RequireContactConsent`, reachable by its owner for the first time. */
  widgetRequireContactConsentLabel: string;
  widgetRequireContactConsentDescription: string;
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
   * default - `Ago.Chat.Domain.WidgetConfig`'s own remarks).
   *
   * `25-24`: this panel's title now names the notice-text card alone - `requireContactConsent` moved
   * to its own `widgetContactConsentPanelTitle` panel below, since the two are different questions
   * (what the notice says vs. whether accepting something is mandatory) that grouping them under one
   * title implied were the same. */
  widgetNoticePanelTitle: string;
  widgetNoticeTextFieldLabel: string;
  widgetNoticeTextFieldDescription: string;
  widgetNoticeTextPlaceholder: string;
  widgetNoticeUrlFieldLabel: string;
  widgetNoticeUrlFieldDescription: string;
  widgetNoticeUrlValidation: string;
  /** `25-24`: the card's default, read-only view of the tenant's *current* notice - `widgetNoticeCurrentLabel`
   * captions the (possibly truncated, `widgetNoticeShowFully`/`widgetNoticeShowLess`) text,
   * `widgetNoticeUrlCurrentLabel` the link, and `widgetNoticeNotSetLabel` covers the one case with no
   * current text or link to show at all. `widgetNoticeEditButton` is the deliberate secondary action
   * that reveals the same `widgetNoticeTextFieldLabel`/`widgetNoticeUrlFieldLabel` editor untouched -
   * `strings.cancelButton` (already declared above) is reused for the toggle's own open state, the
   * same reuse `25-21`'s `ConsentDocumentPanel` already makes for its identical toggle. */
  widgetNoticeCurrentLabel: string;
  widgetNoticeUrlCurrentLabel: string;
  widgetNoticeNotSetLabel: string;
  widgetNoticeShowFully: string;
  widgetNoticeShowLess: string;
  widgetNoticeEditButton: string;
  /** `25-24`: `requireContactConsent`'s own card, split out of the notice-text panel above. */
  widgetContactConsentPanelTitle: string;
  /** `23-63`: the launcher-attention toggle, on the identical "Launcher" panel `widgetPositionFieldLabel`
   * already lives on - a boolean, off by default, no separate description field the way `noticeText`
   * has: the one sentence worth saying (that reduced motion overrides it regardless) is short enough
   * to live in the checkbox's own label sibling text rather than a second `Field` description. */
  widgetAttractAttentionLabel: string;
  widgetAttractAttentionDescription: string;

  /** `23-64`: the auto-open panel, on the same "Launcher" panel as the two toggles above - a
   * checkbox (off by default, `adr/0148`'s whole design), a delay `Select` (the closed six-value set
   * `Ago.Chat.Domain.AutoOpenDelay` fixes, not a free number), and a `Textarea` for the tenant's own
   * greeting line, with no default text of ours - the identical "no default sentence we supply"
   * posture `widgetNoticeTextFieldDescription` already states for its own field. */
  widgetAutoOpenLabel: string;
  widgetAutoOpenDescription: string;
  widgetAutoOpenDelayFieldLabel: string;
  widgetAutoOpenGreetingFieldLabel: string;
  widgetAutoOpenGreetingFieldDescription: string;
  widgetAutoOpenGreetingPlaceholder: string;
  /** UX-only mirror of `Ago.Chat.Domain.WidgetConfig`'s own "auto-open enabled requires a greeting"
   * guard - the same posture `widgetColorValidation`/`widgetNoticeUrlValidation` already take toward
   * their own server-side rule. */
  widgetAutoOpenGreetingRequiredValidation: string;
  /** `23-64`: the six option labels for `AutoOpenDelaySeconds` - a fixed, hand-written map rather than
   * a pluralization function, the same "closed set of two, hand-written" shape `LOCALE_LABELS` already
   * uses in `WidgetConfigPage.tsx` (that page's own comment on why this project has exactly two
   * selects, now three). Keyed by the delay itself, `AutoOpenDelaySeconds`'s own values. */
  /** `25-39`: a third widget-config panel, kept separate from "Launcher"/"Processing notice" - see
   * `WidgetConfigPage.tsx`'s own remarks on why. A temporary, off-by-default relaxation of `20-09`'s
   * verified-phone requirement for the chat-driven booking module, named plainly as a workaround for
   * the missing `14-15` gateway rather than dressed up as a feature. */
  widgetBookingPanelTitle: string;
  widgetAcceptUnverifiedPhoneLabel: string;
  widgetAcceptUnverifiedPhoneDescription: string;
  widgetAutoOpenDelay15: string;
  widgetAutoOpenDelay30: string;
  widgetAutoOpenDelay45: string;
  widgetAutoOpenDelay60: string;
  widgetAutoOpenDelay90: string;
  widgetAutoOpenDelay120: string;

  // InstallSnippetPage (`10-06`). Reuses `siteConfigCheckingPermissions`/`siteConfigBackToQueue` from
  // the shared block above, the same way `WidgetConfigPage`/`OfflineAutoReplyPage` already do.
  /** Shown instead of `widgetForbidden`'s sibling text - phrased for this screen's own subject
   * ("installation details") rather than reusing a generic "configure this site" sentence, the same
   * one-field-per-exact-wording convention `widgetForbidden`/`autoReplyForbidden` already keep separate
   * from each other. */
  installForbidden: string;
  installLoadError: string;
  /** The page's own subtitle, under the heading - explains what the screen is for before either panel
   * loads, the same role `widgetDescription` plays on the appearance screen. */
  installDescription: string;
  installLoadingLabel: string;
  installKeyPanelTitle: string;
  /** Written for someone who has never seen a `<script>` tag (`10-06`'s own Done-when): what the key
   * is, and the plain reassurance that it being visible to anyone who inspects the widget on a live
   * page is normal, not a leak. */
  installKeyPanelDescription: string;
  installKeyCopyButton: string;
  /** Announced via `Alert tone="success"`, `role="status"` - the identical live-region shape
   * `siteConfigSavedAlert` already uses for a different confirmation. */
  installKeyCopiedLabel: string;
  installOriginPanelTitle: string;
  /** Explains what the address is *for* - the widget's own browser-side origin check - not just that
   * it exists, since a mismatch here is `10-06`'s own named silent-failure trap. */
  installOriginPanelDescription: string;
  /** `adr/0092`/`#324`: the tag itself, at last. `10-06` shipped this screen with a plain-language
   * "not yet" note in its place, because no public URL served the widget script for an arbitrary
   * tenant - printing a broken URL to look finished would have been worse than saying so. The bundle
   * is now served at `{apiBaseUrl}/widget/`, so the snippet is *composed* from the API origin the
   * console already has rather than read from a second config value that could drift from it. */
  installSnippetPanelTitle: string;
  installSnippetPanelDescription: string;
  installSnippetCopyButton: string;
  installSnippetCopiedLabel: string;

  // `23-06`: the install screen's own headline panel - the two facts (was the widget seen, is the
  // product being used) folded into one of four states by `Ago.Chat.Domain.SiteInstallationStateResolver`
  // server-side, worded here so *not seen at all* reads as a next step, *installed and quiet* says how
  // long, and *never seen but in use* never tells a channel-only tenant to go fix an install
  // (`docs/design/decisions.md` §3's two-facts amendment).
  installStatusPanelTitle: string;
  /** `SiteInstallationState.NotSeenYet` - the state a brand-new tenant gets on day one. Framed as a
   * next step ("paste it below"), never as a failure - `decisions.md`'s own "the wrong one is the
   * discouraging one". */
  installStatusNotSeenYet: string;
  /** `SiteInstallationState.SeenAndQuiet` - paired in the UI with {@link installStatusLastSeenLabel}/
   * {@link installStatusFirstSeenLabel} and a formatted elapsed time, never shown alone. */
  installStatusSeenAndQuiet: string;
  installStatusLastSeenLabel: string;
  installStatusFirstSeenLabel: string;
  /** `SiteInstallationState.EveryRequestRefused`, the text *before* the refused origin - the origin
   * itself is rendered as a `<code>` chip between this and {@link installStatusRefusedSuffix}, the
   * same "prefix, formatted value, suffix" composition {@link installStatusLastSeenLabel} already
   * uses for a timestamp instead of an origin. */
  installStatusRefusedPrefix: string;
  installStatusRefusedSuffix: string;
  /** `SiteInstallationState.NeverSeenButInUse` - the channel-only tenant `decisions.md`'s two-facts
   * amendment exists to protect. Must never suggest fixing an install that was never broken. */
  installStatusNeverSeenButInUse: string;

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

  // `23-05`: the assignment-penalty control on the same `/settings/auto-reply` screen - a second,
  // independent panel for a second, independent site-configuration resource
  // (`assignmentPenaltyApi.ts`/`assignmentPenaltyValidation.ts`), not folded into the offline
  // auto-reply form above it.
  assignmentPenaltyPanelTitle: string;
  assignmentPenaltyDescription: string;
  assignmentPenaltyFieldLabel: string;
  assignmentPenaltyLoadingLabel: string;
  assignmentPenaltyLoadError: string;
  assignmentPenaltySubmitError: string;
  assignmentPenaltyValidationRequired: string;
  assignmentPenaltyValidationMustBePositive: string;

  // `23-37`: DocumentsPage, `/account/documents` - the tenant's own read/publish screen for
  // `24-02`/`24-05`'s consent-document mechanism, gated on `site:configure` like the routes behind
  // it. `documentsContactNotRequiredBadge`/`documentsMarketingNeverRequiredNote` are this item's own
  // design choice: the screen must not let a tenant believe a published document binds anyone unless
  // something actually enforces it (`Site.WidgetConfig.RequireContactConsent` for Contact; nothing,
  // ever, for Marketing). `documentsAcceptancesPrivacyNote` is the other one: the list shows which
  // visitor, which version and when - never the client IP or user agent the record also holds.
  documentsPageForbidden: string;
  documentsPageLoadError: string;
  documentsPageLoadingLabel: string;
  documentsPageIntro: string;
  documentsContactPanelTitle: string;
  documentsMarketingPanelTitle: string;
  documentsContactRequiredBadge: string;
  /**
   * `23-108`: split in two so the destination can be a real `<Link>` between them, which is
   * `23-107`'s rule - a screen name is not a path. It used to name the control in prose, and that
   * control **did not exist anywhere in this console**: the phrase appeared exactly once in the
   * whole codebase, in this sentence. The setting was real and enforced by the API the entire time.
   */
  documentsContactNotRequiredIntro: string;
  documentsContactNotRequiredOutro: string;
  documentsMarketingNeverRequiredNote: string;
  documentsCurrentVersionLabel: string;
  documentsNoVersionsYet: string;
  documentsVersionsHeading: string;
  documentsReadAsVisitorLink: string;
  documentsPublishFormTitleLabel: string;
  documentsPublishFormTitlePlaceholder: string;
  documentsPublishFormBodyLabel: string;
  documentsPublishFormBodyPlaceholder: string;
  documentsPublishButton: string;
  documentsPublishingButton: string;
  documentsPublishSuccessAlert: string;
  documentsPublishError: string;
  documentsPublishValidationTitleRequired: string;
  documentsPublishValidationBodyRequired: string;
  documentsAcceptancesToggleShow: string;
  documentsAcceptancesToggleHide: string;
  /** `25-21`: composed at the call site as `${prefix}${version.title} (${version.version}, ${date})` -
   * the same fixed-fragment convention `policyPagePublishedPrefix`/`policyPageVersionSeparator`
   * already use, so the string itself carries its own trailing space rather than the call site
   * guessing at one. Renamed from the unused `documentsAcceptancesHeading` ("Who accepted"/"Кто
   * принял") rather than added alongside it - that key never had a call site, and the per-version
   * card title this item introduces is what it was always going to be used for. */
  documentsAcceptancesCardTitlePrefix: string;
  documentsAcceptancesLoadingLabel: string;
  documentsAcceptancesLoadError: string;
  documentsAcceptancesEmpty: string;
  documentsAcceptancesColumnSubject: string;
  documentsAcceptancesColumnVersion: string;
  documentsAcceptancesColumnAcceptedAt: string;
  documentsAcceptancesPrivacyNote: string;

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
  /** `14-13`: the badge shown on the one row that is the visitor's own `PreferredChannelIdentityId`. */
  channelIdentitiesPreferredBadge: string;
  /** `14-13`: the action offered on every other active row - marks that row preferred instead. */
  channelIdentitiesPreferButton: string;
  /** `14-13`: the action offered only on the preferred row - the explicit "back to automatic" request. */
  channelIdentitiesClearPreferenceButton: string;
  channelIdentitiesPreferError: string;
  /** `${channelIdentitiesCodeGeneratedPrefix} ${kind}: ${code}` - the success message shown after a
   * link request is generated. */
  channelIdentitiesCodeGeneratedPrefix: string;

  // `14-14`/`23-09`/`adr/0079` section 6: ContactDetailsPanel - a phone/email/other fact an operator
  // recorded, or a visitor submitted through the widget's own control, never verified today and never
  // used for delivery. Deliberately its own heading and caption, distinct from ChannelIdentitiesPanel's
  // own strings right above - see that component's own doc comment for why.
  contactDetailsSectionTitle: string;
  contactDetailsCaption: string;
  contactDetailsLoadingLabel: string;
  contactDetailsLoadError: string;
  contactDetailsEmpty: string;
  contactDetailsKindLabel: string;
  contactDetailsValuePlaceholder: string;
  contactDetailsRecordButton: string;
  contactDetailsRecordingButton: string;
  contactDetailsRecordError: string;
  contactDetailsDeleteButton: string;
  contactDetailsDeleteError: string;
  /** `23-09`: per-row badges - see `ContactDetailsPanel`'s own doc comment for why the caption alone
   * can no longer carry this distinction. */
  contactDetailsSourceOperator: string;
  contactDetailsSourceVisitor: string;
  contactDetailsVerified: string;
  contactDetailsUnverified: string;
  contactDetailsRevealButton: string;
  contactDetailsRevealingButton: string;
  contactDetailsRevealError: string;

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
  /** A `Waiting` hit's own inline note, alongside a `ClaimConversationButton` rather than a link -
   * `23-04`: opening this row by navigation would still silently *claim* it as a side effect of a
   * click a read-only search must never do, so the deliberate act stays a distinct, explicit button
   * rather than the row itself becoming a link. */
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

  // `23-25`: ProductsPage (`/settings/products`) - every product AGO offers, and whether this
  // workspace already has it, addressed to whoever holds `site:configure` - the same permission
  // `BILLING_PERMISSION` above gates checkout/seat-change/cancel with, reused here rather than
  // invented, on the reasoning `decisions.md` §10 states directly: the buyer is the tenant's owner,
  // who already holds the permissions in question. No fetch of its own - reads `enabledModules` off
  // the same `GET /api/v1/operators/me` response `usePermissions()` already resolves (`23-21`).
  productsTitle: string;
  productsDescription: string;
  /** Mirrors `billingForbidden`'s own shape - a screen-specific sentence, plus the shared
   * `siteConfigBackToQueue` link every other permission-gated screen already reuses. */
  productsForbidden: string;

  productsTableCaption: string;
  productsColumnWhatItDoes: string;
  productsColumnStatus: string;
  productsColumnNextStep: string;

  productsStatusHeld: string;
  productsStatusNotHeld: string;
  /** The one next step offered for a product this workspace does not have - `decisions.md` §6:
   * enabling a product is not self-service, so the honest next step is a conversation, never a
   * button that appears to provision and does not. No link - the same "contact us", no address
   * given, precedent `installOriginPanelDescription` already sets. */
  productsContactNote: string;

  /** The base product - always held, since reaching this console at all means it already exists for
   * this workspace (`vision.md`: "the conversation substrate is present in every combination"). */
  productsChatDescription: string;
  productsChatActionLabel: string;

  /** `enabledModules.includes("calendar")` decides `held`; the copy never says "calendar" - the
   * outcome it sells, not the module key (this item's own backlog: "`calendar` is a word from our
   * database. *Taking bookings* is the thing being sold."). */
  productsCalendarDescription: string;
  productsCalendarActionLabel: string;

  /** `enabledModules.includes("faq")` decides `held`; same "describe the outcome" reasoning as
   * `productsCalendarDescription` above. */
  productsFaqDescription: string;
  productsFaqActionLabel: string;

  // `23-22`: OperatorsTeamPage (`/settings/operators`) - "the tenant can see and manage who works
  // here". Its own dedicated permission (`site:manage_operators`), the same
  // `SITE_ERASE_PERMISSION`/`CONVERSATION_ERASE_PERMISSION` precedent every other screen with its own
  // gate already follows - see `OperatorsTeamPage`'s own doc comment for the full reasoning, including
  // why the pre-invite seat check reads the team list's own length rather than the seat-assignment
  // summary's `heldSeats`.
  operatorsTeamTitle: string;
  operatorsTeamDescription: string;
  operatorsTeamForbidden: string;
  operatorsTeamLoadError: string;
  operatorsTeamLoadingLabel: string;

  operatorsTeamPanelTitle: string;
  operatorsTeamTableCaption: string;
  operatorsTeamNameColumn: string;
  operatorsTeamEmailColumn: string;
  operatorsTeamSeatColumn: string;
  operatorsTeamActionsColumn: string;
  operatorsTeamSeatHeld: string;
  operatorsTeamSeatNotHeld: string;
  /** Trailing interpolation - `${operatorsTeamSeatsSummaryLabel} ${heldSeats}/${seatLimit}`, the same
   * "fixed label, one value appended" shape `searchRangeLabel`'s own doc comment establishes. */
  operatorsTeamSeatsSummaryLabel: string;

  /** `13-03`'s own over-seats case: a site sitting above its seat limit after a downgrade. Trailing
   * interpolation, same shape as `operatorsTeamSeatsSummaryLabel` above - `${operatorsTeamOverSeatsBody}
   * ${heldSeats}/${seatLimit}.` */
  operatorsTeamOverSeatsTitle: string;
  operatorsTeamOverSeatsBody: string;

  operatorsTeamGrantSeatButton: string;
  operatorsTeamRevokeSeatButton: string;
  operatorsTeamSeatToggleError: string;

  operatorsTeamRemoveButton: string;
  operatorsTeamRemoveDialogTitle: string;
  /** Names the real consequence directly - `${operatorsTeamRemoveDialogBody} ${displayName}` -
   * `RemoveOperatorButton`'s own doc comment: "somebody removing a colleague mid-shift should know
   * that before clicking, not after" (this item's own Scope, verbatim). */
  operatorsTeamRemoveDialogBody: string;
  operatorsTeamRemoveConfirmButton: string;
  operatorsTeamRemoveError: string;

  operatorsTeamInviteButton: string;
  operatorsTeamInviteDialogTitle: string;
  /**
   * `25-18`: one string per role rather than one role-agnostic string, so the invite confirmation
   * names which seat it is about to spend - "This will use one more Operator seat" /
   * "...Administrator seat", never "one more of your seats" regardless of the role picked below it.
   * Trailing interpolation, same shape as the string this replaces -
   * `${operatorsTeamInviteCostBodyOperator | operatorsTeamInviteCostBodyAdmin} ${activeCount +
   * 1}/${seatLimit}.`
   *
   * The count and limit after the role-specific prefix are still the site's one combined figure -
   * `OperatorsTeamPage`'s own `activeOperatorCount`/`summary.seatLimit`, unchanged by this item -
   * not a second, per-role figure. `ago-business` decision `0011` calls for a genuinely separate
   * Administrator limit, but `ago-chat`'s `Site` aggregate carries exactly one `SeatLimit` today and
   * `GetSeatAssignmentSummaryHandler`/`ToggleOperatorSeatHandler`/`RedeemOperatorInviteHandler` all
   * gate every role against it identically (verified by reading those handlers directly, not
   * assumed) - `23-71` gave the account's administrator a seatless sign-in, but did not give
   * Administrators their own counted pool. Showing a fabricated second limit here would tell an
   * inviter a number the server does not enforce; naming the role without inventing a number it does
   * not have is the honest version of this item until that backend work lands (see this item's own
   * worker report for the specific gap named for the author to act on).
   */
  operatorsTeamInviteCostBodyOperator: string;
  operatorsTeamInviteCostBodyAdmin: string;
  operatorsTeamInviteConfirmButton: string;
  operatorsTeamInviteSendingButton: string;
  /** Shown, and the invite never created, when the site is already at its seat limit -
   * `${operatorsTeamInviteAtLimitBody} ${seatLimit}.` Done-when: "refused *before* the invite is
   * created" - no `createOperatorInvite` call happens on this branch at all. */
  operatorsTeamInviteAtLimitTitle: string;
  operatorsTeamInviteAtLimitBody: string;
  operatorsTeamInviteSubmitError: string;
  /** Shown once the invite is created - the plaintext `code` is present in the server's response
   * exactly once (`CreateOperatorInviteEndpoints`'s own remarks: "shown exactly once"), never
   * retrievable again afterward. */
  operatorsTeamInviteSuccessTitle: string;
  operatorsTeamInviteSuccessBody: string;
  /** `23-70`: the invite is a URL now (`/invite/{code}`), not a bare code - "the invitation is a URL,
   * not a token... that lands the colleague somewhere that explains itself" (this item's own backlog
   * text). Renamed from `operatorsTeamInviteCodeLabel`, the same rename the value itself already
   * needed. */
  operatorsTeamInviteLinkLabel: string;
  /** `23-70`: copying the link is one action, the same `Button`+"copied" confirmation shape
   * `InstallSnippetPage`'s own `copyKey`/`copySnippet` already establish. */
  operatorsTeamInviteCopyButton: string;
  operatorsTeamInviteCopiedLabel: string;
  /** `${operatorsTeamInviteExpiresLabel} ${date}` - the invite's own `expiresAt`. */
  operatorsTeamInviteExpiresLabel: string;
  operatorsTeamInviteCloseButton: string;

  // `23-72`: "a tenant can appoint another administrator" - the role column, the invite dialog's role
  // picker, and the per-row change-role action.
  operatorsTeamRoleColumn: string;
  /** The team-list role badges - `roleNames.includes(ROLE_ADMIN)` decides which shows, and a name that
   * holds neither (should not happen in practice) falls back to `operatorsTeamRoleOperator`. */
  operatorsTeamRoleOperator: string;
  operatorsTeamRoleAdmin: string;

  operatorsTeamInviteRoleLabel: string;
  operatorsTeamInviteRoleOperatorOption: string;
  operatorsTeamInviteRoleAdminOption: string;

  /** The row action offered to an `Operator`-only colleague - promotes them. */
  operatorsTeamChangeRoleToAdminButton: string;
  /** The row action offered to an `Admin` colleague - demotes them back to `Operator`. */
  operatorsTeamChangeRoleToOperatorButton: string;
  operatorsTeamChangeRoleDialogTitle: string;
  /** `${displayName} ${operatorsTeamChangeRoleToAdminDialogBody}` - names what the colleague gains,
   * the same "state the consequence, not just the fact" rule `operatorsTeamRemoveDialogBody` already
   * follows. */
  operatorsTeamChangeRoleToAdminDialogBody: string;
  /** `${displayName} ${operatorsTeamChangeRoleToOperatorDialogBody}` - names what the colleague loses. */
  operatorsTeamChangeRoleToOperatorDialogBody: string;
  operatorsTeamChangeRoleConfirmButton: string;
  /** Fallback only - the real refusal (the last-administrator guard) comes back as the server's own
   * `ApiProblemError` message and is shown verbatim, the same "the server's own wording, not a
   * generic re-statement" rule every other row action on this screen already follows. */
  operatorsTeamChangeRoleError: string;

  // `23-32`: TeamChatPage (`/team/chat`) - one chat per tenant, every operator in it, the owner
  // labelled. Unconditional like `navMyConversations` - see `consoleNav.ts`'s own `buildTeamItems`
  // remarks for why this entry carries no permission gate.
  teamChatTitle: string;
  teamChatDescription: string;
  teamChatLoadingLabel: string;
  teamChatLoadError: string;
  teamChatRetryButton: string;
  teamChatEmptyState: string;
  teamChatComposerPlaceholder: string;
  teamChatSendButton: string;
  teamChatSendingButton: string;
  teamChatSendError: string;
  /** The label on an admin's own messages - `site:manage_operators` at send time
    * (`SendTeamMessageHandler`'s own remarks, `ago-chat`), not the sender's role today. */
  teamChatAdminBadge: string;
  /** Falls back to this when a message's author has no display name recorded (`adr/0104`'s minted
    * demo operator). */
  teamChatUnnamedAuthor: string;
  /** `23-33`: shown in a removed message's own place - the tombstone this backlog item chose over
    * silent disappearance ("«сообщение удалено» is honest"). */
  teamChatRemovedPlaceholder: string;
  /** The row action, gated on `site:manage_operators` - `RemoveTeamMessageButton`'s own doc comment. */
  teamChatRemoveButton: string;
  teamChatRemoveDialogTitle: string;
  /** States the consequence directly - what every other operator in the room will see in this
    * message's place - the same `operatorsTeamRemoveDialogBody` precedent. */
  teamChatRemoveDialogBody: string;
  teamChatRemoveConfirmButton: string;
  teamChatRemoveError: string;

  // `23-36`: TelegramChannelPage (`/channels/telegram`) - the first of `23-31`'s three reserved
  // channel places to become a real screen. Gated on `channel:manage`
  // (`TELEGRAM_CHANNEL_PERMISSION`), the same dedicated-permission-screen shape
  // `operatorsTeam*`/`OPERATORS_TEAM_PERMISSION` above already established, reusing
  // `siteConfigCheckingPermissions`/`accessRefusalGrantHint` from the shared block the way every
  // other `AccessRefusal` caller does.
  telegramChannelTitle: string;
  telegramChannelDescription: string;
  telegramChannelForbidden: string;
  telegramChannelLoadError: string;
  telegramChannelLoadingLabel: string;
  telegramChannelPanelTitle: string;
  /** Shown only while `connected` is `false` - explains what to paste and where it comes from. */
  telegramChannelNotConnectedBody: string;
  telegramChannelTokenFieldLabel: string;
  telegramChannelTokenFieldDescription: string;
  telegramChannelConnectButton: string;
  telegramChannelConnectingButton: string;
  /** Fallback only - a real refusal (a bad token, Telegram unreachable) arrives as
   * `ApiProblemError.message` from `ConversationErrors.ChannelInvalidToken`'s own `detail`, per
   * `TelegramChannelEndpoints.HandleConnectAsync`'s own remarks on why the `getMe` round trip exists
   * at all. */
  telegramChannelConnectError: string;
  /** `${telegramChannelConnectedSinceLabel} ${date}` - `status.createdAt`, when the credential was
   * first registered (not when it was last verified - see `telegramChannelCheckedAtLabel` for that). */
  telegramChannelConnectedSinceLabel: string;
  /** `adr/0143`: this status is asked of Telegram live, on every load - `verified: true` is what
   * this badge actually reflects, never `connected` alone. */
  telegramChannelVerifiedBadge: string;
  /** Shown when the live check just failed - `status.verified === false` while `status.connected`
   * is still `true` (the credential row exists; Telegram just refused it). */
  telegramChannelUnverifiedBadge: string;
  /** `${telegramChannelUnverifiedBody} ${status.refusalReason}` - Telegram's own refusal text,
   * appended verbatim, never paraphrased (`23-36`'s own brief: "show what the provider said"). */
  telegramChannelUnverifiedBody: string;
  /** `adr/0143`: shown instead of `telegramChannelVerifiedBadge`/`telegramChannelUnverifiedBadge` when
   * `status.unreachable` - the live check itself could not complete (a 5-second server-side bound, or
   * a transient failure reaching Telegram), never confused with a refusal. */
  telegramChannelUnreachableBadge: string;
  /** The body text under `telegramChannelUnreachableBadge` - explicitly "try again", never "get a new
   * token", because nothing about the token itself is known in this state. */
  telegramChannelUnreachableBody: string;
  /** `${telegramChannelCheckedAtLabel} ${time}` - `status.checkedAt`, this load's own live check,
   * distinct from `telegramChannelConnectedSinceLabel` above. */
  telegramChannelCheckedAtLabel: string;
  telegramChannelDisconnectButton: string;
  telegramChannelDisconnectDialogTitle: string;
  /** States the consequence directly, the same `operatorsTeamRemoveDialogBody`/`teamChatRemoveDialogBody`
   * precedent - disconnecting stops delivery immediately, it does not just hide the row. */
  telegramChannelDisconnectDialogBody: string;
  telegramChannelDisconnectConfirmButton: string;
  telegramChannelDisconnectError: string;

  // `25-09`: MaxChannelPage (`/channels/max`) - the second of `23-31`'s three reserved channel places
  // to become a real screen, built on `TelegramChannelPage`'s own shape above but deliberately narrower
  // where MAX's backend is narrower (`MaxChannelPage`'s own doc comment has the full reasoning). Gated
  // on `channel:manage` (`MAX_CHANNEL_PERMISSION`), the identical dedicated-permission-screen shape.
  maxChannelTitle: string;
  maxChannelDescription: string;
  maxChannelForbidden: string;
  maxChannelLoadError: string;
  maxChannelLoadingLabel: string;
  maxChannelPanelTitle: string;
  /** Shown only while `connected` is `false` - explains what to paste and where it comes from. */
  maxChannelNotConnectedBody: string;
  maxChannelTokenFieldLabel: string;
  maxChannelTokenFieldDescription: string;
  maxChannelConnectButton: string;
  maxChannelConnectingButton: string;
  /** Fallback only - a real refusal (a bad or already-revoked token) arrives as `ApiProblemError.message`
   * from `ConversationErrors.ChannelInvalidToken`'s own `detail`, surfaced via `MaxChannelEndpoints.
   * HandleConnectAsync`'s `POST /subscriptions` rollback - the same "show what the provider said"
   * discipline `telegramChannelConnectError` already follows, against a different provider call. */
  maxChannelConnectError: string;
  /** `${maxChannelConnectedSinceLabel} ${date}` - `status.createdAt`, when the credential was first
   * registered. Unlike `telegramChannelConnectedSinceLabel`, there is no sibling "checked at" label:
   * `MaxChannelEndpoints.HandleStatusAsync` never re-checks anything after registration
   * (`MaxChannelPage`'s own doc comment: MAX's API has no cheap live-check call to make on every read). */
  maxChannelConnectedSinceLabel: string;
  /** The one badge this screen ever shows for a connected credential - never `telegramChannelVerifiedBadge`'s
   * three-state sibling set (`Verified`/`Not responding`/`Could not check just now`), because none of
   * those three facts is something `MaxChannelEndpoints.HandleStatusAsync` can actually tell this
   * screen (`MaxChannelPage`'s own doc comment). "Connected" here means only "an active credential row
   * exists", not "MAX was just asked and agreed". */
  maxChannelConnectedBadge: string;
  maxChannelDisconnectButton: string;
  maxChannelDisconnectDialogTitle: string;
  /** States the consequence directly, the same `telegramChannelDisconnectDialogBody` precedent -
   * disconnecting stops delivery immediately, it does not just hide the row. */
  maxChannelDisconnectDialogBody: string;
  maxChannelDisconnectConfirmButton: string;
  maxChannelDisconnectError: string;

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

  // `23-17`: the console half of "an operator's work is reported with the load it was carried under" -
  // extends the per-operator table above with `docs/design/decisions.md` §2's standard/additional
  // split, reusing `MyNumbersPage`'s own column labels (`myNumbersHeldColumn` etc., `23-18`) rather than
  // inventing a second presentation for the identical `OperatorLoadSummaryDto` shape. Never combined
  // into one score, and "forced" appears in none of these strings, on either report.
  /** Shown in the Held/Standard/Additional cells for an operator row whose `load` is `null` - a real
   * "no assignment interval started in the window at all" (`OperatorAnalyticsOperatorBucketDto.Load`'s
   * own remarks, `ago-chat`), never rendered as `analyticsNoResponsesValue`'s "—" - that em dash already
   * means something different ("nothing to average, because zero") and reusing it here would blur a
   * distinction the backend deliberately keeps: absent load data is not a zero count. */
  analyticsLoadNoDataValue: string;
  /** The explicit statement `docs/backlog/23-17-*.md`'s own Done-when requires: `myNumbersHeldColumn`
   * ("Held") counts a conversation once even when transferred away and back to the same operator, while
   * `myNumbersStandardColumn`/`myNumbersAdditionalColumn` count assignment intervals, where that same
   * conversation counts twice. Shown once, directly under the per-operator table, whenever it has at
   * least one row - a reader must not be left to infer the unit difference from two column headers that
   * happen to sit side by side. */
  analyticsLoadIntervalNote: string;
  /** `23-17`: a second table below the per-operator one - operator × load-bucket is a different,
   * unbounded-in-principle dimension pair than the operator table's own fixed columns, the same
   * "a second table, not more columns" call `18-12`'s own `analyticsByReferrerHeading`/
   * `analyticsByCampaignHeading` already made for referrer/campaign. Reuses `myNumbersLoadBucketColumn`/
   * `myNumbersIntervalsColumn`/`myNumbersRepliesColumn`/`myNumbersAverageFirstReplyColumn` verbatim, with
   * `analyticsOperatorColumn` as the one column this table adds that `MyNumbersPage`'s own single-row
   * version does not need. */
  analyticsByOperatorLoadHeading: string;
  /** Shown when the per-operator table has rows but none of them carry any `byLoad` entries - every
   * operator's own `load` is `null`, or every present `load.byLoad` is empty. Distinct from
   * `analyticsByOperatorEmpty`, which means no operator row exists at all. */
  analyticsByOperatorLoadEmpty: string;

  // `18-12`: the referrer-host and UTM-campaign breakdowns, two more tables on the same page - the
  // identical "a second, separately-captioned table for a genuinely different dimension" shape `18-09`
  // already established for the per-operator one (`OperatorAnalyticsPage`'s own doc comment).
  analyticsByReferrerHeading: string;
  analyticsReferrerColumn: string;
  /** Never shown for "no referrer at all" - that case renders as `analyticsDirectReferrerLabel`, a
   * real row, not an empty state. Shown only when the report has conversations but the referrer
   * breakdown itself came back empty, which in practice cannot happen (every conversation's referrer
   * is either a real host or `"Direct"`) - kept for the same defensive-symmetry reason
   * `analyticsByOperatorEmpty`/`analyticsByCampaignEmpty` exist for their own dimensions. */
  analyticsByReferrerEmpty: string;
  /** The read-time fallback label for a conversation whose visitor carried no `document.referrer` at
   * all (`IOperatorAnalyticsReadStore`'s own remarks, `ago-chat`) - a real, common case, not an error,
   * rendered as its own row rather than omitted. */
  analyticsDirectReferrerLabel: string;
  analyticsByCampaignHeading: string;
  analyticsCampaignColumn: string;
  /** Shown instead of the per-campaign table when the report has conversations but none of them carry
   * a `utm_campaign` tag - the common case for a shop running no paid campaigns, distinct from
   * `analyticsEmpty`. */
  analyticsByCampaignEmpty: string;
  /** `18-12`'s own honesty note, the same discipline `outcomeNotAVerifiedSaleNote` already holds itself
   * to for a different reason: a referrer/UTM value is what the visitor's browser reported, not a fact
   * AGO Chat has independently verified - shown once, above both new tables. */
  analyticsTrafficSourceNote: string;

  // `23-16`: shared across all four report pages (`src/analytics/comparison.ts`'s own doc comment on
  // why these are shared rather than restated) - the preceding-period comparison line's own words, and
  // the fraction connective a rate's own numerator/denominator pairing uses inline
  // (`conversionReportRateColumn`/`tagBreakdownRateColumn`'s own cells, `50.0% (1 of 2)`).
  /** "Previous period" - the label this comparison line always leads with, before the previous
   * figure/rate and its own delta. */
  analyticsPreviousPeriodLabel: string;
  /** Shown instead of a delta when the previous period's own absolute figure was genuinely zero and
   * the current one is too - "0 -> 0, +0%" reads as a real change; this does not. */
  analyticsComparisonNoChange: string;
  /** The unit word after a rate-to-rate delta expressed in percentage points, e.g. "+5.0 pp" -
   * deliberately not itself a "%" sign, since the delta is not a percentage of the previous rate (that
   * would be a much larger, misleading number for a small base rate). */
  analyticsComparisonPointsSuffix: string;
  /** The connective inside an inline fraction - "50.0% (1 of 2)" - the pairing this item's own Done-when
   * requires on `/analytics/conversion`'s both tables and `/analytics/tags`. */
  analyticsFractionOfLabel: string;

  // `23-18`: MyNumbersPage (`/analytics/me`) - an operator's own row of `/analytics`/
  // `/conversion-report`, reachable with no `site:configure` grant at all (`flows.md` 2.4: "a metric
  // an operator first learns about from their manager ... is a metric they will manage rather than
  // work to"). `navMyNumbers` sits unconditionally in `consoleNav.ts`, the same way `navConversations`
  // does - every operator reaches this, not only an admin. Reuses `analyticsInvalidRangeError`/
  // `analyticsLoadError` for its own error states (the same reuse `TagBreakdownReportPage`'s own
  // comment already establishes a precedent for) and every column header the tenant-wide reports
  // already declare (`analyticsConversationCountColumn` etc., `conversionReportConvertedColumn` etc.)
  // - the same metric, the same label, on a screen with one row instead of many.
  navMyNumbers: string;
  myNumbersPageDescription: string;
  myNumbersFromFieldLabel: string;
  myNumbersToFieldLabel: string;
  myNumbersApplyButton: string;
  myNumbersRangeLabel: string;
  myNumbersLoadingLabel: string;
  /** Shown only when this operator held nothing, converted nothing, and started no assignment
   * interval anywhere in the range - a real, boring fact, not an error (`GetOwnAnalyticsForOperatorHandler`'s
   * own remarks: "own page, never a 404"). */
  myNumbersEmpty: string;

  myNumbersConversationsHeading: string;

  // `23-17`'s own standard/additional split and load buckets, rendered here for the first time
  // anywhere in the console - `docs/design/decisions.md` §2's naming amendment: the two counts stay
  // two counts, never combined into one score, and the word this codebase never shows a person is
  // "forced".
  myNumbersLoadHeading: string;
  /** Shown when `load` is `null` - this operator started no assignment interval in the range, a real
   * "no data" distinct from a row full of zeros. */
  myNumbersLoadEmpty: string;
  myNumbersHeldColumn: string;
  myNumbersStandardColumn: string;
  myNumbersAdditionalColumn: string;

  myNumbersByLoadHeading: string;
  myNumbersLoadBucketColumn: string;
  myNumbersIntervalsColumn: string;
  myNumbersRepliesColumn: string;
  myNumbersAverageFirstReplyColumn: string;

  myNumbersConversionHeading: string;
  /** Shown when `conversion` is `null` - nothing this operator handled has a recorded outcome yet in
   * the range. */
  myNumbersConversionEmpty: string;

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

  // `18-11`: TagBreakdownReportPage (`/analytics/tags`) - what these conversations are actually about,
  // a second, separate report from `/analytics` and `/analytics/conversion` rather than a fourth table
  // bolted onto either (`OperatorAnalyticsPage`'s own doc comment on why a genuinely different concept
  // earns its own page). Gated on `site:configure`, the same shape `analyticsForbiddenError`/
  // `analyticsInvalidRangeError` already establish - this reuses those two rather than declaring a
  // near-duplicate pair.
  navTagBreakdown: string;
  tagBreakdownPageDescription: string;
  tagBreakdownFromFieldLabel: string;
  tagBreakdownToFieldLabel: string;
  tagBreakdownApplyButton: string;
  tagBreakdownRangeLabel: string;
  tagBreakdownLoadingLabel: string;
  tagBreakdownEmpty: string;
  tagBreakdownPresetThisMonth: string;
  tagBreakdownPresetLastMonth: string;
  tagBreakdownPresetLast30Days: string;
  /** The report's own headline honesty statement's lead-in - the page composes the actual figures
   * (tagged / total conversations, and the percentage) directly after this label, the same
   * "compose the dynamic values in JSX, not inside the translated string" shape
   * `conversionReportRangeLabel` already establishes for its own date range. Rendered prominently, next
   * to the breakdown, not only in a footnote a reader could miss - shown even when the percentage is
   * low; especially then, since a low number is the whole point of this figure existing
   * (`ITagBreakdownReadStore`'s own remarks, `ago-chat`). */
  tagBreakdownCoverageBanner: string;
  /** Shown in place of the banner above when `percentageTagged` is `null` (no conversations in the
   * window at all) - never a misleading "0% tagged". */
  tagBreakdownCoverageUnknown: string;
  tagBreakdownTagColumn: string;
  tagBreakdownConversationCountColumn: string;
  /** The other load-bearing sentence this item exists to ship, next to the breakdown table itself: a
   * conversation with more than one tag counts once per tag it holds, so this column's own values do not
   * sum to the total conversation count above - real evidence for every tag it names, not a bug.
   * (`ITagBreakdownReadStore`'s own remarks, `ago-chat`, state the identical rule.) */
  tagBreakdownMultiTagNote: string;
  tagBreakdownConvertedColumn: string;
  tagBreakdownNotConvertedColumn: string;
  tagBreakdownRateColumn: string;
  /** Shown in the rate column when a tag's own `conversionRate` is `null` - the same "never a
   * misleading zero" convention `conversionReportNoDataValue` already establishes. */
  tagBreakdownNoDataValue: string;
  tagBreakdownByTagEmpty: string;

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

  // `19-03`: FaqModulePage (`/settings/faq`) - two independent forms on one screen, calling two
  // different backends (`FaqModulePage.tsx`'s own doc comment has the full reasoning). Gated on
  // `site:configure`, the same shape every other tenant self-service screen already establishes, so
  // this reuses `siteConfigCheckingPermissions`/`siteConfigBackToQueue`/`siteConfigSaveButton`/
  // `siteConfigSavingButton`/`siteConfigSavedAlert` rather than duplicating them a fifth time.
  navFaqAssistant: string;
  faqPageDescription: string;
  faqForbidden: string;

  // The module-registration panel - calls `Ago.Chat.Api`'s own generic `/modules` endpoint
  // (`modulesApi.ts`).
  faqModuleLoadingLabel: string;
  faqModuleLoadError: string;
  faqModuleSubmitError: string;
  faqModulePanelTitle: string;
  faqModuleEnabledLabel: string;
  faqModuleNotEnabled: string;
  faqModuleTriggerWordsLabel: string;
  faqModuleDescription: string;
  faqModuleKeyFieldLabel: string;
  faqModuleKeyFieldDescription: string;
  faqModuleKeyPlaceholder: string;
  faqTriggerWordsFieldLabel: string;
  faqTriggerWordsFieldDescription: string;
  faqTriggerWordsPlaceholder: string;
  faqEntryPointFieldLabel: string;
  faqEntryPointFieldDescription: string;
  faqEntryPointPlaceholder: string;

  // moduleConfigValidation.ts - the same "pure function, `strings: ConsoleStrings = en` parameter"
  // shape `offlineAutoReplyValidation.ts`/`cannedResponsesValidation.ts` already use.
  faqModuleKeyValidationRequired: string;
  faqTriggerWordsValidationRequired: string;
  faqEntryPointValidationRequired: string;
  faqEntryPointValidationInvalid: string;

  // The knowledge-base panel - calls `Ago.Faq.Api`'s own `/knowledge-base` endpoint
  // (`faqKnowledgeBaseApi.ts`), a different backend than every field above.
  faqKnowledgeBasePanelTitle: string;
  faqKnowledgeBaseDescription: string;
  faqKnowledgeBaseLoadingLabel: string;
  faqKnowledgeBaseLoadError: string;
  faqKnowledgeBaseSubmitError: string;
  faqKnowledgeBaseTextFieldLabel: string;
  faqKnowledgeBaseTextPlaceholder: string;
  /** `${faqKnowledgeBaseUpdatedAtPrefix} ${formatAbsolute(...)}` - the same fixed-fragment
   * composition `searchRangeLabel`'s own doc comment already establishes for this codebase's other
   * date-carrying strings. */
  faqKnowledgeBaseUpdatedAtPrefix: string;
  faqKnowledgeBaseNeverSaved: string;
  /** Shown instead of the whole knowledge-base form when `config.faqApiBaseUrl` is `null` - a real,
   * honest deployment state (`ago-faq` has no production deployment yet), not a loading or error
   * state. */
  faqKnowledgeBaseNotConfigured: string;

  // --- `22-06`: AGO Calendar’s console screens (Queue, Setup, Workers, Availability, Contacts),
  // moved from ago-calendar-console and gated on `calendar:configure` (`docs/adr/0093-*`,
  // `docs/backlog/22-06-one-console.md`). No Access screen - `22-05` (`adr/0093`, merged mid-move)
  // deleted AGO Calendar’s own `operators`/`roles` tables and console endpoints, so there is nothing
  // left for one to manage; it was never wired here. Key names are this table’s own, mechanically
  // prefixed `calendar` from the source console’s `strings.ts` - `cancelButton`/`signOut` above are
  // reused verbatim (identical wording already existed here) rather than duplicated.
  //
  // `23-31`: three of these five keep their key but change their *value*, matching the item's own
  // nav table - the key names the route/screen (unchanged, so no call site churn), the value is what
  // a reader sees, and that is what moved: `navCalendarQueue` ("Queue"/"Очередь" -> "Waiting"/
  // "В ожидании" - it lists what nobody has confirmed *yet*, and "queue" read as the chat queue
  // ambiguity `docs/backlog/23-31-*.md` names first), `navCalendarWorkers` ("Workers"/"Сотрудники"
  // -> "Masters"/"Мастера" - the item's own decided naming rule: "Сотрудники" names who uses the
  // *console*, and a person providing a service is a different person), `navCalendarAvailability`
  // ("Availability"/"Доступность" -> "Schedule"/"Расписание", the item's own table wording). ---
  navCalendarQueue: string;
  navCalendarSetup: string;
  navCalendarWorkers: string;
  navCalendarAvailability: string;
  navCalendarContacts: string;
  /** `23-30`/`23-12`: the reveal audit trail - drawn only in `buildCalendarItems`' full
   * `calendar:configure` branch, since the read itself is gated on that wider permission
   * server-side (`CalendarPhoneRevealsPage`'s own doc comment). */
  navCalendarPhoneReveals: string;
  navCalendarCustomerMerges: string;
  calendarLoading: string;
  calendarDeleteButton: string;
  calendarBackButton: string;
  calendarRefreshButton: string;
  calendarActiveLabel: string;
  calendarInactiveLabel: string;
  calendarWorkerFieldLabel: string;
  calendarDayFieldLabel: string;
  calendarOpensFieldLabel: string;
  calendarClosesFieldLabel: string;
  calendarFromFieldLabel: string;
  calendarToFieldLabel: string;
  calendarHiddenContactLabel: string;
  calendarHiddenContactTooltip: string;
  /** `23-30`/`23-12`: `renderPhone`'s own Reveal control - shown beside a masked, non-null phone on
   * every calendar screen that can carry one. Never rendered for a `null` phone (`calendarHiddenContact*`
   * above covers that state) or an unmasked one. */
  calendarRevealPhoneButton: string;
  calendarRevealingPhoneButton: string;
  calendarWeekdaySunday: string;
  calendarWeekdayMonday: string;
  calendarWeekdayTuesday: string;
  calendarWeekdayWednesday: string;
  calendarWeekdayThursday: string;
  calendarWeekdayFriday: string;
  calendarWeekdaySaturday: string;
  calendarPermissionDeniedError: string;
  calendarNetworkError: string;
  calendarQueueTitle: string;
  calendarQueueDescription: string;
  calendarQueueEmpty: string;
  calendarQueueColumnWhen: string;
  calendarQueueColumnCalendar: string;
  calendarQueueColumnPhone: string;
  calendarQueueColumnDeadline: string;
  calendarQueueColumnActions: string;
  calendarQueueOverdueNote: string;
  calendarRejectButton: string;
  calendarNoShowButton: string;
  /** `23-105`: replaces the pasted embed snippet this screen used to show - booking now arrives on
   * the widget's own handshake response (`ago-widget`'s `VisitorSessionResponse.enabledModules`)
   * once the platform grants this site the calendar module, so there is nothing left for a tenant to
   * paste. See `CalendarSetupPage.tsx`'s own doc comment for the item this replaced. */
  calendarSetupBookingAutomaticNote: string;
  calendarSetupOriginsTitle: string;
  calendarSetupOriginsDescription: string;
  calendarSetupOriginsFieldLabel: string;
  /** `23-46`: the example address every field that asks for one shows. Localized rather than a
   * literal, because the example's own top-level domain is the part that tells a reader which
   * kind of address is wanted, and `.com` reads as foreign in a Russian form. */
  siteAddressPlaceholder: string;
  /** `23-46`: sits directly under the address the install screen shows, because that address is
   * read-only and nothing said so. There is no editor for it anywhere in this console - `5-01`
   * deferred one and nothing has built it since - so a tenant who reads the wrong address here has
   * no next step unless one is written down. */
  installOriginChangeHint: string;
  /** `23-51`: the two directions the auth guard's spinner can be travelling in. It said
   * `Signing in…` for both, as an English literal, which was wrong about the language on every
   * Russian screen and wrong about the fact itself while somebody was leaving. */
  authSigningIn: string;
  authSigningOut: string;
  calendarSetupSaveOriginsButton: string;
  calendarSetupCalendarsTitle: string;
  calendarPublishedLabel: string;
  calendarNotPublishedLabel: string;
  calendarSetupCalendarNameLabel: string;
  calendarSetupCalendarZoneLabel: string;
  calendarSetupCalendarPublishedLabel: string;
  calendarSetupAddCalendarButton: string;
  calendarSetupServicesTitle: string;
  calendarSetupServiceMinutesSuffix: string;
  calendarSetupServiceNameLabel: string;
  calendarSetupServiceDurationLabel: string;
  calendarSetupAddServiceButton: string;
  /** `23-35`. */
  calendarSetupServicePriceLabel: string;
  calendarSetupServicePricePlaceholder: string;
  calendarSetupServicePriceFromLabel: string;
  calendarSetupServiceDescriptionLabel: string;
  calendarSetupWorkingHoursTitle: string;
  calendarSetupWorkingHoursDescription: string;
  calendarSetupNoWorkersNote: string;
  calendarSetupAddWorkingHoursButton: string;
  calendarSetupWorkerNotOnCalendarNote: string;

  // --- BookingReadiness (`23-23`, rendered on both /calendar/setup and /calendar/workers) ---
  calendarReadinessTitle: string;
  calendarReadinessNoCalendarLabel: string;
  calendarReadinessBookableLabel: string;
  calendarReadinessNotBookableLabel: string;
  calendarReadinessMetLabel: string;
  calendarReadinessUnmetLabel: string;
  calendarReadinessFixItLink: string;
  calendarReadinessViewSlotsLink: string;
  calendarReadinessCalendarPublishedLabel: string;
  calendarReadinessWorkerOnCalendarLabel: string;
  calendarReadinessServiceOfferedLabel: string;
  calendarReadinessWorkingHoursConfiguredLabel: string;
  calendarReadinessScheduleSavedLabel: string;
  calendarReadinessSlotsMaterializedLabel: string;

  calendarWorkersTitle: string;
  calendarEditButton: string;
  calendarScheduleButton: string;
  calendarSlotsLinkLabel: string;
  calendarRecutLinkLabel: string;
  calendarAddWorkerButton: string;
  /** `23-107`: replaces `calendarWorkersNoCalendarNote` - that string named the destination
   * («Настройка») without saying how to reach it, and rendered as a footnote under the disabled
   * control it explained. Split around a real `<Link to="/calendar/setup">` in
   * `CalendarWorkersPage.tsx`, whose own label is `navCalendarSetup` (the same string the nav item
   * uses), so the two cannot say two different things for the same destination. `Intro` carries no
   * trailing space and `Reason` no leading one on the Russian side - see that file's own remarks on
   * why the three pieces are written adjacent, with no JSX whitespace between them. */
  calendarWorkersNoCalendarIntro: string;
  calendarWorkersNoCalendarReason: string;
  calendarNewWorkerTitle: string;
  calendarEditWorkerTitle: string;
  calendarViewSlotsLinkLabel: string;
  calendarWorkersDeleteConfirmPrefix: string;
  calendarWorkersDeleteConfirmSuffix: string;
  calendarLastNameFieldLabel: string;
  calendarFirstNameFieldLabel: string;
  calendarMiddleNameFieldLabel: string;
  calendarDisplayNameFieldLabel: string;
  calendarDisplayNameCustomNote: string;
  calendarDisplayNameDerivedNote: string;
  calendarCalendarFieldLabel: string;
  calendarServicesPerformedLegend: string;
  calendarWorkerCardNoCalendarNote: string;
  calendarWorkersEmpty: string;
  calendarWorkersColumnName: string;
  calendarWorkersColumnActive: string;
  calendarWorkersColumnCreated: string;
  calendarWorkersColumnUpdated: string;
  calendarWorkersColumnActions: string;
  calendarBackfilledNameTooltip: string;
  calendarNeedsCorrectionLabel: string;
  calendarScheduleSectionTitle: string;
  calendarScheduleEmptyNote: string;
  calendarTemplateFieldLabel: string;
  calendarWeeklyTemplateOption: string;
  calendarCycleTemplateOption: string;
  calendarSwitchingToWeeklyNote: string;
  calendarCycleAnchorFieldLabel: string;
  calendarCycleWorkingDaysFieldLabel: string;
  calendarCycleRestDaysFieldLabel: string;
  calendarCycleShiftPatternNote: string;
  /** `23-107`: split around a real `<Link to="/calendar/setup">` in `WorkerScheduleSection.tsx`, the
   * same pattern `calendarWorkersNoCalendarIntro`/`Reason` established - see that pair's own doc
   * comment for why the three pieces sit adjacent with no JSX whitespace between them. */
  calendarWeeklyHoursIntro: string;
  calendarWeeklyHoursReason: string;
  calendarSlotLengthFieldLabel: string;
  calendarSlotLengthNote: string;
  calendarBufferFieldLabel: string;
  calendarBufferCountsTowardDurationLabel: string;
  calendarArithmeticExamplePrefix: string;
  calendarArithmeticExampleUnitSuffix: string;
  calendarSlotWordOne: string;
  calendarSlotWordFew: string;
  calendarSlotWordMany: string;
  calendarHorizonFieldLabel: string;
  calendarHorizonCapPrefix: string;
  calendarHorizonCapSuffix: string;
  calendarMaterializeFromFieldLabel: string;
  calendarMaterializeFromCannotMoveEarlierPrefix: string;
  calendarMaterializeFromCannotMoveEarlierSuffix: string;
  calendarScheduleRecutNotePrefix: string;
  calendarScheduleRecutLinkLabel: string;
  calendarScheduleRecutNoteSuffix: string;
  calendarCreateScheduleButton: string;
  calendarSaveScheduleButton: string;
  calendarSlotsHeadingPrefix: string;
  calendarSlotsHeadingSuffix: string;
  calendarSlotsHeadingFallback: string;
  calendarSlotsDescription: string;
  calendarSlotsTimezoneNotePrefix: string;
  calendarSlotsTimezoneNoteSuffix: string;
  calendarSlotsEmpty: string;
  calendarSlotsColumnDate: string;
  calendarSlotsColumnWeekday: string;
  calendarSlotsColumnTime: string;
  calendarSlotsColumnStatus: string;
  calendarSlotsColumnService: string;
  calendarSlotsColumnCustomer: string;
  calendarSlotsColumnPhone: string;
  calendarSlotStatusAvailable: string;
  calendarSlotStatusPendingConfirmation: string;
  calendarSlotStatusBooked: string;
  calendarSlotStatusCancelled: string;
  calendarSlotStatusNoShow: string;
  calendarSlotStatusBlocked: string;
  calendarRecutTitle: string;
  calendarRecutDescription: string;
  calendarRecutFromFieldLabel: string;
  calendarPreviewButton: string;
  calendarRecutDoneTitle: string;
  calendarRecutSummaryDaysRecutSuffix: string;
  calendarRecutSummaryDaysLeftSuffix: string;
  calendarRecutSummarySlotsDeletedSuffix: string;
  calendarRecutSummarySlotsInsertedSuffix: string;
  calendarRecutSummaryBookingsCancelledSuffix: string;
  calendarRecutLeftInOldGridPrefix: string;
  calendarRecutLeftInOldGridSuffix: string;
  calendarRecutNothingGeneratedNote: string;
  calendarRecutDayKeptNote: string;
  calendarRecutDaySlotsToDeleteSuffix: string;
  calendarRecutNoBookingsNote: string;
  calendarReviewAndConfirmButton: string;
  calendarRecutChooseDecisionNote: string;
  calendarRecutConfirmTitle: string;
  calendarRecutConfirmPrefix: string;
  calendarRecutConfirmDaysSuffix: string;
  calendarRecutConfirmSlotsSuffix: string;
  calendarRecutConfirmBookingsSuffix: string;
  calendarRecutConfirmSkippedSuffix: string;
  calendarRecutCannotBeUndoneNote: string;
  calendarConfirmRecutButton: string;
  calendarCancelDecisionLabel: string;
  calendarKeepDecisionLabel: string;
  calendarAlreadyNoShowNote: string;
  calendarAvailabilityNoWorkersNote: string;
  calendarCloseDayTitle: string;
  calendarCloseDayDescription: string;
  calendarCloseDayButton: string;
  calendarCloseDayDoneMessage: string;
  calendarChangeDayHoursTitle: string;
  calendarChangeDayHoursDescription: string;
  calendarApplyNewHoursButton: string;
  calendarChangeDayHoursDoneMessage: string;
  calendarContactsTitle: string;
  calendarContactsDescription: string;
  calendarContactsEmpty: string;
  calendarContactsColumnPhone: string;
  calendarContactsColumnName: string;
  calendarContactsColumnNotes: string;
  calendarContactsColumnNoShows: string;
  calendarContactsColumnFirstSeen: string;
  calendarContactsColumnLastSeen: string;
  calendarNotRecordedLabel: string;
  /** `23-30`/`23-12`/`decisions.md` §5: the two verification facts, rendered as separate columns
   * with separate badge tones - never merged into one "verified" state. `PhoneVerified` is the SMS
   * code's own answer (`20-09`); `PhoneConfirmed` is an operator's "I called and it is them", a
   * weaker, human-asserted fact. */
  calendarContactsColumnPhoneVerified: string;
  calendarContactsColumnPhoneConfirmed: string;
  calendarContactsVerifiedLabel: string;
  calendarContactsNotVerifiedLabel: string;
  calendarContactsConfirmedLabel: string;
  calendarContactsNotConfirmedLabel: string;

  // --- `23-60`/`adr/0161`: the "shares a phone" hint and the Merge action it opens - `ContactRow`'s
  // own `duplicatePhoneCustomerIds`, surfaced on the contacts screen where an operator already sees
  // both cards. ---
  calendarContactsColumnDuplicate: string;
  /** Shown on a row that shares a phone with at least one other live customer - a short label, not
   * a sentence, since the Merge button beside it is what actually explains the situation. */
  calendarContactsDuplicateHint: string;
  calendarContactsMergeButton: string;

  /** `23-60`/`adr/0161`: the confirmation dialog - `MergeCustomersDialog`'s own doc comment on why
   * this is where the irreversibility of a merge has to be felt, not a footnote. */
  calendarMergeDialogTitle: string;
  calendarMergeDialogLoading: string;
  /** Appears once the preview has loaded, above the Confirm button - the sentence that carries
   * `adr/0161`'s own "no undo, ever" decision to the one moment it can still change an operator's
   * mind. */
  calendarMergeDialogIrreversibleWarning: string;
  /** Marks whichever candidate `MergeCustomersHandler` decided will survive - never a choice the
   * dialog offers the operator, see that handler's own doc comment for why. */
  calendarMergeDialogSurvivorBadge: string;
  calendarMergeDialogAbsorbedBadge: string;
  calendarMergeDialogBookingsHeading: string;
  calendarMergeDialogNoBookings: string;
  calendarMergeDialogNoShowCountLabel: string;
  calendarMergeDialogConfirmButton: string;
  calendarMergeDialogConfirmingLabel: string;
  calendarMergeDialogCancelButton: string;
  /** Paired with a raw count in code (`calendarBookingsCountLabel`'s own "label: N" shape, never a
   * pluralised sentence) - how many bookings the merge actually reassigned, shown after a successful
   * merge so "0 bookings moved" (two contacts that happened to share a phone but neither ever
   * booked) reads differently from a merge that reattributed a real history. */
  calendarMergeDoneBookingsMovedLabel: string;
  /** `23-60`: the server's own `EventStatus` member names
   * (`PendingConfirmation`/`Booked`/`Cancelled`/`NoShow`), translated for
   * `CustomerMergeDialog`'s own booking-history list - the first screen in this console to render a
   * raw booking status rather than a screen already scoped to one status by its own query. */
  calendarStatusPendingConfirmation: string;
  calendarStatusBooked: string;
  calendarStatusCancelled: string;
  calendarStatusNoShow: string;

  // --- `23-34`: `/calendar/bookings` - what is actually booked, by day and by master. Grouped, not a
  // flat table (`CalendarBookingsPage`'s own doc comment on why): one `Panel` per business-local day,
  // one nested `Panel` per master inside it, each carrying a `Badge` with its own row count so an
  // operator sees how full a given day and a given master are without reading every row. ---
  calendarBookingsDescription: string;
  calendarBookingsEmpty: string;
  calendarBookingsColumnWhen: string;
  calendarBookingsColumnService: string;
  calendarBookingsColumnCustomer: string;
  calendarBookingsColumnPhone: string;
  /** Prefixes the raw count on both the day-level and the master-level `Badge` - one shared word
   * rather than a pluralised sentence, deliberately: `calendarSlotWordOne`/`Few`/`Many` three doors up
   * this file already carry the Russian noun-declension cost for the one screen that actually needs a
   * counted noun in a sentence, and this screen does not - "Записей: 5" needs no agreement with the
   * number the way "5 записей" would. */
  calendarBookingsCountLabel: string;
  calendarBookingsForbidden: string;

  // --- `22-06`: permission-gate messages, one per moved screen (`ago-console`'s own established
  // per-screen-forbidden-sentence convention - `faqForbidden`/`autoReplyForbidden` - rather than one
  // shared sentence, since each names the resource it refused). ---
  calendarQueueForbidden: string;
  /** `22-14`: shown under `calendarQueueForbidden`, immediately above a list of the shops that do
   * have a calendar for this person. Never shown alone - it is a lead-in to that list, which is why
   * it ends in a colon. */
  calendarElsewhereNotice: string;
  calendarSetupForbidden: string;
  calendarWorkersForbidden: string;
  calendarWorkerSlotsForbidden: string;
  calendarWorkerRecutForbidden: string;
  calendarAvailabilityForbidden: string;
  calendarContactsForbidden: string;
  calendarPhoneRevealsForbidden: string;
  calendarCustomerMergesForbidden: string;

  // --- `23-30`/`23-12`: `/calendar/phone-reveals` - the reveal audit trail, `CalendarPhoneRevealsPage`'s
  // own screen. Keyset-paged, the same "Load more" shape `searchLoadMoreButton`/`searchLoadingMoreLabel`
  // already established for `SearchConversationsPage`. ---
  calendarPhoneRevealsDescription: string;
  calendarPhoneRevealsEmpty: string;
  calendarPhoneRevealsColumnWhen: string;
  calendarPhoneRevealsColumnCustomer: string;
  calendarPhoneRevealsColumnOperator: string;
  calendarPhoneRevealsColumnSurface: string;
  calendarPhoneRevealsLoadMoreButton: string;
  calendarPhoneRevealsLoadingMoreLabel: string;

  // --- `23-60`/`adr/0161`: `/calendar/customer-merges` - the merge audit trail, the same keyset
  // "Load more" shape as the phone-reveal audit trail two doors up, and the identical
  // `calendar:configure` gate for the identical reason (`GetCustomerMergesForTenantHandler`'s own
  // doc comment). ---
  calendarCustomerMergesDescription: string;
  calendarCustomerMergesEmpty: string;
  calendarCustomerMergesColumnWhen: string;
  calendarCustomerMergesColumnSurvivor: string;
  calendarCustomerMergesColumnAbsorbed: string;
  calendarCustomerMergesColumnOperator: string;
  calendarCustomerMergesColumnBookingsMoved: string;
  calendarCustomerMergesLoadMoreButton: string;
  calendarCustomerMergesLoadingMoreLabel: string;

  /** `23-21`, generalised by `23-24` beyond the calendar (renamed from `calendarForbiddenGrantHint`
   * - the wording was already generic, "this workspace", never "the calendar"). Appended after
   * whichever `*Forbidden` sentence named the screen, by `src/shell/accessRefusal.tsx`'s shared
   * `AccessRefusal` - every gate an owner at this tenant could grant (`site:configure`,
   * `site:erase`, `calendar:configure`) reaches the same sentence, so the "who can grant it" half of
   * decision §10 has one real answer, not one worded per screen. Never shown alongside
   * `calendarAbsentForTenant` below - that is the one gate with a third, ungrantable state, and
   * `src/calendar/calendarAccess.tsx` is what tells the two apart. */
  accessRefusalGrantHint: string;
  /** `23-21`: the *other* half of the same distinction - shown instead of a `calendar*Forbidden`
   * sentence when this tenant has never had the calendar module switched on at all, so refusing with
   * "you do not have permission" would be true of every operator anywhere, not a fact about this
   * person. Says what the console can honestly say about where the capability comes from without
   * claiming a self-service path that does not exist yet (`flows.md` 5.2). */
  calendarAbsentForTenant: string;

  calendarNotConfigured: string;

  // --- `23-27`: `RedeemInvitePage` - the other end of `13-01`'s invite (`CreateOperatorInvite`
  // generates a code; this is where it is spent). Every string below was in the table from `23-27`
  // itself, in both `en.ts` and `ru.ts` - what `23-27` could not do was pick the Russian half at the
  // right moment, since this screen has no site to read a locale from. `23-28` wraps this route (and
  // `/onboarding`/`/signup`/`/callback`) in `App.tsx`'s `PreSessionStringsProvider` instead of solving
  // that puzzle - `StringsContext.tsx`'s own doc comment has the reasoning - so these render Russian
  // by default now, the same as the rest of this screen set. See `RedeemInvitePage.tsx`'s own doc
  // comment for the full account, including why the `ux-gate/gate.spec.ts` exemption this screen used
  // to share with `owner-sites` is gone. ---
  redeemInviteTitle: string;
  redeemInviteDescription: string;
  redeemInviteCodeLabel: string;
  redeemInviteValidationEmpty: string;
  redeemInviteSubmit: string;
  redeemInviteSubmitting: string;
  /** Shown once redemption succeeds, for the short window before the redirect to the queue fires -
   * `RedeemInvitePage.tsx`'s own doc comment has the reasoning for why that redirect is delayed
   * rather than immediate. */
  redeemInviteSuccessMessage: string;
  /** `OperatorInvite.NotFound` (`404`) - a code that matches no row at all, whether mistyped or
   * invented. */
  redeemInviteErrorNotFound: string;
  /** `OperatorInvite.Expired` (`410`) - a real invite whose window has passed. */
  redeemInviteErrorExpired: string;
  /** `OperatorInvite.AlreadyRedeemed` (`409`) - a real invite somebody (possibly this same person,
   * on an earlier attempt or a second tab) has already spent. */
  redeemInviteErrorAlreadyRedeemed: string;
  /** `OperatorInvite.AlreadyOperatorOnSite` (`409`) - this identity already administers the inviting
   * site; nothing to do here, not a fix to make. */
  redeemInviteErrorAlreadyOperator: string;
  /** `OperatorInvite.SeatLimitReached` (`402`) - the invite is real and unused, but the site's own
   * plan has no room left; a billing fact about the *site*, not a mistake by the person redeeming. */
  redeemInviteErrorSeatLimitReached: string;
  /** Anything else - a network failure, or a status this screen does not otherwise name. */
  redeemInviteErrorGeneric: string;
  /** This screen's own link back to `/onboarding`, for a reader who followed that page's own
   * "Have an invite code instead?" link (`onboardingRedeemInviteLinkLabel`, below) here by mistake. */
  redeemInviteSetupOwnSiteLink: string;

  // --- `23-70`: `/invite/:code` (`InvitePreviewPage`) - the landing page a colleague reaches by
  // opening the link `/team/people` now hands out, before they have signed in at all
  // (`POST /api/v1/operator-invites/preview`, `AllowAnonymous()`). Wrapped in the same
  // `PreSessionStringsProvider` as `/redeem-invite` right above, for the identical reason: nobody
  // reaching this page has a site to read a locale from yet. ---
  invitePreviewTitle: string;
  invitePreviewLoading: string;
  /** `${invitePreviewSiteLabel} ${siteName}` - "which shop" (this item's own backlog text). */
  invitePreviewSiteLabel: string;
  /** `${invitePreviewInvitedByLabel} ${name}` - "from whom". Only rendered when the server names an
   * inviter (`OperatorInvitePreviewResponse.invitedByDisplayName` can be `null`, `RedeemInvitePage`'s
   * own `operatorLabel`-style fallback has the precedent for why). */
  invitePreviewInvitedByLabel: string;
  /** `${invitePreviewExpiresLabel} ${date}` - "that it expires", visible on the link itself now, not
   * only at creation (this item's own Done-when). */
  invitePreviewExpiresLabel: string;
  invitePreviewContinueButton: string;
  /** `OperatorInvite.Expired` (`200`, `Status: "Expired"` - this item's own trap: "not 404 and not
   * throw"). */
  invitePreviewExpiredMessage: string;
  /** `Status: "Redeemed"` - somebody, possibly this same reader on an earlier click, already spent
   * this exact link. */
  invitePreviewRedeemedMessage: string;
  /** `OperatorInvite.NotFound` (`404`) - a link that names no real invite at all, whether mistyped or
   * invented; the same info-hiding wording `redeemInviteErrorNotFound` already uses for the identical
   * server fact on the redemption side of this same code. */
  invitePreviewNotFoundMessage: string;
  /** Anything else - a network failure, or a status this screen does not otherwise name. */
  invitePreviewErrorGeneric: string;

  // --- `23-28`: `/callback`, `/signup`, `/onboarding` - the three pre-session pages that hardcoded
  // English literals directly, because `StringsContext.tsx`'s own default was believed to be the
  // correct behaviour for a page with no tenant to follow. The author's answer to that item settles
  // it the other way: where nothing is set, the locale is Russian, not English, so these three pages
  // needed real translations for the first time rather than a provider to pick between two that
  // already existed (`redeemInvite*`'s own situation, above). Grouped by page, in the order each page
  // renders its own strings. ---

  /** `CallbackPage`'s `Spinner` label while `signinRedirectCallback()` and the state lookup that
   * follows it are both still in flight. */
  callbackCompletingSignIn: string;
  /** The alert title when Keycloak's own round trip itself fails or is refused - unchanged in
   * meaning since `11-17`, now translated. */
  callbackSignInFailedTitle: string;
  /** `11-17`'s other failure kind - sign-in already succeeded, and the call *after* it (`GET
   * /api/v1/operators/me`) did not. */
  callbackOperatorLookupFailedTitle: string;
  /** The fixed fragment before the interpolated `err.message` in that failure's detail text - see
   * this interface's own header for why an interpolated value is composed at the call site against a
   * fixed fragment here, never a function stored in the table. Ends with `": "`, matching the
   * original literal exactly. */
  callbackOperatorLookupFailedDetailPrefix: string;
  /** The fixed fragment after the interpolated `err.message` in that same detail text. */
  callbackOperatorLookupFailedDetailSuffix: string;
  /** The fallback for `err instanceof Error` being false, in either of `CallbackPage`'s two failure
   * branches - an error value that is not an `Error` at all is not something this screen can say
   * anything more specific about. */
  callbackUnknownError: string;

  /** `SignupPage`'s `<PageHead>` title. */
  signupTitle: string;
  /** `SignupPage`'s `<PageHead>` description. */
  signupDescription: string;
  /** The button's resting label. */
  signupButton: string;
  /** The button's label while `keycloakRegistrationRedirect()` is in flight and the browser is about
   * to leave for Keycloak. */
  signupButtonRedirecting: string;
  /** The fixed fragment before the interpolated `err.message` when the redirect itself throws -
   * Keycloak's discovery document could not be fetched, or the registration URL it derives from that
   * document could not be built. */
  signupErrorPrefix: string;
  /** The fallback for `err instanceof Error` being false. */
  signupErrorGeneric: string;

  /** `OnboardingPage`'s `<PageHead>` title. */
  onboardingTitle: string;
  /** `OnboardingPage`'s `<PageHead>` description. */
  onboardingDescription: string;
  onboardingSiteNameLabel: string;
  /** `validate()`'s own client-side check, before the server's - `RegisterSiteHandler`'s real gate is
   * unchanged and still surfaces its own message if this one somehow lets something through. */
  onboardingSiteNameEmptyError: string;
  onboardingOriginLabel: string;
  onboardingOriginDescription: string;
  /** `validate()`'s own check for a scheme other than `http`/`https` - the placeholder example URL
   * itself (`https://shop.example.com`) stays an untranslated literal on the `<Input>` (a `placeholder`
   * attribute renders no DOM text node, so it is invisible to both a screen reader label and
   * `ux-gate`'s untranslated-text assertion, and an example domain name is not a phrase either
   * language translates). */
  onboardingOriginInvalidScheme: string;
  /** `validate()`'s own check for a value `new URL()` cannot parse at all. */
  onboardingOriginInvalidUrl: string;
  onboardingSubmit: string;
  onboardingSubmitting: string;
  /** The fallback when `registerSite` fails with anything other than a `RegisterSiteError` - that
   * error type's own `.message` is a server-supplied `detail` and is shown verbatim, unchanged. */
  onboardingGenericSubmitError: string;
  /** `12-05`'s own alert, shown only when `useOwnerEligibility()` answers `"eligible"`. */
  onboardingPlatformOwnerAlertTitle: string;
  onboardingPlatformOwnerAlertLinkLabel: string;
  onboardingPlatformOwnerAlertBody: string;
  /** `23-27`'s own link to `/redeem-invite`, added to this page as a single line at its foot -
   * `RedeemInvitePage.tsx`'s own doc comment has the "why here, why a link rather than a merged
   * screen" reasoning. */
  onboardingRedeemInvitePrompt: string;
  onboardingRedeemInviteLinkLabel: string;
  // --- `24-03`: `PolicyPage` - the unauthenticated reading surface for `24-02`'s published
  // documents (`GET /api/v1/documents/{documentKey}`), reached from `OnboardingPage`'s own new
  // "you agree to our terms" link (a plain, hardcoded-English literal there, unchanged from that
  // page's own established convention - `OnboardingPage.tsx`'s own doc comment). Mounted outside
  // every provider, alongside `/signup`/`/callback` (`App.tsx`) - there is no signed-in identity
  // here at all, let alone a tenant whose locale this screen could follow, the same reasoning
  // `StringsContext.tsx`'s own doc comment gives for those three. `useStrings()`'s context default
  // (`en`) is what actually renders here today; both entries exist below anyway, for the identical
  // reason `RedeemInvitePage`'s own entries do - "every string through the translation files," a
  // property of where the text lives, not a promise this screen already has a locale signal to
  // act on. ---
  policyPageLoading: string;
  /** `Document.NotFound` (`404`) - no version, current or otherwise, exists under this key. */
  policyPageNotFound: string;
  /** Anything else - a network failure, a rate limit, or a status this screen does not otherwise
   * name. */
  policyPageErrorGeneric: string;
  /** Composed with `formatAbsolute` (`time/format.ts`) at the call site: `"Published "` + the
   * rendered instant. */
  policyPagePublishedPrefix: string;
  /** Composed immediately after the instant `policyPagePublishedPrefix` introduces: `" - version "`
   * + the document's own `v{n}` string. */
  policyPageVersionSeparator: string;
  // --- `24-15`: `DeviceStorageDisclosurePage` (`/settings/device-storage`) - what a tenant can
  // read, from their own console, to write their own cookie or privacy notice. `site:configure`-
  // gated the same way every settings screen above it is; the content itself is the same for every
  // tenant (it describes the widget's code, not this site's own configuration), so unlike its
  // neighbours this screen fetches nothing - `deviceStorageDisclosure.ts`'s own rows are the whole
  // page. See that file's doc comment for why the key names there are a hand-maintained copy of
  // `ago-widget/src/storage.ts`'s `WIDGET_STORAGE_DISCLOSURE`, not a live import.
  //
  // `23-31`: shortened from "Data on a visitor's device"/"Данные на устройстве посетителя" to
  // "Device data"/"Данные на устройстве" - the item's own table wording for this entry, moved to
  // `/account/device-storage`. ---
  navDeviceStorage: string;
  deviceStorageTitle: string;
  deviceStorageDescription: string;
  deviceStorageForbidden: string;
  /** The fact `24-15`'s own item said had to be stated in those words: a tenant auditing their site
   * for cookies and finding none would otherwise, wrongly, conclude there is nothing to declare. */
  deviceStorageNotCookies: string;
  deviceStorageIntro: string;
  /** Ties into `personal-data.md`'s own register: this store sits on the visitor's own device, which
   * is a place AGO cannot reach - there is no server-side "forget me" for it, only the visitor
   * clearing their own site data. */
  deviceStorageEraseNote: string;
  deviceStorageColumnKey: string;
  deviceStorageColumnHolds: string;
  deviceStorageColumnWhy: string;
  deviceStorageColumnLifetime: string;
  deviceStorageColumnSurvivesTabClose: string;
  /** Every row's own answer is the same - `localStorage` always outlives the tab that wrote it - so
   * this is the one string every row's cell renders, rather than nine copies of "Yes". */
  deviceStorageSurvivesTabCloseYes: string;

  deviceStorageVisitorTokenHolds: string;
  deviceStorageVisitorTokenWhy: string;
  deviceStorageVisitorTokenLifetime: string;
  deviceStorageVisitorIdHolds: string;
  deviceStorageVisitorIdWhy: string;
  deviceStorageVisitorIdLifetime: string;
  deviceStorageWidgetColorHolds: string;
  deviceStorageWidgetColorWhy: string;
  deviceStorageWidgetColorLifetime: string;
  deviceStorageWidgetPositionHolds: string;
  deviceStorageWidgetPositionWhy: string;
  deviceStorageWidgetPositionLifetime: string;
  deviceStorageWidgetLocaleHolds: string;
  deviceStorageWidgetLocaleWhy: string;
  deviceStorageWidgetLocaleLifetime: string;
  deviceStorageWidgetNoticeTextHolds: string;
  deviceStorageWidgetNoticeTextWhy: string;
  deviceStorageWidgetNoticeTextLifetime: string;
  deviceStorageWidgetNoticeUrlHolds: string;
  deviceStorageWidgetNoticeUrlWhy: string;
  deviceStorageWidgetNoticeUrlLifetime: string;
  /** `23-105`: the `enabled-modules` row - `ago-widget/src/storage.ts`'s own new entry in
   * `WIDGET_STORAGE_DISCLOSURE`, added the same day `data-booking` stopped being read. */
  deviceStorageEnabledModulesHolds: string;
  deviceStorageEnabledModulesWhy: string;
  deviceStorageEnabledModulesLifetime: string;
  deviceStorageConversationIdHolds: string;
  deviceStorageConversationIdWhy: string;
  deviceStorageConversationIdLifetime: string;
  deviceStorageLastSequenceHolds: string;
  deviceStorageLastSequenceWhy: string;
  deviceStorageLastSequenceLifetime: string;
}
