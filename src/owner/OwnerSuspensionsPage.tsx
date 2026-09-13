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
import { en } from "../i18n/en.js";
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
 */
export function OwnerSuspensionsPage() {
  const { user, logout } = useAuth();
  const { siteId: ownSiteId } = usePermissions();
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
        setError(err instanceof Error ? err.message : "Failed to load suspended accounts.");
      });
  }, [accessToken]);

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
      setDialogError("A reason is required.");
      return;
    }

    let minutes = 0;
    if (dialogMode === "extend") {
      minutes = Number.parseInt(minutesInput, 10);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        setDialogError("Enter a whole number of minutes, greater than zero.");
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
        setError("This account could no longer be reached. Reload the page and try again.");
      })
      .catch((err: unknown) => {
        setDialogError(err instanceof Error ? err.message : "Failed to update this suspension.");
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  const columns: TableColumn<OwnerSuspension>[] = [
    {
      key: "site",
      header: "Site",
      render: (row) => (
        <Link to={`/owner/sites/${row.siteId}`}>{row.siteName.trim().length > 0 ? row.siteName : "Unnamed site"}</Link>
      ),
    },
    {
      key: "suspendedUntil",
      header: "Suspended until",
      render: (row) => formatAbsolute(parseInstant(row.suspendedUntil), timeZone),
    },
    {
      key: "lastAction",
      header: "Most recent act",
      render: (row) => (
        <span title={formatAbsolute(parseInstant(row.lastActionAt), timeZone)}>
          {row.lastActionBy} - {row.lastActionReason}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="ago-row ago-row--tight">
          <Button onClick={() => openDialog(row, "extend")}>Extend</Button>
          <Button variant="secondary" onClick={() => openDialog(row, "unblock")}>
            Unblock
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AppShell
      sections={[]}
      pinnedItem={access === "granted" ? { to: "/owner", label: en.navPlatformSites, end: false } : undefined}
      credentialsArePublished={false}
      wide
      identity={
        <ShellIdentity operator={operatorDisplayName(user)} siteId={ownSiteId} onSignOut={() => void logout()} />
      }
    >
      {access === "unknown" && error === null && <Spinner label="Opening suspended accounts…" />}

      {access === "refused" && (
        <>
          <PageHead title="Suspended accounts" />
          <Alert tone="danger" title="Not authorized">
            This view is not available to you. The server refused the request, so no accounts were
            loaded.
          </Alert>
        </>
      )}

      {error !== null && access !== "refused" && (
        <>
          {access === "unknown" && <PageHead title="Suspended accounts" />}
          <Alert tone="danger">{error}</Alert>
        </>
      )}

      {access === "granted" && (
        <>
          <PageHead
            title="Suspended accounts"
            description="Every account currently under an enforcement freeze - a suspected violation, never non-payment. A suspension nobody extends lifts itself once its own deadline passes, with no manual step."
          />

          {suspensions.length === 0 ? (
            <p className="ago-empty">No accounts are currently suspended.</p>
          ) : (
            <Table
              caption="Every currently-suspended account, with its own deadline and most recent act."
              columns={columns}
              rows={suspensions}
              rowKey={(row) => row.siteId}
            />
          )}
        </>
      )}

      <Dialog
        open={dialogMode !== null}
        title={dialogMode === "extend" ? "Extend this suspension" : "Unblock this account"}
        onClose={() => {
          if (!submitting) {
            closeDialog();
          }
        }}
        footer={
          <>
            <Button variant="ghost" onClick={closeDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant={dialogMode === "unblock" ? "secondary" : "danger"}
              onClick={handleConfirm}
              disabled={submitting}
            >
              {submitting ? "Saving…" : dialogMode === "extend" ? "Extend" : "Unblock"}
            </Button>
          </>
        }
      >
        {dialogMode !== null && dialogSite && (
          <>
            <p>{dialogSite.siteName.trim().length > 0 ? dialogSite.siteName : "Unnamed site"}</p>
            {dialogMode === "extend" && (
              <Field
                label="Additional minutes"
                description="Added to the account's current suspended-until instant, not to now - this pushes the deadline further out."
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
              label="Reason"
              description='Write the reason you would be willing to show this tenant. "Cleanup" or "asked to" are not reasons.'
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
