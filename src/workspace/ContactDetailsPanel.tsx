import { useEffect, useState } from "react";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  fetchContactDetails,
  editContactDetail,
  revealContactDetail,
  setContactDetailAssessment,
  type ContactDetailDto,
} from "../api/contactDetailsApi.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { Alert } from "../components/Alert.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { Input } from "../components/Input.js";
import { Skeleton } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";

export interface ContactDetailsPanelProps {
  conversationId: string;
  accessToken: string | null;
}

/** `Ago.Chat.Domain.VisitorContactDetailKind`'s own members, verbatim, mapped to the real Russian (or
 * English) words this pill actually means - never the raw wire value (`ChannelIdentitiesPanel`'s own
 * `LINKABLE_CHANNEL_KINDS` renders through `strings` the same way for its own closed enum).
 * `"Name"` (`25-62`) reads "Имя"/"Name" - the visitor's own name, typed into the widget's own
 * contact-capture form, `VisitorContactDetailKind.Name`'s one real writer. */
function kindLabel(kind: string, strings: ConsoleStrings): string {
  switch (kind) {
    case "Phone":
      return strings.contactDetailsKindPhone;
    case "Email":
      return strings.contactDetailsKindEmail;
    default:
      return strings.contactDetailsKindName;
  }
}

/** `25-58`: only `Phone`/`Email` rows carry a confirm/mark-invalid action at all - a name or a
 * free-text note has no channel to confirm or invalidate the way a phone number or an email address
 * does (`SetVisitorContactDetailAssessmentHandler`'s own remarks; `Domain.VisitorContactDetail.SetAssessment`
 * refuses the write server-side regardless, so this is the console's own reflection of a real
 * server-side rule, not a client-only guess). */
function assessable(kind: string): boolean {
  return kind === "Phone" || kind === "Email";
}

/**
 * `14-14`/`23-09`/`25-58`/`adr/0079` section 6: a phone number, email address, or other fact an
 * operator or visitor recorded - a fifth "operator manages a small piece of state about this visitor"
 * panel, beside `ChannelIdentitiesPanel`/`ConversationOutcomePanel`/`ConversationTagsPanel`/
 * `ConversationNotesPanel`.
 *
 * **Deliberately not merged into `ChannelIdentitiesPanel`, and deliberately styled to look like a
 * different kind of fact, not just live in a different file.** A linked channel identity is
 * evidence-based - proven by a real inbound message or a verification code
 * (`ChannelIdentitiesPanel`'s own doc comment). A contact detail here carries only an operator's own,
 * overridable opinion (`25-58`'s `assessment`), never proof of address ownership - this panel gets its
 * own heading and its own caption stating that plainly, and renders each row with a distinct badge
 * tone from `ChannelIdentitiesPanel`'s so an operator scanning the aside can tell "a channel this
 * system can route through" from "a fact someone reported" without reading either panel's copy
 * closely. **This value is never sent anywhere else** - editing, confirming/marking invalid, and
 * revealing are the only actions this panel (or its backing endpoints) offer, all gated on
 * `conversation:send` (edit/assessment) or `conversation:read` (reveal) - there is no "promote to
 * channel identity" action anywhere in this codebase.
 *
 * **`25-58`: real inline editing replaces both the old "Удалить" button and the separate "add a new
 * record" form.** An operator who hears a corrected phone number or a spelling fix from the visitor
 * mid-conversation fixes the existing row directly - never a second, competing entry from a different
 * source, and never a silent reassignment of who originally supplied it: editing a row leaves its own
 * `source` untouched (`EditVisitorContactDetailHandler`'s own remarks state the same warning this
 * item's backlog makes explicit). Deletion is gone as a casual per-row action - a wrong value now gets
 * corrected (edit) or flagged (`assessment` = `Invalid`), which is strictly more informative than
 * removing the row outright (this item's own investigated conclusion, recorded in
 * `docs/architecture/personal-data.md`'s own updated row for this table). Phone/Email rows additionally
 * get a confirm/mark-invalid action (`assessable` above) - an operator's own assertion, never
 * `ChannelIdentitiesPanel`'s own proof-of-ownership mechanism; `Name` rows are taken on
 * trust and stay edit-only, since a name has no channel to confirm or invalidate.
 *
 * The old per-row "Verified"/"Unverified" badge is gone too - every row was `Unverified` (nothing in
 * this codebase has ever set `verified` `true`), so it only repeated, on every single line, exactly
 * what this panel's own header already says once (`contactDetailsCaption`'s "unverified, unless marked
 * otherwise"). The new `assessment` badge below replaces it where there is something real to say.
 *
 * Reading is gated on `conversation:read`, the same permission `ConversationNotesPanel` reuses for its
 * own read half (`ListVisitorContactDetailsHandler`'s own remarks); editing and setting an assessment
 * both need `conversation:send` - every action in this panel is hidden, not shown disabled, for an
 * operator without it, the same posture `ConversationNotesPanel`'s own textarea already uses.
 *
 * `23-11`/`decisions.md` §5: a row's own `masked` flag decides whether this panel shows a **Reveal**
 * button beside it, and, while masked, hides the **Edit** action - an operator cannot correct a value
 * they cannot read (confirm/mark-invalid stay available regardless: an operator judging "this number
 * worked" or "this number was dead" is a judgment about an outcome, not a claim about having read every
 * digit). The real value is never computed here - `detail.value` on a masked row already is the masked
 * string the server sent, and revealing replaces the whole row with the server's own unmasked response
 * rather than unmasking anything client-side (`handleReveal`'s own remarks).
 */
export function ContactDetailsPanel({ conversationId, accessToken }: ContactDetailsPanelProps) {
  const { hasPermission } = usePermissions();
  const strings = useStrings();
  const [details, setDetails] = useState<ContactDetailDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // `23-11`'s own per-row-in-flight shape, reused for `25-58`'s own two new per-row writes: revealing,
  // editing, or setting an assessment on one row never disables another row's own controls.
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [assessingId, setAssessingId] = useState<string | null>(null);

  // `23-100`: adjusted during render, not in an effect - `react-hooks/set-state-in-effect` (v7) flags
  // a synchronous `setState` in an effect body (react.dev/learn/you-might-not-need-an-effect, "Adjusting
  // some state when a prop changes"); comparing against the previous `conversationId` here does the
  // same reset one render earlier, with no flash of the previous conversation's details before the
  // effect used to fire - `VisitorHistoryPanel`'s identical `23-96` conversion is the precedent.
  const [prevConversationId, setPrevConversationId] = useState(conversationId);
  if (conversationId !== prevConversationId) {
    setPrevConversationId(conversationId);
    setDetails(null);
    setLoadError(null);
    setActionError(null);
    setEditingId(null);
    setEditDraft("");
  }

  useEffect(() => {
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

  const canEdit = hasPermission("conversation:send");

  const handleStartEdit = (detail: ContactDetailDto) => {
    setEditingId(detail.id);
    setEditDraft(detail.value);
    setActionError(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const handleSaveEdit = async (detail: ContactDetailDto) => {
    if (!accessToken) {
      return;
    }

    const value = editDraft.trim();
    if (!value) {
      return;
    }

    setSavingEditId(detail.id);
    setActionError(null);
    try {
      const edited = await editContactDetail(accessToken, conversationId, detail.id, value);
      setDetails((prev) => (prev ?? []).map((d) => (d.id === detail.id ? edited : d)));
      setEditingId(null);
      setEditDraft("");
    } catch (err) {
      setActionError(err instanceof ApiProblemError ? err.message : strings.contactDetailsEditError);
    } finally {
      setSavingEditId(null);
    }
  };

  const handleSetAssessment = async (detail: ContactDetailDto, assessment: "Confirmed" | "Invalid") => {
    if (!accessToken) {
      return;
    }

    setAssessingId(detail.id);
    setActionError(null);
    try {
      const updated = await setContactDetailAssessment(accessToken, conversationId, detail.id, assessment);
      setDetails((prev) => (prev ?? []).map((d) => (d.id === detail.id ? updated : d)));
    } catch (err) {
      setActionError(err instanceof ApiProblemError ? err.message : strings.contactDetailsAssessmentError);
    } finally {
      setAssessingId(null);
    }
  };

  // `23-11`/`decisions.md` §5: "revealed on demand, and the reveal is recorded" - this is the demand.
  // The masked row is replaced in place by the server's own unmasked response, never by unmasking the
  // string this component already holds: the real value never reaches this component until the server
  // sends it, so there is no client-side flag this build could get wrong and accidentally render early.
  const handleReveal = async (detail: ContactDetailDto) => {
    if (!accessToken) {
      return;
    }

    setRevealingId(detail.id);
    setActionError(null);
    try {
      const revealed = await revealContactDetail(accessToken, conversationId, detail.id);
      setDetails((prev) => (prev ?? []).map((d) => (d.id === detail.id ? revealed : d)));
    } catch (err) {
      setActionError(err instanceof ApiProblemError ? err.message : strings.contactDetailsRevealError);
    } finally {
      setRevealingId(null);
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
          {details?.map((detail) => {
            const isEditing = editingId === detail.id;
            const isSaving = savingEditId === detail.id;
            const isAssessing = assessingId === detail.id;

            return (
              <li key={detail.id} className="ago-aside__row">
                <Badge tone="accent">{kindLabel(detail.kind, strings)}</Badge>
                {/* `23-09`: distinguishes an operator-recorded row from a visitor-submitted one - the
                    console never renders the raw `recordedByOperatorId` (nullable since that item),
                    so this badge is what a null id renders as instead: a readable word, never an
                    empty cell or a fabricated name. */}
                <Badge tone={detail.source === "Visitor" ? "brand" : "neutral"}>
                  {detail.source === "Visitor" ? strings.contactDetailsSourceVisitor : strings.contactDetailsSourceOperator}
                </Badge>

                {isEditing ? (
                  <>
                    <Input
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      disabled={isSaving}
                      aria-label={strings.contactDetailsValuePlaceholder}
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleSaveEdit(detail)}
                      disabled={isSaving || !editDraft.trim()}
                    >
                      {isSaving ? strings.contactDetailsSavingButton : strings.contactDetailsSaveButton}
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={handleCancelEdit} disabled={isSaving}>
                      {strings.contactDetailsCancelButton}
                    </Button>
                  </>
                ) : (
                  <>
                    <span>{detail.value}</span>

                    {detail.masked && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleReveal(detail)}
                        disabled={revealingId === detail.id}
                      >
                        {revealingId === detail.id ? strings.contactDetailsRevealingButton : strings.contactDetailsRevealButton}
                      </Button>
                    )}

                    {canEdit && !detail.masked && (
                      <Button type="button" size="sm" variant="secondary" onClick={() => handleStartEdit(detail)}>
                        {strings.contactDetailsEditButton}
                      </Button>
                    )}

                    {canEdit && assessable(detail.kind) && (
                      <>
                        {detail.assessment === "Confirmed" && (
                          <Badge tone="success">{strings.contactDetailsAssessmentConfirmed}</Badge>
                        )}
                        {detail.assessment === "Invalid" && (
                          <Badge tone="danger">{strings.contactDetailsAssessmentInvalid}</Badge>
                        )}
                        {detail.assessment !== "Confirmed" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => void handleSetAssessment(detail, "Confirmed")}
                            disabled={isAssessing}
                          >
                            {strings.contactDetailsConfirmButton}
                          </Button>
                        )}
                        {detail.assessment !== "Invalid" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => void handleSetAssessment(detail, "Invalid")}
                            disabled={isAssessing}
                          >
                            {strings.contactDetailsMarkInvalidButton}
                          </Button>
                        )}
                      </>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {actionError && <Alert tone="danger">{actionError}</Alert>}
    </section>
  );
}
