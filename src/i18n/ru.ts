import type { ConsoleStrings } from "./strings.js";

export const ru: ConsoleStrings = {
  skipToContent: "Перейти к содержимому",
  tooltipTriggerLabel: "Что это значит?",
  navSectionsAriaLabel: "Разделы консоли",
  navOpenMenu: "Открыть меню навигации",
  renderErrorTitle: "Не удалось отобразить",
  renderErrorMessage:
    "Данные пришли не в том виде, которого ожидал этот экран, поэтому показать его не удалось. " +
    "Попробуйте ещё раз — если это повторяется, обновите страницу.",
  renderErrorRetryButton: "Повторить",
  navConversations: "Диалоги",
  navMyConversations: "Мои",
  navAllConversations: "Все диалоги",
  navWidgetAppearance: "Виджет на сайте",
  navInstallWidget: "Установка виджета",
  navOfflineAutoReply: "Автоответ офлайн",
  navCannedResponses: "Готовые ответы",
  navTags: "Метки",
  navPlatformSites: "Сайты платформы",
  navDeleteAccount: "Удалить аккаунт",
  navBilling: "Оплата",
  navOperatorsTeam: "Сотрудники",
  // `25-50`: was "Календарь" - the section is not a calendar view, it is the tenant's own bookings
  // (waiting queue, confirmed list, contacts, setup); "Записи" names what a reader actually finds
  // inside it. Confirmed against the author's own literal wording, not a typo to fix back.
  navSectionCalendar: "Записи",
  navSectionTeam: "Команда",
  navSectionChannels: "Каналы",
  navSectionAutomation: "Автоматизация",
  navSectionAdmin: "Администрирование",
  navCalendarServices: "Услуги",
  // `25-50`: was "Записи" - freed by the section label above taking that word, and a more accurate
  // name for what this screen actually is: the confirmed-bookings list, next to "В ожидании"
  // (navCalendarQueue) rather than a synonym for it.
  navCalendarBookings: "Утверждённые",
  navTeamChat: "Общение",
  navChannelsMax: "Бот MAX",
  navChannelsTelegram: "Бот Telegram",
  navChannelsVk: "Сообщество VK",
  navChannelsOther: "Другие каналы",
  navAutomationAiSuggestions: "ИИ-подсказки",
  navAutomationAiAutoReply: "ИИ-автоответ",
  navAccountProducts: "Продукты",
  navAccountDocuments: "Документы",
  navComingSoonLabel: "Скоро",
  navBuyableLabel: "Докупить",
  signOut: "Выйти",
  siteIdPrefix: "сайт",
  tenancySwitcherLabel: "Сайт",
  unnamedSite: "Без названия",
  userMenuAriaLabel: "Меню аккаунта",
  publicDemoNoticeSharedLogin:
    "Это публичная демо-консоль. Логин от неё опубликован на демо-страницах, так что войти сюда " +
    "может кто угодно — каждый разговор здесь написан незнакомцем, которому сказали, что вы можете " +
    "его прочитать. Не пишите сюда ничего настоящего.",

  themeToggleLabel: "Тема",
  themeToggleAriaLabel: "Цветовая тема",
  themeOptionSystem: "Как в системе",
  themeOptionLight: "Светлая",
  themeOptionDark: "Тёмная",

  appearanceSettingsTitle: "Внешний вид",
  appearanceSettingsDescription: "Как выглядит консоль на этом устройстве — Системная, Светлая или Тёмная.",

  agoSuffix: "назад",

  dateIntlLocale: "ru-RU",
  dateToday: "Сегодня",
  dateYesterday: "Вчера",
  elapsedJustNow: "только что",
  elapsedLessThanMinute: "меньше минуты",
  elapsedMinuteOne: "минута",
  elapsedMinuteOther: "минут",
  elapsedHourOne: "час",
  elapsedHourOther: "часов",
  elapsedDayOne: "день",
  elapsedDayOther: "дней",

  queueAssignedTitle: "Назначено мне",
  queueAssignedNote: "В реальном времени — новое назначение появляется без обновления страницы.",
  queueAssignedLoadingLabel: "Загрузка назначенных вам диалогов…",
  queueAssignedEmpty: "Пока ничего не назначено. Новые диалоги появляются здесь автоматически.",
  queueEmptyInstallPrompt:
    "Диалоги не появятся, пока скрипт не стоит на вашем сайте — до этого посетителям просто нечем вам написать.",
  queueEmptyInstallLink: "Как поставить скрипт",
  queueNewBadge: "Новое",
  queueUnreadMessageOne: "непрочитанное сообщение",
  queueUnreadMessageOther: "непрочитанных сообщений",
  queueConversationStartedTitle: "Диалог начат",
  queueOpenLabel: "Открыт",
  queueStartUnknown: "Время начала неизвестно",
  queueWaitingTitle: "Ожидание",
  queueWaitingNotePrefix: "Новые диалоги назначаются автоматически — нажмите, чтобы забрать диалог самостоятельно. Обновляется каждые",
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
  threadDeliveryScopeNote:
    "Статус доставки показывается только для сообщений, отправленных через подключённый канал " +
    "(SMS, Telegram и т. п.). Сообщения в чате на сайте статус доставки не показывают.",
  threadDeliveryDeliveredBadge: "Доставлено",
  threadDeliveryNotDeliveredBadge: "Не доставлено",
  threadDeliveryReasonPrefix: "Причина:",

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
    "как только посетитель начинает переписку, либо возьмите диалог из списка ожидания сами.",

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

  attachmentUploadGrantButton: "Разрешить загрузку файлов",
  attachmentUploadRevokeButton: "Запретить загрузку файлов",
  attachmentUploadGrantToggleError: "Не удалось изменить разрешение на загрузку. Попробуйте ещё раз.",
  attachmentUploadGrantedByOperatorNote: "Разрешено оператором",
  attachmentUploadGrantedByDefaultNote: "Разрешено по умолчанию для этого сайта",

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

  workspaceAwayGoAwayButton: "Отойти",
  workspaceAwayGoAwayDetail: "Новые диалоги перестанут направляться вам, пока вы не вернётесь. Уже назначенные вам диалоги это не затронет.",
  workspaceAwayComeBackButton: "Я на месте",
  workspaceAwayComeBackDetail: "Вернуться в сеть и снова получать новые диалоги.",
  workspaceAwayActiveNotice:
    "Вы отметили, что отошли. Новые диалоги вам не направляются, а посетитель, обратившийся, пока все " +
    "операторы отошли, получает автоматический ответ об отсутствии. Уже назначенные вам диалоги это не затронет.",
  workspaceAwayToggleError: "Не удалось обновить статус присутствия.",

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

  claimConversationButton: "Забрать",
  claimConversationSubmittingLabel: "Забираем…",
  claimConversationSubmitError: "Не удалось забрать диалог.",

  widgetLoadError: "Не удалось загрузить настройки виджета.",
  widgetSubmitError: "Не удалось сохранить настройки виджета.",
  widgetForbidden: "У вас нет права настраивать виджет этого сайта.",
  widgetDescription:
    "Изменения дойдут до браузера посетителя в течение суток - быстрее для нового посетителя или " +
    "для того, чья сессия уже подошла к своему продлению. Посетитель, у которого виджет уже открыт " +
    "на странице, не увидит новый цвет, положение или язык, пока не перезагрузит страницу.",
  widgetLoadingLabel: "Загрузка настроек виджета…",
  widgetPanelTitle: "Кнопка запуска",
  widgetRequireContactConsentLabel: "Требовать согласие перед сбором контактных данных",
  widgetRequireContactConsentDescription:
    "Пока включено, виджет не запишет телефон или адрес электронной почты, пока посетитель не примет ваш документ о согласии. Выключено — данные записываются без него, и опубликованный документ никого не связывает.",
  widgetColorFieldLabel: "Основной цвет (hex, необязательно)",
  widgetColorFieldDescription: "Оставьте пустым, чтобы использовать встроенный цвет виджета по умолчанию.",
  widgetColorPreviewTitle: "Предпросмотр",
  widgetColorValidation: "Цвет должен быть в формате hex, например #2F6FED.",
  widgetPositionFieldLabel: "Положение кнопки запуска",
  widgetPositionBottomRight: "Внизу справа",
  widgetPositionBottomLeft: "Внизу слева",
  widgetLanguageFieldLabel: "Язык виджета",
  widgetNoticePanelTitle: "Согласие на обработку персональных данных",
  widgetNoticeTextFieldLabel: "Текст уведомления (необязательно)",
  widgetNoticeTextFieldDescription:
    "Показывается посетителю до того, как он начнёт печатать. Это ваша собственная формулировка о том, " +
    "как вы обрабатываете то, что он напишет, - AGO не пишет её за вас, а если оставить поле пустым, " +
    "уведомление не показывается вовсе.",
  widgetNoticeTextPlaceholder: "Мы используем ваши сообщения, чтобы отвечать на ваши вопросы.",
  widgetNoticeUrlFieldLabel: "Ссылка на уведомление (необязательно)",
  widgetNoticeUrlFieldDescription: "Ссылка на вашу собственную страницу с политикой. Должна начинаться с https://.",
  widgetNoticeUrlValidation: "Ссылка должна быть абсолютным адресом https://.",
  widgetNoticeCurrentLabel: "Текущий текст",
  widgetNoticeUrlCurrentLabel: "Ссылка",
  widgetNoticeNotSetLabel: "Не задано - посетители не видят никакого уведомления.",
  widgetNoticeShowFully: "Показать полностью",
  widgetNoticeShowLess: "Скрыть",
  widgetNoticeEditButton: "Изменить",
  widgetContactConsentPanelTitle: "Согласие на сбор контактных данных",
  widgetAttractAttentionLabel: "Привлекать внимание, пока виджет закрыт",
  widgetAttractAttentionDescription:
    "Кнопка несколько раз слегка подрагивает, затем перестаёт - никогда, пока панель открыта, и никогда после того, как посетитель её закрыл. Всегда отключено, если браузер посетителя просит уменьшить анимацию, независимо от этой настройки.",
  widgetAutoOpenLabel: "Раскрывать виджет автоматически",
  widgetAutoOpenDescription:
    "Через указанную задержку панель откроется сама и покажет ваше приветствие - оно рисуется только в " +
    "браузере посетителя и никуда не отправляется, пока он сам не напишет вам. С нашей стороны ничего не " +
    "создаётся, пока этого не произошло.",
  widgetAutoOpenDelayFieldLabel: "Задержка перед открытием",
  widgetAutoOpenGreetingFieldLabel: "Текст приветствия",
  widgetAutoOpenGreetingFieldDescription:
    "Это ваша собственная первая фраза, показанная как будто от вашего имени - AGO не пишет её за вас, и " +
    "текста по умолчанию нет.",
  widgetAutoOpenGreetingPlaceholder: "Здравствуйте! Нужна помощь с выбором?",
  widgetAutoOpenGreetingRequiredValidation: "Для автораскрытия нужно приветствие - текста по умолчанию нет.",
  widgetAutoOpenDelay15: "15 секунд",
  widgetAutoOpenDelay30: "30 секунд",
  widgetAutoOpenDelay45: "45 секунд",
  widgetAutoOpenDelay60: "60 секунд",
  widgetAutoOpenDelay90: "90 секунд",
  widgetAutoOpenDelay120: "120 секунд",
  widgetBookingPanelTitle: "Бронирование (временно)",
  widgetAcceptUnverifiedPhoneLabel: "Пока принимать непроверенный номер телефона",
  widgetAcceptUnverifiedPhoneDescription:
    "Провайдер SMS/звонков для проверки телефона пока не подключён, и требование проверенного номера " +
    "сделало бы любое бронирование через чат невозможным. Пока это включено, бронирование завершается " +
    "с тем номером, который посетитель уже назвал в разговоре, - а если номера не было, шаг всё равно " +
    "показывается, но без требования подтвердить его, - без доказательства того, что по этому номеру " +
    "можно дозвониться. В записи всегда видно, какие бронирования были приняты таким образом. " +
    "Выключите этот параметр, как только появится настоящий провайдер проверки.",

  installForbidden: "У вас нет права просматривать данные для установки этого сайта.",
  installLoadError: "Не удалось загрузить данные для установки.",
  installDescription:
    "Вот что нужно вашему сайту, чтобы посетители могли писать вам в чат: ваш собственный ключ сайта " +
    "и адрес, на котором он настроен работать.",
  installLoadingLabel: "Загружаем данные для установки…",
  installKeyPanelTitle: "Ключ вашего сайта",
  installKeyPanelDescription:
    "Этот ключ показывает виджету чата, какому магазину он принадлежит. Он не секретный - как только " +
    "виджет появится на вашей странице, его сможет увидеть там кто угодно, - но на этом экране он " +
    "виден только вам.",
  installKeyCopyButton: "Скопировать ключ",
  installKeyCopiedLabel: "Скопировано в буфер обмена.",
  installOriginPanelTitle: "Адрес вашего сайта",
  installOriginPanelDescription:
    "Виджет работает только тогда, когда ваш сайт открыт именно по этому адресу. Если это не тот " +
    "адрес, на котором на самом деле работает ваш магазин, свяжитесь с нами до того, как выходить " +
    "в эфир.",
  installSnippetPanelTitle: "Добавьте чат на свой сайт",
  installSnippetPanelDescription:
    "Скопируйте эту строку и вставьте её на страницы вашего сайта — прямо перед закрывающим тегом " +
    "</body>. Это всё: кнопка чата появится в углу сама, а ваш ключ уже подставлен внутрь.",
  installSnippetCopyButton: "Скопировать код",
  installSnippetCopiedLabel: "Скопировано в буфер обмена.",

  installStatusPanelTitle: "Всё работает?",
  installStatusNotSeenYet:
    "Ваш скрипт ещё не подключался. Вставьте код ниже на свой сайт и вернитесь на эту страницу, " +
    "чтобы проверить снова.",
  installStatusSeenAndQuiet: "Виджет установлен и выходит на связь.",
  installStatusLastSeenLabel: "Последний раз виден",
  installStatusFirstSeenLabel: "Впервые увиден",
  installStatusRefusedPrefix: "Виджет установлен, но все запросы с адреса",
  installStatusRefusedSuffix:
    "отклоняются. Проверьте, что именно этот адрес указан в разделе «Адрес вашего сайта» ниже - чаще " +
    "всего причина в несовпадении www. и адреса без него.",
  installStatusNeverSeenButInUse:
    "Мы ещё не видели ваш виджет, но к вам уже приходят обращения через подключённый канал - всё в " +
    "порядке, здесь ничего исправлять не нужно.",

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

  assignmentPenaltyPanelTitle: "Штраф ожидания",
  assignmentPenaltyDescription:
    "Если ожидающий диалог никто не взял в течение этого числа секунд, он будет назначен принудительно наименее занятому онлайн-оператору, лимит нагрузки при этом не учитывается. Ожидающий клиент хуже, чем неравномерная нагрузка.",
  assignmentPenaltyFieldLabel: "Секунд до принудительного назначения",
  assignmentPenaltyLoadingLabel: "Загрузка штрафа ожидания…",
  assignmentPenaltyLoadError: "Не удалось загрузить штраф ожидания.",
  assignmentPenaltySubmitError: "Не удалось сохранить штраф ожидания.",
  assignmentPenaltyValidationRequired: "Укажите, сколько секунд ждать до принудительного назначения.",
  assignmentPenaltyValidationMustBePositive: "Штраф ожидания должен быть положительным целым числом секунд.",

  // `23-37`: DocumentsPage.
  documentsPageForbidden: "У вас нет права просматривать документы этого сайта.",
  documentsPageLoadError: "Не удалось загрузить документы сайта.",
  documentsPageLoadingLabel: "Загрузка документов...",
  documentsPageIntro: "Это документы, которые ваши посетители соглашаются принять.",
  documentsContactPanelTitle: "Согласие на сбор контактных данных",
  documentsMarketingPanelTitle: "Согласие на рассылку",
  documentsContactRequiredBadge: "Требуется перед сбором телефона или адреса электронной почты посетителя",
  documentsContactNotRequiredIntro: "Пока не требуется. Включите «Требовать согласие перед сбором контактных данных» на экране «",
  documentsContactNotRequiredOutro: "», иначе опубликованный документ никого не связывает.",
  documentsMarketingNeverRequiredNote: "Этот документ всегда необязателен - его принятие ничего не блокирует.",
  documentsCurrentVersionLabel: "Текущая версия",
  documentsNoVersionsYet: "Пока ничего не опубликовано.",
  documentsVersionsHeading: "Все опубликованные версии",
  documentsReadAsVisitorLink: "Прочитать как посетитель",
  documentsPublishFormTitleLabel: "Заголовок",
  documentsPublishFormTitlePlaceholder: "например, Согласие на обработку контактных данных",
  documentsPublishFormBodyLabel: "Текст",
  documentsPublishFormBodyPlaceholder: "Текст, который увидят и примут ваши посетители.",
  documentsPublishButton: "Опубликовать новую версию",
  documentsPublishingButton: "Публикация...",
  documentsPublishSuccessAlert: "Опубликовано.",
  documentsPublishError: "Не удалось опубликовать.",
  documentsPublishValidationTitleRequired: "Укажите заголовок.",
  documentsPublishValidationBodyRequired: "Текст не может быть пустым.",
  documentsAcceptancesToggleShow: "Показать, кто принял",
  documentsAcceptancesToggleHide: "Скрыть",
  documentsAcceptancesCardTitlePrefix: "Принявшие ",
  documentsAcceptancesLoadingLabel: "Загрузка списка...",
  documentsAcceptancesLoadError: "Не удалось загрузить, кто принял документ.",
  documentsAcceptancesEmpty: "Пока никто не принял этот документ.",
  documentsAcceptancesColumnSubject: "Посетитель",
  documentsAcceptancesColumnVersion: "Версия",
  documentsAcceptancesColumnAcceptedAt: "Принято",
  documentsAcceptancesPrivacyNote:
    "Здесь показаны: какой посетитель, какая версия и когда. Не показаны: IP-адрес и браузер - они хранятся в записи как доказательство, но не выводятся на этот экран.",

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
  tagsColumnActions: "Действия",
  tagsAddPanelTitle: "Добавить метку",

  tagsSectionTitle: "Метки",
  tagsNoneApplied: "Метки не применены.",
  tagsApplyError: "Не удалось применить метку.",
  tagsRemoveError: "Не удалось убрать метку.",
  tagsApplyLabel: "Применить метку",
  tagsApplyPlaceholder: "Выберите метку…",
  tagsApplyButton: "Применить",
  tagsRemoveButtonAriaPrefix: "Убрать метку",

  tagsAiAppliedMarker: "ИИ",
  tagsAiAppliedAriaPrefix: "Метка, применённая ИИ",

  workspaceTagFilterLabel: "Фильтр по метке",
  workspaceTagFilterAll: "Все метки",
  workspaceTagFilterClearButton: "Сбросить",

  channelIdentitiesSectionTitle: "Связанные каналы",
  channelIdentitiesLoadingLabel: "Загрузка связанных каналов…",
  channelIdentitiesLoadError: "Не удалось загрузить связанные каналы.",
  channelIdentitiesNone: "Каналы ещё не связаны.",
  channelIdentitiesLinkKindLabel: "Канал для связывания",
  channelIdentitiesLinkButton: "Сгенерировать код",
  channelIdentitiesRequestLinkError: "Не удалось сгенерировать код для связывания.",
  channelIdentitiesUnlinkButton: "Отвязать",
  channelIdentitiesUnlinkError: "Не удалось отвязать.",
  channelIdentitiesPreferredBadge: "Предпочитаемый",
  channelIdentitiesPreferButton: "Предпочесть",
  channelIdentitiesClearPreferenceButton: "Сбросить",
  channelIdentitiesPreferError: "Не удалось задать предпочитаемый канал.",
  channelIdentitiesCodeGeneratedPrefix: "Код сгенерирован для",

  contactDetailsSectionTitle: "Непроверенные контактные данные",
  contactDetailsCaption: "Записано оператором или отправлено самим посетителем - не проверено, если не указано иное.",
  contactDetailsLoadingLabel: "Загрузка контактных данных…",
  contactDetailsLoadError: "Не удалось загрузить контактные данные.",
  contactDetailsEmpty: "Контактные данные ещё не записаны.",
  contactDetailsKindPhone: "Телефон",
  contactDetailsKindEmail: "Электронная почта",
  contactDetailsKindName: "Имя",
  contactDetailsValuePlaceholder: "Номер телефона, email или другие данные",
  contactDetailsSourceOperator: "Оператор",
  contactDetailsSourceVisitor: "Посетитель",
  contactDetailsRevealButton: "Показать",
  contactDetailsRevealingButton: "Показ…",
  contactDetailsRevealError: "Не удалось показать контактные данные.",
  contactDetailsEditButton: "Изменить",
  contactDetailsSaveButton: "Сохранить",
  contactDetailsSavingButton: "Сохранение…",
  contactDetailsCancelButton: "Отмена",
  contactDetailsEditError: "Не удалось сохранить изменение.",
  contactDetailsConfirmButton: "Подтвердить",
  contactDetailsMarkInvalidButton: "Отметить как недействительный",
  contactDetailsAssessmentConfirmed: "Подтверждено",
  contactDetailsAssessmentInvalid: "Недействительно",
  contactDetailsAssessmentError: "Не удалось обновить статус.",

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
  searchWaitingNote: "В ожидании — заберите, чтобы открыть.",
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

  productsTitle: "Что предлагает AGO",
  productsDescription: "Все продукты платформы и то, что из них уже подключено этому рабочему пространству.",
  productsForbidden: "У вас нет прав на просмотр продуктов этого сайта.",

  productsTableCaption: "Продукты AGO и то, есть ли они у этого рабочего пространства",
  productsColumnWhatItDoes: "Что это даёт",
  productsColumnStatus: "В вашем пространстве",
  productsColumnNextStep: "Следующий шаг",

  productsStatusHeld: "Уже есть",
  productsStatusNotHeld: "Пока нет",
  productsContactNote: "Чтобы подключить, свяжитесь с AGO.",

  productsChatDescription: "Переписка с вашими клиентами - с сайта и из любого подключённого канала.",
  productsChatActionLabel: "Открыть переписки",

  productsCalendarDescription:
    "Позвольте клиентам записываться к вашим мастерам и ведите расписание прямо здесь.",
  productsCalendarActionLabel: "Открыть очередь записей",

  productsFaqDescription:
    "Отвечайте на частые вопросы автоматически - по базе знаний, которую вы сами наполняете, - " +
    "операторы включаются только там, где действительно нужен человек.",
  productsFaqActionLabel: "Открыть автоматические ответы",

  operatorsTeamTitle: "Команда",
  operatorsTeamDescription:
    "Все, кто здесь работает - пригласите коллегу, посмотрите, кто занимает место в тарифе, и уберите тех, кто " +
    "уже не с вами.",
  operatorsTeamForbidden: "У вас нет прав на управление командой этого сайта.",
  operatorsTeamLoadError: "Не удалось загрузить команду. Попробуйте перезагрузить страницу.",
  operatorsTeamLoadingLabel: "Загружаем команду…",

  operatorsTeamPanelTitle: "Кто здесь работает",
  operatorsTeamTableCaption: "Все операторы этого сайта",
  operatorsTeamNameColumn: "Имя",
  operatorsTeamEmailColumn: "Почта",
  operatorsTeamSeatColumn: "Место",
  operatorsTeamActionsColumn: "Действия",
  operatorsTeamSeatHeld: "Занимает место",
  operatorsTeamSeatNotHeld: "Без места",
  operatorsTeamSeatsSummaryLabel: "Занято мест:",

  operatorsTeamOverSeatsTitle: "Превышен лимит мест",
  operatorsTeamOverSeatsBody:
    "На этом сайте занято больше мест, чем позволяет текущий тариф - скорее всего, после понижения тарифа. Все " +
    "ниже по-прежнему работают; освободите место или повысьте лимит, когда будете готовы. " +
    "Занято:",

  operatorsTeamGrantSeatButton: "Выделить место",
  operatorsTeamRevokeSeatButton: "Забрать место",
  operatorsTeamSeatToggleError: "Не удалось изменить место. Попробуйте ещё раз.",

  operatorsTeamRemoveButton: "Удалить",
  operatorsTeamRemoveDialogTitle: "Удалить этого коллегу?",
  operatorsTeamRemoveDialogBody:
    "сразу же вернёт все назначенные на него обращения в очередь ожидания. История сохранится, но само удаление " +
    "отменить будет нельзя.",
  operatorsTeamRemoveConfirmButton: "Удалить",
  operatorsTeamRemoveError: "Не удалось удалить оператора. Попробуйте ещё раз.",

  operatorsTeamInviteButton: "Пригласить коллегу",
  operatorsTeamInviteDialogTitle: "Пригласить коллегу",
  operatorsTeamInviteCostBodyOperator: "Это займёт ещё одно место Оператора - на сайте станет",
  operatorsTeamInviteCostBodyAdmin: "Это займёт ещё одно место Администратора - на сайте станет",
  operatorsTeamInviteConfirmButton: "Отправить приглашение",
  operatorsTeamInviteSendingButton: "Отправляем…",
  operatorsTeamInviteAtLimitTitle: "Достигнут лимит мест",
  operatorsTeamInviteAtLimitBody:
    "Освободите место выше или повысьте лимит, прежде чем приглашать ещё одного коллегу - на " +
    "сайте уже занято",
  operatorsTeamInviteSubmitError: "Не удалось создать приглашение. Попробуйте ещё раз.",
  operatorsTeamInviteSuccessTitle: "Приглашение создано",
  operatorsTeamInviteSuccessBody: "Передайте эту ссылку коллеге - она показывается здесь только один раз.",
  operatorsTeamInviteLinkLabel: "Ссылка-приглашение",
  operatorsTeamInviteCopyButton: "Скопировать ссылку",
  operatorsTeamInviteCopiedLabel: "Скопировано в буфер обмена.",
  operatorsTeamInviteExpiresLabel: "Действует до",
  operatorsTeamInviteCloseButton: "Закрыть",

  operatorsTeamRoleColumn: "Роль",
  operatorsTeamRoleOperator: "Оператор",
  operatorsTeamRoleAdmin: "Администратор",

  operatorsTeamInviteRoleLabel: "Роль",
  operatorsTeamInviteRoleOperatorOption: "Оператор - отвечает на обращения",
  operatorsTeamInviteRoleAdminOption: "Администратор - управляет командой, не отвечает на обращения",

  operatorsTeamChangeRoleToAdminButton: "Сделать администратором",
  operatorsTeamChangeRoleToOperatorButton: "Сделать оператором",
  operatorsTeamChangeRoleDialogTitle: "Изменить роль этого коллеги?",
  operatorsTeamChangeRoleToAdminDialogBody:
    "сможет управлять командой - приглашать и удалять коллег, менять роли, настраивать сайт - и перестанет получать " +
    "новые обращения, если только за ним не закреплено место.",
  operatorsTeamChangeRoleToOperatorDialogBody:
    "больше не сможет управлять командой - приглашать и удалять коллег, менять роли, настраивать сайт.",
  operatorsTeamChangeRoleConfirmButton: "Изменить роль",
  operatorsTeamChangeRoleError: "Не удалось изменить роль коллеги. Попробуйте ещё раз.",

  teamChatTitle: "Общение",
  teamChatDescription: "Общайтесь с коллегами, не покидая консоль. Никто за пределами вашей команды этого не видит.",
  teamChatLoadingLabel: "Загружаем общение…",
  teamChatLoadError: "Не удалось загрузить чат команды. Попробуйте перезагрузить страницу.",
  teamChatRetryButton: "Повторить",
  teamChatEmptyState: "Здесь пока никто ничего не написал.",
  teamChatComposerPlaceholder: "Сообщение команде…",
  teamChatSendButton: "Отправить",
  teamChatSendingButton: "Отправляем…",
  teamChatSendError: "Не удалось отправить сообщение. Попробуйте ещё раз.",
  teamChatAdminBadge: "Владелец",
  teamChatUnnamedAuthor: "Коллега",
  teamChatRemovedPlaceholder: "Сообщение удалено",
  teamChatRemoveButton: "Удалить",
  teamChatRemoveDialogTitle: "Удалить это сообщение?",
  teamChatRemoveDialogBody:
    "Все в этом чате увидят на его месте «Сообщение удалено» вместо текста. Это действие нельзя отменить.",
  teamChatRemoveConfirmButton: "Удалить сообщение",
  teamChatRemoveError: "Не удалось удалить сообщение. Попробуйте ещё раз.",

  telegramChannelTitle: "Бот Telegram",
  telegramChannelDescription: "Подключите свой бот в Telegram, чтобы посетители могли писать ему, а ваша команда отвечала отсюда.",
  telegramChannelForbidden: "У вас нет прав на управление каналами этого сайта.",
  telegramChannelLoadError: "Не удалось проверить канал Telegram. Попробуйте перезагрузить страницу.",
  telegramChannelLoadingLabel: "Проверяем канал Telegram…",
  telegramChannelPanelTitle: "Бот Telegram",
  telegramChannelNotConnectedBody:
    "Вставьте токен бота, который выдал BotFather при создании бота. AGO проверит его в Telegram, прежде чем сохранить.",
  telegramChannelTokenFieldLabel: "Токен бота",
  telegramChannelTokenFieldDescription: "После сохранения больше нигде не показывается.",
  telegramChannelConnectButton: "Подключить",
  telegramChannelConnectingButton: "Подключаем…",
  telegramChannelConnectError: "Не удалось подключить бота. Попробуйте ещё раз.",
  telegramChannelConnectedSinceLabel: "Подключено с",
  telegramChannelVerifiedBadge: "Подключено",
  telegramChannelUnverifiedBadge: "Не отвечает",
  telegramChannelUnverifiedBody: "Telegram ответил:",
  telegramChannelUnreachableBadge: "Не удалось проверить",
  telegramChannelUnreachableBody: "AGO не удалось связаться с Telegram прямо сейчас. Это не значит, что токен неверный — попробуйте ещё раз через минуту.",
  telegramChannelCheckedAtLabel: "Проверено",
  telegramChannelDisconnectButton: "Отключить",
  telegramChannelDisconnectDialogTitle: "Отключить этого бота?",
  telegramChannelDisconnectDialogBody:
    "Бот сразу перестанет доставлять сообщения. Вы можете подключить его — или другого бота — снова в любой момент.",
  telegramChannelDisconnectConfirmButton: "Отключить",
  telegramChannelDisconnectError: "Не удалось отключить бота. Попробуйте ещё раз.",

  maxChannelTitle: "Бот MAX",
  maxChannelDescription: "Подключите свой бот в MAX, чтобы посетители могли писать ему, а ваша команда отвечала отсюда.",
  maxChannelForbidden: "У вас нет прав на управление каналами этого сайта.",
  maxChannelLoadError: "Не удалось проверить канал MAX. Попробуйте перезагрузить страницу.",
  maxChannelLoadingLabel: "Проверяем канал MAX…",
  maxChannelPanelTitle: "Бот MAX",
  maxChannelNotConnectedBody:
    "Вставьте токен бота, который выдал @MasterBot при создании бота в MAX. AGO проверит его в MAX, прежде чем сохранить.",
  maxChannelTokenFieldLabel: "Токен бота",
  maxChannelTokenFieldDescription: "После сохранения больше нигде не показывается.",
  maxChannelConnectButton: "Подключить",
  maxChannelConnectingButton: "Подключаем…",
  maxChannelConnectError: "Не удалось подключить бота. Попробуйте ещё раз.",
  maxChannelConnectedSinceLabel: "Подключено с",
  maxChannelConnectedBadge: "Подключено",
  maxChannelDisconnectButton: "Отключить",
  maxChannelDisconnectDialogTitle: "Отключить этого бота?",
  maxChannelDisconnectDialogBody:
    "Бот сразу перестанет доставлять сообщения. Вы можете подключить его — или другого бота — снова в любой момент.",
  maxChannelDisconnectConfirmButton: "Отключить",
  maxChannelDisconnectError: "Не удалось отключить бота. Попробуйте ещё раз.",

  vkChannelTitle: "Сообщество VK",
  vkChannelDescription: "Подключите своё сообщество VK, чтобы посетители могли писать ему, а ваша команда отвечала отсюда.",
  vkChannelForbidden: "У вас нет прав на управление каналами этого сайта.",
  vkChannelPanelTitle: "Сообщество VK",
  vkChannelNotConnectedBody:
    "Вставьте ключ доступа сообщества (Управление → Работа с API → Ключи доступа, с доступом к сообщениям). AGO проверит его в VK, прежде чем сохранить.",
  vkChannelTokenFieldLabel: "Ключ доступа сообщества",
  vkChannelTokenFieldDescription: "После сохранения больше нигде не показывается.",
  vkChannelConnectButton: "Подключить",
  vkChannelConnectingButton: "Подключаем…",
  vkChannelConnectError: "Не удалось подключить сообщество. Попробуйте ещё раз.",
  vkChannelAlreadyConnectedHint:
    "У этого сайта уже есть подключённое сообщество VK. Чтобы подключить другое, сначала нужно отключить текущее.",
  vkChannelConnectedSinceLabel: "Подключено с",
  vkChannelConnectedBadge: "Подключено",
  vkChannelSetupTitle: "Завершите настройку в VK",
  vkChannelSetupBody:
    "Вставьте эти значения в настройки Callback API вашего сообщества (Управление → Работа с API → Callback API), чтобы начать получать сообщения.",
  vkChannelCopyCallbackUrlButton: "Скопировать URL",
  vkChannelCallbackUrlCopiedLabel: "URL скопирован.",
  vkChannelCopyWebhookSecretButton: "Скопировать секретный ключ",
  vkChannelWebhookSecretCopiedLabel: "Секретный ключ скопирован.",
  vkChannelDisconnectButton: "Отключить",
  vkChannelDisconnectDialogTitle: "Отключить это сообщество?",
  vkChannelDisconnectDialogBody:
    "Сообщество сразу перестанет доставлять сообщения. Вы можете подключить его — или другое сообщество — снова в любой момент.",
  vkChannelDisconnectConfirmButton: "Отключить",
  vkChannelDisconnectError: "Не удалось отключить сообщество. Попробуйте ещё раз.",

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
  analyticsAverageDurationColumn: "Ср. длительность",
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

  analyticsLoadNoDataValue: "Нет данных",
  analyticsLoadIntervalNote:
    "«Удержано» считает диалог один раз, даже если этот оператор вёл его дважды (передан и возвращён). «Стандартные» и «Дополнительные» считают интервалы назначения, где тот же диалог учитывается дважды.",
  analyticsByOperatorLoadHeading: "Время ответа по нагрузке, по операторам",
  analyticsByOperatorLoadEmpty: "В этом периоде пока нет данных о назначениях.",

  analyticsByReferrerHeading: "По источникам перехода",
  analyticsReferrerColumn: "Источник",
  analyticsByReferrerEmpty: "В этом периоде нет диалогов.",
  analyticsDirectReferrerLabel: "Прямой переход",
  analyticsByCampaignHeading: "По рекламным кампаниям",
  analyticsCampaignColumn: "Кампания",
  analyticsByCampaignEmpty: "В этом периоде нет диалогов с меткой кампании.",
  analyticsTrafficSourceNote: "То, что сообщил браузер посетителя, - не факт, независимо проверенный AGO Chat.",

  analyticsPreviousPeriodLabel: "Предыдущий период:",
  analyticsComparisonNoChange: "без изменений",
  analyticsComparisonPointsSuffix: "п.п.",
  analyticsFractionOfLabel: "из",

  navMyNumbers: "Мои показатели",
  myNumbersPageDescription: "Ваши собственные цифры - те же, что видит ваш тенант, и вы видите их первыми.",
  myNumbersFromFieldLabel: "С (необязательно)",
  myNumbersToFieldLabel: "По (необязательно)",
  myNumbersApplyButton: "Применить",
  myNumbersRangeLabel: "Отчёт за период",
  myNumbersLoadingLabel: "Загрузка ваших показателей…",
  myNumbersEmpty: "В этом периоде у вас не было диалогов.",

  myNumbersConversationsHeading: "Ваши диалоги",

  myNumbersLoadHeading: "Ваша нагрузка",
  myNumbersLoadEmpty: "В этом периоде пока нет данных о назначениях.",
  myNumbersHeldColumn: "Всего вели",
  myNumbersStandardColumn: "Штатно",
  myNumbersAdditionalColumn: "Сверх нормы",

  myNumbersByLoadHeading: "Время ответа по вашей собственной одновременной нагрузке",
  myNumbersLoadBucketColumn: "Одновременная нагрузка",
  myNumbersIntervalsColumn: "Периодов",
  myNumbersRepliesColumn: "Ответов",
  myNumbersAverageFirstReplyColumn: "Сред. время до первого ответа",

  myNumbersConversionHeading: "Ваша конверсия",
  myNumbersConversionEmpty: "У того, что вы вели, пока нет отмеченного результата в этом периоде.",

  outcomeSectionTitle: "Результат",
  outcomeLoadingLabel: "Загрузка результата…",
  outcomeLoadError: "Не удалось загрузить результат этого диалога.",
  outcomeSetError: "Не удалось сохранить результат.",
  outcomeUnset: "Не указан",
  outcomeConverted: "Продажа состоялась",
  outcomeNotConverted: "Продажа не состоялась",
  outcomeFollowUpNeeded: "Нужен повторный контакт",
  outcomeNotAVerifiedSaleNote: "Указано оператором - не продажа, подтверждённая AGO Chat независимо.",

  navConversionReport: "Конверсия",
  conversionReportPageDescription: "Какую пользу бизнес получает от диалогов - по данным, которые указали операторы.",
  conversionReportNotAVerifiedSaleBanner:
    "Этот показатель построен на том, что указали операторы, а не на подтверждённой продаже или заказе - это реальное и полезное число, но это не то же самое, что «N% диалогов завершились подтверждённой продажей».",
  conversionReportFromFieldLabel: "С",
  conversionReportToFieldLabel: "По",
  conversionReportApplyButton: "Применить",
  conversionReportRangeLabel: "Отчёт за период",
  conversionReportLoadingLabel: "Загрузка отчёта о конверсии…",
  conversionReportEmpty: "В этом периоде нет диалогов.",
  conversionReportPresetThisMonth: "Этот месяц",
  conversionReportPresetLastMonth: "Прошлый месяц",
  conversionReportPresetLast30Days: "Последние 30 дней",
  conversionReportConvertedColumn: "Продажа состоялась",
  conversionReportNotConvertedColumn: "Продажа не состоялась",
  conversionReportFollowUpNeededColumn: "Нужен повторный контакт",
  conversionReportUnsetColumn: "Не указан",
  conversionReportRateColumn: "Конверсия",
  conversionReportNoDataValue: "—",
  conversionReportOverallRowLabel: "Весь сайт",
  conversionReportByOperatorHeading: "По операторам",
  conversionReportOperatorColumn: "Оператор",
  conversionReportByOperatorEmpty: "В этом периоде нет результатов, отнесённых к оператору.",

  navTagBreakdown: "Отчёт по меткам",
  tagBreakdownPageDescription: "О чём на самом деле эти диалоги - в разбивке по меткам.",
  tagBreakdownFromFieldLabel: "С",
  tagBreakdownToFieldLabel: "По",
  tagBreakdownApplyButton: "Применить",
  tagBreakdownRangeLabel: "Отчёт за период",
  tagBreakdownLoadingLabel: "Загрузка разбивки по меткам…",
  tagBreakdownEmpty: "В этом периоде нет диалогов.",
  tagBreakdownPresetThisMonth: "Этот месяц",
  tagBreakdownPresetLastMonth: "Прошлый месяц",
  tagBreakdownPresetLast30Days: "Последние 30 дней",
  tagBreakdownCoverageBanner: "С меткой",
  tagBreakdownCoverageUnknown: "В этом периоде нет диалогов, чтобы посчитать долю с метками.",
  tagBreakdownTagColumn: "Метка",
  tagBreakdownConversationCountColumn: "Диалогов",
  tagBreakdownMultiTagNote:
    "Диалог с несколькими метками учитывается в каждой из них, поэтому сумма по этому столбцу не " +
    "совпадёт с общим числом диалогов выше - так и должно быть, это не ошибка.",
  tagBreakdownConvertedColumn: "Продажа состоялась",
  tagBreakdownNotConvertedColumn: "Продажа не состоялась",
  tagBreakdownRateColumn: "Конверсия",
  tagBreakdownNoDataValue: "—",
  tagBreakdownByTagEmpty: "В этом периоде ни один диалог не помечен меткой.",

  navBookingFlow: "Запись через чат",
  bookingFlowPageDescription:
    "Сколько диалогов начали сценарий записи и сколько из этих сценариев были закрыты.",
  bookingFlowCaveat:
    "Закрытый сценарий - это не то же самое, что подтверждённая запись: посетитель мог прервать " +
    "сценарий, оператор мог закрыть диалог на середине шага, или сценарий мог завершиться отказом " +
    "от всех предложенных вариантов времени. Здесь считаются закрытые сценарии, а не оформленные " +
    "записи.",
  bookingFlowFromFieldLabel: "С (необязательно)",
  bookingFlowToFieldLabel: "По (необязательно)",
  bookingFlowApplyButton: "Показать",
  bookingFlowRangeLabel: "Период",
  bookingFlowForbiddenError: "У вас нет права просматривать этот отчёт для данного сайта.",
  bookingFlowInvalidRangeError: "Начало периода должно быть раньше его конца.",
  bookingFlowLoadError: "Не удалось загрузить отчёт.",
  bookingFlowLoadingLabel: "Загрузка отчёта…",
  bookingFlowStartedLabel: "Начато сценариев записи",
  bookingFlowClosedLabel: "Сценариев закрыто",
  bookingFlowEmpty: "В этом периоде сценарий записи не запускался.",

  navFaqAssistant: "ИИ-помощник по вопросам",
  faqPageDescription: "Зарегистрируйте модуль ИИ-помощника для этого сайта и напишите базу знаний, из которой он отвечает.",
  faqForbidden: "У вас нет прав на настройку ИИ-помощника этого сайта.",

  faqModuleLoadingLabel: "Загрузка настроек модуля…",
  faqModuleLoadError: "Не удалось загрузить настройки модуля.",
  faqModuleSubmitError: "Не удалось сохранить настройки модуля.",
  faqModulePanelTitle: "Регистрация модуля",
  faqModuleEnabledLabel: "Подключён",
  faqModuleNotEnabled: "Не подключён к этому аккаунту. Его добавляет AGO — напишите нам.",
  faqModuleTriggerWordsLabel: "Слова-триггеры",
  faqModuleDescription:
    "Регистрирует модуль, который отвечает на вопрос посетителя тем же способом, что и любой модуль " +
    "AGO Chat - по словам-триггерам, которые вводит посетитель, и адресу собственного сервиса модуля.",
  faqModuleKeyFieldLabel: "Ключ модуля",
  faqModuleKeyFieldDescription:
    "Короткий идентификатор модуля - «faq» подходит, если на этом сайте не зарегистрирован ещё один " +
    "такой же ИИ-модуль.",
  faqModuleKeyPlaceholder: "faq",
  faqTriggerWordsFieldLabel: "Слова-триггеры",
  faqTriggerWordsFieldDescription:
    "Что вводит посетитель, чтобы запустить этот модуль, через запятую - например, «/faq, /помощь».",
  faqTriggerWordsPlaceholder: "/faq, /помощь",
  faqEntryPointFieldLabel: "Адрес модуля",
  faqEntryPointFieldDescription: "Собственный сервис модуля - куда AGO Chat отправляет вопрос посетителя.",
  faqEntryPointPlaceholder: "https://faq.example.com",

  faqModuleKeyValidationRequired: "Ключ модуля не может быть пустым.",
  faqTriggerWordsValidationRequired: "Введите хотя бы одно слово-триггер.",
  faqEntryPointValidationRequired: "Введите адрес модуля.",
  faqEntryPointValidationInvalid: "Адрес модуля должен быть абсолютной ссылкой https://.",

  faqKnowledgeBasePanelTitle: "База знаний",
  faqKnowledgeBaseDescription:
    "Текст, из которого ИИ отвечает на вопросы. Достаточно нескольких абзацев - о правилах, часах " +
    "работы, стоимости доставки, о том, что реально спрашивают посетители.",
  faqKnowledgeBaseLoadingLabel: "Загрузка базы знаний…",
  faqKnowledgeBaseLoadError: "Не удалось загрузить базу знаний.",
  faqKnowledgeBaseSubmitError: "Не удалось сохранить базу знаний.",
  faqKnowledgeBaseTextFieldLabel: "Текст базы знаний",
  faqKnowledgeBaseTextPlaceholder:
    "Наши условия возврата...\nМы работаем с понедельника по пятницу, с 9 до 18...\nСтоимость доставки...",
  faqKnowledgeBaseUpdatedAtPrefix: "Последнее сохранение",
  faqKnowledgeBaseNeverSaved: "Ещё не сохранялось.",
  faqKnowledgeBaseNotConfigured:
    "Бэкенд ИИ-помощника пока не настроен для этого окружения, поэтому редактировать базу знаний " +
    "здесь нельзя.",

  // --- `22-06`: AGO Calendar’s console screens - see `strings.ts` for the full note. ---
  navCalendarQueue: "В ожидании",
  navCalendarSetup: "Настройка",
  navCalendarWorkers: "Мастера",
  navCalendarAvailability: "Расписание",
  navCalendarContacts: "Клиенты",
  navCalendarPhoneReveals: "Показы телефонов",
  navCalendarCustomerMerges: "Объединения",
  calendarLoading: "Загрузка…",
  calendarDeleteButton: "Удалить",
  calendarBackButton: "Назад",
  calendarRefreshButton: "Обновить",
  calendarActiveLabel: "Активен",
  calendarInactiveLabel: "Неактивен",
  calendarWorkerFieldLabel: "Мастер",
  calendarDayFieldLabel: "День",
  calendarOpensFieldLabel: "Открытие",
  calendarClosesFieldLabel: "Закрытие",
  calendarFromFieldLabel: "С",
  calendarToFieldLabel: "По",
  calendarHiddenContactLabel: "скрыто",
  calendarHiddenContactTooltip: "У вас нет права видеть контакты для этого арендатора.",
  calendarRevealPhoneButton: "Показать",
  calendarRevealingPhoneButton: "Показ…",
  calendarWeekdaySunday: "Воскресенье",
  calendarWeekdayMonday: "Понедельник",
  calendarWeekdayTuesday: "Вторник",
  calendarWeekdayWednesday: "Среда",
  calendarWeekdayThursday: "Четверг",
  calendarWeekdayFriday: "Пятница",
  calendarWeekdaySaturday: "Суббота",
  calendarPermissionDeniedError: "У вашей учётной записи оператора нет права на это действие в этом арендаторе.",
  calendarNetworkError: "Консоли не удалось связаться с AGO Calendar.",
  calendarQueueTitle: "Ожидающие подтверждения записи",
  calendarQueueDescription: "Всё здесь подтверждается само по себе к своему дедлайну, если вы не отклоните это первым. По дедлайну, ближайшие сначала.",
  calendarQueueEmpty: "Ничего не ожидает.",
  calendarQueueColumnWhen: "Когда",
  calendarQueueColumnCalendar: "Календарь",
  calendarQueueColumnPhone: "Телефон",
  calendarQueueColumnDeadline: "Дедлайн",
  calendarQueueColumnActions: "Действия",
  calendarQueueOverdueNote: " · просрочено - проверка дедлайнов не запущена",
  calendarRejectButton: "Отклонить",
  calendarNoShowButton: "Неявка",
  calendarSetupBookingAutomaticNote:
    "Запись появится в чат-виджете, уже установленном на вашем сайте, как только этому аккаунту предоставят модуль календаря — вставлять или менять на странице ничего не нужно.",
  calendarSetupOriginsTitle: "Разрешённые источники страницы",
  calendarSetupOriginsDescription: "Страница может встроить вашу форму записи, только если её источник указан здесь. Схема, хост и порт - без пути.",
  calendarSetupOriginsFieldLabel: "По одному источнику на строку",
  siteAddressPlaceholder: "https://your.site.ru",
  installOriginChangeHint: "Для изменения напишите в поддержку.",
  authSigningIn: "Входим…",
  authSigningOut: "Выходим…",
  calendarSetupSaveOriginsButton: "Сохранить источники",
  calendarSetupCalendarsTitle: "Календари",
  calendarPublishedLabel: "опубликован",
  calendarNotPublishedLabel: "не опубликован",
  calendarSetupCalendarNameLabel: "Название календаря",
  calendarSetupCalendarZoneLabel: "Часовой пояс",
  calendarSetupCalendarPublishedLabel: "Опубликован",
  calendarSetupAddCalendarButton: "Добавить календарь",
  calendarCalendarsColumnHours: "Часы работы",
  calendarCalendarsColumnActions: "Действия",
  calendarCalendarsEmpty: "Календарей пока нет.",
  calendarEditCalendarTitle: "Изменить календарь",
  calendarNewCalendarTitle: "Новый календарь",
  calendarSetupServicesTitle: "Услуги",
  calendarSetupServiceMinutesSuffix: " мин",
  calendarSetupServiceNameLabel: "Название услуги",
  calendarSetupServiceDurationLabel: "Длительность (минуты)",
  calendarSetupAddServiceButton: "Добавить услугу",
  calendarSetupServicePriceLabel: "Цена (₽)",
  calendarSetupServicePricePlaceholder: "Цена не указана",
  calendarSetupServicePriceFromLabel: "Цена «от» (зависит от мастера или объёма работы)",
  calendarSetupServiceDescriptionLabel: "Описание",
  calendarServicesColumnName: "Название",
  calendarServicesColumnDuration: "Длительность",
  calendarServicesColumnPrice: "Цена",
  calendarServicesColumnDescription: "Описание",
  calendarServicesEmpty: "Услуг пока нет.",
  calendarNewServiceTitle: "Новая услуга",
  calendarSetupWorkingHoursTitle: "Рабочие часы",
  calendarSetupWorkingHoursDescription: 
    "Настенные часы в собственном часовом поясе календаря - «мы открываемся в девять», а не момент " +
    "времени. Смена, переходящая через полночь, - это два правила на два дня.",
  calendarSetupNoWorkersNote: "Сначала добавьте мастера - рабочие часы принадлежат мастеру на календаре.",
  calendarSetupAddWorkingHoursButton: "Добавить рабочие часы",
  calendarSetupWorkerNotOnCalendarNote: "Этот мастер ещё не на календаре, поэтому часов для него нет.",

  calendarReadinessTitle: "Может ли клиент записаться прямо сейчас?",
  calendarReadinessNoCalendarLabel: "Календаря пока нет",
  calendarReadinessBookableLabel: "Можно записаться",
  calendarReadinessNotBookableLabel: "Нельзя записаться",
  calendarReadinessMetLabel: "Готово",
  calendarReadinessUnmetLabel: "Не хватает",
  calendarReadinessFixItLink: "Исправить",
  calendarReadinessViewSlotsLink: "Посмотреть слоты",
  calendarReadinessCalendarPublishedLabel: "Календарь опубликован",
  calendarReadinessWorkerOnCalendarLabel: "На календаре есть активный мастер",
  calendarReadinessServiceOfferedLabel: "Этот мастер оказывает услугу",
  calendarReadinessWorkingHoursConfiguredLabel: "У этого мастера заданы рабочие часы или циклический график",
  calendarReadinessScheduleSavedLabel: "У этого мастера сохранён график",
  calendarReadinessSlotsMaterializedLabel: "Слоты сгенерированы в пределах горизонта",

  calendarWorkersTitle: "Мастера",
  calendarEditButton: "Изменить",
  calendarScheduleButton: "Расписание",
  calendarSlotsLinkLabel: "Слоты",
  calendarRecutLinkLabel: "Пересчёт",
  calendarAddWorkerButton: "Добавить мастера",
  calendarWorkersNoCalendarIntro: "Сначала добавьте календарь на экране «",
  calendarWorkersNoCalendarReason: "» - у мастера ровно один.",
  calendarNewWorkerTitle: "Новый мастер",
  calendarEditWorkerTitle: "Изменить мастера",
  calendarViewSlotsLinkLabel: "Смотреть слоты",
  calendarWorkersDeleteConfirmPrefix: "Удалить ",
  calendarWorkersDeleteConfirmSuffix: 
    "? Это работает только для мастера, которого никогда не бронировали - если есть ожидающий, " +
    "подтверждённый визит или неявка, будет отказано, и консоль покажет собственную причину сервера.",
  calendarLastNameFieldLabel: "Фамилия",
  calendarFirstNameFieldLabel: "Имя",
  calendarMiddleNameFieldLabel: "Отчество",
  calendarDisplayNameFieldLabel: "Отображаемое имя",
  calendarDisplayNameCustomNote: "Задано вручную - изменение фамилии или имени больше не изменит его снова.",
  calendarDisplayNameDerivedNote: "Формируется из имени и фамилии, пока вы его не измените.",
  calendarCalendarFieldLabel: "Календарь",
  calendarServicesPerformedLegend: "Выполняемые услуги",
  calendarWorkerCardNoCalendarNote: "Сначала добавьте календарь - у мастера ровно один.",
  calendarWorkersEmpty: "Мастеров пока нет.",
  calendarWorkersColumnName: "Имя",
  calendarWorkersColumnActive: "Активен",
  calendarWorkersColumnCreated: "Создан",
  calendarWorkersColumnUpdated: "Обновлён",
  calendarWorkersColumnActions: "Действия",
  calendarBackfilledNameTooltip: "Заполнено из старой записи - нужно указать настоящее имя",
  calendarNeedsCorrectionLabel: "(нужно исправить)",
  calendarScheduleSectionTitle: "Расписание",
  calendarScheduleEmptyNote: "Расписания пока нет - этот мастер ничего не материализует, пока оно не сохранено.",
  calendarTemplateFieldLabel: "Шаблон",
  calendarWeeklyTemplateOption: "Недельный (обычная неделя)",
  calendarCycleTemplateOption: "Цикл (N дней работы, M дней отдыха)",
  calendarSwitchingToWeeklyNote: "Переключение на «Недельный» очистит настройки цикла при сохранении. Уже материализованные дни в любом случае не затрагиваются.",
  calendarCycleAnchorFieldLabel: "Дата привязки (первый рабочий день)",
  calendarCycleWorkingDaysFieldLabel: "Рабочих дней",
  calendarCycleRestDaysFieldLabel: "Выходных дней",
  calendarCycleShiftPatternNote: 
    "«2 через 2» - это 2 рабочих / 2 выходных дня. «Сутки через трое» - это 1 рабочий / 3 выходных " +
    "дня, плюс часы ниже - это не 24-часовое окно.",
  calendarWeeklyHoursIntro: "Недельные часы задаются в форме рабочих часов на экране «",
  calendarWeeklyHoursReason: "», по дням недели.",
  calendarSlotLengthFieldLabel: "Длина слота (минуты)",
  calendarSlotLengthNote: "Услуга длиннее этого займёт больше одного слота, забронированных вместе как одна запись.",
  calendarBufferFieldLabel: "Перерыв между слотами (минуты)",
  calendarBufferCountsTowardDurationLabel: "Перерывы внутри длинной записи считаются рабочим временем",
  calendarArithmeticExamplePrefix: "При таких числах: услуга ",
  calendarArithmeticExampleUnitSuffix: " мин займёт ",
  calendarSlotWordOne: "слот",
  calendarSlotWordFew: "слота",
  calendarSlotWordMany: "слотов",
  calendarHorizonFieldLabel: "Горизонт (дней вперёд, поддерживаемых сгенерированными)",
  calendarHorizonCapPrefix: "Ограничено ",
  calendarHorizonCapSuffix: " днями.",
  calendarMaterializeFromFieldLabel: "Не генерировать раньше",
  calendarMaterializeFromCannotMoveEarlierPrefix: " (нельзя сдвинуть раньше, чем ",
  calendarMaterializeFromCannotMoveEarlierSuffix: ")",
  calendarScheduleRecutNotePrefix: "Нужно исправить дни, уже нарезанные по старому шаблону? ",
  calendarScheduleRecutLinkLabel: "Пересчитайте расписание",
  calendarScheduleRecutNoteSuffix: " вместо переноса этой даты - там видно, что будет удалено, прежде чем это произойдёт.",
  calendarCreateScheduleButton: "Создать расписание",
  calendarSaveScheduleButton: "Сохранить расписание",
  calendarSlotsHeadingPrefix: "Слоты — ",
  calendarSlotsHeadingSuffix: "",
  calendarSlotsHeadingFallback: "Слоты",
  calendarSlotsDescription: "Что реально произвело расписание этого мастера - свободно, удержано, забронировано, отменено, неявка или намеренная блокировка.",
  calendarSlotsTimezoneNotePrefix: " Время указано по местному поясу ",
  calendarSlotsTimezoneNoteSuffix: ".",
  calendarSlotsEmpty: "В этом диапазоне нет слотов.",
  calendarSlotsColumnDate: "Дата",
  calendarSlotsColumnWeekday: "День недели",
  calendarSlotsColumnTime: "Время",
  calendarSlotsColumnStatus: "Статус",
  calendarSlotsColumnService: "Услуга",
  calendarSlotsColumnCustomer: "Клиент",
  calendarSlotsColumnPhone: "Телефон",
  calendarSlotStatusAvailable: "Свободен",
  calendarSlotStatusPendingConfirmation: "Ожидает подтверждения",
  calendarSlotStatusBooked: "Забронирован",
  calendarSlotStatusCancelled: "Отменён",
  calendarSlotStatusNoShow: "Неявка",
  calendarSlotStatusBlocked: "Заблокирован",
  calendarRecutTitle: "Пересчёт расписания",
  calendarRecutDescription: 
    "Сдвигает курсор материализации этого мастера назад к уже нарезанной дате и заново создаёт " +
    "каждый день между ними по текущему шаблону. Это удаляет свободные слоты и для любой записи, " +
    "которую вы решите отменить, отменяет её через обычный сценарий отмены - клиенту сообщается, а " +
    "собственная строка записи сохраняется как отменённая, а не удаляется.",
  calendarRecutFromFieldLabel: "Пересчитать с",
  calendarPreviewButton: "Предпросмотр",
  calendarRecutDoneTitle: "Готово",
  calendarRecutSummaryDaysRecutSuffix: " дн. пересчитано, ",
  calendarRecutSummaryDaysLeftSuffix: " дн. оставлено без изменений, так как в них сохранённая запись. ",
  calendarRecutSummarySlotsDeletedSuffix: " свободных слотов удалено, ",
  calendarRecutSummarySlotsInsertedSuffix: " добавлено, ",
  calendarRecutSummaryBookingsCancelledSuffix: " записей отменено.",
  calendarRecutLeftInOldGridPrefix: "Оставлено в старой сетке: ",
  calendarRecutLeftInOldGridSuffix: ".",
  calendarRecutNothingGeneratedNote: "В этом диапазоне ещё ничего не сгенерировано - пересчёт просто нарежет его заново.",
  calendarRecutDayKeptNote: " (останется без изменений)",
  calendarRecutDaySlotsToDeleteSuffix: " свободных слотов будет удалено, если этот день пересчитать.",
  calendarRecutNoBookingsNote: "В этот день записей нет.",
  calendarReviewAndConfirmButton: "Просмотреть и подтвердить",
  calendarRecutChooseDecisionNote: "Выберите «отменить» или «оставить» для каждой записи выше, прежде чем продолжить.",
  calendarRecutConfirmTitle: "Подтвердить пересчёт",
  calendarRecutConfirmPrefix: "Это очистит и заново создаст ",
  calendarRecutConfirmDaysSuffix: " дн., удалив ",
  calendarRecutConfirmSlotsSuffix: " своб. слотов и отменив ",
  calendarRecutConfirmBookingsSuffix: " записей. ",
  calendarRecutConfirmSkippedSuffix: " дн. останутся точно такими же, потому что в них запись, которую вы решили оставить, или неявка, по которой нельзя принять решение.",
  calendarRecutCannotBeUndoneNote: "Это нельзя отменить с этого экрана.",
  calendarConfirmRecutButton: "Подтвердить пересчёт",
  calendarCancelDecisionLabel: "Отменить",
  calendarKeepDecisionLabel: "Оставить",
  calendarAlreadyNoShowNote: "Уже произошло как неявка - нельзя отменить, этот день сохраняется.",
  calendarAvailabilityNoWorkersNote: "Ни один мастер ещё не на календаре, поэтому редактировать дни нельзя.",
  calendarCloseDayTitle: "Закрыть день",
  calendarCloseDayDescription: "Удаляет все свободные слоты в этот день и оставляет вместо них одну блокирующую строку, чтобы следующий запуск материализации молча не заполнил его снова.",
  calendarCloseDayButton: "Закрыть день",
  calendarCloseDayDoneMessage: "День закрыт.",
  calendarChangeDayHoursTitle: "Изменить часы дня",
  calendarChangeDayHoursDescription: "Заново создаёт весь день между новыми настенными часами, чтобы вручную отредактированный день имел ту же форму - включая перерыв - что и сгенерированный.",
  calendarApplyNewHoursButton: "Применить новые часы",
  calendarChangeDayHoursDoneMessage: "Часы этого дня изменены.",
  calendarContactsTitle: "Клиенты",
  calendarContactsDescription: "Каждый клиент, который когда-либо бронировал у этого арендатора.",
  calendarContactsEmpty: "Клиентов пока нет.",
  calendarContactsColumnPhone: "Телефон",
  calendarContactsColumnName: "Имя",
  calendarContactsColumnNotes: "Заметки",
  calendarContactsColumnNoShows: "Неявки",
  calendarContactsColumnFirstSeen: "Впервые замечен",
  calendarContactsColumnLastSeen: "Последний раз замечен",
  calendarNotRecordedLabel: "не указано",
  calendarContactsColumnPhoneVerified: "Подтверждён кодом",
  calendarContactsColumnPhoneConfirmed: "Подтверждён оператором",
  calendarContactsVerifiedLabel: "Подтверждён",
  calendarContactsNotVerifiedLabel: "Не подтверждён",
  calendarContactsConfirmedLabel: "Прозвонен",
  calendarContactsNotConfirmedLabel: "Не прозвонен",

  calendarContactsColumnDuplicate: "Дубликат",
  calendarContactsDuplicateHint: "Тот же телефон, что и у другого клиента",
  calendarContactsMergeButton: "Объединить",

  calendarMergeDialogTitle: "Объединение двух карточек клиента",
  calendarMergeDialogLoading: "Загружаем историю записей обеих карточек…",
  calendarMergeDialogIrreversibleWarning:
    "Это действие необратимо. Все записи ниже будут принадлежать одной карточке, а вторая " +
    "исчезнет из списка контактов.",
  calendarMergeDialogSurvivorBadge: "Останется",
  calendarMergeDialogAbsorbedBadge: "Будет объединена",
  calendarMergeDialogBookingsHeading: "Записи",
  calendarMergeDialogNoBookings: "Записей нет.",
  calendarMergeDialogNoShowCountLabel: "Неявок",
  calendarMergeDialogConfirmButton: "Объединить безвозвратно",
  calendarMergeDialogConfirmingLabel: "Объединяем…",
  calendarMergeDialogCancelButton: "Отмена",
  calendarMergeDoneBookingsMovedLabel: "Перенесено записей",
  calendarStatusPendingConfirmation: "Ждёт подтверждения",
  calendarStatusBooked: "Забронировано",
  calendarStatusCancelled: "Отменено",
  calendarStatusNoShow: "Неявка",

  calendarBookingsDescription: "Подтверждённые записи по дням и мастерам.",
  calendarBookingsEmpty: "На этот период пока ничего не записано.",
  calendarBookingsColumnWhen: "Время",
  calendarBookingsColumnService: "Услуга",
  calendarBookingsColumnCustomer: "Клиент",
  calendarBookingsColumnPhone: "Телефон",
  calendarBookingsCountLabel: "Записей",
  calendarBookingsForbidden: "У вас нет прав на просмотр подтверждённых записей.",

  calendarQueueForbidden: "У вас нет прав на просмотр очереди бронирований календаря.",
  calendarElsewhereNotice: "Календарь у вас есть в другом магазине. Переключитесь с помощью селектора вверху страницы:",
  calendarSetupForbidden: "У вас нет прав на настройку календаря.",
  calendarWorkersForbidden: "У вас нет прав на управление мастерами календаря.",
  calendarWorkerSlotsForbidden: "У вас нет прав на просмотр слотов мастера.",
  calendarWorkerRecutForbidden: "У вас нет прав на перекраивание расписания мастера.",
  calendarAvailabilityForbidden: "У вас нет прав на изменение доступности календаря.",
  calendarContactsForbidden: "У вас нет прав на просмотр контактов календаря.",
  calendarPhoneRevealsForbidden: "У вас нет прав на просмотр журнала показов телефонов.",
  calendarCustomerMergesForbidden: "У вас нет прав на просмотр журнала объединений клиентов.",

  calendarPhoneRevealsDescription: "Каждый показ скрытого номера телефона клиента в этом арендаторе.",
  calendarPhoneRevealsEmpty: "Пока никто не показывал номер телефона.",
  calendarPhoneRevealsColumnWhen: "Когда",
  calendarPhoneRevealsColumnCustomer: "Клиент",
  calendarPhoneRevealsColumnOperator: "Оператор",
  calendarPhoneRevealsColumnSurface: "Экран",
  calendarPhoneRevealsLoadMoreButton: "Загрузить ещё",
  calendarPhoneRevealsLoadingMoreLabel: "Загрузка…",

  calendarCustomerMergesDescription: "Все объединения клиентов в этом магазине - кто, когда и какая карточка какую поглотила.",
  calendarCustomerMergesEmpty: "Пока никто не объединял карточки клиентов.",
  calendarCustomerMergesColumnWhen: "Когда",
  calendarCustomerMergesColumnSurvivor: "Осталась",
  calendarCustomerMergesColumnAbsorbed: "Объединена",
  calendarCustomerMergesColumnOperator: "Оператор",
  calendarCustomerMergesColumnBookingsMoved: "Перенесено записей",
  calendarCustomerMergesLoadMoreButton: "Загрузить ещё",
  calendarCustomerMergesLoadingMoreLabel: "Загрузка…",
  accessRefusalGrantHint: "Попросите владельца или администратора этого магазина выдать вам этот доступ.",
  calendarAbsentForTenant:
    "У этого магазина нет календаря. Он включается для магазина целиком, а не отдельным " +
    "оператором - уточните у AGO, как его подключить.",
  calendarNotConfigured:
    "Бэкенд календаря пока не настроен для этого окружения, поэтому этот экран здесь недоступен.",

  redeemInviteTitle: "Активировать код приглашения",
  redeemInviteDescription:
    "Введите код, который вам дали, чтобы стать оператором на этом сайте. Код действует один раз.",
  redeemInviteCodeLabel: "Код приглашения",
  redeemInviteValidationEmpty: "Введите код приглашения, который вам дали.",
  redeemInviteSubmit: "Активировать код",
  redeemInviteSubmitting: "Активируем…",
  redeemInviteSuccessMessage: "Готово. Переносим вас в очередь…",
  redeemInviteErrorNotFound:
    "Мы не нашли приглашение с таким кодом. Проверьте, что вы ввели его точно так, как вам его дали.",
  redeemInviteErrorExpired: "Срок действия этого приглашения истёк. Попросите пригласившего прислать новое.",
  redeemInviteErrorAlreadyRedeemed:
    "Этот код приглашения уже был использован. Если это были вы - просто войдите как обычно, " +
    "активировать больше нечего.",
  redeemInviteErrorAlreadyOperator: "У вас уже есть доступ к этому сайту - активировать нечего.",
  redeemInviteErrorSeatLimitReached:
    "На этом сайте достигнут лимит операторов по тарифу. Попросите администратора освободить место " +
    "или перейти на другой тариф, прежде чем вы сможете присоединиться.",
  redeemInviteErrorGeneric: "Не удалось активировать приглашение. Попробуйте ещё раз.",
  redeemInviteSetupOwnSiteLink: "Хотите вместо этого создать свой сайт?",

  invitePreviewTitle: "Вас пригласили",
  invitePreviewLoading: "Загружаем приглашение…",
  invitePreviewSiteLabel: "Сайт:",
  invitePreviewInvitedByLabel: "Пригласил(а):",
  invitePreviewExpiresLabel: "Ссылка действует до",
  invitePreviewContinueButton: "Продолжить",
  invitePreviewExpiredMessage: "Срок действия этого приглашения истёк. Попросите пригласившего прислать новое.",
  invitePreviewRedeemedMessage: "Это приглашение уже было использовано.",
  invitePreviewNotFoundMessage: "Мы не нашли приглашение по этой ссылке. Проверьте, что скопировали её полностью.",
  invitePreviewErrorGeneric: "Не удалось загрузить приглашение. Попробуйте ещё раз.",

  callbackCompletingSignIn: "Завершаем вход…",
  callbackSignInFailedTitle: "Не удалось войти",
  callbackOperatorLookupFailedTitle: "Вы вошли, но не удалось загрузить данные аккаунта",
  callbackOperatorLookupFailedDetailPrefix: "Запрос GET /api/v1/operators/me завершился ошибкой: ",
  callbackOperatorLookupFailedDetailSuffix:
    "Перезагрузите страницу, чтобы попробовать снова. Если это повторяется, значит API недоступен " +
    "или этому адресу пока не разрешено его вызывать - это не связано с вашим входом через Keycloak.",
  callbackUnknownError: "Неизвестная ошибка.",

  signupTitle: "Регистрация в AGO Chat",
  signupDescription:
    "Создайте свой сайт и аккаунт оператора. Электронную почту и пароль вы укажете на " +
    "собственной странице регистрации Keycloak.",
  signupButton: "Зарегистрироваться",
  signupButtonRedirecting: "Открываем регистрацию…",
  signupErrorPrefix: "Не удалось открыть страницу регистрации: ",
  signupErrorGeneric: "Не удалось открыть страницу регистрации. Попробуйте ещё раз.",

  onboardingTitle: "Завершите настройку своего сайта",
  onboardingDescription:
    "Ваш аккаунт Keycloak подтверждён. Укажите отображаемое имя и единственный адрес сайта, " +
    "на котором будет установлен виджет.",
  onboardingSiteNameLabel: "Отображаемое имя сайта",
  onboardingSiteNameEmptyError: "Отображаемое имя сайта не может быть пустым.",
  onboardingOriginLabel: "Адрес для встраивания",
  onboardingOriginDescription:
    "Только схема, хост и порт - без пути, например https://shop.example.com.",
  onboardingOriginInvalidScheme: "Адрес для встраивания должен начинаться с http:// или https://.",
  onboardingOriginInvalidUrl: "Адрес для встраивания должен выглядеть как URL, например https://shop.example.com.",
  onboardingSubmit: "Завершить настройку",
  onboardingSubmitting: "Настраиваем…",
  onboardingGenericSubmitError: "Не удалось настроить ваш сайт. Попробуйте ещё раз.",
  onboardingPlatformOwnerAlertTitle: "Вы вошли как владелец платформы",
  onboardingPlatformOwnerAlertLinkLabel: "Перейти к управлению платформой",
  onboardingPlatformOwnerAlertBody:
    "Роль владельца платформы - это роль в realm Keycloak, а не место в каком-то одном сайте, и " +
    "это не изменится, что бы вы здесь ни сделали. Регистрация ниже дополнительно сделает этот " +
    "аккаунт оператором нового собственного сайта - обычное дело, если вы хотите вести свой " +
    "тенант на этом развёртывании, но отменить это потом уже нельзя.",
  onboardingRedeemInvitePrompt: "Вместо этого есть код приглашения?",
  onboardingRedeemInviteLinkLabel: "Активировать его здесь",
  policyPageLoading: "Загрузка…",
  policyPageNotFound: "Мы не нашли этот документ.",
  policyPageErrorGeneric: "Не удалось загрузить документ. Попробуйте ещё раз.",
  policyPagePublishedPrefix: "Опубликовано ",
  policyPageVersionSeparator: " - версия ",
  navDeviceStorage: "Данные на устройстве",
  deviceStorageTitle: "Что виджет сохраняет на устройстве посетителя",
  deviceStorageDescription:
    "Все факты, нужные вам для собственного уведомления о cookie или политики конфиденциальности - не готовое уведомление за вас.",
  deviceStorageForbidden: "У вас нет прав на просмотр этой страницы.",
  deviceStorageNotCookies:
    "Это не cookie-файлы. Виджет вообще не устанавливает cookie - всё ниже хранится в localStorage, " +
    "и аудит cookie на вашем сайте этого не найдёт. Если вы проверяли только cookie, вы упустили всё, " +
    "что перечислено на этой странице.",
  deviceStorageIntro:
    "Виджет хранит перечисленное ниже под ключами вида ago-chat:<ваш site key>:<ключ ниже>, полностью " +
    "в браузере посетителя. Ничто из этого не отправляется нам, кроме случаев, когда сам виджет " +
    "предъявляет это нашему серверу - на другие сайты это не попадает никогда. Используйте таблицу " +
    "ниже прямо в своём уведомлении - она написана для этого, а не для разработчика, читающего наш код.",
  deviceStorageEraseNote:
    "Это хранилище находится на устройстве посетителя, а не у нас - мы не можем удалить его по " +
    "запросу. Что именно очищает запись, указано в столбце «Срок хранения» для каждой строки; если " +
    "там ничего не очищает её, удалить запись может только сам посетитель, очистив данные сайта в браузере.",
  deviceStorageColumnKey: "Ключ",
  deviceStorageColumnHolds: "Что хранит",
  deviceStorageColumnWhy: "Зачем нужен",
  deviceStorageColumnLifetime: "Срок хранения",
  deviceStorageColumnSurvivesTabClose: "Сохраняется после закрытия вкладки",
  deviceStorageSurvivesTabCloseYes: "Да",

  deviceStorageVisitorTokenHolds: "Подписанный токен сессии (JWT), подтверждающий, что этот браузер принадлежит конкретному посетителю.",
  deviceStorageVisitorTokenWhy:
    "Передаётся при каждом подключении в реальном времени и при загрузке вложений, чтобы наш сервер " +
    "узнавал одного и того же посетителя при разных заходах на страницу.",
  deviceStorageVisitorTokenLifetime:
    "Выдаётся на 7 дней и автоматически продлевается, пока посетитель возвращается - поэтому у " +
    "возвращающегося посетителя токен фактически никогда не истекает. Если посетитель не возвращается, " +
    "ничто не удаляет сохранённое значение.",
  deviceStorageVisitorIdHolds: "Собственный идентификатор посетителя - постоянный id для этого человека, совпадающий с subject токена.",
  deviceStorageVisitorIdWhy:
    "Позволяет виджету узнать того же посетителя после перезагрузки страницы, не спрашивая наш " +
    "сервер заранее, поэтому вернувшийся посетитель продолжает свой диалог, а не начинает новый. Это " +
    "единственная строка на этой странице, которая идентифицирует человека, - остальные строки " +
    "это кэш настроек, а не сведения о посетителе.",
  deviceStorageVisitorIdLifetime:
    "Продлевается вместе с токеном выше; заменяется на новый идентификатор, только если наш сервер " +
    "отказывается продлевать сохранённый (он не продлевался слишком долго). В остальных случаях ничто его не удаляет.",
  deviceStorageWidgetColorHolds: "Акцентный цвет виджета, который вы настроили, если он задан.",
  deviceStorageWidgetColorWhy: "Позволяет виджету сразу отрисоваться в выбранном вами цвете при следующей загрузке страницы, до повторного запроса к нашему серверу.",
  deviceStorageWidgetColorLifetime:
    "Обновляется не реже раза в сутки для вернувшегося посетителя, и быстрее, если сессия выше сама " +
    "подошла к продлению; удаляется, как только вы отменяете цвет в консоли. Это кэш вашей настройки, " +
    "а не запись о посетителе.",
  deviceStorageWidgetPositionHolds: "Угол экрана, который вы настроили для виджета.",
  deviceStorageWidgetPositionWhy: "То же назначение, что и у акцентного цвета выше - кэш настройки отображения, обновляется вместе с сессией.",
  deviceStorageWidgetPositionLifetime: "Так же, как у акцентного цвета выше.",
  deviceStorageWidgetLocaleHolds: "Язык виджета, который вы настроили.",
  deviceStorageWidgetLocaleWhy: "То же назначение, что и у акцентного цвета выше.",
  deviceStorageWidgetLocaleLifetime: "Так же, как у акцентного цвета выше.",
  deviceStorageWidgetNoticeTextHolds: "Текст вашего собственного уведомления об обработке данных - ваши слова, а не текст виджета.",
  deviceStorageWidgetNoticeTextWhy: "Позволяет виджету показать ваше уведомление без повторного запроса, пока сессия закэширована.",
  deviceStorageWidgetNoticeTextLifetime: "Так же, как у акцентного цвета выше.",
  deviceStorageWidgetNoticeUrlHolds: "Ссылка на вашу политику конфиденциальности, рядом с текстом уведомления выше.",
  deviceStorageWidgetNoticeUrlWhy: "То же назначение, что и у текста уведомления выше.",
  deviceStorageWidgetNoticeUrlLifetime: "Так же, как у акцентного цвета выше.",
  deviceStorageEnabledModulesHolds: "Какие из ваших платных дополнений (например, онлайн-запись) включены для этого сайта.",
  deviceStorageEnabledModulesWhy: "Позволяет виджету показывать или скрывать точку входа дополнения, не спрашивая сервер при каждой перезагрузке.",
  deviceStorageEnabledModulesLifetime:
    "Обновляется не реже раза в день, а также при обновлении токена личности выше; полностью удаляется, если ни одно дополнение не включено.",
  deviceStorageConversationIdHolds: "Id диалога, который этот браузер вёл с вами последним.",
  deviceStorageConversationIdWhy: "Позволяет при перезагрузке продолжить тот же диалог, а не начинать новый.",
  deviceStorageConversationIdLifetime:
    "Заменяется, когда начинается более поздний диалог; удаляется, когда заменяется сам идентификатор " +
    "посетителя выше, потому что новый идентификатор не владеет старым диалогом. В остальных случаях ничто его не удаляет.",
  deviceStorageLastSequenceHolds:
    "Наибольший номер сообщения, который этот браузер видел для одного диалога - позиционная метка, никогда не текст сообщения.",
  deviceStorageLastSequenceWhy: "Позволяет при переподключении или перезагрузке запросить только пропущенное, а не весь диалог заново.",
  deviceStorageLastSequenceLifetime:
    "По одной записи на каждый диалог, который этот браузер когда-либо продолжал. Запись для того " +
    "диалога, который был текущим, удаляется при замене идентификатора посетителя выше; запись для " +
    "более раннего, уже вытесненного диалога иначе не удаляется.",
};
