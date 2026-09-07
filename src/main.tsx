import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import { App } from "./App.js";
import { AuthProvider } from "./auth/AuthProvider.js";
import { CenteredShell } from "./shell/AppShell.js";
import { RenderErrorAlert, RenderErrorBoundary } from "./shell/RenderErrorBoundary.js";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("index.html is missing its #root element.");
}

createRoot(rootElement).render(
  <StrictMode>
    {/* `23-41`: the outermost of `RenderErrorBoundary`'s three mount points - see its own doc
        comment. Wraps `BrowserRouter`/`AuthProvider` too, not just `<App />`: a provider's own
        render throwing is exactly as capable of blanking the whole console as a page component's
        is, and neither `AppShell` nor `OperatorShell` sit above those two to catch it. */}
    <RenderErrorBoundary
      fallback={(_error, reset) => (
        <CenteredShell>
          <RenderErrorAlert onRetry={reset} />
        </CenteredShell>
      )}
    >
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </RenderErrorBoundary>
  </StrictMode>,
);
