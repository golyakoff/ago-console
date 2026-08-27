import type { ReactNode } from "react";

export interface TableColumn<TRow> {
  key: string;
  header: string;
  render: (row: TRow) => ReactNode;
  /** Right-aligns and tabular-numbers the cell - counts, not text. */
  align?: "start" | "end";
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
export function Table<TRow>({ caption, columns, rows, rowKey }: TableProps<TRow>) {
  return (
    <div className="ago-table-scroll">
      <table className="ago-table">
        <caption className="ago-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={column.align === "end" ? "ago-table__cell--end" : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key} className={column.align === "end" ? "ago-table__cell--end" : undefined}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
