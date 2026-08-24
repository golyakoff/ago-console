import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { registerSite, RegisterSiteError } from "../api/sitesApi.js";
import { AppShell, PageHead, ShellIdentity } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";

/**
 * `10-03`: state (b)'s destination - a real, signature-valid Keycloak identity (`CallbackPage`'s
 * `resolveOperatorState()` returned `"keycloak-identity-only"`) that has completed Keycloak's own
 * registration/email-verification flow but resolves to no `operators` row yet. Mounted behind
 * `RequireAuth` directly (`App.tsx`) - that guard only checks "is there an OIDC session at all," which
 * is exactly the right (and only) gate here; it is not wrapped in `PermissionsProvider`/
 * `OperatorConnectionProvider`, since both assume operator claims (`OperatorId`/`SiteId`) this token
 * does not carry yet and would fail or hang against.
 *
 * On success, this navigates to `/` using the *same* held access token, unchanged - no new Keycloak
 * round trip. `OperatorIdentityClaimsTransformation` (`Ago.Chat.Api`) resolves `sub` against
 * `operators` fresh on every request rather than baking the result into the JWT itself, so the moment
 * `10-02`'s bootstrap endpoint commits the new `Operator` row, the *same* token this page already
 * holds starts passing `RequireOperatorIdentity` on the very next call - exactly the "no separate
 * new-operator branch downstream" the backlog asks for, and the reason this page needs no token
 * refresh/re-login step of its own.
 *
 * `11-05`: renders `AppShell` directly with an identity block but no navigation - there is nothing to
 * navigate to yet, and `usePermissions()` is unavailable here by design (this route is deliberately
 * outside `PermissionsProvider`, see above), which is exactly the case `AppShell`'s props-only,
 * context-free design exists for.
 */
export function OnboardingPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [siteName, setSiteName] = useState("");
  const [origin, setOrigin] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // UX-only - `10-02`'s `RegisterSiteHandler`/`OriginValidator` are the real gate (server-side,
  // authoritative) and reject anything this check would have let through incorrectly. This mirrors
  // `OriginValidator`'s own "scheme://host[:port], no path/query/fragment" shape closely enough to
  // catch an obvious typo before a round trip, but deliberately does not try to replicate every rule
  // (default-port/trailing-slash normalization) - a false "looks fine" here just means the server
  // catches it instead and this page surfaces that `detail` text unchanged.
  function validate(): string | null {
    if (siteName.trim().length === 0) {
      return "Site display name cannot be empty.";
    }

    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return "Embed origin must start with http:// or https://.";
      }
    } catch {
      return "Embed origin must look like a URL, e.g. https://shop.example.com.";
    }

    return null;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);

    const error = validate();
    setValidationError(error);
    if (error) {
      return;
    }

    const accessToken = user?.access_token;
    if (!accessToken) {
      // `RequireAuth` guarantees a signed-in Keycloak session by the time this page renders - same
      // "reaching here is a wiring bug" reasoning `PermissionsProvider`/`OperatorConnectionProvider`
      // already state for their own equivalent check.
      return;
    }

    setSubmitting(true);
    try {
      await registerSite(accessToken, { siteName: siteName.trim(), initialAllowedOrigin: origin });
      void navigate("/", { replace: true });
    } catch (err) {
      setSubmitError(err instanceof RegisterSiteError ? err.message : "Failed to set up your site. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      identity={
        <ShellIdentity
          operator={user?.profile.preferred_username ?? user?.profile.sub ?? "Signed in"}
          // No site yet - that is the entire reason this page exists.
          siteId={null}
          onSignOut={() => void logout()}
        />
      }
    >
      <PageHead
        title="Finish setting up your site"
        description="Your Keycloak account is verified. Choose a display name and the one website origin your widget will be embedded on."
      />

      <Panel>
        <form className="ago-stack" onSubmit={(e) => void handleSubmit(e)}>
          <Field label="Site display name">
            {(controlProps) => (
              <Input
                {...controlProps}
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                disabled={submitting}
              />
            )}
          </Field>

          <Field
            label="Embed origin"
            description="Scheme, host and port only - no path, e.g. https://shop.example.com."
          >
            {(controlProps) => (
              <Input
                {...controlProps}
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="https://shop.example.com"
                disabled={submitting}
              />
            )}
          </Field>

          {/* Kept as two form-level messages rather than split onto the fields they came from.
              `validate()` returns one message at a time and stops at the first failure, and telling
              which field a message belongs to would mean either matching on its text - brittle - or
              changing `validate()`'s shape, which is code this presentation-only item has no reason
              to touch. `Alert tone="danger"` carries `role="alert"`, exactly as the two bare
              `<p role="alert">` paragraphs here did before `11-05`. */}
          {validationError && <Alert tone="danger">{validationError}</Alert>}
          {submitError && <Alert tone="danger">{submitError}</Alert>}

          <div className="ago-row">
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Setting up…" : "Finish setup"}
            </Button>
          </div>
        </form>
      </Panel>
    </AppShell>
  );
}
