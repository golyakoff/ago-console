import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { MOVED_ROUTES } from "./movedRoutes.js";
import { RequireAuth } from "./auth/RequireAuth.js";
import { PermissionsProvider } from "./auth/PermissionsProvider.js";
import { OperatorConnectionProvider } from "./realtime/OperatorConnectionProvider.js";
import { CalendarOperatorConnectionProvider } from "./realtime/CalendarOperatorConnectionProvider.js";
import { PreSessionStringsProvider } from "./i18n/PreSessionStringsProvider.js";
import { ConversationsAttentionProvider } from "./workspace/ConversationsAttentionProvider.js";
import { OperatorShell } from "./shell/OperatorShell.js";
import { CallbackPage } from "./pages/CallbackPage.js";
import { SignupPage } from "./pages/SignupPage.js";
import { PolicyPage } from "./pages/PolicyPage.js";
import { OnboardingPage } from "./pages/OnboardingPage.js";
import { RedeemInvitePage } from "./pages/RedeemInvitePage.js";
import { InvitePreviewPage } from "./pages/InvitePreviewPage.js";
import { WorkspaceLayout } from "./workspace/WorkspaceLayout.js";
import { NoConversationSelected } from "./workspace/NoConversationSelected.js";
import { ConversationPage } from "./pages/ConversationPage.js";
import { AdminConversationsPage } from "./pages/AdminConversationsPage.js";
import { OperatorAnalyticsPage } from "./pages/OperatorAnalyticsPage.js";
import { MyNumbersPage } from "./pages/MyNumbersPage.js";
import { ConversionReportPage } from "./pages/ConversionReportPage.js";
import { TagBreakdownReportPage } from "./pages/TagBreakdownReportPage.js";
import { BookingFlowConversionPage } from "./pages/BookingFlowConversionPage.js";
import { SearchConversationsPage } from "./pages/SearchConversationsPage.js";
import { WidgetConfigPage } from "./pages/WidgetConfigPage.js";
import { InstallSnippetPage } from "./pages/InstallSnippetPage.js";
import { TelegramChannelPage } from "./pages/TelegramChannelPage.js";
import { MaxChannelPage } from "./pages/MaxChannelPage.js";
import { VkChannelPage } from "./pages/VkChannelPage.js";
import { FaqModulePage } from "./pages/FaqModulePage.js";
import { OfflineAutoReplyPage } from "./pages/OfflineAutoReplyPage.js";
import { CannedResponsesPage } from "./pages/CannedResponsesPage.js";
import { TagsPage } from "./pages/TagsPage.js";
import { BillingPage } from "./pages/BillingPage.js";
import { DeviceStorageDisclosurePage } from "./pages/DeviceStorageDisclosurePage.js";
import { DocumentsPage } from "./pages/DocumentsPage.js";
import { ProductsPage } from "./pages/ProductsPage.js";
import { AccountDeletionPage } from "./pages/AccountDeletionPage.js";
import { OperatorsTeamPage } from "./pages/OperatorsTeamPage.js";
import { TeamChatPage } from "./pages/TeamChatPage.js";
import { AppearanceSettingsPage } from "./pages/AppearanceSettingsPage.js";
import { OwnerSitesPage } from "./owner/OwnerSitesPage.js";
import { OwnerSiteDetailPage } from "./owner/OwnerSiteDetailPage.js";
import { OwnerPricingPage } from "./owner/OwnerPricingPage.js";
import { OwnerSuspensionsPage } from "./owner/OwnerSuspensionsPage.js";
import { CalendarQueuePage } from "./pages/CalendarQueuePage.js";
import { CalendarSetupPage } from "./pages/CalendarSetupPage.js";
import { CalendarServicesPage } from "./pages/CalendarServicesPage.js";
import { CalendarWorkersPage } from "./pages/CalendarWorkersPage.js";
import { CalendarWorkerSlotsPage } from "./pages/CalendarWorkerSlotsPage.js";
import { CalendarWorkerRecutPage } from "./pages/CalendarWorkerRecutPage.js";
import { CalendarAvailabilityPage } from "./pages/CalendarAvailabilityPage.js";
import { CalendarContactsPage } from "./pages/CalendarContactsPage.js";
import { CalendarBookingsPage } from "./pages/CalendarBookingsPage.js";
import { CalendarPhoneRevealsPage } from "./pages/CalendarPhoneRevealsPage.js";
import { CalendarCustomerMergesPage } from "./pages/CalendarCustomerMergesPage.js";

/**
 * `23-31`: a moved drill-down route (`:workerId/slots`, `:workerId/recut` - neither has a nav entry
 * of its own, both reached only from `CalendarWorkersPage`'s row actions) needs its redirect to carry
 * the id forward, which a bare `<Navigate to="...">` cannot do - it has no way to read the param it
 * is standing in for. One tiny component per such redirect, rather than a generic
 * `<Route path=":id/slots" element={<Navigate to={...} />} />` factory: two call sites do not earn an
 * abstraction, and a reader can see exactly what each one forwards without following a level of
 * indirection into a shared helper.
 */
export function RedirectWorkerSlots() {
  const { workerId } = useParams<{ workerId: string }>();
  return <Navigate to={`/calendar/masters/${workerId ?? ""}/slots`} replace />;
}

export function RedirectWorkerRecut() {
  const { workerId } = useParams<{ workerId: string }>();
  return <Navigate to={`/calendar/masters/${workerId ?? ""}/recut`} replace />;
}

/**
 * The routing shell: login (via `RequireAuth`'s own redirect, no separate landing page) -> queue ->
 * conversation. `5-06` scaffolded this with `RequireAuth` wrapping each route *separately* - `5-07`
 * changes that to one shared parent layout route (`RequireAuth` + `OperatorConnectionProvider`,
 * `<Outlet />` for whichever page is active) precisely so the operator hub connection those two
 * pages both need survives navigating between them, rather than being torn down and reopened on
 * every route change the way two independently-wrapped routes would do it.
 *
 * `5-08`: `PermissionsProvider` joins the same shared layout, one level outside
 * `OperatorConnectionProvider` - it has no dependency on the hub connection, only on `useAuth`, so
 * ordering relative to it does not matter functionally, but keeping every "one per session, not one
 * per page" provider grouped together here is easier to read than interleaving them by feature.
 *
 * `23-31`: **nineteen routes moved**, out of the flat `/admin`/`/settings/*` shape into the seven
 * sections `consoleNav.ts` now builds (`/conversations/*`, `/team/*`, `/channels/*`,
 * `/automation/*`, `/account/*`, plus three renames inside `/calendar/*`). Every one of those old
 * addresses gets a `<Navigate replace>` redirect below, grouped together in their own block rather
 * than interleaved with the routes they replace, so the "old address still answers" claim
 * (`docs/backlog/23-31-*.md`'s own Done-when) can be read as one list rather than found piecemeal.
 *
 * **Eighteen of the nineteen are a genuine dead-address-without-a-redirect case; the nineteenth,
 * `/calendar/setup` -> `/calendar/services`, is not.** That pair is "Услуги" in the item's own table:
 * the services dictionary is carved out of the combined setup screen onto its own new route
 * (`/calendar/services`, `CalendarServicesPage` - see that file's own doc comment), but
 * `/calendar/setup` itself keeps answering, unredirected, because `CalendarSetupPage` still lives
 * there (its own doc comment on the split) - a bookmark to it renders a real screen, just a smaller
 * one than before, never a 404. Redirecting that address to `/calendar/services` would have been
 * wrong: it would break the one screen the old address was *already* naming, to fix a link that was
 * never broken in the first place.
 */
export function App() {
  return (
    <Routes>
      <Route
        path="/callback"
        element={
          <PreSessionStringsProvider>
            <CallbackPage />
          </PreSessionStringsProvider>
        }
      />
      <Route
        path="/signup"
        element={
          <PreSessionStringsProvider>
            <SignupPage />
          </PreSessionStringsProvider>
        }
      />
      {/* `24-03`: `/policies/:documentKey` - `24-02`'s published surface, read from a screen. Public,
          the same shape as `/signup` above: whoever reads a document has not accepted anything yet, so
          there is no session for `RequireAuth` to require (`PolicyPage.tsx`'s own doc comment).
          Wrapped in `PreSessionStringsProvider` for the same reason those two are (`23-28`): a reader
          with no site has no locale to follow, and the answer to that is Russian rather than English.
          The two items landed within an hour of each other and this is where they met. */}
      <Route
        path="/policies/:documentKey"
        element={
          <PreSessionStringsProvider>
            <PolicyPage />
          </PreSessionStringsProvider>
        }
      />
      {/* `23-70`: `/invite/:code` - the landing page a colleague reaches by opening the link
          `/team/people`'s own invite dialog now hands out, before signing in at all. Public, the same
          shape as `/policies/:documentKey` right above and for the identical reason: whoever opens
          this has no account yet, so there is nothing here for `RequireAuth` to gate
          (`InvitePreviewPage.tsx`'s own doc comment). Wrapped in `PreSessionStringsProvider` for the
          same "no site, no locale to read, and the answer is Russian" reasoning `23-28` gave
          `/onboarding`/`/redeem-invite`/`/policies` - this route has exactly as little to read a
          locale from as any of them. */}
      <Route
        path="/invite/:code"
        element={
          <PreSessionStringsProvider>
            <InvitePreviewPage />
          </PreSessionStringsProvider>
        }
      />
      <Route
        path="/onboarding"
        element={
          <PreSessionStringsProvider>
            <RequireAuth>
              <OnboardingPage />
            </RequireAuth>
          </PreSessionStringsProvider>
        }
      />
      {/* `23-27`: `/redeem-invite` - the other end of `13-01`'s invite, on the identical shape as
          `/onboarding` right above it and for the identical reason: `RequireAuth` alone, never
          wrapped in `PermissionsProvider`/`OperatorConnectionProvider`, because a caller here by
          definition carries no `OperatorId`/`SiteId` claim yet. `RedeemInvitePage.tsx`'s own doc
          comment has the full reasoning, including why this route is not folded into `/onboarding`
          as a second mode of the same screen (they submit to different endpoints under different
          server-side gates, and offer each other a link rather than sharing one component).
          `23-28`: `PreSessionStringsProvider` joins it here on the identical shape as `/onboarding`
          above - this route already called `useStrings()` throughout and used to read the bare `en`
          default for want of a provider; that is the exemption `ux-gate/gate.spec.ts` named by this
          screen, and it is what this wrapping removes. */}
      <Route
        path="/redeem-invite"
        element={
          <PreSessionStringsProvider>
            <RequireAuth>
              <RedeemInvitePage />
            </RequireAuth>
          </PreSessionStringsProvider>
        }
      />
      {/* `12-03`: `/owner` - the platform owner's cross-tenant operations view. Three things about
          this route are deliberate:

          **The path contains no "admin".** `5-08`'s original `/admin` (moved to
          `/conversations/all` by `23-31`) is a *tenant's own* supervisor looking at their own site;
          this is the operator of the service looking at every site. The authorization model draws
          that line sharply (`authorization.md`), a URL ends up in logs and screenshots, and `12-02`
          made the same choice server-side (`/api/v1/owner/`, never `/api/v1/admin/`). The two
          surfaces share no route segment, no endpoint and no component tree.

          **It is outside the operator layout, not inside it.** The platform owner is a Keycloak
          realm role (`12-01`), not an operator seat, so this route may not assume an `operators` row
          exists - which `OperatorConnectionProvider` does, unconditionally opening a per-operator hub
          connection this screen has no use for. `PermissionsProvider` is kept and fails soft, exactly
          as `/onboarding` reasons about the same providers for the same kind of token.

          **Its gate is the server's, on every call.** `RequireAuth` here checks only "is there an
          OIDC session"; the route does not check who the owner is, because `12-01`'s
          `RequirePlatformOwner` policy on `12-02`'s endpoint already does, authoritatively, per
          request. `OwnerSitesPage` renders whatever that policy answers. The console's own
          client-side signal (`useOwnerEligibility`) decides one thing only - whether the navigation
          link is drawn - and is the server's answer read back, never a re-derivation of it. */}
      <Route
        path="/owner"
        element={
          <RequireAuth>
            <PermissionsProvider>
              <OwnerSitesPage />
            </PermissionsProvider>
          </RequireAuth>
        }
      />
      {/* `23-14`: the per-tenant drill-down `ui-inventory.md` §8.1 recorded as absent - same gate,
          same "outside the operator layout" reasoning as `/owner` immediately above, since it is a
          detail view of the identical resource ("a site, as the platform owner sees it"), not a
          different actor or a different policy. `GET /api/v1/owner/sites/{siteId}`'s own
          `RequirePlatformOwner` policy is what actually decides; `OwnerSiteDetailPage` renders
          whatever that policy answers, including a real 404 for a site id that does not exist. */}
      <Route
        path="/owner/sites/:siteId"
        element={
          <RequireAuth>
            <PermissionsProvider>
              <OwnerSiteDetailPage />
            </PermissionsProvider>
          </RequireAuth>
        }
      />
      {/* `25-20`: the platform owner's own price list - the identical gate and "outside the operator
          layout" reasoning as `/owner`/`/owner/sites/:siteId` above, since it is the same actor and
          the same policy (`RequirePlatformOwner` on `GET /api/v1/owner/pricing`), not a different
          one. Reached from `OwnerSitesPage`'s own "Price list" link, not from a second pinned nav
          entry - see `OwnerPricingPage`'s own remarks. */}
      <Route
        path="/owner/pricing"
        element={
          <RequireAuth>
            <PermissionsProvider>
              <OwnerPricingPage />
            </PermissionsProvider>
          </RequireAuth>
        }
      />
      {/* `22-08`: the console's own "who is currently suspended" screen - the identical gate and
          "outside the operator layout" reasoning as `/owner`/`/owner/pricing` above, since it is the
          same actor and the same policy (`RequirePlatformOwner` on `GET /api/v1/owner/suspensions`).
          Reached from `OwnerSitesPage`'s own "Suspended accounts" link, not from a second pinned nav
          entry - `OwnerPricingPage`'s own precedent. */}
      <Route
        path="/owner/suspensions"
        element={
          <RequireAuth>
            <PermissionsProvider>
              <OwnerSuspensionsPage />
            </PermissionsProvider>
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <PermissionsProvider>
              <OperatorConnectionProvider>
                {/* `25-63`: inside OperatorConnectionProvider, not beside it - both are one
                    operator's own session-scoped connections, mounted at the identical shared
                    layout route so navigating between the workspace and any /calendar/* screen
                    never tears either one down. CalendarOperatorConnectionProvider itself decides
                    whether to ever open a real connection (config.calendarApiBaseUrl configured, and
                    this operator holds a calendar permission) - see its own doc comment. */}
                <CalendarOperatorConnectionProvider>
                  {/* `25-51`: innermost, closest to its one real consumer (`OperatorShell`'s own
                      Диалоги nav badge, forwarded live updates by `WorkspaceLayout`) - it needs only
                      `useAuth()`, not either connection above it, so nesting order relative to them
                      carries no functional weight (`App.tsx`'s own remarks on `PermissionsProvider`
                      make the identical point for an unrelated pair). */}
                  <ConversationsAttentionProvider>
                    <OperatorShell />
                  </ConversationsAttentionProvider>
                </CalendarOperatorConnectionProvider>
              </OperatorConnectionProvider>
            </PermissionsProvider>
          </RequireAuth>
        }
      >
        {/* `11-06`: both conversation routes now render inside one more layout route - the operator
            workspace, which owns the queue data, the conversation list and the three-region frame,
            and puts whichever of the two elements below is active into its own grid areas. The
            routing contract is deliberately unchanged: `/` is still the queue's home and
            `/conversations/:id` is still a real, linkable, reloadable route. What changed is that
            they are now two states of one screen rather than two pages. `/conversations/all` and
            `/channels/widget` stay outside it - they are ordinary full-width pages and have nothing
            to do with a conversation list. */}
        <Route element={<WorkspaceLayout />}>
          <Route path="/" element={<NoConversationSelected />} />
          <Route path="/conversations/:conversationId" element={<ConversationPage />} />
        </Route>
        {/* `23-31`: moved from `/admin` - "Диалоги" section, "Все диалоги". */}
        <Route path="/conversations/all" element={<AdminConversationsPage />} />
        {/* `18-01`: same "outside the workspace layout, page gates itself internally" shape as
            `/conversations/all` right above it - `SearchConversationsPage` checks `site:configure`
            itself. `23-31`: moved from `/search`. */}
        <Route path="/conversations/search" element={<SearchConversationsPage />} />
        {/* `18-08`: same "outside the workspace layout, page gates itself internally" shape as the
            routes above - `OperatorAnalyticsPage` checks `site:configure` itself. `23-31`: moved from
            `/analytics` - the bare path now belongs to this screen's own site-wide report inside the
            "Аналитика" section, alongside "Мои показатели"/"Конверсия"/"Отчёт по меткам"/"Запись
            через чат", none of which moved. */}
        <Route path="/analytics/site" element={<OperatorAnalyticsPage />} />
        {/* `23-18`: a sibling route, not a query mode on `/analytics/site` - `MyNumbersPage` gates on
            nothing but a real operator identity (`RequireAuth`/`RequireOperatorIdentity` alone), the
            one route in this whole analytics group with no `site:configure` check inside it either -
            `MyNumbersPage`'s own doc comment states why a permission would be the wrong shape here. */}
        <Route path="/analytics/me" element={<MyNumbersPage />} />
        {/* `18-10`: same "outside the workspace layout, page gates itself internally" shape as
            `/analytics/site` right above it - `ConversionReportPage` checks `site:configure` itself. A
            sibling route, not a query-parameter mode on the site report, matching that page's own doc
            comment on why conversion is a separate report rather than a third table. */}
        <Route path="/analytics/conversion" element={<ConversionReportPage />} />
        {/* `18-11`: same "outside the workspace layout, page gates itself internally" shape as
            `/analytics/site`/`/analytics/conversion` above - `TagBreakdownReportPage` checks
            `site:configure` itself. A sibling route, not a table on the site report: that page's own
            tables all cut the same three numbers by a single-valued dimension, and a tag is not a
            single-valued dimension at all (`TagBreakdownReportPage`'s own doc comment). */}
        <Route path="/analytics/tags" element={<TagBreakdownReportPage />} />
        {/* `18-14`: same "outside the workspace layout, page gates itself internally" shape as
            `/analytics/site`/`/analytics/conversion` above - `BookingFlowConversionPage` checks
            `site:configure` itself. A sibling route rather than a query mode on the site report: the
            pages answer genuinely different questions over different tables
            (`BookingFlowConversionPage`'s own doc comment). */}
        <Route path="/analytics/booking-flow" element={<BookingFlowConversionPage />} />
        {/* `10-06`: one position before the widget's own appearance screen - installing the widget is
            the step a tenant needs before its appearance is worth touching (`navInstallWidget`'s own
            doc comment). Same "route stays outside the workspace layout, page gates itself
            internally" shape as every channel screen beside it. `23-31`: moved from `/settings/install`
            into the "Каналы" section - the one entry in that section that is a task, not a channel
            (`consoleNav.ts`'s own remarks on the naming rule this follows). */}
        <Route path="/channels/install" element={<InstallSnippetPage />} />
        {/* `23-31`: moved from `/settings/widget` - "Каналы" section, "Виджет на сайте" (renamed from
            "Внешний вид виджета" the same day, `consoleNav.ts`'s own remarks). */}
        <Route path="/channels/widget" element={<WidgetConfigPage />} />
        {/* `25-09`: same "route stays outside the workspace layout, page gates itself internally"
            shape as the two channel routes above it - `MaxChannelPage` checks `channel:manage` itself.
            The second of `23-31`'s three reserved channel places to become a real screen (`23-36` built
            Telegram's first); "Другие каналы" stays reserved (`consoleNav.ts`'s own remarks). Placed
            before Telegram's own route, matching `consoleNav.ts`'s unchanged list order. */}
        <Route path="/channels/max" element={<MaxChannelPage />} />
        {/* `23-36`: same "route stays outside the workspace layout, page gates itself internally"
            shape as the channel routes around it - `TelegramChannelPage` checks `channel:manage`
            itself. The first of `23-31`'s three reserved channel places to become a real screen; MAX
            is now real too (`25-09`), "Другие каналы" stays reserved (`consoleNav.ts`'s own remarks on
            why one channel end to end, not three half-built ones). */}
        <Route path="/channels/telegram" element={<TelegramChannelPage />} />
        {/* `25-15`: same "route stays outside the workspace layout, page gates itself internally"
            shape as the channel routes around it - `VkChannelPage` checks `channel:manage` itself.
            The third of `23-31`'s three reserved channel places to become a real screen; "Другие
            каналы" now covers only Email/WhatsApp/Avito (`consoleNav.ts`'s own remarks). Placed after
            Telegram's own route, matching `consoleNav.ts`'s unchanged list order. */}
        <Route path="/channels/vk" element={<VkChannelPage />} />
        {/* `19-03`: same "route stays outside the workspace layout, page gates itself internally"
            shape as the ones around it - `FaqModulePage` gates itself on `site:configure` internally,
            exactly like `WidgetConfigPage` above it. `23-31`: moved from `/settings/faq` into the
            "Автоматизация" section. */}
        <Route path="/automation/faq" element={<FaqModulePage />} />
        {/* `14-04`: same pattern again - `OfflineAutoReplyPage` gates itself on `site:configure`
            internally. `23-31`: moved from `/settings/auto-reply` into "Автоматизация". */}
        <Route path="/automation/auto-reply" element={<OfflineAutoReplyPage />} />
        {/* `18-03`: same pattern again - `CannedResponsesPage` gates itself on `site:configure`
            internally. `23-31`: moved from `/settings/canned-responses` into "Автоматизация". */}
        <Route path="/automation/canned" element={<CannedResponsesPage />} />
        {/* `18-04`: same pattern - `TagsPage` gates itself on `site:configure` internally. `23-31`:
            moved from `/settings/tags` into "Автоматизация". */}
        <Route path="/automation/tags" element={<TagsPage />} />
        {/* `13-04`: same pattern again - `BillingPage` gates itself on `site:configure` internally.
            `23-31`: moved from `/settings/billing` into "Администрирование". */}
        <Route path="/account/billing" element={<BillingPage />} />
        {/* `24-15`: same "route stays outside the workspace layout, page gates itself internally"
            shape as the ones around it - `DeviceStorageDisclosurePage` gates itself on
            `site:configure` internally. Fetches nothing, unlike every route around it - see that
            page's own doc comment for why. `23-31`: moved from `/settings/device-storage` into
            "Администрирование". */}
        <Route path="/account/device-storage" element={<DeviceStorageDisclosurePage />} />
        {/* `23-37`: same "route stays outside the workspace layout, page gates itself internally"
            shape as the ones around it - `DocumentsPage` gates itself on `site:configure`
            internally. `23-31` reserved this nav entry ("Документы"); this item is what finally
            reads `24-02`/`24-05`'s consent-document mechanism back instead of leaving it API-only. */}
        <Route path="/account/documents" element={<DocumentsPage />} />
        {/* `23-25`: same "route stays outside the workspace layout, page gates itself internally"
            shape as the ones around it - `ProductsPage` gates itself on `site:configure` internally.
            `23-31`: moved from `/settings/products` into "Администрирование" and, at the same time,
            finally linked from `consoleNav.ts` - `23-25` built the route and screen but left the nav
            placement to this item (`strings.navAccountProducts`'s own doc comment). */}
        <Route path="/account/products" element={<ProductsPage />} />
        {/* `16-02`: same "route stays outside the workspace layout, page gates itself internally"
            shape - but on `site:erase`, not `site:configure` (`AccountDeletionPage`'s own doc
            comment). `23-31`: moved from `/settings/delete-account` into "Администрирование". */}
        <Route path="/account/delete" element={<AccountDeletionPage />} />
        {/* `23-22`: same "route stays outside the workspace layout, page gates itself internally"
            shape - but on its own `site:manage_operators`, not `site:configure` or `site:erase`
            (`OperatorsTeamPage`'s own doc comment: an operator who may reconfigure the widget must
            not, by that alone, manage who else works here). `23-31`: moved from
            `/settings/operators` into its own "Команда" section, alongside the reserved "Общение"
            place. */}
        <Route path="/team/people" element={<OperatorsTeamPage />} />
        {/* `23-32`: the reserved "Общение" place `23-31` left for it - a real route now, no
            permission gate (every operator of the site is a member, `TeamChatPage`'s own doc
            comment). Inside this same shared layout route (`RequireAuth`/`PermissionsProvider`/
            `OperatorConnectionProvider`), not `WorkspaceLayout` - a team room is not a conversation
            and needs none of that grid's three regions. */}
        <Route path="/team/chat" element={<TeamChatPage />} />
        {/* `25-48`: `/appearance` - the theme picker's standalone home, moved here from the header
            (`ShellIdentity`'s own `ThemeToggle`, `AppShell.tsx`) rather than duplicated. Flat and
            top-level, the same shape as `/team/chat` right above it, not nested under any of
            `consoleNav.ts`'s seven tenant-scoped sections and not `/settings/*` (`23-31` retired that
            prefix for tenant-configuration screens; this is a personal, unconditional preference, the
            identical "no permission gate" shape `/team/chat` and `/analytics/me` already have -
            `AppearanceSettingsPage`'s own doc comment has the full reasoning). Not yet linked from any
            nav - `25-47`'s future user menu is this page's real link, and this route exists on its own
            regardless of when that item lands (`25-48`'s own Depends-on note). */}
        <Route path="/appearance" element={<AppearanceSettingsPage />} />
        {/* `22-06`/`adr/0093`: AGO Calendar's screens, moved from `ago-calendar-console`. Under
            `/calendar`, not `/settings/*` - `consoleNav.ts`'s own remarks have the "why this prefix"
            reasoning. Same "route stays outside the workspace layout, page gates itself internally"
            shape as every screen above, on `calendar:configure` rather than `site:configure`.
            `23-31`: three of these five routes rename (`/calendar` -> `/calendar/waiting`,
            `/calendar/workers` -> `/calendar/masters`, `/calendar/availability` ->
            `/calendar/schedule`; `/calendar/contacts` -> `/calendar/clients`), one gains a sibling
            (`/calendar/services`, carved out of `/calendar/setup`), and `/calendar/setup` itself
            keeps its own address (this file's own doc comment above has the full reasoning for why
            that one pair is not a redirect). Two routes
            (`/calendar/masters/:workerId/slots`, `.../recut`) are reached only from
            `CalendarWorkersPage`'s own row actions, not from the nav - the identical "drill-down
            route with no nav entry of its own" shape `/conversations/:conversationId` already has
            inside the workspace layout above. */}
        <Route path="/calendar/waiting" element={<CalendarQueuePage />} />
        {/* `23-34`: confirmed bookings, by day and by master - reachable by an operator holding
            `customer:read` even without `calendar:configure` (`CalendarBookingsPage`'s own doc
            comment; `buildCalendarItems` in `consoleNav.ts` carries the matching nav branch). */}
        <Route path="/calendar/bookings" element={<CalendarBookingsPage />} />
        <Route path="/calendar/setup" element={<CalendarSetupPage />} />
        <Route path="/calendar/services" element={<CalendarServicesPage />} />
        <Route path="/calendar/masters" element={<CalendarWorkersPage />} />
        <Route path="/calendar/masters/:workerId/slots" element={<CalendarWorkerSlotsPage />} />
        <Route path="/calendar/masters/:workerId/recut" element={<CalendarWorkerRecutPage />} />
        <Route path="/calendar/schedule" element={<CalendarAvailabilityPage />} />
        <Route path="/calendar/clients" element={<CalendarContactsPage />} />
        {/* `23-30`/`23-12`: the reveal audit trail - gated on `calendar:configure` like the setup
            screens, deliberately wider than the reveal action itself (`CalendarPhoneRevealsPage`'s
            own doc comment). `buildCalendarItems` in `consoleNav.ts` draws this entry only in the
            full-access branch. */}
        <Route path="/calendar/phone-reveals" element={<CalendarPhoneRevealsPage />} />
        {/* `23-60`/`adr/0161`: the merge audit trail - the identical `calendar:configure` gate and
            reasoning as the reveal audit trail immediately above. */}
        <Route path="/calendar/customer-merges" element={<CalendarCustomerMergesPage />} />

        {/* --- `23-31`: redirects for every moved address - eighteen genuine dead-address cases (the
            nineteenth, `/calendar/setup`, is not one - this file's own doc comment above has the
            reasoning), read from `movedRoutes.ts` rather than hand-written here so
            `movedRoutes.test.tsx` can prove each one against the exact list this renders, not a copy
            of it. `replace`, not a push: a stale bookmark should not grow the browser's own history
            with an extra, now-permanent entry for an address that no longer exists. */}
        {MOVED_ROUTES.map(({ from, to }) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}
        {/* Not one of the nineteen the nav table names (neither drill-down ever had a nav entry of
            its own), but a real consequence of `/calendar/workers` renaming to `/calendar/masters` -
            left un-redirected, these two would silently 404 for anyone who had followed a link deep
            into a specific worker's slots or re-cut screen. */}
        <Route path="/calendar/workers/:workerId/slots" element={<RedirectWorkerSlots />} />
        <Route path="/calendar/workers/:workerId/recut" element={<RedirectWorkerRecut />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
