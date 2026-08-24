import type { ReactNode } from "react";

export interface TableColumn<TRow> {
  key: string;
  header: string;
  render: (row: TRow) => ReactNode;
  /** Right-aligns and tabular-numbers the cell - counts, not text. */
  align?: "start" | "end";
}

export interface TableProps<TRow> {
  /** A real `<caption>`, not a visually-hidden one. A table in a tool needs to say what it is
   * listing, and the heading above the panel is not programmatically associated with it. */
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
        <caption>{caption}</caption>
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
