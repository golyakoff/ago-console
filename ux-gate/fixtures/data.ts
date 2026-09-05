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
/** `23-22`: the team screen's own third row - active, but seat-less (`holds_seat: false`) and with
 * no `display_name`/`email` at all, the `adr/0104` shape a minted demo tenant's own operator carries.
 * Exercises the "no name, so the id itself" fallback and the `operatorsTeamSeatNotHeld` badge in the
 * same screenshot the two named rows already cover. */
export const UNSEATED_OPERATOR_ID = "dddddddd-5555-4555-8555-555555555555";

/** The conversation the gate opens on `/conversations/:id` - assigned to the seeded operator, so
 * `OperatorConnection.joinConversation` is a legitimate call (`operatorConnection.ts`'s own doc
 * comment: never call it for a `Waiting` row). */
export const OPEN_CONVERSATION_ID = "66666666-6666-4666-8666-666666666666";
export const WAITING_CONVERSATION_ID = "77777777-7777-4777-8777-777777777777";

const NOW = new Date("2026-09-01T09:00:00.000Z");

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

// `23-06`: days, not minutes - the install screen's own "how long" wording is measured in days for
// any tenant that has been live more than a few hours, and a `minutesAgo` call for a two-week-old
// timestamp would read strangely at this file's own call sites.
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
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

/** `23-24`: what a screen may override on top of the base seeded operator - just enough to draw a
 * muted nav entry / an `AccessRefusal` page in a run that otherwise stays the fully-permissioned
 * default every other screen in this gate relies on. Narrower than a whole replacement `permissions`
 * object passed ad hoc: the two fields this item's own muted treatment actually reads
 * (`hasPermission`/`enabledModules` in `consoleNav.ts`), nothing else a screen could accidentally
 * drift out of sync with the rest of `seededPermissions()`'s shape. */
export interface SeededPermissionsOverrides {
  permissions?: string[];
  enabledModules?: string[];
}

export function seededPermissions(overrides: SeededPermissionsOverrides = {}) {
  return {
    operatorId: OPERATOR_ID,
    siteId: SITE_ID,
    permissions: overrides.permissions ?? [
      "conversation:close",
      "conversation:erase",
      "attachment:delete",
      "site:configure",
      "site:erase",
      // `23-22`: without this, `operators-team` below would render `AccessRefusal` instead of the
      // team table for every screen in this gate's default run - the identical reasoning the six
      // permissions already here follow for their own screens.
      "site:manage_operators",
      // `22-06`/`adr/0093`: without this, the four calendar screens this gate opens
      // (`ux-gate/fixtures/screens.ts`) would refuse themselves before ever reaching their own
      // "render the data" assertions - the identical shape `site:configure` above already has for
      // the settings screens.
      "calendar:configure",
    ],
    // `23-24`: the tenant side of the calendar's own three-way gate (`consoleNav.ts`'s own
    // `buildTenantNavItems`) - defaults to holding the module, matching the base operator above
    // already holding `calendar:configure` (`enabledModules` is never even read on that branch, but
    // an operator who can configure a calendar their own tenant does not have would be an
    // inconsistent fixture to seed). A screen exercising the muted-calendar-entry state overrides
    // this explicitly to `["calendar"]` alongside a `permissions` list that omits
    // `calendar:configure` - see `screens.ts`'s own `admin-limited-permissions` entry.
    //
    // `23-25`: that same default is deliberately *mixed* from `ProductsPage`'s point of view -
    // `"calendar"` held, `"faq"` not - so the products screen exercises both the held and the
    // not-held row in one run rather than rendering a near-empty page. The two items agree on the
    // value; only `23-24` needed it to be overridable, so that form is kept.
    enabledModules: overrides.enabledModules ?? ["calendar"],
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

/** `23-22`: the team screen's own list - `GET /api/v1/sites/{siteId}/operators`'s wire body
 * (`GetOperatorTeamHandler`, `OperatorTeamResponseDto`). Three rows, deliberately: two named,
 * seat-holding operators and one unseated, unnamed one (`UNSEATED_OPERATOR_ID`'s own doc comment) -
 * so both `Badge` tones this screen uses (`operatorsTeamSeatHeld`/`operatorsTeamSeatNotHeld`) and
 * both name renderings (a real name, and the id-fallback) appear in the same screenshot. */
export function seededOperatorTeam() {
  return {
    operators: [
      // `11-16`'s own discipline, applied to a field this gate had not seeded before: every free-text
      // fixture value in this file is Cyrillic, emails included - a Cyrillic-domain address (real
      // under IDNA, and unremarkable for a Russian small business) rather than an ASCII one, so this
      // screen's own "no untranslated interface text" run has nothing incidentally Latin to flag
      // (found live: an ASCII `@example-shop.ru` address failed that assertion the first time this
      // screen ran).
      { operatorId: OPERATOR_ID, displayName: "Мария Кузнецова", email: "мария@кофейня.рф", holdsSeat: true },
      { operatorId: OTHER_OPERATOR_ID, displayName: "Иван Петров", email: "иван@кофейня.рф", holdsSeat: true },
      { operatorId: UNSEATED_OPERATOR_ID, displayName: null, email: null, holdsSeat: false },
    ],
  };
}

/** `23-22`: the same screen's other call - `GET .../operators/seat-assignment-summary`
 * (`GetSeatAssignmentSummaryHandler`, unchanged by this item). `seatLimit: 1` against the two held
 * seats `seededOperatorTeam` above seeds makes `overSeats: true`, so the default gate run exercises
 * `operatorsTeamOverSeatsBody`'s own banner without a second, dedicated screen. */
export function seededSeatAssignmentSummary() {
  return { heldSeats: 2, seatLimit: 1, overSeats: true };
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

/**
 * `23-06`: the install screen's own read. Default state is `SeenAndQuiet` - a genuinely configured
 * tenant, matching this file's own "the gate's seeded tenant is fully configured" baseline every other
 * `seeded*` function here already establishes. `installation-never-seen` (`screens.ts`) overrides this
 * to the `NotSeenYet` state instead - the one a brand-new tenant gets on day one, and the state this
 * item's own instruction says will not render unless a fixture is made to produce it.
 */
export function seededSiteInstallation(overrides: Partial<SeededSiteInstallation> = {}) {
  return {
    publicKey: "shop_7f3a_ux_gate",
    allowedOrigins: ["https://cafe-u-reki.example"],
    firstSeenAt: daysAgo(45),
    lastSeenAt: daysAgo(2),
    lastRefusedOrigin: null,
    lastRefusedOriginAt: null,
    usedRecently: true,
    state: "SeenAndQuiet" as const,
    ...overrides,
  };
}

export interface SeededSiteInstallation {
  publicKey: string;
  allowedOrigins: string[];
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  lastRefusedOrigin: string | null;
  lastRefusedOriginAt: string | null;
  usedRecently: boolean;
  state: "NotSeenYet" | "SeenAndQuiet" | "EveryRequestRefused" | "NeverSeenButInUse";
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
    // `23-17`: a real `load` on the seeded operator, the identical shape `seededOwnAnalytics` below
    // already uses for the same operator's own view - so the gate's overflow/contrast/untranslated-text
    // checks actually exercise the new Held/Standard/Additional columns and the operator-by-load-bucket
    // table, not an empty-state sentence.
    byOperator: [
      {
        operatorId: OPERATOR_ID,
        bucket: bucket({ conversationCount: 27 }),
        load: {
          conversationsHeld: 27,
          intervalsHeld: 29,
          standardIntervals: 24,
          additionalIntervals: 5,
          byLoad: [
            { bucketLabel: "1", intervalCount: 18, replyCount: 18, averageFirstReplySeconds: 40 },
            { bucketLabel: "2-3", intervalCount: 8, replyCount: 7, averageFirstReplySeconds: 95 },
            { bucketLabel: "4-5", intervalCount: 3, replyCount: 2, averageFirstReplySeconds: 180 },
          ],
        },
      },
    ],
    byReferrer: [{ referrerHost: "Direct", bucket: bucket({ conversationCount: 20 }) }],
    // `11-16`: a UTM campaign tag really can carry non-ASCII text (query values are not restricted to
    // Latin script), so this is real, plausible tenant-supplied data, not interface chrome - Cyrillic
    // here the same way every other free-text fixture in this file now is.
    byCampaign: [{ utmCampaign: "осенняя-акция", bucket: bucket({ conversationCount: 9 }) }],
  };
}

/**
 * `23-18`: `/analytics/me`'s own fixture - the seeded operator's own row, with real standard/
 * additional numbers and a real recorded outcome, so the gate's untranslated-Latin-text check has
 * every one of this new screen's sections (conversations, load, by-load buckets, conversion) actually
 * rendered rather than short-circuited into an empty-state sentence.
 */
export function seededOwnAnalytics() {
  return {
    from: "2026-08-02T00:00:00.000Z",
    to: "2026-09-01T00:00:00.000Z",
    bucket: { conversationCount: 27, averageFirstResponseSeconds: 88, averageDurationSeconds: 610, missedCount: 1 },
    load: {
      conversationsHeld: 27,
      intervalsHeld: 29,
      standardIntervals: 24,
      additionalIntervals: 5,
      byLoad: [
        { bucketLabel: "1", intervalCount: 18, replyCount: 18, averageFirstReplySeconds: 40 },
        { bucketLabel: "2-3", intervalCount: 8, replyCount: 7, averageFirstReplySeconds: 95 },
        { bucketLabel: "4-5", intervalCount: 3, replyCount: 2, averageFirstReplySeconds: 180 },
      ],
    },
    conversion: {
      convertedCount: 9,
      notConvertedCount: 4,
      followUpNeededCount: 2,
      unsetCount: 12,
      recordedCount: 13,
      conversionRate: 9 / 13,
    },
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

/**
 * `15-16` (`ago-root#397`): `GET /workers/{workerId}/slots` for `CalendarWorkerSlotsPage` - the same
 * seven-column table (`WorkerSlot`'s own field list: date, weekday, time, status, service, customer,
 * phone) `ago-calendar-console`'s own `WORKER_SLOTS` fixture built before this move, sized the same
 * way (six half-hour rows spanning one business day) so the table this gate opens is the real,
 * multi-row shape a full day's schedule looks like, not a one-row stand-in that would never exercise
 * this table's own overflow risk on a 375px viewport.
 *
 * Every third row is `Booked`, against the one seeded customer `seededCalendarContacts` already
 * knows (`CALENDAR_BOOKING_ID`, "Дана", `+79990000010`) - the identical customer, not a second one,
 * so this screen and `calendar-contacts` agree with each other the way this file's own header
 * promises every screen's fixture data will.
 */
export function seededCalendarWorkerSlots() {
  const localDate = "2026-09-07";
  const serviceId = "dddddddd-cccc-4ccc-8ccc-cccccccccccc";
  const customerId = "eeeeeeee-cccc-4ccc-8ccc-cccccccccccc";

  return [0, 1, 2, 3, 4, 5].map((i) => {
    const hour = String(9 + i).padStart(2, "0");
    const booked = i % 3 === 0;

    return {
      eventId: `ffffffff-cccc-4ccc-8ccc-${String(i).padStart(12, "0")}`,
      localDate,
      weekday: 1,
      startsAt: `${localDate}T${hour}:00:00+03:00`,
      endsAt: `${localDate}T${hour}:30:00+03:00`,
      status: booked ? "Booked" : "Available",
      serviceId: booked ? serviceId : null,
      serviceName: booked ? "Стрижка" : null,
      customerId: booked ? customerId : null,
      customerDisplayName: booked ? "Дана" : null,
      phone: booked ? "+79990000010" : null,
      bookingId: booked ? CALENDAR_BOOKING_ID : null,
    };
  });
}

/**
 * `23-23`: `GET /booking-readiness` for `CalendarSetupPage`/`CalendarWorkersPage`'s own
 * `BookingReadiness` panel.
 *
 * <b>Deliberately not a fully-bookable tenant.</b> A ready tenant renders almost nothing - every
 * precondition a single `Badge`, no link, no interesting layout. This fixture instead agrees with
 * `seededCalendarConfiguration()`'s own already-seeded state, which this gate's other screens already
 * render: the one worker offers no service (`serviceIds: []`) and the one calendar has no working
 * hours (`workingHours: []`). Reusing that story rather than inventing a second, contradictory one
 * means every screen this gate opens describes the same tenant - and it exercises the panel's real
 * rendering: two preconditions met (a plain `Badge`), four unmet (a `Badge` plus a `Link` to the
 * screen that fixes it), which is the shape a rendered-UX/i18n-completeness gate actually needs to
 * see to be checking anything.
 */
export function seededCalendarBookingReadiness() {
  return [
    {
      calendarId: CALENDAR_CALENDAR_ID,
      calendarName: "Основной",
      isBookable: false,
      preconditions: [
        { precondition: "CalendarPublished", isMet: true },
        { precondition: "WorkerOnCalendar", isMet: true },
        { precondition: "ServiceOffered", isMet: false },
        { precondition: "WorkingHoursConfigured", isMet: false },
        { precondition: "ScheduleSaved", isMet: false },
        { precondition: "SlotsMaterialized", isMet: false },
      ],
    },
  ];
}
