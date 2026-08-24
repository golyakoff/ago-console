import { useId, type ReactNode } from "react";

export interface FieldControlProps {
  /** Put this on the control - it is what the `<label>`'s `htmlFor` points at. */
  id: string;
  /** Put this on the control - it points at whichever of the description/error are actually
   * rendered, so a screen reader reads them as part of the control rather than as stray text. */
  "aria-describedby": string | undefined;
  /** Already `true`/`undefined`, so it can be handed straight to `Input`/`Select`/`Textarea`. */
  invalid: boolean | undefined;
}

export interface FieldProps {
  label: string;
  description?: ReactNode;
  /** `null`/absent means valid. When present it is rendered with `role="alert"` - the semantics the
   * pre-`11-05` pages already had on their bare `<p role="alert">`, preserved rather than lost in
   * the retrofit (this item's own accessibility floor). */
  error?: string | null;
  /** Rendered beside the control on the same row - the hex-colour swatch in `WidgetConfigPage` is
   * the case this exists for. */
  adornment?: ReactNode;
  children: (props: FieldControlProps) => ReactNode;
}

/**
 * `11-05`. Label + description + error, wired together correctly once so no page has to remember
 * the `htmlFor`/`id`/`aria-describedby`/`aria-invalid` quartet.
 *
 * A render prop rather than `<Field><Input/></Field>`: the generated id and describedby have to
 * reach the control itself, and the alternatives are worse - cloning children mutates elements the
 * caller wrote, and a context would work but hides the wiring at exactly the place a reviewer wants
 * to see it. Being explicit costs one arrow function per field and makes the connection readable.
 *
 * `useId()` (React 18+) rather than a module-level counter: it is stable across a re-render and
 * unique per instance without a global, which a counter is not once the same page mounts twice.
 */
export function Field({ label, description, error, adornment, children }: FieldProps) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;

  const describedBy = [description ? descriptionId : null, error ? errorId : null].filter(Boolean).join(" ");

  const control = children({
    id,
    "aria-describedby": describedBy.length > 0 ? describedBy : undefined,
    invalid: error ? true : undefined,
  });

  return (
    <div className="ago-field">
      <label className="ago-field__label" htmlFor={id}>
        {label}
      </label>
      {description && (
        <span className="ago-field__description" id={descriptionId}>
          {description}
        </span>
      )}
      {adornment ? (
        <div className="ago-field__control-row">
          {control}
          {adornment}
        </div>
      ) : (
        control
      )}
      {error && (
        <span className="ago-field__error" id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
