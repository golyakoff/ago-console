import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { fetchOperatorAnalytics } from "../api/conversationsApi.js";
import { ApiProblemError } from "../api/problemDetails.js";
import type {
  OperatorAnalyticsBucketDto,
  OperatorAnalyticsCampaignBucketDto,
  OperatorAnalyticsChannelBucketDto,
  OperatorAnalyticsOperatorBucketDto,
  OperatorAnalyticsReferrerBucketDto,
} from "../realtime/protocol/types.js";
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

/** `18-09`: the raw operator id, truncated - the same "no display name exists, so the id itself" shape
 * `AdminConversationsPage`'s own assigned-operator column already established, reused verbatim rather
 * than inventing a different truncation convention for the identical kind of value. */
function operatorLabel(operatorId: string): ReactNode {
  return <span className="ago-mono">{operatorId.slice(0, 8)}</span>;
}

interface OperatorRow {
  key: string;
  operatorId: string;
  bucket: OperatorAnalyticsBucketDto;
}

/** `18-12`: the server's own `DirectReferrerLabel` wire literal (`OperatorAnalyticsReadStore.cs`,
 * `ago-chat`) is English by construction - like `channelLabel`'s `"Widget"` above, it is a read-time
 * label, not a domain value, so this maps it to the resolved locale's own string rather than showing
 * an English word inside a Russian-locale report. Any other value is a real referrer host, shown
 * exactly as captured - hosts are not translatable text. */
function referrerLabel(referrerHost: string, strings: ConsoleStrings): string {
  return referrerHost === "Direct" ? strings.analyticsDirectReferrerLabel : referrerHost;
}

interface ReferrerRow {
  key: string;
  referrer: string;
  bucket: OperatorAnalyticsBucketDto;
}

interface CampaignRow {
  key: string;
  campaign: string;
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
 * <b>One table, not two, for overall/per-channel.</b> The overall bucket and the per-channel breakdown
 * are the identical shape (`OperatorAnalyticsBucketDto`), so they render as one `Table` whose first row
 * is "All channels" - simpler than a summary block above a second, separate table for the same three
 * columns, and it is still exactly the "plain table/summary, not a charting library" shape this item's
 * own Done-when asks for.
 *
 * <b>`18-09`: a second table for the per-operator breakdown, not a third row-kind folded into the
 * first.</b> Unlike channel (a property every conversation always has - `Widget` is the fallback), an
 * operator is a genuinely different, independent dimension over the same window - mixing "all channels"
 * /"Widget"/"Sms" rows with "operator abcd1234" rows in one table would force a reader to work out which
 * column a given row is even sliced by. A second, separately-captioned `Table` right below keeps that
 * distinction visible for free, still on the same page (this report has one date range, one permission
 * check, one echoed window - a second page would either duplicate all three or awkwardly share state
 * across a route boundary for no real benefit) rather than the "new page linked from it" alternative the
 * backlog item's own Scope also allowed.
 *
 * <b>`18-12`: two more tables, same page, for the same reason `18-09`'s own table already gives.</b>
 * Referrer host and UTM campaign are independent dimensions over the identical window/permission/date
 * range this page already owns - extending `/analytics` costs no new route, no new nav entry, and no
 * duplicated date-range state, and the "new dedicated section" alternative the backlog item's own Scope
 * also allowed was rejected for exactly the reason a second *page* was rejected for the operator
 * breakdown above. Unlike channel (≤5 real values) and operator (bounded by seat count), referrer host
 * and UTM campaign are unbounded-cardinality dimensions in principle - in practice a small shop's own
 * traffic sources are still a short, readable list, and if that ever stops being true the fix is
 * pagination on these two tables specifically, not a reason to have built a separate page today.
 * `analyticsTrafficSourceNote` renders once, above both: this is what the browser reported, never a
 * verified fact - the same honesty discipline `18-10`'s own operator-reported-outcome note already
 * holds itself to, for a different reason (there it is a human's self-report; here it is an unverifiable
 * client-supplied header).
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
  const [byOperator, setByOperator] = useState<OperatorAnalyticsOperatorBucketDto[]>([]);
  const [byReferrer, setByReferrer] = useState<OperatorAnalyticsReferrerBucketDto[]>([]);
  const [byCampaign, setByCampaign] = useState<OperatorAnalyticsCampaignBucketDto[]>([]);
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
        setByOperator(response.byOperator);
        setByReferrer(response.byReferrer);
        setByCampaign(response.byCampaign);
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
      key: "averageDuration",
      header: strings.analyticsAverageDurationColumn,
      align: "end",
      render: (row) =>
        row.bucket.averageDurationSeconds === null
          ? strings.analyticsNoResponsesValue
          : formatDurationSeconds(row.bucket.averageDurationSeconds),
    },
    {
      key: "missedCount",
      header: strings.analyticsMissedCountColumn,
      align: "end",
      render: (row) => row.bucket.missedCount,
    },
  ];

  const operatorRows: OperatorRow[] = byOperator.map((entry) => ({
    key: entry.operatorId,
    operatorId: entry.operatorId,
    bucket: entry.bucket,
  }));

  const operatorColumns: TableColumn<OperatorRow>[] = [
    { key: "operator", header: strings.analyticsOperatorColumn, render: (row) => operatorLabel(row.operatorId) },
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
      key: "averageDuration",
      header: strings.analyticsAverageDurationColumn,
      align: "end",
      render: (row) =>
        row.bucket.averageDurationSeconds === null
          ? strings.analyticsNoResponsesValue
          : formatDurationSeconds(row.bucket.averageDurationSeconds),
    },
    {
      key: "missedCount",
      header: strings.analyticsMissedCountColumn,
      align: "end",
      render: (row) => row.bucket.missedCount,
    },
  ];

  // `18-12`: the identical four-column shape `columns`/`operatorColumns` above already use, applied to
  // the two new dimensions - a `bucket` reads the same regardless of what it is a bucket *of*.
  const referrerRows: ReferrerRow[] = byReferrer.map((entry) => ({
    key: entry.referrerHost,
    referrer: referrerLabel(entry.referrerHost, strings),
    bucket: entry.bucket,
  }));

  const referrerColumns: TableColumn<ReferrerRow>[] = [
    { key: "referrer", header: strings.analyticsReferrerColumn, render: (row) => row.referrer },
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
      key: "averageDuration",
      header: strings.analyticsAverageDurationColumn,
      align: "end",
      render: (row) =>
        row.bucket.averageDurationSeconds === null
          ? strings.analyticsNoResponsesValue
          : formatDurationSeconds(row.bucket.averageDurationSeconds),
    },
    {
      key: "missedCount",
      header: strings.analyticsMissedCountColumn,
      align: "end",
      render: (row) => row.bucket.missedCount,
    },
  ];

  const campaignRows: CampaignRow[] = byCampaign.map((entry) => ({
    key: entry.utmCampaign,
    campaign: entry.utmCampaign,
    bucket: entry.bucket,
  }));

  const campaignColumns: TableColumn<CampaignRow>[] = [
    { key: "campaign", header: strings.analyticsCampaignColumn, render: (row) => row.campaign },
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
      key: "averageDuration",
      header: strings.analyticsAverageDurationColumn,
      align: "end",
      render: (row) =>
        row.bucket.averageDurationSeconds === null
          ? strings.analyticsNoResponsesValue
          : formatDurationSeconds(row.bucket.averageDurationSeconds),
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
          {strings.analyticsRangeLabel} {formatDateStamp(effectiveFromAt, timeZone, strings)} –{" "}
          {formatDateStamp(effectiveToAt, timeZone, strings)}
        </p>
      )}

      {loading ? (
        <Skeleton lines={4} label={strings.analyticsLoadingLabel} />
      ) : overall && overall.conversationCount === 0 ? (
        <p className="ago-empty">{strings.analyticsEmpty}</p>
      ) : overall ? (
        <>
          <Table caption={strings.analyticsPageDescription} columns={columns} rows={rows} rowKey={(row) => row.key} />

          <h2>{strings.analyticsByOperatorHeading}</h2>
          {operatorRows.length === 0 ? (
            <p className="ago-empty">{strings.analyticsByOperatorEmpty}</p>
          ) : (
            <Table
              caption={strings.analyticsByOperatorHeading}
              columns={operatorColumns}
              rows={operatorRows}
              rowKey={(row) => row.key}
            />
          )}

          <p className="ago-meta">{strings.analyticsTrafficSourceNote}</p>

          <h2>{strings.analyticsByReferrerHeading}</h2>
          {referrerRows.length === 0 ? (
            <p className="ago-empty">{strings.analyticsByReferrerEmpty}</p>
          ) : (
            <Table
              caption={strings.analyticsByReferrerHeading}
              columns={referrerColumns}
              rows={referrerRows}
              rowKey={(row) => row.key}
            />
          )}

          <h2>{strings.analyticsByCampaignHeading}</h2>
          {campaignRows.length === 0 ? (
            <p className="ago-empty">{strings.analyticsByCampaignEmpty}</p>
          ) : (
            <Table
              caption={strings.analyticsByCampaignHeading}
              columns={campaignColumns}
              rows={campaignRows}
              rowKey={(row) => row.key}
            />
          )}
        </>
      ) : null}
    </>
  );
}
