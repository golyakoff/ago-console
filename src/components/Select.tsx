import type { ReactNode, SelectHTMLAttributes } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  children: ReactNode;
}

/**
 * `11-05`. A styled native `<select>`, not a re-implemented listbox.
 *
 * `appearance: none` plus a drawn chevron is as far as this goes; the option list itself stays the
 * platform's own popup. Re-implementing it would mean owning keyboard type-ahead, virtualisation,
 * touch behaviour and the mobile picker - which is precisely the "hand-rolling is worse" case
 * `adr/0030` names as the boundary where a component library would have won. It is worth noting
 * that this project has exactly two selects, both on `WidgetConfigPage` and both two-option closed
 * sets (launcher position, `11-01`; widget language, `11-10`), so nothing here needed the features a
 * real combobox would bring.
 */
export function Select({ invalid, className, children, ...rest }: SelectProps) {
  const classes = ["ago-control", "ago-control--select", className].filter(Boolean).join(" ");

  return (
    <select className={classes} aria-invalid={invalid ? true : undefined} {...rest}>
      {children}
    </select>
  );
}
