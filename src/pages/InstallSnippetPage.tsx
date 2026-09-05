import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { fetchSiteInstallation, type SiteInstallationDto } from "../api/installationApi.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { PageHead } from "../shell/AppShell.js";
import { AccessRefusal } from "../shell/accessRefusal.js";
import { Panel } from "../components/Panel.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";
import { config } from "../config.js";
import { formatAbsolute, formatDateStamp, formatElapsed, parseInstant, resolveTimeZone } from "../time/format.js";

/**
 * `23-06`: the install screen's own headline panel, above the three `10-06` shipped. One of four
 * states, resolved server-side (`SiteInstallationState`) rather than re-derived here - this component
 * only picks the wording and the `Alert` tone that go with the state the API already chose, never a
 * second copy of `SiteInstallationStateResolver`'s own rule.
 *
 * **Why `Alert`, not a new component.** `adr/0030` closes the console's component set at eleven; a
 * fifth tone or a dedicated "status card" would be a new one. `Alert`'s three existing tones already
 * carry the right meaning for three of the four states (`info` for a next step, `success` for working,
 * `danger` for a live problem); `NeverSeenButInUse` also gets `info` - it is not a problem, and `info`
 * is the tone this set already uses for "here is where you stand, no action needed" (`installLoadingLabel`'s
 * sibling states use it identically elsewhere in this codebase).
 *
 * **Why <c>EveryRequestRefused</c> is `danger` even though nobody is currently failing to be helped.**
 * A refused origin is the one state here that names a concrete, fixable defect - `decisions.md`'s own
 * "the wrong one is the discouraging one" is about **silence** being misread as failure, not about
 * softening a real, live misconfiguration once it is actually found. `NotSeenYet` and
 * `NeverSeenButInUse` get `info` because neither has anything to fix yet.
 */
function InstallStatus({
  installation,
  now,
  timeZone,
  strings,
}: {
  installation: SiteInstallationDto;
  now: Date;
  timeZone: string | null;
  strings: ConsoleStrings;
}) {
  if (installation.state === "NotSeenYet") {
    return <Alert tone="info">{strings.installStatusNotSeenYet}</Alert>;
  }

  if (installation.state === "NeverSeenButInUse") {
    return <Alert tone="info">{strings.installStatusNeverSeenButInUse}</Alert>;
  }

  if (installation.state === "EveryRequestRefused") {
    return (
      <Alert tone="danger">
        {strings.installStatusRefusedPrefix} <code className="ago-mono">{installation.lastRefusedOrigin}</code>{" "}
        {strings.installStatusRefusedSuffix}
      </Alert>
    );
  }

  // SiteInstallationState.SeenAndQuiet - the only state carrying real timestamps to show.
  const lastSeen = parseInstant(installation.lastSeenAt);
  const firstSeen = parseInstant(installation.firstSeenAt);
  return (
    <Alert tone="success">
      <div>{strings.installStatusSeenAndQuiet}</div>
      {lastSeen && (
        <div>
          {strings.installStatusLastSeenLabel} {formatElapsed(lastSeen, now, strings)} {strings.agoSuffix}
        </div>
      )}
      {firstSeen && (
        <div title={formatAbsolute(firstSeen, timeZone, strings)}>
          {strings.installStatusFirstSeenLabel} {formatDateStamp(firstSeen, timeZone, strings)}
        </div>
      )}
    </Alert>
  );
}

/**
 * `10-06`: the screen the backlog item's own Gap section names as entirely missing - "the console
 * never tells her what to put on her website." Gated the same way every other `site:configure` settings
 * screen already is (`WidgetConfigPage`'s own doc comment has the full reasoning): `usePermissions()`
 * decides whether to render at all, client-side, UX only - the server's own `site:configure` check on
 * `GET /api/v1/sites/{siteId}/installation` is the actual gate, and an operator who reaches this route
 * some other way without the permission still gets a real `403`, surfaced as `loadError`, never hidden
 * as if the call had succeeded.
 *
 * <b>The snippet, and why it is composed rather than configured.</b> When this screen first shipped it
 * deliberately printed no `&lt;script&gt;` tag at all: checked against the real deployment rather than
 * assumed from a doc, **no public URL served the widget's script** - the bundle reached a browser only
 * because the two demo shops each bundled their own copy at their own origin, which does not
 * generalise to a real tenant's site. Inventing a URL would have handed a tenant a tag that 404s,
 * which is worse than an honest gap, so the box was reported unmet (`#324`).
 *
 * `adr/0092` closed it by serving the bundle at `{apiBaseUrl}/widget/`, and that choice is why there
 * is still **no second config value here**: the script's origin *is* the API's origin, so the snippet
 * is composed from `config.apiBaseUrl` rather than from a `VITE_WIDGET_BASE_URL` nobody would
 * remember to keep in step with it. A separate asset hostname would have forced exactly that second
 * value - see the ADR for why it was rejected on a bigger ground than this one.
 */
export function InstallSnippetPage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const strings = useStrings();
  const [installation, setInstallation] = useState<SiteInstallationDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [snippetCopied, setSnippetCopied] = useState(false);
  // `23-06`: resolved once per mount, the same `useState(() => resolveTimeZone())` shape every other
  // report page in this console already uses - this screen is not a live ticking display, so `now` is
  // frozen at load rather than re-read on every render.
  const [timeZone] = useState(() => resolveTimeZone());
  const [now] = useState(() => new Date());

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
    // `23-24`: shared `AccessRefusal`, replacing this screen's own copy of the block.
    return <AccessRefusal title={strings.navInstallWidget} message={strings.installForbidden} strings={strings} />;
  }

  const copyKey = () => {
    if (!installation) {
      return;
    }
    void navigator.clipboard.writeText(installation.publicKey);
    setCopied(true);
  };

  // `adr/0092`: the widget is served from the API's own origin, under `/widget/`. Composed here
  // rather than read from a second config value precisely because those two origins are the same
  // thing by decision - a `VITE_WIDGET_BASE_URL` would be a copy of `apiBaseUrl` that could drift
  // from it silently, and the drift would only surface on a tenant's own site.
  //
  // `#342`: the file is `widget.js` now, not `ago-chat.js` - the internal product name no longer
  // leaks into a tenant's own HTML. `ago-landing` handed out `widget.js` for weeks before any file
  // existed under that name anywhere; this is what finally made that filename true.
  const snippet =
    installation === null
      ? ""
      : `<script src="${config.apiBaseUrl}/widget/widget.js" data-site="${installation.publicKey}" async></script>`;

  const copySnippet = () => {
    void navigator.clipboard.writeText(snippet);
    setSnippetCopied(true);
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
          <Panel title={strings.installStatusPanelTitle}>
            <InstallStatus installation={installation} now={now} timeZone={timeZone} strings={strings} />
          </Panel>

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

          <Panel title={strings.installSnippetPanelTitle} description={strings.installSnippetPanelDescription}>
            <pre className="ago-mono ago-install-snippet">{snippet}</pre>
            <Button onClick={copySnippet}>{strings.installSnippetCopyButton}</Button>
            {snippetCopied && <Alert tone="success">{strings.installSnippetCopiedLabel}</Alert>}
          </Panel>
        </div>
      )}
    </>
  );
}
