import { useEffect, useState } from "react";
import { usePermissions } from "../auth/PermissionsContext.js";
import { fetchConversationOutcome, setConversationOutcome } from "../api/conversationsApi.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { Alert } from "../components/Alert.js";
import { Badge, type BadgeTone } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { Skeleton } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";

export interface ConversationOutcomePanelProps {
  conversationId: string;
  accessToken: string | null;
}

/** `Ago.Chat.Domain.ConversationOutcome`'s three real, settable values - `Unset` is deliberately not
 * one of these buttons, matching `Conversation.SetOutcome`'s own refusal server-side: an operator who
 * wants to change their mind picks a different real value, there is no "clear it" control. */
const RECORDABLE_OUTCOMES = ["Converted", "NotConverted", "FollowUpNeeded"] as const;

function outcomeLabel(outcome: string, strings: ConsoleStrings): string {
  switch (outcome) {
    case "Converted":
      return strings.outcomeConverted;
    case "NotConverted":
      return strings.outcomeNotConverted;
    case "FollowUpNeeded":
      return strings.outcomeFollowUpNeeded;
    default:
      return strings.outcomeUnset;
  }
}

function outcomeTone(outcome: string): BadgeTone {
  switch (outcome) {
    case "Converted":
      return "success";
    case "NotConverted":
      return "danger";
    case "FollowUpNeeded":
      return "accent";
    default:
      return "neutral";
  }
}

/**
 * `18-10`: what an operator says this conversation led to - a small, closed set of buttons, not a
 * form, matching the backlog item's own scope note. Lives beside `ConversationTagsPanel`/
 * `ConversationNotesPanel` in this same aside rather than in `ConversationPage`'s header next to
 * `CloseConversationButton`: those two are the console's existing "operator sets a small piece of
 * state on a conversation" precedent, and this is a third instance of the identical shape - both are
 * on screen throughout the same conversation view regardless of which panel renders the control, and
 * a state-setting picker with no confirmation dialog reads more like "part of the record" (tags,
 * notes) than like a one-shot terminal action (`CloseConversationButton`'s own dialog, which exists
 * specifically because closing has no path back - this does).
 *
 * Reading is gated on `conversation:read` (`GetConversationOutcomeHandler`'s own remarks); setting one
 * needs `conversation:close`, the same permission `CloseConversationHandler` already checks
 * (`SetConversationOutcomeHandler`'s own remarks on why this item reuses it rather than adding a new
 * one) - so the three buttons are hidden, not shown disabled, for an operator without it, the same
 * "hidden, not disabled" posture `ConversationTagsPanel`'s own apply control already uses.
 *
 * <b>Independent of close, on purpose.</b> The buttons render and work whether or not this
 * conversation is closed - `Conversation.SetOutcome`'s own remarks state there is no state check,
 * because an operator may know the outcome before or after closing.
 */
export function ConversationOutcomePanel({ conversationId, accessToken }: ConversationOutcomePanelProps) {
  const { hasPermission } = usePermissions();
  const strings = useStrings();
  const [outcome, setOutcome] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOutcome(null);
    setLoadError(null);
    setActionError(null);

    if (!accessToken || !hasPermission("conversation:read")) {
      return;
    }

    let cancelled = false;
    fetchConversationOutcome(accessToken, conversationId)
      .then((response) => {
        if (!cancelled) {
          setOutcome(response.outcome);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : strings.outcomeLoadError);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, accessToken, hasPermission, strings]);

  if (!hasPermission("conversation:read")) {
    return null;
  }

  const canSet = hasPermission("conversation:close");

  const handleSet = async (next: string) => {
    if (!accessToken || next === outcome) {
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      await setConversationOutcome(accessToken, conversationId, next);
      setOutcome(next);
    } catch (err) {
      setActionError(err instanceof ApiProblemError ? err.message : strings.outcomeSetError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ago-aside__section" aria-labelledby="ago-outcome-title">
      <h3 className="ago-aside__subtitle" id="ago-outcome-title">
        {strings.outcomeSectionTitle}
      </h3>

      {outcome === null && !loadError ? (
        <Skeleton lines={1} label={strings.outcomeLoadingLabel} />
      ) : loadError ? (
        <Alert tone="danger">{loadError}</Alert>
      ) : (
        <div className="ago-aside__row">
          <Badge tone={outcomeTone(outcome ?? "Unset")}>{outcomeLabel(outcome ?? "Unset", strings)}</Badge>
        </div>
      )}

      {canSet && (
        <div className="ago-row" role="group" aria-label={strings.outcomeSectionTitle}>
          {RECORDABLE_OUTCOMES.map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={value === outcome ? "primary" : "secondary"}
              onClick={() => void handleSet(value)}
              disabled={busy || value === outcome}
            >
              {outcomeLabel(value, strings)}
            </Button>
          ))}
        </div>
      )}

      {actionError && <Alert tone="danger">{actionError}</Alert>}

      {/* `18-10`'s own load-bearing honesty framing, restated at the one place an operator sets this
          value, not only on the report that reads it back: this is what the operator says happened,
          never a verified sale AGO Chat itself confirmed. */}
      <p className="ago-aside__note">{strings.outcomeNotAVerifiedSaleNote}</p>
    </section>
  );
}
