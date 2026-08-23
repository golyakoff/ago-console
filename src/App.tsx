import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth.js";
import { OperatorConnectionProvider } from "./realtime/OperatorConnectionProvider.js";
import { CallbackPage } from "./pages/CallbackPage.js";
import { QueuePage } from "./pages/QueuePage.js";
import { ConversationPage } from "./pages/ConversationPage.js";

/**
 * The routing shell: login (via `RequireAuth`'s own redirect, no separate landing page) -> queue ->
 * conversation. `5-06` scaffolded this with `RequireAuth` wrapping each route *separately* - `5-07`
 * changes that to one shared parent layout route (`RequireAuth` + `OperatorConnectionProvider`,
 * `<Outlet />` for whichever page is active) precisely so the operator hub connection those two
 * pages both need survives navigating between them, rather than being torn down and reopened on
 * every route change the way two independently-wrapped routes would do it.
 */
export function App() {
  return (
    <Routes>
      <Route path="/callback" element={<CallbackPage />} />
      <Route
        element={
          <RequireAuth>
            <OperatorConnectionProvider>
              <Outlet />
            </OperatorConnectionProvider>
          </RequireAuth>
        }
      >
        <Route path="/" element={<QueuePage />} />
        <Route path="/conversations/:conversationId" element={<ConversationPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
