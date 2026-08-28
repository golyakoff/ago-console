import { useState } from "react";
import { Button } from "../components/Button.js";
import { Dialog } from "../components/Dialog.js";
import { Alert } from "../components/Alert.js";
import { Spinner } from "../components/Spinner.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { useStrings } from "../i18n/StringsContext.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { usePollUntilErased } from "../erasure/usePollUntilErased.js";
import type { ErasureCheckOutcome } from "../erasure/erasureCheck.js";

/** `16-02`'s dedicated permission, named once here on the exact precedent
 * `CloseConversationButton.CLOSE_PERMISSION` set: a string literal colocated with the one component
 * that checks it, since no shared constants file exists between this repository and `ago-chat` (the
 * two sides duplicate the literal by convention). */
export const CONVERSATION_ERASE_PERMISSION = "conversation:erase";

/** Matches this item's own "2-3s is fine, no measurement required" cadence - the same informal
 * ballpark `ConversationPage`'s `PRESENCE_POLL_INTERVAL_MS` (10s) and `AdminConversationsPage`'s own
 * `REFRESH_INTERVAL_MS` (15s) already use for their own polls, just faster: an operator who just
 * confirmed a destructive action is actively watching this row, unlike a background presence check. */
const CONVERSATION_ERASURE_POLL_INTERVAL_MS = 3_000;

export interface EraseConversationButtonProps {
  /** Fires the `POST /api/v1/conversations/{id}/erase` call. Injected rather than called here, the
   * same "the page owns the request, this owns the interaction around it" split
   * `CloseConversationButtonProps.onClose` already established - this component takes no access
   * token and no API module. */
  onErase: () => Promise<void>;
  /** The completion poll's own check - `conversationsApi.ts#checkConversationErasure`, bound to this
   * row's `conversationId` by the caller. */
  checkErased: () => Promise<ErasureCheckOutcome>;
  /** Told once the poll actually observes `"erased"` - never on the `202` alone. The page removes the
   * row only here, never optimistically on confirm (`16-02`'s own Done-when: "the console must not
   * claim it is done before it is"). */
  onErased: () => void;
}

/**
 * `16-02`: the row action `AdminConversationsPage` offers per conversation - erasure on the visitor's
 * own request, the tenant acting on their behalf since a visitor has no account of their own to ask
 * from.
 *
 * ## Hidden, not disabled; a real confirmation
 *
 * Both follow `CloseConversationButton`'s own established shape byte-for-byte: an operator without
 * `conversation:erase` sees nothing here at all, and the destructive click is gated behind a native
 * `<dialog>` confirmation (`Dialog`, `adr/0030`) rather than firing on the first click - erasure is at
 * least as irreversible as closing a conversation, and considerably more so.
 *
 * ## What is new relative to `CloseConversationButton`
 *
 * Closing finishes synchronously - the `POST` either succeeds or it does not, and the page learns
 * which from the same response. Erasure does not: the confirm click's `202 Accepted` only means a
 * `Ago.Chat.Worker` job has *started* (`16-02`'s own Scope), so a third state exists between "not yet
 * asked" and "gone" - **erasing**, during which this component polls `checkErased` on an interval
 * (`erasure/usePollUntilErased.ts`, this item's own new "poll until a real job finishes" mechanism)
 * and replaces its own button with a `Spinner` rather than offering a second click. `onErased` fires
 * once, the first time that poll actually observes completion - not on the `202`, which is exactly
 * the false-completion shape `16-02`'s Done-when rules out.
 */
export function EraseConversationButton({ onErase, checkErased, onErased }: EraseConversationButtonProps) {
  const { hasPermission } = usePermissions();
  const strings = useStrings();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Unconditional, like every hook above it - `usePollUntilErased` itself is a no-op while `erasing`
  // is false, so this is safe to call before the permission gate below rather than being forced to
  // duplicate that gate around the hook call (Rules of Hooks: no hook may follow an early return).
  usePollUntilErased(erasing, CONVERSATION_ERASURE_POLL_INTERVAL_MS, checkErased, onErased);

  if (!hasPermission(CONVERSATION_ERASE_PERMISSION)) {
    return null;
  }

  if (erasing) {
    return <Spinner label={strings.eraseConversationErasingLabel} />;
  }

  const attempt = async () => {
    setSubmitting(true);
    setFailure(null);
    try {
      await onErase();
      setConfirming(false);
      setErasing(true);
    } catch (reason) {
      // No `closeOutcome.ts`-style code-by-code mapping here - unlike closing, nothing about this
      // flow asks the operator to retry a specific failure differently, so the server's own problem-
      // details message (or a generic fallback for a network-level failure) is shown as-is.
      setFailure(reason instanceof ApiProblemError ? reason.message : strings.eraseConversationSubmitError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setFailure(null);
          setConfirming(true);
        }}
      >
        {strings.eraseConversationButton}
      </Button>

      <Dialog
        open={confirming}
        title={strings.eraseConversationDialogTitle}
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={submitting}>
              {strings.cancelButton}
            </Button>
            <Button variant="danger" onClick={() => void attempt()} disabled={submitting}>
              {strings.eraseConversationConfirmButton}
            </Button>
          </>
        }
      >
        <p>{strings.eraseConversationDialogBody}</p>
        {failure && <Alert tone="danger">{failure}</Alert>}
      </Dialog>
    </>
  );
}
