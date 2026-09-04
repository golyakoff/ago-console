import { useEffect, useRef, useState } from "react";
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

/** `23-10`: text an operator selected in the transcript and asked to promote - `Thread`'s own
 * `onPromoteSelection`, relayed unchanged through `ConversationPage`. `token` exists only so this
 * panel's effect can tell "the operator promoted the same text a second time" from "the operator
 * promoted nothing new" - two plain `string`s that happen to be equal would otherwise look identical
 * to React's dependency comparison, and the second promotion would silently do nothing. */
export interface PromotedContactDraft {
  value: string;
  token: number;
}

export interface ContactDetailsPanelProps {
  conversationId: string;
  accessToken: string | null;
  /** `23-10`: `null` for the ordinary case (nothing promoted yet, or since this conversation was
   * opened - `ConversationPage` resets it on every conversation switch). Set once per act on a
   * message, never written to a request itself: this panel still requires the operator's own
   * **Record** click, exactly as it did before this item. */
  contactDraft?: PromotedContactDraft | null;
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
 *
 * `23-10`: `contactDraft` pre-fills the form below from a message the operator selected and promoted
 * in `Thread` - kind defaults to `"Phone"` (this item's own goal is a phone number, and the operator
 * can still change it before recording), the value is the selected text verbatim, and focus moves to
 * the value field so the very next keystroke either confirms it or fixes it. **Nothing is recorded by
 * this effect** - it only calls the same `setKindDraft`/`setValueDraft` the operator's own typing
 * already drives, so a promoted draft is indistinguishable, from this point on, from one the operator
 * typed by hand into an empty form. Recording still needs the existing **Record** click below.
 */
export function ContactDetailsPanel({ conversationId, accessToken, contactDraft }: ContactDetailsPanelProps) {
  const { hasPermission } = usePermissions();
  const strings = useStrings();
  const [details, setDetails] = useState<ContactDetailDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kindDraft, setKindDraft] = useState<string>(CONTACT_DETAIL_KINDS[0]);
  const [valueDraft, setValueDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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

  // `23-10`: applies a freshly-promoted selection to the draft, keyed on `token` rather than `value`
  // so promoting the same text twice in a row (the operator changes their mind, then promotes the
  // identical phrase again) still re-focuses the field instead of silently doing nothing the second
  // time. Deliberately does not depend on `canRecord`: `ConversationPage` only ever passes
  // `onPromoteSelection` to `Thread` for an operator who already holds `conversation:send`, so a
  // `contactDraft` reaching this component with the form absent is not a case this effect needs to
  // guard against - `formRef.current` is simply `null` then, and the focus call below is a no-op.
  useEffect(() => {
    if (!contactDraft) {
      return;
    }

    setKindDraft("Phone");
    setValueDraft(contactDraft.value);
    setActionError(null);
    formRef.current?.querySelector<HTMLInputElement>("input:not([type=hidden])")?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactDraft?.token]);

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
        <form ref={formRef} className="ago-row" onSubmit={(e) => void handleRecord(e)}>
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
