import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
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
 * `23-38`: `/automation/ai-suggestions` - the reply draft's own screen: on, off, and what it sends,
 * for a tenant who has already bought the AI add-on and made the two `25-04` declarations.
 *
 * <p><b>One flag, read and written twice, by two screens.</b> `AiAddOnEnablement` (ago-chat) is a
 * single per-site switch that both the operator-facing reply draft (`GenerateReplyDraftHandler`) and
 * the background conversation categoriser (`CategorizeConversationHandler`) consult - there is no
 * reply-draft-only flag in the domain model, and this screen does not invent one (that would be new
 * backend scope this item's own "Out of scope" - "changing what the draft does" sits right next to -
 * does not authorise). This screen calls the exact same `GET .../ai-add-on`, `POST .../enable` and
 * `POST .../disable` that `AiAddOnPage` (`25-04`, `/account/ai`) already calls; the two screens are two
 * doors onto the one switch, not two switches, and {@link aiReplyDraftSharedSwitchNote} says so on
 * screen rather than leaving a tenant to discover it by surprise when the categoriser stops.</p>
 *
 * <p><b>Why this screen exists at all, then, rather than just linking to `/account/ai`.</b> What
 * differs between the two doors is the framing `25-04`'s own item draws: `/account/ai` is where the
 * add-on is bought and the two legal facts (agreement acceptance, lawful-basis declaration) are
 * recorded, in AGO's own words about the add-on as a whole - `25-04`'s scope, restated as this item's
 * own "Out of scope: buying the add-on and accepting its terms". This screen is where a tenant who has
 * already done that reads, in reply-draft terms, what turning the switch on means for the one feature
 * they can actually observe (the categoriser runs invisibly over closed conversations), and turns it.
 * A tenant who has not finished the `25-04` preconditions is sent to `/account/ai` rather than shown a
 * second copy of the accept/declare controls here.</p>
 *
 * <p>Gated the way `AiAddOnPage`/`OfflineAutoReplyPage` established: `usePermissions()` decides
 * whether to render (UX only), while the server's own `site:configure` check on every route this page
 * calls is the real gate.</p>
 *
 * <p><b>Never an optimistic toggle.</b> `run` below re-fetches status after every mutating request and
 * renders from whatever the server returns rather than flipping local state on click - the identical
 * discipline `AiAddOnPage` already holds, and the reason this item's own "off is the state a tenant
 * lands in, always" is never contradicted by a UI that got ahead of the server.</p>
 */
export function AiReplyDraftPage() {
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
        setLoadError(err instanceof AiAddOnError ? err.message : strings.aiReplyDraftLoadError),
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
    return (
      <AccessRefusal
        title={strings.navAutomationAiSuggestions}
        message={strings.aiReplyDraftForbidden}
        strings={strings}
      />
    );
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
        setActionError(err instanceof AiAddOnError ? err.message : strings.aiReplyDraftLoadError),
      )
      .finally(() => setBusy(false));
  };

  const accepted = status?.acceptedVersion !== null && status?.acceptedVersion !== undefined;
  const declared = status?.declaredAt !== null && status?.declaredAt !== undefined;
  const canEnable = Boolean(status?.purchased) && accepted && declared;

  return (
    <>
      <PageHead title={strings.navAutomationAiSuggestions} />
      <p>{strings.aiReplyDraftIntro}</p>
      <Alert tone="info" title={strings.aiReplyDraftWhatLeavesHeading}>
        {strings.aiReplyDraftWhatLeaves}
      </Alert>
      {loadError !== null && <Alert tone="danger">{loadError}</Alert>}
      {actionError !== null && <Alert tone="danger">{actionError}</Alert>}

      {status === null ? (
        <Spinner label={strings.navAutomationAiSuggestions} />
      ) : !status.purchased ? (
        <Panel title={strings.navAutomationAiSuggestions}>
          <Alert tone="info">{strings.aiReplyDraftNotPurchased}</Alert>
          <p>
            <Link to="/account/ai">{strings.aiReplyDraftGoToAiFeatures}</Link>
          </p>
        </Panel>
      ) : !canEnable ? (
        <Panel title={strings.navAutomationAiSuggestions}>
          <Alert tone="info">{strings.aiReplyDraftSetupIncomplete}</Alert>
          <p>
            <Link to="/account/ai">{strings.aiReplyDraftGoToAiFeatures}</Link>
          </p>
        </Panel>
      ) : (
        <Panel title={strings.navAutomationAiSuggestions}>
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
          <p>{strings.aiReplyDraftSharedSwitchNote}</p>
          {status.enabled ? (
            <Button disabled={busy} onClick={() => run(disableAiAddOn)}>
              {strings.aiReplyDraftDisableLabel}
            </Button>
          ) : (
            <Button disabled={busy} onClick={() => run(enableAiAddOn)}>
              {strings.aiReplyDraftEnableLabel}
            </Button>
          )}
        </Panel>
      )}
    </>
  );
}
