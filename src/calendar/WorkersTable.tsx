import { useMemo } from "react";
import type { ReactNode } from "react";
import type { WorkerDetail } from "../api/calendarApi.js";
import { useStrings } from "../i18n/StringsContext.js";
import { Table, type TableColumn } from "../components/Table.js";
import { Badge } from "../components/Badge.js";
import { formatAbsolute, formatDateStamp, parseInstant, resolveTimeZone } from "../time/format.js";

/**
 * `22-06`/`20-13`: the one table of every worker the tenant has - moved from
 * `ago-calendar-console`'s own `src/components/WorkersTable.tsx`, rewritten against `ago-console`'s
 * closed eleven-component set (`11-05`, `adr/0030`) rather than the source console's bare `<table>` +
 * CSS-class markup. The source console has no such set to reuse - it predates `11-05` and was never
 * meant to converge visually with `ago-console` - so a byte-for-byte port would have brought a second,
 * visually foreign design system into a console this item is merging *into*. `Table`'s own
 * `columns`/`rows`/`rowKey` shape is exactly this screen's data (fixed columns, a flat row array, no
 * grouping) - the case `Table.tsx`'s own doc comment says the component was built for.
 *
 * <b>Extensibility unchanged.</b> Per-row actions still come through `renderRowActions` rather than
 * being hard-coded here, matching the source component's own reasoning verbatim.
 *
 * <b>Dates use `time/format.ts`, not the source console's own unlabelled `formatDateTime`.</b> See
 * `calendarFormat.tsx`'s own header for why that helper was dropped rather than ported - this table's
 * "created"/"updated" columns follow `AdminConversationsPage`'s own precedent instead: a short stamp
 * on screen, the full zone-labelled instant in a `title`.
 */
export interface WorkersTableProps {
  workers: WorkerDetail[];
  renderRowActions: (worker: WorkerDetail) => ReactNode;
}

export function WorkersTable({ workers, renderRowActions }: WorkersTableProps) {
  const strings = useStrings();
  const timeZone = useMemo(() => resolveTimeZone(), []);

  if (workers.length === 0) {
    return <p className="ago-meta">{strings.calendarWorkersEmpty}</p>;
  }

  const columns: TableColumn<WorkerDetail>[] = [
    {
      key: "name",
      header: strings.calendarWorkersColumnName,
      render: (worker) => (
        <>
          {worker.displayName}
          {worker.firstName === "—" && (
            <span title={strings.calendarBackfilledNameTooltip}>
              {" "}
              <Badge tone="danger">{strings.calendarNeedsCorrectionLabel}</Badge>
            </span>
          )}
        </>
      ),
    },
    {
      key: "active",
      header: strings.calendarWorkersColumnActive,
      render: (worker) => (
        <Badge tone={worker.isActive ? "success" : "neutral"}>
          {worker.isActive ? strings.calendarActiveLabel : strings.calendarInactiveLabel}
        </Badge>
      ),
    },
    {
      key: "created",
      header: strings.calendarWorkersColumnCreated,
      render: (worker) => {
        const instant = parseInstant(worker.createdAt);
        return instant === null ? null : (
          <span title={formatAbsolute(instant, timeZone, strings)}>{formatDateStamp(instant, timeZone, strings)}</span>
        );
      },
    },
    {
      key: "updated",
      header: strings.calendarWorkersColumnUpdated,
      render: (worker) => {
        const instant = parseInstant(worker.updatedAt);
        return instant === null ? null : (
          <span title={formatAbsolute(instant, timeZone, strings)}>{formatDateStamp(instant, timeZone, strings)}</span>
        );
      },
    },
    {
      key: "actions",
      header: strings.calendarWorkersColumnActions,
      render: (worker) => renderRowActions(worker),
    },
  ];

  return (
    <Table
      caption={strings.calendarWorkersTitle}
      columns={columns}
      rows={workers}
      rowKey={(worker) => worker.workerId}
    />
  );
}
