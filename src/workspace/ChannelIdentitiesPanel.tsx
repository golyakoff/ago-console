import { useEffect, useState } from "react";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  fetchChannelIdentities,
  requestChannelLink,
  unlinkChannelIdentity,
  type ChannelIdentityDto,
} from "../api/channelIdentitiesApi.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { Alert } from "../components/Alert.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { Select } from "../components/Select.js";
import { Skeleton } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";

/** `Ago.Chat.Domain.ChannelKind`'s own members, verbatim - the picker offers every channel kind this
 * wire vocabulary knows, not only the ones this particular site has actually connected a bot for
 * (`ChannelIdentityEndpoints` accepts any real member and the pending request simply expires unconsumed
 * if the site never receives a matching inbound message - this panel does not read the site's own
 * connected-channels list to narrow the choice, a simplification worth stating rather than leaving
 * silent). */
const LINKABLE_CHANNEL_KINDS = ["Telegram", "WhatsApp", "Vk", "Max", "Avito", "Sms"] as const;

export interface ChannelIdentitiesPanelProps {
  conversationId: string;
  siteId: string | null;
  accessToken: string | null;
  /** `adr/0079` decision 2's own composer quick-insert - `Composer`'s own `insertCannedResponse`
   * precedent, threaded down from `ConversationPage`'s `setDraft` exactly the way that component
   * already threads `draft`/`onDraftChange` into `Composer` itself. Replaces whatever the operator had
   * typed, the same "insert replaces the draft" choice `handleSuggestReply`'s own remarks make for the
   * AI-suggestion case - a relay instruction and a half-typed reply are two different starting points,
   * not two pieces of one message. */
  onInsertIntoComposer: (text: string) => void;
}

/**
 * `14-12`/`adr/0079`: the visitor's own verified channel identities, a "link a channel" action that
 * starts the console-initiated confirmation flow, and an "unlink" action per row - the fourth "operator
 * manages a small piece of state about this visitor" panel in this aside, beside
 * `ConversationOutcomePanel`/`ConversationTagsPanel`/`ConversationNotesPanel`.
 *
 * Listing and requesting a link are both gated on `conversation:read`/`conversation:send` - the same
 * permissions every other panel here already requires to view or act on this conversation at all
 * (`RequestChannelLinkFromConsoleHandler`'s own remarks on why requesting a link needs no new,
 * channel-specific permission). Unlinking needs the new, tenant-granted `channel_identity:unlink`
 * instead - hidden, not shown disabled, for an operator without it, the same posture
 * `ConversationTagsPanel`'s own apply control already uses.
 */
export function ChannelIdentitiesPanel({
  conversationId,
  siteId,
  accessToken,
  onInsertIntoComposer,
}: ChannelIdentitiesPanelProps) {
  const { hasPermission } = usePermissions();
  const strings = useStrings();
  const [identities, setIdentities] = useState<ChannelIdentityDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pickerValue, setPickerValue] = useState<string>(LINKABLE_CHANNEL_KINDS[0]);
  const [requestedCode, setRequestedCode] = useState<{ code: string; kind: string; expiresAt: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setIdentities(null);
    setLoadError(null);
    setActionError(null);
    setRequestedCode(null);

    if (!accessToken || !hasPermission("conversation:read")) {
      return;
    }

    let cancelled = false;
    fetchChannelIdentities(accessToken, conversationId)
      .then((next) => {
        if (!cancelled) {
          setIdentities(next);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : strings.channelIdentitiesLoadError);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, accessToken, hasPermission, strings]);

  if (!hasPermission("conversation:read")) {
    return null;
  }

  const canRequestLink = hasPermission("conversation:send");
  const canUnlink = hasPermission("channel_identity:unlink");

  const handleRequestLink = async () => {
    if (!accessToken) {
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      const result = await requestChannelLink(accessToken, conversationId, pickerValue);
      setRequestedCode({ code: result.code, kind: result.kind, expiresAt: result.expiresAt });
      // Deliberately not run through `strings`: `HandleLinkIdentityCommandHandler`'s own visitor-
      // facing reply text (`ago-chat`) is plain, hardcoded English regardless of the widget's own
      // locale - this relay instruction says the identical thing on the operator's side of the same
      // flow, so localizing only this half would be inconsistent with what the visitor actually
      // receives when they start the flow themselves via `/linkidentity`.
      onInsertIntoComposer(
        `To link your ${result.kind} account, please message us there with this code: ${result.code}.`,
      );
    } catch (err) {
      setActionError(err instanceof ApiProblemError ? err.message : strings.channelIdentitiesRequestLinkError);
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async (identity: ChannelIdentityDto) => {
    if (!accessToken || !siteId) {
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      await unlinkChannelIdentity(accessToken, siteId, identity.channelIdentityId);
      setIdentities((prev) => (prev ?? []).filter((i) => i.channelIdentityId !== identity.channelIdentityId));
    } catch (err) {
      setActionError(err instanceof ApiProblemError ? err.message : strings.channelIdentitiesUnlinkError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ago-aside__section" aria-labelledby="ago-channel-identities-title">
      <h3 className="ago-aside__subtitle" id="ago-channel-identities-title">
        {strings.channelIdentitiesSectionTitle}
      </h3>

      {identities === null && !loadError ? (
        <Skeleton lines={1} label={strings.channelIdentitiesLoadingLabel} />
      ) : loadError ? (
        <Alert tone="danger">{loadError}</Alert>
      ) : identities && identities.length === 0 ? (
        <p className="ago-empty">{strings.channelIdentitiesNone}</p>
      ) : (
        <ul className="ago-aside__list">
          {identities?.map((identity) => (
            <li key={identity.channelIdentityId} className="ago-aside__row">
              <Badge tone="neutral">{identity.kind}</Badge>
              <span className="ago-mono">{identity.address}</span>
              {canUnlink && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleUnlink(identity)}
                  disabled={busy}
                >
                  {strings.channelIdentitiesUnlinkButton}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canRequestLink && (
        <div className="ago-row">
          <Select
            aria-label={strings.channelIdentitiesLinkKindLabel}
            value={pickerValue}
            onChange={(e) => setPickerValue(e.target.value)}
          >
            {LINKABLE_CHANNEL_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </Select>
          <Button type="button" size="sm" onClick={() => void handleRequestLink()} disabled={busy}>
            {strings.channelIdentitiesLinkButton}
          </Button>
        </div>
      )}

      {requestedCode && (
        <Alert tone="success">
          {strings.channelIdentitiesCodeGeneratedPrefix} {requestedCode.kind}: {requestedCode.code}
        </Alert>
      )}

      {actionError && <Alert tone="danger">{actionError}</Alert>}
    </section>
  );
}
