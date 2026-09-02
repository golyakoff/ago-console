import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { fetchSiteInstallation, type SiteInstallationDto } from "../api/installationApi.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";

/**
 * `10-06`: the screen the backlog item's own Gap section names as entirely missing - "the console
 * never tells her what to put on her website." Gated the same way every other `site:configure` settings
 * screen already is (`WidgetConfigPage`'s own doc comment has the full reasoning): `usePermissions()`
 * decides whether to render at all, client-side, UX only - the server's own `site:configure` check on
 * `GET /api/v1/sites/{siteId}/installation` is the actual gate, and an operator who reaches this route
 * some other way without the permission still gets a real `403`, surfaced as `loadError`, never hidden
 * as if the call had succeeded.
 *
 * <b>Why this page shows no `&lt;script&gt;` tag.</b> The backlog item's third Done-when box asks for
 * "a complete, copyable snippet" that "produces a working widget" when pasted. Checked against the real
 * deployment before writing this screen, not assumed from a doc: no public URL serves the widget's own
 * script for an arbitrary tenant today - `Ago.Chat.Api`'s edge routes proxy only `/healthz`, `/api` and
 * `/hubs`, and the widget bundle currently reaches a browser only because the two demo shops happen to
 * bundle their own copy at their own origin, which does not generalise to a real tenant's site.
 * `src/config.ts` has no field for a widget-script origin either - inventing one here would be the
 * exact trap this item's own brief warns against ("do not let this become a second config value" /
 * "say so in your report rather than inventing one"). So this screen shows only what is real and will
 * not change out from under a tenant - the site's own key and its configured web address - and says
 * plainly, in the tenant's own language, that the paste-ready snippet is not available yet. That third
 * Done-when box is reported as unmet, not silently redefined by this screen's own scope.
 */
export function InstallSnippetPage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const strings = useStrings();
  const [installation, setInstallation] = useState<SiteInstallationDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    fetchSiteInstallation(accessToken, siteId)
      .then((dto) => {
        setInstallation(dto);
        setLoadError(null);
      })
      .catch((err: unknown) => setLoadError(err instanceof ApiProblemError ? err.message : strings.installLoadError));
  }, [user?.access_token, siteId, strings]);

  useEffect(() => {
    if (!hasPermission("site:configure")) {
      return;
    }
    load();
  }, [load, hasPermission]);

  // `WidgetConfigPage`'s own guard, restated here: "not yet known" is not "denied"
  // (`PermissionsContext`'s own rule) - refusing before `GET /api/v1/operators/me` answers would
  // accuse every operator of lacking a permission they may well hold, for as long as one round trip
  // takes.
  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission("site:configure")) {
    return (
      <>
        <PageHead title={strings.navInstallWidget} />
        <Alert tone="danger">{strings.installForbidden}</Alert>
        <p>
          <Link to="/">{strings.siteConfigBackToQueue}</Link>
        </p>
      </>
    );
  }

  const copyKey = () => {
    if (!installation) {
      return;
    }
    void navigator.clipboard.writeText(installation.publicKey);
    setCopied(true);
  };

  return (
    <>
      <PageHead title={strings.navInstallWidget} description={strings.installDescription} />

      {loadError && <Alert tone="danger">{loadError}</Alert>}

      {loadError ? null : installation === null ? (
        <Panel>
          <Skeleton lines={2} label={strings.installLoadingLabel} />
        </Panel>
      ) : (
        <div className="ago-stack">
          <Panel title={strings.installKeyPanelTitle} description={strings.installKeyPanelDescription}>
            <div className="ago-row">
              <code className="ago-mono ago-install-value">{installation.publicKey}</code>
              <Button onClick={copyKey}>{strings.installKeyCopyButton}</Button>
            </div>
            {copied && <Alert tone="success">{strings.installKeyCopiedLabel}</Alert>}
          </Panel>

          <Panel title={strings.installOriginPanelTitle} description={strings.installOriginPanelDescription}>
            {installation.allowedOrigins.length > 0 ? (
              <ul className="ago-install-origin-list">
                {installation.allowedOrigins.map((origin) => (
                  <li key={origin}>
                    <code className="ago-mono ago-install-value">{origin}</code>
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>

          <Alert tone="info" title={strings.installScriptNotReadyTitle}>
            {strings.installScriptNotReadyBody}
          </Alert>
        </div>
      )}
    </>
  );
}
