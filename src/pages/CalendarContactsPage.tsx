import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import { getContacts, revealCustomerPhone, type Contact } from "../api/calendarApi.js";
import { calendarErrorMessage } from "./calendarErrorMessage.js";
import { CalendarAccessRefusal } from "../calendar/calendarAccess.js";
import { phoneStatusWarningGlyph, renderPersonName, renderPhone, type RevealControl } from "../calendar/calendarFormat.js";
import { usePersonNames, type PersonNames } from "../calendar/usePersonNames.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { Table, type TableColumn } from "../components/Table.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";
import { formatAbsolute, formatDateStamp, parseInstant, resolveTimeZone } from "../time/format.js";

/** `26-269`: the Russian three-way plural (1 / 2-4 / 5+) for the no-show pill's own counted noun -
 * kept page-local, the same way `WorkerScheduleSection`'s own `slotWord` is, since no other screen
 * counts no-shows in a sentence. */
function noShowWord(strings: ConsoleStrings, count: number): string {
  if (count === 1) {
    return strings.calendarNoShowWordOne;
  }
  return count < 5 ? strings.calendarNoShowWordFew : strings.calendarNoShowWordMany;
}

/** `26-269`/`26-269-clients-redesign.md` §1.5.3: client-side search over the already-loaded,
 * already name-merged list - by name (read through the same `PersonNames` lookup the name column
 * renders through) or by phone (the raw wire string, masked or not - an operator searching a masked
 * row by its visible digits still finds it). Empty query matches everything, so this doubles as the
 * "no filter active" case without a separate branch at the call site. */
function matchesContactSearch(contact: Contact, names: PersonNames, normalizedQuery: string): boolean {
  if (normalizedQuery === "") {
    return true;
  }

  if (contact.phone.toLowerCase().includes(normalizedQuery)) {
    return true;
  }

  const nameState = names.lookup(contact.personId);
  return nameState.status === "resolved" && nameState.displayName !== null && nameState.displayName.toLowerCase().includes(normalizedQuery);
}

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
 * `23-30`/`23-12`: a masked phone gets a Reveal button (`renderPhone`'s own doc comment). The two
 * underlying facts `phoneVerifiedAt`/`phoneConfirmedByOperatorAt` are never merged - `decisions.md`
 * §5: "'I called and it is them' is a different fact from an SMS code" - but `26-269` collapsed their
 * *list-row presentation* from two full-sentence badge columns to one warning glyph
 * (`phoneStatusWarningGlyph`), shown only when neither fact holds; see that function's own doc comment.
 *
 * `26-269`: a search field above the table filters the already-loaded, already name-merged list by
 * name or phone, client-side and live as the operator types (`matchesContactSearch`). No new backend
 * read - `26-269-clients-redesign.md` §1.5.3 records server-side search as a scale follow-up, not v1.
 */
export function CalendarContactsPage() {
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const timeZone = useMemo(() => resolveTimeZone(), []);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // `26-269`: the live search box's own text - filters `contacts` client-side, never refetched.
  const [searchText, setSearchText] = useState("");
  // `23-30`: which person's own Reveal is in flight, if any - `CalendarWorkerSlotsPage`'s own
  // identical state.
  const [revealingPersonId, setRevealingPersonId] = useState<string | null>(null);
  const canViewContacts = hasPermission("calendar:configure") || hasPermission("customer:read");
  // `26-161`/`adr/0184`: the display-merge - the person's name comes from chat's Person registry now,
  // not from this calendar response (the calendar dropped its person copy). One batch read over every
  // contact's person id, degrading to "name not shown yet" if chat is unreachable (`usePersonNames.ts`).
  const personNames = usePersonNames(user?.access_token, (contacts ?? []).map((contact) => contact.personId));

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

  // `23-30`: replaces every row for this person with the server's own unmasked phone - `Contact`
  // rows are keyed one-per-person already (`getContacts`' own shape), so this is a plain match on
  // `personId`, the identical replacement `CalendarWorkerSlotsPage.handleReveal` uses.
  const handleReveal = async (personId: string) => {
    const accessToken = user?.access_token;
    if (!accessToken) {
      return;
    }

    setRevealingPersonId(personId);
    setError(null);
    try {
      const { phone } = await revealCustomerPhone(accessToken, personId, "ConsoleContacts");
      setContacts((prev) => prev?.map((row) => (row.personId === personId ? { ...row, phone, masked: false } : row)) ?? prev);
    } catch (reason) {
      setError(calendarErrorMessage(reason, strings));
    } finally {
      setRevealingPersonId(null);
    }
  };

  const reveal: RevealControl = { revealingPersonId, onReveal: (id) => void handleReveal(id) };

  const columns: TableColumn<Contact>[] = [
    { key: "phone", header: strings.calendarContactsColumnPhone, render: (contact) => renderPhone(contact, strings, reveal) },
    {
      // `26-161`/`adr/0184`: the name is chat's now - read by person id from chat's Person registry
      // and display-merged here, not taken from a `displayName` field the calendar no longer serves.
      // The `23-60` Notes and Duplicate/Merge columns are gone with the calendar-side merge (O2).
      key: "name",
      header: strings.calendarContactsColumnName,
      render: (contact) => renderPersonName(contact.personId, personNames, strings),
    },
    {
      // `26-269`: replaces the two verification-badge columns (`phoneVerified`/`phoneConfirmed`) with
      // one glyph column - see `phoneStatusWarningGlyph`'s own doc comment for the single-actionable-
      // state rule. Renders nothing (not an empty cell wrapper) when the phone is verified either way.
      key: "phoneStatus",
      header: strings.calendarContactsColumnPhoneStatus,
      render: (contact) => phoneStatusWarningGlyph(contact, strings),
    },
    {
      // `26-269`/`26-269-clients-redesign.md` §3.4: a pill only when `noShowCount > 0` - zero is the
      // quiet default, exactly the same "no icon for the unremarkable case" rule the phone-status
      // glyph beside it follows. `tone="danger"` matches the mockup's own reddish pill - this is a
      // reliability warning to the operator, the same severity family as a failed request.
      key: "noShows",
      header: strings.calendarContactsColumnNoShows,
      render: (contact) =>
        contact.noShowCount > 0 ? (
          <Badge tone="danger">
            {contact.noShowCount} {noShowWord(strings, contact.noShowCount)}
          </Badge>
        ) : null,
      align: "end",
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

  // `26-269`: filters the already-loaded, already name-merged list - see `matchesContactSearch`'s own
  // doc comment. Recomputed on every render rather than memoised: the list this screen shows is at
  // most a tenant's whole customer roster, and `usePersonNames` is the one piece of this computation
  // expensive enough to memoise, which it already does internally.
  const normalizedQuery = searchText.trim().toLowerCase();
  const filteredContacts = (contacts ?? []).filter((contact) => matchesContactSearch(contact, personNames, normalizedQuery));

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
        <>
          <Field label={strings.calendarContactsSearchLabel}>
            {(controlProps) => (
              <Input
                {...controlProps}
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder={strings.calendarContactsSearchPlaceholder}
              />
            )}
          </Field>

          {filteredContacts.length === 0 ? (
            <Panel>
              <p className="ago-meta">{strings.calendarContactsSearchEmptyTitle}</p>
              <p className="ago-meta">{strings.calendarContactsSearchEmptyBody(searchText.trim())}</p>
              <Button variant="secondary" onClick={() => setSearchText("")}>
                {strings.calendarContactsClearSearchButton}
              </Button>
            </Panel>
          ) : (
            <Table
              caption={strings.calendarContactsDescription}
              columns={columns}
              rows={filteredContacts}
              rowKey={(contact) => contact.personId}
            />
          )}
        </>
      ) : null}
    </>
  );
}
