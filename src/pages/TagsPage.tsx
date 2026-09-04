import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { fetchTags, createTag, renameTag, deleteTag, type TagDto } from "../api/tagsApi.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { PageHead } from "../shell/AppShell.js";
import { AccessRefusal } from "../shell/accessRefusal.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";

/**
 * `18-04`: `/settings/tags` - the site's own tag vocabulary, editable by whoever holds
 * `site:configure` (the same permission `CannedResponsesPage` gates itself on, for the identical
 * "small per-site management surface" reasoning `Tag`'s own doc comment states, `ago-chat`). Labels
 * only - creating, renaming and deleting a tag here never affects routing or SLAs
 * (`Permission.ConversationTag`'s own remarks).
 *
 * Applying a tag to one conversation happens elsewhere (the conversation panel's own
 * `ConversationTagsPanel`) - this screen only manages the vocabulary itself, the same split
 * `CannedResponsesPage` (the library) and the composer's picker (using it) already draw.
 */
export function TagsPage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const strings = useStrings();
  const [tags, setTags] = useState<TagDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [rowError, setRowError] = useState<string | null>(null);

  const load = useCallback(() => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    fetchTags(accessToken, siteId)
      .then((next) => {
        setTags(next);
        setLoadError(null);
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : strings.tagsLoadError));
  }, [user?.access_token, siteId, strings]);

  useEffect(() => {
    if (!hasPermission("site:configure")) {
      return;
    }
    load();
  }, [load, hasPermission]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission("site:configure")) {
    // `23-24`: shared `AccessRefusal`, replacing this screen's own copy of the block.
    return <AccessRefusal title={strings.navTags} message={strings.tagsForbidden} strings={strings} />;
  }

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreateError(null);
    const accessToken = user?.access_token;
    if (!accessToken || !siteId || !newName.trim()) {
      return;
    }

    setCreating(true);
    try {
      await createTag(accessToken, siteId, newName.trim());
      setNewName("");
      load();
    } catch (err) {
      setCreateError(err instanceof ApiProblemError ? err.message : strings.tagsCreateError);
    } finally {
      setCreating(false);
    }
  };

  const startRename = (tag: TagDto) => {
    setRenamingId(tag.id);
    setRenameDraft(tag.name);
    setRowError(null);
  };

  const submitRename = async (tagId: string) => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId || !renameDraft.trim()) {
      return;
    }

    try {
      await renameTag(accessToken, siteId, tagId, renameDraft.trim());
      setRenamingId(null);
      load();
    } catch (err) {
      setRowError(err instanceof ApiProblemError ? err.message : strings.tagsRenameError);
    }
  };

  const handleDelete = async (tagId: string) => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    try {
      await deleteTag(accessToken, siteId, tagId);
      load();
    } catch (err) {
      setRowError(err instanceof ApiProblemError ? err.message : strings.tagsDeleteError);
    }
  };

  return (
    <>
      <PageHead title={strings.navTags} description={strings.tagsDescription} />

      {loadError && <Alert tone="danger">{loadError}</Alert>}

      {tags === null && !loadError ? (
        <Panel>
          <Skeleton lines={3} label={strings.tagsLoadingLabel} />
        </Panel>
      ) : (
        <Panel title={strings.tagsPanelTitle}>
          {rowError && <Alert tone="danger">{rowError}</Alert>}

          {tags && tags.length === 0 ? (
            <p className="ago-empty">{strings.tagsEmpty}</p>
          ) : (
            <ul className="ago-list">
              {tags?.map((tag) => (
                <li key={tag.id} className="ago-row ago-row--align-end">
                  {renamingId === tag.id ? (
                    <>
                      <Field label={strings.tagsNameLabel}>
                        {(controlProps) => (
                          <Input {...controlProps} value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} />
                        )}
                      </Field>
                      <Button type="button" variant="primary" onClick={() => void submitRename(tag.id)}>
                        {strings.tagsSaveButton}
                      </Button>
                      <Button type="button" onClick={() => setRenamingId(null)}>
                        {strings.tagsCancelButton}
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="ago-list__row-top">{tag.name}</span>
                      <Button type="button" onClick={() => startRename(tag)}>
                        {strings.tagsRenameButton}
                      </Button>
                      <Button type="button" variant="danger" onClick={() => void handleDelete(tag.id)}>
                        {strings.tagsDeleteButton}
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form className="ago-row ago-row--align-end" onSubmit={(e) => void handleCreate(e)}>
            <Field label={strings.tagsNewNameLabel}>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={strings.tagsNewNamePlaceholder}
                  disabled={creating}
                />
              )}
            </Field>
            <Button type="submit" variant="primary" disabled={creating || !newName.trim()}>
              {creating ? strings.tagsCreatingButton : strings.tagsCreateButton}
            </Button>
          </form>
          {createError && <Alert tone="danger">{createError}</Alert>}
        </Panel>
      )}
    </>
  );
}
