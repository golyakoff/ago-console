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
import { Table, type TableColumn } from "../components/Table.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";

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
 *
 * `25-53`: two blocks, not one. The vocabulary used to render as a plain `<ul>` with an inline
 * rename/delete pair per row, the create form directly beneath it in the same `<Panel>` - the item's
 * own audit pattern. Split into a "current tags" table and a separate "add a tag" card below; unlike
 * `CalendarServicesPage`'s named example, this object type already had full CRUD
 * (`createTag`/`renameTag`/`deleteTag`) so both row actions carry over unchanged, just onto real
 * table columns instead of inline text.
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
        <>
          <Panel title={strings.tagsPanelTitle}>
            {rowError && <Alert tone="danger">{rowError}</Alert>}

            {tags && tags.length === 0 ? (
              <p className="ago-empty">{strings.tagsEmpty}</p>
            ) : (
              <TagsTable
                tags={tags ?? []}
                strings={strings}
                renamingId={renamingId}
                renameDraft={renameDraft}
                onRenameDraftChange={setRenameDraft}
                onStartRename={startRename}
                onCancelRename={() => setRenamingId(null)}
                onSubmitRename={(tagId) => void submitRename(tagId)}
                onDelete={(tagId) => void handleDelete(tagId)}
              />
            )}
          </Panel>

          <Panel title={strings.tagsAddPanelTitle}>
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
        </>
      )}
    </>
  );
}

/** `25-53`: the current-tags card's own table. Rename is edited in place (a row swaps its name cell
 * for a text field plus Save/Cancel, exactly the interaction the old `<li>` already had) rather than
 * navigating to a second screen - the same in-row-edit shape `TagsPage.tsx`'s pre-`25-53` version
 * used, now on real table columns instead of one row of inline text and buttons. */
function TagsTable({
  tags,
  strings,
  renamingId,
  renameDraft,
  onRenameDraftChange,
  onStartRename,
  onCancelRename,
  onSubmitRename,
  onDelete,
}: {
  tags: TagDto[];
  strings: ConsoleStrings;
  renamingId: string | null;
  renameDraft: string;
  onRenameDraftChange: (value: string) => void;
  onStartRename: (tag: TagDto) => void;
  onCancelRename: () => void;
  onSubmitRename: (tagId: string) => void;
  onDelete: (tagId: string) => void;
}) {
  const columns: TableColumn<TagDto>[] = [
    {
      key: "name",
      header: strings.tagsNameLabel,
      render: (tag) =>
        renamingId === tag.id ? (
          <Field label={strings.tagsNameLabel}>
            {(controlProps) => (
              <Input {...controlProps} value={renameDraft} onChange={(e) => onRenameDraftChange(e.target.value)} />
            )}
          </Field>
        ) : (
          tag.name
        ),
    },
    {
      key: "actions",
      header: strings.tagsColumnActions,
      render: (tag) =>
        renamingId === tag.id ? (
          <div className="ago-row">
            <Button type="button" variant="primary" onClick={() => void onSubmitRename(tag.id)}>
              {strings.tagsSaveButton}
            </Button>
            <Button type="button" onClick={onCancelRename}>
              {strings.tagsCancelButton}
            </Button>
          </div>
        ) : (
          <div className="ago-row">
            <Button type="button" onClick={() => onStartRename(tag)}>
              {strings.tagsRenameButton}
            </Button>
            <Button type="button" variant="danger" onClick={() => void onDelete(tag.id)}>
              {strings.tagsDeleteButton}
            </Button>
          </div>
        ),
    },
  ];

  return <Table caption={strings.tagsPanelTitle} columns={columns} rows={tags} rowKey={(tag) => tag.id} />;
}
