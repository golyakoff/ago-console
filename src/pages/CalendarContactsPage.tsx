import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import { getContacts, revealCustomerPhone, type Contact } from "../api/calendarApi.js";
import { calendarErrorMessage } from "./calendarErrorMessage.js";
import { CalendarAccessRefusal } from "../calendar/calendarAccess.js";
import { renderPhone, type RevealControl } from "../calendar/calendarFormat.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { Table, type TableColumn } from "../components/Table.js";
import { useStrings } from "../i18n/StringsContext.js";
import { formatAbsolute, formatDateStamp, parseInstant, resolveTimeZone } from "../time/format.js";

/**
 * `22-06`/`adr/0093`: `/calendar/contacts` - every customer lead card the tenant holds, moved from
 * `ago-calendar-console`'s own `ContactsPage.tsx` and rewritten against this console's closed
 * eleven-component set. Gated on `customer:read` server-side (unchanged, `20-12`).
 *
 * <b>`23-57`: gated on `customer:read` client-side too, not `calendar:configure` alone.</b> Before
 * this item the console-level gate here was the coarse `calendar:configure` every other calendar
 * screen used, which the seeded Operator role never holds - so an operator holding `customer:read`
 * (the exact permission the server already checks) could be sent here by the nav and refused by the
 * page underneath it. `CalendarBookingsPage`'s own `23-34` gate is the precedent this follows:
 * `consoleNav.ts`'s `buildCalendarItems` draws this entry for the same `customer:read` check, so the
 * page has to accept what the nav promises.
 *
 * `23-30`/`23-12`: a masked phone gets a Reveal button (`renderPhone`'s own doc comment), and two
 * more columns show `phoneVerifiedAt`/`phoneConfirmedByOperatorAt` as separate badges with different
 * tones - `decisions.md` §5: "'I called and it is them' is a different fact from an SMS code", so
 * this report never collapses the two into one generic "verified" state.
 */
export function CalendarContactsPage() {
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const timeZone = useMemo(() => resolveTimeZone(), []);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // `23-30`: which customer's own Reveal is in flight, if any - `CalendarWorkerSlotsPage`'s own
  // identical state.
  const [revealingCustomerId, setRevealingCustomerId] = useState<string | null>(null);
  const canViewContacts = hasPermission("calendar:configure") || hasPermission("customer:read");

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
    if (!canViewContacts || config.calendarApiBaseUrl === null) {
      return;
    }
    const controller = new AbortController();
    // `23-100`: suppressed here rather than rewritten. `react-hooks/set-state-in-effect` is new in the
    // plugin's v7, which folded the React Compiler's own analyzer in; it follows the call below and sees a
    // `setState` reachable from an effect body. It is right about the shape and wrong about the defect:
    // fetching in an effect is what React's own documentation prescribes until a framework or Suspense
    // removes the need, and every `setState` reached from here runs after an `await`, never synchronously
    // in the effect body. Rewriting the call to satisfy the analyzer would answer "when should this
    // request happen" by accident rather than by decision.
    //
    // Per-line, replacing the file-scoped override `23-96` left: that one downgraded the rule for the
    // whole file, so a genuinely synchronous `setState` written here tomorrow was also only a warning.
    // This marks the one site that is deliberate and leaves the rest of the file an error again.
    //
    // Loads the contact list this screen exists to show.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload, canViewContacts]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!canViewContacts) {
    // `23-21`: the shared refusal - see `calendarAccess.tsx`'s own doc comment.
    return (
      <CalendarAccessRefusal
        title={strings.navCalendarContacts}
        forbiddenMessage={strings.calendarContactsForbidden}
        strings={strings}
      />
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

  // `23-30`: replaces every row for this customer with the server's own unmasked phone - `Contact`
  // rows are keyed one-per-customer already (`getContacts`' own shape), so this is a plain match on
  // `customerId`, the identical replacement `CalendarWorkerSlotsPage.handleReveal` uses.
  const handleReveal = async (customerId: string) => {
    const accessToken = user?.access_token;
    if (!accessToken) {
      return;
    }

    setRevealingCustomerId(customerId);
    setError(null);
    try {
      const { phone } = await revealCustomerPhone(accessToken, customerId, "ConsoleContacts");
      setContacts((prev) => prev?.map((row) => (row.customerId === customerId ? { ...row, phone, masked: false } : row)) ?? prev);
    } catch (reason) {
      setError(calendarErrorMessage(reason, strings));
    } finally {
      setRevealingCustomerId(null);
    }
  };

  const reveal: RevealControl = { revealingCustomerId, onReveal: (id) => void handleReveal(id) };

  const columns: TableColumn<Contact>[] = [
    { key: "phone", header: strings.calendarContactsColumnPhone, render: (contact) => renderPhone(contact, strings, reveal) },
    {
      key: "name",
      header: strings.calendarContactsColumnName,
      render: (contact) => contact.displayName ?? <span className="ago-meta">{strings.calendarNotRecordedLabel}</span>,
    },
    { key: "notes", header: strings.calendarContactsColumnNotes, render: (contact) => contact.notes ?? <span className="ago-meta">—</span> },
    { key: "noShows", header: strings.calendarContactsColumnNoShows, render: (contact) => contact.noShowCount, align: "end" },
    {
      // `23-30`/`decisions.md` §5: the SMS-code fact - `tone="success"`, the same tone
      // `ContactDetailsPanel`'s own `verified` badge uses, since this is the identical strength of
      // evidence (a code the visitor actually received and typed back).
      key: "phoneVerified",
      header: strings.calendarContactsColumnPhoneVerified,
      render: (contact) => {
        const instant = parseInstant(contact.phoneVerifiedAt);
        return instant === null ? (
          <Badge tone="neutral">{strings.calendarContactsNotVerifiedLabel}</Badge>
        ) : (
          <Badge tone="success" dot>
            <span title={formatAbsolute(instant, timeZone, strings)}>{strings.calendarContactsVerifiedLabel}</span>
          </Badge>
        );
      },
    },
    {
      // `23-30`/`decisions.md` §5: "I called and it is them" - a weaker, human-asserted fact, given
      // `tone="accent"` rather than `"success"` so it never reads as the same strength as the code
      // badge beside it.
      key: "phoneConfirmed",
      header: strings.calendarContactsColumnPhoneConfirmed,
      render: (contact) => {
        const instant = parseInstant(contact.phoneConfirmedByOperatorAt);
        return instant === null ? (
          <Badge tone="neutral">{strings.calendarContactsNotConfirmedLabel}</Badge>
        ) : (
          <Badge tone="accent">
            <span title={formatAbsolute(instant, timeZone, strings)}>{strings.calendarContactsConfirmedLabel}</span>
          </Badge>
        );
      },
    },
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
