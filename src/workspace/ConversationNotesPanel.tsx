import { useEffect, useState } from "react";
import { usePermissions } from "../auth/PermissionsContext.js";
import { fetchConversationNotes, addConversationNote, type ConversationNoteDto } from "../api/notesApi.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { Alert } from "../components/Alert.js";
import { Button } from "../components/Button.js";
import { Textarea } from "../components/Textarea.js";
import { Skeleton } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import { formatAbsolute, parseInstant } from "../time/format.js";

export interface ConversationNotesPanelProps {
  conversationId: string;
  timeZone: string | null;
  accessToken: string | null;
}

/**
 * `18-04`: internal, operator-only notes on this conversation - never visible to the visitor, by
 * construction (`ago-chat`'s `INoteRepository`/`ConversationNote` own remarks: there is no code path
 * from a visitor-facing read to this data at all, checked by `NoteLeakProofTests` against a real
 * Postgres). This panel is the only place in the console that reads or writes it.
 *
 * Reading is gated on `conversation:read` (the same permission that already governs whether this
 * conversation is on screen at all - `GetConversationNotesHandler`'s own remarks); adding one needs
 * the narrower `conversation:note_write`, so the textarea and its button are hidden rather than shown
 * disabled for an operator who lacks it - the same "hidden, not disabled" posture
 * `CloseConversationButton` already uses elsewhere in this workspace.
 */
export function ConversationNotesPanel({ conversationId, timeZone, accessToken }: ConversationNotesPanelProps) {
  const { hasPermission } = usePermissions();
  const strings = useStrings();
  const [notes, setNotes] = useState<ConversationNoteDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setNotes(null);
    setLoadError(null);
    setDraft("");
    setSubmitError(null);

    if (!accessToken || !hasPermission("conversation:read")) {
      return;
    }

    let cancelled = false;
    fetchConversationNotes(accessToken, conversationId)
      .then((next) => {
        if (!cancelled) {
          setNotes(next);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : strings.notesLoadError);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, accessToken, hasPermission, strings]);

  if (!hasPermission("conversation:read")) {
    return null;
  }

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    const body = draft.trim();
    if (!accessToken || !body) {
      return;
    }

    setSubmitting(true);
    try {
      const note = await addConversationNote(accessToken, conversationId, body);
      setNotes((prev) => [...(prev ?? []), note]);
      setDraft("");
    } catch (err) {
      setSubmitError(err instanceof ApiProblemError ? err.message : strings.notesAddError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="ago-aside__section" aria-labelledby="ago-notes-title">
      <h3 className="ago-aside__subtitle" id="ago-notes-title">
        {strings.notesTitle}
      </h3>
      <p className="ago-aside__note">{strings.notesVisitorCannotSeeNote}</p>

      {notes === null && !loadError ? (
        <Skeleton lines={2} label={strings.notesLoadingLabel} />
      ) : loadError ? (
        <Alert tone="danger">{loadError}</Alert>
      ) : notes && notes.length === 0 ? (
        <p className="ago-empty">{strings.notesEmpty}</p>
      ) : (
        <ul className="ago-list">
          {notes?.map((note) => {
            const createdAt = parseInstant(note.createdAt);
            return (
              <li key={note.id} className="ago-list__row ago-list__row--static">
                <span className="ago-list__row-top ago-meta">
                  {createdAt ? formatAbsolute(createdAt, timeZone) : null}
                </span>
                <span className="ago-list__row-bottom">{note.body}</span>
              </li>
            );
          })}
        </ul>
      )}

      {hasPermission("conversation:note_write") && (
        <form className="ago-stack" onSubmit={(e) => void handleAdd(e)}>
          <Textarea
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={strings.notesAddPlaceholder}
            disabled={submitting}
            aria-label={strings.notesAddPlaceholder}
          />
          {submitError && <Alert tone="danger">{submitError}</Alert>}
          <Button type="submit" variant="secondary" disabled={submitting || !draft.trim()}>
            {submitting ? strings.notesAddingButton : strings.notesAddButton}
          </Button>
        </form>
      )}
    </section>
  );
}
