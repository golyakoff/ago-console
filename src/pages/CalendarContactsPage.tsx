import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import { getContacts, type Contact } from "../api/calendarApi.js";
import { calendarErrorMessage } from "./calendarErrorMessage.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { Table, type TableColumn } from "../components/Table.js";
import { useStrings } from "../i18n/StringsContext.js";
import { formatAbsolute, formatDateStamp, parseInstant, resolveTimeZone } from "../time/format.js";

/**
 * `22-06`/`adr/0093`: `/calendar/contacts` - every customer lead card the tenant holds, moved from
 * `ago-calendar-console`'s own `ContactsPage.tsx` and rewritten against this console's closed
 * eleven-component set. Gated on `customer:read` server-side (unchanged, `20-12`); the console-level
 * gate here is `calendar:configure`, the same coarse nav-visibility gate every other calendar screen
 * uses - a finer-grained client-side gate on `customer:read` specifically was not ported, matching
 * the source console's own shape (it had no client-side gating of any kind before this item).
 */
export function CalendarContactsPage() {
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const timeZone = useMemo(() => resolveTimeZone(), []);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const accessToken = user?.access_token;
      if (!accessToken) {
        return;
      }

      try {
        setContacts(await getContacts(accessToken, signal));
        setError(null);
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(calendarErrorMessage(reason, strings));
        }
      }
    },
    [user?.access_token, strings],
  );

  useEffect(() => {
    if (!hasPermission("calendar:configure") || config.calendarApiBaseUrl === null) {
      return;
    }
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload, hasPermission]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission("calendar:configure")) {
    return (
      <>
        <PageHead title={strings.navCalendarContacts} />
        <Alert tone="danger">{strings.calendarContactsForbidden}</Alert>
        <p>
          <Link to="/">{strings.siteConfigBackToQueue}</Link>
        </p>
      </>
    );
  }

  if (config.calendarApiBaseUrl === null) {
    return (
      <>
        <PageHead title={strings.navCalendarContacts} />
        <Alert tone="info">{strings.calendarNotConfigured}</Alert>
      </>
    );
  }

  const columns: TableColumn<Contact>[] = [
    { key: "phone", header: strings.calendarContactsColumnPhone, render: (contact) => contact.phone },
    {
      key: "name",
      header: strings.calendarContactsColumnName,
      render: (contact) => contact.displayName ?? <span className="ago-meta">{strings.calendarNotRecordedLabel}</span>,
    },
    { key: "notes", header: strings.calendarContactsColumnNotes, render: (contact) => contact.notes ?? <span className="ago-meta">—</span> },
    { key: "noShows", header: strings.calendarContactsColumnNoShows, render: (contact) => contact.noShowCount, align: "end" },
    {
      key: "firstSeen",
      header: strings.calendarContactsColumnFirstSeen,
      render: (contact) => {
        const instant = parseInstant(contact.firstSeenAt);
        return instant === null ? null : <span title={formatAbsolute(instant, timeZone, strings)}>{formatDateStamp(instant, timeZone, strings)}</span>;
      },
    },
    {
      key: "lastSeen",
      header: strings.calendarContactsColumnLastSeen,
      render: (contact) => {
        const instant = parseInstant(contact.lastSeenAt);
        return instant === null ? null : <span title={formatAbsolute(instant, timeZone, strings)}>{formatDateStamp(instant, timeZone, strings)}</span>;
      },
    },
  ];

  return (
    <>
      <PageHead
        title={strings.navCalendarContacts}
        description={strings.calendarContactsDescription}
        aside={<Button onClick={() => void reload()}>{strings.calendarRefreshButton}</Button>}
      />

      {error !== null && <Alert tone="danger">{error}</Alert>}

      {contacts === null && error === null ? (
        <Panel>
          <Skeleton lines={4} label={strings.calendarLoading} />
        </Panel>
      ) : contacts !== null && contacts.length === 0 ? (
        <Panel>
          <p className="ago-meta">{strings.calendarContactsEmpty}</p>
        </Panel>
      ) : contacts !== null && contacts.length > 0 ? (
        <Table caption={strings.calendarContactsDescription} columns={columns} rows={contacts} rowKey={(contact) => contact.customerId} />
      ) : null}
    </>
  );
}
