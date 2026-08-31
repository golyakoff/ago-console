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
 * "offers nothing gated while the answer is still in flight" case: `hasPermission` alone gates the
 * other three, never a still-loading `siteId` - `OperatorShell` never had a `siteId` check on this
 * first item, and this keeps that exact behaviour rather than introducing one.
 *
 * `11-11`: takes `strings` explicitly rather than calling `useStrings()` itself - a plain function,
 * not a component, cannot call a hook. `OperatorShell` passes its own resolved `useStrings()`;
 * `OwnerSitesPage` deliberately passes the console's built-in `en` table regardless of any tenant's
 * real locale, matching that page's own settled design call (confirmed with the author, `11-11`'s own
 * backlog item): `/owner` is not scoped to one tenant, so it never follows one's language, the
 * identical reasoning that already keeps `/onboarding`/`/signup`/`/callback` English.
 */
export function buildTenantNavItems(
  hasPermission: (permission: string) => boolean, strings: ConsoleStrings,
): AppShellNavItem[] {
  const items: AppShellNavItem[] = [{ to: "/", label: strings.navConversations, end: true }];
  if (hasPermission("site:configure")) {
    items.push({ to: "/admin", label: strings.navAllConversations });
    // `18-01`: same gate as `/admin` right above it - a site-wide search is the same admin/supervisor
    // oversight capability, not an ordinary operator's own tool (`SearchConversationsPage`'s own doc
    // comment).
    items.push({ to: "/search", label: strings.navSearch });
    // `18-08`: same gate as `/admin`/`/search` above - the site owner's own basic self-service report
    // (`OperatorAnalyticsPage`'s own doc comment).
    items.push({ to: "/analytics", label: strings.navAnalytics });
    // `18-10`: same gate again - the conversion report, a sibling page to `/analytics` rather than a
    // tab within it (`ConversionReportPage`'s own doc comment).
    items.push({ to: "/analytics/conversion", label: strings.navConversionReport });
    // `18-11`: same gate again - the tag breakdown report, a sibling page rather than a table on
    // `/analytics` (`TagBreakdownReportPage`'s own doc comment on why a non-single-valued dimension
    // does not fit that page's own table shape).
    items.push({ to: "/analytics/tags", label: strings.navTagBreakdown });
    // `18-14`: same gate again - the chat-to-booking conversion report, its own nav entry rather than
    // a link buried inside `/analytics` (`BookingFlowConversionPage`'s own doc comment on why it is a
    // sibling page, not a block on that one).
    items.push({ to: "/analytics/booking-flow", label: strings.navBookingFlow });
    items.push({ to: "/settings/widget", label: strings.navWidgetAppearance });
    // `19-03`: same permission, same place - the AI FAQ module's own registration and knowledge-base
    // editor screen.
    items.push({ to: "/settings/faq", label: strings.navFaqAssistant });
    // `14-04`: same permission, same place - one more tenant self-service setting.
    items.push({ to: "/settings/auto-reply", label: strings.navOfflineAutoReply });
    // `18-03`: same permission, same place - one more tenant self-service setting, and a genuinely
    // separate concept from the auto-reply screen just above it (`CannedResponse`'s own doc comment,
    // `ago-chat`, has the reasoning).
    items.push({ to: "/settings/canned-responses", label: strings.navCannedResponses });
    // `18-04`: same permission, same place - the tag vocabulary's own management surface.
    items.push({ to: "/settings/tags", label: strings.navTags });
    // `13-04`: same permission, same place - the billing screen `13-02`'s checkout endpoint and
    // `13-03`'s cancel/seat-change endpoints already gate on `site:configure`.
    items.push({ to: "/settings/billing", label: strings.navBilling });
  }
  // `16-02`: a distinct, deliberately narrower gate than the `site:configure` block above -
  // `AccountDeletionPage`'s own doc comment has the "why its own permission" reasoning. An operator
  // holding only `site:configure` sees the three items above but not this one; the reverse is equally
  // possible, since the two permissions are independent grants.
  if (hasPermission("site:erase")) {
    items.push({ to: "/settings/delete-account", label: strings.navDeleteAccount });
  }

  return items;
}
