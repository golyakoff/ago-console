import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { getSiteExportHistory, requestSiteExport, type SiteExportHistoryItemDto } from "../api/siteExportsApi.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { PageHead } from "../shell/AppShell.js";
import { AccessRefusal } from "../shell/accessRefusal.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { Table, type TableColumn } from "../components/Table.js";
import { useStrings } from "../i18n/StringsContext.js";
import { formatAbsolute, resolveTimeZone } from "../time/format.js";
import type { ConsoleStrings } from "../i18n/strings.js";

/** `16-03`'s own dedicated permission, checked server-side by every route `siteExportsApi.ts` calls
 * (`Ago.Chat.Application.UseCases.RequestSiteExport`/`GetSiteExportStatus`/`GetSiteExportHistory`,
 * all three gated on `Permission.SiteExport`). Colocated with this one page that checks it, on
 * `AccountDeletionPage.SITE_ERASE_PERMISSION`'s own precedent - no shared constants file exists
 * between this repository and `ago-chat`, and `consoleNav.ts` itself uses the literal string, the
 * same "no cross-file import of a permission constant" shape `site:erase` already has there. */
export const SITE_EXPORT_PERMISSION = "site:export";

/** No `default` case, deliberately: `status` is typed as the closed `SiteExportStatus` union
 * (`siteExportsApi.ts`), so TypeScript already proves this switch exhaustive over every value that
 * type can name - a `default` here would only hide the compile error a sixth backend status should
 * produce, the same bar `switch`es over a closed union already keep elsewhere in this console. `25-72`
 * added the `"Processing"` case below for exactly that reason: without it, this function would not
 * type-check once `SiteExportStatus` gained the member, rather than silently falling through at
 * runtime. */
function statusLabel(status: SiteExportHistoryItemDto["status"], strings: ConsoleStrings): string {
  switch (status) {
    case "Pending":
      return strings.siteExportStatusPending;
    // `25-72`: a request a Worker replica has atomically claimed and is currently building/uploading -
    // distinct from "Pending" so an operator who reloads mid-build sees "in progress" rather than a
    // stale "queued".
    case "Processing":
      return strings.siteExportStatusProcessing;
    case "Ready":
      return strings.siteExportStatusReady;
    case "Failed":
      return strings.siteExportStatusFailed;
    case "Expired":
      return strings.siteExportStatusExpired;
  }
}

/**
 * `16-03`: `/account/export` - "Скачать данные", reachable from "Администрирование" immediately
 * before "Удалить аккаунт" (`consoleNav.ts`'s own `buildAdminItems`). A table of every export request
 * this site has ever made, newest first (`GetSiteExportHistoryHandler`'s own "small and bounded, no
 * pagination" reasoning - the same reason this page never paginates or virtualises its own
 * `Table`), plus one button that starts a new one.
 *
 * ## Shape borrowed from, and shape not borrowed from, `AccountDeletionPage`
 *
 * The API-call convention (`user?.access_token` guard, a `load`/`state` pair driven from an effect,
 * `ApiProblemError` branching in the `catch`) and the permission-gating convention
 * (`permissions === null` -> `Spinner`, `!hasPermission(...)` -> `AccessRefusal`) are copied from
 * that page - see its own doc comment for why each exists. Its dialog-confirmation structure is not:
 * this screen has nothing destructive to confirm, so "Подготовить данные для скачивания" submits
 * directly, the same "no confirmation for a reversible, repeatable, non-destructive action" shape
 * `DocumentsPage`'s own publish button already has.
 *
 * ## No poll
 *
 * `siteExportsApi.ts`'s own `requestSiteExport` doc comment states the design plainly: triggering a
 * new export reloads this page's history list once (showing the new `Pending` row), and nothing here
 * polls that row forward to `Ready` on its own. `GetSiteExportStatusHandler`'s single-item poll
 * exists for exactly that job elsewhere in this codebase; duplicating a poll loop here, for a screen
 * whose own Scope only asks for a table and a trigger button, would be new behaviour nobody asked
 * for. An operator who wants to see a `Pending` row's own outcome reloads the page, the same manual
 * refresh `AdminConversationsPage`'s own list already leaves to its caller between its own timed
 * re-fetches.
 *
 * ## The expiry column's one shared source
 *
 * "дата автоматического удаления" renders `row.expiresAt` exactly as the server computed it
 * (`SiteExportHistoryItem`'s own remarks: `CompletedAt + SiteExportPruneJobOptions.RetentionWindow`,
 * the identical bound instance `SiteExportPruneJob` itself reads). This page never computes or
 * hard-codes "7 days" anywhere - if it ever needs to say the retention window in words rather than
 * only as a date, it has to come from the server for the same reason.
 */
export function SiteExportPage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const strings = useStrings();
  const tz = resolveTimeZone();

  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; items: SiteExportHistoryItemDto[] }
  >({ status: "loading" });
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const load = useCallback(() => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    setState({ status: "loading" });
    getSiteExportHistory(accessToken, siteId)
      .then((items) => setState({ status: "ready", items }))
      .catch((err: unknown) =>
        setState({
          status: "error",
          message: err instanceof ApiProblemError ? err.message : strings.siteExportLoadError,
        }),
      );
  }, [user?.access_token, siteId, strings]);

  useEffect(() => {
    if (!hasPermission(SITE_EXPORT_PERMISSION)) {
      return;
    }
    // `23-100`: same deliberate, per-line suppression `DocumentsPage`'s own effect already carries -
    // see that file's doc comment for why fetching in an effect is correct here rather than a defect
    // the analyzer is right to flag.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, hasPermission]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission(SITE_EXPORT_PERMISSION)) {
    return <AccessRefusal title={strings.navSiteExport} message={strings.siteExportForbidden} strings={strings} />;
  }

  const columns: TableColumn<SiteExportHistoryItemDto>[] = [
    {
      key: "requestedAt",
      header: strings.siteExportColumnRequestedAt,
      render: (row) => formatAbsolute(new Date(row.requestedAt), tz, strings),
    },
    {
      key: "link",
      header: strings.siteExportColumnLink,
      render: (row) =>
        row.status === "Ready" && row.downloadUrl ? (
          <a href={row.downloadUrl}>{strings.siteExportDownloadLink}</a>
        ) : (
          statusLabel(row.status, strings)
        ),
    },
    {
      key: "expiresAt",
      header: strings.siteExportColumnExpiresAt,
      render: (row) => (row.expiresAt ? formatAbsolute(new Date(row.expiresAt), tz, strings) : "—"),
    },
  ];

  const onRequest = async () => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    setRequesting(true);
    setRequestError(null);
    try {
      await requestSiteExport(accessToken, siteId);
      load();
    } catch (err) {
      setRequestError(err instanceof ApiProblemError ? err.message : strings.siteExportRequestError);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <>
      <PageHead title={strings.navSiteExport} description={strings.siteExportDescription} />

      {state.status === "loading" && <Skeleton lines={4} label={strings.siteExportLoadingLabel} />}

      {state.status === "error" && <Alert tone="danger">{state.message}</Alert>}

      {state.status === "ready" &&
        (state.items.length === 0 ? (
          <p className="ago-empty">{strings.siteExportEmpty}</p>
        ) : (
          <Table
            caption={strings.siteExportTableCaption}
            columns={columns}
            rows={state.items}
            rowKey={(row) => row.exportId}
          />
        ))}

      {requestError && <Alert tone="danger">{requestError}</Alert>}

      <div className="ago-row">
        <Button variant="primary" onClick={() => void onRequest()} disabled={requesting}>
          {requesting ? strings.siteExportRequestingButton : strings.siteExportRequestButton}
        </Button>
      </div>
    </>
  );
}
