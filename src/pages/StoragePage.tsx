import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  bulkDeleteAttachments,
  fetchAttachmentEgress,
  fetchLargestConversations,
  fetchSiteAttachments,
  fetchStorageSummary,
  SiteAttachmentStorageError,
  type AttachmentEgressDto,
  type AttachmentListCursorDto,
  type AttachmentListFilter,
  type AttachmentListItemDto,
  type AttachmentListSort,
  type AttachmentStorageSummaryDto,
  type LargestConversationDto,
} from "../api/siteAttachmentStorageApi.js";
import { formatByteSize } from "../owner/ownerSites.js";
import { PageHead } from "../shell/AppShell.js";
import { AccessRefusal } from "../shell/accessRefusal.js";
import { Panel } from "../components/Panel.js";
import { Button } from "../components/Button.js";
import { Select } from "../components/Select.js";
import { Alert } from "../components/Alert.js";
import { Badge } from "../components/Badge.js";
import { Dialog } from "../components/Dialog.js";
import { Table, type TableColumn } from "../components/Table.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import { formatAbsolute, resolveTimeZone } from "../time/format.js";
import { Link } from "react-router-dom";

/**
 * `23-80`/`23-82`: `/account/storage` - "Администрирование -> Хранилище". Every attachment the
 * tenant holds, across every conversation, in one table: the quota bar first (this item's own "the
 * thing the author asked for first"), sortable/filterable underneath, bulk-select-and-delete with a
 * pre-confirm total, and the two judgement filters (never downloaded, duplicate content) that make
 * this more than a file browser.
 *
 * <p>Gated the way every other `/account/*` screen is: `usePermissions()` decides whether to render
 * at all (client-side, UX only), while the server's own `site:configure` check on every route behind
 * this screen (`SiteAttachmentStorageEndpoints`, `ago-chat`) is the actual gate - proven by fault
 * injection there, not by this component.</p>
 *
 * <p><b>No file name column.</b> `23-80`'s own text asks for "name, size, type..." but nothing in
 * this codebase ever captured an uploaded file's original name - `Attachment` (`ago-chat`) has no
 * such column, and adding one would mean a wire-shape change reaching the widget's own upload call,
 * out of this item's own repository scope. The content type stands in for it (`image/png`, `application/pdf`,
 * ...), named honestly in this file's own report rather than silently substituted.</p>
 *
 * <p><b>Byte formatting reuses <c>formatByteSize</c> from <c>owner/ownerSites.ts</c></b> rather than a
 * second implementation - the identical binary-unit, round-towards-zero rule this screen wants, at the
 * cost of that helper's own fixed `en-GB` number grouping regardless of this screen's own locale (a
 * named, minor inconsistency, not a silent one).</p>
 */
export function StoragePage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const strings = useStrings();
  const timeZone = resolveTimeZone();

  const [sort, setSort] = useState<AttachmentListSort>("sizeDesc");
  const [filter, setFilter] = useState<AttachmentListFilter>("none");
  const [items, setItems] = useState<AttachmentListItemDto[]>([]);
  const [nextCursor, setNextCursor] = useState<AttachmentListCursorDto | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<AttachmentStorageSummaryDto | null>(null);
  const [egress, setEgress] = useState<AttachmentEgressDto | null>(null);
  const [largest, setLargest] = useState<LargestConversationDto[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const load = useCallback(
    (nextSort: AttachmentListSort, nextFilter: AttachmentListFilter) => {
      const accessToken = user?.access_token;
      if (!accessToken || !siteId) {
        return;
      }

      setStatus("loading");
      setSelected(new Set());
      Promise.all([
        fetchSiteAttachments(accessToken, siteId, { sort: nextSort, filter: nextFilter }),
        fetchStorageSummary(accessToken, siteId),
        fetchAttachmentEgress(accessToken, siteId),
        fetchLargestConversations(accessToken, siteId),
      ])
        .then(([page, summaryDto, egressDto, largestDto]) => {
          setItems(page.items);
          setNextCursor(page.nextCursor);
          setSummary(summaryDto);
          setEgress(egressDto);
          setLargest(largestDto);
          setStatus("ready");
        })
        .catch((err: unknown) => {
          setErrorMessage(err instanceof SiteAttachmentStorageError ? err.message : strings.storagePageLoadError);
          setStatus("error");
        });
    },
    [user?.access_token, siteId, strings],
  );

  useEffect(() => {
    if (!hasPermission("site:configure")) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(sort, filter);
    // Reload whenever sort/filter changes - a fresh page, not an append, so `sort`/`filter` are the
    // only dependencies that should re-trigger this (adding `load` here would also re-run on every
    // token refresh, which is not a reason to discard the current page).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, filter, hasPermission]);

  const loadMore = useCallback(() => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId || !nextCursor) {
      return;
    }

    setLoadingMore(true);
    fetchSiteAttachments(accessToken, siteId, { sort, filter, cursor: nextCursor })
      .then((page) => {
        setItems((prev) => [...prev, ...page.items]);
        setNextCursor(page.nextCursor);
      })
      .catch((err: unknown) => setErrorMessage(err instanceof SiteAttachmentStorageError ? err.message : strings.storagePageLoadError))
      .finally(() => setLoadingMore(false));
  }, [user?.access_token, siteId, sort, filter, nextCursor, strings]);

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedBytes = items.filter((i) => selected.has(i.id)).reduce((sum, i) => sum + i.sizeBytes, 0);

  const confirmDelete = () => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId || selected.size === 0) {
      return;
    }

    setDeleting(true);
    bulkDeleteAttachments(accessToken, siteId, [...selected])
      .then((result) => {
        setItems((prev) => prev.filter((i) => !selected.has(i.id)));
        setSelected(new Set());
        setConfirmOpen(false);
        setResultMessage(
          `${strings.storageDeleteResultPrefix}${result.deletedCount}${strings.storageDeleteResultFreedSeparator}${formatByteSize(result.freedBytes)}`,
        );
        return fetchStorageSummary(accessToken, siteId).then(setSummary);
      })
      .catch((err: unknown) => setErrorMessage(err instanceof SiteAttachmentStorageError ? err.message : strings.storagePageLoadError))
      .finally(() => setDeleting(false));
  };

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission("site:configure")) {
    return <AccessRefusal title={strings.navAccountStorage} message={strings.storagePageForbidden} strings={strings} />;
  }

  const columns: TableColumn<AttachmentListItemDto>[] = [
    {
      key: "select",
      header: strings.storageColumnSelect,
      render: (row) => (
        <input
          type="checkbox"
          checked={selected.has(row.id)}
          onChange={() => toggleSelected(row.id)}
          aria-label={strings.storageColumnSelect}
        />
      ),
    },
    {
      key: "type",
      header: strings.storageColumnType,
      render: (row) => (
        <>
          {row.contentType}
          {row.isDuplicate && (
            <>
              {" "}
              <Badge tone="accent">{strings.storageDuplicateBadge}</Badge>
            </>
          )}
        </>
      ),
    },
    { key: "size", header: strings.storageColumnSize, align: "end", render: (row) => formatByteSize(row.sizeBytes) },
    {
      key: "conversation",
      header: strings.storageColumnConversation,
      render: (row) => <Link to={`/conversations/${row.conversationId}`}>{row.conversationId.slice(0, 8)}</Link>,
    },
    {
      key: "sender",
      header: strings.storageColumnSender,
      render: (row) => (row.senderKind ? senderLabel(row.senderKind, strings) : strings.storageSenderUnknown),
    },
    { key: "createdAt", header: strings.storageColumnDate, render: (row) => formatAbsolute(new Date(row.createdAt), timeZone, strings) },
    {
      key: "downloads",
      header: strings.storageColumnDownloads,
      align: "end",
      render: (row) => (row.downloadCount === 0 ? strings.storageNeverDownloadedBadge : String(row.downloadCount)),
    },
  ];

  return (
    <>
      <PageHead title={strings.navAccountStorage} description={strings.storagePageIntro} />

      {status === "loading" && (
        <Panel>
          <Skeleton lines={4} label={strings.storagePageLoadingLabel} />
        </Panel>
      )}

      {status === "error" && errorMessage && <Alert tone="danger">{errorMessage}</Alert>}

      {status === "ready" && summary && (
        <>
          <Panel title={strings.storageQuotaPanelTitle}>
            <div className="ago-field__description">
              {strings.storageQuotaUsedPrefix}
              {formatByteSize(summary.usedBytes)}
              {strings.storageQuotaUsedSeparator}
              {formatByteSize(summary.totalBytes)}
            </div>
            <progress value={Math.min(summary.usedBytes, summary.totalBytes)} max={Math.max(summary.totalBytes, 1)} />
            {egress && (
              <p className="ago-field__description">
                {strings.storageEgressThisMonthPrefix}
                {egress.downloadCount}
                {strings.storageEgressThisMonthSeparator}
                {formatByteSize(egress.bytesOut)}
                {strings.storageEgressThisMonthSuffix}
              </p>
            )}
          </Panel>

          {largest.length > 0 && (
            <Panel title={strings.storageLargestConversationsTitle} quiet>
              <ul>
                {largest.map((c) => (
                  <li key={c.conversationId}>
                    <Link to={`/conversations/${c.conversationId}`}>{c.conversationId.slice(0, 8)}</Link>
                    {" — "}
                    {formatByteSize(c.totalBytes)} ({c.attachmentCount})
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {resultMessage && <Alert tone="success">{resultMessage}</Alert>}

          <Panel
            title={strings.storageTablePanelTitle}
            actions={
              <>
                <Select value={sort} onChange={(e) => setSort(e.target.value as AttachmentListSort)} aria-label={strings.storageSortLabel}>
                  <option value="sizeDesc">{strings.storageSortSizeDesc}</option>
                  <option value="typeAsc">{strings.storageSortTypeAsc}</option>
                  <option value="ageAsc">{strings.storageSortAgeAsc}</option>
                  <option value="conversationAsc">{strings.storageSortConversationAsc}</option>
                  <option value="senderAsc">{strings.storageSortSenderAsc}</option>
                </Select>
                <Select value={filter} onChange={(e) => setFilter(e.target.value as AttachmentListFilter)} aria-label={strings.storageFilterLabel}>
                  <option value="none">{strings.storageFilterNone}</option>
                  <option value="neverDownloaded">{strings.storageFilterNeverDownloaded}</option>
                  <option value="duplicates">{strings.storageFilterDuplicates}</option>
                </Select>
                <Button variant="danger" disabled={selected.size === 0} onClick={() => setConfirmOpen(true)}>
                  {strings.storageBulkDeleteButtonPrefix}
                  {selected.size > 0 ? ` (${selected.size})` : ""}
                </Button>
              </>
            }
          >
            {items.length === 0 ? (
              <p>{strings.storageNoAttachments}</p>
            ) : (
              <>
                <Table caption={strings.storageTablePanelTitle} columns={columns} rows={items} rowKey={(row) => row.id} />
                {nextCursor && (
                  <Button variant="ghost" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? strings.storagePageLoadingLabel : strings.storageLoadMore}
                  </Button>
                )}
              </>
            )}
          </Panel>
        </>
      )}

      <Dialog
        open={confirmOpen}
        title={strings.storageConfirmDeleteTitle}
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              {strings.storageConfirmDeleteCancel}
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
              {deleting ? strings.storagePageLoadingLabel : strings.storageConfirmDeleteConfirm}
            </Button>
          </>
        }
      >
        <p>
          {strings.storageConfirmDeleteMessagePrefix}
          {selected.size}
          {strings.storageConfirmDeleteMessageMiddle}
          {formatByteSize(selectedBytes)}
        </p>
      </Dialog>
    </>
  );
}

function senderLabel(kind: string, strings: ReturnType<typeof useStrings>): string {
  switch (kind) {
    case "Visitor":
      return strings.storageSenderVisitor;
    case "Operator":
      return strings.storageSenderOperator;
    case "System":
      return strings.storageSenderSystem;
    case "AutoGreeting":
      return strings.storageSenderAutoGreeting;
    default:
      return strings.storageSenderUnknown;
  }
}
