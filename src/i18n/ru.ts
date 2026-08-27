import type { ConsoleStrings } from "./strings.js";

export const ru: ConsoleStrings = {
  skipToContent: "Перейти к содержимому",
  operatorConsoleTagline: "Консоль оператора",
  navSectionsAriaLabel: "Разделы консоли",
  navConversations: "Диалоги",
  navAllConversations: "Все диалоги",
  navWidgetAppearance: "Внешний вид виджета",
  navOfflineAutoReply: "Автоответ офлайн",
  navPlatformSites: "Сайты платформы",
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
    "Это всё, что платформа сегодня знает о посетителе. Текущая страница, источник перехода и " +
    "предыдущие диалоги пока не собираются.",

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
};
