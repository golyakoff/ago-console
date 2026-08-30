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
  navCannedResponses: "Готовые ответы",
  navTags: "Метки",
  navPlatformSites: "Сайты платформы",
  navDeleteAccount: "Удалить аккаунт",
  navBilling: "Оплата",
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

  themeToggleLabel: "Тема",
  themeToggleAriaLabel: "Цветовая тема",
  themeOptionSystem: "Как в системе",
  themeOptionLight: "Светлая",
  themeOptionDark: "Тёмная",

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
  widgetNoticePanelTitle: "Уведомление об обработке данных",
  widgetNoticeTextFieldLabel: "Текст уведомления (необязательно)",
  widgetNoticeTextFieldDescription:
    "Показывается посетителю до того, как он начнёт печатать. Это ваша собственная формулировка о том, " +
    "как вы обрабатываете то, что он напишет, - AGO не пишет её за вас, а если оставить поле пустым, " +
    "уведомление не показывается вовсе.",
  widgetNoticeTextPlaceholder: "Мы используем ваши сообщения, чтобы отвечать на ваши вопросы.",
  widgetNoticeUrlFieldLabel: "Ссылка на уведомление (необязательно)",
  widgetNoticeUrlFieldDescription: "Ссылка на вашу собственную страницу с политикой. Должна начинаться с https://.",
  widgetNoticeUrlValidation: "Ссылка должна быть абсолютным адресом https://.",

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

  cannedResponsesForbidden: "У вас нет права настраивать готовые ответы для этого сайта.",
  cannedResponsesDescription:
    "Готовые ответы, которые ваша команда может вставить в сообщение вместо того, чтобы печатать их " +
    "заново. Введите «/» в поле сообщения, чтобы просмотреть их, не трогая мышь.",
  cannedResponsesLoadingLabel: "Загрузка готовых ответов…",
  cannedResponsesLoadError: "Не удалось загрузить готовые ответы.",
  cannedResponsesSubmitError: "Не удалось сохранить готовые ответы.",
  cannedResponsesPanelTitle: "Готовые ответы",
  cannedResponsesListLegend: "Ответы",
  cannedResponsesListIntro:
    "Каждому нужен короткий заголовок, чтобы его находить, и текст, который будет вставлен в поле " +
    "сообщения. Чтобы убрать строку, оставьте её пустой.",
  cannedResponsesTitleLabelPrefix: "Заголовок",
  cannedResponsesTitlePlaceholder: "Политика возврата",
  cannedResponsesBodyLabelPrefix: "Текст",
  cannedResponsesBodyPlaceholder: "Возврат средств занимает три рабочих дня после получения товара.",
  cannedResponsesRemoveButton: "Удалить",
  cannedResponsesRemoveButtonAriaPrefix: "Удалить готовый ответ",

  cannedResponsesValidationTitleRequired: "У готового ответа должен быть заголовок.",
  cannedResponsesValidationBodyRequiredPrefix: 'Для ответа с заголовком "',
  cannedResponsesValidationBodyRequiredSuffix: '" нужен текст.',
  cannedResponsesValidationTitleTooLongPrefix: "Заголовок не может быть длиннее",
  cannedResponsesValidationTitleTooLongSuffix: "символов.",
  cannedResponsesValidationBodyTooLongPrefix: "Текст ответа не может быть длиннее",
  cannedResponsesValidationBodyTooLongSuffix: "символов.",
  cannedResponsesValidationTooManyPrefix: "У сайта не может быть больше",
  cannedResponsesValidationTooManySuffix: "готовых ответов.",

  composerCannedResponsesAvailableHint: "Введите / для вставки готового ответа",

  composerSuggestReplyButton: "Предложить ответ",
  composerSuggestReplyGenerating: "Формируем предложение…",
  replyDraftRateLimitedError: "Слишком много запросов на подсказку — попробуйте чуть позже.",
  replyDraftUnavailableError: "Подсказка ИИ временно недоступна.",
  replyDraftFailedError: "Не удалось получить предложение.",
  composerCannedResponsesListAriaLabel: "Готовые ответы",
  composerCannedResponsesNoMatch: "Нет подходящих готовых ответов.",
  composerCannedResponsesInsertHint: "↑↓ — выбор · Enter — вставить · Esc — отмена",

  tagsForbidden: "У вас нет прав на управление метками этого сайта.",
  tagsDescription: "Метки, которые можно прикреплять к диалогам, а затем использовать для фильтрации и подсчёта.",
  tagsLoadingLabel: "Загрузка меток…",
  tagsLoadError: "Не удалось загрузить метки.",
  tagsCreateError: "Не удалось создать метку.",
  tagsRenameError: "Не удалось переименовать метку.",
  tagsDeleteError: "Не удалось удалить метку.",
  tagsPanelTitle: "Метки",
  tagsEmpty: "Меток пока нет.",
  tagsNameLabel: "Название",
  tagsSaveButton: "Сохранить",
  tagsCancelButton: "Отмена",
  tagsRenameButton: "Переименовать",
  tagsDeleteButton: "Удалить",
  tagsNewNameLabel: "Новая метка",
  tagsNewNamePlaceholder: "например, VIP",
  tagsCreatingButton: "Создание…",
  tagsCreateButton: "Создать метку",

  tagsSectionTitle: "Метки",
  tagsNoneApplied: "Метки не применены.",
  tagsApplyError: "Не удалось применить метку.",
  tagsRemoveError: "Не удалось убрать метку.",
  tagsApplyLabel: "Применить метку",
  tagsApplyPlaceholder: "Выберите метку…",
  tagsApplyButton: "Применить",
  tagsRemoveButtonAriaPrefix: "Убрать метку",

  workspaceTagFilterLabel: "Фильтр по метке",
  workspaceTagFilterAll: "Все метки",

  notesTitle: "Заметки",
  notesVisitorCannotSeeNote: "Посетитель их никогда не видит.",
  notesLoadingLabel: "Загрузка заметок…",
  notesLoadError: "Не удалось загрузить заметки.",
  notesEmpty: "Заметок пока нет.",
  notesAddPlaceholder: "Добавить заметку для команды…",
  notesAddingButton: "Добавление…",
  notesAddButton: "Добавить заметку",
  notesAddError: "Не удалось добавить заметку.",

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

  navSearch: "Поиск",
  searchPageDescription:
    "Полнотекстовый поиск по всем диалогам этого сайта. Сначала новые результаты — это обычное " +
    "совпадение по словам, а не ранжирование по релевантности.",
  searchArchiveNote:
    "Поиск охватывает только диапазон дат, указанный ниже. Диалог старше этого диапазона может всё " +
    "ещё существовать, но отсюда недоступен.",
  searchPhraseFieldLabel: "Поисковая фраза",
  searchPhrasePlaceholder: "возврат, номер отслеживания, отмена…",
  searchFromFieldLabel: "С (необязательно)",
  searchToFieldLabel: "По (необязательно)",
  searchButton: "Искать",
  searchRangeLabel: "Поиск за период",
  searchForbiddenError: "У вас нет права искать по диалогам этого сайта.",
  searchInvalidQueryError: "Введите поисковую фразу.",
  searchLoadError: "Не удалось выполнить поиск по диалогам.",
  searchLoadingLabel: "Поиск…",
  searchEmpty: "Совпадений в этом диапазоне нет.",
  searchOpenLabel: "Открыть →",
  searchWaitingNote: "Не взят в работу — назначьте его из очереди, чтобы открыть.",
  searchClosedNote: "Закрыт — закрытый диалог нельзя снова открыть как активную переписку.",
  searchLoadMoreButton: "Загрузить ещё",
  searchLoadingMoreLabel: "Загрузка…",

  conversationLocatingMessageLabel: "Поиск сообщения в переписке…",
  conversationOpenFailed:
    "Не удалось открыть этот диалог здесь. Возможно, он назначен другому оператору, уже закрыт, " +
    "либо соединение оборвалось — попробуйте снова из результатов поиска или из очереди.",

  billingTitle: "Оплата",
  billingDescription: "Текущий тариф вашего сайта, использование мест и подписка.",
  billingForbidden: "У вас нет права просматривать оплату этого сайта.",
  billingLoadError: "Не удалось загрузить статус оплаты.",
  billingLoadingLabel: "Загрузка статуса оплаты…",

  billingPanelTitle: "Подписка",
  billingTierLabel: "Тариф",
  billingSeatsUsedLabel: "Занято мест",
  billingSeatLimitLabel: "Лимит мест",

  billingPendingTitle: "Подтверждение платежа",
  billingPendingBody:
    "Платёж отправлен в ЮKassa и ожидает подтверждения. Эта страница обновится автоматически, как " +
    "только он будет подтверждён — пока это ещё не завершённая подписка.",
  billingFailedTitle: "Платёж отклонён",
  billingFailedBody: "ЮKassa отклонила этот платёж. Списания не было — вы можете попробовать снова ниже.",
  billingPastDueTitle: "Повторная попытка оплаты",
  billingPastDueBody:
    "Повторное списание не удалось. Ваш текущий тариф и места сохраняются без изменений, пока в " +
    "течение недели идут повторные попытки; изменение мест недоступно до успешной попытки.",

  billingCancelRequestedTitle: "Подписка завершается",
  billingCancelRequestedBody: "Автопродление отключено. Платный тариф остаётся активным без дальнейших списаний до",
  billingPendingDowngradeTitle: "Изменение мест запланировано",
  billingPendingDowngradeBody: "При следующем продлении количество мест изменится на",

  billingSeatCountFieldLabel: "Количество мест",
  billingSeatCountFieldDescription: "От 2 до 100 мест. Точный ценовой диапазон подтверждается сервером.",
  billingSubscribeButton: "Оформить подписку",
  billingSubscribingButton: "Переход в ЮKassa…",
  billingChangeSeatsButton: "Изменить количество мест",
  billingChangingSeatsButton: "Отправка…",
  billingCheckoutError: "Не удалось начать оформление.",
  billingSeatChangeError: "Не удалось изменить количество мест.",
  billingUpgradeSuccessTitle: "Тариф повышен",
  billingUpgradeSuccessBody: "Списано",

  billingCancelButton: "Отменить подписку",
  billingCancelDialogTitle: "Отменить эту подписку?",
  billingCancelDialogBody:
    "Платный тариф будет действовать до конца уже оплаченного периода, затем перейдёт на " +
    "бесплатный тариф. Возврат средств за оставшееся время не производится.",
  billingCancelConfirmButton: "Отменить подписку",
  billingCancelError: "Не удалось отменить подписку.",

  navAnalytics: "Аналитика",
  analyticsPageDescription:
    "Как работает ваш сайт: количество диалогов, среднее время до первого ответа и диалоги, " +
    "оставшиеся без ответа - всего и по каналам.",
  analyticsFromFieldLabel: "С (необязательно)",
  analyticsToFieldLabel: "По (необязательно)",
  analyticsApplyButton: "Показать",
  analyticsRangeLabel: "Период",
  analyticsForbiddenError: "У вас нет права просматривать аналитику этого сайта.",
  analyticsInvalidRangeError: "Начало периода должно быть раньше его конца.",
  analyticsLoadError: "Не удалось загрузить аналитику.",
  analyticsLoadingLabel: "Загрузка аналитики…",
  analyticsEmpty: "В этом периоде нет диалогов.",
  analyticsChannelColumn: "Канал",
  analyticsConversationCountColumn: "Диалогов",
  analyticsAverageFirstResponseColumn: "Ср. время ответа",
  analyticsMissedCountColumn: "Без ответа",
  analyticsOverallRowLabel: "Все каналы",
  analyticsNoResponsesValue: "—",
  analyticsChannelWidget: "Виджет",
  analyticsChannelSms: "SMS",
  analyticsChannelMax: "MAX",
  analyticsChannelTelegram: "Telegram",
  analyticsChannelWhatsApp: "WhatsApp",

  analyticsByOperatorHeading: "По операторам",
  analyticsOperatorColumn: "Оператор",
  analyticsByOperatorEmpty: "В этом периоде нет диалогов, отнесённых к оператору.",
};
