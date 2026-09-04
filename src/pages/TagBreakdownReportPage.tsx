import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { fetchTagBreakdownReport } from "../api/conversationsApi.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { formatCountComparison, formatRateComparison } from "../analytics/comparison.js";
import type { TagBreakdownBucketDto } from "../realtime/protocol/types.js";
import { PageHead } from "../shell/AppShell.js";
import { AccessRefusal } from "../shell/accessRefusal.js";
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

/** The identical `<input type="date">` -> local-day-boundary helpers `OperatorAnalyticsPage`/
 * `ConversionReportPage` already establish - not shared across files for the same "not worth the
 * coupling" reason those files' own doc comments give for their analogous local helpers. */
function startOfDayIso(dateInput: string): string {
  return new Date(`${dateInput}T00:00:00`).toISOString();
}

function endOfDayIso(dateInput: string): string {
  return new Date(`${dateInput}T23:59:59.999`).toISOString();
}

interface TagRow {
  key: string;
  bucket: TagBreakdownBucketDto;
}

/** `23-16`: a rate is never printed without the fraction it came from - "50.0% (1 of 2)", the same
 * pairing `ConversionReportPage.formatRateWithFraction` establishes for its own two tables.
 * `noDataValue` covers the `null` case unchanged - never a misleading "0%". */
function formatRate(bucket: TagBreakdownBucketDto, noDataValue: string, ofLabel: string): string {
  if (bucket.conversionRate === null) {
    return noDataValue;
  }
  return `${(bucket.conversionRate * 100).toFixed(1)}% (${bucket.convertedCount} ${ofLabel} ${bucket.recordedCount})`;
}

function formatPercentage(percentage: number): string {
  return `${(percentage * 100).toFixed(1)}%`;
}

/**
 * `18-11`: `/analytics/tags` - what these conversations are actually about, by tag: how many
 * conversations each tag was applied to, its own conversion rate (now that `18-10` has landed), and how
 * much of the window is tagged at all. Gated on `site:configure`, the same permission
 * `OperatorAnalyticsPage`/`ConversionReportPage` already use for the identical "site-wide oversight, not
 * an ordinary operator's own view" reasoning (`GetTagBreakdownReportForSiteHandler`'s own remarks,
 * `ago-chat`).
 *
 * <b>A separate page from `/analytics` and `/analytics/conversion`, not a third or fourth table on
 * either.</b> `ConversionReportPage`'s own doc comment already argues this for its own subject
 * (conversion is a different concept from response time/miss rate); the same argument applies here a
 * second time, and more strongly - `OperatorAnalyticsPage` is already large (per-channel, per-operator,
 * per-referrer, per-campaign tables), so a fifth table sliced by tag would force a reader to hunt for
 * which of five unrelated cuts a given row belongs to. `OperatorAnalyticsPage`'s own tables all cut the
 * *same* three numbers (volume, response time, miss rate) by different single-valued dimensions; this
 * report's own dimension is not single-valued at all - a conversation can hold zero, one, or several
 * tags at once, which is a structurally different shape from every table already on that page, and is
 * reason enough on its own for a sibling page even before considering that page's size.
 *
 * <b>The honesty framing is not optional decoration - two distinct facts, both load-bearing.</b>
 * First: the coverage `Alert` (`tagBreakdownCoverageBanner`) renders unconditionally, prominently, next
 * to the breakdown - how much of this window is tagged at all, so a low-coverage breakdown never reads
 * as though it covered every conversation the way a 100%-covered one would (`ITagBreakdownReadStore`'s
 * own remarks, `ago-chat`, are the full reasoning; the same discipline `ConversionReportPage`'s own
 * not-a-verified-sale banner already holds itself to for a different number). Second,
 * `tagBreakdownMultiTagNote` states, next to the table itself, that a conversation with more than one
 * tag counts once per tag it holds, so the table's own conversation-count column will not sum to the
 * coverage figures above it - real evidence for every tag it names, not an arithmetic error a reader
 * should go looking for.
 *
 * <b>Date-range presets, resolved client-side.</b> The identical `../time/rangePresets.ts` shape
 * `ConversionReportPage` already establishes - see that module's own doc comment for why there is no
 * server-side preset concept.
 */
export function TagBreakdownReportPage() {
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const [timeZone] = useState(() => resolveTimeZone());

  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");

  const [totalConversationCount, setTotalConversationCount] = useState<number | null>(null);
  const [taggedConversationCount, setTaggedConversationCount] = useState<number | null>(null);
  const [percentageTagged, setPercentageTagged] = useState<number | null>(null);
  const [previousTotalConversationCount, setPreviousTotalConversationCount] = useState<number | null>(null);
  const [previousTaggedConversationCount, setPreviousTaggedConversationCount] = useState<number | null>(null);
  const [previousPercentageTagged, setPreviousPercentageTagged] = useState<number | null>(null);
  const [byTag, setByTag] = useState<TagBreakdownBucketDto[]>([]);
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
        const response = await fetchTagBreakdownReport(accessToken, range);
        setTotalConversationCount(response.totalConversationCount);
        setTaggedConversationCount(response.taggedConversationCount);
        setPercentageTagged(response.percentageTagged);
        setPreviousTotalConversationCount(response.previousTotalConversationCount);
        setPreviousTaggedConversationCount(response.previousTaggedConversationCount);
        setPreviousPercentageTagged(response.previousPercentageTagged);
        setByTag(response.byTag);
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

  // Same "load the server's own default window on first render" shape `OperatorAnalyticsPage`/
  // `ConversionReportPage` use - this is a report a site owner opens to see something immediately, not
  // a query typed first.
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
    // `23-24`: shared `AccessRefusal`, replacing this screen's own copy of the block.
    return (
      <AccessRefusal title={strings.navTagBreakdown} message={strings.analyticsForbiddenError} strings={strings} />
    );
  }

  const effectiveFromAt = parseInstant(effectiveFrom);
  const effectiveToAt = parseInstant(effectiveTo);

  const tagRows: TagRow[] = byTag.map((bucket) => ({ key: bucket.tagId, bucket }));

  const tagColumns: TableColumn<TagRow>[] = [
    { key: "tag", header: strings.tagBreakdownTagColumn, render: (row) => row.bucket.tagName },
    {
      key: "count",
      header: strings.tagBreakdownConversationCountColumn,
      align: "end",
      render: (row) => row.bucket.conversationCount,
    },
    {
      key: "converted",
      header: strings.tagBreakdownConvertedColumn,
      align: "end",
      render: (row) => row.bucket.convertedCount,
    },
    {
      key: "notConverted",
      header: strings.tagBreakdownNotConvertedColumn,
      align: "end",
      render: (row) => row.bucket.notConvertedCount,
    },
    {
      key: "rate",
      header: strings.tagBreakdownRateColumn,
      align: "end",
      render: (row) => formatRate(row.bucket, strings.tagBreakdownNoDataValue, strings.analyticsFractionOfLabel),
    },
  ];

  return (
    <>
      <PageHead title={strings.navTagBreakdown} description={strings.tagBreakdownPageDescription} />

      <div className="ago-row">
        <Button type="button" size="sm" variant="secondary" onClick={() => applyPreset(currentCalendarMonth(new Date()))}>
          {strings.tagBreakdownPresetThisMonth}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => applyPreset(previousCalendarMonth(new Date()))}>
          {strings.tagBreakdownPresetLastMonth}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => applyPreset(last30Days(new Date()))}>
          {strings.tagBreakdownPresetLast30Days}
        </Button>
      </div>

      <form className="ago-search-form" onSubmit={handleSubmit}>
        <Field label={strings.tagBreakdownFromFieldLabel}>
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

        <Field label={strings.tagBreakdownToFieldLabel}>
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
          {strings.tagBreakdownApplyButton}
        </Button>
      </form>

      {error && <Alert tone="danger">{error}</Alert>}

      {effectiveFromAt && effectiveToAt && (
        <p className="ago-meta">
          {strings.tagBreakdownRangeLabel} {formatDateStamp(effectiveFromAt, timeZone, strings)} –{" "}
          {formatDateStamp(effectiveToAt, timeZone, strings)}
        </p>
      )}

      {loading ? (
        <Skeleton lines={4} label={strings.tagBreakdownLoadingLabel} />
      ) : totalConversationCount !== null && totalConversationCount === 0 ? (
        <p className="ago-empty">{strings.tagBreakdownEmpty}</p>
      ) : totalConversationCount !== null && taggedConversationCount !== null ? (
        <>
          {/* The coverage honesty check - unconditional, above the breakdown table, per this
              component's own doc comment. Never hidden or de-emphasised when the percentage is low. */}
          <Alert tone="info">
            {percentageTagged === null
              ? strings.tagBreakdownCoverageUnknown
              : `${strings.tagBreakdownCoverageBanner} ${taggedConversationCount} / ${totalConversationCount} (${formatPercentage(percentageTagged)})`}
          </Alert>

          {/* `23-16`: dynamics, relative and absolute together, against the preceding window of equal
              length. */}
          {previousTotalConversationCount !== null && previousTaggedConversationCount !== null && (
            <p className="ago-meta">
              {strings.tagBreakdownCoverageBanner}: {formatCountComparison(taggedConversationCount, previousTaggedConversationCount, strings)}
              {" · "}
              {strings.tagBreakdownRateColumn}: {formatRateComparison(percentageTagged, previousPercentageTagged, strings, strings.tagBreakdownNoDataValue)}
            </p>
          )}

          {byTag.length === 0 ? (
            <p className="ago-empty">{strings.tagBreakdownByTagEmpty}</p>
          ) : (
            <>
              {/* The multi-tag counting-rule honesty check - unconditional, next to the table itself,
                  per this component's own doc comment. */}
              <p className="ago-meta">{strings.tagBreakdownMultiTagNote}</p>
              <Table
                caption={strings.tagBreakdownPageDescription}
                columns={tagColumns}
                rows={tagRows}
                rowKey={(row) => row.key}
              />
            </>
          )}
        </>
      ) : null}
    </>
  );
}
