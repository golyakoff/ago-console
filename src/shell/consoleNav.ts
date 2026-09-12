import type { ConsoleStrings } from "../i18n/strings.js";
import type { AppShellNavItem, AppShellNavSection } from "./AppShell.js";
import { hasAnyBookingActionPermission } from "../calendar/calendarPermissions.js";

/**
 * `13-07`/`adr/0063`/`4-06`(console): the tenant-scoped half of the console's navigation, shared
 * between `OperatorShell` (always builds it - nothing renders that shell without a resolved operator
 * seat) and `OwnerSitesPage`/`OwnerSiteDetailPage` (build it only when this identity also holds a
 * seat, the "orthogonal axes" case `adr/0063`/`12-05` argue for). Before `13-07`, `OwnerSitesPage`
 * offered a single "Back to the console" link instead of this structure, which is why a platform
 * owner who is also an operator lost the whole console nav the moment they clicked "Platform sites".
 *
 * "Мои" (the operator's own queue, `/`) is unconditional here on purpose, matching
 * `permissionGating.test.tsx`'s own "offers nothing gated while the answer is still in flight" case.
 *
 * `11-11`: takes `strings` explicitly rather than calling `useStrings()` itself - a plain function,
 * not a component, cannot call a hook. `OperatorShell` passes its own resolved `useStrings()`;
 * `OwnerSitesPage`/`OwnerSiteDetailPage` deliberately pass the console's built-in `en` table
 * regardless of any tenant's real locale (11-11's own settled design call: `/owner` is not scoped to
 * one tenant, so it never follows one's language, the identical reasoning that already keeps
 * `/onboarding`/`/signup`/`/callback` English).
 *
 * `permissionsKnown` is the one thing "hide while unknown" cannot decide for itself: `hasPermission`
 * collapses "denied" and "not yet known" into the identical `false` (`PermissionsContext`'s own doc
 * comment), which used to be harmless while every gated block below simply did not run while
 * unknown - it stays harmless here for the identical reason: every `isAdmin`-gated section below is
 * built from `hasPermission`, so while the first `GET /api/v1/operators/me` is still in flight this
 * function already renders the correct fail-closed shape (four sections: Диалоги, Аналитика,
 * Календарь omitted since `calendar:configure` also reads `false`, Команда with only the reserved
 * "Общение" place) - the same shape a genuinely permission-less operator gets, which is the safe
 * direction to guess wrong in for the second or so this answer is in flight. Defaults to `true`
 * because two of this function's three call sites (`OwnerSitesPage`, `OwnerSiteDetailPage`) already
 * only invoke it once their own `siteId` has resolved, which is the same "not yet known" fact
 * resolving at the same moment - only `OperatorShell` calls this before that answer can be assumed,
 * so only it passes the real value.
 *
 * ## `23-31`/`adr/0129`: the muting rule this replaces
 *
 * `23-24` decided (`docs/design/decisions.md` §10) that an entry a colleague at this tenant could
 * grant is drawn **muted**, not hidden, so "you cannot do this" and "nobody granted you this" render
 * differently. `adr/0129` records why that rule is now **replaced**: muted means *"this identity
 * could obtain the thing itself"*, and nothing gated on `site:configure`/`site:erase`/
 * `site:manage_operators` below is self-obtainable that way - a colleague grants those, which is
 * exactly the case the new rule stops muting. Every one of those gates is therefore a plain
 * **hide-when-lacking, ordinary-when-holding** check again (the shape this file had *before* `23-24`),
 * and the only gate that still uses `muted` at all is `calendar:configure`, because buying the module
 * genuinely is something the identity holding `site:configure` (`ProductsPage.PRODUCTS_PERMISSION`,
 * the same "may act for the tenant as a whole" gate `/account/billing`'s checkout already uses) can
 * do without anyone else's help. See that constant's own doc comment for why `site:configure` is the
 * proxy for "this identity is the tenant" rather than a new, dedicated permission.
 *
 * **`isAdmin` names that proxy once**, rather than repeating `hasPermission("site:configure")` at
 * every one of the fourteen call sites below - it is *the* fact this whole rewrite turns on: an
 * operator (`!isAdmin`) sees four sections and nothing muted; the tenant/admin (`isAdmin`) sees all
 * seven, with the calendar muted only when they themselves lack `calendar:configure`.
 *
 * **A section with no visible items is not drawn at all** - `buildSection` below returns `null`
 * rather than an empty `AppShellNavSection`, and the caller filters those out. This is what makes an
 * ordinary operator's rail *exactly* four sections rather than seven collapsed ones: Каналы,
 * Автоматизация and Администрирование are entirely `isAdmin`-gated (every item inside them,
 * `Удалить аккаунт` on its own `site:erase` aside), so for `!isAdmin` each one has zero items and
 * disappears, leaving Диалоги, Записи (only when this identity holds at least one of
 * `calendar:configure`, the booking permissions, or `customer:read` - `23-57`, see below), Аналитика
 * and Команда (which always has at least the reserved "Общение" place, so it never empties).
 * `25-50`: reordered so Записи (was Календарь) is the second section, ahead of Аналитика - see the
 * `sections` array below.
 */
export function buildTenantNavSections(
  hasPermission: (permission: string) => boolean,
  strings: ConsoleStrings,
  enabledModules: string[] = [],
  permissionsKnown = true,
  // `25-51`: the two left-nav badge totals - defaulted to `0` (which `badgeFor` below renders as "no
  // badge at all") so every existing call site that does not know about either count
  // (`consoleNav.test.ts`, `OwnerSitesPage`/`OwnerSiteDetailPage` - neither has a live connection to
  // read a real total from) keeps building the identical, badge-less sections it always has, without
  // being made to pass two new arguments it has no answer for.
  unreadCount = 0,
  pendingCount = 0,
): AppShellNavSection[] {
  // `ProductsPage.PRODUCTS_PERMISSION`: the same gate that screen already uses for "may this identity
  // see what the tenant could buy at all" - reused here rather than a second constant, so a change to
  // which permission means "the tenant" cannot update one call site and miss the other.
  const isAdmin = permissionsKnown && hasPermission("site:configure");

  // `25-50`: Диалоги, Записи (the renamed calendar section), then every remaining section in its
  // previous relative order (Аналитика, Команда, Каналы, Автоматизация, Администрирование) -
  // moving `calendar` up to second place is the only reorder; nothing else's relative position
  // changes.
  const sections: (AppShellNavSection | null)[] = [
    buildSection("talk", strings.navConversations, buildTalkItems(isAdmin, strings, unreadCount)),
    buildSection(
      "calendar",
      strings.navSectionCalendar,
      buildCalendarItems(hasPermission, isAdmin, strings, pendingCount),
    ),
    buildSection("analytics", strings.navAnalytics, buildAnalyticsItems(hasPermission, isAdmin, strings)),
    buildSection("team", strings.navSectionTeam, buildTeamItems(permissionsKnown, hasPermission, strings)),
    buildSection("channels", strings.navSectionChannels, buildChannelsItems(isAdmin, strings)),
    buildSection("automation", strings.navSectionAutomation, buildAutomationItems(isAdmin, strings)),
    buildSection("admin", strings.navSectionAdmin, buildAdminItems(isAdmin, permissionsKnown, hasPermission, strings)),
  ];

  // `enabledModules` is read only inside `buildCalendarItems` today (there is no second
  // module-gated capability in this console yet - `23-31`'s own Out of scope keeps the AI features
  // as reserved placeholders with no module of their own to check). Accepted as a parameter here
  // regardless, matching this function's pre-existing signature, so a future module gate has
  // somewhere to read it from without widening every call site again.
  void enabledModules;

  return sections.filter((section): section is AppShellNavSection => section !== null);
}

function buildSection(id: string, label: string, items: AppShellNavItem[]): AppShellNavSection | null {
  return items.length === 0 ? null : { id, label, items };
}

/**
 * `25-51`: resolves a raw count into the shape `AppShellNavItem.badge` wants - `undefined` for `0`
 * (nothing to render, `AppShell.tsx`'s own rendering treats an absent badge and a zero-count one
 * identically, so this is the one place that decision is made rather than repeated at both call
 * sites below), otherwise the count plus the already-localized, already-pluralized accessible suffix
 * (`one`/`other`, the same binary singular/plural convention `queueUnreadMessageOne`/`Other` already
 * uses - `strings.ts`'s own doc comment on that pair). `AppShell`/`NavSections` render this
 * mechanically; they never call `useStrings()` for an item's own badge text, matching how `label`
 * itself already arrives here fully resolved rather than as a key `AppShell` would have to look up.
 */
function badgeFor(count: number, one: string, other: string): AppShellNavItem["badge"] {
  return count > 0 ? { count, label: count === 1 ? one : other } : undefined;
}

/** `23-31`: "Мои" replaces "Conversations" as this *item's* own label - `navConversations` now names
 * the section itself. `18-01`: "Все диалоги"/"Поиск" are the same `site:configure`-gated
 * supervisor-oversight capability as before, only hidden rather than muted when lacking it now.
 *
 * `25-51`: `unreadCount` lands on "Мои" alone, never on "Все диалоги"/"Поиск" - it is this operator's
 * own assigned-conversation total (`ConversationsAttentionContext`'s own doc comment), which is
 * exactly what "Мои" already means and neither of the other two do. When this section is collapsed in
 * the accordion (its own "Мои" not on screen), `AppShell.tsx`'s `NavSections` sums every item's badge
 * in the section and draws the total on "Диалоги" itself instead - see that file's own remarks - which
 * is what makes "the badge moves to Диалоги when collapsed" (the item's own Scope) true without this
 * function needing to know anything about accordion state at all.
 */
function buildTalkItems(isAdmin: boolean, strings: ConsoleStrings, unreadCount: number): AppShellNavItem[] {
  const items: AppShellNavItem[] = [
    {
      to: "/",
      label: strings.navMyConversations,
      end: true,
      badge: badgeFor(unreadCount, strings.queueUnreadMessageOne, strings.queueUnreadMessageOther),
    },
  ];
  if (isAdmin) {
    items.push({ to: "/conversations/all", label: strings.navAllConversations });
    items.push({ to: "/conversations/search", label: strings.navSearch });
  }
  return items;
}

/** `23-18`: "Мои показатели" stays unconditional - `GetOwnAnalyticsForOperatorHandler` checks nothing
 * beyond being a real operator of this site, on purpose (a grant here would be a thing a tenant could
 * withhold, which `docs/design/flows.md` 2.4 exists to prevent). The next four are the same
 * `site:configure` gate every settings screen shares, hidden rather than muted when lacking it.
 *
 * `25-17`: "Показы телефонов" (`/calendar/phone-reveals`) moved in here from `buildCalendarItems`,
 * correcting `25-12`'s own placement - a tenant reading the nav looks for an audit trail of *who saw
 * what* under Analytics, beside "Мои показатели" and the other analytics screens, not under
 * Calendar's operational/setup items. Only the section changed: the gate is still exactly
 * `calendar:configure`, independent of `isAdmin`, matching where it sat in `buildCalendarItems`
 * before this item (that function's own full-access branch, never the admin-muted or operator
 * branches) - which is why this takes `hasPermission` directly rather than folding into the
 * `isAdmin`-gated block above. The route itself stays `/calendar/phone-reveals`; moving the nav entry
 * without moving the URL was a deliberate, considered call (`25-17`'s own report), not an oversight -
 * every other Calendar-owned audit trail (`/calendar/customer-merges`) keeps its own `/calendar/`
 * path regardless of which rail section links to it, and a URL rename here would have been a second,
 * unrelated change riding along with a nav-placement fix.
 */
function buildAnalyticsItems(hasPermission: (permission: string) => boolean, isAdmin: boolean, strings: ConsoleStrings): AppShellNavItem[] {
  const items: AppShellNavItem[] = [{ to: "/analytics/me", label: strings.navMyNumbers }];
  if (isAdmin) {
    items.push({ to: "/analytics/site", label: strings.navAnalytics });
    items.push({ to: "/analytics/conversion", label: strings.navConversionReport });
    items.push({ to: "/analytics/tags", label: strings.navTagBreakdown });
    items.push({ to: "/analytics/booking-flow", label: strings.navBookingFlow });
  }
  if (hasPermission("calendar:configure")) {
    items.push({ to: "/calendar/phone-reveals", label: strings.navCalendarPhoneReveals });
  }
  return items;
}

/**
 * `22-06`/`adr/0093`/`23-57`: AGO Calendar's screens - built from what this identity can actually do,
 * not from one administrator permission. Four outcomes now, because `23-57` replaced the third
 * ("lacks `calendar:configure`, not the tenant" used to mean "nothing at all") with one branch per
 * capability an operator can genuinely hold:
 *
 * - **Holds `calendar:configure`**: the full seven items, ordinary, never muted - `Услуги` is new
 *   (carved out of `/calendar/setup` onto its own screen, `CalendarSetupPage`'s own doc comment on
 *   the split). `Записи` was `reserved` until `23-34`; it is now a real link
 *   (`/calendar/bookings` - `CalendarBookingsPage`), the confirmed-bookings screen the pending queue
 *   above it never was. `25-12`: reordered to the fill order a tenant actually works through,
 *   replacing the old dictionaries-first order - В ожидании, Записи, Клиенты (the day-to-day
 *   operational screens, most-used first) lead, then Мастера → Услуги → Расписание (the setup
 *   dictionaries, in the same dependency order `GetBookingReadinessHandler`'s own `Order` now
 *   states), then Настройка (a chosen middle position, not a settled one - see this branch's own item
 *   below), then the merge audit trail last, opened rarely and only after something else already
 *   happened. `25-17`: the reveal audit trail (`/calendar/phone-reveals`) that used to sit here,
 *   right after Клиенты, moved to `buildAnalyticsItems` - it kept exactly this same
 *   `calendar:configure` gate, only the nav section changed, so it is no longer drawn from this
 *   function at all.
 * - **Lacks it, but `isAdmin`**: one muted entry - this identity is the tenant, so whether or not the
 *   module happens to be enabled yet, buying (or granting themselves the permission on an already-
 *   enabled one) is something they can do without anyone else's help, which is exactly what `muted`
 *   now means. Collapsed to one representative entry rather than all eight individually muted links -
 *   `adr/0129`'s own reasoning: a tenant does not need eight doors into a room they have not paid for,
 *   one clearly-marked one is the whole message.
 * - **Lacks it, and not `isAdmin`**: **`23-57`** - the operator branch, one real entry per permission
 *   this identity actually holds, each checked independently rather than as one bundle:
 *   {@link hasAnyBookingActionPermission} (`booking:confirm`/`booking:reject`/`booking:cancel`) draws
 *   `Waiting` (`/calendar/waiting`, `CalendarQueuePage`), the queue those permissions exist to act on;
 *   `customer:read` draws `Bookings` (`23-34`'s own branch, kept exactly as that item shipped it - not
 *   folded back into a single gate) and, new in `23-57`, `Contacts` (`/calendar/clients`,
 *   `CalendarContactsPage`) alongside it, since both read the customer list `customer:read` actually
 *   guards server-side. **Never muted, whichever of these an operator lacks** - see this function's
 *   own hidden-vs-muted note below.
 * - **Holds none of the above**: nothing. The section itself disappears (`buildSection` returns `null`
 *   for an empty list) - the accepted cost `adr/0129` records: an operator with none of these grants
 *   learns nothing about the calendar from the nav. `enabledModules` is not read on any of these
 *   branches - it decided nothing for an `isAdmin` viewer either way (see the section-level doc
 *   comment above), and for `!isAdmin` the rule is "hidden unless genuinely held" regardless of
 *   whether the tenant has bought the module, so there is nothing left for that flag to change here.
 *
 * <b>`23-57`'s own hidden-vs-muted decision, stated once and applied to every entry in this
 * function.</b> `docs/backlog/23-22-*.md` found the queue drawn *muted* for an admin lacking
 * `calendar:configure` and *absent* for an operator lacking it - two different answers to what
 * `adr/0129` already settled as one question: **`muted` means this identity could obtain the thing
 * itself.** Applying that question, rather than a new one, is what removes the asymmetry -
 * `hasAnyBookingActionPermission`/`customer:read` are grants a *colleague* makes (an owner or admin
 * assigns a role), never something an operator can self-obtain the way the tenant can buy the module
 * or grant themselves the permission - so an operator lacking them gets `adr/0129`'s ordinary answer
 * for a colleague-granted capability: hidden, the same as `site:manage_operators`/`site:erase`
 * elsewhere in this file, never muted. The alternative this rejects is a *second* muted state, one
 * meaning "a colleague could grant it" for the operator branch alongside the tenant's "I could buy
 * it" - `adr/0129`'s own Alternatives-considered already tried and rejected exactly that shape (the
 * pre-`23-31` `23-24` rule) for being two facts wearing one visual treatment. Nothing here reopens
 * that question; it extends the settled answer to the entries `23-57` found it had not yet reached.
 */
/** `25-51`: `pendingCount` is `usePendingBookingsBadge`'s own total - see that hook's doc comment for
 * why it counts every calendar the tenant has, not "mine", matching this section's own "one queue,
 * spanning every calendar" rule (`CalendarQueuePage`'s own doc comment). It lands on "В ожидании"
 * (`navCalendarQueue`) in the two branches below that draw it as a real link - **never** on the
 * `muted` entry in the `isAdmin`-without-`calendar:configure` branch, which is a "buy this" prompt
 * pointing at a queue this identity cannot actually read yet (`usePendingBookingsBadge`'s own gate
 * already returns `0` there in practice, since holding neither `calendar:configure` nor a booking
 * permission never opens the calendar hub connection the count is read through - but the branch below
 * omits it explicitly rather than relying on that to stay true), and never on "Утверждённые"
 * (`navCalendarBookings`, confirmed-bookings) - a different, already-resolved list this count says
 * nothing about. */
function buildCalendarItems(
  hasPermission: (permission: string) => boolean,
  isAdmin: boolean,
  strings: ConsoleStrings,
  pendingCount: number,
): AppShellNavItem[] {
  const pendingBadge = badgeFor(pendingCount, strings.navCalendarPendingOne, strings.navCalendarPendingOther);

  if (hasPermission("calendar:configure")) {
    return [
      { to: "/calendar/waiting", label: strings.navCalendarQueue, end: true, badge: pendingBadge },
      { to: "/calendar/bookings", label: strings.navCalendarBookings },
      // `25-12`: Клиенты moved up here, ahead of the setup dictionaries below - the tenant's own
      // customer base is consulted routinely once the calendar runs, not a one-time setup step, so it
      // sits with the two operational screens above it rather than with Мастера/Услуги/Расписание.
      { to: "/calendar/clients", label: strings.navCalendarContacts },
      // `25-12`: Мастера → Услуги → Расписание, in the same fill order `GetBookingReadinessHandler`'s
      // own `Order` now states server-side - a worker before a service can be assigned to one, a
      // service before hours are meaningfully checked by the readiness funnel.
      { to: "/calendar/masters", label: strings.navCalendarWorkers },
      { to: "/calendar/services", label: strings.navCalendarServices },
      { to: "/calendar/schedule", label: strings.navCalendarAvailability },
      // `25-12`: placed right after the three dictionaries rather than with them - an open question
      // this item names rather than assumes. `BookingReadiness.tsx`'s own `ROUTE_FOR` map sends both
      // `WorkingHoursConfigured` (early setup) and `CalendarPublished` (the last, "go live" step) to
      // this one page, so no single position in a fill-order list fits it perfectly; this is the
      // chosen middle ground, not a settled answer - see `25-12`'s own backlog item and the worker's
      // report for why, and move it in one line if a different resting place is wanted instead.
      { to: "/calendar/setup", label: strings.navCalendarSetup },
      // `23-60`/`adr/0161`: the merge audit trail - gated server-side on `calendar:configure` itself
      // (wider than `customer:read`, matching `CalendarPhoneRevealsPage`'s own reasoning for the same
      // gate on the reveal audit trail, which `25-17` moved to `buildAnalyticsItems` below).
      { to: "/calendar/customer-merges", label: strings.navCalendarCustomerMerges },
    ];
  }
  if (isAdmin) {
    return [{ to: "/calendar/waiting", label: strings.navCalendarQueue, end: true, muted: true }];
  }

  // `23-57`: this identity is not the tenant and lacks `calendar:configure` - per `adr/0129` nothing
  // below can ever be muted (see this function's own doc comment), only drawn when genuinely held.
  const items: AppShellNavItem[] = [];
  if (hasAnyBookingActionPermission(hasPermission)) {
    items.push({ to: "/calendar/waiting", label: strings.navCalendarQueue, end: true, badge: pendingBadge });
  }
  if (hasPermission("customer:read")) {
    // `23-34`'s own branch, kept - `Bookings` before `Clients`, matching the full-access ordering
    // above (`25-12`: still true after that item's reorder - Waiting, Bookings, Clients are the same
    // first three, in the same relative order, in both branches).
    items.push({ to: "/calendar/bookings", label: strings.navCalendarBookings });
    items.push({ to: "/calendar/clients", label: strings.navCalendarContacts });
  }
  return items;
}

/** `23-31`: "Общение" is unconditional - a team-wide chat is not an admin capability, so it is drawn
 * for every operator regardless of `isAdmin`, the same reasoning `navMyConversations`/`navMyNumbers`
 * already have for staying unconditional. This is also what keeps the "Команда" section from ever
 * emptying out - an ordinary operator always sees at least this one reserved place, which is why it
 * is one of the four sections `23-31`'s own Done-when names. `23-22`: "Сотрудники" (renamed from
 * "Команда", which now names the section) keeps its own `site:manage_operators` gate, hidden rather
 * than muted when lacking it. */
function buildTeamItems(
  permissionsKnown: boolean,
  hasPermission: (permission: string) => boolean,
  strings: ConsoleStrings,
): AppShellNavItem[] {
  const items: AppShellNavItem[] = [];
  if (permissionsKnown && hasPermission("site:manage_operators")) {
    items.push({ to: "/team/people", label: strings.navOperatorsTeam });
  }
  // `23-32`: no longer reserved - TeamChatPage is a real route, unconditional like every other entry
  // in this function (see this function's own top-level remarks on why "Общение" carries no gate).
  items.push({ to: "/team/chat", label: strings.navTeamChat });
  return items;
}

/** `23-31`: every entry here shares the identical `site:configure` gate, so the section is built
 * whole or not at all rather than item by item - an operator who is not `isAdmin` gets none of these
 * five, which is the "Каналы целиком требует прав арендатора" half of the item's own reasoning.
 * `10-06`: "Установка виджета" stays first, above the list - a task, not a channel (this section's
 * own naming rule, decided 2026-09-06: every *other* entry here is named for the channel it is, not
 * for an action). "Другие каналы" stays `reserved` - Email, WhatsApp and Avito each have a working
 * adapter (`14-09`/`14-10`/`14-11`) but no console screen yet; VK (`14-08`) is no longer among them
 * (`25-15`).
 *
 * `23-36`: "Бот Telegram" is no longer `reserved` - `TelegramChannelPage` (`/channels/telegram`) is a
 * real screen, the first of these three places to become one (rule 15: one channel end to end, not
 * three half-built). The gate this section draws (`isAdmin`, i.e. `site:configure`) is a coarser
 * proxy than the server's own `channel:manage` check on that screen's endpoints - the identical gap
 * every other `isAdmin`-gated entry here already has against its own real permission
 * (`WidgetConfigPage`/`InstallSnippetPage` both check `site:configure` itself, not something
 * channel-specific), not one this item introduces.
 *
 * `25-09`: "Бот MAX" is no longer `reserved` either - `MaxChannelPage` (`/channels/max`) is the second
 * of these three places to become a real screen, kept in its original position (before Telegram) so
 * this list's order does not shuffle as each reserved place is filled in.
 *
 * `25-15`: "Сообщество VK" is the third - `VkChannelPage` (`/channels/vk`) - placed after Telegram,
 * before the now-narrower "Другие каналы" catch-all (Email/WhatsApp/Avito only), the same "kept in
 * position, list does not shuffle" discipline `25-09` already established for MAX. */
function buildChannelsItems(isAdmin: boolean, strings: ConsoleStrings): AppShellNavItem[] {
  if (!isAdmin) {
    return [];
  }
  return [
    { to: "/channels/install", label: strings.navInstallWidget },
    { to: "/channels/widget", label: strings.navWidgetAppearance },
    { to: "/channels/max", label: strings.navChannelsMax },
    { to: "/channels/telegram", label: strings.navChannelsTelegram },
    { to: "/channels/vk", label: strings.navChannelsVk },
    { label: strings.navChannelsOther, reserved: true },
  ];
}

/** `23-31`: same "whole section, one gate" shape as `buildChannelsItems` - every entry here shares
 * `site:configure` too. Machine-graded lowest to highest ("Готовые ответы" - a human still picks the
 * words - up through "Метки", the vocabulary every report above measures against), matching the
 * item's own table order. "ИИ-подсказки"/"ИИ-автоответ" are `reserved` - the AI-suggestion and
 * AI-auto-reply modules are not built at all yet, so there is no module flag to check for them
 * either (unlike the calendar, which is a real, working module today). */
function buildAutomationItems(isAdmin: boolean, strings: ConsoleStrings): AppShellNavItem[] {
  if (!isAdmin) {
    return [];
  }
  return [
    { to: "/automation/canned", label: strings.navCannedResponses },
    { label: strings.navAutomationAiSuggestions, reserved: true },
    { to: "/automation/auto-reply", label: strings.navOfflineAutoReply },
    { label: strings.navAutomationAiAutoReply, reserved: true },
    { to: "/automation/faq", label: strings.navFaqAssistant },
    { to: "/automation/tags", label: strings.navTags },
  ];
}

/** `23-31`: unlike Каналы/Автоматизация above, this section keeps two distinct gates, exactly as it
 * did before this item - `site:configure` for five entries, `site:erase` for the sixth
 * (`navDeleteAccount`'s own doc comment: "a single boolean that destroys a business is a plausible
 * case for its own [permission]"). Both are hidden rather than muted when lacking now, matching every
 * other gate in this file except the calendar's. "Документы" is no longer `reserved` as of `23-37` -
 * it now points at `DocumentsPage`, which reads `24-02`/`24-05`'s publish mechanism back. */
function buildAdminItems(
  isAdmin: boolean,
  permissionsKnown: boolean,
  hasPermission: (permission: string) => boolean,
  strings: ConsoleStrings,
): AppShellNavItem[] {
  const items: AppShellNavItem[] = [];
  if (isAdmin) {
    items.push({ to: "/account/products", label: strings.navAccountProducts });
    items.push({ to: "/account/billing", label: strings.navBilling });
    items.push({ to: "/account/device-storage", label: strings.navDeviceStorage });
    items.push({ to: "/account/documents", label: strings.navAccountDocuments });
  }
  if (permissionsKnown && hasPermission("site:erase")) {
    items.push({ to: "/account/delete", label: strings.navDeleteAccount });
  }
  return items;
}
