import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { fetchVisitorRestrictions, liftVisitorRestriction, type VisitorRestrictionListItem } from "../api/visitorRestrictionsApi.js";
import { formatAbsolute, parseInstant, resolveTimeZone } from "../time/format.js";
import { PageHead } from "../shell/AppShell.js";
import { AccessRefusal } from "../shell/accessRefusal.js";
import { Alert } from "../components/Alert.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { Table, type TableColumn } from "../components/Table.js";
import { Skeleton } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";

/** `23-69`'s own kind, alongside `23-77`'s - each drawn with its own tone, the same
 * `AdminConversationsPage`-style constant-outside-the-component-plus-a-lookup-function shape (a tone
 * name carries no language, so it needs no `strings` either). */
const KIND_TONE: Record<VisitorRestrictionListItem["kind"], "accent" | "danger"> = {
  Spam: "accent",
  Block: "danger",
};

type Status = "active" | "expired" | "lifted";

function statusOf(row: VisitorRestrictionListItem, now: Date): Status {
  if (row.liftedAt) {
    return "lifted";
  }
  if (row.expiresAt && new Date(row.expiresAt) <= now) {
    return "expired";
  }
  return "active";
}

function statusLabel(status: Status, strings: ConsoleStrings): string {
  switch (status) {
    case "active":
      return strings.restrictedVisitorsStatusActive;
    case "expired":
      return strings.restrictedVisitorsStatusExpired;
    case "lifted":
      return strings.restrictedVisitorsStatusLifted;
  }
}

/**
 * `23-69`'s own Done-when: "the tenant can see how many, by whom, and read the conversations
 * themselves." `23-77`'s own reversibility requirement lives on the same screen, since both items
 * write the identical `visitor_restrictions` mechanism (`ago-chat`'s `IVisitorRestrictionRepository`'s
 * own remarks) - one list, one lift action, for both a time-windowed mute and an indefinite block.
 *
 * Gated on `site:configure`, client-side only for UX - `GetVisitorRestrictionsForSiteHandler`'s own
 * check is the real gate, the same posture `AdminConversationsPage` already takes for its own
 * identical permission.
 *
 * "Read the conversations themselves" is `sourceConversationId` linked to `/conversations/{id}` -
 * this screen does not re-render a conversation's own history inline; opening the existing
 * single-conversation view is enough to satisfy the requirement without a second, narrower reader.
 *
 * Deliberately no auto-refresh poll, unlike `AdminConversationsPage`: this is a compliance/oversight
 * screen an admin opens to check or to act, not a live queue - a manual "Refresh" action after a lift
 * is enough, the same one-shot-fetch shape `GetAccessRecordsForSiteHandler`'s own console screen would
 * use if `24-12` had shipped one.
 */
export function RestrictedVisitorsPage() {
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const [items, setItems] = useState<VisitorRestrictionListItem[] | null>(null);
  const [nextBeforeId, setNextBeforeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liftError, setLiftError] = useState<string | null>(null);
  const [liftingId, setLiftingId] = useState<string | null>(null);
  const [timeZone] = useState(() => resolveTimeZone());

  const canLift = hasPermission("conversation:mark_spam") || hasPermission("conversation:block");

  const load = useCallback(
    (before?: string) => {
      if (!user?.access_token) {
        return;
      }

      fetchVisitorRestrictions(user.access_token, before)
        .then((page) => {
          setItems((prev) => (before ? [...(prev ?? []), ...page.items] : page.items));
          setNextBeforeId(page.nextBeforeId);
          setError(null);
        })
        .catch(() => setError(strings.restrictedVisitorsLoadError));
    },
    [user?.access_token, strings],
  );

  useEffect(() => {
    if (!hasPermission("site:configure")) {
      return;
    }

    load();
  }, [load, hasPermission]);

  const onLift = useCallback(
    async (visitorId: string) => {
      if (!user?.access_token) {
        return;
      }

      setLiftingId(visitorId);
      setLiftError(null);
      try {
        await liftVisitorRestriction(user.access_token, visitorId);
        load();
      } catch {
        setLiftError(strings.restrictedVisitorsLiftError);
      } finally {
        setLiftingId(null);
      }
    },
    [user?.access_token, load, strings],
  );

  const columns = useMemo<TableColumn<VisitorRestrictionListItem>[]>(() => {
    const now = new Date();
    const cols: TableColumn<VisitorRestrictionListItem>[] = [
      {
        key: "visitor",
        header: strings.restrictedVisitorsColumnVisitor,
        render: (row) => (
          <Badge tone="neutral" mono>
            {row.visitorId.slice(0, 8)}
          </Badge>
        ),
      },
      {
        key: "kind",
        header: strings.restrictedVisitorsColumnKind,
        render: (row) => (
          <Badge tone={KIND_TONE[row.kind]}>
            {row.kind === "Spam" ? strings.restrictedVisitorsKindSpam : strings.restrictedVisitorsKindBlock}
          </Badge>
        ),
      },
      {
        key: "restrictedAt",
        header: strings.restrictedVisitorsColumnRestrictedAt,
        render: (row) => {
          const instant = parseInstant(row.restrictedAt);
          return <span className="ago-meta">{instant ? formatAbsolute(instant, timeZone, strings) : row.restrictedAt}</span>;
        },
      },
      {
        key: "restrictedBy",
        header: strings.restrictedVisitorsColumnRestrictedBy,
        render: (row) => <span className="ago-mono">{row.restrictedBy.slice(0, 8)}</span>,
      },
      {
        key: "expiresAt",
        header: strings.restrictedVisitorsColumnExpiresAt,
        render: (row) => {
          if (!row.expiresAt) {
            return <span className="ago-meta">{strings.restrictedVisitorsExpiresIndefinite}</span>;
          }
          const instant = parseInstant(row.expiresAt);
          return <span className="ago-meta">{instant ? formatAbsolute(instant, timeZone, strings) : row.expiresAt}</span>;
        },
      },
      {
        key: "status",
        header: strings.restrictedVisitorsColumnStatus,
        render: (row) => <span>{statusLabel(statusOf(row, now), strings)}</span>,
      },
    ];

    if (canLift) {
      cols.push({
        key: "actions",
        header: "",
        align: "end",
        render: (row) =>
          statusOf(row, now) === "active" ? (
            <Button size="sm" variant="ghost" disabled={liftingId === row.id} onClick={() => void onLift(row.visitorId)}>
              {strings.restrictedVisitorsLiftButton}
            </Button>
          ) : null,
      });
    }

    return cols;
  }, [strings, timeZone, canLift, liftingId, onLift]);

  if (permissions === null) {
    return <Skeleton lines={4} label={strings.restrictedVisitorsPageTitle} />;
  }

  if (!hasPermission("site:configure")) {
    return <AccessRefusal title={strings.navRestrictedVisitors} message={strings.adminForbidden} strings={strings} />;
  }

  return (
    <>
      <PageHead title={strings.restrictedVisitorsPageTitle} />

      {error && <Alert tone="danger">{error}</Alert>}
      {liftError && <Alert tone="danger">{liftError}</Alert>}

      {items === null ? (
        <Skeleton lines={4} label={strings.restrictedVisitorsPageTitle} />
      ) : items.length === 0 ? (
        <p className="ago-empty">{strings.restrictedVisitorsEmpty}</p>
      ) : (
        <>
          <Table
            caption={strings.restrictedVisitorsPageTitle}
            columns={columns}
            rows={items}
            rowKey={(row) => row.id}
          />
          {nextBeforeId && (
            <div className="ago-row">
              <Button variant="ghost" onClick={() => load(nextBeforeId)}>
                {strings.restrictedVisitorsLoadMoreButton}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
