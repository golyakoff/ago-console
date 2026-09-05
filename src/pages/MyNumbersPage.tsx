import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { fetchOwnAnalytics } from "../api/conversationsApi.js";
import { ApiProblemError } from "../api/problemDetails.js";
import type { ConversionBucketDto, OperatorAnalyticsBucketDto, OperatorLoadSummaryDto } from "../realtime/protocol/types.js";
import { PageHead } from "../shell/AppShell.js";
import { Alert } from "../components/Alert.js";
import { Button } from "../components/Button.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { Table } from "../components/Table.js";
import type { TableColumn } from "../components/Table.js";
import { useStrings } from "../i18n/StringsContext.js";
import { formatDateStamp, formatDurationSeconds, parseInstant, resolveTimeZone } from "../time/format.js";

/** The identical `<input type="date">` -> local-day-boundary helpers `OperatorAnalyticsPage`/
 * `ConversionReportPage` already establish, restated here rather than shared - the same "four lines,
 * not worth the coupling" precedent those two files' own doc comments already give for themselves. */
function startOfDayIso(dateInput: string): string {
  return new Date(`${dateInput}T00:00:00`).toISOString();
}

function endOfDayIso(dateInput: string): string {
  return new Date(`${dateInput}T23:59:59.999`).toISOString();
}

interface BucketRow {
  key: string;
  bucket: OperatorAnalyticsBucketDto;
}

interface LoadRow {
  key: string;
  load: OperatorLoadSummaryDto;
}

interface LoadBucketRow {
  key: string;
  bucketLabel: string;
  intervalCount: number;
  replyCount: number;
  averageFirstReplySeconds: number | null;
}

interface ConversionRow {
  key: string;
  bucket: ConversionBucketDto;
}

/**
 * `23-18`: `/analytics/me` - an operator's own row of `/analytics` (`OperatorAnalyticsPage`) and
 * `/analytics/conversion` (`ConversionReportPage`), reached with no `site:configure` grant at all.
 * `docs/design/flows.md` 2.4's own success test: whether an operator can predict these numbers before
 * their manager mentions them - which needs them to see their own figures first, unconditionally.
 *
 * <b>No permission check anywhere on this page, deliberately.</b> Every sibling report page in this
 * group calls `usePermissions().hasPermission("site:configure")` and renders `AccessRefusal` when it
 * is missing; this page has no such call and no such branch, because `GetOwnAnalyticsForOperatorHandler`
 * (`ago-chat`) checks nothing beyond a real operator identity either. Adding a check here that the
 * server does not enforce would be worse than useless - it would teach an operator that their own
 * numbers are somebody else's to grant, which is exactly the failure this item exists to prevent
 * ("a grant would be a thing a tenant could withhold").
 *
 * <b>Standard and additional stay two counts, never one score.</b> `docs/design/decisions.md` §2's
 * naming amendment, restated here: `myNumbersLoadTable` below prints both numbers side by side and
 * never combines them, and neither is labelled "forced" anywhere a person reads it.
 *
 * <b>Three independent "no data yet" states, not one.</b> `bucket` is always present (zero-filled when
 * this operator did nothing), but `load`/`conversion` are each independently `null` when this operator
 * has no assignment interval / no recorded outcome in the range - a real absence, not a zero
 * (`OwnOperatorAnalyticsResponse`'s own remarks, `ago-chat`). Each section renders its own empty
 * sentence rather than one page-wide empty state hiding which half is missing.
 */
export function MyNumbersPage() {
  const { user } = useAuth();
  const strings = useStrings();
  const [timeZone] = useState(() => resolveTimeZone());

  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");

  const [bucket, setBucket] = useState<OperatorAnalyticsBucketDto | null>(null);
  const [load, setLoad] = useState<OperatorLoadSummaryDto | null>(null);
  const [conversion, setConversion] = useState<ConversionBucketDto | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState<string | null>(null);
  const [effectiveTo, setEffectiveTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runReport = useCallback(
    async (range: { from?: string; to?: string }) => {
      const accessToken = user?.access_token;
      if (!accessToken) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetchOwnAnalytics(accessToken, range);
        setBucket(response.bucket);
        setLoad(response.load);
        setConversion(response.conversion);
        setEffectiveFrom(response.from);
        setEffectiveTo(response.to);
      } catch (err) {
        if (err instanceof ApiProblemError && err.code === "Analytics.InvalidRange") {
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

  // No permission to wait on - this loads the server's own default window the moment there is an
  // access token, the same "useful with no interaction" first paint `OperatorAnalyticsPage` gives an
  // owner, given here to every operator instead.
  useEffect(() => {
    void runReport({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.access_token]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void runReport({
      from: fromInput ? startOfDayIso(fromInput) : undefined,
      to: toInput ? endOfDayIso(toInput) : undefined,
    });
  };

  const effectiveFromAt = parseInstant(effectiveFrom);
  const effectiveToAt = parseInstant(effectiveTo);

  const bucketRows: BucketRow[] = bucket ? [{ key: "__own", bucket }] : [];
  const bucketColumns: TableColumn<BucketRow>[] = [
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

  const loadRows: LoadRow[] = load ? [{ key: "__own", load }] : [];
  const loadColumns: TableColumn<LoadRow>[] = [
    { key: "held", header: strings.myNumbersHeldColumn, align: "end", render: (row) => row.load.conversationsHeld },
    {
      key: "standard",
      header: strings.myNumbersStandardColumn,
      align: "end",
      render: (row) => row.load.standardIntervals,
    },
    {
      key: "additional",
      header: strings.myNumbersAdditionalColumn,
      align: "end",
      render: (row) => row.load.additionalIntervals,
    },
  ];

  const loadBucketRows: LoadBucketRow[] = (load?.byLoad ?? []).map((entry) => ({
    key: entry.bucketLabel,
    bucketLabel: entry.bucketLabel,
    intervalCount: entry.intervalCount,
    replyCount: entry.replyCount,
    averageFirstReplySeconds: entry.averageFirstReplySeconds,
  }));
  const loadBucketColumns: TableColumn<LoadBucketRow>[] = [
    { key: "bucketLabel", header: strings.myNumbersLoadBucketColumn, render: (row) => row.bucketLabel },
    { key: "intervalCount", header: strings.myNumbersIntervalsColumn, align: "end", render: (row) => row.intervalCount },
    { key: "replyCount", header: strings.myNumbersRepliesColumn, align: "end", render: (row) => row.replyCount },
    {
      key: "averageFirstReply",
      header: strings.myNumbersAverageFirstReplyColumn,
      align: "end",
      render: (row) =>
        row.averageFirstReplySeconds === null
          ? strings.analyticsNoResponsesValue
          : formatDurationSeconds(row.averageFirstReplySeconds),
    },
  ];

  // `23-16`: the same "never a bare rate" pairing `ConversionReportPage`'s own local
  // `formatRateWithFraction` establishes, restated here rather than shared for the identical
  // "four lines, not worth the coupling" reason that file's own doc comment gives for itself.
  const formatRateWithFraction = (b: ConversionBucketDto): string =>
    b.conversionRate === null
      ? strings.conversionReportNoDataValue
      : `${(b.conversionRate * 100).toFixed(1)}% (${b.convertedCount} ${strings.analyticsFractionOfLabel} ${b.recordedCount})`;

  const conversionRows: ConversionRow[] = conversion ? [{ key: "__own", bucket: conversion }] : [];
  const conversionColumns: TableColumn<ConversionRow>[] = [
    {
      key: "converted",
      header: strings.conversionReportConvertedColumn,
      align: "end",
      render: (row) => row.bucket.convertedCount,
    },
    {
      key: "notConverted",
      header: strings.conversionReportNotConvertedColumn,
      align: "end",
      render: (row) => row.bucket.notConvertedCount,
    },
    {
      key: "followUpNeeded",
      header: strings.conversionReportFollowUpNeededColumn,
      align: "end",
      render: (row) => row.bucket.followUpNeededCount,
    },
    {
      key: "unset",
      header: strings.conversionReportUnsetColumn,
      align: "end",
      render: (row) => row.bucket.unsetCount,
    },
    {
      key: "rate",
      header: strings.conversionReportRateColumn,
      align: "end",
      render: (row) => formatRateWithFraction(row.bucket),
    },
  ];

  const nothingAtAll = bucket !== null && bucket.conversationCount === 0 && load === null && conversion === null;

  return (
    <>
      <PageHead title={strings.navMyNumbers} description={strings.myNumbersPageDescription} />

      <form className="ago-search-form" onSubmit={handleSubmit}>
        <Field label={strings.myNumbersFromFieldLabel}>
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

        <Field label={strings.myNumbersToFieldLabel}>
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
          {strings.myNumbersApplyButton}
        </Button>
      </form>

      {error && <Alert tone="danger">{error}</Alert>}

      {effectiveFromAt && effectiveToAt && (
        <p className="ago-meta">
          {strings.myNumbersRangeLabel} {formatDateStamp(effectiveFromAt, timeZone, strings)} –{" "}
          {formatDateStamp(effectiveToAt, timeZone, strings)}
        </p>
      )}

      {loading && bucket === null ? (
        <Skeleton lines={4} label={strings.myNumbersLoadingLabel} />
      ) : loading ? (
        <Spinner label={strings.myNumbersLoadingLabel} />
      ) : nothingAtAll ? (
        <p className="ago-empty">{strings.myNumbersEmpty}</p>
      ) : bucket ? (
        <>
          <h2>{strings.myNumbersConversationsHeading}</h2>
          <Table
            caption={strings.myNumbersConversationsHeading}
            columns={bucketColumns}
            rows={bucketRows}
            rowKey={(row) => row.key}
          />

          <h2>{strings.myNumbersLoadHeading}</h2>
          {load === null ? (
            <p className="ago-empty">{strings.myNumbersLoadEmpty}</p>
          ) : (
            <>
              <Table caption={strings.myNumbersLoadHeading} columns={loadColumns} rows={loadRows} rowKey={(row) => row.key} />
              <h3>{strings.myNumbersByLoadHeading}</h3>
              <Table
                caption={strings.myNumbersByLoadHeading}
                columns={loadBucketColumns}
                rows={loadBucketRows}
                rowKey={(row) => row.key}
              />
            </>
          )}

          <h2>{strings.myNumbersConversionHeading}</h2>
          {conversion === null ? (
            <p className="ago-empty">{strings.myNumbersConversionEmpty}</p>
          ) : (
            <>
              <Alert tone="info">{strings.conversionReportNotAVerifiedSaleBanner}</Alert>
              <Table
                caption={strings.myNumbersConversionHeading}
                columns={conversionColumns}
                rows={conversionRows}
                rowKey={(row) => row.key}
              />
            </>
          )}
        </>
      ) : null}
    </>
  );
}
