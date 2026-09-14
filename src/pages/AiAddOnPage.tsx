import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  acceptAiAddOnAgreement,
  declareAiProcessingBasis,
  disableAiAddOn,
  enableAiAddOn,
  fetchAiAddOnStatus,
  AiAddOnError,
  type AiAddOnStatusDto,
} from "../api/aiAddOnApi.js";
import { PageHead } from "../shell/AppShell.js";
import { AccessRefusal } from "../shell/accessRefusal.js";
import { Panel } from "../components/Panel.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Badge } from "../components/Badge.js";
import { Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";

/**
 * `25-04`: `/settings/ai` - the one screen where a tenant turns the AI features on, and the only
 * place the two facts behind that are ever made.
 *
 * <p><b>Three controls, never one.</b> Accepting the agreement, declaring a lawful basis and switching
 * the feature on are three separate requests producing three separately-timestamped records, because
 * they are three different statements: "we agree to AGO's terms", "we hold a basis covering our own
 * visitors", and "turn it on". A single "I agree and enable" button would have recorded them at one
 * instant with one author and destroyed the distinction the schema exists to keep - and, more to the
 * point, it would have let a tenant assert something about their own customers without noticing they
 * had.</p>
 *
 * <p><b>The two evidence lines stay separate on screen too</b>, each showing its own date, so a tenant
 * who has done one and not the other can see which. The enable button stays disabled until both are
 * present and says so.</p>
 *
 * <p>Gated the way `OfflineAutoReplyPage` established: `usePermissions()` decides whether to render
 * (UX only), while the server's own `site:configure` check on every one of these routes is the real
 * gate.</p>
 */
export function AiAddOnPage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const strings = useStrings();
  const [status, setStatus] = useState<AiAddOnStatusDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    fetchAiAddOnStatus(accessToken, siteId)
      .then((dto) => {
        setStatus(dto);
        setLoadError(null);
      })
      .catch((err: unknown) =>
        setLoadError(err instanceof AiAddOnError ? err.message : strings.aiAddOnLoadError),
      );
  }, [user?.access_token, siteId, strings]);

  useEffect(() => {
    if (!hasPermission("site:configure")) {
      return;
    }
    load();
  }, [load, hasPermission]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission("site:configure")) {
    return <AccessRefusal title={strings.navAiAddOn} message={strings.aiAddOnForbidden} strings={strings} />;
  }

  const run = (action: (accessToken: string, siteId: string) => Promise<void>) => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    setBusy(true);
    setActionError(null);
    action(accessToken, siteId)
      .then(() => load())
      .catch((err: unknown) =>
        setActionError(err instanceof AiAddOnError ? err.message : strings.aiAddOnLoadError),
      )
      .finally(() => setBusy(false));
  };

  const accepted = status?.acceptedVersion !== null && status?.acceptedVersion !== undefined;
  const declared = status?.declaredAt !== null && status?.declaredAt !== undefined;
  const canEnable = Boolean(status?.purchased) && accepted && declared;

  return (
    <>
      <PageHead title={strings.navAiAddOn} />
      {loadError !== null && <Alert tone="danger">{loadError}</Alert>}
      {actionError !== null && <Alert tone="danger">{actionError}</Alert>}

      <Panel title={strings.navAiAddOn}>
        <p>{strings.aiAddOnIntro}</p>
        {status === null ? (
          <Spinner label={strings.navAiAddOn} />
        ) : (
          <>
            <p>
              <Badge tone={status.enabled ? "success" : "neutral"} dot>
                {status.enabled ? strings.aiAddOnStatusOn : strings.aiAddOnStatusOff}
              </Badge>
            </p>
            {status.enabled && status.effectiveFrom !== null && (
              <p>
                {strings.aiAddOnEffectiveFrom} <time dateTime={status.effectiveFrom}>{status.effectiveFrom}</time>
              </p>
            )}
            {!status.purchased && <Alert tone="info">{strings.aiAddOnNotPurchased}</Alert>}
          </>
        )}
      </Panel>

      {status !== null && (
        <>
          <Panel title={strings.aiAddOnAgreementHeading}>
            {status.currentBody === null || status.currentVersion === null ? (
              <Alert tone="info">{strings.aiAddOnAgreementMissing}</Alert>
            ) : (
              <>
                <pre>{status.currentBody}</pre>
                {accepted ? (
                  <p>
                    {strings.aiAddOnAcceptedOn} {status.acceptedVersion}
                    {status.acceptedAt !== null && (
                      <>
                        {" "}
                        <time dateTime={status.acceptedAt}>{status.acceptedAt}</time>
                      </>
                    )}
                  </p>
                ) : (
                  <>
                    <p>{strings.aiAddOnNotAccepted}</p>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        run((token, site) => acceptAiAddOnAgreement(token, site, status.currentVersion ?? ""))
                      }
                    >
                      {strings.aiAddOnAcceptLabel}
                    </Button>
                  </>
                )}
              </>
            )}
          </Panel>

          {/* A panel of its own, not a second checkbox under the agreement - this is the tenant
              speaking about their own visitors, and it is recorded as its own dated fact. */}
          <Panel title={strings.aiAddOnDeclarationHeading}>
            <p>{strings.aiAddOnDeclarationText}</p>
            {declared ? (
              <p>
                {strings.aiAddOnDeclaredOn}{" "}
                {status.declaredAt !== null && <time dateTime={status.declaredAt}>{status.declaredAt}</time>}
              </p>
            ) : (
              <>
                <p>{strings.aiAddOnNotDeclared}</p>
                <Button disabled={busy} onClick={() => run(declareAiProcessingBasis)}>
                  {strings.aiAddOnDeclareLabel}
                </Button>
              </>
            )}
          </Panel>

          <Panel title={strings.navAiAddOn}>
            {status.enabled ? (
              <Button disabled={busy} onClick={() => run(disableAiAddOn)}>
                {strings.aiAddOnDisableLabel}
              </Button>
            ) : (
              <>
                <Button disabled={busy || !canEnable} onClick={() => run(enableAiAddOn)}>
                  {strings.aiAddOnEnableLabel}
                </Button>
                {!canEnable && status.purchased && <p>{strings.aiAddOnEnableBlocked}</p>}
              </>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
