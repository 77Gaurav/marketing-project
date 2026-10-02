import type {
  ReactNode,
  TextareaHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
} from 'react';

/**
 * Form control primitives.
 *
 * Hand-rolled rather than pulled from a component library, for the same reason the rest of the UI is:
 * the only things a form needs from a design system are the token names and the accessibility
 * contract, and both already exist in `app/globals.css`.
 *
 * `Field` is a render-prop wrapper so the label, the hint and the error message own the ids and the
 * control cannot forget to reference them. A control wired to its own error text by hand is exactly
 * the kind of thing that is correct on the day it is written and broken after the first refactor.
 */

// Written out in full because Tailwind tree-shakes @layer components against literal source
// matches — a `border-${state}` template string would be purged from the build.
const CONTROL_BASE =
  'w-full rounded-md border bg-paper-raised px-4 text-[length:var(--type-body)] text-ink placeholder:text-ink-muted transition-colors duration-fast ease-out disabled:cursor-not-allowed disabled:opacity-60';

const CONTROL_RESTING = `${CONTROL_BASE} border-line-strong hover:border-ink/25`;
const CONTROL_INVALID = `${CONTROL_BASE} border-state-error`;

interface FieldRenderProps {
  /** Pass to the control's aria-describedby. Undefined when there is nothing to describe. */
  describedBy: string | undefined;
  /** Pass to the control's aria-invalid. */
  invalid: boolean;
}

interface FieldProps {
  id: string;
  label: string;
  /** Rendered under the control and announced with it. */
  hint?: string;
  error?: string;
  /**
   * Marks the field as optional in the visible label. WCAG 3.3.2 — "required" is the default state,
   * so anything that is *not* required has to say so.
   */
  optional?: boolean;
  children: (props: FieldRenderProps) => ReactNode;
}

export function Field({ id, label, hint, error, optional = false, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label htmlFor={id} className="text-[length:var(--type-small)] font-semibold text-ink">
          {label}
        </label>
        {optional && (
          <span className="text-[length:var(--type-small)] text-ink-muted">Optional</span>
        )}
      </div>

      <div className="mt-2">{children({ describedBy, invalid: Boolean(error) })}</div>

      {hint && (
        <p id={hintId} className="mt-2 text-[length:var(--type-small)] text-ink-muted">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} className="mt-2 text-[length:var(--type-small)] text-state-error">
          {error}
        </p>
      )}
    </div>
  );
}

export type TextInputProps = FieldRenderProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'aria-describedby'>;

export function TextInput({ describedBy, invalid, ...props }: TextInputProps) {
  return (
    <input
      {...props}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className={`${invalid ? CONTROL_INVALID : CONTROL_RESTING} min-h-[48px]`}
    />
  );
}

export type TextAreaProps = FieldRenderProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className' | 'aria-describedby'>;

export function TextArea({ describedBy, invalid, rows = 4, ...props }: TextAreaProps) {
  return (
    <textarea
      {...props}
      rows={rows}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className={`${invalid ? CONTROL_INVALID : CONTROL_RESTING} resize-y py-3 leading-relaxed`}
    />
  );
}

export type SelectProps = FieldRenderProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'aria-describedby'>;

/**
 * Native `<select>` with the same control styling as the text inputs.
 *
 * Native rather than a custom listbox on purpose: it gets the platform picker on a phone, keyboard
 * navigation, and the right announcement for free, all of which a hand-rolled version has to
 * re-earn. The one thing it cannot do is show a chevron that inherits the current colour, so it is
 * drawn with a mask-image over a background colour instead.
 */
export function Select({ describedBy, invalid, children, ...props }: SelectProps) {
  return (
    <select
      {...props}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className={`${invalid ? CONTROL_INVALID : CONTROL_RESTING} min-h-[48px] cursor-pointer appearance-none bg-[length:1.1rem] bg-[right_1rem_center] bg-no-repeat pr-11`}
      style={{
        // Inline because Tailwind cannot express a mask-image with a currentColor-derived colour in
        // a way that survives the build's purge.
        maskImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='black'><path d='M5.5 7.5 10 12l4.5-4.5'/></svg>\")",
        maskPosition: 'right 0.9rem center',
        maskRepeat: 'no-repeat',
        maskSize: '1.1rem',
      }}
    >
      {children}
    </select>
  );
}