/**
 * The one seeded tenant this whole gate run pretends to be. Every screen's stub data (`apiStubs.ts`,
 * `hubMock.ts`) is built from these same ids, so a screenshot of `/admin` and a screenshot of
 * `/conversations/:id` agree with each other the way a real operator's session would - the point
 * made in `15-11`'s own scope: "seeded/stubbed data ... not whatever's in a database", but still one
 * coherent story rather than five unrelated fixtures.
 */

export const SITE_ID = "11111111-1111-4111-8111-111111111111";
// `11-16`: Cyrillic, not English - every free-text fixture value in this file is, so that any
// Latin-script text a screen still renders is by construction interface chrome, not data
// (`ux-gate/lib/i18nCompleteness.ts`'s own doc comment has the full reasoning).
export const SITE_NAME = "Кофейня «У реки» (тестовые данные ux-gate)";
export const OPERATOR_ID = "22222222-2222-4222-8222-222222222222";
export const OPERATOR_SUB = "33333333-3333-4333-8333-333333333333";
export const VISITOR_ID = "44444444-4444-4444-8444-444444444444";
export const OTHER_OPERATOR_ID = "55555555-5555-4555-8555-555555555555";

/** The conversation the gate opens on `/conversations/:id` - assigned to the seeded operator, so
 * `OperatorConnection.joinConversation` is a legitimate call (`operatorConnection.ts`'s own doc
 * comment: never call it for a `Waiting` row). */
export const OPEN_CONVERSATION_ID = "66666666-6666-4666-8666-666666666666";
export const WAITING_CONVERSATION_ID = "77777777-7777-4777-8777-777777777777";

const NOW = new Date("2026-09-01T09:00:00.000Z");

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

/** A short, realistic-looking exchange - long enough that the thread has real message bubbles on
 * both sides (the "closest to the two historical defects" surface `15-11`'s brief names), short
 * enough to fit one screenshot without scrolling on a laptop viewport. */
export const SEEDED_MESSAGES = [
  {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    sequence: 1,
    authorKind: "Visitor" as const,
    authorId: VISITOR_ID,
    body: "Здравствуйте, у вас есть овсяное молоко для флэт уайта?",
    createdAt: minutesAgo(14),
  },
  {
    id: "aaaaaaaa-0000-4000-8000-000000000002",
    sequence: 2,
    authorKind: "Operator" as const,
    authorId: OPERATOR_ID,
    body: "Да - овсяное, миндальное и соевое доступны без доплаты.",
    createdAt: minutesAgo(13),
  },
  {
    id: "aaaaaaaa-0000-4000-8000-000000000003",
    sequence: 3,
    authorKind: "Visitor" as const,
    authorId: VISITOR_ID,
    body: "Отлично, а вы работаете до восьми вечера по выходным?",
    createdAt: minutesAgo(9),
  },
  {
    id: "aaaaaaaa-0000-4000-8000-000000000004",
    sequence: 4,
    authorKind: "Operator" as const,
    authorId: OPERATOR_ID,
    body: "Да - с восьми утра до восьми вечера каждый день в этом месяце, включая праздники.",
    createdAt: minutesAgo(8),
  },
];

export function seededTenancies() {
  return { tenancies: [{ siteId: SITE_ID, siteName: SITE_NAME }] };
}

export function seededPermissions() {
  return {
    operatorId: OPERATOR_ID,
    siteId: SITE_ID,
    permissions: [
      "conversation:close",
      "conversation:erase",
      "attachment:delete",
      "site:configure",
      "site:erase",
      // `22-06`/`adr/0093`: without this, the four calendar screens this gate opens
      // (`ux-gate/fixtures/screens.ts`) would refuse themselves before ever reaching their own
      // "render the data" assertions - the identical shape `site:configure` above already has for
      // the settings screens.
      "calendar:configure",
    ],
    // `11-16`: `"Ru"` - this is the one field that actually switches the console's own string table
    // (`src/i18n/resolve.ts#parseConsoleLocale`, read by `OperatorShell.tsx`), so every screen this
    // gate opens (other than `/owner`, which reads the fixed `en` table on purpose) renders in
    // Russian for the fourth assertion to check.
    locale: "Ru",
  };
}

export function seededQueue() {
  return {
    waiting: [
      {
        conversationId: WAITING_CONVERSATION_ID,
        visitorId: "88888888-8888-4888-8888-888888888888",
        state: "Waiting" as const,
        createdAt: minutesAgo(4),
        operatorUnreadCount: 0,
      },
    ],
    assignedToMe: [
      {
        conversationId: OPEN_CONVERSATION_ID,
        visitorId: VISITOR_ID,
        state: "Assigned" as const,
        createdAt: minutesAgo(14),
        operatorUnreadCount: 0,
        operatorId: OPERATOR_ID,
      },
    ],
  };
}

export function seededAllConversations() {
  return {
    conversations: [
      ...seededQueue().assignedToMe,
      ...seededQueue().waiting,
      {
        conversationId: "99999999-9999-4999-8999-999999999999",
        visitorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        state: "Closed" as const,
        createdAt: minutesAgo(120),
        operatorUnreadCount: 0,
        operatorId: OTHER_OPERATOR_ID,
      },
    ],
    nextBeforeId: null,
  };
}

/** The **raw HTTP body** `GET /api/v1/owner/sites` returns - a plain `OwnerSitesPage`, not
 * `fetchOwnerSites`'s own `OwnerSitesOutcome` wrapper (`ownerApi.ts`'s own doc comment: the client
 * builds `{status, page}` itself from the HTTP status code plus this exact body; the wrapper is
 * never on the wire). Named for what it actually is after a stub earlier in this file's history sent
 * the client-side wrapper as the wire body and crashed `OwnerSitesPage` (this repo's component, not
 * the DTO) the same way the tags/canned-responses mismatch crashed `AdminConversationsPage` -
 * `apiStubs.ts` sends this function's return value directly, unwrapped. */
export function seededOwnerSitesPage() {
  return {
    sites: [
      {
        siteId: SITE_ID,
        name: SITE_NAME,
        tier: "free",
        createdAt: "2026-06-01T00:00:00.000Z",
        seatCount: 2,
        conversationCount: 148,
        recentMessageCount: 37,
        lastMessageAt: minutesAgo(8),
        attachmentBytes: 4_200_000,
      },
      {
        siteId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        name: "Вторая тестовая площадка",
        tier: "free",
        createdAt: null,
        seatCount: 1,
        conversationCount: 3,
        recentMessageCount: 0,
        lastMessageAt: null,
        attachmentBytes: 0,
      },
    ],
    nextBefore: null,
    recentWindowDays: 7,
  };
}

export function seededWidgetConfig() {
  return {
    primaryColorHex: "#565096",
    position: "BottomRight" as const,
    // `11-16`: `"Ru"` - the widget's *own* configured language, a tenant setting genuinely
    // independent of the console's own locale above (`WidgetConfigPage.tsx`'s `LOCALE_LABELS` are
    // deliberately endonyms in every console language, `4-06`/`11-13`'s settled call) - Cyrillic here
    // so the settings screen's own closed `<select>` shows "Русский", not "English", the same
    // "seed every fixture in Cyrillic" rule this file applies throughout.
    locale: "Ru" as const,
    noticeText: "Сообщения, отправленные здесь, обрабатывает служба поддержки «Кофейни У реки».",
    noticeUrl: "https://example.invalid/privacy",
  };
}

export function seededAnalytics() {
  const bucket = (overrides: Partial<{ conversationCount: number; averageFirstResponseSeconds: number | null; averageDurationSeconds: number | null; missedCount: number }> = {}) => ({
    conversationCount: 42,
    averageFirstResponseSeconds: 95,
    averageDurationSeconds: 640,
    missedCount: 2,
    ...overrides,
  });

  return {
    from: "2026-08-02T00:00:00.000Z",
    to: "2026-09-01T00:00:00.000Z",
    overall: bucket(),
    byChannel: [
      { channel: "Widget", bucket: bucket({ conversationCount: 30 }) },
      { channel: "WhatsApp", bucket: bucket({ conversationCount: 12 }) },
    ],
    byOperator: [{ operatorId: OPERATOR_ID, bucket: bucket({ conversationCount: 27 }) }],
    byReferrer: [{ referrerHost: "Direct", bucket: bucket({ conversationCount: 20 }) }],
    // `11-16`: a UTM campaign tag really can carry non-ASCII text (query values are not restricted to
    // Latin script), so this is real, plausible tenant-supplied data, not interface chrome - Cyrillic
    // here the same way every other free-text fixture in this file now is.
    byCampaign: [{ utmCampaign: "осенняя-акция", bucket: bucket({ conversationCount: 9 }) }],
  };
}

export function seededVisitorHistory() {
  return { hasChannelIdentity: false, conversations: [], nextBeforeId: null };
}

// --- `22-06`/`adr/0093`: AGO Calendar's own fixtures, for the four calendar screens this gate opens
// (`ux-gate/fixtures/screens.ts`'s own doc comment has the "why these four, not all six" reasoning).
// `Ago.Calendar.Api`'s own `/api/v1/console/*` shape (`src/api/calendarApi.ts`), scoped by the same
// seeded operator's token, never by a site id in the URL - so these need no `SITE_ID`-shaped constant
// of their own.

export const CALENDAR_CALENDAR_ID = "aaaaaaaa-cccc-4ccc-8ccc-cccccccccccc";
export const CALENDAR_WORKER_ID = "bbbbbbbb-cccc-4ccc-8ccc-cccccccccccc";
export const CALENDAR_BOOKING_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

export function seededCalendarPendingBookings() {
  return [
    {
      bookingId: CALENDAR_BOOKING_ID,
      calendarId: CALENDAR_CALENDAR_ID,
      workerId: CALENDAR_WORKER_ID,
      serviceId: "dddddddd-cccc-4ccc-8ccc-cccccccccccc",
      customerId: "eeeeeeee-cccc-4ccc-8ccc-cccccccccccc",
      startsAt: minutesAgo(-30),
      endsAt: minutesAgo(-15),
      localDate: "2026-09-01",
      confirmationDeadline: minutesAgo(-5),
      isOverdue: false,
      phone: "+79990000010",
    },
  ];
}

export function seededCalendarWorkers() {
  return [
    {
      workerId: CALENDAR_WORKER_ID,
      lastName: "Иванова",
      firstName: "Анна",
      middleName: "Петровна",
      displayName: "Иванова А. П.",
      displayNameIsCustom: false,
      isActive: true,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
  ];
}

export function seededCalendarConfiguration() {
  return {
    tenantName: SITE_NAME,
    publicKey: "shop_calendar_7f3a",
    allowedOrigins: ["https://tenant.example"],
    calendars: [
      {
        calendarId: CALENDAR_CALENDAR_ID,
        name: "Основной",
        timeZone: "Europe/Moscow",
        isPublished: true,
        workerIds: [CALENDAR_WORKER_ID],
        workingHours: [],
      },
    ],
    workers: [{ workerId: CALENDAR_WORKER_ID, displayName: "Иванова А. П.", isActive: true, serviceIds: [] }],
    services: [{ serviceId: "dddddddd-cccc-4ccc-8ccc-cccccccccccc", name: "Стрижка", durationMinutes: 45 }],
  };
}

export function seededCalendarContacts() {
  return [
    {
      customerId: "eeeeeeee-cccc-4ccc-8ccc-cccccccccccc",
      phone: "+79990000010",
      displayName: "Дана",
      notes: "Предпочитает вечер",
      noShowCount: 0,
      firstSeenAt: "2026-06-01T09:00:00.000Z",
      lastSeenAt: "2026-08-01T09:00:00.000Z",
    },
  ];
}
