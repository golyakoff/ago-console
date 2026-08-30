import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { fetchConversionReport } from "../api/conversationsApi.js";
import { ApiProblemError } from "../api/problemDetails.js";
import type { ConversionBucketDto, ConversionOperatorBucketDto } from "../realtime/protocol/types.js";
import { PageHead } from "../shell/AppShell.js";
import { Alert } from "../components/Alert.js";
import { Button } from "../components/Button.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { Table } from "../components/Table.js";
import type { TableColumn } from "../components/Table.js";
import { useStrings } from "../i18n/StringsContext.js";
import { currentCalendarMonth, last30Days, previousCalendarMonth } from "../time/rangePresets.js";
import { formatDateStamp, parseInstant, resolveTimeZone } from "../time/format.js";

/** The identical `<input type="date">` -> local-day-boundary helpers `OperatorAnalyticsPage` already
 * establishes for `18-08`'s own free-form range - not shared across files for the same "not worth the
 * coupling" reason that file's own doc comment gives for its analogous local `channelLabel`. */
function startOfDayIso(dateInput: string): string {
  return new Date(`${dateInput}T00:00:00`).toISOString();
}

function endOfDayIso(dateInput: string): string {
  return new Date(`${dateInput}T23:59:59.999`).toISOString();
}

interface OperatorRow {
  key: string;
  operatorId: string;
  bucket: ConversionBucketDto;
}

/** `18-09`'s own "no display name exists, so the id itself" shape, reused verbatim - see
 * `OperatorAnalyticsPage`'s identical helper. */
function operatorLabel(operatorId: string): ReactNode {
  return <span className="ago-mono">{operatorId.slice(0, 8)}</span>;
}

/**
 * `18-10`: `/analytics/conversion` - the site owner's own conversion report: how many recorded
 * conversations converted, did not, still need a follow-up, or have no recorded outcome at all, overall
 * and per operator. Gated on `site:configure`, the same permission `OperatorAnalyticsPage` already uses
 * for the identical "site-wide oversight, not an ordinary operator's own view" reasoning
 * (`GetConversionReportForSiteHandler`'s own remarks, `ago-chat`).
 *
 * <b>A separate page from `/analytics`, not a third table on it.</b> `OperatorAnalyticsPage`'s own doc
 * comment already argues this for its own second table (`18-09`'s per-operator breakdown): channel and
 * operator are two cuts of the *same* three numbers (volume, response time, miss rate), so they share a
 * page. Conversion is a genuinely different concept built from data those numbers never touch
 * (`conversations.outcome`, not anything about messages) - bolting it on as a third table would force a
 * reader to work out which of three unrelated ideas a given row belongs to, the same crowding that page's
 * own doc comment already declines to create for a second dimension, let alone a third *subject*.
 *
 * <b>The honesty framing is not optional decoration.</b> This item's own crux: a conversion rate built
 * from operator-reported outcomes is real and useful, and it is not the same claim as "N% of chats
 * resulted in a verified sale." `conversionReportNotAVerifiedSaleBanner` renders unconditionally, above
 * the numbers, every time this page has anything to show - never only in a tooltip or a footnote a
 * reader could miss. `conversionReportUnsetColumn` sits next to the rate for the same reason: a rate
 * computed from four recorded outcomes out of four hundred conversations is a different claim from one
 * computed from four hundred out of four hundred, and hiding the coverage number would let the first case
 * read as confidently as the second.
 *
 * <b>Date-range presets, resolved client-side.</b> `../time/rangePresets.ts` turns "this month"/"last
 * month"/"last 30 days" into concrete `from`/`to` values before this page ever calls the server - see
 * that module's own doc comment for why there is no server-side preset concept. The free-form date
 * fields stay too, exactly as `OperatorAnalyticsPage`'s own pair does, for a range no preset names.
 */
export function ConversionReportPage() {
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const [timeZone] = useState(() => resolveTimeZone());

  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");

  const [overall, setOverall] = useState<ConversionBucketDto | null>(null);
  const [byOperator, setByOperator] = useState<ConversionOperatorBucketDto[]>([]);
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
        const response = await fetchConversionReport(accessToken, range);
        setOverall(response.overall);
        setByOperator(response.byOperator);
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

  // Same "load the server's own default window on first render" shape `OperatorAnalyticsPage` uses -
  // this is a report an owner opens to see something immediately, not a query typed first.
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

  const applyPreset = (preset: { from: string; to: string }) => {
    setFromInput("");
    setToInput("");
    void runReport(preset);
  };

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!allowed) {
    return (
      <>
        <PageHead title={strings.navConversionReport} />
        <Alert tone="danger">{strings.analyticsForbiddenError}</Alert>
        <p>
          <Link to="/">{strings.siteConfigBackToQueue}</Link>
        </p>
      </>
    );
  }

  const effectiveFromAt = parseInstant(effectiveFrom);
  const effectiveToAt = parseInstant(effectiveTo);

  const bucketColumns: TableColumn<{ key: string; label: string; bucket: ConversionBucketDto }>[] = [
    { key: "label", header: "", render: (row) => row.label },
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
      render: (row) =>
        row.bucket.conversionRate === null
          ? strings.conversionReportNoDataValue
          : `${(row.bucket.conversionRate * 100).toFixed(1)}%`,
    },
  ];

  const overallRows = overall ? [{ key: "__overall", label: strings.conversionReportOverallRowLabel, bucket: overall }] : [];

  const operatorRows: OperatorRow[] = byOperator.map((entry) => ({
    key: entry.operatorId,
    operatorId: entry.operatorId,
    bucket: entry.bucket,
  }));

  const operatorColumns: TableColumn<OperatorRow>[] = [
    { key: "operator", header: strings.conversionReportOperatorColumn, render: (row) => operatorLabel(row.operatorId) },
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
      render: (row) =>
        row.bucket.conversionRate === null
          ? strings.conversionReportNoDataValue
          : `${(row.bucket.conversionRate * 100).toFixed(1)}%`,
    },
  ];

  return (
    <>
      <PageHead title={strings.navConversionReport} description={strings.conversionReportPageDescription} />

      {/* Unconditional, above every number - see this component's own doc comment. */}
      <Alert tone="info">{strings.conversionReportNotAVerifiedSaleBanner}</Alert>

      <div className="ago-row">
        <Button type="button" size="sm" variant="secondary" onClick={() => applyPreset(currentCalendarMonth(new Date()))}>
          {strings.conversionReportPresetThisMonth}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => applyPreset(previousCalendarMonth(new Date()))}>
          {strings.conversionReportPresetLastMonth}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => applyPreset(last30Days(new Date()))}>
          {strings.conversionReportPresetLast30Days}
        </Button>
      </div>

      <form className="ago-search-form" onSubmit={handleSubmit}>
        <Field label={strings.conversionReportFromFieldLabel}>
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

        <Field label={strings.conversionReportToFieldLabel}>
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
          {strings.conversionReportApplyButton}
        </Button>
      </form>

      {error && <Alert tone="danger">{error}</Alert>}

      {effectiveFromAt && effectiveToAt && (
        <p className="ago-meta">
          {strings.conversionReportRangeLabel} {formatDateStamp(effectiveFromAt, timeZone)} –{" "}
          {formatDateStamp(effectiveToAt, timeZone)}
        </p>
      )}

      {loading ? (
        <Skeleton lines={4} label={strings.conversionReportLoadingLabel} />
      ) : overall &&
        overall.convertedCount === 0 &&
        overall.notConvertedCount === 0 &&
        overall.followUpNeededCount === 0 &&
        overall.unsetCount === 0 ? (
        <p className="ago-empty">{strings.conversionReportEmpty}</p>
      ) : overall ? (
        <>
          <Table
            caption={strings.conversionReportPageDescription}
            columns={bucketColumns}
            rows={overallRows}
            rowKey={(row) => row.key}
          />

          <h2>{strings.conversionReportByOperatorHeading}</h2>
          {operatorRows.length === 0 ? (
            <p className="ago-empty">{strings.conversionReportByOperatorEmpty}</p>
          ) : (
            <Table
              caption={strings.conversionReportByOperatorHeading}
              columns={operatorColumns}
              rows={operatorRows}
              rowKey={(row) => row.key}
            />
          )}
        </>
      ) : null}
    </>
  );
}
