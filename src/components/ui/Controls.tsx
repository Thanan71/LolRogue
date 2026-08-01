import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={`ui-button ui-button--${variant} ${className}`.trim()}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="ui-field">
      <div className="ui-field__label">{label}</div>
      {children}
      {hint && <div className="ui-field__hint">{hint}</div>}
      {error && (
        <div className="ui-field__error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ui-input ${props.className ?? ''}`.trim()} {...props} />;
}

export function Tabs({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ui-tabs" role="tablist" aria-label={label}>
      {children}
    </div>
  );
}

export function Tab({
  selected,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return <button type="button" role="tab" aria-selected={selected} className="ui-tab" {...props} />;
}
