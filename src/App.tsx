import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth.js";
import { CallbackPage } from "./pages/CallbackPage.js";
import { QueuePage } from "./pages/QueuePage.js";
import { ConversationPage } from "./pages/ConversationPage.js";

/** The routing shell `5-06` asks for: login (via `RequireAuth`'s own redirect, no separate landing
 * page) -> queue -> conversation, every real view still a placeholder (`5-07`). */
export function App() {
  return (
    <Routes>
      <Route path="/callback" element={<CallbackPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <QueuePage />
          </RequireAuth>
        }
      />
      <Route
        path="/conversations/:conversationId"
        element={
          <RequireAuth>
            <ConversationPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
