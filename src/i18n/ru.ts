import type { ConsoleStrings } from "./strings.js";

export const ru: ConsoleStrings = {
  skipToContent: "Перейти к содержимому",
  operatorConsoleTagline: "Консоль оператора",
  consoleTaglineClient: "Консоль клиента",
  // Never actually rendered - `OwnerSitesPage` always reads the fixed `en` table for its own
  // header (11-11's settled design call) - kept here only because `ConsoleStrings` requires every
  // field on both tables.
  consoleTaglineOwner: "Консоль владельца платформы",
  navSectionsAriaLabel: "Разделы консоли",
  navConversations: "Диалоги",
  navAllConversations: "Все диалоги",
  navWidgetAppearance: "Внешний вид виджета",
  navOfflineAutoReply: "Автоответ офлайн",
  navPlatformSites: "Сайты платформы",
  navDeleteAccount: "Удалить аккаунт",
  signOut: "Выйти",
  siteIdTooltip: "ID сайта",
  siteIdPrefix: "сайт",
  tenancySwitcherLabel: "Сайт",
  activeSiteAriaLabel: "Активный сайт",
  unnamedSite: "Без названия",
  publicDemoNoticeSharedLogin:
    "Это публичная демо-консоль. Логин от неё опубликован на демо-страницах, так что войти сюда " +
    "может кто угодно — каждый разговор здесь написан незнакомцем, которому сказали, что вы можете " +
    "его прочитать. Не пишите сюда ничего настоящего.",
  publicDemoNoticePlatformOwner:
    "Это публичная демо-консоль. Вы вошли как владелец платформы — ваш собственный логин нигде не " +
    "опубликован, а вот логин демо-оператора опубликован, так что войти сюда под ним может кто " +
    "угодно. Каждый разговор здесь написан незнакомцем, которому сказали, что оператор может его " +
    "прочитать. Не пишите сюда ничего настоящего.",

  agoSuffix: "назад",

  queueAssignedTitle: "Назначено мне",
  queueAssignedNote: "В реальном времени — новое назначение появляется без обновления страницы.",
  queueAssignedLoadingLabel: "Загрузка назначенных вам диалогов…",
  queueAssignedEmpty: "Пока ничего не назначено. Новые диалоги появляются здесь автоматически.",
  queueNewBadge: "Новое",
  queueUnreadMessageOne: "непрочитанное сообщение",
  queueUnreadMessageOther: "непрочитанных сообщений",
  queueConversationStartedTitle: "Диалог начат",
  queueOpenLabel: "Открыт",
  queueStartUnknown: "Время начала неизвестно",
  queueWaitingTitle: "Ожидание",
  queueWaitingNotePrefix: "Только для чтения — диалоги назначаются автоматически, забрать их отсюда нельзя. Обновляется каждые",
  queueWaitingNoteSuffix: "секунд.",
  queueWaitingEmpty: "Никто не ждёт.",
  queueWaitingLoadingLabel: "Загрузка списка ожидания…",
  queueWaitingSinceTitle: "Ждёт с",
  queueWaitingSinceUnknown: "Время начала ожидания неизвестно",

  threadLoadingOlder: "Загрузка…",
  threadLoadOlderButton: "Загрузить более ранние сообщения",
  threadAriaLabel: "Переписка",
  threadMessageNumberLabel: "сообщение №",
  threadMessageNumberOnlyLabel: "Сообщение №",
  threadNoTimestamp: "нет времени",
  threadAuthorVisitor: "Посетитель",
  threadAuthorOperator: "Оператор",
  threadAuthorSystem: "Система",

  composerUploadingLabel: "Загрузка",
  composerAttachedBadge: "Вложено",
  composerRemoveButton: "Убрать",
  composerTooManyFiles: "Вложен только первый файл — к сообщению можно прикрепить только один.",
  composerPlaceholder: "Напишите ответ — Enter отправляет, Shift+Enter — новая строка",
  composerAriaLabel: "Сообщение для отправки",
  composerAttachAriaLabel: "Прикрепить файл",
  composerAttachButton: "Прикрепить",
  composerSendButton: "Отправить",
  composerHint: "Enter отправляет · Shift+Enter — новая строка · Escape очищает · перетащите или вставьте файл, чтобы прикрепить",

  emptyStateAriaLabel: "Диалог не открыт",
  emptyStateTitle: "Выберите диалог",
  emptyStateBody:
    "Выберите один из назначенных вам диалогов слева. Новые диалоги назначаются вам автоматически, " +
    "как только посетитель начинает переписку — забирать их отсюда не нужно.",

  visitorPanelTitle: "Посетитель",
  visitorPresenceUnknown: "Присутствие неизвестно",
  visitorOnline: "Онлайн",
  visitorOffline: "Не в сети",
  conversationStateAssigned: "Назначен",
  conversationStateClosed: "Закрыт",
  visitorIdLabel: "ID посетителя",
  visitorNotInQueue: "Не в вашей очереди",
  visitorConversationStartedUnknown: "Неизвестно",
  visitorSiteLabel: "Сайт",
  visitorSiteNotKnown: "Пока неизвестно",
  visitorConversationLabel: "Диалог",
  visitorPanelNote:
    "Это всё, что платформа сегодня знает о посетителе. Текущая страница и источник перехода пока " +
    "не собираются. Предыдущие диалоги показаны ниже, если этот посетитель был распознан в канале " +
    "(MAX, Telegram или SMS).",

  visitorHistoryTitle: "Предыдущие диалоги",
  visitorHistoryLoadingLabel: "Загрузка предыдущих диалогов…",
  visitorHistoryEmpty: "С этим посетителем пока не было диалогов.",
  visitorHistoryError: "Не удалось загрузить предыдущие диалоги этого посетителя.",
  visitorHistoryStartedLabel: "Начат",
  visitorHistoryClosedLabel: "Закрыт",
  visitorHistoryStillOpen: "Ещё открыт",
  visitorHistoryNoPreview: "Нет сообщений",
  visitorHistoryOpenLabel: "Открыть",
  visitorHistoryDialogLoadingLabel: "Загрузка диалога…",
  visitorHistoryDialogError: "Не удалось загрузить этот диалог.",

  closeConversationButton: "Закрыть диалог",
  closeConversationDialogTitle: "Закрыть этот диалог?",
  cancelButton: "Отмена",
  closeTryAgainButton: "Попробовать снова",
  closeItButton: "Закрыть",
  closeConversationDialogBody:
    "Чат с посетителем завершится, и этот диалог нельзя будет открыть заново. Закрытие также " +
    "освобождает вашу нагрузку, поэтому вам может сразу назначиться новый диалог.",

  closeOutcomeNetworkError: "Консоли не удалось связаться с сервером. Проверьте соединение и попробуйте снова.",
  closeOutcomeAlreadyClosed: "Этот диалог уже закрыт.",
  closeOutcomeConcurrencyConflict: "Кто-то ещё менял этот диалог в тот же момент. Попробуйте закрыть его снова.",
  closeOutcomeNotFound: "Этого диалога больше не существует.",
  closeOutcomeReassigned: "Этот диалог больше не назначен вам — его забрал кто-то другой.",
  closeOutcomeNoPermission: "У вас нет права закрывать диалоги для этого сайта.",

  alertSettingsIntro:
    "Оба варианта выключены, пока вы их не включите, и ни один не срабатывает для диалога, который " +
    "уже открыт у вас на видимой вкладке.",
  alertSettingsBlockedDenied:
    "Ваш браузер блокирует уведомления для этого сайта. Консоль не может спросить ещё раз — " +
    "включите их заново в настройках сайта браузера и перезагрузите страницу. Звук ниже работает " +
    "в любом случае.",
  alertSettingsBlockedUnsupported:
    "Этот браузер не предлагает уведомления на рабочем столе на этой странице. Звук ниже работает в любом случае.",
  alertSettingsDesktopLabel: "Уведомления на рабочем столе",
  alertSettingsPermissionHintDefault: "Включение запросит разрешение у браузера.",
  alertSettingsPermissionHintGranted: "Карточка, когда диалог требует внимания. Никогда — текст сообщения.",
  alertSettingsSoundLabel: "Звук",
  alertSettingsSoundHint: "Короткий сигнал. Разрешение не требуется.",

  alertAssignedTitle: "Назначен новый диалог",
  alertAssignedBody: "ждёт вас.",
  alertMessageTitle: "Новое сообщение",
  alertMessageBody: "отправил(а) сообщение.",
  alertWhoUnknown: "Посетитель",
  alertVisitorPrefix: "Посетитель",

  shortcutsDialogTitle: "Горячие клавиши",
  shortcutsCloseButton: "Закрыть",
  shortcutsIntro:
    "Они работают в любом месте рабочего пространства, кроме момента, когда вы печатаете — " +
    "поле ввода и любое другое текстовое поле оставляют себе каждую клавишу.",
  shortcutNextConversation: "Перейти к следующему назначенному вам диалогу",
  shortcutPreviousConversation: "Перейти к предыдущему",
  shortcutFocusComposer: "Поставить курсор в поле ввода",
  shortcutCloseThread: "Закрыть открытый диалог и вернуться к списку",
  shortcutShowHelp: "Показать этот список",
  shortcutsHintIntro: "В поле ввода:",
  shortcutsHintSends: "отправляет,",
  shortcutsHintNewLine: "— новая строка,",
  shortcutsHintClears: "очищает черновик.",

  workspaceHiddenHeading: "Рабочее пространство оператора",
  workspaceConversationsLabel: "Диалоги",
  workspaceAlertsLabel: "Уведомления",
  workspaceShortcutsButton: "Горячие клавиши",
  workspaceQueueLoadError: "Не удалось загрузить очередь.",
  workspaceNewAssignmentAnnouncement: "Вам назначен новый диалог.",
  workspaceDoneButton: "Готово",

  linkLiveLabel: "Онлайн",
  linkLiveDetail: "Подключено к серверу оператора. Новые сообщения приходят без обновления страницы.",
  linkConnectingLabel: "Подключение…",
  linkConnectingDetail: "Открывается соединение с сервером оператора.",
  linkReconnectingLabel: "Переподключение…",
  linkReconnectingDetail:
    "Соединение прервалось и переподключается с нарастающей паузой. Сообщения, отправленные прямо " +
    "сейчас, не дойдут и их можно будет отправить снова; ничто из отправленного вам в это время не " +
    "потеряется — переподключение продолжится с последнего полученного сообщения.",
  linkDrainingLabel: "Перезапуск сервера",
  linkDrainingDetail:
    "Сервер попросил эту консоль переподключиться перед своим перезапуском. Вы всё ещё подключены и " +
    "можете отправлять сообщения; скоро ожидается короткое переподключение.",
  linkDisconnectedLabel: "Офлайн",
  linkDisconnectedDetail:
    "Нет соединения с сервером оператора. Отправляемые вами сообщения не будут доходить, пока " +
    "соединение не восстановится. Перезагрузка страницы редко помогает — если это продолжается, " +
    "консоль браузера содержит причину отказа в соединении (5-18).",
  connectionBadgeAriaPrefix: "Сервер оператора:",

  conversationBackLink: "← Диалоги",
  conversationWithPrefix: "Диалог с",
  conversationTitleFallback: "Диалог",
  conversationWaitingForHub: "Ожидание сервера оператора, пока диалог не сможет загрузиться или отправить сообщение.",
  conversationClosedTitle: "Этот диалог закрыт",
  conversationClosedBody:
    "Ваша нагрузка освобождена, поэтому в любой момент вам может быть назначен новый диалог. " +
    "Переписка выше остаётся доступной для чтения.",
  conversationSendFailedTitle: "Отправка не удалась или не подтверждена",
  conversationRetryButton: "Повторить",
  conversationLoadingAttachment: "Загрузка вложения…",
  conversationAttachmentDeleted: "Вложение удалено",
  conversationAttachmentUnavailable: "Вложение недоступно",
  conversationDownloadAttachmentLabel: "Скачать вложение",
  conversationAttachmentThumbnailAlt: "Миниатюра вложения",
  conversationDeleteAttachmentButton: "Удалить вложение",
  conversationUploadFailed: "Загрузка не удалась.",

  siteConfigCheckingPermissions: "Проверка ваших прав…",
  siteConfigBackToQueue: "Назад к очереди",
  siteConfigSaveButton: "Сохранить",
  siteConfigSavingButton: "Сохранение…",
  siteConfigSavedAlert: "Сохранено.",

  adminColumnVisitor: "Посетитель",
  adminColumnState: "Статус",
  adminColumnOperator: "Назначенный оператор",
  adminUnassigned: "Не назначен",
  adminColumnStarted: "Начат",
  adminColumnUnread: "Непрочитано",
  adminLoadError: "Не удалось загрузить диалоги.",
  adminLoadingLabel: "Загрузка диалогов…",
  adminForbidden: "У вас нет права просматривать все диалоги для этого сайта.",
  adminDescriptionPrefix: "Все диалоги для этого сайта (сначала новые, только для чтения, обновляется каждые",
  adminDescriptionSuffix: "секунд).",
  adminEmpty: "Диалогов пока нет.",
  adminTableCaption: "Все диалоги для этого сайта, сначала новые.",
  adminColumnActions: "Действия",
  adminConversationErasedNotice: "Диалог удалён без возможности восстановления.",

  widgetLoadError: "Не удалось загрузить настройки виджета.",
  widgetSubmitError: "Не удалось сохранить настройки виджета.",
  widgetForbidden: "У вас нет права настраивать виджет этого сайта.",
  widgetDescription:
    "Изменения вступят в силу при следующей загрузке страницы посетителем. Посетитель, у которого " +
    "виджет уже открыт на странице, не увидит новый цвет, положение или язык, пока не перезагрузит " +
    "страницу.",
  widgetLoadingLabel: "Загрузка настроек виджета…",
  widgetPanelTitle: "Кнопка запуска",
  widgetColorFieldLabel: "Основной цвет (hex, необязательно)",
  widgetColorFieldDescription: "Оставьте пустым, чтобы использовать встроенный цвет виджета по умолчанию.",
  widgetColorPreviewTitle: "Предпросмотр",
  widgetColorValidation: "Цвет должен быть в формате hex, например #2F6FED.",
  widgetPositionFieldLabel: "Положение кнопки запуска",
  widgetPositionBottomRight: "Внизу справа",
  widgetPositionBottomLeft: "Внизу слева",
  widgetLanguageFieldLabel: "Язык виджета",

  autoReplyForbidden: "У вас нет права настраивать автоответ офлайн для этого сайта.",
  autoReplyDescription:
    "Когда это включено и никто из вашей команды не в сети, на первое сообщение посетителя " +
    "автоматически отправляется ответ вместо тишины. Автоответ никогда не срабатывает, пока кто-то " +
    "в сети — коллега, который просто занят, всё равно считается онлайн, — и никогда не отвечает в " +
    "диалоге, который кто-то уже взял в работу.",
  autoReplyLoadingLabel: "Загрузка автоответа офлайн…",
  autoReplyLoadError: "Не удалось загрузить автоответ офлайн.",
  autoReplySubmitError: "Не удалось сохранить автоответ офлайн.",
  autoReplyPanelTitle: "Ответы, пока вас нет на месте",
  autoReplyEnabledLabel: "Отвечать автоматически, когда никого нет в сети",
  autoReplyDefaultFieldLabel: "Ответ по умолчанию",
  autoReplyDefaultFieldDescription: "Отправляется, если ни одно ключевое слово ниже не подошло. Это то, что увидит большинство посетителей.",
  autoReplyDefaultPlaceholder: "Спасибо за обращение — сейчас мы не работаем и ответим утром.",
  autoReplyRulesLegend: "Правила по ключевым словам",
  autoReplyRulesIntro:
    "Если в сообщении посетителя есть ключевое слово, вместо ответа по умолчанию отправляется ответ " +
    "из этого правила. Побеждает первое совпавшее правило, поэтому более конкретные ставьте выше. " +
    "Чтобы убрать строку, оставьте её пустой.",
  autoReplyKeywordLabelPrefix: "Ключевое слово",
  autoReplyKeywordPlaceholder: "возврат",
  autoReplyReplyLabelPrefix: "Ответ",
  autoReplyReplyPlaceholder: "Возврат средств занимает три рабочих дня.",
  autoReplyRemoveButton: "Удалить",
  autoReplyRemoveButtonAriaPrefix: "Удалить правило",

  autoReplyValidationNeedsDefault: "Включённому автоответу нужно что сказать — заполните ответ по умолчанию.",
  autoReplyValidationDefaultTooLongPrefix: "Ответ по умолчанию не может быть длиннее",
  autoReplyValidationDefaultTooLongSuffix: "символов.",
  autoReplyValidationTooManyRulesPrefix: "У сайта не может быть больше",
  autoReplyValidationTooManyRulesSuffix: "правил по ключевым словам.",
  autoReplyValidationKeywordRequired: "У правила по ключевому слову должно быть ключевое слово.",
  autoReplyValidationReplyRequiredPrefix: 'Для правила "',
  autoReplyValidationReplyRequiredSuffix: '" нужен ответ.',
  autoReplyValidationKeywordTooLongPrefix: "Ключевое слово не может быть длиннее",
  autoReplyValidationKeywordTooLongSuffix: "символов.",
  autoReplyValidationReplyTooLongPrefix: "Ответ не может быть длиннее",
  autoReplyValidationReplyTooLongSuffix: "символов.",

  eraseConversationButton: "Удалить",
  eraseConversationDialogTitle: "Удалить этот диалог?",
  eraseConversationDialogBody:
    "Диалог, его сообщения и любые вложения будут удалены из всех хранилищ, где они есть. " +
    "Это нельзя отменить, и другого подтверждения, кроме этого, не будет.",
  eraseConversationConfirmButton: "Удалить",
  eraseConversationErasingLabel: "Удаление…",
  eraseConversationSubmitError: "Не удалось начать удаление этого диалога.",

  accountDeletionTitle: "Удалить аккаунт",
  accountDeletionDescription: "Безвозвратно удалить этот аккаунт и всё, что в нём есть.",
  accountDeletionForbidden: "У вас нет права удалить этот аккаунт.",
  accountDeletionPanelTitle: "Удалить этот аккаунт",
  accountDeletionWarningBody:
    "Будут удалены все диалоги, сообщения и вложения, настройки сайта, операторы и их учётные " +
    "записи для входа. Это нельзя отменить, и другого подтверждения, кроме этого, не будет.",
  accountDeletionButton: "Удалить этот аккаунт",
  accountDeletionDialogTitle: "Удалить этот аккаунт?",
  accountDeletionDialogBody:
    "Аккаунт и всё, что в нём есть, будут удалены безвозвратно. Это нельзя отменить, и другого " +
    "подтверждения, кроме этого, не будет.",
  accountDeletionConfirmButton: "Удалить",
  accountDeletionSubmitError: "Не удалось начать удаление этого аккаунта.",
  accountDeletionInProgressTitle: "Идёт удаление",
  accountDeletionInProgressBody:
    "Аккаунт удаляется. Это может занять некоторое время — не закрывайте эту страницу. Как только " +
    "удаление завершится, вы будете автоматически выведены из системы.",
};
