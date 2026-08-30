import { useEffect, useState } from "react";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  fetchContactDetails,
  recordContactDetail,
  deleteContactDetail,
  type ContactDetailDto,
} from "../api/contactDetailsApi.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { Alert } from "../components/Alert.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { Input } from "../components/Input.js";
import { Select } from "../components/Select.js";
import { Skeleton } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";

/** `Ago.Chat.Domain.VisitorContactDetailKind`'s own members, verbatim - the same "wire value, not a
 * display label" choice `ChannelIdentitiesPanel`'s `LINKABLE_CHANNEL_KINDS` already makes for its own
 * closed enum. */
const CONTACT_DETAIL_KINDS = ["Phone", "Email", "Other"] as const;

export interface ContactDetailsPanelProps {
  conversationId: string;
  accessToken: string | null;
}

/**
 * `14-14`/`adr/0079` section 6: a phone number, email address, or other fact an operator typed
 * because a visitor said it out loud - a fifth "operator manages a small piece of state about this
 * visitor" panel, beside `ChannelIdentitiesPanel`/`ConversationOutcomePanel`/`ConversationTagsPanel`/
 * `ConversationNotesPanel`.
 *
 * **Deliberately not merged into `ChannelIdentitiesPanel`, and deliberately styled to look like a
 * different kind of fact, not just live in a different file.** A linked channel identity is
 * evidence-based - proven by a real inbound message or a verification code
 * (`ChannelIdentitiesPanel`'s own doc comment). A contact detail is only ever an operator's own
 * unverified claim, so this panel gets its own heading and its own caption stating that plainly, and
 * renders each row with a distinct badge tone from `ChannelIdentitiesPanel`'s - an operator scanning
 * the aside should be able to tell "verified" from "someone typed this" without reading either
 * panel's copy closely. This value is **never** sent anywhere: recording and deleting are the only
 * two actions this panel (or its backing endpoints) offer, both gated on `conversation:send` - there
 * is no "promote to channel identity" action anywhere in this codebase.
 *
 * Reading is gated on `conversation:read`, the same permission `ConversationNotesPanel` reuses for
 * its own read half (`ListVisitorContactDetailsHandler`'s own remarks); recording and deleting both
 * need `conversation:send` (`RecordVisitorContactDetailHandler`'s own remarks on why this is not a
 * dedicated permission) - the form and each row's delete button are hidden, not shown disabled, for
 * an operator without it, the same posture `ConversationNotesPanel`'s own textarea already uses.
 */
export function ContactDetailsPanel({ conversationId, accessToken }: ContactDetailsPanelProps) {
  const { hasPermission } = usePermissions();
  const strings = useStrings();
  const [details, setDetails] = useState<ContactDetailDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kindDraft, setKindDraft] = useState<string>(CONTACT_DETAIL_KINDS[0]);
  const [valueDraft, setValueDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setDetails(null);
    setLoadError(null);
    setActionError(null);
    setValueDraft("");

    if (!accessToken || !hasPermission("conversation:read")) {
      return;
    }

    let cancelled = false;
    fetchContactDetails(accessToken, conversationId)
      .then((next) => {
        if (!cancelled) {
          setDetails(next);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : strings.contactDetailsLoadError);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, accessToken, hasPermission, strings]);

  if (!hasPermission("conversation:read")) {
    return null;
  }

  const canRecord = hasPermission("conversation:send");

  const handleRecord = async (event: React.FormEvent) => {
    event.preventDefault();
    setActionError(null);
    const value = valueDraft.trim();
    if (!accessToken || !value) {
      return;
    }

    setBusy(true);
    try {
      const recorded = await recordContactDetail(accessToken, conversationId, kindDraft, value);
      setDetails((prev) => [...(prev ?? []), recorded]);
      setValueDraft("");
    } catch (err) {
      setActionError(err instanceof ApiProblemError ? err.message : strings.contactDetailsRecordError);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (detail: ContactDetailDto) => {
    if (!accessToken) {
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      await deleteContactDetail(accessToken, conversationId, detail.id);
      setDetails((prev) => (prev ?? []).filter((d) => d.id !== detail.id));
    } catch (err) {
      setActionError(err instanceof ApiProblemError ? err.message : strings.contactDetailsDeleteError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ago-aside__section" aria-labelledby="ago-contact-details-title">
      <h3 className="ago-aside__subtitle" id="ago-contact-details-title">
        {strings.contactDetailsSectionTitle}
      </h3>
      <p className="ago-aside__note">{strings.contactDetailsCaption}</p>

      {details === null && !loadError ? (
        <Skeleton lines={1} label={strings.contactDetailsLoadingLabel} />
      ) : loadError ? (
        <Alert tone="danger">{loadError}</Alert>
      ) : details && details.length === 0 ? (
        <p className="ago-empty">{strings.contactDetailsEmpty}</p>
      ) : (
        <ul className="ago-aside__list">
          {details?.map((detail) => (
            <li key={detail.id} className="ago-aside__row">
              <Badge tone="accent">{detail.kind}</Badge>
              <span>{detail.value}</span>
              {canRecord && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleDelete(detail)}
                  disabled={busy}
                >
                  {strings.contactDetailsDeleteButton}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canRecord && (
        <form className="ago-row" onSubmit={(e) => void handleRecord(e)}>
          <Select
            aria-label={strings.contactDetailsKindLabel}
            value={kindDraft}
            onChange={(e) => setKindDraft(e.target.value)}
          >
            {CONTACT_DETAIL_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </Select>
          <Input
            value={valueDraft}
            onChange={(e) => setValueDraft(e.target.value)}
            placeholder={strings.contactDetailsValuePlaceholder}
            disabled={busy}
            aria-label={strings.contactDetailsValuePlaceholder}
          />
          <Button type="submit" size="sm" disabled={busy || !valueDraft.trim()}>
            {busy ? strings.contactDetailsRecordingButton : strings.contactDetailsRecordButton}
          </Button>
        </form>
      )}

      {actionError && <Alert tone="danger">{actionError}</Alert>}
    </section>
  );
}
