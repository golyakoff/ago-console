import { useEffect, useRef, useState } from "react";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  fetchContactDetails,
  recordContactDetail,
  deleteContactDetail,
  revealContactDetail,
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

/** `23-100`: a sentinel distinct from every real `PromotedContactDraft.token` (a `number`) and from
 * `undefined` (the "no draft" state) alike - see the render-phase promotion below for why the initial
 * comparison cannot start at the real token. */
const NOT_YET_APPLIED = Symbol("contact-draft-not-yet-applied");

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
 * (`ChannelIdentitiesPanel`'s own doc comment). A contact detail is only ever unverified today
 * (`Domain.VisitorContactDetail`'s own remarks - nothing in this codebase yet sets `Verified` `true`
 * on either source), so this panel gets its own heading and its own caption stating that plainly, and
 * renders each row with a distinct badge tone from `ChannelIdentitiesPanel`'s - an operator scanning
 * the aside should be able to tell "verified" from "someone typed this" without reading either
 * panel's copy closely. This value is **never** sent anywhere: recording and deleting are the only
 * two actions this panel (or its backing endpoints) offer, both gated on `conversation:send` - there
 * is no "promote to channel identity" action anywhere in this codebase.
 *
 * **`23-09`: the caption's claim changed, and had to.** It used to read "Recorded by an operator -
 * never used to contact the visitor automatically" - true only while every row here was an operator's
 * own note. A visitor-supplied row (the widget's out-of-hours control) is the opposite of that second
 * half by design: it exists so a tenant *can* call the visitor back (`docs/design/decisions.md` §4).
 * The new caption states what stays true of every row regardless of who supplied it - unverified,
 * unless a future caller marks one otherwise - rather than a claim this item would make false the day
 * it shipped. Each row's own `Source`/`Verified` badges above carry the per-row distinction the
 * caption no longer can.
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
 *
 * `23-11`/`decisions.md` §5: a row's own `masked` flag decides whether this panel shows a **Reveal**
 * button beside it. The real value is never computed here - `detail.value` on a masked row already
 * is the masked string the server sent, and revealing replaces the whole row with the server's own
 * unmasked response rather than unmasking anything client-side (`handleReveal`'s own remarks). This is
 * what keeps "masked" and "forbidden" visibly different: an operator without `conversation:read` sees
 * no panel at all (the check just above renders nothing), while one who can read but whose tenant
 * masks contact surfaces sees every row, each with a working Reveal button - never a blank space that
 * could be read as "no contact recorded."
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
  // `23-11`: which row's own Reveal is in flight, if any - tracked separately from `busy` (the
  // record/delete form's own flag) so revealing one row does not disable every other row's Reveal
  // button, and so the button that is actually working is the one that says so.
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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
    setValueDraft("");
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

  // `23-10`: applies a freshly-promoted selection to the draft, keyed on `token` rather than `value`
  // so promoting the same text twice in a row (the operator changes their mind, then promotes the
  // identical phrase again) still re-applies instead of silently doing nothing the second time.
  // Deliberately does not depend on `canRecord`: `ConversationPage` only ever passes
  // `onPromoteSelection` to `Thread` for an operator who already holds `conversation:send`, so a
  // `contactDraft` reaching this component with the form absent is not a case this needs to guard
  // against - `formRef.current` is simply `null` then, and the focus call below is a no-op.
  //
  // `23-100`: split in two. Setting `kindDraft`/`valueDraft`/`actionError` is adjusted during render,
  // the same technique as the reset above, keyed on `contactDraft?.token` rather than `conversationId`.
  // Focusing the field cannot move there - render must stay free of DOM reads/writes, and
  // `formRef.current` is not populated until after commit - so it stays in a `useEffect`, which no
  // longer sets any state and so no longer trips the rule.
  //
  // `prevContactDraftToken` starts at the `NOT_YET_APPLIED` sentinel, not at `contactDraft?.token` -
  // unlike the reset above (where "nothing to reset from yet" is the correct starting point), the
  // original effect applied the promotion on the very first render too, whenever this panel happened
  // to mount already holding one (`ConversationPage` can pass a non-null `contactDraft` from the start
  // if a promotion raced the panel's own mount). Starting the comparison at the real token would make
  // that first application silently never happen; the sentinel guarantees the first render with any
  // real (or `undefined`) token still counts as a change.
  const [prevContactDraftToken, setPrevContactDraftToken] = useState<number | undefined | typeof NOT_YET_APPLIED>(
    NOT_YET_APPLIED,
  );
  if (contactDraft?.token !== prevContactDraftToken) {
    setPrevContactDraftToken(contactDraft?.token);
    if (contactDraft) {
      setKindDraft("Phone");
      setValueDraft(contactDraft.value);
      setActionError(null);
    }
  }

  useEffect(() => {
    if (!contactDraft) {
      return;
    }

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
              {/* `23-09`: distinguishes an operator-recorded row from a visitor-submitted one - the
                  console never renders the raw `recordedByOperatorId` (nullable since this item), so
                  this badge is what a null id renders as instead: a readable word, never an empty
                  cell or a fabricated name. */}
              <Badge tone={detail.source === "Visitor" ? "brand" : "neutral"}>
                {detail.source === "Visitor" ? strings.contactDetailsSourceVisitor : strings.contactDetailsSourceOperator}
              </Badge>
              {/* `23-09`: says which are unverified - every row today, but the flag (not an inferred
                  constant) is what lets a future verified-mode caller change that without this panel
                  needing to change with it. */}
              <Badge tone={detail.verified ? "success" : "neutral"}>
                {detail.verified ? strings.contactDetailsVerified : strings.contactDetailsUnverified}
              </Badge>
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
