import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import { App } from "./App.js";
import { AuthProvider } from "./auth/AuthProvider.js";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("index.html is missing its #root element.");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
