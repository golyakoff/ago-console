import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth.js";
import { PermissionsProvider } from "./auth/PermissionsProvider.js";
import { OperatorConnectionProvider } from "./realtime/OperatorConnectionProvider.js";
import { CallbackPage } from "./pages/CallbackPage.js";
import { SignupPage } from "./pages/SignupPage.js";
import { OnboardingPage } from "./pages/OnboardingPage.js";
import { QueuePage } from "./pages/QueuePage.js";
import { ConversationPage } from "./pages/ConversationPage.js";
import { AdminConversationsPage } from "./pages/AdminConversationsPage.js";

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
 * `10-03`: two more routes, both outside the operator layout above on purpose - `adr/0023`'s own
 * addendum has the full "this is a fourth surface" reasoning. `/signup` carries no guard at all (a
 * visitor with zero session must be able to reach it - `SignupPage`'s own doc comment on why it is
 * not linked from `/`). `/onboarding` is gated by `RequireAuth` *alone*, deliberately not wrapped in
 * `PermissionsProvider`/`OperatorConnectionProvider` - both assume `OperatorId`/`SiteId` claims a
 * Keycloak-identity-only token (state (b), `CallbackPage`'s own routing) does not carry yet, and
 * `RequireAuth`'s existing "is there any OIDC session" check is exactly the gate this state needs,
 * nothing narrower.
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
      <Route
        element={
          <RequireAuth>
            <PermissionsProvider>
              <OperatorConnectionProvider>
                <Outlet />
              </OperatorConnectionProvider>
            </PermissionsProvider>
          </RequireAuth>
        }
      >
        <Route path="/" element={<QueuePage />} />
        <Route path="/conversations/:conversationId" element={<ConversationPage />} />
        <Route path="/admin" element={<AdminConversationsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
