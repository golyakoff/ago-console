import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { userManager } from "../auth/userManager.js";

/** Keycloak redirects here with `?code=...&state=...` after the operator signs in -
 * `signinRedirectCallback()` exchanges the code for tokens (PKCE verified server-side against the
 * verifier `userManager` generated before the redirect) and fires `userLoaded`, which
 * `AuthProvider` is already listening for. */
export function CallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    userManager
      .signinRedirectCallback()
      .then(() => navigate("/", { replace: true }))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Unknown error."));
  }, [navigate]);

  if (error) {
    return <p>Sign-in failed: {error}</p>;
  }

  return <p>Completing sign-in…</p>;
}
