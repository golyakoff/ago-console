import { useEffect, useState } from "react";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  fetchConversationTags,
  applyTagToConversation,
  removeTagFromConversation,
  type TagDto,
} from "../api/tagsApi.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { Alert } from "../components/Alert.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { Select } from "../components/Select.js";
import { Skeleton } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";

export interface ConversationTagsPanelProps {
  conversationId: string;
  /** `18-04`: the site's tag vocabulary - `WorkspaceOutletContext.tags`, fetched once when the
   * workspace mounts, not re-fetched here. */
  siteTags: readonly TagDto[];
  accessToken: string | null;
}

/**
 * `18-04`: which tags are applied to this conversation, and a picker to apply one more from the
 * site's own vocabulary. Gated on `conversation:tag` for the write half - see
 * `Permission.ConversationTag`'s own remarks (`ago-chat`) for why this is narrower than
 * `conversation:read`. Managing the vocabulary itself (create/rename/delete) is `/settings/tags`
 * (`TagsPage`), not this panel.
 */
export function ConversationTagsPanel({ conversationId, siteTags, accessToken }: ConversationTagsPanelProps) {
  const { hasPermission } = usePermissions();
  const strings = useStrings();
  const [applied, setApplied] = useState<TagDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pickerValue, setPickerValue] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setApplied(null);
    setLoadError(null);
    setActionError(null);
    setPickerValue("");

    if (!accessToken || !hasPermission("conversation:read")) {
      return;
    }

    let cancelled = false;
    fetchConversationTags(accessToken, conversationId)
      .then((next) => {
        if (!cancelled) {
          setApplied(next);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : strings.tagsLoadError);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, accessToken, hasPermission, strings]);

  if (!hasPermission("conversation:read")) {
    return null;
  }

  const canTag = hasPermission("conversation:tag");
  const appliedIds = new Set((applied ?? []).map((t) => t.id));
  const pickable = siteTags.filter((t) => !appliedIds.has(t.id));

  const handleApply = async () => {
    if (!accessToken || !pickerValue) {
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      await applyTagToConversation(accessToken, conversationId, pickerValue);
      const tag = siteTags.find((t) => t.id === pickerValue);
      if (tag) {
        setApplied((prev) => [...(prev ?? []), tag]);
      }
      setPickerValue("");
    } catch (err) {
      setActionError(err instanceof ApiProblemError ? err.message : strings.tagsApplyError);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (tagId: string) => {
    if (!accessToken) {
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      await removeTagFromConversation(accessToken, conversationId, tagId);
      setApplied((prev) => (prev ?? []).filter((t) => t.id !== tagId));
    } catch (err) {
      setActionError(err instanceof ApiProblemError ? err.message : strings.tagsRemoveError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ago-aside__section" aria-labelledby="ago-tags-title">
      <h3 className="ago-aside__subtitle" id="ago-tags-title">
        {strings.tagsSectionTitle}
      </h3>

      {applied === null && !loadError ? (
        <Skeleton lines={1} label={strings.tagsLoadingLabel} />
      ) : loadError ? (
        <Alert tone="danger">{loadError}</Alert>
      ) : applied && applied.length === 0 ? (
        <p className="ago-empty">{strings.tagsNoneApplied}</p>
      ) : (
        <div className="ago-aside__row">
          {applied?.map((tag) => (
            <Badge key={tag.id} tone="neutral">
              {tag.name}
              {canTag && (
                <button
                  type="button"
                  className="ago-badge__remove"
                  onClick={() => void handleRemove(tag.id)}
                  disabled={busy}
                  aria-label={`${strings.tagsRemoveButtonAriaPrefix} ${tag.name}`}
                >
                  ×
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {canTag && pickable.length > 0 && (
        <div className="ago-row">
          <Select aria-label={strings.tagsApplyLabel} value={pickerValue} onChange={(e) => setPickerValue(e.target.value)}>
            <option value="">{strings.tagsApplyPlaceholder}</option>
            {pickable.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </Select>
          <Button type="button" size="sm" onClick={() => void handleApply()} disabled={busy || !pickerValue}>
            {strings.tagsApplyButton}
          </Button>
        </div>
      )}

      {actionError && <Alert tone="danger">{actionError}</Alert>}
    </section>
  );
}
