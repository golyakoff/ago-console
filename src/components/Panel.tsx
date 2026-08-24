import type { ReactNode } from "react";

export interface PanelProps {
  /** Rendered as an `<h2>`. Omitting it produces a plain surface with no heading - correct for a
   * panel that is only a container (the composer strip), wrong for one that groups content a
   * screen-reader user needs to navigate between. */
  title?: string;
  description?: ReactNode;
  /** Controls that belong to the panel as a whole, rendered opposite the title. */
  actions?: ReactNode;
  /** Flatter, tinted variant for a panel nested inside another panel. */
  quiet?: boolean;
  children: ReactNode;
}

/**
 * `11-05`. The one surface every screen is built out of - a `<section>`, not a `<div>`, so the
 * headings inside it actually structure the document rather than just being large text.
 *
 * `<section>` earns its accessible name from the heading only when the two are associated, which is
 * why the title is rendered inside the section rather than accepted as an already-built node: the
 * caller cannot accidentally put the heading outside the region it names.
 */
export function Panel({ title, description, actions, quiet = false, children }: PanelProps) {
  const classes = ["ago-panel", quiet && "ago-panel--quiet"].filter(Boolean).join(" ");

  return (
    <section className={classes}>
      {(title || actions || description) && (
        <div className="ago-panel__head">
          <div>
            {title && <h2 className="ago-panel__title">{title}</h2>}
            {description && <p className="ago-panel__description">{description}</p>}
          </div>
          {actions && <div className="ago-panel__actions">{actions}</div>}
        </div>
      )}
      <div className="ago-panel__body">{children}</div>
    </section>
  );
}
