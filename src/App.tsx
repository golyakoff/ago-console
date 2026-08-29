import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth.js";
import { PermissionsProvider } from "./auth/PermissionsProvider.js";
import { OperatorConnectionProvider } from "./realtime/OperatorConnectionProvider.js";
import { OperatorShell } from "./shell/OperatorShell.js";
import { CallbackPage } from "./pages/CallbackPage.js";
import { SignupPage } from "./pages/SignupPage.js";
import { OnboardingPage } from "./pages/OnboardingPage.js";
import { WorkspaceLayout } from "./workspace/WorkspaceLayout.js";
import { NoConversationSelected } from "./workspace/NoConversationSelected.js";
import { ConversationPage } from "./pages/ConversationPage.js";
import { AdminConversationsPage } from "./pages/AdminConversationsPage.js";
import { SearchConversationsPage } from "./pages/SearchConversationsPage.js";
import { WidgetConfigPage } from "./pages/WidgetConfigPage.js";
import { OfflineAutoReplyPage } from "./pages/OfflineAutoReplyPage.js";
import { BillingPage } from "./pages/BillingPage.js";
import { AccountDeletionPage } from "./pages/AccountDeletionPage.js";
import { OwnerSitesPage } from "./owner/OwnerSitesPage.js";

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
 * `/admin` is a third page behind the same `RequireAuth` gate - `AdminConversationsPage` does its own
 * *permission* gating internally (via `usePermissions()`), the same "authenticated is a route
 * concern, authorized is a page concern" split every `ago-chat` handler already draws
 * (`adr/0016`'s "the check happens in Application, never at the transport edge" - the console's own
 * analogue is "never at the router").
 *
 * `11-02`: `/settings/widget` joins the same layout on the identical pattern - `WidgetConfigPage`
 * gates itself on `site:configure` internally, exactly like `/admin` above.
 *
 * `10-03`: two more routes, both outside the operator layout above on purpose - `adr/0023`'s own
 * addendum has the full "this is a fourth surface" reasoning. `/signup` carries no guard at all (a
 * visitor with zero session must be able to reach it - `SignupPage`'s own doc comment on why it is
 * not linked from `/`). `/onboarding` is gated by `RequireAuth` *alone*, deliberately not wrapped in
 * `PermissionsProvider`/`OperatorConnectionProvider` - both assume `OperatorId`/`SiteId` claims a
 * Keycloak-identity-only token (state (b), `CallbackPage`'s own routing) does not carry yet, and
 * `RequireAuth`'s existing "is there any OIDC session" check is exactly the gate this state needs,
 * nothing narrower.
 *
 * `11-05`: the operator layout route's element is now `OperatorShell` rather than a bare `<Outlet />`
 * - the shell renders the persistent header (identity, permission-gated navigation with an active
 * state, sign-out) and puts the `<Outlet />` inside its own `<main>`. It is mounted here, inside the
 * providers, precisely because it reads `usePermissions()`; the three routes above it that live
 * outside those providers render `AppShell`/`CenteredShell` themselves instead, which take
 * everything they display as props and read no context. No route's guarding changed - this is a
 * presentation change and the tree is the same shape it was, one element deeper.
 */
export function App() {
  return (
    <Routes>
      <Route path="/callback" element={<CallbackPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <OnboardingPage />
          </RequireAuth>
        }
      />
      {/* `12-03`: `/owner` - the platform owner's cross-tenant operations view. Three things about
          this route are deliberate:

          **The path contains no "admin".** `5-08`'s `/admin` is a *tenant's own* supervisor looking
          at their own site; this is the operator of the service looking at every site. The
          authorization model draws that line sharply (`authorization.md`), a URL ends up in logs and
          screenshots, and `12-02` made the same choice server-side (`/api/v1/owner/`, never
          `/api/v1/admin/`). The two surfaces share no route segment, no endpoint and no component
          tree.

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
      <Route
        element={
          <RequireAuth>
            <PermissionsProvider>
              <OperatorConnectionProvider>
                <OperatorShell />
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
            they are now two states of one screen rather than two pages. `/admin` and
            `/settings/widget` stay outside it - they are ordinary full-width pages and have nothing
            to do with a conversation list. */}
        <Route element={<WorkspaceLayout />}>
          <Route path="/" element={<NoConversationSelected />} />
          <Route path="/conversations/:conversationId" element={<ConversationPage />} />
        </Route>
        <Route path="/admin" element={<AdminConversationsPage />} />
        {/* `18-01`: same "outside the workspace layout, page gates itself internally" shape as `/admin`
            right above it - `SearchConversationsPage` checks `site:configure` itself, exactly like
            `AdminConversationsPage` does. */}
        <Route path="/search" element={<SearchConversationsPage />} />
        <Route path="/settings/widget" element={<WidgetConfigPage />} />
        {/* `14-04`: a second settings screen on the identical pattern - `OfflineAutoReplyPage` gates
            itself on `site:configure` internally, exactly like the two routes above it. */}
        <Route path="/settings/auto-reply" element={<OfflineAutoReplyPage />} />
        {/* `13-04`: a third settings screen, same pattern again - `BillingPage` gates itself on
            `site:configure` internally, exactly like the two routes above it. */}
        <Route path="/settings/billing" element={<BillingPage />} />
        {/* `16-02`: a third settings screen, on the same "route stays outside the workspace layout,
            page gates itself internally" shape - but on `site:erase`, not `site:configure`
            (`AccountDeletionPage`'s own doc comment). */}
        <Route path="/settings/delete-account" element={<AccountDeletionPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
