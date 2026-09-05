import { useState } from "react";
import { Button } from "../components/Button.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { useStrings } from "../i18n/StringsContext.js";
import { ApiProblemError } from "../api/problemDetails.js";

/** `23-04`: named after the server's own gate (`Permission.ConversationAssign`,
 * `AssignConversationHandler`'s existing check) - the same string-literal-colocated-with-the-one-
 * component-that-checks-it convention `EraseConversationButton.CONVERSATION_ERASE_PERMISSION` already
 * establishes for this file's sibling. */
export const CONVERSATION_CLAIM_PERMISSION = "conversation:assign";

export interface ClaimConversationButtonProps {
  /** Fires the `POST /api/v1/conversations/{id}/claim` call. Injected rather than called here, the
   * same "the page owns the request, this owns the interaction around it" split
   * `EraseConversationButtonProps.onErase` already established - this component takes no access token
   * and no API module. */
  onClaim: () => Promise<void>;
  /** Told once the claim actually succeeds - never optimistically before the request settles. Unlike
   * `EraseConversationButton`'s own `onErased`, there is no completion poll to wait on first: `/claim`
   * is synchronous (`204 No Content` means the row already changed), so this fires directly from the
   * successful response. */
  onClaimed: () => void;
}

/**
 * `23-04`: the row action `AdminConversationsPage` and `SearchConversationsPage` offer per `Waiting`
 * conversation - a deliberate take, reachable without opening a hub connection first
 * (`conversationsApi.ts#claimConversation`'s own doc comment).
 *
 * <b>Hidden, not disabled</b>, the same shape `EraseConversationButton`/`CloseConversationButton`
 * already establish: an operator without `conversation:assign` sees nothing here at all.
 *
 * <b>No confirmation dialog</b>, unlike `EraseConversationButton` - taking a conversation is the
 * ordinary, reversible act this whole item exists to make reachable (a mis-click just means one more
 * conversation in the operator's own list, closable or transferable like any other), not a destructive
 * one erasure's own irreversibility earns a `<dialog>` for.
 *
 * <b>The loser of a race is told plainly, inline</b> - two operators clicking this within the same
 * instant is the ordinary case this item's own concurrency tests prove, not an edge case to hide: the
 * server's own `Conversation.InvalidState`/`Conversation.ClaimContended` message is shown as-is, the
 * same "no code-by-code mapping, the server's own message is shown" shape `EraseConversationButton`
 * already uses for its own single-failure-reason flow.
 */
export function ClaimConversationButton({ onClaim, onClaimed }: ClaimConversationButtonProps) {
  const { hasPermission } = usePermissions();
  const strings = useStrings();
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (!hasPermission(CONVERSATION_CLAIM_PERMISSION)) {
    return null;
  }

  const attempt = async () => {
    setSubmitting(true);
    setFailure(null);
    try {
      await onClaim();
      onClaimed();
    } catch (reason) {
      setFailure(reason instanceof ApiProblemError ? reason.message : strings.claimConversationSubmitError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <span className="ago-claim-conversation">
      <Button size="sm" variant="secondary" onClick={() => void attempt()} disabled={submitting}>
        {submitting ? strings.claimConversationSubmittingLabel : strings.claimConversationButton}
      </Button>
      {failure && <span className="ago-claim-conversation__error">{failure}</span>}
    </span>
  );
}
