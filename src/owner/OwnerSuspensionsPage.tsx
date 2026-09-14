import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { operatorDisplayName } from "../auth/operatorDisplayName.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  extendOwnerSuspension,
  fetchOwnerSuspensions,
  unblockOwnerSuspension,
  type OwnerSuspension,
} from "../api/ownerApi.js";
import { useStrings } from "../i18n/StringsContext.js";
import { AppShell, PageHead, ShellIdentity } from "../shell/AppShell.js";
import { Alert } from "../components/Alert.js";
import { Button } from "../components/Button.js";
import { Dialog } from "../components/Dialog.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Spinner } from "../components/Spinner.js";
import { Table, type TableColumn } from "../components/Table.js";
import { Textarea } from "../components/Textarea.js";
import { formatAbsolute, parseInstant, resolveTimeZone } from "../time/format.js";

/** The same pre-answer/granted/refused shape `OwnerPricingPage`'s own access type uses, for the
 * identical reason - there is no partial state to render while the server has not yet spoken. */
type OwnerSuspensionsAccess = "unknown" | "granted" | "refused";

/**
 * `22-08`/`adr/0166`: "a console screen listing currently-suspended accounts" -
 * `docs/backlog/22-08-*.md`'s own Scope, verbatim. Reached from `OwnerSitesPage`'s own `aside` link,
 * not from a second pinned nav entry - the identical precedent `OwnerPricingPage` already sets.
 *
 * **Deliberately not modelled on `OwnerSitesPage`'s own read-only shape.** This screen writes
 * (extend, unblock) - `OwnerSiteDetailPage`'s own per-row-action dialog pattern is the real
 * precedent: the row being acted on is the dialog's own state, one shared dialog for both actions,
 * `suspensionDialogMode` deciding which call to make.
 *
 * **The "suspend a site in the first place" action lives on `OwnerSiteDetailPage` instead** - a site
 * the owner is already looking at, not this list, which only ever shows sites already suspended.
 *
 * **`25-89`: reads `useStrings()` now, inside `App.tsx`'s own `OwnerStringsProvider`** - the same
 * change `OwnerSitesPage.tsx`'s own doc comment describes for itself; see that file's remarks and
 * `OwnerStringsProvider.tsx`'s own doc comment for the full reasoning.
 */
export function OwnerSuspensionsPage() {
  const { user, logout } = useAuth();
  const { siteId: ownSiteId } = usePermissions();
  const strings = useStrings();
  const accessToken = user?.access_token;

  const [access, setAccess] = useState<OwnerSuspensionsAccess>("unknown");
  const [suspensions, setSuspensions] = useState<OwnerSuspension[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [dialogSite, setDialogSite] = useState<OwnerSuspension | null>(null);
  const [dialogMode, setDialogMode] = useState<"extend" | "unblock" | null>(null);
  const [minutesInput, setMinutesInput] = useState("60");
  const [reasonInput, setReasonInput] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const timeZone = resolveTimeZone();

  const load = useCallback(() => {
    if (!accessToken) {
      return;
    }

    fetchOwnerSuspensions(accessToken)
      .then((outcome) => {
        if (outcome.status === "not-authorized") {
          setAccess("refused");
          return;
        }

        setAccess("granted");
        setSuspensions(outcome.suspensions);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : strings.ownerSuspensionsLoadFailed);
      });
  }, [accessToken, strings]);

  useEffect(() => {
    load();
  }, [load]);

  const openDialog = (site: OwnerSuspension, mode: "extend" | "unblock") => {
    setDialogSite(site);
    setDialogMode(mode);
    setMinutesInput("60");
    setReasonInput("");
    setDialogError(null);
  };

  const closeDialog = () => {
    setDialogSite(null);
    setDialogMode(null);
  };

  const handleConfirm = () => {
    if (!accessToken || !dialogSite || !dialogMode) {
      return;
    }

    const trimmedReason = reasonInput.trim();
    if (trimmedReason.length === 0) {
      setDialogError(strings.ownerSuspensionsReasonRequired);
      return;
    }

    let minutes = 0;
    if (dialogMode === "extend") {
      minutes = Number.parseInt(minutesInput, 10);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        setDialogError(strings.ownerMinutesInvalid);
        return;
      }
    }

    setSubmitting(true);
    setDialogError(null);

    const request =
      dialogMode === "extend"
        ? extendOwnerSuspension(accessToken, dialogSite.siteId, minutes, trimmedReason)
        : unblockOwnerSuspension(accessToken, dialogSite.siteId, trimmedReason);

    request
      .then((outcome) => {
        if (outcome.status === "ok") {
          closeDialog();
          load();
          return;
        }

        if (outcome.status === "conflict" || outcome.status === "invalid") {
          setDialogError(outcome.message);
          return;
        }

        closeDialog();
        setError(strings.ownerSuspensionsCouldNotBeReached);
      })
      .catch((err: unknown) => {
        setDialogError(err instanceof Error ? err.message : strings.ownerSuspensionsUpdateFailed);
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  const columns: TableColumn<OwnerSuspension>[] = [
    {
      key: "site",
      header: strings.ownerSitesColumnSite,
      render: (row) => (
        <Link to={`/owner/sites/${row.siteId}`}>{row.siteName.trim().length > 0 ? row.siteName : strings.ownerUnnamedSite}</Link>
      ),
    },
    {
      key: "suspendedUntil",
      header: strings.ownerSuspensionsColumnSuspendedUntil,
      render: (row) => formatAbsolute(parseInstant(row.suspendedUntil), timeZone),
    },
    {
      key: "lastAction",
      header: strings.ownerSuspensionsColumnLastAction,
      render: (row) => (
        <span title={formatAbsolute(parseInstant(row.lastActionAt), timeZone)}>
          {row.lastActionBy} - {row.lastActionReason}
        </span>
      ),
    },
    {
      key: "actions",
      header: strings.ownerSuspensionsColumnActions,
      render: (row) => (
        <div className="ago-row ago-row--tight">
          <Button onClick={() => openDialog(row, "extend")}>{strings.ownerExtendButton}</Button>
          <Button variant="secondary" onClick={() => openDialog(row, "unblock")}>
            {strings.ownerUnblockButton}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AppShell
      sections={[]}
      pinnedItem={access === "granted" ? { to: "/owner", label: strings.navPlatformSites, end: false } : undefined}
      credentialsArePublished={false}
      wide
      identity={
        <ShellIdentity operator={operatorDisplayName(user)} siteId={ownSiteId} onSignOut={() => void logout()} />
      }
    >
      {access === "unknown" && error === null && <Spinner label={strings.ownerSuspensionsOpeningLabel} />}

      {access === "refused" && (
        <>
          <PageHead title={strings.ownerSitesAsideSuspended} />
          <Alert tone="danger" title={strings.ownerNotAuthorizedTitle}>
            {strings.ownerSuspensionsNotAuthorizedBody}
          </Alert>
        </>
      )}

      {error !== null && access !== "refused" && (
        <>
          {access === "unknown" && <PageHead title={strings.ownerSitesAsideSuspended} />}
          <Alert tone="danger">{error}</Alert>
        </>
      )}

      {access === "granted" && (
        <>
          <PageHead
            title={strings.ownerSitesAsideSuspended}
            description={strings.ownerSuspensionsDescription}
          />

          {suspensions.length === 0 ? (
            <p className="ago-empty">{strings.ownerSuspensionsEmpty}</p>
          ) : (
            <Table
              caption={strings.ownerSuspensionsCaption}
              columns={columns}
              rows={suspensions}
              rowKey={(row) => row.siteId}
            />
          )}
        </>
      )}

      <Dialog
        open={dialogMode !== null}
        title={dialogMode === "extend" ? strings.ownerExtendDialogTitle : strings.ownerUnblockDialogTitle}
        onClose={() => {
          if (!submitting) {
            closeDialog();
          }
        }}
        footer={
          <>
            <Button variant="ghost" onClick={closeDialog} disabled={submitting}>
              {strings.cancelButton}
            </Button>
            <Button
              variant={dialogMode === "unblock" ? "secondary" : "danger"}
              onClick={handleConfirm}
              disabled={submitting}
            >
              {submitting ? strings.ownerSavingLabel : dialogMode === "extend" ? strings.ownerExtendButton : strings.ownerUnblockButton}
            </Button>
          </>
        }
      >
        {dialogMode !== null && dialogSite && (
          <>
            <p>{dialogSite.siteName.trim().length > 0 ? dialogSite.siteName : strings.ownerUnnamedSite}</p>
            {dialogMode === "extend" && (
              <Field
                label={strings.ownerAdditionalMinutesLabel}
                description={strings.ownerAdditionalMinutesDescription}
              >
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    type="number"
                    min={1}
                    step={1}
                    value={minutesInput}
                    onChange={(event) => setMinutesInput(event.target.value)}
                    disabled={submitting}
                  />
                )}
              </Field>
            )}
            <Field
              label={strings.ownerReasonFieldLabel}
              description={strings.ownerReasonFieldDescription}
              error={dialogError}
            >
              {(controlProps) => (
                <Textarea
                  {...controlProps}
                  rows={3}
                  value={reasonInput}
                  onChange={(event) => setReasonInput(event.target.value)}
                  disabled={submitting}
                />
              )}
            </Field>
          </>
        )}
      </Dialog>
    </AppShell>
  );
}
