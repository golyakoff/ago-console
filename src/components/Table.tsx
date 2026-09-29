import { Fragment, type ReactNode } from "react";
import { Button } from "./Button.js";

export interface TableColumn<TRow> {
  key: string;
  header: string;
  render: (row: TRow) => ReactNode;
  /** Right-aligns and tabular-numbers the cell - counts, not text. */
  align?: "start" | "end";
}

/**
 * `26-272` (T2): a row's own inline detail, opened in place rather than in a modal or a separate
 * panel - see `Table`'s own doc comment for why this is the moment the "if a screen ever needs a
 * colspan" widening it already named turned out to be. Optional, so the other screens that pass a
 * plain `columns`/`rows` pair are unaffected.
 */
export interface TableExpandable<TRow> {
  isExpanded: (row: TRow) => boolean;
  onToggle: (row: TRow) => void;
  renderDetail: (row: TRow) => ReactNode;
  /** The toggle's own accessible name, open and closed - distinct text rather than relying on
   * `aria-expanded` alone to carry the state, the same "a real accessible name, not just an ARIA
   * state" rule every other control in this console follows. */
  toggleLabel: (row: TRow, expanded: boolean) => string;
  /** The toggle column's own header - visually hidden (the column carries no visible label, only a
   * per-row button), but still a real `<th>` a screen-reader's table navigation can announce. */
  columnHeader: string;
}

export interface TableProps<TRow> {
  /** A real `<caption>`, kept in the DOM for assistive tech even though it renders visually hidden.
   * `11-05` originally rendered it on screen too, because the heading above the panel was not
   * programmatically associated with the table. That reasoning still holds - a caption is still the
   * only way a screen-reader user gets "what am I listing" for this table specifically - but showing
   * it sighted users as well stacked a third on-screen restatement of "every conversation for this
   * site" on top of the page's own heading and description. One visible heading now carries that for
   * sighted readers; the caption still carries it for everyone else. */
  caption: string;
  columns: TableColumn<TRow>[];
  rows: TRow[];
  rowKey: (row: TRow) => string;
  /** `26-272` (T2): opt-in row-expand - see `TableExpandable`'s own doc comment. */
  expandable?: TableExpandable<TRow>;
}

/**
 * `11-05`. Data-driven rather than compositional (`<Table><Thead>…`).
 *
 * The console has exactly one table (`AdminConversationsPage`'s site-wide conversation list) and the
 * screens `12-03`/`13-04` will add are the same shape: fixed columns, a flat row array, no grouping,
 * no sorting, no virtualisation. A columns/rows signature makes that case a five-line call and makes
 * it structurally impossible to emit a `<td>` count that disagrees with the `<th>` count - which is
 * the actual bug a compositional table lets through. If a screen ever needs a colspan or a footer,
 * that is the moment to widen this, not before.
 */
export function Table<TRow>({ caption, columns, rows, rowKey, expandable }: TableProps<TRow>) {
  return (
    <div className="ago-table-scroll">
      <table className="ago-table">
        <caption className="ago-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {expandable && (
              <th scope="col" className="ago-visually-hidden">
                {expandable.columnHeader}
              </th>
            )}
            {columns.map((column) => (
              <th key={column.key} scope="col" className={column.align === "end" ? "ago-table__cell--end" : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const expanded = expandable?.isExpanded(row) ?? false;
            const detailId = `${key}-detail`;

            return (
              <Fragment key={key}>
                <tr>
                  {expandable && (
                    <td>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-expanded={expanded}
                        aria-controls={detailId}
                        onClick={() => expandable.onToggle(row)}
                      >
                        {expandable.toggleLabel(row, expanded)}
                      </Button>
                    </td>
                  )}
                  {columns.map((column) => (
                    <td key={column.key} className={column.align === "end" ? "ago-table__cell--end" : undefined}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
                {expandable && expanded && (
                  <tr id={detailId} className="ago-table__detail-row">
                    <td colSpan={columns.length + 1}>{expandable.renderDetail(row)}</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
