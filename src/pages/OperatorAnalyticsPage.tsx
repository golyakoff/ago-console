import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { fetchOperatorAnalytics } from "../api/conversationsApi.js";
import { ApiProblemError } from "../api/problemDetails.js";
import type { OperatorAnalyticsBucketDto, OperatorAnalyticsChannelBucketDto } from "../realtime/protocol/types.js";
import { PageHead } from "../shell/AppShell.js";
import { Alert } from "../components/Alert.js";
import { Button } from "../components/Button.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { Table } from "../components/Table.js";
import type { TableColumn } from "../components/Table.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";
import { formatDateStamp, formatDurationSeconds, parseInstant, resolveTimeZone } from "../time/format.js";

/** A `<input type="date">` value turned into the start/end of that day in the browser's own local
 * time - the identical helper `SearchConversationsPage` already established for `18-01`'s own
 * date-range form, restated here rather than shared across two files for two four-line functions
 * (that file's own local `stateLabel`/`authorLabel` set the same "not worth the coupling" precedent).
 */
function startOfDayIso(dateInput: string): string {
  return new Date(`${dateInput}T00:00:00`).toISOString();
}

function endOfDayIso(dateInput: string): string {
  return new Date(`${dateInput}T23:59:59.999`).toISOString();
}

/** `Ago.Chat.Domain.ChannelKind`'s own member names, plus the read-time `"Widget"` label
 * (`IOperatorAnalyticsReadStore`'s own remarks) - the wire value is never shown to an operator
 * unlabelled. Falls back to the raw wire value for anything this table does not recognise, so a
 * future channel added server-side renders as itself rather than disappearing. */
function channelLabel(channel: string, strings: ConsoleStrings): string {
  switch (channel) {
    case "Widget":
      return strings.analyticsChannelWidget;
    case "Sms":
      return strings.analyticsChannelSms;
    case "Max":
      return strings.analyticsChannelMax;
    case "Telegram":
      return strings.analyticsChannelTelegram;
    case "WhatsApp":
      return strings.analyticsChannelWhatsApp;
    default:
      return channel;
  }
}

interface AnalyticsRow {
  key: string;
  channel: string;
  bucket: OperatorAnalyticsBucketDto;
}

/**
 * `18-08`: `/analytics` - the site owner's own basic self-service report: conversation volume,
 * average first-response time, and conversations that never got a reply, overall and per channel.
 * Gated on `site:configure`, the same permission `AdminConversationsPage`/`SearchConversationsPage`
 * already use for the identical "site-wide oversight, not an ordinary operator's own view" reasoning
 * (`GetOperatorAnalyticsForSiteHandler`'s own remarks, `ago-chat`).
 *
 * <b>Why a page, not a panel.</b> Same reasoning `SearchConversationsPage`'s own doc comment already
 * gives for itself: this report has no anchor to any one open conversation, needs its own date-range
 * form, and belongs beside `/admin`/`/search` in the site-wide oversight group of screens, not inside
 * `ConversationPage`'s aside.
 *
 * <b>One table, not two.</b> The overall bucket and the per-channel breakdown are the identical shape
 * (`OperatorAnalyticsBucketDto`), so they render as one `Table` whose first row is "All channels" -
 * simpler than a summary block above a second, separate table for the same three columns, and it is
 * still exactly the "plain table/summary, not a charting library" shape this item's own Done-when
 * asks for.
 *
 * <b>The date-range form is UX-only</b>, the same call `SearchConversationsPage` already makes for its
 * own two date fields: `GetOperatorAnalyticsForSiteHandler` is the real authority (`from >= to` is its
 * own `400 Analytics.InvalidRange`), and this page always renders the range the *response* echoes
 * back, never the raw values typed into the two inputs.
 */
export function OperatorAnalyticsPage() {
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const [timeZone] = useState(() => resolveTimeZone());

  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");

  const [overall, setOverall] = useState<OperatorAnalyticsBucketDto | null>(null);
  const [byChannel, setByChannel] = useState<OperatorAnalyticsChannelBucketDto[]>([]);
  const [effectiveFrom, setEffectiveFrom] = useState<string | null>(null);
  const [effectiveTo, setEffectiveTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowed = hasPermission("site:configure");

  const runReport = useCallback(
    async (range: { from?: string; to?: string }) => {
      const accessToken = user?.access_token;
      if (!accessToken) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetchOperatorAnalytics(accessToken, range);
        setOverall(response.overall);
        setByChannel(response.byChannel);
        setEffectiveFrom(response.from);
        setEffectiveTo(response.to);
      } catch (err) {
        if (err instanceof ApiProblemError && err.code === "Conversation.Forbidden") {
          setError(strings.analyticsForbiddenError);
        } else if (err instanceof ApiProblemError && err.code === "Analytics.InvalidRange") {
          setError(strings.analyticsInvalidRangeError);
        } else {
          setError(strings.analyticsLoadError);
        }
      } finally {
        setLoading(false);
      }
    },
    [user?.access_token, strings],
  );

  // Loads the server's own default window (`GetOperatorAnalyticsForSiteHandler.DefaultWindowDays`) on
  // first render, exactly once permission is confirmed - the same "load with no range named" first
  // paint `SearchConversationsPage` deliberately does not do (that screen waits for a phrase), but
  // this one is a report an owner opens to *see something immediately*, not a query they type first.
  useEffect(() => {
    if (allowed) {
      void runReport({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void runReport({
      from: fromInput ? startOfDayIso(fromInput) : undefined,
      to: toInput ? endOfDayIso(toInput) : undefined,
    });
  };

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!allowed) {
    return (
      <>
        <PageHead title={strings.navAnalytics} />
        <Alert tone="danger">{strings.analyticsForbiddenError}</Alert>
        <p>
          <Link to="/">{strings.siteConfigBackToQueue}</Link>
        </p>
      </>
    );
  }

  const effectiveFromAt = parseInstant(effectiveFrom);
  const effectiveToAt = parseInstant(effectiveTo);

  const rows: AnalyticsRow[] = overall
    ? [
        { key: "__overall", channel: strings.analyticsOverallRowLabel, bucket: overall },
        ...byChannel.map((entry) => ({ key: entry.channel, channel: channelLabel(entry.channel, strings), bucket: entry.bucket })),
      ]
    : [];

  const columns: TableColumn<AnalyticsRow>[] = [
    { key: "channel", header: strings.analyticsChannelColumn, render: (row) => row.channel },
    {
      key: "conversationCount",
      header: strings.analyticsConversationCountColumn,
      align: "end",
      render: (row) => row.bucket.conversationCount,
    },
    {
      key: "averageFirstResponse",
      header: strings.analyticsAverageFirstResponseColumn,
      align: "end",
      render: (row) =>
        row.bucket.averageFirstResponseSeconds === null
          ? strings.analyticsNoResponsesValue
          : formatDurationSeconds(row.bucket.averageFirstResponseSeconds),
    },
    {
      key: "missedCount",
      header: strings.analyticsMissedCountColumn,
      align: "end",
      render: (row) => row.bucket.missedCount,
    },
  ];

  return (
    <>
      <PageHead title={strings.navAnalytics} description={strings.analyticsPageDescription} />

      <form className="ago-search-form" onSubmit={handleSubmit}>
        <Field label={strings.analyticsFromFieldLabel}>
          {(controlProps) => (
            <Input
              {...controlProps}
              type="date"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
              disabled={loading}
            />
          )}
        </Field>

        <Field label={strings.analyticsToFieldLabel}>
          {(controlProps) => (
            <Input
              {...controlProps}
              type="date"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              disabled={loading}
            />
          )}
        </Field>

        <Button type="submit" variant="primary" disabled={loading}>
          {strings.analyticsApplyButton}
        </Button>
      </form>

      {error && <Alert tone="danger">{error}</Alert>}

      {effectiveFromAt && effectiveToAt && (
        <p className="ago-meta">
          {strings.analyticsRangeLabel} {formatDateStamp(effectiveFromAt, timeZone)} –{" "}
          {formatDateStamp(effectiveToAt, timeZone)}
        </p>
      )}

      {loading ? (
        <Skeleton lines={4} label={strings.analyticsLoadingLabel} />
      ) : overall && overall.conversationCount === 0 ? (
        <p className="ago-empty">{strings.analyticsEmpty}</p>
      ) : overall ? (
        <Table caption={strings.analyticsPageDescription} columns={columns} rows={rows} rowKey={(row) => row.key} />
      ) : null}
    </>
  );
}
