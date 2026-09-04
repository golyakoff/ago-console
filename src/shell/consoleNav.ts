import type { ConsoleStrings } from "../i18n/strings.js";
import type { AppShellNavItem } from "./AppShell.js";

/**
 * `13-07`/`adr/0063`/`4-06`(console): the tenant-scoped half of the console's navigation, shared
 * between `OperatorShell` (always builds it - nothing renders that shell without a resolved operator
 * seat) and `OwnerSitesPage` (builds it only when this identity also holds a seat, the "orthogonal
 * axes" case `adr/0063`/`12-05` argue for). Before this, `OwnerSitesPage` offered a single
 * "Back to the console" link instead of this list, which is why a platform owner who is also an
 * operator lost the whole console nav - Conversations, the site-scoped screens, the lot - the moment
 * they clicked "Platform sites", and had to use that one link to leave `/owner` rather than
 * navigating like anywhere else in the shell.
 *
 * "Conversations" is unconditional here on purpose, matching `permissionGating.test.tsx`'s own
 * "offers nothing gated while the answer is still in flight" case.
 *
 * `11-11`: takes `strings` explicitly rather than calling `useStrings()` itself - a plain function,
 * not a component, cannot call a hook. `OperatorShell` passes its own resolved `useStrings()`;
 * `OwnerSitesPage` deliberately passes the console's built-in `en` table regardless of any tenant's
 * real locale, matching that page's own settled design call (confirmed with the author, `11-11`'s own
 * backlog item): `/owner` is not scoped to one tenant, so it never follows one's language, the
 * identical reasoning that already keeps `/onboarding`/`/signup`/`/callback` English.
 *
 * `23-24`, decision §10: **every gate below now decides between three answers, not two** - "an entry
 * is worth drawing only for a capability a colleague at this tenant could plausibly grant":
 *
 * | The person | The entry |
 * |---|---|
 * | holds the permission | ordinary |
 * | lacks it, a colleague at this tenant could grant it | `muted: true` - still drawn, still a real
 *   link, `AppShellNavItem.muted`'s own doc comment has the "why not `disabled`" reasoning |
 * | lacks it, and *nobody* at this tenant could grant it | not drawn at all |
 *
 * `site:configure` and `site:erase` are ordinary permissions any owner at the tenant already holds,
 * so they only ever have the first two rows - every entry gated on either is drawn unconditionally
 * now, muted when this operator lacks it. `calendar:configure` is the one gate with all three rows,
 * because it gates a *module* a tenant may never have enabled at all (`23-21`'s own finding,
 * generalised no further here - see that gate's own comment below for why it alone keeps a real
 * "nothing drawn" branch).
 *
 * `permissionsKnown` is the one thing "always drawn, muted when lacking" cannot decide for itself:
 * `hasPermission` collapses "denied" and "not yet known" into the identical `false`
 * (`PermissionsContext`'s own doc comment), which used to be harmless because the whole
 * `site:configure`/`site:erase` block simply did not run while unknown. Now that the block always
 * pushes its entries, that collapse would draw them **muted** the instant the shell mounts, for
 * every operator, correct or not, for as long as the first `GET /api/v1/operators/me` takes -
 * exactly the flash `permissionGating.test.tsx`'s "not yet known is not the same as denied" tests
 * exist to catch, now for a whole navigation section instead of one nav item disappearing.
 * `permissionsKnown` (`permissions !== null` at the call site) keeps that block absent, unchanged
 * from before this item, until the real answer has arrived - `calendar:configure` needs no such
 * guard: `enabledModules` already defaults to `[]` while unknown, which already suppresses its one
 * muted entry the identical way. Defaults to `true` because two of this function's three call sites
 * (`OwnerSitesPage`, `OwnerSiteDetailPage`) already only invoke it once their own `siteId` has
 * resolved, which is the same "not yet known" fact resolving at the same moment - only `OperatorShell`
 * calls this before that answer can be assumed, so only it passes the real value.
 */
export function buildTenantNavItems(
  hasPermission: (permission: string) => boolean,
  strings: ConsoleStrings,
  enabledModules: string[] = [],
  permissionsKnown = true,
): AppShellNavItem[] {
  const items: AppShellNavItem[] = [{ to: "/", label: strings.navConversations, end: true }];

  // `23-24`: this whole block used to be `if (hasPermission("site:configure")) { ... }`, which is
  // exactly `flows.md` 4.3's own must-never-happen generalised past the calendar - "you cannot
  // configure this site" and "this operator was never granted it" rendered as one indistinguishable
  // absent state. `site:configure` is not module-gated the way `calendar:configure` is below: every
  // tenant has it, held by whoever this tenant made an owner or admin, so there is no third
  // "the tenant does not have this at all" row to draw here - `canConfigureSite` alone decides
  // `muted` once `permissionsKnown`, and every entry in the block is pushed either way.
  if (permissionsKnown) {
    const canConfigureSite = hasPermission("site:configure");
    items.push({ to: "/admin", label: strings.navAllConversations, muted: !canConfigureSite });
    // `18-01`: same gate as `/admin` right above it - a site-wide search is the same admin/supervisor
    // oversight capability, not an ordinary operator's own tool (`SearchConversationsPage`'s own doc
    // comment).
    items.push({ to: "/search", label: strings.navSearch, muted: !canConfigureSite });
    // `18-08`: same gate as `/admin`/`/search` above - the site owner's own basic self-service report
    // (`OperatorAnalyticsPage`'s own doc comment).
    items.push({ to: "/analytics", label: strings.navAnalytics, muted: !canConfigureSite });
    // `18-10`: same gate again - the conversion report, a sibling page to `/analytics` rather than a
    // tab within it (`ConversionReportPage`'s own doc comment).
    items.push({ to: "/analytics/conversion", label: strings.navConversionReport, muted: !canConfigureSite });
    // `18-11`: same gate again - the tag breakdown report, a sibling page rather than a table on
    // `/analytics` (`TagBreakdownReportPage`'s own doc comment on why a non-single-valued dimension
    // does not fit that page's own table shape).
    items.push({ to: "/analytics/tags", label: strings.navTagBreakdown, muted: !canConfigureSite });
    // `18-14`: same gate again - the chat-to-booking conversion report, its own nav entry rather than
    // a link buried inside `/analytics` (`BookingFlowConversionPage`'s own doc comment on why it is a
    // sibling page, not a block on that one).
    items.push({ to: "/analytics/booking-flow", label: strings.navBookingFlow, muted: !canConfigureSite });
    // `10-06`: one position before "Widget appearance" - see `navInstallWidget`'s own doc comment
    // for why installing comes first.
    items.push({ to: "/settings/install", label: strings.navInstallWidget, muted: !canConfigureSite });
    items.push({ to: "/settings/widget", label: strings.navWidgetAppearance, muted: !canConfigureSite });
    // `19-03`: same permission, same place - the AI FAQ module's own registration and knowledge-base
    // editor screen.
    items.push({ to: "/settings/faq", label: strings.navFaqAssistant, muted: !canConfigureSite });
    // `14-04`: same permission, same place - one more tenant self-service setting.
    items.push({ to: "/settings/auto-reply", label: strings.navOfflineAutoReply, muted: !canConfigureSite });
    // `18-03`: same permission, same place - one more tenant self-service setting, and a genuinely
    // separate concept from the auto-reply screen just above it (`CannedResponse`'s own doc comment,
    // `ago-chat`, has the reasoning).
    items.push({ to: "/settings/canned-responses", label: strings.navCannedResponses, muted: !canConfigureSite });
    // `18-04`: same permission, same place - the tag vocabulary's own management surface.
    items.push({ to: "/settings/tags", label: strings.navTags, muted: !canConfigureSite });
    // `13-04`: same permission, same place - the billing screen `13-02`'s checkout endpoint and
    // `13-03`'s cancel/seat-change endpoints already gate on `site:configure`.
    items.push({ to: "/settings/billing", label: strings.navBilling, muted: !canConfigureSite });
    // `23-24`/`23-25`: "what else AGO does" belongs here too, immediately after Billing - same
    // `site:configure` gate as every entry in this block (an owner already holds it; that item's own
    // Scope says "gated on the permission an owner holds rather than shown to every operator"), and
    // the same `muted: !canConfigureSite` every other entry above gets. Not wired as a real
    // `items.push` yet - `23-25` has not built the screen or its route, and a nav entry with nothing
    // behind it would be a dead link *this* item ships, not a decision it records (rule 15: a ticket
    // must close green on its own). `23-25` was told not to touch this file; when its route exists,
    // the line to add here is exactly:
    //   items.push({ to: "/settings/products", label: strings.navProducts, muted: !canConfigureSite });
    // one position after Billing, nothing else in this function needs to change.

    // `16-02`: a distinct, deliberately narrower gate than the `site:configure` block above -
    // `AccountDeletionPage`'s own doc comment has the "why its own permission" reasoning. An operator
    // holding only `site:configure` sees the entries above muted-or-not on their own account; the
    // reverse is equally possible, since the two permissions are independent grants. `23-24`: the
    // same "always drawn, muted when lacking" treatment as the block above - erasure is exactly as
    // grantable by an owner at this tenant as site configuration is, so it never had a third,
    // ungrantable row either.
    items.push({
      to: "/settings/delete-account",
      label: strings.navDeleteAccount,
      muted: !hasPermission("site:erase"),
    });
  }

  // `22-06`/`adr/0093`: AGO Calendar's screens, moved from `ago-calendar-console` - a distinct
  // permission from `site:configure` above (`22-05` added it to `Ago.Chat.Domain.Permission`,
  // read from the same `GET /api/v1/operators/me` response `hasPermission` already reads), because
  // holding it is an add-on a tenant chooses independently of general site configuration - the
  // identical "own gate, own block" shape `site:erase`'s block just above already establishes for
  // `AccountDeletionPage`. Under `/calendar`, not `/settings/*`: these are not one-form settings
  // screens like the ones above (a queue and a staff roster are working surfaces, not
  // configuration), and not at the console's own root either - `/` is this console's own
  // conversation queue and `/calendar` cannot reuse it. `config.calendarApiBaseUrl` is deliberately
  // NOT checked here - `FaqModulePage`'s own precedent keeps its nav entry visible even when
  // `config.faqApiBaseUrl` is unset, and lets the screen itself render "not configured" instead; the
  // calendar screens below follow the identical shape.
  //
  // Five entries, not six: `22-05` (`adr/0093`, merged mid-move) deleted AGO Calendar's own
  // `operators`/`roles` tables and the console endpoints that managed them - there is no Access
  // screen to link to any more, and none was ever wired here.
  //
  // `23-21`, now the pattern `23-24` generalised to every other gate above: a caller who does not
  // hold `calendar:configure` is not offered nothing unconditionally - `enabledModules` (from the
  // same `GET /api/v1/operators/me` response `hasPermission` already reads) says whether their
  // *tenant* has the calendar at all, which is a fact about the tenant, not this operator. Three
  // cases, and this is the one gate that keeps all three - unlike `site:configure`/`site:erase`
  // above, a tenant can genuinely lack this capability altogether, and showing a dead entry for
  // every deployment (whether or not this tenant could ever use it) would be the over-disclosure
  // `flows.md` 4.3 warns against - a nav item is worth drawing only for a capability a colleague at
  // *this* tenant could plausibly grant.
  //   - Holds the permission: the full five, unchanged, never muted.
  //   - Does not hold it, but the tenant has the module enabled: one entry (`/calendar` itself),
  //     `muted: true` (`23-24`: previously drawn ordinary, the one inconsistency between this gate
  //     and the "one treatment, not two" the other two now share) - so the capability is
  //     discoverable at all. It leads to `CalendarAccessRefusal`'s "forbidden" state, which names
  //     who can grant it (`src/calendar/calendarAccess.tsx`).
  //   - Does not hold it, and the tenant has never enabled the module: nothing, matching this nav's
  //     behaviour before `23-21` - there is no colleague at this tenant who could grant a module
  //     nobody here has ever switched on. `23-24`'s own Done-when tests this stays hidden precisely
  //     because it is the case most likely to be "fixed" into over-disclosure by a later reader.
  if (hasPermission("calendar:configure")) {
    items.push({ to: "/calendar", label: strings.navCalendarQueue, end: true });
    items.push({ to: "/calendar/setup", label: strings.navCalendarSetup });
    items.push({ to: "/calendar/workers", label: strings.navCalendarWorkers });
    items.push({ to: "/calendar/availability", label: strings.navCalendarAvailability });
    items.push({ to: "/calendar/contacts", label: strings.navCalendarContacts });
  } else if (enabledModules.includes("calendar")) {
    items.push({ to: "/calendar", label: strings.navCalendarQueue, end: true, muted: true });
  }

  return items;
}
